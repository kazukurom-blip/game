// 戦闘のシミュレーション（DOM を使わないので Node でも動く）。
// 主人公・召喚物・敵・弾・地面の効果を毎ティック動かし、見た目のための出来事（fx）を貯める。
// 見た目（render/scene.js）は this.units / this.projs / this.areas を描き、this.fx を読み出して演出する。
//
// 拡張の口:
//   behaviors[name] = (c, caster, p, target) => void      スキルの動き（戦闘担当が増やす）
//   monsterAbilities[id] = { cd, range?, use(c, unit, target) }  敵の特技（ワールド担当が増やす）
//   statusDefs[id] = { ... }                               状態異常
//   power のフック（registry.definePower）                 伝説の力など

import { BAL, P } from '../data/balance.js';
import { MONSTER, ELITE_AFFIXES } from '../data/monsters.js';
import { SKILL } from '../data/skills.js';
import { CLASS } from '../data/classes.js';
import { computeHero, incFor, armorReduction } from './character.js';
import { resolveSkill } from './skills.js';
import { registry } from './registry.js';

export const behaviors = {};
export const monsterAbilities = {};
const ELITE = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));

export const GROUND_Y = 0;
const HERO_TEAM = 'hero';
const ENEMY_TEAM = 'enemy';

// ---------------- 状態異常
export const statusDefs = {
  ignite: { name: '炎上', dot: true, dur: 3, dpsMul: 0.25, color: '#ff7a2a' },
  poison: { name: '毒', dot: true, dur: 4, dpsMul: 0.15, stack: 20, color: '#7cff5a' },
  bleed: { name: '出血', dot: true, dur: 4, dpsMul: 0.2, color: '#ff3a3a' },
  freeze: { name: '凍結', dur: 1, immune: 2.5, color: '#9ae8ff' },
  shock: { name: '感電', dur: 3, taken: 0.2, color: '#ffe45a' },
  chill: { name: '冷却', dur: 2, slow: 0.35, color: '#7fd8ff' },
  stun: { name: '気絶', dur: 1, immune: 2, color: '#ffffff' },
  vuln: { name: '脆弱', dur: 4, taken: 0.15, color: '#c77dff' },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.rng = game.rng;
    this.reset();
  }

  reset() {
    this.units = [];
    this.projs = [];
    this.areas = [];
    this.fx = [];
    this.time = 0;
    this.hero = null;
    this.nextId = 1;
    this.H = null;
    this.powers = [];
    this.buffs = [];
    this.leechBudget = 0;
    this.stats = { dmgDone: 0, dmgTaken: 0, window: [] };
  }

  get state() { return this.game.state; }

  // ---------------- 主人公
  setupHero() {
    const keep = this.units.filter((u) => u.team === HERO_TEAM && u.kind !== 'hero' && !u.dead);
    this.units = this.units.filter((u) => u.team !== HERO_TEAM || keep.includes(u));
    this.recalc(true);
    const cls = CLASS[this.state.hero.cls];
    const h = {
      id: this.nextId++, team: HERO_TEAM, kind: 'hero', name: this.state.hero.name, x: 0, y: 0, z: 0, vx: 0,
      life: this.H.life, maxLife: this.H.life, resource: Math.min(this.H.resourceMax, cls.resource.start), level: this.state.hero.level,
      cds: {}, busy: 0, pending: null, anim: { s: 'idle', t: 0 }, face: 1, statuses: {}, hitFlash: 0, dead: false, deadT: 0, size: 1,
      art: `hero.${cls.id}`,
    };
    this.hero = h;
    this.units.unshift(h);
    return h;
  }

  /** 装備やバフが変わったら呼ぶ。ライフの割合は保つ */
  recalc(full = false) {
    const extra = [];
    for (const b of this.buffs) extra.push(...b.mods);
    const H = computeHero(this.state, this.game, { extraMods: extra });
    this.H = H;
    this.powers = registry.activePowers(this.state, this.game);
    // 力の数値効果は registry の heroSource 側で入れる。ここでは戦闘フックだけ使う
    const h = this.hero;
    if (h) {
      const ratio = full ? 1 : h.life / Math.max(1, h.maxLife);
      h.maxLife = H.life;
      h.life = Math.min(H.life, Math.max(1, H.life * ratio));
      h.resource = Math.min(h.resource, H.resourceMax);
      h.level = this.state.hero.level;
      // 召喚物の上限を超えていたら消す
    }
    this.skillCache = {};
  }

  /** スキルの数値（power の modifySkill 込み）。1 回の recalc の間はキャッシュ */
  params(skillId) {
    if (this.skillCache?.[skillId]) return this.skillCache[skillId];
    const p = resolveSkill(this.state, this.H, skillId);
    if (!p) return null;
    for (const pw of this.powers) {
      const fn = pw.def.hooks?.modifySkill;
      if (fn) { try { fn(this, SKILL[skillId], p, pw.v); } catch (e) { console.error(e); } }
    }
    this.skillCache[skillId] = p;
    return p;
  }

  hook(name, ...args) {
    for (const pw of this.powers) {
      const fn = pw.def.hooks?.[name];
      if (fn) { try { fn(this, ...args, pw.v, pw); } catch (e) { console.error(`[power:${pw.id}:${name}]`, e); } }
    }
  }

  addBuff(id, mods, dur, opts = {}) {
    const ex = this.buffs.find((b) => b.id === id);
    if (ex) { ex.t = Math.max(ex.t, dur); if (opts.stack) { ex.stacks = Math.min(opts.maxStacks || 99, (ex.stacks || 1) + 1); ex.mods = mods.map((m) => ({ ...m, v: m.v * ex.stacks })); this.recalc(); } return; }
    this.buffs.push({ id, mods, t: dur, name: opts.name || id, icon: opts.icon, stacks: 1 });
    this.recalc();
  }

  // ---------------- 敵
  /**
   * 敵を出す。opts: { level, rank, x, y, elite: [affixId], lifeMul, dmgMul, xpMul }
   */
  spawnMonster(defId, opts = {}) {
    const def = MONSTER[defId];
    if (!def) return null;
    const L = opts.level || 1;
    const rank = opts.rank || (def.boss ? 'boss' : 'normal');
    const rk = BAL.RANK[rank] || BAL.RANK.normal;
    const elite = opts.elite || [];
    let lifeMul = (def.life || 1) * rk.life * (opts.lifeMul || 1);
    let dmgMul = (def.dmg || 1) * rk.dmg * (opts.dmgMul || 1);
    let speed = def.speed || 80;
    let atkCd = def.atkCd || 1.6;
    let size = (def.size || 1) * (rank === 'champion' || rank === 'rare' ? 1.15 : 1) * (opts.sizeMul || 1);
    let element = def.element || 'phys';
    const flags = {};
    for (const id of elite) {
      const a = ELITE[id];
      if (!a) continue;
      const m = a.mods;
      if (m.life) lifeMul *= m.life;
      if (m.dmg) dmgMul *= m.dmg;
      if (m.speed) speed *= m.speed;
      if (m.atkCd) atkCd *= m.atkCd;
      if (m.size) size *= m.size;
      if (m.element) element = m.element;
      Object.assign(flags, m);
    }
    const maxLife = BAL.monsterLife(L) * lifeMul;
    const u = {
      id: this.nextId++, team: ENEMY_TEAM, kind: 'monster', def, defId, name: def.name, rank, elite, flags,
      x: opts.x ?? (this.hero ? this.hero.x + 700 : 700), y: opts.y ?? this.rng.range(-36, 36), z: def.flying ? 60 : 0, vx: 0,
      life: maxLife, maxLife, dmg: BAL.monsterDmg(L) * dmgMul, level: L, speed, range: def.range || 70, atkCd, atkT: this.rng.range(0.3, atkCd),
      element, res: { ...(def.res || {}) }, dr: flags.dr || 0, size, boss: !!def.boss || rank === 'boss' || rank === 'actboss' || rank === 'guardian',
      anim: { s: 'walk', t: this.rng.range(0, 1) }, face: -1, statuses: {}, hitFlash: 0, dead: false, deadT: 0, windup: 0,
      xpMul: opts.xpMul || 1, goldMul: opts.goldMul || 1, lootMul: opts.lootMul || 1, abilityT: {}, art: `monster.${defId}`, tag: opts.tag,
    };
    if (def.abilities) for (const ab of def.abilities) u.abilityT[ab] = (monsterAbilities[ab]?.cd || 6) * this.rng.range(0.4, 1);
    this.units.push(u);
    if (u.boss) this.emit({ t: 'boss', unit: u });
    return u;
  }

  /** 召喚物（味方） */
  spawnMinion(kind, p, opts = {}) {
    const H = this.H;
    const h = this.hero;
    const life = H.life * (p.summon?.life || 1) * H.minionLife;
    const u = {
      id: this.nextId++, team: HERO_TEAM, kind: 'minion', name: opts.name || kind, minion: kind, skill: p.id, p,
      x: (h?.x || 0) + this.rng.range(-80, 40), y: this.rng.range(-30, 30), z: 0, vx: 0,
      life, maxLife: life, range: p.summon?.range || 90, aps: (p.summon?.aps || 1) * H.minionAs, atkT: 0.3, speed: 200,
      anim: { s: 'idle', t: 0 }, face: 1, statuses: {}, hitFlash: 0, dead: false, deadT: 0, size: opts.size || 0.85, ttl: opts.ttl || 0,
      art: opts.art || `minion.${kind}`, level: h?.level || 1,
    };
    this.units.push(u);
    this.emit({ t: 'summon', x: u.x, y: u.y, unit: u });
    return u;
  }

  enemies() { return this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead); }
  allies() { return this.units.filter((u) => u.team === HERO_TEAM && !u.dead); }
  enemiesNear(x, y, r) { const r2 = r * r; return this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead && dist2(u.x, u.y, x, y) <= r2 + (u.size * 30) ** 2); }
  nearestEnemy(x, y, maxR = Infinity, filter = null) {
    let best = null; let bd = maxR * maxR;
    for (const u of this.units) {
      if (u.team !== ENEMY_TEAM || u.dead) continue;
      if (filter && !filter(u)) continue;
      const d = dist2(u.x, u.y, x, y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  emit(e) { if (this.fx.length < 600) this.fx.push(e); }

  // ---------------- 1 ティック
  tick(dt) {
    this.time += dt;
    this.leechBudget = Math.min(this.leechBudget + (this.H?.life || 0) * BAL.LEECH_CAP_PER_SEC * dt, (this.H?.life || 0) * BAL.LEECH_CAP_PER_SEC);
    // バフ
    if (this.buffs.length) {
      let changed = false;
      for (const b of this.buffs) { b.t -= dt; if (b.t <= 0) changed = true; }
      if (changed) { this.buffs = this.buffs.filter((b) => b.t > 0); this.recalc(); }
    }
    this.hook('onTick', dt);
    for (const u of this.units) {
      if (u.dead) { u.deadT += dt; continue; }
      u.anim.t += dt;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      this.tickStatuses(u, dt);
      if (u.dead) continue;
      if (u.kind === 'hero') this.tickHero(u, dt);
      else if (u.team === HERO_TEAM) this.tickMinion(u, dt);
      else this.tickMonster(u, dt);
    }
    this.tickProjectiles(dt);
    this.tickAreas(dt);
    // 片付け
    this.units = this.units.filter((u) => !(u.dead && u.deadT > 1.2 && u.kind !== 'hero'));
  }

  tickStatuses(u, dt) {
    const st = u.statuses;
    for (const id in st) {
      const s = st[id];
      if (s.immune !== undefined && s.t <= 0) { s.immune -= dt; if (s.immune <= 0) delete st[id]; continue; }
      if (id === 'poison' && s.stacks) {
        let total = 0;
        for (const k of s.stacks) { k.t -= dt; total += k.dps; }
        s.stacks = s.stacks.filter((k) => k.t > 0);
        if (total > 0) this.applyDot(u, total * dt, 'poison', s.src);
        if (!s.stacks.length) delete st[id];
        continue;
      }
      s.t -= dt;
      if (statusDefs[id]?.dot && s.dps) this.applyDot(u, s.dps * dt, id === 'ignite' ? 'fire' : 'phys', s.src);
      if (s.t <= 0) {
        const imm = statusDefs[id]?.immune;
        if (imm && s.immune === undefined) { s.immune = u.boss ? imm * 2 : imm; s.t = 0; } else if (s.immune === undefined) delete st[id];
      }
    }
  }

  applyDot(u, amount, element, src) {
    if (u.dead || amount <= 0) return;
    if (u.team === ENEMY_TEAM) {
      const res = Math.max(-100, Math.min(90, (u.res[element] || 0) - (this.H?.resPen || 0)));
      amount *= 1 - res / 100;
      u.dotAcc = (u.dotAcc || 0) + amount;
      u.life -= amount;
      this.stats.dmgDone += amount;
      if (u.dotAcc > u.maxLife * 0.04 || u.life <= 0) { this.emit({ t: 'dmg', x: u.x, y: u.y, z: u.z + 70 * u.size, v: u.dotAcc, el: element, dot: true, team: u.team }); u.dotAcc = 0; }
      if (u.life <= 0) this.killUnit(u, src);
    } else {
      this.damageAlly(u, amount, element, null, true);
    }
  }

  isFrozen(u) { return (u.statuses.freeze && u.statuses.freeze.t > 0) || (u.statuses.stun && u.statuses.stun.t > 0); }
  slowOf(u) { return u.statuses.chill && u.statuses.chill.t > 0 ? 1 - statusDefs.chill.slow : 1; }

  // ---------------- 主人公の動き
  tickHero(h, dt) {
    const H = this.H;
    // リソース
    h.resource = Math.max(0, Math.min(H.resourceMax, h.resource + H.resourceRegen * dt));
    // ライフ再生
    if (h.life < h.maxLife) h.life = Math.min(h.maxLife, h.life + H.lifeRegen * dt);
    for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] -= dt;
    if (this.isFrozen(h)) return;
    // 技の途中
    if (h.busy > 0) {
      h.busy -= dt;
      if (h.pending && h.busy <= h.pending.at) {
        const pd = h.pending; h.pending = null;
        this.executeSkill(h, pd.p, pd.target);
      }
      if (h.channel) { h.x += (h.channel.move || 0) * dt; }
      if (h.busy <= 0) { h.anim = { s: 'idle', t: 0 }; h.channel = null; }
      return;
    }
    const enemies = this.enemies();
    if (!enemies.length) {
      this.walk(h, dt, H.move);
      return;
    }
    // 前にいる一番近い敵
    const target = this.nearestEnemy(h.x, h.y, Infinity, (u) => u.x > h.x - 120) || this.nearestEnemy(h.x, h.y);
    const d = Math.abs(target.x - h.x);
    // スキルを選ぶ（バーの左から。基本攻撃は最後）
    const choice = this.chooseSkill(h, target, d, enemies);
    if (choice) {
      this.startCast(h, choice.p, target);
      return;
    }
    // 近づく
    const basic = this.basicSkill();
    const want = basic ? Math.max(60, basic.range * 0.9) : 100;
    if (d > want) this.walk(h, dt, H.move, target.x > h.x ? 1 : -1);
    else h.anim.s = 'idle';
  }

  basicSkill() {
    const bar = this.state.hero.bar;
    for (const id of bar) { const def = SKILL[id]; if (def?.basic) return this.params(id); }
    return bar[0] ? this.params(bar[0]) : null;
  }

  chooseSkill(h, target, d, enemies) {
    const st = this.state.hero;
    let basic = null;
    for (const id of st.bar) {
      if (!id || !st.skills[id]) continue;
      const def = SKILL[id];
      const p = this.params(id);
      if (!p) continue;
      if (def.basic) { if (!basic) basic = p; continue; }
      const ac = st.autocast[id];
      if (ac && ac.on === false) continue;
      if ((h.cds[id] || 0) > 0) continue;
      if (p.cost > 0 && h.resource < p.cost) continue;
      if (!this.condOk(ac?.cond, h, target, enemies, p)) continue;
      if (!this.inRange(p, h, target, d)) continue;
      return { p };
    }
    if (basic && this.inRange(basic, h, target, d)) return { p: basic };
    return null;
  }

  condOk(cond, h, target, enemies, p) {
    switch (cond) {
      case 'elite': return target.rank !== 'normal' || target.boss;
      case 'boss': return target.boss;
      case 'pack3': return this.enemiesNear(h.x + (p.range || 150) * 0.5, h.y, Math.max(200, p.radius || 0)).length >= 3;
      case 'lowlife': return h.life / h.maxLife < 0.5;
      case 'nobuff': return !this.buffs.some((b) => b.id === p.id);
      default: break;
    }
    if (p.behavior === 'buff') return !this.buffs.some((b) => b.id === p.id && b.t > 1);
    if (p.behavior === 'summon') {
      const n = this.units.filter((u) => u.team === HERO_TEAM && u.skill === p.id && !u.dead).length;
      return n < p.maxSummons;
    }
    return true;
  }

  inRange(p, h, target, d) {
    switch (p.behavior) {
      case 'buff': case 'summon': case 'aura': return true;
      case 'nova': case 'whirl': return d <= (p.radius || 150) * 0.85;
      case 'leap': return d <= (p.range || 450);
      default: return d <= (p.range || 120);
    }
  }

  startCast(h, p, target) {
    const speed = Math.max(0.25, this.H.aps / (this.H.weapon.aps || 1.2));
    const ct = p.castTime / speed;
    if (p.cost > 0) h.resource -= p.cost;
    if (p.cd > 0) h.cds[p.id] = p.cd;
    h.busy = ct;
    h.pending = { p, target, at: ct * 0.45 };
    h.face = target && target.x < h.x ? -1 : 1;
    const isSpell = p.tags.includes('spell');
    h.anim = { s: isSpell ? 'cast' : 'attack', t: 0, dur: ct, skill: p.id, el: p.element };
    this.emit({ t: 'cast', unit: h, skill: p.id, el: p.element, behavior: p.behavior, dur: ct });
    this.hook('onCast', SKILL[p.id], p);
  }

  executeSkill(caster, p, target) {
    if (target?.dead) target = this.nearestEnemy(caster.x, caster.y);
    const fn = behaviors[p.behavior] || behaviors.melee;
    if (p.cost < 0) caster.resource = Math.min(this.H.resourceMax, caster.resource - p.cost);
    fn(this, caster, p, target);
  }

  walk(u, dt, speed, dir = 1) {
    u.x += speed * dt * dir * this.slowOf(u);
    u.face = dir;
    if (u.anim.s !== 'walk') u.anim = { s: 'walk', t: 0 };
  }

  // ---------------- 召喚物
  tickMinion(m, dt) {
    if (m.ttl) { m.ttl -= dt; if (m.ttl <= 0) { m.dead = true; return; } }
    if (this.isFrozen(m)) return;
    if (m.atkT > 0) m.atkT -= dt;
    const h = this.hero;
    const target = this.nearestEnemy(m.x, m.y, 900);
    if (!target) {
      // ついていく
      const fx = (h?.x || 0) - 70 + (m.id % 3) * 30;
      if (Math.abs(fx - m.x) > 30) this.walk(m, dt, Math.max(m.speed, this.H.move * 1.1), fx > m.x ? 1 : -1);
      else m.anim.s = 'idle';
      return;
    }
    const d = Math.abs(target.x - m.x);
    if (d > m.range) { this.walk(m, dt, m.speed, target.x > m.x ? 1 : -1); return; }
    if (m.atkT <= 0) {
      m.atkT = 1 / m.aps;
      m.anim = { s: 'attack', t: 0, dur: 0.4 };
      if (m.range > 200) {
        this.spawnProj({ src: m, team: HERO_TEAM, x: m.x + 20, y: m.y, z: 50, tx: target.x, ty: target.y, speed: 900, p: m.p, range: m.range + 150, art: `fx.${m.p.id}.proj`, el: m.p.element });
      } else {
        this.hitUnit(m, target, m.p, 1);
        this.emit({ t: 'swing', x: target.x, y: target.y, el: m.p.element, small: true, src: m });
      }
    }
  }

  // ---------------- 敵の動き
  tickMonster(u, dt) {
    if (u.flags.regen) u.life = Math.min(u.maxLife, u.life + u.maxLife * u.flags.regen * dt);
    if (this.isFrozen(u)) return;
    const spd = this.slowOf(u);
    if (u.atkT > 0) u.atkT -= dt * spd;
    // 特技
    for (const ab in u.abilityT) {
      u.abilityT[ab] -= dt;
      if (u.abilityT[ab] <= 0) {
        const A = monsterAbilities[ab];
        const tgt = this.targetFor(u);
        if (A && tgt && Math.abs(tgt.x - u.x) <= (A.range || 600)) {
          u.abilityT[ab] = A.cd || 6;
          try { A.use(this, u, tgt); } catch (e) { console.error(e); }
        } else u.abilityT[ab] = 1;
      }
    }
    // 攻撃の溜め
    if (u.windup > 0) {
      u.windup -= dt * spd;
      if (u.windup <= 0) this.monsterStrike(u);
      return;
    }
    const tgt = this.targetFor(u);
    if (!tgt) { u.anim.s = 'idle'; return; }
    const d = Math.abs(tgt.x - u.x);
    if (d > u.range) {
      this.walk(u, dt, u.speed, tgt.x > u.x ? 1 : -1);
      // y も少し寄せる
      u.y += Math.sign(tgt.y - u.y) * Math.min(Math.abs(tgt.y - u.y), 20 * dt);
      return;
    }
    u.face = tgt.x > u.x ? 1 : -1;
    if (u.atkT <= 0) {
      u.atkT = u.atkCd;
      u.windup = 0.35;
      u.strikeTarget = tgt;
      u.anim = { s: 'attack', t: 0, dur: 0.6 };
      if (u.flags.zap && this.rng.chance(0.3)) this.spawnArea({ team: ENEMY_TEAM, x: tgt.x, y: tgt.y, r: 70, delay: 0.8, dmg: u.dmg * 0.8, el: 'lightning', src: u, art: 'fx.enemy.zap' });
    } else if (u.anim.s !== 'attack' || u.anim.t > 0.6) u.anim = { s: 'idle', t: u.anim.t };
  }

  targetFor(u) {
    // 召喚物が近ければそちらを狙う（盾になる）
    let best = null; let bd = Infinity;
    for (const a of this.units) {
      if (a.team !== HERO_TEAM || a.dead) continue;
      const d = Math.abs(a.x - u.x) + (a.kind === 'hero' ? 40 : 0);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  monsterStrike(u) {
    const tgt = u.strikeTarget && !u.strikeTarget.dead ? u.strikeTarget : this.targetFor(u);
    if (!tgt) return;
    const atk = u.def.attack || 'melee';
    if (atk === 'ranged' || atk === 'caster') {
      this.spawnProj({ src: u, team: ENEMY_TEAM, x: u.x - 20 * u.size, y: u.y, z: 50 * u.size, tx: tgt.x, ty: tgt.y, speed: atk === 'caster' ? 520 : 700, dmg: u.dmg, el: u.element, range: u.range + 250, art: `fx.enemy.${u.def.proj || 'orb'}` });
    } else if (atk === 'slam') {
      this.spawnArea({ team: ENEMY_TEAM, x: tgt.x, y: tgt.y, r: 110 * u.size, delay: 0.01, dmg: u.dmg, el: u.element, src: u, art: 'fx.enemy.slam' });
      this.emit({ t: 'shake', power: u.boss ? 6 : 3 });
    } else {
      if (Math.abs(tgt.x - u.x) <= u.range + 40) this.damageAlly(tgt, u.dmg, u.element, u);
      this.emit({ t: 'swing', x: tgt.x, y: tgt.y, el: u.element, enemy: true, src: u });
    }
  }

  // ---------------- 弾と地面
  /** opts: { src, team, x, y, z, tx, ty, angle?, speed, p?（主人公側のスキル）, dmg?（敵の弾）, el, pierce, range, art, explode, mult } */
  spawnProj(o) {
    const ang = o.angle ?? Math.atan2((o.ty ?? o.y) - o.y, (o.tx ?? o.x + 1) - o.x);
    const pr = {
      id: this.nextId++, team: o.team, src: o.src, x: o.x, y: o.y, z: o.z ?? 50, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed * 0.5,
      p: o.p || null, dmg: o.dmg || 0, el: o.el || o.p?.element || 'phys', pierce: o.pierce ?? 0, hit: new Set(), dist: 0, range: o.range || 800,
      art: o.art || (o.p ? `fx.${o.p.id}.proj` : 'fx.enemy.orb'), explode: o.explode || 0, mult: o.mult || 1, size: o.size || 1, t: 0, onHit: o.onHit,
    };
    this.projs.push(pr);
    return pr;
  }

  /** opts: { team, x, y, r, delay, dur, tick, dmg?（敵）, p?（主人公側）, mult, el, src, art, follow, status } */
  spawnArea(o) {
    const a = { id: this.nextId++, team: o.team, x: o.x, y: o.y, r: o.r || 100, delay: o.delay ?? 0, dur: o.dur || 0, tick: o.tick || 0, tickT: 0, t: 0,
      dmg: o.dmg || 0, p: o.p || null, mult: o.mult || 1, el: o.el || o.p?.element || 'phys', src: o.src, art: o.art || (o.p ? `fx.${o.p.id}.area` : 'fx.enemy.area'), follow: o.follow || null, fired: false, status: o.status, onHit: o.onHit };
    this.areas.push(a);
    return a;
  }

  tickProjectiles(dt) {
    for (const pr of this.projs) {
      pr.t += dt;
      const dx = pr.vx * dt; const dy = pr.vy * dt;
      pr.x += dx; pr.y += dy; pr.dist += Math.hypot(dx, dy);
      if (pr.dist > pr.range) { pr.dead = true; continue; }
      const foes = pr.team === HERO_TEAM ? ENEMY_TEAM : HERO_TEAM;
      for (const u of this.units) {
        if (u.dead || u.team !== foes || pr.hit.has(u.id)) continue;
        const rr = 34 * (u.size || 1) + 10;
        if (Math.abs(u.x - pr.x) < rr && Math.abs(u.y - pr.y) < rr * 0.9) {
          pr.hit.add(u.id);
          if (pr.team === HERO_TEAM) {
            this.hitUnit(pr.src, u, pr.p, pr.mult);
            if (pr.onHit) pr.onHit(this, pr, u);
            if (pr.explode) {
              for (const v of this.enemiesNear(pr.x, pr.y, pr.explode)) if (v !== u) this.hitUnit(pr.src, v, pr.p, pr.mult * 0.6);
              this.emit({ t: 'nova', x: pr.x, y: pr.y, r: pr.explode, el: pr.el, skill: pr.p?.id, small: true });
            }
          } else {
            this.damageAlly(u, pr.dmg, pr.el, pr.src);
          }
          this.emit({ t: 'hit', x: pr.x, y: pr.y, z: pr.z, el: pr.el, skill: pr.p?.id });
          if (pr.pierce-- <= 0) { pr.dead = true; break; }
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  tickAreas(dt) {
    for (const a of this.areas) {
      a.t += dt;
      if (a.follow) { a.x = a.follow.x; a.y = a.follow.y; if (a.follow.dead) a.dead = true; }
      if (!a.fired && a.t >= a.delay) {
        a.fired = true;
        this.areaPulse(a);
        if (!a.dur) { a.dead = true; continue; }
      }
      if (a.fired && a.dur) {
        if (a.tick) { a.tickT += dt; while (a.tickT >= a.tick) { a.tickT -= a.tick; this.areaPulse(a); } }
        if (a.t >= a.delay + a.dur) a.dead = true;
      }
    }
    this.areas = this.areas.filter((a) => !a.dead || a.t < 0);
  }

  areaPulse(a) {
    if (a.team === HERO_TEAM) {
      for (const u of this.enemiesNear(a.x, a.y, a.r)) {
        this.hitUnit(a.src || this.hero, u, a.p, a.mult);
        if (a.onHit) a.onHit(this, a, u);
      }
    } else {
      for (const u of this.allies()) if (dist2(u.x, u.y, a.x, a.y) <= a.r * a.r) this.damageAlly(u, a.dmg, a.el, a.src);
    }
    this.emit({ t: 'pulse', x: a.x, y: a.y, r: a.r, el: a.el, team: a.team, art: a.art, skill: a.p?.id });
  }

  // ---------------- ダメージ
  /** 主人公側 → 敵。p はスキルの数値、mult は追加の倍率。戻り値は与えたダメージ */
  hitUnit(src, target, p, mult = 1, opts = {}) {
    if (!target || target.dead || !p) return 0;
    const H = this.H;
    const rng = this.rng;
    const w = rng.range(H.weapon.min, H.weapon.max) + H.addTotal;
    const el = opts.element || p.element || 'phys';
    const tags = p.tags || [];
    let inc = incFor(H, el, tags, p.id);
    if (target.rank !== 'normal' && !target.boss) inc += H.dmgElite;
    if (target.boss) inc += H.dmgBoss + H.dmgElite * 0.5;
    if (target.life / target.maxLife < 0.3) inc += H.dmgLow;
    inc += H.S[`family_dmg:${target.def?.family}`] || 0;
    let dmg = w * ((p.dmgPct || 100) / 100) * (p.dmgMul || 1) * mult * (1 + inc / 100) * H.more;
    const crit = rng.chance(H.critChance + (p.extra?.critBonus || 0));
    if (crit) dmg *= H.critMult + (p.extra?.critDmgBonus || 0);
    const res = Math.max(-100, Math.min(90, (target.res[el] || 0) - H.resPen));
    dmg *= 1 - res / 100;
    let taken = 1;
    if (target.statuses.shock?.t > 0) taken += statusDefs.shock.taken;
    if (target.statuses.vuln?.t > 0) taken += statusDefs.vuln.taken;
    dmg *= taken * (1 - (target.dr || 0));
    if (!(dmg > 0)) return 0;
    const hit = { src, target, dmg, crit, element: el, skill: p, tags };
    if (!opts.noProc) {
      this.hook('onHit', hit);
      if (crit) this.hook('onCrit', hit);
    }
    dmg = hit.dmg;
    target.life -= dmg;
    target.hitFlash = 0.12;
    if (!target.boss && target.kind === 'monster') target.x += 4 * (src && src.x > target.x ? -1 : 1);
    this.stats.dmgDone += dmg;
    if (dmg > (this.state.meta.stats.highestHit || 0)) this.state.meta.stats.highestHit = dmg;
    this.emit({ t: 'dmg', x: target.x, y: target.y, z: target.z + 70 * target.size, v: dmg, crit, el, team: target.team });
    // 状態異常
    if (!opts.noProc) this.applyStatusOnHit(target, p, el, dmg);
    // 回復
    const h = this.hero;
    if (h && !h.dead && (src === h || src?.team === HERO_TEAM)) {
      if (H.lifeOnHit && src === h) h.life = Math.min(h.maxLife, h.life + H.lifeOnHit * (opts.aoeHit ? 0.3 : 1));
      if (H.leech && this.leechBudget > 0) { const l = Math.min(this.leechBudget, dmg * H.leech); this.leechBudget -= l; h.life = Math.min(h.maxLife, h.life + l); }
      if (src === h && H.resourceOnHit > 0 && p.basic) h.resource = Math.min(H.resourceMax, h.resource + H.resourceOnHit);
    }
    // 連撃
    if (!opts.noProc && !opts.multi && H.multistrike > 0 && rng.chance(H.multistrike) && (tags.includes('attack'))) {
      this.hitUnit(src, target, p, mult, { ...opts, multi: true });
    }
    if (target.life <= 0) this.killUnit(target, src);
    return dmg;
  }

  applyStatusOnHit(target, p, el, dmg) {
    const H = this.H;
    const rng = this.rng;
    const chance = (id, base) => (base || 0) + (p.status?.id === id ? (p.status.chance ?? 0) : 0);
    const statusMul = H.statusDmg * (1 + ((H.S.inc_dot || 0) / 100));
    if (el === 'fire' && rng.chance(chance('ignite', H.status.ignite))) this.addStatus(target, 'ignite', { dps: dmg * statusDefs.ignite.dpsMul * statusMul });
    if (el === 'cold' && rng.chance(chance('freeze', H.status.freeze))) this.addStatus(target, 'freeze', { dur: p.status?.id === 'freeze' ? p.status.dur : undefined });
    if (el === 'cold') this.addStatus(target, 'chill', {});
    if (el === 'lightning' && rng.chance(chance('shock', H.status.shock))) this.addStatus(target, 'shock', {});
    if (rng.chance(chance('poison', H.status.poison))) this.addStatus(target, 'poison', { dps: dmg * statusDefs.poison.dpsMul * statusMul });
    if (el === 'phys' && rng.chance(chance('bleed', H.status.bleed))) this.addStatus(target, 'bleed', { dps: dmg * statusDefs.bleed.dpsMul * statusMul });
    if (p.status && !['ignite', 'freeze', 'shock', 'poison', 'bleed'].includes(p.status.id) && rng.chance(p.status.chance ?? 1)) this.addStatus(target, p.status.id, { dur: p.status.dur });
  }

  addStatus(u, id, o = {}) {
    const def = statusDefs[id];
    if (!def || u.dead) return;
    const st = u.statuses;
    if (id === 'poison') {
      st.poison ||= { stacks: [], src: this.hero };
      if (st.poison.stacks.length >= (def.stack || 20)) st.poison.stacks.shift();
      st.poison.stacks.push({ t: o.dur || def.dur, dps: o.dps || 0 });
      return;
    }
    const cur = st[id];
    if (cur && cur.immune !== undefined && cur.t <= 0) return; // 免疫中
    const dur = (o.dur || def.dur) * (u.boss && (id === 'freeze' || id === 'stun') ? 0.35 : 1);
    if (cur && cur.t > 0) { cur.t = Math.max(cur.t, dur); if (o.dps) cur.dps = Math.max(cur.dps || 0, o.dps); return; }
    st[id] = { t: dur, dps: o.dps || 0, src: this.hero };
    if (id === 'freeze' || id === 'stun') this.emit({ t: 'text', x: u.x, y: u.y, z: u.z + 90 * u.size, text: def.name, color: def.color });
  }

  /** 敵 → 主人公・召喚物 */
  damageAlly(u, amount, element = 'phys', from = null, isDot = false) {
    if (!u || u.dead || !(amount > 0)) return 0;
    const H = this.H;
    const isHero = u.kind === 'hero';
    if (!isDot) {
      if (isHero && this.rng.chance(H.dodge)) { this.emit({ t: 'text', x: u.x, y: u.y, z: 100, text: '回避', color: '#9ad0ff' }); return 0; }
      if (isHero && H.block > 0 && this.rng.chance(H.block)) { amount *= 1 - BAL.BLOCK_REDUCE; this.emit({ t: 'text', x: u.x, y: u.y, z: 100, text: 'ブロック', color: '#e0e0e0' }); }
    }
    const L = from?.level || u.level || 1;
    if (element === 'phys') amount *= 1 - armorReduction(H.armor * (isHero ? 1 : 0.5), L);
    else amount *= 1 - Math.max(-100, H.res[element] || 0) / 100;
    amount *= 1 - H.dr;
    const info = { amount, element, from, target: u };
    if (isHero) this.hook('onDamaged', info);
    amount = Math.max(0, info.amount);
    u.life -= amount;
    u.hitFlash = 0.1;
    if (isHero) this.stats.dmgTaken += amount;
    this.emit({ t: 'dmg', x: u.x, y: u.y, z: 80, v: amount, el: element, team: HERO_TEAM, hero: isHero });
    if (from && !isDot && H.thorns > 0 && isHero && !from.dead) {
      from.life -= H.thorns;
      if (from.life <= 0) this.killUnit(from, u);
    }
    if (from?.flags?.leech) from.life = Math.min(from.maxLife, from.life + amount * from.flags.leech);
    if (from?.flags?.chill && isHero) this.addStatus(u, 'chill', {});
    if (u.life <= 0) {
      u.life = 0; u.dead = true; u.deadT = 0; u.anim = { s: 'die', t: 0 };
      if (isHero) { this.emit({ t: 'heroDeath', unit: u }); this.game.events.emit('heroDeath', { unit: u }); }
    }
    return amount;
  }

  killUnit(u, src) {
    if (u.dead) return;
    u.dead = true; u.deadT = 0; u.life = 0; u.anim = { s: 'die', t: 0 };
    if (u.team === ENEMY_TEAM) {
      const h = this.hero;
      if (h && !h.dead && this.H.lifeOnKill) h.life = Math.min(h.maxLife, h.life + this.H.lifeOnKill);
      this.hook('onKill', u);
      if (u.flags?.deathBlast) this.spawnArea({ team: ENEMY_TEAM, x: u.x, y: u.y, r: 120, delay: 0.8, dmg: u.dmg * 1.5, el: 'fire', src: u, art: 'fx.enemy.blast' });
      if (u.flags?.split && !u.isSplit) {
        for (let i = 0; i < u.flags.split; i++) {
          const c = this.spawnMonster(u.defId, { level: u.level, rank: 'normal', x: u.x + (i ? 30 : -30), y: u.y + (i ? 15 : -15), lifeMul: 0.5, sizeMul: 0.7, xpMul: 0.3, lootMul: 0.2 });
          if (c) c.isSplit = true;
        }
      }
      this.emit({ t: 'death', unit: u });
      this.game.events.emit('kill', { unit: u, src });
    }
  }

  /** 全部片付ける（ステージ変更など）。召喚物は残す */
  clearEnemies() {
    this.units = this.units.filter((u) => u.team === HERO_TEAM);
    this.projs = [];
    this.areas = this.areas.filter((a) => a.team === HERO_TEAM && a.follow);
  }

  reviveHero() {
    const h = this.hero;
    if (!h) return;
    h.dead = false; h.life = h.maxLife; h.statuses = {}; h.busy = 0; h.pending = null; h.anim = { s: 'idle', t: 0 };
    h.resource = Math.max(h.resource, this.H.resourceMax * 0.5);
    this.emit({ t: 'revive', unit: h });
  }
}

function dist2(x1, y1, x2, y2) { const dx = x1 - x2; const dy = (y1 - y2) * 1.4; return dx * dx + dy * dy; }

// ---------------- 基本の動き（戦闘担当がもっと増やす: leap, beam, whirl, aura, trap, dot ...）
behaviors.melee = (c, h, p, target) => {
  if (!target) return;
  const r = p.radius || 50;
  const hits = c.enemiesNear(target.x, target.y, r);
  if (!hits.includes(target)) hits.unshift(target);
  hits.forEach((u, i) => c.hitUnit(h, u, p, 1, { aoeHit: i > 0 }));
  c.emit({ t: 'swing', x: target.x, y: target.y, r, el: p.element, skill: p.id, src: h });
};

behaviors.projectile = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const baseAng = target ? Math.atan2((target.y - h.y) * 2, target.x - h.x) : 0;
  const spread = n > 1 ? p.spread : 0;
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? baseAng - spread / 2 + (spread * i) / (n - 1) : baseAng;
    c.spawnProj({ src: h, team: HERO_TEAM, x: h.x + 30 * h.face, y: h.y, z: 55, angle: a, speed: p.speed, p, pierce: p.pierce, range: p.range + 250, explode: p.explode });
  }
};

behaviors.nova = (c, h, p) => {
  const r = p.radius || 150;
  const hits = c.enemiesNear(h.x, h.y, r);
  hits.forEach((u, i) => c.hitUnit(h, u, p, 1, { aoeHit: i > 0 }));
  c.emit({ t: 'nova', x: h.x, y: h.y, r, el: p.element, skill: p.id });
  if (hits.length >= 3) c.emit({ t: 'shake', power: 2 });
};

behaviors.rain = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const tx = target ? target.x : h.x + 300;
  const ty = target ? target.y : 0;
  for (let i = 0; i < n; i++) {
    c.spawnArea({ team: HERO_TEAM, x: tx + c.rng.range(-90, 90) * (n > 1 ? 1 : 0), y: ty + c.rng.range(-30, 30) * (n > 1 ? 1 : 0), r: p.radius || 100, delay: (p.delay || 0.35) + i * 0.08, p, src: h });
  }
};

behaviors.chain = (c, h, p, target) => {
  if (!target) return;
  const pts = [{ x: h.x + 30, y: h.y, z: 60 }];
  const hit = new Set();
  let cur = target; let mult = 1;
  for (let i = 0; i <= Math.max(0, p.chain || 3) && cur; i++) {
    hit.add(cur.id);
    c.hitUnit(h, cur, p, mult, { aoeHit: i > 0 });
    pts.push({ x: cur.x, y: cur.y, z: cur.z + 40 * cur.size });
    mult *= 0.85;
    const from = cur;
    cur = c.nearestEnemy(from.x, from.y, 320, (u) => !hit.has(u.id));
  }
  c.emit({ t: 'chain', pts, el: p.element, skill: p.id });
};

behaviors.summon = (c, h, p) => {
  const mine = c.units.filter((u) => u.team === HERO_TEAM && u.skill === p.id && !u.dead);
  const want = Math.max(1, p.maxSummons);
  const n = Math.min(want - mine.length, p.summon?.count || 1);
  for (let i = 0; i < n; i++) c.spawnMinion(p.summon?.unit || 'skeleton', p, { ttl: p.summon?.ttl || 0 });
  for (const m of mine) m.life = m.maxLife;
};

behaviors.buff = (c, h, p) => {
  const b = p.buff || { mods: [], dur: 5 };
  const lvl = p.lvl || 1;
  const mods = (b.mods || []).map((m) => ({ s: m.s, v: m.v + (m.per || 0) * (lvl - 1) }));
  c.addBuff(p.id, mods, b.dur || 5, { name: p.def?.name });
  c.emit({ t: 'buff', unit: h, el: p.element, skill: p.id });
};
