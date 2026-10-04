// 弾・魔法弾。owner: 'player' | 'enemy'
import { calcDamage, damageEnemy, damagePlayer } from '../systems/combat.js';
import { sysFn, reportHits } from '../world/sys.js';
import { spawnEffect } from '../render/effects.js';
import { rectOverlap, entRect } from '../world/physics.js';

export class Projectile {
  /**
   * opts: {owner, x, y, vx, vy | (dir, speed), kind:'bullet'|'magic'|'orb'|'enemyBullet'|'beam'|'shell',
   *        dmg? (固定ダメージ) | atk+mult (calcDamage), crit?, critDmg?, color, range(px), life(s),
   *        pierce(貫通数), gravity(0..1), w, h, knock, effect, hitEffect, onHit(enemy)}
   */
  constructor(game, opts = {}) {
    this.game = game;
    this.owner = opts.owner || 'player';
    this.kind = opts.kind || (this.owner === 'enemy' ? 'enemyBullet' : 'bullet');
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    const dir = opts.dir ?? opts.facing ?? 1;
    const speed = opts.speed ?? (this.kind === 'magic' || this.kind === 'orb' ? 620 : this.owner === 'enemy' ? 520 : 1000);
    this.vx = opts.vx ?? dir * speed;
    this.vy = opts.vy ?? 0;
    this.w = opts.w ?? (this.kind === 'magic' || this.kind === 'orb' ? 22 : 14);
    this.h = opts.h ?? (this.kind === 'magic' || this.kind === 'orb' ? 22 : 8);
    this.dmg = opts.dmg ?? opts.damage ?? null;
    this.atk = opts.atk ?? 10;
    this.mult = opts.mult ?? 1;
    this.crit = opts.crit ?? 0;
    this.critDmg = opts.critDmg ?? 1.5;
    this.color = opts.color || (this.owner === 'enemy' ? '#ff4d4d' : this.kind === 'magic' ? '#9b5de5' : '#ffd166');
    this.range = opts.range ?? 700;
    this.life = opts.life ?? 3;
    this.pierce = opts.pierce ?? 0;
    this.gravity = opts.gravity ?? 0;
    this.knock = opts.knock ?? 160;
    this.hitEffect = opts.hitEffect || opts.effect || (this.kind === 'magic' ? 'spark' : 'hit');
    this.onHit = opts.onHit || null;
    this.hits = new Set();
    this.traveled = 0;
    this.t = 0;
    this.remove = false;
    this.dead = false;
    this.trail = [];
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.vy += 2200 * this.gravity * dt;
    const dx = this.vx * dt, dy = this.vy * dt;
    this.x += dx; this.y += dy;
    this.traveled += Math.hypot(dx, dy);
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    const map = g.map;
    if (this.t > this.life || this.traveled > this.range || !map ||
        this.x < -50 || this.x > map.width + 50 || this.y > map.groundY || this.y < -200) {
      if (map && this.y > map.groundY) spawnEffect(g, 'spark', this.x, map.groundY);
      return this.kill();
    }
    for (const w of map.walls || []) {
      if (this.x > w.x && this.x < w.x + w.w && this.y > w.y && this.y < w.y + w.h) {
        spawnEffect(g, 'spark', this.x, this.y);
        return this.kill();
      }
    }
    const r = { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };

    if (this.owner === 'player') {
      for (const e of g.enemies) {
        if (e.dead || e.remove || this.hits.has(e) || e.hp <= 0) continue;
        if (!rectOverlap(r, entRect(e))) continue;
        this.hits.add(e);
        let dmg = this.dmg, crit = false;
        if (dmg == null) {
          const res = calcDamage(this.atk, this.mult, e.def?.def ?? 0, this.crit, this.critDmg);
          dmg = res.dmg; crit = res.crit;
        } else if (typeof dmg === 'object') { crit = !!dmg.crit; dmg = dmg.dmg; }
        else crit = this.crit === true;
        damageEnemy(g, e, dmg, crit, Math.sign(this.vx) || 1);
        spawnEffect(g, crit ? 'critHit' : this.hitEffect, this.x, this.y, { color: this.color });
        if (this.onHit) this.onHit(e);
        // ファイナルアタック（通常攻撃・スキルの弾。市民には出さない）＋コンボ
        if (!e.civilian) { const fa = sysFn('tryFinalAttack', g); if (fa) { try { fa(g, [e]); } catch (err) { /* noop */ } } }
        reportHits(g, [e]);
        if (this.pierce-- <= 0) return this.kill();
      }
    } else {
      const p = g.player;
      if (p && !p.dead && g.state && g.state.hp > 0) {
        const pr = p.inVehicle ? entRect(p.inVehicle) : entRect(p);
        if (rectOverlap(r, pr)) {
          if (!(p.invulnT > 0)) {
            const amt = this.dmg ?? this.atk;
            damagePlayer(g, p.inVehicle ? Math.ceil(amt * 0.5) : amt, this.x - this.vx * 0.01);
          }
          spawnEffect(g, 'hit', this.x, this.y, { color: this.color });
          return this.kill();
        }
      }
    }
  }

  kill() { this.remove = true; this.dead = true; }

  draw(ctx) {
    ctx.save();
    if (this.kind === 'heart' || this.kind === 'star') {
      const r = Math.max(this.w, this.h) / 2 + 2;
      for (let i = 0; i < this.trail.length; i++) {
        const tp = this.trail[i];
        ctx.globalAlpha = (i + 1) / this.trail.length * 0.3;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.kind === 'star' ? this.t * 12 : Math.sin(this.t * 20) * 0.2);
      ctx.shadowColor = this.color; ctx.shadowBlur = 14;
      ctx.fillStyle = this.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (this.kind === 'star') {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
      } else {
        ctx.moveTo(0, r * 0.8);
        ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35);
        ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.8);
      }
      ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
    if (this.kind === 'shockwave') {
      ctx.translate(this.x, this.y);
      const dir = Math.sign(this.vx) || 1;
      ctx.scale(dir, 1);
      const hw = this.w / 2, hh = this.h / 2;
      ctx.shadowColor = this.color; ctx.shadowBlur = 20;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.85 - i * 0.25;
        ctx.strokeStyle = i === 0 ? '#fff' : this.color;
        ctx.lineWidth = 6 - i * 1.5;
        ctx.beginPath();
        ctx.ellipse(-i * 16, 0, hw * 0.45, hh * (1 - i * 0.12), 0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (this.kind === 'magic' || this.kind === 'orb') {
      const rr = this.w / 2;
      for (let i = 0; i < this.trail.length; i++) {
        const tp = this.trail[i];
        ctx.globalAlpha = (i + 1) / this.trail.length * 0.35;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, rr * (0.4 + i / this.trail.length * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const gr = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, rr * 1.6);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.35, this.color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(this.x, this.y, rr * 1.6, 0, Math.PI * 2); ctx.fill();
      // 回転する星きらめき
      ctx.translate(this.x, this.y); ctx.rotate(this.t * 10);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-rr, 0); ctx.lineTo(rr, 0); ctx.moveTo(0, -rr); ctx.lineTo(0, rr); ctx.stroke();
    } else {
      const ang = Math.atan2(this.vy, this.vx);
      ctx.translate(this.x, this.y); ctx.rotate(ang);
      ctx.shadowColor = this.color; ctx.shadowBlur = 10;
      const len = Math.max(this.w, 18);
      const lg = ctx.createLinearGradient(-len * 1.6, 0, len / 2, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(1, this.color);
      ctx.fillStyle = lg;
      ctx.fillRect(-len * 1.6, -this.h / 4, len * 1.6, this.h / 2);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, 0, len / 3, this.h / 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
