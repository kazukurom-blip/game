// 戦闘の画面（キャンバス）。背景の視差スクロール・主人公・敵・弾・演出・ダメージの数字・ドロップの光。
// combat.fx を毎フレーム読み出して演出に変える。アート担当がもっと派手にする（fx.js に分けてよい）。

import { assets } from './assets.js';
import { drawHero, heroLook } from './paperdoll.js';
import { ELEMENT_COLORS } from '../data/stats.js';
import { RARITY } from '../data/rarity.js';
import { ACTS } from '../data/world.js';
import { ZONE } from '../data/world.js';
import { fmt } from '../engine/format.js';
import { itemName } from '../game/items.js';
import { BASE } from '../data/items.js';
import { ELITE_AFFIXES } from '../data/monsters.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const GROUND = 560;
const HERO_SCREEN_X = 380;

export const sceneHooks = {
  fx: {}, // type → (scene, e) => void … 演出の追加（アート担当）
  onFx: [], // (scene, e) => void … すべての出来事を受け取る（音など、何人でも登録できる）
  drawFx: [], // (scene, ctx) => void … 毎フレームの追加描画
  projectile: null, // (scene, ctx, pr, sx, sy) => bool … 弾の描き方（true なら描いた）
  area: null, // (scene, ctx, a, sx, sy) => bool
};

export class Scene {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.camX = 0;
    this.shake = 0;
    this.particles = [];
    this.texts = [];
    this.drops = [];
    this.flashes = [];
    this.t = 0;
    this.dpr = 1;
    this.lookCache = null;
    this.lookVer = -1;
    this.resize();
    game.events.on('gearChanged', () => { this.lookCache = null; });
    assets.onChange(() => { this.lookCache = null; });
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

  frame(dt) {
    const g = this.game;
    if (!g.state || !g.combat.hero) return;
    this.t += dt;
    const ctx = this.ctx;
    const c = g.combat;
    const h = c.hero;
    // カメラ
    const target = h.x - HERO_SCREEN_X;
    this.camX += (target - this.camX) * Math.min(1, dt * 6);
    this.consumeFx(c);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    let shx = 0; let shy = 0;
    if (this.shake > 0 && this.settings.shake !== false) { shx = (Math.random() - 0.5) * this.shake * 2; shy = (Math.random() - 0.5) * this.shake * 2; this.shake = Math.max(0, this.shake - dt * 30); }
    ctx.translate(shx, shy);
    this.drawBackground(ctx);
    // 地面の効果
    for (const a of c.areas) this.drawArea(ctx, a);
    // キャラを奥から順に
    const list = c.units.slice().sort((a, b) => a.y - b.y);
    for (const u of list) this.drawUnit(ctx, u);
    for (const pr of c.projs) this.drawProj(ctx, pr);
    this.drawDrops(ctx, dt);
    this.drawParticles(ctx, dt);
    for (const f of sceneHooks.drawFx) f(this, ctx, dt);
    this.drawTexts(ctx, dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawOverlay(ctx, dt);
  }

  // ---------------- 背景
  drawBackground(ctx) {
    const g = this.game;
    const z = ZONE[g.state.world.zone];
    const act = z ? z.act : ACTS[0].id;
    const id = `bg.${act}`;
    const far = assets.sprite(id);
    const fw = far.sw;
    ctx.fillStyle = '#0c0a10';
    ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
    // 一番奥: ゆっくり
    this.tile(ctx, far, this.camX * 0.08, 0, fw, far.sh);
    const mid = assets.sprite(`${id}.mid`);
    this.tile(ctx, mid, this.camX * 0.35, 0, mid.sw, mid.sh);
    const gr = assets.sprite(`${id}.ground`);
    this.tile(ctx, gr, this.camX, GROUND - 40, gr.sw, gr.sh);
    // 暗い縁
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.55, VIEW_H * 0.3, VIEW_W / 2, VIEW_H * 0.55, VIEW_W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  tile(ctx, spr, offset, y, w, h) {
    if (!spr?.img || w <= 0) return;
    const start = -((offset % w) + w) % w;
    for (let x = start; x < VIEW_W; x += w) ctx.drawImage(spr.img, 0, 0, spr.img.width / (spr.frames || 1), spr.img.height, Math.floor(x), y, Math.ceil(w) + 1, h);
  }

  // ---------------- キャラ
  drawUnit(ctx, u) {
    const x = this.sx(u.x); const y = this.sy(u.y);
    if (x < -300 || x > VIEW_W + 300) return;
    if (u.kind === 'hero') {
      if (!this.lookCache) this.lookCache = heroLook(this.game.state);
      drawHero(ctx, u, x, y, { look: this.lookCache, t: this.t, scale: 1 });
      if (u.dead) this.label(ctx, x, y - 230, '復活まで…', '#ff8a8a');
      return;
    }
    const s = assets.sprite(u.art);
    const size = u.size || 1;
    const a = u.anim || { s: 'idle', t: 0 };
    let dx = 0; let dy = 0; let rot = 0; let sx = 1; let sy = 1; let alpha = 1;
    const flying = u.z > 0;
    if (a.s === 'walk') { dy = -Math.abs(Math.sin(a.t * 8)) * 4; rot = Math.sin(a.t * 8) * 0.04; }
    else if (a.s === 'attack') { const k = Math.min(1, a.t / 0.35); dx = (u.face || -1) * (k < 1 ? -6 * k : 18 * Math.sin(Math.min(1, (a.t - 0.35) / 0.25) * Math.PI)); sy = 1 - 0.05 * Math.sin(k * Math.PI); }
    else if (a.s === 'die') { alpha = Math.max(0, 1 - u.deadT / 1.0); sy = 1 - Math.min(0.5, u.deadT * 0.8); sx = 1 + Math.min(0.3, u.deadT * 0.5); }
    else { const b = Math.sin(this.t * 3 + u.id); dy = b * 2; sy = 1 + b * 0.02; }
    if (flying) dy += Math.sin(this.t * 4 + u.id) * 8 - u.z;
    // 影
    ctx.save(); ctx.globalAlpha = 0.35 * alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y, 34 * size, 8 * size, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // エリートの光
    if (u.rank !== 'normal' && u.kind === 'monster' && !u.dead) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const col = u.boss ? '#ff4040' : u.rank === 'rare' ? '#ffd040' : '#6aa0ff';
      const gr = ctx.createRadialGradient(x, y - 60 * size, 10, x, y - 60 * size, 90 * size);
      gr.addColorStop(0, `${col}55`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 100 * size, y - 160 * size, 200 * size, 200 * size);
      ctx.restore();
    }
    const flip = u.team === 'hero' ? (u.face || 1) < 0 : (u.face || -1) > 0;
    assets.draw(ctx, s, x + dx, y + dy, { scale: size, sx, sy, rot, alpha, flip });
    if (u.hitFlash > 0 && !u.dead) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, u.hitFlash * 8) * 0.6;
      assets.draw(ctx, s, x + dx, y + dy, { scale: size, sx, sy, rot, flip });
      ctx.restore();
    }
    // 状態異常の色
    const st = u.statuses;
    if (!u.dead && (st.freeze?.t > 0 || st.chill?.t > 0)) { ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#9ae8ff'; ctx.beginPath(); ctx.ellipse(x, y - s.sh * size * 0.45, s.sw * size * 0.35, s.sh * size * 0.45, 0, 0, 7); ctx.fill(); ctx.restore(); }
    if (!u.dead && (st.ignite?.t > 0) && Math.random() < 0.4) this.particle(x + (Math.random() - 0.5) * 40 * size, y - Math.random() * 80 * size, { col: '#ff8a2a', vy: -60, life: 0.5, r: 4 });
    if (!u.dead && (st.poison?.stacks?.length) && Math.random() < 0.3) this.particle(x + (Math.random() - 0.5) * 40 * size, y - Math.random() * 60 * size, { col: '#7cff5a', vy: -30, life: 0.6, r: 3 });
    // ライフの棒
    if (!u.dead && u.kind === 'monster' && !u.boss && (u.life < u.maxLife || u.rank !== 'normal')) {
      const bw = 60 * Math.max(0.8, size); const top = y - s.sh * size - 14 + (flying ? -u.z : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2 - 1, top - 1, bw + 2, 7);
      ctx.fillStyle = u.rank === 'normal' ? '#d33' : u.rank === 'rare' ? '#ffcc33' : '#5a9cff';
      ctx.fillRect(x - bw / 2, top, bw * Math.max(0, u.life / u.maxLife), 5);
      if (u.rank !== 'normal') {
        const names = (u.elite || []).map((id) => ELITE_NAME[id] || '').join('・');
        this.label(ctx, x, top - 8, `${names ? `${names}の` : ''}${u.name}`, u.rank === 'rare' ? '#ffd860' : '#8ab8ff', 13);
      }
    }
    if (u.kind === 'minion' && !u.dead && u.life < u.maxLife) {
      const bw = 40; const top = y - s.sh * size - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, top, bw, 4);
      ctx.fillStyle = '#5ad05a'; ctx.fillRect(x - bw / 2, top, bw * u.life / u.maxLife, 4);
    }
  }

  label(ctx, x, y, text, col = '#fff', size = 14) {
    ctx.save();
    ctx.font = `bold ${size}px "M PLUS 1p", "Hiragino Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ---------------- 弾と範囲
  drawProj(ctx, pr) {
    const x = this.sx(pr.x); const y = this.sy(pr.y, pr.z);
    if (sceneHooks.projectile && sceneHooks.projectile(this, ctx, pr, x, y)) return;
    const ang = Math.atan2(pr.vy * 2, pr.vx);
    if (assets.isCustom(pr.art)) { assets.draw(ctx, pr.art, x, y, { rot: ang, t: pr.t }); return; }
    const col = ELEMENT_COLORS[pr.el] || '#fff';
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalCompositeOperation = 'lighter';
    const len = 34 * (pr.size || 1);
    const gr = ctx.createLinearGradient(-len, 0, 10, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col);
    ctx.fillStyle = gr; ctx.fillRect(-len, -4, len + 10, 8);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, 0, 5, 0, 7); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.5) this.particle(x, y, { col, life: 0.25, r: 3, vx: -pr.vx * 0.05, vy: 0 });
  }

  drawArea(ctx, a) {
    const x = this.sx(a.x); const y = this.sy(a.y);
    if (sceneHooks.area && sceneHooks.area(this, ctx, a, x, y)) return;
    const col = a.team === 'hero' ? (ELEMENT_COLORS[a.el] || '#fff') : '#ff3030';
    ctx.save();
    if (!a.fired) {
      // 予告の円
      const k = Math.min(1, a.t / Math.max(0.01, a.delay));
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, a.r, a.r * 0.35, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.25 * k; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, a.r * k, a.r * 0.35 * k, 0, 0, 7); ctx.fill();
    } else if (a.dur) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.1 * Math.sin(this.t * 10);
      if (assets.isCustom(a.art)) assets.draw(ctx, a.art, x, y - a.r * 0.2, { w: a.r * 2, h: a.r * 2, t: a.t });
      else { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, a.r, a.r * 0.35, 0, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  // ---------------- 出来事 → 演出
  consumeFx(c) {
    const fx = c.fx;
    if (!fx.length) return;
    c.fx = [];
    const s = this.settings;
    let dmgShown = 0;
    for (const e of fx) {
      for (const f of sceneHooks.onFx) { try { f(this, e); } catch (err) { console.error(err); } }
      const custom = sceneHooks.fx[e.t];
      if (custom) { try { custom(this, e); } catch (err) { console.error(err); } }
      switch (e.t) {
        case 'dmg':
          if (s.dmgNumbers === false) break;
          if (dmgShown++ > 40) break;
          this.texts.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y, z: e.z || 80, text: fmt(e.v), col: e.team === 'hero' ? '#ff5050' : e.crit ? '#ffd040' : (e.dot ? (ELEMENT_COLORS[e.el] || '#ddd') : (e.el === 'phys' ? '#ffffff' : ELEMENT_COLORS[e.el])), size: e.crit ? 30 : e.dot ? 15 : 20, life: e.crit ? 1.0 : 0.8, t: 0, crit: e.crit, vy: -70 });
          break;
        case 'text': this.texts.push({ x: e.x, y: e.y, z: e.z || 100, text: e.text, col: e.color || '#fff', size: 18, life: 0.9, t: 0, vy: -50 }); break;
        case 'hit': this.burst(e.x, e.y, e.z || 50, ELEMENT_COLORS[e.el] || '#fff', 6, 140); break;
        case 'swing': this.flashes.push({ kind: 'swing', x: e.x, y: e.y, el: e.el, t: 0, life: 0.22, r: e.r || 60, enemy: e.enemy, skill: e.skill }); break;
        case 'nova': this.flashes.push({ kind: 'nova', x: e.x, y: e.y, el: e.el, t: 0, life: 0.4, r: e.r, skill: e.skill }); this.burst(e.x, e.y, 30, ELEMENT_COLORS[e.el] || '#fff', e.small ? 8 : 24, 300); break;
        case 'pulse': if (e.team === 'hero') { this.flashes.push({ kind: 'nova', x: e.x, y: e.y, el: e.el, t: 0, life: 0.3, r: e.r, skill: e.skill }); } else { this.burst(e.x, e.y, 10, '#ff4040', 12, 200); } break;
        case 'chain': this.flashes.push({ kind: 'chain', pts: e.pts, el: e.el, t: 0, life: 0.25 }); break;
        case 'death': this.burst(e.unit.x, e.unit.y, 50 * (e.unit.size || 1), e.unit.def?.palette?.main || '#888', e.unit.boss ? 60 : 14, 220); if (e.unit.boss) this.shake = Math.max(this.shake, 10); break;
        case 'shake': this.shake = Math.max(this.shake, e.power || 3); break;
        case 'gold': this.drops.push({ kind: 'gold', x: e.x, y: e.y, t: 0, life: 1.0, v: e.v }); break;
        case 'loot': this.addLoot(e); break;
        case 'levelup': this.flashes.push({ kind: 'level', t: 0, life: 1.6, paragon: e.paragon }); this.burst(c.hero.x, c.hero.y, 60, '#ffe080', 40, 260); break;
        case 'summon': this.burst(e.x, e.y, 20, '#b080ff', 16, 120); break;
        case 'buff': this.burst(e.unit.x, e.unit.y, 60, ELEMENT_COLORS[e.el] || '#fff', 18, 160); break;
        case 'boss': this.shake = Math.max(this.shake, 6); break;
        default: break;
      }
    }
  }

  addLoot(e) {
    const it = e.item;
    const r = RARITY[it.rarity];
    if (!r) return;
    if (e.where === 'salvaged' && r.idx < 2) return; // 自動分解のノーマル・マジックは光らせない
    const icon = BASE[it.base]?.icon || 'icon.item.sword';
    this.drops.push({ kind: 'item', x: e.x, y: e.y, t: 0, life: r.idx >= 4 ? 3.2 : 2.0, r, icon, name: itemName(it), salvaged: e.where === 'salvaged', q: it.q });
    if (r.idx >= 4) this.shake = Math.max(this.shake, 4);
  }

  burst(x, y, z, col, n, speed) {
    const lim = this.settings.fx === 'low' ? 0.3 : this.settings.fx === 'mid' ? 0.6 : 1;
    n = Math.ceil(n * lim);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const v = speed * (0.3 + Math.random() * 0.7);
      this.particle(this.sx(x), this.sy(y, z), { col, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 40, life: 0.3 + Math.random() * 0.4, r: 2 + Math.random() * 3, g: 300 });
    }
  }

  /** 画面座標のパーティクル */
  particle(x, y, o) {
    if (this.particles.length > 900) return;
    this.particles.push({ x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.5, t: 0, r: o.r || 3, col: o.col || '#fff', g: o.g || 0, cam: this.camX });
  }

  drawParticles(ctx, dt) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      if (k <= 0) continue;
      const x = p.x - (this.camX - p.cam);
      ctx.globalAlpha = k; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(x, p.y, p.r * (0.5 + k * 0.5), 0, 7); ctx.fill();
    }
    ctx.restore();
    this.particles = this.particles.filter((p) => p.t < p.life);
    // 斬撃・爆発・連鎖
    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const col = f.enemy ? '#ff6060' : (ELEMENT_COLORS[f.el] || '#fff');
      if (f.kind === 'swing') {
        const x = this.sx(f.x); const y = this.sy(0) - 60 + (f.y || 0) * 0.9;
        const id = f.skill ? `fx.${f.skill}.swing` : null;
        if (id && assets.isCustom(id)) assets.draw(ctx, id, x, y, { alpha: 1 - k, scale: 0.8 + k * 0.4, t: f.t });
        else { ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 10 * (1 - k) + 2; ctx.beginPath(); ctx.arc(x - 20, y + 10, (f.r || 60) * 0.7 + 30 * k, -1.6 + k, 0.9 + k); ctx.stroke(); }
      } else if (f.kind === 'nova') {
        const x = this.sx(f.x); const y = this.sy(f.y || 0);
        const id = f.skill ? `fx.${f.skill}.area` : null;
        if (id && assets.isCustom(id)) assets.draw(ctx, id, x, y - f.r * 0.2, { w: f.r * 2 * (0.6 + 0.4 * k), h: f.r * 2 * (0.6 + 0.4 * k), alpha: 1 - k, t: f.t });
        else { ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = col; ctx.lineWidth = 14 * (1 - k) + 2; ctx.beginPath(); ctx.ellipse(x, y, f.r * (0.3 + 0.7 * k), f.r * 0.35 * (0.3 + 0.7 * k), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = (1 - k) * 0.25; ctx.fillStyle = col; ctx.fill(); }
      } else if (f.kind === 'chain') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
        f.pts.forEach((p, i) => { const x = this.sx(p.x) + (Math.random() - 0.5) * 8; const y = this.sy(p.y || 0, p.z || 50) + (Math.random() - 0.5) * 8; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      } else if (f.kind === 'level') {
        const h = this.game.combat.hero;
        const x = this.sx(h.x); const y = this.sy(h.y);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe080'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x, y, 60 + 80 * k, 20 + 26 * k, 0, 0, 7); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        this.label(ctx, x, y - 230 - 30 * k, f.paragon ? `パラゴン ${f.paragon}` : 'LEVEL UP!', '#ffe080', 30);
      }
      ctx.restore();
    }
    this.flashes = this.flashes.filter((f) => f.t < f.life);
  }

  drawDrops(ctx, dt) {
    const s = this.settings;
    for (const d of this.drops) {
      d.t += dt;
      const x = this.sx(d.x); const y = this.sy(d.y || 0);
      const k = d.t / d.life;
      if (k >= 1) continue;
      if (d.kind === 'gold') {
        const jump = Math.sin(Math.min(1, d.t * 3) * Math.PI) * 40;
        ctx.save(); ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(x, y - 10 - jump, 6, 0, 7); ctx.fill();
        ctx.restore();
        continue;
      }
      const jump = Math.sin(Math.min(1, d.t * 2.5) * Math.PI) * 70;
      const col = d.r.color;
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
      if (d.r.beam && s.lootBeams !== false) {
        // 光の柱
        ctx.globalCompositeOperation = 'lighter';
        const bh = 160 + d.r.beam * 90;
        const gr = ctx.createLinearGradient(0, y - bh, 0, y);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col);
        ctx.fillStyle = gr; ctx.globalAlpha *= 0.5 + 0.2 * Math.sin(this.t * 8);
        const bw = 10 + d.r.beam * 6;
        ctx.fillRect(x - bw / 2, y - bh, bw, bh);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
      assets.draw(ctx, d.icon, x, y - 22 - jump, { w: 40, h: 40 });
      if (d.r.idx >= 2) this.label(ctx, x, y - 54 - jump, `${d.q === 2 ? '原初の' : d.q === 1 ? '太古の' : ''}${d.name}${d.salvaged ? '（分解）' : ''}`, col, d.r.idx >= 4 ? 16 : 13);
      ctx.restore();
    }
    this.drops = this.drops.filter((d) => d.t < d.life);
  }

  drawTexts(ctx, dt) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const tx of this.texts) {
      tx.t += dt;
      const k = tx.t / tx.life;
      if (k >= 1) continue;
      const x = this.sx(tx.x); const y = this.sy(tx.y || 0, tx.z) + tx.vy * tx.t;
      const pop = tx.crit ? 1 + 0.6 * Math.max(0, 1 - tx.t * 6) : 1;
      ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      ctx.font = `900 ${Math.round(tx.size * pop)}px "M PLUS 1p", Impact, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(tx.text, x, y);
      ctx.fillStyle = tx.col; ctx.fillText(tx.text, x, y);
    }
    ctx.restore();
    this.texts = this.texts.filter((tx) => tx.t < tx.life);
    if (this.texts.length > 120) this.texts.splice(0, this.texts.length - 120);
  }

  // ---------------- 上に重ねる物（ボスのライフ・知らせ）
  drawOverlay(ctx) {
    const w = this.game.sys.world;
    if (w.bossUnit && !w.bossUnit.dead) {
      const b = w.bossUnit;
      const bw = 640; const x = (VIEW_W - bw) / 2; const y = 28;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 4, y - 4, bw + 8, 26);
      ctx.fillStyle = '#5a0a0a'; ctx.fillRect(x, y, bw, 18);
      ctx.fillStyle = '#e02a2a'; ctx.fillRect(x, y, bw * Math.max(0, b.life / b.maxLife), 18);
      this.label(ctx, VIEW_W / 2, y + 15, `${b.name}　${fmt(Math.max(0, b.life))} / ${fmt(b.maxLife)}`, '#fff', 15);
      const tl = Math.max(0, w.bossTimer);
      this.label(ctx, VIEW_W / 2, y + 48, `残り ${Math.ceil(tl)} 秒`, tl < 10 ? '#ff6060' : '#ffd080', 20);
    }
    if (w.banner) {
      const k = w.banner.t;
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
      const y = 150;
      const gr = ctx.createLinearGradient(0, y - 34, 0, y + 20);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, y - 34, VIEW_W, 56);
      this.label(ctx, VIEW_W / 2, y, w.banner.text, w.banner.bad ? '#ff7070' : w.banner.good ? '#ffe070' : w.banner.boss ? '#ff9050' : '#f0e6d0', 28);
      ctx.restore();
    }
  }
}

const ELITE_NAME = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a.name]));
