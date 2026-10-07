// 窓の中身（JS の窓が読む）と NPC の会話。数フレームに 1 回・操作の後に呼ぶので Dictionary で組んで Json.Serialize。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Skills;
using Lumina.Core.Util;

namespace Lumina.Web
{
    public static class Ui
    {
        public static Dictionary<string, object> D(params (string k, object v)[] kv)
        {
            var d = new Dictionary<string, object>();
            foreach (var (k, v) in kv) d[k] = v;
            return d;
        }

        public static string Obj(params (string k, object v)[] kv) => Json.Serialize(D(kv));

        public static Dictionary<string, object> Item(ItemInstance it)
        {
            if (it == null) return null;
            var d = D(("id", it.ItemId), ("n", it.Count));
            if (it.Stats != null) { d["st"] = it.Stats.ToDict(); d["left"] = it.UpgradesLeft; d["upg"] = it.Upgraded; if (it.Quality) d["q"] = true; }
            return d;
        }

        public static string Build(GameSession s)
        {
            var c = s.Character;
            var st = s.Stats;
            var inv = new List<object>();
            for (int t = 0; t < 5; t++)
            {
                var tab = new List<object>();
                for (int i = 0; i < s.Inventory.SlotCount((InvTab)t); i++) tab.Add(Item(s.Inventory.Get((InvTab)t, i)));
                inv.Add(tab);
            }
            var eq = new Dictionary<string, object>();
            foreach (var kv in s.Equipment.All) eq[ItemEnums.SlotKey(kv.Key)] = Item(kv.Value);

            var skills = new List<object>();
            foreach (var sk in s.Data.SkillList)
            {
                if (!SkillBook.JobMatches(sk, c)) continue;
                if (sk.Tier > c.Tier + 1) continue; // 次の段階までは見せる（まだ覚えられない理由つき）
                int lv = s.Skills.Level(sk.Id);
                var can = s.Skills.CanLearn(sk.Id, c);
                skills.Add(D(("id", sk.Id), ("lv", lv), ("max", s.Skills.MaxLevel(sk)), ("tier", sk.Tier), ("can", can.ToString()),
                    ("cd", Math.Round(s.Skills.CooldownLeft(sk.Id), 1)), ("passive", sk.Kind == SkillKind.Passive), ("mp", lv > 0 ? s.SkillMpCost(sk, lv) : 0)));
            }

            var quick = new List<object>();
            for (int i = 0; i < GameSession.QuickSlotCount; i++)
            {
                var q = s.QuickSlots[i];
                if (q == null) { quick.Add(null); continue; }
                var d = D(("kind", q.Kind), ("id", q.Id));
                if (q.Kind == "item") d["n"] = s.Inventory.Count(q.Id);
                else { d["cd"] = Math.Round(s.Skills.CooldownLeft(q.Id), 1); d["lv"] = s.Skills.Level(q.Id); }
                quick.Add(d);
            }

            var active = new List<object>();
            int done = 0;
            foreach (var kv in s.Quests.Entries)
            {
                if (kv.Value.Status == QuestStatus.Completed) { done++; continue; }
                var q = s.Data.Quest(kv.Key);
                if (q != null) active.Add(Quest(s, q));
            }

            var buffs = new List<object>();
            foreach (var bf in s.Buffs.List) buffs.Add(D(("id", bf.Id), ("name", bf.Name), ("rem", Math.Round(bf.Remaining, 1)), ("total", Math.Round(bf.Total, 1))));
            var status = new List<object>();
            foreach (var se in s.Status.Active) status.Add(D(("kind", se.Kind.ToString()), ("ratio", Math.Round(se.Ratio, 2))));

            var stats = D(("str", st.Str), ("dex", st.Dex), ("int", st.Int), ("luk", st.Luk), ("watk", st.Watk), ("matk", st.Matk), ("wdef", st.Wdef), ("mdef", st.Mdef),
                ("acc", Math.Round(st.Acc, 1)), ("avoid", Math.Round(st.Avoid, 1)), ("speed", st.Speed), ("jump", st.Jump), ("min", st.Range.Min), ("max", st.Range.Max),
                ("crit", Math.Round(st.CritRate * 100, 1)), ("weapon", st.WeaponType), ("ammo", st.AmmoItem));

            var lines = new List<object>();
            foreach (var l in JobLine.FirstJobs) lines.Add(D(("line", l), ("can", c.CanAdvanceFirst(l).ToString()), ("npc", s.InstructorOf(l))));

            var d2 = D(("name", c.Name), ("line", c.Line), ("tier", c.Tier), ("branch", c.Branch), ("job", c.JobName), ("lv", c.Level), ("exp", c.Exp), ("next", c.ExpToNext),
                ("hp", c.Hp), ("mp", c.Mp), ("maxhp", st.MaxHp), ("maxmp", st.MaxMp), ("ap", c.Ap), ("sp", new List<object> { c.Sp[0], c.Sp[1], c.Sp[2], c.Sp[3], c.Sp[4] }),
                ("base", D(("str", c.Str), ("dex", c.Dex), ("int", c.Int), ("luk", c.Luk))), ("stats", stats), ("meso", s.Inventory.Meso),
                ("inv", inv), ("eq", eq), ("skills", skills), ("quick", quick), ("quests", active), ("done", done), ("buffs", buffs), ("status", status),
                ("map", s.Map.Data.Id), ("mapName", s.Map.Data.Name), ("play", Math.Round(s.PlaySec)), ("lines", lines), ("sitting", s.Sitting),
                ("dead", s.Dead), ("storage", D(("slots", s.Storage.Slots), ("meso", s.Storage.Meso), ("items", StorageItems(s)))),
                ("pets", Pets(s)));
            return Json.Serialize(d2);
        }

        private static List<object> StorageItems(GameSession s)
        {
            var l = new List<object>();
            foreach (var it in s.Storage.Items) l.Add(Item(it));
            return l;
        }

        private static List<object> Pets(GameSession s)
        {
            var l = new List<object>();
            foreach (var p in s.Pets) l.Add(D(("kind", p.Kind), ("name", p.Name), ("full", p.Fullness), ("out", p.Out)));
            return l;
        }

        public static Dictionary<string, object> Quest(GameSession s, QuestDef q)
        {
            var objs = new List<object>();
            for (int i = 0; i < q.Objectives.Count; i++)
            {
                var o = q.Objectives[i];
                objs.Add(D(("type", o.Type.ToString()), ("target", o.Target), ("label", o.Label), ("need", o.Count), ("have", s.Quests.Status(q.Id) == QuestStatus.InProgress ? s.Quests.Count(q, i, s.Inventory) : 0)));
            }
            var rewards = new List<object>();
            foreach (var r in q.Rewards) rewards.Add(D(("item", r.Item), ("n", r.Count)));
            return D(("id", q.Id), ("name", q.Name), ("giver", q.GiverName), ("end", q.End), ("goal", q.GoalText), ("story", q.Story), ("exp", q.Exp), ("meso", q.Meso),
                ("lv", q.MinLevel), ("objs", objs), ("rewards", rewards), ("rewardText", q.RewardText),
                ("done", s.Quests.Status(q.Id) == QuestStatus.InProgress && s.Quests.ObjectivesDone(q, s.Inventory)));
        }

        private static List<object> Quests(GameSession s, List<QuestDef> l)
        {
            var r = new List<object>();
            foreach (var q in l) r.Add(Quest(s, q));
            return r;
        }

        public static string Dialog(GameSession s, NpcDialog d)
        {
            if (d == null) return "null";
            var n = d.Npc;
            var c = s.Character;
            var o = D(("npc", n.Id), ("name", n.Name), ("role", d.Role),
                ("available", Quests(s, d.Available)), ("completable", Quests(s, d.Completable)), ("inProgress", Quests(s, d.InProgress)));
            if (d.Shop != null)
            {
                var items = new List<object>();
                foreach (var e in s.ShopItems(d.Shop)) items.Add(D(("item", e.Item), ("price", e.Price), ("bundle", e.Bundle)));
                o["shop"] = d.Shop; o["shopItems"] = items; o["recharge"] = d.ShopRecharge;
            }
            if (d.InnFee >= 0) o["inn"] = d.InnFee;
            if (d.Travel != null) o["travel"] = D(("to", d.Travel.To), ("fee", d.Travel.Fee), ("minLv", d.Travel.MinLevel));
            if (d.Taxi != null)
            {
                var l = new List<object>();
                foreach (var t in d.Taxi.Dests) l.Add(D(("to", t.To), ("fee", s.TaxiFee(n.Id, t.To))));
                o["taxi"] = l;
            }
            if (d.Storage) o["storage"] = true;
            if (d.Crafts.Count > 0)
            {
                var l = new List<object>();
                foreach (var r in d.Crafts)
                {
                    var ins = new List<object>();
                    foreach (var i in r.In) ins.Add(D(("item", i.Item), ("n", i.Count)));
                    l.Add(D(("id", r.Id), ("out", r.Out.Item), ("n", r.Out.Count), ("fee", r.Fee), ("in", ins)));
                }
                o["crafts"] = l;
            }
            // 転職官: 1 次（初心者の時）・2 次（1 次の系統が同じ時。試験の証と枝）
            foreach (var line in JobLine.FirstJobs)
            {
                if (s.InstructorOf(line) != n.Id) continue;
                var job = D(("line", line), ("name", Jobs.Get(line).Name));
                if (c.Tier == 0) job["first"] = c.CanAdvanceFirst(line).ToString();
                if (c.Tier == 1 && c.Line == line)
                {
                    job["second"] = D(("names", new List<object>(Jobs.Get(line).Tier2Names ?? new string[0])), ("lv", s.Data.Systems.Jobs.Tier2Level), ("proof", s.Inventory.Has(s.Data.Systems.Jobs.Proof)));
                }
                o["job"] = job;
            }
            return Json.Serialize(o);
        }
    }
}
