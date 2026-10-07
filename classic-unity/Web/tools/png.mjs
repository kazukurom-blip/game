// 小さな PNG の書き出し（RGBA 8bit・道具なし）。make_art.mjs が使う。
import zlib from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** rgba: Uint8Array（w*h*4） → PNG の Buffer */
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
/** PixelBuf（Uint32 の ABGR）→ RGBA の Uint8Array */
export function bufToRgba(buf) { return new Uint8Array(buf.data.buffer.slice(0)); }
/** 整数倍に拡大（見本の確認用） */
export function scaleRgba(w, h, rgba, k, bg = null) {
  const out = new Uint8Array(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
    const s = ((Math.floor(y / k) * w) + Math.floor(x / k)) * 4, d = (y * w * k + x) * 4;
    if (bg && rgba[s + 3] === 0) { out[d] = bg[0]; out[d + 1] = bg[1]; out[d + 2] = bg[2]; out[d + 3] = 255; }
    else { out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3]; }
  }
  return out;
}
