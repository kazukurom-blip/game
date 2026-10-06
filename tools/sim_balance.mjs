// 強さの釣り合いのシミュレーション（v4: 5次転職・Lv100〜200 と、比べるための第1ワールド Lv60〜100 / v5: 育ち方 3 段階・ネオン適性・ボス）
//  node tools/sim_balance.mjs            … 表を Markdown で出す（v4 の素の強さの表）
//  node tools/sim_balance.mjs --v5       … v5 の表（3 段階ごとの雑魚の発数・ボスの時間・受けるダメージ・適性と地域ごとの進み方）
//  node tools/sim_balance.mjs --json     … 数値を JSON で出す（--v5 と一緒なら v5 の数値）
// tests/balance_v4.mjs・tests/balance_v5.mjs もこのファイルの関数を使う（調整の結果が保たれているかを確かめる）。
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
import { ITEMS, W2_GEAR, canWearGender, QSET_IDS } from '../src/data/items.js';
import { ENEMIES, hpAt, atkAt, defAt, w2Hp, w2Def, w2AtkK } from '../src/data/enemies.js';
import { expToNext } from '../src/data/balance.js';
import { maxStarFor } from '../src/data/gear.js';
import { LV_ATK_PCT_W2 } from '../src/systems/progression.js';
import { FORCE_REQ } from '../src/data/forceReq.js';
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
    !it.id.startsWith('qset_') && !it.cosmetic && !it.bossV5 && canWearGender(it, gender) &&
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

// ------------------------------------------------------------ v5: 育ち方の 3 段階（docs/SPEC_V5.md の表。docs/BALANCE_V5.md）
//  gear: 'normal' = 上の pickGear（その Lv の店・雑魚のドロップの装備）/ 'boss' = ＋qset・ボスの装備（v5 の当たり・今あるボスの神話級）
//        / 'best' = ＋v5 の大当たり（一番良い装備）
//  star: 全部位の★（装備の上限★まで）。pot: 潜在の等級（行は下の POT_PLAN）。forceR: ネオン適性 F ÷ そのマップの必要な適性 R
export const TIERS = {
  normal: { id: 'normal', name: 'ふつう', gear: 'normal', star: 5, pot: 'rare', forceR: 1.0 },
  solid: { id: 'solid', name: 'しっかり', gear: 'boss', star: 12, pot: 'epic', forceR: 1.25 },
  max: { id: 'max', name: '強化しまくり', gear: 'best', star: 20, pot: 'legendary', forceR: 1.5 },
};
export const TIER_IDS = Object.keys(TIERS);
// 潜在の行（その等級でよく狙う物。1 行目はその等級、2・3 行目は「レア」は同じ等級・「エピック」は 1 段下・「レジェ」は全部レジェ＝強化しまくり）
const POT_PLAN = {
  rare: { weapon: [['atkPct', 0.03], ['crit', 0.02], ['mainPct', 0.03]], accessory: [['atkPct', 0.03], ['mainPct', 0.03], ['crit', 0.02]], armor: [['mainPct', 0.03], ['maxHpPct', 0.03], ['defPct', 0.04]] },
  epic: { weapon: [['atkPct', 0.06], ['atkPct', 0.03], ['crit', 0.02]], accessory: [['atkPct', 0.06], ['mainPct', 0.03], ['crit', 0.02]], armor: [['mainPct', 0.06], ['mainPct', 0.03], ['maxHpPct', 0.03]] },
  legendary: { weapon: [['atkPct', 0.09], ['atkPct', 0.06], ['bossDmg', 0.15]], accessory: [['atkPct', 0.09], ['atkPct', 0.06], ['crit', 0.04]], armor: [['mainPct', 0.09], ['mainPct', 0.06], ['maxHpPct', 0.06]] },
};
function potFor(slot, grade) {
  const plan = POT_PLAN[grade]?.[slot === 'weapon' || slot === 'accessory' ? slot : 'armor'];
  return plan ? { grade, lines: plan.map(([stat, value]) => ({ stat, value, grade })) } : null;
}
/** 段階ごとの装備の候補（必要Lv ≦ L・性別に合う物） */
function tierCandidates(L, gender, gear) {
  const base = gearCandidates(L, gender);
  if (gear === 'normal') return base;
  const ids = new Set(base.map((it) => it.id));
  const extra = Object.values(ITEMS).filter((it) => it.type === 'equip' && it.slot && it.slot !== 'pet' && it.reqLevel <= L && !it.cosmetic && canWearGender(it, gender) && !ids.has(it.id) &&
    (QSET_IDS.includes(it.id) || it.bossV5 === 'hit' || (it.world === 2 && it.rarity === 'mythic' && !it.bossV5) || (gear === 'best' && it.bossV5 === 'jackpot')));
  return [...base, ...extra];
}
/** 部位ごとに、攻撃力（同じなら防御・最大HP）が一番高くなる物を選ぶ（武器 → 防具 → 武器 の順） */
function pickGearTier(st, tier) {
  const cands = tierCandidates(st.level, st.gender, tier.gear);
  const score = () => { const s = computeStats(st, []); return s.atk * 1e6 + s.def * 100 + s.maxHp * 0.01; };
  st.equipped = { hat: null, top: null, bottom: null, shoes: null, accessory: null, weapon: null, pet: null };
  st.equippedInst = {};
  const pickSlot = (slot) => {
    let best = null, bs = -1;
    for (const it of cands.filter((x) => x.slot === slot)) {
      st.equipped[slot] = it.id;
      st.equippedInst[slot] = instFor(it, tier);
      const v = score();
      if (v > bs) { bs = v; best = it.id; }
    }
    st.equipped[slot] = best;
    st.equippedInst[slot] = best ? instFor(ITEMS[best], tier) : null;
  };
  for (const slot of ['weapon', 'hat', 'top', 'bottom', 'shoes', 'accessory', 'weapon']) pickSlot(slot);
}
function instFor(it, tier) { return { id: it.id, uid: 'sim_' + it.slot, star: Math.min(tier.star, maxStarFor(it)), pot: potFor(it.slot, tier.pot) }; }

// ------------------------------------------------------------ v5: ネオン・コア（SPEC_V5 の式を再現。システム担当の実装の前の仮の値）
/** forceMods(F, R) → {dealt, taken}（SPEC_V5 の表を直線でつなぐ。R = 0 は倍率なし） */
export function forceMods(F, R) {
  if (!(R > 0)) return { dealt: 1, taken: 1 };
  const r = Math.max(0, F / R);
  const P = [[0, 0.1, 3], [0.5, 0.4, 2], [1, 1, 1], [1.5, 1.5, 0.7]];
  if (r >= 1.5) return { dealt: 1.5, taken: 0.7 };
  for (let i = 1; i < P.length; i++) if (r <= P[i][0]) {
    const [a, da, ta] = P[i - 1], [b, db, tb] = P[i];
    const t = (r - a) / (b - a);
    return { dealt: da + (db - da) * t, taken: ta + (tb - ta) * t };
  }
  return { dealt: 1.5, taken: 0.7 };
}
/** neonForceOf: コアの Lv の合計 × 10（追加スキルの分は入れない） */
export const neonForceOfCores = (cores) => 10 * Object.values(cores || {}).reduce((a, v) => a + (v || 0), 0);
/** % 能力（仮の値。SPEC_V5 の目安「上限まで振ると 攻撃力 +30%・ボスダメージ +40%・防御無視 +20%」）: 1 Lv の上がり幅と上限 Lv */
export const NEON_STATS = {
  atkPct: { per: 0.01, max: 30 }, bossDmg: { per: 0.02, max: 20 }, ignoreDef: { per: 0.01, max: 20 }, critDmg: { per: 0.01, max: 20 },
  maxHpPct: { per: 0.01, max: 30 }, defPct: { per: 0.01, max: 30 }, expPct: { per: 0.01, max: 20 }, dropPct: { per: 0.01, max: 20 },
};
/** コア 1 Lv ごとの主ステータス（仮の値。「主のステータスが少し上がる」） */
export const NEON_MAIN_PER_LV = 3;
/** コアの Lv n に上げる費用（フラグメント）。SPEC_V5 の目安: 1 Lv 目 10 個くらい、Lv20 まで 1 地域 1,000〜1,500 個 */
export const neonCoreCost = (n) => Math.round(10 + 1.55 * Math.pow(Math.max(0, n - 1), 1.5));
export const NEON_CORE_MAX = 20;
/** 能力ポイント（= コアの Lv の合計）を、戦いに効く順に 1 つずつ振る（ボスダメ → 攻撃 → 防御無視 → 会心ダメ → 最大HP → 防御） */
export function allocNeonPoints(points) {
  const out = {};
  const order = ['bossDmg', 'atkPct', 'ignoreDef', 'critDmg', 'maxHpPct', 'defPct'];
  let left = Math.max(0, Math.floor(points)), guard = 0;
  while (left > 0 && guard++ < 1000) {
    let any = false;
    for (const k of order) { if (left <= 0) break; if ((out[k] || 0) < NEON_STATS[k].max) { out[k] = (out[k] || 0) + 1; left--; any = true; } }
    if (!any) break;
  }
  const v = {};
  for (const [k, lv] of Object.entries(out)) v[k] = lv * NEON_STATS[k].per;
  return { lv: out, value: v };
}
/** そのマップの必要な適性 R に対し、段階の F（= forceR × R）を持つときのネオン・コアの状態 */
export function neonFor(tier, R) {
  const F = Math.round((tier?.forceR ?? 0) * (R || 0));
  const coreLv = Math.floor(F / 10);
  return { F, R: R || 0, coreLv, stats: allocNeonPoints(coreLv).value, mods: forceMods(F, R || 0) };
}

/**
 * makeChar(branch, L, opts?) → {state, job, lineage, tier, neon}
 *  opts 無し = v4 の素の強さ（★・潜在・ネオン無し）。opts.tier = 'normal'|'solid'|'max' で v5 の育ち方、opts.R = そのマップの必要な適性
 */
export function makeChar(branch, L, opts = {}) {
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
  const tier = opts.tier ? TIERS[opts.tier] || opts.tier : null;
  let neon = null;
  if (tier) {
    neon = neonFor(tier, opts.R || 0);
    if (Number.isFinite(opts.F)) { // 適性を直接決める（足りない時の確かめ用）
      const coreLv = Math.floor(opts.F / 10);
      neon = { F: opts.F, R: opts.R || 0, coreLv, stats: allocNeonPoints(coreLv).value, mods: forceMods(opts.F, opts.R || 0) };
    }
    st.stats[m1] += NEON_MAIN_PER_LV * neon.coreLv;
    pickGearTier(st, tier);
  } else pickGear(st);
  return { state: st, job, lineage, tier, neon };
}

/**
 * statsOf(ch, buffs) → computeStats ＋ v5 のネオン・コア（% 能力は 攻撃力% の足し算の中に入れる）。
 *  加えて dealt / taken（forceMods）・bossDmg（潜在＋コア）・ignoreDef を持つ
 */
export function statsOf(ch, buffs) {
  const st = ch.state;
  const s = computeStats(st, buffs);
  const n = ch.neon;
  if (!n) return { ...s, dealt: 1, taken: 1, ignoreDef: 0 };
  const L = st.level || 1;
  const sumPct = (buffs || []).reduce((a, b) => a + (b.atkPct || 0), 0) + (s.pot?.atkPct || 0) + (L > 100 ? LV_ATK_PCT_W2 * (Math.min(L, 200) - 100) : 0);
  const v = n.stats;
  return {
    ...s,
    atk: Math.round(s.atk / (1 + sumPct) * (1 + sumPct + (v.atkPct || 0))),
    critDmg: s.critDmg + (v.critDmg || 0),
    maxHp: Math.round(s.maxHp * (1 + (v.maxHpPct || 0))),
    def: Math.round(s.def * (1 + (v.defPct || 0))),
    bossDmg: (s.bossDmg || 0) + (v.bossDmg || 0),
    ignoreDef: v.ignoreDef || 0,
    dealt: n.mods.dealt, taken: n.mods.taken,
  };
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
export function dpsOf(ch, enemy0, opts = {}) {
  const st = ch.state;
  const buffs = buffsOf(st, opts.mode || 'perm');
  const s = statsOf(ch, buffs);
  const enemy = { ...enemy0, def: enemy0.def * (1 - s.ignoreDef) }; // v5: 防御無視
  const gm = s.dealt * (opts.boss ? 1 + (s.bossDmg || 0) : 1);    // v5: 適性の倍率・ボスダメージ（潜在＋コア。弾にも効くとして計算）
  const cf = critF(s) * gm;
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
export function useDamage(ch, sk, enemy0, mode = 'perm', boss = false) {
  const st = ch.state;
  const s = statsOf(ch, buffsOf(st, mode));
  const enemy = { ...enemy0, def: enemy0.def * (1 - s.ignoreDef) };
  const u = perUse(sk, st.skills[sk.id] || 1, enemy, boss);
  return (u.m + u.fa * finalAttack(st) * defFactor(enemy.def)) * s.atk * critF(s) * s.dealt * (boss ? 1 + (s.bossDmg || 0) : 1);
}

/** 敵から受けるダメージ（期待値。damagePlayer と同じ式） */
export function takenOf(ch, atk) {
  const s = statsOf(ch, buffsOf(ch.state, 'perm'));
  const d = atk * (100 / (100 + s.def)) * (1 - s.dmgReduce) * s.taken;
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

// ------------------------------------------------------------ v5: 3 段階ごとの雑魚・ボス・適性と地域の進み方（docs/BALANCE_V5.md）
/** v5 で難しくしたボス: 第1ワールドの Lv100 前後（オーバーロード・ゾグ）と、第2ワールドの全ボス（ラスボスは 2 形態で 1 回） */
export const V5_BOSS_IDS = ['boss_alien', 'boss_ark_titan', 'boss_wild_kernel', 'boss_abyss_queen', 'boss_zenith'];
/** ボスにかかる時間の目安（秒）: ふつう 約60分・しっかり 30〜40分・強化しまくり 約20分 */
export const V5_BOSS_TIME = { normal: [50 * 60, 70 * 60], solid: [30 * 60, 40 * 60], max: [15 * 60, 25 * 60] };
/** 第2ワールドのフィールド（進む順） */
export const W2_FIELDS = ['arkcity', 'cyberwild', 'abyss', 'zenith'].flatMap((r) => [1, 2, 3, 4].map((i) => `w2_${r}_f${i}`));
export const W2_REGION_ORDER = ['arkcity', 'cyberwild', 'abyss', 'zenith'];
/** その Lv の雑魚が出るマップのうち、一番低い必要な適性（第2ワールドの雑魚の Lv の幅で見る。Lv100 未満は 0） */
export function forceReqAtLevel(L) {
  let best = null;
  for (const m of W2_FIELDS) {
    const lv = Object.values(ENEMIES).filter((e) => !e.boss && !e.night && (e.habitats || []).includes(m)).map((e) => e.level);
    if (!lv.length) continue;
    if (L >= Math.min(...lv) - 1 && L <= Math.max(...lv) + 1) { const R = FORCE_REQ[m] || 0; if (best == null || R < best) best = R; }
  }
  if (best != null) return best;
  if (L < 100) return 0;
  return FORCE_REQ[W2_FIELDS.find((m) => Object.values(ENEMIES).some((e) => !e.boss && (e.habitats || []).includes(m) && e.level >= L)) || W2_FIELDS[W2_FIELDS.length - 1]] || 0;
}
/** ボスのいるマップの必要な適性（第1ワールドは 0） */
export const bossForceReq = (boss) => FORCE_REQ[boss.habitats?.[0]] || 0;

// 段階つきのキャラは作るのに時間がかかるので使い回す（読むだけ。dpsOf などは state を変えない）
const _tierCache = new Map();
export function tierChar(branch, L, tierId, R = 0, F) {
  const k = `${branch}|${L}|${tierId}|${R}|${F ?? ''}`;
  if (!_tierCache.has(k)) _tierCache.set(k, makeChar(branch, L, { tier: tierId, R, ...(Number.isFinite(F) ? { F } : {}) }));
  return _tierCache.get(k);
}
/** そのボスを、その段階のキャラ（ボスと同じ Lv）で倒す時間・受けるダメージ（opts.F で適性を直接決める） */
export function bossRowTier(boss, branch, tierId, opts = {}) {
  const L = Math.min(200, boss.level);
  const R = bossForceReq(boss);
  const ch = tierChar(branch, L, tierId, R, opts.F);
  const p2 = boss.phase2 ? ENEMIES[boss.phase2] : null;
  const hp = boss.hp + (p2 ? p2.hp : 0);
  const d = dpsOf(ch, { hp: boss.hp, def: boss.def, atk: boss.atk }, { boss: true, mode: 'avg', ult: true });
  const atk = Math.max(boss.atk, p2 ? p2.atk : 0);
  const hit = takenOf(ch, atk);
  const shotK = Math.max(boss.shoot?.damageMult || 0, p2?.shoot?.damageMult || 0);
  return { boss: boss.id, level: boss.level, branch, tier: tierId, R, F: ch.neon.F, hp, dps: d.dps, sec: hp / (d.dps * BOSS_UPTIME), taken: hit, shot: shotK ? takenOf(ch, atk * shotK) : null, atk: d.stats.atk, maxHp: d.stats.maxHp };
}

/** マップ（第2ワールドのフィールド）の雑魚（夜限定・ボス以外）を、その段階のキャラ（敵と同じ Lv）で。opts.F で適性を直接決める */
export function mobRowsTier(mapId, tierId, opts = {}) {
  const R = FORCE_REQ[mapId] || 0;
  const mobs = Object.values(ENEMIES).filter((e) => !e.boss && !e.night && !e.civilian && (e.habitats || []).includes(mapId));
  return mobs.map((e) => {
    const branchRows = BRANCHES.map((b) => {
      const ch = tierChar(b, e.level, tierId, R, opts.F);
      const main = mainSkillOf(ch);
      const en = { hp: e.hp, def: e.def, atk: e.atk };
      const d = dpsOf(ch, en, { mode: 'perm' });
      return { branch: b, hits: e.hp / useDamage(ch, main, en), ttk: e.hp / d.dps, taken: takenOf(ch, e.atk).pct };
    });
    const strong = e.hp > w2Hp(e.level) * 1.25;
    return { map: mapId, id: e.id, level: e.level, hp: e.hp, def: e.def, R, strong, rows: branchRows,
      hitsAvg: branchRows.reduce((a, r) => a + r.hits, 0) / branchRows.length, ttkAvg: branchRows.reduce((a, r) => a + r.ttk, 0) / branchRows.length,
      hitsMin: Math.min(...branchRows.map((r) => r.hits)), hitsMax: Math.max(...branchRows.map((r) => r.hits)) };
  });
}

// 狩りの速さの仮定: 主力スキルは平均 3 体に当たる・移動や拾う時間で実際に攻撃している時間は半分・出現の上限（1 マップ 3〜4 か所 × 4.5 秒に 1 体）
export const FARM = { targets: 3, uptime: 0.5, spawnCapPerHour: 2700, fragmentChance: 0.01, bossFragments: 7 };
/** 1 時間に倒せる数（ふつうの敵を 1 体倒す秒 ttk から） */
export const killsPerHourOf = (ttk) => Math.min(FARM.spawnCapPerHour, 3600 * FARM.uptime * FARM.targets / Math.max(0.05, ttk));

/** コアを Lv a → b に上げる費用の合計 */
export function coreCostRange(a, b) { let s = 0; for (let n = a + 1; n <= b; n++) s += neonCoreCost(n); return s; }
/** 1 地域のコアを Lv20 まで上げる費用 */
export const coreCostFull = () => coreCostRange(0, NEON_CORE_MAX);

/**
 * 適性の段々と、フラグメントを集める速さ（ふつう）。マップを進む順に、
 *  そのマップに入るのに要るコアの Lv の合計（R/10）→ 前のマップで狩って集める数と時間（使えるコアは、それまでに通った地域のコア。安い Lv から上げる）
 */
export function forceProgress(tierId = 'normal') {
  const cores = { arkcity: 0, cyberwild: 0, abyss: 0, zenith: 0 };
  const unlocked = new Set(['arkcity']);
  const rows = [];
  let prev = null;
  for (const mapId of W2_FIELDS) {
    const R = FORCE_REQ[mapId] || 0;
    const region = mapId.split('_')[1];
    const need = Math.ceil(R / 10);
    let frags = 0;
    while (Object.values(cores).reduce((a, v) => a + v, 0) < need) {
      const c = [...unlocked].filter((k) => cores[k] < NEON_CORE_MAX).sort((a, b) => neonCoreCost(cores[a] + 1) - neonCoreCost(cores[b] + 1))[0];
      if (!c) break;
      cores[c]++; frags += neonCoreCost(cores[c]);
    }
    // 集める場所 = 前のマップ（最初のマップは 0）。ふつうのキャラ・その場の適性で、ふつうの敵を倒す速さ
    let kph = null, hours = 0;
    if (prev && frags > 0) {
      const mobs = mobRowsTier(prev.mapId, tierId).filter((m) => !m.strong);
      const ttk = mobs.reduce((a, m) => a + m.ttkAvg, 0) / mobs.length;
      kph = killsPerHourOf(ttk);
      hours = frags / (kph * FARM.fragmentChance);
    }
    rows.push({ map: mapId, region, R, coreLv: need, frags, hours, kph, cores: { ...cores } });
    unlocked.add(region);
    prev = { mapId, R };
  }
  return rows;
}

/** 地域ごとの進み方: Lv を上げながら通るあいだに落ちるフラグメント（＋ボス 1 回）と、次の地域に入るのに要る数 */
export function regionProgress(tierId = 'normal') {
  const fp = forceProgress(tierId);
  const RANGE = { arkcity: [100, 125], cyberwild: [125, 150], abyss: [150, 175], zenith: [175, 200] };
  return W2_REGION_ORDER.map((r, i) => {
    const maps = W2_FIELDS.filter((m) => m.includes(`_${r}_`));
    const mobs = maps.flatMap((m) => mobRowsTier(m, tierId)).filter((m) => !m.strong);
    const kph = mobs.reduce((a, m) => a + killsPerHourOf(m.ttkAvg), 0) / mobs.length;
    const [a, b] = RANGE[r];
    let kills = 0; for (let L = a; L < b; L++) kills += killsPerLevelAt(L);
    const levelHours = kills / kph;
    const gained = kills * FARM.fragmentChance + FARM.bossFragments;
    const next = W2_REGION_ORDER[i + 1];
    // この地域で集める分 = この地域の f2〜f4 に入る分 ＋ 次の地域の f1 に入る分
    const needRows = fp.filter((x) => (x.region === r && !x.map.endsWith('_f1')) || (next && x.map === `w2_${next}_f1`));
    const need = needRows.reduce((s, x) => s + x.frags, 0);
    return { region: r, levels: [a, b], kph, kills, levelHours, gained, need, needHours: need / (kph * FARM.fragmentChance), maxR: Math.max(...maps.map((m) => FORCE_REQ[m] || 0)) };
  });
}

export function simulateV5() {
  const bosses = V5_BOSS_IDS.flatMap((id) => TIER_IDS.flatMap((t) => BRANCHES.map((b) => bossRowTier(ENEMIES[id], b, t))));
  const mobs = {};
  for (const t of TIER_IDS) mobs[t] = W2_FIELDS.flatMap((m) => mobRowsTier(m, t));
  const noForce = W2_FIELDS.filter((m) => (FORCE_REQ[m] || 0) > 0).flatMap((m) => mobRowsTier(m, 'normal', { F: 0 }));
  return { bosses, mobs, noForce, force: forceProgress('normal'), regions: regionProgress('normal'), coreFull: coreCostFull() };
}

const tmin = (s0) => { const s = Math.round(s0); return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`; };
export function markdownV5(res) {
  const L = [];
  const pct = (v) => (v * 100).toFixed(1) + '%';
  L.push('### ボスにかかる時間（段階ごと・ボスと同じ Lv。当てられる時間 75%。ラスボスは 2 形態の合計）', '');
  L.push('| ボス | Lv | HP | 必要な適性 | 段階 | ' + BRANCHES.map((b) => SHORT[b]).join(' | ') + ' | 平均 | 受けるダメ（体当たり、最大HPの割合・6 系統の最小〜最大） |', '|---|---|---|---|---|' + BRANCHES.map(() => '---|').join('') + '---|---|');
  for (const id of V5_BOSS_IDS) for (const t of TIER_IDS) {
    const rs = res.bosses.filter((r) => r.boss === id && r.tier === t);
    const avg = rs.reduce((a, r) => a + r.sec, 0) / rs.length;
    const tk = rs.map((r) => r.taken.pct);
    L.push(`| ${id} | ${rs[0].level} | ${rs[0].hp.toLocaleString('en')} | ${rs[0].R} | ${TIERS[t].name}（F=${rs[0].F}） | ${rs.map((r) => tmin(r.sec)).join(' | ')} | ${tmin(avg)} | ${pct(Math.min(...tk))}〜${pct(Math.max(...tk))} |`);
  }
  L.push('');
  L.push('### 雑魚を主力スキルで何発（6 系統の平均〔最小〜最大〕・敵と同じ Lv・その段階の適性で）', '');
  L.push('| マップ | 必要な適性 | 敵 | Lv | HP | ' + TIER_IDS.map((t) => TIERS[t].name).join(' | ') + ' | 適性 0 のふつう |', '|---|---|---|---|---|' + TIER_IDS.map(() => '---|').join('') + '---|');
  const nf = Object.fromEntries(res.noForce.map((m) => [m.id + '@' + m.map, m]));
  res.mobs.normal.forEach((m, i) => {
    const cells = TIER_IDS.map((t) => { const x = res.mobs[t][i]; return `${x.hitsAvg.toFixed(1)}〔${x.hitsMin.toFixed(1)}〜${x.hitsMax.toFixed(1)}〕`; });
    const z = nf[m.id + '@' + m.map];
    L.push(`| ${m.map} | ${m.R} | ${m.id}${m.strong ? '（強い）' : ''} | ${m.level} | ${m.hp.toLocaleString('en')} | ${cells.join(' | ')} | ${z ? z.hitsAvg.toFixed(1) : '-'} |`);
  });
  L.push('');
  L.push('### 適性の段々とフラグメント（ふつう。コアの費用 = ' + [1, 2, 3, 5, 10, 15, 20].map((n) => `Lv${n} ${neonCoreCost(n)}個`).join('・') + `、1 地域 Lv20 まで ${res.coreFull} 個）`, '');
  L.push('| マップ | 必要な適性 | コアの Lv の合計 | このマップに入るのに足りない分（個） | 前のマップで集める時間 | 前のマップで 1 時間に倒す数 | コア（アーク/ワイルド/アビス/ゼニス） |', '|---|---|---|---|---|---|---|');
  for (const r of res.force) L.push(`| ${r.map} | ${r.R} | ${r.coreLv} | ${r.frags} | ${r.hours ? r.hours.toFixed(1) + ' 時間' : '-'} | ${r.kph ? Math.round(r.kph).toLocaleString('en') : '-'} | ${Object.values(r.cores).join(' / ')} |`);
  L.push('');
  L.push('### 地域ごとの進み方（ふつう）', '');
  L.push('| 地域 | Lv | 1 時間に倒す数 | Lv を上げるのに倒す数 | Lv を上げる時間 | その間に落ちるフラグメント（＋ボス 1 回） | 地域の奥〜次の入口に要る数 | 要る数を集める時間 |', '|---|---|---|---|---|---|---|---|');
  for (const r of res.regions) L.push(`| ${r.region} | ${r.levels[0]}→${r.levels[1]} | ${Math.round(r.kph).toLocaleString('en')} | ${Math.round(r.kills).toLocaleString('en')} | ${r.levelHours.toFixed(1)} 時間 | ${Math.round(r.gained)} | ${r.need} | ${r.needHours.toFixed(1)} 時間 |`);
  L.push('');
  return L.join('\n');
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
      const t = tmin;
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
  if (process.argv.includes('--v5')) {
    const res = simulateV5();
    if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
    else console.log(markdownV5(res));
  } else {
    const res = simulate();
    if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
    else console.log(markdown(res));
  }
}
