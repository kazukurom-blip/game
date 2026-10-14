// コードで描く絵の共通の道具（色・形・グラデーション・縁取り・乱数・つながる波）。
// 絵はすべて一度だけキャンバスに描いてキャッシュされるので、ここは「きれいさ優先」で書いてよい。

import { makeCanvas } from '../assets.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------- 乱数・ハッシュ
export function hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** シード付きの乱数（0〜1）。同じ種なら毎回同じ絵になる */
export function rng(seed) {
  let a = (typeof seed === 'string' ? hash(seed) : seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  return f;
}

// ---------------- 色
const RGB_CACHE = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  if (RGB_CACHE.has(c)) return RGB_CACHE.get(c);
  let r = 128; let g = 128; let b = 128;
  const s = String(c || '').trim();
  if (s[0] === '#') {
    let hx = s.slice(1);
    if (hx.length === 3 || hx.length === 4) hx = hx.slice(0, 3).split('').map((x) => x + x).join('');
    const n = parseInt(hx.slice(0, 6), 16);
    if (!Number.isNaN(n)) { r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  } else {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); r = p[0]; g = p[1]; b = p[2]; }
  }
  const out = [r, g, b];
  RGB_CACHE.set(c, out);
  return out;
}
const h2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
export const hex = ([r, g, b]) => `#${h2(r)}${h2(g)}${h2(b)}`;
/** 色を混ぜる（t=0 で a、1 で b） */
export function mix(a, b, t) { const A = rgb(a); const B = rgb(b); return hex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]); }
/** 明るく（amt>0）・暗く（amt<0）。-1〜1 */
export function shade(c, amt) { return amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt); }
export function rgba(c, a) { const [r, g, b] = rgb(c); return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(a, 0, 1).toFixed(3)})`; }
/** 明るさ（0〜1） */
export function luma(c) { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
export function toHsl(c) {
  let [r, g, b] = rgb(c); r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  let h = 0; let s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
export function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
/** 色相を回す */
export function hue(c, deg, sMul = 1, lAdd = 0) { const [h, s, l] = toHsl(c); return hsl(h + deg, clamp(s * sMul, 0, 1), clamp(l + lAdd, 0, 1)); }

// ---------------- グラデーション
export function lg(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(clamp(t, 0, 1), c);
  return g;
}
export function rg(ctx, x, y, r0, r1, stops, x1 = x, y1 = y) {
  const g = ctx.createRadialGradient(x, y, Math.max(0, r0), x1, y1, Math.max(0.01, r1));
  for (const [t, c] of stops) g.addColorStop(clamp(t, 0, 1), c);
  return g;
}
/** やわらかい光の円 */
export function glow(ctx, x, y, r, col, a = 1, core = null) {
  ctx.save();
  ctx.fillStyle = rg(ctx, x, y, 0, r, core ? [[0, rgba(core, a)], [0.25, rgba(col, a * 0.8)], [1, rgba(col, 0)]] : [[0, rgba(col, a)], [1, rgba(col, 0)]]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------- 形
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
/** 点の並びを通るなめらかな閉じた形（Catmull-Rom） */
export function blob(ctx, pts, closed = true, tension = 0.5) {
  const n = pts.length;
  if (n < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  const get = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1); const p1 = get(i); const p2 = get(i + 1); const p3 = get(i + 2);
    const t = tension / 3;
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t, p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
/** 先が細くなる帯（手足・尾・触手）。pts=[[x,y],...]、w0→w1 の太さ */
export function taper(ctx, pts, w0, w1) {
  const n = pts.length;
  if (n < 2) return;
  const L = []; const R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0]; let dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) { const m = [(L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2]; ctx.quadraticCurveTo(L[i - 1][0], L[i - 1][1], m[0], m[1]); }
  ctx.lineTo(L[n - 1][0], L[n - 1][1]);
  ctx.arc(pts[n - 1][0], pts[n - 1][1], Math.max(0.01, w1 / 2), Math.atan2(L[n - 1][1] - pts[n - 1][1], L[n - 1][0] - pts[n - 1][0]), Math.atan2(R[n - 1][1] - pts[n - 1][1], R[n - 1][0] - pts[n - 1][0]), true);
  for (let i = n - 2; i >= 0; i--) { const m = [(R[i + 1][0] + R[i][0]) / 2, (R[i + 1][1] + R[i][1]) / 2]; ctx.quadraticCurveTo(R[i + 1][0], R[i + 1][1], m[0], m[1]); }
  ctx.lineTo(R[0][0], R[0][1]);
  ctx.closePath();
}
/** 多角形 */
export function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
/** 星形 */
export function star(ctx, x, y, n, r0, r1, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r0; const a = rot + (i * Math.PI) / n; const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.closePath();
}

/** 塗り＋暗い縁 */
export function fillStroke(ctx, fill, line = 'rgba(10,6,14,0.85)', lw = 1.6) {
  ctx.fillStyle = fill; ctx.fill();
  if (line) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
export function stroke(ctx, col, lw = 1.5, cap = 'round') { ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.lineCap = cap; ctx.lineJoin = 'round'; ctx.stroke(); }
export function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }

/** 立体の塗り（上が明るく下が暗い） */
export function vol(ctx, y0, y1, base, hi = 0.25, lo = -0.4) { return lg(ctx, 0, y0, 0, y1, [[0, shade(base, hi)], [0.55, base], [1, shade(base, lo)]]); }
/** 金属の塗り（帯状の映り込み） */
export function metal(ctx, x0, y0, x1, y1, base, k = 1) {
  return lg(ctx, x0, y0, x1, y1, [[0, shade(base, 0.55 * k)], [0.22, shade(base, 0.15 * k)], [0.45, shade(base, -0.35 * k)], [0.62, shade(base, 0.35 * k)], [0.8, base], [1, shade(base, -0.5 * k)]]);
}

// ---------------- つながる波（横に並べても継ぎ目が出ない）
/** 幅 W で一周する 0〜1 の波。整数の周波数の sin を重ねる */
export function wave(x, W, seed, oct = 5, base = 2) {
  const r = rng(seed);
  let v = 0; let amp = 1; let tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = Math.round(base * 2 ** o + r() * 2);
    const ph = r() * TAU;
    v += Math.sin((x / W) * TAU * f + ph) * amp;
    tot += amp; amp *= 0.5;
  }
  return 0.5 + 0.5 * (v / tot);
}
/** wave を前もって表にする（何度も呼ぶ所向け） */
export function waveTable(W, seed, oct = 5, base = 2, step = 4) {
  const n = Math.ceil(W / step) + 1;
  const t = new Float32Array(n);
  const r = rng(seed);
  const fs = []; const ps = []; const as = [];
  let amp = 1; let tot = 0;
  for (let o = 0; o < oct; o++) { fs.push(Math.round(base * 2 ** o + r() * 2)); ps.push(r() * TAU); as.push(amp); tot += amp; amp *= 0.5; }
  for (let i = 0; i < n; i++) { let v = 0; const x = i * step; for (let o = 0; o < oct; o++) v += Math.sin((x / W) * TAU * fs[o] + ps[o]) * as[o]; t[i] = 0.5 + 0.5 * (v / tot); }
  return (x) => { const f = (((x % W) + W) % W) / step; const i = Math.floor(f); const k = f - i; return t[i] * (1 - k) + t[Math.min(n - 1, i + 1)] * k; };
}
/** 横につながる絵のため、幅 W の端をまたぐ物は両側に描く */
export function wrapDraw(x, w, W, fn) {
  fn(x);
  if (x - w < 0) fn(x + W);
  if (x + w > W) fn(x - W);
}

// ---------------- 下書き用のキャンバス
/** 今の ctx の拡大率（コードの絵は 2 倍で描かれる） */
export function ctxScale(ctx) {
  try { const m = ctx.getTransform?.(); if (m && m.a) return Math.abs(m.a); } catch { /* 古いブラウザ */ }
  return 2;
}
/** (w×h) の下書きを作って fn で描く。ブラウザ以外では null */
export function layer(w, h, k, fn) {
  const c = makeCanvas(Math.ceil(w * k), Math.ceil(h * k));
  if (!c) return null;
  const x = c.getContext('2d');
  x.scale(k, k);
  fn(x);
  return c;
}
/**
 * 縁取りして描く: fn で描いた絵の外側に、暗い縁（と任意の光）を付ける。
 * opt: { color, width, glow: { color, blur, alpha } }
 */
export function outlined(ctx, w, h, fn, opt = {}) {
  const k = ctxScale(ctx);
  const src = layer(w, h, k, fn);
  if (!src) { fn(ctx); return; }
  const lw = opt.width ?? 1.6;
  ctx.save();
  if (opt.glow) {
    ctx.save();
    ctx.globalAlpha = opt.glow.alpha ?? 0.8;
    ctx.shadowColor = opt.glow.color; ctx.shadowBlur = (opt.glow.blur ?? 10) * k;
    const gs = silhouette(src, opt.glow.color);
    ctx.drawImage(gs, 0, 0, w, h);
    if (opt.glow.twice) ctx.drawImage(gs, 0, 0, w, h);
    ctx.restore();
  }
  if (lw > 0) {
    const sil = silhouette(src, opt.color || 'rgba(8,5,12,0.92)');
    const steps = 12;
    for (let i = 0; i < steps; i++) { const a = (i / steps) * TAU; ctx.drawImage(sil, Math.cos(a) * lw, Math.sin(a) * lw, w, h); }
  }
  ctx.drawImage(src, 0, 0, w, h);
  ctx.restore();
}
/** 絵の形だけを単色にした物 */
export function silhouette(img, col) {
  const c = makeCanvas(img.width, img.height);
  if (!c) return img;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** ざらつき（小さな点を散らす。絵の中の質感） */
export function speckle(ctx, x, y, w, h, n, col, seed, rMin = 0.4, rMax = 1.2) {
  const r = rng(seed);
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x + r() * w, y + r() * h, rMin + r() * (rMax - rMin), 0, TAU); ctx.fill(); }
}
