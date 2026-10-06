// メイプル風の「太く角ばった」数字・英字（ダメージの数字・LEVEL UP!!・QUEST CLEAR）。
// フォントに頼らず、10×14 の升目の折れ線を太線でなぞって形を作る（どの環境でも同じ見た目）。
// 1文字ずつ（スタイル×大きさごとに）オフスクリーンへ描いてキャッシュし、描画は drawImage だけにする。
import { makeCanvas } from './util.js';

const CAN = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';

// ---------------------------------------------------------------- 字形（折れ線。z=true は閉じる）
const P = (pts, z = false) => ({ pts, z });
const ZERO = P([[2, 1], [8, 1], [9, 2], [9, 12], [8, 13], [2, 13], [1, 12], [1, 2]], true);
const GLYPHS = {
  0: { s: [ZERO] },
  1: { w: 7, s: [P([[1.2, 3.2], [4, 1], [4, 13]])] },
  2: { s: [P([[1, 3], [2, 1], [8, 1], [9, 2], [9, 6], [8, 7.4], [1, 13], [9, 13]])] },
  3: { s: [P([[1, 1], [9, 1], [9, 6], [8, 7], [3, 7]]), P([[8, 7], [9, 8], [9, 12], [8, 13], [1, 13]])] },
  4: { s: [P([[7, 13], [7, 1], [1, 9.4], [9.4, 9.4]])] },
  5: { s: [P([[9, 1], [1.2, 1], [1.2, 6.6], [8, 6.6], [9, 7.6], [9, 12], [8, 13], [1, 13]])] },
  6: { s: [P([[8.6, 1], [2, 1], [1, 2], [1, 12], [2, 13], [8, 13], [9, 12], [9, 8], [8, 7], [1, 7]])] },
  7: { s: [P([[1, 1], [9, 1], [9, 3.2], [4.2, 13]])] },
  8: { s: [P([[2, 1], [8, 1], [9, 2], [9, 5.6], [8, 7], [2, 7], [1, 8.4], [1, 12], [2, 13], [8, 13], [9, 12], [9, 8.4], [8, 7], [2, 7], [1, 5.6], [1, 2]], true)] },
  9: { s: [P([[9, 7], [2, 7], [1, 6], [1, 2], [2, 1], [8, 1], [9, 2], [9, 12], [8, 13], [1.4, 13]])] },
  A: { s: [P([[1, 13], [1, 4], [4, 1], [6, 1], [9, 4], [9, 13]]), P([[1, 8.2], [9, 8.2]])] },
  B: { s: [P([[1, 13], [1, 1], [7, 1], [9, 2.6], [9, 5.2], [7.4, 7], [1, 7]]), P([[7.4, 7], [9, 8.6], [9, 11.4], [7.4, 13], [1, 13]])] },
  C: { s: [P([[9, 2.4], [8, 1], [2, 1], [1, 2], [1, 12], [2, 13], [8, 13], [9, 11.6]])] },
  D: { s: [P([[1, 1], [6, 1], [9, 4], [9, 10], [6, 13], [1, 13]], true)] },
  E: { s: [P([[9, 1], [1, 1], [1, 13], [9, 13]]), P([[1, 7], [7.4, 7]])] },
  F: { s: [P([[9, 1], [1, 1], [1, 13]]), P([[1, 7], [7.4, 7]])] },
  G: { s: [P([[9, 2.4], [8, 1], [2, 1], [1, 2], [1, 12], [2, 13], [8, 13], [9, 12], [9, 7.6], [5.4, 7.6]])] },
  H: { s: [P([[1, 1], [1, 13]]), P([[9, 1], [9, 13]]), P([[1, 7], [9, 7]])] },
  I: { w: 6, s: [P([[3, 1], [3, 13]])] },
  J: { s: [P([[9, 1], [9, 12], [8, 13], [2, 13], [1, 12], [1, 9.6]])] },
  K: { s: [P([[1, 1], [1, 13]]), P([[9, 1], [2.4, 7], [9, 13]])] },
  L: { s: [P([[1, 1], [1, 13], [9, 13]])] },
  M: { w: 11, s: [P([[1, 13], [1, 1], [5.5, 6.4], [10, 1], [10, 13]])] },
  N: { s: [P([[1, 13], [1, 1], [9, 13], [9, 1]])] },
  O: { s: [ZERO] },
  P: { s: [P([[1, 13], [1, 1], [8, 1], [9, 2], [9, 6.4], [8, 7.4], [1, 7.4]])] },
  Q: { s: [ZERO, P([[5.6, 9.6], [9.6, 13.6]])] },
  R: { s: [P([[1, 13], [1, 1], [8, 1], [9, 2], [9, 6], [8, 7], [1, 7]]), P([[5, 7], [9, 13]])] },
  S: { s: [P([[9, 2.4], [8, 1], [2, 1], [1, 2], [1, 6], [2, 7], [8, 7], [9, 8], [9, 12], [8, 13], [2, 13], [1, 11.6]])] },
  T: { s: [P([[0.6, 1], [9.4, 1]]), P([[5, 1], [5, 13]])] },
  U: { s: [P([[1, 1], [1, 12], [2, 13], [8, 13], [9, 12], [9, 1]])] },
  V: { s: [P([[1, 1], [5, 13], [9, 1]])] },
  W: { w: 11, s: [P([[1, 1], [3, 13], [5.5, 6], [8, 13], [10, 1]])] },
  Y: { s: [P([[1, 1], [5, 7], [9, 1]]), P([[5, 7], [5, 13]])] },
  '?': { s: [P([[1, 3.4], [2, 1], [8, 1], [9, 2], [9, 5.4], [5, 8], [5, 9]]), P([[5, 12.4], [5, 12.9]])] },
  '!': { w: 6, s: [P([[3, 1], [3, 8.6]]), P([[3, 12.4], [3, 12.9]])] },
  x: { w: 8, s: [P([[1.4, 6.4], [6.6, 13]]), P([[6.6, 6.4], [1.4, 13]])] },
  '+': { w: 9, s: [P([[1, 8], [8, 8]]), P([[4.5, 4.5], [4.5, 11.5]])] },
  ' ': { w: 4, s: [] },
};
const SW = 3.3;    // 中身の太さ（升目単位）
const OW = 1.45;   // 縁取りの太さ（片側）
const PAD = SW / 2 + OW + 0.9;
const UNITS_H = 14 + PAD * 2; // 字の画像の高さ（升目単位）

/** スタイル: top→mid→bot の上下グラデーション＋濃い縁（line）。glow があれば外側にぼかし色 */
export const MAPLE_STYLES = {
  normal: { top: '#fff7b8', mid: '#ffc93c', bot: '#ff7414', line: '#3a1206' },
  combo1: { top: '#fff2a0', mid: '#ffa53c', bot: '#ff4a28', line: '#3a0a10' },
  combo3: { top: '#fff4e0', mid: '#ff7aa8', bot: '#ff2a6d', line: '#3a0620', glow: 'rgba(255,60,140,0.55)' },
  crit: { top: '#ffe0ec', mid: '#ff5f93', bot: '#e0124f', line: '#38041a' },
  critHi: { top: '#ffe6ff', mid: '#ff6fe0', bot: '#9a2bff', line: '#2a0640', glow: 'rgba(255,120,240,0.5)' },
  toPlayer: { top: '#f4e2ff', mid: '#c084ff', bot: '#7b2fe8', line: '#1e0838' },
  heal: { top: '#e8ffd8', mid: '#8dff8a', bot: '#1fbf5a', line: '#06301a' },
  mp: { top: '#e2f4ff', mid: '#7cc8ff', bot: '#2a6bff', line: '#081a40' },
  miss: { top: '#ffffff', mid: '#d2ecff', bot: '#7fa8ff', line: '#14204a' },
  gold: { top: '#fffbe0', mid: '#ffd23f', bot: '#ff8a1a', line: '#3a1a00', glow: 'rgba(255,200,60,0.45)' },
  white: { top: '#ffffff', mid: '#ffffff', bot: '#dfe6ff', line: '#1a0b30' },
};

const cache = new Map();
const RES = 2; // キャッシュ画像の解像度（画面の2倍で描いて縮小＝なめらか）
const MAX_CACHE = 600;

function glyphOf(ch) { return GLYPHS[ch] || GLYPHS[String(ch).toUpperCase()] || null; }

/** 1文字の画像 {img, w, h, adv}（size = 字の画像の高さ px） */
function glyphImage(ch, styleKey, size) {
  size = Math.max(6, Math.round(size));
  const key = styleKey + '|' + ch + '|' + size;
  let c = cache.get(key);
  if (c) return c;
  const gl = glyphOf(ch);
  if (!gl || !CAN) return null;
  const st = MAPLE_STYLES[styleKey] || MAPLE_STYLES.normal;
  const u = size / UNITS_H;
  const gw = gl.w || 10;
  const wU = gw + PAD * 2;
  const W = Math.ceil(wU * u * RES), H = Math.ceil(UNITS_H * u * RES);
  const cv = makeCanvas(W, H);
  const x = cv.getContext('2d');
  x.scale(u * RES, u * RES);
  x.translate(PAD, PAD);
  x.lineJoin = 'miter'; x.miterLimit = 2.2; x.lineCap = 'square';
  const path = () => {
    x.beginPath();
    for (const s of gl.s) {
      s.pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      if (s.z) x.closePath();
    }
  };
  if (gl.s.length) {
    path();
    if (st.glow) { x.strokeStyle = st.glow; x.lineWidth = SW + OW * 2 + 1.6; x.stroke(); }
    x.strokeStyle = st.line; x.lineWidth = SW + OW * 2; x.stroke();
    const g = x.createLinearGradient(0, -0.6, 0, 14.6);
    g.addColorStop(0, st.top); g.addColorStop(0.42, st.mid); g.addColorStop(1, st.bot);
    x.strokeStyle = g; x.lineWidth = SW; x.stroke();
    // 上半分のつや（白い細線を少し上へずらして重ねる）
    const hg = x.createLinearGradient(0, 0, 0, 8);
    hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.translate(-0.25, -0.75); x.strokeStyle = hg; x.lineWidth = SW * 0.38; x.lineCap = 'butt'; x.stroke(); x.restore();
  }
  c = { img: cv, w: W / RES, h: H / RES, adv: (gw + SW) * u, pad: PAD * u };
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, c);
  return c;
}

/**
 * mapleTextLayout(text, size, opts) → {w, items:[{ch, x, size, dy}]}
 *  opts.first = 1文字目の大きさの倍率（メイプルのダメージは1桁目だけ大きい）, opts.rest = 2文字目以降の倍率,
 *  opts.kern = 送り幅の倍率（<1 で隣の字に重なる）, opts.jitter = 偶数/奇数で上下にずらす px
 */
export function mapleTextLayout(text, size, opts = {}) {
  const first = opts.first ?? 1, rest = opts.rest ?? 1, kern = opts.kern ?? 0.92, jit = opts.jitter || 0;
  const items = [];
  let x = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const gl = glyphOf(s[i]);
    if (!gl) continue;
    const sz = size * (i === 0 ? first : rest);
    const u = sz / UNITS_H;
    const adv = ((gl.w || 10) + SW) * u * kern;
    items.push({ ch: s[i], x: x + adv / 2, size: sz, dy: jit ? (i % 2 ? -jit : jit * 0.4) : 0 });
    x += adv;
  }
  return { w: x, items };
}

/** drawMapleText(ctx, text, x, y, styleKey, size, opts) — (x, y) = 中心。opts.align: 'center'|'left' */
export function drawMapleText(ctx, text, x, y, styleKey, size, opts = {}) {
  const L = opts.layout || mapleTextLayout(text, size, opts);
  const x0 = opts.align === 'left' ? x : x - L.w / 2;
  for (const it of L.items) {
    const g = glyphImage(it.ch, styleKey, it.size);
    if (!g) continue;
    ctx.drawImage(g.img, x0 + it.x - g.w / 2, y + it.dy - g.h / 2, g.w, g.h);
  }
  return L;
}

/** 文字列全体を1枚にまとめたキャッシュ画像（LEVEL UP!! など繰り返し描く大きな文字） */
const wordCache = new Map();
export function mapleWordImage(text, styleKey, size, opts = {}) {
  const key = styleKey + '|' + size + '|' + (opts.kern ?? '') + '|' + text;
  let c = wordCache.get(key);
  if (c) return c;
  if (!CAN) return null;
  const L = mapleTextLayout(text, size, opts);
  const pad = size * 0.4;
  const W = Math.ceil(L.w + pad * 2), H = Math.ceil(size * 1.4);
  const cv = makeCanvas(W * RES, H * RES);
  const x = cv.getContext('2d');
  x.scale(RES, RES);
  drawMapleText(x, text, W / 2, H / 2, styleKey, size, { ...opts, layout: L });
  c = { img: cv, w: W, h: H };
  if (wordCache.size > 80) wordCache.clear();
  wordCache.set(key, c);
  return c;
}

/** 文字列を1枚の画像に描く（キャッシュしない。ダメージの数字は数字ごとに1回だけ作って使い回す）。 res = 解像度 */
export function renderMapleText(text, styleKey, size, opts = {}, res = 1.5) {
  if (!CAN) return null;
  const L = mapleTextLayout(text, size, opts);
  if (!L.items.length) return null;
  const pad = size * 0.35;
  const W = Math.ceil(L.w + pad * 2), H = Math.ceil(size * 1.25);
  const cv = makeCanvas(Math.ceil(W * res), Math.ceil(H * res));
  const x = cv.getContext('2d');
  x.scale(res, res);
  drawMapleText(x, text, W / 2, H / 2, styleKey, size, { ...opts, layout: L });
  return { img: cv, w: W, h: H, tw: L.w };
}

/** クリティカルの★（数字の左上）。キャッシュ画像 */
let starImg = null;
export function critStarImage() {
  if (starImg || !CAN) return starImg;
  const S = 40;
  const cv = makeCanvas(S * RES, S * RES);
  const x = cv.getContext('2d');
  x.scale(RES, RES); x.translate(S / 2, S / 2);
  const star = (r1, r2) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? r2 : r1; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); };
  // 外側の光
  const rg = x.createRadialGradient(0, 0, 2, 0, 0, 19);
  rg.addColorStop(0, 'rgba(255,240,180,0.9)'); rg.addColorStop(1, 'rgba(255,90,140,0)');
  x.fillStyle = rg; x.beginPath(); x.arc(0, 0, 19, 0, Math.PI * 2); x.fill();
  star(15, 6.2);
  x.lineJoin = 'miter'; x.miterLimit = 3;
  x.lineWidth = 3.4; x.strokeStyle = '#38041a'; x.stroke();
  const g = x.createLinearGradient(0, -15, 0, 12);
  g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff5f2a');
  x.fillStyle = g; x.fill();
  star(6, 2.6); x.fillStyle = 'rgba(255,255,255,0.85)'; x.fill();
  starImg = { img: cv, w: S, h: S };
  return starImg;
}

/** この文字列をすべて角ばった字で描けるか */
export function mapleHasGlyphs(text) {
  for (const ch of String(text)) if (!glyphOf(ch)) return false;
  return true;
}

/** テスト・デバッグ用: キャッシュの数 */
export function mapleFontStats() { return { glyphs: cache.size, words: wordCache.size }; }
