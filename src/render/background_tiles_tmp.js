// 背景（スクリーン空間・多層パララックス）とマップタイル（ワールド空間）
// ビル群などの静的レイヤーは決定論的乱数で生成し、オフスクリーン canvas にキャッシュする。
import { shade, rgba, rng, hashStr, rr, starPath, makeCanvas, lerp, OUTLINE } from './util.js';
import { drawVehicle } from './vehicles.js';

const PI = Math.PI;
const LW = 1024; // レイヤーのタイル幅

// ================================================================ drawMapTiles（ワールド空間）
const TILE = {
  beach: { ground: '#f4c98b', groundD: '#d69a5c', top: '#fff0c8', plat: '#b9774a', platE: '#7a4527', platTop: '#d9985e', ladder: false, wall: '#c9906a' },
  downtown: { ground: '#2a2738', groundD: '#1c1a28', top: '#4a4560', plat: '#4a4560', platE: '#8e86b0', neon: '#ff2e88', ladder: true, wall: '#3a3550' },
  slums: { ground: '#5c5260', groundD: '#3e3442', top: '#6e6472', plat: '#7a4e3a', platE: '#4a2e22', ladder: true, wall: '#5a4048' },
  swamp: { ground: '#4b3b2a', groundD: '#33281c', top: '#6e9a3e', plat: '#6b4a2e', platE: '#3a2616', platTop: '#6e9a3e', ladder: false, wall: '#4a3a2a' },
  casino: { ground: '#6e1238', groundD: '#4a0a26', top: '#e8dcc8', plat: '#e8dcc8', platE: '#b89a5a', neon: '#ffd23f', ladder: true, wall: '#3a1660' },
  rooftop: { ground: '#2e2a40', groundD: '#1e1a2c', top: '#5d5880', plat: '#3a3552', platE: '#5d5880', neon: '#b45cff', ladder: true, wall: '#3a3552' },
};

function viewRange(ctx) {
  const m = ctx.getTransform();
  const sx = m.a || 1;
  const x0 = -m.e / sx, y0 = -m.f / (m.d || 1);
  const w = ctx.canvas.width / sx, h = ctx.canvas.height / (m.d || 1);
  return { x0: x0 - 80, x1: x0 + w + 80, y0: y0 - 80, y1: y0 + h + 80 };
}

export function drawMapTiles(ctx, map, time) {
  if (!map) return;
  const theme = TILE[map.theme] ? map.theme : 'beach';
  const S = TILE[theme];
  time = time || 0;
  const V = viewRange(ctx);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 装飾（足場の後ろ）
  if (map.decor) for (const d of map.decor) {
    if (d.x < V.x0 - 260 || d.x > V.x1 + 260) continue;
    drawDecor(ctx, d, theme, time);
  }
  // ロープ
  if (map.ropes) for (const r of map.ropes) {
    if (r.x < V.x0 || r.x > V.x1) continue;
    drawRope(ctx, r, S.ladder || r.ladder, theme);
  }
  // 壁
  if (map.walls) for (const w of map.walls) {
    if (w.x + w.w < V.x0 || w.x > V.x1) continue;
    drawWall(ctx, w, S, theme);
  }
  // 足場
  if (map.platforms) for (const p of map.platforms) {
    if (p.x + p.w < V.x0 || p.x > V.x1 || p.y < V.y0 - 60 || p.y > V.y1 + 60) continue;
    drawPlatform(ctx, p, S, theme, time);
  }
  // 地面
  drawGround(ctx, map, S, theme, V, time);
  // ポータル
  if (map.portals) for (const p of map.portals) {
    if (p.x < V.x0 - 100 || p.x > V.x1 + 100) continue;
    drawPortal(ctx, p, time);
  }
  ctx.restore();
}

function drawGround(ctx, map, S, theme, V, time) {
  const gy = map.groundY;
  const x0 = Math.max(V.x0, -400), x1 = Math.min(V.x1, (map.width || 4000) + 400);
  const bottom = Math.max((map.height || gy + 200), V.y1) + 50;
  const g = ctx.createLinearGradient(0, gy, 0, gy + 160);
  g.addColorStop(0, S.ground); g.addColorStop(1, S.groundD);
  ctx.fillStyle = g; ctx.fillRect(x0, gy, x1 - x0, bottom - gy);
  const step = 64;
  const i0 = Math.floor(x0 / step), i1 = Math.ceil(x1 / step);
  switch (theme) {
    case 'beach': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 6);
      ctx.fillStyle = 'rgba(214,154,92,0.6)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('b' + i); ctx.fillRect(i * step + (h % 50), gy + 14 + (h >>> 8) % 60, 3, 2); ctx.fillRect(i * step + ((h >>> 4) % 60), gy + 30 + (h >>> 12) % 50, 2, 2); }
      ctx.fillStyle = '#ffffff';
      for (let i = i0; i <= i1; i += 3) { const h = hashStr('s' + i); if (h % 4 === 0) { ctx.save(); ctx.translate(i * step + 20, gy + 26); shell(ctx, h); ctx.restore(); } }
      break;
    }
    case 'downtown': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 22);
      ctx.fillStyle = '#8e86b0'; ctx.fillRect(x0, gy, x1 - x0, 3);
      ctx.fillStyle = '#1c1a28'; ctx.fillRect(x0, gy + 22, x1 - x0, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 3); ctx.lineTo(i * step, gy + 22); } ctx.stroke();
      ctx.fillStyle = '#e6e1f0';
      for (let i = i0; i <= i1; i++) if (i % 2 === 0) ctx.fillRect(i * step, gy + 62, 36, 5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,46,136,0.12)'; ctx.fillRect(x0, gy + 26, x1 - x0, 20); ctx.restore();
      break;
    }
    case 'slums': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 8);
      ctx.strokeStyle = '#3e3442'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const h = hashStr('c' + i);
        if (h % 3) continue;
        const sx = i * step + (h % 40);
        ctx.moveTo(sx, gy + 8); ctx.lineTo(sx + 8, gy + 20); ctx.lineTo(sx + 4, gy + 34); ctx.moveTo(sx + 8, gy + 20); ctx.lineTo(sx + 18, gy + 26);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(30,20,30,0.25)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('p' + i); if (h % 5 === 0) { ctx.beginPath(); ctx.ellipse(i * step + 20, gy + 40, 26, 5, 0, 0, PI * 2); ctx.fill(); } }
      break;
    }
    case 'swamp': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 7);
      ctx.fillStyle = '#5a8a32'; ctx.beginPath();
      for (let i = i0 * 2; i <= i1 * 2; i++) { const x = i * 32, h = hashStr('g' + i) % 8; ctx.moveTo(x, gy + 2); ctx.lineTo(x + 4, gy - 6 - h); ctx.lineTo(x + 7, gy + 2); ctx.moveTo(x + 12, gy + 2); ctx.lineTo(x + 18, gy - 4 - h * 0.6); ctx.lineTo(x + 20, gy + 2); }
      ctx.fill();
      ctx.fillStyle = 'rgba(44,92,79,0.6)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('w' + i); if (h % 4 === 0) { ctx.beginPath(); ctx.ellipse(i * step + 30, gy + 30 + h % 20, 30, 5, 0, 0, PI * 2); ctx.fill(); } }
      break;
    }
    case 'casino': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 14);
      ctx.fillStyle = '#b89a5a'; ctx.fillRect(x0, gy + 14, x1 - x0, 3);
      ctx.fillStyle = '#a8204e';
      for (let i = i0; i <= i1; i++) { ctx.beginPath(); ctx.moveTo(i * step + 32, gy + 26); ctx.lineTo(i * step + 44, gy + 38); ctx.lineTo(i * step + 32, gy + 50); ctx.lineTo(i * step + 20, gy + 38); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = 'rgba(184,154,90,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 3); ctx.lineTo(i * step, gy + 14); } ctx.stroke();
      break;
    }
    case 'rooftop': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 10);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(180,92,255,0.5)'; ctx.fillRect(x0, gy, x1 - x0, 2); ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 10); ctx.lineTo(i * step, gy + 200); } ctx.stroke();
      ctx.fillStyle = '#3a3552';
      for (let i = i0; i <= i1; i++) { const h = hashStr('v' + i); if (h % 7 === 0) { ctx.fillRect(i * step + 10, gy + 24, 30, 14); ctx.fillStyle = '#5d5880'; ctx.fillRect(i * step + 12, gy + 26, 26, 3); ctx.fillStyle = '#3a3552'; } }
      break;
    }
  }
  // 地面上端のアウトライン
  ctx.fillStyle = 'rgba(42,20,48,0.5)'; ctx.fillRect(x0, gy - 1, x1 - x0, 2);
}

function shell(ctx, h) {
  ctx.fillStyle = h % 2 ? '#ffd0e0' : '#fff6e8';
  ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(0, -6, 5, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(160,90,90,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -2); ctx.moveTo(-2.5, 3); ctx.lineTo(-1, -1.5); ctx.moveTo(2.5, 3); ctx.lineTo(1, -1.5); ctx.stroke();
}

function drawPlatform(ctx, p, S, theme, time) {
  const x = p.x, y = p.y, w = p.w;
  const th = p.solid ? 26 : 16;
  ctx.save();
  // 影
  ctx.fillStyle = 'rgba(20,0,30,0.18)'; ctx.fillRect(x + 6, y + th, w - 12, 6);
  switch (theme) {
    case 'beach': {
      // 木の桟橋（板）＋草とヤシ葉の縁取り
      ctx.beginPath(); rr(ctx, x, y, w, th, 4); ctx.fillStyle = S.plat; ctx.fill();
      ctx.strokeStyle = S.platE; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(122,69,39,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let k = x + 22; k < x + w - 4; k += 22) { ctx.moveTo(k, y + 4); ctx.lineTo(k, y + th - 1); }
      ctx.stroke();
      ctx.fillStyle = '#8a5530';
      for (let k = x + 12; k < x + w; k += 70) ctx.fillRect(k, y + th, 6, 18);
      ctx.fillStyle = S.platTop; ctx.fillRect(x + 2, y, w - 4, 4);
      grassTop(ctx, x, y, w, '#6ccf5a', '#3f9a3a');
      break;
    }
    case 'swamp': {
      // 丸太＋苔
      ctx.beginPath(); rr(ctx, x, y, w, th, th / 2); ctx.fillStyle = S.plat; ctx.fill(); ctx.strokeStyle = S.platE; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(58,38,22,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = x + 16; k < x + w - 10; k += 30) { ctx.moveTo(k, y + 6); ctx.lineTo(k + 18, y + 6); ctx.moveTo(k + 8, y + 11); ctx.lineTo(k + 24, y + 11); }
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 6, y + th / 2, 5, th / 2 - 1, 0, 0, PI * 2); ctx.fillStyle = '#9a7a4e'; ctx.fill(); ctx.stroke();
      grassTop(ctx, x, y, w, '#6e9a3e', '#4e7a3a');
      // 垂れ苔
      ctx.strokeStyle = '#4e7a3a'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = x + 20; k < x + w - 10; k += 46) { const l = 10 + (hashStr('m' + k) % 14); const s = Math.sin(time * 1.5 + k) * 2; ctx.moveTo(k, y + th); ctx.quadraticCurveTo(k + s, y + th + l / 2, k + s * 1.5, y + th + l); }
      ctx.stroke();
      break;
    }
    case 'slums': {
      // 錆びた鉄骨足場
      ctx.fillStyle = S.plat; ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = S.platE; ctx.fillRect(x, y + th - 5, w, 5);
      ctx.strokeStyle = S.plat; ctx.lineWidth = 2.4; ctx.beginPath();
      for (let k = x; k < x + w - 4; k += 20) { ctx.moveTo(k, y + 7); ctx.lineTo(k + 20, y + th - 5); ctx.moveTo(k + 20, y + 7); ctx.lineTo(k, y + th - 5); }
      ctx.stroke();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, th);
      ctx.fillStyle = '#b07a52'; for (let k = x + 6; k < x + w; k += 20) ctx.fillRect(k, y + 2, 2.5, 2.5);
      ctx.fillStyle = 'rgba(160,80,40,0.45)'; for (let k = x + 13; k < x + w; k += 57) ctx.fillRect(k, y + 7, 6, 3);
      break;
    }
    case 'casino': {
      // 大理石＋金縁＋電飾
      ctx.beginPath(); rr(ctx, x, y, w, th, 3);
      const g = ctx.createLinearGradient(0, y, 0, y + th); g.addColorStop(0, '#fff8ea'); g.addColorStop(1, S.plat);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = S.platE; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(184,154,90,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 10, y + 6); ctx.quadraticCurveTo(x + w * 0.4, y + 12, x + w * 0.7, y + 5); ctx.stroke();
      const n = Math.floor(w / 16);
      for (let k = 0; k < n; k++) { const on = (k + Math.floor(time * 8)) % 3 === 0; ctx.fillStyle = on ? '#fff6c0' : 'rgba(255,201,60,0.5)'; ctx.fillRect(x + 8 + k * 16, y + th - 4, 3, 3); }
      break;
    }
    default: {
      // downtown / rooftop: 鉄骨 I ビーム＋ネオン縁
      ctx.fillStyle = S.plat; ctx.fillRect(x, y, w, 5); ctx.fillRect(x, y + th - 5, w, 5); ctx.fillRect(x, y + 5, w, th - 10);
      ctx.fillStyle = shade(S.plat, -0.25); ctx.fillRect(x, y + 5, w, th - 10);
      ctx.fillStyle = S.platE;
      for (let k = x + 8; k < x + w - 4; k += 24) { ctx.beginPath(); ctx.arc(k, y + 2.5, 1.6, 0, PI * 2); ctx.arc(k, y + th - 2.5, 1.6, 0, PI * 2); ctx.fill(); }
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, th);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const nc = S.neon || '#ff2e88';
      const pulse = 0.7 + Math.sin(time * 3 + x * 0.01) * 0.3;
      ctx.strokeStyle = rgba(nc, 0.3 * pulse); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x + 2, y + 1); ctx.lineTo(x + w - 2, y + 1); ctx.stroke();
      ctx.strokeStyle = rgba(nc, 0.95); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function grassTop(ctx, x, y, w, c1, c2) {
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.moveTo(x - 2, y + 5);
  for (let k = x - 2; k < x + w + 2; k += 8) { ctx.quadraticCurveTo(k + 4, y + 10, k + 8, y + 5); }
  ctx.lineTo(x + w + 2, y - 2); ctx.lineTo(x - 2, y - 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c2; ctx.beginPath();
  for (let k = x + 4; k < x + w - 4; k += 14) { ctx.moveTo(k, y - 1); ctx.lineTo(k + 2.5, y - 7 - (k % 3)); ctx.lineTo(k + 5, y - 1); }
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,20,48,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + w + 2, y - 2); ctx.stroke();
}

function drawRope(ctx, r, ladder, theme) {
  const top = r.top, bot = r.bottom;
  if (ladder) {
    const c = theme === 'casino' ? '#ffd23f' : theme === 'slums' ? '#8a5a3a' : '#8e86b0';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(r.x - 10, top); ctx.lineTo(r.x - 10, bot); ctx.moveTo(r.x + 10, top); ctx.lineTo(r.x + 10, bot); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath();
    for (let y = top + 10; y < bot - 4; y += 16) { ctx.moveTo(r.x - 10, y); ctx.lineTo(r.x + 10, y); }
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.stroke();
  } else {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(r.x, top - 4); ctx.lineTo(r.x, bot); ctx.stroke();
    ctx.strokeStyle = '#c8945a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let y = top; y < bot - 4; y += 8) { ctx.moveTo(r.x - 2, y); ctx.lineTo(r.x + 2, y + 5); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(r.x, top - 2, 5, 0, PI * 2); ctx.fillStyle = '#c8945a'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.8; ctx.stroke();
  }
}

function drawWall(ctx, w, S, theme) {
  ctx.fillStyle = S.wall; ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.strokeStyle = shade(S.wall, -0.3); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = w.y + 14, r = 0; y < w.y + w.h; y += 14, r++) {
    ctx.moveTo(w.x, y); ctx.lineTo(w.x + w.w, y);
    for (let x = w.x + (r % 2 ? 14 : 0); x < w.x + w.w; x += 28) { ctx.moveTo(x, y - 14); ctx.lineTo(x, y); }
  }
  ctx.stroke();
  ctx.fillStyle = shade(S.wall, 0.2); ctx.fillRect(w.x, w.y, w.w, 4);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
}

// ---------------------------------------------------------------- ポータル（メイプル風の光の渦）
function drawPortal(ctx, p, time) {
  const x = p.x, y = p.y;
  const cy = y - 46;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 足元の光
  const g = ctx.createRadialGradient(x, y - 4, 4, x, y - 4, 60);
  g.addColorStop(0, 'rgba(180,124,255,0.55)'); g.addColorStop(1, 'rgba(180,124,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 4, 60, 16, 0, 0, PI * 2); ctx.fill();
  // 渦
  for (let i = 0; i < 5; i++) {
    const a0 = time * (2.4 + i * 0.5) + i * 1.3;
    const rx = 18 + i * 5, ry = 30 + i * 7;
    ctx.strokeStyle = i % 2 ? 'rgba(62,230,210,0.6)' : 'rgba(255,79,160,0.55)';
    ctx.lineWidth = 4 - i * 0.5;
    ctx.beginPath(); ctx.ellipse(x, cy, rx, ry, 0, a0, a0 + PI * 1.2); ctx.stroke();
  }
  const cg = ctx.createRadialGradient(x, cy, 2, x, cy, 30);
  cg.addColorStop(0, 'rgba(255,255,255,0.9)'); cg.addColorStop(0.5, 'rgba(180,124,255,0.5)'); cg.addColorStop(1, 'rgba(180,124,255,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, cy, 26, 40, 0, 0, PI * 2); ctx.fill();
  // 上昇する粒
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    const k = ((time * 0.6 + i / 8) % 1);
    const px = x + Math.sin(i * 2.3 + time) * 22 * (1 - k);
    ctx.globalAlpha = 1 - k;
    ctx.fillRect(px, y - 8 - k * 90, 2.5, 2.5);
  }
  ctx.restore();
  // ラベル
  if (p.label) {
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(p.label).width + 18;
    const ly = y - 112 + Math.sin(time * 2) * 2;
    ctx.fillStyle = 'rgba(42,20,48,0.8)'; ctx.beginPath(); rr(ctx, x - tw / 2, ly - 11, tw, 22, 11); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(p.label, x, ly + 1);
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(x - 5, ly + 13); ctx.lineTo(x + 5, ly + 13); ctx.lineTo(x, ly + 19); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

