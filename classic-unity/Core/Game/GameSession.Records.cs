// 冒険の記録（QUESTS.md 8 章の長い目標）: 倒した敵の種類・倒したボスの種類・訪ねた町・訪ねたマップ・終えたクエストの数。
// 記録は Flags（セーブに入る）に "kill.<敵>" / "visit.<マップ>" で残す。長い目標のクエストの目的は event の名前
//   kinds_killed（敵の種類）/ bosses_killed（ボス・強敵の種類）/ towns_visited（町）/ maps_visited（マップ）/ quests_done（1 回だけのクエスト）
// で、数は「今までの合計」（受ける前の分も数える。QuestLog.SetAtLeast）。
using Lumina.Core.Mobs;
using Lumina.Core.Quests;

namespace Lumina.Core.Game
{
    public sealed partial class GameSession
    {
        public const string RecKinds = "kinds_killed", RecBosses = "bosses_killed", RecTowns = "towns_visited", RecMaps = "maps_visited", RecQuests = "quests_done";

        private int CountFlags(string prefix, System.Func<string, bool> filter = null)
        {
            int n = 0;
            foreach (var kv in Flags)
                if (kv.Value && kv.Key.StartsWith(prefix, System.StringComparison.Ordinal) && (filter == null || filter(kv.Key.Substring(prefix.Length)))) n++;
            return n;
        }

        /// <summary>倒した敵の種類の数（図鑑の代わり）</summary>
        public int KindsKilled => CountFlags("kill.");
        /// <summary>倒したボス・強敵の種類の数</summary>
        public int BossKindsKilled => CountFlags("kill.", id => Data.Mob(id) is MobDef m && (m.IsBoss || m.IsElite));
        /// <summary>訪ねた町の数</summary>
        public int TownsVisited => CountFlags("visit.", id => Data.GetMap(id)?.IsTown == true);
        /// <summary>訪ねたマップの数</summary>
        public int MapsVisited => CountFlags("visit.");
        /// <summary>終えた 1 回だけのクエストの数（繰り返しは入れない）</summary>
        public int QuestsDone
        {
            get { int n = 0; foreach (var kv in Quests.Entries) if (kv.Value.Status == QuestStatus.Completed && Data.Quest(kv.Key)?.Repeat == null) n++; return n; }
        }

        /// <summary>持ち物にあるか、着けている（隠しクエストの「その品を持って話す」）</summary>
        public bool HasOrWears(string itemId)
        {
            if (Inventory.Has(itemId)) return true;
            foreach (var kv in Equipment.All) if (kv.Value?.ItemId == itemId) return true;
            return false;
        }

        private static bool IsRecord(string ev) => ev == RecKinds || ev == RecBosses || ev == RecTowns || ev == RecMaps || ev == RecQuests;

        private void RecordKill(MobDef def)
        {
            string key = "kill." + def.Id;
            if (Flags.TryGetValue(key, out var had) && had) return;
            Flags[key] = true;
            SyncRecords();
        }

        private void RecordVisit(string mapId)
        {
            string key = "visit." + mapId;
            if (Flags.TryGetValue(key, out var had) && had) return;
            Flags[key] = true;
            SyncRecords();
        }

        /// <summary>長い目標の目的の数を今の記録にそろえる（受けた時・記録が増えた時・クエストを終えた時）。</summary>
        private void SyncRecords()
        {
            bool any = false;
            foreach (var q in Quests.InProgress())
                foreach (var o in q.Objectives)
                    if (o.Type == ObjectiveType.Event && IsRecord(o.Target)) { any = true; break; }
            if (!any) return;
            void Set(string name, int v) { foreach (var note in Quests.SetAtLeast(ObjectiveType.Event, name, v)) OnQuestNote(note); }
            Set(RecKinds, KindsKilled);
            Set(RecBosses, BossKindsKilled);
            Set(RecTowns, TownsVisited);
            Set(RecMaps, MapsVisited);
            Set(RecQuests, QuestsDone);
        }
    }
}
