// 他担当モジュールへの安全なアクセス層。
// 名前空間 import にしているので、相手側に export が欠けていても読み込みエラーにならない。
// 呼び出しはすべて try/catch でガードし、失敗時は簡易フォールバックで描画する。
import * as CharM from '../render/character.js';
import * as IconM from '../render/icons.js';
import * as ItemsM from '../data/items.js';
import * as SkillsD from '../data/skills.js';
import * as MissD from '../data/missions.js';
import * as ProgM from '../systems/progression.js';
import * as InvM from '../systems/inventory.js';
import * as SkillS from '../systems/skills.js';
import * as LootM from '../systems/loot.js';
import { RARITY_FALLBACK, rrPath, txt, rgba } from './theme.js';

const warned = new Set();
export function guard(tag, fn, fb) {
  try {
    const v = fn();
    return v === undefined ? fb : v;
  } catch (e) {
    if (!warned.has(tag)) { warned.add(tag); console.warn('[ui] ' + tag + ' failed:', e); }
    return fb;
  }
}

export const HERO_NAMES = { luna: 'ルナ', jin: 'ジン' };

// ---- データ ----
export function getItemDef(id) {
  if (!id) return null;
  if (typeof id === 'object') return id;
  return guard('getItem', () => (typeof ItemsM.getItem === 'function' ? ItemsM.getItem(id) : null) || ItemsM.ITEMS?.[id] || null, null);
}
export function allItems() { return ItemsM.ITEMS || {}; }
export function starterEquip(heroId) { return ItemsM.STARTER_EQUIP?.[heroId] || null; }
export function allSkills() { return SkillsD.SKILLS || {}; }
export function skillDef(id) { return id ? (SkillsD.SKILLS?.[id] || null) : null; }
export function missionNpcName(id) { return MissD.MISSION_NPCS?.[id]?.name || null; }
export function turnInNpc(m) { return m?.turnIn || m?.giver; }
export function sellPriceOf(it) {
  if (!it) return 0;
  if (typeof InvM.sellPrice === 'function') { const v = guard('sellPrice', () => InvM.sellPrice(it.id), null); if (v != null) return v; }
  return it.sellPrice ?? Math.max(1, Math.floor((it.price || 0) * 0.3));
}
export function allMissions() { return MissD.MISSIONS || {}; }
export function missionDef(id) {
  if (!id) return null;
  if (typeof id === 'object') return id;
  return MissD.MISSIONS?.[id] || null;
}
export function rarityInfo(r) {
  const R = LootM.RARITY?.[r];
  const F = RARITY_FALLBACK[r] || RARITY_FALLBACK.common;
  const color = R?.color || F.color;
  // mythic は（RARITY 側に2色目が無ければ）フォールバックのグラデ2色目を使う
  const color2 = R?.color2 || (r === 'mythic' ? (F.color2 || '#3EE6D2') : null);
  return { name: R?.name || F.name, color, color2 };
}
export function skillMp(skill, lv) {
  return guard('skill.mp', () => (typeof skill.mp === 'function' ? skill.mp(Math.max(1, lv)) : (skill.mp || 0)), 0);
}
export function skillCd(skill, lv) {
  return guard('skill.cd', () => (typeof skill.cooldown === 'function' ? skill.cooldown(Math.max(1, lv)) : (skill.cooldown || 0)), 0);
}

// ---- 進行 ----
let statCache = { key: null, val: null };
export function stats(game) {
  const st = game?.state;
  if (!st) return {};
  const key = (game.ui?.frame ?? 0) + ':' + game.time + ':' + st.level;
  if (statCache.key === key && statCache.st === st) return statCache.val;
  let v = guard('computeStats', () => (typeof ProgM.computeStats === 'function' ? ProgM.computeStats(st) : null), null);
  if (!v) v = game.player?.stats || { maxHp: Math.max(st.hp || 1, 100), maxMp: Math.max(st.mp || 1, 50) };
  statCache = { key, st, val: v };
  return v;
}
export function computeStatsRaw(state) {
  return guard('computeStats', () => (typeof ProgM.computeStats === 'function' ? ProgM.computeStats(state) : null), null);
}
export function expNeed(level) {
  return guard('expToNext', () => (typeof ProgM.expToNext === 'function' ? ProgM.expToNext(level) : null), null)
    ?? Math.floor(20 + 15 * Math.pow(level || 1, 1.7));
}

// ---- インベントリ ----
export function countItem(state, id) {
  const f = InvM.countItem;
  if (typeof f === 'function') { const v = guard('countItem', () => f(state, id), null); if (v != null) return v; }
  let n = 0;
  for (const s of state?.inventory || []) if (s && s.id === id) n += s.qty || 1;
  return n;
}
export function doEquip(game, id) {
  if (typeof InvM.equip === 'function') return guard('equip', () => InvM.equip(game, id), { ok: false, msg: '装備できません' }) || { ok: true };
  // フォールバック（inventory.js 未実装時）
  const st = game.state, it = getItemDef(id);
  if (!it?.slot) return { ok: false, msg: '装備できません' };
  if ((it.reqLevel || 0) > (st.level || 1)) return { ok: false, msg: `Lv.${it.reqLevel} から装備できます` };
  const prev = st.equipped[it.slot];
  fbRemove(st, id, 1);
  if (prev) fbAdd(st, prev, 1);
  st.equipped[it.slot] = id;
  return { ok: true };
}
export function doUnequip(game, slot) {
  if (typeof InvM.unequip === 'function') return guard('unequip', () => InvM.unequip(game, slot), false);
  const st = game.state, id = st.equipped?.[slot];
  if (!id) return false;
  fbAdd(st, id, 1); st.equipped[slot] = null;
  return true;
}
export function doUseItem(game, id) {
  if (typeof InvM.useItem === 'function') return guard('useItem', () => InvM.useItem(game, id), false);
  return false;
}
export function doAddItem(game, id, qty = 1, opts) {
  if (typeof InvM.addItem === 'function') return guard('addItem', () => InvM.addItem(game, id, qty, opts), false);
  return fbAdd(game.state, id, qty);
}
export function doRemoveItem(state, id, qty = 1) {
  if (typeof InvM.removeItem === 'function') return guard('removeItem', () => InvM.removeItem(state, id, qty), false);
  return fbRemove(state, id, qty);
}
function fbAdd(st, id, qty) {
  const it = getItemDef(id);
  st.inventory = st.inventory || [];
  const stack = it && it.type !== 'equip' && !it.slot ? st.inventory.find((s) => s && s.id === id) : null;
  if (stack) { stack.qty = (stack.qty || 1) + qty; return true; }
  if (st.inventory.length >= 48) return false;
  st.inventory.push({ id, qty });
  return true;
}
function fbRemove(st, id, qty) {
  const i = (st.inventory || []).findIndex((s) => s && s.id === id);
  if (i < 0) return false;
  const s = st.inventory[i];
  s.qty = (s.qty || 1) - qty;
  if (s.qty <= 0) st.inventory.splice(i, 1);
  return true;
}
export function equipLooks(state) {
  const v = guard('getEquipLooks', () => (typeof InvM.getEquipLooks === 'function' ? InvM.getEquipLooks(state) : null), null);
  if (v) return v;
  const out = {};
  for (const [slot, id] of Object.entries(state?.equipped || {})) out[slot] = getItemDef(id)?.look || null;
  return out;
}
// NPC等の equip が itemId でも look でも受け付ける
export function looksFrom(equip) {
  const out = {};
  for (const [slot, v] of Object.entries(equip || {})) {
    out[slot] = typeof v === 'string' ? (getItemDef(v)?.look || null) : (v || null);
  }
  return out;
}

// ---- スキル ----
export function cooldown(id) {
  return guard('getCooldown', () => (typeof SkillS.getCooldown === 'function' ? SkillS.getCooldown(id) : null), null) || { left: 0, total: 0 };
}
export function doLearn(game, id) {
  return guard('learnSkill', () => (typeof SkillS.learnSkill === 'function' ? SkillS.learnSkill(game, id) : false), false);
}

// ---- 描画 ----
export function heroLook(id) { return CharM.HERO_LOOKS?.[id] || null; }

export function drawChar(ctx, x, y, look, equip, anim) {
  ctx.save();
  let ok = false;
  if (typeof CharM.drawCharacter === 'function' && look) {
    ok = guard('drawCharacter', () => { CharM.drawCharacter(ctx, x, y, look, equip || {}, anim); return true; }, false);
  }
  ctx.restore();
  if (!ok) {
    // フォールバック: シルエット
    const s = anim?.scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(0, -56, 22, 0, Math.PI * 2); ctx.fill();
    rrPath(ctx, -16, -36, 32, 36, 10); ctx.fill();
    ctx.restore();
  }
}

export function drawItemIco(ctx, item, x, y, size) {
  if (!item) return;
  if (typeof IconM.drawItemIcon === 'function') {
    ctx.save();
    const ok = guard('drawItemIcon', () => { IconM.drawItemIcon(ctx, item, x, y, size); return true; }, false);
    ctx.restore();
    if (ok) return;
  }
  const c = item.look?.color || rarityInfo(item.rarity).color;
  ctx.save();
  rrPath(ctx, x - size * 0.38, y - size * 0.38, size * 0.76, size * 0.76, size * 0.18);
  ctx.fillStyle = rgba(c, 0.85); ctx.fill();
  ctx.restore();
  txt(ctx, (item.name || '?').slice(0, 1), x, y + 1, { size: size * 0.42, align: 'center' });
}

export function drawSkillIco(ctx, skill, x, y, size) {
  if (!skill) return;
  if (typeof IconM.drawSkillIcon === 'function') {
    ctx.save();
    const ok = guard('drawSkillIcon', () => { IconM.drawSkillIcon(ctx, skill, x, y, size); return true; }, false);
    ctx.restore();
    if (ok) return;
  }
  ctx.save();
  const g = ctx.createRadialGradient(x, y - size * 0.15, 2, x, y, size * 0.5);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.3, skill.color || '#19d3c5');
  g.addColorStop(1, rgba(skill.color || '#19d3c5', 0.2));
  rrPath(ctx, x - size * 0.42, y - size * 0.42, size * 0.84, size * 0.84, size * 0.2);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  txt(ctx, (skill.name || '?').slice(0, 1), x, y + 1, { size: size * 0.4, align: 'center' });
}
