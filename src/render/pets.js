// PET（ちびマスコット, 高さ 28〜40px）。足元中央 (x,y)。
// drawPet(ctx, x, y, look, anim)  look={style,color,accent}  anim={facing, t, state:'idle'|'walk'|'fly'|'pick', scale}
import { shade, rgba, rr, mix } from './util.js';
import { FL, setFL, C, OC, fs, blush, mouth, glow } from './mkit.js';

const PI = Math.PI;
export const PET_STYLES = ['slimePet', 'flamingoPet', 'gatorPet', 'catPet', 'dronePet', 'ghostPet', 'alienPet', 'dragonPet', 'dolphinPet', 'robotPet'];
const PET_DEF = {
  slimePet: ['#7cf0ff', '#ff6fb5'], flamingoPet: ['#ff8fc0', '#3ee6d2'], gatorPet: ['#6cc04a', '#ffd23f'], catPet: ['#ffb36b', '#ff4fa0'],
  dronePet: ['#e8ecf8', '#19f0ff'], ghostPet: ['#f2f0ff', '#b47cff'], alienPet: ['#7cff6a', '#ff4fd8'], dragonPet: ['#b47cff', '#ffd23f'],
  dolphinPet: ['#5ab8ff', '#ff9ad5'], robotPet: ['#ffd23f', '#ff3d7f'],
};
/** 空を飛ぶ（地面影を薄く・上下にふわふわ）スタイル */
export const PET_FLYING = { dronePet: 1, ghostPet: 1, alienPet: 1, dragonPet: 1, dolphinPet: 1 };

export function drawPet(ctx, x, y, look, anim) {
  look = look || {};
  anim = anim || {};
  const style = PET_DEF[look.style] ? look.style : 'slimePet';
  const d = PET_DEF[style];
  const col = look.color || d[0], acc = look.accent || d[1];
  const t = anim.t || 0, st = anim.state || 'idle';
  const s = anim.scale || 1;
  const fly = !!PET_FLYING[style];
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 影
  if (!anim.noShadow) { ctx.beginPath(); ctx.ellipse(0, 0, 10 * s, 2.6 * s, 0, 0, PI * 2); ctx.fillStyle = fly ? 'rgba(20,0,30,0.14)' : 'rgba(20,0,30,0.26)'; ctx.fill(); }
  ctx.scale((anim.facing < 0 ? -1 : 1) * s, s);
  setFL(!!anim.flash);
  // 拾う瞬間: ぴょん
  const pick = st === 'pick';
  if (pick) ctx.translate(0, -Math.abs(Math.sin(t * 12)) * 5);
  if (fly) ctx.translate(0, -8 + Math.sin(t * 3) * 2.5);
  switch (style) {
    case 'slimePet': slimeP(ctx, col, acc, t, st); break;
    case 'flamingoPet': flamingoP(ctx, col, acc, t, st); break;
    case 'gatorPet': gatorP(ctx, col, acc, t, st); break;
    case 'catPet': catP(ctx, col, acc, t, st); break;
    case 'dronePet': droneP(ctx, col, acc, t, st); break;
    case 'ghostPet': ghostP(ctx, col, acc, t, st); break;
    case 'alienPet': alienP(ctx, col, acc, t, st); break;
    case 'dragonPet': dragonP(ctx, col, acc, t, st); break;
    case 'dolphinPet': dolphinP(ctx, col, acc, t, st); break;
    case 'robotPet': robotP(ctx, col, acc, t, st); break;
  }
  if (pick && !FL) sparkle(ctx, 10, -34, t);
  setFL(false);
  ctx.restore();
}

// ---------------------------------------------------------------- 共通パーツ
function eyes(ctx, x, y, r, gap, st, t, col) {
  if (st === 'pick') { // ^ ^
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.3, r * 0.5); ctx.beginPath();
    for (const cx of [x - gap, x + gap]) { ctx.moveTo(cx - r, y + r * 0.3); ctx.quadraticCurveTo(cx, y - r * 1.1, cx + r, y + r * 0.3); }
    ctx.stroke(); return;
  }
  const blink = ((t + x * 0.02) % 3.6) < 0.12;
  for (const cx of [x - gap, x + gap]) {
    if (blink) { ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.quadraticCurveTo(cx, y + r * 0.6, cx + r, y); ctx.stroke(); continue; }
    ctx.beginPath(); ctx.ellipse(cx, y, r * 0.85, r * 1.1, 0, 0, PI * 2);
    if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, '#1a0f24'); g.addColorStop(1, col || '#5a3a8a'); ctx.fillStyle = g; }
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + r * 0.25, y - r * 0.4, r * 0.4, 0, PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r * 0.3, y + r * 0.45, r * 0.18, 0, PI * 2); ctx.fill();
  }
}
function sparkle(ctx, x, y, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const k = (t * 2 + i / 3) % 1;
    const px = x + Math.cos(i * 2.1) * 8 * k, py = y - k * 10 + i * 3;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = i === 1 ? '#ff9ad5' : '#fff6a0';
    ctx.beginPath(); ctx.moveTo(px, py - 3.5); ctx.lineTo(px + 1, py - 1); ctx.lineTo(px + 3.5, py); ctx.lineTo(px + 1, py + 1); ctx.lineTo(px, py + 3.5); ctx.lineTo(px - 1, py + 1); ctx.lineTo(px - 3.5, py); ctx.lineTo(px - 1, py - 1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
const walking = (st) => st === 'walk';
function bow(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-6, -5, -7, 0); ctx.quadraticCurveTo(-6, 5, 0, 0); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -5, 7, 0); ctx.quadraticCurveTo(6, 5, 0, 0);
  fs(ctx, col, 1.3);
  ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, PI * 2); fs(ctx, shade(col, -0.2), 1);
  ctx.restore();
}

// ---------------------------------------------------------------- スライム（双葉の芽）
function slimeP(ctx, col, acc, t, st) {
  const hop = walking(st) ? Math.abs(Math.sin(t * 7)) : 0;
  const sq = walking(st) ? Math.cos(t * 14) * 0.08 : Math.sin(t * 4) * 0.05;
  ctx.translate(0, -hop * 6);
  const W = 13 * (1 + sq), H = 22 * (1 - sq);
  ctx.beginPath(); ctx.moveTo(-W, 0); ctx.bezierCurveTo(-W * 1.1, -H * 0.6, -W * 0.5, -H, 0, -H); ctx.bezierCurveTo(W * 0.5, -H, W * 1.1, -H * 0.6, W, 0); ctx.quadraticCurveTo(0, 2, -W, 0); ctx.closePath();
  if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -H, 0, 0); g.addColorStop(0, shade(col, 0.5)); g.addColorStop(1, shade(col, -0.2)); ctx.fillStyle = g; }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-W * 0.5, -H * 0.65, 2.6, 1.8, -0.6, 0, PI * 2); ctx.fill();
  eyes(ctx, 1.5, -H * 0.42, 2.6, 4.2, st, t, shade(col, -0.4));
  blush(ctx, -6, -H * 0.25, 2.2); blush(ctx, 9, -H * 0.25, 2.2);
  mouth(ctx, 1.5, -H * 0.24, 1.5, st === 'pick' ? 'open' : 'cat');
  // 芽
  const sw = Math.sin(t * 3) * 0.2;
  ctx.save(); ctx.translate(0, -H); ctx.rotate(sw);
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -6); ctx.stroke(); ctx.strokeStyle = C('#5ac85a'); ctx.lineWidth = 1.2; ctx.stroke();
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(sd * 3, -12, sd * 8, -9); ctx.quadraticCurveTo(sd * 4, -5, 0, -6); fs(ctx, sd < 0 ? '#7ce05a' : acc, 1.3); }
  ctx.restore();
}

// ---------------------------------------------------------------- フラミンゴのヒナ
function flamingoP(ctx, col, acc, t, st) {
  const s = walking(st) ? Math.sin(t * 10) : 0;
  for (const [lx, p] of [[-2, 1], [3, -1]]) {
    ctx.strokeStyle = OC(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, -11); ctx.lineTo(lx + p * s * 3, -1); ctx.stroke();
    ctx.strokeStyle = C(shade(col, 0.2)); ctx.lineWidth = 1.4; ctx.stroke();
  }
  const bob = walking(st) ? Math.abs(Math.cos(t * 10)) : Math.sin(t * 2) * 0.5;
  ctx.translate(0, -bob);
  ctx.beginPath(); ctx.ellipse(-1, -16, 11, 8, 0, 0, PI * 2); fs(ctx, col, 2);
  ctx.beginPath(); ctx.moveTo(-7, -18); ctx.quadraticCurveTo(0, -22, 3, -15); ctx.quadraticCurveTo(-3, -12, -8, -15); ctx.closePath(); fs(ctx, shade(col, 0.3), 1.4);
  ctx.strokeStyle = OC(); ctx.lineWidth = 5.6; ctx.beginPath(); ctx.moveTo(6, -20); ctx.quadraticCurveTo(10, -26, 6, -30); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(7, -33, 7, 0, PI * 2); fs(ctx, col, 2);
  ctx.beginPath(); ctx.moveTo(12, -34); ctx.quadraticCurveTo(18, -34, 18, -29); ctx.lineTo(12, -31); ctx.closePath(); fs(ctx, '#fff2dc', 1.2);
  ctx.beginPath(); ctx.moveTo(16, -32.5); ctx.quadraticCurveTo(18.3, -32, 18, -29); ctx.lineTo(16, -30); ctx.closePath(); ctx.fillStyle = C('#2a1430'); ctx.fill();
  eyes(ctx, 9, -34, 2, 0.01, st, t, '#5a2a4a');
  blush(ctx, 6, -30, 1.8);
  bow(ctx, 4, -40, 0.6, acc);
}

// ---------------------------------------------------------------- ワニの赤ちゃん（よだれかけ）
function gatorP(ctx, col, acc, t, st) {
  const s = walking(st) ? Math.sin(t * 10) : 0;
  const tw = Math.sin(t * 4) * 2;
  ctx.beginPath(); ctx.moveTo(-10, -9); ctx.quadraticCurveTo(-18, -8 + tw, -22, -3 + tw); ctx.quadraticCurveTo(-16, -3, -10, -3); ctx.closePath(); fs(ctx, col, 1.6);
  for (const [lx, p] of [[-6, 1], [6, -1]]) { ctx.beginPath(); rr(ctx, lx - 3 + s * 2 * p, -6, 6, 6, 2.5); fs(ctx, shade(col, -0.2), 1.4); }
  ctx.beginPath(); ctx.ellipse(0, -10, 11, 8, 0, 0, PI * 2); fs(ctx, col, 2);
  ctx.fillStyle = C('#eaf2b0'); ctx.beginPath(); ctx.ellipse(1, -6, 7, 3.4, 0, 0, PI * 2); ctx.fill();
  // 頭
  ctx.save(); ctx.translate(5, -22);
  ctx.beginPath(); ctx.moveTo(-9, 6); ctx.bezierCurveTo(-11, -8, 6, -11, 10, -3); ctx.quadraticCurveTo(17, -1, 16, 4); ctx.quadraticCurveTo(4, 8, -9, 6); ctx.closePath(); fs(ctx, col, 2);
  ctx.fillStyle = C(shade(col, -0.35)); ctx.beginPath(); ctx.arc(14, 0.5, 0.9, 0, PI * 2); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(4, 4); ctx.quadraticCurveTo(10, 5.5, 15.5, 3.5); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(8, 4.6); ctx.lineTo(9, 6.6); ctx.lineTo(10, 4.8); ctx.fill();
  for (const ex of [-2, 5]) { ctx.beginPath(); ctx.arc(ex, -5.5, 3.6, PI, 0); fs(ctx, col, 1.4); }
  eyes(ctx, 1.5, -4.5, 2.2, 3.5, st, t, '#3a5a1a');
  blush(ctx, 9, 1.5, 1.8);
  ctx.restore();
  // よだれかけ
  ctx.beginPath(); ctx.moveTo(-1, -17); ctx.quadraticCurveTo(4, -9, 10, -16); ctx.quadraticCurveTo(5, -14, -1, -17); fs(ctx, acc, 1.3);
}

// ---------------------------------------------------------------- ネコ（首輪の鈴）
function catP(ctx, col, acc, t, st) {
  const s = walking(st) ? Math.sin(t * 11) : 0;
  const bob = walking(st) ? Math.abs(Math.cos(t * 11)) : Math.sin(t * 2.4) * 0.4;
  // 尻尾
  const sw = Math.sin(t * 3);
  ctx.strokeStyle = OC(); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(-18, -10, -16 + sw * 3, -22); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = 2.6; ctx.stroke();
  for (const [lx, p] of [[-5, 1], [5, -1]]) { ctx.beginPath(); ctx.ellipse(lx + s * 2.4 * p, -2.5, 3.4, 2.6, 0, 0, PI * 2); fs(ctx, shade(col, 0.35), 1.3); }
  ctx.translate(0, -bob);
  ctx.beginPath(); ctx.ellipse(0, -9, 9, 7, 0, 0, PI * 2); fs(ctx, col, 2);
  // 頭
  ctx.save(); ctx.translate(2, -23);
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * 4, -8); ctx.lineTo(sd * 10, -14); ctx.lineTo(sd * 11, -4); ctx.closePath(); fs(ctx, col, 1.8);
    ctx.fillStyle = C('#ffb0c8'); ctx.beginPath(); ctx.moveTo(sd * 6, -8); ctx.lineTo(sd * 9.5, -11.5); ctx.lineTo(sd * 9.6, -6); ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, -1, 12, 10, 0, 0, PI * 2); fs(ctx, col, 2);
  // 柄
  ctx.fillStyle = C(shade(col, -0.25)); ctx.beginPath(); ctx.moveTo(-3, -10.5); ctx.lineTo(-1.5, -6); ctx.lineTo(0, -10.8); ctx.lineTo(1.5, -6); ctx.lineTo(3, -10.5); ctx.fill();
  eyes(ctx, 1, -1, 2.6, 4.4, st, t, '#3ab86a');
  blush(ctx, -6.5, 3, 2); blush(ctx, 8.5, 3, 2);
  mouth(ctx, 1, 3.5, 1.6, 'cat');
  ctx.strokeStyle = C(rgba('#2a1430', 0.5)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(9, 2); ctx.lineTo(15, 1); ctx.moveTo(9, 3.5); ctx.lineTo(15, 4); ctx.moveTo(-7, 2); ctx.lineTo(-13, 1); ctx.stroke();
  ctx.restore();
  // 首輪＋鈴
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-4, -14); ctx.quadraticCurveTo(3, -11, 9, -14); ctx.stroke();
  ctx.strokeStyle = C(acc); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(3, -11.5, 2.3, 0, PI * 2); fs(ctx, '#ffd23f', 1.1);
}

// ---------------------------------------------------------------- ミニドローン（プロペラ帽）
function droneP(ctx, col, acc, t, st) {
  ctx.rotate(walking(st) ? 0.12 : 0);
  // 本体（たまご）
  ctx.beginPath(); ctx.ellipse(0, -14, 12, 11, 0, 0, PI * 2);
  if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -25, 0, -3); g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(col, -0.25)); ctx.fillStyle = g; }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 2; ctx.stroke();
  // 画面
  ctx.beginPath(); rr(ctx, -6, -19, 14, 9, 3.5); fs(ctx, '#1a1c2a', 1.3);
  ctx.save(); if (!FL) ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = C(acc); ctx.fillStyle = C(acc); ctx.lineWidth = 1.5; ctx.beginPath();
  if (st === 'pick' || ((t % 3) < 0.15)) { ctx.moveTo(-3.5, -14); ctx.lineTo(-2, -16); ctx.lineTo(-0.5, -14); ctx.moveTo(2.5, -14); ctx.lineTo(4, -16); ctx.lineTo(5.5, -14); ctx.stroke(); }
  else { ctx.arc(-2, -15, 1.4, 0, PI * 2); ctx.arc(4, -15, 1.4, 0, PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = C(rgba('#ff6f91', 0.55)); ctx.fillRect(-8, -11, 2.5, 1.4); ctx.fillRect(8.5, -11, 2.5, 1.4);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-6, -20, 3, 1.6, -0.5, 0, PI * 2); ctx.fill();
  // 足（ランディングギア）
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(-7, 0); ctx.moveTo(5, -4); ctx.lineTo(7, 0); ctx.stroke();
  // プロペラ
  ctx.strokeStyle = OC(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(0, -29); ctx.stroke();
  const pr = Math.sin(t * 40) * 12;
  ctx.beginPath(); ctx.ellipse(0, -30, Math.abs(pr) + 1, 2, 0, 0, PI * 2); fs(ctx, acc, 1.2);
  ctx.beginPath(); ctx.arc(0, -30, 1.8, 0, PI * 2); fs(ctx, '#ffd23f', 1);
  // ライト
  if (((t * 2) | 0) % 2 === 0) glow(ctx, 11, -14, 4, acc, 0.9);
}

// ---------------------------------------------------------------- ちびおばけ（リボン）
function ghostP(ctx, col, acc, t, st) {
  const pa = ctx.globalAlpha;
  glow(ctx, 0, -16, 18, col, 0.25);
  ctx.globalAlpha = pa * 0.9;
  const wv = t * 5;
  ctx.beginPath(); ctx.moveTo(-11, -16); ctx.bezierCurveTo(-11, -32, 11, -32, 11, -16);
  ctx.bezierCurveTo(11, -8, 10, -5, 10, -2);
  for (let i = 0; i < 4; i++) { const x0 = 10 - i * 5, x1 = 10 - (i + 1) * 5; ctx.quadraticCurveTo((x0 + x1) / 2, 2 + Math.sin(wv + i) * 2, x1, -2); }
  ctx.bezierCurveTo(-11, -6, -12, -10, -11, -16); ctx.closePath();
  if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -30, 0, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, rgba(col, 0.6)); ctx.fillStyle = g; }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.stroke();
  ctx.globalAlpha = pa;
  eyes(ctx, 1, -18, 2.4, 4, st, t, shade(acc, -0.3));
  blush(ctx, -5.5, -13.5, 2); blush(ctx, 7.5, -13.5, 2);
  mouth(ctx, 1, -13.5, 1.6, st === 'pick' ? 'open' : 'smile');
  const hw = Math.sin(t * 5) * 1.5;
  ctx.beginPath(); ctx.ellipse(12, -12 + hw, 2.6, 2, 0.5, 0, PI * 2); fs(ctx, '#ffffff', 1.2);
  bow(ctx, -6, -27, 0.7, acc);
}

// ---------------------------------------------------------------- エイリアン（ミニUFOに乗る）
function alienP(ctx, col, acc, t, st) {
  // 小さなビーム
  if (!FL) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, rgba('#9ff6ff', 0.35)); g.addColorStop(1, rgba('#9ff6ff', 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(9, 7); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 頭（UFO から顔を出す）
  ctx.save(); ctx.translate(0, -19);
  for (const sd of [-1, 1]) {
    const sw = Math.sin(t * 3 + sd) * 1.5;
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(sd * 3, -8); ctx.lineTo(sd * 6 + sw, -14); ctx.stroke();
    ctx.beginPath(); ctx.arc(sd * 6 + sw, -14.5, 1.8, 0, PI * 2); fs(ctx, '#fff27a', 1);
  }
  ctx.beginPath(); ctx.ellipse(0, -1, 10, 9, 0, 0, PI * 2); fs(ctx, col, 1.8);
  if (st === 'pick') eyes(ctx, 0.5, -1, 2.4, 3.8, st, t);
  else for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(0.5 + sd * 4, -1); ctx.rotate(sd * 0.35);
    ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 2.3, 0, 0, PI * 2); ctx.fillStyle = C('#140828'); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1, -0.8, 0.9, 0, PI * 2); ctx.fill();
    ctx.restore();
  }
  blush(ctx, -6, 3, 1.6); blush(ctx, 7, 3, 1.6);
  ctx.restore();
  // UFO
  ctx.beginPath(); ctx.ellipse(0, -9, 16, 5, 0, 0, PI * 2);
  if (FL) ctx.fillStyle = '#fff'; else { const g = ctx.createLinearGradient(0, -14, 0, -4); g.addColorStop(0, '#f4f6ff'); g.addColorStop(1, '#8a90b8'); ctx.fillStyle = g; }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -11, 11, 3, 0, PI, 0); ctx.fillStyle = C(shade('#8a90b8', 0.3)); ctx.fill();
  for (let i = 0; i < 5; i++) { const on = ((t * 6 | 0) + i) % 2; ctx.fillStyle = C(on ? acc : '#fff6a0'); ctx.beginPath(); ctx.arc(-10 + i * 5, -8, 1.3, 0, PI * 2); ctx.fill(); }
  // ガラスドーム
  if (!FL) { ctx.beginPath(); ctx.ellipse(0, -16, 12, 13, 0, PI, 0); ctx.fillStyle = 'rgba(180,230,255,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(220,250,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, -16, 9, 10, 0, PI * 1.15, PI * 1.4); ctx.stroke(); }
}

// ---------------------------------------------------------------- ドラゴンの子（パタパタ）
function dragonP(ctx, col, acc, t, st) {
  const flap = Math.sin(t * 9);
  const belly = mix(acc, '#ffffff', 0.45);
  // 尻尾
  ctx.beginPath(); ctx.moveTo(-6, -10); ctx.quadraticCurveTo(-16, -8, -19, -14 + Math.sin(t * 3) * 2); ctx.lineTo(-22, -11); ctx.lineTo(-19, -17); ctx.quadraticCurveTo(-14, -12, -6, -15); ctx.closePath(); fs(ctx, col, 1.6);
  // 奥の翼
  wingD(ctx, -2, -20, flap, shade(col, -0.25), true);
  // 胴
  ctx.beginPath(); ctx.ellipse(0, -12, 9, 9, 0, 0, PI * 2); fs(ctx, col, 2);
  ctx.fillStyle = C(belly); ctx.beginPath(); ctx.ellipse(2, -10, 5, 6.5, 0, 0, PI * 2); ctx.fill();
  ctx.strokeStyle = C(rgba(shade(acc, -0.3), 0.6)); ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(-1, -14 + k * 3); ctx.lineTo(5, -14 + k * 3); } ctx.stroke();
  // 足
  for (const lx of [-4, 4]) { ctx.beginPath(); ctx.ellipse(lx, -3.5, 3, 2.4, 0, 0, PI * 2); fs(ctx, shade(col, -0.15), 1.3); }
  // 頭
  ctx.save(); ctx.translate(5, -27);
  for (const hx of [-5, 3]) { ctx.beginPath(); ctx.moveTo(hx - 1.5, -7); ctx.quadraticCurveTo(hx - 2, -13, hx - 5, -15); ctx.quadraticCurveTo(hx + 1, -12, hx + 2, -7); ctx.closePath(); fs(ctx, acc, 1.2); }
  ctx.beginPath(); ctx.ellipse(0, 0, 10.5, 9, 0, 0, PI * 2); fs(ctx, col, 2);
  ctx.beginPath(); ctx.ellipse(7, 2.5, 6, 4.5, 0, 0, PI * 2); fs(ctx, shade(col, 0.15), 1.6);
  ctx.fillStyle = C(shade(col, -0.4)); ctx.beginPath(); ctx.arc(10, 1.5, 0.8, 0, PI * 2); ctx.fill();
  eyes(ctx, 1, -1.5, 2.4, 3.6, st, t, shade(acc, -0.4));
  blush(ctx, -4, 3.5, 1.8);
  if (st === 'pick' && !FL) { // 小さな炎
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ffb03c', 0.8);
    ctx.beginPath(); ctx.moveTo(12, 3); ctx.quadraticCurveTo(18, 0, 21, 4); ctx.quadraticCurveTo(17, 7, 12, 4.5); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  wingD(ctx, 0, -18, flap, col, false);
}
function wingD(ctx, x, y, flap, col, back) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.4 - flap * 0.5 + (back ? -0.3 : 0));
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -12); ctx.quadraticCurveTo(-10, -9, -14, -10); ctx.quadraticCurveTo(-12, -5, -14, -2); ctx.quadraticCurveTo(-8, -1, -6, 2); ctx.closePath();
  fs(ctx, col, 1.6);
  ctx.strokeStyle = C(rgba('#2a1430', 0.4)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-3, 1); ctx.moveTo(-14, -10); ctx.lineTo(-4, 0); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- イルカ（シャボンの水玉に乗って浮遊）
function dolphinP(ctx, col, acc, t, st) {
  const sw = Math.sin(t * 3) * 0.12;
  // 水玉
  if (!FL) {
    ctx.beginPath(); ctx.arc(0, -16, 17, 0, PI * 2);
    const g = ctx.createRadialGradient(-5, -22, 2, 0, -16, 17); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.8, 'rgba(120,210,255,0.14)'); g.addColorStop(1, 'rgba(160,230,255,0.4)');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(200,240,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -16, 13.5, -2.7, -2.0); ctx.stroke();
  }
  ctx.save(); ctx.translate(0, -15); ctx.rotate(sw - 0.15);
  // 尾びれ
  ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-15, -3); ctx.lineTo(-14, 2); ctx.lineTo(-16, 6); ctx.closePath(); fs(ctx, shade(col, -0.15), 1.4);
  // 体
  ctx.beginPath(); ctx.moveTo(-11, 2); ctx.bezierCurveTo(-8, -9, 6, -10, 10, -3); ctx.quadraticCurveTo(16, -1, 15, 2); ctx.quadraticCurveTo(8, 5, 2, 6); ctx.quadraticCurveTo(-6, 7, -11, 2); ctx.closePath(); fs(ctx, col, 1.8);
  ctx.fillStyle = C(shade(col, 0.6)); ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(4, 7, 13, 2); ctx.quadraticCurveTo(4, 3.5, -6, 4); ctx.fill();
  // 背びれ
  ctx.beginPath(); ctx.moveTo(-2, -7); ctx.quadraticCurveTo(-1, -13, -5, -14); ctx.quadraticCurveTo(2, -12, 3, -7.5); ctx.closePath(); fs(ctx, shade(col, -0.1), 1.3);
  // 胸びれ
  ctx.beginPath(); ctx.ellipse(1, 4, 3.6, 1.6, 0.6 + Math.sin(t * 6) * 0.3, 0, PI * 2); fs(ctx, shade(col, -0.1), 1.1);
  eyes(ctx, 7.5, -2.5, 2, 0.01, st, t, '#1a3a6a');
  blush(ctx, 9.5, 1, 1.6);
  ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(11, 1.6); ctx.quadraticCurveTo(13, 2.8, 15, 1.6); ctx.stroke();
  ctx.restore();
  // 水玉の泡
  ctx.fillStyle = C('rgba(255,255,255,0.7)');
  for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; ctx.beginPath(); ctx.arc(-8 + i * 7, -4 - k * 22, 1 + i * 0.4, 0, PI * 2); ctx.fill(); }
  bow(ctx, 9, -31, 0.55, acc);
}

// ---------------------------------------------------------------- ブリキのゼンマイロボ
function robotP(ctx, col, acc, t, st) {
  const s = walking(st) ? Math.sin(t * 12) : 0;
  const bob = walking(st) ? Math.abs(Math.cos(t * 12)) : 0;
  for (const [lx, p] of [[-4, 1], [4, -1]]) { ctx.beginPath(); rr(ctx, lx - 2.5, -7 + (p * s > 0 ? -1 : 0), 5, 7, 1.5); fs(ctx, shade(col, -0.3), 1.3); }
  ctx.translate(0, -bob);
  // ゼンマイ
  ctx.save(); ctx.translate(-10, -15); ctx.rotate(t * 3);
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, 0); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-5, -3, 1.6, 3, 0, 0, PI * 2); ctx.ellipse(-5, 3, 1.6, 3, 0, 0, PI * 2); fs(ctx, '#c0c4d0', 1.2);
  ctx.restore();
  // 胴
  ctx.beginPath(); rr(ctx, -8, -19, 16, 13, 3); fs(ctx, col, 1.8);
  ctx.beginPath(); ctx.arc(0, -12.5, 3, 0, PI * 2); fs(ctx, acc, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-6.5, -17.5, 2, 9);
  // 腕
  for (const sd of [-1, 1]) { ctx.strokeStyle = OC(); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(sd * 8, -16); ctx.lineTo(sd * 11, -10 + (sd * s) * 2); ctx.stroke(); ctx.strokeStyle = C(shade(col, -0.2)); ctx.lineWidth = 1.6; ctx.stroke(); }
  // 頭
  ctx.beginPath(); rr(ctx, -10, -34, 20, 15, 4); fs(ctx, col, 2);
  ctx.beginPath(); rr(ctx, -7.5, -31, 15, 9, 3); fs(ctx, '#2a2c3c', 1.2);
  ctx.save(); if (!FL) ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = C('#9ff6ff'); ctx.strokeStyle = C('#9ff6ff'); ctx.lineWidth = 1.4;
  if (st === 'pick') { ctx.beginPath(); ctx.moveTo(-4.5, -26); ctx.lineTo(-3, -28); ctx.lineTo(-1.5, -26); ctx.moveTo(1.5, -26); ctx.lineTo(3, -28); ctx.lineTo(4.5, -26); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(-3, -26.5, 1.5, 0, PI * 2); ctx.arc(3, -26.5, 1.5, 0, PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = C(rgba('#ff6f91', 0.6)); ctx.fillRect(-9, -23, 2.4, 1.3); ctx.fillRect(6.6, -23, 2.4, 1.3);
  // ボルト耳＋アンテナ
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 11, -27, 2, 0, PI * 2); fs(ctx, '#c0c4d0', 1); }
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -38); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -39.5, 2, 0, PI * 2); fs(ctx, acc, 1.1);
}
