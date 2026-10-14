// 画面の飾り: タイトルロゴ（ui.logo）とタイトル画面の背景（ui.title）。

import { TAU, rgba, shade, lg, rg, ellipse, blob, poly, glow, rng, waveTable, star, line } from './util.js';

const FONT = '"Shippori Mincho B1", "Cinzel", "Trajan Pro", Georgia, "Times New Roman", serif';

/** ロゴ: 金属の文字・赤い光・ひび・「O」は深淵の雫 */
export function paintLogo(ctx, spec, w, h) {
  const cx = w / 2; const cy = h * 0.5;
  const size = Math.round(h * 0.46);
  ctx.save();
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const gap = size * 0.34;
  const parts = ['ABYSS', 'DR', 'P'];
  const wA = ctx.measureText(parts[0]).width; const wD = ctx.measureText(parts[1]).width; const wP = ctx.measureText(parts[2]).width;
  const oW = size * 0.72;
  const total = wA + gap + wD + oW + wP;
  const sc = Math.min(1, (w * 0.92) / total);
  ctx.translate(cx, cy + size * 0.33 * sc);
  ctx.scale(sc, sc);
  let x = -total / 2;
  const base = 0;
  // 背の光
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(0, -size * 0.35); ctx.scale(1, 0.32);
  ctx.fillStyle = rg(ctx, 0, 0, 10, total * 0.62, [[0, 'rgba(255,60,40,0.42)'], [0.5, 'rgba(160,20,30,0.14)'], [1, 'rgba(0,0,0,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, total * 0.62, 0, TAU); ctx.fill();
  ctx.restore();
  const drawWord = (t, px) => {
    // 影と縁
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillText(t, px + 3, base + 6); ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = '#120608'; ctx.strokeText(t, px, base);
    ctx.lineWidth = size * 0.05; ctx.strokeStyle = lg(ctx, 0, -size, 0, 0, [[0, '#6a1a14'], [1, '#2a0606']]); ctx.strokeText(t, px, base);
    // 金属の面
    ctx.fillStyle = lg(ctx, 0, -size * 0.78, 0, size * 0.05, [[0, '#fff4d8'], [0.25, '#e8c070'], [0.48, '#8a5a24'], [0.52, '#f0d090'], [0.8, '#b07a34'], [1, '#5a2e10']]);
    ctx.fillText(t, px, base);
    // 上のつや
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.0)';
    ctx.restore();
  };
  drawWord(parts[0], x);
  x += wA + gap;
  drawWord(parts[1], x);
  x += wD;
  // 「O」= 深淵の雫（中に赤い渦）
  const ox = x + oW / 2; const oy = base - size * 0.36;
  const R = size * 0.34;
  const drop = () => { ctx.beginPath(); ctx.moveTo(ox, oy - R * 1.45); ctx.bezierCurveTo(ox + R * 0.5, oy - R * 0.8, ox + R, oy - R * 0.2, ox + R, oy + R * 0.25); ctx.arc(ox, oy + R * 0.25, R, 0, Math.PI); ctx.bezierCurveTo(ox - R, oy - R * 0.2, ox - R * 0.5, oy - R * 0.8, ox, oy - R * 1.45); ctx.closePath(); };
  ctx.save(); ctx.translate(3, 6); drop(); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fill(); ctx.restore();
  drop(); ctx.lineWidth = size * 0.1; ctx.strokeStyle = '#120608'; ctx.stroke();
  drop(); ctx.fillStyle = rg(ctx, ox, oy + R * 0.3, 0, R * 1.3, [[0, '#ffd0a0'], [0.18, '#ff4a2a'], [0.5, '#7a0a18'], [1, '#14020a']]); ctx.fill();
  ctx.save(); drop(); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) { const a = i * 0.55; const rr = R * 0.08 + i * R * 0.045; ctx.strokeStyle = `rgba(255,${120 + i * 4},${80 + i * 3},${0.55 - i * 0.02})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy + R * 0.3, rr, a, a + 1.6); ctx.stroke(); }
  glow(ctx, ox, oy + R * 0.3, R * 0.5, '#ffd0a0', 0.9);
  ctx.restore();
  drop(); ctx.lineWidth = size * 0.04; ctx.strokeStyle = lg(ctx, 0, oy - R * 1.4, 0, oy + R * 1.3, [[0, '#fff0c8'], [0.5, '#c08a3a'], [1, '#5a2e10']]); ctx.stroke();
  x += oW;
  drawWord(parts[2], x);
  // ひび
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  ctx.restore();
  const r = rng('logo');
  ctx.strokeStyle = 'rgba(30,6,6,0.85)'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { let px = -total / 2 + r() * total; let py = -size * (0.2 + r() * 0.5); ctx.beginPath(); ctx.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 18; py += 8 + r() * 10; ctx.lineTo(px, py); } ctx.stroke(); }
  // 下の飾り（剣の線）
  const ly = base + size * 0.22;
  ctx.strokeStyle = lg(ctx, -total / 2, 0, total / 2, 0, [[0, 'rgba(232,192,112,0)'], [0.2, '#e8c070'], [0.5, '#fff0c8'], [0.8, '#e8c070'], [1, 'rgba(232,192,112,0)']]);
  ctx.lineWidth = 3; line(ctx, -total / 2, ly, total / 2, ly); ctx.stroke();
  ctx.fillStyle = '#e8c070'; poly(ctx, [[0, ly - 9], [11, ly], [0, ly + 9], [-11, ly]]); ctx.fill();
  ctx.fillStyle = '#ff4a2a'; poly(ctx, [[0, ly - 4], [5, ly], [0, ly + 4], [-5, ly]]); ctx.fill();
  for (const s of [-1, 1]) { ctx.fillStyle = '#e8c070'; poly(ctx, [[s * total * 0.3, ly - 4], [s * total * 0.3 + s * 8, ly], [s * total * 0.3, ly + 4]]); ctx.fill(); }
  // 火の粉
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) { const px = (r() - 0.5) * total * 1.05; const py = -size * (r() * 1.1) + size * 0.1; ctx.fillStyle = rgba(r() < 0.5 ? '#ff8a3a' : '#ffd080', 0.5 + r() * 0.5); ctx.beginPath(); ctx.arc(px, py, 0.8 + r() * 2, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.restore();
}

/** タイトル画面の背景: 崖のあいだに口を開けた深淵、赤い月、灰 */
export function paintTitle(ctx, spec, w, h) {
  const r = rng('title');
  ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, '#07050c'], [0.35, '#1a0e1c'], [0.62, '#3a1420'], [1, '#08040a']]); ctx.fillRect(0, 0, w, h);
  // 星
  for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(230,210,220,${0.15 + r() * 0.6})`; ctx.beginPath(); ctx.arc(r() * w, r() * h * 0.5, 0.4 + r() * 1.2, 0, TAU); ctx.fill(); }
  // 赤い月
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rg(ctx, w * 0.72, h * 0.22, 30, 320, [[0, 'rgba(255,80,60,0.45)'], [1, 'rgba(255,40,40,0)']]); ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.fillStyle = rg(ctx, w * 0.71, h * 0.21, 10, 70, [[0, '#ff9a7a'], [0.7, '#c03a2a'], [1, '#7a1a14']]); ctx.beginPath(); ctx.arc(w * 0.72, h * 0.22, 66, 0, TAU); ctx.fill();
  // 雲
  for (let i = 0; i < 18; i++) { const x = r() * w; const y = h * (0.15 + r() * 0.3); const s = 80 + r() * 140; ctx.fillStyle = rg(ctx, x, y, 0, s, [[0, 'rgba(60,30,40,0.45)'], [1, 'rgba(60,30,40,0)']]); ellipse(ctx, x, y, s, s * 0.3); ctx.fill(); }
  // 深淵の光（下から）
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rg(ctx, w * 0.5, h * 1.02, 10, h * 0.75, [[0, 'rgba(255,120,60,0.95)'], [0.25, 'rgba(220,40,50,0.5)'], [0.6, 'rgba(120,20,80,0.2)'], [1, 'rgba(60,0,60,0)']]); ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) { const x0 = w * (0.42 + r() * 0.16); const ww = 20 + r() * 50; ctx.fillStyle = lg(ctx, 0, h, 0, h * 0.2, [[0, 'rgba(255,140,90,0.22)'], [1, 'rgba(255,140,90,0)']]); poly(ctx, [[x0, h], [x0 + ww, h], [x0 + ww + (r() - 0.5) * 300, h * 0.1], [x0 + (r() - 0.5) * 300, h * 0.1]]); ctx.fill(); }
  ctx.restore();
  // 崖（左右）
  const f = waveTable(w, 'tcliff', 4, 3, 4);
  for (const side of [-1, 1]) {
    ctx.fillStyle = lg(ctx, 0, h * 0.45, 0, h, [[0, '#1a0e14'], [1, '#050206']]);
    ctx.beginPath();
    const edge = side < 0 ? w * 0.36 : w * 0.64;
    if (side < 0) { ctx.moveTo(0, h); ctx.lineTo(0, h * 0.58); for (let x = 0; x <= edge; x += 6) ctx.lineTo(x, h * 0.6 - f(x) * 30 + (x / edge) ** 6 * 20); ctx.lineTo(edge, h * 0.66); ctx.lineTo(edge - 40, h * 0.8); ctx.lineTo(edge - 10, h); }
    else { ctx.moveTo(w, h); ctx.lineTo(w, h * 0.56); for (let x = w; x >= edge; x -= 6) ctx.lineTo(x, h * 0.58 - f(x) * 34 + ((w - x) / (w - edge)) ** 6 * 20); ctx.lineTo(edge, h * 0.64); ctx.lineTo(edge + 50, h * 0.82); ctx.lineTo(edge + 20, h); }
    ctx.closePath(); ctx.fill();
    // 縁の光
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,90,60,0.35)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  // 崩れた柱
  for (const [x, hh] of [[w * 0.08, 200], [w * 0.2, 140], [w * 0.86, 230], [w * 0.95, 120]]) {
    ctx.fillStyle = '#100810'; ctx.fillRect(x - 16, h * 0.6 - hh, 32, hh + 30);
    poly(ctx, [[x - 16, h * 0.6 - hh], [x - 4, h * 0.6 - hh - 18], [x + 8, h * 0.6 - hh - 6], [x + 16, h * 0.6 - hh - 14], [x + 16, h * 0.6 - hh]]); ctx.fill();
  }
  // 崖の縁に立つ影（剣を持った主人公）
  const hx = w * 0.345; const hy = h * 0.6 + 4;
  ctx.fillStyle = '#050206';
  ctx.beginPath(); ctx.ellipse(hx, hy - 52, 7, 8, 0, 0, TAU); ctx.fill();
  poly(ctx, [[hx - 10, hy - 44], [hx + 9, hy - 44], [hx + 7, hy - 16], [hx + 10, hy], [hx + 3, hy], [hx, hy - 14], [hx - 3, hy], [hx - 10, hy], [hx - 7, hy - 16]]); ctx.fill();
  poly(ctx, [[hx - 9, hy - 42], [hx - 26, hy - 10], [hx - 18, hy - 6], [hx - 6, hy - 28]]); ctx.fill(); // マント
  ctx.strokeStyle = '#050206'; ctx.lineWidth = 2.5; line(ctx, hx + 8, hy - 30, hx + 20, hy - 76); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,140,100,0.6)'; ctx.lineWidth = 1; line(ctx, hx + 9, hy - 34, hx + 20, hy - 76); ctx.stroke(); ctx.restore();
  // 鳥
  ctx.strokeStyle = '#0a0408'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) { const x = w * (0.55 + r() * 0.3); const y = h * (0.12 + r() * 0.2); const s = 4 + r() * 5; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y); ctx.stroke(); }
  // 灰と火の粉
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 160; i++) { const x = r() * w; const y = r() * h; const ember = r() < 0.35; ctx.fillStyle = ember ? `rgba(255,${120 + r() * 80},60,${0.3 + r() * 0.6})` : `rgba(200,190,200,${0.08 + r() * 0.15})`; ctx.beginPath(); ctx.arc(x, y, ember ? 0.8 + r() * 1.6 : 0.6 + r() * 1.4, 0, TAU); ctx.fill(); }
  ctx.restore();
  // 縁を暗く
  ctx.fillStyle = rg(ctx, w / 2, h * 0.55, h * 0.3, w * 0.75, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.75)']]); ctx.fillRect(0, 0, w, h);
  void shade; void blob; void star;
}

/** そのほかの画面の飾り（ui.*）: 枠・帯・紋章。ID の言葉で形を決める */
const RAR = { common: '#c8c8c8', magic: '#5aa0ff', rare: '#ffe25a', epic: '#c56bff', legendary: '#ff9a2e', set: '#3dff7a', unique: '#e8b56b', mythic: '#ff4d6d' };
export function paintUiMisc(ctx, spec, w, h) {
  const id = spec.id;
  const key = Object.keys(RAR).find((k) => id.includes(k));
  const col = spec.params?.color || RAR[key] || '#d2ad55';
  if (/frame|border|card|slot/.test(id)) {
    const r = Math.min(w, h) * 0.12;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 5; roundRect2(ctx, 4, 4, w - 8, h - 8, r); ctx.stroke();
    ctx.strokeStyle = lg(ctx, 0, 0, 0, h, [[0, shade(col, 0.45)], [0.5, col], [1, shade(col, -0.4)]]); ctx.lineWidth = 3; roundRect2(ctx, 4, 4, w - 8, h - 8, r); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1; roundRect2(ctx, 9, 9, w - 18, h - 18, r * 0.7); ctx.stroke();
    for (const [x, y] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]]) { ctx.fillStyle = col; star(ctx, x, y, 4, Math.min(w, h) * 0.06, 1.5); ctx.fill(); }
    ctx.restore();
    return;
  }
  if (/beam|pillar|ray/.test(id)) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, rgba(col, 0)], [0.6, rgba(col, 0.5)], [1, rgba(col, 0.95)]]); ctx.fillRect(w * 0.3, 0, w * 0.4, h);
    ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.8)']]); ctx.fillRect(w * 0.46, 0, w * 0.08, h);
    ctx.restore();
    return;
  }
  // 紋章
  const s = Math.min(w, h);
  ctx.save(); ctx.translate(w / 2, h / 2);
  glow(ctx, 0, 0, s * 0.48, col, 0.35);
  ctx.strokeStyle = col; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, TAU); ctx.stroke();
  ctx.fillStyle = rgba(col, 0.9); star(ctx, 0, 0, 6, s * 0.28, s * 0.1); ctx.fill();
  ctx.restore();
}
function roundRect2(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
