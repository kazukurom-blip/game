// 地域×バリアントの背景シーン（スクリーン空間）。静的レイヤーはキャッシュ（base＋glow の2枚）。
// glow には窓明かり・ネオンだけを描き、夜ほど強く加算合成される（background.js が再生）。
import { shade, rgba, rng, hashStr, rr, lerp, mix } from './util.js';
import { PI, LW, wrap, neonText, palmSil, cypress, mangroveSil, treeSil, rocketSil, lattice, NEON_COLS } from './bgkit.js';

export const bottomAt = (gS, H, f, base) => lerp(H * base, gS, f);
const pick = (R, a) => a[(R() * a.length) | 0];

// ================================================================ 汎用ペインタ
function windowsGrid(P, x, top, w, bottom, o, R) {
  const g = P.g;
  for (let yy = top + (o.pad || 8); yy < bottom - 6; yy += o.wy) {
    for (let wx = x + 4; wx < x + w - 6 - o.ww * 0.5; wx += o.wx) {
      const r = R();
      if (o.dim) { g.fillStyle = o.dim; g.fillRect(wx, yy, o.ww, o.wh); }
      if (r < o.lit) {
        const gl = P.gl;
        gl.globalAlpha = 0.55 + R() * 0.45;
        gl.fillStyle = o.cols[((r * 997) | 0) % o.cols.length]; gl.fillRect(wx, yy, o.ww, o.wh);
        gl.globalAlpha = 1;
      }
    }
  }
}

/** ビル群（窓は glow 側） */
function city(P, seed, o) {
  const g = P.g, h = P.h;
  const R = rng(seed);
  let x = -20;
  while (x < LW) {
    const w = o.minW + R() * (o.maxW - o.minW);
    const bh = o.minH + R() * (o.maxH - o.minH);
    const shapeR = R(), bs = (R() * 1e9) | 0, neonOn = o.neon && R() < o.neonP;
    const nc = o.neon ? o.neon[(R() * o.neon.length) | 0] : null, ny = 20 + R() * 40, nh = 40 + R() * 50;
    const top = h - bh;
    wrap(x, w, (xx) => {
      const r = rng(bs);
      g.fillStyle = o.col;
      g.beginPath();
      if (shapeR < 0.2) { g.moveTo(xx, h); g.lineTo(xx, top + 20); g.lineTo(xx + w / 2, top - 10); g.lineTo(xx + w, top + 20); g.lineTo(xx + w, h); }
      else if (shapeR < 0.35) { g.rect(xx, top, w, bh); g.rect(xx + w * 0.2, top - 18, w * 0.6, 18); g.rect(xx + w * 0.45, top - 40, 3, 22); }
      else if (shapeR < 0.45) { g.rect(xx, top, w, bh); g.moveTo(xx, top); g.lineTo(xx + w * 0.5, top - 25); g.lineTo(xx + w, top); }
      else g.rect(xx, top, w, bh);
      g.fill();
      if (o.edge) { g.fillStyle = o.edge; g.fillRect(xx, top, 2, bh); }
      windowsGrid(P, xx, top, w, h, { wx: o.wx, wy: o.wy, ww: o.ww, wh: o.wh, lit: o.lit, cols: o.win, dim: o.dim || shade(o.col, 0.12) }, r);
      if (neonOn) {
        g.fillStyle = shade(nc, -0.55); g.fillRect(xx + w - 11, top + ny, 10, nh);
        const gl = P.gl;
        gl.fillStyle = rgba(nc, 0.3); gl.fillRect(xx + w - 14, top + ny - 4, 16, nh + 8);
        gl.fillStyle = nc; gl.fillRect(xx + w - 11, top + ny, 10, nh);
        gl.fillStyle = 'rgba(255,255,255,0.8)'; for (let k = 0; k < nh - 8; k += 12) gl.fillRect(xx + w - 8, top + ny + 4 + k, 4, 6);
      }
      if (o.trim) { g.fillStyle = o.trim; g.fillRect(xx, top, w, 2); }
      if (o.beacon && r() < 0.35) { P.gl.fillStyle = '#ff2e4d'; P.gl.fillRect(xx + w / 2 - 1.5, top - 4, 3, 3); }
    });
    x += w + o.gap * R();
  }
}

/** 低い家並み（郊外・パステル） */
function houses(P, seed, o) {
  const g = P.g, h = P.h;
  const R = rng(seed);
  let x = 0;
  while (x < LW) {
    const w = 70 + R() * 70, bh = 50 + R() * 50, c = pick(R, o.cols), roof = pick(R, o.roofs), bs = (R() * 1e9) | 0, flat = R() < 0.4;
    wrap(x, w, (xx) => {
      const r = rng(bs);
      g.fillStyle = c; g.fillRect(xx, h - bh, w, bh);
      g.fillStyle = roof;
      if (flat) { g.fillRect(xx - 3, h - bh - 6, w + 6, 7); }
      else { g.beginPath(); g.moveTo(xx - 6, h - bh); g.lineTo(xx + w / 2, h - bh - 26); g.lineTo(xx + w + 6, h - bh); g.closePath(); g.fill(); }
      g.fillStyle = shade(c, -0.25); g.fillRect(xx + w * 0.42, h - 26, 13, 26);
      for (let k = 0; k < 3; k++) {
        const wx = xx + 8 + k * (w - 22) / 2.2, wy = h - bh + 12;
        g.fillStyle = shade(c, -0.18); g.fillRect(wx, wy, 12, 12);
        if (r() < 0.55) { P.gl.fillStyle = pick(r, ['#ffd86e', '#ffe9b0', '#ffb86b']); P.gl.fillRect(wx + 1, wy + 1, 10, 10); }
      }
    });
    x += w + 6 + R() * 26;
  }
}

/** 町の店並び（前景ファサード） */
function shopRow(P, seed, st) {
  // タイル幅 LW にぴったり収める。最後の店が細く（140px 未満）なる時は手前の店を広げて埋める
  // （細い店の看板文字が隣の店やタイルの継ぎ目にはみ出して重なっていた）
  const R = rng(seed);
  let x = 0, i = (R() * st.names.length) | 0;
  const row = [];
  for (;;) {
    const w = Math.round(150 + R() * 90), bh = 180 + R() * 80, bs = (R() * 1e9) | 0;
    const name = st.names[i++ % st.names.length], wall = pick(R, st.walls), awn = pick(R, st.awn), neon = pick(R, st.neon);
    const gap = R() < 0.3 ? Math.round(20 + R() * 30) : 3;
    if (x + w + gap > LW) {
      const rest = LW - x - 3;
      if (rest >= 140 || !row.length) row.push({ x, w: rest, bh, bs, name, wall, awn, neon, gap: 3 });
      else row[row.length - 1].w += LW - x;
      break;
    }
    row.push({ x, w, bh, bs, name, wall, awn, neon, gap });
    x += w + gap;
  }
  // 隣り合う店（タイルの継ぎ目も）が同じ名前にならないように
  for (let k = 1; k < row.length; k++) {
    let n = 0;
    while (n++ < st.names.length && (row[k].name === row[k - 1].name || (k === row.length - 1 && row[k].name === row[0].name))) row[k].name = st.names[(st.names.indexOf(row[k].name) + 1) % st.names.length];
  }
  for (const s0 of row) wrap(s0.x, s0.w, (xx) => shopFront(P, xx, s0.w, s0.bh, rng(s0.bs), s0.name, s0.wall, s0.awn, s0.neon, st));
}
function shopFront(P, x, w, bh, R, name, wall, awn, neon, st) {
  const g = P.g, gl = P.gl, base = P.h;
  const top = base - bh;
  const O = '#2a1430';
  // 壁
  g.fillStyle = wall; g.fillRect(x, top, w, bh);
  g.fillStyle = shade(wall, -0.15); g.fillRect(x, top, w, 8); g.fillRect(x, top + 8, 4, bh - 8); g.fillRect(x + w - 4, top + 8, 4, bh - 8);
  g.fillStyle = shade(wall, 0.25); g.fillRect(x, top + 8, w, 2);
  if (st.brick) { g.fillStyle = shade(wall, -0.1); for (let yy = top + 14; yy < base - 110; yy += 9) for (let xx = x + 6 + ((yy / 9) % 2) * 9; xx < x + w - 10; xx += 18) g.fillRect(xx, yy, 14, 1.2); }
  // 上階の窓
  const upB = base - 128;
  for (let yy = top + 22; yy + 26 < upB; yy += 40) {
    for (let k = 0; k < Math.floor((w - 20) / 44); k++) {
      const wx = x + 14 + k * 44, ww = 30, wh = 26;
      g.fillStyle = shade(wall, -0.45); g.fillRect(wx, yy, ww, wh);
      g.fillStyle = shade(wall, 0.3); g.fillRect(wx - 2, yy + wh, ww + 4, 3);
      g.fillStyle = rgba('#9fd8ff', 0.25); g.fillRect(wx + 2, yy + 2, 8, wh - 4);
      if (R() < 0.6) { gl.fillStyle = pick(R, ['#ffd86e', '#ffe9b0', '#ff9ad5', '#9ff0ff']); gl.globalAlpha = 0.85; gl.fillRect(wx + 1, yy + 1, ww - 2, wh - 2); gl.globalAlpha = 1; }
      if (st.ac && R() < 0.3) { g.fillStyle = '#8a8aa0'; g.fillRect(wx + 4, yy + wh + 3, 20, 10); g.fillStyle = '#5a5a70'; g.fillRect(wx + 6, yy + wh + 5, 16, 1.5); }
    }
  }
  // 看板
  const sy = base - 124, sh = 26, sw = w - 24;
  g.fillStyle = st.signBg || '#1a1030'; g.fillRect(x + 12, sy, sw, sh);
  g.strokeStyle = O; g.lineWidth = 2; g.strokeRect(x + 12, sy, sw, sh);
  g.font = '900 17px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  { const tw = g.measureText(name).width; if (tw > sw - 16) g.font = `900 ${Math.max(10, Math.floor(17 * (sw - 16) / tw))}px "Arial Black", sans-serif`; }
  g.fillStyle = shade(neon, -0.35); g.fillText(name, x + w / 2, sy + sh / 2 + 1);
  gl.font = g.font; gl.textAlign = 'center'; gl.textBaseline = 'middle'; gl.lineJoin = 'round';
  gl.strokeStyle = rgba(neon, 0.45); gl.lineWidth = 7; gl.strokeText(name, x + w / 2, sy + sh / 2 + 1);
  gl.fillStyle = '#ffffff'; gl.fillText(name, x + w / 2, sy + sh / 2 + 1);
  gl.strokeStyle = neon; gl.lineWidth = 2; gl.strokeRect(x + 15, sy + 3, sw - 6, sh - 6);
  // 日よけ
  const ay = base - 96;
  const n = Math.max(3, Math.floor((w - 16) / 18));
  const aw = (w - 16) / n;
  for (let k = 0; k < n; k++) {
    g.fillStyle = k % 2 ? '#ffffff' : awn;
    g.beginPath(); g.moveTo(x + 8 + k * aw, ay); g.lineTo(x + 8 + (k + 1) * aw, ay); g.lineTo(x + 8 + (k + 1) * aw, ay + 14);
    g.quadraticCurveTo(x + 8 + (k + 0.5) * aw, ay + 22, x + 8 + k * aw, ay + 14); g.closePath(); g.fill();
  }
  g.strokeStyle = O; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 8, ay); g.lineTo(x + w - 8, ay); g.stroke();
  // ショーウィンドウ＋ドア
  const wy = base - 72, wh = 62, wx = x + 12, wW = w - 62;
  const dx = x + w - 44;
  g.fillStyle = shade(wall, -0.5); g.fillRect(wx - 3, wy - 3, wW + 6, wh + 6); g.fillRect(dx - 3, wy - 10, 32, wh + 13);
  const glass = g.createLinearGradient(0, wy, 0, wy + wh); glass.addColorStop(0, st.glass || '#5a7aa8'); glass.addColorStop(1, shade(st.glass || '#5a7aa8', -0.4));
  g.fillStyle = glass; g.fillRect(wx, wy, wW, wh); g.fillRect(dx, wy - 7, 26, wh + 7);
  // 店内の光（夜に灯る）
  const ig = gl.createLinearGradient(0, wy, 0, wy + wh); ig.addColorStop(0, rgba(st.inner || '#ffe6a0', 0.85)); ig.addColorStop(1, rgba(st.inner || '#ffe6a0', 0.35));
  gl.fillStyle = ig; gl.fillRect(wx, wy, wW, wh); gl.fillRect(dx, wy - 7, 26, wh + 7);
  // 陳列（シルエット）
  const items = st.goods || ['dress', 'box', 'bottle'];
  for (let k = 0; k < 3; k++) {
    const ix = wx + 14 + k * (wW - 28) / 2, it = pick(R, items), ic = pick(R, ['#ff6fb5', '#3ee6d2', '#ffd23f', '#b45cff', '#ff8a3c', '#ffffff']);
    g.fillStyle = shade(ic, -0.2);
    if (it === 'dress') { g.beginPath(); g.arc(ix, wy + 18, 5, 0, PI * 2); g.moveTo(ix - 5, wy + 25); g.lineTo(ix + 5, wy + 25); g.lineTo(ix + 11, wy + 52); g.lineTo(ix - 11, wy + 52); g.closePath(); g.fill(); }
    else if (it === 'bottle') { g.fillRect(ix - 4, wy + 30, 8, 22); g.fillRect(ix - 1.5, wy + 22, 3, 9); g.fillRect(ix + 8, wy + 34, 7, 18); }
    else if (it === 'board') { g.save(); g.translate(ix, wy + 34); g.rotate(-0.3); g.beginPath(); rr(g, -4, -20, 8, 40, 4); g.fill(); g.restore(); }
    else if (it === 'cone') { g.beginPath(); g.arc(ix, wy + 28, 7, 0, PI * 2); g.fill(); g.fillStyle = '#e8b878'; g.beginPath(); g.moveTo(ix - 6, wy + 31); g.lineTo(ix + 6, wy + 31); g.lineTo(ix, wy + 52); g.closePath(); g.fill(); }
    else if (it === 'chip') { g.beginPath(); g.ellipse(ix, wy + 48, 10, 4, 0, 0, PI * 2); g.fill(); g.beginPath(); g.ellipse(ix + 4, wy + 42, 10, 4, 0, 0, PI * 2); g.fill(); }
    else if (it === 'rocket') { rocketSil(g, ix, wy + 54, 34, shade(ic, -0.1), true, '#ffffff'); }
    else if (it === 'fish') { g.beginPath(); g.ellipse(ix, wy + 34, 12, 6, 0, 0, PI * 2); g.moveTo(ix - 10, wy + 34); g.lineTo(ix - 18, wy + 28); g.lineTo(ix - 18, wy + 40); g.closePath(); g.fill(); }
    else { g.fillRect(ix - 10, wy + 36, 20, 16); g.fillStyle = shade(ic, 0.2); g.fillRect(ix - 10, wy + 40, 20, 3); }
  }
  // ガラス反射
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(wx + 8, wy); g.lineTo(wx + 26, wy); g.lineTo(wx + 10, wy + wh); g.lineTo(wx - 8 + 8, wy + wh); g.closePath(); g.fill();
  g.fillStyle = shade(wall, -0.6); g.fillRect(dx + 19, wy + 26, 3, 10);
  // 縦の突き出しネオン
  if (R() < 0.45) {
    const nx = x + w - 10, nyy = top + 16, nhh = Math.min(90, bh - 150);
    if (nhh > 30) {
      g.fillStyle = '#1a1030'; g.fillRect(nx - 6, nyy, 14, nhh);
      gl.fillStyle = rgba(neon, 0.35); gl.fillRect(nx - 9, nyy - 3, 20, nhh + 6);
      gl.fillStyle = neon; gl.fillRect(nx - 3, nyy + 4, 8, nhh - 8);
    }
  }
}

// 高架道路（デッキ＋柱＋街灯）
function highwayDeck(P, deckY, col, o = {}) {
  const g = P.g, h = P.h;
  g.fillStyle = shade(col, -0.2);
  for (let x = 40; x < LW; x += 256) { g.fillRect(x, deckY + 24, 34, h - deckY - 24); g.fillRect(x - 10, deckY + 22, 54, 10); }
  g.fillStyle = col; g.fillRect(0, deckY, LW, 26);
  g.fillStyle = shade(col, 0.25); g.fillRect(0, deckY, LW, 4);
  g.fillStyle = shade(col, -0.35); g.fillRect(0, deckY + 22, LW, 4);
  g.fillStyle = shade(col, 0.15); for (let x = 0; x < LW; x += 16) g.fillRect(x, deckY - 10, 3, 10);
  g.fillRect(0, deckY - 12, LW, 3);
  for (let x = 100; x < LW; x += 128) {
    g.fillStyle = shade(col, 0.1); g.fillRect(x, deckY - 60, 3, 50); g.fillRect(x, deckY - 62, 16, 3);
    P.gl.fillStyle = rgba(o.lamp || '#ffe6a0', 0.95); P.gl.fillRect(x + 10, deckY - 60, 8, 3);
    const lg = P.gl.createLinearGradient(0, deckY - 58, 0, deckY);
    lg.addColorStop(0, rgba(o.lamp || '#ffe6a0', 0.35)); lg.addColorStop(1, rgba(o.lamp || '#ffe6a0', 0));
    P.gl.fillStyle = lg; P.gl.beginPath(); P.gl.moveTo(x + 10, deckY - 58); P.gl.lineTo(x + 18, deckY - 58); P.gl.lineTo(x + 40, deckY); P.gl.lineTo(x - 12, deckY); P.gl.closePath(); P.gl.fill();
  }
}
// 高架を流れる車のライト（ライブ）
function carStreaks(ctx, S, deckY, f) {
  const { W, time, cam } = S;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const dir = i % 2 ? 1 : -1;
    const sp = 260 + (i * 53) % 140;
    const x = (((dir * time * sp + i * 377 - cam.x * f) % (W + 300)) + W + 300) % (W + 300) - 150;
    const y = deckY - 6 - (i % 2) * 4;
    const c = dir > 0 ? '#fff2c0' : '#ff3d5a';
    const gr = ctx.createLinearGradient(x - dir * 60, 0, x, 0);
    gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(1, rgba(c, 0.7 * S.lights + 0.15));
    ctx.fillStyle = gr; ctx.fillRect(Math.min(x, x - dir * 60), y, 60, 2.5);
    ctx.fillStyle = rgba(c, 0.9); ctx.fillRect(x - 2, y - 0.5, 4, 3.5);
  }
  ctx.restore();
}

function searchlights(ctx, S, cols, baseY, n = 2) {
  const { W, H, time, cam } = S;
  const a0 = S.lights;
  if (a0 < 0.15) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const bx = ((i * 640 + 300 - cam.x * 0.3) % (W + 400) + W + 400) % (W + 400) - 200;
    const a = -PI / 2 + Math.sin(time * 0.4 + i * 2) * 0.5;
    const len = H;
    const g = ctx.createLinearGradient(bx, baseY, bx + Math.cos(a) * len, baseY + Math.sin(a) * len);
    g.addColorStop(0, rgba(cols[i % cols.length], 0.22 * a0)); g.addColorStop(1, rgba(cols[i % cols.length], 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(bx, baseY);
    ctx.lineTo(bx + Math.cos(a - 0.05) * len, baseY + Math.sin(a - 0.05) * len);
    ctx.lineTo(bx + Math.cos(a + 0.05) * len, baseY + Math.sin(a + 0.05) * len);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 海（ライブ）: 縦グラデ＋波頭。反射は post で。
function sea(ctx, S, top, c1, c2, c3, waveCol) {
  const { W, H, time, cam } = S;
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
  ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
  ctx.strokeStyle = waveCol || 'rgba(158,245,230,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const R = (i * 7919) % 101 / 101;
    const yy = top + 10 + ((i * 37) % 130);
    const xx = ((i * 211 - cam.x * (0.1 + (yy - top) / 900) + time * 12) % (W + 80) + W + 80) % (W + 80) - 40;
    ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 8, yy - 3 - R * 2, xx + 16 + R * 10, yy);
  }
  ctx.stroke();
  // 太陽・月の反射（post: 色調補正の後で加算）
  S.post(() => {
    const src = S.sunUp ? { x: S.sunX, c: S.sunCol, a: 0.5 * S.sunUp } : S.moonUp ? { x: S.moonX, c: '#f2f0ff', a: 0.3 * S.moonUp } : null;
    if (!src) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const yy = top + 5 + i * i * 2.2;
      if (yy > H) break;
      const ww = 30 + i * 12 + Math.sin(time * 2 + i) * 10;
      ctx.fillStyle = rgba(src.c, Math.max(0, src.a - i * 0.03));
      ctx.fillRect(src.x - ww / 2 + Math.sin(time * 1.5 + i * 2) * 8, yy, ww, 2);
    }
    ctx.restore();
  });
}

function gulls(ctx, S, n, col) {
  const { W, H, time, cam } = S;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const bx = (((time * (30 + i * 8) + i * 300 - cam.x * 0.05) % (W + 100)) + W + 100) % (W + 100) - 50, by = H * 0.25 + i * 30 + Math.sin(time * 2 + i) * 8;
    const fl = Math.sin(time * 8 + i) * 4;
    ctx.moveTo(bx - 8, by - fl); ctx.quadraticCurveTo(bx - 4, by - 4, bx, by); ctx.quadraticCurveTo(bx + 4, by - 4, bx + 8, by - fl);
  }
  ctx.stroke();
}

function fogBands(ctx, S, y, col, speed = 1) {
  const { W, time, cam } = S;
  ctx.fillStyle = col;
  for (let i = 0; i < 2; i++) {
    const off = ((time * speed * (10 + i * 6) - cam.x * 0.2) % 700 + 700) % 700;
    for (let x = -700 + off; x < W + 700; x += 700) { ctx.beginPath(); ctx.ellipse(x + i * 300, y + i * 40, 380, 30, 0, 0, PI * 2); ctx.fill(); }
  }
}

// 文字が maxW に収まるフォントサイズ（Arial Black 900）
function fitSize(ctx, text, size, maxW) {
  ctx.save(); ctx.font = `900 ${size}px "Arial Black", sans-serif`;
  const w = ctx.measureText(text).width; ctx.restore();
  return w > maxW ? Math.max(10, Math.floor(size * maxW / w)) : size;
}

// ネオン文字をパララックス付きで繰り返す（post 用）
function neonRepeat(ctx, S, f, px, y, text, col, size, flicker) {
  const { W, time, cam } = S;
  const off = -(((cam.x * f) % LW) + LW) % LW;
  const on = flicker ? (((time * 7) | 0) % 11 !== 0 ? 1 : 0.25) : 1;
  for (let b = off; b < W + LW; b += LW) {
    const x = b + px;
    if (x < -200 || x > W + 200) continue;
    ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * S.lights;
    neonText(ctx, x, y, text, col, on * (S.lights > 0.3 ? 1 : 0), size);
    ctx.restore();
  }
}

// ================================================================ BEACH
const BEACH_SHOP = { walls: ['#ffd0e0', '#9ff0e0', '#fff0b8', '#ffc8a0', '#c8e0ff'], awn: ['#ff5fa2', '#19d3c5', '#ff9a3c', '#7b8cff'], neon: ['#ff2e88', '#00f0ff', '#ffc93c'], names: ['SURF SHOP', 'ICE CREAM', 'TACOS', 'BEACH BAR', 'SUNGLASS', 'MOTEL', 'SOUVENIR', 'SMOOTHIE'], goods: ['board', 'cone', 'dress', 'bottle'], glass: '#5aa8c8', signBg: '#2a1440' };

function beachFar(S, col, seed) {
  return S.layer('far', 220, (P) => {
    const g = P.g; const R = rng(seed);
    let x = 0;
    while (x < LW) {
      const w = 40 + R() * 70, h = 50 + R() * 150, dome = R() < 0.3, bs = (R() * 1e9) | 0;
      if (R() < 0.25) { x += w * 0.6; continue; }
      wrap(x, w, (xx) => {
        const r = rng(bs);
        g.fillStyle = col;
        if (dome) { g.beginPath(); g.moveTo(xx, 220); g.lineTo(xx, 220 - h); g.quadraticCurveTo(xx + w / 2, 220 - h - 30, xx + w, 220 - h); g.lineTo(xx + w, 220); g.fill(); }
        else g.fillRect(xx, 220 - h, w, h);
        windowsGrid(P, xx, 220 - h, w, 214, { wx: 8, wy: 9, ww: 3, wh: 4, lit: 0.35, cols: ['#ffd8e8', '#ffe9a8', '#9ff0ff'], dim: shade(col, 0.14) }, r);
      });
      x += w + 4 + R() * 30;
    }
    g.fillStyle = shade(col, -0.1); g.fillRect(0, 214, LW, 6);
  });
}

function bgBeach(ctx, S) {
  const { W, H, gS, horizon, v, town } = S;
  if (v === 3 && !town) { // ハイウェイ入口: 遠くにダウンタウン、手前に高架
    const far = S.layer('dtfar', 380, (P) => city(P, 311, { minW: 40, maxW: 90, minH: 120, maxH: 360, col: '#5a3a7a', win: ['#ffd86e', '#7fe9ff'], lit: 0.2, wx: 9, wy: 12, ww: 3, wh: 5, gap: 10, beacon: true }));
    S.tile(far, 0.06, horizon + 10, null);
    sea(ctx, S, horizon + 10, '#2ec4b6', '#1fb5b0', '#14807e');
    const mid = S.layer('palms', 300, (P) => { const R = rng(203); P.g.fillStyle = '#b8706a'; P.g.fillRect(0, 262, LW, 40); for (let i = 0; i < 8; i++) { const x = i * (LW / 8) + R() * 40; wrap(x, 120, (xx) => palmSil(P.g, xx, 266, 110 + R() * 60, R() < 0.5 ? -1 : 1, '#3a1446')); } });
    S.tile(mid, 0.22, bottomAt(gS, H, 0.22, 0.86) + 10, '#b8706a');
    const deckY = 160;
    const hw = S.layer('hw', 300, (P) => { highwayDeck(P, deckY, '#6a5a8a'); const g = P.g; g.fillStyle = '#2a2040'; g.fillRect(300, 40, 140, 70); g.fillStyle = '#19d3c5'; g.fillRect(306, 46, 128, 58); g.font = '900 20px "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.fillText('DOWNTOWN', 370, 72); g.font = 'bold 14px sans-serif'; g.fillText('← EXIT 12', 370, 94); g.fillStyle = '#4a3a6a'; g.fillRect(320, 110, 6, 50); g.fillRect(414, 110, 6, 50); });
    const hb = bottomAt(gS, H, 0.45, 0.94) + 30;
    S.tile(hw, 0.45, hb, '#3a2a50');
    S.post(() => carStreaks(ctx, S, hb - 300 + deckY, 0.45));
    return;
  }
  const far = beachFar(S, v === 1 ? '#9a5a8e' : '#7a3a7e', 101 + v);
  S.tile(far, 0.08, horizon, null);
  sea(ctx, S, horizon, '#2ec4b6', '#1fb5b0', '#14807e');
  if (v === 2 && !town) {
    // 桟橋: 観覧車と桟橋の灯り
    const pier = S.layer('pier', 300, (P) => {
      const g = P.g;
      const cx = 700, cy = 120, r = 95;
      g.strokeStyle = '#4a2a5a'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r, 0, PI * 2); g.stroke();
      g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 60, 250); g.moveTo(cx, cy); g.lineTo(cx + 60, 250); g.stroke();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; const gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r; g.fillStyle = '#5a3a6a'; g.fillRect(gx - 6, gy, 12, 10); P.gl.fillStyle = NEON_COLS[i % 5]; P.gl.beginPath(); P.gl.arc(gx, gy, 3, 0, PI * 2); P.gl.fill(); }
      P.gl.strokeStyle = rgba('#ff9ad5', 0.8); P.gl.lineWidth = 2; P.gl.beginPath(); P.gl.arc(cx, cy, r, 0, PI * 2); P.gl.stroke();
      // 桟橋デッキ
      g.fillStyle = '#5a3a4a'; g.fillRect(0, 248, LW, 14);
      for (let x = 10; x < LW; x += 48) g.fillRect(x, 262, 8, 38);
      g.fillStyle = '#7a5060'; g.fillRect(0, 246, LW, 3);
      for (let x = 30; x < LW; x += 96) { g.fillStyle = '#3a2a3a'; g.fillRect(x, 200, 3, 46); P.gl.fillStyle = '#ffe6a0'; P.gl.beginPath(); P.gl.arc(x + 1.5, 198, 4, 0, PI * 2); P.gl.fill(); P.gl.fillStyle = rgba('#ffe6a0', 0.25); P.gl.beginPath(); P.gl.arc(x + 1.5, 198, 12, 0, PI * 2); P.gl.fill(); }
    });
    S.tile(pier, 0.2, bottomAt(gS, H, 0.2, 0.86) + 30, null);
    gulls(ctx, S, 3, 'rgba(60,20,70,0.7)');
    return;
  }
  // 中景: 砂丘＋ヤシ（v1 並木道は家並み＋密なヤシ）
  const mid = S.layer('mid', 300, (P) => {
    const g = P.g; const R = rng(202 + v);
    if (v === 1) {
      houses({ g, get gl() { return P.gl; }, h: 268 }, 2101, { cols: ['#ffc8d8', '#b8f0e0', '#fff0b0', '#ffd0a8', '#d0d8ff'], roofs: ['#c85a6a', '#3a8a8a', '#d8884a'] });
      g.fillStyle = '#c9a07a'; g.fillRect(0, 266, LW, 34);
      for (let i = 0; i < 9; i++) { const x = i * (LW / 9) + R() * 30; wrap(x, 120, (xx) => palmSil(g, xx, 270, 150 + R() * 50, R() < 0.5 ? -1 : 1, '#3a1446')); }
    } else {
      g.fillStyle = '#c9706a';
      g.beginPath(); g.moveTo(0, 300); for (let x = 0; x <= LW; x += 32) g.lineTo(x, 250 + Math.sin((x / LW) * PI * 4) * 10); g.lineTo(LW, 300); g.fill();
      for (let i = 0; i < 6; i++) { const x = i * (LW / 6) + R() * 80; wrap(x, 120, (xx) => palmSil(g, xx, 262, 120 + R() * 70, R() < 0.5 ? -1 : 1, '#3a1446')); }
    }
  });
  S.tile(mid, 0.3, bottomAt(gS, H, 0.3, 0.9) + 30, v === 1 ? '#c9a07a' : '#c9706a');
  gulls(ctx, S, 4, 'rgba(60,20,70,0.7)');
  if (town) townFront(S, 'beach', BEACH_SHOP);
}

// ================================================================ DOWNTOWN
const DT_SHOP = { walls: ['#4a3a6a', '#3a2a5a', '#5a2a4a', '#2a3a5a', '#6a4a5a'], awn: ['#ff2e88', '#00f0ff', '#b45cff', '#ffc93c'], neon: ['#ff2e88', '#00f0ff', '#b45cff', '#ffc93c', '#7cff6a'], names: ['NEON CAFE', 'BURGER', 'ARCADE', 'RAMEN', 'BOUTIQUE', 'PAWN', 'KARAOKE', 'DONUTS', 'CLUB 88'], goods: ['dress', 'box', 'bottle'], glass: '#3a4a7a', ac: true, brick: true };

function dtSkyline(ctx, S, mid = true) {
  const { H, gS, horizon } = S;
  const hg = ctx.createLinearGradient(0, horizon - 200, 0, horizon + 40);
  hg.addColorStop(0, 'rgba(255,46,136,0)'); hg.addColorStop(1, rgba('#ff2e88', 0.12 + 0.25 * S.lights));
  ctx.fillStyle = hg; ctx.fillRect(0, horizon - 200, S.W, 240);
  const far = S.layer('far', 420, (P) => city(P, 301, { minW: 40, maxW: 90, minH: 140, maxH: 400, col: '#24113f', win: ['#ffd86e', '#7fe9ff'], lit: 0.2, wx: 9, wy: 12, ww: 3, wh: 5, gap: 10, beacon: true }));
  S.tile(far, 0.1, horizon + 40, '#24113f');
  if (!mid) return;
  const m = S.layer('mid', 460, (P) => city(P, 302, { minW: 70, maxW: 140, minH: 160, maxH: 420, col: '#341a57', edge: '#4a2a75', win: ['#ffd86e', '#7fe9ff', '#ff9ad5'], lit: 0.32, wx: 12, wy: 14, ww: 5, wh: 7, gap: 26, neon: ['#ff2e88', '#00f0ff', '#b45cff', '#ffc93c'], neonP: 0.55 }));
  S.tile(m, 0.3, bottomAt(gS, H, 0.3, 0.92) + 40, '#341a57');
  if (!S.town) S.post(() => searchlights(ctx, S, ['#7fe9ff', '#ff9ad5'], bottomAt(gS, H, 0.3, 0.92)));
}

function bgDowntown(ctx, S) {
  const { W, H, gS, v, town, time } = S;
  if (v === 1 && !town) return bgTunnel(ctx, S);
  if (v === 3 && !town) { // セントラル公園
    dtSkyline(ctx, S, false);
    const park = S.layer('park', 320, (P) => {
      const g = P.g; const R = rng(331);
      g.fillStyle = '#2a4a3a'; g.beginPath(); g.moveTo(0, 320); for (let x = 0; x <= LW; x += 32) g.lineTo(x, 230 + Math.sin(x / LW * PI * 6) * 14); g.lineTo(LW, 320); g.fill();
      // 池
      g.fillStyle = '#3a5a8a'; g.beginPath(); g.ellipse(520, 290, 180, 18, 0, 0, PI * 2); g.fill();
      P.gl.fillStyle = rgba('#ffd86e', 0.5); for (let i = 0; i < 6; i++) P.gl.fillRect(380 + i * 50, 288, 20, 2);
      for (let i = 0; i < 9; i++) { const x = i * (LW / 9) + R() * 50; wrap(x, 100, (xx) => treeSil(g, xx, 262 + R() * 10, 110 + R() * 70, R() < 0.5 ? '#1f3a2e' : '#24442f', R, '#2f5a3a')); }
      for (let x = 60; x < LW; x += 170) { g.fillStyle = '#1a2a24'; g.fillRect(x, 200, 3, 70); g.beginPath(); g.arc(x + 1.5, 198, 6, 0, PI * 2); g.fill(); P.gl.fillStyle = '#ffe6a0'; P.gl.beginPath(); P.gl.arc(x + 1.5, 198, 4, 0, PI * 2); P.gl.fill(); P.gl.fillStyle = rgba('#ffe6a0', 0.2); P.gl.beginPath(); P.gl.arc(x + 1.5, 198, 16, 0, PI * 2); P.gl.fill(); }
    });
    S.tile(park, 0.3, bottomAt(gS, H, 0.3, 0.92) + 30, '#2a4a3a');
    const near = S.layer('bush', 160, (P) => { const g = P.g; const R = rng(332); g.fillStyle = '#1a3326'; for (let x = 0; x < LW; x += 40) { g.beginPath(); g.ellipse(x + R() * 20, 130, 40 + R() * 20, 26 + R() * 14, 0, 0, PI * 2); g.fill(); } g.fillRect(0, 130, LW, 30); });
    S.tile(near, 0.55, bottomAt(gS, H, 0.55, 0.96) + 20, '#1a3326');
    // ホタル風の光
    S.post(() => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 18; i++) { const bx = ((i * 131 + Math.sin(time * 0.5 + i) * 30 - S.cam.x * 0.4) % W + W) % W, by = H * 0.55 + (i * 37 % 120) + Math.cos(time + i) * 10; ctx.fillStyle = rgba('#e8ffb0', (0.3 + 0.5 * Math.sin(time * 3 + i)) * S.lights); ctx.fillRect(bx, by, 2.5, 2.5); } ctx.restore(); });
    return;
  }
  dtSkyline(ctx, S);
  if (v === 2 && !town) { // 高架ハイウェイ
    const deckY = 120;
    const hw = S.layer('hw', 300, (P) => highwayDeck(P, deckY, '#4a4268', { lamp: '#ffd0a0' }));
    const hb = bottomAt(gS, H, 0.5, 0.95) + 30;
    S.tile(hw, 0.5, hb, '#2a2440');
    S.post(() => carStreaks(ctx, S, hb - 300 + deckY, 0.5));
    return;
  }
  if (town) return townFront(S, 'downtown', DT_SHOP);
  // v0 ネオン裏通り: 非常階段・配管・吊り看板
  const alley = S.layer('alley', 380, (P) => {
    const g = P.g; const R = rng(341);
    let x = 0;
    while (x < LW) {
      const w = 160 + R() * 120, h = 260 + R() * 110, c = pick(R, ['#2a1840', '#321c4a', '#261a3a']), bs = (R() * 1e9) | 0;
      wrap(x, w, (xx) => {
        const r = rng(bs);
        g.fillStyle = c; g.fillRect(xx, 380 - h, w, h);
        g.fillStyle = shade(c, 0.12); for (let yy = 380 - h + 10; yy < 380; yy += 10) g.fillRect(xx, yy, w, 1);
        windowsGrid(P, xx + 10, 380 - h + 20, w - 20, 300, { wx: 34, wy: 46, ww: 20, wh: 26, lit: 0.45, cols: ['#ffd86e', '#ff9ad5', '#7fe9ff'], dim: shade(c, -0.3), pad: 10 }, r);
        // 非常階段
        g.strokeStyle = '#120a20'; g.lineWidth = 2;
        for (let yy = 380 - h + 70; yy < 320; yy += 46) { g.strokeRect(xx + 14, yy, w * 0.5, 4); g.beginPath(); g.moveTo(xx + 18, yy + 4); g.lineTo(xx + w * 0.5 + 10, yy + 46); g.stroke(); for (let k = 0; k < w * 0.5; k += 8) { g.beginPath(); g.moveTo(xx + 14 + k, yy); g.lineTo(xx + 14 + k, yy - 12); g.stroke(); } g.beginPath(); g.moveTo(xx + 14, yy - 12); g.lineTo(xx + 14 + w * 0.5, yy - 12); g.stroke(); }
        // 配管
        g.fillStyle = '#4a3a5a'; g.fillRect(xx + w - 16, 380 - h, 6, h);
        if (r() < 0.7) { // 吊り看板
          const nc = pick(r, NEON_COLS), sy = 380 - h + 60 + r() * 80;
          g.fillStyle = '#120a20'; g.fillRect(xx + w - 40, sy, 30, 70);
          P.gl.fillStyle = rgba(nc, 0.35); P.gl.fillRect(xx + w - 44, sy - 4, 38, 78); P.gl.fillStyle = nc; P.gl.fillRect(xx + w - 36, sy + 6, 22, 58);
          P.gl.fillStyle = 'rgba(255,255,255,0.8)'; for (let k = 0; k < 4; k++) P.gl.fillRect(xx + w - 30, sy + 12 + k * 13, 10, 6);
        }
      });
      x += w + 4;
    }
    // 電線
    g.strokeStyle = '#120a20'; g.lineWidth = 1.5; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 60 + k * 14); for (let xx = 0; xx <= LW; xx += 128) g.quadraticCurveTo(xx + 64, 80 + k * 14, xx + 128, 60 + k * 14); g.stroke(); }
  });
  S.tile(alley, 0.55, bottomAt(gS, H, 0.55, 0.95) + 30, '#1c0d30');
  S.post(() => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ff2e88', 0.08 * S.lights); ctx.fillRect(0, gS - 160, W, 160); ctx.restore(); });
}

// 地下鉄トンネル（屋内）
function bgTunnel(ctx, S) {
  const { W, H, gS, time, cam } = S;
  S.indoor = true;
  ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, W, H);
  const wall = S.layer('wall', 520, (P) => {
    const g = P.g, h = P.h;
    // タイル壁
    g.fillStyle = '#d8d2c0'; g.fillRect(0, 120, LW, 300);
    g.strokeStyle = '#b8b0a0'; g.lineWidth = 1;
    for (let y = 120; y < 420; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(LW, y); g.stroke(); }
    for (let x = 0; x < LW; x += 20) { g.beginPath(); g.moveTo(x, 120); g.lineTo(x, 420); g.stroke(); }
    g.fillStyle = '#2e7bff'; g.fillRect(0, 300, LW, 12); g.fillStyle = '#ffc93c'; g.fillRect(0, 314, LW, 5);
    // 駅名板・ポスター
    for (let x = 80; x < LW; x += 340) {
      g.fillStyle = '#1a1a2a'; g.fillRect(x, 200, 160, 40); g.fillStyle = '#ffffff'; g.font = '900 20px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('VICE LINE', x + 80, 221);
      g.fillStyle = '#8a3a6a'; g.fillRect(x + 200, 170, 70, 100); g.fillStyle = '#ff9ad5'; g.fillRect(x + 206, 176, 58, 60); g.fillStyle = '#ffe066'; g.font = 'bold 12px sans-serif'; g.fillText('NEON', x + 235, 252);
    }
    // 天井
    g.fillStyle = '#3a3448'; g.fillRect(0, 0, LW, 120);
    g.fillStyle = '#2a2436'; for (let x = 0; x < LW; x += 64) g.fillRect(x, 0, 10, 120);
    g.fillStyle = '#4a4458'; g.fillRect(0, 100, LW, 20);
    for (let x = 32; x < LW; x += 128) { g.fillStyle = '#5a5468'; g.fillRect(x, 104, 60, 8); P.gl.fillStyle = '#f0f6ff'; P.gl.fillRect(x + 2, 106, 56, 4); const lg = P.gl.createLinearGradient(0, 110, 0, 260); lg.addColorStop(0, 'rgba(240,246,255,0.3)'); lg.addColorStop(1, 'rgba(240,246,255,0)'); P.gl.fillStyle = lg; P.gl.beginPath(); P.gl.moveTo(x, 110); P.gl.lineTo(x + 60, 110); P.gl.lineTo(x + 110, 260); P.gl.lineTo(x - 50, 260); P.gl.closePath(); P.gl.fill(); }
    // 配管
    g.fillStyle = '#5a4a3a'; g.fillRect(0, 130, LW, 6); g.fillStyle = '#4a5a6a'; g.fillRect(0, 140, LW, 4);
    // 下部（線路側の暗がり）
    g.fillStyle = '#2a2436'; g.fillRect(0, 420, LW, h - 420);
  });
  const wb = bottomAt(gS, H, 0.6, 0.98) + 40;
  S.tile(wall, 0.6, wb, '#2a2436');
  // 天井の上は暗い
  const top = wb - 520;
  if (top > 0) { ctx.fillStyle = '#2a2436'; ctx.fillRect(0, 0, W, top); }
  // 柱（手前・ライブ）
  ctx.fillStyle = '#2a2232';
  const off = -(((cam.x * 0.8) % 300) + 300) % 300;
  for (let x = off; x < W + 300; x += 300) { ctx.fillRect(x, 0, 36, H); S.occlude(x, 0, 36, H); ctx.fillStyle = '#3a3044'; ctx.fillRect(x + 4, 0, 6, H); ctx.fillStyle = '#2a2232'; }
  // 通過する電車の光
  S.post(() => {
    const k = (time % 9) / 9;
    if (k < 0.25) {
      const p = k / 0.25;
      const x = lerp(-600, W + 600, p);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x - 500, 0, x, 0); g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(255,240,200,0.35)');
      ctx.fillStyle = g; ctx.fillRect(x - 500, wb - 200, 500, 90);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(255,230,160,0.5)'; ctx.fillRect(x - 480 + i * 60, wb - 190, 34, 22); }
      ctx.restore();
    }
  });
}

function townFront(S, region, st) {
  const { H, gS } = S;
  const fr = S.layer('front', 300, (P) => shopRow(P, 9000 + S.v * 131 + hashStr(region) % 1000, st));
  S.tile(fr, 0.82, gS + 4, null);
}

// ================================================================ SLUMS
const SL_SHOP = { walls: ['#6a4a4a', '#5a5a6a', '#7a5a3a', '#4a5a5a', '#6a3a4a'], awn: ['#b5523b', '#2f6f73', '#c9a13b', '#6a3a6a'], neon: ['#ff5e5e', '#ffb13b', '#7cff6a'], names: ['MOTEL', 'PAWN', 'LAUNDRY', 'BAIT&TACKLE', 'LIQUOR', 'GARAGE', 'DINER', 'TATTOO'], goods: ['box', 'bottle', 'fish'], glass: '#4a5a6a', ac: true, brick: true, signBg: '#2a1a1a' };

function bgSlums(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  const far = S.layer('far', 260, (P) => {
    const g = P.g; const R = rng(401 + (v === 3 ? 7 : 0));
    g.fillStyle = '#4a2a3a';
    let x = 0;
    while (x < LW) { const w = 80 + R() * 120, h = 40 + R() * 70; wrap(x, w, (xx) => { g.fillRect(xx, 260 - h, w, h); g.beginPath(); g.moveTo(xx, 260 - h); g.lineTo(xx + w / 2, 260 - h - 18); g.lineTo(xx + w, 260 - h); g.fill(); }); x += w + R() * 20; }
    if (v !== 3) for (let i = 0; i < 3; i++) {
      const cx = 120 + i * 340 + R() * 60;
      wrap(cx, 200, (xx) => {
        g.strokeStyle = '#3a2030'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(xx, 260); g.lineTo(xx + 10, 60); g.moveTo(xx + 40, 260); g.lineTo(xx + 30, 60); g.stroke();
        g.lineWidth = 2; g.beginPath(); for (let y = 240; y > 70; y -= 24) { g.moveTo(xx + 2, y); g.lineTo(xx + 38, y - 20); g.moveTo(xx + 38, y); g.lineTo(xx + 2, y - 20); } g.stroke();
        g.lineWidth = 7; g.beginPath(); g.moveTo(xx - 60, 62); g.lineTo(xx + 170, 62); g.stroke();
        g.lineWidth = 1.5; g.beginPath(); g.moveTo(xx + 20, 30); g.lineTo(xx - 60, 62); g.moveTo(xx + 20, 30); g.lineTo(xx + 170, 62); g.moveTo(xx + 20, 30); g.lineTo(xx + 20, 62); g.moveTo(xx + 130, 62); g.lineTo(xx + 130, 130); g.stroke();
        g.fillStyle = '#3a2030'; g.fillRect(xx + 120, 130, 22, 14);
        P.gl.fillStyle = '#ff2e4d'; P.gl.fillRect(xx + 18, 26, 4, 4);
      });
    }
  });
  S.tile(far, 0.08, horizon, null);
  sea(ctx, S, horizon, '#5a4a6a', '#3a3a55', '#2a2a40', 'rgba(200,170,190,0.25)');
  if (v === 2 && !town) { // 密輸船: 甲板からの眺め（マスト・ロープ・ランタン）
    const ship = S.layer('ship', 420, (P) => {
      const g = P.g, h = P.h;
      g.fillStyle = '#3a2430';
      g.fillRect(380, 120, 260, 220); g.fillRect(420, 70, 160, 50); g.fillRect(470, 20, 20, 50);
      windowsGrid(P, 390, 130, 240, 330, { wx: 30, wy: 34, ww: 16, wh: 14, lit: 0.5, cols: ['#ffd86e', '#ffb13b'], dim: '#2a1a24' }, rng(77));
      g.strokeStyle = '#2a1a24'; g.lineWidth = 8; g.beginPath(); g.moveTo(140, h); g.lineTo(140, 10); g.moveTo(860, h); g.lineTo(860, 40); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(60, 80); g.lineTo(220, 80); g.moveTo(790, 100); g.lineTo(930, 100); g.stroke();
      g.lineWidth = 1.5; g.beginPath();
      for (const [mx, my] of [[140, 10], [860, 40]]) for (let k = -4; k <= 4; k++) { g.moveTo(mx, my); g.lineTo(mx + k * 40, h - 60); }
      g.moveTo(140, 10); g.lineTo(860, 40); g.stroke();
      for (const [lx, ly] of [[200, 140], [520, 60], [800, 160], [640, 230]]) { g.fillStyle = '#2a1a24'; g.fillRect(lx - 4, ly - 8, 8, 12); P.gl.fillStyle = '#ffb13b'; P.gl.beginPath(); P.gl.arc(lx, ly, 4, 0, PI * 2); P.gl.fill(); P.gl.fillStyle = rgba('#ffb13b', 0.25); P.gl.beginPath(); P.gl.arc(lx, ly, 18, 0, PI * 2); P.gl.fill(); }
      // 手すり
      g.fillStyle = '#4a2e28'; g.fillRect(0, h - 60, LW, 8); for (let x = 0; x < LW; x += 30) g.fillRect(x, h - 60, 4, 60);
      g.fillStyle = '#2a1a1e'; g.fillRect(0, h - 20, LW, 20);
    });
    S.tile(ship, 0.5, bottomAt(gS, H, 0.5, 0.95) + 20, '#2a1a1e');
    fogBands(ctx, S, horizon - 10, 'rgba(160,140,170,0.14)');
    return;
  }
  if (v === 3 && !town) { // 廃線路: 錆びた車両・電柱
    const rail = S.layer('rail', 260, (P) => {
      const g = P.g, h = P.h; const R = rng(431);
      g.strokeStyle = '#2a1a24'; g.lineWidth = 1.2;
      for (let x = 60; x < LW; x += 200) { g.fillStyle = '#2a1a24'; g.fillRect(x, 20, 6, h - 20); g.fillRect(x - 18, 30, 42, 4); }
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 34 + k * 4); for (let x = 63; x < LW + 200; x += 200) g.quadraticCurveTo(x - 100, 60 + k * 4, x, 34 + k * 4); g.stroke(); }
      for (let i = 0; i < 3; i++) {
        const x = 40 + i * 340 + R() * 60, c = pick(R, ['#6a3a2a', '#3a4a5a', '#5a5a3a']);
        wrap(x, 260, (xx) => {
          g.save(); g.translate(xx + 120, h - 30); g.rotate((R() - 0.5) * 0.08);
          g.fillStyle = c; g.beginPath(); rr(g, -120, -90, 240, 80, 10); g.fill();
          g.fillStyle = shade(c, -0.3); for (let k = 0; k < 6; k++) g.fillRect(-105 + k * 38, -76, 26, 26);
          g.fillStyle = 'rgba(30,20,30,0.5)'; g.fillRect(-120, -40, 240, 4);
          g.fillStyle = '#2a1a24'; g.beginPath(); g.arc(-80, -6, 12, 0, PI * 2); g.arc(80, -6, 12, 0, PI * 2); g.fill();
          g.restore();
        });
      }
      g.fillStyle = '#3a2a2a'; g.fillRect(0, h - 14, LW, 4); g.fillStyle = '#2a1e1e'; for (let x = 0; x < LW; x += 18) g.fillRect(x, h - 10, 10, 10);
      g.fillStyle = '#4a5a2a'; for (let x = 0; x < LW; x += 9) { const hh = 6 + R() * 16; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 3, h - hh); g.lineTo(x + 6, h); g.fill(); }
    });
    S.tile(rail, 0.35, bottomAt(gS, H, 0.35, 0.92) + 30, '#2a1e1e');
    fogBands(ctx, S, H * 0.45, 'rgba(120,90,100,0.15)');
    return;
  }
  // 中景: コンテナ（v1 造船所は巨大な船体）
  if (v === 1 && !town) {
    const hull = S.layer('hull', 360, (P) => {
      const g = P.g, h = P.h;
      g.fillStyle = '#5a3a3a'; g.beginPath(); g.moveTo(100, 120); g.lineTo(900, 120); g.lineTo(850, 300); g.lineTo(160, 300); g.closePath(); g.fill();
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.moveTo(130, 230); g.lineTo(880, 230); g.lineTo(850, 300); g.lineTo(160, 300); g.closePath(); g.fill();
      g.strokeStyle = '#3a2424'; g.lineWidth = 1; for (let x = 120; x < 900; x += 40) { g.beginPath(); g.moveTo(x, 122); g.lineTo(x + 10, 298); g.stroke(); }
      // 足場
      g.strokeStyle = '#2a1a24'; g.lineWidth = 3;
      for (let x = 60; x < 960; x += 60) { g.beginPath(); g.moveTo(x, 80); g.lineTo(x, h); g.stroke(); }
      for (let y = 100; y < h; y += 50) { g.beginPath(); g.moveTo(40, y); g.lineTo(980, y); g.stroke(); }
      g.fillStyle = '#2a1a24'; g.fillRect(0, h - 40, LW, 40);
      for (const x of [200, 520, 780]) { P.gl.fillStyle = '#fff2c0'; P.gl.fillRect(x, 96, 12, 5); const lg = P.gl.createLinearGradient(0, 100, 0, 260); lg.addColorStop(0, 'rgba(255,240,200,0.3)'); lg.addColorStop(1, 'rgba(255,240,200,0)'); P.gl.fillStyle = lg; P.gl.beginPath(); P.gl.moveTo(x, 100); P.gl.lineTo(x + 12, 100); P.gl.lineTo(x + 60, 260); P.gl.lineTo(x - 48, 260); P.gl.closePath(); P.gl.fill(); }
    });
    const hb = bottomAt(gS, H, 0.3, 0.92) + 30;
    S.tile(hull, 0.3, hb, '#2a1a24');
    // 溶接の火花
    S.post(() => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const off = -(((S.cam.x * 0.3) % LW) + LW) % LW;
      for (let b = off; b < W; b += LW) for (const [px, py] of [[300, 180], [640, 150], [820, 210]]) {
        if ((((time * 3 + px) | 0) % 4) === 0) continue;
        const x = b + px, y = hb - 360 + py;
        ctx.fillStyle = 'rgba(180,230,255,0.8)'; ctx.beginPath(); ctx.arc(x, y, 3 + Math.random() * 2, 0, PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,120,0.9)'; for (let k = 0; k < 4; k++) ctx.fillRect(x + (Math.random() - 0.5) * 20, y + Math.random() * 14, 2, 2);
      }
      ctx.restore();
    });
    return;
  }
  const mid = S.layer('mid', 220, (P) => {
    const g = P.g; const R = rng(402);
    const cols = ['#b5523b', '#2f6f73', '#c9a13b', '#6a3a6a', '#3a5a8a'];
    let x = 0;
    while (x < LW) {
      const stacks = 1 + ((R() * 3) | 0), w = 90 + R() * 40, bs = (R() * 1e9) | 0;
      wrap(x, w, (xx) => {
        const r = rng(bs);
        for (let s = 0; s < stacks; s++) {
          const c = cols[(r() * cols.length) | 0], y = 220 - (s + 1) * 38, ox = s ? (r() - 0.5) * 30 : 0;
          g.fillStyle = shade(c, -0.35); g.fillRect(xx + ox, y, w, 38);
          g.strokeStyle = shade(c, -0.55); g.lineWidth = 2; for (let k = 6; k < w; k += 7) { g.beginPath(); g.moveTo(xx + ox + k, y + 3); g.lineTo(xx + ox + k, y + 35); g.stroke(); }
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeRect(xx + ox + 1, y + 1, w - 2, 36);
        }
      });
      x += w + 10 + R() * 80;
    }
  });
  S.tile(mid, 0.25, bottomAt(gS, H, 0.25, 0.9) + 20, '#3a2a3a');
  fogBands(ctx, S, H * 0.38, 'rgba(120,90,100,0.16)');
  if (town) return townFront(S, 'slums', SL_SHOP);
  const near = S.layer('near', 260, (P) => {
    const g = P.g; const R = rng(403);
    let x = 0;
    while (x < LW) {
      const w = 180 + R() * 120, h = 110 + R() * 80, lit = R() < 0.7, lx = 20 + R() * (w - 60);
      wrap(x, w, (xx) => {
        g.fillStyle = '#2b1a2a'; g.fillRect(xx, 260 - h, w, h);
        g.fillStyle = '#3a2438'; for (let k = 0; k < w; k += 22) g.fillRect(xx + k, 260 - h, 2, h);
        g.fillStyle = '#4a3040'; g.fillRect(xx + lx, 260 - h + 20, 24, 14);
        if (lit) { P.gl.fillStyle = 'rgba(255,177,59,0.8)'; P.gl.fillRect(xx + lx, 260 - h + 20, 24, 14); }
      });
      x += w + 40 + R() * 100;
    }
    g.strokeStyle = 'rgba(60,40,60,0.9)'; g.lineWidth = 1;
    for (let k = 0; k < LW; k += 8) { g.beginPath(); g.moveTo(k, 200); g.lineTo(k + 40, 260); g.moveTo(k + 40, 200); g.lineTo(k, 260); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); g.moveTo(0, 200); g.lineTo(LW, 200); g.stroke();
    g.fillStyle = 'rgba(60,40,60,0.9)'; for (let k = 0; k < LW; k += 64) g.fillRect(k, 196, 3, 64);
  });
  const nb = bottomAt(gS, H, 0.5, 0.95) + 10;
  S.tile(near, 0.5, nb, '#2b1a2a');
  S.post(() => neonRepeat(ctx, S, 0.5, 620, nb - 210, 'MOTEL', '#ff5e5e', 22, true));
}

// ================================================================ SWAMP
const SW_SHOP = { walls: ['#6a5a3a', '#5a4a3a', '#4a5a4a', '#7a6a4a'], awn: ['#4e7a3a', '#c9a13b', '#7a3a2a'], neon: ['#c8ff5a', '#ff7ad9', '#ffb13b'], names: ['BAIT SHOP', 'GATOR TOURS', 'BBQ', 'GENERAL', 'BOAT RENT', 'VOODOO'], goods: ['fish', 'bottle', 'box'], glass: '#4a6a5a', signBg: '#1a2a1a', inner: '#ffd890' };

function bgSwamp(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  const far = S.layer('far', 260, (P) => { const R = rng(501 + v); for (let i = 0; i < 9; i++) { const x = i * (LW / 9) + R() * 60; wrap(x, 140, (xx) => cypress(P.g, xx, 260, 140 + R() * 100, '#3a5550', R)); } P.g.fillStyle = '#3a5550'; P.g.fillRect(0, 250, LW, 10); });
  S.tile(far, 0.08, horizon, null);
  const wg = ctx.createLinearGradient(0, horizon, 0, H);
  wg.addColorStop(0, v === 2 ? '#3f6a5a' : '#4f7a6a'); wg.addColorStop(1, '#1f3f36');
  ctx.fillStyle = wg; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = 'rgba(111,191,160,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 20; i++) { const yy = horizon + 8 + ((i * 29) % 140); const xx = ((i * 173 - S.cam.x * 0.15 + Math.sin(time + i) * 10) % W + W) % W; ctx.moveTo(xx, yy); ctx.lineTo(xx + 30, yy); }
  ctx.stroke();
  fogBands(ctx, S, horizon - 40, 'rgba(190,230,200,0.12)');
  if ((v === 3 || town) ) { // 霧の水路 / グレイズ村: 高床の家
    const stilt = S.layer('stilt', 300, (P) => {
      const g = P.g, h = P.h; const R = rng(531 + (town ? 9 : 0));
      let x = 20;
      while (x < LW) {
        const w = 120 + R() * 80, bh = 70 + R() * 40, c = pick(R, ['#3a3a2a', '#4a3a2a', '#2f3a30']), bs = (R() * 1e9) | 0;
        wrap(x, w, (xx) => {
          const r = rng(bs);
          g.fillStyle = '#2a2418'; for (let k = 8; k < w; k += 30) g.fillRect(xx + k, h - 90, 5, 90);
          g.fillStyle = c; g.fillRect(xx, h - 90 - bh, w, bh);
          g.fillStyle = shade(c, -0.2); g.beginPath(); g.moveTo(xx - 10, h - 90 - bh); g.lineTo(xx + w / 2, h - 120 - bh); g.lineTo(xx + w + 10, h - 90 - bh); g.closePath(); g.fill();
          g.fillStyle = '#4a3a2a'; g.fillRect(xx - 20, h - 92, w + 40, 6);
          for (let k = 0; k < 2; k++) { const wx = xx + 16 + k * (w - 50), wy = h - 70 - bh; g.fillStyle = '#1a1a14'; g.fillRect(wx, wy + 10, 20, 18); if (r() < 0.75) { P.gl.fillStyle = '#ffd890'; P.gl.fillRect(wx + 1, wy + 11, 18, 16); } }
          if (r() < 0.6) { P.gl.fillStyle = '#ffb860'; P.gl.beginPath(); P.gl.arc(xx + w - 6, h - 84, 3, 0, PI * 2); P.gl.fill(); P.gl.fillStyle = rgba('#ffb860', 0.25); P.gl.beginPath(); P.gl.arc(xx + w - 6, h - 84, 14, 0, PI * 2); P.gl.fill(); }
        });
        x += w + 60 + R() * 80;
      }
      g.fillStyle = '#3a2e20'; g.fillRect(0, h - 30, LW, 6); for (let x2 = 0; x2 < LW; x2 += 40) g.fillRect(x2, h - 30, 4, 30);
    });
    S.tile(stilt, 0.3, bottomAt(gS, H, 0.3, 0.92) + 30, '#1f3f36');
    fogBands(ctx, S, bottomAt(gS, H, 0.3, 0.92) - 90, 'rgba(200,235,210,0.2)', 0.7);
    if (v === 3 && !town) fogBands(ctx, S, H * 0.62, 'rgba(210,240,220,0.22)', 1.2);
    if (town) townFront(S, 'swamp', SW_SHOP);
  } else {
    const mid = S.layer('mid', 340, (P) => { const R = rng(502 + v); const n = v === 1 ? 8 : 5; for (let i = 0; i < n; i++) { const x = i * (LW / n) + R() * 60; wrap(x, 200, (xx) => mangroveSil(P.g, xx, 340, 200 + R() * 110, v === 2 ? '#14221c' : '#1a2a22', R)); } });
    S.tile(mid, 0.3, bottomAt(gS, H, 0.3, 0.92) + 30, '#1a2a22');
    fogBands(ctx, S, bottomAt(gS, H, 0.3, 0.92) - 60, 'rgba(190,230,200,0.16)', 1.4);
    if (v === 1) { // 垂れ下がるツタ
      const vines = S.layer('vines', 200, (P) => { const g = P.g; const R = rng(541); g.strokeStyle = '#2a4a2a'; g.lineWidth = 2.5; for (let x = 0; x < LW; x += 22) { const l = 40 + R() * 150; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (R() - 0.5) * 20, l / 2, x + (R() - 0.5) * 10, l); g.stroke(); g.fillStyle = '#3a6a3a'; for (let y = 10; y < l; y += 14) { g.beginPath(); g.ellipse(x + (R() - 0.5) * 6, y, 4, 2, R(), 0, PI * 2); g.fill(); } } g.fillStyle = '#1a2a1a'; g.fillRect(0, 0, LW, 8); });
      S.tile(vines, 0.6, 200 - S.cam.y * 0.05, null);
    }
    if (v === 2) { // ワニの巣: 葦と水面の光る目
      const reeds = S.layer('reeds', 160, (P) => { const g = P.g; const R = rng(551); for (let x = 0; x < LW; x += 6) { const hh = 40 + R() * 100; g.strokeStyle = R() < 0.5 ? '#2a3a22' : '#22301c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 160); g.quadraticCurveTo(x + (R() - 0.5) * 16, 160 - hh / 2, x + (R() - 0.5) * 20, 160 - hh); g.stroke(); if (R() < 0.15) { g.fillStyle = '#4a3a22'; g.fillRect(x - 2, 160 - hh, 5, 14); } } });
      S.tile(reeds, 0.65, bottomAt(gS, H, 0.65, 0.97) + 10, null);
      S.post(() => {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const ph = (time * 0.3 + i * 0.37) % 1;
          if (ph > 0.7) continue;
          const x = ((i * 233 - S.cam.x * 0.2) % W + W) % W, y = horizon + 30 + (i * 41) % 90;
          const a = Math.sin(ph / 0.7 * PI) * 0.9;
          ctx.fillStyle = rgba('#ffe14a', a); ctx.beginPath(); ctx.ellipse(x, y, 3, 1.6, 0, 0, PI * 2); ctx.ellipse(x + 10, y, 3, 1.6, 0, 0, PI * 2); ctx.fill();
          ctx.fillStyle = rgba('#ffe14a', a * 0.25); ctx.beginPath(); ctx.arc(x + 5, y, 12, 0, PI * 2); ctx.fill();
        }
        ctx.restore();
      });
    }
  }
  // 蛍
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const k = 0.4 + S.lights * 0.6;
    for (let i = 0; i < 36; i++) {
      const R = (i * 9301 + 49297) % 233280 / 233280;
      const bx = ((i * 97 + Math.sin(time * 0.5 + i) * 40 - S.cam.x * (0.2 + R * 0.3)) % (W + 40) + W + 40) % (W + 40) - 20;
      const by = H * 0.4 + R * H * 0.5 + Math.cos(time * 0.7 + i * 2) * 20;
      const a = (0.5 + 0.5 * Math.sin(time * 3 + i * 1.7)) * k;
      ctx.fillStyle = rgba('#c8ff5a', 0.25 * a); ctx.beginPath(); ctx.arc(bx, by, 6, 0, PI * 2); ctx.fill();
      ctx.fillStyle = rgba('#f0ffb0', a); ctx.fillRect(bx - 1, by - 1, 2.5, 2.5);
    }
    ctx.restore();
  });
}

// ================================================================ CASINO
const CA_SHOP = { walls: ['#3a1660', '#5a1a4a', '#2a1a4a', '#6a2a3a'], awn: ['#ffd23f', '#ff2e88', '#e53935'], neon: ['#ffd23f', '#ff2e88', '#00f0ff', '#ffffff'], names: ['JACKPOT', 'CHAPEL', 'BUFFET', 'LUCKY 7', 'POKER', 'GOLD PAWN', 'SHOWTIME'], goods: ['chip', 'bottle', 'dress'], glass: '#5a2a6a', signBg: '#1a0a20', inner: '#ffe6a0' };

function casinoFacades(ctx, S) {
  const { W, H, gS, time, cam } = S;
  // [x, 幅, 高さ]。屋根の張り出し(±10px)を含めても隣と重ならない間隔にする
  const fac = [[30, 280, 200], [350, 310, 260], [700, 280, 240]];
  const mid = S.layer('fac', 360, (P) => {
    const g = P.g; const R = rng(602);
    for (const [fx, fw, fh] of fac) {
      wrap(fx, fw, (xx) => {
        g.fillStyle = '#2a0f45'; g.fillRect(xx, 360 - fh, fw, fh);
        g.fillStyle = '#3a1660'; g.beginPath(); g.moveTo(xx - 10, 360 - fh); g.lineTo(xx + fw / 2, 360 - fh - 50); g.lineTo(xx + fw + 10, 360 - fh); g.fill();
        g.strokeStyle = '#a8862c'; g.lineWidth = 3; g.strokeRect(xx + 10, 360 - fh + 20, fw - 20, 60);
        g.fillStyle = '#ffc93c'; g.fillRect(xx, 360 - fh, fw, 3);
        P.gl.strokeStyle = '#ffd23f'; P.gl.lineWidth = 2; P.gl.strokeRect(xx + 10, 360 - fh + 20, fw - 20, 60);
        windowsGrid(P, xx + 10, 360 - fh + 96, fw - 20, 352, { wx: 18, wy: 22, ww: 8, wh: 10, lit: 0.6, cols: ['#ff9ad5', '#ffd86e'], dim: '#3a1a55', pad: 4 }, R);
      });
    }
  });
  const midB = bottomAt(gS, H, 0.3, 0.92) + 40;
  S.tile(mid, 0.3, midB, '#2a0f45');
  const names = ['LUCKY 7', 'GOLD PALACE', 'NEON STAR'];
  S.post(() => {
    const off = -(((cam.x * 0.3) % LW) + LW) % LW;
    for (let base = off; base < W; base += LW) {
      for (let i = 0; i < fac.length; i++) {
        const [fx, fw, fh] = fac[i];
        const x = base + fx, y = midB - fh;
        if (x > W + 20 || x + fw < -20) continue;
        ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * S.lights;
        neonText(ctx, x + fw / 2, y + 50, names[i], i === 1 ? '#ffd23f' : '#ff2e88', S.lights > 0.2 ? 1 : 0, fitSize(ctx, names[i], 26, fw - 50));
        const n = Math.floor(fw / 12);
        for (let k = 0; k < n; k++) {
          const on = ((k + Math.floor(time * 10)) % 3) === 0;
          ctx.fillStyle = on ? '#fff6c0' : 'rgba(255,201,60,0.35)';
          ctx.fillRect(x + 6 + k * 12, y + 14, 3, 3); ctx.fillRect(x + 6 + k * 12, y + 84, 3, 3);
        }
        ctx.restore();
      }
    }
  });
}

function bgCasino(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  if (v === 1 && !town) return bgVault(ctx, S);
  if (v === 2 && !town) return bgVIP(ctx, S);
  if (v === 0 && !town) { // 砂漠ハイウェイ
    const mesa = S.layer('mesa', 240, (P) => {
      const g = P.g, h = P.h; const R = rng(611);
      g.fillStyle = '#8a4a5a';
      let x = 0; while (x < LW) { const w = 120 + R() * 200, mh = 60 + R() * 120; wrap(x, w, (xx) => { g.beginPath(); g.moveTo(xx, h); g.lineTo(xx + 20, h - mh); g.lineTo(xx + w - 20, h - mh); g.lineTo(xx + w, h); g.fill(); g.fillStyle = '#9a5a62'; g.fillRect(xx + 20, h - mh, w - 40, 6); g.fillStyle = '#8a4a5a'; }); x += w + 40 + R() * 140; }
    });
    S.tile(mesa, 0.05, horizon + 20, null);
    // 遠くのストリップの光
    const strip = S.layer('strip', 160, (P) => city(P, 621, { minW: 14, maxW: 40, minH: 30, maxH: 140, col: '#3a1a4a', win: ['#ffd23f', '#ff2e88', '#00f0ff'], lit: 0.5, wx: 6, wy: 7, ww: 2, wh: 3, gap: 30 }));
    S.tile(strip, 0.08, horizon + 20, null);
    ctx.fillStyle = '#d8985a'; ctx.fillRect(0, horizon + 20, W, H - horizon);
    const des = S.layer('desert', 260, (P) => {
      const g = P.g, h = P.h; const R = rng(631);
      g.fillStyle = '#c8804a'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= LW; x += 32) g.lineTo(x, 200 + Math.sin(x / LW * PI * 4) * 12); g.lineTo(LW, h); g.fill();
      for (let i = 0; i < 7; i++) { const x = i * (LW / 7) + R() * 60, ch = 60 + R() * 70; wrap(x, 60, (xx) => { g.fillStyle = '#3a5a3a'; g.beginPath(); rr(g, xx - 8, 205 - ch, 16, ch, 8); g.fill(); g.beginPath(); rr(g, xx - 28, 205 - ch * 0.7, 10, ch * 0.4, 5); rr(g, xx + 16, 205 - ch * 0.85, 10, ch * 0.45, 5); g.fill(); g.fillRect(xx - 24, 205 - ch * 0.36, 20, 8); g.fillRect(xx + 6, 205 - ch * 0.46, 16, 8); }); }
      // 看板
      g.fillStyle = '#2a1a3a'; g.fillRect(600, 60, 8, 150); g.fillRect(700, 60, 8, 150); g.fillStyle = '#ff2e88'; g.fillRect(580, 30, 150, 60);
      g.font = '900 16px "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.fillText('GOLDEN STRIP', 655, 58); g.font = 'bold 12px sans-serif'; g.fillStyle = '#ffe066'; g.fillText('12 MILES →', 655, 78);
      P.gl.strokeStyle = '#ffd23f'; P.gl.lineWidth = 2; P.gl.strokeRect(583, 33, 144, 54);
    });
    S.tile(des, 0.3, bottomAt(gS, H, 0.3, 0.92) + 30, '#c8804a');
    return;
  }
  if (!town) S.post(() => searchlights(ctx, S, ['#ffd23f', '#ff2e88'], horizon));
  const far = S.layer('far', 420, (P) => city(P, 601, { minW: 50, maxW: 110, minH: 160, maxH: 400, col: '#1f0e33', win: ['#ffd23f', '#ff9ad5'], lit: 0.2, wx: 10, wy: 12, ww: 4, wh: 5, gap: 14, trim: '#a8862c', beacon: true }));
  S.tile(far, 0.1, horizon + 40, '#1f0e33');
  if (town) return townFront(S, 'casino', CA_SHOP);
  casinoFacades(ctx, S);
}

function bgVault(ctx, S) {
  const { W, H, gS, time } = S;
  S.indoor = true;
  ctx.fillStyle = '#2a2a36'; ctx.fillRect(0, 0, W, H);
  const wall = S.layer('vault', 560, (P) => {
    const g = P.g, h = P.h;
    g.fillStyle = '#4a4a5a'; g.fillRect(0, 0, LW, h);
    for (let x = 0; x < LW; x += 128) for (let y = 0; y < h; y += 96) { g.fillStyle = '#545468'; g.fillRect(x + 4, y + 4, 120, 88); g.fillStyle = '#3a3a4a'; for (const [bx, by] of [[10, 10], [114, 10], [10, 82], [114, 82]]) { g.beginPath(); g.arc(x + bx, y + by, 3, 0, PI * 2); g.fill(); } }
    // 巨大な金庫扉
    const cx = 512, cy = 250, r = 150;
    g.fillStyle = '#2a2a36'; g.beginPath(); g.arc(cx, cy, r + 14, 0, PI * 2); g.fill();
    const dg = g.createRadialGradient(cx - 40, cy - 40, 10, cx, cy, r); dg.addColorStop(0, '#d8dce8'); dg.addColorStop(1, '#7a7e90');
    g.fillStyle = dg; g.beginPath(); g.arc(cx, cy, r, 0, PI * 2); g.fill();
    g.strokeStyle = '#5a5e70'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r - 24, 0, PI * 2); g.stroke();
    g.lineWidth = 10; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); } g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(cx, cy, 26, 0, PI * 2); g.fill();
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; g.fillStyle = '#3a3a4a'; g.fillRect(cx + Math.cos(a) * (r - 6) - 8, cy + Math.sin(a) * (r - 6) - 8, 16, 16); }
    // 金塊の山
    for (const [gx, n] of [[120, 4], [840, 5]]) for (let row = 0; row < n; row++) for (let k = 0; k < n - row; k++) {
      const x = gx + k * 34 + row * 17, y = h - 30 - row * 16;
      g.fillStyle = '#c99a1a'; g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + 4, y); g.lineTo(x + 28, y); g.lineTo(x + 32, y + 14); g.closePath(); g.fill();
      g.fillStyle = '#ffe066'; g.fillRect(x + 6, y + 2, 20, 4);
      P.gl.fillStyle = rgba('#ffd23f', 0.25); P.gl.fillRect(x + 4, y, 24, 6);
    }
    g.fillStyle = '#2a2a36'; g.fillRect(0, h - 14, LW, 14);
    for (let x = 60; x < LW; x += 220) { P.gl.fillStyle = '#ff2e4d'; P.gl.beginPath(); P.gl.arc(x, 40, 5, 0, PI * 2); P.gl.fill(); }
  });
  const wb = bottomAt(gS, H, 0.5, 0.98) + 30;
  S.tile(wall, 0.5, wb, '#2a2a36');
  if (wb - 560 > 0) { ctx.fillStyle = '#3a3a4a'; ctx.fillRect(0, 0, W, wb - 560); }
  // レーザーグリッド
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const y = wb - 120 - i * 70 + Math.sin(time * 1.2 + i) * 30;
      const a = 0.35 + 0.25 * Math.sin(time * 6 + i);
      ctx.strokeStyle = rgba('#ff2e4d', a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 40 * Math.sin(i)); ctx.stroke();
      ctx.strokeStyle = rgba('#ff2e4d', a * 0.3); ctx.lineWidth = 7; ctx.stroke();
    }
    ctx.restore();
  });
}

function bgVIP(ctx, S) {
  const { W, H, gS, time, horizon } = S;
  S.indoor = true;
  // 窓の向こうの夜景（窓枠で切り抜く）
  const far = S.layer('far', 420, (P) => city(P, 641, { minW: 40, maxW: 90, minH: 120, maxH: 380, col: '#24123a', win: ['#ffd23f', '#ff9ad5', '#7fe9ff'], lit: 0.3, wx: 9, wy: 12, ww: 3, wh: 5, gap: 10, beacon: true }));
  S.tile(far, 0.06, horizon + 60, '#24123a');
  const room = S.layer('room', 620, (P) => {
    const g = P.g, h = P.h;
    // 壁（窓をくり抜き）
    g.fillStyle = '#4a0f2a'; g.fillRect(0, 0, LW, h);
    g.globalCompositeOperation = 'destination-out';
    for (let x = 60; x < LW; x += 256) { g.beginPath(); g.moveTo(x, 420); g.lineTo(x, 140); g.quadraticCurveTo(x + 70, 60, x + 140, 140); g.lineTo(x + 140, 420); g.closePath(); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#ffc93c'; g.lineWidth = 6;
    for (let x = 60; x < LW; x += 256) { g.beginPath(); g.moveTo(x, 420); g.lineTo(x, 140); g.quadraticCurveTo(x + 70, 60, x + 140, 140); g.lineTo(x + 140, 420); g.closePath(); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(x + 70, 92); g.lineTo(x + 70, 420); g.moveTo(x, 260); g.lineTo(x + 140, 260); g.stroke(); g.lineWidth = 6; }
    // カーテン
    for (let x = 60; x < LW; x += 256) for (const sd of [0, 1]) {
      const cx = sd ? x + 150 : x - 30;
      g.fillStyle = '#a8102a'; g.beginPath(); g.moveTo(cx, 40); g.quadraticCurveTo(cx + 20 + (sd ? -10 : 10), 260, cx + (sd ? -6 : 36), 440); g.lineTo(cx + 30, 440); g.quadraticCurveTo(cx + 40, 240, cx + 30, 40); g.closePath(); g.fill();
      g.fillStyle = '#d8203a'; for (let k = 0; k < 3; k++) g.fillRect(cx + 6 + k * 8, 40, 2, 400);
    }
    g.fillStyle = '#7a1030'; g.fillRect(0, 20, LW, 26); g.fillStyle = '#ffc93c'; g.fillRect(0, 44, LW, 4);
    // 金の柱
    for (let x = 220; x < LW; x += 256) { const cg = g.createLinearGradient(x, 0, x + 34, 0); cg.addColorStop(0, '#a8862c'); cg.addColorStop(0.5, '#ffe9a0'); cg.addColorStop(1, '#8a6a1c'); g.fillStyle = cg; g.fillRect(x, 48, 34, h - 48); }
    // 腰壁
    g.fillStyle = '#2a0818'; g.fillRect(0, 440, LW, h - 440); g.fillStyle = '#ffc93c'; g.fillRect(0, 440, LW, 4);
    for (let x = 0; x < LW; x += 64) { g.strokeStyle = '#5a1a30'; g.lineWidth = 2; g.strokeRect(x + 8, 460, 48, 100); }
    // シャンデリア（glow）
    for (let x = 190; x < LW; x += 512) {
      g.strokeStyle = '#a8862c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 60); g.stroke();
      for (let k = -3; k <= 3; k++) { P.gl.fillStyle = '#fff6c0'; P.gl.beginPath(); P.gl.arc(x + k * 14, 74 + Math.abs(k) * -3, 3.5, 0, PI * 2); P.gl.fill(); }
      const cg = P.gl.createRadialGradient(x, 72, 4, x, 72, 90); cg.addColorStop(0, 'rgba(255,240,190,0.45)'); cg.addColorStop(1, 'rgba(255,240,190,0)');
      P.gl.fillStyle = cg; P.gl.beginPath(); P.gl.arc(x, 72, 90, 0, PI * 2); P.gl.fill();
    }
  });
  const rb = bottomAt(gS, H, 0.55, 0.98) + 30;
  S.tile(room, 0.55, rb, '#2a0818');
  if (rb - 620 > 0) { ctx.fillStyle = '#4a0f2a'; ctx.fillRect(0, 0, W, rb - 620); }
}

// ================================================================ ROOFTOP
const RT_SHOP = { walls: ['#2e2a48', '#3a3458', '#24203a', '#4a4068'], awn: ['#b45cff', '#00f0ff', '#ffd23f'], neon: ['#b45cff', '#00f0ff', '#ff2e88', '#ffffff'], names: ['SKY LOUNGE', 'BOUTIQUE', 'SUSHI', 'JEWELRY', 'GALLERY', 'SPA', 'PENT BAR'], goods: ['dress', 'bottle', 'box'], glass: '#3a4a7a', signBg: '#120a24' };

function bgRooftop(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  const city2 = S.layer('city', 220, (P) => {
    const g = P.g; const R = rng(701);
    const grd = g.createLinearGradient(0, 0, 0, 220); grd.addColorStop(0, 'rgba(30,20,80,0)'); grd.addColorStop(1, '#1e1450');
    g.fillStyle = grd; g.fillRect(0, 0, LW, 220);
    g.fillStyle = '#2a1c5e';
    for (let x = 0; x < LW;) { const w = 14 + R() * 30, h = 20 + R() * 70; g.fillRect(x, 90 - h, w, h + 130); x += w + R() * 6; }
    const cols = ['#ffd86e', '#00f0ff', '#ff2e88', '#ffffff'];
    const gl = P.gl;
    for (let i = 0; i < 1100; i++) {
      const y = 30 + Math.pow(R(), 0.7) * 190, x = R() * LW;
      gl.fillStyle = cols[(R() * cols.length) | 0]; gl.globalAlpha = 0.45 + R() * 0.55;
      const s = y > 140 ? 2.5 : y > 80 ? 1.6 : 1;
      gl.fillRect(x, y, s, s);
      if (i % 4 === 0) { g.fillStyle = '#3a2c6e'; g.fillRect(x, y, s, s); }
    }
    gl.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const x = R() * LW, y = 100 + R() * 110; const c = cols[(R() * 3) | 0]; const gg = gl.createRadialGradient(x, y, 0, x, y, 8); gg.addColorStop(0, rgba(c, 0.5)); gg.addColorStop(1, rgba(c, 0)); gl.fillStyle = gg; gl.fillRect(x - 8, y - 8, 16, 16); }
  });
  S.tile(city2, 0.04, horizon + 140, '#1e1450');
  if (v === 2 && !town) { // ペントハウス（ガラス窓越しの夜景）
    S.indoor = true;
    const room = S.layer('pent', 620, (P) => {
      const g = P.g, h = P.h;
      g.fillStyle = '#1a1830'; g.fillRect(0, 0, LW, h);
      g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 60, LW, 380); g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(150,180,255,0.08)'; g.fillRect(0, 60, LW, 380);
      g.fillStyle = '#2a2848'; for (let x = 0; x < LW; x += 170) g.fillRect(x, 60, 10, 380); g.fillRect(0, 250, LW, 6);
      g.fillStyle = 'rgba(255,255,255,0.07)'; for (let x = 20; x < LW; x += 170) { g.beginPath(); g.moveTo(x + 20, 60); g.lineTo(x + 60, 60); g.lineTo(x + 10, 440); g.lineTo(x - 30, 440); g.closePath(); g.fill(); }
      g.fillStyle = '#6a5a7a'; g.fillRect(0, 440, LW, h - 440); g.fillStyle = '#c8a050'; g.fillRect(0, 440, LW, 5); g.fillStyle = '#7a6a8a'; for (let x = 0; x < LW; x += 96) g.fillRect(x, 445, 2, h - 445);
      // ソファ・ランプ・グランドピアノのシルエット
      for (let x = 80; x < LW; x += 340) { g.fillStyle = '#5a3a6a'; g.beginPath(); rr(g, x, 380, 180, 60, 18); g.fill(); g.fillStyle = '#7a4a8a'; g.beginPath(); rr(g, x + 10, 395, 160, 30, 10); g.fill(); g.fillStyle = '#c8a050'; g.fillRect(x + 210, 330, 4, 110); g.fillStyle = '#f0e0b0'; g.beginPath(); g.moveTo(x + 196, 330); g.lineTo(x + 228, 330); g.lineTo(x + 222, 310); g.lineTo(x + 202, 310); g.closePath(); g.fill(); P.gl.fillStyle = 'rgba(255,230,170,0.4)'; P.gl.beginPath(); P.gl.arc(x + 212, 322, 30, 0, PI * 2); P.gl.fill(); }
      g.fillStyle = '#c8a050'; g.fillRect(0, 50, LW, 10);
    });
    const rb = bottomAt(gS, H, 0.55, 0.98) + 30;
    S.tile(room, 0.55, rb, '#6a5a7a');
    if (rb - 620 > 0) { ctx.fillStyle = '#1a1830'; ctx.fillRect(0, 0, W, rb - 620); }
    return;
  }
  // ヘリ
  S.post(() => { const hx = ((time * 40) % (W + 400)) - 200 - S.cam.x * 0.02; heli(ctx, hx, H * 0.22 + Math.sin(time * 0.8) * 14, time, H, S.lights); });
  if (v === 0 && !town) { // 工事現場の足場
    const site = S.layer('site', 420, (P) => {
      const g = P.g, h = P.h;
      g.strokeStyle = '#3a3048'; g.lineWidth = 6;
      for (let x = 0; x < LW; x += 96) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x, h); g.stroke(); }
      for (let y = 80; y < h; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(LW, y); g.stroke(); }
      g.lineWidth = 2; g.beginPath(); for (let x = 0; x < LW; x += 96) for (let y = 80; y < h - 80; y += 80) { g.moveTo(x, y); g.lineTo(x + 96, y + 80); } g.stroke();
      // タワークレーン
      lattice(g, 700, h, 24, 380, '#c89a2a', 2);
      g.strokeStyle = '#c89a2a'; g.lineWidth = 6; g.beginPath(); g.moveTo(560, 40); g.lineTo(1000, 40); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(712, 0); g.lineTo(560, 40); g.moveTo(712, 0); g.lineTo(1000, 40); g.moveTo(900, 40); g.lineTo(900, 160); g.stroke();
      g.fillStyle = '#c89a2a'; g.fillRect(890, 160, 22, 14); g.fillRect(560, 32, 40, 24);
      P.gl.fillStyle = '#ff2e4d'; P.gl.beginPath(); P.gl.arc(712, 0 + 3, 4, 0, PI * 2); P.gl.arc(1000, 38, 4, 0, PI * 2); P.gl.fill();
      // 防護ネット
      g.fillStyle = 'rgba(80,140,120,0.35)'; g.fillRect(100, 100, 300, 240);
      for (let x = 100; x < 400; x += 60) { P.gl.fillStyle = '#ffd86e'; P.gl.fillRect(x + 20, 180, 4, 4); }
    });
    S.tile(site, 0.35, bottomAt(gS, H, 0.35, 0.95) + 40, '#24203a');
    return;
  }
  if (v === 1 && !town) { // 空中庭園
    const garden = S.layer('garden', 340, (P) => {
      const g = P.g, h = P.h; const R = rng(731);
      // ガラスドーム温室
      g.fillStyle = 'rgba(160,220,255,0.18)'; g.beginPath(); g.ellipse(512, h - 40, 220, 200, 0, PI, 0); g.fill();
      g.strokeStyle = '#7a8ab0'; g.lineWidth = 3; g.beginPath(); g.ellipse(512, h - 40, 220, 200, 0, PI, 0); g.stroke();
      g.lineWidth = 1.5; g.beginPath(); for (let k = 1; k < 8; k++) { const a = PI + (k / 8) * PI; g.moveTo(512, h - 240); g.lineTo(512 + Math.cos(a) * 220, h - 40 + Math.sin(a) * 200); } for (let k = 1; k < 4; k++) g.ellipse(512, h - 40, 220 * k / 4, 200 * k / 4, 0, PI, 0); g.stroke();
      for (let i = 0; i < 10; i++) { const x = i * (LW / 10) + R() * 40; wrap(x, 80, (xx) => treeSil(g, xx, h - 30, 70 + R() * 70, R() < 0.5 ? '#1f4a3a' : '#2a5a3a', R, '#3a7a4a')); }
      g.fillStyle = '#5a4a3a'; g.fillRect(0, h - 40, LW, 40); g.fillStyle = '#3a8a4a'; g.fillRect(0, h - 44, LW, 6);
      // ストリングライト
      g.strokeStyle = '#2a2040'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 60); for (let x = 0; x <= LW; x += 128) g.quadraticCurveTo(x + 64, 100, x + 128, 60); g.stroke();
      for (let x = 8; x < LW; x += 16) { const y = 60 + Math.sin(((x % 128) / 128) * PI) * 20; P.gl.fillStyle = NEON_COLS[(x / 16 | 0) % 5]; P.gl.beginPath(); P.gl.arc(x, y + 3, 2.6, 0, PI * 2); P.gl.fill(); }
    });
    S.tile(garden, 0.35, bottomAt(gS, H, 0.35, 0.95) + 30, '#5a4a3a');
    return;
  }
  const mid = S.layer('mid', 300, (P) => {
    const g = P.g; const R = rng(702);
    let x = 0;
    while (x < LW) {
      const w = 120 + R() * 140, h = 60 + R() * 160, tank = R() < 0.5, tx = 20 + R() * (w - 60), ant = R() < 0.5, bs = (R() * 1e9) | 0;
      wrap(x, w, (xx) => {
        const r = rng(bs);
        g.fillStyle = '#2a2050'; g.fillRect(xx, 300 - h, w, h);
        g.fillStyle = '#3a3168'; g.fillRect(xx - 4, 300 - h, w + 8, 6);
        if (tank) { g.fillStyle = '#3a3552'; g.fillRect(xx + tx, 300 - h - 40, 32, 30); g.beginPath(); g.moveTo(xx + tx - 3, 300 - h - 40); g.lineTo(xx + tx + 16, 300 - h - 54); g.lineTo(xx + tx + 35, 300 - h - 40); g.fill(); g.fillRect(xx + tx + 3, 300 - h - 10, 3, 10); g.fillRect(xx + tx + 26, 300 - h - 10, 3, 10); }
        if (ant) { g.fillStyle = '#3a3552'; g.fillRect(xx + w - 30, 300 - h - 70, 3, 70); P.gl.fillStyle = '#ff2e4d'; P.gl.fillRect(xx + w - 30, 300 - h - 73, 4, 4); }
        windowsGrid(P, xx + 4, 300 - h + 10, w - 8, 296, { wx: 14, wy: 16, ww: 6, wh: 7, lit: 0.3, cols: ['#ffd86e', '#7fe9ff'], dim: '#322a5e' }, r);
      });
      x += w + 60 + R() * 120;
    }
  });
  const mb = bottomAt(gS, H, 0.25, 0.95) + 60;
  S.tile(mid, 0.25, mb, '#2a2050');
  if (town) townFront(S, 'rooftop', RT_SHOP);
}

function heli(ctx, x, y, time, H, lights) {
  ctx.save();
  if (lights > 0.2) {
    ctx.globalCompositeOperation = 'lighter';
    const a = PI / 2 + Math.sin(time * 0.9) * 0.4;
    const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * H, y + Math.sin(a) * H);
    g.addColorStop(0, rgba('#e6f0ff', 0.3 * lights)); g.addColorStop(1, 'rgba(230,240,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y + 6);
    ctx.lineTo(x + Math.cos(a - 0.12) * H, y + Math.sin(a - 0.12) * H); ctx.lineTo(x + Math.cos(a + 0.12) * H, y + Math.sin(a + 0.12) * H); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = '#0c0820';
  ctx.beginPath(); ctx.ellipse(x, y, 22, 10, 0, 0, PI * 2); ctx.fill();
  ctx.fillRect(x - 50, y - 3, 34, 5); ctx.fillRect(x - 52, y - 10, 5, 12);
  ctx.fillRect(x - 2, y - 14, 4, 6);
  const r = Math.abs(Math.sin(time * 30)) * 36 + 4;
  ctx.fillRect(x - r, y - 15, r * 2, 2);
  ctx.fillRect(x - 14, y + 10, 30, 2);
  ctx.fillStyle = (time % 1) < 0.5 ? '#ff2e4d' : '#2e7bff'; ctx.fillRect(x - 51, y - 12, 3, 3);
  ctx.restore();
}

// ================================================================ SPACEPORT（ルミナ宇宙港）
const SP_SHOP = { walls: ['#e8ecf8', '#c8d8f0', '#d8d0f0', '#b8e0e8'], awn: ['#2e7bff', '#ff4f6d', '#3ee6d2', '#b45cff'], neon: ['#3ee6d2', '#ff4fd8', '#9ff6ff', '#ffd23f'], names: ['SPACE BURGER', 'SOUVENIR', 'ASTRO CAFE', 'GEAR SHOP', 'TERMINAL', 'MOON GELATO', 'UFO ARCADE'], goods: ['rocket', 'box', 'bottle'], glass: '#4a6aa8', signBg: '#101a3a', inner: '#e0f4ff' };

function spaceTower(g, P, x, base, h) {
  // 管制塔
  g.fillStyle = '#3a4a6a';
  g.beginPath(); g.moveTo(x - 14, base); g.lineTo(x - 9, base - h); g.lineTo(x + 9, base - h); g.lineTo(x + 14, base); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x - 30, base - h); g.lineTo(x + 30, base - h); g.lineTo(x + 24, base - h - 30); g.lineTo(x - 24, base - h - 30); g.closePath(); g.fill();
  g.fillStyle = '#2a3a5a'; g.fillRect(x - 26, base - h - 36, 52, 6); g.fillRect(x - 1, base - h - 60, 2, 24);
  P.gl.fillStyle = '#9ff6ff'; P.gl.fillRect(x - 24, base - h - 26, 48, 16);
  P.gl.fillStyle = '#ff2e4d'; P.gl.beginPath(); P.gl.arc(x, base - h - 62, 3, 0, PI * 2); P.gl.fill();
}
function launchPad(g, P, x, base, h, col) {
  lattice(g, x + h * 0.12, base, 26, h * 1.05, '#4a5470', 2.4);
  g.strokeStyle = '#4a5470'; g.lineWidth = 4;
  for (let k = 0; k < 3; k++) { const y = base - h * (0.3 + k * 0.25); g.beginPath(); g.moveTo(x + h * 0.12, y); g.lineTo(x + 14, y); g.stroke(); }
  rocketSil(g, x, base - 16, h, col, true, '#ff4f6d');
  g.fillStyle = '#3a4058'; g.fillRect(x - h * 0.3, base - 16, h * 0.6 + 40, 16);
  for (const dx of [-h * 0.3, h * 0.3 + 30]) { P.gl.fillStyle = '#ffffff'; P.gl.fillRect(x + dx, base - 22, 8, 5); const lg = P.gl.createLinearGradient(0, base - 20, 0, base - h); lg.addColorStop(0, 'rgba(230,245,255,0.35)'); lg.addColorStop(1, 'rgba(230,245,255,0)'); P.gl.fillStyle = lg; P.gl.beginPath(); P.gl.moveTo(x + dx, base - 20); P.gl.lineTo(x + dx + 8, base - 20); P.gl.lineTo(x + dx + (dx < 0 ? 60 : -30), base - h); P.gl.lineTo(x + dx + (dx < 0 ? 0 : -90), base - h); P.gl.closePath(); P.gl.fill(); }
}

function bgSpaceport(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  if (v === 2 && !town) return bgMoon(ctx, S);
  if (v === 3 && !town) return bgAlienShip(ctx, S);
  // 遠景: 海と遠くのロケット・管制塔
  const far = S.layer('far', 300, (P) => {
    const g = P.g, h = P.h;
    spaceTower(g, P, 180, h, 150);
    launchPad(g, P, 600, h, 200, '#4a5a7a');
    g.fillStyle = '#3a4a6a';
    for (const [x, w, bh] of [[280, 160, 50], [800, 200, 60], [40, 90, 34]]) { g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - bh); g.quadraticCurveTo(x + w / 2, h - bh - 30, x + w, h - bh); g.lineTo(x + w, h); g.fill(); }
    g.fillStyle = '#34445e'; g.fillRect(0, h - 8, LW, 8);
  });
  S.tile(far, 0.07, horizon, null);
  sea(ctx, S, horizon, '#2a8ab8', '#1a6a98', '#104a70', 'rgba(170,230,255,0.45)');
  if (v === 1 && !town) { // 発射台エリア: 大きなロケット
    const pad = S.layer('pad', 520, (P) => {
      const g = P.g, h = P.h;
      launchPad(g, P, 420, h, 440, '#e8ecf8');
      g.fillStyle = '#5a6488'; g.fillRect(0, h - 20, LW, 20);
      for (let x = 0; x < LW; x += 40) { g.fillStyle = x % 80 ? '#ffd23f' : '#2a2a3a'; g.fillRect(x, h - 20, 40, 5); }
      g.fillStyle = '#4a5470'; for (const x of [760, 900]) { g.fillRect(x, h - 140, 60, 120); g.beginPath(); g.ellipse(x + 30, h - 140, 30, 10, 0, 0, PI * 2); g.fill(); }
    });
    const pb = bottomAt(gS, H, 0.3, 0.94) + 30;
    S.tile(pad, 0.3, pb, '#4a5470');
    // 蒸気
    S.post(() => {
      const off = -(((S.cam.x * 0.3) % LW) + LW) % LW;
      for (let b = off; b < W; b += LW) for (let i = 0; i < 6; i++) {
        const k = (time * 0.25 + i / 6) % 1;
        const x = b + 420 + (i % 2 ? 1 : -1) * (30 + k * 120), y = pb - 30 - k * 40;
        ctx.fillStyle = `rgba(240,244,255,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, 20 + k * 40, 0, PI * 2); ctx.fill();
      }
    });
    return;
  }
  // 沿岸ロケット道 / 町: 砂浜＋ヤシ＋フェンス
  const mid = S.layer('mid', 280, (P) => {
    const g = P.g, h = P.h; const R = rng(811 + (town ? 3 : 0));
    g.fillStyle = '#c8a888'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= LW; x += 32) g.lineTo(x, 230 + Math.sin(x / LW * PI * 4) * 8); g.lineTo(LW, h); g.fill();
    for (let i = 0; i < 6; i++) { const x = i * (LW / 6) + R() * 60; wrap(x, 120, (xx) => palmSil(g, xx, 240, 110 + R() * 60, R() < 0.5 ? -1 : 1, '#1a2a4a')); }
    // ハンガー
    if (town) for (const x of [120, 620]) { g.fillStyle = '#5a6a8a'; g.beginPath(); g.moveTo(x, 240); g.lineTo(x, 150); g.quadraticCurveTo(x + 130, 90, x + 260, 150); g.lineTo(x + 260, 240); g.fill(); g.fillStyle = '#3a4a6a'; g.fillRect(x + 60, 170, 140, 70); P.gl.fillStyle = '#9ff6ff'; P.gl.fillRect(x + 60, 166, 140, 3); }
    g.strokeStyle = '#3a4a6a'; g.lineWidth = 1; for (let x = 0; x < LW; x += 10) { g.beginPath(); g.moveTo(x, 240); g.lineTo(x, 262); g.stroke(); } g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 240); g.lineTo(LW, 240); g.stroke();
    // 宇宙港サイン
    if (!town) { g.fillStyle = '#2a3a5a'; g.fillRect(470, 140, 6, 100); g.fillRect(586, 140, 6, 100); g.fillStyle = '#ffffff'; g.fillRect(450, 100, 160, 50); g.font = '900 16px "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#2e7bff'; g.fillText('LUMINA', 530, 122); g.font = 'bold 12px sans-serif'; g.fillStyle = '#ff4f6d'; g.fillText('SPACEPORT →', 530, 140); }
  });
  S.tile(mid, 0.28, bottomAt(gS, H, 0.28, 0.92) + 30, '#c8a888');
  // 時々打ち上がるロケット
  S.post(() => {
    const k = (time % 40) / 40;
    if (k > 0.3) return;
    const p = k / 0.3;
    const x = ((600 - S.cam.x * 0.07) % LW + LW) % LW, y = horizon - p * p * (horizon + 100);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, y, 0, horizon); g.addColorStop(0, 'rgba(255,200,120,0.8)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 3, y, 6, horizon - y);
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(x, y + 4, 5, 0, PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e8ecf8'; ctx.fillRect(x - 2.5, y - 14, 5, 16);
  });
  if (town) townFront(S, 'spaceport', SP_SHOP);
}

function bgMoon(ctx, S) {
  const { W, H, gS, time, cam } = S;
  S.indoor = true; S.space = true;
  // 宇宙（星空＋地球）
  ctx.fillStyle = '#04030f'; ctx.fillRect(0, 0, W, H);
  const stars = S.layer('stars', 400, (P) => { const R = rng(851); const gl = P.gl; for (let i = 0; i < 500; i++) { gl.fillStyle = R() < 0.1 ? '#9ff6ff' : '#ffffff'; gl.globalAlpha = 0.3 + R() * 0.7; const s = R() < 0.08 ? 2 : 1; gl.fillRect(R() * LW, R() * 400, s, s); } gl.globalAlpha = 1; P.g.fillStyle = 'rgba(0,0,0,0.01)'; P.g.fillRect(0, 0, 1, 1); });
  S.tile(stars, 0.02, 420, null);
  const ex = W * 0.72 - cam.x * 0.01, ey = H * 0.22;
  const eg = ctx.createRadialGradient(ex - 20, ey - 20, 10, ex, ey, 60); eg.addColorStop(0, '#9fe8ff'); eg.addColorStop(0.6, '#2e7bff'); eg.addColorStop(1, '#14306a');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, 60, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(90,200,110,0.8)'; ctx.beginPath(); ctx.ellipse(ex - 15, ey - 5, 20, 14, 0.4, 0, PI * 2); ctx.ellipse(ex + 22, ey + 18, 14, 9, -0.3, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(ex + 5, ey - 30, 26, 6, 0.1, 0, PI * 2); ctx.fill();
  // 月面の丘
  const hills = S.layer('hills', 260, (P) => {
    const g = P.g, h = P.h; const R = rng(861);
    g.fillStyle = '#8a8aa0'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= LW; x += 32) g.lineTo(x, 150 + Math.sin(x / LW * PI * 6) * 30 + Math.sin(x / LW * PI * 14) * 8); g.lineTo(LW, h); g.fill();
    g.fillStyle = '#6a6a80'; for (let i = 0; i < 14; i++) { const x = R() * LW, y = 190 + R() * 60, r = 8 + R() * 22; g.beginPath(); g.ellipse(x, y, r, r * 0.3, 0, 0, PI * 2); g.fill(); }
    // 着陸船
    g.fillStyle = '#d8c060'; g.fillRect(700, 120, 60, 40); g.fillStyle = '#b8b8c8'; g.beginPath(); g.moveTo(705, 120); g.lineTo(730, 90); g.lineTo(755, 120); g.fill();
    g.strokeStyle = '#b8b8c8'; g.lineWidth = 3; g.beginPath(); g.moveTo(705, 160); g.lineTo(690, 190); g.moveTo(755, 160); g.lineTo(770, 190); g.stroke();
    g.fillStyle = '#ff4f6d'; g.fillRect(300, 110, 2, 60); g.fillRect(302, 110, 30, 18);
  });
  S.tile(hills, 0.25, bottomAt(gS, H, 0.25, 0.92) + 30, '#8a8aa0');
  // ドームの格子（シミュ区画）
  ctx.strokeStyle = 'rgba(160,220,255,0.22)'; ctx.lineWidth = 1.5;
  const off = -(((cam.x * 0.6) % 120) + 120) % 120;
  ctx.beginPath(); for (let x = off; x < W + 120; x += 120) { ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 30, H * 0.4, x, H); } for (let y = 60; y < H * 0.7; y += 90) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  S.post(() => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#9ff6ff', 0.05 + 0.03 * Math.sin(time * 2)); ctx.fillRect(0, 0, W, H); ctx.restore(); });
}

function bgAlienShip(ctx, S) {
  const { W, H, gS, time, cam } = S;
  S.indoor = true; S.space = true;
  ctx.fillStyle = '#12061e'; ctx.fillRect(0, 0, W, H);
  const wall = S.layer('alien', 620, (P) => {
    const g = P.g, h = P.h; const R = rng(871);
    // 有機的な肋骨
    for (let x = 0; x < LW; x += 128) {
      g.fillStyle = '#2a0e3a'; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x - 30, h * 0.5, x + 64, 0); g.lineTo(x + 100, 0); g.quadraticCurveTo(x + 10, h * 0.5, x + 40, h); g.closePath(); g.fill();
      g.fillStyle = '#3a1450'; g.beginPath(); g.moveTo(x + 10, h); g.quadraticCurveTo(x - 14, h * 0.5, x + 72, 0); g.lineTo(x + 80, 0); g.quadraticCurveTo(x, h * 0.5, x + 22, h); g.closePath(); g.fill();
    }
    // ポッド（glow）
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 170 + R() * 30, y = 180 + R() * 200;
      g.fillStyle = '#4a1a5a'; g.beginPath(); g.ellipse(x, y, 30, 46, 0, 0, PI * 2); g.fill();
      const pg = P.gl.createRadialGradient(x, y, 4, x, y, 42); pg.addColorStop(0, 'rgba(124,255,106,0.8)'); pg.addColorStop(1, 'rgba(124,255,106,0)');
      P.gl.fillStyle = pg; P.gl.beginPath(); P.gl.ellipse(x, y, 24, 40, 0, 0, PI * 2); P.gl.fill();
      g.fillStyle = '#1a0a24'; g.beginPath(); g.ellipse(x, y + 8, 8, 12, 0, 0, PI * 2); g.fill();
    }
    // 静脈
    P.gl.strokeStyle = 'rgba(255,79,216,0.55)'; P.gl.lineWidth = 2;
    for (let k = 0; k < 8; k++) { P.gl.beginPath(); let x = R() * LW, y = h; P.gl.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (R() - 0.5) * 60; y -= 50 + R() * 30; P.gl.lineTo(x, y); } P.gl.stroke(); }
    g.fillStyle = '#1a0828'; g.fillRect(0, h - 40, LW, 40);
  });
  const wb = bottomAt(gS, H, 0.5, 0.98) + 30;
  S.tile(wall, 0.5, wb, '#1a0828');
  if (wb - 620 > 0) { ctx.fillStyle = '#2a0e3a'; ctx.fillRect(0, 0, W, wb - 620); }
  // 脈動
  S.post(() => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const p = 0.5 + 0.5 * Math.sin(time * 2.2); const g = ctx.createRadialGradient(W / 2, H * 0.5, 50, W / 2, H * 0.5, W * 0.7); g.addColorStop(0, rgba('#b45cff', 0.04 + 0.05 * p)); g.addColorStop(1, rgba('#ff4fd8', 0.08 * p)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); void cam; });
}

// ================================================================ ディスパッチ
export function drawScene(ctx, S) {
  switch (S.region) {
    case 'downtown': return bgDowntown(ctx, S);
    case 'slums': return bgSlums(ctx, S);
    case 'swamp': return bgSwamp(ctx, S);
    case 'casino': return bgCasino(ctx, S);
    case 'rooftop': return bgRooftop(ctx, S);
    case 'spaceport': return bgSpaceport(ctx, S);
    default: return bgBeach(ctx, S);
  }
}
void mix;
