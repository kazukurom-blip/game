// render 共通ユーティリティ（色計算・決定論的乱数）
const shadeCache = new Map();
const rgbaCache = new Map();

function parseHex(c) {
  if (typeof c !== 'string' || c[0] !== '#') return null;
  let h = c.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hx = (v) => {
  v = Math.max(0, Math.min(255, Math.round(v)));
  return (v < 16 ? '0' : '') + v.toString(16);
};

/** 色を明るく(amt>0)/暗く(amt<0)。amt: -1..1 */
export function shade(col, amt) {
  const key = col + '|' + amt;
  let r = shadeCache.get(key);
  if (r) return r;
  const c = parseHex(col);
  if (!c) r = col;
  else {
    let [R, G, B] = c;
    if (amt >= 0) { R += (255 - R) * amt; G += (255 - G) * amt; B += (255 - B) * amt; }
    else { R *= 1 + amt; G *= 1 + amt; B *= 1 + amt; }
    r = '#' + hx(R) + hx(G) + hx(B);
  }
  if (shadeCache.size > 4000) shadeCache.clear();
  shadeCache.set(key, r);
  return r;
}

/** '#rrggbb' + alpha → 'rgba()' */
export function rgba(col, a) {
  const key = col + '|' + a;
  let r = rgbaCache.get(key);
  if (r) return r;
  const c = parseHex(col);
  r = c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : col;
  if (rgbaCache.size > 4000) rgbaCache.clear();
  rgbaCache.set(key, r);
  return r;
}

/** 2色の補間 */
export function mix(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return a;
  return '#' + hx(ca[0] + (cb[0] - ca[0]) * t) + hx(ca[1] + (cb[1] - ca[1]) * t) + hx(ca[2] + (cb[2] - ca[2]) * t);
}

/** mulberry32 決定論的乱数 */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** 角丸矩形パス */
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 星形パス */
export function starPath(ctx, x, y, r1, r2, n = 5, rot = -Math.PI / 2) {
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = rot + (i * Math.PI) / n;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch (e) { /* fallthrough */ }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export const OUTLINE = '#2a1430';

/** 重み付き平均色。cols と ws は同じ長さ（ws の合計で正規化） */
export function mixW(cols, ws) {
  let r = 0, g = 0, b = 0, s = 0;
  for (let i = 0; i < cols.length; i++) {
    const w = ws[i]; if (!w) continue;
    const c = parseHex(cols[i]); if (!c) continue;
    r += c[0] * w; g += c[1] * w; b += c[2] * w; s += w;
  }
  if (!s) return cols[0];
  return '#' + hx(r / s) + hx(g / s) + hx(b / s);
}
