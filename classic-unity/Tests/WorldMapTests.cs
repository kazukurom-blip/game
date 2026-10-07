// WORLD.md の全マップ（234）: 読める・ポータルは両方向・湧く所/NPC/調べる物は足場の上・縄の両端・
// 本物の物理（PlayerPhysics）で、どのポータルからも全部の足場へ行ける。代表のマップは 1 つの体で全部の足場を続けて回る。
// 生成と設計の値での検査は Data/tools/world（node classic-unity/Data/tools/export_data.mjs --check）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Lumina.Core.World;
using Xunit;
using Xunit.Abstractions;

namespace Lumina.Core.Tests
{
    public class WorldMapTests
    {
        private readonly ITestOutputHelper output;
        public WorldMapTests(ITestOutputHelper output) { this.output = output; }

        private static IEnumerable<MapData> AllMaps()
        {
            var d = TestData.Get();
            foreach (var id in d.MapIds) yield return d.GetMap(id);
        }

        private static bool OnFoothold(PhysicsMap pm, double x, double y)
        {
            var s = pm.SegBelow(x, y - 2);
            return s != null && Math.Abs(s.YAt(x) - y) < 0.5;
        }

        [Fact]
        public void All234MapsLoad()
        {
            var d = TestData.Get();
            Assert.Equal(239, d.MapIds.Count); // maps.mjs の 234 ＋ ジャンプの試練 5（world/jump.mjs）
            var types = new Dictionary<string, int>();
            foreach (var m in AllMaps())
            {
                Assert.NotNull(m);
                var pm = m.BuildPhysics(); // 足場の点が左から右・縄の上下が正しい（違えば例外）
                Assert.Contains(pm.Chains, c => c.Ground);
                Assert.False(string.IsNullOrEmpty(m.Bgm), m.Id + " の BGM");
                Assert.False(string.IsNullOrEmpty(m.Background), m.Id + " の背景");
                Assert.False(string.IsNullOrEmpty(m.Theme), m.Id + " の地形の型");
                Assert.True(d.GetMap(m.ReturnMap)?.IsTown == true, m.Id + " の戻る町 " + m.ReturnMap);
                Assert.Contains(m.Portals, p => p.Type == PortalType.Spawn);
                if (m.IsTown) { Assert.Contains(m.Portals, p => p.Type == PortalType.Town); Assert.Empty(m.Spawns); }
                types[m.Type] = types.TryGetValue(m.Type, out var n) ? n + 1 : 1;
            }
            output.WriteLine(string.Join(" ", types.Select(kv => kv.Key + ":" + kv.Value)));
            Assert.Equal(17, types["町"]);
        }

        [Fact]
        public void PortalsGoBothWaysAndEverythingStandsOnFootholds()
        {
            var d = TestData.Get();
            var npcSeen = new HashSet<string>();
            foreach (var m in AllMaps())
            {
                var pm = m.BuildPhysics();
                foreach (var p in m.Portals)
                {
                    Assert.True(OnFoothold(pm, p.X, p.Y), m.Id + " のポータル " + p.Name + " が足場の上に無い");
                    if (p.To != null)
                    {
                        var dst = d.GetMap(p.To);
                        Assert.True(dst != null, m.Id + " → " + p.To + " のマップが無い");
                        var back = dst.FindPortalByName(p.ToPortal);
                        Assert.True(back != null, m.Id + " → " + p.To + "." + p.ToPortal + " が無い");
                        if (p.OneWay) { Assert.False(back.To == m.Id && back.ToPortal == p.Name, m.Id + "." + p.Name + " は一方通行なのに戻れる"); continue; }
                        Assert.NotEqual(PortalType.Landing, back.Type);
                        Assert.Equal(m.Id, back.To);
                        Assert.Equal(p.Name, back.ToPortal);
                    }
                    else if (p.ToPortal != null) Assert.NotNull(m.FindPortalByName(p.ToPortal));
                }
                Assert.Equal(m.Portals.Count, m.Portals.Select(p => p.Name).Distinct().Count());
                foreach (var s in m.Spawns) Assert.True(OnFoothold(pm, s.X, s.Y), m.Id + " の湧く所 " + s.Mob + " x=" + s.X);
                foreach (var s in m.TimedSpawns) Assert.True(OnFoothold(pm, s.X, s.Y), m.Id + " の強敵 " + s.Mob);
                foreach (var s in m.Spawns.Concat(m.TimedSpawns)) Assert.True(d.Mob(s.Mob) != null, m.Id + " の敵 " + s.Mob + " が無い");
                foreach (var n in m.Npcs)
                {
                    Assert.True(OnFoothold(pm, n.X, n.Y), m.Id + " の NPC " + n.Id);
                    Assert.True(npcSeen.Add(n.Id), "NPC " + n.Id + " が 2 か所にいる");
                    Assert.Equal(m.Id, d.Npcs[n.Id].Map);
                    if (n.Travel != null) Assert.True(d.GetMap(n.Travel.To)?.FindPortalByName(n.Travel.ToPortal) != null, n.Id + " の乗り物の行き先");
                    if (n.Shop != null) Assert.True(d.Shops.ContainsKey(n.Shop), n.Id + " の店 " + n.Shop);
                }
                foreach (var o in m.Objects) Assert.True(OnFoothold(pm, o.X, o.Y), m.Id + " の調べる物 " + o.Id);
                if (m.Spawns.Count > 0 && m.Region != "S") Assert.InRange(m.MobMax, 1, m.Spawns.Count);
            }
            Assert.Equal(d.Npcs.Count, npcSeen.Count); // npcs.json の全員がどこかのマップにいる
        }

        [Fact]
        public void RopesHaveFootholdsAtBothEnds()
        {
            foreach (var m in AllMaps())
            {
                var pm = m.BuildPhysics();
                foreach (var r in pm.Ropes)
                {
                    // 上りきると立てる
                    Assert.Contains(pm.Segs, s => r.X >= s.X1 && r.X <= s.X2 && Math.Abs(s.YAt(r.X) - r.Top) <= 8);
                    // 下端は下の足場から ↑ で届く
                    var below = pm.SegBelow(r.X, r.Bottom + 1);
                    Assert.True(below != null && below.YAt(r.X) - r.Bottom <= Feel.RopeBottomReach, m.Id + " の縄 x=" + r.X);
                }
            }
        }

        /// <summary>本物の物理で: どのポータル（出現の位置も）からも、全部の足場に行ける。</summary>
        [Fact]
        public void EveryFootholdReachableFromEveryPortalWithRealPhysics()
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            int nodes = 0, edges = 0;
            var problems = new List<string>();
            foreach (var m in AllMaps())
            {
                var r = new MapReach(m);
                nodes += r.Nodes.Count; edges += r.Edges.Values.Sum(l => l.Count);
                var starts = new HashSet<string>();
                foreach (var p in m.Portals)
                {
                    var n = r.NodeAtPortal(p);
                    if (n == null) { problems.Add(m.Id + " のポータル " + p.Name + " が足場の上に無い"); continue; }
                    if (!starts.Add(n)) continue;
                    var seen = r.ReachableFrom(n);
                    var miss = r.Nodes.Keys.Where(k => !seen.Contains(k)).ToList();
                    if (miss.Count > 0) problems.Add(m.Id + " のポータル " + p.Name + " から行けない足場: " + string.Join(", ", miss));
                }
            }
            output.WriteLine($"足場のかたまり {nodes}・動き {edges}・{sw.ElapsedMilliseconds} ms");
            Assert.True(problems.Count == 0, string.Join("\n", problems.Take(30)));
        }

        // 地形の型ごとの代表（島・町・高い町・丘の町・平原・森・岩山・沼・洞くつ＋隠し部屋・塔・船・ボス・部屋・1 人用ダンジョン）
        public static IEnumerable<object[]> Representative => new[]
        {
            "S006", "V100", "V300", "V200", "V101", "V301", "V104", "V508", "V409", "C107", "V107", "V208", "V211", "V516", "F107", "M107", "E108",
        }.Select(x => new object[] { x });

        /// <summary>1 つの体で、出現の位置から全部の足場を順に回り、全部のポータルの前に立つ（↑で入れる所）。</summary>
        [Theory]
        [MemberData(nameof(Representative))]
        public void WalkEveryFootholdEndToEndWithOneBody(string mapId)
        {
            var m = TestData.Get().GetMap(mapId);
            var r = new MapReach(m);
            var sp = m.FindPortalByName("sp");
            var body = new PlayerBody(sp.X, sp.Y);
            PlayerPhysics.PlaceOnGround(body, r.Map, sp.X, sp.Y);
            string cur = r.NodeOf(body);
            Assert.NotNull(cur);
            var visited = new HashSet<string> { cur };
            int moves = 0;
            // 左端から右端の順に全部のかたまりへ
            var order = r.Nodes.Keys.OrderBy(k => r.Nodes[k].a).ThenBy(k => k).ToList();
            foreach (var goal in order)
            {
                if (goal == cur) continue;
                var path = r.Path(cur, goal);
                Assert.True(path != null, mapId + ": " + cur + " から " + goal + " へ行けない");
                foreach (var e in path)
                {
                    var got = r.Perform(body, e);
                    Assert.True(got == e.To, $"{mapId}: {e} のはずが {got ?? "着かない"}（x={body.X:0.0}, y={body.Y:0.0}, {body.State}）");
                    visited.Add(got);
                    cur = got;
                    moves++;
                }
            }
            Assert.Equal(r.Nodes.Count, visited.Count);
            // ポータルの前まで行って、↑で入れる位置に立つ
            foreach (var p in m.Portals.Where(p => p.IsEnterable))
            {
                var goal = r.NodeAtPortal(p);
                foreach (var e in r.Path(cur, goal))
                {
                    var got = r.Perform(body, e);
                    Assert.True(got == e.To, $"{mapId}: {e} のはずが {got ?? "着かない"}（x={body.X:0.0}, y={body.Y:0.0}, {body.State}）");
                    cur = got; moves++;
                }
                Assert.True(r.WalkTo(body, p.X), mapId + " のポータル " + p.Name + " の前まで歩けない");
                Assert.Same(p, m.FindPortalAt(body.X, body.Y));
            }
            output.WriteLine($"{mapId}: かたまり {r.Nodes.Count} を {moves} 回の動きで回った");
        }

        /// <summary>道具そのものの確かめ: 56 px の段は跳べる、80 px は跳べない（縄があれば行ける）。</summary>
        [Fact]
        public void ReachToolSeesStepLimits()
        {
            string Map(int dy, string ropes) => "{\"id\":\"X\",\"width\":1200,\"height\":800,\"footholds\":[{\"id\":\"g\",\"ground\":true,\"points\":[[0,700],[1200,700]]},"
                + "{\"id\":\"p\",\"points\":[[400," + (700 - dy) + "],[800," + (700 - dy) + "]]}],\"ropes\":[" + ropes + "],\"portals\":[{\"name\":\"sp\",\"type\":\"spawn\",\"x\":100,\"y\":700}]}";
            bool Reach(string json) { var r = new MapReach(MapData.FromJson(json)); return r.ReachableFrom("g#0").Contains("p#0"); }
            Assert.True(Reach(Map(56, "")));
            Assert.True(Reach(Map(76, "")));   // 物理の上限は約 77 px（設計では 64 までにしている）
            Assert.False(Reach(Map(80, "")));
            Assert.True(Reach(Map(128, "{\"x\":600,\"top\":572,\"bottom\":680}")));
        }

        [Fact]
        public void HuntingFieldsAreWideAndLayeredTownsAreFlat()
        {
            foreach (var m in AllMaps().Where(x => x.Region != "S"))
            {
                var pm = m.BuildPhysics();
                if (m.Type == "狩")
                {
                    Assert.True(m.Width >= m.Height * 1.5 || m.Theme == "tower", m.Id + " は横長");
                    Assert.True(pm.Chains.Count(c => !c.Ground) >= 3, m.Id + " は数層");
                    Assert.True(m.Spawns.Count >= 8, m.Id + " の湧く所 " + m.Spawns.Count);
                    Assert.True(pm.Ropes.Count >= 1, m.Id + " の縄");
                }
                if (m.IsTown && m.Theme == "town")
                {
                    // 平らな町: 地面の坂はゆるく（高低差 24 px まで）
                    var g = m.Footholds.First(f => f.Ground);
                    Assert.True(g.Points.Max(p => p[1]) - g.Points.Min(p => p[1]) <= 24, m.Id + " の地面");
                }
            }
        }

        [Fact]
        public void SecretRoomsAndQuestObjectsExist()
        {
            var d = TestData.Get();
            var objs = new Dictionary<string, string>();
            foreach (var m in AllMaps()) foreach (var o in m.Objects) objs[o.Id] = m.Id;
            foreach (var q in d.QuestList)
                foreach (var o in q.Objectives)
                {
                    switch (o.Type)
                    {
                        case ObjectiveType.Talk: Assert.True(d.Npcs.ContainsKey(o.Target), q.Id + " の話す相手 " + o.Target); break;
                        case ObjectiveType.Interact: Assert.True(objs.ContainsKey(o.Target), q.Id + " の調べる物 " + o.Target); break;
                        case ObjectiveType.Visit: Assert.True(d.GetMap(o.Target) != null, q.Id + " のマップ " + o.Target); break;
                        case ObjectiveType.Kill: Assert.True(d.Mob(o.Target) != null, q.Id + " の敵 " + o.Target); break;
                        case ObjectiveType.Collect: Assert.True(d.Item(o.Target) != null, q.Id + " の品 " + o.Target); break;
                    }
                }
            // 依頼者と報告先は、そのマップにいる NPC
            foreach (var q in d.QuestList)
            {
                Assert.True(d.Npcs.ContainsKey(q.Giver), q.Id + " の依頼者 " + q.Giver);
                Assert.Equal(q.Map, d.Npcs[q.Giver].Map);
                if (!q.AutoComplete) Assert.True(d.Npcs.ContainsKey(q.End), q.Id + " の報告先 " + q.End);
            }
            // WORLD.md 6 章の隠し部屋（隠しポータル → 部屋 → 戻る）
            foreach (var id in new[] { "S007", "V102", "V105", "V409", "V506", "V601", "M107" })
            {
                var m = d.GetMap(id);
                Assert.Contains(m.Portals, p => p.Type == PortalType.Hidden && p.To == null);
            }
        }
    }

    /// <summary>大陸のクエスト（文章だけだった目的を判定できる形にした物）を実際に進める。</summary>
    public class ContinentQuestTests
    {
        private static GameSession NewAt(string map)
        {
            var s = GameSession.NewGame(TestData.Get(), "旅", 7);
            s.Character.Level = 30;
            foreach (var q in TestData.Get().QuestList.Where(q => q.Tutorial)) s.Quests.MarkCompleted(q.Id, 0);
            s.ChangeMap(map);
            return s;
        }

        private static void Accept(GameSession s, string id) => Assert.Equal(StartResult.Ok, s.AcceptQuest(id));

        [Fact]
        public void LetterRoundAroundTheContinent()
        {
            var s = NewAt("V100");
            s.Inventory.Add("special.letter_breeze");
            Accept(s, "V-01");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-01")); // 推薦状を見せる（渡す）
            Assert.Equal(0, s.Inventory.Count("special.letter_breeze"));
            Accept(s, "V-02");
            // ポム丘のエルナに届ける（話すと進み、そのまま報告できる）
            s.ChangeMap("V200");
            var dlg = s.Talk("erna");
            Assert.Contains(dlg.Completable, q => q.Id == "V-02");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-02"));
            Accept(s, "V-03");
            s.ChangeMap("V300"); s.Talk("orfe"); Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-03"));
            Accept(s, "V-04");
            s.ChangeMap("V400"); s.Talk("dorga"); Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-04"));
            Accept(s, "V-05");
            s.ChangeMap("V500"); s.Talk("yami"); Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-05"));
            Accept(s, "V-06");
            s.ChangeMap("V107"); s.Talk("rio");
            Assert.Equal(CompleteResult.WrongNpc, s.CompleteQuest("V-06")); // 報告はオルガ
            s.ChangeMap("V100");
            Assert.Equal(2, s.NpcBulb("olga"));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-06"));
        }

        [Fact]
        public void LighthouseLampInTheSecretRoom()
        {
            var s = NewAt("V102");
            s.Quests.MarkCompleted("V-01", 0);
            Accept(s, "V-07");
            s.Inventory.Add("etc.M011", 10);
            // 灯台のてっぺんの隠しポータル → 部屋
            var hidden = s.Map.Data.Portals.First(p => p.Type == PortalType.Hidden);
            s.Teleport(hidden.X, hidden.Y);
            s.Step(new PlayerInput { Up = true, UpPressed = true });
            var room = s.Map.Data.FindPortalByName("room");
            Assert.Equal(room.Y, s.Body.Y);
            var lamp = s.Map.Data.Objects.First(o => o.Id == "V102.lamp");
            Assert.False(s.Interact("V102.lamp") && Math.Abs(s.Body.X - lamp.X) > 32);
            s.Teleport(lamp.X, lamp.Y);
            Assert.True(s.Interact("V102.lamp"));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-07"));
        }

        [Fact]
        public void JobQuestNeedsStatAndAdvancing()
        {
            var s = NewAt("V400");
            s.Character.Level = 10;
            s.Character.Str = 20;
            Assert.Equal(StartResult.StatTooLow, s.Quests.CanStart("J1-1", s.Character));
            s.Character.Str = 35;
            Accept(s, "J1-1");
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("J1-1"));
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob("warrior"));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-1"));
        }

        [Fact]
        public void DungeonAndStorageEventsCount()
        {
            var s = NewAt("V515");
            Accept(s, "PQ-1");
            s.QuestEvent("dungeon_clear.T121"); // ほかのダンジョンでは進まない
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("PQ-1"));
            s.QuestEvent("dungeon_clear.V516");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("PQ-1"));
            // 文章だけの目的は残っていない（大陸から先: 全部のクエストに判定できる目的がある）
            foreach (var q in TestData.Get().QuestList) Assert.True(q.Objectives.Count > 0, q.Id + " の目的が無い");
        }
    }
}
