// NPC と話す・クエストを受ける/報告する・調べる・乗り物（GameSession の続き）。
using System;
using System.Collections.Generic;
using Lumina.Core.Quests;
using Lumina.Core.Town;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    /// <summary>NPC に話した時に Unity の会話の窓へ出す中身。</summary>
    public sealed class NpcDialog
    {
        public NpcData Npc;
        public List<QuestDef> Available = new List<QuestDef>();   // 受けられる（黄色の電球）
        public List<QuestDef> Completable = new List<QuestDef>(); // 報告できる（緑の電球）
        public List<QuestDef> InProgress = new List<QuestDef>();  // 進めている途中（この NPC が報告先）
        public string Shop;
        public int InnFee = -1;
        public TravelData Travel;
        // 町の仕組み（GameSession.Town.cs が埋める）
        public string Role;
        public TaxiData Taxi;                                         // タクシー（行き先と料金。TaxiFee で初心者割引込み）
        public bool Storage;                                          // 倉庫番
        public bool ShopRecharge;                                     // 店で詰め直しができる
        public List<Town.CraftRecipe> Crafts = new List<Town.CraftRecipe>(); // 作れる物
        // セリフ（Game/NpcLines.cs）
        public string Say;                                            // 話しかけるたびに変わる一言（無ければ null）
        public string Hint;                                           // 進めているクエストの残り（この NPC が依頼者か報告先の時）
    }

    public enum CompleteResult { Ok, NotInProgress, NotDone, WrongNpc, InventoryFull }

    public sealed partial class GameSession
    {
        /// <summary>今のマップの NPC に話す。「話す」目的が進み、受けられる・報告できるクエストを返す。
        /// refresh = true は同じ会話の窓を作り直す時（受けた・報告した後）で、一言（Say）を進めない。</summary>
        public NpcDialog Talk(string npcId) => Talk(npcId, false);

        public NpcDialog Talk(string npcId, bool refresh)
        {
            var n = Map.Npc(npcId);
            if (n == null || Dead) return null;
            foreach (var note in Quests.Progress(ObjectiveType.Talk, npcId)) OnQuestNote(note);
            var d = new NpcDialog { Npc = n, Shop = n.Shop, InnFee = n.InnFee, Travel = n.Travel };
            d.Completable = Quests.CompletableAt(npcId, Inventory);
            d.Available = Quests.AvailableFrom(npcId, Character);
            foreach (var q in Quests.InProgress()) if (q.End == npcId && !d.Completable.Contains(q)) d.InProgress.Add(q);
            FillTownDialog(d);
            d.Say = NpcLine(n, !refresh);
            d.Hint = QuestHint(npcId);
            return d;
        }

        /// <summary>頭の上の電球: 2 = 報告できる（緑）、1 = 受けられる（黄）、0 = 無し。</summary>
        public int NpcBulb(string npcId)
        {
            if (Quests.CompletableAt(npcId, Inventory).Count > 0) return 2;
            if (Quests.AvailableFrom(npcId, Character).Count > 0) return 1;
            return 0;
        }

        /// <summary>クエストを受ける（依頼者が今のマップにいる時）。</summary>
        public StartResult AcceptQuest(string questId)
        {
            var q = Data.Quest(questId);
            if (q == null) return StartResult.Unknown;
            if (q.Giver != null && Map.Npc(q.Giver) == null && Data.Npcs.ContainsKey(q.Giver)) return StartResult.GiverNotHere;
            var r = Quests.Start(questId, Character);
            if (r != StartResult.Ok) return r;
            Out.Add(GameEventType.QuestStarted, questId, text: q.Name);
            OnQuestAcceptedTown(q); // 試験の部屋の時間・ペットの親密度（GameSession.Rooms.cs）
            // 今いるマップが「行く」目的なら、もう着いている
            foreach (var note in Quests.Progress(ObjectiveType.Visit, Map.Data.Id)) OnQuestNote(note);
            CheckAutoComplete();
            return r;
        }

        /// <summary>クエストを報告して報酬をもらう。</summary>
        public CompleteResult CompleteQuest(string questId)
        {
            var q = Data.Quest(questId);
            if (q == null || Quests.Status(questId) != QuestStatus.InProgress) return CompleteResult.NotInProgress;
            if (!Quests.ObjectivesDone(q, Inventory)) return CompleteResult.NotDone;
            if (!q.AutoComplete && Map.Npc(q.End) == null) return CompleteResult.WrongNpc;
            return FinishQuest(q);
        }

        private CompleteResult FinishQuest(QuestDef q)
        {
            // 報酬が入るか（集めた物を渡した後で数える）
            foreach (var rw in q.Rewards)
            {
                var def = Data.Item(rw.Item);
                if (def == null) continue;
                if (!Inventory.CanAdd(rw.Item, rw.Count) && !CollectFreesRoom(q, def))
                {
                    Out.Add(GameEventType.InventoryFull, q.Id, text: "持ち物がいっぱいで報酬を受け取れない");
                    return CompleteResult.InventoryFull;
                }
            }
            foreach (var o in q.Objectives) if (o.Type == ObjectiveType.Collect) Inventory.Remove(o.Target, o.Count);
            Quests.MarkCompleted(q.Id, (long)PlaySec);
            if (q.Repeat != null) Daily.Use(RepeatKey(q), Clock(), q.Weekly); // 繰り返し: 今日（今週）はもう受けられない
            Out.Add(GameEventType.QuestCompleted, q.Id, q.Exp, text: q.Name);
            if (q.Meso > 0) { Inventory.AddMeso(q.Meso); Out.Add(GameEventType.MesoPicked, q.Id, q.Meso); }
            foreach (var rw in q.Rewards)
            {
                if (Data.Item(rw.Item) == null) continue;
                Inventory.Add(rw.Item, rw.Count);
                Out.Add(GameEventType.ItemPicked, rw.Item, rw.Count, text: Data.Item(rw.Item).Name);
            }
            GainExp(q.Exp);
            OnQuestFinishedTown(q); // 3・4 次の転職・開く物（GameSession.Jobs.cs）
            RefreshStats();
            AutoSave.Request("quest");
            return CompleteResult.Ok;
        }

        // ---------------- 繰り返しのクエスト（R 系。QUESTS.md 5 章）

        /// <summary>1 日に掲示板に出る本数</summary>
        public const int BoardPerDay = 3;
        /// <summary>掲示板の候補にする数（自分の Lv 以下で Lv の近い順）。この中から日付で 3 本を選ぶ</summary>
        public const int BoardPool = 5;

        private static string RepeatKey(QuestDef q) => "quest." + q.Id;

        /// <summary>
        /// 今日の募集の掲示板（自分の Lv に合う 3 本）。受けられる Lv の物のうち Lv の近い 5 本から、日付で 3 本を選ぶ（毎日入れ替わる）。
        /// 週の大募集（R-21）と日課（R-22）は掲示板の 3 本とは別にいつも出る（board ではない）。
        /// </summary>
        public List<string> BoardToday()
        {
            var cand = new List<QuestDef>();
            foreach (var q in Data.QuestList) if (q.Board && q.MinLevel <= Character.Level) cand.Add(q);
            cand.Sort((a, b) => b.MinLevel.CompareTo(a.MinLevel) != 0 ? b.MinLevel.CompareTo(a.MinLevel) : string.CompareOrdinal(a.Id, b.Id));
            if (cand.Count > BoardPool) cand.RemoveRange(BoardPool, cand.Count - BoardPool);
            int day = DailyLog.DayNumber(Clock());
            var rng = new Rng(0xB0A2D5EEDUL ^ (ulong)day * 0x9E3779B97F4A7C15UL);
            for (int i = cand.Count - 1; i > 0; i--) { int j = rng.Range(0, i); (cand[i], cand[j]) = (cand[j], cand[i]); }
            var r = new List<string>();
            for (int i = 0; i < cand.Count && r.Count < BoardPerDay; i++) r.Add(cand[i].Id);
            return r;
        }

        private bool CollectFreesRoom(QuestDef q, Items.ItemDef reward)
        {
            foreach (var o in q.Objectives)
                if (o.Type == ObjectiveType.Collect && Data.Item(o.Target)?.Tab == reward.Tab) return true;
            return false;
        }

        private void CheckAutoComplete()
        {
            var done = new List<QuestDef>();
            foreach (var q in Quests.InProgress()) if (q.AutoComplete && Quests.ObjectivesDone(q, Inventory)) done.Add(q);
            foreach (var q in done) FinishQuest(q);
        }

        private void OnQuestNote(QuestProgressNote n)
        {
            Out.Add(GameEventType.QuestProgress, n.QuestId, n.Count, text: n.Count + "/" + n.Need);
        }

        /// <summary>「操作をする」目的（クイックスロットに置く・AP を振る など）を進める。</summary>
        public void QuestEvent(string name, int amount = 1)
        {
            foreach (var note in Quests.Progress(ObjectiveType.Event, name, amount)) OnQuestNote(note);
            CheckAutoComplete();
        }

        private void OnVisitMap(string mapId)
        {
            foreach (var note in Quests.Progress(ObjectiveType.Visit, mapId)) OnQuestNote(note);
            CheckAutoComplete();
        }

        /// <summary>話す/調べるキー: 近くの調べられる物を調べる。無ければ一番近い NPC（120 px 以内）に話す。</summary>
        public object InteractNearby()
        {
            var o = Map.ObjectAt(Body.X, Body.Y);
            if (o != null) { Interact(o.Id); return o; }
            NpcData best = null; double bd = 120;
            foreach (var n in Map.Data.Npcs)
            {
                double d = Math.Abs(n.X - Body.X);
                if (d <= bd && Math.Abs(n.Y - Body.Y) < 80) { bd = d; best = n; }
            }
            if (best != null) { LastDialog = Talk(best.Id); return LastDialog; }
            return null;
        }

        /// <summary>InteractNearby で話した時の会話の中身（Unity の会話の窓が読む）。</summary>
        public NpcDialog LastDialog;

        /// <summary>調べる（木箱・宝箱・見晴らし台）。近くにある時だけ。</summary>
        public bool Interact(string objectId)
        {
            MapObjectData found = null;
            foreach (var o in Map.Data.Objects) if (o.Id == objectId) found = o;
            if (found == null || Math.Abs(found.X - Body.X) > 32 || Math.Abs(found.Y - Body.Y) > 48) return false;
            Out.Add(GameEventType.Message, objectId, text: found.Name + "を調べた");
            foreach (var note in Quests.Progress(ObjectiveType.Interact, objectId)) OnQuestNote(note);
            CheckAutoComplete();
            OnInteractTown(found); // 毎日の宝箱・賢者の石（GameSession.Town.cs）
            return true;
        }

        /// <summary>乗り物（船など）に乗る。島の船は Lv7 以上・片道。useTicket = true なら雲の船の切符を 1 枚使う（料金なし）。帰りの便（Homeward）はお金が足りなければ有り金で乗れる。</summary>
        public bool Travel(string npcId, bool useTicket = false)
        {
            var n = Map.Npc(npcId);
            var t = n?.Travel;
            if (t == null) return false;
            if (Character.Level < t.MinLevel) { Out.Add(GameEventType.Message, npcId, text: "Lv" + t.MinLevel + " から乗れる"); return false; }
            if (t.RequiresQuest != null && Quests.Status(t.RequiresQuest) == QuestStatus.None) { Out.Add(GameEventType.Message, npcId, text: "まだ乗れない"); return false; }
            long fee = t.Fee;
            if (useTicket && fee > 0 && Inventory.Has("use.ship_ticket")) { Inventory.Remove("use.ship_ticket"); fee = 0; }
            if (Inventory.Meso < fee)
            {
                // 帰りの便は有り金だけで乗せてくれる（乗り物でしか出入りできない地域でお金が尽きても大陸へ戻れる）
                if (!t.Homeward) { Out.Add(GameEventType.Message, npcId, text: "お金が足りない"); return false; }
                fee = Inventory.Meso;
                Out.Add(GameEventType.Message, npcId, text: "足りない分はまけてもらった");
            }
            Inventory.AddMeso(-fee);
            string from = Map.Data.Region;
            Out.Add(GameEventType.Travel, t.To);
            ChangeMap(t.To, t.ToPortal);
            if (t.OneWay && from == "S") Flags["leftIsland"] = true;
            return true;
        }

        /// <summary>テスト・道具用: 足元の位置を動かす（足場に立たせる）。</summary>
        public void Teleport(double x, double y)
        {
            Physics.PlayerPhysics.PlaceOnGround(Body, Map.Physics, x, y);
            PrevX = Body.X; PrevY = Body.Y;
        }
    }
}
