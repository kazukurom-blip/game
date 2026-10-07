// NPC のセリフ（話しかけるたびに変わる一言）と、進めているクエストの残りの一言。
// セリフのデータ: Data/tools/world/npc_lines.mjs → npcs.json の "lines"（文字列の配列）→ NpcDef.Lines / NpcData.Lines。
//
// 1 行の書き方:
//   "ふつうの一言"                         … いつでも言う
//   "[tier>=1]すっかり一人前だね。"         … 先頭の [条件] が合う時だけ言う（合う物を先に言う）
// 条件（, で区切ると全部が合う時）:
//   lv>=N / lv<N / tier>=N / tier=N / line=warrior（系統）/ done=S-01（クリアした）/ !done=S-01（まだ）/ doing=S-01（進めている）
// 文の中の置き換え: {name} 主人公の名前 / {job} 今の職の名前 / {lv} Lv
//
// 選び方: 条件の合う行 → ふつうの行 の順に並べ、NPC ごとに話しかけた回数で 1 つずつ進める（同じ一言が続かない）。
// 回数はセーブしない（遊ぶたびに最初から）。
using System;
using System.Collections.Generic;
using System.Globalization;
using Lumina.Core.Quests;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public sealed partial class GameSession
    {
        private readonly Dictionary<string, int> npcTalkCount = new Dictionary<string, int>();

        /// <summary>
        /// 話しかけた時の一言。advance = false は同じ会話の中で窓を作り直す時（受けた・報告した後）で、一言を進めない。
        /// セリフが無い NPC は null。
        /// </summary>
        public string NpcLine(NpcData n, bool advance = true)
        {
            if (n == null || n.Lines.Count == 0) return null;
            var cond = new List<string>();
            var plain = new List<string>();
            foreach (var raw in n.Lines)
            {
                if (raw.Length > 0 && raw[0] == '[')
                {
                    int e = raw.IndexOf(']');
                    if (e < 0) { plain.Add(raw); continue; }
                    if (LineCondition(raw.Substring(1, e - 1))) cond.Add(raw.Substring(e + 1));
                }
                else plain.Add(raw);
            }
            cond.AddRange(plain);
            if (cond.Count == 0) return null;
            npcTalkCount.TryGetValue(n.Id, out int k);
            if (advance) npcTalkCount[n.Id] = k + 1;
            else k = Math.Max(0, k - 1);
            return FillLine(cond[k % cond.Count]);
        }

        /// <summary>[条件] の中身が今の主人公に合うか。</summary>
        public bool LineCondition(string cond)
        {
            foreach (var part0 in cond.Split(','))
            {
                var p = part0.Trim();
                if (p.Length == 0) continue;
                bool ok;
                if (p.StartsWith("!done=", StringComparison.Ordinal)) ok = Quests.Status(p.Substring(6)) != QuestStatus.Completed;
                else if (p.StartsWith("done=", StringComparison.Ordinal)) ok = Quests.Status(p.Substring(5)) == QuestStatus.Completed;
                else if (p.StartsWith("doing=", StringComparison.Ordinal)) ok = Quests.Status(p.Substring(6)) == QuestStatus.InProgress;
                else if (p.StartsWith("line=", StringComparison.Ordinal)) ok = Character.Line == p.Substring(5);
                else ok = Compare(p);
                if (!ok) return false;
            }
            return true;
        }

        private bool Compare(string p)
        {
            string[] ops = { ">=", "<=", "=", "<", ">" };
            foreach (var op in ops)
            {
                int i = p.IndexOf(op, StringComparison.Ordinal);
                if (i <= 0) continue;
                var key = p.Substring(0, i).Trim();
                if (!int.TryParse(p.Substring(i + op.Length).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out int v)) return false;
                int a = key == "lv" ? Character.Level : key == "tier" ? Character.Tier : int.MinValue;
                if (a == int.MinValue) return false;
                switch (op)
                {
                    case ">=": return a >= v;
                    case "<=": return a <= v;
                    case "=": return a == v;
                    case "<": return a < v;
                    default: return a > v;
                }
            }
            return false;
        }

        private string FillLine(string s) => s.Replace("{name}", Character.Name).Replace("{job}", Character.JobName)
            .Replace("{lv}", Character.Level.ToString(CultureInfo.InvariantCulture));

        /// <summary>
        /// この NPC が頼んだ（または報告先の）進めているクエストの、残りの目的の一言（例「コロ貝の殻をあと 3 個、待ってるよ。」）。無ければ null。
        /// 報告できる物があれば、その一言。
        /// </summary>
        public string QuestHint(string npcId)
        {
            foreach (var q in Quests.InProgress())
            {
                if (q.Giver != npcId && q.End != npcId) continue;
                if (Quests.ObjectivesDone(q, Inventory))
                {
                    if (q.End == npcId) return "おっ、「" + q.Name + "」は終わったみたいだね。";
                    var endName = Data.Npcs.TryGetValue(q.End ?? "", out var en) ? en.Name : null;
                    if (endName != null) return endName + "に知らせておくれ。";
                    continue;
                }
                for (int i = 0; i < q.Objectives.Count; i++)
                {
                    var o = q.Objectives[i];
                    int left = o.Count - Quests.Count(q, i, Inventory);
                    if (left <= 0) continue;
                    return ObjectiveHint(o, left);
                }
            }
            return null;
        }

        private string ObjectiveHint(QuestObjective o, int left)
        {
            switch (o.Type)
            {
                case ObjectiveType.Kill:
                    return (Data.Mob(o.Target)?.Name ?? o.Label ?? o.Target) + "を、あと " + left + " 匹たのむよ。";
                case ObjectiveType.Collect:
                    if (o.Label != null && Data.Item(o.Target)?.Tab == Lumina.Core.Items.InvTab.Special) return o.Label + "、待ってるよ。";
                    return (Data.Item(o.Target)?.Name ?? o.Label ?? o.Target) + "を、あと " + left + " 個。待ってるよ。";
                case ObjectiveType.Talk:
                    return (Data.Npcs.TryGetValue(o.Target ?? "", out var n) ? n.Name : o.Label ?? o.Target) + "に会ってきておくれ。";
                case ObjectiveType.Visit:
                    return (Data.GetMap(o.Target)?.Name ?? o.Label ?? o.Target) + "へ行ってみておくれ。";
                default:
                    return (o.Label ?? "頼んだこと") + (left > 1 ? "（あと " + left + "）" : "") + "、まだみたいだね。";
            }
        }
    }
}
