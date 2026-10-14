// スキル。すべてのダメージは「武器ダメージ × dmg%」で計算する（装備が強さの中心になる）。
//
// 形（スキル定義）:
// {
//   id, cls, name, desc,            desc の {dmg} {radius} {count} {dur} はレベルに応じた値に置き換わる
//   tags: ['attack','melee','area'], element: 'phys'|'fire'|'cold'|'lightning'|'poison'|'void'
//   unlock: 1,                      解放レベル
//   basic: true,                    基本攻撃（リソースを使わない・常に使える）
//   behavior: 'melee' | 'projectile' | 'nova' | 'rain' | 'chain' | 'summon' | 'buff' | 'leap' | 'aura' | 'beam' | 'whirl' | 'trap' | 'dot'
//   cost: 10,                       リソースの消費（負ならたまる）
//   cd: 0,                          クールダウン（秒）
//   castTime: 0.6,                  動作の長さ（秒）。攻撃速度で縮む
//   dmg: [130, 6],                  [Lv1 の %, 1 レベルごとに +%]
//   range: 120, radius: 0, count: 1, speed: 900, pierce: 0, chain: 0, duration: 0, maxSummons: 0
//   status: { id, chance, dur, ... } 当たったときの状態異常
//   buff: { mods: [{s,v}], dur }    behavior:'buff' のとき
//   summon: { unit: 'skeleton', life: 3, dmg: 40, count: 1 }
//   runes: [{ id, name, desc, mod: { element, count, radius, dmgMul, cdMul, ... } }]  1 つだけ選べる変化
//   fx: { cast, proj, hit, area } … 見た目の差し替え枠の ID（無ければ fx.<id>.* を自動で使う）
// }
// スキルのレベルは 1〜20（装備の「スキルレベル +N」で上限を超えられる）。

export const SKILL_MAX_LEVEL = 20;

export const SKILLS = [
  // ---------------- 剣闘士
  {
    id: 'w_slash', cls: 'warrior', name: '強打', desc: '目の前の敵を武器で叩き、{dmg} のダメージ。怒りがたまる。',
    tags: ['attack', 'melee'], element: 'phys', unlock: 1, basic: true, behavior: 'melee',
    cost: -6, cd: 0, castTime: 0.55, dmg: [125, 5], range: 110, radius: 70,
    runes: [
      { id: 'fire', name: '燃える刃', desc: '火炎ダメージになり、炎上させる', mod: { element: 'fire', status: { id: 'ignite', chance: 0.25 } } },
      { id: 'wide', name: '薙ぎ払い', desc: '当たる範囲が 2 倍', mod: { radius: 2 } },
    ],
  },
  {
    id: 'w_cleave', cls: 'warrior', name: '大旋斬', desc: '武器を振り回し、周りの敵すべてに {dmg} のダメージ。',
    tags: ['attack', 'melee', 'area'], element: 'phys', unlock: 1, behavior: 'nova',
    cost: 20, cd: 0, castTime: 0.7, dmg: [190, 9], radius: 170,
    runes: [
      { id: 'quake', name: '地割れ', desc: '範囲 +40%、冷気にならず物理のまま', mod: { radius: 1.4 } },
    ],
  },
  // ---------------- 狩人
  {
    id: 'r_shot', cls: 'ranger', name: '速射', desc: '矢を放ち {dmg} のダメージ。',
    tags: ['attack', 'projectile'], element: 'phys', unlock: 1, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.5, dmg: [115, 5], range: 650, speed: 1300, count: 1, pierce: 0,
    runes: [{ id: 'split', name: '分かれ矢', desc: '矢が 3 本になる（1 本 70%）', mod: { count: 3, dmgMul: 0.7 } }],
  },
  {
    id: 'r_multishot', cls: 'ranger', name: '扇射ち', desc: '{count} 本の矢を扇状に放ち、それぞれ {dmg} のダメージ。',
    tags: ['attack', 'projectile', 'area'], element: 'phys', unlock: 1, behavior: 'projectile',
    cost: 25, cd: 0, castTime: 0.65, dmg: [80, 4], range: 650, speed: 1200, count: 5, pierce: 1, spread: 0.5,
    runes: [{ id: 'frost', name: '凍て矢', desc: '冷気になり、凍結させる', mod: { element: 'cold', status: { id: 'freeze', chance: 0.15 } } }],
  },
  // ---------------- 魔導士
  {
    id: 's_bolt', cls: 'sorcerer', name: '魔弾', desc: '魔力の弾で {dmg} の雷撃ダメージ。',
    tags: ['spell', 'projectile'], element: 'lightning', unlock: 1, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.5, dmg: [120, 5], range: 650, speed: 1100, count: 1,
    runes: [{ id: 'fire', name: '火の玉', desc: '火炎になり、当たると小さく爆発', mod: { element: 'fire', explode: 80 } }],
  },
  {
    id: 's_nova', cls: 'sorcerer', name: '氷結の環', desc: '周りに冷気を放ち {dmg} のダメージ。凍結させることがある。',
    tags: ['spell', 'area'], element: 'cold', unlock: 1, behavior: 'nova',
    cost: 30, cd: 2, castTime: 0.6, dmg: [210, 10], radius: 220, status: { id: 'freeze', chance: 0.3, dur: 1 },
    runes: [{ id: 'storm', name: '雷の環', desc: '雷撃になり、感電させる', mod: { element: 'lightning', status: { id: 'shock', chance: 0.4 } } }],
  },
  // ---------------- 死霊術師
  {
    id: 'n_bonespear', cls: 'necromancer', name: '骨の槍', desc: '敵を貫く骨の槍で {dmg} のダメージ。',
    tags: ['spell', 'projectile'], element: 'phys', unlock: 1, basic: true, behavior: 'projectile',
    cost: -4, cd: 0, castTime: 0.55, dmg: [110, 5], range: 650, speed: 1200, count: 1, pierce: 2,
    runes: [{ id: 'blight', name: '腐れ槍', desc: '毒になり、毒を与える', mod: { element: 'poison', status: { id: 'poison', chance: 0.5 } } }],
  },
  {
    id: 'n_skeleton', cls: 'necromancer', name: '骸骨召喚', desc: '骸骨の戦士を {count} 体まで呼ぶ。骸骨は武器ダメージの {dmg} で攻撃する。',
    tags: ['spell', 'minion', 'summon'], element: 'phys', unlock: 1, behavior: 'summon',
    cost: 30, cd: 4, castTime: 0.7, dmg: [60, 3], maxSummons: 3, summon: { unit: 'skeleton', life: 2.5, aps: 1.1, range: 90 },
    runes: [{ id: 'mage', name: '骸骨の魔術師', desc: '遠くから冷気の弾を撃つ骸骨になる', mod: { element: 'cold', summon: { unit: 'skelmage', range: 450 } } }],
  },
  // ---------------- 影刃
  {
    id: 'a_stab', cls: 'assassin', name: '連刃', desc: '素早く切りつけ {dmg} のダメージ。',
    tags: ['attack', 'melee'], element: 'phys', unlock: 1, basic: true, behavior: 'melee',
    cost: 0, cd: 0, castTime: 0.38, dmg: [95, 4], range: 100, radius: 40,
    runes: [{ id: 'venom', name: '毒刃', desc: '毒になり、毒を与える', mod: { element: 'poison', status: { id: 'poison', chance: 0.4 } } }],
  },
  {
    id: 'a_fan', cls: 'assassin', name: '刃の扇', desc: '周りに刃をばらまき {dmg} のダメージ。出血させる。',
    tags: ['attack', 'area'], element: 'phys', unlock: 1, behavior: 'nova',
    cost: 25, cd: 0, castTime: 0.5, dmg: [150, 7], radius: 160, status: { id: 'bleed', chance: 0.35 },
    runes: [{ id: 'shadow', name: '影の扇', desc: '虚無ダメージになる', mod: { element: 'void' } }],
  },
];

export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillsOf = (cls) => SKILLS.filter((s) => s.cls === cls);
