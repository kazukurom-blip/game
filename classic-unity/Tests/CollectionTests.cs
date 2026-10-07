// やりこみ要素のテスト: 敵の図鑑（カード）・勲章・記録・ジャンプの試練（本物の物理で登れる・難しすぎない）・全体マップの印・セーブの版 4。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Collection;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Lumina.Core.Save;
using Lumina.Core.World;
using Xunit;
using Xunit.Abstractions;

namespace Lumina.Core.Tests
{
    public class CollectionTests
    {
        private readonly ITestOutputHelper output;
        public CollectionTests(ITestOutputHelper output) { this.output = output; }

        private static readonly string[] Courses = { "J001", "J002", "J003", "J004", "J005" };

        // ---------------- ジャンプの試練

        [Fact]
        public void JumpCoursesAreClimbableWithRealPhysics()
        {
            var d = TestData.Get();
            foreach (var id in Courses)
            {
                var md = d.GetMap(id);
                Assert.NotNull(md);
                Assert.NotNull(md.Jump);
                Assert.Empty(md.Spawns); Assert.Empty(md.TimedSpawns); // 敵はいない
                var r = new MapReach(md);
                var start = r.NodeAtPortal(md.Portals.First(p => p.Type == PortalType.Spawn));
                var chest = md.Objects.Single(o => o.Id == md.Jump.ChestId);
                var goalSeg = r.Map.SegBelow(chest.X, chest.Y - 2);
                var goal = r.NodeOf(goalSeg, chest.X);
                var path = r.Path(start, goal);
                Assert.True(path != null, id + ": 地面から宝箱の足場へ行けない");
                // 1 つの体で、本物の物理の入力で順に登る
                var body = r.StandAt(start, md.Portals.First(p => p.Type == PortalType.Spawn).X);
                string cur = start;
                foreach (var e in path)
                {
                    var got = r.Perform(body, e);
                    Assert.True(got == e.To, $"{id}: {e} で {got ?? "落ちた"}");
                    cur = got;
                }
                Assert.Equal(goal, cur);
                // 近道は無い: 動きの数は足場の数（てっぺんまでの足場）に近い
                int platforms = md.Footholds.Count - 1;
                output.WriteLine($"{id} {md.Name}: 段 {md.Jump.Stages}・足場 {platforms}・縄 {md.Ropes.Count}・高さ {md.Height}・動き {path.Count}");
                Assert.True(path.Count >= platforms - 1, $"{id}: 動き {path.Count} が足場 {platforms} より少ない（近道がある）");
            }
        }

        /// <summary>どの跳び継ぎも、立つ位置の幅が 10 px 以上ある（人が狙える）。下の段ほど広い。縄は MapReach で確かめる。</summary>
        [Fact]
        public void EveryJumpHasAFairWindow()
        {
            var d = TestData.Get();
            foreach (var id in Courses)
            {
                var md = d.GetMap(id);
                var r = new MapReach(md);
                var chains = md.Footholds;
                double sumFirst = 0, sumLast = 0; int nFirst = 0, nLast = 0;
                for (int i = 0; i + 1 < chains.Count; i++)
                {
                    var a = chains[i]; var b = chains[i + 1];
                    double ya = a.Points[0][1], yb = b.Points[0][1];
                    if (ya - yb > 80) continue; // 縄でつないだ所
                    string na = a.Id + "#0", nb = b.Id + "#0";
                    var (lo, hi) = r.StandRange(na);
                    int ok = 0;
                    for (double x = Math.Ceiling(lo); x <= hi; x += 1)
                        if (r.Simulate(r.StandAt(na, x), MapReach.JumpInput, 240) == nb) ok++;
                    Assert.True(ok >= 10, $"{id}: {a.Id} → {b.Id} の跳べる幅が {ok} px");
                    int stage = int.TryParse(new string(b.Id.Skip(1).TakeWhile(char.IsDigit).ToArray()), out var sg) ? sg : 0;
                    if (stage == 1) { sumFirst += ok; nFirst++; }
                    if (stage == md.Jump.Stages) { sumLast += ok; nLast++; }
                }
                output.WriteLine($"{id}: 1 段目の平均の幅 {sumFirst / Math.Max(1, nFirst):0} px・最後の段 {sumLast / Math.Max(1, nLast):0} px");
                Assert.True(sumLast / Math.Max(1, nLast) < sumFirst / Math.Max(1, nFirst), id + ": 上の段ほど難しくなっていない");
            }
        }

        [Fact]
        public void JumpChestGivesRewardMedalAndDaily()
        {
            var h = Harness.NewGame();
            var s = h.S;
            var day = new DateTime(2026, 10, 7, 12, 0, 0, DateTimeKind.Utc);
            s.Clock = () => day;
            s.ChangeMap("V200");
            var npc = s.Map.Data.Npcs.Single(n => n.Id == "jq_mokuren");
            s.Teleport(npc.X, npc.Y);
            Assert.True(s.Travel("jq_mokuren"));
            Assert.Equal("J001", s.Map.Data.Id);
            Assert.Equal(1, s.JumpStage);
            h.Idle(60);
            var chest = s.Map.Data.Objects.Single();
            s.Teleport(chest.X, chest.Y);
            Assert.Equal(s.Map.Data.Jump.Stages + 1, s.JumpStage);
            long meso = s.Inventory.Meso;
            Assert.True(s.Interact(chest.Id));
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.JumpCleared && e.Id == "J001");
            Assert.Equal(meso + s.Map.Data.Jump.First.Meso, s.Inventory.Meso);
            Assert.True(s.HasMedal("jump.J001"));
            Assert.True(s.HasMedal("eq.medal.jump.J001"));
            Assert.True(s.Records.JumpBest["J001"] > 0);
            // 同じ日はもう無い・次の日は小さなごほうび
            meso = s.Inventory.Meso;
            s.Interact(chest.Id);
            Assert.Equal(meso, s.Inventory.Meso);
            day = day.AddDays(1);
            s.Interact(chest.Id);
            Assert.Equal(meso + s.Map.Data.Jump.Daily.Meso, s.Inventory.Meso);
            Assert.Equal(2, s.Records.JumpClears["J001"]);
            // 上の案内人で町へ戻る
            var top = s.Map.Data.Npcs.Single(n => n.Id == "jq_mokuren_J001_top");
            s.Teleport(top.X, top.Y);
            Assert.True(s.Travel(top.Id));
            Assert.Equal("V200", s.Map.Data.Id);
        }

        // ---------------- 図鑑

        [Fact]
        public void CardsGoToTheBookAndLevelItUp()
        {
            var h = Harness.NewGame();
            var s = h.S;
            Assert.True(s.BookIndex.Entries.Count >= 140, "図鑑の敵 " + s.BookIndex.Entries.Count);
            Assert.Contains(s.BookIndex.Entries, e => e.Mob == "M001" && e.Region == "S");
            Assert.Equal(0.012, MonsterBook.CardChance(s.Data.Mob("M001")));
            Assert.True(MonsterBook.CardChance(s.Data.Mobs.Values.First(m => m.Kind == "boss")) >= 0.3);
            int items = s.Inventory.All().Count();
            int hp0 = s.Stats.MaxHp;
            // 3 種を完成させると段 1（HP +30）
            foreach (var mob in new[] { "M001", "M002", "M003" })
            {
                for (int i = 0; i < 5; i++)
                {
                    s.Map.SpawnDrops(s.Body.X, s.Body.Y, new List<DropItem> { new DropItem { ItemId = MonsterBook.CardId(mob) } });
                    h.Idle(40);
                    h.Run(new PlayerInput { Pickup = true }, 2);
                }
                Assert.Equal(5, s.Book.Count(mob));
            }
            Assert.Equal(items, s.Inventory.All().Count()); // 持ち物には入らない
            Assert.Contains(h.Log, e => e.Type == GameEventType.CardPicked && e.Value == 5);
            Assert.Contains(h.Log, e => e.Type == GameEventType.BookLevelUp && e.Value == 1);
            Assert.Equal(1, s.Book.Level);
            Assert.Equal(hp0 + 30, s.Stats.MaxHp);
            // 6 枚目は増えない
            s.Map.SpawnDrops(s.Body.X, s.Body.Y, new List<DropItem> { new DropItem { ItemId = MonsterBook.CardId("M001") } });
            h.Idle(40); h.Run(new PlayerInput { Pickup = true }, 2);
            Assert.Equal(5, s.Book.Count("M001"));
            Assert.True(s.HasMedal("card1"));
        }

        [Fact]
        public void KillingCountsAndCardsDropWithoutChangingTheDropRandom()
        {
            // カードの乱数はふつうのドロップと別: 図鑑が完成していてもいなくても、ふつうのドロップは同じ
            var a = Harness.NewGame(7); var b = Harness.NewGame(7);
            foreach (var mob in new[] { "M001" }) for (int i = 0; i < 5; i++) b.S.Book.Add(mob);
            a.S.ChangeMap("S001"); b.S.ChangeMap("S001");
            Assert.True(a.KillOne("M001")); Assert.True(b.KillOne("M001"));
            var da = a.S.Map.Drops.Where(x => !MonsterBook.IsCard(x.ItemId)).Select(x => x.ItemId + x.Meso).ToList();
            var db = b.S.Map.Drops.Where(x => !MonsterBook.IsCard(x.ItemId)).Select(x => x.ItemId + x.Meso).ToList();
            Assert.Equal(da, db);
            Assert.Equal(1, a.S.Records.Kills);
            Assert.Equal(1, a.S.Records.KillsOf("M001"));
        }

        // ---------------- 勲章

        [Fact]
        public void MedalsAreEarnedAndOneCanBeWorn()
        {
            var h = Harness.NewGame();
            var s = h.S;
            // 勲章 = メダルの品（条件で手に入る物＋クエストのメダル）。条件はどれも品があり、品にはどれも条件がある
            var list = s.MedalList();
            Assert.True(list.Count(m => m.MedalAuto) >= 40, "条件の勲章 " + list.Count(m => m.MedalAuto));
            Assert.Contains(list, m => !m.MedalAuto); // クエストのメダルも並ぶ
            Assert.Equal(list.Count, list.Select(m => m.Name).Distinct().Count());
            foreach (var r in Medals.Rules.Values) Assert.True(s.Data.Item(r.ItemId)?.MedalAuto == true, r.ItemId + " の品が無い");
            foreach (var m in list.Where(m => m.MedalAuto)) Assert.NotNull(Medals.OfItem(m.Id));
            Assert.Equal(MedalResult.NotEarned, s.EquipMedal("eq.medal.lv10"));
            s.GainExp(100000); // Lv が 1 つずつ上がる
            for (int i = 0; i < 12; i++) { s.GainExp(s.Character.ExpToNext); }
            h.Idle(40);
            Assert.True(s.Character.Level >= 10);
            Assert.True(s.HasMedal("lv10"));
            Assert.Contains(h.Log, e => e.Type == GameEventType.MedalEarned && e.Id == "eq.medal.lv10");
            int items = s.Inventory.All().Count();
            int hp = s.Stats.MaxHp;
            Assert.Equal(MedalResult.Ok, s.EquipMedal("eq.medal.lv10"));
            Assert.Equal(hp + 50, s.Stats.MaxHp);
            Assert.Equal("eq.medal.lv10", s.Medal);
            // 付け替えても能力は重ならない（メダルの欄は 1 つ）・条件の勲章は持ち物に入らない
            Assert.True(s.HasMedal("lv30") == false);
            s.Inventory.Add("eq.medal.hunter1"); // クエストのメダル
            Assert.Equal(MedalResult.Ok, s.EquipMedal("eq.medal.hunter1"));
            Assert.Equal(hp, s.Stats.MaxHp);
            Assert.Equal(MedalResult.Ok, s.EquipMedal("eq.medal.lv10"));
            Assert.True(s.Inventory.Has("eq.medal.hunter1")); // クエストのメダルは持ち物へ戻る
            Assert.Equal(MedalResult.Ok, s.EquipMedal(null));
            Assert.Equal(hp, s.Stats.MaxHp);
            Assert.Equal(items + 1, s.Inventory.All().Count());
            Assert.Null(s.Medal);
            // 進みのヒント
            var q = Medals.Get("kill100").Progress(s);
            Assert.Equal(100, q.need);
        }

        // ---------------- 記録・全体マップ・セーブ

        [Fact]
        public void WorldMapDataAndMarks()
        {
            var h = Harness.NewGame();
            var s = h.S;
            var wm = s.Data.WorldMap;
            Assert.Equal(10, wm.Regions.Count);
            Assert.Equal(239, wm.Maps.Count);
            foreach (var n in wm.Maps.Values) { Assert.InRange(n.X, 0, 1000); Assert.InRange(n.Y, 0, 600); }
            Assert.Contains(wm.Links, l => (l.a == "S000" && l.b == "S001") || (l.a == "S001" && l.b == "S000"));
            Assert.Equal("V", wm.Node("J001").Region); // 試練は入口の町の地域
            Assert.Equal(8, wm.Hidden.Count);
            var marks = s.WorldMarks();
            Assert.True((marks["S000"] & GameSession.MarkHere) != 0);
            Assert.True((marks["S000"] & GameSession.MarkVisited) != 0);
            Assert.True(marks.Values.Any(v => (v & GameSession.MarkAvailable) != 0), "受けられるクエストの印が無い");
        }

        [Fact]
        public void CollectionSurvivesSaveAndOldSavesLoad()
        {
            var h = Harness.NewGame();
            var s = h.S;
            for (int i = 0; i < 3; i++) s.Book.Add("M002");
            s.Records.Deaths = 4; s.Records.MaxDamage = 1234; s.Records.BossBest["M007"] = 42.5;
 s.Flags["visit.V100"] = true; s.Records.JumpClears["J001"] = 2; s.Records.JumpBest["J001"] = 90;
            h.Idle(40); // 勲章の判定
            Assert.Equal(MedalResult.Ok, s.EquipMedal("eq.medal.card1"));
            var json = SaveSerializer.ToJson(s.ToSaveData("t"));
            Assert.Contains("\"version\":" + SaveMigrations.CurrentVersion, json); // 版 4 で入った（版 5 は楽しさの要素）
            var g = GameSession.FromSave(TestData.Get(), SaveSerializer.FromJson(json));
            Assert.Equal(3, g.Book.Count("M002"));
            Assert.Equal(4, g.Records.Deaths);
            Assert.Equal(1234, g.Records.MaxDamage);
            Assert.Equal(42.5, g.Records.BossBest["M007"]);
            Assert.True(g.Visited("V100"));
            Assert.Equal(2, g.Records.JumpClears["J001"]);
            Assert.Equal("eq.medal.card1", g.Medal);
            Assert.True(g.HasMedal("card1"));
            // 版 3 のセーブ（collection が無い）も読める
            var v3 = json.Replace("\"version\":" + SaveMigrations.CurrentVersion, "\"version\":3");
            int at = v3.IndexOf(",\"collection\":", StringComparison.Ordinal);
            v3 = v3.Substring(0, at) + "}";
            var old = GameSession.FromSave(TestData.Get(), SaveSerializer.FromJson(v3));
            Assert.Equal(0, old.Book.TotalCards);
            Assert.Empty(old.MedalsEarned);
            Assert.Equal(s.Character.Level, old.Character.Level);
        }

        [Fact]
        public void DeathAndMesoAreRecorded()
        {
            var h = Harness.NewGame();
            var s = h.S;
            s.ChangeMap("S001");
            s.Map.SpawnDrops(s.Body.X, s.Body.Y, new List<DropItem> { new DropItem { Meso = 77 } });
            h.Idle(40); h.Run(new PlayerInput { Pickup = true }, 2);
            Assert.Equal(77, s.Records.MesoPicked);
            s.Character.Hp = 1;
            s.Body.InvT = 0; s.HitPlayer(9999, 50, 999, true, s.Body.X + 10, null);
            Assert.True(s.Dead);
            Assert.Equal(1, s.Records.Deaths);
        }
    }
}
