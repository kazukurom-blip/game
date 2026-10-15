// 数値設計の中心。敵・装備・経験値・お金の伸び方はすべてここの曲線で決める（強さ担当はここを調整する）。
//
// エリアレベル L: 物語（第 1〜10 章）で 1〜100、苦行の段階で 100 を超え、深淵の裂け目は上限なし。
// P(L) … 「強さの曲線」。装備の数値（武器ダメージ・アーマー・ライフなど scale:true の能力）と
//         敵のライフ・攻撃力が同じ曲線で伸びるので、同じレベルの装備なら手応えが一定になる。

// NUM … 数字の大きさ。Lv1 の P が 10 になるように全体を 10 倍にしている（序盤から 2〜3 桁の整数が出るように）。
//        装備の数値・敵のライフと攻撃・主人公のライフ・ゴールドがすべて同じ倍率なので、手応えは変わらない。
// curve(L) … 伸び方だけ（Lv1 で 1）。個数（素材の数など）を決めるときは P ではなくこちらを使う。
// PG(L)    … ゴールドの曲線（稼ぎと費用の両方に使う）。NUM × curve^0.85
export const NUM = 10;
export const curve = (L) => {
  L = Math.max(1, L);
  return 1.075 ** (L - 1) * (1 + 0.04 * (L - 1));
};
export const P = (L) => NUM * curve(L);
export const PG = (L) => NUM * curve(L) ** 0.85;

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
  ARMOR_K: 60, // 減り方 = armor / (armor + ARMOR_K × P(敵のレベル))（強さ担当: 80 → 60。鎧の軽い近接職が物理で倒れ続けないように）
  MOVE_CAP: 150,
  BASE_MOVE: 220, // 1 秒に進む距離（px）
  LEECH_CAP_PER_SEC: 0.2, // 1 秒に最大ライフの 20% まで
  BASE_LIFE_REGEN_PCT: 1.0, // 1 秒に最大ライフの 1%
  PRIMARY_DMG_PER_POINT: 0.25, // 主能力 1 につきダメージ +0.25%
  VIT_LIFE_PER_POINT: 0.15,
  STR_ARMOR_PER_POINT: 0.1,
  DEX_DODGE_PER_POINT: 0.02,
  INT_RES_PER_POINT: 0.02,
  VOID_RES_SHARE: 0.5, // 全耐性・知力の耐性は虚無に半分だけ効く

  // ---- 主人公
  heroBaseLife: (lvl) => 40 * P(lvl),
  heroLifePerLevel: 0, // 曲線に含む
  MAX_LEVEL: 100,
  ITEM_REQ_PER_ILVL: 0.82, // 装備に要るレベル = アイテム Lv × これ − 2（ベースの要求とどちらか高い方）
  // レベル l → l+1 に必要な経験値。「同じレベルの敵を何体倒すか」で決める
  // レベルが地域より上がりすぎると敵が弱く感じる（ユーザーの声）ので、主人公のレベルは地域のレベル +2〜3 くらいに保つ
  killsToLevel: (l) => Math.round(48 * l ** 1.45 * Math.min(1, 0.03 + 0.024 * l)),
  xpToNext: (l) => Math.round(BAL.killsToLevel(l) * BAL.monsterXp(l)),
  // パラゴン（Lv100 以降、上限なし）
  paragonXpToNext: (p) => Math.round(BAL.xpToNext(100) * 0.12 * (1 + p * 0.015)),
  PARAGON_POINTS_PER_LEVEL: 1,
  SKILL_POINTS_PER_LEVEL: 1,
  TREE_POINTS_PER_LEVEL: 1,

  // ---- 敵
  // 手応え（ユーザーの声「敵が弱すぎる・ヌルゲー」で強くした）: 序盤の敵のライフ ×2.5・攻撃 ×1.6。
  // 序盤（Lv12 まで）は主人公の伸びが速く楽すぎたので満額、後半（Lv42 から）はもともと壁があるので ×1.3・×1.12 まで弱める
  DIFFICULTY: { life: 2.5, dmg: 1.6, full: 12, low: 42, lowShare: 0.2 },
  difficultyAt: (L) => {
    const D = BAL.DIFFICULTY;
    const w = Math.max(D.lowShare, Math.min(1, 1 - (1 - D.lowShare) * (L - D.full) / (D.low - D.full)));
    return { life: 1 + (D.life - 1) * w, dmg: 1 + (D.dmg - 1) * w };
  },
  MONSTER_SPEED: 1.35, // 敵の足を速く（遠くから撃つクラスにも敵が届くように）
  MONSTER_RUSH: 1.6, // 近接の敵が 260px より遠い相手へ詰めるときの足の倍率（ボスは除く）
  monsterLife: (L) => 15 * BAL.difficultyAt(L).life * P(L),
  monsterDmg: (L) => 2.5 * BAL.difficultyAt(L).dmg * P(L),
  monsterXp: (L) => 5 * (1 + 0.15 * (L - 1)) * 1.02 ** (L - 1),
  monsterGold: (L) => 1.5 * PG(L),
  // 敵の強さの上乗せ（ワールド担当）。物語の進み具合（DESIGN §3）に合わせる係数。主人公はレベル・スキル・パッシブで
  // 曲線 P(L) より速く強くなるので、その分を敵のライフ・攻撃に足す。Lv 100 で頭打ち（苦行・裂け目はそれぞれの倍率で伸びる）。
  // 倍率 = (1 + a × x) × b^min(x, knee) × (1 + c × (x - knee)₊)、x = L - 1。knee から先はゆるやかに（後半は主人公の伸びが仕組みで決まるため）。
  // tests/sim.mjs の長い計測（node tests/sim.mjs 2400 --pace）で合わせる。
  WORLD: { lifeA: 0.09, lifeB: 1.065, lifeC: 0.03, dmgA: 0.012, dmgB: 1.009, dmgC: 0.003, knee: 45, cap: 100 },
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
    goblin: { life: 3.6, dmg: 0, xp: 3, gold: 30, loot: 12 }, // ため込み屋は逃がしにくい硬さに（6.4 → 3.6。REFERENCE 3.1）
    boss: { life: 26, dmg: 1.8, xp: 30, gold: 25, loot: 10 }, // 攻撃 1.7 → 1.8（ライフは DIFFICULTY で硬くなる）
    actboss: { life: 52, dmg: 2.1, xp: 80, gold: 60, loot: 18 },
    guardian: { life: 96, dmg: 2.2, xp: 60, gold: 50, loot: 15 },
  },
  // 経験値の Lv 差の補正（低すぎる敵は少なく、自分より強い敵は多めに。先へ進みすぎて装備を着けられなくなるのを防ぐ追い上げ）
  XP_CATCHUP: { per: 0.15, max: 3.0 }, // 敵が 1 Lv 上につき +15%（最大 +300%）
  xpLevelPenalty: (heroLvl, L) => {
    const d = heroLvl - L;
    if (d < 0) return 1 + Math.min(BAL.XP_CATCHUP.max, -d * BAL.XP_CATCHUP.per);
    // 地域より 2 Lv 上までは満額。そこから 1 Lv ごとに −20%（上がりすぎると敵が弱く感じる。ユーザーの声「ヌルゲー」）
    if (d <= 2) return 1;
    return Math.max(0.05, 1 - (d - 2) * 0.2);
  },

  // ---- 苦行（物語クリア後の難易度。0 = 通常）
  MAX_TORMENT: 16,
  // I は物語の終わり（Lv100・倍率 1）と同じ重さで、報酬だけ増える。そこから 1 段ごとに 敵の Lv +2（装備の曲線で ×1.17）・ライフ ×1.32・攻撃 ×1.18
  // bossLife: 魔境での地域・章のボスのライフ（物語の終わりは深淵王の長い制限時間で越えるので、地域のボス 30 秒の方が急に重くなるのを和らげる）
  TORMENT: { lvPer: 2, life: 1.32, dmg: 1.18, bossLife: 0.65 },
  torment: (t) => ({
    level: t > 0 ? 100 + (t - 1) * BAL.TORMENT.lvPer : 0, // 敵のエリアレベル（0 なら物語のレベル）
    life: t > 0 ? BAL.TORMENT.life ** (t - 1) : 1,
    dmg: t > 0 ? BAL.TORMENT.dmg ** (t - 1) : 1,
    xp: 1 + 0.75 * t,
    gold: 1 + 0.5 * t,
    loot: 1 + 0.15 * t, // アイテム数
    mf: 25 * t, // レア発見率に足す
    ancient: 0.08 + 0.01 * t,
    primal: t >= 8 ? 0.002 * (t - 7) : 0,
    resPenalty: 5 * t, // 主人公の耐性 -N
  }),

  // ---- 深淵の裂け目（上限なし）
  RIFT_GROWTH: { lvPer: 0.5, life: 1.07, dmg: 1.03 },
  rift: (g) => ({
    level: 100 + Math.floor(g * BAL.RIFT_GROWTH.lvPer), // エリアレベル（2 段ごとに +1）
    life: BAL.RIFT_GROWTH.life ** g,
    dmg: BAL.RIFT_GROWTH.dmg ** g,
    timeLimit: 15 * 60,
  }),

  // ---- ドロップ
  // ユーザーの声「アイテムが出すぎる」で減らした（0.12 → 0.035。敵が硬くなり倒す数も減るので、1 分あたりは約 1/5）
  ITEM_DROP_CHANCE: 0.035, // 普通の敵 1 体あたり
  GOLD_DROP_CHANCE: 0.7, // 倒す数が減ったぶん、1 体あたりのゴールドを増やす（0.35 → 0.7）
  // レアリティの重み（普通の敵）。MF はレア以上を (1+MF/100) 倍
  // アイテム担当が調整: 1〜1.5 体/秒でレア ≈1 分に 1 個・エピック ≈8〜10 分に 1 個（REFERENCE A09）。旧: rare 10.5・epic 2.0・legendary 0.35
  // ミシック 0.003 → 0.012（強さ担当: 1 体/秒で 15〜25 時間に 1 個。物語 1 周で 1〜2 個）
  // 「アイテムが出すぎる」で数を減らしたぶん、1 つの中身を良くする: ノーマル 56 → 30・マジック 33 → 28（レア以上はそのまま。割合は約 1.4 倍）
  RARITY_WEIGHTS: { common: 30, magic: 28, rare: 7.5, epic: 0.8, legendary: 0.45, unique: 0.12, set: 0.08, mythic: 0.012 },
  // レジェンダリー以上（ミシックを除く）の重みの倍率。アイテム Lv 1 で ×0.58、50 で ×4.25、100 で ×8（それ以上は伸びない）
  legendaryBoost: (ilvl) => 0.5 + 0.075 * Math.min(100, Math.max(1, ilvl)),
  // エピックの重みの倍率（終盤は倒す速さが落ちるので少しだけ増やす）
  epicBoost: (ilvl) => 0.85 + 0.006 * Math.min(100, Math.max(1, ilvl)),
  mfEffective: (mf) => (mf <= 0 ? mf : mf * 100 / (mf + 100) * 2), // 逓減（MF 100 → 実効 100、300 → 150）

  // ---- 経済
  sellValue: (ilvl, rarityIdx) => Math.round(2 * PG(ilvl) * (1 + rarityIdx * 1.5)),

  // ---- 放置
  OFFLINE_CAP_HOURS: 8,
  OFFLINE_EFFICIENCY: 0.8,
};

/** 装備の数値（scale:true の能力）を ilvl で伸ばす */
export const itemScale = (ilvl) => P(ilvl);
