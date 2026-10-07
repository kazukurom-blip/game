// ルミナリア・クラシックの音の入口。
//   import { playBgm, stopBgm, playSfx, setVolume, getVolume, unlockAudio } from './audio/index.js';
//   playBgm('town_beginner');   // 同じ曲なら何もしない。違う曲なら前の曲を消してから鳴らす
//   stopBgm();                  // ゆっくり消す
//   playSfx('ui_click');
//   setVolume({ bgm: 0.8, sfx: 0.6 });   // 0〜1。端末に覚えておく
// ブラウザの自動再生の制限: 最初のキー・クリック・タッチまで音は出せない。それより前に
// playBgm を呼んだときは「鳴らしたい曲」として覚えておき、最初の操作のときに鳴らし始める。
// 効果音は操作の前なら捨てる（あとで鳴ると変なので）。

import { BgmPlayer } from './bgm.js';
import { playSfxOn, SFX } from './sfx.js';
import { SONGS } from './songs/index.js';

const STORE_KEY = 'lumi_audio_v1';
const HAS_WIN = typeof window !== 'undefined';
const state = { ctx: null, master: null, bgmG: null, sfxG: null, player: null, wantBgm: null, curBgm: null, vol: { bgm: 0.7, sfx: 0.8 }, unlocked: false };

try { const v = HAS_WIN && JSON.parse(window.localStorage?.getItem(STORE_KEY)); if (v) Object.assign(state.vol, v); } catch { /* 読めなければ既定値 */ }

const curve = (x) => Math.max(0, Math.min(1, x)) ** 2; // 耳に自然な音量の曲線

function ensureCtx() {
  if (state.ctx || !HAS_WIN) return state.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.9;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 4; lim.attack.value = 0.005; lim.release.value = 0.2;
  const bgmG = ctx.createGain(); bgmG.gain.value = curve(state.vol.bgm);
  const sfxG = ctx.createGain(); sfxG.gain.value = curve(state.vol.sfx);
  bgmG.connect(master); sfxG.connect(master); master.connect(lim); lim.connect(ctx.destination);
  Object.assign(state, { ctx, master, bgmG, sfxG, player: new BgmPlayer(ctx, bgmG) });
  return ctx;
}

export function unlockAudio() {
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!state.unlocked) {
    state.unlocked = true;
    if (state.wantBgm) { const id = state.wantBgm; state.wantBgm = null; startBgm(id); }
  }
}

function startBgm(id) {
  const song = SONGS[id];
  if (!song) { console.warn('[audio] 曲が無い:', id); return; }
  state.player.stop(0.8);
  state.player.play(song, { fadeIn: 0.4 });
  state.curBgm = id;
}

export function playBgm(id) {
  if (state.curBgm === id && state.player?.cur) return;
  if (!state.unlocked) { state.wantBgm = id; return; }
  startBgm(id);
}

export function stopBgm(fade = 0.8) {
  state.wantBgm = null;
  state.curBgm = null;
  state.player?.stop(fade);
}

export function playSfx(id) {
  if (!state.unlocked || !state.ctx) return false;
  return playSfxOn(state.ctx, state.sfxG, id);
}

export function setVolume({ bgm, sfx } = {}) {
  if (bgm != null) state.vol.bgm = Math.max(0, Math.min(1, +bgm));
  if (sfx != null) state.vol.sfx = Math.max(0, Math.min(1, +sfx));
  if (state.ctx) {
    const t = state.ctx.currentTime;
    state.bgmG.gain.setTargetAtTime(curve(state.vol.bgm), t, 0.03);
    state.sfxG.gain.setTargetAtTime(curve(state.vol.sfx), t, 0.03);
  }
  try { if (HAS_WIN) window.localStorage?.setItem(STORE_KEY, JSON.stringify(state.vol)); } catch { /* 保存できなくても鳴らす */ }
  return { ...state.vol };
}
export const getVolume = () => ({ ...state.vol });
export const currentBgm = () => state.curBgm || state.wantBgm;
export const BGM_IDS = Object.keys(SONGS);
export const SFX_IDS = Object.keys(SFX);

// 最初の操作で音を出せるようにする
if (HAS_WIN) {
  const onGesture = () => unlockAudio();
  for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  document.addEventListener?.('visibilitychange', () => {
    if (!state.ctx) return;
    if (document.hidden) state.ctx.suspend().catch(() => {}); else if (state.unlocked) state.ctx.resume().catch(() => {});
  });
}
