// モンスター/ペット描画の共通キット（フラッシュ状態・塗り＋線・かわいい目・頬）
import { rgba, OUTLINE } from './util.js';

const PI = Math.PI;
/** 被弾フラッシュ中は全塗りを白に（live binding） */
export let FL = false;
export function setFL(v) { FL = !!v; }
export const C = (c) => (FL ? '#ffffff' : c);
export const OC = () => (FL ? '#ffd8ea' : OUTLINE);
export function fs(ctx, col, lw = 2) { ctx.fillStyle = C(col); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke(); }

/** def.color が未指定/白（mk() の既定値）なら既定色を使う */
export function pickCol(c, dflt) { return (!c || c === '#ffffff' || c === '#fff') ? dflt : c; }

export function cuteEyes(ctx, x, y, r, gap, col, st, t, sleepy) {
  if (st === 'hurt') {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.6, r * 0.45); ctx.beginPath();
    ctx.moveTo(x - gap - r, y - r); ctx.lineTo(x - gap + r * 0.6, y); ctx.lineTo(x - gap - r, y + r);
    ctx.moveTo(x + gap + r, y - r); ctx.lineTo(x + gap - r * 0.6, y); ctx.lineTo(x + gap + r, y + r);
    ctx.stroke(); return;
  }
  if (st === 'dead') {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.5, r * 0.4); ctx.beginPath();
    for (const cx of [x - gap, x + gap]) { ctx.moveTo(cx - r * 0.8, y - r * 0.8); ctx.lineTo(cx + r * 0.8, y + r * 0.8); ctx.moveTo(cx + r * 0.8, y - r * 0.8); ctx.lineTo(cx - r * 0.8, y + r * 0.8); }
    ctx.stroke(); return;
  }
  const blink = ((t + x * 0.01) % 4.2) < 0.12;
  for (const cx of [x - gap, x + gap]) {
    if (blink) {
      ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.4, r * 0.35); ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.quadraticCurveTo(cx, y + r * 0.6, cx + r, y); ctx.stroke();
      continue;
    }
    ctx.beginPath(); ctx.ellipse(cx, y, r * 0.85, r * 1.15, 0, 0, PI * 2);
    if (FL) ctx.fillStyle = '#fff';
    else { const g = ctx.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, '#1a0f24'); g.addColorStop(1, col); ctx.fillStyle = g; }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + r * 0.25, y - r * 0.4, r * 0.38, 0, PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r * 0.3, y + r * 0.45, r * 0.18, 0, PI * 2); ctx.fill();
    if (sleepy) { ctx.strokeStyle = OC(); ctx.lineWidth = r * 0.4; ctx.beginPath(); ctx.moveTo(cx - r, y - r * 0.5); ctx.lineTo(cx + r, y - r * 0.7); ctx.stroke(); }
  }
}

export function blush(ctx, x, y, rx) {
  ctx.fillStyle = C('rgba(255,110,150,0.5)');
  ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, PI * 2); ctx.fill();
}

/** 小さな口: 'smile' | 'open' | 'cat' | 'flat' */
export function mouth(ctx, x, y, s, kind) {
  ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.1, s * 0.35); ctx.beginPath();
  if (kind === 'open') {
    ctx.moveTo(x - s, y - s * 0.2); ctx.quadraticCurveTo(x, y + s * 1.6, x + s, y - s * 0.2); ctx.closePath();
    ctx.fillStyle = C('#c2304a'); ctx.fill(); ctx.stroke();
    return;
  }
  if (kind === 'cat') { ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.8, x, y); ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.8, x + s, y); }
  else if (kind === 'flat') { ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x + s * 0.7, y); }
  else { ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x, y + s, x + s, y); }
  ctx.stroke();
}

export function glow(ctx, x, y, r, col, a) {
  if (FL) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
  ctx.restore();
}
