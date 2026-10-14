// 商人: 目利き（深淵の欠片で部位を選んで買うガチャ）・バッグと倉庫の拡張・素材の売り買い・ミシックの交換。
// 見える天井（幸運ゲージ）もここから見る（中身は content/items/rewards.js）。担当: アイテム担当。
// 外から: game.sys.merchant.gamble(slot) / gambleInfo() / expandBag() / addStashTab() / buyMat(id, packs) / sellMat(id, n)
//         exchangeMythic(mythicId) / exchangeInfo() / luck() → { leg: { cur, max, pct }, myth: {...} }

import { generateItem } from '../loot.js';
import { gameHooks } from '../game.js';
import { BAL, PG } from '../../data/balance.js';
import { RARITY } from '../../data/rarity.js';
import { MATERIAL } from '../../data/materials.js';
import { MYTHIC, MYTHICS } from '../../data/uniques.js';
import { rewardHook, offlineHook, luckView, ensureLuck } from '../content/items/rewards.js';
import { ensureFilter } from '../content/items/loot.js';

/** 目利きの確率（%）。表に出す */
export const GAMBLE_ODDS = [
  { r: 'rare', p: 58 },
  { r: 'epic', p: 29 },
  { r: 'legendary', p: 9.5 },
  { r: 'unique', p: 1.8 },
  { r: 'set', p: 1.6 },
  { r: 'mythic', p: 0.1 },
];
export const GAMBLE_SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'amulet', 'ring'];
export const BAG_STEPS = [80, 100, 120, 140, 160, 180, 200];
export const BAG_MAX = 200;
export const STASH_MAX = 8;
/** 素材の値段（1 つあたりの基準。実際は × PG(主人公のレベル)）。buy: 商人から買える */
export const MAT_PRICE = {
  scrap: { base: 2, buy: true, pack: 20 },
  dust: { base: 8, buy: true, pack: 10 },
  crystal: { base: 40 },
  chaos: { base: 120 },
  bless: { base: 90 },
  drill: { base: 120 },
  ascend: { base: 200 },
};
export const MYTHIC_COST = { core: 6, echo: 40 };

let hooked = false;

export class MerchantSystem {
  constructor(game) {
    this.game = game;
    this.id = 'merchant';
    // 倒したときの追加の報酬（試薬・宝石・ルーン・幸運ゲージ）。1 回だけ登録
    if (!hooked) { hooked = true; gameHooks.rewardMods.push(rewardHook); }
    // オフラインの報告に幸運ゲージ・素材を足す（UI より先に登録される）
    game.events.on('offlineReport', (rep) => { try { offlineHook(game, rep); } catch (e) { console.error('[merchant.offline]', e); } });
  }
  get st() { return this.game.state; }
  get inv() { return this.game.state.inv; }

  ensureState(state) {
    ensureLuck(state);
    ensureFilter(state);
    state.meta.merchant ||= { gambles: 0, exchanges: 0, bought: 0 };
    state.meta.collection ||= {};
    for (const k of ['uniques', 'sets', 'powers', 'mythics', 'runewords']) state.meta.collection[k] ||= {};
    if (!Array.isArray(state.inv.stash) || !state.inv.stash.length) state.inv.stash = [[]];
  }

  luck() { return luckView(this.st); }

  // ---------------- 目利き
  gambleIlvl() { return Math.max(1, Math.round(Math.max(this.game.sys.world.level(), this.st.hero.level))); }
  gambleInfo() {
    const ilvl = this.gambleIlvl();
    const cost = 10 + Math.floor(ilvl / 5);
    return { ilvl, cost, have: this.inv.mats.shard || 0, odds: GAMBLE_ODDS.map((o) => ({ ...o, name: RARITY[o.r].name, color: RARITY[o.r].color })), bagFree: this.game.sys.inv.bagFree() };
  }

  gamble(slot) {
    if (!GAMBLE_SLOTS.includes(slot)) return { ok: false, msg: '部位を選んでください' };
    const info = this.gambleInfo();
    if (info.have < info.cost) return { ok: false, msg: `深淵の欠片が足りない（${info.cost} 個）` };
    if (info.bagFree <= 0) return { ok: false, msg: 'バッグがいっぱい' };
    const rng = this.game.rng;
    const r = rng.weighted(GAMBLE_ODDS, (o) => o.p).r;
    const diff = this.game.sys.world.difficulty();
    const it = generateItem(rng, { ilvl: info.ilvl, rarity: r, slot, cls: this.st.hero.cls, ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0, anyReq: true, source: 'gamble' });
    if (!it) return { ok: false, msg: '目利きに失敗した' };
    this.inv.mats.shard -= info.cost;
    this.st.meta.merchant.gambles++;
    this.receiveToBag(it);
    return { ok: true, item: it };
  }

  receiveToBag(it) {
    const meta = this.st.meta;
    meta.stats.itemsFound[it.rarity] = (meta.stats.itemsFound[it.rarity] || 0) + 1;
    this.inv.bag.push(it);
    this.game.events.emit('loot', { item: it, where: 'bag', source: 'merchant' });
    this.game.events.emit('invChanged', { added: it });
  }

  // ---------------- 拡張
  bagInfo() {
    const cur = this.inv.bagSize;
    const next = BAG_STEPS.find((s) => s > cur) || null;
    const step = BAG_STEPS.indexOf(next);
    return { cur, next, max: BAG_MAX, cost: next ? Math.round(20000 * 4 ** step) : 0 };
  }
  expandBag() {
    const b = this.bagInfo();
    if (!b.next) return { ok: false, msg: 'これ以上は広げられない' };
    if (!this.game.spendGold(b.cost)) return { ok: false, msg: `ゴールドが足りない（${b.cost} G）` };
    this.inv.bagSize = b.next;
    this.game.events.emit('invChanged', {});
    return { ok: true, size: b.next };
  }
  stashInfo() {
    const n = this.inv.stash.length;
    return { tabs: n, max: STASH_MAX, cost: n < STASH_MAX ? Math.round(50000 * 5 ** (n - 1)) : 0 };
  }
  addStashTab() {
    const s = this.stashInfo();
    if (s.tabs >= STASH_MAX) return { ok: false, msg: `倉庫は ${STASH_MAX} 枚まで` };
    if (!this.game.spendGold(s.cost)) return { ok: false, msg: `ゴールドが足りない（${s.cost} G）` };
    this.inv.stash.push([]);
    this.game.events.emit('invChanged', {});
    return { ok: true, tabs: this.inv.stash.length };
  }

  // ---------------- 素材
  priceScale() { return PG(this.st.hero.level); }
  matPrice(id) {
    const p = MAT_PRICE[id];
    if (!p) return null;
    const unit = p.base * this.priceScale();
    return { id, name: MATERIAL[id]?.name || id, sell: Math.max(1, Math.round(unit)), buy: p.buy ? Math.round(unit * 4 * p.pack) : null, pack: p.pack || 1, have: this.inv.mats[id] || 0 };
  }
  buyMat(id, packs = 1) {
    const p = this.matPrice(id);
    if (!p?.buy) return { ok: false, msg: '売っていない' };
    const cost = p.buy * packs;
    if (!this.game.spendGold(cost)) return { ok: false, msg: `ゴールドが足りない（${cost} G）` };
    this.inv.mats[id] = (this.inv.mats[id] || 0) + p.pack * packs;
    this.st.meta.merchant.bought++;
    this.game.events.emit('invChanged', {});
    return { ok: true, got: p.pack * packs, cost };
  }
  sellMat(id, n = 1) {
    const p = this.matPrice(id);
    if (!p) return { ok: false, msg: '買い取れない' };
    n = Math.min(n, this.inv.mats[id] || 0);
    if (n <= 0) return { ok: false, msg: '持っていない' };
    this.inv.mats[id] -= n;
    const gold = p.sell * n;
    this.game.addGold(gold);
    this.game.events.emit('invChanged', {});
    this.game.events.emit('goldChanged', {});
    return { ok: true, gold, n };
  }

  // ---------------- ミシックの交換（確定ルート）
  exchangeInfo() {
    const m = this.inv.mats;
    return { cost: MYTHIC_COST, have: { core: m.core || 0, echo: m.echo || 0 }, ok: (m.core || 0) >= MYTHIC_COST.core && (m.echo || 0) >= MYTHIC_COST.echo, list: MYTHICS };
  }
  exchangeMythic(id) {
    const def = MYTHIC[id];
    if (!def) return { ok: false, msg: 'ミシックを選んでください' };
    const info = this.exchangeInfo();
    if (!info.ok) return { ok: false, msg: `極致の核 ${MYTHIC_COST.core}・伝説の残響 ${MYTHIC_COST.echo} が必要` };
    if (this.game.sys.inv.bagFree() <= 0) return { ok: false, msg: 'バッグがいっぱい' };
    const ilvl = Math.max(def.req || 60, this.gambleIlvl());
    const it = generateItem(this.game.rng, { ilvl, rarity: 'mythic', slot: def.slot, cls: this.st.hero.cls, def: id, anyReq: true, source: 'exchange' });
    if (!it || it.uniqueId !== id) return { ok: false, msg: '交換に失敗した' };
    this.inv.mats.core -= MYTHIC_COST.core;
    this.inv.mats.echo -= MYTHIC_COST.echo;
    this.st.meta.merchant.exchanges++;
    this.receiveToBag(it);
    return { ok: true, item: it };
  }

  /** 宝ゴブリンを倒したときなどの追加のドロップ（財宝嗅ぎ） */
  bonusDrops(unit, n) {
    const g = this.game;
    const H = g.H || {};
    const diff = g.sys.world.difficulty();
    for (let i = 0; i < n; i++) {
      const it = generateItem(g.rng, { ilvl: unit.level, cls: this.st.hero.cls, mf: (H.mf || 0) + (diff.mf || 0), rank: unit.rank, torment: this.st.world.torment, ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0 });
      if (!it) continue;
      const where = g.sys.inv.receive(it);
      g.combat.emit({ t: 'loot', x: unit.x + g.rng.range(-40, 40), y: unit.y, item: it, where });
      g.events.emit('loot', { item: it, where, unit });
    }
  }
}

export { BAL };
