// クエストの定義（Data/quests.json）。QUESTS.md の決まり。
// 目的の種類: kill（倒す）/ collect（集める＝持ち物にある数）/ talk（話す）/ visit（行く）/ interact（調べる）/ event（操作をする）
// event の名前は Data/tools/quest_goals.mjs の先頭（GameSession.QuestEvent で知らせる）。
// minStats: 受ける条件の能力値（転職のクエスト「STR35 以上で話す」など）。
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
        /// <summary>受けられる系統（転職の 2 段目から。warrior など）。null ならだれでも</summary>
        public string Line;
        /// <summary>完了すると転職する段階（3 / 4。JOBS.md 3-3・3-4）。0 = しない</summary>
        public int Advance;
        /// <summary>完了すると開く物（storage+4 = 倉庫の枠 +4、pet.second = ペットを 2 匹）</summary>
        public string Unlock;
        public readonly List<string> Prereqs = new List<string>();
        public readonly List<QuestObjective> Objectives = new List<QuestObjective>();
        public readonly List<QuestReward> Rewards = new List<QuestReward>();
        /// <summary>受ける条件の能力値（"STR" → 35 など。AP で振った素の値で比べる）</summary>
        public readonly Dictionary<string, int> MinStats = new Dictionary<string, int>();

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
                Line = J.Str(d, "line"), Advance = J.Int(d, "advance"), Unlock = J.Str(d, "unlock"),
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
            var ms = J.Obj(d, "minStats");
            if (ms != null) foreach (var kv in ms) q.MinStats[kv.Key] = (int)J.ToDouble(kv.Value);
            foreach (var o in J.Arr(d, "rewards"))
            {
                var rd = (Dictionary<string, object>)o;
                q.Rewards.Add(new QuestReward { Item = J.Str(rd, "item"), Count = J.Int(rd, "count", 1) });
            }
            return q;
        }
    }
}
