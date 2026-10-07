// クラシック風の数値カーブ（経験値の表・敵の基礎値）。
// 「アンカー（目印の値）」を決め、その間を対数で直線補間する。
// どの値も docs/STATS.md・docs/MONSTERS.md の生成元。値を変えたら `node classic/tools/gen_docs.mjs` で表を作り直す。

export function logInterp(anchors, x) {
  // anchors: [[x, y], ...] x 昇順。範囲外は端の傾きで外挿。
  let i = 0;
  while (i < anchors.length - 2 && x > anchors[i + 1][0]) i++;
  const [x0, y0] = anchors[i];
  const [x1, y1] = anchors[i + 1];
  const t = (x - x0) / (x1 - x0);
  return Math.exp(Math.log(y0) + (Math.log(y1) - Math.log(y0)) * t);
}

// 見やすい丸め（有効数字 3 桁）
export function nice(v) {
  if (v < 100) return Math.round(v);
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 2);
  return Math.round(v / p) * p;
}

// ---- 経験値の表：Lv n → n+1 に必要な経験値
// 1〜5 は手で決めた値（最初の数匹でレベルが上がる手ごたえ）。6 以降はアンカー補間。
const EXP_HEAD = [15, 34, 57, 92, 135];
export const EXP_ANCHORS = [
  [5, 135], [6, 372], [10, 1600], [15, 6300], [20, 16500], [30, 70000], [40, 250000], [50, 680000],
  [60, 1500000], [70, 2900000], [80, 5000000], [90, 8200000], [100, 13000000], [110, 21000000],
  [120, 34000000], [130, 55000000], [140, 88000000], [150, 140000000], [160, 220000000],
  [170, 340000000], [180, 520000000], [190, 800000000], [199, 1200000000],
];
export function expToNext(lv) {
  if (lv >= 200) return 0;
  if (lv <= 5) return EXP_HEAD[lv - 1];
  return nice(logInterp(EXP_ANCHORS, lv));
}
export function expTable() {
  const rows = [];
  let total = 0;
  for (let lv = 1; lv <= 200; lv++) {
    const need = expToNext(lv);
    rows.push({ lv, need, total });
    total += need;
  }
  return rows;
}

// ---- 敵の基礎値（Lv ごと、ふつうの敵＝倍率 1.0 のとき）
export const MOB_HP = [[1, 8], [3, 20], [6, 55], [10, 140], [15, 330], [20, 700], [30, 1900], [40, 4300], [50, 8500], [60, 13000], [70, 19000], [80, 27000], [90, 37000], [100, 50000], [120, 85000], [140, 125000], [160, 170000], [180, 222000], [200, 265000]];
export const MOB_EXP = [[1, 3], [3, 6], [6, 11], [10, 20], [15, 34], [20, 52], [30, 105], [40, 185], [50, 300], [60, 450], [70, 660], [80, 930], [90, 1280], [100, 1750], [120, 3000], [140, 4900], [160, 7700], [180, 11500], [200, 17000]];
export const MOB_ATK = [[1, 6], [5, 12], [10, 22], [20, 45], [30, 75], [40, 110], [50, 150], [60, 200], [70, 260], [80, 330], [90, 410], [100, 500], [120, 720], [140, 900], [160, 1100], [180, 1350], [200, 1600]];
export const MOB_DEF = [[1, 0.5], [10, 8], [20, 20], [30, 35], [40, 55], [50, 80], [70, 140], [100, 260], [120, 360], [150, 520], [200, 800]];
// 敵の回避 ≒ Lv × 0.36（初めは Lv × 0.5。基礎の命中 5 + Lv と合わせて「同じ Lv 帯ならほぼ当たり、格上は MISS が増える」。STATS.md 2-3 の表）
export const MOB_AVOID = [[1, 1], [10, 4], [20, 7.5], [30, 11], [50, 18], [70, 25], [100, 36], [150, 54], [200, 72]];
// 柔らかい敵（空を飛ぶ小物など）の回避の倍率
export const FRAIL_AVOID = 1.25;
export const MOB_MESO = [[1, 4], [10, 25], [20, 60], [30, 110], [50, 260], [70, 480], [100, 900], [150, 1800], [200, 3000]];

// 1 人用の補正（パーティー無し）: 敵の経験値に掛ける倍率。高 Lv ほど大きい。
// クラシックの「表の形」は変えずに、1 人でも現実的な時間で育つようにする。
export const SOLO_EXP_MUL = [[1, 1.0], [10, 1.4], [30, 2.4], [70, 4.0], [120, 5.5], [160, 7.0], [200, 8.5]];
export function soloMul(lv) { return logInterp(SOLO_EXP_MUL, lv); }

// 1 人用の補正: 敵が落とすお金に掛ける倍率。クラシックは他のプレイヤーとの取引（装備・書・素材を売る）が
// 稼ぎの大きな柱だったが、1 人用には無い。その分を敵のお金で補い、「狩りで薬代は賄えて少し余る」ようにする。
// 薬代が重い Lv10〜60（2 次の前後）を厚く、高 Lv は市場の書・ボスの装備で稼げるので 1 倍に戻す。クエストのお金には掛けない。
export const SOLO_MESO_MUL = [[1, 1.0], [8, 1.3], [15, 1.8], [30, 1.8], [60, 1.5], [100, 1.2], [150, 1.0], [200, 1.0]];
// 1 次〜2 次の始めのふつうの敵（通常・硬い・柔い）の HP に掛ける倍率。クラシックの 1 次の狩り場の敵は 2〜4 回で倒れた。
// 本作の基礎値のままだと Lv15〜40 で 4〜8 回かかり、触れられる回数（＝薬代）が増えて稼ぎを上回った（PLAYTEST.md）。
// 強敵・ボスは「1 人で何分」で決めてあるので掛けない。経験値は変えない（狩りの時間の表は撃破数で決まる）。
export const EARLY_HP_MUL = [[1, 1], [10, 1], [15, 0.8], [20, 0.7], [30, 0.68], [40, 0.75], [50, 0.88], [60, 1], [200, 1]];
export function earlyHpMul(lv, kind = 'normal') { return ['normal', 'tough', 'frail'].includes(kind) ? logInterp(EARLY_HP_MUL, lv) : 1; }

// 敵が落とす薬（その Lv 帯の HP の薬・MP の薬）の確率（それぞれ）。
export const POT_DROP = 0.07;
export function soloMesoMul(lv) { return logInterp(SOLO_MESO_MUL, lv); }

export function mobBase(lv) {
  return {
    hp: logInterp(MOB_HP, lv),
    baseExp: logInterp(MOB_EXP, lv),
    exp: logInterp(MOB_EXP, lv) * soloMul(lv),
    atk: logInterp(MOB_ATK, lv),
    def: lv <= 1 ? 0 : logInterp(MOB_DEF, lv),
    avoid: logInterp(MOB_AVOID, lv),
    meso: logInterp(MOB_MESO, lv),                          // その Lv の「お金の単位」（クエストの報酬・宝箱）
    dropMeso: logInterp(MOB_MESO, lv) * soloMesoMul(lv),     // 敵が 1 回に落とす平均（1 人用の補正込み）
  };
}

// 敵の種類ごとの倍率
export const KIND_MUL = {
  normal: { hp: 1, exp: 1, atk: 1, def: 1 },
  tough: { hp: 1.6, exp: 1.5, atk: 1.1, def: 1.4 },   // 硬い（ゴーレム等）
  frail: { hp: 0.7, exp: 0.75, atk: 0.9, def: 0.6 },  // 柔らかい（空を飛ぶ小物等）
  elite: { hp: 10, exp: 8, atk: 1.4, def: 1.3 },      // 強敵（時間で湧く大きめの個体）
  boss: { hp: 120, exp: 60, atk: 1.8, def: 1.5 },     // 地域ボス（1 人で 6〜12 分）
  raid: { hp: 400, exp: 150, atk: 2.2, def: 1.8 },    // 大ボス（段階の合計）
};
