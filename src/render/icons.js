// アイテム／スキルアイコン（中心(x,y)、size 四方）。オフスクリーンにキャッシュして drawImage。
import { shade, rgba, rr, starPath, makeCanvas, hashStr, OUTLINE } from './util.js';
import { drawWeapon, itemColors, codeStyle } from './character.js';
import { drawPet, PET_FLYING } from './pets.js';
import { spriteRev } from './sprites.js';

const PI = Math.PI;
const cache = new Map();
const BASE = 48; // 内部描画サイズ（48x48 の座標系で描いて縮尺）

function fs(ctx, col, lw = 2.4) { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }

function getCached(key, size, painter) {
  const px = Math.max(8, Math.round(size * (typeof devicePixelRatio === 'number' ? Math.min(2, devicePixelRatio) : 1)));
  const k = key + '@' + px;
  let c = cache.get(k);
  if (!c) {
    c = makeCanvas(px, px);
    const g = c.getContext('2d');
    g.scale(px / BASE, px / BASE);
    g.lineJoin = 'round'; g.lineCap = 'round';
    try { painter(g); } catch (e) { console.warn('[icons] paint failed', key, e); }
    if (cache.size > 600) cache.clear();
    cache.set(k, c);
  }
  return c;
}

export function drawItemIcon(ctx, item, x, y, size = 32) {
  if (!item) return;
  const look = item.look;
  const key = 'i:' + (look ? `${item.slot}|${look.style}|${look.color}|${look.accent}` : `${item.icon || item.type || 'etc'}|${item.id}`);
  const petKey = look && (item.slot === 'pet' || /Pet$/.test(look.style || '')) ? '|spr' + spriteRev() : ''; // PET は差し替えスプライトの読込/切替で描き直す
  const c = getCached(key + petKey, size, (g) => paintItem(g, item));
  ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
}

export function drawSkillIcon(ctx, skill, x, y, size = 32) {
  if (!skill) return;
  const key = 's:' + skill.id + '|' + skill.kind + '|' + skill.color;
  const c = getCached(key, size, (g) => paintSkill(g, skill));
  ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
}

// ---------------------------------------------------------------- アイテム
function paintItem(g, item) {
  const look = item.look;
  if (look && (item.slot === 'pet' || (look.style && /Pet$/.test(look.style)))) return paintPet(g, look);
  if (look && look.style) {
    const [c, a] = itemColors(look);
    const st = codeStyle(look.style);   // 絵の無い新しいスタイルは近い既存のスタイルで
    switch (item.slot) {
      case 'weapon': return paintWeapon(g, st, c, a);
      case 'hat': return paintHat(g, st, c, a);
      case 'top': return paintTop(g, st, c, a);
      case 'bottom': return paintBottom(g, st, c, a);
      case 'shoes': return paintShoes(g, st, c, a);
      case 'accessory': return paintAcc(g, st, c, a);
      default: // slot 不明: スタイルから推測
        if (WEAPONS.has(st)) return paintWeapon(g, st, c, a);
        return paintAcc(g, st, c, a);
    }
  }
  paintConsumable(g, item.icon || (item.type === 'etc' ? 'etc' : 'potionRed'), item);
}
// PET: 虹色リング＋縮小した drawPet
function paintPet(g, look) {
  const grd = g.createLinearGradient(4, 4, 44, 44);
  grd.addColorStop(0, '#ff4fa0'); grd.addColorStop(0.35, '#ffd23f'); grd.addColorStop(0.65, '#3ee6d2'); grd.addColorStop(1, '#b45cff');
  g.beginPath(); g.arc(24, 24, 21, 0, PI * 2); g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
  g.strokeStyle = grd; g.lineWidth = 2.6; g.stroke();
  const fly = PET_FLYING[look.style];
  drawPet(g, 24, fly ? 50 : 42, look, { t: 0.4, state: 'idle', scale: fly ? 0.95 : 0.95, noShadow: true, facing: 1 });
  g.fillStyle = '#ffffff';
  g.beginPath(); starPath(g, 39, 10, 4.5, 1.6, 4); g.fill();
}
const WEAPONS = new Set(['bat', 'knife', 'katana', 'pistol', 'smg', 'guitar', 'neonSword', 'staff']);

function paintWeapon(g, st, c, a) {
  const len = { bat: 30, knife: 19, katana: 43, guitar: 40, neonSword: 42, staff: 42, pistol: 15, smg: 26 }[st] || 30;
  const left = { bat: 5, knife: 4, katana: 8, guitar: 11, neonSword: 7, staff: 12, pistol: 3, smg: 8 }[st] || 5;
  g.save();
  if (st === 'pistol' || st === 'smg') {
    const s = st === 'pistol' ? 2.3 : 1.6;
    g.translate(24 - (len / 2 - left) * s * 0.9, 24 + (st === 'pistol' ? -1 : 0)); g.scale(s, s);
    drawWeapon(g, st, c, a, 0, null);
  } else {
    const diag = 44;
    const s = diag / (len + left);
    g.translate(24, 24); g.rotate(-PI / 4); g.scale(s, s);
    g.translate(-(len + left) / 2 + left, 0);
    drawWeapon(g, st, c, a, 0, null);
  }
  g.restore();
}

function paintHat(g, st, c, a) {
  g.save(); g.translate(24, 30);
  switch (st) {
    case 'cap':
      g.beginPath(); g.moveTo(-15, 2); g.bezierCurveTo(-16, -20, 14, -20, 14, 2); g.closePath(); fs(g, c);
      g.beginPath(); g.moveTo(8, -1); g.quadraticCurveTo(22, -2, 22, 4); g.quadraticCurveTo(14, 5, 6, 3); g.closePath(); fs(g, a, 2);
      g.beginPath(); g.arc(-1, -7, 4, 0, PI * 2); fs(g, a, 1.6);
      break;
    case 'beanie':
      g.beginPath(); g.moveTo(-15, 4); g.bezierCurveTo(-16, -22, 16, -22, 15, 4); g.closePath(); fs(g, c);
      g.beginPath(); rr(g, -16, -2, 32, 8, 3); fs(g, shade(c, -0.15), 2);
      g.strokeStyle = shade(c, -0.35); g.lineWidth = 1; g.beginPath(); for (let x = -13; x <= 13; x += 3.5) { g.moveTo(x, -1); g.lineTo(x, 5); } g.stroke();
      g.beginPath(); g.arc(0, -19, 5, 0, PI * 2); fs(g, a, 2);
      break;
    case 'bandana':
      g.beginPath(); g.moveTo(-16, 0); g.bezierCurveTo(-16, -20, 16, -20, 16, 0); g.quadraticCurveTo(0, -4, -16, 0); g.closePath(); fs(g, c);
      g.fillStyle = a; for (const [dx, dy] of [[-8, -8], [0, -12], [8, -8], [-3, -4], [5, -4]]) { g.beginPath(); g.arc(dx, dy, 1.4, 0, PI * 2); g.fill(); }
      g.beginPath(); g.moveTo(14, -2); g.lineTo(22, 6); g.lineTo(16, 7); g.closePath(); fs(g, c, 2);
      break;
    case 'headphones':
      g.strokeStyle = OUTLINE; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 15, PI * 1.05, PI * 1.95); g.stroke();
      g.strokeStyle = c; g.lineWidth = 3.6; g.stroke();
      for (const sx of [-16, 16]) { g.beginPath(); rr(g, sx - 5, -6, 10, 14, 4); fs(g, c, 2); g.beginPath(); rr(g, sx - 3, -3, 6, 8, 2); g.fillStyle = a; g.fill(); }
      break;
    case 'crown':
      g.beginPath(); g.moveTo(-15, 4); g.lineTo(-17, -14); g.lineTo(-8, -5); g.lineTo(0, -19); g.lineTo(8, -5); g.lineTo(17, -14); g.lineTo(15, 4); g.closePath(); fs(g, c);
      g.fillStyle = a; g.beginPath(); g.arc(0, -3, 3, 0, PI * 2); g.arc(-9, -1, 2, 0, PI * 2); g.arc(9, -1, 2, 0, PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -19, 2, 0, PI * 2); g.arc(-17, -14, 1.6, 0, PI * 2); g.arc(17, -14, 1.6, 0, PI * 2); g.fill();
      break;
    case 'helmet':
      g.beginPath(); g.moveTo(-17, 6); g.bezierCurveTo(-18, -24, 18, -24, 17, 2); g.lineTo(-17, 6); g.closePath(); fs(g, c);
      g.beginPath(); g.moveTo(-6, -6); g.quadraticCurveTo(6, -10, 18, -6); g.lineTo(18, 0); g.quadraticCurveTo(6, -3, -6, -1); g.closePath(); fs(g, rgba(a, 0.9), 1.8);
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2.4; g.beginPath(); g.arc(0, -2, 12, -2.6, -1.8); g.stroke();
      break;
    case 'cowboy':
      g.beginPath(); g.ellipse(0, 2, 22, 5.5, 0, 0, PI * 2); fs(g, shade(c, -0.08));
      g.beginPath(); g.moveTo(-10, 1); g.bezierCurveTo(-12, -18, -5, -20, 0, -15); g.bezierCurveTo(5, -20, 12, -18, 10, 1); g.closePath(); fs(g, c);
      g.fillStyle = a; g.fillRect(-10.5, -4, 21, 3.6);
      break;
    case 'catEars':
      g.strokeStyle = OUTLINE; g.lineWidth = 6; g.beginPath(); g.arc(0, 10, 17, PI * 1.1, PI * 1.9); g.stroke();
      g.strokeStyle = c; g.lineWidth = 3; g.stroke();
      for (const [ex, r] of [[-10, -0.35], [10, 0.35]]) {
        g.save(); g.translate(ex, -4); g.rotate(r);
        g.beginPath(); g.moveTo(-7, 4); g.lineTo(0, -12); g.lineTo(7, 4); g.closePath(); fs(g, c, 2);
        g.beginPath(); g.moveTo(-3.6, 2); g.lineTo(0, -6); g.lineTo(3.6, 2); g.closePath(); g.fillStyle = a; g.fill();
        g.restore();
      }
      break;
    default:
      g.beginPath(); g.arc(0, -6, 14, PI, 0); g.closePath(); fs(g, c);
  }
  g.restore();
}

function shirtPath(g, sleeves, len = 16) {
  g.beginPath();
  g.moveTo(-6, -16); g.quadraticCurveTo(0, -12, 6, -16);
  if (sleeves === 'long') { g.lineTo(14, -12); g.lineTo(19, 10); g.lineTo(13, 11); g.lineTo(10, -2); }
  else if (sleeves === 'short') { g.lineTo(14, -12); g.lineTo(19, -3); g.lineTo(12, 0); g.lineTo(11, -4); }
  else { g.lineTo(9, -16); g.quadraticCurveTo(9, -8, 11, -5); }
  g.lineTo(11, len); g.lineTo(-11, len);
  if (sleeves === 'long') { g.lineTo(-10, -2); g.lineTo(-13, 11); g.lineTo(-19, 10); g.lineTo(-14, -12); }
  else if (sleeves === 'short') { g.lineTo(-11, -4); g.lineTo(-12, 0); g.lineTo(-19, -3); g.lineTo(-14, -12); }
  else { g.lineTo(-11, -5); g.quadraticCurveTo(-9, -8, -9, -16); }
  g.closePath();
}

function paintTop(g, st, c, a) {
  g.save(); g.translate(24, 25);
  const sl = { tshirt: 'short', hoodie: 'long', leatherJacket: 'long', suit: 'long', hawaiian: 'short', tank: 'none', police: 'short', tracksuit: 'long', idolDress: 'short', armorVest: 'none' }[st] || 'short';
  if (st === 'idolDress') {
    g.beginPath(); g.moveTo(-9, -2); g.lineTo(9, -2); g.lineTo(18, 18); g.quadraticCurveTo(0, 22, -18, 18); g.closePath(); fs(g, c);
    g.strokeStyle = a; g.lineWidth = 2; g.beginPath(); g.moveTo(-16, 16); g.quadraticCurveTo(0, 20, 16, 16); g.stroke();
    g.beginPath(); g.moveTo(-8, -17); g.quadraticCurveTo(0, -12, 8, -17); g.lineTo(9, -2); g.lineTo(-9, -2); g.closePath(); fs(g, c);
    g.beginPath(); g.arc(-11, -14, 5, 0, PI * 2); g.arc(11, -14, 5, 0, PI * 2); fs(g, c, 2);
    g.beginPath(); g.moveTo(0, -8); g.lineTo(-6, -12); g.lineTo(-6, -4); g.closePath(); g.moveTo(0, -8); g.lineTo(6, -12); g.lineTo(6, -4); g.closePath(); fs(g, a, 1.6);
    g.restore(); return;
  }
  if (st === 'hoodie') { g.beginPath(); g.ellipse(0, -15, 9, 5, 0, 0, PI * 2); fs(g, shade(c, -0.15), 2); }
  shirtPath(g, sl, st === 'hoodie' ? 17 : 16); fs(g, c);
  g.save(); shirtPath(g, sl, 16); g.clip();
  switch (st) {
    case 'tshirt': g.fillStyle = a; g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-8, 2, -4, -5, 0, -1); g.bezierCurveTo(4, -5, 8, 2, 0, 8); g.fill(); break;
    case 'hoodie':
      g.fillStyle = shade(c, -0.12); g.beginPath(); rr(g, -7, 4, 14, 8, 2); g.fill();
      g.strokeStyle = a; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-2, -13); g.lineTo(-2.5, -4); g.moveTo(2, -13); g.lineTo(2.5, -4); g.stroke(); break;
    case 'leatherJacket':
      g.fillStyle = '#5a2d82'; g.fillRect(-3, -16, 6, 33);
      g.fillStyle = shade(c, 0.2); g.beginPath(); g.moveTo(-3, -16); g.lineTo(-8, -4); g.lineTo(-2, -6); g.closePath(); g.moveTo(3, -16); g.lineTo(8, -4); g.lineTo(2, -6); g.closePath(); g.fill();
      g.strokeStyle = a; g.lineWidth = 1.4; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(-3, -5); g.lineTo(-3, 16); g.stroke(); g.setLineDash([]); break;
    case 'suit':
      g.fillStyle = '#f4f2f6'; g.beginPath(); g.moveTo(-5, -16); g.lineTo(5, -16); g.lineTo(0, -2); g.closePath(); g.fill();
      g.fillStyle = a; g.beginPath(); g.moveTo(-1.2, -14); g.lineTo(1.2, -14); g.lineTo(2, -5); g.lineTo(0, -2); g.lineTo(-2, -5); g.closePath(); g.fill();
      g.fillStyle = shade(c, -0.4); g.beginPath(); g.arc(0, 4, 1.4, 0, PI * 2); g.arc(0, 9, 1.4, 0, PI * 2); g.fill(); break;
    case 'hawaiian':
      for (const [fx, fy] of [[-6, -8], [5, -4], [-3, 6], [7, 9], [-9, 12], [12, -9], [-14, -6]]) {
        g.fillStyle = a; g.beginPath(); for (let k = 0; k < 5; k++) { const an = k * 1.2566; g.moveTo(fx, fy); g.arc(fx + Math.cos(an) * 2, fy + Math.sin(an) * 2, 1.7, 0, PI * 2); } g.fill();
        g.fillStyle = '#ffe066'; g.beginPath(); g.arc(fx, fy, 1, 0, PI * 2); g.fill();
      } break;
    case 'tank': g.fillStyle = a; g.fillRect(-12, 0, 24, 3); break;
    case 'police':
      g.fillStyle = a; g.beginPath(); g.moveTo(-6, -9); g.lineTo(-2, -8); g.lineTo(-2.5, -3); g.lineTo(-6, -1); g.lineTo(-9.5, -3); g.lineTo(-10, -8); g.closePath(); g.fill();
      g.fillStyle = '#1b1b22'; g.fillRect(-12, 12, 24, 4); g.fillStyle = a; g.fillRect(-2, 12, 4, 4); break;
    case 'tracksuit':
      g.strokeStyle = a; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-15, -12); g.lineTo(-17, 10); g.moveTo(15, -12); g.lineTo(17, 10); g.moveTo(-10, -10); g.lineTo(-10, 16); g.moveTo(10, -10); g.lineTo(10, 16); g.stroke();
      g.strokeStyle = shade(c, -0.4); g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 16); g.stroke(); break;
    case 'armorVest':
      g.strokeStyle = shade(c, -0.35); g.lineWidth = 1.4; g.strokeRect(-9, -8, 7, 9); g.strokeRect(2, -8, 7, 9);
      for (let i = 0; i < 3; i++) { g.beginPath(); rr(g, -10 + i * 7, 7, 6, 6, 1); g.fillStyle = a; g.fill(); } break;
  }
  g.restore();
  shirtPath(g, sl, st === 'hoodie' ? 17 : 16); g.strokeStyle = OUTLINE; g.lineWidth = 2.4; g.stroke();
  g.restore();
}

function paintBottom(g, st, c, a) {
  g.save(); g.translate(24, 22);
  if (st === 'skirt') {
    g.beginPath(); g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(18, 12);
    for (let i = 0; i < 6; i++) { const x0 = 18 - i * 6, x1 = 18 - (i + 1) * 6; g.quadraticCurveTo((x0 + x1) / 2, 15, x1, 12); }
    g.closePath(); fs(g, c);
    g.strokeStyle = shade(c, -0.25); g.lineWidth = 1.2; g.beginPath(); for (const px of [-6, 0, 6]) { g.moveTo(px * 0.6, -10); g.lineTo(px * 1.6, 12); } g.stroke();
    g.strokeStyle = a; g.lineWidth = 2; g.beginPath(); g.moveTo(-16, 10); g.lineTo(16, 10); g.stroke();
    g.restore(); return;
  }
  const short = st === 'shorts';
  const wide = st === 'cargo' ? 2 : st === 'armorPants' ? 1.5 : 0;
  const L = short ? 10 : 22;
  g.beginPath(); g.moveTo(-11 - wide * 0.5, -12); g.lineTo(11 + wide * 0.5, -12); g.lineTo(12 + wide, L); g.lineTo(2, L); g.lineTo(0, -2); g.lineTo(-2, L); g.lineTo(-12 - wide, L); g.closePath();
  fs(g, c);
  g.fillStyle = shade(c, -0.25); g.fillRect(-11, -12, 22, 3);
  switch (st) {
    case 'jeans': g.strokeStyle = rgba(a, 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -6); g.quadraticCurveTo(-5, -4, -3, -8); g.moveTo(-7, 0); g.lineTo(-8, L - 2); g.moveTo(7, 0); g.lineTo(8, L - 2); g.stroke(); break;
    case 'shorts': g.fillStyle = a; g.fillRect(-12, L - 3, 10, 2.4); g.fillRect(2, L - 3, 10, 2.4); break;
    case 'cargo': g.beginPath(); rr(g, -12, 2, 6, 7, 1); rr(g, 6.5, 2, 6, 7, 1); fs(g, shade(c, -0.15), 1.4); break;
    case 'suitPants': g.strokeStyle = shade(c, 0.3); g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -8); g.lineTo(-7, L); g.moveTo(6, -8); g.lineTo(7, L); g.stroke(); break;
    case 'trackPants': g.strokeStyle = a; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-11, -8); g.lineTo(-12, L - 1); g.moveTo(11, -8); g.lineTo(12, L - 1); g.stroke(); break;
    case 'armorPants': g.beginPath(); g.ellipse(-7, 9, 4.5, 4, 0, 0, PI * 2); g.ellipse(7, 9, 4.5, 4, 0, 0, PI * 2); fs(g, a, 1.6); break;
  }
  g.restore();
}

function paintShoes(g, st, c, a) {
  g.save(); g.translate(22, 30); g.scale(2.4, 2.4);
  g.beginPath();
  const lw = 1;
  switch (st) {
    case 'boots':
      g.moveTo(-4, -9); g.lineTo(3, -9); g.lineTo(3.4, -2); g.quadraticCurveTo(8, -1.6, 8, 1.5); g.lineTo(8, 3); g.lineTo(-4.4, 3); g.closePath(); fs(g, c, lw);
      g.fillStyle = a; g.fillRect(-4.2, 1.4, 12, 1.6); g.fillRect(-3.8, -7, 7, 1.4); break;
    case 'sandals':
      g.moveTo(-4.2, 1.2); g.lineTo(7.8, 1.2); g.lineTo(7.8, 3); g.lineTo(-4.2, 3); g.closePath(); fs(g, c, lw);
      g.strokeStyle = a; g.lineWidth = 1.6; g.beginPath(); g.moveTo(1.5, -2.5); g.lineTo(4, 1.2); g.moveTo(1.5, -2.5); g.lineTo(-1, 1.2); g.stroke(); break;
    case 'loafers':
      g.moveTo(-4, -2.4); g.quadraticCurveTo(2, -4, 4.4, -1.4); g.quadraticCurveTo(8.4, -0.2, 8.2, 2.4); g.lineTo(-4.2, 2.6); g.closePath(); fs(g, c, lw);
      g.fillStyle = a; g.fillRect(0.6, -2.2, 3.4, 1.1); break;
    case 'heels':
      g.moveTo(-3.6, -2.6); g.quadraticCurveTo(1, -3, 4, -0.6); g.quadraticCurveTo(7.6, 0.8, 7.6, 2.8); g.lineTo(1.6, 2.8);
      g.quadraticCurveTo(0, 0.8, -2, 0.8); g.lineTo(-2.4, 3.2); g.lineTo(-3.8, 3.2); g.closePath(); fs(g, c, lw);
      g.fillStyle = a; g.beginPath(); g.arc(2.4, -1.2, 1.1, 0, PI * 2); g.fill(); break;
    default:
      g.moveTo(-4, -3); g.quadraticCurveTo(0, -4.2, 3, -2.6); g.quadraticCurveTo(8.2, -1.2, 8, 1.8); g.lineTo(8, 3); g.lineTo(-4.4, 3); g.closePath(); fs(g, c, lw);
      g.fillStyle = c === '#ffffff' || c === '#f4f4f4' ? a : '#ffffff'; g.fillRect(-4.2, 1.3, 12, 1.6);
      g.strokeStyle = a; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-2, -0.5); g.quadraticCurveTo(2, 0.6, 5.5, -1); g.stroke();
  }
  g.restore();
}

function paintAcc(g, st, c, a) {
  g.save(); g.translate(24, 24);
  switch (st) {
    case 'sunglasses':
      for (const sx of [-9, 9]) {
        g.beginPath(); rr(g, sx - 8, -6, 16, 12, 5);
        const gr = g.createLinearGradient(0, -6, 0, 6); gr.addColorStop(0, shade(c, -0.2)); gr.addColorStop(1, shade(c, 0.4));
        g.fillStyle = gr; g.fill(); g.strokeStyle = a; g.lineWidth = 2.4; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(sx - 4, -2); g.lineTo(sx - 1, -4); g.stroke();
      }
      g.strokeStyle = a; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-1, -3); g.lineTo(1, -3); g.stroke();
      break;
    case 'goldChain':
      g.strokeStyle = OUTLINE; g.lineWidth = 5; g.beginPath(); g.moveTo(-14, -14); g.quadraticCurveTo(0, 18, 14, -14); g.stroke();
      g.strokeStyle = c; g.lineWidth = 3; g.setLineDash([3, 1.6]); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(0, 2); g.lineTo(6, 8); g.lineTo(0, 14); g.lineTo(-6, 8); g.closePath(); fs(g, c, 2);
      g.fillStyle = a; g.beginPath(); g.arc(0, 8, 2, 0, PI * 2); g.fill();
      break;
    case 'mask':
      g.beginPath(); g.moveTo(-16, -8); g.quadraticCurveTo(0, -12, 16, -8); g.bezierCurveTo(16, 6, 8, 14, 0, 14); g.bezierCurveTo(-8, 14, -16, 6, -16, -8); g.closePath(); fs(g, c);
      g.strokeStyle = a; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, 2); for (let i = 0; i <= 6; i++) g.lineTo(-9 + i * 3, i % 2 ? 6 : 2); g.stroke();
      g.fillStyle = a; g.beginPath(); g.ellipse(0, -4, 2, 1.4, 0, 0, PI * 2); g.fill();
      break;
    case 'scarf':
      g.beginPath(); rr(g, -15, -12, 30, 10, 5); fs(g, c);
      g.beginPath(); g.moveTo(4, -4); g.lineTo(12, 16); g.lineTo(3, 15); g.closePath(); fs(g, c, 2);
      g.strokeStyle = a; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-12, -7); g.lineTo(12, -7); g.moveTo(6, 13); g.lineTo(11, 13); g.stroke();
      break;
    case 'wings': {
      const neon = c !== '#ffffff';
      for (const sd of [-1, 1]) {
        g.save(); g.scale(sd, 1);
        g.beginPath(); g.moveTo(2, 4); g.bezierCurveTo(4, -10, 14, -18, 21, -14); g.quadraticCurveTo(18, -10, 20, -6); g.quadraticCurveTo(16, -4, 17, 0); g.quadraticCurveTo(12, 1, 12, 6); g.quadraticCurveTo(6, 7, 2, 4); g.closePath();
        if (neon) { g.fillStyle = rgba(c, 0.35); g.fill(); g.strokeStyle = c; g.lineWidth = 2.6; g.stroke(); }
        else fs(g, c, 2.2);
        g.strokeStyle = a; g.lineWidth = 1.2; g.beginPath(); g.moveTo(5, 2); g.quadraticCurveTo(10, -4, 18, -10); g.stroke();
        g.restore();
      }
      break;
    }
    case 'halo':
      g.strokeStyle = rgba(c, 0.35); g.lineWidth = 10; g.beginPath(); g.ellipse(0, 0, 16, 6, 0, 0, PI * 2); g.stroke();
      g.strokeStyle = c; g.lineWidth = 4; g.stroke();
      g.strokeStyle = a; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, -0.8, 14, 4.4, 0, PI, PI * 2); g.stroke();
      break;
    default:
      g.beginPath(); starPath(g, 0, 0, 14, 6); fs(g, c);
  }
  g.restore();
}

// ---------------------------------------------------------------- 消費・素材
function paintConsumable(g, icon, item) {
  g.save(); g.translate(24, 24);
  switch (icon) {
    case 'potionRed': case 'potionBlue': case 'elixir': {
      const col = icon === 'potionRed' ? '#ff3d5e' : icon === 'potionBlue' ? '#3a8bff' : '#c45cff';
      const b = item && item.effect && item.effect.buff && item.effect.buff.color;
      const lc = b || (item && /orange/.test(item.id) ? '#ff9a3c' : item && /white/.test(item.id) ? '#f4f0ff' : col);
      // ボトル
      g.beginPath();
      if (icon === 'elixir') { g.moveTo(-4, -14); g.lineTo(4, -14); g.lineTo(4, -8); g.lineTo(13, 6); g.quadraticCurveTo(14, 16, 0, 16); g.quadraticCurveTo(-14, 16, -13, 6); g.lineTo(-4, -8); g.closePath(); }
      else { g.moveTo(-4, -14); g.lineTo(4, -14); g.lineTo(4, -7); g.bezierCurveTo(14, -4, 15, 16, 0, 16); g.bezierCurveTo(-15, 16, -14, -4, -4, -7); g.closePath(); }
      g.fillStyle = 'rgba(230,240,255,0.55)'; g.fill();
      g.save(); g.clip();
      const gr = g.createLinearGradient(0, -2, 0, 16); gr.addColorStop(0, shade(lc, 0.35)); gr.addColorStop(1, shade(lc, -0.3));
      g.fillStyle = gr; g.fillRect(-16, -1, 32, 18);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(0, -1, 14, 2.4, 0, 0, PI * 2); g.fill();
      g.restore();
      g.strokeStyle = OUTLINE; g.lineWidth = 2.4; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-6, 4, 2, 5, 0.3, 0, PI * 2); g.fill();
      g.beginPath(); rr(g, -6, -19, 12, 6, 2); fs(g, '#b9774a', 2);
      if (icon === 'elixir') { g.fillStyle = '#ffe066'; g.beginPath(); starPath(g, 3, 8, 4, 1.8); g.fill(); }
      break;
    }
    case 'cash': {
      for (let i = 2; i >= 0; i--) {
        g.save(); g.translate(i * 2 - 2, -i * 3 + 2); g.rotate(-0.12);
        g.beginPath(); rr(g, -17, -9, 34, 18, 2); fs(g, i ? '#3fae6a' : '#5fd88a', 2);
        if (!i) {
          g.strokeStyle = '#2a7a4a'; g.lineWidth = 1.2; g.beginPath(); rr(g, -14, -6, 28, 12, 2); g.stroke();
          g.beginPath(); g.arc(0, 0, 4.6, 0, PI * 2); g.fillStyle = '#2a7a4a'; g.fill();
          g.fillStyle = '#c8ffd8'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 0.5);
        }
        g.restore();
      }
      g.fillStyle = '#ffd23f'; g.fillRect(-3, -8, 6, 18); g.strokeStyle = OUTLINE; g.lineWidth = 1.4; g.strokeRect(-3, -8, 6, 18);
      break;
    }
    case 'gem': {
      const h = hashStr(item ? item.id : 'g');
      const cols = ['#3ee6d2', '#ff4fa0', '#b45cff', '#4fa8ff', '#ffd23f', '#7cff6a'];
      const col = /diamond/.test(item && item.id) ? '#dff8ff' : cols[h % cols.length];
      g.beginPath(); g.moveTo(-14, -4); g.lineTo(-8, -13); g.lineTo(8, -13); g.lineTo(14, -4); g.lineTo(0, 15); g.closePath();
      const gr = g.createLinearGradient(-14, -13, 14, 15); gr.addColorStop(0, shade(col, 0.5)); gr.addColorStop(1, shade(col, -0.35));
      g.fillStyle = gr; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2.4; g.stroke();
      g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-14, -4); g.lineTo(14, -4); g.moveTo(-8, -13); g.lineTo(-4, -4); g.lineTo(0, 15); g.moveTo(8, -13); g.lineTo(4, -4); g.lineTo(0, 15); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); starPath(g, -6, -8, 3, 1); g.fill();
      break;
    }
    case 'chip': {
      const h = hashStr(item ? item.id : 'c');
      const col = ['#e53935', '#1e88e5', '#2ecc71', '#16161e', '#b45cff'][h % 5];
      g.beginPath(); g.ellipse(0, 4, 16, 7, 0, 0, PI * 2); fs(g, shade(col, -0.3), 2);
      g.beginPath(); g.ellipse(0, 0, 16, 7, 0, 0, PI * 2); fs(g, col, 2.2);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.beginPath(); g.ellipse(Math.cos(a) * 12.5, Math.sin(a) * 5.4, 2.2, 1.2, 0, 0, PI * 2); g.fill(); }
      g.strokeStyle = '#ffd23f'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, 8, 3.4, 0, 0, PI * 2); g.stroke();
      break;
    }
    default: {
      // 素材アイテム: id から推測
      const id = (item && item.id) || '';
      if (/jelly/.test(id)) { g.beginPath(); g.moveTo(-13, 10); g.bezierCurveTo(-15, -6, -6, -14, 0, -14); g.bezierCurveTo(6, -14, 15, -6, 13, 10); g.quadraticCurveTo(0, 14, -13, 10); g.closePath(); fs(g, '#7cff9a'); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-5, -5, 3, 2, -0.6, 0, PI * 2); g.fill(); }
      else if (/feather/.test(id)) { g.rotate(-0.6); g.beginPath(); g.moveTo(0, -17); g.quadraticCurveTo(10, -4, 0, 16); g.quadraticCurveTo(-10, -4, 0, -17); g.closePath(); fs(g, '#ff8fc0'); g.strokeStyle = OUTLINE; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 18); g.stroke(); }
      else if (/tooth/.test(id)) { g.beginPath(); g.moveTo(-8, -12); g.lineTo(8, -12); g.quadraticCurveTo(4, 4, 0, 16); g.quadraticCurveTo(-4, 4, -8, -12); g.closePath(); fs(g, '#fff8e0'); }
      else if (/scale/.test(id)) { g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(14, -4, 0, 15); g.quadraticCurveTo(-14, -4, 0, -14); g.closePath(); fs(g, '#4e9a3a'); }
      else if (/gold_bar|bar/.test(id)) { g.beginPath(); g.moveTo(-16, 8); g.lineTo(-10, -6); g.lineTo(10, -6); g.lineTo(16, 8); g.closePath(); fs(g, '#ffd23f'); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-8, -3, 10, 2); }
      else if (/cap|mushroom/.test(id)) { g.beginPath(); g.arc(0, 2, 15, PI, 0); g.closePath(); fs(g, '#ff9a3c'); g.fillStyle = '#fff'; g.beginPath(); g.arc(-6, -5, 3, 0, PI * 2); g.arc(5, -8, 2.4, 0, PI * 2); g.fill(); }
      else if (/core|neon/.test(id)) { g.beginPath(); g.arc(0, 0, 12, 0, PI * 2); fs(g, '#19f0ff'); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 5, 0, PI * 2); g.fill(); }
      else if (/crown/.test(id)) { g.beginPath(); g.moveTo(-14, 8); g.lineTo(-15, -8); g.lineTo(-6, 0); g.lineTo(2, -12); g.lineTo(4, 8); g.closePath(); fs(g, '#ffd23f'); }
      else { g.beginPath(); rr(g, -14, -12, 28, 24, 5); fs(g, '#c9a26a'); g.strokeStyle = OUTLINE; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-14, -2); g.lineTo(14, -2); g.stroke(); g.beginPath(); rr(g, -4, -5, 8, 6, 1.5); fs(g, '#ffd23f', 1.4); }
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- スキル
function paintSkill(g, sk) {
  const col = sk.color || '#ff5fa2';
  // 背景タイル
  g.beginPath(); rr(g, 2, 2, 44, 44, 9);
  const bg = g.createLinearGradient(0, 2, 0, 46);
  bg.addColorStop(0, shade(col, -0.35)); bg.addColorStop(1, shade(col, -0.75));
  g.fillStyle = bg; g.fill();
  g.save(); g.clip();
  const rg = g.createRadialGradient(24, 22, 2, 24, 22, 26);
  rg.addColorStop(0, rgba(col, 0.75)); rg.addColorStop(1, rgba(col, 0));
  g.fillStyle = rg; g.fillRect(0, 0, 48, 48);
  g.restore();
  g.strokeStyle = OUTLINE; g.lineWidth = 2.4; g.beginPath(); rr(g, 2, 2, 44, 44, 9); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.4; g.beginPath(); rr(g, 4.5, 4.5, 39, 39, 7); g.stroke();
  g.save(); g.translate(24, 24);
  const light = shade(col, 0.55);
  const id = sk.id || '';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const glyphStroke = (lw = 3) => { g.strokeStyle = OUTLINE; g.lineWidth = lw + 3; g.stroke(); g.strokeStyle = light; g.lineWidth = lw; g.stroke(); };
  switch (sk.kind) {
    case 'melee': {
      if (/upper/.test(id)) { // 上向き拳
        g.beginPath(); g.moveTo(0, 14); g.lineTo(0, -6); glyphStroke(4);
        g.beginPath(); rr(g, -7, -15, 14, 12, 4); g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.moveTo(-12, 4); g.lineTo(-8, -6); g.moveTo(12, 4); g.lineTo(8, -6); glyphStroke(2);
      } else {
        g.beginPath(); g.arc(-4, 6, 16, -1.9, 0.2); g.arc(-1, 3, 10, 0.1, -1.6, true); g.closePath();
        g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.moveTo(-14, 12); g.lineTo(12, -12); glyphStroke(2.4);
        g.fillStyle = '#fff'; g.beginPath(); starPath(g, 10, -10, 4, 1.6); g.fill();
      }
      break;
    }
    case 'projectile': {
      const kind = sk.proj && sk.proj.kind;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(-16 + i * 3, -8 + i * 8); g.lineTo(-4 + i * 3, -8 + i * 8); g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 2; g.stroke();
      }
      g.beginPath();
      if (kind === 'heart') { g.moveTo(6, 12); g.bezierCurveTo(-8, 2, -2, -12, 6, -4); g.bezierCurveTo(14, -12, 20, 2, 6, 12); }
      else if (kind === 'star') starPath(g, 6, 0, 12, 5);
      else if (kind === 'shockwave') { g.arc(-2, 0, 14, -1, 1); g.arc(-6, 0, 10, 0.9, -0.9, true); g.closePath(); }
      else { g.ellipse(6, 0, 10, 5, 0, 0, PI * 2); }
      g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2.2; g.stroke();
      break;
    }
    case 'aoe': {
      g.beginPath(); starPath(g, 0, 0, 17, 8, 8, 0.2); g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.arc(0, 0, 7, 0, PI * 2); g.fillStyle = '#fff'; g.fill();
      break;
    }
    case 'buff': {
      g.beginPath(); g.moveTo(0, -16); g.lineTo(12, -2); g.lineTo(5, -2); g.lineTo(5, 14); g.lineTo(-5, 14); g.lineTo(-5, -2); g.lineTo(-12, -2); g.closePath();
      g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); starPath(g, -12, -12, 3.6, 1.4); starPath(g, 13, 8, 3, 1.2); g.fill();
      break;
    }
    case 'dash': {
      g.beginPath(); g.moveTo(-4, -14); g.lineTo(14, 0); g.lineTo(-4, 14); g.lineTo(2, 0); g.closePath();
      g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.moveTo(-18, -7); g.lineTo(-6, -7); g.moveTo(-20, 0); g.lineTo(-4, 0); g.moveTo(-18, 7); g.lineTo(-6, 7); glyphStroke(2.2);
      break;
    }
    case 'passive': default: {
      g.beginPath();
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 11 : 15, a = (i * PI) / 8; if (!i) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fillStyle = light; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2.2; g.stroke();
      g.beginPath();
      if (/heart|critical/.test(id)) { g.moveTo(0, 7); g.bezierCurveTo(-9, 0, -4, -9, 0, -3); g.bezierCurveTo(4, -9, 9, 0, 0, 7); }
      else g.arc(0, 0, 5.5, 0, PI * 2);
      g.fillStyle = shade(col, -0.4); g.fill();
    }
  }
  g.restore();
  // ツヤ
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(18, 10, 14, 5, -0.3, 0, PI * 2); g.fill();
}
