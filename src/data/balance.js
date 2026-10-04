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
};

/** expToNext(level) — 単調増加。Lv100 以降はさらに 5%/Lv ずつ重くなる */
export function expToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  const L = Math.max(1, level);
  let v = killsPerLevel(L) * baseEnemyExp(L);
  if (L > 100) v *= Math.pow(1.05, L - 100);
  return Math.round(v);
}

/** 夜（20時〜翌5時）か。clock 未定義なら false */
export function isNight(clock) {
  if (typeof clock !== 'number' || !Number.isFinite(clock)) return false;
  const h = ((clock % 24) + 24) % 24;
  return h >= 20 || h < 5;
}
export const NIGHT_EXP_BONUS = 0.1;
