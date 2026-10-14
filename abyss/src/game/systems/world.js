// 進行（ステージ・ウェーブ・ボス・地域の解放）。苦行・裂け目・宝ゴブリンなどはワールド担当が足す。
//
// 流れ: ステージ開始 → ウェーブを WAVES_PER_STAGE 回（全滅させると次）→ ステージクリア
//       → 自動前進なら次のステージへ。stage 10 はボス（制限時間）。倒すと次の地域を解放。
// 外から: game.sys.world.travel(zoneId, stage) / challengeBoss() / setAutoAdvance(bool)
// 差し込み口: worldHooks.waveComposer(sys, ctx) … ウェーブの中身を決める（エリート・ゴブリンなど）
//             worldHooks.levelFor(sys) / worldHooks.modeTick[mode](sys, dt)

import { ZONES, ZONE, STAGES_PER_ZONE, WAVES_PER_STAGE, BOSS_TIME, stageLevel } from '../../data/world.js';
import { MONSTER, ELITE_AFFIXES } from '../../data/monsters.js';
import { BAL } from '../../data/balance.js';

export const worldHooks = {
  waveComposer: null, // (sys, { zone, stage, wave, level, rng }) => [{ id, rank, elite, ... }]
  modes: {}, // mode → { start(sys), tick(sys, dt), onKill(sys, unit), onHeroDeath(sys) , level(sys) }
  onStageClear: [],
  onZoneClear: [],
};

export class WorldSystem {
  constructor(game) {
    this.game = game;
    this.id = 'world';
    this.wave = 0;
    this.waveAlive = 0;
    this.spawnQueue = [];
    this.bossTimer = 0;
    this.bossUnit = null;
    this.deadTimer = 0;
    this.stageKills = 0;
    this.transition = 0; // ステージ間の小休止
    this.banner = null;
  }

  get w() { return this.game.state.world; }
  get combat() { return this.game.combat; }
  zone() { return ZONE[this.w.zone] || ZONES[0]; }

  /** 今のエリアレベル */
  level() {
    const m = worldHooks.modes[this.w.mode];
    if (m?.level) return m.level(this);
    const t = this.w.torment || 0;
    const base = stageLevel(this.zone(), this.w.stage);
    if (t > 0) return Math.max(base, BAL.torment(t).level) + Math.floor((this.zone().global || 0) / 5);
    return base;
  }

  /** 敵に掛ける倍率（苦行など） */
  difficulty() {
    const t = this.w.torment || 0;
    if (t <= 0) return { life: 1, dmg: 1, xp: 1, gold: 1, loot: 1, mf: 0 };
    return BAL.torment(t);
  }

  isBossStage() { return this.w.mode === 'campaign' && this.w.stage >= STAGES_PER_ZONE; }

  startStage() {
    const c = this.combat;
    c.clearEnemies();
    this.wave = 0;
    this.stageKills = 0;
    this.bossUnit = null;
    this.bossTimer = 0;
    this.transition = 0.6;
    const m = worldHooks.modes[this.w.mode];
    if (m?.start) { m.start(this); return; }
    const z = this.zone();
    this.banner = { text: this.isBossStage() ? `ボス　${MONSTER[z.boss]?.name || ''}` : `${z.name}　${this.w.stage}/${STAGES_PER_ZONE}`, t: 2.2, boss: this.isBossStage() };
    this.game.events.emit('stageStart', { zone: z, stage: this.w.stage, boss: this.isBossStage() });
  }

  /** 次のウェーブを主人公の前に出す */
  spawnWave() {
    const c = this.combat;
    const h = c.hero;
    const z = this.zone();
    const L = this.level();
    const diff = this.difficulty();
    const rng = this.game.rng;
    this.wave++;
    if (this.isBossStage()) {
      const isAct = z.zoneIdx === 4;
      const u = c.spawnMonster(z.boss, { level: L + 1, rank: isAct ? 'actboss' : 'boss', x: h.x + 620, y: 0, lifeMul: diff.life, dmgMul: diff.dmg });
      this.bossUnit = u;
      this.bossTimer = BOSS_TIME * (isAct ? 1.5 : 1);
      // お供
      for (let i = 0; i < 2; i++) c.spawnMonster(rng.pick(z.monsters), { level: L, x: h.x + 560 + i * 60, lifeMul: diff.life, dmgMul: diff.dmg });
      this.game.events.emit('bossSpawn', { unit: u });
      return;
    }
    const comp = worldHooks.waveComposer ? worldHooks.waveComposer(this, { zone: z, stage: this.w.stage, wave: this.wave, level: L, rng }) : this.defaultWave(z, L, rng);
    let x = h.x + rng.range(640, 760);
    for (const e of comp) {
      c.spawnMonster(e.id, { level: e.level || L, rank: e.rank || 'normal', elite: e.elite, x: x + (e.dx || 0), y: e.y ?? rng.range(-36, 36), lifeMul: diff.life * (e.lifeMul || 1), dmgMul: diff.dmg * (e.dmgMul || 1), xpMul: e.xpMul, lootMul: e.lootMul, goldMul: e.goldMul, tag: e.tag });
      x += rng.range(28, 60);
    }
  }

  defaultWave(z, L, rng) {
    const n = rng.int(3, 5) + (this.w.stage >= 5 ? 1 : 0);
    const out = [];
    const roll = rng.next();
    if (roll < 0.07) {
      // チャンピオンの群れ（同じ詞が 2〜3 体）
      const id = rng.pick(z.monsters);
      const aff = rng.weightedN(ELITE_AFFIXES, 1 + (L > 30 ? 1 : 0), () => 1).map((a) => a.id);
      for (let i = 0; i < rng.int(2, 3); i++) out.push({ id, rank: 'champion', elite: aff });
    } else if (roll < 0.11) {
      // 群れの長とお供
      const aff = rng.weightedN(ELITE_AFFIXES, 2 + (L > 50 ? 1 : 0), () => 1).map((a) => a.id);
      out.push({ id: rng.pick(z.monsters), rank: 'rare', elite: aff });
      for (let i = 0; i < 3; i++) out.push({ id: rng.pick(z.monsters) });
    }
    while (out.length < n) out.push({ id: rng.pick(z.monsters) });
    return out;
  }

  tick(dt) {
    const c = this.combat;
    const h = c.hero;
    if (!h) return;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    const m = worldHooks.modes[this.w.mode];
    if (m?.tick) { m.tick(this, dt); return; }
    if (h.dead) {
      this.deadTimer += dt;
      if (this.deadTimer >= 3) { this.deadTimer = 0; this.onHeroRespawn(); }
      return;
    }
    if (this.transition > 0) { this.transition -= dt; return; }
    // ボスの時間切れ
    if (this.bossUnit) {
      this.bossTimer -= dt;
      if (this.bossUnit.dead) { this.onBossKilled(); return; }
      if (this.bossTimer <= 0) { this.onBossFail('時間切れ'); return; }
      return;
    }
    const alive = c.enemies().length;
    if (alive === 0) {
      if (this.wave >= (this.isBossStage() ? 1 : WAVES_PER_STAGE)) { this.onStageClear(); return; }
      this.spawnWave();
    }
  }

  onKill(unit) {
    this.stageKills++;
    const m = worldHooks.modes[this.w.mode];
    if (m?.onKill) m.onKill(this, unit);
  }

  onStageClear() {
    const w = this.w;
    const z = this.zone();
    for (const f of worldHooks.onStageClear) f(this);
    this.game.events.emit('stageClear', { zone: z, stage: w.stage });
    w.maxStage[z.id] = Math.max(w.maxStage[z.id] || 1, Math.min(STAGES_PER_ZONE, w.stage + 1));
    if (w.autoAdvance && w.stage < STAGES_PER_ZONE) w.stage++;
    this.startStage();
  }

  onBossKilled() {
    const w = this.w;
    const z = this.zone();
    this.bossUnit = null;
    const first = !w.cleared[z.id];
    w.cleared[z.id] = true;
    const next = ZONES[z.global + 1];
    if (next) {
      w.maxZone = Math.max(w.maxZone, next.global);
      w.maxStage[next.id] ||= 1;
    }
    for (const f of worldHooks.onZoneClear) f(this, z, first);
    this.game.events.emit('zoneClear', { zone: z, first, next });
    this.banner = { text: first ? `${z.name}　踏破！` : 'ボス撃破', t: 2.5, good: true };
    if (w.autoAdvance && next) { w.zone = next.id; w.stage = 1; } else { w.stage = Math.max(1, STAGES_PER_ZONE - 1); }
    this.transition = 1.2;
    this.combat.clearEnemies();
    this.wave = 0;
    setTimeout0(() => this.startStage());
  }

  onBossFail(reason) {
    const w = this.w;
    this.bossUnit = null;
    w.autoAdvance = false; // 失敗したら手前で稼ぐ
    w.stage = STAGES_PER_ZONE - 1;
    this.banner = { text: `ボスに敗れた（${reason}）　手前のステージで鍛えよう`, t: 3, bad: true };
    this.game.events.emit('bossFail', { reason });
    this.startStage();
  }

  onHeroDeath() {
    const m = worldHooks.modes[this.w.mode];
    if (m?.onHeroDeath) { m.onHeroDeath(this); return; }
    this.deadTimer = 0;
    this.game.state.meta.stats.deaths++;
  }

  onHeroRespawn() {
    const c = this.combat;
    c.reviveHero();
    if (this.bossUnit || this.isBossStage()) { this.onBossFail('力尽きた'); return; }
    // 同じ地域で何度も倒れるなら 1 つ戻る
    this.startStage();
  }

  /** 地域とステージを選んで移動 */
  travel(zoneId, stage = 1) {
    const z = ZONE[zoneId];
    if (!z || z.global > this.w.maxZone) return false;
    const maxS = this.w.maxStage[z.id] || 1;
    this.w.mode = 'campaign';
    this.w.zone = z.id;
    this.w.stage = Math.max(1, Math.min(stage, maxS, STAGES_PER_ZONE));
    this.startStage();
    return true;
  }

  challengeBoss() {
    const z = this.zone();
    if ((this.w.maxStage[z.id] || 1) < STAGES_PER_ZONE && !this.w.cleared[z.id]) return false;
    this.w.mode = 'campaign';
    this.w.stage = STAGES_PER_ZONE;
    this.w.autoAdvance = true;
    this.startStage();
    return true;
  }

  setAutoAdvance(v) { this.w.autoAdvance = !!v; }
}

// ステージ開始を次のティックに回す（ティックの途中で敵の一覧を作り直さないため）
const pending = [];
function setTimeout0(fn) { pending.push(fn); }
export function flushWorldPending() { while (pending.length) pending.shift()(); }
