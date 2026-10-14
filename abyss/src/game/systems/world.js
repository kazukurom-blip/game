// 進行（ステージ・ウェーブ・ボス・地域の解放・苦行・ため込み屋・小さな出来事）。
//
// 流れ: ステージ開始 → ウェーブを WAVES_PER_STAGE 回（全滅させると次）→ ステージクリア
//       → 自動前進なら次のステージへ。stage 10 はボス（制限時間）。倒すと次の地域を解放。
//       ボスに負けたら自動前進を切ってステージ 9 で稼ぐ。state.meta.unlocks.autoBoss があれば、
//       火力が足りたとき（または 5 分ごと）に自動で再挑戦する。
// 外から: game.sys.world.travel(zoneId, stage) / challengeBoss() / setAutoAdvance(bool)
//         setTorment(t) / setTormentAuto(bool) / tormentAutoOn() / canTormentAuto() / tormentInfo(t) / bossNeed(zone) / estDps() / zoneAdvice(zone)
//         （苦行の自動最適化は魂の祭壇「苦行の見極め」= state.meta.unlocks.autoTorment が 1 つだけのスイッチ）
//         heroPower() / recommendedPower(level) / resetCampaign(warpGlobal)（転生で使う）
// 差し込み口: worldHooks.waveComposer(sys, ctx) … ウェーブの中身（content/world/composer.js）
//             worldHooks.modes[mode] = { start, tick, onKill, onHeroDeath, level, difficulty, label }（裂け目・門番は systems/rift.js）
//             onWorldInstall(fn) … Game を作るときに 1 回だけ呼ぶ登録（game.js の gameHooks を使う物）
// 出来事（game.events）: stageStart, stageClear, bossSpawn, bossFail, zoneClear, storyClear, tormentUnlock, tormentChanged,
//                         goblinSpawn, goblinKill, goblinEscape, miniEvent, autoBossRetry

import { ZONES, ZONE, ACT, STAGES_PER_ZONE, WAVES_PER_STAGE, BOSS_TIME, ACT_BOSS_TIME_MUL, FINAL_BOSS_TIME_MUL, ACT_BOSS_LIFE_MUL, FINAL_BOSS_LIFE_MUL, FINAL_BOSS_DMG_MUL, BOSS_FAIL_EASE, BOSS_ULT_READY, EARLY_BOSS, stageLevel, FINAL_ZONE } from '../../data/world.js';
import { MONSTER, ELITE_AFFIXES } from '../../data/monsters.js';
import { SKILL } from '../../data/skills.js';
import { BAL } from '../../data/balance.js';
import { runSched, clearSched } from '../content/world/util.js';
import { estimateDps } from '../skills.js';
import * as character from '../character.js';

export const worldHooks = {
  waveComposer: null, // (sys, { zone, stage, wave, level, rng }) => [{ id, rank, elite, dx, behind, y, lifeMul, xpMul, lootMul, tag }]
  modes: {}, // mode → { start(sys), tick(sys, dt), onKill(sys, unit), onHeroDeath(sys), level(sys), difficulty(sys), label(sys) }
  onStageClear: [],
  onZoneClear: [],
};

const installers = [];
let installed = false;
/** Game を作るときに 1 回だけ呼ばれる登録（game.js より先に読み込まれる content から gameHooks に足すため） */
export function onWorldInstall(fn) { installers.push(fn); if (installed) fn(); }

// ため込み屋の出現（秒）と種類の重み
export const GOBLIN_SPAWN = { first: [300, 600], every: [600, 900], weights: { goblin_gold: 40, goblin_mat: 25, goblin_gem: 20, goblin_shard: 15 } };
// 苦行の自動最適化
export const TORMENT_AUTO = { window: 120, upRate: 0.9, downRate: 0.35, maxDeaths: 2 };
// ボスの自動再挑戦
export const AUTO_BOSS = { minGap: 30, maxGap: 180, margin: 1.0 }; // 強さ担当: 45/300 → 30/180（負けるほどボスが弱る BOSS_FAIL_EASE と合わせて、壁を短く）
// 見張り: ふつうのステージで、この秒数だれも倒れないか、STALL_WAVE_SEC 秒ウェーブが進まなければステージをやり直す
export const STALL_RESTART_SEC = 120;
export const STALL_WAVE_SEC = 600;

export function isWeekend(date = new Date()) { const d = date.getDay(); return d === 0 || d === 6; }

export class WorldSystem {
  constructor(game) {
    this.game = game;
    this.id = 'world';
    if (!installed) { installed = true; for (const f of installers) { try { f(); } catch (e) { console.error('[world:install]', e); } } }
    this.wave = 0;
    this.spawnQueue = [];
    this.bossTimer = 0;
    this.bossUnit = null;
    this.deadTimer = 0;
    this.stageKills = 0;
    this.transition = 0;
    this.banner = null;
    this.samples = []; // 1 体に与えた火力の測定 { life, ttk }
    this.pendingGoblin = null;
    this.lastEventAt = -999;
    this.tw = { t: 0, kills: 0, deaths: 0 }; // 魔境の自動最適化の窓
    this.festivalOverride = null; // テスト用（true/false で週末の祭を固定）
    this.watch = { t: 0, dmg: 0, nudged: false }; // 止まってしまったときの見張り
    this.bossStart = 0;
  }

  get w() { return this.game.state.world; }
  get combat() { return this.game.combat; }
  zone() { return ZONE[this.w.zone] || ZONES[0]; }
  mode() { return worldHooks.modes[this.w.mode] || null; }

  ensureState(state) {
    const w = state.world;
    const g = this.game;
    w.rift = { best: 0, runs: 0, keys: 0, level: 1, unlocked: 1, clears: 0, history: [], auto: 'off', run: null, bestTime: {}, ...(w.rift || {}) };
    w.gate = { frags: {}, kills: {}, tries: 0, wins: 0, history: [], ...(w.gate || {}) };
    // 苦行の自動最適化のスイッチは魂の祭壇「苦行の見極め」の 1 つだけ（state.meta.unlocks.autoTorment）。前の形の w.tormentAuto は捨てる
    delete w.tormentAuto;
    w.tormentStats ||= {};
    w.bossLog ||= {};
    w.clearedAt ||= {};
    w.events ||= {};
    w.dpsK ??= 1;
    w.goblinEscaped ||= 0;
    if (!(w.goblinT >= 0)) w.goblinT = g.rng.range(...GOBLIN_SPAWN.first);
    w.maxStage ||= {};
    w.maxStage[ZONES[0].id] ||= 1;
    if (!ZONE[w.zone]) { w.zone = ZONES[Math.min(ZONES.length - 1, w.maxZone || 0)].id; w.stage = 1; }
    if (w.maxZone >= ZONES.length) w.maxZone = ZONES.length - 1;
  }

  onLoad() {
    const w = this.w;
    if (w.mode !== 'campaign' && !worldHooks.modes[w.mode]) w.mode = 'campaign';
  }

  // ---------------- 数値
  /** 今のエリアレベル */
  level() {
    const m = this.mode();
    if (m?.level) return m.level(this);
    return this.campaignLevel(this.zone(), this.w.stage, this.w.torment || 0);
  }

  campaignLevel(z, stage, t = 0) {
    const base = stageLevel(z, stage);
    if (t > 0) return Math.max(base, BAL.torment(t).level) + Math.floor((z.global || 0) / 10); // 魔境では 2 章ごとに +1
    return base;
  }

  /** 敵に掛ける倍率（苦行・裂け目など） */
  difficulty() {
    const m = this.mode();
    if (m?.difficulty) return m.difficulty(this);
    const t = this.w.torment || 0;
    const sc = BAL.monsterScale(this.level());
    if (t <= 0) return { life: sc.life, dmg: sc.dmg, xp: 1, gold: 1, loot: 1, mf: 0 };
    const tt = BAL.torment(t);
    return { ...tt, life: tt.life * sc.life, dmg: tt.dmg * sc.dmg };
  }

  isBossStage() { return this.w.mode === 'campaign' && this.w.stage >= STAGES_PER_ZONE; }

  modeLabel() {
    const m = this.mode();
    return m?.label ? m.label(this) : this.w.mode;
  }

  // ---------------- ステージ
  startStage() {
    const c = this.combat;
    c.clearEnemies();
    clearSched(c);
    this.wave = 0;
    this.stageKills = 0;
    this.bossUnit = null;
    this.bossTimer = 0;
    this.transition = 0.6;
    const m = this.mode();
    if (m?.start) { m.start(this); return; }
    const z = this.zone();
    const boss = this.isBossStage();
    if (boss) {
      const def = MONSTER[z.boss];
      this.banner = z.zoneIdx === 4 ? null : { text: `ボス　${def?.name || ''}`, t: 2.2, boss: true };
    } else {
      this.banner = { text: `${z.name}　${this.w.stage}/${STAGES_PER_ZONE}`, t: 2.2 };
    }
    this.game.events.emit('stageStart', { zone: z, stage: this.w.stage, boss });
  }

  /** 地域のボスのライフの追加の倍率（章のボスは少し軽く、深淵王は重く） */
  bossLifeMul(z) {
    const def = MONSTER[z.boss];
    const ease = this.bossEase(z).life;
    if (def?.kind === 'final') return FINAL_BOSS_LIFE_MUL * ACT_BOSS_LIFE_MUL * ease;
    if (EARLY_BOSS[z.global] && !(this.w.torment > 0)) return EARLY_BOSS[z.global][0] * ease;
    // 第一章のボスは「最初の壁」なので軽くしない
    return (z.zoneIdx === 4 && z.actIdx > 0 ? ACT_BOSS_LIFE_MUL : 1) * ease * (this.w.torment > 0 ? BAL.TORMENT.bossLife ?? 1 : 1);
  }

  /** 続けて負けるほどボスが少し弱る（BOSS_FAIL_EASE。勝つと戻る）。{ life, dmg, pct } */
  bossEase(z) {
    const n = Math.max(0, this.w.bossLog?.[z.id]?.streak || 0);
    const E = BOSS_FAIL_EASE;
    return { life: 1 - Math.min(E.lifeMax, n * E.life), dmg: 1 - Math.min(E.dmgMax, n * E.dmg), pct: Math.round(Math.min(E.lifeMax, n * E.life) * 100) };
  }

  bossTimeFor(z) {
    const def = MONSTER[z.boss];
    return BOSS_TIME * (def?.kind === 'final' ? FINAL_BOSS_TIME_MUL : z.zoneIdx === 4 ? ACT_BOSS_TIME_MUL : 1);
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
      const def = MONSTER[z.boss];
      const u = c.spawnMonster(z.boss, { level: L + 1, rank: isAct ? 'actboss' : 'boss', x: h.x + 620, y: 0, lifeMul: diff.life * this.bossLifeMul(z), dmgMul: diff.dmg * this.bossEase(z).dmg * (def?.kind === 'final' ? FINAL_BOSS_DMG_MUL : 1) * (EARLY_BOSS[z.global] && !(this.w.torment > 0) ? EARLY_BOSS[z.global][1] : 1) });
      this.bossUnit = u;
      this.bossTimer = this.bossTimeFor(z);
      // ボス戦の始めに奥義の待ち時間を BOSS_ULT_READY 秒以下にする（直前の群れで使ってしまい、勝ち負けが運で決まるのを防ぐ）
      if (h?.cds) for (const id in h.cds) if (SKILL[id]?.kind === 'ult') h.cds[id] = Math.min(h.cds[id], BOSS_ULT_READY);
      this.bossStart = this.game.time;
      this.bossEstAtStart = this.estDpsRaw();
      // お供
      const adds = isAct ? 3 : 2;
      for (let i = 0; i < adds; i++) c.spawnMonster(rng.pick(z.monsters), { level: L, x: h.x + 540 + i * 60, lifeMul: diff.life, dmgMul: diff.dmg });
      if (isAct && u) {
        const act = ACT[z.act];
        const title = def.kind === 'final' ? '最後の敵' : `${(act?.name || '').split('　')[1] || ''}の主`;
        this.banner = { text: `― ${title} ―　${def.name}`, t: 3.6, boss: true, intro: true, sub: def.desc };
        c.emit({ t: 'bossIntro', unit: u, name: def.name, title, act: z.act, final: def.kind === 'final', desc: def.desc });
      }
      const log = this.logFor(z.id);
      log.tries++;
      this.game.events.emit('bossSpawn', { unit: u, zone: z, act: isAct });
      return;
    }
    const comp = worldHooks.waveComposer ? worldHooks.waveComposer(this, { zone: z, stage: this.w.stage, wave: this.wave, level: L, rng }) : this.defaultWave(z, L, rng);
    let x = h.x + rng.range(640, 760);
    let bx = h.x - rng.range(420, 520);
    for (const e of comp) {
      const ex = e.behind ? bx : x + (e.dx || 0);
      const u = c.spawnMonster(e.id, { level: e.level || L, rank: e.rank || 'normal', elite: e.elite, x: ex, y: e.y ?? rng.range(-36, 36), lifeMul: diff.life * (e.lifeMul || 1), dmgMul: diff.dmg * (e.dmgMul || 1), xpMul: e.xpMul, lootMul: e.lootMul, goldMul: e.goldMul, tag: e.tag });
      if (e.behind) bx -= rng.range(28, 60); else x += rng.range(28, 60);
      if (u && e.rank === 'goblin') this.game.events.emit('goblinSpawn', { unit: u, kind: MONSTER[e.id]?.goblin });
    }
  }

  defaultWave(z, L, rng) {
    const n = rng.int(3, 5) + (this.w.stage >= 5 ? 1 : 0);
    const out = [];
    while (out.length < n) out.push({ id: rng.pick(z.monsters) });
    return out;
  }

  tick(dt) {
    const c = this.combat;
    const h = c.hero;
    if (!h) return;
    runSched(c);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    this.watchdog(dt);
    const m = this.mode();
    if (m?.tick) { m.tick(this, dt); return; }
    this.tickCampaignExtras(dt);
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
    const alive = c.enemyCount();
    if (alive === 0) {
      if (this.wave >= (this.isBossStage() ? 1 : WAVES_PER_STAGE)) { this.onStageClear(); return; }
      this.spawnWave();
    }
  }

  /** 物語・苦行の間だけ動く物（ため込み屋・苦行の自動最適化） */
  tickCampaignExtras(dt) {
    const w = this.w;
    if (!this.isBossStage() && !this.pendingGoblin) {
      w.goblinT -= dt;
      if (w.goblinT <= 0) {
        const fest = this.festival();
        w.goblinT = this.game.rng.range(...GOBLIN_SPAWN.every) / (fest ? 2 : 1);
        const ws = GOBLIN_SPAWN.weights;
        this.pendingGoblin = this.game.rng.weighted(Object.keys(ws), (k) => ws[k]);
      }
    }
    if ((w.maxTorment || 0) >= 1 && this.tormentAutoOn()) {
      const tw = this.tw;
      tw.t += dt;
      if (tw.t >= TORMENT_AUTO.window) {
        const rate = tw.kills / tw.t;
        const t = w.torment || 0;
        const st = (w.tormentStats[t] ||= { rate: 0, deaths: 0, secs: 0 });
        st.rate = st.secs ? (st.rate * 0.6 + rate * 0.4) : rate; st.deaths += tw.deaths; st.secs += tw.t;
        let next = t;
        if (tw.deaths >= TORMENT_AUTO.maxDeaths || rate < TORMENT_AUTO.downRate) next = Math.max(0, t - 1);
        else if (tw.deaths === 0 && rate >= TORMENT_AUTO.upRate && t < w.maxTorment) next = t + 1;
        this.tw = { t: 0, kills: 0, deaths: 0 };
        if (next !== t) this.setTorment(next, { auto: true });
      }
    }
  }

  festival() { return this.festivalOverride ?? isWeekend(); }

  /**
   * 見張り: 敵がいるのに 20 秒間だれにもダメージが入らなければ、主人公に重なった敵を少し離す。
   * 40 秒続いたらそのステージをやり直す（放置で永久に止まらないように）。
   */
  watchdog(dt) {
    const c = this.combat;
    const h = c.hero;
    const wd = this.watch;
    if (!h || h.dead || this.transition > 0) { wd.t = 0; wd.dmg = c.stats.dmgDone; return; }
    // 倒しきれない敵（再生するエリート・手下を呼び続ける敵など）に当て続けて止まるのを防ぐ: ふつうのステージで
    // 2 分だれも倒れないか、10 分ウェーブが進まなければやり直す（手下は倒れ続けるので、撃破数だけでは見張れない。
    // 弱い主人公の遅いウェーブまでやり直すと、ステージが終わらずボスに再挑戦できなくなるので、ウェーブの方は長めに）
    const kills = this.game.state.meta.stats.kills;
    const key = `${this.w.zone}:${this.w.stage}:${this.wave}`;
    if (wd.key !== key || !c.enemies().length || this.bossUnit || this.w.mode !== 'campaign') { wd.key = key; wd.kills = kills; wd.kt = 0; wd.wt = 0; } else {
      if (wd.kills !== kills) { wd.kills = kills; wd.kt = 0; } else wd.kt = (wd.kt || 0) + dt;
      wd.wt = (wd.wt || 0) + dt;
      if (wd.kt >= STALL_RESTART_SEC || wd.wt >= STALL_WAVE_SEC) { wd.kt = 0; wd.wt = 0; this.stuckRestarts = (this.stuckRestarts || 0) + 1; this.startStage(); return; }
    }
    if (c.stats.dmgDone !== wd.dmg) { wd.dmg = c.stats.dmgDone; wd.t = 0; wd.nudged = false; return; }
    const foes = c.enemies();
    if (!foes.length) { wd.t = 0; return; }
    wd.t += dt;
    if (wd.t >= 20 && !wd.nudged) {
      wd.nudged = true;
      for (const u of foes) if (Math.abs(u.x - h.x) < 100) { u.x = h.x + 110 * (h.face || 1); if (u.ctl && !u.goblin) { u.ctl = null; u.windup = 0; } }
    } else if (wd.t >= 40) {
      wd.t = 0; wd.nudged = false;
      this.stuckRestarts = (this.stuckRestarts || 0) + 1;
      if (this.w.mode === 'campaign') this.startStage();
      else for (const u of foes) u.x = h.x + 300;
    }
  }

  onKill(unit) {
    this.stageKills++;
    if (this.w.mode === 'campaign') this.tw.kills++;
    const m = this.mode();
    if (m?.onKill) m.onKill(this, unit);
  }

  /** 倒した敵の「最大ライフ ÷ 倒すまでの秒数」（bosses.js から） */
  noteKill(life, ttk) {
    this.samples.push({ life, ttk });
    if (this.samples.length > 40) this.samples.shift();
  }

  /** 1 体に与えられる火力の測定値（補正なし） */
  estDpsRaw() {
    const s = this.samples;
    const sk = this.skillDps() * 0.75; // スキルの見積もり（下限）
    if (s.length < 4) return sk;
    let a = 0; let b = 0;
    for (const x of s) { a += x.life; b += x.ttk; }
    return Math.max(sk, a / Math.max(0.01, b));
  }

  /** ボスへの火力の見積もり（前のボス戦の実測で補正） */
  estDps(zoneId = this.w.zone) {
    const k = this.w.bossLog[zoneId]?.k ?? this.w.dpsK ?? 1;
    return this.estDpsRaw() * Math.max(0.25, Math.min(1.6, k));
  }

  skillDps() {
    const st = this.game.state; const H = this.game.H;
    if (!H) return 0;
    let best = 0;
    for (const id of st.hero.bar) { if (!id || !st.hero.skills[id]) continue; try { best = Math.max(best, estimateDps(st, H, id)); } catch { /* 次へ */ } }
    return best;
  }

  /** ボスを倒すのに要る DPS の目安（制限時間の 85% で倒す） */
  bossNeed(z = this.zone(), torment = this.w.torment || 0) {
    const def = MONSTER[z.boss];
    if (!def) return { life: 0, need: 0, time: BOSS_TIME, def };
    const L = this.campaignLevel(z, STAGES_PER_ZONE, torment) + 1;
    const rk = BAL.RANK[z.zoneIdx === 4 ? 'actboss' : 'boss'];
    const dl = (torment > 0 ? BAL.torment(torment).life : 1) * BAL.monsterScale(L - 1).life;
    const life = BAL.monsterLife(L) * (def.life || 1) * (1 + (def.tax || 0)) * rk.life * dl * this.bossLifeMul(z); // tax: 特技の重さ（data/monsters.js）
    const time = this.bossTimeFor(z) + (def.phases ? def.phases.length * 20 : 0);
    return { life, need: life / (time * 0.85), time, def, level: L };
  }

  logFor(zoneId) { return (this.w.bossLog[zoneId] ||= { tries: 0, fails: 0, lastDps: 0, streak: 0, lastTry: -1e9 }); }

  /** ボス戦の結果を記録（実測の DPS と、見積もりとの比） */
  recordBossFight(z, won) {
    const b = this.bossUnit;
    const log = this.logFor(z.id);
    const dur = Math.max(1, this.game.time - this.bossStart);
    if (b) {
      const dealt = Math.max(0, b.maxLife - Math.max(0, b.life));
      const dps = dealt / dur;
      log.lastDps = dps;
      if ((dur >= 6 || won) && this.bossEstAtStart > 0) {
        const k = Math.max(0.2, Math.min(2, dps / this.bossEstAtStart));
        log.k = log.k ? log.k * 0.5 + k * 0.5 : k;
        this.w.dpsK = (this.w.dpsK ?? 1) * 0.7 + k * 0.3;
      }
    }
    const now = this.game.state.playTime;
    log.lastTry = now;
    if (won) {
      if (log.firstFail != null && log.wall == null) log.wall = Math.round(now - log.firstFail); // 壁の長さ（初めて負けてから倒すまで）
      log.streak = 0; log.won = (log.won || 0) + 1;
    } else {
      if (log.firstFail == null) log.firstFail = Math.round(now);
      log.fails++; log.streak++;
    }
  }

  onStageClear() {
    const w = this.w;
    const z = this.zone();
    for (const f of worldHooks.onStageClear) f(this);
    this.game.events.emit('stageClear', { zone: z, stage: w.stage });
    w.maxStage[z.id] = Math.max(w.maxStage[z.id] || 1, Math.min(STAGES_PER_ZONE, w.stage + 1));
    if (this.shouldAutoRetry()) {
      w.stage = STAGES_PER_ZONE; w.autoAdvance = true;
      this.game.events.emit('autoBossRetry', { zone: z });
    } else if (w.autoAdvance && w.stage < STAGES_PER_ZONE) w.stage++;
    this.startStage();
  }

  /** ボスの自動再挑戦をするか（state.meta.unlocks.autoBoss が必要） */
  shouldAutoRetry() {
    const st = this.game.state;
    const w = this.w;
    if (!st.meta.unlocks?.autoBoss || w.mode !== 'campaign') return false;
    const z = this.zone();
    if (w.bossFailZone !== z.id || w.cleared[z.id] || w.stage >= STAGES_PER_ZONE) return false;
    const log = this.logFor(z.id);
    const since = st.playTime - log.lastTry;
    if (since >= AUTO_BOSS.maxGap) return true;
    const gap = Math.min(AUTO_BOSS.maxGap, AUTO_BOSS.minGap * Math.max(1, log.streak));
    if (since < gap) return false;
    return this.estDps(z.id) >= this.bossNeed(z).need * (AUTO_BOSS.margin + 0.1 * Math.max(0, log.streak - 1));
  }

  onBossKilled() {
    const w = this.w;
    const z = this.zone();
    this.recordBossFight(z, true);
    this.bossUnit = null;
    const first = !w.cleared[z.id];
    w.cleared[z.id] = true;
    if (w.bossFailZone === z.id) w.bossFailZone = null;
    if (first) w.clearedAt[z.id] = Math.round(this.game.state.playTime);
    const next = ZONES[z.global + 1];
    if (next) {
      w.maxZone = Math.max(w.maxZone, next.global);
      w.maxStage[next.id] ||= 1;
    }
    for (const f of worldHooks.onZoneClear) f(this, z, first);
    this.game.events.emit('zoneClear', { zone: z, first, next });
    this.banner = { text: first ? `${z.name}　踏破！` : 'ボス撃破', t: 2.5, good: true };
    // 物語の最後
    if (z.id === FINAL_ZONE && (w.maxTorment || 0) < 1) {
      w.maxTorment = 1;
      w.rift.unlocked = Math.max(1, w.rift.unlocked || 1);
      this.banner = { text: '深淵王を討った！　魔境と深淵の裂け目が開いた', t: 5, good: true };
      this.game.events.emit('storyClear', {});
      this.game.events.emit('tormentUnlock', { tier: 1 });
    }
    // 苦行の区切り: その段で章のボスを倒すと次の段が開く
    const t = w.torment || 0;
    if (t >= 1 && z.zoneIdx === 4 && t >= (w.maxTorment || 0) && t < BAL.MAX_TORMENT) {
      w.maxTorment = t + 1;
      this.banner = { text: `魔境 ${roman(t + 1)} が解放された`, t: 3.5, good: true };
      this.game.events.emit('tormentUnlock', { tier: t + 1 });
    }
    if (w.autoAdvance && next) { w.zone = next.id; w.stage = 1; } else { w.stage = Math.max(1, STAGES_PER_ZONE - 1); }
    this.transition = 1.2;
    this.combat.clearEnemies();
    this.wave = 0;
    setTimeout0(() => this.startStage());
  }

  onBossFail(reason) {
    const w = this.w;
    const z = this.zone();
    this.recordBossFight(z, false);
    this.bossUnit = null;
    w.autoAdvance = false; // 失敗したら手前で稼ぐ
    w.stage = STAGES_PER_ZONE - 1;
    w.bossFailZone = z.id;
    const nd = this.bossNeed(z);
    const est = this.estDps(z.id);
    const short = nd.need > 0 ? Math.max(0, Math.round((1 - est / nd.need) * 100)) : 0;
    const tip = reason === '力尽きた' ? '耐久（ライフ・アーマー・耐性）を上げよう' : short > 0 ? `火力があと ${short}% 足りない` : 'もう一度挑めば届きそう';
    this.banner = { text: `ボスに敗れた（${reason}）　${tip}`, t: 3.5, bad: true };
    this.game.events.emit('bossFail', { reason, zone: z, need: nd.need, est, short });
    this.startStage();
  }

  onHeroDeath() {
    if (this.w.mode === 'campaign') this.tw.deaths++;
    const m = this.mode();
    if (m?.onHeroDeath) { m.onHeroDeath(this); return; }
    this.deadTimer = 0;
    this.game.state.meta.stats.deaths++;
  }

  onHeroRespawn() {
    const c = this.combat;
    c.reviveHero();
    if (this.bossUnit || this.isBossStage()) { this.onBossFail('力尽きた'); return; }
    this.startStage();
  }

  /** 地域とステージを選んで移動 */
  travel(zoneId, stage = 1) {
    const z = ZONE[zoneId];
    if (!z || z.global > this.w.maxZone) return false;
    const m = this.mode();
    if (m?.abort) m.abort(this, 'travel');
    const maxS = this.w.cleared[z.id] ? STAGES_PER_ZONE : (this.w.maxStage[z.id] || 1);
    this.w.mode = 'campaign';
    this.w.zone = z.id;
    this.w.stage = Math.max(1, Math.min(stage, maxS, STAGES_PER_ZONE));
    if (this.w.bossFailZone && this.w.bossFailZone !== z.id) this.w.bossFailZone = null;
    this.startStage();
    return true;
  }

  challengeBoss() {
    const z = this.zone();
    if (this.w.mode !== 'campaign') return false;
    if ((this.w.maxStage[z.id] || 1) < STAGES_PER_ZONE && !this.w.cleared[z.id]) return false;
    this.w.stage = STAGES_PER_ZONE;
    this.w.autoAdvance = true;
    this.startStage();
    return true;
  }

  setAutoAdvance(v) { this.w.autoAdvance = !!v; }

  // ---------------- 苦行
  /** 段 t の倍率（UI 用） */
  tormentInfo(t) {
    const tt = BAL.torment(t);
    if (t <= 0) return { t: 0, name: 'なし', life: 1, dmg: 1, xp: 1, gold: 1, loot: 1, mf: 0, resPenalty: 0, level: 0, ancient: 0.08, primal: 0 };
    return { t, name: `魔境 ${roman(t)}`, ...tt };
  }

  setTorment(t, { auto = false } = {}) {
    const w = this.w;
    t = Math.max(0, Math.min(w.maxTorment || 0, Math.round(t)));
    if (t === (w.torment || 0)) return false;
    w.torment = t;
    this.game.onStatsChanged(); // 耐性の減り
    if (w.mode === 'campaign') this.startStage();
    this.game.events.emit('tormentChanged', { tier: t, auto });
    if (auto) this.banner = { text: `魔境を ${t ? roman(t) : 'なし'} に自動で切り替えた`, t: 2.5 };
    return true;
  }

  /** 苦行の自動最適化が動いているか（魂の祭壇「苦行の見極め」を持っていて ON） */
  tormentAutoOn() { return !!this.game.state.meta.unlocks?.autoTorment; }
  /** 自動最適化を使えるか（祭壇の「苦行の見極め」を持っている） */
  canTormentAuto() { return (this.game.sys.prestige?.level?.('auto_torment') || 0) > 0; }
  /** スイッチ（祭壇の ON/OFF と同じ物）。持っていなければ false を返して何もしない */
  setTormentAuto(v) {
    if (!this.canTormentAuto()) return false;
    this.game.sys.prestige.setToggle('autoTorment', !!v);
    this.tw = { t: 0, kills: 0, deaths: 0 };
    return true;
  }

  // ---------------- 小さな出来事（composer.js から）
  onMiniEvent(ev, rng) {
    const w = this.w;
    w.events[ev] = (w.events[ev] || 0) + 1;
    const C = worldHooks.composerInfo;
    let text = C?.EVENTS?.[ev]?.text || '';
    if (ev === 'shrine' && C?.SHRINES) {
      const s = rng.pick(C.SHRINES);
      this.combat.addBuff(s.id, s.mods, s.dur, { name: s.name });
      text = s.text;
      this.combat.emit({ t: 'shrine', id: s.id, name: s.name, unit: this.combat.hero });
    }
    this.banner = { text, t: 2.6, good: ev === 'shrine' };
    this.game.events.emit('miniEvent', { kind: ev, text });
  }

  // ---------------- 戦力（地図の目安）
  heroPower(H = this.game.H) {
    if (!H) return 0;
    if (typeof character.heroPower === 'function') { try { return character.heroPower(H, this.game.state); } catch { /* 下へ */ } }
    return this.basePower(H);
  }

  basePower(H = this.game.H) {
    if (!H) return 0;
    const dps = Math.max(1, this.skillDps());
    const ehp = Math.max(1, character.effectiveLife(H, H.level));
    return Math.sqrt(dps * ehp);
  }

  /** エリアレベル L の地域の推奨戦力（heroPower と同じ物差しに合わせる） */
  recommendedPower(L, torment = 0) {
    const H = this.game.H;
    const sc = BAL.monsterScale(L);
    const lifeMul = (torment > 0 ? BAL.torment(torment).life : 1) * sc.life;
    const dmgMul = (torment > 0 ? BAL.torment(torment).dmg : 1) * sc.dmg;
    const needDps = (BAL.monsterLife(L + 1) * BAL.RANK.boss.life * lifeMul) / (BOSS_TIME * 0.85);
    const needEhp = BAL.monsterDmg(L + 1) * BAL.RANK.boss.dmg * dmgMul * 12;
    const base = Math.sqrt(needDps * needEhp);
    const mine = this.basePower(H);
    const k = mine > 0 ? this.heroPower(H) / mine : 1;
    return base * (Number.isFinite(k) && k > 0 ? k : 1);
  }

  /** 地域の目安: { level, rec, power, ratio, label, cls } */
  zoneAdvice(z, torment = this.w.torment || 0) {
    const L = this.campaignLevel(z, 5, torment);
    const rec = this.recommendedPower(L, torment);
    const power = this.heroPower();
    // 目安の言葉は「火力（ボスの必要 DPS に対して）」と「耐久（ボスの攻撃 8 回ぶん）」の弱い方で決める
    const nd = this.bossNeed(z, torment);
    const dpsRatio = nd.need > 0 ? this.estDps(z.id) / nd.need : 1;
    const H = this.game.H;
    const Lb = nd.level || L + 1;
    const sc = BAL.monsterScale(Lb - 1);
    const rk = BAL.RANK[z.zoneIdx === 4 ? 'actboss' : 'boss'];
    const early = EARLY_BOSS[z.global] && !(torment > 0) ? EARLY_BOSS[z.global][1] : 1;
    const needEhp = BAL.monsterDmg(Lb) * rk.dmg * (torment > 0 ? BAL.torment(torment).dmg : 1) * sc.dmg * early * 8;
    const ehpRatio = H ? character.effectiveLife(H, Lb) / Math.max(1, needEhp) : 1;
    const ratio = Math.min(dpsRatio, ehpRatio);
    const label = ratio >= 1.6 ? '楽勝' : ratio >= 1 ? 'ちょうどよい' : ratio >= 0.7 ? '手ごわい' : '危険';
    const cls = ratio >= 1.6 ? 'easy' : ratio >= 1 ? 'ok' : ratio >= 0.7 ? 'hard' : 'danger';
    const weak = ratio >= 1 ? null : dpsRatio <= ehpRatio ? '火力' : '耐久';
    return { level: L, rec, power, ratio, dpsRatio, ehpRatio, weak, label, cls, recLevel: Math.max(1, Math.min(100, z.level + 2)) };
  }

  /** 転生などで物語の進み具合を戻す。warpGlobal（通し番号）までの地域は踏破済みにして、そこへ移動する */
  resetCampaign(warpGlobal = 0) {
    const w = this.w;
    const m = this.mode();
    if (m?.abort) m.abort(this, 'reset');
    warpGlobal = Math.max(0, Math.min(ZONES.length - 1, Math.floor(warpGlobal)));
    w.mode = 'campaign';
    w.cleared = {}; w.maxStage = {}; w.bossFailZone = null;
    for (let i = 0; i < warpGlobal; i++) { w.cleared[ZONES[i].id] = true; w.maxStage[ZONES[i].id] = STAGES_PER_ZONE; }
    w.maxZone = warpGlobal;
    w.maxStage[ZONES[warpGlobal].id] = 1;
    w.zone = ZONES[warpGlobal].id; w.stage = 1; w.autoAdvance = true;
    this.startStage();
  }
}

export function roman(n) {
  const R = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; let v = Math.max(0, Math.floor(n));
  for (const [k, r] of R) while (v >= k) { s += r; v -= k; }
  return s || '0';
}

// ステージ開始を次のティックに回す（ティックの途中で敵の一覧を作り直さないため）
const pending = [];
function setTimeout0(fn) { pending.push(fn); }
export function flushWorldPending() { while (pending.length) pending.shift()(); }

export { ELITE_AFFIXES };
