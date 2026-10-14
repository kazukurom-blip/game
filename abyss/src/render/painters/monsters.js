// 敵・ボス・召喚物・ペットの絵。data/monsters.js の「体の形（body）」18 種と「飾り（features）」21 種をすべて描ける。
// 色は palette { main, sub, eye, accent? } から。敵は左向き（主人公の方）。ペット・召喚物は右向き（左右反転）。
// 描く座標は 100×100 の箱（足元 y=97、空を飛ぶ敵は箱の 60% の所が基準点）。
// 翼は別の部品にもしておき、戦闘の画面で羽ばたかせる（monsterParts）。

import { MONSTER } from '../../data/monsters.js';
import { PET, PETS } from '../../data/pets.js';
import { TAU, rgba, shade, mix, lg, rg, roundRect, ellipse, blob, taper, poly, fillStroke, stroke, line, outlined, glow, metal, rng, hash, star, hue, luma, layer, ctxScale } from './util.js';
import { drawWeapon, drawOffhand } from './gear.js';

const LINE = 'rgba(10,6,14,0.9)';
export const BODY_PLANS = ['biped', 'brute', 'caster', 'quad', 'beast_large', 'flyer', 'blob', 'serpent', 'spider', 'insect', 'ghost', 'golem', 'dragon', 'plant', 'aquatic', 'demon', 'elemental', 'construct'];
export const FEATURES = ['horns', 'wings', 'tail', 'crown', 'armor', 'staff', 'shield', 'sword', 'axe', 'bow', 'spikes', 'tentacles', 'glow', 'hood', 'mask', 'chains', 'crystals', 'gears', 'flames', 'ice', 'bones'];

// ---------------- 色
function palOf(p = {}, seed = 'x') {
  const main = p.main || '#8a8a8a';
  const sub = p.sub || shade(main, -0.45);
  const eye = p.eye || '#ff4030';
  const accent = p.accent || (luma(eye) > 0.35 ? eye : hue(main, 40, 1.2, 0.15));
  return { main, sub, eye, accent, hi: shade(main, 0.35), lo: shade(main, -0.45), belly: mix(main, '#f0e8d8', 0.28), seed };
}
const volFill = (ctx, y0, y1, P, k = 1) => lg(ctx, 0, y0, 0, y1, [[0, shade(P.main, 0.3 * k)], [0.5, P.main], [1, mix(P.main, P.sub, 0.7)]]);
const sideFill = (ctx, x0, x1, P) => lg(ctx, x0, 0, x1, 0, [[0, shade(P.main, 0.18)], [0.6, P.main], [1, mix(P.main, P.sub, 0.6)]]);

function eyeAt(ctx, x, y, r, P, o = {}) {
  if (o.cute) {
    ellipse(ctx, x, y, r * 1.5, r * 1.7); ctx.fillStyle = '#140c18'; ctx.fill();
    ctx.fillStyle = P.eye; ellipse(ctx, x, y + r * 0.3, r * 1.1, r * 1.1); ctx.fill();
    ctx.fillStyle = '#fff'; ellipse(ctx, x - r * 0.5, y - r * 0.5, r * 0.55, r * 0.55); ctx.fill(); ellipse(ctx, x + r * 0.5, y + r * 0.6, r * 0.25, r * 0.25); ctx.fill();
    return;
  }
  glow(ctx, x, y, r * 3.2, P.eye, 0.55);
  ctx.fillStyle = shade(P.eye, 0.5); ellipse(ctx, x, y, r, r * 0.75); ctx.fill();
  ctx.fillStyle = '#fff'; ellipse(ctx, x - r * 0.3, y - r * 0.15, r * 0.35, r * 0.3); ctx.fill();
}
function teeth(ctx, x0, y0, x1, y1, n, len, col = '#efe6d0') {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const x = x0 + (x1 - x0) * t; const y = y0 + (y1 - y0) * t; poly(ctx, [[x - 1.1, y], [x, y + len], [x + 1.1, y]]); ctx.fill(); }
}
function limb(ctx, pts, w0, w1, fill) { taper(ctx, pts, w0, w1); fillStroke(ctx, fill, LINE, 1.1); }
function claw(ctx, x, y, dir = -1, s = 1, col = '#e8e0cc') { ctx.fillStyle = col; for (let i = -1; i <= 1; i++) { poly(ctx, [[x + i * 1.6 * s, y], [x + (i * 1.6 + dir * 2.6) * s, y + 3.4 * s], [x + (i * 1.6 + 1.1) * s, y]]); ctx.fill(); } }

// ---------------- 体の形
// 各形: draw(ctx, P, F, o) で体を描き、A（飾りを付ける点）を返す
// A: head [x,y,r], face [x,y]（目の高さ・前）, handF, handB, back, tail, top, center, w（体の幅）, hips, feet
const PLANS = {
  biped(ctx, P, F, o) {
    const hunch = o.hunch ?? 3;
    // 奥の脚・腕
    limb(ctx, [[54, 70], [58, 84], [57, 96]], 8, 6, volFill(ctx, 70, 97, P, 0.6));
    ellipse(ctx, 55, 96, 6, 2.4); fillStroke(ctx, P.sub, LINE, 1);
    limb(ctx, [[57, 42], [63, 52], [62, 62]], 7, 5, mix(P.main, P.sub, 0.5));
    // 胴
    blob(ctx, [[40, 36 + hunch], [52, 34], [60, 42], [60, 58], [56, 70], [42, 71], [37, 58], [36, 46]], true, 0.6);
    fillStroke(ctx, volFill(ctx, 34, 71, P), LINE, 1.4);
    ctx.save(); blob(ctx, [[40, 36 + hunch], [52, 34], [60, 42], [60, 58], [56, 70], [42, 71], [37, 58], [36, 46]], true, 0.6); ctx.clip();
    ctx.fillStyle = rgba(P.sub, 0.55); ctx.fillRect(30, 62, 40, 10);
    ctx.strokeStyle = rgba(P.lo, 0.6); ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(40 + i * 2, 44 + i * 5); ctx.quadraticCurveTo(48, 46 + i * 5, 54, 44 + i * 5); ctx.stroke(); }
    ctx.restore();
    // 手前の脚
    limb(ctx, [[44, 70], [41, 84], [42, 96]], 9, 6.5, volFill(ctx, 70, 97, P));
    ellipse(ctx, 40, 96, 6.5, 2.6); fillStroke(ctx, P.sub, LINE, 1);
    // 頭
    const hx = 41; const hy = 26 + hunch;
    blob(ctx, [[hx, hy - 10], [hx + 8, hy - 7], [hx + 9, hy + 2], [hx + 4, hy + 9], [hx - 4, hy + 9], [hx - 9, hy + 4], [hx - 9, hy - 4]], true, 0.6);
    fillStroke(ctx, rg(ctx, hx - 3, hy - 5, 1, 13, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.3);
    eyeAt(ctx, hx - 5, hy - 1, 1.7, P, o); eyeAt(ctx, hx - 0.5, hy - 1.3, 1.5, P, o);
    if (!o.cute) { ctx.strokeStyle = LINE; ctx.lineWidth = 1; line(ctx, hx - 7, hy + 5, hx - 2, hy + 5.5); ctx.stroke(); }
    // 手前の腕
    limb(ctx, [[42, 42], [35, 52], [31, 61]], 8, 6, volFill(ctx, 42, 62, P));
    ellipse(ctx, 30.5, 62, 3.6, 3.6); fillStroke(ctx, P.main, LINE, 1);
    return { head: [hx, hy, 9.5], face: [hx - 6, hy - 1], handF: [30.5, 62], handB: [62, 62], back: [56, 42], tail: [58, 68], top: [hx, hy - 10], center: [48, 52], w: 24, hips: [48, 70], feet: 97, shoulder: [44, 40] };
  },
  skeleton(ctx, P, F, o) {
    // 骨だけの人型（骸骨の兵・射手・召喚の骸骨）
    const bone = P.main; const dark = shade(P.main, -0.45);
    const bfill = (y0, y1) => lg(ctx, 0, y0, 0, y1, [[0, shade(bone, 0.25)], [1, shade(bone, -0.25)]]);
    const boneLimb = (pts, wd, far) => { limb(ctx, pts, wd, wd * 0.8, far ? shade(bone, -0.3) : bfill(pts[0][1], pts[pts.length - 1][1])); for (const q of pts.slice(1, -1)) { ellipse(ctx, q[0], q[1], wd * 0.75, wd * 0.75); fillStroke(ctx, far ? shade(bone, -0.3) : bone, LINE, 0.8); } };
    boneLimb([[54, 68], [57, 82], [56, 95]], 3.6, true); ellipse(ctx, 55, 96, 5, 2); fillStroke(ctx, shade(bone, -0.3), LINE, 0.8);
    boneLimb([[56, 40], [62, 51], [61, 61]], 3.2, true);
    // 背骨と骨盤
    ctx.strokeStyle = LINE; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(48, 66); ctx.quadraticCurveTo(52, 52, 47, 36); ctx.stroke();
    ctx.strokeStyle = bone; ctx.lineWidth = 2.6; ctx.stroke();
    for (let i = 0; i < 6; i++) { const y = 40 + i * 4.4; ellipse(ctx, 49.5 + Math.sin(i * 0.6) * 1.5, y, 2.4, 1.4); fillStroke(ctx, bone, LINE, 0.6); }
    blob(ctx, [[41, 64], [55, 63], [57, 69], [50, 73], [43, 71]], true, 0.6); fillStroke(ctx, bfill(63, 73), LINE, 1.1);
    ctx.fillStyle = '#140c14'; ellipse(ctx, 47, 68, 1.6, 1.6); ctx.fill(); ellipse(ctx, 52, 68, 1.6, 1.6); ctx.fill();
    // 肋骨
    for (let i = 0; i < 4; i++) { const y = 41 + i * 4.6; const wd = 9 - i * 0.8; ctx.strokeStyle = LINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(49, y); ctx.quadraticCurveTo(49 - wd, y + 1, 49 - wd * 0.6, y + 5); ctx.moveTo(49, y); ctx.quadraticCurveTo(49 + wd, y + 1, 49 + wd * 0.65, y + 5); ctx.stroke(); ctx.strokeStyle = bone; ctx.lineWidth = 1.6; ctx.stroke(); }
    boneLimb([[44, 68], [41, 82], [42, 95]], 4, false); ellipse(ctx, 40, 96, 5.5, 2.2); fillStroke(ctx, bone, LINE, 0.9);
    // 頭蓋
    const hx = 42; const hy = 27;
    blob(ctx, [[hx + 1, hy - 9], [hx + 8, hy - 6], [hx + 8.5, hy + 1], [hx + 5, hy + 5], [hx + 4, hy + 9], [hx - 4, hy + 9], [hx - 7, hy + 4], [hx - 8.5, hy - 2], [hx - 6, hy - 7]], true, 0.6);
    fillStroke(ctx, rg(ctx, hx - 2, hy - 4, 1, 12, [[0, shade(bone, 0.4)], [0.7, bone], [1, dark]]), LINE, 1.3);
    ctx.fillStyle = '#100810'; ellipse(ctx, hx - 4.4, hy - 0.5, 2.6, 2.9); ctx.fill(); ellipse(ctx, hx + 1.2, hy - 0.8, 2.3, 2.7); ctx.fill();
    eyeAt(ctx, hx - 4.4, hy - 0.3, 1.1, P, o); eyeAt(ctx, hx + 1.2, hy - 0.6, 1, P, o);
    ctx.fillStyle = '#100810'; poly(ctx, [[hx - 2, hy + 2.5], [hx - 0.6, hy + 4.6], [hx - 3.2, hy + 4.6]]); ctx.fill();
    ctx.strokeStyle = LINE; ctx.lineWidth = 0.7; for (let i = 0; i < 5; i++) { line(ctx, hx - 5 + i * 1.8, hy + 6, hx - 5 + i * 1.8, hy + 8.6); ctx.stroke(); }
    line(ctx, hx - 6, hy + 6.2, hx + 3, hy + 6.2); ctx.stroke();
    boneLimb([[44, 40], [37, 51], [32, 61]], 3.6, false);
    ellipse(ctx, 31.5, 62, 3, 3); fillStroke(ctx, bone, LINE, 0.9);
    return { head: [hx, hy, 9], face: [hx - 5, hy - 0.5], handF: [31.5, 62], handB: [61, 62], back: [55, 42], tail: [56, 66], top: [hx, hy - 9], center: [48, 52], w: 20, hips: [48, 68], feet: 97, shoulder: [46, 40] };
  },
  brute(ctx, P, F, o) {
    limb(ctx, [[60, 64], [64, 80], [62, 96]], 13, 11, volFill(ctx, 64, 97, P, 0.6));
    ellipse(ctx, 61, 96, 9, 3); fillStroke(ctx, P.sub, LINE, 1);
    limb(ctx, [[66, 34], [76, 52], [76, 74]], 11, 9, mix(P.main, P.sub, 0.5));
    ellipse(ctx, 76, 76, 6, 5.5); fillStroke(ctx, mix(P.main, P.sub, 0.5), LINE, 1);
    const tb = [[34, 34], [50, 24], [68, 28], [76, 40], [72, 60], [62, 70], [40, 70], [30, 58], [28, 44]];
    blob(ctx, tb, true, 0.6); fillStroke(ctx, volFill(ctx, 24, 70, P), LINE, 1.6);
    ctx.save(); blob(ctx, tb, true, 0.6); ctx.clip();
    ctx.fillStyle = rgba(P.belly, 0.35); ellipse(ctx, 40, 52, 12, 14); ctx.fill();
    ctx.strokeStyle = rgba(P.lo, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(36, 44); ctx.quadraticCurveTo(44, 48, 50, 42); ctx.stroke(); ctx.beginPath(); ctx.moveTo(36, 56); ctx.quadraticCurveTo(44, 60, 50, 55); ctx.stroke();
    ctx.restore();
    limb(ctx, [[42, 64], [38, 80], [40, 96]], 14, 11.5, volFill(ctx, 64, 97, P));
    ellipse(ctx, 38, 96, 10, 3.2); fillStroke(ctx, P.sub, LINE, 1);
    // 小さな頭（前寄り）
    const hx = 32; const hy = 30;
    blob(ctx, [[hx - 1, hy - 8], [hx + 7, hy - 6], [hx + 8, hy + 3], [hx + 2, hy + 8], [hx - 7, hy + 6], [hx - 9, hy - 1]], true, 0.6);
    fillStroke(ctx, rg(ctx, hx - 2, hy - 4, 1, 11, [[0, P.hi], [0.7, P.main], [1, P.lo]]), LINE, 1.3);
    eyeAt(ctx, hx - 5, hy - 1.5, 1.6, P, o); eyeAt(ctx, hx - 1, hy - 2, 1.4, P, o);
    if (!o.cute) { ctx.fillStyle = '#1a0a0a'; ctx.beginPath(); ctx.moveTo(hx - 8, hy + 3); ctx.quadraticCurveTo(hx - 4, hy + 6, hx + 1, hy + 4); ctx.lineTo(hx - 8, hy + 3); ctx.fill(); teeth(ctx, hx - 7.5, hy + 3.2, hx, hy + 4.4, 4, 1.8); }
    // 手前の腕（地面近くまで長い）
    limb(ctx, [[40, 36], [28, 54], [22, 74]], 13, 10, volFill(ctx, 36, 78, P));
    ellipse(ctx, 21, 78, 7, 6.5); fillStroke(ctx, P.main, LINE, 1.2);
    return { head: [hx, hy, 8.5], face: [hx - 5, hy - 1.5], handF: [21, 78], handB: [76, 76], back: [62, 32], tail: [66, 62], top: [hx, hy - 8], center: [52, 48], w: 40, hips: [52, 66], feet: 97, shoulder: [38, 34] };
  },
  caster(ctx, P, F, o) {
    // 奥の袖
    limb(ctx, [[57, 42], [62, 54], [60, 62]], 8, 9, mix(P.sub, '#000', 0.2));
    // ローブ
    const rb = [[42, 32], [56, 32], [62, 52], [68, 80], [72, 96], [52, 98], [28, 96], [32, 78], [36, 52]];
    blob(ctx, rb, true, 0.5); fillStroke(ctx, lg(ctx, 0, 30, 0, 98, [[0, shade(P.sub, 0.3)], [0.6, P.sub], [1, shade(P.sub, -0.5)]]), LINE, 1.4);
    ctx.save(); blob(ctx, rb, true, 0.5); ctx.clip();
    ctx.strokeStyle = rgba(shade(P.sub, -0.6), 0.6); ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(44 + i * 4, 40); ctx.quadraticCurveTo(40 + i * 7, 70, 34 + i * 10, 98); ctx.stroke(); }
    ctx.fillStyle = rgba(P.accent, 0.85); ctx.fillRect(24, 92, 52, 2); ctx.fillRect(46, 34, 2.2, 64);
    ctx.restore();
    // 頭巾と顔の闇
    const hx = 44; const hy = 25;
    blob(ctx, [[hx + 2, hy - 13], [hx + 11, hy - 6], [hx + 12, hy + 6], [hx + 6, hy + 11], [hx - 6, hy + 10], [hx - 10, hy + 2], [hx - 8, hy - 8]], true, 0.6);
    fillStroke(ctx, lg(ctx, hx - 10, hy - 13, hx + 12, hy + 11, [[0, shade(P.sub, 0.35)], [1, shade(P.sub, -0.4)]]), LINE, 1.3);
    ellipse(ctx, hx - 4, hy + 2, 5.5, 6.5); ctx.fillStyle = mix(P.main, '#000', 0.65); ctx.fill();
    eyeAt(ctx, hx - 6, hy + 1, 1.3, P, o); eyeAt(ctx, hx - 2.4, hy + 0.6, 1.2, P, o);
    // 手前の袖と光る手
    limb(ctx, [[42, 40], [34, 50], [29, 56]], 8, 10, lg(ctx, 0, 40, 0, 58, [[0, shade(P.sub, 0.25)], [1, shade(P.sub, -0.3)]]));
    ellipse(ctx, 27.5, 57, 3, 3); fillStroke(ctx, P.main, LINE, 1);
    glow(ctx, 27, 56, 8, P.accent, 0.55);
    return { head: [hx, hy, 10], face: [hx - 5, hy + 1], handF: [27.5, 57], handB: [60, 62], back: [56, 40], tail: [60, 80], top: [hx + 1, hy - 13], center: [50, 60], w: 30, hips: [50, 70], feet: 97, shoulder: [46, 38] };
  },
  quad(ctx, P, F, o) {
    const leg = (x, front, far) => {
      const f = far ? mix(P.main, P.sub, 0.55) : volFill(ctx, 62, 97, P);
      limb(ctx, front ? [[x, 62], [x - 2, 76], [x + 1, 86], [x - 1, 96]] : [[x, 62], [x + 4, 74], [x, 84], [x + 1, 96]], 8, 5, f);
      ellipse(ctx, x - 1.5, 96, 4, 1.8); fillStroke(ctx, P.sub, LINE, 0.8);
    };
    leg(70, false, true); leg(38, true, true);
    // 尾
    if (!F.has('tail')) limb(ctx, [[76, 58], [86, 54], [92, 46], [94, 40]], 7, 2.5, volFill(ctx, 40, 60, P));
    // 胴
    const bd = [[34, 52], [50, 48], [70, 50], [80, 58], [76, 70], [60, 72], [42, 72], [32, 64]];
    blob(ctx, bd, true, 0.6); fillStroke(ctx, volFill(ctx, 48, 72, P), LINE, 1.4);
    ctx.save(); blob(ctx, bd, true, 0.6); ctx.clip(); ctx.fillStyle = rgba(P.belly, 0.4); ellipse(ctx, 54, 74, 22, 6); ctx.fill();
    ctx.strokeStyle = rgba(P.lo, 0.55); ctx.lineWidth = 0.8; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(44 + i * 6, 50); ctx.lineTo(42 + i * 6, 56); ctx.stroke(); }
    ctx.restore();
    leg(64, false, false); leg(42, true, false);
    // 首と頭
    limb(ctx, [[40, 58], [30, 52], [24, 48]], 14, 11, volFill(ctx, 44, 60, P));
    const hx = 20; const hy = 47;
    blob(ctx, [[hx + 6, hy - 7], [hx + 9, hy], [hx + 4, hy + 6], [hx - 4, hy + 6], [hx - 12, hy + 5], [hx - 14, hy + 2], [hx - 12, hy - 1], [hx - 4, hy - 4]], true, 0.55);
    fillStroke(ctx, rg(ctx, hx - 2, hy - 4, 1, 14, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.3);
    // 耳
    poly(ctx, [[hx + 2, hy - 5], [hx + 6, hy - 13], [hx + 7, hy - 4]]); fillStroke(ctx, P.main, LINE, 1);
    ctx.fillStyle = '#1a1014'; ellipse(ctx, hx - 13, hy + 1, 1.6, 1.3); ctx.fill();
    if (!o.cute) { ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx - 13, hy + 4); ctx.lineTo(hx - 4, hy + 4.5); ctx.stroke(); teeth(ctx, hx - 12, hy + 4.2, hx - 6, hy + 4.4, 3, 1.6); }
    eyeAt(ctx, hx - 4, hy - 1.5, 1.6, P, o);
    return { head: [hx - 2, hy, 8], face: [hx - 5, hy - 1.5], handF: [36, 90], handB: [66, 90], back: [56, 50], tail: [78, 56], top: [hx + 2, hy - 8], center: [56, 60], w: 46, hips: [70, 62], feet: 97, shoulder: [40, 54] };
  },
  beast_large(ctx, P, F, o) {
    const leg = (x, far, w = 12) => { limb(ctx, [[x, 60], [x + 1, 80], [x, 95]], w, w * 0.85, far ? mix(P.main, P.sub, 0.55) : volFill(ctx, 60, 97, P)); ellipse(ctx, x - 1, 95.5, w * 0.62, 2.6); fillStroke(ctx, shade(P.sub, -0.2), LINE, 1); claw(ctx, x - w * 0.55, 96, -1, 0.9); };
    leg(74, true); leg(40, true);
    const bd = [[30, 50], [44, 30], [64, 30], [84, 42], [88, 62], [80, 76], [56, 78], [36, 76], [26, 64]];
    blob(ctx, bd, true, 0.6); fillStroke(ctx, volFill(ctx, 30, 78, P), LINE, 1.6);
    ctx.save(); blob(ctx, bd, true, 0.6); ctx.clip();
    ctx.fillStyle = rgba(P.belly, 0.35); ellipse(ctx, 56, 80, 30, 9); ctx.fill();
    ctx.strokeStyle = rgba(P.hi, 0.35); ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(40 + i * 5, 32 + Math.abs(i - 3) * 1.4); ctx.lineTo(37 + i * 5, 40 + Math.abs(i - 3) * 1.4); ctx.stroke(); }
    ctx.restore();
    leg(66, false, 13); leg(34, false, 13);
    // 頭
    const hx = 20; const hy = 56;
    blob(ctx, [[hx + 8, hy - 12], [hx + 14, hy - 2], [hx + 10, hy + 10], [hx - 2, hy + 12], [hx - 12, hy + 8], [hx - 14, hy], [hx - 8, hy - 9]], true, 0.55);
    fillStroke(ctx, rg(ctx, hx - 2, hy - 6, 1, 18, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.5);
    ellipse(ctx, hx - 9, hy + 3, 6, 5); fillStroke(ctx, mix(P.main, P.belly, 0.4), LINE, 1);
    ctx.fillStyle = '#1a1014'; ellipse(ctx, hx - 13, hy + 1.5, 1.5, 1.2); ctx.fill();
    if (!o.cute) {
      ctx.fillStyle = '#1a0808'; ctx.beginPath(); ctx.moveTo(hx - 13, hy + 6); ctx.quadraticCurveTo(hx - 5, hy + 12, hx + 4, hy + 8); ctx.lineTo(hx - 13, hy + 6); ctx.fill();
      teeth(ctx, hx - 12, hy + 6.5, hx + 2, hy + 8.4, 5, 2.2);
      // 牙
      taper(ctx, [[hx - 8, hy + 7], [hx - 12, hy + 2], [hx - 13, hy - 3]], 2.6, 0.4); fillStroke(ctx, '#efe6d0', LINE, 0.8);
    }
    eyeAt(ctx, hx - 3, hy - 4, 1.7, P, o);
    poly(ctx, [[hx + 6, hy - 9], [hx + 11, hy - 15], [hx + 12, hy - 6]]); fillStroke(ctx, P.main, LINE, 1);
    return { head: [hx, hy - 2, 12], face: [hx - 4, hy - 4], handF: [32, 90], handB: [70, 90], back: [62, 32], tail: [86, 54], top: [hx + 4, hy - 12], center: [58, 54], w: 58, hips: [78, 58], feet: 97, shoulder: [42, 40] };
  },
  flyer(ctx, P, F, o) {
    // 翼は wings の部品で描く（ここでは体だけ）
    limb(ctx, [[52, 60], [54, 68], [52, 74]], 3.4, 2, P.sub); claw(ctx, 50, 74, -1, 0.8);
    limb(ctx, [[46, 60], [45, 68], [43, 74]], 3.4, 2, P.sub); claw(ctx, 41, 74, -1, 0.8);
    blob(ctx, [[44, 38], [54, 40], [58, 52], [54, 64], [44, 64], [40, 52]], true, 0.6); fillStroke(ctx, volFill(ctx, 38, 64, P), LINE, 1.3);
    ctx.fillStyle = rgba(P.belly, 0.4); ellipse(ctx, 47, 55, 5, 7); ctx.fill();
    const hx = 43; const hy = 34;
    poly(ctx, [[hx - 2, hy - 4], [hx - 5, hy - 13], [hx + 2, hy - 6]]); fillStroke(ctx, P.main, LINE, 1);
    poly(ctx, [[hx + 3, hy - 5], [hx + 4, hy - 13], [hx + 7, hy - 4]]); fillStroke(ctx, P.lo, LINE, 1);
    ellipse(ctx, hx, hy, 7.5, 6.5); fillStroke(ctx, rg(ctx, hx - 2, hy - 3, 1, 9, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.2);
    eyeAt(ctx, hx - 3.5, hy - 1, 1.4, P, o); eyeAt(ctx, hx + 0.5, hy - 1.2, 1.3, P, o);
    if (!o.cute) teeth(ctx, hx - 5, hy + 3, hx - 1, hy + 3.2, 2, 2);
    return { head: [hx, hy, 7], face: [hx - 4, hy - 1], handF: [42, 74], handB: [52, 74], back: [52, 42], tail: [52, 64], top: [hx, hy - 7], center: [48, 50], w: 18, hips: [49, 62], feet: 76, shoulder: [46, 42], fly: 52 };
  },
  blob(ctx, P, F, o) {
    const pts = [[14, 96], [12, 82], [20, 62], [34, 50], [50, 46], [66, 50], [80, 62], [88, 82], [86, 96]];
    blob(ctx, pts, true, 0.5);
    fillStroke(ctx, rg(ctx, 40, 58, 2, 52, [[0, shade(P.main, 0.45)], [0.5, P.main], [1, mix(P.main, P.sub, 0.8)]]), LINE, 1.5);
    ctx.save(); blob(ctx, pts, true, 0.5); ctx.clip();
    const r = rng(P.seed);
    for (let i = 0; i < 7; i++) { ellipse(ctx, 22 + r() * 56, 62 + r() * 30, 1.5 + r() * 3, 1.5 + r() * 3); ctx.strokeStyle = rgba(shade(P.main, 0.5), 0.6); ctx.lineWidth = 0.7; ctx.stroke(); }
    ctx.fillStyle = rgba(P.sub, 0.45); ellipse(ctx, 50, 98, 40, 7); ctx.fill();
    ctx.restore();
    // つや
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ellipse(ctx, 34, 58, 9, 4, -0.5); ctx.fill(); ellipse(ctx, 26, 66, 2.5, 1.6, -0.5); ctx.fill();
    // 垂れ
    ctx.fillStyle = mix(P.main, P.sub, 0.4); for (const x of [24, 70]) { ellipse(ctx, x, 97, 4, 2.2); ctx.fill(); }
    eyeAt(ctx, 30, 72, 2.4, P, o); eyeAt(ctx, 42, 71, 2.2, P, o);
    if (!o.cute) { ctx.fillStyle = '#1a0a10'; ctx.beginPath(); ctx.ellipse(36, 82, 7, 3, 0, 0, Math.PI); ctx.fill(); }
    else { ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(36, 79, 3, 0.3, Math.PI - 0.3); ctx.stroke(); }
    return { head: [40, 64, 16], face: [32, 72], handF: [16, 82], handB: [84, 82], back: [62, 52], tail: [84, 80], top: [50, 46], center: [50, 74], w: 70, hips: [50, 88], feet: 97, shoulder: [34, 58] };
  },
  serpent(ctx, P, F, o) {
    // とぐろ
    ellipse(ctx, 62, 88, 26, 9); fillStroke(ctx, volFill(ctx, 79, 97, P), LINE, 1.4);
    ellipse(ctx, 66, 82, 18, 7); fillStroke(ctx, volFill(ctx, 75, 89, P), LINE, 1.2);
    const spine = [[70, 82], [62, 72], [54, 58], [48, 46], [42, 36], [34, 30]];
    taper(ctx, spine, 15, 10); fillStroke(ctx, sideFill(ctx, 30, 70, P), LINE, 1.4);
    // 腹の帯
    ctx.save(); taper(ctx, spine, 15, 10); ctx.clip(); ctx.strokeStyle = rgba(P.belly, 0.8); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(64, 84); ctx.bezierCurveTo(52, 70, 46, 56, 36, 38); ctx.stroke();
    ctx.strokeStyle = rgba(P.lo, 0.5); ctx.lineWidth = 0.7; for (let i = 0; i < 9; i++) { const t = i / 9; const x = 66 - t * 30; const y = 82 - t * 46; line(ctx, x - 6, y - 2, x + 6, y + 2); ctx.stroke(); }
    ctx.restore();
    // 頭
    const hx = 28; const hy = 28;
    blob(ctx, [[hx + 8, hy - 6], [hx + 10, hy + 2], [hx + 4, hy + 6], [hx - 8, hy + 6], [hx - 14, hy + 3], [hx - 12, hy - 2], [hx - 2, hy - 7]], true, 0.55);
    fillStroke(ctx, rg(ctx, hx - 2, hy - 4, 1, 14, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.3);
    if (!o.cute) { ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx - 13, hy + 4); ctx.lineTo(hx - 19, hy + 5); ctx.lineTo(hx - 21, hy + 3); ctx.moveTo(hx - 19, hy + 5); ctx.lineTo(hx - 21, hy + 7); ctx.stroke(); teeth(ctx, hx - 12, hy + 3.6, hx - 6, hy + 4, 2, 2.4); }
    eyeAt(ctx, hx - 4, hy - 1.5, 1.7, P, o);
    return { head: [hx - 2, hy, 8], face: [hx - 5, hy - 1.5], handF: [36, 60], handB: [60, 70], back: [50, 52], tail: [86, 86], top: [hx, hy - 7], center: [52, 64], w: 40, hips: [62, 84], feet: 97, shoulder: [44, 44] };
  },
  spider(ctx, P, F, o) {
    const legCol = mix(P.main, P.sub, 0.4);
    const legs = (far) => {
      for (let i = 0; i < 4; i++) {
        const bx = 40 + i * 4; const by = 64;
        const dir = i < 2 ? -1 : 1;
        const kx = bx + dir * (12 + i * 3) + (far ? 4 : 0); const ky = 44 + Math.abs(i - 1.5) * 3;
        const fx = bx + dir * (20 + i * 6) + (far ? 6 : 0);
        limb(ctx, [[bx, by], [kx, ky], [fx, 96]], 4, 2, far ? mix(legCol, '#000', 0.35) : legCol);
      }
    };
    legs(true);
    // 腹
    ellipse(ctx, 68, 56, 21, 17); fillStroke(ctx, rg(ctx, 62, 46, 2, 24, [[0, P.hi], [0.55, P.main], [1, P.lo]]), LINE, 1.5);
    ctx.fillStyle = rgba(P.accent, 0.8); poly(ctx, [[68, 46], [72, 54], [68, 62], [64, 54]]); ctx.fill(); ellipse(ctx, 68, 66, 3, 2); ctx.fill();
    // 胸と頭
    ellipse(ctx, 42, 64, 13, 10); fillStroke(ctx, rg(ctx, 38, 58, 1, 14, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.4);
    legs(false);
    for (let i = 0; i < 3; i++) eyeAt(ctx, 32 + i * 3.2, 61 - (i % 2) * 1.5, 1.2, P, o);
    eyeAt(ctx, 34, 57.5, 0.9, P, o); eyeAt(ctx, 38, 57, 0.9, P, o);
    if (!o.cute) for (const s of [0, 4]) { taper(ctx, [[31 + s, 68], [29 + s, 73], [32 + s, 76]], 2.4, 0.6); fillStroke(ctx, '#2a1a1a', LINE, 0.6); }
    return { head: [36, 62, 9], face: [32, 61], handF: [24, 90], handB: [80, 90], back: [66, 42], tail: [86, 58], top: [66, 39], center: [56, 60], w: 50, hips: [60, 64], feet: 97, shoulder: [44, 56] };
  },
  insect(ctx, P, F, o) {
    const legCol = mix(P.main, P.sub, 0.5);
    const legs = (far) => { for (let i = 0; i < 3; i++) { const bx = 38 + i * 13; limb(ctx, [[bx, 70], [bx - 8 + (far ? 4 : 0), 80], [bx - 10 + (far ? 5 : 0), 96]], 3.6, 2, far ? mix(legCol, '#000', 0.35) : legCol); } };
    legs(true);
    // 甲羅
    const sh = [[30, 64], [40, 48], [60, 44], [78, 52], [84, 66], [76, 76], [44, 78], [30, 74]];
    blob(ctx, sh, true, 0.6); fillStroke(ctx, lg(ctx, 0, 44, 0, 78, [[0, shade(P.main, 0.45)], [0.4, P.main], [1, P.lo]]), LINE, 1.5);
    ctx.save(); blob(ctx, sh, true, 0.6); ctx.clip();
    ctx.strokeStyle = rgba(P.lo, 0.8); ctx.lineWidth = 1.2; for (const x of [46, 58, 70]) { ctx.beginPath(); ctx.moveTo(x, 44); ctx.quadraticCurveTo(x + 3, 62, x - 1, 80); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ellipse(ctx, 52, 52, 14, 3.2, -0.15); ctx.fill();
    ctx.restore();
    // 頭と大顎
    ellipse(ctx, 26, 68, 9, 8); fillStroke(ctx, rg(ctx, 24, 64, 1, 10, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.3);
    if (!o.cute) for (const s of [-1, 1]) { taper(ctx, [[20, 70 + s * 3], [12, 70 + s * 5], [9, 70 + s * 1]], 3, 0.5); fillStroke(ctx, shade(P.sub, -0.2), LINE, 0.8); }
    ctx.strokeStyle = LINE; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(26, 61); ctx.quadraticCurveTo(20, 50, 12, 48); ctx.stroke(); ctx.beginPath(); ctx.moveTo(28, 61); ctx.quadraticCurveTo(26, 50, 20, 44); ctx.stroke();
    legs(false);
    eyeAt(ctx, 22, 66, 1.6, P, o);
    return { head: [26, 68, 8], face: [22, 66], handF: [16, 70], handB: [70, 90], back: [60, 46], tail: [82, 64], top: [56, 44], center: [56, 62], w: 54, hips: [74, 70], feet: 97, shoulder: [36, 58] };
  },
  ghost(ctx, P, F, o) {
    const pts = [[38, 18], [52, 20], [60, 34], [62, 54], [66, 70], [74, 84], [62, 80], [56, 88], [48, 78], [40, 84], [38, 70], [32, 54], [30, 34]];
    ctx.save(); ctx.globalAlpha *= 0.88;
    blob(ctx, pts, true, 0.5);
    fillStroke(ctx, lg(ctx, 0, 18, 0, 90, [[0, shade(P.main, 0.4)], [0.5, P.main], [1, rgba(P.sub, 0.2)]]), rgba(P.lo, 0.6), 1.2);
    ctx.restore();
    // 腕
    ctx.save(); ctx.globalAlpha *= 0.85;
    limb(ctx, [[36, 40], [26, 48], [18, 52]], 7, 2.6, lg(ctx, 18, 0, 38, 0, [[0, rgba(P.main, 0.3)], [1, P.main]]));
    ctx.restore();
    // 顔（くぼんだ目と口）
    ctx.fillStyle = '#0a060e';
    ellipse(ctx, 37, 32, 3.4, 4.4); ctx.fill(); ellipse(ctx, 46, 31.5, 3, 4); ctx.fill();
    ellipse(ctx, 41, 44, 3.2, 5); ctx.fill();
    eyeAt(ctx, 37, 32.5, 1.4, P, o); eyeAt(ctx, 46, 32, 1.3, P, o);
    glow(ctx, 44, 40, 34, P.accent, 0.2);
    return { head: [42, 30, 11], face: [37, 32], handF: [18, 52], handB: [60, 50], back: [56, 34], tail: [70, 82], top: [44, 18], center: [46, 48], w: 30, hips: [50, 70], feet: 90, shoulder: [40, 36], fly: 52 };
  },
  golem(ctx, P, F, o) {
    const rock = (pts, k = 1) => { poly(ctx, pts); fillStroke(ctx, lg(ctx, 0, Math.min(...pts.map((p) => p[1])), 0, Math.max(...pts.map((p) => p[1])), [[0, shade(P.main, 0.3 * k)], [0.6, P.main], [1, P.lo]]), LINE, 1.4); };
    // 奥の腕・脚
    rock([[60, 66], [70, 66], [72, 96], [58, 96]], 0.5);
    rock([[66, 36], [78, 40], [82, 58], [74, 62]], 0.5); rock([[72, 62], [84, 62], [86, 76], [72, 78]], 0.5);
    // 胴
    rock([[34, 30], [56, 22], [74, 32], [76, 56], [64, 70], [40, 70], [30, 54]]);
    // ひび（光る）
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(P.accent, 0.95); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(46, 30); ctx.lineTo(50, 42); ctx.lineTo(44, 50); ctx.lineTo(52, 62); ctx.moveTo(50, 42); ctx.lineTo(62, 46); ctx.stroke(); ctx.restore();
    glow(ctx, 52, 46, 10, P.accent, 0.6);
    rock([[38, 66], [52, 66], [54, 96], [36, 96]]);
    // 頭
    rock([[32, 20], [44, 14], [52, 22], [48, 32], [34, 32]]);
    eyeAt(ctx, 37, 24, 1.6, P, o); eyeAt(ctx, 43, 23.5, 1.4, P, o);
    // 手前の腕
    rock([[36, 34], [24, 40], [20, 58], [30, 60]]); rock([[16, 58], [32, 58], [34, 74], [14, 76]]);
    // 苔・小石
    ctx.fillStyle = rgba(mix(P.sub, '#3a6a2a', 0.5), 0.8); for (const [x, y] of [[50, 24], [62, 28], [28, 42]]) { ellipse(ctx, x, y, 3, 1.4); ctx.fill(); }
    return { head: [41, 24, 9], face: [37, 24], handF: [24, 74], handB: [80, 76], back: [64, 30], tail: [72, 60], top: [44, 14], center: [52, 46], w: 46, hips: [52, 68], feet: 97, shoulder: [38, 32] };
  },
  dragon(ctx, P, F, o) {
    const leg = (x, far) => { limb(ctx, [[x, 66], [x - 4, 80], [x + 2, 95]], 9, 6, far ? mix(P.main, P.sub, 0.6) : volFill(ctx, 66, 97, P)); claw(ctx, x - 3, 95.5, -1, 1); };
    leg(72, true); leg(44, true);
    // 尾
    limb(ctx, [[74, 66], [86, 72], [94, 82], [96, 92]], 12, 2.5, volFill(ctx, 64, 96, P));
    // 胴
    const bd = [[40, 56], [56, 50], [76, 54], [82, 66], [72, 76], [48, 76], [38, 68]];
    blob(ctx, bd, true, 0.6); fillStroke(ctx, volFill(ctx, 50, 76, P), LINE, 1.5);
    ctx.save(); blob(ctx, bd, true, 0.6); ctx.clip(); ctx.fillStyle = rgba(P.belly, 0.6); ellipse(ctx, 58, 78, 22, 7); ctx.fill();
    ctx.strokeStyle = rgba(P.lo, 0.55); ctx.lineWidth = 0.7; for (let i = 0; i < 8; i++) { line(ctx, 46 + i * 4, 72, 47 + i * 4, 77); ctx.stroke(); } ctx.restore();
    leg(66, false); leg(46, false);
    // 首と頭
    limb(ctx, [[46, 60], [36, 48], [30, 36], [26, 28]], 13, 9, sideFill(ctx, 24, 48, P));
    ctx.save(); taper(ctx, [[46, 60], [36, 48], [30, 36], [26, 28]], 13, 9); ctx.clip(); ctx.strokeStyle = rgba(P.belly, 0.75); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(42, 64); ctx.quadraticCurveTo(30, 48, 22, 30); ctx.stroke(); ctx.restore();
    const hx = 22; const hy = 24;
    blob(ctx, [[hx + 8, hy - 6], [hx + 10, hy + 2], [hx + 4, hy + 7], [hx - 6, hy + 8], [hx - 15, hy + 5], [hx - 16, hy + 1], [hx - 10, hy - 3], [hx - 2, hy - 7]], true, 0.5);
    fillStroke(ctx, rg(ctx, hx - 2, hy - 4, 1, 15, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.4);
    if (!o.cute) { ctx.fillStyle = '#1a0808'; ctx.beginPath(); ctx.moveTo(hx - 15, hy + 4); ctx.lineTo(hx - 2, hy + 6); ctx.lineTo(hx - 13, hy + 7); ctx.closePath(); ctx.fill(); teeth(ctx, hx - 14, hy + 4.4, hx - 4, hy + 5.6, 4, 1.8); }
    // 角（いつも小さく）
    taper(ctx, [[hx + 4, hy - 5], [hx + 10, hy - 11], [hx + 16, hy - 13]], 3.4, 0.6); fillStroke(ctx, '#e8dcc0', LINE, 0.8);
    eyeAt(ctx, hx - 4, hy - 1.5, 1.7, P, o);
    return { head: [hx - 2, hy, 9], face: [hx - 5, hy - 1.5], handF: [42, 90], handB: [68, 90], back: [62, 52], tail: [94, 84], top: [hx + 2, hy - 7], center: [60, 62], w: 46, hips: [72, 66], feet: 97, shoulder: [46, 56] };
  },
  plant(ctx, P, F, o) {
    const green = mix(P.main, '#3a6a2a', 0.15);
    // 根
    ctx.fillStyle = shade(P.sub, -0.1);
    for (const [a, b] of [[36, 20], [62, 82], [44, 30], [56, 74]]) { limb(ctx, [[50, 86], [(a + b) / 2, 92], [a < 50 ? a - 10 : b + 8, 97]], 7, 2, shade(P.sub, -0.1)); }
    // 茎
    limb(ctx, [[52, 92], [56, 74], [50, 58], [40, 44], [34, 38]], 12, 8, sideFill(ctx, 30, 60, { ...P, main: green }));
    // 葉
    for (const [x, y, s, r] of [[54, 76, 1, 0.5], [48, 62, -1, -0.6], [56, 58, 1, 0.9], [44, 50, -1, -0.3]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      blob(ctx, [[0, 0], [s * 8, -5], [s * 18, -2], [s * 10, 3]], true, 0.6); fillStroke(ctx, lg(ctx, 0, -5, 0, 4, [[0, shade(green, 0.35)], [1, shade(green, -0.4)]]), LINE, 1);
      ctx.strokeStyle = rgba(shade(green, -0.5), 0.7); ctx.lineWidth = 0.6; line(ctx, 0, 0, s * 16, -2); ctx.stroke(); ctx.restore();
    }
    // 頭（花の口）
    const hx = 32; const hy = 34;
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i / 6) * TAU; ctx.save(); ctx.translate(hx + 2, hy); ctx.rotate(a); blob(ctx, [[0, 0], [5, -6], [0, -15], [-5, -6]], true, 0.6); fillStroke(ctx, lg(ctx, 0, -15, 0, 0, [[0, shade(P.accent, 0.3)], [1, shade(P.accent, -0.3)]]), LINE, 1); ctx.restore(); }
    ellipse(ctx, hx, hy, 10, 9); fillStroke(ctx, rg(ctx, hx - 2, hy - 3, 1, 12, [[0, shade(P.main, 0.4)], [0.7, P.main], [1, P.lo]]), LINE, 1.3);
    if (!o.cute) {
      ctx.fillStyle = '#2a0810'; ctx.beginPath(); ctx.ellipse(hx - 4, hy + 1, 6, 4.5, 0, 0, TAU); ctx.fill();
      teeth(ctx, hx - 9, hy - 2.5, hx + 1, hy - 2.5, 5, 2.4); ctx.save(); ctx.translate(0, 2 * hy + 2); ctx.scale(1, -1); teeth(ctx, hx - 9, hy - 2.5, hx + 1, hy - 2.5, 5, 2.4); ctx.restore();
    }
    eyeAt(ctx, hx + 2, hy - 4, 1.4, P, o); if (o.cute) eyeAt(ctx, hx - 4, hy - 4, 1.4, P, o);
    return { head: [hx, hy, 10], face: [hx - 4, hy - 2], handF: [26, 60], handB: [62, 60], back: [56, 64], tail: [60, 80], top: [hx, hy - 12], center: [48, 62], w: 30, hips: [52, 86], feet: 97, shoulder: [46, 50] };
  },
  aquatic(ctx, P, F, o) {
    const A = PLANS.biped(ctx, P, F, { ...o, hunch: 6 });
    // 魚の頭: 大きな目、えら、背びれ
    const [hx, hy] = A.head;
    blob(ctx, [[hx - 12, hy + 2], [hx - 6, hy - 9], [hx + 6, hy - 10], [hx + 10, hy], [hx + 6, hy + 9], [hx - 8, hy + 8]], true, 0.6);
    fillStroke(ctx, rg(ctx, hx - 4, hy - 4, 1, 14, [[0, shade(P.main, 0.4)], [0.6, P.main], [1, P.lo]]), LINE, 1.3);
    ctx.fillStyle = rgba(P.belly, 0.6); ellipse(ctx, hx - 4, hy + 5, 7, 3); ctx.fill();
    ctx.strokeStyle = rgba(P.lo, 0.9); ctx.lineWidth = 0.9; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(hx + 4 + i * 1.8, hy + 2, 4, -0.9, 0.9); ctx.stroke(); }
    ellipse(ctx, hx - 6, hy - 2, 3.4, 3.4); ctx.fillStyle = '#f0e8d0'; ctx.fill(); stroke(ctx, LINE, 0.8); eyeAt(ctx, hx - 6.5, hy - 2, 1.6, P, o);
    if (!o.cute) teeth(ctx, hx - 11, hy + 3, hx - 5, hy + 4, 3, 1.6);
    poly(ctx, [[hx - 2, hy - 9], [hx + 6, hy - 18], [hx + 14, hy - 12], [hx + 16, hy - 2], [hx + 8, hy - 6]]); fillStroke(ctx, lg(ctx, 0, hy - 18, 0, hy, [[0, shade(P.accent, 0.3)], [1, shade(P.accent, -0.3)]]), LINE, 1);
    // 背びれ
    poly(ctx, [[54, 38], [64, 40], [62, 50], [60, 58]]); fillStroke(ctx, rgba(P.accent, 0.95), LINE, 1);
    // 鱗
    ctx.save(); ctx.globalAlpha *= 0.5; ctx.strokeStyle = shade(P.main, 0.4); ctx.lineWidth = 0.6;
    for (let y = 42; y < 68; y += 4) for (let x = 40 + (y % 8 ? 2 : 0); x < 58; x += 4) { ctx.beginPath(); ctx.arc(x, y, 2, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.restore();
    // 水かき
    ctx.fillStyle = rgba(P.accent, 0.8); poly(ctx, [[28, 60], [24, 66], [30, 64], [33, 66]]); ctx.fill();
    return A;
  },
  demon(ctx, P, F, o) {
    // 逆関節の脚
    const leg = (x, far) => { const f = far ? mix(P.main, P.sub, 0.55) : volFill(ctx, 64, 97, P); limb(ctx, [[x, 66], [x - 6, 78], [x + 2, 86], [x - 1, 96]], 10, 5, f); poly(ctx, [[x - 6, 95], [x + 3, 95], [x + 2, 98], [x - 6, 98]]); fillStroke(ctx, '#1a1214', LINE, 0.8); };
    leg(58, true);
    limb(ctx, [[60, 38], [68, 50], [64, 62]], 8, 6, mix(P.main, P.sub, 0.55));
    if (!F.has('tail')) limb(ctx, [[58, 66], [72, 72], [82, 66], [86, 58]], 5, 1.5, volFill(ctx, 56, 74, P));
    const tb = [[38, 34], [52, 30], [64, 36], [64, 52], [58, 68], [44, 68], [38, 56], [34, 44]];
    blob(ctx, tb, true, 0.6); fillStroke(ctx, volFill(ctx, 30, 68, P), LINE, 1.5);
    ctx.save(); blob(ctx, tb, true, 0.6); ctx.clip(); ctx.strokeStyle = rgba(P.lo, 0.65); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, 42); ctx.quadraticCurveTo(46, 47, 52, 42); ctx.stroke(); for (let i = 0; i < 3; i++) { line(ctx, 41, 52 + i * 4, 49, 52 + i * 4); ctx.stroke(); }
    ctx.fillStyle = rgba(P.sub, 0.5); ctx.fillRect(30, 62, 40, 8); ctx.restore();
    leg(46, false);
    // 頭
    const hx = 40; const hy = 24;
    blob(ctx, [[hx - 1, hy - 9], [hx + 7, hy - 6], [hx + 8, hy + 3], [hx + 2, hy + 9], [hx - 6, hy + 8], [hx - 9, hy + 1], [hx - 7, hy - 6]], true, 0.6);
    fillStroke(ctx, rg(ctx, hx - 3, hy - 5, 1, 12, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.3);
    if (!F.has('horns')) { for (const s of [0, 1]) { taper(ctx, [[hx - 2 + s * 6, hy - 7], [hx - 4 + s * 8, hy - 13], [hx - 9 + s * 9, hy - 16]], 3, 0.5); fillStroke(ctx, '#2a1a14', LINE, 0.8); } }
    eyeAt(ctx, hx - 5, hy - 1, 1.6, P, o); eyeAt(ctx, hx - 1, hy - 1.4, 1.4, P, o);
    if (!o.cute) { ctx.fillStyle = '#1a0808'; ctx.beginPath(); ctx.moveTo(hx - 8, hy + 3.5); ctx.quadraticCurveTo(hx - 4, hy + 7, hx + 1, hy + 4); ctx.closePath(); ctx.fill(); teeth(ctx, hx - 7.5, hy + 3.8, hx, hy + 4.4, 4, 1.8); }
    limb(ctx, [[42, 40], [32, 50], [26, 60]], 9, 6.5, volFill(ctx, 40, 62, P));
    claw(ctx, 24, 61, -1, 1.2);
    return { head: [hx, hy, 9], face: [hx - 5, hy - 1], handF: [25, 61], handB: [64, 62], back: [56, 38], tail: [60, 66], top: [hx, hy - 9], center: [50, 50], w: 30, hips: [52, 66], feet: 97, shoulder: [44, 38] };
  },
  elemental(ctx, P, F, o) {
    // 下の渦
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = rgba(P.accent, 0.35 - i * 0.07); ctx.lineWidth = 3 - i * 0.5; ctx.beginPath(); ctx.ellipse(50, 84 + i * 3, 20 - i * 3, 4, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // 欠片の体
    const r = rng(P.seed);
    const chunks = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + r() * 0.4; const d = 18 + r() * 8; chunks.push([50 + Math.cos(a) * d, 50 + Math.sin(a) * d * 1.1, 5 + r() * 5, a]); }
    glow(ctx, 50, 50, 40, P.accent, 0.4);
    for (const [x, y, s, a] of chunks) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      poly(ctx, [[-s, -s * 0.6], [s * 0.3, -s], [s, -s * 0.2], [s * 0.6, s * 0.8], [-s * 0.7, s * 0.7]]);
      fillStroke(ctx, lg(ctx, 0, -s, 0, s, [[0, P.hi], [0.6, P.main], [1, P.lo]]), LINE, 1.1);
      ctx.restore();
    }
    // 核
    ellipse(ctx, 50, 50, 14, 15); fillStroke(ctx, rg(ctx, 46, 44, 1, 16, [[0, '#ffffff'], [0.3, shade(P.accent, 0.4)], [0.75, P.main], [1, P.lo]]), LINE, 1.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 50, 48, 18, P.accent, 0.7); ctx.restore();
    eyeAt(ctx, 44, 47, 1.8, P, o); eyeAt(ctx, 50, 46.5, 1.6, P, o);
    return { head: [48, 48, 14], face: [44, 47], handF: [26, 50], handB: [74, 52], back: [62, 36], tail: [62, 72], top: [50, 28], center: [50, 50], w: 50, hips: [50, 66], feet: 88, shoulder: [40, 40], fly: 52 };
  },
  construct(ctx, P, F, o) {
    const plate = (pts) => { poly(ctx, pts); fillStroke(ctx, metal(ctx, Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), P.main, 0.8), LINE, 1.3); };
    const piston = (x, far) => { roundRect(ctx, x - 3, 68, 6, 24, 1.5); fillStroke(ctx, far ? shade(P.sub, -0.2) : metal(ctx, x + 3, 68, x - 3, 92, P.sub), LINE, 1); roundRect(ctx, x - 6, 90, 12, 7, 2); fillStroke(ctx, shade(P.main, -0.3), LINE, 1); };
    piston(60, true);
    plate([[62, 40], [72, 42], [74, 60], [66, 62]]);
    // 胴（箱）
    plate([[34, 34], [66, 32], [70, 66], [36, 70]]);
    ctx.strokeStyle = rgba('#000', 0.45); ctx.lineWidth = 0.9; line(ctx, 36, 52, 69, 50); ctx.stroke();
    for (const [x, y] of [[38, 37], [63, 36], [39, 66], [66, 63]]) { ctx.fillStyle = '#e8e2d8'; ellipse(ctx, x, y, 1.1, 1.1); ctx.fill(); }
    // 炉の窓
    roundRect(ctx, 42, 54, 16, 9, 2); ctx.fillStyle = '#1a0a04'; ctx.fill(); stroke(ctx, LINE, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(P.accent, 0.85); for (let i = 0; i < 4; i++) ctx.fillRect(44 + i * 3.6, 56, 2, 5); ctx.restore();
    piston(42, false);
    // 頭（一つ目）
    plate([[36, 18], [54, 16], [56, 32], [36, 34]]);
    ellipse(ctx, 42, 25, 5, 5); ctx.fillStyle = '#100808'; ctx.fill(); stroke(ctx, LINE, 1);
    eyeAt(ctx, 42, 25, 2.6, P, o);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1.3; line(ctx, 50, 16, 52, 8); ctx.stroke(); ctx.fillStyle = P.accent; ellipse(ctx, 52, 7, 1.6, 1.6); ctx.fill();
    // 手前の腕（はさみ）
    plate([[36, 38], [26, 46], [30, 50], [40, 44]]);
    plate([[26, 46], [20, 60], [26, 62], [30, 50]]);
    taper(ctx, [[22, 60], [16, 66], [20, 72]], 3.4, 1); fillStroke(ctx, metal(ctx, 22, 60, 16, 72, P.main), LINE, 1);
    taper(ctx, [[26, 61], [28, 68], [24, 72]], 3.4, 1); fillStroke(ctx, metal(ctx, 26, 60, 24, 72, P.main), LINE, 1);
    return { head: [45, 25, 10], face: [42, 25], handF: [21, 66], handB: [72, 60], back: [64, 36], tail: [68, 60], top: [45, 16], center: [52, 50], w: 36, hips: [52, 68], feet: 97, shoulder: [38, 40] };
  },
};

// ---------------- 飾り（後ろ側）
function featBack(ctx, F, A, P, o) {
  if (F.has('wings') || o.plan === 'flyer' || o.plan === 'dragon') drawWings(ctx, A, P, o, 'far');
  if (F.has('tail')) {
    const [tx, ty] = A.tail;
    limb(ctx, [[tx, ty], [tx + 12, ty + 4], [tx + 20, ty - 4], [tx + 24, ty - 14]], 7, 2, volFill(ctx, ty - 14, ty + 6, P));
    if (o.plan === 'insect') { // 蠍の尾
      limb(ctx, [[tx - 4, ty - 2], [tx + 8, ty - 22], [tx, ty - 40], [tx - 14, ty - 42]], 8, 4, volFill(ctx, ty - 42, ty, P));
      taper(ctx, [[tx - 14, ty - 42], [tx - 20, ty - 38], [tx - 22, ty - 32]], 4, 0.4); fillStroke(ctx, P.accent, LINE, 1);
    } else { poly(ctx, [[tx + 22, ty - 14], [tx + 28, ty - 20], [tx + 27, ty - 10]]); fillStroke(ctx, P.lo, LINE, 0.8); }
  }
  if (F.has('chains')) { ctx.save(); ctx.globalAlpha *= 0.7; chain(ctx, A.back[0] + 6, A.back[1], A.back[0] + 12, A.feet - 4, P); ctx.restore(); }
  if (F.has('bow') && !HUMANOID.has(o.plan)) { ctx.save(); ctx.translate(A.back[0] + 4, A.back[1] + 10); ctx.rotate(0.5); ctx.scale(0.42, 0.42); drawWeapon(ctx, 'bow', 0, 0, monsterWeaponPal(P)); ctx.restore(); }
  if (F.has('spikes')) {
    const [bx, by] = A.back;
    for (let i = 0; i < 5; i++) { const x = bx - 8 + i * 5; const y = by - 2 + Math.abs(i - 2) * 2; poly(ctx, [[x - 2.4, y + 2], [x + 2, y - 9 + Math.abs(i - 2) * 2], [x + 2.6, y + 2]]); fillStroke(ctx, lg(ctx, 0, y - 9, 0, y + 2, [[0, '#f0e8d8'], [1, shade(P.sub, -0.2)]]), LINE, 0.9); }
  }
  if (F.has('crystals')) {
    const [bx, by] = A.back;
    for (let i = 0; i < 4; i++) { const x = bx - 6 + i * 5; const hgt = 10 + (i % 2) * 7; poly(ctx, [[x - 3, by + 3], [x, by - hgt], [x + 3, by + 3]]); fillStroke(ctx, lg(ctx, x - 3, by - hgt, x + 3, by, [[0, '#ffffff'], [0.4, shade(P.accent, 0.3)], [1, shade(P.accent, -0.4)]]), LINE, 0.9); }
    glow(ctx, bx, by - 6, 14, P.accent, 0.35);
  }
}
// ---------------- 飾り（前側）
function featFront(ctx, F, A, P, o) {
  const [hx, hy, hr] = A.head;
  if (F.has('armor')) {
    const [sx, sy] = A.shoulder;
    ellipse(ctx, sx + 2, sy, hr * 0.85, hr * 0.6, -0.2); fillStroke(ctx, metal(ctx, sx + 10, sy - 6, sx - 6, sy + 6, '#8e96a2'), LINE, 1.2);
    ctx.fillStyle = '#d2ad55'; ctx.fillRect(sx - 4, sy + 3, 12, 1.2);
    const [cx, cy] = A.center;
    ctx.save(); ctx.globalAlpha *= 0.92; roundRect(ctx, cx - A.w * 0.28, cy - 6, A.w * 0.5, 13, 3); fillStroke(ctx, metal(ctx, cx + 10, cy - 6, cx - 10, cy + 7, '#7e8692'), LINE, 1.1); ctx.restore();
    ctx.fillStyle = '#efe6d2'; for (const dx of [-0.2, 0.15]) { ellipse(ctx, cx + A.w * dx, cy, 0.9, 0.9); ctx.fill(); }
  }
  if (F.has('bones')) {
    const [cx, cy] = A.center;
    ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - 6, cy - 6 + i * 4); ctx.quadraticCurveTo(cx, cy - 8 + i * 4, cx + 6, cy - 5 + i * 4); ctx.stroke(); }
    ctx.strokeStyle = LINE; ctx.lineWidth = 0.6; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - 6, cy - 5 + i * 4); ctx.quadraticCurveTo(cx, cy - 7 + i * 4, cx + 6, cy - 4 + i * 4); ctx.stroke(); }
    // 骨の首飾り
    const [sx, sy] = A.shoulder; skull(ctx, sx - 2, sy + 6, 3.2);
  }
  if (F.has('chains')) chain(ctx, A.shoulder[0] - 6, A.shoulder[1] - 2, A.hips[0] + 8, A.hips[1] + 2, P);
  if (F.has('gears')) { gear(ctx, A.center[0] + 4, A.center[1] - 2, 6, P, 8); gear(ctx, A.shoulder[0] + 1, A.shoulder[1] + 1, 4, P, 6); }
  if (F.has('tentacles')) {
    const r = rng(P.seed + 7);
    for (let i = 0; i < 4; i++) { const x = A.hips[0] - 10 + i * 6; const y = A.hips[1] - 2; limb(ctx, [[x, y], [x - 3 + r() * 6, y + 9], [x - 6 + r() * 8, y + 16], [x - 10 + r() * 6, y + 20]], 4, 0.8, lg(ctx, 0, y, 0, y + 20, [[0, mix(P.main, P.accent, 0.3)], [1, P.accent]])); }
    for (let i = 0; i < 3; i++) { const x = hx - hr * 0.6 + i * 2.5; limb(ctx, [[x, hy + hr * 0.5], [x - 2, hy + hr + 3], [x - 4, hy + hr + 8]], 2.4, 0.6, mix(P.main, P.accent, 0.4)); }
  }
  // 頭の飾り
  if (F.has('hood') && o.plan !== 'caster') {
    blob(ctx, [[hx + 1, hy - hr - 4], [hx + hr + 2, hy - hr * 0.5], [hx + hr + 3, hy + hr * 0.6], [hx + hr * 0.4, hy + hr + 2], [hx - hr * 0.2, hy + 1], [hx - hr * 0.6, hy - hr * 0.6]], true, 0.6);
    fillStroke(ctx, lg(ctx, 0, hy - hr - 4, 0, hy + hr, [[0, shade(P.sub, 0.25)], [1, shade(P.sub, -0.4)]]), LINE, 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, hx - 2, hy - 2, hr * 0.7, hr * 0.3); ctx.fill();
  }
  if (F.has('mask')) {
    const [fx, fy] = A.face;
    blob(ctx, [[fx - 3, fy - hr * 0.55], [fx + hr * 0.7, fy - hr * 0.6], [fx + hr * 0.8, fy + hr * 0.3], [fx + 1, fy + hr * 0.75], [fx - 4, fy + hr * 0.3]], true, 0.6);
    fillStroke(ctx, lg(ctx, fx, fy - hr, fx, fy + hr, [[0, '#f0e8d4'], [1, '#a89c80']]), LINE, 1.1);
    ctx.fillStyle = '#100810'; ellipse(ctx, fx + 0.5, fy - 0.5, 1.6, 1.2); ctx.fill(); ellipse(ctx, fx + 4.5, fy - 0.8, 1.4, 1.1); ctx.fill();
    glow(ctx, fx + 0.5, fy - 0.5, 3.5, P.eye, 0.8);
    ctx.strokeStyle = rgba(P.accent, 0.9); ctx.lineWidth = 0.8; line(ctx, fx + 2.5, fy - hr * 0.5, fx + 2.5, fy + hr * 0.6); ctx.stroke();
  }
  if (F.has('horns')) {
    for (const s of [0, 1]) {
      const bx = hx - hr * 0.2 + s * hr * 0.6; const by = hy - hr * 0.7;
      limb(ctx, [[bx, by], [bx + 2 + s * 2, by - hr * 0.7], [bx + 6 + s * 4, by - hr * 1.1], [bx + 4 + s * 7, by - hr * 1.5]], hr * 0.42, 0.6, lg(ctx, 0, by - hr * 1.5, 0, by, [[0, '#f4ecd8'], [1, shade(P.sub, -0.1)]]));
    }
  }
  if (F.has('crown') || (o.boss && !F.has('horns') && !F.has('hood') && ['biped', 'brute', 'caster', 'demon', 'aquatic', 'golem'].includes(o.plan))) {
    const [tx, ty] = A.top;
    const cw = hr * 1.4;
    poly(ctx, [[tx - cw / 2, ty + 2], [tx - cw / 2, ty - 4], [tx - cw / 4, ty - 1], [tx, ty - 7], [tx + cw / 4, ty - 1], [tx + cw / 2, ty - 4], [tx + cw / 2, ty + 2]]);
    fillStroke(ctx, metal(ctx, tx + cw / 2, ty - 7, tx - cw / 2, ty + 2, '#e2b850'), LINE, 1);
    ctx.fillStyle = '#d0203a'; ellipse(ctx, tx, ty - 1, 1.4, 1.4); ctx.fill(); ctx.fillStyle = '#3aa0ff'; ellipse(ctx, tx - cw / 3, ty, 0.9, 0.9); ctx.fill(); ellipse(ctx, tx + cw / 3, ty, 0.9, 0.9); ctx.fill();
  }
  // 持ち物
  const wp = monsterWeaponPal(P);
  if (F.has('shield')) { ctx.save(); ctx.translate(A.handB[0] - 4, A.handB[1] - 8); ctx.scale(0.36, 0.36); drawOffhand(ctx, 'shield', 0, 0, { ...wp, cloth: P.sub }); ctx.restore(); }
  const held = F.has('staff') ? 'staff' : F.has('axe') ? 'axe' : F.has('sword') ? 'sword' : null;
  if (F.has('bow') && HUMANOID.has(o.plan)) { const [x, y] = A.handF; ctx.save(); ctx.translate(x, y); ctx.scale(-0.4, 0.4); drawWeapon(ctx, 'bow', 0, 0, monsterWeaponPal(P)); ctx.restore(); }
  if (held) { const [x, y] = A.handF; ctx.save(); ctx.translate(x, y); ctx.rotate(held === 'staff' ? -0.12 : -0.5); const k = held === 'staff' ? 0.5 : 0.42; ctx.scale(k, k); drawWeapon(ctx, held, 0, 0, held === 'staff' ? { ...wp, glow: P.accent } : wp); ctx.restore(); }
  if (F.has('wings') || o.plan === 'flyer' || o.plan === 'dragon') drawWings(ctx, A, P, o, 'near');
  // 体を包む効果
  if (F.has('ice')) {
    const [cx, cy] = A.center;
    ctx.save(); ctx.globalAlpha *= 0.9;
    for (const [dx, dy, s] of [[-A.w * 0.3, -8, 1], [A.w * 0.25, -10, 0.8], [0, -16, 0.7], [-A.w * 0.1, 6, 0.6]]) { const x = cx + dx; const y = cy + dy; poly(ctx, [[x - 3 * s, y + 4], [x - 1 * s, y - 10 * s], [x + 1.4 * s, y - 2], [x + 3 * s, y - 7 * s], [x + 4 * s, y + 4]]); fillStroke(ctx, lg(ctx, x, y - 10, x, y + 4, [[0, '#ffffff'], [0.5, '#bdefff'], [1, '#5ab0e8']]), rgba('#1a3a5a', 0.9), 0.8); }
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, cy, A.w * 0.8, '#6ad8ff', 0.18); ctx.restore();
  }
  if (F.has('flames')) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = rng(P.seed + 3);
    for (const [x, y, s] of [[hx + 2, hy - hr, 1.2], [A.shoulder[0] + 6, A.shoulder[1] - 2, 1], [A.back[0], A.back[1] - 2, 0.9], [A.hands?.[0] ?? A.handF[0], A.handF[1] - 2, 0.7]]) flame(ctx, x, y, 8 * s, r);
    ctx.restore();
  }
  if (F.has('glow')) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, A.center[0], A.center[1], A.w * 1.1, P.accent, 0.22);
    ctx.strokeStyle = rgba(P.accent, 0.7); ctx.lineWidth = 0.8;
    const r = rng(P.seed + 11);
    for (let i = 0; i < 5; i++) { const x = A.center[0] - A.w * 0.3 + r() * A.w * 0.6; const y = A.center[1] - 10 + r() * 20; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r() * 6 - 3, y + 5); ctx.lineTo(x + r() * 6 - 3, y + 9); ctx.stroke(); }
    ctx.restore();
  }
}

function monsterWeaponPal(P) { return { blade: '#9aa0a8', guard: shade(P.sub, 0.1), grip: shade(P.sub, -0.3), wood: '#5a3a22', gem: P.eye, cloth: P.sub, glow: null }; }
function chain(ctx, x0, y0, x1, y1, P) {
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4));
  for (let i = 0; i <= n; i++) {
    const t = i / n; const x = x0 + (x1 - x0) * t; const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(i % 2 ? 1.2 : 0.2);
    ellipse(ctx, 0, 0, 2.4, 1.4); ctx.lineWidth = 1.2; ctx.strokeStyle = LINE; ctx.stroke(); ctx.lineWidth = 0.7; ctx.strokeStyle = '#b8bcc4'; ctx.stroke();
    ctx.restore();
  }
  void P;
}
function gear(ctx, x, y, r, P, teethN = 8) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < teethN * 2; i++) { const a = (i / (teethN * 2)) * TAU; const rr = i % 2 ? r : r * 1.25; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); fillStroke(ctx, metal(ctx, r, -r, -r, r, '#c89a5a'), LINE, 0.9);
  ellipse(ctx, 0, 0, r * 0.4, r * 0.4); ctx.fillStyle = '#2a1a0a'; ctx.fill();
  ctx.restore();
  void P;
}
function skull(ctx, x, y, r) {
  blob(ctx, [[x, y - r], [x + r, y - r * 0.5], [x + r * 0.8, y + r * 0.6], [x + r * 0.3, y + r], [x - r * 0.3, y + r], [x - r * 0.8, y + r * 0.6], [x - r, y - r * 0.5]], true, 0.6);
  fillStroke(ctx, '#efe6d0', LINE, 0.7);
  ctx.fillStyle = '#1a1018'; ellipse(ctx, x - r * 0.35, y, r * 0.25, r * 0.3); ctx.fill(); ellipse(ctx, x + r * 0.35, y, r * 0.25, r * 0.3); ctx.fill();
}
function flame(ctx, x, y, s, r) {
  for (let i = 0; i < 3; i++) {
    const ox = (r() - 0.5) * s * 0.6; const hgt = s * (1.4 - i * 0.3);
    const col = i === 0 ? '#ff5a10' : i === 1 ? '#ffa030' : '#fff0a0';
    ctx.fillStyle = rgba(col, 0.85);
    ctx.beginPath(); ctx.moveTo(x + ox - s * 0.5 * (1 - i * 0.25), y); ctx.quadraticCurveTo(x + ox - s * 0.4, y - hgt * 0.6, x + ox + s * 0.1, y - hgt); ctx.quadraticCurveTo(x + ox + s * 0.2, y - hgt * 0.4, x + ox + s * 0.5 * (1 - i * 0.25), y); ctx.closePath(); ctx.fill();
  }
}

/** 翼（far = 奥の翼、near = 手前の翼）。羽ばたきは scene が部品を縦に縮めて作る */
function drawWings(ctx, A, P, o, which) {
  const [bx, by] = A.back;
  const big = o.plan === 'dragon' ? 1.08 : o.plan === 'flyer' ? 1.25 : 1;
  const feather = o.feather;
  const col = o.plan === 'flyer' || o.plan === 'dragon' || o.plan === 'demon' ? mix(P.main, P.sub, 0.35) : P.sub;
  ctx.save();
  ctx.translate(bx, by);
  if (o.plan === 'dragon') ctx.translate(-6, 0);
  if (which === 'far') { ctx.rotate(o.plan === 'flyer' ? -0.75 : -0.45); ctx.scale(0.85, 0.85); ctx.translate(2, -2); }
  const s = 26 * big;
  if (feather) {
    for (let i = 0; i < 6; i++) { const a = -2.2 + i * 0.22; taper(ctx, [[0, 0], [Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6], [Math.cos(a) * s, Math.sin(a) * s]], 7, 2); fillStroke(ctx, lg(ctx, 0, -s, 0, 0, [[0, '#ffffff'], [1, shade(col, -0.1)]]), LINE, 0.8); }
  } else {
    // 膜の翼
    const tip = [s * 1.05, -s * 0.95];
    const pts = [[0, 0], [s * 0.35, -s * 0.75], tip, [s * 1.0, -s * 0.2], [s * 0.72, -s * 0.12], [s * 0.6, s * 0.18], [s * 0.36, 0.02 * s], [s * 0.2, s * 0.28]];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.3, -s * 0.95, tip[0], tip[1]);
    ctx.quadraticCurveTo(s * 0.92, -s * 0.5, s * 1.0, -s * 0.2); ctx.quadraticCurveTo(s * 0.84, -s * 0.22, s * 0.72, -s * 0.12); ctx.quadraticCurveTo(s * 0.66, 0, s * 0.6, s * 0.18); ctx.quadraticCurveTo(s * 0.48, 0.04 * s, s * 0.36, 0.02 * s); ctx.quadraticCurveTo(s * 0.26, s * 0.12, s * 0.2, s * 0.28); ctx.closePath();
    fillStroke(ctx, lg(ctx, 0, -s, s, s * 0.3, [[0, shade(col, which === 'far' ? -0.35 : 0.15)], [1, shade(col, which === 'far' ? -0.6 : -0.35)]]), LINE, 1.2);
    ctx.strokeStyle = rgba(shade(col, -0.6), 0.9); ctx.lineWidth = 1.2;
    for (const p of [pts[2], pts[3], pts[5], pts[7]]) { ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.72); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
    ctx.lineWidth = 2; ctx.strokeStyle = shade(col, -0.2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.3, -s * 0.95, tip[0], tip[1]); ctx.stroke();
    claw(ctx, s * 0.32, -s * 0.76, 1, 0.6);
  }
  ctx.restore();
  void A; void o;
}

// ---------------- 組み立て
const FEAT_FOR_BODY = { flyer: [], dragon: [] };
const HUMANOID = new Set(['biped', 'brute', 'demon', 'aquatic', 'skeleton']);
function featuresOf(def) {
  const F = new Set([...(def?.features || []), ...(FEAT_FOR_BODY[def?.body] || [])]);
  // 飾りの指定が無くても、攻撃の型に合う持ち物を持たせる
  if (HUMANOID.has(def?.body) && !['bow', 'staff', 'sword', 'axe'].some((k) => F.has(k))) {
    if (def.attack === 'ranged' && (!def.proj || def.proj === 'arrow')) F.add('bow');
    else if (def.attack === 'caster') F.add('staff');
  }
  return F;
}

/**
 * 1 体を描く。def: { body, features, palette, boss, flying, id }。
 * o: { cute, flip（右向きにする）, parts: 'body'|'wingsFar'|'wingsNear'|undefined（全部） }
 */
export function drawCreature(ctx, def, w, h, ay, o = {}) {
  let plan = PLANS[def?.body] ? def.body : 'biped';
  if (plan === 'biped' && isSkeletal(def)) plan = 'skeleton';
  const F = featuresOf(def);
  const P = palOf(def?.palette, def?.id || plan);
  const boss = !!def?.boss;
  const opt = { plan, boss, cute: !!o.cute, feather: /holy|angel|天|聖|白/.test(`${def?.family || ''}${def?.name || ''}`) && F.has('wings') };
  ctx.save();
  if (o.flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  // 100×100 の箱へ。足元（y=97）を基準点に、空を飛ぶ物は体の中心（y=56）を基準点に合わせる
  const T = boxXf(def, w, h, ay);
  ctx.translate(T.ox, T.oy); ctx.scale(T.k, T.k);
  // 同じ体の形でも敵ごとに少し体つきを変える（ID から決まる）
  if (def?.id && !o.parts) { const vr = rng(`shape:${def.id}`); const sx = 0.92 + vr() * 0.14; const sy = 0.94 + vr() * 0.1; ctx.scale(sx, sy); }
  ctx.translate(-50, -T.py);
  // ボスの気配
  if (boss && o.parts !== 'wingsFar' && o.parts !== 'wingsNear') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 50, 56, 52, P.accent, 0.28); ctx.restore(); }
  const only = o.parts;
  // 体の点を知るため、まず見えない所で描いて A を得る（翼だけの部品のとき）
  if (only === 'wingsFar' || only === 'wingsNear') {
    const A = anchorsOf(plan, P, F, opt);
    drawWings(ctx, A, P, opt, only === 'wingsFar' ? 'far' : 'near');
    ctx.restore();
    return A;
  }
  const noWings = only === 'body';
  const A0 = anchorsOf(plan, P, F, opt);
  const F2 = noWings ? new Set([...F].filter((f) => f !== 'wings')) : F;
  const opt2 = noWings ? { ...opt, plan: plan === 'flyer' || plan === 'dragon' ? `${plan}_nw` : plan } : opt;
  featBack(ctx, F2, A0, P, opt2);
  const A = PLANS[plan](ctx, P, F, opt);
  featFront(ctx, F2, A, P, opt2);
  ctx.restore();
  return A;
}
const ANCH = new Map();
function anchorsOf(plan, P, F, opt) {
  const key = `${plan}|${opt.cute}`;
  if (ANCH.has(key)) return ANCH.get(key);
  // 何もしない ctx で形の点だけ求める
  const A = PLANS[plan](NULL_CTX, P, F, opt);
  ANCH.set(key, A);
  return A;
}
const NOOP = () => {};
const NULL_CTX = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: NOOP }) : k === 'getTransform' ? () => ({ a: 1 }) : NOOP), set: () => true });

/** 骨だけの姿で描く敵か（不死の明るい色・骸骨という名前・骨の召喚物） */
function isSkeletal(def) {
  if (!def) return false;
  if (def.skeletal) return true;
  const n = `${def.id || ''} ${def.name || ''}`;
  if (/骸骨|skel|skeleton|lich/i.test(n)) return true;
  return def.family === 'undead' && luma(def.palette?.main || '#000') > 0.7 && !(def.features || []).includes('hood');
}
/** 100 の箱 → 枠の箱の変換 */
function boxXf(def, w, h, ay) {
  const s = def?.flying ? 0.88 : 1;
  const k0 = Math.min(w, h) / 100;
  return { ox: w / 2, oy: ay * h, k: k0 * s, py: def?.flying ? 56 : 97 };
}
/** 翼のある体か */
export function hasWings(def) { return !!def && (def.body === 'flyer' || def.body === 'dragon' || (def.features || []).includes('wings')); }

// ---------------- 枠の painter
export function paintMonsterSlot(ctx, spec, w, h) {
  const def = MONSTER[spec.params?.mon] || { body: 'biped', palette: {}, id: spec.id };
  outlined(ctx, w, h, (c) => drawCreature(c, def, w, h, spec.ay ?? 0.97, {}), { width: def.boss ? 1.8 : 1.4 });
  shadeLight(ctx, w, h);
}
/** 上から光・下は少し暗く（形の上だけ） */
export function shadeLight(ctx, w, h) {
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, 'rgba(255,240,220,0.12)'], [0.4, 'rgba(255,240,220,0)'], [0.75, 'rgba(10,6,20,0)'], [1, 'rgba(10,6,20,0.25)']]);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** 戦闘の画面用: 翼を別にした部品（羽ばたき）。無ければ null */
const PARTS = new Map();
export function monsterParts(id, kind = 'monster') {
  const key = `${kind}:${id}`;
  if (PARTS.has(key)) return PARTS.get(key);
  let def; let w; let h; let ay; let flip = false; let cute = false;
  if (kind === 'monster') { def = MONSTER[id]; const big = def?.boss ? 1.6 : 1; w = 150 * big; h = 150 * big; ay = def?.flying ? 0.6 : 0.97; }
  else { def = PET[id]; w = 90; h = 90; ay = 0.97; flip = true; cute = true; }
  let out = null;
  if (def && hasWings(def)) {
    const k = 2;
    const mk = (parts, outline) => layer(w, h, k, (c) => { outlined(c, w, h, (x) => drawCreature(x, def, w, h, ay, { parts, flip, cute }), { width: outline }); shadeLight(c, w, h); });
    const body = mk('body', def.boss ? 1.8 : 1.4);
    if (body) {
      const pl = PLANS[def.body] ? (def.body === 'biped' && isSkeletal(def) ? 'skeleton' : def.body) : 'biped';
      const A = anchorsOf(pl, palOf(def.palette, def.id), featuresOf(def), { plan: pl, cute });
      // 翼の付け根（箱の座標）
      const T = boxXf(def, w, h, ay);
      const bx = T.ox + (A.back[0] - 50) * T.k; const byy = T.oy + (A.back[1] - T.py) * T.k;
      const rx = flip ? w - bx : bx; const ry = byy;
      out = { body, far: mk('wingsFar', 1.2), near: mk('wingsNear', 1.2), root: [rx, ry], w, h };
    }
  }
  PARTS.set(key, out);
  return out;
}

// ---------------- 召喚物（名前から形を決める。知らない名前でも良く見える）
const MINION_LOOKS = [
  { re: /blood/, def: { body: 'golem', features: ['glow'], palette: { main: '#a02030', sub: '#4a0a10', eye: '#ffd0d0', accent: '#ff4050' } } },
  { re: /golem|colossus/, def: { body: 'golem', features: ['bones', 'glow'], palette: { main: '#c8bca0', sub: '#5a4a3a', eye: '#c890ff', accent: '#b47cff' } } },
  { re: /skelmage|bone_?mage|lich|caster|mage/, def: { body: 'caster', features: ['bones', 'hood', 'glow'], palette: { main: '#e8e0c8', sub: '#3a3448', eye: '#6ad8ff', accent: '#6ad8ff' } } },
  { re: /archer|bow/, def: { body: 'biped', skeletal: true, features: ['bow'], palette: { main: '#e8e0c8', sub: '#6a6050', eye: '#9ae8ff', accent: '#9ae8ff' } } },
  { re: /skel|bone|warrior/, def: { body: 'biped', skeletal: true, features: ['sword', 'shield'], palette: { main: '#e6dec6', sub: '#6a6050', eye: '#b47cff', accent: '#b47cff' } }, skeleton: true },

  { re: /clone|shadow|phantom|double/, def: { body: 'biped', features: ['hood', 'sword', 'glow'], palette: { main: '#3a2a5a', sub: '#140c20', eye: '#e0c0ff', accent: '#c77dff' } }, shadow: true },
  { re: /hawk|falcon|raven|crow|bird/, def: { body: 'flyer', features: ['wings'], palette: { main: '#6a5a4a', sub: '#2a2018', eye: '#ffd040', accent: '#ffd040' } } },
  { re: /bear/, def: { body: 'beast_large', features: [], palette: { main: '#6a4a30', sub: '#2a1a10', eye: '#ffd040', accent: '#ffa040' } } },
  { re: /beast|wolf|hound|companion|cat|panther|tiger|dog/, def: { body: 'quad', features: [], palette: { main: '#7a7a82', sub: '#2a2a30', eye: '#9aff6a', accent: '#7cff5a' } } },
  { re: /spirit|ghost|wraith|soul|wisp/, def: { body: 'ghost', features: ['glow'], palette: { main: '#a8c8ff', sub: '#3a4a7a', eye: '#ffffff', accent: '#7fd8ff' } } },
  { re: /totem|turret|sentry|ballista|trap/, def: { body: 'construct', features: ['gears'], palette: { main: '#8a6a4a', sub: '#3a2a1a', eye: '#ffd040', accent: '#ff9a2e' } } },
  { re: /imp|demon|fiend/, def: { body: 'demon', features: ['horns', 'tail'], palette: { main: '#b0302a', sub: '#3a0a0a', eye: '#ffe060', accent: '#ff7a2a' } } },
  { re: /spider/, def: { body: 'spider', features: [], palette: { main: '#4a3a5a', sub: '#1a1020', eye: '#c77dff', accent: '#c77dff' } } },
  { re: /serpent|snake|hydra/, def: { body: 'serpent', features: [], palette: { main: '#3a8a5a', sub: '#143a20', eye: '#ffe060', accent: '#7cff5a' } } },
  { re: /elemental|fire|ice|storm|lightning|frost|flame/, def: { body: 'elemental', features: ['glow'], palette: { main: '#5a6aa0', sub: '#1a2040', eye: '#ffffff', accent: '#7fd8ff' } } },
];
export function minionDef(name = '') {
  const n = String(name).toLowerCase();
  for (const m of MINION_LOOKS) if (m.re.test(n)) {
    const d = { ...m.def, id: `minion.${n}` };
    if (/fire|flame|ember/.test(n)) d.palette = { main: '#c04a1a', sub: '#3a0a04', eye: '#fff0a0', accent: '#ff7a2a' };
    if (/ice|frost/.test(n)) d.palette = { main: '#8ad0f0', sub: '#1a4a7a', eye: '#ffffff', accent: '#6ad8ff' };
    if (/storm|lightning|thunder/.test(n)) d.palette = { main: '#c8c060', sub: '#3a3a1a', eye: '#ffffff', accent: '#fff07a' };
    return d;
  }
  // 知らない名前: 名前のハッシュで形と色
  const r = rng(n || 'minion');
  const body = r.pick(['biped', 'quad', 'ghost', 'golem', 'elemental', 'demon']);
  const hueBase = r.range(0, 360);
  return { id: `minion.${n}`, body, features: ['glow'], palette: { main: hue('#8a6ad0', hueBase), sub: hue('#2a1a40', hueBase), eye: '#ffffff', accent: hue('#c77dff', hueBase) } };
}
export function paintMinionSlot(ctx, spec, w, h) {
  const name = spec.params?.minion || spec.id.slice('minion.'.length);
  const def = minionDef(name);
  outlined(ctx, w, h, (c) => {
    if (/clone|shadow|phantom|double/.test(name)) { c.save(); c.globalAlpha = 0.92; drawCreature(c, def, w, h, spec.ay ?? 0.97, { flip: true }); c.restore(); }
    else drawCreature(c, def, w, h, spec.ay ?? 0.97, { flip: true });
  }, { width: 1.3, glow: { color: def.palette.accent, blur: 6, alpha: 0.55 } });
  shadeLight(ctx, w, h);
}

// ---------------- ペット（右向き・かわいく）
export function paintPetSlot(ctx, spec, w, h) {
  const id = spec.params?.pet || spec.id.slice('pet.'.length);
  const p = PET[id] || PETS.find((x) => x.id === id) || { body: 'quad', palette: {}, id };
  const def = { ...p, boss: false, flying: false };
  const rare = { legendary: '#ffb040', epic: '#c56bff', rare: '#5aa0ff' }[p.rarity];
  outlined(ctx, w, h, (c) => drawCreature(c, def, w, h, spec.ay ?? 0.97, { flip: true, cute: true }), { width: 1.2, glow: rare ? { color: rare, blur: 6, alpha: 0.5 } : null });
  shadeLight(ctx, w, h);
}

export { palOf, PLANS };
void star; void hash; void ctxScale;
