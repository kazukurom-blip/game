// 画像の URL（軽い WebP があればそちらを読む）
//  tools/make_webp.py が PNG の横に WebP を作り、対応表 assets/sprites/webp.json { "<PNG の相対パス>": md5 } を書く。
//  表にある PNG は .webp を読む。表が無い・ブラウザが WebP を読めない時は今まで通り PNG。
let MAP = null;
let OK = null;
function webpOk() {
  if (OK != null) return OK;
  try {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    OK = !!c && c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { OK = false; }
  // Safari は WebP を表示できるが書き出せないので、上の判定が false になる → PNG のまま（表示は正しい）
  return OK;
}
export function setWebpMap(m) { MAP = m && typeof m === 'object' && !Array.isArray(m) ? m : null; }
export function webpMap() { return MAP; }
/** assetUrl(base, file) → 読む URL */
export function assetUrl(base, file) {
  if (MAP && MAP[file] && /\.png$/.test(file) && webpOk()) return base + file.slice(0, -4) + '.webp';
  return base + file;
}
