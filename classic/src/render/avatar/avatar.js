// 主人公の絵を 14 の層に重ねて作る（DESIGN.md 5-2）。
// 1 コマの枠は 64×80、足元の中央 (32, 76) が基準点。右向きだけ作り、左は描く時に反転。
import { PixelBuf } from '../pixel.js';
import { getFrame, ANIMS } from './skeleton.js';
import { CODE_PARTS, COLORS } from './parts.js';

export const FRAME_W = 64, FRAME_H = 80, ORIGIN_X = 32, ORIGIN_Y = 76;

// 下から順に重ねる（横向き）
export const LAYERS = [
  'capeBack', 'hairBack', 'body', 'pants', 'shoes', 'top', 'arm',
  'glove', 'face', 'hairFront', 'hat', 'shield', 'weapon', 'capeFront',
];
// 背中向き（縄・はしご）: 腕は服の上・髪の下（頭の上に手が出る）、髪が頭をおおう、マントは一番上
export const LAYERS_BACK = [
  'capeFront', 'shield', 'body', 'pants', 'shoes', 'top', 'arm', 'glove',
  'face', 'hairFront', 'hairBack', 'hat', 'weapon', 'capeBack',
];

const parts = { ...CODE_PARTS };
// 本物の部品（PNG）や新しい部品を足す・差し替える
export function registerPart(id, part) { parts[id] = part; frameCache.clear(); }
export function getPart(id) { return parts[id]; }

export const DEFAULT_LOOK = {
  skin: 'light', hairColor: 'brown', topColor: 'blue', pantsColor: 'navy', shoesColor: 'brown',
  parts: ['body', 'face_basic', 'hair_spiky', 'top_tee', 'pants_long', 'shoes_basic'],
};

function resolveLook(look) {
  return {
    ...look,
    skinC: COLORS.skin[look.skin] || COLORS.skin.light,
    hairC: COLORS.hair[look.hairColor] || COLORS.hair.brown,
    topC: COLORS.top[look.topColor] || COLORS.top.blue,
    pantsC: COLORS.pants[look.pantsColor] || COLORS.pants.navy,
    shoesC: COLORS.shoes[look.shoesColor] || COLORS.shoes.brown,
  };
}

const lookKey = (look) => JSON.stringify(look);
const frameCache = new Map();

// コマ 1 枚を描いた PixelBuf（node でも動く）
export function composeBuf(look, anim, index) {
  const f = getFrame(anim, index);
  const L = resolveLook(look);
  const order = f.view === 'back' ? LAYERS_BACK : LAYERS;
  const draws = [];
  for (const id of look.parts) {
    const part = parts[id];
    if (!part) continue;
    for (const d of part.draws) draws.push(d);
  }
  draws.sort((a, b) => (order.indexOf(a.layer) - order.indexOf(b.layer)) || (a.z - b.z));
  const buf = new PixelBuf(FRAME_W, FRAME_H).setOrigin(ORIGIN_X, ORIGIN_Y);
  for (const d of draws) d.fn(buf, f, L);
  return buf;
}

// コマ 1 枚（canvas）。見た目×コマごとに覚えておく
export function composeFrame(look, anim, index) {
  const key = `${lookKey(look)}|${anim}|${index}`;
  let c = frameCache.get(key);
  if (!c) { c = composeBuf(look, anim, index).toCanvas(); frameCache.set(key, c); }
  return c;
}

export function animLength(anim) { return ANIMS[anim].frames.length; }

// 画面に描く: (x, y) は足元。facing -1 で左右反転
export function drawAvatar(ctx, look, anim, index, x, y, facing = 1) {
  const img = composeFrame(look, anim, index);
  const dx = Math.round(x), dy = Math.round(y);
  if (facing >= 0) {
    ctx.drawImage(img, dx - ORIGIN_X, dy - ORIGIN_Y);
  } else {
    ctx.save();
    ctx.translate(dx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -(FRAME_W - ORIGIN_X), dy - ORIGIN_Y);
    ctx.restore();
  }
}
