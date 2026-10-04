// NEON VICE STORY — サウンド（WebAudio のみ・音声ファイルなし）
//
//   import { audio, attachAudio } from './audio/audio.js';
//   attachAudio(game);              // 一度だけ（events 購読 + unlock リスナー登録）
//   audio.update(game, dt);         // 毎フレーム（R/N 入力・BGM 選曲・サイレン/エンジン・攻撃/ジャンプ/ヒット SE）
//
// - AudioContext はユーザー操作（keydown / pointerdown / touchstart）時に unlock() で生成・resume。
//   それまでは何も鳴らさず、例外も出さない。AudioContext が無い環境（Node）では全 API が no-op。
// - BGM はステップシーケンサー（lookahead スケジューラ）。地域 × 町/フィールド/ボス、カーラジオ3局。
// - 出力: music/sfx バス → コンプレッサ（リミッタ代わり）→ master → destination。

const HAS_WIN = typeof window !== 'undefined';
const AC = HAS_WIN ? (window.AudioContext || window.webkitAudioContext || null) : null;
const OAC = HAS_WIN ? (window.OfflineAudioContext || window.webkitOfflineAudioContext || null) : null;

const LOOKAHEAD = 0.14;      // 秒先までスケジュール
const TICK_MS = 25;          // スケジューラ間隔
const MAX_VOICES = 14;       // SE 同時発音数
const MUSIC_LEVEL = 0.27;
const SFX_LEVEL = 1.0;
const STORE_KEY = 'nvs_audio_v1';

// ---------------------------------------------------------------------------
// 小物
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  harm: [0, 2, 3, 5, 7, 8, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10],
  phryg: [0, 1, 3, 5, 7, 8, 10],
};
const CHORDS = {
  maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus: [0, 5, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], m9: [0, 3, 7, 14],
};
const VEL = { X: 1, x: 0.75, o: 0.4 };

// ---------------------------------------------------------------------------
// エンジン状態（モジュール内シングルトン）
const E = {
  ac: null, master: null, comp: null, music: null, sfx: null, noise: null,
  live: 0, voices: 0, voicesByName: {}, lastT: {}, unlocked: false,
  songs: [], current: null, wantTrack: null, timer: null,
  loops: {}, game: null, offs: [], listening: false,
  radio: 0, inRadio: false,
  muted: false, volume: 0.8,
  bgm: 1, se: 1,               // v3: 設定画面の BGM / SE 音量（0..1）
  tension: 0, tensionG: null,  // v3: 手配度レイヤー（0..5）
  titleScreen: null,           // v3: 'title' | 'select'（UI が明示する場合）
  prev: {}, seenFx: (typeof WeakSet !== 'undefined') ? new WeakSet() : null,
  skillKinds: null, skillDefs: null, errors: 0, combo: 0,
};
try {
  const s = HAS_WIN && window.localStorage && JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
  if (s) {
    E.muted = !!s.muted; if (typeof s.volume === 'number') E.volume = clamp(s.volume, 0, 1);
    if (typeof s.bgm === 'number') E.bgm = clamp(s.bgm, 0, 1);
    if (typeof s.se === 'number') E.se = clamp(s.se, 0, 1);
  }
} catch (e) { /* storage 不可 */ }
function persist() { try { HAS_WIN && window.localStorage?.setItem(STORE_KEY, JSON.stringify({ muted: E.muted, volume: E.volume, bgm: E.bgm, se: E.se })); } catch (e) { /* noop */ } }
const musicLevel = () => MUSIC_LEVEL * E.bgm;
const sfxLevel = () => SFX_LEVEL * E.se;

function guard(fn, fb) {
  return function (...a) {
    try { return fn.apply(this, a); } catch (e) {
      if (E.errors++ < 5 && typeof console !== 'undefined') console.warn('[audio]', e);
      return fb;
    }
  };
}

// 出力チェーン（live / offline 共通）
function makeChain(ac) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 10;
  comp.attack.value = 0.003; comp.release.value = 0.18;
  const master = ac.createGain(); master.gain.value = 0.85;
  const music = ac.createGain(); music.gain.value = musicLevel();
  const sfx = ac.createGain(); sfx.gain.value = sfxLevel();
  const tensionG = ac.createGain(); tensionG.gain.value = 0.0001; tensionG.connect(music); // 手配度レイヤー
  music.connect(comp); sfx.connect(comp); comp.connect(master); master.connect(ac.destination);
  const len = Math.floor(ac.sampleRate * 1.0);
  const noise = ac.createBuffer(1, len, ac.sampleRate);
  const d = noise.getChannelData(0); const r = rng(12345);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return { comp, master, music, sfx, noise, tensionG };
}

// ---------------------------------------------------------------------------
// ボイス（ノード群のライフサイクル管理。ソースが全て ended したら disconnect）
function voice(ac, ctx, dest, onDone) {
  const V = { ac, ctx, dest, nodes: [], pending: 0, onDone };
  return V;
}
function reg(V, src, ...nodes) {
  V.nodes.push(src, ...nodes);
  V.ctx.live += 1 + nodes.length;
  V.pending++;
  src.onended = () => {
    if (--V.pending > 0) return;
    for (const n of V.nodes) { try { n.disconnect(); } catch (e) { /* noop */ } }
    V.ctx.live -= V.nodes.length; V.nodes.length = 0;
    if (V.onDone) { const f = V.onDone; V.onDone = null; f(); }
  };
}
function extra(V, node) { V.nodes.push(node); V.ctx.live++; return node; }

function envPerc(p, t, a, peak, dur) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
}
function envSus(p, t, a, peak, sus, dur, rel) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.linearRampToValueAtTime(peak * sus, t + a + Math.min(0.12, dur * 0.4));
  p.setValueAtTime(peak * sus, t + Math.max(a + 0.01, dur));
  p.linearRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur) + rel);
}

// 基本オシレータ音
function tone(V, t, o) {
  const ac = V.ac;
  const type = o.type || 'square', f = o.f || 440, dur = o.dur || 0.1, vol = o.vol ?? 0.2, a = o.a ?? 0.003;
  const osc = ac.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.f1) {
    if (o.lin) osc.frequency.linearRampToValueAtTime(o.f1, t + (o.slide ?? dur));
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.slide ?? dur));
  }
  if (o.detune) osc.detune.value = o.detune;
  const g = ac.createGain();
  if (o.sus != null) envSus(g.gain, t, a, vol, o.sus, dur, o.rel ?? 0.06); else envPerc(g.gain, t, a, vol, dur);
  let last = osc; const ns = [g];
  if (o.lp || o.hp || o.bp) {
    const fl = ac.createBiquadFilter();
    fl.type = o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass';
    fl.frequency.setValueAtTime(o.lp || o.hp || o.bp, t);
    if (o.lp1) fl.frequency.exponentialRampToValueAtTime(o.lp1, t + dur);
    fl.Q.value = o.Q ?? 0.8;
    last.connect(fl); last = fl; ns.push(fl);
  }
  last.connect(g); g.connect(V.dest);
  osc.start(t); osc.stop(t + dur + (o.sus != null ? (o.rel ?? 0.06) : 0) + 0.03);
  reg(V, osc, ...ns);
  return osc;
}
// ノイズ音
function noiz(V, t, o) {
  const ac = V.ac;
  const dur = o.dur || 0.1, vol = o.vol ?? 0.2, a = o.a ?? 0.002;
  const src = ac.createBufferSource(); src.buffer = V.ctx.noise; src.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = o.ft || 'bandpass';
  fl.frequency.setValueAtTime(o.f || 2000, t);
  if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  fl.Q.value = o.Q ?? 0.9;
  const g = ac.createGain(); envPerc(g.gain, t, a, vol, dur);
  src.connect(fl); fl.connect(g); g.connect(V.dest);
  const off = (o.seed ?? Math.random()) * 0.8;
  src.start(t, off); src.stop(t + dur + 0.03);
  reg(V, src, fl, g);
  return g;
}

// ---------------------------------------------------------------------------
// SE 定義  (V, t, o) — o.p = ピッチ倍率
const SFX = {
  hit(V, t, o) {
    const p = o.p;
    noiz(V, t, { dur: 0.07, vol: 0.32, f: 2400 * p, Q: 0.7 });
    tone(V, t, { type: 'square', f: 320 * p, f1: 110 * p, dur: 0.08, vol: 0.16, lp: 2400 });
  },
  crit(V, t, o) {
    const p = o.p;
    noiz(V, t, { dur: 0.1, vol: 0.38, f: 1800 * p, Q: 0.6 });
    tone(V, t, { type: 'square', f: 260 * p, f1: 70 * p, dur: 0.14, vol: 0.2, lp: 2000 });
    tone(V, t + 0.01, { type: 'triangle', f: 1400 * p, f1: 2600 * p, dur: 0.12, vol: 0.14 });
    tone(V, t + 0.06, { type: 'sine', f: 2093 * p, dur: 0.22, vol: 0.09 });
    tone(V, t + 0.09, { type: 'sine', f: 2637 * p, dur: 0.22, vol: 0.07 });
  },
  kill(V, t, o) {
    tone(V, t, { type: 'square', f: 600 * o.p, f1: 1200 * o.p, dur: 0.06, vol: 0.09 });
    noiz(V, t + 0.02, { dur: 0.16, vol: 0.18, ft: 'lowpass', f: 2500, f1: 300 });
  },
  bossKill(V, t) {
    noiz(V, t, { dur: 1.2, vol: 0.45, ft: 'lowpass', f: 1600, f1: 60, a: 0.01 });
    tone(V, t, { type: 'sine', f: 110, f1: 28, dur: 0.9, vol: 0.5 });
    [523, 659, 784, 1047].forEach((f, i) => tone(V, t + 0.35 + i * 0.09, { type: 'square', f, dur: 0.3, vol: 0.08, lp: 3500 }));
  },
  swing(V, t, o) { noiz(V, t, { dur: 0.13, vol: 0.2, f: 700 * o.p, f1: 3200 * o.p, Q: 1.6, a: 0.02 }); },
  shoot(V, t, o) {
    tone(V, t, { type: 'square', f: 1100 * o.p, f1: 140 * o.p, dur: 0.09, vol: 0.12, lp: 3000 });
    noiz(V, t, { dur: 0.06, vol: 0.2, ft: 'highpass', f: 1500 });
  },
  zap(V, t, o) {
    tone(V, t, { type: 'sawtooth', f: 500 * o.p, f1: 1600 * o.p, dur: 0.12, vol: 0.1, lp: 3000 });
    tone(V, t + 0.02, { type: 'sine', f: 1800 * o.p, f1: 900 * o.p, dur: 0.12, vol: 0.08 });
  },
  jump(V, t, o) { tone(V, t, { type: 'square', f: 280 * o.p, f1: 620 * o.p, dur: 0.11, vol: 0.1, lp: 2600 }); },
  land(V, t) { noiz(V, t, { dur: 0.06, vol: 0.4, ft: 'lowpass', f: 700 }); tone(V, t, { type: 'sine', f: 120, f1: 60, dur: 0.06, vol: 0.12 }); },
  pickup(V, t, o) {
    tone(V, t, { type: 'triangle', f: 880 * o.p, dur: 0.06, vol: 0.16 });
    tone(V, t + 0.05, { type: 'triangle', f: 1320 * o.p, dur: 0.09, vol: 0.16 });
  },
  coin(V, t, o) {
    tone(V, t, { type: 'square', f: 988 * o.p, dur: 0.06, vol: 0.08, lp: 5000 });
    tone(V, t + 0.055, { type: 'square', f: 1319 * o.p, dur: 0.22, vol: 0.08, lp: 5000 });
  },
  rare(V, t) {
    [72, 76, 79, 84, 88, 91].forEach((m, i) => tone(V, t + i * 0.055, { type: 'triangle', f: mtof(m), dur: 0.35, vol: 0.13 }));
    tone(V, t + 0.33, { type: 'sine', f: mtof(96), dur: 0.6, vol: 0.08 });
    noiz(V, t + 0.3, { dur: 0.5, vol: 0.06, ft: 'highpass', f: 8000, a: 0.05 });
  },
  pet(V, t) {
    const seq = [72, 76, 79, 84, 79, 84, 88, 91, 96];
    seq.forEach((m, i) => tone(V, t + i * 0.075, { type: i % 2 ? 'triangle' : 'square', f: mtof(m), dur: 0.3, vol: 0.09, lp: 4500 }));
    [84, 88, 91].forEach((m) => tone(V, t + 0.7, { type: 'triangle', f: mtof(m), dur: 0.9, vol: 0.09, sus: 0.6, rel: 0.4 }));
    noiz(V, t + 0.6, { dur: 1.0, vol: 0.07, ft: 'highpass', f: 9000, a: 0.1 });
  },
  levelUp(V, t) {
    [60, 64, 67, 72, 67, 72, 76, 79].forEach((m, i) => tone(V, t + i * 0.07, { type: 'square', f: mtof(m), dur: 0.12, vol: 0.09, lp: 4000 }));
    [72, 76, 79, 84].forEach((m) => tone(V, t + 0.58, { type: 'triangle', f: mtof(m), dur: 0.7, vol: 0.1, sus: 0.7, rel: 0.35 }));
    noiz(V, t + 0.55, { dur: 0.8, vol: 0.06, ft: 'highpass', f: 7000, a: 0.05 });
  },
  hurt(V, t, o) {
    tone(V, t, { type: 'sawtooth', f: 240 * o.p, f1: 80 * o.p, dur: 0.2, vol: 0.16, lp: 1800 });
    noiz(V, t, { dur: 0.1, vol: 0.2, ft: 'lowpass', f: 1500 });
  },
  portal(V, t) {
    tone(V, t, { type: 'sine', f: 220, f1: 1100, dur: 0.45, vol: 0.13, a: 0.04 });
    tone(V, t + 0.05, { type: 'triangle', f: 330, f1: 1650, dur: 0.45, vol: 0.08, a: 0.04 });
    noiz(V, t, { dur: 0.55, vol: 0.12, f: 400, f1: 4000, Q: 2, a: 0.1 });
  },
  siren(V, t) { // 単発版（ループは audio.update が制御）
    for (let i = 0; i < 4; i++) tone(V, t + i * 0.32, { type: 'square', f: i % 2 ? 660 : 880, dur: 0.3, vol: 0.06, lp: 2200, sus: 0.9, rel: 0.02 });
  },
  engine(V, t) { tone(V, t, { type: 'sawtooth', f: 55, f1: 140, dur: 0.7, vol: 0.14, lp: 700, a: 0.03 }); },
  door(V, t) {
    noiz(V, t, { dur: 0.08, vol: 0.25, ft: 'lowpass', f: 900 });
    tone(V, t, { type: 'sine', f: 140, f1: 70, dur: 0.1, vol: 0.2 });
  },
  tune(V, t) { // ラジオのチューニング音
    noiz(V, t, { dur: 0.28, vol: 0.12, f: 2500, f1: 1200, Q: 3 });
    tone(V, t, { type: 'sine', f: 1500, f1: 600, dur: 0.22, vol: 0.04 });
  },
  uiClick(V, t) { tone(V, t, { type: 'sine', f: 1250, dur: 0.035, vol: 0.12 }); },
  uiOpen(V, t) {
    tone(V, t, { type: 'triangle', f: 520, f1: 980, dur: 0.08, vol: 0.12 });
    tone(V, t + 0.05, { type: 'sine', f: 1300, dur: 0.06, vol: 0.06 });
  },
  uiClose(V, t) { tone(V, t, { type: 'triangle', f: 900, f1: 480, dur: 0.07, vol: 0.1 }); },
  equip(V, t) {
    noiz(V, t, { dur: 0.05, vol: 0.12, f: 3500, Q: 2 });
    tone(V, t + 0.02, { type: 'square', f: 660, dur: 0.05, vol: 0.06, lp: 3000 });
  },
  questDone(V, t) {
    [67, 72, 76, 79].forEach((m, i) => tone(V, t + i * 0.1, { type: 'square', f: mtof(m), dur: 0.14, vol: 0.09, lp: 4000 }));
    [72, 76, 79, 84].forEach((m) => tone(V, t + 0.42, { type: 'triangle', f: mtof(m), dur: 0.6, vol: 0.09, sus: 0.7, rel: 0.3 }));
  },
  questAccept(V, t) {
    tone(V, t, { type: 'square', f: mtof(76), dur: 0.08, vol: 0.08, lp: 3500 });
    tone(V, t + 0.08, { type: 'square', f: mtof(83), dur: 0.16, vol: 0.08, lp: 3500 });
  },
  bookNew(V, t) {
    [79, 83, 86].forEach((m, i) => tone(V, t + i * 0.06, { type: 'triangle', f: mtof(m), dur: 0.2, vol: 0.1 }));
  },
  wantedUp(V, t) {
    tone(V, t, { type: 'square', f: 494, dur: 0.12, vol: 0.08, lp: 2500 });
    tone(V, t + 0.13, { type: 'square', f: 392, dur: 0.2, vol: 0.08, lp: 2500 });
  },
  death(V, t) {
    tone(V, t, { type: 'sawtooth', f: 440, f1: 55, dur: 1.1, vol: 0.14, lp: 1500, lp1: 300 });
    [67, 63, 60, 55].forEach((m, i) => tone(V, t + 0.15 + i * 0.22, { type: 'triangle', f: mtof(m), dur: 0.3, vol: 0.12 }));
  },
  // --- スキル（種類別）
  skill_melee(V, t, o) {
    noiz(V, t, { dur: 0.18, vol: 0.24, f: 500 * o.p, f1: 3000 * o.p, Q: 1.4, a: 0.02 });
    tone(V, t + 0.04, { type: 'sine', f: 160 * o.p, f1: 50, dur: 0.18, vol: 0.28 });
    tone(V, t, { type: 'sawtooth', f: 880 * o.p, f1: 1760 * o.p, dur: 0.1, vol: 0.06, lp: 3000 });
  },
  skill_projectile(V, t, o) {
    for (let i = 0; i < 3; i++) tone(V, t + i * 0.05, { type: 'square', f: (1300 - i * 120) * o.p, f1: 400 * o.p, dur: 0.08, vol: 0.08, lp: 4000 });
    tone(V, t, { type: 'sine', f: 2000 * o.p, f1: 3000 * o.p, dur: 0.15, vol: 0.06 });
  },
  skill_aoe(V, t) {
    noiz(V, t, { dur: 0.7, vol: 0.42, ft: 'lowpass', f: 2200, f1: 90, a: 0.005 });
    tone(V, t, { type: 'sine', f: 120, f1: 32, dur: 0.55, vol: 0.45 });
    tone(V, t, { type: 'square', f: 90, f1: 40, dur: 0.25, vol: 0.08, lp: 600 });
  },
  skill_buff(V, t) {
    [60, 64, 67, 71, 72].forEach((m, i) => tone(V, t + i * 0.05, { type: 'triangle', f: mtof(m + 12), dur: 0.5, vol: 0.07, sus: 0.6, rel: 0.2 }));
    noiz(V, t, { dur: 0.6, vol: 0.06, f: 3000, f1: 9000, Q: 2, a: 0.15 });
  },
  skill_dash(V, t, o) {
    noiz(V, t, { dur: 0.22, vol: 0.26, f: 3500 * o.p, f1: 400, Q: 1.2, a: 0.01 });
    tone(V, t, { type: 'sawtooth', f: 300 * o.p, f1: 1200 * o.p, dur: 0.12, vol: 0.05, lp: 2500 });
  },
};
SFX.skill = (V, t, o) => (SFX['skill_' + (o.kind || 'melee')] || SFX.skill_melee)(V, t, o);

// ---------------------------------------------------------------------------
// v3 SE: 強化・潜在・転職・カットイン・移動スキル・コンボ・コンテンツ・UI
const brass = (V, t, f, dur, vol) => tone(V, t, { type: 'sawtooth', f, dur, vol, a: 0.02, sus: 0.75, rel: 0.08, lp: 900, lp1: 3400, Q: 1 });
Object.assign(SFX, {
  tuneStart(V, t) { // ネオン・チューン開始（チャージ）
    tone(V, t, { type: 'sawtooth', f: 200, f1: 1600, dur: 0.45, vol: 0.05, lp: 2600, a: 0.05 });
    noiz(V, t, { dur: 0.45, vol: 0.08, f: 800, f1: 6000, Q: 3, a: 0.2 });
  },
  tuneSuccess(V, t, o) { // ★が高いほど音程が上がる
    const up = Math.floor(clamp(o.star || 0, 0, 25) / 5) * 2;
    noiz(V, t, { dur: 0.08, vol: 0.14, f: 4000, Q: 2 });
    [76, 79, 83, 88].forEach((m, i) => tone(V, t + i * 0.05, { type: 'square', f: mtof(m + up), dur: 0.12, vol: 0.07, lp: 5000 }));
    [88, 91, 95].forEach((m) => tone(V, t + 0.22, { type: 'triangle', f: mtof(m + up), dur: 0.6, vol: 0.08, sus: 0.6, rel: 0.3 }));
    tone(V, t + 0.22, { type: 'sine', f: mtof(100 + up), dur: 0.5, vol: 0.05 });
    noiz(V, t + 0.18, { dur: 0.6, vol: 0.07, ft: 'highpass', f: 8000, a: 0.03 });
  },
  tuneFail(V, t) { // 失敗（装備は壊れないので深刻すぎない「ブゥン」）
    tone(V, t, { type: 'sawtooth', f: 330, f1: 110, dur: 0.4, vol: 0.11, lp: 1400 });
    tone(V, t + 0.02, { type: 'square', f: 220, f1: 70, dur: 0.38, vol: 0.05, lp: 900 });
    noiz(V, t, { dur: 0.25, vol: 0.12, ft: 'lowpass', f: 1200, f1: 200 });
    tone(V, t + 0.42, { type: 'triangle', f: mtof(55), dur: 0.25, vol: 0.08 });
  },
  chip(V, t) { // チップ挿入 → ルーレット → 確定
    noiz(V, t, { dur: 0.04, vol: 0.2, f: 3000, Q: 2 });
    tone(V, t, { type: 'sine', f: 180, f1: 90, dur: 0.06, vol: 0.18 });
    for (let i = 0; i < 8; i++) { const dt = i * 0.045 + i * i * 0.003; tone(V, t + 0.05 + dt, { type: 'square', f: mtof(84 + ((i * 5) % 12)), dur: 0.035, vol: 0.05, lp: 4000 }); }
    tone(V, t + 0.55, { type: 'triangle', f: mtof(91), dur: 0.2, vol: 0.1 });
  },
  gradeUp(V, t, o) { // 潜在等級アップ（grade 1..4 で華やかに）
    const up = clamp(o.grade ?? 1, 0, 4) * 2;
    tone(V, t, { type: 'sine', f: 180, f1: 1400, dur: 0.35, vol: 0.08, a: 0.05 });
    noiz(V, t, { dur: 0.4, vol: 0.1, f: 600, f1: 8000, Q: 2, a: 0.3 });
    [72, 76, 79, 84, 88].forEach((m, i) => tone(V, t + 0.35 + i * 0.06, { type: 'square', f: mtof(m + up), dur: 0.14, vol: 0.065, lp: 5000 }));
    [84, 88, 91, 96].forEach((m) => tone(V, t + 0.7, { type: 'triangle', f: mtof(m + up), dur: 0.9, vol: 0.065, sus: 0.7, rel: 0.4 }));
    noiz(V, t + 0.68, { dur: 1.0, vol: 0.07, ft: 'highpass', f: 7500, a: 0.05 });
  },
  cutin(V, t) { // シュッ → ドン → キラッ
    noiz(V, t, { dur: 0.3, vol: 0.25, f: 400, f1: 5000, Q: 1.2, a: 0.25 });
    tone(V, t + 0.28, { type: 'sine', f: 140, f1: 35, dur: 0.6, vol: 0.5 });
    noiz(V, t + 0.28, { dur: 0.5, vol: 0.3, ft: 'lowpass', f: 3000, f1: 150 });
    [79, 86, 91].forEach((m, i) => tone(V, t + 0.3 + i * 0.03, { type: 'sawtooth', f: mtof(m), dur: 0.5, vol: 0.035, lp: 3500, sus: 0.5, rel: 0.3 }));
    noiz(V, t + 0.35, { dur: 0.8, vol: 0.06, ft: 'highpass', f: 9000, a: 0.05 });
  },
  jobUp(V, t) { // 転職ファンファーレ
    [[67, 0, 0.11], [67, 0.13, 0.11], [67, 0.26, 0.11], [72, 0.4, 0.42], [70, 0.86, 0.12], [72, 1.0, 0.7]].forEach(([m, dt, d]) => {
      brass(V, t + dt, mtof(m), d, 0.09); brass(V, t + dt, mtof(m - 5), d, 0.05);
    });
    tone(V, t + 0.4, { type: 'sine', f: 98, f1: 60, dur: 0.5, vol: 0.4 });
    tone(V, t + 1.0, { type: 'sine', f: 110, f1: 55, dur: 0.7, vol: 0.45 });
    [72, 76, 79, 84].forEach((m) => tone(V, t + 1.0, { type: 'triangle', f: mtof(m), dur: 1.1, vol: 0.07, sus: 0.7, rel: 0.5 }));
    noiz(V, t + 1.0, { dur: 1.4, vol: 0.12, ft: 'highpass', f: 5000, Q: 0.4, seed: 0.6 });
  },
  jobAvailable(V, t) { // 転職できる！（軽い呼び鈴）
    [84, 91, 88, 96].forEach((m, i) => tone(V, t + i * 0.08, { type: 'triangle', f: mtof(m), dur: 0.25, vol: 0.09 }));
    noiz(V, t + 0.2, { dur: 0.4, vol: 0.05, ft: 'highpass', f: 8500, a: 0.04 });
  },
  // --- 移動スキル 5種
  move_flashJump(V, t, o) { // 空中で2段目: ふわっ＋パン
    noiz(V, t, { dur: 0.18, vol: 0.22, f: 900 * o.p, f1: 5000 * o.p, Q: 1.4, a: 0.01 });
    tone(V, t, { type: 'square', f: 420 * o.p, f1: 1300 * o.p, dur: 0.1, vol: 0.07, lp: 3000 });
    tone(V, t + 0.03, { type: 'sine', f: 220, f1: 90, dur: 0.08, vol: 0.18 });
  },
  move_teleport(V, t, o) { // ビュン（消える→現れる）
    tone(V, t, { type: 'sine', f: 2400 * o.p, f1: 200, dur: 0.07, vol: 0.12 });
    tone(V, t + 0.08, { type: 'sine', f: 300, f1: 2600 * o.p, dur: 0.08, vol: 0.12 });
    tone(V, t + 0.08, { type: 'square', f: 1600 * o.p, f1: 3200 * o.p, dur: 0.06, vol: 0.03, lp: 6000 });
    noiz(V, t + 0.1, { dur: 0.2, vol: 0.05, ft: 'highpass', f: 8000 });
  },
  move_rush(V, t, o) { // ドッ＋重い風切り
    noiz(V, t, { dur: 0.26, vol: 0.28, f: 2500 * o.p, f1: 300, Q: 0.9, a: 0.01 });
    tone(V, t, { type: 'sine', f: 130, f1: 45, dur: 0.2, vol: 0.38 });
    tone(V, t, { type: 'sawtooth', f: 90, f1: 60, dur: 0.18, vol: 0.06, lp: 500 });
  },
  move_glide(V, t, o) { // 長いエアリーな風
    noiz(V, t, { dur: 0.7, vol: 0.14, f: 600 * o.p, f1: 2200 * o.p, Q: 2.5, a: 0.12 });
    tone(V, t, { type: 'triangle', f: 520 * o.p, f1: 780 * o.p, dur: 0.6, vol: 0.04, a: 0.1, lin: true });
  },
  move_wheelDash(V, t, o) { // エンジン空ぶかし＋タイヤ鳴き
    tone(V, t, { type: 'sawtooth', f: 60, f1: 190, dur: 0.6, vol: 0.12, lp: 900, a: 0.02 });
    tone(V, t, { type: 'square', f: 30, f1: 95, dur: 0.6, vol: 0.06, lp: 500 });
    noiz(V, t + 0.02, { dur: 0.45, vol: 0.12, f: 2900 * o.p, f1: 2300 * o.p, Q: 9, a: 0.03 });
  },
  combo(V, t, o) { // コンボ段階 o.stage（0..）で音程上昇
    const st = clamp(Math.floor(o.stage || 0), 0, 12);
    const m = 72 + Math.min(24, st * 2);
    tone(V, t, { type: 'square', f: mtof(m), dur: 0.06, vol: 0.06, lp: 5000 });
    tone(V, t + 0.045, { type: 'triangle', f: mtof(m + 7), dur: 0.14, vol: 0.09 });
    if (st >= 3) tone(V, t + 0.09, { type: 'sine', f: mtof(m + 12), dur: 0.2, vol: 0.06 });
    if (st >= 6) noiz(V, t + 0.06, { dur: 0.3, vol: 0.05, ft: 'highpass', f: 8000, a: 0.02 });
  },
  towerClear(V, t) { // 階クリア
    [[64, 0], [67, 0.09], [71, 0.18], [76, 0.27]].forEach(([m, dt]) => tone(V, t + dt, { type: 'square', f: mtof(m), dur: 0.12, vol: 0.08, lp: 4500 }));
    [76, 79, 83, 88].forEach((m) => tone(V, t + 0.38, { type: 'sawtooth', f: mtof(m), dur: 0.6, vol: 0.035, lp: 3200, sus: 0.7, rel: 0.3 }));
    tone(V, t + 0.38, { type: 'sine', f: 82, f1: 50, dur: 0.5, vol: 0.4 });
    noiz(V, t + 0.38, { dur: 0.9, vol: 0.08, ft: 'highpass', f: 6000, a: 0.02 });
  },
  achievement(V, t) { // 実績解除（トロフィー）
    tone(V, t, { type: 'sine', f: mtof(84), dur: 0.5, vol: 0.12 }); tone(V, t, { type: 'sine', f: mtof(84) * 3.01, dur: 0.15, vol: 0.03 });
    tone(V, t + 0.1, { type: 'sine', f: mtof(88), dur: 0.5, vol: 0.12 }); tone(V, t + 0.1, { type: 'sine', f: mtof(88) * 3.01, dur: 0.15, vol: 0.03 });
    tone(V, t + 0.2, { type: 'sine', f: mtof(91), dur: 0.9, vol: 0.13 }); tone(V, t + 0.2, { type: 'sine', f: mtof(96), dur: 0.9, vol: 0.06 });
    noiz(V, t + 0.18, { dur: 0.9, vol: 0.06, ft: 'highpass', f: 9000, a: 0.05 });
  },
  loginBonus(V, t) { // コイン + ベル
    for (let i = 0; i < 5; i++) { tone(V, t + i * 0.06, { type: 'square', f: 988 * (1 + i * 0.06), dur: 0.05, vol: 0.05, lp: 5000 }); tone(V, t + i * 0.06 + 0.05, { type: 'square', f: 1319 * (1 + i * 0.06), dur: 0.1, vol: 0.05, lp: 5000 }); }
    [79, 84, 88].forEach((m) => tone(V, t + 0.35, { type: 'triangle', f: mtof(m), dur: 0.7, vol: 0.08, sus: 0.6, rel: 0.3 }));
  },
  menuOpen(V, t) { // 大きいメニュー（ESC/コンテンツ窓）
    tone(V, t, { type: 'sawtooth', f: 300, f1: 900, dur: 0.12, vol: 0.05, lp: 2400 });
    tone(V, t + 0.06, { type: 'triangle', f: mtof(84), dur: 0.12, vol: 0.09 });
    tone(V, t + 0.11, { type: 'triangle', f: mtof(91), dur: 0.18, vol: 0.08 });
    noiz(V, t, { dur: 0.16, vol: 0.05, f: 1200, f1: 6000, Q: 2, a: 0.08 });
  },
  menuClose(V, t) {
    tone(V, t, { type: 'triangle', f: mtof(91), dur: 0.08, vol: 0.07 });
    tone(V, t + 0.05, { type: 'triangle', f: mtof(84), dur: 0.12, vol: 0.07 });
  },
  tab(V, t) { tone(V, t, { type: 'square', f: 1800, dur: 0.025, vol: 0.05, lp: 4000 }); },
  deny(V, t) { // できない／MP不足など
    tone(V, t, { type: 'square', f: 180, dur: 0.08, vol: 0.07, lp: 1200 });
    tone(V, t + 0.1, { type: 'square', f: 150, dur: 0.12, vol: 0.07, lp: 1200 });
  },
  bossWarn(V, t) { // ボス出現の警報
    for (let i = 0; i < 2; i++) {
      brass(V, t + i * 0.5, mtof(43), 0.4, 0.12); brass(V, t + i * 0.5, mtof(44), 0.4, 0.08);
      tone(V, t + i * 0.5, { type: 'sine', f: 70, f1: 40, dur: 0.45, vol: 0.4 });
    }
  },
  arenaWave(V, t) { // 次のウェーブ（ゴング＋ホーン）
    tone(V, t, { type: 'sine', f: 196, dur: 1.2, vol: 0.18 }); tone(V, t, { type: 'sine', f: 196 * 2.76, dur: 0.6, vol: 0.05 });
    noiz(V, t, { dur: 0.6, vol: 0.12, ft: 'lowpass', f: 2500, f1: 300 });
    brass(V, t + 0.15, mtof(62), 0.3, 0.08); brass(V, t + 0.45, mtof(69), 0.5, 0.09);
  },
  presetSwap(V, t) {
    noiz(V, t, { dur: 0.08, vol: 0.12, f: 2500, f1: 5000, Q: 2 });
    tone(V, t + 0.03, { type: 'square', f: 880, f1: 1320, dur: 0.08, vol: 0.05, lp: 4000 });
  },
});

// --- 職ごとのスキル音（銃・ダンス・格闘・車・電脳・ドローン） ---------------------
// o: {p, kind, effect, hits, count, projKind}
function crack(V, t, p, v = 1) { // 銃声
  noiz(V, t, { dur: 0.05, vol: 0.32 * v, ft: 'highpass', f: 2200, Q: 0.6 });
  tone(V, t, { type: 'square', f: 1700 * p, f1: 180 * p, dur: 0.045, vol: 0.08 * v, lp: 4000 });
  tone(V, t, { type: 'sine', f: 190, f1: 60, dur: 0.07, vol: 0.22 * v });
}
function boom(V, t, v = 1, len = 0.6) { // 爆発
  noiz(V, t, { dur: len, vol: 0.38 * v, ft: 'lowpass', f: 2400, f1: 80, a: 0.004 });
  tone(V, t, { type: 'sine', f: 120, f1: 30, dur: len * 0.8, vol: 0.42 * v });
}
function punch(V, t, p, v = 1) {
  tone(V, t, { type: 'sine', f: 150 * p, f1: 48, dur: 0.09, vol: 0.4 * v });
  noiz(V, t, { dur: 0.05, vol: 0.22 * v, ft: 'lowpass', f: 1400 });
  noiz(V, t, { dur: 0.03, vol: 0.12 * v, f: 3500, Q: 1 });
}
function rev(V, t, dur, v = 1) { // エンジン
  tone(V, t, { type: 'sawtooth', f: 55, f1: 170, dur, vol: 0.12 * v, lp: 900, a: 0.02 });
  tone(V, t, { type: 'square', f: 28, f1: 85, dur, vol: 0.06 * v, lp: 450 });
}
function squeal(V, t, dur, v = 1) { noiz(V, t, { dur, vol: 0.13 * v, f: 2900, f1: 2200, Q: 10, a: 0.02 }); }
function glitch(V, t, n, p, v = 1) { // ランダムなビット音
  const r = rng(hashStr('g' + n + Math.floor(t * 1000)));
  for (let i = 0; i < n; i++) {
    const f = 300 * Math.pow(2, Math.floor(r() * 24) / 6) * p;
    tone(V, t + i * 0.022, { type: 'square', f, dur: 0.018, vol: 0.045 * v, lp: 6000 });
  }
}
function buzz(V, t, dur, v = 1) { // ドローンのプロペラ
  tone(V, t, { type: 'sawtooth', f: 175, f1: 210, dur, vol: 0.04 * v, lp: 1400, a: 0.03 });
  tone(V, t, { type: 'sawtooth', f: 181, f1: 216, dur, vol: 0.04 * v, lp: 1400, a: 0.03 });
}
function pew(V, t, p, v = 1) { tone(V, t, { type: 'square', f: 2400 * p, f1: 500 * p, dur: 0.1, vol: 0.07 * v, lp: 5000 }); }

const JOB_SFX = {
  gun(V, t, o) {
    const p = o.p, k = o.kind;
    if (k === 'buff') { // リロード／コッキング
      noiz(V, t, { dur: 0.04, vol: 0.2, f: 3000, Q: 2 }); tone(V, t, { type: 'square', f: 900, dur: 0.02, vol: 0.05 });
      noiz(V, t + 0.14, { dur: 0.06, vol: 0.22, f: 1800, Q: 2 }); tone(V, t + 0.14, { type: 'square', f: 600, dur: 0.03, vol: 0.05 });
      SFX.skill_buff(V, t + 0.2, o); return;
    }
    if (k === 'aoe') { // バレット・レイン
      tone(V, t, { type: 'sine', f: 2600, f1: 700, dur: 0.5, vol: 0.05 });
      for (let i = 0; i < 9; i++) crack(V, t + 0.12 + i * 0.05 + (i % 3) * 0.012, p * (1 - i * 0.02), 0.55);
      return;
    }
    if (o.projKind === 'beam') { // レール
      tone(V, t, { type: 'sine', f: 400, f1: 2600, dur: 0.09, vol: 0.08 });
      crack(V, t + 0.09, p, 1.1);
      tone(V, t + 0.09, { type: 'sawtooth', f: 3200 * p, f1: 300, dur: 0.28, vol: 0.06, lp: 6000 });
      return;
    }
    const n = clamp(o.count || 1, 1, 6), gap = n > 3 ? 0.016 : 0.07;
    for (let i = 0; i < n; i++) crack(V, t + i * gap, p * (1 + i * 0.03), n > 3 ? 0.6 : 0.9);
    if (o.projKind === 'heart' || o.projKind === 'star') tone(V, t + 0.05, { type: 'sine', f: 1760 * p, dur: 0.3, vol: 0.06 });
    tone(V, t + 0.14 + n * gap, { type: 'triangle', f: 4200, dur: 0.03, vol: 0.035 }); // 薬莢
  },
  dance(V, t, o) {
    const p = o.p, k = o.kind;
    const sc = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
    if (k === 'aoe') { // ストロボ/ステージ: ベースドロップ + ストロボのザップ
      tone(V, t, { type: 'sine', f: 95, f1: 38, dur: 0.6, vol: 0.45 });
      for (let i = 0; i < 4; i++) tone(V, t + 0.06 + i * 0.07, { type: 'square', f: mtof(81 + (i % 2) * 7), dur: 0.04, vol: 0.06, lp: 6000 });
      [69, 72, 76].forEach((m) => tone(V, t, { type: 'sawtooth', f: mtof(m), dur: 0.25, vol: 0.035, lp: 2800 }));
      noiz(V, t, { dur: 0.4, vol: 0.12, ft: 'highpass', f: 5000, a: 0.005 });
      return;
    }
    if (k === 'buff') { // DJ ライザー
      noiz(V, t, { dur: 0.7, vol: 0.12, f: 500, f1: 7000, Q: 3, a: 0.5 });
      tone(V, t, { type: 'sawtooth', f: 220, f1: 880, dur: 0.7, vol: 0.04, lp: 3000, a: 0.4 });
      tone(V, t + 0.7, { type: 'sine', f: 110, f1: 50, dur: 0.3, vol: 0.35 });
      return;
    }
    if (k === 'dash') { // キラキラ残像
      noiz(V, t, { dur: 0.25, vol: 0.18, f: 4000 * p, f1: 900, Q: 1.4, a: 0.01 });
      [76, 81, 88, 93].forEach((m, i) => tone(V, t + i * 0.035, { type: 'triangle', f: mtof(m), dur: 0.12, vol: 0.06 }));
      return;
    }
    // 連撃: スケール上の短いシンセスタブ + 風切り
    const n = clamp(o.hits || 3, 1, 8);
    for (let i = 0; i < n; i++) {
      tone(V, t + i * 0.05, { type: 'square', f: mtof(69 + sc[i % sc.length]) * p, dur: 0.05, vol: 0.05, lp: 4500 });
      if (i % 2 === 0) noiz(V, t + i * 0.05, { dur: 0.08, vol: 0.12, f: 1200, f1: 4000, Q: 1.5, a: 0.01 });
    }
  },
  fight(V, t, o) {
    const p = o.p, k = o.kind;
    if (k === 'aoe') { // 地面への叩きつけ
      tone(V, t, { type: 'sine', f: 85, f1: 24, dur: 0.75, vol: 0.55 });
      noiz(V, t, { dur: 0.8, vol: 0.36, ft: 'lowpass', f: 1800, f1: 70, a: 0.003 });
      for (let i = 0; i < 5; i++) noiz(V, t + 0.12 + i * 0.07, { dur: 0.03, vol: 0.08, f: 2500 + i * 300, Q: 2 });
      return;
    }
    if (k === 'projectile') { // 龍の咆哮・衝撃波
      tone(V, t, { type: 'sawtooth', f: 120, f1: 70, dur: 0.55, vol: 0.12, lp: 900, a: 0.03 });
      tone(V, t, { type: 'sawtooth', f: 181, f1: 104, dur: 0.55, vol: 0.06, lp: 900, a: 0.03 });
      noiz(V, t, { dur: 0.55, vol: 0.22, f: 300, f1: 1500, Q: 1, a: 0.05 });
      punch(V, t, p, 1);
      return;
    }
    if (k === 'buff') { // 気合
      tone(V, t, { type: 'sawtooth', f: 260, f1: 400, dur: 0.18, vol: 0.06, lp: 1600 });
      punch(V, t + 0.05, 0.8, 1.1);
      tone(V, t + 0.05, { type: 'sine', f: 660, dur: 0.6, vol: 0.05 });
      return;
    }
    if (k === 'dash') { SFX.move_rush(V, t, o); return; }
    const n = clamp(o.hits || 1, 1, 6), heavy = o.effect === 'critHit' || n === 1;
    for (let i = 0; i < n; i++) punch(V, t + i * 0.055, p * (1 + (i % 2) * 0.08), i === n - 1 ? 1.1 : 0.7);
    if (heavy) { tone(V, t + (n - 1) * 0.055, { type: 'sine', f: 70, f1: 30, dur: 0.3, vol: 0.4 }); noiz(V, t + (n - 1) * 0.055, { dur: 0.2, vol: 0.16, f: 2400, f1: 600, Q: 1 }); }
  },
  race(V, t, o) {
    const k = o.kind;
    if (k === 'aoe') {
      if (o.effect === 'explosion') { rev(V, t, 0.25, 1); boom(V, t + 0.18, 1.1, 0.7); for (let i = 0; i < 3; i++) noiz(V, t + 0.3 + i * 0.09, { dur: 0.06, vol: 0.14, ft: 'lowpass', f: 900 }); }
      else { rev(V, t, 0.6, 1.1); squeal(V, t, 0.6, 1.2); noiz(V, t + 0.1, { dur: 0.5, vol: 0.08, ft: 'lowpass', f: 900, f1: 300, a: 0.1 }); }
      return;
    }
    if (k === 'projectile') { // マフラーのバックファイア
      const n = clamp(o.count || 2, 1, 4);
      for (let i = 0; i < n; i++) { noiz(V, t + i * 0.07, { dur: 0.1, vol: 0.26, ft: 'lowpass', f: 1000 }); tone(V, t + i * 0.07, { type: 'sine', f: 130, f1: 40, dur: 0.1, vol: 0.3 }); }
      noiz(V, t, { dur: 0.35, vol: 0.08, f: 700, f1: 2400, Q: 1, a: 0.05 });
      return;
    }
    if (k === 'buff') { // ターボのスプール
      tone(V, t, { type: 'sine', f: 800, f1: 4200, dur: 0.6, vol: 0.05, a: 0.2 });
      rev(V, t, 0.5, 0.8);
      noiz(V, t + 0.6, { dur: 0.2, vol: 0.14, ft: 'highpass', f: 3000 });
      return;
    }
    // dash / melee: ドリフト
    rev(V, t, 0.4, 1); squeal(V, t + 0.05, 0.35, 1);
    noiz(V, t, { dur: 0.22, vol: 0.18, f: 3000, f1: 500, Q: 1, a: 0.01 });
  },
  cyber(V, t, o) {
    const p = o.p, k = o.kind;
    if (k === 'aoe') {
      if (o.effect === 'explosion') { // 電源断 / 特異点
        tone(V, t, { type: 'sawtooth', f: 900, f1: 40, dur: 0.6, vol: 0.08, lp: 3000, lp1: 300 });
        tone(V, t, { type: 'sine', f: 110, f1: 30, dur: 0.6, vol: 0.4 });
        glitch(V, t + 0.1, 10, p, 0.8);
      } else {
        noiz(V, t, { dur: 0.35, vol: 0.14, f: 900, f1: 5000, Q: 3 });
        glitch(V, t, 12, p, 1);
        tone(V, t, { type: 'sine', f: 140, f1: 50, dur: 0.3, vol: 0.25 });
      }
      return;
    }
    if (k === 'buff') { // モデムの交渉音
      for (let i = 0; i < 8; i++) tone(V, t + i * 0.04, { type: 'sine', f: i % 2 ? 2100 : 1200, dur: 0.035, vol: 0.06 });
      SFX.skill_buff(V, t + 0.3, o);
      return;
    }
    if (k === 'projectile') {
      const n = clamp(o.count || 1, 1, 5);
      for (let i = 0; i < n; i++) tone(V, t + i * 0.03, { type: 'square', f: 2200 * p, f1: 350 * p, dur: 0.1, vol: 0.06, lp: 6000 });
      glitch(V, t + 0.02, 5, p, 0.7);
      tone(V, t, { type: 'sine', f: 3000 * p, f1: 1500 * p, dur: 0.12, vol: 0.05 });
      return;
    }
    if (k === 'dash') { SFX.move_teleport(V, t, o); glitch(V, t, 4, p, 0.6); return; }
    glitch(V, t, 7, p, 1);
    noiz(V, t, { dur: 0.12, vol: 0.14, f: 3000, Q: 2 });
  },
  drone(V, t, o) {
    const p = o.p, k = o.kind;
    buzz(V, t, k === 'aoe' ? 0.8 : 0.35, 1);
    if (k === 'aoe') {
      if (/orbital|laser/.test(String(o.id || ''))) { // オービタル・レーザー
        tone(V, t, { type: 'sine', f: 300, f1: 2400, dur: 0.3, vol: 0.06 });
        tone(V, t + 0.3, { type: 'sawtooth', f: 1100, dur: 0.6, vol: 0.05, lp: 4000, sus: 0.8, rel: 0.2 });
        boom(V, t + 0.3, 0.9, 0.7);
        return;
      }
      const n = clamp(o.hits || 2, 1, 6); // 爆撃: 落下の口笛 + 連続爆発
      tone(V, t, { type: 'sine', f: 2200, f1: 600, dur: 0.35, vol: 0.05 });
      for (let i = 0; i < n; i++) boom(V, t + 0.3 + i * 0.09, 0.5, 0.35);
      return;
    }
    if (k === 'buff') { // サーボ＋シールド
      tone(V, t, { type: 'square', f: 300, f1: 600, dur: 0.18, vol: 0.04, lp: 1500 });
      tone(V, t + 0.18, { type: 'sine', f: 220, dur: 0.6, vol: 0.08, sus: 0.6, rel: 0.2 });
      tone(V, t + 0.18, { type: 'sine', f: 331, dur: 0.6, vol: 0.05, sus: 0.6, rel: 0.2 });
      return;
    }
    if (o.projKind === 'beam') { tone(V, t, { type: 'sine', f: 500, f1: 3000, dur: 0.1, vol: 0.07 }); crack(V, t + 0.1, p * 1.2, 0.9); tone(V, t + 0.1, { type: 'sawtooth', f: 3600, f1: 400, dur: 0.25, vol: 0.05, lp: 6000 }); return; }
    const n = clamp(o.count || 3, 1, 6);
    if (n >= 5) { for (let i = 0; i < n; i++) { noiz(V, t + i * 0.04, { dur: 0.2, vol: 0.09, f: 800, f1: 3000, Q: 1.5, a: 0.03 }); tone(V, t + i * 0.04, { type: 'triangle', f: 600, f1: 300, dur: 0.15, vol: 0.04 }); } return; } // ミサイル
    for (let i = 0; i < n; i++) pew(V, t + i * 0.06, p * (1 + i * 0.05), 1);
  },
};
for (const f in JOB_SFX) SFX['jskill_' + f] = JOB_SFX[f];
const JOB_FAMILIES = Object.keys(JOB_SFX);
const FAM_ID = [['gun', /^lj_gun/], ['dance', /^lj_dance/], ['fight', /^jj_fight/], ['race', /^jj_race/], ['cyber', /^hn_/], ['drone', /^hd_/]];
const FAM_JOB = [['gun', /gunner|sharpshoot|trigger|outlaw/], ['dance', /dancer|rave|prism|cosmo/], ['fight', /brawl|knuckle|dragon|legend/], ['race', /racer|drift|nitro|warp/], ['cyber', /netrun|code_break|ghost|oracle/], ['drone', /drone|swarm|mecha|orbital/]];
function skillFamily(id, def) {
  const s = String(id || '');
  for (const [f, rx] of FAM_ID) if (rx.test(s)) return f;
  const rj = String(def?.reqJob || '');
  if (rj) for (const [f, rx] of FAM_JOB) if (rx.test(rj)) return f;
  if (def?.hero === 'hacker' || /^hk_/.test(s)) return 'cyber';
  return null;
}

// SE ごとのクールダウン(秒) / 同名同時発音上限
const CD = { hit: 0.035, crit: 0.06, coin: 0.045, pickup: 0.05, swing: 0.06, shoot: 0.05, zap: 0.05, jump: 0.08, hurt: 0.12, kill: 0.05, uiClick: 0.04, portal: 0.3, levelUp: 0.5, rare: 0.25, pet: 0.8, death: 1, questDone: 0.5, siren: 1, wantedUp: 0.3, tune: 0.1, land: 0.1 };
const PER = { hit: 3, crit: 2, coin: 3, pickup: 2, kill: 3 };
Object.assign(CD, {
  tuneStart: 0.3, tuneSuccess: 0.3, tuneFail: 0.3, chip: 0.25, gradeUp: 0.5, cutin: 0.5, jobUp: 1.5, jobAvailable: 1,
  move_flashJump: 0.12, move_teleport: 0.12, move_rush: 0.15, move_glide: 0.25, move_wheelDash: 0.3,
  combo: 0.06, towerClear: 0.6, achievement: 0.4, loginBonus: 0.6, menuOpen: 0.12, menuClose: 0.1, tab: 0.04, deny: 0.2,
  bossWarn: 1.2, arenaWave: 0.8, presetSwap: 0.15,
  jskill_gun: 0.05, jskill_dance: 0.06, jskill_fight: 0.06, jskill_race: 0.08, jskill_cyber: 0.06, jskill_drone: 0.06,
});
Object.assign(PER, { combo: 2, tuneSuccess: 1, tuneFail: 1, jobUp: 1, cutin: 1, achievement: 2 });
const DUCK = { levelUp: [0.45, 1.0], pet: [0.45, 1.0], questDone: [0.45, 1.0], jobUp: [0.3, 2.0], gradeUp: [0.5, 1.4], towerClear: [0.5, 1.0], achievement: [0.6, 1.0], cutin: [0.5, 0.9], tuneSuccess: [0.7, 0.7], loginBonus: [0.6, 0.9] };

// ---------------------------------------------------------------------------
// 楽器（BGM 用）  (V, t, ...)
const INST = {
  kick(V, t, v) {
    const ac = V.ac;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ac.createGain(); envPerc(g.gain, t, 0.002, 0.95 * v, 0.3);
    o.connect(g); g.connect(V.dest); o.start(t); o.stop(t + 0.33);
    reg(V, o, g);
  },
  snare(V, t, v, long) {
    noiz(V, t, { dur: long ? 0.32 : 0.16, vol: 0.42 * v, ft: 'highpass', f: 1300, Q: 0.6, seed: 0.3 });
    tone(V, t, { type: 'triangle', f: 200, f1: 150, dur: 0.08, vol: 0.32 * v });
  },
  clap(V, t, v) {
    const ac = V.ac;
    const src = ac.createBufferSource(); src.buffer = V.ctx.noise; src.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1400; fl.Q.value = 0.8;
    const g = ac.createGain(); const p = g.gain; const a = 0.5 * v;
    p.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) { p.linearRampToValueAtTime(a, t + i * 0.011 + 0.001); p.linearRampToValueAtTime(a * 0.25, t + i * 0.011 + 0.009); }
    p.linearRampToValueAtTime(a * 0.8, t + 0.035); p.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(fl); fl.connect(g); g.connect(V.dest); src.start(t, 0.5); src.stop(t + 0.25);
    reg(V, src, fl, g);
  },
  hat(V, t, v) { noiz(V, t, { dur: 0.035, vol: 0.16 * v, ft: 'highpass', f: 7500, Q: 0.5, seed: 0.1 }); },
  ohat(V, t, v) { noiz(V, t, { dur: 0.2, vol: 0.12 * v, ft: 'highpass', f: 7000, Q: 0.5, seed: 0.2 }); },
  shaker(V, t, v) { noiz(V, t, { dur: 0.06, vol: 0.1 * v, f: 6500, Q: 1.2, a: 0.012, seed: 0.4 }); },
  clave(V, t, v) { tone(V, t, { type: 'sine', f: 2500, dur: 0.05, vol: 0.14 * v }); },
  conga(V, t, v) { tone(V, t, { type: 'sine', f: 240, f1: 190, dur: 0.2, vol: 0.3 * v }); },
  congaHi(V, t, v) { tone(V, t, { type: 'sine', f: 360, f1: 300, dur: 0.15, vol: 0.24 * v }); },
  rim(V, t, v) { tone(V, t, { type: 'square', f: 1700, dur: 0.025, vol: 0.07 * v, bp: 1700, Q: 3 }); },
  tom(V, t, v) { tone(V, t, { type: 'sine', f: 180, f1: 90, dur: 0.25, vol: 0.35 * v }); },
  crash(V, t, v) { noiz(V, t, { dur: 1.2, vol: 0.1 * v, ft: 'highpass', f: 5000, Q: 0.4, seed: 0.6 }); },

  bass(V, t, f, dur, v, w) {
    if (w === '808') {
      tone(V, t, { type: 'sine', f: f * 1.5, f1: f, slide: 0.04, dur: Math.max(0.25, dur), vol: 0.5 * v, a: 0.004, sus: 0.85, rel: 0.12 });
      tone(V, t, { type: 'triangle', f: f * 2, dur: 0.06, vol: 0.12 * v });
      return;
    }
    if (w === 'sub') { tone(V, t, { type: 'sine', f, dur, vol: 0.65 * v, sus: 0.8, rel: 0.05 }); return; }
    tone(V, t, { type: w || 'sawtooth', f, dur, vol: (w === 'triangle' ? 0.6 : 0.36) * v, sus: 0.7, rel: 0.04, lp: Math.min(5000, f * 9), lp1: Math.max(120, f * 2.2), Q: 3 });
  },
  pad(V, t, fs, dur, v, w) {
    const ac = V.ac;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1600; fl.Q.value = 0.5;
    const g = ac.createGain(); envSus(g.gain, t, Math.min(0.25, dur * 0.2), 0.11 * v, 0.85, dur, 0.25);
    fl.connect(g); g.connect(V.dest);
    for (const f of fs) for (const dt of [-7, 7]) {
      const o = ac.createOscillator(); o.type = w || 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
      o.connect(fl); o.start(t); o.stop(t + dur + 0.3);
      reg(V, o);
    }
    extra(V, fl); extra(V, g);
  },
  pluck(V, t, fs, dur, v, w) {
    const ac = V.ac;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(4200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.25); fl.Q.value = 2;
    const g = ac.createGain(); envPerc(g.gain, t, 0.003, 0.13 * v, Math.max(0.12, dur));
    fl.connect(g); g.connect(V.dest);
    for (const f of fs) { const o = ac.createOscillator(); o.type = w || 'square'; o.frequency.value = f; o.connect(fl); o.start(t); o.stop(t + Math.max(0.12, dur) + 0.03); reg(V, o); }
    extra(V, fl); extra(V, g);
  },
  keys(V, t, fs, dur, v) { // ローズ風
    for (const f of fs) {
      tone(V, t, { type: 'sine', f, dur: Math.max(0.3, dur), vol: 0.1 * v, a: 0.005, sus: 0.5, rel: 0.25 });
      tone(V, t, { type: 'triangle', f: f * 2, dur: 0.2, vol: 0.025 * v });
    }
  },
  marimba(V, t, f, dur, v) {
    tone(V, t, { type: 'sine', f, dur: 0.32, vol: 0.22 * v });
    tone(V, t, { type: 'sine', f: f * 4, dur: 0.06, vol: 0.05 * v });
  },
  arp(V, t, f, dur, v, w) { tone(V, t, { type: w || 'square', f, dur: Math.max(0.05, dur * 0.8), vol: 0.07 * v, lp: 3800 }); },
  lead(V, t, f, dur, v, w) {
    if (w === 'bell') {
      tone(V, t, { type: 'sine', f, dur: Math.max(0.35, dur), vol: 0.16 * v });
      tone(V, t, { type: 'sine', f: f * 3.01, dur: 0.18, vol: 0.04 * v });
      return;
    }
    if (w === 'brass') {
      tone(V, t, { type: 'sawtooth', f, dur, vol: 0.13 * v, a: 0.02, sus: 0.75, rel: 0.06, lp: 900, lp1: 3200, Q: 1 });
      return;
    }
    const vol = (w === 'triangle' || w === 'sine' ? 0.2 : w === 'square' ? 0.085 : 0.075) * v;
    tone(V, t, { type: w || 'square', f, dur, vol, a: 0.006, sus: 0.75, rel: 0.07, lp: 4200 });
    if (w === 'sawtooth') tone(V, t, { type: 'sawtooth', f, dur, vol, a: 0.006, sus: 0.75, rel: 0.07, lp: 4200, detune: 12 });
  },
};

// ---------------------------------------------------------------------------
// 楽曲定義
const RH = {
  sparse: ['x---..x-x---....', 'x-x-x---..x-x---', 'x---x---x-x-x---', '....x-x-x---x---', 'x--x--x-x-------'],
  busy: ['x-xxx-x-x-xxx-x-', 'x-x-x-xxx---x-x-', 'xx-x-xx-x-x-x---', 'x---x-x-xx-x-x-x', 'x-x-x-x-x-x-x-x-'],
  hiphop: ['x--.....x-x.....', '........x-x-x---', 'x---....x--.x...', '..x-x-..x-------'],
  latin: ['x--x--x-..x-x---', '..x-x-x-x--x--x-', 'x-x--x--x-x-x---', 'x--x--x-x-x-x---'],
  epic: ['x-------x---x---', 'x---x---x-x-x-x-', 'x-x-x-x-x-------', 'x--x--x-x---x---'],
};

const REGIONS = {
  beach:     { key: 60, scale: 'major',  prog: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], town: 98,  field: 132, lead: 'square',   flavor: 'tropical' },
  downtown:  { key: 57, scale: 'minor',  prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], town: 92, field: 118, lead: 'sawtooth', flavor: 'synth' },
  slums:     { key: 50, scale: 'dorian', prog: [[0, 'm7'], [5, '7'], [0, 'm7'], [10, 'maj']], town: 88,  field: 126, lead: 'square',   flavor: 'grit' },
  swamp:     { key: 52, scale: 'minor',  prog: [[0, 'min'], [5, 'min'], [0, 'min'], [7, 'min']], town: 84, field: 112, lead: 'triangle', flavor: 'swamp', swing: 0.22 },
  casino:    { key: 55, scale: 'major',  prog: [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']], town: 102, field: 134, lead: 'square',   flavor: 'jazz', swing: 0.14 },
  rooftop:   { key: 59, scale: 'minor',  prog: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']], town: 90, field: 138, lead: 'sawtooth', flavor: 'epic' },
  spaceport: { key: 54, scale: 'lydian', prog: [[0, 'maj7'], [2, 'maj'], [9, 'min'], [7, 'sus']], town: 86, field: 128, lead: 'triangle', flavor: 'space' },
};

function regionSong(region, mode) {
  const R = REGIONS[region] || REGIONS.beach;
  const f = R.flavor;
  if (mode === 'town') {
    const d = {
      bpm: R.town, swing: R.swing ?? 0.1, key: R.key, scale: R.scale, prog: R.prog,
      drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..x...x...x...x.' },
      drumsB: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo' },
      bass: { w: 'triangle', pat: 'x-....x-o-..5-..' },
      chords: { style: 'pluck', w: 'triangle', pat: '..x...x...x...x.', vol: 0.9 },
      chordsB: { style: 'pad', w: 'triangle', pat: 'x---------------', vol: 0.8 },
      lead: { w: R.lead === 'sawtooth' ? 'square' : R.lead, rh: 'sparse', oct: 12, vol: 0.85 },
      leadB: { w: 'bell', rh: 'sparse', oct: 12, vol: 0.8 },
    };
    if (f === 'tropical') { d.drums.shaker = 'x.xxx.xxx.xxx.xx'; d.chords = { style: 'marimba', pat: 'x..x..x.x..x..x.' }; d.lead.w = 'triangle'; }
    if (f === 'synth') { d.chords = { style: 'pad', w: 'sawtooth', pat: 'x---------------', vol: 0.8 }; d.chordsB = { style: 'arp', w: 'square', pat: 'x.x.x.x.x.x.x.x.' }; d.drums.snare = '....x.......x...'; d.drums.snareLong = true; }
    if (f === 'grit') { d.drums.rim = '...x.....x....x.'; d.bass.w = 'square'; d.bass.pat = 'x--x..x-....x-..'; }
    if (f === 'swamp') { d.drums = { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x..x..x.x..x..x.' }; d.bass.pat = 'x-..5-..o-..5-..'; d.chords = { style: 'keys', pat: 'x.......x.......' }; }
    if (f === 'jazz') { d.drums = { kick: 'x.......x.......', rim: '....x.......x...', hat: 'x..xx..xx..xx..x' }; d.bass = { w: 'triangle', pat: 'x---3---5---7---' }; d.chords = { style: 'keys', pat: '..x.....x..x....' }; d.lead.w = 'bell'; }
    if (f === 'epic') { d.chords = { style: 'pad', w: 'sawtooth', pat: 'x---------------' }; d.drums.tom = '..............x.'; }
    if (f === 'space') { d.chords = { style: 'arp', w: 'triangle', pat: 'xxxxxxxxxxxxxxxx', vol: 0.9 }; d.chordsB = { style: 'pad', w: 'triangle', pat: 'x---------------' }; d.lead.w = 'sine'; }
    return d;
  }
  // field: ドライブ感
  const d = {
    bpm: R.field, swing: f === 'swamp' ? 0.12 : 0, key: R.key, scale: R.scale, prog: R.prog,
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..o...o...o...o.' },
    drumsB: { kick: 'x...x...x...x..x', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
    fill: '....x...x.x.xXXX',
    bass: { w: 'sawtooth', pat: 'x.x.o.x.x.x.o.x.' },
    chords: { style: 'arp', w: 'square', pat: 'xxxxxxxxxxxxxxxx', vol: 0.8 },
    chordsB: { style: 'pad', w: 'sawtooth', pat: 'x---------------', vol: 0.9 },
    lead: { w: R.lead, rh: 'busy', oct: 12, vol: 0.9 },
    leadB: { w: R.lead, rh: 'epic', oct: 12, vol: 0.9 },
  };
  if (f === 'tropical') { d.drums.shaker = 'xxxxxxxxxxxxxxxx'; d.drums.conga = '......x.......x.'; d.bass.w = 'square'; }
  if (f === 'synth') { d.bass.pat = 'xxxxxxxxxxxxxxxx'; d.drums.snareLong = true; d.drumsB.snareLong = true; }
  if (f === 'grit') { d.bass.pat = 'x.xx.xo.x.xx.x5.'; d.drums.clap = '....x.......x...'; d.drums.snare = null; }
  if (f === 'swamp') { d.drums = { kick: 'x..x..x.x..x....', snare: '....x.......x...', hat: 'x.xx.xx.xx.xx.xx' }; d.bass = { w: 'triangle', pat: 'x..x..5.o..x..5.' }; d.chords = { style: 'pluck', w: 'sawtooth', pat: 'x..x..x...x..x..' }; }
  if (f === 'jazz') { d.bass = { w: 'triangle', pat: 'x.3.5.7.o.7.5.3.' }; d.chords = { style: 'pluck', w: 'square', pat: '..x...x...x..xx.' }; d.drums.ohat = null; d.drums.rim = '.......x......x.'; }
  if (f === 'epic') { d.drums.crash = 'x...............'; d.chordsB.w = 'sawtooth'; d.bass.pat = 'xxxxoxxxxxxxoxxx'; }
  if (f === 'space') { d.chords = { style: 'arp', w: 'triangle', pat: 'xxxxxxxxxxxxxxxx' }; d.lead.w = 'square'; d.drums.ohat = null; }
  return d;
}

const SONGS = {
  boss: {
    bpm: 150, key: 50, scale: 'harm', prog: [[0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj']],
    drums: { kick: 'x..x..x...x..x..', snare: '....x.......x...', hat: 'XxxxXxxxXxxxXxxx' },
    drumsB: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x.xx', hat: 'x.x.x.x.x.x.x.x.', crash: 'x...............' },
    fill: '....x...xxxxXXXX',
    bass: { w: 'sawtooth', pat: 'xxxxxxxxoxxxxxxx' },
    chords: { style: 'pluck', w: 'sawtooth', pat: 'x..x..x...x.x...' },
    chordsB: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    lead: { w: 'sawtooth', rh: 'busy', oct: 12 }, leadB: { w: 'square', rh: 'epic', oct: 12 },
  },
  boss_final: {
    bpm: 160, key: 47, scale: 'phryg', prog: [[0, 'min'], [1, 'maj'], [8, 'maj'], [7, '7']],
    drums: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', crash: 'x...............' },
    drumsB: { kick: 'x..xx..xx..xx.xx', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', tom: '............x.xx' },
    fill: '..x.x.x.xxxxXXXX',
    bass: { w: 'sawtooth', pat: 'xxoxxxoxxxoxxxox' },
    chords: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    chordsB: { style: 'arp', w: 'square', pat: 'xxxxxxxxxxxxxxxx' },
    lead: { w: 'sawtooth', rh: 'epic', oct: 12 }, leadB: { w: 'sawtooth', rh: 'busy', oct: 12 },
  },
  title: {
    bpm: 96, key: 57, scale: 'minor', prog: [[0, 'min'], [5, 'min'], [8, 'maj'], [7, 'maj']],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', snareLong: true, hat: 'x.x.x.x.x.x.x.x.' },
    bass: { w: 'sawtooth', pat: 'x-x-o-x-x-x-o-x-' },
    chords: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    chordsB: { style: 'arp', w: 'square', pat: 'x.x.x.x.x.x.x.x.' },
    lead: { w: 'sawtooth', rh: 'sparse', oct: 12 }, leadB: { w: 'bell', rh: 'sparse', oct: 12 },
  },
  // --- v3: コンテンツ専用曲
  tower: { // ヴァイス・スパイア — 昇っていくアルペジオ
    bpm: 136, key: 52, scale: 'minor', prog: [[0, 'min'], [8, 'maj'], [10, 'maj'], [7, 'sus']],
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..o...o...o...o.' },
    drumsB: { kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', tom: '............x.xx', crash: 'x...............' },
    fill: '....x...x.x.xXXX',
    bass: { w: 'sawtooth', pat: 'x.xxo.x.x.xxo.x.' },
    chords: { style: 'arp', w: 'square', pat: 'xxxxxxxxxxxxxxxx', vol: 0.85 },
    chordsB: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    lead: { w: 'sawtooth', rh: 'busy', oct: 12 }, leadB: { w: 'brass', rh: 'epic', oct: 12 },
  },
  arena: { // ネオン・アリーナ — 観客が沸くクラブ・バトル
    bpm: 144, key: 53, scale: 'dorian', prog: [[0, 'm7'], [3, 'maj'], [5, '7'], [10, 'maj']],
    drums: { kick: 'x..x..x.x..x..x.', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', conga: '......x.......x.' },
    drumsB: { kick: 'x.x.x.x.x.x.x.x.', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..o...o...o...o.', crash: 'x...............' },
    fill: '....x...x.xxXXXX',
    bass: { w: 'square', pat: 'x..x..o.x..x..5.' },
    chords: { style: 'pluck', w: 'sawtooth', pat: '..x...x...x..x..' },
    chordsB: { style: 'arp', w: 'square', pat: 'xxxxxxxxxxxxxxxx' },
    lead: { w: 'square', rh: 'busy', oct: 12 }, leadB: { w: 'brass', rh: 'epic', oct: 12 },
  },
  boss_practice: { // 練習モード — 落ち着いたトレーニング
    bpm: 112, key: 57, scale: 'dorian', prog: [[0, 'm7'], [5, '7'], [3, 'maj7'], [10, 'maj']],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    drumsB: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.' },
    bass: { w: 'triangle', pat: 'x-..o-..x-..5-..' },
    chords: { style: 'keys', pat: 'x.......x.......' },
    lead: { w: 'triangle', rh: 'sparse', oct: 12, vol: 0.9 }, leadB: { w: 'bell', rh: 'sparse', oct: 12 },
  },
  boss_hard: { // ハード — 速く重い
    bpm: 164, key: 49, scale: 'harm', prog: [[0, 'min'], [1, 'maj'], [5, 'min'], [7, '7']],
    drums: { kick: 'x.xxx.x.x.xxx.x.', snare: '....x.......x...', hat: 'XxxxXxxxXxxxXxxx' },
    drumsB: { kick: 'x.x.x.x.x.x.x.xx', snare: '....x.......x.xx', hat: 'x.x.x.x.x.x.x.x.', crash: 'x...............', tom: '............xx.x' },
    fill: '..x.x.x.xxxxXXXX',
    bass: { w: 'sawtooth', pat: 'xxxxoxxxxxxxoxxx' },
    chords: { style: 'pluck', w: 'sawtooth', pat: 'x..x..x...x.x...' },
    chordsB: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    lead: { w: 'sawtooth', rh: 'busy', oct: 12 }, leadB: { w: 'brass', rh: 'epic', oct: 12 },
  },
  boss_chaos: { // カオス — 半音でうねる最凶モード
    bpm: 176, key: 46, scale: 'phryg', prog: [[0, 'min'], [1, 'maj'], [0, 'dim'], [11, 'maj']],
    drums: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', crash: 'x...............' },
    drumsB: { kick: 'xxx.xxx.xxx.x.xx', snare: '....x..x....x.xx', hat: 'XxXxXxXxXxXxXxXx', tom: '..........x.xxxx', crash: 'x.......x.......' },
    fill: 'x.x.x.x.xxxxXXXX',
    bass: { w: 'sawtooth', pat: 'xxoxxxoxxxoxxxox' },
    chords: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    chordsB: { style: 'arp', w: 'square', pat: 'xxxxxxxxxxxxxxxx' },
    lead: { w: 'sawtooth', rh: 'busy', oct: 12 }, leadB: { w: 'sawtooth', rh: 'epic', oct: 24, vol: 0.8 },
  },
  char_select: { // キャラ選択 — 夜明け前のローファイ
    bpm: 84, swing: 0.16, key: 54, scale: 'lydian', prog: [[0, 'maj7'], [2, '7'], [9, 'm7'], [7, 'sus']],
    drums: { kick: 'x.......x.x.....', rim: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    drumsB: { kick: 'x.......x.x.....', rim: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', shaker: '..x...x...x...x.' },
    bass: { w: 'triangle', pat: 'x-......x-..5-..' },
    chords: { style: 'keys', pat: 'x.......x.......' },
    chordsB: { style: 'pad', w: 'triangle', pat: 'x---------------', vol: 0.9 },
    lead: { w: 'bell', rh: 'sparse', oct: 12, vol: 0.85 }, leadB: { w: 'triangle', rh: 'sparse', oct: 12, vol: 0.9 },
  },
  // --- カーラジオ
  radio_0: { // NEON WAVE FM — シンセウェーブ
    bpm: 104, key: 57, scale: 'minor', prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', snareLong: true, hat: 'x.x.x.x.x.x.x.x.' },
    drumsB: { kick: 'x...x...x...x...', snare: '....x.......x...', snareLong: true, hat: 'xxxxxxxxxxxxxxxx' },
    fill: '....x.......xXxX',
    bass: { w: 'sawtooth', pat: 'xoxoxoxoxoxoxoxo' },
    chords: { style: 'pad', w: 'sawtooth', pat: 'x---------------' },
    chordsB: { style: 'arp', w: 'square', pat: 'xxxxxxxxxxxxxxxx' },
    lead: { w: 'sawtooth', rh: 'sparse', oct: 12 }, leadB: { w: 'sawtooth', rh: 'epic', oct: 12 },
  },
  radio_1: { // VICE HIPHOP 99.1 — ブーンバップ
    bpm: 88, swing: 0.24, key: 53, scale: 'minor', prog: [[0, 'm7'], [8, 'maj7'], [3, 'maj7'], [10, '7']],
    drums: { kick: 'x......x..x.....', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx' },
    drumsB: { kick: 'x......x..x..x..', clap: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', ohat: '.......o........' },
    bass: { w: '808', pat: 'x------x--x-----' },
    chords: { style: 'keys', pat: 'x-------..x-....' },
    lead: { w: 'bell', rh: 'hiphop', oct: 12, vol: 0.9 }, leadB: { w: 'bell', rh: 'hiphop', oct: 24, vol: 0.6 },
  },
  radio_2: { // TROPICAL LATIN 104 — デンボウ×マリンバ
    bpm: 98, key: 57, scale: 'harm', prog: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, '7']],
    drums: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', shaker: 'xoxoxoxoxoxoxoxo', clave: 'x..x..x...x.x...' },
    drumsB: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', shaker: 'xoxoxoxoxoxoxoxo', conga: 'x..x....x..x....', congaHi: '..x..x.x..x..xx.' },
    bass: { w: 'sub', pat: 'x..x..x.x..x..x.' },
    chords: { style: 'marimba', pat: 'x.xx.x.xx.x.xx.x' },
    lead: { w: 'brass', rh: 'latin', oct: 12 }, leadB: { w: 'triangle', rh: 'latin', oct: 12 },
  },
};
const REGION_IDS = Object.keys(REGIONS);
for (const r of REGION_IDS) { SONGS[r + '_town'] = regionSong(r, 'town'); SONGS[r + '_field'] = regionSong(r, 'field'); }

const STATIONS = [
  { id: 'radio_0', name: 'NEON WAVE FM' },
  { id: 'radio_1', name: 'VICE HIPHOP 99.1' },
  { id: 'radio_2', name: 'TROPICAL LATIN 104' },
];

// --- 曲の前処理（メロディ生成など） -----------------------------------------
const BUILT = {};
function chordTones(d, ch) {
  const ints = CHORDS[ch[1]] || CHORDS.maj;
  let base = d.key + ch[0]; if (ch[0] > 7) base -= 12;
  return ints.map((i) => base + i);
}
function genMelody(d, L, seedStr) {
  const r = rng(hashStr(seedStr));
  const sc = SCALES[d.scale] || SCALES.major;
  const center = d.key + (L.oct ?? 12);
  const pool = [];
  for (let m = center - 7; m <= center + 12; m++) if (sc.includes(((m - d.key) % 12 + 12) % 12)) pool.push(m);
  const rhs = RH[L.rh] || RH.sparse;
  const bars = [];
  let prev = center + 4;
  const near = (cands, target) => { let b = cands[0], bd = 1e9; for (const c of cands) { const dd = Math.abs(c - target) + r() * 1.5; if (dd < bd) { bd = dd; b = c; } } return b; };
  for (let b = 0; b < 8; b++) {
    if (b === 4 || b === 5) { bars.push(bars[b - 4]); continue; }
    const rh = rhs[Math.floor(r() * rhs.length)];
    const ct = chordTones(d, d.prog[b % d.prog.length]);
    const ctPool = pool.filter((m) => ct.some((c) => ((m - c) % 12 + 12) % 12 === 0));
    const arr = new Array(16).fill(null);
    for (let s = 0; s < 16; s++) {
      if (rh[s] !== 'x') continue;
      let len = 1; while (s + len < 16 && rh[s + len] === '-') len++;
      const strong = s % 4 === 0;
      const target = prev + Math.round((r() - 0.5) * 7);
      const m = (strong || b % 4 === 3) ? near(ctPool, target) : near(pool, target);
      arr[s] = { m, len };
      prev = m;
    }
    if (b % 4 === 3) { // フレーズ終止: 最後の音を根音付近で伸ばす
      let last = -1; for (let s = 0; s < 16; s++) if (arr[s]) last = s;
      if (last >= 0 && last < 12) { arr[12] = { m: near(ctPool, prev), len: 4 }; }
    }
    bars.push(arr);
  }
  return bars;
}
function build(id) {
  if (BUILT[id]) return BUILT[id];
  const d = SONGS[id]; if (!d) return null;
  const s = {
    id, d, stepDur: 60 / d.bpm / 4, bars: 16,
    melA: genMelody(d, d.lead, id + ':A'),
    melB: genMelody(d, d.leadB || d.lead, id + ':B'),
  };
  BUILT[id] = s;
  return s;
}

function holdLen(pat, s) { let n = 1; while (s + n < pat.length && pat[s + n] === '-') n++; return n; }

// 1ステップ分をスケジュール
function schedStep(ctx, ac, dest, song, step, t, sdOver) {
  const d = song.d, st = step % 16, bar = Math.floor(step / 16) % song.bars;
  const sec = bar >= 8 ? 1 : 0, sb = bar % 8;
  const V = voice(ac, ctx, dest);
  const sd = sdOver || song.stepDur;
  const ch = d.prog[bar % d.prog.length];
  // ドラム
  const drums = (sec && d.drumsB) || d.drums;
  for (const k in drums) {
    const pat0 = drums[k]; if (!pat0 || typeof pat0 !== 'string' || !INST[k]) continue;
    const pat = (sb === 7 && d.fill && (k === 'snare' || k === 'clap')) ? d.fill : pat0;
    const v = VEL[pat[st]]; if (!v) continue;
    if (k === 'snare') INST.snare(V, t, v, drums.snareLong); else INST[k](V, t, v);
  }
  // ベース
  const bp = d.bass?.pat; const bc = bp?.[st];
  if (bc && bc !== '.' && bc !== '-') {
    let root = ch[0] > 6 ? ch[0] - 12 : ch[0];
    const ints = CHORDS[ch[1]] || CHORDS.maj;
    let m = d.key - 24 + root;
    if (bc === 'o') m += 12; else if (bc === '5') m += 7; else if (bc === '3') m += ints[1]; else if (bc === '7') m += (ints[3] ?? 10);
    const len = holdLen(bp, st);
    INST.bass(V, t, mtof(m), len * sd * 0.85, 1, d.bass.w);
  }
  // コード
  const cd = (sec && d.chordsB) || d.chords;
  const cc = cd?.pat?.[st];
  if (cc && VEL[cc]) {
    const tones = chordTones(d, ch).slice(0, 4);
    const len = holdLen(cd.pat, st) * sd;
    const v = VEL[cc] * (cd.vol ?? 1);
    if (cd.style === 'pad') INST.pad(V, t, tones.slice(0, 3), len, v, cd.w);
    else if (cd.style === 'pluck') INST.pluck(V, t, tones.slice(0, 3), Math.min(len, sd * 2), v, cd.w);
    else if (cd.style === 'keys') INST.keys(V, t, tones, Math.max(len, sd * 3), v);
    else if (cd.style === 'marimba') { const seq = [...tones, ...tones.map((x) => x + 12)]; INST.marimba(V, t, mtof(seq[(st * 3) % seq.length] + 12), sd, v); }
    else { const seq = [...tones, ...tones.map((x) => x + 12)]; const i = st % (seq.length * 2 - 2); const j = i < seq.length ? i : seq.length * 2 - 2 - i; INST.arp(V, t, mtof(seq[j] + 12), sd, v, cd.w); }
  }
  // メロディ
  const L = sec ? (d.leadB || d.lead) : d.lead;
  const n = (sec ? song.melB : song.melA)[sb]?.[st];
  if (n && L) INST.lead(V, t, mtof(n.m), n.len * sd * 0.9, L.vol ?? 1, L.w);
  return V;
}

// --- 手配度の緊迫レイヤー（lv 1..5）: 現在の曲のキー・コードに合わせたパーカッション＋ベース
function schedTension(ctx, ac, dest, song, step, t, lv, sd) {
  const d = song.d, st = step % 16, bar = Math.floor(step / 16);
  const ch = d.prog[bar % d.prog.length];
  const V = voice(ac, ctx, dest);
  const root = ch[0] > 6 ? ch[0] - 12 : ch[0];
  const bm = d.key - 24 + root;
  // ★1〜: 8分のミュートベース（★2〜 16分）
  if (lv >= 2 || st % 2 === 0) {
    const oct = (lv >= 5 && st % 4 === 2) ? 12 : 0;
    tone(V, t, { type: 'square', f: mtof(bm + oct), dur: sd * 0.7, vol: 0.09 + 0.015 * lv, lp: 380 + 110 * lv, Q: 4 });
  }
  // ★1〜: 低いタイコ（ドン…ドン）
  if (st === 0 || st === 8 || (lv >= 3 && (st === 6 || st === 14))) tone(V, t, { type: 'sine', f: 110, f1: 52, dur: 0.3, vol: 0.32 + 0.04 * lv });
  // ★2〜: 刻むハット＋リム
  if (lv >= 2) { INST.hat(V, t, st % 4 === 2 ? 0.9 : 0.45); if (st === 4 || st === 12) INST.rim(V, t, 1); }
  // ★3〜: スネア＋4小節ごとのロール、短2度の不協和ドローン
  if (lv >= 3) {
    if (st === 4 || st === 12) INST.snare(V, t, 0.4);
    if (bar % 4 === 3 && st >= 12) INST.snare(V, t, 0.22 + (st - 12) * 0.07);
    if (st === 0 && bar % 2 === 0) tone(V, t, { type: 'sawtooth', f: mtof(bm + 25), dur: sd * 6, vol: 0.03, lp: 1800, a: 0.05, sus: 0.7, rel: 0.2 });
  }
  // ★4〜: 4つ打ち＋32分ハット（テンポも上がる: tick 側で rate を上げる）
  if (lv >= 4) { if (st % 4 === 0) INST.kick(V, t, 0.5); INST.hat(V, t + sd / 2, 0.35); }
  // ★5: クラッシュ＋毎小節タムのフィル
  if (lv >= 5) { if (bar % 4 === 0 && st === 0) INST.crash(V, t, 0.7); if (st >= 13) INST.tom(V, t, 0.55); }
  return V;
}
const tensionRate = (lv) => (lv >= 5 ? 1.18 : lv >= 4 ? 1.1 : 1);

// --- 再生中の曲インスタンス ----------------------------------------------------
function startSong(id, fade) {
  const ac = E.ac, song = build(id); if (!ac || !song) return null;
  const g = ac.createGain(); E.live++;
  const now = ac.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));
  g.connect(E.music);
  const inst = { id, song, g, step: 0, next: now + 0.06, stopping: false, dead: false, rate: 1 };
  E.songs.push(inst);
  ensureTimer();
  return inst;
}
function fadeOutSong(inst, fade) {
  if (!inst || inst.stopping) return;
  inst.stopping = true;
  const ac = E.ac, now = ac.currentTime;
  const p = inst.g.gain;
  try { p.cancelScheduledValues(now); } catch (e) { /* noop */ }
  p.setValueAtTime(Math.max(0.0001, p.value), now);
  p.linearRampToValueAtTime(0.0001, now + Math.max(0.05, fade));
  inst.endAt = now + Math.max(0.05, fade);
}
function tick() {
  const ac = E.ac;
  if (!ac) return;
  if (ac.state !== 'running') return;
  const now = ac.currentTime;
  for (const s of E.songs) {
    if (s.dead) continue;
    if (s.stopping && now > s.endAt + 0.6) {
      s.dead = true; try { s.g.disconnect(); } catch (e) { /* noop */ } E.live--; continue;
    }
    if (s.stopping && s.next > s.endAt) continue;
    const isCur = s === E.current && !s.stopping;
    const lv = isCur ? E.tension : 0;
    s.rate += (tensionRate(lv) - s.rate) * 0.03;      // 25ms ごと → 約1秒でテンポが寄る
    if (Math.abs(s.rate - 1) < 0.002 && lv < 4) s.rate = 1;
    const sd = s.song.stepDur / s.rate;
    if (s.next < now - 0.25) { // タイマー停止（タブ裏）からの復帰: 時刻を合わせる
      const skip = Math.ceil((now - s.next) / sd);
      s.step += skip; s.next += skip * sd;
    }
    while (s.next < now + LOOKAHEAD) {
      const sw = (s.step % 2 === 1) ? (s.song.d.swing || 0) * sd : 0;
      schedStep(E, ac, s.g, s.song, s.step, s.next + sw, sd);
      if (lv > 0) schedTension(E, ac, E.tensionG, s.song, s.step, s.next + sw, lv, sd);
      s.step++; s.next += sd;
    }
  }
  E.songs = E.songs.filter((s) => !s.dead);
  if (!E.songs.length && E.timer) { clearInterval(E.timer); E.timer = null; }
}
function ensureTimer() {
  if (E.timer || typeof setInterval === 'undefined') return;
  E.timer = setInterval(guard(tick), TICK_MS);
}

// --- ループ SE（サイレン / エンジン） ---------------------------------------
function loopOn(name, level, param) {
  const ac = E.ac; if (!ac) return;
  let L = E.loops[name];
  const now = ac.currentTime;
  if (!L) {
    const out = ac.createGain(); out.gain.value = 0.0001; out.connect(E.sfx);
    const nodes = [out];
    let o1, lfo = null;
    if (name === 'siren') {
      o1 = ac.createOscillator(); o1.type = 'square'; o1.frequency.value = 760;
      lfo = ac.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.55;
      const lg = ac.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(o1.frequency);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2000;
      o1.connect(fl); fl.connect(out); nodes.push(o1, lfo, lg, fl);
      o1.start(); lfo.start();
    } else { // engine
      o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
      const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 25;
      lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 18;
      const lg = ac.createGain(); lg.gain.value = 0.25;
      const am = ac.createGain(); am.gain.value = 0.75;
      lfo.connect(lg); lg.connect(am.gain);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500; fl.Q.value = 2;
      const g2 = ac.createGain(); g2.gain.value = 0.6;
      o1.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(am); am.connect(out);
      nodes.push(o1, o2, lfo, lg, am, fl, g2);
      o1.start(); o2.start(); lfo.start();
      L = { o2, fl, lfo };
    }
    L = Object.assign(L || {}, { name, out, o1, lfo, nodes, on: true });
    E.live += nodes.length;
    E.loops[name] = L;
  }
  if (L.stopTimer) { clearTimeout(L.stopTimer); L.stopTimer = null; }
  L.on = true;
  L.out.gain.setTargetAtTime(level, now, 0.08);
  if (name === 'engine') {
    const sp = clamp(param || 0, 0, 1);
    const f = 45 + sp * 120;
    L.o1.frequency.setTargetAtTime(f, now, 0.08);
    L.o2.frequency.setTargetAtTime(f / 2, now, 0.08);
    L.fl.frequency.setTargetAtTime(380 + sp * 1600, now, 0.08);
    L.lfo.frequency.setTargetAtTime(14 + sp * 30, now, 0.1);
  }
}
function loopOff(name) {
  const L = E.loops[name]; if (!L || !L.on) return;
  L.on = false;
  const ac = E.ac;
  L.out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.06);
  L.stopTimer = setTimeout(() => {
    if (L.on) return;
    for (const n of L.nodes) { try { n.stop?.(); } catch (e) { /* noop */ } try { n.disconnect(); } catch (e) { /* noop */ } }
    E.live -= L.nodes.length;
    if (E.loops[name] === L) delete E.loops[name];
  }, 500);
}

// ---------------------------------------------------------------------------
// 選曲ロジック
function regionOf(map) {
  const r = map?.region || map?.theme;
  if (r && REGIONS[r]) return r;
  const id = String(map?.id || '');
  for (const k of REGION_IDS) if (id.startsWith(k)) return k;
  if (id.startsWith('down')) return 'downtown';
  if (id.startsWith('tower')) return 'rooftop';
  if (id.startsWith('space')) return 'spaceport';
  return 'beach';
}
function isBossMap(map) {
  if (!map || map.town) return false;
  if (map.boss || map.deadEnd) return true;
  if ((map.spawns || []).some((s) => (s.types || []).some((t) => /^boss/i.test(String(t))))) return true;
  return false;
}
const BOSS_MODE_TRACK = { normal: 'boss', easy: 'boss_practice', practice: 'boss_practice', hard: 'boss_hard', chaos: 'boss_chaos' };
function bossModeId(game) {
  const m = game.bossMode ?? game.map?.bossMode ?? game.map?.mode;
  const id = (m && typeof m === 'object') ? (m.id || m.mode || m.key || 'normal') : (m || 'normal');
  return String(id).toLowerCase();
}
const SELECT_RX = /select|create|slot|char|make/i;
function isCharSelect(game) {
  if (E.titleScreen) return E.titleScreen !== 'title';
  if (game.scene && game.scene !== 'title' && SELECT_RX.test(game.scene)) return true;
  for (const v of [game.titleMode, game.titleScreen, game.titleView, game.titlePhase, game.ui?.titleMode]) {
    if (typeof v === 'string' && SELECT_RX.test(v)) return true;
  }
  return false;
}
function trackFor(game) {
  if (!game) return null;
  if (game.scene && game.scene !== 'play') return isCharSelect(game) ? 'char_select' : 'title';
  const p = game.player, map = game.map;
  if (p?.dead) return null;
  if (p?.inVehicle) return STATIONS[E.radio].id;
  if (!map) return null;
  const inst = map.instance;
  if (inst === 'boss') return BOSS_MODE_TRACK[bossModeId(game)] || 'boss';
  if (inst === 'tower') return 'tower';
  if (inst === 'arena') return 'arena';
  const region = regionOf(map);
  const bossAlive = (game.enemies || []).some((e) => e && !e.dead && (e.boss || e.def?.boss));
  if (bossAlive || isBossMap(map)) return (region === 'rooftop' || region === 'spaceport') ? 'boss_final' : 'boss';
  return region + (map.town ? '_town' : '_field');
}

// ---------------------------------------------------------------------------
// 公開 API
function applyMaster(fast) {
  if (!E.ac) return;
  const now = E.ac.currentTime;
  const v = E.muted ? 0.0001 : Math.max(0.0001, 0.85 * E.volume);
  E.master.gain.setTargetAtTime(v, now, fast ? 0.01 : 0.05);
}
function duckMusic(amount, dur) {
  if (!E.ac) return;
  const p = E.music.gain, now = E.ac.currentTime, L = musicLevel();
  try { p.cancelScheduledValues(now); } catch (e) { /* noop */ }
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(Math.max(0.0001, L * amount), now + 0.06);
  p.setValueAtTime(Math.max(0.0001, L * amount), now + dur);
  p.linearRampToValueAtTime(Math.max(0.0001, L), now + dur + 0.6);
}
function applyBuses() {
  if (!E.ac) return;
  const now = E.ac.currentTime;
  for (const [node, v] of [[E.music, musicLevel()], [E.sfx, sfxLevel()]]) {
    const p = node.gain;
    try { p.cancelScheduledValues(now); } catch (e) { /* noop */ }
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(Math.max(0.0001, v), now + 0.05);
  }
}
function setTensionLevel(lv) {
  lv = clamp(Math.floor(Number(lv) || 0), 0, 5);
  if (lv === E.tension) return;
  const was = E.tension; E.tension = lv;
  if (!E.ac || !E.tensionG) return;
  const now = E.ac.currentTime, p = E.tensionG.gain;
  if (lv > 0 && was === 0) { try { p.cancelScheduledValues(now); } catch (e) { /* noop */ } p.setValueAtTime(Math.max(0.0001, p.value), now); p.linearRampToValueAtTime(1, now + 1.2); }
  else if (lv === 0) p.setTargetAtTime(0.0001, now, 0.25);
}
const vol01 = (v) => { v = Number(v); if (!Number.isFinite(v)) return null; return clamp(v > 1 ? v / 100 : v, 0, 1); };

function onGesture() { audio.unlock(); }

export const audio = {
  init: guard(function () {
    if (E.listening || !HAS_WIN || !window.addEventListener) return;
    E.listening = true;
    for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) window.addEventListener(ev, onGesture, { capture: true, passive: true });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', guard(() => {
        if (!E.ac) return;
        if (document.hidden) E.ac.suspend?.().catch?.(() => {}); else if (E.unlocked) E.ac.resume?.().catch?.(() => {});
      }));
    }
  }),

  unlock: guard(function () {
    if (!AC) return false;
    if (!E.ac) {
      E.ac = new AC();
      Object.assign(E, makeChain(E.ac));
      applyMaster(true);
      if (E.tension > 0) E.tensionG.gain.value = 1;
    }
    if (E.ac.state === 'suspended') E.ac.resume().catch(() => {});
    if (!E.unlocked) {
      E.unlocked = true;
      ensureTimer();
      if (E.wantTrack && !E.current) { const w = E.wantTrack; E.wantTrack = null; audio.playMusic(w); }
    }
    return true;
  }, false),

  sfx: guard(function (name, opts = {}) {
    const ac = E.ac;
    if (!ac || ac.state !== 'running' || E.muted) return false;
    const fn = SFX[name]; if (!fn) return false;
    const key = name === 'skill' ? 'skill_' + (opts.kind || 'melee') : name;
    const now = ac.currentTime;
    if (now - (E.lastT[key] ?? -9) < (CD[name] ?? 0.03)) return false;
    if (E.voices >= MAX_VOICES) return false;
    if ((E.voicesByName[key] || 0) >= (PER[name] || 2)) return false;
    E.lastT[key] = now;
    let dest = E.sfx;
    const vg = ac.createGain(); vg.gain.value = clamp(opts.vol ?? 1, 0, 2);
    let pan = null;
    if (opts.pan && ac.createStereoPanner) { pan = ac.createStereoPanner(); pan.pan.value = clamp(opts.pan, -1, 1) * 0.6; vg.connect(pan); pan.connect(dest); } else vg.connect(dest);
    E.voices++; E.voicesByName[key] = (E.voicesByName[key] || 0) + 1;
    const V = voice(ac, E, vg, () => { E.voices--; E.voicesByName[key]--; });
    extra(V, vg); if (pan) extra(V, pan);
    const o = Object.assign({}, opts, { p: (opts.pitch ?? 1) * (opts.rand === false ? 1 : 1 + (Math.random() - 0.5) * 0.08) });
    try { fn(V, now + 0.005, o); } catch (e) { if (!V.pending) { E.voices--; E.voicesByName[key]--; } throw e; }
    if (!V.pending) { try { vg.disconnect(); pan?.disconnect(); } catch (e) { /* noop */ } E.live -= V.nodes.length; E.voices--; E.voicesByName[key]--; }
    const dk = DUCK[name]; if (dk) duckMusic(dk[0], dk[1]);
    return true;
  }, false),

  playMusic: guard(function (trackId, opts = {}) {
    if (!trackId || !SONGS[trackId]) { audio.stopMusic(); return false; }
    if (!E.ac || !E.unlocked) { E.wantTrack = trackId; return false; }
    if (E.current && E.current.id === trackId && !E.current.stopping) return true;
    const fade = opts.fade ?? 1.4;
    if (E.current) fadeOutSong(E.current, fade);
    E.current = startSong(trackId, fade);
    E.wantTrack = null;
    return true;
  }, false),

  stopMusic: guard(function (fade = 1.0) {
    E.wantTrack = null;
    if (E.current) { fadeOutSong(E.current, fade); E.current = null; }
  }),

  setRadio: guard(function (i, silent) {
    const n = STATIONS.length;
    E.radio = ((Math.floor(Number(i) || 0) % n) + n) % n;
    const st = STATIONS[E.radio];
    if (E.inRadio) { audio.sfx('tune'); audio.playMusic(st.id, { fade: 0.35 }); }
    if (!silent) {
      E.game?.events?.emit?.('radioChanged', { name: st.name, index: E.radio });
      if (audio.notifyRadio && E.game?.notify) E.game.notify(`📻 ${st.name}`, '#ff6fd8');
    }
    return st.name;
  }),
  nextRadio: guard(function () { return audio.setRadio(E.radio + 1); }),

  toggleMute: guard(function () {
    E.muted = !E.muted;
    applyMaster();
    if (E.muted) { loopOff('siren'); loopOff('engine'); }
    persist();
    return E.muted;
  }, false),

  get muted() { return E.muted; },
  set muted(v) { if (!!v !== E.muted) audio.toggleMute(); },
  get volume() { return E.volume; },
  set volume(v) { E.volume = clamp(Number(v) || 0, 0, 1); applyMaster(); persist(); },
  get radioIndex() { return E.radio; },
  get radioName() { return STATIONS[E.radio].name; },
  get currentTrack() { return E.current ? E.current.id : (E.wantTrack || null); },
  get ready() { return !!(E.ac && E.ac.state === 'running'); },
  notifyRadio: true,           // ラジオ切替時に game.notify するか（HUD 側で表示するなら false に）
  stations: STATIONS.map((s) => s.name),
  tracks: Object.keys(SONGS),
  sfxNames: Object.keys(SFX),
  skillKinds: ['melee', 'projectile', 'aoe', 'buff', 'dash'],
  trackFor: (game) => { try { return trackFor(game); } catch (e) { return null; } },

  // --- v3: 設定連動（UI が呼ぶ）。0..1（1 より大きい値は 0..100 として扱う）。localStorage に保存。
  setVolumes: guard(function (o = {}) {
    const b = vol01(o.bgm), se = vol01(o.se ?? o.sfx), m = vol01(o.master ?? o.volume);
    if (b != null) E.bgm = b;
    if (se != null) E.se = se;
    if (m != null) { E.volume = m; applyMaster(); }
    if (o.muted != null && !!o.muted !== E.muted) { E.muted = !!o.muted; applyMaster(); if (E.muted) { loopOff('siren'); loopOff('engine'); } }
    applyBuses(); persist();
    return audio.getVolumes();
  }, null),
  getVolumes() { return { bgm: E.bgm, se: E.se, master: E.volume, muted: E.muted }; },
  get bgmVolume() { return E.bgm; },
  set bgmVolume(v) { audio.setVolumes({ bgm: v }); },
  get seVolume() { return E.se; },
  set seVolume(v) { audio.setVolumes({ se: v }); },
  // 手配度レイヤー（通常は update が game.wanted から自動設定。手動で上書きしたい時だけ）
  setTension: guard(function (lv) { E.tensionManual = lv == null ? null : clamp(Number(lv) || 0, 0, 5); setTensionLevel(E.tensionManual ?? 0); }),
  get tension() { return E.tension; },
  // タイトル画面の表示モード: 'title' | 'select'（キャラ選択/作成）| null（自動判定に戻す）
  setTitleScreen: guard(function (mode) { E.titleScreen = mode ? String(mode) : null; }),
  // スキル音だけ鳴らす（スキル窓のプレビュー用）。id は SKILLS のキー
  playSkill: guard(function (id, opts = {}) { return playSkillSfx(id, opts); }, false),
  jobFamilies: JOB_FAMILIES.slice(),
  skillFamily: (id) => { try { return skillFamily(id, E.skillDefs?.[id]); } catch (e) { return null; } },

  // ループ SE の手動制御（update が自動でやる）
  setLoop: guard(function (name, on, level = 1, param = 0) {
    if (!E.ac || E.ac.state !== 'running') return;
    if (on && !E.muted) loopOn(name, (name === 'siren' ? 0.05 : 0.09) * clamp(level, 0, 1), param); else loopOff(name);
  }),

  // 毎フレーム
  update: guard(function (game, dt) {
    if (!game) return;
    if (!E.game) E.game = game;
    const inp = game.input;
    if (inp?.pressed?.('mute')) {
      const m = audio.toggleMute();
      game.notify?.(m ? '🔇 サウンド OFF（N）' : '🔊 サウンド ON（N）', '#9ad');
      if (!m) audio.sfx('uiClick');
    }
    const p = game.player;
    const inCar = !!(p && p.inVehicle && game.scene !== 'title');
    if (inp?.pressed?.('radio')) {
      if (inCar) audio.nextRadio();
      else game.notify?.('📻 ラジオは乗車中のみ（R）', '#9ad');
    }
    E.inRadio = inCar;
    // 選曲
    const want = trackFor(game);
    if (want !== audio.currentTrack) {
      if (want) audio.playMusic(want, { fade: (want.startsWith('radio') || String(audio.currentTrack).startsWith('radio')) ? 0.5 : 1.4 });
      else audio.stopMusic(1.2);
    }
    if (!E.ac || E.ac.state !== 'running') { E.prev = snapshot(game); return; }

    // エンジン
    if (inCar && !E.muted) {
      const v = p.inVehicle; const sp = Math.abs(v.vx || v.speed || 0) / (v.maxSpeed || 900);
      audio.setLoop('engine', true, 1, sp);
    } else audio.setLoop('engine', false);
    // サイレン（町で手配中、警官がいる）
    let siren = 0;
    if (!E.muted && game.map?.town && (game.wanted || 0) > 0 && p && !p.dead) {
      let best = 1e9;
      for (const e of game.enemies || []) if (e && !e.dead && (e.def?.isCop || e.isCop || e.ai === 'cop')) { const dd = Math.abs(e.x - p.x); if (dd < best) best = dd; }
      for (const v of game.vehicles || []) if (v && v.driverType === 'cop') { const dd = Math.abs(v.x - p.x); if (dd < best) best = dd; }
      if (best < 1e9) siren = clamp(1.15 - best / 1600, 0.25, 1) * (0.7 + 0.06 * game.wanted);
    }
    audio.setLoop('siren', siren > 0, siren);
    // 手配度で緊迫する BGM（町のみ。手動指定があればそちら）
    const wl = (game.scene === 'play' || !game.scene) && game.map?.town && p && !p.dead ? (game.wanted || 0) : 0;
    setTensionLevel(E.tensionManual != null ? E.tensionManual : wl);

    // プレイヤー状態変化 → 攻撃 / ジャンプ SE
    const pr = E.prev;
    if (p && !p.dead && !inCar && pr.p === p) {
      const al = p.attackLeft || 0;
      const newAtk = al > (pr.attackLeft || 0) + 1e-4 || (p.attackKind && !pr.attackKind);
      if (newAtk && game.time - (E.lastSkillAt ?? -9) > 0.08) {
        const wt = p.stats?.weaponType;
        if (p.attackKind === 'shoot' || wt === 'gun') audio.sfx('shoot');
        else if (wt === 'magic') audio.sfx('zap');
        else audio.sfx('swing');
      }
      if (pr.onGround && !p.onGround && (p.vy || 0) < -150 && !p.climbing) audio.sfx('jump');
      else if (!pr.onGround && p.onGround && (pr.vy || 0) > 900) audio.sfx('land', { vol: 0.7 });
    }
    // ダメージ数字 → ヒット / クリティカル SE
    if (E.seenFx && Array.isArray(game.effects)) {
      const cx = (game.cam?.x || 0) + (game.W || 1280) / 2;
      for (const fx of game.effects) {
        if (!fx || E.seenFx.has(fx)) continue;
        if (fx.type === 'cutin') { E.seenFx.add(fx); audio.sfx('cutin'); continue; }
        if (fx.type !== 'dmg') continue;
        E.seenFx.add(fx);
        if (fx.toPlayer || fx.heal || (fx.t || 0) > 0.2) continue;
        const pan = clamp((fx.x - cx) / 700, -1, 1);
        if (fx.miss) audio.sfx('swing', { vol: 0.5, pitch: 0.7, pan });
        else audio.sfx(fx.crit ? 'crit' : 'hit', { pan });
      }
    }
    // UI 開閉 / クリック
    const nw = game.ui?.order?.length ?? 0;
    if (nw > (pr.nw ?? 0)) audio.sfx('uiOpen'); else if (nw < (pr.nw ?? 0)) audio.sfx('uiClose');
    else if (nw > 0 && inp?.mouse?.clicked) audio.sfx('uiClick');
    E.prev = snapshot(game);
  }),

  stats() {
    return { ready: !!E.ac, state: E.ac?.state || 'none', time: E.ac?.currentTime || 0, liveNodes: E.live, voices: E.voices, songs: E.songs.length, track: audio.currentTrack, loops: Object.keys(E.loops), muted: E.muted, tension: E.tension, rate: E.current ? Math.round(E.current.rate * 1000) / 1000 : 1, bgm: E.bgm, se: E.se };
  },

  // テスト用: OfflineAudioContext で曲/SE をレンダリング → {peak, rms, buffer}
  //   opts: { wanted: 0..5（曲に緊迫レイヤーを重ねる）, ...SE のオプション（kind/effect/hits/count/projKind/stage/star/grade） }
  async renderOffline(id, seconds = 4, sampleRate = 22050, opts = {}) {
    if (!OAC) return null;
    const ac = new OAC(2, Math.floor(sampleRate * seconds), sampleRate);
    const ch = makeChain(ac);
    const ctx = { live: 0, noise: ch.noise };
    if (SONGS[id]) {
      const song = build(id);
      const lv = clamp(opts.wanted || 0, 0, 5), sd = song.stepDur / tensionRate(lv);
      if (lv > 0) ch.tensionG.gain.value = 1;
      let tt = 0.02, step = 0;
      while (tt < seconds) {
        const sw = (step % 2 === 1) ? (song.d.swing || 0) * sd : 0;
        schedStep(ctx, ac, ch.music, song, step, tt + sw, sd);
        if (lv > 0) schedTension(ctx, ac, ch.tensionG, song, step, tt + sw, lv, sd);
        step++; tt += sd;
      }
    } else if (SFX[id] || id.startsWith('skill_')) {
      const V = voice(ac, ctx, ch.sfx);
      (SFX[id])(V, 0.02, Object.assign({ p: 1, kind: 'melee' }, opts));
    } else return null;
    const buf = await ac.startRendering();
    let peak = 0, sum = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
    }
    return { peak, rms: Math.sqrt(sum / Math.max(1, n)), seconds, sampleRate };
  },
};

function snapshot(game) {
  const p = game.player;
  return { p, attackLeft: p?.attackLeft || 0, attackKind: p?.attackKind || null, onGround: !!p?.onGround, vy: p?.vy || 0, nw: game.ui?.order?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// events 購読
function skillKind(id) {
  const k = E.skillKinds?.[id];
  if (k) return k;
  const s = String(id || '');
  if (/bomb|quake|explo|storm|nova/.test(s)) return 'aoe';
  if (/dash|step|rush/.test(s) && !/neon_rush/.test(s)) return 'dash';
  if (/aura|dignity|buff|guard/.test(s)) return 'buff';
  if (/bullet|shower|cannon|shot|beam|star/.test(s)) return 'projectile';
  return 'melee';
}

function playSkillSfx(id, extra = {}) {
  const def = E.skillDefs?.[id] || null;
  const kind = def?.kind || skillKind(id);
  if (kind === 'passive') return false;
  if (kind === 'move' || def?.move) {
    const t = def?.move?.type || extra.type;
    if (t && SFX['move_' + t]) return audio.sfx('move_' + t, extra);
    return audio.sfx('skill', { kind: 'dash' });
  }
  const fam = skillFamily(id, def);
  if (fam) {
    return audio.sfx('jskill_' + fam, Object.assign({ id: String(id || ''), kind, effect: def?.effect, hits: def?.hits, count: def?.proj?.count, projKind: def?.proj?.kind }, extra));
  }
  return audio.sfx('skill', Object.assign({ kind }, extra));
}
// コンボ段階: イベントに stage があればそれ、無ければヒット数から（10, 25, 50, 100, 150, 200, 300...）
const COMBO_STEPS = [10, 25, 50, 100, 150, 200, 300, 400, 500, 700, 1000];
function comboStage(n) { let s = 0; for (const c of COMBO_STEPS) if (n >= c) s++; return s; }

export function attachAudio(game) {
  audio.init();
  for (const off of E.offs) { try { off(); } catch (e) { /* noop */ } }
  E.offs = [];
  E.game = game;
  E.prev = {};
  const ev = game?.events;
  if (!ev?.on) return audio;
  try {
    import('../data/skills.js').then((m) => {
      const S = m.SKILLS || {}; E.skillKinds = {}; E.skillDefs = S;
      for (const k in S) E.skillKinds[k] = S[k].kind;
    }).catch(() => {});
  } catch (e) { /* noop */ }
  const on = (name, fn) => {
    const g = guard(fn);
    const off = ev.on(name, g);
    E.offs.push(typeof off === 'function' ? off : () => ev.off?.(name, g));
  };
  on('enemyKilled', (d) => {
    const e = d?.enemy;
    if (e && (e.boss || e.def?.boss)) audio.sfx('bossKill'); else audio.sfx('kill', { vol: 0.8 });
  });
  on('playerDamaged', (d) => audio.sfx('hurt', { vol: clamp(0.7 + (d?.amount || 0) / 400, 0.7, 1.2) }));
  on('levelUp', () => audio.sfx('levelUp'));
  on('itemPicked', () => audio.sfx('pickup'));
  on('moneyPicked', () => audio.sfx('coin'));
  on('rareDrop', () => audio.sfx('rare'));
  on('petDrop', () => audio.sfx('pet'));
  on('bookNew', () => audio.sfx('bookNew'));
  on('mapChanged', () => { audio.sfx('portal'); refresh(game); });
  on('missionAccepted', () => audio.sfx('questAccept'));
  on('missionComplete', () => audio.sfx('questDone'));
  on('playerDied', () => { audio.sfx('death'); audio.setLoop('siren', false); audio.setLoop('engine', false); audio.stopMusic(1.5); });
  on('skillUsed', (d) => { E.lastSkillAt = game.time || 0; playSkillSfx(d?.id); });
  on('vehicleEnter', () => {
    audio.sfx('door'); audio.sfx('engine', { vol: 0.8 });
    E.inRadio = true;
    audio.setRadio(E.radio);    // radioChanged を emit（HUD 表示用）
    refresh(game);
  });
  on('vehicleExit', () => { audio.sfx('door'); E.inRadio = false; audio.setLoop('engine', false); refresh(game); });
  on('wantedChanged', (d) => {
    const lv = d?.level || 0;
    if (lv > (E.lastWanted || 0)) audio.sfx('wantedUp');
    E.lastWanted = lv;
    if (lv <= 0) audio.setLoop('siren', false);
  });
  on('equipChanged', () => audio.sfx('equip'));
  // --- v3（名前は src/systems/* の emit に合わせる。未実装のものは SPEC_V3 の名前＋別名で購読）
  on('jobAdvanced', () => audio.sfx('jobUp'));
  on('jobAvailable', () => audio.sfx('jobAvailable'));
  const tune = (d) => {
    const ok = d?.success ?? d?.ok ?? d?.result?.success;
    audio.sfx(ok ? 'tuneSuccess' : 'tuneFail', { star: d?.star ?? d?.result?.star ?? 0 });
  };
  on('tuneResult', tune); on('itemTuned', tune);
  const pot = (d) => {
    const up = d?.gradeUp ?? d?.result?.gradeUp;
    if (up) audio.sfx('gradeUp', { grade: gradeNum(d?.after?.grade ?? d?.grade ?? d?.result?.after?.grade) });
    else audio.sfx('chip');
  };
  on('potentialResult', pot); on('chipUsed', pot);   // potential.js は chipUsed {gradeUp, grade, before, after}（potentialGradeUp は重複するので購読しない）
  on('chipApplied', () => audio.sfx('equip'));
  const ach = () => audio.sfx('achievement');
  on('achievementUnlocked', ach); on('achievement', ach);
  const tower = () => audio.sfx('towerClear');
  on('towerFloorClear', tower); on('towerClear', tower);
  const combo = (d) => {
    const n = Number(d?.count ?? d?.combo ?? d?.hits ?? 0) || 0;
    const st = d?.stage ?? d?.level ?? null;
    if (st != null) { audio.sfx('combo', { stage: st, rand: false }); E.combo = n; return; }
    const was = comboStage(E.combo); E.combo = n;
    const now = comboStage(n);
    if (now > was) audio.sfx('combo', { stage: now, rand: false });
  };
  on('comboUp', combo);
  on('comboEnd', () => { E.combo = 0; }); on('comboReset', () => { E.combo = 0; });
  on('moveSkill', (d) => { const t = d?.type || d?.move?.type; if (t && SFX['move_' + t]) audio.sfx('move_' + t); });
  on('cutin', () => audio.sfx('cutin'));
  const login = () => audio.sfx('loginBonus');
  on('loginBonus', login); on('loginBonusClaimed', login);
  on('arenaWave', () => audio.sfx('arenaWave'));
  const bw = () => audio.sfx('bossWarn');
  on('bossEntered', bw); on('bossAppear', bw);
  on('menuOpened', () => audio.sfx('menuOpen'));
  on('presetSwitched', () => audio.sfx('presetSwap'));
  on('returnedToTitle', () => { setTensionLevel(0); audio.setLoop('siren', false); audio.setLoop('engine', false); refresh(game); });
  return audio;
}
const GRADE_N = { rare: 1, epic: 2, unique: 3, legendary: 3, legend: 3, mythic: 4 };
function gradeNum(g) { if (typeof g === 'number') return g; return GRADE_N[String(g || '').toLowerCase()] ?? 1; }
function refresh(game) {
  const want = trackFor(game);
  if (want) audio.playMusic(want, { fade: want.startsWith('radio') ? 0.5 : 1.4 }); else audio.stopMusic(1.2);
}

export default audio;
