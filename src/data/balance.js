// 経験値・バランス定数（progression / enemies / missions が共有する純関数）
// 設計: 「適正Lvの敵を倒す必要数 N(L)」×「基準経験値 E(L)」= expToNext(L)
//  - N(L) は序盤 ~9体 → Lv30 ~110体 → Lv85 ~450体（メイプル的に徐々に重く）
//  - 敵の経験値 = E(敵Lv) × 地域倍率（先の地域ほど効率UP）
// 検証: /tmp/claude-0/sys_v2/sim_exp.mjs

export const MAX_LEVEL = 200;

/** 適正Lvの敵1体の基準経験値（地域倍率 1.0 の場合）。Lv1=2, Lv5=5, Lv9=9, Lv30=35, Lv60=89, Lv100=196 */
export function baseEnemyExp(lv) {
  const L = Math.max(1, lv);
  return 1.2 + 0.75 * L + 0.012 * L * L;
}

/** 1レベル上げるのに必要な適正敵の撃破数（地域倍率 1.0 換算） */
export function killsPerLevel(level) {
  const L = Math.max(1, level);
  return 6 + 2.6 * L + 0.03 * L * L;
}

/** 地域ごとの経験値倍率（先の地域ほど効率が良い） */
export const REGION_EXP_MULT = {
  beach: 0.85, downtown: 1.1, slums: 1.2, swamp: 1.25, casino: 1.35, rooftop: 1.45, spaceport: 1.5,
  // v4: 第2ワールド「ネオン・アーク」
  arkcity: 1.55, cyberwild: 1.6, abyss: 1.65, zenith: 1.7,
};

/**
 * v4: Lv100 以降（第2ワールド）の「1レベルに要る適正敵の撃破数」。360 体から 1 体/Lv ずつ増える。
 * 目安: Lv100→150 ≈ 1.9 万体・Lv150→200 ≈ 2.2 万体（Lv60→100 ≈ 1.1 万体の 1.8 倍・2.0 倍）
 */
export function killsPerLevelW2(level) { return 360 + Math.max(0, level - 100); }
/** v4: 第2ワールドの経験値倍率の目安（地域の倍率 1.55〜1.7 を Lv でならした値） */
export function w2ExpMult(level) { return 1.55 + 0.0015 * Math.max(0, level - 100); }

/**
 * expToNext(level) — 単調増加。
 *  Lv1〜99: killsPerLevel(L) × baseEnemyExp(L)
 *  Lv100〜199: killsPerLevelW2(L) × baseEnemyExp(L) × w2ExpMult(L)（第2ワールドの敵の経験値と合わせた式）
 */
export function expToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  const L = Math.max(1, level);
  if (L >= 100) return Math.round(killsPerLevelW2(L) * baseEnemyExp(L) * w2ExpMult(L));
  return Math.round(killsPerLevel(L) * baseEnemyExp(L));
}

/** 夜（20時〜翌5時）か。clock 未定義なら false */
export function isNight(clock) {
  if (typeof clock !== 'number' || !Number.isFinite(clock)) return false;
  const h = ((clock % 24) + 24) % 24;
  return h >= 20 || h < 5;
}
export const NIGHT_EXP_BONUS = 0.1;
