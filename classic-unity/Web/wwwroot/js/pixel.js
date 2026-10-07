// 試遊版（classic-unity/Web）へのコピー。元は classic/src/render/（ブラウザの試作の仮のアバター）。skeleton.js だけ攻撃・構え・座るの動きを足した。
// ドット絵を 1 ドットずつ描く小さな道具（整数の座標・不透明か透明だけ）
// コードで描く仮の絵に使う。本物の絵（PNG）に差し替えた後も、検査や型紙の表示に使える。

const cache = new Map();
export function rgba(hex) {
  let v = cache.get(hex);
  if (v !== undefined) return v;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  cache.set(hex, v);
  return v;
}

export class PixelBuf {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint32Array(w * h);
    this.ox = 0; this.oy = 0; // 原点（足元の中央など）
    this.flip = 1;            // -1 で左右反転して描く（部品の中の左右）
  }
  setOrigin(x, y) { this.ox = x; this.oy = y; return this; }
  // 原点からの座標で 1 ドット
  px(x, y, color) {
    if (!color) return;
    const X = this.ox + Math.round(x) * this.flip, Y = this.oy + Math.round(y);
    if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) return;
    this.data[Y * this.w + X] = typeof color === 'number' ? color : rgba(color);
  }
  get(x, y) {
    const X = this.ox + Math.round(x) * this.flip, Y = this.oy + Math.round(y);
    if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) return 0;
    return this.data[Y * this.w + X];
  }
  rect(x, y, w, h, color) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, color); }
  // 文字の絵（行の配列）を (x, y) を左上にして置く。'.' と ' ' は透明
  sprite(rows, x, y, pal, mirror = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = row[mirror ? row.length - 1 - i : i];
        if (c === '.' || c === ' ') continue;
        const col = pal[c];
        if (col === undefined) throw new Error(`パレットに無い文字: ${c}`);
        this.px(x + i, y + j, col);
      }
    }
  }
  toImageData() {
    return new ImageData(new Uint8ClampedArray(this.data.buffer.slice(0)), this.w, this.h);
  }
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(this.toImageData(), 0, 0);
    return c;
  }
}

// 太さのある線（腕・脚）。a→b の線分から半径 r 以内を塗り、外側 1 ドットを線の色に。
// 光は左上から: 線分に垂直な向きで左上側を明るく、右下側を暗く。
export function limb(buf, a, b, r, pal, opt = {}) {
  const { outline = true, lightSide = true } = opt;
  const minX = Math.floor(Math.min(a.x, b.x) - r - 2), maxX = Math.ceil(Math.max(a.x, b.x) + r + 2);
  const minY = Math.floor(Math.min(a.y, b.y) - r - 2), maxY = Math.ceil(Math.max(a.y, b.y) + r + 2);
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const fill = [], edge = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const cx = x, cy = y; // ドットの中心
    let t = ((cx - a.x) * dx + (cy - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + dx * t, qy = a.y + dy * t;
    const ox = cx - qx, oy = cy - qy;
    const d = Math.hypot(ox, oy);
    if (d <= r) fill.push([x, y, ox, oy]);
    else if (outline && d <= r + 1) edge.push([x, y]);
  }
  for (const [x, y] of edge) buf.px(x, y, pal.line);
  for (const [x, y, ox, oy] of fill) {
    let c = pal.mid;
    if (lightSide && r >= 1.5) {
      const s = (-ox - oy) / (r * 1.414); // 左上 = 正
      if (s > 0.45 && pal.light) c = pal.light;
      else if (s < -0.35 && pal.dark) c = pal.dark;
    }
    buf.px(x, y, c);
  }
}

// 楕円（頭・手など）
export function blob(buf, cx, cy, rx, ry, pal) {
  const fill = [], edge = [];
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const dOut = Math.hypot((x - cx) / (rx + 1), (y - cy) / (ry + 1));
      if (d <= 1) fill.push([x, y]);
      else if (dOut <= 1) edge.push([x, y]);
    }
  for (const [x, y] of edge) buf.px(x, y, pal.line);
  for (const [x, y] of fill) {
    const s = (-(x - cx) / rx - (y - cy) / ry);
    buf.px(x, y, s > 0.9 && pal.light ? pal.light : s < -0.8 && pal.dark ? pal.dark : pal.mid);
  }
}

// ---------------------------------------------------------------- 形（マスク）を塗る道具（クラシック風の 3 段の塗り＋1px の線）
// 形を「ある/ない」の集まりで作り（楕円・多角形・太い線の足し引き）、paintMask で塗る:
//   外側 1 ドット = 線（その部分の一番暗い色）、左上の縁 = 明るい色、右下の縁 = 暗い色、ほか = ふつうの色。
// 部品を順に塗ると、後の部品の線が前の部品の上に乗るので、部品の間にも 1px の線が入る。
export class Mask {
  constructor() { this.s = new Set(); }
  static k(x, y) { return ((x + 4096) << 13) | (y + 4096); }
  has(x, y) { return this.s.has(Mask.k(x, y)); }
  put(x, y, on = true) { const k = Mask.k(Math.round(x), Math.round(y)); if (on) this.s.add(k); else this.s.delete(k); return this; }
  *each() { for (const k of this.s) yield [(k >> 13) - 4096, (k & 8191) - 4096]; }
  get size() { return this.s.size; }
  ellipse(cx, cy, rx, ry, on = true) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
        if (((x - cx) / (rx + 0.01)) ** 2 + ((y - cy) / (ry + 0.01)) ** 2 <= 1) this.put(x, y, on);
    return this;
  }
  rect(x, y, w, h, on = true) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, on); return this; }
  // 太い線（カプセル）
  line(a, b, r, on = true) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(a.y, b.y) - r - 1); y <= Math.ceil(Math.max(a.y, b.y) + r + 1); y++)
      for (let x = Math.floor(Math.min(a.x, b.x) - r - 1); x <= Math.ceil(Math.max(a.x, b.x) + r + 1); x++) {
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
        if (Math.hypot(x - a.x - dx * t, y - a.y - dy * t) <= r) this.put(x, y, on);
      }
    return this;
  }
  // 多角形（点の配列 [[x,y],…]）。ドットの中心で判定
  poly(pts, on = true) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.put(x, y, on);
    }
    return this;
  }
  add(m) { for (const k of m.s) this.s.add(k); return this; }
  sub(m) { for (const k of m.s) this.s.delete(k); return this; }
  and(m) { for (const k of [...this.s]) if (!m.s.has(k)) this.s.delete(k); return this; }
  clone() { const m = new Mask(); for (const k of this.s) m.s.add(k); return m; }
  shift(dx, dy) { const m = new Mask(); for (const [x, y] of this.each()) m.put(x + dx, y + dy); return m; }
}

// 左上（sx,sy = -1,-1）か右下（1,1）へ何ドットで形の外に出るか（横・縦・斜めの小さい方）
function rimDist(m, x, y, sx, sy, max) {
  for (let k = 1; k <= max; k++) if (!m.has(x + sx * k, y) || !m.has(x, y + sy * k) || !m.has(x + sx * k, y + sy * k)) return k;
  return max + 1;
}
/** マスクを塗る。pal = { line, light, mid, dark }。opt: rimL（明るい縁の幅）・rimD（暗い縁の幅）・outline（false で線なし） */
export function paintMask(buf, m, pal, opt = {}) {
  const { rimL = 1, rimD = 2, outline = true } = opt;
  if (outline) {
    for (const [x, y] of m.each()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!m.has(x + dx, y + dy)) buf.px(x + dx, y + dy, pal.line);
    }
  }
  for (const [x, y] of m.each()) {
    let c = pal.mid;
    if (pal.dark && rimD > 0 && rimDist(m, x, y, 1, 1, rimD) <= rimD) c = pal.dark;
    if (pal.light && rimL > 0 && rimDist(m, x, y, -1, -1, rimL) <= rimL) c = pal.light;
    buf.px(x, y, c);
  }
}
/** 1 ドットの線（ぼけない。ブレゼンハム） */
export function pxLine(buf, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) { buf.px(x0, y0, color); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
