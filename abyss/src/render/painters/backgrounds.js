// 背景: 10 章 × 3 層（一番奥 1280×720・中景 1280×720・地面 1280×220）。どれも横に並べると継ぎ目なくつながる。
// 一番奥 = 空・遠い山や建物、中景 = 木・建物・柱などの影絵（下は地面で隠れる）、地面 = 歩く所（上の端は中景になじむ）。
// 地面の上端（y=0）は画面の y=520、キャラの足元は地面の y≈8〜72。

import { TAU, rgba, shade, mix, lg, rg, roundRect, ellipse, blob, taper, poly, line, glow, rng, waveTable, wrapDraw, star } from './util.js';

const W0 = 1280;

// ---------------- 共通の道具
/** 端をまたぐ物を両側に描く。どちらの複製も同じ乱数で描く（継ぎ目が合う） */
function wrapR(x, ew, W, seed, fn) { const sd = (Math.floor(seed * 4294967296) >>> 0) || 1; wrapDraw(x, ew, W, (xx) => fn(xx, rng(sd))); }
function sky(ctx, w, h, stops) { ctx.fillStyle = lg(ctx, 0, 0, 0, h, stops); ctx.fillRect(0, 0, w, h); }
/** つながる山並み。peaky: 尖らせる（0〜1） */
function ridge(ctx, w, h, y0, amp, seed, fill, o = {}) {
  const f = waveTable(w, seed, o.oct ?? 5, o.base ?? 2, 4);
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) {
    let v = f(x);
    if (o.peaky) v = v * (1 - o.peaky) + (1 - Math.abs(2 * v - 1)) * o.peaky;
    ctx.lineTo(x, y0 - amp * v);
  }
  ctx.lineTo(w, h); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  return f;
}
function band(ctx, w, y, hh, col, a = 0.5) { ctx.fillStyle = lg(ctx, 0, y - hh, 0, y + hh, [[0, rgba(col, 0)], [0.5, rgba(col, a)], [1, rgba(col, 0)]]); ctx.fillRect(0, y - hh, w, hh * 2); }
function clouds(ctx, w, y, n, size, col, a, seed, flat = 0.35) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w; const s = size * (0.6 + r() * 0.8); const yy = y + (r() - 0.5) * size * 0.8;
    wrapR(x, s * 2, w, r(), (xx, r) => {
      for (let k = 0; k < 5; k++) { const ox = (k - 2) * s * 0.45; const oy = -Math.abs(k - 2) * -s * 0.08 - r() * s * 0.1; ctx.fillStyle = rg(ctx, xx + ox, yy + oy, 0, s * 0.7, [[0, rgba(col, a)], [1, rgba(col, 0)]]); ellipse(ctx, xx + ox, yy + oy, s * 0.7, s * 0.7 * flat * 2); ctx.fill(); }
    });
  }
}
function stars(ctx, w, h, n, seed, col = '#ffffff') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { const x = r() * w; const y = r() * h; const s = r(); ctx.fillStyle = rgba(col, 0.25 + s * 0.7); ctx.beginPath(); ctx.arc(x, y, 0.4 + s * 1.3, 0, TAU); ctx.fill(); if (s > 0.94) { star(ctx, x, y, 4, 4, 0.6); ctx.fill(); } }
}
function orb(ctx, x, y, r, col, halo, a = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rg(ctx, x, y, r * 0.8, r * 5, [[0, rgba(halo, 0.45 * a)], [0.4, rgba(halo, 0.12 * a)], [1, rgba(halo, 0)]]); ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  ctx.restore();
  ctx.fillStyle = rg(ctx, x - r * 0.3, y - r * 0.3, r * 0.1, r * 1.1, [[0, shade(col, 0.5)], [0.7, col], [1, shade(col, -0.3)]]); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function rays(ctx, w, h, n, col, a, seed, x0 = 0, spread = 0.3) {
  const r = rng(seed);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = r() * w; const wd = 20 + r() * 70; const sk = (r() - 0.5) * spread * h + x0;
    wrapR(x, wd + Math.abs(sk) + 40, w, r(), (xx, r) => { ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, rgba(col, a * (0.5 + r() * 0.5))], [1, rgba(col, 0)]]); poly(ctx, [[xx, 0], [xx + wd, 0], [xx + wd + sk, h], [xx + sk, h]]); ctx.fill(); });
  }
  ctx.restore();
}
/** 地面の上端をぼかす（中景になじませる） */
function groundTop(ctx, w, h, top, base) {
  ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, rgba(top, 0)], [0.05, rgba(top, 0.85)], [0.12, top], [0.55, base], [1, shade(base, -0.5)]]);
  ctx.fillRect(0, 0, w, h);
}
/** 地面のでこぼこ（縦の濃淡） */
function groundTexture(ctx, w, h, seed, dark, light, n = 260) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w; const y = 10 + r() * (h - 10); const s = 2 + r() * 10 * (0.4 + y / h);
    wrapR(x, s, w, r(), (xx, r) => { ctx.fillStyle = rgba(r() < 0.5 ? dark : light, 0.12 + r() * 0.18); ellipse(ctx, xx, y, s, s * 0.32); ctx.fill(); });
  }
}
function stones(ctx, w, h, n, seed, col, y0 = 18) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w; const y = y0 + r() * (h - y0 - 20); const s = 3 + r() * 7 * (0.5 + y / h);
    wrapR(x, s * 2, w, r(), (xx, r) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, xx + 1, y + s * 0.35, s * 1.1, s * 0.35); ctx.fill();
      ctx.fillStyle = lg(ctx, 0, y - s * 0.6, 0, y + s * 0.4, [[0, shade(col, 0.3)], [1, shade(col, -0.35)]]);
      blob(ctx, [[xx - s, y + s * 0.2], [xx - s * 0.6, y - s * 0.5], [xx + s * 0.4, y - s * 0.6], [xx + s, y], [xx + s * 0.5, y + s * 0.35], [xx - s * 0.4, y + s * 0.4]], true, 0.6); ctx.fill();
    });
  }
}
function tufts(ctx, w, h, n, seed, col, y0 = 6) {
  const r = rng(seed);
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * w; const y = y0 + r() * (h * 0.5); const s = 4 + r() * 8;
    wrapR(x, s, w, r(), (xx, r) => { ctx.lineWidth = 1 + r(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.3 + (r() - 0.5) * 0.2; ctx.beginPath(); ctx.moveTo(xx + (k - 2) * 1.5, y); ctx.quadraticCurveTo(xx + (k - 2) * 2 + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.6, xx + (k - 2) * 2.5 + Math.cos(a) * s, y + Math.sin(a) * s); ctx.stroke(); } });
  }
}
/** 遠くの霧で色を薄める（奥行き） */
function haze(ctx, w, h, col, a, y0 = 0) { ctx.fillStyle = lg(ctx, 0, y0, 0, h, [[0, rgba(col, 0)], [1, rgba(col, a)]]); ctx.fillRect(0, y0, w, h - y0); }

// ---------------- 影絵の部品
function deadTree(ctx, x, by, hgt, col, r) {
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  const branch = (x0, y0, ang, len, wd, d) => {
    const x1 = x0 + Math.cos(ang) * len; const y1 = y0 + Math.sin(ang) * len;
    ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * len * 0.3, (y0 + y1) / 2, x1, y1); ctx.stroke();
    if (d > 0) { const n = 2 + (r() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) branch(x1, y1, ang + (r() - 0.5) * 1.3, len * (0.55 + r() * 0.2), wd * 0.62, d - 1); }
  };
  taper(ctx, [[x, by + 4], [x + (r() - 0.5) * 10, by - hgt * 0.5], [x + (r() - 0.5) * 16, by - hgt * 0.7]], hgt * 0.09, hgt * 0.04); ctx.fillStyle = col; ctx.fill();
  branch(x + (r() - 0.5) * 16, by - hgt * 0.7, -Math.PI / 2 + (r() - 0.5) * 0.5, hgt * 0.3, hgt * 0.04, 3);
  branch(x, by - hgt * 0.45, -Math.PI / 2 - 0.9 - r() * 0.4, hgt * 0.25, hgt * 0.03, 2);
  branch(x, by - hgt * 0.5, -Math.PI / 2 + 0.9 + r() * 0.4, hgt * 0.22, hgt * 0.03, 2);
}
function house(ctx, x, by, w, h, col, win, r) {
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, by - h, w, h + 10);
  const broken = r() < 0.5;
  poly(ctx, broken ? [[x - w / 2 - 6, by - h], [x - w * 0.1, by - h - w * 0.5], [x + w * 0.1, by - h - w * 0.3], [x + w * 0.2, by - h - w * 0.42], [x + w / 2 + 6, by - h]] : [[x - w / 2 - 6, by - h], [x, by - h - w * 0.55], [x + w / 2 + 6, by - h]]); ctx.fill();
  if (r() < 0.6) ctx.fillRect(x + w * 0.18, by - h - w * 0.45, w * 0.12, w * 0.3);
  if (win) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) { if (r() < 0.4) continue; const wx = x - w * 0.3 + i * w * 0.4; const wy = by - h * 0.65; ctx.fillStyle = rgba(win, 0.75); ctx.fillRect(wx, wy, w * 0.16, h * 0.22); ctx.fillStyle = rg(ctx, wx + w * 0.08, wy + h * 0.1, 0, w * 0.5, [[0, rgba(win, 0.25)], [1, rgba(win, 0)]]); ctx.fillRect(wx - w * 0.5, wy - w * 0.5, w * 1.1, w * 1.1); }
    ctx.restore();
  }
}
function spire(ctx, x, by, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, by - h * 0.6, w, h * 0.6 + 10);
  poly(ctx, [[x - w / 2 - 4, by - h * 0.6], [x, by - h], [x + w / 2 + 4, by - h * 0.6]]); ctx.fill();
  ctx.fillRect(x - 1.5, by - h - 26, 3, 26); ctx.fillRect(x - 9, by - h - 18, 18, 3);
}
function grave(ctx, x, by, s, col, r) {
  ctx.fillStyle = col;
  const t = r();
  if (t < 0.4) { roundRect(ctx, x - s * 0.5, by - s * 1.4, s, s * 1.5, s * 0.5); ctx.fill(); }
  else if (t < 0.7) { ctx.fillRect(x - s * 0.12, by - s * 1.8, s * 0.24, s * 1.9); ctx.fillRect(x - s * 0.5, by - s * 1.35, s, s * 0.22); }
  else { ctx.save(); ctx.translate(x, by); ctx.rotate((r() - 0.5) * 0.4); roundRect(ctx, -s * 0.45, -s * 1.1, s * 0.9, s * 1.2, s * 0.15); ctx.fill(); ctx.restore(); }
}
function fence(ctx, x0, x1, by, hgt, col, r) {
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let x = x0; x < x1; x += 14 + r() * 6) { ctx.save(); ctx.translate(x, by); ctx.rotate((r() - 0.5) * 0.3); line(ctx, 0, 0, 0, -hgt * (0.7 + r() * 0.4)); ctx.stroke(); ctx.restore(); }
  ctx.lineWidth = 2.4; line(ctx, x0, by - hgt * 0.7, x1, by - hgt * 0.62 + (r() - 0.5) * 6); ctx.stroke();
}
function column(ctx, x, by, w, h, col, hi, broken, r) {
  ctx.fillStyle = lg(ctx, x - w / 2, 0, x + w / 2, 0, [[0, shade(col, -0.25)], [0.35, hi], [0.6, col], [1, shade(col, -0.45)]]);
  const top = by - h;
  if (broken) poly(ctx, [[x - w / 2, by + 10], [x - w / 2, top + 10], [x - w * 0.1, top - 4], [x + w * 0.2, top + 8], [x + w / 2, top], [x + w / 2, by + 10]]);
  else ctx.rect(x - w / 2, top, w, h + 10);
  ctx.fill();
  ctx.strokeStyle = rgba('#000', 0.18); ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const xx = x - w / 2 + (w / 4) * i; line(ctx, xx, top + 12, xx, by); ctx.stroke(); }
  if (!broken) { ctx.fillStyle = shade(col, -0.1); ctx.fillRect(x - w * 0.7, top - 10, w * 1.4, 12); ctx.fillRect(x - w * 0.65, by - 8, w * 1.3, 12); }
  void r;
}
function pine(ctx, x, by, h, col, snow) {
  ctx.fillStyle = shade(col, -0.3); ctx.fillRect(x - h * 0.03, by - h * 0.2, h * 0.06, h * 0.25);
  for (let i = 0; i < 4; i++) {
    const y = by - h * 0.15 - i * h * 0.22; const wd = h * (0.38 - i * 0.075);
    poly(ctx, [[x - wd, y], [x, y - h * 0.34], [x + wd, y]]); ctx.fillStyle = col; ctx.fill();
    if (snow) { ctx.fillStyle = snow; poly(ctx, [[x - wd * 0.55, y - h * 0.14], [x, y - h * 0.34], [x + wd * 0.5, y - h * 0.15], [x + wd * 0.2, y - h * 0.12], [x - wd * 0.15, y - h * 0.16]]); ctx.fill(); }
  }
}
function crystalSpike(ctx, x, by, h, col, hi, w = 0.22) {
  poly(ctx, [[x - h * w, by + 6], [x - h * w * 0.4, by - h * 0.8], [x, by - h], [x + h * w * 0.6, by - h * 0.7], [x + h * w, by + 6]]);
  ctx.fillStyle = lg(ctx, x - h * w, 0, x + h * w, 0, [[0, shade(col, -0.3)], [0.4, hi], [0.55, col], [1, shade(col, -0.45)]]); ctx.fill();
}
function mushroom(ctx, x, by, h, stem, cap, glowc, r) {
  const cw = h * (0.45 + r() * 0.2);
  ctx.fillStyle = lg(ctx, x - h * 0.06, 0, x + h * 0.06, 0, [[0, shade(stem, -0.3)], [0.5, stem], [1, shade(stem, -0.5)]]);
  ctx.beginPath(); ctx.moveTo(x - h * 0.07, by + 8); ctx.quadraticCurveTo(x - h * 0.05 + (r() - 0.5) * h * 0.2, by - h * 0.5, x - h * 0.04, by - h * 0.85); ctx.lineTo(x + h * 0.04, by - h * 0.85); ctx.quadraticCurveTo(x + h * 0.06, by - h * 0.4, x + h * 0.08, by + 8); ctx.fill();
  ctx.fillStyle = lg(ctx, 0, by - h * 1.05, 0, by - h * 0.8, [[0, shade(cap, 0.25)], [1, shade(cap, -0.35)]]);
  ctx.beginPath(); ctx.moveTo(x - cw, by - h * 0.82); ctx.quadraticCurveTo(x - cw * 0.8, by - h * 1.12, x, by - h * 1.1); ctx.quadraticCurveTo(x + cw * 0.8, by - h * 1.12, x + cw, by - h * 0.82); ctx.quadraticCurveTo(x, by - h * 0.9, x - cw, by - h * 0.82); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { ctx.fillStyle = rgba(glowc, 0.7); ellipse(ctx, x - cw * 0.7 + r() * cw * 1.4, by - h * (0.9 + r() * 0.15), 1.5 + r() * 3, 1 + r() * 2); ctx.fill(); }
  ctx.fillStyle = rg(ctx, x, by - h * 0.84, 0, cw * 1.3, [[0, rgba(glowc, 0.3)], [1, rgba(glowc, 0)]]); ctx.fillRect(x - cw * 1.3, by - h * 0.84 - cw * 1.3, cw * 2.6, cw * 2.6);
  ctx.restore();
}
function gearSil(ctx, x, y, r, teeth, col, hole = 0.35) {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a0 = (i / (teeth * 2)) * TAU; const a1 = ((i + 1) / (teeth * 2)) * TAU; const rr = i % 2 ? r : r * 1.12; ctx.arc(x, y, rr, a0, a1); }
  ctx.closePath();
  ctx.moveTo(x + r * hole, y); ctx.arc(x, y, r * hole, 0, TAU, true);
  ctx.fillStyle = col; ctx.fill('evenodd');
  ctx.strokeStyle = rgba('#000', 0.25); ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; line(ctx, x + Math.cos(a) * r * hole, y + Math.sin(a) * r * hole, x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); ctx.stroke(); }
}
function skullPile(ctx, x, by, s, col, r) {
  for (let i = 0; i < 9; i++) {
    const px = x + (r() - 0.5) * s * 2.2; const py = by - r() * s * 0.9 - Math.max(0, s * 0.8 - Math.abs(px - x) * 0.5);
    ctx.fillStyle = col; ellipse(ctx, px, py, s * 0.28, s * 0.25); ctx.fill();
    ctx.fillStyle = rgba('#000', 0.6); ellipse(ctx, px - s * 0.1, py, s * 0.07, s * 0.08); ctx.fill(); ellipse(ctx, px + s * 0.1, py, s * 0.07, s * 0.08); ctx.fill();
  }
}
function chainHang(ctx, x, y0, y1, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2.2;
  for (let y = y0; y < y1; y += 9) { ctx.beginPath(); ctx.ellipse(x, y, (y / 9) % 2 < 1 ? 3.2 : 1.4, 5, 0, 0, TAU); ctx.stroke(); }
}

// ---------------- 章ごと
const ACT = {
  act1: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#120e18'], [0.4, '#2a2030'], [0.66, '#5a3a3a'], [0.8, '#3a2a2c'], [1, '#141014']]);
      stars(ctx, w, h * 0.45, 90, 'a1s', '#d8c8d0');
      orb(ctx, 930, 170, 58, '#c8402e', '#ff5a3a', 0.9);
      ctx.fillStyle = 'rgba(40,20,24,0.35)'; ellipse(ctx, 915, 158, 14, 9); ctx.fill(); ellipse(ctx, 948, 186, 9, 6); ctx.fill();
      clouds(ctx, w, 230, 14, 90, '#4a3a44', 0.35, 'a1c1');
      ridge(ctx, w, h, 470, 120, 'a1r1', '#2c2430', { peaky: 0.2 });
      haze(ctx, w, h, '#6a4a48', 0.35, 360);
      ridge(ctx, w, h, 520, 80, 'a1r2', '#1e1820', { peaky: 0.1 });
      band(ctx, w, 470, 40, '#8a6a6a', 0.22);
      clouds(ctx, w, 420, 10, 70, '#6a5a60', 0.18, 'a1c2', 0.25);
      void r;
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 奥の列（霞む）
      for (let i = 0; i < 7; i++) { const x = r() * w; const hh = 120 + r() * 80; wrapR(x, hh * 0.5, w, r(), (xx, r) => deadTree(ctx, xx, by - 10, hh, '#2e2630', r)); }
      wrapR(330, 60, w, r(), (xx, r) => spire(ctx, xx, by - 6, 44, 230, '#2a2028'));
      for (const x of [140, 560, 980]) wrapR(x, 80, w, r(), (xx, r) => house(ctx, xx, by, 70 + r() * 30, 60 + r() * 30, '#1e1820', '#ffb060', r));
      // 手前の列
      for (let i = 0; i < 5; i++) { const x = r() * w; const hh = 200 + r() * 120; wrapR(x, hh * 0.5, w, r(), (xx, r) => deadTree(ctx, xx, by + 8, hh, '#140f14', r)); }
      for (let i = 0; i < 14; i++) { const x = r() * w; wrapR(x, 20, w, r(), (xx, r) => grave(ctx, xx, by + 4, 10 + r() * 10, '#1a1418', r)); }
      for (const x0 of [700, 1180]) wrapR(x0, 150, w, r(), (xx, r) => fence(ctx, xx - 70, xx + 70, by + 6, 34, '#120e12', r));
      // 灯り
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const x of [420, 860]) wrapR(x, 40, w, r(), (xx, r) => { ctx.fillStyle = '#ffb060'; ctx.fillRect(xx - 3, by - 60, 6, 8); ctx.fillStyle = rg(ctx, xx, by - 56, 0, 40, [[0, 'rgba(255,170,90,0.4)'], [1, 'rgba(255,170,90,0)']]); ctx.fillRect(xx - 40, by - 96, 80, 80); });
      ctx.restore();
      for (const x of [420, 860]) wrapR(x, 6, w, r(), (xx, r) => { ctx.fillStyle = '#120e12'; ctx.fillRect(xx - 1.5, by - 52, 3, 60); });
      band(ctx, w, by - 10, 26, '#6a5050', 0.25);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#4a3c36', '#2a2220');
      groundTexture(ctx, w, h, 'a1g', '#120c0c', '#6a5a50');
      // 道
      ctx.fillStyle = lg(ctx, 0, 14, 0, 80, [[0, 'rgba(110,90,76,0.0)'], [0.3, 'rgba(110,90,76,0.35)'], [1, 'rgba(110,90,76,0.05)']]); ctx.fillRect(0, 14, w, 66);
      // 水たまり（赤い月が映る）
      for (let i = 0; i < 6; i++) { const x = r() * w; const y = 30 + r() * 90; wrapR(x, 40, w, r(), (xx, r) => { ctx.fillStyle = 'rgba(20,14,18,0.8)'; ellipse(ctx, xx, y, 26 + r() * 20, 4 + r() * 3); ctx.fill(); ctx.fillStyle = 'rgba(200,70,50,0.25)'; ellipse(ctx, xx + 4, y - 0.5, 10, 1.4); ctx.fill(); }); }
      stones(ctx, w, h, 40, 'a1st', '#5a504a');
      tufts(ctx, w, h, 70, 'a1t', 'rgba(110,96,70,0.8)');
      // 灰
      for (let i = 0; i < 160; i++) { const x = r() * w; const y = r() * h; ctx.fillStyle = `rgba(200,190,185,${0.05 + r() * 0.12})`; ctx.fillRect(x, y, 1.5, 1.5); }
    },
  },
  act2: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#2a1428'], [0.3, '#7a2e32'], [0.55, '#d8703a'], [0.7, '#ffb868'], [0.8, '#c8783a'], [1, '#4a2410']]);
      orb(ctx, 760, 380, 70, '#ffe6a8', '#ffb060', 1);
      clouds(ctx, w, 200, 10, 110, '#ff9a6a', 0.22, 'a2c', 0.18);
      ridge(ctx, w, h, 520, 70, 'a2d1', '#b8683a', { base: 1, oct: 4 });
      // 遠くの角錐
      for (const [x, s] of [[200, 120], [300, 80], [1050, 150]]) wrapR(x, s, w, r(), (xx, r) => { poly(ctx, [[xx - s, 500], [xx, 500 - s * 0.9], [xx + s, 500]]); ctx.fillStyle = '#9a5634'; ctx.fill(); poly(ctx, [[xx, 500 - s * 0.9], [xx + s, 500], [xx + s * 0.25, 500]]); ctx.fillStyle = 'rgba(60,20,10,0.35)'; ctx.fill(); });
      haze(ctx, w, h, '#ffb070', 0.3, 380);
      ridge(ctx, w, h, 560, 60, 'a2d2', '#8a4626', { base: 1, oct: 3 });
      band(ctx, w, 440, 70, '#ffc890', 0.25);
      void r;
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 砂丘
      ctx.save(); ridge(ctx, w, h + 40, by + 10, 70, 'a2m', lg(ctx, 0, by - 70, 0, by + 10, [[0, '#c8783e'], [1, '#6a3418']]), { base: 1, oct: 3 }); ctx.restore();
      // オベリスク・柱・神殿
      for (const x of [120, 760]) wrapR(x, 30, w, r(), (xx, r) => { poly(ctx, [[xx - 16, by + 10], [xx - 11, by - 200], [xx, by - 220], [xx + 11, by - 200], [xx + 16, by + 10]]); ctx.fillStyle = lg(ctx, xx - 16, 0, xx + 16, 0, [[0, '#3a1e14'], [0.4, '#a0603a'], [1, '#2a140c']]); ctx.fill(); ctx.fillStyle = 'rgba(30,10,4,0.55)'; for (let i = 0; i < 6; i++) ctx.fillRect(xx - 4, by - 180 + i * 26, 8, 3 + (i % 2) * 6); });
      wrapR(440, 200, w, r(), (xx, r) => {
        ctx.fillStyle = '#5a2e1c'; ctx.fillRect(xx - 170, by - 40, 340, 60);
        ctx.fillStyle = '#4a2416'; ctx.fillRect(xx - 150, by - 150, 300, 110);
        poly(ctx, [[xx - 170, by - 150], [xx, by - 210], [xx + 170, by - 150]]); ctx.fill();
        for (let i = 0; i < 6; i++) column(ctx, xx - 125 + i * 50, by - 40, 22, 110, '#7a4428', '#c8885a', i === 4, r);
        ctx.fillStyle = '#1a0a06'; ctx.fillRect(xx - 24, by - 100, 48, 60);
      });
      for (const x of [980, 1120, 280]) wrapR(x, 30, w, r(), (xx, r) => column(ctx, xx, by + 4, 26, 90 + r() * 70, '#6a3a22', '#c8885a', true, r));
      for (let i = 0; i < 6; i++) { const x = r() * w; wrapR(x, 30, w, r(), (xx, r) => { ctx.fillStyle = '#3a1c10'; blob(ctx, [[xx - 26, by + 6], [xx - 14, by - 12], [xx + 6, by - 16], [xx + 24, by + 6]], true, 0.6); ctx.fill(); }); }
      band(ctx, w, by - 20, 40, '#ffb070', 0.18);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#d89a5a', '#8a5228');
      // 風紋
      ctx.strokeStyle = 'rgba(255,220,170,0.25)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) { const y = 14 + i * 8 + r() * 4; const ph = r() * TAU; ctx.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin((x / w) * TAU * 6 + ph) * 3; if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); } ctx.stroke(); }
      groundTexture(ctx, w, h, 'a2g', '#5a2e14', '#ffd090', 180);
      stones(ctx, w, h, 22, 'a2st', '#a06a40');
      // 骨
      for (let i = 0; i < 6; i++) { const x = r() * w; const y = 30 + r() * 120; wrapR(x, 20, w, r(), (xx, r) => { ctx.fillStyle = '#e8dcc0'; ctx.save(); ctx.translate(xx, y); ctx.rotate(r() * 3); roundRect(ctx, -10, -1.5, 20, 3, 1.5); ctx.fill(); ellipse(ctx, -10, 0, 3, 3); ctx.fill(); ellipse(ctx, 10, 0, 3, 3); ctx.fill(); ctx.restore(); }); }
    },
  },
  act3: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#040a1a'], [0.35, '#0e2440'], [0.62, '#2a5a86'], [0.75, '#6a9ac4'], [1, '#1a2a40']]);
      stars(ctx, w, h * 0.6, 160, 'a3s');
      // オーロラ
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const ph = r() * TAU; const y0 = 120 + k * 50; const col = k === 1 ? '#6affc8' : '#5ae0ff';
        for (let x = 0; x < w; x += 6) { const yy = y0 + Math.sin((x / w) * TAU * 2 + ph) * 40 + Math.sin((x / w) * TAU * 5 + ph * 2) * 12; ctx.fillStyle = lg(ctx, 0, yy - 60, 0, yy + 30, [[0, rgba(col, 0)], [0.7, rgba(col, 0.12)], [1, rgba(col, 0)]]); ctx.fillRect(x, yy - 60, 6, 90); }
      }
      ctx.restore();
      const f1 = ridge(ctx, w, h, 470, 240, 'a3r1', '#3a5a7c', { peaky: 0.8 });
      // 雪の頂
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 4) { const v = f1(x); ctx.lineTo(x, 470 - 240 * (v * 0.2 + (1 - Math.abs(2 * v - 1)) * 0.8)); } ctx.lineTo(w, h); ctx.closePath(); ctx.clip();
      ctx.fillStyle = lg(ctx, 0, 230, 0, 470, [[0, 'rgba(240,248,255,0.95)'], [0.45, 'rgba(200,225,250,0.55)'], [1, 'rgba(200,225,250,0)']]); ctx.fillRect(0, 200, w, 300);
      ctx.restore();
      haze(ctx, w, h, '#8ab0d8', 0.45, 340);
      ridge(ctx, w, h, 520, 120, 'a3r2', '#22405c', { peaky: 0.6 });
      band(ctx, w, 500, 40, '#c8e0f8', 0.25);
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 氷の砦
      wrapR(620, 230, w, r(), (xx, r) => {
        ctx.fillStyle = lg(ctx, 0, by - 200, 0, by, [[0, '#4a6a8a'], [1, '#1a2a3e']]);
        ctx.fillRect(xx - 220, by - 120, 440, 140);
        for (let i = 0; i < 12; i++) ctx.fillRect(xx - 220 + i * 38, by - 136, 22, 18);
        for (const dx of [-200, 200]) { ctx.fillRect(xx + dx - 34, by - 230, 68, 250); poly(ctx, [[xx + dx - 42, by - 230], [xx + dx, by - 300], [xx + dx + 42, by - 230]]); ctx.fill(); }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(140,220,255,0.55)'; for (const dx of [-200, 200]) ctx.fillRect(xx + dx - 6, by - 200, 12, 22); ctx.restore();
        ctx.fillStyle = 'rgba(230,245,255,0.7)'; ctx.fillRect(xx - 220, by - 122, 440, 4); for (const dx of [-200, 200]) { poly(ctx, [[xx + dx - 30, by - 256], [xx + dx, by - 300], [xx + dx + 30, by - 256], [xx + dx, by - 270]]); ctx.fill(); }
      });
      for (let i = 0; i < 16; i++) { const x = r() * w; const hh = 90 + r() * 120; wrapR(x, hh * 0.4, w, r(), (xx, r) => pine(ctx, xx, by + 6, hh, i % 2 ? '#14283a' : '#1c3448', 'rgba(230,242,255,0.85)')); }
      for (let i = 0; i < 6; i++) { const x = r() * w; const hh = 60 + r() * 90; wrapR(x, hh * 0.3, w, r(), (xx, r) => crystalSpike(ctx, xx, by + 6, hh, '#5aa0d0', '#e0f6ff')); }
      band(ctx, w, by - 14, 30, '#d8eaff', 0.3);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#e4eef8', '#8aa4c4');
      groundTexture(ctx, w, h, 'a3g', '#6a88aa', '#ffffff', 220);
      for (let i = 0; i < 9; i++) { const x = r() * w; const y = 24 + r() * 120; wrapR(x, 70, w, r(), (xx, r) => { ctx.fillStyle = lg(ctx, 0, y - 6, 0, y + 6, [[0, 'rgba(180,230,255,0.7)'], [1, 'rgba(90,150,200,0.5)']]); ellipse(ctx, xx, y, 40 + r() * 40, 5 + r() * 4); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ellipse(ctx, xx - 10, y - 1.5, 16, 1.2); ctx.fill(); }); }
      stones(ctx, w, h, 24, 'a3st', '#5a6a80');
      // 石に積もった雪
      const rr = rng('a3st');
      void rr;
      for (let i = 0; i < 60; i++) { const x = r() * w; const y = r() * h; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x, y, 2, 2); }
    },
  },
  act4: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#2aa8b0'], [0.25, '#126a7a'], [0.6, '#0a3a4a'], [1, '#04161e']]);
      rays(ctx, w, h * 0.9, 9, '#bff6ff', 0.12, 'a4ray', 40, 0.25);
      // 遠い塔
      for (let i = 0; i < 8; i++) { const x = r() * w; const hh = 160 + r() * 200; const ww = 30 + r() * 40; wrapR(x, ww, w, r(), (xx, r) => { ctx.fillStyle = 'rgba(14,64,80,0.8)'; ctx.fillRect(xx - ww / 2, 520 - hh, ww, hh + 40); poly(ctx, [[xx - ww / 2 - 6, 520 - hh], [xx, 520 - hh - ww * 1.2], [xx + ww / 2 + 6, 520 - hh]]); ctx.fill(); }); }
      haze(ctx, w, h, '#0e4a5a', 0.6, 300);
      ridge(ctx, w, h, 560, 60, 'a4r', '#08303c', { base: 2 });
      for (let i = 0; i < 80; i++) { const x = r() * w; const y = r() * h * 0.8; ctx.strokeStyle = `rgba(200,250,255,${0.1 + r() * 0.25})`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, 1 + r() * 3, 0, TAU); ctx.stroke(); }
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 崩れた塔と門
      for (const x of [180, 820]) wrapR(x, 120, w, r(), (xx, r) => {
        ctx.fillStyle = lg(ctx, xx - 60, 0, xx + 60, 0, [[0, '#0a2a34'], [0.4, '#1e5a66'], [1, '#08202a']]);
        poly(ctx, [[xx - 56, by + 10], [xx - 50, by - 260], [xx - 20, by - 290], [xx + 10, by - 250], [xx + 30, by - 280], [xx + 52, by - 240], [xx + 56, by + 10]]); ctx.fill();
        ctx.fillStyle = '#04141a'; for (let i = 0; i < 3; i++) { roundRect(ctx, xx - 14, by - 220 + i * 70, 28, 40, 14); ctx.fill(); }
      });
      wrapR(500, 160, w, r(), (xx, r) => { ctx.fillStyle = '#123e4a'; ctx.fillRect(xx - 150, by - 180, 34, 200); ctx.fillRect(xx + 116, by - 180, 34, 200); ctx.beginPath(); ctx.moveTo(xx - 150, by - 180); ctx.quadraticCurveTo(xx, by - 300, xx + 150, by - 180); ctx.lineTo(xx + 116, by - 180); ctx.quadraticCurveTo(xx, by - 260, xx - 116, by - 180); ctx.closePath(); ctx.fill(); });
      // 珊瑚
      const coral = (x, s, col) => { ctx.strokeStyle = col; ctx.lineCap = 'round'; const br = (x0, y0, a, l, wd, d) => { const x1 = x0 + Math.cos(a) * l; const y1 = y0 + Math.sin(a) * l; ctx.lineWidth = wd; line(ctx, x0, y0, x1, y1); ctx.stroke(); if (d > 0) { br(x1, y1, a - 0.4 - r() * 0.3, l * 0.7, wd * 0.7, d - 1); br(x1, y1, a + 0.4 + r() * 0.3, l * 0.7, wd * 0.7, d - 1); } }; br(x, by + 6, -Math.PI / 2, s, s * 0.16, 3); };
      for (let i = 0; i < 10; i++) { const x = r() * w; const s = 26 + r() * 30; const col = r() < 0.5 ? '#ff6a7a' : '#ffa050'; wrapR(x, s * 1.5, w, r(), (xx, r) => coral(xx, s, col)); }
      // 海藻
      for (let i = 0; i < 18; i++) { const x = r() * w; const hh = 60 + r() * 120; wrapR(x, 20, w, r(), (xx, r) => { taper(ctx, [[xx, by + 8], [xx + 8, by - hh * 0.3], [xx - 6, by - hh * 0.65], [xx + 4, by - hh]], 7, 1.5); ctx.fillStyle = i % 2 ? '#1a7a5a' : '#2a9a6a'; ctx.fill(); }); }
      band(ctx, w, by - 20, 40, '#3ac0c0', 0.18);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#3a7a7a', '#163a40');
      // 石畳
      ctx.strokeStyle = 'rgba(8,30,34,0.6)'; ctx.lineWidth = 1.4;
      for (let row = 0; row < 8; row++) { const y = 16 + row * 24; line(ctx, 0, y, w, y); ctx.stroke(); for (let x = (row % 2) * 40; x < w; x += 80) { line(ctx, x, y, x + (row - 4) * 2, y + 24); ctx.stroke(); } }
      groundTexture(ctx, w, h, 'a4g', '#06181c', '#6ac0b0', 160);
      for (let i = 0; i < 12; i++) { const x = r() * w; const y = 20 + r() * 140; wrapR(x, 14, w, r(), (xx, r) => { ctx.fillStyle = r() < 0.5 ? '#ff8a6a' : '#ffd0a0'; star(ctx, xx, y, 5, 6, 2.4, r()); ctx.fill(); }); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const x = r() * w; wrapR(x, 120, w, r(), (xx, r) => { ctx.fillStyle = rg(ctx, xx, 40, 0, 120, [[0, 'rgba(150,255,240,0.12)'], [1, 'rgba(150,255,240,0)']]); ctx.fillRect(xx - 120, 0, 240, 120); }); }
      ctx.restore();
    },
  },
  act5: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#0e0404'], [0.35, '#3a0c06'], [0.62, '#8a2a0e'], [0.75, '#e05a18'], [1, '#2a0a04']]);
      clouds(ctx, w, 160, 12, 120, '#2a0e0a', 0.6, 'a5c', 0.25);
      // 火山
      wrapR(820, 380, w, r(), (xx, r) => {
        poly(ctx, [[xx - 380, 520], [xx - 60, 230], [xx + 60, 230], [xx + 380, 520]]); ctx.fillStyle = '#2a0e0a'; ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rg(ctx, xx, 230, 10, 200, [[0, 'rgba(255,140,40,0.9)'], [0.3, 'rgba(255,80,20,0.3)'], [1, 'rgba(255,60,10,0)']]); ctx.fillRect(xx - 200, 30, 400, 400);
        ctx.strokeStyle = 'rgba(255,120,30,0.8)'; ctx.lineWidth = 4; for (const dx of [-30, 18]) { ctx.beginPath(); ctx.moveTo(xx + dx, 236); ctx.quadraticCurveTo(xx + dx * 3, 340, xx + dx * 6, 500); ctx.stroke(); }
        ctx.restore();
      });
      ridge(ctx, w, h, 510, 110, 'a5r1', '#1a0806', { peaky: 0.5 });
      haze(ctx, w, h, '#ff5a1a', 0.3, 380);
      ridge(ctx, w, h, 548, 60, 'a5r2', '#120404', { peaky: 0.4 });
      band(ctx, w, 520, 40, '#ff7a2a', 0.35);
      void r;
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 炉の塔
      for (const x of [260, 900]) wrapR(x, 120, w, r(), (xx, r) => {
        ctx.fillStyle = lg(ctx, xx - 90, 0, xx + 90, 0, [[0, '#0e0606'], [0.4, '#3a1a14'], [1, '#0a0404']]);
        poly(ctx, [[xx - 90, by + 10], [xx - 70, by - 200], [xx - 40, by - 220], [xx - 40, by - 330], [xx - 10, by - 330], [xx - 10, by - 220], [xx + 70, by - 200], [xx + 90, by + 10]]); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,120,30,0.9)'; roundRect(ctx, xx - 30, by - 120, 60, 50, 24); ctx.fill();
        ctx.fillStyle = rg(ctx, xx, by - 95, 0, 110, [[0, 'rgba(255,120,30,0.4)'], [1, 'rgba(255,120,30,0)']]); ctx.fillRect(xx - 110, by - 205, 220, 220);
        ctx.fillStyle = 'rgba(255,200,120,0.8)'; for (let i = 0; i < 3; i++) ctx.fillRect(xx - 50 + i * 40, by - 180, 10, 14);
        ctx.restore();
      });
      // 鎖
      for (let i = 0; i < 6; i++) { const x = r() * w; wrapR(x, 10, w, r(), (xx, r) => chainHang(ctx, xx, 0, 120 + r() * 220, '#1a0c08')); }
      // 黒い岩の尖塔（ひび）
      for (let i = 0; i < 7; i++) { const x = r() * w; const hh = 100 + r() * 160; wrapR(x, 50, w, r(), (xx, r) => {
        poly(ctx, [[xx - 40, by + 10], [xx - 18, by - hh * 0.6], [xx - 4, by - hh], [xx + 14, by - hh * 0.5], [xx + 40, by + 10]]); ctx.fillStyle = '#100606'; ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,110,30,0.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xx - 4, by - hh * 0.8); ctx.lineTo(xx + 4, by - hh * 0.5); ctx.lineTo(xx - 6, by - hh * 0.2); ctx.lineTo(xx + 2, by); ctx.stroke(); ctx.restore();
      }); }
      band(ctx, w, by - 10, 30, '#ff6a1a', 0.3);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#3a1c16', '#160a08');
      groundTexture(ctx, w, h, 'a5g', '#050202', '#5a2a1a', 200);
      // 溶岩のひび
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const x = r() * w; const y = 20 + r() * 150;
        wrapR(x, 90, w, r(), (xx, r) => {
          ctx.strokeStyle = 'rgba(255,90,20,0.9)'; ctx.lineWidth = 2 + r() * 2; ctx.beginPath(); ctx.moveTo(xx - 60, y); let px = xx - 60; let py = y;
          for (let k = 0; k < 6; k++) { px += 16 + r() * 10; py += (r() - 0.5) * 10; ctx.lineTo(px, py); } ctx.stroke();
          ctx.strokeStyle = 'rgba(255,220,120,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
        });
      }
      ctx.restore();
      stones(ctx, w, h, 26, 'a5st', '#2a1612');
    },
  },
  act6: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#120e1c'], [0.35, '#1e2420'], [0.62, '#3a4a26'], [0.75, '#6a8a34'], [1, '#141a0c']]);
      // 大樹の影
      for (let i = 0; i < 9; i++) { const x = r() * w; const ww = 40 + r() * 70; wrapR(x, ww * 2, w, r(), (xx, r) => { ctx.fillStyle = 'rgba(20,28,18,0.85)'; ctx.beginPath(); ctx.moveTo(xx - ww, 560); ctx.quadraticCurveTo(xx - ww * 0.4, 300, xx - ww * 0.3, 0); ctx.lineTo(xx + ww * 0.3, 0); ctx.quadraticCurveTo(xx + ww * 0.4, 300, xx + ww, 560); ctx.fill(); }); }
      haze(ctx, w, h, '#8aaa3a', 0.35, 300);
      band(ctx, w, 380, 60, '#a060d0', 0.15);
      ridge(ctx, w, h, 540, 70, 'a6r', '#141c10', { base: 3 });
      band(ctx, w, 500, 40, '#b0e050', 0.25);
    },
    mid(ctx, w, h, r) {
      const by = 528;
      for (let i = 0; i < 7; i++) { const x = r() * w; const hh = 120 + r() * 200; wrapR(x, hh * 0.6, w, r(), (xx, r) => mushroom(ctx, xx, by + 4, hh, '#3a3428', i % 2 ? '#6a3a8a' : '#4a6a2a', i % 2 ? '#e080ff' : '#c8ff5a', r)); }
      // 蜘蛛の巣
      for (let i = 0; i < 3; i++) { const x = r() * w; const y = 120 + r() * 160; const s = 60 + r() * 50; wrapR(x, s, w, r(), (xx, r) => { ctx.strokeStyle = 'rgba(220,230,210,0.25)'; ctx.lineWidth = 1; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; line(ctx, xx, y, xx + Math.cos(a) * s, y + Math.sin(a) * s); ctx.stroke(); } for (let ring = 1; ring < 5; ring++) { ctx.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k / 8) * TAU; const rr = (s * ring) / 5; if (k) ctx.lineTo(xx + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(xx + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.stroke(); } }); }
      // 根と蔓
      for (let i = 0; i < 8; i++) { const x = r() * w; wrapR(x, 80, w, r(), (xx, r) => { ctx.strokeStyle = '#141a10'; ctx.lineWidth = 8 + r() * 6; ctx.beginPath(); ctx.moveTo(xx - 60, by + 10); ctx.quadraticCurveTo(xx, by - 70 - r() * 50, xx + 70, by + 10); ctx.stroke(); }); }
      for (let i = 0; i < 12; i++) { const x = r() * w; wrapR(x, 10, w, r(), (xx, r) => { ctx.strokeStyle = '#1a2414'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xx, 0); ctx.quadraticCurveTo(xx + 10, 80, xx - 4, 120 + r() * 160); ctx.stroke(); }); }
      band(ctx, w, by - 20, 40, '#a0d040', 0.22);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#3a4224', '#141a0c');
      groundTexture(ctx, w, h, 'a6g', '#06080a', '#6a7a3a', 200);
      ctx.save();
      for (let i = 0; i < 8; i++) { const x = r() * w; const y = 30 + r() * 120; wrapR(x, 70, w, r(), (xx, r) => { ctx.fillStyle = 'rgba(40,70,20,0.85)'; ellipse(ctx, xx, y, 40 + r() * 30, 6 + r() * 4); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(140,255,74,0.22)'; ellipse(ctx, xx, y, 30, 4); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }); }
      ctx.restore();
      for (let i = 0; i < 18; i++) { const x = r() * w; const y = 14 + r() * 140; wrapR(x, 10, w, r(), (xx, r) => { ctx.fillStyle = '#d8d0b0'; ctx.fillRect(xx - 1, y - 6, 2, 6); ctx.fillStyle = r() < 0.5 ? '#b060e0' : '#c8e050'; ellipse(ctx, xx, y - 7, 5, 2.6); ctx.fill(); }); }
      tufts(ctx, w, h, 60, 'a6t', 'rgba(90,120,50,0.8)');
    },
  },
  act7: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#3a4268'], [0.3, '#7a88b0'], [0.58, '#d8d4dc'], [0.7, '#f4e2b0'], [1, '#c8b890']]);
      rays(ctx, w, h * 0.8, 6, '#fff4d0', 0.1, 'a7ray', -60, 0.3);
      // 雷雲
      clouds(ctx, w, 110, 12, 140, '#3a4060', 0.7, 'a7c1', 0.3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,250,200,0.8)'; ctx.lineWidth = 2;
      for (const x0 of [300, 1000]) { ctx.beginPath(); let x = x0; let y = 120; ctx.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 40; y += 26; ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.restore();
      // 浮島と白い城
      for (const [x, s] of [[180, 1], [700, 1.5], [1080, 0.8]]) wrapR(x, 160 * s, w, r(), (xx, r) => {
        ctx.fillStyle = '#a89a88'; poly(ctx, [[xx - 120 * s, 360], [xx + 120 * s, 360], [xx + 60 * s, 400], [xx + 10 * s, 460], [xx - 50 * s, 410]]); ctx.fill();
        ctx.fillStyle = '#e8e4dc'; ctx.fillRect(xx - 90 * s, 360 - 60 * s, 180 * s, 62 * s);
        for (const dx of [-70, 0, 70]) { ctx.fillRect(xx + dx * s - 14 * s, 360 - 130 * s, 28 * s, 130 * s); ctx.fillStyle = '#d2ad55'; poly(ctx, [[xx + dx * s - 18 * s, 360 - 130 * s], [xx + dx * s, 360 - 175 * s], [xx + dx * s + 18 * s, 360 - 130 * s]]); ctx.fill(); ctx.fillStyle = '#e8e4dc'; }
      });
      clouds(ctx, w, 470, 22, 120, '#ffffff', 0.85, 'a7c2', 0.3);
      clouds(ctx, w, 520, 20, 110, '#f0e8d8', 0.9, 'a7c3', 0.25);
      void r;
    },
    mid(ctx, w, h, r) {
      const by = 528;
      for (let i = 0; i < 8; i++) { const x = (i / 8) * w + r() * 60; const hh = 160 + r() * 140; wrapR(x, 40, w, r(), (xx, r) => column(ctx, xx, by + 4, 30, hh, '#a8a296', '#ece6dc', r() < 0.5, r)); }
      wrapR(520, 200, w, r(), (xx, r) => { ctx.fillStyle = '#b4ac9e'; ctx.fillRect(xx - 180, by - 240, 40, 260); ctx.fillRect(xx + 140, by - 240, 40, 260); ctx.beginPath(); ctx.moveTo(xx - 180, by - 240); ctx.quadraticCurveTo(xx, by - 380, xx + 180, by - 240); ctx.lineTo(xx + 140, by - 240); ctx.quadraticCurveTo(xx, by - 330, xx - 140, by - 240); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#d2ad55'; ctx.lineWidth = 3; ctx.stroke(); });
      // 旗
      for (let i = 0; i < 4; i++) { const x = r() * w; wrapR(x, 30, w, r(), (xx, r) => { ctx.fillStyle = '#e8dcb0'; ctx.fillRect(xx - 1.5, by - 200, 3, 210); ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.moveTo(xx + 1, by - 196); ctx.quadraticCurveTo(xx + 30, by - 186, xx + 46, by - 196); ctx.lineTo(xx + 40, by - 150); ctx.quadraticCurveTo(xx + 24, by - 140, xx + 1, by - 150); ctx.fill(); }); }
      haze(ctx, w, h, '#e8e0d0', 0.12, 300);
      band(ctx, w, by - 10, 40, '#ffffff', 0.3);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#cfc6b6', '#8a806e');
      ctx.strokeStyle = 'rgba(120,108,90,0.5)'; ctx.lineWidth = 1.2;
      for (let row = 0; row < 7; row++) { const y = 16 + row * 28; line(ctx, 0, y, w, y); ctx.stroke(); for (let x = (row % 2) * 64; x < w; x += 128) { line(ctx, x, y, x, y + 28); ctx.stroke(); } }
      ctx.strokeStyle = 'rgba(210,173,85,0.7)'; ctx.lineWidth = 2; line(ctx, 0, 44, w, 44); ctx.stroke();
      groundTexture(ctx, w, h, 'a7g', '#8a8070', '#ffffff', 150);
      for (let i = 0; i < 10; i++) { const x = r() * w; const y = 20 + r() * 140; wrapR(x, 40, w, r(), (xx, r) => { ctx.strokeStyle = 'rgba(80,70,60,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + 12, y + 6); ctx.lineTo(xx + 20, y + 2); ctx.lineTo(xx + 34, y + 9); ctx.stroke(); }); }
      clouds(ctx, w, 170, 18, 50, '#ffffff', 0.4, 'a7gc', 0.3);
    },
  },
  act8: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#120c08'], [0.4, '#2e2014'], [0.7, '#5a3e22'], [1, '#1a120a']]);
      // 巨大な歯車
      for (const [x, y, s, t] of [[160, 220, 170, 18], [520, 120, 110, 12], [880, 260, 210, 22], [1180, 140, 90, 10]]) wrapR(x, s * 1.2, w, r(), (xx, r) => gearSil(ctx, xx, y, s, t, 'rgba(60,40,22,0.85)'));
      // 時計
      wrapR(640, 160, w, r(), (xx, r) => { ctx.fillStyle = 'rgba(90,64,34,0.9)'; ctx.beginPath(); ctx.arc(xx, 300, 140, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(200,154,90,0.6)'; ctx.lineWidth = 6; ctx.stroke(); ctx.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(ctx, xx + Math.cos(a) * 112, 300 + Math.sin(a) * 112, xx + Math.cos(a) * 130, 300 + Math.sin(a) * 130); ctx.stroke(); } ctx.lineWidth = 6; line(ctx, xx, 300, xx + 70, 260); ctx.stroke(); line(ctx, xx, 300, xx - 20, 200); ctx.stroke(); });
      haze(ctx, w, h, '#c89a5a', 0.3, 260);
      clouds(ctx, w, 470, 16, 90, '#d8c0a0', 0.25, 'a8s', 0.3);
      void r;
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 管
      for (let i = 0; i < 4; i++) { const y = 120 + i * 90 + r() * 30; const thick = 14 + r() * 14; ctx.fillStyle = lg(ctx, 0, y - thick, 0, y + thick, [[0, '#2a1a0e'], [0.35, '#9a6a3c'], [0.6, '#6a4424'], [1, '#1e1208']]); ctx.fillRect(0, y - thick, w, thick * 2); for (let x = r() * 200; x < w; x += 160 + r() * 120) { ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x, y - thick - 3, 12, thick * 2 + 6); } }
      for (let i = 0; i < 6; i++) { const x = r() * w; const thick = 12 + r() * 10; wrapR(x, thick, w, r(), (xx, r) => { ctx.fillStyle = lg(ctx, xx - thick, 0, xx + thick, 0, [[0, '#1e1208'], [0.4, '#9a6a3c'], [1, '#1e1208']]); ctx.fillRect(xx - thick, 0, thick * 2, by + 10); }); }
      for (let i = 0; i < 6; i++) { const x = r() * w; const s = 40 + r() * 60; wrapR(x, s * 1.2, w, r(), (xx, r) => gearSil(ctx, xx, by - s * 0.6 - r() * 120, s, 10 + Math.round(s / 10), '#3a2614')); }
      // 計器の光
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const x = r() * w; const y = 200 + r() * 260; wrapR(x, 30, w, r(), (xx, r) => { ctx.fillStyle = rg(ctx, xx, y, 0, 26, [[0, 'rgba(255,200,90,0.6)'], [1, 'rgba(255,200,90,0)']]); ctx.fillRect(xx - 26, y - 26, 52, 52); }); }
      ctx.restore();
      // 手すり
      ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 4; line(ctx, 0, by - 60, w, by - 60); ctx.stroke(); for (let x = 0; x < w; x += 40) { line(ctx, x, by - 60, x, by + 10); ctx.stroke(); }
      band(ctx, w, by - 20, 40, '#e8c890', 0.2);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#5a4430', '#1e140c');
      // 格子
      ctx.strokeStyle = 'rgba(10,6,2,0.65)'; ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 16) { line(ctx, x, 14, x - 20, h); ctx.stroke(); }
      for (let y = 22; y < h; y += 14) { line(ctx, 0, y, w, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(200,150,90,0.18)'; ctx.lineWidth = 1; for (let y = 21; y < h; y += 14) { line(ctx, 0, y, w, y); ctx.stroke(); }
      // 板と鋲
      for (let i = 0; i < 8; i++) { const x = r() * w; const y = 20 + r() * 120; wrapR(x, 60, w, r(), (xx, r) => { ctx.fillStyle = 'rgba(110,80,48,0.85)'; ctx.fillRect(xx - 50, y, 100, 30); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(xx - 50, y, 100, 30); ctx.fillStyle = '#d8b07a'; for (const [dx, dy] of [[-44, 5], [44, 5], [-44, 25], [44, 25]]) { ellipse(ctx, xx + dx, y + dy, 2, 2); ctx.fill(); } }); }
      groundTexture(ctx, w, h, 'a8g', '#000000', '#c89a5a', 120);
    },
  },
  act9: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#040108'], [0.4, '#140828'], [0.7, '#2e1450'], [1, '#0a0414']]);
      stars(ctx, w, h, 260, 'a9s', '#e8d8ff');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      clouds(ctx, w, 260, 10, 180, '#8a3ad0', 0.18, 'a9n1', 0.4);
      clouds(ctx, w, 340, 8, 140, '#ff5ab0', 0.1, 'a9n2', 0.35);
      // 渦
      wrapR(900, 220, w, r(), (xx, r) => { for (let i = 0; i < 40; i++) { const a = i * 0.5; const rr = 8 + i * 4.6; ctx.strokeStyle = `rgba(200,150,255,${0.5 - i * 0.011})`; ctx.lineWidth = 3 - i * 0.05; ctx.beginPath(); ctx.arc(xx, 240, rr, a, a + 1.4); ctx.stroke(); } ctx.fillStyle = rg(ctx, xx, 240, 0, 70, [[0, 'rgba(255,240,255,0.9)'], [0.3, 'rgba(200,120,255,0.4)'], [1, 'rgba(120,40,200,0)']]); ctx.fillRect(xx - 70, 170, 140, 140); });
      ctx.restore();
      // 浮く岩
      for (let i = 0; i < 7; i++) { const x = r() * w; const y = 200 + r() * 260; const s = 20 + r() * 50; wrapR(x, s * 1.5, w, r(), (xx, r) => { ctx.fillStyle = '#1a0e2a'; poly(ctx, [[xx - s, y], [xx + s, y - s * 0.1], [xx + s * 0.5, y + s * 0.5], [xx, y + s], [xx - s * 0.5, y + s * 0.4]]); ctx.fill(); ctx.fillStyle = 'rgba(160,112,255,0.5)'; ctx.fillRect(xx - s, y - 2, s * 2, 2); }); }
      ridge(ctx, w, h, 560, 80, 'a9r', '#120824', { peaky: 0.6 });
      band(ctx, w, 520, 40, '#a070ff', 0.25);
    },
    mid(ctx, w, h, r) {
      const by = 528;
      for (let i = 0; i < 10; i++) { const x = r() * w; const hh = 80 + r() * 220; wrapR(x, hh * 0.3, w, r(), (xx, r) => { crystalSpike(ctx, xx, by + 6, hh, '#5a2aa0', '#e0c8ff', 0.18); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg(ctx, xx, by - hh * 0.5, 0, hh * 0.4, [[0, 'rgba(170,110,255,0.25)'], [1, 'rgba(170,110,255,0)']]); ctx.fillRect(xx - hh * 0.4, by - hh * 0.9, hh * 0.8, hh * 0.8); ctx.restore(); }); }
      for (let i = 0; i < 5; i++) { const x = r() * w; const y = 120 + r() * 200; const s = 40 + r() * 50; wrapR(x, s * 1.4, w, r(), (xx, r) => { ctx.fillStyle = '#100820'; poly(ctx, [[xx - s, y], [xx - s * 0.4, y - s * 0.4], [xx + s * 0.6, y - s * 0.3], [xx + s, y], [xx + s * 0.3, y + s * 0.8], [xx - s * 0.3, y + s * 1.1]]); ctx.fill(); crystalSpike(ctx, xx, y + s * 1.2, s * 0.6, '#5a2aa0', '#e0c8ff'); }); }
      // 崩れた階段
      wrapR(300, 120, w, r(), (xx, r) => { ctx.fillStyle = '#1a102a'; for (let i = 0; i < 6; i++) ctx.fillRect(xx - 100 + i * 30, by - 20 - i * 26, 60, 18); });
      band(ctx, w, by - 20, 40, '#c090ff', 0.2);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#2e1e44', '#0c0618');
      groundTexture(ctx, w, h, 'a9g', '#000000', '#7a5aa8', 180);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) { const x = r() * w; const y = 20 + r() * 150; wrapR(x, 80, w, r(), (xx, r) => { ctx.strokeStyle = 'rgba(180,120,255,0.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(xx - 50, y); let px = xx - 50; let py = y; for (let k = 0; k < 5; k++) { px += 18 + r() * 8; py += (r() - 0.5) * 12; ctx.lineTo(px, py); } ctx.stroke(); }); }
      ctx.restore();
      for (let i = 0; i < 16; i++) { const x = r() * w; const y = 16 + r() * 140; wrapR(x, 10, w, r(), (xx, r) => crystalSpike(ctx, xx, y, 10 + r() * 14, '#6a3ab0', '#f0e0ff', 0.25)); }
    },
  },
  act10: {
    far(ctx, w, h, r) {
      sky(ctx, w, h, [[0, '#0a0104'], [0.35, '#3a0408'], [0.62, '#8a1008'], [0.76, '#ff4a1a'], [1, '#200404']]);
      clouds(ctx, w, 140, 14, 130, '#1a0206', 0.7, 'a10c', 0.3);
      // 地獄の城と玉座
      wrapR(640, 420, w, r(), (xx, r) => {
        ctx.fillStyle = '#140204';
        ctx.fillRect(xx - 380, 380, 760, 200);
        for (const [dx, hh, ww] of [[-340, 180, 50], [-230, 250, 60], [-110, 200, 46], [110, 200, 46], [230, 250, 60], [340, 180, 50]]) { ctx.fillRect(xx + dx - ww / 2, 380 - hh, ww, hh + 10); poly(ctx, [[xx + dx - ww / 2 - 8, 380 - hh], [xx + dx, 380 - hh - ww * 1.6], [xx + dx + ww / 2 + 8, 380 - hh]]); ctx.fill(); }
        // 玉座
        ctx.fillRect(xx - 70, 140, 140, 260); poly(ctx, [[xx - 90, 150], [xx - 50, 60], [xx, 110], [xx + 50, 60], [xx + 90, 150]]); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg(ctx, xx, 220, 0, 160, [[0, 'rgba(255,60,40,0.45)'], [1, 'rgba(255,60,40,0)']]); ctx.fillRect(xx - 160, 60, 320, 320); ctx.fillStyle = 'rgba(255,90,40,0.85)'; for (const dx of [-230, -110, 110, 230]) ctx.fillRect(xx + dx - 4, 260, 8, 16); ctx.restore();
      });
      haze(ctx, w, h, '#ff3a1a', 0.35, 380);
      ridge(ctx, w, h, 556, 70, 'a10r', '#100204', { peaky: 0.5 });
      band(ctx, w, 520, 40, '#ff4a1a', 0.35);
      void r;
    },
    mid(ctx, w, h, r) {
      const by = 528;
      // 骨の柱
      for (let i = 0; i < 6; i++) { const x = (i / 6) * w + r() * 80; const hh = 180 + r() * 160; wrapR(x, 40, w, r(), (xx, r) => {
        ctx.fillStyle = lg(ctx, xx - 22, 0, xx + 22, 0, [[0, '#4a3a2a'], [0.4, '#d8c8a8'], [1, '#3a2a1a']]);
        for (let k = 0; k < hh / 22; k++) { ellipse(ctx, xx, by - k * 22, 20, 12); ctx.fill(); }
        ctx.fillStyle = '#e8dcc0'; ellipse(ctx, xx, by - hh - 6, 22, 20); ctx.fill(); ctx.fillStyle = '#1a0404'; ellipse(ctx, xx - 7, by - hh - 6, 5, 6); ctx.fill(); ellipse(ctx, xx + 7, by - hh - 6, 5, 6); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,60,40,0.8)'; ellipse(ctx, xx - 7, by - hh - 5, 2, 2.4); ctx.fill(); ellipse(ctx, xx + 7, by - hh - 5, 2, 2.4); ctx.fill(); ctx.restore();
      }); }
      // 棘の柵
      for (let i = 0; i < 4; i++) { const x = r() * w; wrapR(x, 120, w, r(), (xx, r) => { ctx.fillStyle = '#120204'; ctx.fillRect(xx - 110, by - 50, 220, 6); for (let k = 0; k < 11; k++) poly(ctx, [[xx - 110 + k * 22 - 4, by + 10], [xx - 110 + k * 22, by - 90 - (k % 2) * 20], [xx - 110 + k * 22 + 4, by + 10]]), ctx.fill(); }); }
      for (let i = 0; i < 5; i++) { const x = r() * w; wrapR(x, 50, w, r(), (xx, r) => skullPile(ctx, xx, by + 6, 26 + r() * 10, '#c8b898', r)); }
      for (let i = 0; i < 5; i++) { const x = r() * w; wrapR(x, 10, w, r(), (xx, r) => chainHang(ctx, xx, 0, 100 + r() * 200, '#1a0606')); }
      // 破れた旗
      for (let i = 0; i < 3; i++) { const x = r() * w; wrapR(x, 40, w, r(), (xx, r) => { ctx.fillStyle = '#100204'; ctx.fillRect(xx - 2, by - 240, 4, 250); ctx.fillStyle = '#6a0a10'; poly(ctx, [[xx + 2, by - 236], [xx + 50, by - 230], [xx + 46, by - 170], [xx + 36, by - 180], [xx + 28, by - 160], [xx + 18, by - 176], [xx + 2, by - 168]]); ctx.fill(); }); }
      band(ctx, w, by - 10, 30, '#ff3a1a', 0.3);
    },
    ground(ctx, w, h, r) {
      groundTop(ctx, w, h, '#3a0e0c', '#140404');
      groundTexture(ctx, w, h, 'a10g', '#000000', '#6a1a14', 200);
      // 血の川
      for (let k = 0; k < 2; k++) {
        const y = 60 + k * 70; const ph = r() * TAU;
        ctx.fillStyle = 'rgba(120,8,18,0.9)'; ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x / w) * TAU * 3 + ph) * 8);
        for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, y + 14 + Math.sin((x / w) * TAU * 3 + ph + 1) * 6);
        ctx.closePath(); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,80,80,0.3)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + 4 + Math.sin((x / w) * TAU * 3 + ph) * 8; if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); } ctx.stroke(); ctx.restore();
      }
      stones(ctx, w, h, 20, 'a10st', '#3a1410');
      for (let i = 0; i < 8; i++) { const x = r() * w; const y = 20 + r() * 150; wrapR(x, 20, w, r(), (xx, r) => { ctx.fillStyle = '#d8c8a8'; ctx.save(); ctx.translate(xx, y); ctx.rotate(r() * 3); roundRect(ctx, -9, -1.4, 18, 2.8, 1.4); ctx.fill(); ctx.restore(); }); }
    },
  },
};

/** 背景の painter（bg.<act> / bg.<act>.mid / bg.<act>.ground） */
export function paintBackground(ctx, spec, w, h) {
  const p = spec.params || {};
  const parts = spec.id.split('.');
  const act = p.act || parts[1];
  const layerId = p.layer || (parts[2] === 'mid' ? 'mid' : parts[2] === 'ground' ? 'ground' : 'far');
  const A = ACT[act] || ACT.act1;
  const r = rng(`${act}:${layerId}`);
  ctx.save();
  // 枠の幅が 1280 でないときも、1280 の絵を引き伸ばす（継ぎ目は保つ）
  if (w !== W0) ctx.scale(w / W0, 1);
  const fn = A[layerId] || A.far;
  fn(ctx, W0, h, r);
  ctx.restore();
}

/** 章ごとの空気（scene が粒を出すのに使う） */
export const ACT_ATMOS = {
  act1: { kind: 'ash', col: '#c8c0c0', n: 50, fog: '#6a5050' },
  act2: { kind: 'sand', col: '#ffc890', n: 70, fog: '#ffb070' },
  act3: { kind: 'snow', col: '#ffffff', n: 80, fog: '#c8e0f8' },
  act4: { kind: 'bubble', col: '#c8fff8', n: 40, fog: '#3ac0c0' },
  act5: { kind: 'ember', col: '#ff8a2a', n: 60, fog: '#ff5a1a' },
  act6: { kind: 'spore', col: '#c8ff6a', n: 50, fog: '#90c040' },
  act7: { kind: 'cloud', col: '#ffffff', n: 24, fog: '#ffffff' },
  act8: { kind: 'steam', col: '#e8d8c0', n: 26, fog: '#d8b080' },
  act9: { kind: 'star', col: '#d8b8ff', n: 60, fog: '#a070ff' },
  act10: { kind: 'blood', col: '#ff4a2a', n: 60, fog: '#ff3a1a' },
};
void mix; void star;
