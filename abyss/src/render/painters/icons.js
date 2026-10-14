// アイコン: 持ち物（武器・副手・防具 6 部位 × 4 スタイル・首飾り・指輪）、素材、宝石、ルーン、スキル、知らない ID の予備。
// 持ち物の枠の中に置くので、背景は透明で、形がはっきり見えるように縁取りと落ち影を付ける。

import { SKILL } from '../../data/skills.js';
import { CLASS } from '../../data/classes.js';
import { ELEMENT_COLORS } from '../../data/stats.js';
import { TAU, rgba, shade, mix, lg, rg, roundRect, ellipse, blob, taper, poly, fillStroke, stroke, line, outlined, glow, metal, hash, rng, star, hue, luma } from './util.js';
import { drawWeapon, drawOffhand, drawHelm, BASE_PAL, WEAPON_KINDS_ALL, OFFHAND_KINDS_ALL } from './gear.js';
import { matFill } from './heroes.js';
import { emblem } from './heroes.js';

const LINE = 'rgba(10,6,14,0.92)';
const STYLE_COL = { cloth: '#5a4a7a', leather: '#7a4f2e', mail: '#8b94a1', plate: '#a9b2bf' };
const TRIM = '#d2ad55';

// 武器の長さ（握りからの上端・下端）
const EXT = { sword: [-98, 16], greatsword: [-119, 22], dagger: [-57, 13], axe: [-104, 14], mace: [-108, 14], bow: [-68, 68], crossbow: [-90, 26], staff: [-120, 24], wand: [-64, 12], scythe: [-122, 22], rod: [-122, 20], claw: [-62, 10], offblade: [-66, 13] };

/** 影を落としてから描く */
function shadowed(ctx, w, h, fn) {
  outlined(ctx, w, h, fn, { width: 1.1, glow: { color: 'rgba(0,0,0,0.9)', blur: 4, alpha: 0.6 } });
}

// ---------------- 持ち物
export function paintItemIcon(ctx, spec, w, h) {
  const p = spec.params || {};
  const parts = spec.id.split('.');
  const kind = p.kind || parts[2];
  const style = p.style || parts[3];
  if (WEAPON_KINDS_ALL.includes(kind) || kind === 'offblade') return weaponIcon(ctx, kind, w, h, p.pal || BASE_PAL);
  if (OFFHAND_KINDS_ALL.includes(kind)) {
    shadowed(ctx, w, h, (c) => { c.save(); c.translate(w / 2, h / 2); c.rotate(kind === 'quiver' ? 0.5 : 0); const s = kind === 'shield' ? 0.92 : kind === 'quiver' ? 0.82 : 1.05; c.scale(s * w / 96, s * h / 96); drawOffhand(c, kind, 0, kind === 'quiver' ? 4 : 0, p.pal || BASE_PAL); c.restore(); });
    return;
  }
  if (kind === 'helm') { shadowed(ctx, w, h, (c) => { c.save(); c.translate(w / 2 - 44 * w / 96, h / 2 - 48 * h / 96); c.scale(1.1 * w / 96, 1.1 * h / 96); drawHelm(c, style || 'plate', 80, 70, { cloth: '#4a3a5a' }); c.restore(); }); return; }
  if (kind === 'amulet') return amulet(ctx, w, h, p);
  if (kind === 'ring') return ring(ctx, w, h, p);
  shadowed(ctx, w, h, (c) => { c.save(); c.scale(w / 96, h / 96); armorPiece(c, kind, style || 'leather'); c.restore(); });
}

function weaponIcon(ctx, kind, w, h, pal) {
  const [a, b] = EXT[kind] || [-100, 16];
  const len = b - a;
  const diag = Math.hypot(w, h) * (kind === 'bow' ? 0.62 : kind === 'crossbow' ? 0.7 : 0.78);
  const s = Math.min(1.25, diag / len);
  const mid = (a + b) / 2;
  shadowed(ctx, w, h, (c) => {
    c.save(); c.translate(w / 2 + (kind === 'bow' ? w * 0.1 : 0), h / 2 + (kind === 'bow' ? -h * 0.04 : 0));
    c.rotate(kind === 'bow' ? 0.65 : Math.PI / 4);
    c.scale(s, s);
    if (kind === 'offblade') drawWeapon(c, 'offblade', 0, -mid, pal);
    else drawWeapon(c, kind, 0, -mid, pal);
    c.restore();
  });
}

function armorPiece(ctx, slot, style) {
  const col = STYLE_COL[style] || '#7a4f2e';
  const mat = style === 'cloth' ? 'cloth' : style;
  const paint = (path, box, seed) => { ctx.save(); path(); ctx.clip(); matFill(ctx, mat, col, box, seed); ctx.restore(); path(); stroke(ctx, LINE, 1.6); };
  switch (slot) {
    case 'chest': {
      const path = () => blob(ctx, [[30, 16], [40, 20], [48, 22], [56, 20], [66, 16], [80, 24], [84, 40], [74, 44], [72, 80], [48, 86], [24, 80], [22, 44], [12, 40], [16, 24]], true, 0.4);
      paint(path, [10, 14, 86, 88], 3);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; blob(ctx, [[40, 20], [48, 30], [56, 20], [52, 18], [44, 18]], true, 0.5); ctx.fill();
      if (style === 'plate') { ctx.strokeStyle = TRIM; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, 46); ctx.quadraticCurveTo(48, 54, 70, 46); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(60, 26); ctx.quadraticCurveTo(66, 44, 60, 62); ctx.stroke(); for (const y of [62, 72]) { ctx.strokeStyle = 'rgba(20,24,34,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(26, y); ctx.quadraticCurveTo(48, y + 5, 70, y); ctx.stroke(); } }
      else if (style === 'mail') { ctx.fillStyle = lg(ctx, 0, 40, 0, 86, [[0, '#9a2a24'], [1, '#4a0a0a']]); poly(ctx, [[38, 40], [58, 40], [60, 86], [36, 86]]); ctx.fill(); stroke(ctx, TRIM, 1.2); }
      else if (style === 'leather') { ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = 4; line(ctx, 28, 24, 66, 76); ctx.stroke(); roundRect(ctx, 44, 46, 8, 7, 1.5); fillStroke(ctx, TRIM, LINE, 1); ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(240,220,180,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(26, 50); ctx.lineTo(28, 78); ctx.moveTo(70, 50); ctx.lineTo(68, 78); ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.strokeStyle = TRIM; ctx.lineWidth = 2; line(ctx, 48, 28, 48, 86); ctx.stroke(); ctx.strokeStyle = rgba('#c77dff', 0.8); ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(48, 44 + i * 13, 3.5, 0, TAU); ctx.stroke(); } }
      break;
    }
    case 'gloves': {
      const path = () => { ctx.beginPath(); ctx.moveTo(30, 84); ctx.lineTo(28, 56); ctx.quadraticCurveTo(26, 40, 32, 30); ctx.lineTo(34, 16); ctx.quadraticCurveTo(38, 12, 41, 16); ctx.lineTo(42, 28); ctx.lineTo(45, 12); ctx.quadraticCurveTo(49, 8, 52, 12); ctx.lineTo(52, 28); ctx.lineTo(56, 14); ctx.quadraticCurveTo(60, 11, 62, 16); ctx.lineTo(60, 32); ctx.lineTo(66, 24); ctx.quadraticCurveTo(71, 22, 71, 28); ctx.lineTo(66, 46); ctx.quadraticCurveTo(66, 56, 62, 60); ctx.lineTo(64, 84); ctx.closePath(); };
      paint(path, [24, 8, 74, 86], 5);
      roundRect(ctx, 26, 62, 42, 22, 4); ctx.save(); ctx.clip(); matFill(ctx, mat, shade(col, -0.1), [26, 62, 68, 84], 7); ctx.restore(); stroke(ctx, LINE, 1.4);
      ctx.fillStyle = style === 'plate' || style === 'mail' ? TRIM : shade(col, -0.45); ctx.fillRect(26, 62, 42, 3);
      if (style === 'plate') for (const y of [34, 42, 50]) { ctx.strokeStyle = 'rgba(20,24,34,0.5)'; ctx.lineWidth = 1; line(ctx, 32, y, 64, y - 2); ctx.stroke(); }
      break;
    }
    case 'belt': {
      ctx.save(); ctx.translate(0, 4);
      const path = () => { ctx.beginPath(); ctx.moveTo(10, 40); ctx.quadraticCurveTo(48, 54, 86, 40); ctx.lineTo(86, 54); ctx.quadraticCurveTo(48, 68, 10, 54); ctx.closePath(); };
      paint(path, [8, 38, 88, 68], 9);
      roundRect(ctx, 38, 42, 20, 20, 3); fillStroke(ctx, metal(ctx, 58, 42, 38, 62, style === 'cloth' ? '#c8c0a8' : TRIM), LINE, 1.4);
      roundRect(ctx, 43, 47, 10, 10, 2); ctx.fillStyle = '#2a1a10'; ctx.fill();
      ctx.fillStyle = rgba('#c0392b', 0.95); ellipse(ctx, 48, 52, 2.6, 2.6); ctx.fill();
      for (const x of [20, 28, 68, 76]) { ctx.fillStyle = '#e8dcc0'; ellipse(ctx, x, 48 + Math.abs(x - 48) * -0.06 + 3, 1.4, 1.4); ctx.fill(); }
      // 垂れ（ポーチ）
      roundRect(ctx, 62, 56, 14, 16, 3); fillStroke(ctx, lg(ctx, 0, 56, 0, 72, [[0, '#8a6038'], [1, '#4a2e18']]), LINE, 1.2);
      ctx.restore();
      break;
    }
    case 'legs': {
      const path = () => { ctx.beginPath(); ctx.moveTo(24, 14); ctx.lineTo(72, 14); ctx.lineTo(74, 30); ctx.lineTo(70, 86); ctx.lineTo(54, 86); ctx.lineTo(49, 38); ctx.lineTo(47, 38); ctx.lineTo(42, 86); ctx.lineTo(26, 86); ctx.lineTo(22, 30); ctx.closePath(); };
      paint(path, [20, 12, 76, 88], 11);
      ctx.fillStyle = shade(col, -0.5); ctx.fillRect(24, 14, 48, 6);
      if (style === 'plate') { for (const x of [34, 62]) { ellipse(ctx, x, 56, 8, 6); fillStroke(ctx, metal(ctx, x + 8, 50, x - 8, 62, col), LINE, 1.2); ctx.fillStyle = TRIM; ellipse(ctx, x, 56, 1.6, 1.6); ctx.fill(); } }
      else if (style === 'leather') { ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = 3; for (const [x0, x1] of [[26, 44], [52, 70]]) { line(ctx, x0, 46, x1, 46); ctx.stroke(); line(ctx, x0 + 2, 70, x1 - 2, 70); ctx.stroke(); } }
      break;
    }
    case 'boots': {
      const path = () => { ctx.beginPath(); ctx.moveTo(28, 12); ctx.lineTo(54, 12); ctx.lineTo(56, 58); ctx.quadraticCurveTo(80, 60, 84, 74); ctx.lineTo(84, 84); ctx.lineTo(24, 84); ctx.lineTo(26, 60); ctx.closePath(); };
      paint(path, [22, 10, 86, 86], 13);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(24, 80, 60, 4);
      ctx.fillStyle = style === 'plate' ? TRIM : shade(col, -0.45); ctx.fillRect(27, 12, 28, 6);
      if (style === 'plate') for (const y of [30, 42, 66]) { ctx.strokeStyle = 'rgba(20,24,34,0.5)'; ctx.lineWidth = 1.2; line(ctx, 28, y, 55, y); ctx.stroke(); }
      if (style === 'leather') { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1.2; for (let y = 24; y < 58; y += 7) { line(ctx, 44, y, 52, y + 3); ctx.stroke(); } }
      break;
    }
    default: {
      roundRect(ctx, 24, 24, 48, 48, 10); fillStroke(ctx, metal(ctx, 72, 24, 24, 72, col), LINE, 1.5);
    }
  }
}

function amulet(ctx, w, h, p) {
  shadowed(ctx, w, h, (c) => {
    c.save(); c.scale(w / 96, h / 96);
    c.strokeStyle = metal(c, 20, 10, 76, 50, TRIM); c.lineWidth = 2.6; c.setLineDash([3, 1.5]);
    c.beginPath(); c.moveTo(20, 10); c.quadraticCurveTo(22, 46, 48, 52); c.quadraticCurveTo(74, 46, 76, 10); c.stroke(); c.setLineDash([]);
    poly(c, [[48, 44], [64, 58], [48, 88], [32, 58]]); fillStroke(c, metal(c, 64, 44, 32, 88, TRIM), LINE, 1.5);
    const gc = p.color || '#c0392b';
    gem(c, 48, 62, 9, gc, 6);
    c.restore();
  });
}
function ring(ctx, w, h, p) {
  shadowed(ctx, w, h, (c) => {
    c.save(); c.scale(w / 96, h / 96); c.translate(48, 54); c.rotate(-0.35);
    c.lineWidth = 9; c.strokeStyle = LINE; c.beginPath(); c.ellipse(0, 6, 25, 22, 0, 0, TAU); c.stroke();
    c.lineWidth = 6.5; c.strokeStyle = metal(c, -25, -16, 25, 28, TRIM); c.beginPath(); c.ellipse(0, 6, 25, 22, 0, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(0, 6, 25, 22, 0, -2.6, -1.4); c.stroke();
    poly(c, [[-12, -16], [12, -16], [8, -6], [-8, -6]]); fillStroke(c, metal(c, 12, -16, -12, -6, TRIM), LINE, 1.2);
    gem(c, 0, -24, 10, p.color || '#3a8aff', 8);
    c.restore();
  });
}

/** カットした宝石。facets が多いほど上等 */
export function gem(ctx, x, y, r, col, facets = 6, shape = 'round') {
  const pts = [];
  for (let i = 0; i < facets; i++) { const a = -Math.PI / 2 + (i / facets) * TAU; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * (shape === 'tall' ? 1.3 : 1)]); }
  poly(ctx, pts); fillStroke(ctx, rg(ctx, x - r * 0.3, y - r * 0.4, 0, r * 1.2, [[0, '#ffffff'], [0.25, shade(col, 0.45)], [0.7, col], [1, shade(col, -0.55)]]), LINE, 1.2);
  // 面
  ctx.strokeStyle = rgba(shade(col, 0.6), 0.55); ctx.lineWidth = 0.7;
  const inner = pts.map(([px, py]) => [x + (px - x) * 0.5, y + (py - y) * 0.5]);
  poly(ctx, inner); ctx.stroke();
  for (let i = 0; i < facets; i++) { line(ctx, pts[i][0], pts[i][1], inner[i][0], inner[i][1]); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; star(ctx, x - r * 0.35, y - r * 0.4, 4, r * 0.32, r * 0.08); ctx.fill();
}

// ---------------- 素材
const MAT_KINDS = [
  ['core', /core|heart|nucleus|核|心臓|心/],
  ['ingot', /scrap|iron|\bore|ingot|metal|steel|鉄|鋼|屑|鉱|金属/],
  ['dust', /dust|powder|sand|ash|塵|粉|砂|灰/],
  ['echo', /echo|soul|spirit|wisp|ghost|残響|魂|霊|想い/],
  ['shard', /shard|fragment|splinter|欠片|破片|かけら/],
  ['vial', /essence|vial|potion|elixir|reagent|tincture|試薬|薬|液|エキス|雫|滴/],
  ['scroll', /scroll|page|tome|book|書|巻物|頁|紙/],
  ['rune', /rune|sigil|seal|glyph|印|刻|紋|符/],
  ['key', /key|鍵/],
  ['egg', /egg|卵/],
  ['feather', /feather|plume|羽/],
  ['bone', /bone|skull|fang|骨|牙/],
  ['coin', /coin|gold|money|金貨|貨|銭/],
  ['thread', /thread|cloth|silk|布|糸|絹/],
  ['orb', /orb|sphere|pearl|珠|玉|真珠/],
  ['crystal', /crystal|gem|jewel|prism|晶|結晶|宝石|石/],
];
export function materialKind(id, name = '', tier = 0) {
  const s = `${id} ${name}`.toLowerCase();
  for (const [k, re] of MAT_KINDS) if (re.test(s)) return k;
  return ['ingot', 'dust', 'crystal', 'echo', 'core'][Math.max(0, Math.min(4, tier | 0))];
}
export function paintMaterialIcon(ctx, spec, w, h) {
  const p = spec.params || {};
  const id = p.mat || spec.id.split('.').slice(2).join('.');
  const col = p.color || hue('#c77dff', hash(id) % 360);
  const kind = p.kind || materialKind(id, p.name || spec.label || '', p.tier);
  shadowed(ctx, w, h, (c) => { c.save(); c.scale(w / 64, h / 64); drawMaterial(c, kind, col, id); c.restore(); });
}
export function drawMaterial(ctx, kind, col, seed = 'm') {
  const r = rng(seed);
  switch (kind) {
    case 'ingot': {
      for (const [x, y, rot] of [[22, 40, -0.2], [40, 42, 0.25], [31, 28, 0.05]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        poly(ctx, [[-12, -5], [10, -6], [13, 4], [-11, 6]]); fillStroke(ctx, metal(ctx, 12, -6, -12, 6, col), LINE, 1.2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; poly(ctx, [[-11, 6], [13, 4], [12, 7], [-10, 9]]); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'dust': {
      ellipse(ctx, 32, 46, 22, 9); fillStroke(ctx, lg(ctx, 0, 36, 0, 56, [[0, shade(col, 0.3)], [1, shade(col, -0.4)]]), LINE, 1.2);
      blob(ctx, [[12, 46], [22, 30], [32, 22], [42, 30], [52, 46]], false, 0.5); ctx.lineTo(12, 46); fillStroke(ctx, lg(ctx, 0, 22, 0, 48, [[0, shade(col, 0.5)], [1, col]]), LINE, 1.2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) { ctx.fillStyle = rgba(i % 2 ? '#ffffff' : col, 0.9); ellipse(ctx, 14 + r() * 36, 18 + r() * 28, 0.6 + r() * 0.9, 0.6 + r() * 0.9); ctx.fill(); }
      star(ctx, 44, 18, 4, 4.5, 1); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      break;
    }
    case 'crystal': {
      glow(ctx, 32, 34, 24, col, 0.35);
      for (const [x, y, hh, rot] of [[22, 48, 26, -0.35], [42, 48, 22, 0.3], [32, 50, 36, 0]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        poly(ctx, [[-5, 0], [-5, -hh * 0.75], [0, -hh], [5, -hh * 0.75], [5, 0]]); fillStroke(ctx, lg(ctx, -5, 0, 5, 0, [[0, shade(col, -0.35)], [0.45, shade(col, 0.5)], [0.55, col], [1, shade(col, -0.2)]]), LINE, 1.1);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; line(ctx, 0, -hh + 2, 0, -2); ctx.stroke();
        ctx.restore();
      }
      ellipse(ctx, 32, 52, 16, 4); fillStroke(ctx, '#4a4048', LINE, 1);
      break;
    }
    case 'echo': {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 32, 36, 26, col, 0.6);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba(i === 2 ? '#ffffff' : col, 0.7 - i * 0.15); const s = 1 - i * 0.28; ctx.beginPath(); ctx.moveTo(32 - 12 * s, 46); ctx.bezierCurveTo(32 - 16 * s, 30, 32 - 2 * s, 26, 34, 10 + i * 6); ctx.bezierCurveTo(36 + 10 * s, 26, 32 + 16 * s, 34, 32 + 12 * s, 46); ctx.quadraticCurveTo(32, 54, 32 - 12 * s, 46); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#1a0c10'; ellipse(ctx, 28, 38, 1.8, 2.4); ctx.fill(); ellipse(ctx, 35, 38, 1.8, 2.4); ctx.fill();
      break;
    }
    case 'core': {
      glow(ctx, 32, 32, 28, col, 0.55);
      ellipse(ctx, 32, 32, 13, 13); fillStroke(ctx, rg(ctx, 28, 28, 0, 15, [[0, '#ffffff'], [0.3, shade(col, 0.4)], [1, shade(col, -0.5)]]), LINE, 1.3);
      ctx.strokeStyle = metal(ctx, 16, 16, 48, 48, '#b0a080'); ctx.lineWidth = 2.6;
      for (const a of [0.5, 2.6, 4.7]) { ctx.beginPath(); ctx.ellipse(32, 32, 18, 6, a, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.6; for (const a of [0.5, 2.6, 4.7]) { ctx.beginPath(); ctx.ellipse(32, 32, 19.5, 7.5, a, 0, TAU); ctx.stroke(); }
      break;
    }
    case 'shard': {
      glow(ctx, 32, 32, 22, col, 0.45);
      poly(ctx, [[30, 6], [44, 24], [40, 50], [26, 58], [20, 34]]); fillStroke(ctx, lg(ctx, 20, 6, 44, 58, [[0, shade(col, 0.6)], [0.5, col], [1, shade(col, -0.6)]]), LINE, 1.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(30, 8); ctx.lineTo(32, 30); ctx.lineTo(26, 56); ctx.moveTo(32, 30); ctx.lineTo(42, 26); ctx.stroke();
      poly(ctx, [[46, 40], [54, 46], [50, 56], [44, 52]]); fillStroke(ctx, shade(col, -0.2), LINE, 1);
      break;
    }
    case 'vial': {
      roundRect(ctx, 27, 8, 10, 12, 2); fillStroke(ctx, '#8a6a4a', LINE, 1.1);
      ctx.beginPath(); ctx.moveTo(28, 18); ctx.lineTo(36, 18); ctx.lineTo(36, 26); ctx.quadraticCurveTo(50, 32, 50, 44); ctx.quadraticCurveTo(50, 58, 32, 58); ctx.quadraticCurveTo(14, 58, 14, 44); ctx.quadraticCurveTo(14, 32, 28, 26); ctx.closePath();
      fillStroke(ctx, 'rgba(200,220,255,0.18)', LINE, 1.3);
      ctx.save(); ctx.clip(); ctx.fillStyle = lg(ctx, 0, 36, 0, 58, [[0, shade(col, 0.3)], [1, shade(col, -0.4)]]); ctx.fillRect(10, 38, 44, 22); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ellipse(ctx, 22, 40, 2.4, 5, 0.3); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 32, 48, 14, col, 0.45); ctx.restore();
      break;
    }
    case 'scroll': {
      roundRect(ctx, 14, 14, 36, 36, 3); fillStroke(ctx, lg(ctx, 0, 14, 0, 50, [[0, '#f2e6c8'], [1, '#c8b088']]), LINE, 1.2);
      for (const y of [12, 50]) { roundRect(ctx, 10, y - 4, 44, 8, 4); fillStroke(ctx, '#8a6038', LINE, 1.1); }
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.2; for (let i = 0; i < 4; i++) { line(ctx, 20, 22 + i * 6, 44 - (i % 2) * 6, 22 + i * 6); ctx.stroke(); }
      ctx.fillStyle = '#b02a20'; ellipse(ctx, 42, 44, 4, 4); ctx.fill();
      break;
    }
    case 'rune': return drawRuneStone(ctx, 32, 32, 22, col, seed);
    case 'key': {
      ctx.strokeStyle = LINE; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(22, 22, 9, 0, TAU); ctx.stroke(); line(ctx, 28, 28, 50, 50); ctx.stroke();
      ctx.strokeStyle = metal(ctx, 10, 10, 50, 50, col); ctx.lineWidth = 3.6; ctx.beginPath(); ctx.arc(22, 22, 9, 0, TAU); ctx.stroke(); line(ctx, 28, 28, 50, 50); ctx.stroke();
      for (const t of [0.7, 0.88]) { const x = 28 + 22 * t; const y = 28 + 22 * t; poly(ctx, [[x, y], [x + 6, y - 6], [x + 9, y - 3], [x + 3, y + 3]]); fillStroke(ctx, col, LINE, 1); }
      break;
    }
    case 'egg': {
      ellipse(ctx, 32, 36, 16, 21); fillStroke(ctx, rg(ctx, 26, 26, 1, 24, [[0, '#ffffff'], [0.4, shade(col, 0.45)], [1, shade(col, -0.4)]]), LINE, 1.4);
      ctx.fillStyle = rgba(shade(col, -0.5), 0.6); for (let i = 0; i < 6; i++) { ellipse(ctx, 22 + r() * 20, 26 + r() * 22, 2 + r() * 2, 1.5 + r() * 1.5); ctx.fill(); }
      break;
    }
    case 'feather': {
      ctx.save(); ctx.translate(32, 32); ctx.rotate(0.6);
      blob(ctx, [[0, -26], [8, -12], [6, 10], [0, 24], [-6, 10], [-8, -12]], true, 0.6); fillStroke(ctx, lg(ctx, 0, -26, 0, 24, [[0, shade(col, 0.5)], [1, shade(col, -0.3)]]), LINE, 1.2);
      ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 1.2; line(ctx, 0, -24, 0, 28); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'bone': {
      ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.7);
      roundRect(ctx, -18, -4, 36, 8, 4); fillStroke(ctx, '#ece2c8', LINE, 1.2);
      for (const s of [-1, 1]) for (const t of [-1, 1]) { ellipse(ctx, s * 19, t * 4, 5, 5); fillStroke(ctx, '#ece2c8', LINE, 1.2); }
      ctx.restore();
      break;
    }
    case 'coin': {
      for (const [x, y] of [[24, 42], [40, 44], [32, 30]]) { ellipse(ctx, x, y, 11, 11); fillStroke(ctx, metal(ctx, x + 10, y - 10, x - 10, y + 10, '#e8b84a'), LINE, 1.2); ctx.strokeStyle = 'rgba(120,70,10,0.7)'; ctx.lineWidth = 1; ellipse(ctx, x, y, 7, 7); ctx.stroke(); }
      break;
    }
    case 'thread': {
      roundRect(ctx, 18, 12, 28, 40, 3); fillStroke(ctx, '#8a6038', LINE, 1.2);
      roundRect(ctx, 20, 18, 24, 28, 6); fillStroke(ctx, lg(ctx, 20, 0, 44, 0, [[0, shade(col, -0.3)], [0.5, shade(col, 0.4)], [1, shade(col, -0.3)]]), LINE, 1);
      ctx.strokeStyle = rgba(shade(col, -0.5), 0.6); ctx.lineWidth = 0.7; for (let y = 20; y < 46; y += 2.5) { line(ctx, 21, y, 43, y + 1); ctx.stroke(); }
      break;
    }
    case 'orb': default: {
      glow(ctx, 32, 32, 26, col, 0.45);
      ellipse(ctx, 32, 32, 16, 16); fillStroke(ctx, rg(ctx, 26, 26, 1, 18, [[0, '#ffffff'], [0.3, shade(col, 0.4)], [0.8, col], [1, shade(col, -0.5)]]), LINE, 1.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(32, 32, 11, 3.6, 4.6); ctx.stroke();
    }
  }
}

/** ルーン石（字は ID から作る） */
export function drawRuneStone(ctx, x, y, r, col, seed) {
  const rr = rng(`rune:${seed}`);
  poly(ctx, [[x - r * 0.7, y - r], [x + r * 0.6, y - r * 1.05], [x + r * 0.85, y + r * 0.2], [x + r * 0.55, y + r], [x - r * 0.6, y + r * 0.95], [x - r * 0.85, y]]);
  fillStroke(ctx, lg(ctx, x, y - r, x, y + r, [[0, '#8a8490'], [0.5, '#5a5460'], [1, '#2e2a34']]), LINE, 1.4);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; poly(ctx, [[x - r * 0.7, y - r], [x + r * 0.6, y - r * 1.05], [x + r * 0.5, y - r * 0.8], [x - r * 0.55, y - r * 0.75]]); ctx.fill();
  // 字
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push([x + (rr() - 0.5) * r * 0.9, y + (rr() - 0.5) * r * 1.2]);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, r * 1.1, col, 0.35);
  ctx.strokeStyle = shade(col, 0.4); ctx.lineWidth = r * 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y + r * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(x, y + (rr() - 0.5) * r * 0.6); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
  if (rr() < 0.6) { ctx.beginPath(); ctx.moveTo(x, y - r * 0.2); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke(); }
  ctx.restore();
}

// ---------------- 宝石・ルーン（データが無くても ID とパラメータで描く）
const GEM_COLORS = [
  [/ruby|red|fire|blood|紅|赤|炎|血/, '#e8203a'], [/sapphire|blue|cold|ice|蒼|青|氷/, '#2a7aff'], [/emerald|green|poison|翠|緑|毒/, '#1ec860'],
  [/topaz|yellow|lightning|amber|黄|雷|琥珀/, '#ffc820'], [/amethyst|purple|void|紫|虚/, '#a040ff'], [/diamond|white|holy|金剛|白|聖|光/, '#e8f4ff'], [/onyx|black|skull|shadow|黒|闇|髑髏/, '#3a3448'],
];
function gemColor(id, p) {
  if (p.color) return p.color;
  for (const [re, c] of GEM_COLORS) if (re.test(id)) return c;
  return hue('#e8203a', hash(id) % 360);
}
export function paintGemIcon(ctx, spec, w, h) {
  const p = spec.params || {};
  const id = spec.id.slice('icon.gem.'.length);
  const col = gemColor(`${id} ${p.kind || ''} ${p.name || ''}`, p);
  const m = String(id).match(/(\d+)(?!.*\d)/);
  const tier = Math.max(1, Math.min(10, p.tier || (m ? Number(m[1]) : 1)));
  const legendary = p.legendary || /legend|abyss|深淵|伝説/.test(`${id} ${p.name || ''}`);
  shadowed(ctx, w, h, (c) => {
    c.save(); c.scale(w / 64, h / 64);
    if (legendary) {
      glow(c, 32, 32, 30, col, 0.5);
      c.strokeStyle = metal(c, 8, 8, 56, 56, TRIM); c.lineWidth = 4; c.beginPath(); c.arc(32, 32, 22, 0, TAU); c.stroke();
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; poly(c, [[32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18], [32 + Math.cos(a + 0.2) * 28, 32 + Math.sin(a + 0.2) * 28], [32 + Math.cos(a - 0.2) * 28, 32 + Math.sin(a - 0.2) * 28]]); fillStroke(c, TRIM, LINE, 1); }
      gem(c, 32, 32, 15, col, 8);
    } else {
      const facets = tier <= 3 ? 5 : tier <= 6 ? 6 : 8;
      const r = 11 + tier * 0.9;
      if (tier >= 7) glow(c, 32, 32, r * 2, col, 0.18 + tier * 0.04);
      if (tier <= 3) {
        // 原石
        const rr = rng(id);
        const pts = []; for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const d = r * (0.75 + rr() * 0.35); pts.push([32 + Math.cos(a) * d, 32 + Math.sin(a) * d]); }
        poly(c, pts); fillStroke(c, rg(c, 28, 26, 1, r * 1.3, [[0, shade(col, 0.5)], [0.6, col], [1, shade(col, -0.55)]]), LINE, 1.3);
        c.fillStyle = 'rgba(255,255,255,0.5)'; ellipse(c, 27, 26, 3, 1.6, -0.5); c.fill();
      } else gem(c, 32, 32, r, col, facets, tier >= 9 ? 'tall' : 'round');
      if (tier >= 10) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = '#fff'; star(c, 44, 18, 4, 7, 1.2); c.fill(); star(c, 20, 46, 4, 4, 0.8); c.fill(); c.restore(); }
      // 段の印
      for (let i = 0; i < Math.min(5, Math.ceil(tier / 2)); i++) { c.fillStyle = tier >= 9 ? '#ffe080' : '#e8e2d0'; ellipse(c, 32 - (Math.min(5, Math.ceil(tier / 2)) - 1) * 3 + i * 6, 59, 1.6, 1.6); c.fill(); }
    }
    c.restore();
  });
}
export function paintRuneIcon(ctx, spec, w, h) {
  const p = spec.params || {};
  const id = spec.id.slice('icon.rune.'.length);
  const col = p.color || hue('#ff9a2e', hash(id) % 360);
  shadowed(ctx, w, h, (c) => { c.save(); c.scale(w / 64, h / 64); drawRuneStone(c, 32, 33, 23, col, id); c.restore(); });
}

// ---------------- スキル
const BEH_GLYPH = {
  melee: 'slash', projectile: 'proj', nova: 'nova', rain: 'rain', chain: 'chain', summon: 'summon', buff: 'buff', leap: 'leap', dash: 'dash', beam: 'beam',
  whirl: 'whirl', aura: 'aura', trap: 'trap', totem: 'totem', turret: 'totem', meteor: 'meteor', orbit: 'orbit', wall: 'wave', wave: 'wave', curse: 'curse', barrier: 'shield', shield: 'shield', dot: 'cloud', cloud: 'cloud', clone: 'clone', teleport: 'dash', blink: 'dash', charge: 'dash',
};
export function paintSkillIcon(ctx, spec, w, h) {
  const p = spec.params || {};
  const id = p.skill || spec.id.slice('icon.skill.'.length);
  const def = SKILL[id] || {};
  const el = p.el || def.element || 'phys';
  const col = ELEMENT_COLORS[el] || '#e8e2d0';
  const cls = CLASS[def.cls];
  const frame = cls?.color || '#8a7a6a';
  const ult = !!(def.ult || def.ultimate || def.kind === 'ult' || (def.tags || []).some((t) => t === 'ult' || t === 'ultimate') || /(^|_)ult($|_)/.test(id));
  let glyph = BEH_GLYPH[def.behavior] || (def.basic ? 'slash' : 'proj');
  if (glyph === 'proj') glyph = def.cls === 'ranger' ? 'arrow' : def.cls === 'necromancer' && el === 'phys' ? 'bone' : def.cls === 'assassin' ? 'blades' : 'orb';
  if (glyph === 'slash' && def.cls === 'assassin') glyph = 'stab';
  if (glyph === 'nova' && (def.tags || []).includes('attack')) glyph = def.cls === 'assassin' ? 'fan' : 'whirl';
  if (glyph === 'arrow' && (def.count || 1) > 1) glyph = 'arrows';
  if (ult) glyph = 'ult';
  const r = rng(id);
  ctx.save(); ctx.scale(w / 96, h / 96);
  // 地
  roundRect(ctx, 4, 4, 88, 88, 14);
  ctx.fillStyle = rg(ctx, 48, 40, 4, 70, [[0, shade(col, -0.2)], [0.45, shade(mix(col, frame, 0.35), -0.6)], [1, '#0a080e']]); ctx.fill();
  ctx.save(); roundRect(ctx, 4, 4, 88, 88, 14); ctx.clip();
  // 地の模様
  ctx.globalAlpha = 0.18; ctx.strokeStyle = col; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(48, 48, 12 + i * 9, r() * TAU, r() * TAU + 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(48, 48); ctx.rotate((r() - 0.5) * 0.3); ctx.translate(-48, -48);
  drawGlyph(ctx, glyph, col, el, r, def);
  ctx.restore();
  // 上のつや
  ctx.fillStyle = lg(ctx, 0, 4, 0, 46, [[0, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(4, 4, 88, 40);
  ctx.restore();
  // 枠
  roundRect(ctx, 4, 4, 88, 88, 14); ctx.lineWidth = 4; ctx.strokeStyle = LINE; ctx.stroke();
  roundRect(ctx, 6, 6, 84, 84, 12); ctx.lineWidth = 2; ctx.strokeStyle = ult ? metal(ctx, 6, 6, 90, 90, '#e8c060') : lg(ctx, 0, 6, 0, 90, [[0, shade(frame, 0.4)], [1, shade(frame, -0.4)]]); ctx.stroke();
  if (ult) { for (const [x, y] of [[8, 8], [88, 8], [8, 88], [88, 88]]) { ctx.fillStyle = '#ffe080'; star(ctx, x, y, 4, 5, 1.5); ctx.fill(); } }
  if (def.basic) { ctx.fillStyle = rgba(frame, 0.9); poly(ctx, [[70, 88], [88, 88], [88, 70]]); ctx.fill(); }
  ctx.restore();
}

function drawGlyph(ctx, g, col, el, r, def) {
  const hi = shade(col, 0.55);
  const add = () => { ctx.globalCompositeOperation = 'lighter'; };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  glow(ctx, 48, 48, 40, col, 0.35);
  switch (g) {
    case 'slash': {
      add(); ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(30, 70, 46, -1.45, -0.1); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(30, 70, 46, -1.35, -0.2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(40, 58); ctx.rotate(0.7); ctx.scale(0.45, 0.45); drawWeapon(ctx, def.cls === 'warrior' ? 'sword' : 'sword', 0, 30, BASE_PAL); ctx.restore();
      break;
    }
    case 'stab': {
      ctx.save(); ctx.translate(36, 62); ctx.rotate(0.9); ctx.scale(0.55, 0.55); drawWeapon(ctx, 'dagger', 0, 20, BASE_PAL); ctx.restore();
      ctx.save(); ctx.translate(58, 64); ctx.rotate(0.3); ctx.scale(0.5, 0.5); drawWeapon(ctx, 'dagger', 0, 20, BASE_PAL); ctx.restore();
      add(); ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { line(ctx, 54 + i * 6, 26 + i * 4, 76 + i * 4, 18 + i * 6); ctx.stroke(); }
      break;
    }
    case 'arrow': case 'bone': case 'blades': case 'orb': case 'proj': {
      add();
      ctx.fillStyle = lg(ctx, 14, 78, 70, 26, [[0, rgba(col, 0)], [1, rgba(col, 0.85)]]);
      ctx.beginPath(); ctx.moveTo(14, 82); ctx.lineTo(64, 24); ctx.lineTo(74, 34); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(66, 30); ctx.rotate(-0.85);
      if (g === 'arrow') { ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 3; line(ctx, -44, 0, 0, 0); ctx.stroke(); poly(ctx, [[10, 0], [-2, -6], [-2, 6]]); fillStroke(ctx, '#dfe4ea', LINE, 1.2); poly(ctx, [[-44, 0], [-52, -7], [-40, -2]]); fillStroke(ctx, '#e8e2d0', LINE, 1); poly(ctx, [[-44, 0], [-52, 7], [-40, 2]]); fillStroke(ctx, '#e8e2d0', LINE, 1); }
      else if (g === 'bone') { taper(ctx, [[-40, 0], [-10, 0], [10, 0]], 7, 1); fillStroke(ctx, lg(ctx, 0, -5, 0, 5, [[0, '#fff8e8'], [1, '#b0a080']]), LINE, 1.3); ellipse(ctx, -42, 0, 5, 6); fillStroke(ctx, '#e8dcc0', LINE, 1.2); }
      else if (g === 'blades') { for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(-i * 14, (i - 1) * 10); ctx.rotate(Math.PI / 2); ctx.scale(0.35, 0.35); drawWeapon(ctx, 'dagger', 0, 20, BASE_PAL); ctx.restore(); } }
      else { add(); glow(ctx, 0, 0, 22, col, 0.9, '#ffffff'); ctx.fillStyle = '#fff'; ellipse(ctx, 0, 0, 7, 7); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'arrows': {
      add(); for (let i = -1; i <= 1; i++) { ctx.fillStyle = lg(ctx, 20, 76, 70, 30, [[0, rgba(col, 0)], [1, rgba(col, 0.7)]]); ctx.beginPath(); ctx.moveTo(18, 80); ctx.lineTo(66 + i * 14, 26 - i * 8); ctx.lineTo(72 + i * 14, 32 - i * 8); ctx.closePath(); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = -1; i <= 1; i++) { ctx.save(); ctx.translate(18, 80); ctx.rotate(-0.85 + i * 0.32); ctx.translate(62, 0); ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 3; line(ctx, -40, 0, 0, 0); ctx.stroke(); poly(ctx, [[9, 0], [-2, -5], [-2, 5]]); fillStroke(ctx, '#dfe4ea', LINE, 1.1); poly(ctx, [[-40, 0], [-47, -6], [-36, -2]]); fillStroke(ctx, '#e8e2d0', LINE, 0.9); ctx.restore(); }
      break;
    }
    case 'fan': {
      add(); ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(48, 52, 30, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.save(); ctx.translate(48 + Math.cos(a) * 22, 52 + Math.sin(a) * 22); ctx.rotate(a + Math.PI / 2); ctx.scale(0.3, 0.3); drawWeapon(ctx, 'dagger', 0, 20, BASE_PAL); ctx.restore(); }
      add(); glow(ctx, 48, 52, 12, col, 0.8, '#ffffff');
      break;
    }
    case 'nova': case 'aura': {
      add();
      for (let i = 0; i < (g === 'aura' ? 3 : 2); i++) { ctx.strokeStyle = rgba(i ? col : hi, 0.85 - i * 0.2); ctx.lineWidth = 7 - i * 2; ctx.beginPath(); ctx.arc(48, 50, 16 + i * 12, 0, TAU); ctx.stroke(); }
      if (g === 'nova') for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.strokeStyle = rgba(hi, 0.8); ctx.lineWidth = 2.5; line(ctx, 48 + Math.cos(a) * 30, 50 + Math.sin(a) * 30, 48 + Math.cos(a) * 42, 50 + Math.sin(a) * 42); ctx.stroke(); }
      glow(ctx, 48, 50, 18, '#ffffff', 0.7);
      break;
    }
    case 'rain': case 'meteor': {
      add();
      for (let i = 0; i < (g === 'meteor' ? 1 : 5); i++) {
        const x = g === 'meteor' ? 56 : 22 + i * 13; const y = g === 'meteor' ? 44 : 24 + (i % 2) * 14;
        const s = g === 'meteor' ? 2.4 : 1;
        ctx.fillStyle = lg(ctx, x + 14 * s, y - 20 * s, x, y, [[0, rgba(col, 0)], [1, rgba(col, 0.9)]]);
        ctx.beginPath(); ctx.moveTo(x - 3 * s, y); ctx.lineTo(x + 16 * s, y - 22 * s); ctx.lineTo(x + 3 * s, y + 2 * s); ctx.closePath(); ctx.fill();
        glow(ctx, x, y, 8 * s, col, 0.9, '#ffffff');
      }
      ctx.globalCompositeOperation = 'source-over';
      if (g === 'meteor') { ellipse(ctx, 50, 52, 12, 11); fillStroke(ctx, rg(ctx, 46, 48, 1, 13, [[0, '#ffe0a0'], [0.4, '#a04a20'], [1, '#2a1008']]), LINE, 1.4); }
      ctx.fillStyle = rgba(col, 0.35); ellipse(ctx, 48, 80, 32, 7); ctx.fill();
      break;
    }
    case 'chain': {
      add(); ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 8;
      const pts = [[16, 24], [40, 40], [30, 56], [62, 62], [52, 78], [82, 74]];
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6; ctx.stroke();
      for (const p of [pts[0], pts[3], pts[5]]) glow(ctx, p[0], p[1], 9, col, 0.9, '#ffffff');
      break;
    }
    case 'summon': {
      add(); ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(48, 74, 32, 9, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; star(ctx, 48 + Math.cos(a) * 26, 74 + Math.sin(a) * 7, 4, 3, 1); ctx.fillStyle = col; ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      blob(ctx, [[48, 22], [60, 28], [62, 42], [56, 52], [40, 52], [34, 42], [36, 28]], true, 0.6); fillStroke(ctx, lg(ctx, 0, 22, 0, 52, [[0, '#f4ecd8'], [1, '#a89c80']]), LINE, 1.6);
      ctx.fillStyle = '#140c18'; ellipse(ctx, 42, 38, 4, 5); ctx.fill(); ellipse(ctx, 54, 38, 4, 5); ctx.fill();
      ctx.save(); add(); glow(ctx, 42, 38, 5, col, 0.9); glow(ctx, 54, 38, 5, col, 0.9); ctx.restore();
      ctx.fillStyle = '#140c18'; poly(ctx, [[48, 44], [50, 48], [46, 48]]); ctx.fill();
      ctx.strokeStyle = '#6a604e'; ctx.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { line(ctx, 48 + i * 3, 50, 48 + i * 3, 55); ctx.stroke(); }
      break;
    }
    case 'buff': case 'shield': {
      if (g === 'shield') { ctx.save(); ctx.translate(48, 50); ctx.scale(0.8, 0.8); drawOffhand(ctx, 'shield', 0, 0, { ...BASE_PAL, cloth: shade(col, -0.4) }); ctx.restore(); add(); ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(48, 50, 40, 0, TAU); ctx.stroke(); }
      else { add(); for (let i = 0; i < 3; i++) { const y = 66 - i * 18; ctx.strokeStyle = rgba(i === 2 ? '#ffffff' : col, 0.9); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(24, y + 10); ctx.lineTo(48, y - 6); ctx.lineTo(72, y + 10); ctx.stroke(); } }
      break;
    }
    case 'leap': {
      add(); ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 4; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(14, 76); ctx.quadraticCurveTo(40, 4, 70, 70); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 7) * Math.PI; ctx.strokeStyle = rgba(hi, 0.9); ctx.lineWidth = 3; line(ctx, 70 + Math.cos(a) * 8, 76 + Math.sin(a) * 8, 70 + Math.cos(a) * 20, 76 + Math.sin(a) * 18); ctx.stroke(); }
      glow(ctx, 70, 76, 16, col, 0.9, '#ffffff');
      break;
    }
    case 'dash': {
      add(); for (let i = 0; i < 5; i++) { ctx.strokeStyle = rgba(col, 0.9 - i * 0.12); ctx.lineWidth = 4; line(ctx, 14 + i * 4, 30 + i * 9, 54 + i * 3, 30 + i * 9); ctx.stroke(); }
      ctx.fillStyle = hi; poly(ctx, [[60, 24], [84, 48], [60, 72], [66, 48]]); ctx.fill();
      break;
    }
    case 'beam': {
      add(); ctx.fillStyle = lg(ctx, 0, 40, 0, 56, [[0, rgba(col, 0)], [0.5, rgba(col, 0.95)], [1, rgba(col, 0)]]); ctx.fillRect(10, 36, 80, 24);
      ctx.fillStyle = '#fff'; ctx.fillRect(10, 45, 80, 6); glow(ctx, 18, 48, 16, col, 0.9, '#ffffff');
      break;
    }
    case 'whirl': {
      add(); for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(i ? col : hi, 0.85); ctx.lineWidth = 6 - i; ctx.beginPath(); ctx.arc(48, 48, 14 + i * 10, i * 2, i * 2 + 4.2); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(48, 48); ctx.rotate(-0.6); ctx.scale(0.4, 0.4); drawWeapon(ctx, 'sword', 0, 40, BASE_PAL); ctx.restore();
      break;
    }
    case 'trap': {
      ctx.fillStyle = rgba(col, 0.3); ellipse(ctx, 48, 66, 34, 12); ctx.fill();
      ctx.strokeStyle = metal(ctx, 14, 40, 82, 80, '#a0a8b4'); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(48, 62, 26, Math.PI, TAU); ctx.stroke();
      for (let i = 0; i < 7; i++) { const x = 26 + i * 7.3; poly(ctx, [[x - 3, 58], [x, 44 + Math.abs(i - 3) * 2], [x + 3, 58]]); fillStroke(ctx, '#d8dde6', LINE, 1); }
      roundRect(ctx, 18, 60, 60, 8, 3); fillStroke(ctx, '#5a5460', LINE, 1.2);
      add(); glow(ctx, 48, 64, 12, col, 0.8);
      break;
    }
    case 'totem': {
      roundRect(ctx, 38, 22, 20, 60, 4); fillStroke(ctx, lg(ctx, 38, 0, 58, 0, [[0, '#4a3020'], [0.5, '#8a6038'], [1, '#3a2010']]), LINE, 1.6);
      for (const y of [30, 50]) { ctx.fillStyle = '#1a0c08'; ellipse(ctx, 44, y, 2.6, 2); ctx.fill(); ellipse(ctx, 52, y, 2.6, 2); ctx.fill(); line(ctx, 43, y + 7, 53, y + 7); ctx.strokeStyle = '#1a0c08'; ctx.lineWidth = 2; ctx.stroke(); }
      add(); glow(ctx, 48, 20, 14, col, 0.9, '#ffffff');
      break;
    }
    case 'orbit': {
      add(); ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(48, 48, 34, 14, -0.3, 0, TAU); ctx.stroke();
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; glow(ctx, 48 + Math.cos(a) * 34 * 0.95, 48 + Math.sin(a) * 12 - Math.cos(a) * 8, 10, col, 0.95, '#ffffff'); }
      glow(ctx, 48, 48, 12, '#ffffff', 0.5);
      break;
    }
    case 'wave': {
      add(); for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(i ? col : hi, 0.9 - i * 0.2); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(14, 60 - i * 14); ctx.bezierCurveTo(30, 40 - i * 14, 46, 80 - i * 14, 62, 56 - i * 14); ctx.quadraticCurveTo(72, 42 - i * 14, 84, 52 - i * 14); ctx.stroke(); }
      break;
    }
    case 'curse': {
      add(); ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(48, 48, 32, 0, TAU); ctx.stroke(); star(ctx, 48, 48, 5, 30, 12); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ellipse(ctx, 48, 48, 16, 9); fillStroke(ctx, '#f0e8d8', LINE, 1.6);
      ellipse(ctx, 48, 48, 7, 8); ctx.fillStyle = shade(col, -0.3); ctx.fill(); ellipse(ctx, 48, 48, 2, 6); ctx.fillStyle = '#0a060e'; ctx.fill();
      break;
    }
    case 'cloud': {
      add(); for (let i = 0; i < 6; i++) { glow(ctx, 26 + r() * 44, 38 + r() * 30, 14 + r() * 8, col, 0.55); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba(shade(col, -0.2), 0.85); for (const [x, y, s] of [[34, 54, 13], [52, 46, 16], [66, 56, 12], [48, 62, 14]]) { ellipse(ctx, x, y, s, s * 0.8); ctx.fill(); }
      ctx.fillStyle = '#0a060e'; ellipse(ctx, 44, 54, 3, 3.6); ctx.fill(); ellipse(ctx, 56, 54, 3, 3.6); ctx.fill();
      break;
    }
    case 'clone': {
      for (let i = 1; i >= 0; i--) { ctx.save(); ctx.globalAlpha = i ? 0.45 : 1; ctx.translate(i * 16, 0); blob(ctx, [[40, 18], [50, 20], [52, 34], [58, 50], [56, 82], [30, 82], [28, 50], [34, 34]], true, 0.5); fillStroke(ctx, i ? rgba(col, 0.7) : '#1a1422', LINE, 1.4); ctx.fillStyle = col; ellipse(ctx, 46, 28, 2.2, 1.4); ctx.fill(); ctx.restore(); }
      break;
    }
    case 'ult': default: {
      add(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; ctx.strokeStyle = rgba(i % 2 ? col : '#ffffff', 0.85); ctx.lineWidth = i % 2 ? 3 : 2; line(ctx, 48 + Math.cos(a) * 12, 48 + Math.sin(a) * 12, 48 + Math.cos(a) * (i % 2 ? 42 : 34), 48 + Math.sin(a) * (i % 2 ? 42 : 34)); ctx.stroke(); }
      glow(ctx, 48, 48, 26, col, 1, '#ffffff');
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(48, 48); emblem(ctx, def.cls || 'warrior', 14, '#fff6d0'); ctx.restore();
    }
  }
  ctx.restore();
  void el;
}

// ---------------- 知らないアイコン（紋章）
export function paintGenericIcon(ctx, spec, w, h) {
  const id = spec.id;
  const p = spec.params || {};
  const col = p.color || hue('#d8a040', hash(id) % 360);
  const r = rng(id);
  shadowed(ctx, w, h, (c) => {
    c.save(); c.scale(w / 64, h / 64);
    const n = 5 + Math.floor(r() * 4);
    poly(c, Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i / n) * TAU; return [32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26]; }));
    fillStroke(c, rg(c, 26, 22, 2, 34, [[0, shade(col, 0.4)], [0.6, shade(col, -0.25)], [1, shade(col, -0.65)]]), LINE, 1.5);
    c.strokeStyle = rgba(shade(col, 0.6), 0.8); c.lineWidth = 1.4; c.beginPath(); c.arc(32, 32, 14, 0, TAU); c.stroke();
    c.fillStyle = luma(col) > 0.6 ? '#2a1a10' : '#fff4d8'; star(c, 32, 32, 3 + Math.floor(r() * 4), 10, 4, r() * TAU); c.fill();
    c.restore();
  });
}
