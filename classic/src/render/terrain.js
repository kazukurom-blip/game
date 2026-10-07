// 地形（足場・地面・縄・はしご）を 1 回だけ描いて覚える（仮のドット絵。16 px のタイル風）
import { segY } from '../world/mapFormat.js';
import { rgba } from './pixel.js';

const C = {
  grassLine: '#2c6420', grassHi: '#9ce064', grass: '#6cc84a', grassDk: '#48a43a',
  dirt: '#c08a52', dirtDk: '#9c6a3c', dirtHi: '#dcac72', pebble: '#a07448', pebbleHi: '#e2bc88', pebbleDk: '#7a5230',
  edge: '#5c3a1c', under: '#8a5c34',
  ropeLine: '#5a3818', rope: '#d4a464', ropeDk: '#a8783e',
  wood: '#a0683a', woodHi: '#d09a5c', woodDk: '#6c4220', woodLine: '#40240e',
};
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
};

export const PLATFORM_THICK = 16;

export function renderTerrain(map) {
  const W = map.width, H = map.height;
  const img = new ImageData(W, H);
  const d32 = new Uint32Array(img.data.buffer);
  const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < W && y < H) d32[y * W + x] = rgba(col); };

  // 土の模様（世界の座標で 16 px ごとに小石 1 つ）
  const dirtAt = (x, y) => {
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16), lx = x - cx * 16, ly = y - cy * 16;
    const px = 3 + Math.floor(hash(cx, cy) * 8), py = 3 + Math.floor(hash(cy, cx + 99) * 8);
    if (hash(cx + 7, cy + 3) < 0.55 && lx >= px && lx < px + 5 && ly >= py && ly < py + 3) {
      if (ly === py && lx > px && lx < px + 4) return C.pebbleHi;
      if (ly === py + 2 || lx === px || lx === px + 4) return (ly === py && (lx === px || lx === px + 4)) ? null : C.pebbleDk;
      return C.pebble;
    }
    const r = hash(x, y);
    if (r < 0.05) return C.dirtDk;
    if (r < 0.08) return C.dirtHi;
    return C.dirt;
  };

  for (const ch of map.chains) {
    const x0 = Math.ceil(ch.segs[0].x1), x1 = Math.floor(ch.segs[ch.segs.length - 1].x2);
    let si = 0;
    for (let x = x0; x <= x1; x++) {
      while (si < ch.segs.length - 1 && x > ch.segs[si].x2) si++;
      const top = Math.round(segY(ch.segs[si], x));
      const bottom = ch.ground ? H : top + PLATFORM_THICK;
      const blade = Math.floor(hash(x, 5) * 4); // 草の先のぎざぎざ
      const endCol = !ch.ground && (x === x0 || x === x1);
      const nearEnd = !ch.ground && (x === x0 + 1 || x === x1 - 1);
      for (let y = top; y < bottom; y++) {
        const d = y - top;
        let col;
        if (d === 0) col = C.grassLine;
        else if (d <= 2) col = C.grassHi;
        else if (d <= 4) col = C.grass;
        else if (d <= 4 + blade) col = C.grassDk;
        else if (d === 5 + blade) col = C.grassLine;
        else col = dirtAt(x, y) || C.dirt;
        if (!ch.ground) {
          if (d === PLATFORM_THICK - 1) col = C.edge;
          else if (d === PLATFORM_THICK - 2 && col !== C.grassLine) col = C.under;
          if (endCol) col = (d === 0 || d === PLATFORM_THICK - 1) ? null : (d <= 4 ? C.grassLine : C.edge);
          else if (nearEnd && (d === PLATFORM_THICK - 1)) col = null;
        }
        if (col) put(x, y, col);
      }
      // 地面の草の上に、ときどき背の高い草
      if (hash(x, 77) < 0.12) { put(x, top - 1, C.grassLine); if (hash(x, 78) < 0.5) put(x, top - 2, C.grassLine); }
    }
  }

  // 縄（幅 8、中の 4 ドット）
  for (const r of map.ropes.filter((q) => !q.ladder)) {
    const x0 = Math.round(r.x) - 4;
    for (let y = r.top + 4; y <= r.bottom; y++) {
      const k = ((y % 4) + 4) % 4;
      put(x0 + 2, y, C.ropeLine); put(x0 + 5, y, C.ropeLine);
      put(x0 + 3, y, k === 0 ? C.ropeDk : C.rope);
      put(x0 + 4, y, k === 2 ? C.ropeDk : (k === 1 ? C.rope : C.ropeDk));
    }
    // 上の結び目
    for (let y = r.top + 2; y < r.top + 7; y++) for (let x = x0; x < x0 + 8; x++) {
      const edge = y === r.top + 2 || y === r.top + 6 || x === x0 || x === x0 + 7;
      put(x, y, edge ? C.ropeLine : (y === r.top + 3 ? C.rope : C.ropeDk));
    }
    // 下のほつれ
    put(x0 + 2, r.bottom + 1, C.ropeLine); put(x0 + 5, r.bottom + 1, C.ropeLine); put(x0 + 3, r.bottom + 2, C.ropeDk);
  }
  // はしご（幅 16。柱 2 本・段は 8 px ごと）
  for (const r of map.ropes.filter((q) => q.ladder)) {
    const x0 = Math.round(r.x) - 8;
    for (let y = r.top - 6; y <= r.bottom + 2; y++) {
      for (const bx of [0, 12]) {
        put(x0 + bx, y, C.woodLine); put(x0 + bx + 1, y, C.woodHi); put(x0 + bx + 2, y, C.wood); put(x0 + bx + 3, y, C.woodLine);
      }
      const k = ((y - r.top) % 8 + 8) % 8;
      if (k === 2 || k === 4) for (let x = 4; x < 12; x++) put(x0 + x, y, C.woodLine);
      if (k === 3) for (let x = 4; x < 12; x++) put(x0 + x, y, x < 6 ? C.woodHi : C.wood);
    }
  }

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
