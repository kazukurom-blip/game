// プレイヤー（メイプル風操作）
import { drawCharacter, HERO_LOOKS } from '../render/character.js';
import { spawnEffect } from '../render/effects.js';
import { computeStats } from '../systems/progression.js';
import { getEquipLooks, useItem } from '../systems/inventory.js';
import { useSkill, tryFinalAttack } from '../systems/skills.js';
import { playerAttackArea, newAttackId } from '../systems/combat.js';
import { currentJob } from '../systems/jobs.js';
import { defaultLook } from '../data/classes.js';
import { sysFn } from '../world/sys.js';
import { getItem } from '../data/items.js';
import { moveAndCollide, findRope, entRect, rectOverlap } from '../world/physics.js';
import { Projectile } from './projectile.js';
import { syncPet } from './pet.js';

const CLIMB_SPEED = 190;
const BASE_SPEED = 240;
const BASE_JUMP = 860;
export const TALK_RANGE = 90;   // NPC 会話距離（px）
export const SKILL_SLOTS = 8;   // スキルバー A S D F Q W G H


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
      this._unsub.push(ev.on('equipChanged', () => syncPet(game)));
      // AIの頭の表情: レベルアップ・転職・勝利で少しの間 happy（render/character.js aiHeadExpr）
      for (const n of ['levelUp', 'jobAdvanced', 'bossClear', 'missionComplete', 'towerFloorCleared']) this._unsub.push(ev.on(n, () => { this.joyT = 1.8; }));
      this._unsub.push(ev.on('mapChanged', () => {
        this.move = null; this.gravityScale = 1; this.dashing = false;
        syncPet(game, true);
      }));
    }
  }

  destroy() {
    for (const u of this._unsub) u && u();
    this._unsub = [];
    if (this.game.pet) { this.game.pet.remove = true; this.game.pet = null; }
  }

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
    if (this.joyT > 0) this.joyT -= dt;
    if (this.ropeCd > 0) this.ropeCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackLeft > 0) {
      this.attackLeft -= dt;
      this.attackT = this.attackDur > 0 ? Math.min(1, 1 - this.attackLeft / this.attackDur) : 1;
      if (this.attackLeft <= 0) { this.attackKind = null; this.attackT = 0; this.skillMotion = null; }
    }
    // HP/MP 上限
    if (st.maxHp && s.hp > st.maxHp) s.hp = st.maxHp;
    if (st.maxMp && s.mp > st.maxMp) s.mp = st.maxMp;

    // --- 死亡 ---
    if (s.hp <= 0 || this.dead) {
      if (!this.dead) { this.dead = true; this.deadT = 0; this.move = null; this.gravityScale = 1; }
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

    // 乗り物は廃止（inVehicle は常に null。古いコードが参照しても落ちないよう項目だけ残す）
    this.updatePet(dt);

    if (ctrl) this.handleActions(dt, st);
    if (this.move && !this.climbing) this.updateMoveSkill(dt, ctrl, st);
    else if (this.climbing) this.updateClimb(dt, ctrl);
    else this.updateMove(dt, ctrl, st);

    if (this.onGround || this.climbing) this.fjCount = 0;
    // 自動吸引（近くの着地済みドロップ）
    this.autoPickup(ctrl && inp.down('pickup'));
    this.updateAnim(dt);
  }

  handleActions(dt, st) {
    const g = this.game, inp = g.input, s = g.state;
    // ポータル（↑）
    if (inp.pressed('up') && this.tryPortal()) return;
    // 会話（V = 正式な会話キー。E/Enter も会話）
    if (inp.pressed('talk') && this.talk()) return;
    if (inp.pressed('interact')) { this.interact(); return; }
    // スキル（8枠: skill1..8 → skillBar[0..7]）
    const bar = s.skillBar || [];
    for (let i = 0; i < SKILL_SLOTS; i++) {
      if (inp.pressed('skill' + (i + 1)) && bar[i]) {
        useSkill(g, bar[i]);
      }
    }
    // ポーション
    const pb = s.potionBar || [];
    for (let i = 0; i < 2; i++) {
      if (inp.pressed('potion' + (i + 1)) && pb[i]) useItem(g, pb[i]);
    }
    // 通常攻撃（押しっぱなしで連続。突進・ホイールダッシュ中は不可）
    const busy = this.move && (this.move.type === 'rush' || this.move.type === 'wheelDash');
    if (inp.down('attack') && this.attackCd <= 0 && !this.climbing && !busy) this.startAttack('basic');
  }

  tryPortal() {
    const g = this.game;
    for (const p of g.map.portals || []) {
      if (p.hidden) continue; // タワーの「次の階」ポータルは全滅まで非表示
      if (Math.abs(this.x - p.x) < 44 && Math.abs(this.y - p.y) < 90) {
        spawnEffect(g, 'portal', this.x, this.y - 40);
        if (p.towerNext) {
          const next = (g.towerFloor || 1) + 1;
          const enter = sysFn('towerEnter', g);
          let changed = false;
          const off = g.events?.on?.('mapChanged', () => { changed = true; });
          if (enter) {
            let r = null;
            try { r = enter(g, next); } catch (e) { r = null; }
            if (r && r.ok === false) { off?.(); if (r.msg) g.notify?.(r.msg, '#ff8a8a'); return true; }
          }
          off?.();
          if (!changed || g.map?.id !== 'tower') { g.towerFloor = next; g.changeMap('tower'); }
          return true;
        }
        g.changeMap(p.to, p.toX, p.toY);
        return true;
      }
    }
    return false;
  }

  /** 会話できる最寄りの NPC（約90px 以内・同じ高さ。夜だけの NPC は時間外なら除外） */
  nearestNpc(range = TALK_RANGE) {
    let best = null, bd = range;
    for (const n of this.game.npcs || []) {
      if (n.hidden || n.remove) continue;
      const d = Math.abs(n.x - this.x);
      if (d < bd && Math.abs(n.y - this.y) < 70) { best = n; bd = d; }
    }
    return best;
  }

  /** NPC と会話（V）。話せたら true */
  talk() {
    const g = this.game;
    if (this.inVehicle) return false;
    const best = this.nearestNpc();
    if (!best) return false;
    g.events?.emit('talkNpc', { npcId: best.id });
    if (best.service) {
      // コンテンツ受付: UI のコンテンツ窓（U）を開く。未実装なら通常の会話にフォールバック
      const tab = best.service === 'content' ? null : best.service;
      g.events?.emit('serviceNpc', { npcId: best.id, service: best.service, tab });
      g.ui?.open?.('content', { npc: best, tab, from: 'npc' });
      if (!g.ui?.wins || g.ui.wins.content) return true;
    }
    g.ui?.open?.('dialog', { npc: best });
    return true;
  }

  /** E / Enter: NPC と話す（乗り物は廃止したので会話だけ） */
  interact() {
    this.talk();
  }

  updateMove(dt, ctrl, st) {
    const g = this.game, inp = g.input;
    // 水辺（桟橋・沼）の地面＝浅瀬では足が遅くなる
    const inWater = g.map.water && this.onGround && !this.groundPlat && this.y >= g.map.groundY - 1;
    const speed = normSpeed(st.speed) * (inWater ? 0.6 : 1);
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
      // 空中制御（弱め）。移動スキルの勢い（|vx| > speed）は急に殺さず、空気抵抗でなめらかに戻す
      const over = Math.abs(this.vx) > speed;
      if (over) this.vx *= Math.max(0, 1 - 1.6 * dt);
      if (dir) {
        const lim = Math.max(speed, Math.abs(this.vx));
        this.vx += dir * speed * 3.2 * dt;
        this.vx = Math.max(-lim, Math.min(lim, this.vx));
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

  // ------------------------------------------------------------ 移動スキル（SPEC_JOB「移動スキル」）
  /**
   * doMoveSkill(skill, lv, params) — systems/skills.js の useSkill から呼ばれる（MP/CD/無敵/afterBuff/arrivalBlast は useSkill 側）。
   * params = moveParams(state, skillId, lv): {type, power, distance, time?, lift?, gravityScale?, backShot?, push?, contact?, vertical?, ...}
   * teleport は同期的に x/y を書き換える（useSkill が移動後の位置で arrivalBlast を判定するため）。
   */
  doMoveSkill(skill, lv = 1, params = null) {
    const g = this.game;
    const mv = params || skill?.move;
    if (!mv || this.dead || this.inVehicle) return false;
    const inp = g.input;
    const L = inp?.down?.('left'), R = inp?.down?.('right');
    const hdir = (R ? 1 : 0) - (L ? 1 : 0);
    if (hdir) this.facing = hdir;
    const dir = this.facing || 1;
    const color = skill?.color || '#7df9ff';
    // 町でも攻撃判定は出す（町にいるのは攻撃の対象にならない住民だけなので空振りになる）
    this.attackLeft = 0; this.attackKind = null;
    const power = Math.max(0, mv.power || 0), dist = Math.max(0, mv.distance || 0);
    switch (mv.type) {
      case 'flashJump': {
        // 空中で前方へ2段ジャンプ。リコイル: 後方へ射撃した反動で跳ぶ
        if (this.climbing) { this.climbing = null; this.ropeCd = 0.3; }
        // 同じ滞空中の2回目以降は上昇量を抑える（無限上昇を防ぐ。横移動はそのまま）
        const lift = (mv.lift ?? 380) * (this.fjCount > 0 ? 0.35 : 1);
        this.fjCount = (this.fjCount || 0) + 1;
        this.vx = dir * Math.max(power, 200);
        this.vy = Math.min(this.vy, 0) * 0.25 - lift;
        this.onGround = false;
        // 前方速度 power で目安 distance に届くよう、短時間だけ空気抵抗を止める
        this.move = { type: 'flashJump', t: Math.min(0.5, dist > 0 && power > 0 ? dist / power * 0.55 : 0.3), dir, speed: this.vx, skill, color };
        if (mv.backShot) {
          const b = mv.backShot;
          const ox = this.x - dir * 20, oy = this.y - this.h * 0.55;
          // 反動弾は後方へ水平に。小ジャンプ中でも地上の敵に当たるよう足元側へ広げる
          const bh = Math.max(b.h, 60);
          const rect = { x: dir > 0 ? ox - b.w : ox, y: oy - bh / 2, w: b.w, h: bh + this.h * 0.55 + 50 };
          spawnEffect(g, 'muzzle', ox, oy, { dir: -dir, facing: -dir, color });
          const hits = playerAttackArea(g, rect, b.mult, { hits: 1, knock: 260, effect: 'hit', color, maxTargets: 6, knockDir: -dir });
          this.afterHits(hits);
        }
        spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { color, facing: dir, dir });
        return true;
      }
      case 'teleport': {
        const U = inp?.down?.('up'), D = inp?.down?.('down');
        const from = { x: this.x, y: this.y };
        spawnEffect(g, 'spark', this.x, this.y - this.h / 2, { color });
        if (mv.vertical && (U || D) && !hdir) this.teleportVertical(U ? -1 : 1, dist || 160);
        else this.teleportHorizontal(dir, dist || 160);
        if (this.climbing) this.climbing = null;
        this.move = { type: 'teleport', t: 0.12, dir, skill, color, from };
        spawnEffect(g, 'portal', this.x, this.y - 40, { color, small: true });
        return true;
      }
      case 'rush': {
        if (this.climbing) this.climbing = null;
        const time = Math.max(0.08, mv.time || (power > 0 ? dist / power : 0.24));
        const speed = dist > 0 ? dist / time : (power || 1000);
        this.move = { type: 'rush', t: time, dir, speed, skill, color, push: mv.push || { mult: 1, knock: 360 }, attackId: newAttackId(), faDone: false };
        this.vy = Math.min(this.vy, 0);
        this.vx = dir * speed;
        spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { color, facing: dir });
        return true;
      }
      case 'glide': {
        if (this.climbing) { this.climbing = null; this.ropeCd = 0.3; }
        const speed = power || 600;
        const time = Math.max(0.2, dist > 0 && speed > 0 ? dist / speed : (mv.time || 0.65));
        if (this.onGround) { this.vy = -420; this.onGround = false; } // 地上からは軽く浮いて滑空
        else this.vy = Math.min(this.vy * 0.2, -60);
        this.move = { type: 'glide', t: time, dir, speed, skill, color, gravityScale: mv.gravityScale ?? 0.15 };
        this.vx = dir * speed;
        spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { color, facing: dir });
        return true;
      }
      case 'wheelDash': {
        if (this.climbing) this.climbing = null;
        const speed = power || 900;
        // 目安距離 distance（Lv・3次強化で伸びる）を power で走り切る時間。データに time しか無ければそれを使う
        const time = Math.max(0.3, dist > 0 ? dist / speed : (mv.time || 1.6));
        this.move = { type: 'wheelDash', t: time, total: time, dir, speed, skill, color, contact: mv.contact || { mult: 0.8, knock: 360 }, attackId: newAttackId(), hitT: 0, airT: 0, faDone: false };
        this.vx = dir * speed * 0.6;
        spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { color, facing: dir });
        return true;
      }
      default:
        return false;
    }
  }

  /** 進行中の移動スキル（rush / glide / wheelDash / flashJump の慣性）を進める */
  updateMoveSkill(dt, ctrl, st) {
    const g = this.game, inp = g.input, m = this.move;
    m.t -= dt;
    const end = () => { this.move = null; this.gravityScale = 1; this.dashing = false; };
    switch (m.type) {
      case 'flashJump': {
        // 空気抵抗なしで前へ。ロープに触れたら掴める（メイプル風）
        this.vx = m.speed;
        moveAndCollide(this, g.map, dt);
        if (ctrl && inp.down('up') && this.ropeCd <= 0) {
          const r = findRope(g.map, this.x, this.y - 4, 20);
          if (r && this.y > r.top + 4) { end(); return this.grabRope(r); }
        }
        if (this.onGround || m.t <= 0) end();
        break;
      }
      case 'teleport': {
        // 瞬間移動直後の短い硬直（残像演出用）
        this.vx *= 0.5;
        moveAndCollide(this, g.map, dt);
        if (m.t <= 0) end();
        break;
      }
      case 'rush': {
        this.dashing = true;
        const oldX = this.x;
        this.vx = m.dir * m.speed; this.vy = 0;
        this.gravityScale = 0;
        const res = moveAndCollide(this, g.map, dt);
        this.gravityScale = 1;
        if (m.push) {
          const minX = Math.min(oldX, this.x) - 24;
          const rect = { x: minX, y: this.y - this.h - 6, w: Math.abs(this.x - oldX) + 48 + this.w, h: this.h + 12 };
          rect.x -= this.w / 2;
          const hits = playerAttackArea(g, rect, m.push.mult, { hits: 1, knock: m.push.knock ?? 420, attackId: m.attackId, effect: 'hit', color: m.color, knockDir: m.dir, maxTargets: 10 });
          if (hits.length) this.afterHits(hits, m);
        }
        if (Math.random() < 0.7) spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { color: m.color, facing: m.dir, trail: true });
        if (m.t <= 0 || res.hitWall) { end(); this.vx = m.dir * Math.min(m.speed, 360) * 0.5; }
        break;
      }
      case 'glide': {
        this.gravityScale = m.gravityScale;
        this.vx = m.dir * m.speed;
        if (this.vy > 140) this.vy = 140; // 落下速度を抑える
        const res = moveAndCollide(this, g.map, dt);
        this.gravityScale = 1;
        if (Math.random() < 0.5) spawnEffect(g, 'dash', this.x, this.y - this.h / 2, { color: m.color, facing: m.dir, trail: true });
        m.el = (m.el || 0) + dt;
        // 着地（離陸直後を除く）・壁・時間切れで終了。勢いは空中制御の空気抵抗でなめらかに減衰
        if (m.t <= 0 || res.hitWall || (this.onGround && m.el > 0.15)) end();
        break;
      }
      case 'wheelDash': {
        this.dashing = true;
        // 逆方向キーで切り返し
        const L = ctrl && inp.down('left'), R = ctrl && inp.down('right');
        const want = (R ? 1 : 0) - (L ? 1 : 0);
        if (want && want !== m.dir) { m.dir = want; this.vx *= -0.3; }
        this.facing = m.dir;
        const target = m.dir * m.speed;
        this.vx += (target - this.vx) * Math.min(1, 10 * dt);
        // ジャンプで勢いを保ったまま跳ぶ（ダッシュ終了）
        if (ctrl && inp.pressed('jump') && this.onGround) {
          this.vy = -normJump(st.jump); this.onGround = false;
          end(); moveAndCollide(this, g.map, dt); break;
        }
        const res = moveAndCollide(this, g.map, dt);
        if (!this.onGround) m.airT += dt; else m.airT = 0;
        if (m.contact) {
          m.hitT -= dt;
          if (m.hitT <= 0) { m.hitT = 0.35; m.attackId = newAttackId(); } // 0.35 秒ごとに同じ敵へ再ヒット可
          const rect = { x: this.x - this.w / 2 - 20, y: this.y - this.h, w: this.w + 40, h: this.h };
          const hits = playerAttackArea(g, rect, m.contact.mult, { hits: 1, knock: m.contact.knock ?? 360, attackId: m.attackId, effect: 'hit', color: m.color, knockDir: m.dir, maxTargets: 8 });
          if (hits.length) this.afterHits(hits, m);
        }
        if (Math.random() < 0.8) spawnEffect(g, 'dash', this.x - m.dir * 20, this.y - 6, { color: m.color, facing: m.dir, trail: true, small: true });
        if (m.t <= 0 || res.hitWall || m.airT > 0.12) { end(); if (this.onGround) this.vx = m.dir * Math.min(m.speed, normSpeed(st.speed) * 1.2); }
        break;
      }
      default: end(); moveAndCollide(this, g.map, dt);
    }
  }

  /** 移動スキル・通常攻撃の命中後処理: ファイナルアタック（1技1回）。コンボは combat.damageEnemy → systems/combo.js が数える */
  afterHits(hits, m = null) {
    if (!hits || !hits.length) return;
    const g = this.game;
    const foes = hits.filter((e) => e && !e.civilian); // 市民にはファイナルアタックを出さない
    if (foes.length && (!m || !m.faDone)) { if (m) m.faDone = true; try { tryFinalAttack(g, foes); } catch (e) { /* noop */ } }
  }

  /** 横テレポート: 壁・マップ端の手前で止まる（壁抜け不可） */
  teleportHorizontal(dir, dist) {
    const map = this.game.map;
    const step = 8;
    let x = this.x;
    const hw = this.w / 2;
    for (let d = 0; d < dist; d += step) {
      const nx = x + dir * Math.min(step, dist - d);
      if (nx < hw || nx > map.width - hw) break;
      const r = { x: nx - hw, y: this.y - this.h, w: this.w, h: this.h - 1 };
      if ((map.walls || []).some((w) => rectOverlap(r, w))) break;
      x = nx;
    }
    this.x = x;
    // 足元の足場（同じ高さ）に乗ったまま。無ければ自然に落下
    const plat = (map.platforms || []).find((p) => !p.ceiling && Math.abs(p.y - this.y) < 1 && x >= p.x && x <= p.x + p.w);
    if (plat) { this.groundPlat = plat; this.onGround = true; }
    else if (this.y < map.groundY - 0.5) { this.onGround = false; this.groundPlat = null; }
  }

  /** 縦テレポート: 上下 dist 以内の足場の上に着地（solid の天井・壁は抜けない） */
  teleportVertical(sgn, dist) {
    const map = this.game.map;
    const x = this.x, y = this.y;
    const solidBetween = (y1, y2) => (map.platforms || []).some((p) => p.solid === true && x >= p.x && x <= p.x + p.w && p.y > Math.min(y1, y2) && p.y < Math.max(y1, y2));
    const blockedAt = (ny) => (map.walls || []).some((w) => rectOverlap({ x: x - this.w / 2, y: ny - this.h, w: this.w, h: this.h - 1 }, w));
    const surfaces = (map.platforms || []).filter((p) => !p.ceiling && x >= p.x + 4 && x <= p.x + p.w - 4).map((p) => ({ y: p.y, p }));
    surfaces.push({ y: map.groundY, p: null });
    let best = null;
    if (sgn < 0) {
      // 上: 届く範囲で最も高い足場（天井を抜けない）
      for (const s of surfaces) {
        if (s.y >= y - 20 || s.y < y - dist - 20 || s.y - this.h < 0) continue;
        if (solidBetween(y, s.y - 1) || blockedAt(s.y)) continue;
        if (!best || s.y < best.y) best = s;
      }
    } else {
      // 下: 一つ下の足場（無ければ地面まで dist）
      for (const s of surfaces) {
        if (s.y <= y + 20 || s.y > y + dist + 20) continue;
        if (solidBetween(y + 1, s.y + 1) || blockedAt(s.y)) continue;
        if (!best || s.y < best.y) best = s;
      }
    }
    if (best) {
      this.y = best.y; this.vy = 0; this.onGround = true; this.groundPlat = best.p;
    } else if (sgn < 0) {
      // 足場が無ければその場で小さく浮く（落下して元の場所へ）
      const ny = Math.max(this.h + 2, y - Math.min(dist, 120));
      if (!solidBetween(y, ny) && !blockedAt(ny)) { this.y = ny; this.vy = 0; this.onGround = false; this.groundPlat = null; }
    } else {
      const ny = Math.min(map.groundY, y + dist);
      if (!solidBetween(y, ny) && !blockedAt(ny)) { this.y = ny; this.onGround = ny >= map.groundY; this.groundPlat = null; this.dropThrough = 0.1; }
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
      this.skillMotion = opts.motion || null; this.skillHits = opts.hits || 0;
      return true;
    }
    this.skillMotion = null;
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
      this.afterHits(hits);
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
    a.headExpr = this.joyT > 0 && (state === 'idle' || state === 'walk' || state === 'jump') ? 'happy' : null;
    a.damage = st.maxHp ? Math.max(0, Math.min(1, 1 - (s.hp / st.maxHp))) : 0;
    a.flash = this.invulnT > 0 && !this.dead && Math.floor(this.t * 18) % 2 === 0;
    a.alpha = a.flash ? 0.45 : 1; // 被弾無敵中は点滅
    a.scale = 1;
    // 職のオーラ色（render/character.js が anim.aura を描画）・移動スキル種別（エフェクト用）
    let aura = null, tier = 1;
    let motion = null;
    try { const j = currentJob(s); aura = j?.aura || null; tier = j?.tier || 1; motion = j?.tier >= 1 ? j.branch || null : null; } catch (e) { aura = null; }
    a.skillMotion = this.attackLeft > 0 ? this.skillMotion || null : null; a.skillHits = this.skillHits || 0;
    a.motion = motion; // 転職後は職の系統ごとの攻撃モーション（character.js JOB_MOTIONS）
    a.aura = aura;
    a.auraTier = tier; // 職の段階（1〜4次）でオーラが強くなる（character.js drawAuraBack/Front）
    a.move = this.move ? this.move.type : null;
    if (this.move && (this.move.type === 'rush' || this.move.type === 'wheelDash' || this.move.type === 'glide')) a.state = this.move.type === 'glide' ? 'jump' : 'walk';
  }

  // PET（装備中のみ）: 装備との同期 + 更新
  updatePet(dt) {
    const g = this.game;
    const want = g.state?.equipped?.pet || null;
    if ((g.pet?.itemId || null) !== want) syncPet(g);
    if (g.pet) g.pet.update(dt);
  }

  draw(ctx) {
    if (this.game.pet) this.game.pet.draw(ctx);
    if (this.inVehicle) return; // 車側で描画（driver=true）
    const s = this.game.state;
    if (!s) return;
    const look = heroLookOf(s);
    const equip = getEquipLooks(s);
    drawCharacter(ctx, this.x, this.y, look, equip, this.anim);
  }

  rect() { return entRect(this); }
}

/** プレイヤーの見た目: state.look → classes.defaultLook(class, gender) → HERO_LOOKS の順 */
const _lookCache = new WeakMap();
function tagLook(L, cls, g) {
  for (const [k, v] of [['classId', cls], ['gender', g]]) {
    if (!v || L[k] === v) continue;
    try { Object.defineProperty(L, k, { value: v, writable: true, configurable: true, enumerable: false }); } catch (e) { /* ignore */ }
  }
}
export function heroLookOf(state) {
  if (!state) return HERO_LOOKS?.luna;
  if (state.look && typeof state.look === 'object' && state.look.body) {
    // AIの頭・立ち絵用（render/character.js aiHeadOf）。NPC・敵の look には付けない
    const L = state.look;
    if (L.classId !== state.heroId || L.gender !== state.gender) tagLook(L, state.heroId, state.gender);
    return L;
  }
  let lk = _lookCache.get(state);
  if (lk && lk._k === state.heroId + ':' + state.gender) return lk;
  try { lk = defaultLook(state.heroId, state.gender); } catch (e) { lk = null; }
  if (!lk || !lk.body) lk = (HERO_LOOKS && (HERO_LOOKS[state.heroId] || HERO_LOOKS.luna)) || null;
  if (lk) { lk = { ...lk, classId: state.heroId, gender: state.gender }; Object.defineProperty(lk, '_k', { value: state.heroId + ':' + state.gender }); _lookCache.set(state, lk); }
  return lk;
}

function weaponColor(state) {
  const id = state?.equipped?.weapon;
  if (!id) return null;
  const it = getItem(id);
  return it?.look?.accent || it?.look?.color || null;
}
