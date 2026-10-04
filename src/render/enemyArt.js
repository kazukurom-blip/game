// 敵の描画: メイプル的かわいいモンスター（独自デザイン）＋GTA的な人型ギャング/警官
import { drawCharacter } from './character.js';
import { shade, rgba, clamp, rr, mix } from './util.js';
import { FL, setFL, C, OC, fs, cuteEyes, blush, pickCol } from './mkit.js';
import { drawMonster2, ART2_SIZE, drawCivilian } from './monsters2.js';

const PI = Math.PI;

const L = (style, color, accent) => ({ style, color, accent: accent || '#ffffff' });
// def.look/equip が無い場合のデフォルト
const DEFAULT_HUMANS = {
  thug: {
    look: { body: 'm', skin: '#d9a27a', hair: 'spiky', hairColor: '#39ff6a', eyeColor: '#2a2a2a' },
    equip: { hat: L('bandana', '#d8283c'), top: L('tank', '#222228', '#ffd23f'), bottom: L('jeans', '#3a5a8c', '#c9d6ea'), shoes: L('sneakers', '#f4f4f4', '#d8283c'), weapon: L('bat', '#b98a52', '#5a3a22') },
  },
  cop: {
    look: { body: 'm', skin: '#c98e62', hair: 'short', hairColor: '#2a1a10', eyeColor: '#1a2a4a' },
    equip: { hat: L('cap', '#1f3a8a', '#ffd23f'), top: L('police', '#1f3a8a', '#ffd23f'), bottom: L('suitPants', '#1a2440', '#5a5a66'), shoes: L('loafers', '#1a1a1a', '#444'), accessory: L('sunglasses', '#1a1a24', '#c0c0c8'), weapon: L('pistol', '#2a2a30', '#8a8a8a') },
  },
  swat: {
    look: { body: 'm', skin: '#b07a52', hair: 'short', hairColor: '#111111', eyeColor: '#111111' },
    equip: { hat: L('helmet', '#16161e', '#3a6bff'), top: L('armorVest', '#23282c', '#5a6470'), bottom: L('armorPants', '#23282c', '#5a6470'), shoes: L('boots', '#111', '#555'), accessory: L('mask', '#1a1a20', '#5a6470'), weapon: L('smg', '#1d1d24', '#3a6bff') },
  },
  bossDon: {
    look: { body: 'm', skin: '#d0a070', hair: 'wolf', hairColor: '#e8e8e8', eyeColor: '#ffd23f' },
    equip: { hat: L('crown', '#ffd23f', '#ff3d7f'), top: L('suit', '#ffd23f', '#15151b'), bottom: L('suitPants', '#15151b', '#5a5a66'), shoes: L('loafers', '#5a3a22', '#c9a26a'), accessory: L('goldChain', '#ffb800', '#ffffff'), weapon: L('pistol', '#ff8a00', '#ff3dd2') },
  },
};

function animState(e) {
  const s = e.state;
  if (s === 'dead' || e.dead) return 'dead';
  if (s === 'hurt' || e.hurtT > 0) return 'hurt';
  if (s === 'attack' || s === 'shoot') return 'attack';
  if (s === 'jump' || (!e.onGround && !e.flying && Math.abs(e.vy || 0) > 60)) return 'jump';
  if (s === 'walk' || s === 'move' || s === 'chase' || s === 'patrol' || Math.abs(e.vx || 0) > 5) return 'walk';
  return 'idle';
}

// 非人型 art の基準サイズ（def.scale 指定時は 基準×scale で描く。未指定なら e.w/e.h）
const ART_SIZE = Object.assign({
  slime: [40, 32], mushroom: [44, 48], flamingo: [40, 70], gator: [92, 40], bossGator: [180, 80], drone: [44, 30],
}, ART2_SIZE);
const DEF_COLORS = {
  slime: ['#5cff9a', '#ff4fa0'], mushroom: ['#ff8a00', null], flamingo: ['#ff7fb0', null], gator: ['#4e9a3a', '#ffd23f'],
  bossGator: ['#2f6f2a', '#ffd23f'], drone: ['#19f0ff', null],
};
const HUMAN_ARTS = { thug: 1, cop: 1, swat: 1, bossDon: 1 };

// def.color/accent で人型の既定装備を色替え（def.equip 明示時はそのまま）
const tintCache = new Map();
function tintedEquip(art, base, col, acc) {
  if ((!col || col === '#ffffff') && !acc) return base;
  const key = art + col + acc;
  let r = tintCache.get(key);
  if (r) return r;
  r = {};
  for (const k in base) {
    const v = base[k];
    if (!v) { r[k] = v; continue; }
    if (k === 'top' || k === 'hat' || (k === 'bottom' && art === 'swat')) r[k] = { style: v.style, color: (col && col !== '#ffffff') ? col : v.color, accent: acc || v.accent };
    else if (k === 'weapon' && acc) r[k] = { style: v.style, color: v.color, accent: acc };
    else r[k] = v;
  }
  if (tintCache.size > 200) tintCache.clear();
  tintCache.set(key, r);
  return r;
}

export function drawEnemy(ctx, e) {
  const def = e.def || {};
  const art = def.art || 'slime';
  const st = animState(e);
  const flash = e.hurtT > 0 && ((e.hurtT * 24) | 0) % 2 === 0;
  const t = e.t || 0;
  ctx.save();
  if (st === 'dead' && e.alpha == null) ctx.globalAlpha *= clamp(1 - (e.deadT || 0), 0, 1);
  const boss = !!(def.boss || e.boss);
  let topY = e.y - (e.h || def.h || 40);
  if (HUMAN_ARTS[art]) {
    const dflt = DEFAULT_HUMANS[art];
    const look = def.look || dflt.look;
    const equip = def.equip || tintedEquip(art, dflt.equip, def.color, def.accent);
    const sc = def.scale || clamp((e.h || 70) / 72, 0.8, 2.2);
    if (art === 'bossDon') drawAura(ctx, e.x, e.y - 45 * sc, 55 * sc, t, '#ffc93c', '#ff4fa0');
    let attackT = 0;
    if (st === 'attack') { attackT = ((t * 2.2) % 1); }
    drawCharacter(ctx, e.x, e.y, look, equip, {
      facing: e.facing || 1, state: st, t, attackT, damage: art === 'bossDon' ? clamp(1 - e.hp / e.maxHp, 0, 1) * 0.8 : 0,
      scale: sc, flash, deadT: clamp((e.deadT || 0) * 3, 0, 1),
    });
    topY = e.y - 82 * sc;
  } else if (art === 'civilian') {
    topY = drawCivilian(ctx, e, st, t, flash);
  } else {
    setFL(flash);
    ctx.translate(e.x, e.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let w = e.w || def.w || 40, h = e.h || def.h || 40;
    const base = ART_SIZE[art];
    if (def.scale && base) { w = base[0] * def.scale; h = base[1] * def.scale; }
    topY = e.y - h;
    const fly = e.flying || art === 'drone' || art === 'jellyfish' || art === 'seagull' || art === 'mosquito' || art === 'ghost' || art === 'bossAlien';
    // 影
    if (!fly) { ctx.beginPath(); ctx.ellipse(0, 0, w * 0.45, 4 + w * 0.03, 0, 0, PI * 2); ctx.fillStyle = 'rgba(20,0,30,0.28)'; ctx.fill(); }
    else if (st !== 'dead') { ctx.beginPath(); ctx.ellipse(0, 0, w * 0.3, 3 + w * 0.02, 0, 0, PI * 2); ctx.fillStyle = 'rgba(20,0,30,0.14)'; ctx.fill(); }
    ctx.scale(e.facing < 0 ? -1 : 1, 1);
    const dc = DEF_COLORS[art];
    const col = dc ? pickCol(def.color, dc[0]) : def.color;
    const acc = def.accent || (dc && dc[1]) || null;
    if (boss && art !== 'bossGator' && art !== 'bossAlien') drawAura(ctx, 0, -h * 0.5, Math.max(w, h) * 0.65, t, '#ffc93c', '#ff4fa0');
    if (art === 'slime') drawSlime(ctx, w, h, col, t, st, boss, acc);
    else if (art === 'mushroom') drawMushroom(ctx, w, h, col, t, st, acc);
    else if (art === 'flamingo') drawFlamingo(ctx, w, h, col, t, st, acc);
    else if (art === 'gator') drawGator(ctx, w, h, col, t, st, false, acc);
    else if (art === 'bossGator') { drawAura(ctx, 0, -h * 0.45, w * 0.55, t, '#c8ff5a', '#ffc93c'); drawGator(ctx, w, h, col, t, st, true, acc); }
    else if (art === 'drone') drawDrone(ctx, w, h, col, t, st, boss, acc);
    else if (!drawMonster2(ctx, art, w, h, def.color, def.accent, t, st, boss, e)) drawSlime(ctx, w, h, pickCol(def.color, '#5cff9a'), t, st, boss, acc || '#ff4fa0');
    setFL(false);
  }
  ctx.restore();
  // HPバー・名前
  if (st !== 'dead') {
    if (boss) drawBossTag(ctx, e, topY);
    else if (e.hurtT > 0 || e.showHpT > 0) drawHpBar(ctx, e.x, topY - 10, 40, 5, e.hp / e.maxHp);
  }
}

function drawAura(ctx, x, y, r, t, c1, c2) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + Math.sin(t * 3) * 0.06;
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * pulse);
  g.addColorStop(0, rgba(c1, 0.0)); g.addColorStop(0.6, rgba(c1, 0.12)); g.addColorStop(0.85, rgba(c2, 0.16)); g.addColorStop(1, rgba(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, PI * 2); ctx.fill();
  ctx.restore();
}

export function drawHpBar(ctx, x, y, w, h, frac) {
  frac = clamp(frac || 0, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(42,20,48,0.85)';
  ctx.beginPath(); rr(ctx, x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#ff8fb8'); g.addColorStop(1, '#e8264f');
  ctx.fillStyle = g;
  if (frac > 0) { ctx.beginPath(); rr(ctx, x - w / 2, y, w * frac, h, 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - w / 2 + 1, y + 0.5, Math.max(0, w * frac - 2), 1.2);
  ctx.restore();
}

function drawBossTag(ctx, e, topY) {
  const def = e.def || {};
  const name = def.name || e.name || 'BOSS';
  const y = topY - 30;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (def.title) {
    ctx.font = 'bold 11px sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(def.title, e.x, y - 18);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText(def.title, e.x, y - 18);
  }
  ctx.font = '900 18px "Arial Black", sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(name, e.x, y);
  const g = ctx.createLinearGradient(0, y - 16, 0, y);
  g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ff4fa0');
  ctx.fillStyle = g; ctx.fillText(name, e.x, y);
  ctx.restore();
  drawHpBar(ctx, e.x, y + 6, 110, 8, e.hp / e.maxHp);
}

// ---------------------------------------------------------------- スライム（ソーダゼリー＋サングラス）
function drawSlime(ctx, w, h, col, t, st, boss, acc) {
  acc = acc || '#ff4fa0';
  let sq = Math.sin(t * 5) * 0.06;
  if (st === 'jump') sq = -0.14;
  if (st === 'attack') sq = Math.sin(t * 14) * 0.12;
  if (st === 'dead') sq = 0.35;
  const W = w * 0.52 * (1 + sq), H = h * (1 - sq);
  ctx.save();
  // ゼリー本体（雫型）
  ctx.beginPath();
  ctx.moveTo(-W, 0);
  ctx.bezierCurveTo(-W * 1.08, -H * 0.55, -W * 0.45, -H * 0.88, 0, -H);
  ctx.bezierCurveTo(W * 0.45, -H * 0.88, W * 1.08, -H * 0.55, W, 0);
  ctx.quadraticCurveTo(0, H * 0.08, -W, 0);
  ctx.closePath();
  if (FL) ctx.fillStyle = '#fff';
  else {
    const g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.25));
    ctx.fillStyle = g;
  }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 2.2; ctx.stroke();
  // ソーダの泡
  ctx.save(); ctx.clip();
  ctx.fillStyle = C(rgba('#ffffff', 0.45));
  const bub = [[-0.45, -0.25, 0.07], [0.35, -0.18, 0.05], [0.1, -0.12, 0.04], [-0.2, -0.45, 0.04], [0.55, -0.4, 0.035]];
  for (let i = 0; i < bub.length; i++) {
    const [bx, by, br] = bub[i];
    const yy = by - ((t * 0.25 + i * 0.21) % 0.5);
    ctx.beginPath(); ctx.arc(bx * W, yy * H, br * W * 1.6, 0, PI * 2); ctx.fill();
  }
  ctx.restore();
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(-W * 0.5, -H * 0.62, W * 0.14, H * 0.1, -0.6, 0, PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-W * 0.25, -H * 0.8, W * 0.05, 0, PI * 2); ctx.fill();
  // 顔
  const fy = -H * 0.38, er = Math.max(2.4, W * 0.15);
  cuteEyes(ctx, W * 0.12, fy, er, W * 0.3, shade(col, -0.2), st, t);
  blush(ctx, -W * 0.38, fy + er * 1.5, er * 0.9); blush(ctx, W * 0.62, fy + er * 1.5, er * 0.8);
  ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.3, W * 0.06); ctx.beginPath();
  if (st === 'attack' || st === 'hurt') { ctx.arc(W * 0.12, fy + er * 1.6, er * 0.5, 0, PI); }
  else { ctx.moveTo(W * 0.02, fy + er * 1.4); ctx.quadraticCurveTo(W * 0.12, fy + er * 2, W * 0.22, fy + er * 1.4); }
  ctx.stroke();
  // 頭のサングラス（おでこに乗せてる）
  const gy = -H * 0.78;
  ctx.save(); ctx.translate(W * 0.1, gy); ctx.rotate(-0.08);
  ctx.beginPath(); rr(ctx, -W * 0.42, -W * 0.08, W * 0.36, W * 0.2, W * 0.07); rr(ctx, W * 0.04, -W * 0.08, W * 0.36, W * 0.2, W * 0.07);
  fs(ctx, '#1a1a2a', 1.5);
  ctx.strokeStyle = C(acc); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-W * 0.06, -W * 0.02); ctx.lineTo(W * 0.04, -W * 0.02); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-W * 0.36, -W * 0.05, W * 0.08, W * 0.04);
  ctx.restore();
  if (boss) { // 王冠
    ctx.save(); ctx.translate(0, -H * 0.98);
    const s = W * 0.35;
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 1.1, -s * 0.9); ctx.lineTo(-s * 0.5, -s * 0.4); ctx.lineTo(0, -s * 1.15); ctx.lineTo(s * 0.5, -s * 0.4); ctx.lineTo(s * 1.1, -s * 0.9); ctx.lineTo(s, 0); ctx.closePath();
    fs(ctx, '#ffd23f', 2);
    ctx.fillStyle = C(acc); ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.15, 0, PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- キノコ（パラソル傘のビーチキノコ）
function drawMushroom(ctx, w, h, col, t, st, acc) {
  const walk = st === 'walk' || st === 'attack';
  const step = walk ? Math.sin(t * 10) : 0;
  const bob = walk ? Math.abs(Math.cos(t * 10)) * 2 : Math.sin(t * 2.5) * 0.8;
  const sq = st === 'dead' ? 0.3 : st === 'jump' ? -0.1 : 0;
  const S = w / 44;
  ctx.save();
  ctx.scale(S * (1 + sq * 0.5), S * (1 - sq));
  // 足
  for (const [fx, ph] of [[-7, 1], [7, -1]]) {
    ctx.beginPath(); ctx.ellipse(fx + step * 3 * ph, -2.5, 5.5, 3.5, 0, 0, PI * 2); fs(ctx, shade(col, -0.35), 1.8);
  }
  ctx.translate(0, -bob);
  // 柄（胴＋顔）
  ctx.beginPath();
  ctx.moveTo(-11, -4); ctx.bezierCurveTo(-14, -16, -11, -26, -9, -28); ctx.lineTo(9, -28); ctx.bezierCurveTo(11, -26, 14, -16, 11, -4);
  ctx.quadraticCurveTo(0, 0, -11, -4); ctx.closePath();
  fs(ctx, '#fff2dc', 2);
  ctx.fillStyle = C('rgba(200,150,120,0.25)'); ctx.beginPath(); ctx.ellipse(6, -10, 4, 6, 0, 0, PI * 2); ctx.fill();
  cuteEyes(ctx, 1.5, -16, 2.8, 4.6, shade(col, -0.3), st, t);
  blush(ctx, -6, -11.5, 2.4); blush(ctx, 9, -11.5, 2.2);
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.beginPath();
  if (st === 'attack') { ctx.moveTo(-0.5, -10.5); ctx.lineTo(3.5, -10.5); ctx.lineTo(1.5, -8); ctx.closePath(); ctx.fillStyle = C('#c2304a'); ctx.fill(); }
  else { ctx.moveTo(0, -10.5); ctx.quadraticCurveTo(1.5, -9, 3, -10.5); }
  ctx.stroke();
  // 傘（パラソル: 放射ストライプ＋スカラップ）
  const wob = Math.sin(t * 3) * 0.04;
  ctx.save(); ctx.translate(0, -28); ctx.rotate(wob);
  const R = 22;
  ctx.beginPath();
  ctx.moveTo(-R, 2);
  ctx.bezierCurveTo(-R, -18, R, -18, R, 2);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = R - (2 * R * i) / n, x1 = R - (2 * R * (i + 1)) / n;
    ctx.quadraticCurveTo((x0 + x1) / 2, 6.5, x1, 2);
  }
  ctx.closePath();
  fs(ctx, col, 2.2);
  ctx.save(); ctx.clip();
  ctx.fillStyle = C(acc || shade(col, 0.75));
  for (let i = 0; i < n; i += 2) {
    const x0 = R - (2 * R * i) / n, x1 = R - (2 * R * (i + 1)) / n;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(x0, 4); ctx.lineTo(x1, 4); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-9, -8, 6, 2.5, -0.5, 0, PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.2; ctx.beginPath();
  ctx.moveTo(-R, 2); ctx.bezierCurveTo(-R, -18, R, -18, R, 2); ctx.stroke();
  // てっぺんの飾り（カクテルピック）
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(2, -19); ctx.stroke();
  ctx.beginPath(); ctx.arc(2.4, -20, 2.4, 0, PI * 2); fs(ctx, acc || '#ffd23f', 1.4);
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------- フラミンゴ（ヤンキー）
function drawFlamingo(ctx, w, h, col, t, st, acc) {
  const S = h / 70;
  const walk = st === 'walk' || st === 'attack';
  const sp = st === 'attack' ? 18 : 10;
  const s = walk ? Math.sin(t * sp) : 0;
  ctx.save(); ctx.scale(S, S);
  const dark = shade(col, -0.25);
  // 脚（細く膝が逆）
  const legs = [[-2, s], [3, -s]];
  for (const [lx, ph] of legs) {
    const kx = lx + ph * 5 + 3, ky = -14;
    ctx.strokeStyle = OC(); ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(lx, -30); ctx.lineTo(kx, ky); ctx.lineTo(lx + ph * 7, -1); ctx.stroke();
    ctx.strokeStyle = C('#ff9fbf'); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(lx + ph * 7 + 2.5, -1, 4, 1.8, 0, 0, PI * 2); fs(ctx, '#ff9fbf', 1.4);
  }
  const bob = walk ? Math.abs(Math.cos(t * sp)) * 1.5 : Math.sin(t * 2) * 0.6;
  ctx.translate(0, -bob);
  // 胴体
  ctx.beginPath();
  ctx.moveTo(-16, -38); ctx.bezierCurveTo(-18, -50, 2, -54, 10, -46); ctx.bezierCurveTo(14, -40, 10, -30, 0, -29);
  ctx.bezierCurveTo(-8, -28, -14, -31, -16, -38); ctx.closePath();
  fs(ctx, col, 2.2);
  // 尾羽
  ctx.beginPath(); ctx.moveTo(-15, -40); ctx.lineTo(-23, -44); ctx.lineTo(-19, -38); ctx.lineTo(-24, -36); ctx.lineTo(-15, -35); ctx.closePath(); fs(ctx, dark, 1.8);
  // 羽
  ctx.beginPath(); ctx.moveTo(-8, -44); ctx.quadraticCurveTo(4, -48, 6, -38); ctx.quadraticCurveTo(-2, -34, -10, -38); ctx.closePath(); fs(ctx, shade(col, 0.25), 1.6);
  // 首（S字）
  const nk = st === 'attack' ? 4 : 0;
  ctx.strokeStyle = OC(); ctx.lineWidth = 7.6; ctx.beginPath();
  ctx.moveTo(6, -45); ctx.bezierCurveTo(14 + nk, -52, 2 + nk, -58, 8 + nk, -64); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = 4; ctx.stroke();
  // 頭
  const hx = 10 + nk, hy = -65;
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, PI * 2); fs(ctx, col, 2);
  // モヒカン
  ctx.beginPath(); ctx.moveTo(hx - 6, hy - 3); ctx.lineTo(hx - 7, hy - 11); ctx.lineTo(hx - 3, hy - 7); ctx.lineTo(hx - 2, hy - 14); ctx.lineTo(hx + 1, hy - 7); ctx.lineTo(hx + 4, hy - 11); ctx.lineTo(hx + 4, hy - 5); ctx.closePath();
  fs(ctx, acc || (col === '#b04dff' ? '#19f0ff' : '#ff3d7f'), 1.6);
  // くちばし
  ctx.beginPath(); ctx.moveTo(hx + 5, hy - 2); ctx.quadraticCurveTo(hx + 14, hy - 2, hx + 15, hy + 4); ctx.quadraticCurveTo(hx + 10, hy + 2, hx + 5, hy + 3); ctx.closePath(); fs(ctx, '#fff2dc', 1.6);
  ctx.beginPath(); ctx.moveTo(hx + 11, hy - 1.6); ctx.quadraticCurveTo(hx + 15, hy - 1, hx + 15, hy + 4); ctx.lineTo(hx + 11.5, hy + 2); ctx.closePath(); fs(ctx, '#2a1430', 1);
  // サングラス
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, hx + 2, hy - 1, 2, 0.01, '#000', st, t);
  else {
    ctx.beginPath(); rr(ctx, hx - 3, hy - 4, 9, 4.5, 1.8); fs(ctx, '#1a1a2a', 1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(hx - 1, hy - 3, 2.4, 1);
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 3); ctx.lineTo(hx - 6.5, hy - 4); ctx.stroke();
  }
  blush(ctx, hx - 1, hy + 3, 2);
  ctx.restore();
}

// ---------------------------------------------------------------- ワニ（ちょいワル・金チェーン）
function drawGator(ctx, w, h, col, t, st, boss, acc) {
  acc = acc || '#ffd23f';
  const S = w / 92;
  const walk = st === 'walk' || st === 'attack';
  const sp = st === 'attack' ? 14 : 8;
  const s = walk ? Math.sin(t * sp) : 0;
  const jaw = st === 'attack' ? 0.35 + Math.sin(t * 12) * 0.2 : st === 'hurt' ? 0.2 : 0.04 + Math.max(0, Math.sin(t * 1.5)) * 0.05;
  const belly = boss ? '#f4e2a8' : '#eaf2b0';
  const dark = shade(col, -0.3);
  ctx.save(); ctx.scale(S, S * (h / w) / (40 / 92) * 0.95);
  if (st === 'dead') ctx.scale(1, 0.85);
  // 尻尾
  const tw = Math.sin(t * 4) * 3;
  ctx.beginPath(); ctx.moveTo(-26, -18); ctx.quadraticCurveTo(-42, -16 + tw, -56, -8 + tw); ctx.quadraticCurveTo(-40, -6, -26, -6); ctx.closePath(); fs(ctx, col, 2);
  // 奥の脚
  for (const [lx, ph] of [[-16, -1], [14, 1]]) {
    ctx.beginPath(); rr(ctx, lx - 4 + s * 3 * ph, -12, 8, 12, 3.5); fs(ctx, dark, 1.8);
  }
  // 胴
  ctx.beginPath(); ctx.ellipse(-2, -18, 28, 14, 0, 0, PI * 2); fs(ctx, col, 2.2);
  ctx.save(); ctx.beginPath(); ctx.ellipse(-2, -18, 28, 14, 0, 0, PI * 2); ctx.clip();
  ctx.fillStyle = C(belly); ctx.beginPath(); ctx.ellipse(-2, -6, 24, 7, 0, 0, PI * 2); ctx.fill();
  ctx.fillStyle = C(shade(col, 0.2));
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(i * 7, -26, 2.6, 1.6, 0, 0, PI * 2); ctx.fill(); }
  ctx.restore();
  // 背中のトゲ
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const x = -24 + i * 8; ctx.moveTo(x, -30 + Math.abs(i - 2.5) * 0.8); ctx.lineTo(x + 3, -36 + Math.abs(i - 2.5)); ctx.lineTo(x + 6, -30 + Math.abs(i - 2.5) * 0.8); }
  fs(ctx, dark, 1.6);
  // 頭
  ctx.save(); ctx.translate(22, -22);
  // 下顎
  ctx.save(); ctx.rotate(jaw);
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(26, 3); ctx.quadraticCurveTo(30, 4, 28, 8); ctx.lineTo(2, 10); ctx.closePath(); fs(ctx, col, 2);
  ctx.fillStyle = C('#ffffff'); ctx.beginPath();
  for (let i = 0; i < 5; i++) { const x = 6 + i * 4.4; ctx.moveTo(x, 3); ctx.lineTo(x + 1.6, 0.5); ctx.lineTo(x + 3, 3); }
  ctx.fill();
  if (boss) { ctx.fillStyle = C('#ffd23f'); ctx.beginPath(); ctx.moveTo(19.2, 3); ctx.lineTo(20.8, 0); ctx.lineTo(22.2, 3); ctx.fill(); }
  ctx.restore();
  // 上顎
  ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(6, -14, 14, -8); ctx.lineTo(28, -4); ctx.quadraticCurveTo(33, -2, 31, 2); ctx.lineTo(0, 4); ctx.closePath(); fs(ctx, col, 2.2);
  ctx.fillStyle = C('#ffffff'); ctx.beginPath();
  for (let i = 0; i < 5; i++) { const x = 8 + i * 4.4; ctx.moveTo(x, 3); ctx.lineTo(x + 1.6, 6); ctx.lineTo(x + 3, 3); }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = C(dark); ctx.beginPath(); ctx.arc(28, -2, 1.2, 0, PI * 2); ctx.fill();
  // 目（盛り上がり）
  ctx.beginPath(); ctx.arc(6, -10, 6.5, PI, 0); ctx.closePath(); fs(ctx, col, 2);
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, 6, -10, 2.6, 0.01, '#000', st, t);
  else if (boss) {
    ctx.beginPath(); rr(ctx, 0, -13, 13, 5, 2); fs(ctx, '#1a1a2a', 1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(2, -12, 3, 1.2);
  } else {
    ctx.beginPath(); ctx.ellipse(6, -10.5, 3.6, 3.2, 0, 0, PI * 2); fs(ctx, '#fff8c0', 1.2);
    ctx.fillStyle = C('#2a1430'); ctx.beginPath(); ctx.ellipse(6.8, -10.5, 1.2, 2.6, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7.4, -11.6, 0.8, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(1.5, -14); ctx.lineTo(10.5, -12); ctx.stroke();
  }
  blush(ctx, 12, -3, 2.6);
  if (boss) {
    // 王冠＋葉巻の代わりに爪楊枝
    ctx.save(); ctx.translate(4, -17); ctx.rotate(-0.15);
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-7, -6); ctx.lineTo(-3, -2); ctx.lineTo(0, -8); ctx.lineTo(3, -2); ctx.lineTo(7, -6); ctx.lineTo(6, 2); ctx.closePath(); fs(ctx, '#ffd23f', 1.6);
    ctx.fillStyle = C('#ff3d7f'); ctx.beginPath(); ctx.arc(0, -1, 1.2, 0, PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C('#e8c27a'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(26, 3); ctx.lineTo(35, 1); ctx.stroke();
  }
  ctx.restore();
  // 金チェーン
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(16, -28); ctx.quadraticCurveTo(22, -12, 17, -6); ctx.stroke();
  ctx.strokeStyle = C(acc); ctx.lineWidth = 2; ctx.setLineDash([2, 1]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(17, -6, 2.6, 0, PI * 2); fs(ctx, acc, 1.2);
  // 手前の脚
  for (const [lx, ph] of [[-12, 1], [18, -1]]) {
    ctx.beginPath(); rr(ctx, lx - 4.5 + s * 3 * ph, -10, 9, 10, 3.8); fs(ctx, col, 1.8);
    ctx.fillStyle = C('#ffffff'); ctx.beginPath(); for (let k = 0; k < 3; k++) ctx.arc(lx - 2.5 + k * 2.6 + s * 3 * ph, -0.4, 1, PI, 0); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- ドローン
function drawDrone(ctx, w, h, col, t, st, boss, acc) {
  const S = w / 44;
  const hov = Math.sin(t * 4) * 2;
  ctx.save();
  ctx.translate(0, -h * 0.5 + hov);
  ctx.scale(S, S);
  if (st === 'dead') ctx.rotate(0.5);
  else if (st === 'hurt') ctx.rotate(Math.sin(t * 40) * 0.12);
  else ctx.rotate(st === 'walk' ? 0.12 : 0);
  const body = acc || (boss ? '#2a2236' : mix('#2e3148', col, 0.22));
  // アーム
  ctx.strokeStyle = OC(); ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(18, -6); ctx.stroke();
  ctx.strokeStyle = C('#5a5f7a'); ctx.lineWidth = 2.2; ctx.stroke();
  // ローター
  for (const rx of [-18, 18]) {
    ctx.beginPath(); rr(ctx, rx - 2, -10, 4, 5, 1); fs(ctx, '#5a5f7a', 1.2);
    const ph = Math.abs(Math.sin(t * 50 + rx));
    ctx.beginPath(); ctx.ellipse(rx, -11, 11, 2.2, 0, 0, PI * 2);
    ctx.fillStyle = FL ? '#fff' : 'rgba(220,235,255,0.35)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx - 10 * ph, -11); ctx.lineTo(rx + 10 * ph, -11); ctx.stroke();
  }
  // 本体
  ctx.beginPath(); ctx.moveTo(-13, -6); ctx.quadraticCurveTo(-13, -12, -6, -12); ctx.lineTo(6, -12); ctx.quadraticCurveTo(13, -12, 13, -6);
  ctx.lineTo(10, 4); ctx.quadraticCurveTo(0, 9, -10, 4); ctx.closePath(); fs(ctx, body, 2);
  ctx.fillStyle = C(col); ctx.fillRect(-11, -5, 22, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-5, -9, 5, 1.6, 0, 0, PI * 2); ctx.fill();
  // カメラ目
  const eyeCol = st === 'attack' ? '#ff2e4d' : col;
  ctx.beginPath(); ctx.arc(3, 1, 5, 0, PI * 2); fs(ctx, '#151522', 1.6);
  if (st === 'dead') { ctx.strokeStyle = C('#ff2e4d'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(1, -1); ctx.lineTo(5, 3); ctx.moveTo(5, -1); ctx.lineTo(1, 3); ctx.stroke(); }
  else {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = FL ? '#fff' : rgba(eyeCol, 0.4); ctx.beginPath(); ctx.arc(3.5, 1, 6.5, 0, PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = C(eyeCol); ctx.beginPath(); ctx.arc(3.5, 1, 3, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4.6, -0.2, 1, 0, PI * 2); ctx.fill();
  }
  // 点滅ランプ
  if (((t * 2) | 0) % 2 === 0) { ctx.fillStyle = C('#ff2e4d'); ctx.beginPath(); ctx.arc(-9, -9.5, 1.3, 0, PI * 2); ctx.fill(); }
  // アンテナ
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(-5, -17); ctx.stroke();
  ctx.fillStyle = C(col); ctx.beginPath(); ctx.arc(-5, -17.5, 1.4, 0, PI * 2); ctx.fill();
  if (boss) {
    // カジノ仕様: 金のリング・ダイス
    ctx.strokeStyle = C('#ffd23f'); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 6, 15, 3, 0, 0, PI); ctx.stroke();
    ctx.save(); ctx.translate(-9, 9); ctx.rotate(0.3); ctx.beginPath(); rr(ctx, -2.5, -2.5, 5, 5, 1); fs(ctx, '#ffffff', 1);
    ctx.fillStyle = C('#e53935'); ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, PI * 2); ctx.fill(); ctx.restore();
  } else {
    // ぶら下がりの銃口
    ctx.beginPath(); rr(ctx, 6, 5, 7, 2.6, 1); fs(ctx, '#3a3d4a', 1.1);
  }
  ctx.restore();
}

