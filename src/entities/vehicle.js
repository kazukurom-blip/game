// 乗り物。プレイヤーが乗ると高速移動・敵を轢く（手配度上昇）。パトカーは警官AIが運転する簡易版。
import { moveAndCollide, entRect, rectOverlap } from '../world/physics.js';
import { drawVehicle } from '../render/vehicles.js';
import { spawnEffect } from '../render/effects.js';
import { calcDamage, damageEnemy, damagePlayer, addWanted } from '../systems/combat.js';
import { computeStats } from '../systems/progression.js';
import { getEquipLooks } from '../systems/inventory.js';
import { HERO_LOOKS } from '../render/character.js';
import { heroLookOf } from './player.js';

const SPECS = {
  sports: { w: 150, h: 50, max: 950, accel: 1500 },
  police: { w: 150, h: 56, max: 850, accel: 1300 },
  bike: { w: 90, h: 52, max: 780, accel: 1700 },
};

export class Vehicle {
  constructor(game, data = {}) {
    this.game = game;
    this.kind = SPECS[data.kind] ? data.kind : 'sports';
    const s = SPECS[this.kind];
    this.w = s.w; this.h = s.h; this.maxSpeed = s.max; this.accel = s.accel;
    this.x = data.x ?? 400;
    this.y = data.y ?? game.map?.groundY ?? 1000;
    this.color = data.color || (this.kind === 'police' ? '#1b2a4a' : '#ff2e88');
    this.facing = data.facing || 1;
    this.vx = 0; this.vy = 0; this.speed = 0;
    this.onGround = false;
    this.driver = false;       // drawVehicle 用 (bool)
    this.driverType = null;    // 'player' | 'cop' | null
    this.t = 0;
    this.remove = false;
    this.dead = false;
    this.copT = 0;
    this.siren = this.kind === 'police';
  }

  // プレイヤーが乗車
  enter(player) {
    const g = this.game;
    if (this.driverType === 'cop') return false;
    this.driver = true; this.driverType = 'player';
    player.inVehicle = this;
    player.climbing = null;
    if (this.kind === 'police') addWanted(g, 5); // パトカー強奪 → ★2
    spawnEffect(g, 'smoke', this.x - this.facing * this.w / 2, this.y - 10);
    g.events.emit('vehicleEnter', { vehicle: this });
    return true;
  }

  exit(player) {
    const g = this.game;
    this.driver = false; this.driverType = null;
    player.inVehicle = null;
    player.x = Math.max(20, Math.min(g.map.width - 20, this.x - this.facing * (this.w / 2 - 10)));
    player.y = this.y; player.vx = this.vx * 0.3; player.vy = -200;
    g.events.emit('vehicleExit');
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.driverType === 'player') this.updatePlayerDrive(dt);
    else if (this.driverType === 'cop') this.updateCopDrive(dt);
    else {
      this.vx *= Math.pow(0.05, dt);
      if (Math.abs(this.vx) < 4) this.vx = 0;
    }
    moveAndCollide(this, g.map, dt);
    this.speed = this.vx;
    if (Math.abs(this.vx) > 20) this.facing = Math.sign(this.vx);
    if (this.driverType) this.ram(dt);
  }

  updatePlayerDrive(dt) {
    const g = this.game, inp = g.input, p = g.player;
    const modal = g.ui?.isModal?.();
    const L = !modal && inp.down('left'), R = !modal && inp.down('right');
    if (L && !R) this.vx -= this.accel * dt * (this.vx > 0 ? 1.8 : 1);
    else if (R && !L) this.vx += this.accel * dt * (this.vx < 0 ? 1.8 : 1);
    else this.vx *= Math.pow(0.25, dt);
    this.vx = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.vx));
    if (!modal && inp.pressed('jump') && this.onGround) {
      if (inp.down('down') && this.groundPlat) { this.dropThrough = 0.25; this.vy = 60; }
      else this.vy = -640; // ホップ
    }
    // 運転手の見た目（vehicles.js が参照）
    const st = g.state;
    if (st) { this.driverEquip = getEquipLooks(st); this.driverLook = heroLookOf(st) || HERO_LOOKS?.[st.heroId]; this.driverDamage = p?.anim?.damage ?? 0; }
    // プレイヤーを追従
    p.x = this.x; p.y = this.y; p.vx = this.vx; p.vy = this.vy;
    p.facing = this.facing; p.onGround = this.onGround;
    if (Math.abs(this.vx) > this.maxSpeed * 0.6 && Math.random() < dt * 20) {
      spawnEffect(g, 'smoke', this.x - this.facing * this.w / 2, this.y - 8);
    }
  }

  // 警官AI運転: プレイヤーに向かって走り、近づいたら停車して警官を降ろす
  updateCopDrive(dt) {
    const g = this.game, p = g.player;
    this.copT += dt;
    const dx = p.x - this.x;
    if (Math.abs(dx) > 260 && this.copT < 8) {
      this.vx += Math.sign(dx) * this.accel * 0.8 * dt;
      this.vx = Math.max(-this.maxSpeed * 0.8, Math.min(this.maxSpeed * 0.8, this.vx));
    } else {
      this.vx *= Math.pow(0.02, dt);
      if (Math.abs(this.vx) < 30) {
        // 警官が降りる
        this.driver = false; this.driverType = null; this.vx = 0;
        if (this.onCopExit) this.onCopExit(this);
      }
    }
  }

  ram(dt) {
    const g = this.game;
    const sp = Math.abs(this.vx);
    const r = entRect(this);
    if (this.driverType === 'player' && sp > 220) {
      const st = computeStats(g.state);
      for (const e of g.enemies) {
        if (e.dead || e.hp <= 0 || (e.ramCd > 0) || e.flying) continue;
        if (!rectOverlap(r, entRect(e))) continue;
        // 市民には通常攻撃しか当たらない仕様: 車が来たら飛びのいて避ける
        if (e.def?.civilian) {
          e.ramCd = 0.8;
          e.vy = -420; e.vx = Math.sign(e.x - this.x || 1) * 160;
          e.scared = true; e.fleeT = 2; e.fleeDir = Math.sign(e.x - this.x || 1); e.onGround = false;
          if (!(e.shoutT > 0)) e.say?.('うわっ、危ない！');
          continue;
        }
        e.ramCd = 0.6;
        const { dmg, crit } = calcDamage(st.atk, 1.2 + sp / this.maxSpeed * 1.5, e.def?.def ?? 0, st.crit, st.critDmg);
        damageEnemy(g, e, dmg, crit, Math.sign(this.vx));
        e.vy = -380;
        spawnEffect(g, crit ? 'critHit' : 'hit', e.x, e.y - e.h / 2);
        g.shake = Math.max(g.shake || 0, 6);
        if (!e.def?.civilian) addWanted(g, e.isCop || e.def?.isCop ? 3 : 0.6);
        this.vx *= e.boss ? 0.3 : 0.85;
      }
    } else if (this.driverType === 'cop' && sp > 250) {
      const p = g.player;
      if (p && !p.inVehicle && !p.dead && !(p.invulnT > 0) && rectOverlap(r, entRect(p))) {
        damagePlayer(g, Math.round(10 + sp / 40), this.x);
        this.vx *= 0.4;
      }
    }
  }

  draw(ctx) {
    drawVehicle(ctx, this);
    const p = this.game.player;
    if (!this.driverType && p && !p.inVehicle && !p.dead && Math.abs(p.x - this.x) < 110 && Math.abs(p.y - this.y) < 70) {
      ctx.save();
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(this.x - 36, this.y - this.h - 30, 72, 18);
      ctx.fillStyle = this.kind === 'police' ? '#ff6b6b' : '#fff';
      ctx.fillText(this.kind === 'police' ? 'E: 強奪' : 'E: 乗る', this.x, this.y - this.h - 21);
      ctx.restore();
    }
  }
}
