// 戦闘の式に乱数を入れた 1 回のダメージ・受けるダメージ・攻撃の時間と当たる瞬間・当たる範囲のテスト。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Physics;
using Lumina.Core.Util;
using Xunit;

namespace Lumina.Core.Tests
{
    public class CombatTests
    {
        private static FinalStats Warrior(int str = 40, int dex = 10, int watk = 30)
        {
            return new FinalStats
            {
                Str = str, Dex = dex, Int = 4, Luk = 4, Watk = watk, Mastery = 0.1, Weapon = WeaponClass.Get("片手剣"), WeaponType = "片手剣",
                Acc = dex * 0.8 + 2, Avoid = 3, AvoidCap = 0.3, Wdef = 20, Mdef = 5,
            };
        }

        private static DefenderInfo Mob(int lv, int def = 0, int avoid = 1, int mdef = 0) =>
            new DefenderInfo { Level = lv, Def = def, Avoid = avoid, Mdef = mdef, ElementMul = e => e == "fire" ? 1.5 : 1 };

        [Fact]
        public void PhysicalDamageStaysInFormulaRange()
        {
            var st = Warrior();
            var rng = new Rng(11);
            var r = Formulas.PhysRange("片手剣", 40, 10, 30, 0.1);
            int lo = int.MaxValue, hi = 0;
            for (int i = 0; i < 20000; i++)
            {
                var h = DamageCalc.Physical(st, 10, Mob(5, def: 0), 100, rng);
                Assert.False(h.Miss);
                lo = Math.Min(lo, h.Damage); hi = Math.Max(hi, h.Damage);
            }
            Assert.Equal(r.Min, lo);
            Assert.Equal(r.Max, hi);
        }

        [Fact]
        public void SkillPercentLevelPenaltyAndDefense()
        {
            var st = Warrior();
            // 乱数を固定: 幅の中の位置 → 防御の割合（命中 100% と会心 0% の時は乱数を使わない）
            var h = DamageCalc.Physical(st, 10, Mob(5, def: 10), 200, new FixedRandom(0.0, 0.5));
            var r = Formulas.PhysRange("片手剣", 40, 10, 30, 0.1);
            Assert.Equal(Formulas.AfterDef(r.Min * 2.0, 10, 0.55), h.Damage);
            // 敵が 10 Lv 高い: ×0.8
            var h2 = DamageCalc.Physical(st, 10, Mob(20, def: 0, avoid: 1), 100, new FixedRandom(0.0, 0.5));
            Assert.Equal(Formulas.AfterDef(r.Min * 0.8, 0, 0.55), h2.Damage);
            // 属性の弱点 ×1.5
            var h3 = DamageCalc.Physical(st, 10, Mob(5), 100, new FixedRandom(0.0, 0.5), element: "fire");
            Assert.Equal(Formulas.AfterDef(r.Min * 1.5, 0, 0.55), h3.Damage);
        }

        [Fact]
        public void MissRateFollowsHitChance()
        {
            var st = Warrior(dex: 10);
            st.Acc = 12;
            var mob = Mob(12, avoid: 20); // 必要な命中 (55+4)*20/15 = 78.7 → 比 0.15 → 0%
            var rng = new Rng(3);
            Assert.True(Enumerable.Range(0, 200).All(_ => DamageCalc.Physical(st, 10, mob, 100, rng).Miss));
            st.Acc = 60; // 比 0.76 → 52%
            double p = Formulas.HitChance(60, 20, 10, 12);
            int hits = 0, n = 20000;
            for (int i = 0; i < n; i++) if (!DamageCalc.Physical(st, 10, mob, 100, rng).Miss) hits++;
            Assert.InRange((double)hits / n, p - 0.02, p + 0.02);
        }

        [Fact]
        public void CriticalMultipliesBeforeDefense()
        {
            var st = Warrior();
            st.CritRate = 1; st.CritDamage = 2;
            var h = DamageCalc.Physical(st, 10, Mob(5, def: 10), 100, new FixedRandom(0.0, 0.5));
            var r = Formulas.PhysRange("片手剣", 40, 10, 30, 0.1);
            Assert.True(h.Critical);
            Assert.Equal(Formulas.AfterDef(r.Min * 2.0, 10, 0.55), h.Damage);
        }

        [Fact]
        public void MagicAlwaysHitsUnlessMuchHigherLevel()
        {
            var st = new FinalStats { Int = 60, MagicPower = 30, Mastery = 0.1, Weapon = WeaponClass.Get("ワンド") };
            var rng = new Rng(5);
            var r = Formulas.MagicRange(60, 90, 40, 0.1);
            for (int i = 0; i < 2000; i++)
            {
                var h = DamageCalc.Magic(st, 20, Mob(20, mdef: 0), 40, rng);
                Assert.False(h.Miss);
                Assert.InRange(h.Damage, Formulas.AfterDef(r.Min, 0), r.Max);
            }
            Assert.Equal(1.0, Formulas.MagicHitChance(20, 24));
            Assert.Equal(0.98, Formulas.MagicHitChance(20, 25), 9);
            Assert.Equal(0.8, Formulas.MagicHitChance(20, 34), 9);
        }

        [Fact]
        public void DamageTakenAvoidAndWarriorReduction()
        {
            var st = Warrior(str: 50);
            st.Avoid = 0;
            var h = DamageCalc.Taken(30, 10, 19, false, st, 10, true, new FixedRandom(0.0));
            // roll 0.85 → raw 25.5 → 減る割合 20/(20+120) → ×(1−0.142857) = 21.857 − STR÷10(5) = 16
            Assert.Equal(Formulas.DamageTaken(30, 20, 10, 10, 0.85, 5), h.Damage);
            Assert.Equal(16, h.Damage);
            var notWarrior = DamageCalc.Taken(30, 10, 19, false, st, 10, false, new FixedRandom(0.0));
            Assert.Equal(21, notWarrior.Damage);
            // 回避の上限（盗賊 80%、ほかは 30%）
            Assert.Equal(0.3, Formulas.AvoidChance(1000, 1, 0.3), 9);
            Assert.Equal(0.8, Formulas.AvoidChance(1000, 1, 0.8), 9);
            st.Avoid = 1000;
            int miss = 0;
            var rng = new Rng(9);
            for (int i = 0; i < 10000; i++) if (DamageCalc.Taken(30, 10, 1, false, st, 10, false, rng).Miss) miss++;
            Assert.InRange(miss / 10000.0, 0.28, 0.32);
        }

        [Fact]
        public void MagicGuardSplitsToMp()
        {
            Assert.Equal((70, 30), DamageCalc.SplitMagicGuard(100, 30, 500));
            Assert.Equal((90, 10), DamageCalc.SplitMagicGuard(100, 30, 10));
            Assert.Equal((100, 0), DamageCalc.SplitMagicGuard(100, 0, 500));
        }

        [Fact]
        public void AttackTimingByWeaponSpeedAndHitMoment()
        {
            foreach (var (stage, delay) in new[] { (2, 0.48), (4, 0.60), (5, 0.66), (6, 0.72), (9, 0.90) })
            {
                var a = AttackAction.Start(Feel.AttackDelay(stage), 1, true);
                Assert.Equal(delay, a.Duration, 9);
                int hitFrame = -1, frames = 0;
                while (!a.Finished)
                {
                    if (a.Advance(Feel.Dt)) hitFrame = frames;
                    frames++;
                }
                Assert.Equal((int)Math.Ceiling(delay * 60 - 1e-6), frames);
                // 当たる瞬間は 2 コマ目の始め（300/800 の所）
                Assert.Equal((int)Math.Ceiling(delay * 0.375 * 60 - 1e-6) - 1, hitFrame);
            }
            Assert.Equal("より速い", Feel.AttackSpeedName(3));
            Assert.Equal("ふつう", Feel.AttackSpeedName(6));
        }

        [Fact]
        public void TargetingPicksNearestInFrontUpToMax()
        {
            var range = Rect.InFront(100, 500, 1, 110, 25, 70, 15);
            var mobs = new List<(int id, Rect box)>
            {
                (1, new Rect(150, 470, 180, 500)), // 前 65
                (2, new Rect(120, 470, 150, 500)), // 前 35
                (3, new Rect(80, 470, 95, 500)),   // 後ろ
                (4, new Rect(300, 470, 330, 500)), // 範囲の外
                (5, new Rect(190, 470, 205, 500)),
            };
            var hit = Targeting.Pick(mobs, m => m.box, range, 100, 1, 3);
            Assert.Equal(new[] { 2, 1, 5 }, hit.Select(h => h.id).ToArray());
            var left = Targeting.Pick(mobs, m => m.box, Rect.InFront(100, 500, -1, 110, 25, 70, 15), 100, -1, 6);
            Assert.Equal(new[] { 3, 2 }, left.Select(h => h.id).ToArray());
        }
    }
}
