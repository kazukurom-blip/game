// 戦闘の画面（キャンバス）。背景の視差スクロール・空気の粒・主人公・敵・弾・演出・ダメージの数字・ドロップの光。
// combat.fx を毎フレーム読み出し、fx.js（FxSystem）で演出に変える。
//
// 手触り（REFERENCE F01〜F07）:
//   ・被弾の白フラッシュ 50ms、会心だけヒットストップ（約 45ms）、エリート・ボス撃破は 90〜110ms。
//     ヒットストップとスローは「見た目の時間」だけを遅くする（ゲームの計算は止めない）。
//   ・トラウマ式の画面揺れ: 揺れ = trauma² × 8px × 設定。毎秒 1.5 減る。
//   ・設定: fx（多い/ふつう/少ない）, shake, fxShake（0〜100）, dmgNumbers, fxDmgMode, lootBeams, fxHitStop, fxLootSlow, fxFlash, fxReduce。
//
// sceneHooks（他の担当が足せる口）:
//   fx[type] = (scene, e) => void   … 出来事ごとの追加演出（自分の演出に加えて呼ばれる）
//   onFx = [(scene, e) => void]     … すべての出来事を受け取る（音など）
//   drawFx = [(scene, ctx, dt)]     … 毎フレームの追加描画（キャラの上）
//   projectile / area               … 弾・地面の効果の描き方（true を返せば描いたことになる）。既定は fx.js

import { assets } from './assets.js';
import { drawHero, heroLook } from './paperdoll.js';
import { ELEMENT_COLORS } from '../data/stats.js';
import { ZONE, ACTS } from '../data/world.js';
import { fmt, fmtClock } from '../engine/format.js';
import { ELITE_AFFIXES } from '../data/monsters.js';
import { statusDefs } from '../game/combat.js';
import { SKILL } from '../data/skills.js';
import { FxSystem, installFx, atlas, whiteOf, tintOf, haloOf, fxLabel } from './fx.js';
import { monsterParts } from './painters/monsters.js';
import { unitDrawScale } from './manifest.js';
import { ACT_ATMOS } from './painters/backgrounds.js';
import { makeCanvas } from './assets.js';
import { settingsHooks } from '../ui/panels/settings.js';
import { h as el } from '../ui/dom.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const GROUND = 560;
const HERO_SCREEN_X = 380;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const sceneHooks = {
  fx: {}, // type → (scene, e) => void … 演出の追加
  onFx: [], // (scene, e) => void … すべての出来事を受け取る（音など、何人でも登録できる）
  drawFx: [], // (scene, ctx, dt) => void … 毎フレームの追加描画
  projectile: null, // (scene, ctx, pr, sx, sy) => bool … 弾の描き方（true なら描いた）
  area: null, // (scene, ctx, a, sx, sy) => bool
};
installFx(sceneHooks);
const MY_PROJ = sceneHooks.projectile; const MY_AREA = sceneHooks.area;

const ELITE_NAME = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a.name]));
const RANK_GLOW = { champion: '#5a9cff', rare: '#ffc83a', boss: '#ff4030', actboss: '#ff2a50', guardian: '#c060ff' };

export class Scene {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.camX = 0;
    this.t = 0;
    this.dpr = 1;
    this.lookCache = null;
    this.fx = new FxSystem(this);
    this.vis = new WeakMap();
    this.trauma = 0; this.stopT = 0; this.slowT = 0; this.slowK = 1;
    this.bg = null;
    this.atmos = [];
    this.atmosAct = null;
    this.order = [];
    this.labels = [];
    this.vign = null;
    this.reduce = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    this.resize();
    this.offs = [
      game.events.on('gearChanged', () => { this.lookCache = null; }),
      assets.onChange(() => { this.lookCache = null; this.bg = null; }),
    ];
  }

  /** 後始末（タイトルに戻ったとき）。知らせを外さないと、前の画面の絵（大きなキャンバス）が残り続ける */
  dispose() {
    for (const off of this.offs || []) { try { off(); } catch { /* 無視 */ } }
    this.offs = [];
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(320, Math.round((r.width || VIEW_W) * dpr));
    const h = Math.round(w * VIEW_H / VIEW_W);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scale = w / VIEW_W;
  }

  get settings() { return this.game.state?.settings || {}; }

  /** 画面上の位置 */
  sx(x) { return x - this.camX; }
  sy(y, z = 0) { return GROUND + y * 0.9 - z; }

  // ---------------- 手触り
  hitstop(t) { if (this.reduce || this.settings.fxReduce) return; this.stopT = Math.max(this.stopT, t); }
  slowmo(t, k) { if (!(t > 0) || this.reduce || this.settings.fxReduce) return; this.slowT = Math.max(this.slowT, t); this.slowK = Math.min(this.slowT > 0 ? this.slowK : 1, k); }
  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }
  timeScale() { if (this.stopT > 0) return 0.05; if (this.slowT > 0) return this.slowK; return 1; }

  /** キャラの見た目の状態（なめらかな位置・動きの時間・光） */
  visOf(u) {
    let v = this.vis.get(u);
    if (!v) { v = { x: u.x, at: u.anim?.t || 0, animRef: u.anim, n: 0, flash: 0, recoil: 0, lastHF: 0, spawnT: u.kind === 'hero' ? 9 : 0, dieT: 0, chip: 1, castEl: null }; this.vis.set(u, v); }
    return v;
  }
  /** 見た目の x（なめらか） */
  vx(u) { return this.vis.get(u)?.x ?? u.x; }

  frame(dt) {
    const g = this.game;
    if (!g.state || !g.combat.hero) return;
    const ts = this.timeScale();
    const vdt = dt * ts;
    if (this.stopT > 0) this.stopT -= dt; else if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowK = 1; }
    this.t += vdt;
    const ctx = this.ctx;
    const c = g.combat;
    const h = c.hero;
    this.consumeFx(c);
    this.fx.update(vdt, dt);
    this.updateVis(c, dt, vdt);
    // カメラ
    const hv = this.vx(h);
    const target = hv - HERO_SCREEN_X;
    if (Math.abs(target - this.camX) > 900) this.camX = target;
    this.camX += (target - this.camX) * Math.min(1, dt * 5);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // 揺れ（トラウマ式）
    let shx = 0; let shy = 0;
    const s = this.settings;
    if (this.trauma > 0) {
      const amt = (s.shake === false || this.reduce || s.fxReduce ? 0 : (s.fxShake ?? 100) / 100) * 8;
      const tr = this.trauma * this.trauma * amt;
      const T = this.t * 38;
      shx = tr * (Math.sin(T * 1.3) * 0.6 + Math.sin(T * 2.9 + 1.7) * 0.4);
      shy = tr * (Math.sin(T * 1.7 + 0.5) * 0.6 + Math.sin(T * 3.3 + 2.2) * 0.4);
      this.trauma = Math.max(0, this.trauma - dt * 1.5);
    }
    ctx.translate(shx, shy);
    this.drawBackground(ctx, dt);
    // 地面の効果・足元の演出
    for (const a of c.areas) this.drawArea(ctx, a);
    this.drawBuffAuras(ctx, h);
    this.fx.drawUnder(ctx);
    // キャラを奥から順に
    const list = this.order; list.length = 0;
    for (const u of c.units) list.push(u);
    list.sort(depthOrder);
    this.labels.length = 0;
    for (const u of list) this.drawUnit(ctx, u);
    for (const pr of c.projs) this.drawProj(ctx, pr);
    this.fx.drawOver(ctx);
    this.drawAtmos(ctx, true);
    for (const f of sceneHooks.drawFx) { try { f(this, ctx, vdt); } catch (e) { console.error(e); } }
    this.fx.drawDrops(ctx);
    // 名前の札が重ならないように少しずつ上へずらす
    const placed = [];
    for (const l of this.labels) {
      let y = l.y;
      for (let k = 0; k < 4; k++) { if (!placed.some((p) => Math.abs(p.x - l.x) < 90 && Math.abs(p.y - y) < 14)) break; y -= 15; }
      if (placed.some((p) => Math.abs(p.x - l.x) < 90 && Math.abs(p.y - y) < 14 && p.text === l.text)) continue;
      placed.push({ x: l.x, y, text: l.text });
      fxLabel(ctx, l.x, y, l.text, l.col, l.size);
    }
    this.fx.drawNumbers(ctx);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawOverlay(ctx, dt);
    this.fx.drawOverlay(ctx, VIEW_W, VIEW_H);
  }

  // ---------------- 背景
  bgLayers(act) {
    const k = Math.max(0.5, Math.min(1.5, Math.round(this.scale * 4) / 4));
    if (this.bg && this.bg.act === act && this.bg.k === k) return this.bg;
    const out = { act, k, layers: {} };
    for (const [key, id] of [['far', `bg.${act}`], ['mid', `bg.${act}.mid`], ['ground', `bg.${act}.ground`]]) {
      if (assets.isCustom(id)) { const sp = assets.sprite(id); out.layers[key] = { img: sp.img, w: sp.sw, h: sp.sh, fw: sp.img.width / (sp.frames || 1) }; continue; }
      const spec = assets.spec(id) || { id, w: VIEW_W, h: key === 'ground' ? 220 : VIEW_H };
      const pt = assets.painterFor(id);
      const cv = makeCanvas(spec.w * k, spec.h * k);
      if (cv && pt) { const x = cv.getContext('2d'); x.scale(k, k); try { pt.fn(x, { ...spec, id }, spec.w, spec.h); } catch (e) { console.error('[bg]', id, e); } }
      out.layers[key] = cv ? { img: cv, w: spec.w, h: spec.h, fw: cv.width } : null;
    }
    this.bg = out;
    return out;
  }

  drawBackground(ctx, dt) {
    const g = this.game;
    const z = ZONE[g.state.world.zone];
    const act = z ? z.act : ACTS[0].id;
    const L = this.bgLayers(act).layers;
    ctx.fillStyle = '#0c0a10';
    ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
    this.tile(ctx, L.far, this.camX * 0.08, 0);
    this.drawAtmosSetup(act);
    this.drawAtmos(ctx, false, dt);
    this.tile(ctx, L.mid, this.camX * 0.35, 0);
    this.tile(ctx, L.ground, this.camX, GROUND - 40);
    // 暗い縁
    if (!this.vign) this.vign = vignette();
    if (this.vign) ctx.drawImage(this.vign, 0, 0, VIEW_W, VIEW_H);
  }

  tile(ctx, Lr, offset, y) {
    if (!Lr?.img || Lr.w <= 0) return;
    const w = Lr.w;
    const start = -((offset % w) + w) % w;
    for (let x = start; x < VIEW_W; x += w) ctx.drawImage(Lr.img, 0, 0, Lr.fw || Lr.img.width, Lr.img.height, Math.floor(x), y, Math.ceil(w) + 1, Lr.h);
  }

  // ---------------- 空気の粒（章ごと）
  drawAtmosSetup(act) {
    if (this.atmosAct === act) return;
    this.atmosAct = act;
    const A = ACT_ATMOS[act] || ACT_ATMOS.act1;
    const n = Math.round(A.n * (this.settings.fx === 'low' ? 0.3 : this.settings.fx === 'mid' ? 0.6 : 1));
    this.atmos = [];
    for (let i = 0; i < n; i++) this.atmos.push(newAtmos(A, true));
    this.atmosDef = A;
  }
  drawAtmos(ctx, front, dt = 0) {
    const A = this.atmosDef; if (!A) return;
    const W = VIEW_W + 120;
    if (!front && dt) for (const p of this.atmos) { p.x += p.vx * dt * (this.timeScale()); p.y += p.vy * dt * this.timeScale(); p.ph += dt; if (p.y > VIEW_H + 30 || p.y < -40 || p.ph > p.life) Object.assign(p, newAtmos(A, false)); }
    const img = atmosImg(A);
    if (!img) return;
    ctx.save();
    ctx.globalCompositeOperation = A.add ? 'lighter' : 'source-over';
    for (const p of this.atmos) {
      if ((p.z > 1) !== front) continue;
      const x = ((p.x - this.camX * p.par) % W + W) % W - 60;
      const k = p.ph / p.life;
      let a = p.a * (k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1);
      if (A.kind === 'ember' || A.kind === 'star' || A.kind === 'blood') a *= 0.6 + 0.4 * Math.sin(p.ph * 7 + p.seed);
      ctx.globalAlpha = a;
      const sz = p.s * (A.kind === 'steam' || A.kind === 'cloud' ? 1 + k * 1.5 : 1);
      const sw = A.kind === 'sand' ? sz * 5 : sz;
      if (A.kind === 'snow' || A.kind === 'ash') { const sway = Math.sin(p.ph * 1.6 + p.seed) * 10; ctx.drawImage(img, x + sway - sz, p.y - sz, sz * 2, sz * 2); }
      else ctx.drawImage(img, x - sw, p.y - sz, sw * 2, sz * 2);
    }
    ctx.restore();
  }

  // ---------------- キャラ
  updateVis(c, dt, vdt) {
    const speed = Math.max(1, Math.min(4, this.settings.speed || 1));
    for (const u of c.units) {
      const v = this.visOf(u);
      // 位置をなめらかに（20 回/秒の計算を 60fps で見せる）
      if (Math.abs(u.x - v.x) > 120) v.x = u.x; else v.x += (u.x - v.x) * Math.min(1, dt * 22);
      // 動きの時間
      if (u.anim !== v.animRef || u.anim?.s !== v.animS) {
        if (u.anim?.s === 'attack' || u.anim?.s === 'cast') { if (u.anim !== v.animRef) v.n++; }
        v.animRef = u.anim; v.animS = u.anim?.s; v.at = u.anim?.t || 0;
      } else if (!(u.statuses?.freeze?.t > 0)) {
        v.at = clamp(v.at + vdt * speed, (u.anim?.t || 0) - 0.08, (u.anim?.t || 0) + 0.06);
      }
      // 被弾（白フラッシュ 50ms・のけぞり）
      const hf = u.hitFlash || 0;
      if (hf > v.lastHF + 0.005) { v.flash = 0.05; v.recoil = 1; }
      v.lastHF = hf;
      if (v.flash > 0) v.flash -= dt;
      if (v.recoil > 0) v.recoil = Math.max(0, v.recoil - vdt * 7);
      if (v.spawnT < 9) v.spawnT += vdt;
      if (u.dead) { v.dieT += vdt; if (u.kind === 'hero') v.at = v.dieT; } else v.dieT = 0;
      const ratio = u.maxLife ? Math.max(0, u.life / u.maxLife) : 1;
      v.chip = ratio > v.chip ? ratio : v.chip + (ratio - v.chip) * Math.min(1, vdt * 2.5);
    }
  }

  drawUnit(ctx, u) {
    const v = this.visOf(u);
    const x = v.x - this.camX; const y = this.sy(u.y);
    if (x < -320 || x > VIEW_W + 320) return;
    if (u.kind === 'hero') {
      const st = this.game.state;
      if (!this.lookCache || this.lookState !== st || this.lookCls !== st.hero.cls) { this.lookCache = heroLook(st); this.lookState = st; this.lookCls = st.hero.cls; }
      this.drawStatusUnder(ctx, u, x, y, 1);
      drawHero(ctx, u, x, y, { look: this.lookCache, t: this.t, scale: 1, vis: v, whiteOf });
      this.drawStatusOver(ctx, u, x, y, 190, 60);
      if (u.dead) this.labels.push({ x, y: y - 120, text: '復活まで…', col: '#ff8a8a', size: 14 });
      return;
    }
    const s = assets.sprite(u.art);
    if (!s?.img) return;
    const { art: artSc, size } = unitDrawScale(u); // ボスは見た目の大きさを詰める（manifest.js）
    const a = u.anim || { s: 'idle', t: 0 };
    const faceDir = u.team === 'hero' ? 1 : -1; // 絵の向き（敵は左向き）
    const flip = u.team === 'hero' ? (u.face || 1) < 0 : (u.face || -1) > 0;
    const dirToward = flip ? -faceDir : faceDir; // 画面の上で前の向き
    // 姿勢
    let dx = 0; let dy = 0; let rot = 0; let sx = 1; let sy = 1; let alpha = 1;
    const at = v.at;
    const seed = u.id * 1.7;
    if (u.dead) {
      const k = clamp(v.dieT / 0.45, 0, 1);
      rot = -dirToward * 1.35 * (k * k);
      alpha = clamp(1 - (v.dieT - 0.35) / 0.7, 0, 1);
      dy = k * 4;
      if (v.dieT < 0.9 && Math.random() < 0.5 * (this.settings.fx === 'low' ? 0.3 : 1)) this.fx.parts.add({ x: u.x + (Math.random() - 0.5) * 50 * size, y: y - Math.random() * 90 * size, vy: -40 - Math.random() * 60, vx: (Math.random() - 0.5) * 20, life: 0.8, s: 3, img: atlas('glow', u.def?.palette?.eye || '#ffffff'), drag: 0.5 });
    } else if (a.s === 'walk') { dy = -Math.abs(Math.sin(at * 8 + seed)) * 4 * size; rot = Math.sin(at * 8 + seed) * 0.045; }
    else if (a.s === 'attack') {
      const wind = clamp(at / 0.3, 0, 1); const lunge = clamp((at - 0.3) / 0.12, 0, 1); const rec = clamp((at - 0.42) / 0.2, 0, 1);
      const back = wind * (1 - lunge); const fwd = lunge * (1 - rec);
      dx = dirToward * (-7 * back + 18 * fwd) * size;
      rot = dirToward * (-0.09 * back + 0.08 * fwd);
      sy = 1 + 0.05 * back - 0.06 * fwd; sx = 1 - 0.03 * back + 0.08 * fwd;
      if (u.kind === 'monster' && (u.def?.attack === 'caster' || u.def?.attack === 'ranged') && back > 0.2) this.castGlowAt(ctx, x + dirToward * 30 * size, y - 70 * size, back, u.element);
    } else { const b = Math.sin(this.t * 2.8 + seed); dy = b * 1.6 * size; sy = 1 + b * 0.022; sx = 1 - b * 0.011; }
    if (u.z > 0) dy += Math.sin(this.t * 4 + seed) * 8 - u.z;
    if (v.recoil > 0 && !u.dead) { dx -= dirToward * 7 * v.recoil * (u.boss ? 0.3 : 1); sx *= 1 + 0.1 * v.recoil; sy *= 1 - 0.1 * v.recoil; }
    // 出現（0 → 1.08 → 1.0）
    let pop = 1;
    if (v.spawnT < 0.28) { const k = v.spawnT / 0.28; pop = k < 0.7 ? (k / 0.7) * 1.08 : 1.08 - (k - 0.7) / 0.3 * 0.08; alpha *= Math.min(1, k * 2); }
    const sc = artSc * pop;
    // 影
    ctx.save(); ctx.globalAlpha = 0.35 * alpha * (u.z > 0 ? 0.6 : 1); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y, 36 * size, 8 * size, 0, 0, TAU); ctx.fill(); ctx.restore();
    const parts = !s.custom ? monsterParts(u.kind === 'monster' ? u.defId : (u.art || '').replace(/^pet\./, ''), u.kind === 'monster' ? 'monster' : 'pet') : null;
    const usePets = u.kind !== 'monster' && !(u.art || '').startsWith('pet.');
    const P = usePets ? null : parts;
    const body = P ? P.body : s.img;
    // エリート・ボスの光（輪郭が脈打つ）
    const glowCol = !u.dead && u.kind === 'monster' && u.rank !== 'normal' ? (u.boss ? RANK_GLOW[u.rank] || RANK_GLOW.boss : RANK_GLOW[u.rank] || '#ffffff') : null;
    if (glowCol) {
      const hl = haloOf(body, glowCol);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.55 + 0.35 * Math.sin(this.t * 4 + seed)) * alpha;
      this.blit(ctx, hl.img, s, x + dx, y + dy, sc, sx, sy, rot, flip, hl.pad, body);
      ctx.restore();
      this.eliteParticles(u, x, y, size);
    }
    ctx.save(); if (alpha < 1) ctx.globalAlpha = alpha;
    const flap = P ? Math.cos(this.t * (u.z > 0 ? 14 : 6) + seed) : 0;
    if (P?.far) this.blitWing(ctx, P.far, P, s, x + dx, y + dy, sc, sx, sy, rot, flip, flap);
    this.blit(ctx, body, s, x + dx, y + dy, sc, sx, sy, rot, flip);
    if (P?.near) this.blitWing(ctx, P.near, P, s, x + dx, y + dy, sc, sx, sy, rot, flip, flap);
    // 状態異常の色
    const st = u.statuses || {};
    if (!u.dead) {
      const tint = st.freeze?.t > 0 ? ['#9ae8ff', 0.55] : st.ignite?.t > 0 ? ['#ff7a2a', 0.22 + 0.1 * Math.sin(this.t * 20)] : st.poison?.stacks?.length ? ['#7cff5a', 0.22] : st.chill?.t > 0 ? ['#7fd8ff', 0.25] : st.shock?.t > 0 && Math.random() < 0.3 ? ['#fff07a', 0.4] : null;
      if (tint) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha * tint[1]; this.blit(ctx, tintOf(body, tint[0]), s, x + dx, y + dy, sc, sx, sy, rot, flip); }
      if (v.flash > 0 && this.settings.fxFlash !== false) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha * 0.85; this.blit(ctx, whiteOf(body), s, x + dx, y + dy, sc, sx, sy, rot, flip); }
    } else if (v.dieT < 0.12) { ctx.globalAlpha = 0.9; this.blit(ctx, whiteOf(body), s, x + dx, y + dy, sc, sx, sy, rot, flip); }
    ctx.restore();
    const topH = s.sh * (s.ay ?? 0.97) * artSc;
    if (!u.dead) this.drawStatusOver(ctx, u, x, y + dy, topH, 28 * size);
    if (!u.dead) this.drawStatusUnder(ctx, u, x, y, size);
    // ライフの棒
    if (!u.dead && u.kind === 'monster' && !u.boss && (u.life < u.maxLife || u.rank !== 'normal')) {
      const bw = 62 * Math.max(0.8, Math.min(1.4, size)); const top = y - topH - 12 + (u.z > 0 ? -u.z : 0);
      this.lifeBar(ctx, x - bw / 2, top, bw, 6, u.life / u.maxLife, v.chip, u.rank === 'normal' ? '#d8352a' : u.rank === 'rare' ? '#ffc83a' : '#5a9cff');
      if (u.rank !== 'normal') {
        const names = (u.elite || []).map((id) => ELITE_NAME[id] || '').filter(Boolean).join('・');
        this.labels.push({ x, y: top - 6, text: `${names ? `${names}の` : ''}${u.name}`, col: u.rank === 'rare' ? '#ffd860' : '#8ab8ff', size: 13 });
      }
    }
    if (u.kind === 'minion' && !u.dead && u.life < u.maxLife) this.lifeBar(ctx, x - 20, y - topH - 6, 40, 4, u.life / u.maxLife, v.chip, '#5ad05a');
  }

  /** 絵を描く（assets.draw と同じ置き方。差し替えの横並び画像にも対応） */
  blit(ctx, img, s, x, y, scale, sxx, syy, rot, flip, pad = 0, base = null) {
    if (!img) return;
    const ref = base || img;
    const frames = s.custom ? s.frames || 1 : 1;
    const fw = ref.width / frames;
    const w = (s.sw) * scale * sxx; const h = (s.sh) * scale * syy;
    const kx = w / fw; const ky = h / ref.height;
    let frame = 0;
    if (frames > 1) frame = Math.floor(this.t * (s.fps || 10)) % frames;
    ctx.save();
    // assets.draw と同じ順: 動きの回転・向き → 差し替え画像の補正（ずらし・回転。絵の向きと一緒に回る）
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    if (s.ox || s.oy) ctx.translate((s.ox || 0) * scale, (s.oy || 0) * scale);
    if (s.rot) ctx.rotate(s.rot);
    if (s.flip) ctx.scale(-1, 1);
    if (pad) ctx.drawImage(img, -w * s.ax - pad * kx, -h * s.ay - pad * ky, img.width * kx, img.height * ky);
    else ctx.drawImage(img, frame * fw, 0, fw, img.height, -w * s.ax, -h * s.ay, w, h);
    ctx.restore();
  }
  blitWing(ctx, img, P, s, x, y, scale, sxx, syy, rot, flip, flap) {
    if (!img) return;
    const w = s.sw * scale * sxx; const h = s.sh * scale * syy;
    const kx = w / P.w; const ky = h / P.h;
    const rx = (P.root[0] - P.w * s.ax) * kx; const ry = (P.root[1] - P.h * s.ay) * ky;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip !== !!s.flip) ctx.scale(-1, 1);
    ctx.translate(rx, ry);
    ctx.scale(1, 0.55 + 0.45 * flap);
    ctx.translate(-rx, -ry);
    ctx.drawImage(img, -w * s.ax, -h * s.ay, w, h);
    ctx.restore();
  }

  lifeBar(ctx, x, y, w, h, ratio, chip, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x, y, w * clamp(chip, 0, 1), h);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h * 0.4);
  }

  castGlowAt(ctx, x, y, k, elId) {
    const img = atlas('glow', ELEMENT_COLORS[elId] || '#ff6040');
    if (!img) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; const r = 12 + 18 * k; ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  /** エリートの詞ごとの粒 */
  eliteParticles(u, x, y, size) {
    const d = this.settings.fx === 'low' ? 0.25 : this.settings.fx === 'mid' ? 0.5 : 1;
    if (Math.random() > 0.35 * d) return;
    const fl = u.flags || {};
    const px = u.x + (Math.random() - 0.5) * 50 * size; const py = y - Math.random() * 90 * size;
    let col = null; let img = null; let vy = -40; let add = true;
    if (fl.deathBlast || fl.element === 'fire') { img = atlas('flame', '#ff8a2a', '#ff3a10'); vy = -60; }
    else if (fl.chill || fl.element === 'cold') img = atlas('flake', '#e8faff');
    else if (fl.zap || fl.element === 'lightning') { img = atlas('spark', '#fff07a'); vy = 0; }
    else if (fl.leech) { img = atlas('soft', '#c0102a'); add = false; vy = -20; }
    else if (fl.regen) img = atlas('spark', '#7cff7a');
    else if (fl.dmg) img = atlas('glow', '#ff3030');
    else { col = RANK_GLOW[u.rank] || '#ffffff'; img = atlas('glow', col); }
    this.fx.parts.add({ x: px, y: py, vx: (Math.random() - 0.5) * 20, vy, life: 0.7, s: 4 + Math.random() * 3, img, add, a: add ? 1 : 0.5, drag: 0.5 });
  }

  /** 足元（状態異常の印・呪い） */
  drawStatusUnder(ctx, u, x, y, size) {
    const st = u.statuses; if (!st || u.dead) return;
    if (st.vuln?.t > 0) { const rune = atlas('rune', '#c77dff'); if (rune) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.translate(x, y); ctx.scale(1, 0.3); ctx.rotate(this.t * 1.4); ctx.drawImage(rune, -44 * size, -44 * size, 88 * size, 88 * size); ctx.restore(); } }
    if (st.freeze?.t > 0) { const sh = atlas('shard', '#9ae8ff'); if (sh) { ctx.save(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI - Math.PI; ctx.save(); ctx.translate(x + Math.cos(a) * 30 * size, y + 4); ctx.rotate(Math.cos(a) * 0.5); ctx.drawImage(sh, -6 * size, -30 * size, 12 * size, 30 * size); ctx.restore(); } ctx.restore(); } }
  }
  /** 体の上（燃える・毒・感電・気絶） */
  drawStatusOver(ctx, u, x, y, topH, wd) {
    const st = u.statuses; if (!st || u.dead) return;
    const d = this.settings.fx === 'low' ? 0.3 : this.settings.fx === 'mid' ? 0.6 : 1;
    const rx = () => u.x + (Math.random() - 0.5) * wd * 1.6;
    const ry = () => y - Math.random() * topH * 0.8;
    if (st.ignite?.t > 0 && Math.random() < 0.55 * d) this.fx.parts.add({ x: rx(), y: ry(), vx: 0, vy: -70, life: 0.45, s: 8, s1: 2, img: atlas('flame', '#ff8a2a', '#ff3a10'), drag: 1 });
    if (st.poison?.stacks?.length && Math.random() < 0.35 * d) this.fx.parts.add({ x: rx(), y: ry(), vy: -30, life: 0.7, s: 4, img: atlas('bubble', '#9aff6a'), drag: 0.5 });
    if (st.bleed?.t > 0 && Math.random() < 0.3 * d) this.fx.parts.add({ x: rx(), y: ry(), vy: 20, g: 400, life: 0.5, s: 3, img: atlas('soft', '#c0101a'), add: false });
    if (st.chill?.t > 0 && Math.random() < 0.2 * d) this.fx.parts.add({ x: rx(), y: ry(), vy: 20, life: 0.8, s: 3, img: atlas('flake', '#e8faff'), vr: 2 });
    if (st.shock?.t > 0 && Math.random() < 0.25) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 1.6;
      ctx.beginPath(); let px = x + (Math.random() - 0.5) * wd * 1.5; let py = y - Math.random() * topH; ctx.moveTo(px, py); for (let i = 0; i < 4; i++) { px += (Math.random() - 0.5) * 22; py += (Math.random() - 0.5) * 22; ctx.lineTo(px, py); } ctx.stroke(); ctx.restore();
    }
    if (st.stun?.t > 0) { const img = atlas('star', '#ffe060'); if (img) for (let i = 0; i < 3; i++) { const a = this.t * 5 + (i / 3) * TAU; ctx.drawImage(img, x + Math.cos(a) * 20 - 6, y - topH - 8 + Math.sin(a) * 6 - 6, 12, 12); } }
    for (const id in st) {
      if (['ignite', 'poison', 'bleed', 'chill', 'shock', 'stun', 'freeze', 'vuln'].includes(id)) continue;
      const def = statusDefs[id]; const s0 = st[id];
      if (def?.color && s0?.t > 0 && Math.random() < 0.15 * d) this.fx.parts.add({ x: rx(), y: ry(), vy: -30, life: 0.6, s: 4, img: atlas('glow', def.color) });
    }
  }

  /** 主人公の強化の気配 */
  drawBuffAuras(ctx, h) {
    const bs = this.game.combat.buffs; if (!bs?.length || !h || h.dead) return;
    const x = this.vx(h) - this.camX; const y = this.sy(h.y);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let i = 0;
    for (const b of bs) {
      if (i >= 3) break;
      const col = ELEMENT_COLORS[SKILL_EL(b.id)] || '#ffd860';
      const ring = atlas('ring', col); if (!ring) continue;
      const s = 58 + i * 12 + Math.sin(this.t * 3 + i) * 4;
      ctx.globalAlpha = 0.35 * Math.min(1, b.t);
      ctx.drawImage(ring, x - s, y - s * 0.3, s * 2, s * 0.6);
      if (Math.random() < 0.25) this.fx.parts.add({ x: h.x + (Math.random() - 0.5) * 70, y: y - Math.random() * 20, vy: -60 - Math.random() * 40, life: 0.8, s: 3, img: atlas('spark', col), drag: 0.4 });
      i++;
    }
    ctx.restore();
  }

  // ---------------- 弾と範囲
  drawProj(ctx, pr) {
    // 計算の合間をなめらかに（次の計算までの時間ぶん先へ）
    const ahead = Math.min(0.05, this.game.acc || 0);
    const x = this.sx(pr.x + pr.vx * ahead); const y = this.sy(pr.y + pr.vy * ahead, pr.z);
    if (x < -100 || x > VIEW_W + 100) return;
    if (sceneHooks.projectile && sceneHooks.projectile !== MY_PROJ && sceneHooks.projectile(this, ctx, pr, x, y)) return;
    MY_PROJ(this, ctx, pr, x, y);
  }

  drawArea(ctx, a) {
    const x = this.sx(a.x); const y = this.sy(a.y);
    if (x < -400 || x > VIEW_W + 400) return;
    if (sceneHooks.area && sceneHooks.area !== MY_AREA && sceneHooks.area(this, ctx, a, x, y)) return;
    MY_AREA(this, ctx, a, x, y);
  }

  // ---------------- 出来事 → 演出
  consumeFx(c) {
    const fx = c.fx;
    if (!fx.length) return;
    c.fx = [];
    for (const e of fx) {
      for (const f of sceneHooks.onFx) { try { f(this, e); } catch (err) { console.error(err); } }
      this.fx.handle(e);
      const custom = sceneHooks.fx[e.t];
      if (custom) { try { custom(this, e); } catch (err) { console.error(err); } }
    }
  }

  // 互換のため（古い呼び出し）
  burst(x, y, z, col, n, speed) { this.fx.burst(x, this.sy(y, z), col, n, speed, { kind: 'spark' }); }
  particle(x, y, o) { this.fx.parts.add({ x: x + this.camX, y, vx: o.vx, vy: o.vy, life: o.life, s: o.r || 3, img: atlas('glow', o.col || '#fff'), g: o.g }); }
  label(ctx, x, y, text, col = '#fff', size = 14) { fxLabel(ctx, x, y, text, col, size); }

  // ---------------- 上に重ねる物（ボスのライフ・知らせ）
  drawOverlay(ctx) {
    const w = this.game.sys.world;
    if (w.bossUnit && !w.bossUnit.dead) {
      const b = w.bossUnit;
      const v = this.visOf(b);
      const bw = 640; const x = (VIEW_W - bw) / 2; const y = 30;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 6, y - 6, bw + 12, 30);
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.strokeRect(x - 6, y - 6, bw + 12, 30);
      ctx.fillStyle = '#3a0808'; ctx.fillRect(x, y, bw, 18);
      ctx.fillStyle = 'rgba(255,240,220,0.8)'; ctx.fillRect(x, y, bw * clamp(v.chip, 0, 1), 18);
      if (!this.bossGrad) { const gr = ctx.createLinearGradient(0, y, 0, y + 18); gr.addColorStop(0, '#ff5a3a'); gr.addColorStop(0.5, '#c81e1e'); gr.addColorStop(1, '#6a0a0a'); this.bossGrad = gr; }
      ctx.fillStyle = this.bossGrad; ctx.fillRect(x, y, bw * clamp(b.life / b.maxLife, 0, 1), 18);
      for (let i = 1; i < 10; i++) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + (bw / 10) * i, y, 1, 18); }
      // 角の飾り
      ctx.fillStyle = '#c8a050'; for (const sx of [x - 10, x + bw + 10]) { ctx.beginPath(); ctx.moveTo(sx, y + 9 - 12); ctx.lineTo(sx + 8, y + 9); ctx.lineTo(sx, y + 9 + 12); ctx.lineTo(sx - 8, y + 9); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      fxLabel(ctx, VIEW_W / 2, y + 15, `${b.name}　${fmt(Math.max(0, b.life))} / ${fmt(b.maxLife)}`, '#fff', 15);
      const tl = Math.max(0, w.bossTimer);
      if (tl > 0) fxLabel(ctx, VIEW_W / 2, y + 50, `残り ${fmtClock(tl)}`, tl < 10 ? '#ff6060' : '#ffd080', 20);
    }
    if (w.banner && !(w.banner.boss && this.fx.bossCard)) {
      const k = w.banner.t;
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
      const y = 150;
      const gr = ctx.createLinearGradient(0, y - 34, 0, y + 20);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, y - 34, VIEW_W, 56);
      const col = w.banner.bad ? '#ff7070' : w.banner.good ? '#ffe070' : w.banner.boss ? '#ff9050' : '#f0e6d0';
      ctx.strokeStyle = col; ctx.globalAlpha *= 0.6; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 260, y + 12); ctx.lineTo(VIEW_W / 2 + 260, y + 12); ctx.stroke();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = '800 28px "Shippori Mincho B1", "M PLUS 1p", serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(w.banner.text, VIEW_W / 2, y); ctx.fillStyle = col; ctx.fillText(w.banner.text, VIEW_W / 2, y);
      ctx.restore();
    }
  }
}

/** 奥から順（同じ深さなら主人公を手前に、大きなボスを奥に） */
// 奥から順に描く。ボスはいつも主人公より奥（大きな体で主人公を隠さない）
function depthOrder(a, b) { return (a.y + (a.kind === 'hero' ? 24 : 0) - (a.boss ? 80 : 0)) - (b.y + (b.kind === 'hero' ? 24 : 0) - (b.boss ? 80 : 0)); }
function SKILL_EL(id) { return SKILL[id]?.element || 'phys'; }

function vignette() {
  const c = makeCanvas(320, 180);
  if (!c) return null;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(160, 99, 54, 160, 99, 190);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  x.fillStyle = g; x.fillRect(0, 0, 320, 180);
  return c;
}

// 空気の粒の作り方
function newAtmos(A, scatter) {
  const z = 0.3 + Math.random() * 1.0;
  const p = { x: Math.random() * (VIEW_W + 120), y: 0, z, par: 0.1 + z * 0.75, vx: 0, vy: 0, s: 2, a: 0.5, ph: 0, life: 6 + Math.random() * 6, seed: Math.random() * 10 };
  const big = z > 1 ? 1.8 : 1;
  switch (A.kind) {
    case 'snow': p.vx = -10 - Math.random() * 20; p.vy = 30 + 40 * z; p.s = (1.5 + Math.random() * 2) * z * big; p.a = 0.8; p.y = scatter ? Math.random() * VIEW_H : -20; break;
    case 'ash': p.vx = -8 - Math.random() * 14; p.vy = 12 + 18 * z; p.s = (1.4 + Math.random() * 1.6) * z * big; p.a = 0.5; p.y = scatter ? Math.random() * VIEW_H : -20; break;
    case 'sand': p.vx = -160 - 140 * z; p.vy = 6 + Math.random() * 10; p.s = (1 + Math.random()) * z * big; p.a = 0.45; p.y = Math.random() * VIEW_H * 0.95; p.life = 3 + Math.random() * 3; break;
    case 'bubble': p.vx = (Math.random() - 0.5) * 10; p.vy = -30 - 40 * z; p.s = (2 + Math.random() * 4) * z * big; p.a = 0.6; p.y = scatter ? Math.random() * VIEW_H : VIEW_H + 20; break;
    case 'ember': case 'blood': p.vx = (Math.random() - 0.5) * 30; p.vy = -30 - 50 * z; p.s = (1.5 + Math.random() * 2.5) * z * big; p.a = 0.9; p.y = scatter ? Math.random() * VIEW_H : VIEW_H + 10; break;
    case 'spore': p.vx = (Math.random() - 0.5) * 16; p.vy = -6 - Math.random() * 10; p.s = (1.5 + Math.random() * 2) * z * big; p.a = 0.8; p.y = Math.random() * VIEW_H; break;
    case 'cloud': p.vx = -20 - 20 * z; p.vy = 0; p.s = (40 + Math.random() * 60) * z; p.a = 0.12; p.y = 300 + Math.random() * 300; p.life = 14 + Math.random() * 10; break;
    case 'steam': p.vx = (Math.random() - 0.5) * 10; p.vy = -20 - Math.random() * 20; p.s = (14 + Math.random() * 20) * z; p.a = 0.14; p.y = scatter ? 300 + Math.random() * 420 : VIEW_H + 20; p.life = 5 + Math.random() * 4; break;
    case 'star': p.vx = -2; p.vy = 0; p.s = (1.5 + Math.random() * 2.5) * z * big; p.a = 0.8; p.y = Math.random() * VIEW_H * 0.85; break;
    default: p.vy = 20; p.y = Math.random() * VIEW_H;
  }
  if (scatter) p.ph = Math.random() * p.life;
  return p;
}
const ATMOS_IMG = new Map();
function atmosImg(A) {
  if (ATMOS_IMG.has(A.kind)) return ATMOS_IMG.get(A.kind);
  const img = A.kind === 'snow' ? atlas('soft', '#ffffff') : A.kind === 'bubble' ? atlas('bubble', '#c8fff8') : A.kind === 'sand' ? atlas('soft', A.col) : A.kind === 'cloud' || A.kind === 'steam' ? atlas('soft', A.col) : A.kind === 'star' ? atlas('spark', A.col) : atlas(A.kind === 'ash' ? 'soft' : 'glow', A.col);
  A.add = ['ember', 'spore', 'star', 'blood'].includes(A.kind);
  ATMOS_IMG.set(A.kind, img);
  return img;
}

// ---------------- 設定の窓に「演出の細かい設定」を足す
settingsHooks.sections.push((ui, root) => {
  const s = ui.game.state.settings;
  const chk = (key, label, def = true) => el('label.chk', [el('input', { type: 'checkbox', checked: (s[key] ?? def) !== false || undefined, onchange: (e) => { s[key] = e.target.checked; } }), ` ${label}`]);
  const slider = el('input', { type: 'range', min: 0, max: 100, step: 5, value: s.fxShake ?? 100, oninput: (e) => { s.fxShake = Number(e.target.value); val.textContent = `${s.fxShake}%`; } });
  const val = el('span.dim', `${s.fxShake ?? 100}%`);
  const sel = el('select', { onchange: (e) => { s.fxDmgMode = e.target.value; } }, [['all', 'すべて'], ['crit', '会心だけ'], ['none', '出さない']].map(([v, l]) => el('option', { value: v, selected: (s.fxDmgMode || 'all') === v || undefined }, l)));
  root.append(el('section.sec', [
    el('h3.sec-title', '演出の細かい設定'),
    el('div.row', ['画面の揺れの強さ ', slider, ' ', val]),
    el('div.row', ['ダメージの数字 ', sel]),
    chk('fxHitStop', '会心・撃破の一瞬の止まり（ヒットストップ）'),
    chk('fxLootSlow', 'レジェンダリー以上のドロップでスローにする'),
    chk('fxFlash', '光のフラッシュ（被弾の白い光・画面の閃き）'),
    chk('fxReduce', '動きを減らす（揺れ・スロー・止まりを切る）', false),
    el('p.dim', '「演出の量」を「少ない」にすると粒が減って軽くなります。'),
  ]));
});
