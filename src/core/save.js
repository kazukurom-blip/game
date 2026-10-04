// キャラクタースロット式セーブ（localStorage）。各スロットに1キャラ分の state を保存する。
// 旧形式（単一キー 'nvs_save'）は初回アクセス時にスロット0へ移行する。
const LEGACY_KEY = 'nvs_save';
const SLOT_PREFIX = 'nvs_slot_';
const ACTIVE_KEY = 'nvs_active_slot';
export const MAX_SLOTS = 6;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let migrated = false;
function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  const legacy = store.get(LEGACY_KEY);
  if (!legacy) return;
  if (!store.get(SLOT_PREFIX + 0)) store.set(SLOT_PREFIX + 0, legacy);
  else {
    // スロット0が使用中なら空きスロットへ
    for (let i = 1; i < MAX_SLOTS; i++) if (!store.get(SLOT_PREFIX + i)) { store.set(SLOT_PREFIX + i, legacy); break; }
  }
  store.del(LEGACY_KEY);
}

function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

/** 全スロットの概要（キャラ選択画面用）。空きは null */
export function listSlots() {
  migrateLegacy();
  const out = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const s = parse(store.get(SLOT_PREFIX + i));
    out.push(s ? {
      slot: i, name: s.name || (s.heroId === 'jin' ? 'ジン' : 'ルナ'), heroId: s.heroId, gender: s.gender,
      level: s.level || 1, job: s.job?.id || 'beginner', mapId: s.mapId, look: s.look || null,
      equipped: s.equipped || {}, savedAt: s.savedAt || 0, state: s,
    } : null);
  }
  return out;
}

export function loadSlot(i) { migrateLegacy(); return parse(store.get(SLOT_PREFIX + i)); }

export function saveSlot(i, state) {
  if (!(i >= 0 && i < MAX_SLOTS) || !state) return false;
  state.savedAt = Date.now();
  return store.set(SLOT_PREFIX + i, JSON.stringify(state));
}

export function deleteSlot(i) { store.del(SLOT_PREFIX + i); if (activeSlot() === i) store.del(ACTIVE_KEY); }

export function firstEmptySlot() {
  const l = listSlots();
  const i = l.findIndex((s) => !s);
  return i < 0 ? -1 : i;
}

export function activeSlot() {
  const v = parseInt(store.get(ACTIVE_KEY), 10);
  return Number.isInteger(v) && v >= 0 && v < MAX_SLOTS ? v : -1;
}
export function setActiveSlot(i) { store.set(ACTIVE_KEY, String(i)); }

// --- 旧API（互換）: アクティブスロットに対して動作 ---
export function hasSave() { return listSlots().some(Boolean); }
export function loadState() {
  const a = activeSlot();
  if (a >= 0) return loadSlot(a);
  const s = listSlots().find(Boolean);
  if (s) { setActiveSlot(s.slot); return s.state; }
  return null;
}
export function saveState(state) {
  let a = activeSlot();
  if (a < 0) { a = firstEmptySlot(); if (a < 0) a = 0; setActiveSlot(a); }
  return saveSlot(a, state);
}
export function clearSave() { const a = activeSlot(); if (a >= 0) deleteSlot(a); }
