// セーブ（いちばん大事）: 書き込みの途中で落ちても壊れない・バックアップ 3 つ・壊れていたら 1 つ前へ・版の移行・自動セーブ。
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Save;
using Lumina.Core.Util;
using Xunit;

namespace Lumina.Core.Tests
{
    public class SaveTests
    {
        private static SaveData Sample(long meso, double playSec = 10)
        {
            var s = GameSession.NewGame(TestData.Get(), "セーブ", 99);
            s.Inventory.Meso = meso;
            s.PlaySec = playSec;
            return s.ToSaveData("test");
        }

        // ---------------- 形

        [Fact]
        public void FileIsPlainJsonReadableBySystemTextJson()
        {
            var fs = new MemoryFileSystem();
            var store = new SaveStore(fs, "saves");
            Assert.True(store.Save("char1", Sample(123)).Ok);
            string text = fs.Text(store.MainPath("char1"));
            // 自前の読み手でも .NET の System.Text.Json でも読める（Unity の JsonUtility と同じふつうの JSON）
            var mine = Json.ParseObject(text);
            Assert.Equal("lumina-save", J.Str(mine, "format"));
            using var doc = System.Text.Json.JsonDocument.Parse(text);
            Assert.Equal(2, doc.RootElement.GetProperty("data").GetProperty("version").GetInt32());
            Assert.Equal(123, doc.RootElement.GetProperty("data").GetProperty("inventory").GetProperty("meso").GetInt64());
        }

        [Fact]
        public void RoundTripRestoresEverything()
        {
            var h = Harness.NewGame(5);
            var s = h.S;
            s.AcceptQuest("S-01");
            h.TakePortal("to_S001");
            s.Talk("ganzo");
            s.CompleteQuest("S-01");
            s.AcceptQuest("S-02");
            h.HuntKills("M001", 2);
            s.Character.Ap = 3; s.SpendAp(Stat.DEX);
            s.Character.Sp[0] = 1; s.LearnSkill("beginner.pebble");
            s.SetQuickSlot(3, "skill", "beginner.pebble");
            s.Inventory.Add("scroll.W01.100");
            s.ApplyScrollToEquipped("scroll.W01.100", EquipSlot.Weapon);
            s.Flags["test"] = true;
            var fs = new MemoryFileSystem();
            var store = new SaveStore(fs, "");
            s.AttachSave(store, "char1");
            Assert.True(s.SaveNow("manual").Ok);

            var g = GameSession.Load(TestData.Get(), store, "char1", out var lr);
            Assert.True(lr.Ok);
            Assert.Equal("main", lr.Source);
            Assert.False(lr.Recovered);
            Assert.Equal(s.Character.Level, g.Character.Level);
            Assert.Equal(s.Character.Exp, g.Character.Exp);
            Assert.Equal(s.Character.Dex, g.Character.Dex);
            Assert.Equal(s.Character.Ap, g.Character.Ap);
            Assert.Equal(s.Character.Hp, g.Character.Hp);
            Assert.Equal(s.Inventory.Meso, g.Inventory.Meso);
            Assert.Equal(s.Inventory.All().Select(x => x.item.ItemId + "@" + x.tab + x.slot + "x" + x.item.Count), g.Inventory.All().Select(x => x.item.ItemId + "@" + x.tab + x.slot + "x" + x.item.Count));
            var w1 = s.Equipment.Get(EquipSlot.Weapon); var w2 = g.Equipment.Get(EquipSlot.Weapon);
            Assert.Equal(w1.Stats.Watk, w2.Stats.Watk);
            Assert.Equal(1, w2.Upgraded);
            Assert.Equal(6, w2.UpgradesLeft);
            Assert.Equal(1, g.Skills.Level("beginner.pebble"));
            Assert.Equal("beginner.pebble", g.QuickSlots[3].Id);
            Assert.Equal(QuestStatus.Completed, g.Quests.Status("S-01"));
            Assert.Equal(QuestStatus.InProgress, g.Quests.Status("S-02"));
            Assert.Equal("S001", g.Map.Data.Id);
            Assert.Equal(s.Body.X, g.Body.X, 6);
            Assert.True(g.Flags["test"]);
            Assert.Equal(s.Stats.Range.Max, g.Stats.Range.Max);
            // 乱数の続きも同じ（読み込んだ後のダメージが同じになる）
            Assert.Equal(s.Rng.NextDouble(), g.Rng.NextDouble());
        }

        // ---------------- 書き込みの途中で落ちる

        [Fact]
        public void CrashAtEveryStepNeverLosesTheSave()
        {
            int sawOld = 0, sawNew = 0;
            foreach (double torn in new[] { 0.0, 0.1, 0.5, 0.99 })
            {
                for (int crashAt = 0; crashAt < 40; crashAt++)
                {
                    var mem = new MemoryFileSystem();
                    var good = new SaveStore(mem, "s");
                    // 前の版をいくつか保存しておく（バックアップもできる）
                    for (int i = 1; i <= 3; i++) Assert.True(good.Save("c", Sample(i * 100)).Ok);
                    var crashing = new CrashingFileSystem(mem, crashAt) { TornFraction = torn };
                    var store = new SaveStore(crashing, "s");
                    bool crashed = false;
                    try { store.Save("c", Sample(999)); }
                    catch (SimulatedCrashException) { crashed = true; }
                    // 「次に起動した時」: ふつうの読み込み
                    var lr = new SaveStore(mem, "s").Load("c");
                    Assert.True(lr.Ok, $"crashAt={crashAt} torn={torn}: 読めない {lr}");
                    Assert.True(lr.Data.Meso == 300 || lr.Data.Meso == 999, $"crashAt={crashAt}: 前の版でも新しい版でもない {lr.Data.Meso}（{lr.Source}）");
                    if (lr.Data.Meso == 300) sawOld++; else sawNew++;
                    if (!crashed) { Assert.Equal(999, lr.Data.Meso); break; } // 最後まで書けた
                    // 落ちた後にもう一度保存すれば、ちゃんと新しい版になる
                    Assert.True(new SaveStore(mem, "s").Save("c", Sample(1000)).Ok);
                    Assert.Equal(1000, new SaveStore(mem, "s").Load("c").Data.Meso);
                }
            }
            Assert.True(sawOld > 0 && sawNew > 0);
        }

        [Fact]
        public void CrashDuringFirstEverSaveLeavesNoGarbage()
        {
            for (int crashAt = 0; crashAt < 5; crashAt++)
            {
                var mem = new MemoryFileSystem();
                var store = new SaveStore(new CrashingFileSystem(mem, crashAt), "s");
                try { store.Save("c", Sample(1)); } catch (SimulatedCrashException) { }
                var lr = new SaveStore(mem, "s").Load("c");
                // 初めてのセーブの途中で落ちた: 読めない（＝新しいゲーム）か、書き終わった新しい版
                Assert.True(!lr.Ok || lr.Data.Meso == 1);
            }
        }

        [Fact]
        public void CrashInsideGameSessionAutoSave()
        {
            var mem = new MemoryFileSystem();
            var s = GameSession.NewGame(TestData.Get(), "落ちる", 3);
            s.AttachSave(new SaveStore(mem, "s"), "c");
            s.Inventory.Meso = 111;
            Assert.True(s.SaveNow().Ok);
            // マップを移った後の自動セーブの途中で落ちる
            s.AttachSave(new SaveStore(new CrashingFileSystem(mem, 0) { TornFraction = 0.3 }, "s"), "c");
            s.Inventory.Meso = 222;
            s.ChangeMap("S001");
            Assert.Throws<SimulatedCrashException>(() => s.Step(new PlayerInput(), 120));
            var g = GameSession.Load(TestData.Get(), new SaveStore(mem, "s"), "c", out var lr);
            Assert.NotNull(g);
            Assert.Equal(111, g.Inventory.Meso);
            Assert.Equal("S000", g.Map.Data.Id);
        }

        // ---------------- 壊れたファイル（本物のディスク）

        [Fact]
        public void BackupsRotateAndCorruptionFallsBack()
        {
            var dir = TestPaths.NewTempDir("save");
            try
            {
                var store = new SaveStore(new DiskFileSystem(), dir);
                for (int i = 1; i <= 6; i++) Assert.True(store.Save("char1", Sample(i)).Ok);
                Assert.True(File.Exists(store.MainPath("char1")));
                for (int i = 1; i <= 3; i++) Assert.True(File.Exists(store.BakPath("char1", i)));
                Assert.False(File.Exists(store.BakPath("char1", 4)));
                Assert.False(File.Exists(store.TmpPath("char1")));
                Assert.Equal(6, store.Load("char1").Data.Meso);
                // 途中で切れた（半分だけ）
                var main = File.ReadAllBytes(store.MainPath("char1"));
                File.WriteAllBytes(store.MainPath("char1"), main.Take(main.Length / 2).ToArray());
                var lr = store.Load("char1");
                Assert.True(lr.Ok && lr.Recovered);
                Assert.Equal("bak1", lr.Source);
                Assert.Equal(5, lr.Data.Meso);
                Assert.Contains(lr.Problems, p => p.StartsWith("main"));
                // 1 文字だけ化けた（長さは同じ）→ CRC で見つける
                var b1 = File.ReadAllBytes(store.BakPath("char1", 1));
                int k = Encoding.UTF8.GetString(b1).IndexOf("\"meso\":5", StringComparison.Ordinal);
                b1[k + 7] = (byte)'7';
                File.WriteAllBytes(store.BakPath("char1", 1), b1);
                lr = store.Load("char1");
                Assert.Equal("bak2", lr.Source);
                Assert.Equal(4, lr.Data.Meso);
                Assert.Contains(lr.Problems, p => p.Contains("CRC"));
                // 今のセーブが消えていても
                File.Delete(store.MainPath("char1"));
                Assert.Equal(4, store.Load("char1").Data.Meso);
                // 全部壊れていたら、落ちずに「読めない」と返す
                foreach (var p in new[] { store.BakPath("char1", 1), store.BakPath("char1", 2), store.BakPath("char1", 3) }) File.WriteAllText(p, "{\"format\":\"lumina-save\",\"seq\":1,\"len");
                lr = store.Load("char1");
                Assert.False(lr.Ok);
                Assert.True(lr.Problems.Count >= 3);
                Assert.Null(GameSession.Load(TestData.Get(), store, "char1", out _));
                // 壊れた状態から保存し直せる
                Assert.True(store.Save("char1", Sample(42)).Ok);
                Assert.Equal(42, store.Load("char1").Data.Meso);
            }
            finally { Directory.Delete(dir, true); }
        }

        [Fact]
        public void NewerTmpWinsOverOlderMain()
        {
            var mem = new MemoryFileSystem();
            var store = new SaveStore(mem, "");
            store.Save("c", Sample(1));
            // .tmp を書き終えて入れ替える直前に落ちた状態を作る
            // 操作: 0 = .tmp を書く、1 = 今のセーブを bak1 へコピー、2 = .tmp で置き換え（ここで落ちる）
            var crashing = new SaveStore(new CrashingFileSystem(mem, 2), "");
            try { crashing.Save("c", Sample(2)); } catch (SimulatedCrashException) { }
            Assert.True(mem.Exists("c.json.tmp"));
            var lr = store.Load("c");
            Assert.Equal(2, lr.Data.Meso);
            Assert.Equal("tmp", lr.Source);
        }

        [Fact]
        public void WriteFailureIsReportedNotThrown()
        {
            var store = new SaveStore(new DiskFileSystem(), "/proc/forbidden-dir-" + Guid.NewGuid().ToString("N"));
            var r = store.Save("x", Sample(1));
            Assert.False(r.Ok);
            Assert.False(string.IsNullOrEmpty(r.Error));
        }

        // ---------------- 版の移行

        private const string V1 = "{\"version\":1,\"name\":\"むかしの人\",\"job\":\"warrior\",\"level\":15,\"exp\":1234,\"str\":60,\"dex\":20,\"int\":4,\"luk\":4,\"ap\":2,\"sp\":7,"
            + "\"hp\":300,\"mp\":40,\"maxHp\":420,\"maxMp\":60,\"meso\":5555,\"map\":\"S003\",\"x\":1200,\"y\":640,"
            + "\"items\":[{\"id\":\"use.red_potion\",\"count\":30},{\"id\":\"eq.warrior.sword1.15\",\"count\":1},{\"id\":\"etc.M001\",\"count\":12},{\"id\":\"no.such.item\",\"count\":1}],"
            + "\"skills\":{\"warrior.power_strike\":10},\"quests\":{\"S-01\":\"done\",\"S-02\":\"active\"}}";

        [Fact]
        public void MigratesVersion1Saves()
        {
            var sd = SaveSerializer.FromJson(V1);
            Assert.Equal(SaveMigrations.CurrentVersion, sd.Version);
            Assert.Equal("warrior", sd.Line);
            Assert.Equal(1, sd.Tier);
            Assert.Equal(7, sd.Sp[1]);
            Assert.Equal(420, sd.BaseMaxHp);
            Assert.Equal(5555, sd.Meso);
            Assert.Equal(4, sd.Items.Count);
            var g = GameSession.FromSave(TestData.Get(), sd);
            Assert.Equal(15, g.Character.Level);
            Assert.Equal(30, g.Inventory.Count("use.red_potion"));
            Assert.Equal(1, g.Inventory.Count("eq.warrior.sword1.15"));
            Assert.Equal(10, g.Skills.Level("warrior.power_strike"));
            Assert.Equal(QuestStatus.Completed, g.Quests.Status("S-01"));
            Assert.Equal(QuestStatus.InProgress, g.Quests.Status("S-02"));
            Assert.Equal("S003", g.Map.Data.Id);
            Assert.Contains(g.Out.Events, e => e.Type == GameEventType.Message && e.Text.Contains("no.such.item"));
            // 移した後に保存すると今の版で書かれる
            var mem = new MemoryFileSystem();
            g.AttachSave(new SaveStore(mem, ""), "c");
            g.SaveNow();
            Assert.Contains("\"version\":2", mem.Text("c.json"));
        }

        [Fact]
        public void TooNewVersionIsRejectedAndBackupUsed()
        {
            var mem = new MemoryFileSystem();
            var store = new SaveStore(mem, "");
            store.Save("c", Sample(7));
            store.Save("c", Sample(8));
            // 今のセーブを「未来の版」に書き換える（CRC は合わせる）
            var body = SaveSerializer.ToJson(Sample(9)).Replace("\"version\":2", "\"version\":99");
            mem.WriteAllDurable("c.json", Encoding.UTF8.GetBytes(SaveStore.Wrap(body, 50)));
            var lr = store.Load("c");
            Assert.Equal(7, lr.Data.Meso);
            Assert.Equal("bak1", lr.Source);
            Assert.Contains(lr.Problems, p => p.Contains("新しい版"));
        }

        // ---------------- 自動セーブ

        [Fact]
        public void AutoSaveOnMapChangeLevelUpQuestAndTimer()
        {
            var mem = new MemoryFileSystem();
            var store = new SaveStore(mem, "");
            var s = GameSession.NewGame(TestData.Get(), "自動", 4);
            s.AttachSave(store, "c");
            var Saved = new List<string>();
            int Saves() => Saved.Count;
            void Run(int frames) { for (int i = 0; i < frames; i++) { s.Out.Clear(); s.Step(new PlayerInput()); Saved.AddRange(s.Out.Events.Where(e => e.Type == GameEventType.Saved).Select(e => e.Id)); } }

            Run(60);
            Assert.Equal(0, Saves());
            s.ChangeMap("S001");                  // マップ移動
            Run(61);
            Assert.Equal(new[] { "map" }, Saved);
            s.GainExp(s.Character.ExpToNext);       // レベルアップ
            Run(61);
            Assert.Equal("levelup", Saved.Last());
            s.Quests.MarkCompleted("S-01", 0);
            s.AcceptQuest("S-02");
            s.Quests.Progress(ObjectiveType.Interact, "S001.crate");
            s.CompleteQuest("S-02");               // クエスト完了
            Run(61);
            Assert.Equal("quest", Saved.Last());
            int before = Saves();
            Run(60 * 180 + 5);                      // 3 分ごと
            Assert.Equal(before + 1, Saves());
            Assert.Equal("timer", Saved.Last());
            Assert.Equal("S001", store.Load("c").Data.Map);
        }

        [Fact]
        public void SavingWhileDeadPutsYouInTown()
        {
            var mem = new MemoryFileSystem();
            var s = GameSession.NewGame(TestData.Get(), "倒れ", 4);
            s.AttachSave(new SaveStore(mem, ""), "c");
            s.ChangeMap("S004");
            s.Character.Hp = 1;
            s.Stats.Avoid = 0;
            s.Character.Dex = 0; s.Character.Luk = 0;
            s.TakeHit(100, 1, 999, false, s.Body.X + 5);
            Assert.True(s.Dead);
            s.SaveNow("dead");
            var g = GameSession.Load(TestData.Get(), new SaveStore(mem, ""), "c", out _);
            Assert.False(g.Dead);
            Assert.Equal("S003", g.Map.Data.Id);
            Assert.True(g.Character.Hp > 0);
            // 起き上がる: 初心者は経験値を失わない
            long exp = s.Character.Exp;
            Assert.Equal(0, s.Revive());
            Assert.Equal(exp, s.Character.Exp);
            Assert.Equal("S003", s.Map.Data.Id);
            Assert.Equal(s.Stats.MaxHp / 2, s.Character.Hp);
        }

        [Fact]
        public void DeathPenaltyWithCharm()
        {
            var s = GameSession.NewGame(TestData.Get(), "倒れ", 4);
            s.Character.Level = 20; s.Character.Str = 40; s.Character.Line = "warrior"; s.Character.Tier = 1;
            s.Character.Exp = 10000;
            s.ChangeMap("S004");
            s.Inventory.Add("use.safety_charm");
            s.Character.Hp = 0; s.Stats.Avoid = 0; s.Character.Hp = 1; s.Character.Dex = 0; s.Character.Luk = 0;
            s.TakeHit(1000, 1, 999, false, s.Body.X);
            Assert.Equal(0, s.Revive());
            Assert.Equal(0, s.Inventory.Count("use.safety_charm"));
            s.ChangeMap("S004");
            s.Character.Hp = 1; s.RefreshStats(); s.Stats.Avoid = 0;
            s.Body.InvT = 0;
            s.TakeHit(1000, 1, 999, false, s.Body.X);
            Assert.Equal(1650, s.Revive()); // 16,500 の 10%
            Assert.Equal(10000 - 1650, s.Character.Exp);
        }
    }
}
