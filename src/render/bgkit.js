// 背景用の共通部品（シルエット・ネオン文字など）
import { shade, rgba, OUTLINE } from './util.js';

export const PI = Math.PI;
export const LW = 1024; // レイヤーのタイル幅
/** タイル幅で折り返して描く */
export function wrap(x, w, fn) { fn(x); if (x + w > LW) fn(x - LW); if (x < 0) fn(x + LW); }
export function oFill(ctx, col, lw = 2) { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }
export const NEON_COLS = ['#ff2e88', '#00f0ff', '#b45cff', '#ffc93c', '#7cff6a'];

export function neonText(ctx, x, y, text, col, on, size) {
  ctx.save();
  ctx.font = `900 ${size}px "Arial Black", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (on > 0.5) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.25); ctx.lineWidth = 10; ctx.strokeText(text, x, y);
    ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 5; ctx.strokeText(text, x, y);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = on > 0.5 ? 1 : 0.45;
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.strokeText(text, x, y);
  ctx.fillStyle = on > 0.5 ? '#ffffff' : shade(col, -0.5); ctx.fillText(text, x, y);
  ctx.restore();
}

export function palmSil(g, x, base, h, lean, col) {
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = 7;
  const tx = x + lean * h * 0.25, ty = base - h;
  g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * h * 0.05, base - h * 0.6, tx, ty); g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -PI + (i / 6) * PI + (i % 2 ? 0.15 : -0.1);
    const len = h * 0.42;
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.5 + len * 0.35;
    g.beginPath(); g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.6 - 10, ex, ey);
    g.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.6 - 2, tx, ty + 4);
    g.fill();
  }
}

export function cypress(g, x, base, h, col, R) {
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 5;
  g.beginPath(); g.moveTo(x, base); g.lineTo(x + 2, base - h); g.stroke();
  for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + (R() - 0.5) * 30, base - h + k * h * 0.18, 26 - k * 2, 12, 0, 0, PI * 2); g.fill(); }
  g.lineWidth = 1; g.beginPath(); for (let k = 0; k < 5; k++) { const sx = x - 20 + k * 10; g.moveTo(sx, base - h + 20); g.lineTo(sx + 1, base - h + 50 + R() * 30); } g.stroke();
}
export function mangroveSil(g, x, base, h, col, R) {
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = 8; g.beginPath(); g.moveTo(x, base - 50); g.quadraticCurveTo(x - 6, base - h * 0.6, x + 4, base - h); g.stroke();
  g.lineWidth = 3;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x, base - 50); g.quadraticCurveTo(x + k * 14, base - 60, x + k * 18, base); g.stroke(); }
  for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + (R() - 0.5) * 120, base - h + R() * 60, 40 + R() * 20, 20 + R() * 10, 0, 0, PI * 2); g.fill(); }
  g.lineWidth = 1.2; g.beginPath(); for (let k = 0; k < 8; k++) { const sx = x - 60 + R() * 120; const sy = base - h + 30 + R() * 40; g.moveTo(sx, sy); g.lineTo(sx, sy + 30 + R() * 40); } g.stroke();
}

/** 丸い樹冠の木 */
export function treeSil(g, x, base, h, col, R, hi) {
  g.fillStyle = col; g.strokeStyle = col;
  g.lineWidth = Math.max(4, h * 0.06);
  g.beginPath(); g.moveTo(x, base); g.lineTo(x + 2, base - h * 0.55); g.stroke();
  const blobs = [[0, -0.72, 0.3], [-0.22, -0.6, 0.24], [0.22, -0.62, 0.25], [0.05, -0.9, 0.22]];
  for (const [bx, by, br] of blobs) { g.beginPath(); g.ellipse(x + bx * h, base + by * h, br * h * (0.9 + R() * 0.2), br * h * 0.8, 0, 0, PI * 2); g.fill(); }
  if (hi) { g.fillStyle = hi; for (const [bx, by, br] of blobs) { g.beginPath(); g.ellipse(x + bx * h - br * h * 0.25, base + by * h - br * h * 0.3, br * h * 0.45, br * h * 0.3, 0, 0, PI * 2); g.fill(); } }
}

/** ロケットのシルエット（detail=true で塗り分け） */
export function rocketSil(g, x, base, h, col, detail, acc) {
  const w = h * 0.14;
  g.fillStyle = col;
  // ブースター
  for (const sd of [-1, 1]) {
    g.beginPath(); g.moveTo(x + sd * w * 1.05, base); g.lineTo(x + sd * w * 1.05, base - h * 0.45); g.quadraticCurveTo(x + sd * w * 1.05, base - h * 0.55, x + sd * w * 0.75, base - h * 0.6);
    g.lineTo(x + sd * w * 0.5, base - h * 0.45); g.lineTo(x + sd * w * 0.5, base); g.closePath(); g.fill();
  }
  // 本体
  g.beginPath(); g.moveTo(x - w * 0.55, base); g.lineTo(x - w * 0.55, base - h * 0.72);
  g.quadraticCurveTo(x - w * 0.5, base - h * 0.92, x, base - h); g.quadraticCurveTo(x + w * 0.5, base - h * 0.92, x + w * 0.55, base - h * 0.72);
  g.lineTo(x + w * 0.55, base); g.closePath(); g.fill();
  // フィン
  g.beginPath(); g.moveTo(x - w * 1.05, base - h * 0.18); g.lineTo(x - w * 1.7, base); g.lineTo(x - w * 1.05, base); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + w * 1.05, base - h * 0.18); g.lineTo(x + w * 1.7, base); g.lineTo(x + w * 1.05, base); g.closePath(); g.fill();
  if (detail) {
    g.fillStyle = acc || '#ff4f6d';
    g.fillRect(x - w * 0.55, base - h * 0.62, w * 1.1, h * 0.04);
    g.beginPath(); g.moveTo(x - w * 0.28, base - h * 0.86); g.quadraticCurveTo(x, base - h * 1.02, x + w * 0.28, base - h * 0.86); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x - w * 0.45, base - h * 0.85, w * 0.22, h * 0.82);
    g.fillStyle = '#9fe8ff'; g.beginPath(); g.arc(x, base - h * 0.75, w * 0.22, 0, PI * 2); g.fill();
  }
}

/** 鉄骨ラティス塔 */
export function lattice(g, x, base, w, h, col, lw = 2) {
  g.strokeStyle = col; g.lineWidth = lw + 1.5;
  g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - h); g.moveTo(x + w, base); g.lineTo(x + w, base - h); g.stroke();
  g.lineWidth = lw * 0.7; g.beginPath();
  for (let y = base; y > base - h + w; y -= w) { g.moveTo(x, y); g.lineTo(x + w, y - w); g.moveTo(x + w, y); g.lineTo(x, y - w); g.moveTo(x, y); g.lineTo(x + w, y); }
  g.stroke();
}
