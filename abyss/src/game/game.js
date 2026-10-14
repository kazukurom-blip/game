// ゲームの本体。状態（state）・戦闘（combat）・仕組み（sys）をまとめ、時間を進める。
// DOM を使わないので Node（テスト・数値の検証）でもそのまま動く。
//
// 使い方:
//   const game = new Game();
//   game.newGame('warrior', 'なまえ');  または game.load(state)
//   毎フレーム game.update(実時間の秒)  … 内部で 1/20 秒ずつ進める（速度の設定つき）
// 見た目への知らせは game.events（'kill' 'loot' 'levelUp' 'stageStart' 'bossSpawn' 'zoneClear' 'heroDeath' 'invChanged' 'gearChanged' ...）

import './content/index.js';
import { EventBus } from '../engine/events.js';
import { RNG } from '../engine/rng.js';
import { newState, migrate } from './state.js';
import { Combat } from './combat.js';
import { SYSTEMS } from './systems/index.js';
import { flushWorldPending } from './systems/world.js';
import { generateItem, dropCount, setUidCounter, peekUid } from './loot.js';
import { BAL } from '../data/balance.js';
import { CLASS } from '../data/classes.js';
import { BASE } from '../data/items.js';

export const gameHooks = {
  onKill: [], // (game, unit, reward) => void … 報酬の計算の後
  rewardMods: [], // (game, unit, reward) => void … 報酬を書き換える
  onLevelUp: [],
  afterLoad: [],
  onNewGame: [],
};

export class Game {
  constructor({ seed } = {}) {
    this.events = new EventBus();
    this.rng = new RNG(seed);
    this.state = null;
    this.combat = new Combat(this);
    this.sys = {};
    for (const S of SYSTEMS) { const s = new S(this); this.sys[s.id] = s; }
    this.acc = 0;
    this.paused = false;
    this.started = false;
    this.time = 0;
    this.events.on('kill', (e) => this.onKill(e.unit));
    this.events.on('heroDeath', () => this.sys.world.onHeroDeath());
  }

  get H() { return this.combat.H; }

  each(fn, ...args) {
    for (const id in this.sys) { const s = this.sys[id]; if (typeof s[fn] === 'function') { try { s[fn](...args); } catch (e) { console.error(`[sys:${id}.${fn}]`, e); } } }
  }

  newGame(cls = 'warrior', name = '名もなき者') {
    this.state = newState(cls, name);
    setUidCounter(1);
    const c = CLASS[cls];
    // 最初の装備
    for (const [slot, baseId] of Object.entries(c.startGear || {})) {
      const b = BASE[baseId];
      if (!b) continue;
      const it = generateItem(this.rng, { ilvl: 1, rarity: 'common', base: b.id });
      if (it) { it.isNew = false; this.state.hero.equip[slot] = it; }
    }
    this.each('ensureState', this.state);
    this.each('onNewGame');
    for (const f of gameHooks.onNewGame) f(this);
    this.start();
    return this.state;
  }

  load(raw) {
    this.state = migrate(raw);
    // uid の続き番号
    let maxUid = this.state.inv.nextUid || 1;
    const scan = (it) => { if (it?.uid >= maxUid) maxUid = it.uid + 1; };
    this.state.inv.bag.forEach(scan);
    this.state.inv.stash.flat().forEach(scan);
    Object.values(this.state.hero.equip).forEach(scan);
    setUidCounter(maxUid);
    this.each('ensureState', this.state);
    this.each('onLoad');
    for (const f of gameHooks.afterLoad) f(this);
    this.start();
    return this.state;
  }

  start() {
    this.combat.reset();
    this.combat.setupHero();
    this.sys.world.startStage();
    this.started = true;
    this.events.emit('started', {});
  }

  /** 実時間 realDt 秒ぶん進める（速度の設定込み）。大きすぎる差は放置の稼ぎに回す */
  update(realDt) {
    if (!this.started || this.paused) return;
    if (realDt > 5) { this.catchUp(realDt); return; }
    const speed = Math.max(1, Math.min(4, this.state.settings.speed || 1));
    this.acc += Math.min(realDt, 0.25) * speed;
    let n = 0;
    while (this.acc >= BAL.TICK && n < 40) { this.tick(BAL.TICK); this.acc -= BAL.TICK; n++; }
  }

  /** タブを離れていた間など */
  catchUp(sec) {
    const rep = this.sys.offline.grant(sec, { reason: 'away' });
    this.state.lastTick = Date.now();
    return rep;
  }

  tick(dt) {
    this.time += dt;
    this.state.playTime += dt;
    this.combat.tick(dt);
    flushWorldPending();
    this.each('tick', dt);
    this.state.lastTick = Date.now();
  }

  // ---------------- 報酬
  onKill(u) {
    const st = this.state;
    const H = this.H;
    const w = this.sys.world;
    const diff = w.difficulty();
    const rk = BAL.RANK[u.rank] || BAL.RANK.normal;
    const L = u.level;
    const reward = {
      xp: BAL.monsterXp(L) * rk.xp * (u.xpMul || 1) * diff.xp * (1 + (H.xp || 0) / 100) * BAL.xpLevelPenalty(st.hero.level, L),
      gold: 0,
      drops: 0,
      level: L,
      items: [],
    };
    if (this.rng.chance(Math.min(1, BAL.GOLD_DROP_CHANCE * (u.rank === 'normal' ? 1 : 3)))) {
      reward.gold = BAL.monsterGold(L) * rk.gold * (u.goldMul || 1) * diff.gold * (1 + (H.gold || 0) / 100) * this.rng.range(0.7, 1.3);
    }
    const n = dropCount(this.rng, { rank: u.rank, quantity: H.quantity, lootMul: (u.lootMul || 1) * (diff.loot || 1) });
    reward.drops = n;
    for (let i = 0; i < n; i++) {
      const it = generateItem(this.rng, {
        ilvl: L + (u.boss ? this.rng.int(0, 2) : 0), cls: st.hero.cls, mf: (H.mf || 0) + (diff.mf || 0), rank: u.rank, torment: st.world.torment,
        minRarity: u.boss && i === 0 ? 'rare' : null, ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0,
      });
      if (it) reward.items.push(it);
    }
    for (const f of gameHooks.rewardMods) f(this, u, reward);
    // 受け取り
    this.addXp(reward.xp);
    if (reward.gold > 0) { this.addGold(reward.gold); this.combat.emit({ t: 'gold', x: u.x, y: u.y, v: reward.gold }); }
    for (const it of reward.items) {
      const where = this.sys.inv.receive(it);
      this.combat.emit({ t: 'loot', x: u.x + this.rng.range(-40, 40), y: u.y, item: it, where });
      this.events.emit('loot', { item: it, where, unit: u });
    }
    const ms = st.meta.stats;
    ms.kills++;
    if (u.rank === 'champion' || u.rank === 'rare') ms.elites++;
    if (u.boss) ms.bosses++;
    st.meta.bestiary[u.defId] = (st.meta.bestiary[u.defId] || 0) + 1;
    this.sys.offline.record(reward);
    this.sys.world.onKill(u);
    for (const f of gameHooks.onKill) f(this, u, reward);
  }

  addGold(v) {
    if (!(v > 0)) return;
    this.state.meta.gold += v;
    this.state.meta.stats.goldEarned += v;
  }

  spendGold(v) {
    if (this.state.meta.gold < v) return false;
    this.state.meta.gold -= v;
    this.events.emit('goldChanged', {});
    return true;
  }

  addXp(v, { quiet = false } = {}) {
    const h = this.state.hero;
    if (!(v > 0)) return;
    if (h.level >= BAL.MAX_LEVEL) { this.addParagonXp(v, quiet); return; }
    h.xp += v;
    let leveled = 0;
    while (h.level < BAL.MAX_LEVEL && h.xp >= BAL.xpToNext(h.level)) {
      h.xp -= BAL.xpToNext(h.level);
      h.level++;
      h.skillPoints += BAL.SKILL_POINTS_PER_LEVEL;
      h.tree.points += BAL.TREE_POINTS_PER_LEVEL;
      leveled++;
    }
    if (h.level >= BAL.MAX_LEVEL && h.xp > 0) { const rest = h.xp; h.xp = 0; this.addParagonXp(rest, true); }
    if (leveled) {
      this.combat.recalc();
      if (this.combat.hero && !this.combat.hero.dead) this.combat.hero.life = this.combat.hero.maxLife;
      for (const f of gameHooks.onLevelUp) f(this, h.level);
      if (!quiet) this.combat.emit({ t: 'levelup', level: h.level });
      this.events.emit('levelUp', { level: h.level, count: leveled });
    }
  }

  addParagonXp(v, quiet) {
    const p = this.state.hero.paragon;
    p.xp += v;
    let n = 0;
    while (p.xp >= BAL.paragonXpToNext(p.level) && n < 10000) { p.xp -= BAL.paragonXpToNext(p.level); p.level++; n++; }
    if (n) {
      this.events.emit('paragonUp', { level: p.level, count: n });
      if (!quiet) this.combat.emit({ t: 'levelup', paragon: p.level });
      this.combat.recalc();
    }
  }

  // ---------------- 変化の知らせ
  onGearChanged() {
    this.combat.recalc();
    this.events.emit('gearChanged', {});
    this.events.emit('invChanged', {});
  }

  onSkillsChanged() {
    this.combat.recalc();
    this.events.emit('skillsChanged', {});
  }

  /** パッシブなど能力に効くものが変わったとき */
  onStatsChanged() {
    this.combat.recalc();
    this.events.emit('statsChanged', {});
  }

  /** セーブ用（そのまま JSON にできる） */
  snapshot() {
    this.state.lastSaved = Date.now();
    this.state.inv.nextUid = peekUid();
    return this.state;
  }
}
