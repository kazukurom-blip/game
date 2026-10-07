// 主人公の仮のドット絵の検査（node。canvas を使わない）
// 実行: node classic/tests/avatar_unit.mjs
import { composeBuf, DEFAULT_LOOK, LAYERS, LAYERS_BACK, FRAME_W, FRAME_H, ORIGIN_X, ORIGIN_Y } from '../src/render/avatar/avatar.js';
import { ANIMS, frameIndexAt } from '../src/render/avatar/skeleton.js';

let pass = 0, fail = 0;
const check = (name, cond, info = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}${info ? `  (${info})` : ''}`); }
  else { fail++; console.log(`  NG  ${name}${info ? `  (${info})` : ''}`); }
};

check('層は 14', LAYERS.length === 14 && LAYERS_BACK.length === 14 && new Set(LAYERS_BACK).size === 14 && LAYERS.every((l) => LAYERS_BACK.includes(l)));
check('コマの枠 64×80・基準点は足元の中央', FRAME_W === 64 && FRAME_H === 80 && ORIGIN_X === 32 && ORIGIN_Y === 76);
const need = { stand1: 3, walk1: 4, jump: 1, rope: 2, ladder: 2, prone: 1 };
for (const [a, n] of Object.entries(need)) check(`動き ${a} は ${n} コマ`, ANIMS[a] && ANIMS[a].frames.length === n);

function bounds(buf) {
  let minX = 99, maxX = -1, minY = 99, maxY = -1, colors = new Set(), semi = 0;
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    const v = buf.data[y * buf.w + x];
    if (!v) continue;
    const a = v >>> 24;
    if (a !== 255) semi++;
    colors.add(v);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, colors: colors.size, semi };
}

const st = bounds(composeBuf(DEFAULT_LOOK, 'stand1', 0));
const height = ORIGIN_Y - st.minY;
check('立ちの高さ 約 52 px（49〜53）', height >= 49 && height <= 53, `${height} px`);
check('足の裏が基準点の上（足元の線に立つ）', st.maxY === ORIGIN_Y - 1, `最下段 ${st.maxY}`);
for (const [a, n] of Object.entries(need)) {
  for (let i = 0; i < n; i++) {
    const b = bounds(composeBuf(DEFAULT_LOOK, a, i));
    check(`${a}/${i}: 枠の中・半透明なし`, b.minX > 0 && b.maxX < FRAME_W - 1 && b.minY > 0 && b.maxY < FRAME_H - 1 && b.semi === 0, `色 ${b.colors}`);
  }
}
check('立ちは 0,1,2,1,0 の往復', [0, 0.5, 1.0, 1.5, 2.0].map((t) => frameIndexAt('stand1', t + 0.01)).join() === '0,1,2,1,0');
check('歩きは 0.18 秒ごと', frameIndexAt('walk1', 0.17) === 0 && frameIndexAt('walk1', 0.19) === 1 && frameIndexAt('walk1', 0.73) === 0);

console.log(`\n${pass} ok / ${fail} NG`);
process.exit(fail ? 1 : 0);
