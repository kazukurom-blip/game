// カットイン（4次奥義・転職）とコンボカウンター。どちらも画面空間。
//  spawnEffect(game, 'cutin', 0, 0, {look, equip, name, line, color, sub, branch}) → pushCutin
//  drawCutinLayer(ctx, game)（effects.drawCutins から） / drawCombo(ctx, game)
// 時間は game.dt（実時間）で進める（ヒットストップ・ポーズ中でも動く）。
import { rgba, shade, starPath, clamp } from './util.js';
import { drawCharacter, lastDrawnArgs, HERO_LOOKS } from './character.js';
import { BRANCH_STYLE, RAINBOW, jobStyleOf } from './fxStyle.js';
import { portraitFor, drawPortrait, spriteRev } from './sprites.js';

const PI = Math.PI;
const CUTIN_LIFE = 0.95;

export function pushCutin(game, o = {}) {
  if (!game) return;
  const list = game.cutins || (game.cutins = []);
  if (list.length >= 2) list.shift();
  const p = game.player;
  const d = p && p.anim ? lastDrawnArgs(p.anim) : null;
  const st = game.state || {};
  const js = jobStyleOf(st);
  const br = BRANCH_STYLE[o.branch || js.branch] || null;
  list.push({
    t: 0, life: o.life || CUTIN_LIFE,
    look: o.look || (d && d.look) || st.look || HERO_LOOKS[st.heroId] || HERO_LOOKS.luna,
    equip: o.equip || (d && d.equip) || {},
    name: o.name || '', line: o.line != null ? o.line : (br ? br.line : ''),
    color: o.color || (br && br.col) || js.aura || '#ff3d7f',
    sub: o.sub || (br && br.sub) || '#ffe066',
    expr: o.expr || 'shout',      // 立ち絵（manifest portraits）の表情: 奥義=shout、転職=smile
    seed: Math.random() * 100,
  });
}

export function drawCutinLayer(ctx, game) {
  const list = game.cutins;
  if (!list || !list.length) return;
  const dt = Math.min(0.05, game.dt || 1 / 60);
  const W = game.W || 1280, H = game.H || 720;
  let w = 0;
  for (const c of list) {
    c.t += dt;
    if (c.t >= c.life) continue;
    try { drawOne(ctx, c, W, H); } catch (e) { c.t = c.life; }
    list[w++] = c;
  }
  list.length = w;
}

// カットインの顔アップのキャッシュ（cutin ごとに1枚。画面の帯に見える範囲＋余白）
const PORTRAIT_S = 5.3, PORTRAIT_W = 760, PORTRAIT_H = 460;
function portraitOf(c, fx, fy) {
  // AIの頭の読み込み完了などで見た目が変わったら作り直す
  if (c.por !== undefined && c.porRev === spriteRev()) return c.por;
  c.por = null; c.porRev = spriteRev();
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(PORTRAIT_W, PORTRAIT_H) : document.createElement('canvas');
  cv.width = PORTRAIT_W; cv.height = PORTRAIT_H;
  const oc = cv.getContext('2d');
  if (!oc) return null;
  oc.translate(PORTRAIT_W / 2 - fx, PORTRAIT_H / 2 - fy);
  drawCharacter(oc, fx - 6 * PORTRAIT_S, fy + 58 * PORTRAIT_S, c.look, c.equip, { facing: 1, state: 'idle', t: 0.4, attackT: 0, damage: 0, scale: PORTRAIT_S, aura: null });
  c.por = cv;
  return cv;
}

function drawOne(ctx, c, W, H) {
  const t = c.t, L = c.life;
  const inK = clamp(t / 0.13, 0, 1), outK = clamp((t - (L - 0.16)) / 0.16, 0, 1);
  const ein = 1 - Math.pow(1 - inK, 3);
  const slide = (1 - ein) * W * 1.1 - outK * W * 1.2;
  const cy = H * 0.46, bh = 230, sk = 90;
  ctx.save();
  // 周囲を少し暗く
  ctx.globalAlpha = 0.35 * ein * (1 - outK);
  ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // 斜めの帯
  ctx.translate(slide, 0);
  ctx.beginPath();
  ctx.moveTo(-40, cy - bh / 2 + sk * 0.5); ctx.lineTo(W + 40, cy - bh / 2 - sk * 0.5);
  ctx.lineTo(W + 40, cy + bh / 2 - sk * 0.5); ctx.lineTo(-40, cy + bh / 2 + sk * 0.5); ctx.closePath();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
  g.addColorStop(0, shade(c.color, -0.55)); g.addColorStop(0.5, shade(c.color, -0.15)); g.addColorStop(1, shade(c.color, -0.6));
  ctx.fillStyle = g; ctx.fillRect(-40, cy - bh, W + 80, bh * 2);
  // ストライプ（流れる）
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.09);
  const off = (t * 700) % 60;
  ctx.beginPath();
  for (let x = -200 - off; x < W + 200; x += 60) { ctx.moveTo(x, cy + bh); ctx.lineTo(x + 26, cy + bh); ctx.lineTo(x + 26 + bh * 0.9, cy - bh); ctx.lineTo(x + bh * 0.9, cy - bh); ctx.closePath(); }
  ctx.fill();
  // 集中線（速度線）
  ctx.strokeStyle = rgba(c.sub, 0.55); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const yy = cy - bh / 2 + ((i * 37 + c.seed * 13) % bh);
    const x0 = ((i * 211 + t * 2400) % (W + 400)) - 200;
    ctx.moveTo(W - x0, yy); ctx.lineTo(W - x0 - 140 - (i % 4) * 40, yy + 12);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  // キャラの顔アップ
  const s = 5.0 + t * 0.6;
  const fx = W * 0.3, fy = cy + 8;
  // 性能: 顔アップ（scale 5 の大きなベクター描画）は最初の1回だけオフスクリーンに描き、以降は拡大して貼る
  // 立ち絵（manifest portraits）があればその上の方（顔〜胸）を切り出して使う
  const pimg = portraitFor(c.look, undefined, c.expr);
  try {
    const por = pimg ? null : portraitOf(c, fx, fy);
    if (pimg) {
      const ch = Math.min(1, (pimg.w * 0.75) / pimg.h);      // 幅の0.75倍の高さ = 腰上なら顔〜肩、全身なら顔〜胸
      drawPortrait(ctx, c.look, c.expr, fx, cy + 46, 300 * (1 + t * 0.12), { anchor: 'center', crop: [0, 0, 1, ch], maxW: 480 });
    } else if (por) {
      const k = s / PORTRAIT_S;
      ctx.save();
      ctx.translate(fx - 6 * s, fy + 58 * s); ctx.scale(k, k); ctx.translate(-(fx - 6 * PORTRAIT_S), -(fy + 58 * PORTRAIT_S));
      ctx.drawImage(por, fx - PORTRAIT_W / 2, fy - PORTRAIT_H / 2);
      ctx.restore();
    } else drawCharacter(ctx, fx - 6 * s, fy + 58 * s, c.look, c.equip, { facing: 1, state: 'idle', t: 0.4, attackT: 0, damage: 0, scale: s, aura: null });
  } catch (e) { /* ignore */ }
  // 目のキラッ
  if (t > 0.15 && t < 0.45) {
    const k = (t - 0.15) / 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba('#ffffff', 1 - k);
    ctx.beginPath(); starPath(ctx, fx + 10 * s, fy - 4 * s, 34 * (1 - Math.abs(k - 0.4)), 4, 4, 0); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  // 帯の縁
  ctx.strokeStyle = c.sub; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-40, cy - bh / 2 + sk * 0.5); ctx.lineTo(W + 40, cy - bh / 2 - sk * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-40, cy + bh / 2 + sk * 0.5); ctx.lineTo(W + 40, cy + bh / 2 - sk * 0.5); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-40, cy - bh / 2 + sk * 0.5 - 9); ctx.lineTo(W + 40, cy - bh / 2 - sk * 0.5 - 9); ctx.stroke();
  // 技名・セリフ
  const tk = clamp((t - 0.08) / 0.12, 0, 1);
  const tx = W * 0.64 + (1 - tk) * 120;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (c.name) {
    const size = c.name.length > 10 ? 44 : 54;
    ctx.save(); ctx.translate(tx, cy - 28); ctx.rotate(-0.07);
    const pop = tk < 1 ? 1.4 - tk * 0.4 : 1;
    ctx.scale(pop, pop);
    ctx.globalAlpha = tk;
    ctx.font = `900 ${size}px "Arial Black", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.lineWidth = 10; ctx.strokeStyle = '#1a0828'; ctx.strokeText(c.name, 0, 0);
    const tg = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.45, c.sub); tg.addColorStop(1, c.color);
    ctx.fillStyle = tg; ctx.fillText(c.name, 0, 0);
    ctx.restore();
  }
  if (c.line) {
    const lk = clamp((t - 0.2) / 0.15, 0, 1);
    ctx.save(); ctx.translate(tx + 10, cy + 40); ctx.rotate(-0.07);
    ctx.globalAlpha = lk;
    ctx.font = '900 26px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Arial Rounded MT Bold", sans-serif';
    // 1文字ずつタイプ表示
    const n = Math.ceil(c.line.length * clamp((t - 0.2) / 0.3, 0, 1));
    const txt = '「' + c.line.slice(0, n) + (n >= c.line.length ? '」' : '');
    ctx.lineWidth = 6; ctx.strokeStyle = '#1a0828'; ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  // 退場時の白いワイプ
  if (outK > 0 && outK < 1) {
    ctx.save(); ctx.globalAlpha = 0.25 * (1 - outK); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

// ================================================================ コンボカウンター
const COMBO_TIERS = [
  { n: 100, c1: '#ffffff', c2: 'rainbow', label: 'LEGENDARY' },
  { n: 50, c1: '#f0d0ff', c2: '#b45cff', label: 'INSANE' },
  { n: 30, c1: '#ffd0ea', c2: '#ff2a6d', label: 'WILD' },
  { n: 10, c1: '#fff0b0', c2: '#ff8a1f', label: 'HOT' },
  { n: 0, c1: '#ffffff', c2: '#3ee6d2', label: '' },
];
/** drawCombo(ctx, game) — game.combo = {count, t(最後のヒットからの秒)}。画面右に表示 */
export function drawCombo(ctx, game) {
  const cb = game && game.combo;
  if (!cb) return;
  if (game.ui && game.ui.hudCombo) return; // HUD（ui/hudMaple.js）が中央やや右下に出す
  const jf = game.ui && game.ui.jobFx;
  if (jf && jf.t < (jf.life || 5) - 0.7) return; // 転職の全画面演出中は出さない
  const W = game.W || 1280;
  const dt = Math.min(0.05, game.dt || 1 / 60);
  const cnt = cb.count | 0;
  if (cnt !== cb._shown) { if (cnt > (cb._shown || 0)) cb._bump = 0; cb._shown = cnt; if (cnt > 0) cb._last = cnt; }
  cb._bump = (cb._bump || 0) + dt;
  if (cnt >= 3) cb._fade = 1; else cb._fade = Math.max(0, (cb._fade || 0) - dt * 2.5);
  const show = cnt >= 3 ? cnt : cb._last || 0;
  if (cb._fade <= 0 || show < 3) return;
  const tier = COMBO_TIERS.find((x) => show >= x.n);
  const lv = COMBO_TIERS.length - 1 - COMBO_TIERS.indexOf(tier); // 0..4
  const b = cb._bump;
  const pop = b < 0.08 ? 1.35 - (b / 0.08) * 0.35 : 1;
  // 右上のミッション・トラッカー（ui._trackerBottom）と重ならないよう、その下に出す
  const tb = (game.ui && game.ui._trackerBottom) || 0;
  const x = W - 34, y = Math.min(470, Math.max(200, tb + 74));
  const a = cb._fade;
  const time = game.time || 0;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  // 背景の斜め帯（段階で派手に）
  if (lv >= 1) {
    ctx.save(); ctx.translate(x - 70, y - 20); ctx.rotate(-0.12);
    ctx.globalCompositeOperation = 'lighter';
    const col = tier.c2 === 'rainbow' ? RAINBOW[((time * 10) | 0) % RAINBOW.length] : tier.c2;
    ctx.fillStyle = rgba(col, 0.18 + lv * 0.05);
    ctx.fillRect(-110, -44, 220, 64);
    if (lv >= 3) { // 放射光
      ctx.rotate(time * 1.5);
      ctx.fillStyle = rgba(col, 0.16);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const an = i * PI / 5; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an - 0.1) * 120, Math.sin(an - 0.1) * 120); ctx.lineTo(Math.cos(an + 0.1) * 120, Math.sin(an + 0.1) * 120); }
      ctx.fill();
    }
    ctx.restore();
  }
  const shakeX = lv >= 2 && b < 0.15 ? Math.sin(b * 120) * 3 : 0;
  ctx.save(); ctx.translate(x + shakeX, y); ctx.scale(pop, pop);
  const size = 46 + lv * 5;
  ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  const text = String(show);
  ctx.lineWidth = 9; ctx.strokeStyle = '#1a0828'; ctx.strokeText(text, 0, 0);
  let fill;
  if (tier.c2 === 'rainbow') {
    fill = ctx.createLinearGradient(-size * text.length * 0.7, 0, 0, 0);
    for (let i = 0; i < RAINBOW.length; i++) fill.addColorStop(i / (RAINBOW.length - 1), RAINBOW[(i + ((time * 12) | 0)) % RAINBOW.length]);
  } else {
    fill = ctx.createLinearGradient(0, -size * 0.8, 0, 0);
    fill.addColorStop(0, tier.c1); fill.addColorStop(1, tier.c2);
  }
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.font = '900 18px "Arial Black", sans-serif';
  ctx.lineWidth = 5; ctx.strokeStyle = '#1a0828';
  ctx.strokeText('COMBO', x, y + 22); ctx.fillStyle = '#ffffff'; ctx.fillText('COMBO', x, y + 22);
  if (tier.label) {
    ctx.font = 'italic 900 15px "Arial Black", sans-serif';
    const col = tier.c2 === 'rainbow' ? RAINBOW[((time * 10) | 0) % RAINBOW.length] : tier.c2;
    ctx.strokeText(tier.label + '!', x - 92, y + 22); ctx.fillStyle = col; ctx.fillText(tier.label + '!', x - 92, y + 22);
  }
  // 残り時間バー
  const win = cb.window || 3.2;
  const rem = cnt >= 3 ? clamp(1 - (cb.t || 0) / win, 0, 1) : 0;
  ctx.fillStyle = 'rgba(20,8,40,0.7)'; ctx.fillRect(x - 150, y + 30, 150, 6);
  ctx.fillStyle = tier.c2 === 'rainbow' ? '#ffffff' : tier.c2; ctx.fillRect(x - 150 * rem, y + 30, 150 * rem, 6);
  ctx.restore();
}
