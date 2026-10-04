// キャラ間共有（localStorage 'nvs_shared'）: 共有倉庫48枠・図鑑・実績・キャラ一覧（リンクボーナス）
// 「サブキャラ強制」ではなく「育てるとお得」: 他キャラの Lv でクラス別の小さなリンクボーナス。
// localStorage が無い/壊れている環境（Node テスト・プライベートモード）ではメモリ上で動作する（try/catch）。
import { ITEMS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { activeSlot } from '../core/save.js';
import { resolveItemRef, addItemToState, removeItem, normalizeInventory, isEquipId, instLabel, freeSlots } from './inventory.js';

export const SHARED_KEY = 'nvs_shared';
export const SHARED_STORAGE_SLOTS = 48;
const MAX_STACK = 999;

let _cache = null;
let _mem = null; // localStorage が使えない時の保存先
let _ver = 0;

function ls() { try { return globalThis.localStorage || null; } catch { return null; } }
function emptyShared() { return { v: 1, storage: [], book: {}, achievements: {}, chars: {} }; }
function sanitize(o) {
  const s = emptyShared();
  if (!o || typeof o !== 'object') return s;
  if (Array.isArray(o.storage)) s.storage = o.storage.filter((e) => e && ITEMS[e.id] && e.qty > 0).slice(0, SHARED_STORAGE_SLOTS);
  if (o.book && typeof o.book === 'object') for (const [k, v] of Object.entries(o.book)) if (ENEMIES[k] && Number.isFinite(v) && v > 0) s.book[k] = v;
  if (o.achievements && typeof o.achievements === 'object') s.achievements = { ...o.achievements };
  if (o.chars && typeof o.chars === 'object') s.chars = { ...o.chars };
  return s;
}

/** loadShared() → 共有データ（キャッシュ）。force で再読込 */
export function loadShared(force = false) {
  if (_cache && !force) return _cache;
  let raw = null;
  const store = ls();
  try { raw = store ? store.getItem(SHARED_KEY) : _mem; } catch { raw = _mem; }
  let obj = null;
  try { obj = raw ? JSON.parse(raw) : null; } catch { obj = null; }
  _cache = sanitize(obj);
  _ver++;
  return _cache;
}
/** saveShared() → bool */
export function saveShared() {
  const sh = loadShared();
  const raw = JSON.stringify(sh);
  _ver++;
  const store = ls();
  try { if (store) { store.setItem(SHARED_KEY, raw); return true; } } catch { /* fallthrough */ }
  _mem = raw;
  return false;
}
/** テスト用: キャッシュとメモリ保存を破棄 */
export function resetSharedForTest() { _cache = null; _mem = null; _ver++; _linkKey = null; }

// ------------------------------------------------------------ 実績
export function sharedAchievements() { try { return loadShared().achievements; } catch { return {}; } }
export function recordSharedAchievement(id, t = Date.now()) {
  const sh = loadShared();
  if (sh.achievements[id]) return;
  sh.achievements[id] = t;
  saveShared();
}

// ------------------------------------------------------------ 図鑑（キャラ間で撃破数の最大値を共有）
/** syncSharedBook(state) — 双方向マージ（各モンスターの撃破数は大きい方） */
export function syncSharedBook(state) {
  if (!state) return;
  const sh = loadShared();
  if (!state.book || typeof state.book !== 'object') state.book = {};
  let changed = false;
  for (const [k, v] of Object.entries(state.book)) if (ENEMIES[k] && v > (sh.book[k] || 0)) { sh.book[k] = v; changed = true; }
  for (const [k, v] of Object.entries(sh.book)) if (v > (state.book[k] || 0)) state.book[k] = v;
  if (changed) saveShared();
}

// ------------------------------------------------------------ 共有倉庫
export function sharedStorage() { return loadShared().storage; }

/** depositItem(game, itemRef, qty=1) → {ok, msg}（装備はインスタンスごと。★・潜在も保持） */
export function depositItem(game, itemRef, qty = 1) {
  const st = game.state;
  normalizeInventory(st);
  const r = resolveItemRef(st, itemRef, { invOnly: true });
  if (!r) return { ok: false, msg: 'アイテムが見つかりません' };
  const sh = loadShared();
  const inst = r.inst;
  const it = ITEMS[inst.id];
  if (isEquipId(inst.id)) {
    if (sh.storage.length >= SHARED_STORAGE_SLOTS) return { ok: false, msg: '共有倉庫がいっぱいです' };
    st.inventory.splice(r.index, 1);
    const { potPending, potGradeKept, ...clean } = inst; // 選択待ちの結果は預けない（破棄扱い）
    sh.storage.push({ ...clean, qty: 1 });
    saveShared();
    game.events?.emit('sharedDeposit', { id: inst.id });
    return { ok: true, msg: `${instLabel(inst)} を共有倉庫に預けた` };
  }
  const n = Math.min(qty, inst.qty || 1);
  let room = 0;
  for (const e of sh.storage) if (e.id === inst.id) room += MAX_STACK - e.qty;
  const needNew = Math.max(0, Math.ceil((n - room) / MAX_STACK));
  if (sh.storage.length + needNew > SHARED_STORAGE_SLOTS) return { ok: false, msg: '共有倉庫がいっぱいです' };
  removeItem(st, inst.id, n);
  let left = n;
  for (const e of sh.storage) { if (left <= 0) break; if (e.id === inst.id && e.qty < MAX_STACK) { const a = Math.min(left, MAX_STACK - e.qty); e.qty += a; left -= a; } }
  while (left > 0) { const a = Math.min(left, MAX_STACK); sh.storage.push({ id: inst.id, qty: a }); left -= a; }
  saveShared();
  game.events?.emit('sharedDeposit', { id: inst.id });
  return { ok: true, msg: `${it.name} x${n} を共有倉庫に預けた` };
}

/** withdrawItem(game, storageIndex, qty=1) → {ok, msg} */
export function withdrawItem(game, index, qty = 1) {
  const st = game.state;
  const sh = loadShared();
  const e = sh.storage[index];
  if (!e) return { ok: false, msg: 'アイテムが見つかりません' };
  if (isEquipId(e.id)) {
    if (freeSlots(st) <= 0) return { ok: false, msg: 'インベントリがいっぱいです' };
    const inst = { ...e, qty: 1 };
    if (!addItemToState(st, e.id, 1, { inst })) return { ok: false, msg: 'インベントリがいっぱいです' };
    sh.storage.splice(index, 1);
    saveShared();
    return { ok: true, msg: `${instLabel(inst)} を引き出した` };
  }
  const n = Math.min(qty, e.qty);
  if (!addItemToState(st, e.id, n)) return { ok: false, msg: 'インベントリがいっぱいです' };
  e.qty -= n;
  if (e.qty <= 0) sh.storage.splice(index, 1);
  saveShared();
  return { ok: true, msg: `${ITEMS[e.id].name} x${n} を引き出した` };
}

// ------------------------------------------------------------ キャラ一覧・リンクボーナス
let _curSlot = -1;
function slotKey(state) { return _curSlot >= 0 ? 's' + _curSlot : 'n:' + (state?.heroId || '') + ':' + (state?.name || ''); }
/** 現在キャラの概要を共有データに記録 */
export function updateSharedChar(state, slot = _curSlot) {
  if (!state) return;
  if (Number.isInteger(slot)) _curSlot = slot;
  const sh = loadShared();
  const k = slotKey(state);
  const prev = sh.chars[k];
  const cur = { heroId: state.heroId, name: state.name, level: state.level || 1, tier: state.job?.tier || 0, t: Date.now() };
  if (prev && prev.heroId === cur.heroId && prev.level === cur.level && prev.tier === cur.tier && prev.name === cur.name) return;
  sh.chars[k] = cur;
  _linkKey = null;
  saveShared();
}
/** 削除されたスロットのキャラを共有一覧から外す（UI のキャラ削除時に呼ぶ） */
export function removeSharedChar(slot) { const sh = loadShared(); delete sh.chars['s' + slot]; _linkKey = null; saveShared(); }

/** クラス別リンク（相方の Lv 30/60/100/150 で段階）: 値は段階ごと */
export const LINK_TABLE = {
  luna: { stat: 'crit', name: 'スターの勘', values: [0.01, 0.02, 0.03, 0.04] },
  jin: { stat: 'maxHpPct', name: 'ブロウラーの体', values: [0.03, 0.06, 0.09, 0.12] },
  hacker: { stat: 'maxMpPct', name: 'ハッカーの頭脳', values: [0.03, 0.06, 0.09, 0.12] },
};
export const LINK_LEVELS = [30, 60, 100, 150];
const ZERO_LINK = () => ({ crit: 0, maxHpPct: 0, maxMpPct: 0, expRate: 0, dropRate: 0, sources: [] });
let _linkKey = null, _linkVal = null;
/** linkBonus(state) → {crit, maxHpPct, maxMpPct, expRate, dropRate, sources:[{name, heroId, level, stat, value}]} */
export function linkBonus(state) {
  let sh;
  try { sh = loadShared(); } catch { return ZERO_LINK(); }
  const me = slotKey(state);
  const key = _ver + '|' + me;
  if (key === _linkKey && _linkVal) return _linkVal;
  const out = ZERO_LINK();
  const best = {};
  for (const [k, ch] of Object.entries(sh.chars || {})) {
    if (k === me || !ch || !LINK_TABLE[ch.heroId]) continue;
    if (!best[ch.heroId] || ch.level > best[ch.heroId].level) best[ch.heroId] = ch;
  }
  let lv50 = 0;
  for (const ch of Object.values(sh.chars || {})) if (ch && ch.level >= 50) lv50++;
  for (const [hid, ch] of Object.entries(best)) {
    const step = LINK_LEVELS.filter((l) => ch.level >= l).length;
    if (!step) continue;
    const t = LINK_TABLE[hid];
    const v = t.values[step - 1];
    out[t.stat] += v;
    out.sources.push({ name: ch.name, heroId: hid, level: ch.level, stat: t.stat, value: v, linkName: t.name });
  }
  // 他キャラの Lv50 以上1人ごとに 経験値 +1%（最大 +5%）
  const others = lv50 - ((state?.level || 0) >= 50 && sh.chars?.[me] ? 1 : 0);
  out.expRate = Math.min(0.05, Math.max(0, others) * 0.01);
  _linkKey = key; _linkVal = out;
  return out;
}

/** attachShared(game) — 開始時に図鑑マージ・キャラ記録、levelUp/jobAdvanced/bookNew で更新。戻り値: 購読解除 */
export function attachShared(game) {
  if (game._sharedUnsub) return game._sharedUnsub;
  const ev = game.events;
  const refresh = () => { if (!game.state) return; try { _curSlot = activeSlot(); } catch { /* ignore */ } updateSharedChar(game.state); };
  const book = () => { if (game.state) syncSharedBook(game.state); };
  const offs = [ev?.on('levelUp', refresh), ev?.on('jobAdvanced', refresh), ev?.on('bookNew', book), ev?.on('bookRank', book),
    ev?.on('mapChanged', () => { refresh(); book(); })];
  refresh(); book();
  game._sharedUnsub = () => { offs.forEach((f) => f?.()); game._sharedUnsub = null; };
  return game._sharedUnsub;
}
