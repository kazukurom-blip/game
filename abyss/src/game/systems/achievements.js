// 実績（215 個・称号・実績ポイントで永続強化）と、記録（一生の数え上げ・スキルごとのダメージ）。担当: メタ担当。
//
// 外から:
//   game.sys.achievements.check() … 今すぐ確かめる（普段は 1 秒ごと）
//   game.sys.achievements.progress(def) → { cur, n, pct, done }
//   game.sys.achievements.points() / unlockedCount() / setTitle(id) / titles() → 選べる称号
//   game.sys.achievements.skillBreakdown(sec) → [{ id, name, dmg, dps, share }]（直近 sec 秒のスキル別ダメージ）
//   game.sys.achievements.markSeen()
// 状態: state.meta.achievements { id: 達成の時刻 }・state.meta.ach { unseen: [] }・state.meta.record（一生の数え上げ）・state.hero.title
// 出来事: 'achievement' { def } / 'titleUnlocked' { title } / 'metaChanged'

import { ACHIEVEMENTS, ACH, POINT_BONUS, TITLES, TITLE } from '../../data/achievements.js';
import { ACTS } from '../../data/world.js';
import { SKILL } from '../../data/skills.js';
import { SLOTS } from '../../data/items.js';

const WINDOW = 60; // スキル別ダメージを覚えておく秒数

/** 数えるのが重い物（10 秒に 1 回だけ見る） */
const SLOW_METRICS = new Set(['species', 'bestiaryTier4', 'treasures', 'altarLv', 'codex', 'runewords', 'gemTier', 'petLevel', 'pets', 'panels', 'zones', 'skillMax', 'maxEnh', 'act']);

/** 数える物ごとのまとまり（段の低い順） */
const GROUPS = (() => {
  const m = new Map();
  for (const d of ACHIEVEMENTS) {
    const key = d.arg !== undefined ? `${d.metric}#${d.arg}` : d.metric;
    if (!m.has(key)) m.set(key, { key, defs: [] });
    m.get(key).defs.push(d);
  }
  for (const g of m.values()) { g.defs.sort((a, b) => a.n - b.n); g.arg = g.defs[0].arg; g.metricName = g.defs[0].metric.split(':')[0]; g.slow = SLOW_METRICS.has(g.metricName); }
  return [...m.values()];
})();

export function blankRecord() {
  return {
    goblins: 0, ancient: 0, primal: 0, crafted: 0, maxEnh: 0, runewords: 0, lgemUp: 0, gemTierMax: 0,
    hatched: 0, bountiesDone: 0, enhanced: 0, logins: 0, stages: 0, actKills: {}, skillDmg: {}, panels: {},
    nightOwl: 0, speed4: 0, mythicSalvaged: 0, bagFull: 0, oneShotBoss: 0, longOffline: 0, fastRebirth: 0, legendPet: 0, lowLifeBoss: 0, nakedBoss: 0,
    bestOffline: 0, chests: 0,
  };
}

/** 数える物（metric）→ 今の値 */
export const METRICS = {
  kills: (g) => g.state.meta.stats.kills,
  elites: (g) => g.state.meta.stats.elites,
  bosses: (g) => g.state.meta.stats.bosses,
  deaths: (g) => g.state.meta.stats.deaths,
  goblins: (g) => Math.max(g.state.meta.stats.goblins || 0, g.state.meta.record.goblins || 0),
  highestHit: (g) => g.state.meta.stats.highestHit || 0,
  zones: (g) => Object.keys(g.state.world.cleared || {}).length,
  act: (g, i) => { const z = ACTS[i]?.zones?.[4]; return z && g.state.world.cleared?.[z.id] ? 1 : (g.state.meta.record.actsCleared?.[i] ? 1 : 0); },
  stages: (g) => g.state.meta.record.stages || 0,
  level: (g) => g.state.hero.level,
  paragon: (g) => g.state.hero.paragon?.level || 0,
  skillMax: (g) => { let m = 0; for (const s of Object.values(g.state.hero.skills || {})) m = Math.max(m, s?.lvl || 0); return m; },
  found: (g, r) => g.state.meta.stats.itemsFound?.[r] || 0,
  ancient: (g) => g.state.meta.record.ancient || 0,
  primal: (g) => g.state.meta.record.primal || 0,
  salvaged: (g) => g.state.meta.stats.salvaged || 0,
  crafted: (g) => Math.max(g.state.meta.stats.crafted || 0, g.state.meta.record.crafted || 0),
  maxEnh: (g) => {
    let m = g.state.meta.record.maxEnh || 0;
    for (const s of SLOTS) m = Math.max(m, g.state.hero.equip[s]?.enh || 0);
    return m;
  },
  gemTier: (g) => {
    let m = g.state.meta.record.gemTierMax || 0;
    for (const k of Object.keys(g.state.inv.gems || {})) { const t = Number(/(\d+)$/.exec(k)?.[1]); if (t > m && t <= 20 && g.state.inv.gems[k] > 0) m = t; }
    return m;
  },
  lgemUp: (g) => g.state.meta.record.lgemUp || 0,
  runewords: (g) => Math.max(g.state.meta.record.runewords || 0, Object.keys(g.state.meta.collection?.runewords || {}).length),
  codex: (g) => Object.keys(g.state.meta.codex?.powers || {}).length,
  torment: (g) => g.state.world.maxTorment || 0,
  riftBest: (g) => g.state.world.rift?.best || 0,
  riftRuns: (g) => g.state.world.rift?.runs || 0,
  rebirths: (g) => g.state.meta.rebirths || 0,
  totalSouls: (g) => g.state.meta.totalSouls || 0,
  transcends: (g) => g.state.meta.prestige?.transcends || 0,
  altarLv: (g) => g.sys.prestige?.altarTotalLevel?.() || 0,
  species: (g) => g.sys.bestiary?.speciesCount?.() || 0,
  bestiaryTier4: (g) => g.sys.bestiary?.tierCount?.(4) || 0,
  treasures: (g) => g.sys.bestiary?.treasureCount?.() || 0,
  pets: (g) => Object.keys(g.state.meta.pets?.owned || {}).length,
  petLevel: (g) => { let m = 0; for (const p of Object.values(g.state.meta.pets?.owned || {})) m = Math.max(m, p?.lvl || 0); return m; },
  hatched: (g) => g.state.meta.record.hatched || 0,
  goldEarned: (g) => g.state.meta.stats.goldEarned || 0,
  playHours: (g) => (g.state.playTime || 0) / 3600,
  offlineHours: (g) => (g.state.meta.stats.offlineSec || 0) / 3600,
  bounties: (g) => g.state.meta.record.bountiesDone || 0,
  logins: (g) => g.state.meta.record.logins || 0,
  achCount: (g) => Object.keys(g.state.meta.achievements || {}).length,
  panels: (g) => Object.keys(g.state.meta.record.panels || {}).length,
  nightOwl: (g) => g.state.meta.record.nightOwl || 0,
  speed4: (g) => g.state.meta.record.speed4 || 0,
  mythicSalvaged: (g) => g.state.meta.record.mythicSalvaged || 0,
  bagFull: (g) => g.state.meta.record.bagFull || 0,
  oneShotBoss: (g) => g.state.meta.record.oneShotBoss || 0,
  longOffline: (g) => g.state.meta.record.longOffline || 0,
  fastRebirth: (g) => g.state.meta.record.fastRebirth || 0,
  legendPet: (g) => g.state.meta.record.legendPet || 0,
  lowLifeBoss: (g) => g.state.meta.record.lowLifeBoss || 0,
  nakedBoss: (g) => g.state.meta.record.nakedBoss || 0,
};

export const SOURCE_NAMES_SKILL = { pet: 'ペット', dot: '継続ダメージ・その他' };

export class AchievementSystem {
  constructor(game) {
    this.game = game;
    this.id = 'achievements';
    this.ver = 0;
    this.cache = null;
    this.t = 0; this.tMin = 0;
    this.win = []; // [{ by: { skillId: dmg }, total }]
    this.cur = {}; this.curTracked = 0; this.curT = 0;
    this.lastDone = 0;
    this.ptr = {};
    const ev = game.events;
    ev.on('kill', (e) => this.onKillEvent(e.unit));
    ev.on('stageClear', () => { if (this.rec) this.rec.stages++; });
    ev.on('zoneClear', (e) => { if (this.rec && e?.zone?.zoneIdx === 4) { this.rec.actsCleared ||= {}; this.rec.actsCleared[e.zone.actIdx] = 1; } });
    ev.on('crafted', (e) => this.onCrafted(e));
    ev.on('runeword', () => { if (this.rec) this.rec.runewords++; });
    ev.on('lgemUpgrade', () => { if (this.rec) this.rec.lgemUp++; });
    ev.on('bagFull', () => { if (this.rec) this.rec.bagFull = 1; });
    ev.on('panelOpen', (e) => { if (this.rec && e?.id) this.rec.panels[e.id] = 1; });
    ev.on('loot', (e) => this.onLoot(e));
  }

  get rec() { return this.game.state?.meta?.record; }

  ensureState(st) {
    const m = st.meta;
    if (!m.achievements || typeof m.achievements !== 'object') m.achievements = {};
    m.ach ||= {};
    m.ach.unseen ||= [];
    const r = (m.record ||= {});
    const b = blankRecord();
    for (const k of Object.keys(b)) if (r[k] === undefined || r[k] === null) r[k] = b[k];
    if (st.hero.title && !TITLE[st.hero.title]) st.hero.title = null;
    this.ver++;
    this.win = []; this.cur = {}; this.curTracked = 0; this.lastDone = 0;
    this.ptr = {};
  }

  onLoad() { this.check({ silent: true }); }

  // ---------------- 記録
  onKillEvent(u) {
    const r = this.rec;
    if (!r || !u) return;
    if (u.rank === 'goblin') r.goblins++;
    const st = this.game.state;
    if (st.world.mode === 'campaign') {
      const act = this.game.sys.world.zone()?.act;
      if (act) r.actKills[act] = (r.actKills[act] || 0) + 1;
    }
    if (u.boss) {
      const h = this.game.combat.hero;
      if (h && !h.dead && h.life / Math.max(1, h.maxLife) < 0.05) r.lowLifeBoss = 1;
      const eq = st.hero.equip;
      if (!SLOTS.some((s) => s !== 'weapon' && eq[s])) r.nakedBoss = 1;
    }
  }

  onCrafted(e) {
    const r = this.rec;
    if (!r) return;
    r.crafted++;
    if (/enh|強化/i.test(String(e?.kind || e?.op || e?.type || e?.action || ''))) r.enhanced = (r.enhanced || 0) + 1;
    const it = e?.item;
    if (it?.enh > r.maxEnh) r.maxEnh = it.enh;
  }

  onLoot(e) {
    // 宝石の段階（ほかの担当がアイテムでなく宝石を渡したときも拾う）
    const r = this.rec;
    if (!r || !e) return;
    const t = Number(e.gem?.tier || e.tier || 0);
    if (t > r.gemTierMax && t <= 20) r.gemTierMax = t;
  }

  /** 拾ったアイテムを数える（invHooks.onFound から） */
  onFound(item) {
    const r = this.rec;
    if (!r || !item) return;
    if (item.q === 1) r.ancient++;
    else if (item.q === 2) r.primal++;
  }

  onSalvageItem(item) {
    const r = this.rec;
    if (r && item?.rarity === 'mythic') r.mythicSalvaged++;
  }

  /** 主人公側のヒット（unitHooks.onMonsterHit から） */
  onHit(hit) {
    if (!hit) return;
    const id = hit.skill?.id || 'dot';
    const d = hit.dmg > 0 ? hit.dmg : 0;
    this.cur[id] = (this.cur[id] || 0) + d;
    this.curTracked += d;
    const t = hit.target;
    if (t?.boss && t.life >= t.maxLife * 0.999 && d >= t.life && this.rec) this.rec.oneShotBoss = 1;
  }

  onOffline(rep) {
    const r = this.rec;
    if (!r || !rep) return;
    if (rep.seconds >= 20 * 3600) r.longOffline = 1;
    r.bestOffline = Math.max(r.bestOffline || 0, rep.seconds || 0);
    this.check();
    rep.achievements = this._lastNew?.map((d) => d.id) || [];
  }

  tick(dt) {
    // 毎ティックは足すだけ。まとめた仕事は 1 秒に 1 回（軽くするため）
    this.curT += dt;
    if (this.curT < 1) return;
    if (!this.game.state) return;
    // スキル別ダメージ（1 秒ごとにまとめる）
    const done = this.game.combat.stats.dmgDone;
    let total = done - this.lastDone;
    if (total < 0) total = this.curTracked;
    this.lastDone = done;
    const by = this.cur;
    const other = total - this.curTracked;
    if (other > total * 0.001 && other > 0) by.dot = (by.dot || 0) + other;
    this.win.push({ t: this.curT, by, total: Math.max(total, this.curTracked) });
    if (this.win.length > WINDOW) this.win.shift();
    const life = this.rec?.skillDmg;
    if (life) for (const k in by) life[k] = (life[k] || 0) + by[k];
    this.cur = {}; this.curTracked = 0;
    this.t += this.curT; this.tMin += this.curT;
    this.curT = 0;
    if (this.t >= 2.5) { this.t = 0; this.nCheck = (this.nCheck || 0) + 1; this.check({ slow: this.nCheck % 4 === 0 }); }
    if (this.tMin >= 30) {
      this.tMin = 0;
      const hr = new Date().getHours();
      if (hr >= 2 && hr < 4 && this.rec) this.rec.nightOwl = 1;
      if ((this.game.state.settings.speed || 1) >= 4 && this.rec) this.rec.speed4 = 1;
    }
  }

  /** 今の値 */
  metric(def) {
    const fn = METRICS[def.metric.split(':')[0]];
    try { return fn ? Number(fn(this.game, def.arg)) || 0 : 0; } catch (e) { console.error('[ach metric]', def.metric, e); return 0; }
  }

  /** 達成を確かめる。数える物ごとにまとめ、まだの一番下の段だけ比べる（軽くするため） */
  check({ silent = false, slow = true } = {}) {
    const st = this.game.state;
    if (!st) return [];
    const got = st.meta.achievements;
    const fresh = [];
    for (const grp of GROUPS) {
      if (grp.slow && !slow) continue;
      let i = this.ptr[grp.key] || 0;
      while (i < grp.defs.length && got[grp.defs[i].id]) i++;
      this.ptr[grp.key] = i;
      if (i >= grp.defs.length) continue;
      let v = 0;
      const fn = grp.fn || (grp.fn = METRICS[grp.metricName]);
      try { v = Number(fn ? fn(this.game, grp.arg) : 0) || 0; } catch (e) { console.error('[ach metric]', grp.key, e); }
      while (i < grp.defs.length && (got[grp.defs[i].id] || v >= grp.defs[i].n)) {
        if (!got[grp.defs[i].id]) { got[grp.defs[i].id] = Date.now(); fresh.push(grp.defs[i]); }
        i++;
      }
      this.ptr[grp.key] = i;
    }
    this._lastNew = fresh;
    if (!fresh.length) return fresh;
    // 実績の数の実績（連鎖）
    const cnt = Object.keys(got).length;
    for (const d of ACHIEVEMENTS) if (d.metric === 'achCount' && !got[d.id] && cnt >= d.n) { got[d.id] = Date.now(); fresh.push(d); }
    for (const d of fresh) st.meta.ach.unseen.push(d.id);
    if (st.meta.ach.unseen.length > 300) st.meta.ach.unseen.splice(0, st.meta.ach.unseen.length - 300);
    this.ver++;
    this.game.onStatsChanged();
    if (!silent) {
      for (const d of fresh) {
        this.game.events.emit('achievement', { def: d });
        if (d.title && TITLE[d.title]) this.game.events.emit('titleUnlocked', { title: TITLE[d.title] });
      }
    }
    this.game.events.emit('metaChanged', { kind: 'achievements' });
    return fresh;
  }

  progress(def) {
    const cur = this.metric(def);
    const done = !!this.game.state.meta.achievements[def.id];
    return { cur, n: def.n, pct: done ? 100 : Math.max(0, Math.min(100, (cur / def.n) * 100)), done };
  }

  rawPoints() {
    let p = 0;
    const got = this.game.state.meta.achievements;
    for (const id in got) { const d = ACH[id]; if (d) p += d.points; }
    return p;
  }
  /** 実績ポイントの効果の倍率（祭壇・星晶） */
  pointMul() { return 1 + (this.game.sys.prestige?.effect?.('achMul') || 0) / 100; }
  points() { return this.rawPoints(); }
  unlockedCount() { return Object.keys(this.game.state.meta.achievements).filter((id) => ACH[id]).length; }

  /** 選べる称号 */
  titles() {
    const got = this.game.state.meta.achievements;
    const ok = new Set();
    for (const d of ACHIEVEMENTS) if (d.title && got[d.id]) ok.add(d.title);
    return TITLES.filter((t) => ok.has(t.id));
  }
  setTitle(id) {
    const st = this.game.state;
    if (id && !this.titles().some((t) => t.id === id)) return false;
    st.hero.title = id || null;
    this.ver++;
    this.game.onStatsChanged();
    this.game.events.emit('metaChanged', { kind: 'title' });
    return true;
  }

  markSeen() { this.game.state.meta.ach.unseen = []; this.game.events.emit('metaChanged', { kind: 'achievements' }); }

  heroMods() {
    const st = this.game.state;
    const key = `${this.ver}:${this.game.sys.prestige?.ver ?? 0}`;
    if (this.cache && this.cache.key === key && this.cache.state === st) return this.cache.mods;
    const mods = achievementMods(st, this.rawPoints(), this.pointMul());
    this.cache = { key, state: st, mods };
    return mods;
  }

  /** 直近 sec 秒のスキル別ダメージ */
  skillBreakdown(sec = 30) {
    const acc = {}; let tt = 0; let total = 0;
    for (let i = this.win.length - 1; i >= 0 && tt < sec; i--) {
      const b = this.win[i]; tt += b.t; total += b.total;
      for (const k in b.by) acc[k] = (acc[k] || 0) + b.by[k];
    }
    const sum = Object.values(acc).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(acc).filter(([, v]) => v > 0).map(([id, dmg]) => ({ id, name: skillName(id), dmg, dps: tt ? dmg / tt : 0, share: dmg / sum })).sort((a, b) => b.dmg - a.dmg);
  }
  lifetimeBreakdown() {
    const life = this.rec?.skillDmg || {};
    const sum = Object.values(life).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(life).filter(([, v]) => v > 0).map(([id, dmg]) => ({ id, name: skillName(id), dmg, share: dmg / sum })).sort((a, b) => b.dmg - a.dmg);
  }
}

export function skillName(id) {
  return SKILL[id]?.name || SOURCE_NAMES_SKILL[id] || id;
}

/** 実績ポイントと称号の能力 */
export function achievementMods(state, points, mul = 1) {
  const out = [];
  if (points > 0) for (const b of POINT_BONUS) out.push({ s: b.s, v: Math.round(b.v * points * mul * 100) / 100, src: 'achievements' });
  const t = TITLE[state?.hero?.title];
  if (t) for (const m of t.mods) out.push({ s: m.s, v: m.v, src: 'title' });
  return out;
}
