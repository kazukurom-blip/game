// 通しで遊ぶボット（Tools/PlayBot・docs/PLAYTEST.md）で見つけた詰まりの直しと、ボットで遊ぶ長いテスト。
//
// 長いテスト（[LongFact]・Trait Category=Long）はふつうの dotnet test では飛ばす。動かす時:
//   LUMINA_LONG=1 dotnet test Tests/Lumina.Core.Tests.csproj --filter Category=Long
using System;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.PlayBot;
using Xunit;
using Xunit.Abstractions;

namespace Lumina.Core.Tests
{
    /// <summary>LUMINA_LONG=1 の時だけ動くテスト。</summary>
    public sealed class LongFactAttribute : FactAttribute
    {
        public LongFactAttribute()
        {
            if (Environment.GetEnvironmentVariable("LUMINA_LONG") != "1") Skip = "長いテスト（LUMINA_LONG=1 で動く）";
        }
    }

    public class PlaytestFixTests
    {
        private static GameSession Beginner(int level, ulong seed = 11)
        {
            var s = GameSession.NewGame(TestData.Get(), "通し", seed);
            s.Character.Level = level;
            s.Character.Str = 40; s.Character.Dex = 40; s.Character.Int = 40; s.Character.Luk = 40;
            s.RefreshStats();
            return s;
        }

        [Fact]
        public void FirstJobQuestsAreOnlyForBeginners()
        {
            // 転職した後に別の系統の J?-1 を受けると、job_advance.1 が二度と来ないので終わらないクエストが残る
            var s = Beginner(10);
            Assert.Equal(StartResult.Ok, s.Quests.CanStart("J3-1", s.Character));
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob(JobLine.Warrior));
            foreach (var id in new[] { "J1-1", "J2-1", "J3-1", "J4-1", "J5-1" })
                Assert.Equal(StartResult.WrongJob, s.Quests.CanStart(id, s.Character));
        }

        [Theory]
        [InlineData("warrior", "eq.warrior.sword1.10", "use.red_potion", 20)]
        [InlineData("magician", "eq.magician.wand.8", "use.blue_potion", 20)]
        [InlineData("bowman", "eq.bowman.bow.10", "use.arrow_bow", 2000)]
        [InlineData("thief", "eq.thief.claw.10", "use.star_iron", 2400)]
        [InlineData("pirate", "eq.pirate.knuckle.10", "use.bullet_lead", 800)]
        public void FirstJobGivesWeaponAndSupplies(string line, string weapon, string supply, int count)
        {
            // JOBS.md 3-1 の「もらえる物」。無いと盗賊（クロー＋投げ星 約 3,700 ルド）が Lv10 の所持金では攻撃できなくなっていた
            var s = Beginner(10);
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob(line));
            Assert.Equal(1, s.Inventory.Count(weapon));
            Assert.Equal(count, s.Inventory.Count(supply));
            Assert.Equal(28, s.Inventory.SlotCount(InvTab.Equip)); // 枠 +4 は 1 回だけ
            Assert.Equal(28, s.Inventory.SlotCount(InvTab.Use));
            if (line == "pirate") Assert.Equal(1, s.Inventory.Count("eq.pirate.gun.10"));
        }

        [Fact]
        public void DimensionDoorCanBeEnteredToAcceptTheTest()
        {
            // 修験の雪洞（F118）は「J?-6 を進めている間だけ入れる」が、J?-6 の依頼者が雪洞の中にいて受けられなかった。
            // J?-6 を受けられる間（J?-5 の後）も入れる。J?-5 の前・J?-6 の後は入れない
            var s = Beginner(70);
            s.AdvanceJob(JobLine.Bowman);
            Assert.Equal(RoomEntryResult.NeedQuest, s.CanEnterRoom("F118"));
            foreach (var id in new[] { "J3-1", "J3-2", "J3-3", "J3-4", "J3-5" }) s.Quests.MarkCompleted(id, 0);
            Assert.Equal(RoomEntryResult.Ok, s.CanEnterRoom("F118"));
            s.ChangeMap("F117");
            var door = s.Map.Data.Portals.First(p => p.To == "F118");
            Assert.True(s.UsePortal(door));
            Assert.Equal("F118", s.Map.Data.Id);
            Assert.Equal(StartResult.Ok, s.AcceptQuest("J3-6"));
            s.Quests.MarkCompleted("J3-6", 0);
            Assert.Equal(RoomEntryResult.NeedQuest, s.CanEnterRoom("F118"));
        }
    }

    /// <summary>ボットで遊ぶ（PLAYTEST.md）。</summary>
    public class PlayBotTests
    {
        private readonly ITestOutputHelper output;
        public PlayBotTests(ITestOutputHelper output) { this.output = output; }

        private Bot Run(Bot bot, double hours)
        {
            bot.MaxGameSec = bot.Sec + hours * 3600;
            bot.RunToEnd();
            output.WriteLine(bot.Summary());
            Assert.DoesNotContain(bot.Issues.Values, i => i.Kind == "exception");
            Assert.Equal(0, bot.SaveMismatches);
            return bot;
        }

        /// <summary>ふつうのテストでも回す短い物: 戦士が目覚めの浜から 10 分（ゲームの中）遊んで、最初のクエストを進める。</summary>
        [Fact]
        public void BotPlaysTheFirstTenMinutes()
        {
            var bot = new Bot(TestData.Get(), "warrior", 0, 7) { StopTier = 1 };
            Run(bot, 10.0 / 60);
            Assert.True(bot.S.Quests.IsCompleted("S-01"));
            Assert.True(bot.S.Quests.IsCompleted("S-03"));
            Assert.True(bot.Level >= 2);
        }

        [LongFact]
        [Trait("Category", "Long")]
        public void EveryLineReachesFirstJobFromLevel1()
        {
            foreach (var line in JobLine.FirstJobs)
            {
                var bot = new Bot(TestData.Fresh(), line, 0, 20261007) { StopTier = 1 };
                Run(bot, 12);
                Assert.True(bot.Tier >= 1, line + " が 1 次転職できない（" + bot.StopReason + "）");
                Assert.True(bot.S.Quests.IsCompleted("S-19"), line + " が島を出られない");
            }
        }

        [LongFact]
        [Trait("Category", "Long")]
        public void EveryLineAdvancesFromCheckpoints()
        {
            foreach (var line in JobLine.FirstJobs)
            {
                foreach (var (start, tier, hours) in new[] { (30, 2, 6.0), (70, 3, 8.0) })
                {
                    var bot = Bot.MakeCheckpoint(TestData.Fresh(), line, 0, start, 20261007);
                    bot.StopTier = tier;
                    Run(bot, hours);
                    Assert.True(bot.Tier >= tier, line + " が Lv" + start + " から " + tier + " 次転職できない（" + bot.StopReason + "）");
                }
            }
        }
    }
}
