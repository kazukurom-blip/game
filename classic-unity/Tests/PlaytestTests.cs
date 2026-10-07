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
using Lumina.Core.Combat;
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

    /// <summary>通しの検証の後の調整（PLAYTEST.md 8 章: 強さ担当）。</summary>
    public class PlaytestBalanceTests
    {
        private static readonly DateTime Day1 = new DateTime(2026, 10, 7, 12, 0, 0, DateTimeKind.Utc);

        private static GameSession At(string map, int level, ulong seed = 5)
        {
            var s = GameSession.NewGame(TestData.Get(), "調整", seed);
            s.Clock = () => Day1;
            s.Character.Level = level;
            s.Character.Str = 40; s.Character.Dex = 40; s.Character.Int = 40; s.Character.Luk = 40;
            foreach (var q in TestData.Get().QuestList.Where(q => q.Tutorial)) s.Quests.MarkCompleted(q.Id, 0);
            s.ChangeMap(map);
            s.RefreshStats();
            return s;
        }

        [Theory]
        [InlineData("thief", "use.star_iron")]
        [InlineData("pirate", "use.bullet_lead")]
        [InlineData("bowman", "use.arrow_bow")]
        public void NoAmmoMeansAWeakWhackNotAStuckCharacter(string line, string ammo)
        {
            // 投げ星・弾が尽きた盗賊・海賊も、弓と同じく弱く殴れる（クラシックどおり）。攻撃できずに詰まない
            var s = At("V100", 10);
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob(line));
            if (line == "pirate") s.EquipItem("eq.pirate.gun.10"); else s.EquipItem(s.Inventory.All().First(t => TestData.Get().Item(t.item.ItemId)?.Slot == EquipSlot.Weapon && TestData.Get().Item(t.item.ItemId).WeaponType != "片手剣").item.ItemId);
            s.Inventory.Remove(ammo, s.Inventory.Count(ammo));
            s.RefreshStats();
            Assert.True(s.Stats.NeedsAmmo);
            Assert.Null(s.Stats.AmmoItem);
            Assert.True(s.StartBasicAttack());
            Assert.True(s.Attack.Whack);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.Message && e.Text != null && e.Text.Contains("弱く殴る"));
        }

        [Fact]
        public void HomewardRideTakesWhatYouHave()
        {
            // 乗り物でしか出入りできない地域（雲の上など）でお金が尽きても、帰りの便は有り金で乗せてくれる
            var s = At("C101", 30);
            s.Inventory.AddMeso(300 - s.Inventory.Meso);
            Assert.False(s.Travel("sora"));              // ティンクル行き（帰りの便ではない）は 1,000 要る
            Assert.Equal("C101", s.Map.Data.Id);
            Assert.True(s.Travel("luna"));               // 大陸（森都の駅）へ戻る便
            Assert.Equal("V310", s.Map.Data.Id);
            Assert.Equal(0, s.Inventory.Meso);
            // お金があれば運賃どおり
            var t = At("T101", 30);
            t.Inventory.AddMeso(5000 - t.Inventory.Meso);
            Assert.True(t.Travel("kippu"));
            Assert.Equal(4000, t.Inventory.Meso);
        }

        [Fact]
        public void FirstJobOnlyFromThatLinesInstructor()
        {
            // 盗賊の転職官ヤミの前では盗賊にしかなれない（AdvanceJob が転職官の系統を確かめる）
            var s = At("V500", 10);
            Assert.Equal("yami", s.InstructorOf("thief"));
            Assert.Equal(AdvanceResult.WrongNpc, s.AdvanceJob("warrior"));
            Assert.Equal(AdvanceResult.WrongNpc, s.AdvanceJob("warrior", "yami"));
            Assert.Equal(AdvanceResult.WrongNpc, s.AdvanceJob("thief", "dorga")); // ドルガはここにいない
            Assert.Equal(0, s.Character.Tier);
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob("thief", "yami"));
            Assert.Equal("thief", s.Character.Line);
        }

        [Theory]
        [InlineData("thief", "eq.thief.claw.10", 25, 4)]
        [InlineData("bowman", "eq.bowman.bow.10", 25, 4)]
        [InlineData("pirate", "eq.pirate.knuckle.10", 20, 4)]
        [InlineData("magician", "eq.magician.wand.8", 4, 20)]
        public void FirstJobWeaponNeedsOnlyTheAdvanceStat(string line, string weapon, int dex, int intel)
        {
            // 1 次でもらう武器は、転職の条件と同じ能力値で持てる（盗賊 DEX25 で LUK が低くてもクローを持てる）
            var s = At("V100", line == "magician" ? 8 : 10);
            s.Character.Str = 4; s.Character.Dex = dex; s.Character.Int = intel; s.Character.Luk = 4;
            s.RefreshStats();
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob(line));
            Assert.Equal(EquipResult.Ok, s.EquipItem(weapon));
        }

        [Fact]
        public void RepeatQuestsAreDailyFromTheBoard()
        {
            // 募集の掲示板（QUESTS.md 5 章）: 毎日、自分の Lv に合う 3 本。同じ物は 1 日 1 回。報酬は券（売ると 5,000 ルド）
            var s = At("V090", 32);
            var today = s.BoardToday();
            Assert.Equal(3, today.Count);
            foreach (var id in today) Assert.True(TestData.Get().Quest(id).MinLevel <= 32);
            var off = TestData.Get().QuestList.First(q => q.Board && q.MinLevel <= 32 && !today.Contains(q.Id));
            Assert.Equal(StartResult.NotToday, s.Quests.CanStart(off.Id, s.Character));
            var q0 = TestData.Get().Quest(today[0]);
            Assert.Equal(StartResult.Ok, s.AcceptQuest(q0.Id));
            s.Quests.Progress(ObjectiveType.Kill, q0.Objectives[0].Target, q0.Objectives[0].Count);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest(q0.Id));
            string coupon = q0.MinLevel <= 75 ? "use.exp_coupon" : "use.drop_coupon";
            Assert.Equal(1, s.Inventory.Count(coupon));
            Assert.Equal(StartResult.AlreadyCompleted, s.Quests.CanStart(q0.Id, s.Character)); // 今日はもう受けられない
            // 次の日は、掲示板に出ていればまた受けられる
            for (int d = 1; d < 30; d++)
            {
                var day = Day1.AddDays(d);
                s.Clock = () => day;
                if (!s.BoardToday().Contains(q0.Id)) { Assert.Equal(StartResult.NotToday, s.Quests.CanStart(q0.Id, s.Character)); continue; }
                Assert.Equal(StartResult.Ok, s.Quests.CanStart(q0.Id, s.Character));
                break;
            }
            // 券: 使うと 30 分 経験値 2 倍。売ると 5,000 ルド
            Assert.True(s.UseItem(coupon));
            if (coupon == "use.exp_coupon") Assert.Equal(100, s.Stats.Mods.ExpPct, 9); else Assert.Equal(100, s.Stats.Mods.DropPct, 9);
            Assert.Equal(5000, TestData.Get().Item("use.exp_coupon").SellPrice);
        }

        [Fact]
        public void WeeklyBossRequestOncePerWeek()
        {
            var s = At("V090", 40);
            Assert.Equal(StartResult.Ok, s.AcceptQuest("R-21"));
            s.Quests.MarkCompleted("R-21", 0);
            s.Daily.Use("quest.R-21", Day1, weekly: true);
            Assert.Equal(StartResult.AlreadyCompleted, s.Quests.CanStart("R-21", s.Character));
            var next = Day1.AddDays(7);
            s.Clock = () => next;
            Assert.Equal(StartResult.Ok, s.Quests.CanStart("R-21", s.Character));
        }

        [Fact]
        public void JobTestMonstersAreSoloable()
        {
            var d = TestData.Get();
            // 2 次の試しの魔物: ふつうの Lv25 の半分の HP、珠は 80%
            Assert.Equal(0.8, d.Mob("M301").Drops.First(x => x.Item == "etc.M301").Chance, 9);
            Assert.True(d.Mob("M301").Hp < 700);
            // 4 次の紅翼の主・蒼翼の主: HP ×0.5・攻撃 ×0.7、30 分ごとに出る
            foreach (var id in new[] { "M211", "M212" }) { Assert.Equal(403000, d.Mob(id).Hp); Assert.True(d.Mob(id).Atk < 700); }
            Assert.Contains(d.GetMap("D105").TimedSpawns, t => t.Mob == "M211" && t.IntervalSec == 1800);
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
