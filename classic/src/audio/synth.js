// サンプルを使わない小さなゲーム音源。AudioContext でも OfflineAudioContext でも動く。
// 楽器: piano / strings / brass / flute / bell / musicbox / accordion / guitar / bass / pad / harp / marimba /
//       clarinet / spicc（短いストリングス）/ pizz（ピチカート）/ choir（合唱風）
// 太鼓: kick / snare / block / rim / hat / shaker / tamb / tri / crash / tom / tomlo / timp / taiko / drip / tick / clap
// どの楽器も note(S, dest, t, midi, dur, vel) の形。S = makeEngine() が返す、その ctx 用の入れ物。

import { midiToFreq } from './score.js';

// ---------------------------------------------------------------- ctx ごとの入れ物
const ENGINES = new WeakMap();
export function engineFor(ctx) {
  let S = ENGINES.get(ctx);
  if (!S) { S = { ctx, waves: new Map(), ks: new Map(), noise: null, ir: null }; ENGINES.set(ctx, S); }
  return S;
}

function noiseBuf(S) {
  if (S.noise) return S.noise;
  const { ctx } = S;
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let a = 987654321;
  for (let i = 0; i < len; i++) { a = (Math.imul(a, 1664525) + 1013904223) | 0; d[i] = (a >>> 0) / 2147483648 - 1; }
  S.noise = b;
  return b;
}

// 倍音の強さの並び → PeriodicWave（使い回す）
function wave(S, key, amps) {
  let w = S.waves.get(key);
  if (!w) {
    const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => { imag[i + 1] = a; });
    w = S.ctx.createPeriodicWave(real, imag);
    S.waves.set(key, w);
  }
  return w;
}
const PULSE = (duty, n) => Array.from({ length: n }, (_, i) => Math.sin(Math.PI * (i + 1) * duty) / (i + 1));

// 軽いリバーブ（作った残響を ConvolverNode で）
export function makeReverb(S, seconds = 1.8, decay = 3.2) {
  const { ctx } = S;
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let a = 1234567 + ch * 7654321, lp = 0;
    const pre = Math.floor(sr * 0.012);
    for (let i = pre; i < len; i++) {
      a = (Math.imul(a, 1103515245) + 12345) | 0;
      const n = (a >>> 0) / 2147483648 - 1;
      const x = (i - pre) / (len - pre);
      const k = 0.55 + 0.4 * x; // 後ろほど暗く
      lp = lp * k + n * (1 - k);
      d[i] = lp * Math.pow(1 - x, decay) * (i < pre + sr * 0.03 ? 1.6 : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

// ---------------------------------------------------------------- 部品
function osc(S, type, f, t, end, detune = 0) {
  const o = S.ctx.createOscillator();
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.start(t); o.stop(end);
  return o;
}
function gain(S, v = 0) { const g = S.ctx.createGain(); g.gain.value = v; return g; }
function filt(S, type, f, q = 0.7) { const b = S.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
// 終わったらつなぎを外す
function cleanup(src, nodes) { src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* 何もしない */ } } }; }
// アタック→ディケイ→サステイン→リリース
function adsr(p, t, dur, peak, a, d, s, r) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, Math.max(0.001, d / 3));
  const off = t + Math.max(dur, a + 0.005);
  p.cancelAndHoldAtTime ? p.cancelAndHoldAtTime(off) : p.setValueAtTime(peak * s, off);
  p.setTargetAtTime(0, off, Math.max(0.001, r / 4));
  return off + r * 1.2;
}
function vibrato(S, o, f, t, end, depth, rate, delay) {
  const l = osc(S, 'sine', rate, t, end);
  const g = gain(S, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0, t + delay);
  g.gain.linearRampToValueAtTime(f * depth, t + delay + 0.35);
  l.connect(g);
  for (const x of [].concat(o)) g.connect(x.frequency);
  return { l, g };
}

// Karplus-Strong（はじく弦）を JS で 1 度だけ作って使い回す
function ksBuffer(S, midi, bright = 0.5, decay = 0.996, seconds = 2.6) {
  const key = `${midi}|${bright}|${decay}`;
  let b = S.ks.get(key);
  if (b) return b;
  const sr = S.ctx.sampleRate;
  const f = midiToFreq(midi);
  const N = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * seconds);
  b = S.ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const line = new Float32Array(N);
  let a = 24680 + midi * 97, lp = 0;
  for (let i = 0; i < N; i++) { a = (Math.imul(a, 1103515245) + 12345) | 0; const n = (a >>> 0) / 2147483648 - 1; lp = lp + (n - lp) * bright; line[i] = lp; }
  { let mean = 0; for (let i = 0; i < N; i++) mean += line[i]; mean /= N; for (let i = 0; i < N; i++) line[i] -= mean; } // 直流を消す
  // 低い音ほど長く、高い音ほど早く減る
  const dk = Math.pow(decay, 440 / Math.max(80, f) * 0.5 + 0.5);
  let idx = 0, prev = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    const next = line[(idx + 1) % N];
    const y = dk * (0.5 * (cur + next));
    line[idx] = y;
    d[i] = cur * 0.7 + prev * 0.3; prev = cur;
    peak = Math.max(peak, Math.abs(d[i]));
    idx = (idx + 1) % N;
  }
  if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  b.rate = f * N / sr; // 整数の長さとのずれを再生速度で直す
  S.ks.set(key, b);
  return b;
}

// ---------------------------------------------------------------- 楽器
export const INSTRUMENTS = {
  flute(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 0.4;
    const o = osc(S, wave(S, 'flute', [1, 0.32, 0.12, 0.05, 0.025, 0.01]), f, t, end);
    o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); // 吹き始めの音の揺れ
    const vib = vibrato(S, o, f, t, end, 0.0055, 5.1, Math.min(0.28, dur * 0.5));
    const g = gain(S);
    adsr(g.gain, t, dur, 0.34 * v, 0.045, 0.2, 0.82, 0.12);
    const lp = filt(S, 'lowpass', Math.min(9000, f * 6), 0.5);
    // 息の音
    const n = S.ctx.createBufferSource(); n.buffer = noiseBuf(S); n.loop = true;
    const bp = filt(S, 'bandpass', Math.min(9000, f * 2.2), 1.2);
    const ng = gain(S);
    adsr(ng.gain, t, dur, 0.05 * v, 0.03, 0.12, 0.25, 0.1);
    n.start(t, (m * 0.137) % 1.5); n.stop(end);
    o.connect(lp); lp.connect(g); g.connect(dest);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    cleanup(o, [o, lp, g, vib.l, vib.g]); cleanup(n, [n, bp, ng]);
  },

  piano(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const ring = Math.min(dur, 3.5);
    const end = t + ring + 0.5;
    const w = wave(S, 'piano', [1, 0.55, 0.32, 0.22, 0.12, 0.09, 0.05, 0.035, 0.02, 0.012]);
    const o1 = osc(S, w, f, t, end, -2.5), o2 = osc(S, w, f, t, end, 2.5);
    const lp = filt(S, 'lowpass', Math.min(12000, f * 9), 0.6);
    lp.frequency.setValueAtTime(Math.min(12000, f * 9), t);
    lp.frequency.setTargetAtTime(Math.min(8000, f * 2.5), t + 0.01, 0.5);
    const g = gain(S);
    const dec = 1.6 * Math.pow(261 / f, 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * v, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, dec);
    g.gain.cancelAndHoldAtTime?.(t + ring);
    g.gain.setTargetAtTime(0, t + ring, 0.08);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest);
    cleanup(o1, [o1, o2, lp, g]);
  },

  strings(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 0.8;
    const os = [-9, 0, 8].map((dt) => osc(S, 'sawtooth', f, t, end, dt));
    const vib = vibrato(S, os, f, t, end, 0.004, 5.4, 0.3);
    const lp = filt(S, 'lowpass', Math.min(6000, 1400 + f * 2.2), 0.6);
    const g = gain(S);
    adsr(g.gain, t, dur, 0.09 * v, 0.22, 0.3, 0.9, 0.45);
    os.forEach((o) => o.connect(lp)); lp.connect(g); g.connect(dest);
    cleanup(os[0], [...os, lp, g, vib.l, vib.g]);
  },

  pad(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 1.2;
    const os = [osc(S, 'sawtooth', f, t, end, -6), osc(S, 'sawtooth', f, t, end, 6), osc(S, 'triangle', f / 2, t, end)];
    const lp = filt(S, 'lowpass', 1100, 0.4);
    const g = gain(S);
    adsr(g.gain, t, dur, 0.08 * v, 0.6, 0.5, 0.85, 0.9);
    os.forEach((o) => o.connect(lp)); lp.connect(g); g.connect(dest);
    cleanup(os[0], [...os, lp, g]);
  },

  brass(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 0.3;
    const os = [osc(S, 'sawtooth', f, t, end, -4), osc(S, 'sawtooth', f, t, end, 4)];
    const lp = filt(S, 'lowpass', f * 1.2, 1.2);
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 7), t + 0.05);
    lp.frequency.setTargetAtTime(Math.min(7000, f * 4), t + 0.06, 0.15);
    const g = gain(S);
    adsr(g.gain, t, dur, 0.16 * v, 0.03, 0.15, 0.8, 0.12);
    os.forEach((o) => o.connect(lp)); lp.connect(g); g.connect(dest);
    cleanup(os[0], [...os, lp, g]);
  },

  // グロッケン風のベル（倍音が整数倍でない）
  bell(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const parts = [[1, 1, 1.6], [2.76, 0.32, 0.6], [5.4, 0.14, 0.3], [8.93, 0.06, 0.15]];
    const all = [];
    for (const [r, a, d] of parts) {
      if (f * r > 18000) continue;
      const o = osc(S, 'sine', f * r, t, t + d * 4 + 0.1);
      const g = gain(S);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22 * v * a, t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.002, d);
      o.connect(g); g.connect(dest);
      all.push(o, g);
    }
    cleanup(all[0], all);
  },

  // オルゴール（ベルより柔らかい）
  musicbox(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const all = [];
    for (const [r, a, d] of [[1, 1, 0.9], [4.0, 0.18, 0.25], [6.9, 0.05, 0.1]]) {
      const o = osc(S, 'sine', f * r, t, t + d * 5);
      const g = gain(S);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2 * v * a, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, d);
      o.connect(g); g.connect(dest); all.push(o, g);
    }
    cleanup(all[0], all);
  },

  accordion(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 0.25;
    const w = wave(S, 'reed', PULSE(0.3, 14));
    const o1 = osc(S, w, f, t, end, 0), o2 = osc(S, w, f, t, end, 11); // 2 枚のリードを少しずらす（ミュゼット）
    const lp = filt(S, 'lowpass', Math.min(7000, f * 7), 0.7);
    const hp = filt(S, 'highpass', 180, 0.5);
    const g = gain(S);
    adsr(g.gain, t, dur, 0.22 * v, 0.03, 0.1, 0.85, 0.07);
    o1.connect(lp); o2.connect(lp); lp.connect(hp); hp.connect(g); g.connect(dest);
    cleanup(o1, [o1, o2, lp, hp, g]);
  },

  // ナイロン弦のギター（はじく弦）
  guitar(S, dest, t, m, dur, v) {
    const b = ksBuffer(S, m, 0.45, 0.996, 2.6);
    const src = S.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = b.rate;
    const lp = filt(S, 'lowpass', 4200, 0.5);
    const g = gain(S);
    const ring = Math.min(dur, 2.4);
    g.gain.setValueAtTime(0.55 * v, t);
    g.gain.setValueAtTime(0.55 * v, t + ring);
    g.gain.setTargetAtTime(0, t + ring, 0.05);
    src.connect(lp); lp.connect(g); g.connect(dest);
    src.start(t); src.stop(t + ring + 0.3);
    cleanup(src, [src, lp, g]);
  },

  harp(S, dest, t, m, dur, v) {
    const b = ksBuffer(S, m, 0.3, 0.998, 3.0);
    const src = S.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = b.rate;
    const g = gain(S, 0.28 * v);
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + Math.min(3, dur + 2));
    cleanup(src, [src, g]);
  },

  marimba(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const all = [];
    for (const [r, a, d] of [[1, 1, 0.28], [4, 0.25, 0.06], [10, 0.05, 0.02]]) {
      const o = osc(S, 'sine', f * r, t, t + d * 6 + 0.05);
      const g = gain(S);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * v * a, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, d);
      o.connect(g); g.connect(dest); all.push(o, g);
    }
    cleanup(all[0], all);
  },

  // クラリネット風（奇数の倍音が強い、少しおどけた木管）
  clarinet(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 0.3;
    const o = osc(S, wave(S, 'clarinet', [1, 0.04, 0.42, 0.03, 0.22, 0.02, 0.1, 0.01, 0.05]), f, t, end);
    const vib = vibrato(S, o, f, t, end, 0.004, 4.6, Math.min(0.3, dur * 0.6));
    const lp = filt(S, 'lowpass', Math.min(5000, f * 5), 0.6);
    const g = gain(S);
    adsr(g.gain, t, dur, 0.3 * v, 0.03, 0.15, 0.85, 0.08);
    o.connect(lp); lp.connect(g); g.connect(dest);
    cleanup(o, [o, lp, g, vib.l, vib.g]);
  },

  // 短く弾くストリングス（スピッカート。ボス戦の刻み用）
  spicc(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const len = Math.min(dur, 0.22);
    const end = t + len + 0.25;
    const os = [-7, 7].map((dt) => osc(S, 'sawtooth', f, t, end, dt));
    const lp = filt(S, 'lowpass', Math.min(5000, 900 + f * 3), 0.7);
    const g = gain(S);
    adsr(g.gain, t, len, 0.13 * v, 0.008, 0.08, 0.55, 0.1);
    os.forEach((o) => o.connect(lp)); lp.connect(g); g.connect(dest);
    cleanup(os[0], [...os, lp, g]);
  },

  // ピチカート（はじくストリングス）
  pizz(S, dest, t, m, dur, v) {
    const b = ksBuffer(S, m, 0.35, 0.99, 1.2);
    const src = S.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = b.rate;
    const lp = filt(S, 'lowpass', 2600, 0.5);
    const g = gain(S);
    g.gain.setValueAtTime(0.42 * v, t);
    g.gain.setTargetAtTime(0, t + 0.02, 0.14);
    src.connect(lp); lp.connect(g); g.connect(dest);
    src.start(t); src.stop(t + 0.8);
    cleanup(src, [src, lp, g]);
  },

  // 合唱風（「あー」の母音のパッド）
  choir(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 1.0;
    const os = [-8, 0, 7].map((dt) => osc(S, 'sawtooth', f, t, end, dt));
    const vib = vibrato(S, os, f, t, end, 0.005, 5.0, 0.4);
    const mix = gain(S, 1);
    os.forEach((o) => o.connect(mix));
    const g = gain(S);
    adsr(g.gain, t, dur, 0.1 * v, 0.35, 0.4, 0.9, 0.7);
    const all = [...os, mix, g, vib.l, vib.g];
    for (const [ff, q, a] of [[750, 6, 1], [1150, 7, 0.55], [2600, 9, 0.25]]) {
      const bp = filt(S, 'bandpass', ff, q);
      const ga = gain(S, a * 2.2);
      mix.connect(bp); bp.connect(ga); ga.connect(g);
      all.push(bp, ga);
    }
    g.connect(dest);
    cleanup(os[0], all);
  },

  // 指弾きのベース
  bass(S, dest, t, m, dur, v) {
    const f = midiToFreq(m);
    const end = t + dur + 0.2;
    const o = osc(S, wave(S, 'bass', [1, 0.5, 0.22, 0.1, 0.05, 0.02]), f, t, end);
    const lp = filt(S, 'lowpass', f * 6, 0.9);
    lp.frequency.setValueAtTime(f * 7, t);
    lp.frequency.setTargetAtTime(f * 2.5, t + 0.01, 0.12);
    const g = gain(S);
    adsr(g.gain, t, dur * 0.95, 0.5 * v, 0.006, 0.35, 0.55, 0.06);
    o.connect(lp); lp.connect(g); g.connect(dest);
    cleanup(o, [o, lp, g]);
  },
};

// ---------------------------------------------------------------- 太鼓
function noiseHit(S, dest, t, { dur, vol, type = 'bandpass', f = 3000, f1, q = 0.8, a = 0.001, off = 0 }) {
  const n = S.ctx.createBufferSource(); n.buffer = noiseBuf(S); n.loop = true;
  const fl = filt(S, type, f, q);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = gain(S);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setTargetAtTime(0, t + a, dur / 4);
  n.connect(fl); fl.connect(g); g.connect(dest);
  n.start(t, off); n.stop(t + dur * 1.5 + 0.02);
  cleanup(n, [n, fl, g]);
}
function toneHit(S, dest, t, { f, f1, dur, vol, type = 'sine' }) {
  const o = osc(S, type, f, t, t + dur * 1.5 + 0.02);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  const g = gain(S);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, dur / 4);
  o.connect(g); g.connect(dest);
  cleanup(o, [o, g]);
}
export const DRUMS = {
  kick(S, d, t, v) { toneHit(S, d, t, { f: 130, f1: 46, dur: 0.32, vol: 0.85 * v }); noiseHit(S, d, t, { dur: 0.012, vol: 0.12 * v, type: 'lowpass', f: 3000 }); },
  snare(S, d, t, v) { noiseHit(S, d, t, { dur: 0.17, vol: 0.32 * v, type: 'highpass', f: 1600, q: 0.6, off: 0.3 }); toneHit(S, d, t, { f: 210, f1: 160, dur: 0.07, vol: 0.25 * v, type: 'triangle' }); },
  block(S, d, t, v) { toneHit(S, d, t, { f: 1250, f1: 1150, dur: 0.06, vol: 0.2 * v }); toneHit(S, d, t, { f: 2900, dur: 0.02, vol: 0.05 * v }); },
  rim(S, d, t, v) { toneHit(S, d, t, { f: 1700, dur: 0.03, vol: 0.09 * v, type: 'square' }); },
  hat(S, d, t, v) { noiseHit(S, d, t, { dur: 0.04, vol: 0.14 * v, type: 'highpass', f: 8000, q: 0.5, off: 0.1 }); },
  shaker(S, d, t, v) { noiseHit(S, d, t, { dur: 0.07, vol: 0.09 * v, type: 'bandpass', f: 6800, q: 1.1, a: 0.014, off: 0.4 }); },
  tamb(S, d, t, v) {
    noiseHit(S, d, t, { dur: 0.16, vol: 0.12 * v, type: 'bandpass', f: 9000, q: 1.5, off: 0.6 });
    for (let i = 0; i < 3; i++) noiseHit(S, d, t + 0.012 * i, { dur: 0.05, vol: 0.06 * v, type: 'highpass', f: 7000, off: 0.7 + i * 0.1 });
  },
  tri(S, d, t, v) { for (const [f, a] of [[3150, 1], [5120, 0.5], [7300, 0.25]]) toneHit(S, d, t, { f, dur: 1.4, vol: 0.05 * v * a }); },
  crash(S, d, t, v) { noiseHit(S, d, t, { dur: 1.6, vol: 0.13 * v, type: 'highpass', f: 4500, q: 0.4, off: 0.9 }); },
  tom(S, d, t, v) { toneHit(S, d, t, { f: 190, f1: 110, dur: 0.28, vol: 0.45 * v }); },
  tomlo(S, d, t, v) { toneHit(S, d, t, { f: 120, f1: 75, dur: 0.4, vol: 0.5 * v }); },
  // ティンパニ風（低く長い、少し皮の音）
  timp(S, d, t, v) {
    toneHit(S, d, t, { f: 98, f1: 86, dur: 1.1, vol: 0.55 * v });
    toneHit(S, d, t, { f: 98 * 1.5, f1: 86 * 1.5, dur: 0.5, vol: 0.18 * v });
    noiseHit(S, d, t, { dur: 0.05, vol: 0.08 * v, type: 'lowpass', f: 900, off: 0.2 });
  },
  // 大太鼓（重い、遠くで響く）
  taiko(S, d, t, v) {
    toneHit(S, d, t, { f: 80, f1: 48, dur: 0.6, vol: 0.9 * v });
    noiseHit(S, d, t, { dur: 0.08, vol: 0.14 * v, type: 'lowpass', f: 600, off: 0.5 });
  },
  // 水の滴る音（上がる短いサイン）
  drip(S, d, t, v) { toneHit(S, d, t, { f: 900, f1: 2100, dur: 0.07, vol: 0.12 * v }); toneHit(S, d, t + 0.09, { f: 1500, f1: 2600, dur: 0.04, vol: 0.03 * v }); },
  // 時計のカチ
  tick(S, d, t, v) { toneHit(S, d, t, { f: 3800, dur: 0.012, vol: 0.08 * v, type: 'square' }); },
  clap(S, d, t, v) { for (let i = 0; i < 3; i++) noiseHit(S, d, t + i * 0.011, { dur: i === 2 ? 0.12 : 0.02, vol: 0.18 * v, type: 'bandpass', f: 1400, q: 1.2, off: 0.2 + i * 0.13 }); },
};

// 効果音を作るときに使う部品（sfx.js から使う）
export const PARTS = { noiseHit, toneHit, noiseBuf };

// 1 つの音を鳴らす（楽器か太鼓か）
export function playNote(S, dest, ev, t) {
  if (ev.midi == null) { const fn = DRUMS[ev.inst]; if (fn) fn(S, dest, t, ev.vel); return; }
  const fn = INSTRUMENTS[ev.inst];
  if (fn) fn(S, dest, t, ev.midi, ev.d, ev.vel);
}
