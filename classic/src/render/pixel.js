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
