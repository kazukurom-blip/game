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

for (let t = 1; t <= 11; t++) {
  const req = TIER_REQ[t - 1];
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
// { id, s, type:'prefix'|'suffix', slots:[...base slot or 'all'|'armor'|'jewelry'|'weapon'], weight,
//   tiers: [[minIlvl, min, max], ...] … 下から順に良くなる。scale 能力は min/max が Lv1 の値（P(ilvl) 倍）
//   group … 同じグループは 1 つのアイテムに 1 つだけ }
// 表示の段階は「T1 が最高」。
const ARMOR_SLOTS = ['helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'offhand'];
const JEWELRY = ['amulet', 'ring'];
const ALL = ['weapon', ...ARMOR_SLOTS, ...JEWELRY];
const T = (rows) => rows; // 見やすさのため

export const AFFIXES = [
  // 攻撃（主に武器・装飾品・手）
  { id: 'add_phys', s: 'add_phys', type: 'prefix', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 100, tiers: T([[1, 1, 2], [12, 1.6, 2.6], [30, 2.2, 3.4], [55, 2.8, 4.2], [80, 3.4, 5]]) },
  { id: 'add_fire', s: 'add_fire', type: 'prefix', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 70, tiers: T([[1, 1, 2], [14, 1.6, 2.6], [32, 2.2, 3.4], [58, 2.8, 4.2], [82, 3.4, 5]]) },
  { id: 'add_cold', s: 'add_cold', type: 'prefix', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 70, tiers: T([[1, 1, 2], [14, 1.6, 2.6], [32, 2.2, 3.4], [58, 2.8, 4.2], [82, 3.4, 5]]) },
  { id: 'add_lightning', s: 'add_lightning', type: 'prefix', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 70, tiers: T([[1, 0.5, 3], [14, 0.8, 4.2], [32, 1.1, 5.4], [58, 1.4, 6.6], [82, 1.7, 7.8]]) },
  { id: 'add_poison', s: 'add_poison', type: 'prefix', slots: ['weapon', 'gloves', 'ring'], weight: 50, tiers: T([[5, 1, 2], [20, 1.6, 2.6], [40, 2.2, 3.4], [65, 2.8, 4.2], [88, 3.4, 5]]) },
  { id: 'inc_dmg', s: 'inc_dmg', type: 'prefix', slots: ['weapon', 'amulet', 'ring', 'gloves'], weight: 90, tiers: T([[1, 5, 9], [10, 10, 15], [22, 16, 22], [38, 23, 30], [55, 31, 39], [72, 40, 49], [90, 50, 60]]) },
  { id: 'inc_elemental', s: 'inc_elemental', type: 'prefix', slots: ['weapon', 'amulet', 'ring', 'offhand'], weight: 60, tiers: T([[5, 6, 10], [18, 11, 16], [35, 17, 24], [55, 25, 33], [78, 34, 44]]) },
  { id: 'inc_phys', s: 'inc_phys', type: 'prefix', slots: ['weapon', 'amulet'], weight: 60, tiers: T([[1, 8, 14], [15, 15, 24], [32, 25, 36], [52, 37, 50], [75, 51, 66], [92, 67, 85]]) },
  { id: 'weapon_dmg', s: 'weapon_dmg', type: 'prefix', slots: ['weapon'], weight: 80, tiers: T([[1, 10, 19], [12, 20, 34], [26, 35, 54], [44, 55, 79], [64, 80, 109], [84, 110, 140]]) },
  { id: 'attack_speed', s: 'attack_speed', type: 'suffix', slots: ['weapon', 'gloves', 'amulet', 'ring', 'offhand'], weight: 70, tiers: T([[1, 3, 5], [15, 5, 7], [35, 7, 9], [60, 9, 11], [85, 11, 14]]) },
  { id: 'crit_chance', s: 'crit_chance', type: 'suffix', slots: ['weapon', 'gloves', 'helm', 'amulet', 'ring'], weight: 70, tiers: T([[1, 1.5, 2.5], [15, 2.5, 3.5], [32, 3.5, 4.5], [55, 4.5, 5.5], [80, 5.5, 7]]) },
  { id: 'crit_damage', s: 'crit_damage', type: 'suffix', slots: ['weapon', 'gloves', 'amulet', 'ring'], weight: 70, tiers: T([[1, 8, 14], [15, 15, 22], [32, 23, 32], [55, 33, 42], [80, 43, 55]]) },
  { id: 'multistrike', s: 'multistrike', type: 'suffix', slots: ['weapon', 'gloves'], weight: 30, tiers: T([[20, 3, 5], [45, 6, 8], [75, 9, 12]]) },
  { id: 'area', s: 'area', type: 'suffix', slots: ['weapon', 'helm', 'amulet', 'offhand'], weight: 40, tiers: T([[8, 6, 10], [30, 11, 16], [60, 17, 24]]) },
  { id: 'cdr', s: 'cdr', type: 'suffix', slots: ['helm', 'gloves', 'amulet', 'ring', 'offhand'], weight: 40, tiers: T([[10, 3, 4], [30, 4, 6], [55, 6, 7], [80, 7, 8]]) },
  { id: 'cost_red', s: 'cost_red', type: 'suffix', slots: ['helm', 'amulet', 'ring', 'offhand'], weight: 30, tiers: T([[10, 4, 6], [35, 6, 8], [65, 8, 10]]) },
  { id: 'res_pen', s: 'res_pen', type: 'suffix', slots: ['weapon', 'amulet'], weight: 20, tiers: T([[40, 4, 6], [65, 7, 9], [88, 10, 13]]) },
  { id: 'dmg_elite', s: 'dmg_elite', type: 'suffix', slots: ['weapon', 'ring', 'amulet', 'offhand'], weight: 40, tiers: T([[5, 5, 8], [25, 9, 13], [50, 14, 18], [80, 19, 25]]) },
  { id: 'dmg_boss', s: 'dmg_boss', type: 'suffix', slots: ['weapon', 'ring', 'amulet'], weight: 30, tiers: T([[10, 5, 8], [30, 9, 13], [55, 14, 18], [82, 19, 25]]) },
  { id: 'skill_lvl', s: 'skill_lvl', type: 'suffix', slots: ['amulet', 'helm', 'weapon'], weight: 8, tiers: T([[30, 1, 1], [70, 1, 2], [95, 2, 2]]) },
  { id: 'life_on_hit', s: 'life_on_hit', type: 'suffix', slots: ['weapon', 'gloves', 'ring'], weight: 40, tiers: T([[1, 0.6, 1.0], [20, 1.0, 1.4], [45, 1.4, 1.8], [75, 1.8, 2.4]]) },
  { id: 'leech', s: 'leech', type: 'suffix', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 30, tiers: T([[10, 0.5, 0.9], [30, 0.9, 1.3], [55, 1.3, 1.7], [80, 1.7, 2.2]]) },
  { id: 'ignite', s: 'ignite_chance', type: 'suffix', slots: ['weapon', 'gloves'], weight: 20, tiers: T([[10, 5, 9], [40, 10, 15], [70, 16, 22]]) },
  { id: 'freeze', s: 'freeze_chance', type: 'suffix', slots: ['weapon', 'gloves'], weight: 20, tiers: T([[10, 3, 5], [40, 5, 8], [70, 8, 11]]) },
  { id: 'shock', s: 'shock_chance', type: 'suffix', slots: ['weapon', 'gloves'], weight: 20, tiers: T([[10, 5, 9], [40, 10, 15], [70, 16, 22]]) },
  { id: 'poisonc', s: 'poison_chance', type: 'suffix', slots: ['weapon', 'gloves'], weight: 20, tiers: T([[10, 6, 10], [40, 11, 17], [70, 18, 25]]) },
  { id: 'bleed', s: 'bleed_chance', type: 'suffix', slots: ['weapon', 'gloves'], weight: 20, tiers: T([[10, 6, 10], [40, 11, 17], [70, 18, 25]]) },

  // 能力
  { id: 'str', s: 'str', type: 'suffix', slots: ALL, weight: 60, group: 'attr_str', tiers: T([[1, 3, 6], [12, 7, 12], [25, 13, 20], [40, 21, 30], [55, 31, 42], [70, 43, 56], [85, 57, 72], [97, 73, 90]]) },
  { id: 'dex', s: 'dex', type: 'suffix', slots: ALL, weight: 60, group: 'attr_dex', tiers: T([[1, 3, 6], [12, 7, 12], [25, 13, 20], [40, 21, 30], [55, 31, 42], [70, 43, 56], [85, 57, 72], [97, 73, 90]]) },
  { id: 'int', s: 'int', type: 'suffix', slots: ALL, weight: 60, group: 'attr_int', tiers: T([[1, 3, 6], [12, 7, 12], [25, 13, 20], [40, 21, 30], [55, 31, 42], [70, 43, 56], [85, 57, 72], [97, 73, 90]]) },
  { id: 'vit', s: 'vit', type: 'suffix', slots: ALL, weight: 60, group: 'attr_vit', tiers: T([[1, 3, 6], [12, 7, 12], [25, 13, 20], [40, 21, 30], [55, 31, 42], [70, 43, 56], [85, 57, 72], [97, 73, 90]]) },
  { id: 'all_attr', s: 'all_attr', type: 'suffix', slots: ['amulet', 'ring', 'helm'], weight: 15, tiers: T([[20, 4, 8], [50, 9, 15], [80, 16, 24]]) },

  // 防御
  { id: 'life', s: 'life', type: 'prefix', slots: [...ARMOR_SLOTS, ...JEWELRY], weight: 100, tiers: T([[1, 5, 9], [10, 7, 12], [25, 9, 15], [45, 11, 18], [70, 13, 21], [90, 15, 24]]) },
  { id: 'inc_life', s: 'inc_life', type: 'prefix', slots: ['chest', 'helm', 'belt', 'legs', 'amulet', 'offhand'], weight: 50, tiers: T([[8, 3, 5], [25, 5, 8], [45, 8, 11], [70, 11, 14]]) },
  { id: 'armor', s: 'armor', type: 'prefix', slots: ARMOR_SLOTS, weight: 80, tiers: T([[1, 2, 4], [15, 3, 6], [35, 4, 8], [60, 5, 10], [85, 6, 12]]) },
  { id: 'inc_armor', s: 'inc_armor', type: 'prefix', slots: ARMOR_SLOTS, weight: 50, tiers: T([[1, 10, 18], [20, 19, 30], [45, 31, 45], [75, 46, 62]]) },
  { id: 'life_regen', s: 'life_regen', type: 'suffix', slots: [...ARMOR_SLOTS, ...JEWELRY], weight: 40, tiers: T([[1, 0.3, 0.6], [20, 0.5, 0.9], [45, 0.7, 1.2], [75, 0.9, 1.5]]) },
  { id: 'res_fire', s: 'res_fire', type: 'suffix', slots: [...ARMOR_SLOTS, ...JEWELRY], weight: 60, group: 'res_fire', tiers: T([[1, 6, 11], [15, 12, 17], [32, 18, 24], [55, 25, 31], [80, 32, 40]]) },
  { id: 'res_cold', s: 'res_cold', type: 'suffix', slots: [...ARMOR_SLOTS, ...JEWELRY], weight: 60, group: 'res_cold', tiers: T([[1, 6, 11], [15, 12, 17], [32, 18, 24], [55, 25, 31], [80, 32, 40]]) },
  { id: 'res_lightning', s: 'res_lightning', type: 'suffix', slots: [...ARMOR_SLOTS, ...JEWELRY], weight: 60, group: 'res_lightning', tiers: T([[1, 6, 11], [15, 12, 17], [32, 18, 24], [55, 25, 31], [80, 32, 40]]) },
  { id: 'res_poison', s: 'res_poison', type: 'suffix', slots: [...ARMOR_SLOTS, ...JEWELRY], weight: 50, group: 'res_poison', tiers: T([[5, 6, 11], [20, 12, 17], [38, 18, 24], [60, 25, 31], [85, 32, 40]]) },
  { id: 'res_void', s: 'res_void', type: 'suffix', slots: ['chest', 'helm', 'amulet', 'offhand'], weight: 15, group: 'res_void', tiers: T([[60, 5, 9], [85, 10, 15]]) },
  { id: 'res_all', s: 'res_all', type: 'suffix', slots: ['chest', 'helm', 'amulet', 'ring', 'offhand', 'boots'], weight: 30, tiers: T([[10, 4, 6], [30, 7, 10], [55, 11, 14], [80, 15, 18]]) },
  { id: 'dodge', s: 'dodge', type: 'suffix', slots: ['boots', 'legs', 'gloves', 'chest'], weight: 30, tiers: T([[5, 1.5, 2.5], [25, 2.5, 3.5], [50, 3.5, 4.5], [80, 4.5, 6]]) },
  { id: 'block', s: 'block', type: 'suffix', slots: ['offhand'], weight: 30, tiers: T([[5, 3, 5], [30, 5, 7], [60, 7, 10]]) },
  { id: 'dr', s: 'dr', type: 'suffix', slots: ['chest', 'belt', 'offhand'], weight: 15, tiers: T([[30, 2, 3], [60, 3, 4], [88, 4, 6]]) },
  { id: 'thorns', s: 'thorns', type: 'suffix', slots: ['chest', 'offhand', 'legs'], weight: 25, tiers: T([[1, 2, 4], [25, 3, 6], [55, 4, 8], [85, 5, 10]]) },

  // 便利
  { id: 'move_speed', s: 'move_speed', type: 'suffix', slots: ['boots'], weight: 70, tiers: T([[1, 4, 7], [15, 8, 11], [35, 12, 15], [60, 16, 20], [85, 21, 25]]) },
  { id: 'gold_find', s: 'gold_find', type: 'suffix', slots: ['helm', 'amulet', 'ring', 'belt', 'gloves'], weight: 40, tiers: T([[1, 5, 10], [20, 11, 18], [45, 19, 28], [75, 29, 40]]) },
  { id: 'magic_find', s: 'magic_find', type: 'suffix', slots: ['helm', 'amulet', 'ring', 'boots', 'belt'], weight: 35, tiers: T([[1, 4, 8], [20, 9, 14], [45, 15, 21], [75, 22, 30]]) },
  { id: 'xp_bonus', s: 'xp_bonus', type: 'suffix', slots: ['helm', 'amulet', 'ring'], weight: 25, tiers: T([[5, 3, 5], [30, 6, 9], [60, 10, 14]]) },
  { id: 'max_resource', s: 'max_resource', type: 'suffix', slots: ['helm', 'chest', 'amulet', 'offhand'], weight: 30, tiers: T([[1, 5, 10], [25, 11, 18], [55, 19, 28], [85, 29, 40]]) },
  { id: 'resource_regen', s: 'resource_regen', type: 'suffix', slots: ['helm', 'amulet', 'ring', 'offhand', 'weapon'], weight: 30, tiers: T([[1, 6, 10], [25, 11, 16], [55, 17, 24], [85, 25, 32]]) },
  { id: 'minion_life', s: 'minion_life', type: 'suffix', slots: ['helm', 'chest', 'amulet', 'offhand'], weight: 20, tiers: T([[1, 8, 14], [30, 15, 24], [65, 25, 36]]) },
  { id: 'inc_minion', s: 'inc_minion', type: 'prefix', slots: ['weapon', 'amulet', 'offhand', 'helm'], weight: 25, tiers: T([[1, 8, 14], [25, 15, 24], [50, 25, 36], [80, 37, 50]]) },
];
export const AFFIX = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** スロットの別名を展開（'ring' と 'amulet' はそのまま） */
export function affixAllowed(affix, baseSlot) {
  return affix.slots.includes(baseSlot) || affix.slots.includes('all');
}
