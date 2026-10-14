// 戦闘の演出（コードで描くエフェクト）。scene.js から使い、sceneHooks（projectile / area / fx / drawFx）にも登録する。
//
// ・加算合成の光の部品（光の玉・輪・斬撃・尾・火花・炎・氷の欠片）をキャッシュしておき、毎フレームは drawImage だけで描く。
// ・差し替え画像（fx.<skill>.proj/hit/area/swing, fx.enemy.*）があればそれを描き、無ければコードの演出（assets.isCustom で分ける）。
// ・combat.js が出す出来事（fx）: dmg hit swing nova pulse chain death shake gold loot levelup summon buff boss cast text heroDeath revive
//   さらに戦闘担当が足す beam leap dash ult crit whirl aura trap totem meteor orbit wall wave curse barrier shield teleport telegraph
//   explode heal spawn … も受け取る。知らない種類も、持っている値（x,y / unit / pts / x2）から見た目を決めて必ず何か出す。
// ・ダメージの数字は相手ごとに 100ms で合算、会心は 0→1.3→1.0 に弾む、同時 30 個まで。
// ・ドロップは演出段 L0〜L5（分解は無言 / 名前 / 光柱 / 帯とスロー / 画面の縁が光る＋カードめくり）。

import { assets, makeCanvas } from './assets.js';
import { ELEMENT_COLORS } from '../data/stats.js';
import { RARITY } from '../data/rarity.js';
import { SKILL } from '../data/skills.js';
import { CLASS } from '../data/classes.js';
import { itemIconId } from './manifest.js';
import { fmt } from '../engine/format.js';
import { itemName } from '../game/items.js';

export const GROUND = 560;
const TAU = Math.PI * 2;
const rnd = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------- 属性の色
export const EL = {
  phys: { core: '#ffffff', mid: '#efe8d8', out: '#a8987e' },
  fire: { core: '#fff2c0', mid: '#ff8a2a', out: '#ff3a10' },
  cold: { core: '#ffffff', mid: '#8ae4ff', out: '#2a7aff' },
  lightning: { core: '#ffffff', mid: '#fff07a', out: '#9aa8ff' },
  poison: { core: '#eaffc0', mid: '#8cff4a', out: '#2a9a20' },
  void: { core: '#f2dcff', mid: '#c68cff', out: '#6a20c0' },
  holy: { core: '#ffffff', mid: '#fff2b0', out: '#ffc040' },
  blood: { core: '#ffd0d0', mid: '#ff3a4a', out: '#8a0a14' },
  enemy: { core: '#ffe0d0', mid: '#ff5040', out: '#a01010' },
};
const elOf = (el) => EL[el] || EL[Object.keys(ELEMENT_COLORS).includes(el) ? el : 'phys'] || EL.phys;

// ---------------- 光の部品（キャッシュ）
const ATL = new Map();
function cv(w, h, fn) { const c = makeCanvas(w, h); if (c) fn(c.getContext('2d'), w, h); return c; }
function grad(x, cx, cy, r0, r1, stops) { const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); for (const [t, c] of stops) g.addColorStop(t, c); return g; }
function hexA(c, a) { const n = parseInt(c.slice(1, 7), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
export function atlas(kind, col = '#ffffff', col2 = null) {
  const key = `${kind}|${col}|${col2}`;
  if (ATL.has(key)) return ATL.get(key);
  let c = null;
  switch (kind) {
    case 'glow': c = cv(64, 64, (x) => { x.fillStyle = grad(x, 32, 32, 0, 32, [[0, '#ffffff'], [0.15, col], [0.45, hexA(col, 0.35)], [1, hexA(col, 0)]]); x.fillRect(0, 0, 64, 64); }); break;
    case 'soft': c = cv(64, 64, (x) => { x.fillStyle = grad(x, 32, 32, 0, 32, [[0, hexA(col, 0.9)], [0.5, hexA(col, 0.35)], [1, hexA(col, 0)]]); x.fillRect(0, 0, 64, 64); }); break;
    case 'ring': c = cv(128, 128, (x) => { x.fillStyle = grad(x, 64, 64, 40, 64, [[0, hexA(col, 0)], [0.55, hexA(col, 0.9)], [0.7, '#ffffff'], [0.85, hexA(col, 0.6)], [1, hexA(col, 0)]]); x.fillRect(0, 0, 128, 128); }); break;
    case 'slash': c = cv(128, 128, (x) => {
      x.translate(64, 64);
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(0, 0, 56 - i * 2, -1.35, 1.35); x.arc(0, -6 + i * 2, 40 + i * 4, 1.2, -1.2, true); x.closePath(); x.fillStyle = i === 2 ? '#ffffff' : hexA(col, 0.45 + i * 0.2); x.fill(); }
    }); break;
    case 'streak': c = cv(128, 32, (x) => { const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.7, hexA(col, 0.7)); g.addColorStop(1, '#ffffff'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 16); x.quadraticCurveTo(80, 4, 124, 12); x.arc(120, 16, 6, -Math.PI / 2, Math.PI / 2); x.quadraticCurveTo(80, 28, 0, 16); x.fill(); }); break;
    case 'spark': c = cv(32, 32, (x) => { x.fillStyle = grad(x, 16, 16, 0, 16, [[0, '#ffffff'], [0.3, hexA(col, 0.8)], [1, hexA(col, 0)]]); x.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 16; const a = (i / 8) * TAU; x.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); } x.fill(); }); break;
    case 'flame': c = cv(32, 48, (x) => { x.fillStyle = grad(x, 16, 36, 0, 24, [[0, '#fff6c0'], [0.3, col], [1, hexA(col2 || col, 0)]]); x.beginPath(); x.moveTo(4, 40); x.quadraticCurveTo(2, 18, 16, 2); x.quadraticCurveTo(30, 18, 28, 40); x.quadraticCurveTo(16, 50, 4, 40); x.fill(); }); break;
    case 'shard': c = cv(16, 32, (x) => { const g = x.createLinearGradient(0, 0, 16, 0); g.addColorStop(0, hexA(col, 0.5)); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, hexA(col, 0.8)); x.fillStyle = g; x.beginPath(); x.moveTo(8, 0); x.lineTo(15, 16); x.lineTo(8, 32); x.lineTo(1, 16); x.closePath(); x.fill(); }); break;
    case 'smoke': c = cv(64, 64, (x) => { x.fillStyle = grad(x, 32, 32, 0, 32, [[0, hexA(col, 0.55)], [0.6, hexA(col, 0.22)], [1, hexA(col, 0)]]); x.fillRect(0, 0, 64, 64); }); break;
    case 'coin': c = cv(20, 20, (x) => { x.fillStyle = grad(x, 7, 7, 1, 11, [[0, '#fff6c0'], [0.5, '#f0c040'], [1, '#8a5a10']]); x.beginPath(); x.arc(10, 10, 9, 0, TAU); x.fill(); x.strokeStyle = '#6a4008'; x.lineWidth = 1.2; x.stroke(); x.strokeStyle = 'rgba(120,70,10,0.8)'; x.beginPath(); x.arc(10, 10, 5.5, 0, TAU); x.stroke(); }); break;
    case 'star': c = cv(24, 24, (x) => { x.fillStyle = col; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 11; const a = -Math.PI / 2 + (i / 10) * TAU; x.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r); } x.closePath(); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke(); }); break;
    case 'bubble': c = cv(32, 32, (x) => { x.strokeStyle = hexA(col, 0.8); x.lineWidth = 1.6; x.beginPath(); x.arc(16, 16, 13, 0, TAU); x.stroke(); x.fillStyle = hexA(col, 0.12); x.fill(); x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(11, 10, 3, 0, TAU); x.fill(); }); break;
    case 'flake': c = cv(16, 16, (x) => { x.strokeStyle = col; x.lineWidth = 1.4; x.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; x.beginPath(); x.moveTo(8 - Math.cos(a) * 7, 8 - Math.sin(a) * 7); x.lineTo(8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7); x.stroke(); } }); break;
    case 'rune': c = cv(128, 128, (x) => {
      x.translate(64, 64); x.strokeStyle = col; x.lineWidth = 2.4; x.shadowColor = col; x.shadowBlur = 8;
      x.beginPath(); x.arc(0, 0, 58, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 46, 0, TAU); x.stroke();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 46, Math.sin(a) * 46); x.lineTo(Math.cos(a + 2.09) * 46, Math.sin(a + 2.09) * 46); x.stroke(); }
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 49, Math.sin(a) * 49); x.lineTo(Math.cos(a) * 55, Math.sin(a) * 55); x.stroke(); }
    }); break;
    case 'claw': c = cv(96, 96, (x) => { x.lineCap = 'round'; for (let i = 0; i < 3; i++) { const g = x.createLinearGradient(10, 80, 86, 16); g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, hexA(col, 0)); x.strokeStyle = g; x.lineWidth = 6; x.beginPath(); x.moveTo(14 + i * 14, 84); x.quadraticCurveTo(40 + i * 12, 50, 64 + i * 10, 12); x.stroke(); } }); break;
    default: c = null;
  }
  ATL.set(key, c);
  return c;
}

// 形だけの白・色付き・ぼかした光（キャッシュ。差し替え画像にも使える）
const WHITE = new WeakMap(); const TINT = new WeakMap(); const HALO = new WeakMap();
export function whiteOf(img) { return tintOf(img, '#ffffff', WHITE); }
export function tintOf(img, col, store = TINT) {
  if (!img) return img;
  let m = store.get(img);
  if (!m) { m = new Map(); store.set(img, m); }
  if (m.has(col)) return m.get(col);
  const c = cv(img.width, img.height, (x) => { x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, img.width, img.height); });
  m.set(col, c || img);
  return c || img;
}
export function haloOf(img, col) {
  if (!img) return img;
  let m = HALO.get(img);
  if (!m) { m = new Map(); HALO.set(img, m); }
  if (m.has(col)) return m.get(col);
  const pad = Math.round(Math.max(img.width, img.height) * 0.12);
  const sil = tintOf(img, col);
  const c = cv(img.width + pad * 2, img.height + pad * 2, (x) => { x.shadowColor = col; x.shadowBlur = pad * 0.8; x.drawImage(sil, pad, pad); x.globalCompositeOperation = 'source-over'; x.shadowBlur = pad * 0.4; x.drawImage(sil, pad, pad); x.globalCompositeOperation = 'destination-out'; x.shadowBlur = 0; x.drawImage(img, pad, pad); });
  const out = c ? { img: c, pad } : { img, pad: 0 };
  m.set(col, out);
  return out;
}

// ---------------- 粒
class Particles {
  constructor() { this.list = []; this.free = []; this.max = 700; }
  add(o) {
    if (this.list.length >= this.max) return null;
    const p = this.free.pop() || {};
    p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.g = o.g || 0; p.drag = o.drag ?? 0; p.life = o.life || 0.5; p.t = 0;
    p.s0 = o.s ?? 6; p.s1 = o.s1 ?? p.s0 * 0.3; p.rot = o.rot ?? rnd() * TAU; p.vr = o.vr || 0; p.img = o.img; p.add = o.add !== false; p.a = o.a ?? 1; p.fade = o.fade ?? 1; p.stretch = o.stretch || 0; p.under = !!o.under;
    this.list.push(p);
    return p;
  }
  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) { this.free.push(p); continue; }
      p.vy += p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      L[j++] = p;
    }
    L.length = j;
  }
  draw(ctx, camX, under) {
    let add = null;
    for (const p of this.list) {
      if (p.under !== under || !p.img) continue;
      const k = p.t / p.life;
      const s = p.s0 + (p.s1 - p.s0) * k;
      const a = p.a * (p.fade ? (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) : 1);
      if (a <= 0.01 || s <= 0.2) continue;
      if (add !== p.add) { ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; add = p.add; }
      ctx.globalAlpha = a;
      const x = p.x - camX;
      if (p.stretch) {
        const sp = Math.hypot(p.vx, p.vy); const ang = Math.atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(x, p.y); ctx.rotate(ang); const len = s + sp * p.stretch; ctx.drawImage(p.img, -len, -s * 0.5, len * 1.2, s); ctx.restore();
      } else if (p.vr) { ctx.save(); ctx.translate(x, p.y); ctx.rotate(p.rot); ctx.drawImage(p.img, -s, -s, s * 2, s * 2); ctx.restore(); }
      else ctx.drawImage(p.img, x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------- 本体
export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.parts = new Particles();
    this.fx = []; // { t, life, under, draw(ctx, k, e) }
    this.nums = []; // ダメージの数字
    this.drops = [];
    this.banners = []; // 上の帯（レジェンダリー以上）
    this.banner = null;
    this.cutin = null; // 奥義
    this.edge = 0; this.edgeCol = '#ff4d6d';
    this.letterbox = 0; this.lbT = 0;
    this.bossCard = null;
    this.flash = 0; this.flashCol = '#ffffff';
    this.trails = new WeakMap();
    this.areaSeen = new WeakMap();
    this.lastCritStop = 0;
    this.time = 0;
  }

  get s() { return this.scene.settings; }
  density() { const f = this.s.fx; return f === 'low' ? 0.3 : f === 'mid' ? 0.6 : 1; }
  get camX() { return this.scene.camX; }
  wy(y, z = 0) { return GROUND + (y || 0) * 0.9 - (z || 0); }

  // ---- 粒の出し方
  burst(x, y, col, n, speed, o = {}) {
    n = Math.max(1, Math.round(n * this.density()));
    const img = o.img || atlas(o.kind || 'glow', col);
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (rnd() - 0.5) * (o.spread ?? 1.2) : rnd() * TAU;
      const v = speed * (0.35 + rnd() * 0.65);
      this.parts.add({ x: x + (rnd() - 0.5) * (o.jx || 0), y: y + (rnd() - 0.5) * (o.jy || 0), vx: Math.cos(a) * v, vy: Math.sin(a) * v * (o.flat ?? 0.7) + (o.vy0 || 0), g: o.g ?? 260, drag: o.drag ?? 1.5, life: (o.life || 0.5) * (0.6 + rnd() * 0.6), s: (o.s || 5) * (0.6 + rnd() * 0.8), s1: o.s1, img, add: o.add, stretch: o.stretch, vr: o.vr, a: o.a });
    }
  }
  add(life, draw, o = {}) { if (this.fx.length > 220) this.fx.shift(); const e = { t: 0, life, draw, under: !!o.under, ...o }; this.fx.push(e); return e; }

  // ---- 出来事
  handle(e) {
    const h = HANDLERS[e.t];
    try {
      if (h) h(this, e);
      else genericFx(this, e);
    } catch (err) { console.error('[fx]', e.t, err); }
  }

  update(dt, realDt) {
    this.time += dt;
    this.parts.max = Math.round(700 * this.density()) + 60;
    this.parts.update(dt);
    let j = 0;
    for (const e of this.fx) { e.t += dt; if (e.t < e.life) this.fx[j++] = e; }
    this.fx.length = j;
    compact(this.nums, dt);
    compact(this.drops, dt);
    // 上の帯は実時間で進める（スロー中も読みやすく）
    if (this.banner) { this.banner.t += realDt; if (this.banner.t >= this.banner.life) this.banner = null; }
    if (!this.banner && this.banners.length) { this.banner = this.banners.shift(); this.banner.t = 0; }
    if (this.cutin) { this.cutin.t += realDt; if (this.cutin.t >= this.cutin.life) this.cutin = null; }
    if (this.bossCard) { this.bossCard.t += realDt; if (this.bossCard.t >= this.bossCard.life) this.bossCard = null; }
    this.edge = Math.max(0, this.edge - realDt * 0.9);
    this.flash = Math.max(0, this.flash - realDt * 3);
    if (this.lbT > 0) { this.lbT -= realDt; this.letterbox = Math.min(1, this.letterbox + realDt * 4); } else this.letterbox = Math.max(0, this.letterbox - realDt * 3);
  }

  drawUnder(ctx) {
    const cam = this.camX;
    for (const e of this.fx) if (e.under) { ctx.save(); e.draw(ctx, e.t / e.life, e, cam); ctx.restore(); }
    this.parts.draw(ctx, cam, true);
  }
  drawOver(ctx) {
    const cam = this.camX;
    for (const e of this.fx) if (!e.under) { ctx.save(); e.draw(ctx, e.t / e.life, e, cam); ctx.restore(); }
    this.parts.draw(ctx, cam, false);
  }

  // ---------------- ダメージの数字
  addNumber(e) {
    const mode = this.s.dmgNumbers === false ? 'none' : (this.s.fxDmgMode || 'all');
    if (mode === 'none') return;
    if (mode === 'crit' && !e.crit && e.team !== 'hero') return;
    let key = e.unit?.id ?? e.uid ?? e.target?.id ?? null;
    if (key === null) {
      // 出来事に相手が書かれていないときは、その位置にいる敵を探す（相手ごとに合算するため）
      const us = this.scene.game?.combat?.units;
      if (us) for (const u of us) if (u.y === e.y && Math.abs(u.x - e.x) < 8 && (u.team === 'hero') === (e.team === 'hero')) { key = u.id; break; }
    }
    const now = this.time;
    const isHero = e.team === 'hero';
    // 100ms 以内の同じ相手への数字は合算する
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      if (now - n.born > 0.1 || n.hero !== isHero || n.dot !== !!e.dot) continue;
      if (key !== null ? n.key === key : (Math.abs(n.x - e.x) < 34 && Math.abs(n.y0 - (e.y || 0)) < 30)) {
        n.v += e.v; if (e.crit && !n.crit) { n.crit = true; n.pop = 0; } n.t = Math.min(n.t, 0.05); n.bump = 0;
        return;
      }
    }
    const col = isHero ? '#ff5a4a' : e.crit ? '#ffc23a' : e.dot ? (ELEMENT_COLORS[e.el] || '#ddd') : (e.el === 'phys' || !e.el ? '#ffffff' : ELEMENT_COLORS[e.el]);
    this.nums.push({ key, x: e.x + (rnd() - 0.5) * 24, y0: e.y || 0, y: this.wy(e.y, e.z || 80), v: e.v, crit: !!e.crit, dot: !!e.dot, hero: isHero, col, t: 0, life: e.crit ? 1.0 : 0.8, born: now, pop: 0, drift: (rnd() - 0.5) * 30 });
    if (this.nums.length > 30) {
      // 一番小さい物から消す
      let mi = 0; for (let i = 1; i < this.nums.length; i++) if (this.nums[i].v < this.nums[mi].v && !this.nums[i].crit) mi = i;
      this.nums.splice(mi, 1);
    }
  }
  drawNumbers(ctx) {
    const cam = this.camX;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const n of this.nums) {
      const k = n.t / n.life;
      const rise = (1 - (1 - Math.min(1, k * 1.6)) ** 2) * (n.crit ? 54 : 40);
      const x = n.x - cam + n.drift * k; const y = n.y - rise;
      // 会心: 0 → 1.3 → 1.0（120ms）
      let sc = 1;
      if (n.crit) { const p = Math.min(1, n.t / 0.12); sc = p < 0.6 ? (p / 0.6) * 1.3 : 1.3 - ((p - 0.6) / 0.4) * 0.3; }
      else { const p = Math.min(1, n.t / 0.08); sc = 0.6 + 0.4 * p; }
      const base = n.hero ? 20 : n.dot ? 15 : n.crit ? 31 : 21;
      const size = Math.round(base * sc * (n.v >= 1e6 ? 1.1 : 1));
      if (size < 4) continue;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = FONT_CACHE[size] || (FONT_CACHE[size] = `900 ${size}px "M PLUS 1p", Impact, sans-serif`);
      const text = n.hero ? `-${fmt(n.v)}` : fmt(n.v);
      ctx.lineWidth = Math.max(3, size * 0.18); ctx.strokeStyle = n.crit ? 'rgba(60,10,0,0.95)' : 'rgba(0,0,0,0.9)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = n.col; ctx.fillText(text, x, y);
      if (n.crit) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.35 * (1 - k); ctx.fillStyle = '#fff2b0'; ctx.fillText(text, x, y - 1); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.restore();
  }

  // ---------------- ドロップ
  addLoot(e) {
    const it = e.item; const r = RARITY[it?.rarity];
    if (!r) return;
    const salv = e.where === 'salvaged';
    const q = it.q || 0;
    let L = r.idx >= 7 ? 5 : r.idx >= 4 ? 4 : r.idx === 3 ? 3 : r.idx === 2 ? 2 : 1;
    if (q === 2) L = 5; else if (q === 1 && L < 4) L = 4;
    if (salv) L = 0;
    const icon = itemIconId(it); // ユニーク・セット・ミシックは専用の絵があればそれ
    const name = `${q === 2 ? '極致の' : q === 1 ? '覚醒の' : ''}${itemName(it)}`;
    if (L === 0) { if (r.idx >= 2) this.add(0.9, (ctx, k, f, cam) => { ctx.globalAlpha = 1 - k; label(ctx, e.x - cam, this.wy(e.y, 70 + k * 30), '分解', '#9a9aa0', 12); }); return; }
    this.lootN = (this.lootN || 0) + 1;
    const d = { x: e.x, y: e.y || 0, x0: e.x - (rnd() - 0.2) * 20, t: 0, life: L >= 4 ? 4.2 : L === 3 ? 3.2 : 2.4, L, r, icon, name, col: r.color, where: e.where, seed: rnd() * 10, row: this.lootN % 3 };
    this.drops.push(d);
    if (this.drops.length > 24) this.drops.shift();
    if (L >= 2) this.burst(e.x, this.wy(e.y, 30), r.color, 6 + L * 4, 160, { kind: 'spark', life: 0.6, s: 4, g: 160 });
    if (L >= 4) {
      const lv = L === 5;
      this.scene.slowmo(this.s.fxLootSlow === false ? 0 : lv ? 0.6 : 0.22, lv ? 0.25 : 0.3);
      this.scene.addTrauma(lv ? 0.55 : 0.3);
      const last = this.banners[this.banners.length - 1];
      if (last && last.name === name) last.count++;
      else if (this.banner && this.banner.name === name && this.banner.t < 1) this.banner.count++;
      else this.banners.push({ name, r, L, icon, t: 0, life: lv ? 2.6 : 1.7, count: 1 });
      if (lv) { this.edge = 1.6; this.edgeCol = q === 2 ? '#ff3355' : r.color; }
    }
  }
  drawDrops(ctx) {
    const cam = this.camX; const s = this.s; const t = this.time;
    const hero = this.scene.game.combat.hero;
    for (const d of this.drops) {
      const k = d.t / d.life;
      const land = Math.min(1, d.t / 0.55);
      const gx = d.x0 + (d.x - d.x0) * land;
      let x = gx - cam; let y = this.wy(d.y) - 18;
      // 弧を描いて落ちる → 少し弾む
      y -= Math.sin(land * Math.PI) * 80 + (land >= 1 ? Math.abs(Math.sin((d.t - 0.55) * 9)) * 6 * Math.max(0, 1 - (d.t - 0.55) * 2.5) : 0);
      // 最後は主人公へ吸い込まれる
      const pull = clamp((k - 0.78) / 0.22, 0, 1);
      if (pull > 0 && hero) { const p = pull * pull; x += (this.scene.vx(hero) - cam - x) * p; y += (this.wy(hero.y, 70) - y) * p; }
      const alpha = pull > 0.85 ? (1 - pull) / 0.15 : 1;
      ctx.save(); ctx.globalAlpha = alpha;
      // 光の柱
      if (d.L >= 2 && s.lootBeams !== false && pull < 0.5) {
        const bh = 120 + d.L * 70; const bw = 8 + d.L * 5;
        const beam = beamSprite(d.col);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * (0.45 + 0.2 * Math.sin(t * 7 + d.seed)) * Math.min(1, land * 2) * (1 - pull * 2);
        if (beam) ctx.drawImage(beam, x - bw, y + 18 - bh, bw * 2, bh);
        if (d.L >= 4) { ctx.globalAlpha *= 0.6; const ring = atlas('ring', d.col); if (ring) ctx.drawImage(ring, x - 40, y + 10, 80, 26); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
      }
      // 後ろの光（輪郭）
      const spr = assets.sprite(d.icon);
      const sz = d.L >= 4 ? 46 : 38;
      if (spr?.img) {
        if (d.L >= 2) {
          const hl = haloOf(spr.img, d.col);
          const pulse = d.L >= 3 ? 0.65 + 0.35 * Math.sin(t * 4.2 + d.seed) : 0.7;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * pulse;
          const f = sz / Math.max(spr.img.width, spr.img.height);
          ctx.drawImage(hl.img, x - (spr.img.width / 2 + hl.pad) * f, y - (spr.img.height / 2 + hl.pad) * f, (spr.img.width + hl.pad * 2) * f, (spr.img.height + hl.pad * 2) * f);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
        }
        if (d.L >= 4) { // 回る光
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.4); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.5;
          const sp = atlas('spark', d.col); if (sp) ctx.drawImage(sp, -50, -50, 100, 100);
          ctx.restore(); ctx.globalAlpha = alpha;
        }
        assets.draw(ctx, spr, x, y, { w: sz, h: sz, rot: Math.sin(t * 2 + d.seed) * 0.08 });
        // 斜めに走るきらめき（レジェンダリー以上、2.5 秒ごと）
        if (d.L >= 4) { const ph = ((t + d.seed) % 2.5) / 2.5; if (ph < 0.25) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (1 - ph * 4); ctx.translate(x - sz / 2 + ph * 4 * sz, y); ctx.rotate(0.6); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-3, -sz * 0.6, 6, sz * 1.2); ctx.restore(); } }
      }
      if (d.L >= 1 && pull < 0.3) {
        const fs = d.L >= 4 ? 16 : 13;
        const ly = y - sz * 0.75 - d.row * 15;
        ctx.globalAlpha = alpha * (d.L === 1 && d.r.idx === 0 ? 0.75 : 1);
        label(ctx, x, ly, d.name, d.col, fs);
        if (d.where === 'equipped') label(ctx, x, ly - 16, '装備した！', '#9aff8a', 12);
      }
      // きらきら
      if (d.L >= 3 && rnd() < 0.25 * this.density()) this.parts.add({ x: gx + (rnd() - 0.5) * 30, y: this.wy(d.y) - 10 - rnd() * 40, vy: -20 - rnd() * 30, life: 0.7, s: 3 + rnd() * 3, img: atlas('spark', d.col), drag: 0 });
      ctx.restore();
    }
  }

  // ---------------- 画面の上（帯・奥義・ボスの名・縁の光）
  drawOverlay(ctx, W, H) {
    // 黒い帯（ボスの登場）
    if (this.letterbox > 0.01) { const hh = 56 * ease(this.letterbox); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, hh); ctx.fillRect(0, H - hh, W, hh); }
    // 白・赤の閃光
    if (this.flash > 0 && this.s.fxFlash !== false) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.5, this.flash * 0.5); ctx.fillStyle = this.flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    // 画面の縁（ミシック・原初）
    if (this.edge > 0) {
      const a = Math.min(1, this.edge) * (0.6 + 0.4 * Math.sin(this.time * 10));
      const img = edgeSprite(this.edgeCol, W, H);
      if (img) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(img, 0, 0, W, H); ctx.restore(); }
    }
    if (this.bossCard) drawBossCard(ctx, this.bossCard, W, H);
    if (this.banner) drawLootBanner(ctx, this.banner, W);
    if (this.cutin) drawCutin(ctx, this.cutin, W, H);
  }

  // ---------------- 弾
  drawProjectile(ctx, pr, x, y) {
    const enemy = pr.team !== 'hero';
    if (pr.art && assets.isCustom(pr.art)) { const ang = Math.atan2(pr.vy * 2, pr.vx); assets.draw(ctx, pr.art, x, y, { rot: ang, t: pr.t, blend: 'lighter' }); return true; }
    const ang = Math.atan2(pr.vy * 2, pr.vx);
    const def = pr.p ? SKILL[pr.p.id] : null;
    const cls = def?.cls || (pr.src?.kind === 'minion' ? 'minion' : null);
    const kind = enemy ? (pr.art || '').split('.').pop() : projKind(def, pr);
    const el = enemy && (kind === 'orb' || kind === 'spit') ? (pr.el === 'phys' ? 'enemy' : pr.el) : pr.el;
    const E = elOf(el);
    const sz = pr.size || 1;
    // 尾（過去の位置）
    let tr = this.trails.get(pr);
    if (!tr) { tr = { pts: [] }; this.trails.set(pr, tr); }
    tr.pts.push(x + this.camX, y);
    if (tr.pts.length > 16) tr.pts.splice(0, 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (tr.pts.length >= 4 && kind !== 'arrow' && kind !== 'bone') {
      const cam = this.camX;
      ctx.lineCap = 'round';
      for (let i = 2; i < tr.pts.length; i += 2) {
        const k = i / tr.pts.length;
        ctx.strokeStyle = E.mid; ctx.globalAlpha = k * 0.5; ctx.lineWidth = (2 + 8 * k) * sz;
        ctx.beginPath(); ctx.moveTo(tr.pts[i - 2] - cam, tr.pts[i - 1]); ctx.lineTo(tr.pts[i] - cam, tr.pts[i + 1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.translate(x, y); ctx.rotate(ang);
    const d = this.density();
    switch (kind) {
      case 'arrow': {
        ctx.globalCompositeOperation = 'source-over';
        if (el !== 'phys') { ctx.globalCompositeOperation = 'lighter'; const st = atlas('streak', E.mid); if (st) ctx.drawImage(st, -70 * sz, -8 * sz, 80 * sz, 16 * sz); ctx.globalCompositeOperation = 'source-over'; }
        else { ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-24, 0); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.strokeStyle = enemy ? '#5a3a20' : '#7a5232'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = '#e0e6ec'; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = enemy ? '#5a2a2a' : '#e8e2d0'; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-33, -5); ctx.lineTo(-21, -1); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-33, 5); ctx.lineTo(-21, 1); ctx.closePath(); ctx.fill();
        if (el !== 'phys') { ctx.globalCompositeOperation = 'lighter'; const g = atlas('glow', E.mid); if (g) ctx.drawImage(g, 0, -12, 24, 24); }
        break;
      }
      case 'bone': {
        ctx.globalCompositeOperation = 'lighter'; const st = atlas('streak', el === 'phys' ? '#d8d0c0' : E.mid); if (st) ctx.drawImage(st, -80 * sz, -10 * sz, 90 * sz, 20 * sz);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#f2ead6'; ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(22 * sz, 0); ctx.lineTo(-4, -4.5 * sz); ctx.lineTo(-24 * sz, -2); ctx.lineTo(-24 * sz, 2); ctx.lineTo(-4, 4.5 * sz); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8bca0'; ctx.fillRect(-12 * sz, -1.4, 18 * sz, 2.8);
        if (rnd() < 0.5 * d) this.parts.add({ x: pr.x - pr.vx * 0.01, y, vx: (rnd() - 0.5) * 30, vy: (rnd() - 0.5) * 30, life: 0.35, s: 3, img: atlas('smoke', '#d8d0c0'), add: false, a: 0.5 });
        break;
      }
      case 'blade': {
        ctx.globalCompositeOperation = 'lighter'; const st = atlas('streak', E.mid); if (st) ctx.drawImage(st, -50, -7, 56, 14);
        ctx.globalCompositeOperation = 'source-over';
        ctx.rotate(pr.t * 26);
        for (let i = 0; i < 2; i++) { ctx.rotate(Math.PI); ctx.fillStyle = '#e8eef4'; ctx.strokeStyle = 'rgba(20,20,30,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -4, 14, -1); ctx.quadraticCurveTo(6, 2, 0, 0); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = '#d39b1c'; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();
        break;
      }
      case 'ice': case 'shard': {
        const st = atlas('streak', E.mid); if (st) ctx.drawImage(st, -60 * sz, -9 * sz, 66 * sz, 18 * sz);
        const sh = atlas('shard', E.mid); if (sh) { ctx.save(); ctx.rotate(Math.PI / 2); ctx.drawImage(sh, -7 * sz, -18 * sz, 14 * sz, 30 * sz); ctx.restore(); }
        if (rnd() < 0.6 * d) this.parts.add({ x: pr.x - this.camX * 0 + 0, y, vx: -pr.vx * 0.05 + (rnd() - 0.5) * 40, vy: (rnd() - 0.5) * 40, life: 0.4, s: 3, img: atlas('flake', '#dff6ff'), vr: 3, drag: 1 });
        break;
      }
      default: { // 魔法の玉（属性で見た目を変える）
        const r0 = (enemy ? 12 : 14) * sz;
        const g = atlas('glow', E.mid); if (g) ctx.drawImage(g, -r0 * 2.2, -r0 * 2.2, r0 * 4.4, r0 * 4.4);
        const st = atlas('streak', E.out); if (st) ctx.drawImage(st, -r0 * 5, -r0, r0 * 5.4, r0 * 2);
        const c = atlas('glow', E.core); if (c) ctx.drawImage(c, -r0 * 0.8, -r0 * 0.8, r0 * 1.6, r0 * 1.6);
        if (el === 'fire' || kind === 'fireball') { if (rnd() < 0.9 * d) this.parts.add({ x: pr.x + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 6, vx: -pr.vx * 0.08 + (rnd() - 0.5) * 30, vy: -30 - rnd() * 40, life: 0.35, s: 6 * sz, s1: 1, img: atlas('flame', '#ff8a2a', '#ff3a10'), drag: 2 }); }
        else if (el === 'lightning') { ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 1.4; for (let i = 0; i < 3; i++) { const a = rnd() * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r0 * 0.9 + (rnd() - 0.5) * 6, Math.sin(a) * r0 * 0.9); ctx.lineTo(Math.cos(a) * r0 * 1.8, Math.sin(a) * r0 * 1.8); ctx.stroke(); } }
        else if (el === 'poison' || kind === 'spit') { if (rnd() < 0.5 * d) this.parts.add({ x: pr.x, y, vx: (rnd() - 0.5) * 20, vy: 40 + rnd() * 40, g: 200, life: 0.45, s: 3, img: atlas('glow', E.mid) }); }
        else if (el === 'void') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(20,0,40,0.85)'; ctx.beginPath(); ctx.arc(0, 0, r0 * 0.45, 0, TAU); ctx.fill(); }
        else if (el === 'cold') { if (rnd() < 0.5 * d) this.parts.add({ x: pr.x, y, vx: (rnd() - 0.5) * 40, vy: (rnd() - 0.5) * 40, life: 0.45, s: 3, img: atlas('flake', '#e8faff'), vr: 4 }); }
      }
    }
    ctx.restore();
    return true;
  }

  // ---------------- 地面の効果
  drawArea(ctx, a, x, y) {
    const enemy = a.team !== 'hero';
    const def = a.p ? SKILL[a.p.id] : null;
    const el = a.el || 'phys';
    const E = enemy && el === 'phys' ? EL.enemy : elOf(el);
    const t = this.time;
    const rr = a.r || 80;
    if (!a.fired) {
      const k = clamp(a.t / Math.max(0.01, a.delay), 0, 1);
      if (enemy) {
        // 予告の円（赤く脈打つ）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.25 * k; ctx.fillStyle = E.mid; ctx.beginPath(); ctx.ellipse(x, y, rr * k, rr * 0.35 * k, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 18); ctx.strokeStyle = E.mid; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.35, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.lineWidth = 1.2; ctx.strokeStyle = '#ffe0d0'; ctx.beginPath(); ctx.ellipse(x, y, rr * k, rr * 0.35 * k, 0, 0, TAU); ctx.stroke();
        ctx.restore();
        if ((a.art || '').includes('zap')) skyBolt(ctx, x, y, k, E, true);
      } else {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * k;
        const ring = atlas('ring', E.mid); if (ring) ctx.drawImage(ring, x - rr, y - rr * 0.35, rr * 2, rr * 0.7);
        ctx.restore();
        // 空から降ってくる物
        const beh = def?.behavior;
        if (!(a.art && assets.isCustom(a.art)) && (beh === 'rain' || beh === 'meteor' || a.fall)) fallFrom(ctx, x, y, k, el, def, E, a);
      }
      return true;
    }
    if (a.dur) {
      if (a.art && assets.isCustom(a.art)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85; assets.draw(ctx, a.art, x, y - rr * 0.2, { w: rr * 2, h: rr * 2, t: a.t }); ctx.restore(); return true; }
      const life = clamp((a.delay + a.dur - a.t) / 0.4, 0, 1) * clamp((a.t - a.delay) / 0.2, 0, 1);
      groundEffect(this, ctx, a, x, y, rr, el, E, life, enemy);
      return true;
    }
    return true;
  }
}
const FONT_CACHE = {};
/** 時間を進めて、終わった物を取り除く（配列を作り直さない） */
function compact(list, dt) { let j = 0; for (let i = 0; i < list.length; i++) { const o = list[i]; o.t += dt; if (o.t < o.life) list[j++] = o; } list.length = j; }
const ease = (k) => 1 - (1 - k) * (1 - k);

function label(ctx, x, y, text, col, size = 14) {
  ctx.save();
  ctx.font = `bold ${size}px "M PLUS 1p", "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = col; ctx.fillText(text, x, y);
  ctx.restore();
}
export { label as fxLabel };

const BEAM = new Map();
function beamSprite(col) {
  if (BEAM.has(col)) return BEAM.get(col);
  const c = cv(32, 256, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.6, hexA(col, 0.45)); g.addColorStop(1, hexA(col, 0.95)); x.fillStyle = g; x.fillRect(0, 0, 32, 256);
    const h = x.createLinearGradient(0, 0, 32, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 32, 256);
    x.globalCompositeOperation = 'lighter'; const w2 = x.createLinearGradient(0, 0, 0, 256); w2.addColorStop(0, 'rgba(255,255,255,0)'); w2.addColorStop(1, 'rgba(255,255,255,0.7)'); x.fillStyle = w2; x.fillRect(13, 0, 6, 256);
  });
  BEAM.set(col, c);
  return c;
}
const EDGE = new Map();
function edgeSprite(col, W, H) {
  const key = `${col}|${W}|${H}`;
  if (EDGE.has(key)) return EDGE.get(key);
  const c = cv(W / 4, H / 4, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62); g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.7, hexA(col, 0.25)); g.addColorStop(1, hexA(col, 0.85)); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  EDGE.set(key, c);
  return c;
}

/** 弾の見た目の種類 */
function projKind(def, pr) {
  if (!def) return pr.src?.kind === 'minion' ? 'orb' : 'orb';
  if (def.fx?.projKind) return def.fx.projKind;
  if (def.cls === 'ranger' && (def.tags || []).includes('attack')) return 'arrow';
  if (def.cls === 'necromancer' && def.element === 'phys' && pr.el === 'phys') return 'bone';
  if (def.cls === 'assassin') return 'blade';
  if (pr.el === 'cold' && (def.tags || []).includes('attack')) return 'ice';
  if (def.cls === 'warrior' && (def.tags || []).includes('attack')) return 'blade';
  return 'orb';
}

/** 空から降る（矢の雨・隕石・氷柱・雷） */
function fallFrom(ctx, x, y, k, el, def, E, a) {
  const h0 = 420;
  const fy = y - h0 * (1 - k * k);
  const fx = x + (1 - k * k) * 120;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (def?.cls === 'ranger' || el === 'phys') {
    ctx.strokeStyle = 'rgba(240,230,210,0.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const ox = (i - 1) * 14; ctx.beginPath(); ctx.moveTo(fx + ox + 20, fy - 40); ctx.lineTo(fx + ox, fy); ctx.stroke(); }
  } else if (el === 'lightning') {
    if (k > 0.85) skyBolt(ctx, x, y, 1, E, false);
  } else {
    const r0 = (a.r || 80) * (el === 'fire' ? 0.42 : 0.3);
    const st = atlas('streak', E.out); if (st) { ctx.save(); ctx.translate(fx, fy); ctx.rotate(Math.atan2(h0, -120)); ctx.drawImage(st, -r0 * 5, -r0 * 0.9, r0 * 5.2, r0 * 1.8); ctx.restore(); }
    const g = atlas('glow', E.mid); if (g) ctx.drawImage(g, fx - r0 * 1.6, fy - r0 * 1.6, r0 * 3.2, r0 * 3.2);
    if (el === 'fire') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#3a1608'; ctx.beginPath(); ctx.arc(fx, fy, r0 * 0.5, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,160,60,0.8)'; ctx.beginPath(); ctx.arc(fx - r0 * 0.15, fy - r0 * 0.15, r0 * 0.3, 0, TAU); ctx.fill(); }
    else if (el === 'cold') { const sh = atlas('shard', E.mid); if (sh) ctx.drawImage(sh, fx - r0 * 0.4, fy - r0 * 1.2, r0 * 0.8, r0 * 1.6); }
  }
  ctx.restore();
}
function skyBolt(ctx, x, y, k, E, warn) {
  if (warn && k < 0.92) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = E.mid; ctx.lineWidth = 5; ctx.globalAlpha = 0.6;
  const pts = []; let px = x + (rnd() - 0.5) * 60; let py = y - 460;
  for (let i = 0; i < 9; i++) { pts.push(px, py); px += (rnd() - 0.5) * 40; py += 52; }
  pts.push(x, y);
  ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1])); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.globalAlpha = 1; ctx.stroke();
  ctx.restore();
}

/** 続く地面の効果（属性ごと） */
function groundEffect(fx, ctx, a, x, y, rr, el, E, life, enemy) {
  const t = fx.time;
  const d = fx.density();
  ctx.save();
  if (a.follow) {
    // 体を取り巻く輪（オーラ）
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * life;
    const ring = atlas('ring', E.mid); if (ring) { ctx.drawImage(ring, x - rr, y - rr * 0.35, rr * 2, rr * 0.7); ctx.globalAlpha = 0.2 * life; const s = 1 + 0.08 * Math.sin(t * 4); ctx.drawImage(ring, x - rr * s * 0.8, y - rr * 0.28 * s, rr * 1.6 * s, rr * 0.56 * s); }
    ctx.restore();
    return;
  }
  // 地の色
  ctx.globalCompositeOperation = el === 'void' ? 'source-over' : 'lighter';
  ctx.globalAlpha = (el === 'void' ? 0.55 : 0.32) * life;
  const soft = atlas('soft', el === 'void' ? '#2a0a40' : E.out);
  if (soft) ctx.drawImage(soft, x - rr * 1.1, y - rr * 0.42, rr * 2.2, rr * 0.84);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (0.5 + 0.2 * Math.sin(t * 6 + a.id)) * life;
  const ring = atlas('ring', enemy ? EL.enemy.mid : E.mid); if (ring) ctx.drawImage(ring, x - rr, y - rr * 0.35, rr * 2, rr * 0.7);
  ctx.restore();
  // 粒
  const n = rr / 40 * d;
  if (rnd() < n * 0.6) {
    const px = a.x + (rnd() - 0.5) * rr * 1.6; const py = fx.wy(a.y) + (rnd() - 0.5) * rr * 0.5;
    if (el === 'fire') fx.parts.add({ x: px, y: py, vx: (rnd() - 0.5) * 10, vy: -50 - rnd() * 50, life: 0.5, s: 8, s1: 2, img: atlas('flame', '#ff8a2a', '#ff3a10'), drag: 1 });
    else if (el === 'poison') fx.parts.add({ x: px, y: py, vx: (rnd() - 0.5) * 10, vy: -20 - rnd() * 20, life: 0.9, s: 10, s1: 18, img: atlas('soft', '#6ac83a'), a: 0.5, drag: 1 });
    else if (el === 'cold') fx.parts.add({ x: px, y: py, vx: (rnd() - 0.5) * 10, vy: -12 - rnd() * 14, life: 0.9, s: 4, img: atlas('flake', '#e8faff'), vr: 2 });
    else if (el === 'lightning') fx.parts.add({ x: px, y: py - rnd() * 20, vx: (rnd() - 0.5) * 120, vy: (rnd() - 0.5) * 60, life: 0.15, s: 5, img: atlas('spark', E.mid), stretch: 0.05 });
    else if (el === 'void') fx.parts.add({ x: px, y: py, vx: (a.x - px) * 1.5, vy: -10, life: 0.6, s: 5, img: atlas('glow', E.mid), drag: 0 });
    else fx.parts.add({ x: px, y: py, vx: (rnd() - 0.5) * 20, vy: -10, life: 0.6, s: 8, s1: 14, img: atlas('smoke', '#a89880'), add: false, a: 0.4 });
  }
}

// ---------------- 出来事ごと
const pos = (fx, e) => { const u = e.unit || e.src; return { x: e.x ?? u?.x ?? 0, y: e.y ?? u?.y ?? 0, z: e.z ?? (u ? 60 * (u.size || 1) : 50) }; };
const target = (e) => (e.tx !== undefined ? { x: e.tx, y: e.ty ?? e.y ?? 0 } : e.x2 !== undefined ? { x: e.x2, y: e.y2 ?? e.y ?? 0 } : e.to ? { x: e.to.x, y: e.to.y || 0 } : e.target ? { x: e.target.x, y: e.target.y || 0 } : null);
const elFor = (e) => e.el || e.element || (e.skill && SKILL[e.skill]?.element) || 'phys';

function impact(fx, x, wy, el, big = 1) {
  const E = elOf(el);
  fx.add(0.28, (ctx, k, f, cam) => {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k;
    const s = (24 + 46 * ease(k)) * big;
    const sp = atlas('spark', E.mid); if (sp) { ctx.save(); ctx.translate(x - cam, wy); ctx.rotate(k * 0.8); ctx.drawImage(sp, -s, -s, s * 2, s * 2); ctx.restore(); }
    const g = atlas('glow', E.core); if (g) ctx.drawImage(g, x - cam - s * 0.5, wy - s * 0.5, s, s);
  });
  fx.burst(x, wy, E.mid, 7 * big, 220 * big, { kind: el === 'cold' ? 'shard' : 'spark', s: 4, life: 0.4, stretch: 0.03, g: 300 });
  if (el === 'fire') fx.burst(x, wy, E.mid, 4 * big, 80, { img: atlas('flame', '#ff8a2a', '#ff3a10'), s: 7, life: 0.4, g: -120 });
  if (el === 'poison') fx.burst(x, wy, E.mid, 4 * big, 60, { kind: 'soft', s: 8, life: 0.6, g: -40 });
}
function explosion(fx, x, y, r, el, o = {}) {
  const E = elOf(el);
  const wy = fx.wy(y);
  fx.add(0.5, (ctx, k, f, cam) => {
    ctx.globalCompositeOperation = 'lighter';
    const ring = atlas('ring', E.mid);
    const s = r * (0.4 + 0.8 * ease(k));
    ctx.globalAlpha = (1 - k) * 0.9; if (ring) ctx.drawImage(ring, x - cam - s, wy - s * 0.35, s * 2, s * 0.7);
    ctx.globalAlpha = (1 - k) ** 2; const g = atlas('glow', E.mid); if (g) ctx.drawImage(g, x - cam - r * 0.7, wy - r * 0.9, r * 1.4, r * 1.4);
  }, { under: true });
  fx.add(0.35, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k); const g = atlas('glow', E.core); const s = r * (0.5 + k * 0.6); if (g) ctx.drawImage(g, x - cam - s, wy - s * 1.3, s * 2, s * 2); });
  fx.burst(x, wy - 10, E.mid, 18 * (o.big || 1), 320, { kind: 'spark', s: 5, life: 0.55, stretch: 0.03 });
  if (el === 'fire') { fx.burst(x, wy - 10, E.mid, 12, 160, { img: atlas('flame', '#ff9a3a', '#ff3a10'), s: 12, s1: 3, life: 0.6, g: -160 }); fx.burst(x, wy, '#3a2a24', 8, 90, { kind: 'smoke', add: false, s: 18, s1: 34, life: 1.0, g: -40, a: 0.6 }); }
  else if (el === 'cold') fx.burst(x, wy - 10, E.mid, 14, 260, { kind: 'shard', s: 6, life: 0.6, g: 400, vr: 6 });
  else if (el === 'poison') fx.burst(x, wy - 10, E.mid, 12, 120, { kind: 'soft', s: 12, s1: 22, life: 0.9, g: -20, a: 0.6 });
  else if (el === 'void') fx.burst(x, wy - 10, E.mid, 14, 200, { kind: 'glow', s: 6, life: 0.6, g: -60 });
  else fx.burst(x, wy, '#9a8a74', 10, 140, { kind: 'smoke', add: false, s: 14, s1: 26, life: 0.8, g: -20, a: 0.5 });
}
function slashArc(fx, x, wy, r, el, dir, o = {}) {
  const E = o.enemy ? EL.enemy : elOf(el);
  const life = o.life || 0.22;
  const sl = atlas('slash', E.mid);
  fx.add(life, (ctx, k, f, cam) => {
    if (!sl) return;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) ** 1.5;
    ctx.translate(x - cam, wy); ctx.scale(dir, 1); ctx.rotate((o.rot ?? -0.5) + k * (o.swing ?? 0.9));
    const s = r * (0.8 + 0.4 * ease(k)) * (o.scale || 1);
    ctx.drawImage(sl, -s, -s, s * 2, s * 2 * (o.squash || 0.8));
  });
}

const HANDLERS = {
  dmg(fx, e) {
    fx.addNumber(e);
    const sc = fx.scene;
    if (e.team !== 'hero' && e.crit) {
      if (fx.s.fxHitStop !== false && fx.time - fx.lastCritStop > 0.55) { sc.hitstop(0.045); fx.lastCritStop = fx.time; }
      fx.burst(e.x, fx.wy(e.y, e.z || 70), '#ffd060', 5, 220, { kind: 'spark', s: 5, life: 0.35, stretch: 0.04 });
    }
    if (e.team === 'hero' && e.hero && e.v > 0) {
      const H = sc.game.combat.hero;
      if (H && e.v > H.maxLife * 0.08) sc.addTrauma(Math.min(0.35, e.v / H.maxLife));
    }
  },
  text(fx, e) {
    const x = e.x; const wy = fx.wy(e.y, e.z || 100);
    fx.add(0.9, (ctx, k, f, cam) => { ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1; const s = k < 0.12 ? 0.7 + k * 3 : 1.06 - Math.min(0.06, (k - 0.12)); ctx.translate(x - cam, wy - k * 40); ctx.scale(s, s); label(ctx, 0, 0, e.text, e.color || '#fff', 17); });
  },
  hit(fx, e) {
    if (e.skill && assets.isCustom(`fx.${e.skill}.hit`)) { const id = `fx.${e.skill}.hit`; const x = e.x; const wy = fx.wy(e.y, e.z || 50); fx.add(0.3, (ctx, k, f, cam) => { ctx.globalAlpha = 1 - k; assets.draw(ctx, id, x - cam, wy, { scale: 0.6 + k * 0.6, t: k * 0.3 }); }); return; }
    impact(fx, e.x, fx.wy(e.y, e.z || 50), elFor(e), e.small ? 0.7 : 1);
  },
  crit(fx, e) { const p = pos(fx, e); impact(fx, p.x, fx.wy(p.y, p.z), elFor(e), 1.4); fx.scene.addTrauma(0.12); },
  swing(fx, e) {
    const src = e.src; const dir = src && src.x > e.x ? -1 : 1;
    const wy = fx.wy(e.y, 55);
    const id = e.skill ? `fx.${e.skill}.swing` : null;
    if (id && assets.isCustom(id)) { const x = e.x; fx.add(0.24, (ctx, k, f, cam) => { ctx.globalAlpha = 1 - k; assets.draw(ctx, id, x - cam, wy, { scale: 0.8 + k * 0.4, t: k * 0.24, flip: dir < 0 }); }); return; }
    if (e.enemy) {
      const cl = atlas('claw', '#ff6050'); const x = e.x;
      fx.add(0.25, (ctx, k, f, cam) => { if (!cl) return; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; ctx.translate(x - cam, wy); ctx.scale(-dir, 1); const s = 30 + 14 * k; ctx.drawImage(cl, -s, -s, s * 2, s * 2); });
      return;
    }
    const def = e.skill ? SKILL[e.skill] : null;
    const el = elFor(e);
    const r = (e.r || 60) * (e.small ? 0.6 : 1);
    if (def?.cls === 'assassin') {
      slashArc(fx, e.x, wy, Math.max(40, r * 0.9), el, dir, { rot: -1.2, swing: 0.6, life: 0.16, squash: 0.35 });
      slashArc(fx, e.x + dir * 6, wy + 6, Math.max(40, r * 0.9), el, dir, { rot: 0.4, swing: -0.6, life: 0.2, squash: 0.35 });
    } else slashArc(fx, e.x - dir * 10, wy, Math.max(50, r * 1.1), el, dir, { scale: e.small ? 0.7 : 1.1 });
    fx.burst(e.x, wy, elOf(el).mid, e.small ? 3 : 6, 200, { kind: 'spark', s: 4, life: 0.3, dir: dir > 0 ? 0 : Math.PI, spread: 1.6, stretch: 0.03 });
  },
  nova(fx, e) {
    const el = elFor(e); const r = e.r || 150; const E = elOf(el);
    const id = e.skill ? `fx.${e.skill}.area` : null;
    const x = e.x; const wy = fx.wy(e.y);
    if (id && assets.isCustom(id)) { fx.add(0.4, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; const s = r * 2 * (0.6 + 0.4 * k); assets.draw(ctx, id, x - cam, wy - r * 0.2, { w: s, h: s, t: k * 0.4 }); }); return; }
    const def = e.skill ? SKILL[e.skill] : null;
    if (def && (def.tags || []).includes('attack') && (def.tags || []).includes('melee') || def?.cls === 'warrior') {
      // 武器を振り回す一周の斬撃
      fx.add(0.32, (ctx, k, f, cam) => { const sl = atlas('slash', E.mid); if (!sl) return; ctx.globalCompositeOperation = 'lighter'; ctx.translate(x - cam, wy - 40); for (let i = 0; i < 3; i++) { ctx.save(); ctx.globalAlpha = (1 - k) * (1 - i * 0.25); ctx.scale(1, 0.38); ctx.rotate(k * 5 + i * 2.1); const s = r * (0.7 + 0.3 * k); ctx.drawImage(sl, -s, -s, s * 2, s * 2); ctx.restore(); } });
      fx.burst(x, wy - 30, E.mid, 10, 280, { kind: 'spark', s: 4, life: 0.35, stretch: 0.03, flat: 0.35 });
      if (!e.small) fx.burst(x, wy, '#9a8a74', 8, 160, { kind: 'smoke', add: false, s: 12, s1: 22, life: 0.7, g: -10, a: 0.4, flat: 0.25 });
      return;
    }
    if (def?.cls === 'assassin') {
      fx.add(0.3, (ctx, k, f, cam) => { ctx.translate(x - cam, wy - 40); ctx.strokeStyle = '#e8eef4'; ctx.lineWidth = 2; ctx.globalAlpha = 1 - k; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + k * 2; const d = r * (0.2 + 0.8 * ease(k)); ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.4); ctx.rotate(a + k * 20); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); ctx.restore(); } });
    }
    // 衝撃の輪
    fx.add(0.45, (ctx, k, f, cam) => {
      ctx.globalCompositeOperation = 'lighter';
      const ring = atlas('ring', E.mid); const s = r * (0.25 + 0.85 * ease(k));
      ctx.globalAlpha = (1 - k) * 0.95; if (ring) ctx.drawImage(ring, x - cam - s, wy - s * 0.36, s * 2, s * 0.72);
      ctx.globalAlpha = (1 - k) * 0.5; const soft = atlas('soft', E.out); if (soft) ctx.drawImage(soft, x - cam - s, wy - s * 0.4, s * 2, s * 0.8);
    }, { under: true });
    fx.add(0.25, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * 0.8; const g = atlas('glow', E.core); const s = r * 0.4 * (1 + k); if (g) ctx.drawImage(g, x - cam - s, wy - 50 - s, s * 2, s * 2); });
    const n = e.small ? 8 : 22;
    if (el === 'cold') fx.burst(x, wy - 30, E.mid, n, r * 2.2, { kind: 'shard', s: 6, life: 0.5, g: 200, vr: 6, flat: 0.4 });
    else if (el === 'fire') fx.burst(x, wy - 20, E.mid, n, r * 1.8, { img: atlas('flame', '#ff9a3a', '#ff3a10'), s: 10, s1: 2, life: 0.45, g: -100, flat: 0.4 });
    else if (el === 'lightning') { fx.burst(x, wy - 30, E.mid, n, r * 2.4, { kind: 'spark', s: 5, life: 0.25, stretch: 0.05, g: 0, flat: 0.4 }); const pts = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + rnd(); pts.push([x + Math.cos(a) * r * 0.8, e.y + Math.sin(a) * r * 0.3]); } for (const [px, py] of pts) HANDLERS.chain(fx, { pts: [{ x, y: e.y, z: 30 }, { x: px, y: py, z: 10 }], el, small: true }); }
    else if (el === 'poison') fx.burst(x, wy - 20, E.mid, n * 0.6, r * 1.2, { kind: 'soft', s: 12, s1: 24, life: 0.8, g: -30, a: 0.6, flat: 0.4 });
    else fx.burst(x, wy - 30, E.mid, n, r * 2, { kind: 'spark', s: 5, life: 0.4, stretch: 0.03, flat: 0.4 });
  },
  pulse(fx, e) {
    const c = fx.scene.game.combat;
    const persistent = c.areas.some((a) => a.x === e.x && a.y === e.y && a.dur > 0 && !a.dead);
    const el = elFor(e); const r = e.r || 100;
    if (e.team !== 'hero') {
      const art = e.art || '';
      if (art.includes('slam')) { explosion(fx, e.x, e.y, r, 'phys'); crack(fx, e.x, e.y, r); }
      else if (art.includes('zap')) { explosion(fx, e.x, e.y, r * 0.8, 'lightning'); fx.add(0.15, (ctx, k, f, cam) => skyBolt(ctx, e.x - cam, fx.wy(e.y), 1, EL.lightning, false)); }
      else if (art.includes('blast')) { explosion(fx, e.x, e.y, r, 'fire', { big: 1.3 }); fx.scene.addTrauma(0.2); }
      else if (!persistent) explosion(fx, e.x, e.y, r * 0.8, el === 'phys' ? 'enemy' : el);
      return;
    }
    if (persistent) { if (rnd() < 0.5) impact(fx, e.x + (rnd() - 0.5) * r, fx.wy(e.y, 10), el, 0.5); return; }
    const id = e.skill ? `fx.${e.skill}.area` : null;
    if (id && assets.isCustom(id)) { const x = e.x; const wy = fx.wy(e.y); fx.add(0.4, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; assets.draw(ctx, id, x - cam, wy - r * 0.2, { w: r * 2, h: r * 2, t: k * 0.4 }); }); return; }
    explosion(fx, e.x, e.y, r, el);
    if (el === 'fire' && r >= 90) fx.scene.addTrauma(0.08);
  },
  chain(fx, e) {
    const el = elFor(e); const E = elOf(el);
    const pts = (e.pts || []).map((p) => ({ x: p.x, wy: fx.wy(p.y, p.z ?? 50) }));
    if (pts.length < 2) return;
    let seed = []; let lastT = -1;
    fx.add(e.small ? 0.16 : 0.3, (ctx, k, f, cam) => {
      if (f.t - lastT > 0.035 || !seed.length) { lastT = f.t; seed = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i]; const b = pts[i + 1]; const seg = []; const n = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.wy - a.wy) / 22)); for (let j = 0; j <= n; j++) { const tt = j / n; seg.push(a.x + (b.x - a.x) * tt + (j && j < n ? (rnd() - 0.5) * 18 : 0), a.wy + (b.wy - a.wy) * tt + (j && j < n ? (rnd() - 0.5) * 18 : 0)); } seed.push(seg); } }
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [lw, col, al] of [[e.small ? 5 : 9, E.out, 0.35], [e.small ? 2.5 : 4, E.mid, 0.8], [1.4, '#ffffff', 1]]) {
        ctx.globalAlpha = al * (1 - k); ctx.strokeStyle = col; ctx.lineWidth = lw;
        for (const seg of seed) { ctx.beginPath(); for (let j = 0; j < seg.length; j += 2) (j ? ctx.lineTo(seg[j] - cam, seg[j + 1]) : ctx.moveTo(seg[j] - cam, seg[j + 1])); ctx.stroke(); }
      }
      const g = atlas('glow', E.mid); ctx.globalAlpha = 1 - k; if (g) for (const p of pts) ctx.drawImage(g, p.x - cam - 16, p.wy - 16, 32, 32);
    });
    if (!e.small) for (const p of pts.slice(1)) fx.burst(p.x, p.wy, E.mid, 4, 160, { kind: 'spark', s: 4, life: 0.3, stretch: 0.04, g: 0 });
  },
  beam(fx, e) {
    const p = pos(fx, e); const tg = target(e) || { x: p.x + 500 * ((e.unit?.face || 1) >= 0 ? 1 : -1), y: p.y };
    const el = elFor(e); const E = elOf(el); const wdt = e.w || e.width || 18;
    const y0 = fx.wy(p.y, e.z ?? 60); const y1 = fx.wy(tg.y, e.tz ?? 50);
    fx.add(e.dur || 0.28, (ctx, k, f, cam) => {
      const a = Math.atan2(y1 - y0, tg.x - p.x); const len = Math.hypot(tg.x - p.x, y1 - y0);
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x - cam, y0); ctx.rotate(a);
      const fl = 0.8 + 0.2 * Math.sin(f.t * 60);
      const wv = wdt * fl * (k > 0.8 ? (1 - k) * 5 : Math.min(1, f.t * 20));
      ctx.globalAlpha = 0.5; ctx.fillStyle = E.out; ctx.fillRect(0, -wv, len, wv * 2);
      ctx.globalAlpha = 0.9; ctx.fillStyle = E.mid; ctx.fillRect(0, -wv * 0.55, len, wv * 1.1);
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -wv * 0.2, len, wv * 0.4);
      const g = atlas('glow', E.mid); if (g) { ctx.drawImage(g, -wv * 2, -wv * 2, wv * 4, wv * 4); ctx.drawImage(g, len - wv * 2.5, -wv * 2.5, wv * 5, wv * 5); }
    });
    fx.burst(tg.x, y1, E.mid, 8, 260, { kind: 'spark', s: 4, life: 0.3, stretch: 0.04 });
  },
  death(fx, e) {
    const u = e.unit; if (!u) return;
    const col = u.def?.palette?.main || '#888'; const acc = u.def?.palette?.eye || '#fff';
    const wy = fx.wy(u.y, 40 * (u.size || 1));
    const big = u.boss ? 3 : u.rank !== 'normal' ? 1.6 : 1;
    fx.burst(u.x, wy, col, 10 * big, 200 * big, { kind: 'soft', add: false, s: 6, s1: 2, life: 0.6, g: 300, a: 0.9 });
    fx.burst(u.x, wy, acc, 6 * big, 140 * big, { kind: 'spark', s: 4, life: 0.5, g: -40 });
    if (u.boss) {
      explosion(fx, u.x, u.y, 220, 'holy', { big: 2 });
      fx.scene.slowmo(0.6, 0.3); fx.scene.addTrauma(0.85); fx.flash = 0.7; fx.flashCol = '#fff0d0';
      if (fx.s.fxHitStop !== false) fx.scene.hitstop(0.11);
      const x = u.x;
      fx.add(1.2, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; ctx.translate(x - cam, wy); ctx.globalAlpha = (1 - k) * 0.6; for (let i = 0; i < 10; i++) { ctx.rotate(TAU / 10); ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10 - k * 20, -400); ctx.lineTo(10 + k * 20, -400); ctx.closePath(); ctx.fill(); } });
    } else if (u.rank !== 'normal') {
      if (fx.s.fxHitStop !== false) fx.scene.hitstop(0.09);
      fx.scene.addTrauma(0.22);
      impact(fx, u.x, wy, 'holy', 1.6);
    }
  },
  shake(fx, e) { fx.scene.addTrauma(Math.min(0.6, (e.power || 3) / 12)); },
  gold(fx, e) {
    const n = Math.max(2, Math.min(7, Math.round(Math.log10((e.v || 1) + 1) * 2)));
    for (let i = 0; i < n; i++) {
      const d = { kind: 'coin', x: e.x + (rnd() - 0.5) * 20, y: e.y || 0, vx: (rnd() - 0.5) * 180, h: 0, vh: 160 + rnd() * 120, t: 0, life: 1.1 + rnd() * 0.3 };
      fx.add(d.life, (ctx, k, f, cam) => {
        const t = f.t; const hero = fx.scene.game.combat.hero;
        let x = d.x + d.vx * Math.min(t, 0.5); let hh = Math.max(0, d.vh * Math.min(t, 0.6) - 420 * Math.min(t, 0.6) ** 2);
        let wy = fx.wy(d.y) - hh;
        const pull = clamp((t - 0.6) / 0.5, 0, 1);
        if (pull > 0 && hero) { const p = pull * pull; x += (fx.scene.vx(hero) - x) * p; wy += (fx.wy(hero.y, 60) - wy) * p; }
        const img = atlas('coin');
        ctx.globalAlpha = pull > 0.85 ? (1 - pull) / 0.15 : 1;
        if (img) { const sx = Math.abs(Math.cos(t * 12)); ctx.drawImage(img, x - cam - 6 * sx, wy - 6, 12 * sx + 1, 12); }
      });
    }
  },
  loot(fx, e) { fx.addLoot(e); },
  levelup(fx, e) {
    const h = fx.scene.game.combat.hero; if (!h) return;
    fx.scene.addTrauma(0.35);
    const paragon = e.paragon;
    const col = paragon ? '#8ad0ff' : '#ffd860';
    fx.add(1.8, (ctx, k, f, cam) => {
      const x = fx.scene.vx(h) - cam; const y = fx.wy(h.y);
      ctx.globalCompositeOperation = 'lighter';
      const beam = beamSprite(col);
      ctx.globalAlpha = (1 - k) * 0.55; if (beam) ctx.drawImage(beam, x - 36 * (1 - k * 0.5), y - 460, 72 * (1 - k * 0.5), 460);
      const ring = atlas('ring', col); const s = 50 + 120 * ease(Math.min(1, k * 2));
      ctx.globalAlpha = 1 - k; if (ring) ctx.drawImage(ring, x - s, y - s * 0.32, s * 2, s * 0.64);
      ctx.globalCompositeOperation = 'source-over';
      const p = Math.min(1, f.t / 0.25); const sc = p < 0.6 ? (p / 0.6) * 1.25 : 1.25 - (p - 0.6) / 0.4 * 0.25;
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.save(); ctx.translate(x, y - 250 - 20 * k); ctx.scale(sc, sc);
      ctx.font = '900 38px "M PLUS 1p", Impact, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(40,20,0,0.9)'; const txt = paragon ? `アビスLv ${paragon}` : 'LEVEL UP!';
      ctx.strokeText(txt, 0, 0); const g = ctx.createLinearGradient(0, -30, 0, 6); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, col); g.addColorStop(1, '#c87a10'); ctx.fillStyle = g; ctx.fillText(txt, 0, 0);
      if (e.level && !paragon) { ctx.font = '700 18px "M PLUS 1p", sans-serif'; ctx.lineWidth = 4; ctx.strokeText(`Lv ${e.level}`, 0, 26); ctx.fillStyle = '#fff4c8'; ctx.fillText(`Lv ${e.level}`, 0, 26); }
      ctx.restore();
    });
    for (let i = 0; i < Math.round(40 * fx.density()); i++) fx.parts.add({ x: h.x + (rnd() - 0.5) * 80, y: fx.wy(h.y) - rnd() * 20, vx: (rnd() - 0.5) * 30, vy: -80 - rnd() * 160, life: 1 + rnd() * 0.6, s: 3 + rnd() * 3, img: atlas('spark', col), drag: 0.6 });
  },
  summon(fx, e) {
    const u = e.unit; const x = e.x ?? u?.x; const wy = fx.wy(e.y ?? u?.y ?? 0);
    const def = u?.skill ? SKILL[u.skill] : null; const col = def ? (ELEMENT_COLORS[def.element] || '#b080ff') : '#b080ff';
    const rc = def?.cls === 'necromancer' || !def ? '#b47cff' : col;
    const rune = atlas('rune', rc);
    fx.add(0.9, (ctx, k, f, cam) => { if (!rune) return; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.9; ctx.translate(x - cam, wy); ctx.scale(1, 0.32); ctx.rotate(k * 2); ctx.drawImage(rune, -56, -56, 112, 112); }, { under: true });
    fx.burst(x, wy, rc, 16, 60, { kind: 'glow', s: 4, life: 0.8, g: -200, jx: 60, jy: 10, drag: 1 });
    if (u) fx.scene.visOf(u).spawnT = 0;
  },
  spawn(fx, e) { const u = e.unit; if (u) fx.scene.visOf(u).spawnT = 0; const p = pos(fx, e); fx.burst(p.x, fx.wy(p.y), '#2a2030', 10, 80, { kind: 'smoke', add: false, s: 14, s1: 26, life: 0.7, g: -30, a: 0.6 }); },
  buff(fx, e) {
    const u = e.unit; if (!u) return;
    const el = elFor(e); const E = elOf(el);
    fx.add(0.7, (ctx, k, f, cam) => { const x = fx.scene.vx(u) - cam; const y = fx.wy(u.y); ctx.globalCompositeOperation = 'lighter'; const ring = atlas('ring', E.mid); for (let i = 0; i < 3; i++) { const kk = clamp(k * 1.4 - i * 0.18, 0, 1); if (kk <= 0 || kk >= 1) continue; ctx.globalAlpha = 1 - kk; const s = 46 + 10 * i; if (ring) ctx.drawImage(ring, x - s, y - 10 - kk * 150 - s * 0.3, s * 2, s * 0.6); } });
    fx.burst(u.x, fx.wy(u.y, 60), E.mid, 16, 80, { kind: 'spark', s: 4, life: 0.8, g: -220, jx: 50, jy: 30 });
  },
  boss(fx, e) {
    const u = e.unit; if (!u) return;
    if (fx.bossCard && fx.bossCard.unit === u) return;
    fx.bossCard = { unit: u, name: u.name, act: u.rank === 'actboss', t: 0, life: 2.6 };
    fx.lbT = 2.2; fx.scene.addTrauma(0.5); fx.flash = 0.6; fx.flashCol = '#ff3030';
    explosion(fx, u.x, u.y, 160, 'enemy');
  },
  cast(fx, e) {
    const u = e.unit; if (!u) return;
    const el = elFor(e); const vis = fx.scene.visOf(u);
    vis.castEl = el;
    const def = e.skill ? SKILL[e.skill] : null;
    const spell = (def?.tags || []).includes('spell');
    if (spell && (e.dur || 0) >= 0.3) {
      const rune = atlas('rune', elOf(el).mid);
      const dur = e.dur;
      fx.add(dur + 0.2, (ctx, k, f, cam) => { if (!rune) return; ctx.globalCompositeOperation = 'lighter'; const a = Math.min(1, f.t / 0.15) * (1 - Math.max(0, (f.t - dur) / 0.2)); ctx.globalAlpha = a * 0.75; ctx.translate(fx.scene.vx(u) - cam, fx.wy(u.y)); ctx.scale(1, 0.3); ctx.rotate(f.t * 1.5); ctx.drawImage(rune, -64, -64, 128, 128); }, { under: true });
    }
    if (def && /ult/.test(String(def.kind || '')) || def?.ult) HANDLERS.ult(fx, { skill: def.id, cls: def.cls, unit: u });
  },
  ult(fx, e) {
    const cls = e.cls || (e.skill && SKILL[e.skill]?.cls) || fx.scene.game.state?.hero?.cls;
    if (fx.cutin && fx.cutin.t < 0.5) return;
    const def = e.skill ? SKILL[e.skill] : null;
    fx.cutin = { cls, name: def?.name || e.name || '奥義', el: elFor(e), t: 0, life: 1.15 };
    fx.scene.slowmo(0.4, 0.35); fx.scene.addTrauma(0.45); fx.flash = 0.5; fx.flashCol = CLASS[cls]?.color || '#ffffff';
  },
  heroDeath(fx, e) { fx.flash = 0.8; fx.flashCol = '#ff2020'; fx.scene.slowmo(0.5, 0.35); fx.scene.addTrauma(0.5); const u = e.unit; if (u) fx.burst(u.x, fx.wy(u.y, 60), '#ff4040', 20, 200, { kind: 'spark', s: 5, life: 0.6 }); },
  revive(fx, e) {
    const u = e.unit; if (!u) return;
    fx.add(1.0, (ctx, k, f, cam) => { const x = fx.scene.vx(u) - cam; const y = fx.wy(u.y); ctx.globalCompositeOperation = 'lighter'; const b = beamSprite('#fff4c0'); ctx.globalAlpha = 1 - k; if (b) ctx.drawImage(b, x - 60, y - 600, 120, 600); });
    fx.burst(u.x, fx.wy(u.y, 40), '#fff0c0', 24, 160, { kind: 'spark', s: 4, life: 0.9, g: -200 });
  },
  leap(fx, e) {
    const p = pos(fx, e); const tg = target(e);
    fx.burst(p.x, fx.wy(p.y), '#9a8a74', 8, 120, { kind: 'smoke', add: false, s: 12, s1: 22, life: 0.6, g: -20, a: 0.5, flat: 0.3 });
    if (tg) { const el = elFor(e); fx.add(0.4, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = elOf(el).mid; ctx.globalAlpha = (1 - k) * 0.6; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(p.x - cam, fx.wy(p.y, 40)); ctx.quadraticCurveTo((p.x + tg.x) / 2 - cam, fx.wy(p.y, 220), tg.x - cam, fx.wy(tg.y, 40)); ctx.stroke(); }); }
  },
  land(fx, e) { const p = pos(fx, e); explosion(fx, p.x, p.y, e.r || 140, elFor(e)); crack(fx, p.x, p.y, e.r || 140); fx.scene.addTrauma(0.3); },
  slam(fx, e) { HANDLERS.land(fx, e); },
  dash(fx, e) {
    const p = pos(fx, e); const tg = target(e) || { x: p.x + 200 * ((e.unit?.face || 1) >= 0 ? 1 : -1), y: p.y };
    const E = elOf(elFor(e));
    fx.add(0.3, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; const st = atlas('streak', E.mid); if (!st) return; const y0 = fx.wy(p.y, 60); const len = tg.x - p.x; ctx.globalAlpha = 1 - k; ctx.translate(p.x - cam, y0); ctx.scale(Math.sign(len) || 1, 1); for (let i = 0; i < 3; i++) ctx.drawImage(st, 0, -40 + i * 30, Math.abs(len), 12); });
    fx.burst(p.x, fx.wy(p.y), '#9a8a74', 6, 100, { kind: 'smoke', add: false, s: 10, s1: 18, life: 0.5, g: -10, a: 0.4 });
  },
  teleport(fx, e) { const p = pos(fx, e); const tg = target(e); const E = elOf(elFor(e)); fx.burst(p.x, fx.wy(p.y, 60), E.mid, 16, 160, { kind: 'glow', s: 5, life: 0.5, g: 0 }); if (tg) fx.burst(tg.x, fx.wy(tg.y, 60), E.mid, 16, 160, { kind: 'glow', s: 5, life: 0.5, g: 0 }); },
  whirl(fx, e) { const p = pos(fx, e); HANDLERS.nova(fx, { ...e, x: p.x, y: p.y, r: e.r || 140, skill: e.skill || null, small: true }); },
  aura(fx, e) { const u = e.unit; const p = pos(fx, e); const E = elOf(elFor(e)); const r = e.r || 160; fx.add(0.6, (ctx, k, f, cam) => { const x = (u ? fx.scene.vx(u) : p.x) - cam; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * 0.7; const ring = atlas('ring', E.mid); const s = r * (0.6 + 0.4 * k); if (ring) ctx.drawImage(ring, x - s, fx.wy(u ? u.y : p.y) - s * 0.33, s * 2, s * 0.66); }, { under: true }); },
  curse(fx, e) { const p = pos(fx, e); const E = elOf(e.el || 'void'); const r = e.r || 120; const rune = atlas('rune', E.mid); fx.add(e.dur || 1.0, (ctx, k, f, cam) => { if (!rune) return; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, f.t * 5) * (1 - k) * 0.8; ctx.translate(p.x - cam, fx.wy(p.y)); ctx.scale(1, 0.32); ctx.rotate(-f.t * 1.2); ctx.drawImage(rune, -r, -r, r * 2, r * 2); }, { under: true }); fx.burst(p.x, fx.wy(p.y, 40), E.mid, 10, 60, { kind: 'glow', s: 5, life: 0.8, g: -60, jx: r }); },
  barrier(fx, e) { const u = e.unit; if (!u) return; const E = elOf(e.el || 'holy'); const dur = e.dur || 1.2; fx.add(dur, (ctx, k, f, cam) => { const x = fx.scene.vx(u) - cam; const y = fx.wy(u.y, 80 * (u.size || 1)); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, f.t * 6) * (1 - Math.max(0, (k - 0.8) / 0.2)) * (0.35 + 0.1 * Math.sin(f.t * 8)); const g = atlas('ring', E.mid); if (g) ctx.drawImage(g, x - 80, y - 90, 160, 180); }); },
  shield(fx, e) { HANDLERS.barrier(fx, e); },
  meteor(fx, e) { const p = pos(fx, e); const r = e.r || 140; const el = e.el || 'fire'; const E = elOf(el); const dl = e.delay || 0.5; fx.add(dl, (ctx, k, f, cam) => fallFrom(ctx, p.x - cam, fx.wy(p.y), k, el, null, E, { r })); setTimeoutFx(fx, dl, () => { explosion(fx, p.x, p.y, r, el, { big: 1.5 }); crack(fx, p.x, p.y, r); fx.scene.addTrauma(0.35); }); },
  explode(fx, e) { const p = pos(fx, e); explosion(fx, p.x, p.y, e.r || 120, elFor(e)); },
  telegraph(fx, e) { const p = pos(fx, e); const r = e.r || 100; const dur = e.dur || e.delay || 1; fx.add(dur, (ctx, k, f, cam) => { ctx.globalCompositeOperation = 'lighter'; const x = p.x - cam; const y = fx.wy(p.y); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(f.t * 16); ctx.strokeStyle = '#ff4030'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.35, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#ff4030'; ctx.beginPath(); ctx.ellipse(x, y, r * k, r * 0.35 * k, 0, 0, TAU); ctx.fill(); }, { under: true }); },
  heal(fx, e) { const p = pos(fx, e); fx.burst(p.x, fx.wy(p.y, 50), '#7cff7a', 10, 60, { kind: 'spark', s: 4, life: 0.8, g: -120, jx: 40 }); if (e.v) fx.addNumber({ x: p.x, y: p.y, z: 90, v: e.v, team: 'none', el: 'poison' }); },
  trap(fx, e) { const p = pos(fx, e); const E = elOf(elFor(e)); const rune = atlas('rune', E.mid); fx.add(0.5, (ctx, k, f, cam) => { if (!rune) return; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; ctx.translate(p.x - cam, fx.wy(p.y)); ctx.scale(1, 0.3); ctx.drawImage(rune, -40, -40, 80, 80); }, { under: true }); },
  totem(fx, e) { HANDLERS.summon(fx, e); },
  orbit(fx, e) { const u = e.unit; if (!u) return; const E = elOf(elFor(e)); const dur = e.dur || 2; const n = e.count || 3; const r = e.r || 70; fx.add(dur, (ctx, k, f, cam) => { const x = fx.scene.vx(u) - cam; const y = fx.wy(u.y, 60); ctx.globalCompositeOperation = 'lighter'; const g = atlas('glow', E.mid); ctx.globalAlpha = 1 - Math.max(0, (k - 0.85) / 0.15); for (let i = 0; i < n; i++) { const a = f.t * 4 + (i / n) * TAU; if (g) ctx.drawImage(g, x + Math.cos(a) * r - 14, y + Math.sin(a) * r * 0.35 - 14, 28, 28); } }); },
  wave(fx, e) { const p = pos(fx, e); const dir = (e.dir || (target(e) ? Math.sign(target(e).x - p.x) : 1)) || 1; const E = elOf(elFor(e)); const len = e.range || e.len || 500; fx.add(0.6, (ctx, k, f, cam) => { const x = p.x + dir * len * k - cam; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; const sl = atlas('slash', E.mid); if (sl) { ctx.translate(x, fx.wy(p.y, 50)); ctx.scale(dir, 1); ctx.drawImage(sl, -40, -70, 80, 140); } }); },
  wall(fx, e) { HANDLERS.wave(fx, e); },
};
HANDLERS.cleave = HANDLERS.whirl; HANDLERS.spin = HANDLERS.whirl; HANDLERS.blink = HANDLERS.teleport; HANDLERS.charge = HANDLERS.dash; HANDLERS.turret = HANDLERS.totem; HANDLERS.enrage = (fx, e) => { const p = pos(fx, e); explosion(fx, p.x, p.y, 120, 'enemy'); fx.scene.addTrauma(0.2); }; HANDLERS.roar = HANDLERS.enrage;

/** 遅れて起きる演出（scene の時間で） */
function setTimeoutFx(fx, delay, fn) { let done = false; fx.add(delay + 0.01, (ctx, k, f) => { if (!done && f.t >= delay) { done = true; fn(); } }); }
/** 地割れ */
function crack(fx, x, y, r) {
  const wy = fx.wy(y); const lines = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + rnd() * 0.5; const seg = [0, 0]; let px = 0; let py = 0; for (let j = 0; j < 4; j++) { px += Math.cos(a) * r * 0.22 + (rnd() - 0.5) * 10; py += Math.sin(a) * r * 0.08 + (rnd() - 0.5) * 4; seg.push(px, py); } lines.push(seg); }
  fx.add(1.4, (ctx, k, f, cam) => { ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(20,10,6,0.8)'; ctx.lineWidth = 2.4; ctx.translate(x - cam, wy); for (const s of lines) { ctx.beginPath(); for (let j = 0; j < s.length; j += 2) (j ? ctx.lineTo(s[j], s[j + 1]) : ctx.moveTo(s[j], s[j + 1])); ctx.stroke(); } }, { under: true });
}
/** 知らない出来事: 持っている値から見た目を決める */
function genericFx(fx, e) {
  if (!e || typeof e !== 'object') return;
  if (Array.isArray(e.pts) && e.pts.length > 1) { HANDLERS.chain(fx, e); return; }
  if (target(e) && (e.x !== undefined || e.unit)) { HANDLERS.beam(fx, { ...e, w: e.w || 8, dur: e.dur || 0.2 }); return; }
  if (e.unit && e.x === undefined) { HANDLERS.buff(fx, e); return; }
  if (e.x !== undefined) { if (e.r) HANDLERS.nova(fx, { ...e, small: true }); else impact(fx, e.x, fx.wy(e.y, e.z ?? 50), elFor(e), 0.8); }
}

// ---------------- 画面の上の演出
function drawLootBanner(ctx, b, W) {
  const k = b.t / b.life;
  const inK = Math.min(1, b.t / 0.22); const outK = Math.max(0, (b.t - (b.life - 0.3)) / 0.3);
  const y = 96 - (1 - ease(inK)) * 30;
  const a = (1 - outK) * Math.min(1, inK * 1.5);
  const mythic = b.L >= 5;
  ctx.save(); ctx.globalAlpha = a;
  const bw = 620; const x0 = (W - bw) / 2;
  const g = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.18, 'rgba(8,4,8,0.92)'); g.addColorStop(0.82, 'rgba(8,4,8,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x0, y - 32, bw, 64);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(W / 2, y, 10, W / 2, y, bw * 0.45); gl.addColorStop(0, hexA(b.r.color, 0.35)); gl.addColorStop(1, hexA(b.r.color, 0)); ctx.fillStyle = gl; ctx.fillRect(x0, y - 32, bw, 64); ctx.restore();
  // カードめくり（ミシック: 金 → 虹）
  let col = b.r.color;
  if (mythic) { const flip = clamp((b.t - 0.35) / 0.3, 0, 1); col = flip < 0.5 ? '#ffc040' : `hsl(${(b.t * 360) % 360},100%,65%)`; }
  const lg2 = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
  lg2.addColorStop(0, 'rgba(0,0,0,0)'); lg2.addColorStop(0.5, col); lg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg2; ctx.fillRect(x0, y - 30, bw, 2); ctx.fillRect(x0, y + 28, bw, 2);
  // アイコン（めくり）
  const spr = assets.sprite(b.icon);
  const flipS = mythic ? Math.abs(Math.cos(clamp((b.t - 0.35) / 0.3, 0, 1) * Math.PI)) : 1;
  if (spr?.img) { const hl = haloOf(spr.img, col); ctx.save(); ctx.translate(x0 + 120, y); ctx.scale(flipS, 1); ctx.globalCompositeOperation = 'lighter'; const f = 44 / Math.max(spr.img.width, spr.img.height); ctx.drawImage(hl.img, -(spr.img.width / 2 + hl.pad) * f, -(spr.img.height / 2 + hl.pad) * f, (spr.img.width + hl.pad * 2) * f, (spr.img.height + hl.pad * 2) * f); ctx.globalCompositeOperation = 'source-over'; assets.draw(ctx, spr, 0, 0, { w: 44, h: 44 }); ctx.restore(); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px "M PLUS 1p", sans-serif'; ctx.fillStyle = col;
  ctx.fillText(mythic && b.t < 0.5 ? '？？？' : b.r.name, x0 + 152, y - 13);
  ctx.font = '900 23px "M PLUS 1p", sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  const nm = mythic && b.t < 0.5 ? '……' : `${b.name}${b.count > 1 ? `　×${b.count}` : ''}`;
  ctx.strokeText(nm, x0 + 152, y + 10); ctx.fillStyle = '#fff6e0'; ctx.fillText(nm, x0 + 152, y + 10);
  if (k < 0.3) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (1 - k / 0.3) * 0.5; ctx.fillStyle = col; ctx.fillRect(x0 + 60, y - 28, bw - 120, 56); }
  ctx.restore();
}
function drawBossCard(ctx, b, W, H) {
  const k = b.t / b.life;
  const a = Math.min(1, b.t / 0.25) * (1 - Math.max(0, (b.t - (b.life - 0.5)) / 0.5));
  const y = H * 0.36;
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(0, y - 60, 0, y + 50);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(30,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y - 60, W, 110);
  const sx = W / 2; const spread = 120 + 200 * ease(Math.min(1, b.t / 0.5));
  ctx.strokeStyle = '#c8402e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - spread - 120, y + 26); ctx.lineTo(sx - 40, y + 26); ctx.moveTo(sx + 40, y + 26); ctx.lineTo(sx + spread + 120, y + 26); ctx.stroke();
  ctx.fillStyle = '#ff6a4a'; ctx.beginPath(); ctx.moveTo(sx, y + 18); ctx.lineTo(sx + 9, y + 26); ctx.lineTo(sx, y + 34); ctx.lineTo(sx - 9, y + 26); ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px "M PLUS 1p", sans-serif'; ctx.fillStyle = '#ffb090'; ctx.fillText(b.act ? '― 章のボス ―' : '― 地域のボス ―', sx, y - 36);
  const sc = 1 + 0.25 * (1 - ease(Math.min(1, b.t / 0.3)));
  ctx.save(); ctx.translate(sx, y - 4); ctx.scale(sc, sc);
  ctx.font = '800 42px "Shippori Mincho B1", "M PLUS 1p", serif'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,0,0,0.95)'; ctx.strokeText(b.name, 0, 0);
  const tg = ctx.createLinearGradient(0, -24, 0, 18); tg.addColorStop(0, '#fff0e0'); tg.addColorStop(0.5, '#ff7a5a'); tg.addColorStop(1, '#a01a10');
  ctx.fillStyle = tg; ctx.fillText(b.name, 0, 0);
  ctx.restore();
  ctx.restore();
  void k;
}
function drawCutin(ctx, c, W, H) {
  const t = c.t; const life = c.life;
  const inK = ease(Math.min(1, t / 0.18)); const outK = Math.max(0, (t - (life - 0.25)) / 0.25);
  const E = elOf(c.el);
  const col = CLASS[c.cls]?.color || '#ffffff';
  ctx.save();
  ctx.globalAlpha = 1 - outK;
  // 斜めの帯
  const bandH = 190; const y = H * 0.42;
  ctx.save(); ctx.translate(W / 2, y); ctx.rotate(-0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(-W, -bandH / 2 * inK, W * 2, bandH * inK);
  const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.5, hexA(col, 0.55)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.fillRect(-W, -bandH / 2 * inK, W * 2, bandH * inK);
  // 速い線
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = E.mid; ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) { const yy = ((i * 37) % bandH) - bandH / 2; const xx = ((t * 2600 + i * 211) % (W * 1.6)) - W * 0.8; ctx.globalAlpha = (1 - outK) * 0.5; ctx.beginPath(); ctx.moveTo(xx, yy * inK); ctx.lineTo(xx + 160, yy * inK); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - outK;
  // 立ち絵
  const spr = assets.sprite(`hero.${c.cls}.portrait`);
  if (spr?.img) {
    const ph = bandH * 1.5; const pw = ph * (spr.img.width / spr.img.height);
    const px = -W * 0.32 + (1 - inK) * -300 + t * 30;
    ctx.save(); ctx.beginPath(); ctx.rect(-W, -bandH / 2 * inK, W * 2, bandH * inK); ctx.clip();
    ctx.drawImage(spr.img, px - pw / 2, -ph * 0.42, pw, ph);
    ctx.restore();
  }
  // 名前
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '900 54px "Shippori Mincho B1", "M PLUS 1p", serif';
  const tx = -60 + (1 - inK) * 200;
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.95)'; ctx.strokeText(c.name, tx, 6);
  const tg = ctx.createLinearGradient(0, -30, 0, 30); tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, E.mid); tg.addColorStop(1, E.out);
  ctx.fillStyle = tg; ctx.fillText(c.name, tx, 6);
  ctx.font = 'bold 16px "M PLUS 1p", sans-serif'; ctx.fillStyle = '#f0e6d0'; ctx.fillText('奥義', tx + 4, -40);
  ctx.restore();
  ctx.restore();
}

/** sceneHooks に自分の描き方を登録する（他の担当が先に入れていればそちらを優先） */
export function installFx(hooks) {
  if (!hooks.projectile) hooks.projectile = (scene, ctx, pr, x, y) => scene.fx.drawProjectile(ctx, pr, x, y);
  if (!hooks.area) hooks.area = (scene, ctx, a, x, y) => scene.fx.drawArea(ctx, a, x, y);
}
export { HANDLERS as FX_HANDLERS };
