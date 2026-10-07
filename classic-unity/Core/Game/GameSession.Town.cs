// 町の仕組み（GameSession の続き）: 倉庫・店の日替わりと詰め直し・タクシー・製作/精錬・毎日の宝箱・椅子。
// ほかの partial: 転職の試験とクイズは GameSession.Jobs.cs、ボスの間などの決まりは GameSession.Rooms.cs、ペットは GameSession.Pets.cs。
using System;
using System.Collections.Generic;
using Lumina.Core.Data;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Save;
using Lumina.Core.Town;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum StorageResult { Ok, NoKeeperHere, NotEnoughMeso, StorageFull, InventoryFull, NotEnough, CannotStore, MaxSlots }
    public enum CraftResult { Ok, NoCrafterHere, UnknownRecipe, MissingItems, NotEnoughMeso, InventoryFull }
    public enum TaxiResult { Ok, NoTaxiHere, UnknownDestination, NotEnoughMeso, AlreadyThere }

    public sealed partial class GameSession
    {
        // ---------------- 倉庫（ITEMS.md 1 章・UI.md 6 章）

        private Storage storage;
        private bool storageDirty;

        /// <summary>倉庫（キャラ全員で共有。AttachSave の時に "account" の枠から読む）。</summary>
        public Storage Storage => storage ??= new Storage(Data.Systems.Storage.StartSlots);

        /// <summary>実時間の「1 日 N 回」（ボスの間・ダンジョン・毎日の宝箱）。保存する。</summary>
        public readonly DailyLog Daily = new DailyLog();

        private bool KeeperHere(string npcId, string role)
        {
            var n = Map.Npc(npcId);
            return n != null && n.Role == role && !Dead;
        }

        /// <summary>持ち物の枠から倉庫へ預ける（1 回 100 ルド）。count は重なる物の数（装備は 1）。</summary>
        public StorageResult StorageDeposit(string npcId, InvTab tab, int slot, int count = int.MaxValue)
        {
            if (!KeeperHere(npcId, "storage")) return StorageResult.NoKeeperHere;
            var it = Inventory.Get(tab, slot);
            if (it == null || count <= 0) return StorageResult.NotEnough;
            var def = Data.Item(it.ItemId);
            if (def == null || def.Quest) return StorageResult.CannotStore;
            var rules = Data.Systems.Storage;
            if (Inventory.Meso < rules.Fee) return StorageResult.NotEnoughMeso;
            int n = Math.Min(count, it.Count);
            if (!Storage.CanPut(def, n)) return StorageResult.StorageFull;
            var taken = Inventory.TakeAt(tab, slot, n);
            Storage.Put(def, taken);
            Inventory.AddMeso(-rules.Fee);
            OnStorageChanged(def.Id, n);
            QuestEvent("storage_deposit");
            RefreshStats();
            return StorageResult.Ok;
        }

        /// <summary>倉庫の index 番目の枠から取り出す（1 回 100 ルド）。</summary>
        public StorageResult StorageWithdraw(string npcId, int index, int count = int.MaxValue)
        {
            if (!KeeperHere(npcId, "storage")) return StorageResult.NoKeeperHere;
            if (index < 0 || index >= Storage.Items.Count || Storage.Items[index] == null || count <= 0) return StorageResult.NotEnough;
            var it = Storage.Items[index];
            var def = Data.Item(it.ItemId);
            var rules = Data.Systems.Storage;
            if (Inventory.Meso < rules.Fee) return StorageResult.NotEnoughMeso;
            int n = Math.Min(count, it.Count);
            bool room = def.IsEquip ? Inventory.FreeSlots(InvTab.Equip) > 0 : Inventory.CanAdd(def.Id, n);
            if (!room) return StorageResult.InventoryFull;
            var taken = Storage.Take(index, n);
            if (def.IsEquip) Inventory.AddInstance(taken); else Inventory.Add(def.Id, n);
            Inventory.AddMeso(-rules.Fee);
            OnStorageChanged(def.Id, -n);
            QuestEvent("storage_withdraw");
            CollectNotes(def.Id);
            RefreshStats();
            return StorageResult.Ok;
        }

        /// <summary>お金を預ける（手数料なし）。</summary>
        public StorageResult StorageDepositMeso(string npcId, long amount)
        {
            if (!KeeperHere(npcId, "storage")) return StorageResult.NoKeeperHere;
            if (amount <= 0 || Inventory.Meso < amount) return StorageResult.NotEnoughMeso;
            Inventory.AddMeso(-amount);
            Storage.Meso = Math.Min(Inventory.MaxMeso, Storage.Meso + amount);
            OnStorageChanged(null, amount);
            return StorageResult.Ok;
        }

        /// <summary>お金を引き出す（手数料なし）。</summary>
        public StorageResult StorageWithdrawMeso(string npcId, long amount)
        {
            if (!KeeperHere(npcId, "storage")) return StorageResult.NoKeeperHere;
            if (amount <= 0 || Storage.Meso < amount) return StorageResult.NotEnough;
            Storage.Meso -= amount;
            Inventory.AddMeso(amount);
            OnStorageChanged(null, -amount);
            return StorageResult.Ok;
        }

        /// <summary>倉庫の枠を 4 増やす（10,000 → 20,000 → … ルド。48 まで）。</summary>
        public StorageResult StorageExpand(string npcId)
        {
            if (!KeeperHere(npcId, "storage")) return StorageResult.NoKeeperHere;
            var rules = Data.Systems.Storage;
            if (Storage.Slots >= rules.MaxSlots) return StorageResult.MaxSlots;
            long cost = rules.ExpandCost(Storage.Slots);
            if (Inventory.Meso < cost) return StorageResult.NotEnoughMeso;
            Inventory.AddMeso(-cost);
            Storage.Slots = Math.Min(rules.MaxSlots, Storage.Slots + rules.Step);
            OnStorageChanged(null, 0);
            return StorageResult.Ok;
        }

        private void OnStorageChanged(string itemId, long value)
        {
            storageDirty = true;
            Out.Add(GameEventType.StorageChanged, itemId, value);
            AutoSave.Request("storage");
        }

        private void LoadAccount()
        {
            if (Store == null) return;
            var body = Store.LoadText(AccountData.Slot, AccountData.Check);
            if (body == null) return;
            var lost = new List<string>();
            storage = AccountData.FromJson(body, Data.Item, Data.Systems.Storage.StartSlots, lost);
            storageDirty = false;
            if (lost.Count > 0) Out.Add(GameEventType.Message, text: "倉庫からデータに無いアイテムを外した: " + string.Join(", ", lost));
        }

        /// <summary>倉庫を保存する（変わった時だけ。SaveNow がキャラのセーブの前に呼ぶ）。</summary>
        private SaveResult SaveAccount()
        {
            if (Store == null || !storageDirty) return null;
            var r = Store.SaveText(AccountData.Slot, AccountData.ToJson(Storage), AccountData.Check);
            if (r.Ok) storageDirty = false;
            return r;
        }

        // ---------------- 店: 日替わり・詰め直し

        /// <summary>今日並んでいる品（日替わりの店は日付で選んだ Daily 個。ほかは全部）。</summary>
        public List<ShopEntry> ShopItems(string shopId)
        {
            if (!Data.Shops.TryGetValue(shopId, out var shop)) return new List<ShopEntry>();
            if (shop.Daily <= 0 || shop.Daily >= shop.Items.Count) return shop.Items;
            int day = DailyLog.DayNumber(Clock());
            ulong seed = 1469598103934665603UL;
            foreach (char c in shopId) seed = (seed ^ c) * 1099511628211UL;
            var rng = new Rng(seed ^ (ulong)day * 0x9E3779B97F4A7C15UL);
            var idx = new List<int>();
            for (int i = 0; i < shop.Items.Count; i++) idx.Add(i);
            for (int i = idx.Count - 1; i > 0; i--) { int j = rng.Range(0, i); (idx[i], idx[j]) = (idx[j], idx[i]); }
            var pick = idx.GetRange(0, shop.Daily);
            pick.Sort();
            var list = new List<ShopEntry>();
            foreach (var i in pick) list.Add(shop.Items[i]);
            return list;
        }

        /// <summary>投げ星・弾の詰め直し（減った分を新品の 1/2 の値段で。クロウ街・潮風号の武器屋）。</summary>
        public ShopResult Recharge(string shopId, int useTabSlot)
        {
            if (!Data.Shops.TryGetValue(shopId, out var shop) || !shop.Recharge || !ShopHere(shopId)) return ShopResult.NoShopHere;
            var it = Inventory.Get(InvTab.Use, useTabSlot);
            var def = it != null ? Data.Item(it.ItemId) : null;
            if (def == null || (def.AmmoKind != "star" && def.AmmoKind != "bullet") || def.Price <= 0) return ShopResult.CannotSell;
            int missing = def.MaxStack - it.Count;
            if (missing <= 0) return ShopResult.NotEnough;
            long cost = (long)Math.Ceiling(missing * (double)def.Price / def.MaxStack / 2);
            if (Inventory.Meso < cost) return ShopResult.NotEnoughMeso;
            Inventory.AddMeso(-cost);
            it.Count = def.MaxStack;
            Out.Add(GameEventType.ItemBought, def.Id, missing, text: "詰め直した");
            return ShopResult.Ok;
        }

        // ---------------- タクシー（WORLD.md 4 章: 初心者は 1/10）

        /// <summary>このタクシーでその町へ行く料金（初心者割引込み）。行けなければ -1。</summary>
        public long TaxiFee(string npcId, string mapId)
        {
            var t = Map.Npc(npcId)?.Taxi;
            var d = t?.Dests.Find(x => x.To == mapId);
            if (d == null) return -1;
            return Character.Tier == 0 ? d.Fee / Math.Max(1, t.BeginnerDiv) : d.Fee;
        }

        /// <summary>タクシーで町へ。useTicket = true ならタクシーの回数券を 1 枚使う（料金なし）。</summary>
        public TaxiResult TaxiTo(string npcId, string mapId, bool useTicket = false)
        {
            var n = Map.Npc(npcId);
            if (n?.Taxi == null || Dead) return TaxiResult.NoTaxiHere;
            var d = n.Taxi.Dests.Find(x => x.To == mapId);
            if (d == null) return TaxiResult.UnknownDestination;
            if (mapId == Map.Data.Id) return TaxiResult.AlreadyThere;
            long fee = TaxiFee(npcId, mapId);
            if (useTicket && Inventory.Has("use.taxi_ticket")) { Inventory.Remove("use.taxi_ticket"); fee = 0; }
            if (Inventory.Meso < fee) { Out.Add(GameEventType.Message, npcId, text: "お金が足りない"); return TaxiResult.NotEnoughMeso; }
            Inventory.AddMeso(-fee);
            Out.Add(GameEventType.Travel, mapId, fee);
            var md = Data.GetMap(mapId);
            ChangeMap(mapId, md?.FindPortalByName(d.ToPortal ?? "town") != null ? (d.ToPortal ?? "town") : null);
            return TaxiResult.Ok;
        }

        // ---------------- 製作・精錬（ITEMS.md 4 章）

        /// <summary>この NPC で作れる物。</summary>
        public List<CraftRecipe> CraftsAt(string npcId) => Data.Systems.Crafts.FindAll(c => c.Npc == npcId);

        public CraftResult Craft(string npcId, string recipeId)
        {
            if (Map.Npc(npcId) == null || Dead) return CraftResult.NoCrafterHere;
            var r = Data.Systems.Crafts.Find(c => c.Id == recipeId && c.Npc == npcId);
            if (r == null) return CraftResult.UnknownRecipe;
            foreach (var x in r.In) if (!Inventory.Has(x.Item, x.Count)) return CraftResult.MissingItems;
            if (Inventory.Meso < r.Fee) return CraftResult.NotEnoughMeso;
            if (!Inventory.CanAdd(r.Out.Item, r.Out.Count)) return CraftResult.InventoryFull;
            foreach (var x in r.In) Inventory.Remove(x.Item, x.Count);
            Inventory.AddMeso(-r.Fee);
            Inventory.Add(r.Out.Item, r.Out.Count);
            Out.Add(GameEventType.Crafted, r.Out.Item, r.Out.Count, text: Data.Item(r.Out.Item)?.Name);
            CollectNotes(r.Out.Item);
            RefreshStats();
            return CraftResult.Ok;
        }

        // ---------------- 調べた時（毎日の宝箱・賢者の石）

        /// <summary>Interact から呼ぶ。毎日の宝箱を開ける・賢者の石でクイズを始める。</summary>
        private void OnInteractTown(MapObjectData o)
        {
            if (Data.Systems.Chests.TryGetValue(o.Id, out var chest))
            {
                string key = "chest." + o.Id;
                if (Daily.Used(key, Clock()) > 0) { Out.Add(GameEventType.Message, o.Id, text: "今日はもう空っぽ"); return; }
                Daily.Use(key, Clock());
                if (chest.Meso > 0) { Inventory.AddMeso(chest.Meso); Out.Add(GameEventType.MesoPicked, o.Id, chest.Meso); }
                foreach (var it in chest.Items)
                {
                    if (Data.Item(it.Item) == null) continue;
                    int rest = Inventory.Add(it.Item, it.Count);
                    if (rest < it.Count) Out.Add(GameEventType.ItemPicked, it.Item, it.Count - rest, text: Data.Item(it.Item).Name);
                }
                Out.Add(GameEventType.ChestOpened, o.Id, chest.Meso, o.X, o.Y);
                AutoSave.Request("chest");
            }
            if (o.Id == Data.Systems.Jobs.QuizStone && Quiz == null && QuizWanted()) StartQuiz();
        }

        // ---------------- 椅子（ITEMS.md 3-5・STATS.md 5 章: 座ると回復 1.5 倍）

        /// <summary>座っている椅子（アイテムの ID）。null = 座っていない。左右・ジャンプ・攻撃で立つ。</summary>
        public string Sitting { get; private set; }

        public bool SitOnChair(string itemId)
        {
            var def = Data.Item(itemId);
            if (def == null || !def.IsChair || !Inventory.Has(itemId) || Dead || Attack != null || !Body.OnGround || Body.OnRope) return false;
            Sitting = itemId;
            Body.Vx = 0;
            Out.Add(GameEventType.SatDown, itemId, x: Body.X, y: Body.Y);
            return true;
        }

        public void StandUp()
        {
            if (Sitting == null) return;
            Sitting = null;
            regenT = 0;
            Out.Add(GameEventType.StoodUp, x: Body.X, y: Body.Y);
        }

        /// <summary>自然回復の倍率（座っている椅子）。</summary>
        public double RegenMul => Sitting != null ? Math.Max(1, Data.Item(Sitting)?.ChairRegenMul ?? 1) : 1;

        // ---------------- 毎フレームの入口（GameSession.cs から）

        /// <summary>物理の前: 座っている時に動くキーを押したら立つ。座っている間は動かない。</summary>
        private void PreStepTown(ref PlayerInput inp)
        {
            if (Sitting == null) return;
            if (inp.Left || inp.Right || inp.Jump || inp.JumpPressed || inp.Up || inp.Down || inp.Attack || inp.SkillPressed != null || Dead || !Body.OnGround)
            {
                StandUp();
                return;
            }
        }

        private void TickTown(double dt)
        {
            TickRoom(dt);
            TickPets(dt);
            if (Sitting != null) Pose.Motion = "sit";
        }

        /// <summary>NPC の会話の窓に町の仕組みを足す（Talk から）。</summary>
        private void FillTownDialog(NpcDialog d)
        {
            var n = d.Npc;
            d.Role = n.Role;
            d.Taxi = n.Taxi;
            d.Storage = n.Role == "storage";
            d.Crafts = CraftsAt(n.Id);
            if (d.Shop != null && Data.Shops.TryGetValue(d.Shop, out var sh)) d.ShopRecharge = sh.Recharge;
        }

        // ---------------- セーブ（GameSession.cs の ToSaveData / FromSave から）

        private void WriteTownSave(SaveData s)
        {
            foreach (var kv in Daily.Entries) s.Daily[kv.Key] = new[] { kv.Value.day, kv.Value.count };
            foreach (var p in Pets)
                s.Pets.Add(new SavedPet { Kind = p.Kind, Name = p.Name, Fullness = p.Fullness, Points = p.Points, Out = p.Out, Pickup = p.SkillPickup, Range = p.SkillRange, Potion = p.SkillPotion });
            // 制限時間のある部屋の中では保存しない（続きは戻り先から）
            var rule = CurrentRoom;
            if (rule != null && !Dead && (roomTimerOn || rule.Fresh))
            {
                s.Map = rule.Exit; s.X = 0; s.Y = 0;
            }
        }

        private void ReadTownSave(SaveData s)
        {
            foreach (var kv in s.Daily) if (kv.Value != null && kv.Value.Length == 2) Daily.Entries[kv.Key] = (kv.Value[0], kv.Value[1]);
            foreach (var p in s.Pets)
            {
                if (Data.Systems.Pets.Kind(p.Kind) == null) continue;
                Pets.Add(new PetState { Kind = p.Kind, Name = p.Name, Fullness = p.Fullness, Points = p.Points, Out = p.Out, SkillPickup = p.Pickup, SkillRange = p.Range, SkillPotion = p.Potion, X = Body?.X ?? 0, Y = Body?.Y ?? 0 });
            }
        }
    }
}
