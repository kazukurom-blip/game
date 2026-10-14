// ペット。担当: メタ担当。見た目の差し替え枠は pet.<id>（manifest が自動で作る）。
// 形: { id, name, desc, rarity: 'common'|'rare'|'epic'|'legendary', body（monsters.js と同じ体の形）, palette: { main, sub, eye, accent? }, features?: [...],
//       size, bonus: [{ s, v }]（連れて歩くときの効果・Lv1）, perLevel: [{ s, v }]（1 レベルごとの上乗せ）, own: [{ s, v }]（持っているだけの効果）,
//       ability?: { kind: 'bite'|'bolt'|'heal'|'loot'|'nova'|'shield'|'curse', cd, dmg（武器ダメージの %）, el?（属性）, ... }（戦闘での手助け） }
// body と features は monsters.js の先頭の一覧から選ぶ（アート担当がこの形で絵を描く）。size は描く大きさの倍率（枠は 90×90）。
// ability の追加の値: radius（nova の半径）, heal（最大ライフの %）, gold（loot: 敵 N 体分のゴールド）, dr（shield: 被ダメ軽減 %）, dur（効果の秒数）,
//   status: { id, chance }（当てたときの状態異常）, count（bolt の弾の数）

export const PET_RARITIES = {
  common: { name: 'ふつう', color: '#c8c8c8', xpMul: 1, starStep: 0.2 },
  rare: { name: 'めずらしい', color: '#5aa0ff', xpMul: 1.4, starStep: 0.2 },
  epic: { name: 'とても珍しい', color: '#c56bff', xpMul: 2, starStep: 0.2 },
  legendary: { name: '伝説', color: '#ff9a2e', xpMul: 3, starStep: 0.25 },
};

export const PETS = [
  // ---------------- ふつう
  { id: 'emberfox', name: '火狐のほむら', desc: '尾に火を灯す小さな狐。3 秒ごとに火の粉を飛ばし、敵を燃やすことがある。', rarity: 'common', body: 'quad', features: ['tail', 'flames'], palette: { main: '#ff8a3a', sub: '#7a2a10', eye: '#ffe080', accent: '#ffd040' }, size: 0.8,
    bonus: [{ s: 'inc_fire', v: 5 }], perLevel: [{ s: 'inc_fire', v: 0.5 }], own: [{ s: 'gold_find', v: 1 }], ability: { kind: 'bolt', cd: 3, dmg: 40, el: 'fire', status: { id: 'ignite', chance: 0.3 } } },
  { id: 'ashcrow', name: '灰鴉のくろつぐみ', desc: '灰の空を舞う賢い鴉。4 秒ごとに急降下して敵をついばむ。', rarity: 'common', body: 'flyer', features: ['wings'], palette: { main: '#3a3640', sub: '#1a181e', eye: '#ffcc40', accent: '#8a8a9a' }, size: 0.75,
    bonus: [{ s: 'xp_bonus', v: 4 }], perLevel: [{ s: 'xp_bonus', v: 0.3 }], own: [{ s: 'xp_bonus', v: 1 }], ability: { kind: 'bite', cd: 4, dmg: 55 } },
  { id: 'mossling', name: '苔玉のもこ', desc: '湿った森に転がる苔の塊。6 秒ごとに主人公のライフを 3% 癒す。', rarity: 'common', body: 'blob', features: ['glow'], palette: { main: '#6aa04a', sub: '#2f5a24', eye: '#f0ffc0', accent: '#b8ff8a' }, size: 0.8,
    bonus: [{ s: 'life_regen_pct', v: 0.3 }], perLevel: [{ s: 'life_regen_pct', v: 0.02 }], own: [{ s: 'inc_life', v: 1 }], ability: { kind: 'heal', cd: 6, heal: 3 } },
  { id: 'bonepup', name: '骨犬のからから', desc: '骨だけになっても主を慕う犬。3.5 秒ごとに噛みつく。', rarity: 'common', body: 'quad', features: ['bones'], palette: { main: '#e8e0c8', sub: '#8a806a', eye: '#5ad0ff' }, size: 0.8,
    bonus: [{ s: 'dmg_elite', v: 5 }], perLevel: [{ s: 'dmg_elite', v: 0.4 }], own: [{ s: 'dmg_elite', v: 1 }], ability: { kind: 'bite', cd: 3.5, dmg: 60, status: { id: 'bleed', chance: 0.3 } } },
  { id: 'lanternmoth', name: '灯り蛾のゆらめ', desc: '淡い光をまとう蛾。8 秒ごとに落ちている小銭を見つけてくる。', rarity: 'common', body: 'insect', features: ['wings', 'glow'], palette: { main: '#f0e0a0', sub: '#8a7040', eye: '#ffffff', accent: '#fff4b0' }, size: 0.7,
    bonus: [{ s: 'gold_find', v: 8 }], perLevel: [{ s: 'gold_find', v: 0.6 }], own: [{ s: 'gold_find', v: 2 }], ability: { kind: 'loot', cd: 8, gold: 3 } },
  { id: 'pebble', name: '小石の番兵ごろ', desc: '小石が集まってできた小さな番兵。10 秒ごとに 4 秒間、受けるダメージを 6% 減らす。', rarity: 'common', body: 'golem', features: ['crystals'], palette: { main: '#8a8278', sub: '#4a443e', eye: '#7ad0ff', accent: '#a0d8ff' }, size: 0.8,
    bonus: [{ s: 'inc_armor', v: 8 }], perLevel: [{ s: 'inc_armor', v: 0.6 }], own: [{ s: 'inc_armor', v: 2 }], ability: { kind: 'shield', cd: 10, dr: 6, dur: 4 } },
  { id: 'frostkit', name: '雪狐のしずり', desc: '雪原生まれの白い子狐。3 秒ごとに氷の礫を吐き、敵を冷やす。', rarity: 'common', body: 'quad', features: ['tail', 'ice'], palette: { main: '#e8f4ff', sub: '#7a9ab8', eye: '#3a8aff', accent: '#bfe8ff' }, size: 0.8,
    bonus: [{ s: 'inc_cold', v: 5 }], perLevel: [{ s: 'inc_cold', v: 0.5 }], own: [{ s: 'res_cold', v: 2 }], ability: { kind: 'bolt', cd: 3, dmg: 40, el: 'cold' } },
  { id: 'sporecap', name: '胞子茸のぽこ', desc: 'ぴょこぴょこ歩く毒茸。5 秒ごとに周りへ毒の胞子を撒く。', rarity: 'common', body: 'plant', features: ['spikes'], palette: { main: '#c04a6a', sub: '#f0d8c0', eye: '#2a1a1a', accent: '#a0ff6a' }, size: 0.75,
    bonus: [{ s: 'inc_poison', v: 5 }], perLevel: [{ s: 'inc_poison', v: 0.5 }], own: [{ s: 'res_poison', v: 2 }], ability: { kind: 'nova', cd: 5, dmg: 45, el: 'poison', radius: 150, status: { id: 'poison', chance: 0.6 } } },

  // ---------------- めずらしい
  { id: 'stormferret', name: '雷鼬のはやて', desc: '雷雲から落ちてきた鼬。2.5 秒ごとに稲妻を放ち、感電させる。', rarity: 'rare', body: 'quad', features: ['tail', 'glow'], palette: { main: '#f0d860', sub: '#6a5a20', eye: '#ffffff', accent: '#fff07a' }, size: 0.75,
    bonus: [{ s: 'inc_lightning', v: 8 }, { s: 'attack_speed', v: 2 }], perLevel: [{ s: 'inc_lightning', v: 0.6 }], own: [{ s: 'attack_speed', v: 1 }], ability: { kind: 'bolt', cd: 2.5, dmg: 50, el: 'lightning', status: { id: 'shock', chance: 0.35 } } },
  { id: 'tidesprite', name: '潮の精みなも', desc: '沈んだ都の泉に棲む水の精。7 秒ごとにライフを 5% 癒す。', rarity: 'rare', body: 'aquatic', features: ['glow', 'tail'], palette: { main: '#4ac0d0', sub: '#1a5a70', eye: '#e0ffff', accent: '#9af0ff' }, size: 0.8,
    bonus: [{ s: 'res_all', v: 5 }], perLevel: [{ s: 'res_all', v: 0.2 }], own: [{ s: 'res_all', v: 2 }], ability: { kind: 'heal', cd: 7, heal: 5 } },
  { id: 'cinderdrake', name: '燠火の仔竜あかね', desc: '炉の残り火から孵った仔竜。4 秒ごとに火球を吐き、当たった周りも焼く。', rarity: 'rare', body: 'dragon', features: ['wings', 'horns', 'flames'], palette: { main: '#d04a2a', sub: '#5a1a10', eye: '#ffe060', accent: '#ffa040' }, size: 0.85,
    bonus: [{ s: 'inc_fire', v: 10 }], perLevel: [{ s: 'inc_fire', v: 0.8 }], own: [{ s: 'inc_fire', v: 4 }], ability: { kind: 'bolt', cd: 4, dmg: 90, el: 'fire', explode: 90 } },
  { id: 'shadecat', name: '影猫のよる', desc: '影から影へ渡る黒猫。3 秒ごとに背後から急所を裂く（よくクリティカルする）。', rarity: 'rare', body: 'quad', features: ['tail', 'mask'], palette: { main: '#2a2236', sub: '#120e18', eye: '#c77dff', accent: '#7a4aff' }, size: 0.75,
    bonus: [{ s: 'crit_chance', v: 2 }], perLevel: [{ s: 'crit_damage', v: 0.8 }], own: [{ s: 'crit_chance', v: 1 }], ability: { kind: 'bite', cd: 3, dmg: 70, crit: 0.35 } },
  { id: 'gearowl', name: '歯車梟のちくたく', desc: '迷宮の時計塔で拾われた機械仕掛けの梟。9 秒ごとに素材を見つけてくる。', rarity: 'rare', body: 'construct', features: ['wings', 'gears'], palette: { main: '#c89a5a', sub: '#5a3a1a', eye: '#7affff', accent: '#ffd88a' }, size: 0.8,
    bonus: [{ s: 'mat_find', v: 10 }], perLevel: [{ s: 'mat_find', v: 0.6 }], own: [{ s: 'mat_find', v: 5 }], ability: { kind: 'loot', cd: 9, gold: 2, mats: true } },
  { id: 'bloodbat', name: '血蝙蝠のべに', desc: '紅い翼の蝙蝠。3 秒ごとに噛みつき、与えたダメージの一部で主人公を癒す。', rarity: 'rare', body: 'flyer', features: ['wings'], palette: { main: '#8a1a2a', sub: '#3a0a12', eye: '#ffd0d0', accent: '#ff4a5a' }, size: 0.75,
    bonus: [{ s: 'leech', v: 0.6 }], perLevel: [{ s: 'leech', v: 0.03 }], own: [{ s: 'leech', v: 0.2 }], ability: { kind: 'bite', cd: 3, dmg: 55, lifesteal: 0.5 } },

  // ---------------- とても珍しい
  { id: 'voidwisp', name: '虚無の灯ほろ', desc: '世界の縁から漂ってきた灯。4 秒ごとに虚無の弾を撃ち、当てた敵を 4 秒間脆くする（被ダメージ +15%）。', rarity: 'epic', body: 'elemental', features: ['glow', 'crystals'], palette: { main: '#8a5aff', sub: '#2a1a5a', eye: '#ffffff', accent: '#e0b0ff' }, size: 0.8,
    bonus: [{ s: 'inc_void', v: 10 }, { s: 'inc_dmg', v: 4 }], perLevel: [{ s: 'inc_dmg', v: 0.4 }], own: [{ s: 'res_void', v: 5 }], ability: { kind: 'curse', cd: 4, dmg: 70, el: 'void' } },
  { id: 'bonewyrm', name: '骨竜のしろがね', desc: '古戦場の骨が寄り集まった小さな竜。6 秒ごとに骨の嵐で周りを打つ。', rarity: 'epic', body: 'serpent', features: ['bones', 'spikes'], palette: { main: '#e0dccb', sub: '#6a6250', eye: '#ff4a3a', accent: '#c0b090' }, size: 0.9,
    bonus: [{ s: 'inc_dmg', v: 8 }], perLevel: [{ s: 'inc_dmg', v: 0.6 }], own: [{ s: 'inc_dmg', v: 5 }], ability: { kind: 'nova', cd: 6, dmg: 140, el: 'phys', radius: 210 } },
  { id: 'starlynx', name: '星山猫のきらら', desc: '毛並みに星を宿す山猫。3 秒ごとに 3 本の光の矢を放つ。', rarity: 'epic', body: 'beast_large', features: ['crystals', 'glow'], palette: { main: '#3a4a8a', sub: '#141a3a', eye: '#fff4a0', accent: '#a0d8ff' }, size: 0.75,
    bonus: [{ s: 'magic_find', v: 12 }], perLevel: [{ s: 'magic_find', v: 0.6 }], own: [{ s: 'magic_find', v: 6 }], ability: { kind: 'bolt', cd: 3, dmg: 45, el: 'lightning', count: 3 } },
  { id: 'ironbeetle', name: '鉄甲虫のおもかげ', desc: '鋼の殻を持つ大きな甲虫。9 秒ごとに 5 秒間、受けるダメージを 12% 減らす。', rarity: 'epic', body: 'insect', features: ['armor', 'horns'], palette: { main: '#5a6a7a', sub: '#262e36', eye: '#ff9a3a', accent: '#b0c8d8' }, size: 0.85,
    bonus: [{ s: 'inc_life', v: 8 }, { s: 'inc_armor', v: 10 }], perLevel: [{ s: 'inc_life', v: 0.4 }], own: [{ s: 'inc_life', v: 5 }], ability: { kind: 'shield', cd: 9, dr: 12, dur: 5 } },

  // ---------------- 伝説
  { id: 'abyssfox', name: '深淵九尾のくれない', desc: '九つの尾に深淵の炎を灯す狐。5 秒ごとに周りを紅蓮の炎で焼き尽くす。', rarity: 'legendary', body: 'quad', features: ['tail', 'flames', 'glow'], palette: { main: '#ff3a4a', sub: '#4a0a14', eye: '#fff0a0', accent: '#ff9a3a' }, size: 0.95,
    bonus: [{ s: 'more_dmg', v: 6 }, { s: 'inc_fire', v: 10 }], perLevel: [{ s: 'inc_dmg', v: 0.8 }], own: [{ s: 'more_dmg', v: 3 }], ability: { kind: 'nova', cd: 5, dmg: 220, el: 'fire', radius: 260, status: { id: 'ignite', chance: 0.6 } } },
  { id: 'phoenixchick', name: '不死鳥の雛ひのと', desc: '灰の中から何度でも生まれる鳥の雛。8 秒ごとにライフを 8% 癒し、近くの敵を焦がす。', rarity: 'legendary', body: 'flyer', features: ['wings', 'flames', 'glow'], palette: { main: '#ffb03a', sub: '#a02a10', eye: '#ffffff', accent: '#fff07a' }, size: 0.85,
    bonus: [{ s: 'inc_life', v: 12 }, { s: 'life_regen_pct', v: 0.5 }], perLevel: [{ s: 'inc_life', v: 0.5 }], own: [{ s: 'inc_life', v: 8 }, { s: 'xp_bonus', v: 5 }], ability: { kind: 'heal', cd: 8, heal: 8, burn: 80 } },
];
export const PET = Object.fromEntries(PETS.map((p) => [p.id, p]));

// ---------------- 卵
// 形: { id, name, desc, color, hatchKills（孵卵器に入れてから孵るまでに倒す敵の数）, odds: { rarity: 重み } }
export const EGGS = [
  { id: 'egg_ash', name: '灰の卵', desc: '灰にまみれた小さな卵。ふつうのペットが多い。', color: '#b0a898', hatchKills: 200, odds: { common: 80, rare: 18, epic: 2, legendary: 0 } },
  { id: 'egg_ember', name: '熾火の卵', desc: 'ほのかに温かい卵。めずらしいペットが出やすい。', color: '#ff8a3a', hatchKills: 600, odds: { common: 35, rare: 45, epic: 17, legendary: 3 } },
  { id: 'egg_abyss', name: '深淵の卵', desc: '覗き込むと底の見えない卵。とても珍しい・伝説のペットが出る。', color: '#c77dff', hatchKills: 1500, odds: { common: 0, rare: 35, epic: 45, legendary: 20 } },
];
export const EGG = Object.fromEntries(EGGS.map((e) => [e.id, e]));

export const PET_BAL = {
  // 卵が落ちる確率（そのランクの敵 1 体あたり）。天井: 対象の敵を PITY 体倒すと必ず落ちる
  // 強さ担当: 1 ステージのウェーブが増えてエリートも増えたので、エリートの卵を少し珍しく（1 周目の物語で卵 20 個前後・ペット 12 種ほど）
  EGG_CHANCE: { champion: 1 / 350, rare: 1 / 300, boss: 1 / 150, actboss: 1 / 80, guardian: 1 / 60, goblin: 1 / 12 },
  PITY: 900,
  LEVEL_GAP: 10, // 主人公より この Lv 以上低い敵からは卵が落ちない
  // 卵の種類の重み（ランク別）
  EGG_ODDS: {
    champion: { egg_ash: 72, egg_ember: 24, egg_abyss: 4 },
    rare: { egg_ash: 65, egg_ember: 29, egg_abyss: 6 },
    boss: { egg_ash: 45, egg_ember: 42, egg_abyss: 13 },
    actboss: { egg_ash: 20, egg_ember: 50, egg_abyss: 30 },
    guardian: { egg_ash: 15, egg_ember: 50, egg_abyss: 35 },
    goblin: { egg_ash: 40, egg_ember: 40, egg_abyss: 20 },
  },
  INCUBATORS: 2,
  MAX_LEVEL: 50,
  MAX_STARS: 5,
  FEED_XP: 20,
  /** 次のレベルまでの経験値 */
  xpToNext: (lvl, rarity = 'common') => Math.round((40 + 12 * lvl + 0.8 * lvl * lvl) * (PET_RARITIES[rarity]?.xpMul || 1)),
  /** 5★のあとに重なったときの経験値 */
  DUP_XP: 200,
};
