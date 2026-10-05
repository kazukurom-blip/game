// 絵の色替え（色相回転＋彩度・明度補正。陰影・線・他の色は残す）。リグの装備・体（rig.js）と、顔・髪の分割方式（sprites.js）で共通。
//  基準色 B（絵を描いた色）に近い画素だけを、目標色 T に寄せる。線の色 #2A1430 付近・白いハイライト・別の色は変えない。
//  無彩色（白・黒・灰）の目標色は明るさで合わせる（色相は使わない）。
export function hexRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
  let h = 0, s = 0;
  if (c > 1e-6) {
    s = c / (1 - Math.abs(2 * l - 1) + 1e-9);
    if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, Math.min(1, s), l, c];
}
export function hslRgb(h, s, l, out, o) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = ((h % 360) + 360) % 360 / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  out[o] = (r + m) * 255; out[o + 1] = (g + m) * 255; out[o + 2] = (b + m) * 255;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const HEX6 = /^#[0-9a-f]{6}$/i;
export function colorInfo(hex) { const [r, g, b] = hexRgb(hex); const [h, s, l, c] = rgbHsl(r, g, b); return { h, s, l, c, chroma: c > 0.09, hex, rgb: [r, g, b] }; }
const OUT = hexRgb('#2a1430');
/** その画素が基準色 B の「布」っぽさ（0..1）。線（濃い紫・黒）・白いハイライト・他の色は 0 に近い */
export function weightOf(r, g, b, h, s, l, c, B) {
  if (l < 0.05) return 0;
  const dO = Math.abs(r - OUT[0]) + Math.abs(g - OUT[1]) + Math.abs(b - OUT[2]);
  if (dO < 30 && dO < 0.75 * (Math.abs(r - B.rgb[0]) + Math.abs(g - B.rgb[1]) + Math.abs(b - B.rgb[2]))) return 0;   // 輪郭線（基準色より線の色に近い）
  if (B.chroma) {
    let dh = Math.abs(h - B.h); if (dh > 180) dh = 360 - dh;
    return (1 - sstep(24, 44, dh)) * sstep(0.04, 0.1, c) * (1 - sstep(0.42, 0.6, Math.abs(l - B.l)));
  }
  return (1 - sstep(0.08, 0.16, c)) * (1 - sstep(0.4, 0.55, Math.abs(l - B.l)));
}
/** 明るさ: 基準の明るさ lb → 目標 lt。陰影の差はそのまま（はみ出す側だけ縮める） */
export function mapL(l, lb, lt) {
  const d = l - lb;
  const k = d < 0 ? Math.min(1, lt / Math.max(0.02, lb)) : Math.min(1, (1 - lt) / Math.max(0.02, 1 - lb));
  return lt + d * k;
}
/**
 * 画素配列（RGBA）の中で、基準色 B に近い画素の実際の平均色（陰影で暗めに出るので基準の明るさと中間）。
 * AI が基準色から少しずれた色で描いても合うように。近い画素が少なければ B のまま
 */
export function effectiveColor(B, datas, step = 8) {
  let n = 0, sx = 0, sy = 0, ss = 0, sl = 0;
  for (const d of datas) {
    for (let i = 0; i < d.length; i += step) {
      if (d[i + 3] < 200) continue;
      const [h, s, l, c] = rgbHsl(d[i], d[i + 1], d[i + 2]);
      const w = weightOf(d[i], d[i + 1], d[i + 2], h, s, l, c, B);
      if (w < 0.6) continue;
      n++; sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180); ss += s; sl += l;
    }
  }
  if (n < 40) return B;
  const h = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
  return { h: B.chroma ? h : B.h, s: B.chroma ? ss / n : B.s, l: (sl / n + B.l) / 2, c: B.c, chroma: B.chroma, hex: B.hex, rgb: B.rgb };
}
/**
 * 画素配列 d（RGBA）を塗り替える。maps = [[B 基準色の colorInfo, T 目標色の colorInfo], ...]（画素ごとに一番近い基準色を使う）
 * opts.tint: 無彩色に近い目標色でも、その色のわずかな色味（白っぽい青など）を残す（既定 false = 灰色にする。リグの布と同じ）
 */
export function recolorData(d, maps, opts) {
  const tint = !!(opts && opts.tint);
  const tmp = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const [h, s, l, c] = rgbHsl(r, gg, b);
    let best = 0, bi = -1;
    for (let m = 0; m < maps.length; m++) { const w = weightOf(r, gg, b, h, s, l, c, maps[m][0]); if (w > best) { best = w; bi = m; } }
    if (bi < 0 || best < 0.02) continue;
    const [B, T] = maps[bi];
    let h2, s2;
    if (!T.chroma && tint) { h2 = T.h; s2 = T.s; }
    else { h2 = B.chroma ? h + (T.h - B.h) : T.h; s2 = B.chroma ? Math.min(1, s * (T.s / Math.max(0.05, B.s))) : T.s * (T.chroma ? 1 : 0); }
    const l2 = Math.min(1, Math.max(0, mapL(l, B.l, T.l)));
    hslRgb(h2, s2, l2, tmp, 0);
    d[i] = r + (tmp[0] - r) * best; d[i + 1] = gg + (tmp[1] - gg) * best; d[i + 2] = b + (tmp[2] - b) * best;
  }
}
/** 2色がほぼ同じか（#rrggbb） */
export function sameColor(a, b) {
  if (!a || !b) return true;
  const x = hexRgb(a), y = hexRgb(b);
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 10;
}
