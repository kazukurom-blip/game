// アイテムの道具（ユニークの固定オプション・ソケットの中身・強化のボーナス・原初の最大値など）。
// ドロップ（loot.js）とクラフト（crafting.js）・宝石（gems.js）の両方から使う。

import { BASES, BASE, AFFIX, TIER_REQ, SOCKET_MAX, socketKind, WEAPON_KINDS, OFFHAND_KINDS } from '../../../data/items.js';
import { UNIQUE, MYTHIC, SET_PIECE } from '../../../data/uniques.js';
import { GEM, GEM_TIER_LEVEL, GEM_TIER_MULT, GEM_TIER_NAMES, RUNE, runeLevel, RUNEWORD, LEGENDARY_GEM } from '../../../data/gems.js';
import { CLASS } from '../../../data/classes.js';
import { statDef } from '../../../data/stats.js';
import { P } from '../../../data/balance.js';
import { QUALITY } from '../../../data/rarity.js';

/** ユニークの % の数値がアイテムレベルで変わる倍率（アイテムレベル 90 で 1.0） */
export const uniqueScale = (ilvl) => Math.max(0.4, Math.min(1.25, 0.4 + (0.6 * ilvl) / 90));

/** 固定のオプション 1 行の数値（r は 0..1 のロール） */
export function fixedValue(mod, r, ilvl, greater = false) {
  const d = statDef(mod.s);
  let v = mod.min + (mod.max - mod.min) * r;
  v *= d.scale ? P(ilvl) : uniqueScale(ilvl);
  if (greater) v *= 1.5;
  if (d.kind === 'flat' && !d.scale) return Math.max(1, Math.round(v));
  return Math.round(v * 10) / 10;
}

/** 固定のオプションを振る。o: { primal, greater } */
export function rollFixed(rng, mods, ilvl, o = {}) {
  return (mods || []).map((m, i) => {
    const r = o.primal ? 1 : rng.next();
    return { s: m.s, v: fixedValue(m, r, ilvl, o.greater), r: Math.round(r * 1000) / 1000, i, ...(o.greater ? { g: 1 } : {}) };
  });
}

/** アイテムの特別な定義（ユニーク / ミシック / セットの部品） */
export function specialDef(item) {
  if (!item?.uniqueId) return null;
  return UNIQUE[item.uniqueId] || MYTHIC[item.uniqueId] || SET_PIECE[item.uniqueId]?.piece || null;
}

/** ベースの指定（'sword' / 'helm.plate' / 'amulet' / 'any'）から、アイテムレベルに合うベースを選ぶ */
export function baseFor(rng, spec, slot, ilvl, cls = null, cur = null) {
  let maxTier = 1;
  for (let t = 1; t <= TIER_REQ.length; t++) if (TIER_REQ[t - 1] <= ilvl) maxTier = t;
  const tier = Math.max(1, maxTier - (rng.chance(0.35) ? 1 : 0));
  let kind = spec; let style = null;
  if (spec && spec.includes('.')) [kind, style] = spec.split('.');
  if (spec === 'any' || !spec) {
    // クラスに合う種類（武器・副手）。防具は今のベースのスタイルを残す
    if (slot === 'weapon' || slot === 'offhand') {
      const c = cls ? CLASS[cls] : null;
      const kinds = c ? (slot === 'weapon' ? c.weapons : c.offhands) : (slot === 'weapon' ? WEAPON_KINDS : OFFHAND_KINDS);
      const curB = cur ? BASE[cur.base] : null;
      kind = curB && kinds.includes(curB.kind) ? curB.kind : rng.pick(kinds);
    } else {
      kind = slot === 'ring' ? 'ring' : slot === 'amulet' ? 'amulet' : slot;
      const curB = cur ? BASE[cur.base] : null;
      style = curB?.style || (c0(cls)?.armorPref?.[0]) || 'plate';
    }
  }
  const pick = BASES.find((b) => b.kind === kind && b.tier === tier && (!style || b.style === style))
    || BASES.find((b) => b.kind === kind && (!style || b.style === style));
  return pick || null;
}
const c0 = (cls) => (cls ? CLASS[cls] : null);

// ---------------- ソケット
/** ソケットの中身を読む → { type: 'gem'|'rune'|'lgem', id, tier?, def } | null */
export function parseSocket(key) {
  if (!key) return null;
  if (key.startsWith('lg:')) { const id = key.slice(3); return LEGENDARY_GEM[id] ? { type: 'lgem', id, def: LEGENDARY_GEM[id] } : null; }
  if (key.startsWith('r:')) { const id = key.slice(2); return RUNE[id] ? { type: 'rune', id, def: RUNE[id] } : null; }
  const i = key.lastIndexOf('_');
  const id = key.slice(0, i); const tier = Number(key.slice(i + 1));
  return GEM[id] && tier >= 1 ? { type: 'gem', id, tier, def: GEM[id] } : null;
}

export const gemKey = (id, tier) => `${id}_${tier}`;
export const gemName = (id, tier) => `${GEM_TIER_NAMES[tier - 1] || ''}${GEM[id]?.name || id}`;
export const runeName = (id) => `${RUNE[id]?.name || id}のルーン`;

/** 宝石 1 つの効果（はめた場所の種類 kind = weapon/armor/jewelry） */
export function gemMod(id, tier, kind) {
  const g = GEM[id];
  if (!g) return null;
  const e = g[kind];
  const d = statDef(e.s);
  const v = d.scale ? e.base * P(GEM_TIER_LEVEL[tier - 1]) : e.base * GEM_TIER_MULT[tier - 1];
  return { s: e.s, v: Math.round(v * 10) / 10 };
}
/** ルーン 1 つの効果 */
export function runeMod(id, kind) {
  const r = RUNE[id];
  if (!r) return null;
  const e = r[kind];
  const d = statDef(e.s);
  return { s: e.s, v: d.scale ? Math.round(e.v * P(runeLevel(r)) * 10) / 10 : e.v };
}

/** ソケットの効果の一覧（深淵の宝石の数値は gems 側で別に足す） */
export function socketModsOf(item, lgemLevel = null) {
  const out = [];
  if (!item.sockets?.length) return out;
  const kind = socketKind(item.slot);
  for (const key of item.sockets) {
    const s = parseSocket(key);
    if (!s) continue;
    if (s.type === 'gem') { const m = gemMod(s.id, s.tier, kind); if (m) out.push(m); } else if (s.type === 'rune') { const m = runeMod(s.id, kind); if (m) out.push(m); } else if (s.type === 'lgem' && lgemLevel) {
      const lv = lgemLevel(s.id);
      if (lv) { const pw = s.def.power; out.push({ lgem: pw, lvl: lv }); }
    }
  }
  return out;
}

/** その部位で開けられるソケットの上限 */
export const socketMax = (item) => SOCKET_MAX[item.slot] ?? 1;

// ---------------- 強化
/** 強化 +N のオプションへのボーナス（%）: 1 段 0.5%、+10 と +20 でさらに 5% ずつ */
export function enhBonusPct(enh) {
  if (!enh) return 0;
  return enh * 0.5 + (enh >= 10 ? 5 : 0) + (enh >= 20 ? 5 : 0);
}

// ---------------- オプション
/** そのアイテムレベルで出せる一番上の段 */
export function topTier(affix, ilvl) {
  let t = 0;
  affix.tiers.forEach((row, i) => { if (row[0] <= ilvl) t = i; });
  return t;
}
/** 段の中の位置 r（0..1）からオプションの値を作る */
export function affixValueAt(affix, t, r, ilvl, greater = false, s = affix.s) {
  const [, min, max] = affix.tiers[t];
  const d = statDef(s.includes('*') ? s.replace('*', 'x') : s);
  let v = min + (max - min) * r;
  if (d.scale) v *= P(ilvl);
  if (greater) v *= 1.5;
  if (d.kind === 'flat' && !d.scale) return Math.max(1, Math.round(v));
  return Math.round(v * 10) / 10;
}
/** 今の値が段の中でどのあたりか（0..1） */
export function affixRoll(item, a) {
  const af = AFFIX[a.id];
  if (!af) return 0;
  const [, min, max] = af.tiers[a.t] || af.tiers[0];
  const d = statDef(a.s);
  let v = a.v;
  if (a.g) v /= 1.5;
  if (a.over) v /= a.over;
  if (d.scale) v /= P(item.ilvl);
  if (max <= min) return 1;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}
/** オプションの値を正しく作り直す（段・ロール・大いなる・上限超え） */
export function setAffixValue(item, a, r) {
  const af = AFFIX[a.id];
  if (!af) return;
  let v = affixValueAt(af, a.t, r, item.ilvl, !!a.g, a.s);
  if (a.over) v = Math.round(v * a.over * 10) / 10;
  a.v = v;
}

/** 原初: すべてのオプションを、そのアイテムレベルの一番上の段の最大値にする */
export function makePrimal(item) {
  for (const a of item.affixes || []) {
    const af = AFFIX[a.id];
    if (!af) continue;
    a.t = topTier(af, item.ilvl);
    setAffixValue(item, a, 1);
  }
  const def = specialDef(item);
  if (def && item.fixed) for (const f of item.fixed) { const m = def.mods?.[f.i]; if (m) { f.r = 1; f.v = fixedValue(m, 1, item.ilvl, !!f.g); } }
  if (item.power) item.power.r = 1;
}

/** 品質（太古・原初）の倍率 */
export const qualityMult = (item) => QUALITY[item.q || 0]?.mult ?? 1;

/**
 * 説明に出すオプション・固定のオプションの数（品質の倍率と強化のボーナス込み）。
 * 実際に効く数（itemMods = 値 × 品質 ＋ 強化のボーナス）と同じになる。v は保存された値（a.v / f.v）
 */
export function shownValue(item, v) {
  return v * qualityMult(item) * (1 + enhBonusPct(item.enh || 0) / 100);
}

/** ルーン語の固定の効果 */
export function runewordMods(item) {
  const rw = item.rw ? RUNEWORD[item.rw] : null;
  if (!rw) return [];
  return rw.mods.map((m) => { const d = statDef(m.s); return { s: m.s, v: d.scale ? Math.round(m.v * P(item.ilvl) * 10) / 10 : m.v }; });
}

export { BASE, AFFIX };
