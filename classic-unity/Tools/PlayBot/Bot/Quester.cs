// クエストを選んで進める頭。考える（Think）たびに「やれること」を全部並べ、一番近い・安い物を 1 つやる:
//   報告できる物を報告 → 進めているクエストの目的（倒す・集める・話す・行く・調べる・操作）→ 受けられる物を受ける → 何も無ければ狩り。
// 転職のクエスト（J 系）も同じ仕組みで進む（job_advance.1/2 は転職官の前で AdvanceJob/AdvanceJob2、quiz_cleared は賢者の石）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Town;
using Lumina.Core.World;

namespace Lumina.PlayBot
{
    public sealed class Plan
    {
        public string Key, Desc, Quest, Map;
        public double Cost;
        public Func<bool> Run;   // 進んだら true
    }

    public sealed partial class Bot
    {
        public int MaxActiveQuests = 6;
        public static int FightAbove = 1, GrindBelow = 4;
        public readonly System.Diagnostics.Stopwatch thinkWatch = new System.Diagnostics.Stopwatch();
        public int Thinks;
        private readonly Dictionary<string, int> planFails = new Dictionary<string, int>();
        private readonly Dictionary<string, int> planFailLevel = new Dictionary<string, int>();
        private Dictionary<string, double> dist;

        // ---------------- 索引

        private Dictionary<string, List<string>> mobMaps;
        private Dictionary<string, List<(string mob, double chance)>> dropMobs;
        private Dictionary<string, string> objectMap;

        private void BuildIndex()
        {
            if (mobMaps != null) return;
            mobMaps = new Dictionary<string, List<string>>();
            objectMap = new Dictionary<string, string>();
            foreach (var id in D.MapIds)
            {
                var md = D.GetMap(id);
                foreach (var sp in md.Spawns.Concat(md.TimedSpawns))
                {
                    if (!mobMaps.TryGetValue(sp.Mob, out var l)) mobMaps[sp.Mob] = l = new List<string>();
                    if (!l.Contains(id)) l.Add(id);
                }
                foreach (var o in md.Objects) objectMap[o.Id] = id;
            }
            dropMobs = new Dictionary<string, List<(string, double)>>();
            foreach (var m in D.Mobs.Values)
                foreach (var d in m.Drops)
                {
                    if (!dropMobs.TryGetValue(d.Item, out var l)) dropMobs[d.Item] = l = new List<(string, double)>();
                    l.Add((m.Id, d.Chance));
                }
        }

        /// <summary>今のマップから全部のマップへの道の長さ（1 回の Dijkstra）。</summary>
        private Dictionary<string, double> AllCosts()
        {
            var d = new Dictionary<string, double> { { MapId, 0 } };
            var open = new SortedSet<(double, string)> { (0, MapId) };
            while (open.Count > 0)
            {
                var (c0, c) = open.Min;
                open.Remove(open.Min);
                if (c0 > d[c]) continue;
                foreach (var h in HopsFrom(c, null).Concat(RoomHops(c)))
                {
                    double nd = c0 + h.Cost;
                    if (d.TryGetValue(h.To, out var old) && old <= nd) continue;
                    if (d.ContainsKey(h.To)) open.Remove((old, h.To));
                    d[h.To] = nd;
                    if (D.Systems.Room(h.To) == null) open.Add((nd, h.To)); // 部屋は行き止まり（先へは通らない）
                }
            }
            return d;
        }

        private IEnumerable<Hop> RoomHops(string mapId)
        {
            var md = D.GetMap(mapId);
            if (md == null) yield break;
            foreach (var p in md.Portals)
            {
                if (!p.IsEnterable || p.To == null || D.Systems.Room(p.To) == null) continue;
                if (p.RequiresQuest != null && S.Quests.Status(p.RequiresQuest) == QuestStatus.None) continue;
                if (S.CanEnterRoom(p.To) != RoomEntryResult.Ok) continue;
                yield return new Hop { Kind = "portal", From = mapId, To = p.To, Portal = p, Cost = 1 };
            }
        }

        private double Dist(string map) => map != null && dist != null && dist.TryGetValue(map, out var c) ? c : double.PositiveInfinity;

        // ---------------- 強さ

        private readonly Dictionary<string, int> mobDeaths = new Dictionary<string, int>();
        private string lastEngagedMob;

        private void OnDeathNoted(string map)
        {
            if (lastEngagedMob != null) mobDeaths[lastEngagedMob] = mobDeaths.TryGetValue(lastEngagedMob, out var n) ? n + 1 : 1;
        }

        /// <summary>お金も薬も無い（薬を 10 個買えない）。弱い敵で稼ぐ。</summary>
        public bool Broke => CountPotions(true) < 3 && S.Inventory.Meso < (Level < 15 ? 50 : Level < 35 ? 160 : Level < 70 ? 320 : 1000) * 10;

        /// <summary>薬が無い時は、自分と同じくらいの敵のクエストは後回し（弱い敵で稼いでから）。</summary>
        private double NoPotionPenalty(MobDef m) => m != null && CountPotions(true) < 5 && m.Lv > Level - 6 ? 50 : 0;

        public bool CanFight(MobDef m)
        {
            if (m == null) return false;
            int extra = mobDeaths.TryGetValue(m.Id, out var n) ? n * 2 : 0;
            int lv = Level;
            if (m.Kind == "raid") return lv >= m.Lv + 10 + extra;
            if (m.IsBoss) return lv >= m.Lv + 4 + extra;
            if (m.IsElite) return lv >= m.Lv + extra;
            return lv >= m.Lv - FightAbove + extra;
        }

        // ---------------- 考える

        public void Play()
        {
            BuildIndex();
            while (true)
            {
                if (stopRequested != null) throw new BotStop(stopRequested);
                try { Think(); }
                catch (BotInterrupt e) { if (Verbose) Say("（" + e.Message + "）"); }
                MaybeSaveCheck();
            }
        }

        private double lastThinkSec = -1; private int sameSpotThinks;

        public void Think()
        {
            if (Math.Abs(Sec - lastThinkSec) < 0.01) { if (++sameSpotThinks > 30) { Note("stuck", "think", "考えても時間が進まない（" + DescribeHere() + "）"); Idle(600); sameSpotThinks = 0; } }
            else sameSpotThinks = 0;
            lastThinkSec = Sec;
            if (S.Quiz != null) { AnswerQuizNow(); return; }
            Upkeep();
            RestIfNeeded();
            if (!S.Body.OnGround) Settle();
            if (NeedTown()) { DoTown(); return; }
            thinkWatch.Start();
            dist = AllCosts();
            var plans = new List<Plan>();
            AddTurnIns(plans);
            AddObjectivePlans(plans);
            AddAcceptPlans(plans);
            thinkWatch.Stop();
            Thinks++;
            foreach (var p in plans)
            {
                if (planFails.TryGetValue(p.Key, out var f))
                {
                    if (planFailLevel.TryGetValue(p.Key, out var lvAt) && lvAt < Level - 1) { planFails.Remove(p.Key); continue; } // Lv が上がったらもう一度
                    p.Cost += 40 * f;
                }
            }
            plans.RemoveAll(p => planFails.TryGetValue(p.Key, out var f) && f >= 4);
            var best = plans.OrderBy(p => p.Cost).FirstOrDefault();
            if (best == null || best.Cost > 60)
            {
                // 転職のクエストは、失敗が続いても（4 回まで）薬をそろえてやり直す（試験の部屋で薬が尽きた時など）
                var job = plans.Where(p => p.Quest != null && p.Quest.StartsWith(JobQuestPrefix + "-")).OrderBy(p => p.Cost).FirstOrDefault();
                if (job != null && (CountPotions(true) >= 30 || S.Inventory.Meso >= PotionReserve())) best = job;
                else { Grind(); return; }
            }
            // 制限時間のある試験の部屋へ入る前に、薬をそろえる（中で尽きると出るしかなく、集めた物が消える）
            if (best.Map != null && D.Systems.Room(best.Map)?.Kind == RoomKind.Test && MapId != best.Map && CountPotions(true) < 80 && S.Inventory.Meso >= PotionReserve() / 2)
            {
                townCooldownUntil = 0;
                DoTown();
            }
            if (Verbose) Say("→ " + best.Desc + "（" + best.Cost.ToString("0") + "）");
            bool ok;
            double t0 = Sec;
            try { ok = best.Run(); }
            catch (BotInterrupt) { PlanFailed(best, "中断"); throw; }
            if (!ok) PlanFailed(best, "進まない");
            else planFails.Remove(best.Key);
        }

        private void PlanFailed(Plan p, string why)
        {
            planFails[p.Key] = planFails.TryGetValue(p.Key, out var f) ? f + 1 : 1;
            planFailLevel[p.Key] = Level;
            if (planFails[p.Key] == 4) Note("plan", p.Key, p.Desc + " が " + why + "（4 回。Lv" + Level + "・" + DescribeHere() + "）");
        }

        /// <summary>自分の系統のクエストか（J?-1 は line が無いので、ID の J1〜J5 で見る）。</summary>
        /// <summary>HP が少なく薬も無い時は、町で休む（宿屋か、止まって自然回復）。倒れて起き上がった直後もここ。</summary>
        public void RestIfNeeded() => Timed("rest", () => { RestInner(); return 0; });

        private void RestInner()
        {
            var c = S.Character;
            bool lowHp = c.Hp < S.Stats.MaxHp * 0.75 && CountPotions(true) < 3;
            bool lowMp = Line == "magician" && c.Mp < S.Stats.MaxMp * 0.3 && CountPotions(false) < 3; // 魔法使いは MP が無いと戦えない
            if (!lowHp && !lowMp) return;
            if (!S.Map.Data.IsTown)
            {
                string town = S.Map.Data.ReturnMap;
                if (town != null && RouteCost(town) < 12) GoToMap(town); // 外で休むと殴られる。町で休む
            }
            if (S.Map.Data.IsTown)
            {
                var inn = S.Map.Data.Npcs.FirstOrDefault(n => n.InnFee >= 0 && n.InnFee <= S.Inventory.Meso / 4);
                if (inn != null && MoveNearNpc(inn) && S.RestAtInn(inn.Id)) return;
            }
            Settle();
            for (int i = 0; i < 60 * 600 && (c.Hp < S.Stats.MaxHp * 0.95 || lowMp && c.Mp < S.Stats.MaxMp * 0.9); i += 60) Idle(60);
        }

        /// <summary>転職のクエストか、それに要る物（クイズの闇の水晶）をくれるクエスト。</summary>
        private bool JobRelevant(QuestDef q)
        {
            if (q.Id.StartsWith(JobQuestPrefix + "-")) return true;
            var need = D.Systems.Jobs.QuizNeedItems;
            return q.Rewards.Any(r => need.Contains(r.Item)) && !need.Where(i => i != "etc.M300").All(i => S.Inventory.Has(i));
        }

        private bool Mine(QuestDef q)
        {
            if (q.Line != null) return q.Line == Line;
            if (q.Id.Length >= 3 && q.Id[0] == 'J' && char.IsDigit(q.Id[1]) && q.Id[2] == '-') return q.Id.Substring(0, 2) == JobQuestPrefix;
            return true;
        }

        public string JobQuestPrefix => Line switch { "warrior" => "J1", "magician" => "J2", "bowman" => "J3", "thief" => "J4", _ => "J5" };

        private bool IslandBlocked(QuestDef q)
        {
            bool left = S.Flags.TryGetValue("leftIsland", out var b) && b;
            if (left && (q.Map?.StartsWith("S") ?? false) && D.GetMap(q.Map)?.Region == "S") return true;
            if (!left && D.GetMap(q.Map)?.Region != "S") return true; // 島にいる間は島のクエストだけ
            return false;
        }

        // ---------------- 報告

        private void AddTurnIns(List<Plan> plans)
        {
            foreach (var q in S.Quests.InProgress().ToList())
            {
                if (q.AutoComplete || !S.Quests.ObjectivesDone(q, S.Inventory)) continue;
                string map = NpcMap(q.End);
                double c = Dist(map);
                if (double.IsInfinity(c)) { if (!IslandBlocked(q)) Note("turnin", q.Id, q.Id + " の報告先 " + q.End + "（" + map + "）へ行けない"); continue; }
                var qq = q;
                plans.Add(new Plan
                {
                    Key = "turnin:" + q.Id, Quest = q.Id, Desc = q.Id + " を報告", Cost = c - 30,
                    Run = () =>
                    {
                        if (!GoToNpc(qq.End)) return false;
                        S.Talk(qq.End);
                        var r = S.CompleteQuest(qq.Id);
                        if (r == CompleteResult.InventoryFull) { inventoryFullSeen = true; DoTown(); r = S.CompleteQuest(qq.Id); }
                        if (r != CompleteResult.Ok) { Note("complete", qq.Id, qq.Id + " を報告できない: " + r); return false; }
                        AfterQuestDone(qq);
                        return true;
                    },
                });
            }
        }

        private void AfterQuestDone(QuestDef q)
        {
            Upkeep();
            WearBest();
            // 報酬で受け取った「使う物」（ペット・帰還の書など）はそのまま
        }

        // ---------------- 受ける

        private void AddAcceptPlans(List<Plan> plans)
        {
            int active = S.Quests.InProgress().Count(q => q.Line == null && !q.Id.StartsWith("J"));
            var byGiver = new Dictionary<string, List<QuestDef>>();
            foreach (var q in D.QuestList)
            {
                if (S.Quests.Status(q.Id) != QuestStatus.None || !Mine(q)) continue;
                if (JobOnly && !JobRelevant(q)) continue;
                if (S.Quests.CanStart(q.Id, S.Character) != StartResult.Ok) continue;
                if (IslandBlocked(q)) continue;
                bool job = q.Line != null || q.Id.StartsWith("J");
                if (!job && active >= MaxActiveQuests) continue;
                if (q.Id == "S-19" && !IslandDone()) continue;
                if (!Feasible(q, out var why)) continue;
                if (q.Giver == null) continue;
                if (!byGiver.TryGetValue(q.Giver, out var l)) byGiver[q.Giver] = l = new List<QuestDef>();
                l.Add(q);
            }
            foreach (var kv in byGiver)
            {
                string map = NpcMap(kv.Key);
                double c = Dist(map);
                if (double.IsInfinity(c)) continue;
                var list = kv.Value;
                string giver = kv.Key;
                bool job = list.Any(q => q.Id.StartsWith("J"));
                plans.Add(new Plan
                {
                    Key = "accept:" + giver + ":" + string.Join(",", list.Select(q => q.Id)), Quest = list[0].Id,
                    Desc = giver + " から " + string.Join("・", list.Select(q => q.Id)) + " を受ける",
                    Cost = c + (job ? -20 : 8) - list.Count,
                    Run = () =>
                    {
                        if (!GoToNpc(giver)) return false;
                        S.Talk(giver);
                        bool any = false;
                        foreach (var q in list)
                        {
                            if (q.Id == "S-19") AllowOneWayTravel = true;
                            var r = S.AcceptQuest(q.Id);
                            if (r == StartResult.Ok) { any = true; Say("受けた " + q.Id + " " + q.Name); }
                            else Note("accept", q.Id, q.Id + " を受けられない: " + r);
                        }
                        S.Talk(giver); // 話す目的（受け取る・届ける）が同じ人なら進む
                        foreach (var q in list)
                            if (S.Quests.Status(q.Id) == QuestStatus.InProgress && !q.AutoComplete && q.End == giver && S.Quests.ObjectivesDone(q, S.Inventory))
                                if (S.CompleteQuest(q.Id) == CompleteResult.Ok) AfterQuestDone(q);
                        return any;
                    },
                });
            }
        }

        private bool IslandDone()
        {
            foreach (var q in D.QuestList)
            {
                if (!q.Tutorial || q.Id == "S-19") continue;
                if (!S.Quests.IsCompleted(q.Id))
                {
                    // 今はできない（強すぎる）物が残っていても、Lv10 を越えたら島を出る（大陸で転職して強くなる）
                    bool feasibleNow = S.Quests.Status(q.Id) == QuestStatus.InProgress ? Feasible(q, out _) && !planFails.Any(kv => kv.Key.Contains(q.Id) && kv.Value >= 3)
                                       : S.Quests.CanStart(q.Id, S.Character) == StartResult.Ok && Feasible(q, out _);
                    bool startable = S.Quests.Status(q.Id) != QuestStatus.None || S.Quests.CanStart(q.Id, S.Character) == StartResult.Ok;
                    if (Level >= 10 && (!feasibleNow || !startable)) { Note("island", q.Id, "Lv" + Level + " で島のクエスト " + q.Id + " ができないまま島を出る"); continue; }
                    // STR で殴らない系統（魔法使い・弓使い・盗賊）は、初心者のうちは木の剣で弱い。島の強敵（S-17）は待たずに Lv10 で大陸へ行って転職する（人もそうする）
                    if (Level >= 10 && MainStat != Lumina.Core.Combat.Stat.STR && q.Objectives.Any(o => o.Type == ObjectiveType.Kill && D.Mob(o.Target)?.IsElite == true)) { Note("island", q.Id, "Lv" + Level + " で島の強敵（" + q.Id + "）は後回しにして島を出る"); continue; }
                    if (Level >= 14) { Note("island", q.Id, "Lv14 でも島のクエスト " + q.Id + " が終わらない（先に島を出る）"); continue; }
                    return false;
                }
            }
            return true;
        }

        // ---------------- できるか

        public bool Feasible(QuestDef q, out string why)
        {
            why = null;
            for (int i = 0; i < q.Objectives.Count; i++)
            {
                var o = q.Objectives[i];
                if (S.Quests.Status(q.Id) == QuestStatus.InProgress && S.Quests.Count(q, i, S.Inventory) >= o.Count) continue;
                if (!ObjectiveFeasible(q, o, out why)) return false;
            }
            return true;
        }

        private bool ObjectiveFeasible(QuestDef q, QuestObjective o, out string why)
        {
            why = null;
            switch (o.Type)
            {
                case ObjectiveType.Kill:
                    {
                        var m = D.Mob(o.Target);
                        if (m == null) { why = "敵 " + o.Target + " が無い"; return NoteNever(q, why); }
                        if (!CanFight(m)) { why = "強すぎる"; return false; }
                        if (BestMobMap(o.Target) == null) { why = "湧く所へ行けない"; return false; }
                        return true;
                    }
                case ObjectiveType.Collect:
                    {
                        if (S.Inventory.Count(o.Target) >= o.Count) return true;
                        return CollectSource(q, o.Target, out why) != null;
                    }
                case ObjectiveType.Talk:
                    return !double.IsInfinity(Dist(NpcMap(o.Target)));
                case ObjectiveType.Visit:
                    if (q.Id == "S-19") return true; // 島の船（片道）。受けてから乗る
                    return !double.IsInfinity(Dist(o.Target)) || D.Systems.Room(o.Target) != null && RoomReachable(o.Target);
                case ObjectiveType.Interact:
                    {
                        if (!objectMap.TryGetValue(o.Target, out var map)) { why = "調べる物 " + o.Target + " がどのマップにも無い"; return NoteNever(q, why); }
                        return !double.IsInfinity(Dist(map));
                    }
                case ObjectiveType.Event:
                    return EventFeasible(q, o.Target, o.Count, out why);
            }
            return false;
        }

        private bool NoteNever(QuestDef q, string why) { Note("never", q.Id, q.Id + ": " + why); return false; }

        private bool RoomReachable(string room) => !double.IsInfinity(Dist(room));

        /// <summary>敵が湧く所のうち、行けて一番近い所（部屋は入れる時だけ）。</summary>
        public string BestMobMap(string mobId)
        {
            BuildIndex();
            if (!mobMaps.TryGetValue(mobId, out var maps)) return null;
            string best = null; double bc = double.PositiveInfinity;
            foreach (var m in maps)
            {
                double c = Dist(m);
                if (D.Systems.Room(m) != null) c += 5;
                if (c < bc) { bc = c; best = m; }
            }
            return best;
        }

        /// <summary>品の手に入れ方（null = 無い）。"shop:<店>" / "drop:<敵>" / "craft:<作り方>"</summary>
        public string CollectSource(QuestDef q, string item, out string why)
        {
            why = null;
            BuildIndex();
            // 店
            foreach (var shop in ShopsSelling(item))
            {
                var e = ShopItems(shop).FirstOrDefault(x => x.Item == item);
                if (e != null && !double.IsInfinity(Dist(ShopLoc[shop].map)) && e.Price <= S.Inventory.Meso) return "shop:" + shop;
            }
            // 転職の試験で必ず落とす物
            foreach (var d in D.Systems.Jobs.QuestDrops)
                if (d.Item == item && (q == null || d.Quest == q.Id) && CanFight(D.Mob(d.Mob)) && BestMobMap(d.Mob) != null) return "drop:" + d.Mob;
            // 敵が落とす
            string bestMob = null; double bs = 0;
            if (dropMobs.TryGetValue(item, out var mobs))
            {
                foreach (var (mob, chance) in mobs)
                {
                    var def = D.Mob(mob);
                    if (!CanFight(def)) continue;
                    var map = BestMobMap(mob);
                    if (map == null) continue;
                    double s = chance / (1 + Dist(map) * 0.1);
                    if (s > bs) { bs = s; bestMob = mob; }
                }
            }
            if (bestMob != null) return "drop:" + bestMob;
            // 作る
            var rc = D.Systems.Crafts.Find(c => c.Out.Item == item);
            if (rc != null && rc.In.All(x => S.Inventory.Has(x.Item, x.Count)) && !double.IsInfinity(Dist(NpcMap(rc.Npc)))) return "craft:" + rc.Id;
            // 何も無い: 敵が落とす・店にあるのに強い/遠いだけなら Later
            bool anyDrop = mobs != null && mobs.Count > 0;
            bool anyShop = ShopLoc.Keys.Any(k => D.Shops[k].Items.Any(x => x.Item == item));
            bool reward = D.QuestList.Any(x => x.Rewards.Any(r => r.Item == item));
            bool craft = rc != null;
            if (!anyDrop && !anyShop && !craft && !reward && !D.Systems.Jobs.QuestDrops.Any(d => d.Item == item))
            {
                why = "品 " + item + " の手に入れ方が無い（落とす敵・店・製作・報酬のどれも無い）";
                if (q != null) NoteNever(q, why);
            }
            else if (!anyDrop && !anyShop && !craft && reward && q != null && S.Quests.Status(q.Id) == QuestStatus.InProgress)
            {
                // 前のクエストの報酬で、もう持っていない物
                var from = D.QuestList.Where(x => x.Rewards.Any(r => r.Item == item)).Select(x => x.Id).ToList();
                if (from.All(id => S.Quests.IsCompleted(id))) { why = "品 " + item + " は " + string.Join("/", from) + " の報酬だが持っていない"; NoteNever(q, why); }
            }
            else why = "品 " + item + " は今は手に入らない（強い・遠い）";
            return null;
        }

        private bool EventFeasible(QuestDef q, string ev, int count, out string why)
        {
            why = null;
            switch (ev)
            {
                case "quickslot_set":
                case "use_potion":
                case "ap_spent":
                case "sp_spent":
                case "skill_used":
                    return true;
                case "storage_deposit":
                case "storage_withdraw":
                    return StorageNpc() != null;
                case "pet_adopted":
                    return S.Inventory.Meso >= 12000 || S.Pets.Count > 0 || S.Inventory.All().Any(t => D.Item(t.item.ItemId)?.Pet != null);
                case "pet_fed":
                case "pet_closeness":
                    return S.Pets.Count > 0;
                case "boss_kill":
                    return BossTarget() != null;
                case "dungeon_clear":
                    return DungeonTarget(null) != null;
                case "job_advance.1":
                    return S.Character.CanAdvanceFirst(Line) == AdvanceResult.Ok || S.Character.Tier >= 1;
                case "job_advance.2":
                    return S.Inventory.Has(D.Systems.Jobs.Proof) || S.Character.Tier >= 2;
                case "quiz_cleared":
                    return D.Systems.Jobs.QuizNeedItems.All(i => S.Inventory.Has(i)) || D.Systems.Jobs.QuizNeedItems.All(i => i == "etc.M300" || CollectSource(null, i, out _) != null || S.Inventory.Has(i));
            }
            if (ev.StartsWith("dungeon_clear.")) return DungeonTarget(ev.Substring("dungeon_clear.".Length)) != null;
            why = "知らない操作 " + ev;
            return NoteNever(q, why);
        }

        // ---------------- 目的を進める

        private void AddObjectivePlans(List<Plan> plans)
        {
            foreach (var q in S.Quests.InProgress().ToList())
            {
                for (int i = 0; i < q.Objectives.Count; i++)
                {
                    var o = q.Objectives[i];
                    if (S.Quests.Count(q, i, S.Inventory) >= o.Count) continue;
                    var p = ObjectivePlan(q, i, o);
                    if (p != null) plans.Add(p);
                }
            }
        }

        private Func<bool> CountDone(QuestDef q, int i) => () => S.Quests.Status(q.Id) != QuestStatus.InProgress || S.Quests.Count(q, i, S.Inventory) >= q.Objectives[i].Count;

        private Plan ObjectivePlan(QuestDef q, int i, QuestObjective o)
        {
            string key = "obj:" + q.Id + ":" + i;
            var done = CountDone(q, i);
            switch (o.Type)
            {
                case ObjectiveType.Kill:
                    {
                        var m = D.Mob(o.Target);
                        if (!CanFight(m)) return null;
                        string map = BestMobMap(o.Target);
                        if (map == null) return null;
                        return new Plan { Key = key, Quest = q.Id, Desc = q.Id + ": " + m.Name + " を倒す（" + map + "）", Cost = Dist(map) + 2 + NoPotionPenalty(m), Map = map, Run = () => HuntFor(map, o.Target, done, 1200) };
                    }
                case ObjectiveType.Collect:
                    {
                        string src = CollectSource(q, o.Target, out _);
                        if (src == null) return null;
                        if (src.StartsWith("shop:"))
                        {
                            string shop = src.Substring(5);
                            var (map, npc) = ShopLoc[shop];
                            return new Plan
                            {
                                Key = key, Quest = q.Id, Desc = q.Id + ": " + o.Target + " を店で買う", Cost = Dist(map) + 1,
                                Run = () =>
                                {
                                    if (!GoToNpc(npc)) return false;
                                    int need = o.Count - S.Inventory.Count(o.Target);
                                    return need <= 0 || S.Buy(shop, o.Target, need) == ShopResult.Ok;
                                },
                            };
                        }
                        if (src.StartsWith("craft:"))
                        {
                            var rc = D.Systems.Crafts.Find(c => c.Id == src.Substring(6));
                            return new Plan { Key = key, Quest = q.Id, Desc = q.Id + ": " + o.Target + " を作る", Cost = Dist(NpcMap(rc.Npc)) + 1, Run = () => GoToNpc(rc.Npc) && S.Craft(rc.Npc, rc.Id) == CraftResult.Ok };
                        }
                        string mob = src.Substring(5);
                        string mm = BestMobMap(mob);
                        return new Plan { Key = key, Quest = q.Id, Desc = q.Id + ": " + o.Target + " を集める（" + mob + "・" + mm + "）", Cost = Dist(mm) + 3 + NoPotionPenalty(D.Mob(mob)), Map = mm, Run = () => HuntFor(mm, mob, done, 1200) };
                    }
                case ObjectiveType.Talk:
                    {
                        string map = NpcMap(o.Target);
                        if (double.IsInfinity(Dist(map))) return null;
                        return new Plan { Key = key, Quest = q.Id, Desc = q.Id + ": " + o.Target + " と話す", Cost = Dist(map), Run = () => { if (!GoToNpc(o.Target)) return false; S.Talk(o.Target); return done(); } };
                    }
                case ObjectiveType.Visit:
                    {
                        if (double.IsInfinity(Dist(o.Target))) return null;
                        return new Plan
                        {
                            Key = key, Quest = q.Id, Desc = q.Id + ": " + o.Target + " へ行く", Cost = Dist(o.Target),
                            Run = () => { bool ok = GoToMap(o.Target); AllowOneWayTravel = false; return ok && done(); },
                        };
                    }
                case ObjectiveType.Interact:
                    {
                        if (!objectMap.TryGetValue(o.Target, out var map) || double.IsInfinity(Dist(map))) return null;
                        return new Plan { Key = key, Quest = q.Id, Desc = q.Id + ": " + o.Target + " を調べる", Cost = Dist(map), Run = () => InteractWith(map, o.Target) && done() };
                    }
                case ObjectiveType.Event:
                    return EventPlan(q, i, o, key, done);
            }
            return null;
        }

        /// <summary>そのマップへ行って、その敵を狩る。</summary>
        public bool HuntFor(string map, string mobId, Func<bool> done, double maxSec)
        {
            if (!GoToMap(map)) return false;
            lastEngagedMob = mobId;
            var def = D.Mob(mobId);
            // 時間で湧く強敵・ボス: いなければ少し待つ
            double t0 = Sec;
            bool timed = S.Map.Data.TimedSpawns.Any(t => t.Mob == mobId) && !S.Map.Data.Spawns.Any(t => t.Mob == mobId);
            if (timed && !S.Map.Mobs.Any(m => m.Alive && m.Def.Id == mobId))
            {
                double wait = S.Map.Data.TimedSpawns.Where(t => t.Mob == mobId).Min(t => t.IntervalSec);
                if (wait > 1200 && D.Systems.Room(map) == null) { Note("timed", mobId, def.Name + "（" + map + "）が湧くまで " + wait + " 秒"); }
                while (!S.Map.Mobs.Any(m => m.Alive && m.Def.Id == mobId) && Sec - t0 < Math.Min(wait + 5, 1300)) Idle(60);
            }
            int before = S.Quests.Entries.Values.Sum(e => e.Counts.Values.Sum()) + S.Inventory.All().Sum(t => t.item.Count);
            HuntHere(m => m.Def.Id == mobId || (Level - m.Def.Lv < 12 && CanFight(m.Def) && !m.Def.IsBoss && NearbyOnly(m)), done, maxSec);
            lastEngagedMob = null;
            int after = S.Quests.Entries.Values.Sum(e => e.Counts.Values.Sum()) + S.Inventory.All().Sum(t => t.item.Count);
            return done() || after > before;
        }

        private bool NearbyOnly(Mob m) => Math.Abs(m.X - S.Body.X) < 120 && Math.Abs(m.Y - S.Body.Y) < 40; // 通り道の敵も倒す

        public bool InteractWith(string map, string objectId)
        {
            if (!GoToMap(map)) return false;
            var o = S.Map.Data.Objects.FirstOrDefault(x => x.Id == objectId);
            if (o == null) return false;
            if (!MoveToPoint(o.X, o.Y, 20)) { Note("reach", map + ":" + objectId, map + " の " + o.Name + "（" + objectId + "）の前まで行けない（" + DescribeHere() + "）"); return false; }
            Frame(new PlayerInput { InteractPressed = true });
            Idle(3);
            if (S.Quiz != null) AnswerQuizNow();
            return true;
        }

        private void AnswerQuizNow()
        {
            // 賢者の石のクイズ: このゲームの町・人・決まりを知っている人として答える（正解を選ぶ）
            for (int guard = 0; guard < 20 && S.Quiz != null; guard++)
            {
                var c = S.Quiz.Current;
                if (c == null) break;
                S.AnswerQuiz(c.Answer);
                Idle(30);
            }
        }

        // ---------------- 操作の目的

        private NpcData StorageNpc()
        {
            NpcData best = null; double bc = double.PositiveInfinity;
            foreach (var id in D.MapIds)
                foreach (var n in D.GetMap(id).Npcs)
                    if (n.Role == "storage") { double c = Dist(id); if (c < bc) { bc = c; best = n; } }
            return best;
        }

        private string BossTarget()
        {
            string best = null; double bc = double.PositiveInfinity;
            foreach (var m in D.Mobs.Values)
            {
                if (!m.IsBoss || !CanFight(m)) continue;
                var map = BestMobMap(m.Id);
                if (map == null) continue;
                double c = Dist(map);
                if (c < bc) { bc = c; best = m.Id; }
            }
            return best;
        }

        private RoomRule DungeonTarget(string map)
        {
            foreach (var r in D.Systems.Rooms.Values)
            {
                if (r.Kind != RoomKind.Dungeon) continue;
                if (map != null && r.Map != map) continue;
                if (S.CanEnterRoom(r.Map) != RoomEntryResult.Ok || double.IsInfinity(Dist(r.Map))) continue;
                if (!CanFight(D.Mob(r.ClearMob))) continue;
                return r;
            }
            return null;
        }

        private Plan EventPlan(QuestDef q, int i, QuestObjective o, string key, Func<bool> done)
        {
            Plan P(string desc, double cost, Func<bool> run) => new Plan { Key = key, Quest = q.Id, Desc = q.Id + ": " + desc, Cost = cost, Run = run };
            switch (o.Target)
            {
                case "quickslot_set":
                    return P("クイックスロットに置く", 0, () => { var pot = BestPotion(true) ?? "use.red_potion"; S.SetQuickSlot(0, "item", pot); return done(); });
                case "use_potion":
                    return P("薬を使う", 0, () =>
                    {
                        var pot = BestPotion(true);
                        if (pot == null) return false;
                        Frame(new PlayerInput { ItemPressed = pot });
                        return done();
                    });
                case "ap_spent":
                case "sp_spent":
                    // Lv が上がって振るのを待つ（狩り）
                    return P(o.Target + " のため Lv を上げる", 30, () => { int lv = Level; Grind(); return Level > lv || done(); });
                case "skill_used":
                    return P("スキルを使う", 0, () =>
                    {
                        AllocateSp();
                        var sk = S.Skills.Learned().Where(t => t.def.IsActive).Select(t => t.def).FirstOrDefault();
                        if (sk == null) return false;
                        Settle();
                        Frame(new PlayerInput { SkillPressed = sk.Id });
                        Idle(60);
                        return done();
                    });
                case "storage_deposit":
                case "storage_withdraw":
                    {
                        var n = StorageNpc();
                        if (n == null) return null;
                        string map = NpcMap(n.Id);
                        return P("倉庫", Dist(map), () =>
                        {
                            if (!GoToNpc(n.Id)) return false;
                            if (S.Inventory.Meso < 300) return false;
                            if (o.Target == "storage_deposit")
                            {
                                var it = S.Inventory.All().FirstOrDefault(t => t.tab == InvTab.Use && !D.Item(t.item.ItemId).Quest);
                                if (it.item == null) return false;
                                var r = S.StorageDeposit(n.Id, it.tab, it.slot, 1);
                                if (r != StorageResult.Ok) { Note("storage", "deposit", "倉庫に預けられない: " + r); return false; }
                            }
                            else
                            {
                                if (S.Storage.Items.Count == 0)
                                {
                                    var it = S.Inventory.All().FirstOrDefault(t => t.tab == InvTab.Use && !D.Item(t.item.ItemId).Quest);
                                    if (it.item != null) S.StorageDeposit(n.Id, it.tab, it.slot, 1);
                                }
                                var r = S.StorageWithdraw(n.Id, 0);
                                if (r != StorageResult.Ok) { Note("storage", "withdraw", "倉庫から出せない: " + r); return false; }
                            }
                            return done();
                        });
                    }
                case "pet_adopted":
                    return P("ペットを迎える", Dist("V200") + 5, () =>
                    {
                        var petItem = S.Inventory.All().FirstOrDefault(t => D.Item(t.item.ItemId)?.Pet != null).item?.ItemId;
                        if (petItem == null)
                        {
                            var shop = ShopLoc.FirstOrDefault(kv => D.Shops[kv.Key].Items.Any(x => D.Item(x.Item)?.Pet != null));
                            if (shop.Key == null || !GoToNpc(shop.Value.npc)) return false;
                            var e = ShopItems(shop.Key).Where(x => D.Item(x.Item)?.Pet != null).OrderBy(x => x.Price).FirstOrDefault();
                            if (e == null || S.Buy(shop.Key, e.Item, 1) != ShopResult.Ok) return false;
                            S.Buy(shop.Key, "use.pet_food", 20);
                            petItem = e.Item;
                        }
                        S.UseItem(petItem);
                        return done();
                    });
                case "pet_fed":
                    return P("ペットに餌", Dist("V200") + 5, () =>
                    {
                        if (!S.Inventory.Has("use.pet_food"))
                        {
                            var shop = ShopLoc.FirstOrDefault(kv => D.Shops[kv.Key].Items.Any(x => x.Item == "use.pet_food"));
                            if (shop.Key == null || !GoToNpc(shop.Value.npc)) return false;
                            S.Buy(shop.Key, "use.pet_food", 30);
                        }
                        for (int k = 0; k < 5 && !done(); k++) { S.FeedPet(0); Idle(60 * 40); }
                        return done();
                    });
                case "pet_closeness":
                    // 連れて歩いて餌をやっていれば進む（狩りの間に）
                    return P("ペットの親密度（狩りながら）", 45, () => { int lv = Level; Grind(); return true; });
                case "boss_kill":
                    {
                        var b = BossTarget();
                        if (b == null) return null;
                        string map = BestMobMap(b);
                        return P("ボス " + b + " を倒す（" + map + "）", Dist(map) + 5, () => HuntFor(map, b, done, 1800));
                    }
                case "job_advance.1":
                    return P("1 次転職（" + Line + "）", Dist(NpcMap(q.Giver)) - 20, () =>
                    {
                        if (!GoToNpc(q.Giver)) return false;
                        var r = S.AdvanceJob(Line, q.Giver);
                        if (r != AdvanceResult.Ok) { Note("advance", "1", "1 次転職できない: " + r); return false; }
                        AfterAdvanceBot();
                        return done();
                    });
                case "job_advance.2":
                    return P("2 次転職（枝 " + Branch + "）", Dist(NpcMap(q.Giver)) - 20, () =>
                    {
                        if (!GoToNpc(q.Giver)) return false;
                        var r = S.AdvanceJob2(Branch);
                        if (r != AdvanceResult.Ok) { Note("advance", "2", "2 次転職できない: " + r); return false; }
                        AfterAdvanceBot();
                        return done();
                    });
                case "quiz_cleared":
                    {
                        string stone = D.Systems.Jobs.QuizStone;
                        if (stone == null || !objectMap.TryGetValue(stone, out var map)) return null;
                        foreach (var need in D.Systems.Jobs.QuizNeedItems)
                            if (!S.Inventory.Has(need)) return null; // 品集めは別の目的・別のクエスト（N-14 の闇の水晶など）
                        return P("賢者の石のクイズ", Dist(map) - 10, () => InteractWith(map, stone) && done());
                    }
            }
            if (o.Target == "dungeon_clear" || o.Target.StartsWith("dungeon_clear."))
            {
                var r = DungeonTarget(o.Target == "dungeon_clear" ? null : o.Target.Substring("dungeon_clear.".Length));
                if (r == null) return null;
                return P("ダンジョン " + r.Map + " をクリア", Dist(r.Map) + 5, () => ClearDungeon(r) && done());
            }
            return null;
        }

        private void AfterAdvanceBot()
        {
            Upkeep();
            DoTown(); // 新しい職の武器・弾を買う
        }

        /// <summary>1 人用ダンジョンに入り、中の敵を倒しながら主（clearMob）を倒す。</summary>
        public bool ClearDungeon(RoomRule r)
        {
            if (!GoToMap(r.Map)) return false;
            lastEngagedMob = r.ClearMob;
            double t0 = Sec;
            while (!S.RoomCleared && Sec - t0 < Math.Max(60, r.TimeSec - 30))
            {
                HuntHere(m => true, () => S.RoomCleared, 120);
                if (S.RoomCleared) break;
                // 部屋の中のポータル（次の部屋）へ
                var md = S.Map.Data;
                var inner = md.Portals.Where(p => p.IsEnterable && p.To == null && p.ToPortal != null).ToList();
                if (inner.Count == 0) continue;
                var p = inner[(int)((Sec / 60) % inner.Count)];
                if (MoveToPoint(p.X, p.Y, 1.5)) Frame(new PlayerInput { UpPressed = true });
            }
            lastEngagedMob = null;
            if (!S.RoomCleared) Note("dungeon", r.Map, r.Map + " をクリアできない（Lv" + Level + "）");
            return S.RoomCleared;
        }

        // ---------------- 狩り（何もすることが無い時）

        private readonly Dictionary<string, int> grindDeathsAtLevel = new Dictionary<string, int>();

        public string BestGrindMap()
        {
            return BestGrindMap(true) ?? BestGrindMap(false);
        }

        /// <summary>strict = false: 倒せる敵だけの所が無い時、一番弱い敵の所（自分の Lv+2 まで）。</summary>
        private string BestGrindMap(bool strict)
        {
            string best = null; double bs = double.PositiveInfinity;
            bool left = S.Flags.TryGetValue("leftIsland", out var b) && b;
            foreach (var id in D.MapIds)
            {
                var md = D.GetMap(id);
                if (md.IsTown || md.Spawns.Count == 0 || D.Systems.Room(id) != null) continue;
                if (!left && md.Region != "S") continue;
                double c = Dist(id);
                if (double.IsInfinity(c)) continue;
                var mobs = md.Spawns.Select(s => D.Mob(s.Mob)).Where(m => m != null).ToList();
                if (mobs.Count == 0) continue;
                if (strict ? mobs.Any(m => !CanFight(m)) : mobs.Max(m => m.Lv) > Level + 2) continue;
                double avg = mobs.Average(m => m.Lv);
                double target = Level - (Broke ? 11 : CountPotions(true) < 5 ? 8 : GrindBelow); // 薬が無い時は弱い所で（お金も無い時はもっと弱い所で稼ぐ）
                double score = Math.Abs(avg - target) * 3 + c * 0.6 - Math.Min(md.Spawns.Count, 12) * 0.5;
                if (avg > Level) score += 10;
                bool melee = Line == "warrior" || Line == "pirate";
                if (melee) score += mobs.Count(m => m.Move == MobMove.Fly) * 6.0 / mobs.Count; // 近接は飛ぶ敵が苦手
                score += mobs.Count(m => m.Attacks.Count > 0 || m.Ranged || m.Magic) * 3.0 / mobs.Count; // 技・飛び道具の敵は痛い
                if (DeathsByMap.TryGetValue(id, out var dn)) score += dn * 4;
                if (score < bs) { bs = score; best = id; }
            }
            return best;
        }

        public void Grind()
        {
            dist ??= AllCosts();
            string map = BestGrindMap();
            if (map == null && mobDeaths.Count > 0) { foreach (var k in mobDeaths.Keys.ToList()) if (--mobDeaths[k] <= 0) mobDeaths.Remove(k); map = BestGrindMap(); } // 倒れた記録を少し忘れてもう一度
            if (map == null) { Note("grind", "lv" + Level, "Lv" + Level + " で狩る所が無い（" + DescribeHere() + "）"); Idle(600); return; }
            if (Verbose) Say("狩り: " + map + "（" + string.Join(",", D.GetMap(map).Spawns.Select(x => x.Mob).Distinct().Select(x => x + " Lv" + D.Mob(x).Lv)) + "）");
            if (!GoToMap(map)) { Idle(60); return; }
            int lv = Level;
            Timed("grind", () => { HuntHere(m => CanFight(m.Def) && !m.Def.IsBoss, () => Level > lv, 900); return 0; });
        }
    }
}
