// 敵データ
// aggro: 索敵距離 px（0 = 攻撃されるまで非アクティブ）, speed: px/s, w/h: 当たり判定
// drops: [{id, chance}] chance は 0〜1（ルークで倍率補正 → systems/loot.js）
// isCop: 倒すと手配度上昇（heat = 加算量） / boss: ボス
import { looksFromIds } from './items.js';

const hpAt = (lv, m = 1) => Math.round((25 + 8 * lv + 0.5 * lv * lv) * m);
const atkAt = (lv, m = 1) => Math.round((8 + 2.2 * lv + 0.05 * lv * lv) * m);
const expAt = (lv, m = 1) => Math.round((5 + 2 * lv + 0.22 * lv * lv) * m);
const defAt = (lv, m = 1) => Math.round(lv * 0.8 * m);
const moneyAt = (lv, m = 1) => [Math.round((3 + lv * 3) * m), Math.round((8 + lv * 6) * m)];

// 共通ドロップ（ティア別のポーション）
const POTS_LOW = [{ id: 'potion_red', chance: 0.12 }, { id: 'potion_blue', chance: 0.06 }];
const POTS_MID = [{ id: 'potion_orange', chance: 0.1 }, { id: 'potion_blue', chance: 0.08 }, { id: 'drink_energy', chance: 0.01 }];
const POTS_HIGH = [{ id: 'potion_white', chance: 0.08 }, { id: 'potion_mana', chance: 0.05 }, { id: 'power_elixir', chance: 0.01 }, { id: 'drink_tough', chance: 0.01 }];

function mk(id, name, level, art, ai, o = {}) {
  const m = o.m || 1;
  const def = {
    id, name, level, art, ai,
    hp: o.hp ?? hpAt(level, o.hpM ?? m),
    atk: o.atk ?? atkAt(level, o.atkM ?? 1),
    def: o.def ?? defAt(level, o.defM ?? 1),
    exp: o.exp ?? expAt(level, o.expM ?? m),
    money: o.money ?? moneyAt(level, o.moneyM ?? m),
    speed: o.speed ?? 70,
    w: o.w ?? 40, h: o.h ?? 40,
    aggro: o.aggro ?? 0,
    drops: o.drops || [],
    color: o.color || '#ffffff',
    boss: !!o.boss,
    isCop: !!o.isCop,
  };
  if (o.heat) def.heat = o.heat;
  if (o.look) def.look = o.look;
  if (o.equip) def.equip = looksFromIds(o.equip);
  if (o.scale) def.scale = o.scale;
  if (o.shoot) def.shoot = o.shoot; // shooter/cop/boss 用: {range, interval, speed, damageMult}
  if (o.title) def.title = o.title;
  return def;
}

const list = [
  // ---------------- beach Lv1〜12 ----------------
  mk('slime_green', 'ソーダスライム', 1, 'slime', 'jumper', {
    speed: 60, w: 40, h: 32, color: '#5cff9a',
    drops: [{ id: 'slime_jelly', chance: 0.55 }, ...POTS_LOW, { id: 'sandals_beach', chance: 0.02 }, { id: 'cap_street', chance: 0.02 }, { id: 'sunglasses_aviator', chance: 0.005 }],
  }),
  mk('slime_pink', 'ストロベリースライム', 3, 'slime', 'jumper', {
    speed: 70, w: 42, h: 34, color: '#ff6fb5',
    drops: [{ id: 'slime_jelly', chance: 0.6 }, ...POTS_LOW, { id: 'tshirt_white', chance: 0.02 }, { id: 'shorts_beach', chance: 0.02 }, { id: 'pistol_9mm', chance: 0.01 }, { id: 'headphones_neon', chance: 0.002 }],
  }),
  mk('mushroom_orange', 'ビーチマッシュ', 5, 'mushroom', 'walker', {
    speed: 55, w: 44, h: 48, color: '#ff8a00',
    drops: [{ id: 'mushroom_cap', chance: 0.5 }, ...POTS_LOW, { id: 'beanie_gray', chance: 0.02 }, { id: 'sunglasses_aviator', chance: 0.02 }, { id: 'knife_butterfly', chance: 0.003 }],
  }),
  mk('flamingo', 'ヤンキーフラミンゴ', 7, 'flamingo', 'charger', {
    speed: 120, w: 40, h: 70, aggro: 260, color: '#ff7fb0',
    drops: [{ id: 'flamingo_feather', chance: 0.5 }, ...POTS_LOW, { id: 'hawaiian_shirt', chance: 0.02 }, { id: 'heels_red', chance: 0.004 }, { id: 'pistol_9mm', chance: 0.02 }],
  }),
  // ---------------- downtown Lv10〜20 ----------------
  mk('thug_punk', 'ストリートチンピラ', 10, 'thug', 'walker', {
    speed: 90, w: 32, h: 70, aggro: 320, color: '#39ff6a',
    look: { body: 'm', skin: '#d9a27a', hair: 'spiky', hairColor: '#39ff6a', eyeColor: '#222222' },
    equip: { hat: 'bandana_red', top: 'tank_black', bottom: 'jeans_blue', shoes: 'sneakers_white', weapon: 'bat_wood' },
    drops: [{ id: 'street_tag', chance: 0.5 }, ...POTS_LOW, { id: 'bandana_red', chance: 0.02 }, { id: 'tank_black', chance: 0.02 }, { id: 'katana_steel', chance: 0.01 }, { id: 'bat_nail', chance: 0.005 }, { id: 'gold_chain', chance: 0.003 }],
  }),
  mk('mushroom_neon', 'ネオンキノコ', 12, 'mushroom', 'jumper', {
    speed: 65, w: 46, h: 50, color: '#b04dff',
    drops: [{ id: 'mushroom_cap', chance: 0.55 }, ...POTS_MID, { id: 'scarf_red', chance: 0.02 }, { id: 'staff_neon', chance: 0.004 }, { id: 'headphones_neon', chance: 0.005 }],
  }),
  mk('cop_patrol', 'パトロール警官', 14, 'cop', 'cop', {
    speed: 110, w: 32, h: 70, aggro: 500, color: '#3a6bff', isCop: true, heat: 3,
    look: { body: 'm', skin: '#c98e62', hair: 'short', hairColor: '#2a1a10', eyeColor: '#1a2a4a' },
    equip: { hat: 'cap_street', top: 'police_uniform', bottom: 'suit_pants', shoes: 'loafers_brown', weapon: 'pistol_9mm' },
    shoot: { range: 420, interval: 1.6, speed: 650, damageMult: 0.8 },
    drops: [{ id: 'cop_badge', chance: 0.35 }, ...POTS_MID, { id: 'police_uniform', chance: 0.01 }, { id: 'pistol_9mm', chance: 0.03 }, { id: 'smg_compact', chance: 0.004 }],
  }),
  mk('drone_scout', '監視ドローン', 16, 'drone', 'flyer', {
    speed: 100, w: 44, h: 30, aggro: 420, color: '#19f0ff', isCop: true, heat: 1,
    drops: [{ id: 'drone_chip', chance: 0.5 }, ...POTS_MID, { id: 'sunglasses_neon', chance: 0.004 }, { id: 'headphones_neon', chance: 0.01 }],
  }),
  // ---------------- slums / port Lv18〜26 ----------------
  mk('thug_dockhand', '港のゴロツキ', 18, 'thug', 'charger', {
    speed: 130, w: 34, h: 72, aggro: 340, color: '#ff8a00',
    look: { body: 'm', skin: '#a8704a', hair: 'short', hairColor: '#111111', eyeColor: '#331a00' },
    equip: { hat: 'beanie_gray', top: 'tank_black', bottom: 'cargo_khaki', shoes: 'boots_black', weapon: 'bat_nail' },
    drops: [{ id: 'stolen_vinyl', chance: 0.4 }, { id: 'street_tag', chance: 0.3 }, ...POTS_MID, { id: 'cargo_khaki', chance: 0.02 }, { id: 'tracksuit_green', chance: 0.01 }, { id: 'bat_nail', chance: 0.01 }, { id: 'guitar_electric', chance: 0.004 }],
  }),
  mk('slime_toxic', 'ヘドロスライム', 20, 'slime', 'jumper', {
    speed: 80, w: 48, h: 38, color: '#a6ff00',
    drops: [{ id: 'toxic_goo', chance: 0.55 }, ...POTS_MID, { id: 'track_pants', chance: 0.01 }, { id: 'gold_chain', chance: 0.005 }],
  }),
  mk('flamingo_punk', 'パンク・フラミンゴ', 22, 'flamingo', 'charger', {
    speed: 160, w: 42, h: 74, aggro: 320, color: '#b04dff',
    drops: [{ id: 'flamingo_feather', chance: 0.5 }, ...POTS_MID, { id: 'heels_red', chance: 0.01 }, { id: 'smg_compact', chance: 0.006 }, { id: 'mask_skull', chance: 0.006 }],
  }),
  mk('thug_gunner', 'ギャングの鉄砲玉', 24, 'thug', 'shooter', {
    speed: 85, w: 32, h: 70, aggro: 480, color: '#d8283c',
    look: { body: 'f', skin: '#e8b48a', hair: 'ponytail', hairColor: '#d8283c', eyeColor: '#222222' },
    equip: { hat: 'cap_street', top: 'tracksuit_green', bottom: 'track_pants', shoes: 'sneakers_white', accessory: 'sunglasses_aviator', weapon: 'smg_compact' },
    shoot: { range: 460, interval: 1.4, speed: 700, damageMult: 0.7 },
    drops: [{ id: 'street_tag', chance: 0.5 }, ...POTS_MID, { id: 'smg_compact', chance: 0.01 }, { id: 'tracksuit_green', chance: 0.015 }, { id: 'pistol_gold', chance: 0.002 }],
  }),
  // ---------------- swamp Lv25〜32 ----------------
  mk('gator_swamp', '沼ワニ', 26, 'gator', 'charger', {
    speed: 120, w: 90, h: 40, aggro: 300, color: '#3f8f3a', hpM: 1.2,
    drops: [{ id: 'gator_tooth', chance: 0.5 }, ...POTS_MID, { id: 'cowboy_hat', chance: 0.01 }, { id: 'boots_black', chance: 0.02 }, { id: 'katana_blood', chance: 0.002 }],
  }),
  mk('mushroom_bog', '沼地の毒キノコ', 28, 'mushroom', 'walker', {
    speed: 60, w: 48, h: 52, color: '#6a8f2a',
    drops: [{ id: 'mushroom_cap', chance: 0.5 }, ...POTS_MID, { id: 'staff_neon', chance: 0.008 }, { id: 'loafers_brown', chance: 0.02 }],
  }),
  mk('gator_albino', 'アルビノゲイター', 32, 'gator', 'charger', {
    speed: 150, w: 96, h: 42, aggro: 340, color: '#f0f0e8', hpM: 1.3, expM: 1.3,
    drops: [{ id: 'gator_tooth', chance: 0.5 }, { id: 'gator_scale', chance: 0.15 }, ...POTS_HIGH, { id: 'helmet_moto', chance: 0.004 }, { id: 'idol_dress', chance: 0.003 }, { id: 'boots_rocket', chance: 0.001 }],
  }),
  // ---------------- 警察エスカレーション（手配度でどこにでも出現） ----------------
  mk('cop_detective', '覆面刑事', 30, 'cop', 'cop', {
    speed: 120, w: 32, h: 70, aggro: 560, color: '#5a5a66', isCop: true, heat: 4,
    look: { body: 'm', skin: '#e0b090', hair: 'short', hairColor: '#4a3020', eyeColor: '#223344' },
    equip: { top: 'suit_black', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'sunglasses_aviator', weapon: 'pistol_9mm' },
    shoot: { range: 480, interval: 1.2, speed: 750, damageMult: 0.8 },
    drops: [{ id: 'cop_badge', chance: 0.4 }, ...POTS_HIGH, { id: 'suit_black', chance: 0.01 }, { id: 'pistol_gold', chance: 0.004 }],
  }),
  mk('swat_trooper', 'SWAT隊員', 36, 'swat', 'cop', {
    speed: 115, w: 34, h: 72, aggro: 600, color: '#2a3020', isCop: true, heat: 6, hpM: 1.3, defM: 1.5,
    look: { body: 'm', skin: '#b07a52', hair: 'short', hairColor: '#111111', eyeColor: '#111111' },
    equip: { hat: 'helmet_moto', top: 'armor_vest', bottom: 'armor_pants', shoes: 'boots_black', accessory: 'mask_skull', weapon: 'smg_compact' },
    shoot: { range: 520, interval: 1.0, speed: 800, damageMult: 0.6 },
    drops: [{ id: 'cop_badge', chance: 0.4 }, ...POTS_HIGH, { id: 'armor_vest', chance: 0.006 }, { id: 'armor_pants', chance: 0.006 }, { id: 'smg_neon', chance: 0.001 }],
  }),
  // ---------------- casino Lv34〜44 ----------------
  mk('thug_bouncer', 'カジノの用心棒', 38, 'thug', 'walker', {
    speed: 95, w: 38, h: 78, aggro: 360, color: '#ffd23f', hpM: 1.4, scale: 1.1,
    look: { body: 'm', skin: '#8a5a3a', hair: 'short', hairColor: '#000000', eyeColor: '#000000' },
    equip: { top: 'suit_black', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'gold_chain', weapon: null },
    drops: [{ id: 'casino_chip', chance: 0.55 }, ...POTS_HIGH, { id: 'gold_chain_heavy', chance: 0.004 }, { id: 'suit_black', chance: 0.015 }, { id: 'gold_bar', chance: 0.02 }],
  }),
  mk('drone_casino', 'セキュリティドローン', 40, 'drone', 'flyer', {
    speed: 140, w: 46, h: 32, aggro: 460, color: '#ff3dd2',
    shoot: { range: 420, interval: 1.8, speed: 600, damageMult: 0.6 },
    drops: [{ id: 'drone_chip', chance: 0.5 }, { id: 'casino_chip', chance: 0.3 }, ...POTS_HIGH, { id: 'sneakers_neon', chance: 0.004 }, { id: 'cat_ears_neon', chance: 0.003 }],
  }),
  mk('slime_gold', 'ゴールドスライム', 42, 'slime', 'jumper', {
    speed: 90, w: 46, h: 36, color: '#ffd23f', expM: 1.5, moneyM: 4,
    drops: [{ id: 'gold_bar', chance: 0.08 }, { id: 'casino_chip', chance: 0.4 }, { id: 'diamond', chance: 0.005 }, { id: 'drink_lucky', chance: 0.02 }, { id: 'guitar_thunder', chance: 0.003 }],
  }),
  // ---------------- rooftop Lv45〜60 ----------------
  mk('thug_hitman', 'ドンの殺し屋', 48, 'thug', 'shooter', {
    speed: 110, w: 32, h: 72, aggro: 600, color: '#16161e', hpM: 1.2,
    look: { body: 'f', skin: '#f0c8a0', hair: 'long', hairColor: '#16161e', eyeColor: '#d8283c' },
    equip: { top: 'suit_black', bottom: 'skirt_pink', shoes: 'heels_red', accessory: 'sunglasses_neon', weapon: 'pistol_gold' },
    shoot: { range: 560, interval: 1.1, speed: 850, damageMult: 0.7 },
    drops: [{ id: 'gold_bar', chance: 0.05 }, ...POTS_HIGH, { id: 'pistol_gold', chance: 0.008 }, { id: 'skirt_star', chance: 0.002 }, { id: 'neon_sword', chance: 0.001 }, { id: 'halo_angel', chance: 0.001 }],
  }),
  mk('drone_attack', 'アサルトドローン', 52, 'drone', 'flyer', {
    speed: 170, w: 50, h: 34, aggro: 560, color: '#ff3d3d', hpM: 1.1,
    shoot: { range: 500, interval: 1.2, speed: 750, damageMult: 0.6 },
    drops: [{ id: 'drone_chip', chance: 0.5 }, { id: 'neon_core', chance: 0.01 }, ...POTS_HIGH, { id: 'smg_neon', chance: 0.003 }, { id: 'wings_angel', chance: 0.002 }],
  }),
  mk('swat_heavy', 'ヘビーSWAT', 56, 'swat', 'cop', {
    speed: 90, w: 40, h: 80, aggro: 620, color: '#101418', isCop: true, heat: 8, hpM: 1.6, defM: 2, scale: 1.15,
    look: { body: 'm', skin: '#c08a60', hair: 'short', hairColor: '#111111', eyeColor: '#ff3d3d' },
    equip: { hat: 'helmet_moto', top: 'armor_vest', bottom: 'armor_pants', shoes: 'boots_rocket', accessory: 'mask_skull', weapon: 'smg_neon' },
    shoot: { range: 560, interval: 0.8, speed: 850, damageMult: 0.5 },
    drops: [{ id: 'cop_badge', chance: 0.5 }, ...POTS_HIGH, { id: 'armor_vest', chance: 0.01 }, { id: 'boots_rocket', chance: 0.002 }, { id: 'crown_gold', chance: 0.001 }],
  }),
  mk('mushroom_mutant', 'ミュータント・マッシュ', 60, 'mushroom', 'jumper', {
    speed: 90, w: 56, h: 60, aggro: 300, color: '#ff3d7f', hpM: 1.5, expM: 1.4, scale: 1.2,
    drops: [{ id: 'mushroom_cap', chance: 0.5 }, { id: 'diamond', chance: 0.004 }, ...POTS_HIGH, { id: 'staff_moon', chance: 0.002 }, { id: 'heels_glass', chance: 0.001 }],
  }),

  // ===================== ボス =====================
  mk('boss_king_slime', 'キングゼリー', 12, 'slime', 'boss', {
    boss: true, hp: 3200, atk: 45, def: 8, exp: 900, money: [800, 1500], speed: 70, w: 140, h: 110, scale: 3, color: '#5cff9a',
    title: 'ビーチの王様',
    drops: [{ id: 'king_crown_shard', chance: 1 }, { id: 'slime_jelly', chance: 1 }, { id: 'potion_orange', chance: 0.8 }, { id: 'headphones_neon', chance: 0.1 }, { id: 'knife_butterfly', chance: 0.08 }, { id: 'gold_chain', chance: 0.05 }, { id: 'crown_gold', chance: 0.002 }],
  }),
  mk('boss_gator', 'グランパ・ゲイター', 32, 'bossGator', 'boss', {
    boss: true, hp: 16000, atk: 150, def: 30, exp: 8000, money: [5000, 9000], speed: 110, w: 220, h: 110, color: '#2f6f2a',
    title: '沼の主',
    drops: [{ id: 'gator_tooth', chance: 1 }, { id: 'gator_scale', chance: 1 }, { id: 'elixir', chance: 0.5 }, { id: 'katana_blood', chance: 0.05 }, { id: 'helmet_moto', chance: 0.05 }, { id: 'boots_rocket', chance: 0.02 }, { id: 'wings_angel', chance: 0.01 }, { id: 'heels_glass', chance: 0.002 }],
  }),
  mk('boss_mecha', 'メカ・ハイローラー', 44, 'drone', 'boss', {
    boss: true, hp: 32000, atk: 210, def: 45, exp: 20000, money: [12000, 20000], speed: 130, w: 150, h: 100, scale: 3.2, color: '#ffd23f',
    title: 'カジノ警備システム',
    shoot: { range: 700, interval: 0.9, speed: 700, damageMult: 0.6 },
    drops: [{ id: 'neon_core', chance: 1 }, { id: 'diamond', chance: 0.3 }, { id: 'elixir', chance: 0.5 }, { id: 'smg_neon', chance: 0.04 }, { id: 'guitar_thunder', chance: 0.05 }, { id: 'staff_moon', chance: 0.03 }, { id: 'halo_angel', chance: 0.005 }],
  }),
  mk('boss_don', 'ドン・カイマン', 58, 'bossDon', 'boss', {
    boss: true, hp: 65000, atk: 300, def: 70, exp: 60000, money: [40000, 60000], speed: 140, w: 48, h: 96, scale: 1.4, color: '#ffd23f',
    title: 'ヴァイス・ベイの支配者',
    look: { body: 'm', skin: '#d0a070', hair: 'wolf', hairColor: '#e8e8e8', eyeColor: '#ffd23f' },
    equip: { hat: 'crown_gold', top: 'suit_gold', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'gold_chain_heavy', weapon: 'pistol_mythic' },
    shoot: { range: 700, interval: 0.8, speed: 900, damageMult: 0.5 },
    drops: [{ id: 'diamond', chance: 1 }, { id: 'gold_bar', chance: 1 }, { id: 'elixir', chance: 1 }, { id: 'suit_gold', chance: 0.08 }, { id: 'neon_sword', chance: 0.05 }, { id: 'neon_sword_mythic', chance: 0.01 }, { id: 'pistol_mythic', chance: 0.01 }, { id: 'wings_neon', chance: 0.005 }, { id: 'crown_neon', chance: 0.005 }, { id: 'idol_dress_mythic', chance: 0.005 }],
  }),
];

export const ENEMIES = Object.fromEntries(list.map((e) => [e.id, e]));

export function getEnemy(id) { return ENEMIES[id] || null; }

// マップ別の推奨出現（ワールド担当の spawns 用の参考）
export const ENEMIES_BY_MAP = {
  beach: ['slime_green', 'slime_pink', 'mushroom_orange', 'flamingo', 'boss_king_slime'],
  downtown: ['thug_punk', 'mushroom_neon', 'cop_patrol', 'drone_scout'],
  slums: ['thug_dockhand', 'slime_toxic', 'flamingo_punk', 'thug_gunner'],
  swamp: ['gator_swamp', 'mushroom_bog', 'gator_albino', 'boss_gator'],
  casino: ['thug_bouncer', 'drone_casino', 'slime_gold', 'boss_mecha'],
  rooftop: ['thug_hitman', 'drone_attack', 'swat_heavy', 'mushroom_mutant', 'boss_don'],
};

// 手配度★ごとに出現させる警察ユニット（spawner 用の参考）
export const COP_UNITS_BY_WANTED = {
  1: ['cop_patrol'],
  2: ['cop_patrol', 'drone_scout'],
  3: ['cop_patrol', 'cop_detective', 'drone_scout'],
  4: ['cop_detective', 'swat_trooper'],
  5: ['swat_trooper', 'swat_heavy'],
};
