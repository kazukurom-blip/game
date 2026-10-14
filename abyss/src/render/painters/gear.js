// 装備の絵: 武器 12 種（立てて描く。握りが基準点）・副手 5 種・兜 4 スタイル・重ね着の部品・ユニーク専用の絵。
// 武器の絵は「色の組（pal）」を受け取るので、アイコンやユニーク（色違い・光）でも同じ形を使う。

import { BASE } from '../../data/items.js';
import { UNIQUES, MYTHICS, SETS } from '../../data/uniques.js';
import { TAU, rgba, shade, mix, lg, rg, roundRect, ellipse, blob, taper, poly, fillStroke, stroke, line, outlined, glow, metal, hash, rng, star } from './util.js';
import { heroRig, drawRig, REST_POSE, HERO_W, HERO_H } from './heroes.js';

const LINE = 'rgba(12,8,16,0.92)';
export const WEAPON_KINDS_ALL = ['sword', 'axe', 'mace', 'greatsword', 'bow', 'crossbow', 'staff', 'wand', 'scythe', 'rod', 'dagger', 'claw'];
export const OFFHAND_KINDS_ALL = ['shield', 'quiver', 'orb', 'grimoire', 'offblade'];

// ---------------- 色の組
export const BASE_PAL = { blade: '#c7ced8', guard: '#b48a3e', grip: '#5a3a22', wood: '#6b4424', gem: '#c0392b', glow: null, cloth: '#7a2a22', bone: '#e2d9c2', leather: '#6e4428' };
const THEMES = [
  { key: 'fire', re: /炎|火|焔|紅|灼|焦|燃|陽|熾/, blade: '#ffb27a', guard: '#5a1c10', grip: '#2a0c08', wood: '#3a140c', gem: '#ff5a1a', glow: '#ff7a2a', cloth: '#a0200a' },
  { key: 'cold', re: /氷|凍|雪|霜|冬|凛|氷河|白銀/, blade: '#c4f0ff', guard: '#2f5f96', grip: '#1c2c48', wood: '#3a5a7a', gem: '#7fd8ff', glow: '#6ad8ff', cloth: '#2a5a9a' },
  { key: 'lightning', re: /雷|電|嵐|轟|稲妻|閃/, blade: '#fff4b8', guard: '#6a5a1c', grip: '#2a2410', wood: '#4a3c1a', gem: '#ffe45a', glow: '#fff07a', cloth: '#8a7a20' },
  { key: 'poison', re: /毒|腐|蝕|瘴|蛇|沼/, blade: '#b6ee8a', guard: '#2a4a1c', grip: '#14240e', wood: '#2a3a1a', gem: '#7cff5a', glow: '#8cff4a', cloth: '#3a6a20' },
  { key: 'void', re: /虚|影|闇|冥|夜|深淵|月|黒/, blade: '#6a4a8e', guard: '#1a1024', grip: '#100a16', wood: '#24182e', gem: '#c77dff', glow: '#c68cff', cloth: '#4a2070' },
  { key: 'holy', re: /聖|光|天|神|祈|誓|白|金/, blade: '#fff8e2', guard: '#e2b850', grip: '#6a4a20', wood: '#c8a060', gem: '#fff2b0', glow: '#ffe080', cloth: '#e8d8a0' },
  { key: 'blood', re: /血|紅蓮|鮮|獣|狂|鬼/, blade: '#b02028', guard: '#2a0a0c', grip: '#1a0608', wood: '#3a1010', gem: '#ff2a40', glow: '#ff3050', cloth: '#7a0a14' },
  { key: 'iron', re: /鉄|鋼|岩|山|王|竜|龍/, blade: '#4a4c58', guard: '#c9a43a', grip: '#2a1a10', wood: '#3a2a1a', gem: '#ff9a2e', glow: '#ff9a2e', cloth: '#5a1a14' },
];
/** ユニークの色の組を決める（名前の字から属性を推し量る。無ければ ID のハッシュ） */
export function uniquePal(def, id) {
  const name = `${def?.name || ''}${def?.flavor || ''}`;
  let th = THEMES.find((t) => t.re.test(def?.name || '')) || THEMES.find((t) => t.re.test(name));
  if (!th) th = THEMES[hash(id || name) % THEMES.length];
  const mythic = !!def?.greater || def?.rarity === 'mythic' || /^m_|mythic/.test(id || '');
  return { ...BASE_PAL, ...th, mythic, ornate: true };
}

// ---------------- 武器（立てた形。gx,gy = 握り）
export function drawWeapon(ctx, kind, gx, gy, pal = BASE_PAL, opt = {}) {
  const P = { ...BASE_PAL, ...pal };
  ctx.save();
  ctx.translate(gx, gy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const fn = WEAPON_DRAW[kind] || WEAPON_DRAW.sword;
  fn(ctx, P, opt);
  ctx.restore();
}
/** 剣の刃（下が根元 y0、上が切っ先 y1） */
function blade(ctx, P, y0, y1, w0, w1 = 0, opt = {}) {
  const L = y0 - y1;
  const path = () => { ctx.beginPath(); ctx.moveTo(-w0, y0); ctx.lineTo(-w1 - (opt.curve || 0), y1 + L * 0.12); ctx.quadraticCurveTo(0, y1 - 2, 0, y1); ctx.quadraticCurveTo(w1 + 1, y1 + L * 0.06, w1 + 0.5, y1 + L * 0.12); ctx.lineTo(w0, y0); ctx.closePath(); };
  path(); fillStroke(ctx, lg(ctx, -w0, 0, w0, 0, [[0, shade(P.blade, -0.35)], [0.48, shade(P.blade, 0.25)], [0.52, shade(P.blade, -0.05)], [1, shade(P.blade, 0.45)]]), LINE, 1.3);
  // 樋（中央の溝）と刃の光
  ctx.strokeStyle = rgba(shade(P.blade, -0.5), 0.6); ctx.lineWidth = Math.max(0.8, w0 * 0.25); line(ctx, 0, y0 - 3, 0, y1 + L * 0.3); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.8; line(ctx, w0 - 0.8, y0 - 2, w1 + 0.3, y1 + L * 0.14); ctx.stroke();
  if (P.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(P.glow, 0.5); ctx.lineWidth = 1.2; line(ctx, 0, y0 - 4, 0, y1 + L * 0.25); ctx.stroke(); ctx.restore(); }
  if (P.ornate) {
    // 刻まれた文字のような模様
    ctx.strokeStyle = rgba(P.gem, 0.85); ctx.lineWidth = 0.7;
    for (let y = y0 - 8; y > y1 + L * 0.35; y -= 7) { ctx.beginPath(); ctx.moveTo(-1.5, y); ctx.lineTo(0, y - 3); ctx.lineTo(1.5, y); ctx.stroke(); }
  }
}
function grip(ctx, P, y0, y1, w = 3.2) {
  roundRect(ctx, -w, y0, w * 2, y1 - y0, w * 0.6); fillStroke(ctx, lg(ctx, -w, 0, w, 0, [[0, shade(P.grip, -0.3)], [0.5, shade(P.grip, 0.25)], [1, shade(P.grip, -0.4)]]), LINE, 1.1);
  ctx.strokeStyle = rgba(shade(P.grip, -0.6), 0.9); ctx.lineWidth = 0.9;
  for (let y = y0 + 2; y < y1 - 1; y += 2.6) { line(ctx, -w, y, w, y + 1.6); ctx.stroke(); }
}
function pommel(ctx, P, y, r = 3.6) {
  ellipse(ctx, 0, y, r, r * 0.9); fillStroke(ctx, metal(ctx, r, y - r, -r, y + r, P.guard), LINE, 1);
  ctx.fillStyle = P.gem; ellipse(ctx, 0.4, y - 0.3, r * 0.45, r * 0.45); ctx.fill();
}
function guard(ctx, P, y, half, h = 4.5, curl = true) {
  const path = () => { ctx.beginPath(); ctx.moveTo(-half, y - (curl ? 3 : 0)); ctx.quadraticCurveTo(-half * 0.5, y - h * 0.3, 0, y - h * 0.5); ctx.quadraticCurveTo(half * 0.5, y - h * 0.3, half, y - (curl ? 3 : 0)); ctx.lineTo(half * 0.9, y + h * 0.5); ctx.quadraticCurveTo(0, y + h * 0.9, -half * 0.9, y + h * 0.5); ctx.closePath(); };
  path(); fillStroke(ctx, metal(ctx, half, y - h, -half, y + h, P.guard), LINE, 1.1);
  ctx.fillStyle = P.gem; poly(ctx, [[0, y - 2.6], [2.4, y], [0, y + 2.6], [-2.4, y]]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-0.6, y - 1.6, 1, 1);
}
function shaft(ctx, P, y0, y1, w = 3, col = P.wood) {
  roundRect(ctx, -w, y1, w * 2, y0 - y1, w); fillStroke(ctx, lg(ctx, -w, 0, w, 0, [[0, shade(col, -0.35)], [0.45, shade(col, 0.3)], [1, shade(col, -0.45)]]), LINE, 1.1);
  ctx.strokeStyle = rgba(shade(col, -0.6), 0.5); ctx.lineWidth = 0.6;
  for (let y = y1 + 6; y < y0 - 4; y += 9) { line(ctx, -w * 0.6, y, -w * 0.2, y + 4); ctx.stroke(); }
}
function band(ctx, P, y, w = 3.8) { roundRect(ctx, -w, y - 1.8, w * 2, 3.6, 1); fillStroke(ctx, metal(ctx, w, y, -w, y, P.guard), LINE, 0.8); }
function gemGlow(ctx, x, y, r, col) { glow(ctx, x, y, r * 2.6, col, 0.7); ctx.fillStyle = lg(ctx, x - r, y - r, x + r, y + r, [[0, '#ffffff'], [0.35, shade(col, 0.4)], [1, shade(col, -0.35)]]); ellipse(ctx, x, y, r, r); ctx.fill(); stroke(ctx, LINE, 1); ctx.fillStyle = '#fff'; ellipse(ctx, x - r * 0.35, y - r * 0.35, r * 0.25, r * 0.25); ctx.fill(); }

const WEAPON_DRAW = {
  sword(ctx, P) {
    blade(ctx, P, -9, -96, 4.6, 1.2);
    guard(ctx, P, -8, 14);
    grip(ctx, P, -6, 10, 2.9);
    pommel(ctx, P, 12.5);
  },
  greatsword(ctx, P) {
    blade(ctx, P, -15, -117, 7, 2);
    // 刃の根元の段（リカッソ）
    roundRect(ctx, -5, -22, 10, 8, 1.5); fillStroke(ctx, metal(ctx, 5, -22, -5, -14, P.blade), LINE, 1);
    guard(ctx, P, -13, 21, 6);
    ctx.fillStyle = P.cloth; roundRect(ctx, -3.6, -11, 7.2, 5, 1); ctx.fill();
    grip(ctx, P, -11, 15, 3.4);
    pommel(ctx, P, 18, 4.6);
  },
  dagger(ctx, P) {
    const pth = () => { ctx.beginPath(); ctx.moveTo(-3.6, -7); ctx.quadraticCurveTo(-4.4, -30, 2.5, -56); ctx.quadraticCurveTo(4.6, -30, 3.6, -7); ctx.closePath(); };
    pth(); fillStroke(ctx, lg(ctx, -4, 0, 4, 0, [[0, shade(P.blade, -0.35)], [0.5, shade(P.blade, 0.3)], [1, shade(P.blade, 0.45)]]), LINE, 1.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(2.6, -9); ctx.quadraticCurveTo(3.6, -30, 2.2, -50); ctx.stroke();
    guard(ctx, P, -6, 9, 3.6, false);
    grip(ctx, P, -4, 8, 2.5);
    pommel(ctx, P, 10, 2.8);
  },
  axe(ctx, P) {
    shaft(ctx, P, 14, -92, 3.1);
    band(ctx, P, -8); band(ctx, P, 8);
    // 刃（前＝右側）
    const head = () => { ctx.beginPath(); ctx.moveTo(2, -86); ctx.quadraticCurveTo(14, -90, 24, -104); ctx.quadraticCurveTo(34, -82, 26, -56); ctx.quadraticCurveTo(14, -64, 2, -66); ctx.closePath(); };
    head(); fillStroke(ctx, metal(ctx, 30, -104, 2, -56, P.blade), LINE, 1.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(24.5, -101); ctx.quadraticCurveTo(32, -82, 26.5, -59); ctx.stroke();
    // 後ろの突起
    poly(ctx, [[-2, -84], [-12, -80], [-16, -76], [-2, -70]]); fillStroke(ctx, metal(ctx, -2, -84, -16, -70, P.blade), LINE, 1.1);
    roundRect(ctx, -4.5, -90, 9, 26, 2); fillStroke(ctx, metal(ctx, 4, -90, -4, -64, P.guard), LINE, 1);
    ctx.fillStyle = P.gem; ellipse(ctx, 0, -77, 2, 2); ctx.fill();
    poly(ctx, [[-1.6, -92], [0, -100], [1.6, -92]]); fillStroke(ctx, P.blade, LINE, 0.8);
  },
  mace(ctx, P) {
    shaft(ctx, P, 14, -70, 3, shade(P.guard, -0.3));
    grip(ctx, P, -6, 12, 3.4);
    band(ctx, P, -9);
    // 頭（出縁つき）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU; const sx = Math.cos(a) * 11; const sy = -86 + Math.sin(a) * 13;
      poly(ctx, [[sx * 0.45, -86 + (sy + 86) * 0.45 - 2], [sx * 1.25, sy], [sx * 0.45, -86 + (sy + 86) * 0.45 + 2]]);
      fillStroke(ctx, metal(ctx, sx, sy - 6, -sx, sy + 6, P.blade), LINE, 1);
    }
    ellipse(ctx, 0, -86, 9.5, 11.5); fillStroke(ctx, rg(ctx, -3, -91, 1, 13, [[0, shade(P.blade, 0.6)], [0.5, P.blade], [1, shade(P.blade, -0.5)]]), LINE, 1.3);
    poly(ctx, [[-2, -97], [0, -108], [2, -97]]); fillStroke(ctx, P.blade, LINE, 0.9);
    ctx.fillStyle = P.gem; ellipse(ctx, 0, -86, 3, 3); ctx.fill();
  },
  bow(ctx, P, opt) {
    // 中央が握り（paperdoll は弓だけ中心で持つ）
    const R = 70; const a = 1.0; const cx = -R + 6;
    const limb = () => { ctx.beginPath(); ctx.arc(cx, 0, R, -a, a); };
    ctx.strokeStyle = LINE; ctx.lineWidth = 7.5; limb(); ctx.stroke();
    ctx.strokeStyle = lg(ctx, 0, -60, 0, 60, [[0, shade(P.wood, 0.3)], [0.5, P.wood], [1, shade(P.wood, -0.3)]]); ctx.lineWidth = 5; limb(); ctx.stroke();
    ctx.strokeStyle = rgba(shade(P.wood, 0.55), 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, 0, R + 1.4, -a * 0.92, a * 0.92); ctx.stroke();
    // 先の反り
    for (const s of [-1, 1]) {
      const tx = cx + Math.cos(a) * R; const ty = s * Math.sin(a) * R;
      taper(ctx, [[tx, ty], [tx + 5, ty + s * 6], [tx + 9, ty + s * 8]], 4.5, 2); fillStroke(ctx, shade(P.wood, -0.1), LINE, 1);
      ctx.fillStyle = P.guard; ellipse(ctx, tx, ty, 2.2, 2.2); ctx.fill();
    }
    if (!opt.noString) { ctx.strokeStyle = 'rgba(235,228,210,0.95)'; ctx.lineWidth = 1; line(ctx, cx + Math.cos(a) * R, -Math.sin(a) * R, cx + Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
    // 握り
    roundRect(ctx, 2.5, -9, 7, 18, 2.5); fillStroke(ctx, lg(ctx, 2, 0, 10, 0, [[0, shade(P.grip, -0.2)], [1, shade(P.grip, 0.3)]]), LINE, 1);
    ctx.fillStyle = P.gem; ellipse(ctx, 6, -12, 1.8, 1.8); ctx.fill();
    if (P.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(P.glow, 0.45); ctx.lineWidth = 2; limb(); ctx.stroke(); ctx.restore(); }
  },
  crossbow(ctx, P, opt) {
    // 銃床（縦）
    const stock = () => { ctx.beginPath(); ctx.moveTo(-4, 20); ctx.lineTo(4, 20); ctx.lineTo(4.5, -2); ctx.lineTo(3.4, -66); ctx.lineTo(-3.4, -66); ctx.lineTo(-4.5, -2); ctx.closePath(); };
    stock(); fillStroke(ctx, lg(ctx, -5, 0, 5, 0, [[0, shade(P.wood, -0.4)], [0.5, shade(P.wood, 0.3)], [1, shade(P.wood, -0.3)]]), LINE, 1.2);
    roundRect(ctx, -5.5, 12, 11, 14, 3); fillStroke(ctx, shade(P.wood, -0.2), LINE, 1);
    roundRect(ctx, -2.5, -60, 5, 52, 1.5); fillStroke(ctx, metal(ctx, 3, -60, -3, -8, P.blade), LINE, 0.9);
    // 引き金
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -2); ctx.quadraticCurveTo(9, 2, 6, 8); ctx.stroke();
    // 弓（横）
    const prod = () => { ctx.beginPath(); ctx.moveTo(-30, -52); ctx.quadraticCurveTo(0, -72, 30, -52); };
    ctx.strokeStyle = LINE; ctx.lineWidth = 6.5; prod(); ctx.stroke();
    ctx.strokeStyle = metal(ctx, -30, -60, 30, -60, P.blade); ctx.lineWidth = 4; prod(); ctx.stroke();
    if (!opt.noString) { ctx.strokeStyle = 'rgba(235,228,210,0.95)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-30, -52); ctx.lineTo(0, -40); ctx.lineTo(30, -52); ctx.stroke(); }
    // 矢
    roundRect(ctx, -1, -84, 2, 44, 1); fillStroke(ctx, '#7a5232', null);
    poly(ctx, [[-3, -82], [0, -90], [3, -82]]); fillStroke(ctx, P.blade, LINE, 0.8);
    roundRect(ctx, -6, -66, 12, 6, 2); fillStroke(ctx, metal(ctx, 6, -66, -6, -60, P.guard), LINE, 0.9);
    ctx.fillStyle = P.gem; ellipse(ctx, 0, -63, 1.8, 1.8); ctx.fill();
  },
  staff(ctx, P) {
    shaft(ctx, P, 24, -88, 3);
    band(ctx, P, -36); band(ctx, P, 8); grip(ctx, P, -8, 6, 3.4);
    // 頭: ねじれた枝に抱かれた結晶
    ctx.strokeStyle = LINE; ctx.lineWidth = 5.5;
    const prong = (s) => { ctx.beginPath(); ctx.moveTo(0, -86); ctx.bezierCurveTo(s * 14, -92, s * 13, -108, s * 3, -118); };
    for (const s of [-1, 1]) { prong(s); ctx.stroke(); }
    ctx.strokeStyle = shade(P.wood, 0.15); ctx.lineWidth = 3.2; for (const s of [-1, 1]) { prong(s); ctx.stroke(); }
    const gc = P.glow || '#7fd8ff';
    glow(ctx, 0, -104, 22, gc, 0.55);
    poly(ctx, [[0, -119], [7, -106], [0, -92], [-7, -106]]); fillStroke(ctx, lg(ctx, -7, -119, 7, -92, [[0, '#ffffff'], [0.4, shade(gc, 0.3)], [1, shade(gc, -0.45)]]), LINE, 1.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; line(ctx, 0, -117, 0, -94); ctx.stroke();
    ctx.fillStyle = P.cloth; taper(ctx, [[-3, -82], [-8, -72], [-6, -60]], 4, 1.5); ctx.fill();
  },
  wand(ctx, P) {
    // 短い杖（ねじれ）
    const tip = -62;
    shaft(ctx, P, 12, tip + 8, 2.6, shade(P.wood, -0.1));
    ctx.strokeStyle = metal(ctx, -3, 0, 3, 0, P.guard); ctx.lineWidth = 1.2;
    for (let y = 8; y > tip + 14; y -= 6) { ctx.beginPath(); ctx.moveTo(-2.6, y); ctx.quadraticCurveTo(0, y - 4, 2.6, y - 6); ctx.stroke(); }
    grip(ctx, P, -6, 10, 3);
    band(ctx, P, tip + 10, 4);
    gemGlow(ctx, 0, tip + 2, 5.5, P.glow || P.gem);
    for (const s of [-1, 1]) { taper(ctx, [[s * 3, tip + 8], [s * 6.5, tip + 1], [s * 3, tip - 5]], 2.2, 0.6); fillStroke(ctx, P.guard, LINE, 0.7); }
  },
  scythe(ctx, P) {
    // 長い柄の先に、前へ反る刃
    ctx.save(); ctx.rotate(0.06);
    shaft(ctx, P, 22, -112, 2.9, shade(P.wood, -0.25));
    grip(ctx, P, -8, 6, 3.3); band(ctx, P, -46);
    const bl = () => { ctx.beginPath(); ctx.moveTo(-2, -104); ctx.bezierCurveTo(12, -120, 38, -118, 50, -94); ctx.bezierCurveTo(36, -106, 18, -105, 2, -94); ctx.closePath(); };
    bl(); fillStroke(ctx, lg(ctx, 0, -122, 0, -94, [[0, shade(P.blade, 0.5)], [0.5, P.blade], [1, shade(P.blade, -0.5)]]), LINE, 1.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4, -95.5); ctx.bezierCurveTo(18, -105, 36, -106, 48, -95.5); ctx.stroke();
    roundRect(ctx, -5, -110, 10, 14, 2); fillStroke(ctx, metal(ctx, 5, -110, -5, -96, P.guard), LINE, 1);
    ctx.fillStyle = P.gem; ellipse(ctx, 0, -103, 2.2, 2.2); ctx.fill();
    if (P.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; bl(); ctx.strokeStyle = rgba(P.glow, 0.45); ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
    ctx.restore();
  },
  rod(ctx, P) {
    // 骨の杖: 背骨のような柄と頭蓋
    const bone = P.bone;
    shaft(ctx, P, 20, -84, 2.8, shade(bone, -0.15));
    for (let y = 14; y > -80; y -= 9) { ellipse(ctx, 0, y, 4.4, 2.4); fillStroke(ctx, lg(ctx, -4, y, 4, y, [[0, shade(bone, -0.3)], [0.5, shade(bone, 0.3)], [1, shade(bone, -0.4)]]), LINE, 0.8); }
    grip(ctx, P, -6, 8, 3.2);
    const gc = P.glow || '#b47cff';
    glow(ctx, 0, -98, 20, gc, 0.45);
    // 頭蓋
    blob(ctx, [[0, -112], [9, -108], [10.5, -98], [7, -90], [4, -86], [-4, -86], [-7, -90], [-10.5, -98], [-9, -108]], true, 0.6);
    fillStroke(ctx, lg(ctx, -10, -112, 10, -86, [[0, shade(bone, 0.35)], [1, shade(bone, -0.35)]]), LINE, 1.3);
    ctx.fillStyle = '#140c1c'; ellipse(ctx, -4, -99, 3, 3.4); ctx.fill(); ellipse(ctx, 4, -99, 3, 3.4); ctx.fill();
    ctx.fillStyle = gc; ellipse(ctx, -4, -98.5, 1.3, 1.5); ctx.fill(); ellipse(ctx, 4, -98.5, 1.3, 1.5); ctx.fill();
    ctx.fillStyle = '#140c1c'; poly(ctx, [[0, -95], [1.5, -92], [-1.5, -92]]); ctx.fill();
    ctx.strokeStyle = shade(bone, -0.5); ctx.lineWidth = 0.7; for (let i = -2; i <= 2; i++) { line(ctx, i * 1.6, -89, i * 1.6, -86); ctx.stroke(); }
    // 角
    for (const s of [-1, 1]) { taper(ctx, [[s * 8, -106], [s * 15, -112], [s * 16, -122]], 3.6, 0.6); fillStroke(ctx, shade(bone, -0.1), LINE, 0.9); }
  },
  claw(ctx, P) {
    // 拳にはめる 3 本の爪
    roundRect(ctx, -7, -14, 14, 18, 3); fillStroke(ctx, metal(ctx, 7, -14, -7, 4, P.guard), LINE, 1.1);
    grip(ctx, P, -2, 10, 2.6);
    for (let i = -1; i <= 1; i++) {
      const x = i * 4.2;
      const c = () => { ctx.beginPath(); ctx.moveTo(x - 2, -13); ctx.quadraticCurveTo(x - 1, -40, x + 12, -62 + Math.abs(i) * 6); ctx.quadraticCurveTo(x + 3, -38, x + 2.4, -13); ctx.closePath(); };
      c(); fillStroke(ctx, lg(ctx, x - 2, 0, x + 6, 0, [[0, shade(P.blade, -0.3)], [1, shade(P.blade, 0.45)]]), LINE, 1.1);
    }
    ctx.fillStyle = P.gem; ellipse(ctx, 0, -6, 2.4, 2.4); ctx.fill();
  },
  offblade(ctx, P) {
    // 副刀（逆手でも見える短めの刀）
    const pth = () => { ctx.beginPath(); ctx.moveTo(-3.4, -7); ctx.quadraticCurveTo(-2, -40, 5, -66); ctx.quadraticCurveTo(4.8, -38, 3.4, -7); ctx.closePath(); };
    pth(); fillStroke(ctx, lg(ctx, -4, 0, 5, 0, [[0, shade(P.blade, -0.4)], [0.6, shade(P.blade, 0.3)], [1, shade(P.blade, 0.5)]]), LINE, 1.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(2.4, -10); ctx.quadraticCurveTo(3.6, -40, 4.4, -60); ctx.stroke();
    ellipse(ctx, 0, -6, 6, 2.6); fillStroke(ctx, metal(ctx, 6, -8, -6, -4, P.guard), LINE, 1);
    grip(ctx, P, -4, 9, 2.5);
    pommel(ctx, P, 11, 2.6);
  },
};

// ---------------- 副手
export function drawOffhand(ctx, kind, cx, cy, pal = BASE_PAL, opt = {}) {
  const P = { ...BASE_PAL, ...pal };
  ctx.save(); ctx.translate(cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (kind) {
    case 'shield': {
      const sh = () => { ctx.beginPath(); ctx.moveTo(-28, -38); ctx.quadraticCurveTo(0, -46, 28, -38); ctx.lineTo(28, -6); ctx.quadraticCurveTo(26, 26, 0, 44); ctx.quadraticCurveTo(-26, 26, -28, -6); ctx.closePath(); };
      sh(); fillStroke(ctx, metal(ctx, 28, -40, -28, 44, P.guard, 0.8), LINE, 1.8);
      ctx.save(); ctx.scale(0.84, 0.84); sh(); ctx.restore();
      ctx.fillStyle = lg(ctx, 20, -36, -20, 36, [[0, shade(P.cloth, 0.25)], [1, shade(P.cloth, -0.45)]]); ctx.fill(); stroke(ctx, rgba('#000', 0.5), 1);
      // 紋（剣と翼）
      ctx.save(); ctx.scale(0.84, 0.84);
      ctx.fillStyle = rgba(shade(P.guard, 0.4), 0.95);
      roundRect(ctx, -2.2, -28, 4.4, 46, 1.5); ctx.fill(); roundRect(ctx, -11, -10, 22, 4, 1.5); ctx.fill();
      for (const s of [-1, 1]) { taper(ctx, [[s * 4, -2], [s * 16, -14], [s * 22, -26]], 6, 1); ctx.fill(); }
      ctx.restore();
      for (const [x, y] of [[-22, -32], [22, -32], [-22, 0], [22, 0], [0, 36]]) { ctx.fillStyle = '#efe6d2'; ellipse(ctx, x, y, 1.6, 1.6); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(22, -36); ctx.lineTo(25, -6); ctx.stroke();
      break;
    }
    case 'quiver': {
      // 矢筒と羽
      for (let i = 0; i < 5; i++) {
        const x = -7 + i * 3.6; const top = -44 - (i % 2) * 4;
        roundRect(ctx, x - 0.7, top, 1.4, 20, 0.6); ctx.fillStyle = '#7a5a3a'; ctx.fill();
        poly(ctx, [[x, top - 1], [x - 2.6, top + 6], [x, top + 10], [x + 2.6, top + 6]]); fillStroke(ctx, i % 2 ? '#e8e2d0' : P.cloth, LINE, 0.7);
      }
      const q = () => { ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(10, -30); ctx.lineTo(8, 38); ctx.quadraticCurveTo(0, 42, -8, 38); ctx.closePath(); };
      q(); fillStroke(ctx, lg(ctx, -10, 0, 10, 0, [[0, shade(P.leather, -0.4)], [0.5, shade(P.leather, 0.25)], [1, shade(P.leather, -0.35)]]), LINE, 1.4);
      for (const y of [-26, 30]) { roundRect(ctx, -10.5, y - 2, 21, 4, 1); fillStroke(ctx, metal(ctx, 10, y, -10, y, P.guard), LINE, 0.8); }
      ctx.strokeStyle = rgba('#f0dcb0', 0.5); ctx.setLineDash([1.6, 1.4]); ctx.lineWidth = 0.7; line(ctx, 5, -22, 4.5, 26); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.gem; ellipse(ctx, 0, 2, 2.6, 2.6); ctx.fill();
      break;
    }
    case 'orb': {
      const gc = P.glow || '#6ab0ff';
      glow(ctx, 0, -6, 34, gc, 0.45);
      // 爪の台
      for (const s of [-1, 1]) { taper(ctx, [[s * 4, 18], [s * 15, 6], [s * 14, -10]], 4.5, 1.2); fillStroke(ctx, metal(ctx, s * 14, -10, 0, 18, P.guard), LINE, 1); }
      ellipse(ctx, 0, -4, 16, 16);
      fillStroke(ctx, rg(ctx, -5, -10, 1, 18, [[0, '#ffffff'], [0.25, shade(gc, 0.45)], [0.7, gc], [1, shade(gc, -0.6)]]), LINE, 1.5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, -4, 10, 0.4, 2.4); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -4, 6, 3.6, 5.6); ctx.stroke(); ctx.restore();
      roundRect(ctx, -6, 16, 12, 6, 2); fillStroke(ctx, metal(ctx, 6, 16, -6, 22, P.guard), LINE, 1);
      break;
    }
    case 'grimoire': {
      ctx.rotate(-0.08);
      roundRect(ctx, -22, -26, 44, 52, 4); fillStroke(ctx, '#e8dcc0', LINE, 1.4); // 紙の小口
      ctx.fillStyle = 'rgba(120,100,70,0.5)'; for (let y = -22; y < 24; y += 2.2) ctx.fillRect(-20, y, 40, 0.6);
      roundRect(ctx, -24, -29, 44, 56, 5); fillStroke(ctx, lg(ctx, 20, -29, -24, 27, [[0, shade(P.cloth === BASE_PAL.cloth ? '#4a2a5a' : P.cloth, 0.25)], [1, shade(P.cloth === BASE_PAL.cloth ? '#4a2a5a' : P.cloth, -0.5)]]), LINE, 1.6);
      roundRect(ctx, -24, -29, 8, 56, 3); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
      // 角金具と留め金
      for (const [x, y] of [[-24, -29], [20, -29], [-24, 27], [20, 27]]) { poly(ctx, [[x, y], [x + (x < 0 ? 9 : -9) + (x < 0 ? 0 : 4), y], [x + (x < 0 ? 0 : 4), y + (y < 0 ? 9 : -9)]]); fillStroke(ctx, metal(ctx, x, y, x + 8, y + 8, P.guard), LINE, 0.8); }
      roundRect(ctx, 16, -6, 9, 12, 2); fillStroke(ctx, metal(ctx, 25, -6, 16, 6, P.guard), LINE, 1);
      // 表紙の目と文様
      const gc = P.glow || '#c77dff';
      ctx.strokeStyle = metal(ctx, -10, -18, 14, 18, P.guard); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(-1, -1, 12, 0, TAU); ctx.stroke();
      ellipse(ctx, -1, -1, 8, 4.4); fillStroke(ctx, '#f0e8d0', LINE, 0.9);
      gemGlow(ctx, -1, -1, 3.2, gc);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; line(ctx, -1 + Math.cos(a) * 13, -1 + Math.sin(a) * 13, -1 + Math.cos(a) * 16, -1 + Math.sin(a) * 16); ctx.stroke(); }
      break;
    }
    case 'offblade': default: {
      ctx.scale(0.82, 0.82); drawWeapon(ctx, 'offblade', 0, 0, P, opt);
    }
  }
  if (P.glow && kind !== 'orb') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, 30, P.glow, 0.18); ctx.restore(); }
  ctx.restore();
}

// ---------------- 兜（頭の中心＝箱の (41, 47)）
const STEEL = '#a9b2bf';
export function drawHelm(ctx, style, w, h, pal = {}) {
  const P = { plume: '#b4271f', trim: '#d2ad55', ...pal };
  const cx = w * 0.5 + 1; const cy = h * 0.72 - 3; // 頭の中心
  ctx.save(); ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  switch (style) {
    case 'cloth': {
      // 頭巾（顔の前は開いている）
      const col = P.cloth || '#4a3a5a';
      blob(ctx, [[-1, -21], [12, -18], [19, -6], [19.5, 6], [15, 18], [6, 22], [-10, 24], [-22, 18], [-24, 4], [-19, -12]], true, 0.6);
      fillStroke(ctx, lg(ctx, 14, -22, -18, 24, [[0, shade(col, 0.3)], [1, shade(col, -0.5)]]), LINE, 1.5);
      // 顔の穴
      ctx.fillStyle = 'rgba(0,0,0,0.0)';
      ctx.save(); blob(ctx, [[8, -10], [17, -6], [18, 6], [14, 14], [6, 12], [4, 0]], true, 0.6); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
      blob(ctx, [[8, -10], [17, -6], [18, 6], [14, 14], [6, 12], [4, 0]], true, 0.6); stroke(ctx, rgba(shade(col, -0.7), 0.9), 1.4);
      ctx.strokeStyle = rgba(P.trim, 0.85); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(6, -14); ctx.quadraticCurveTo(-8, -12, -16, 4); ctx.stroke();
      break;
    }
    case 'leather': {
      // 革の帽子（耳当て・鋲）
      const col = '#7a4f2e';
      ctx.beginPath(); ctx.moveTo(-18, 4); ctx.quadraticCurveTo(-20, -18, -2, -21); ctx.quadraticCurveTo(16, -21, 19, -4); ctx.lineTo(18, 0); ctx.quadraticCurveTo(0, -5, -18, 4); ctx.closePath();
      fillStroke(ctx, lg(ctx, 14, -22, -16, 6, [[0, shade(col, 0.3)], [1, shade(col, -0.45)]]), LINE, 1.5);
      roundRect(ctx, -10, -2, 9, 16, 4); fillStroke(ctx, shade(col, -0.15), LINE, 1.2);
      ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-18, 2); ctx.quadraticCurveTo(0, -6, 19, -2); ctx.stroke();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = '#d8c49a'; ellipse(ctx, -14 + i * 7.5, -1.5 - Math.sin((i / 4) * Math.PI) * 3.4, 1.1, 1.1); ctx.fill(); }
      // 羽根
      taper(ctx, [[-8, -16], [-18, -26], [-28, -30]], 5, 0.6); fillStroke(ctx, lg(ctx, -8, -16, -28, -30, [[0, '#e8e0cc'], [1, P.plume]]), LINE, 1);
      ctx.strokeStyle = rgba('#000', 0.4); ctx.lineWidth = 0.6; line(ctx, -9, -17, -26, -29); ctx.stroke();
      break;
    }
    case 'mail': {
      // 鎖の頭巾＋鉄の鉢
      ctx.save();
      blob(ctx, [[-2, -18], [14, -14], [19, -2], [17, 12], [16, 22], [2, 26], [-16, 24], [-22, 10], [-22, -6], [-14, -16]], true, 0.6);
      ctx.clip();
      ctx.fillStyle = lg(ctx, 16, -18, -20, 24, [[0, shade(STEEL, 0.25)], [1, shade(STEEL, -0.5)]]); ctx.fillRect(-26, -22, 50, 52);
      ctx.lineWidth = 0.7;
      for (let y = -22; y < 28; y += 2.6) for (let x = -26 + (Math.round(y) % 2 ? 1.4 : 0); x < 24; x += 2.8) { ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0.2, Math.PI - 0.2); ctx.stroke(); }
      ctx.restore();
      blob(ctx, [[-2, -18], [14, -14], [19, -2], [17, 12], [16, 22], [2, 26], [-16, 24], [-22, 10], [-22, -6], [-14, -16]], true, 0.6); stroke(ctx, LINE, 1.5);
      ctx.save(); blob(ctx, [[9, -8], [18, -5], [19, 6], [15, 15], [8, 13], [6, 2]], true, 0.6); ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); ctx.restore();
      blob(ctx, [[9, -8], [18, -5], [19, 6], [15, 15], [8, 13], [6, 2]], true, 0.6); stroke(ctx, rgba('#2a2a30', 0.9), 1.3);
      ctx.beginPath(); ctx.moveTo(-19, -2); ctx.quadraticCurveTo(-18, -22, 0, -22); ctx.quadraticCurveTo(17, -22, 19, -6); ctx.quadraticCurveTo(0, -12, -19, -2); ctx.closePath();
      fillStroke(ctx, metal(ctx, 16, -24, -18, 0, STEEL), LINE, 1.3);
      ctx.strokeStyle = P.trim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-18, -3); ctx.quadraticCurveTo(0, -13, 19, -7); ctx.stroke();
      break;
    }
    default: { // plate: 面頬つきの兜と羽飾り
      // 羽飾り
      ctx.fillStyle = lg(ctx, 0, -40, -30, -10, [[0, shade(P.plume, 0.3)], [1, shade(P.plume, -0.4)]]);
      blob(ctx, [[-2, -22], [-4, -34], [-14, -38], [-26, -32], [-34, -20], [-36, -6], [-28, -14], [-20, -22], [-10, -24]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1.2);
      ctx.strokeStyle = rgba(shade(P.plume, -0.6), 0.7); ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-4 - i * 2, -30 + i); ctx.quadraticCurveTo(-18 - i * 3, -30 + i * 3, -30 - i, -14 + i * 2); ctx.stroke(); }
      const shell = () => { ctx.beginPath(); ctx.moveTo(-21, 8); ctx.quadraticCurveTo(-24, -22, 0, -24); ctx.quadraticCurveTo(20, -24, 21, -6); ctx.lineTo(21, 10); ctx.quadraticCurveTo(20, 20, 13, 24); ctx.lineTo(-4, 26); ctx.quadraticCurveTo(-18, 24, -21, 8); ctx.closePath(); };
      shell(); fillStroke(ctx, metal(ctx, 18, -26, -18, 26, STEEL, 1), LINE, 1.6);
      // 目の切れ目と息の穴
      ctx.fillStyle = '#0c0a10'; roundRect(ctx, 5, -3, 17, 3.6, 1.5); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillRect(12 + i * 3, 7, 1.4, 4); }
      // 縁と稜
      ctx.strokeStyle = P.trim; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-20, 9); ctx.quadraticCurveTo(-3, 13, 20, 9); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-6, -23); ctx.quadraticCurveTo(14, -21, 19, -4); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,20,30,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, -24); ctx.quadraticCurveTo(-6, 0, -4, 25); ctx.stroke();
      for (const [x, y] of [[-14, 4], [-14, 16], [2, 19]]) { ctx.fillStyle = '#efe6d2'; ellipse(ctx, x, y, 1.2, 1.2); ctx.fill(); }
    }
  }
  if (P.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, 30, P.glow, 0.16); ctx.restore(); }
  ctx.restore();
}

// ---------------- 枠の painter
export function paintWeaponSlot(ctx, spec, w, h) {
  const kind = spec.params?.kind || spec.id.split('.')[1];
  const P = spec.params?.pal || BASE_PAL;
  const gy = kind === 'bow' ? h * 0.5 : h * (spec.ay ?? 0.82);
  outlined(ctx, w, h, (c) => drawWeapon(c, kind, w * (spec.ax ?? 0.5), gy, P, { noString: spec.params?.noString }), { width: 0.8, glow: P.glow ? { color: P.glow, blur: 8, alpha: 0.7 } : null });
}
export function paintOffhandSlot(ctx, spec, w, h) {
  const kind = spec.params?.kind || spec.id.split('.')[1];
  const P = spec.params?.pal || BASE_PAL;
  outlined(ctx, w, h, (c) => drawOffhand(c, kind, w * (spec.ax ?? 0.5), h * (spec.ay ?? 0.55), P), { width: 0.8, glow: P.glow ? { color: P.glow, blur: 8, alpha: 0.6 } : null });
}
export function paintHelmSlot(ctx, spec, w, h) {
  const style = spec.params?.style || spec.id.split('.')[2] || 'plate';
  const P = spec.params?.pal || {};
  outlined(ctx, w, h, (c) => drawHelm(c, style, w, h, P), { width: 0.8, glow: P.glow ? { color: P.glow, blur: 8, alpha: 0.6 } : null });
}

/** 重ね着の部品（体の一部だけを切り出した見本。差し替えたときに体の上へ重なる） */
const PART_CLIP = {
  chest: (c) => { c.rect(40, 56, 70, 72); },
  gloves: (c) => { c.arc(99, 112, 14, 0, TAU); c.moveTo(65, 112); c.arc(51, 112, 14, 0, TAU); },
  belt: (c) => { c.rect(48, 100, 56, 14); },
  legs: (c) => { c.rect(44, 112, 64, 74); },
  boots: (c) => { c.rect(44, 168, 70, 30); },
};
export function paintArmorPart(ctx, spec, w, h) {
  const slot = spec.params?.slot || spec.id.split('.')[1];
  const style = spec.params?.style || spec.id.split('.')[2] || 'plate';
  const rig = heroRig('ranger', style);
  ctx.save();
  ctx.scale(w / HERO_W, h / HERO_H);
  ctx.beginPath(); (PART_CLIP[slot] || PART_CLIP.chest)(ctx); ctx.clip();
  drawRig(ctx, rig, REST_POSE);
  ctx.restore();
}

// ---------------- ユニーク
const UDEF = new Map();
function uniqueDef(id) {
  if (!UDEF.size) {
    for (const u of UNIQUES) UDEF.set(u.id, { ...u });
    for (const u of MYTHICS) UDEF.set(u.id, { ...u, greater: true, rarity: 'mythic' });
    for (const s of SETS) for (const pc of s.pieces || []) UDEF.set(pc.id, { ...pc, set: s.id, cls: s.cls });
  }
  return UDEF.get(id) || null;
}
/** ユニークのベースの種類（kind）と防具のスタイル */
export function uniqueKind(def) {
  if (!def) return { kind: null };
  const b = BASE[def.base];
  if (b) return { kind: b.kind, style: b.style, slot: b.slot };
  const k = def.base || def.kind || def.slot;
  if (typeof k === 'string') {
    const m = k.match(/^(helm|chest|gloves|belt|legs|boots)(?:_(cloth|leather|mail|plate))?/);
    if (m) return { kind: m[1], style: m[2] || 'plate', slot: m[1] };
    return { kind: k.replace(/_\d+$/, ''), slot: def.slot };
  }
  return { kind: null };
}
export function paintUniqueSlot(ctx, spec, w, h) {
  const id = spec.params?.unique || spec.id.slice('gear.u.'.length);
  const def = uniqueDef(id);
  const { kind, style } = uniqueKind(def);
  const P = uniquePal(def, id);
  const aura = P.mythic ? '#ff4d6d' : P.glow;
  if (WEAPON_KINDS_ALL.includes(kind)) {
    const gy = kind === 'bow' ? h * 0.5 : h * (spec.ay ?? 0.82);
    outlined(ctx, w, h, (c) => { drawWeapon(c, kind, w * (spec.ax ?? 0.5), gy, P, { noString: spec.params?.noString }); if (P.mythic) mythicSparks(c, w, h, id); }, { width: 0.8, glow: { color: aura, blur: P.mythic ? 12 : 8, alpha: 0.85, twice: P.mythic } });
  } else if (OFFHAND_KINDS_ALL.includes(kind)) {
    outlined(ctx, w, h, (c) => { drawOffhand(c, kind, w * 0.5, h * 0.55, P); if (P.mythic) mythicSparks(c, w, h, id); }, { width: 0.8, glow: { color: aura, blur: 9, alpha: 0.8 } });
  } else if (kind === 'helm') {
    outlined(ctx, w, h, (c) => { c.save(); c.translate(w * 0.5 - 40, h * 0.82 - 50); drawHelm(c, style || 'plate', 80, 70, { plume: P.cloth, trim: P.guard, glow: P.glow, cloth: P.cloth }); c.restore(); }, { width: 0.8, glow: { color: aura, blur: 9, alpha: 0.8 } });
  } else {
    // 防具・装飾品・不明: 光をまとった遺物
    outlined(ctx, w, h, (c) => relic(c, w, h, kind, P, id), { width: 0.8, glow: { color: aura, blur: 10, alpha: 0.8 } });
  }
}
function mythicSparks(ctx, w, h, id) {
  const r = rng(id);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) { const x = r() * w; const y = r() * h * 0.8; ctx.fillStyle = rgba(i % 2 ? '#ffd0e0' : '#ff4d6d', 0.9); star(ctx, x, y, 4, 3.4, 0.8); ctx.fill(); }
  ctx.restore();
}
function relic(ctx, w, h, kind, P, id) {
  const cx = w / 2; const cy = h * 0.5;
  glow(ctx, cx, cy, w * 0.45, P.glow || '#ffd080', 0.4);
  if (kind === 'ring' || kind === 'amulet') {
    ctx.strokeStyle = metal(ctx, cx - 20, cy - 20, cx + 20, cy + 20, P.guard); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy + 6, 16, 0, TAU); ctx.stroke();
    gemGlow(ctx, cx, cy - 12, 7, P.gem);
  } else {
    const r = rng(id);
    poly(ctx, [[cx, cy - 40], [cx + 22, cy - 18], [cx + 18, cy + 30], [cx, cy + 44], [cx - 18, cy + 30], [cx - 22, cy - 18]]);
    fillStroke(ctx, metal(ctx, cx + 20, cy - 40, cx - 20, cy + 44, P.guard), LINE, 1.6);
    ctx.fillStyle = lg(ctx, cx, cy - 30, cx, cy + 34, [[0, shade(P.cloth, 0.3)], [1, shade(P.cloth, -0.5)]]);
    poly(ctx, [[cx, cy - 30], [cx + 14, cy - 14], [cx + 11, cy + 24], [cx, cy + 34], [cx - 11, cy + 24], [cx - 14, cy - 14]]); ctx.fill();
    gemGlow(ctx, cx, cy - 4, 6 + r() * 2, P.gem);
  }
  void mix;
}
