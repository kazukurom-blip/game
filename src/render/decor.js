// マップ装飾（ワールド空間, map.decor）
import { shade, rgba, hashStr, rr, starPath, lerp, OUTLINE } from './util.js';
import { drawVehicle } from './vehicles.js';
import { PI, oFill, NEON_COLS, neonText } from './bgkit.js';

const SIGN_WORDS = ['VICE', 'MOTEL', 'OPEN 24H', 'TACOS', 'BAR', 'DISCO', 'LIQUOR', 'SURF'];

export function drawDecor(ctx, d, theme, time) {
  const x = d.x, y = d.y;
  const h = hashStr(d.type + ':' + x + ':' + y);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (d.type) {
    case 'palm': decoPalm(ctx, h, time); break;
    case 'neonSign': decoNeonSign(ctx, d, h, time); break;
    case 'lamp': decoLamp(ctx, theme); break;
    case 'car': ctx.restore(); drawVehicle(ctx, { kind: d.kind || 'sports', x, y, color: d.color || ['#ff2e88', '#19d3c5', '#ffc93c', '#7b2ff7'][h % 4], facing: h % 2 ? 1 : -1, speed: 0, t: time }); return;
    case 'billboard': decoBillboard(ctx, d, h, time); break;
    case 'crate': decoCrate(ctx); break;
    case 'hydrant': decoHydrant(ctx); break;
    case 'bench': decoBench(ctx); break;
    case 'graffiti': decoGraffiti(ctx, h); break;
    case 'flamingoStatue': decoFlamingo(ctx, time); break;
    case 'slotMachine': decoSlot(ctx, h, time); break;
    case 'mangrove': decoMangrove(ctx, h, time); break;
    case 'container': decoContainer(ctx, d, h); break;
    default: break;
  }
  ctx.restore();
}

function decoPalm(ctx, h, time) {
  const H = 150 + (h % 50), lean = h % 2 ? 1 : -1;
  const tx = lean * 26, ty = -H;
  // 幹
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(lean * 4 - 6, -H * 0.55, tx - 4, ty + 4); ctx.lineTo(tx + 4, ty + 4); ctx.quadraticCurveTo(lean * 4 + 6, -H * 0.55, 8, 0); ctx.closePath();
  oFill(ctx, '#a8744a');
  ctx.strokeStyle = '#7a4e2e'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let k = 0.08; k < 0.95; k += 0.09) { const px = lerp(0, tx, k * k) + lean * 4 * Math.sin(k * PI); const py = -H * k; ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py - 3); }
  ctx.stroke();
  // ヤシの実
  ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.arc(tx - 5, ty + 8, 5, 0, PI * 2); ctx.arc(tx + 4, ty + 9, 5, 0, PI * 2); ctx.fill();
  // 葉
  const sway = Math.sin(time * 1.4 + h) * 0.06;
  for (let i = 0; i < 7; i++) {
    const a = -PI + (i / 6) * PI + sway + (i % 2 ? 0.12 : -0.08);
    const len = 62 + ((h >>> i) % 18);
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.45 + len * 0.42;
    const mx = tx + Math.cos(a) * len * 0.5, my = ty + Math.sin(a) * len * 0.5 - 12;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx, my - 6, ex, ey);
    ctx.quadraticCurveTo(mx, my + 8, tx, ty + 5);
    oFill(ctx, i % 2 ? '#3fae5a' : '#2f9a4e', 1.8);
    ctx.strokeStyle = '#1f6a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, ty + 2); ctx.quadraticCurveTo(mx, my + 1, ex, ey); ctx.stroke();
  }
}

function decoNeonSign(ctx, d, h, time) {
  const word = d.text || SIGN_WORDS[h % SIGN_WORDS.length];
  const col = d.color || NEON_COLS[(h >>> 3) % NEON_COLS.length];
  ctx.font = '900 22px "Arial Black", sans-serif';
  const tw = ctx.measureText(word).width + 30;
  const sy = -150;
  // 支柱
  ctx.fillStyle = '#2a2738'; ctx.fillRect(-4, sy + 40, 8, -sy - 40);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(-4, sy + 40, 8, -sy - 40);
  // 看板本体
  ctx.beginPath(); rr(ctx, -tw / 2, sy, tw, 44, 8); oFill(ctx, '#1a1030', 2.5);
  const flick = ((time * 9 + h) | 0) % 37 === 0 ? 0.2 : 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(col, 0.35 * flick); ctx.lineWidth = 8; ctx.beginPath(); rr(ctx, -tw / 2 + 4, sy + 4, tw - 8, 36, 6); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); rr(ctx, -tw / 2 + 4, sy + 4, tw - 8, 36, 6); ctx.stroke();
  neonText(ctx, 0, sy + 23, word, col, flick, 22);
  // 矢印ランプ
  for (let k = 0; k < 5; k++) { ctx.fillStyle = ((time * 6 | 0) % 5) === k ? '#fff6c0' : rgba('#ffc93c', 0.4); ctx.beginPath(); ctx.arc(-16 + k * 8, sy + 54, 2.4, 0, PI * 2); ctx.fill(); }
}

function decoLamp(ctx, theme) {
  const H = 130;
  ctx.fillStyle = '#2a2738';
  ctx.beginPath(); ctx.rect(-3, -H, 6, H); oFill(ctx, '#3a3552', 1.5);
  ctx.beginPath(); ctx.moveTo(0, -H); ctx.quadraticCurveTo(4, -H - 14, 22, -H - 12); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#3a3552'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -H - 14); ctx.lineTo(30, -H - 14); ctx.lineTo(26, -H - 6); ctx.lineTo(18, -H - 6); ctx.closePath(); oFill(ctx, '#3a3552', 1.5);
  ctx.beginPath(); rr(ctx, -6, -6, 12, 6, 2); oFill(ctx, '#3a3552', 1.5);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const lc = theme === 'swamp' ? '#c8ff5a' : theme === 'casino' ? '#ffd23f' : '#ffe6a0';
  const g = ctx.createLinearGradient(0, -H - 6, 0, 0);
  g.addColorStop(0, rgba(lc, 0.35)); g.addColorStop(1, rgba(lc, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(18, -H - 6); ctx.lineTo(26, -H - 6); ctx.lineTo(70, 0); ctx.lineTo(-26, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(lc, 0.9); ctx.beginPath(); ctx.ellipse(22, -H - 6, 5, 2.5, 0, 0, PI * 2); ctx.fill();
  ctx.restore();
}

function decoBillboard(ctx, d, h, time) {
  const W = 220, H = 100, by = -180;
  ctx.fillStyle = '#3a3552';
  for (const px of [-70, 70]) { ctx.beginPath(); ctx.rect(px - 4, by + H, 8, -by - H); oFill(ctx, '#3a3552', 1.5); }
  ctx.beginPath(); ctx.rect(-W / 2 - 6, by - 6, W + 12, H + 12); oFill(ctx, '#2a2738', 2.5);
  ctx.save(); ctx.beginPath(); ctx.rect(-W / 2, by, W, H); ctx.clip();
  const v = h % 3;
  if (v === 0) {
    // サンセット・ソーダの広告（架空）
    const g = ctx.createLinearGradient(0, by, 0, by + H); g.addColorStop(0, '#ff5fa2'); g.addColorStop(1, '#ff9a3c');
    ctx.fillStyle = g; ctx.fillRect(-W / 2, by, W, H);
    ctx.fillStyle = '#ffe29a'; ctx.beginPath(); ctx.arc(60, by + 70, 40, 0, PI * 2); ctx.fill();
    ctx.beginPath(); rr(ctx, 30, by + 18, 26, 64, 8); oFill(ctx, '#19d3c5', 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(34, by + 40, 18, 12);
    ctx.font = '900 24px "Arial Black", sans-serif'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText('SUNSET', -96, by + 42); ctx.fillStyle = '#fff'; ctx.fillText('SUNSET', -96, by + 42);
    ctx.font = '900 18px "Arial Black", sans-serif'; ctx.strokeText('SODA', -96, by + 70); ctx.fillStyle = '#ffe066'; ctx.fillText('SODA', -96, by + 70);
  } else if (v === 1) {
    // 不動産広告（架空）
    ctx.fillStyle = '#19d3c5'; ctx.fillRect(-W / 2, by, W, H);
    ctx.fillStyle = '#7b2ff7'; for (let k = 0; k < 5; k++) ctx.fillRect(-90 + k * 22, by + 90 - (k * 13 % 50) - 30, 18, 60);
    ctx.font = '900 20px "Arial Black", sans-serif'; ctx.textAlign = 'right'; ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText('LIVE THE', 100, by + 38); ctx.fillStyle = '#fff'; ctx.fillText('LIVE THE', 100, by + 38);
    ctx.strokeText('VICE LIFE', 100, by + 66); ctx.fillStyle = '#ffe066'; ctx.fillText('VICE LIFE', 100, by + 66);
  } else {
    // ラジオ局（架空）
    ctx.fillStyle = '#2a0b4a'; ctx.fillRect(-W / 2, by, W, H);
    ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-60, by + 50, 10 + k * 12 + ((time * 20) % 12), -0.8, 0.8); ctx.stroke(); }
    ctx.font = '900 26px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText('FM 88.8', 30, by + 46); ctx.fillStyle = '#00f0ff'; ctx.fillText('FM 88.8', 30, by + 46);
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ff9ad5'; ctx.fillText('NEON WAVE RADIO', 30, by + 70);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(-W / 2, by); ctx.lineTo(-W / 2 + 60, by); ctx.lineTo(-W / 2 + 20, by + H); ctx.lineTo(-W / 2, by + H); ctx.fill();
  ctx.restore();
  // 照明
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const px of [-60, 60]) { ctx.fillStyle = 'rgba(255,240,180,0.12)'; ctx.beginPath(); ctx.moveTo(px, by + H + 8); ctx.lineTo(px - 50, by); ctx.lineTo(px + 50, by); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

function decoCrate(ctx) {
  ctx.beginPath(); ctx.rect(-22, -44, 44, 44); oFill(ctx, '#b9824a', 2.4);
  ctx.strokeStyle = '#7a4e2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -42); ctx.lineTo(20, -2); ctx.moveTo(-20, -2); ctx.lineTo(20, -42); ctx.stroke();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.strokeRect(-18, -40, 36, 36);
  ctx.fillStyle = '#d9a25e'; ctx.fillRect(-22, -44, 44, 4);
}

function decoHydrant(ctx) {
  ctx.beginPath(); rr(ctx, -9, -34, 18, 34, 3); oFill(ctx, '#e53935');
  ctx.beginPath(); ctx.arc(0, -34, 9, PI, 0); ctx.closePath(); oFill(ctx, '#e53935');
  ctx.beginPath(); rr(ctx, -14, -24, 28, 8, 3); oFill(ctx, '#c62828', 1.8);
  ctx.beginPath(); rr(ctx, -12, -4, 24, 4, 1); oFill(ctx, '#8e1c1c', 1.5);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -40, 2.4, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-6, -32, 3, 24);
}

function decoBench(ctx) {
  for (const px of [-30, 26]) { ctx.beginPath(); ctx.rect(px, -22, 4, 22); oFill(ctx, '#3a3552', 1.5); }
  ctx.beginPath(); rr(ctx, -40, -26, 80, 7, 2); oFill(ctx, '#ff9a3c', 2);
  ctx.beginPath(); rr(ctx, -40, -46, 80, 7, 2); oFill(ctx, '#ff9a3c', 2);
  ctx.beginPath(); rr(ctx, -40, -36, 80, 6, 2); oFill(ctx, '#ff5fa2', 2);
  ctx.fillStyle = '#3a3552'; ctx.fillRect(-34, -46, 3, 22); ctx.fillRect(30, -46, 3, 22);
}

function decoGraffiti(ctx, h) {
  const W = 190, H = 110;
  ctx.beginPath(); ctx.rect(-W / 2, -H, W, H); oFill(ctx, '#6a5a6a', 2.4);
  ctx.strokeStyle = 'rgba(40,30,40,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let y = -H + 14, r = 0; y < 0; y += 14, r++) { ctx.moveTo(-W / 2, y); ctx.lineTo(W / 2, y); for (let x = -W / 2 + (r % 2 ? 16 : 0); x < W / 2; x += 32) { ctx.moveTo(x, y - 14); ctx.lineTo(x, y); } }
  ctx.stroke();
  const words = ['VICE', 'NEON', 'BAY!', 'LUNA', 'JIN'];
  const word = words[h % words.length];
  const c1 = NEON_COLS[h % NEON_COLS.length], c2 = NEON_COLS[(h >>> 4) % NEON_COLS.length];
  ctx.save(); ctx.translate(0, -H / 2); ctx.rotate(-0.08);
  ctx.font = '900 44px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 12; ctx.strokeStyle = '#1a1030'; ctx.strokeText(word, 0, 0);
  ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.strokeText(word, 0, 0);
  const g = ctx.createLinearGradient(0, -20, 0, 20); g.addColorStop(0, c1); g.addColorStop(1, c2 === c1 ? '#ffe066' : c2);
  ctx.fillStyle = g; ctx.fillText(word, 0, 0);
  ctx.restore();
  // 星と垂れ
  ctx.fillStyle = '#ffe066'; ctx.beginPath(); starPath(ctx, W / 2 - 22, -H + 22, 10, 4); ctx.fill();
  ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.beginPath(); for (const px of [-40, -10, 30]) { ctx.moveTo(px, -H / 2 + 18); ctx.lineTo(px, -H / 2 + 30 + (px & 7)); } ctx.stroke();
}

function decoFlamingo(ctx, time) {
  // 台座
  ctx.beginPath(); rr(ctx, -20, -14, 40, 14, 3); oFill(ctx, '#e8dcc8', 2);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -54); ctx.moveTo(0, -38); ctx.lineTo(8, -46); ctx.lineTo(4, -54); ctx.stroke();
  ctx.strokeStyle = '#ff9fbf'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-2, -66, 20, 13, -0.1, 0, PI * 2); oFill(ctx, '#ff6fa8', 2.2);
  ctx.beginPath(); ctx.moveTo(-8, -70); ctx.quadraticCurveTo(4, -76, 8, -64); ctx.quadraticCurveTo(-2, -60, -10, -64); ctx.closePath(); oFill(ctx, '#ff9fc6', 1.6);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7.4; ctx.beginPath(); ctx.moveTo(12, -72); ctx.bezierCurveTo(22, -82, 6, -92, 14, -102); ctx.stroke();
  ctx.strokeStyle = '#ff6fa8'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(16, -104, 7, 0, PI * 2); oFill(ctx, '#ff6fa8', 2);
  ctx.beginPath(); ctx.moveTo(21, -106); ctx.quadraticCurveTo(30, -106, 30, -98); ctx.lineTo(22, -101); ctx.closePath(); oFill(ctx, '#2a1430', 1.2);
  ctx.fillStyle = '#2a1430'; ctx.beginPath(); ctx.arc(17, -106, 1.6, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-10, -72, 6, 3, -0.4, 0, PI * 2); ctx.fill();
  void time;
}

function decoSlot(ctx, h, time) {
  ctx.beginPath(); rr(ctx, -30, -120, 60, 120, 8); oFill(ctx, '#7b2ff7', 2.5);
  ctx.beginPath(); rr(ctx, -34, -134, 68, 22, 8); oFill(ctx, '#ffd23f', 2.2);
  ctx.font = '900 12px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#c2187a'; ctx.fillText('JACKPOT', 0, -122);
  ctx.beginPath(); rr(ctx, -24, -100, 48, 34, 4); oFill(ctx, '#ffffff', 2);
  const sym = ['7', '★', '♦', '7', '♣'];
  for (let k = 0; k < 3; k++) {
    const s = sym[(Math.floor(time * 2) + k * 2 + h) % sym.length];
    ctx.fillStyle = s === '7' ? '#e53935' : s === '★' ? '#ffb800' : '#1e88e5';
    ctx.font = '900 18px "Arial Black", sans-serif'; ctx.fillText(s, -15 + k * 15, -82);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -100); ctx.lineTo(-8, -66); ctx.moveTo(8, -100); ctx.lineTo(8, -66); ctx.stroke();
  ctx.beginPath(); rr(ctx, -24, -56, 48, 10, 3); oFill(ctx, '#2a0b4a', 1.6);
  ctx.beginPath(); ctx.arc(-10, -51, 3, 0, PI * 2); oFill(ctx, '#ff2e88', 1); ctx.beginPath(); ctx.arc(2, -51, 3, 0, PI * 2); oFill(ctx, '#19d3c5', 1);
  ctx.beginPath(); rr(ctx, -16, -32, 32, 10, 2); oFill(ctx, '#1a0a2a', 1.6);
  // レバー
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(30, -70); ctx.lineTo(42, -76); ctx.lineTo(42, -106); ctx.stroke();
  ctx.strokeStyle = '#c0c4d0'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(42, -108, 6, 0, PI * 2); oFill(ctx, '#e53935', 1.8);
  // 電飾
  for (let k = 0; k < 6; k++) { ctx.fillStyle = ((time * 8 | 0) + k) % 2 ? '#fff6c0' : '#ff9ad5'; ctx.beginPath(); ctx.arc(-26 + k * 10.4, -112, 2, 0, PI * 2); ctx.fill(); }
}

function decoMangrove(ctx, h, time) {
  const H = 210 + (h % 60);
  // 根
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7;
  const roots = [-46, -28, -10, 12, 30, 48];
  ctx.beginPath(); for (const r of roots) { ctx.moveTo(r * 0.2, -46); ctx.quadraticCurveTo(r * 0.8, -54, r, 0); } ctx.stroke();
  ctx.strokeStyle = '#5a4a32'; ctx.lineWidth = 4; ctx.stroke();
  // 幹
  ctx.beginPath(); ctx.moveTo(-9, -44); ctx.quadraticCurveTo(-14, -H * 0.6, -4, -H + 30); ctx.lineTo(8, -H + 30); ctx.quadraticCurveTo(2, -H * 0.6, 9, -44); ctx.closePath(); oFill(ctx, '#5a4a32');
  // 樹冠
  const sw = Math.sin(time * 0.8 + h) * 2;
  const blobs = [[-50, -H + 40, 40], [0, -H + 10, 52], [48, -H + 38, 42], [-22, -H + 54, 34], [26, -H + 60, 34]];
  for (const [bx, by, br] of blobs) { ctx.beginPath(); ctx.ellipse(bx + sw, by, br, br * 0.7, 0, 0, PI * 2); oFill(ctx, '#2f5a3a', 2.2); }
  ctx.fillStyle = '#4e7a3a';
  for (const [bx, by, br] of blobs) { ctx.beginPath(); ctx.ellipse(bx + sw - br * 0.2, by - br * 0.25, br * 0.6, br * 0.35, 0, 0, PI * 2); ctx.fill(); }
  // 垂れ苔
  ctx.strokeStyle = '#7a9a6a'; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let k = -50; k <= 50; k += 14) { const l = 20 + ((h >>> (k & 7)) % 25); ctx.moveTo(k + sw, -H + 60); ctx.quadraticCurveTo(k + sw + Math.sin(time + k) * 3, -H + 60 + l / 2, k + sw, -H + 60 + l); }
  ctx.stroke();
}

function decoContainer(ctx, d, h) {
  const cols = ['#b5523b', '#2f6f73', '#c9a13b', '#6a3a8a'];
  const c = d.color || cols[h % cols.length];
  const W = 170, H = 76;
  ctx.beginPath(); ctx.rect(-W / 2, -H, W, H); oFill(ctx, c, 2.5);
  ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 3; ctx.beginPath();
  for (let x = -W / 2 + 8; x < W / 2 - 4; x += 9) { ctx.moveTo(x, -H + 6); ctx.lineTo(x, -6); }
  ctx.stroke();
  ctx.fillStyle = shade(c, 0.15); ctx.fillRect(-W / 2, -H, W, 5); ctx.fillStyle = shade(c, -0.4); ctx.fillRect(-W / 2, -5, W, 5);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 40, -H); ctx.lineTo(W / 2 - 40, 0); ctx.stroke();
  ctx.fillStyle = '#c0c4d0'; ctx.fillRect(W / 2 - 30, -H + 20, 3, 36); ctx.fillRect(W / 2 - 18, -H + 20, 3, 36);
  ctx.font = '900 16px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(['NEOCARGO', 'BAYLINE', 'SUNPORT'][h % 3], -24, -H / 2 + 6);
}
