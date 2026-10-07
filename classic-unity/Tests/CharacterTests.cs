// キャラの育ち（Lv・経験値・AP・SP・HP/MP・転職・死んだ時）と最終の能力のテスト。
using System;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Items;
using Lumina.Core.Skills;
using Lumina.Core.Util;
using Xunit;

namespace Lumina.Core.Tests
{
    public class CharacterTests
    {
        private static CharacterState NewChar() => new CharacterState();

        [Fact]
        public void StartsAtLevel1With50Hp5Mp()
        {
            var c = NewChar();
            Assert.Equal(1, c.Level);
            Assert.Equal(50, c.BaseMaxHp);
            Assert.Equal(5, c.BaseMaxMp);
            Assert.Equal(15, c.ExpToNext);
        }

        [Fact]
        public void DiceRollSums25AndEachAtLeast4()
        {
            var rng = new Rng(7);
            for (int i = 0; i < 200; i++)
            {
                var c = NewChar();
                c.RollStats(rng);
                Assert.Equal(25, c.Str + c.Dex + c.Int + c.Luk);
                Assert.True(c.Str >= 4 && c.Dex >= 4 && c.Int >= 4 && c.Luk >= 4);
            }
        }

        [Fact]
        public void LevelUpGivesAp5AndBeginnerSpAndHp()
        {
            var c = NewChar();
            var rng = new Rng(1);
            var info = c.GainExp(15, rng, default);
            Assert.NotNull(info);
            Assert.Equal(2, c.Level);
            Assert.Equal(5, c.Ap);
            Assert.Equal(1, c.Sp[0]);
            Assert.InRange(info.HpGain, 12, 16);
            Assert.InRange(info.MpGain, 10, 12);
            Assert.Equal(0, c.Exp);
            Assert.Equal(c.BaseMaxHp, c.Hp); // Lv が上がると全部回復
        }

        [Fact]
        public void OnlyOneLevelPerGainAndExcessCapped()
        {
            var c = NewChar();
            c.GainExp(100000, new Rng(2), default);
            Assert.Equal(2, c.Level);
            Assert.Equal(34 - 1, c.Exp); // あふれた分は「次の必要量 − 1」まで
        }

        [Fact]
        public void BeginnerSpTotalIs6AndWarriorFirstJobTotalIs61()
        {
            var c = NewChar();
            var rng = new Rng(3);
            while (c.Level < 10) c.LevelUp(rng, default);
            Assert.Equal(6, c.Sp[0]); // Lv2〜7 で 1 ずつ
            Assert.Equal(AdvanceResult.StatTooLow, c.CanAdvanceFirst(JobLine.Warrior));
            c.Str = 35;
            Assert.Equal(AdvanceResult.Ok, c.AdvanceFirst(JobLine.Warrior, rng));
            Assert.Equal(1, c.Tier);
            Assert.Equal(1, c.Sp[1]);
            while (c.Level < 30) c.LevelUp(rng, default);
            Assert.Equal(61, c.Sp[1]); // JOBS.md 2-3 の合計の目安
            Assert.Equal(6, c.Sp[0]);  // 段階ごとの財布（混ざらない）
        }

        [Fact]
        public void MagicianAdvancesAtLevel8AndGets67Sp()
        {
            var c = NewChar();
            var rng = new Rng(4);
            while (c.Level < 7) c.LevelUp(rng, default);
            c.Int = 20;
            Assert.Equal(AdvanceResult.LevelTooLow, c.CanAdvanceFirst(JobLine.Magician));
            c.LevelUp(rng, default);
            int mp0 = c.BaseMaxMp;
            Assert.Equal(AdvanceResult.Ok, c.AdvanceFirst(JobLine.Magician, rng));
            Assert.InRange(c.BaseMaxMp - mp0, 100, 150);
            while (c.Level < 30) c.LevelUp(rng, default);
            Assert.Equal(67, c.Sp[1]);
        }

        [Theory]
        [InlineData(JobLine.Warrior, 24, 28, 4, 6)]
        [InlineData(JobLine.Bowman, 20, 24, 14, 16)]
        [InlineData(JobLine.Thief, 20, 24, 14, 16)]
        [InlineData(JobLine.Pirate, 22, 26, 18, 22)]
        public void HpMpGrowthPerJob(string line, int hpMin, int hpMax, int mpMin, int mpMax)
        {
            var c = NewChar();
            c.Level = 10; c.Str = 40; c.Dex = 40;
            var rng = new Rng(5);
            c.AdvanceFirst(line, rng);
            for (int i = 0; i < 50; i++)
            {
                var info = c.LevelUp(rng, default);
                Assert.InRange(info.HpGain, hpMin, hpMax);
                Assert.InRange(info.MpGain, mpMin, mpMax);
            }
        }

        [Fact]
        public void MagicianMpGrowthAddsIntBonus()
        {
            var c = NewChar();
            c.Level = 8; c.Int = 60;
            var rng = new Rng(6);
            c.AdvanceFirst(JobLine.Magician, rng);
            var info = c.LevelUp(rng, default);
            Assert.InRange(info.MpGain, 22 + 3, 24 + 3); // INT÷20 = 3
            var info2 = c.LevelUp(rng, new GrowthBonus { LevelMp = 5 });
            Assert.InRange(info2.MpGain, 22 + 5 + 6, 24 + 5 + 6); // 最大MPアップ: +x と INT÷10
        }

        [Fact]
        public void ApIntoHpAndMpPerJob()
        {
            var c = NewChar();
            c.Level = 10; c.Str = 35;
            c.AdvanceFirst(JobLine.Warrior, new Rng(1));
            c.Ap = 3;
            int hp = c.BaseMaxHp, mp = c.BaseMaxMp;
            Assert.True(c.SpendApHp(default));
            Assert.Equal(hp + 20, c.BaseMaxHp);
            Assert.True(c.SpendApHp(new GrowthBonus { ApHp = 4 }));
            Assert.Equal(hp + 20 + 24, c.BaseMaxHp);
            Assert.True(c.SpendApMp(default));
            Assert.Equal(mp + 2, c.BaseMaxMp);
            Assert.False(c.SpendAp(Stat.STR)); // AP が無い
            Assert.Equal(2, c.ApHpCount);
        }

        [Fact]
        public void ManualApOnly()
        {
            var c = NewChar();
            c.Ap = 2;
            Assert.True(c.SpendAp(Stat.LUK));
            Assert.True(c.SpendAp(Stat.DEX));
            Assert.Equal(5, c.Luk);
            Assert.Equal(5, c.Dex);
            Assert.Equal(0, c.Ap);
            Assert.True(c.ResetAp(Stat.DEX, Stat.STR));
            Assert.False(c.ResetAp(Stat.INT, Stat.STR)); // 4 を割らない
        }

        [Fact]
        public void DeathPenalty()
        {
            var c = NewChar();
            c.Level = 9; c.Exp = 500;
            Assert.Equal(0, c.DeathExpLoss(false)); // 初心者は失わない
            c.Level = 15; c.Str = 35; c.Tier = 1; c.Line = JobLine.Warrior;
            c.Exp = 5000;
            Assert.Equal(630, c.DeathExpLoss(false)); // 6300 の 10%
            Assert.Equal(63, c.DeathExpLoss(true));   // 町では 1%
            Assert.Equal(0, c.ApplyDeath(false, true)); // お守り
            Assert.Equal(5000, c.Exp);
            c.Exp = 100;
            Assert.Equal(100, c.ApplyDeath(false, false)); // 0 より下がらない
            Assert.Equal(0, c.Exp);
            Assert.Equal(15, c.Level);
        }

        [Fact]
        public void LaterJobAdvancement()
        {
            var c = NewChar();
            c.Level = 10; c.Str = 35;
            c.AdvanceFirst(JobLine.Warrior, new Rng(1));
            Assert.Equal(AdvanceResult.LevelTooLow, c.AdvanceTier(0));
            c.Level = 30;
            int hp = c.BaseMaxHp;
            Assert.Equal(AdvanceResult.Ok, c.AdvanceTier(2));
            Assert.Equal("スピアマン", c.JobName);
            Assert.Equal(hp + 300, c.BaseMaxHp);
            Assert.Equal(1, c.Sp[2]);
        }
    }

    public class StatCalcTests
    {
        private static (CharacterState c, Inventory inv, Equipment eq, SkillBook book, BuffSet buffs) Setup()
        {
            var data = TestData.Get();
            var c = new CharacterState();
            var inv = new Inventory(data.Item);
            var eq = new Equipment(data.Item);
            return (c, inv, eq, new SkillBook(data), new BuffSet());
        }

        [Fact]
        public void BeginnerWithWoodenSword()
        {
            var data = TestData.Get();
            var (c, inv, eq, book, buffs) = Setup();
            c.Str = 12; c.Dex = 5; c.Int = 4; c.Luk = 4;
            inv.Add("eq.starter.9"); // 木の剣（片手剣）攻撃力 17
            Assert.Equal(EquipResult.Ok, eq.EquipFromInventory(inv, 0, c));
            var f = StatCalc.Compute(c, eq, book, buffs, inv, data);
            Assert.Equal("片手剣", f.WeaponType);
            Assert.Equal(17, f.Watk);
            var expect = Formulas.PhysRange("片手剣", 12, 5, 17, 0.1);
            Assert.Equal(expect.Min, f.Range.Min);
            Assert.Equal(expect.Max, f.Range.Max);
            Assert.Equal(StatCalc.BaseAcc(c.Level) + 5 * 0.8 + 4 * 0.5, f.Acc, 9);
            Assert.Equal(5 * 0.25 + 4 * 0.5, f.Avoid, 9);
            Assert.Equal(5, f.AttackStage);
            Assert.Equal(0.66, f.AttackDelay, 9);
            Assert.Equal(1, f.Wdef); // 装備の防御 0 + STR÷10
            Assert.Equal(2, f.Mdef); // INT÷2
        }

        [Fact]
        public void BareHandUsesStrAndLevelWatk()
        {
            var (c, inv, eq, book, buffs) = Setup();
            c.Level = 3;
            var f = StatCalc.Compute(c, eq, book, buffs, inv, TestData.Get());
            Assert.Equal("素手", f.WeaponType);
            Assert.Equal(11, f.Watk);
            Assert.Equal(4, f.AttackStage);
        }

        [Fact]
        public void BowmanPassivesOnlyWithBow()
        {
            var data = TestData.Get();
            var (c, inv, eq, book, buffs) = Setup();
            c.Level = 10; c.Dex = 40; c.Line = JobLine.Bowman; c.Tier = 1;
            book.Levels["bowman.archery_basics"] = 8;
            book.Levels["bowman.critical_shot"] = 5;
            inv.Add("eq.bowman.bow.10");
            inv.Add("use.arrow_bow", 1000);
            eq.EquipFromInventory(inv, 0, c);
            var f = StatCalc.Compute(c, eq, book, buffs, inv, data);
            var bow = data.Item("eq.bowman.bow.10");
            Assert.Equal(bow.Stats.Watk + 2, f.Watk); // ⌈8/4⌉ = 2、矢 +0
            Assert.Equal(StatCalc.BaseAcc(c.Level) + 40 * 0.8 + 4 * 0.5 + 8, f.Acc, 9);
            Assert.Equal(0.07, f.CritRate, 9); // 2+5 %
            Assert.Equal(2.0, f.CritDamage, 9);
            Assert.Equal("use.arrow_bow", f.AmmoItem);
            // 弓を外すと弓の分は消える（命中の分は残る）
            eq.Unequip(EquipSlot.Weapon, inv);
            var g = StatCalc.Compute(c, eq, book, buffs, inv, data);
            Assert.Equal(StatCalc.BareHandWatk(10), g.Watk);
            Assert.Equal(0, g.CritRate);
            Assert.Equal(StatCalc.BaseAcc(c.Level) + 40 * 0.8 + 4 * 0.5 + 8, g.Acc, 9);
        }

        [Fact]
        public void ThrowingStarsAddToClawAttack()
        {
            var data = TestData.Get();
            var (c, inv, eq, book, buffs) = Setup();
            c.Level = 10; c.Luk = 40; c.Dex = 25; c.Line = JobLine.Thief; c.Tier = 1;
            inv.Add("eq.thief.claw.10");
            eq.EquipFromInventory(inv, 0, c);
            var f0 = StatCalc.Compute(c, eq, book, buffs, inv, data);
            Assert.Null(f0.AmmoItem);
            inv.Add("use.star_iron", 500);
            var f = StatCalc.Compute(c, eq, book, buffs, inv, data);
            Assert.Equal(f0.Watk + 15, f.Watk);
            Assert.Equal(4, f.AttackStage);
        }

        [Fact]
        public void BoosterTwoStagesFasterMin2()
        {
            var data = TestData.Get();
            var (c, inv, eq, book, buffs) = Setup();
            c.Level = 30; c.Str = 100; c.Line = JobLine.Warrior; c.Tier = 2;
            inv.Add("eq.warrior.sword1.30");
            eq.EquipFromInventory(inv, 0, c);
            Assert.Equal(5, StatCalc.Compute(c, eq, book, buffs, inv, data).AttackStage);
            buffs.Apply(new ActiveBuff { Id = "fighter.sword_booster", Booster = 2, BoosterWeapons = new System.Collections.Generic.List<string> { "片手剣", "両手剣" }, Remaining = 100, Total = 100 });
            var f = StatCalc.Compute(c, eq, book, buffs, inv, data);
            Assert.Equal(3, f.AttackStage);
            Assert.Equal(0.54, f.AttackDelay, 9);
        }

        [Fact]
        public void SpeedAndJumpCaps()
        {
            var (c, inv, eq, book, buffs) = Setup();
            buffs.Apply(new ActiveBuff { Id = "a", Stats = new StatBlock { Speed = 60, Jump = 60 }, Remaining = 10 });
            var f = StatCalc.Compute(c, eq, book, buffs, inv, TestData.Get());
            Assert.Equal(140, f.Speed);
            Assert.Equal(123, f.Jump);
        }
    }
}
