// ワールド（WORLD.md の初心者の島のマップ全部）とクエストの決まり（QUESTS.md 1 章）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class WorldTests
    {
        private static readonly string[] Island = { "S000", "S001", "S002", "S003", "S004", "S005", "S006", "S007", "S008", "S009", "S010", "S011" };

        // maps.mjs のつながり（WORLD.md の表）
        private static readonly Dictionary<string, string[]> Links = new Dictionary<string, string[]>
        {
            { "S000", new[] { "S001" } }, { "S001", new[] { "S000", "S002" } }, { "S002", new[] { "S001", "S003" } },
            { "S003", new[] { "S002", "S004", "S006", "S010", "S011" } }, { "S004", new[] { "S003", "S005" } },
            { "S005", new[] { "S004", "S007", "S008" } }, { "S006", new[] { "S003", "S008" } }, { "S007", new[] { "S005" } },
            { "S008", new[] { "S005", "S006", "S009" } }, { "S009", new[] { "S008" } }, { "S010", new[] { "S003" } }, { "S011", new[] { "S003" } },
        };

        [Fact]
        public void AllIslandMapsWithCorrectConnections()
        {
            var d = TestData.Get();
            foreach (var id in Island)
            {
                var m = d.GetMap(id);
                Assert.NotNull(m);
                var to = m.Portals.Where(p => p.To != null).Select(p => p.To).OrderBy(x => x).ToArray();
                Assert.Equal(Links[id].OrderBy(x => x).ToArray(), to);
                foreach (var p in m.Portals.Where(p => p.To != null))
                {
                    var back = d.GetMap(p.To).FindPortalByName(p.ToPortal);
                    Assert.True(back != null, id + " → " + p.To + " の着く先 " + p.ToPortal + " が無い");
                    Assert.Equal(id, back.To); // 戻りのポータル
                }
                Assert.Equal("S003", m.ReturnMap);
            }
            Assert.True(d.GetMap("S003").IsTown);
        }

        [Fact]
        public void EverythingStandsOnFootholds()
        {
            var d = TestData.Get();
            foreach (var id in Island.Concat(new[] { "V100" }))
            {
                var m = d.GetMap(id);
                var pm = m.BuildPhysics();
                foreach (var p in m.Portals.Where(p => p.Type != PortalType.Hidden || true))
                {
                    var s = pm.SegBelow(p.X, p.Y - 2);
                    Assert.True(s != null && Math.Abs(s.YAt(p.X) - p.Y) < 0.5, id + " のポータル " + p.Name + " が足場の上に無い");
                }
                foreach (var n in m.Npcs) Assert.True(Math.Abs(pm.SegBelow(n.X, n.Y - 2).YAt(n.X) - n.Y) < 0.5, id + " の NPC " + n.Id);
                foreach (var sp in m.Spawns) Assert.True(Math.Abs(pm.SegBelow(sp.X, sp.Y - 2).YAt(sp.X) - sp.Y) < 0.5, id + " の湧く所 " + sp.Mob + " " + sp.X);
                foreach (var r in pm.Ropes)
                {
                    // 縄の上端は足場に着いている（上りきると立てる）
                    Assert.Contains(pm.Segs, s => r.X >= s.X1 && r.X <= s.X2 && Math.Abs(s.YAt(r.X) - r.Top) <= 8);
                    // 下端は下の足場から ↑ で届く
                    var below = pm.SegBelow(r.X, r.Bottom + 1);
                    Assert.True(below != null && below.YAt(r.X) - r.Bottom <= Feel.RopeBottomReach, id + " の縄 " + r.X);
                }
            }
        }

        [Fact]
        public void EveryIslandMapReachesTownByPortals()
        {
            var d = TestData.Get();
            foreach (var id in Island)
            {
                var seen = new HashSet<string> { id };
                var q = new Queue<string>(new[] { id });
                bool ok = false;
                while (q.Count > 0)
                {
                    var c = q.Dequeue();
                    if (d.GetMap(c).IsTown) { ok = true; break; }
                    foreach (var p in d.GetMap(c).Portals) if (p.To != null && seen.Add(p.To)) q.Enqueue(p.To);
                }
                Assert.True(ok, id + " から町へ戻れない");
            }
        }

        [Fact]
        public void IslandSpawnsMatchDesign()
        {
            var d = TestData.Get();
            Assert.Contains(d.GetMap("S001").Spawns, s => s.Mob == "M001");
            Assert.True(d.GetMap("S006").Ropes.Count == 3); // 「縄が 3 本」
            Assert.Contains(d.GetMap("S002").Ropes, r => r.Ladder); // はしごの丘
            Assert.Contains(d.GetMap("S009").TimedSpawns, t => t.Mob == "M007" && t.IntervalSec == 600); // 10 分ごと
            Assert.Contains(d.GetMap("S007").Portals, p => p.Type == PortalType.Hidden); // 隠しポータル
            Assert.Empty(d.GetMap("S003").Spawns); // 町に敵はいない
        }

        [Fact]
        public void WanderingEachIslandMapNeverFallsThrough()
        {
            var d = TestData.Get();
            foreach (var id in Island)
            {
                var m = d.GetMap(id);
                var pm = m.BuildPhysics();
                var sp = m.SpawnPoint();
                var p = new PlayerBody(sp.x, sp.y);
                PlayerPhysics.PlaceOnGround(p, pm, sp.x, sp.y);
                double groundMaxY = m.Footholds.Where(f => f.Ground).SelectMany(f => f.Points).Max(pt => pt[1]);
                var rng = new Util.Rng(5);
                for (int i = 0; i < 3600; i++)
                {
                    int t = i % 400;
                    var inp = new PhysicsInput { Right = t < 200, Left = t >= 200, Jump = rng.NextDouble() < 0.05, Up = rng.NextDouble() < 0.2, Down = rng.NextDouble() < 0.05 };
                    inp.JumpPressed = inp.Jump;
                    PlayerPhysics.Step(p, inp, pm, Feel.Dt);
                    Assert.True(p.Y <= groundMaxY + 0.5, id + " ですり抜けた y=" + p.Y);
                }
            }
        }

        [Fact]
        public void PortalUpKeyAndHiddenRoom()
        {
            var s = GameSession.NewGame(TestData.Get(), "旅", 1);
            s.ChangeMap("S007");
            var secret = s.Map.Data.FindPortalByName("secret");
            s.Teleport(secret.X - 15, secret.Y);
            s.Step(new PlayerInput { Up = true, UpPressed = true });
            Assert.Equal(300, s.Body.Y); // 隠し部屋
            // 部屋から出られない（壁）
            s.Step(new PlayerInput { Right = true }, 300);
            Assert.True(s.Body.X <= 1760 - PlayerBody.HalfW + 1e-9);
            Assert.Equal(300, s.Body.Y);
            // ポータルの上で押しっぱなしでも 1 回だけ入る（押した瞬間だけ）
            s.ChangeMap("S001");
            var p = s.Map.Data.FindPortalByName("to_S002");
            s.Teleport(p.X, p.Y);
            s.Step(new PlayerInput { Up = true, UpPressed = true });
            Assert.Equal("S002", s.Map.Data.Id);
            s.Step(new PlayerInput { Up = true }, 30);
            Assert.Equal("S002", s.Map.Data.Id);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.MapChanged);
        }

        [Fact]
        public void RevisitedMapKeepsMobState()
        {
            var s = GameSession.NewGame(TestData.Get(), "旅", 1);
            s.ChangeMap("S009");
            var elite = s.Map.Mobs.First(m => m.Def.Id == "M007");
            elite.Hp = 100;
            s.ChangeMap("S008");
            s.ChangeMap("S009");
            Assert.Equal(100, s.Map.Mobs.First(m => m.Def.Id == "M007").Hp);
        }
    }

    public class QuestRuleTests
    {
        [Fact]
        public void QuestDataAndRewardsFromQuestsMd()
        {
            var d = TestData.Get();
            Assert.True(d.Quests.Count >= 600, "クエストが " + d.Quests.Count + " 本"); // QUESTS.md 8 章で 286 → 600 本以上
            var q = d.Quest("S-17");
            Assert.Equal(113, q.Exp); // 経験値は Lv の必要量に比べた割合（Lv10 までの表をならしたので小さくなった）
            Assert.Equal(1220, q.Meso);
            Assert.Equal(9, q.MinLevel);
            Assert.Equal(new[] { "S-14" }, q.Prereqs.ToArray());
            Assert.Equal(ObjectiveType.Kill, q.Objectives[0].Type);
            Assert.Equal("M007", q.Objectives[0].Target);
            Assert.Equal("use.safety_charm", q.Rewards[0].Item);
            // 大陸のクエストも読める（目的は [[k:..]] などから）
            var b5 = d.Quest("B-05");
            Assert.Equal(ObjectiveType.Kill, b5.Objectives[0].Type);
            Assert.Equal(30, b5.Objectives[0].Count);
        }

        [Fact]
        public void PrereqLevelAndChain()
        {
            var d = TestData.Get();
            var log = new QuestLog(d);
            var c = new CharacterState();
            Assert.Equal(StartResult.Ok, log.CanStart("S-01", c));
            Assert.Equal(StartResult.PrereqMissing, log.CanStart("S-02", c));
            log.Start("S-01", c);
            Assert.Equal(StartResult.AlreadyStarted, log.Start("S-01", c));
            log.MarkCompleted("S-01", 0);
            Assert.Equal(StartResult.AlreadyCompleted, log.CanStart("S-01", c));
            Assert.Equal(StartResult.Ok, log.CanStart("S-02", c));
            foreach (var id in new[] { "S-02", "S-03", "S-04", "S-05", "S-06" }) log.MarkCompleted(id, 0);
            Assert.Equal(StartResult.LevelTooLow, log.CanStart("S-17", c));
            Assert.Equal(StartResult.LevelTooLow, log.CanStart("S-13", c));
            c.Level = 6;
            Assert.Equal(StartResult.Ok, log.CanStart("S-13", c));
            // 電球: ルカの S-01 は終わった。次は本筋の L-01（Lv5・S-06 の後）
            Assert.DoesNotContain(log.AvailableFrom("luka", c), x => x.Id == "S-01");
            Assert.Contains(log.AvailableFrom("luka_S003", c), x => x.Id == "L-01"); // 村にいるルカ（S003）
            Assert.Contains(log.AvailableFrom("riri", c), x => x.Id == "S-10");
        }

        [Fact]
        public void KillCountsAndCollectUsesInventory()
        {
            var d = TestData.Get();
            var s = GameSession.NewGame(d, "Q", 1);
            s.ChangeMap("S003");
            foreach (var id in new[] { "S-01", "S-02", "S-03", "S-04", "S-05", "S-06" }) s.Quests.MarkCompleted(id, 0);
            s.Character.Level = 6;
            Assert.Equal(StartResult.Ok, s.AcceptQuest("S-14"));
            Assert.Equal(StartResult.Ok, s.AcceptQuest("S-13"));
            Assert.Equal(StartResult.GiverNotHere, AcceptElsewhere(s));
            var notes = s.Quests.Progress(ObjectiveType.Kill, "M004", 1);
            Assert.Single(notes);
            Assert.Equal(1, notes[0].Count);
            Assert.Equal(15, notes[0].Need);
            for (int i = 0; i < 20; i++) s.Quests.Progress(ObjectiveType.Kill, "M004");
            Assert.Equal(15, s.Quests.Count(d.Quest("S-14"), 0, s.Inventory)); // 上限で止まる
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("S-14"));
            // 集める: 持ち物の数。完了で渡す
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("S-13"));
            s.Inventory.Add("etc.M005", 20);
            long exp = s.Character.Exp; int lv = s.Character.Level;
            Assert.Equal(2, s.NpcBulb("momo"));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("S-13"));
            Assert.Equal(5, s.Inventory.Count("etc.M005"));
            Assert.Equal(30, s.Inventory.Count("use.red_potion"));
            Assert.True(s.Character.Exp > exp || s.Character.Level > lv);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.QuestCompleted && e.Id == "S-13");
            Assert.NotNull(s.AutoSave.PendingReason); // 自動セーブが予約されている
        }

        private static StartResult AcceptElsewhere(GameSession s)
        {
            // ガンゾ（S001）のクエストは村では受けられない
            s.Quests.Entries.Remove("S-02");
            return s.AcceptQuest("S-02");
        }

        [Fact]
        public void RewardNeedsInventoryRoom()
        {
            var d = TestData.Get();
            var s = GameSession.NewGame(d, "Q", 1);
            s.ChangeMap("S001");
            s.Quests.MarkCompleted("S-01", 0); s.Quests.MarkCompleted("S-02", 0);
            s.AcceptQuest("S-03");
            for (int i = 0; i < 3; i++) s.Quests.Progress(ObjectiveType.Kill, "M001");
            // 装備タブをいっぱいに
            while (s.Inventory.FreeSlots(Items.InvTab.Equip) > 0) s.Inventory.Add("eq.starter.0");
            Assert.Equal(CompleteResult.InventoryFull, s.CompleteQuest("S-03"));
            Assert.Equal(QuestStatus.InProgress, s.Quests.Status("S-03"));
        }
    }
}
