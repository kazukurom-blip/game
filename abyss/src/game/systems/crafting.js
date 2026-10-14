// クラフト（鍛冶）。壊れる・下がるは無し。費用と確率は *Info() で先に見せられる。担当: アイテム担当。
//   強化 enhance       … +0〜+20。成功率の表あり。失敗すると「天井」がたまり、決まった回数で必ず成功。+10/+15/+20 で節目のボーナス
//   段上げ tierUp      … 鍛造値（FP）を使ってオプション 1 行の段を 1 つ上げる。5% で大成功（FP 消費 0・2 段）
//   付け替え reroll    … 1 行を選んで候補 2 つ（＋そのまま）から選ぶ。以後はその行だけ。費用は 1 回ごとに ×1.25（10 回で頭打ち）
//   混沌 chaos         … レア・エピックのオプションをすべて振り直す
//   昇格 ascend        … マジック → レア → エピック
//   祝福 bless         … 段はそのまま、数値だけ振り直す（ユニークの固定オプションも）
//   穿孔 drill         … ソケットを 1 つ開ける（武器 3・胴/頭/脚 2・ほか 1 まで）
//   堕落 corrupt       … 最後の賭け（4 通り 各 25%）。以後は変えられない
// 外から: game.sys.crafting.<名前>(uid, ...) → { ok, msg, ... }、<名前>Info(item, ...) → 費用・確率・できない理由

import { AFFIX, affixPool, BASE, socketKind } from '../../data/items.js';
import { RARITY } from '../../data/rarity.js';
import { MATERIAL } from '../../data/materials.js';
import { PG, curve } from '../../data/balance.js';
import { rollTier, rollAffixValue, addAffixes, lootHooks } from '../loot.js';
import { topTier, affixRoll, setAffixValue, specialDef, fixedValue, socketMax } from '../content/items/itemlib.js';

export const ENH_MAX = 20;
/** 強化 1 回の鉄屑 = (今の +値 + 1) × これ × 曲線^0.2（強さ担当: 1.5 → 1.0。第五章までに主な装備を +10 にできるくらい） */
export const ENH_SCRAP = 1.0;
/** +N → +N+1 の成功率（%） */
export const ENH_RATE = [100, 100, 100, 100, 100, 90, 85, 80, 70, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];
export const ENH_MILESTONES = {
  10: '節目 +10: オプションの数値がさらに +5%',
  15: '節目 +15: 新しいオプションが 1 行増える（上限を超えて）',
  20: '節目 +20: オプション 1 行が「大いなる★」になり、数値がさらに +5%',
};
const REROLL_CAP = 10;
/** 堕落で付く特別な内在（場所ごと） */
export const CORRUPT_IMPLICITS = {
  weapon: [{ s: 'skill_lvl', v: 1 }, { s: 'crit_damage', v: 30 }, { s: 'attack_speed', v: 8 }, { s: 'res_pen', v: 8 }],
  armor: [{ s: 'inc_life', v: 8 }, { s: 'dr', v: 4 }, { s: 'res_all', v: 10 }, { s: 'cdr', v: 5 }],
  jewelry: [{ s: 'inc_dmg', v: 15 }, { s: 'magic_find', v: 20 }, { s: 'skill_lvl', v: 1 }, { s: 'crit_chance', v: 3 }],
};
export const CORRUPT_OUTCOMES = ['変化なし', '特別な内在が付く', 'オプション 1 行が上限を超える（×1.3）', 'オプションをすべて振り直す'];

const gp = (item) => PG(item.ilvl || 1);

export class CraftingSystem {
  constructor(game) { this.game = game; this.id = 'crafting'; }
  get mats() { return this.game.state.inv.mats; }

  ensureState(state) {
    state.meta.stats.crafted ||= 0;
    state.meta.crafting ||= { enhanced: 0, best: 0, corrupted: 0 };
  }

  // ---------------- 共通
  find(uid) { return this.game.sys.inv.findItem(uid); }
  /** 変えられない理由 */
  lockReason(item) {
    if (!item) return '装備を選んでください';
    if (item.corrupted) return '堕落した装備は変えられない';
    return null;
  }
  /** cost = { gold, mats: { id: 数 } } が払えるか。足りない物の一覧 */
  missing(cost) {
    const out = [];
    if ((cost.gold || 0) > this.game.state.meta.gold) out.push('ゴールド');
    for (const [id, n] of Object.entries(cost.mats || {})) if ((this.mats[id] || 0) < n) out.push(MATERIAL[id]?.name || id);
    return out;
  }
  pay(cost) {
    const miss = this.missing(cost);
    if (miss.length) return `${miss.join('・')}が足りない`;
    if (cost.gold) this.game.spendGold(cost.gold);
    for (const [id, n] of Object.entries(cost.mats || {})) this.mats[id] -= n;
    return null;
  }
  done(found, extra = {}) {
    this.game.state.meta.stats.crafted++;
    if (found.where === 'equip') this.game.onGearChanged(); else this.game.events.emit('invChanged', {});
    this.game.events.emit('crafted', { item: found.item, ...extra });
    return { ok: true, item: found.item, ...extra };
  }
  ctx() { return { rng: this.game.rng, opts: { cls: this.game.state.hero.cls } }; }

  // ---------------- 強化
  enhanceInfo(item) {
    const lock = this.lockReason(item);
    const cur = item?.enh || 0;
    if (lock) return { ok: false, msg: lock, cur };
    if (cur >= ENH_MAX) return { ok: false, msg: `最大の +${ENH_MAX}`, cur, max: true };
    const base = ENH_RATE[cur];
    const pity = item.enhPity || 0;
    const need = base >= 100 ? 0 : Math.max(1, Math.ceil(100 / base) - 1);
    const chance = need && pity >= need ? 100 : Math.min(100, base + pity * base * 0.1);
    const cost = { gold: Math.round(25 * gp(item) * 1.2 ** cur), mats: { scrap: Math.ceil((cur + 1) * ENH_SCRAP * curve(item.ilvl || 1) ** 0.2) } };
    return { ok: true, cur, next: cur + 1, base, chance: Math.round(chance * 10) / 10, pity, need, cost, milestone: ENH_MILESTONES[cur + 1] || null, missing: this.missing(cost) };
  }

  enhance(uid) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.enhanceInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const success = info.chance >= 100 || this.game.rng.chance(info.chance / 100);
    if (!success) {
      item.enhPity = (item.enhPity || 0) + 1;
      this.game.events.emit('invChanged', {});
      this.game.events.emit('enhance', { item, ok: false, success: false, pity: item.enhPity }); // 失敗の音（鍛冶の回数には数えない）
      return { ok: true, success: false, item, pity: item.enhPity, need: info.need };
    }
    item.enh = info.next;
    item.enhPity = 0;
    const st = this.game.state.meta.crafting;
    st.enhanced++; st.best = Math.max(st.best, item.enh);
    let bonus = null;
    if (item.enh === 15 && !item.enh15) {
      item.enh15 = 1;
      const before = item.affixes.length;
      addAffixes(this.game.rng, item, 1, { tierBias: 1, greaterChance: 0, ctx: this.ctx() });
      if (item.affixes.length > before) { item.affixes[item.affixes.length - 1].x = 1; bonus = '新しいオプションが 1 行増えた'; }
    }
    if (item.enh === 20 && !item.enh20) {
      item.enh20 = 1;
      const cand = item.affixes.filter((a) => !a.g);
      if (cand.length) { const a = this.game.rng.pick(cand); const r = affixRoll(item, a); a.g = 1; setAffixValue(item, a, r); bonus = 'オプション 1 行が大いなる★になった'; } else bonus = 'オプションの数値 +5%';
    }
    if (item.enh === 10) bonus = 'オプションの数値 +5%';
    return this.done(f, { kind: 'enhance', success: true, great: !!bonus, enh: item.enh, bonus });
  }

  // ---------------- 段上げ（鍛造値）
  tierUpInfo(item, idx) {
    const lock = this.lockReason(item);
    if (lock) return { ok: false, msg: lock };
    if (item.fp === undefined) return { ok: false, msg: '鍛造値が無い（レア以上の装備に付く）' };
    const a = item.affixes?.[idx];
    if (!a) return { ok: false, msg: 'オプションを選んでください', fp: item.fp };
    const af = AFFIX[a.id];
    if (!af) return { ok: false, msg: '段上げできないオプション' };
    const top = topTier(af, item.ilvl);
    if (a.t >= top) return { ok: false, msg: a.t >= af.tiers.length - 1 ? 'もう最高の段（T1）' : `アイテム Lv ${item.ilvl} ではこれ以上は上がらない（次の段は Lv ${af.tiers[a.t + 1][0]}）`, fp: item.fp };
    if (item.fp <= 0) return { ok: false, msg: '鍛造値が 0（もう段上げできない）', fp: 0 };
    const target = a.t + 2; // 1 から数えた段の高さ（上げた後）
    const maxFp = 3 * target + 2;
    const cost = { gold: Math.round(20 * gp(item) * target), mats: { crystal: Math.ceil(target / 2) } };
    return { ok: true, fp: item.fp, fpMin: 1, fpMax: maxFp, crit: 5, from: af.tiers.length - a.t, to: af.tiers.length - a.t - 1, cost, missing: this.missing(cost), top };
  }

  tierUp(uid, idx) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.tierUpInfo(item, idx);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const rng = this.game.rng;
    const a = item.affixes[idx];
    const r = affixRoll(item, a);
    const crit = rng.chance(0.05);
    const used = crit ? 0 : rng.int(1, info.fpMax);
    item.fp = Math.max(0, item.fp - used);
    a.t = Math.min(info.top, a.t + (crit ? 2 : 1));
    setAffixValue(item, a, r);
    return this.done(f, { kind: 'tierUp', crit, used, tier: AFFIX[a.id].tiers.length - a.t });
  }

  // ---------------- 付け替え（1 行だけ）
  rerollInfo(item, idx) {
    const lock = this.lockReason(item);
    if (lock) return { ok: false, msg: lock };
    if (!item.affixes?.length) return { ok: false, msg: 'オプションの無い装備は付け替えられない' };
    if (item.rr && idx !== item.rr.i) return { ok: false, msg: `この装備は ${item.rr.i + 1} 行目だけ付け替えられる`, locked: item.rr.i };
    if (!item.affixes[idx]) return { ok: false, msg: 'オプションを選んでください' };
    const n = Math.min(REROLL_CAP, item.rr?.n || 0);
    const cost = { gold: Math.round(30 * gp(item) * 1.25 ** n), mats: { dust: Math.ceil(4 * 1.25 ** n) } };
    return { ok: true, count: item.rr?.n || 0, cost, missing: this.missing(cost), pending: item.rrPending || null, locked: item.rr?.i ?? null };
  }

  /** 候補を 2 つ作る（払う）。選ぶまで item.rrPending に残る */
  rerollRoll(uid, idx) {
    const f = this.find(uid);
    const item = f?.item;
    if (item?.rrPending) return { ok: false, msg: '先に候補から選んでください' };
    const info = this.rerollInfo(item, idx);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const rng = this.game.rng;
    const others = item.affixes.filter((_, i) => i !== idx);
    const haveIds = new Set(others.map((a) => a.id));
    const haveS = new Set(others.map((a) => a.s));
    const groups = new Set(others.map((a) => AFFIX[a.id]?.group).filter(Boolean));
    const pool = affixPool(BASE[item.base]).filter((a) => !haveIds.has(a.id) && !haveS.has(a.s) && !(a.group && groups.has(a.group)) && a.tiers[0][0] <= item.ilvl);
    const opts = [];
    const used = new Set();
    for (let k = 0; k < 2 && pool.length; k++) {
      const af = rng.weighted(pool.filter((x) => !used.has(x.id)), (x) => x.weight);
      if (!af) break;
      used.add(af.id);
      const made = this.makeAffix(af, item);
      if (made) opts.push(made);
    }
    item.rrPending = { i: idx, opts };
    item.rr = { i: idx, n: (item.rr?.n || 0) + 1 };
    this.game.events.emit('invChanged', {});
    return { ok: true, item, opts };
  }

  /** オプション 1 行を新しく作る（大いなるは付かない） */
  makeAffix(af, item) {
    const rng = this.game.rng;
    let s = af.s;
    if (s.includes('*')) s = lootHooks.dynStat ? lootHooks.dynStat(af, item, rng, this.ctx()) : null;
    if (!s) return null;
    const t = rollTier(rng, af, item.ilvl, 0.5);
    if (t === null) return null;
    return { id: af.id, s, t, v: rollAffixValue(rng, { ...af, s }, t, item.ilvl) };
  }

  /** k = 0/1 は候補、2 はそのまま */
  rerollChoose(uid, k) {
    const f = this.find(uid);
    const item = f?.item;
    const pend = item?.rrPending;
    if (!pend) return { ok: false, msg: '候補がない' };
    if (k >= 0 && k < pend.opts.length) item.affixes[pend.i] = pend.opts[k];
    delete item.rrPending;
    return this.done(f, { kind: 'reroll', chose: k });
  }

  // ---------------- 混沌（すべて振り直し）
  chaosInfo(item) {
    const lock = this.lockReason(item);
    if (lock) return { ok: false, msg: lock };
    if (item.rarity !== 'rare' && item.rarity !== 'epic') return { ok: false, msg: 'レア・エピックだけ' };
    if (item.rrPending) return { ok: false, msg: '付け替えの候補を先に選んでください' };
    const cost = { gold: Math.round(40 * gp(item)), mats: { chaos: 1, crystal: 2 } };
    return { ok: true, cost, missing: this.missing(cost), count: item.affixes.length };
  }

  chaos(uid) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.chaosInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const rng = this.game.rng;
    const n = item.affixes.length;
    item.affixes = [];
    const rr = RARITY[item.rarity];
    addAffixes(rng, item, n, { tierBias: rr.idx >= 3 ? 1.5 : 0.5, greaterChance: rr.idx >= 3 ? 0.06 : 0.015, ctx: this.ctx() });
    delete item.rr;
    if (lootHooks.rareName) item.name = lootHooks.rareName(rng, item);
    return this.done(f, { kind: 'chaos' });
  }

  // ---------------- 昇格
  ascendInfo(item) {
    const lock = this.lockReason(item);
    if (lock) return { ok: false, msg: lock };
    const next = { magic: 'rare', rare: 'epic' }[item.rarity];
    if (!next) return { ok: false, msg: 'マジックとレアだけ昇格できる' };
    if (item.rrPending) return { ok: false, msg: '付け替えの候補を先に選んでください' };
    const cost = next === 'rare' ? { gold: Math.round(30 * gp(item)), mats: { ascend: 1, crystal: 3 } } : { gold: Math.round(80 * gp(item)), mats: { ascend: 3, crystal: 8 } };
    const [lo, hi] = RARITY[next].affixes;
    return { ok: true, next, nextName: RARITY[next].name, cost, missing: this.missing(cost), add: [Math.max(1, lo - item.affixes.length), Math.max(1, hi - item.affixes.length)] };
  }

  ascend(uid) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.ascendInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const rng = this.game.rng;
    item.rarity = info.next;
    addAffixes(rng, item, rng.int(info.add[0], info.add[1]), { tierBias: info.next === 'epic' ? 1.5 : 0.5, greaterChance: info.next === 'epic' ? 0.06 : 0.015, ctx: this.ctx() });
    if (item.fp === undefined) item.fp = rng.int(20, 50);
    if (lootHooks.rareName) item.name = lootHooks.rareName(rng, item);
    return this.done(f, { kind: 'ascend', rarity: info.next });
  }

  // ---------------- 祝福（数値だけ）
  blessInfo(item) {
    const lock = this.lockReason(item);
    if (lock) return { ok: false, msg: lock };
    if (!item.affixes?.length && !item.fixed?.length) return { ok: false, msg: '振り直す数値が無い' };
    const cost = { gold: Math.round(15 * gp(item)), mats: { bless: 1, dust: 3 } };
    return { ok: true, cost, missing: this.missing(cost) };
  }

  bless(uid) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.blessInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const rng = this.game.rng;
    for (const a of item.affixes || []) setAffixValue(item, a, rng.next());
    const def = specialDef(item);
    if (def && item.fixed) for (const fx of item.fixed) { const m = def.mods?.[fx.i]; if (m) { fx.r = Math.round(rng.next() * 1000) / 1000; fx.v = fixedValue(m, fx.r, item.ilvl, !!fx.g); } }
    return this.done(f, { kind: 'bless' });
  }

  // ---------------- 穿孔
  drillInfo(item) {
    const lock = this.lockReason(item);
    if (lock) return { ok: false, msg: lock };
    if (item.rw) return { ok: false, msg: 'ルーン語の装備には開けられない' };
    const have = item.sockets?.length || 0;
    const max = socketMax(item);
    if (have >= max) return { ok: false, msg: `この部位はソケット ${max} つまで`, have, max };
    const cost = { gold: Math.round(50 * gp(item) * (have + 1)), mats: { drill: have + 1 } };
    return { ok: true, have, max, cost, missing: this.missing(cost) };
  }

  drill(uid) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.drillInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    item.sockets ||= [];
    item.sockets.push(null);
    return this.done(f, { kind: 'drill', sockets: item.sockets.length });
  }

  // ---------------- 堕落（最後の賭け）
  corruptInfo(item) {
    if (!item) return { ok: false, msg: '装備を選んでください' };
    if (item.corrupted) return { ok: false, msg: 'もう堕落している' };
    if (item.rrPending) return { ok: false, msg: '付け替えの候補を先に選んでください' };
    const cost = { mats: { abyssdrop: 1 } };
    return { ok: true, cost, missing: this.missing(cost), outcomes: CORRUPT_OUTCOMES.map((t) => ({ text: t, pct: 25 })) };
  }

  corrupt(uid) {
    const f = this.find(uid);
    const item = f?.item;
    const info = this.corruptInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const err = this.pay(info.cost);
    if (err) return { ok: false, msg: err };
    const rng = this.game.rng;
    const outcome = rng.int(0, 3);
    let detail = '';
    if (outcome === 1) {
      const m = rng.pick(CORRUPT_IMPLICITS[socketKind(item.slot)]);
      item.cimp = { ...m };
      detail = m.s;
    } else if (outcome === 2) {
      const lines = [...(item.affixes || []).map((a) => ({ a, kind: 'affix' })), ...(item.fixed || []).map((a) => ({ a, kind: 'fixed' }))];
      if (lines.length) {
        const { a } = rng.pick(lines);
        a.over = 1.3;
        a.v = Math.round(a.v * 1.3 * 10) / 10;
        detail = a.s;
      }
    } else if (outcome === 3) {
      if (item.affixes?.length) {
        const n = item.affixes.length;
        item.affixes = [];
        addAffixes(rng, item, n, { tierBias: 1, greaterChance: 0.05, ctx: this.ctx() });
      }
      const def = specialDef(item);
      if (def && item.fixed) for (const fx of item.fixed) { const m = def.mods?.[fx.i]; if (m) { fx.r = Math.round(rng.next() * 1000) / 1000; fx.v = fixedValue(m, fx.r, item.ilvl, !!fx.g); } }
      if (item.power) item.power.r = Math.round(rng.next() * 1000) / 1000;
    }
    item.corrupted = 1;
    delete item.rr;
    this.game.state.meta.crafting.corrupted++;
    return this.done(f, { kind: 'corrupt', outcome, outcomeText: CORRUPT_OUTCOMES[outcome], detail });
  }
}
