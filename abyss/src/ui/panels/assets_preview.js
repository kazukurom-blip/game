// 画像の窓の「試し表示」: 差し替え画像（調整中の下書きを含む）を、実際の使われ方で動かして見せる。
// 主人公・装備 → 今の装備の着せ替えで待機・歩き・攻撃・詠唱・被弾をくり返す。敵 → 主人公と並べて歩き・攻撃・被弾・倒れ。
// 演出 → 暗い背景で、弾が飛ぶ・当たる・範囲が広がる・斬撃が走る。背景 → 3 枚を重ねて横に流す。アイコン → 持ち物のマス。
// 戦闘の画面に重ねる「戦闘画面で見る」（sceneHooks.drawFx）もここ。

import { assets } from '../../render/assets.js';
import { drawHero, heroLook } from '../../render/paperdoll.js';
import { CLASS } from '../../data/classes.js';
import { MONSTER, MONSTERS } from '../../data/monsters.js';
import { RARITY } from '../../data/rarity.js';
import { ACTS, ZONE } from '../../data/world.js';
import { BASES } from '../../data/items.js';
import { sceneHooks } from '../../render/scene.js';

/** 枠の見せ方の種類 */
export function previewKind(spec) {
  const k = spec?.kind || '';
  const id = spec?.id || '';
  if (k === 'hero.body' || k === 'hero.outfit') return 'hero';
  if (k === 'hero.portrait') return 'portrait';
  if (k === 'gear.part') return 'part';
  if (k.startsWith('gear.')) return 'gear';
  if (k === 'monster') return 'monster';
  if (k === 'minion' || k === 'pet') return 'ally';
  if (k === 'fx.enemy') return 'fxEnemy';
  if (k === 'fx' || id.startsWith('fx.')) return 'fx';
  if (k.startsWith('icon.') || id.startsWith('icon.')) return 'icon';
  if (k === 'bg' || id.startsWith('bg.')) return 'bg';
  if (k === 'ui.logo' || k === 'ui.title') return 'title';
  if (id.startsWith('monster.')) return 'monster';
  if (id.startsWith('minion.') || id.startsWith('pet.')) return 'ally';
  return 'single';
}

/** 試し表示の主人公の見た目（枠に合わせて体・武器・副手・兜を入れ替える） */
export function previewLook(state, spec) {
  const look = { ...heroLook(state) };
  const p = spec?.params || {};
  if (spec?.kind === 'hero.body' || spec?.kind === 'hero.outfit') {
    look.body = spec.id;
    if (p.cls && p.cls !== state.hero.cls) {
      const c = CLASS[p.cls];
      const wk = c?.weapons?.[0] || 'sword';
      look.cls = p.cls; look.weapon = `gear.${wk}`; look.weaponKind = wk; look.offhand = null; look.offhandKind = null; look.helm = null;
    }
  } else if (spec?.kind === 'gear.weapon' || (spec?.kind === 'gear.unique' && p.slot === 'weapon')) {
    look.weapon = spec.id; look.weaponKind = p.kind || look.weaponKind;
    if (BASES.find((b) => b.kind === p.kind)?.twoHanded) { look.offhand = null; look.offhandKind = null; }
  } else if (spec?.kind === 'gear.offhand' || (spec?.kind === 'gear.unique' && p.slot === 'offhand')) {
    look.offhand = spec.id; look.offhandKind = p.kind;
  } else if (spec?.kind === 'gear.helm' || (spec?.kind === 'gear.unique' && p.slot === 'helm')) {
    look.helm = spec.id;
  }
  return look;
}

// 動きの順番（待機 → 歩く → 攻撃 ×2 → 詠唱 → 被弾）
const HERO_CYCLE = [['idle', 2.0], ['walk', 1.4], ['attack', 0.5], ['attack', 0.5], ['cast', 0.7], ['hurt', 0.5]];
const MON_CYCLE = [['idle', 1.6], ['walk', 1.4], ['attack', 0.7], ['hurt', 0.5], ['idle', 0.6], ['die', 1.0]];

function phase(cycle, t, force) {
  if (force && force !== 'auto') { const d = cycle.find((c) => c[0] === force)?.[1] || 1; return { s: force, t: t % d, dur: d }; }
  const total = cycle.reduce((a, c) => a + c[1], 0);
  let x = t % total;
  for (const [s, d] of cycle) { if (x < d) return { s, t: x, dur: d }; x -= d; }
  return { s: 'idle', t: 0, dur: 1 };
}

/**
 * 試し表示を 1 コマ描く。ctx は W×H。o: { state, t, mode（'auto'|'idle'|'walk'|'attack'|'cast'|'hurt'|'die'）, anchors（アンカーの印を出す） }
 */
export function drawPreview(ctx, W, H, spec, o = {}) {
  const t = o.t || 0;
  const kind = previewKind(spec);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (kind === 'bg') { drawBgPreview(ctx, W, H, spec, t); ctx.restore(); return; }
  if (kind === 'title') { drawTitlePreview(ctx, W, H); ctx.restore(); return; }
  if (kind === 'icon') { drawIconPreview(ctx, W, H, spec, t); ctx.restore(); return; }
  stage(ctx, W, H, kind === 'fx' || kind === 'fxEnemy');
  const gy = H * 0.84;
  if (kind === 'portrait') {
    assets.drawFit(ctx, spec.id, W / 2, H / 2, H * 0.62, H * 0.9);
    ctx.restore(); return;
  }
  if (kind === 'hero' || kind === 'gear' || kind === 'part') {
    const k = (H * 0.66) / 200;
    const look = previewLook(o.state, spec);
    const ph = kind === 'part' ? { s: 'idle', t: 0, dur: 1 } : phase(HERO_CYCLE, t, o.mode);
    const hurt = ph.s === 'hurt';
    const u = { anim: { s: hurt ? 'idle' : ph.s, t: ph.t, dur: ph.dur }, face: 1, hitFlash: hurt ? Math.max(0, 0.15 - ph.t) : 0 };
    const x = W * 0.42 + (hurt ? -6 * Math.sin(Math.min(1, ph.t * 8) * Math.PI) : 0);
    const body = drawHero(ctx, u, x, gy, { look, t: kind === 'part' ? 0 : t, scale: k });
    if (kind === 'part') assets.draw(ctx, spec.id, x, gy, { scale: k });
    if (ph.s === 'attack' && !['bow', 'crossbow', 'staff', 'wand', 'rod', 'scythe'].includes(look.weaponKind)) {
      const pr = ph.t / ph.dur;
      if (pr > 0.4 && pr < 0.75) arc(ctx, x + 70 * k, gy - 100 * k, 70 * k, pr, '#ffe8b0');
    }
    if (ph.s === 'cast') glow(ctx, x + 60 * k, gy - 120 * k, 40 * k, '#8ab8ff', Math.sin((ph.t / ph.dur) * Math.PI));
    if (o.anchors && body) for (const name of Object.keys(body.anchors || {})) {
      const p = assets.anchor(body, name, x, gy, { scale: k });
      if (p) mark(ctx, p.x, p.y, ANCHOR_COL[name] || '#fff');
    }
    if (o.anchors) mark(ctx, x, gy, '#ff4040', true);
    ctx.restore(); return;
  }
  if (kind === 'monster' || kind === 'ally') {
    const mon = spec.params?.mon ? MONSTER[spec.params.mon] : null;
    const size = mon?.size || (spec.id.startsWith('pet.') ? 1 : 0.85);
    const tall = Math.max(200, spec.h * size);
    const k = (H * 0.66) / tall;
    // 大きさの比べ: 主人公
    const look = previewLook(o.state, {});
    const enemy = kind === 'monster';
    const hx = enemy ? W * 0.22 : W * 0.3;
    ctx.globalAlpha = 0.85;
    drawHero(ctx, { anim: { s: 'idle', t: 0 }, face: 1, hitFlash: 0 }, hx, gy, { look, t, scale: k });
    ctx.globalAlpha = 1;
    const ph = phase(MON_CYCLE, t, o.mode);
    const mx = enemy ? W * 0.7 : W * 0.56;
    drawUnitLike(ctx, spec.id, mx, gy - (mon?.flying ? 60 * k : 0), { scale: size * k, phase: ph, face: enemy ? -1 : 1, flying: !!mon?.flying, t });
    if (o.anchors) mark(ctx, mx, gy - (mon?.flying ? 60 * k : 0), '#ff4040', true);
    ctx.restore(); return;
  }
  if (kind === 'fx' || kind === 'fxEnemy') {
    const k = (H * 0.6) / 200;
    const look = previewLook(o.state, {});
    const hx = W * 0.22; const tx = W * 0.72;
    drawHero(ctx, { anim: { s: 'idle', t: 0 }, face: 1, hitFlash: 0 }, hx, gy, { look, t, scale: k });
    const dummy = MONSTERS.find((m) => !m.boss && !m.flying) || MONSTERS[0];
    if (dummy) drawUnitLike(ctx, `monster.${dummy.id}`, tx, gy, { scale: k * (dummy.size || 1), phase: { s: 'idle', t: 0, dur: 1 }, face: -1, t, alpha: 0.7 });
    if (kind === 'fx') drawFxPart(ctx, spec, { hx, tx, gy, k, t, W, H });
    else drawEnemyFx(ctx, spec, { hx, tx, gy, k, t });
    ctx.restore(); return;
  }
  // そのほか: 1 枚をそのまま
  assets.drawFit(ctx, spec.id, W / 2, H / 2, W * 0.8, H * 0.8, { t });
  ctx.restore();
}

const ANCHOR_COL = { hand: '#3ad06a', offhand: '#3a9cff', head: '#ffd23a', back: '#c06aff', chest: '#ff8a3a' };

function stage(ctx, W, H, dark) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (dark) { g.addColorStop(0, '#07060a'); g.addColorStop(1, '#141018'); } else { g.addColorStop(0, '#1c1824'); g.addColorStop(0.84, '#2a2430'); g.addColorStop(0.85, '#3a3028'); g.addColorStop(1, '#1a1410'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,220,150,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H * 0.84 + 0.5); ctx.lineTo(W, H * 0.84 + 0.5); ctx.stroke();
}

/** 敵・召喚物を戦闘と同じ動きで描く */
export function drawUnitLike(ctx, id, x, y, o) {
  const s = assets.sprite(id);
  const ph = o.phase || { s: 'idle', t: 0, dur: 1 };
  let dx = 0; let dy = 0; let rot = 0; let sx = 1; let sy = 1; let alpha = o.alpha ?? 1; let flash = 0;
  const face = o.face || -1;
  if (ph.s === 'walk') { dy = -Math.abs(Math.sin(ph.t * 8)) * 4; rot = Math.sin(ph.t * 8) * 0.04; }
  else if (ph.s === 'attack') { const k = Math.min(1, ph.t / 0.35); dx = face * (k < 1 ? -6 * k : 18 * Math.sin(Math.min(1, (ph.t - 0.35) / 0.25) * Math.PI)); sy = 1 - 0.05 * Math.sin(k * Math.PI); }
  else if (ph.s === 'hurt') { flash = Math.max(0, 0.12 - ph.t) * 8; dx = -face * 8 * Math.sin(Math.min(1, ph.t * 6) * Math.PI); sx = ph.t < 0.06 ? 1.12 : 1; sy = ph.t < 0.06 ? 0.88 : 1; }
  else if (ph.s === 'die') { alpha *= Math.max(0, 1 - ph.t / 0.9); sy = 1 - Math.min(0.5, ph.t * 0.8); sx = 1 + Math.min(0.3, ph.t * 0.5); }
  else { const b = Math.sin((o.t || 0) * 3); dy = b * 2; sy = 1 + b * 0.02; }
  if (o.flying) dy += Math.sin((o.t || 0) * 4) * 6;
  const scale = o.scale || 1;
  ctx.save(); ctx.globalAlpha = 0.35 * alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y + (o.flying ? 60 * scale : 0), 34 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // 敵は左向きが元の向き。味方（右向き）はそのまま
  const flip = face > 0 && id.startsWith('monster.');
  assets.draw(ctx, s, x + dx * scale, y + dy * scale, { scale, sx, sy, rot, alpha, flip, t: o.t });
  if (flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, flash) * 0.6; assets.draw(ctx, s, x + dx * scale, y + dy * scale, { scale, sx, sy, rot, flip }); ctx.restore(); }
  return s;
}

function drawFxPart(ctx, spec, g) {
  const part = spec.params?.part || spec.id.split('.').pop();
  const { hx, tx, gy, k, t } = g;
  const hand = { x: hx + 50 * k, y: gy - 110 * k };
  const tgt = { x: tx, y: gy - 70 * k };
  const s = assets.sprite(spec.id);
  const sc = k * 1.2;
  if (part === 'proj') {
    const p = (t % 1) / 0.8;
    if (p <= 1) assets.draw(ctx, s, hand.x + (tgt.x - hand.x) * p, hand.y + (tgt.y - hand.y) * p, { scale: sc, t });
  } else if (part === 'hit' || part === 'curse') {
    const p = (t % 0.9) / 0.4;
    if (p <= 1) assets.draw(ctx, s, tgt.x, part === 'curse' ? tgt.y - 90 * k : tgt.y, { scale: sc * (0.6 + 0.6 * p), alpha: 1 - p * p, t });
  } else if (part === 'area') {
    const p = (t % 1.4) / 0.9;
    const r = 130 * k;
    if (p <= 1) assets.draw(ctx, s, tx, gy - r * 0.2, { w: r * 2 * (0.6 + 0.4 * p), h: r * 2 * (0.6 + 0.4 * p), alpha: 1 - p * 0.7, t });
  } else if (part === 'summon' || part === 'aura') {
    const at = part === 'summon' ? hx + 140 * k : hx;
    const p = (t % 1.4) / 0.9;
    const a = part === 'aura' ? 0.6 + 0.4 * Math.sin(t * 4) : p <= 1 ? 1 - p * 0.7 : 0;
    if (a > 0) assets.draw(ctx, s, at, gy, { scale: k * (part === 'summon' ? 0.7 + 0.3 * Math.min(1, p) : 1), alpha: a, t });
  } else if (part === 'swing') {
    const p = (t % 0.8) / 0.25;
    if (p <= 1) assets.draw(ctx, s, hx + 80 * k, gy - 100 * k, { scale: sc * (0.8 + 0.4 * p), rot: -0.6 + 1.2 * p, alpha: 1 - p * 0.6, t });
  } else if (part === 'chain' || part === 'beam' || part === 'trail') {
    const len = Math.hypot(tgt.x - hand.x, tgt.y - hand.y);
    const ang = Math.atan2(tgt.y - hand.y, tgt.x - hand.x);
    const p = (t % 1.2) / 0.7;
    if (p <= 1) assets.draw(ctx, s, part === 'trail' ? hx : hand.x, part === 'trail' ? gy - 70 * k : hand.y, { w: len, h: spec.h * k, rot: part === 'trail' ? 0 : ang, alpha: 1 - p * p, t });
  } else if (part === 'buff') {
    assets.draw(ctx, s, hx, gy, { scale: k, alpha: 0.7 + 0.3 * Math.sin(t * 3), t });
  } else if (part === 'trap' || part === 'totem') {
    assets.draw(ctx, s, hx + 170 * k, gy, { scale: k * 1.1, t });
  } else if (part === 'cut') {
    const p = (t % 2.2);
    const x = p < 0.25 ? g.W * (1.5 - p / 0.25) : g.W / 2;
    const a = p < 1.4 ? 1 : Math.max(0, 1 - (p - 1.4) / 0.4);
    assets.draw(ctx, s, x, g.H * 0.45, { w: g.W, h: g.W * (spec.h / spec.w), alpha: a, t });
  } else assets.draw(ctx, s, tgt.x, tgt.y, { scale: sc, t });
}

function drawEnemyFx(ctx, spec, g) {
  const { hx, tx, gy, k, t } = g;
  const s = assets.sprite(spec.id);
  if (spec.w <= 100) {
    const p = (t % 1.1) / 0.8;
    if (p <= 1) assets.draw(ctx, s, tx - 40 * k + (hx - tx + 40 * k) * p, gy - 80 * k, { scale: k * 1.3, t });
  } else {
    const p = (t % 1.4) / 0.9;
    const r = 120 * k;
    if (p <= 1) assets.draw(ctx, s, hx, gy - r * 0.2, { w: r * 2 * (0.6 + 0.4 * p), h: r * 2 * (0.6 + 0.4 * p), alpha: 1 - p * 0.7, t });
  }
}

function drawBgPreview(ctx, W, H, spec, t) {
  const act = spec.params?.act || spec.id.split('.')[1];
  const k = W / 1280;
  ctx.fillStyle = '#0c0a10'; ctx.fillRect(0, 0, W, H);
  const cam = t * 90;
  const layer = (id, par, y) => {
    const s = assets.sprite(id);
    if (!s?.img) return;
    const w = s.sw * k; const h = s.sh * k;
    if (w <= 0) return;
    const off = ((cam * par * k) % w + w) % w;
    for (let x = -off; x < W; x += w) ctx.drawImage(s.img, 0, 0, s.img.width / (s.frames || 1), s.img.height, Math.floor(x), y, Math.ceil(w) + 1, h);
  };
  layer(`bg.${act}`, 0.08, 0);
  layer(`bg.${act}.mid`, 0.35, 0);
  layer(`bg.${act}.ground`, 1, 520 * k);
  // 歩く主人公の影（大きさの目安）
  ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
  const hx = 380 * k; const hy = 560 * k;
  ctx.beginPath(); ctx.ellipse(hx, hy - 90 * k, 26 * k, 90 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 選んだ層を枠で示す
  const layerName = spec.params?.layer || 'far';
  ctx.strokeStyle = 'rgba(245,217,138,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  if (layerName === 'ground') ctx.strokeRect(1, 520 * k, W - 2, 220 * k - 1); else ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.setLineDash([]);
}

function drawTitlePreview(ctx, W, H) {
  assets.drawCover(ctx, 'ui.title', 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
  assets.drawFit(ctx, 'ui.logo', W / 2, H * 0.28, W * 0.62, H * 0.34);
  ctx.fillStyle = 'rgba(16,13,20,0.85)'; ctx.fillRect(W * 0.3, H * 0.52, W * 0.4, H * 0.36);
  ctx.strokeStyle = '#5a4a3a'; ctx.strokeRect(W * 0.3, H * 0.52, W * 0.4, H * 0.36);
}

function drawIconPreview(ctx, W, H, spec, t) {
  ctx.fillStyle = '#17141d'; ctx.fillRect(0, 0, W, H);
  const rar = ['common', 'magic', 'rare', 'epic', 'legendary', 'mythic'];
  const cs = Math.min(64, W / 8);
  rar.forEach((r, i) => {
    const x = 12 + i * (cs + 8); const y = 14;
    cell(ctx, x, y, cs, RARITY[r].color);
    assets.drawFit(ctx, spec.id, x + cs / 2, y + cs / 2, cs * 0.86, cs * 0.86, { t });
  });
  // 大きく
  const big = Math.min(H - cs - 64, W * 0.4);
  cell(ctx, 12, cs + 30, big, RARITY.legendary.color);
  assets.drawFit(ctx, spec.id, 12 + big / 2, cs + 30 + big / 2, big * 0.9, big * 0.9, { t });
  // 地面に落ちた姿（ドロップ）
  const gx = W * 0.72; const gy = H * 0.86;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(0, gy - 160, 0, gy);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, RARITY.legendary.color);
  ctx.fillStyle = gr; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 8); ctx.fillRect(gx - 14, gy - 160, 28, 160);
  ctx.restore();
  const jump = Math.abs(Math.sin(t * 2)) * 10;
  assets.drawFit(ctx, spec.id, gx, gy - 24 - jump, 40, 40, { t });
  ctx.fillStyle = '#9a907f'; ctx.font = '12px "M PLUS 1p", sans-serif'; ctx.fillText('持ち物のマス（レアリティの色）・地面に落ちた姿', 12, H - 8);
}

function cell(ctx, x, y, s, col) {
  const g = ctx.createRadialGradient(x + s / 2, y + s * 0.4, 2, x + s / 2, y + s / 2, s * 0.7);
  g.addColorStop(0, `${col}44`); g.addColorStop(1, '#0d0b10');
  ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = `${col}aa`; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

function arc(ctx, x, y, r, p, col) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.globalAlpha = 0.8; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(x - 20, y + 10, r, -1.6 + p, 0.9 + p); ctx.stroke(); ctx.restore();
}
function glow(ctx, x, y, r, col, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, a);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function mark(ctx, x, y, col, big = false) {
  const r = big ? 9 : 6;
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.strokeStyle = col;
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 戦闘の画面に重ねる（戦闘画面で見る）
const overlay = { id: null, t: 0, until: 0 };

/** 戦闘の画面に、この枠を試しに出す（sec 秒。0 で止める） */
export function showInBattle(id, sec = 8) {
  overlay.id = sec > 0 ? id : null;
  overlay.t = 0;
  overlay.until = sec;
}

function drawOverlay(scene, ctx, dt) {
  if (!overlay.id) return;
  overlay.t += dt || 0;
  if (overlay.t > overlay.until) { overlay.id = null; return; }
  const spec = assets.spec(overlay.id) || { id: overlay.id, w: 128, h: 128 };
  const hero = scene.game?.combat?.hero;
  if (!hero) return;
  const kind = previewKind({ ...spec, id: overlay.id });
  const hx = scene.sx(hero.x); const gy = scene.sy(hero.y || 0);
  const t = overlay.t;
  const fade = Math.min(1, t * 3, (overlay.until - t) * 2);
  ctx.save();
  ctx.globalAlpha = fade;
  if (kind === 'monster' || kind === 'ally') {
    const mon = spec.params?.mon ? MONSTER[spec.params.mon] : null;
    const enemy = kind === 'monster';
    const x = hx + (enemy ? 300 : -120);
    drawUnitLike(ctx, overlay.id, x, gy - (mon?.flying ? 60 : 0), { scale: mon?.size || 0.85, phase: phase(MON_CYCLE, t), face: enemy ? -1 : 1, flying: !!mon?.flying, t });
    label(ctx, x, gy - spec.h * (mon?.size || 1) - 18, '試し表示');
  } else if (kind === 'fx' || kind === 'fxEnemy') {
    const g = { hx, tx: hx + 320, gy, k: 1, t, W: 1280, H: 720 };
    if (kind === 'fx') drawFxPart(ctx, { ...spec, id: overlay.id }, g); else drawEnemyFx(ctx, { ...spec, id: overlay.id }, g);
  } else if (kind === 'hero' || kind === 'gear') {
    const st = scene.game.state;
    if (kind === 'hero' && spec.params?.cls && spec.params.cls !== st.hero.cls) {
      drawHero(ctx, { anim: phaseHero(t), face: 1, hitFlash: 0 }, hx + 220, gy, { look: previewLook(st, spec), t, scale: 1 });
      label(ctx, hx + 220, gy - 230, '試し表示');
    }
  }
  ctx.restore();
}

function phaseHero(t) { const p = phase(HERO_CYCLE, t); return { s: p.s === 'hurt' ? 'idle' : p.s, t: p.t, dur: p.dur }; }

function label(ctx, x, y, text) {
  ctx.save();
  ctx.font = 'bold 14px "M PLUS 1p", sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = '#9ad0ff'; ctx.fillText(text, x, y);
  ctx.restore();
}

if (!sceneHooks.drawFx.includes(drawOverlay)) sceneHooks.drawFx.push(drawOverlay);

/** その背景の章へ行ける地域（行けなければ null） */
export function zoneForAct(state, actId) {
  const a = ACTS.find((x) => x.id === actId);
  if (!a) return null;
  const cur = ZONE[state.world.zone];
  if (cur?.act === actId) return cur.id;
  const z = (a.zones || []).map((zz) => ZONE[zz.id]).filter((zz) => zz && zz.global <= (state.world.maxZone ?? 0));
  return z.length ? z[z.length - 1].id : null;
}
