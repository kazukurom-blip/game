// スキルの演出の枠の絵（fx.<skill>.proj / hit / area / swing、fx.enemy.*）。
// 戦闘中の演出は fx.js がその場で描くので、ここは「差し替えるときの見本」と、差し替え画面・型紙で見える絵。
// 黒い背景に加算で重ねる前提（白い芯 → 属性の色 → 透明）。

import { SKILL } from '../../data/skills.js';
import { ELEMENT_COLORS } from '../../data/stats.js';
import { TAU, rgba, shade, lg, rg, ellipse, poly, star, line, rng } from './util.js';

const PAL = {
  phys: ['#ffffff', '#efe8d8', '#a8987e'], fire: ['#fff2c0', '#ff8a2a', '#ff3a10'], cold: ['#ffffff', '#8ae4ff', '#2a7aff'], lightning: ['#ffffff', '#fff07a', '#9aa8ff'],
  poison: ['#eaffc0', '#8cff4a', '#2a9a20'], void: ['#f2dcff', '#c68cff', '#6a20c0'], enemy: ['#ffe0d0', '#ff5040', '#a01010'],
};
const palOf = (el) => PAL[el] || PAL[Object.keys(ELEMENT_COLORS).includes(el) ? el : 'phys'] || PAL.phys;

function orbAt(ctx, x, y, r, P) {
  ctx.fillStyle = rg(ctx, x, y, 0, r, [[0, P[0]], [0.2, P[0]], [0.45, rgba(P[1], 0.85)], [1, rgba(P[2], 0)]]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

export function paintFxSlot(ctx, spec, w, h) {
  const p = spec.params || {};
  const parts = spec.id.split('.');
  if (parts[1] === 'enemy') return enemyProj(ctx, p.proj || parts[2], w, h);
  const skill = p.skill || parts[1];
  const part = p.part || parts[2] || 'hit';
  const def = SKILL[skill] || {};
  const P = palOf(p.el || def.element || 'phys');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  switch (part) {
    case 'proj': {
      const cx = w * (spec.ax ?? 0.6); const cy = h * 0.5;
      ctx.fillStyle = lg(ctx, 0, 0, cx, 0, [[0, rgba(P[2], 0)], [0.6, rgba(P[1], 0.55)], [1, rgba(P[0], 0.9)]]);
      ctx.beginPath(); ctx.moveTo(2, cy); ctx.quadraticCurveTo(cx * 0.6, cy - h * 0.28, cx, cy - h * 0.18); ctx.lineTo(cx, cy + h * 0.18); ctx.quadraticCurveTo(cx * 0.6, cy + h * 0.28, 2, cy); ctx.fill();
      if (def.cls === 'ranger') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 3; line(ctx, cx - 40, cy, cx + 12, cy); ctx.stroke();
        ctx.fillStyle = '#e0e6ec'; poly(ctx, [[cx + 24, cy], [cx + 10, cy - 6], [cx + 10, cy + 6]]); ctx.fill();
        ctx.fillStyle = '#e8e2d0'; poly(ctx, [[cx - 40, cy], [cx - 50, cy - 7], [cx - 34, cy - 1]]); ctx.fill(); poly(ctx, [[cx - 40, cy], [cx - 50, cy + 7], [cx - 34, cy + 1]]); ctx.fill();
      } else orbAt(ctx, cx, cy, h * 0.48, P);
      break;
    }
    case 'hit': {
      const cx = w / 2; const cy = h / 2;
      orbAt(ctx, cx, cy, w * 0.32, P);
      ctx.fillStyle = rgba(P[1], 0.9); star(ctx, cx, cy, 8, w * 0.46, w * 0.08, rng(skill)() * TAU); ctx.fill();
      ctx.fillStyle = P[0]; star(ctx, cx, cy, 4, w * 0.3, w * 0.05, 0.4); ctx.fill();
      break;
    }
    case 'area': {
      const cx = w / 2; const cy = h / 2;
      ctx.fillStyle = rg(ctx, cx, cy, 0, w / 2, [[0, rgba(P[0], 0.5)], [0.35, rgba(P[1], 0.25)], [0.72, rgba(P[1], 0.85)], [0.8, rgba(P[0], 0.9)], [0.9, rgba(P[2], 0.4)], [1, rgba(P[2], 0)]]);
      ctx.beginPath(); ctx.arc(cx, cy, w / 2, 0, TAU); ctx.fill();
      const r = rng(`${skill}:area`);
      ctx.strokeStyle = rgba(P[0], 0.7); ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const a = r() * TAU; const d0 = w * 0.12; const d1 = w * (0.3 + r() * 0.15); line(ctx, cx + Math.cos(a) * d0, cy + Math.sin(a) * d0, cx + Math.cos(a) * d1, cy + Math.sin(a) * d1); ctx.stroke(); }
      break;
    }
    default: { // swing
      const cx = w * 0.5; const cy = h * 0.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, w * (0.44 - i * 0.015), -1.35, 1.35); ctx.arc(cx, cy - w * 0.05 + i * w * 0.015, w * (0.3 + i * 0.03), 1.2, -1.2, true); ctx.closePath();
        ctx.fillStyle = i === 2 ? P[0] : rgba(P[1], 0.4 + i * 0.25); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function enemyProj(ctx, kind, w, h) {
  const cx = w * 0.55; const cy = h * 0.5;
  ctx.save();
  switch (kind) {
    case 'arrow': {
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2.6; line(ctx, cx - 26, cy, cx + 10, cy); ctx.stroke();
      ctx.fillStyle = '#c8ccd2'; poly(ctx, [[cx + 22, cy], [cx + 8, cy - 5], [cx + 8, cy + 5]]); ctx.fill();
      ctx.fillStyle = '#5a2a2a'; poly(ctx, [[cx - 26, cy], [cx - 34, cy - 6], [cx - 20, cy - 1]]); ctx.fill(); poly(ctx, [[cx - 26, cy], [cx - 34, cy + 6], [cx - 20, cy + 1]]); ctx.fill();
      break;
    }
    case 'bone': {
      ctx.fillStyle = '#ece2c8'; ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 1.2;
      poly(ctx, [[cx + 22, cy], [cx - 4, cy - 5], [cx - 24, cy - 2], [cx - 24, cy + 2], [cx - 4, cy + 5]]); ctx.fill(); ctx.stroke();
      break;
    }
    case 'ice': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = lg(ctx, 0, 0, cx, 0, [[0, 'rgba(42,122,255,0)'], [1, 'rgba(138,228,255,0.8)']]); ctx.fillRect(0, cy - 6, cx, 12);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = lg(ctx, cx - 14, 0, cx + 16, 0, [[0, '#5ab0e8'], [0.6, '#ffffff'], [1, '#bdefff']]); poly(ctx, [[cx + 18, cy], [cx, cy - 7], [cx - 16, cy], [cx, cy + 7]]); ctx.fill();
      break;
    }
    default: {
      const P = kind === 'fireball' ? PAL.fire : kind === 'spit' ? PAL.poison : PAL.enemy;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = lg(ctx, 0, 0, cx, 0, [[0, rgba(P[2], 0)], [1, rgba(P[1], 0.75)]]);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.quadraticCurveTo(cx * 0.6, cy - h * 0.3, cx, cy - h * 0.2); ctx.lineTo(cx, cy + h * 0.2); ctx.quadraticCurveTo(cx * 0.6, cy + h * 0.3, 0, cy); ctx.fill();
      orbAt(ctx, cx, cy, h * 0.45, P);
    }
  }
  ctx.restore();
  void shade; void ellipse;
}
