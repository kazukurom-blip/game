// スキルの数値を決める（レベル・熟練度・ルーン・補助の刻印・装備・要石をまとめる）。実際の動きは combat.js と content/combat/behaviors.js。
//
// 外から使う:
//   resolveSkill(state, H, id) → p（1 回分の数値）。combat は power の modifySkill を後でかける
//   applyMod(p, mod)            … ルーン・刻印・熟練度の効果を p にかける（mod の形は下のコメント）
//   skillDesc(state, H, id)     … 説明文（数字入り）
//   estimateDps(state, H, id)   … そのスキルだけを使い続けたときの目安の DPS
//   estimateBuildDps(state, H)  … スキルの並び全体の目安の DPS（戦力・おまかせ編成・星座盤の比較に使う）
//   castSpeed(H, p)             … 動作の速さの倍率（武器の攻撃速度と攻撃速度の %）
//   masteryLevel(mxp)           … 熟練度の段（0〜10）

import { SKILL, SKILL_MAX_LEVEL, MASTERY_XP, MASTERY_MAX, MASTERY_DMG, MASTERY_BONUS } from '../data/skills.js';
import { SUPPORT, supportFits } from '../data/supports.js';
import { skillLevel, incFor } from './character.js';
import { BAL } from '../data/balance.js';
import { CLASS } from '../data/classes.js';

/** 遠くから戦うクラスが、近くでしか当たらない技を使える割合の目安 */
const NEAR_ONLY = { nova: 0.4, whirl: 0.45, flurry: 0.45, orbit: 0.7, melee: 0.5, leap: 0.8, dash: 0.8, ult_deathmarch: 0.9 };
export function rangeFit(H, p) {
  if (p.basic) return 1;
  const ranged = CLASS[H.cls]?.range === 'ranged';
  return ranged ? (NEAR_ONLY[p.behavior] ?? 1) : 1;
}

/** 攻撃の動作の基準になる攻撃速度（これより速い武器ほど動作が速い） */
export const REF_APS = 1.3;

export function masteryLevel(mxp = 0) {
  let l = 0;
  while (l < MASTERY_MAX && mxp >= MASTERY_XP[l + 1]) l++;
  return l;
}

const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);

/** スキル 1 回分の数値（params）を作る */
export function resolveSkill(state, H, skillId) {
  const def = SKILL[skillId];
  if (!def) return null;
  const lvl = Math.max(1, skillLevel(state, H, skillId));
  const sk = state.hero.skills[skillId] || {};
  const kind = def.kind || (def.basic ? 'basic' : 'active');
  const p = {
    id: def.id,
    def,
    lvl,
    kind,
    behavior: def.behavior,
    element: def.element || 'phys',
    tags: [...(def.tags || [])],
    dmgPct: (def.dmg?.[0] || 0) + (def.dmg?.[1] || 0) * (lvl - 1),
    cost: def.cost || 0,
    cd: def.cd || 0,
    baseCd: def.cd || 0,
    castTime: def.castTime || 0.6,
    range: def.range || (def.behavior === 'nova' ? (def.radius || 150) : 120),
    radius: def.radius || 0,
    count: def.count || 1,
    speed: def.speed || 1000,
    pierce: def.pierce || 0,
    chain: def.chain || 0,
    spread: def.spread ?? 0.35,
    duration: def.duration || 0,
    tick: def.tick || 0,
    delay: def.delay || 0,
    explode: def.explode || 0,
    maxSummons: def.maxSummons || 0,
    summon: clone(def.summon),
    buff: def.buff ? { dur: def.buff.dur || 5, mods: (def.buff.mods || []).map((m) => ({ s: m.s, v: m.v + (m.per || 0) * (lvl - 1) })) } : null,
    shield: def.shield ? { pct: (def.shield.pct || 0) + (def.shield.per || 0) * (lvl - 1), dur: def.shield.dur || 8 } : null,
    curse: clone(def.curse),
    burn: clone(def.burn),
    statuses: def.status ? [{ ...def.status }] : [],
    basic: !!def.basic,
    ult: kind === 'ult',
    auto: def.auto || 'always',
    dmgMul: 1,
    repeatChance: 0,
    buffMul: 1,
    buffDurMul: 1,
    shieldMul: 1,
    summonLifeMul: 1,
    mastery: 0,
    extra: { ...(def.extra || {}) }, // 力（power）・動きが自由に使う
  };
  // 熟練度
  const ml = masteryLevel(sk.mxp || 0);
  p.mastery = ml;
  if (ml > 0) p.dmgMul *= 1 + (MASTERY_DMG * ml) / 100;
  const mb = MASTERY_BONUS[kind];
  if (mb) { if (ml >= 5) applyMod(p, mb.m5); if (ml >= 10) applyMod(p, mb.m10); }
  // ルーン
  const rune = def.runes?.find((r) => r.id === sk.rune);
  if (rune?.mod) applyMod(p, rune.mod);
  // 補助の刻印: { id, lvl } を読む（古い形・ほかの担当の { mod } もそのまま使える）
  p.supports = [];
  for (const g of sk.supports || []) {
    if (!g) continue;
    if (g.mod) { applyMod(p, g.mod); continue; }
    const sup = SUPPORT[g.id];
    if (!sup || !supportFits(sup, def)) continue;
    applyMod(p, sup.mod(g.lvl || 1));
    p.supports.push(g.id);
  }
  // 装備・パッシブの全体効果
  if (p.tags.includes('projectile')) { p.count += H.projCount || 0; p.pierce += H.pierce || 0; }
  if (p.behavior === 'chain') p.chain += H.chain || 0;
  if (p.summon?.chain) p.summon.chain += H.chain || 0;
  if (p.radius) p.radius *= H.area || 1;
  if (p.explode) p.explode *= H.area || 1;
  if (p.maxSummons) p.maxSummons += H.minionCount || 0;
  if (p.curse) {
    const ce = 1 + (H.S?.curse_eff || 0) / 100;
    for (const k of ['vuln', 'weaken', 'slow', 'mark']) if (p.curse[k]) p.curse[k] *= ce;
  }
  // 要石
  const ks = H.ks || {};
  if (ks.twincast && p.tags.includes('spell') && !p.ult) { p.twin = true; if (p.cost > 0) p.cost *= 2.5; p.cd *= 1.3; }
  if (ks.onestrike) { if (p.baseCd > 0) p.dmgMul *= 1.5; else if (p.basic) p.dmgMul *= 0.6; }
  const cdr = (H.cdr || 0) + (H.S?.[`skill_cdr:${def.id}`] || 0) / 100;
  p.cd *= Math.max(1 - BAL.CDR_CAP / 100, 1 - cdr);
  if (p.cost > 0) p.cost *= 1 - (H.costRed || 0);
  // 強化の値
  if (p.buff) { p.buff.dur *= p.buffDurMul; for (const m of p.buff.mods) m.v *= p.buffMul; }
  if (p.shield) { p.shield.pct *= p.shieldMul; p.shield.dur *= p.buffDurMul; }
  if (p.summon) {
    p.summon.life = (p.summon.life || 1) * (p.summon.lifeMul || 1) * p.summonLifeMul;
    if (p.summon.ttl) p.summon.ttl *= p.summon.ttlMul || 1;
    if (p.summon.slam) p.summon.slam *= (p.summon.slamMul || 1) * (H.area || 1);
    if (p.summon.dmgPct) p.summon.dmgPct *= p.summon.dmgPctMul || 1;
  }
  // 召喚物の状態異常（狼の出血・毒蜘蛛・毒の分身・溶岩の巨像など）は、召喚物の攻撃（p で当てる）に乗せる
  if (p.summon?.status) addStatus(p, p.summon.status);
  // 範囲の外れ値
  p.count = Math.max(1, Math.round(p.count));
  if (p.behavior === 'summon' || p.behavior === 'turret') p.maxSummons = Math.max(1, Math.round(p.maxSummons));
  p.castTime = Math.max(0.12, p.castTime);
  if (p.tick) p.tick = Math.max(0.05, p.tick);
  p.status = p.statuses[0] || null;
  return p;
}

const MUL_KEYS = { cdMul: 'cd', castMul: 'castTime', speedMul: 'speed', rangeMul: 'range', delayMul: 'delay', tickMul: 'tick', spreadMul: 'spread', durMul: 'duration', costMul: 'cost', explodeMul: 'explode' };
const ADD_KEYS = { durAdd: 'duration', costAdd: 'cost', countAdd: 'count', pierce: 'pierce', chain: 'chain', maxSummons: 'maxSummons', repeatChance: 'repeatChance' };
const PROD_KEYS = ['dmgMul', 'buffMul', 'buffDurMul', 'shieldMul', 'summonLifeMul'];

/**
 * ルーン・補助の刻印・熟練度の mod を params にかける。
 *   element / behavior / spread … 上書き
 *   dmgMul buffMul buffDurMul shieldMul summonLifeMul … 掛け算
 *   cdMul castMul speedMul rangeMul delayMul tickMul spreadMul durMul costMul explodeMul … その数値に掛け算
 *   radius … 範囲に掛け算（無ければ 100 を基準）
 *   count … 1 より大きければ「最低その数」、それ以外は足し算（昔の形）。countAdd … 足し算
 *   pierce chain maxSummons durAdd costAdd repeatChance … 足し算
 *   explode … 爆発の半径（大きい方）
 *   status … 状態異常を足す（同じ種類なら上書き）。statusReplace … 状態異常を入れ替える
 *   summon … 召喚物の設定を上書き（lifeMul ttlMul dmgPctMul slamMul は掛け算）
 *   buffMods … 強化に効果を足す。burn … 燃える地面。curse … 呪いの設定（vulnAdd は足し算）
 *   tags … タグを足す。bleedMul poisonMul … 出血・毒の強さに掛け算
 *   extra … p.extra に足す（critBonusAdd critDmgBonusAdd leechAdd は足し算）
 *   add_<key> … p[key] に足す。それ以外のキーは p.extra に入る
 */
export function applyMod(p, mod) {
  if (!mod) return p;
  for (const [k, v] of Object.entries(mod)) {
    if (k === 'element') p.element = v;
    else if (k === 'behavior') p.behavior = v;
    else if (k === 'spread') p.spread = v;
    else if (PROD_KEYS.includes(k)) p[k] = (p[k] ?? 1) * v;
    else if (MUL_KEYS[k]) {
      p[MUL_KEYS[k]] = (p[MUL_KEYS[k]] || 0) * v;
      if (k === 'durMul' && p.curse) p.curse.dur = (p.curse.dur || 4) * v; // 呪い・刻印の続く時間も延びる（持続の刻印・深い刻印）
    } else if (k === 'radius') {
      p.radius = (p.radius || 100) * v;
      if (p.explode) p.explode *= v; // 当たって弾ける範囲も「範囲」（広域・集束の刻印、熟練度 10 段）
    }
    else if (k === 'count') p.count = typeof v === 'number' && v > 1 ? Math.max(p.count, v) : p.count + v;
    else if (ADD_KEYS[k]) p[ADD_KEYS[k]] = (p[ADD_KEYS[k]] || 0) + v;
    else if (k === 'explode') p.explode = Math.max(p.explode || 0, v);
    else if (k === 'status') addStatus(p, v);
    else if (k === 'statusReplace') p.statuses = v.map((s) => ({ ...s }));
    else if (k === 'summon') {
      p.summon ||= {};
      for (const [sk, sv] of Object.entries(v)) {
        if (sk === 'lifeMul' || sk === 'ttlMul' || sk === 'dmgPctMul' || sk === 'slamMul') p.summon[sk] = (p.summon[sk] || 1) * sv;
        else p.summon[sk] = sv;
      }
    } else if (k === 'buffMods') { if (p.buff) p.buff.mods.push(...v.map((m) => ({ s: m.s, v: m.v }))); }
    else if (k === 'burn') p.burn = { ...(p.burn || {}), ...v };
    else if (k === 'curse') {
      p.curse ||= { dur: 4 };
      for (const [ck, cv] of Object.entries(v)) {
        if (ck === 'vulnAdd') p.curse.vuln = (p.curse.vuln || 0) + cv;
        else p.curse[ck] = cv;
      }
    } else if (k === 'tags') { for (const t of v) if (!p.tags.includes(t)) p.tags.push(t); }
    else if (k === 'bleedMul' || k === 'poisonMul') p.extra[k] = (p.extra[k] || 1) * v;
    else if (k === 'extra') {
      for (const [ek, ev] of Object.entries(v)) {
        if (ek === 'critBonusAdd') p.extra.critBonus = (p.extra.critBonus || 0) + ev;
        else if (ek === 'critDmgBonusAdd') p.extra.critDmgBonus = (p.extra.critDmgBonus || 0) + ev;
        else if (ek === 'leechAdd') p.extra.leech = (p.extra.leech || 0) + ev;
        else if (ek === 'bleedMul' || ek === 'poisonMul') p.extra[ek] = (p.extra[ek] || 1) * ev;
        else p.extra[ek] = ev;
      }
    } else if (k.startsWith('add_')) p[k.slice(4)] = (p[k.slice(4)] || 0) + v;
    else p.extra[k] = v;
  }
  return p;
}

function addStatus(p, st) {
  p.statuses ||= [];
  const cur = p.statuses.find((s) => s.id === st.id);
  if (cur) Object.assign(cur, st); else p.statuses.push({ ...st });
}

// ---------------- 説明文
const r0 = (x) => String(Math.round(x));
const r1 = (x) => String(Math.round(x * 10) / 10);

/** スキルの説明文（{dmg} などを埋める）。p を渡せばそれを使う */
export function skillDesc(state, H, skillId, p = null) {
  const def = SKILL[skillId];
  if (!def) return '';
  p ||= resolveSkill(state, H, skillId);
  const dmg = p.dmgPct * p.dmgMul;
  const dur = p.buff?.dur || p.shield?.dur || p.curse?.dur || p.duration || 0;
  const map = {
    dmg: `武器ダメージの ${r0(dmg)}%`,
    dmgp: `${r0(dmg)}%`,
    radius: r0(p.radius),
    range: r0(p.range),
    count: r0(p.count),
    dur: r1(dur),
    cd: r1(p.cd),
    chain: r0(p.chain),
    pierce: r0(p.pierce),
    summons: r0(p.maxSummons || p.count),
    ttl: r1(p.summon?.ttl || p.duration || 0),
    tick: r1(p.tick),
    shield: r0(p.shield?.pct || 0),
    curse: r0((p.curse?.vuln || 0) * 100),
    explode: r0(p.explode),
    mark: r0((p.curse?.mark || 0) * 100),
    len: r0((p.extra.len || 0) * (p.extra.lenMul || 1) * (H.area || 1)),
    b0: r1(p.buff?.mods?.[0]?.v || 0),
    b1: r1(p.buff?.mods?.[1]?.v || 0),
    b2: r1(p.buff?.mods?.[2]?.v || 0),
  };
  return (def.desc || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

// ---------------- 目安の数値
/** 動作の速さ（1 = 基準）。武器の攻撃速度（REF_APS = 1.3 が基準）と攻撃速度の % で、攻撃も呪文も速くなる */
export function castSpeed(H, p) {
  const s = H.aps / REF_APS;
  return Math.max(0.25, Math.min(5, s || 1));
}

/** 1 回の平均ダメージ（クリティカル込み・敵の耐性なし） */
export function avgHit(H, p) {
  const w = (H.weapon.min + H.weapon.max) / 2 + H.addTotal;
  const inc = incFor(H, p.element, p.tags, p.id);
  const cc = H.ks?.precise ? 0 : Math.min(BAL.CRIT_CAP / 100, H.critChance + (p.extra?.critBonus || 0));
  const crit = 1 + cc * (H.critMult + (p.extra?.critDmgBonus || 0) - 1);
  return w * (p.dmgPct / 100) * p.dmgMul * (1 + inc / 100) * H.more * crit;
}

/** 1 回使ったときの合計ダメージ（当たる数の目安込み）と、次に使えるまでの時間 */
export function skillProfile(H, p) {
  const sp = castSpeed(H, p);
  const ct = p.castTime / sp;
  const isAttack = p.tags.includes('attack');
  let hit = avgHit(H, p) * (1 + (isAttack ? H.multistrike || 0 : 0)) * (1 + p.repeatChance * 0.8);
  if (H.ks?.legion && !p.tags.includes('minion')) hit *= 0.6;
  let per = 0; let busy = ct; let minion = 0;
  const tgt = (r) => Math.min(4, 1 + Math.max(0, r - 50) / 70);
  switch (p.behavior) {
    case 'melee': per = hit * tgt(p.radius || 50) * (p.extra.hits || 1); break;
    case 'projectile': case 'roll': {
      const n = p.count;
      let t = n > 1 ? Math.min(n, 3) * 0.75 : 1;
      if (p.pierce) t *= 1 + Math.min(2, p.pierce) * 0.25;
      if (p.explode) t += 0.6 * (tgt(p.explode) - 1) * Math.min(n, 2);
      per = hit * t; break;
    }
    case 'nova': per = hit * tgt(p.radius) * (p.extra.repeat ? 1 + p.extra.repeat.mult : 1); break;
    case 'rain': per = hit * Math.min(p.count, 8) * 0.55 * (p.extra.waves || 1); break;
    case 'chain': { let s = 0; let m = 1; const g = p.extra.chainGrow || 0.85; for (let i = 0; i <= Math.min(p.chain, 5); i++) { s += m; m *= g; } per = hit * s * 0.85; break; }
    case 'leap': case 'dash': case 'wave': per = hit * tgt(p.radius || 70) * (p.count > 1 ? Math.min(p.count, 3) * 0.6 : 1) * (p.extra.back ? 1 + p.extra.back : 1); break;
    case 'whirl': case 'flurry': case 'beam': {
      const ticks = p.duration / (p.tick / sp);
      busy = p.duration + ct;
      per = hit * ticks * (p.behavior === 'flurry' ? 1.3 : tgt(p.radius + 30));
      break;
    }
    case 'cloud': case 'wall': per = hit * (p.duration / p.tick) * 2; break;
    case 'aura': per = hit * (p.duration / (p.tick || 0.5)) * 2; break;
    case 'orbit': per = hit * (p.duration / p.tick) * Math.min(3, 0.6 * p.count) * 0.8; break;
    case 'trap': per = hit * tgt(p.radius); break;
    case 'meteor': per = hit * tgt(p.radius) * Math.max(1, p.count * 0.8) + (p.burn ? hit * p.burn.mult * (p.burn.dur / p.burn.tick) * 2 : 0); break;
    case 'corpse': per = hit * Math.min(p.count, 3) * 1.3; break;
    case 'summon': case 'turret': {
      const life = p.summon?.ttl ? Math.min(1, p.summon.ttl / Math.max(p.cd || 1, p.summon.ttl)) : 1;
      const mHit = avgHit(H, p) * ((p.summon?.multi || 1) * (p.summon?.multi ? 0.85 : 1)) * (p.summon?.slam ? 1.8 : 1);
      minion = mHit * (p.summon?.aps || 1) * (H.minionAs || 1) * Math.max(1, p.maxSummons) * life;
      per = 0; break;
    }
    case 'ult_cataclysm': per = hit * 4 * 1.9; break;
    case 'ult_barrage': per = hit * p.count * 0.5; break;
    case 'ult_starfall': per = hit * p.count * 0.8 * 1.8; break;
    case 'ult_deathmarch': per = hit * 3 + avgHit(H, p) * (p.summon?.dmgPct || 0.25) * p.count * (p.summon?.ttl || 15) * 1.2; break;
    case 'ult_shadowdance': per = hit * p.count * (H.ks?.precise ? 1 : H.critMult / (1 + H.critChance * (H.critMult - 1))); break; // 必ずクリティカル（一点の要石ではクリティカルしない）
    default: per = 0;
  }
  if (p.twin && per) per *= 2;
  per *= rangeFit(H, p);
  const period = Math.max(busy, p.cd || 0);
  return { per, period, busy, cost: Math.max(0, p.cost), gain: Math.max(0, -p.cost), minion, ct };
}

/** 表示用の DPS（そのスキルだけを使い続けたとき） */
export function estimateDps(state, H, skillId) {
  const p = resolveSkill(state, H, skillId);
  if (!p) return 0;
  return estimateDpsP(H, p);
}
export function estimateDpsP(H, p) {
  const pr = skillProfile(H, p);
  if (pr.minion) return pr.minion;
  return pr.period > 0 ? pr.per / pr.period : 0;
}

/**
 * スキルの並び全体の目安の DPS。待ち時間のある技 → リソースを使う技 → 残りの時間は基本攻撃、の順に時間を割り振る。
 * 強化（バフ）は効いている割合だけダメージの増加として足す。召喚物の DPS はそのまま足す。
 */
export function estimateBuildDps(state, H, opts = {}) {
  const bar = (opts.bar || state.hero.bar || []).filter((id) => id && state.hero.skills[id] && SKILL[id]);
  if (!bar.length) return 0;
  const ps = bar.map((id) => resolveSkill(state, H, id)).filter(Boolean);
  const basic = ps.find((p) => p.basic) || null;
  const bp = basic ? skillProfile(H, basic) : null;
  // リソースの出入り（1 秒あたり）: capLeft = 自然回復・強化の回復・撃破の回復 + 基本攻撃だけをしたときの回復
  // 技を 1 回使うと「消費 + その間に基本攻撃で得られたはずの回復」だけ capLeft が減る
  const ctb = bp ? Math.max(0.05, bp.period) : 1;
  const tgtB = basic ? (basic.behavior === 'melee' ? Math.min(3, 1 + Math.max(0, (basic.radius || 50) - 50) / 70) : 1) : 0;
  const gB = bp ? bp.gain + (H.resourceOnHit || 0) * tgtB : 0;
  let capLeft = (H.resourceRegen || 0) + (H.resourceOnKill || 0) * 0.6 + gB / ctb;
  for (const p of ps) if (!p.basic && p.cost < 0) capLeft += -p.cost / Math.max(1, p.cd || 1);
  let time = 1; let dps = 0; let buffInc = 0;
  for (const p of ps) {
    if (p.basic) continue;
    const pr = skillProfile(H, p);
    const lost = gB * pr.busy / ctb;
    if (pr.minion) {
      dps += pr.minion;
      const u = 1 / Math.max(pr.period, 4);
      time -= Math.min(time, pr.busy * u); capLeft -= u * (pr.cost + lost);
      continue;
    }
    if (p.behavior === 'buff' || p.behavior === 'barrier') {
      const up = Math.min(1, (p.buff?.dur || 0) / Math.max(p.cd || 1, p.buff?.dur || 1));
      for (const m of p.buff?.mods || []) if (m.s === 'inc_dmg' || m.s === 'attack_speed') buffInc += (m.v / 100) * up * (m.s === 'attack_speed' ? 1 : 1 / (1 + (H.incBase || 0) / 100));
      const u = 1 / Math.max(1, p.cd || 1);
      time -= Math.min(time, pr.ct * u); capLeft -= u * (pr.cost + lost);
      continue;
    }
    if (!pr.per) continue;
    const ultFactor = p.ult ? 0.6 : 1; // 奥義はエリート・ボスにだけ使う
    let uses = (1 / Math.max(0.05, pr.period)) * ultFactor;
    uses = Math.min(uses, time / Math.max(0.05, pr.busy));
    if (pr.cost > 0) uses = Math.min(uses, Math.max(0, capLeft) / (pr.cost + lost));
    if (!(uses > 0)) continue;
    dps += uses * pr.per;
    time -= uses * pr.busy;
    capLeft -= uses * (pr.cost + lost);
  }
  if (bp && time > 0) dps += (time / ctb) * bp.per;
  return dps * (1 + buffInc);
}

export { SKILL_MAX_LEVEL };
