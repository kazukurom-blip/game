// クエストの定義（Data/quests.json）。QUESTS.md の決まり。
// 目的の種類: kill（倒す）/ collect（集める＝持ち物にある数）/ talk（話す）/ visit（行く）/ interact（調べる）/ event（操作をする）
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Quests
{
    public enum ObjectiveType { Kill, Collect, Talk, Visit, Interact, Event }

    public sealed class QuestObjective
    {
        public ObjectiveType Type;
        public string Target;   // 敵の ID / アイテムの ID / NPC の ID / マップの ID / 調べる物の ID / 操作の名前
        public int Count = 1;
        public string Label;

        public string Key => Type + ":" + Target;
    }

    public sealed class QuestReward { public string Item; public int Count = 1; }

    public sealed class QuestDef
    {
        public string Id, Name, Giver, GiverName, Map, Size, GoalText, End, RewardText, Story;
        public int MinLevel;
        public long Exp, Meso;
        public bool Tutorial;
        public readonly List<string> Prereqs = new List<string>();
        public readonly List<QuestObjective> Objectives = new List<QuestObjective>();
        public readonly List<QuestReward> Rewards = new List<QuestReward>();

        /// <summary>目的を果たしたら、NPC に話さなくても完了する</summary>
        public bool AutoComplete => End == "auto";

        public static ObjectiveType ParseType(string s)
        {
            switch (s)
            {
                case "kill": return ObjectiveType.Kill;
                case "collect": return ObjectiveType.Collect;
                case "talk": return ObjectiveType.Talk;
                case "visit": return ObjectiveType.Visit;
                case "interact": return ObjectiveType.Interact;
                default: return ObjectiveType.Event;
            }
        }

        public static QuestDef FromDict(Dictionary<string, object> d)
        {
            var q = new QuestDef
            {
                Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Giver = J.Str(d, "giver"), GiverName = J.Str(d, "giverName", ""),
                Map = J.Str(d, "map"), Size = J.Str(d, "size"), GoalText = J.Str(d, "goalText", ""), End = J.Str(d, "end"),
                RewardText = J.Str(d, "rewardText", ""), Story = J.Str(d, "story", ""), MinLevel = J.Int(d, "minLevel", 1),
                Exp = J.Long(d, "exp"), Meso = J.Long(d, "meso"), Tutorial = J.Bool(d, "tutorial"),
            };
            if (q.End == null) q.End = q.Giver;
            q.Prereqs.AddRange(J.StrList(d, "prereqs"));
            foreach (var o in J.Arr(d, "objectives"))
            {
                var od = (Dictionary<string, object>)o;
                var type = ParseType(J.Str(od, "type"));
                string target;
                switch (type)
                {
                    case ObjectiveType.Kill: target = J.Str(od, "mob"); break;
                    case ObjectiveType.Collect: target = J.Str(od, "item"); break;
                    case ObjectiveType.Talk: target = J.Str(od, "npc"); break;
                    case ObjectiveType.Visit: target = J.Str(od, "map"); break;
                    case ObjectiveType.Interact: target = J.Str(od, "target"); break;
                    default: target = J.Str(od, "event"); break;
                }
                q.Objectives.Add(new QuestObjective { Type = type, Target = target, Count = J.Int(od, "count", 1), Label = J.Str(od, "label") });
            }
            foreach (var o in J.Arr(d, "rewards"))
            {
                var rd = (Dictionary<string, object>)o;
                q.Rewards.Add(new QuestReward { Item = J.Str(rd, "item"), Count = J.Int(rd, "count", 1) });
            }
            return q;
        }
    }
}
