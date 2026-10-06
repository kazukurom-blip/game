// インベントリ・装備・アイテム使用
// v3: 装備はインスタンス化（1 個ずつ固有の uid / ★ / 潜在を持つ）
//   インベントリの装備エントリ: {id, qty:1, uid:'#..', star:0, pot:null|{grade, lines:[{stat,value,grade}]}, tunePity, potPity, potLocks, potPending}
//   装備中: state.equipped[slot] = itemId（互換のため従来どおり）、state.equippedInst[slot] = インスタンス
//   itemRef（tune/potential/equip/sell が受け付ける指定）:
//     - インベントリのエントリそのもの / {uid} / '#uid' 文字列 … そのインスタンス
//     - {slot:'weapon'} … 装備中のインスタンス
//     - 数値 / {index} … インベントリの添字
//     - itemId 文字列 … 装備中を優先、なければインベントリ内で★・潜在が最も良いもの（equip はインベントリのみ）
import { ITEMS, EQUIP_SLOTS, WEAR_SLOTS, canWearGender, itemGender, GENDER_ONLY_LABEL } from '../data/items.js';
import { gradeIndex } from '../data/gear.js';
import { computeStats, clampVitals, addBuff } from './progression.js';
import { spawnEffect, spawnDamageNumber } from '../render/effects.js';
import { maybePotential } from './potential.js';
import { feedPet } from './petSkills.js';
import { useReturnScroll, useTownScroll } from './scrolls.js';

export const MAX_SLOTS = 48;
export const MAX_STACK = 999;

function isStackable(it) { return it && it.type !== 'equip'; }
export function isEquipId(id) { return ITEMS[id]?.type === 'equip'; }

export function countItem(state, id) {
  let n = 0;
  for (const s of state.inventory || []) if (s && s.id === id) n += s.qty || 1;
  return n;
}

export function freeSlots(state) {
  return MAX_SLOTS - (state.inventory || []).filter(Boolean).length;
}

// ============================================================ 装備インスタンス
function randTag() { return Math.floor(Math.random() * 36 ** 3).toString(36).padStart(3, '0'); }
/** 新しい uid（'#' で始まる。itemId と衝突しない） */
export function newUid(state) {
  state.uidSeq = (Number.isInteger(state.uidSeq) ? state.uidSeq : 0) + 1;
  return '#' + state.uidSeq.toString(36) + randTag();
}

/** 装備インスタンスを作る（state のインベントリには入れない） */
export function newEquipInst(state, id, opts = {}) {
  const it = ITEMS[id];
  const inst = { id, qty: 1, uid: opts.uid || newUid(state), star: 0, pot: null, tunePity: 0, potPity: 0 };
  if (it?.slot !== 'pet') {
    if (Number.isInteger(opts.star) && opts.star > 0) inst.star = opts.star;
    if (opts.pot && typeof opts.pot === 'object' && Array.isArray(opts.pot.lines)) inst.pot = clonePot(opts.pot);
    if (Number.isInteger(opts.tunePity)) inst.tunePity = opts.tunePity;
    if (Number.isInteger(opts.potPity)) inst.potPity = opts.potPity;
  }
  return inst;
}
function clonePot(p) { return p ? { grade: p.grade, lines: (p.lines || []).map((l) => ({ ...l })) } : null; }

/** インスタンスの価値（売却・削除の優先順。小さいほど先に手放す） */
function instValue(s) {
  return (s?.star || 0) * 10 + (s?.pot ? 1 + gradeIndex(s.pot.grade) : 0);
}

/**
 * インベントリ・装備の整合性を保つ（uid の無い装備エントリに uid を振る、qty>1 の装備を分割、equippedInst を同期）。
 * migrateState・各操作の前に呼ぶ。冪等。
 */
export function normalizeInventory(state) {
  if (!state) return state;
  if (!Array.isArray(state.inventory)) state.inventory = [];
  const out = [];
  const seen = new Set();
  for (const s of state.inventory) {
    if (!s || !ITEMS[s.id]) continue;
    if (!isEquipId(s.id)) { out.push(s); continue; }
    const n = Math.max(1, Math.floor(s.qty || 1));
    for (let i = 0; i < n; i++) {
      const inst = i === 0 ? s : newEquipInst(state, s.id);
      inst.qty = 1;
      if (typeof inst.uid !== 'string' || !inst.uid.startsWith('#') || seen.has(inst.uid)) inst.uid = newUid(state);
      if (!Number.isInteger(inst.star) || inst.star < 0) inst.star = 0;
      if (inst.pot !== null && (typeof inst.pot !== 'object' || !Array.isArray(inst.pot?.lines))) inst.pot = null;
      if (!Number.isInteger(inst.tunePity)) inst.tunePity = 0;
      if (!Number.isInteger(inst.potPity)) inst.potPity = 0;
      seen.add(inst.uid);
      out.push(inst);
    }
  }
  state.inventory = out;
  syncEquippedInst(state, seen);
  return state;
}

/** equippedInst を equipped（itemId）に合わせる */
export function syncEquippedInst(state, seen = null) {
  if (!state) return;
  if (!state.equippedInst || typeof state.equippedInst !== 'object') state.equippedInst = {};
  const ei = state.equippedInst;
  for (const slot of EQUIP_SLOTS) {
    const id = state.equipped?.[slot] || null;
    if (!id) { ei[slot] = null; continue; }
    const cur = ei[slot];
    if (!cur || cur.id !== id) ei[slot] = newEquipInst(state, id);
    else {
      if (typeof cur.uid !== 'string' || !cur.uid.startsWith('#') || seen?.has(cur.uid)) cur.uid = newUid(state);
      if (!Number.isInteger(cur.star)) cur.star = 0;
      if (cur.pot && !Array.isArray(cur.pot.lines)) cur.pot = null;
      cur.qty = 1;
    }
    seen?.add(ei[slot].uid);
  }
  for (const k of Object.keys(ei)) if (!EQUIP_SLOTS.includes(k)) delete ei[k];
}

/** 装備中のインスタンス（equipped と整合しているものだけ。整合していなければ null） */
export function equippedInstOf(state, slot) {
  const id = state?.equipped?.[slot];
  const inst = state?.equippedInst?.[slot];
  return id && inst && inst.id === id ? inst : null;
}

function bestInvIndex(state, id) {
  let bi = -1, bv = -1;
  (state.inventory || []).forEach((s, i) => { if (s && s.id === id && instValue(s) > bv) { bv = instValue(s); bi = i; } });
  return bi;
}

/**
 * resolveItemRef(state, ref) → {inst, where:'inv'|'equipped', index?, slot?} | null
 * opts.invOnly: インベントリ内のみ
 */
export function resolveItemRef(state, ref, opts = {}) {
  if (!state || ref == null) return null;
  const inv = state.inventory || [];
  const byUid = (uid) => {
    const i = inv.findIndex((s) => s && s.uid === uid);
    if (i >= 0) return { inst: inv[i], where: 'inv', index: i };
    if (opts.invOnly) return null;
    for (const slot of EQUIP_SLOTS) { const e = equippedInstOf(state, slot); if (e && e.uid === uid) return { inst: e, where: 'equipped', slot }; }
    return null;
  };
  const byIndex = (i) => (Number.isInteger(i) && inv[i] ? { inst: inv[i], where: 'inv', index: i } : null);
  if (typeof ref === 'number') return byIndex(ref);
  if (typeof ref === 'string') {
    if (ref.startsWith('#')) return byUid(ref);
    if (!opts.invOnly) for (const slot of EQUIP_SLOTS) { const e = equippedInstOf(state, slot); if (e && e.id === ref) return { inst: e, where: 'equipped', slot }; }
    const i = isEquipId(ref) ? bestInvIndex(state, ref) : inv.findIndex((s) => s && s.id === ref);
    return i >= 0 ? byIndex(i) : null;
  }
  if (typeof ref === 'object') {
    if (typeof ref.uid === 'string') return byUid(ref.uid);
    if (Number.isInteger(ref.index)) return byIndex(ref.index);
    if (ref.slot && EQUIP_SLOTS.includes(ref.slot) && !opts.invOnly) {
      const e = equippedInstOf(state, ref.slot);
      return e ? { inst: e, where: 'equipped', slot: ref.slot } : null;
    }
    if (typeof ref.id === 'string') return resolveItemRef(state, ref.id, opts);
  }
  return null;
}

/** 全装備インスタンス（インベントリ＋装備中）。UI の強化/潜在窓の一覧用 */
export function equipInstances(state, opts = {}) {
  const out = [];
  for (const slot of EQUIP_SLOTS) { const e = equippedInstOf(state, slot); if (e) out.push({ inst: e, item: ITEMS[e.id], where: 'equipped', slot }); }
  (state.inventory || []).forEach((s, i) => { if (s && isEquipId(s.id)) out.push({ inst: s, item: ITEMS[s.id], where: 'inv', index: i }); });
  return opts.noPet ? out.filter((e) => e.item.slot !== 'pet') : out;
}

/** 表示名: 「ネオンソード ★7」 */
export function instLabel(inst) {
  const it = ITEMS[inst?.id];
  if (!it) return '';
  return it.name + (inst.star ? ` ★${inst.star}` : '');
}

// ============================================================ 追加・削除
/**
 * 状態だけを操作する版（UI・テスト向け）。
 * opts（装備のみ）: {star, pot, uid, inst}（inst = 既存インスタンスをそのまま入れる）
 */
export function addItemToState(state, id, qty = 1, opts = {}) {
  const it = ITEMS[id];
  if (!it || qty <= 0) return false;
  const inv = state.inventory || (state.inventory = []);
  const ok = _addRaw(state, inv, it, id, qty, opts);
  if (ok) (state.itemsFound ||= {})[id] = true; // 図鑑のドロップ表示用（入手したことがある）
  return ok;
}

function _addRaw(state, inv, it, id, qty, opts) {
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
  for (let i = 0; i < qty; i++) {
    if (i === 0 && opts.inst && opts.inst.id === id) {
      const inst = opts.inst;
      inst.qty = 1;
      if (typeof inst.uid !== 'string' || !inst.uid.startsWith('#') || hasUid(state, inst.uid)) inst.uid = newUid(state);
      inv.push(inst);
    } else inv.push(newEquipInst(state, id, i === 0 ? opts : {}));
  }
  return true;
}
function hasUid(state, uid) {
  return (state.inventory || []).some((s) => s && s.uid === uid) || EQUIP_SLOTS.some((k) => state.equippedInst?.[k]?.uid === uid);
}

/** 既存インスタンスをインベントリに入れる → 入れたインスタンス | null */
export function addEquipInst(state, inst) {
  if (!inst || !isEquipId(inst.id)) return null;
  return addItemToState(state, inst.id, 1, { inst }) ? inst : null;
}

/**
 * addItem(game, id, qty=1, opts={silent, pot, star}) → bool。レア以上の装備は rareDrop、PET はさらに petDrop を emit（silent で抑制）
 *  v3: 装備は低確率（6%）で潜在付き（opts.pot が undefined のとき maybePotential。null で付けない）。
 *      PET の自動売却は drop.js の 'itemPicked' イベントで petSkills が処理する
 */
export function addItem(game, id, qty = 1, opts = {}) {
  const st = game.state;
  const it = ITEMS[id];
  if (!it) return false;
  const addOpts = {};
  if (it.type === 'equip' && it.slot !== 'pet') {
    const pot = opts.pot !== undefined ? opts.pot : maybePotential(it);
    if (pot) addOpts.pot = pot;
    if (Number.isInteger(opts.star)) addOpts.star = opts.star;
  }
  if (!addItemToState(st, id, qty, addOpts)) {
    if (!opts.silent) game.notify?.('インベントリがいっぱいです！', '#ff5555');
    return false;
  }
  if (it.type === 'equip' && it.rarity !== 'common') {
    if (!st.rareFound) st.rareFound = [];
    if (!st.rareFound.includes(id)) st.rareFound.push(id);
    if (!opts.silent) game.events?.emit('rareDrop', { item: it });
    if (it.slot === 'pet' && !opts.silent) {
      game.notify?.(`★PET★ ${it.name} を手に入れた！`, '#ff6fd8');
      game.events?.emit('petDrop', { item: it });
    }
  }
  if (addOpts.pot && !opts.silent) game.events?.emit('potentialDrop', { item: it, grade: addOpts.pot.grade });
  return true;
}

/**
 * removeItem(state, idOrUid, qty=1) → bool
 *  装備は ★・潜在の低いインスタンスから先に削除。'#uid' でそのインスタンスを削除
 */
export function removeItem(state, id, qty = 1) {
  const inv = state.inventory || [];
  if (typeof id === 'string' && id.startsWith('#')) {
    const i = inv.findIndex((s) => s && s.uid === id);
    if (i < 0) return false;
    inv.splice(i, 1);
    return true;
  }
  if (countItem(state, id) < qty) return false;
  if (isEquipId(id)) {
    const idx = inv.map((s, i) => (s && s.id === id ? i : -1)).filter((i) => i >= 0)
      .sort((a, b) => instValue(inv[a]) - instValue(inv[b]) || b - a).slice(0, qty).sort((a, b) => b - a);
    for (const i of idx) inv.splice(i, 1);
    return true;
  }
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

// ============================================================ 装備
/** equip(game, itemRef) → {ok, msg}。itemId ならインベントリ内の最良インスタンス */
export function equip(game, itemRef) {
  const st = game.state;
  normalizeInventory(st);
  const id0 = typeof itemRef === 'string' && !itemRef.startsWith('#') ? itemRef : null;
  if (id0 && (!ITEMS[id0] || ITEMS[id0].type !== 'equip')) return { ok: false, msg: '装備できないアイテムです' };
  const r = resolveItemRef(st, itemRef, { invOnly: true });
  if (!r) return { ok: false, msg: 'アイテムを持っていません' };
  const inst = r.inst;
  const it = ITEMS[inst.id];
  if (!it || it.type !== 'equip') return { ok: false, msg: '装備できないアイテムです' };
  if ((it.reqLevel || 0) > st.level) return { ok: false, msg: `Lv.${it.reqLevel} 以上が必要です` };
  if (!canWearGender(it, st.gender)) return { ok: false, msg: `${GENDER_ONLY_LABEL[itemGender(it)]}の装備です` };
  const slot = it.slot;
  const prev = equippedInstOf(st, slot);
  st.inventory.splice(r.index, 1);
  if (prev) st.inventory.splice(r.index, 0, prev); // 外した装備は同じ位置へ（1枠空いたので必ず入る）
  st.equipped[slot] = inst.id;
  st.equippedInst[slot] = inst;
  clampVitals(st);
  game.events?.emit('equipChanged', { slot });
  return { ok: true, msg: `${instLabel(inst)} を装備した` };
}

/** unequip(game, slot) → {ok, msg} */
export function unequip(game, slot) {
  const st = game.state;
  const id = st.equipped[slot];
  if (!id) return { ok: false, msg: '何も装備していません' };
  if (freeSlots(st) <= 0) return { ok: false, msg: 'インベントリがいっぱいです' };
  syncEquippedInst(st);
  const inst = st.equippedInst[slot];
  addItemToState(st, id, 1, { inst });
  st.equipped[slot] = null;
  st.equippedInst[slot] = null;
  clampVitals(st);
  game.events?.emit('equipChanged', { slot });
  return { ok: true, msg: `${ITEMS[id].name} を外した` };
}

/** getEquipLooks(state, {includePet}) → {slot: look|null}（pet は includePet 時のみ。drawCharacter には不要） */
export function getEquipLooks(state, opts = {}) {
  const o = {};
  for (const slot of opts.includePet ? EQUIP_SLOTS : WEAR_SLOTS) {
    const id = state.equipped?.[slot];
    o[slot] = id && ITEMS[id] ? ITEMS[id].look : null;
  }
  return o;
}

/** equipStars(state) → {slot: ★}（アート担当: ★段階でスキル軌跡を変える用） */
export function equipStars(state) {
  const o = {};
  for (const slot of EQUIP_SLOTS) o[slot] = equippedInstOf(state, slot)?.star || 0;
  return o;
}

/** useItem(game, id) → bool。消費アイテムを使う（装備品なら equip、PETの餌なら feedPet） */
export function useItem(game, id) {
  const st = game.state;
  const it = ITEMS[typeof id === 'string' && id.startsWith('#') ? resolveItemRef(st, id)?.inst?.id : id];
  if (!it) return false;
  if (it.type === 'equip') {
    const r = equip(game, id);
    game.notify?.(r.msg, r.ok ? '#ffffff' : '#ff5555');
    return r.ok;
  }
  if (it.use === 'petFood') return feedPet(game, it.id).ok;
  if (it.use === 'returnScroll') return useReturnScroll(game, it.id);
  if (it.use === 'townScroll') return useTownScroll(game, it.id);
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

/** 装備中の PET のアイテム定義（なければ null） */
export function equippedPet(state) {
  const id = state?.equipped?.pet;
  return id && ITEMS[id] ? ITEMS[id] : null;
}

// ---- ショップ補助 ----
export function buyItem(game, id, qty = 1) {
  const it = ITEMS[id];
  if (!it) return { ok: false, msg: '不明なアイテム' };
  const cost = it.price * qty;
  if (game.state.money < cost) return { ok: false, msg: 'お金が足りません' };
  if (!addItemToState(game.state, id, qty)) return { ok: false, msg: 'インベントリがいっぱいです' };
  game.state.money -= cost;
  game.events?.emit('itemBought', { id, qty, cost });
  return { ok: true, msg: `${it.name} x${qty} を購入した（-$${cost}）` };
}

export function sellPrice(id) {
  const it = ITEMS[id];
  return it ? Math.max(1, Math.floor(it.price * 0.3)) : 0;
}
/** インスタンスの売値（★1 ごとに +10%、潜在 等級ごとに +25%） */
export function sellPriceInst(inst) {
  const base = sellPrice(inst?.id);
  if (!base) return 0;
  const potK = inst.pot ? 1 + 0.25 * (1 + gradeIndex(inst.pot.grade)) : 1;
  return Math.floor(base * (1 + 0.1 * (inst.star || 0)) * potK);
}

/** sellItem(game, idOrRef, qty=1)。'#uid' / エントリ / {uid} なら そのインスタンスを売る（装備中は不可） */
export function sellItem(game, id, qty = 1) {
  const st = game.state;
  if (id && (typeof id === 'object' || (typeof id === 'string' && id.startsWith('#')))) {
    const r = resolveItemRef(st, id, { invOnly: true });
    if (!r) return { ok: false, msg: 'アイテムが見つかりません' };
    const gain = sellPriceInst(r.inst) * (r.inst.qty && !isEquipId(r.inst.id) ? Math.min(qty, r.inst.qty) : 1);
    const name = instLabel(r.inst) || ITEMS[r.inst.id]?.name;
    if (isEquipId(r.inst.id)) st.inventory.splice(r.index, 1);
    else if (!removeItem(st, r.inst.id, qty)) return { ok: false, msg: '数が足りません' };
    st.money += gain;
    game.events?.emit('itemSold', { id: r.inst.id, qty: 1, gain });
    return { ok: true, msg: `${name} を売却した（+$${gain}）` };
  }
  const it = ITEMS[id];
  if (!it) return { ok: false, msg: '不明なアイテム' };
  if (!removeItem(st, id, qty)) return { ok: false, msg: '数が足りません' };
  const gain = sellPrice(id) * qty;
  st.money += gain;
  game.events?.emit('itemSold', { id, qty, gain });
  return { ok: true, msg: `${it.name} x${qty} を売却した（+$${gain}）` };
}
