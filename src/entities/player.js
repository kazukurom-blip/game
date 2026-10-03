// プレイヤー（メイプル風操作）
import { drawCharacter, HERO_LOOKS } from '../render/character.js';
import { spawnEffect } from '../render/effects.js';
import { computeStats } from '../systems/progression.js';
import { getEquipLooks, useItem } from '../systems/inventory.js';
import { useSkill } from '../systems/skills.js';
import { playerAttackArea } from '../systems/combat.js';
import { getItem } from '../data/items.js';
import { moveAndCollide, findRope, entRect } from '../world/physics.js';
import { Projectile } from './projectile.js';

const CLIMB_SPEED = 190;
const BASE_SPEED = 240;
const BASE_JUMP = 860;

// computeStats の単位ゆれ吸収
function normSpeed(v) { if (!(v > 0)) return BASE_SPEED; return v > 20 ? v : v * BASE_SPEED; }
function normJump(v) { if (!(v > 0)) return BASE_JUMP; return v > 100 ? v : v * BASE_JUMP; }
function normAtkSpeed(v) { if (!(v > 0)) return 2; return v; } // 1秒あたりの攻撃回数

export class Player {
  constructor(game) {
    this.game = game;
    this.x = game.map?.spawnX ?? 200;
    this.y = game.map?.groundY ?? 1000;
    this.w = 32; this.h = 70;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.groundPlat = null;
    this.climbing = null;       // ロープ {x, top, bottom} | null
    this.ropeCd = 0;
    this.dropThrough = 0;
    this.invulnT = 0;
    this.hurtT = 0;
    this.dead = false;
    this.deadT = 0;
    this.inVehicle = null;
    this.attackT = 0;           // 0..1 進捗（drawCharacter 用）
    this.attackDur = 0;
    this.attackLeft = 0;        // 残り時間
    this.attackKind = null;
    this.attackCd = 0;
    this.t = 0;
    this.regenT = 0;
    this.lastHitT = 0;
    this.anim = { facing: 1, state: 'idle', t: 0, attackT: 0, damage: 0, flash: false, alpha: 1 };
    this.stats = this.refreshStats();
    this._unsub = [];
    const ev = game.events;
    if (ev) {
      this._unsub.push(ev.on('playerDamaged', () => { this.hurtT = 0.35; this.lastHitT = this.t; }));
    }
  }

  destroy() { for (const u of this._unsub) u && u(); this._unsub = []; }

  get state() { return this.game.state; }
  get hp() { return this.game.state?.hp ?? 0; }
  get mp() { return this.game.state?.mp ?? 0; }

  refreshStats() {
    const s = this.game.state;
    if (!s) return this.stats || {};
    this.stats = computeStats(s) || {};
    return this.stats;
  }

  getAttackRect(range) {
    const st = this.stats || {};
    const wt = st.weaponType;
    const r = range ?? (wt === 'melee' ? (st.range || 80) : 60);
    const reach = Math.max(40, r);
    const x = this.facing > 0 ? this.x - 8 : this.x - reach + 8;
    return { x, y: this.y - this.h - 12, w: reach, h: this.h + 24 };
  }

  canControl() {
    const g = this.game;
    if (this.dead || !(g.state && g.state.hp > 0)) return false;
    if (g.ui && g.ui.isModal && g.ui.isModal()) return false;
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.game, inp = g.input, s = g.state;
    if (!s || !g.map) return;
    this.t += dt;
    const st = this.refreshStats();
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.ropeCd > 0) this.ropeCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackLeft > 0) {
      this.attackLeft -= dt;
      this.attackT = this.attackDur > 0 ? Math.min(1, 1 - this.attackLeft / this.attackDur) : 1;
      if (this.attackLeft <= 0) { this.attackKind = null; this.attackT = 0; }
    }
    // HP/MP 上限
    if (st.maxHp && s.hp > st.maxHp) s.hp = st.maxHp;
    if (st.maxMp && s.mp > st.maxMp) s.mp = st.maxMp;

    // --- 死亡 ---
    if (s.hp <= 0 || this.dead) {
      if (!this.dead) { this.dead = true; this.deadT = 0; if (this.inVehicle) this.inVehicle.exit(this); }
      this.deadT += dt;
      this.climbing = null;
      this.vx *= 0.9;
      moveAndCollide(this, g.map, dt);
      this.updateAnim(dt);
      return;
    }
    this.dead = false;

    // --- 自然回復 ---
    this.regenT += dt;
    if (this.regenT >= 1) {
      this.regenT -= 1;
      if (st.maxMp) s.mp = Math.min(st.maxMp, s.mp + Math.max(1, Math.round(st.maxMp * 0.02)));
      if (st.maxHp && this.t - this.lastHitT > 6) s.hp = Math.min(st.maxHp, s.hp + Math.max(1, Math.round(st.maxHp * 0.01)));
    }

    const ctrl = this.canControl();

    // --- 乗車中 ---
    if (this.inVehicle) {
      const v = this.inVehicle;
      if (v.remove || !g.vehicles.includes(v)) { this.inVehicle = null; }
      else {
        if (ctrl && inp.pressed('interact')) { v.exit(this); }
        else if (ctrl && inp.pressed('up')) { if (this.tryPortal()) return; }
        this.updateAnim(dt);
        return;
      }
    }

    if (ctrl) this.handleActions(dt, st);
    if (this.climbing) this.updateClimb(dt, ctrl);
    else this.updateMove(dt, ctrl, st);

    // 自動吸引（近くの着地済みドロップ）
    this.autoPickup(ctrl && inp.down('pickup'));
    this.updateAnim(dt);
  }

  handleActions(dt, st) {
    const g = this.game, inp = g.input, s = g.state;
    // ポータル（↑）
    if (inp.pressed('up') && this.tryPortal()) return;
    // 会話 / 乗車
    if (inp.pressed('interact')) this.interact();
    // スキル
    const bar = s.skillBar || [];
    for (let i = 0; i < 4; i++) {
      if (inp.pressed('skill' + (i + 1)) && bar[i]) {
        useSkill(g, bar[i]);
      }
    }
    // ポーション
    const pb = s.potionBar || [];
    for (let i = 0; i < 2; i++) {
      if (inp.pressed('potion' + (i + 1)) && pb[i]) useItem(g, pb[i]);
    }
    // 通常攻撃（押しっぱなしで連続）
    if (inp.down('attack') && this.attackCd <= 0 && !this.climbing) this.startAttack('basic');
  }

  tryPortal() {
    const g = this.game;
    for (const p of g.map.portals || []) {
      if (Math.abs(this.x - p.x) < 44 && Math.abs(this.y - p.y) < 90) {
        if (this.inVehicle) this.inVehicle.exit(this);
        spawnEffect(g, 'portal', this.x, this.y - 40);
        g.changeMap(p.to, p.toX);
        return true;
      }
    }
    return false;
  }

  interact() {
    const g = this.game;
    // NPC
    let best = null, bd = 90;
    for (const n of g.npcs) {
      const d = Math.abs(n.x - this.x);
      if (d < bd && Math.abs(n.y - this.y) < 70) { best = n; bd = d; }
    }
    if (best) {
      g.ui.open('dialog', { npc: best });
      g.events.emit('talkNpc', { npcId: best.id });
      return;
    }
    // 車
    let car = null; bd = 110;
    for (const v of g.vehicles) {
      if (v.driverType) continue;
      const d = Math.abs(v.x - this.x);
      if (d < bd && Math.abs(v.y - this.y) < 70) { car = v; bd = d; }
    }
    if (car) { car.enter(this); this.attackLeft = 0; this.attackKind = null; }
  }

  updateMove(dt, ctrl, st) {
    const g = this.game, inp = g.input;
    const speed = normSpeed(st.speed);
    const L = ctrl && inp.down('left'), R = ctrl && inp.down('right');
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    const attacking = this.attackLeft > 0 && this.attackKind !== 'shootMove';

    if (this.onGround) {
      // 地上: 慣性少なめ。攻撃中は足が止まる（メイプル風）
      const target = attacking ? 0 : dir * speed;
      const k = dir ? 18 : 22;
      this.vx += (target - this.vx) * Math.min(1, k * dt);
      if (Math.abs(this.vx) < 2) this.vx = 0;
    } else {
      // 空中制御（弱め）
      if (dir) {
        this.vx += dir * speed * 3.2 * dt;
        this.vx = Math.max(-speed, Math.min(speed, this.vx));
      }
    }
    if (dir && !attacking) this.facing = dir;

    // ロープ掴まり
    if (ctrl && this.ropeCd <= 0) {
      if (inp.down('up')) {
        const r = findRope(g.map, this.x, this.y - 4, 20);
        if (r && this.y > r.top + 4) return this.grabRope(r);
      }
      if (inp.down('down') && this.onGround) {
        const r = findRope(g.map, this.x, this.y + 8, 20);
        if (r && Math.abs(this.y - r.top) < 6) { this.grabRope(r); this.y += 6; return; }
      }
    }

    // ジャンプ / 下抜け
    if (ctrl && inp.pressed('jump') && this.onGround && !attacking) {
      if (inp.down('down') && this.groundPlat && this.groundPlat.solid !== true) {
        this.dropThrough = 0.25;
        this.vy = 60;
        this.onGround = false;
        this.y += 2;
      } else {
        this.vy = -normJump(st.jump);
        this.onGround = false;
        spawnEffect(g, 'dash', this.x, this.y, { small: true, dir: this.facing });
      }
    }

    moveAndCollide(this, g.map, dt);
  }

  grabRope(r) {
    this.climbing = r;
    this.x = r.x;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.attackLeft = 0; this.attackKind = null;
  }

  updateClimb(dt, ctrl) {
    const g = this.game, inp = g.input, r = this.climbing;
    this.x = r.x;
    this.vx = 0; this.vy = 0;
    const up = ctrl && inp.down('up'), down = ctrl && inp.down('down');
    this.climbMoving = up !== down;
    if (up && !down) this.y -= CLIMB_SPEED * dt;
    if (down && !up) this.y += CLIMB_SPEED * dt;
    // ジャンプで離脱（←→併用で横に飛ぶ）
    if (ctrl && inp.pressed('jump')) {
      const d = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (d) {
        this.climbing = null; this.ropeCd = 0.35;
        this.vx = d * normSpeed(this.stats.speed) * 0.8; this.vy = -480; this.facing = d;
        return;
      }
    }
    if (this.y <= r.top) {
      // 上端 → 足場に乗る
      this.y = r.top; this.climbing = null; this.ropeCd = 0.25;
      this.onGround = true; this.vy = 0;
      moveAndCollide(this, g.map, 1 / 240);
      return;
    }
    if (this.y >= r.bottom) {
      this.y = r.bottom; this.climbing = null; this.ropeCd = 0.25;
      moveAndCollide(this, g.map, 1 / 240);
    }
  }

  // ------------------------------------------------------------ 攻撃
  /**
   * kind: 'basic'（通常攻撃: 武器種で近接/射撃/魔法弾を自動判定）
   *       それ以外はアニメのみ（スキルから呼ばれる）: 'melee'|'slash'|'attack'|'shoot'|'gun'|'projectile'|'magic'|'aoe'|'buff'|'dash'
   * opts: {duration}
   */
  startAttack(kind = 'basic', opts = {}) {
    const g = this.game, st = this.stats || {};
    if (this.inVehicle || this.dead) return false;
    if (this.climbing) this.climbing = null;
    const aps = normAtkSpeed(st.attackSpeed);
    const wt = st.weaponType || null;
    const dur = opts.duration ?? Math.max(0.16, Math.min(0.5, 0.9 / aps));
    this.attackDur = dur; this.attackLeft = dur; this.attackT = 0;

    if (kind !== 'basic') {
      this.attackKind = (kind === 'shoot' || kind === 'gun' || kind === 'projectile') ? 'shoot' : 'attack';
      return true;
    }
    this.attackCd = 1 / aps;
    if (wt === 'gun') {
      this.attackKind = 'shoot';
      const ox = this.x + this.facing * 30, oy = this.y - 42;
      g.projectiles.push(new Projectile(g, {
        owner: 'player', kind: 'bullet', x: ox, y: oy, dir: this.facing, speed: 1150,
        atk: st.atk, mult: 1, crit: st.crit, critDmg: st.critDmg, range: st.range || 520, color: '#ffd166',
      }));
      spawnEffect(g, 'muzzle', ox, oy, { dir: this.facing });
    } else if (wt === 'magic') {
      this.attackKind = 'attack';
      const ox = this.x + this.facing * 26, oy = this.y - 46;
      g.projectiles.push(new Projectile(g, {
        owner: 'player', kind: 'magic', x: ox, y: oy, dir: this.facing, speed: 680,
        atk: st.atk, mult: 1.1, crit: st.crit, critDmg: st.critDmg, range: st.range || 420, color: weaponColor(g.state) || '#b388ff',
        pierce: 1,
      }));
      spawnEffect(g, 'spark', ox, oy, { color: '#b388ff' });
    } else {
      this.attackKind = 'attack';
      const rect = this.getAttackRect(wt === 'melee' ? (st.range || 80) : 55);
      const hits = playerAttackArea(g, rect, wt === 'melee' ? 1 : 0.8, { hits: 1, knock: 220, effect: 'hit' });
      spawnEffect(g, 'slash', this.x + this.facing * (rect.w * 0.5), this.y - 40, { dir: this.facing, color: weaponColor(g.state), range: rect.w });
      void hits;
    }
    return true;
  }

  // ------------------------------------------------------------ ドロップ
  autoPickup(zHeld) {
    const g = this.game;
    const magnet = zHeld ? 110 : 50;
    for (const d of g.drops) {
      if (!d.canPick || !d.canPick()) continue;
      const dx = d.x - this.x, dy = (d.y - 10) - (this.y - 30);
      const dist = Math.hypot(dx, dy);
      if (dist < magnet && (d.onGround || zHeld)) { d.pickup(); if (!zHeld) break; }
    }
  }

  // ------------------------------------------------------------ 描画
  updateAnim(dt) {
    const a = this.anim, s = this.game.state, st = this.stats || {};
    a.t += dt;
    a.facing = this.facing;
    let state = 'idle';
    if (this.dead) state = 'dead';
    else if (this.inVehicle) state = 'drive';
    else if (this.climbing) state = 'climb';
    else if (this.hurtT > 0.15) state = 'hurt';
    else if (this.attackLeft > 0) state = this.attackKind === 'shoot' ? 'shoot' : 'attack';
    else if (!this.onGround) state = 'jump';
    else if (Math.abs(this.vx) > 20) state = 'walk';
    if (state !== a.state && state !== 'climb') a.t = 0;
    if (state === 'climb' && !this.climbMoving) a.t -= dt; // 止まっている時は手足停止
    a.state = state;
    a.attackT = this.attackT;
    a.damage = st.maxHp ? Math.max(0, Math.min(1, 1 - (s.hp / st.maxHp))) : 0;
    a.flash = this.invulnT > 0 && !this.dead && Math.floor(this.t * 18) % 2 === 0;
    a.alpha = a.flash ? 0.45 : 1; // 被弾無敵中は点滅
    a.scale = 1;
  }

  draw(ctx) {
    if (this.inVehicle) return; // 車側で描画（driver=true）
    const s = this.game.state;
    if (!s) return;
    const look = (HERO_LOOKS && HERO_LOOKS[s.heroId]) || (HERO_LOOKS && HERO_LOOKS.luna);
    const equip = getEquipLooks(s);
    drawCharacter(ctx, this.x, this.y, look, equip, this.anim);
  }

  rect() { return entRect(this); }
}

function weaponColor(state) {
  const id = state?.equipped?.weapon;
  if (!id) return null;
  const it = getItem(id);
  return it?.look?.accent || it?.look?.color || null;
}
