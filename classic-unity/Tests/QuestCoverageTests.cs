// クエストの大幅な追加（QUESTS.md 8 章）の確かめ:
//   全部のクエストが「受けられる・進められる・終えられる」か（依頼者がいる・目的の敵がどこかに湧く・集める品を落とす敵がいる・行く所がある・前提がつながって輪にならない）
//   隠された品は「ヒント → 見つける」の順でしか進まない・専用ボスはクエストの間だけ湧く・限定の報酬は店にもドロップにも無い・隠しクエストの条件・長い目標・メダルの欄。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class QuestCoverageTests
    {
        private static readonly string[] KnownEvents =
        {
            "quickslot_set", "use_potion", "ap_spent", "sp_spent", "skill_used", "storage_deposit", "storage_withdraw",
            "pet_adopted", "pet_fed", "pet_closeness", "dungeon_clear", "boss_kill", "quiz_cleared",
            GameSession.RecKinds, GameSession.RecBosses, GameSession.RecTowns, GameSession.RecMaps, GameSession.RecQuests,
        };

        private static IEnumerable<MapData> AllMaps(GameData d) => d.MapIds.Select(d.GetMap).Where(m => m != null);

        [Fact]
        public void EveryQuestCanBeAcceptedProgressedAndFinished()
        {
            var d = TestData.Get();
            var maps = AllMaps(d).ToList();
            // 敵がふつうに湧くマップ / クエストの間だけ湧く所
            var spawnsAlways = new HashSet<string>();
            var spawnsForQuest = new Dictionary<string, HashSet<string>>();
            foreach (var m in maps)
            {
                foreach (var sp in m.Spawns) spawnsAlways.Add(sp.Mob);
                foreach (var sp in m.TimedSpawns)
                {
                    if (sp.Quest == null) spawnsAlways.Add(sp.Mob);
                    else { if (!spawnsForQuest.TryGetValue(sp.Mob, out var l)) spawnsForQuest[sp.Mob] = l = new HashSet<string>(); l.Add(sp.Quest); }
                }
            }
            // 呼ばれて出る敵（ボスの手下）も「出る」に数える
            foreach (var mob in d.Mobs.Values)
                foreach (var a in mob.Attacks) foreach (var x in a.Mobs ?? new List<string>()) spawnsAlways.Add(x);
            bool Spawns(string mob, string quest) => spawnsAlways.Contains(mob) || spawnsForQuest.TryGetValue(mob, out var qs) && qs.Contains(quest);
            var objects = new Dictionary<string, MapObjectData>();
            foreach (var m in maps) foreach (var o in m.Objects) objects[o.Id] = o;
            var shopItems = new HashSet<string>(d.Shops.Values.SelectMany(sh => sh.Items).Select(e => e.Item));
            var rewardItems = new HashSet<string>(d.QuestList.SelectMany(q => q.Rewards).Select(r => r.Item));
            var dropBy = new Dictionary<string, List<string>>();
            foreach (var mob in d.Mobs.Values) foreach (var dr in mob.Drops) { if (!dropBy.TryGetValue(dr.Item, out var l)) dropBy[dr.Item] = l = new List<string>(); l.Add(mob.Id); }
            var crafted = new HashSet<string>(d.Systems.Crafts.Select(c => c.Out.Item));
            var problems = new List<string>();
            foreach (var q in d.QuestList)
            {
                // 依頼者・報告先がいる（そのマップに）
                if (!d.Npcs.TryGetValue(q.Giver, out var giver) || giver.Map != q.Map) problems.Add(q.Id + ": 依頼者 " + q.Giver + " が " + q.Map + " にいない");
                if (!q.AutoComplete && !d.Npcs.ContainsKey(q.End)) problems.Add(q.Id + ": 報告先 " + q.End + " がいない");
                if (q.Objectives.Count == 0) problems.Add(q.Id + ": 目的が無い");
                foreach (var o in q.Objectives)
                {
                    switch (o.Type)
                    {
                        case ObjectiveType.Kill:
                            if (d.Mob(o.Target) == null) problems.Add(q.Id + ": 敵 " + o.Target + " が無い");
                            else if (!Spawns(o.Target, q.Id)) problems.Add(q.Id + ": 敵 " + o.Target + " がどこにも湧かない");
                            break;
                        case ObjectiveType.Collect:
                            if (d.Item(o.Target) == null) { problems.Add(q.Id + ": 品 " + o.Target + " が無い"); break; }
                            bool byDrop = dropBy.TryGetValue(o.Target, out var mobs) && mobs.Any(mm => Spawns(mm, q.Id));
                            if (!byDrop && !shopItems.Contains(o.Target) && !rewardItems.Contains(o.Target) && !crafted.Contains(o.Target)
                                && !d.Systems.Jobs.QuestDrops.Any(x => x.Item == o.Target) && o.Target != "special.letter_breeze")
                                problems.Add(q.Id + ": 品 " + o.Target + " の手に入れ方が無い");
                            break;
                        case ObjectiveType.Talk:
                            if (!d.Npcs.ContainsKey(o.Target)) problems.Add(q.Id + ": 話す相手 " + o.Target + " がいない");
                            break;
                        case ObjectiveType.Visit:
                            if (d.GetMap(o.Target) == null) problems.Add(q.Id + ": マップ " + o.Target + " が無い");
                            break;
                        case ObjectiveType.Interact:
                            if (!objects.TryGetValue(o.Target, out var ob)) problems.Add(q.Id + ": 調べる物 " + o.Target + " が無い");
                            else if (ob.Quest != null && ob.Quest != q.Id) problems.Add(q.Id + ": 調べる物 " + o.Target + " は " + ob.Quest + " の隠し物");
                            break;
                        case ObjectiveType.Event:
                            if (!KnownEvents.Contains(o.Target) && !o.Target.StartsWith("dungeon_clear.") && !o.Target.StartsWith("job_advance."))
                                problems.Add(q.Id + ": 知らない操作 " + o.Target);
                            break;
                    }
                }
                // 前提がある・前提の Lv が高すぎない
                foreach (var p in q.Prereqs)
                {
                    var pq = d.Quest(p);
                    if (pq == null) problems.Add(q.Id + ": 前提 " + p + " が無い");
                    else if (pq.MinLevel > q.MinLevel) problems.Add(q.Id + ": 前提 " + p + " の Lv が高い");
                }
                // 隠しの品が手に入る
                if (q.NeedItem != null && d.Item(q.NeedItem) == null) problems.Add(q.Id + ": 隠しの品 " + q.NeedItem + " が無い");
                if (q.HourFrom >= 0 && (q.HourFrom > 23 || q.HourTo > 24 || q.HourFrom == q.HourTo)) problems.Add(q.Id + ": 時間 " + q.HourFrom + "〜" + q.HourTo + " が変");
            }
            // クエスト専用の敵・隠し物は、そのクエストのためだけ（ほかのクエストの目的から外れない）
            foreach (var kv in spawnsForQuest)
                foreach (var qid in kv.Value)
                    if (d.Quest(qid)?.Objectives.Any(o => o.Type == ObjectiveType.Kill && o.Target == kv.Key) != true) problems.Add("専用の敵 " + kv.Key + " のクエスト " + qid + " に倒す目的が無い");
            foreach (var o in objects.Values.Where(o => o.Quest != null))
                if (d.Quest(o.Quest)?.Objectives.Any(x => x.Type == ObjectiveType.Interact && x.Target == o.Id) != true) problems.Add("隠し物 " + o.Id + " のクエスト " + o.Quest + " に調べる目的が無い");
            Assert.True(problems.Count == 0, string.Join("\n", problems.Take(40)));
        }

        [Fact]
        public void PrereqsHaveNoCycles()
        {
            var d = TestData.Get();
            var state = new Dictionary<string, int>(); // 1 = たどっている, 2 = 済み
            bool Visit(string id, List<string> path)
            {
                if (state.TryGetValue(id, out var st)) return st == 2;
                state[id] = 1; path.Add(id);
                foreach (var p in d.Quest(id)?.Prereqs ?? new List<string>())
                    if (!Visit(p, path)) { Assert.Fail("前提が輪になっている: " + string.Join(" → ", path) + " → " + p); }
                state[id] = 2; path.RemoveAt(path.Count - 1);
                return true;
            }
            foreach (var q in d.QuestList) Visit(q.Id, new List<string>());
        }

        [Fact]
        public void EveryNpcHasAQuest()
        {
            var d = TestData.Get();
            var givers = new HashSet<string>(d.QuestList.Select(q => q.Giver));
            var none = d.Npcs.Keys.Where(id => !givers.Contains(id)).ToList();
            // 雲の船（航行中, C118）の水夫カゼだけは、乗り物がすぐ着くので会えない（WORLD.md 4 章・CORE.md 5 章）
            Assert.Equal(new[] { "kaze" }, none.ToArray());
            Assert.True(d.QuestList.Count >= 600, "クエストが " + d.QuestList.Count + " 本");
        }

        [Fact]
        public void QuestOnlyRewardsAreNotSoldOrDropped()
        {
            var d = TestData.Get();
            var only = d.Items.Values.Where(i => i.QuestOnly).ToList();
            Assert.True(only.Count >= 40, "限定の品が " + only.Count);
            var sold = new HashSet<string>(d.Shops.Values.SelectMany(sh => sh.Items).Select(e => e.Item));
            var dropped = new HashSet<string>(d.Mobs.Values.SelectMany(m => m.Drops).Select(x => x.Item));
            var crafted = new HashSet<string>(d.Systems.Crafts.Select(c => c.Out.Item));
            foreach (var it in only)
            {
                Assert.False(sold.Contains(it.Id), it.Name + " が店にある");
                Assert.False(dropped.Contains(it.Id), it.Name + " を敵が落とす");
                Assert.False(crafted.Contains(it.Id), it.Name + " が作れる");
                Assert.Contains(d.QuestList, q => q.Rewards.Any(r => r.Item == it.Id));
                Assert.Contains("入手: クエストのみ", it.Desc);
            }
        }

        // ---------------- 実際に遊んで

        private static GameSession NewAt(string map, int level)
        {
            var s = GameSession.NewGame(TestData.Get(), "寄り道", 11);
            s.Clock = () => new DateTime(2026, 10, 7, 3, 0, 0, DateTimeKind.Utc); // 日本の 12 時
            s.Character.Level = level;
            foreach (var q in TestData.Get().QuestList.Where(q => q.Tutorial)) s.Quests.MarkCompleted(q.Id, 0);
            s.ChangeMap(map);
            return s;
        }

        private static void CompletePrereqs(GameSession s, string id)
        {
            foreach (var p in s.Data.Quest(id).Prereqs)
            {
                CompletePrereqs(s, p);
                s.Quests.MarkCompleted(p, 0);
            }
        }

        private static bool InteractAt(GameSession s, string map, string objectId)
        {
            if (s.Map.Data.Id != map) s.ChangeMap(map);
            var o = s.Map.Data.Objects.First(x => x.Id == objectId);
            s.Teleport(o.X, o.Y);
            return s.Interact(objectId);
        }

        [Fact]
        public void HiddenItemQuestGoesHintThenFind()
        {
            var s = NewAt("S003", 8);
            CompletePrereqs(s, "IS-09");
            // 受ける前: 隠し物は見つからない
            Assert.True(InteractAt(s, "S005", "S005.q_carving"));
            Assert.Contains(s.Out.Events, e => e.Text == "何も見つからない");
            s.ChangeMap("S003");
            Assert.Equal(StartResult.Ok, s.AcceptQuest("IS-09"));
            var q = s.Data.Quest("IS-09");
            Assert.True(q.Ordered);
            // 先に 2 つ目（崖の石積み）を調べても進まない
            InteractAt(s, "S006", "S006.q_cairn");
            Assert.Equal(0, s.Quests.Count(q, 1, s.Inventory));
            // ヒント（林の刻み目）→ 石積み、の順なら進む
            InteractAt(s, "S005", "S005.q_carving");
            Assert.Equal(1, s.Quests.Count(q, 0, s.Inventory));
            InteractAt(s, "S006", "S006.q_cairn");
            Assert.True(s.Quests.ObjectivesDone(q, s.Inventory));
            s.ChangeMap("S003");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("IS-09"));
        }

        [Fact]
        public void QuestBossAppearsOnlyDuringItsQuest()
        {
            var s = NewAt("S008", 9);
            Assert.DoesNotContain(s.Map.Mobs, m => m.Alive && m.Def.Id == "M400");
            s.Step(new PlayerInput(), 60 * 15);
            Assert.DoesNotContain(s.Map.Mobs, m => m.Alive && m.Def.Id == "M400"); // 時間がたっても出ない
            s.ChangeMap("S003");
            CompletePrereqs(s, "IS-10");
            Assert.Equal(StartResult.Ok, s.AcceptQuest("IS-10"));
            s.ChangeMap("S008");
            s.Step(new PlayerInput(), 60 * 12);
            Assert.Contains(s.Map.Mobs, m => m.Alive && m.Def.Id == "M400");
            Assert.True(s.Data.Mob("M400").Boss != null); // 技と段階がある
            // 倒すと数が進み、報告できる
            var h = new Harness(s);
            s.Character.Dex = 999; s.Character.BaseMaxHp = 10_000_000; s.RefreshStats(); s.Character.Hp = s.Stats.MaxHp;
            foreach (var m in s.Map.Mobs.Where(m => m.Alive && m.Def.Id == "M400")) m.Hp = 1;
            Assert.True(h.KillOne("M400", 3000));
            Assert.True(s.Quests.ObjectivesDone(s.Data.Quest("IS-10"), s.Inventory));
            // 終えると、もう出ない
            s.ChangeMap("S003");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("IS-10"));
            s.ChangeMap("S008");
            s.Step(new PlayerInput(), 60 * 15);
            Assert.DoesNotContain(s.Map.Mobs, m => m.Alive && m.Def.Id == "M400");
        }

        [Fact]
        public void HiddenQuestsNeedTheHourOrTheItem()
        {
            // 夜だけ（IS-14: 20〜4 時。日本の時間）
            var s = NewAt("S003", 8);
            CompletePrereqs(s, "IS-14");
            Assert.Equal(StartResult.WrongTime, s.Quests.CanStart("IS-14", s.Character));
            Assert.Equal(0, s.NpcBulb("piko") == 1 && s.Quests.AvailableFrom("piko", s.Character).Any(q => q.Id == "IS-14") ? 1 : 0);
            s.Clock = () => new DateTime(2026, 10, 7, 13, 0, 0, DateTimeKind.Utc); // 日本の 22 時
            Assert.Equal(StartResult.Ok, s.Quests.CanStart("IS-14", s.Character));
            // その品を持って（着けて）話す（V-36: 錨の耳飾り）
            var p = NewAt("V102", 20);
            CompletePrereqs(p, "V-36");
            Assert.Equal(StartResult.MissingItem, p.Quests.CanStart("V-36", p.Character));
            p.Inventory.Add("eq.quest.anchor_earring");
            Assert.Equal(StartResult.Ok, p.Quests.CanStart("V-36", p.Character));
            for (int i = 0; i < p.Inventory.SlotCount(InvTab.Equip); i++)
                if (p.Inventory.Get(InvTab.Equip, i)?.ItemId == "eq.quest.anchor_earring") p.Equipment.EquipFromInventory(p.Inventory, i, p.Character);
            Assert.False(p.Inventory.Has("eq.quest.anchor_earring"));
            Assert.Equal(StartResult.Ok, p.Quests.CanStart("V-36", p.Character)); // 着けていてもよい
        }

        [Fact]
        public void LongGoalsCountWhatWasDoneBefore()
        {
            var s = NewAt("V090", 12);
            var mobs = s.Data.Mobs.Keys.OrderBy(x => x).Take(30).ToList();
            foreach (var m in mobs.Take(29)) s.Flags["kill." + m] = true;
            Assert.Equal(StartResult.Ok, s.AcceptQuest("X-01"));
            var q = s.Data.Quest("X-01");
            Assert.Equal(29, s.Quests.Count(q, 0, s.Inventory)); // 受ける前の分も数える
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("X-01"));
            s.Flags["kill." + mobs[29]] = true;
            s.ChangeMap("V100"); s.ChangeMap("V090"); // 記録が増えた時にそろえる
            Assert.Equal(30, s.Quests.Count(q, 0, s.Inventory));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("X-01"));
            // メダルは装備の「メダル」の欄に着ける
            Assert.True(s.Inventory.Has("eq.medal.hunter1"));
            for (int i = 0; i < s.Inventory.SlotCount(InvTab.Equip); i++)
                if (s.Inventory.Get(InvTab.Equip, i)?.ItemId == "eq.medal.hunter1") Assert.Equal(EquipResult.Ok, s.Equipment.EquipFromInventory(s.Inventory, i, s.Character));
            Assert.Equal("eq.medal.hunter1", s.Equipment.Get(EquipSlot.Medal)?.ItemId);
            // 町を訪ねた数（島の村・港・市場）
            Assert.True(s.TownsVisited >= 2);
        }

        [Fact]
        public void DailyQuestCanBeDoneAgainTheNextDay()
        {
            var s = NewAt("S003", 5);
            s.Clock = () => new DateTime(2026, 10, 7, 3, 0, 0, DateTimeKind.Utc);
            Assert.Equal(StartResult.Ok, s.AcceptQuest("IS-22"));
            s.Inventory.Add("etc.M002", 5);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("IS-22"));
            Assert.Equal(StartResult.AlreadyCompleted, s.Quests.CanStart("IS-22", s.Character));
            s.Clock = () => new DateTime(2026, 10, 8, 3, 0, 0, DateTimeKind.Utc);
            Assert.Equal(StartResult.Ok, s.AcceptQuest("IS-22"));
        }
    }
}
