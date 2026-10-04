// PET（ちびマスコット, 本体の高さ 28〜40px）。足元中央 (x,y)。
// drawPet(ctx, x, y, look, anim)
//   look = { style, color, accent }
//   anim = { facing, t, state:'idle'|'walk'|'move'|'fly'|'pick', scale, moving, noShadow, flash, affection(0..30) }
// 超レアドロップらしさ: 大きなキラキラ目・表情（まばたき/ニコッ/喜び）・質感の描き分け・ほのかな虹色リムライト・足元のキラキラ。
// 親密度 anim.affection: Lv10 リボン / Lv20 王冠 / Lv30 オーラ（値が無ければ何も付かない）。
import { shade, rgba, rr, mix } from './util.js';
import { FL, setFL, C, OC, glow } from './mkit.js';

const PI = Math.PI, TAU = PI * 2;
export const PET_STYLES = ['slimePet', 'flamingoPet', 'gatorPet', 'catPet', 'dronePet', 'ghostPet', 'alienPet', 'dragonPet', 'dolphinPet', 'robotPet'];
const PET_DEF = {
  slimePet: ['#7cf0ff', '#ff6fb5'], flamingoPet: ['#ff8fc0', '#3ee6d2'], gatorPet: ['#6cc04a', '#ffd23f'], catPet: ['#ffb36b', '#ff4fa0'],
  dronePet: ['#e8ecf8', '#19f0ff'], ghostPet: ['#f2f0ff', '#b47cff'], alienPet: ['#7cff6a', '#ff4fd8'], dragonPet: ['#b47cff', '#ffd23f'],
  dolphinPet: ['#5ab8ff', '#ff9ad5'], robotPet: ['#ffd23f', '#ff3d7f'],
};
/** 空を飛ぶ（地面影を薄く・上下にふわふわ）スタイル */
export const PET_FLYING = { dronePet: 1, ghostPet: 1, alienPet: 1, dragonPet: 1, dolphinPet: 1 };
/** Lv30 オーラの中心と半径（ペットのローカル座標） */
const AURA = {
  slimePet: [0, -13, 21], flamingoPet: [3, -20, 23], gatorPet: [0, -16, 22], catPet: [1, -17, 21], dronePet: [0, -16, 20],
  ghostPet: [0, -17, 20], alienPet: [0, -16, 21], dragonPet: [1, -19, 23], dolphinPet: [0, -16, 21], robotPet: [0, -19, 21],
};

let RIM = null;      // 虹色リムライト（drawPet 毎に生成）
let ANC = {};        // 親密度小物の取り付け位置（変換行列ごと保存）

export function drawPet(ctx, x, y, look, anim) {
  look = look || {};
  anim = anim || {};
  const style = PET_DEF[look.style] ? look.style : 'slimePet';
  const d = PET_DEF[style];
  const col = look.color || d[0], acc = look.accent || d[1];
  const t = anim.t || 0;
  const raw = anim.state || 'idle';
  const st = raw === 'pick' ? 'pick' : (raw === 'walk' || raw === 'move' || anim.moving) ? 'walk' : raw === 'fly' ? 'fly' : 'idle';
  const s = anim.scale || 1;
  const fly = !!PET_FLYING[style];
  const aff = +anim.affection || 0;
  const lv = aff >= 30 ? 3 : aff >= 20 ? 2 : aff >= 10 ? 1 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 影
  if (!anim.noShadow) {
    ctx.beginPath(); ctx.ellipse(0, 0, 10 * s * (fly ? 0.8 + Math.sin(t * 3) * 0.06 : 1), 2.6 * s, 0, 0, TAU);
    ctx.fillStyle = fly ? 'rgba(20,0,30,0.16)' : 'rgba(20,0,30,0.28)'; ctx.fill();
  }
  ctx.scale((anim.facing < 0 ? -1 : 1) * s, s);
  setFL(!!anim.flash);
  if (!anim.noShadow && !FL) footSparkle(ctx, t, acc);
  const pick = st === 'pick';
  if (pick) { // 喜びジャンプ（伸び縮み）
    const j = Math.abs(Math.sin(t * 9));
    ctx.translate(0, -j * 8);
    ctx.scale(1 - j * 0.06 + (1 - j) * 0.08, 1 + j * 0.08 - (1 - j) * 0.08);
  }
  if (fly) ctx.translate(0, -8 + Math.sin(t * 3) * 2.5);
  RIM = FL ? null : rimGrad(ctx, t);
  ANC = {};
  const [ax, ay, ar] = AURA[style];
  if (lv >= 3 && !FL) auraBack(ctx, ax, ay, ar, t, col, acc);
  else if (!FL && !anim.noShadow) glow(ctx, ax, ay, ar * 0.9, mix(col, '#ffffff', 0.3), 0.1);
  const E = expr(t, st);
  switch (style) {
    case 'slimePet': slimeP(ctx, col, acc, t, st, E); break;
    case 'flamingoPet': flamingoP(ctx, col, acc, t, st, E); break;
    case 'gatorPet': gatorP(ctx, col, acc, t, st, E); break;
    case 'catPet': catP(ctx, col, acc, t, st, E); break;
    case 'dronePet': droneP(ctx, col, acc, t, st, E); break;
    case 'ghostPet': ghostP(ctx, col, acc, t, st, E); break;
    case 'alienPet': alienP(ctx, col, acc, t, st, E); break;
    case 'dragonPet': dragonP(ctx, col, acc, t, st, E); break;
    case 'dolphinPet': dolphinP(ctx, col, acc, t, st, E); break;
    case 'robotPet': robotP(ctx, col, acc, t, st, E); break;
  }
  if (lv >= 1) atAnchor(ctx, 'bow', () => bigBow(ctx, lv >= 3 ? '#ff4f9a' : acc === col ? '#ff4f9a' : acc));
  if (lv >= 2) atAnchor(ctx, 'top', () => crown(ctx, t));
  if (lv >= 3 && !FL) auraFront(ctx, ax, ay, ar, t);
  if (pick && !FL) { hearts(ctx, 6, ay - ar * 0.9, t); sparkle(ctx, -8, ay - ar * 0.7, t); }
  RIM = null;
  setFL(false);
  ctx.restore();
}

// ---------------------------------------------------------------- 表情
/** idle: まばたき（たまに2連）＋ときどきニコッ / walk: 目パッチリ / pick: ^ ^ */
function expr(t, st) {
  if (st === 'pick') return { e: 'happy', m: 'open' };
  const c = ((t % 6.4) + 6.4) % 6.4;
  if ((c > 2.6 && c < 2.73) || (c > 2.9 && c < 3.02)) return { e: 'blink', m: 'smile' };
  if (st !== 'walk' && c > 3.7 && c < 4.7) return { e: 'happy', m: 'open' };
  return { e: 'open', m: 'smile' };
}

// ---------------------------------------------------------------- 共通パーツ
function rimGrad(ctx, t) {
  const g = ctx.createLinearGradient(-20, -40, 20, 4);
  const h = (t * 50) % 360;
  for (let i = 0; i <= 5; i++) g.addColorStop(i / 5, `hsla(${(h + i * 62) % 360},100%,72%,0.85)`);
  return g;
}
/** 現在のパスを 虹リム → 塗り → 輪郭 の順で描く */
function paint(ctx, fill, lw = 2, rim = true) {
  if (rim && RIM) { ctx.save(); ctx.globalAlpha *= 0.42; ctx.strokeStyle = RIM; ctx.lineWidth = lw + 2.2; ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = FL ? '#ffffff' : fill; ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke();
}
/** ふんわり立体（左上ハイライト） */
function vol(ctx, col, cx, cy, r, hi = 0.5, lo = -0.3) {
  if (FL) return '#ffffff';
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.25);
  g.addColorStop(0, mix(col, '#ffffff', hi)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, lo));
  return g;
}
/** メタル（鋭いハイライト帯） */
function metal(ctx, col, x0, y0, x1, y1) {
  if (FL) return '#ffffff';
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(col, -0.4)); g.addColorStop(0.2, col); g.addColorStop(0.34, mix(col, '#ffffff', 0.85));
  g.addColorStop(0.46, mix(col, '#ffffff', 0.2)); g.addColorStop(0.78, shade(col, -0.12)); g.addColorStop(1, shade(col, -0.45));
  return g;
}
/** 現在のパスでクリップして内側に描く */
function inside(ctx, fn) { if (FL) return; ctx.save(); ctx.clip(); fn(); ctx.restore(); }

/** 大きなキラキラ目。mode: open | blink | happy。opt: { slit, lash, lid } */
function eye(ctx, cx, cy, r, iris, mode, o) {
  o = o || {};
  const rx = r * 0.8;
  if (mode === 'blink') {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.3, r * 0.34); ctx.beginPath();
    ctx.moveTo(cx - rx, cy); ctx.quadraticCurveTo(cx, cy + r * 0.6, cx + rx, cy); ctx.stroke();
    if (o.lash) { const sd = o.side || 1; ctx.beginPath(); ctx.moveTo(cx + sd * rx, cy); ctx.lineTo(cx + sd * (rx + r * 0.35), cy - r * 0.25); ctx.stroke(); }
    return;
  }
  if (mode === 'happy') {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.4, r * 0.4); ctx.beginPath();
    ctx.moveTo(cx - rx, cy + r * 0.3); ctx.quadraticCurveTo(cx, cy - r * 0.95, cx + rx, cy + r * 0.3); ctx.stroke();
    return;
  }
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, r, 0, 0, TAU); ctx.fillStyle = FL ? '#ffffff' : '#1a0f24'; ctx.fill();
  if (!FL) {
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, r, 0, 0, TAU); ctx.clip();
    const g = ctx.createLinearGradient(0, cy - r * 0.6, 0, cy + r);
    g.addColorStop(0, shade(iris, -0.6)); g.addColorStop(0.5, iris); g.addColorStop(1, mix(iris, '#ffffff', 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.16, rx * 0.86, r * 0.84, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(12,4,22,0.85)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.08, rx * (o.slit ? 0.2 : 0.42), r * (o.slit ? 0.62 : 0.44), 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx + rx * 0.3, cy - r * 0.38, r * 0.36, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - rx * 0.38, cy + r * 0.44, r * 0.17, 0, TAU); ctx.fill();
  if (r >= 3) { ctx.beginPath(); ctx.arc(cx + rx * 0.5, cy + r * 0.2, r * 0.08, 0, TAU); ctx.fill(); }
  const sd = o.side || 1;
  ctx.strokeStyle = OC();
  if (o.lid) { // アイライン（上まぶた＋はね）: かっこよさ
    ctx.lineWidth = Math.max(1, r * 0.3); ctx.beginPath(); ctx.ellipse(cx, cy, rx, r, 0, PI * 1.08, PI * 1.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + sd * rx * 0.9, cy - r * 0.45); ctx.lineTo(cx + sd * (rx + r * 0.5), cy - r * 0.8); ctx.stroke();
  }
  if (o.lash) { // まつげ（外側に2本）
    ctx.lineWidth = Math.max(0.9, r * 0.2); ctx.beginPath();
    ctx.moveTo(cx + sd * rx * 0.75, cy - r * 0.68); ctx.lineTo(cx + sd * (rx + r * 0.35), cy - r * 1.0);
    ctx.moveTo(cx + sd * rx * 0.98, cy - r * 0.25); ctx.lineTo(cx + sd * (rx + r * 0.45), cy - r * 0.42); ctx.stroke();
  }
}
function eyes2(ctx, x, y, r, gap, iris, mode, o) { o = o || {}; eye(ctx, x - gap, y, r, iris, mode, { ...o, side: -1 }); eye(ctx, x + gap, y, r, iris, mode, { ...o, side: 1 }); }
function cheek(ctx, x, y, r) {
  ctx.fillStyle = C('rgba(255,100,150,0.55)');
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU); ctx.fill();
  if (!FL && r >= 2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y + r * 0.2); ctx.lineTo(x - r * 0.15, y - r * 0.25); ctx.moveTo(x + r * 0.05, y + r * 0.2); ctx.lineTo(x + r * 0.35, y - r * 0.25); ctx.stroke();
  }
}
/** 口: smile | open | w */
function mouthK(ctx, x, y, s, kind) {
  ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.1, s * 0.4); ctx.beginPath();
  if (kind === 'open') {
    ctx.moveTo(x - s * 1.1, y - s * 0.2); ctx.quadraticCurveTo(x, y - s * 0.05, x + s * 1.1, y - s * 0.2); ctx.quadraticCurveTo(x + s * 0.9, y + s * 1.5, x, y + s * 1.5); ctx.quadraticCurveTo(x - s * 0.9, y + s * 1.5, x - s * 1.1, y - s * 0.2); ctx.closePath();
    ctx.fillStyle = C('#b5243f'); ctx.fill();
    if (!FL) { ctx.save(); ctx.clip(); ctx.fillStyle = '#ff7f9c'; ctx.beginPath(); ctx.ellipse(x, y + s * 1.45, s * 0.75, s * 0.6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.stroke(); return;
  }
  if (kind === 'w') { ctx.moveTo(x - s, y - s * 0.1); ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.9, x, y); ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.9, x + s, y - s * 0.1); }
  else { ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x, y + s * 1.1, x + s, y); }
  ctx.stroke();
}
function star4(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath();
}
function heartPath(ctx, x, y, s) {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.9, y - s * 1.1, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.9, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9); ctx.closePath();
}
/** 足元のキラキラ（レア感） */
function footSparkle(ctx, t, acc) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const pts = [[-13, -1, 0], [11, -2, 1.7], [4, 1, 3.1], [-5, -3, 4.4]];
  for (const [px, py, ph] of pts) {
    const k = Math.sin(t * 2.2 + ph); if (k <= 0) continue;
    ctx.globalAlpha = k * 0.85; ctx.fillStyle = ph > 3 ? mix(acc, '#ffffff', 0.5) : '#fff6c0';
    star4(ctx, px, py - (1 - k) * 2, 0.8 + k * 1.8); ctx.fill();
  }
  ctx.restore();
}
function sparkle(ctx, x, y, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const k = (t * 2 + i / 3) % 1;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = i === 1 ? '#9ff6ff' : '#fff6a0';
    star4(ctx, x + Math.cos(i * 2.1) * 8 * k, y - k * 10 + i * 3, 3.5); ctx.fill();
  }
  ctx.restore();
}
function hearts(ctx, x, y, t) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.8 + i / 3) % 1;
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
    const hx = x + Math.sin(k * 6 + i * 2) * 3 + (i - 1) * 7, hy = y - k * 14, s = 2.4 + (i === 1 ? 1 : 0) + k;
    heartPath(ctx, hx, hy, s); ctx.fillStyle = i === 1 ? '#ff4f9a' : '#ff8fc0'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  ctx.restore();
}
function smallBow(ctx, x, y, s, col, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(sd * 3, -6, sd * 8, -5, sd * 7.5, 0); ctx.bezierCurveTo(sd * 8, 5, sd * 3, 6, 0, 0); ctx.closePath();
    paint(ctx, vol(ctx, col, sd * 4, -1, 5, 0.55, -0.25), 1.3, false);
  }
  ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); paint(ctx, shade(col, -0.15), 1.1, false);
  ctx.restore();
}

// ---------------------------------------------------------------- 親密度の小物
function anchor(ctx, k, x, y, rot = 0) { if (ctx.getTransform) ANC[k] = [ctx.getTransform(), x, y, rot]; }
function atAnchor(ctx, k, fn) {
  const a = ANC[k]; if (!a) return;
  ctx.save(); ctx.setTransform(a[0]); ctx.translate(a[1], a[2]); ctx.rotate(a[3]); fn(); ctx.restore();
}
function bigBow(ctx, col) {
  // しっぽ付きの大きめリボン
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sd * 2.5, 6); ctx.lineTo(sd * 1, 5.2); ctx.lineTo(sd * 0.2, 6.4); ctx.closePath(); paint(ctx, shade(col, -0.15), 1.1, false); }
  smallBow(ctx, 0, 0, 0.75, col);
  if (!FL) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-3.6, -1.4, 0.7, 0, TAU); ctx.arc(3.2, -1.6, 0.6, 0, TAU); ctx.fill(); }
}
function crown(ctx, t) {
  ctx.beginPath();
  ctx.moveTo(-5.5, 0); ctx.lineTo(-6.2, -6); ctx.lineTo(-3, -3); ctx.lineTo(0, -7.5); ctx.lineTo(3, -3); ctx.lineTo(6.2, -6); ctx.lineTo(5.5, 0); ctx.closePath();
  paint(ctx, metal(ctx, '#ffd23f', -6, -7, 6, 0), 1.3, false);
  ctx.fillStyle = C('#ff3d7f'); ctx.beginPath(); ctx.arc(0, -2, 1.3, 0, TAU); ctx.fill();
  ctx.fillStyle = C('#3ee6d2'); ctx.beginPath(); ctx.arc(-3.6, -1.6, 0.8, 0, TAU); ctx.arc(3.6, -1.6, 0.8, 0, TAU); ctx.fill();
  for (const [px, py] of [[-6.2, -6], [0, -7.5], [6.2, -6]]) { ctx.beginPath(); ctx.arc(px, py, 1.1, 0, TAU); paint(ctx, '#fff6c0', 0.8, false); }
  if (!FL) { const k = Math.max(0, Math.sin(t * 2.5)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; star4(ctx, 4, -5, 2.6); ctx.fill(); ctx.restore(); }
}
function auraBack(ctx, x, y, r, t, col, acc) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.25);
  g.addColorStop(0, rgba('#fff2a8', 0.32)); g.addColorStop(0.55, rgba(mix(col, acc, 0.5), 0.2)); g.addColorStop(1, rgba(acc, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, TAU); ctx.fill();
  // ゆっくり回る光の筋
  ctx.translate(x, y); ctx.rotate(t * 0.6);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    const lg = ctx.createLinearGradient(0, 0, r * 1.2, 0); lg.addColorStop(0, rgba('#fff6c0', 0.28)); lg.addColorStop(1, rgba('#fff6c0', 0));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.2, -1.8); ctx.lineTo(r * 1.2, 1.8); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function auraFront(ctx, x, y, r, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = t * 1.6 + i * TAU / 4;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.42 + 4;
    if (Math.sin(a) < -0.2) continue; // 奥側は隠す
    ctx.globalAlpha = 0.6 + Math.sin(a) * 0.4;
    ctx.fillStyle = `hsl(${(i * 90 + t * 60) % 360},100%,80%)`; star4(ctx, px, py, 2.4); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- スライム（ぷにぷにゼリー＋双葉）
function slimeP(ctx, col, acc, t, st, E) {
  let hop = 0, sx = 1, sy = 1;
  if (st === 'walk') { const p = (t * 3) % 1; hop = Math.sin(p * PI); const land = Math.max(0, 1 - hop * 3); sx = 1 + land * 0.14 - hop * 0.05; sy = 1 - land * 0.14 + hop * 0.07; }
  else { const b = Math.sin(t * 3.2); sx = 1 + b * 0.035; sy = 1 - b * 0.035; }
  ctx.translate(0, -hop * 7);
  const W = 14.5 * sx, H = 25 * sy;
  const path = () => { ctx.beginPath(); ctx.moveTo(-W, 0); ctx.bezierCurveTo(-W * 1.12, -H * 0.62, -W * 0.55, -H, 0, -H); ctx.bezierCurveTo(W * 0.55, -H, W * 1.12, -H * 0.62, W, 0); ctx.quadraticCurveTo(0, 2.4, -W, 0); ctx.closePath(); };
  path(); paint(ctx, vol(ctx, col, -1, -H * 0.55, H * 0.75, 0.75, -0.35), 2);
  inside(ctx, () => {
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(1, 0.5, W * 0.8, 4, 0, 0, TAU); ctx.fill(); // 底の屈折光
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.7;
    for (const [bx, by, br, sp] of [[-7, -5, 1.4, 0.9], [8, -8, 1, 1.3], [-3, -10, 0.8, 0.7]]) {
      const yy = by - ((t * sp) % 1) * 4; ctx.beginPath(); ctx.arc(bx, yy, br, 0, TAU); ctx.stroke();
    }
  });
  // つやつやハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(-W * 0.48, -H * 0.66, 3.4, 2, -0.75, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-W * 0.18, -H * 0.86, 1.1, 0, TAU); ctx.fill();
  const iris = mix(shade(col, -0.35), '#3a5cff', 0.35);
  eyes2(ctx, 1.5, -H * 0.43, 4.4, 5.4, iris, E.e);
  cheek(ctx, -6.8, -H * 0.24, 2.6); cheek(ctx, 10, -H * 0.24, 2.6);
  mouthK(ctx, 1.5, -H * 0.25, 1.6, E.m === 'open' ? 'open' : 'w');
  // 双葉（ゆらゆら）
  const sw = Math.sin(t * 3) * 0.2 + (st === 'walk' ? -hop * 0.3 : 0);
  ctx.save(); ctx.translate(2, -H + 0.5); ctx.rotate(sw);
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -5.5); ctx.stroke(); ctx.strokeStyle = C('#5ac85a'); ctx.lineWidth = 1.2; ctx.stroke();
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.quadraticCurveTo(sd * 3, -12, sd * 8.5, -9); ctx.quadraticCurveTo(sd * 4.5, -4.5, 0, -5.5);
    paint(ctx, vol(ctx, sd < 0 ? '#7ce05a' : acc, sd * 5, -9, 4, 0.5, -0.2), 1.3, false);
    ctx.strokeStyle = C('rgba(255,255,255,0.6)'); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(sd * 1.5, -6.5); ctx.quadraticCurveTo(sd * 4, -9, sd * 6.5, -8.8); ctx.stroke();
  }
  ctx.restore();
  anchor(ctx, 'top', -6, -H + 2.5, -0.35);
  anchor(ctx, 'bow', 11, -H * 0.62, 0.4);
}

// ---------------------------------------------------------------- フラミンゴのヒナ（ふわふわ羽毛）
function fluff(ctx, cx, cy, rx, ry, n, amp, a0 = 0) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    if (i === 0) { ctx.moveTo(px, py); continue; }
    const am = a - PI / n, k = 1 + amp;
    ctx.quadraticCurveTo(cx + Math.cos(am) * rx * k, cy + Math.sin(am) * ry * k, px, py);
  }
  ctx.closePath();
}
function flamingoP(ctx, col, acc, t, st, E) {
  const wk = st === 'walk', ph = t * 10;
  const s = wk ? Math.sin(ph) : 0;
  const legC = shade(col, -0.12);
  for (const [lx, p] of [[-3, 1], [3, -1]]) {
    const fx = lx + p * s * 3, kx = lx + 1.6 + p * s * 1.5;
    ctx.beginPath(); ctx.moveTo(lx, -10); ctx.lineTo(kx, -5); ctx.lineTo(fx, -0.8);
    ctx.strokeStyle = OC(); ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = C(legC); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx - 1.5, 0); ctx.lineTo(fx + 3.5, 0); ctx.lineTo(fx + 1, -1.8); ctx.closePath(); paint(ctx, legC, 1, false);
  }
  const bob = wk ? Math.abs(Math.cos(ph)) * 1.5 : Math.sin(t * 2) * 0.5;
  ctx.translate(0, -bob);
  // しっぽ羽
  for (const [a, l] of [[-0.5, 6], [-0.1, 7], [0.3, 5.5]]) {
    ctx.save(); ctx.translate(-9.5, -16); ctx.rotate(PI + a);
    ctx.beginPath(); ctx.ellipse(l * 0.5, 0, l * 0.6, 2, 0, 0, TAU); paint(ctx, shade(col, -0.1), 1.2, false); ctx.restore();
  }
  // 体（ふわふわ）
  fluff(ctx, -1, -15, 10.5, 7.8, 11, 0.12, 0.3); paint(ctx, vol(ctx, col, -1, -16, 10, 0.55, -0.25), 2);
  // 翼（羽ばたき）
  const wf = st === 'pick' ? Math.sin(t * 24) * 0.5 : wk ? Math.sin(ph) * 0.15 : Math.sin(t * 2.5) * 0.06;
  ctx.save(); ctx.translate(2, -18); ctx.rotate(-0.1 + wf);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -3, -10, 0); ctx.quadraticCurveTo(-9.5, 2.5, -7, 2.4); ctx.quadraticCurveTo(-6.5, 4.5, -4, 4); ctx.quadraticCurveTo(-2, 5.5, 0, 3.5); ctx.closePath();
  paint(ctx, vol(ctx, mix(col, '#ffffff', 0.35), -4, 1, 6, 0.5, -0.15), 1.4, false);
  ctx.restore();
  // 首
  ctx.beginPath(); ctx.moveTo(5, -19); ctx.quadraticCurveTo(9.5, -22.5, 6.5, -27);
  ctx.strokeStyle = OC(); ctx.lineWidth = 6.6; ctx.stroke(); ctx.strokeStyle = C(col); ctx.lineWidth = 3.8; ctx.stroke();
  // 頭（ふわ毛つき）
  const hx = 7.5, hy = -29;
  for (const [a, l] of [[-1.9, 4], [-1.55, 5], [-1.2, 3.6]]) {
    ctx.save(); ctx.translate(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8); ctx.rotate(a + Math.sin(t * 3) * 0.1);
    ctx.beginPath(); ctx.ellipse(l * 0.4, 0, l * 0.55, 1.6, 0, 0, TAU); paint(ctx, col, 1.1, false); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(hx, hy, 9.2, 0, TAU); paint(ctx, vol(ctx, col, hx, hy, 9.2, 0.6, -0.2), 2);
  // くちばし（くの字）
  ctx.beginPath(); ctx.moveTo(15, -31); ctx.quadraticCurveTo(20.5, -31.5, 20.5, -26.5); ctx.lineTo(18.5, -25.5); ctx.quadraticCurveTo(18, -28, 15.3, -27.2); ctx.closePath(); paint(ctx, '#fff2dc', 1.2, false);
  ctx.beginPath(); ctx.moveTo(19, -30.6); ctx.quadraticCurveTo(20.6, -29.5, 20.5, -26.5); ctx.lineTo(18.5, -25.5); ctx.quadraticCurveTo(18.7, -28, 18, -29.5); ctx.closePath(); ctx.fillStyle = C('#2a1430'); ctx.fill();
  eyes2(ctx, 7.6, -29.5, 3.5, 3.4, '#b0306a', E.e, { lash: true });
  cheek(ctx, 3, -25.2, 2); cheek(ctx, 13, -25, 1.8);
  if (E.m === 'open') mouthK(ctx, 16.5, -27.8, 1, 'open');
  smallBow(ctx, 2, -37, 0.6, acc, -0.3);
  anchor(ctx, 'top', 9.5, -37.5, 0.15);
  anchor(ctx, 'bow', 4, -20, 0);
}

// ---------------------------------------------------------------- ワニの赤ちゃん（うろこ＋よだれかけ）
function gatorP(ctx, col, acc, t, st, E) {
  const wk = st === 'walk';
  const s = wk ? Math.sin(t * 10) : 0;
  const bob = wk ? Math.abs(Math.cos(t * 10)) * 1.2 : 0;
  const tw = Math.sin(t * 4) * 2 + s * 1.5;
  const dk = shade(col, -0.28);
  // 奥の足
  for (const lx of [-7, 5]) { ctx.beginPath(); ctx.ellipse(lx - s * 2, -2.6, 3.4, 2.6, 0, 0, TAU); paint(ctx, dk, 1.3, false); }
  ctx.translate(0, -bob);
  // しっぽ（背びれつき）
  ctx.beginPath(); ctx.moveTo(-9, -12); ctx.quadraticCurveTo(-17, -10 + tw * 0.5, -23, -3 + tw); ctx.quadraticCurveTo(-16, -2, -9, -4); ctx.closePath();
  paint(ctx, vol(ctx, col, -14, -7, 7, 0.4, -0.3), 1.8);
  for (let i = 0; i < 3; i++) { const k = i / 3, px = -11 - k * 9, py = -11 + k * 6 + tw * k * 0.8; ctx.beginPath(); ctx.moveTo(px - 1.6, py + 0.6); ctx.lineTo(px - 0.5, py - 2.4); ctx.lineTo(px + 1.4, py + 0.4); ctx.closePath(); paint(ctx, dk, 1, false); }
  // 背中のトゲ
  for (const px of [-6, -2, 2]) { ctx.beginPath(); ctx.moveTo(px - 2, -16.5); ctx.lineTo(px, -20); ctx.lineTo(px + 2, -16.8); ctx.closePath(); paint(ctx, dk, 1.1, false); }
  // 胴
  ctx.beginPath(); ctx.ellipse(0, -10, 11.5, 8.5, 0, 0, TAU); paint(ctx, vol(ctx, col, 0, -11, 10, 0.5, -0.3), 2);
  inside(ctx, () => {
    ctx.fillStyle = rgba(shade(col, -0.35), 0.5);
    for (const [px, py, r] of [[-6, -13, 1.4], [-3, -15.5, 1], [-8.5, -9, 1]]) { ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f6f2c0'; ctx.beginPath(); ctx.ellipse(2, -5.2, 8, 4.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(160,140,60,0.45)'; ctx.lineWidth = 0.7; ctx.beginPath();
    for (const px of [-2, 1.5, 5]) { ctx.moveTo(px, -8.8); ctx.quadraticCurveTo(px + 0.6, -5, px, -1.5); } ctx.stroke();
  });
  // 手前の足
  for (const lx of [-4, 7]) { ctx.beginPath(); ctx.ellipse(lx + s * 2, -2.3, 3.6, 2.7, 0, 0, TAU); paint(ctx, shade(col, -0.12), 1.4, false); ctx.fillStyle = C('#ffffff'); for (const k of [-1.5, 0, 1.5]) { ctx.beginPath(); ctx.arc(lx + s * 2 + 2.5, -2.3 + k, 0.55, 0, TAU); ctx.fill(); } }
  // 頭
  ctx.save(); ctx.translate(6, -22);
  const tilt = st === 'pick' ? -0.12 : Math.sin(t * 1.7) * 0.04; ctx.rotate(tilt);
  ctx.beginPath(); ctx.moveTo(-10, 6); ctx.bezierCurveTo(-12.5, -8, 6, -11, 10, -4); ctx.quadraticCurveTo(18, -2.5, 17.5, 3.5); ctx.quadraticCurveTo(4, 9.5, -10, 6); ctx.closePath();
  paint(ctx, vol(ctx, col, 0, -3, 11, 0.5, -0.3), 2);
  // 目のこぶ
  for (const ex of [-3, 4.6]) { ctx.beginPath(); ctx.arc(ex, -5.6, 4.9, PI * 1.02, PI * 1.98); ctx.closePath(); paint(ctx, vol(ctx, col, ex, -7, 5, 0.55, -0.2), 1.6, false); }
  eyes2(ctx, 0.8, -5.2, 3.7, 3.8, '#c79a1a', E.e);
  ctx.fillStyle = C(shade(col, -0.45)); ctx.beginPath(); ctx.arc(15.6, -0.4, 0.8, 0, TAU); ctx.arc(13.4, -1, 0.7, 0, TAU); ctx.fill();
  if (E.m === 'open') {
    ctx.beginPath(); ctx.moveTo(4, 3.4); ctx.quadraticCurveTo(11, 4.5, 16, 2.8); ctx.quadraticCurveTo(11, 9, 5, 4.6); ctx.closePath(); paint(ctx, '#b5243f', 1.1, false);
    ctx.fillStyle = C('#ff7f9c'); ctx.beginPath(); ctx.ellipse(9.5, 5.8, 2.6, 1.1, 0, 0, TAU); ctx.fill();
  } else { ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(4, 3.6); ctx.quadraticCurveTo(10.5, 6, 16, 2.8); ctx.stroke(); }
  ctx.fillStyle = C('#ffffff'); for (const tx of [8, 12]) { ctx.beginPath(); ctx.moveTo(tx, 4.8); ctx.lineTo(tx + 0.9, 6.6); ctx.lineTo(tx + 1.8, 4.6); ctx.fill(); }
  cheek(ctx, -5.5, 2, 2.2); cheek(ctx, 7, 2.4, 2);
  anchor(ctx, 'top', 0.8, -10.2, 0);
  anchor(ctx, 'bow', -8.5, -4, -0.6);
  ctx.restore();
  // よだれかけ（ハート柄）
  ctx.beginPath(); ctx.moveTo(-1, -17); ctx.quadraticCurveTo(4.5, -7.5, 11, -16); ctx.quadraticCurveTo(5, -14, -1, -17); paint(ctx, acc, 1.3, false);
  heartPath(ctx, 5, -13.4, 1.3); ctx.fillStyle = C('#ffffff'); ctx.fill();
}

// ---------------------------------------------------------------- ネコ（ふわふわ毛並み＋首輪の鈴）
function catP(ctx, col, acc, t, st, E) {
  const wk = st === 'walk';
  const s = wk ? Math.sin(t * 11) : 0;
  const bob = wk ? Math.abs(Math.cos(t * 11)) * 1.4 : Math.sin(t * 2.4) * 0.4;
  const light = mix(col, '#ffffff', 0.6), dk = shade(col, -0.28);
  // 尻尾（ゆらゆら・先っぽ濃い）
  const sw = Math.sin(t * 3) * (wk ? 1.5 : 1);
  ctx.beginPath(); ctx.moveTo(-7, -7); ctx.bezierCurveTo(-17, -7, -18, -16, -14 + sw * 3, -23);
  ctx.strokeStyle = OC(); ctx.lineWidth = 6.2; ctx.stroke(); ctx.strokeStyle = C(col); ctx.lineWidth = 3.8; ctx.stroke();
  ctx.beginPath(); ctx.arc(-14 + sw * 3, -23, 1.9, 0, TAU); ctx.fillStyle = C(dk); ctx.fill();
  // 後ろ足
  for (const [lx, p] of [[-5, 1], [5, -1]]) {
    ctx.beginPath(); ctx.ellipse(lx + s * 2.4 * p, -2.5, 3.6, 2.7, 0, 0, TAU); paint(ctx, light, 1.3, false);
    ctx.strokeStyle = C(rgba('#2a1430', 0.45)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(lx + s * 2.4 * p + 0.8, -3.5); ctx.lineTo(lx + s * 2.4 * p + 0.8, -1.8); ctx.moveTo(lx + s * 2.4 * p + 2.2, -3.3); ctx.lineTo(lx + s * 2.4 * p + 2.2, -1.9); ctx.stroke();
  }
  ctx.translate(0, -bob);
  fluff(ctx, 0, -9, 9.3, 7.2, 10, 0.08, 0.2); paint(ctx, vol(ctx, col, 0, -10, 9, 0.5, -0.3), 2);
  ctx.fillStyle = C(light); ctx.beginPath(); ctx.moveTo(-1, -14); ctx.lineTo(1, -10); ctx.lineTo(2.5, -13); ctx.lineTo(4, -9.5); ctx.lineTo(6, -13.5); ctx.quadraticCurveTo(3, -4, -1, -14); ctx.fill();
  // 頭
  ctx.save(); ctx.translate(2, -23);
  const tilt = st === 'pick' ? 0 : E.e === 'happy' ? 0.12 : Math.sin(t * 1.3) * 0.05; ctx.rotate(tilt);
  for (const sd of [-1, 1]) {
    const tw = sd > 0 && ((t % 5) < 0.18) ? -0.2 : 0; // 耳ピクッ
    ctx.save(); ctx.translate(sd * 7, -7); ctx.rotate(tw * sd);
    ctx.beginPath(); ctx.moveTo(-sd * 4, -1); ctx.quadraticCurveTo(sd * 1, -8, sd * 3.5, -8.5); ctx.quadraticCurveTo(sd * 5, -4, sd * 4.5, 3); ctx.closePath(); paint(ctx, vol(ctx, col, sd * 2, -4, 5), 1.8);
    ctx.fillStyle = C('#ffb0c8'); ctx.beginPath(); ctx.moveTo(-sd * 1.5, -1); ctx.quadraticCurveTo(sd * 1.5, -5.5, sd * 3, -6); ctx.quadraticCurveTo(sd * 3.6, -3, sd * 3, 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C('rgba(255,255,255,0.85)'); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(sd * 1.2, -1); ctx.lineTo(sd * 2.6, -4); ctx.moveTo(sd * 2.2, -0.5); ctx.lineTo(sd * 3.2, -3); ctx.stroke();
    ctx.restore();
  }
  // ほっぺのふわ毛
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 10.5, -2); ctx.lineTo(sd * 14.4, 1); ctx.lineTo(sd * 11.6, 2.2); ctx.lineTo(sd * 13.8, 5); ctx.lineTo(sd * 8.5, 6.5); ctx.closePath(); paint(ctx, col, 1.6, false); }
  ctx.beginPath(); ctx.ellipse(0, -0.5, 12.2, 10.2, 0, 0, TAU); paint(ctx, vol(ctx, col, 0, -1, 11, 0.55, -0.25), 2);
  inside(ctx, () => {
    ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(-3.4, -10.5); ctx.lineTo(-1.8, -6); ctx.lineTo(-0.4, -10.8); ctx.moveTo(0.4, -10.8); ctx.lineTo(1.8, -5.4); ctx.lineTo(3.2, -10.8); ctx.moveTo(4.4, -10.4); ctx.lineTo(5.6, -6.6); ctx.lineTo(6.8, -9.8); ctx.fill();
    ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(1, 5.4, 6, 4, 0, 0, TAU); ctx.fill();
  });
  eyes2(ctx, 1, -1.2, 4.3, 5.3, '#36c47a', E.e, { slit: true, lash: true });
  ctx.fillStyle = C('#ff7fa8'); ctx.beginPath(); ctx.moveTo(-0.3, 2.6); ctx.lineTo(2.3, 2.6); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
  mouthK(ctx, 1, 4.2, 1.6, E.m === 'open' ? 'open' : 'w');
  cheek(ctx, -7.2, 3.6, 2.3); cheek(ctx, 9.2, 3.6, 2.3);
  ctx.strokeStyle = C(rgba('#2a1430', 0.55)); ctx.lineWidth = 0.7; ctx.beginPath();
  for (const sd of [-1, 1]) { const bx = 1 + sd * 7.5; ctx.moveTo(bx, 2.2); ctx.lineTo(bx + sd * 6.5, 1); ctx.moveTo(bx, 3.6); ctx.lineTo(bx + sd * 6.5, 4.2); }
  ctx.stroke();
  anchor(ctx, 'top', 1, -10, 0);
  anchor(ctx, 'bow', -8.5, -8.5, -0.5);
  ctx.restore();
  // 首輪＋金の鈴
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(-5, -14.5); ctx.quadraticCurveTo(3, -11, 10, -14.5); ctx.stroke();
  ctx.strokeStyle = C(acc); ctx.lineWidth = 2.1; ctx.stroke();
  const bs = Math.sin(t * 6) * (wk ? 0.5 : 0.15);
  ctx.save(); ctx.translate(3, -12); ctx.rotate(bs);
  ctx.beginPath(); ctx.arc(0, 0.6, 2.5, 0, TAU); paint(ctx, metal(ctx, '#ffd23f', -2.5, -2, 2.5, 3), 1.1, false);
  ctx.strokeStyle = OC(); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-1.8, 0.4); ctx.lineTo(1.8, 0.4); ctx.moveTo(0, 0.6); ctx.lineTo(0, 2.6); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- ミニドローン（メタルボディ＋LED顔）
function ledFace(ctx, x, y, w, acc, E, round) {
  ctx.save(); if (!FL) ctx.globalCompositeOperation = 'lighter';
  const c = C(acc); ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 1.5;
  for (const sd of [-1, 1]) {
    const ex = x + sd * w;
    ctx.beginPath();
    if (E.e === 'happy') { ctx.moveTo(ex - 2, y + 0.8); ctx.lineTo(ex, y - 1.4); ctx.lineTo(ex + 2, y + 0.8); ctx.stroke(); }
    else if (E.e === 'blink') { ctx.moveTo(ex - 1.8, y + 0.4); ctx.lineTo(ex + 1.8, y + 0.4); ctx.stroke(); }
    else {
      if (round) ctx.arc(ex, y, 2.1, 0, TAU); else rr(ctx, ex - 1.4, y - 2.4, 2.8, 4.8, 1.4);
      ctx.fill();
      if (!FL) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex + 0.5, y - 1, 0.7, 0, TAU); ctx.fill(); ctx.fillStyle = c; }
    }
  }
  ctx.beginPath();
  if (E.m === 'open') { ctx.moveTo(x - 1.6, y + 2.6); ctx.quadraticCurveTo(x, y + 5, x + 1.6, y + 2.6); ctx.closePath(); ctx.fill(); }
  else { ctx.moveTo(x - 1.4, y + 2.8); ctx.quadraticCurveTo(x - 0.7, y + 3.8, x, y + 2.9); ctx.quadraticCurveTo(x + 0.7, y + 3.8, x + 1.4, y + 2.8); ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}
function droneP(ctx, col, acc, t, st, E) {
  const tilt = st === 'walk' ? 0.14 : st === 'fly' ? 0.08 : Math.sin(t * 1.5) * 0.04;
  ctx.rotate(tilt);
  // 噴射
  if (!FL) { const f = 0.5 + Math.sin(t * 30) * 0.15; glow(ctx, 0, -2, 7, acc, f); }
  // サイドポッド
  for (const sd of [-1, 1]) {
    ctx.beginPath(); rr(ctx, sd * 12.5 - 2.5, -18, 5, 8, 2.5); paint(ctx, metal(ctx, col, sd * 12.5 - 2.5, 0, sd * 12.5 + 2.5, 0), 1.4, false);
    ctx.fillStyle = C(acc); ctx.beginPath(); ctx.arc(sd * 12.5, -11, 1.1, 0, TAU); ctx.fill();
  }
  // 本体（たまご・メタル）
  ctx.beginPath(); ctx.ellipse(0, -14, 12.5, 11.5, 0, 0, TAU); paint(ctx, metal(ctx, col, -12, -24, 12, -6), 2);
  inside(ctx, () => {
    const g = ctx.createLinearGradient(0, -8, 0, -2); g.addColorStop(0, 'rgba(20,10,40,0)'); g.addColorStop(1, 'rgba(20,10,40,0.3)'); ctx.fillStyle = g; ctx.fillRect(-13, -9, 26, 8);
    ctx.strokeStyle = 'rgba(20,10,40,0.3)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(0, -14, 12, 4.5, 0, 0.1, PI - 0.1); ctx.stroke();
  });
  // 画面
  ctx.beginPath(); rr(ctx, -8, -21, 17, 11, 4.5); paint(ctx, '#121424', 1.3, false);
  if (!FL) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); rr(ctx, -6.5, -20, 14, 3, 1.5); ctx.fill(); }
  ledFace(ctx, 0.5, -16.2, 3.4, acc, E, false);
  ctx.fillStyle = C(rgba('#ff6f91', 0.75)); ctx.fillRect(-10.6, -12, 2.6, 1.4); ctx.fillRect(9.4, -12, 2.6, 1.4);
  ctx.fillStyle = C('#ffffff'); ctx.beginPath(); ctx.ellipse(-6.5, -21.5, 2.6, 1.3, -0.5, 0, TAU); ctx.fill();
  // ランディングギア
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(-7, 0); ctx.lineTo(-9, 0); ctx.moveTo(5, -4); ctx.lineTo(7, 0); ctx.lineTo(9, 0); ctx.stroke();
  // プロペラ
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(0, -29); ctx.stroke();
  const spd = st === 'fly' || st === 'walk' ? 55 : 38;
  if (!FL) { ctx.fillStyle = rgba(acc, 0.22); ctx.beginPath(); ctx.ellipse(0, -30, 13, 2.2, 0, 0, TAU); ctx.fill(); }
  const pr = Math.cos(t * spd) * 12.5;
  ctx.beginPath(); ctx.ellipse(pr * 0.5, -30, Math.abs(pr) * 0.5 + 1.2, 1.6, 0, 0, TAU); paint(ctx, acc, 1.1, false);
  ctx.beginPath(); ctx.ellipse(-pr * 0.5, -30, Math.abs(pr) * 0.5 + 1.2, 1.6, 0, 0, TAU); paint(ctx, acc, 1.1, false);
  ctx.beginPath(); ctx.arc(0, -30, 2, 0, TAU); paint(ctx, metal(ctx, '#ffd23f', -2, -32, 2, -28), 1, false);
  if (((t * 2) | 0) % 2 === 0) glow(ctx, 12.5, -11, 4.5, acc, 0.9);
  anchor(ctx, 'top', -6.5, -24.5, -0.3);
  anchor(ctx, 'bow', 8, -24, 0.4);
}

// ---------------------------------------------------------------- ちびおばけ（半透明＋ほわほわ発光）
function ghostP(ctx, col, acc, t, st, E) {
  const pa = ctx.globalAlpha;
  glow(ctx, 0, -17, 20, mix(col, acc, 0.3), 0.3);
  const lean = st === 'walk' ? -0.1 : st === 'fly' ? -0.06 : 0;
  ctx.rotate(lean);
  const wv = t * 5;
  // ちいさな手
  for (const sd of [-1, 1]) {
    const hw = Math.sin(t * 5 + sd) * 1.6 + (st === 'pick' ? -4 : 0);
    ctx.beginPath(); ctx.ellipse(sd * 12.2, -13 + hw * (sd > 0 ? 1 : 0.4), 2.8, 2.1, sd * 0.5, 0, TAU);
    ctx.globalAlpha = pa * 0.92; paint(ctx, mix(col, '#ffffff', 0.5), 1.3, false); ctx.globalAlpha = pa;
  }
  ctx.beginPath(); ctx.moveTo(-11.5, -17); ctx.bezierCurveTo(-11.5, -34, 11.5, -34, 11.5, -17);
  ctx.bezierCurveTo(11.5, -9, 10.5, -5, 10.5, -2);
  for (let i = 0; i < 4; i++) { const x0 = 10.5 - i * 5.25, x1 = 10.5 - (i + 1) * 5.25; ctx.quadraticCurveTo((x0 + x1) / 2, 2.2 + Math.sin(wv + i) * 2, x1, -2); }
  ctx.bezierCurveTo(-11.5, -6, -12.5, -10, -11.5, -17); ctx.closePath();
  let fill = '#ffffff';
  if (!FL) { const g = ctx.createLinearGradient(0, -32, 0, 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, mix(col, '#ffffff', 0.4)); g.addColorStop(1, rgba(mix(col, acc, 0.35), 0.45)); fill = g; }
  ctx.globalAlpha = pa * 0.93; paint(ctx, fill, 1.8); ctx.globalAlpha = pa;
  inside(ctx, () => { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-6, -26.5, 3.2, 1.8, -0.6, 0, TAU); ctx.fill(); });
  eyes2(ctx, 1, -19, 4.3, 5, shade(acc, -0.15), E.e, { lash: true });
  cheek(ctx, -6, -13.6, 2.4); cheek(ctx, 8, -13.6, 2.4);
  mouthK(ctx, 1, -14, 1.6, E.m === 'open' ? 'open' : 'smile');
  smallBow(ctx, -6.5, -29, 0.7, acc, -0.25);
  // ひとだま
  if (!FL) {
    const k = t * 1.3;
    for (let i = 0; i < 2; i++) {
      const a = k + i * PI, px = Math.cos(a) * 16, py = -18 + Math.sin(a * 2) * 3;
      if (Math.sin(a) < 0) continue;
      glow(ctx, px, py, 4.5, acc, 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(px, py, 1.1, 0, TAU); ctx.fill();
    }
  }
  anchor(ctx, 'top', 4, -31.5, 0.2);
  anchor(ctx, 'bow', 7.5, -27.5, 0.35);
}

// ---------------------------------------------------------------- エイリアン（ミニUFOに乗る）
function alienP(ctx, col, acc, t, st, E) {
  // ビーム
  if (!FL) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, -6, 0, 7); g.addColorStop(0, rgba('#9ff6ff', 0.42)); g.addColorStop(1, rgba('#9ff6ff', 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(10, 7); ctx.lineTo(-10, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // ドーム（奥）
  if (!FL) { ctx.beginPath(); ctx.ellipse(0, -11, 12.5, 21, 0, PI, 0); ctx.fillStyle = 'rgba(160,220,255,0.16)'; ctx.fill(); }
  // 頭
  const bounce = st === 'pick' ? -2 : Math.sin(t * 2.6) * 0.8;
  ctx.save(); ctx.translate(0, -20 + bounce);
  ctx.rotate(Math.sin(t * 1.4) * 0.06);
  for (const sd of [-1, 1]) {
    const sw = Math.sin(t * 3 + sd) * 1.4;
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sd * 3, -7.5); ctx.quadraticCurveTo(sd * 4, -10.5, sd * 5.5 + sw, -11.5); ctx.stroke();
    glow(ctx, sd * 5.5 + sw, -12, 3.6, acc, 0.8);
    ctx.beginPath(); ctx.arc(sd * 5.5 + sw, -12, 1.7, 0, TAU); paint(ctx, mix(acc, '#ffffff', 0.4), 1, false);
  }
  ctx.beginPath(); ctx.ellipse(0, -1, 10.5, 8.8, 0, 0, TAU); paint(ctx, vol(ctx, col, 0, -2, 10, 0.6, -0.3), 1.9);
  // 大きなアーモンド目
  if (E.e !== 'open') eyes2(ctx, 0.5, -0.5, 3.6, 4.4, acc, E.e);
  else for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(0.5 + sd * 4.4, -0.8); ctx.rotate(sd * 0.32);
    ctx.beginPath(); ctx.ellipse(0, 0, 3.7, 2.9, 0, 0, TAU); ctx.fillStyle = C('#140828'); ctx.fill();
    if (!FL) { ctx.save(); ctx.clip(); const g = ctx.createLinearGradient(0, -1, 0, 3); g.addColorStop(0, rgba(acc, 0)); g.addColorStop(1, rgba(acc, 0.85)); ctx.fillStyle = g; ctx.fillRect(-4, -3, 8, 6); ctx.restore(); }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sd * 0.9 + 0.4, -1, 1.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(sd * -1.2, 1.1, 0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  cheek(ctx, -6.5, 3.4, 1.8); cheek(ctx, 7.5, 3.4, 1.8);
  mouthK(ctx, 0.5, 3.6, 1.2, E.m === 'open' ? 'open' : 'smile');
  anchor(ctx, 'top', 0.5, -9.2, 0);
  anchor(ctx, 'bow', -7.5, -6, -0.5);
  ctx.restore();
  // UFO（メタル）
  ctx.beginPath(); ctx.ellipse(0, -6.5, 9, 3.2, 0, 0, TAU); paint(ctx, shade('#8a90b8', -0.2), 1.4, false);
  ctx.beginPath(); ctx.ellipse(0, -9.5, 17, 5.4, 0, 0, TAU); paint(ctx, metal(ctx, '#d8dcf2', -17, -14, 17, -4), 1.9);
  inside(ctx, () => { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-17, -14, 34, 2.4); });
  ctx.beginPath(); ctx.ellipse(0, -11.5, 11.5, 3, 0, PI, 0); ctx.fillStyle = C(shade('#8a90b8', 0.25)); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const on = ((t * 6 | 0) + i) % 2, lx = -10 + i * 5, lc = on ? acc : '#fff6a0';
    if (on) glow(ctx, lx, -8.3, 3, lc, 0.7);
    ctx.fillStyle = C(lc); ctx.beginPath(); ctx.arc(lx, -8.3, 1.35, 0, TAU); ctx.fill();
  }
  // ガラスドーム（手前）
  if (!FL) {
    ctx.beginPath(); ctx.ellipse(0, -11, 12.5, 21, 0, PI, 0); ctx.strokeStyle = 'rgba(220,250,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.ellipse(0, -11, 9.5, 17.5, 0, PI * 1.12, PI * 1.36); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(7, -27, 0.9, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- ドラゴンの子（うろこ＋パタパタ翼・かっこかわいい）
function dragonP(ctx, col, acc, t, st, E) {
  const fast = st === 'fly' || st === 'walk' || st === 'pick';
  const flap = Math.sin(t * (fast ? 15 : 8));
  const belly = mix(acc, '#ffffff', 0.5), dk = shade(col, -0.28);
  // 尻尾（スペード）
  const tw = Math.sin(t * 3) * 2;
  ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(-15, -6, -18, -13 + tw); ctx.quadraticCurveTo(-13, -12, -6, -15); ctx.closePath(); paint(ctx, vol(ctx, col, -12, -11, 6), 1.6);
  ctx.beginPath(); ctx.moveTo(-17.5, -13 + tw); ctx.lineTo(-20, -18 + tw); ctx.lineTo(-23.5, -12 + tw); ctx.lineTo(-19, -10.5 + tw); ctx.closePath(); paint(ctx, acc, 1.3, false);
  wingD(ctx, -2, -21, flap, dk, true);
  // 背びれ
  for (const [px, py] of [[-7.5, -15], [-6, -19]]) { ctx.beginPath(); ctx.moveTo(px + 1.5, py + 2); ctx.lineTo(px - 2.5, py); ctx.lineTo(px + 1.5, py - 2); ctx.closePath(); paint(ctx, acc, 1, false); }
  // 胴
  ctx.beginPath(); ctx.ellipse(0, -12, 9.3, 9.3, 0, 0, TAU); paint(ctx, vol(ctx, col, 0, -13, 9, 0.5, -0.3), 2);
  inside(ctx, () => {
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(3, -10, 5.5, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(shade(acc, -0.35), 0.55); ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(-1, -15 + k * 3); ctx.quadraticCurveTo(3, -14 + k * 3, 8, -15 + k * 3); } ctx.stroke();
  });
  // 足（ツメ）
  for (const lx of [-4, 4]) {
    ctx.beginPath(); ctx.ellipse(lx, -3.5, 3.2, 2.5, 0, 0, TAU); paint(ctx, shade(col, -0.12), 1.3, false);
    ctx.fillStyle = C('#ffffff'); for (const k of [-1.3, 0, 1.3]) { ctx.beginPath(); ctx.arc(lx + 2.6, -3.5 + k, 0.5, 0, TAU); ctx.fill(); }
  }
  // 頭
  ctx.save(); ctx.translate(5, -27); ctx.rotate(st === 'pick' ? -0.1 : Math.sin(t * 1.6) * 0.04);
  // 角（金・カーブ）
  for (const [hx, l] of [[-5.5, 1], [3.5, 0.95]]) {
    ctx.beginPath(); ctx.moveTo(hx - 2, -6); ctx.quadraticCurveTo(hx - 2.5, -12 * l, hx - 6.5, -14.5 * l); ctx.quadraticCurveTo(hx + 0.5, -12 * l, hx + 2.2, -6.5); ctx.closePath();
    paint(ctx, metal(ctx, acc, hx - 6, -14, hx + 2, -6), 1.2, false);
  }
  // 耳ひれ
  ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-14, -5); ctx.lineTo(-12, 0); ctx.lineTo(-14, 2.5); ctx.lineTo(-8, 2.5); ctx.closePath(); paint(ctx, mix(col, acc, 0.35), 1.2, false);
  ctx.beginPath(); ctx.ellipse(0, 0, 10.8, 9.2, 0, 0, TAU); paint(ctx, vol(ctx, col, 0, -1, 10, 0.55, -0.3), 2);
  ctx.beginPath(); ctx.ellipse(7.2, 2.6, 6, 4.4, 0, 0, TAU); paint(ctx, vol(ctx, shade(col, 0.15), 7, 2, 5, 0.4, -0.2), 1.6, false);
  ctx.fillStyle = C(shade(col, -0.45)); ctx.beginPath(); ctx.ellipse(10.5, 1.2, 0.9, 0.6, 0.4, 0, TAU); ctx.ellipse(7.8, 1, 0.8, 0.55, 0.4, 0, TAU); ctx.fill();
  eyes2(ctx, 0.5, -1.6, 3.9, 4.2, mix(acc, '#ff8a00', 0.4), E.e, { lid: true });
  cheek(ctx, -5.5, 3.6, 2);
  if (E.m === 'open') mouthK(ctx, 8.5, 4.6, 1.3, 'open');
  else { ctx.strokeStyle = OC(); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(4, 4.6); ctx.quadraticCurveTo(8, 6.6, 11.8, 4.4); ctx.stroke(); }
  ctx.fillStyle = C('#ffffff'); ctx.beginPath(); ctx.moveTo(9.4, 5.3); ctx.lineTo(10.2, 7); ctx.lineTo(11, 5.1); ctx.closePath(); ctx.fill();
  if (st === 'pick' && !FL) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(13, 4, 22, 4); g.addColorStop(0, rgba('#fff2a0', 0.95)); g.addColorStop(1, rgba('#ff6a20', 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(12, 4); ctx.quadraticCurveTo(18, 0, 22, 4); ctx.quadraticCurveTo(18, 8, 12, 5); ctx.fill(); ctx.restore();
  }
  anchor(ctx, 'top', -1.5, -8.5, -0.1);
  anchor(ctx, 'bow', -9, -5, -0.6);
  ctx.restore();
  wingD(ctx, 0, -19, flap, col, false);
}
function wingD(ctx, x, y, flap, col, back) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.4 - flap * 0.55 + (back ? -0.3 : 0));
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -13); ctx.quadraticCurveTo(-10, -10, -15, -11); ctx.quadraticCurveTo(-12, -6.5, -15, -3); ctx.quadraticCurveTo(-9, -1.5, -7, 2); ctx.closePath();
  let f = col;
  if (!FL) { const g = ctx.createLinearGradient(0, 0, -14, -10); g.addColorStop(0, col); g.addColorStop(1, mix(col, '#ffffff', 0.35)); f = g; }
  paint(ctx, f, 1.6, !back);
  ctx.strokeStyle = C(rgba('#2a1430', 0.45)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-5, -13); ctx.lineTo(-2.5, 0.5); ctx.moveTo(-15, -11); ctx.lineTo(-3.5, 0); ctx.moveTo(-15, -3); ctx.lineTo(-4, 1); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- イルカ（虹色シャボンに乗って浮遊）
function dolphinP(ctx, col, acc, t, st, E) {
  const sw = Math.sin(t * 3) * 0.12 + (st === 'pick' ? -0.3 : 0);
  // シャボン玉（薄い虹色の膜）
  if (!FL) {
    ctx.beginPath(); ctx.arc(0, -16, 17, 0, TAU);
    const g = ctx.createRadialGradient(-5, -22, 2, 0, -16, 17); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.8, 'rgba(120,210,255,0.12)'); g.addColorStop(1, 'rgba(170,235,255,0.42)');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.globalAlpha *= 0.85; ctx.strokeStyle = RIM || 'rgba(200,240,255,0.8)'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.translate(0, -15); ctx.rotate(sw - 0.15);
  const tf = Math.sin(t * 6) * 0.2;
  ctx.save(); ctx.translate(-11, 2); ctx.rotate(tf);
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(-3, -3, -6, -6.5); ctx.quadraticCurveTo(-4, -1, -5, 0.5); ctx.quadraticCurveTo(-4, 2.5, -6.5, 5.5); ctx.quadraticCurveTo(-2, 3, 1, 1); ctx.closePath();
  paint(ctx, shade(col, -0.15), 1.4, false); ctx.restore();
  // 体（つやつや）
  ctx.beginPath(); ctx.moveTo(-12, 2); ctx.bezierCurveTo(-9, -10, 6, -11.5, 10.5, -3.5); ctx.quadraticCurveTo(17, -1.5, 16, 2); ctx.quadraticCurveTo(8.5, 5.5, 2, 6.5); ctx.quadraticCurveTo(-6, 7.5, -12, 2); ctx.closePath();
  paint(ctx, vol(ctx, col, 1, -3, 10, 0.55, -0.3), 1.8);
  inside(ctx, () => {
    ctx.fillStyle = mix(col, '#ffffff', 0.7); ctx.beginPath(); ctx.moveTo(-7, 4.5); ctx.quadraticCurveTo(4, 8, 15, 2); ctx.quadraticCurveTo(4, 3, -7, 4.5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(0, -8.5, 6, -7); ctx.stroke();
  });
  // 背びれ・胸びれ
  ctx.beginPath(); ctx.moveTo(-2.5, -7.5); ctx.quadraticCurveTo(-1.5, -13.5, -5.5, -14.5); ctx.quadraticCurveTo(2, -12.5, 3, -8); ctx.closePath(); paint(ctx, shade(col, -0.1), 1.3, false);
  ctx.beginPath(); ctx.ellipse(1, 4.6, 3.8, 1.7, 0.6 + Math.sin(t * 6) * 0.35, 0, TAU); paint(ctx, shade(col, -0.1), 1.1, false);
  eye(ctx, 6.5, -2.6, 3.6, mix(col, '#1a3a8a', 0.6), E.e, { lash: true });
  cheek(ctx, 9.5, 1.4, 1.9);
  if (E.m === 'open') mouthK(ctx, 13, 1.6, 1.2, 'open');
  else { ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(11, 1.6); ctx.quadraticCurveTo(13.5, 3.2, 16, 1.6); ctx.stroke(); }
  ctx.restore();
  // シャボンのハイライト（手前）
  if (!FL) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -16, 13.5, -2.75, -2.0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(9, -6.5, 1.2, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = C('rgba(255,255,255,0.75)');
  for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; ctx.beginPath(); ctx.arc(-8 + i * 7, -4 - k * 22, 1 + i * 0.4, 0, TAU); ctx.fill(); }
  smallBow(ctx, 8.5, -31.5, 0.6, acc, 0.3);
  anchor(ctx, 'top', -3, -32.5, -0.15);
  anchor(ctx, 'bow', -13, -27, -0.6);
}

// ---------------------------------------------------------------- ブリキのゼンマイロボ（メタル＋ハートランプ）
function robotP(ctx, col, acc, t, st, E) {
  const wk = st === 'walk';
  const s = wk ? Math.sin(t * 12) : 0;
  const bob = wk ? Math.abs(Math.cos(t * 12)) * 1.2 : 0;
  const dk = shade(col, -0.3);
  for (const [lx, p] of [[-4, 1], [4, -1]]) {
    const up = p * s > 0 ? -1.2 : 0;
    ctx.beginPath(); rr(ctx, lx - 2.2, -7 + up, 4.4, 5.5, 1.2); paint(ctx, metal(ctx, '#c0c4d0', lx - 2, 0, lx + 2, 0), 1.2, false);
    ctx.beginPath(); rr(ctx, lx - 3.2, -2.4 + up, 6.4, 2.6, 1.2); paint(ctx, dk, 1.2, false);
  }
  ctx.translate(0, -bob);
  // ゼンマイ
  ctx.save(); ctx.translate(-10, -14); ctx.rotate(t * (wk ? 6 : 3));
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, 0); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-5, -3, 1.7, 3, 0, 0, TAU); ctx.ellipse(-5, 3, 1.7, 3, 0, 0, TAU); paint(ctx, metal(ctx, '#d0d4e0', -7, -6, -3, 6), 1.2, false);
  ctx.restore();
  // 腕
  for (const sd of [-1, 1]) {
    const a = wk ? sd * s * 0.4 : st === 'pick' ? -1.6 : Math.sin(t * 2 + sd) * 0.08;
    ctx.save(); ctx.translate(sd * 8, -16); ctx.rotate(sd * 0.35 + (sd > 0 ? a : -a));
    ctx.strokeStyle = OC(); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sd * 1.5, 6); ctx.stroke(); ctx.strokeStyle = C('#c0c4d0'); ctx.lineWidth = 1.7; ctx.stroke();
    ctx.beginPath(); ctx.arc(sd * 1.5, 7, 2.1, 0, TAU); paint(ctx, dk, 1.1, false);
    ctx.restore();
  }
  // 胴
  ctx.beginPath(); rr(ctx, -8.5, -19.5, 17, 13.5, 3.5); paint(ctx, metal(ctx, col, -8.5, -19, 8.5, -6), 1.8);
  // ハートランプ
  const beat = 1 + Math.max(0, Math.sin(t * 5)) * 0.15;
  glow(ctx, 0, -12.5, 6, acc, 0.6);
  heartPath(ctx, 0, -12.6, 2.6 * beat); paint(ctx, vol(ctx, acc, 0, -13, 3, 0.6, -0.2), 1.1, false);
  ctx.fillStyle = C(dk); for (const [rx2, ry2] of [[-6.5, -17.5], [6.5, -17.5], [-6.5, -8], [6.5, -8]]) { ctx.beginPath(); ctx.arc(rx2, ry2, 0.7, 0, TAU); ctx.fill(); }
  // 首
  ctx.beginPath(); rr(ctx, -3, -21, 6, 2.5, 1); paint(ctx, '#9a9eb0', 1, false);
  // 頭
  ctx.save(); ctx.translate(0, 0); ctx.rotate(st === 'pick' ? 0 : E.e === 'happy' ? -0.08 : 0);
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 11, -27.5, 2.4, 0, TAU); paint(ctx, metal(ctx, '#d0d4e0', sd * 11 - 2, -30, sd * 11 + 2, -25), 1.1, false); }
  ctx.beginPath(); rr(ctx, -11, -36, 22, 16, 5); paint(ctx, metal(ctx, col, -11, -36, 11, -20), 2);
  ctx.beginPath(); rr(ctx, -8.2, -33, 16.4, 10.4, 3.5); paint(ctx, '#161a2a', 1.2, false);
  if (!FL) { ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.beginPath(); rr(ctx, -7, -32.3, 14, 2.6, 1.3); ctx.fill(); }
  ledFace(ctx, 0, -28.3, 3.4, '#9ff6ff', E, true);
  ctx.fillStyle = C(rgba('#ff6f91', 0.8)); ctx.fillRect(-10.2, -24.5, 2.4, 1.3); ctx.fillRect(7.8, -24.5, 2.4, 1.3);
  // アンテナ
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, -38.5); ctx.stroke();
  const on = ((t * 2) | 0) % 2 === 0;
  if (on) glow(ctx, 0, -40, 5, acc, 0.9);
  ctx.beginPath(); ctx.arc(0, -40, 2, 0, TAU); paint(ctx, on ? mix(acc, '#ffffff', 0.3) : acc, 1.1, false);
  anchor(ctx, 'top', 6, -36, 0.25);
  anchor(ctx, 'bow', -8, -36, -0.4);
  ctx.restore();
}
