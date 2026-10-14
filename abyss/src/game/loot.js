// アイテムの生成（ドロップ・ガチャ・報酬）。レアリティ → ベース → オプションの順に決める。
// ユニーク・セット・ミシック・伝説の力は、アイテム担当が registry と hooks で足す（rollSpecial）。

import { BASES, BASE, AFFIXES, AFFIX, affixAllowed, affixAllowedBase, SLOTS, baseSlotOf, TIER_REQ } from '../data/items.js';
import { RARITIES, RARITY } from '../data/rarity.js';
import { CLASS } from '../data/classes.js';
import { statDef } from '../data/stats.js';
import { P, BAL } from '../data/balance.js';

/** 生成の差し込み口。アイテム担当が上書き・追加する */
export const lootHooks = {
  // (item, ctx) => item … ユニーク・セット・ミシックを「そのレアリティの代わりに」作る。null なら普通に作る
  makeSpecial: null,
  // (item, ctx) => void … 伝説の力を付ける
  addPower: null,
  // (item, ctx) => void … ソケットなど最後の仕上げ
  finish: [],
  // (rng) => string … レアの名前
  rareName: null,
  // (affix, item, rng, ctx) => '能力のキー' | null … s に '*' を含むオプション（スキル指定など）の中身を決める
  dynStat: null,
};

const BASE_SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'amulet', 'ring'];
const SLOT_WEIGHT = { weapon: 14, offhand: 8, helm: 9, chest: 9, gloves: 9, belt: 8, legs: 9, boots: 9, amulet: 7, ring: 12 };

/** レアリティを決める。rank は 'normal'|'champion'|'rare'|'boss'... 、mf はレア発見率（%） */
export function rollRarity(rng, { mf = 0, rank = 'normal', minRarity = null, torment = 0 } = {}) {
  const w = { ...BAL.RARITY_WEIGHTS };
  const mfe = BAL.mfEffective(mf);
  const boost = rank === 'normal' ? 1 : rank === 'champion' ? 2.5 : rank === 'rare' ? 3.5 : rank === 'goblin' ? 6 : 8;
  for (const r of RARITIES) {
    if (r.id === 'mythic') w[r.id] *= Math.sqrt((1 + mfe / 100) * boost); // ミシックは発見率・格の効きを弱める（とても珍しいまま）
    else if (r.idx >= 2) w[r.id] *= (1 + mfe / 100) * boost;
    if (r.idx === 1) w[r.id] *= 1 + mfe / 300;
  }
  if (rank !== 'normal') w.common *= 0.3;
  if (torment > 0) { w.common *= Math.max(0.1, 1 - torment * 0.08); }
  if (minRarity) {
    const min = RARITY[minRarity].idx;
    for (const r of RARITIES) if (r.idx < min) w[r.id] = 0;
  }
  const pick = rng.weighted(RARITIES, (r) => w[r.id] || 0);
  return pick ? pick.id : 'common';
}

/** ベースを選ぶ。cls があればそのクラスの武器・副手を 70% で優先（スマートドロップ） */
export function pickBase(rng, { ilvl, slot = null, cls = null, smart = 0.7 } = {}) {
  const bslot = slot ? baseSlotOf(slot) : rng.weighted(BASE_SLOTS.map((s) => ({ s, weight: SLOT_WEIGHT[s] })), (x) => x.weight).s;
  // ilvl で着けられる中で上の 3 段階
  let maxTier = 1;
  for (let t = 1; t <= TIER_REQ.length; t++) if (TIER_REQ[t - 1] <= ilvl) maxTier = t;
  let pool = BASES.filter((b) => b.slot === bslot && b.tier <= maxTier && b.tier >= maxTier - 2);
  const c = cls ? CLASS[cls] : null;
  if (c && (bslot === 'weapon' || bslot === 'offhand') && rng.chance(smart)) {
    const kinds = bslot === 'weapon' ? c.weapons : c.offhands;
    const p2 = pool.filter((b) => kinds.includes(b.kind));
    if (p2.length) pool = p2;
  } else if (c && rng.chance(smart * 0.6) && pool.some((b) => b.style)) {
    const p2 = pool.filter((b) => !b.style || c.armorPref.includes(b.style));
    if (p2.length) pool = p2;
  }
  return rng.weighted(pool, (b) => 1 + (b.tier - (maxTier - 2)) * 0.6);
}

/** そのアイテムレベルで出せるオプションの段階を選ぶ（低い段階ほど出やすい） */
export function rollTier(rng, affix, ilvl, bias = 0) {
  const ok = affix.tiers.map((t, i) => ({ t, i })).filter((x) => x.t[0] <= ilvl);
  if (!ok.length) return null;
  // 出せる中の最上位は出にくく、その下の 2 段階が中心。もっと下は少し（bias で上を出やすく）
  const top = ok[ok.length - 1].i;
  return rng.weighted(ok, (x) => {
    const d = top - x.i;
    if (d === 0) return 1 + bias;
    if (d <= 2) return 2 + bias * 0.3;
    return Math.max(0.15, 0.6 - bias * 0.2);
  }).i;
}

/** オプション 1 つの数値を振る */
export function rollAffixValue(rng, affix, tierIdx, ilvl, { greater = false, quality = 1 } = {}) {
  const [, min, max] = affix.tiers[tierIdx];
  const d = statDef(affix.s);
  let v = min + (max - min) * rng.next();
  if (d.scale) v *= P(ilvl);
  if (greater) v *= 1.5;
  v *= quality;
  if (d.kind === 'flat' && !d.scale) v = Math.max(1, Math.round(v));
  else if (d.scale) v = Math.round(v * 10) / 10;
  else v = Math.round(v * 10) / 10;
  return v;
}

/** item にオプションを n 個足す（同じ能力・同じグループは重ならない） */
export function addAffixes(rng, item, n, { tierBias = 0, greaterChance = 0.02, ctx = null } = {}) {
  const have = new Set((item.affixes || []).map((a) => a.id));
  const groups = new Set((item.affixes || []).map((a) => AFFIX[a.id]?.group).filter(Boolean));
  const stats = new Set((item.affixes || []).map((a) => a.s));
  let prefixes = (item.affixes || []).filter((a) => AFFIX[a.id]?.type === 'prefix').length;
  const base = BASE[item.base];
  let suffixes = (item.affixes || []).length - prefixes;
  const maxEach = Math.ceil(Math.max(n + (item.affixes?.length || 0), 2) / 2) + 1;
  item.affixes ||= [];
  for (let k = 0; k < n; k++) {
    const pool = AFFIXES.filter((a) => (base ? affixAllowedBase(a, base) : affixAllowed(a, item.slot)) && !have.has(a.id) && !stats.has(a.s) && !(a.group && groups.has(a.group)) && a.tiers[0][0] <= item.ilvl
      && (a.type === 'prefix' ? prefixes < maxEach : suffixes < maxEach));
    const a = rng.weighted(pool, (x) => x.weight);
    if (!a) break;
    const t = rollTier(rng, a, item.ilvl, tierBias);
    if (t === null) continue;
    let s = a.s;
    if (s.includes('*')) { s = lootHooks.dynStat ? lootHooks.dynStat(a, item, rng, ctx) : null; if (!s || stats.has(s)) { have.add(a.id); k--; if (have.size > 200) break; continue; } }
    const g = rng.chance(greaterChance);
    item.affixes.push({ id: a.id, s, t, v: rollAffixValue(rng, a, t, item.ilvl, { greater: g }), ...(g ? { g: 1 } : {}) });
    have.add(a.id); stats.add(s); if (a.group) groups.add(a.group);
    if (a.type === 'prefix') prefixes++; else suffixes++;
  }
  return item;
}

let uidCounter = 1;
export function setUidCounter(n) { uidCounter = Math.max(uidCounter, n); }
export function nextUid() { return uidCounter++; }
export function peekUid() { return uidCounter; }

/**
 * アイテムを 1 つ作る。
 * opts: { ilvl, rarity?, slot?, cls?, mf?, rank?, torment?, minRarity?, base?, ancientChance?, primalChance?, source? }
 */
export function generateItem(rng, opts = {}) {
  const ilvl = Math.max(1, Math.round(opts.ilvl || 1));
  const rarity = opts.rarity || rollRarity(rng, opts);
  const base = opts.base ? BASES.find((b) => b.id === opts.base) : pickBase(rng, { ilvl, slot: opts.slot, cls: opts.cls });
  if (!base) return null;
  const item = { uid: nextUid(), base: base.id, slot: base.slot, rarity, ilvl, q: 0, affixes: [], enh: 0, sockets: [], found: Date.now(), isNew: true };
  const ctx = { rng, opts, ilvl };
  const r = RARITY[rarity];

  // 太古・原初（レジェンダリー以上）
  if (r.idx >= 4) {
    const pc = opts.primalChance ?? 0;
    const ac = opts.ancientChance ?? 0.08;
    if (rng.chance(pc)) item.q = 2; else if (rng.chance(ac)) item.q = 1;
  }

  if (r.fixed && lootHooks.makeSpecial) {
    const special = lootHooks.makeSpecial(item, ctx);
    if (special) { for (const f of lootHooks.finish) f(special, ctx); return special; }
    // 作れなかったらレジェンダリーとして続ける
    item.rarity = 'legendary';
  } else if (r.fixed) {
    item.rarity = 'legendary';
  }
  const rr = RARITY[item.rarity];
  const [lo, hi] = rr.affixes;
  let n = rng.int(lo, hi);
  if (item.rarity === 'rare' && ilvl >= 40 && rng.chance(0.3)) n += 1;
  const tierBias = rr.idx >= 3 ? 1.5 : rr.idx === 2 ? 0.5 : 0;
  addAffixes(rng, item, n, { tierBias, greaterChance: rr.idx >= 3 ? 0.06 : 0.015, ctx });
  if (rr.power && lootHooks.addPower) lootHooks.addPower(item, ctx);
  if ((item.rarity === 'rare' || item.rarity === 'epic') && lootHooks.rareName) item.name = lootHooks.rareName(rng, item);
  for (const f of lootHooks.finish) f(item, ctx);
  return item;
}

/** 普通の敵 1 体を倒したときに落ちるアイテムの数 */
export function dropCount(rng, { rank = 'normal', quantity = 0, lootMult = 1, lootMul = 1 } = {}) {
  const rk = BAL.RANK[rank] || BAL.RANK.normal;
  // lootMul（game.js が渡す名前）と lootMult のどちらでも受ける
  const mean = BAL.ITEM_DROP_CHANCE * rk.loot * lootMult * lootMul * (1 + quantity / 100);
  if (rank === 'boss' || rank === 'actboss' || rank === 'guardian') return Math.max(2, rng.poisson(mean));
  return rng.poisson(mean);
}

export { SLOTS };
