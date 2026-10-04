// v2 追加モンスター（独自デザイン）＋市民（drawCharacter でランダム服装）
// すべて足元中央 (0,0)・右向き基準。呼び出し側で translate / facing 反転済み。
// v4 HQ: body()/part()/metal() による2段セル影＋リムライト、ため/被弾/目回し表情、ボス第2形態。
import { shade, rgba, rr, rng, hashStr, clamp, mix } from './util.js';
import {
  FL, C, OC, fs, cuteEyes, blush, mouth, mouthFor, glow, pickCol, body, part, metal, bodyK, metalK, partK, cpart, sparkle, crownHQ, fierceEye,
  tone, shadow, light, POSE, ENV, textUp,
} from './mkit.js';
import { drawCharacter } from './character.js';

const PI = Math.PI;

/** 基準サイズ [w, h]（def.scale 指定時に使用） */
export const ART2_SIZE = {
  crab: [48, 32], jellyfish: [40, 52], seagull: [44, 40], rat: [42, 30], snake: [56, 30], mosquito: [38, 38],
  ghost: [42, 50], robot: [40, 58], alien: [36, 54], golem: [70, 80], bossAlien: [170, 170],
};
const DEF = {
  crab: ['#ff5a4a', '#3ee6d2'], jellyfish: ['#8fd8ff', '#ff9ad5'], seagull: ['#f6f8ff', '#2e5bd8'], rat: ['#9a9ab0', '#ff3d7f'],
  snake: ['#7ad04a', '#ffd23f'], mosquito: ['#5a4a7a', '#ff6fb5'], ghost: ['#e8f0ff', '#e53935'], robot: ['#c8d0e0', '#19f0ff'],
  alien: ['#7cff6a', '#b45cff'], golem: ['#8a8296', '#ff8a1f'], bossAlien: ['#7cff6a', '#ff4fd8'],
};
// 白・ほぼ白が基調の種は tone で灰色化しないよう素通し
const KEEP_LIGHT = { seagull: 1, ghost: 1 };

export function drawMonster2(ctx, art, w, h, color, accent, t, st, boss, e) {
  const d = DEF[art];
  if (!d) return false;
  const raw = pickCol(color, d[0]);
  const col = KEEP_LIGHT[art] ? raw : tone(raw);
  const acc = accent || d[1];
  const [cw, ch] = ART2_SIZE[art];
  ctx.save();
  ctx.scale(w / cw, h / ch);
  if (st === 'dead' && art !== 'bossAlien') ctx.scale(1, 0.9);
  switch (art) {
    case 'crab': crab(ctx, col, acc, t, st, boss); break;
    case 'jellyfish': jelly(ctx, col, acc, t, st, boss); break;
    case 'seagull': gull(ctx, col, acc, t, st, boss); break;
    case 'rat': rat(ctx, col, acc, t, st, boss); break;
    case 'snake': snake(ctx, col, acc, t, st, boss); break;
    case 'mosquito': mosquito(ctx, col, acc, t, st, boss); break;
    case 'ghost': ghost(ctx, col, acc, t, st, boss); break;
    case 'robot': robot(ctx, col, acc, t, st, boss); break;
    case 'alien': alien(ctx, col, acc, t, st, boss); break;
    case 'golem': golem(ctx, col, acc, t, st, boss); break;
    case 'bossAlien': bossAlien(ctx, col, acc, t, st, e); break;
  }
  ctx.restore();
  return true;
}

const isWalk = (st) => (st === 'walk' || st === 'attack') && !POSE.windup;
function crown(ctx, x, y, s, gem, t = 0) { crownHQ(ctx, x, y, s, gem || '#ff3d7f', t, -0.08); }
// 白目つきの大きな丸目（横顔・柄の先など）
function ballEye(ctx, x, y, r, st, t, look = 0.3) {
  if (st === 'hurt' || st === 'dead') { cuteEyes(ctx, x, y, r * 0.72, 0.01, '#000', st, t); return; }
  const blink = !POSE.windup && ((t + x * 0.013) % 3.7) < 0.12;
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); part(ctx, '#ffffff', x - r, y - r, r * 2, r * 2, Math.max(1.3, r * 0.4));
  if (blink) { ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.lineTo(x + r * 0.7, y); ctx.stroke(); return; }
  const sq = POSE.windup || st === 'attack' ? 0.75 : 1;
  ctx.fillStyle = C('#2a1430'); ctx.beginPath(); ctx.ellipse(x + r * look, y + r * 0.1, r * 0.58, r * 0.7 * sq, 0, 0, PI * 2); ctx.fill();
  if (!FL) { ctx.fillStyle = 'rgba(120,90,200,0.6)'; ctx.beginPath(); ctx.ellipse(x + r * look, y + r * 0.45, r * 0.4, r * 0.22, 0, 0, PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * look + r * 0.22, y - r * 0.25, r * 0.26, 0, PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * look - r * 0.22, y + r * 0.34, r * 0.11, 0, PI * 2); ctx.fill();
  if (POSE.windup || st === 'attack') { // 怒りまぶた
    ctx.fillStyle = C(OC()); ctx.beginPath(); ctx.moveTo(x - r * 1.1, y - r * 1.1); ctx.lineTo(x + r * 1.1, y - r * 0.2); ctx.lineTo(x + r * 1.1, y - r * 1.2); ctx.closePath(); ctx.fill();
  }
}

// ================================================================ カニ（バケットハットのサーファー蟹）
function crab(ctx, col, acc, t, st, boss) {
  const wk = isWalk(st);
  const wind = POSE.windup;
  const sp = st === 'attack' ? 18 : 12;
  const ph = wk ? Math.sin(t * sp) : 0;
  const bob = wk ? Math.abs(Math.cos(t * sp)) * 1.2 : wind ? -1.5 : Math.sin(t * 3) * 0.5;
  const dark = shadow(col, 0.16);
  // 脚（左右3本ずつ・関節の玉）
  ctx.lineCap = 'round';
  // 6本の脚を1パスにまとめて 線→色→ハイライト の3回で描く
  ctx.beginPath();
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x0 = side * (9 + i * 3), y0 = -9 + i;
    const kx = side * (17 + i * 3), ky = -12 + i * 2 + (i % 2 ? ph : -ph) * 2 + (wind ? 2 : 0);
    const fx = side * (19 + i * 3.4) + (i % 2 ? ph : -ph) * 2, fy = -0.5;
    ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
  }
  ctx.lineWidth = 4.2; ctx.strokeStyle = OC(); ctx.stroke();
  ctx.lineWidth = 2.1; ctx.strokeStyle = C(dark); ctx.stroke();
  ctx.translate(0, -bob);
  // 後ろの小さいハサミ
  claw(ctx, -17, -18, 0.75, shadow(col, 0.1), st, t, -1);
  // 胴（甲羅）
  const shell = (c) => c.ellipse(0, -13, 18.5, 11.5, 0, 0, PI * 2);
  bodyK(ctx, 'shell', col, -18.5, -24.5, 37, 23, shell, {
    lw: 2.3, path: shell,
    inner: (c) => {
      c.fillStyle = C(light(col, 0.45));
      for (const [sx, sy, r] of [[-10, -18, 2.4], [-4, -21, 1.6], [9, -19, 2], [13, -14, 1.3]]) { c.beginPath(); c.arc(sx, sy, r, 0, PI * 2); c.fill(); }
      c.strokeStyle = C(rgba(shadow(col, 0.4), 0.5)); c.lineWidth = 1; c.beginPath(); c.moveTo(-15, -9); c.quadraticCurveTo(0, -4, 15, -9); c.stroke();
    },
  });
  // 顔
  blush(ctx, -8.5, -10, 2.8); blush(ctx, 9.5, -10, 2.8);
  mouth(ctx, 1, -11, 2.4, mouthFor(st, 'cat'));
  // 目の柄（二次運動で遅れて揺れる）
  const sw = Math.sin(t * 2.4) * 1.2, sw2 = Math.sin(t * 2.4 - 0.9) * 1.4;
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(-4, -21); ctx.quadraticCurveTo(-4 + sw * 0.4, -26, -5 + sw2, -29); ctx.moveTo(5, -21); ctx.quadraticCurveTo(5 + sw * 0.4, -26, 6 + sw2, -30); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = 1.8; ctx.stroke();
  // バケットハット
  ctx.save(); ctx.translate(0.5, -22.5); ctx.rotate(-0.06 + (st === 'hurt' ? -0.3 : 0));
  cpart(ctx, 'crabHat', -10.5, -7.2, 21, 10, 1.5, (c) => {
    c.beginPath(); c.ellipse(0, 0, 10, 2.6, 0, 0, PI * 2); part(c, shade(acc, -0.15), -10, -2.6, 20, 5.2, 1.4);
    c.beginPath(); c.moveTo(-6, 0); c.quadraticCurveTo(-6, -6.5, 0, -6.6); c.quadraticCurveTo(6, -6.5, 6, 0); c.closePath(); part(c, acc, -6, -6.6, 12, 6.6, 1.4);
    c.fillStyle = C('#ffffff'); c.fillRect(-6, -2.2, 12, 1.5);
  }, acc);
  ctx.restore();
  ballEye(ctx, -5 + sw2, -31, 3.9, st, t, 0.3);
  ballEye(ctx, 6 + sw2, -32, 4.1, st, t, 0.3);
  if (boss) crown(ctx, 0.5, -37, 5, acc, t);
  // 前の大きいハサミ（ため=振りかぶる）
  claw(ctx, 20, -19 - (wind ? 6 : 0), 1.2, col, st, t, 1);
}
function claw(ctx, x, y, s, col, st, t, side) {
  const wind = POSE.windup;
  const open = wind ? 0.9 : st === 'attack' ? 0.35 + Math.abs(Math.sin(t * 16)) * 0.5 : 0.18 + Math.max(0, Math.sin(t * 2.2)) * 0.18;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); if (wind) ctx.rotate(-0.4 * side);
  // 腕
  ctx.strokeStyle = OC(); ctx.lineWidth = 5.2; ctx.beginPath(); ctx.moveTo(-side * 6, 7); ctx.quadraticCurveTo(-side * 3, 4, 0, 2); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = 2.8; ctx.stroke();
  // 上爪
  ctx.save(); ctx.rotate(-open * side);
  bodyK(ctx, side > 0 ? 'clawU' : 'clawUb', col, Math.min(-side * 2, side * 11), -10, 13, 11, (c) => { c.moveTo(-side * 2, 0); c.bezierCurveTo(-side * 2, -10, side * 10, -11, side * 11, -2); c.quadraticCurveTo(side * 4, -3, -side * 2, 1); c.closePath(); }, { lw: 1.9 });
  ctx.restore();
  // 下爪
  ctx.save(); ctx.rotate(open * side * 0.6);
  partK(ctx, side > 0 ? 'clawL' : 'clawLb', shadow(col, 0.12), Math.min(-side * 2, side * 8.5), 0, 10.5, 6, (c) => { c.moveTo(-side * 2, 1); c.quadraticCurveTo(side * 4, 6.5, side * 8.5, 2); c.quadraticCurveTo(side * 4, 1, -side * 1, 0); c.closePath(); }, 1.6);
  ctx.restore();
  if (wind) sparkle(ctx, side * 9, -6, 3, '#fff', 0.9);
  ctx.restore();
}

// ================================================================ クラゲ（ネオン発光・ふわふわ）
function jelly(ctx, col, acc, t, st, boss) {
  const wind = POSE.windup;
  const pulse = wind ? 0.6 + Math.sin(t * 30) * 0.1 : Math.sin(t * 4);
  const bob = Math.sin(t * 2) * 3 - (st === 'attack' ? 4 : 0) + (wind ? 3 : 0);
  ctx.translate(0, bob);
  const sx = 1 + pulse * 0.07, sy = 1 - pulse * 0.06;
  // 触手（二次運動: 傘の脈動に遅れて波打つ）
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x0 = -10 + i * 5;
    const wv = Math.sin(t * 3 + i * 1.3) * 3, wv2 = Math.sin(t * 3 + i * 1.3 - 1.4) * 3.6;
    ctx.beginPath(); ctx.moveTo(x0, -26); ctx.bezierCurveTo(x0 + wv, -18, x0 - wv2, -10, x0 + wv2 * 0.7, -1 - (i % 2) * 3);
    ctx.strokeStyle = OC(); ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = C(i % 2 ? light(col, 0.4) : acc); ctx.lineWidth = 1.7; ctx.stroke();
    if (!FL && (i % 2 === 0)) glow(ctx, x0 + wv2 * 0.7, -1, 4, acc, 0.6 + ENV.night * 0.3);
  }
  // リボン状の口腕
  ctx.globalAlpha *= 0.85;
  for (const side of [-1, 1]) {
    const wv = Math.sin(t * 2.4 + side) * 2.5;
    ctx.beginPath(); ctx.moveTo(side * 4, -27);
    ctx.bezierCurveTo(side * 9 + wv, -20, side * 2 - wv, -14, side * 7 + wv, -8);
    ctx.lineTo(side * 4 + wv, -9);
    ctx.bezierCurveTo(side * -1 - wv, -15, side * 6 + wv, -21, side * 1, -27); ctx.closePath();
    fs(ctx, rgba(acc, 0.8), 1.3);
  }
  ctx.globalAlpha /= 0.85;
  // 傘
  ctx.save(); ctx.translate(0, -30); ctx.scale(sx, sy);
  glow(ctx, 0, -6, 30, col, 0.35 + ENV.night * 0.25 + wind * 0.3);
  const bell = (c) => {
    c.moveTo(-17, 2); c.bezierCurveTo(-18, -14, -9, -21.5, 0, -21.5); c.bezierCurveTo(9, -21.5, 18, -14, 17, 2);
    for (let i = 0; i < 6; i++) { const x0 = 17 - i * (34 / 6), x1 = 17 - (i + 1) * (34 / 6); c.quadraticCurveTo((x0 + x1) / 2, 6.5, x1, 2); }
    c.closePath();
  };
  if (!FL) { ctx.save(); ctx.globalAlpha *= 0.9; }
  bodyK(ctx, 'bell' + acc, col, -17, -21.5, 34, 26, bell, {
    lw: 2.1, path: bell,
    inner: (c) => {
      if (FL) return;
      c.fillStyle = rgba(light(col, 0.5), 0.55); c.beginPath(); c.ellipse(0, -9, 11, 8, 0, 0, PI * 2); c.fill(); // 内側の傘
      c.fillStyle = rgba(acc, 0.55);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-9 + i * 6, -14 + (i % 2) * 2, 2, 0, PI * 2); c.fill(); }
      c.fillStyle = rgba(acc, 0.5); c.beginPath(); c.ellipse(0, 3, 17, 3.5, 0, 0, PI * 2); c.fill();
    },
  });
  if (!FL) ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-9, -15, 4, 2, -0.6, 0, PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-4, -18.5, 1.2, 0, PI * 2); ctx.fill();
  // 顔
  cuteEyes(ctx, 1.5, -6.5, 2.8, 4.8, shadow(col, 0.45), st, t, st === 'idle' && ((t * 0.3) % 2 < 1));
  blush(ctx, -6.5, -2.2, 2.3); blush(ctx, 9.5, -2.2, 2.3);
  mouth(ctx, 1.5, -2.2, 1.6, mouthFor(st, 'cat'));
  if (boss) crown(ctx, 0, -20.5, 6, acc, t);
  ctx.restore();
  // キラキラ
  if (!FL) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ffffff', 0.8);
    for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.fillRect(-14 + i * 12 + Math.sin(t + i) * 3, -30 - k * 26, 2, 2); }
    ctx.restore();
  }
  if (wind && !FL) { // 放電の予兆
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(light(acc, 0.5), 0.9); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < 2; k++) { const a = t * 13 + k * 3; let px = Math.cos(a) * 18, py = -30 + Math.sin(a) * 14; ctx.moveTo(px, py); for (let j = 0; j < 3; j++) { px += Math.cos(a + j) * 5; py += Math.sin(a * 2 + j) * 5; ctx.lineTo(px, py); } }
    ctx.stroke(); ctx.restore();
  }
}

// ================================================================ カモメ（セーラー帽のポテト泥棒）
function gull(ctx, col, acc, t, st, boss) {
  const wind = POSE.windup;
  const flap = st === 'dead' ? 0.3 : wind ? -0.9 + Math.sin(t * 30) * 0.08 : Math.sin(t * (st === 'attack' ? 18 : 11));
  const bob = Math.sin(t * 3) * 2 - flap * 1.5;
  ctx.translate(0, bob);
  if (wind) ctx.rotate(-0.12);
  const wing = mix(col, '#8a9ab8', 0.45);
  // 奥の羽
  wingShape(ctx, -1, -26, Math.sin(t * 11 - 0.4) * (wind || st === 'dead' ? 0 : 1) + (wind ? -0.9 : 0), shadow(wing, 0.2), true);
  // 脚
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(-2, -12); ctx.lineTo(-4, -4); ctx.moveTo(3, -12); ctx.lineTo(2, -4); ctx.stroke();
  ctx.strokeStyle = C('#ffaa3c'); ctx.lineWidth = 1.3; ctx.stroke();
  // 尾羽
  ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(-22, -24); ctx.lineTo(-20, -19); ctx.lineTo(-23, -15); ctx.lineTo(-12, -15); ctx.closePath(); part(ctx, shadow(wing, 0.25), -23, -24, 11, 9, 1.6);
  // 胴
  bodyK(ctx, 'gullB', col, -14, -29, 28, 20, (c) => { c.ellipse(0, -19, 14, 10, -0.1, 0, PI * 2); }, { lw: 2.1, gloss: false });
  // 頭
  bodyK(ctx, 'gullH', col, 0.6, -38.4, 18.8, 18.8, (c) => { c.arc(10, -29, 9.4, 0, PI * 2); }, { lw: 2.1 });
  // くちばし（ポテトをくわえる）
  const op = st === 'attack' && !wind ? 0.25 + Math.abs(Math.sin(t * 14)) * 0.2 : wind ? 0.35 : 0.05;
  if (st !== 'attack' && st !== 'hurt') {
    ctx.save(); ctx.translate(20, -27); ctx.rotate(0.35 + Math.sin(t * 3) * 0.05);
    ctx.beginPath(); rr(ctx, -2, -1.5, 12, 3.2, 1); part(ctx, '#ffd23f', -2, -1.5, 12, 3.2, 1); ctx.restore();
  }
  ctx.save(); ctx.translate(17, -28);
  ctx.save(); ctx.rotate(-op); ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.quadraticCurveTo(7, -3, 10.5, 0); ctx.lineTo(0, 0.5); ctx.closePath(); part(ctx, '#ffb43c', 0, -3, 10.5, 3.5, 1.4); ctx.restore();
  ctx.save(); ctx.rotate(op); ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(8, 0.8); ctx.quadraticCurveTo(4, 3.5, 0, 3); ctx.closePath(); part(ctx, '#ff9a2a', 0, 0.5, 8, 3, 1.4);
  ctx.fillStyle = C('#e53935'); ctx.beginPath(); ctx.arc(6, 1.4, 0.9, 0, PI * 2); ctx.fill(); ctx.restore();
  ctx.restore();
  // 目（ちょいワル眉）
  ballEye(ctx, 12, -30, 3.5, st, t, 0.35);
  if (st !== 'hurt' && st !== 'dead') { ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(8, -36); ctx.lineTo(15.5, -33.8 + (wind ? 1.5 : 0)); ctx.stroke(); }
  blush(ctx, 12, -24.5, 2.1);
  // セーラー帽
  ctx.save(); ctx.translate(8, -37.5); ctx.rotate(-0.2 + (st === 'hurt' ? -0.4 : 0) + Math.sin(t * 3 - 1) * 0.03);
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 2.4, 0, 0, PI * 2); part(ctx, '#ffffff', -8, -2.4, 16, 4.8, 1.3);
  ctx.beginPath(); ctx.moveTo(-5.5, 0); ctx.quadraticCurveTo(-5, -5.4, 0, -5.6); ctx.quadraticCurveTo(5, -5.4, 5.5, 0); ctx.closePath(); part(ctx, '#ffffff', -5.5, -5.6, 11, 5.6, 1.3);
  ctx.fillStyle = C(acc); ctx.fillRect(-5.4, -1.8, 10.8, 1.6);
  ctx.restore();
  if (boss) crown(ctx, 9, -41, 4.5, acc, t);
  // 手前の羽
  wingShape(ctx, -2, -22, flap, wing, false);
}
function wingShape(ctx, x, y, flap, col, back) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5 - flap * 0.7 + (back ? -0.25 : 0));
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-6, -12, -20, -14.5); ctx.lineTo(-17, -10); ctx.lineTo(-22.5, -9); ctx.lineTo(-17, -6); ctx.lineTo(-20.5, -3); ctx.quadraticCurveTo(-8, 2, 0, 4); ctx.closePath();
  part(ctx, col, -22, -14, 22, 18, 1.8);
  ctx.fillStyle = C(shadow(col, 0.45)); ctx.beginPath(); ctx.moveTo(-17, -10); ctx.lineTo(-22.5, -9); ctx.lineTo(-17, -6); ctx.lineTo(-20.5, -3); ctx.lineTo(-15, -4); ctx.closePath(); ctx.fill();
  if (!FL) { ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3, -1); ctx.quadraticCurveTo(-8, -9, -18, -12); ctx.stroke(); }
  ctx.restore();
}

// ================================================================ ネズミ（後ろかぶりキャップ・金歯 / ボス: 地下鉄の王）
function rat(ctx, col, acc, t, st, boss) {
  const wk = isWalk(st);
  const wind = POSE.windup, rage = POSE.rage;
  const sp = st === 'attack' ? 20 : 14;
  const ph = wk ? Math.sin(t * sp) : 0;
  const bob = wk ? Math.abs(Math.cos(t * sp)) * 1.5 : Math.sin(t * 3) * 0.4;
  const pink = '#ffa6c0';
  if (wind) { ctx.translate(-1.5, 0); ctx.rotate(-0.1); }
  // 王のマント（後ろ）
  if (boss) {
    const fl = Math.sin(t * 3) * 1.2 + (wk ? Math.sin(t * sp) * 1 : 0), fl2 = Math.sin(t * 3 - 1) * 1.6;
    ctx.beginPath(); ctx.moveTo(6, -22); ctx.quadraticCurveTo(-8, -24, -19 + fl, -14); ctx.quadraticCurveTo(-24 + fl2, -5, -21 + fl2, 0); ctx.lineTo(-4, -2); ctx.quadraticCurveTo(4, -10, 8, -16); ctx.closePath();
    body(ctx, rage ? '#7a0f2a' : '#5a1a8a', -24, -24, 32, 24, { lw: 1.8, gloss: false });
    ctx.strokeStyle = C('#ffd23f'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-21 + fl2, 0); ctx.lineTo(-4, -2); ctx.stroke();
  }
  // 尻尾（二次運動）
  const tw = Math.sin(t * 3) * 3, tw2 = Math.sin(t * 3 - 1.1) * 4;
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.8; ctx.beginPath(); ctx.moveTo(-14, -8); ctx.bezierCurveTo(-26, -6 + tw * 0.3, -28, -18 + tw, -20 + tw2 * 0.4, -21 + tw2); ctx.stroke();
  ctx.strokeStyle = C(pink); ctx.lineWidth = 1.9; ctx.stroke();
  // 足
  for (const [fx, p] of [[-8, 1], [8, -1]]) { ctx.beginPath(); ctx.ellipse(fx + ph * 3 * p, -2, 4.2, 2.5, 0, 0, PI * 2); part(ctx, pink, fx - 4, -4.5, 8.4, 5, 1.4); }
  if (boss) {
    // 王笏（パイプレンチ＋宝石）。ため=振り上げる
    const sa = wind ? 1.0 + Math.sin(t * 30) * 0.05 : st === 'attack' ? 0.6 + Math.sin(t * 16) * 0.7 : -0.35 + Math.sin(t * 2) * 0.05;
    ctx.save(); ctx.translate(-5, -9); ctx.rotate(sa);
    ctx.beginPath(); rr(ctx, -1.2, -20, 2.4, 22, 1); metal(ctx, '#b0b4c8', -1.2, -20, 2.4, 22, 1.2, false);
    ctx.beginPath(); ctx.arc(0, -21.5, 3.2, 0, PI * 2); fs(ctx, rage ? '#ff2e4d' : '#3ee6d2', 1.3);
    glow(ctx, 0, -21.5, 8, rage ? '#ff2e4d' : '#3ee6d2', 0.6 + wind * 0.4);
    if (wind) sparkle(ctx, 0, -21.5, 6, '#fff', 1);
    ctx.restore();
  }
  ctx.translate(0, -bob);
  // 胴
  const bp = (c) => c.ellipse(-2, -11, 15.5, 10.5, 0, 0, PI * 2);
  bodyK(ctx, 'bp', col, -17.5, -21.5, 31, 21, bp, {
    lw: 2.3, path: bp,
    inner: (c) => {
      c.fillStyle = C(light(col, 0.45)); c.beginPath(); c.ellipse(2, -5.5, 9.5, 5, 0, 0, PI * 2); c.fill();
      if (!FL) { c.strokeStyle = rgba(shadow(col, 0.35), 0.6); c.lineWidth = 0.9; c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(-14 + i * 3, -16 + i * 0.5); c.lineTo(-11 + i * 3, -14 + i * 0.5); } c.stroke(); }
    },
  });
  // 耳（二次運動で少し遅れる）
  const ew = Math.sin(t * 3 - 0.7) * 0.08;
  for (const [ex, ey, r] of [[5, -25, 6.2], [15, -26, 6.7]]) {
    ctx.save(); ctx.translate(ex, ey + 4); ctx.rotate(ew); ctx.translate(-ex, -ey - 4);
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, PI * 2); part(ctx, col, ex - r, ey - r, r * 2, r * 2, 1.9);
    ctx.fillStyle = C(pink); ctx.beginPath(); ctx.arc(ex + 0.5, ey + 0.5, r * 0.6, 0, PI * 2); ctx.fill();
    ctx.restore();
  }
  // 頭
  bodyK(ctx, 'ratH', col, 2, -28, 23.5, 18, (c) => { c.moveTo(2, -20); c.bezierCurveTo(3, -28.5, 18, -28.5, 20, -18); c.quadraticCurveTo(25.5, -14, 22, -10.5); c.quadraticCurveTo(12, -8, 4, -11); c.closePath(); }, { lw: 2.1 });
  ctx.beginPath(); ctx.arc(23, -13.5, 2.5, 0, PI * 2); part(ctx, '#ff6f91', 20.5, -16, 5, 5, 1.2);
  // ひげ
  ctx.strokeStyle = C(rgba('#2a1430', 0.6)); ctx.lineWidth = 0.8; ctx.beginPath();
  ctx.moveTo(19, -13); ctx.lineTo(27.5, -15.5 + Math.sin(t * 5) * 0.5); ctx.moveTo(19, -12); ctx.lineTo(27.5, -10.5 + Math.sin(t * 5 + 1) * 0.5); ctx.stroke();
  // 目
  if (boss && (rage || wind) && st !== 'hurt' && st !== 'dead') {
    fierceEye(ctx, 11, -19.5, 2.1, '#ff3a3a', st, t, true, -0.1);
    fierceEye(ctx, 16.4, -19.5, 2.1, '#ff3a3a', st, t, true, 0.1);
  } else {
    cuteEyes(ctx, 13.5, -19, 2.6, 3.3, shadow(acc, 0.25), st, t);
    if (st !== 'hurt' && st !== 'dead' && !wind) { ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(8, -24); ctx.lineTo(12.5, -23); ctx.moveTo(15, -23); ctx.lineTo(19, -24); ctx.stroke(); }
  }
  blush(ctx, 18.5, -14.6, 1.9);
  // 口と金歯（ボス=出っ歯）
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(15, -11.5); ctx.quadraticCurveTo(17, -10, 19.5, -11.5); ctx.stroke();
  if (boss) { ctx.beginPath(); rr(ctx, 16, -11.3, 3.4, 3.2, 0.6); part(ctx, '#ffd23f', 16, -11.3, 3.4, 3.2, 0.9); }
  else { ctx.fillStyle = C('#ffd23f'); ctx.fillRect(16.4, -11.2, 1.6, 1.8); }
  if (st === 'attack' && !wind) mouth(ctx, 17.5, -11.2, 1.6, 'open');
  // 後ろかぶりキャップ（ボスは王冠のみ）
  if (!boss) {
    ctx.save(); ctx.translate(9, -25); ctx.rotate(-0.15 + (st === 'hurt' ? -0.3 : 0));
    ctx.beginPath(); ctx.moveTo(-8, 1); ctx.bezierCurveTo(-8, -8.5, 8, -8.5, 8, 1); ctx.closePath(); part(ctx, acc, -8, -7.5, 16, 8.5, 1.6);
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-15, -1, -15, 2.5); ctx.quadraticCurveTo(-10, 2.5, -6, 2); ctx.closePath(); part(ctx, shadow(acc, 0.3), -15, -1, 9, 3.5, 1.3);
    ctx.fillStyle = C('#ffffff'); ctx.beginPath(); ctx.arc(0, -6.5, 1.1, 0, PI * 2); ctx.fill();
    ctx.restore();
  } else {
    crownHQ(ctx, 10, -29, 5.6, '#3ee6d2', t, rage ? -0.4 : -0.12);
  }
  // 手
  ctx.beginPath(); ctx.arc(10 + ph * 2, -6, 2.5, 0, PI * 2); part(ctx, pink, 7.5, -8.5, 5, 5, 1.2);
  // 第2形態: 逆立つ毛・怒りの湯気
  if (boss && rage && !FL) {
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const x = -14 + i * 4; ctx.moveTo(x, -19 + Math.abs(i - 2) * 0.6); ctx.lineTo(x - 1 + Math.sin(t * 20 + i) * 0.4, -24 + Math.abs(i - 2)); }
    ctx.stroke();
    for (let i = 0; i < 3; i++) { const k = (t + i / 3) % 1; ctx.fillStyle = `rgba(255,200,220,${0.4 * (1 - k)})`; ctx.beginPath(); ctx.arc(4 + i * 6, -32 - k * 12, 1.4 + k * 2.4, 0, PI * 2); ctx.fill(); }
  }
}

// ================================================================ ヘビ（ぐねぐね・鱗の陰影・発光する目）
function snake(ctx, col, acc, t, st, boss) {
  const wk = isWalk(st);
  const wind = POSE.windup;
  const ph = t * (wk ? 8 : 2.5);
  const strike = st === 'attack' && !wind ? Math.max(0, Math.sin(t * 8)) * 7 : wind ? -4 : 0;
  const rise = wind ? 6 : 0;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    const x = -26 + k * 36;
    const y = -5 - Math.sin(ph - k * 5) * 3 * (1 - k * 0.4) - (k > 0.75 ? (k - 0.75) * (50 + rise * 4) : 0);
    pts.push([x + (k > 0.75 ? strike * (k - 0.75) * 4 : 0), y]);
  }
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = OC(); ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = C(shadow(col, 0.28)); ctx.lineWidth = 7.6; ctx.stroke();
  ctx.translate(0, -0.9); ctx.strokeStyle = C(col); ctx.lineWidth = 5.6; ctx.stroke(); ctx.translate(0, 0.9);
  // 鱗模様（ひし形の帯）＋ストライプ
  ctx.lineCap = 'butt'; ctx.setLineDash([3, 6]); ctx.lineDashOffset = -ph * 2; ctx.strokeStyle = C(acc); ctx.lineWidth = 6.8; ctx.stroke(); ctx.setLineDash([]);
  if (!FL) { ctx.setLineDash([1.2, 2.2]); ctx.lineDashOffset = -ph * 2; ctx.strokeStyle = rgba(shadow(col, 0.4), 0.6); ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]); }
  ctx.lineCap = 'round';
  path(); ctx.strokeStyle = C(rgba('#ffffff', 0.45)); ctx.lineWidth = 1.5; ctx.translate(0, -2.4); ctx.stroke(); ctx.translate(0, 2.4);
  // 頭
  const [hx0, hy0] = pts[pts.length - 1];
  const hx = hx0 + 4, hy = hy0 - 4;
  if (st === 'attack' || wind) { // フード（コブラ風）
    const hs = wind ? 1.1 : 1;
    ctx.beginPath(); ctx.moveTo(hx - 3, hy - 4); ctx.bezierCurveTo(hx - 13 * hs, hy - 4, hx - 12 * hs, hy + 12, hx - 5, hy + 15); ctx.bezierCurveTo(hx, hy + 12, hx + 1, hy + 4, hx - 3, hy - 4); ctx.closePath();
    body(ctx, shadow(col, 0.12), hx - 13, hy - 4, 14, 19, { lw: 1.9, gloss: false });
    ctx.fillStyle = C(acc); ctx.beginPath(); ctx.ellipse(hx - 5.5, hy + 5, 2.6, 5, 0.1, 0, PI * 2); ctx.fill();
    ctx.fillStyle = C(shadow(acc, 0.45)); ctx.beginPath(); ctx.ellipse(hx - 5.5, hy + 3, 1.1, 1.7, 0, 0, PI * 2); ctx.ellipse(hx - 5.3, hy + 7.5, 1.1, 1.7, 0, 0, PI * 2); ctx.fill();
  }
  // 頭はくさび形でシャープに（頭・下あご・頭頂プレートは1枚のスプライト）
  ctx.translate(hx, hy);
  cpart(ctx, 'snHead', -10, -8.5, 22, 16, 2, (c) => {
    c.beginPath(); c.moveTo(-9, 1); c.quadraticCurveTo(-8, -8, 2, -7.5); c.quadraticCurveTo(10, -6, 11, 1); c.quadraticCurveTo(9, 6.5, 0, 6.5); c.quadraticCurveTo(-8, 6, -9, 1); c.closePath();
    body(c, col, -9, -7.5, 20, 14, { lw: 2.1 });
    c.fillStyle = C(light(col, 0.4)); c.beginPath(); c.ellipse(2, 3.8, 6.5, 2.4, 0.1, 0, PI * 2); c.fill();
    if (!FL) { c.strokeStyle = rgba(shadow(col, 0.4), 0.7); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-5, -5); c.lineTo(-1, -3); c.lineTo(4, -5); c.stroke(); }
  }, col);
  ctx.translate(-hx, -hy);
  // 舌
  if (((t * 1.3) % 1) < 0.35 || st === 'attack') {
    const tf = Math.sin(t * 40) * 0.8;
    ctx.strokeStyle = C('#ff2e6a'); ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(hx + 10, hy + 2); ctx.lineTo(hx + 16, hy + 2.5 + tf); ctx.lineTo(hx + 19, hy + tf); ctx.moveTo(hx + 16, hy + 2.5 + tf); ctx.lineTo(hx + 19, hy + 4.5 + tf); ctx.stroke();
  }
  // 目: 通常は大きめのかわいい目、ため/攻撃で縦長瞳孔の発光目
  if (wind || st === 'attack' || boss) fierceEye(ctx, hx + 3, hy - 2.5, 2.6, '#ffe25a', st, t, true, -0.15);
  else cuteEyes(ctx, hx + 1.5, hy - 2.2, 2.5, 3.4, shadow(acc, 0.3), st, t);
  if (!wind && st !== 'attack') { blush(ctx, hx - 4, hy + 2.2, 1.8); blush(ctx, hx + 7, hy + 2.2, 1.6); }
  if (boss) crown(ctx, hx, hy - 7.5, 5, acc, t);
}

// ================================================================ 蚊（ふわもこ・ストロー / シャープな発光複眼）
function mosquito(ctx, col, acc, t, st, boss) {
  const wind = POSE.windup;
  const bob = Math.sin(t * 5) * 2.5, bob2 = Math.sin(t * 5 - 1);
  ctx.translate(0, bob);
  if (wind) { ctx.translate(-3, -2); ctx.rotate(-0.25); }
  else if (st === 'attack') ctx.rotate(0.15);
  // 脚（二次運動）
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i < 3; i++) { const x = -3 + i * 4, s = Math.sin(t * 4 + i) * 1.5 + bob2; ctx.moveTo(x, -18); ctx.quadraticCurveTo(x - 3, -12, x - 5 + s, -4); ctx.lineTo(x - 7 + s, -2.5); }
  ctx.stroke();
  // お腹（節＋発光ストライプ）
  const ab = (c) => c.ellipse(-12, -20, 11, 6.5, 0.38, 0, PI * 2);
  bodyK(ctx, 'ab' + acc, col, -23, -27, 22, 13, ab, {
    lw: 1.9, path: ab,
    inner: (c) => {
      c.fillStyle = C(acc);
      for (let k = 0; k < 4; k++) { c.beginPath(); c.save(); c.translate(-20 + k * 5, -20); c.rotate(0.38); c.fillRect(-1.1, -10, 2.2, 20); c.restore(); }
      if (!FL) glow(c, -14, -20, 12, acc, 0.2 + ENV.night * 0.3);
    },
  });
  // 羽（高速ぶれ・虹色）
  if (!FL) {
    for (let i = 0; i < 2; i++) {
      const a = -0.9 + Math.sin(t * 60 + i) * 0.35 - i * 0.4;
      ctx.save(); ctx.translate(-1, -28); ctx.rotate(a);
      cpart(ctx, 'mosWing', -23, -6, 24, 10, 1, (c) => {
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-8, -6, -22, -2); c.quadraticCurveTo(-10, 5, 0, 0); c.closePath();
        const g = c.createLinearGradient(-22, 0, 0, 0); g.addColorStop(0, 'rgba(180,140,255,0.45)'); g.addColorStop(0.5, 'rgba(140,240,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0.65)');
        c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(42,20,48,0.7)'; c.lineWidth = 1.1; c.stroke();
        c.strokeStyle = 'rgba(42,20,48,0.35)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-2, 0); c.lineTo(-18, -1.5); c.stroke();
      });
      ctx.restore();
    }
  }
  // 胸
  bodyK(ctx, 'mosT', light(col, 0.15), -6.2, -30.2, 14.4, 14.4, (c) => { c.arc(1, -23, 7.2, 0, PI * 2); }, { lw: 1.9, gloss: false });
  ctx.fillStyle = C(rgba('#ffffff', 0.4)); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-2 + k * 2, -27 + (k % 2) * 2, 1, 0, PI * 2); ctx.fill(); }
  // ストロー（ため=引いて構える / 攻撃=突き出す）
  const ext = st === 'attack' && !wind ? 6 + Math.sin(t * 20) * 2 : wind ? -2 : 0;
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(15, -21); ctx.lineTo(25 + ext, -14 + ext * 0.4); ctx.stroke();
  ctx.strokeStyle = C('#ffb0d0'); ctx.lineWidth = 1.1; ctx.stroke();
  if (wind && !FL) sparkle(ctx, 24, -14.5, 3.5, '#fff', 1);
  // 頭
  bodyK(ctx, 'mosH', col, 2.4, -33.6, 15.2, 15.2, (c) => { c.arc(10, -26, 7.6, 0, PI * 2); }, { lw: 1.9 });
  // 触角
  const aw = Math.sin(t * 6 - 0.5) * 1.2;
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(9, -33); ctx.quadraticCurveTo(8, -39, 4 + aw, -40.5); ctx.moveTo(12, -33); ctx.quadraticCurveTo(14, -39, 17 + aw, -40.5); ctx.stroke();
  ctx.fillStyle = C(acc); ctx.beginPath(); ctx.arc(4 + aw, -40.5, 1.6, 0, PI * 2); ctx.arc(17 + aw, -40.5, 1.6, 0, PI * 2); ctx.fill();
  // 大きな複眼（発光・六角の格子）
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, 11.5, -26, 2.6, 2.6, '#000', st, t);
  else {
    glow(ctx, 12.5, -26.5, 9, acc, 0.45 + ENV.night * 0.3 + wind * 0.3);
    ctx.beginPath(); ctx.ellipse(12.5, -26.5, 4.6, 5, -0.1, 0, PI * 2);
    if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -31.5, 0, -21.5); g.addColorStop(0, '#2a1040'); g.addColorStop(0.6, shadow(acc, 0.1)); g.addColorStop(1, light(acc, 0.5)); ctx.fillStyle = g; }
    ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.stroke();
    if (!FL) { ctx.strokeStyle = rgba('#ffffff', 0.18); ctx.lineWidth = 0.5; ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(8.5, -26.5 + k * 1.8); ctx.lineTo(16.5, -26.5 + k * 1.8); } ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(14, -28.6, 1.6, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(11.2, -24.8, 0.75, 0, PI * 2); ctx.fill();
    if (wind || st === 'attack') { ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, -32); ctx.lineTo(16.5, -30); ctx.stroke(); }
  }
  blush(ctx, 7, -22.5, 1.7);
  if (boss) crown(ctx, 10, -34, 4.5, acc, t);
}

// ================================================================ ゴースト（カジノチップの亡霊）
function ghost(ctx, col, acc, t, st, boss) {
  const wind = POSE.windup;
  const bob = Math.sin(t * 2.6) * 3;
  ctx.translate(0, bob - 2 + (wind ? 2 : 0));
  if (wind) ctx.scale(1.06, 0.94);
  const prevA = ctx.globalAlpha;
  glow(ctx, 0, -28, 32, col, 0.28 + ENV.night * 0.2);
  ctx.globalAlpha = prevA * (st === 'dead' ? 0.6 : 0.92);
  // 体（シーツ）＋ゆらゆら裾（二次運動）
  const wv = t * 5;
  const sheet = (c) => {
    c.moveTo(-16, -30);
    c.bezierCurveTo(-16, -50, 16, -50, 16, -30);
    c.bezierCurveTo(16, -18, 14 + Math.sin(wv - 1) * 1, -12, 13, -6);
    for (let i = 0; i < 5; i++) {
      const x0 = 13 - i * 6.5, x1 = 13 - (i + 1) * 6.5;
      c.quadraticCurveTo((x0 + x1) / 2, -1 + Math.sin(wv + i) * 2.5, x1, -6 + Math.sin(wv + i + 0.5) * 1.5);
    }
    c.bezierCurveTo(-16 + Math.sin(wv - 1.5), -12, -17, -20, -16, -30);
    c.closePath();
  };
  ctx.beginPath(); sheet(ctx);
  body(ctx, col, -17, -45, 34, 42, { lw: 2.1, gloss: false });
  ctx.globalAlpha = prevA;
  // 頭＝チップ（縁のストライプ）
  ctx.save(); ctx.translate(0, -32);
  const rot = Math.sin(t * 1.5) * 0.15 + (wind ? t * 6 : 0);
  ctx.rotate(rot);
  ctx.beginPath(); ctx.arc(0, 0, 14.5, 0, PI * 2); ctx.strokeStyle = C(acc); ctx.lineWidth = 3.8; ctx.stroke();
  ctx.strokeStyle = C('#ffffff'); ctx.lineWidth = 4; ctx.setLineDash([4, 7.4]); ctx.beginPath(); ctx.arc(0, 0, 14.5, 0, PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(0, 0, 16.6, 0, PI * 2); ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, PI * 2); ctx.strokeStyle = C(rgba(acc, 0.7)); ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
  if (!FL) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 14.5, -2.6, -1.8); ctx.stroke(); }
  ctx.restore();
  // 顔
  cuteEyes(ctx, 1, -33, 3.1, 5, shadow(acc, 0.35), st, t);
  blush(ctx, -7, -27.8, 2.5); blush(ctx, 9.5, -27.8, 2.5);
  const mk = mouthFor(st, 'cat');
  if (mk !== 'cat') mouth(ctx, 1, -27.5, 2.4, mk);
  else {
    mouth(ctx, 1, -28, 2, 'cat');
    ctx.beginPath(); ctx.ellipse(2.2, -26.4, 1.4, 1.8 + Math.max(0, Math.sin(t * 2)) * 0.4, 0, 0, PI); fs(ctx, '#ff7aa8', 0.8); // べー
  }
  // 小さな手（二次運動）
  const hw = Math.sin(t * 4) * 2, hw2 = Math.sin(t * 4 - 1) * 2;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 16.5, -22 + (side > 0 ? hw : hw2) - (wind ? 4 : 0), 3.6, 2.7, side * 0.5, 0, PI * 2); part(ctx, light(col, 0.2), side * 16.5 - 3.6, -25, 7.2, 5.4, 1.4); }
  // 周囲を回るスート
  if (!FL) {
    ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const syms = ['♠', '♦', '$'];
    for (let i = 0; i < 3; i++) {
      const a = t * (wind ? 5 : 1.6) + i * (PI * 2 / 3);
      const x = Math.cos(a) * 23, y = -28 + Math.sin(a) * 8;
      ctx.globalAlpha = prevA * (0.55 + 0.45 * Math.sin(a));
      ctx.fillStyle = i === 1 ? acc : i === 2 ? '#ffd23f' : '#2a1430';
      textUp(ctx, syms[i], x, y);
    }
    ctx.globalAlpha = prevA;
  }
  if (boss) crown(ctx, 0, -48.5, 6, acc, t);
}

// ================================================================ ロボ（モニター頭のちびロボ・金属＋発光）
function robot(ctx, col, acc, t, st, boss) {
  const wk = isWalk(st);
  const wind = POSE.windup;
  const ph = wk ? Math.sin(t * 9) : 0;
  const bob = wk ? Math.abs(Math.cos(t * 9)) * 1.6 : Math.sin(t * 2.5) * 0.6;
  const dk = shadow(col, 0.35);
  // 脚（脚＋足を1枚のスプライトに）
  for (const [lx, p] of [[-6, 1], [6, -1]]) {
    const o = ph * 3 * p;
    ctx.translate(lx + o, 0);
    cpart(ctx, 'robLeg', -5, -14, 10, 14, 2, (c) => {
      c.beginPath(); rr(c, -3, -14, 6, 10, 2); metal(c, dk, -3, -14, 6, 10, 1.6, false);
      c.beginPath(); rr(c, -5, -5, 10, 5, 2); metal(c, shadow(col, 0.15), -5, -5, 10, 5, 1.6);
    }, col);
    ctx.translate(-lx - o, 0);
  }
  ctx.translate(0, -bob);
  // 奥の腕
  arm(ctx, -12, -28, -0.2 - ph * 0.4 + (wind ? 0.6 : 0), dk);
  // 胴（胴・パネルライン・ボルト・液晶枠・首を1枚に）
  cpart(ctx, 'robTorso', -12, -37, 24, 24, 2, (c) => {
    c.fillStyle = C(dk); c.fillRect(-3, -37, 6, 4);
    c.beginPath(); rr(c, -12, -34, 24, 21, 6); metal(c, col, -12, -34, 24, 21, 2.1, false);
    if (!FL) {
      c.strokeStyle = rgba('#1a1028', 0.4); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-12, -17); c.lineTo(12, -17); c.moveTo(0, -17); c.lineTo(0, -13); c.stroke();
      c.fillStyle = rgba('#1a1028', 0.5); c.beginPath(); for (const [bx, by] of [[-9.5, -31.5], [9.5, -31.5], [-9.5, -15], [9.5, -15]]) { c.moveTo(bx + 0.8, by); c.arc(bx, by, 0.8, 0, PI * 2); } c.fill();
    }
    c.beginPath(); rr(c, -7, -29, 14, 10, 2.5); fs(c, '#1a1c2a', 1.4);
  }, col);
  for (let i = 0; i < 3; i++) { const on = ((t * 4 | 0) + i) % 3 === 0 || wind; if (on) glow(ctx, -4 + i * 4, -24, 4, acc, 0.6); ctx.fillStyle = C(on ? acc : rgba(acc, 0.3)); ctx.beginPath(); ctx.arc(-4 + i * 4, -24, 1.5, 0, PI * 2); ctx.fill(); }
  // 頭
  const tilt = st === 'hurt' ? -0.22 : wind ? 0.08 : Math.sin(t * 1.7) * 0.05;
  ctx.save(); ctx.translate(0, -46); ctx.rotate(tilt);
  // アンテナ（二次運動）
  const an = Math.sin(t * 3 - 0.8) * 2.2;
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(an * 0.3, -14, an, -17); ctx.stroke();
  glow(ctx, an, -18, 7 + wind * 3, wind ? '#ff3a3a' : acc, 0.7);
  ctx.beginPath(); ctx.arc(an, -18, 2.5, 0, PI * 2); fs(ctx, wind ? '#ff3a3a' : acc, 1.2);
  // 耳・頭・液晶（1枚）
  cpart(ctx, 'robHead', -16.5, -10, 33, 20, 2, (c) => {
    for (const side of [-1, 1]) { c.beginPath(); rr(c, side * 14 - 2.5, -4, 5, 8, 2); metal(c, dk, side * 14 - 2.5, -4, 5, 8, 1.4); }
    c.beginPath(); rr(c, -13, -10, 26, 20, 6); metal(c, col, -13, -10, 26, 20, 2.1);
    c.beginPath(); rr(c, -10, -7, 20, 13, 4);
    if (FL) fs(c, '#fff', 1.4); else { const sg = c.createLinearGradient(0, -7, 0, 6); sg.addColorStop(0, '#0e1020'); sg.addColorStop(1, '#232a44'); c.fillStyle = sg; c.fill(); c.strokeStyle = OC(); c.lineWidth = 1.4; c.stroke(); }
  }, col);
  // LED 顔（走査線）
  ctx.save(); if (!FL) ctx.globalCompositeOperation = 'lighter';
  const ledC = wind ? '#ff4a6a' : acc;
  glow(ctx, 0, -1, 12, ledC, 0.35);
  ctx.strokeStyle = C(ledC); ctx.fillStyle = C(ledC); ctx.lineWidth = 1.8; ctx.beginPath();
  if (st === 'hurt') { ctx.moveTo(-6, -3); ctx.lineTo(-3, -0.5); ctx.lineTo(-6, 2); ctx.moveTo(6, -3); ctx.lineTo(3, -0.5); ctx.lineTo(6, 2); ctx.stroke(); }
  else if (st === 'dead') { for (const cx of [-4.5, 4.5]) { ctx.moveTo(cx + 2, -1); ctx.arc(cx, -1, 2, 0, PI * 1.6); } ctx.stroke(); }
  else if (wind || st === 'attack') { ctx.moveTo(-6.5, -3.5); ctx.lineTo(-2.5, -1.5); ctx.moveTo(6.5, -3.5); ctx.lineTo(2.5, -1.5); ctx.stroke(); ctx.fillRect(-6, -1, 3, 2.5); ctx.fillRect(3, -1, 3, 2.5); }
  else if (((t + 0.4) % 3.4) < 0.15) { ctx.fillRect(-6.5, -1, 4, 1.4); ctx.fillRect(2.5, -1, 4, 1.4); }
  else { ctx.beginPath(); rr(ctx, -6.5, -3.5, 3.6, 5, 1.4); rr(ctx, 2.9, -3.5, 3.6, 5, 1.4); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillRect(-5.6, -3, 1.2, 1.2); ctx.fillRect(3.8, -3, 1.2, 1.2); }
  ctx.lineWidth = 1.2; ctx.beginPath();
  if (wind) { ctx.moveTo(-2.5, 3.6); ctx.lineTo(2.5, 3.6); } else { ctx.moveTo(-2, 3.4); ctx.quadraticCurveTo(0, 4.8, 2, 3.4); }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = C(rgba('#ff6f91', 0.55)); ctx.fillRect(-9, 2, 2.6, 1.4); ctx.fillRect(6.4, 2, 2.6, 1.4);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-5, -6); ctx.lineTo(-8, 4); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill();
  if (boss) crown(ctx, 0, -11, 6, acc, t);
  ctx.restore();
  // 手前の腕
  const pa = wind ? 1.2 + Math.sin(t * 30) * 0.05 : st === 'attack' ? -1.4 + Math.sin(t * 16) * 0.3 : 0.2 + ph * 0.4;
  arm(ctx, 12, -28, pa, col);
  if (wind) glow(ctx, 12 - Math.sin(pa) * 13, -28 + Math.cos(pa) * 13, 6, '#ff4a6a', 0.7);
}
function arm(ctx, x, y, a, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  cpart(ctx, 'robArm', -4.5, -3, 9, 18.5, 2, (c) => {
    c.strokeStyle = OC(); c.lineWidth = 5.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 11); c.stroke();
    c.strokeStyle = C(col); c.lineWidth = 2.8; c.stroke();
    c.strokeStyle = C(light(col, 0.5)); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-0.6, 1); c.lineTo(-0.6, 10); c.stroke();
    c.beginPath(); c.arc(0, 0, 2.8, 0, PI * 2); metal(c, shadow(col, 0.2), -2.8, -2.8, 5.6, 5.6, 1.2);
    c.beginPath(); c.moveTo(-3.5, 11); c.lineTo(-3.5, 15); c.moveTo(3.5, 11); c.lineTo(3.5, 15); c.strokeStyle = OC(); c.lineWidth = 3; c.stroke();
    c.beginPath(); c.arc(0, 12, 3.5, PI, 0); metal(c, light(col, 0.1), -3.5, 8.5, 7, 3.5, 1.2);
  }, col);
  ctx.restore();
}

// ================================================================ エイリアン（バブルヘルメットの宇宙人）
function alien(ctx, col, acc, t, st, boss) {
  const wk = isWalk(st);
  const wind = POSE.windup;
  const ph = wk ? Math.sin(t * 10) : 0;
  const hov = Math.sin(t * 2.2) * 1.2;
  const suit = acc;
  // 脚
  for (const [lx, p] of [[-4, 1], [4, -1]]) {
    const o = lx + ph * 2.7 * p;
    ctx.translate(o, 0);
    cpart(ctx, 'alLeg', -3.5, -11, 9, 11, 2, (c) => {
      c.beginPath(); rr(c, -2.5, -11, 5, 9, 2); part(c, shadow(suit, 0.2), -2.5, -11, 5, 9, 1.5);
      c.beginPath(); c.ellipse(1, -2, 4.2, 2.5, 0, 0, PI * 2); metal(c, '#e8ecf8', -3, -4.5, 8.4, 5, 1.4);
    }, suit);
    ctx.translate(-o, 0);
  }
  ctx.translate(0, -hov);
  // 胴（スーツ）
  cpart(ctx, 'alSuit', -10, -26, 20, 17, 2, (c) => {
    c.beginPath(); c.moveTo(-8, -10); c.quadraticCurveTo(-10, -22, -6, -25); c.lineTo(6, -25); c.quadraticCurveTo(10, -22, 8, -10); c.closePath(); body(c, suit, -9, -25, 18, 15, { lw: 1.9 });
    c.fillStyle = C('#e8ecf8'); c.fillRect(-8.5, -14, 17, 2.4);
    c.beginPath(); c.arc(0, -19, 2.7, 0, PI * 2); fs(c, '#ffd23f', 1);
  }, suit);
  glow(ctx, 0, -19, 5, '#ffd23f', 0.5);
  // 奥の腕
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.8; ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(-10, -14 + ph * 2); ctx.stroke(); ctx.strokeStyle = C(col); ctx.lineWidth = 1.9; ctx.stroke();
  // 頭（大きな逆たまご）
  ctx.save(); ctx.translate(0, -38 + (st === 'attack' ? 1 : 0)); if (wind) ctx.rotate(-0.08);
  // 触角（二次運動）
  for (const side of [-1, 1]) {
    const s = Math.sin(t * 3 + side) * 2, s2 = Math.sin(t * 3 + side - 0.9) * 2.4;
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(side * 5, -11); ctx.quadraticCurveTo(side * 8 + s * 0.4, -17, side * 9 + s2, -20); ctx.stroke();
    glow(ctx, side * 9 + s2, -20.5, 6 + wind * 3, wind ? '#ff4fd8' : '#fff6a0', 0.7);
    ctx.beginPath(); ctx.arc(side * 9 + s2, -20.5, 2.3, 0, PI * 2); fs(ctx, wind ? '#ff8ae8' : '#fff27a', 1.1);
  }
  bodyK(ctx, 'alH', col, -15.5, -11, 31, 23, (c) => { c.moveTo(0, 12); c.bezierCurveTo(-9, 11, -16, 2, -15, -4); c.bezierCurveTo(-14, -13, 14, -13, 15, -4); c.bezierCurveTo(16, 2, 9, 11, 0, 12); c.closePath(); }, { lw: 2.1 });
  // アーモンド目（大きく・つり目・ハイライト3）
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, 1, 0, 3, 5.5, '#000', st, t);
  else {
    const bl = !wind && ((t + 1.1) % 4) < 0.12;
    const sq = wind || st === 'attack' ? 0.62 : 1;
    if (!bl) cpart(ctx, 'alEyes', -11, -5, 24, 11, 1.5, (ctx) => { for (const side of [-1, 1]) {
      const ex = 1 + side * 6.2;
      ctx.save(); ctx.translate(ex, 0.5); ctx.rotate(side * 0.38);
      {
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 3.5 * sq, 0, 0, PI * 2);
        if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -3.5, 0, 3.5); g.addColorStop(0, '#0e0820'); g.addColorStop(0.6, '#3a1a6a'); g.addColorStop(1, light(acc, 0.3)); ctx.fillStyle = g; }
        ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1.6, -1.2 * sq, 1.4, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-1.8, 1.1 * sq, 0.65, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0.2, -2 * sq, 0.4, 0, PI * 2); ctx.fill();
      }
      ctx.restore();
    } }, acc + sq);
    else for (const side of [-1, 1]) {
      const ex = 1 + side * 6.2;
      ctx.save(); ctx.translate(ex, 0.5); ctx.rotate(side * 0.38);
      if (bl) { ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke(); }
      else {
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 3.5 * sq, 0, 0, PI * 2);
        if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -3.5, 0, 3.5); g.addColorStop(0, '#0e0820'); g.addColorStop(0.6, '#3a1a6a'); g.addColorStop(1, light(acc, 0.3)); ctx.fillStyle = g; }
        ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1.6, -1.2 * sq, 1.4, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-1.8, 1.1 * sq, 0.65, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0.2, -2 * sq, 0.4, 0, PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  blush(ctx, -8, 5.2, 2.1); blush(ctx, 10, 5.2, 2.1);
  mouth(ctx, 1, 7, 1.6, mouthFor(st, 'smile'));
  // バブルヘルメット
  if (!FL) cpart(ctx, 'alHelm', -19.5, -20.5, 39, 39, 1, (ctx) => {
    ctx.beginPath(); ctx.arc(0, -1, 18.5, 0, PI * 2);
    ctx.fillStyle = 'rgba(180,230,255,0.12)'; ctx.fill(); ctx.strokeStyle = rgba(ENV.night > 0.5 ? '#9ff6ff' : '#c8f0ff', 0.7); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, -1, 15.5, -2.6, -1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -1, 15.5, 0.2, 0.45); ctx.stroke();
  });
  if (boss) crown(ctx, 0, -12, 5, acc, t);
  ctx.restore();
  // 手前の腕＋光線銃（ため=銃口チャージ）
  const aa = st === 'attack' || wind ? -1.25 : 0.3 + ph * 0.3;
  ctx.save(); ctx.translate(6, -22); ctx.rotate(aa);
  cpart(ctx, 'alGun', -4, -2, 12, 24, 2, (ctx) => {
    ctx.strokeStyle = OC(); ctx.lineWidth = 3.8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 9); ctx.stroke(); ctx.strokeStyle = C(col); ctx.lineWidth = 1.9; ctx.stroke();
    ctx.translate(0, 10); ctx.rotate(-PI / 2 + 0.2);
    ctx.beginPath(); rr(ctx, -2, -2.5, 10.5, 5, 2); metal(ctx, '#e8ecf8', -2, -2.5, 10.5, 5, 1.2);
    ctx.beginPath(); ctx.arc(9.5, 0, 2.1, 0, PI * 2); fs(ctx, '#ff4fd8', 1);
  }, col);
  ctx.save(); ctx.translate(0, 10); ctx.rotate(-PI / 2 + 0.2);
  if (st === 'attack' || wind) glow(ctx, 10.5, 0, wind ? 6 + Math.sin(t * 30) * 2 : 8, '#ff4fd8', 0.85);
  ctx.restore();
  ctx.restore();
}

// ================================================================ ゴーレム（ネオンひび割れのコンクリ巨人＋ヘルメット）
function golem(ctx, col, acc, t, st, boss) {
  const wk = isWalk(st);
  const wind = POSE.windup;
  const ph = wk ? Math.sin(t * 5) : 0;
  const bob = wk ? Math.abs(Math.cos(t * 5)) * 2.5 : Math.sin(t * 1.8) * 0.8 + (wind ? 2 : 0);
  const dk = shadow(col, 0.3), lt = light(col, 0.25);
  // 脚
  for (const [lx, p] of [[-12, 1], [12, -1]]) { const o = lx + ph * 4 * p; ctx.translate(o, 0); bodyK(ctx, 'goLeg', dk, -8, -18, 16, 18, (c) => rr(c, -8, -18, 16, 18, 4), { lw: 2, gloss: false }); ctx.translate(-o, 0); }
  ctx.translate(0, -bob);
  // 奥の腕（ため=両腕を振り上げる）
  const slam = st === 'attack' && !wind ? Math.sin(clamp((t * 2.5) % 1, 0, 1) * PI) : 0;
  gfist(ctx, -26, -50, -0.15 - ph * 0.25 - slam * 2.2 - wind * 2.6, dk, acc, t);
  // 胴（ゴツゴツ多角形）
  const torso = (c) => { c.moveTo(-24, -18); c.lineTo(-30, -38); c.lineTo(-24, -56); c.lineTo(-8, -62); c.lineTo(12, -61); c.lineTo(27, -52); c.lineTo(30, -34); c.lineTo(23, -17); c.lineTo(0, -14); c.closePath(); };
  bodyK(ctx, 'torso', col, -30, -62, 60, 48, torso, {
    lw: 2.8, gloss: false, path: torso,
    inner: (c) => {
      // 面の切り替え（明るい上面）
      c.fillStyle = C(lt); c.beginPath(); c.moveTo(-24, -56); c.lineTo(-8, -62); c.lineTo(12, -61); c.lineTo(27, -52); c.lineTo(10, -50); c.lineTo(-12, -51); c.closePath(); c.fill();
      // ブロック目地
      c.strokeStyle = C(rgba('#2a1430', 0.4)); c.lineWidth = 1.2; c.beginPath();
      c.moveTo(-28, -36); c.lineTo(29, -36); c.moveTo(-22, -24); c.lineTo(25, -24); c.moveTo(-4, -61); c.lineTo(-6, -36); c.moveTo(10, -36); c.lineTo(8, -24); c.stroke();
      // コンクリの粒
      if (!FL) { c.fillStyle = rgba(dk, 0.5); for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(-22 + ((i * 37) % 44), -20 - ((i * 23) % 36), 0.9, 0, PI * 2); c.fill(); } }
    },
  });
  // ネオンのひび（脈動・ため/怒りで強く）
  ctx.save(); if (!FL) ctx.globalCompositeOperation = 'lighter';
  const pul = 0.6 + Math.sin(t * 3) * 0.4 + wind * 0.6;
  ctx.strokeStyle = rgba(acc, Math.min(1, 0.35 * pul + ENV.night * 0.2)); ctx.lineWidth = 5.5; ctx.beginPath();
  ctx.moveTo(-14, -52); ctx.lineTo(-8, -44); ctx.lineTo(-12, -36); ctx.lineTo(-4, -28); ctx.moveTo(14, -48); ctx.lineTo(18, -40); ctx.lineTo(13, -30); ctx.moveTo(-8, -44); ctx.lineTo(-2, -46); ctx.stroke();
  ctx.strokeStyle = C(light(acc, 0.45)); ctx.lineWidth = 1.7; ctx.stroke();
  ctx.restore();
  // 胸のコア
  glow(ctx, 2, -40, 10 + wind * 6, acc, 0.5 * pul);
  // 鉄筋
  cpart(ctx, 'goRebar', 18, -70, 15, 17, 2, (c) => {
    c.strokeStyle = OC(); c.lineWidth = 2.8; c.beginPath(); c.moveTo(20, -58); c.lineTo(25, -68); c.moveTo(24, -55); c.lineTo(31, -62); c.stroke();
    c.strokeStyle = C('#b06a3a'); c.lineWidth = 1.3; c.stroke();
  }, '');
  // 頭（小さいブロック）
  ctx.save(); ctx.translate(2, -66); if (wind) ctx.translate(0, 3);
  bodyK(ctx, 'goH', col, -11, -10, 22, 16, (c) => { rr(c, -11, -10, 22, 16, 4); }, { lw: 2.3, gloss: false });
  // 目
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, 2, -2, 2.6, 4, '#000', st, t);
  else {
    const eh = wind || st === 'attack' ? 1.4 : 2.8;
    glow(ctx, -2, -2, 7, acc, 0.7); glow(ctx, 6, -2, 7, acc, 0.7);
    ctx.fillStyle = C(light(acc, 0.35)); ctx.beginPath(); ctx.ellipse(-2, -2, 2.2, eh, 0, 0, PI * 2); ctx.ellipse(6, -2, 2.2, eh, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-1.6, -3.6, 1, 1); ctx.fillRect(6.4, -3.6, 1, 1);
    if (wind || st === 'attack') { ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-5.5, -6.5); ctx.lineTo(1, -4); ctx.moveTo(9.5, -6.5); ctx.lineTo(3, -4); ctx.stroke(); }
  }
  blush(ctx, -6, 2.6, 2); blush(ctx, 9, 2.6, 2);
  // ヘルメット
  cpart(ctx, 'goHelmA', -15, -19, 32, 15, 2, (c) => {
    bodyK(c, 'goHelm', '#ffc93c', -12, -18, 24, 10, (c) => { c.moveTo(-12, -8); c.bezierCurveTo(-12, -20.5, 12, -20.5, 12, -8); c.closePath(); }, { lw: 1.9 });
    c.beginPath(); rr(c, -14, -9, 30, 3.5, 1.5); part(c, '#ffb000', -14, -9, 30, 3.5, 1.4);
    c.fillStyle = C('#ffffff'); c.fillRect(-1, -17, 3, 7);
  }, '');
  if (boss) crown(ctx, 0, -18, 6, acc, t);
  ctx.restore();
  // 手前の腕
  gfist(ctx, 27, -50, 0.2 + ph * 0.25 - slam * 2.4 - wind * 2.8, col, acc, t);
  if (wind && !FL) sparkle(ctx, 30, -86, 6, light(acc, 0.5), 0.9);
}
function gfist(ctx, x, y, a, col, acc, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  cpart(ctx, 'goArmA', -12, -3, 24, 39, 2.5, (c) => {
    c.beginPath(); rr(c, -6, -2, 12, 20, 4); body(c, shadow(col, 0.08), -6, -2, 12, 20, { lw: 2, gloss: false });
    c.beginPath(); c.moveTo(-10, 18); c.lineTo(-11, 30); c.lineTo(-4, 35); c.lineTo(8, 34); c.lineTo(11, 24); c.lineTo(7, 17); c.closePath(); body(c, col, -11, 17, 22, 18, { lw: 2.3, gloss: false });
    c.strokeStyle = C(rgba(acc, 0.85)); c.lineWidth = 1.3; c.beginPath(); c.moveTo(-5, 22); c.lineTo(-1, 27); c.lineTo(3, 24); c.stroke();
  }, col + acc);
  ctx.restore();
}

// ================================================================ 裏ボス: UFO に乗ったエイリアン・クイーン
function bossAlien(ctx, col, acc, t, st, e) {
  const rage = POSE.rage, wind = POSE.windup;
  const hov = Math.sin(t * 1.6) * 5;
  const shake = st === 'hurt' ? Math.sin(t * 50) * 2 : wind ? Math.sin(t * 60) * 1 : 0;
  const tiltA = st === 'dead' ? 0.3 : Math.sin(t * 0.9) * 0.04;
  ctx.translate(shake, -hov);
  const ac2 = rage ? '#ff2e6a' : '#3ee6d2';
  // 外周オーラ
  if (!FL) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const k = ((t * (0.5 + wind * 0.8) + i / 3) % 1);
      ctx.strokeStyle = rgba(i % 2 ? acc : ac2, 0.35 * (1 - k)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, -60, 70 + k * 40, 55 + k * 30, 0, 0, PI * 2); ctx.stroke();
    }
    glow(ctx, 0, -70, 115, rage ? '#ff2e6a' : acc, 0.22 + wind * 0.15);
    // トラクタービーム
    const beam = st === 'attack' ? (wind ? 0.25 + 0.2 * Math.sin(t * 20) : 0.55) : 0.18;
    const bg = ctx.createLinearGradient(0, -30, 0, 10);
    bg.addColorStop(0, rgba(rage ? '#ffb0d0' : '#9ff6ff', beam)); bg.addColorStop(1, rgba('#9ff6ff', 0));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-26, -32); ctx.lineTo(26, -32); ctx.lineTo(56, 8); ctx.lineTo(-56, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.rotate(tiltA);
  // ぶら下がるメカ触手（二次運動・ため=前に構える）
  for (let i = 0; i < (rage ? 5 : 3); i++) {
    const n = rage ? 5 : 3;
    const x0 = -30 + i * (60 / (n - 1)), s = Math.sin(t * 2 + i * 1.7) * 8, s2 = Math.sin(t * 2 + i * 1.7 - 1) * 10;
    const tipX = x0 + s2 * 0.5 + (wind ? 18 : 0), tipY = -2 - (wind ? 10 : 0);
    ctx.beginPath(); ctx.moveTo(x0, -34); ctx.bezierCurveTo(x0 + s, -20, x0 - s2, -12, tipX, tipY);
    ctx.strokeStyle = OC(); ctx.lineWidth = 7.4; ctx.stroke(); ctx.strokeStyle = C('#8a90b8'); ctx.lineWidth = 4.2; ctx.stroke();
    ctx.setLineDash([2, 4]); ctx.strokeStyle = C('#5a5f88'); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C(rgba('#ffffff', 0.4)); ctx.lineWidth = 1; ctx.stroke();
    glow(ctx, tipX, tipY, 9, acc, 0.6 + wind * 0.4);
    ctx.beginPath(); ctx.arc(tipX, tipY, 4.2, 0, PI * 2); fs(ctx, acc, 1.6);
  }
  // ドーム（奥半分）
  const domeY = -62;
  if (!FL) { ctx.beginPath(); ctx.ellipse(0, domeY, 46, 50, 0, PI, 0); ctx.fillStyle = 'rgba(120,200,255,0.18)'; ctx.fill(); }
  // ---- クイーン
  ctx.save(); ctx.translate(0, domeY - 4);
  const qb = Math.sin(t * 2) * 1.5;
  ctx.translate(0, qb);
  // マント襟（二次運動）
  const cf = Math.sin(t * 2 - 0.8) * 1.5;
  ctx.beginPath(); ctx.moveTo(-30 - cf, 8); ctx.quadraticCurveTo(-36 - cf, -16, -20, -20); ctx.lineTo(20, -20); ctx.quadraticCurveTo(36 + cf, -16, 30 + cf, 8); ctx.closePath(); body(ctx, rage ? '#5a0a2a' : '#3a1a6a', -36, -20, 72, 28, { lw: 2.3, gloss: false });
  ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(-12, -14); ctx.lineTo(12, -14); ctx.lineTo(18, 8); ctx.closePath(); body(ctx, acc, -18, -14, 36, 22, { lw: 2 });
  ctx.beginPath(); ctx.arc(0, -6, 4.2, 0, PI * 2); fs(ctx, '#ffd23f', 1.4); glow(ctx, 0, -6, 8, '#ffd23f', 0.6);
  // 触角4本
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1, k = i % 2;
    const s = Math.sin(t * 2.5 + i) * 3;
    const bx = side * (8 + k * 8), ex = side * (16 + k * 14) + s, ey = -66 - k * 6 + (k ? 8 : 0);
    ctx.strokeStyle = OC(); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(bx, -46); ctx.quadraticCurveTo(side * (12 + k * 12), -60, ex, ey); ctx.stroke();
    ctx.strokeStyle = C(col); ctx.lineWidth = 1.5; ctx.stroke();
    glow(ctx, ex, ey, 9 + wind * 4, i % 2 ? acc : (rage ? '#ff6a6a' : '#fff27a'), 0.75);
    ctx.beginPath(); ctx.arc(ex, ey, 3.3, 0, PI * 2); fs(ctx, i % 2 ? acc : (rage ? '#ff6a6a' : '#fff27a'), 1.2);
  }
  // 頭
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.bezierCurveTo(-16, -13, -26, -28, -25, -38); ctx.bezierCurveTo(-24, -56, 24, -56, 25, -38); ctx.bezierCurveTo(26, -28, 16, -13, 0, -12); ctx.closePath();
  body(ctx, col, -25, -53, 50, 41, { lw: 2.5 });
  // 額の宝石
  glow(ctx, 0, -46, 11 + wind * 5, rage ? '#ff2e4d' : acc, 0.85);
  ctx.beginPath(); ctx.moveTo(0, -51.5); ctx.lineTo(4.2, -46); ctx.lineTo(0, -40.5); ctx.lineTo(-4.2, -46); ctx.closePath(); part(ctx, rage ? '#ff2e4d' : acc, -4.2, -51.5, 8.4, 11, 1.2);
  // 目（大きなアーモンド・つり目）
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, 0, -32, 4.6, 10, '#000', st, t);
  else {
    const sq = wind || st === 'attack' ? 0.65 : 1;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 10, -32); ctx.rotate(side * 0.42);
      if (rage) glow(ctx, 0, 0, 12, '#ff2e4d', 0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 5.4 * sq, 0, 0, PI * 2);
      if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -5, 0, 5); g.addColorStop(0, '#12062a'); g.addColorStop(0.55, shadow(rage ? '#ff2e4d' : acc, 0.25)); g.addColorStop(1, light(rage ? '#ff2e4d' : acc, 0.4)); ctx.fillStyle = g; }
      ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2.8, -1.8 * sq, 2.1, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-3, 1.8 * sq, 0.95, 0, PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0.4, -3 * sq, 0.55, 0, PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = OC(); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-18, -42 + (wind ? 1 : 0)); ctx.lineTo(-6, -38 + (wind ? 2 : 0)); ctx.moveTo(18, -42 + (wind ? 1 : 0)); ctx.lineTo(6, -38 + (wind ? 2 : 0)); ctx.stroke();
  }
  blush(ctx, -15, -23, 3); blush(ctx, 15, -23, 3);
  // 不敵な笑み
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.9; ctx.beginPath();
  if (st === 'attack' || rage) { ctx.moveTo(-5.5, -20); ctx.quadraticCurveTo(0, -11.5, 5.5, -20); ctx.closePath(); ctx.fillStyle = C('#c2304a'); ctx.fill(); ctx.stroke(); if (!FL) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-3.5, -19.5); ctx.lineTo(-2.5, -17.5); ctx.lineTo(-1.5, -19.6); ctx.moveTo(3.5, -19.5); ctx.lineTo(2.5, -17.5); ctx.lineTo(1.5, -19.6); ctx.fill(); } }
  else { ctx.moveTo(-6, -20); ctx.quadraticCurveTo(1, -16, 6, -21); ctx.stroke(); }
  // 王冠（宇宙王冠）
  crownHQ(ctx, 0, -52, 17, acc, t, rage ? -0.12 : 0);
  ctx.restore();
  // ドーム（ガラス前面・第2形態でひび）
  if (!FL) {
    ctx.beginPath(); ctx.ellipse(0, domeY, 46, 50, 0, PI, 0);
    const dg = ctx.createLinearGradient(-46, domeY - 50, 46, domeY);
    dg.addColorStop(0, 'rgba(200,240,255,0.32)'); dg.addColorStop(0.5, 'rgba(160,220,255,0.08)'); dg.addColorStop(1, 'rgba(200,240,255,0.22)');
    ctx.fillStyle = dg; ctx.fill(); ctx.strokeStyle = 'rgba(220,250,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, domeY, 38, 42, 0, PI * 1.12, PI * 1.38); ctx.stroke();
    if (rage) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(26, -96); ctx.lineTo(20, -86); ctx.lineTo(28, -80); ctx.lineTo(22, -70); ctx.moveTo(20, -86); ctx.lineTo(12, -90); ctx.moveTo(-30, -92); ctx.lineTo(-24, -84); ctx.lineTo(-32, -76); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.ellipse(0, domeY, 46, 50, 0, PI, 0); ctx.strokeStyle = OC(); ctx.lineWidth = 2.5; ctx.stroke();
  // ---- 円盤
  const hull = mix('#a8b0d8', col, 0.15);
  ctx.beginPath(); ctx.ellipse(0, -38, 84, 18, 0, 0, PI * 2);
  metal(ctx, hull, -84, -56, 168, 36, 2.8);
  ctx.beginPath(); ctx.ellipse(0, -46, 64, 9, 0, 0, PI * 2); ctx.strokeStyle = C(rgba('#2a1430', 0.4)); ctx.lineWidth = 1.4; ctx.stroke();
  // パネルライン
  if (!FL) { ctx.strokeStyle = rgba('#2a1430', 0.3); ctx.lineWidth = 1; ctx.beginPath(); for (let i = -3; i <= 3; i++) { ctx.moveTo(i * 22, -47); ctx.lineTo(i * 26, -29); } ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(0, -28, 40, 8, 0, 0, PI); part(ctx, shadow(hull, 0.35), -40, -28, 80, 8, 2);
  // 底面のコア（ため=チャージ）
  glow(ctx, 0, -24, 16 + wind * 14, rage ? '#ff2e6a' : '#9ff6ff', 0.55 + wind * 0.4);
  // 回転ライト
  for (let i = 0; i < 12; i++) {
    const a = t * (2 + wind * 4) + (i / 12) * PI * 2;
    const cx = Math.cos(a) * 74, cy = -38 + Math.sin(a) * 13;
    if (Math.sin(a) < -0.2) continue;
    const c = rage ? (i % 2 ? '#ff2e4d' : '#ffb0b0') : i % 3 === 0 ? '#fff6a0' : i % 3 === 1 ? acc : '#3ee6d2';
    glow(ctx, cx, cy, 10, c, 0.75);
    ctx.beginPath(); ctx.arc(cx, cy, 3.7, 0, PI * 2); fs(ctx, c, 1.2);
  }
  // 窓
  ctx.fillStyle = C('#ffffff'); ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.ellipse(-46, -46, 14, 3, -0.15, 0, PI * 2); ctx.fill(); ctx.globalAlpha /= 0.5;
  // 第2形態: 円盤の火花と煙
  if (rage && !FL) {
    for (let i = 0; i < 3; i++) { const k = (t * 0.9 + i / 3) % 1; ctx.fillStyle = `rgba(60,50,70,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.arc(60 - i * 10, -40 - k * 40, 4 + k * 10, 0, PI * 2); ctx.fill(); }
    if (((t * 6) | 0) % 2) sparkle(ctx, 62, -36, 7, '#ffe080', 1);
  }
  void e;
}

// ================================================================ 市民（ランダム服装の drawCharacter）
const L = (style, color, accent) => ({ style, color, accent: accent || '#ffffff' });
const SKINS = ['#ffe0cc', '#f6d5be', '#e8b896', '#d9a27a', '#b07a52', '#8a5a3a', '#ffe8d8'];
const HAIRC = ['#2a1a10', '#5a3a2a', '#8a5a30', '#e8c070', '#d9dee8', '#ff6fb5', '#3ee6d2', '#b45cff', '#1a1a24', '#c84a2a'];
const EYES = ['#4a3a8a', '#2a6a9a', '#3a7a3a', '#7a4a2a', '#2a2a2a', '#ff3d8b'];
const PASTEL = ['#ff9ad5', '#9ff0e0', '#ffe29a', '#b8c8ff', '#ffb38a', '#c8f59a', '#ffffff', '#ff6f91', '#19d3c5', '#7b2ff7'];
const DARKS = ['#2f3550', '#1c1c28', '#3a3346', '#4a4a5a', '#5a3a2a', '#1f3a5a'];
const pick = (R, a) => a[(R() * a.length) | 0];

function civKind(id) {
  id = String(id || '').toLowerCase();
  if (/tour|beach|surf/.test(id)) return 'tourist';
  if (/bus|salary|office|suit|exec/.test(id)) return 'business';
  if (/skate|punk|street|teen/.test(id)) return 'skater';
  if (/gran|oba|old|elder|senior/.test(id)) return 'granny';
  if (/jog|sport|run|fit/.test(id)) return 'jogger';
  if (/idol|girl|influ|celeb/.test(id)) return 'idol';
  return null;
}

function makeCivilian(seed, kind) {
  const R = rng(seed);
  if (!kind) kind = pick(R, ['tourist', 'business', 'skater', 'granny', 'jogger', 'idol']);
  const f = R() < 0.5;
  const look = { body: f ? 'f' : 'm', skin: pick(R, SKINS), hair: 'short', hairColor: pick(R, HAIRC), eyeColor: pick(R, EYES), expr: R() < 0.5 ? 'cute' : 'cool' };
  const eq = {};
  let scale = 0.94 + R() * 0.1;
  switch (kind) {
    case 'tourist':
      look.hair = pick(R, f ? ['bob', 'ponytail', 'long', 'twin'] : ['short', 'spiky', 'short']);
      eq.top = R() < 0.6 ? L('hawaiian', pick(R, ['#ff9a3c', '#19d3c5', '#ff6f91', '#ffe066', '#7b8cff']), pick(R, PASTEL)) : L('tshirt', pick(R, PASTEL), pick(R, PASTEL));
      eq.bottom = L(f && R() < 0.4 ? 'skirt' : 'shorts', pick(R, ['#4d6fb5', '#f4f0e0', '#c9a26a', '#ff9ad5']), '#ffffff');
      eq.shoes = L('sandals', pick(R, ['#c58a4a', '#ff5fa2', '#19d3c5']), '#ffffff');
      if (R() < 0.6) eq.hat = L(R() < 0.6 ? 'cap' : 'cowboy', pick(R, PASTEL), pick(R, PASTEL));
      if (R() < 0.55) eq.accessory = L('sunglasses', pick(R, ['#1a1a24', '#ff4fa0', '#2e7bff']), pick(R, ['#ffd23f', '#ffffff']));
      break;
    case 'business':
      look.hair = pick(R, f ? ['bob', 'ponytail', 'long'] : ['short', 'short', 'wolf']);
      look.hairColor = pick(R, ['#2a1a10', '#1a1a24', '#5a3a2a', '#8e97ad']);
      eq.top = L('suit', pick(R, DARKS), pick(R, ['#d8283c', '#2e7bff', '#ffd23f', '#3ee6d2', '#ff6fb5']));
      eq.bottom = L(f && R() < 0.5 ? 'skirt' : 'suitPants', eq.top.color, '#5a5a66');
      eq.shoes = L(f && R() < 0.5 ? 'heels' : 'loafers', pick(R, ['#1a1a1a', '#3a2620', '#5a1a2a']), '#c9a26a');
      if (R() < 0.3) eq.accessory = L('sunglasses', '#1a1a24', '#c0c0c8');
      break;
    case 'skater':
      look.hair = pick(R, ['spiky', 'wolf', 'short', 'bob', 'ponytail']);
      look.hairColor = pick(R, HAIRC);
      eq.top = L(R() < 0.55 ? 'hoodie' : R() < 0.5 ? 'tshirt' : 'tank', pick(R, ['#7b2ff7', '#ff5fa2', '#19d3c5', '#ffe066', '#2a2a3a', '#ff8a00']), pick(R, PASTEL));
      eq.bottom = L(R() < 0.5 ? 'cargo' : 'jeans', pick(R, ['#7a6e4a', '#3e5f9e', '#2a2a3a', '#4a5a3a']), '#c9d6ea');
      eq.shoes = L('sneakers', pick(R, ['#ffffff', '#2a2a3a', '#ff3d7f']), pick(R, ['#ff5fa2', '#19d3c5', '#ffd23f']));
      if (R() < 0.7) eq.hat = L(pick(R, ['beanie', 'cap', 'headphones', 'bandana']), pick(R, ['#19d3c5', '#ff5fa2', '#2a2a3a', '#ffe066']), pick(R, PASTEL));
      scale *= 0.96;
      break;
    case 'granny':
      look.hair = 'bun'; look.hairColor = pick(R, ['#e8e8f0', '#d0d0dc', '#c8c0d8', '#f0e8f0']); look.expr = 'cute';
      look.hairHi = '#ffffff';
      eq.top = L(R() < 0.5 ? 'hoodie' : 'tshirt', pick(R, ['#c8a8e8', '#ffb8c8', '#a8d8c8', '#e8c8a0']), pick(R, ['#ffffff', '#ff9ad5']));
      eq.bottom = L('skirt', pick(R, ['#6a4a8a', '#4a5a7a', '#8a4a5a']), '#ffffff');
      eq.shoes = L('loafers', pick(R, ['#5a3a2a', '#3a2620']), '#c9a26a');
      eq.accessory = R() < 0.6 ? L('sunglasses', '#d8f0ff', '#8a6a4a') : L('scarf', pick(R, ['#ff5fa2', '#7b2ff7', '#ffd23f']), '#ffffff');
      if (R() < 0.3) eq.hat = L('beanie', pick(R, ['#ff9ad5', '#b8c8ff']), '#ffffff');
      scale *= 0.9;
      look.body = 'f';
      break;
    case 'jogger':
      look.hair = pick(R, f ? ['ponytail', 'twin', 'bob'] : ['short', 'spiky']);
      eq.top = L(R() < 0.5 ? 'tracksuit' : 'tank', pick(R, ['#19d3c5', '#ff5fa2', '#ffe066', '#7cff6a', '#2e7bff']), '#ffffff');
      eq.bottom = L(R() < 0.6 ? 'trackPants' : 'shorts', pick(R, ['#2a2a3a', '#3a3a5a', '#ffffff']), pick(R, ['#ff3d7f', '#19d3c5']));
      eq.shoes = L('sneakers', '#ffffff', pick(R, ['#ff5fa2', '#19d3c5', '#ffd23f']));
      if (R() < 0.5) eq.hat = L(R() < 0.5 ? 'headphones' : 'cap', pick(R, ['#2b2b3a', '#ffffff', '#ff5fa2']), pick(R, ['#19f0ff', '#ff4fa0']));
      break;
    default: // idol / influencer
      look.body = 'f'; look.hair = pick(R, ['twin', 'long', 'ponytail', 'bob']); look.hairColor = pick(R, ['#ff6fb5', '#b47cff', '#3ee6d2', '#ffe29a', '#ffffff']);
      look.expr = 'cute';
      if (R() < 0.5) eq.top = L('idolDress', pick(R, ['#ff8fc8', '#b8c8ff', '#9ff0e0']), '#fff06a');
      else { eq.top = L('tshirt', pick(R, PASTEL), pick(R, PASTEL)); eq.bottom = L('skirt', pick(R, ['#3a2f6b', '#ff5fa2', '#ffffff']), '#ffffff'); }
      eq.shoes = L(R() < 0.5 ? 'heels' : 'sneakers', pick(R, ['#d6265e', '#ffffff', '#ff9ad5']), '#ffd23f');
      if (R() < 0.5) eq.hat = L(R() < 0.5 ? 'catEars' : 'headphones', pick(R, ['#ff9ad5', '#ffffff', '#2b2b3a']), '#ffe0f0');
      if (R() < 0.4) eq.accessory = L('sunglasses', '#ff4fa0', '#ffffff');
  }
  if (!f && look.body === 'm' && (look.hair === 'twin')) look.hair = 'short';
  return { look, equip: eq, scale };
}

const civCache = new WeakMap();
let civSeedCounter = 1;
/** 市民 enemy を描く。戻り値: 頭上 Y（ワールド） */
export function drawCivilian(ctx, e, st, t, flash) {
  const def = e.def || {};
  let c = civCache.get(e);
  if (!c) {
    const seed = e.seed != null ? (e.seed >>> 0) : (hashStr(def.id || 'civ') ^ (civSeedCounter++ * 2654435761)) >>> 0;
    const kind = civKind(def.id) || civKind(def.kind) || null;
    c = makeCivilian(seed, kind);
    // 明示 look/equip があれば優先
    if (def.look) c.look = def.look;
    if (def.equip) c.equip = def.equip;
    civCache.set(e, c);
  }
  const panic = st === 'hurt' || e.state === 'flee' || e.state === 'run' || e.state === 'panic' || e.fleeT > 0 || e.scared || e.panic;
  const sc = (def.scale || 1) * c.scale;
  let state = st;
  if (state === 'attack') state = 'walk';
  if (panic && state === 'idle') state = 'walk';
  drawCharacter(ctx, e.x, e.y, c.look, c.equip, {
    facing: e.facing || 1, state, t: t * (panic ? 1.5 : 1), scale: sc, flash, panic: panic && state !== 'dead',
    deadT: clamp((e.deadT || 0) * 3, 0, 1),
  });
  return e.y - 82 * sc;
}
/** テスト/図鑑用: seed から市民の見た目を得る */
export function civilianLook(seed, id) { return makeCivilian(seed >>> 0, civKind(id)); }
