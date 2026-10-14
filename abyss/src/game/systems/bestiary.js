// 図鑑（魔物図鑑・宝物図鑑）と、落とし物の表・レアリティの確率の表示用の計算。担当: メタ担当。
//
// ■ 魔物図鑑: 魔物ごとの撃破数で段が上がる（10 / 100 / 1,000 / 10,000 体）。1 段ごとにその種族へのダメージ +1%。
//            見つけた種類の割合（10% / 25% / 50% / 100%）で全ダメージ・最大ライフが上がる。
// ■ 宝物図鑑: ユニーク・セットの部位・ミシック・伝説の力を初めて拾うと登録。
//            1 つごとに ユニーク: 全ダメージ +0.2% / セット: 最大ライフ +0.2% / ミシック: 最終ダメージ +0.5% / 伝説の力: 全ダメージ +0.2%。
//            登録の割合（10% / 25% / 50% / 100%）でレア発見率・ゴールド・全ダメージが上がる。
// 外から: game.sys.bestiary.tierOf(id) / speciesCount() / tierCount(t) / treasureCount() / treasureTotal() / entries()
//         rarityOdds({ mf, rank, torment }) → { rarityId: 確率 } / milestones()
// 状態: state.meta.bestiary { 魔物 id: 撃破数 }（game.js が数える）・state.meta.collection { uniques, sets, mythics, powers }・state.meta.codexSeen
// 出来事: 'bestiaryNew' { id } / 'bestiaryTier' { id, tier } / 'collectionFind' { kind, id, name } / 'metaChanged'

import { MONSTERS, MONSTER, FAMILIES } from '../../data/monsters.js';
import { UNIQUES, SETS, MYTHICS } from '../../data/uniques.js';
import { ZONES } from '../../data/world.js';
import { RARITIES, RARITY } from '../../data/rarity.js';
import { BAL } from '../../data/balance.js';
import { registry } from '../registry.js';
import * as LOOT from '../loot.js';

export const KILL_TIERS = [10, 100, 1000, 10000];
export const TIER_NAMES = ['未発見', '見た', '知った', '詳しい', '天敵'];
export const FAMILY_PER_TIER = 1; // 1 段ごとの種族ダメージ（%）
export const SPECIES_MILESTONES = [
  { pct: 0.1, mods: [{ s: 'inc_dmg', v: 2 }, { s: 'inc_life', v: 2 }] },
  { pct: 0.25, mods: [{ s: 'inc_dmg', v: 5 }, { s: 'inc_life', v: 5 }] },
  { pct: 0.5, mods: [{ s: 'inc_dmg', v: 10 }, { s: 'inc_life', v: 10 }] },
  { pct: 1, mods: [{ s: 'inc_dmg', v: 20 }, { s: 'inc_life', v: 20 }] },
];
export const TREASURE_EACH = { uniques: { s: 'inc_dmg', v: 0.2 }, sets: { s: 'inc_life', v: 0.2 }, mythics: { s: 'more_dmg', v: 0.5 }, powers: { s: 'inc_dmg', v: 0.2 } };
export const TREASURE_MILESTONES = [
  { pct: 0.1, mods: [{ s: 'magic_find', v: 5 }, { s: 'gold_find', v: 5 }, { s: 'inc_dmg', v: 2 }] },
  { pct: 0.25, mods: [{ s: 'magic_find', v: 10 }, { s: 'gold_find', v: 10 }, { s: 'inc_dmg', v: 4 }] },
  { pct: 0.5, mods: [{ s: 'magic_find', v: 20 }, { s: 'gold_find', v: 20 }, { s: 'inc_dmg', v: 8 }] },
  { pct: 1, mods: [{ s: 'magic_find', v: 40 }, { s: 'gold_find', v: 40 }, { s: 'inc_dmg', v: 15 }] },
];

export function tierOfCount(n) {
  let t = 0;
  for (const k of KILL_TIERS) if (n >= k) t++;
  return t;
}

/** 伝説の力として数える力（アイテム担当が definePower で登録したもののうち、装備に付く物） */
export function legendaryPowers() {
  return registry.allPowers().filter((p) => (p.codex || (Array.isArray(p.slots) && p.slots.length)) && !p.hidden && !p.keystone);
}

/** セットの部位の一覧 */
export function setPieces() {
  const out = [];
  for (const s of SETS) for (const pc of s.pieces || []) out.push({ ...pc, setId: s.id, setName: s.name });
  return out;
}

export class BestiarySystem {
  constructor(game) {
    this.game = game;
    this.id = 'bestiary';
    this.ver = 0;
    this.cache = null;
    this.dirty = false;
    game.events.on('loot', (e) => { if (e?.item) this.onFound(e.item); });
    // 'kill' は game.onKill（図鑑の数を足す）より先に届くので、足したあとの数（+1）で段を見る
    game.events.on('kill', (e) => this.onKill(e?.unit, 1));
  }

  get st() { return this.game.state; }

  ensureState(st) {
    const m = st.meta;
    if (!m.bestiary || typeof m.bestiary !== 'object') m.bestiary = {};
    const c = (m.collection ||= {});
    for (const k of ['uniques', 'sets', 'mythics', 'powers']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
    m.codexSeen ||= { unseen: 0 };
    this.ver++;
  }

  onLoad() {
    // 持っている装備を登録しなおす（図鑑ができる前のセーブ）
    const st = this.st;
    const all = [...st.inv.bag, ...st.inv.stash.flat(), ...Object.values(st.hero.equip)];
    for (const it of all) if (it) this.onFound(it, { silent: true });
  }

  tierOf(id) { return tierOfCount(this.st.meta.bestiary[id] || 0); }

  /** 倒したとき。add は「まだ足されていない分」 */
  onKill(u, add = 0) {
    const id = u?.defId;
    if (!id || !MONSTER[id] || !this.game.state) return;
    const n = (this.st.meta.bestiary[id] || 0) + add;
    if (n === 1) { this.dirty = true; this.game.events.emit('bestiaryNew', { id }); }
    const t = KILL_TIERS.indexOf(n);
    if (t >= 0) { this.dirty = true; this.game.events.emit('bestiaryTier', { id, tier: t + 1 }); }
  }

  /** 拾ったとき（invHooks.onFound と 'loot'）。初めてなら登録 */
  onFound(item, { silent = false } = {}) {
    if (!item) return;
    const c = this.st.meta.collection;
    const reg = (kind, id, name) => {
      if (!id || c[kind][id]) return;
      c[kind][id] = Date.now();
      this.dirty = true;
      this.st.meta.codexSeen.unseen = (this.st.meta.codexSeen.unseen || 0) + 1;
      if (!silent) this.game.events.emit('collectionFind', { kind, id, name: name || id });
    };
    const uid = item.uniqueId || item.setPiece || item.mythicId;
    if (item.rarity === 'unique' && uid) reg('uniques', uid, UNIQUES.find((u) => u.id === uid)?.name);
    if (item.rarity === 'set' && uid) reg('sets', uid, setPieces().find((p) => p.id === uid)?.name);
    if (item.rarity === 'mythic' && uid) reg('mythics', uid, MYTHICS.find((u) => u.id === uid)?.name);
    if (item.power?.id) {
      const p = registry.power(item.power.id);
      if (!c.powers[item.power.id]) reg('powers', item.power.id, p?.name);
    }
  }

  onOffline(rep) {
    // 放置で倒した分を、今いる地域の魔物に割り振る
    const st = this.st;
    if (!rep?.kills || st.world.mode !== 'campaign') return;
    const z = this.game.sys.world.zone();
    const list = (z?.monsters || []).filter((id) => MONSTER[id]);
    if (!list.length) return;
    const each = Math.floor(rep.kills / list.length);
    if (each <= 0) return;
    for (const id of list) {
      const before = tierOfCount(st.meta.bestiary[id] || 0);
      st.meta.bestiary[id] = (st.meta.bestiary[id] || 0) + each;
      if (tierOfCount(st.meta.bestiary[id]) !== before || before === 0) this.dirty = true;
    }
  }

  tick() {
    if (this.dirty) {
      this.dirty = false;
      this.ver++;
      this.game.onStatsChanged();
      this.game.events.emit('metaChanged', { kind: 'bestiary' });
    }
  }

  // ---------------- 数え上げ
  speciesCount() { let n = 0; const b = this.st.meta.bestiary; for (const m of MONSTERS) if ((b[m.id] || 0) > 0) n++; return n; }
  tierCount(t) { let n = 0; const b = this.st.meta.bestiary; for (const m of MONSTERS) if (tierOfCount(b[m.id] || 0) >= t) n++; return n; }
  treasureTotal() { return UNIQUES.length + setPieces().length + MYTHICS.length + legendaryPowers().length; }
  treasureCounts() {
    const c = this.st.meta.collection;
    const has = (kind, list) => list.filter((x) => c[kind][x.id]).length;
    return {
      uniques: has('uniques', UNIQUES), uniquesTotal: UNIQUES.length,
      sets: has('sets', setPieces()), setsTotal: setPieces().length,
      mythics: has('mythics', MYTHICS), mythicsTotal: MYTHICS.length,
      powers: has('powers', legendaryPowers()), powersTotal: legendaryPowers().length,
    };
  }
  treasureCount() { const t = this.treasureCounts(); return t.uniques + t.sets + t.mythics + t.powers; }

  /** 魔物図鑑の一覧（地域の順） */
  entries() {
    const order = [];
    const seen = new Set();
    for (const z of ZONES) for (const id of [...z.monsters, z.boss]) if (MONSTER[id] && !seen.has(id)) { seen.add(id); order.push(id); }
    for (const m of MONSTERS) if (!seen.has(m.id)) order.push(m.id);
    const b = this.st.meta.bestiary;
    return order.map((id) => {
      const m = MONSTER[id];
      const n = b[id] || 0;
      const tier = tierOfCount(n);
      const zones = ZONES.filter((z) => z.monsters.includes(id) || z.boss === id).map((z) => z.name);
      return { id, def: m, kills: n, tier, next: KILL_TIERS[tier] || null, zones };
    });
  }

  familyBonus() {
    const out = {};
    const b = this.st.meta.bestiary;
    for (const m of MONSTERS) {
      const t = tierOfCount(b[m.id] || 0);
      if (t > 0 && m.family) out[m.family] = (out[m.family] || 0) + t * FAMILY_PER_TIER;
    }
    return out;
  }

  milestones() {
    const sp = this.speciesCount() / Math.max(1, MONSTERS.length);
    const tt = this.treasureTotal();
    const tr = tt ? this.treasureCount() / tt : 0;
    return { species: sp, treasure: tr, speciesStep: SPECIES_MILESTONES.filter((x) => sp >= x.pct).length, treasureStep: tt ? TREASURE_MILESTONES.filter((x) => tr >= x.pct).length : 0 };
  }

  heroMods() {
    if (this.cache && this.cache.ver === this.ver && this.cache.state === this.st) return this.cache.mods;
    const out = [];
    for (const [fam, v] of Object.entries(this.familyBonus())) out.push({ s: `family_dmg:${fam}`, v, src: 'bestiary' });
    const ms = this.milestones();
    const sp = SPECIES_MILESTONES[ms.speciesStep - 1];
    if (sp) for (const m of sp.mods) out.push({ ...m, src: 'bestiary' });
    const tc = this.treasureCounts();
    const acc = {};
    for (const kind of ['uniques', 'sets', 'mythics', 'powers']) {
      const e = TREASURE_EACH[kind];
      if (tc[kind] > 0) acc[e.s] = (acc[e.s] || 0) + e.v * tc[kind];
    }
    const tm = TREASURE_MILESTONES[ms.treasureStep - 1];
    if (tm) for (const m of tm.mods) acc[m.s] = (acc[m.s] || 0) + m.v;
    for (const [s, v] of Object.entries(acc)) out.push({ s, v: Math.round(v * 100) / 100, src: 'treasure' });
    this.cache = { ver: this.ver, state: this.st, mods: out };
    return out;
  }

  // ---------------- 落とし物の確率（loot.js の rollRarity と同じ式。アイテム担当が rarityOdds を出していればそれを使う）
  rarityOdds(opts = {}) {
    if (typeof LOOT.rarityOdds === 'function') {
      try { const r = LOOT.rarityOdds(opts); if (r) return r; } catch (e) { console.error(e); }
    }
    return rarityOddsFallback(opts);
  }
}

export function rarityOddsFallback({ mf = 0, rank = 'normal', torment = 0 } = {}) {
  const w = { ...BAL.RARITY_WEIGHTS };
  const mfe = BAL.mfEffective(mf);
  const boost = rank === 'normal' ? 1 : rank === 'champion' ? 2.5 : rank === 'rare' ? 3.5 : rank === 'goblin' ? 6 : 8;
  for (const r of RARITIES) {
    if (r.idx >= 2) w[r.id] *= (1 + mfe / 100) * boost;
    if (r.idx === 1) w[r.id] *= 1 + mfe / 300;
  }
  if (rank !== 'normal') w.common *= 0.3;
  if (torment > 0) w.common *= Math.max(0.1, 1 - torment * 0.08);
  const total = Object.values(w).reduce((s, v) => s + (v > 0 ? v : 0), 0) || 1;
  const out = {};
  for (const r of RARITIES) out[r.id] = Math.max(0, w[r.id] || 0) / total;
  return out;
}

export { FAMILIES, RARITY };
