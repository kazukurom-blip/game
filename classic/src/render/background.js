// 背景の層（仮）。DESIGN.md 5-5 の多重スクロール。コードでドット絵風に作り、最初に 1 回だけ描いて覚える。
// 本物の背景（PNG）は同じ layer 名で画像を返すように差し替える。
import { VIEW_W, VIEW_H } from './camera.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// 空: 帯で段々に。帯のさかいだけ 2 段の網かけ（遠い層なので可）
function makeSky(L) {
  const c = canvas(VIEW_W, VIEW_H), g = c.getContext('2d');
  const bands = 12, bh = Math.ceil(VIEW_H / bands);
  for (let i = 0; i < bands; i++) {
    g.fillStyle = mix(L.top, L.bottom, i / (bands - 1));
    g.fillRect(0, i * bh, VIEW_W, bh);
    if (i < bands - 1) {
      g.fillStyle = mix(L.top, L.bottom, (i + 1) / (bands - 1));
      for (let y = 0; y < 2; y++) for (let x = (y & 1); x < VIEW_W; x += 2) g.fillRect(x, (i + 1) * bh - 2 + y, 1, 1);
    }
  }
  return { img: c, w: VIEW_W };
}

// ドットの丸（雲・木の葉）
function dotBlob(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

function makeClouds() {
  const W = 1600, c = canvas(W, 180), g = c.getContext('2d'), R = rng(7);
  for (let i = 0; i < 9; i++) {
    const x = 80 + i * 175 + R() * 60, y = 30 + R() * 90, n = 3 + Math.floor(R() * 3);
    const puffs = [];
    for (let k = 0; k < n; k++) puffs.push([x + k * 22 + R() * 8, y - R() * 12, 12 + R() * 10]);
    for (const [px, py, r] of puffs) dotBlob(g, px, py + 3, Math.round(r) + 1, '#c4e2f6'); // 影
    for (const [px, py, r] of puffs) dotBlob(g, px, py, Math.round(r), '#ffffff');
    for (const [px, py, r] of puffs) dotBlob(g, px - 3, py - 3, Math.round(r * 0.5), '#ffffff');
  }
  return { img: c, w: W };
}

function makeSea() {
  const W = 1600, c = canvas(W, 60), g = c.getContext('2d'), R = rng(3);
  g.fillStyle = '#4aa6dc'; g.fillRect(0, 0, W, 60);
  g.fillStyle = '#3a8cc8'; g.fillRect(0, 20, W, 40);
  g.fillStyle = '#9ed8f6';
  for (let i = 0; i < 70; i++) g.fillRect(Math.floor(R() * W), 2 + Math.floor(R() * 50), 4 + Math.floor(R() * 10), 1);
  g.fillStyle = '#d6f0ff'; g.fillRect(0, 0, W, 1);
  return { img: c, w: W };
}

// 稜線: 正弦の和を整数の段で
function ridge(W, base, amps, seed) {
  const R = rng(seed), ph = amps.map(() => R() * Math.PI * 2);
  const ys = new Array(W);
  for (let x = 0; x < W; x++) {
    let y = base;
    amps.forEach(([a, f], i) => { y += a * Math.sin((x / W) * Math.PI * 2 * f + ph[i]); });
    ys[x] = Math.round(y);
  }
  return ys;
}
function fillRidge(g, ys, H, colLight, colMid, colDark, rim) {
  const W = ys.length;
  for (let x = 0; x < W; x++) {
    const y = ys[x], slope = ys[(x + 1) % W] - ys[(x - 1 + W) % W];
    g.fillStyle = slope > 0 ? colLight : slope < 0 ? colDark : colMid; // 左上からの光: 左向きの斜面が明るい
    g.fillRect(x, y, 1, 6);
    g.fillStyle = colMid; g.fillRect(x, y + 6, 1, H - y - 6);
    if (rim) { g.fillStyle = rim; g.fillRect(x, y, 1, 1); }
  }
}

function makeMountains() {
  const W = 1600, H = 260, c = canvas(W, H), g = c.getContext('2d');
  const ys = ridge(W, 90, [[40, 3], [22, 7], [8, 17]], 11);
  fillRidge(g, ys, H, '#a6c8e4', '#8db4d8', '#7a9fc6', '#c4dcf0');
  return { img: c, w: W };
}

function makeHills() {
  const W = 1600, H = 300, c = canvas(W, H), g = c.getContext('2d');
  const ys = ridge(W, 70, [[26, 4], [14, 9], [4, 23]], 21);
  fillRidge(g, ys, H, '#9ad87e', '#7cc46a', '#62aa58', '#c4ee9c');
  // 遠くの木の点
  const R = rng(5);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(R() * W), y = ys[x] + 10 + Math.floor(R() * 40);
    dotBlob(g, x, y, 4, '#5a9c50'); dotBlob(g, x - 1, y - 1, 2, '#78ba62');
  }
  return { img: c, w: W };
}

function makeTrees() {
  const W = 1600, H = 260, c = canvas(W, H), g = c.getContext('2d'), R = rng(9);
  // 下の茂み
  const ys = ridge(W, 120, [[10, 6], [5, 15]], 31);
  fillRidge(g, ys, H, '#4e9a48', '#3f8a40', '#347a38', '#6cba58');
  for (let i = 0; i < 14; i++) {
    const x = 40 + i * 115 + Math.floor(R() * 50), top = 20 + Math.floor(R() * 40);
    const r = 24 + Math.floor(R() * 10);
    // 幹
    g.fillStyle = '#5a3a22'; g.fillRect(x - 4, top + r, 9, H - top - r);
    g.fillStyle = '#7a5232'; g.fillRect(x - 3, top + r, 3, H - top - r);
    // 葉: 線 → 暗 → 中 → 明
    dotBlob(g, x, top + r, r + 1, '#24562a');
    dotBlob(g, x, top + r, r, '#347a38');
    dotBlob(g, x - 3, top + r - 3, r - 5, '#4a9a46');
    dotBlob(g, x - 8, top + r - 9, Math.round(r * 0.35), '#6cba58');
    dotBlob(g, x + r - 6, top + r + 6, 8, '#347a38');
    dotBlob(g, x - r + 6, top + r + 4, 9, '#3f8a40');
  }
  return { img: c, w: W };
}

const MAKERS = { sky: makeSky, clouds: makeClouds, sea: makeSea, mountains: makeMountains, hills: makeHills, trees: makeTrees };

export class Background {
  constructor(map) {
    this.layers = map.background.map((L) => ({ ...L, ...MAKERS[L.layer](L) }));
    this.t = 0;
  }
  update(dt) { this.t += dt; }
  draw(ctx, cam) {
    for (const L of this.layers) {
      if (L.layer === 'sky') { ctx.drawImage(L.img, 0, 0); continue; }
      let ox = cam.x * L.parallax;
      if (L.layer === 'clouds') ox += this.t * 4; // 雲はゆっくり流れる
      const sx = ((Math.floor(ox) % L.w) + L.w) % L.w;
      const y = Math.round(L.y - cam.y * L.parallax);
      ctx.drawImage(L.img, -sx, y);
      if (L.w - sx < VIEW_W) ctx.drawImage(L.img, L.w - sx, y);
    }
  }
}
