// 敵データ（v2: 7地域・27フィールド・50種以上）
// aggro: 索敵距離 px（0 = 攻撃されるまで非アクティブ）, speed: px/s, w/h: 当たり判定
// drops: [{id, chance}] chance は 0〜1（ルークで倍率補正 → systems/loot.js）
// isCop: 倒すと手配度上昇（heat = 加算量）。spawner が町でのみ出す（habitats は空）
// boss: ボス（habitats は行き止まりマップ）。summon: ボスが呼ぶ手下
// habitats: 出現フィールドの mapId 配列（SPEC_V2 のID）。region: 地域ID（図鑑・背景テーマと同じ）
// civilian: 町の市民（殴ると手配度。経験値/図鑑なし）
import { ITEMS, looksFromIds } from './items.js';
import { baseEnemyExp, expToNext, REGION_EXP_MULT } from './balance.js';
import { ENEMY_LORE } from './lore.js';

// v3: タワー/アリーナのスケーリングでも使うため export
export const hpAt = (lv, m = 1) => Math.round((25 + 8 * lv + 0.35 * lv * lv) * m);
export const atkAt = (lv, m = 1) => Math.round((8 + 2.2 * lv + 0.04 * lv * lv) * m);
export const defAt = (lv, m = 1) => Math.round(lv * 0.7 * m);
const moneyAt = (lv, m = 1) => [Math.round((2 + lv * 2.5) * m), Math.round((6 + lv * 5) * m)];
const expAt = (lv, region, m = 1) => Math.max(1, Math.round(baseEnemyExp(lv) * (REGION_EXP_MULT[region] || 1) * m));

// 共通ドロップ（ティア別のポーション）
const POTS_LOW = [{ id: 'potion_red', chance: 0.12 }, { id: 'potion_blue', chance: 0.06 }];
const POTS_MID = [{ id: 'potion_orange', chance: 0.1 }, { id: 'potion_blue', chance: 0.08 }, { id: 'drink_energy', chance: 0.01 }];
const POTS_HIGH = [{ id: 'potion_white', chance: 0.08 }, { id: 'potion_mana', chance: 0.05 }, { id: 'power_elixir', chance: 0.01 }, { id: 'drink_tough', chance: 0.01 }];
const potsFor = (lv) => (lv < 16 ? POTS_LOW : lv < 40 ? POTS_MID : POTS_HIGH);

// 地域ごとの PET（超低確率 0.01%〜0.08%）
export const REGION_PETS = {
  beach: ['pet_slime', 'pet_flamingo'],
  downtown: ['pet_cat', 'pet_drone'],
  slums: ['pet_dolphin'],
  swamp: ['pet_gator'],
  casino: ['pet_ghost'],
  rooftop: ['pet_dragon'],
  spaceport: ['pet_robot', 'pet_alien'],
};
export const PET_CHANCE = { normal: 0.0003, elite: 0.0005, boss: 0.0008 };

// レベル帯に合う装備を自動で 3 つ選ぶ（id ハッシュで決定的）
const EQUIP_CHANCE = { common: 0.02, rare: 0.008, epic: 0.003, legendary: 0.001, mythic: 0.0003 };
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function equipPool(id, lv, n = 3) {
  const cands = Object.values(ITEMS).filter((it) => it.type === 'equip' && it.slot !== 'pet' && it.reqLevel <= lv + 2 && it.reqLevel >= lv - 16);
  if (!cands.length) return [];
  const out = [];
  let h = hash(id);
  for (let i = 0; i < n && cands.length; i++) {
    const k = h % cands.length;
    const it = cands.splice(k, 1)[0];
    out.push({ id: it.id, chance: EQUIP_CHANCE[it.rarity] || 0.001 });
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  }
  return out;
}

function mk(id, name, level, art, ai, region, habitats, o = {}) {
  const m = o.m || 1;
  const tier = o.boss ? 'boss' : (o.hpM || m) >= 1.3 ? 'elite' : 'normal';
  let drops = o.drops;
  if (!drops) {
    drops = [];
    if (o.mat) drops.push({ id: o.mat, chance: o.matChance ?? 0.5 });
    if (o.mat2) drops.push({ id: o.mat2, chance: 0.12 });
    drops.push(...potsFor(level), ...equipPool(id, level, o.equipN ?? 3), ...(o.extra || []));
  }
  if (!o.civilian && !o.isCop) for (const pid of REGION_PETS[region] || []) drops = [...drops, { id: pid, chance: PET_CHANCE[tier] }];
  // v3: ハックチップ・ペットフード（全モンスター共通の低確率ドロップ）
  if (!o.civilian && !o.isCop) {
    if (o.boss) drops = [...drops, { id: 'chip_reroll', chance: 0.6 }, { id: 'chip_lock', chance: 0.05 }, { id: 'pet_food', chance: 0.5 }];
    else {
      if (level >= 15) drops = [...drops, { id: 'chip_reroll', chance: tier === 'elite' || o.night ? 0.006 : 0.002 }];
      drops = [...drops, { id: 'pet_food', chance: 0.004 }];
    }
  }
  const def = {
    id, name, level, art, ai, region,
    habitats: [...(habitats || [])],
    hp: o.hp ?? hpAt(level, o.hpM ?? m),
    atk: o.atk ?? atkAt(level, o.atkM ?? 1),
    def: o.def ?? defAt(level, o.defM ?? 1),
    exp: o.exp ?? (o.civilian ? 0 : expAt(level, region, o.expM ?? m)),
    money: o.money ?? moneyAt(level, o.moneyM ?? m),
    speed: o.speed ?? 70,
    w: o.w ?? 40, h: o.h ?? 40,
    aggro: o.aggro ?? 0,
    drops,
    color: o.color || '#ffffff',
    boss: !!o.boss,
    isCop: !!o.isCop,
  };
  if (o.accent) def.accent = o.accent;
  if (o.civilian) def.civilian = true;
  if (o.heat) def.heat = o.heat;
  if (o.look) def.look = o.look;
  if (o.equip) def.equip = looksFromIds(o.equip);
  if (o.scale) def.scale = o.scale;
  if (o.shoot) def.shoot = o.shoot; // shooter/cop/boss/flyer 用: {range, interval, speed, damageMult}
  if (o.title) def.title = o.title;
  if (o.summon) def.summon = o.summon;
  if (o.desc) def.desc = o.desc;
  if (o.night) def.night = true; // v3: 夜（20〜5時）だけ出現。spawner は isNightNow(game) で判定
  def.lore = ENEMY_LORE[id] || o.desc || `${name}。ヴァイス・ベイの${o.civilian ? '住人' : '夜に潜む何か'}。`;
  return def;
}

// ボス用ステータス
function bossStats(lv, hpX, o = {}) {
  return {
    boss: true,
    hp: o.hp ?? Math.round(hpAt(lv) * hpX / 100) * 100,
    atk: Math.round(atkAt(lv) * (o.atkX ?? 1.6)),
    def: Math.round(defAt(lv) * 1.5),
    exp: Math.round(expToNext(lv) * (o.expX ?? 0.45)),
    money: moneyAt(lv, 30),
  };
}

// 人型の見た目ヘルパー
const LK = (body, skin, hair, hairColor, eyeColor = '#222222') => ({ body, skin, hair, hairColor, eyeColor });
const GUN_SHOT = (range, interval, speed, damageMult) => ({ range, interval, speed, damageMult });

const list = [
  // =====================================================================
  // beach 地域（町: beach / Lv1〜12）スライム・カニ・カモメ・クラゲ・フラミンゴ
  // =====================================================================
  mk('slime_green', 'ソーダスライム', 1, 'slime', 'jumper', 'beach', ['beach_f1'], {
    speed: 60, w: 40, h: 32, color: '#5cff9a',
    drops: [{ id: 'slime_jelly', chance: 0.55 }, ...POTS_LOW, { id: 'sandals_beach', chance: 0.02 }, { id: 'cap_street', chance: 0.02 }, { id: 'sunglasses_aviator', chance: 0.005 }],
  }),
  mk('crab_sand', 'サンドクラブ', 2, 'crab', 'walker', 'beach', ['beach_f1'], {
    speed: 75, w: 46, h: 30, color: '#ff8a5c', accent: '#ffe0c0', mat: 'crab_shell',
  }),
  mk('slime_pink', 'ストロベリースライム', 3, 'slime', 'jumper', 'beach', ['beach_f1', 'beach_f2'], {
    speed: 70, w: 42, h: 34, color: '#ff6fb5',
    drops: [{ id: 'slime_jelly', chance: 0.6 }, ...POTS_LOW, { id: 'tshirt_white', chance: 0.02 }, { id: 'shorts_beach', chance: 0.02 }, { id: 'pistol_9mm', chance: 0.01 }, { id: 'headphones_neon', chance: 0.002 }],
  }),
  mk('seagull_beach', 'ポテト泥棒カモメ', 4, 'seagull', 'flyer', 'beach', ['beach_f2'], {
    speed: 110, w: 44, h: 30, aggro: 240, color: '#f4f4f4', accent: '#ffb800', mat: 'seagull_feather',
  }),
  mk('mushroom_orange', 'ビーチマッシュ', 5, 'mushroom', 'walker', 'beach', ['beach_f2'], {
    speed: 55, w: 44, h: 48, color: '#ff8a00',
    drops: [{ id: 'mushroom_cap', chance: 0.5 }, ...POTS_LOW, { id: 'beanie_gray', chance: 0.02 }, { id: 'sunglasses_aviator', chance: 0.02 }, { id: 'knife_butterfly', chance: 0.003 }],
  }),
  mk('crab_hermit', 'ヤドカリ番長', 6, 'crab', 'charger', 'beach', ['beach_f2', 'beach_f3'], {
    speed: 120, w: 50, h: 40, aggro: 220, color: '#d8283c', accent: '#f0d8a0', hpM: 1.2, mat: 'crab_shell',
  }),
  mk('jellyfish_pier', 'ピアクラゲ', 7, 'jellyfish', 'flyer', 'beach', ['beach_f3'], {
    speed: 60, w: 40, h: 46, color: '#bff6ff', accent: '#ff6fb5', mat: 'jelly_tentacle',
  }),
  mk('flamingo', 'ヤンキーフラミンゴ', 7, 'flamingo', 'charger', 'beach', ['beach_f3', 'beach_f4'], {
    speed: 120, w: 40, h: 70, aggro: 260, color: '#ff7fb0',
    drops: [{ id: 'flamingo_feather', chance: 0.5 }, ...POTS_LOW, { id: 'hawaiian_shirt', chance: 0.02 }, { id: 'heels_red', chance: 0.004 }, { id: 'pistol_9mm', chance: 0.02 }],
  }),
  mk('slime_wave', 'ビッグウェーブスライム', 8, 'slime', 'jumper', 'beach', ['beach_f3'], {
    speed: 80, w: 50, h: 40, color: '#4da6ff', accent: '#ffffff', mat: 'slime_jelly', scale: 1.2,
  }),
  mk('mushroom_cone', 'コーンマッシュ', 9, 'mushroom', 'walker', 'beach', ['beach_f4'], {
    speed: 65, w: 44, h: 50, color: '#ff5c1f', accent: '#ffffff', mat: 'mushroom_cap',
  }),
  mk('seagull_highway', 'ハイウェイカモメ', 10, 'seagull', 'flyer', 'beach', ['beach_f4'], {
    speed: 150, w: 46, h: 30, aggro: 300, color: '#c9ccd6', accent: '#ff3d7f', mat: 'seagull_feather',
  }),
  mk('crab_iron', 'アイアンクラブ', 11, 'crab', 'charger', 'beach', ['beach_f4'], {
    speed: 130, w: 54, h: 40, aggro: 260, color: '#7a7f8c', accent: '#ffd23f', hpM: 1.3, defM: 1.5, mat: 'crab_shell', mat2: 'rusty_bolt',
  }),

  // =====================================================================
  // downtown 地域（Lv10〜22）チンピラ・ネズミ・ネオンキノコ・ドローン
  // =====================================================================
  mk('thug_punk', 'ストリートチンピラ', 11, 'thug', 'walker', 'downtown', ['down_f1', 'down_f4'], {
    speed: 90, w: 32, h: 70, aggro: 320, color: '#39ff6a',
    look: LK('m', '#d9a27a', 'spiky', '#39ff6a'),
    equip: { hat: 'bandana_red', top: 'tank_black', bottom: 'jeans_blue', shoes: 'sneakers_white', weapon: 'bat_wood' },
    drops: [{ id: 'street_tag', chance: 0.5 }, ...POTS_LOW, { id: 'bandana_red', chance: 0.02 }, { id: 'tank_black', chance: 0.02 }, { id: 'katana_steel', chance: 0.01 }, { id: 'bat_nail', chance: 0.005 }, { id: 'gold_chain', chance: 0.003 }],
  }),
  mk('rat_alley', 'ドブネズミ', 11, 'rat', 'walker', 'downtown', ['down_f1'], {
    speed: 120, w: 40, h: 26, color: '#7a6a5a', accent: '#ff8ac8', mat: 'rat_tail',
  }),
  mk('mushroom_neon', 'ネオンキノコ', 12, 'mushroom', 'jumper', 'downtown', ['down_f1'], {
    speed: 65, w: 46, h: 50, color: '#b04dff',
    drops: [{ id: 'mushroom_cap', chance: 0.55 }, { id: 'neon_bulb', chance: 0.2 }, ...POTS_MID, { id: 'scarf_red', chance: 0.02 }, { id: 'staff_neon', chance: 0.004 }, { id: 'headphones_neon', chance: 0.005 }],
  }),
  mk('drone_peeping', 'のぞき見ドローン', 13, 'drone', 'flyer', 'downtown', ['down_f1'], {
    speed: 100, w: 42, h: 28, aggro: 360, color: '#ff8a00', accent: '#19f0ff', mat: 'drone_chip',
  }),
  mk('rat_subway', 'メトロラット', 14, 'rat', 'charger', 'downtown', ['down_f2'], {
    speed: 150, w: 44, h: 28, aggro: 280, color: '#4a4a58', accent: '#ffd23f', mat: 'rat_tail',
  }),
  mk('thug_graffiti', 'グラフィティ小僧', 15, 'thug', 'shooter', 'downtown', ['down_f2'], {
    speed: 85, w: 32, h: 70, aggro: 420, color: '#ff3dd2',
    look: LK('m', '#e8b48a', 'short', '#ff3dd2'),
    equip: { hat: 'cap_street', top: 'hoodie_pink', bottom: 'cargo_khaki', shoes: 'sneakers_white', weapon: 'pistol_9mm' },
    shoot: GUN_SHOT(420, 1.8, 600, 0.7), mat: 'street_tag', mat2: 'neon_bulb',
  }),
  mk('mushroom_glow', 'グロウマッシュ', 16, 'mushroom', 'walker', 'downtown', ['down_f2'], {
    speed: 60, w: 46, h: 52, color: '#5cff9a', accent: '#19f0ff', mat: 'mushroom_cap', mat2: 'neon_bulb',
  }),
  mk('thug_skater', 'スケボー・チンピラ', 15, 'thug', 'charger', 'downtown', ['down_f4'], {
    speed: 160, w: 32, h: 70, aggro: 320, color: '#19f0ff',
    look: LK('f', '#f0c8a0', 'bob', '#19f0ff'),
    equip: { hat: 'beanie_gray', top: 'tshirt_white', bottom: 'shorts_beach', shoes: 'sneakers_white', weapon: 'bat_wood' },
    mat: 'street_tag',
  }),
  mk('mushroom_park', 'ピクニックマッシュ', 17, 'mushroom', 'jumper', 'downtown', ['down_f4'], {
    speed: 70, w: 46, h: 50, color: '#ff6fb5', accent: '#ffffff', mat: 'mushroom_cap',
  }),
  mk('drone_toy', 'ラジコン・ドローン', 18, 'drone', 'flyer', 'downtown', ['down_f4'], {
    speed: 130, w: 40, h: 26, aggro: 380, color: '#ffd23f', accent: '#d8283c', mat: 'drone_chip',
    shoot: GUN_SHOT(360, 2.2, 500, 0.5),
  }),
  mk('drone_traffic', '交通監視ドローン', 18, 'drone', 'flyer', 'downtown', ['down_f3'], {
    speed: 120, w: 44, h: 30, aggro: 420, color: '#d8283c', accent: '#f4f4f4', mat: 'drone_chip',
    shoot: GUN_SHOT(420, 2.0, 600, 0.55),
  }),
  mk('thug_biker', 'ハイウェイ・ライダー', 20, 'thug', 'charger', 'downtown', ['down_f3'], {
    speed: 170, w: 34, h: 72, aggro: 360, color: '#ff8a00',
    look: LK('m', '#c98e62', 'wolf', '#16161e'),
    equip: { hat: 'helmet_moto', top: 'leather_jacket', bottom: 'jeans_blue', shoes: 'boots_black', weapon: 'bat_nail' },
    mat: 'street_tag', mat2: 'rusty_bolt',
  }),
  mk('rat_neon', 'ネオンラット', 21, 'rat', 'jumper', 'downtown', ['down_f3'], {
    speed: 140, w: 44, h: 28, aggro: 300, color: '#ff3dd2', accent: '#19f0ff', hpM: 1.2, mat: 'rat_tail', mat2: 'neon_bulb',
  }),

  // =====================================================================
  // slums 地域（Lv20〜36）港湾ギャング・毒スライム・ネズミ・サビ機械
  // =====================================================================
  mk('thug_dockhand', '港のゴロツキ', 21, 'thug', 'charger', 'slums', ['slums_f1'], {
    speed: 130, w: 34, h: 72, aggro: 340, color: '#ff8a00',
    look: LK('m', '#a8704a', 'short', '#111111', '#331a00'),
    equip: { hat: 'beanie_gray', top: 'tank_black', bottom: 'cargo_khaki', shoes: 'boots_black', weapon: 'bat_nail' },
    drops: [{ id: 'stolen_vinyl', chance: 0.4 }, { id: 'street_tag', chance: 0.3 }, ...POTS_MID, { id: 'cargo_khaki', chance: 0.02 }, { id: 'tracksuit_green', chance: 0.01 }, { id: 'bat_nail', chance: 0.01 }, { id: 'guitar_electric', chance: 0.004 }],
  }),
  mk('slime_toxic', 'ヘドロスライム', 22, 'slime', 'jumper', 'slums', ['slums_f1'], {
    speed: 80, w: 48, h: 38, color: '#a6ff00',
    drops: [{ id: 'toxic_goo', chance: 0.55 }, ...POTS_MID, { id: 'track_pants', chance: 0.01 }, { id: 'gold_chain', chance: 0.005 }],
  }),
  mk('rat_dock', 'ドックラット', 23, 'rat', 'charger', 'slums', ['slums_f1'], {
    speed: 150, w: 46, h: 30, aggro: 300, color: '#5a4a3a', accent: '#a6ff00', mat: 'rat_tail', mat2: 'toxic_goo',
  }),
  mk('flamingo_punk', 'パンク・フラミンゴ', 25, 'flamingo', 'charger', 'slums', ['slums_f2'], {
    speed: 160, w: 42, h: 74, aggro: 320, color: '#b04dff',
    drops: [{ id: 'flamingo_feather', chance: 0.5 }, ...POTS_MID, { id: 'heels_red', chance: 0.01 }, { id: 'smg_compact', chance: 0.006 }, { id: 'mask_skull', chance: 0.006 }],
  }),
  mk('thug_gunner', 'ギャングの鉄砲玉', 27, 'thug', 'shooter', 'slums', ['slums_f2'], {
    speed: 85, w: 32, h: 70, aggro: 480, color: '#d8283c',
    look: LK('f', '#e8b48a', 'ponytail', '#d8283c'),
    equip: { hat: 'cap_street', top: 'tracksuit_green', bottom: 'track_pants', shoes: 'sneakers_white', accessory: 'sunglasses_aviator', weapon: 'smg_compact' },
    shoot: GUN_SHOT(460, 1.4, 700, 0.7),
    drops: [{ id: 'street_tag', chance: 0.5 }, ...POTS_MID, { id: 'smg_compact', chance: 0.01 }, { id: 'tracksuit_green', chance: 0.015 }, { id: 'pistol_gold', chance: 0.002 }],
  }),
  mk('slime_oil', 'オイルスライム', 29, 'slime', 'jumper', 'slums', ['slums_f2'], {
    speed: 85, w: 50, h: 40, color: '#2a2a30', accent: '#ff8a00', mat: 'toxic_goo', mat2: 'rusty_bolt',
  }),
  mk('thug_smuggler', '密輸船の船員', 30, 'thug', 'walker', 'slums', ['slums_f3'], {
    speed: 100, w: 34, h: 72, aggro: 360, color: '#3a5a8c',
    look: LK('m', '#c08a60', 'short', '#4a3020'),
    equip: { hat: 'bandana_red', top: 'tank_black', bottom: 'cargo_khaki', shoes: 'boots_black', weapon: 'knife_butterfly' },
    mat: 'stolen_vinyl', mat2: 'pirate_map',
  }),
  mk('rat_ship', 'ふなネズミ', 31, 'rat', 'jumper', 'slums', ['slums_f3'], {
    speed: 150, w: 44, h: 28, aggro: 300, color: '#8a7a52', accent: '#ffffff', mat: 'rat_tail',
  }),
  mk('crab_rust', 'サビガニ', 32, 'crab', 'charger', 'slums', ['slums_f3'], {
    speed: 130, w: 56, h: 42, aggro: 280, color: '#a8502a', accent: '#5a3a22', hpM: 1.3, defM: 1.4, mat: 'crab_shell', mat2: 'rusty_bolt',
  }),
  mk('rat_giant', 'ジャイアントラット', 32, 'rat', 'charger', 'slums', ['slums_f4'], {
    speed: 140, w: 60, h: 40, aggro: 320, color: '#4a3a2a', accent: '#d8283c', hpM: 1.3, scale: 1.4, mat: 'rat_tail',
  }),
  mk('thug_scrapper', 'スクラップ屋', 33, 'thug', 'walker', 'slums', ['slums_f4'], {
    speed: 95, w: 36, h: 74, aggro: 340, color: '#8a8a8a',
    look: LK('f', '#a8704a', 'long', '#2a2018'),
    equip: { hat: 'helmet_moto', top: 'tank_black', bottom: 'cargo_khaki', shoes: 'boots_black', accessory: 'mask_skull', weapon: 'guitar_electric' },
    mat: 'rusty_bolt',
  }),
  mk('robot_scrap', 'スクラップロボ', 35, 'robot', 'walker', 'slums', ['slums_f4'], {
    speed: 80, w: 46, h: 60, aggro: 300, color: '#a8502a', accent: '#ffd23f', hpM: 1.3, defM: 1.5, mat: 'robot_gear', mat2: 'rusty_bolt',
  }),

  // =====================================================================
  // swamp 地域（Lv22〜45）ワニ・ヘビ・蚊・沼キノコ
  // =====================================================================
  mk('mosquito_swamp', 'ヌマカ', 23, 'mosquito', 'flyer', 'swamp', ['swamp_f1'], {
    speed: 140, w: 34, h: 26, aggro: 340, color: '#6a8f2a', accent: '#d8283c', mat: 'mosquito_wing',
  }),
  mk('snake_reed', 'アシヘビ', 25, 'snake', 'walker', 'swamp', ['swamp_f1'], {
    speed: 100, w: 60, h: 24, aggro: 260, color: '#8fbf3a', accent: '#ffd23f', mat: 'snake_skin',
  }),
  mk('mushroom_bog', '沼地の毒キノコ', 26, 'mushroom', 'walker', 'swamp', ['swamp_f1'], {
    speed: 60, w: 48, h: 52, color: '#6a8f2a',
    drops: [{ id: 'mushroom_cap', chance: 0.5 }, ...POTS_MID, { id: 'staff_neon', chance: 0.008 }, { id: 'loafers_brown', chance: 0.02 }],
  }),
  mk('gator_swamp', '沼ワニ', 27, 'gator', 'charger', 'swamp', ['swamp_f1', 'swamp_f2'], {
    speed: 120, w: 90, h: 40, aggro: 300, color: '#3f8f3a', hpM: 1.2,
    drops: [{ id: 'gator_tooth', chance: 0.5 }, ...POTS_MID, { id: 'cowboy_hat', chance: 0.01 }, { id: 'boots_black', chance: 0.02 }, { id: 'katana_blood', chance: 0.002 }],
  }),
  mk('snake_mangrove', 'マングローブ・ボア', 32, 'snake', 'charger', 'swamp', ['swamp_f2'], {
    speed: 140, w: 70, h: 28, aggro: 300, color: '#3a5a2a', accent: '#c9a26a', hpM: 1.2, mat: 'snake_skin',
  }),
  mk('mosquito_giant', 'オオヌマカ', 33, 'mosquito', 'flyer', 'swamp', ['swamp_f2'], {
    speed: 150, w: 42, h: 32, aggro: 360, color: '#4a6a2a', accent: '#ff3d3d', scale: 1.3, mat: 'mosquito_wing',
    shoot: GUN_SHOT(360, 2.4, 450, 0.5),
  }),
  mk('mushroom_spore', 'ガスマッシュ', 35, 'mushroom', 'jumper', 'swamp', ['swamp_f2'], {
    speed: 70, w: 50, h: 54, color: '#9a6aff', accent: '#a6ff00', mat: 'mushroom_cap', mat2: 'toxic_goo',
  }),
  mk('gator_albino', 'アルビノゲイター', 38, 'gator', 'charger', 'swamp', ['swamp_f3'], {
    speed: 150, w: 96, h: 42, aggro: 340, color: '#f0f0e8', hpM: 1.3, expM: 1.3,
    drops: [{ id: 'gator_tooth', chance: 0.5 }, { id: 'gator_scale', chance: 0.15 }, ...POTS_HIGH, { id: 'helmet_moto', chance: 0.004 }, { id: 'idol_dress', chance: 0.003 }, { id: 'boots_rocket', chance: 0.001 }],
  }),
  mk('snake_king', 'ヌシヘビ', 40, 'snake', 'charger', 'swamp', ['swamp_f3'], {
    speed: 150, w: 80, h: 32, aggro: 340, color: '#ffd23f', accent: '#16161e', hpM: 1.3, scale: 1.3, mat: 'snake_skin',
  }),
  mk('mosquito_queen', 'ヌマカの女王', 42, 'mosquito', 'flyer', 'swamp', ['swamp_f3'], {
    speed: 130, w: 48, h: 36, aggro: 400, color: '#b04dff', accent: '#ff3d3d', hpM: 1.2, scale: 1.5, mat: 'mosquito_wing',
    shoot: GUN_SHOT(420, 2.0, 500, 0.55),
  }),
  mk('snake_fog', 'キリヘビ', 39, 'snake', 'walker', 'swamp', ['swamp_f4'], {
    speed: 110, w: 64, h: 26, aggro: 280, color: '#c9ccd6', accent: '#19d3a0', mat: 'snake_skin',
  }),
  mk('mushroom_fog', 'キリタケ', 41, 'mushroom', 'walker', 'swamp', ['swamp_f4'], {
    speed: 60, w: 48, h: 54, color: '#bff6ff', accent: '#7a7f8c', mat: 'mushroom_cap',
  }),
  mk('gator_fog', 'ミスト・ゲイター', 43, 'gator', 'charger', 'swamp', ['swamp_f4'], {
    speed: 140, w: 92, h: 40, aggro: 320, color: '#7a9a8a', accent: '#ffffff', hpM: 1.3, mat: 'gator_tooth',
  }),

  // =====================================================================
  // casino 地域（Lv42〜60）チップの亡霊・ガードマン・金スライム・ロボ
  // =====================================================================
  mk('snake_rattle', 'ガラガラヘビ', 43, 'snake', 'charger', 'casino', ['casino_f1'], {
    speed: 150, w: 64, h: 26, aggro: 300, color: '#c9a26a', accent: '#5a3a22', mat: 'snake_skin',
  }),
  mk('robot_slot', 'スロットロボ', 45, 'robot', 'walker', 'casino', ['casino_f1'], {
    speed: 80, w: 46, h: 60, aggro: 300, color: '#d8283c', accent: '#ffd23f', mat: 'robot_gear', mat2: 'casino_chip',
  }),
  mk('thug_desert', 'デザート・ライダー', 47, 'thug', 'charger', 'casino', ['casino_f1'], {
    speed: 170, w: 34, h: 72, aggro: 380, color: '#e8c27a',
    look: LK('m', '#a8704a', 'long', '#e8c27a'),
    equip: { hat: 'cowboy_hat', top: 'leather_jacket', bottom: 'jeans_blue', shoes: 'boots_black', accessory: 'sunglasses_aviator', weapon: 'katana_steel' },
    mat: 'street_tag',
  }),
  mk('slime_gold', 'ゴールドスライム', 50, 'slime', 'jumper', 'casino', ['casino_f2'], {
    speed: 90, w: 46, h: 36, color: '#ffd23f', expM: 1.3, moneyM: 4,
    drops: [{ id: 'gold_bar', chance: 0.08 }, { id: 'casino_chip', chance: 0.4 }, { id: 'diamond', chance: 0.005 }, { id: 'drink_lucky', chance: 0.02 }, { id: 'guitar_thunder', chance: 0.003 }],
  }),
  mk('ghost_chip', 'チップの亡霊', 51, 'ghost', 'flyer', 'casino', ['casino_f2'], {
    speed: 100, w: 42, h: 50, aggro: 360, color: '#e8f0ff', accent: '#ff3d7f', mat: 'ghost_wisp', mat2: 'casino_chip',
  }),
  mk('thug_bouncer', 'カジノの用心棒', 52, 'thug', 'walker', 'casino', ['casino_f2'], {
    speed: 95, w: 38, h: 78, aggro: 360, color: '#ffd23f', hpM: 1.4, scale: 1.1,
    look: LK('m', '#8a5a3a', 'short', '#000000', '#000000'),
    equip: { top: 'suit_black', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'gold_chain', weapon: null },
    drops: [{ id: 'casino_chip', chance: 0.55 }, ...POTS_HIGH, { id: 'gold_chain_heavy', chance: 0.004 }, { id: 'suit_black', chance: 0.015 }, { id: 'gold_bar', chance: 0.02 }],
  }),
  mk('drone_casino', 'セキュリティドローン', 53, 'drone', 'flyer', 'casino', ['casino_f2', 'casino_f3'], {
    speed: 140, w: 46, h: 32, aggro: 460, color: '#ff3dd2',
    shoot: GUN_SHOT(420, 1.8, 600, 0.6),
    drops: [{ id: 'drone_chip', chance: 0.5 }, { id: 'casino_chip', chance: 0.3 }, ...POTS_HIGH, { id: 'sneakers_neon', chance: 0.004 }, { id: 'cat_ears_neon', chance: 0.003 }],
  }),
  mk('ghost_neon', 'ネオンゴースト', 53, 'ghost', 'flyer', 'casino', ['casino_f4'], {
    speed: 110, w: 42, h: 50, aggro: 380, color: '#19f0ff', accent: '#ff3dd2', mat: 'ghost_wisp', mat2: 'neon_bulb',
  }),
  mk('slime_diamond', 'ダイヤスライム', 55, 'slime', 'jumper', 'casino', ['casino_f4'], {
    speed: 95, w: 46, h: 36, color: '#bff6ff', accent: '#ffffff', defM: 2, moneyM: 3, mat: 'casino_chip',
    extra: [{ id: 'diamond', chance: 0.008 }],
  }),
  mk('robot_valet', 'バレー・ロボ', 56, 'robot', 'charger', 'casino', ['casino_f4'], {
    speed: 150, w: 46, h: 60, aggro: 340, color: '#15151b', accent: '#ffd23f', hpM: 1.2, mat: 'robot_gear',
  }),
  mk('thug_vip', 'VIPガード', 56, 'thug', 'shooter', 'casino', ['casino_f3'], {
    speed: 100, w: 34, h: 74, aggro: 520, color: '#15151b', hpM: 1.2,
    look: LK('f', '#e0b090', 'bob', '#16161e', '#d8283c'),
    equip: { top: 'suit_black', bottom: 'suit_pants', shoes: 'heels_red', accessory: 'sunglasses_neon', weapon: 'pistol_gold' },
    shoot: GUN_SHOT(520, 1.2, 800, 0.65), mat: 'casino_chip', extra: [{ id: 'gold_bar', chance: 0.03 }],
  }),
  mk('ghost_jackpot', 'ジャックポット・ゴースト', 57, 'ghost', 'flyer', 'casino', ['casino_f3'], {
    speed: 120, w: 48, h: 56, aggro: 420, color: '#ffd23f', accent: '#ff3d7f', hpM: 1.2, scale: 1.3, mat: 'ghost_wisp', moneyM: 2,
    shoot: GUN_SHOT(400, 2.2, 500, 0.55),
  }),
  mk('robot_dealer', 'ディーラーロボ', 58, 'robot', 'shooter', 'casino', ['casino_f3'], {
    speed: 80, w: 48, h: 62, aggro: 460, color: '#1fae5b', accent: '#ffd23f', hpM: 1.3, mat: 'robot_gear', mat2: 'casino_chip',
    shoot: GUN_SHOT(480, 1.5, 650, 0.6),
  }),

  // =====================================================================
  // rooftop 地域（タワー Lv58〜78）ヒットマン・傭兵・アタックドローン・ゴーレム
  // =====================================================================
  mk('robot_worker', '建設ロボ', 59, 'robot', 'walker', 'rooftop', ['tower_f1'], {
    speed: 85, w: 48, h: 62, aggro: 300, color: '#ffb800', accent: '#16161e', hpM: 1.2, mat: 'robot_gear', mat2: 'rusty_bolt',
  }),
  mk('thug_hitman', 'ドンの殺し屋', 60, 'thug', 'shooter', 'rooftop', ['tower_f1'], {
    speed: 110, w: 32, h: 72, aggro: 600, color: '#16161e', hpM: 1.2,
    look: LK('f', '#f0c8a0', 'long', '#16161e', '#d8283c'),
    equip: { top: 'suit_black', bottom: 'skirt_pink', shoes: 'heels_red', accessory: 'sunglasses_neon', weapon: 'pistol_gold' },
    shoot: GUN_SHOT(560, 1.1, 850, 0.7),
    drops: [{ id: 'gold_bar', chance: 0.05 }, ...POTS_HIGH, { id: 'pistol_gold', chance: 0.008 }, { id: 'skirt_star', chance: 0.002 }, { id: 'neon_sword', chance: 0.001 }, { id: 'halo_angel', chance: 0.001 }],
  }),
  mk('golem_steel', 'スチールゴーレム', 61, 'golem', 'walker', 'rooftop', ['tower_f1'], {
    speed: 60, w: 64, h: 90, aggro: 260, color: '#7a7f8c', accent: '#ff8a00', hpM: 1.6, defM: 1.5, expM: 1.3, scale: 1.2, mat: 'golem_core', matChance: 0.2, mat2: 'rusty_bolt',
  }),
  mk('drone_attack', 'アサルトドローン', 63, 'drone', 'flyer', 'rooftop', ['tower_f1', 'tower_f2'], {
    speed: 170, w: 50, h: 34, aggro: 560, color: '#ff3d3d', hpM: 1.1,
    shoot: GUN_SHOT(500, 1.2, 750, 0.6),
    drops: [{ id: 'drone_chip', chance: 0.5 }, { id: 'neon_core', chance: 0.01 }, ...POTS_HIGH, { id: 'smg_neon', chance: 0.003 }, { id: 'wings_angel', chance: 0.002 }],
  }),
  mk('mushroom_mutant', 'ミュータント・マッシュ', 65, 'mushroom', 'jumper', 'rooftop', ['tower_f2'], {
    speed: 90, w: 56, h: 60, aggro: 300, color: '#ff3d7f', hpM: 1.5, expM: 1.4, scale: 1.2,
    drops: [{ id: 'mushroom_cap', chance: 0.5 }, { id: 'diamond', chance: 0.004 }, ...POTS_HIGH, { id: 'staff_moon', chance: 0.002 }, { id: 'heels_glass', chance: 0.001 }],
  }),
  mk('golem_garden', 'ガーデンゴーレム', 66, 'golem', 'walker', 'rooftop', ['tower_f2'], {
    speed: 60, w: 64, h: 90, aggro: 260, color: '#3f8f3a', accent: '#ff6fb5', hpM: 1.5, expM: 1.3, scale: 1.2, mat: 'golem_core', matChance: 0.2,
  }),
  mk('thug_merc', '傭兵スナイパー', 68, 'thug', 'shooter', 'rooftop', ['tower_f2'], {
    speed: 100, w: 34, h: 72, aggro: 620, color: '#3b4231', hpM: 1.3, defM: 1.4,
    look: LK('m', '#b07a52', 'short', '#111111', '#ff3d3d'),
    equip: { hat: 'helmet_moto', top: 'armor_vest', bottom: 'armor_pants', shoes: 'boots_black', accessory: 'mask_skull', weapon: 'smg_compact' },
    shoot: GUN_SHOT(620, 1.0, 900, 0.55), mat: 'drone_chip',
  }),
  mk('thug_elite', 'ドン親衛隊', 72, 'thug', 'charger', 'rooftop', ['tower_f3'], {
    speed: 160, w: 36, h: 76, aggro: 520, color: '#ffd23f', hpM: 1.4,
    look: LK('m', '#d0a070', 'wolf', '#e8e8e8', '#ffd23f'),
    equip: { hat: 'crown_gold', top: 'suit_gold', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'gold_chain_heavy', weapon: 'katana_blood' },
    mat: 'gold_bar', matChance: 0.05,
  }),
  mk('golem_gold', 'ゴールドゴーレム', 73, 'golem', 'walker', 'rooftop', ['tower_f3'], {
    speed: 65, w: 66, h: 92, aggro: 280, color: '#ffd23f', accent: '#ff3d7f', hpM: 1.6, defM: 1.5, expM: 1.3, scale: 1.25, moneyM: 3, mat: 'golem_core', matChance: 0.25,
  }),
  mk('drone_guardian', 'ガーディアンドローン', 74, 'drone', 'flyer', 'rooftop', ['tower_f3'], {
    speed: 170, w: 54, h: 36, aggro: 600, color: '#ffd23f', accent: '#16161e', hpM: 1.2,
    shoot: GUN_SHOT(560, 1.0, 850, 0.55), mat: 'drone_chip', extra: [{ id: 'neon_core', chance: 0.015 }],
  }),

  // =====================================================================
  // spaceport 地域（Lv36〜100）ロボ・エイリアン・宇宙クラゲ
  // =====================================================================
  mk('robot_patrol', 'パトロールボット', 37, 'robot', 'walker', 'spaceport', ['space_f1'], {
    speed: 90, w: 46, h: 60, aggro: 340, color: '#e8eef8', accent: '#19f0ff', mat: 'robot_gear',
  }),
  mk('jelly_coast', 'コーストクラゲ', 38, 'jellyfish', 'flyer', 'spaceport', ['space_f1'], {
    speed: 70, w: 42, h: 48, color: '#7a3dff', accent: '#19f0ff', mat: 'jelly_tentacle',
  }),
  mk('seagull_jet', 'ジェットカモメ', 40, 'seagull', 'flyer', 'spaceport', ['space_f1'], {
    speed: 190, w: 48, h: 30, aggro: 380, color: '#f4f4f4', accent: '#ff8a00', mat: 'seagull_feather',
  }),
  mk('robot_loader', '搬入ロボ', 44, 'robot', 'charger', 'spaceport', ['space_f2'], {
    speed: 140, w: 52, h: 64, aggro: 320, color: '#ff8a00', accent: '#16161e', hpM: 1.3, mat: 'robot_gear',
  }),
  mk('drone_launch', '発射管制ドローン', 46, 'drone', 'flyer', 'spaceport', ['space_f2'], {
    speed: 150, w: 46, h: 30, aggro: 460, color: '#e8eef8', accent: '#d8283c', mat: 'drone_chip',
    shoot: GUN_SHOT(460, 1.6, 650, 0.55),
  }),
  mk('slime_fuel', 'ロケット燃料スライム', 47, 'slime', 'jumper', 'spaceport', ['space_f2'], {
    speed: 100, w: 48, h: 38, color: '#ff3d3d', accent: '#ffd23f', mat: 'slime_jelly', mat2: 'toxic_goo',
  }),
  mk('alien_grey', 'グレイ', 49, 'alien', 'shooter', 'spaceport', ['space_f2'], {
    speed: 90, w: 34, h: 56, aggro: 480, color: '#c9ccd6', accent: '#16161e', mat: 'alien_crystal', matChance: 0.15,
    shoot: GUN_SHOT(480, 1.6, 600, 0.6),
  }),
  mk('alien_moon', 'ムーン・エイリアン', 77, 'alien', 'jumper', 'spaceport', ['space_f3'], {
    speed: 110, w: 36, h: 58, aggro: 420, color: '#5cff9a', accent: '#7a3dff', mat: 'alien_crystal', matChance: 0.2, mat2: 'moon_rock',
  }),
  mk('jelly_cosmic', 'コズミッククラゲ', 79, 'jellyfish', 'flyer', 'spaceport', ['space_f3'], {
    speed: 80, w: 48, h: 56, aggro: 360, color: '#ff3dd2', accent: '#fff06a', scale: 1.3, mat: 'jelly_tentacle',
    shoot: GUN_SHOT(400, 2.2, 450, 0.5),
  }),
  mk('robot_lunar', 'ルナローバー', 81, 'robot', 'charger', 'spaceport', ['space_f3'], {
    speed: 150, w: 54, h: 60, aggro: 360, color: '#c9ccd6', accent: '#ffd23f', hpM: 1.3, mat: 'robot_gear', mat2: 'moon_rock',
  }),
  mk('golem_moon', 'ムーンゴーレム', 83, 'golem', 'walker', 'spaceport', ['space_f3'], {
    speed: 70, w: 68, h: 94, aggro: 300, color: '#e8eef8', accent: '#7a3dff', hpM: 1.6, defM: 1.5, expM: 1.3, scale: 1.25, mat: 'golem_core', matChance: 0.25, mat2: 'moon_rock',
  }),
  mk('alien_warrior', 'エイリアン戦士', 88, 'alien', 'charger', 'spaceport', ['space_f4'], {
    speed: 170, w: 38, h: 62, aggro: 520, color: '#5cff9a', accent: '#d8283c', hpM: 1.3, mat: 'alien_crystal', matChance: 0.25,
  }),
  mk('jelly_void', 'ヴォイドクラゲ', 91, 'jellyfish', 'flyer', 'spaceport', ['space_f4'], {
    speed: 90, w: 50, h: 58, aggro: 420, color: '#2a1a5c', accent: '#19f0ff', scale: 1.4, mat: 'jelly_tentacle',
    shoot: GUN_SHOT(460, 1.8, 550, 0.55),
  }),
  mk('robot_xeno', 'ゼノメカ', 94, 'robot', 'shooter', 'spaceport', ['space_f4'], {
    speed: 100, w: 52, h: 66, aggro: 560, color: '#7a3dff', accent: '#5cff9a', hpM: 1.4, defM: 1.4, mat: 'robot_gear', mat2: 'alien_crystal',
    shoot: GUN_SHOT(560, 1.1, 800, 0.55),
  }),
  mk('ghost_astral', 'アストラル体', 96, 'ghost', 'flyer', 'spaceport', ['space_f4'], {
    speed: 130, w: 46, h: 56, aggro: 480, color: '#bff6ff', accent: '#7a3dff', hpM: 1.2, mat: 'ghost_wisp', mat2: 'alien_crystal',
  }),

  // =====================================================================
  // 町の市民（町でのみ spawner が出す。殴ると手配度UP・逃げる）
  // =====================================================================
  mk('civilian_tourist', '観光客', 1, 'civilian', 'civilian', 'town', [], {
    civilian: true, hp: 40, atk: 0, def: 0, money: [5, 30], speed: 60, w: 30, h: 68, color: '#ff8a00',
    drops: [{ id: 'potion_red', chance: 0.05 }, { id: 'seagull_feather', chance: 0.05 }],
  }),
  mk('civilian_business', 'ビジネスマン', 1, 'civilian', 'civilian', 'town', [], {
    civilian: true, hp: 45, atk: 0, def: 0, money: [15, 60], speed: 70, w: 30, h: 70, color: '#15151b',
    drops: [{ id: 'drink_energy', chance: 0.01 }],
  }),
  mk('civilian_skater', 'スケーター', 1, 'civilian', 'civilian', 'town', [], {
    civilian: true, hp: 40, atk: 0, def: 0, money: [3, 20], speed: 110, w: 30, h: 68, color: '#19f0ff',
    drops: [{ id: 'street_tag', chance: 0.05 }],
  }),
  mk('civilian_granny', 'おばあちゃん', 1, 'civilian', 'civilian', 'town', [], {
    civilian: true, hp: 35, atk: 0, def: 0, money: [10, 40], speed: 40, w: 30, h: 62, color: '#c9a26a',
    drops: [{ id: 'potion_orange', chance: 0.05 }],
  }),
  mk('civilian_dancer', 'ストリートダンサー', 1, 'civilian', 'civilian', 'town', [], {
    civilian: true, hp: 40, atk: 0, def: 0, money: [5, 25], speed: 90, w: 30, h: 70, color: '#ff3dd2',
    drops: [{ id: 'stolen_vinyl', chance: 0.03 }],
  }),

  // =====================================================================
  // 警察エスカレーション（spawner が手配度に応じて町でのみ出す。habitats は空）
  // =====================================================================
  mk('cop_patrol', 'パトロール警官', 14, 'cop', 'cop', 'police', [], {
    speed: 110, w: 32, h: 70, aggro: 500, color: '#3a6bff', isCop: true, heat: 3,
    look: LK('m', '#c98e62', 'short', '#2a1a10', '#1a2a4a'),
    equip: { hat: 'cap_street', top: 'police_uniform', bottom: 'suit_pants', shoes: 'loafers_brown', weapon: 'pistol_9mm' },
    shoot: GUN_SHOT(420, 1.6, 650, 0.8),
    drops: [{ id: 'cop_badge', chance: 0.35 }, ...POTS_MID, { id: 'police_uniform', chance: 0.01 }, { id: 'pistol_9mm', chance: 0.03 }, { id: 'smg_compact', chance: 0.004 }],
  }),
  mk('drone_scout', '監視ドローン', 16, 'drone', 'flyer', 'police', [], {
    speed: 100, w: 44, h: 30, aggro: 420, color: '#19f0ff', isCop: true, heat: 1,
    drops: [{ id: 'drone_chip', chance: 0.5 }, ...POTS_MID, { id: 'sunglasses_neon', chance: 0.004 }, { id: 'headphones_neon', chance: 0.01 }],
  }),
  mk('cop_detective', '覆面刑事', 30, 'cop', 'cop', 'police', [], {
    speed: 120, w: 32, h: 70, aggro: 560, color: '#5a5a66', isCop: true, heat: 4,
    look: LK('m', '#e0b090', 'short', '#4a3020', '#223344'),
    equip: { top: 'suit_black', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'sunglasses_aviator', weapon: 'pistol_9mm' },
    shoot: GUN_SHOT(480, 1.2, 750, 0.8),
    drops: [{ id: 'cop_badge', chance: 0.4 }, ...POTS_HIGH, { id: 'suit_black', chance: 0.01 }, { id: 'pistol_gold', chance: 0.004 }],
  }),
  mk('swat_trooper', 'SWAT隊員', 36, 'swat', 'cop', 'police', [], {
    speed: 115, w: 34, h: 72, aggro: 600, color: '#2a3020', isCop: true, heat: 6, hpM: 1.3, defM: 1.5,
    look: LK('m', '#b07a52', 'short', '#111111', '#111111'),
    equip: { hat: 'helmet_moto', top: 'armor_vest', bottom: 'armor_pants', shoes: 'boots_black', accessory: 'mask_skull', weapon: 'smg_compact' },
    shoot: GUN_SHOT(520, 1.0, 800, 0.6),
    drops: [{ id: 'cop_badge', chance: 0.4 }, ...POTS_HIGH, { id: 'armor_vest', chance: 0.006 }, { id: 'armor_pants', chance: 0.006 }, { id: 'smg_neon', chance: 0.001 }],
  }),
  mk('swat_heavy', 'ヘビーSWAT', 56, 'swat', 'cop', 'police', [], {
    speed: 90, w: 40, h: 80, aggro: 620, color: '#101418', isCop: true, heat: 8, hpM: 1.6, defM: 2, scale: 1.15,
    look: LK('m', '#c08a60', 'short', '#111111', '#ff3d3d'),
    equip: { hat: 'helmet_moto', top: 'armor_vest', bottom: 'armor_pants', shoes: 'boots_rocket', accessory: 'mask_skull', weapon: 'smg_neon' },
    shoot: GUN_SHOT(560, 0.8, 850, 0.5),
    drops: [{ id: 'cop_badge', chance: 0.5 }, ...POTS_HIGH, { id: 'armor_vest', chance: 0.01 }, { id: 'boots_rocket', chance: 0.002 }, { id: 'crown_gold', chance: 0.001 }],
  }),

  // =====================================================================
  // v3: 夜限定の敵（night:true。20〜5時のみ。spawner が isNightNow / enemyAvailableNow で判定）
  // =====================================================================
  mk('jelly_moonlit', 'ムーンライト・クラゲ', 8, 'jellyfish', 'flyer', 'beach', ['beach_f3'], {
    night: true, speed: 70, w: 44, h: 50, aggro: 260, color: '#fff6c8', accent: '#19f0ff', hpM: 1.3, expM: 1.3, moneyM: 2, mat: 'jelly_tentacle',
    extra: [{ id: 'chip_reroll', chance: 0.02 }],
  }),
  mk('thug_night_racer', 'ナイト・ゴーストレーサー', 21, 'thug', 'charger', 'downtown', ['down_f3'], {
    night: true, speed: 170, w: 32, h: 70, aggro: 420, color: '#b04dff', hpM: 1.3, expM: 1.6, moneyM: 2,
    look: LK('m', '#c9a27a', 'wolf', '#e8e8ff', '#19f0ff'),
    equip: { hat: 'helmet_moto', top: 'leather_jacket', bottom: 'track_pants', shoes: 'boots_rocket', accessory: 'sunglasses_neon', weapon: 'bat_nail' },
    drops: [{ id: 'street_tag', chance: 0.5 }, ...POTS_MID, { id: 'helmet_moto', chance: 0.004 }, { id: 'sunglasses_neon', chance: 0.01 }, { id: 'chip_reroll', chance: 0.02 }],
  }),
  mk('ghost_bayou', 'バイユーの鬼火', 42, 'ghost', 'flyer', 'swamp', ['swamp_f4'], {
    night: true, speed: 100, w: 40, h: 48, aggro: 360, color: '#9aff6a', accent: '#ffd23f', hpM: 1.3, expM: 1.6, moneyM: 2, mat: 'ghost_wisp',
    extra: [{ id: 'chip_reroll', chance: 0.02 }],
  }),
  mk('ghost_after_hours', 'アフターアワーズの客', 57, 'ghost', 'flyer', 'casino', ['casino_f4'], {
    night: true, speed: 115, w: 44, h: 52, aggro: 400, color: '#ffd23f', accent: '#ff3d7f', hpM: 1.3, expM: 1.6, moneyM: 3, mat: 'casino_chip',
    extra: [{ id: 'chip_reroll', chance: 0.025 }, { id: 'diamond', chance: 0.005 }],
  }),
  mk('drone_night_owl', 'ナイトオウル観測機', 48, 'drone', 'flyer', 'spaceport', ['space_f2'], {
    night: true, speed: 130, w: 46, h: 34, aggro: 420, color: '#7a3dff', accent: '#19f0ff', hpM: 1.3, expM: 1.6, moneyM: 2, mat: 'drone_chip',
    extra: [{ id: 'chip_reroll', chance: 0.02 }, { id: 'chip_lock', chance: 0.002 }],
  }),

  // =====================================================================
  // ボス（行き止まりマップ）
  // =====================================================================
  mk('boss_king_slime', 'キングゼリー', 10, 'slime', 'boss', 'beach', ['beach_f3'], {
    ...bossStats(10, 20), atk: 40, speed: 70, w: 140, h: 110, scale: 3, color: '#5cff9a',
    title: 'ビーチの王様', summon: ['slime_green', 'slime_pink', 'slime_wave'],
    drops: [{ id: 'king_crown_shard', chance: 1 }, { id: 'slime_jelly', chance: 1 }, { id: 'potion_orange', chance: 0.8 }, { id: 'headphones_neon', chance: 0.1 }, { id: 'knife_butterfly', chance: 0.08 }, { id: 'gold_chain', chance: 0.05 }, { id: 'crown_gold', chance: 0.002 }],
  }),
  mk('boss_rat_king', 'ラットキング', 18, 'rat', 'boss', 'downtown', ['down_f2'], {
    ...bossStats(18, 16), speed: 120, w: 130, h: 80, scale: 3, color: '#4a4a58', accent: '#ffd23f',
    title: '地下鉄の支配者', summon: ['rat_subway', 'rat_alley'],
    drops: [{ id: 'rat_crown', chance: 1 }, { id: 'rat_tail', chance: 1 }, { id: 'potion_orange', chance: 0.8 }, { id: 'bat_nail', chance: 0.1 }, { id: 'headphones_neon', chance: 0.08 }, { id: 'gold_chain', chance: 0.08 }, { id: 'sunglasses_neon', chance: 0.03 }],
  }),
  mk('boss_captain', 'キャプテン・ハーケン', 34, 'thug', 'boss', 'slums', ['slums_f3'], {
    ...bossStats(34, 16), speed: 130, w: 50, h: 96, scale: 1.4, color: '#d8283c',
    title: '密輸船の船長',
    look: LK('m', '#a8704a', 'wolf', '#2a1a10', '#d8283c'),
    equip: { hat: 'cowboy_hat', top: 'leather_jacket', bottom: 'cargo_khaki', shoes: 'boots_black', accessory: 'gold_chain', weapon: 'katana_blood' },
    shoot: GUN_SHOT(600, 1.1, 750, 0.55), summon: ['thug_smuggler', 'rat_ship'],
    drops: [{ id: 'pirate_map', chance: 1 }, { id: 'gold_bar', chance: 0.5 }, { id: 'potion_white', chance: 0.8 }, { id: 'katana_blood', chance: 0.05 }, { id: 'pistol_gold', chance: 0.05 }, { id: 'mask_skull', chance: 0.1 }, { id: 'gold_chain_heavy', chance: 0.02 }],
  }),
  mk('boss_gator', 'グランパ・ゲイター', 44, 'bossGator', 'boss', 'swamp', ['swamp_f3'], {
    ...bossStats(44, 18), speed: 110, w: 220, h: 110, color: '#2f6f2a',
    title: '沼の主', summon: ['gator_albino', 'snake_king'],
    drops: [{ id: 'gator_tooth', chance: 1 }, { id: 'gator_scale', chance: 1 }, { id: 'elixir', chance: 0.5 }, { id: 'katana_blood', chance: 0.05 }, { id: 'helmet_moto', chance: 0.05 }, { id: 'boots_rocket', chance: 0.02 }, { id: 'wings_angel', chance: 0.01 }, { id: 'heels_glass', chance: 0.002 }],
  }),
  mk('boss_mecha', 'メカ・ハイローラー', 60, 'drone', 'boss', 'casino', ['casino_f3'], {
    ...bossStats(60, 18), speed: 130, w: 150, h: 100, scale: 3.2, color: '#ffd23f',
    title: 'カジノ警備システム', summon: ['drone_casino', 'robot_dealer'],
    shoot: GUN_SHOT(700, 0.9, 700, 0.6),
    drops: [{ id: 'neon_core', chance: 1 }, { id: 'diamond', chance: 0.3 }, { id: 'elixir', chance: 0.5 }, { id: 'smg_neon', chance: 0.04 }, { id: 'guitar_thunder', chance: 0.05 }, { id: 'staff_moon', chance: 0.03 }, { id: 'halo_angel', chance: 0.005 }],
  }),
  mk('boss_don', 'ドン・カイマン', 78, 'bossDon', 'boss', 'rooftop', ['tower_f3'], {
    ...bossStats(78, 20), speed: 140, w: 48, h: 96, scale: 1.4, color: '#ffd23f',
    title: 'ヴァイス・ベイの支配者', summon: ['thug_elite', 'drone_guardian'],
    look: LK('m', '#d0a070', 'wolf', '#e8e8e8', '#ffd23f'),
    equip: { hat: 'crown_gold', top: 'suit_gold', bottom: 'suit_pants', shoes: 'loafers_brown', accessory: 'gold_chain_heavy', weapon: 'pistol_mythic' },
    shoot: GUN_SHOT(700, 0.8, 900, 0.5),
    drops: [{ id: 'diamond', chance: 1 }, { id: 'gold_bar', chance: 1 }, { id: 'elixir', chance: 1 }, { id: 'suit_gold', chance: 0.08 }, { id: 'neon_sword', chance: 0.05 }, { id: 'neon_sword_mythic', chance: 0.01 }, { id: 'pistol_mythic', chance: 0.01 }, { id: 'wings_neon', chance: 0.005 }, { id: 'crown_neon', chance: 0.005 }, { id: 'idol_dress_mythic', chance: 0.005 }],
  }),
  mk('boss_alien', 'オーバーロード・ゾグ', 100, 'bossAlien', 'boss', 'spaceport', ['space_f4'], {
    ...bossStats(100, 24, { expX: 0.35 }), speed: 140, w: 180, h: 160, scale: 1.6, color: '#5cff9a', accent: '#7a3dff',
    title: '謎の宇宙船の主（裏ボス）', summon: ['alien_warrior', 'jelly_void'],
    shoot: GUN_SHOT(760, 0.7, 800, 0.5),
    drops: [{ id: 'alien_core', chance: 1 }, { id: 'alien_crystal', chance: 1 }, { id: 'elixir', chance: 1 }, { id: 'diamond', chance: 0.5 }, { id: 'neon_sword_void', chance: 0.02 }, { id: 'smg_galaxy', chance: 0.02 }, { id: 'halo_cosmic', chance: 0.01 }, { id: 'cat_ears_cosmic', chance: 0.03 }, { id: 'jacket_nebula', chance: 0.03 }],
  }),
];

export const ENEMIES = Object.fromEntries(list.map((e) => [e.id, e]));

export function getEnemy(id) { return ENEMIES[id] || null; }

/** 図鑑・出現の対象となるモンスター（市民・警官を除く） */
export const MONSTER_IDS = list.filter((e) => !e.civilian && !e.isCop).map((e) => e.id);
export const CIVILIAN_IDS = list.filter((e) => e.civilian).map((e) => e.id);
export const COP_IDS = list.filter((e) => e.isCop).map((e) => e.id);
export const BOSS_IDS = list.filter((e) => e.boss).map((e) => e.id);
/** v3: 夜だけ出現する敵 */
export const NIGHT_ENEMY_IDS = list.filter((e) => e.night).map((e) => e.id);
export const ENEMY_REGIONS = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop', 'spaceport'];

/** enemiesForMap(mapId, {boss}) → そのマップを habitats に含む敵ID（spawner の自動選択用） */
export function enemiesForMap(mapId, opts = {}) {
  return list.filter((e) => e.habitats.includes(mapId) && (opts.boss == null || !!e.boss === !!opts.boss)).map((e) => e.id);
}

// マップ別の出現（habitats から生成。ボス含む）
export const ENEMIES_BY_MAP = {};
for (const e of list) for (const m of e.habitats) (ENEMIES_BY_MAP[m] ||= []).push(e.id);

// 手配度★ごとに出現させる警察ユニット（spawner 用の参考。町でのみ）
export const COP_UNITS_BY_WANTED = {
  1: ['cop_patrol'],
  2: ['cop_patrol', 'drone_scout'],
  3: ['cop_patrol', 'cop_detective', 'drone_scout'],
  4: ['cop_detective', 'swat_trooper'],
  5: ['swat_trooper', 'swat_heavy'],
};
