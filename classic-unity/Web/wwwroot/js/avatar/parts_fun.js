// 楽しさの要素の仮の部品（parts.js と同じ形。avatar.js の registerPart で足す）: 髪型 6・顔（目）4・感情表現の顔 7・見た目の帽子 12・
// 肌と髪と服の色。美容院（js/fun.js）・見た目の品・感情表現が使う。絵はオリジナルのドット絵（parts.js と同じちびキャラの頭の大きさ）。
import { Mask, paintMask } from '../pixel.js';
import { registerPart } from './avatar.js';
import { COLORS, headC, hairCap, faceCut, hairShine, drawHairBackView, drawEyes } from './parts.js';

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
const hairPal = (L) => L.hairC;

// ---------------------------------------------------------------- 髪型（頭の大きさは parts.js の HEAD。形はオリジナル）
// front: 前の層（頭の上・前髪）、back: 後ろの層（体の後ろに垂れる髪）
function capMask(C, tips, big = 0) {
  const m = hairCap(C, big);
  m.sub(faceCut(C, tips));
  m.sub(new Mask().ellipse(C.x - 3, C.y + 3, 2.4, 3));
  return m;
}
const hairDef = (front, back) => ({
  slot: 'hair',
  draws: [
    { layer: 'hairBack', z: 0, fn: (b, f, L) => { if (back) back(b, f, hairPal(L), headC(f)); } },
    { layer: 'hairFront', z: 0, fn: (b, f, L) => front(b, f, hairPal(L), headC(f)) },
  ],
});
const paintHair = (b, m, h) => paintMask(b, m, h, { rimL: 2, rimD: 2 });
const HAIRS = {
  // おかっぱ: まっすぐの前髪、あごまでの横の髪
  hair_bob: hairDef((b, f, h, C) => {
    if (f.view === 'back') { drawHairBackView(b, C, h, (m) => m.rect(C.x - 13, C.y, 27, 9)); return; }
    const m = capMask(C, [-2, -2, -2, -3]);
    m.ellipse(C.x - 7, C.y + 3, 6.5, 8);
    m.sub(new Mask().ellipse(C.x - 3, C.y + 3, 2.4, 3));
    paintHair(b, m, h); hairShine(b, C, h);
  }),
  // 長い髪: 背中まで
  hair_long: hairDef((b, f, h, C) => {
    if (f.view === 'back') { drawHairBackView(b, C, h, (m) => m.poly([[C.x - 12, C.y], [C.x + 12, C.y], [C.x + 10, C.y + 26], [C.x - 10, C.y + 26]])); return; }
    const m = capMask(C, [0, 1, -1, -3]);
    m.ellipse(C.x - 8, C.y + 1, 5, 7);
    paintHair(b, m, h); hairShine(b, C, h);
  }, (b, f, h, C) => {
    if (f.view === 'back') return;
    paintHair(b, new Mask().poly([[C.x - 13, C.y - 2], [C.x - 3, C.y - 2], [C.x - 4, C.y + 22], [C.x - 9, C.y + 25], [C.x - 14, C.y + 20]]), h);
  }),
  // ポニーテール: 後ろで結んで垂らす
  hair_pony: hairDef((b, f, h, C) => {
    if (f.view === 'back') { drawHairBackView(b, C, h); paintHair(b, new Mask().line({ x: C.x, y: C.y - 1 }, { x: C.x + 1, y: C.y + 17 }, 3.2), h); b.px(C.x, C.y - 1, '#ff5a7a'); b.px(C.x + 1, C.y - 1, '#ff5a7a'); return; }
    const m = capMask(C, [-1, 0, -2, -3]);
    m.ellipse(C.x - 8, C.y + 1, 4, 5);
    paintHair(b, m, h); hairShine(b, C, h);
    b.rect(C.x - 13, C.y - 6, 2, 3, '#ff5a7a'); // 結び目のリボン
  }, (b, f, h, C) => {
    if (f.view === 'back') return;
    paintHair(b, new Mask().ellipse(C.x - 15, C.y - 3, 3.5, 3.5).line({ x: C.x - 16, y: C.y - 2 }, { x: C.x - 19, y: C.y + 12 }, 3), h);
  }),
  // おだんご: 頭の上に丸いまとめ髪
  hair_bun: hairDef((b, f, h, C) => {
    const bx = f.view === 'back' ? C.x : C.x - 5;
    paintHair(b, new Mask().ellipse(bx, C.y - 15, 5.5, 5), h);
    if (f.view === 'back') { drawHairBackView(b, C, h); return; }
    const m = capMask(C, [-1, -1, -2, -3]);
    m.ellipse(C.x - 8, C.y + 1, 4, 5);
    paintHair(b, m, h); hairShine(b, C, h);
  }),
  // くせ毛: 丸いかたまりがいくつも
  hair_curly: hairDef((b, f, h, C) => {
    const m = f.view === 'back' ? new Mask().ellipse(C.x, C.y - 2, 13, 11.5) : capMask(C, [0, -1, 0, -3], 1);
    const pts = f.view === 'back' ? [[-11, -8], [0, -14], [11, -8], [-12, 3], [12, 3], [-6, 9], [6, 9]] : [[-11, -8], [-5, -14], [2, -15], [8, -12], [-14, 0], [-11, 6], [12, -6]];
    for (const [dx, dy] of pts) m.ellipse(C.x + dx, C.y + dy, 4, 4);
    if (f.view !== 'back') m.sub(faceCut(C, [0, -1, 0, -3])).sub(new Mask().ellipse(C.x - 3, C.y + 3, 2.4, 3));
    paintHair(b, m, h);
    for (const [dx, dy] of pts) b.px(C.x + dx - 1, C.y + dy - 1, h.light);
  }),
  // とさか: 真ん中だけ立てた髪（横は短く刈る）
  hair_mohawk: hairDef((b, f, h, C) => {
    const m = new Mask();
    if (f.view === 'back') m.poly([[C.x - 3, C.y - 17], [C.x + 3, C.y - 17], [C.x + 3, C.y + 6], [C.x - 3, C.y + 6]]);
    else m.poly([[C.x - 11, C.y - 6], [C.x - 9, C.y - 14], [C.x - 3, C.y - 19], [C.x + 4, C.y - 18], [C.x + 9, C.y - 13], [C.x + 6, C.y - 9], [C.x - 2, C.y - 10]]);
    paintHair(b, m, h);
  }),
};
for (const [id, p] of Object.entries(HAIRS)) registerPart(id, p);

// ---------------------------------------------------------------- 顔（目）・感情表現の顔
// 目の置き方は parts.js の drawEyes と同じ（手前の目の左上 = C+(5,-2)、奥の目 = C+(-1,-1)）
const faceDef = (fn) => ({ slot: 'face', draws: [{ layer: 'face', z: 0, fn: (b, f) => fn(b, f) }] });
const M = COLORS.eye.mouth;
const SMILE = [[5, 6, M], [6, 7, M], [7, 7, M], [8, 6, M]];
const FACES = {
  face_round: faceDef((b, f) => drawEyes(b, f, ['.ee.', 'eeee', 'ewie', 'ewie', 'eiie', 'ejje', '.ee.'], ['.e.', 'eee', 'wie', 'iie', 'jje', '.e.'])),
  face_sharp: faceDef((b, f) => drawEyes(b, f, ['....', 'eeee', '.eee', 'ewie', 'eije', '.ee.'], ['...', 'ee.', 'eee', 'wie', '.e.'])),
  face_calm: faceDef((b, f) => drawEyes(b, f, ['....', '....', 'eeee', 'ewie', 'eije', '.ee.'], ['...', '...', 'eee', 'wie', '.e.'], [[6, 7, M], [7, 8, M], [8, 7, M]])),
  face_sparkle: faceDef((b, f) => drawEyes(b, f, ['.eee', 'eeee', 'ewwe', 'ewie', 'eiwe', 'ejje', 'ejje', '.ee.'], ['ee.', 'eee', 'wwe', 'wie', 'jje', 'jje', '.e.'])),
  // 感情表現（数秒だけ）
  face_e_smile: faceDef((b, f) => drawEyes(b, f, ['....', '....', '.ee.', 'e..e'], ['...', '...', 'ee.', '..e'], SMILE)),
  face_e_cry: faceDef((b, f) => drawEyes(b, f, ['....', 'eeee', '.ee.', 'b...', 'b...', 'b...'], ['...', 'eee', '.e.', 'b..', 'b..'], [[6, 8, M], [7, 7, M], [8, 8, M]])),
  face_e_angry: faceDef((b, f) => drawEyes(b, f, ['e...', '.ee.', '..ee', 'ewie', 'ejje', '.ee.'], ['..e', '.e.', 'eee', 'wie', '.e.'], [[6, 8, M], [7, 8, M], [8, 8, M]],
    (bb, C) => { for (const [dx, dy] of [[10, -9], [11, -10], [11, -8], [12, -9]]) bb.px(C.x + dx, C.y + dy, '#e03030'); })),
  face_e_surprise: faceDef((b, f) => drawEyes(b, f, ['.ee.', 'ewwe', 'ewie', 'ewie', '.ee.'], ['.e.', 'ewe', 'eie', '.e.'], [[6, 7, M], [7, 7, M], [6, 8, M], [7, 8, M]])),
  face_e_shy: faceDef((b, f) => drawEyes(b, f, ['....', '....', 'eeee', '....'], ['...', '...', 'eee'], [[6, 7, M], [7, 7, M]],
    (bb, C) => { for (const dx of [8, 9, 10, 11]) bb.px(C.x + dx, C.y + 5, '#ff7a90'); for (const dx of [0, 1, 2]) bb.px(C.x + dx, C.y + 5, '#ff7a90'); })),
  face_e_sleepy: faceDef((b, f) => drawEyes(b, f, ['....', '....', '....', 'eeee'], ['...', '...', '...', 'eee'], [[6, 7, M], [7, 7, M], [7, 8, M]],
    (bb, C) => { bb.sprite(['yyyy', '..y.', '.y..', 'yyyy'], C.x + 11, C.y - 17, { y: '#a0c0ff' }); })),
  face_e_wink: faceDef((b, f) => drawEyes(b, f, ['....', '....', '....', 'eeee', '.ee.'], ['ee.', 'eee', 'wie', 'iie', 'jje', '.e.'], SMILE)),
};
for (const [id, p] of Object.entries(FACES)) registerPart(id, p);

// ---------------------------------------------------------------- 見た目の帽子（hat の層）
const hatDef = (fn) => ({ slot: 'hat', draws: [{ layer: 'hat', z: 0, fn: (b, f) => fn(b, f, headC(f)) }] });
const pm = (b, m, p, o) => paintMask(b, m, p, o);
const HATS = {
  hat_acorn: hatDef((b, f, C) => {
    const p = P('#dca468', '#a06830', '#704418', '#3a2008');
    pm(b, new Mask().ellipse(C.x, C.y - 11, 13.5, 6.5).rect(C.x - 13, C.y - 11, 27, 3), p);
    for (let x = -10; x <= 10; x += 4) { b.px(C.x + x, C.y - 12, p.dark); b.px(C.x + x + 2, C.y - 9, p.dark); }
    pm(b, new Mask().line({ x: C.x, y: C.y - 18 }, { x: C.x + 2, y: C.y - 22 }, 1), P(null, '#6a4418', '#4a2c10', '#2a1404'), { rimL: 0 });
  }),
  hat_cat: hatDef((b, f, C) => {
    const p = P('#ffffff', '#f4f0f8', '#c8c0d8', '#605870');
    pm(b, new Mask().ellipse(C.x, C.y - 11, 13.5, 5.5).poly([[C.x - 12, C.y - 12], [C.x - 9, C.y - 23], [C.x - 3, C.y - 14]]).poly([[C.x + 3, C.y - 14], [C.x + 9, C.y - 23], [C.x + 12, C.y - 12]]), p);
    b.px(C.x - 8, C.y - 18, '#ffb0c8'); b.px(C.x - 8, C.y - 17, '#ffb0c8'); b.px(C.x + 8, C.y - 18, '#ffb0c8'); b.px(C.x + 8, C.y - 17, '#ffb0c8');
  }),
  hat_crown: hatDef((b, f, C) => {
    const p = P('#fff4a0', '#ffd030', '#d09a10', '#7a5000');
    pm(b, new Mask().rect(C.x - 10, C.y - 16, 21, 4).poly([[C.x - 10, C.y - 15], [C.x - 9, C.y - 21], [C.x - 5, C.y - 15]]).poly([[C.x - 3, C.y - 15], [C.x, C.y - 23], [C.x + 3, C.y - 15]]).poly([[C.x + 5, C.y - 15], [C.x + 9, C.y - 21], [C.x + 10, C.y - 15]]), p, { rimL: 1, rimD: 1 });
    b.px(C.x, C.y - 14, '#ff4060'); b.px(C.x - 6, C.y - 14, '#40a0ff'); b.px(C.x + 6, C.y - 14, '#40a0ff');
  }),
  hat_chef: hatDef((b, f, C) => {
    const p = P('#ffffff', '#f6f6f6', '#d0d4dc', '#707480');
    pm(b, new Mask().rect(C.x - 9, C.y - 21, 19, 10).ellipse(C.x - 4, C.y - 23, 7, 5.5).ellipse(C.x + 5, C.y - 23, 6.5, 5.5), p);
    for (let x = -9; x <= 9; x++) b.px(C.x + x, C.y - 13, p.dark);
  }),
  hat_witch: hatDef((b, f, C) => {
    const p = P('#a080e0', '#6040a8', '#402880', '#1c0c40');
    pm(b, new Mask().ellipse(C.x, C.y - 12, 18, 2.6).poly([[C.x - 9, C.y - 12], [C.x + 9, C.y - 12], [C.x + 1, C.y - 33], [C.x - 3, C.y - 30]]), p, { rimL: 1, rimD: 2 });
    for (let x = -7; x <= 7; x++) { b.px(C.x + x, C.y - 15, '#ffd040'); }
  }),
  hat_leaf: hatDef((b, f, C) => {
    const p = P('#c0f090', '#6cc040', '#3c8a24', '#1c4010');
    pm(b, new Mask().poly([[C.x - 13, C.y - 13], [C.x - 4, C.y - 19], [C.x + 8, C.y - 18], [C.x + 12, C.y - 13], [C.x, C.y - 11]]), p);
    for (let x = -9; x <= 8; x++) b.px(C.x + x, C.y - 14 - (x > 0 ? 1 : 0), p.dark);
    pm(b, new Mask().line({ x: C.x - 1, y: C.y - 18 }, { x: C.x + 2, y: C.y - 23 }, 0.8), p, { rimL: 0 });
  }),
  hat_pirate: hatDef((b, f, C) => {
    const p = P('#585868', '#2c2c38', '#1c1c24', '#08080c');
    pm(b, new Mask().ellipse(C.x, C.y - 17, 10, 6).ellipse(C.x, C.y - 13, 17, 4), p);
    b.sprite(['.ww.', 'wkkw', '.ww.', 'w..w'], C.x - 2, C.y - 20, { w: '#ffffff', k: '#2c2c38' });
  }),
  hat_star: hatDef((b, f, C) => {
    b.sprite(['...o...', '..oyo..', 'ooyyyoo', '.oyyyo.', '.oyoyo.', 'oo...oo'], C.x - 13, C.y - 16, { y: '#ffe040', o: '#a07800' });
  }),
  hat_pumpkin: hatDef((b, f, C) => {
    const p = P('#ffb860', '#f07818', '#b04c08', '#5a2000');
    pm(b, new Mask().ellipse(C.x, C.y - 13, 14, 8), p);
    for (const x of [-6, 0, 6]) for (let y = -19; y <= -8; y++) if (Math.abs(y + 13) < 6) b.px(C.x + x, C.y + y, p.dark);
    pm(b, new Mask().line({ x: C.x, y: C.y - 21 }, { x: C.x + 3, y: C.y - 25 }, 1.2), P(null, '#4a8020', '#2c5010', '#183008'), { rimL: 0 });
  }),
  hat_snow: hatDef((b, f, C) => {
    const p = P('#ffffff', '#e8f4ff', '#a8c8f0', '#4870a8');
    pm(b, new Mask().ellipse(C.x, C.y - 12, 13.5, 7).rect(C.x - 13, C.y - 12, 27, 3), p);
    pm(b, new Mask().rect(C.x - 13, C.y - 11, 27, 3), P('#ff8080', '#e03c3c', '#a82020', '#601010'), { rimL: 1, rimD: 1 });
    pm(b, new Mask().ellipse(C.x + 1, C.y - 21, 3, 3), p, { rimL: 1, rimD: 1 });
  }),
  hat_stump: hatDef((b, f, C) => {
    const p = P('#c8905a', '#94602c', '#6a4018', '#3a200a');
    pm(b, new Mask().rect(C.x - 10, C.y - 20, 21, 10).ellipse(C.x, C.y - 10, 10.5, 2), p);
    pm(b, new Mask().ellipse(C.x, C.y - 20, 10, 2.5), P('#f4d8a8', '#e0b880', '#b88c50', '#6a4018'), { rimL: 0, rimD: 1 });
    b.px(C.x, C.y - 20, '#b88c50'); b.px(C.x + 1, C.y - 20, '#b88c50');
  }),
  hat_sheep: hatDef((b, f, C) => {
    const p = P('#fff4b0', '#ffd860', '#d0a030', '#7a5a10');
    const m = new Mask();
    for (const [dx, dy] of [[-10, -10], [-4, -15], [3, -15], [10, -10], [0, -11]]) m.ellipse(C.x + dx, C.y + dy, 5.5, 4.5);
    pm(b, m, p);
  }),
};
for (const [id, p] of Object.entries(HATS)) registerPart(id, p);

export const HAIR_IDS = ['hair_spiky', ...Object.keys(HAIRS)];
export const FACE_IDS = ['face_basic', ...Object.keys(FACES).filter((k) => !k.startsWith('face_e_'))];
