// v4: 第2ワールド「ネオン・アーク」の背景シーン（スクリーン空間）。bgScenes.js の drawScene から呼ばれる。
// 画像（manifest の bg 節 <region>_<town|field>_<far|mid|lights>）が届くまでのコード描画。
//   arkcity  : 夜の未来都市（超高層のシルエット・ホロ看板・空飛ぶ車の光）
//   cyberwild: ネオンの電脳の密林（光る回路の巨木・ツタ・ホタル）
//   abyss    : 深海のドーム都市（水の色・ガラスのドーム・サンゴ・泡と光の筋）
//   zenith   : 雲の上の天空の塔（雲海・白い塔と金の装飾・流れる雲）
// 静的な絵は S.layer でキャッシュ（base＋glow）。毎フレーム描くのは光の粒・泡など少しだけ（性能: 1 フレーム 22ms 未満を守る）。
import { shade, rgba, rng, lerp } from './util.js';
import { PI, LW, wrap, treeSil } from './bgkit.js';

const bottomAt = (gS, H, f, base) => lerp(H * base, gS, f);
const pick = (R, a) => a[(R() * a.length) | 0];

// ---------------------------------------------------------------- 共通の部品
/** 細長い超高層ビル群（窓は glow 側）。o: {col, edge, minW, maxW, minH, maxH, gap, win:[色], lit, spire} */
function towers(P, seed, o) {
  const g = P.g, h = P.h, R = rng(seed);
  let x = -10;
  while (x < LW) {
    const w = o.minW + R() * (o.maxW - o.minW), bh = o.minH + R() * (o.maxH - o.minH);
    const bs = (R() * 1e9) | 0, kind = R();
    wrap(x, w, (xx) => {
      const r = rng(bs), top = h - bh;
      g.fillStyle = o.col;
      g.beginPath();
      if (kind < 0.3) { g.moveTo(xx, h); g.lineTo(xx, top + 30); g.lineTo(xx + w / 2, top - 20); g.lineTo(xx + w, top + 30); g.lineTo(xx + w, h); }
      else if (kind < 0.55) { g.rect(xx, top, w, bh); g.rect(xx + w * 0.3, top - 30, w * 0.4, 30); }
      else g.rect(xx, top, w, bh);
      g.fill();
      if (o.edge) { g.fillStyle = o.edge; g.fillRect(xx + w - 3, top, 3, bh); }
      if (o.spire && kind > 0.55 && r() < 0.6) { g.fillStyle = o.col; g.fillRect(xx + w / 2 - 1.5, top - 50, 3, 50); P.gl.fillStyle = '#ff2e4d'; P.gl.fillRect(xx + w / 2 - 2, top - 54, 4, 4); }
      // 窓（縦の帯）
      const gl = P.gl;
      for (let yy = top + 8; yy < h - 6; yy += o.wy || 10) {
        for (let wx = xx + 3; wx < xx + w - 5; wx += o.wx || 7) {
          if (r() > o.lit) continue;
          gl.globalAlpha = 0.5 + r() * 0.5;
          gl.fillStyle = o.win[(r() * o.win.length) | 0];
          gl.fillRect(wx, yy, o.ww || 3, o.wh || 4);
        }
      }
      gl.globalAlpha = 1;
      // 縦のネオン帯
      if (o.band && r() < o.band) {
        const nc = pick(r, o.neon || ['#19f0ff', '#ff3dd2']);
        gl.fillStyle = rgba(nc, 0.3); gl.fillRect(xx + 2, top + 10, 6, bh - 10);
        gl.fillStyle = nc; gl.fillRect(xx + 3, top + 10, 3, bh - 10);
      }
    });
    x += w + (o.gap || 4) * R();
  }
}

/** ホロ看板（四角い発光パネル＋文字）。glow に描く */
function holoSign(P, x, y, w, h, col, text) {
  const g = P.g, gl = P.gl;
  g.fillStyle = shade(col, -0.7); g.fillRect(x, y, w, h);
  gl.fillStyle = rgba(col, 0.28); gl.fillRect(x - 4, y - 4, w + 8, h + 8);
  gl.fillStyle = rgba(col, 0.75); gl.fillRect(x, y, w, h);
  gl.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = y + 3; k < y + h; k += 4) gl.fillRect(x, k, w, 1);
  if (text) {
    gl.font = `900 ${Math.round(Math.min(h * 0.62, w / (text.length * 0.62)))}px "Arial Black", sans-serif`;
    gl.textAlign = 'center'; gl.textBaseline = 'middle';
    gl.fillStyle = '#ffffff'; gl.fillText(text, x + w / 2, y + h / 2 + 1);
  }
}

/** 店の並び（町の手前）。bgScenes の townFront と同じ考え方の簡易版（看板は glow） */
function w2ShopRow(P, seed, st) {
  const g = P.g, gl = P.gl, base = P.h, R = rng(seed);
  let x = 0, i = (R() * st.names.length) | 0;
  while (x < LW - 60) {
    let w = Math.round(170 + R() * 80);
    if (LW - (x + w) < 150) w = LW - x - 2;
    const bh = 170 + R() * 80, top = base - bh, wall = pick(R, st.walls), neon = pick(R, st.neon), name = st.names[i++ % st.names.length];
    // 建物
    g.fillStyle = wall; g.fillRect(x, top, w, bh);
    g.fillStyle = shade(wall, -0.2); g.fillRect(x, top, w, 8); g.fillRect(x, top, 4, bh); g.fillRect(x + w - 4, top, 4, bh);
    if (st.round) { g.fillStyle = wall; g.beginPath(); g.ellipse(x + w / 2, top, w / 2, 26, 0, PI, 0); g.fill(); }
    // 上の窓
    for (let yy = top + 20; yy < base - 140; yy += 34) for (let k = 0; k < Math.floor((w - 20) / 40); k++) {
      const wx = x + 14 + k * 40;
      g.fillStyle = shade(wall, -0.45); g.fillRect(wx, yy, 26, 20);
      if (R() < 0.65) { gl.fillStyle = pick(R, st.win); gl.globalAlpha = 0.8; gl.fillRect(wx + 1, yy + 1, 24, 18); gl.globalAlpha = 1; }
    }
    // 看板
    const sy = base - 128, sw = w - 28;
    g.fillStyle = '#0a0a1a'; g.fillRect(x + 14, sy, sw, 26);
    gl.font = '900 16px "Arial Black", sans-serif'; gl.textAlign = 'center'; gl.textBaseline = 'middle';
    { const tw = gl.measureText(name).width; if (tw > sw - 14) gl.font = `900 ${Math.max(10, Math.floor(16 * (sw - 14) / tw))}px "Arial Black", sans-serif`; }
    gl.strokeStyle = rgba(neon, 0.5); gl.lineWidth = 6; gl.strokeText(name, x + w / 2, sy + 14);
    gl.fillStyle = '#ffffff'; gl.fillText(name, x + w / 2, sy + 14);
    gl.strokeStyle = neon; gl.lineWidth = 2; gl.strokeRect(x + 16, sy + 2, sw - 4, 22);
    // ショーウィンドウ・ドア
    const wy = base - 86;
    g.fillStyle = shade(wall, -0.55); g.fillRect(x + 12, wy, w - 64, 80); g.fillRect(x + w - 44, wy - 8, 30, 88);
    const ig = gl.createLinearGradient(0, wy, 0, wy + 80); ig.addColorStop(0, rgba(st.inner, 0.85)); ig.addColorStop(1, rgba(st.inner, 0.3));
    gl.fillStyle = ig; gl.fillRect(x + 14, wy + 2, w - 68, 76); gl.fillRect(x + w - 42, wy - 6, 26, 84);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(x + 22, wy); g.lineTo(x + 40, wy); g.lineTo(x + 26, wy + 80); g.lineTo(x + 8, wy + 80); g.closePath(); g.fill();
    // 縁のネオン
    gl.fillStyle = neon; gl.fillRect(x + 6, top + 12, 3, bh - 110);
    x += w + 2;
  }
}
function townRow(S, key, st) {
  const fr = S.layer('front', 300, (P) => w2ShopRow(P, 9100 + key * 37, st));
  S.tile(fr, 0.82, S.gS + 4, null);
}

// 光の粒（ホタル・泡・星）を少しだけ（毎フレーム）
function motes(ctx, S, n, col, opt = {}) {
  const { W, H, time, cam } = S;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const sp = opt.rise ? (time * (18 + (i % 5) * 7)) : 0;
    const bx = ((i * 157 + Math.sin(time * 0.6 + i) * 30 - cam.x * (opt.par ?? 0.4)) % W + W) % W;
    let by = opt.rise ? H - (((i * 83 + sp) % (H + 40))) : H * (opt.y0 ?? 0.45) + ((i * 53) % (H * (opt.yr ?? 0.4))) + Math.cos(time + i) * 10;
    const a = (opt.alpha ?? 0.6) * (0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i)));
    ctx.fillStyle = rgba(col, a);
    const s = opt.size ?? 2.5;
    if (opt.round) { ctx.beginPath(); ctx.arc(bx, by, s, 0, PI * 2); ctx.fill(); } else ctx.fillRect(bx, by, s, s);
  }
  ctx.restore();
}

// ================================================================ arkcity（夜の未来都市）
const AR_SHOP = { walls: ['#1a1a3a', '#24204a', '#141a30', '#2a1a40'], neon: ['#19f0ff', '#ff3dd2', '#ffd23f', '#7cff6a'], win: ['#7fe9ff', '#ff9ad5', '#ffe9b0'], inner: '#9ff0ff',
  names: ['HOLO MART', 'NEO RAMEN', 'ARK BANK', 'CYBER CAFE', 'GEAR LAB', 'SKY TAXI', 'ARCADE X', 'DATA BAR'] };
function bgArkcity(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  S.haze = 0.45; S.tintK = 0.55; // 昼でもネオンの街の色を残す
  // 地平線のネオンのもや
  const hg = ctx.createLinearGradient(0, horizon - 260, 0, horizon + 40);
  hg.addColorStop(0, 'rgba(255,61,210,0)'); hg.addColorStop(1, rgba('#ff3dd2', 0.1 + 0.25 * S.lights));
  ctx.fillStyle = hg; ctx.fillRect(0, horizon - 260, W, 300);
  if (v === 3 && !town) return bgDatacore(ctx, S);
  // 遠景: 霞む超高層
  const far = S.layer('far', 520, (P) => towers(P, 2101, { col: '#1a1446', minW: 26, maxW: 70, minH: 220, maxH: 500, gap: 8, win: ['#7fe9ff', '#ff9ad5'], lit: 0.18, wx: 6, wy: 9, ww: 2, wh: 3, spire: true }));
  S.tile(far, 0.06, horizon + 60, '#1a1446');
  // 中景: 巨大構造物＋ホロ看板＋空中チューブ
  const mid = S.layer('mid', 560, (P) => {
    towers(P, 2102, { col: '#221a52', edge: '#3a2c7a', minW: 60, maxW: 130, minH: 260, maxH: 540, gap: 30, win: ['#7fe9ff', '#ff9ad5', '#ffe9b0'], lit: 0.3, wx: 9, wy: 12, ww: 4, wh: 5, band: 0.5, neon: ['#19f0ff', '#ff3dd2', '#ffd23f'] });
    const R = rng(2103), h = P.h;
    const words = ['ARK', 'NEO', '24H', 'HOLO', 'VR', 'SKY', 'ZERO'];
    for (let i = 0; i < 6; i++) { const x = 40 + i * 168 + R() * 40, y = 120 + R() * 220; holoSign(P, x, y, 70 + R() * 40, 36 + R() * 18, pick(R, ['#19f0ff', '#ff3dd2', '#ffd23f', '#7cff6a']), pick(R, words)); }
    // 空中チューブ（透明な道）
    const g = P.g;
    for (const ty of [180, 330]) {
      g.fillStyle = 'rgba(160,220,255,0.12)'; g.fillRect(0, ty, LW, 22);
      g.strokeStyle = 'rgba(160,220,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, ty); g.lineTo(LW, ty); g.moveTo(0, ty + 22); g.lineTo(LW, ty + 22); g.stroke();
      for (let x = 0; x < LW; x += 128) { g.fillStyle = '#2a2058'; g.fillRect(x, ty + 22, 8, h - ty - 22); }
      P.gl.fillStyle = rgba('#19f0ff', 0.45); P.gl.fillRect(0, ty + 9, LW, 3);
    }
  });
  const mb = bottomAt(gS, H, 0.3, 0.94) + 40;
  S.tile(mid, 0.3, mb, '#221a52');
  // 空飛ぶ車の光（2 本の高さを流れる）
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let lane = 0; lane < 3; lane++) {
      const y = H * (0.18 + lane * 0.1) + Math.sin(time * 0.3 + lane) * 6;
      for (let k = 0; k < 5; k++) {
        const sp = (lane % 2 ? -1 : 1) * (120 + lane * 50);
        const x = (((time * sp + k * 330 + lane * 90 - S.cam.x * 0.15) % (W + 200)) + W + 200) % (W + 200) - 100;
        const c = lane % 2 ? '#ff3d6a' : '#e8f6ff';
        ctx.fillStyle = rgba(c, 0.65); ctx.fillRect(x, y, 26, 2.5);
        ctx.fillStyle = rgba(c, 0.18); ctx.fillRect(x - (sp > 0 ? 40 : -26), y, 40, 2.5);
      }
    }
    ctx.restore();
  });
  if (v === 2 && !town) { // ネオン摩天街: 手前に外壁の鉄骨
    const wall = S.layer('wall', 420, (P) => {
      const g = P.g, h = P.h;
      g.strokeStyle = '#2a2258'; g.lineWidth = 8;
      for (let x = 0; x < LW; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.lineWidth = 3; g.beginPath(); for (let x = 0; x < LW; x += 128) for (let y = 0; y < h; y += 105) { g.moveTo(x, y); g.lineTo(x + 128, y + 105); } g.stroke();
      for (let x = 64; x < LW; x += 256) holoSign(P, x, 140, 90, 44, '#ff3dd2', 'ARK');
    });
    S.tile(wall, 0.55, bottomAt(gS, H, 0.55, 0.98) + 30, null);
    return;
  }
  if (town) townRow(S, 1, AR_SHOP);
}
// データ・コア（屋内）: サーバーラックと流れるデータ
function bgDatacore(ctx, S) {
  const { W, H, gS, time, cam } = S;
  S.indoor = true;
  ctx.fillStyle = '#060418'; ctx.fillRect(0, 0, W, H);
  const room = S.layer('core', 620, (P) => {
    const g = P.g, gl = P.gl, h = P.h, R = rng(2201);
    g.fillStyle = '#0e0a2a'; g.fillRect(0, 0, LW, h);
    for (let x = 0; x < LW; x += 128) {
      g.fillStyle = '#16123a'; g.fillRect(x + 8, 80, 112, h - 120);
      g.fillStyle = '#0a0820'; for (let y = 96; y < h - 50; y += 22) g.fillRect(x + 16, y, 96, 14);
      for (let y = 100; y < h - 50; y += 22) for (let k = 0; k < 6; k++) { if (R() < 0.5) { gl.fillStyle = pick(R, ['#19f0ff', '#3dff8a', '#ff3dd2']); gl.fillRect(x + 22 + k * 14, y + 4, 5, 4); } }
    }
    g.fillStyle = '#1a1446'; g.fillRect(0, 0, LW, 70); g.fillRect(0, h - 40, LW, 40);
    for (let x = 32; x < LW; x += 128) { gl.fillStyle = '#9ff0ff'; gl.fillRect(x, 56, 60, 6); }
  });
  const rb = bottomAt(gS, H, 0.55, 0.98) + 30;
  S.tile(room, 0.55, rb, '#1a1446');
  if (rb - 620 > 0) { ctx.fillStyle = '#0e0a2a'; ctx.fillRect(0, 0, W, rb - 620); }
  // 流れるデータ（縦の光の筋）
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const x = ((i * 97 - cam.x * 0.55) % W + W) % W;
      const y = ((time * (120 + (i % 4) * 40) + i * 140) % (H + 200)) - 100;
      const g = ctx.createLinearGradient(0, y - 90, 0, y);
      g.addColorStop(0, 'rgba(61,255,138,0)'); g.addColorStop(1, 'rgba(61,255,138,0.5)');
      ctx.fillStyle = g; ctx.fillRect(x, y - 90, 2, 90);
    }
    ctx.restore();
  });
}

// ================================================================ cyberwild（ネオンの電脳の密林）
const CW_SHOP = { walls: ['#1e3a2a', '#24402e', '#183226', '#2a3a20'], neon: ['#5cff9a', '#b04dff', '#ffd23f', '#19f0ff'], win: ['#e8ffb0', '#9ff0c0', '#ffd86e'], inner: '#c8ff9a', round: true,
  names: ['SEED SHOP', 'ROOT BAR', 'MOSS CAFE', 'VINE INN', 'BUG LAB', 'GLOW TEA', 'TREE HUT'] };
/** 回路の模様が光る巨木 */
function circuitTree(P, x, base, h, col, R) {
  const g = P.g, gl = P.gl;
  const tw = h * 0.09;
  g.fillStyle = col;
  g.beginPath(); g.moveTo(x - tw * 1.6, base); g.quadraticCurveTo(x - tw * 0.6, base - h * 0.4, x - tw * 0.5, base - h * 0.75); g.lineTo(x + tw * 0.5, base - h * 0.75); g.quadraticCurveTo(x + tw * 0.6, base - h * 0.4, x + tw * 1.6, base); g.closePath(); g.fill();
  // 樹冠
  for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + (R() - 0.5) * h * 0.55, base - h * (0.72 + R() * 0.28), h * (0.16 + R() * 0.1), h * (0.1 + R() * 0.06), 0, 0, PI * 2); g.fill(); }
  // 回路の線（glow）
  const nc = pick(R, ['#5cff9a', '#19f0ff', '#b04dff']);
  gl.strokeStyle = rgba(nc, 0.85); gl.lineWidth = 1.6;
  gl.beginPath();
  let cx = x, cy = base;
  for (let s = 0; s < 7; s++) { const ny = cy - h * 0.1; gl.moveTo(cx, cy); gl.lineTo(cx, ny); const nx = cx + (R() < 0.5 ? -1 : 1) * tw * 0.4; gl.lineTo(nx, ny - 6); cx = nx; cy = ny - 6; }
  gl.stroke();
  gl.fillStyle = nc; for (let k = 0; k < 5; k++) { gl.beginPath(); gl.arc(x + (R() - 0.5) * h * 0.5, base - h * (0.7 + R() * 0.25), 2.2, 0, PI * 2); gl.fill(); }
}
function bgCyberwild(ctx, S) {
  const { W, H, gS, horizon, v, town, time } = S;
  S.haze = 0.4; S.tintK = 0.5; // 昼でも密林の緑とネオンを残す
  // 遠景: 霞む巨木の森
  const far = S.layer('far', 440, (P) => { const R = rng(3101); for (let i = 0; i < 9; i++) { const x = i * (LW / 9) + R() * 40; wrap(x, 160, (xx) => circuitTree(P, xx, P.h, 300 + R() * 140, '#123a34', R)); } P.g.fillStyle = '#123a34'; P.g.fillRect(0, P.h - 30, LW, 30); });
  S.tile(far, 0.08, horizon + 70, '#123a34');
  // もや
  const fog = ctx.createLinearGradient(0, horizon - 120, 0, horizon + 80);
  fog.addColorStop(0, 'rgba(92,255,154,0)'); fog.addColorStop(1, rgba('#5cff9a', 0.06 + 0.12 * S.lights));
  ctx.fillStyle = fog; ctx.fillRect(0, horizon - 120, W, 200);
  if (v === 3 && !town) { // カーネルの巣: 光る沼
    const pond = S.layer('pond', 220, (P) => {
      const g = P.g, gl = P.gl, R = rng(3102);
      g.fillStyle = '#0a2a24'; g.fillRect(0, 60, LW, 160);
      gl.fillStyle = rgba('#5cff9a', 0.35); for (let i = 0; i < 18; i++) gl.fillRect(R() * LW, 80 + R() * 120, 30 + R() * 60, 2);
      for (let i = 0; i < 7; i++) { const x = R() * LW; wrap(x, 60, (xx) => { g.fillStyle = '#0e3a2e'; g.beginPath(); g.ellipse(xx, 70, 50, 14, 0, 0, PI * 2); g.fill(); gl.fillStyle = '#ff3dd2'; gl.beginPath(); gl.arc(xx, 62, 4, 0, PI * 2); gl.fill(); }); }
    });
    S.tile(pond, 0.3, bottomAt(gS, H, 0.3, 0.95) + 30, '#0a2a24');
  }
  // 中景: 太い幹・ツタ・ネオンの花
  const mid = S.layer('mid', 520, (P) => {
    const g = P.g, gl = P.gl, h = P.h, R = rng(3103);
    for (let i = 0; i < 5; i++) { const x = i * (LW / 5) + R() * 60; wrap(x, 220, (xx) => circuitTree(P, xx, h, 420 + R() * 100, '#1a4a3a', R)); }
    // ツタ
    g.strokeStyle = '#1f5a40'; g.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const x = R() * LW, len = 120 + R() * 220; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (R() - 0.5) * 40, len * 0.5, x + (R() - 0.5) * 20, len); g.stroke(); gl.fillStyle = pick(R, ['#5cff9a', '#ff3dd2', '#19f0ff']); gl.beginPath(); gl.arc(x + (R() - 0.5) * 20, len, 3.5, 0, PI * 2); gl.fill(); }
    // 茂み
    g.fillStyle = '#123a2c'; for (let x = 0; x < LW; x += 44) { g.beginPath(); g.ellipse(x + R() * 20, h - 20, 40 + R() * 20, 26 + R() * 12, 0, 0, PI * 2); g.fill(); }
    g.fillRect(0, h - 20, LW, 20);
    for (let i = 0; i < 14; i++) { const x = R() * LW, y = h - 30 - R() * 40; gl.fillStyle = pick(R, ['#ff3dd2', '#ffd23f', '#5cff9a']); gl.beginPath(); gl.arc(x, y, 3, 0, PI * 2); gl.fill(); gl.fillStyle = 'rgba(255,255,255,0.2)'; gl.beginPath(); gl.arc(x, y, 8, 0, PI * 2); gl.fill(); }
  });
  S.tile(mid, 0.3, bottomAt(gS, H, 0.3, 0.95) + 40, '#123a2c');
  if (v === 2 && !town) { // ネオン樹海: 手前の枝と葉
    const near = S.layer('leaves', 260, (P) => {
      const g = P.g, R = rng(3104);
      g.fillStyle = '#0a2a20';
      for (let i = 0; i < 12; i++) { const x = R() * LW; g.beginPath(); g.ellipse(x, 30 + R() * 30, 90 + R() * 60, 40 + R() * 20, R() * 0.6 - 0.3, 0, PI * 2); g.fill(); }
      g.strokeStyle = '#0a2a20'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 50); for (let x = 0; x <= LW; x += 128) g.quadraticCurveTo(x + 64, 90, x + 128, 50); g.stroke();
    });
    S.tile(near, 0.75, 200, null);
  }
  // ホタル
  S.post(() => motes(ctx, S, 22, '#e8ffb0', { alpha: 0.35 + 0.5 * S.lights, y0: 0.35, yr: 0.5 }));
  if (town) townRow(S, 2, CW_SHOP);
}

// ================================================================ abyss（深海のドーム都市）
const AB_SHOP = { walls: ['#14305a', '#1a3a6a', '#102448', '#1e2a5a'], neon: ['#5ee8ff', '#ff6fd8', '#ffd23f', '#3dff8a'], win: ['#9ff0ff', '#c8e0ff', '#ffd6f0'], inner: '#9fe8ff', round: true,
  names: ['PEARL SHOP', 'DIVE BAR', 'KELP CAFE', 'SUB DOCK', 'CORAL INN', 'FISH MARKET', 'BUBBLE TEA'] };
function bgAbyss(ctx, S) {
  const { W, H, gS, horizon, v, town, time, cam } = S;
  S.space = true; // 太陽・月・星は出さない（水の中）
  S.haze = 0.6; S.tintK = 0.8;
  // 水の色（全面）。上ほど明るい
  const water = ctx.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, '#1e6aa8'); water.addColorStop(0.45, '#0f3a78'); water.addColorStop(1, '#061638');
  ctx.fillStyle = water; ctx.fillRect(0, 0, W, H);
  // 光の筋（海面から）
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const day = S.w.day + S.w.dawn * 0.6 + S.w.dusk * 0.4;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 240 + Math.sin(time * 0.3 + i) * 40 - cam.x * 0.05) % (W + 300) + W + 300) % (W + 300) - 150;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      g.addColorStop(0, rgba('#bff6ff', 0.05 + 0.12 * day)); g.addColorStop(1, 'rgba(191,246,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 60, 0); ctx.lineTo(x + 160, H * 0.8); ctx.lineTo(x + 40, H * 0.8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  });
  if (v === 3 && !town) return bgDome(ctx, S);
  // 遠景: ガラスのドーム群（中に街の灯）
  const far = S.layer('far', 360, (P) => {
    const g = P.g, gl = P.gl, h = P.h, R = rng(4101);
    for (let i = 0; i < 4; i++) {
      const cx = 120 + i * 260 + R() * 40, rw = 90 + R() * 70, rh = rw * 0.8;
      wrap(cx - rw, rw * 2, (xx) => {
        const x = xx + rw;
        g.fillStyle = 'rgba(40,90,160,0.45)'; g.beginPath(); g.ellipse(x, h, rw, rh, 0, PI, 0); g.fill();
        g.strokeStyle = 'rgba(160,220,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, h, rw, rh, 0, PI, 0); g.stroke();
        g.lineWidth = 1; g.beginPath(); for (let k = 1; k < 5; k++) { const a = PI + (k / 5) * PI; g.moveTo(x, h - rh); g.lineTo(x + Math.cos(a) * rw, h + Math.sin(a) * rh); } g.stroke();
        for (let k = 0; k < 8; k++) { const bx = x - rw * 0.7 + R() * rw * 1.4, bh = 20 + R() * rh * 0.6; g.fillStyle = '#0e2a58'; g.fillRect(bx, h - bh, 10 + R() * 14, bh); gl.fillStyle = pick(R, ['#9ff0ff', '#ffd6f0', '#ffe9b0']); gl.fillRect(bx + 3, h - bh + 4, 3, 3); }
      });
    }
    g.fillStyle = '#0a2050'; g.fillRect(0, h - 6, LW, 6);
  });
  S.tile(far, 0.08, horizon + 40, '#0a2050');
  // 遠くを泳ぐ大きな魚の影
  S.post(() => {
    const x = (((time * 18) - cam.x * 0.04) % (W + 600) + W + 600) % (W + 600) - 300, y = H * 0.22 + Math.sin(time * 0.4) * 20;
    ctx.save(); ctx.fillStyle = 'rgba(4,16,48,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y, 120, 34, 0, 0, PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 110, y); ctx.lineTo(x - 170, y - 34); ctx.lineTo(x - 165, y + 34); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  // 中景: サンゴ礁・海藻
  const mid = S.layer('mid', 380, (P) => {
    const g = P.g, gl = P.gl, h = P.h, R = rng(4102);
    g.fillStyle = '#0c2a5a'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= LW; x += 32) g.lineTo(x, h - 60 - Math.sin(x / LW * PI * 6) * 20 - R() * 14); g.lineTo(LW, h); g.fill();
    for (let i = 0; i < 18; i++) {
      const x = R() * LW, ch = 60 + R() * 120, c = pick(R, ['#ff6f9f', '#ff9a5c', '#c86fff', '#5ee8ff']);
      wrap(x - 40, 80, (xx0) => {
        const xx = xx0 + 40;
        g.strokeStyle = shade(c, -0.35); g.lineWidth = 6;
        g.beginPath(); g.moveTo(xx, h - 40); g.lineTo(xx, h - 40 - ch * 0.6); g.moveTo(xx, h - 40 - ch * 0.3); g.lineTo(xx - 24, h - 40 - ch * 0.8); g.moveTo(xx, h - 40 - ch * 0.45); g.lineTo(xx + 22, h - 40 - ch); g.stroke();
        gl.fillStyle = rgba(c, 0.8); gl.beginPath(); gl.arc(xx - 24, h - 40 - ch * 0.8, 4, 0, PI * 2); gl.arc(xx + 22, h - 40 - ch, 4, 0, PI * 2); gl.arc(xx, h - 40 - ch * 0.6, 4, 0, PI * 2); gl.fill();
      });
    }
    g.strokeStyle = '#1a5a4a'; g.lineWidth = 5;
    for (let i = 0; i < 22; i++) { const x = R() * LW, l = 80 + R() * 160; g.beginPath(); g.moveTo(x, h); for (let k = 1; k <= 6; k++) g.lineTo(x + Math.sin(k * 1.3 + i) * 10, h - l * k / 6); g.stroke(); }
  });
  S.tile(mid, 0.3, bottomAt(gS, H, 0.3, 0.95) + 40, '#0c2a5a');
  if (v === 2 && !town) { // サンゴの迷宮: 岩の壁
    const rock = S.layer('rock', 520, (P) => {
      const g = P.g, h = P.h, R = rng(4103);
      g.fillStyle = '#081c40';
      g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= LW; x += 40) g.lineTo(x, 60 + R() * 60); g.lineTo(LW, 0); g.fill();
      for (let x = 0; x < LW; x += 200) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 30, h - 200 - R() * 160); g.lineTo(x + 90, h - 140 - R() * 100); g.lineTo(x + 120, h); g.fill(); }
    });
    S.tile(rock, 0.5, bottomAt(gS, H, 0.5, 0.98) + 30, null);
  }
  // 泡
  S.post(() => motes(ctx, S, 26, '#dff8ff', { rise: true, round: true, size: 2.6, alpha: 0.35, par: 0.3 }));
  if (town) townRow(S, 3, AB_SHOP);
}
// 女王のドーム（屋内の大ドーム）
function bgDome(ctx, S) {
  const { W, H, gS, time } = S;
  S.indoor = true;
  const dome = S.layer('dome', 640, (P) => {
    const g = P.g, gl = P.gl, h = P.h;
    g.strokeStyle = 'rgba(160,220,255,0.55)'; g.lineWidth = 6;
    for (let x = 0; x < LW; x += 256) { g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + 128, -60, x + 256, h); g.stroke(); }
    g.lineWidth = 2; for (let y = 120; y < h; y += 110) { g.beginPath(); g.moveTo(0, y); g.lineTo(LW, y); g.stroke(); }
    // 玉座の間の柱
    for (let x = 100; x < LW; x += 256) { g.fillStyle = '#1a2a6a'; g.fillRect(x, h - 360, 40, 360); g.fillStyle = '#ff6fd8'; g.fillRect(x - 6, h - 370, 52, 12); gl.fillStyle = rgba('#ff6fd8', 0.6); gl.fillRect(x + 16, h - 340, 8, 300); }
    g.fillStyle = '#0a1840'; g.fillRect(0, h - 40, LW, 40);
  });
  S.tile(dome, 0.45, bottomAt(gS, H, 0.45, 0.98) + 30, '#0a1840');
  S.post(() => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ff6fd8', 0.04 + 0.03 * Math.sin(time * 1.5)); ctx.fillRect(0, 0, W, H); ctx.restore(); });
  S.post(() => motes(ctx, S, 18, '#ffd6f0', { rise: true, round: true, size: 2.2, alpha: 0.3 }));
}

// ================================================================ zenith（雲の上の天空の塔）
const ZE_SHOP = { walls: ['#f4f0e8', '#e8e4f8', '#fff6e0', '#e0ecff'], neon: ['#ffd23f', '#7ad8ff', '#ff9ad5', '#b45cff'], win: ['#ffe9b0', '#c8e8ff', '#fff6d0'], inner: '#fff0c0', round: true,
  names: ['STAR SHOP', 'CLOUD CAFE', 'ANGEL INN', 'HALO GEAR', 'SKY TEA', 'ORACLE', 'WING SHOP'] };
/** 雲（もこもこの帯） */
function cloudBand(g, y, col, R, n, rmin, rmax) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) { const x = (i / n) * LW + R() * 40, r = rmin + R() * (rmax - rmin); wrap(x - r, r * 2, (xx) => { g.beginPath(); g.ellipse(xx + r, y - r * 0.3, r, r * 0.55, 0, 0, PI * 2); g.fill(); }); }
  g.fillRect(0, y - 4, LW, 400);
}
function bgZenith(ctx, S) {
  const { W, H, gS, horizon, v, town, time, cam } = S;
  if (v === 3 && !town) return bgSanctum(ctx, S);
  // 遠景: 遠くの浮島と塔
  const far = S.layer('far', 420, (P) => {
    const g = P.g, gl = P.gl, h = P.h, R = rng(5101);
    for (let i = 0; i < 5; i++) {
      const x = 80 + i * 200 + R() * 60, th = 160 + R() * 200;
      wrap(x - 30, 60, (xx0) => {
        const xx = xx0 + 30;
        g.fillStyle = 'rgba(200,214,255,0.75)'; g.beginPath(); g.moveTo(xx - 18, h - 60); g.lineTo(xx - 10, h - 60 - th); g.lineTo(xx, h - 80 - th); g.lineTo(xx + 10, h - 60 - th); g.lineTo(xx + 18, h - 60); g.closePath(); g.fill();
        gl.fillStyle = '#ffd23f'; gl.fillRect(xx - 2, h - 84 - th, 4, 4);
        g.fillStyle = 'rgba(214,224,255,0.8)'; g.beginPath(); g.ellipse(xx, h - 60, 50, 14, 0, 0, PI); g.fill();
      });
    }
    cloudBand(g, h - 30, 'rgba(255,255,255,0.85)', R, 14, 40, 90);
  });
  S.tile(far, 0.05, horizon + 80, '#ffffff');
  // 雲海（地平線の下は雲）
  const sea = S.layer('clouds', 300, (P) => { const R = rng(5102); cloudBand(P.g, 80, '#f4f6ff', R, 10, 60, 120); P.g.fillStyle = '#e4e8fa'; for (let i = 0; i < 12; i++) { P.g.beginPath(); P.g.ellipse(R() * LW, 160 + R() * 100, 80, 18, 0, 0, PI * 2); P.g.fill(); } });
  S.tile(sea, 0.12, bottomAt(gS, H, 0.12, 0.9) + 120, '#e4e8fa');
  if (v === 2 && !town) { // 天空の螺旋: 塔の外壁
    const wall = S.layer('wall', 640, (P) => {
      const g = P.g, gl = P.gl, h = P.h;
      g.fillStyle = 'rgba(240,236,228,0.92)'; g.fillRect(0, 0, LW, h);
      g.fillStyle = '#d8d0c0'; for (let x = 0; x < LW; x += 128) g.fillRect(x, 0, 14, h);
      for (let y = 40; y < h; y += 150) { g.fillStyle = '#e8c860'; g.fillRect(0, y, LW, 6); }
      for (let x = 50; x < LW; x += 256) for (let y = 80; y < h - 100; y += 150) { g.fillStyle = '#b8c8e8'; g.beginPath(); g.moveTo(x, y + 90); g.lineTo(x, y + 30); g.quadraticCurveTo(x + 30, y, x + 60, y + 30); g.lineTo(x + 60, y + 90); g.closePath(); g.fill(); gl.fillStyle = rgba('#ffe9b0', 0.7); gl.fillRect(x + 8, y + 36, 44, 50); }
    });
    S.tile(wall, 0.45, bottomAt(gS, H, 0.45, 0.98) + 30, 'rgba(240,236,228,0.92)');
  } else {
    // 中景: 白い塔と金の装飾・アーチ
    const mid = S.layer('mid', 520, (P) => {
      const g = P.g, gl = P.gl, h = P.h, R = rng(5103);
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 256 + R() * 40, tw = 70 + R() * 30, th = 300 + R() * 180;
        wrap(x, tw, (xx) => {
          g.fillStyle = '#f2eee6'; g.fillRect(xx, h - th, tw, th);
          g.fillStyle = '#d8d0c0'; g.fillRect(xx + tw - 8, h - th, 8, th);
          g.fillStyle = '#e8c860'; g.fillRect(xx - 6, h - th, tw + 12, 10); g.fillRect(xx - 4, h - th * 0.5, tw + 8, 6);
          g.fillStyle = '#f2eee6'; g.beginPath(); g.moveTo(xx - 6, h - th); g.lineTo(xx + tw / 2, h - th - 60); g.lineTo(xx + tw + 6, h - th); g.closePath(); g.fill();
          for (let y = h - th + 30; y < h - 40; y += 60) { g.fillStyle = '#b8c8e8'; g.fillRect(xx + tw / 2 - 10, y, 20, 32); gl.fillStyle = rgba('#ffe9b0', 0.75); gl.fillRect(xx + tw / 2 - 8, y + 2, 16, 28); }
          gl.fillStyle = '#ffd23f'; gl.beginPath(); gl.arc(xx + tw / 2, h - th - 64, 5, 0, PI * 2); gl.fill();
        });
      }
      // アーチの回廊
      g.fillStyle = '#ece6da';
      for (let x = 0; x < LW; x += 128) { g.fillRect(x, h - 150, 16, 150); g.beginPath(); g.moveTo(x + 16, h - 150); g.quadraticCurveTo(x + 72, h - 220, x + 128, h - 150); g.lineTo(x + 128, h - 160); g.quadraticCurveTo(x + 72, h - 230, x + 16, h - 160); g.closePath(); g.fill(); }
      g.fillStyle = '#e8c860'; g.fillRect(0, h - 162, LW, 4);
      cloudBand(g, h - 10, '#ffffff', R, 16, 20, 50);
    });
    S.tile(mid, 0.3, bottomAt(gS, H, 0.3, 0.95) + 40, '#ffffff');
  }
  // 流れる雲（手前を少し）
  S.post(() => {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 4; i++) {
      const x = (((time * (14 + i * 6) + i * 420) - cam.x * (0.5 + i * 0.1)) % (W + 600) + W + 600) % (W + 600) - 300, y = H * (0.2 + i * 0.12);
      ctx.beginPath(); ctx.ellipse(x, y, 160, 26, 0, 0, PI * 2); ctx.ellipse(x + 90, y - 12, 90, 22, 0, 0, PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  if (town) townRow(S, 4, ZE_SHOP);
}
// 頂上の聖域（星空の下の神殿）
function bgSanctum(ctx, S) {
  const { W, H, gS, time } = S;
  S.space = true;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a0628'); sky.addColorStop(0.6, '#2a1a5c'); sky.addColorStop(1, '#7a5ab8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const stars = S.layer('stars', 420, (P) => { const R = rng(5201); const gl = P.gl; for (let i = 0; i < 420; i++) { gl.fillStyle = R() < 0.15 ? '#ffd23f' : '#ffffff'; gl.globalAlpha = 0.3 + R() * 0.7; const s = R() < 0.08 ? 2 : 1; gl.fillRect(R() * LW, R() * 420, s, s); } gl.globalAlpha = 1; P.g.fillStyle = 'rgba(0,0,0,0.01)'; P.g.fillRect(0, 0, 1, 1); });
  S.tile(stars, 0.02, 430, null);
  const hall = S.layer('hall', 560, (P) => {
    const g = P.g, gl = P.gl, h = P.h;
    for (let x = 40; x < LW; x += 170) {
      g.fillStyle = '#f2eee6'; g.fillRect(x, h - 420, 46, 420);
      g.fillStyle = '#d8d0c0'; g.fillRect(x + 38, h - 420, 8, 420);
      g.fillStyle = '#e8c860'; g.fillRect(x - 8, h - 432, 62, 14); g.fillRect(x - 8, h - 20, 62, 20);
      gl.fillStyle = rgba('#ffd23f', 0.5); gl.fillRect(x + 20, h - 400, 6, 370);
    }
    g.fillStyle = '#e8c860'; g.fillRect(0, h - 440, LW, 8);
    g.fillStyle = '#efe8da'; g.fillRect(0, h - 30, LW, 30);
  });
  S.tile(hall, 0.4, bottomAt(gS, H, 0.4, 0.98) + 30, '#efe8da');
  // 頂の光の輪
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const x = W / 2 - S.cam.x * 0.02, y = H * 0.2, r = 70 + Math.sin(time) * 4;
    ctx.strokeStyle = rgba('#ffd23f', 0.5); ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.35, 0, 0, PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(x, y, 10, x, y, 220); g.addColorStop(0, 'rgba(255,230,160,0.25)'); g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 220, y - 220, 440, 440);
    ctx.restore();
  });
}

/** drawScene から: 第2ワールドの地域なら描いて true */
export function drawWorld2Scene(ctx, S) {
  switch (S.region) {
    case 'arkcity': bgArkcity(ctx, S); return true;
    case 'cyberwild': bgCyberwild(ctx, S); return true;
    case 'abyss': bgAbyss(ctx, S); return true;
    case 'zenith': bgZenith(ctx, S); return true;
    default: return false;
  }
}
void treeSil;
