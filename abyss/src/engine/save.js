// セーブ（3 つの枠・自動セーブ・文字列での書き出し / 読み込み）。
// localStorage が使えない環境でも、その回の間はメモリに残る。

import { local } from './storage.js';

const PREFIX = 'abyssdrop.save.';
const META = 'abyssdrop.meta';
export const SLOT_COUNT = 3;

export function saveSlot(slot, state) {
  try {
    const json = JSON.stringify(state);
    const ok = local.set(PREFIX + slot, json);
    local.set(META, JSON.stringify({ last: slot }));
    return ok;
  } catch (e) {
    console.error('[save]', e);
    return false;
  }
}

export function loadSlot(slot) {
  const raw = local.get(PREFIX + slot);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function deleteSlot(slot) { local.remove(PREFIX + slot); }

export function lastSlot() {
  try { return JSON.parse(local.get(META) || '{}').last ?? null; } catch { return null; }
}

/** 枠の一覧（タイトル画面用） */
export function listSlots() {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = loadSlot(i);
    out.push(s ? { slot: i, cls: s.hero?.cls, name: s.hero?.name, level: s.hero?.level, paragon: s.hero?.paragon?.level || 0, zone: s.world?.zone, playTime: s.playTime || 0, lastSaved: s.lastSaved, rebirths: s.meta?.rebirths || 0 } : { slot: i, empty: true });
  }
  return out;
}

// ---- 文字列での書き出し（別の端末へ移す・控えを取る）
function checksum(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function exportString(state) {
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `ABYSS1:${checksum(json)}:${b64}`;
}

export function importString(str) {
  const s = String(str || '').trim();
  const m = s.match(/^ABYSS1:([0-9a-z]+):(.+)$/s);
  if (!m) throw new Error('セーブの文字列の形が違います');
  const json = decodeURIComponent(escape(atob(m[2].replace(/\s+/g, ''))));
  if (checksum(json) !== m[1]) throw new Error('セーブの文字列が壊れています（一部が欠けているかもしれません）');
  const st = JSON.parse(json);
  if (!st?.hero || !st?.inv) throw new Error('セーブの中身が足りません');
  return st;
}
