// 数値設計の中心。敵・装備・経験値・お金の伸び方はすべてここの曲線で決める（強さ担当はここを調整する）。
//
// エリアレベル L: 物語（第 1〜10 章）で 1〜100、苦行の段階で 100 を超え、深淵の裂け目は上限なし。
// P(L) … 「強さの曲線」。装備の数値（武器ダメージ・アーマー・ライフなど scale:true の能力）と
//         敵のライフ・攻撃力が同じ曲線で伸びるので、同じレベルの装備なら手応えが一定になる。

export const P = (L) => {
  L = Math.max(1, L);
  return 1.075 ** (L - 1) * (1 + 0.04 * (L - 1));
};

export const BAL = {
  // ---- 戦闘の基本
  TICK: 1 / 20, // 1 回の計算で進める秒数
  BASE_CRIT: 5,
  BASE_CRIT_DMG: 50, // クリティカルで +50%
  CRIT_CAP: 95,
  DODGE_CAP: 60,
  BLOCK_CAP: 75,
  BLOCK_REDUCE: 0.7,
  RES_CAP: 75,
  CDR_CAP: 60,
  COST_CAP: 60,
  ARMOR_CAP: 0.85,
  ARMOR_K: 80, // 減り方 = armor / (armor + ARMOR_K × P(敵のレベル))
  MOVE_CAP: 150,
  BASE_MOVE: 220, // 1 秒に進む距離（px）
  LEECH_CAP_PER_SEC: 0.2, // 1 秒に最大ライフの 20% まで
  BASE_LIFE_REGEN_PCT: 1.0, // 1 秒に最大ライフの 1%
  PRIMARY_DMG_PER_POINT: 0.25, // 主能力 1 につきダメージ +0.25%
  VIT_LIFE_PER_POINT: 0.15,
  STR_ARMOR_PER_POINT: 0.1,
  DEX_DODGE_PER_POINT: 0.02,
  INT_RES_PER_POINT: 0.02,

  // ---- 主人公
  heroBaseLife: (lvl) => 40 * P(lvl),
  heroLifePerLevel: 0, // 曲線に含む
  MAX_LEVEL: 100,
  // レベル l → l+1 に必要な経験値。「同じレベルの敵を何体倒すか」で決める
  killsToLevel: (l) => Math.round(8 * l ** 1.3),
  xpToNext: (l) => Math.round(BAL.killsToLevel(l) * BAL.monsterXp(l)),
  // パラゴン（Lv100 以降、上限なし）
  paragonXpToNext: (p) => Math.round(BAL.xpToNext(100) * (1 + p * 0.02)),
  PARAGON_POINTS_PER_LEVEL: 1,
  SKILL_POINTS_PER_LEVEL: 1,
  TREE_POINTS_PER_LEVEL: 1,

  // ---- 敵
  monsterLife: (L) => 12 * P(L),
  monsterDmg: (L) => 2.5 * P(L),
  monsterXp: (L) => 5 * (1 + 0.15 * (L - 1)) * 1.02 ** (L - 1),
  monsterGold: (L) => 1.5 * P(L) ** 0.85,
  // 敵の強さの上乗せ（ワールド担当）。物語の進み具合（DESIGN §3）に合わせる係数。主人公はレベル・スキル・パッシブで
  // 曲線 P(L) より速く強くなるので、その分を敵のライフ・攻撃に足す。Lv 100 で頭打ち（苦行・裂け目はそれぞれの倍率で伸びる）。
  // 倍率 = (1 + a × x) × b^min(x, knee) × (1 + c × (x - knee)₊)、x = L - 1。knee から先はゆるやかに（後半は主人公の伸びが仕組みで決まるため）。
  // tests/sim.mjs の長い計測（node tests/sim.mjs 2400 --pace）で合わせる。
  WORLD: { lifeA: 0.03, lifeB: 1.042, lifeC: 0.02, dmgA: 0.012, dmgB: 1.009, dmgC: 0.01, knee: 45, cap: 100 },
  monsterScale: (L) => {
    const W = BAL.WORLD;
    const x = Math.min(W.cap, Math.max(1, L)) - 1;
    const e = Math.min(x, W.knee); const over = Math.max(0, x - W.knee);
    return { life: (1 + W.lifeA * x) * W.lifeB ** e * (1 + W.lifeC * over), dmg: (1 + W.dmgA * x) * W.dmgB ** e * (1 + W.dmgC * over) };
  },
  // エリートやボスの倍率
  RANK: {
    normal: { life: 1, dmg: 1, xp: 1, gold: 1, loot: 1 },
    champion: { life: 4, dmg: 1.4, xp: 4, gold: 3, loot: 3 },
    rare: { life: 6, dmg: 1.6, xp: 6, gold: 4, loot: 4 }, // 群れの長（エリート詞つき）
    goblin: { life: 8, dmg: 0, xp: 3, gold: 30, loot: 12 },
    boss: { life: 45, dmg: 2.2, xp: 30, gold: 25, loot: 10 },
    actboss: { life: 90, dmg: 2.6, xp: 80, gold: 60, loot: 18 },
    guardian: { life: 120, dmg: 2.8, xp: 60, gold: 50, loot: 15 },
  },
  // 経験値の Lv 差の補正（低すぎる敵は少なく）
  xpLevelPenalty: (heroLvl, L) => {
    const d = heroLvl - L;
    if (d <= 5) return 1;
    return Math.max(0.05, 1 - (d - 5) * 0.08);
  },

  // ---- 苦行（物語クリア後の難易度。0 = 通常）
  MAX_TORMENT: 16,
  torment: (t) => ({
    level: t > 0 ? 100 + t * 5 : 0, // 敵のエリアレベル（0 なら物語のレベル）
    life: 1.6 ** t,
    dmg: 1.3 ** t,
    xp: 1 + 0.75 * t,
    gold: 1 + 0.5 * t,
    loot: 1 + 0.15 * t, // アイテム数
    mf: 25 * t, // レア発見率に足す
    ancient: 0.08 + 0.01 * t,
    primal: t >= 8 ? 0.002 * (t - 7) : 0,
    resPenalty: 5 * t, // 主人公の耐性 -N
  }),

  // ---- 深淵の裂け目（上限なし）
  rift: (g) => ({
    level: 100 + g, // エリアレベル
    life: 1.11 ** g,
    dmg: 1.045 ** g,
    timeLimit: 15 * 60,
  }),

  // ---- ドロップ
  ITEM_DROP_CHANCE: 0.12, // 普通の敵 1 体あたり
  GOLD_DROP_CHANCE: 0.35,
  // レアリティの重み（普通の敵）。MF はレア以上を (1+MF/100) 倍
  RARITY_WEIGHTS: { common: 55, magic: 32, rare: 10.5, epic: 2.0, legendary: 0.35, unique: 0.12, set: 0.08, mythic: 0.003 },
  mfEffective: (mf) => (mf <= 0 ? mf : mf * 100 / (mf + 100) * 2), // 逓減（MF 100 → 実効 100、300 → 150）

  // ---- 経済
  sellValue: (ilvl, rarityIdx) => Math.round(2 * P(ilvl) ** 0.85 * (1 + rarityIdx * 1.5)),

  // ---- 放置
  OFFLINE_CAP_HOURS: 8,
  OFFLINE_EFFICIENCY: 0.8,
};

/** 装備の数値（scale:true の能力）を ilvl で伸ばす */
export const itemScale = (ilvl) => P(ilvl);
