// 転生（魂を得てやり直す・魂の祭壇で永続強化・自動化の解放）と超越（星晶）。担当: メタ担当。
//
// 外から:
//   game.sys.prestige.isUnlocked() / previewSouls() / nextSoulLevel() / soulsPerHour() / canRebirth() → { ok, reason }
//   game.sys.prestige.rebirth() → { ok, souls } / warpTarget() → 地域の通し番号
//   game.sys.prestige.cost(id) / canBuy(id) / buy(id, n) / level(id) / effect(key)
//   game.sys.prestige.starsPreview() / canTranscend() / transcend() / buyStar(id)
//   game.sys.prestige.setToggle(key, on) / setSalvagePreset(id) / setAutoRebirth(on, souls)
// 状態: state.meta.souls / totalSouls / rebirths / upgrades（祭壇 { id: Lv }）/ prestige（下の ensureState）
// 解放の旗（他の担当が読む）: state.meta.unlocks.{ speed, extraSkillSlot, offlineHours, offlineEff, bagBonus, autoSkill, autoBoss,
//   autoSalvage, autoHatch, autoBounty, autoTorment, autoRebirth, prestige, transcend }
// 出来事: 'prestigeUnlocked' / 'rebirth' { souls, total, count } / 'transcend' { stars } / 'altarBuy' { id, lvl } / 'automationUnlocked' { id } / 'metaChanged'

import { ZONES, STAGES_PER_ZONE } from '../../data/world.js';
import { PRESTIGE, ALTAR, ALTAR_BY_ID, STAR_UPGRADES, STAR_BY_ID, baseSouls, levelForSouls, starsFor, altarCost, starCost } from '../../data/prestige.js';

const SALVAGE_PRESETS = {
  auto: null, // レベルで決める
  common: ['common'],
  magic: ['common', 'magic'],
  rare: ['common', 'magic', 'rare'],
  epic: ['common', 'magic', 'rare', 'epic'],
};
export const SALVAGE_PRESET_NAMES = { auto: 'レベルに合わせる', common: 'ノーマルだけ', magic: 'マジックまで', rare: 'レアまで', epic: 'エピックまで' };

function blankLife(state) {
  return { start: state.playTime || 0, maxLevel: 0, kills0: state.meta.stats.kills || 0, gold0: state.meta.stats.goldEarned || 0, bosses0: state.meta.stats.bosses || 0, gate: false };
}

export class PrestigeSystem {
  constructor(game) {
    this.game = game;
    this.id = 'prestige';
    this.ver = 0;
    this.cache = null;
    this.t = 0; this.t2 = 0; this.t5 = 0;
    game.events.on('zoneClear', (e) => this.onZoneClear(e));
  }

  get state() { return this.game.state; }
  get meta() { return this.game.state.meta; }
  get p() { return this.game.state.meta.prestige; }

  ensureState(st) {
    const m = st.meta;
    m.souls ??= 0; m.totalSouls ??= 0; m.rebirths ??= 0;
    if (!m.upgrades || typeof m.upgrades !== 'object') m.upgrades = {};
    m.unlocks ||= {};
    const p = (m.prestige ||= {});
    p.unlocked ??= false;
    p.bestZone ??= 0;
    p.soulsSinceTrans ??= 0;
    p.stars ??= 0;
    p.totalStars ??= 0;
    p.transcends ??= 0;
    p.starUps ||= {};
    p.history ||= [];
    p.toggles ||= {};
    p.salvagePreset ||= 'auto';
    p.autoAt ??= 50;
    p.bagApplied ??= 0;
    p.life ||= blankLife(st);
    // 古いセーブ: 第五章のボスを倒していれば解放
    const z = ZONES[PRESTIGE.UNLOCK_ZONE];
    if (z && st.world?.cleared?.[z.id]) p.unlocked = true;
    if (m.rebirths > 0) p.unlocked = true;
    this.ver++;
  }

  onLoad() { this.applyUnlocks(true); }
  onNewGame() { this.applyUnlocks(true); }

  // ---------------- 祭壇・星晶の値
  level(id) { return Math.max(0, Math.floor(this.meta.upgrades[id] || 0)); }
  starLevel(id) { return Math.max(0, Math.floor(this.p?.starUps?.[id] || 0)); }

  /** 能力以外の効果の合計（祭壇＋星晶）。key: soulMul eggMul bountyMul keepGold achMul offlineHours offlineEff warp bagBonus speed extraSkillSlot altarDiscount petMul */
  effect(key) {
    let v = 0;
    for (const u of ALTAR) if (u.effect?.key === key) v += u.effect.per * this.level(u.id);
    for (const u of STAR_UPGRADES) if (u.effect?.key === key) v += u.effect.per * this.starLevel(u.id);
    return v;
  }

  soulMul() { return 1 + this.effect('soulMul') / 100; }

  // ---------------- 転生
  isUnlocked() { return !!this.p?.unlocked; }

  lifeSec() { return Math.max(0, (this.state.playTime || 0) - (this.p.life.start || 0)); }

  previewSouls() {
    if (!this.isUnlocked()) return 0;
    return Math.floor(baseSouls(this.p.life.maxLevel) * this.soulMul());
  }

  /** 次の 1 点に必要なエリア Lv */
  nextSoulLevel() {
    const cur = this.previewSouls();
    let lvl = levelForSouls(cur + 1, this.soulMul());
    // 丸めのずれを直す
    for (let i = 0; i < 50 && Math.floor(baseSouls(lvl) * this.soulMul()) <= cur; i++) lvl++;
    return lvl;
  }

  soulsPerHour() {
    const sec = this.lifeSec();
    if (sec < 60) return 0;
    return this.previewSouls() / (sec / 3600);
  }

  canRebirth() {
    if (!this.isUnlocked()) return { ok: false, reason: '第五章のボスを倒すと解放されます' };
    const s = this.previewSouls();
    if (s < 1) return { ok: false, reason: `エリア Lv ${PRESTIGE.SOUL_BASE_LEVEL + 1} 以上に着くと魂が得られます` };
    if (this.meta.rebirths > 0 && this.lifeSec() < PRESTIGE.MIN_LIFE_SEC) return { ok: false, reason: `この周回をあと ${Math.ceil((PRESTIGE.MIN_LIFE_SEC - this.lifeSec()) / 60)} 分遊ぶと転生できます` };
    return { ok: true, reason: '' };
  }

  warpPct() {
    const altar = Math.min(PRESTIGE.WARP_ALTAR_MAX, PRESTIGE.WARP_BASE + this.levelEffectOnly('warp', ALTAR) / 100);
    const star = this.levelEffectOnly('warp', STAR_UPGRADES) / 100;
    return Math.min(PRESTIGE.WARP_STAR_MAX, altar + star);
  }

  levelEffectOnly(key, list) {
    let v = 0;
    for (const u of list) if (u.effect?.key === key) v += u.effect.per * (list === ALTAR ? this.level(u.id) : this.starLevel(u.id));
    return v;
  }

  /** 転生の直後に飛ぶ地域（通し番号） */
  warpTarget() {
    const best = Math.max(this.p.bestZone || 0, this.state.world.maxZone || 0);
    return Math.max(0, Math.min(ZONES.length - 1, Math.floor(best * this.warpPct())));
  }

  rebirth({ auto = false } = {}) {
    const chk = this.canRebirth();
    if (!chk.ok) return { ok: false, msg: chk.reason };
    const m = this.meta; const p = this.p; const st = this.state;
    const gain = this.previewSouls();
    const dur = this.lifeSec();
    m.souls += gain; m.totalSouls += gain; p.soulsSinceTrans += gain;
    m.rebirths++;
    p.history.unshift({ at: Date.now(), souls: gain, level: p.life.maxLevel, zone: Math.max(st.world.maxZone || 0), dur, auto: !!auto });
    if (p.history.length > PRESTIGE.HISTORY) p.history.length = PRESTIGE.HISTORY;
    if (dur < 1800) { m.record ||= {}; m.record.fastRebirth = 1; }
    this.resetLife();
    this.game.events.emit('rebirth', { souls: gain, total: m.souls, count: m.rebirths, auto });
    this.game.events.emit('metaChanged', { kind: 'prestige' });
    return { ok: true, souls: gain };
  }

  /** 物語の進み・お金・この周回の数え上げを戻して、前回の最高の地域の何割かへ飛ぶ */
  resetLife() {
    const st = this.state; const m = this.meta; const p = this.p; const w = st.world;
    p.bestZone = Math.max(p.bestZone || 0, w.maxZone || 0);
    const target = this.warpTarget();
    const keep = Math.min(0.5, this.effect('keepGold') / 100);
    m.gold = Math.floor((m.gold || 0) * keep);
    w.mode = 'campaign';
    w.torment = 0;
    w.autoAdvance = true;
    w.maxZone = target;
    w.cleared = {};
    w.maxStage = {};
    for (const z of ZONES) {
      if (z.global < target) { w.cleared[z.id] = true; w.maxStage[z.id] = STAGES_PER_ZONE; }
    }
    const tz = ZONES[target] || ZONES[0];
    w.zone = tz.id; w.stage = 1; w.maxStage[tz.id] = 1;
    p.life = blankLife(st);
    this.ver++;
    this.applyUnlocks();
    const g = this.game;
    if (g.started) {
      g.combat.clearEnemies();
      g.sys.world.startStage();
    }
    g.onStatsChanged();
    g.events.emit('goldChanged', {});
  }

  onZoneClear(e) {
    if (!this.game.state) return;
    const p = this.p;
    if (!p) return;
    if (e?.zone?.global === PRESTIGE.UNLOCK_ZONE) {
      p.life.gate = true;
      if (!p.unlocked) {
        p.unlocked = true;
        this.applyUnlocks();
        this.game.events.emit('prestigeUnlocked', {});
        this.game.events.emit('metaChanged', { kind: 'prestige' });
      }
    }
  }

  // ---------------- 祭壇
  discount() { return this.effect('altarDiscount') / 100; }
  cost(id) { const u = ALTAR_BY_ID[id]; return u ? altarCost(u, this.level(id), this.discount()) : Infinity; }
  maxed(id) { const u = ALTAR_BY_ID[id]; return !!u && u.max > 0 && this.level(id) >= u.max; }
  reqProblem(id) {
    const u = ALTAR_BY_ID[id];
    if (!u) return 'ない強化';
    if (u.req?.rebirths && this.meta.rebirths < u.req.rebirths) return `転生 ${u.req.rebirths} 回で解放`;
    return null;
  }
  canBuy(id) { return !this.maxed(id) && !this.reqProblem(id) && this.meta.souls >= this.cost(id); }

  /** n 回まで買う（n = Infinity で買えるだけ）。戻り値: 買えた回数 */
  buy(id, n = 1) {
    const u = ALTAR_BY_ID[id];
    if (!u) return 0;
    let k = 0;
    while (k < n && this.canBuy(id)) {
      this.meta.souls -= this.cost(id);
      this.meta.upgrades[id] = this.level(id) + 1;
      k++;
    }
    if (k) {
      this.ver++;
      const wasLocked = u.unlock && this.level(id) === k;
      this.applyUnlocks();
      this.game.onStatsChanged();
      this.game.events.emit('altarBuy', { id, lvl: this.level(id), n: k });
      if (wasLocked) this.game.events.emit('automationUnlocked', { id, name: u.name });
      this.game.events.emit('metaChanged', { kind: 'prestige' });
    }
    return k;
  }

  /** 買える強化の数（印の表示用） */
  affordableCount() {
    let n = 0;
    for (const u of ALTAR) if (this.canBuy(u.id)) n++;
    return n;
  }

  altarTotalLevel() { let s = 0; for (const u of ALTAR) s += this.level(u.id); return s; }

  // ---------------- 超越
  transcendUnlocked() { return this.meta.rebirths >= PRESTIGE.TRANSCEND_REBIRTHS || this.p.transcends > 0; }
  starsPreview() {
    const pending = this.canRebirth().ok ? this.previewSouls() : 0;
    return starsFor((this.p.soulsSinceTrans || 0) + pending);
  }
  canTranscend() {
    if (!this.transcendUnlocked()) return { ok: false, reason: `転生 ${PRESTIGE.TRANSCEND_REBIRTHS} 回で解放（いま ${this.meta.rebirths} 回）` };
    if (this.starsPreview() < 1) return { ok: false, reason: '星晶が 1 つ以上になるまで魂を集めよう' };
    return { ok: true, reason: '' };
  }
  transcend() {
    const chk = this.canTranscend();
    if (!chk.ok) return { ok: false, msg: chk.reason };
    const p = this.p; const m = this.meta;
    const stars = this.starsPreview();
    p.stars += stars; p.totalStars += stars; p.transcends++;
    m.souls = 0;
    p.soulsSinceTrans = 0;
    for (const u of ALTAR) if (!u.keep) delete m.upgrades[u.id];
    p.history.unshift({ at: Date.now(), stars, transcend: true, level: p.life.maxLevel, zone: this.state.world.maxZone, dur: this.lifeSec() });
    if (p.history.length > PRESTIGE.HISTORY) p.history.length = PRESTIGE.HISTORY;
    this.resetLife();
    this.game.events.emit('transcend', { stars, total: p.stars, count: p.transcends });
    this.game.events.emit('metaChanged', { kind: 'prestige' });
    return { ok: true, stars };
  }
  starCost(id) { const u = STAR_BY_ID[id]; return u ? starCost(u, this.starLevel(id)) : Infinity; }
  canBuyStar(id) { const u = STAR_BY_ID[id]; return !!u && this.starLevel(id) < u.max && this.p.stars >= this.starCost(id); }
  buyStar(id) {
    if (!this.canBuyStar(id)) return false;
    this.p.stars -= this.starCost(id);
    this.p.starUps[id] = this.starLevel(id) + 1;
    this.ver++;
    this.applyUnlocks();
    this.game.onStatsChanged();
    this.game.events.emit('metaChanged', { kind: 'prestige' });
    return true;
  }

  // ---------------- 自動化・解放の旗
  /** 祭壇の自動化を持っているか（ON/OFF とは別） */
  owns(unlockKey) { const u = ALTAR.find((x) => x.unlock === unlockKey); return !!u && this.level(u.id) > 0; }
  toggleOn(key) { return this.p.toggles[key] !== false; }
  setToggle(key, on) { this.p.toggles[key] = !!on; this.applyUnlocks(); this.game.events.emit('metaChanged', { kind: 'prestige' }); }
  setSalvagePreset(id) { if (id in SALVAGE_PRESETS) { this.p.salvagePreset = id; this.applySalvagePreset(true); this.game.events.emit('metaChanged', { kind: 'prestige' }); } }
  setAutoRebirth(on, souls) {
    if (souls !== undefined) this.p.autoAt = Math.max(1, Math.floor(Number(souls) || 1));
    if (on !== undefined) this.p.toggles.autoRebirth = !!on;
    this.applyUnlocks();
  }

  applyUnlocks(silent = false) {
    const st = this.state;
    if (!st) return;
    const un = st.meta.unlocks;
    un.prestige = this.isUnlocked();
    un.transcend = this.transcendUnlocked();
    un.offlineHours = Math.min(40, this.levelEffectOnly('offlineHours', ALTAR));
    un.offlineEff = Math.min(20, this.levelEffectOnly('offlineEff', ALTAR));
    un.speed = Math.min(2, this.level('idle_speed'));
    un.extraSkillSlot = this.level('idle_slot');
    un.bagBonus = this.effect('bagBonus');
    // バッグの枠は差分だけ足す（商人の拡張と重なってもよいように）
    const d = un.bagBonus - (this.p.bagApplied || 0);
    if (d !== 0 && st.inv) { st.inv.bagSize = Math.max(10, (st.inv.bagSize || 60) + d); this.p.bagApplied = un.bagBonus; }
    for (const u of ALTAR) if (u.unlock) un[u.unlock] = this.level(u.id) > 0 && this.toggleOn(u.unlock);
    if (!silent) this.game.events.emit('unlocksChanged', {});
  }

  applySalvagePreset(force = false) {
    const st = this.state;
    if (!st.meta.unlocks.autoSalvage && !force) return;
    if (!this.owns('autoSalvage')) return;
    let list = SALVAGE_PRESETS[this.p.salvagePreset];
    if (!list) {
      const L = st.hero.level;
      list = L < 15 ? ['common'] : L < 35 ? ['common', 'magic'] : L < 70 ? ['common', 'magic', 'rare'] : ['common', 'magic', 'rare', 'epic'];
    }
    const f = st.inv.filter.autoSalvage;
    let changed = false;
    for (const r of ['common', 'magic', 'rare', 'epic']) {
      const want = list.includes(r);
      if (!!f[r] !== want) { f[r] = want; changed = true; }
    }
    if (changed) this.game.events.emit('invChanged', {});
  }

  /** スキルポイントを自動で振る（並びのスキルを低い順に。余ったら覚えていないスキルを覚える） */
  autoSkills() {
    const g = this.game; const hero = this.state.hero; const sk = g.sys.skills;
    if (!sk || hero.skillPoints <= 0) return 0;
    let n = 0;
    for (let guard = 0; guard < 200 && hero.skillPoints > 0; guard++) {
      const cand = hero.bar.filter((id) => id && sk.canLevel(id)).sort((a, b) => (hero.skills[a]?.lvl || 0) - (hero.skills[b]?.lvl || 0));
      let id = cand[0];
      if (!id) {
        const avail = (sk.available?.() || []).map((s) => s.id).filter((x) => sk.canLevel(x) && hero.bar.length < sk.barSize() && !hero.skills[x]);
        id = avail[0];
      }
      if (!id || !sk.levelUp(id)) break;
      n++;
    }
    try { g.sys.tree?.autoAllocate?.(); } catch (e) { console.error(e); }
    try { if (hero.level >= 100) g.sys.tree?.autoParagon?.(); } catch (e) { console.error(e); }
    return n;
  }

  tick(dt) {
    const st = this.state;
    const p = this.p;
    if (!p) return;
    this.t += dt; this.t2 += dt; this.t5 += dt;
    if (this.t >= 1) {
      this.t = 0;
      const lvl = this.game.sys.world.level();
      if (lvl > p.life.maxLevel) p.life.maxLevel = lvl;
      if ((st.world.maxZone || 0) > p.bestZone) p.bestZone = st.world.maxZone;
    }
    if (this.t2 >= 2) {
      this.t2 = 0;
      if (st.meta.unlocks.autoSkill && st.hero.skillPoints > 0) this.autoSkills();
      if (st.meta.unlocks.autoSalvage) this.applySalvagePreset();
    }
    if (this.t5 >= 5) {
      this.t5 = 0;
      if (st.meta.unlocks.autoRebirth && this.previewSouls() >= p.autoAt && this.canRebirth().ok) this.rebirth({ auto: true });
    }
  }

  // ---------------- 主人公への効果（registry.addHeroSource('prestige')）
  heroMods() {
    if (this.cache && this.cache.ver === this.ver && this.cache.state === this.state) return this.cache.mods;
    const mods = prestigeMods(this.state);
    this.cache = { ver: this.ver, state: this.state, mods };
    return mods;
  }
}

/** 祭壇と星晶の能力（state だけから計算。game が無いときも使える） */
export function prestigeMods(state) {
  const m = state?.meta;
  if (!m) return [];
  const acc = {};
  const add = (s, v) => { if (v) acc[s] = (acc[s] || 0) + v; };
  for (const u of ALTAR) {
    const L = Math.floor(m.upgrades?.[u.id] || 0);
    if (L > 0) for (const md of u.mods || []) add(md.s, md.per * L);
  }
  for (const u of STAR_UPGRADES) {
    const L = Math.floor(m.prestige?.starUps?.[u.id] || 0);
    if (L > 0) for (const md of u.mods || []) add(md.s, md.per * L);
  }
  return Object.entries(acc).map(([s, v]) => ({ s, v, src: 'prestige' }));
}

export { SALVAGE_PRESETS };
