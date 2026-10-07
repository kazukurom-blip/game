// やりこみ要素（GameSession の続き）: 敵の図鑑（カード）・勲章（称号）・記録と統計・ジャンプの試練・全体マップの印・椅子の収集。
// 中身の形は Core/Collection/（MonsterBook・BookIndex・Medals・PlayRecords）。保存は SaveData.Collection（版 4）。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Collection;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum MedalResult { Ok, NotEarned, Unknown, InventoryFull }

    public sealed partial class GameSession
    {
        /// <summary>敵の図鑑（カード）</summary>
        public readonly MonsterBook Book = new MonsterBook();
        /// <summary>記録と統計</summary>
        public readonly PlayRecords Records = new PlayRecords();
        /// <summary>条件で手に入れた勲章（medals.mjs の ID。手に入れた順）。品をなくしても勲章の窓からもらい直せる</summary>
        public readonly List<string> MedalsEarned = new List<string>();
        /// <summary>付けている勲章（メダルの欄の品の ID。無ければ null）</summary>
        public string Medal => Equipment.Get(EquipSlot.Medal)?.ItemId;

        /// <summary>カードを落とす乱数（ふつうのドロップの乱数とは別。図鑑を足しても今までの乱数の流れは変わらない）</summary>
        private Rng cardRng;
        private Rng CardRng => cardRng ??= new Rng(Rng.State0 ^ 0x5DEECE66DUL);

        private BookIndex bookIndex;
        /// <summary>図鑑に載る敵の一覧（地域ごと）</summary>
        public BookIndex BookIndex => bookIndex ??= BookIndex.Build(Data);

        private StatBlock collectionBonus;
        private int bonusBookLv = -1;
        private double medalT;
        private readonly Dictionary<int, double> bossFirstHit = new Dictionary<int, double>();
        /// <summary>ジャンプの試練に入った時間（PlaySec）。てっぺんの宝箱で、かかった秒を記録する</summary>
        private double jumpStartT = -1;
        private string jumpMap;

        // ---------------- 能力（図鑑の段。勲章の能力はメダルの欄の装備として足される）

        private StatBlock CollectionBonus()
        {
            int lv = Book.Level;
            if (collectionBonus == null || lv != bonusBookLv) { collectionBonus = MonsterBook.BonusFor(lv); bonusBookLv = lv; }
            return collectionBonus;
        }

        // ---------------- 勲章（メダルの品）

        /// <summary>勲章の一覧（データの順: 条件で手に入る物 → クエストでもらう物）</summary>
        public List<ItemDef> MedalList()
        {
            var l = new List<ItemDef>();
            foreach (var it in Data.Items.Values) if (it.IsMedal && it.MedalAuto) l.Add(it);
            foreach (var it in Data.Items.Values) if (it.IsMedal && !it.MedalAuto) l.Add(it);
            return l;
        }

        /// <summary>その勲章を手に入れているか（条件で手に入れた・クエストのメダルを持っている/付けている）</summary>
        public bool HasMedal(string idOrItem)
        {
            string item = idOrItem.StartsWith(Medals.ItemPrefix, StringComparison.Ordinal) ? idOrItem : Medals.ItemPrefix + idOrItem;
            var r = Medals.OfItem(item);
            if (r != null && MedalsEarned.Contains(r.Id)) return true;
            return HasOrWears(item);
        }

        /// <summary>手に入れた勲章の数</summary>
        public int MedalCount()
        {
            int n = MedalsEarned.Count;
            foreach (var it in Data.Items.Values) if (it.IsMedal && !it.MedalAuto && HasOrWears(it.Id)) n++;
            return n;
        }

        /// <summary>勲章を付ける（メダルの欄）。null か "" で外す。
        /// 条件で手に入れた勲章は持ち物に入らない（付けた時だけメダルの欄に出てきて、外すと勲章の窓に戻る）。クエストのメダルは持ち物の品として付け外しする。</summary>
        public MedalResult EquipMedal(string itemId)
        {
            var cur = Equipment.Get(EquipSlot.Medal);
            bool curAuto = cur != null && Data.Item(cur.ItemId)?.MedalAuto == true;
            if (string.IsNullOrEmpty(itemId))
            {
                if (cur == null) return MedalResult.Ok;
                if (curAuto) Equipment.SetRaw(EquipSlot.Medal, null);
                else if (Unequip(EquipSlot.Medal) != EquipResult.Ok) return MedalResult.InventoryFull;
                RefreshStats();
                Out.Add(GameEventType.MedalEquipped, null);
                return MedalResult.Ok;
            }
            var def = Data.Item(itemId);
            if (def == null || !def.IsMedal) return MedalResult.Unknown;
            if (cur?.ItemId == itemId) return MedalResult.Ok;
            if (def.MedalAuto)
            {
                var rule = Medals.OfItem(itemId);
                if (rule == null || !MedalsEarned.Contains(rule.Id)) return MedalResult.NotEarned;
                if (cur != null && !curAuto && Unequip(EquipSlot.Medal) != EquipResult.Ok) return MedalResult.InventoryFull;
                if (Inventory.Has(itemId)) // 前に「外す」で持ち物に入った物
                    for (int i = 0; i < Inventory.SlotCount(InvTab.Equip); i++) if (Inventory.Get(InvTab.Equip, i)?.ItemId == itemId) { Inventory.TakeAt(InvTab.Equip, i, 1); break; }
                Equipment.SetRaw(EquipSlot.Medal, ItemInstance.NewEquip(def));
            }
            else
            {
                int slot = -1;
                for (int i = 0; i < Inventory.SlotCount(InvTab.Equip); i++) if (Inventory.Get(InvTab.Equip, i)?.ItemId == itemId) { slot = i; break; }
                if (slot < 0) return MedalResult.NotEarned;
                if (curAuto) Equipment.SetRaw(EquipSlot.Medal, null);
                if (EquipFromInventory(slot) != EquipResult.Ok) return MedalResult.InventoryFull;
            }
            RefreshStats();
            Out.Add(GameEventType.MedalEquipped, itemId, text: def.Name);
            Out.Add(GameEventType.EquipChanged, itemId);
            return MedalResult.Ok;
        }

        /// <summary>全部の勲章の条件を調べ、満たした物を渡す（0.5 秒ごと・倒した時など）。新しく手に入れた数。</summary>
        public int CheckMedals()
        {
            int n = 0;
            if (Inventory.Meso > Records.MaxMeso) Records.MaxMeso = Inventory.Meso;
            foreach (var r in Medals.Rules.Values)
            {
                if (MedalsEarned.Contains(r.Id)) continue;
                var def = Data.Item(r.ItemId);
                if (def == null) continue;
                bool ok;
                try { ok = r.Test(this); } catch (Exception) { ok = false; }
                if (!ok) continue;
                MedalsEarned.Add(r.Id);
                n++;
                Out.Add(GameEventType.MedalEarned, def.Id, x: Body?.X ?? 0, y: Body?.Y ?? 0, text: def.Name);
                if (def.MedalMeso > 0) { Inventory.AddMeso(def.MedalMeso); Out.Add(GameEventType.MesoPicked, def.Id, def.MedalMeso); }
            }
            if (n > 0) AutoSave.Request("medal");
            return n;
        }

        private void TickCollection(double dt)
        {
            medalT -= dt;
            if (medalT > 0) return;
            medalT = 0.5;
            // 持っている椅子（集めた椅子の一覧）
            foreach (var (tab, _, it) in Inventory.All())
            {
                if (tab != InvTab.Setup) continue;
                var d = Data.Item(it.ItemId);
                if (d != null && d.IsChair) Records.Chairs.Add(d.Id);
            }
            CheckMedals();
        }

        // 勲章の条件で使う数（訪ねたマップ・クエストの数は GameSession.Records.cs の冒険の記録）
        private int bossTypes = -1;
        /// <summary>ボスの種類の数（図鑑に載るボス・大ボス・段階のある敵）</summary>
        public long BossTypes()
        {
            if (bossTypes < 0) { bossTypes = 0; foreach (var e in BookIndex.Entries) if (IsBossDef(Data.Mob(e.Mob))) bossTypes++; }
            return bossTypes;
        }
        /// <summary>倒したボスの種類（冒険の記録の Flags "kill.*"）</summary>
        public long BossTypesKilled()
        {
            long n = 0;
            foreach (var e in BookIndex.Entries) if (IsBossDef(Data.Mob(e.Mob)) && Flags.TryGetValue("kill." + e.Mob, out var k) && k) n++;
            return n;
        }
        private static bool IsBossDef(MobDef d) => d != null && (d.IsBoss || d.Boss != null);
        public bool RaidKilled()
        {
            foreach (var kv in Records.KillsBy) if (kv.Value > 0 && Data.Mob(kv.Key)?.Kind == "raid") return true;
            return false;
        }
        public double BestBossTime()
        {
            double best = 0;
            foreach (var v in Records.BossBest.Values) if (best == 0 || v < best) best = v;
            return best;
        }
        /// <summary>行ったことのあるマップ（冒険の記録の Flags "visit.*"）</summary>
        public bool Visited(string mapId) => Flags.TryGetValue("visit." + mapId, out var v) && v;

        // ---------------- 倒した・殴った・拾った・書・マップ（各所から呼ぶ）

        private void OnDamageCollection(Mob mob, int dmg)
        {
            if (dmg > Records.MaxDamage) Records.MaxDamage = dmg;
            if (IsBossDef(mob.Def) && !mob.Mechanic && !bossFirstHit.ContainsKey(mob.Uid)) bossFirstHit[mob.Uid] = PlaySec;
        }

        private void OnKillCollection(Mob mob, List<DropItem> drops)
        {
            var def = mob.Def;
            Records.OnKill(def.Id);
            if (IsBossDef(def))
            {
                Records.BossKills++;
                if (bossFirstHit.TryGetValue(mob.Uid, out var t0))
                {
                    double sec = PlaySec - t0;
                    bossFirstHit.Remove(mob.Uid);
                    if (Records.OnBossTime(def.Id, sec)) Out.Add(GameEventType.Message, def.Id, text: def.Name + "の最短撃破 " + sec.ToString("0.0") + " 秒");
                }
            }
            // 図鑑のカード（図鑑に載る敵だけ・完成した種類は落とさない）
            if (BookIndex.ByMob.ContainsKey(def.Id) && !Book.Complete(def.Id) && CardRng.Chance(MonsterBook.CardChance(def)))
                drops.Add(new DropItem { ItemId = MonsterBook.CardId(def.Id) });
            medalT = 0; // すぐ勲章を調べる
        }

        /// <summary>落ちているカードを拾う（持ち物には入らず図鑑へ）。</summary>
        private bool PickupCard(DropItem d)
        {
            string mob = MonsterBook.MobOfCard(d.ItemId);
            d.PickedUp = true;
            var def = Data.Mob(mob);
            string name = (def?.Name ?? mob) + "のカード";
            if (!Book.Add(mob)) { Out.Add(GameEventType.Message, d.ItemId, text: name + "はもう 5 枚そろっている"); return true; }
            int n = Book.Count(mob);
            int lvBefore = MonsterBook.LevelFor(Book.CompletedCount - (n == MonsterBook.CardsPerSet ? 1 : 0));
            Out.Add(GameEventType.CardPicked, mob, n, d.X, d.Y, name + "（" + n + "/" + MonsterBook.CardsPerSet + "）");
            if (n == MonsterBook.CardsPerSet)
            {
                Out.Add(GameEventType.Message, mob, text: (def?.Name ?? mob) + "の図鑑が完成した！");
                int lv = Book.Level;
                if (lv > lvBefore) { Out.Add(GameEventType.BookLevelUp, null, lv, Body.X, Body.Y, "図鑑の段が " + lv + " になった（" + MonsterBook.BonusText(lv) + "）"); RefreshStats(); }
            }
            medalT = 0;
            return true;
        }

        private void OnScrollCollection(ScrollResult r, ItemInstance target)
        {
            if (r == ScrollResult.Success) { Records.ScrollSuccess++; if (target.Upgraded > Records.BestUpgrade) Records.BestUpgrade = target.Upgraded; }
            else if (r == ScrollResult.Fail) Records.ScrollFail++;
            else if (r == ScrollResult.Destroyed) Records.ScrollBroken++;
            medalT = 0;
        }

        private void OnVisitCollection(string mapId)
        {
            var md = Data.GetMap(mapId);
            if (md?.Jump != null) { if (jumpMap != mapId) { jumpStartT = PlaySec; jumpMap = mapId; } }
            else { jumpMap = null; jumpStartT = -1; }
        }

        private void OnHiddenPortal(PortalData p) { Records.Hidden.Add(Map.Data.Id + "." + p.Name); medalT = 0; }

        // ---------------- ジャンプの試練（てっぺんの宝箱）

        /// <summary>ジャンプの試練の今の段（1〜。地面 = 1）。試練の外なら 0。</summary>
        public int JumpStage
        {
            get
            {
                var j = Map?.Data.Jump;
                if (j == null || Body == null) return 0;
                int st = 1;
                for (int i = 1; i < j.Floors.Count; i++) if (Body.Y <= j.Floors[i] + 1) st = i + 1;
                return Math.Min(st, j.Stages + 1);
            }
        }

        /// <summary>ジャンプの試練に入ってからの秒（試練の外なら -1）</summary>
        public double JumpElapsed => jumpMap != null && Map?.Data.Id == jumpMap && jumpStartT >= 0 ? PlaySec - jumpStartT : -1;

        private void OnInteractCollection(MapObjectData o)
        {
            var j = Map.Data.Jump;
            if (j == null || o.Id != j.ChestId) return;
            string id = Map.Data.Id;
            bool first = !Records.JumpClears.ContainsKey(id);
            double sec = JumpElapsed;
            string dkey = "jump." + id;
            bool dailyOk = Daily.Used(dkey, Clock()) == 0;
            if (!first && !dailyOk) { Out.Add(GameEventType.Message, o.Id, text: "今日のごほうびはもうもらった（明日また来よう）"); return; }
            Daily.Use(dkey, Clock());
            bool best = Records.OnJumpClear(id, sec);
            GiveReward(first ? j.First : j.Daily, o.X, o.Y);
            Out.Add(GameEventType.JumpCleared, id, (long)Math.Round(Math.Max(0, sec)), o.X, o.Y,
                Map.Data.Name + "を登りきった！" + (sec > 0 ? "（" + FormatTime(sec) + (best ? "・最短" : "") + "）" : ""));
            jumpStartT = PlaySec; // もう一度登るなら、ここから測り直す
            medalT = 0;
            CheckMedals();
            AutoSave.Request("jump");
        }

        private void GiveReward(RewardData r, double x, double y)
        {
            if (r == null) return;
            if (r.Meso > 0) { Inventory.AddMeso(r.Meso); Out.Add(GameEventType.MesoPicked, null, r.Meso, x, y); }
            foreach (var (item, count) in r.Items)
            {
                var def = Data.Item(item);
                if (def == null) continue;
                int rest = Inventory.Add(item, count);
                if (rest < count) Out.Add(GameEventType.ItemPicked, item, count - rest, x, y, def.Name);
                if (rest > 0) Map.SpawnDrops(Body.X, Body.Y, new List<DropItem> { new DropItem { ItemId = item, Count = rest } });
            }
        }

        public static string FormatTime(double sec)
        {
            int s = (int)Math.Round(sec);
            return s >= 60 ? (s / 60) + " 分 " + (s % 60) + " 秒" : s + " 秒";
        }

        // ---------------- 全体マップの印

        public const int MarkAvailable = 1, MarkCompletable = 2, MarkObjective = 4, MarkHere = 8, MarkVisited = 16;

        /// <summary>全体マップの印（マップの ID → ビット: 1 受けられるクエストの依頼者・2 報告できる・4 進めているクエストの目的地・8 今いる所・16 行ったことがある）。開いた時だけ呼ぶ。</summary>
        public Dictionary<string, int> WorldMarks()
        {
            var m = new Dictionary<string, int>();
            void Set(string map, int bit) { if (map == null) return; m[map] = (m.TryGetValue(map, out var v) ? v : 0) | bit; }
            foreach (var kv in Flags) if (kv.Value && kv.Key.StartsWith("visit.", StringComparison.Ordinal)) Set(kv.Key.Substring(6), MarkVisited);
            foreach (var n in Data.Npcs.Values)
            {
                int b = NpcBulb(n.Id);
                if (b == 2) Set(n.Map, MarkCompletable); else if (b == 1) Set(n.Map, MarkAvailable);
            }
            foreach (var q in Quests.InProgress())
            {
                for (int i = 0; i < q.Objectives.Count; i++)
                {
                    var o = q.Objectives[i];
                    if (Quests.Count(q, i, Inventory) >= o.Count) continue;
                    switch (o.Type)
                    {
                        case ObjectiveType.Kill: foreach (var map in Data.WorldMap.MapsOfMob(o.Target)) Set(map, MarkObjective); break;
                        case ObjectiveType.Visit: Set(o.Target, MarkObjective); break;
                        case ObjectiveType.Talk: if (Data.Npcs.TryGetValue(o.Target, out var nd)) Set(nd.Map, MarkObjective); break;
                        case ObjectiveType.Interact:
                        {
                            int dot = o.Target?.IndexOf('.') ?? -1;
                            if (dot > 0 && Data.WorldMap.Node(o.Target.Substring(0, dot)) != null) Set(o.Target.Substring(0, dot), MarkObjective);
                            break;
                        }
                    }
                }
            }
            Set(Map.Data.Id, MarkHere);
            return m;
        }

        // ---------------- 保存（版 4 の "collection"）

        private Dictionary<string, object> CollectionToDict()
        {
            var d = new Dictionary<string, object>
            {
                { "cards", Book.ToDict() },
                { "variants", Book.VariantsToDict() },
                { "medals", MedalsEarned.ConvertAll(x => (object)x) },
                { "records", Records.ToDict() },
                { "cardRng", new List<object> { Save.SaveSerializer.UlongToHex(CardRng.State0), Save.SaveSerializer.UlongToHex(CardRng.State1) } },
            };
            return d;
        }

        private void ReadCollection(Dictionary<string, object> d, ulong seed)
        {
            cardRng = new Rng(seed ^ 0x5DEECE66DUL);
            if (d == null) return;
            Book.Read(J.Obj(d, "cards"));
            Book.ReadVariants(J.Obj(d, "variants"));
            foreach (var id in J.StrList(d, "medals")) if (!MedalsEarned.Contains(id)) MedalsEarned.Add(id);
            Records.Read(J.Obj(d, "records"));
            var cr = J.Arr(d, "cardRng");
            if (cr.Count == 2)
            {
                ulong a = Save.SaveSerializer.HexToUlong(cr[0] as string), b = Save.SaveSerializer.HexToUlong(cr[1] as string);
                if (a != 0 || b != 0) cardRng.SetState(a, b);
            }
        }
    }
}
