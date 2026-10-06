// 強さの釣り合いのシミュレーション（v4: 5次転職・Lv100〜200 と、比べるための第1ワールド Lv60〜100）
//  node tools/sim_balance.mjs            … 表を Markdown で出す
//  node tools/sim_balance.mjs --json     … 数値を JSON で出す
// tests/balance_v4.mjs もこのファイルの関数を使う（調整の結果が保たれているかを確かめる）。
//
// 仮定（docs/BALANCE_V4.md にも書く）
//  - 職: その Lv で就ける一番上の段階（Lv100 = 4次になったばかり・Lv120 = 5次になったばかり）
//  - AP: Lv1 からの 5/Lv を 主ステ 80%・副ステ 20%（ルナ dex/luk・ジン str/dex・ハッカー int/luk）
//  - SP: 段階ごとのプール（転職で 5 ＋ その段階にいた Lv × 3）。攻撃スキル（威力の大きい順）→ パッシブ → 画面全体攻撃 → バフ・召喚 → 移動 の順に上げる
//  - 装備: 部位ごとに「必要Lv ≦ 自分の Lv」で一番 Lv の高い物（第1ワールドはふつうの物＝神話級・qset・見た目専用を除く、
//          Lv100 以上は W2_GEAR から）。武器は攻撃力が一番高くなる種類（銃・近接・杖）。★強化・潜在・PET・図鑑・実績は無し（素の強さ）
//  - バフ: CT の短いバフ（2次のバフ・ブースター）は常に。ハイパー・覚醒・通常攻撃強化・フル・デプロイは「持続 ÷ CT」の割合で平均
//  - 火力（1体あたり）: スキルの「モーションの長さ」で時間を取り合う。1 秒あたりのダメージが大きいスキルから、CT の許す回数だけ使い、
//          余った時間は通常攻撃（通常攻撃強化の追撃・ファイナルアタック込み）。召喚獣は別に毎秒（同時 3 体まで、強い順）。
//          画面全体攻撃は CT ごとに 1 回。会心は期待値（1 + 会心率 ×（会心ダメ − 1））。敵の防御は calcDamage と同じ式
//  - 敵: そのレベルのふつうの敵（第2ワールドは w2Hp / w2Def、第1ワールドは hpAt / defAt）と、強い敵（HP×1.6・防御×1.5）
//  - ボス: その地域のボスを、ボスの Lv と同じ Lv のキャラで。当てられる時間を 75% とする（移動・ボスの技を避ける時間）
import { newState, computeStats } from '../src/systems/progression.js';
import { SKILLS } from '../src/data/skills.js';
import { JOBS, JOB_TIERS, JOB_BRANCHES, jobLineage } from '../src/data/jobs.js';
import { ITEMS, W2_GEAR, canWearGender } from '../src/data/items.js';
import { ENEMIES, hpAt, atkAt, defAt, w2Hp, w2Def, w2AtkK } from '../src/data/enemies.js';
import { expToNext } from '../src/data/balance.js';
import { skillMotionOf } from '../src/data/skillMotions.js';
import { MAX_SUMMONS } from '../src/systems/summons.js';

export const BRANCHES = Object.keys(JOB_BRANCHES);
export const W1_LEVELS = [60, 70, 80, 90, 99];
export const W2_LEVELS = [100, 120, 150, 180, 200];
const MAIN = { luna: ['dex', 'luk'], jin: ['str', 'dex'], hacker: ['int', 'luk'] };
const BOSS_UPTIME = 0.75;
const ATTACK_KINDS = new Set(['melee', 'projectile', 'aoe', 'dash']);

// ------------------------------------------------------------ キャラを作る
function jobAt(branch, L) {
  let tier = 0;
  for (let t = 1; t < JOB_TIERS.length; t++) if (L >= JOB_TIERS[t]) tier = t;
  const job = Object.values(JOBS).find((j) => j.branch === branch && j.tier === tier);
  return job;
}

/** 部位ごとの装備候補（ふつうの物） */
const W2_IDS = new Set(Object.values(W2_GEAR).flat());
function gearCandidates(L, gender) {
  return Object.values(ITEMS).filter((it) => it.type === 'equip' && it.slot && it.slot !== 'pet' && it.reqLevel <= L &&
    !it.id.startsWith('qset_') && !it.cosmetic && canWearGender(it, gender) &&
    (W2_IDS.has(it.id) || (!it.world && it.rarity !== 'mythic')) && (L < 100 || W2_IDS.has(it.id) || it.reqLevel < 100));
}
const RAR = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

function pickGear(st) {
  const L = st.level;
  const cands = gearCandidates(L, st.gender);
  const eq = { hat: null, top: null, bottom: null, shoes: null, accessory: null, weapon: null, pet: null };
  for (const slot of ['hat', 'top', 'bottom', 'shoes', 'accessory']) {
    const c = cands.filter((it) => it.slot === slot).sort((a, b) => (b.reqLevel - a.reqLevel) || (RAR[b.rarity] - RAR[a.rarity]))[0];
    eq[slot] = c ? c.id : null;
  }
  st.equipped = eq;
  // 武器: 攻撃力が一番高くなる物
  let best = null, bestAtk = -1;
  for (const w of cands.filter((it) => it.slot === 'weapon')) {
    st.equipped.weapon = w.id;
    const a = computeStats(st, []).atk;
    if (a > bestAtk || (a === bestAtk && w.reqLevel > (ITEMS[best]?.reqLevel || 0))) { bestAtk = a; best = w.id; }
  }
  st.equipped.weapon = best;
  st.equippedInst = {};
}

function allocSp(st, lineage, L) {
  st.skills = { ...st.skills };
  for (let i = 0; i < lineage.length; i++) {
    const j = lineage[i];
    if (j.tier < 1) continue;
    const next = lineage[i + 1] ? lineage[i + 1].reqLevel : L;
    let pool = (j.sp || 0) + 3 * Math.max(0, Math.min(L, next) - j.reqLevel) + (j.tier === 1 ? 27 : 0);
    const sks = j.skills.map((id) => SKILLS[id]).filter(Boolean);
    for (const s of sks) st.skills[s.id] = 1;
    // 攻撃（画面全体攻撃以外）→ パッシブ → 画面全体攻撃 → バフ・召喚 → 移動
    const rank = (s) => (s.screen ? 1.5 : ATTACK_KINDS.has(s.kind) ? 0 : s.kind === 'passive' && !s.enhances ? 1 : s.kind === 'buff' || s.kind === 'summon' ? 2 : 3);
    const power = (s) => (s.mult ? s.mult(s.maxLevel) * Math.max(1, s.hits || 1) : 0);
    const order = [...sks].sort((a, b) => rank(a) - rank(b) || power(b) - power(a));
    for (const s of order) {
      const add = Math.min(pool, s.maxLevel - st.skills[s.id]);
      st.skills[s.id] += add; pool -= add;
    }
  }
}

/** makeChar(branch, L) → {state, job, lineage, skills:[{sk, lv}]} */
export function makeChar(branch, L) {
  const hero = JOB_BRANCHES[branch].hero;
  const st = newState(hero);
  st.level = L;
  const job = jobAt(branch, L);
  const lineage = jobLineage(job.id);
  st.job = { id: job.id, tier: job.tier, history: lineage.filter((j) => j.tier > 0).map((j) => ({ id: j.id, tier: j.tier, from: j.from, level: j.reqLevel, t: 0 })) };
  const ap = 5 * (L - 1);
  const [m1, m2] = MAIN[hero];
  st.stats = { ...st.stats };
  st.stats[m1] += Math.round(ap * 0.8);
  st.stats[m2] += ap - Math.round(ap * 0.8);
  allocSp(st, lineage, L);
  pickGear(st);
  return { state: st, job, lineage };
}

// ------------------------------------------------------------ バフ
function buffsOf(state, mode) {
  // mode: 'perm'（常にかかる物だけ）| 'avg'（長い CT の物は持続÷CT の割合）
  const out = [];
  for (const [id, lv] of Object.entries(state.skills)) {
    const s = SKILLS[id];
    if (!s || !lv || typeof s.buff !== 'function') continue;
    if (s.kind !== 'buff' && s.kind !== 'summon') continue;
    const b = s.buff(lv);
    const cd = s.cooldown(lv) || 0;
    const up = cd <= 60 ? 1 : Math.min(1, (b.duration || 0) / cd);
    if (mode === 'perm' && up < 1) continue;
    const x = { id, empower: b.empower ? { ...b.empower, uptime: up } : null };
    for (const k of ['atkPct', 'speedPct', 'defPct', 'critAdd', 'luckAdd', 'attackSpeedPct']) if (b[k]) x[k] = b[k] * up;
    out.push(x);
  }
  return out;
}

// ------------------------------------------------------------ ダメージ
export const defFactor = (def) => 100 / (100 + Math.max(0, def) * 1.5);
const critF = (s) => 1 + s.crit * (s.critDmg - 1);

function finalAttack(state) {
  let best = null;
  for (const [id, lv] of Object.entries(state.skills)) {
    const s = SKILLS[id];
    if (!s || !lv || typeof s.finalAttack !== 'function') continue;
    const fa = s.finalAttack(lv);
    if (!best || fa.chance * fa.mult > best.chance * best.mult) best = fa;
  }
  return best ? best.chance * best.mult : 0;
}

/** 1 回の使用で 1 体に入るダメージの倍率（atk 倍。会心・防御込み）と、FA の回数 */
function perUse(sk, lv, enemy, boss) {
  const mult = sk.mult(lv);
  const hits = Math.max(1, sk.hits || 1);
  if (sk.kind === 'projectile') {
    const n = sk.proj?.count || 1;
    const cnt = boss ? n : Math.min(n, 3 + Math.max(0, n - 3) * 0.4);
    return { m: mult * hits * cnt * defFactor(enemy.def), fa: cnt };
  }
  return { m: mult * hits * defFactor(enemy.def), fa: 1 };
}

/**
 * dpsOf(char, enemy, opts) → 1 体への 1 秒あたりのダメージ（atk 込みの実数）と内訳
 *  opts: {boss: bool, mode: 'perm'|'avg', ult: bool（画面全体攻撃を CT ごとに使う）}
 */
export function dpsOf(ch, enemy, opts = {}) {
  const st = ch.state;
  const buffs = buffsOf(st, opts.mode || 'perm');
  const s = computeStats(st, buffs);
  const cf = critF(s);
  const df = defFactor(enemy.def);
  const fa = finalAttack(st) * df; // FA 1 回の期待値（atk 倍・会心は下で掛ける）
  const opt = [];
  let ult = null;
  for (const [id, lv] of Object.entries(st.skills)) {
    const sk = SKILLS[id];
    if (!sk || !lv || !ATTACK_KINDS.has(sk.kind) || !sk.mult) continue;
    const mo = skillMotionOf(sk, st.heroId);
    const dur = Math.max(0.3, mo?.duration || 0.5);
    const u = perUse(sk, lv, enemy, opts.boss);
    const dmg = (u.m + u.fa * fa) * s.atk * cf;
    const cd = sk.cooldown(lv);
    if (sk.screen) { ult = { id, dmg, cd, dur: dur + (sk.ult?.delay ?? 1) * 0.5, lv }; continue; }
    opt.push({ id, dmg, cd, dur, rate: dmg / dur });
  }
  // 通常攻撃（＋通常攻撃強化・FA）
  const emp = buffs.find((b) => b.empower)?.empower || null;
  const wt = s.weaponType;
  const basicMult = (wt === 'magic' ? 1.1 : 1) * df;
  // 通常攻撃強化の追撃は empower.interval 秒に 1 回まで
  const empPerSec = emp ? Math.min(s.attackSpeed, emp.interval > 0 ? 1 / emp.interval : Infinity) : 0;
  const basicPer = (basicMult + fa) * s.atk * cf;
  const empDps = emp ? emp.mult * emp.hits * df * emp.uptime * empPerSec * s.atk * cf : 0;
  const basicRate = basicPer * s.attackSpeed + empDps;
  let budget = 1;
  let dps = 0;
  const used = [];
  if (opts.ult && ult) { budget -= ult.dur / ult.cd; dps += ult.dmg / ult.cd; used.push({ id: ult.id, share: ult.dur / ult.cd, dps: ult.dmg / ult.cd }); }
  const cands = [...opt, { id: 'basic', dmg: basicPer, cd: 0, dur: 1 / s.attackSpeed, rate: basicRate }].sort((a, b) => b.rate - a.rate);
  for (const c of cands) {
    if (budget <= 1e-9) break;
    const maxShare = c.cd > 0 ? Math.min(1, c.dur / Math.max(c.cd, c.dur)) : 1;
    const share = Math.min(budget, maxShare);
    budget -= share;
    dps += c.rate * share;
    used.push({ id: c.id, share, dps: c.rate * share });
  }
  // 召喚獣（同時 MAX_SUMMONS 体・強い順）
  const sums = [];
  for (const [id, lv] of Object.entries(st.skills)) {
    const sk = SKILLS[id];
    if (!sk || !lv || sk.kind !== 'summon' || !sk.summon) continue;
    const sm = sk.summon;
    const per = sm.attack === 'bolt' ? (sm.type === 'squadron' ? sm.count || 1 : sm.burst || 1) : 1;
    const dur = typeof sm.dur === 'function' ? sm.dur(lv) : 30;
    const cd = sk.cooldown(lv);
    const up = Math.min(1, dur / Math.max(cd, 1));
    // bolt（弾）は FA も出る
    const faN = sm.attack === 'bolt' ? per : 0;
    const d = ((sk.mult(lv) * Math.max(1, sk.hits || 1) * per) * df + faN * fa) * s.atk * cf / Math.max(0.2, sm.interval || 1.2) * up;
    sums.push({ id, dps: d });
  }
  sums.sort((a, b) => b.dps - a.dps);
  const summonDps = sums.slice(0, MAX_SUMMONS).reduce((a, x) => a + x.dps, 0);
  return { dps: dps + summonDps, skillDps: dps, summonDps, used, stats: s, ult, opt, basicRate, summons: sums.slice(0, MAX_SUMMONS) };
}

// ------------------------------------------------------------ 敵
export function normalEnemy(L, world = L >= 100 ? 2 : 1, elite = false) {
  const hm = elite ? 1.6 : 1, dm = elite ? 1.5 : 1;
  if (world === 2) return { level: L, hp: Math.round(w2Hp(L) * hm), def: Math.round(w2Def(L) * dm), atk: Math.round(atkAt(L) * w2AtkK(L)) };
  return { level: L, hp: hpAt(L, hm), def: defAt(L, dm), atk: atkAt(L) };
}

/** 主力スキル（その職の段階の一番強い多段攻撃 = 5次なら 5次の主力）。無ければ全攻撃スキルで一番強い物 */
export function mainSkillOf(ch) {
  const st = ch.state;
  const mine = ch.job.skills.map((id) => SKILLS[id]).filter((s) => s && ATTACK_KINDS.has(s.kind) && !s.screen && s.kind !== 'dash');
  const all = Object.keys(st.skills).map((id) => SKILLS[id]).filter((s) => s && ATTACK_KINDS.has(s.kind) && !s.screen && s.kind !== 'dash');
  const pool = mine.length ? mine : all;
  const e = normalEnemy(st.level);
  return pool.sort((a, b) => perUse(b, st.skills[b.id], e).m - perUse(a, st.skills[a.id], e).m)[0];
}

/** 1 回の使用のダメージ（期待値、1 体） */
export function useDamage(ch, sk, enemy, mode = 'perm', boss = false) {
  const st = ch.state;
  const s = computeStats(st, buffsOf(st, mode));
  const u = perUse(sk, st.skills[sk.id] || 1, enemy, boss);
  return (u.m + u.fa * finalAttack(st) * defFactor(enemy.def)) * s.atk * critF(s);
}

/** 敵から受けるダメージ（期待値。damagePlayer と同じ式） */
export function takenOf(ch, atk) {
  const s = computeStats(ch.state, buffsOf(ch.state, 'perm'));
  const d = atk * (100 / (100 + s.def)) * (1 - s.dmgReduce);
  return { dmg: d, pct: d / s.maxHp, hitsToDie: Math.ceil(s.maxHp / Math.max(1, d)), maxHp: s.maxHp, def: s.def };
}

// ------------------------------------------------------------ 経験値
function normalEnemiesNear(L, world) {
  const list = Object.values(ENEMIES).filter((e) => !e.boss && !e.civilian && !e.isCop && !e.night && (e.habitats || []).length && ((e.world === 2) === (world === 2)));
  let near = list.filter((e) => Math.abs(e.level - L) <= 5);
  if (!near.length) near = list.sort((a, b) => Math.abs(a.level - L) - Math.abs(b.level - L)).slice(0, 3);
  return near;
}
export function killsPerLevelAt(L) {
  const world = L >= 100 ? 2 : 1;
  const near = normalEnemiesNear(L, world);
  const exp = near.reduce((a, e) => a + e.exp, 0) / near.length;
  return expToNext(L) / exp;
}

// ------------------------------------------------------------ 表
const BOSSES_W1 = () => Object.values(ENEMIES).filter((e) => e.boss && !e.world && !e.phaseOf && e.level >= 55 && e.level <= 100 && (e.habitats || []).length);
const BOSSES_W2 = () => Object.values(ENEMIES).filter((e) => e.boss && e.world === 2 && !e.phaseOf);

export function rowFor(branch, L) {
  const ch = makeChar(branch, L);
  const e = normalEnemy(L), el = normalEnemy(L, undefined, true);
  const main = mainSkillOf(ch);
  const d1 = useDamage(ch, main, e);
  const dd = dpsOf(ch, e, { mode: 'perm' });
  const de = dpsOf(ch, el, { mode: 'perm' });
  const r = {
    branch, level: L, job: ch.job.id, atk: dd.stats.atk, maxHp: dd.stats.maxHp,
    main: main.id, mainLv: ch.state.skills[main.id],
    hitsMain: e.hp / d1, hitsMainElite: el.hp / useDamage(ch, main, el),
    ttk: e.hp / dd.dps, ttkElite: el.hp / de.dps, dps: dd.dps, summonDps: dd.summonDps,
    taken: takenOf(ch, e.atk), takenShot: takenOf(ch, e.atk * 0.55),
  };
  if (dd.ult) {
    const u = SKILLS[dd.ult.id];
    const uDmg = useDamage(ch, u, e);
    r.ult = u.id; r.ultLv = ch.state.skills[u.id];
    r.ultSweep = uDmg / e.hp;          // 1 回で通常の敵の HP の何倍（1 以上 = 一掃）
    r.ultSweepElite = useDamage(ch, u, el) / el.hp;
    r.ultSec = uDmg / dd.dps;          // 1 体への威力が、ふだんの火力の何秒分か
    r.ultCd = u.cooldown(ch.state.skills[u.id]);
  }
  return r;
}

export function bossRow(boss, branch) {
  const L = Math.min(200, boss.level);
  const ch = makeChar(branch, L);
  const e = { hp: boss.hp, def: boss.def, atk: boss.atk };
  let hp = boss.hp;
  const p2 = boss.phase2 ? ENEMIES[boss.phase2] : null;
  if (p2) hp += p2.hp;
  const d = dpsOf(ch, e, { boss: true, mode: 'avg', ult: true });
  const t = hp / (d.dps * BOSS_UPTIME);
  const hit = takenOf(ch, Math.max(boss.atk, p2 ? p2.atk : 0));
  return { boss: boss.id, level: boss.level, branch, hp, dps: d.dps, sec: t, taken: hit };
}

export function killsTable(levels) { return levels.map((L) => ({ level: L, kills: killsPerLevelAt(L) })); }

export function simulate() {
  const w1 = [], w2 = [];
  for (const b of BRANCHES) { for (const L of W1_LEVELS) w1.push(rowFor(b, L)); for (const L of W2_LEVELS) w2.push(rowFor(b, L)); }
  const bossW1 = BOSSES_W1().flatMap((bo) => BRANCHES.map((b) => bossRow(bo, b)));
  const bossW2 = BOSSES_W2().flatMap((bo) => BRANCHES.map((b) => bossRow(bo, b)));
  const kills = killsTable([60, 70, 80, 90, 99, 100, 101, 105, 110, 120, 130, 140, 150, 160, 170, 180, 190, 195, 199]);
  return { w1, w2, bossW1, bossW2, kills };
}

/** 6 系統の火力の差（各レベルで 平均に対する 最小・最大） */
export function spread(rows, key = 'dps') {
  const out = {};
  for (const r of rows) (out[r.level] ||= []).push(r[key]);
  return Object.fromEntries(Object.entries(out).map(([L, v]) => {
    const avg = v.reduce((a, x) => a + x, 0) / v.length;
    return [L, { min: Math.min(...v) / avg, max: Math.max(...v) / avg }];
  }));
}

// ------------------------------------------------------------ 出力
const f1 = (v) => (v >= 100 ? Math.round(v).toLocaleString('en') : v.toFixed(1));
const pct = (v) => (v * 100).toFixed(1) + '%';
const SHORT = { gunslinger: 'ガン', neondancer: 'ダンサー', streetfighter: 'ファイター', nightracer: 'レーサー', netrunner: 'ネット', dronemaster: 'ドローン' };

export function markdown(res) {
  const L = [];
  const table = (rows, title) => {
    L.push(`### ${title}`, '', '| 系統 | Lv | 攻撃力 | 主力スキル(Lv) | 主力で何発（ふつう/強い） | 倒す秒（ふつう/強い） | 毎秒の火力 | うち召喚 | 画面全体: 一掃の倍率（ふつう/強い）・何秒分 | 受けるダメ（体当たり/弾）・何発で倒れる |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      L.push(`| ${SHORT[r.branch]} | ${r.level} | ${r.atk} | ${r.main}(${r.mainLv}) | ${r.hitsMain.toFixed(1)} / ${r.hitsMainElite.toFixed(1)} | ${r.ttk.toFixed(2)} / ${r.ttkElite.toFixed(2)} | ${f1(r.dps)} | ${r.summonDps ? f1(r.summonDps) : '-'} | ${r.ult ? `${r.ultSweep.toFixed(2)} / ${r.ultSweepElite.toFixed(2)}・${r.ultSec.toFixed(1)}秒` : '-'} | ${pct(r.taken.pct)} / ${pct(r.takenShot.pct)}・${r.taken.hitsToDie} |`);
    }
    L.push('');
    const sp = spread(rows);
    L.push('6 系統の火力の差（平均 = 1）: ' + Object.entries(sp).map(([lv, s]) => `Lv${lv} ${s.min.toFixed(2)}〜${s.max.toFixed(2)}`).join(' / '), '');
  };
  table(res.w1, '第1ワールド Lv60〜99（比べる用）');
  table(res.w2, '第2ワールド Lv100〜200');
  const bt = (rows, title) => {
    L.push(`### ${title}`, '', '| ボス | Lv | HP | ' + BRANCHES.map((b) => SHORT[b]).join(' | ') + ' | 受けるダメ（ボスの体当たり、最大HPの割合） |', '|---|---|---|' + BRANCHES.map(() => '---|').join('') + '---|');
    const by = {};
    for (const r of rows) (by[r.boss] ||= []).push(r);
    for (const [id, rs] of Object.entries(by)) {
      const t = (s) => `${Math.floor(s / 60)}分${String(Math.round(s % 60)).padStart(2, '0')}秒`;
      L.push(`| ${id} | ${rs[0].level} | ${rs[0].hp.toLocaleString('en')} | ${rs.map((r) => t(r.sec)).join(' | ')} | ${rs.map((r) => pct(r.taken.pct)).join(' ')} |`);
    }
    L.push('');
  };
  bt(res.bossW1, '第1ワールドのボス（Lv55〜100、ボスと同じ Lv で）');
  bt(res.bossW2, '第2ワールドのボス（ボスと同じ Lv で。ラスボスは第1＋第2形態の合計）');
  L.push('### 1 Lv 上げるのに倒す数（その Lv ±5 のふつうの敵の経験値の平均で）', '', '| Lv | ' + res.kills.map((k) => k.level).join(' | ') + ' |', '|---|' + res.kills.map(() => '---|').join(''), '| 体 | ' + res.kills.map((k) => Math.round(k.kills)).join(' | ') + ' |', '');
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = simulate();
  if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
  else console.log(markdown(res));
}
