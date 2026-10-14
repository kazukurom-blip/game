// 主人公の絵（5 クラス × 基本の服＋布・革・鎖・板金）と立ち絵。
// 体は「部品」（マント・腕・脚・胴・腰布）に分けて描き、paperdoll.js が部品を回して歩き・振り・弓を引く動きを作る。
// 枠の絵（hero.<cls>.body / outfit.<style>）は、同じ部品を「休みの姿勢」で 1 枚に重ねた物。
// 座標は枠の箱 150×200（右向き・足元 y=194）。手・頭のアンカーは manifest の HERO_ANCHORS に合わせてある。

import { CLASS } from '../../data/classes.js';
import { HERO_ANCHORS } from '../manifest.js';
import { TAU, rgba, shade, lg, rg, roundRect, ellipse, blob, taper, poly, fillStroke, stroke, line, layer, outlined, ctxScale, rng, metal, glow } from './util.js';

export const HERO_W = 150;
export const HERO_H = 200;
const FEET = 194;
const HIP = [75, 122];
const HAND_F = [HERO_ANCHORS.hand[0] * HERO_W, HERO_ANCHORS.hand[1] * HERO_H];
const HAND_B = [HERO_ANCHORS.offhand[0] * HERO_W, HERO_ANCHORS.offhand[1] * HERO_H];
const HEAD = [76, 35];
const L = { upper: 26, fore: 25, thigh: 36, shin: 32 };
const LINE = 'rgba(12,8,16,0.9)';

// ---------------- クラスの見た目
export const LOOKS = {
  warrior: {
    skin: '#d39a74', hair: '#3e2414', hairStyle: 'short', beard: true, eye: '#2a1a10', accent: '#b4271f', accent2: '#e2b04e',
    width: 1.3, shoulders: [87, 65, 62, 65], cape: 'cape', skirt: 'pteruges', pauldron: 'big',
    base: { top: '#6e4428', topMat: 'leather', arm: 'bare', leg: '#3b2a20', boot: '#2a1b12', trim: '#b4271f', sash: '#b4271f' },
  },
  ranger: {
    skin: '#cf9d78', hair: '#6d3f22', hairStyle: 'tied', eye: '#1f2a12', accent: '#3f7a35', accent2: '#c9a45a',
    width: 1.1, shoulders: [85, 66, 64, 66], cape: 'cloak', skirt: 'coat', hood: 'down',
    base: { top: '#4b6b34', topMat: 'cloth', arm: 'sleeve', leg: '#4a3a2a', boot: '#3a2616', trim: '#8a6a3a', sash: '#6b4a2a' },
  },
  sorcerer: {
    skin: '#e3bf9c', hair: '#d6d4e6', hairStyle: 'long', eye: '#1a2a5a', accent: '#2f5fd0', accent2: '#e7c766', circlet: true,
    width: 1.08, shoulders: [85, 66, 64, 66], cape: 'mantle', skirt: 'robe', glowCol: '#7fd8ff',
    base: { top: '#26357a', topMat: 'cloth', arm: 'wide', leg: '#1c2450', boot: '#2a2238', trim: '#e7c766', sash: '#e7c766' },
  },
  necromancer: {
    skin: '#bdb5b0', hair: '#18161e', hairStyle: 'long', eye: '#c890ff', eyeGlow: true, accent: '#7b3fc4', accent2: '#d8d0b8', hood: 'up',
    width: 1.08, shoulders: [85, 66, 64, 66], cape: 'tatter', skirt: 'tattered', pauldron: 'skull', glowCol: '#b47cff',
    base: { top: '#231a2e', topMat: 'cloth', arm: 'wide', leg: '#1a1420', boot: '#1c1820', trim: '#7b3fc4', sash: '#d8d0b8' },
  },
  assassin: {
    skin: '#cf9c76', hair: '#121016', hairStyle: 'ponytail', mask: true, eye: '#2a1a08', accent: '#d39b1c', accent2: '#e8d090',
    width: 1.02, shoulders: [84, 67, 65, 67], cape: 'scarf', skirt: 'sash',
    base: { top: '#26222c', topMat: 'cloth', arm: 'wrap', leg: '#1f1c24', boot: '#16141a', trim: '#d39b1c', sash: '#d39b1c' },
  },
};

/** 服のスタイルごとの色と質感 */
function outfit(cls, style) {
  const lk = LOOKS[cls] || LOOKS.warrior;
  const b = lk.base;
  const caster = cls === 'sorcerer' || cls === 'necromancer';
  switch (style) {
    case 'cloth': return { top: caster ? b.top : shade(lk.accent, -0.35), topMat: 'cloth', arm: caster ? 'wide' : 'sleeve', armCol: caster ? b.top : shade(lk.accent, -0.45), leg: shade(lk.accent, -0.6), legMat: 'cloth', boot: '#3a2a22', bootMat: 'cloth', trim: lk.accent2, glove: shade(lk.accent, -0.5), sash: lk.accent2, pad: 'cloth' };
    case 'leather': return { top: '#7a4f2e', topMat: 'leather', arm: 'sleeve', armCol: '#6a4428', leg: '#4e3420', legMat: 'leather', boot: '#3a2414', bootMat: 'leather', trim: lk.accent, glove: '#5a3a22', sash: lk.accent, pad: 'leather' };
    case 'mail': return { top: '#8b94a1', topMat: 'mail', arm: 'mail', armCol: '#8b94a1', leg: '#7c8592', legMat: 'mail', boot: '#4a4440', bootMat: 'leather', trim: lk.accent, tabard: lk.accent, glove: '#6c7380', sash: '#5a3a22', pad: 'mail' };
    case 'plate': return { top: '#a8b1be', topMat: 'plate', arm: 'plate', armCol: '#a8b1be', leg: '#9ea7b4', legMat: 'plate', boot: '#98a1ae', bootMat: 'plate', trim: lk.accent2 || '#d8b45a', glove: '#a9b1bc', sash: lk.accent, pad: 'plate', tabard: caster ? lk.accent : null };
    default: return { top: b.top, topMat: b.topMat, arm: b.arm, armCol: b.top, leg: b.leg, legMat: 'cloth', boot: b.boot, bootMat: 'leather', trim: b.trim, glove: null, sash: b.sash, pad: b.topMat === 'leather' ? 'leather' : 'cloth' };
  }
}

/** 拳（武器の握りの上に重ねる）の色 */
export function heroGloveColor(cls, style) {
  const o = outfit(cls, style);
  return o.glove || (LOOKS[cls] || LOOKS.warrior).skin;
}

// ---------------- 質感
function matFill(ctx, mat, base, box, seed = 1) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0; const h = y1 - y0;
  switch (mat) {
    case 'plate': {
      ctx.fillStyle = metal(ctx, x1, y0, x0, y1, base, 0.9); ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = lg(ctx, 0, y0, 0, y1, [[0, 'rgba(255,255,255,0.25)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.35)']]); ctx.fillRect(x0, y0, w, h);
      break;
    }
    case 'mail': {
      ctx.fillStyle = lg(ctx, x1, y0, x0, y1, [[0, shade(base, 0.25)], [0.5, base], [1, shade(base, -0.45)]]); ctx.fillRect(x0, y0, w, h);
      ctx.lineWidth = 0.7;
      for (let yy = y0; yy < y1 + 3; yy += 2.6) {
        const odd = Math.round((yy - y0) / 2.6) % 2;
        for (let xx = x0 - 3 + (odd ? 1.4 : 0); xx < x1 + 3; xx += 2.8) {
          ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.beginPath(); ctx.arc(xx, yy, 1.3, 0.2, Math.PI - 0.2); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(xx, yy - 0.4, 1.1, Math.PI + 0.5, TAU - 0.5); ctx.stroke();
        }
      }
      break;
    }
    case 'leather': {
      ctx.fillStyle = lg(ctx, x1, y0, x0, y1, [[0, shade(base, 0.22)], [0.55, base], [1, shade(base, -0.45)]]); ctx.fillRect(x0, y0, w, h);
      const r = rng(seed);
      ctx.strokeStyle = rgba(shade(base, -0.5), 0.35); ctx.lineWidth = 0.6;
      for (let i = 0; i < w * h / 60; i++) { const px = x0 + r() * w; const py = y0 + r() * h; line(ctx, px, py, px + r() * 3 - 1, py + r() * 2); ctx.stroke(); }
      break;
    }
    case 'skin': {
      ctx.fillStyle = lg(ctx, x1, y0, x0, y1, [[0, shade(base, 0.18)], [0.5, base], [1, shade(base, -0.3)]]); ctx.fillRect(x0, y0, w, h);
      break;
    }
    default: { // cloth
      ctx.fillStyle = lg(ctx, x1, y0, x0, y1, [[0, shade(base, 0.2)], [0.5, base], [1, shade(base, -0.5)]]); ctx.fillRect(x0, y0, w, h);
      const r = rng(seed);
      ctx.strokeStyle = rgba(shade(base, -0.55), 0.45); ctx.lineWidth = 0.9;
      for (let i = 0; i < Math.max(2, w / 9); i++) { const px = x0 + r() * w; ctx.beginPath(); ctx.moveTo(px, y0 + r() * h * 0.3); ctx.quadraticCurveTo(px + r() * 6 - 3, y0 + h * 0.5, px + r() * 6 - 3, y0 + h * (0.7 + r() * 0.3)); ctx.stroke(); }
    }
  }
}
/** 形 path（関数）を質感で塗り、縁を引く */
function part(ctx, path, mat, base, box, seed, lw = 1.2) {
  ctx.save(); path(); ctx.clip(); matFill(ctx, mat, base, box, seed); ctx.restore();
  path(); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(14,10,18,0.7)'; ctx.lineJoin = 'round'; ctx.stroke();
}
function rivet(ctx, x, y, r = 1.1) { ctx.fillStyle = '#e8e2d8'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(x + 0.3, y + 0.4, r * 0.6, 0, TAU); ctx.fill(); }

// ---------------- 部品の作り方
/** 部品: 小さなキャンバスに描いておく。px,py が回す中心 */
function makePart(w, h, px, py, k, fn, outline = 1.3, light = true) {
  const img = layer(w, h, k, (x) => {
    outlined(x, w, h, (y) => { y.translate(px, py); fn(y); }, { width: outline });
    if (light) {
      // 光: 右上（正面の上）から当たり、左下は少し暗い。形の上だけに乗せる
      x.save(); x.globalCompositeOperation = 'source-atop';
      x.fillStyle = lg(x, w, 0, 0, h, [[0, 'rgba(255,236,210,0.16)'], [0.45, 'rgba(255,236,210,0)'], [0.6, 'rgba(20,10,30,0)'], [1, 'rgba(20,10,30,0.22)']]);
      x.fillRect(0, 0, w, h);
      x.restore();
    }
  });
  return { img, w, h, px, py, fn };
}
export function drawPart(ctx, p, x, y, rot = 0, sx = 1, sy = 1) {
  if (!p) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (p.img) ctx.drawImage(p.img, -p.px, -p.py, p.w, p.h);
  else p.fn(ctx);
  ctx.restore();
}

// ---------- 脚
function thighFn(o, lk) {
  return (ctx) => {
    const path = () => { taper(ctx, [[0, 0], [0.8, 18], [0, L.thigh]], 17.5, 12.5); };
    if (o.legMat === 'plate') {
      part(ctx, path, 'cloth', '#3a3438', [-8, -2, 8, 38], 3);
      ctx.save(); roundRect(ctx, -6.5, 2, 13, 26, 4); ctx.clip(); matFill(ctx, 'plate', o.leg, [-7, 2, 7, 28]); ctx.restore();
      roundRect(ctx, -6.5, 2, 13, 26, 4); stroke(ctx, 'rgba(14,10,18,0.6)', 1);
      ctx.fillStyle = o.trim; ctx.fillRect(-6.5, 25, 13, 1.6);
    } else part(ctx, path, o.legMat, o.leg, [-8, -2, 8, 38], 7);
    if (o.legMat === 'leather') { ctx.strokeStyle = rgba(shade(o.leg, -0.6), 0.8); ctx.lineWidth = 1.6; line(ctx, -6, 14, 6, 16); ctx.stroke(); }
    void lk;
  };
}
function shinFn(o, lk, cls) {
  return (ctx) => {
    // すね
    const path = () => { taper(ctx, [[0, -1], [1, 14], [0, L.shin]], 13, 9.5); };
    part(ctx, path, o.legMat === 'plate' ? 'plate' : o.legMat, o.legMat === 'plate' ? o.leg : o.leg, [-7, -2, 7, 34], 11);
    // ひざ当て
    if (o.legMat === 'plate') { ellipse(ctx, 1, 1, 6.5, 5); fillStroke(ctx, metal(ctx, 6, -4, -5, 6, o.leg), LINE, 1); rivet(ctx, 2, 1, 0.9); }
    // 靴
    const bootTop = cls === 'sorcerer' || cls === 'necromancer' ? 22 : 17;
    const boot = () => {
      ctx.beginPath(); ctx.moveTo(-6, bootTop); ctx.lineTo(5.5, bootTop); ctx.lineTo(6, 29); ctx.quadraticCurveTo(15, 30, 16, 34.5); ctx.lineTo(16, 36); ctx.lineTo(-6.5, 36); ctx.lineTo(-6.5, 30); ctx.closePath();
    };
    part(ctx, boot, o.bootMat === 'plate' ? 'plate' : 'leather', o.boot, [-7, bootTop, 17, 36], 13);
    ctx.fillStyle = rgba('#000', 0.35); ctx.fillRect(-6.5, 34.6, 22.5, 1.4);
    if (o.bootMat === 'plate') { ctx.strokeStyle = 'rgba(20,20,30,0.5)'; ctx.lineWidth = 0.8; for (const yy of [bootTop + 5, bootTop + 9]) { line(ctx, -6, yy, 6, yy); ctx.stroke(); } ctx.fillStyle = o.trim; ctx.fillRect(-6, bootTop, 12, 1.5); }
    else { ctx.fillStyle = shade(o.boot, -0.35); ctx.fillRect(-6.2, bootTop, 12, 2.6); ctx.fillStyle = rgba(lk.accent2 || '#c9a45a', 0.85); ctx.fillRect(-1, bootTop + 0.6, 2.2, 1.6); }
  };
}

// ---------- 腕
function upperFn(o, lk, cls, front) {
  return (ctx) => {
    const sleeve = o.arm;
    const col = sleeve === 'bare' || sleeve === 'wrap' ? lk.skin : o.armCol || o.top;
    const mat = sleeve === 'plate' ? 'plate' : sleeve === 'mail' ? 'mail' : sleeve === 'bare' || sleeve === 'wrap' ? 'skin' : o.topMat === 'leather' ? 'leather' : 'cloth';
    const path = () => taper(ctx, [[0, -2], [0.5, 13], [0, L.upper]], 15, 11.5);
    part(ctx, path, mat, col, [-8, -6, 8, 28], front ? 21 : 23);
    if (sleeve === 'wrap') { ctx.strokeStyle = rgba(o.top, 0.95); ctx.lineWidth = 2.2; for (let y = 12; y < 26; y += 3.4) { line(ctx, -5.5, y, 5.5, y + 1.5); ctx.stroke(); } }
    // 肩当て（手前の腕だけ大きく）
    if (!front) return;
    const pad = lk.pauldron === 'skull' ? 'skull' : o.pad;
    if (pad === 'skull') {
      ellipse(ctx, 0.5, -1, 10, 8.5); fillStroke(ctx, lg(ctx, 0, -10, 0, 8, [[0, '#f2ead6'], [1, '#9a907a']]), LINE, 1.2);
      ctx.fillStyle = '#1a1220'; ellipse(ctx, 3.5, -1.5, 2.2, 2.6); ctx.fill(); ellipse(ctx, -2.5, -1.5, 2.2, 2.6); ctx.fill();
      ctx.fillStyle = rgba(lk.glowCol || '#b47cff', 0.9); ellipse(ctx, 3.5, -1.2, 1, 1.2); ctx.fill();
      ctx.strokeStyle = '#6a604e'; ctx.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { line(ctx, i * 1.6, 4, i * 1.6, 6.5); ctx.stroke(); }
      return;
    }
    const big = lk.pauldron === 'big';
    const rx = big ? 12.5 : 9.5; const ry = big ? 9 : 7;
    ctx.translate(-1, 3);
    const padPath = () => { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, -0.15, Math.PI * 1.05, Math.PI * 2.02); ctx.quadraticCurveTo(rx * 0.4, ry * 1.2, -rx * 0.9, ry * 0.5); ctx.closePath(); };
    if (pad === 'plate') {
      part(ctx, padPath, 'plate', o.top, [-rx, -ry, rx, ry], 3);
      ctx.strokeStyle = o.trim; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0.5, rx - 1.5, ry - 1.5, -0.15, Math.PI * 1.1, Math.PI * 1.95); ctx.stroke();
      if (big) { ctx.beginPath(); ctx.ellipse(-1, 4, rx * 0.85, ry * 0.6, -0.1, Math.PI * 1.0, Math.PI * 2.0); stroke(ctx, 'rgba(20,20,30,0.45)', 0.9); }
      rivet(ctx, rx * 0.45, -ry * 0.25); rivet(ctx, -rx * 0.45, -ry * 0.2);
    } else if (pad === 'mail') {
      part(ctx, padPath, 'leather', '#5a3a26', [-rx, -ry, rx, ry], 3);
      ctx.fillStyle = o.tabard || lk.accent; ctx.beginPath(); ctx.ellipse(0, -0.5, rx * 0.6, ry * 0.5, -0.15, Math.PI, TAU); ctx.fill();
    } else if (pad === 'leather') {
      part(ctx, padPath, 'leather', '#6e4428', [-rx, -ry, rx, ry], 5);
      ctx.setLineDash([1.4, 1.2]); ctx.beginPath(); ctx.ellipse(0, 0.5, rx - 2, ry - 2, -0.15, Math.PI * 1.1, Math.PI * 1.95); stroke(ctx, 'rgba(240,220,180,0.55)', 0.7); ctx.setLineDash([]);
    } else if (big) {
      // 剣闘士の基本: 片肩の革の肩当て＋毛皮
      part(ctx, padPath, 'leather', '#6e4428', [-rx, -ry, rx, ry], 5);
      ctx.fillStyle = '#5a4a3a'; for (let i = 0; i < 7; i++) { const a = Math.PI * 1.1 + i * 0.13; taper(ctx, [[Math.cos(a) * rx * 0.7, Math.sin(a) * ry * 0.7], [Math.cos(a) * (rx + 3), Math.sin(a) * (ry + 3)]], 3, 0.4); ctx.fill(); }
    } else if (cls === 'sorcerer' || cls === 'necromancer') {
      part(ctx, padPath, 'cloth', o.top, [-rx, -ry, rx, ry], 5);
      ctx.strokeStyle = o.trim; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(0, 0.5, rx - 1, ry - 1, -0.15, Math.PI * 1.15, Math.PI * 1.9); ctx.stroke();
    }
  };
}
function foreFn(o, lk, front) {
  return (ctx) => {
    const sleeve = o.arm;
    const bare = sleeve === 'bare' || sleeve === 'wrap';
    const col = bare ? lk.skin : o.armCol || o.top;
    if (sleeve === 'wide') {
      // 袖が広がる（術者）
      const path = () => { ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.quadraticCurveTo(9, 12, 10, 22); ctx.lineTo(-8, 23); ctx.quadraticCurveTo(-7, 10, -5, -1); ctx.closePath(); };
      ctx.fillStyle = lk.skin; roundRect(ctx, -3.5, 18, 7, 8, 3); ctx.fill();
      part(ctx, path, 'cloth', col, [-9, -2, 11, 24], front ? 31 : 33);
      ctx.strokeStyle = o.trim; ctx.lineWidth = 1.6; line(ctx, -8, 22.2, 10, 21.3); ctx.stroke();
    } else {
      const path = () => taper(ctx, [[0, -1], [0.4, 12], [0, L.fore - 2]], 12, 9.5);
      part(ctx, path, sleeve === 'plate' ? 'plate' : sleeve === 'mail' ? 'mail' : bare ? 'skin' : o.topMat === 'leather' ? 'leather' : 'cloth', col, [-7, -3, 7, 25], front ? 35 : 37);
      // 手甲・腕当て
      if (sleeve === 'plate') {
        roundRect(ctx, -5.5, 6, 11, 14, 3); fillStroke(ctx, metal(ctx, 5, 6, -5, 20, o.armCol), LINE, 0.9); ctx.fillStyle = o.trim; ctx.fillRect(-5.5, 6, 11, 1.4);
        ellipse(ctx, 0, 0, 6, 4.5); fillStroke(ctx, metal(ctx, 5, -4, -5, 4, o.armCol), LINE, 0.9);
      } else if (sleeve === 'wrap' || sleeve === 'bare') {
        ctx.strokeStyle = sleeve === 'wrap' ? '#d8cfbf' : '#7a5232'; ctx.lineWidth = 2;
        for (let y = 12; y < 22; y += 3) { line(ctx, -4.6, y, 4.6, y + 1.2); ctx.stroke(); }
      } else {
        roundRect(ctx, -5.2, 10, 10.4, 11, 2.5); fillStroke(ctx, lg(ctx, 5, 10, -5, 21, [[0, shade('#7a5232', 0.25)], [1, shade('#7a5232', -0.4)]]), LINE, 0.8);
        ctx.strokeStyle = rgba(lk.accent2 || '#c9a45a', 0.9); ctx.lineWidth = 0.9; line(ctx, -5, 13, 5, 13); ctx.stroke(); line(ctx, -5, 18, 5, 18); ctx.stroke();
      }
    }
    if (!front) {
      // 奥の手は腕と一緒に描く
      fistShape(ctx, 0, L.fore, o.glove || lk.skin);
    }
  };
}
function fistShape(ctx, x, y, col) {
  roundRect(ctx, x - 4.6, y - 3.8, 9.2, 8.2, 3.4);
  fillStroke(ctx, lg(ctx, x + 4, y - 4, x - 4, y + 4, [[0, shade(col, 0.25)], [1, shade(col, -0.35)]]), LINE, 1.1);
  ctx.strokeStyle = rgba(shade(col, -0.5), 0.7); ctx.lineWidth = 0.7; for (let i = -1; i <= 1; i++) { line(ctx, x + 1.2, y - 2 + i * 2.2, x + 4.2, y - 2 + i * 2.2); ctx.stroke(); }
}

// ---------- 胴と頭
function torsoPath(ctx, lk) {
  const s = lk.width;
  const X = (x) => 75 + (x - 75) * s;
  return () => blob(ctx, [[X(62), 63], [X(75), 60], [X(89), 63], [X(94), 76], [X(91), 92], [X(87), 104], [X(89), 118], [X(85), 126], [X(66), 126], [X(61), 118], [X(63), 104], [X(60), 88], [X(59), 72]], true, 0.6);
}
function headPath(ctx) {
  return () => blob(ctx, [[76, 18.5], [86, 21.5], [91.5, 29], [92.5, 33.5], [95, 37.5], [92.5, 39.5], [92, 43], [89.5, 47.5], [82, 51], [72, 49.5], [64, 43], [60.5, 34], [63, 25]], true, 0.55);
}

function torsoFn(o, lk, cls) {
  return (ctx) => {
    ctx.translate(-HIP[0], -HIP[1]);
    const tp = torsoPath(ctx, lk);
    // 首
    ctx.fillStyle = lg(ctx, 82, 46, 70, 62, [[0, shade(lk.skin, 0.1)], [1, shade(lk.skin, -0.35)]]);
    roundRect(ctx, 69.5, 44, 12, 18, 4); ctx.fill(); stroke(ctx, LINE, 1);
    // 胴
    part(ctx, tp, o.topMat, o.top, [55, 58, 98, 128], hashCls(cls) + 41, 1.4);
    ctx.save(); tp(); ctx.clip();
    torsoDetail(ctx, o, lk, cls);
    ctx.restore();
    // 帯
    const s = lk.width;
    const bx0 = 75 + (62 - 75) * s; const bx1 = 75 + (88.5 - 75) * s;
    ctx.fillStyle = lg(ctx, 0, 104, 0, 112, [[0, shade(o.sash, 0.2)], [1, shade(o.sash, -0.4)]]);
    roundRect(ctx, bx0, 104, bx1 - bx0, 7.5, 2); ctx.fill(); stroke(ctx, LINE, 1);
    if (o.topMat === 'plate' || o.topMat === 'mail' || o.topMat === 'leather') {
      roundRect(ctx, bx1 - 9, 103.2, 7, 9, 1.5); fillStroke(ctx, metal(ctx, bx1, 103, bx1 - 9, 112, '#d8b45a'), LINE, 0.8);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(bx1 - 6.5, 106.2, 2, 3);
    }
    if (cls === 'necromancer') { for (let i = 0; i < 3; i++) { ellipse(ctx, bx0 + 6 + i * 6, 112.5, 2.4, 2.8); fillStroke(ctx, '#e8e0cc', LINE, 0.7); ctx.fillStyle = '#2a2030'; ctx.fillRect(bx0 + 5 + i * 6, 112, 0.9, 0.9); ctx.fillRect(bx0 + 6.4 + i * 6, 112, 0.9, 0.9); } }
    // 頭
    headFn(ctx, o, lk, cls);
  };
}
function hashCls(c) { return { warrior: 1, ranger: 2, sorcerer: 3, necromancer: 4, assassin: 5 }[c] || 9; }

function torsoDetail(ctx, o, lk, cls) {
  const s = lk.width;
  const X = (x) => 75 + (x - 75) * s;
  if (o.topMat === 'plate') {
    // 胸当ての段と金の縁
    ctx.strokeStyle = 'rgba(20,24,34,0.55)'; ctx.lineWidth = 1;
    for (const y of [92, 98]) { ctx.beginPath(); ctx.moveTo(X(58), y); ctx.quadraticCurveTo(X(78), y + 3, X(96), y - 1); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(X(84), 64); ctx.quadraticCurveTo(X(95), 78, X(88), 90); stroke(ctx, 'rgba(255,255,255,0.5)', 1.6);
    ctx.strokeStyle = o.trim; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(X(63), 62.5); ctx.quadraticCurveTo(X(75), 66, X(88), 62.5); ctx.stroke();
    rivet(ctx, X(66), 70); rivet(ctx, X(86), 69);
    if (o.tabard) { ctx.fillStyle = lg(ctx, 0, 92, 0, 126, [[0, o.tabard], [1, shade(o.tabard, -0.45)]]); ctx.fillRect(X(70), 93, 13 * s, 34); ctx.fillStyle = o.trim; ctx.fillRect(X(70), 93, 13 * s, 1.2); }
    // 紋章
    ctx.fillStyle = rgba(lk.accent, 0.85); poly(ctx, [[X(79), 73], [X(84), 76], [X(83), 83], [X(79), 86], [X(75), 83], [X(74), 76]]); ctx.fill();
  } else if (o.topMat === 'mail') {
    // 前掛け（クラスの色）
    ctx.fillStyle = lg(ctx, X(70), 66, X(92), 126, [[0, shade(o.tabard, 0.15)], [1, shade(o.tabard, -0.5)]]);
    ctx.beginPath(); ctx.moveTo(X(72), 64); ctx.lineTo(X(91), 66); ctx.lineTo(X(92), 126); ctx.lineTo(X(70), 126); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lk.accent2 || '#d8b45a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = rgba(lk.accent2 || '#d8b45a', 0.9); poly(ctx, [[X(81), 76], [X(85), 82], [X(81), 88], [X(77), 82]]); ctx.fill();
  } else if (o.topMat === 'leather') {
    // 胸のベルトと縫い目
    ctx.strokeStyle = shade(o.top, -0.5); ctx.lineWidth = 3.2; line(ctx, X(62), 64, X(92), 100); ctx.stroke();
    ctx.strokeStyle = shade(o.top, 0.25); ctx.lineWidth = 0.8; line(ctx, X(62), 63, X(92), 99); ctx.stroke();
    ctx.setLineDash([1.6, 1.4]); ctx.strokeStyle = 'rgba(240,220,180,0.45)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(X(88), 66); ctx.quadraticCurveTo(X(93), 80, X(87), 102); ctx.stroke(); ctx.setLineDash([]);
    roundRect(ctx, X(76) - 3, 79, 6, 5, 1); fillStroke(ctx, '#c9a45a', LINE, 0.6);
    if (cls === 'warrior') { ctx.fillStyle = rgba(lk.skin, 1); ctx.beginPath(); ctx.moveTo(X(80), 62); ctx.lineTo(X(90), 63); ctx.lineTo(X(86), 72); ctx.closePath(); ctx.fill(); }
  } else {
    // 布: 襟と飾り
    if (cls === 'sorcerer') {
      ctx.fillStyle = o.trim; ctx.fillRect(X(77), 62, 2.2, 64);
      ctx.strokeStyle = rgba(lk.glowCol, 0.9); ctx.lineWidth = 0.9;
      for (let i = 0; i < 4; i++) { const y = 74 + i * 11; ctx.beginPath(); ctx.arc(X(83), y, 2.2, 0, TAU); ctx.stroke(); line(ctx, X(83), y - 3.5, X(83), y + 3.5); ctx.stroke(); }
    } else if (cls === 'necromancer') {
      ctx.strokeStyle = rgba(lk.accent, 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(84), 63); ctx.lineTo(X(78), 100); ctx.stroke();
      ctx.fillStyle = rgba('#e8e0cc', 0.9); for (let i = 0; i < 4; i++) { roundRect(ctx, X(70) + i * 2.5, 70 + i * 7, 7, 2, 1); ctx.fill(); }
    } else if (cls === 'assassin') {
      ctx.strokeStyle = shade(o.top, -0.6); ctx.lineWidth = 2.6; line(ctx, X(60), 70, X(90), 92); ctx.stroke(); line(ctx, X(62), 92, X(92), 72); ctx.stroke();
      ctx.strokeStyle = rgba(lk.accent, 0.8); ctx.lineWidth = 0.8; line(ctx, X(60), 69, X(90), 91); ctx.stroke();
    } else if (cls === 'ranger') {
      ctx.strokeStyle = shade('#6b4a2a', -0.2); ctx.lineWidth = 3; line(ctx, X(88), 63, X(62), 104); ctx.stroke();
      ctx.fillStyle = '#c9a45a'; ellipse(ctx, X(75), 84, 2, 2); ctx.fill();
    } else {
      ctx.strokeStyle = rgba(o.trim, 0.85); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(70), 62); ctx.quadraticCurveTo(X(80), 74, X(88), 63); ctx.stroke();
    }
  }
}

function headFn(ctx, o, lk, cls) {
  const hp = headPath(ctx);
  // 後ろ髪（頭の後ろ側）
  if (lk.hood === 'up') {
    // 深い頭巾（死霊術師）
    ctx.fillStyle = lg(ctx, 90, 14, 60, 56, [[0, shade(o.top, 0.15)], [1, shade(o.top, -0.55)]]);
    blob(ctx, [[74, 12], [88, 15], [96, 28], [97, 44], [90, 54], [72, 58], [60, 50], [56, 34], [62, 19]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1.3);
  }
  part(ctx, hp, 'skin', lk.skin, [58, 16, 97, 52], 3, 1.2);
  // 耳
  ellipse(ctx, 71, 36, 2.6, 4); fillStroke(ctx, shade(lk.skin, -0.12), 'rgba(14,10,18,0.5)', 0.8);
  // 顔の影
  ctx.save(); hp(); ctx.clip();
  ctx.fillStyle = lg(ctx, 94, 30, 64, 46, [[0, 'rgba(255,240,220,0.18)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(40,10,10,0.25)']]); ctx.fillRect(58, 16, 40, 40);
  ctx.fillStyle = rgba('#ff9a8a', 0.18); ellipse(ctx, 86, 40, 4, 2.6); ctx.fill();
  ctx.restore();
  // 目・眉・口
  if (lk.eyeGlow) {
    ctx.fillStyle = '#120c18'; ellipse(ctx, 86.5, 33, 3.2, 2.2); ctx.fill();
    glow(ctx, 87, 33, 5, lk.eye, 0.8); ctx.fillStyle = '#f4e8ff'; ellipse(ctx, 87.2, 33, 1.4, 1); ctx.fill();
  } else {
    ctx.fillStyle = '#f4efe6'; ellipse(ctx, 87, 33.2, 2.5, 1.6); ctx.fill();
    ctx.fillStyle = lk.eye; ellipse(ctx, 87.9, 33.3, 1.4, 1.5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(88.1, 32.4, 0.7, 0.7);
  }
  ctx.strokeStyle = shade(lk.hair, -0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(83.5, 29.5); ctx.quadraticCurveTo(87.5, 28.2, 91, 29.8); ctx.stroke();
  if (!lk.mask) { ctx.strokeStyle = rgba(shade(lk.skin, -0.5), 0.8); ctx.lineWidth = 0.9; line(ctx, 88.5, 43.2, 92, 42.6); ctx.stroke(); }
  // 髪
  ctx.fillStyle = lg(ctx, 80, 14, 64, 44, [[0, shade(lk.hair, 0.28)], [1, shade(lk.hair, -0.35)]]);
  if (lk.hairStyle === 'short') {
    blob(ctx, [[64, 24], [74, 16.5], [86, 18.5], [91.5, 25], [86, 24.5], [80, 27], [74, 27.5], [70, 33], [70, 41], [64.5, 42], [61, 33]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1);
    if (lk.beard) {
      blob(ctx, [[72, 41], [77, 47], [84, 49], [89.5, 46], [92.5, 41.8], [90, 44.8], [86, 45.5], [83, 43], [79, 44], [74, 38]], true, 0.6); ctx.fill(); stroke(ctx, 'rgba(14,10,18,0.6)', 0.8);
      ctx.strokeStyle = shade(lk.hair, -0.4); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(87, 41.5); ctx.quadraticCurveTo(90, 40.8, 92.8, 41.5); ctx.stroke();
    }
    ctx.strokeStyle = rgba('#e8b0a0', 0.7); ctx.lineWidth = 0.8; line(ctx, 84, 36, 86.5, 40); ctx.stroke();
  } else if (lk.hairStyle === 'tied') {
    blob(ctx, [[63, 25], [73, 16.5], [86, 18], [92, 26], [87, 24], [80, 25.5], [73, 27], [70.5, 34], [68, 40], [62, 38], [60.5, 30]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1);
    taper(ctx, [[62, 32], [56, 36], [52, 44]], 6, 2); ctx.fill(); stroke(ctx, LINE, 0.8);
    ctx.fillStyle = '#c9a45a'; ellipse(ctx, 61, 33, 1.8, 2.4); ctx.fill();
  } else if (lk.hairStyle === 'long') {
    if (lk.hood !== 'up') {
      blob(ctx, [[63, 24], [73, 16], [86, 17.5], [92.5, 26.5], [86.5, 23.5], [79, 23.5], [73, 26], [70, 34], [69.5, 46], [66, 54], [61, 50], [59.5, 36]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1);
      ctx.strokeStyle = rgba(shade(lk.hair, 0.4), 0.6); ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(70 + i * 4, 18 + i); ctx.quadraticCurveTo(64 + i * 2, 30, 63.5 + i * 2, 44); ctx.stroke(); }
    } else {
      // 頭巾の縁で顔に影
      ctx.save(); hp(); ctx.clip(); ctx.fillStyle = 'rgba(10,6,16,0.55)'; ctx.fillRect(58, 16, 40, 13); ctx.fillRect(58, 16, 16, 40); ctx.restore();
      ctx.fillStyle = lg(ctx, 96, 18, 80, 40, [[0, shade(o.top, 0.25)], [1, shade(o.top, -0.3)]]);
      ctx.beginPath(); ctx.moveTo(74, 12); ctx.quadraticCurveTo(92, 13, 97, 30); ctx.quadraticCurveTo(94, 22, 84, 21); ctx.quadraticCurveTo(74, 21, 70, 30); ctx.lineTo(67, 52); ctx.lineTo(60, 50); ctx.quadraticCurveTo(56, 26, 74, 12); ctx.closePath(); ctx.fill(); stroke(ctx, LINE, 1.1);
      ctx.strokeStyle = rgba(lk.accent, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(76, 13.5); ctx.quadraticCurveTo(92, 15, 96, 29); ctx.stroke();
    }
    if (lk.circlet) {
      ctx.strokeStyle = metal(ctx, 60, 20, 92, 30, '#e7c766'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(62, 28); ctx.quadraticCurveTo(76, 21, 91, 25.5); ctx.stroke();
      ctx.fillStyle = '#7fd8ff'; poly(ctx, [[86.5, 22], [89, 24.5], [86.5, 27.5], [84, 24.5]]); ctx.fill(); glow(ctx, 86.5, 24.6, 5, '#7fd8ff', 0.55);
    }
  } else if (lk.hairStyle === 'ponytail') {
    blob(ctx, [[63, 24], [73, 16], [86, 17.5], [92, 25], [86, 23], [78, 23.8], [72, 26.5], [69.5, 34], [66, 38], [61, 35]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1);
    // 鉢巻
    ctx.fillStyle = lk.accent; ctx.beginPath(); ctx.moveTo(62, 27); ctx.quadraticCurveTo(77, 21.5, 92, 26); ctx.lineTo(92, 28.6); ctx.quadraticCurveTo(77, 24.3, 62.5, 30); ctx.closePath(); ctx.fill(); stroke(ctx, LINE, 0.7);
  }
  if (lk.mask) {
    // 口元を覆う布
    ctx.fillStyle = lg(ctx, 95, 34, 70, 52, [[0, '#3a3440'], [1, '#141218']]);
    blob(ctx, [[72, 36], [84, 36], [92.5, 35.6], [95.5, 38], [92.5, 41], [91, 46], [86, 50.5], [76, 51], [70, 46]], true, 0.5); ctx.fill(); stroke(ctx, LINE, 1);
    ctx.strokeStyle = rgba(lk.accent, 0.9); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(72, 36.4); ctx.quadraticCurveTo(84, 35.8, 93, 35.8); ctx.stroke();
  }
  if (lk.hood === 'down') {
    // 首の後ろに下ろした頭巾
    ctx.fillStyle = lg(ctx, 75, 46, 60, 66, [[0, shade(lk.accent, -0.05)], [1, shade(lk.accent, -0.55)]]);
    blob(ctx, [[60, 46], [70, 50], [82, 56], [86, 62], [74, 64], [62, 62], [56, 54]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1);
  }
}

// ---------- マント・後ろ髪（体の後ろ）
function capeFn(o, lk, cls) {
  return (ctx) => {
    ctx.translate(-75, -58);
    const type = lk.cape;
    const col = cls === 'warrior' ? lk.accent : cls === 'ranger' ? shade(lk.accent, -0.35) : cls === 'sorcerer' ? shade(lk.accent, -0.15) : cls === 'necromancer' ? '#191420' : lk.accent;
    if (type === 'cape' || type === 'cloak' || type === 'mantle') {
      const len = type === 'cape' ? 148 : type === 'cloak' ? 150 : 132;
      ctx.fillStyle = lg(ctx, 70, 58, 40, len, [[0, shade(col, 0.1)], [1, shade(col, -0.6)]]);
      blob(ctx, [[64, 58], [74, 58], [72, 90], [64, len - 6], [54, len], [44, len - 8], [40, len - 22], [48, 92], [56, 66]], true, 0.6);
      ctx.fill(); stroke(ctx, LINE, 1.3);
      ctx.strokeStyle = rgba(shade(col, -0.6), 0.7); ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(62 - i * 3, 70); ctx.quadraticCurveTo(54 - i * 5, 100, 50 - i * 3, len - 10); ctx.stroke(); }
      if (type === 'cape' && o.topMat === 'plate') { ctx.strokeStyle = lk.accent2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(42, len - 20); ctx.quadraticCurveTo(50, len + 1, 64, len - 6); ctx.stroke(); }
    } else if (type === 'tatter') {
      ctx.fillStyle = lg(ctx, 70, 58, 40, 170, [[0, '#2a2234'], [1, '#0e0a12']]);
      const pts = [[64, 58], [75, 58], [72, 92], [68, 150], [62, 162], [58, 148], [53, 166], [48, 150], [42, 160], [40, 140], [46, 96], [56, 66]];
      blob(ctx, pts, true, 0.35); ctx.fill(); stroke(ctx, LINE, 1.3);
      ctx.strokeStyle = rgba(lk.accent, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(60, 70); ctx.quadraticCurveTo(52, 110, 50, 150); ctx.stroke();
    } else if (type === 'scarf') {
      ctx.fillStyle = lg(ctx, 70, 52, 20, 90, [[0, shade(col, 0.15)], [1, shade(col, -0.45)]]);
      taper(ctx, [[70, 54], [60, 60], [50, 70], [43, 84], [40, 100], [36, 112]], 10, 4); ctx.fill(); stroke(ctx, LINE, 1.1);
      taper(ctx, [[68, 58], [58, 68], [52, 82], [50, 94]], 7, 3); ctx.fill(); stroke(ctx, LINE, 1);
    }
    // 長い後ろ髪・ポニーテール
    if (lk.hairStyle === 'long' && lk.hood !== 'up') {
      ctx.fillStyle = lg(ctx, 66, 30, 56, 96, [[0, shade(lk.hair, 0.2)], [1, shade(lk.hair, -0.4)]]);
      blob(ctx, [[64, 28], [72, 32], [70, 60], [68, 86], [62, 96], [56, 84], [57, 54], [58, 36]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1);
    }
    if (lk.hairStyle === 'ponytail') {
      ctx.fillStyle = lg(ctx, 64, 28, 30, 70, [[0, shade(lk.hair, 0.3)], [1, shade(lk.hair, -0.2)]]);
      taper(ctx, [[63, 29], [54, 32], [44, 40], [36, 52], [32, 64]], 8, 2); ctx.fill(); stroke(ctx, LINE, 1);
      ctx.fillStyle = lk.accent; ellipse(ctx, 61, 29.5, 2.4, 3); ctx.fill();
      ctx.fillStyle = lk.accent; taper(ctx, [[61, 27], [52, 25], [44, 28]], 2.4, 1); ctx.fill(); taper(ctx, [[61, 28], [53, 31], [46, 36]], 2.2, 0.8); ctx.fill();
    }
    void o;
  };
}

// ---------- 腰布（脚の上に重ねる）
function skirtFn(o, lk, cls) {
  return (ctx) => {
    ctx.translate(-75, -108);
    const s = lk.width;
    const X = (x) => 75 + (x - 75) * s;
    const type = lk.skirt;
    if (type === 'robe' || type === 'tattered') {
      const col = o.topMat === 'plate' || o.topMat === 'mail' ? (o.tabard || lk.base.top) : o.top;
      const len = type === 'robe' ? 186 : 184;
      const pts = type === 'robe'
        ? [[X(63), 108], [X(88), 108], [X(94), 140], [X(100), 176], [X(98), len], [X(76), len + 2], [X(54), len], [X(52), 174], [X(57), 140]]
        : [[X(63), 108], [X(88), 108], [X(94), 140], [X(98), 172], [X(94), len], [X(88), 176], [X(82), len + 2], [X(74), 177], [X(66), len], [X(60), 174], [X(54), 182], [X(53), 160], [X(57), 136]];
      ctx.save();
      blob(ctx, pts, true, type === 'robe' ? 0.5 : 0.3); ctx.clip();
      matFill(ctx, 'cloth', col, [X(50), 106, X(102), len + 3], 77);
      ctx.fillStyle = lg(ctx, 0, 108, 0, 124, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(40, 106, 80, 20);
      ctx.restore();
      blob(ctx, pts, true, type === 'robe' ? 0.5 : 0.3); stroke(ctx, LINE, 1.3);
      if (type === 'robe') {
        ctx.strokeStyle = o.trim || lk.accent2; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(X(53), len - 2); ctx.quadraticCurveTo(X(76), len + 3, X(98), len - 2); ctx.stroke();
        ctx.lineWidth = 1.6; line(ctx, X(80), 110, X(84), len); ctx.stroke();
        ctx.strokeStyle = rgba(lk.glowCol || '#7fd8ff', 0.75); ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) { const x = X(58 + i * 8); ctx.beginPath(); ctx.moveTo(x, len - 7); ctx.lineTo(x + 2, len - 10); ctx.lineTo(x + 4, len - 7); ctx.stroke(); }
      } else {
        ctx.strokeStyle = rgba(lk.accent, 0.6); ctx.lineWidth = 1; line(ctx, X(80), 110, X(82), 176); ctx.stroke();
      }
      if (o.topMat === 'plate') {
        // 板金の草摺り
        for (let i = 0; i < 2; i++) { const x0 = i ? X(76) : X(60); roundRect(ctx, x0, 110, 14 * s, 18, 3); fillStroke(ctx, metal(ctx, x0 + 14, 110, x0, 128, o.top), LINE, 1); ctx.fillStyle = o.trim; ctx.fillRect(x0, 126, 14 * s, 1.5); }
      }
    } else if (type === 'pteruges') {
      // 剣闘士: 革の短冊
      const n = 6; const x0 = X(61); const x1 = X(90); const wid = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const xx = x0 + i * wid; const len = 22 + (i % 2) * 3;
        const isPlate = o.topMat === 'plate';
        const p = () => roundRect(ctx, xx + 0.3, 110, wid - 0.6, len, 2);
        part(ctx, p, isPlate ? 'plate' : 'leather', isPlate ? o.top : o.topMat === 'mail' ? '#5a3a26' : '#6e4428', [xx, 110, xx + wid, 110 + len], 50 + i, 0.9);
        ctx.fillStyle = isPlate ? o.trim : rgba(lk.accent, 0.95); ctx.fillRect(xx + 0.6, 108 + len - 2, wid - 1.2, 2);
        if (!isPlate) rivet(ctx, xx + wid / 2, 114, 0.8);
      }
      if (o.topMat === 'mail' || o.topMat === 'cloth') {
        ctx.fillStyle = lg(ctx, 0, 110, 0, 132, [[0, o.topMat === 'mail' ? lk.accent : shade(lk.accent, -0.2)], [1, shade(lk.accent, -0.6)]]);
        ctx.beginPath(); ctx.moveTo(X(72), 110); ctx.lineTo(X(84), 110); ctx.lineTo(X(82), 138); ctx.lineTo(X(74), 138); ctx.closePath(); ctx.fill(); stroke(ctx, LINE, 0.9);
      }
    } else if (type === 'coat') {
      const col = o.topMat === 'plate' ? '#4a5a3a' : o.topMat === 'mail' ? o.tabard : o.top;
      ctx.fillStyle = lg(ctx, 0, 108, 0, 150, [[0, shade(col, 0.05)], [1, shade(col, -0.5)]]);
      blob(ctx, [[X(62), 108], [X(70), 109], [X(66), 140], [X(58), 152], [X(54), 140]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1.1);
      blob(ctx, [[X(80), 109], [X(89), 108], [X(95), 138], [X(92), 148], [X(84), 140]], true, 0.6); ctx.fill(); stroke(ctx, LINE, 1.1);
      ctx.strokeStyle = rgba(lk.accent2, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(55), 141); ctx.lineTo(X(58), 151); ctx.stroke();
    } else if (type === 'sash') {
      ctx.fillStyle = lg(ctx, 0, 108, 0, 150, [[0, shade(lk.accent, 0.1)], [1, shade(lk.accent, -0.45)]]);
      taper(ctx, [[X(86), 110], [X(90), 124], [X(88), 142]], 7, 4); ctx.fill(); stroke(ctx, LINE, 1);
      taper(ctx, [[X(82), 110], [X(83), 126], [X(80), 136]], 5, 3); ctx.fill(); stroke(ctx, LINE, 0.9);
      if (o.topMat === 'plate' || o.topMat === 'mail') {
        const x0 = X(62); roundRect(ctx, x0, 110, 18 * lk.width, 15, 3);
        fillStroke(ctx, o.topMat === 'plate' ? metal(ctx, x0 + 18, 110, x0, 125, o.top) : '#7c8592', LINE, 1);
      }
    }
  };
}

// ---------------- 組み立て（リグ）
const RIGS = new Map();
/** クラスとスタイル（null = 基本の服）ごとの部品一式。k = 画素の倍率 */
export function heroRig(cls, style = null, k = 2) {
  const key = `${cls}|${style || 'base'}|${k}`;
  if (RIGS.has(key)) return RIGS.get(key);
  const lk = LOOKS[cls] || LOOKS.warrior;
  const o = outfit(cls, style);
  const sh = lk.shoulders;
  const rig = {
    cls, style, lk, o,
    sF: [sh[0], sh[1]], sB: [sh[2], sh[3]], hip: HIP, len: L, handRest: HAND_F, offRest: HAND_B, head: HEAD,
    glove: o.glove || lk.skin,
    cape: lk.cape ? makePart(150, 200, 75, 58, k, capeFn(o, lk, cls), 1) : null,
    skirt: lk.skirt ? makePart(150, 200, 75, 108, k, skirtFn(o, lk, cls), 1) : null,
    torso: makePart(150, 200, HIP[0], HIP[1], k, torsoFn(o, lk, cls), 1.2),
    thigh: makePart(26, 50, 13, 6, k, thighFn(o, lk)),
    shin: makePart(32, 46, 10, 5, k, shinFn(o, lk, cls)),
    upperF: makePart(40, 48, 20, 15, k, upperFn(o, lk, cls, true)),
    upperB: makePart(30, 40, 15, 8, k, upperFn(o, lk, cls, false)),
    foreF: makePart(30, 40, 13, 5, k, foreFn(o, lk, true)),
    foreB: makePart(30, 44, 13, 5, k, foreFn(o, lk, false)),
  };
  RIGS.set(key, rig);
  return rig;
}

/** 2 本の骨で手を届かせる。肘は後ろ下に曲がる */
export function ik(s, t, a, b, bend = 1) {
  let dx = t[0] - s[0]; let dy = t[1] - s[1];
  let d = Math.hypot(dx, dy);
  const maxD = a + b - 0.01; const minD = Math.abs(a - b) + 0.5;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < minD) { const k = minD / Math.max(0.001, d); dx *= k; dy *= k; d = minD; }
  const ang = Math.atan2(dy, dx);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const beta = Math.acos(Math.max(-1, Math.min(1, cos)));
  const ea = ang + beta * bend;
  const e = [s[0] + Math.cos(ea) * a, s[1] + Math.sin(ea) * a];
  const h = [s[0] + dx, s[1] + dy];
  return { e, h, upper: Math.atan2(e[1] - s[1], e[0] - s[0]) - Math.PI / 2, fore: Math.atan2(h[1] - e[1], h[0] - e[0]) - Math.PI / 2 };
}

/** 休みの姿勢 */
export const REST_POSE = { legF: [-0.12, 0.06], legB: [0.13, 0.02], handF: HAND_F, handB: HAND_B, cape: 0, skirt: 0, torso: 0, breathe: 0, backArmFront: false };

/**
 * リグを描く。原点は枠の左上（150×200 の箱）。pose は REST_POSE と同じ形。
 * hooks: { afterTorso(ctx, rig, j), weapon(ctx, rig, j)（手前の腕と拳の間） }
 * 戻り値 j: 関節の位置（handF, handB, foreF の角度など）
 */
export function drawRig(ctx, rig, pose = REST_POSE, hooks = {}) {
  const p = pose;
  const hip = [HIP[0], HIP[1] + (p.hipDy || 0)];
  const tor = p.torso || 0; // 胴の傾き（腰を中心に）
  const rot = (pt) => { if (!tor) return pt; const dx = pt[0] - hip[0]; const dy = pt[1] - hip[1]; const c = Math.cos(tor); const s = Math.sin(tor); return [hip[0] + dx * c - dy * s, hip[1] + dx * s + dy * c]; };
  const breathe = p.breathe || 0;
  const sF = rot([rig.sF[0], rig.sF[1] - breathe * 2]);
  const sB = rot([rig.sB[0], rig.sB[1] - breathe * 2]);
  const aF = ik(sF, p.handF || HAND_F, L.upper, L.fore, 1);
  const aB = ik(sB, p.handB || HAND_B, L.upper, L.fore, 1);
  const j = { handF: aF.h, handB: aB.h, foreF: aF.fore, foreB: aB.fore, sF, sB, tor, hip, rot, breathe };
  // マント
  if (rig.cape) { const nk = rot([75, 58]); drawPart(ctx, rig.cape, nk[0], nk[1] - breathe * 2, tor + (p.cape || 0)); }
  hooks.afterCape?.(ctx, rig, j);
  // 奥の腕
  const backArm = () => { drawPart(ctx, rig.upperB, sB[0], sB[1], aB.upper); drawPart(ctx, rig.foreB, aB.e[0], aB.e[1], aB.fore); hooks.afterBackArm?.(ctx, rig, j); };
  if (!p.backArmFront) backArm();
  // 脚（奥 → 手前）
  const leg = (a) => {
    const kx = hip[0] - Math.sin(a[0]) * L.thigh; const ky = hip[1] + Math.cos(a[0]) * L.thigh;
    drawPart(ctx, rig.thigh, hip[0], hip[1], a[0]);
    drawPart(ctx, rig.shin, kx, ky, a[0] + a[1]);
  };
  leg(p.legB || REST_POSE.legB);
  leg(p.legF || REST_POSE.legF);
  // 腰布
  if (rig.skirt) { const w = rot([75, 108]); drawPart(ctx, rig.skirt, w[0], w[1], tor + (p.skirt || 0)); }
  // 胴と頭
  drawPart(ctx, rig.torso, hip[0], hip[1], tor, 1, 1 + breathe * 0.012);
  hooks.afterTorso?.(ctx, rig, j);
  if (p.backArmFront) backArm();
  // 手前の腕
  drawPart(ctx, rig.upperF, sF[0], sF[1], aF.upper);
  drawPart(ctx, rig.foreF, aF.e[0], aF.e[1], aF.fore);
  hooks.weapon?.(ctx, rig, j);
  // 拳（武器の握りの上）
  ctx.save(); ctx.translate(aF.h[0], aF.h[1]); ctx.rotate(aF.fore); fistShape(ctx, 0, 0, rig.glove); ctx.restore();
  return j;
}

// ---------------- 枠の絵
export function paintHeroSlot(ctx, spec, w, h) {
  const cls = spec.params?.cls || 'warrior';
  const style = spec.params?.style || null;
  const rig = heroRig(cls, style, Math.max(2, ctxScale(ctx)));
  ctx.save();
  ctx.scale(w / HERO_W, h / HERO_H);
  drawRig(ctx, rig, REST_POSE);
  ctx.restore();
}

/** 立ち絵（クラス選択・奥義の演出） */
export function paintPortrait(ctx, spec, w, h) {
  const cls = spec.params?.cls || 'warrior';
  const c = CLASS[cls] || CLASS.warrior;
  const lk = LOOKS[cls] || LOOKS.warrior;
  // 背景
  ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, shade(c.color, -0.55)], [0.55, shade(c.color, -0.78)], [1, '#07050a']]); ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rg(ctx, w * 0.5, h * 0.42, 10, w * 0.75, [[0, rgba(c.color, 0.55)], [0.5, rgba(c.color, 0.15)], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(0, 0, w, h);
  // 紋章
  ctx.save(); ctx.globalAlpha = 0.22; ctx.translate(w * 0.5, h * 0.36); emblem(ctx, cls, w * 0.36, lk.accent2 || '#e2b04e'); ctx.restore();
  // 光の筋
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { ctx.fillStyle = rgba(c.color, 0.06); ctx.beginPath(); ctx.moveTo(w * (0.2 + i * 0.12), 0); ctx.lineTo(w * (0.28 + i * 0.12), 0); ctx.lineTo(w * (0.1 + i * 0.16), h); ctx.lineTo(w * (0.02 + i * 0.16), h); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // 体（少し大きく）
  const rig = heroRig(cls, cls === 'warrior' ? 'plate' : cls === 'ranger' ? 'leather' : cls === 'assassin' ? 'leather' : null, Math.max(2, ctxScale(ctx)) * 1.6);
  const sc = Math.min(w / HERO_W, h / HERO_H) * 1.12;
  ctx.save();
  ctx.translate(w * 0.5 - 75 * sc, h - 6 - 194 * sc);
  ctx.scale(sc, sc);
  // 足元の影
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ellipse(ctx, 76, 194, 46, 7); ctx.fill();
  const pose = { ...REST_POSE, handF: [104, 104], legF: [-0.14, 0.06], legB: [0.12, 0.04] };
  drawRig(ctx, rig, pose, { weapon: (x, r, j) => portraitWeapon(x, cls, j) });
  ctx.restore();
  // 下の霧と縁
  ctx.fillStyle = lg(ctx, 0, h * 0.78, 0, h, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(6,4,8,0.9)']]); ctx.fillRect(0, h * 0.78, w, h * 0.22);
  ctx.strokeStyle = rgba(lk.accent2 || '#e2b04e', 0.55); ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(9, 9, w - 18, h - 18);
}

function portraitWeapon(ctx, cls, j) {
  const [x, y] = j.handF;
  ctx.save(); ctx.translate(x, y);
  const steel = '#cfd6df';
  if (cls === 'warrior') { ctx.rotate(-0.35); roundRect(ctx, -2.5, -96, 5, 96, 2); fillStroke(ctx, metal(ctx, -3, 0, 3, 0, steel), LINE, 1); ctx.fillStyle = '#c9a43a'; roundRect(ctx, -11, -2, 22, 4.5, 2); ctx.fill(); ctx.fillStyle = '#4a2a1a'; ctx.fillRect(-2, 2, 4, 14); }
  else if (cls === 'ranger') { ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-60, 0, 60, -0.95, 0.95); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8; line(ctx, -60 + Math.cos(-0.95) * 60, Math.sin(-0.95) * 60, -60 + Math.cos(0.95) * 60, Math.sin(0.95) * 60); ctx.stroke(); }
  else if (cls === 'sorcerer') { ctx.rotate(-0.1); roundRect(ctx, -2, -100, 4, 128, 2); fillStroke(ctx, '#5a3a22', LINE, 1); glow(ctx, 0, -104, 18, '#7fd8ff', 0.9, '#ffffff'); }
  else if (cls === 'necromancer') { ctx.rotate(-0.12); roundRect(ctx, -2, -96, 4, 120, 2); fillStroke(ctx, '#d8d0b8', LINE, 1); ellipse(ctx, 0, -100, 7, 8); fillStroke(ctx, '#e8e0cc', LINE, 1); glow(ctx, 0, -100, 14, '#b47cff', 0.7); }
  else { ctx.rotate(0.9); roundRect(ctx, -2, -42, 4, 42, 2); fillStroke(ctx, metal(ctx, -2, 0, 2, 0, steel), LINE, 1); ctx.fillStyle = '#d39b1c'; ctx.fillRect(-6, -1, 12, 3); }
  ctx.restore();
}

/** クラスの紋章（立ち絵・アイコンの飾り） */
export function emblem(ctx, cls, r, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.stroke();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(ctx, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.lineWidth = r * 0.08;
  if (cls === 'warrior') { line(ctx, -r * 0.5, r * 0.5, r * 0.5, -r * 0.5); ctx.stroke(); line(ctx, r * 0.5, r * 0.5, -r * 0.5, -r * 0.5); ctx.stroke(); }
  else if (cls === 'ranger') { ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.55, -1, 1); ctx.stroke(); line(ctx, -r * 0.55, 0, r * 0.6, 0); ctx.stroke(); }
  else if (cls === 'sorcerer') { poly(ctx, [[0, -r * 0.6], [r * 0.5, r * 0.4], [-r * 0.5, r * 0.4]]); ctx.stroke(); ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.18, 0, TAU); ctx.fill(); }
  else if (cls === 'necromancer') { ellipse(ctx, 0, -r * 0.1, r * 0.4, r * 0.45); ctx.stroke(); ellipse(ctx, -r * 0.15, -r * 0.1, r * 0.09, r * 0.09); ctx.fill(); ellipse(ctx, r * 0.15, -r * 0.1, r * 0.09, r * 0.09); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.quadraticCurveTo(r * 0.3, 0, 0, r * 0.6); ctx.quadraticCurveTo(-r * 0.3, 0, 0, -r * 0.6); ctx.stroke(); }
  ctx.restore();
}

export { outfit as heroOutfit, matFill };
