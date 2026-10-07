// 楽しさの要素の仮の部品（parts.js と同じ形。avatar.js の registerPart で足す）: 髪型 6・顔（目）4・感情表現の顔 7・見た目の帽子 12・
// 肌と髪と服の色。美容院（js/fun.js）・見た目の品・感情表現が使う。絵はオリジナルの仮のドット絵。
import { blob, limb } from '../pixel.js';
import { registerPart } from './avatar.js';
import { COLORS } from './parts.js';

const P = (light, mid, dark, line) => ({ light, mid, dark, line });
Object.assign(COLORS.skin, { pale: P('#fff8f0', '#ffe8d8', '#f0c8b0', '#b07860'), dark: P('#c88c60', '#a86c44', '#84502c', '#4a2810') });
Object.assign(COLORS.hair, {
  red: P('#ff9070', '#d84a30', '#a02c1c', '#5a120a'), silver: P('#ffffff', '#d0d4dc', '#a0a6b4', '#5a5e6c'),
  blue: P('#90c8ff', '#4a88e0', '#2c58a8', '#122c60'), pink: P('#ffc8e0', '#f088b8', '#c85890', '#702850'),
  green: P('#a8e890', '#5cb048', '#38802c', '#183c10'),
});
Object.assign(COLORS.top, {
  red: P('#ff9a8a', '#e04838', '#b02c20', '#601008'), black: P('#606070', '#3a3a48', '#262632', '#0c0c14'),
  green: P('#b0e890', '#68b048', '#44802c', '#1c4010'), night: P('#8080d0', '#4848a0', '#2c2c78', '#101040'),
  snow: P('#ffffff', '#f0f4ff', '#c8d4ec', '#7080a0'),
});
Object.assign(COLORS.pants, {
  black: P('#5a5a68', '#363644', '#24242e', '#0a0a12'), night: P('#6868b8', '#3c3c88', '#262664', '#0c0c38'),
  white: P('#ffffff', '#e8eef4', '#b8c4d4', '#5c6a80'),
});

/** 見た目の服 → 上着・下衣の色 */
export const OUTFITS = {
  sailor: { topColor: 'white', pantsColor: 'navy' }, festival: { topColor: 'red', pantsColor: 'brown' },
  formal: { topColor: 'black', pantsColor: 'black' }, farmer: { topColor: 'green', pantsColor: 'brown' },
  snow: { topColor: 'snow', pantsColor: 'white' }, star: { topColor: 'night', pantsColor: 'night' },
};

const headC = (f) => ({ x: f.head.x + 1, y: f.head.y - 9 });
const hairPal = (L) => L.hairC;

// ---------------------------------------------------------------- 髪型
function cap(b, f, h, big = 0) {
  const C = headC(f);
  if (f.view === 'back') { blob(b, C.x, C.y - 3, 10.5 + big, 9.5 + big, h); return C; }
  blob(b, C.x - 1, C.y - 7, 10.5 + big, 5.5 + big * 0.6, h);
  limb(b, { x: C.x - 7, y: C.y - 5 }, { x: C.x - 7, y: C.y + 3 }, 3, h); // 耳の後ろ
  for (let x = 2; x <= 8; x++) b.px(C.x + x, C.y - 2, h.dark);            // 前髪のふち
  return C;
}
const hairDef = (front, back) => ({
  slot: 'hair',
  draws: [
    { layer: 'hairBack', z: 0, fn: (b, f, L) => back && back(b, f, hairPal(L), headC(f)) },
    { layer: 'hairFront', z: 0, fn: (b, f, L) => front(b, f, hairPal(L)) },
  ],
});
const HAIRS = {
  hair_bob: hairDef((b, f, h) => { const C = cap(b, f, h); if (f.view !== 'back') limb(b, { x: C.x - 6, y: C.y - 3 }, { x: C.x - 5, y: C.y + 6 }, 3.5, h); }),
  hair_long: hairDef((b, f, h) => cap(b, f, h), (b, f, h, C) => limb(b, { x: C.x - 6, y: C.y - 2 }, { x: C.x - (f.view === 'back' ? 0 : 8), y: C.y + 18 }, f.view === 'back' ? 8 : 4, h)),
  hair_pony: hairDef((b, f, h) => cap(b, f, h), (b, f, h, C) => {
    if (f.view === 'back') { limb(b, { x: C.x, y: C.y - 2 }, { x: C.x + 1, y: C.y + 14 }, 2.5, h); return; }
    blob(b, C.x - 11, C.y - 4, 2.5, 2.5, h); limb(b, { x: C.x - 13, y: C.y - 3 }, { x: C.x - 15, y: C.y + 10 }, 2.5, h);
  }),
  hair_bun: hairDef((b, f, h) => { const C = cap(b, f, h); blob(b, C.x - (f.view === 'back' ? 0 : 5), C.y - 13, 4.5, 4, h); }),
  hair_curly: hairDef((b, f, h) => {
    const C = cap(b, f, h, 1);
    const pts = f.view === 'back' ? [[-9, -8], [0, -13], [9, -8], [-10, 2], [10, 2]] : [[-9, -7], [-4, -12], [2, -13], [7, -10], [-11, 0], [-9, 5]];
    for (const [dx, dy] of pts) blob(b, C.x + dx, C.y + dy, 3, 3, h);
  }),
  hair_mohawk: hairDef((b, f, h) => {
    const C = headC(f);
    if (f.view === 'back') { limb(b, { x: C.x, y: C.y - 13 }, { x: C.x, y: C.y + 4 }, 2.5, h); return; }
    limb(b, { x: C.x - 7, y: C.y - 12 }, { x: C.x + 4, y: C.y - 14 }, 2.5, h);
    for (const dx of [-6, -2, 2]) limb(b, { x: C.x + dx, y: C.y - 13 }, { x: C.x + dx - 1, y: C.y - 18 }, 1.2, h);
  }),
};
for (const [id, p] of Object.entries(HAIRS)) registerPart(id, p);

// ---------------------------------------------------------------- 顔（目）・感情表現の顔
const EYE = COLORS.eye;
function eyes(b, f, frontRows, backRows, mouth, extra) {
  if (f.view === 'back') return;
  const C = headC(f);
  const pal = { e: EYE.line, w: EYE.white, i: EYE.iris, j: EYE.iris2, r: '#ff6060', b: '#80c8ff', p: '#ff9ab4', y: '#fff060' };
  if (frontRows) b.sprite(frontRows, C.x + 4, C.y - 1, pal);
  if (backRows) b.sprite(backRows, C.x, C.y - 1, pal);
  for (const [dx, dy, c] of mouth || [[5, 6, EYE.mouth], [6, 6, EYE.mouth]]) b.px(C.x + dx, C.y + dy, c);
  b.px(C.x + 8, C.y + 4, '#ffb4a0');
  if (extra) extra(b, C);
}
const faceDef = (fn) => ({ slot: 'face', draws: [{ layer: 'face', z: 0, fn: (b, f) => fn(b, f) }] });
const M = EYE.mouth;
const FACES = {
  face_round: faceDef((b, f) => eyes(b, f, ['.e.', 'ewe', 'eie', 'eje', '.e.'], ['e.', 'we', 'ie', '.e'])),
  face_sharp: faceDef((b, f) => eyes(b, f, ['eee', 'ewe', 'eij', 'ee.'], ['ee', 'we', 'e.'])),
  face_calm: faceDef((b, f) => eyes(b, f, ['...', 'eee', 'eij', '.e.'], ['..', 'ee', 'ie'], [[5, 6, M], [6, 7, M], [7, 6, M]])),
  face_sparkle: faceDef((b, f) => eyes(b, f, ['eee', 'eww', 'eiw', 'eij', 'ejj', 'ejj', '.e.'], ['ee', 'ww', 'ie', 'je', 'je', '.e'])),
  // 感情表現（数秒だけ）
  face_e_smile: faceDef((b, f) => eyes(b, f, ['...', '.e.', 'e.e'], ['..', 'e.', '.e'], [[4, 5, M], [5, 6, M], [6, 6, M], [7, 5, M]])),
  face_e_cry: faceDef((b, f) => eyes(b, f, ['...', 'eee', '.e.', 'b..', 'b..'], ['..', 'ee', '.e', 'b.'], [[5, 7, M], [6, 6, M], [7, 7, M]])),
  face_e_angry: faceDef((b, f) => eyes(b, f, ['e..', '.ee', 'eij', 'ejj', '.e.'], ['.e', 'e.', 'ie', '.e'], [[5, 7, M], [6, 7, M], [7, 7, M]],
    (bb, C) => { for (const [dx, dy] of [[9, -8], [10, -9], [10, -7], [11, -8]]) bb.px(C.x + dx, C.y + dy, '#e03030'); })),
  face_e_surprise: faceDef((b, f) => eyes(b, f, ['.e.', 'ewe', 'ewe', 'eie', '.e.'], ['e.', 'we', 'we', '.e'], [[5, 6, M], [6, 6, M], [5, 7, M], [6, 7, M]])),
  face_e_shy: faceDef((b, f) => eyes(b, f, ['...', 'eee', '...'], ['..', 'ee'], [[5, 6, M], [6, 6, M]],
    (bb, C) => { for (const dx of [6, 7, 8, 9]) bb.px(C.x + dx, C.y + 4, '#ff7a90'); for (const dx of [1, 2]) bb.px(C.x + dx, C.y + 4, '#ff7a90'); })),
  face_e_sleepy: faceDef((b, f) => eyes(b, f, ['...', '...', 'eee'], ['..', '..', 'ee'], [[5, 6, M], [6, 6, M], [6, 7, M]],
    (bb, C) => { bb.sprite(['yyy', '..y', '.y.', 'yyy'], C.x + 9, C.y - 14, { y: '#a0c0ff' }); })),
  face_e_wink: faceDef((b, f) => eyes(b, f, ['...', '...', 'eee', '.e.'], ['ee', 'we', 'ie', '.e'], [[4, 5, M], [5, 6, M], [6, 6, M], [7, 5, M]])),
};
for (const [id, p] of Object.entries(FACES)) registerPart(id, p);

// ---------------------------------------------------------------- 見た目の帽子（hat の層）
const hatDef = (fn) => ({ slot: 'hat', draws: [{ layer: 'hat', z: 0, fn: (b, f) => fn(b, f, headC(f)) }] });
const TRI = (b, x, y, h, pal) => { for (let j = 0; j < h; j++) for (let i = -j; i <= j; i++) b.px(x + i, y + j, j === h - 1 || Math.abs(i) === j ? pal.line : pal.mid); };
const HATS = {
  hat_acorn: hatDef((b, f, C) => { blob(b, C.x, C.y - 10, 11, 5, P('#d8a060', '#a06830', '#704418', '#3a2008')); limb(b, { x: C.x, y: C.y - 15 }, { x: C.x + 1, y: C.y - 19 }, 1, P(null, '#6a4418', '#4a2c10', '#2a1404')); }),
  hat_cat: hatDef((b, f, C) => { const p = P('#ffffff', '#f4f0f8', '#c8c0d8', '#605870'); blob(b, C.x, C.y - 10, 11, 4, p); TRI(b, C.x - 6, C.y - 18, 6, p); TRI(b, C.x + 6, C.y - 18, 6, p); }),
  hat_crown: hatDef((b, f, C) => { const y = '#ffd030', l = '#8a6000'; for (let i = -9; i <= 9; i++) { b.px(C.x + i, C.y - 10, l); b.px(C.x + i, C.y - 11, y); b.px(C.x + i, C.y - 12, y); } for (const dx of [-8, -3, 2, 7]) { b.px(C.x + dx, C.y - 13, y); b.px(C.x + dx, C.y - 14, y); b.px(C.x + dx, C.y - 15, '#ff4060'); } }),
  hat_chef: hatDef((b, f, C) => { const p = P('#ffffff', '#f6f6f6', '#d0d4dc', '#707480'); limb(b, { x: C.x, y: C.y - 10 }, { x: C.x, y: C.y - 16 }, 7, p); blob(b, C.x, C.y - 19, 9, 5, p); }),
  hat_witch: hatDef((b, f, C) => { const p = P('#a080e0', '#6040a8', '#402880', '#1c0c40'); limb(b, { x: C.x - 13, y: C.y - 9 }, { x: C.x + 13, y: C.y - 9 }, 1.5, p); TRI(b, C.x, C.y - 26, 16, p); b.px(C.x + 1, C.y - 26, p.line); }),
  hat_leaf: hatDef((b, f, C) => { const p = P('#c0f090', '#6cc040', '#3c8a24', '#1c4010'); blob(b, C.x - 1, C.y - 12, 9, 3.5, p); limb(b, { x: C.x - 1, y: C.y - 12 }, { x: C.x + 3, y: C.y - 17 }, 0.8, p); }),
  hat_pirate: hatDef((b, f, C) => { const p = P('#505060', '#2c2c38', '#1c1c24', '#08080c'); blob(b, C.x, C.y - 11, 13, 4, p); blob(b, C.x, C.y - 14, 7, 4, p); b.px(C.x, C.y - 13, '#ffffff'); b.px(C.x + 1, C.y - 13, '#ffffff'); }),
  hat_star: hatDef((b, f, C) => { const y = { y: '#ffe040', o: '#a07800' }; b.sprite(['..o..', '.oyo.', 'oyyyo', '.oyo.', 'o...o'], C.x - 10, C.y - 12, y); }),
  hat_pumpkin: hatDef((b, f, C) => { blob(b, C.x, C.y - 11, 11, 6, P('#ffb050', '#f07818', '#b04c08', '#5a2000')); limb(b, { x: C.x, y: C.y - 17 }, { x: C.x + 2, y: C.y - 20 }, 1, P(null, '#4a8020', '#2c5010', '#183008')); }),
  hat_snow: hatDef((b, f, C) => { blob(b, C.x, C.y - 10, 11, 5, P('#ffffff', '#e8f4ff', '#a8c8f0', '#4870a8')); b.sprite(['b.b', '.b.', 'b.b'], C.x - 1, C.y - 13, { b: '#3080e0' }); }),
  hat_stump: hatDef((b, f, C) => { const p = P('#c8905a', '#94602c', '#6a4018', '#3a200a'); limb(b, { x: C.x, y: C.y - 10 }, { x: C.x, y: C.y - 15 }, 8, p); for (let i = -6; i <= 6; i++) b.px(C.x + i, C.y - 15, '#e0b880'); }),
  hat_sheep: hatDef((b, f, C) => { const p = P('#fff4b0', '#ffd860', '#d0a030', '#7a5a10'); for (const [dx, dy] of [[-8, -9], [-3, -13], [3, -13], [8, -9], [0, -10]]) blob(b, C.x + dx, C.y + dy, 4.5, 4, p); }),
};
for (const [id, p] of Object.entries(HATS)) registerPart(id, p);

export const HAIR_IDS = ['hair_spiky', ...Object.keys(HAIRS)];
export const FACE_IDS = ['face_basic', ...Object.keys(FACES).filter((k) => !k.startsWith('face_e_'))];
