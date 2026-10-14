// 深淵の裂け目（制限時間つき・段階は上限なし）と 門番（苦行で集めた欠片で呼ぶ強敵）。
// 物語の最後（深淵王）を倒すと開く（state.meta.unlocks.rift でも開く）。
//
// 裂け目の流れ: 段階を選ぶ → 15 分の制限時間 → 倒すと進行がたまる（ふつう 1・チャンピオン 4・群れの長 6）→ 400 で守護者
//   → 倒すと報酬（深淵の欠片・ゴールド・経験値・レジェンダリー確定を含む装備・game.sys.gems.onRiftComplete）
//   残り時間 40% 以上で 2 段上まで、60% 以上で 3 段上まで解放（ふつうは 1 段上）。倒れると 1 回目 -30 秒、2 回目から -60 秒。
//   敵の並びは段階ごとに決まった種から作る（同じ段階は何度でも同じ。やり直しで有利にならない）。
// 門番の流れ: 苦行で地域のボスが落とす「門の欠片」（2 章ずつ 1 組・4 種）をそろえる → 呼ぶ（120 秒）
//   → 勝てばミシックの機会・レジェンダリー 2 つ・次の門の欠片 1 つ（必ず）・初めての撃破で永続の「門番の証」
//   → 負ければ欠片を 2 つ返す。挑む前に 100 戦の見積もりで推定勝率を出す。
//
// 外から: game.sys.rift.available() / info(level) / begin(level) / abandon() / setAuto('off'|'same'|'push')
//         gateStatus() / canSummon(gi) / summonGate(gi) / gateOdds(gi) / fightOdds(spec)
// 出来事（game.events）: riftStart, riftGuardian, riftComplete, riftFail, gateStart, gateResult

import { worldHooks, roman } from './world.js';
import { BAL } from '../../data/balance.js';
import { ACTS, ZONE, GATE_GROUPS, FINAL_ZONE, STAGES_PER_ZONE } from '../../data/world.js';
import { MONSTER, RIFT_GUARDIANS } from '../../data/monsters.js';
import { RNG, hashStr } from '../../engine/rng.js';
import { generateItem } from '../loot.js';
import { pickAffixes } from '../content/world/elites.js';
import { registry } from '../registry.js';
import * as character from '../character.js';

export const RIFT = {
  need: 400,
  value: { normal: 1, champion: 4, rare: 6, add: 0.25 },
  deathPenalty: [30, 60],
  skip: [[0.6, 2], [0.4, 1]], // 残り時間の割合 → 追加で開く段
  extraOpen: 1, // ふつうは 1 段上が開く
  respawn: 3,
  doneDelay: 4,
  maxAliveBase: 7,
};
export const GATE = { time: 120, levelAdd: 5, mythicBase: 0.04, mythicPerTier: 0.005, mythicCap: 0.15, refund: 2, badge: { dmg: 4, life: 4 } };

/** 段階 g の数値（敵ライフ・攻撃・報酬の倍率） */
export function riftDifficulty(g) {
  const r = BAL.rift(g);
  const sc = BAL.monsterScale(r.level);
  return {
    level: r.level, life: r.life * sc.life, dmg: r.dmg * sc.dmg, timeLimit: r.timeLimit, riftLife: r.life, riftDmg: r.dmg,
    xp: 1 + 0.08 * g, gold: 1 + 0.05 * g, loot: 1 + 0.02 * g, mf: 50 + 3 * g,
    ancient: Math.min(0.35, 0.1 + 0.002 * g), primal: g >= 30 ? Math.min(0.03, 0.0005 * (g - 29)) : 0,
  };
}
/** 裂け目の中での耐性の減り（苦行の段に置き換える） */
export const riftTormentTier = (g) => Math.min(BAL.MAX_TORMENT, Math.floor(g / 5));
/** セーブの中の裂け目の途中が使える形か */
function validRun(r) {
  const fin = Number.isFinite;
  return !!r && typeof r === 'object' && fin(r.level) && r.level >= 1 && fin(r.seed) && fin(r.limit) && r.limit > 0 && fin(r.timeLeft) && fin(r.progress) && fin(r.need) && r.need > 0
    && ['run', 'guardian', 'done'].includes(r.phase) && Array.isArray(r.acts) && r.acts.length > 0 && [...r.acts].every((a) => Number.isInteger(a) && !!ACTS[a]); // [...] で穴あきの配列も調べる
}
export const guardianFor = (g) => RIFT_GUARDIANS[Math.floor((Math.max(1, g) - 1) / 5) % RIFT_GUARDIANS.length];

export class RiftSystem {
  constructor(game) {
    this.game = game;
    this.id = 'rift';
    this.spawnCd = 0;
    this.endT = 0;
    this.deadT = 0;
  }

  get st() { return this.game.state; }
  get w() { return this.game.state.world; }
  get R() { return this.game.state.world.rift; }
  get ws() { return this.game.sys.world; }

  ensureState(state) {
    const w = state.world;
    if (w.mode === 'gate') {
      // 門番の戦いは続きから再開できないので欠片を返す
      const run = w.gate?.run;
      if (run) for (let k = 0; k < 4; k++) { const key = `${GATE_GROUPS[run.gi].id}_${k}`; w.gate.frags[key] = (w.gate.frags[key] || 0) + 1; }
      if (w.gate) w.gate.run = null;
      if (run?.returnZone) { w.zone = run.returnZone; w.stage = run.returnStage || 1; w.torment = run.returnTorment ?? w.torment; }
      w.mode = 'campaign';
    }
    // 壊れた裂け目の途中（数や章の番号がおかしい）は、報酬なしで物語に戻す
    const run = w.rift?.run;
    if (run && !validRun(run)) {
      if (run && typeof run === 'object' && ZONE[run.returnZone]) { w.zone = run.returnZone; w.stage = Math.max(1, Math.min(STAGES_PER_ZONE - 1, Math.floor(run.returnStage) || 1)); }
      w.rift.run = null;
      if (w.mode === 'rift') { w.mode = 'campaign'; w.torment = Math.min(w.maxTorment || 0, w.torment || 0); }
    } else if (run) { for (const k of ['deaths', 'kills', 'pack']) if (!Number.isFinite(run[k])) run[k] = 0; }
    if (w.mode === 'rift' && !w.rift?.run) w.mode = 'campaign';
  }

  available() {
    const w = this.w;
    return (w.maxTorment || 0) >= 1 || !!w.cleared?.[FINAL_ZONE] || !!this.st.meta.unlocks?.rift;
  }

  /** 段階 g の説明（UI 用） */
  info(g) {
    const d = riftDifficulty(g);
    const gd = guardianFor(g);
    return {
      level: g, areaLevel: d.level, life: d.life, dmg: d.dmg, time: d.timeLimit, resPenalty: riftTormentTier(g) * 5, guardian: gd, d,
      shards: 2 + Math.ceil(g / 4), items: Math.min(8, 2 + Math.floor(g / 15)), best: this.R.best, unlocked: this.R.unlocked,
    };
  }

  // ---------------- 裂け目
  begin(g) {
    if (!this.available()) return { ok: false, msg: '物語の最後（深淵王）を倒すと開く' };
    const R = this.R;
    g = Math.max(1, Math.min(R.unlocked || 1, Math.floor(g)));
    const w = this.w;
    const ws = this.ws;
    // 進行中の物は終わらせる
    if (w.mode === 'rift' && R.run) this.endRun(false, { silent: true, keepMode: true });
    if (w.mode === 'gate') this.endGate(false, { silent: true });
    const d = riftDifficulty(g);
    const seed = hashStr(`rift:${g}`);
    const actA = seed % ACTS.length; const actB = (seed >>> 5) % ACTS.length;
    const prev = R.lastReturn || { zone: w.zone, stage: w.stage, torment: w.torment || 0 };
    R.run = {
      level: g, seed, limit: d.timeLimit, timeLeft: d.timeLimit, progress: 0, need: RIFT.need, phase: 'run', deaths: 0, kills: 0, pack: 0,
      acts: [actA, actB], returnZone: prev.zone, returnStage: prev.stage, returnTorment: prev.torment, startedAt: Math.round(this.st.playTime),
    };
    R.lastReturn = null;
    R.level = g;
    w.mode = 'rift';
    w.zone = ACTS[actA].zones[2]?.id || w.zone; // 背景をその章にする
    w.torment = riftTormentTier(g);
    this.game.onStatsChanged();
    ws.startStage();
    this.game.events.emit('riftStart', { level: g });
    return { ok: true };
  }

  abandon() {
    if (this.w.mode === 'rift' && this.R.run) { this.endRun(false, { abandoned: true }); return true; }
    if (this.w.mode === 'gate') { this.endGate(false, { abandoned: true }); return true; }
    return false;
  }

  /** 移動などで裂け目を抜ける（報酬なし・記録なし）。場所は呼んだ側が決める */
  abortRun() {
    const R = this.R;
    const run = R.run;
    if (!run) return;
    R.run = null; R.lastReturn = null;
    this.ws.bossUnit = null;
    this.w.mode = 'campaign';
    this.w.torment = Math.min(this.w.maxTorment || 0, run.returnTorment || 0);
    this.game.onStatsChanged();
  }

  setAuto(mode) { this.R.auto = ['off', 'same', 'push'].includes(mode) ? mode : 'off'; }

  pool(run) {
    const ids = new Set();
    for (const ai of run.acts) for (const z of ACTS[ai].zones) for (const m of z.monsters) if (MONSTER[m] && !MONSTER[m].kind) ids.add(m);
    return [...ids];
  }

  /** 決まった種から次の群れを作る */
  spawnPack() {
    const run = this.R.run;
    const c = this.game.combat;
    const h = c.hero;
    const d = riftDifficulty(run.level);
    const rng = new RNG((run.seed + run.pack * 7919) >>> 0);
    run.pack++;
    const pool = this.pool(run);
    const L = d.level;
    const affN = Math.min(4, 1 + Math.floor(run.level / 10));
    const r = rng.next();
    const list = [];
    if (r < 0.12) {
      const id = rng.pick(pool); const aff = pickAffixes(rng, affN, L);
      for (let i = 0; i < 3; i++) list.push({ id, rank: 'champion', elite: aff });
    } else if (r < 0.2) {
      const id = rng.pick(pool);
      list.push({ id, rank: 'rare', elite: pickAffixes(rng, Math.min(4, affN + 1), L) });
      for (let i = 0; i < 4; i++) list.push({ id: rng.pick(pool) });
    } else {
      const n = rng.int(4, 7);
      const main = rng.pick(pool);
      for (let i = 0; i < n; i++) list.push({ id: rng.chance(0.5) ? main : rng.pick(pool) });
    }
    let x = h.x + 640 + rng.range(0, 120);
    for (const e of list) {
      c.spawnMonster(e.id, { level: L, rank: e.rank || 'normal', elite: e.elite, x, y: rng.range(-36, 36), lifeMul: d.life, dmgMul: d.dmg });
      x += rng.range(30, 60);
    }
  }

  modeStart(ws) {
    const run = this.R.run;
    if (!run) { this.toCampaign(); return; }
    this.spawnCd = 0.4; this.deadT = 0;
    ws.banner = { text: `深淵の裂け目　段階 ${run.level}`, t: 2.6, boss: true };
    if (run.phase === 'guardian') this.spawnGuardian(true);
    if (run.phase === 'done') { this.endT = 0.5; }
  }

  spawnGuardian(resume = false) {
    const run = this.R.run;
    const c = this.game.combat;
    const ws = this.ws;
    const d = riftDifficulty(run.level);
    const gd = guardianFor(run.level);
    if (!resume) c.clearEnemies();
    run.phase = 'guardian';
    const u = c.spawnMonster(gd.id, { level: d.level, rank: 'guardian', x: c.hero.x + 560, y: 0, lifeMul: d.life, dmgMul: d.dmg });
    ws.bossUnit = u;
    ws.bossTimer = run.timeLeft;
    ws.banner = { text: `守護者「${gd.name}」が現れた`, t: 3, boss: true, intro: true, sub: gd.desc };
    c.emit({ t: 'bossIntro', unit: u, name: gd.name, title: '裂け目の守護者', guardian: true, desc: gd.desc });
    c.emit({ t: 'riftGuardian', unit: u, level: run.level });
    this.game.events.emit('riftGuardian', { level: run.level, unit: u });
  }

  modeTick(ws, dt) {
    const run = this.R.run;
    const c = this.game.combat;
    const h = c.hero;
    if (!run) { this.toCampaign(); return; }
    if (run.phase === 'done') {
      this.endT -= dt;
      if (this.endT <= 0) this.afterRun();
      return;
    }
    run.timeLeft -= dt;
    if (ws.bossUnit) ws.bossTimer = run.timeLeft;
    if (run.timeLeft <= 0) { this.endRun(false); return; }
    if (h.dead) {
      this.deadT += dt;
      if (this.deadT >= RIFT.respawn) { this.deadT = 0; c.reviveHero(); }
      return;
    }
    if (ws.transition > 0) { ws.transition -= dt; return; }
    if (run.phase === 'run') {
      this.spawnCd -= dt;
      const alive = c.enemyCount();
      const cap = Math.min(13, RIFT.maxAliveBase + Math.floor(run.level / 15));
      if (this.spawnCd <= 0 && alive < cap) { this.spawnPack(); this.spawnCd = alive < 3 ? 0.3 : 1.2; }
    } else if (run.phase === 'guardian') {
      if (!ws.bossUnit || ws.bossUnit.dead) { this.endRun(true); }
    }
  }

  modeKill(ws, u) {
    const run = this.R.run;
    if (!run || run.phase !== 'run') return;
    run.kills++;
    const v = u.isAdd ? RIFT.value.add : (RIFT.value[u.rank] ?? 1);
    const before = run.progress;
    run.progress = Math.min(run.need, run.progress + v);
    if (u.rank !== 'normal' && !u.isAdd) this.game.combat.emit({ t: 'riftOrb', x: u.x, y: u.y, v });
    if (before < run.need && run.progress >= run.need) this.spawnGuardian();
  }

  modeDeath(ws) {
    const run = this.R.run;
    this.deadT = 0;
    this.st.meta.stats.deaths++;
    if (!run) return;
    const pen = run.deaths === 0 ? RIFT.deathPenalty[0] : RIFT.deathPenalty[1];
    run.deaths++;
    run.timeLeft -= pen;
    ws.banner = { text: `倒れた…　残り時間 -${pen} 秒`, t: 2.5, bad: true };
  }

  /** 終わり（成功・失敗・やめた） */
  endRun(ok, { abandoned = false, silent = false, keepMode = false } = {}) {
    const R = this.R;
    const run = R.run;
    if (!run) return;
    const g = run.level;
    const ws = this.ws;
    const ratio = Math.max(0, run.timeLeft / run.limit);
    let rewards = null;
    if (ok) {
      rewards = this.grantRift(g, ratio);
      let open = RIFT.extraOpen;
      for (const [r, n] of RIFT.skip) if (ratio >= r) { open += n; break; }
      R.unlocked = Math.max(R.unlocked || 1, g + open);
      R.best = Math.max(R.best || 0, g);
      R.clears = (R.clears || 0) + 1;
      const tm = Math.round(run.limit - run.timeLeft);
      if (!R.bestTime[g] || tm < R.bestTime[g]) R.bestTime[g] = tm;
      rewards.open = open;
      try { this.game.sys.gems?.onRiftComplete?.(g, ratio); } catch (e) { console.error('[rift:gems]', e); }
      ws.banner = { text: `裂け目を踏破！　段階 ${g}　残り ${fmtClock(run.timeLeft)}${open > 1 ? `　段階 ${g + open} まで開いた` : ''}`, t: RIFT.doneDelay, good: true };
      this.game.events.emit('riftComplete', { level: g, ratio, rewards, open });
    } else if (!silent) {
      if (!abandoned) {
        const sh = 1;
        this.st.inv.mats.shard = (this.st.inv.mats.shard || 0) + sh;
        rewards = { shards: sh };
      }
      ws.banner = { text: abandoned ? '裂け目から戻った' : `時間切れ…　段階 ${g}（進行 ${Math.floor((run.progress / run.need) * 100)}%）`, t: RIFT.doneDelay, bad: !abandoned };
      this.game.events.emit('riftFail', { level: g, abandoned, progress: run.progress / run.need });
    }
    R.runs = (R.runs || 0) + (silent && !ok ? 0 : 1);
    if (!silent || ok) {
      R.history.unshift({ lv: g, ok, abandoned: abandoned || undefined, time: Math.round(run.limit - Math.max(0, run.timeLeft)), deaths: run.deaths, kills: run.kills, at: Date.now(), shards: rewards?.shards || 0, items: rewards?.items || 0 });
      if (R.history.length > 30) R.history.length = 30;
    }
    run.phase = 'done';
    run.ok = ok;
    run.abandoned = abandoned;
    ws.bossUnit = null;
    this.game.combat.clearEnemies();
    if (keepMode) { R.lastReturn = { zone: run.returnZone, stage: run.returnStage, torment: run.returnTorment }; R.run = null; return; }
    if (abandoned) { this.toCampaign(); return; }
    this.endT = RIFT.doneDelay;
  }

  /** 終わったあと: 自動で続けるか、物語に戻る */
  afterRun() {
    const R = this.R;
    const run = R.run;
    const auto = R.auto || 'off';
    if (run && auto !== 'off' && !run.abandoned) {
      const next = auto === 'same' ? run.level : run.ok ? R.unlocked : Math.max(1, run.level - 1);
      R.lastReturn = { zone: run.returnZone, stage: run.returnStage, torment: run.returnTorment };
      R.run = null;
      this.begin(next);
      return;
    }
    this.toCampaign();
  }

  toCampaign() {
    const w = this.w;
    const R = this.R;
    const run = R.run;
    const back = run ? { zone: run.returnZone, stage: run.returnStage, torment: run.returnTorment } : R.lastReturn;
    R.run = null; R.lastReturn = null;
    w.mode = 'campaign';
    if (back?.zone && ZONE[back.zone]) { w.zone = back.zone; w.stage = Math.max(1, Math.min(STAGES_PER_ZONE - 1, back.stage || 1)); }
    w.torment = Math.min(w.maxTorment || 0, back?.torment ?? w.torment ?? 0);
    this.ws.bossUnit = null;
    this.game.onStatsChanged();
    this.ws.startStage();
  }

  grantRift(g, ratio) {
    const game = this.game;
    const st = this.st;
    const d = riftDifficulty(g);
    const L = d.level;
    const shards = 2 + Math.ceil(g / 4) + (ratio >= 0.5 ? 1 : 0);
    st.inv.mats.shard = (st.inv.mats.shard || 0) + shards;
    const gold = BAL.monsterGold(L) * 120 * (1 + ratio) * d.gold;
    game.addGold(gold);
    game.addXp(BAL.monsterXp(L) * 100 * d.xp);
    const n = Math.min(8, 2 + Math.floor(g / 15));
    const items = this.giveItems(n, { ilvl: L, mf: 150 + 4 * g, rank: 'guardian', minRarity: 'rare', forced: 1, forcedRarity: 'legendary', ancient: d.ancient, primal: d.primal });
    game.events.emit('invChanged', {});
    return { shards, gold, items: items.length };
  }

  giveItems(n, o) {
    const game = this.game;
    const st = this.st;
    const H = game.H || {};
    const out = [];
    const c = game.combat;
    for (let i = 0; i < n; i++) {
      const it = generateItem(game.rng, {
        ilvl: o.ilvl, cls: st.hero.cls, mf: (H.mf || 0) + (o.mf || 0), rank: o.rank || 'guardian', torment: st.world.torment,
        minRarity: o.minRarity || null, rarity: i < (o.forced || 0) ? o.forcedRarity : undefined, ancientChance: o.ancient ?? 0.1, primalChance: o.primal || 0,
      });
      if (!it) continue;
      out.push(it);
      const where = game.sys.inv.receive(it);
      if (c.hero) c.emit({ t: 'loot', x: c.hero.x + 120 + game.rng.range(-60, 60), y: 0, item: it, where });
      game.events.emit('loot', { item: it, where, unit: null, source: o.source || 'rift' });
    }
    return out;
  }

  // ---------------- 門番
  gateStatus() {
    const f = this.w.gate.frags;
    return GATE_GROUPS.map((g, gi) => ({
      gi, group: g, keeper: MONSTER[g.keeper], have: [0, 1, 2, 3].map((k) => f[`${g.id}_${k}`] || 0), kills: this.w.gate.kills[gi] || 0, ready: this.canSummon(gi),
    }));
  }

  canSummon(gi) {
    const g = GATE_GROUPS[gi];
    if (!g || (this.w.maxTorment || 0) < 1) return false;
    const f = this.w.gate.frags;
    return [0, 1, 2, 3].every((k) => (f[`${g.id}_${k}`] || 0) >= 1);
  }

  gateTier() { return Math.max(1, this.w.torment || 0); }

  gateSpec(gi, tier = this.gateTier()) {
    const g = GATE_GROUPS[gi];
    const def = MONSTER[g.keeper];
    const level = BAL.torment(tier).level + GATE.levelAdd + gi * 2;
    const sc = BAL.monsterScale(level);
    const lifeMul = BAL.torment(tier).life * sc.life;
    const dmgMul = BAL.torment(tier).dmg * sc.dmg;
    const life = BAL.monsterLife(level) * (def.life || 1) * BAL.RANK.guardian.life * lifeMul;
    const dmg = BAL.monsterDmg(level) * (def.dmg || 1) * BAL.RANK.guardian.dmg * dmgMul;
    return { def, level, life, dmg, atkCd: def.atkCd || 1.8, time: GATE.time, el: def.element || 'phys', lifeMul, dmgMul, tier };
  }

  gateOdds(gi) { return this.fightOdds(this.gateSpec(gi)); }

  /**
   * 100 戦の見積もり（火力 ±15%・受けるダメージ ±25% のばらつき）。spec: { life, dmg, atkCd, time, level, el }
   * 戻り値: { win（0〜1）, dps, need, ttk, ttd }
   */
  fightOdds(spec) {
    const game = this.game;
    const H = game.H;
    if (!H) return { win: 0, dps: 0, need: spec.life / spec.time, ttk: Infinity, ttd: 0 };
    const ws = this.ws;
    const dps = Math.max(1, ws.estDpsRaw() * Math.max(0.25, Math.min(1.6, this.w.dpsK ?? 1)));
    const ehp = character.effectiveLife(H, spec.level);
    const mitig = ehp / Math.max(1, H.life);
    const incoming = (spec.dmg * 1.5) / Math.max(0.5, spec.atkCd);
    const regen = (H.lifeRegen || 0) * mitig;
    const rng = new RNG(hashStr(`odds:${Math.round(spec.life)}:${Math.round(dps)}`));
    let wins = 0;
    for (let i = 0; i < 100; i++) {
      const d = dps * Math.max(0.4, 1 + rng.gauss() * 0.15);
      const inc = incoming * Math.max(0.3, 1 + rng.gauss() * 0.25);
      const ttk = spec.life / d;
      const net = inc - regen;
      const ttd = net <= 0 ? Infinity : ehp / net;
      if (ttk <= spec.time && ttk < ttd) wins++;
    }
    const net = incoming - regen;
    return { win: wins / 100, dps, need: spec.life / spec.time, ttk: spec.life / dps, ttd: net <= 0 ? Infinity : ehp / net };
  }

  summonGate(gi) {
    if (!this.canSummon(gi)) return { ok: false, msg: '欠片が 4 種そろっていない' };
    const w = this.w;
    const g = GATE_GROUPS[gi];
    if (w.mode === 'rift' && this.R.run) this.endRun(false, { abandoned: true });
    for (let k = 0; k < 4; k++) w.gate.frags[`${g.id}_${k}`]--;
    const spec = this.gateSpec(gi);
    w.gate.tries = (w.gate.tries || 0) + 1;
    w.gate.run = { gi, tier: spec.tier, timeLeft: GATE.time, returnZone: w.zone, returnStage: w.stage, returnTorment: w.torment || 0, phase: 'fight' };
    w.mode = 'gate';
    // 背景はその組の 2 つ目の章
    const act = ACTS.find((a) => a.id === g.acts[1]);
    if (act) w.zone = act.zones[4].id;
    w.torment = spec.tier;
    this.game.onStatsChanged();
    this.ws.startStage();
    this.game.events.emit('gateStart', { gi });
    return { ok: true };
  }

  gateStart(ws) {
    const run = this.w.gate.run;
    if (!run) { this.toCampaignFromGate(); return; }
    const c = this.game.combat;
    const spec = this.gateSpec(run.gi, run.tier);
    const u = c.spawnMonster(spec.def.id, { level: spec.level, rank: 'guardian', x: c.hero.x + 600, y: 0, lifeMul: spec.lifeMul, dmgMul: spec.dmgMul });
    ws.bossUnit = u;
    ws.bossTimer = run.timeLeft;
    ws.banner = { text: `― 門番 ―　${spec.def.name}`, t: 3.6, boss: true, intro: true, sub: spec.def.desc };
    c.emit({ t: 'bossIntro', unit: u, name: spec.def.name, title: '門番', gatekeeper: true, desc: spec.def.desc });
    this.endT = 0;
  }

  gateTick(ws, dt) {
    const run = this.w.gate.run;
    const c = this.game.combat;
    if (!run) { this.toCampaignFromGate(); return; }
    if (run.phase === 'done') { this.endT -= dt; if (this.endT <= 0) this.toCampaignFromGate(); return; }
    if (ws.transition > 0) { ws.transition -= dt; return; }
    run.timeLeft -= dt;
    ws.bossTimer = run.timeLeft;
    if (ws.bossUnit?.dead) { this.endGate(true); return; }
    if (c.hero.dead) { this.endGate(false, { reason: '力尽きた' }); return; }
    if (run.timeLeft <= 0) this.endGate(false, { reason: '時間切れ' });
  }

  endGate(ok, { abandoned = false, silent = false, reason = '' } = {}) {
    const w = this.w;
    const run = w.gate.run;
    if (!run) return;
    const g = GATE_GROUPS[run.gi];
    const ws = this.ws;
    const res = { gi: run.gi, ok, at: Date.now(), tier: run.tier };
    if (ok) {
      const first = !(w.gate.kills[run.gi] > 0);
      w.gate.kills[run.gi] = (w.gate.kills[run.gi] || 0) + 1;
      w.gate.wins = (w.gate.wins || 0) + 1;
      const spec = this.gateSpec(run.gi, run.tier);
      const mythicChance = Math.min(GATE.mythicCap, GATE.mythicBase + GATE.mythicPerTier * run.tier + run.gi * 0.005);
      const mythic = this.game.rng.chance(mythicChance);
      const items = this.giveItems(mythic ? 1 : 0, { ilvl: spec.level, mf: 300, rank: 'guardian', forced: 1, forcedRarity: 'mythic', source: 'gate' });
      items.push(...this.giveItems(5, { ilvl: spec.level, mf: 250, rank: 'guardian', minRarity: 'rare', forced: 2, forcedRarity: 'legendary', ancient: 0.2, primal: 0.005 * run.tier, source: 'gate' }));
      const shards = 5 + run.tier;
      this.st.inv.mats.shard = (this.st.inv.mats.shard || 0) + shards;
      this.game.addGold(BAL.monsterGold(spec.level) * 200);
      // 次の門の欠片（必ず 1 つ）
      const ng = GATE_GROUPS[Math.min(GATE_GROUPS.length - 1, run.gi + 1)];
      const nk = this.game.rng.int(0, 3);
      w.gate.frags[`${ng.id}_${nk}`] = (w.gate.frags[`${ng.id}_${nk}`] || 0) + 1;
      Object.assign(res, { mythic, items: items.length, shards, next: `${ng.frags[nk]}`, first });
      if (first) this.game.onStatsChanged();
      ws.banner = { text: `門番を討った！${mythic ? '　ミシック！' : ''}　${ng.frags[nk]}を手に入れた`, t: 4.5, good: true };
    } else if (!silent) {
      if (!abandoned) {
        const kinds = [0, 1, 2, 3];
        this.game.rng.shuffle(kinds);
        const back = kinds.slice(0, GATE.refund);
        for (const k of back) w.gate.frags[`${g.id}_${k}`] = (w.gate.frags[`${g.id}_${k}`] || 0) + 1;
        res.refund = back.map((k) => g.frags[k]);
        ws.banner = { text: `門番に敗れた（${reason}）　欠片を ${GATE.refund} つ取り戻した`, t: 4, bad: true };
      } else {
        for (let k = 0; k < 4; k++) w.gate.frags[`${g.id}_${k}`] = (w.gate.frags[`${g.id}_${k}`] || 0) + 1;
        res.refund = g.frags.slice();
      }
    }
    if (!silent) { w.gate.history.unshift(res); if (w.gate.history.length > 20) w.gate.history.length = 20; }
    this.game.events.emit('gateResult', res);
    run.phase = 'done';
    ws.bossUnit = null;
    this.game.combat.clearEnemies();
    if (abandoned || silent) { this.toCampaignFromGate(); return; }
    this.endT = 3.5;
  }

  toCampaignFromGate() {
    const w = this.w;
    const run = w.gate.run;
    w.gate.run = null;
    w.mode = 'campaign';
    if (run?.returnZone && ZONE[run.returnZone]) { w.zone = run.returnZone; w.stage = Math.max(1, Math.min(STAGES_PER_ZONE - 1, run.returnStage || 1)); }
    w.torment = Math.min(w.maxTorment || 0, run?.returnTorment ?? w.torment ?? 0);
    this.ws.bossUnit = null;
    this.game.onStatsChanged();
    this.ws.startStage();
  }
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ---------------- モードの登録
worldHooks.modes.rift = {
  start: (ws) => ws.game.sys.rift.modeStart(ws),
  tick: (ws, dt) => ws.game.sys.rift.modeTick(ws, dt),
  onKill: (ws, u) => ws.game.sys.rift.modeKill(ws, u),
  onHeroDeath: (ws) => ws.game.sys.rift.modeDeath(ws),
  level: (ws) => riftDifficulty(ws.w.rift.run?.level || 1).level,
  difficulty: (ws) => riftDifficulty(ws.w.rift.run?.level || 1),
  label: (ws) => `深淵の裂け目　段階 ${ws.w.rift.run?.level || ''}`,
  abort: (ws) => ws.game.sys.rift.abortRun(),
};

worldHooks.modes.gate = {
  start: (ws) => ws.game.sys.rift.gateStart(ws),
  tick: (ws, dt) => ws.game.sys.rift.gateTick(ws, dt),
  onKill: () => {},
  onHeroDeath: (ws) => { ws.game.state.meta.stats.deaths++; },
  level: (ws) => { const r = ws.w.gate.run; return r ? ws.game.sys.rift.gateSpec(r.gi, r.tier).level : 100; },
  difficulty: (ws) => { const r = ws.w.gate.run; const t = BAL.torment(r?.tier || 1); const sc = BAL.monsterScale(100); return { ...t, life: t.life * sc.life, dmg: t.dmg * sc.dmg }; },
  label: (ws) => { const r = ws.w.gate.run; return r ? `門番　${MONSTER[GATE_GROUPS[r.gi].keeper]?.name}` : '門番'; },
  abort: (ws) => ws.game.sys.rift.endGate(false, { abandoned: true }),
};

// 門番の証（初めて倒した門番 1 体につき 全ダメージ +4%・ライフ +4%）
registry.addHeroSource('gatekeepers', (state) => {
  const k = state.world?.gate?.kills;
  if (!k) return [];
  const n = Object.values(k).filter((v) => v > 0).length;
  if (!n) return [];
  return [{ s: 'inc_dmg', v: GATE.badge.dmg * n }, { s: 'inc_life', v: GATE.badge.life * n }];
});

export { roman };
