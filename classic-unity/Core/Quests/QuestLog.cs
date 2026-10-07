// クエストの進み具合（QUESTS.md 1 章）。受ける条件（前提・Lv）・目的の数え方・完了できるか・NPC の電球（黄/緑）。
// 報酬を渡すのは GameSession（持ち物・経験値・お金を持っているので）。
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Data;
using Lumina.Core.Items;

namespace Lumina.Core.Quests
{
    public enum QuestStatus { None, InProgress, Completed }

    public sealed class QuestProgress
    {
        public string Id;
        public QuestStatus Status;
        public readonly Dictionary<string, int> Counts = new Dictionary<string, int>(); // 目的の Key → 数（集める物は持ち物で数える）
        public long CompletedAtPlaySec;
    }

    /// <summary>目的が進んだ時のお知らせ（画面の「コロ貝 3/10」）</summary>
    public struct QuestProgressNote
    {
        public string QuestId; public int ObjectiveIndex; public int Count, Need;
    }

    public enum StartResult { Ok, Unknown, AlreadyStarted, AlreadyCompleted, LevelTooLow, PrereqMissing, GiverNotHere }

    public sealed class QuestLog
    {
        private readonly GameData data;
        public readonly Dictionary<string, QuestProgress> Entries = new Dictionary<string, QuestProgress>();

        public QuestLog(GameData data) { this.data = data; }

        public QuestStatus Status(string id) => Entries.TryGetValue(id, out var p) ? p.Status : QuestStatus.None;
        public bool IsCompleted(string id) => Status(id) == QuestStatus.Completed;
        public QuestProgress Get(string id) => Entries.TryGetValue(id, out var p) ? p : null;

        public StartResult CanStart(string id, CharacterState c)
        {
            var q = data.Quest(id);
            if (q == null) return StartResult.Unknown;
            var st = Status(id);
            if (st == QuestStatus.InProgress) return StartResult.AlreadyStarted;
            if (st == QuestStatus.Completed) return StartResult.AlreadyCompleted;
            if (c.Level < q.MinLevel) return StartResult.LevelTooLow;
            foreach (var pre in q.Prereqs) if (!IsCompleted(pre)) return StartResult.PrereqMissing;
            return StartResult.Ok;
        }

        public StartResult Start(string id, CharacterState c)
        {
            var r = CanStart(id, c);
            if (r != StartResult.Ok) return r;
            Entries[id] = new QuestProgress { Id = id, Status = QuestStatus.InProgress };
            return StartResult.Ok;
        }

        public IEnumerable<QuestDef> InProgress()
        {
            foreach (var kv in Entries)
                if (kv.Value.Status == QuestStatus.InProgress && data.Quest(kv.Key) is QuestDef q) yield return q;
        }

        /// <summary>目的 i の今の数。集める物は持ち物の数。</summary>
        public int Count(QuestDef q, int i, Inventory inv)
        {
            var o = q.Objectives[i];
            if (o.Type == ObjectiveType.Collect) return inv != null ? inv.Count(o.Target) : 0;
            var p = Get(q.Id);
            if (p == null) return 0;
            return p.Counts.TryGetValue(o.Key, out var n) ? n : 0;
        }

        public bool ObjectivesDone(QuestDef q, Inventory inv)
        {
            for (int i = 0; i < q.Objectives.Count; i++) if (Count(q, i, inv) < q.Objectives[i].Count) return false;
            return true;
        }

        /// <summary>この NPC に話して完了できるか（auto は NPC 無しで完了）。</summary>
        public bool CanComplete(string id, string npcId, Inventory inv)
        {
            var q = data.Quest(id);
            if (q == null || Status(id) != QuestStatus.InProgress) return false;
            if (!ObjectivesDone(q, inv)) return false;
            if (q.AutoComplete) return true;
            return npcId != null && q.End == npcId;
        }

        public void MarkCompleted(string id, long playSec)
        {
            if (!Entries.TryGetValue(id, out var p)) Entries[id] = p = new QuestProgress { Id = id };
            p.Status = QuestStatus.Completed;
            p.CompletedAtPlaySec = playSec;
            p.Counts.Clear();
        }

        /// <summary>目的の数を進める（kill/talk/visit/interact/event）。進んだ物を返す。</summary>
        public List<QuestProgressNote> Progress(ObjectiveType type, string target, int amount = 1)
        {
            var notes = new List<QuestProgressNote>();
            foreach (var kv in Entries)
            {
                var p = kv.Value;
                if (p.Status != QuestStatus.InProgress) continue;
                var q = data.Quest(kv.Key);
                if (q == null) continue;
                for (int i = 0; i < q.Objectives.Count; i++)
                {
                    var o = q.Objectives[i];
                    if (o.Type != type || o.Target != target) continue;
                    p.Counts.TryGetValue(o.Key, out var n);
                    if (n >= o.Count) continue;
                    n = System.Math.Min(o.Count, n + amount);
                    p.Counts[o.Key] = n;
                    notes.Add(new QuestProgressNote { QuestId = q.Id, ObjectiveIndex = i, Count = n, Need = o.Count });
                }
            }
            return notes;
        }

        /// <summary>この NPC から受けられるクエスト（頭の上の黄色い電球）。</summary>
        public List<QuestDef> AvailableFrom(string npcId, CharacterState c)
        {
            var r = new List<QuestDef>();
            foreach (var q in data.QuestList) if (q.Giver == npcId && CanStart(q.Id, c) == StartResult.Ok) r.Add(q);
            return r;
        }

        /// <summary>この NPC に報告できるクエスト（緑の電球）。</summary>
        public List<QuestDef> CompletableAt(string npcId, Inventory inv)
        {
            var r = new List<QuestDef>();
            foreach (var q in InProgress()) if (CanComplete(q.Id, npcId, inv)) r.Add(q);
            return r;
        }
    }
}
