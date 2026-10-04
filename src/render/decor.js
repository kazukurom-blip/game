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
    // v2
    case 'rocket': decoRocket(ctx, d, h, time); break;
    case 'antenna': decoAntenna(ctx, h, time); break;
    case 'satelliteDish': decoDish(ctx, h, time); break;
    case 'shopFront': decoShopFront(ctx, d, h, time, theme); break;
    case 'busStop': decoBusStop(ctx, d, h, time); break;
    case 'palmSmall': decoPalmSmall(ctx, h, time); break;
    case 'tree': decoTree(ctx, d, h, time, theme); break;
    case 'cactus': decoCactus(ctx, h); break;
    case 'trafficCone': decoCone(ctx); break;
    case 'vendingMachine': decoVending(ctx, d, h, time); break;
    case 'fuelTank': decoFuelTank(ctx, d, h); break;
    case 'goldPile': decoGoldPile(ctx, time); break;
    case 'streetSign': decoStreetSign(ctx, d, h); break;
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

// ================================================================ v2 装飾
function glowDot(ctx, x, y, r, col, a = 0.6) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
  ctx.restore();
}

// ロケット（発射台つき, d.h で高さ, d.color で胴体アクセント）
function decoRocket(ctx, d, h, time) {
  const H = d.h || 260, w = H * 0.14;
  const acc = d.color || ['#ff4f6d', '#2e7bff', '#3ee6d2', '#b45cff'][h % 4];
  // 発射台
  ctx.beginPath(); rr(ctx, -H * 0.32, -18, H * 0.64, 18, 3); oFill(ctx, '#4a5470', 2);
  ctx.fillStyle = '#ffd23f'; for (let x = -H * 0.32 + 6; x < H * 0.32 - 10; x += 20) { ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x + 8, -14); ctx.lineTo(x + 14, -14); ctx.lineTo(x + 6, -4); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.translate(0, -18);
  // 支柱アーム
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w * 2.2, 0); ctx.lineTo(w * 2.2, -H * 0.85); ctx.moveTo(w * 2.2, -H * 0.6); ctx.lineTo(w * 0.6, -H * 0.6); ctx.stroke();
  ctx.strokeStyle = '#8a92b0'; ctx.lineWidth = 2.6; ctx.stroke();
  // ブースター
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * w * 0.55, 0); ctx.lineTo(sd * w * 0.55, -H * 0.45); ctx.quadraticCurveTo(sd * w * 1.1, -H * 0.5, sd * w * 1.1, -H * 0.38); ctx.lineTo(sd * w * 1.1, 0); ctx.closePath();
    oFill(ctx, '#d8dcec', 2);
  }
  // 本体
  ctx.beginPath(); ctx.moveTo(-w * 0.55, 0); ctx.lineTo(-w * 0.55, -H * 0.72); ctx.quadraticCurveTo(-w * 0.5, -H * 0.92, 0, -H); ctx.quadraticCurveTo(w * 0.5, -H * 0.92, w * 0.55, -H * 0.72); ctx.lineTo(w * 0.55, 0); ctx.closePath();
  const bg = ctx.createLinearGradient(-w * 0.55, 0, w * 0.55, 0); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#a8b0c8');
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.fillStyle = acc; ctx.fillRect(-w * 0.55, -H * 0.62, w * 1.1, H * 0.05); ctx.fillRect(-w * 0.55, -H * 0.2, w * 1.1, H * 0.03);
  ctx.beginPath(); ctx.moveTo(-w * 0.3, -H * 0.86); ctx.quadraticCurveTo(0, -H * 1.02, w * 0.3, -H * 0.86); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -H * 0.76, w * 0.24, 0, PI * 2); oFill(ctx, '#9fe8ff', 1.6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-w * 0.08, -H * 0.78, w * 0.08, 0, PI * 2); ctx.fill();
  ctx.font = `900 ${Math.max(9, w * 0.32) | 0}px "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(0, -H * 0.4); ctx.rotate(-PI / 2); ctx.fillStyle = acc; ctx.fillText('LUMINA', 0, 0); ctx.restore();
  // フィン
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * w * 1.1, -H * 0.16); ctx.lineTo(sd * w * 1.75, 0); ctx.lineTo(sd * w * 1.1, 0); ctx.closePath(); oFill(ctx, acc, 2); }
  // 噴射口の蒸気
  ctx.fillStyle = 'rgba(240,244,255,0.5)';
  for (let i = 0; i < 4; i++) { const k = (time * 0.4 + i / 4) % 1; ctx.globalAlpha = (1 - k) * 0.6; ctx.beginPath(); ctx.arc((i % 2 ? 1 : -1) * (10 + k * 40), -4 - k * 12, 8 + k * 14, 0, PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (((time * 1.5) | 0) % 2 === 0) { ctx.fillStyle = '#ff2e4d'; ctx.beginPath(); ctx.arc(w * 2.2, -18 - H * 0.86, 3, 0, PI * 2); ctx.fill(); glowDot(ctx, w * 2.2, -18 - H * 0.86, 12, '#ff2e4d'); }
}

// 通信アンテナ塔
function decoAntenna(ctx, h, time) {
  const H = 200 + (h % 60);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-3, -H); ctx.moveTo(18, 0); ctx.lineTo(3, -H); ctx.stroke();
  ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#8a90a8'; ctx.beginPath();
  for (let y = 0; y > -H + 20; y -= 22) { const k1 = -y / H, k2 = -(y - 22) / H; const w1 = 18 - k1 * 15, w2 = 18 - k2 * 15; ctx.moveTo(-w1, y); ctx.lineTo(w2, y - 22); ctx.moveTo(w1, y); ctx.lineTo(-w2, y - 22); }
  ctx.stroke();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -H); ctx.lineTo(0, -H - 30); ctx.stroke();
  // パネル
  for (const [y, sd] of [[-H * 0.7, -1], [-H * 0.55, 1]]) { ctx.beginPath(); rr(ctx, sd < 0 ? -22 : 6, y, 16, 26, 3); oFill(ctx, '#e8ecf8', 1.6); }
  // 電波
  ctx.strokeStyle = rgba('#3ee6d2', 0.7); ctx.lineWidth = 2;
  const k = (time * 0.8) % 1;
  for (let i = 0; i < 3; i++) { const r = 10 + ((k + i / 3) % 1) * 30; ctx.globalAlpha = 1 - ((k + i / 3) % 1); ctx.beginPath(); ctx.arc(0, -H - 30, r, -PI * 0.85, -PI * 0.15); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const on = ((time * 2) | 0) % 2 === 0;
  ctx.fillStyle = on ? '#ff2e4d' : '#6a1a24'; ctx.beginPath(); ctx.arc(0, -H - 32, 4, 0, PI * 2); ctx.fill();
  if (on) glowDot(ctx, 0, -H - 32, 14, '#ff2e4d');
}

// パラボラアンテナ（ゆっくり首振り）
function decoDish(ctx, h, time) {
  ctx.beginPath(); rr(ctx, -22, -14, 44, 14, 3); oFill(ctx, '#5a6488', 2);
  ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(-4, -60); ctx.lineTo(4, -60); ctx.lineTo(8, -14); ctx.closePath(); oFill(ctx, '#8a92b0', 2);
  ctx.save(); ctx.translate(0, -64); ctx.rotate(-0.5 + Math.sin(time * 0.3 + h) * 0.25);
  ctx.beginPath(); ctx.ellipse(0, 0, 44, 16, 0, PI, 0); ctx.quadraticCurveTo(0, 26, -44, 0); ctx.closePath();
  const g = ctx.createLinearGradient(0, -16, 0, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b8c0d8');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(42,20,48,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 28, 9, 0, PI, 0); ctx.stroke();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26, -4); ctx.lineTo(0, -38); ctx.lineTo(26, -4); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -40, 4.5, 0, PI * 2); oFill(ctx, '#3ee6d2', 1.4);
  glowDot(ctx, 0, -40, 12, '#3ee6d2', 0.5 + 0.3 * Math.sin(time * 4));
  ctx.restore();
}

// 店の正面（ワールド空間の前景店舗）: d.text 店名, d.color ネオン色, d.w 幅, d.awning 日よけ色
const SHOP_NAMES = { beach: ['SURF SHOP', 'ICE CREAM', 'TACOS'], downtown: ['NEON CAFE', 'ARCADE', 'RAMEN'], slums: ['PAWN', 'LAUNDRY', 'DINER'], swamp: ['BAIT SHOP', 'BBQ', 'GATOR TOURS'], casino: ['JACKPOT', 'CHAPEL', 'BUFFET'], rooftop: ['BOUTIQUE', 'SKY LOUNGE', 'SUSHI'], spaceport: ['SPACE BURGER', 'SOUVENIR', 'ASTRO CAFE'] };
const SHOP_WALL = { beach: '#ffd0e0', downtown: '#4a3a6a', slums: '#6a4a4a', swamp: '#6a5a3a', casino: '#3a1660', rooftop: '#2e2a48', spaceport: '#e8ecf8' };
function decoShopFront(ctx, d, h, time, theme) {
  const W = d.w || 220, H = d.h || 200;
  const names = SHOP_NAMES[theme] || SHOP_NAMES.downtown;
  const name = d.text || names[h % names.length];
  const neon = d.color || NEON_COLS[(h >>> 2) % NEON_COLS.length];
  const wall = d.wall || SHOP_WALL[theme] || '#4a3a6a';
  const awn = d.awning || ['#ff5fa2', '#19d3c5', '#ff9a3c', '#7b8cff'][h % 4];
  // 壁
  ctx.beginPath(); ctx.rect(-W / 2, -H, W, H); oFill(ctx, wall, 2.5);
  ctx.fillStyle = shade(wall, -0.18); ctx.fillRect(-W / 2, -H, W, 10);
  ctx.fillStyle = shade(wall, 0.2); ctx.fillRect(-W / 2, -H + 10, W, 3);
  // 看板
  ctx.font = '900 20px "Arial Black", sans-serif';
  const sw = Math.min(W - 20, ctx.measureText(name).width + 30);
  ctx.beginPath(); rr(ctx, -sw / 2, -H + 20, sw, 34, 6); oFill(ctx, '#1a1030', 2.2);
  const flick = ((time * 9 + h) | 0) % 41 === 0 ? 0.2 : 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(neon, 0.35 * flick); ctx.lineWidth = 7; ctx.beginPath(); rr(ctx, -sw / 2 + 4, -H + 24, sw - 8, 26, 5); ctx.stroke(); ctx.restore();
  neonText(ctx, 0, -H + 37, name, neon, flick, 18);
  // 日よけ
  const ay = -H + 66, n = Math.max(4, Math.floor(W / 22)), aw = (W - 10) / n;
  for (let k = 0; k < n; k++) {
    ctx.beginPath(); ctx.moveTo(-W / 2 + 5 + k * aw, ay); ctx.lineTo(-W / 2 + 5 + (k + 1) * aw, ay); ctx.lineTo(-W / 2 + 5 + (k + 1) * aw + 2, ay + 18);
    ctx.quadraticCurveTo(-W / 2 + 5 + (k + 0.5) * aw, ay + 26, -W / 2 + 5 + k * aw - 2, ay + 18); ctx.closePath();
    ctx.fillStyle = k % 2 ? '#ffffff' : awn; ctx.fill();
  }
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-W / 2 + 3, ay); ctx.lineTo(W / 2 - 3, ay); ctx.stroke();
  // ショーウィンドウ
  const wy = ay + 30, wh = -wy - 6, wW = W - 76;
  ctx.beginPath(); ctx.rect(-W / 2 + 10, wy, wW, wh); 
  const gg = ctx.createLinearGradient(0, wy, 0, wy + wh); gg.addColorStop(0, '#fff2c8'); gg.addColorStop(1, '#ffc88a');
  ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  // 陳列品
  for (let k = 0; k < 3; k++) {
    const ix = -W / 2 + 26 + k * (wW - 30) / 2.4, c = ['#ff6fb5', '#3ee6d2', '#b45cff', '#ffd23f'][(h + k) % 4];
    ctx.beginPath(); rr(ctx, ix - 9, wy + wh - 30, 18, 24, 3); oFill(ctx, c, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(ix - 6, wy + wh - 27, 4, 18);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-W / 2 + 22, wy); ctx.lineTo(-W / 2 + 40, wy); ctx.lineTo(-W / 2 + 22, wy + wh); ctx.lineTo(-W / 2 + 10, wy + wh); ctx.closePath(); ctx.fill();
  // ドア
  ctx.beginPath(); rr(ctx, W / 2 - 58, wy - 6, 44, -wy + 6, 3); oFill(ctx, shade(wall, -0.35), 2);
  ctx.beginPath(); ctx.rect(W / 2 - 52, wy + 2, 32, 40); oFill(ctx, '#ffe6b0', 1.5);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(W / 2 - 22, wy + 56, 2.6, 0, PI * 2); ctx.fill();
  ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#c2187a'; ctx.fillText('OPEN', W / 2 - 36, wy + 26);
  glowDot(ctx, -W / 2 + 10 + wW / 2, wy + wh / 2, wW * 0.6, '#ffe6a0', 0.18);
}

// バス停
function decoBusStop(ctx, d, h, time) {
  const c = d.color || ['#2e7bff', '#ff4f6d', '#19d3c5'][h % 3];
  ctx.beginPath(); ctx.rect(-60, -110, 6, 110); oFill(ctx, '#5a5a70', 1.5);
  ctx.beginPath(); ctx.rect(54, -110, 6, 110); oFill(ctx, '#5a5a70', 1.5);
  ctx.beginPath(); rr(ctx, -70, -122, 140, 14, 4); oFill(ctx, c, 2);
  ctx.fillStyle = 'rgba(180,230,255,0.28)'; ctx.fillRect(-54, -108, 108, 70); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(-54, -108, 108, 70);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.moveTo(-40, -108); ctx.lineTo(-24, -108); ctx.lineTo(-44, -38); ctx.lineTo(-54, -38); ctx.closePath(); ctx.fill();
  // 広告パネル
  ctx.beginPath(); rr(ctx, 12, -100, 36, 56, 3); oFill(ctx, '#ffffff', 1.6);
  const g = ctx.createLinearGradient(0, -98, 0, -46); g.addColorStop(0, '#ff5fa2'); g.addColorStop(1, '#ff9a3c'); ctx.fillStyle = g; ctx.fillRect(15, -97, 30, 50);
  ctx.fillStyle = '#ffe29a'; ctx.beginPath(); ctx.arc(30, -66, 8, 0, PI * 2); ctx.fill();
  // ベンチ
  ctx.beginPath(); rr(ctx, -46, -34, 56, 6, 2); oFill(ctx, '#ff9a3c', 1.6);
  ctx.fillStyle = '#3a3552'; ctx.fillRect(-42, -28, 3, 28); ctx.fillRect(3, -28, 3, 28);
  // 標識
  ctx.beginPath(); ctx.rect(78, -130, 4, 130); oFill(ctx, '#8a8aa0', 1.2);
  ctx.beginPath(); ctx.arc(80, -140, 14, 0, PI * 2); oFill(ctx, c, 2);
  ctx.font = '900 12px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText('BUS', 80, -140);
  void time;
}

function decoPalmSmall(ctx, h, time) {
  const H = 70 + (h % 20), lean = h % 2 ? 1 : -1;
  // 植木鉢
  ctx.beginPath(); ctx.moveTo(-16, -24); ctx.lineTo(16, -24); ctx.lineTo(12, 0); ctx.lineTo(-12, 0); ctx.closePath(); oFill(ctx, '#e88a5a', 2);
  ctx.fillStyle = '#c86a3a'; ctx.fillRect(-16, -24, 32, 5);
  const tx = lean * 8, ty = -H;
  ctx.beginPath(); ctx.moveTo(-4, -24); ctx.quadraticCurveTo(lean * 2, -H * 0.6, tx - 2, ty); ctx.lineTo(tx + 2, ty); ctx.quadraticCurveTo(lean * 2 + 4, -H * 0.6, 4, -24); ctx.closePath(); oFill(ctx, '#a8744a', 1.5);
  const sway = Math.sin(time * 1.6 + h) * 0.07;
  for (let i = 0; i < 6; i++) {
    const a = -PI + (i / 5) * PI + sway;
    const len = 30 + ((h >>> i) % 8);
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.4 + len * 0.42;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty - 8, ex, ey); ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + 2, tx, ty + 3);
    oFill(ctx, i % 2 ? '#3fae5a' : '#2f9a4e', 1.5);
  }
}

function decoTree(ctx, d, h, time, theme) {
  const H = d.h || 150 + (h % 50);
  const leaf = d.color || (theme === 'swamp' ? '#3a6a3a' : theme === 'rooftop' ? '#3a9a5a' : '#4aa84a');
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-5, -H * 0.4, -6, -H * 0.55); ctx.lineTo(6, -H * 0.55); ctx.quadraticCurveTo(5, -H * 0.4, 8, 0); ctx.closePath(); oFill(ctx, '#8a5a3a');
  const sw = Math.sin(time * 1.2 + h) * 2;
  const blobs = [[-26, -H * 0.62, 30], [24, -H * 0.64, 30], [0, -H * 0.8, 36], [-10, -H * 0.56, 24], [14, -H * 0.55, 22]];
  for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(bx + sw, by, r, 0, PI * 2); oFill(ctx, leaf, 2.2); }
  ctx.fillStyle = shade(leaf, 0.3);
  for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.ellipse(bx + sw - r * 0.25, by - r * 0.3, r * 0.5, r * 0.3, -0.4, 0, PI * 2); ctx.fill(); }
  if (h % 3 === 0) { ctx.fillStyle = '#ff6fb5'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(-30 + k * 15 + sw, -H * 0.7 + (k % 2) * 18, 3, 0, PI * 2); ctx.fill(); } }
}

function decoCactus(ctx, h) {
  const H = 70 + (h % 40);
  ctx.beginPath(); rr(ctx, -10, -H, 20, H, 10); oFill(ctx, '#4a9a4a', 2.2);
  ctx.beginPath(); rr(ctx, -30, -H * 0.7, 12, H * 0.38, 6); oFill(ctx, '#4a9a4a', 2);
  ctx.beginPath(); rr(ctx, 18, -H * 0.85, 12, H * 0.42, 6); oFill(ctx, '#4a9a4a', 2);
  ctx.fillStyle = '#4a9a4a'; ctx.fillRect(-21, -H * 0.36, 14, 8); ctx.fillRect(6, -H * 0.47, 14, 8);
  ctx.strokeStyle = '#2f6a2f'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, -H + 6); ctx.lineTo(-3, -4); ctx.moveTo(4, -H + 6); ctx.lineTo(4, -4); ctx.stroke();
  if (h % 2) { ctx.fillStyle = '#ff6fb5'; ctx.beginPath(); ctx.arc(0, -H - 2, 5, 0, PI * 2); ctx.fill(); ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(0, -H - 2, 2, 0, PI * 2); ctx.fill(); }
}

function decoCone(ctx) {
  ctx.beginPath(); rr(ctx, -16, -5, 32, 5, 1.5); oFill(ctx, '#ff7a1a', 1.6);
  ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(-3, -36); ctx.lineTo(3, -36); ctx.lineTo(11, -5); ctx.closePath(); oFill(ctx, '#ff8a2a', 2);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-8, -15); ctx.lineTo(8, -15); ctx.lineTo(6.4, -21); ctx.lineTo(-6.4, -21); ctx.closePath(); ctx.fill();
}

function decoVending(ctx, d, h, time) {
  const c = d.color || ['#e53935', '#2e7bff', '#19d3c5', '#ff5fa2'][h % 4];
  ctx.beginPath(); rr(ctx, -26, -110, 52, 110, 5); oFill(ctx, c, 2.4);
  ctx.beginPath(); rr(ctx, -20, -102, 30, 60, 3); oFill(ctx, '#e8f4ff', 1.6);
  const cols = ['#ff6fb5', '#ffd23f', '#3ee6d2', '#7cff6a', '#ff9a3c'];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { ctx.fillStyle = cols[(r * 4 + k + h) % 5]; ctx.fillRect(-17 + k * 7, -98 + r * 19, 5, 13); }
  ctx.beginPath(); rr(ctx, 13, -96, 9, 30, 2); oFill(ctx, '#2a2a3a', 1.2);
  ctx.fillStyle = ((time * 2) | 0) % 2 ? '#7cff6a' : '#2a6a2a'; ctx.fillRect(15, -92, 5, 3);
  ctx.beginPath(); rr(ctx, -18, -30, 36, 14, 2); oFill(ctx, '#1a1a24', 1.4);
  glowDot(ctx, -5, -72, 40, '#e8f4ff', 0.25);
}

function decoFuelTank(ctx, d, h) {
  const c = d.color || ['#e8ecf8', '#ffd23f', '#c8d8f0'][h % 3];
  for (const lx of [-30, 26]) { ctx.beginPath(); ctx.rect(lx, -40, 6, 40); oFill(ctx, '#5a6488', 1.5); }
  ctx.beginPath(); rr(ctx, -46, -120, 92, 86, 40); 
  const g = ctx.createLinearGradient(-46, 0, 46, 0); g.addColorStop(0, shade(c, 0.2)); g.addColorStop(1, shade(c, -0.25));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.fillStyle = '#ff4f6d'; ctx.fillRect(-46, -82, 92, 8);
  ctx.font = '900 11px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2a3a5a'; ctx.fillText('LOX', 0, -96);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(46, -60); ctx.lineTo(70, -60); ctx.lineTo(70, 0); ctx.stroke();
  ctx.strokeStyle = '#8a92b0'; ctx.lineWidth = 2; ctx.stroke();
}

function decoGoldPile(ctx, time) {
  const bars = [[-40, 0], [-12, 0], [16, 0], [-26, -14], [2, -14], [-12, -28]];
  for (const [x, y] of bars) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 14); ctx.lineTo(x + 26, y - 14); ctx.lineTo(x + 30, y); ctx.closePath(); oFill(ctx, '#e8b020', 1.8);
    ctx.fillStyle = '#ffe680'; ctx.fillRect(x + 6, y - 12, 18, 3);
  }
  ctx.fillStyle = '#ffd23f'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(36 + (k % 3) * 9, -3 - Math.floor(k / 3) * 5, 6, 2.6, 0, 0, PI * 2); ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke(); }
  const s = (time * 1.3) % 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#fff6c0', 1 - s);
  ctx.beginPath(); starPath(ctx, -20 + s * 30, -40 + s * 4, 6, 1.8, 4); ctx.fill(); ctx.restore();
}

function decoStreetSign(ctx, d, h) {
  const text = d.text || ['VICE BLVD', 'OCEAN DR', 'NEON AVE', 'GATOR RD', 'LUMINA WAY'][h % 5];
  ctx.beginPath(); ctx.rect(-2.5, -120, 5, 120); oFill(ctx, '#5a6a5a', 1.4);
  ctx.font = '900 12px "Arial Black", sans-serif';
  const w = ctx.measureText(text).width + 16;
  ctx.beginPath(); rr(ctx, -4, -126, w, 20, 3); oFill(ctx, d.color || '#2e8a4a', 1.8);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(-1, -123, w - 6, 14);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, 4, -115.5);
}
