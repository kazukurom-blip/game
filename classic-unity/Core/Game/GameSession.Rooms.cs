// ボスの間・1 人用ダンジョン・転職の試験の部屋の決まり（GameSession の続き）。データは systems.json の rooms（RoomRule）。
//
// - 入る: 鍵の品（requiresItem）・前提クエスト（requiresQuest = 完了 / requiresAnyQuest = 進行中）・Lv の範囲・1 日 N 回（週 1 回）。
//   ポータルで入る時に確かめ、入ったら回数を 1 つ使う（実時間の日。MONSTERS.md 5 章）。fresh の部屋は入るたびに作り直す（主がすぐ出る）。
// - 制限時間: 入った時から数える（timerQuest があれば、そのクエストを進めている間だけ）。切れたら戻り先へ出される（RoomTimeUp）。
// - 中で倒れた: 起き上がる所は戻り先（Revive）。1 人用ダンジョンの中で倒れた時は経験値 1% だけ失う（STATS.md 6-2）。
// - 試験の部屋: 時間切れ・外に出た時は試しの珠（resetItems）が消えてやり直し（JOBS.md 3-2）。
// - 1 人用ダンジョン: 主（clearMob）を倒すとクリア → dungeon_clear と dungeon_clear.<マップ> を知らせ、試練のメダル（medal）。
// - ボス・大ボスを倒すと boss_kill（R-21）。転職の試験中は紅の印・蒼の印を必ず落とす（questDrops）。
using System;
using System.Collections.Generic;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Town;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum RoomEntryResult { Ok, NeedItem, NeedQuest, LevelOutOfRange, NoEntriesLeft }

    public sealed partial class GameSession
    {
        /// <summary>今いる部屋の決まり（ボスの間・ダンジョン・試験の部屋でなければ null）。</summary>
        public RoomRule CurrentRoom => Map != null ? Data.Systems.Room(Map.Data.Id) : null;
        /// <summary>制限時間の残り（秒）。RoomTimerRunning が false なら数えていない。</summary>
        public double RoomTimeLeft { get; private set; }
        public bool RoomTimerRunning => roomTimerOn;
        /// <summary>1 人用ダンジョンの主を倒した（この入場で）。</summary>
        public bool RoomCleared { get; private set; }
        private bool roomTimerOn;

        private static string RoomKey(RoomRule r) => "room." + r.Map;

        /// <summary>今日（週 1 回の部屋は今週）あと何回入れるか。制限なしは int.MaxValue。</summary>
        public int RoomEntriesLeft(string mapId)
        {
            var r = Data.Systems.Room(mapId);
            if (r == null || r.PerDay <= 0) return int.MaxValue;
            return Math.Max(0, r.PerDay - Daily.Used(RoomKey(r), Clock(), r.Weekly));
        }

        /// <summary>その部屋に入れるか（ポータル・UI の確かめ）。</summary>
        public RoomEntryResult CanEnterRoom(string mapId)
        {
            var r = Data.Systems.Room(mapId);
            if (r == null) return RoomEntryResult.Ok;
            if (r.RequiresItem != null && !Inventory.Has(r.RequiresItem)) return RoomEntryResult.NeedItem;
            if (r.RequiresQuest != null && !Quests.IsCompleted(r.RequiresQuest)) return RoomEntryResult.NeedQuest;
            if (r.RequiresAnyQuest.Count > 0 && !r.RequiresAnyQuest.Exists(q => Quests.Status(q) == QuestStatus.InProgress || CanAcceptInside(q, r.Map))) return RoomEntryResult.NeedQuest;
            if (r.LvMin > 0 && (Character.Level < r.LvMin || Character.Level > r.LvMax)) return RoomEntryResult.LevelOutOfRange;
            if (RoomEntriesLeft(mapId) <= 0) return RoomEntryResult.NoEntriesLeft;
            return RoomEntryResult.Ok;
        }

        /// <summary>
        /// その部屋の中にいる NPC から受けるクエストで、今受けられる（修験の雪洞 F118 の J?-6 は依頼者が部屋の中にいる。
        /// 「進めている間だけ入れる」だけだと受けに入れない。PLAYTEST.md）。
        /// </summary>
        private bool CanAcceptInside(string questId, string roomMap)
        {
            var q = Data.Quest(questId);
            return q != null && q.Map == roomMap && Quests.CanStart(questId, Character) == StartResult.Ok;
        }

        private static string RoomRefusal(RoomEntryResult r, RoomRule rule, GameSession s)
        {
            switch (r)
            {
                case RoomEntryResult.NeedItem: return (s.Data.Item(rule.RequiresItem)?.Name ?? rule.RequiresItem) + "が無いと入れない";
                case RoomEntryResult.NeedQuest: return "今は入れない";
                case RoomEntryResult.LevelOutOfRange: return "Lv" + rule.LvMin + "〜" + rule.LvMax + " の間だけ入れる";
                case RoomEntryResult.NoEntriesLeft: return rule.Weekly ? "今週はもう入れない" : "今日はもう入れない";
                default: return null;
            }
        }

        /// <summary>ポータルで入る前に確かめる（入れなければお知らせを出して false）。</summary>
        private bool CheckRoomEntry(string mapId)
        {
            if (mapId == null || (Map != null && mapId == Map.Data.Id)) return true;
            var r = CanEnterRoom(mapId);
            if (r == RoomEntryResult.Ok) return true;
            Out.Add(GameEventType.Message, mapId, text: RoomRefusal(r, Data.Systems.Room(mapId), this));
            return false;
        }

        /// <summary>マップを移る前（EnterMap から）: 試験の部屋を出たらやり直し・fresh の部屋は作り直す。</summary>
        private void BeforeEnterMap(MapData md)
        {
            var cur = CurrentRoom;
            if (cur != null && md.Id != Map.Data.Id)
            {
                if (cur.Kind == RoomKind.Test && roomTimerOn) FailTestRoom(cur);
                roomTimerOn = false;
            }
            var next = Data.Systems.Room(md.Id);
            if (next != null && next.Fresh && (Map == null || md.Id != Map.Data.Id)) mapCache.RemoveAll(x => x.Data.Id == md.Id);
        }

        /// <summary>マップに入った後（EnterMap から）: 回数を使い、制限時間を数え始める。</summary>
        private void AfterEnterMap(MapData md, bool sameMap)
        {
            var r = Data.Systems.Room(md.Id);
            if (r == null || sameMap) return;
            if (r.PerDay > 0) Daily.Use(RoomKey(r), Clock(), r.Weekly);
            RoomCleared = false;
            StartRoomTimerIfNeeded(r);
            int left = RoomEntriesLeft(md.Id);
            Out.Add(GameEventType.RoomEntered, md.Id, (long)(roomTimerOn ? r.TimeSec : 0), text: left == int.MaxValue ? null : (r.Weekly ? "今週" : "今日") + "あと " + left + " 回");
        }

        private void StartRoomTimerIfNeeded(RoomRule r)
        {
            if (roomTimerOn || r.TimeSec <= 0) return;
            if (r.TimerQuest != null && r.TimerQuest != "any" && Quests.Status(r.TimerQuest) != QuestStatus.InProgress) return;
            roomTimerOn = true;
            RoomTimeLeft = r.TimeSec;
        }

        /// <summary>クエストを受けた時（AcceptQuest から）: 試験の部屋の中で試験を受けたら時間を数え始める。ペットの親密度も合わせる。</summary>
        private void OnQuestAcceptedTown(QuestDef q)
        {
            var r = CurrentRoom;
            if (r != null && r.TimerQuest == q.Id) StartRoomTimerIfNeeded(r);
            SyncPetCloseness();
        }

        private void TickRoom(double dt)
        {
            if (!roomTimerOn) return;
            var r = CurrentRoom;
            if (r == null) { roomTimerOn = false; return; }
            RoomTimeLeft -= dt;
            if (RoomTimeLeft > 0) return;
            RoomTimeLeft = 0;
            roomTimerOn = false;
            Out.Add(GameEventType.RoomTimeUp, r.Map, text: "時間切れ");
            if (r.Kind == RoomKind.Test) FailTestRoom(r);
            StandUp();
            ChangeMap(r.Exit);
        }

        private void FailTestRoom(RoomRule r)
        {
            bool lost = false;
            foreach (var it in r.ResetItems)
            {
                int n = Inventory.Count(it);
                if (n > 0) { Inventory.Remove(it, n); lost = true; }
            }
            Out.Add(GameEventType.RoomFailed, r.Map, text: lost ? "試験はやり直し（集めた物は消えた）" : "試験はやり直し");
        }

        /// <summary>倒れた後に起き上がる所（部屋の中なら戻り先）。null ならいつもの町。</summary>
        private string RoomReviveMap()
        {
            var r = CurrentRoom;
            if (r == null) return null;
            if (r.Kind == RoomKind.Test && roomTimerOn) FailTestRoom(r);
            roomTimerOn = false;
            return r.Exit;
        }

        /// <summary>1 人用ダンジョンの中（死んだ時の経験値は 1%）。</summary>
        public bool InDungeon => CurrentRoom?.Kind == RoomKind.Dungeon;

        // ---------------- 倒した時（KillMob から）

        /// <summary>敵を倒した時: boss_kill・ダンジョンのクリア・試験の主。</summary>
        private void OnMobKilledTown(Mob mob)
        {
            var def = mob.Def;
            if (def.IsBoss)
            {
                Out.Add(GameEventType.BossKilled, def.Id, x: mob.X, y: mob.Y, text: def.Name);
                QuestEvent("boss_kill");
            }
            var r = CurrentRoom;
            if (r == null) return;
            if (r.ClearMob == def.Id && !RoomCleared)
            {
                RoomCleared = true;
                roomTimerOn = false;
                Out.Add(GameEventType.DungeonCleared, r.Map, text: Map.Data.Name + "をクリアした");
                QuestEvent("dungeon_clear");
                QuestEvent("dungeon_clear." + r.Map);
                if (r.Medal != null && Data.Item(r.Medal) != null)
                {
                    int rest = Inventory.Add(r.Medal);
                    if (rest == 0) Out.Add(GameEventType.ItemPicked, r.Medal, 1, text: Data.Item(r.Medal).Name);
                    else Map.SpawnDrops(mob.X, mob.Y, new List<DropItem> { new DropItem { ItemId = r.Medal } });
                }
                AutoSave.Request("dungeon");
            }
            else if (r.Kind == RoomKind.Test && r.RequiresAnyQuest.Count > 0 && def.IsElite) roomTimerOn = false; // もう一人の自分を倒した
        }

        /// <summary>転職の試験の間は必ず落とす物（紅の印・蒼の印）。KillMob のドロップに足す。</summary>
        private void AddQuestDrops(MobDef def, List<DropItem> drops)
        {
            foreach (var d in Data.Systems.Jobs.QuestDrops)
            {
                if (d.Mob != def.Id || Quests.Status(d.Quest) != QuestStatus.InProgress) continue;
                if (Inventory.Has(d.Item) || drops.Exists(x => x.ItemId == d.Item) || Data.Item(d.Item) == null) continue;
                drops.Add(new DropItem { ItemId = d.Item });
            }
        }
    }
}
