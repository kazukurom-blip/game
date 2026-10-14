// アイテム 1 つを扱う道具（数値・名前・効果の一覧）。生成は loot.js。
//
// アイテムの形（セーブされる）:
// { uid, base, slot, rarity, ilvl, q: 0|1|2（通常/太古/原初）,
//   affixes: [{ id, s, v, t, g? }]  … t は段階（0 が一番低い）、g は「大いなる」（数値 1.5 倍・★表示）
//   enh: 0, sockets: [gemKey|null...], uniqueId?, setId?, power?: { id, r }（伝説の力と強さ 0..1）,
//   name?（レアの名前）, locked?, isNew?, found, corrupted? }

import { BASE, AFFIX, baseSlotOf, SLOT_NAMES } from '../data/items.js';
import { RARITY, QUALITY } from '../data/rarity.js';
import { statDef } from '../data/stats.js';
import { P, BAL } from '../data/balance.js';
import { registry } from './registry.js';

export const baseOf = (item) => BASE[item.base];

/**
 * 読み込んだアイテムを検める（壊れたセーブ用）。使えない物は null。直せる所は直して同じ物を返す。
 * ベースが無い・形が違う → null。レアリティ・段階・強化・オプション・ソケット・伝説の力の形を整える。
 */
export function sanitizeItem(it) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
  const b = BASE[it.base];
  if (!b) return null;
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  if (typeof it.slot !== 'string' || it.slot !== b.slot) it.slot = b.slot;
  if (!RARITY[it.rarity]) it.rarity = 'common';
  it.ilvl = Math.round(num(it.ilvl, 1, 9999, 1));
  it.q = [0, 1, 2].includes(it.q) ? it.q : 0;
  it.enh = Math.round(num(it.enh, 0, 99, 0));
  it.affixes = Array.isArray(it.affixes) ? it.affixes.filter((a) => a && typeof a === 'object' && typeof a.s === 'string' && Number.isFinite(a.v)) : [];
  if (it.sockets !== undefined) it.sockets = Array.isArray(it.sockets) ? it.sockets.slice(0, 6).map((s) => (typeof s === 'string' ? s : null)) : [];
  if (it.power !== undefined && !(it.power && typeof it.power === 'object' && typeof it.power.id === 'string' && Number.isFinite(it.power.r))) delete it.power;
  for (const k of ['uniqueId', 'setId', 'pieceId', 'rw', 'name']) if (it[k] !== undefined && it[k] !== null && typeof it[k] !== 'string') delete it[k];
  if (it.lgl !== undefined && (typeof it.lgl !== 'object' || Array.isArray(it.lgl) || it.lgl === null)) delete it.lgl;
  if (!Number.isFinite(it.uid)) it.uid = 0; // 読み込みの後で新しい番号を振る
  return it;
}

/** 強化値（+N）による基本性能の倍率 */
export const enhMult = (enh) => 1 + 0.05 * enh + 0.0025 * enh * enh;

export function tierScale(base) { return 1 + 0.04 * ((base?.tier || 1) - 1); }

/** 武器の性能（強化・「武器ダメージ %」込み）。武器でなければ null */
export function weaponStats(item) {
  const b = baseOf(item);
  if (!b || !b.dmg || item.slot !== 'weapon') return null;
  const scale = P(item.ilvl) * tierScale(b) * enhMult(item.enh || 0) * (QUALITY[item.q || 0]?.mult ?? 1);
  let local = 0;
  for (const a of item.affixes || []) if (a.s === 'weapon_dmg') local += a.v;
  for (const m of registry.uniqueMods(item)) if (m.s === 'weapon_dmg') local += m.v;
  const mul = 1 + local / 100;
  return { min: b.dmg[0] * scale * mul, max: b.dmg[1] * scale * mul, aps: b.aps, kind: b.kind, range: b.range, twoHanded: b.twoHanded };
}

/** 副刀（offblade）のダメージ（二刀流の上乗せ） */
export function offhandDamage(item) {
  const b = baseOf(item);
  if (!b || !b.dmg || item.slot !== 'offhand') return 0;
  return ((b.dmg[0] + b.dmg[1]) / 2) * P(item.ilvl) * tierScale(b) * enhMult(item.enh || 0);
}

/** 防具のアーマー値 */
export function itemArmor(item) {
  const b = baseOf(item);
  if (!b || !b.armor) return 0;
  return b.armor * P(item.ilvl) * tierScale(b) * enhMult(item.enh || 0) * (QUALITY[item.q || 0]?.mult ?? 1);
}

/** 固有効果（implicit）を数値にしたもの */
export function implicitMods(item) {
  const b = baseOf(item);
  if (!b?.implicit) return [];
  const out = [];
  for (const m of b.implicit) {
    if (!m.v) continue;
    const d = statDef(m.s);
    const v = d.scale ? m.v * P(item.ilvl) : m.v * (1 + 0.1 * ((b.tier || 1) - 1));
    out.push({ s: m.s, v: d.kind === 'flat' && !d.scale ? Math.round(v) : v });
  }
  return out;
}

/** そのアイテムがキャラクターに与える効果のすべて（武器ダメージ・アーマー以外） */
export function itemMods(item) {
  const out = [];
  out.push(...implicitMods(item));
  const qm = QUALITY[item.q || 0]?.mult ?? 1;
  for (const a of item.affixes || []) {
    if (a.s === 'weapon_dmg' && item.slot === 'weapon') continue; // 武器の中だけで効く
    out.push({ s: a.s, v: a.v * qm });
  }
  const arm = itemArmor(item);
  if (arm) out.push({ s: 'armor', v: arm });
  const b = baseOf(item);
  if (b?.block && item.slot === 'offhand') out.push({ s: 'block', v: 0 }); // 盾のブロックは implicit で入る
  // ユニーク・セットの固定効果、ソケットの宝石、伝説の力の数値部分は登録先から
  out.push(...registry.uniqueMods(item).filter((m) => !(m.s === 'weapon_dmg' && item.slot === 'weapon')));
  out.push(...registry.socketMods(item));
  out.push(...registry.powerMods(item));
  return out;
}

export function rarityOf(item) { return RARITY[item.rarity] || RARITY.common; }

/** 表示名 */
export function itemName(item) {
  if (item.name) return item.name;
  const u = registry.uniqueName(item);
  if (u) return u;
  const b = baseOf(item);
  return b ? b.name : '???';
}

export function itemTypeLine(item) {
  const b = baseOf(item);
  if (!b) return '';
  const r = rarityOf(item);
  const qn = QUALITY[item.q || 0]?.name || '';
  return `${qn}${r.name}の${SLOT_NAMES[item.slot] || ''}`;
}

/** 必要レベル */
export function itemReq(item) {
  const b = baseOf(item);
  return Math.max(1, Math.min(BAL.MAX_LEVEL, Math.max(b?.req || 1, Math.floor((item.ilvl || 1) * (BAL.ITEM_REQ_PER_ILVL ?? 0.9)) - 2)));
}

/** ざっくりの強さ（並べ替え用）。本当の比較は character.js の compareItem を使う */
export function itemScore(item) {
  let s = (item.ilvl || 1) * 10 + rarityOf(item).idx * 60 + (item.q || 0) * 80 + (item.enh || 0) * 15;
  for (const a of item.affixes || []) s += (a.t + 1) * 6 + (a.g ? 20 : 0);
  return s;
}

export function canEquipSlot(item, equipSlot) {
  return baseSlotOf(equipSlot) === item.slot;
}

export function sellValue(item) {
  return Math.round(BAL.sellValue(item.ilvl || 1, rarityOf(item).idx) * (1 + (item.q || 0) * 0.5));
}
