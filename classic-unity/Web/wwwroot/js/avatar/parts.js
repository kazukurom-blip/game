// 試遊版（classic-unity/Web）へのコピー。元は classic/src/render/（ブラウザの試作の仮のアバター）。skeleton.js だけ攻撃・構え・座るの動きを足した。
// 仮の部品（コードで描いたドット絵）。本物の部品（PNG）に差し替える時は、同じ id・同じ層で
// kind: 'image' の部品を登録すればよい（avatar.js の registerPart）。
//
// 部品は「どの層に・層の中の何番目（z）に」描くかの一覧を持つ。
// 1 つの部品が複数の層に描いてよい（例: 上着の袖は「腕」の層で腕の上に）。
import { limb, blob } from '../pixel.js';

// ---- 色（基準パレットが決まるまでの仮）。光は左上: light / mid / dark、線は line
export const COLORS = {
  skin: {
    light: { light: '#fff0dc', mid: '#ffd9b4', dark: '#eeb08a', line: '#a8603e' },
    tan: { light: '#f6d2a6', mid: '#e8b07c', dark: '#c98a5a', line: '#7c4428' },
  },
  hair: {
    brown: { light: '#e0a060', mid: '#b4692e', dark: '#84441c', line: '#4e240c' },
    black: { light: '#6a6a8a', mid: '#3e3e58', dark: '#26263a', line: '#121220' },
    blond: { light: '#fff0a0', mid: '#f0c850', dark: '#c89030', line: '#7a5014' },
  },
  top: {
    blue: { light: '#a8dcff', mid: '#5cb0f0', dark: '#3478c8', line: '#1c4280' },
    white: { light: '#ffffff', mid: '#e8eef4', dark: '#b8c4d4', line: '#5c6a80' },
  },
  pants: {
    navy: { light: '#7c8cc0', mid: '#55629a', dark: '#3a4474', line: '#1e2448' },
    brown: { light: '#c09060', mid: '#966a40', dark: '#6c4828', line: '#3a2410' },
  },
  shoes: {
    brown: { light: '#c88850', mid: '#9a5e30', dark: '#6c3c18', line: '#3c1c08' },
  },
  eye: { line: '#2a1a34', iris: '#3a4c9c', iris2: '#6c9ce0', white: '#ffffff', mouth: '#c0584a' },
};

const darker = (p) => ({ light: p.mid, mid: p.dark, dark: p.dark, line: p.line });

// ---------------------------------------------------------------- 頭（肌）
// 頭は丸（横 19・縦 18 ＋線）。中心 C は基準点（あごの下）から (+1, -9)
const headC = (f) => ({ x: f.head.x + 1, y: f.head.y - 9 });
const EAR = ['.kk.', 'kshk', 'ksdk', '.kk.'];

function drawHead(buf, f, skin) {
  const C = headC(f);
  blob(buf, C.x, C.y, 9.2, 8.6, skin);
  const pal = { k: skin.line, s: skin.mid, h: skin.light, d: skin.dark };
  if (f.view === 'back') {
    buf.sprite(EAR, C.x - 12, C.y - 1, pal);
    buf.sprite(EAR, C.x + 9, C.y - 1, pal, true);
    return;
  }
  buf.sprite(EAR, C.x - 6, C.y + 0, pal);
}

// ---------------------------------------------------------------- 顔（目・口）
// 手前の目は 3×6、奥の目は遠近で 2×5。クラシック風の縦長の大きな目
const EYE_FRONT = ['eee', 'ewe', 'eii', 'eij', 'ejj', '.e.'];
const EYE_BACK = ['ee', 'we', 'ie', 'je', '.e'];
function drawFace(buf, f, eye) {
  if (f.view === 'back') return;
  const C = headC(f);
  const pal = { e: eye.line, w: eye.white, i: eye.iris, j: eye.iris2 };
  buf.sprite(EYE_FRONT, C.x + 4, C.y - 1, pal);
  buf.sprite(EYE_BACK, C.x - 0, C.y - 1, pal);
  buf.px(C.x + 5, C.y + 6, eye.mouth);
  buf.px(C.x + 6, C.y + 6, eye.mouth);
  // ほお
  buf.px(C.x + 8, C.y + 4, '#ffb4a0');
}

// ---------------------------------------------------------------- 髪（とがった短い髪）
// 前髪: 26×20。頭の中心から (-13, -13)
const HAIR_FRONT = [
  '..........HHHHHH..........',
  '.......HHHllllllHHH.......',
  '.....HHmmmlllllllllmHH....',
  '....HmmmmmllllllllmmmmH...',
  '...HmmmmmmmllllllmmmmmmH..',
  '..HrmmmmmmmmmmmmmmmmmmmmH.',
  '..HrmmmmmmmmmmmmmmmmmmmmmH',
  '.HrrmmmmmmmmmmmmmmmmmmmmmH',
  '.HrrrmmmmmmmmmmmmmmmmmmmmH',
  'HrrrrmmmmmmmmmmmmmmmmmmmH.',
  'HrrrrrmmmmmmmmmrmmmmmmrmH.',
  'HrrrrrrmmmmmmmHrHmmmmHrmmH',
  'HrrrrrrrmmH.H.......H.....',
  'HrrrrrrrH.................',
  'HrrrrrrH..................',
  '.HrrrrrH..................',
  '.HrrrrH...................',
  '..HrrrH...................',
  '..HrrH....................',
  '...HH.....................',
];
// 背中から見た頭: 24×21。頭の中心から (-12, -13)
const HAIR_BACKVIEW = [
  '........HHHHHHHH........',
  '......HHmmmllmmmHH......',
  '....HHmmmmllllmmmmHH....',
  '...HmmmmmmmllmmmmmmmH...',
  '..HmmmmmmmmmmmmmmmmmmH..',
  '.HmmmmmmmmmmmmmmmmmmmmH.',
  '.HrmmmmmmmmmmmmmmmmmmrH.',
  'HrrmmmmmmmmmmmmmmmmmmrrH',
  'HrrmmmmmmmmmmmmmmmmmmrrH',
  'HrrrmmmmmmmmmmmmmmmmrrrH',
  'HrrrmmmmmmmrmmmmmmmmrrrH',
  'HrrrrmmmmmmrrmmmmmmrrrrH',
  'HrrrrrmmmmrrrrmmmmrrrrrH',
  '.HrrrrrrmrrrrrrrmrrrrrH.',
  '.HrrrrrrrrrrrrrrrrrrrrH.',
  '..HrrrrrrrrrrrrrrrrrrH..',
  '..HrrrrrrHrrrrrHrrrrrH..',
  '...HrrrrH.HrrrH.HrrrH...',
  '....HHHH...HHH...HHH....',
];
function drawHairFront(buf, f, hair) {
  if (f.view === 'back') return;
  const C = headC(f);
  const pal = { H: hair.line, r: hair.dark, m: hair.mid, l: hair.light };
  buf.sprite(HAIR_FRONT, C.x - 13, C.y - 13, pal);
}
function drawHairBack(buf, f, hair) {
  const C = headC(f);
  const pal = { H: hair.line, r: hair.dark, m: hair.mid, l: hair.light };
  if (f.view === 'back') {
    buf.sprite(HAIR_BACKVIEW, C.x - 12, C.y - 13, pal);
    return;
  }
  // 横向き: えり足が少しだけ首の後ろに出る
  buf.sprite(['.HH.', 'HrrH', 'HrrH', '.HH.'], C.x - 10, C.y + 6, pal);
}

// ---------------------------------------------------------------- 体（肌）: 腕・脚・胴
const shoulderOf = (arm) => arm.s;
function drawArm(buf, arm, skin, back) {
  const p = back ? darker(skin) : skin;
  if (arm.e) { limb(buf, arm.s, arm.e, 1.5, p); limb(buf, arm.e, arm.h, 1.5, p); }
  else limb(buf, shoulderOf(arm), arm.h, 1.5, p);
  blob(buf, arm.h.x, arm.h.y, 1.6, 1.6, p);
}
function drawLeg(buf, leg, skin, back) {
  limb(buf, leg.h, leg.f, 2, back ? darker(skin) : skin);
}
function drawTorsoSkin(buf, f, skin) {
  limb(buf, { x: f.neck.x, y: f.neck.y + (f.prone ? 2 : 4) }, f.hip, 4.5, skin);
  limb(buf, f.neck, { x: f.neck.x, y: f.neck.y + 3 }, 1.5, skin); // 首
}

// ---------------------------------------------------------------- 上着（半そで）
function sleeveEnd(arm, k = 0.45) {
  if (arm.e) return { x: arm.s.x + (arm.e.x - arm.s.x) * 0.7, y: arm.s.y + (arm.e.y - arm.s.y) * 0.7 };
  return { x: arm.s.x + (arm.h.x - arm.s.x) * k, y: arm.s.y + (arm.h.y - arm.s.y) * k };
}
function drawShirt(buf, f, c) {
  const top = { x: f.neck.x, y: f.neck.y + (f.prone ? 0 : 4) }, bot = { x: f.hip.x, y: f.hip.y + 1 };
  limb(buf, top, bot, f.prone ? 4.5 : 5, c);
  if (f.view === 'side' && !f.prone) {
    // すそ（暗い線）
    for (let x = -3; x <= 3; x++) buf.px(f.hip.x + x, f.hip.y, c.dark);
  }
  if (f.view === 'back' && !f.prone) {
    for (let x = -3; x <= 3; x++) buf.px(f.hip.x + x, f.hip.y, c.dark);
  }
}
function drawSleeve(buf, arm, c, back) {
  const s = { x: arm.s.x, y: arm.s.y + 1 };
  limb(buf, s, sleeveEnd({ ...arm, s }), 2.2, back ? darker(c) : c);
}

// ---------------------------------------------------------------- 下衣（長ズボン）
function drawPants(buf, f, c) {
  const legEnd = (leg) => {
    const dx = leg.f.x - leg.h.x, dy = leg.f.y - leg.h.y, L = Math.hypot(dx, dy) || 1;
    return { x: leg.f.x - dx / L * 1, y: leg.f.y - dy / L * 1 };
  };
  limb(buf, f.legB.h, legEnd(f.legB), 2.4, darker(c));
  limb(buf, f.legF.h, legEnd(f.legF), 2.4, c);
  if (f.prone) limb(buf, { x: f.hip.x + 2, y: f.hip.y }, { x: f.hip.x - 2, y: f.hip.y }, 3.5, c);
  else limb(buf, { x: f.hip.x, y: f.hip.y - 1 }, { x: f.hip.x, y: f.hip.y + 1 }, 4, c);
}

// ---------------------------------------------------------------- 靴
const SHOE_SIDE = ['.OOO...', 'OlmmOO.', 'OmmmmdO', 'OOOOOOO'];
const SHOE_LIFT = ['.OOO..O', 'OlmmOOO', 'OmmmdO.', 'OOOOO..'];
const SHOE_BACK = ['.OOO.', 'OlmmO', 'OmmdO', 'OOOOO'];
function drawShoe(buf, f, leg, c) {
  const pal = { O: c.line, l: c.light, m: c.mid, d: c.dark };
  if (f.view === 'back') { buf.sprite(SHOE_BACK, leg.f.x - 2, leg.f.y, pal); return; }
  if (f.prone) { buf.sprite(['OOO.', 'OmmO', 'OmdO', 'OOO.'], leg.f.x - 3, leg.f.y - 2, pal); return; }
  buf.sprite(leg.lift ? SHOE_LIFT : SHOE_SIDE, leg.f.x - 2, leg.f.y, pal);
}

// ---------------------------------------------------------------- 部品の一覧
// 各部品: { id, slot: 部品の種類, draws: [{ layer, z, fn(buf, frame, look) }] }
export const CODE_PARTS = {
  body: {
    slot: 'body',
    draws: [
      // 横向き: 奥の腕・奥の脚は胴の後ろ
      { layer: 'body', z: 0, fn: (b, f, L) => { if (f.view === 'side') drawArm(b, f.armB, L.skinC, true); } },
      { layer: 'body', z: 2, fn: (b, f, L) => {
        drawLeg(b, f.legB, L.skinC, f.view === 'side');
        drawLeg(b, f.legF, L.skinC, false);
        drawTorsoSkin(b, f, L.skinC);
        drawHead(b, f, L.skinC);
      } },
      { layer: 'arm', z: 0, fn: (b, f, L) => {
        if (f.view === 'back') { drawArm(b, f.armB, L.skinC, false); drawArm(b, f.armF, L.skinC, false); }
        else drawArm(b, f.armF, L.skinC, false);
      } },
    ],
  },
  face_basic: { slot: 'face', draws: [{ layer: 'face', z: 0, fn: (b, f, L) => drawFace(b, f, COLORS.eye) }] },
  hair_spiky: {
    slot: 'hair',
    draws: [
      { layer: 'hairBack', z: 0, fn: (b, f, L) => drawHairBack(b, f, L.hairC) },
      { layer: 'hairFront', z: 0, fn: (b, f, L) => drawHairFront(b, f, L.hairC) },
    ],
  },
  top_tee: {
    slot: 'top',
    draws: [
      { layer: 'body', z: 1, fn: (b, f, L) => { if (f.view === 'side') drawSleeve(b, f.armB, L.topC, true); } },
      { layer: 'top', z: 0, fn: (b, f, L) => drawShirt(b, f, L.topC) },
      { layer: 'arm', z: 1, fn: (b, f, L) => {
        if (f.view === 'back') { drawSleeve(b, f.armB, L.topC, false); drawSleeve(b, f.armF, L.topC, false); }
        else drawSleeve(b, f.armF, L.topC, false);
      } },
    ],
  },
  pants_long: { slot: 'pants', draws: [{ layer: 'pants', z: 0, fn: (b, f, L) => drawPants(b, f, L.pantsC) }] },
  shoes_basic: {
    slot: 'shoes',
    draws: [{ layer: 'shoes', z: 0, fn: (b, f, L) => { drawShoe(b, f, f.legB, f.view === 'side' ? darker(L.shoesC) : L.shoesC); drawShoe(b, f, f.legF, L.shoesC); } }],
  },
};
