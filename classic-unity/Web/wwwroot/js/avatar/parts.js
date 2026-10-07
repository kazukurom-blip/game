// 主人公の部品（コードで描くドット絵）。クラシック風のちびキャラ（約 2.5 頭身・大きな頭と目・1px の濃い色の線・光は左上の 3 段の塗り）。
// 形は Mask（足し引きした形）で作り、paintMask で「線・明るい縁・ふつう・暗い縁」に塗る（pixel.js）。
// 本物の部品（PNG）に差し替える時は、同じ id・同じ層で kind: 'image' の部品を登録すればよい（avatar.js の registerPart）。
// 部品は「どの層に・層の中の何番目（z）に」描くかの一覧を持つ。1 つの部品が複数の層に描いてよい（例: 上着の袖は「腕」の層で腕の上に）。
// 絵はすべてこのプロジェクトのオリジナル（実在のゲームの絵は写していない）。
import { Mask, paintMask } from '../pixel.js';

// ---- 色（基準パレットが決まるまでの仮）。光は左上: light / mid / dark、線は line（その部分の一番暗い色。真っ黒にしない）
export const COLORS = {
  skin: {
    light: { light: '#fff3e2', mid: '#ffdcbc', dark: '#f0b48e', line: '#a85a3c' },
    tan: { light: '#f8d6ac', mid: '#e8b07c', dark: '#c98a5a', line: '#7c4428' },
  },
  hair: {
    brown: { light: '#eab070', mid: '#bc7034', dark: '#8a4a1e', line: '#4e240c' },
    black: { light: '#7a7aa0', mid: '#444462', dark: '#2a2a40', line: '#121220' },
    blond: { light: '#fff4b0', mid: '#f2cc58', dark: '#cc9432', line: '#7a5014' },
  },
  top: {
    blue: { light: '#b4e2ff', mid: '#62b4f4', dark: '#3478c8', line: '#1c4280' },
    white: { light: '#ffffff', mid: '#eef2f6', dark: '#bcc8d8', line: '#5c6a80' },
  },
  pants: {
    navy: { light: '#8494c8', mid: '#5866a0', dark: '#3a4474', line: '#1e2448' },
    brown: { light: '#c89868', mid: '#966a40', dark: '#6c4828', line: '#3a2410' },
  },
  shoes: {
    brown: { light: '#d89660', mid: '#a0622e', dark: '#6c3c18', line: '#3c1c08' },
  },
  eye: { line: '#2a1630', iris: '#34449a', iris2: '#6aa4ec', white: '#ffffff', mouth: '#b84a40', blush: '#ffae9c' },
};

const darker = (p) => ({ light: p.mid, mid: p.dark, dark: p.dark, line: p.line });

// ---------------------------------------------------------------- 頭（肌）
// 頭は横 24・縦 22 の大きな楕円（線込み）。中心 C は基準点（あごの下）から (+1, -11)。顔・髪・帽子はこの C に合わせる（Unity の brow に当たる）
export const HEAD = { rx: 11.5, ry: 10.5, up: 11 };
export const headC = (f) => ({ x: f.head.x + 1, y: f.head.y - HEAD.up });

function drawHead(buf, f, skin) {
  const C = headC(f);
  const m = new Mask().ellipse(C.x, C.y, HEAD.rx, HEAD.ry);
  if (f.view !== 'back') m.ellipse(C.x + 3, C.y + 4, 8.5, 6.3); // ほおのふくらみ（前の下が少し出る）
  paintMask(buf, m, skin, { rimL: 1, rimD: 2 });
  if (f.view === 'back') {
    for (const s of [-1, 1]) paintMask(buf, new Mask().ellipse(C.x + s * 12, C.y + 2, 1.6, 2.4), skin, { rimL: 0, rimD: 1 });
    return;
  }
  paintMask(buf, new Mask().ellipse(C.x - 3, C.y + 3, 2, 2.6), skin, { rimL: 1, rimD: 1 }); // 耳
  buf.px(C.x - 3, C.y + 3, skin.dark);
}

// ---------------------------------------------------------------- 顔（目・口）
// 手前の目は 4×7、奥の目は 3×6（遠近）。縦長の大きな目・太い上まつげ・左上に白い光
export const FACE_PAL = () => ({ e: COLORS.eye.line, w: COLORS.eye.white, i: COLORS.eye.iris, j: COLORS.eye.iris2, r: '#ff6060', b: '#80c8ff', p: '#ff9ab4', y: '#fff060', m: COLORS.eye.mouth });
const EYE_FRONT = ['.eee', 'eeee', 'ewie', 'ewie', 'eiie', 'ejje', '.ee.'];
const EYE_BACK = ['ee.', 'eee', 'wie', 'iie', 'jje', '.e.'];
/** 顔を描く共通の手順（美容院の顔・感情表現の顔も使う）。front は手前の目（左上 = C+(5,-2)）、back は奥の目（C+(-1,-1)）、mouth は C からの [dx,dy,色] */
export function drawEyes(buf, f, front, back, mouth, extra) {
  if (f.view === 'back') return;
  const C = headC(f);
  const pal = FACE_PAL();
  if (front) buf.sprite(front, C.x + 5, C.y - 2, pal);
  if (back) buf.sprite(back, C.x - 1, C.y - 1, pal);
  for (const [dx, dy, c] of mouth || [[6, 7, COLORS.eye.mouth], [7, 7, COLORS.eye.mouth]]) buf.px(C.x + dx, C.y + dy, c);
  buf.px(C.x + 9, C.y + 5, COLORS.eye.blush); buf.px(C.x + 10, C.y + 5, COLORS.eye.blush); // ほお
  if (extra) extra(buf, C);
}
function drawFace(buf, f) { drawEyes(buf, f, EYE_FRONT, EYE_BACK); }

// ---------------------------------------------------------------- 髪（短いはね毛。オリジナル）
// 頭をおおう帽子の形から、顔の前をぎざぎざの前髪の形で切り取る。うしろと上に 3 本のはね
/** 髪のかたまり（頭の上をおおう形）。big で少し大きく */
export function hairCap(C, big = 0) {
  return new Mask().ellipse(C.x - 1, C.y - 3.5, 12.6 + big, 9.8 + big);
}
/** 顔の見える所（前髪の下）。tips: 前髪の先の y（C からの差）を左から 4 つ */
export function faceCut(C, tips = [-1, 0, -1, -3]) {
  const [a, b, c, d] = tips;
  return new Mask().poly([[C.x - 2, C.y + 14], [C.x - 2, C.y + 4], [C.x, C.y - 3], [C.x + 2, C.y + a], [C.x + 4, C.y - 5], [C.x + 6, C.y + b],
    [C.x + 8, C.y - 5], [C.x + 10, C.y + c], [C.x + 12, C.y - 6], [C.x + 13, C.y + d], [C.x + 16, C.y - 6], [C.x + 16, C.y + 14]]);
}
/** 髪の筋（暗い色の短い線）と光の帯 */
export function hairShine(buf, C, h) {
  for (const [x, y] of [[-6, -9], [-5, -10], [-4, -10], [-3, -11], [-2, -11]]) buf.px(C.x + x, C.y + y, h.light);
  for (const [x, y] of [[3, -6], [3, -5], [7, -7], [7, -6], [-6, -2], [-7, -1]]) buf.px(C.x + x, C.y + y, h.dark);
}
function drawHairFront(buf, f, h) {
  const C = headC(f);
  if (f.view === 'back') { drawHairBackView(buf, C, h, (m) => m.poly([[C.x - 6, C.y - 11], [C.x - 3, C.y - 18], [C.x + 1, C.y - 12]]).poly([[C.x + 3, C.y - 12], [C.x + 9, C.y - 16], [C.x + 8, C.y - 8]]).poly([[C.x - 11, C.y - 6], [C.x - 17, C.y - 3], [C.x - 12, C.y + 1]])); return; }
  const m = hairCap(C);
  m.ellipse(C.x - 8, C.y + 2, 4.5, 6); // えり足
  m.poly([[C.x - 11, C.y - 8], [C.x - 18, C.y - 4], [C.x - 11, C.y + 0]]);   // うしろのはね
  m.poly([[C.x - 12, C.y + 1], [C.x - 15, C.y + 7], [C.x - 8, C.y + 6]]);    // えり足のはね
  m.poly([[C.x - 6, C.y - 11], [C.x - 4, C.y - 18], [C.x + 1, C.y - 12]]);   // てっぺんのはね
  m.poly([[C.x + 4, C.y - 11], [C.x + 12, C.y - 13], [C.x + 9, C.y - 6]]);   // 前のはね
  m.sub(faceCut(C));
  m.sub(new Mask().ellipse(C.x - 3, C.y + 3, 2.4, 3)); // 耳を見せる
  paintMask(buf, m, h, { rimL: 2, rimD: 2 });
  hairShine(buf, C, h);
}
// 背中から見た頭（縄・はしご）: 髪が頭を全部おおう
export function drawHairBackView(buf, C, h, extra) {
  const m = new Mask().ellipse(C.x, C.y - 2, 12.8, 11.5);
  m.poly([[C.x - 9, C.y + 6], [C.x - 6, C.y + 12], [C.x - 3, C.y + 7], [C.x, C.y + 12], [C.x + 3, C.y + 7], [C.x + 6, C.y + 12], [C.x + 9, C.y + 6]]);
  if (extra) extra(m);
  paintMask(buf, m, h, { rimL: 2, rimD: 2 });
  for (const [x, y] of [[-5, -10], [-4, -11], [-3, -11], [-2, -12]]) buf.px(C.x + x, C.y + y, h.light);
  for (const [x, y] of [[0, -4], [0, -3], [0, -2], [-5, 2], [5, 2]]) buf.px(C.x + x, C.y + y, h.dark);
}
function drawHairBack() { /* 短い髪は前の層だけで描く */ }

// ---------------------------------------------------------------- 体（肌）: 腕・脚・胴
function drawArm(buf, arm, skin, back) {
  const p = back ? darker(skin) : skin;
  const m = new Mask();
  if (arm.e) { m.line(arm.s, arm.e, 1.6); m.line(arm.e, arm.h, 1.6); } else m.line(arm.s, arm.h, 1.6);
  m.ellipse(arm.h.x, arm.h.y, 2.2, 2.2); // にぎった手
  paintMask(buf, m, p, { rimL: 1, rimD: 1 });
}
function drawLeg(buf, leg, skin, back) {
  paintMask(buf, new Mask().line(leg.h, leg.f, 2.1), back ? darker(skin) : skin, { rimL: 1, rimD: 1 });
}
function drawTorsoSkin(buf, f, skin) {
  const m = new Mask().line({ x: f.neck.x, y: f.neck.y + (f.prone ? 2 : 3) }, f.hip, 4.2);
  m.line(f.neck, { x: f.neck.x, y: f.neck.y + 3 }, 1.6); // 首
  paintMask(buf, m, skin, { rimL: 1, rimD: 2 });
}

// ---------------------------------------------------------------- 上着（半そで。えりと、すその線）
function sleeveEnd(arm, k = 0.5) {
  if (arm.e) return { x: arm.s.x + (arm.e.x - arm.s.x) * 0.7, y: arm.s.y + (arm.e.y - arm.s.y) * 0.7 };
  return { x: arm.s.x + (arm.h.x - arm.s.x) * k, y: arm.s.y + (arm.h.y - arm.s.y) * k };
}
export function shirtMask(f, wide = 0) {
  if (f.prone) return new Mask().line(f.neck, f.hip, 4.6 + wide);
  const n = f.neck, h = f.hip;
  return new Mask().poly([[n.x - 4.6 - wide, n.y + 1.5], [n.x + 4.6 + wide, n.y + 1.5], [h.x + 5.8 + wide, h.y + 1.6], [h.x - 5.8 - wide, h.y + 1.6]])
    .ellipse(n.x, n.y + 3.5, 5 + wide, 2.5);
}
function drawShirt(buf, f, c) {
  paintMask(buf, shirtMask(f), c, { rimL: 1, rimD: 2 });
  if (f.prone) return;
  // すその線
  for (let x = -5; x <= 5; x++) buf.px(f.hip.x + x, f.hip.y + 1, c.dark);
  if (f.view === 'side') { // えり（明るい V）
    buf.px(f.neck.x + 1, f.neck.y + 2, c.light); buf.px(f.neck.x + 2, f.neck.y + 3, c.light); buf.px(f.neck.x + 3, f.neck.y + 2, c.light);
    buf.px(f.neck.x + 2, f.neck.y + 2, c.line);
  } else { for (let x = -2; x <= 2; x++) buf.px(f.neck.x + x, f.neck.y + 2, c.dark); }
}
function drawSleeve(buf, arm, c, back) {
  const s = { x: arm.s.x, y: arm.s.y + 1 };
  paintMask(buf, new Mask().line(s, sleeveEnd({ ...arm, s }), 2.5), back ? darker(c) : c, { rimL: 1, rimD: 1 });
}

// ---------------------------------------------------------------- 下衣（長ズボン。ベルトつき）
function drawPants(buf, f, c) {
  const legEnd = (leg) => {
    const dx = leg.f.x - leg.h.x, dy = leg.f.y - leg.h.y, L = Math.hypot(dx, dy) || 1;
    return { x: leg.f.x - dx / L * 1, y: leg.f.y - dy / L * 1 };
  };
  paintMask(buf, new Mask().line(f.legB.h, legEnd(f.legB), 2.6), darker(c), { rimL: 1, rimD: 1 });
  const m = new Mask().line(f.legF.h, legEnd(f.legF), 2.6);
  if (f.prone) m.line({ x: f.hip.x + 2, y: f.hip.y }, { x: f.hip.x - 2, y: f.hip.y }, 3.6);
  else m.rect(f.hip.x - 5, f.hip.y, 11, 3);
  paintMask(buf, m, c, { rimL: 1, rimD: 1 });
  if (!f.prone) { // ベルト
    for (let x = -5; x <= 5; x++) buf.px(f.hip.x + x, f.hip.y, c.line);
    if (f.view === 'side') { buf.px(f.hip.x + 3, f.hip.y, '#e8c050'); buf.px(f.hip.x + 4, f.hip.y, '#e8c050'); }
  }
}

// ---------------------------------------------------------------- 靴（丸くて大きめの布靴）
const SHOE_SIDE = ['.OOOO...', 'OllmmOO.', 'OlmmmmmO', 'OmmmmmdO', '.OOOOOO.'];
const SHOE_LIFT = ['.OOO..OO', 'OllmOOdO', 'OmmmmdO.', 'OmmmdO..', '.OOOO...'];
const SHOE_BACK = ['.OOOO.', 'OlmmmO', 'OmmmdO', '.OOOO.'];
function drawShoe(buf, f, leg, c) {
  const pal = { O: c.line, l: c.light, m: c.mid, d: c.dark };
  if (f.view === 'back') { buf.sprite(SHOE_BACK, leg.f.x - 3, leg.f.y, pal); return; }
  if (f.prone) { buf.sprite(['.OOO.', 'OlmmO', 'OmmdO', '.OOO.'], leg.f.x - 4, leg.f.y - 2, pal); return; }
  buf.sprite(leg.lift ? SHOE_LIFT : SHOE_SIDE, leg.f.x - 3, leg.f.y - 1, pal);
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
  face_basic: { slot: 'face', draws: [{ layer: 'face', z: 0, fn: (b, f) => drawFace(b, f) }] },
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
