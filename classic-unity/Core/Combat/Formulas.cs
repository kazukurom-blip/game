// 戦闘の計算式（classic/docs/STATS.md・classic/tools/lib/combat.mjs と同じ式）。
// ここは「乱数を使わない式」だけ。乱数で 1 回のダメージを決めるのは DamageCalc。
using System;
using System.Collections.Generic;

namespace Lumina.Core.Combat
{
    public enum Stat { None, STR, DEX, INT, LUK }

    /// <summary>武器の種類ごとの係数（STATS.md 2-1）。</summary>
    public sealed class WeaponClass
    {
        public string Type;       // 片手剣 など（データの weaponType と同じ文字）
        public Stat Main;
        public Stat Sub;          // 盗賊の短剣・クローは STR+DEX（SubIsStrDex）
        public bool SubIsStrDex;
        public double Swing, Stab; // 振り / 突きの係数（同じなら同じ値）
        public int Speed;         // 攻撃速度の段階（2〜9）
        public bool Ranged;       // 遠くへ撃つ（弓・クロスボウ・クロー・銃）
        public string Ammo;       // 必要な弾の種類（arrow_bow / arrow_xbow / star / bullet）

        public double Mul(bool stab) => stab ? Stab : Swing;

        public static readonly Dictionary<string, WeaponClass> All = new Dictionary<string, WeaponClass>
        {
            { "片手剣", new WeaponClass { Type = "片手剣", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.0, Stab = 4.0, Speed = 5 } },
            { "両手剣", new WeaponClass { Type = "両手剣", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.6, Stab = 4.6, Speed = 6 } },
            { "片手斧", new WeaponClass { Type = "片手斧", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.4, Stab = 3.2, Speed = 5 } },
            { "両手斧", new WeaponClass { Type = "両手斧", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.8, Stab = 3.4, Speed = 6 } },
            { "片手鈍器", new WeaponClass { Type = "片手鈍器", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.4, Stab = 3.2, Speed = 5 } },
            { "両手鈍器", new WeaponClass { Type = "両手鈍器", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.8, Stab = 3.4, Speed = 6 } },
            { "槍", new WeaponClass { Type = "槍", Main = Stat.STR, Sub = Stat.DEX, Swing = 3.0, Stab = 5.0, Speed = 6 } },
            { "矛", new WeaponClass { Type = "矛", Main = Stat.STR, Sub = Stat.DEX, Swing = 5.0, Stab = 3.0, Speed = 6 } },
            { "弓", new WeaponClass { Type = "弓", Main = Stat.DEX, Sub = Stat.STR, Swing = 3.4, Stab = 3.4, Speed = 6, Ranged = true, Ammo = "arrow_bow" } },
            { "クロスボウ", new WeaponClass { Type = "クロスボウ", Main = Stat.DEX, Sub = Stat.STR, Swing = 3.6, Stab = 3.6, Speed = 6, Ranged = true, Ammo = "arrow_xbow" } },
            { "クロー", new WeaponClass { Type = "クロー", Main = Stat.LUK, SubIsStrDex = true, Swing = 3.6, Stab = 3.6, Speed = 4, Ranged = true, Ammo = "star" } },
            { "短剣", new WeaponClass { Type = "短剣", Main = Stat.LUK, SubIsStrDex = true, Swing = 3.6, Stab = 3.6, Speed = 4 } },
            { "ナックル", new WeaponClass { Type = "ナックル", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.8, Stab = 4.8, Speed = 5 } },
            { "銃", new WeaponClass { Type = "銃", Main = Stat.DEX, Sub = Stat.STR, Swing = 3.6, Stab = 3.6, Speed = 5, Ranged = true, Ammo = "bullet" } },
            { "素手", new WeaponClass { Type = "素手", Main = Stat.STR, Sub = Stat.DEX, Swing = 4.2, Stab = 4.2, Speed = 4 } },
            { "ワンド", new WeaponClass { Type = "ワンド", Main = Stat.INT, Sub = Stat.LUK, Swing = 3.6, Stab = 3.6, Speed = 5 } },
            { "スタッフ", new WeaponClass { Type = "スタッフ", Main = Stat.INT, Sub = Stat.LUK, Swing = 3.6, Stab = 3.6, Speed = 6 } },
        };

        public static WeaponClass Get(string type)
        {
            if (type != null && All.TryGetValue(type, out var w)) return w;
            return All["素手"];
        }
    }

    public struct DamageRange
    {
        public int Min, Max;
        public DamageRange(int min, int max) { Min = min; Max = max; }
        public override string ToString() => Min + "〜" + Max;
    }

    public static class Formulas
    {
        public const int DamageCap = 199999;

        /// <summary>物理の攻撃力の幅（表示用の「攻撃力 最小〜最大」）。main/sub: 主・副ステータス, watk: 攻撃力, mastery: 熟練度。</summary>
        public static DamageRange PhysRange(double mul, double main, double sub, double watk, double mastery = 0.1)
        {
            double max = (main * mul + sub) * watk / 100;
            double min = (main * mul * 0.9 * mastery + sub) * watk / 100;
            return new DamageRange((int)Math.Max(1, Math.Floor(min)), (int)Math.Max(1, Math.Floor(max)));
        }

        public static DamageRange PhysRange(string weaponType, double main, double sub, double watk, double mastery = 0.1, bool stab = false)
            => PhysRange(WeaponClass.Get(weaponType).Mul(stab), main, sub, watk, mastery);

        /// <summary>魔法の幅。matk = INT + 魔力（装備・バフ）、spell = スキルの「魔法攻撃力」。</summary>
        public static DamageRange MagicRange(double intStat, double matk, double spell, double mastery = 0.1)
        {
            double M = matk;
            double max = (M * M / 1000 + M) / 30 + intStat / 200;
            double min = (M * M / 1000 + M * mastery * 0.9) / 30 + intStat / 200;
            return new DamageRange((int)Math.Floor(min * spell), (int)Math.Floor(max * spell));
        }

        /// <summary>敵の防御で減らす。防御 × r（0.5〜0.6）を引く。最低 1。</summary>
        public static int AfterDef(double dmg, double def, double r = 0.55) => (int)Math.Max(1, Math.Floor(dmg - def * r));

        /// <summary>レベル差の補正（敵の方が高い時だけ）: 1 − 0.02 × 差、最低 0.5。</summary>
        public static double LevelPenalty(int playerLv, int mobLv)
        {
            int d = mobLv - playerLv;
            if (d <= 0) return 1;
            return Math.Max(0.5, 1 - 0.02 * d);
        }

        /// <summary>基礎の命中（Lv で上がる分）: 5 + Lv × 1.0（combat.mjs の baseAcc。ユーザーの決定「命中の底上げ」）。</summary>
        public static double BaseAcc(int level) => 5 + level * 1.0;

        /// <summary>自分の命中 = 基礎の命中 + DEX × 0.8 + LUK × 0.5 + 装備・バフ・パッシブ（combat.mjs の playerAcc）。</summary>
        public static double PlayerAcc(int level, double dex, double luk, double extra) => BaseAcc(level) + dex * 0.8 + luk * 0.5 + extra;

        /// <summary>命中率（物理）。acc: 自分の命中、avoid: 敵の回避。</summary>
        public static double HitChance(double acc, double avoid, int playerLv, int mobLv)
        {
            int d = Math.Max(0, mobLv - playerLv);
            double need = (55 + 2 * d) * avoid / 15;
            double r = acc / need;
            if (r >= 1) return 1;
            if (r <= 0.5) return 0;
            return (r - 0.5) * 2;
        }

        /// <summary>魔法の命中: 必ず当たる。敵の Lv が 5 以上高いと 1 Lv ごとに 2% 外れる。</summary>
        public static double MagicHitChance(int playerLv, int mobLv)
        {
            int d = mobLv - playerLv;
            if (d < 5) return 1;
            return Math.Max(0, 1 - 0.02 * (d - 4));
        }

        /// <summary>敵から受けるダメージ（物理）の平均（combat.mjs の damageTaken。乱数 0.85〜1.0 の平均 0.925）。</summary>
        public static int DamageTakenAverage(double mobAtk, double wdef, int mobLv, int playerLv)
            => DamageTaken(mobAtk, wdef, mobLv, playerLv, 0.925, 0);

        /// <summary>敵から受けるダメージ。roll = 0.85〜1.0 の乱数、flatReduce = 戦士の STR÷10 など最後に引く値。</summary>
        public static int DamageTaken(double mobAtk, double def, int mobLv, int playerLv, double roll, double flatReduce)
        {
            double raw = mobAtk * roll;
            double red = def / (def + 4 * mobAtk);
            double lvAdj = mobLv > playerLv ? 1 + 0.01 * (mobLv - playerLv) : 1;
            return (int)Math.Max(1, Math.Floor(raw * (1 - red) * lvAdj - flatReduce));
        }

        /// <summary>避ける確率 = 回避 ÷ (回避 + 敵の命中 × 4.5)、上限 cap（盗賊 0.8、他 0.3）。</summary>
        public static double AvoidChance(double avoid, double mobAcc, double cap)
        {
            if (avoid <= 0) return 0;
            double c = avoid / (avoid + mobAcc * 4.5);
            return Math.Min(cap, c);
        }
    }
}
