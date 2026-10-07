// クラシック風の数値カーブ（経験値の表・敵の基礎値）。classic/tools/lib/curves.mjs をそのまま移したもの。
// 「アンカー（目印の値）」の間を対数で直線補間する。値は STATS.md・MONSTERS.md の表と同じ（Tests の Golden で確かめる）。
using System;

namespace Lumina.Core.Character
{
    public static class Curves
    {
        /// <summary>JS の Math.round と同じ丸め（.5 は上へ）</summary>
        public static double JsRound(double v) => Math.Floor(v + 0.5);

        public static double LogInterp(double[,] anchors, double x)
        {
            int n = anchors.GetLength(0);
            int i = 0;
            while (i < n - 2 && x > anchors[i + 1, 0]) i++;
            double x0 = anchors[i, 0], y0 = anchors[i, 1];
            double x1 = anchors[i + 1, 0], y1 = anchors[i + 1, 1];
            double t = (x - x0) / (x1 - x0);
            return Math.Exp(Math.Log(y0) + (Math.Log(y1) - Math.Log(y0)) * t);
        }

        /// <summary>見やすい丸め（有効数字 3 桁）</summary>
        public static double Nice(double v)
        {
            if (v < 100) return JsRound(v);
            double p = Math.Pow(10, Math.Floor(Math.Log10(v)) - 2);
            return JsRound(v / p) * p;
        }

        private static readonly long[] ExpHead = { 15, 34, 57, 92, 135 };
        public static readonly double[,] ExpAnchors =
        {
            { 5, 135 }, { 6, 372 }, { 10, 1600 }, { 15, 6300 }, { 20, 16500 }, { 30, 70000 }, { 40, 250000 }, { 50, 680000 },
            { 60, 1500000 }, { 70, 2900000 }, { 80, 5000000 }, { 90, 8200000 }, { 100, 13000000 }, { 110, 21000000 },
            { 120, 34000000 }, { 130, 55000000 }, { 140, 88000000 }, { 150, 140000000 }, { 160, 220000000 },
            { 170, 340000000 }, { 180, 520000000 }, { 190, 800000000 }, { 199, 1200000000 },
        };

        public const int MaxLevel = 200;

        private static long[] expCache;

        /// <summary>Lv → Lv+1 に必要な経験値（Lv200 は 0）</summary>
        public static long ExpToNext(int lv)
        {
            if (lv >= MaxLevel) return 0;
            if (lv < 1) lv = 1;
            if (expCache == null)
            {
                var c = new long[MaxLevel + 1];
                for (int l = 1; l < MaxLevel; l++)
                    c[l] = l <= 5 ? ExpHead[l - 1] : (long)Math.Round(Nice(LogInterp(ExpAnchors, l)));
                expCache = c;
            }
            return expCache[lv];
        }

        /// <summary>Lv1 からその Lv になるまでの累計</summary>
        public static long ExpTotalAt(int lv)
        {
            long t = 0;
            for (int l = 1; l < lv && l < MaxLevel; l++) t += ExpToNext(l);
            return t;
        }

        // ---- 敵の基礎値（Lv ごと、ふつうの敵 = 倍率 1.0）
        public static readonly double[,] MobHp = { { 1, 8 }, { 3, 20 }, { 6, 55 }, { 10, 140 }, { 15, 330 }, { 20, 700 }, { 30, 1900 }, { 40, 4300 }, { 50, 8500 }, { 60, 13000 }, { 70, 19000 }, { 80, 27000 }, { 90, 37000 }, { 100, 50000 }, { 120, 85000 }, { 140, 125000 }, { 160, 170000 }, { 180, 222000 }, { 200, 265000 } };
        public static readonly double[,] MobExp = { { 1, 3 }, { 3, 6 }, { 6, 11 }, { 10, 20 }, { 15, 34 }, { 20, 52 }, { 30, 105 }, { 40, 185 }, { 50, 300 }, { 60, 450 }, { 70, 660 }, { 80, 930 }, { 90, 1280 }, { 100, 1750 }, { 120, 3000 }, { 140, 4900 }, { 160, 7700 }, { 180, 11500 }, { 200, 17000 } };
        public static readonly double[,] MobAtk = { { 1, 6 }, { 5, 12 }, { 10, 22 }, { 20, 45 }, { 30, 75 }, { 40, 110 }, { 50, 150 }, { 60, 200 }, { 70, 260 }, { 80, 330 }, { 90, 410 }, { 100, 500 }, { 120, 720 }, { 140, 900 }, { 160, 1100 }, { 180, 1350 }, { 200, 1600 } };
        public static readonly double[,] MobDef = { { 1, 0.5 }, { 10, 8 }, { 20, 20 }, { 30, 35 }, { 40, 55 }, { 50, 80 }, { 70, 140 }, { 100, 260 }, { 120, 360 }, { 150, 520 }, { 200, 800 } };
        public static readonly double[,] MobAvoid = { { 1, 1 }, { 10, 4 }, { 20, 7.5 }, { 30, 11 }, { 50, 18 }, { 70, 25 }, { 100, 36 }, { 150, 54 }, { 200, 72 } }; // Lv × 0.36（STATS.md 2-3）
        public static readonly double[,] MobMeso = { { 1, 4 }, { 10, 25 }, { 20, 60 }, { 30, 110 }, { 50, 260 }, { 70, 480 }, { 100, 900 }, { 150, 1800 }, { 200, 3000 } };
        public static readonly double[,] SoloExpMul = { { 1, 1.0 }, { 10, 1.4 }, { 30, 2.4 }, { 70, 4.0 }, { 120, 5.5 }, { 160, 7.0 }, { 200, 8.5 } };

        public static double SoloMul(double lv) => LogInterp(SoloExpMul, lv);
        /// <summary>1 人用の補正: 敵が落とすお金の倍率（curves.mjs の SOLO_MESO_MUL。取引が無い分を補う）</summary>
        public static readonly double[,] SoloMesoMulAnchors = { { 1, 1.0 }, { 8, 1.3 }, { 15, 1.8 }, { 30, 1.8 }, { 60, 1.5 }, { 100, 1.2 }, { 150, 1.0 }, { 200, 1.0 } };
        public static double SoloMesoMul(double lv) => LogInterp(SoloMesoMulAnchors, lv);

        public struct MobBaseValues { public double Hp, BaseExp, Exp, Atk, Def, Avoid, Meso, DropMeso; }

        public static MobBaseValues MobBase(double lv)
        {
            return new MobBaseValues
            {
                Hp = LogInterp(MobHp, lv),
                BaseExp = LogInterp(MobExp, lv),
                Exp = LogInterp(MobExp, lv) * SoloMul(lv),
                Atk = LogInterp(MobAtk, lv),
                Def = lv <= 1 ? 0 : LogInterp(MobDef, lv),
                Avoid = LogInterp(MobAvoid, lv),
                Meso = LogInterp(MobMeso, lv),
                DropMeso = LogInterp(MobMeso, lv) * SoloMesoMul(lv),
            };
        }
    }
}
