// 戦闘のシミュレーション（DOM を使わないので Node でも動く）。
// 主人公・召喚物・敵・弾・地面の効果を毎ティック動かし、見た目のための出来事（fx）を貯める。
// 見た目（render/scene.js）は this.units / this.projs / this.areas を描き、this.fx を読み出して演出する。
// fx の種類の一覧は game/content/combat.js の先頭（アート担当向け）。
//
// 拡張の口:
//   behaviors[name] = (c, caster, p, target) => void      スキルの動き。behaviors[name].prepare(c, h, p, target, ct) は詠唱の始めに呼ばれる
//   monsterAbilities[id] = { cd, range?, use(c, unit, target) }  敵の特技（ワールド担当が増やす）
//   statusDefs[id] = { ... }                               状態異常
//   unitHooks.*                                            敵・味方の出来事
//   power のフック（registry.definePower）                 伝説の力など
//
// 主人公（kind 'hero'）の見た目に使える値: anim { s: 'idle'|'walk'|'attack'|'cast'|'die', t, dur, skill, el, channel? },
//   z（跳躍中の高さ）, shield / shieldMax（障壁）, channel（詠唱中の技 { kind, skill, t, dur }）, motion（跳躍・突進の移動）
// 召喚物（kind 'minion'）: minion（種類。minion.<種類> の絵）, fly, stationary, temp（奥義などの一時的な物）, ttl
// 地面の効果（areas）: kind（'cloud'|'wall'|'trap'|'orbit'|'aura'|'meteor'|'burn'|'nova' など）, r, len（壁の長さ）, orbit { n, ang }, armed（罠）

import { BAL, P } from '../data/balance.js';
import { MONSTER, ELITE_AFFIXES } from '../data/monsters.js';
import { SKILL } from '../data/skills.js';
import { CLASS } from '../data/classes.js';
import { computeHero, incFor, armorReduction } from './character.js';
import { resolveSkill, castSpeed } from './skills.js';
import { registry } from './registry.js';

export const behaviors = {};
export const monsterAbilities = {};
/** 敵・味方の出来事に差し込む（エリートの詞・ボスの仕掛けなど）。すべて (c, unit, ...) */
export const unitHooks = {
  onSpawn: [], // (c, u) … 出たとき（詞の準備など）
  onMonsterTick: [], // (c, u, dt) … 敵の毎ティック
  onMonsterHit: [], // (c, u, hit) … 敵が主人公側から当てられた（hit.dmg を書き換えてよい）
  onMonsterStrike: [], // (c, u, target) … 敵が攻撃を当てる瞬間
  onMonsterDeath: [], // (c, u, src) … 敵が倒れた
  onHeroTick: [], // (c, h, dt)
};
function runHooks(list, ...args) { for (const f of list) { try { f(...args); } catch (e) { console.error('[unitHook]', e); } } }
const ELITE = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));

export const GROUND_Y = 0;
/** 弾の当たりの楕円の縦横比（縦は横の 0.9 倍） */
const PROJ_Y_RATIO = 0.9;
/**
 * 1 ティックで弾が進んだ線分 (x0,y0)→(x1,y1) と、(cx,cy) を中心とする半径 r の円（縦は 0.9 倍の楕円）の当たり。
 * 当たった位置を線分の割合 0〜1 で返す（始点が中に入っていれば 0）。外れは -1。
 * 速い弾は 1 ティックに 60px 以上進むので、点で調べると近くの敵をすり抜ける（線分で調べる）。
 */
export function sweepHit(x0, y0, x1, y1, cx, cy, r) {
  const k = 1 / PROJ_Y_RATIO;
  const ax = x0 - cx; const ay = (y0 - cy) * k;
  const c0 = ax * ax + ay * ay - r * r;
  if (c0 <= 0) return 0;
  const dx = x1 - x0; const dy = (y1 - y0) * k;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;
  const b = ax * dx + ay * dy;
  if (b >= 0) return -1; // 離れていく向き
  const disc = b * b - a * c0;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}
// 駆け足で詰める敵（突進・自爆はそれぞれの仕組みで詰めるので含めない）
const RUSH_ATTACKS = new Set(['melee', 'slam']);
const HERO_TEAM = 'hero';
const ENEMY_TEAM = 'enemy';
/** 詠唱し続ける動き（動作の後、duration の間ずっと続く） */
export const CHANNEL_BEHAVIORS = new Set(['whirl', 'beam', 'flurry']);
/** 敵がいないあいだ（ウェーブの合間・移動中）の回復: 1 秒に最大ライフの 6%（要石「渇きの王」では回復しない） */
export const OUT_OF_COMBAT_REGEN = 0.06;
/** 近接のクラスが離れた敵へ駆け寄るときの速さの倍率 */
export const MELEE_RUSH = 2.5;
/** 逃げる敵へ罠を投げるとき、敵の少し先へ置く距離（仕掛かるまでの間に敵が進む分） */
export const TRAP_LEAD = 25;

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
  weaken: { name: '衰弱', dur: 4, weaken: 0.2, color: '#8a6aa0' },
  /** 呪い（スキルの curse）。{ vuln, weaken, slow, mark, dps, spread, resOnKill } を持つ */
  curse: { name: '呪い', dur: 6, color: '#a050ff' },
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
    this.timers = [];
    this.corpses = [];
    this.time = 0;
    this.hero = null;
    this.nextId = 1;
    this.H = null;
    this.powers = [];
    this.buffs = [];
    this.leechBudget = 0;
    this.castCount = 0;
    this.critFxT = 0;
    // 合計は増えるだけにする（HUD の DPS は前の値との差で出すので、新しく始めても負にならないように）
    this.stats = { dmgDone: this.stats?.dmgDone || 0, dmgTaken: this.stats?.dmgTaken || 0, window: [] };
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
      art: `hero.${cls.id}`, shield: 0, shieldMax: 0, shieldT: 0, channel: null, motion: null,
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
    }
    this.skillCache = {};
    this.pruneMinions();
  }

  /** 並びから外したスキルの召喚物・上限を超えた召喚物を消す */
  pruneMinions() {
    const bar = this.state?.hero?.bar || [];
    const by = {};
    for (const u of this.units) {
      if (u.kind !== 'minion' || u.dead || u.ttl || u.temp) continue;
      if (!bar.includes(u.skill)) { u.dead = true; u.deadT = 0; u.anim = { s: 'die', t: 0 }; continue; }
      (by[u.skill] ||= []).push(u);
    }
    for (const id in by) {
      const p = this.params(id);
      const max = p ? Math.max(1, p.maxSummons) : 0;
      const list = by[id];
      for (let i = max; i < list.length; i++) { list[i].dead = true; list[i].deadT = 0; }
    }
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
    if (p.status && !p.statuses.includes(p.status)) { const i = p.statuses.findIndex((s) => s.id === p.status.id); if (i >= 0) p.statuses[i] = p.status; else p.statuses.unshift(p.status); }
    (this.skillCache ||= {})[skillId] = p;
    return p;
  }

  hook(name, ...args) {
    for (const pw of this.powers) {
      const fn = pw.def.hooks?.[name];
      if (fn) { try { fn(this, ...args, pw.v, pw); } catch (e) { console.error(`[power:${pw.id}:${name}]`, e); } }
    }
  }

  /** 一時的な強化。opts: { name, icon, stack, maxStacks, skill } */
  addBuff(id, mods, dur, opts = {}) {
    const ex = this.buffs.find((b) => b.id === id);
    if (ex) {
      ex.t = Math.max(ex.t, dur);
      ex.dur = Math.max(ex.dur || 0, dur);
      if (opts.stack) {
        const before = ex.stacks || 1;
        ex.stacks = Math.min(opts.maxStacks || 99, before + 1);
        if (ex.stacks !== before) { ex.mods = mods.map((m) => ({ ...m, v: m.v * ex.stacks })); this.recalc(); }
      }
      return ex;
    }
    const b = { id, mods: mods.map((m) => ({ ...m })), t: dur, dur, name: opts.name || id, icon: opts.icon || (SKILL[id] ? `icon.skill.${id}` : null), stacks: 1, skill: opts.skill || null };
    this.buffs.push(b);
    if (mods.length) this.recalc();
    return b;
  }

  hasBuff(id, minT = 0) { return this.buffs.some((b) => b.id === id && b.t > minT); }

  /** dt 秒後に fn を呼ぶ（戦闘の時間で進む） */
  after(dt, fn) { this.timers.push({ t: dt, fn }); }

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
    let dmgMul = (def.dmg || 1) * rk.dmg * (opts.dmgMul ?? 1);
    let speed = (def.speed || 80) * (BAL.MONSTER_SPEED || 1);
    let atkCd = def.atkCd || 1.6;
    let size = (def.size || 1) * (rank === 'champion' || rank === 'rare' ? 1.15 : 1) * (opts.sizeMul || 1);
    let element = def.element || 'phys';
    const flags = {};
    for (const id of elite) {
      const a = ELITE[id];
      if (!a) continue;
      const m = a.mods || {};
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
    runHooks(unitHooks.onSpawn, this, u);
    if (u.boss) this.emit({ t: 'boss', unit: u });
    return u;
  }

  /**
   * 召喚物（味方）。p はスキルの数値（p.summon の設定を使う）。
   * opts: { name, size, ttl, x, y, art, stationary, temp, mult（与えるダメージの倍率）, unit（種類の上書き） }
   */
  spawnMinion(kind, p, opts = {}) {
    const H = this.H;
    const h = this.hero;
    const s = p.summon || {};
    const life = H.life * (s.life || 1) * H.minionLife;
    const u = {
      id: this.nextId++, team: HERO_TEAM, kind: 'minion', name: opts.name || kind, minion: kind, skill: p.id, p,
      x: opts.x ?? (h?.x || 0) + this.rng.range(-80, 40), y: opts.y ?? this.rng.range(-30, 30), z: s.fly ? 70 : 0, vx: 0,
      life, maxLife: life, range: s.range || 90, aps: (s.aps || 1) * H.minionAs, atkT: 0.3, speed: s.fly ? 260 : 210,
      anim: { s: 'idle', t: 0 }, face: 1, statuses: {}, hitFlash: 0, dead: false, deadT: 0, size: opts.size || s.size || (opts.temp ? 0.8 : 0.85), ttl: opts.ttl || 0,
      art: opts.art || `minion.${kind}`, level: h?.level || 1, fly: !!s.fly, stationary: !!(opts.stationary || s.stationary), temp: !!opts.temp,
      taunt: !!s.taunt, mult: opts.mult || 1, slot: this.units.filter((x) => x.kind === 'minion' && !x.dead).length,
    };
    this.units.push(u);
    this.emit({ t: 'summon', x: u.x, y: u.y, unit: u, skill: p.id, kind });
    return u;
  }

  enemies() { return this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead); }
  /** 生きている敵の数（配列を作らない。毎ティック使う所向け） */
  enemyCount() { let n = 0; for (const u of this.units) if (u.team === ENEMY_TEAM && !u.dead) n++; return n; }
  allies() { return this.units.filter((u) => u.team === HERO_TEAM && !u.dead); }
  minionsOf(skillId) { return this.units.filter((u) => u.kind === 'minion' && !u.dead && u.skill === skillId); }
  enemiesNear(x, y, r) { const r2 = r * r; return this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead && dist2(u.x, u.y, x, y) <= r2 + (u.size * 30) ** 2); }
  /** 一番近い敵。xMin / xMax で横の範囲を絞れる（毎ティック関数を作らずに済む） */
  nearestEnemy(x, y, maxR = Infinity, filter = null, xMin = -Infinity, xMax = Infinity) {
    let best = null; let bd = maxR * maxR;
    for (const u of this.units) {
      if (u.team !== ENEMY_TEAM || u.dead || u.x <= xMin || u.x >= xMax) continue;
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
    const H = this.H;
    const cap = (H?.life || 0) * BAL.LEECH_CAP_PER_SEC * (H?.leechCapMul || 1);
    this.leechBudget = Math.min(this.leechBudget + cap * dt, cap);
    if (this.critFxT > 0) this.critFxT -= dt;
    // バフ
    if (this.buffs.length) {
      let changed = false;
      for (const b of this.buffs) { b.t -= dt; if (b.t <= 0) changed = true; }
      if (changed) {
        const gone = this.buffs.filter((b) => b.t <= 0);
        this.buffs = this.buffs.filter((b) => b.t > 0);
        if (gone.some((b) => b.mods.length)) this.recalc();
      }
    }
    // 遅れて起こること
    if (this.timers.length) {
      const due = [];
      for (const t of this.timers) { t.t -= dt; if (t.t <= 0) due.push(t); }
      if (due.length) {
        this.timers = this.timers.filter((t) => t.t > 0);
        for (const t of due) { try { t.fn(); } catch (e) { console.error('[combat timer]', e); } }
      }
    }
    if (this.corpses.length) { for (const c of this.corpses) c.t -= dt; this.corpses = this.corpses.filter((c) => c.t > 0); }
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
    // 片付ける物があるときだけ作り直す（毎ティック配列を作らない）
    const gone = (u) => u.dead && u.deadT > 1.2 && u.kind !== 'hero';
    if (this.units.some(gone)) this.units = this.units.filter((u) => !gone(u));
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
      if (s.dps && (statusDefs[id]?.dot || id === 'curse')) this.applyDot(u, s.dps * dt, id === 'ignite' ? 'fire' : id === 'curse' ? 'poison' : 'phys', s.src);
      if (u.dead) return;
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
      amount *= this.takenMul(u) * (1 - (u.dr || 0));
      // 毒・炎上・出血も、敵の守り（鋼鉄・結界・ボスの障壁・無敵の間など）を通す（hit.dot = true の刻み）
      if (unitHooks.onMonsterHit.length) {
        const hit = { src: src || this.hero, target: u, dmg: amount, crit: false, element, skill: null, tags: ['dot'], dot: true };
        runHooks(unitHooks.onMonsterHit, this, u, hit);
        amount = hit.dmg;
        if (!(amount > 0)) return;
      }
      u.dotAcc = (u.dotAcc || 0) + amount;
      u.life -= amount;
      this.stats.dmgDone += amount;
      if (u.dotAcc > u.maxLife * 0.04 || u.life <= 0) { this.emit({ t: 'dmg', x: u.x, y: u.y, z: u.z + 70 * u.size, v: u.dotAcc, el: element, dot: true, team: u.team }); u.dotAcc = 0; }
      if (u.life <= 0) this.killUnit(u, src);
    } else {
      this.damageAlly(u, amount, element, null, true);
    }
  }

  /** 敵の受けるダメージの倍率（感電・脆弱・呪い・刻印） */
  takenMul(u) {
    const st = u.statuses;
    let taken = 1;
    if (st.shock?.t > 0) taken += statusDefs.shock.taken;
    if (st.vuln?.t > 0) taken += st.vuln.v ?? statusDefs.vuln.taken;
    if (st.curse?.t > 0) taken += (st.curse.vuln || 0) + (st.curse.mark ? st.curse.vulnMark || 0 : 0);
    return taken;
  }

  isFrozen(u) { return (u.statuses.freeze && u.statuses.freeze.t > 0) || (u.statuses.stun && u.statuses.stun.t > 0); }
  slowOf(u) {
    let k = 1;
    if (u.statuses.chill?.t > 0) k = 1 - statusDefs.chill.slow;
    if (u.statuses.curse?.t > 0 && u.statuses.curse.slow) k = Math.min(k, 1 - u.statuses.curse.slow);
    return k;
  }

  // ---------------- 主人公の動き
  tickHero(h, dt) {
    const H = this.H;
    if (unitHooks.onHeroTick.length) runHooks(unitHooks.onHeroTick, this, h, dt);
    // リソース
    h.resource = Math.max(0, Math.min(H.resourceMax, h.resource + H.resourceRegen * dt));
    // ライフ再生
    if (h.life < h.maxLife) h.life = Math.min(h.maxLife, h.life + H.lifeRegen * dt);
    // 障壁
    if (h.shieldT > 0) { h.shieldT -= dt; if (h.shieldT <= 0) { h.shield = 0; h.shieldMax = 0; } }
    if (h.retaliate && (h.retaliate.t -= dt) <= 0) h.retaliate = null;
    for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] -= dt;
    if (this.isFrozen(h)) { if (h.channel) this.endChannel(h); return; }
    // 跳躍・突進の移動
    if (h.motion) {
      const m = h.motion;
      m.t += dt;
      const k = Math.min(1, m.t / Math.max(0.01, m.dur));
      const e = m.ease === 'in' ? k * k : 1 - (1 - k) * (1 - k);
      h.x = m.x0 + (m.x1 - m.x0) * e;
      h.y = m.y0 + (m.y1 - m.y0) * e;
      h.z = (m.arc || 0) * Math.sin(Math.PI * k);
      if (k >= 1) { h.motion = null; h.z = 0; }
    }
    // 技の途中
    if (h.busy > 0) {
      h.busy -= dt;
      if (h.pending && h.busy <= h.pending.at) {
        const pd = h.pending; h.pending = null;
        this.executeSkill(h, pd.p, pd.target);
      }
      if (h.channel) this.tickChannel(h, dt);
      if (h.busy <= 0) { h.anim = { s: 'idle', t: 0 }; if (h.channel) this.endChannel(h); h.busy = 0; }
      return;
    }
    const enemies = this.enemies();
    if (!enemies.length) {
      if (h.life < h.maxLife && !H.ks.thirst) h.life = Math.min(h.maxLife, h.life + h.maxLife * OUT_OF_COMBAT_REGEN * dt);
      this.walk(h, dt, H.move);
      return;
    }
    // 前にいる一番近い敵
    const target = this.nearestEnemy(h.x, h.y, Infinity, (u) => u.x > h.x - 120) || this.nearestEnemy(h.x, h.y);
    const d = Math.abs(target.x - h.x);
    // スキルを選ぶ（バーの左から。基本攻撃は最後）
    const choice = this.chooseSkill(h, target, d, enemies);
    const basic = this.basicSkill();
    let want = basic ? Math.max(60, basic.range * 0.9) : 100;
    // 待っていても近づいてこない敵（逃げるため込み屋・離れて撃つ敵・召喚物と戦う敵）には、使える技が届く所まで寄る。
    // 基本攻撃の射程の端に立ったままだと、射程の短い技（扇射ち・矢の雨・砲台・罠など）がいつまでも使えない
    // 逃げる敵には、強化・召喚（距離を問わない）のほかは、寄ってから使う
    const close = choice?.far ? this.reach(choice.far, choice.motion) * 0.9 : 0;
    if (close > 0 && close < want) want = close;
    const p = choice?.p;
    const walkFirst = close > 0 && d > close && p && (p.basic || (choice.motion < 0 && Number.isFinite(this.reach(p, choice.motion))));
    if (p && !walkFirst) {
      this.startCast(h, p, target);
      return;
    }
    // 近づく（近接のクラスは離れた敵へ駆け寄る）
    if (d > want) {
      const rush = CLASS[this.state.hero.cls]?.range === 'melee' && d > want + 60 ? MELEE_RUSH : 1;
      this.walk(h, dt, H.move * rush, target.x > h.x ? 1 : -1);
    } else h.anim.s = 'idle';
  }

  basicSkill() {
    const bar = this.state.hero.bar;
    for (const id of bar) { const def = SKILL[id]; if (def?.basic && this.state.hero.skills[id]) return this.params(id); }
    return this.fallbackBasic() || (bar[0] && SKILL[bar[0]] ? this.params(bar[0]) : null);
  }

  /**
   * 並びに基本攻撃が無いとき（基本の枠を外した・技を入れた）に使う、覚えている基本攻撃（レベルの高い物）。
   * 基本攻撃はリソースを使わず、いつでも使える。無いと怒りのたまらない剣闘士などが何もできずに止まる
   */
  fallbackBasic() {
    const sk = this.state.hero.skills;
    let best = null;
    for (const id in sk) { if (SKILL[id]?.basic && sk[id]?.lvl > 0 && (!best || sk[id].lvl > sk[best].lvl)) best = id; }
    return best ? this.params(best) : null;
  }

  chooseSkill(h, target, d, enemies) {
    const st = this.state.hero;
    let basic = null;
    const ctx = { near: null };
    // 離れた敵へは、使える跳躍・突進を先に使う（並びの順より先）
    if (d > 260) {
      for (const id of st.bar) {
        const def = SKILL[id];
        if (!def || (def.behavior !== 'leap' && def.behavior !== 'dash') || !st.skills[id]) continue;
        const ac = st.autocast[id];
        if (ac && ac.on === false) continue;
        const p = this.params(id);
        if (!p || (h.cds[id] || 0) > 0 || (p.cost > 0 && h.resource < p.cost)) continue;
        if (!this.condOk(ac?.cond || p.auto, h, target, enemies, p, ctx) || !this.inRange(p, h, target, d)) continue;
        return { p };
      }
    }
    // 今使える技（待ち時間・リソース・条件。射程はまだ問わない）を並びの順に集める
    const usable = [];
    for (const id of st.bar) {
      if (!id || !st.skills[id]) continue;
      const def = SKILL[id];
      if (!def) continue;
      const p = this.params(id);
      if (!p) continue;
      if (def.basic) { if (!basic) basic = p; continue; }
      const ac = st.autocast[id];
      if (ac && ac.on === false) continue;
      if ((h.cds[id] || 0) > 0) continue;
      if (p.cost > 0 && h.resource < p.cost) continue;
      if (!this.condOk(ac?.cond || p.auto, h, target, enemies, p, ctx)) continue;
      usable.push(p);
    }
    basic ||= this.fallbackBasic();
    // 射程の中の技を左から。ただし待ち時間の無い消費の技（扇射ちなど）は、それを使うとリソースが足りなくなる
    // 右の待ち時間の技（矢の雨など）に先を譲る（左の技がリソースを使い続けて、右の技がいつまでも使われないのを防ぐ）
    let pick = null;
    for (const p of usable) {
      if (!this.inRange(p, h, target, d)) continue;
      if (!pick) { pick = p; if (!(p.cd <= 0 && p.cost > 0)) break; continue; }
      if (p.cd > 0 && p.cost > 0 && h.resource - pick.cost < p.cost) { pick = p; break; }
    }
    // 寄れば使える技（近づいてこない敵だけ。基本攻撃の射程の半分より遠くまで届く技。近くでしか当たらない爆発・回る刃のためには寄らない）
    //   止まっている敵 … 使う技より左にある、射程の外の技（基本攻撃の射程の端に立ったまま、扇射ち・砲台・罠などが使えないのを防ぐ）
    //   逃げる敵       … 射程の外の技のうち一番近くでしか使えない技（ため込み屋に全部の技を当てる）
    const motion = this.motionOf(target, h);
    // 逃げる敵には、届くうちに使わないと使えなくなる技（一番近くでしか使えない技）から使う
    if (motion < 0 && pick) {
      let best = null;
      for (const p of usable) if (this.inRange(p, h, target, d) && (!best || this.reach(p, motion) < this.reach(best, motion))) best = p;
      if (best) pick = best;
    }
    let far = null;
    if (motion <= 0 && basic) {
      const minR = this.reach(basic, motion) * 0.5;
      for (const p of usable) {
        if (this.inRange(p, h, target, d)) { if (motion === 0 && p === pick) break; continue; }
        const r = this.reach(p, motion);
        if (motion === 0) { if (r >= minR) far = p; break; }
        if (r >= minR && (!far || r < this.reach(far, motion))) far = p;
      }
    }
    if (pick) return { p: pick, far: motion < 0 ? far : null, motion };
    if (basic && this.inRange(basic, h, target, d)) return { p: basic, far, motion };
    return far ? { p: null, far, motion } : null;
  }

  /** 敵の動き: 1 = こちらへ歩いてくる（待っていれば射程に入る）/ -1 = 離れていく（逃げる）/ 0 = 止まっている */
  motionOf(u, h) {
    if (!u || u.dead || !h) return 0;
    if (u.goblin) return u.goblin.state === 'flee' ? -1 : 0; // ため込み屋は逃げ出したら、つまずいて止まっている間も「逃げる敵」
    if (u.ctl) return u.ctl.kind === 'dash' ? 1 : 0;
    if (u.anim?.s !== 'walk' || this.isFrozen(u)) return 0; // 凍結・気絶の間は歩く姿のまま止まっている
    return (u.face || 0) === (h.x >= u.x ? 1 : -1) ? 1 : -1;
  }

  /** 召喚物が主人公から離れて戦ってよい距離（主人公の基本攻撃が届く所までは助けに行く） */
  minionLeash() {
    const b = this.basicSkill();
    return Math.max(650, b && b.range > 200 ? b.range + 40 : 0);
  }

  /** 近くの敵の数（h〔主人公・敵〕から横に r 以内） */
  countNear(h, r) {
    let n = 0;
    for (const u of this.units) if (u.team === ENEMY_TEAM && !u.dead && Math.abs(u.x - h.x) <= r) n++;
    return n;
  }

  condOk(cond, h, target, enemies, p, ctx = {}) {
    // 「敵が N 体以上」「大群」は、遠くへ撃つ技（矢の雨・扇射ちなど）なら狙う敵のまわり、主人公のまわりの技（環・強化など）なら主人公のまわりで数える
    // （以前は主人公のまわりだけで、離れて撃つクラスは群れが寄ってくるまで使わなかった）
    const r0 = this.reach(p, 1);
    const at = target && Number.isFinite(r0) && r0 > 300 ? target : h;
    const near = (r) => this.countNear(at, r);
    switch (cond) {
      case 'elite': if (!(target.rank !== 'normal' || target.boss || near(450) >= 5)) return false; break;
      case 'boss': if (!target.boss) return false; break;
      case 'pack3': if (near(400) < 3) return false; break;
      case 'pack5': if (near(450) < 5) return false; break;
      case 'lowlife': if (h.life / h.maxLife >= 0.5) return false; break;
      case 'highres': if (h.resource < this.H.resourceMax * 0.7) return false; break;
      case 'nobuff': if (this.hasBuff(p.id)) return false; break;
      default: break;
    }
    return this.ready(p, h, target);
  }

  /** そのスキルを今使う意味があるか（強化が切れている・召喚物が足りない など） */
  ready(p, h, target) {
    switch (p.behavior) {
      case 'buff': return !this.hasBuff(p.id, 1);
      case 'barrier': return h.shield <= (h.shieldMax || 0) * 0.25 && this.countNear(h, 650) > 0;
      case 'summon': return this.minionsOf(p.id).length < Math.max(1, p.maxSummons);
      case 'turret': { const list = this.minionsOf(p.id); return list.length < p.maxSummons || list.some((m) => m.ttl > 0 && m.ttl < 3); }
      case 'curse': {
        if (p.radius <= 80) return !(target.statuses.curse?.t > 1.5);
        return this.enemiesNear(target.x, target.y, p.radius).some((u) => !(u.statuses.curse?.t > 1.5));
      }
      case 'aura': case 'orbit': return !this.areas.some((a) => a.p?.id === p.id && !a.dead && a.t < a.delay + a.dur - 0.5);
      case 'trap': return this.areas.filter((a) => a.kind === 'trap' && a.p?.id === p.id && !a.dead).length < p.count;
      case 'corpse': return this.corpsesNear(h.x, p.range).some((c) => this.enemiesNear(c.x, c.y, p.radius + 60).length > 0);
      default: return true;
    }
  }

  inRange(p, h, target, d) {
    return d <= this.reach(p, this.motionOf(target, h));
  }

  /**
   * そのスキルが使える、主人公から敵までの横の距離。motion = 敵の動き（motionOf）。こちらへ歩いてくる敵には、近づくのを見越して早めに使える。
   * 回る刃・オーラ（主人公のまわり）と罠（投げた所を踏ませる）は、近づいてこない敵には本当に届く距離でしか使わない
   */
  reach(p, motion = 1) {
    const coming = motion > 0;
    switch (p.behavior) {
      case 'buff': case 'summon': case 'barrier': case 'corpse': return Infinity;
      case 'aura': return coming ? Math.max(200, p.radius || 220) * 1.2 : Math.max(200, p.radius || 220);
      case 'nova': case 'ult_deathmarch': return (p.radius || 150) * 0.85;
      case 'whirl': return (p.radius || 150) + 140;
      case 'orbit': return (p.radius || 120) + (coming ? 280 : 30);
      case 'flurry': return (p.range || 110) + 20;
      case 'leap': case 'ult_cataclysm': case 'dash': return p.range || 450;
      case 'turret': return p.range || 600;
      // 罠: 歩いてくる敵には通り道に先に置く。止まっている敵には足元へ（踏む範囲の分だけ遠くまで）、逃げる敵には少し先へ投げる
      case 'trap': return (p.range || 380) + (coming ? 320 : motion < 0 ? -TRAP_LEAD : (p.radius || 130) * 0.45);
      default: return p.range || 120;
    }
  }

  startCast(h, p, target) {
    const speed = castSpeed(this.H, p);
    const ct = p.castTime / speed;
    if (p.cost > 0) h.resource -= p.cost;
    if (p.cd > 0) h.cds[p.id] = p.cd;
    if (CHANNEL_BEHAVIORS.has(p.behavior)) {
      h.busy = ct + p.duration;
      h.pending = { p, target, at: p.duration };
    } else {
      h.busy = ct;
      h.pending = { p, target, at: ct * 0.45 };
    }
    h.face = target && target.x < h.x ? -1 : 1;
    const isSpell = p.tags.includes('spell');
    h.anim = { s: isSpell ? 'cast' : 'attack', t: 0, dur: ct, skill: p.id, el: p.element, behavior: p.behavior };
    const prep = behaviors[p.behavior]?.prepare;
    if (prep) { try { prep(this, h, p, target, ct); } catch (e) { console.error(e); } }
    this.emit({ t: 'cast', unit: h, skill: p.id, el: p.element, behavior: p.behavior, dur: ct, kind: p.kind });
    if (p.ult) { this.emit({ t: 'ult', skill: p.id, cls: this.state.hero.cls, unit: h, x: h.x, y: h.y, el: p.element, dur: ct }); this.emit({ t: 'shake', power: 5 }); }
    // 熟練度・クラスの特性
    this.game.sys?.skills?.recordCast?.(p);
    const tr = this.H.trait;
    if (tr?.id === 'surge' && isSpell) {
      this.castCount++;
      if (this.castCount % tr.every === 0) {
        this.addBuff('trait_surge', [{ s: 'inc_spell', v: tr.inc }, { s: 'attack_speed', v: tr.speed }], tr.dur, { name: '奔流' });
        this.emit({ t: 'trait', unit: h, cls: 'sorcerer', kind: 'surge' });
      }
    }
    this.hook('onCast', SKILL[p.id], p);
  }

  executeSkill(caster, p, target) {
    if (target?.dead) target = this.nearestEnemy(caster.x, caster.y);
    const fn = behaviors[p.behavior] || behaviors.melee;
    if (p.cost < 0) caster.resource = Math.min(this.H.resourceMax, caster.resource - p.cost);
    if (p.extra?.fillRes) caster.resource = this.H.resourceMax;
    fn(this, caster, p, target);
    if (p.twin) {
      this.after(0.18, () => {
        if (caster.dead) return;
        const t2 = target && !target.dead ? target : this.nearestEnemy(caster.x, caster.y);
        if (t2 || !CHANNEL_BEHAVIORS.has(p.behavior)) fn(this, caster, p, t2);
        this.emit({ t: 'text', x: caster.x, y: caster.y, z: 150, text: '二重詠唱', color: '#c9a0ff' });
      });
    }
  }

  // ---------------- 詠唱し続ける技（旋風・光線・千刃）
  startChannel(h, p, target, kind, extra = {}) {
    const sp = castSpeed(this.H, p);
    h.channel = { kind, p, target, t: 0, dur: p.duration, tick: Math.max(0.05, (p.tick || 0.25) / sp), tickT: 0, skill: p.id, ...extra };
    h.anim = { s: p.tags.includes('spell') ? 'cast' : 'attack', t: 0, dur: p.duration, skill: p.id, el: p.element, channel: kind, behavior: p.behavior };
    this.emit({ t: 'channel', unit: h, skill: p.id, kind, dur: p.duration, el: p.element });
  }

  tickChannel(h, dt) {
    const ch = h.channel;
    ch.t += dt;
    ch.tickT += dt;
    const fn = behaviors[ch.kind]?.tick;
    if (fn) {
      while (ch.tickT >= ch.tick) {
        ch.tickT -= ch.tick;
        try { fn(this, h, ch.p, ch, dt); } catch (e) { console.error(e); }
        if (!h.channel) return;
      }
      if (behaviors[ch.kind]?.move) behaviors[ch.kind].move(this, h, ch.p, ch, dt);
    }
    // 敵がいなくなったら止める
    if (!this.enemyCount()) { h.busy = 0; }
  }

  endChannel(h) {
    const ch = h.channel;
    h.channel = null;
    const fn = ch && behaviors[ch.kind]?.end;
    if (fn) { try { fn(this, h, ch.p, ch); } catch (e) { console.error(e); } }
  }

  walk(u, dt, speed, dir = 1) {
    u.x += speed * dt * dir * this.slowOf(u);
    u.face = dir;
    if (u.anim.s !== 'walk') u.anim = { s: 'walk', t: 0 };
  }

  // ---------------- 召喚物
  tickMinion(m, dt) {
    if (m.ttl) {
      m.ttl -= dt;
      if (m.ttl <= 0) { this.minionExpire(m); return; }
    }
    if (this.isFrozen(m)) return;
    if (m.atkT > 0) m.atkT -= dt;
    const h = this.hero;
    const hx = h?.x || 0;
    // 動かない物（砲台）
    if (m.stationary) {
      if (Math.abs(hx - m.x) > 1100) { this.minionExpire(m); return; }
      const t = this.nearestEnemy(m.x, m.y, m.range + 40);
      if (t) { m.face = t.x > m.x ? 1 : -1; if (m.atkT <= 0) this.minionAttack(m, t); }
      else if (m.anim.s !== 'idle') m.anim = { s: 'idle', t: 0 };
      return;
    }
    // 主人公から離れすぎたら戻る
    const leash = this.minionLeash();
    if (Math.abs(m.x - hx) > leash) {
      this.walk(m, dt, Math.max(m.speed, this.H.move) * 1.6, hx > m.x ? 1 : -1);
      m.y += Math.sign((m.homeY ?? 0) - m.y) * Math.min(Math.abs((m.homeY ?? 0) - m.y), 40 * dt);
      return;
    }
    // 主人公の近く（前 650〜基本攻撃の射程・後ろ 220）の敵だけを狙う。ただし手の届く敵（自分を攻撃している敵など）とは、その範囲の外でも戦う
    const target = this.nearestEnemy(m.x, m.y, 900, null, hx - 220, hx + leash) || this.nearestEnemy(m.x, m.y, m.range + 40);
    if (!target) {
      // ついていく（後ろに並ぶ。飛ぶ物は肩の上）
      const slot = m.slot % 4;
      const fx = m.fly ? hx - 40 - slot * 20 : hx - 70 - slot * 34;
      const fy = m.fly ? -10 + slot * 6 : -26 + slot * 17;
      m.homeY = fy;
      if (Math.abs(fx - m.x) > 24) this.walk(m, dt, Math.max(m.speed, this.H.move * 1.1), fx > m.x ? 1 : -1);
      else { m.face = h?.face || 1; if (m.anim.s !== 'idle') m.anim = { s: 'idle', t: 0 }; }
      m.y += Math.sign(fy - m.y) * Math.min(Math.abs(fy - m.y), 50 * dt);
      return;
    }
    const d = Math.abs(target.x - m.x);
    if (d > m.range) {
      this.walk(m, dt, m.speed, target.x > m.x ? 1 : -1);
      const ty = target.y + ((m.id % 3) - 1) * 14;
      m.y += Math.sign(ty - m.y) * Math.min(Math.abs(ty - m.y), 40 * dt);
      return;
    }
    m.face = target.x > m.x ? 1 : -1;
    if (m.atkT <= 0) this.minionAttack(m, target);
    else if (m.anim.s === 'walk') m.anim = { s: 'idle', t: 0 };
  }

  minionAttack(m, target) {
    const p = (m.temp || m.ttl ? m.p : this.params(m.skill)) || m.p;
    if (!p) return;
    m.p = p;
    const s = p.summon || {};
    m.atkT = 1 / Math.max(0.1, m.aps);
    m.anim = { s: 'attack', t: 0, dur: 0.4 };
    const mult = m.mult || 1;
    if (s.slam) {
      // 叩きつけ（巨像）
      const r = s.slam;
      const hits = this.enemiesNear(target.x, target.y, r);
      if (!hits.includes(target)) hits.unshift(target);
      hits.forEach((u, i) => this.hitUnit(m, u, p, mult, { aoeHit: i > 0 }));
      this.emit({ t: 'nova', x: target.x, y: target.y, r, el: p.element, skill: p.id, small: true, src: m, slam: true });
      this.emit({ t: 'shake', power: 2 });
      if (s.healHero && this.hero && !this.hero.dead) this.hero.life = Math.min(this.hero.maxLife, this.hero.life + this.hero.maxLife * s.healHero);
    } else if (m.range > 200) {
      const n = s.multi || 1;
      const base = Math.atan2((target.y - m.y) * 2, target.x - m.x);
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? base - 0.25 + (0.5 * i) / (n - 1) : base;
        this.spawnProj({ src: m, team: HERO_TEAM, x: m.x + 20 * m.face, y: m.y, z: m.fly ? 70 : 50, angle: a, speed: 900, p, range: m.range + 150, art: `fx.${p.id}.proj`, el: p.element, mult, explode: s.explode || 0, chainN: s.chain || 0 });
      }
    } else {
      this.hitUnit(m, target, p, mult);
      this.emit({ t: 'swing', x: target.x, y: target.y, el: p.element, small: true, src: m, skill: p.id });
    }
  }

  /** 召喚物の時間切れ（分身は刃をばらまく） */
  minionExpire(m) {
    if (m.dead) return;
    m.dead = true; m.deadT = 0; m.anim = { s: 'die', t: 0 };
    const fan = m.p?.summon?.deathFan;
    if (fan) {
      const p = m.p;
      for (const u of this.enemiesNear(m.x, m.y, 160)) this.hitUnit(this.hero, u, p, fan / Math.max(0.1, p.dmgPct / 100), { aoeHit: true });
      this.emit({ t: 'nova', x: m.x, y: m.y, r: 160, el: p.element, skill: p.id, small: true });
    }
    this.emit({ t: 'minionDeath', unit: m });
  }

  // ---------------- 敵の動き
  tickMonster(u, dt) {
    if (unitHooks.onMonsterTick.length) { runHooks(unitHooks.onMonsterTick, this, u, dt); if (u.dead) return; }
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
      // 近接の敵は、遠くの相手へは駆け足で詰める（遠くから撃つクラスが一方的に倒せないように）
      const rush = d > 260 && !u.boss && RUSH_ATTACKS.has(u.def?.attack || 'melee') ? (BAL.MONSTER_RUSH || 1) : 1;
      this.walk(u, dt, u.speed * rush, tgt.x > u.x ? 1 : -1);
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

  /** 主人公側（主人公・召喚物）の一覧。敵の数 × 全員を毎ティック調べないように、units が変わるまで使い回す */
  heroSide() {
    if (!this._allies || this._alliesOf !== this.units || this._alliesN !== this.units.length) {
      this._allies = this.units.filter((a) => a.team === HERO_TEAM);
      this._alliesOf = this.units; this._alliesN = this.units.length;
    }
    return this._allies;
  }

  targetFor(u) {
    // 召喚物が近ければそちらを狙う（盾になる）。引きつける召喚物（巨像・猪）はもっと狙われる
    // 遠くから撃つ敵は主人公を狙いたがる（召喚物の陰に隠れていれば安全、にならないように）
    const shooter = u.def?.attack === 'ranged' || u.def?.attack === 'caster'; // 呼び出し役（summoner）は前に出ないので含めない
    let best = null; let bd = Infinity;
    for (const a of this.heroSide()) {
      if (a.dead) continue;
      const d = Math.abs(a.x - u.x) + (a.kind === 'hero' ? (shooter ? -260 : 40) : 0) - (a.taunt ? 220 : 0) + (a.fly ? 60 : 0);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  monsterStrike(u) {
    const tgt = u.strikeTarget && !u.strikeTarget.dead ? u.strikeTarget : this.targetFor(u);
    if (!tgt) return;
    runHooks(unitHooks.onMonsterStrike, this, u, tgt);
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
  /** opts: { src, team, x, y, z, tx, ty, angle?, speed, p?（主人公側のスキル）, dmg?（敵の弾）, el, pierce, range, art, explode, mult, homing, hitR, wave, chainN } */
  spawnProj(o) {
    const ang = o.angle ?? Math.atan2((o.ty ?? o.y) - o.y, (o.tx ?? o.x + 1) - o.x);
    const pr = {
      id: this.nextId++, team: o.team, src: o.src, x: o.x, y: o.y, z: o.z ?? 50, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed * 0.5,
      p: o.p || null, dmg: o.dmg || 0, el: o.el || o.p?.element || 'phys', pierce: o.pierce ?? 0, hit: new Set(), dist: 0, range: o.range || 800,
      art: o.art || (o.p ? `fx.${o.p.id}.proj` : 'fx.enemy.orb'), explode: o.explode || 0, mult: o.mult || 1, size: o.size || 1, t: 0, onHit: o.onHit,
      homing: !!o.homing, speed: o.speed, hitR: o.hitR || 0, wave: !!o.wave, chainN: o.chainN || 0, kind: o.kind || (o.wave ? 'wave' : 'proj'),
    };
    this.projs.push(pr);
    return pr;
  }

  /** opts: { team, x, y, r, delay, dur, tick, dmg?（敵）, p?（主人公側）, mult, el, src, art, follow, status, kind, shape:'line', len, dot, quiet, onHit, onFire } */
  spawnArea(o) {
    const a = {
      id: this.nextId++, team: o.team, x: o.x, y: o.y, r: o.r || 100, delay: o.delay ?? 0, dur: o.dur || 0, tick: o.tick || 0, tickT: 0, t: 0,
      dmg: o.dmg || 0, p: o.p || null, mult: o.mult || 1, el: o.el || o.p?.element || 'phys', src: o.src, art: o.art || (o.p ? `fx.${o.p.id}.area` : 'fx.enemy.area'),
      follow: o.follow || null, fired: false, status: o.status, onHit: o.onHit, onFire: o.onFire, kind: o.kind || (o.dur ? 'zone' : 'blast'),
      shape: o.shape || 'circle', len: o.len || 0, dot: !!o.dot, quiet: !!o.quiet, orbit: o.orbit || null, trigger: o.trigger || 0, life: o.life || 0, curse: o.curse || null,
    };
    this.areas.push(a);
    return a;
  }

  tickProjectiles(dt) {
    for (const pr of this.projs) {
      pr.t += dt;
      // 追いかける弾
      if (pr.homing && pr.team === HERO_TEAM) {
        if (!pr.target || pr.target.dead || pr.hit.has(pr.target.id)) pr.target = this.nearestEnemy(pr.x, pr.y, 700, (u) => !pr.hit.has(u.id));
        if (pr.target) {
          const want = Math.atan2((pr.target.y - pr.y) * 2, pr.target.x - pr.x);
          const cur = Math.atan2(pr.vy * 2, pr.vx);
          let dA = want - cur; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
          const na = cur + Math.max(-7 * dt, Math.min(7 * dt, dA));
          pr.vx = Math.cos(na) * pr.speed; pr.vy = Math.sin(na) * pr.speed * 0.5;
        }
      }
      const dx = pr.vx * dt; const dy = pr.vy * dt;
      const x0 = pr.x; const y0 = pr.y;
      const x1 = x0 + dx; const y1 = y0 + dy;
      pr.x = x1; pr.y = y1; pr.dist += Math.hypot(dx, dy);
      // このティックに進んだ線分（出た位置を含む）で当たりを調べ、近い順に当てる（すり抜け防止）
      const foes = pr.team === HERO_TEAM ? ENEMY_TEAM : HERO_TEAM;
      let hits = null;
      for (const u of this.units) {
        if (u.dead || u.team !== foes || pr.hit.has(u.id)) continue;
        const rr = (pr.hitR || 34) * (pr.hitR ? 1 : (u.size || 1)) + 10 + (pr.hitR ? 20 * (u.size || 1) : 0);
        const at = sweepHit(x0, y0, x1, y1, u.x, u.y, rr);
        // 出た位置が中に入っている敵（at = 0）は、中心が近い順に先に当てる
        if (at >= 0) (hits ||= []).push({ u, at, key: at > 0 ? at : -1 + Math.hypot(u.x - x0, (u.y - y0) / PROJ_Y_RATIO) / 1e5 });
      }
      if (hits) {
        if (hits.length > 1) hits.sort((a, b) => a.key - b.key);
        for (const { u, at } of hits) {
          if (u.dead) continue; // 先の爆発などで倒れた
          pr.hit.add(u.id);
          pr.x = x0 + dx * at; pr.y = y0 + dy * at; // 当たった位置（爆発・演出はここ）
          if (pr.team === HERO_TEAM) {
            this.hitUnit(pr.src, u, pr.p, pr.mult, { aoeHit: pr.hit.size > 1 });
            if (pr.onHit) pr.onHit(this, pr, u);
            if (pr.explode) {
              for (const v of this.enemiesNear(pr.x, pr.y, pr.explode)) if (v !== u) this.hitUnit(pr.src, v, pr.p, pr.mult * 0.6, { aoeHit: true });
              this.emit({ t: 'nova', x: pr.x, y: pr.y, r: pr.explode, el: pr.el, skill: pr.p?.id, small: true });
            }
            const chainN = pr.chainN || pr.p?.extra?.chainOnHit || 0;
            if (chainN > 0 && !pr.chained) { pr.chained = true; this.chainFrom(pr.src, u, pr.p, chainN, pr.mult * 0.7); }
          } else {
            this.damageAlly(u, pr.dmg, pr.el, pr.src);
          }
          if (!pr.wave) this.emit({ t: 'hit', x: pr.x, y: pr.y, z: pr.z, el: pr.el, skill: pr.p?.id });
          if (pr.pierce-- <= 0) { pr.dead = true; break; }
        }
        if (!pr.dead) { pr.x = x1; pr.y = y1; }
      }
      if (pr.dist > pr.range) pr.dead = true;
    }
    if (this.projs.some((p) => p.dead)) this.projs = this.projs.filter((p) => !p.dead);
  }

  /** from の敵から近くの敵へ n 回跳ねる */
  chainFrom(src, from, p, n, mult) {
    const hit = new Set([from.id]);
    const pts = [{ x: from.x, y: from.y, z: from.z + 40 * from.size }];
    let cur = from;
    for (let i = 0; i < n; i++) {
      const nx = this.nearestEnemy(cur.x, cur.y, 320, (u) => !hit.has(u.id));
      if (!nx) break;
      hit.add(nx.id);
      this.hitUnit(src, nx, p, mult, { aoeHit: true });
      pts.push({ x: nx.x, y: nx.y, z: nx.z + 40 * nx.size });
      cur = nx; mult *= 0.85;
    }
    if (pts.length > 1) this.emit({ t: 'chain', pts, el: p?.element || 'lightning', skill: p?.id });
  }

  tickAreas(dt) {
    for (const a of this.areas) {
      a.t += dt;
      if (a.follow) { a.x = a.follow.x; a.y = a.follow.y; if (a.follow.dead) a.dead = true; }
      if (a.kind === 'trap') { this.tickTrap(a, dt); continue; }
      if (a.kind === 'orbit') { this.tickOrbit(a, dt); continue; }
      if (!a.fired && a.t >= a.delay) {
        a.fired = true;
        this.areaPulse(a);
        if (a.onFire) { try { a.onFire(this, a); } catch (e) { console.error(e); } }
        if (!a.dur) { a.dead = true; continue; }
      }
      if (a.fired && a.dur) {
        if (a.tick) { a.tickT += dt; while (a.tickT >= a.tick) { a.tickT -= a.tick; this.areaPulse(a); } }
        if (a.t >= a.delay + a.dur) a.dead = true;
      }
    }
    this.areas = this.areas.filter((a) => !a.dead || a.t < 0);
  }

  /** 罠: 仕掛けてから delay 秒で準備ができ、敵が踏むと爆発する */
  tickTrap(a, dt) {
    if (a.t > a.life) { a.dead = true; this.emit({ t: 'trapFade', x: a.x, y: a.y, skill: a.p?.id }); return; }
    a.armed = a.t >= a.delay;
    if (!a.armed) return;
    const trig = a.triggered || this.enemiesNear(a.x, a.y, a.trigger || a.r * 0.6).length > 0;
    if (!trig) return;
    a.dead = true;
    a.fired = true;
    this.areaPulse(a);
    this.emit({ t: 'trapFire', x: a.x, y: a.y, r: a.r, el: a.el, skill: a.p?.id });
    this.emit({ t: 'nova', x: a.x, y: a.y, r: a.r, el: a.el, skill: a.p?.id, fallbackOf: 'trapFire' });
    if (a.onFire) { try { a.onFire(this, a); } catch (e) { console.error(e); } }
    if (a.p?.extra?.chainTrap) for (const o of this.areas) if (o !== a && o.kind === 'trap' && !o.dead && Math.abs(o.x - a.x) < 320) { o.triggered = true; o.t = Math.max(o.t, o.delay); }
  }

  /** 回る刃: 刃の位置の近くの敵に当てる（同じ敵には hitCd 秒ごと） */
  tickOrbit(a, dt) {
    if (a.t >= a.dur) { a.dead = true; return; }
    const o = a.orbit;
    o.ang += o.speed * dt;
    a.tickT += dt;
    if (a.tickT < 0.1) return;
    a.tickT = 0;
    a.hitT ||= {};
    for (let i = 0; i < o.n; i++) {
      const ang = o.ang + (i * Math.PI * 2) / o.n;
      const bx = a.x + Math.cos(ang) * a.r;
      const by = a.y + Math.sin(ang) * a.r * 0.45;
      for (const u of this.enemiesNear(bx, by, 34)) {
        if ((a.hitT[u.id] || -9) > this.time - o.hitCd) continue;
        a.hitT[u.id] = this.time;
        this.hitUnit(a.src || this.hero, u, a.p, a.mult, { aoeHit: true });
        this.emit({ t: 'hit', x: bx, y: by, z: 40, el: a.el, skill: a.p?.id });
      }
    }
  }

  areaPulse(a) {
    if (a.team === HERO_TEAM) {
      const list = a.shape === 'line'
        ? this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead && Math.abs(u.x - a.x) <= a.len / 2 + 20 * u.size && Math.abs(u.y - a.y) <= a.r + 20)
        : this.enemiesNear(a.x, a.y, a.r);
      list.forEach((u, i) => {
        if (a.curse) this.applyCurse(u, a.curse, a.p);
        if (a.p && a.p.dmgPct > 0) this.hitUnit(a.src || this.hero, u, a.p, a.mult, { aoeHit: i > 0, dot: a.dot });
        if (a.onHit) a.onHit(this, a, u);
      });
    } else {
      for (const u of this.allies()) if (dist2(u.x, u.y, a.x, a.y) <= a.r * a.r) this.damageAlly(u, a.dmg, a.el, a.src);
    }
    if (!a.quiet) this.emit({ t: 'pulse', x: a.x, y: a.y, r: a.r, el: a.el, team: a.team, art: a.art, skill: a.p?.id, kind: a.kind, len: a.len });
  }

  // ---------------- ダメージ
  /**
   * 主人公側 → 敵。p はスキルの数値、mult は追加の倍率。戻り値は与えたダメージ。
   * opts: { element, noProc, aoeHit, multi, dot（継続の刻み: クリティカルなし・力のフックなし・数字はまとめる）, forceCrit, flatAdd, repeat }
   */
  hitUnit(src, target, p, mult = 1, opts = {}) {
    if (!target || target.dead || !p) return 0;
    const H = this.H;
    const rng = this.rng;
    const h = this.hero;
    const w = rng.range(H.weapon.min, H.weapon.max) + H.addTotal;
    let el = opts.element || p.element || 'phys';
    if (H.ks.ember && el === 'phys') el = 'fire';
    const tags = p.tags || [];
    const ex = p.extra || {};
    const fromHero = src === h;
    let inc = incFor(H, el, tags, p.id);
    if (target.rank !== 'normal' && !target.boss) inc += H.dmgElite;
    if (target.boss) inc += H.dmgBoss + H.dmgElite * 0.5;
    if (target.life / target.maxLife < 0.3) inc += H.dmgLow;
    inc += H.S[`family_dmg:${target.def?.family}`] || 0;
    // クラスの特性
    const tr = H.trait;
    if (h && fromHero && tr) {
      if (tr.id === 'fury') inc += Math.min(tr.maxInc, h.resource * tr.perRes);
      else if (tr.id === 'hunter') inc += Math.min(tr.maxInc, (Math.abs(target.x - h.x) / 100) * tr.perDist);
    }
    if (H.ks.bloodrage && h) inc += Math.min(75, (1 - h.life / Math.max(1, h.maxLife)) * 100);
    let dmg = w * ((p.dmgPct || 100) / 100) * (p.dmgMul || 1) * mult * (1 + inc / 100) * H.more;
    if (H.ks.legion && src?.kind !== 'minion') dmg *= 0.6;
    if (ex.execute && target.life / target.maxLife < 0.3) dmg *= ex.execute;
    if (ex.eliteMul && (target.rank !== 'normal' || target.boss)) dmg *= ex.eliteMul;
    if (ex.shatter && (target.statuses.freeze?.t > 0 || target.statuses.chill?.t > 0)) dmg *= ex.shatter;
    let crit = false;
    if (!opts.dot) {
      let cc = H.critChance + (ex.critBonus || 0);
      if (tr?.id === 'vital' && (target.statuses.poison || target.statuses.bleed?.t > 0)) cc += tr.critVsAfflicted;
      cc = Math.min(BAL.CRIT_CAP / 100, cc); // スキル・特性の上乗せ込みで上限 95%
      // 要石「研ぎ澄まされた一点」はクリティカルしない（「必ずクリティカル」の技も）
      crit = !H.ks.precise && (!!opts.forceCrit || rng.chance(cc));
      if (crit) dmg *= H.critMult + (ex.critDmgBonus || 0) + (target.statuses.curse?.t > 0 ? target.statuses.curse.mark || 0 : 0);
    }
    if (opts.flatAdd) dmg += opts.flatAdd;
    const res = Math.max(-100, Math.min(90, (target.res[el] || 0) - H.resPen));
    dmg *= 1 - res / 100;
    dmg *= this.takenMul(target) * (1 - (target.dr || 0));
    if (!(dmg > 0)) return 0;
    const hit = { src, target, dmg, crit, element: el, skill: p, tags, dot: !!opts.dot };
    const proc = !opts.noProc && !opts.dot;
    if (proc) {
      this.hook('onHit', hit);
      if (crit) this.hook('onCrit', hit);
    }
    if (unitHooks.onMonsterHit.length) runHooks(unitHooks.onMonsterHit, this, target, hit);
    dmg = hit.dmg;
    if (!(dmg > 0)) return 0;
    target.life -= dmg;
    this.stats.dmgDone += dmg;
    if (dmg > (this.state.meta.stats.highestHit || 0)) this.state.meta.stats.highestHit = dmg;
    if (opts.dot) {
      target.dotAcc = (target.dotAcc || 0) + dmg;
      if (target.dotAcc > target.maxLife * 0.05 || target.life <= 0) { this.emit({ t: 'dmg', x: target.x, y: target.y, z: target.z + 70 * target.size, v: target.dotAcc, el, dot: true, team: target.team }); target.dotAcc = 0; }
    } else {
      target.hitFlash = 0.12;
      // 当たると少し押し返す（ボスと、逃げるため込み屋は押さない。押すと逃げる手助けになる）
      if (!target.boss && !target.goblin && target.kind === 'monster') target.x += 4 * (src && src.x > target.x ? -1 : 1);
      this.emit({ t: 'dmg', x: target.x, y: target.y, z: target.z + 70 * target.size, v: dmg, crit, el, team: target.team });
      if (crit && fromHero && this.critFxT <= 0) { this.critFxT = 0.15; this.emit({ t: 'crit', x: target.x, y: target.y, z: target.z + 70 * target.size, v: dmg, el, skill: p.id }); }
    }
    // 状態異常
    if (!opts.noProc) this.applyStatusOnHit(target, p, el, dmg);
    // 回復・リソース
    if (h && !h.dead && (fromHero || src?.team === HERO_TEAM)) {
      if (H.lifeOnHit && fromHero && !opts.dot) h.life = Math.min(h.maxLife, h.life + H.lifeOnHit * (opts.aoeHit ? 0.3 : 1));
      const leech = H.leech + (ex.leech || 0);
      if (leech > 0 && this.leechBudget > 0) { const l = Math.min(this.leechBudget, dmg * leech); this.leechBudget -= l; h.life = Math.min(h.maxLife, h.life + l); }
      if (fromHero && !opts.dot) {
        if (H.resourceOnHit > 0 && p.basic) h.resource = Math.min(H.resourceMax, h.resource + H.resourceOnHit);
        if (ex.resOnHit) h.resource = Math.min(H.resourceMax, h.resource + ex.resOnHit);
        if (crit && tr?.id === 'vital') h.resource = Math.min(H.resourceMax, h.resource + tr.resOnCrit);
        if (ex.onHitBuff) { const b = ex.onHitBuff; this.addBuff(b.id, b.mods, b.dur, { name: b.name, stack: true, maxStacks: b.max || 5 }); }
      }
    }
    if (!opts.dot) {
      if (ex.hexOnHit) this.addStatus(target, 'vuln', { v: ex.hexOnHit, dur: 4 });
      if (ex.burst && !opts.noBurst && !target.dead) {
        const r = 70 * (H.area || 1);
        for (const v of this.enemiesNear(target.x, target.y, r)) if (v !== target) this.hitUnit(src, v, p, mult * ex.burst, { aoeHit: true, noProc: true, noBurst: true });
        this.emit({ t: 'nova', x: target.x, y: target.y, r, el, skill: p.id, small: true });
      }
    }
    // 連撃・もう一度
    if (!opts.dot && !opts.noProc) {
      const depth = opts.multi || 0;
      const maxDepth = H.ks.cascade ? 3 : 1;
      if (depth < maxDepth && H.multistrike > 0 && tags.includes('attack') && rng.chance(H.multistrike)) {
        this.hitUnit(src, target, p, mult, { ...opts, multi: depth + 1 });
      } else if (!opts.repeat && p.repeatChance > 0 && rng.chance(p.repeatChance)) {
        this.hitUnit(src, target, p, mult * 0.8, { ...opts, repeat: true });
      }
    }
    if (target.life <= 0) {
      if (fromHero && ex.resOnKill && h) h.resource = Math.min(H.resourceMax, h.resource + ex.resOnKill);
      this.killUnit(target, src);
    }
    return dmg;
  }

  applyStatusOnHit(target, p, el, dmg) {
    const H = this.H;
    const rng = this.rng;
    const sts = p.statuses || (p.status ? [p.status] : []);
    const chance = (id, base) => { let c = base || 0; for (const s of sts) if (s.id === id) c += s.chance ?? 0; return c; };
    const ex = p.extra || {};
    const statusMul = H.statusDmg * (1 + ((H.S.inc_dot || 0) / 100));
    if (el === 'fire' && rng.chance(chance('ignite', H.status.ignite))) this.addStatus(target, 'ignite', { dps: dmg * statusDefs.ignite.dpsMul * statusMul });
    if (el === 'cold' && rng.chance(chance('freeze', H.status.freeze))) this.addStatus(target, 'freeze', { dur: sts.find((s) => s.id === 'freeze')?.dur });
    if (el === 'cold') this.addStatus(target, 'chill', {});
    if (el === 'lightning' && rng.chance(chance('shock', H.status.shock))) this.addStatus(target, 'shock', {});
    if (rng.chance(chance('poison', H.status.poison))) this.addStatus(target, 'poison', { dps: dmg * statusDefs.poison.dpsMul * statusMul * (ex.poisonMul || 1) * (H.ks.venomcrown ? 1.3 : 1) });
    if (el === 'phys' && rng.chance(chance('bleed', H.status.bleed))) this.addStatus(target, 'bleed', { dps: dmg * statusDefs.bleed.dpsMul * statusMul * (ex.bleedMul || 1) });
    for (const s of sts) {
      if (s.id === 'ignite' || s.id === 'freeze' || s.id === 'shock' || s.id === 'poison' || s.id === 'bleed') continue;
      if (rng.chance(s.chance ?? 1)) this.addStatus(target, s.id, { dur: s.dur, v: s.v });
    }
  }

  addStatus(u, id, o = {}) {
    const def = statusDefs[id];
    if (!def || u.dead) return;
    const st = u.statuses;
    if (id === 'poison') {
      st.poison ||= { stacks: [], src: this.hero };
      const cap = u.team === ENEMY_TEAM ? (this.H?.poisonStacks || def.stack || 20) : (def.stack || 20);
      if (st.poison.stacks.length >= cap) st.poison.stacks.shift();
      st.poison.stacks.push({ t: o.dur || def.dur, dps: o.dps || 0 });
      return;
    }
    const cur = st[id];
    if (cur && cur.immune !== undefined && cur.t <= 0) return; // 免疫中
    const dur = (o.dur || def.dur) * (u.boss && (id === 'freeze' || id === 'stun') ? 0.35 : 1);
    if (cur && cur.t > 0) { cur.t = Math.max(cur.t, dur); if (o.dps) cur.dps = Math.max(cur.dps || 0, o.dps); if (o.v) cur.v = Math.max(cur.v || 0, o.v); return; }
    st[id] = { t: dur, dps: o.dps || 0, src: this.hero, v: o.v };
    if (id === 'freeze' || id === 'stun') this.emit({ t: 'text', x: u.x, y: u.y, z: u.z + 90 * u.size, text: def.name, color: def.color });
  }

  /** 呪いをかける。curse: { vuln, weaken, slow, mark, dot, dur, spread, resOnKill } */
  applyCurse(u, curse, p) {
    if (!u || u.dead || !curse) return;
    const st = u.statuses;
    const dur = (curse.dur || 4) * (u.boss ? 0.7 : 1);
    let dps = 0;
    if (curse.dot && p) {
      const H = this.H;
      const w = (H.weapon.min + H.weapon.max) / 2 + H.addTotal;
      dps = w * curse.dot * (1 + incFor(H, 'poison', ['dot', 'spell'], p.id) / 100) * H.more * H.statusDmg;
    }
    const prev = st.curse;
    st.curse = {
      t: Math.max(dur, prev?.t || 0), src: this.hero, skill: p?.id,
      vuln: Math.max(curse.vuln || 0, prev?.vuln || 0), weaken: Math.max(curse.weaken || 0, prev?.weaken || 0), slow: Math.max(curse.slow || 0, prev?.slow || 0),
      mark: Math.max(curse.mark || 0, prev?.mark || 0), dps: Math.max(dps, prev?.dps || 0), spread: curse.spread || prev?.spread, resOnKill: Math.max(curse.resOnKill || 0, prev?.resOnKill || 0), def: curse,
    };
  }

  /** 敵 → 主人公・召喚物 */
  damageAlly(u, amount, element = 'phys', from = null, isDot = false) {
    if (!u || u.dead || !(amount > 0)) return 0;
    const H = this.H;
    const isHero = u.kind === 'hero';
    if (from?.statuses) {
      const fs = from.statuses;
      if (fs.curse?.t > 0 && fs.curse.weaken) amount *= 1 - Math.min(0.75, fs.curse.weaken);
      if (fs.weaken?.t > 0) amount *= 1 - (fs.weaken.v ?? statusDefs.weaken.weaken);
    }
    if (!isDot) {
      if (isHero && this.rng.chance(H.dodge)) { this.emit({ t: 'text', x: u.x, y: u.y, z: 100, text: '回避', color: '#9ad0ff' }); return 0; }
      if (isHero && H.block > 0 && this.rng.chance(H.block)) { amount *= 1 - BAL.BLOCK_REDUCE; this.emit({ t: 'text', x: u.x, y: u.y, z: 100, text: 'ブロック', color: '#e0e0e0' }); }
    }
    const L = from?.level || u.level || 1;
    if (element === 'phys') amount *= 1 - armorReduction(H.armor * (isHero ? 1 : 0.5), L);
    else amount *= 1 - Math.max(-100, H.res[element] || 0) / 100;
    amount *= 1 - H.dr;
    if (isHero) {
      const tr = H.trait;
      if (tr?.id === 'fury' && u.resource >= tr.guardAt) amount *= 1 - tr.guard;
      if (tr?.id === 'harvest') { const n = this.units.reduce((s, x) => s + (x.kind === 'minion' && !x.dead ? 1 : 0), 0); amount *= 1 - Math.min(tr.maxDr, n * tr.perMinion); }
    }
    const info = { amount, element, from, target: u };
    if (isHero) this.hook('onDamaged', info);
    amount = Math.max(0, info.amount);
    if (isHero) {
      // 障壁
      if (u.shield > 0 && amount > 0) {
        const a = Math.min(u.shield, amount);
        u.shield -= a; amount -= a;
        if (u.shield <= 0) this.shieldBroken(u);
      }
      // 魔力の外套
      if (H.ks.mindcloak && amount > 0 && u.resource > 0) {
        const part = amount * 0.35;
        const per = Math.max(1, u.maxLife * 0.01);
        const use = Math.min(u.resource, part / per);
        u.resource -= use; amount -= use * per;
      }
      if (H.resourceOnDamaged && !isDot) u.resource = Math.min(H.resourceMax, u.resource + H.resourceOnDamaged);
    }
    u.life -= amount;
    u.hitFlash = 0.1;
    if (isHero) this.stats.dmgTaken += amount;
    this.emit({ t: 'dmg', x: u.x, y: u.y, z: 80, v: amount, el: element, team: HERO_TEAM, hero: isHero });
    if (from && !isDot && isHero && !from.dead) {
      // 反射ダメージも敵の耐性・守り（鋼鉄・結界・ボスの障壁・無敵の間）を通す（以前はライフを直接減らしていた）
      if (H.thorns > 0 && from.team === ENEMY_TEAM) this.applyDot(from, H.thorns, 'phys', u);
      const rt = u.retaliate;
      if (rt && !from.dead && from.team === ENEMY_TEAM) {
        if (rt.chill) this.addStatus(from, 'chill', {});
        if (rt.el) this.hitUnit(u, from, rt.p, rt.mult / Math.max(0.1, (rt.p.dmgPct || 100) / 100), { element: rt.el, noProc: true });
      }
    }
    if (from?.flags?.leech) from.life = Math.min(from.maxLife, from.life + amount * from.flags.leech);
    if (from?.flags?.chill && isHero) this.addStatus(u, 'chill', {});
    if (u.life <= 0) {
      u.life = 0; u.dead = true; u.deadT = 0; u.anim = { s: 'die', t: 0 };
      if (isHero) {
        u.busy = 0; u.pending = null; if (u.channel) this.endChannel(u); u.motion = null; u.z = 0;
        this.emit({ t: 'heroDeath', unit: u }); this.game.events.emit('heroDeath', { unit: u });
      } else if (u.kind === 'minion') this.minionExpire(u);
    }
    return amount;
  }

  shieldBroken(h) {
    h.shield = 0;
    this.emit({ t: 'shieldBreak', unit: h });
    const sb = h.shieldBurst;
    if (sb && sb.t > this.time) {
      h.shieldBurst = null;
      for (const u of this.enemiesNear(h.x, h.y, 220)) this.hitUnit(h, u, sb.p, sb.mult / Math.max(0.1, (sb.p.dmgPct || 100) / 100), { aoeHit: true, noProc: true });
      this.emit({ t: 'nova', x: h.x, y: h.y, r: 220, el: sb.p.element, skill: sb.p.id });
      this.emit({ t: 'shake', power: 4 });
    }
  }

  killUnit(u, src) {
    if (u.dead) return;
    u.dead = true; u.deadT = 0; u.life = 0; u.anim = { s: 'die', t: 0 };
    if (u.team === ENEMY_TEAM) {
      const h = this.hero;
      const H = this.H;
      if (h && !h.dead) {
        if (H.lifeOnKill) h.life = Math.min(h.maxLife, h.life + H.lifeOnKill);
        if (H.resourceOnKill) h.resource = Math.min(H.resourceMax, h.resource + H.resourceOnKill);
        const cs = u.statuses.curse;
        if (cs?.t > 0 && cs.resOnKill) h.resource = Math.min(H.resourceMax, h.resource + cs.resOnKill);
      }
      // 呪いが移る
      const cs = u.statuses.curse;
      if (cs?.t > 0 && cs.spread) {
        const nx = this.nearestEnemy(u.x, u.y, 320, (v) => v !== u && !(v.statuses.curse?.t > 0));
        if (nx) { this.applyCurse(nx, { ...cs.def, dur: Math.max(2, cs.t) }, null); nx.statuses.curse.dps = cs.dps; this.emit({ t: 'chain', pts: [{ x: u.x, y: u.y, z: 60 }, { x: nx.x, y: nx.y, z: 60 }], el: 'void', fallbackOf: 'curse' }); }
      }
      // 霧の中で倒れた敵が破裂する
      for (const a of this.areas) {
        if (a.dead || a.kind !== 'cloud' || !a.p?.extra?.deathBurst || !a.fired) continue;
        if (dist2(u.x, u.y, a.x, a.y) > a.r * a.r) continue;
        for (const v of this.enemiesNear(u.x, u.y, 100)) this.hitUnit(this.hero, v, a.p, a.p.extra.deathBurst * (a.p.duration / Math.max(0.1, a.p.tick)) / 4, { aoeHit: true, noProc: true });
        this.emit({ t: 'corpse', x: u.x, y: u.y, r: 100, skill: a.p.id });
        break;
      }
      if (!u.isSplit) { this.corpses.push({ x: u.x, y: u.y, maxLife: u.maxLife, t: 10, boss: u.boss, id: u.id }); if (this.corpses.length > 14) this.corpses.shift(); }
      this.hook('onKill', u);
      runHooks(unitHooks.onMonsterDeath, this, u, src);
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

  corpsesNear(x, r) { return this.corpses.filter((c) => Math.abs(c.x - x) <= r); }

  /** 全部片付ける（ステージ変更など）。召喚物は残す */
  clearEnemies() {
    this.units = this.units.filter((u) => u.team === HERO_TEAM);
    this.projs = [];
    this.areas = this.areas.filter((a) => a.team === HERO_TEAM && a.follow);
    this.corpses = [];
  }

  reviveHero() {
    const h = this.hero;
    if (!h) return;
    h.dead = false; h.life = h.maxLife; h.statuses = {}; h.busy = 0; h.pending = null; h.anim = { s: 'idle', t: 0 };
    h.channel = null; h.motion = null; h.z = 0; h.shield = 0; h.shieldMax = 0; h.shieldT = 0;
    h.resource = Math.max(h.resource, this.H.resourceMax * 0.5);
    this.emit({ t: 'revive', unit: h });
  }
}

export function dist2(x1, y1, x2, y2) { const dx = x1 - x2; const dy = (y1 - y2) * 1.4; return dx * dx + dy * dy; }

// ---------------- 基本の動き（そのほかは game/content/combat/behaviors.js）
behaviors.melee = (c, h, p, target) => {
  if (!target) return;
  const r = p.radius || 50;
  const strike = (mult) => {
    const t = target.dead ? c.nearestEnemy(h.x, h.y, (p.range || 120) + 40) : target;
    if (!t) return;
    const hits = c.enemiesNear(t.x, t.y, r);
    if (!hits.includes(t)) hits.unshift(t);
    hits.forEach((u, i) => c.hitUnit(h, u, p, mult, { aoeHit: i > 0 }));
    c.emit({ t: 'swing', x: t.x, y: t.y, r, el: p.element, skill: p.id, src: h });
  };
  strike(1);
  const n = p.extra?.hits || 1;
  for (let i = 1; i < n; i++) c.after(0.09 * i, () => { if (!h.dead) strike(1); });
};

behaviors.projectile = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const baseAng = target ? Math.atan2((target.y - h.y) * 2, target.x - h.x) : (h.face < 0 ? Math.PI : 0);
  const spread = n > 1 ? p.spread : 0;
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? baseAng - spread / 2 + (spread * i) / (n - 1) : baseAng;
    c.spawnProj({ src: h, team: HERO_TEAM, x: h.x + 30 * h.face, y: h.y, z: 55, angle: a, speed: p.speed, p, pierce: p.pierce, range: p.range + 250, explode: p.explode, homing: !!p.extra?.homing });
  }
};

behaviors.nova = (c, h, p) => {
  const r = p.radius || 150;
  const fire = (mult) => {
    if (p.extra?.pull) pullTo(c, h, p.extra.pull);
    const hits = c.enemiesNear(h.x, h.y, r);
    hits.forEach((u, i) => c.hitUnit(h, u, p, mult, { aoeHit: i > 0 }));
    c.emit({ t: 'nova', x: h.x, y: h.y, r, el: p.element, skill: p.id });
    if (hits.length >= 3) c.emit({ t: 'shake', power: 2 });
  };
  fire(1);
  const rep = p.extra?.repeat;
  if (rep) c.after(rep.delay || 0.5, () => { if (!h.dead) fire(rep.mult || 0.6); });
};

behaviors.rain = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const waves = p.extra?.waves || 1;
  for (let wv = 0; wv < waves; wv++) {
    const go = () => {
      const t = target && !target.dead ? target : c.nearestEnemy(h.x, h.y);
      const tx = t ? t.x : h.x + 300 * h.face;
      const ty = t ? t.y : 0;
      for (let i = 0; i < n; i++) {
        c.spawnArea({ team: HERO_TEAM, x: tx + c.rng.range(-90, 90) * (n > 1 ? 1 : 0), y: ty + c.rng.range(-30, 30) * (n > 1 ? 1 : 0), r: p.radius || 100, delay: (p.delay || 0.35) + i * 0.08, p, src: h, kind: 'rain' });
      }
    };
    if (wv === 0) go(); else c.after(wv * 0.8, () => { if (!h.dead) go(); });
  }
};

behaviors.chain = (c, h, p, target) => {
  if (!target) return;
  const pts = [{ x: h.x + 30 * h.face, y: h.y, z: 60 }];
  const hit = new Set();
  let cur = target; let mult = 1;
  const grow = p.extra?.chainGrow || 0.85;
  for (let i = 0; i <= Math.max(0, p.chain || 3) && cur; i++) {
    hit.add(cur.id);
    c.hitUnit(h, cur, p, mult, { aoeHit: i > 0 });
    pts.push({ x: cur.x, y: cur.y, z: cur.z + 40 * cur.size });
    if (p.extra?.healMinions) for (const m of c.units) if (m.kind === 'minion' && !m.dead) m.life = Math.min(m.maxLife, m.life + m.maxLife * p.extra.healMinions);
    mult *= grow;
    const from = cur;
    cur = c.nearestEnemy(from.x, from.y, 320, (u) => !hit.has(u.id));
  }
  c.emit({ t: 'chain', pts, el: p.element, skill: p.id });
  if (p.extra?.resGain) h.resource = Math.min(c.H.resourceMax, h.resource + p.extra.resGain);
};

behaviors.summon = (c, h, p) => {
  const mine = c.minionsOf(p.id);
  const want = Math.max(1, p.maxSummons);
  const n = Math.max(0, Math.min(want - mine.length, Math.max(p.summon?.count || 1, want)));
  const unit = p.summon?.unit || 'skeleton';
  for (let i = 0; i < n; i++) c.spawnMinion(unit, p, { ttl: p.summon?.ttl || 0, x: h.x + 40 * h.face + c.rng.range(-50, 30) });
  for (const m of mine) m.life = m.maxLife;
};

behaviors.buff = (c, h, p) => {
  const b = p.buff || { mods: [], dur: 5 };
  c.addBuff(p.id, b.mods || [], b.dur || 5, { name: p.def?.name, skill: p.id });
  c.emit({ t: 'buff', unit: h, el: p.element, skill: p.id, dur: b.dur });
  const cs = p.extra?.castStatus;
  if (cs) {
    for (const u of c.enemiesNear(h.x, h.y, cs.r)) c.addStatus(u, cs.id, { dur: cs.dur });
    c.emit({ t: 'nova', x: h.x, y: h.y, r: cs.r, el: 'phys', skill: p.id, small: true });
  }
  if (p.extra?.spawnClone) spawnCloneAt(c, h, h.x - 30 * h.face, p.extra.spawnClone, 1);
};

/** 敵を (h.x, h.y) へ引き寄せる（ボスは動かない） */
export function pullTo(c, h, r) {
  for (const u of c.enemiesNear(h.x, h.y, r)) {
    if (u.boss) continue;
    const dir = u.x > h.x ? 1 : -1;
    u.x = h.x + dir * Math.max(50, Math.abs(u.x - h.x) * 0.35);
    u.y += (h.y - u.y) * 0.5;
  }
}

/** 影分身を呼ぶ（影刃の a_clone の数値を使う。覚えていなければ基本の数値） */
export function spawnCloneAt(c, h, x, ttl, n = 1) {
  const st = c.state.hero;
  const base = st.skills.a_clone ? c.params('a_clone') : resolveSkill(c.state, c.H, 'a_clone');
  if (!base) return;
  for (let i = 0; i < n; i++) c.spawnMinion('clone', base, { ttl, x: x + i * 30, temp: true, mult: 0.8 });
}
