// エフェクトの「職スタイル」解決（skills.js の spawnEffect 呼び出しは type と color しか渡さないため、
// 色 → 習得済みスキル → 職の系統(branch)・段階(tier)・種類(kind) を逆引きする）
// 装備（武器の★・レア度）による軌跡色もここで解決する。純関数＋小さなキャッシュのみ。
import { SKILLS } from '../data/skills.js';
import { JOBS, currentJobOf } from '../data/jobs.js';
import { ITEMS } from '../data/items.js';

let INDEX = null; // color(lower) → [{id, branch, tier, kind, move, hero, sk}]
function buildIndex() {
  INDEX = new Map();
  for (const sk of Object.values(SKILLS)) {
    if (!sk || !sk.color) continue;
    const j = sk.reqJob ? JOBS[sk.reqJob] : null;
    const ent = {
      id: sk.id, sk, kind: sk.kind, hero: sk.hero,
      branch: j ? j.branch : null, tier: j ? j.tier : 0,
      move: sk.kind === 'move' && sk.move ? sk.move.type : null,
    };
    const key = String(sk.color).toLowerCase();
    if (!INDEX.has(key)) INDEX.set(key, []);
    INDEX.get(key).push(ent);
  }
}

// 1次職を持たない（見習い・既存スキル）ときのクラス既定の系統
const HERO_BRANCH = { luna: 'gunslinger', jin: 'streetfighter', hacker: 'netrunner' };

/** 現在の職 → {branch, tier} */
export function jobStyleOf(state) {
  let j = null;
  try { j = state ? currentJobOf(state) : null; } catch (e) { j = null; }
  if (j && j.branch) return { branch: j.branch, tier: j.tier || 0, aura: j.aura || null };
  return { branch: state ? HERO_BRANCH[state.heroId] || null : null, tier: 0, aura: null };
}

/**
 * resolveSkillStyle(game, color, wantKinds?) → {skill, branch, tier, kind, move} | null
 * 色が一致し、かつ習得済み（Lv>0）のスキルを優先。同色が複数なら段階の高いもの。
 */
export function resolveSkillStyle(game, color, wantKinds) {
  if (!color || !game || !game.state) return null;
  if (!INDEX) { try { buildIndex(); } catch (e) { INDEX = new Map(); } }
  const st = game.state;
  const key = String(color).toLowerCase();
  const list = INDEX.get(key);
  if (!list) return null;
  const skills = st.skills || {};
  let best = null, bestScore = -1;
  for (const e of list) {
    const lv = skills[e.id] || 0;
    if (wantKinds && wantKinds.indexOf(e.kind) < 0) continue;
    let score = e.tier;
    if (lv > 0) score += 10;
    if (e.hero === st.heroId || e.hero === 'both') score += 5;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  if (!best) return null;
  if ((skills[best.id] || 0) <= 0 && best.hero !== st.heroId) return null;
  const js = jobStyleOf(st);
  return {
    skill: best.sk, id: best.id, kind: best.kind, move: best.move,
    branch: best.branch || js.branch, tier: best.tier || 0,
  };
}

// ---------------------------------------------------------------- 装備の軌跡
const RAR_COL = { common: null, rare: '#4fa8ff', epic: '#b45cff', legendary: '#ffc93c', mythic: 'rainbow', pet: null };
/**
 * gearTrail(game) → {star, rarity, color|null, rainbow, glow(0..1), afterglow(bool)}
 *  - ★: game.player.weaponStar → state.equippedInst.weapon.star
 *  - レア度: equippedInst.weapon.id / equipped.weapon → ITEMS.rarity
 */
const GT = { star: 0, rarity: 'common', color: null, rainbow: false, glow: 0, afterglow: false, key: '' };
export function gearTrail(game) {
  const st = game && game.state;
  const inst = st && st.equippedInst && st.equippedInst.weapon;
  const id = (inst && (inst.id || inst.itemId)) || (st && st.equipped && st.equipped.weapon) || null;
  let star = game && game.player && game.player.weaponStar;
  if (star == null) star = inst && inst.star != null ? inst.star : 0;
  star = star | 0;
  const key = id + '|' + star;
  if (GT.key === key) return GT;
  const it = id ? ITEMS[id] : null;
  const rarity = (it && it.rarity) || 'common';
  GT.key = key; GT.star = star; GT.rarity = rarity;
  const rc = RAR_COL[rarity] || null;
  GT.rainbow = rc === 'rainbow';
  GT.color = GT.rainbow ? '#ff4fd8' : star >= 20 ? '#fff06a' : star >= 15 ? (rc || '#7df9ff') : rc;
  GT.glow = Math.min(1, star / 25 + (rarity === 'legendary' ? 0.25 : rarity === 'epic' ? 0.12 : 0));
  GT.afterglow = star >= 15 || GT.rainbow;
  return GT;
}

export const RAINBOW = ['#ff4f6d', '#ff9a3c', '#ffe066', '#5cff9a', '#3ee6d2', '#4fa8ff', '#b45cff', '#ff4fd8'];
export function rainbowAt(t) { const n = RAINBOW.length; return RAINBOW[(((t % n) + n) % n) | 0]; }

// 系統の既定カラー・決めゼリフ（カットイン）
export const BRANCH_STYLE = {
  gunslinger: { col: '#ff3d7f', sub: '#ffd23f', line: '狙った獲物は外さない！' },
  neondancer: { col: '#19f0ff', sub: '#c77dff', line: 'ステージの主役はアタシ！' },
  streetfighter: { col: '#ff8a00', sub: '#ff3b3b', line: 'この拳で、街ごと黙らせる！' },
  nightracer: { col: '#7b5cff', sub: '#19f0ff', line: 'アクセル全開、置いてくぜ！' },
  netrunner: { col: '#3dff8a', sub: '#b6ff3d', line: 'システム掌握――実行(Run)！' },
  dronemaster: { col: '#ffb000', sub: '#ffe14d', line: '全機発進、制圧開始！' },
};
