// 1 回のダメージを決める（STATS.md 2-3・3・4 章の式に乱数を入れたもの）。
// 結果は HitResult（値・会心か・外れか）で返し、Unity 側はそれを DamageNumber として描く。
using System;
using Lumina.Core.Character;
using Lumina.Core.Util;

namespace Lumina.Core.Combat
{
    public struct HitResult
    {
        public int Damage;
        public bool Critical;
        public bool Miss;

        public static HitResult MissHit => new HitResult { Miss = true };
        public override string ToString() => Miss ? "MISS" : (Critical ? Damage + "!" : Damage.ToString());
    }

    /// <summary>ダメージを受ける側（敵）の守りの値。かく乱などの弱体を引いた後の値を入れる。</summary>
    public struct DefenderInfo
    {
        public int Level, Def, Mdef, Avoid;
        public Func<string, double> ElementMul;
    }

    public static class DamageCalc
    {
        /// <summary>
        /// 物理の攻撃（ふつうの攻撃・物理スキル）。skillPct = スキルの倍率（ふつうの攻撃は 100）。
        /// weaponMul = 武器係数の上書き（二つ星投げ 5.0）。
        /// </summary>
        public static HitResult Physical(FinalStats st, int playerLv, DefenderInfo mob, double skillPct, IRandom rng,
            double? weaponMul = null, string element = null, bool stab = false, bool alwaysCrit = false)
        {
            // 命中の判定
            double hit = Formulas.HitChance(st.Acc, mob.Avoid, playerLv, mob.Level);
            if (!rng.Chance(hit)) return HitResult.MissHit;
            double mul = weaponMul ?? st.Weapon.Mul(stab);
            var r = Formulas.PhysRange(mul, st.MainStat, st.SubStat, st.Watk, st.Mastery);
            double dmg = rng.Range((double)r.Min, r.Max + 0.999999);
            dmg = Math.Floor(dmg);
            dmg *= skillPct / 100.0;
            dmg *= mob.ElementMul?.Invoke(element) ?? 1;
            dmg *= Formulas.LevelPenalty(playerLv, mob.Level);
            bool crit = alwaysCrit || (st.CritRate > 0 && rng.Chance(st.CritRate));
            if (crit) dmg *= Math.Max(1, st.CritDamage);
            int final = Formulas.AfterDef(dmg, mob.Def, rng.Range(0.5, 0.6));
            if (dmg <= 0) final = 0; // 属性で無効
            return new HitResult { Damage = Math.Min(Formulas.DamageCap, final), Critical = crit };
        }

        /// <summary>魔法の攻撃。spell = スキルの魔法攻撃力。必ず当たる（敵が 5 Lv 以上高いと少し外れる）。</summary>
        public static HitResult Magic(FinalStats st, int playerLv, DefenderInfo mob, double spell, IRandom rng, string element = null)
        {
            if (!rng.Chance(Formulas.MagicHitChance(playerLv, mob.Level))) return HitResult.MissHit;
            var r = Formulas.MagicRange(st.Int, st.Matk, spell, st.Mastery);
            double dmg = Math.Floor(rng.Range((double)r.Min, r.Max + 0.999999));
            dmg *= mob.ElementMul?.Invoke(element) ?? 1;
            dmg *= Formulas.LevelPenalty(playerLv, mob.Level);
            if (dmg <= 0) return new HitResult { Damage = 0 };
            int final = Formulas.AfterDef(dmg, mob.Mdef, rng.Range(0.5, 0.6));
            return new HitResult { Damage = Math.Min(Formulas.DamageCap, final) };
        }

        /// <summary>固定ダメージ（石つぶて）。物理の命中で外れることはある。防御は引かない。</summary>
        public static HitResult Fixed(FinalStats st, int playerLv, DefenderInfo mob, int amount, IRandom rng)
        {
            double hit = Formulas.HitChance(st.Acc, mob.Avoid, playerLv, mob.Level);
            if (!rng.Chance(hit)) return HitResult.MissHit;
            return new HitResult { Damage = Math.Max(1, amount) };
        }

        /// <summary>
        /// 敵から受けるダメージ（触れた時・敵の攻撃）。避けた時は Miss。
        /// 物理: 物理防御で減らし、戦士は STR÷10 をさらに引く。魔法: 魔法防御で減らす。
        /// </summary>
        public static HitResult Taken(int mobAtk, int mobLv, int mobAcc, bool magic, FinalStats st, int playerLv, bool isWarrior, IRandom rng)
        {
            if (!magic && rng.Chance(Formulas.AvoidChance(st.Avoid, mobAcc, st.AvoidCap))) return HitResult.MissHit;
            double roll = rng.Range(0.85, 1.0);
            double def = magic ? st.Mdef : st.Wdef;
            double flat = !magic && isWarrior ? st.Str / 10 : 0;
            return new HitResult { Damage = Formulas.DamageTaken(mobAtk, def, mobLv, playerLv, roll, flat) };
        }

        /// <summary>魔力の盾: 受けるダメージの pct% を MP で受ける（MP が足りなければ残りは HP）。(hpDamage, mpDamage)</summary>
        public static (int hp, int mp) SplitMagicGuard(int damage, double pct, int currentMp)
        {
            if (pct <= 0 || damage <= 0) return (damage, 0);
            int toMp = (int)Math.Floor(damage * Math.Min(100, pct) / 100.0);
            toMp = Math.Min(toMp, currentMp);
            return (damage - toMp, toMp);
        }
    }
}
