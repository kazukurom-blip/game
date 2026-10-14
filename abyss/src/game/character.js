// 主人公の能力の計算。装備・パッシブ・転生などすべての効果を集めて、戦闘で使う数値（H）にする。
// 戦闘中の一時的な強化（バフ）は extraMods で渡す。

import { CLASS } from '../data/classes.js';
import { aggregate } from '../data/stats.js';
import { BAL, P } from '../data/balance.js';
import { SLOTS } from '../data/items.js';
import { itemMods, weaponStats, offhandDamage } from './items.js';
import { registry } from './registry.js';

const ATTRS = ['str', 'dex', 'int', 'vit'];

/** レベルでもらえる能力（1 レベルごと: 主能力 +3・体力 +2・その他 +1） */
export function levelAttrs(cls, level) {
  const c = CLASS[cls];
  const out = { str: level, dex: level, int: level, vit: level * 2 };
  out[c.primary] = level * 3;
  return out;
}

/** 素手のときの武器 */
function fists(level) {
  const s = P(level);
  return { min: 1.5 * s, max: 3 * s, aps: 1.25, kind: 'fist', range: 'melee' };
}

/**
 * 主人公の数値を計算する。
 * @param state  セーブの状態
 * @param game   Game（registry の関数に渡す。無くてもよい）
 * @param opts   { extraMods, equipOverride: { slot: item|null }, torment }
 */
export function computeHero(state, game = null, opts = {}) {
  const hero = state.hero;
  const cls = CLASS[hero.cls];
  const equip = { ...hero.equip, ...(opts.equipOverride || {}) };
  const mods = [];
  for (const m of cls.baseMods) mods.push({ ...m, src: 'class' });
  const la = levelAttrs(hero.cls, hero.level);
  for (const a of ATTRS) mods.push({ s: a, v: la[a], src: 'level' });
  for (const slot of SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    for (const m of itemMods(it)) mods.push({ ...m, src: slot });
  }
  // 両手武器なら副手は無効
  const w = equip.weapon ? weaponStats(equip.weapon) : null;
  if (w?.twoHanded && equip.offhand) {
    for (let i = mods.length - 1; i >= 0; i--) if (mods[i].src === 'offhand') mods.splice(i, 1);
  }
  mods.push(...registry.heroMods(state, game));
  if (opts.extraMods) mods.push(...opts.extraMods);

  const S = aggregate(mods);
  const g = (k) => S[k] || 0;

  const attrs = {};
  for (const a of ATTRS) attrs[a] = g(a) + g('all_attr');
  const primary = attrs[cls.primary];

  const weapon = w || fists(hero.level);
  let offDmg = 0;
  if (!w?.twoHanded && equip.offhand) offDmg = offhandDamage(equip.offhand);

  const addFlat = {};
  let addTotal = 0;
  for (const e of ['phys', 'fire', 'cold', 'lightning', 'poison', 'void']) { addFlat[e] = g(`add_${e}`); addTotal += addFlat[e]; }

  const torment = opts.torment ?? state.world?.torment ?? 0;
  const resPenalty = torment > 0 ? BAL.torment(torment).resPenalty : 0;
  const res = {};
  for (const e of ['fire', 'cold', 'lightning', 'poison']) res[e] = Math.min(BAL.RES_CAP, g(`res_${e}`) + g('res_all') + attrs.int * BAL.INT_RES_PER_POINT - resPenalty);
  res.void = Math.min(BAL.RES_CAP, g('res_void') - resPenalty);
  res.phys = 0;

  const life = (BAL.heroBaseLife(hero.level) + g('life')) * (1 + (g('inc_life') + attrs.vit * BAL.VIT_LIFE_PER_POINT) / 100);
  const armor = Math.max(0, g('armor') * (1 + (g('inc_armor') + attrs.str * BAL.STR_ARMOR_PER_POINT) / 100));
  const aps = weapon.aps * (1 + g('attack_speed') / 100) * (offDmg > 0 ? 1.1 : 1);

  const H = {
    cls: hero.cls,
    level: hero.level,
    S,
    mods,
    attrs,
    primary,
    weapon: { ...weapon, min: weapon.min + offDmg * 0.5, max: weapon.max + offDmg * 0.5 },
    addFlat,
    addTotal,
    life: Math.max(1, life),
    lifeRegen: g('life_regen') + life * (BAL.BASE_LIFE_REGEN_PCT + g('life_regen_pct')) / 100,
    lifeOnHit: g('life_on_hit'),
    lifeOnKill: g('life_on_kill'),
    leech: g('leech') / 100,
    armor,
    res,
    dodge: Math.min(BAL.DODGE_CAP, g('dodge') + attrs.dex * BAL.DEX_DODGE_PER_POINT) / 100,
    block: Math.min(BAL.BLOCK_CAP, g('block')) / 100,
    dr: Math.min(0.9, g('dr') / 100),
    thorns: g('thorns'),
    aps,
    critChance: Math.min(BAL.CRIT_CAP, BAL.BASE_CRIT + g('crit_chance')) / 100,
    critMult: 1 + (BAL.BASE_CRIT_DMG + g('crit_damage')) / 100,
    incBase: g('inc_dmg') + primary * BAL.PRIMARY_DMG_PER_POINT,
    more: 1 + g('more_dmg') / 100,
    multistrike: Math.min(100, g('multistrike')) / 100,
    area: 1 + g('area') / 100,
    projCount: Math.floor(g('proj_count')),
    pierce: Math.floor(g('pierce')),
    chain: Math.floor(g('chain')),
    cdr: Math.min(BAL.CDR_CAP, g('cdr')) / 100,
    costRed: Math.min(BAL.COST_CAP, g('cost_red')) / 100,
    resPen: g('res_pen'),
    dmgElite: g('dmg_elite'),
    dmgBoss: g('dmg_boss'),
    dmgLow: g('dmg_vs_low'),
    status: {
      ignite: g('ignite_chance') / 100, freeze: g('freeze_chance') / 100, shock: g('shock_chance') / 100, poison: g('poison_chance') / 100, bleed: g('bleed_chance') / 100,
    },
    statusDmg: 1 + g('status_dmg') / 100,
    resourceMax: cls.resource.max + g('max_resource'),
    resourceRegen: cls.resource.regen * (cls.resource.regen > 0 ? 1 + g('resource_regen') / 100 : 1),
    resourceOnHit: cls.resource.onHit + g('resource_on_hit'),
    move: BAL.BASE_MOVE * (1 + Math.min(BAL.MOVE_CAP, g('move_speed')) / 100),
    gold: g('gold_find'),
    mf: g('magic_find'),
    quantity: g('item_quantity'),
    xp: g('xp_bonus'),
    matFind: g('mat_find'),
    offline: g('offline_gain'),
    minionLife: 1 + g('minion_life') / 100,
    minionCount: Math.floor(g('minion_count')),
    minionAs: 1 + g('minion_as') / 100,
    skillLvlAll: Math.floor(g('skill_lvl')),
    torment,
  };
  return H;
}

/** スキルの実際のレベル（振ったレベル + 装備のボーナス） */
export function skillLevel(state, H, skillId) {
  const base = state.hero.skills[skillId]?.lvl || 0;
  if (base <= 0) return 0;
  return base + (H.skillLvlAll || 0) + Math.floor(H.S[`skill_lvl:${skillId}`] || 0);
}

/** その属性・タグのダメージ増加の合計（%） */
export function incFor(H, element, tags = [], skillId = null) {
  let inc = H.incBase + (H.S[`inc_${element}`] || 0);
  if (element === 'fire' || element === 'cold' || element === 'lightning') inc += H.S.inc_elemental || 0;
  for (const t of tags) inc += H.S[`inc_${t}`] || 0;
  if (skillId) inc += H.S[`skill_dmg:${skillId}`] || 0;
  return inc;
}

/** アーマーによる軽減の割合（敵のレベル L に対して） */
export function armorReduction(armor, L) {
  return Math.min(BAL.ARMOR_CAP, armor / (armor + BAL.ARMOR_K * P(L)));
}

/** ざっくりの耐久力（同じレベルの敵の攻撃に対して何回耐えるか × ライフ） */
export function effectiveLife(H, L = H.level) {
  const ar = armorReduction(H.armor, L);
  const avgRes = (H.res.fire + H.res.cold + H.res.lightning + H.res.poison) / 4 / 100;
  const physShare = 0.6;
  const taken = (physShare * (1 - ar) + (1 - physShare) * (1 - Math.max(-1, avgRes))) * (1 - H.dr) * (1 - H.dodge) * (1 - H.block * BAL.BLOCK_REDUCE);
  return H.life / Math.max(0.02, taken);
}
