// 音を数字で作る小さな道具（WebAudio を使わないので Node のテストでも動く）。
// すべてモノラルの Float32Array に「足し込む」形。効果音と楽器の音はここで一度だけ作り、
// AudioBuffer にして使い回す（鳴らすたびに計算しないので軽い）。
//
// 使い方:
//   const s = new Snd(44100, 0.4, seed);
//   s.osc({ dur: 0.2, f: (t) => 160 * Math.exp(-t * 18) + 50, env: perc(0.001, 0.05) });
//   const n = s.layer(); n.noise({ dur: 0.1, env: perc(0.001, 0.03) }); n.filter({ type: 'bp', f: 1800, q: 1.2 }); s.add(n, 0, 0.6);
//   const data = s.done(0.9);   // 端を整え、音量をそろえた Float32Array

export const TAU = Math.PI * 2;
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** シード付き乱数（mulberry32）。同じシードなら同じ音になる */
export class Rand {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a = 0, b = 0x7fffffff) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

/** 文字列 → 32bit の数（シード用） */
export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- 包絡線（時間 t 秒 → 0〜1）
/** 立ち上がり a 秒 → 指数で減衰（時定数 d 秒） */
export const perc = (a, d) => (t) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** ADSR。rel は放す時刻（秒） */
export const adsr = (a, d, s, r, rel) => (t) => {
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  if (t > rel) v *= Math.max(0, 1 - (t - rel) / r);
  return v;
};
/** 折れ線 [[t, v], ...] */
export const lin = (pts) => (t) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) { const [t0, v0] = pts[i - 1]; return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-9, t1 - t0)); }
  }
  return pts[pts.length - 1][1];
};
/** ふくらんでしぼむ（息・風・吸い込み） */
export const swell = (a, hold, r) => (t) => (t < a ? (t / a) ** 2 : t < a + hold ? 1 : Math.max(0, 1 - (t - a - hold) / r) ** 2);
/** 上下に指数カーブ（f0 → f1 を dur 秒で） */
export const sweep = (f0, f1, dur, curve = 1) => (t) => f0 * (f1 / f0) ** Math.min(1, (t / dur) ** curve);

// ---------------------------------------------------------------- 発振（帯域制限つき）
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// 正弦の表（Math.sin より速い。線形補間つき）
const SN = 4096;
const SIN = new Float32Array(SN + 1);
for (let i = 0; i <= SN; i++) SIN[i] = Math.sin((TAU * i) / SN);
/** ph は「周」（0〜1 の外でもよい） */
export function sinC(ph) {
  ph -= Math.floor(ph);
  const x = ph * SN; const i = x | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}

// 時間で変わる値（音の高さ・包絡線など）は 16 サンプルごとに計算して間を直線でつなぐ（軽くするため）
const CR = 16;
function ctl(fn, n, sr, mul = null) {
  const m = (n >> 4) + 2;
  const a = new Float32Array(m);
  for (let k = 0; k < m; k++) { const t = (k * CR) / sr; a[k] = (typeof fn === 'function' ? fn(t) : fn) * (mul ? mul(t) : 1); }
  return a;
}
const at = (a, i) => { const k = i >> 4; const v = a[k]; return v + (a[k + 1] - v) * (i & 15) * 0.0625; };

/**
 * 発振器を足し込む。
 * o: { t0=0, dur, f: Hz | (t)=>Hz, type: 'sine'|'tri'|'saw'|'square'|'pulse', amp=1, env=(t)=>1, pw=0.5, phase=0, vib: {rate, depth(半音)} }
 */
export function osc(out, sr, o) {
  const i0 = Math.max(0, Math.floor((o.t0 || 0) * sr));
  const n = Math.min(out.length - i0, Math.ceil(o.dur * sr));
  if (n <= 0) return;
  const vr = o.vib?.rate || 0; const vd = o.vib?.depth || 0;
  const fa = (typeof o.f === 'function' || vd) ? ctl(o.f, n, sr, vd ? (t) => 2 ** ((vd * Math.sin(TAU * vr * t)) / 12) : null) : null;
  const fc = o.f;
  const amp = o.amp ?? 1;
  const ea = o.env ? ctl(o.env, n, sr) : null;
  const type = o.type || 'sine';
  const pw = o.pw ?? 0.5;
  const inv = 1 / sr;
  let ph = o.phase || 0;
  for (let i = 0; i < n; i++) {
    const f = fa ? at(fa, i) : fc;
    const dt = f * inv;
    let v;
    if (type === 'sine') { const x = ph * SN; const j = x | 0; v = SIN[j] + (SIN[j + 1] - SIN[j]) * (x - j); }
    else if (type === 'tri') v = 1 - 4 * Math.abs(ph - 0.5);
    else if (type === 'saw') v = 2 * ph - 1 - polyblep(ph, dt);
    else { // square / pulse
      v = ph < pw ? 1 : -1;
      v += polyblep(ph, dt);
      let p2 = ph + 1 - pw; if (p2 >= 1) p2 -= 1;
      v -= polyblep(p2, dt);
    }
    out[i0 + i] += v * amp * (ea ? at(ea, i) : 1);
    ph += dt;
    if (ph >= 1) ph -= Math.floor(ph);
  }
}

/**
 * FM（鐘・金属・電子ピアノ）。o: { t0, dur, f, ratio=1, index: 数 | (t)=>数, amp, env, fb=0 }
 * 出力 = sin(2π fc t + I(t)·sin(2π fm t))
 */
export function fm(out, sr, o) {
  const i0 = Math.max(0, Math.floor((o.t0 || 0) * sr));
  const n = Math.min(out.length - i0, Math.ceil(o.dur * sr));
  if (n <= 0) return;
  const fa = typeof o.f === 'function' ? ctl(o.f, n, sr) : null;
  const ratio = o.ratio ?? 1;
  // 折り返し（エイリアス）を防ぐ: 側波帯の広がり fc + (I+1)·fm がナイキストの手前に収まるよう I を抑える（カーソンの法則）
  const lim = 0.45 * sr;
  const capOf = (f) => Math.max(0, (lim - f) / Math.max(1, f * ratio) - 1);
  const ia = typeof o.index === 'function' || fa ? ctl((t) => Math.min(typeof o.index === 'function' ? o.index(t) : (o.index ?? 1), capOf(fa ? (typeof o.f === 'function' ? o.f(t) : o.f) : o.f)), n, sr) : null;
  const ic = Math.min(o.index ?? 1, capOf(o.f)) / TAU;
  const amp = o.amp ?? 1;
  const ea = o.env ? ctl(o.env, n, sr) : null;
  const fb = (o.fb || 0) / TAU;
  const inv = 1 / sr;
  let pc = 0; let pm = 0; let last = 0;
  for (let i = 0; i < n; i++) {
    const f = fa ? at(fa, i) : o.f;
    const m = sinC(pm + fb * last);
    last = m;
    const v = sinC(pc + (ia ? at(ia, i) / TAU : ic) * m);
    out[i0 + i] += v * amp * (ea ? at(ea, i) : 1);
    pc += f * inv; pm += f * ratio * inv;
    if (pc >= 1) pc -= Math.floor(pc);
    if (pm >= 1) pm -= Math.floor(pm);
  }
}

/** 雑音。o: { t0, dur, amp, env, color: 'white'|'pink'|'brown', seed } */
export function noise(out, sr, o, rng = new Rand(o.seed || 7)) {
  const i0 = Math.max(0, Math.floor((o.t0 || 0) * sr));
  const n = Math.min(out.length - i0, Math.ceil(o.dur * sr));
  if (n <= 0) return;
  const amp = o.amp ?? 1;
  const ea = o.env ? ctl(o.env, n, sr) : null;
  const color = o.color || 'white';
  let b0 = 0; let b1 = 0; let b2 = 0; let br = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    let v = w;
    if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; v = (b0 + b1 + b2 + w * 0.1848) * 0.25; }
    else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; v = br * 3.5; }
    out[i0 + i] += v * amp * (ea ? at(ea, i) : 1);
  }
}

/** 粒（ぱちぱち・きらきら）: 短いクリックや音を不規則に置く。o: { t0, dur, rate(1秒あたり), amp, f:[lo,hi] Hz, len, env } */
export function grains(out, sr, o, rng) {
  const t0 = o.t0 || 0;
  const count = Math.max(1, Math.round(o.rate * o.dur));
  for (let k = 0; k < count; k++) {
    const t = t0 + rng.next() * o.dur;
    const g = o.env ? o.env(t - t0) : 1;
    if (g <= 0.001) continue;
    const f = o.f ? rng.range(o.f[0], o.f[1]) : 0;
    const len = o.len || 0.02;
    if (f > 0) osc(out, sr, { t0: t, dur: len * 3, f, amp: (o.amp ?? 0.3) * g * rng.range(0.4, 1), env: perc(0.0005, len), type: o.type || 'sine' });
    else {
      const i = Math.floor(t * sr);
      const a = (o.amp ?? 0.3) * g * rng.range(0.3, 1) * (rng.next() < 0.5 ? -1 : 1);
      const L = Math.max(2, Math.floor(len * sr));
      for (let j = 0; j < L && i + j < out.length; j++) out[i + j] += a * Math.exp(-j / (L * 0.25)) * (rng.next() * 2 - 1);
    }
  }
}

/**
 * 弦をはじく音（Karplus-Strong）。o: { t0, f, dur, amp, decay=0.996, bright=0.5, seed }
 * bright: 0 = こもった（竪琴）、1 = 明るい（金属弦）
 */
export function pluck(out, sr, o, rng = new Rand(o.seed || 3)) {
  const i0 = Math.max(0, Math.floor((o.t0 || 0) * sr));
  const n = Math.min(out.length - i0, Math.ceil(o.dur * sr));
  if (n <= 0) return;
  const bright = clamp(o.bright ?? 0.5, 0, 1);
  const s = 0.5 - 0.38 * bright; // 弦の中の低域通過の強さ（小さいほど明るい）
  const period = sr / o.f;
  let N = Math.floor(period - s - 0.1);
  if (N < 2) N = 2;
  const frac = clamp(period - N - s, 0.05, 1.2);
  const c = (1 - frac) / (1 + frac); // 端数の遅れを合わせる全域通過
  const line = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { const w = rng.next() * 2 - 1; lp += (w - lp) * (0.2 + 0.8 * bright); line[i] = lp; }
  // 平均を 0 に
  let mean = 0; for (let i = 0; i < N; i++) mean += line[i]; mean /= N; for (let i = 0; i < N; i++) line[i] -= mean;
  const decay = o.decay ?? 0.996;
  const amp = o.amp ?? 1;
  const env = o.env || null;
  let idx = 0; let prevOld = 0; let apx = 0; let apy = 0;
  for (let i = 0; i < n; i++) {
    const old = line[idx];
    const v = decay * ((1 - s) * old + s * prevOld);
    prevOld = old;
    const ap = c * v + apx - c * apy; apx = v; apy = ap;
    line[idx] = ap;
    idx++; if (idx >= N) idx = 0;
    out[i0 + i] += old * amp * (env ? env(i / sr) : 1);
  }
}

// ---------------------------------------------------------------- フィルター
/**
 * 双 2 次フィルター（RBJ）。o: { type: 'lp'|'hp'|'bp'|'notch'|'peak'|'lowshelf'|'highshelf', f: Hz | (t)=>Hz, q=0.707, gain(dB), from, to }
 * f が関数なら 16 サンプルごとに係数を作り直す（音色の変化）。
 */
export function filter(buf, sr, o) {
  const ff = typeof o.f === 'function' ? o.f : null;
  const q = o.q ?? 0.707;
  const type = o.type || 'lp';
  const gain = o.gain ?? 0;
  const from = Math.floor((o.from || 0) * sr);
  const to = o.to ? Math.min(buf.length, Math.floor(o.to * sr)) : buf.length;
  let b0 = 0; let b1 = 0; let b2 = 0; let a1 = 0; let a2 = 0;
  const coef = (f) => {
    f = clamp(f, 10, sr * 0.45);
    const w = (TAU * f) / sr; const cw = Math.cos(w); const sw = Math.sin(w); const al = sw / (2 * q);
    const A = 10 ** (gain / 40);
    let n0; let n1; let n2; let d0; let d1; let d2;
    switch (type) {
      case 'hp': n0 = (1 + cw) / 2; n1 = -(1 + cw); n2 = (1 + cw) / 2; d0 = 1 + al; d1 = -2 * cw; d2 = 1 - al; break;
      case 'bp': n0 = al; n1 = 0; n2 = -al; d0 = 1 + al; d1 = -2 * cw; d2 = 1 - al; break;
      case 'notch': n0 = 1; n1 = -2 * cw; n2 = 1; d0 = 1 + al; d1 = -2 * cw; d2 = 1 - al; break;
      case 'peak': n0 = 1 + al * A; n1 = -2 * cw; n2 = 1 - al * A; d0 = 1 + al / A; d1 = -2 * cw; d2 = 1 - al / A; break;
      case 'lowshelf': { const s = 2 * Math.sqrt(A) * al; n0 = A * ((A + 1) - (A - 1) * cw + s); n1 = 2 * A * ((A - 1) - (A + 1) * cw); n2 = A * ((A + 1) - (A - 1) * cw - s); d0 = (A + 1) + (A - 1) * cw + s; d1 = -2 * ((A - 1) + (A + 1) * cw); d2 = (A + 1) + (A - 1) * cw - s; break; }
      case 'highshelf': { const s = 2 * Math.sqrt(A) * al; n0 = A * ((A + 1) + (A - 1) * cw + s); n1 = -2 * A * ((A - 1) + (A + 1) * cw); n2 = A * ((A + 1) + (A - 1) * cw - s); d0 = (A + 1) - (A - 1) * cw + s; d1 = 2 * ((A - 1) - (A + 1) * cw); d2 = (A + 1) - (A - 1) * cw - s; break; }
      default: n0 = (1 - cw) / 2; n1 = 1 - cw; n2 = (1 - cw) / 2; d0 = 1 + al; d1 = -2 * cw; d2 = 1 - al;
    }
    b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = d1 / d0; a2 = d2 / d0;
  };
  coef(ff ? ff(from / sr) : o.f);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = from; i < to; i++) {
    if (ff && ((i - from) & 15) === 0) coef(ff((i - from) / sr));
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = Number.isFinite(y) ? y : 0;
    buf[i] = y1;
  }
  return buf;
}

/** 歪み（tanh）。drive 1〜10 */
export function drive(buf, k = 2, mix = 1) {
  const norm = Math.tanh(k);
  for (let i = 0; i < buf.length; i++) { const d = Math.tanh(buf[i] * k) / norm; buf[i] = buf[i] * (1 - mix) + d * mix; }
  return buf;
}

/** やまびこ。o: { time 秒, fb 0〜0.9, mix, damp 0〜1 } */
export function echo(buf, sr, o) {
  const D = Math.max(1, Math.floor(o.time * sr));
  const fb = o.fb ?? 0.35; const mix = o.mix ?? 0.3; const damp = o.damp ?? 0.3;
  const line = new Float32Array(D);
  let p = 0; let lp = 0;
  for (let i = 0; i < buf.length; i++) {
    const d = line[p];
    lp += (d - lp) * (1 - damp);
    line[p] = buf[i] + lp * fb;
    buf[i] += d * mix;
    if (++p >= D) p = 0;
  }
  return buf;
}

/**
 * 残響（くし形 4 本 + 全域通過 2 本の軽いもの）。o: { mix=0.3, size=0.8（0.5〜0.95）, damp=0.3, pre=0 秒 }
 * 響きが入るだけの長さを buf に用意しておくこと。
 */
export function reverb(buf, sr, o = {}) {
  const k = sr / 44100;
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.floor(d * k * (o.room ?? 1)));
  const aps = [556, 225].map((d) => Math.floor(d * k));
  const fb = o.size ?? 0.8; const damp = o.damp ?? 0.3; const mix = o.mix ?? 0.3;
  const pre = Math.floor((o.pre || 0) * sr);
  const wet = new Float32Array(buf.length);
  for (const D of combs) {
    const line = new Float32Array(D); let p = 0; let lp = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = i - pre >= 0 ? buf[i - pre] : 0;
      const y = line[p];
      lp = y * (1 - damp) + lp * damp;
      line[p] = x + lp * fb;
      wet[i] += y * 0.25;
      if (++p >= D) p = 0;
    }
  }
  for (const D of aps) {
    const line = new Float32Array(D); let p = 0;
    for (let i = 0; i < wet.length; i++) {
      const b = line[p];
      const x = wet[i];
      line[p] = x + b * 0.5;
      wet[i] = b - x * 0.5;
      if (++p >= D) p = 0;
    }
  }
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i] * (1 - mix * 0.5) + wet[i] * mix;
  return buf;
}

/** buf に src を t0 秒の位置から gain 倍で足す */
export function mix(out, src, sr, t0 = 0, gain = 1) {
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(src.length, out.length - i0);
  for (let i = 0; i < n; i++) out[i0 + i] += src[i] * gain;
  return out;
}

export function peak(buf) { let m = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } return m; }
export function rms(buf, from = 0, to = buf.length) { let s = 0; for (let i = from; i < to; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, to - from)); }

/** 仕上げ: 直流を除く → 端を 0 にそろえる → ピークを合わせる → 末尾の無音を切る */
export function finish(buf, sr, { peakTo = 0.9, fadeIn = 0.0008, fadeOut = 0.012, trim = true } = {}) {
  // 直流除去（20Hz 高域通過）
  const R = 1 - (TAU * 20) / sr;
  let x1 = 0; let y1 = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i]; const y = x - x1 + R * y1; x1 = x; y1 = y; buf[i] = y; }
  let end = buf.length;
  if (trim) {
    const th = peak(buf) * 0.0015;
    while (end > sr * 0.03 && Math.abs(buf[end - 1]) < th) end--;
    end = Math.min(buf.length, end + Math.floor(sr * 0.005));
  }
  const out = end < buf.length ? buf.slice(0, end) : buf;
  const fi = Math.max(1, Math.floor(fadeIn * sr));
  for (let i = 0; i < fi && i < out.length; i++) out[i] *= i / fi;
  const fo = Math.min(out.length, Math.max(1, Math.floor(fadeOut * sr)));
  for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  const p = peak(out);
  if (p > 0 && peakTo) { const g = peakTo / p; for (let i = 0; i < out.length; i++) out[i] *= g; }
  return out;
}

// ---------------------------------------------------------------- まとめて書く道具
export class Snd {
  constructor(sr, dur, seed = 1) {
    this.sr = sr;
    this.dur = dur;
    this.buf = new Float32Array(Math.max(1, Math.ceil(dur * sr)));
    this.rng = new Rand(seed);
  }
  /** 同じ長さ（または dur）の別の層。フィルターを別に掛けたいときに使う */
  layer(dur = this.dur) { return new Snd(this.sr, dur, this.rng.int()); }
  osc(o) { osc(this.buf, this.sr, o); return this; }
  fm(o) { fm(this.buf, this.sr, o); return this; }
  noise(o) { noise(this.buf, this.sr, o, new Rand(this.rng.int())); return this; }
  grains(o) { grains(this.buf, this.sr, o, this.rng); return this; }
  pluck(o) { pluck(this.buf, this.sr, o, new Rand(this.rng.int())); return this; }
  filter(o) { filter(this.buf, this.sr, o); return this; }
  drive(k, m) { drive(this.buf, k, m); return this; }
  echo(o) { echo(this.buf, this.sr, o); return this; }
  reverb(o) { reverb(this.buf, this.sr, o); return this; }
  gain(g) { for (let i = 0; i < this.buf.length; i++) this.buf[i] *= g; return this; }
  /** 時間で音量を掛ける */
  shape(env) { for (let i = 0; i < this.buf.length; i++) this.buf[i] *= env(i / this.sr); return this; }
  add(layer, t0 = 0, g = 1) { mix(this.buf, layer.buf || layer, this.sr, t0, g); return this; }
  done(peakTo = 0.9, o = {}) { return finish(this.buf, this.sr, { peakTo, ...o }); }
}
