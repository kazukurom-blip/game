// PNG の読み書き（依存なし・Node の zlib だけ）。tools/check_art.mjs とそのテスト用
//   readPng(buf)  → { w, h, data: Uint8Array(RGBA8), hasAlpha, colorType, bitDepth }
//   writePng(img) → Buffer（RGBA8。img = { w, h, data }）
// 対応: 色の種類 0/2/3/4/6、ビット深度 1〜16、インターレース（Adam7）、tRNS
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function readPng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('PNG ではありません（先頭の印が違う）');
  let p = 8, w = 0, h = 0, bd = 8, ct = 6, il = 0, plte = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
  }
  if (!w || !h || !(ct in CH)) throw new Error('PNG の IHDR が読めません');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = CH[ct], bpp = Math.max(1, (ch * bd) >> 3);
  const out = new Uint8Array(w * h * 4);
  let off = 0;
  const passes = il ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const max = (1 << bd) - 1;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * ch * bd) / 8);
    let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
    for (let r = 0; r < ph; r++) {
      const f = raw[off++];
      for (let i = 0; i < stride; i++) {
        const x = raw[off + i], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v;
        if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
        else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        cur[i] = v & 255;
      }
      off += stride;
      const y = y0 + r * dy;
      const sample = (idx) => {
        if (bd === 8) return cur[idx];
        if (bd === 16) return cur[idx * 2];
        const bit = idx * bd, byte = cur[bit >> 3], sh = 8 - bd - (bit & 7);
        return (byte >> sh) & max;
      };
      const sample16 = (idx) => (bd === 16 ? (cur[idx * 2] << 8) | cur[idx * 2 + 1] : -1);
      for (let i = 0; i < pw; i++) {
        const o = ((y * w) + x0 + i * dx) * 4;
        const s = i * ch;
        let R, G, B, A = 255;
        if (ct === 3) {
          const k = sample(s);
          R = plte ? plte[k * 3] : 0; G = plte ? plte[k * 3 + 1] : 0; B = plte ? plte[k * 3 + 2] : 0;
          if (trns && k < trns.length) A = trns[k];
        } else {
          const sc = (v) => (bd === 8 || bd === 16 ? v : Math.round((v * 255) / max));
          if (ct === 0 || ct === 4) { R = G = B = sc(sample(s)); if (ct === 4) A = sc(sample(s + 1)); }
          else { R = sc(sample(s)); G = sc(sample(s + 1)); B = sc(sample(s + 2)); if (ct === 6) A = sc(sample(s + 3)); }
          if (trns && (ct === 0 || ct === 2)) {
            const t = (k) => trns.readUInt16BE(k * 2);
            const eq = ct === 0 ? (bd === 16 ? sample16(s) : sample(s)) === t(0)
              : (bd === 16 ? [sample16(s), sample16(s + 1), sample16(s + 2)] : [sample(s), sample(s + 1), sample(s + 2)]).every((v, j) => v === t(j));
            if (eq) A = 0;
          }
        }
        out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
  }
  return { w, h, data: out, hasAlpha: ct === 4 || ct === 6 || !!trns, colorType: ct, bitDepth: bd };
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
export function writePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1), s = y * stride;
    raw[o] = 1;   // Sub
    for (let i = 0; i < stride; i++) raw[o + 1 + i] = (data[s + i] - (i >= 4 ? data[s + i - 4] : 0)) & 255;
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
/** 空の RGBA 画像 */
export function newImage(w, h, rgba = [0, 0, 0, 0]) {
  const data = new Uint8Array(w * h * 4);
  if (rgba.some((v) => v)) for (let i = 0; i < data.length; i += 4) { data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3]; }
  return { w, h, data };
}
