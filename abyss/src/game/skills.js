// スキルの数値を決める（レベル・ルーン・補助・装備の力の書き換えをまとめる）。実際の動きは combat.js。

import { SKILL, SKILL_MAX_LEVEL } from '../data/skills.js';
import { skillLevel, incFor } from './character.js';

/** スキル 1 回分の数値（params）を作る。power フックの modifySkill は combat.js が後でかける */
export function resolveSkill(state, H, skillId) {
  const def = SKILL[skillId];
  if (!def) return null;
  const lvl = Math.max(1, skillLevel(state, H, skillId));
  const sk = state.hero.skills[skillId] || {};
  const p = {
    id: def.id,
    def,
    lvl,
    behavior: def.behavior,
    element: def.element || 'phys',
    tags: [...(def.tags || [])],
    dmgPct: (def.dmg?.[0] || 0) + (def.dmg?.[1] || 0) * (lvl - 1),
    cost: def.cost || 0,
    cd: def.cd || 0,
    castTime: def.castTime || 0.6,
    range: def.range || (def.behavior === 'nova' ? (def.radius || 150) : 120),
    radius: def.radius || 0,
    count: def.count || 1,
    speed: def.speed || 1000,
    pierce: def.pierce || 0,
    chain: def.chain || 0,
    spread: def.spread ?? 0.35,
    duration: def.duration || 0,
    delay: def.delay || 0,
    explode: def.explode || 0,
    maxSummons: def.maxSummons || 0,
    summon: def.summon ? { ...def.summon } : null,
    buff: def.buff ? { ...def.buff, mods: [...(def.buff.mods || [])] } : null,
    status: def.status ? { ...def.status } : null,
    basic: !!def.basic,
    dmgMul: 1,
    extra: {}, // 力（power）が自由に使う
  };
  // ルーン
  const rune = def.runes?.find((r) => r.id === sk.rune);
  if (rune?.mod) applyMod(p, rune.mod);
  // 補助（サポート）: 戦闘担当が registry 経由で足す。ここでは state の supports を読むだけ
  for (const sup of sk.supports || []) if (sup && sup.mod) applyMod(p, sup.mod);
  // 装備の全体効果
  if (p.tags.includes('projectile')) { p.count += H.projCount; p.pierce += H.pierce; }
  if (p.behavior === 'chain') p.chain += H.chain;
  if (p.radius) p.radius *= H.area;
  if (p.maxSummons) p.maxSummons += H.minionCount;
  const cdr = H.cdr + (H.S[`skill_cdr:${def.id}`] || 0) / 100;
  p.cd *= Math.max(0.4, 1 - cdr);
  if (p.cost > 0) p.cost *= 1 - H.costRed;
  return p;
}

/** ルーンや補助の mod を params にかける。数値は「倍率」か「上書き」か「加算」 */
export function applyMod(p, mod) {
  for (const [k, v] of Object.entries(mod)) {
    if (k === 'element') p.element = v;
    else if (k === 'status') p.status = { ...(p.status || {}), ...v };
    else if (k === 'summon') p.summon = { ...(p.summon || {}), ...v };
    else if (k === 'tags') { for (const t of v) if (!p.tags.includes(t)) p.tags.push(t); }
    else if (k === 'behavior') p.behavior = v;
    else if (k === 'dmgMul') p.dmgMul *= v;
    else if (k === 'radius' || k === 'cdMul' || k === 'castMul' || k === 'speedMul' || k === 'rangeMul') {
      if (k === 'radius') p.radius = (p.radius || 100) * v;
      if (k === 'cdMul') p.cd *= v;
      if (k === 'castMul') p.castTime *= v;
      if (k === 'speedMul') p.speed *= v;
      if (k === 'rangeMul') p.range *= v;
    } else if (k === 'count' || k === 'pierce' || k === 'chain' || k === 'maxSummons') {
      p[k] = typeof v === 'number' && v > 1 && k === 'count' ? Math.max(p[k], v) : p[k] + v;
    } else if (k.startsWith('add_')) { p[k.slice(4)] = (p[k.slice(4)] || 0) + v; }
    else p.extra[k] = v;
  }
}

/** スキルの説明文（{dmg} などを埋める） */
export function skillDesc(state, H, skillId) {
  const def = SKILL[skillId];
  if (!def) return '';
  const p = resolveSkill(state, H, skillId);
  return (def.desc || '')
    .replace('{dmg}', `武器ダメージの ${Math.round(p.dmgPct * p.dmgMul)}%`)
    .replace('{radius}', String(Math.round(p.radius)))
    .replace('{count}', String(p.count > 1 ? p.count : p.maxSummons || p.count))
    .replace('{dur}', String(p.duration));
}

/** 1 回の平均ダメージ（クリティカル込み・敵の耐性なし） */
export function avgHit(H, p) {
  const w = (H.weapon.min + H.weapon.max) / 2 + H.addTotal;
  const inc = incFor(H, p.element, p.tags, p.id);
  const crit = 1 + H.critChance * (H.critMult - 1);
  return w * (p.dmgPct / 100) * p.dmgMul * (1 + inc / 100) * H.more * crit;
}

/** 表示用の DPS（そのスキルだけを使い続けたとき） */
export function estimateDps(state, H, skillId) {
  const p = resolveSkill(state, H, skillId);
  if (!p) return 0;
  const hit = avgHit(H, p) * (1 + H.multistrike);
  const castTime = p.castTime / Math.max(0.2, H.aps / (H.weapon.aps || 1.2));
  const period = Math.max(castTime, p.cd || 0);
  let targets = 1;
  if (p.behavior === 'nova' || p.behavior === 'rain' || p.radius > 100) targets = 2.5;
  if (p.behavior === 'projectile' && p.count > 1) targets = Math.min(p.count, 3) * 0.8;
  if (p.behavior === 'chain') targets = Math.min(1 + p.chain, 4) * 0.8;
  if (p.behavior === 'summon') return hit * Math.max(1, p.maxSummons) * (p.summon?.aps || 1);
  return (hit * targets) / period;
}

export { SKILL_MAX_LEVEL };
