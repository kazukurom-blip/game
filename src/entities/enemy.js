// 敵。AI: walker / jumper / charger / shooter / flyer / cop / boss
import { ENEMIES } from '../data/enemies.js';
import { damagePlayer } from '../systems/combat.js';
import { drawEnemy } from '../render/enemyArt.js';
import { spawnEffect } from '../render/effects.js';
import { moveAndCollide, entRect, rectOverlap } from '../world/physics.js';
import { Projectile } from './projectile.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ボス技のシャッフルバッグ: opts（重み=出現回数）を並べ替え、隣接する同じ技と
// 直前の技(last)との連続を避ける。pop() で末尾から使う前提で、末尾が最初に使われる。
export function makeMoveBag(opts, last) {
  const cnt = {};
  for (const o of opts) cnt[o] = (cnt[o] || 0) + 1;
  const seq = [];
  let prev = last;
  for (let n = opts.length; n > 0; n--) {
    const keys = Object.keys(cnt).filter((k) => cnt[k] > 0);
    const max = Math.max(...keys.map((k) => cnt[k]));
    // 残りで隣接回避が不可能にならないよう、多すぎる技は優先して消化
    let cands = keys.filter((k) => k !== prev && (max * 2 <= n + 1 || cnt[k] === max));
    if (!cands.length) cands = keys.filter((k) => k !== prev);
    if (!cands.length) cands = keys;
    const tot = cands.reduce((a, k) => a + cnt[k], 0);
    let r = Math.random() * tot, pickK = cands[0];
    for (const k of cands) { r -= cnt[k]; if (r < 0) { pickK = k; break; } }
    seq.push(pickK); cnt[pickK]--; prev = pickK;
  }
  return seq.reverse();
}

// def.speed が「px/s」か「倍率」か曖昧なので正規化
function speedOf(def) {
  const s = def.speed ?? 80;
  return s > 12 ? s : s * 60;
}

export class Enemy {
  constructor(game, defId, x, y, opts = {}) {
    this.game = game;
    this.defId = defId;
    this.def = ENEMIES[defId] || Object.values(ENEMIES)[0];
    const d = this.def;
    this.id = d.id;
    this.name = d.name;
    this.level = d.level;
    this.maxHp = d.hp; this.hp = d.hp;
    this.w = d.w || 40; this.h = d.h || 40;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.hurtT = 0;
    this.deadT = 0;
    this.dead = false;
    this.remove = false;
    this.alpha = 1;
    this.onGround = false;
    this.speed = speedOf(d);
    this.ai = d.ai || 'walker';
    this.aggro = false;
    this.aggroRange = d.aggro > 0 ? d.aggro : (this.boss ? 900 : 380);
    this.shootDef = d.shoot || null;
    this.aiT = rand(0.5, 2);
    this.dir = this.facing;
    this.shootT = rand(0.8, 2);
    this.contactCd = 0;
    this.ramCd = 0;
    this.lastHp = this.hp;
    this.spawnIdx = opts.spawnIdx ?? -1;
    this.fromWanted = !!opts.fromWanted;
    this.homeX1 = opts.x1 ?? x - 400;
    this.homeX2 = opts.x2 ?? x + 400;
    this.boss = !!d.boss || this.ai === 'boss';
    this.isCop = !!d.isCop;
    this.flying = this.ai === 'flyer';
    this.noGravity = this.flying;
    this.homeY = y - (this.flying ? rand(120, 260) : 0);
    if (this.flying) this.y = this.homeY;
    this.phase = 'walk'; this.phaseT = 2;   // boss / charger
    this.spawnT = 0.35;                      // 出現フェードイン
  }

  get player() { return this.game.player; }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.spawnT > 0) this.spawnT -= dt;
    if (this.contactCd > 0) this.contactCd -= dt;
    if (this.ramCd > 0) this.ramCd -= dt;

    // 死亡処理（combat が hp<=0 / dead を設定）
    if (this.hp <= 0 || this.dead) {
      if (!this.dead) this.dead = true;
      this.state = 'dead';
      this.deadT += dt;
      this.alpha = Math.max(0, 1 - this.deadT / 0.7);
      this.vx *= 0.9;
      if (this.flying) { this.noGravity = false; }
      moveAndCollide(this, g.map, dt);
      if (this.deadT > 0.75) this.remove = true;
      return;
    }
    this.alpha = this.spawnT > 0 ? 1 - this.spawnT / 0.35 : 1;

    // 被弾検出（combat 側が hurtT を設定しなくても反応する）
    if (this.hp < this.lastHp) {
      this.aggro = true;
      if (!(this.hurtT > 0)) this.hurtT = 0.3;
    }
    this.lastHp = this.hp;

    const p = this.player;
    const pdx = p ? p.x - this.x : 0;
    const pdy = p ? p.y - this.y : 0;
    const pdist = Math.hypot(pdx, pdy);
    if (p && !p.dead && !p.inVehicle && this.ai !== 'cop' && (this.def.aggro > 0 || this.boss) && pdist < this.aggroRange && Math.abs(pdy) < 140) this.aggro = true;
    if (pdist > 1100 && !this.boss) this.aggro = false;

    if (this.boss && this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt * 3); // ボスはひるまない
    if (this.hurtT > 0 && !this.boss) {
      this.hurtT -= dt;
      this.state = 'hurt';
      // ノックバック減衰
      this.vx *= Math.pow(0.02, dt);
      if (this.flying) { this.vy *= 0.9; this.x += this.vx * dt; this.y += this.vy * dt; this.clampFly(); }
      else moveAndCollide(this, g.map, dt);
      this.contact();
      return;
    }

    switch (this.ai) {
      case 'jumper': this.aiJumper(dt, pdx); break;
      case 'charger': this.aiCharger(dt, pdx, pdy); break;
      case 'shooter': this.aiShooter(dt, pdx, pdy, pdist); break;
      case 'flyer': this.aiFlyer(dt, pdx, pdy, pdist); break;
      case 'cop': this.aiCop(dt, pdx, pdy, pdist); break;
      case 'boss': this.aiBoss(dt, pdx, pdy, pdist); break;
      default: this.aiWalker(dt, pdx); break;
    }

    if (!this.flying) {
      const prevPlat = this.groundPlat;
      const wasGround = this.onGround;
      const res = moveAndCollide(this, g.map, dt);
      if (res.hitWall && this.onGround && this.ai !== 'boss') { this.dir = -this.dir; }
      // 足場の端で引き返す（追跡中/突進中以外）
      if (wasGround && !this.onGround && prevPlat && !this.aggro && this.ai !== 'jumper') {
        // 落ちかけたら戻す
        this.x = Math.max(prevPlat.x + 4, Math.min(prevPlat.x + prevPlat.w - 4, this.x));
        this.y = prevPlat.y; this.vy = 0; this.onGround = true; this.groundPlat = prevPlat;
        this.dir = -this.dir;
      }
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.clampFly();
    }
    if (Math.abs(this.vx) > 5 && this.state !== 'attack') this.facing = Math.sign(this.vx);
    this.contact();
  }

  clampFly() {
    const m = this.game.map;
    this.x = Math.max(this.w / 2, Math.min(m.width - this.w / 2, this.x));
    this.y = Math.max(this.h + 20, Math.min(m.groundY - 10, this.y));
  }

  // 足場端チェック: 次の位置が足場外なら true
  edgeAhead(dir) {
    const p = this.groundPlat;
    if (!p || !this.onGround) return false;
    const nx = this.x + dir * (this.w / 2 + 6);
    return nx < p.x || nx > p.x + p.w;
  }

  wander(dt, mult = 1) {
    this.aiT -= dt;
    if (this.aiT <= 0) {
      this.aiT = rand(1.5, 3.5);
      const r = Math.random();
      this.dir = r < 0.25 ? 0 : (r < 0.62 ? -1 : 1);
    }
    if (this.x < this.homeX1) this.dir = 1;
    if (this.x > this.homeX2) this.dir = -1;
    if (this.dir && this.edgeAhead(this.dir)) this.dir = -this.dir;
    this.vx = this.dir * this.speed * mult;
    this.state = this.dir ? 'walk' : 'idle';
  }

  chase(dx, mult = 1, stopDist = 10) {
    const d = Math.abs(dx) > stopDist ? Math.sign(dx) : 0;
    this.vx = d * this.speed * mult;
    this.state = d ? 'walk' : 'idle';
    if (d) this.facing = d;
  }

  aiWalker(dt, pdx) {
    if (this.aggro) this.chase(pdx, 1.15);
    else this.wander(dt);
  }

  aiJumper(dt, pdx) {
    if (this.onGround) {
      this.vx *= 0.8;
      this.state = 'idle';
      this.aiT -= dt;
      if (this.aiT <= 0) {
        this.aiT = rand(0.6, 1.6);
        let d = this.aggro ? Math.sign(pdx) || 1 : pick([-1, 1]);
        if (!this.aggro && (this.x < this.homeX1)) d = 1;
        if (!this.aggro && (this.x > this.homeX2)) d = -1;
        this.vy = -rand(520, 720);
        this.vx = d * this.speed * 1.4;
        this.facing = d;
        this.onGround = false;
      }
    } else this.state = 'jump';
  }

  aiCharger(dt, pdx, pdy) {
    this.phaseT -= dt;
    if (this.phase === 'windup') {
      this.vx = 0; this.state = 'attack';
      if (this.phaseT <= 0) { this.phase = 'charge'; this.phaseT = 0.8; this.vx = this.facing * this.speed * 3.5; spawnEffect(this.game, 'dash', this.x, this.y - this.h / 2, { dir: this.facing }); }
      return;
    }
    if (this.phase === 'charge') {
      this.vx = this.facing * this.speed * 3.5; this.state = 'attack';
      if (this.phaseT <= 0 || this.edgeAhead(this.facing)) { this.phase = 'walk'; this.phaseT = rand(1.5, 2.5); this.vx = 0; }
      return;
    }
    if (this.aggro && Math.abs(pdx) < this.aggroRange && Math.abs(pdy) < 70 && this.phaseT <= 0) {
      this.phase = 'windup'; this.phaseT = 0.5; this.facing = Math.sign(pdx) || this.facing; return;
    }
    if (this.aggro) this.chase(pdx, 0.9, 40); else this.wander(dt);
  }

  aiShooter(dt, pdx, pdy, pdist) {
    if (!this.aggro) return this.wander(dt);
    const ad = Math.abs(pdx);
    if (ad < 220) { this.vx = -Math.sign(pdx) * this.speed; this.state = 'walk'; }
    else if (ad > 420) { this.vx = Math.sign(pdx) * this.speed; this.state = 'walk'; }
    else { this.vx = 0; this.state = 'idle'; }
    if (this.vx && this.edgeAhead(Math.sign(this.vx))) this.vx = 0;
    this.facing = Math.sign(pdx) || this.facing;
    this.shootT -= dt;
    const sd = this.shootDef || {};
    if (this.shootT <= 0 && ad < (sd.range || 520) + 40 && Math.abs(pdy) < 120) {
      this.shootT = (sd.interval || 1.8) * rand(0.85, 1.2);
      this.fire(Math.sign(pdx) || this.facing);
    }
  }

  aiFlyer(dt, pdx, pdy, pdist) {
    const art = this.def.art;
    if (this.aggro && pdist < this.aggroRange * 1.4) {
      const ty = this.player.y - 110;
      this.vx += (Math.sign(pdx) * this.speed * 1.1 - this.vx) * Math.min(1, dt * 2);
      this.vy += ((ty - this.y) * 1.5 - this.vy) * Math.min(1, dt * 2);
      if (Math.abs(pdx) < 160 && art !== 'drone') this.vy += 300 * dt * 3; // 急降下
      this.state = 'walk';
      if (art === 'drone') {
        this.shootT -= dt;
        const sd = this.shootDef || {};
        if (this.shootT <= 0 && pdist < (sd.range || 420) + 60) {
          this.shootT = (sd.interval || 2) * rand(0.85, 1.2);
          const ang = Math.atan2(this.player.y - 40 - this.y, pdx);
          this.fire(Math.cos(ang), Math.sin(ang));
        }
      }
    } else {
      this.aiT -= dt;
      if (this.aiT <= 0) { this.aiT = rand(2, 4); this.dir = pick([-1, 1]); }
      if (this.x < this.homeX1) this.dir = 1;
      if (this.x > this.homeX2) this.dir = -1;
      this.vx = this.dir * this.speed * 0.7;
      this.vy = (this.homeY + Math.sin(this.t * 2) * 30 - this.y) * 2;
      this.state = 'walk';
    }
    if (Math.abs(this.vx) > 5) this.facing = Math.sign(this.vx);
  }

  aiCop(dt, pdx, pdy, pdist) {
    const g = this.game;
    if (!(g.wanted > 0) && !this.aggro) {
      if (this.fromWanted) { this.vx = Math.sign(this.x - g.cam.x - g.W / 2 || 1) * this.speed; this.state = 'walk'; this.leaveT = (this.leaveT || 0) + dt; this.alpha = Math.max(0, 1 - (this.leaveT - 3)); if (this.leaveT > 4) this.remove = true; return; }
      return this.wander(dt);
    }
    this.leaveT = 0;
    this.aggro = true;
    const ad = Math.abs(pdx);
    if (ad > 260) this.chase(pdx, 1.35);
    else if (ad < 120) { this.vx = -Math.sign(pdx) * this.speed * 0.6; this.state = 'walk'; }
    else { this.vx = 0; this.state = 'idle'; }
    this.facing = Math.sign(pdx) || this.facing;
    // プレイヤーが上にいたらジャンプ
    if (this.onGround && pdy < -90 && ad < 260 && Math.random() < dt * 1.5) { this.vy = -820; this.onGround = false; }
    // 下にいたら一方通行足場を降りる
    if (this.onGround && this.groundPlat && pdy > 90 && Math.random() < dt) { this.dropThrough = 0.25; this.vy = 50; }
    this.shootT -= dt;
    const sd = this.shootDef || {};
    if (this.shootT <= 0 && ad < (sd.range || 480) && Math.abs(pdy) < 110) {
      this.shootT = (sd.interval || 1.4) * rand(0.85, 1.2);
      this.fire(Math.sign(pdx) || this.facing);
    }
  }

  aiBoss(dt, pdx, pdy, pdist) {
    const g = this.game;
    if (Math.abs(pdx) > 1000 || Math.abs(pdy) > 500) { this.phase = 'walk'; this.hasActed = false; return this.wander(dt, 0.6); }
    const enraged = this.hp < this.maxHp * 0.5;
    const sp = enraged ? 1.35 : 1;
    this.phaseT -= dt * sp;
    switch (this.phase) {
      case 'walk':
        this.chase(pdx, 0.8 * sp, 60);
        if (this.phaseT <= 0) {
          const opts = ['charge', 'slam', 'summon'];
          if (this.shootDef) opts.push('shoot', 'shoot');
          if (enraged) opts.push('charge', 'slam', ...(this.shootDef ? ['shoot'] : []));
          // シャッフルバッグ方式: 1巡で各技が重み通りに出る（純ランダムだと同技が5〜6連続したり
          // 召喚がほとんど出ない等の偏りが起きていた）。巡の境目で同じ技が続かないようにする。
          if (!this.moveBag || !this.moveBag.length || this.moveBagEnraged !== enraged) {
            const bag = makeMoveBag(opts, this.lastMove);
            this.moveBag = bag; this.moveBagEnraged = enraged;
          }
          let next = this.moveBag.pop();
          // 召喚枠が埋まっている時は召喚を後回し
          if (next === 'summon' && this.moveBag.length && g.enemies.filter((e) => !e.dead && e.summoned).length >= 6) {
            this.moveBag.unshift(next); next = this.moveBag.pop();
          }
          this.moveRun = next === this.lastMove ? (this.moveRun || 1) + 1 : 1;
          this.lastMove = next;
          this.phase = next;
          this.phaseStart = this.t;
          this.phaseT = this.phase === 'charge' ? 0.7 : this.phase === 'slam' ? 0.5 : 0.8;
          this.facing = Math.sign(pdx) || this.facing;
          this.vx = 0;
          this.state = 'attack';
          this.hasActed = false;
        }
        break;
      case 'charge':
        this.state = 'attack';
        if (!this.hasActed) { this.vx = 0; if (this.phaseT <= 0) { this.hasActed = true; this.phaseT = 0.9; spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { dir: this.facing }); } }
        else { this.vx = this.facing * this.speed * 4.5; if (this.phaseT <= 0) this.endPhase(); }
        break;
      case 'slam':
        this.state = 'attack';
        if (!this.hasActed) {
          this.vx = 0;
          if (this.phaseT <= 0 && !this.onGround && this.t - (this.phaseStart ?? this.t) > 2.5) { this.endPhase(); break; } // 空中で詰まらない
          if (this.phaseT <= 0 && this.onGround) { this.hasActed = true; this.vy = -900; this.vx = Math.sign(pdx) * Math.min(Math.abs(pdx) * 1.2, 500); this.onGround = false; this.airT = 0; }
        } else {
          this.airT += dt;
          if (this.onGround && this.airT > 0.15) {
            // 着地衝撃波
            g.shake = Math.max(g.shake || 0, 14);
            spawnEffect(g, 'explosion', this.x, this.y, { radius: 260 });
            spawnEffect(g, 'smoke', this.x, this.y);
            const p = this.player;
            if (p && !p.dead && Math.abs(p.x - this.x) < 280 && Math.abs(p.y - this.y) < 60 && p.onGround && !(p.invulnT > 0)) {
              damagePlayer(g, Math.round(this.def.atk * 1.3), this.x);
            }
            this.endPhase();
          }
        }
        break;
      case 'summon':
        this.state = 'attack'; this.vx = 0;
        if (this.phaseT <= 0) {
          const types = this.def.summon || (g.map.spawns || []).flatMap((s) => s.types).filter((t) => ENEMIES[t] && !ENEMIES[t].boss && ENEMIES[t].ai !== 'boss');
          const n = enraged ? 3 : 2;
          if (types.length && g.enemies.filter((e) => !e.dead && e.summoned).length < 6) {
            for (let i = 0; i < n; i++) {
              const ex = this.x + (i - (n - 1) / 2) * 120;
              const e = new Enemy(g, pick(types), ex, this.y - 10, { x1: ex - 300, x2: ex + 300 });
              e.summoned = true; e.aggro = true;
              g.enemies.push(e);
              spawnEffect(g, 'smoke', ex, this.y - 20);
            }
          }
          this.endPhase();
        }
        break;
      case 'shoot':
        this.state = 'attack'; this.vx = 0;
        this.facing = Math.sign(pdx) || this.facing;
        if (this.phaseT <= 0) {
          const n = enraged ? 7 : 5;
          const base = Math.atan2(this.player.y - 40 - (this.y - this.h * 0.6), pdx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.16;
            this.fire(Math.cos(a), Math.sin(a), 0.7);
          }
          this.endPhase();
        }
        break;
      default: this.endPhase();
    }
  }

  endPhase() { this.phase = 'walk'; this.phaseT = rand(1.4, 2.4); this.hasActed = false; }

  fire(dx, dy = 0, dmgMul) {
    const g = this.game;
    const sd = this.shootDef || {};
    dmgMul = dmgMul ?? sd.damageMult ?? 0.8;
    const len = Math.hypot(dx, dy) || 1;
    const sp = (sd.speed || (this.def.art === 'drone' ? 480 : 600)) * 0.85;
    const ox = this.x + Math.sign(dx || this.facing) * (this.w / 2 + 6);
    const oy = this.y - this.h * 0.6;
    g.projectiles.push(new Projectile(g, {
      owner: 'enemy', kind: 'enemyBullet', x: ox, y: oy,
      vx: dx / len * sp, vy: dy / len * sp,
      dmg: Math.max(1, Math.round(this.def.atk * dmgMul)), range: (sd.range || 600) * 1.6,
      color: this.isCop || this.def.art === 'swat' || this.def.art === 'drone' ? '#4dd2ff' : '#ff6b6b',
    }));
    spawnEffect(g, 'muzzle', ox, oy, { dir: Math.sign(dx) || this.facing });
    this.state = 'attack';
  }

  contact() {
    const g = this.game, p = this.player;
    if (!p || p.dead || p.inVehicle || !(g.state && g.state.hp > 0)) return;
    if (this.contactCd > 0 || p.invulnT > 0 || this.spawnT > 0) return;
    if (this.def.contact === false) return;
    if (rectOverlap(entRect(this), entRect(p))) {
      this.contactCd = 0.5;
      damagePlayer(g, this.def.atk, this.x);
    }
  }

  draw(ctx) {
    if (this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
    drawEnemy(ctx, this);
    ctx.restore();
  }
}
