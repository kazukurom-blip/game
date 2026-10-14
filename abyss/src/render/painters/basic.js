// コードで描く絵（仮の版）。アート担当がこのファイルを置き換えて本格的な絵にする。
// 決まり: painter(ctx, spec, w, h) は (0,0)〜(w,h) の箱に、spec.ax/ay を基準点として描く。

import { assets } from '../assets.js';
import { CLASS } from '../../data/classes.js';
import { MONSTER } from '../../data/monsters.js';
import { ELEMENT_COLORS } from '../../data/stats.js';

const STYLE_COL = { cloth: '#6a5acd', leather: '#8b5a2b', mail: '#9aa4b0', plate: '#c8ccd4' };

function hero(ctx, spec, w, h) {
  const cls = CLASS[spec.params?.cls] || CLASS.warrior;
  const st = spec.params?.style;
  const cx = w * 0.5;
  // 脚
  ctx.fillStyle = '#2a2a33';
  ctx.fillRect(cx - 22, h * 0.62, 16, h * 0.34);
  ctx.fillRect(cx + 6, h * 0.62, 16, h * 0.34);
  // 胴
  ctx.fillStyle = st ? STYLE_COL[st] : cls.color;
  roundRect(ctx, cx - 30, h * 0.27, 60, h * 0.4, 14); ctx.fill();
  // 頭
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(cx, h * 0.17, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(cx + 6, h * 0.15, 5, 5);
}

function portrait(ctx, spec, w, h) {
  const cls = CLASS[spec.params?.cls] || CLASS.warrior;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, cls.color); g.addColorStop(1, '#111');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.translate(w * 0.5 - 75 * 1.6, h - 200 * 1.6); ctx.scale(1.6, 1.6);
  hero(ctx, { params: { cls: cls.id } }, 150, 200);
  ctx.restore();
}

function weapon(ctx, spec, w, h) {
  const k = spec.params?.kind;
  const cx = w * 0.5;
  ctx.lineCap = 'round';
  if (k === 'bow' || k === 'crossbow') {
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx - 30, h * 0.5, h * 0.42, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 30 + Math.cos(-1.2) * h * 0.42, h * 0.5 + Math.sin(-1.2) * h * 0.42); ctx.lineTo(cx - 30 + Math.cos(1.2) * h * 0.42, h * 0.5 + Math.sin(1.2) * h * 0.42); ctx.stroke();
    return;
  }
  // 柄
  ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(cx, h * 0.95); ctx.lineTo(cx, h * 0.72); ctx.stroke();
  if (k === 'staff' || k === 'wand' || k === 'rod' || k === 'scythe') {
    ctx.beginPath(); ctx.moveTo(cx, h * 0.72); ctx.lineTo(cx, h * 0.1); ctx.stroke();
    ctx.fillStyle = k === 'rod' ? '#e8e0c8' : '#7fd8ff';
    ctx.beginPath(); ctx.arc(cx, h * 0.1, 12, 0, Math.PI * 2); ctx.fill();
    if (k === 'scythe') { ctx.strokeStyle = '#ccc'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx - 30, h * 0.12, 32, -0.3, 1.2); ctx.stroke(); }
    return;
  }
  // 刃
  ctx.fillStyle = '#d8dde6';
  const len = k === 'greatsword' ? 0.66 : k === 'dagger' || k === 'claw' ? 0.35 : 0.55;
  ctx.beginPath(); ctx.moveTo(cx - 7, h * 0.72); ctx.lineTo(cx, h * (0.72 - len)); ctx.lineTo(cx + 7, h * 0.72); ctx.fill();
  ctx.fillStyle = '#c9a43a'; ctx.fillRect(cx - 18, h * 0.71, 36, 6);
  if (k === 'axe') { ctx.fillStyle = '#b8bec8'; ctx.beginPath(); ctx.arc(cx + 10, h * 0.25, 26, -1.4, 1.4); ctx.fill(); }
  if (k === 'mace') { ctx.fillStyle = '#9aa'; ctx.beginPath(); ctx.arc(cx, h * 0.22, 20, 0, Math.PI * 2); ctx.fill(); }
}

function offhand(ctx, spec, w, h) {
  const k = spec.params?.kind;
  if (k === 'shield') { ctx.fillStyle = '#7a5a3a'; roundRect(ctx, w * 0.2, h * 0.1, w * 0.6, h * 0.8, 20); ctx.fill(); ctx.strokeStyle = '#c9a43a'; ctx.lineWidth = 4; ctx.stroke(); return; }
  if (k === 'orb') { ctx.fillStyle = '#6ab0ff'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.25, 0, 7); ctx.fill(); return; }
  if (k === 'grimoire') { ctx.fillStyle = '#4a2a5a'; ctx.fillRect(w * 0.25, h * 0.25, w * 0.5, h * 0.5); return; }
  if (k === 'quiver') { ctx.fillStyle = '#7a4a2a'; ctx.fillRect(w * 0.38, h * 0.15, w * 0.24, h * 0.7); return; }
  weapon(ctx, { params: { kind: 'dagger' } }, w, h);
}

function helm(ctx, spec, w, h) {
  ctx.fillStyle = STYLE_COL[spec.params?.style] || '#999';
  ctx.beginPath(); ctx.arc(w / 2, h * 0.72, w * 0.32, Math.PI, 0); ctx.fill();
}

function monster(ctx, spec, w, h) {
  const m = MONSTER[spec.params?.mon];
  const pal = m?.palette || { main: '#888', sub: '#444', eye: '#f00' };
  const body = m?.body || 'biped';
  ctx.fillStyle = pal.main;
  const cx = w / 2;
  if (body === 'quad') { roundRect(ctx, w * 0.15, h * 0.45, w * 0.65, h * 0.32, 20); ctx.fill(); ctx.beginPath(); ctx.arc(w * 0.22, h * 0.45, h * 0.15, 0, 7); ctx.fill(); ctx.fillStyle = pal.sub; for (const x of [0.2, 0.35, 0.6, 0.72]) ctx.fillRect(w * x, h * 0.72, 10, h * 0.25); }
  else if (body === 'flyer') { ctx.beginPath(); ctx.ellipse(cx, h * 0.55, w * 0.18, h * 0.14, 0, 0, 7); ctx.fill(); ctx.fillStyle = pal.sub; ctx.beginPath(); ctx.moveTo(cx, h * 0.5); ctx.lineTo(w * 0.05, h * 0.35); ctx.lineTo(w * 0.2, h * 0.65); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx, h * 0.5); ctx.lineTo(w * 0.95, h * 0.35); ctx.lineTo(w * 0.8, h * 0.65); ctx.fill(); }
  else if (body === 'blob') { ctx.beginPath(); ctx.ellipse(cx, h * 0.75, w * 0.35, h * 0.24, 0, Math.PI, 0); ctx.lineTo(w * 0.85, h * 0.97); ctx.lineTo(w * 0.15, h * 0.97); ctx.fill(); }
  else { roundRect(ctx, cx - w * 0.17, h * 0.3, w * 0.34, h * 0.42, 14); ctx.fill(); ctx.beginPath(); ctx.arc(cx, h * 0.24, w * 0.13, 0, 7); ctx.fill(); ctx.fillStyle = pal.sub; ctx.fillRect(cx - w * 0.14, h * 0.7, w * 0.1, h * 0.27); ctx.fillRect(cx + w * 0.04, h * 0.7, w * 0.1, h * 0.27); }
  ctx.fillStyle = pal.eye;
  const ey = body === 'quad' ? h * 0.42 : body === 'blob' ? h * 0.7 : body === 'flyer' ? h * 0.52 : h * 0.22;
  const ex = body === 'quad' ? w * 0.18 : cx - 8;
  ctx.fillRect(ex, ey, 6, 6); ctx.fillRect(ex + 12, ey, 6, 6);
}

function minion(ctx, spec, w, h) {
  monster(ctx, { params: {} }, w, h);
}

function fxGlow(ctx, spec, w, h) {
  const col = ELEMENT_COLORS[spec.params?.el] || '#fff';
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function icon(ctx, spec, w, h) {
  const p = spec.params || {};
  if (p.skill) { ctx.fillStyle = ELEMENT_COLORS[p.el] || '#888'; roundRect(ctx, 4, 4, w - 8, h - 8, 12); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.font = `bold ${w * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('技', w / 2, h / 2); return; }
  if (p.mat) { ctx.fillStyle = p.color || '#aaa'; ctx.beginPath(); ctx.moveTo(w / 2, 6); ctx.lineTo(w - 8, h / 2); ctx.lineTo(w / 2, h - 6); ctx.lineTo(8, h / 2); ctx.fill(); return; }
  const k = p.kind;
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.6); ctx.translate(-w / 2, -h / 2);
  if ([...'x'].length && ['sword', 'axe', 'mace', 'greatsword', 'bow', 'crossbow', 'staff', 'wand', 'scythe', 'rod', 'dagger', 'claw'].includes(k)) weapon(ctx, { params: { kind: k } }, w, h);
  else if (['shield', 'quiver', 'orb', 'grimoire', 'offblade'].includes(k)) offhand(ctx, { params: { kind: k } }, w, h);
  else { ctx.restore(); ctx.save(); ctx.fillStyle = STYLE_COL[p.style] || '#c9a43a'; roundRect(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, 10); ctx.fill(); }
  ctx.restore();
}

function bg(ctx, spec, w, h) {
  const layer = spec.params?.layer;
  if (layer === 'ground') { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a3228'); g.addColorStop(1, '#14100c'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return; }
  if (layer === 'mid') { ctx.fillStyle = 'rgba(20,18,24,0.7)'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 180, h); ctx.lineTo(i * 180 + 90, h * 0.45 + (i % 3) * 40); ctx.lineTo(i * 180 + 180, h); ctx.fill(); } return; }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a2438'); g.addColorStop(0.7, '#5a4a48'); g.addColorStop(1, '#1a1416');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function installBasicPainters() {
  assets.addPainter('hero', (ctx, spec, w, h) => (spec.id.endsWith('.portrait') ? portrait(ctx, spec, w, h) : hero(ctx, spec, w, h)));
  for (const k of ['sword', 'axe', 'mace', 'greatsword', 'bow', 'crossbow', 'staff', 'wand', 'scythe', 'rod', 'dagger', 'claw']) assets.addPainter(`gear.${k}`, weapon);
  for (const k of ['shield', 'quiver', 'orb', 'grimoire', 'offblade']) assets.addPainter(`gear.${k}`, offhand);
  assets.addPainter('gear.helm', helm);
  for (const s of ['chest', 'gloves', 'belt', 'legs', 'boots']) assets.addPainter(`gear.${s}`, () => {});
  assets.addPainter('monster', monster);
  assets.addPainter('minion', minion);
  assets.addPainter('fx', fxGlow);
  assets.addPainter('icon', icon);
  assets.addPainter('bg', bg);
  assets.addPainter('ui', (ctx, spec, w, h) => { ctx.fillStyle = '#c9a43a'; ctx.font = `bold ${h * 0.4}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ABYSS DROP', w / 2, h / 2); });
}
