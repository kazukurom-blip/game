// 背景（スクリーン空間・多層パララックス）とマップタイル（ワールド空間）
// ビル群などの静的レイヤーは決定論的乱数で生成し、オフスクリーン canvas にキャッシュする。
import { shade, rgba, rng, hashStr, rr, starPath, makeCanvas, lerp, OUTLINE } from './util.js';
import { drawVehicle } from './vehicles.js';

const PI = Math.PI;
const LW = 1024; // レイヤーのタイル幅

// ================================================================ テーマ定義
const THEMES = {
  beach: {
    sky: [[0, '#5b2a86'], [0.45, '#ff6f91'], [0.8, '#ffb86b'], [1, '#ffd98e']],
    sun: { x: 0.68, y: 0.62, r: 95, c1: '#ffe29a', c2: '#ff9e5e', stripes: true },
    stars: 0,
  },
  downtown: {
    sky: [[0, '#140a2e'], [0.5, '#3b1660'], [0.85, '#c2387a'], [1, '#ff6f91']],
    moon: { x: 0.18, y: 0.18, r: 30 }, stars: 70,
  },
  slums: {
    sky: [[0, '#3a2340'], [0.5, '#8c4a4a'], [0.85, '#e08a4f'], [1, '#f2b06a']],
    sun: { x: 0.3, y: 0.66, r: 70, c1: '#ffcf8a', c2: '#e0704f', stripes: false },
    stars: 0,
  },
  swamp: {
    sky: [[0, '#1e2b3a'], [0.55, '#3f5e5a'], [0.9, '#c7a86a'], [1, '#d8bd80']],
    moon: { x: 0.75, y: 0.2, r: 38 }, stars: 40,
  },
  casino: {
    sky: [[0, '#0e0620'], [0.55, '#2a0b4a'], [0.9, '#6a1a6e'], [1, '#a02a7a']],
    stars: 80,
  },
  rooftop: {
    sky: [[0, '#07051a'], [0.45, '#1e1450'], [0.75, '#5a2d82'], [1, '#ff6f91']],
    moon: { x: 0.8, y: 0.16, r: 46 }, stars: 140,
  },
};

const layerCache = new Map();
function getLayer(key, w, h, paint) {
  let c = layerCache.get(key);
  if (!c) {
    c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    paint(g, w, h);
    layerCache.set(key, c);
  }
  return c;
}
// タイル幅で折り返して描く
function wrap(x, w, fn) { fn(x); if (x + w > LW) fn(x - LW); if (x < 0) fn(x + LW); }

// ================================================================ drawBackground
export function drawBackground(ctx, map, cam, W, H, time) {
  const theme = THEMES[map && map.theme] ? map.theme : 'beach';
  const T = THEMES[theme];
  cam = cam || { x: 0, y: 0 };
  W = W || 1280; H = H || 720;
  time = time || 0;
  const groundY = (map && map.groundY) || 1000;
  const gS = groundY - cam.y; // 地面のスクリーンY
  ctx.save();
  // 空
  const horizon = lerp(H * 0.78, gS - 120, 0.25);
  const skyB = Math.max(H * 0.4, horizon + 40);
  const sky = ctx.createLinearGradient(0, Math.min(0, skyB - H), 0, skyB);
  for (const [o, c] of T.sky) sky.addColorStop(o, c);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // 星
  if (T.stars) drawStars(ctx, theme, T.stars, W, H, time, cam);
  // 月・太陽
  if (T.moon) drawMoon(ctx, T.moon.x * W - cam.x * 0.02, T.moon.y * H - cam.y * 0.02, T.moon.r, theme);
  if (T.sun) drawSun(ctx, T.sun, T.sun.x * W - cam.x * 0.02, horizon - 20, time);
  switch (theme) {
    case 'beach': bgBeach(ctx, cam, W, H, time, gS, horizon); break;
    case 'downtown': bgDowntown(ctx, cam, W, H, time, gS, horizon); break;
    case 'slums': bgSlums(ctx, cam, W, H, time, gS, horizon); break;
    case 'swamp': bgSwamp(ctx, cam, W, H, time, gS, horizon); break;
    case 'casino': bgCasino(ctx, cam, W, H, time, gS, horizon); break;
    case 'rooftop': bgRooftop(ctx, cam, W, H, time, gS, horizon); break;
  }
  ctx.restore();
}

// レイヤーを横タイルで描画。bottomY = レイヤー下端のスクリーンY
function tile(ctx, layer, f, cam, W, bottomY, fillBelow, H) {
  const lh = layer.height;
  const off = -(((cam.x * f) % LW) + LW) % LW;
  const y = Math.round(bottomY - lh);
  for (let x = off; x < W; x += LW) ctx.drawImage(layer, Math.round(x), y);
  if (fillBelow && bottomY < H) { ctx.fillStyle = fillBelow; ctx.fillRect(0, bottomY - 1, W, H - bottomY + 1); }
}
const bottomAt = (gS, H, f, base) => lerp(H * base, gS, f) ;

function drawStars(ctx, theme, n, W, H, time, cam) {
  const R = rng(hashStr(theme + 'stars'));
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    const x = ((R() * (W + 200) - cam.x * 0.01) % (W + 200) + W + 200) % (W + 200) - 100;
    const y = R() * H * 0.55;
    const s = R() < 0.1 ? 2 : 1;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (0.5 + R() * 2) + i));
    ctx.globalAlpha = tw * (1 - y / (H * 0.6));
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawMoon(ctx, x, y, r, theme) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3);
  g.addColorStop(0, rgba('#b47cff', 0.35)); g.addColorStop(1, rgba('#b47cff', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = theme === 'swamp' ? '#f2f0d0' : '#f5eeff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(180,160,220,0.22)';
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.15, r * 0.2, 0, PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.35, r * 0.13, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.5, r * 0.18, PI * 1.1, PI * 1.6); ctx.lineTo(x - r * 0.25, y - r * 0.5); ctx.fill();
}

function drawSun(ctx, S, x, y, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, S.r * 0.5, x, y, S.r * 2.6);
  g.addColorStop(0, rgba(S.c2, 0.55)); g.addColorStop(1, rgba(S.c2, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, S.r * 2.6, 0, PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, S.r, 0, PI * 2); ctx.clip();
  const sg = ctx.createLinearGradient(0, y - S.r, 0, y + S.r);
  sg.addColorStop(0, S.c1); sg.addColorStop(1, S.c2);
  ctx.fillStyle = sg; ctx.fillRect(x - S.r, y - S.r, S.r * 2, S.r * 2);
  if (S.stripes) {
    // レトロな横縞（ゆっくり流れる）
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const yy = y + S.r * 0.05 + i * S.r * 0.15 + ((time * 6) % (S.r * 0.15));
      ctx.fillRect(x - S.r, yy, S.r * 2, 2 + i * 1.3);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- beach
function bgBeach(ctx, cam, W, H, time, gS, horizon) {
  // 遠景: 湾の向こうのホテル群
  const far = getLayer('beach-far', LW, 220, (g) => {
    const R = rng(101);
    let x = 0;
    while (x < LW) {
      const w = 40 + R() * 70, h = 50 + R() * 150;
      if (R() < 0.25) { x += w * 0.6; continue; }
      wrap(x, w, (xx) => {
        g.fillStyle = '#7a3a7e';
        if (R() < 0.3) { g.beginPath(); g.moveTo(xx, 220); g.lineTo(xx, 220 - h); g.quadraticCurveTo(xx + w / 2, 220 - h - 30, xx + w, 220 - h); g.lineTo(xx + w, 220); g.fill(); }
        else g.fillRect(xx, 220 - h, w, h);
        g.fillStyle = 'rgba(255,190,220,0.45)';
        for (let yy = 220 - h + 8; yy < 210; yy += 9) for (let wx = xx + 5; wx < xx + w - 5; wx += 8) if (R() < 0.35) g.fillRect(wx, yy, 3, 4);
      });
      x += w + 4 + R() * 30;
    }
    g.fillStyle = '#6a2f70'; g.fillRect(0, 214, LW, 6);
  });
  const farB = horizon;
  tile(ctx, far, 0.08, cam, W, farB, null, H);
  // 海
  const sea = ctx.createLinearGradient(0, farB, 0, H);
  sea.addColorStop(0, '#2ec4b6'); sea.addColorStop(0.5, '#1fb5b0'); sea.addColorStop(1, '#14807e');
  ctx.fillStyle = sea; ctx.fillRect(0, farB, W, H - farB);
  // 太陽の反射と波頭
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const sx = THEMES.beach.sun.x * W - cam.x * 0.02;
  for (let i = 0; i < 14; i++) {
    const yy = farB + 6 + i * i * 2.2;
    if (yy > H) break;
    const ww = 30 + i * 12 + Math.sin(time * 2 + i) * 10;
    ctx.fillStyle = rgba('#ffe29a', 0.5 - i * 0.03);
    ctx.fillRect(sx - ww / 2 + Math.sin(time * 1.5 + i * 2) * 8, yy, ww, 2);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(158,245,230,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const R = (i * 7919) % 101 / 101;
    const yy = farB + 14 + ((i * 37) % 120);
    const xx = ((i * 211 - cam.x * (0.1 + (yy - farB) / 900) + time * 12) % (W + 80) + W + 80) % (W + 80) - 40;
    ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 8, yy - 3 - R * 2, xx + 16 + R * 10, yy);
  }
  ctx.stroke();
  // 中景: 砂丘＋ヤシのシルエット
  const mid = getLayer('beach-mid', LW, 300, (g) => {
    const R = rng(202);
    g.fillStyle = '#c9706a';
    g.beginPath(); g.moveTo(0, 300); for (let x = 0; x <= LW; x += 32) g.lineTo(x, 250 + Math.sin((x / LW) * PI * 4) * 10); g.lineTo(LW, 300); g.fill();
    for (let i = 0; i < 6; i++) {
      const x = i * (LW / 6) + R() * 80;
      wrap(x, 120, (xx) => palmSil(g, xx, 262, 120 + R() * 70, R() < 0.5 ? -1 : 1, '#3a1446'));
    }
  });
  const midB = bottomAt(gS, H, 0.3, 0.9) + 30;
  tile(ctx, mid, 0.3, cam, W, midB, '#c9706a', H);
  // カモメ
  ctx.strokeStyle = 'rgba(60,20,70,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = ((time * (30 + i * 8) + i * 300 - cam.x * 0.05) % (W + 100)) - 50, by = H * 0.25 + i * 30 + Math.sin(time * 2 + i) * 8;
    const fl = Math.sin(time * 8 + i) * 4;
    ctx.moveTo(bx - 8, by - fl); ctx.quadraticCurveTo(bx - 4, by - 4, bx, by); ctx.quadraticCurveTo(bx + 4, by - 4, bx + 8, by - fl);
  }
  ctx.stroke();
}

function palmSil(g, x, base, h, lean, col) {
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

// ---------------------------------------------------------------- 都市ビル群レイヤー生成
function cityLayer(key, h, seed, opt) {
  return getLayer(key, LW, h, (g) => {
    const R = rng(seed);
    let x = -20;
    while (x < LW) {
      const w = opt.minW + R() * (opt.maxW - opt.minW);
      const bh = opt.minH + R() * (opt.maxH - opt.minH);
      const top = h - bh;
      const shapeR = R();
      wrap(x, w, (xx) => {
        g.fillStyle = opt.col;
        g.beginPath();
        if (shapeR < 0.2) { g.moveTo(xx, h); g.lineTo(xx, top + 20); g.lineTo(xx + w / 2, top - 10); g.lineTo(xx + w, top + 20); g.lineTo(xx + w, h); }
        else if (shapeR < 0.35) { g.rect(xx, top, w, bh); g.rect(xx + w * 0.2, top - 18, w * 0.6, 18); g.rect(xx + w * 0.45, top - 40, 3, 22); }
        else if (shapeR < 0.45) { g.rect(xx, top, w, bh); g.moveTo(xx, top); g.lineTo(xx + w * 0.5, top - 25); g.lineTo(xx + w, top); }
        else g.rect(xx, top, w, bh);
        g.fill();
        if (opt.edge) { g.fillStyle = opt.edge; g.fillRect(xx, top, 2, bh); }
        // 窓
        const wc = opt.win;
        for (let yy = top + 8; yy < h - 6; yy += opt.wy) {
          for (let wx = xx + 4; wx < xx + w - 6; wx += opt.wx) {
            const r = R();
            if (r < opt.lit) { g.fillStyle = wc[(r * 97 | 0) % wc.length]; g.globalAlpha = 0.55 + R() * 0.45; g.fillRect(wx, yy, opt.ww, opt.wh); }
          }
        }
        g.globalAlpha = 1;
        // ネオン縦看板
        if (opt.neon && R() < opt.neonP) {
          const nc = opt.neon[(R() * opt.neon.length) | 0];
          const ny = top + 20 + R() * 40, nh = 40 + R() * 50;
          g.fillStyle = rgba(nc, 0.25); g.fillRect(xx + w - 14, ny - 4, 16, nh + 8);
          g.fillStyle = nc; g.fillRect(xx + w - 11, ny, 10, nh);
          g.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < nh - 8; k += 12) g.fillRect(xx + w - 8, ny + 4 + k, 4, 6);
        }
        if (opt.trim) { g.fillStyle = opt.trim; g.fillRect(xx, top, w, 2); }
      });
      x += w + opt.gap * R();
    }
  });
}

// ---------------------------------------------------------------- downtown
function bgDowntown(ctx, cam, W, H, time, gS, horizon) {
  // 地平線のグロー
  const hg = ctx.createLinearGradient(0, horizon - 200, 0, horizon + 40);
  hg.addColorStop(0, 'rgba(255,46,136,0)'); hg.addColorStop(1, 'rgba(255,46,136,0.35)');
  ctx.fillStyle = hg; ctx.fillRect(0, horizon - 200, W, 240);
  const far = cityLayer('dt-far', 420, 301, { minW: 40, maxW: 90, minH: 140, maxH: 400, col: '#24113f', win: ['#ffd86e', '#7fe9ff'], lit: 0.18, wx: 9, wy: 12, ww: 3, wh: 5, gap: 10 });
  tile(ctx, far, 0.1, cam, W, horizon + 40, '#24113f', H);
  // 赤い航空障害灯
  ctx.fillStyle = (time % 1.6) < 0.8 ? '#ff2e4d' : 'rgba(255,46,77,0.3)';
  for (let i = 0; i < 6; i++) { const x = ((i * 233 - cam.x * 0.1) % W + W) % W; ctx.fillRect(x, horizon - 300 + (i * 53) % 120, 3, 3); }
  const mid = cityLayer('dt-mid', 460, 302, { minW: 70, maxW: 140, minH: 160, maxH: 420, col: '#341a57', edge: '#4a2a75', win: ['#ffd86e', '#7fe9ff', '#ff9ad5'], lit: 0.32, wx: 12, wy: 14, ww: 5, wh: 7, gap: 26, neon: ['#ff2e88', '#00f0ff', '#b45cff', '#ffc93c'], neonP: 0.55 });
  tile(ctx, mid, 0.3, cam, W, bottomAt(gS, H, 0.3, 0.92) + 40, '#341a57', H);
  // サーチライト
  searchlights(ctx, W, H, time, cam, ['#7fe9ff', '#ff9ad5'], bottomAt(gS, H, 0.3, 0.92));
  const near = cityLayer('dt-near', 360, 303, { minW: 110, maxW: 200, minH: 120, maxH: 300, col: '#1c0d30', edge: '#2a1648', win: ['#ffd86e', '#ff2e88', '#00f0ff'], lit: 0.12, wx: 18, wy: 20, ww: 8, wh: 10, gap: 40, neon: ['#ff2e88', '#00f0ff'], neonP: 0.4, trim: '#ff2e88' });
  tile(ctx, near, 0.55, cam, W, bottomAt(gS, H, 0.55, 0.95) + 30, '#1c0d30', H);
}

function searchlights(ctx, W, H, time, cam, cols, baseY) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const bx = ((i * 640 + 300 - cam.x * 0.3) % (W + 400) + W + 400) % (W + 400) - 200;
    const a = -PI / 2 + Math.sin(time * 0.4 + i * 2) * 0.5;
    const len = H;
    const g = ctx.createLinearGradient(bx, baseY, bx + Math.cos(a) * len, baseY + Math.sin(a) * len);
    g.addColorStop(0, rgba(cols[i % cols.length], 0.22)); g.addColorStop(1, rgba(cols[i % cols.length], 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(bx, baseY);
    ctx.lineTo(bx + Math.cos(a - 0.05) * len, baseY + Math.sin(a - 0.05) * len);
    ctx.lineTo(bx + Math.cos(a + 0.05) * len, baseY + Math.sin(a + 0.05) * len);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- slums
function bgSlums(ctx, cam, W, H, time, gS, horizon) {
  const far = getLayer('sl-far', LW, 260, (g) => {
    const R = rng(401);
    g.fillStyle = '#4a2a3a';
    let x = 0;
    while (x < LW) { const w = 80 + R() * 120, h = 40 + R() * 70; wrap(x, w, (xx) => { g.fillRect(xx, 260 - h, w, h); g.beginPath(); g.moveTo(xx, 260 - h); g.lineTo(xx + w / 2, 260 - h - 18); g.lineTo(xx + w, 260 - h); g.fill(); }); x += w + R() * 20; }
    // 港のクレーン
    for (let i = 0; i < 3; i++) {
      const cx = 120 + i * 340 + R() * 60;
      wrap(cx, 200, (xx) => {
        g.strokeStyle = '#3a2030'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(xx, 260); g.lineTo(xx + 10, 60); g.moveTo(xx + 40, 260); g.lineTo(xx + 30, 60); g.stroke();
        g.lineWidth = 2; g.beginPath(); for (let y = 240; y > 70; y -= 24) { g.moveTo(xx + 2, y); g.lineTo(xx + 38, y - 20); g.moveTo(xx + 38, y); g.lineTo(xx + 2, y - 20); } g.stroke();
        g.lineWidth = 7; g.beginPath(); g.moveTo(xx - 60, 62); g.lineTo(xx + 170, 62); g.stroke();
        g.lineWidth = 1.5; g.beginPath(); g.moveTo(xx + 20, 30); g.lineTo(xx - 60, 62); g.moveTo(xx + 20, 30); g.lineTo(xx + 170, 62); g.moveTo(xx + 20, 30); g.lineTo(xx + 20, 62); g.moveTo(xx + 130, 62); g.lineTo(xx + 130, 130); g.stroke();
        g.fillStyle = '#3a2030'; g.fillRect(xx + 120, 130, 22, 14);
      });
    }
  });
  tile(ctx, far, 0.08, cam, W, horizon, null, H);
  // 海（濁った港）
  const sea = ctx.createLinearGradient(0, horizon, 0, H);
  sea.addColorStop(0, '#5a4a6a'); sea.addColorStop(1, '#2a2a40');
  ctx.fillStyle = sea; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,170,100,0.25)';
  for (let i = 0; i < 10; i++) { const yy = horizon + 4 + i * i * 3; ctx.fillRect(THEMES.slums.sun.x * W - 40 - i * 6 + Math.sin(time + i) * 6, yy, 80 + i * 12, 2); }
  ctx.restore();
  // 中景: コンテナの山
  const mid = getLayer('sl-mid', LW, 220, (g) => {
    const R = rng(402);
    const cols = ['#b5523b', '#2f6f73', '#c9a13b', '#6a3a6a', '#3a5a8a'];
    let x = 0;
    while (x < LW) {
      const stacks = 1 + ((R() * 3) | 0);
      const w = 90 + R() * 40;
      wrap(x, w, (xx) => {
        for (let s = 0; s < stacks; s++) {
          const c = cols[(R() * cols.length) | 0];
          const y = 220 - (s + 1) * 38;
          const ox = s ? (R() - 0.5) * 30 : 0;
          g.fillStyle = shade(c, -0.35); g.fillRect(xx + ox, y, w, 38);
          g.strokeStyle = shade(c, -0.55); g.lineWidth = 2; for (let k = 6; k < w; k += 7) { g.beginPath(); g.moveTo(xx + ox + k, y + 3); g.lineTo(xx + ox + k, y + 35); g.stroke(); }
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeRect(xx + ox + 1, y + 1, w - 2, 36);
        }
      });
      x += w + 10 + R() * 80;
    }
  });
  tile(ctx, mid, 0.25, cam, W, bottomAt(gS, H, 0.25, 0.9) + 20, '#3a2a3a', H);
  // スモッグ
  ctx.fillStyle = 'rgba(120,90,100,0.18)';
  for (let i = 0; i < 3; i++) {
    const y = H * 0.35 + i * 70;
    const off = ((time * (8 + i * 4) - cam.x * 0.1 * (i + 1)) % 600 + 600) % 600;
    for (let x = -600 + off; x < W + 600; x += 600) { ctx.beginPath(); ctx.ellipse(x, y, 320, 26, 0, 0, PI * 2); ctx.fill(); }
  }
  // 近景: 倉庫の壁＋フェンス＋モーテル看板
  const near = getLayer('sl-near', LW, 260, (g) => {
    const R = rng(403);
    let x = 0;
    while (x < LW) {
      const w = 180 + R() * 120, h = 110 + R() * 80;
      wrap(x, w, (xx) => {
        g.fillStyle = '#2b1a2a'; g.fillRect(xx, 260 - h, w, h);
        g.fillStyle = '#3a2438'; for (let k = 0; k < w; k += 22) g.fillRect(xx + k, 260 - h, 2, h);
        g.fillStyle = 'rgba(255,177,59,0.6)'; if (R() < 0.7) g.fillRect(xx + 20 + R() * (w - 60), 260 - h + 20, 24, 14);
      });
      x += w + 40 + R() * 100;
    }
    // フェンス
    g.strokeStyle = 'rgba(60,40,60,0.9)'; g.lineWidth = 1;
    for (let k = 0; k < LW; k += 8) { g.beginPath(); g.moveTo(k, 200); g.lineTo(k + 40, 260); g.moveTo(k + 40, 200); g.lineTo(k, 260); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); g.moveTo(0, 200); g.lineTo(LW, 200); g.stroke();
    for (let k = 0; k < LW; k += 64) g.fillRect(k, 196, 3, 64);
  });
  tile(ctx, near, 0.5, cam, W, bottomAt(gS, H, 0.5, 0.95) + 10, '#2b1a2a', H);
  // チカチカするモーテルネオン
  const nb = bottomAt(gS, H, 0.5, 0.95) + 10;
  const nx = ((620 - cam.x * 0.5) % LW + LW) % LW;
  for (let x = nx - LW; x < W + 200; x += LW) neonText(ctx, x, nb - 210, 'MOTEL', '#ff5e5e', (time * 7 | 0) % 11 !== 0 ? 1 : 0.25, 22);
}

// ---------------------------------------------------------------- swamp
function bgSwamp(ctx, cam, W, H, time, gS, horizon) {
  const far = getLayer('sw-far', LW, 260, (g) => { const R = rng(501); for (let i = 0; i < 9; i++) { const x = i * (LW / 9) + R() * 60; wrap(x, 140, (xx) => cypress(g, xx, 260, 140 + R() * 100, '#3a5550', R)); } g.fillStyle = '#3a5550'; g.fillRect(0, 250, LW, 10); });
  tile(ctx, far, 0.08, cam, W, horizon, null, H);
  // 水面
  const wg = ctx.createLinearGradient(0, horizon, 0, H);
  wg.addColorStop(0, '#4f7a6a'); wg.addColorStop(1, '#1f3f36');
  ctx.fillStyle = wg; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = 'rgba(111,191,160,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 20; i++) { const yy = horizon + 8 + ((i * 29) % 140); const xx = ((i * 173 - cam.x * 0.15 + Math.sin(time + i) * 10) % W + W) % W; ctx.moveTo(xx, yy); ctx.lineTo(xx + 30, yy); }
  ctx.stroke();
  // 月の反射
  const mx = THEMES.swamp.moon.x * W - cam.x * 0.02;
  ctx.fillStyle = 'rgba(242,240,208,0.25)';
  for (let i = 0; i < 8; i++) ctx.fillRect(mx - 20 + Math.sin(time * 2 + i) * 5, horizon + 6 + i * 9, 40 - i * 3, 2);
  // 霧
  fogBands(ctx, W, H, time, cam, horizon - 40, 'rgba(190,230,200,0.12)');
  const mid = getLayer('sw-mid', LW, 340, (g) => { const R = rng(502); for (let i = 0; i < 5; i++) { const x = i * (LW / 5) + R() * 100; wrap(x, 200, (xx) => mangroveSil(g, xx, 340, 200 + R() * 110, '#1a2a22', R)); } });
  tile(ctx, mid, 0.3, cam, W, bottomAt(gS, H, 0.3, 0.92) + 30, '#1a2a22', H);
  fogBands(ctx, W, H, time * 1.4, cam, bottomAt(gS, H, 0.3, 0.92) - 60, 'rgba(190,230,200,0.16)');
  // 蛍
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 36; i++) {
    const R = (i * 9301 + 49297) % 233280 / 233280;
    const bx = ((i * 97 + Math.sin(time * 0.5 + i) * 40 - cam.x * (0.2 + R * 0.3)) % (W + 40) + W + 40) % (W + 40) - 20;
    const by = H * 0.4 + R * H * 0.5 + Math.cos(time * 0.7 + i * 2) * 20;
    const a = 0.5 + 0.5 * Math.sin(time * 3 + i * 1.7);
    ctx.fillStyle = rgba('#c8ff5a', 0.25 * a); ctx.beginPath(); ctx.arc(bx, by, 6, 0, PI * 2); ctx.fill();
    ctx.fillStyle = rgba('#f0ffb0', a); ctx.fillRect(bx - 1, by - 1, 2.5, 2.5);
  }
  ctx.restore();
}

function fogBands(ctx, W, H, time, cam, y, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < 2; i++) {
    const off = ((time * (10 + i * 6) - cam.x * 0.2) % 700 + 700) % 700;
    for (let x = -700 + off; x < W + 700; x += 700) { ctx.beginPath(); ctx.ellipse(x + i * 300, y + i * 40, 380, 30, 0, 0, PI * 2); ctx.fill(); }
  }
}
function cypress(g, x, base, h, col, R) {
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 5;
  g.beginPath(); g.moveTo(x, base); g.lineTo(x + 2, base - h); g.stroke();
  for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + (R() - 0.5) * 30, base - h + k * h * 0.18, 26 - k * 2, 12, 0, 0, PI * 2); g.fill(); }
  g.lineWidth = 1; g.beginPath(); for (let k = 0; k < 5; k++) { const sx = x - 20 + k * 10; g.moveTo(sx, base - h + 20); g.lineTo(sx + 1, base - h + 50 + R() * 30); } g.stroke();
}
function mangroveSil(g, x, base, h, col, R) {
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = 8; g.beginPath(); g.moveTo(x, base - 50); g.quadraticCurveTo(x - 6, base - h * 0.6, x + 4, base - h); g.stroke();
  g.lineWidth = 3;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x, base - 50); g.quadraticCurveTo(x + k * 14, base - 60, x + k * 18, base); g.stroke(); }
  for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + (R() - 0.5) * 120, base - h + R() * 60, 40 + R() * 20, 20 + R() * 10, 0, 0, PI * 2); g.fill(); }
  g.lineWidth = 1.2; g.beginPath(); for (let k = 0; k < 8; k++) { const sx = x - 60 + R() * 120; const sy = base - h + 30 + R() * 40; g.moveTo(sx, sy); g.lineTo(sx, sy + 30 + R() * 40); } g.stroke();
}

// ---------------------------------------------------------------- casino
function bgCasino(ctx, cam, W, H, time, gS, horizon) {
  searchlights(ctx, W, H, time * 1.3, cam, ['#ffd23f', '#ff2e88'], horizon);
  const far = cityLayer('ca-far', 420, 601, { minW: 50, maxW: 110, minH: 160, maxH: 400, col: '#1f0e33', win: ['#ffd23f', '#ff9ad5'], lit: 0.16, wx: 10, wy: 12, ww: 4, wh: 5, gap: 14, trim: '#ffc93c' });
  tile(ctx, far, 0.1, cam, W, horizon + 40, '#1f0e33', H);
  // 中景: カジノファサード（キャッシュ）＋チェイサー電飾（ライブ）
  const mid = getLayer('ca-mid', LW, 360, (g) => {
    const R = rng(602);
    const fac = [[40, 300, 200], [330, 340, 260], [680, 280, 240]];
    for (const [fx, fw, fh] of fac) {
      wrap(fx, fw, (xx) => {
        g.fillStyle = '#2a0f45'; g.fillRect(xx, 360 - fh, fw, fh);
        g.fillStyle = '#3a1660'; g.beginPath(); g.moveTo(xx - 10, 360 - fh); g.lineTo(xx + fw / 2, 360 - fh - 50); g.lineTo(xx + fw + 10, 360 - fh); g.fill();
        g.strokeStyle = '#ffc93c'; g.lineWidth = 3; g.strokeRect(xx + 10, 360 - fh + 20, fw - 20, 60);
        g.fillStyle = '#ffc93c'; g.fillRect(xx, 360 - fh, fw, 3);
        for (let yy = 360 - fh + 100; yy < 350; yy += 22) for (let wx = xx + 14; wx < xx + fw - 14; wx += 18) if (R() < 0.6) { g.fillStyle = R() < 0.5 ? '#ff9ad5' : '#ffd86e'; g.globalAlpha = 0.6; g.fillRect(wx, yy, 8, 10); }
        g.globalAlpha = 1;
      });
    }
  });
  const midB = bottomAt(gS, H, 0.3, 0.92) + 40;
  tile(ctx, mid, 0.3, cam, W, midB, '#2a0f45', H);
  // ファサードの看板文字と電飾
  const names = ['LUCKY 7', 'GOLD PALACE', 'NEON STAR'];
  const fac = [[40, 300, 200], [330, 340, 260], [680, 280, 240]];
  const off = -(((cam.x * 0.3) % LW) + LW) % LW;
  for (let base = off; base < W; base += LW) {
    for (let i = 0; i < fac.length; i++) {
      const [fx, fw, fh] = fac[i];
      const x = base + fx, y = midB - fh;
      if (x > W + 20 || x + fw < -20) continue;
      neonText(ctx, x + fw / 2, y + 50, names[i], i === 1 ? '#ffd23f' : '#ff2e88', 1, 26);
      // チェイサー
      const n = Math.floor(fw / 12);
      for (let k = 0; k < n; k++) {
        const on = ((k + Math.floor(time * 10)) % 3) === 0;
        ctx.fillStyle = on ? '#fff6c0' : 'rgba(255,201,60,0.35)';
        ctx.fillRect(x + 6 + k * 12, y + 14, 3, 3);
        ctx.fillRect(x + 6 + k * 12, y + 84, 3, 3);
      }
    }
  }
}

// ---------------------------------------------------------------- rooftop
function bgRooftop(ctx, cam, W, H, time, gS, horizon) {
  // 眼下の街明かり（ボケ）
  const city = getLayer('rt-city', LW, 220, (g) => {
    const R = rng(701);
    const grd = g.createLinearGradient(0, 0, 0, 220); grd.addColorStop(0, 'rgba(30,20,80,0)'); grd.addColorStop(1, '#1e1450');
    g.fillStyle = grd; g.fillRect(0, 0, LW, 220);
    const cols = ['#ffd86e', '#00f0ff', '#ff2e88', '#ffffff'];
    const hz = g.createLinearGradient(0, 20, 0, 90); hz.addColorStop(0, 'rgba(255,111,145,0)'); hz.addColorStop(1, 'rgba(255,111,145,0.35)');
    g.fillStyle = hz; g.fillRect(0, 20, LW, 70);
    // 遠いビルのシルエット
    g.fillStyle = '#2a1c5e';
    for (let x = 0; x < LW;) { const w = 14 + R() * 30, h = 20 + R() * 70; g.fillRect(x, 90 - h, w, h + 130); x += w + R() * 6; }
    for (let i = 0; i < 1100; i++) {
      const y = 30 + Math.pow(R(), 0.7) * 190;
      const x = R() * LW;
      g.fillStyle = cols[(R() * cols.length) | 0]; g.globalAlpha = 0.45 + R() * 0.55;
      const s = y > 140 ? 2.5 : y > 80 ? 1.6 : 1;
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const x = R() * LW, y = 100 + R() * 110; const c = cols[(R() * 3) | 0]; const gg = g.createRadialGradient(x, y, 0, x, y, 8); gg.addColorStop(0, rgba(c, 0.5)); gg.addColorStop(1, rgba(c, 0)); g.fillStyle = gg; g.fillRect(x - 8, y - 8, 16, 16); }
    g.globalAlpha = 1;
  });
  tile(ctx, city, 0.04, cam, W, horizon + 140, '#1e1450', H);
  // ヘリ
  const hx = ((time * 40) % (W + 400)) - 200 - cam.x * 0.02;
  const hy = H * 0.22 + Math.sin(time * 0.8) * 14;
  heli(ctx, hx, hy, time, H);
  // 他のビル屋上
  const mid = getLayer('rt-mid', LW, 300, (g) => {
    const R = rng(702);
    let x = 0;
    while (x < LW) {
      const w = 120 + R() * 140, h = 60 + R() * 160;
      wrap(x, w, (xx) => {
        g.fillStyle = '#2a2050'; g.fillRect(xx, 300 - h, w, h);
        g.fillStyle = '#3a3168'; g.fillRect(xx - 4, 300 - h, w + 8, 6);
        if (R() < 0.5) { // 給水塔
          const tx = xx + 20 + R() * (w - 60);
          g.fillStyle = '#3a3552'; g.fillRect(tx, 300 - h - 40, 32, 30); g.beginPath(); g.moveTo(tx - 3, 300 - h - 40); g.lineTo(tx + 16, 300 - h - 54); g.lineTo(tx + 35, 300 - h - 40); g.fill();
          g.fillRect(tx + 3, 300 - h - 10, 3, 10); g.fillRect(tx + 26, 300 - h - 10, 3, 10);
        }
        if (R() < 0.5) { g.fillStyle = '#3a3552'; g.fillRect(xx + w - 30, 300 - h - 70, 3, 70); }
        for (let yy = 300 - h + 16; yy < 296; yy += 16) for (let wx = xx + 8; wx < xx + w - 8; wx += 14) if (R() < 0.25) { g.fillStyle = R() < 0.5 ? '#ffd86e' : '#7fe9ff'; g.globalAlpha = 0.5; g.fillRect(wx, yy, 6, 7); }
        g.globalAlpha = 1;
      });
      x += w + 60 + R() * 120;
    }
  });
  const mb = bottomAt(gS, H, 0.25, 0.95) + 60;
  tile(ctx, mid, 0.25, cam, W, mb, '#2a2050', H);
  // 屋上アンテナの点滅
  ctx.fillStyle = (time % 1.2) < 0.6 ? '#ff2e4d' : 'rgba(255,46,77,0.2)';
  const off = -(((cam.x * 0.25) % LW) + LW) % LW;
  for (let b = off; b < W; b += LW) for (const px of [140, 520, 860]) ctx.fillRect(b + px, mb - 240, 4, 4);
}

function heli(ctx, x, y, time, H) {
  ctx.save();
  // サーチライト
  ctx.globalCompositeOperation = 'lighter';
  const a = PI / 2 + Math.sin(time * 0.9) * 0.4;
  const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * H, y + Math.sin(a) * H);
  g.addColorStop(0, 'rgba(230,240,255,0.3)'); g.addColorStop(1, 'rgba(230,240,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y + 6);
  ctx.lineTo(x + Math.cos(a - 0.12) * H, y + Math.sin(a - 0.12) * H); ctx.lineTo(x + Math.cos(a + 0.12) * H, y + Math.sin(a + 0.12) * H); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
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

function neonText(ctx, x, y, text, col, on, size) {
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

// ---------------------------------------------------------------- 装飾
const SIGN_WORDS = ['VICE', 'MOTEL', 'OPEN 24H', 'TACOS', 'BAR', 'DISCO', 'LIQUOR', 'SURF'];
const NEON_COLS = ['#ff2e88', '#00f0ff', '#b45cff', '#ffc93c', '#7cff6a'];

function drawDecor(ctx, d, theme, time) {
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

function oFill(ctx, col, lw = 2) { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }

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

// 内部用（テストページ等）
export function _clearBackgroundCache() { layerCache.clear(); }

