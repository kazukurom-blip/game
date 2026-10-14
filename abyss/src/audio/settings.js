// 音の設定。セーブの state.settings に入る:
//   sfx（効果音 0〜1）・bgm（BGM 0〜1）… 元からある項目
//   audio: { master, mute, muteHidden, duck, cats: { combat, skill, loot, ui, craft, event }, loot: { common..mythic, quality } }
// タイトル画面（セーブを読む前）でも同じ音量で鳴るよう、最後の設定をブラウザにも写しておく。

import { local } from '../engine/storage.js';

const MIRROR_KEY = 'abyss.audio.prefs';

export const AUDIO_DEFAULTS = {
  master: 0.8,
  mute: false,
  muteHidden: true,
  duck: true,
  cats: { combat: true, skill: true, loot: true, ui: true, craft: true, event: true },
  loot: { common: true, magic: true, rare: true, epic: true, legendary: true, set: true, unique: true, mythic: true, quality: true },
};

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/** settings に音の項目を足す（無い物だけ）。戻り値は settings.audio */
export function ensureAudioSettings(settings, mirror = readMirror()) {
  if (!settings || typeof settings !== 'object') return { ...AUDIO_DEFAULTS };
  const fresh = !settings.audio || typeof settings.audio !== 'object';
  if (fresh) {
    settings.audio = {};
    // 前に遊んだときの音量を引き継ぐ（新しいセーブ・音の設定が無かった古いセーブ）
    if (mirror) { if (typeof mirror.sfx === 'number') settings.sfx = mirror.sfx; if (typeof mirror.bgm === 'number') settings.bgm = mirror.bgm; }
  }
  const a = settings.audio;
  const m = fresh && mirror ? mirror : {};
  a.master = num(a.master, num(m.master, AUDIO_DEFAULTS.master));
  a.mute = bool(a.mute, bool(m.mute, AUDIO_DEFAULTS.mute));
  a.muteHidden = bool(a.muteHidden, bool(m.muteHidden, AUDIO_DEFAULTS.muteHidden));
  a.duck = bool(a.duck, AUDIO_DEFAULTS.duck);
  a.cats = { ...AUDIO_DEFAULTS.cats, ...(a.cats && typeof a.cats === 'object' ? a.cats : {}) };
  a.loot = { ...AUDIO_DEFAULTS.loot, ...(a.loot && typeof a.loot === 'object' ? a.loot : {}) };
  settings.sfx = num(settings.sfx, 0.6);
  settings.bgm = num(settings.bgm, 0.35);
  return a;
}

/** 今の設定を 1 つにまとめる（state が無いときはブラウザの写し） */
export function currentPrefs(state) {
  const s = state?.settings;
  if (s) {
    const a = ensureAudioSettings(s);
    return { master: a.master, sfx: s.sfx, bgm: s.bgm, mute: a.mute, muteHidden: a.muteHidden, duck: a.duck, cats: a.cats, loot: a.loot };
  }
  const m = readMirror() || {};
  return {
    master: num(m.master, AUDIO_DEFAULTS.master), sfx: num(m.sfx, 0.6), bgm: num(m.bgm, 0.35),
    mute: bool(m.mute, false), muteHidden: bool(m.muteHidden, true), duck: true, cats: { ...AUDIO_DEFAULTS.cats }, loot: { ...AUDIO_DEFAULTS.loot },
  };
}

export function readMirror() {
  try { const v = local.get(MIRROR_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function writeMirror(p) {
  try { local.set(MIRROR_KEY, JSON.stringify({ master: p.master, sfx: p.sfx, bgm: p.bgm, mute: p.mute, muteHidden: p.muteHidden })); } catch { /* ignore */ }
}
