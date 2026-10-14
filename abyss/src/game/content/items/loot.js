// ドロップの仕上げ（lootHooks）と、アイテムの効果の登録（registry）。
//   makeSpecial … ユニーク / セット / ミシックを作る（部位・アイテムレベル・クラス 80% のスマートドロップ）
//   addPower    … レジェンダリーに伝説の力を付ける（部位とクラスで山を分ける）
//   finish      … ソケット（武器 0〜3・胴/頭/脚 0〜2・ほか 0〜1）・鍛造値（レア以上 20〜50）・原初の最大値
//   rareName    … レアの名前（2 つの言葉）
//   dynStat     … 「スキル指定」のオプションのスキルを選ぶ

import { lootHooks, addAffixes } from '../../loot.js';
import { registry } from '../../registry.js';
import { invHooks } from '../../systems/inventory.js';
import { BASE, SLOTS, AFFIX, baseSlotOf } from '../../../data/items.js';
import { UNIQUES, UNIQUE, MYTHICS, MYTHIC, SETS, SET, SET_PIECE } from '../../../data/uniques.js';
import { RUNEWORD } from '../../../data/gems.js';
import { CLASS } from '../../../data/classes.js';
import { SKILLS } from '../../../data/skills.js';
import { RARITY } from '../../../data/rarity.js';
import { SALVAGE_BONUS } from '../../../data/materials.js';
import { weaponStats } from '../../items.js';
import { POOLS } from './powerlib.js';
import { ensureSkillPowers } from './powers.js';
import './uniquePowers.js';
import { rareName } from './names.js';
import {
  rollFixed, baseFor, specialDef, makePrimal, qualityMult, enhBonusPct, socketModsOf, runewordMods, socketMax,
} from './itemlib.js';

const SMART = 0.8; // クラスに合う物が出る確率

function classOk(def, cls) {
  if (!cls) return true;
  if (def.cls) return def.cls === cls;
  const kind = def.base?.split('.')[0];
  const c = CLASS[cls];
  if (def.slot === 'weapon' && kind !== 'any') return c.weapons.includes(kind);
  if (def.slot === 'offhand' && kind !== 'any') return c.offhands.includes(kind);
  return true;
}

/**
 * 候補から 1 つ選ぶ（同じ部位を優先・クラスに合う物を 80%）。
 * strictSlot … 部位を必ず守る（商人の目利きのように部位を選んで買うとき）。その部位に候補が無ければ null
 */
function pickDef(rng, list, slot, ilvl, cls, { ignoreReq = false, strictSlot = false } = {}) {
  const okLvl = list.filter((d) => ignoreReq || (d.req || 1) <= ilvl);
  if (!okLvl.length) return null;
  const sameSlot = okLvl.filter((d) => d.slot === slot);
  if (strictSlot && !sameSlot.length) return null;
  let pool = sameSlot.length ? sameSlot : okLvl;
  if (cls && rng.chance(SMART)) {
    const smart = pool.filter((d) => classOk(d, cls));
    if (smart.length) pool = smart;
    else if (!strictSlot) { const any = okLvl.filter((d) => classOk(d, cls)); if (any.length) pool = any; }
  }
  return rng.weighted(pool, (d) => d.weight || 1);
}

/** セットの部品を選ぶ */
function pickSetPiece(rng, slot, ilvl, cls, o = {}) {
  const all = [];
  for (const s of SETS) for (const p of s.pieces) all.push({ ...p, set: s, cls: s.cls, req: 10 });
  const d = pickDef(rng, all, slot, ilvl, cls, o);
  return d ? { set: d.set, piece: SET_PIECE[d.id].piece } : null;
}

/** item をユニーク / ミシック / セットの部品にする（opts: { def, piece } で決め打ちもできる） */
export function makeSpecialItem(rng, item, kind, ctx = {}) {
  const opts = ctx.opts || {};
  const cls = opts.cls || null;
  const ilvl = item.ilvl;
  const primal = item.q === 2;
  // 部位を指定して作る（商人の目利き）ときは、その部位の物だけ。無ければ null → 同じ部位のレジェンダリーになる
  const strictSlot = !!opts.slot;
  if (kind === 'set') {
    const sp = opts.piece ? { set: SET_PIECE[opts.piece].set, piece: SET_PIECE[opts.piece].piece } : pickSetPiece(rng, item.slot, ilvl, cls, { strictSlot });
    if (!sp) return null;
    const b = baseFor(rng, sp.piece.base, sp.piece.slot, ilvl, cls, item);
    if (!b) return null;
    Object.assign(item, { base: b.id, slot: b.slot, rarity: 'set', uniqueId: sp.piece.id, setId: sp.set.id });
    item.fixed = rollFixed(rng, sp.piece.mods, ilvl, { primal });
    item.affixes = [];
    addAffixes(rng, item, 3, { tierBias: 1, greaterChance: 0.04, ctx });
    return item;
  }
  const list = kind === 'mythic' ? MYTHICS : UNIQUES;
  const def = opts.def ? (UNIQUE[opts.def] || MYTHIC[opts.def]) : pickDef(rng, list, item.slot, ilvl, cls, { ignoreReq: kind === 'mythic' && opts.anyReq, strictSlot });
  if (!def) return null;
  const b = baseFor(rng, def.base, def.slot, ilvl, cls, item.slot === def.slot ? item : null);
  if (!b) return null;
  Object.assign(item, { base: b.id, slot: b.slot, rarity: kind, uniqueId: def.id });
  item.fixed = rollFixed(rng, def.mods, ilvl, { primal, greater: kind === 'mythic' });
  item.affixes = [];
  if (def.power) item.power = { id: def.power, r: primal ? 1 : Math.round(rng.next() * 1000) / 1000 };
  return item;
}

/** レジェンダリーの力を選ぶ（部位とクラスで山を分ける） */
export function pickPower(rng, slot, cls, { exclude = null } = {}) {
  ensureSkillPowers();
  const defs = POOLS.legendary.map((id) => registry.power(id)).filter((d) => d && d.slots.includes(slot) && d.id !== exclude);
  let pool = defs;
  if (cls && rng.chance(SMART)) {
    const smart = defs.filter((d) => !d.cls || d.cls === cls);
    if (smart.length) pool = smart;
    return rng.weighted(pool, (d) => (d.cls === cls ? (d.skill ? 1.2 : 2.5) : 1));
  }
  return rng.weighted(pool, (d) => (d.skill ? 0.4 : 1));
}

lootHooks.makeSpecial = (item, ctx) => makeSpecialItem(ctx.rng, item, item.rarity, ctx);

lootHooks.addPower = (item, ctx) => {
  const d = pickPower(ctx.rng, item.slot, ctx.opts?.cls);
  if (!d) return;
  item.power = { id: d.id, r: item.q === 2 ? 1 : Math.round(ctx.rng.next() * 1000) / 1000 };
  item.name = legendaryName(item, d);
};

/** レジェンダリーの名前: 「力の名前」の「ベースの呼び名」（例: 群れ崩しの指輪） */
export function legendaryName(item, def) {
  const b = BASE[item.base];
  if (!b || !def) return null;
  const i = b.name.lastIndexOf('の');
  const noun = i >= 0 && i < b.name.length - 1 ? b.name.slice(i + 1) : b.name;
  return `${def.name}の${noun}`;
}

lootHooks.rareName = (rng, item) => rareName(rng, item);

/** スキル指定のオプション: クラスのスキルを 80%、それ以外をたまに */
lootHooks.dynStat = (affix, item, rng, ctx) => {
  ensureSkillPowers();
  const pre = affix.s.split(':')[0];
  const cls = ctx?.opts?.cls;
  let list = SKILLS;
  if (cls && rng.chance(SMART)) list = SKILLS.filter((s) => s.cls === cls);
  // レベル指定は基本攻撃以外を優先
  if (pre === 'skill_lvl' || pre === 'skill_cdr') { const nb = list.filter((s) => !s.basic && (pre !== 'skill_cdr' || (s.cd || 0) > 0)); if (nb.length) list = nb; }
  const s = rng.pick(list);
  return s ? `${pre}:${s.id}` : null;
};

/** ソケットの数を振る（レアリティが高いほど多い） */
const SOCKET_P = { common: 0.3, magic: 0.18, rare: 0.25, epic: 0.35, legendary: 0.45, set: 0.4, unique: 0.4, mythic: 0.6 };
export function rollSockets(rng, item) {
  const max = socketMax(item);
  let p = SOCKET_P[item.rarity] ?? 0.2;
  if (item.slot === 'weapon') p += 0.1;
  let n = 0;
  while (n < max && rng.chance(p)) { n++; p *= 0.55; }
  return n;
}

lootHooks.finish.push((item, ctx) => {
  const rng = ctx.rng;
  if (ctx.opts?.noSockets !== true && !(item.sockets?.length)) {
    const k = rollSockets(rng, item);
    item.sockets = k ? new Array(k).fill(null) : [];
  }
  const idx = RARITY[item.rarity]?.idx || 0;
  if (idx >= 2 && item.fp === undefined) item.fp = item.rarity === 'mythic' ? 50 : rng.int(20, 50);
  if (item.q === 2) makePrimal(item);
});

// ---------------- 名前・効果の登録
registry.provide('uniqueName', (item) => {
  if (item.rw) return RUNEWORD[item.rw]?.name || null;
  return specialDef(item)?.name || null;
});

/** 固定のオプション・ルーン語・強化のボーナス・堕落の内在 */
registry.provide('uniqueMods', (item) => {
  const out = [];
  const qm = qualityMult(item);
  if (item.fixed) for (const f of item.fixed) out.push({ s: f.s, v: f.v * qm });
  if (item.rw) out.push(...runewordMods(item));
  const bonus = enhBonusPct(item.enh || 0);
  if (bonus > 0) {
    for (const a of item.affixes || []) out.push({ s: a.s, v: a.v * qm * bonus / 100 });
    if (item.fixed) for (const f of item.fixed) out.push({ s: f.s, v: f.v * qm * bonus / 100 });
  }
  if (item.cimp) out.push({ s: item.cimp.s, v: item.cimp.v });
  return out;
});

registry.provide('socketMods', (item) => {
  const out = [];
  // 深淵の宝石のレベルはアイテムの lgl に写してある（gems.js が更新する）
  for (const m of socketModsOf(item, (id) => item.lgl?.[id] || 0)) {
    if (m.lgem) { const d = registry.power(m.lgem); if (d?.mods) out.push(...d.mods(m.lvl)); } else out.push(m);
  }
  return out;
});

registry.provide('powerMods', (item) => {
  if (!item.power) return [];
  const d = registry.power(item.power.id);
  if (!d?.mods) return [];
  return d.mods(registry.powerValue(d.id, item.power.r)) || [];
});

/** 今着けている装備（両手武器なら副手は無効） */
export function activeEquip(state) {
  const eq = state.hero.equip || {};
  const two = eq.weapon && weaponStats(eq.weapon)?.twoHanded;
  const out = [];
  for (const s of SLOTS) { const it = eq[s]; if (it && !(two && s === 'offhand')) out.push(it); }
  return out;
}

// 装備の伝説の力・ユニークの力・深淵の宝石
registry.addPowerSource('items', (state) => {
  const out = [];
  for (const it of activeEquip(state)) {
    if (it.power) out.push({ id: it.power.id, v: registry.powerValue(it.power.id, it.power.r), src: it.slot, uid: it.uid });
    if (it.sockets?.length) {
      for (const key of it.sockets) {
        if (!key || !key.startsWith('lg:')) continue;
        const id = key.slice(3);
        const lv = it.lgl?.[id] || 0;
        const def = registry.power(`lgp_${id}`);
        if (def && lv > 0) out.push({ id: def.id, v: lv, src: 'lgem' });
      }
    }
  }
  return out;
});

/** 着けているセットの部品の数 { setId: 数 }（同じ部品は 1 つと数える） */
export function setCounts(state) {
  const seen = {};
  for (const it of activeEquip(state)) {
    if (!it.setId || !it.uniqueId) continue;
    (seen[it.setId] ||= new Set()).add(it.uniqueId);
  }
  const out = {};
  for (const k in seen) out[k] = seen[k].size;
  return out;
}

/** 効いているセット効果 → [{ set, need, bonus }] */
export function activeSetBonuses(state) {
  const counts = setCounts(state);
  const out = [];
  for (const id in counts) {
    const s = SET[id];
    if (!s) continue;
    for (const k of Object.keys(s.bonus).map(Number).sort((a, b) => a - b)) if (counts[id] >= k) out.push({ set: s, need: k, bonus: s.bonus[k] });
  }
  return out;
}

registry.addHeroSource('sets', (state) => {
  const out = [];
  for (const b of activeSetBonuses(state)) for (const m of b.bonus.mods || []) out.push({ s: m.s, v: m.v, src: 'set' });
  for (const b of activeSetBonuses(state)) {
    const p = b.bonus.power ? registry.power(b.bonus.power.id) : null;
    if (p?.mods) out.push(...p.mods(b.bonus.power.v).map((m) => ({ ...m, src: 'set' })));
  }
  return out;
});
registry.addPowerSource('sets', (state) => activeSetBonuses(state).filter((b) => b.bonus.power).map((b) => ({ id: b.bonus.power.id, v: b.bonus.power.v, src: 'set' })));

// ---------------- 自動の振り分け（拾ったとき）の細かい規則
/** 振り分けの設定の既定値（古いセーブにも足す） */
export const FILTER_DEFAULTS = { preset: 'L2', keepAncient: true, keepSpecial: true, keepSocketWhite: true, keepPowers: [], wantStats: [], wantMin: 2 };
export function ensureFilter(state) {
  const f = (state.inv.filter ||= {});
  f.autoSalvage ||= { common: true, magic: true, rare: false, epic: false, legendary: false, set: false, unique: false, mythic: false };
  for (const [k, v] of Object.entries(FILTER_DEFAULTS)) if (f[k] === undefined) f[k] = Array.isArray(v) ? [...v] : v;
  if (typeof f.keepUpgrades !== 'boolean') f.keepUpgrades = true;
  if (typeof f.autoEquip !== 'boolean') f.autoEquip = false;
  return f;
}
/** ルーン語に使えるソケットの数（部位ごと） */
export const RW_SOCKETS = {};
for (const rw of Object.values(RUNEWORD)) for (const s of rw.slots) (RW_SOCKETS[s] ||= new Set()).add(rw.runes.length);

invHooks.keepRules.push((game, item, keep) => {
  const f = game.state.inv.filter;
  if (keep) return null;
  if (f.keepSpecial !== false && (item.rarity === 'unique' || item.rarity === 'set' || item.rarity === 'mythic')) return true;
  if (f.keepAncient !== false && (item.q || 0) >= 1) return true;
  if (f.keepSocketWhite !== false && item.rarity === 'common' && RW_SOCKETS[item.slot]?.has(item.sockets?.length || 0)) return true;
  if (item.power && f.keepPowers?.includes(item.power.id)) return true;
  return null;
});

// ---------------- 持ち物のフック
invHooks.onFound.push((game, item) => {
  const col = game.state.meta.collection;
  if (!col) return;
  if (item.rarity === 'unique' && item.uniqueId) col.uniques[item.uniqueId] = (col.uniques[item.uniqueId] || 0) + 1;
  if (item.rarity === 'mythic' && item.uniqueId) col.mythics[item.uniqueId] = (col.mythics[item.uniqueId] || 0) + 1;
  if (item.rarity === 'set' && item.uniqueId) col.sets[item.uniqueId] = (col.sets[item.uniqueId] || 0) + 1;
  if (item.power && item.rarity === 'legendary') col.powers[item.power.id] = (col.powers[item.power.id] || 0) + 1;
});

invHooks.salvageExtra.push((game, item, out) => {
  const rng = game.rng;
  for (const [id, p] of SALVAGE_BONUS[item.rarity] || []) if (rng.chance(p)) out[id] = (out[id] || 0) + 1;
  // 残響の鈴（装備の力）
  if ((RARITY[item.rarity]?.idx || 0) >= 4) {
    const pw = game.combat?.powers?.find((x) => x.id === 'pw_u_echo');
    if (pw && rng.chance(pw.v / 100)) out.echo = (out.echo || 0) + 1;
  }
  // はまっていた宝石・ルーンは戻る（深淵の宝石も）
  if (item.sockets?.length) game.sys.gems?.returnSockets?.(item, out); // ルーン語の装備は深淵の宝石だけ外れる（returnSockets が見分ける）
});

export { baseSlotOf, AFFIX, BASE };
