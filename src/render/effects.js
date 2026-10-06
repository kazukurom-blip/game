// エフェクト＆ダメージ数字（ワールド空間）。game.effects に積み、updateEffects / drawEffects で処理。
import { rgba, shade, rng, starPath } from './util.js';
import { FX_TYPES, themeSpawn } from './fxJob.js';
import { drawCutinLayer, pushCutin } from './cutin.js';
import { RAINBOW as RB, FXA } from './fxStyle.js';
import { MISSIONS } from '../data/missions.js';
import { drawMapleText, renderMapleText, mapleWordImage, critStarImage } from './mapleFont.js';
export { drawCombo } from './cutin.js';

const PI = Math.PI;
const MAX_EFFECTS = 500;

const LIFE = {
  slash: 0.28, hit: 0.26, critHit: 0.36, explosion: 0.9, levelUp: 1.6, pickup: 0.5, muzzle: 0.09, dash: 0.4,
  buff: 1.0, rareDrop: 1.6, questClear: 2.4, heal: 0.9, smoke: 1.0, portal: 0.8, spark: 0.4, tear: 1.1, dmg: 1.0, petPick: 0.8, petDrop: 3.2,
};
const DEF_COLOR = {
  slash: '#ffffff', hit: '#ffe066', critHit: '#ff4fd8', explosion: '#ff9a3c', levelUp: '#ffe066', pickup: '#7cfc00', muzzle: '#ffd27a',
  dash: '#19f0ff', buff: '#ff6fb5', rareDrop: '#ffc93c', heal: '#5cff9a', smoke: '#9a8fa8', portal: '#b47cff', spark: '#ffe066', tear: '#f4f4f4', petPick: '#ff6fb5', petDrop: '#ffffff',
};

let seedCounter = 1;

function ensure(game) {
  if (!game.effects) game.effects = [];
  return game.effects;
}

export function spawnEffect(game, type, x, y, opts = {}) {
  if (!game) return null;
  if (type === 'impact') { impact(game, opts.power ?? 0.5, opts.color); type = 'impactLines'; }
  if (type === 'cutin') { pushCutin(game, opts); return null; }
  // 描画が重いフレームが続いたら新しいエフェクトの粒を自動で減らす（game._fxCost = drawEffects の平均 ms）
  const fxScale = fxLevel(game) * ((game._fxCost || 0) > 4 && !opts.screen ? 0.55 : 1);
  // 画面空間（UI窓の上など）に出す演出: opts.screen
  const list = opts.screen ? (game.screenFx || (game.screenFx = [])) : ensure(game);
  if (list.length >= MAX_EFFECTS) list.splice(0, list.length - MAX_EFFECTS + 1);
  const def = FX_TYPES[type];
  const e = {
    kind: 'fx', type, x, y, t: 0,
    life: opts.life || LIFE[type] || (def && def.life) || 0.5,
    color: opts.color || DEF_COLOR[type] || '#ffffff',
    dir: opts.dir || opts.facing || 1,
    size: opts.size || opts.radius || 0,
    target: opts.target || null,
    opts,
    parts: null,
    seed: seedCounter++,
    fx: fxScale,
    tier: opts.tier || 0,
  };
  initParts(e);
  list.push(e);
  if (!opts._child && !opts.screen) {
    try { themeSpawn(game, e, spawnEffect, impact); } catch (err) { if (!spawnEffect._warned) { spawnEffect._warned = 1; console.warn('[fx] theme failed', err); } }
    // 移動スキルの重複（player.js と skills.js の両方から出た場合）
    if (e.type.startsWith('move_')) {
      for (let i = list.length - 2; i >= 0 && i >= list.length - 40; i--) {
        const o = list[i];
        if (o !== e && o.type === e.type && o.t < 0.15) { e.life = 0; break; }
      }
    }
  }
  return e;
}

/** エフェクト濃さ: game.settings.fx（1 / 0.5 / 0.15） */
function fxLevel(game) {
  const v = game.settings && game.settings.fx;
  return v == null || isNaN(v) ? 1 : Math.max(0.05, Math.min(1, +v));
}
const alphaOf = (fx) => (fx >= 0.99 ? 1 : fx >= 0.45 ? 0.72 : 0.42);

/**
 * impact(game, power 0..1, color?) — ヒットストップ・ズーム・色フラッシュ・揺れ（main が反映）
 *  game.hitstop（秒, 最大0.12）/ game.camZoom（1.0〜1.08）/ game.flash = {color, a} / game.shake
 */
export function impact(game, power = 0.5, color) {
  if (!game) return;
  const pw = Math.max(0, Math.min(1, +power || 0));
  const fx = fxLevel(game);
  game.hitstop = Math.min(0.12, Math.max(game.hitstop || 0, 0.035 + 0.085 * pw));
  game.camZoom = Math.min(1.08, Math.max(game.camZoom || 1, 1 + 0.08 * pw * (fx < 0.3 ? 0.4 : 1)));
  if (pw >= 0.3) {
    const a = (0.12 + 0.4 * pw) * (fx < 0.3 ? 0.3 : 1);
    if (!game.flash || (game.flash.a || 0) < a) game.flash = { color: color || '#ffffff', a };
  }
  game.shake = Math.max(game.shake || 0, 3 + 11 * pw);
}

// メイプル風ダメージ数字
/** 多段攻撃の数字の時間差（秒）。2ヒット目以降はこの間隔で1つずつ現れて上へ積み重なる */
export const DMG_SEQ_GAP = 0.08;
/** 数字1段の高さ（px） */
const DMG_ROW = 28;
export function spawnDamageNumber(game, x, y, value, opts = {}) {
  if (!game) return null;
  const list = ensure(game);
  const enemyDmg = !opts.toPlayer && !opts.heal && !opts.miss;
  if (enemyDmg && !game.comboExternal) comboHit(game, 1);
  const cnt = game.combo ? game.combo.count | 0 : 0;
  const clv = cnt >= 100 ? 3 : cnt >= 50 ? 2 : cnt >= 20 ? 1 : 0;
  // まとめ表示: 近くの数字に合算（同じ種類・0.45秒以内）
  if (game.settings && game.settings.dmgCompact && !opts.miss) {
    for (let i = list.length - 1; i >= 0 && i >= list.length - 80; i--) {
      const o = list[i];
      if (o.type !== 'dmg' || o.miss || o.t > 0.45 || !!o.toPlayer !== !!opts.toPlayer || !!o.heal !== !!opts.heal) continue;
      if (Math.abs(o.x - x) < 60 && Math.abs(o.baseY - y) < 90) {
        o.value = (o.value || 0) + Math.max(0, Math.round(Number(value) || 0));
        o.text = String(o.value); o.hitsN = (o.hitsN || 1) + 1;
        o.t = Math.min(o.t, 0.12); o.crit = o.crit || !!opts.crit; o.clv = Math.max(o.clv || 0, clv);
        return o;
      }
    }
  }
  // 同じ場所に短時間で出た数字は縦に積む
  //  多段攻撃（opts.seqOf = 1ヒット目の数字, opts.seq = 何ヒット目か）: 1ヒット目の真上へ1段ずつ、DMG_SEQ_GAP 秒ずつ遅れて出す（メイプル風）
  const head = opts.seqOf && opts.seqOf.type === 'dmg' && list.includes(opts.seqOf) ? opts.seqOf : null;
  const seq = head ? Math.max(1, opts.seq | 0) : 0;
  let stack = 0;
  if (head) { stack = head.stack + seq; x = head.x; y = head.baseY; }
  else {
    for (const o of list) {
      if (o.type === 'dmg' && o.t < 0.35 && Math.abs(o.x - x) < 50 && Math.abs(o.baseY - y) < 50 && !!o.toPlayer === !!opts.toPlayer) stack = Math.max(stack, o.stack + 1);
    }
  }
  const v = Math.max(0, Math.round(Number(value) || 0));
  const text = opts.miss ? 'MISS' : String(v);
  const e = {
    kind: 'dmg', type: 'dmg', x, y, baseY: y, t: head ? head.t - seq * DMG_SEQ_GAP : 0, life: opts.crit ? 1.05 : 0.95, seq,
    text, value: v, stack, crit: !!opts.crit, toPlayer: !!opts.toPlayer, heal: !!opts.heal, miss: !!opts.miss, mp: !!opts.mp,
    clv: enemyDmg ? clv : 0,
    seed: seedCounter++,
  };
  list.push(e);
  if (list.length > MAX_EFFECTS) list.splice(0, list.length - MAX_EFFECTS);
  return e;
}

function initParts(e) {
  const R = rng(e.seed * 9973);
  const fxs = e.fx == null ? 1 : e.fx;
  const N = (n) => Math.max(1, Math.round(n * fxs));
  e.R = R; e.N = N;
  const parts = [];
  const add = (n, f) => { n = N(n); for (let i = 0; i < n; i++) parts.push(f(i, n)); };
  const def = FX_TYPES[e.type];
  if (def) { e.parts = parts; if (def.init) def.init(e, R, N); return; }
  switch (e.type) {
    case 'hit': case 'critHit': {
      const n = e.type === 'critHit' ? 12 : 7;
      add(n, (i) => { const a = (i / n) * PI * 2 + R() * 0.5; const s = (e.type === 'critHit' ? 260 : 180) * (0.6 + R() * 0.6); return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + R() * 2 }; });
      break;
    }
    case 'spark':
      add(8, () => { const a = -PI / 2 + (R() - 0.5) * PI * 1.4; const s = 120 + R() * 200; return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + R() * 1.5 }; });
      break;
    case 'explosion': {
      add(16, () => { const a = R() * PI * 2; const s = 120 + R() * 320; return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, r: 2 + R() * 4, c: R() < 0.5 ? '#ffe066' : '#ff5fa2' }; });
      add(8, () => { const a = R() * PI * 2; const s = 30 + R() * 80; return { x: Math.cos(a) * 10, y: Math.sin(a) * 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: 14 + R() * 12, smoke: true }; });
      break;
    }
    case 'smoke':
      add(7, () => ({ x: (R() - 0.5) * 30, y: (R() - 0.5) * 16, vx: (R() - 0.5) * 50, vy: -20 - R() * 40, r: 10 + R() * 10 }));
      break;
    case 'pickup':
      add(8, (i, n) => { const a = (i / n) * PI * 2; return { x: 0, y: 0, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 60, r: 2.4 }; });
      break;
    case 'levelUp': case 'buff': case 'heal': case 'rareDrop':
      add(e.type === 'levelUp' ? 24 : 12, () => ({ x: (R() - 0.5) * 50, y: -R() * 30, vx: (R() - 0.5) * 20, vy: -40 - R() * 90, r: 2 + R() * 2.5, d: R() * 0.5 }));
      break;
    case 'tear': {
      const cols = e.opts.colors || [e.color, shade(e.color, -0.2), '#3a3346'];
      add(e.opts.count || 7, () => {
        const a = -PI / 2 + (R() - 0.5) * 2.4; const s = 120 + R() * 200;
        const pts = []; const m = 4 + ((R() * 2) | 0);
        for (let k = 0; k < m; k++) { const an = (k / m) * PI * 2; const rr = (k % 2 ? 3.5 : 7.5) * (0.7 + R() * 0.6); pts.push(Math.cos(an) * rr, Math.sin(an) * rr); }
        return { x: (R() - 0.5) * 16, y: -30 + (R() - 0.5) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: R() * 6, vr: (R() - 0.5) * 14, pts, c: cols[(R() * cols.length) | 0] };
      });
      break;
    }
    case 'petPick':
      add(4, (i) => ({ x: (R() - 0.5) * 18, y: -R() * 8, vx: (R() - 0.5) * 40, vy: -50 - R() * 50, r: 3 + R() * 2, heart: i % 2 === 0, d: i * 0.06 }));
      break;
    case 'petDrop':
      add(46, (i) => ({ x: (R() - 0.5) * 60, y: -R() * 40, vx: (R() - 0.5) * 50, vy: -60 - R() * 160, r: 2 + R() * 3.5, hue: (i * 37) % 360, d: R() * 1.6, heart: R() < 0.2 }));
      break;
    case 'portal':
      add(14, () => { const a = R() * PI * 2; return { a, r: 30 + R() * 20, vr: -40 - R() * 30, va: 4 + R() * 3, s: 2 + R() * 2 }; });
      break;
    case 'dash':
      add(6, () => ({ x: -R() * 40, y: -10 - R() * 50, l: 20 + R() * 30 }));
      break;
  }
  e.parts = parts;
}

export function updateEffects(game, dt) {
  if (!game) return;
  const p = game.player;
  if (game.screenFx && game.screenFx.length) updateList(game, game.screenFx, dt);
  const list = game.effects;
  if (list) updateList(game, list, dt);
  if (p) { const lp = game._fxPrevPlayer || (game._fxPrevPlayer = { x: 0, y: 0 }); lp.x = p.x; lp.y = p.y; }
  // インスタンス背景用（background.js は game を受け取らないので map に写す）
  const m = game.map;
  if (m && m.instance) { m._wave = game.arenaRun ? game.arenaRun.wave | 0 : 0; m._bossMode = game.bossMode || null; }
  // コンボ: 一定時間ヒットが無ければリセット
  const cb = game.combo;
  if (cb && cb.count > 0 && !game.comboExternal) { cb.t = (cb.t || 0) + dt; if (cb.t > COMBO_WINDOW) { cb.count = 0; cb.t = 0; } }
}
export const COMBO_WINDOW = 3.2;
/** comboHit(game, n=1) — コンボ数を加算（spawnDamageNumber が敵へのダメージで自動で呼ぶ。game.comboExternal=true なら呼ばない） */
export function comboHit(game, n = 1) {
  if (!game) return;
  const cb = game.combo || (game.combo = { count: 0, t: 0, max: 0 });
  cb.count += n; cb.t = 0; cb.bump = 0;
  if (cb.count > (cb.max || 0)) cb.max = cb.count;
}

function updateList(game, list, dt) {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    e.t += dt;
    if (e.t >= e.life) continue;
    if (e.target && !e.target.dead) { e.x = e.target.x; e.y = e.target.y + (e.opts && e.opts.offsetY || 0); if (e.target.facing && e.type.startsWith('move_')) e.dir = e.target.facing; }
    const def = e.kind === 'fx' ? FX_TYPES[e.type] : null;
    if (def && def.tick) { try { def.tick(e, dt, game, spawnEffect); } catch (err) { e.life = 0; } }
    if (e.parts) {
      const grav = e.type === 'tear' ? 500 : e.type === 'spark' || e.type === 'explosion' ? 380 : 0;
      const drag = e.type === 'hit' || e.type === 'critHit' ? Math.pow(0.02, dt) : 1;
      for (const p of e.parts) {
        if (p.vx != null && p.x != null) {
          p.vx *= drag; p.vy *= drag;
          if (!p.smoke) p.vy += (p.grav || grav) * dt;
          if (e.type === 'tear') { p.vx *= Math.pow(0.4, dt); p.vy = Math.min(p.vy, 90); p.rot += p.vr * dt; }
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.rock && p.y > 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; }
        } else if (p.a != null && p.va != null) { p.a += p.va * dt; p.r = Math.max(2, p.r + p.vr * dt); }
      }
    }
    list[w++] = e;
  }
  list.length = w;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export function drawEffects(ctx, game) {
  const list = game && game.effects;
  if (!list || !list.length) { if (game) game._fxCost = (game._fxCost || 0) * 0.9; return; }
  const t0 = nowMs();
  // 通常エフェクト（加算）→ ダメージ数字（通常合成・最前面）
  ctx.save();
  for (const e of list) if (e.kind !== 'dmg' && !e.hide) drawFx(ctx, e);
  FXA.m = 1;
  ctx.restore();
  for (const e of list) if (e.kind === 'dmg') drawDmg(ctx, e);
  game._fxCost = (game._fxCost || 0) * 0.85 + (nowMs() - t0) * 0.15;
}

/** drawCutins(ctx, game) — 画面空間: カットイン＋画面空間エフェクト（opts.screen）。main が HUD の前に呼ぶ */
export function drawCutins(ctx, game) {
  if (!game) return;
  drawBossBar(ctx, game);
  if (!game._screenFxSeparate) drawScreenFx(ctx, game, true);
  drawCutinLayer(ctx, game);
}

// ---------------------------------------------------------------- ボスの HP バー（画面の上・中央）
// メイプル風: 左にボスの印、横長のバー（段ごとに色が変わる）、右に残りの段数「x5」。見た目だけ（HP は1本のまま）。
//  占める範囲: y 6〜46, x = 中央 ±310。HUD のマップ名などはこれより下（y ≥ 56）に。
const BOSS_LAYER_COLS = ['#e8121e', '#ff7a1a', '#f5c400', '#2fbf4a', '#14b8e8', '#3a62ff', '#a040ff', '#ff3dc8'];
export const BOSS_BAR_RECT = { y: 6, h: 40, w: 620 };
function bossLayers(def) {
  if (def.hpBars) return def.hpBars | 0;
  return Math.max(3, Math.min(10, Math.round((def.level || 10) / 12) + 3));
}
export function drawBossBar(ctx, game) {
  const list = game && game.enemies;
  if (!list || !list.length || game.scene !== 'play') return;
  const p = game.player;
  let b = null;
  for (const e of list) {
    if (!e || e.dead || !(e.hp > 0) || !(e.boss || (e.def && e.def.boss))) continue;
    if (p && Math.abs(e.x - p.x) > 1500 && !e.aggro) continue;
    b = e; break;
  }
  if (!b) return;
  const def = b.def || {};
  const W = game.W || 1280;
  const n = bossLayers(def);
  const frac = Math.max(0, Math.min(1, b.hp / (b.maxHp || 1)));
  const total = frac * n;
  const left = Math.max(1, Math.ceil(total - 1e-6));
  const inK = Math.max(0, Math.min(1, total - (left - 1)));
  // 遅れて減る白帯（段が変わったらその段の満タンから）
  if (b._barLayer !== left) { b._barLayer = left; b._barLag = 1; }
  b._barLag = b._barLag == null || b._barLag < inK ? inK : b._barLag + (inK - b._barLag) * Math.min(1, (game.dt || 1 / 60) * 3);
  b._barIn = Math.min(1, (b._barIn || 0) + (game.dt || 1 / 60) * 4);
  const { y: Y, w: BW } = BOSS_BAR_RECT;
  const x0 = Math.round(W / 2 - BW / 2);
  ctx.save();
  ctx.globalAlpha = b._barIn;
  // 外枠
  ctx.fillStyle = 'rgba(8,4,20,0.78)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, Y, BW, 40, 6) : ctx.rect(x0, Y, BW, 40); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  // 左: ボスの印（ボスの色の円に王冠）
  const ix = x0 + 4, iy = Y + 4;
  ctx.fillStyle = '#1a0b30'; ctx.fillRect(ix, iy, 32, 32);
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.strokeRect(ix + 0.5, iy + 0.5, 31, 31);
  ctx.fillStyle = def.color || '#ff3d7f'; ctx.beginPath(); ctx.arc(ix + 16, iy + 19, 10, 0, PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath();
  ctx.moveTo(ix + 7, iy + 12); ctx.lineTo(ix + 9, iy + 4); ctx.lineTo(ix + 12.5, iy + 9); ctx.lineTo(ix + 16, iy + 3); ctx.lineTo(ix + 19.5, iy + 9); ctx.lineTo(ix + 23, iy + 4); ctx.lineTo(ix + 25, iy + 12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a1a00'; ctx.lineWidth = 1; ctx.stroke();
  // 名前（バーの上の行）
  ctx.font = "bold 12px 'M PLUS Rounded 1c', sans-serif"; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd84a';
  ctx.fillText(`Lv.${b.level ?? def.level ?? '?'}  ${def.name || b.name || 'BOSS'}`, x0 + 42, Y + 11);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.round(frac * 1000) / 10}%`, x0 + BW - 54, Y + 11);
  // バー本体: 下の段の色を地に、今の段の色を上に
  const bx = x0 + 42, by = Y + 20, bw = BW - 42 - 56, bh = 15;
  ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = left > 1 ? BOSS_LAYER_COLS[(left - 2) % BOSS_LAYER_COLS.length] : '#2a0a12'; ctx.fillRect(bx, by, bw, bh);
  if (b._barLag > inK) { ctx.fillStyle = 'rgba(255,245,230,0.9)'; ctx.fillRect(bx, by, bw * b._barLag, bh); }
  const cc = BOSS_LAYER_COLS[(left - 1) % BOSS_LAYER_COLS.length];
  ctx.fillStyle = cc; ctx.fillRect(bx, by, bw * inK, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx, by, bw * inK, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx, by + bh - 3, bw * inK, 3);
  // 右: 残りの段数
  drawMapleText(ctx, 'x' + left, x0 + BW - 28, Y + 21, 'white', 24, { kern: 0.88 });
  ctx.restore();
}

/**
 * drawScreenFx(ctx, game) — 画面空間エフェクト（spawnEffect(..., {screen:true}): 強化・潜在の演出など）。
 * UI 窓の上に出したい場合は ui.draw の後に呼ぶ（一度呼ぶと drawCutins 側では描かなくなる）。
 */
export function drawScreenFx(ctx, game, _fromCutins) {
  if (!game) return;
  if (!_fromCutins) game._screenFxSeparate = true;
  const sl = game.screenFx;
  if (sl && sl.length) {
    // ワールドが止まっている間（UI窓・ヒットストップ）も進める
    if (game.paused || game.hitstop > 0 || game.scene !== 'play' || (game.ui && game.ui.isOpen && game.ui.isOpen('worldmap'))) updateList(game, sl, game.dt || 1 / 60);
    ctx.save();
    for (const e of sl) if (!e.hide) drawFx(ctx, e);
    FXA.m = 1;
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 各エフェクト
function drawFx(ctx, e) {
  const k = e.t / e.life; // 0..1
  const c = e.color;
  FXA.m = alphaOf(e.fx == null ? 1 : e.fx);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = FXA.m;
  const def = FX_TYPES[e.type];
  const add = def ? def.add !== false : e.type !== 'smoke' && e.type !== 'tear';
  if (add) ctx.globalCompositeOperation = 'lighter';
  if (def) {
    try { def.draw(ctx, e, k); } catch (err) { e.life = 0; if (!drawFx._w) { drawFx._w = 1; console.warn('[fx] draw failed', e.type, err); } }
    ctx.restore();
    return;
  }
  switch (e.type) {
    case 'slash': {
      const r = e.size || (e.opts.w ? Math.min(110, Math.max(40, e.opts.w * 0.42)) : e.opts.range ? Math.min(90, Math.max(40, e.opts.range * 0.5)) : 46);
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const a0 = -1.6 + k * 0.6, a1 = -1.6 + Math.min(1, k * 2.2) * 2.8;
      ctx.globalAlpha = FXA.m * (1 - k * k);
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.arc(-6, 2, r - 12, a1 - 0.1, a0 + 0.5, true); ctx.closePath();
      if (e.opts.rainbow) {
        const rg = ctx.createLinearGradient(-r, -r, r, r);
        for (let i = 0; i < RB.length; i++) rg.addColorStop(i / (RB.length - 1), RB[(i + ((e.t * 24) | 0)) % RB.length]);
        ctx.fillStyle = rg;
      } else ctx.fillStyle = rgba(c, 0.55);
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r - 2, a0 + 0.3, a1); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r + 6, a0 + 0.6, a1 - 0.2); ctx.strokeStyle = rgba(c, 0.5); ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    case 'hit': case 'critHit': {
      // メイプル風の打撃の光: 白い核（すぐ縮む）＋放射状の細い光の線（武器・スキルの色）＋外側の薄い輪
      const crit = e.type === 'critHit';
      const col = crit && !e.opts.color ? '#ff4f8a' : c;
      const R = (crit ? 46 : 32) * (0.55 + 0.45 * Math.min(1, k * 2.4));
      const a = Math.max(0, 1 - k * 1.15);
      // 放射状の線（くさび形）: 種ごとに角度・長さを固定
      const n = crit ? 12 : 8;
      ctx.globalAlpha = FXA.m * a;
      ctx.fillStyle = rgba(col, 0.9);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const an = (i / n) * PI * 2 + ((e.seed * 0.7) % 1) * 0.8 + (i % 2) * 0.12;
        const len = R * (i % 2 ? 0.72 : 1.08) * (0.85 + ((e.seed * (i + 3) * 0.37) % 1) * 0.3);
        const wd = (crit ? 3.6 : 2.8) * (1 - k * 0.6);
        const cs = Math.cos(an), sn = Math.sin(an);
        const r0 = R * 0.22;
        ctx.moveTo(cs * r0 - sn * wd, sn * r0 + cs * wd);
        ctx.lineTo(cs * len, sn * len);
        ctx.lineTo(cs * r0 + sn * wd, sn * r0 - cs * wd);
      }
      ctx.fill();
      // 線の芯（白）
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = crit ? 1.6 : 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i += 2) {
        const an = (i / n) * PI * 2 + ((e.seed * 0.7) % 1) * 0.8;
        ctx.moveTo(Math.cos(an) * R * 0.25, Math.sin(an) * R * 0.25); ctx.lineTo(Math.cos(an) * R * 0.85, Math.sin(an) * R * 0.85);
      }
      ctx.stroke();
      // 白い核（出た瞬間がいちばん大きく、すぐ縮む）
      const core = (crit ? 17 : 12) * Math.max(0, 1 - k * 1.6);
      if (core > 0.5) {
        ctx.globalAlpha = FXA.m * Math.min(1, a * 1.3);
        ctx.fillStyle = rgba(col, 0.55); ctx.beginPath(); ctx.arc(0, 0, core * 1.7, 0, PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, core, 0, PI * 2); ctx.fill();
      }
      // 外側の薄い輪
      ctx.globalAlpha = FXA.m * a * 0.7;
      ctx.strokeStyle = rgba(crit ? '#ffe066' : col, 0.85); ctx.lineWidth = 2 * (1 - k);
      ctx.beginPath(); ctx.arc(0, 0, R * 1.05, 0, PI * 2); ctx.stroke();
      // 飛び散る粒
      ctx.fillStyle = crit ? '#ffe066' : '#ffffff';
      for (const p of e.parts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k), 0, PI * 2); ctx.fill(); }
      break;
    }
    case 'spark': {
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath();
      for (const p of e.parts) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
      ctx.stroke();
      break;
    }
    case 'explosion': {
      const R = e.size ? Math.min(150, e.size * 0.5) : 80;
      const fk = Math.min(1, k * 3);
      // 閃光
      ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 2.2));
      const g = ctx.createRadialGradient(0, -10, 2, 0, -10, R * (0.4 + fk * 0.8));
      g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, rgba('#ffd23f', 0.9)); g.addColorStop(0.7, rgba(c, 0.6)); g.addColorStop(1, rgba('#ff3d7f', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -10, R * (0.4 + fk * 0.8), 0, PI * 2); ctx.fill();
      // 衝撃波リング
      ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 1.5));
      ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 4 * (1 - k);
      ctx.beginPath(); ctx.ellipse(0, -6, R * (0.3 + k * 1.1), R * (0.12 + k * 0.4), 0, 0, PI * 2); ctx.stroke();
      ctx.globalAlpha = FXA.m * (1 - k);
      for (const p of e.parts) {
        if (p.smoke) continue;
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y - 10, p.r * (1 - k * 0.7), 0, PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const p of e.parts) {
        if (!p.smoke) continue;
        ctx.globalAlpha = FXA.m * (Math.max(0, 0.5 * (1 - k)) * Math.min(1, k * 4));
        ctx.fillStyle = '#5a4a66'; ctx.beginPath(); ctx.arc(p.x, p.y - 14, p.r * (0.6 + k), 0, PI * 2); ctx.fill();
      }
      break;
    }
    case 'smoke': {
      for (const p of e.parts) {
        ctx.globalAlpha = FXA.m * (0.45 * (1 - k));
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + k * 0.9), 0, PI * 2); ctx.fill();
        ctx.globalAlpha = FXA.m * (0.25 * (1 - k));
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.4 * (0.6 + k), 0, PI * 2); ctx.fill();
      }
      break;
    }
    case 'pickup': {
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 6 + k * 22, 0, PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const p of e.parts) { ctx.beginPath(); starPath(ctx, p.x, p.y, p.r * 1.6, p.r * 0.6, 4); ctx.fill(); }
      break;
    }
    case 'muzzle': {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      ctx.globalAlpha = FXA.m * (1 - k);
      const s = (e.size || 16) * (1 + k);
      ctx.fillStyle = 'rgba(255,240,180,0.95)';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 1.4, 0); ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 0.3, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(e.opts.color ? c : '#ff9a3c', 0.7);
      ctx.beginPath(); starPath(ctx, s * 0.3, 0, s * 0.8, s * 0.3, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(s * 0.2, 0, s * 0.32 * (1 - k), 0, PI * 2); ctx.fill();
      break;
    }
    case 'dash': {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = 3;
      ctx.beginPath();
      for (const p of e.parts) { const o = k * 60; ctx.moveTo(p.x - o, p.y + 30); ctx.lineTo(p.x - o - p.l, p.y + 30); }
      ctx.stroke();
      ctx.fillStyle = rgba(c, 0.25 * (1 - k)); ctx.beginPath(); ctx.ellipse(-20 - k * 30, 0, 24, 34, 0, 0, PI * 2); ctx.fill();
      break;
    }
    case 'buff': case 'heal': case 'levelUp': case 'rareDrop': {
      drawRising(ctx, e, k, c);
      break;
    }
    case 'petPick': {
      for (const p of e.parts) {
        if (e.t < p.d) continue;
        ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 1.1));
        ctx.fillStyle = p.heart ? '#ff6fb5' : '#fff6a0';
        if (p.heart) heartPath(ctx, p.x, p.y, p.r); else { ctx.beginPath(); starPath(ctx, p.x, p.y, p.r * 1.5, p.r * 0.5, 4, e.t * 3); }
        ctx.fill();
      }
      ctx.globalAlpha = FXA.m * (1);
      break;
    }
    case 'petDrop': {
      drawPetDrop(ctx, e, k);
      break;
    }
    case 'questClear': {
      drawQuestClear(ctx, e, k);
      break;
    }
    case 'portal': {
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, -40, 30 * (1 - k * 0.5), 44 * (1 - k * 0.5), 0, 0, PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const p of e.parts) { ctx.beginPath(); ctx.arc(Math.cos(p.a) * p.r, -40 + Math.sin(p.a) * p.r * 1.3, p.s, 0, PI * 2); ctx.fill(); }
      break;
    }
    case 'tear': {
      for (const p of e.parts) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7) * 0.6 + 0.4 || 0.1);
        ctx.globalAlpha = FXA.m * (Math.min(1, (1 - k) * 2));
        ctx.beginPath(); ctx.moveTo(p.pts[0], p.pts[1]); for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]); ctx.closePath();
        ctx.fillStyle = p.c; ctx.fill(); ctx.strokeStyle = '#2a1430'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
      break;
    }
    default: {
      ctx.globalAlpha = FXA.m * (1 - k); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 10 * (1 + k), 0, PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawRising(ctx, e, k, c) {
  const type = e.type;
  const fade = k < 0.8 ? 1 : (1 - k) / 0.2;
  if (type === 'levelUp' || type === 'rareDrop') {
    // 光の柱
    const h = type === 'levelUp' ? 220 : 130;
    const w = type === 'levelUp' ? 64 : 26;
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.6, rgba(c, 0.35 * fade)); g.addColorStop(1, rgba('#ffffff', 0.55 * fade));
    ctx.fillStyle = g;
    const ww = w * (type === 'levelUp' ? Math.min(1, k * 5) : 1) * (1 + Math.sin(e.t * 10) * 0.05);
    ctx.beginPath(); ctx.moveTo(-ww / 2, 0); ctx.lineTo(-ww * 0.35, -h); ctx.lineTo(ww * 0.35, -h); ctx.lineTo(ww / 2, 0); ctx.closePath(); ctx.fill();
    // 足元リング
    ctx.strokeStyle = rgba(c, 0.8 * fade); ctx.lineWidth = 3;
    const rk = (e.t * 1.5) % 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 20 + rk * 30, 6 + rk * 8, 0, 0, PI * 2); ctx.stroke();
  }
  if (type === 'buff') {
    ctx.strokeStyle = rgba(c, 0.8 * (1 - k)); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -4, 22 + k * 20, 7 + k * 6, 0, 0, PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -40 - k * 30, 16 + k * 10, 5 + k * 3, 0, 0, PI * 2); ctx.stroke();
  }
  for (const p of e.parts) {
    if (e.t < p.d) continue;
    ctx.globalAlpha = FXA.m * (fade * 0.9);
    ctx.fillStyle = type === 'heal' ? '#c8ffd8' : type === 'levelUp' ? (p.r > 3 ? '#ffe066' : '#ffffff') : '#ffffff';
    if (type === 'heal') { ctx.fillRect(p.x - p.r, p.y - p.r * 0.35, p.r * 2, p.r * 0.7); ctx.fillRect(p.x - p.r * 0.35, p.y - p.r, p.r * 0.7, p.r * 2); }
    else { ctx.beginPath(); starPath(ctx, p.x, p.y, p.r * 1.8, p.r * 0.6, 4, e.t * 2); ctx.fill(); }
  }
  ctx.globalAlpha = FXA.m * (1);
  if (type === 'levelUp' && (e.opts.text || !e.opts.color)) {
    // メイプル風の「LEVEL UP!!」: 金色の角ばった大きな文字（キャッシュ画像）。拡大して出て、少し上がって止まり、消える。
    //  （転職の光柱として色つきで呼ばれた時＝ jobs.js は文字を出さない）
    ctx.globalCompositeOperation = 'source-over';
    const img = mapleWordImage(e.opts.text || 'LEVEL UP!!', 'gold', 44, { kern: 0.9 });
    if (img) {
      const t = e.t;
      const pop = t < 0.09 ? 0.35 + (t / 0.09) * 0.9 : t < 0.18 ? 1.25 - ((t - 0.09) / 0.09) * 0.25 : 1;
      const ty = -128 - Math.min(1, t / 0.35) * 14;
      ctx.save(); ctx.translate(0, ty); ctx.scale(pop, pop);
      ctx.globalAlpha = FXA.m * fade;
      ctx.drawImage(img.img, -img.w / 2, -img.h / 2, img.w, img.h);
      // つやの光が左から右へ走る（加算で細い帯）
      const sk = (t - 0.2) / 0.45;
      if (sk > 0 && sk < 1) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = FXA.m * fade * 0.5 * Math.sin(sk * PI);
        const sx = -img.w / 2 + sk * img.w;
        ctx.fillStyle = '#fff6c0';
        ctx.beginPath(); ctx.moveTo(sx - 6, -img.h * 0.32); ctx.lineTo(sx + 8, -img.h * 0.32); ctx.lineTo(sx - 2, img.h * 0.32); ctx.lineTo(sx - 16, img.h * 0.32); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
}

// クエスト達成の帯（画面空間・中央）: 横に広がる黒い帯＋金の線、「QUEST CLEAR」の金文字が拡大して出る、下にクエスト名
function drawQuestClear(ctx, e, k) {
  ctx.globalCompositeOperation = 'source-over';
  const t = e.t, W = e.opts.W || 1280;
  const fade = k < 0.82 ? 1 : (1 - k) / 0.18;
  const open = Math.min(1, t / 0.2), eo = 1 - (1 - open) * (1 - open);
  const bw = W * eo, bh = 66;
  ctx.globalAlpha = fade;
  const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  g.addColorStop(0, 'rgba(10,4,24,0)'); g.addColorStop(0.18, 'rgba(10,4,24,0.72)'); g.addColorStop(0.82, 'rgba(10,4,24,0.72)'); g.addColorStop(1, 'rgba(10,4,24,0)');
  ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  const lg = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  lg.addColorStop(0, 'rgba(255,210,63,0)'); lg.addColorStop(0.5, 'rgba(255,226,120,1)'); lg.addColorStop(1, 'rgba(255,210,63,0)');
  ctx.fillStyle = lg; ctx.fillRect(-bw / 2, -bh / 2, bw, 2); ctx.fillRect(-bw / 2, bh / 2 - 2, bw, 2);
  if (t > 0.08) {
    const tt = t - 0.08;
    const pop = tt < 0.1 ? 0.3 + (tt / 0.1) * 0.95 : tt < 0.2 ? 1.25 - ((tt - 0.1) / 0.1) * 0.25 : 1;
    const img = mapleWordImage(e.opts.text || 'QUEST CLEAR', 'gold', 46, { kern: 0.9 });
    if (img) {
      ctx.save(); ctx.translate(0, e.opts.name ? -7 : 0); ctx.scale(pop, pop);
      ctx.drawImage(img.img, -img.w / 2, -img.h / 2, img.w, img.h);
      ctx.restore();
    }
    // 左右のきらめき
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff6c0';
    for (let i = 0; i < 6; i++) {
      const a = (t * 1.6 + i / 6) % 1;
      const px = (i % 2 ? 1 : -1) * (150 + i * 28 + a * 40), py = -20 + ((i * 37) % 40) - a * 10;
      ctx.globalAlpha = fade * Math.sin(a * PI) * 0.9;
      ctx.beginPath(); starPath(ctx, px, py, 7, 2, 4, 0); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (e.opts.name && tt > 0.15) {
      ctx.globalAlpha = fade * Math.min(1, (tt - 0.15) * 5);
      ctx.font = "bold 15px 'M PLUS Rounded 1c', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#1a0b30'; ctx.strokeText(e.opts.name, 0, 22);
      ctx.fillStyle = '#ffffff'; ctx.fillText(e.opts.name, 0, 22);
    }
  }
}

function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.closePath();
}
const RAINBOW = ['#ff4f6d', '#ff9a3c', '#ffe066', '#5cff9a', '#3ee6d2', '#4fa8ff', '#b45cff', '#ff4fd8'];
// PET 入手: 超豪華な虹色の柱
function drawPetDrop(ctx, e, k) {
  const fade = k < 0.85 ? 1 : (1 - k) / 0.15;
  const grow = Math.min(1, e.t * 3);
  const H = 320 * grow, W = 70;
  // 虹の柱（縦ストライプを流す）
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-W / 2, 0); ctx.lineTo(-W * 0.32, -H); ctx.lineTo(W * 0.32, -H); ctx.lineTo(W / 2, 0); ctx.closePath();
  ctx.clip();
  const n = RAINBOW.length;
  const off = (e.t * 60) % (W * 2 / n * n);
  for (let i = -1; i < n * 2 + 1; i++) {
    const x = -W + i * (W * 2 / n) - off * 0.5;
    ctx.fillStyle = rgba(RAINBOW[((i % n) + n) % n], 0.42 * fade);
    ctx.fillRect(x, -H, W * 2 / n + 1, H);
  }
  const vg = ctx.createLinearGradient(0, -H, 0, 0);
  vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(0.7, rgba('#ffffff', 0.25 * fade)); vg.addColorStop(1, rgba('#ffffff', 0.85 * fade));
  ctx.fillStyle = vg; ctx.fillRect(-W, -H, W * 2, H);
  ctx.restore();
  // 中心の白い芯
  const cg = ctx.createLinearGradient(0, -H, 0, 0);
  cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(1, rgba('#ffffff', 0.9 * fade));
  ctx.fillStyle = cg; ctx.fillRect(-5 - Math.sin(e.t * 20) * 1.5, -H, 10 + Math.sin(e.t * 20) * 3, H);
  // 足元の多重リング
  for (let i = 0; i < 3; i++) {
    const rk = (e.t * 0.9 + i / 3) % 1;
    ctx.strokeStyle = rgba(RAINBOW[(i * 3) % n], 0.9 * (1 - rk) * fade); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 24 + rk * 80, 7 + rk * 20, 0, 0, PI * 2); ctx.stroke();
  }
  // 放射光線
  ctx.save(); ctx.translate(0, -60); ctx.rotate(e.t * 0.8);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(PI / 6);
    ctx.fillStyle = rgba(RAINBOW[i % n], 0.18 * fade * grow);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -140); ctx.lineTo(10, -140); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // 粒（虹の星・ハート）
  for (const p of e.parts) {
    if (e.t < p.d) continue;
    const lk = Math.min(1, (e.t - p.d) / 1.4);
    ctx.globalAlpha = FXA.m * (fade * (1 - lk));
    ctx.fillStyle = RAINBOW[(p.hue / 45) | 0];
    if (p.heart) heartPath(ctx, p.x, p.y, p.r * 1.3); else { ctx.beginPath(); starPath(ctx, p.x, p.y, p.r * 1.9, p.r * 0.6, 4, e.t * 2 + p.hue); }
    ctx.fill();
  }
  ctx.globalAlpha = FXA.m * (1);
  // PET GET! 文字
  if (e.t > 0.25) {
    ctx.globalCompositeOperation = 'source-over';
    const kk = e.t - 0.25;
    const pop = kk < 0.12 ? 0.5 + (kk / 0.12) * 0.8 : kk < 0.2 ? 1.3 - ((kk - 0.12) / 0.08) * 0.3 : 1;
    ctx.save(); ctx.translate(0, -150 - Math.min(1, kk * 3) * 16); ctx.scale(pop, pop);
    ctx.globalAlpha = FXA.m * (fade);
    const label = (e.opts && e.opts.text) || 'PET GET!!';
    ctx.font = '900 32px "Arial Black", "Arial Rounded MT Bold", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 8; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(label, 0, 0);
    const g = ctx.createLinearGradient(-90, 0, 90, 0);
    const sh = (e.t * 0.5) % 1;
    for (let i = 0; i < n; i++) g.addColorStop((i / n + sh) % 1, RAINBOW[i]);
    ctx.fillStyle = g; ctx.fillText(label, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(label, 0, -2);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- ダメージ数字
// メイプル風: 1桁ずつキャッシュした角ばった数字（render/mapleFont.js）を、隣と少し重ねて並べる。
//  1桁目だけ大きく、2桁目以降は少し小さく交互に上下へずらす。出た瞬間にわずかに拡大→上へ少し浮いて止まり→フェード。
const DMG_STYLE = {
  normal: { key: 'normal', size: 36 },
  crit: { key: 'crit', size: 40 },
  toPlayer: { key: 'toPlayer', size: 34 },
  heal: { key: 'heal', size: 32 },
  miss: { key: 'miss', size: 30 },
  mp: { key: 'mp', size: 32 },
  combo1: { key: 'combo1', size: 37 },
  combo3: { key: 'combo3', size: 38 },
  critHi: { key: 'critHi', size: 44 },
};
const DMG_LAYOUT = { first: 1, rest: 0.84, kern: 0.9, jitter: 1.6 };

function drawDmg(ctx, e) {
  if (e.t < 0) return; // 多段攻撃の順番待ち（まだ出ていない）
  const st = e.miss ? DMG_STYLE.miss : e.heal ? (e.mp ? DMG_STYLE.mp : DMG_STYLE.heal) : e.toPlayer ? DMG_STYLE.toPlayer : e.crit ? (e.clv >= 2 ? DMG_STYLE.critHi : DMG_STYLE.crit) : e.clv >= 3 ? DMG_STYLE.combo3 : e.clv >= 1 ? DMG_STYLE.combo1 : DMG_STYLE.normal;
  const t = e.t, k = t / e.life;
  // 上へ少し浮いて止まる（0.42秒で 22px。消える間だけさらに少し上がる）
  const ek = Math.min(1, t / 0.42);
  const fadeK = k < 0.62 ? 0 : (k - 0.62) / 0.38;
  const rise = (1 - (1 - ek) * (1 - ek)) * 22 + fadeK * 10;
  const y = e.baseY - DMG_ROW * e.stack - rise - 16;
  // 出た瞬間の拡大: 通常はわずかに、クリティカルは大きく拡大してから戻る（少し縮んで1.0へ）
  let pop = 1;
  if (e.crit && !e.toPlayer && !e.miss) pop = t < 0.06 ? 1.75 - (t / 0.06) * 0.85 : t < 0.13 ? 0.9 + ((t - 0.06) / 0.07) * 0.1 : 1;
  else pop = t < 0.07 ? 1.22 - (t / 0.07) * 0.22 : 1;
  const alpha = 1 - fadeK;
  if (alpha <= 0) return;
  const size = st.size + (e.clv || 0) * 1.5 + (e.hitsN > 1 ? Math.min(6, e.hitsN * 0.6) : 0);
  // 数字ごとに1枚の画像へまとめて描き（字はキャッシュ済み）、以後は drawImage 1回だけ。まとめ表示で数字が変わったら作り直す
  const key = st.key + '|' + size + '|' + e.text;
  if (e._imgKey !== key) {
    e._imgKey = key;
    e._img = renderMapleText(e.text, st.key, size, e.miss ? { kern: 0.9 } : DMG_LAYOUT);
  }
  const im = e._img;
  if (!im) return;
  ctx.save();
  ctx.translate(e.x, y);
  if (pop !== 1) ctx.scale(pop, pop);
  ctx.globalAlpha = alpha;
  ctx.drawImage(im.img, -im.w / 2, -im.h / 2, im.w, im.h);
  const L = { w: im.tw };
  if (e.crit && !e.toPlayer && !e.miss) {
    // ★: 1桁目の左上
    const s = critStarImage();
    if (s) { const sz = size * 0.72; ctx.drawImage(s.img, -L.w / 2 - sz * 0.62, -size * 0.78, sz, sz); }
  }
  if (e.hitsN > 1) drawMapleText(ctx, 'x' + e.hitsN, L.w / 2 + 4, size * 0.16, 'white', size * 0.5, { align: 'left', kern: 0.86 });
  ctx.restore();
}


// ---------------------------------------------------------------- イベント連動の演出
const GRADE_COL = { rare: '#4da6ff', epic: '#b04dff', unique: '#ffb800', legendary: '#ffb800', mythic: '#ff3d7f' };
const GRADE_NAME = { rare: 'RARE', epic: 'EPIC', unique: 'UNIQUE', legendary: 'LEGENDARY', mythic: 'MYTHIC' };
/**
 * attachFx(game) — events を購読して演出を出す（main が1回呼ぶ。戻り値で購読解除）
 *  jobAdvanced → 'jobUp'（足元の魔法陣＋光柱＋職名）。o.jobCutin=true ならカットインも
 *  tuneResult → 画面中央に 'tuneSuccess' / 'tuneFail'（screen）
 *  potentialGradeUp → 'gradeUp'（screen）
 */
export function attachFx(game, o = {}) {
  const ev = game && game.events;
  if (!ev || !ev.on) return () => {};
  const offs = [];
  const center = () => [(game.W || 1280) / 2, (game.H || 720) * 0.42];
  offs.push(ev.on('jobAdvanced', (d) => {
    const p = game.player, j = d && d.job;
    // 転職は HUD の「JOB ADVANCE!」の帯が出るので、重なる QUEST CLEAR の帯はすぐ消す
    for (const e of game.screenFx || []) if (e.type === 'questClear') e.life = Math.min(e.life, e.t + 0.15);
    if (!p || !j) return;
    const col = j.aura || '#ffe066';
    spawnEffect(game, 'jobUp', p.x, p.y, { color: col, name: j.name, title: 'JOB UP!', _child: true });
    // UI 側に転職演出（JOB ADVANCE!）があるため、カットインは o.jobCutin=true のときだけ
    if (o.jobCutin) spawnEffect(game, 'cutin', 0, 0, { name: j.name, color: col, expr: 'smile', line: j.title ? `「${j.title}」の名にかけて！` : undefined });
    impact(game, 0.6, col);
  }));
  // クエスト達成: 画面中央に「QUEST CLEAR」の帯（メイプルの完了の帯）
  offs.push(ev.on('missionComplete', (d) => {
    const m = d && MISSIONS[d.id];
    if (m && (m.type === 'job' || m.category === 'job')) return; // 転職のクエストは HUD の転職の帯に任せる
    spawnEffect(game, 'questClear', (game.W || 1280) / 2, (game.H || 720) * 0.3, { screen: true, W: game.W || 1280, name: m ? m.name : '' });
  }));
  offs.push(ev.on('tuneResult', (d) => {
    const [x, y] = center();
    if (d && d.success) spawnEffect(game, 'tuneSuccess', x, y, { screen: true, star: d.star });
    else spawnEffect(game, 'tuneFail', x, y, { screen: true, text: 'FAILED…' });
  }));
  offs.push(ev.on('potentialGradeUp', (d) => {
    const [x, y] = center();
    const g = d && d.grade;
    spawnEffect(game, 'gradeUp', x, y, { screen: true, color: GRADE_COL[g] || '#ffb800', grade: GRADE_NAME[g] || g || '' });
  }));
  return () => { for (const f of offs) try { f(); } catch (e) { /* ignore */ } };
}
