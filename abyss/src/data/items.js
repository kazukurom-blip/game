// 装備の土台（ベース）とオプション（アフィックス）。
//
// 部位（SLOTS）: weapon offhand helm chest gloves belt legs boots amulet ring1 ring2
// ベースの形:
// { id, slot, kind, name, tier, req, dmg:[min,max], aps, twoHanded, armor, block,
//   implicit: [{ s, v }],  … 固有の効果（scale のある能力は P(ilvl) で伸びる）
//   art: 'gear.<kind>' … 見た目の差し替え枠（装備したときの姿）
//   icon: 'icon.item.<kind>' … 持ち物の絵
// }
// dmg・armor・implicit の scale 値は「Lv1 での値」。アイテムの数値 = 値 × P(ilvl) × (1 + 0.04 × (tier-1))

import { registerStat } from './stats.js';

export const SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'amulet', 'ring1', 'ring2'];
export const SLOT_NAMES = { weapon: '武器', offhand: '副手', helm: '頭', chest: '胴', gloves: '手', belt: '腰', legs: '脚', boots: '足', amulet: '首飾り', ring1: '指輪', ring2: '指輪', ring: '指輪' };
// ベースの slot（ring は ring1/ring2 のどちらにも着けられる）
export const baseSlotOf = (equipSlot) => (equipSlot === 'ring1' || equipSlot === 'ring2' ? 'ring' : equipSlot);

export const KIND_NAMES = {
  sword: '片手剣', axe: '斧', mace: '槌', greatsword: '両手剣', bow: '弓', crossbow: '弩', staff: '杖', wand: '短杖', scythe: '大鎌', rod: '骨杖', dagger: '短剣', claw: '鉤爪',
  shield: '盾', quiver: '矢筒', orb: '宝珠', grimoire: '魔導書', offblade: '副刀',
  helm: '兜', chest: '鎧', gloves: '手甲', belt: '帯', legs: '脚甲', boots: '靴', amulet: '首飾り', ring: '指輪',
};
export const ARMOR_STYLES = ['cloth', 'leather', 'mail', 'plate'];
export const STYLE_NAMES = { cloth: '布', leather: '革', mail: '鎖', plate: '板金' };

// 段階ごとの必要レベル（ベースの tier 1〜11）
export const TIER_REQ = [1, 8, 16, 25, 35, 45, 55, 65, 75, 85, 95];

// 名前の段階（素材）
const MAT_W = ['錆びた', '鉄の', '鋼の', '銀の', '黒鉄の', 'ミスリルの', '竜骨の', '星鋼の', '魔晶の', '天鉄の', '深淵の'];
const MAT_C = ['粗末な', '亜麻の', '絹の', '魔糸の', '月光の', '星織りの', '霊布の', '聖別の', '幻糸の', '天衣の', '深淵の'];
const MAT_L = ['ぼろの', '獣皮の', '硬革の', '鱗革の', '影革の', '飛竜革の', '魔獣革の', '黒竜革の', '幻獣革の', '天狼革の', '深淵の'];
const MAT_J = ['銅の', '銀の', '金の', '翡翠の', '紅玉の', '蒼玉の', '翠玉の', '金剛の', '星晶の', '天輝の', '深淵の'];

// 武器の種類: [slot, Lv1 のダメージ min,max, 攻撃速度, 両手か, 射程, 固有効果]
const WEAPONS = {
  sword: { dmg: [3, 6], aps: 1.4, range: 'melee', implicit: [{ s: 'attack_speed', v: 5 }], mats: MAT_W },
  axe: { dmg: [4, 7], aps: 1.3, range: 'melee', implicit: [{ s: 'bleed_chance', v: 10 }], mats: MAT_W },
  mace: { dmg: [4, 8], aps: 1.2, range: 'melee', implicit: [{ s: 'dmg_elite', v: 10 }], mats: MAT_W },
  greatsword: { dmg: [7, 12], aps: 1.05, range: 'melee', twoHanded: true, implicit: [{ s: 'area', v: 15 }], mats: MAT_W },
  bow: { dmg: [3, 7], aps: 1.35, range: 'ranged', twoHanded: true, implicit: [{ s: 'pierce', v: 0 }], mats: MAT_W },
  crossbow: { dmg: [6, 10], aps: 1.05, range: 'ranged', twoHanded: true, implicit: [{ s: 'crit_damage', v: 15 }], mats: MAT_W },
  staff: { dmg: [6, 11], aps: 1.1, range: 'ranged', twoHanded: true, implicit: [{ s: 'inc_spell', v: 15 }], mats: MAT_W },
  wand: { dmg: [3, 6], aps: 1.4, range: 'ranged', implicit: [{ s: 'inc_elemental', v: 8 }], mats: MAT_W },
  scythe: { dmg: [6, 11], aps: 1.1, range: 'melee', twoHanded: true, implicit: [{ s: 'inc_minion', v: 15 }], mats: MAT_W },
  rod: { dmg: [3, 6], aps: 1.35, range: 'ranged', implicit: [{ s: 'minion_life', v: 10 }], mats: MAT_W },
  dagger: { dmg: [2, 5], aps: 1.6, range: 'melee', implicit: [{ s: 'crit_chance', v: 3 }], mats: MAT_W },
  claw: { dmg: [3, 5], aps: 1.5, range: 'melee', implicit: [{ s: 'life_on_hit', v: 1 }], mats: MAT_W },
};
const OFFHANDS = {
  shield: { armor: 6, block: 15, implicit: [{ s: 'block', v: 15 }], mats: MAT_W },
  quiver: { implicit: [{ s: 'proj_count', v: 0 }, { s: 'attack_speed', v: 6 }], mats: MAT_L },
  orb: { implicit: [{ s: 'inc_spell', v: 10 }], mats: MAT_J },
  grimoire: { implicit: [{ s: 'minion_count', v: 0 }, { s: 'inc_minion', v: 10 }], mats: MAT_C },
  offblade: { dmg: [1, 3], implicit: [{ s: 'attack_speed', v: 8 }], mats: MAT_W },
};
// 防具: スタイルごとの Lv1 アーマーと固有効果
const ARMOR_BASE = { helm: 3, chest: 6, gloves: 2, belt: 2, legs: 4, boots: 2 };
const STYLE_MULT = { cloth: 0.45, leather: 0.7, mail: 0.9, plate: 1.15 };
const STYLE_IMPLICIT = {
  cloth: [{ s: 'resource_regen', v: 6 }],
  leather: [{ s: 'dodge', v: 2 }],
  mail: [{ s: 'res_all', v: 3 }],
  plate: [{ s: 'inc_armor', v: 8 }],
};
const STYLE_MATS = { cloth: MAT_C, leather: MAT_L, mail: MAT_W, plate: MAT_W };
const ARMOR_WORD = {
  helm: { cloth: '頭巾', leather: '帽子', mail: '鎖頭巾', plate: '兜' },
  chest: { cloth: '法衣', leather: '革鎧', mail: '鎖帷子', plate: '板金鎧' },
  gloves: { cloth: '手袋', leather: '革手袋', mail: '鎖手袋', plate: '籠手' },
  belt: { cloth: '腰帯', leather: '革帯', mail: '鎖帯', plate: '鉄帯' },
  legs: { cloth: '袴', leather: '革脚絆', mail: '鎖脚絆', plate: '脚甲' },
  boots: { cloth: '布靴', leather: '革靴', mail: '鎖靴', plate: '鉄靴' },
};

export const BASES = [];
function add(b) { BASES.push(b); }

// 着けるのに要るレベルは、出始めるアイテム Lv の 8 割（強さ担当: 少し先の地域の装備も着けられるように。レベルが遅れて装備が止まるのを防ぐ）
export const BASE_REQ_MUL = 0.8;
for (let t = 1; t <= 11; t++) {
  const req = Math.max(1, Math.round(TIER_REQ[t - 1] * BASE_REQ_MUL));
  for (const [kind, w] of Object.entries(WEAPONS)) {
    add({ id: `${kind}_${t}`, slot: 'weapon', kind, tier: t, req, name: `${w.mats[t - 1]}${KIND_NAMES[kind]}`, dmg: w.dmg, aps: w.aps, twoHanded: !!w.twoHanded, range: w.range, implicit: w.implicit, art: `gear.${kind}`, icon: `icon.item.${kind}` });
  }
  for (const [kind, o] of Object.entries(OFFHANDS)) {
    add({ id: `${kind}_${t}`, slot: 'offhand', kind, tier: t, req, name: `${o.mats[t - 1]}${KIND_NAMES[kind]}`, armor: o.armor || 0, block: o.block || 0, dmg: o.dmg, implicit: o.implicit, art: `gear.${kind}`, icon: `icon.item.${kind}` });
  }
  for (const slot of Object.keys(ARMOR_BASE)) {
    for (const style of ARMOR_STYLES) {
      add({ id: `${slot}_${style}_${t}`, slot, kind: slot, style, tier: t, req, name: `${STYLE_MATS[style][t - 1]}${ARMOR_WORD[slot][style]}`, armor: ARMOR_BASE[slot] * STYLE_MULT[style], implicit: STYLE_IMPLICIT[style], art: `gear.${slot}.${style}`, icon: `icon.item.${slot}.${style}` });
    }
  }
  add({ id: `amulet_${t}`, slot: 'amulet', kind: 'amulet', tier: t, req, name: `${MAT_J[t - 1]}首飾り`, implicit: [{ s: 'all_attr', v: 2 + t }], art: 'gear.amulet', icon: 'icon.item.amulet' });
  add({ id: `ring_${t}`, slot: 'ring', kind: 'ring', tier: t, req, name: `${MAT_J[t - 1]}指輪`, implicit: [{ s: 'res_all', v: 2 + Math.floor(t / 2) }], art: 'gear.ring', icon: 'icon.item.ring' });
}

// 開始時の装備（classes.startGear）が引けるように、id の別名
const ALIAS = { chest_plate_1: 'chest_plate_1', chest_leather_1: 'chest_leather_1', chest_cloth_1: 'chest_cloth_1' };
export const BASE = Object.fromEntries(BASES.map((b) => [b.id, b]));
for (const [a, id] of Object.entries(ALIAS)) if (BASE[id]) BASE[a] = BASE[id];

export const WEAPON_KINDS = Object.keys(WEAPONS);
export const OFFHAND_KINDS = Object.keys(OFFHANDS);
export const weaponInfo = (kind) => WEAPONS[kind];

// ---------------- オプション（アフィックス）
// { id, s, type:'prefix'|'suffix', slots:[...base slot], on: { slot: '*' | [kind...] }, weight,
//   tiers: [[minIlvl, min, max], ...] … 下から順に良くなる（最大 10 段）。scale 能力は min/max が Lv1 の値（P(ilvl) 倍）
//   group … 同じグループは 1 つのアイテムに 1 つだけ
//   s に '*' を含むもの（'skill_dmg:*' など）は、付くときにスキルが 1 つ選ばれる（主人公のクラスのスキルが出やすい） }
// 表示の段階は「T1 が最高」。T1・T2 はアイテムレベル 100 以上（苦行・深淵の裂け目）でしか出ない。
// 1 部位（武器・副手は種類ごと）のオプションは 12〜18 種に絞ってある（どの行も何かのビルドで欲しくなる物だけ）。

/** 段階ごとの必要アイテムレベル（10 段のとき）。少ない段のオプションは上の方だけを使う */
export const TIER_ILVL = [1, 8, 18, 30, 44, 58, 72, 86, 100, 110];
/** 武器の種類のまとまり */
const MELEE_W = ['sword', 'axe', 'mace', 'greatsword', 'dagger', 'claw'];
const PHYS_W = ['sword', 'axe', 'mace', 'greatsword', 'bow', 'crossbow', 'dagger', 'claw'];

// 能力の追加（このファイルのオプションでだけ使う物）
registerStat('gem_find', '宝石の発見率', { cat: 'utility', desc: 'エリート・ボスが宝石を落とす確率' });
registerStat('rune_find', 'ルーンの発見率', { cat: 'utility', desc: 'エリート・ボスがルーンを落とす確率' });
registerStat('shard_find', '深淵の欠片の獲得', { cat: 'utility', desc: '深淵の欠片が多く手に入る' });
registerStat('luck_gain', '幸運ゲージの上昇', { cat: 'utility', desc: 'レジェンダリー・ミシックの幸運ゲージがたまりやすくなる' });
export const FAMILY_STAT_NAMES = { undead: '不死', beast: '獣', demon: '悪魔', elemental: '精霊', aberration: '異形', human: '人', insect: '虫', construct: '機巧', aquatic: '水棲', dragon: '竜', plant: '植物', spirit: '霊' };
for (const [f, n] of Object.entries(FAMILY_STAT_NAMES)) registerStat(`family_dmg:${f}`, `${n}へのダメージ`, { cat: 'offense', dyn: 'family_dmg', arg: f });

/**
 * 段の表を作る。lo = いちばん下の段の [min, max]、hi = いちばん上の段の [min, max]。
 * o: { n（段の数・既定 10）, gates（必要アイテムレベルの配列）, int（整数に丸める）, curve（伸び方。1 = 一定） }
 */
function tiers(lo, hi, o = {}) {
  const n = o.n || 10;
  const gates = o.gates || TIER_ILVL.slice(TIER_ILVL.length - n);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 1 : (i / (n - 1)) ** (o.curve || 1);
    let a = lo[0] + (hi[0] - lo[0]) * f;
    let b = lo[1] + (hi[1] - lo[1]) * f;
    if (o.int) { a = Math.round(a); b = Math.max(a, Math.round(b)); } else { a = Math.round(a * 10) / 10; b = Math.round(b * 10) / 10; }
    rows.push([gates[i], a, b]);
  }
  return rows;
}

const AF = [];
/** オプションを 1 つ登録。on = { 部位: '*' | [種類...] } */
function A(id, s, type, on, weight, lo, hi, o = {}) {
  AF.push({ id, s, type: type === 'P' ? 'prefix' : 'suffix', slots: Object.keys(on), on, weight, tiers: o.rows || tiers(lo, hi, o), ...(o.group ? { group: o.group } : {}), ...(o.desc ? { desc: o.desc } : {}) });
}
const W = '*';
const ARMOR6 = ['helm', 'chest', 'gloves', 'belt', 'legs', 'boots'];
const on = (...slots) => Object.fromEntries(slots.map((s) => (Array.isArray(s) ? s : [s, W])));
const OFF_ALL = ['offhand', W];

// ===== 攻撃・接頭（武器の基本ダメージに足す・増加）
A('add_phys', 'add_phys', 'P', on('weapon', 'gloves', 'ring'), 100, [1, 2], [4.4, 6.2]);
A('add_fire', 'add_fire', 'P', on('weapon', 'gloves', 'ring'), 70, [1, 2], [4.4, 6.2]);
A('add_cold', 'add_cold', 'P', on('weapon', 'gloves', 'ring'), 70, [1, 2], [4.4, 6.2]);
A('add_lightning', 'add_lightning', 'P', on('weapon', 'gloves', 'ring'), 70, [0.5, 3], [1.5, 9.4]);
A('add_poison', 'add_poison', 'P', on('weapon'), 50, [1, 2], [4.4, 6.2]);
A('add_void', 'add_void', 'P', on('weapon'), 40, [1, 2.2], [4.6, 6.6]);
A('weapon_dmg', 'weapon_dmg', 'P', on('weapon'), 80, [8, 16], [125, 150]);
A('inc_phys', 'inc_phys', 'P', on(['weapon', PHYS_W], 'amulet'), 60, [6, 10], [72, 88]);
A('inc_elemental', 'inc_elemental', 'P', on('weapon', ['offhand', ['orb']]), 60, [5, 8], [46, 56]);
A('inc_dmg', 'inc_dmg', 'P', on('gloves', 'amulet', 'ring'), 90, [3, 6], [42, 50]);
A('inc_fire', 'inc_fire', 'P', on('amulet'), 40, [5, 9], [58, 68], { group: 'el_amulet' });
A('inc_cold', 'inc_cold', 'P', on('amulet'), 40, [5, 9], [58, 68], { group: 'el_amulet' });
A('inc_lightning', 'inc_lightning', 'P', on('amulet'), 40, [5, 9], [58, 68], { group: 'el_amulet' });
A('inc_poison', 'inc_poison', 'P', on('amulet'), 35, [5, 9], [58, 68], { group: 'el_amulet' });
A('inc_void', 'inc_void', 'P', on('amulet'), 25, [5, 9], [58, 68], { group: 'el_amulet' });
A('inc_attack', 'inc_attack', 'P', on(['offhand', ['quiver', 'offblade']]), 50, [5, 9], [52, 62]);
A('inc_spell', 'inc_spell', 'P', on(['weapon', ['staff', 'wand']], ['offhand', ['orb']]), 60, [6, 10], [60, 72]);
A('inc_melee', 'inc_melee', 'P', on(['offhand', ['shield', 'offblade']]), 45, [5, 9], [52, 62]);
A('inc_projectile', 'inc_projectile', 'P', on(['offhand', ['quiver']]), 45, [5, 9], [52, 62]);
A('inc_area', 'inc_area', 'P', on(['offhand', ['orb']]), 40, [5, 9], [52, 62]);
A('inc_dot', 'inc_dot', 'P', on(['offhand', ['grimoire', 'offblade']]), 40, [6, 10], [58, 70]);
A('inc_minion', 'inc_minion', 'P', on(['weapon', ['scythe', 'rod']], ['offhand', ['grimoire']], 'amulet'), 40, [6, 10], [60, 72]);
A('skill_dmg', 'skill_dmg:*', 'P', on('weapon'), 30, [10, 16], [80, 95], { desc: '1 つのスキルのダメージ' });

// ===== 攻撃・接尾
A('attack_speed', 'attack_speed', 'S', on('weapon', 'gloves', 'ring', ['offhand', ['quiver', 'offblade']]), 70, [2, 3], [12, 15]);
A('crit_chance', 'crit_chance', 'S', on('weapon', 'gloves', 'helm', 'amulet', 'ring', ['offhand', ['quiver', 'orb', 'offblade']]), 70, [1, 1.6], [7, 8.5]);
A('crit_damage', 'crit_damage', 'S', on('weapon', 'gloves', 'amulet', 'ring', ['offhand', ['quiver', 'offblade']]), 70, [6, 10], [56, 66]);
A('multistrike', 'multistrike', 'S', on(['weapon', MELEE_W]), 30, [2, 3], [12, 15], { n: 8 });
A('area', 'area', 'S', on('helm', ['offhand', ['orb']]), 40, [4, 6], [24, 30], { n: 8 });
A('cdr', 'cdr', 'S', on('helm', OFF_ALL), 40, [1.5, 2.5], [8, 9.5], { n: 8 });
A('cost_red', 'cost_red', 'S', on('ring', ['offhand', ['orb', 'grimoire']]), 30, [2, 3], [10, 12], { n: 8 });
A('res_pen', 'res_pen', 'S', on('weapon'), 20, [2, 3], [12, 15], { n: 7 });
A('dmg_elite', 'dmg_elite', 'S', on('amulet'), 40, [3, 5], [26, 32]);
A('dmg_boss', 'dmg_boss', 'S', on('weapon'), 30, [3, 5], [26, 32]);
A('skill_lvl', 'skill_lvl', 'S', on('amulet'), 8, null, null, { rows: [[44, 1, 1], [86, 1, 2], [110, 2, 2]] });
A('life_on_hit', 'life_on_hit', 'S', on('ring'), 40, [0.4, 0.7], [2.4, 3]);
A('leech', 'leech', 'S', on('weapon'), 30, [0.3, 0.5], [2.2, 2.7], { n: 8 });
A('ignite', 'ignite_chance', 'S', on('gloves'), 20, [3, 5], [20, 25], { n: 8 });
A('freeze', 'freeze_chance', 'S', on('gloves'), 20, [2, 3], [10, 12], { n: 8 });
A('shock', 'shock_chance', 'S', on('gloves'), 20, [3, 5], [20, 25], { n: 8 });
A('poisonc', 'poison_chance', 'S', on('gloves', ['offhand', ['offblade']]), 20, [4, 6], [22, 28], { n: 8 });
A('bleed', 'bleed_chance', 'S', on('gloves', ['offhand', ['offblade']]), 20, [4, 6], [22, 28], { n: 8 });
A('dmg_vs_low', 'dmg_vs_low', 'S', on(['offhand', ['quiver', 'offblade']]), 30, [4, 6], [30, 36]);
A('status_dmg', 'status_dmg', 'S', on(['offhand', ['grimoire']]), 30, [5, 8], [46, 56]);
A('skill_cdr', 'skill_cdr:*', 'S', on('amulet'), 20, [3, 5], [18, 22], { n: 8, desc: '1 つのスキルのクールダウン短縮' });
A('fam_undead', 'family_dmg:undead', 'S', on(['weapon', ['mace', 'staff', 'scythe']]), 25, [4, 7], [38, 46]);
A('fam_beast', 'family_dmg:beast', 'S', on(['weapon', ['axe', 'bow', 'crossbow', 'claw']]), 25, [4, 7], [38, 46]);
A('fam_demon', 'family_dmg:demon', 'S', on(['weapon', ['sword', 'greatsword', 'rod']]), 25, [4, 7], [38, 46]);
A('fam_elemental', 'family_dmg:elemental', 'S', on(['weapon', ['wand', 'dagger']]), 25, [4, 7], [38, 46]);
A('fam_aberration', 'family_dmg:aberration', 'S', on(['offhand', ['shield', 'quiver', 'offblade']]), 25, [4, 7], [38, 46]);

// ===== 能力（主能力は 1 につきダメージ +0.25%）
const ATTR_ON = on(...ARMOR6, 'ring');
A('str', 'str', 'S', ATTR_ON, 60, [2, 4], [72, 90], { int: true, group: 'attr_str' });
A('dex', 'dex', 'S', ATTR_ON, 60, [2, 4], [72, 90], { int: true, group: 'attr_dex' });
A('int', 'int', 'S', ATTR_ON, 60, [2, 4], [72, 90], { int: true, group: 'attr_int' });
A('vit', 'vit', 'S', on('helm', 'chest', 'belt', 'legs', 'boots', 'ring'), 60, [2, 4], [72, 90], { int: true, group: 'attr_vit' });
A('all_attr', 'all_attr', 'S', on('amulet'), 15, [3, 5], [26, 32], { n: 8, int: true });

// ===== 防御
A('life', 'life', 'P', on(OFF_ALL, ...ARMOR6, 'ring'), 100, [4, 6], [16, 21]);
A('inc_life', 'inc_life', 'P', on('helm', 'chest', 'belt', 'legs'), 50, [2, 3], [13, 16], { n: 8 });
A('armor', 'armor', 'P', on(['offhand', ['shield']], ...ARMOR6), 80, [2, 3], [10, 13]);
A('inc_armor', 'inc_armor', 'P', on(['offhand', ['shield']], 'helm', 'chest', 'belt', 'legs', 'boots'), 50, [8, 14], [56, 70]);
A('life_regen', 'life_regen', 'S', on('chest', 'legs', ['offhand', ['shield']]), 40, [0.2, 0.4], [1.4, 1.8]);
A('life_regen_pct', 'life_regen_pct', 'S', on('belt', 'boots'), 20, [0.1, 0.2], [0.8, 1.0], { n: 8 });
const RES_ON = on('helm', 'chest', 'belt', 'legs', 'boots');
A('res_fire', 'res_fire', 'S', RES_ON, 60, [4, 8], [36, 42], { group: 'res_fire' });
A('res_cold', 'res_cold', 'S', RES_ON, 60, [4, 8], [36, 42], { group: 'res_cold' });
A('res_lightning', 'res_lightning', 'S', RES_ON, 60, [4, 8], [36, 42], { group: 'res_lightning' });
A('res_poison', 'res_poison', 'S', RES_ON, 50, [4, 8], [36, 42], { group: 'res_poison' });
A('res_void', 'res_void', 'S', on('chest', 'boots'), 30, [4, 7], [26, 32], { n: 8, group: 'res_void' });
A('res_all', 'res_all', 'S', on('helm', 'chest', 'boots', 'amulet', 'ring', OFF_ALL), 30, [2, 4], [17, 21], { n: 8 });
A('dodge', 'dodge', 'S', on('chest', 'legs', 'boots'), 30, [1, 1.5], [6.2, 7.6], { n: 8 });
A('block', 'block', 'S', on(['offhand', ['shield']]), 30, [2, 3], [10, 12.5], { n: 8 });
A('dr', 'dr', 'S', on('chest', 'belt', ['offhand', ['shield']]), 15, [1, 1.5], [6, 7.2], { n: 6 });
A('thorns', 'thorns', 'S', on('chest', 'legs', ['offhand', ['shield']]), 25, [1, 3], [8, 12]);
A('life_on_kill', 'life_on_kill', 'S', on('legs', ['offhand', ['shield']]), 30, [1, 2], [9, 13]);

// ===== 便利
A('move_speed', 'move_speed', 'S', on('boots'), 70, [3, 5], [24, 28]);
A('gold_find', 'gold_find', 'S', on('ring'), 40, [4, 8], [42, 52]);
A('magic_find', 'magic_find', 'S', on('helm', 'belt', 'ring', 'amulet'), 35, [3, 6], [33, 40]);
A('xp_bonus', 'xp_bonus', 'S', on('amulet'), 25, [2, 4], [15, 19], { n: 8 });
A('item_quantity', 'item_quantity', 'S', on('amulet'), 10, [1, 2], [8, 10], { n: 6 });
A('max_resource', 'max_resource', 'S', on(OFF_ALL), 30, [3, 6], [34, 42], { int: true });
A('resource_regen', 'resource_regen', 'S', on(['offhand', ['orb', 'grimoire']]), 30, [5, 8], [29, 35]);
A('resource_on_hit', 'resource_on_hit', 'S', on('legs'), 20, [1, 1], [4, 5], { n: 6, int: true });
A('offline_gain', 'offline_gain', 'S', on('belt'), 15, [3, 5], [18, 22], { n: 8 });
A('mat_find', 'mat_find', 'S', on('belt'), 20, [4, 6], [31, 37], { n: 8 });
A('luck_gain', 'luck_gain', 'S', on('belt'), 10, [2, 3], [14, 18], { n: 8 });
A('gem_find', 'gem_find', 'S', on('legs'), 15, [5, 8], [42, 52], { n: 8 });
A('shard_find', 'shard_find', 'S', on('boots'), 15, [5, 8], [42, 52], { n: 8 });
A('rune_find', 'rune_find', 'S', on('boots'), 15, [5, 8], [42, 52], { n: 8 });
A('skill_lvl1', 'skill_lvl:*', 'S', on('helm', OFF_ALL), 10, null, null, { rows: [[30, 1, 1], [72, 1, 2], [100, 2, 3], [110, 3, 3]], desc: '1 つのスキルのレベル' });

// ===== 召喚
A('minion_life', 'minion_life', 'S', on(['offhand', ['grimoire']]), 20, [6, 10], [38, 46]);
A('minion_count', 'minion_count', 'S', on(['offhand', ['grimoire']]), 8, null, null, { rows: [[58, 1, 1], [100, 1, 2]] });
A('minion_as', 'minion_as', 'S', on(['offhand', ['grimoire']]), 25, [3, 5], [20, 25], { n: 8 });
A('proj_count', 'proj_count', 'S', on(['offhand', ['quiver']]), 10, null, null, { rows: [[44, 1, 1], [100, 1, 2]] });
A('pierce', 'pierce', 'S', on(['offhand', ['quiver']]), 15, null, null, { rows: [[18, 1, 1], [58, 1, 2], [100, 2, 3]] });
A('chain', 'chain', 'S', on(['offhand', ['orb']]), 15, null, null, { rows: [[30, 1, 1], [72, 1, 2], [105, 2, 2]] });

export const AFFIXES = AF;
export const AFFIX = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** スロットで付けられるか（ring と amulet はそのまま） */
export function affixAllowed(affix, baseSlot) {
  return affix.slots.includes(baseSlot) || affix.slots.includes('all');
}

/** ベース（種類）まで見て付けられるか。武器・副手は種類ごとに付くオプションが違う */
export function affixAllowedBase(affix, base) {
  if (!base) return false;
  if (!affixAllowed(affix, base.slot)) return false;
  const k = affix.on?.[base.slot];
  return !k || k === W || k.includes(base.kind);
}

/** その部位・種類で付けられるオプションの一覧 */
export function affixPool(base) {
  return AFFIXES.filter((a) => affixAllowedBase(a, base));
}

/** 部位ごとのソケットの上限（武器 3・胴/頭/脚 2・ほか 1） */
export const SOCKET_MAX = { weapon: 3, chest: 2, helm: 2, legs: 2, offhand: 1, gloves: 1, belt: 1, boots: 1, amulet: 1, ring: 1 };
/** ソケットの場所の分類（宝石の効果が変わる） */
export const socketKind = (slot) => (slot === 'weapon' ? 'weapon' : slot === 'amulet' || slot === 'ring' ? 'jewelry' : 'armor');
