// インベントリ・装備・アイテム使用
import { ITEMS, EQUIP_SLOTS } from '../data/items.js';
import { computeStats, clampVitals, addBuff } from './progression.js';
import { spawnEffect, spawnDamageNumber } from '../render/effects.js';

export const MAX_SLOTS = 48;
export const MAX_STACK = 999;

function isStackable(it) { return it && it.type !== 'equip'; }

export function countItem(state, id) {
  let n = 0;
  for (const s of state.inventory || []) if (s && s.id === id) n += s.qty || 1;
  return n;
}

export function freeSlots(state) {
  return MAX_SLOTS - (state.inventory || []).filter(Boolean).length;
}

// 状態だけを操作する版（UI・テスト向け）
export function addItemToState(state, id, qty = 1) {
  const it = ITEMS[id];
  if (!it || qty <= 0) return false;
  const inv = state.inventory || (state.inventory = []);
  if (isStackable(it)) {
    let left = qty;
    // 必要スロット数を先に確認
    let room = 0;
    for (const s of inv) if (s && s.id === id) room += MAX_STACK - s.qty;
    const needNew = Math.max(0, Math.ceil((left - room) / MAX_STACK));
    if (needNew > freeSlots(state)) return false;
    for (const s of inv) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < MAX_STACK) {
        const add = Math.min(left, MAX_STACK - s.qty);
        s.qty += add; left -= add;
      }
    }
    while (left > 0) {
      const add = Math.min(left, MAX_STACK);
      inv.push({ id, qty: add }); left -= add;
    }
    return true;
  }
  if (qty > freeSlots(state)) return false;
  for (let i = 0; i < qty; i++) inv.push({ id, qty: 1 });
  return true;
}

/** addItem(game, id, qty=1, opts={silent}) → bool。レア以上の装備は rareDrop を emit（silent で抑制） */
export function addItem(game, id, qty = 1, opts = {}) {
  const st = game.state;
  const it = ITEMS[id];
  if (!it) return false;
  if (!addItemToState(st, id, qty)) {
    if (!opts.silent) game.notify?.('インベントリがいっぱいです！', '#ff5555');
    return false;
  }
  if (it.type === 'equip' && it.rarity !== 'common') {
    if (!st.rareFound) st.rareFound = [];
    if (!st.rareFound.includes(id)) st.rareFound.push(id);
    if (!opts.silent) game.events?.emit('rareDrop', { item: it });
  }
  return true;
}

export function removeItem(state, id, qty = 1) {
  if (countItem(state, id) < qty) return false;
  const inv = state.inventory;
  let left = qty;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const s = inv[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(left, s.qty);
    s.qty -= take; left -= take;
    if (s.qty <= 0) inv.splice(i, 1);
  }
  return true;
}

/** equip(game, itemId) → {ok, msg} */
export function equip(game, itemId) {
  const st = game.state;
  const it = ITEMS[itemId];
  if (!it || it.type !== 'equip') return { ok: false, msg: '装備できないアイテムです' };
  if (countItem(st, itemId) <= 0) return { ok: false, msg: 'アイテムを持っていません' };
  if ((it.reqLevel || 0) > st.level) return { ok: false, msg: `Lv.${it.reqLevel} 以上が必要です` };
  const slot = it.slot;
  const prev = st.equipped[slot];
  removeItem(st, itemId, 1);
  if (prev) addItemToState(st, prev, 1); // 1枠空いたので必ず入る
  st.equipped[slot] = itemId;
  clampVitals(st);
  game.events?.emit('equipChanged', { slot });
  return { ok: true, msg: `${it.name} を装備した` };
}

/** unequip(game, slot) → {ok, msg} */
export function unequip(game, slot) {
  const st = game.state;
  const id = st.equipped[slot];
  if (!id) return { ok: false, msg: '何も装備していません' };
  if (freeSlots(st) <= 0) return { ok: false, msg: 'インベントリがいっぱいです' };
  addItemToState(st, id, 1);
  st.equipped[slot] = null;
  clampVitals(st);
  game.events?.emit('equipChanged', { slot });
  return { ok: true, msg: `${ITEMS[id].name} を外した` };
}

/** getEquipLooks(state) → {slot: look|null} */
export function getEquipLooks(state) {
  const o = {};
  for (const slot of EQUIP_SLOTS) {
    const id = state.equipped?.[slot];
    o[slot] = id && ITEMS[id] ? ITEMS[id].look : null;
  }
  return o;
}

/** useItem(game, id) → bool。消費アイテムを使う（装備品なら equip） */
export function useItem(game, id) {
  const st = game.state;
  const it = ITEMS[id];
  if (!it) return false;
  if (it.type === 'equip') {
    const r = equip(game, id);
    game.notify?.(r.msg, r.ok ? '#ffffff' : '#ff5555');
    return r.ok;
  }
  if (it.type !== 'consumable') return false;
  if (countItem(st, id) <= 0) { game.notify?.(`${it.name} を持っていません`, '#ff5555'); return false; }
  if (st.hp <= 0) return false;
  const s = computeStats(st);
  const e = it.effect || {};
  const hpGain = Math.min(s.maxHp - st.hp, Math.round((e.hp || 0) + (e.hpPct || 0) * s.maxHp));
  const mpGain = Math.min(s.maxMp - st.mp, Math.round((e.mp || 0) + (e.mpPct || 0) * s.maxMp));
  if (!e.buff && hpGain <= 0 && mpGain <= 0) {
    game.notify?.('すでに満タンです', '#aaaaaa');
    return false;
  }
  removeItem(st, id, 1);
  st.hp += Math.max(0, hpGain);
  st.mp += Math.max(0, mpGain);
  const p = game.player;
  if (p) {
    if (hpGain > 0) spawnDamageNumber(game, p.x, p.y - p.h - 10, hpGain, { heal: true });
    if (mpGain > 0) spawnDamageNumber(game, p.x + 18, p.y - p.h - 30, mpGain, { heal: true, mp: true });
    spawnEffect(game, e.buff ? 'buff' : 'heal', p.x, p.y, { color: e.buff?.color });
  }
  if (e.buff) {
    addBuff(game, e.buff);
    game.notify?.(`${it.name}！ ${it.desc}`, e.buff.color || '#19f0ff');
  }
  return true;
}

// ---- ショップ補助 ----
export function buyItem(game, id, qty = 1) {
  const it = ITEMS[id];
  if (!it) return { ok: false, msg: '不明なアイテム' };
  const cost = it.price * qty;
  if (game.state.money < cost) return { ok: false, msg: 'お金が足りません' };
  if (!addItemToState(game.state, id, qty)) return { ok: false, msg: 'インベントリがいっぱいです' };
  game.state.money -= cost;
  return { ok: true, msg: `${it.name} x${qty} を購入した（-$${cost}）` };
}

export function sellPrice(id) {
  const it = ITEMS[id];
  return it ? Math.max(1, Math.floor(it.price * 0.3)) : 0;
}

export function sellItem(game, id, qty = 1) {
  const it = ITEMS[id];
  if (!it) return { ok: false, msg: '不明なアイテム' };
  if (!removeItem(game.state, id, qty)) return { ok: false, msg: '数が足りません' };
  const gain = sellPrice(id) * qty;
  game.state.money += gain;
  return { ok: true, msg: `${it.name} x${qty} を売却した（+$${gain}）` };
}
