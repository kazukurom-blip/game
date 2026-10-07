// アイテム・装備・書・店・宿屋・クイックスロット・AP/SP（GameSession の続き）。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Skills;
using Lumina.Core.Status;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum ShopResult { Ok, NoShopHere, NotSold, NotEnoughMeso, InventoryFull, NotEnough, CannotSell }

    public sealed partial class GameSession
    {
        // ---------------- 拾う

        /// <summary>足元の物を 1 つ拾う（拾うキーを押している間くり返す）。</summary>
        public bool TryPickup()
        {
            var d = Map.DropAt(Body.X, Body.Y);
            if (d == null) return false;
            return PickupDrop(d);
        }

        /// <summary>落ちている物を 1 つ拾う（足元の物・ペットの「自動で拾う」）。</summary>
        public bool PickupDrop(DropItem d)
        {
            if (d == null || d.PickedUp || !d.Landed) return false;
            if (d.IsMeso)
            {
                Inventory.AddMeso(d.Meso);
                d.PickedUp = true;
                Out.Add(GameEventType.MesoPicked, null, d.Meso, d.X, d.Y);
                return true;
            }
            var def = Data.Item(d.ItemId);
            if (def == null) { d.PickedUp = true; return false; }
            if (d.Equip != null)
            {
                if (Inventory.AddInstance(d.Equip) < 0) { Out.Add(GameEventType.InventoryFull, d.ItemId, text: "持ち物がいっぱい"); return false; }
            }
            else
            {
                int rest = Inventory.Add(d.ItemId, d.Count);
                if (rest == d.Count) { Out.Add(GameEventType.InventoryFull, d.ItemId, text: "持ち物がいっぱい"); return false; }
                if (rest > 0) { d.Count = rest; Out.Add(GameEventType.ItemPicked, d.ItemId, d.Count - rest, d.X, d.Y, def.Name); return true; }
            }
            d.PickedUp = true;
            Out.Add(GameEventType.ItemPicked, d.ItemId, d.Count, d.X, d.Y, def.Name);
            CollectNotes(d.ItemId);
            RefreshStats();
            return true;
        }

        // 集める目的の数が変わったお知らせ
        private void CollectNotes(string itemId)
        {
            foreach (var q in Quests.InProgress())
                for (int i = 0; i < q.Objectives.Count; i++)
                    if (q.Objectives[i].Type == ObjectiveType.Collect && q.Objectives[i].Target == itemId)
                        OnQuestNote(new QuestProgressNote { QuestId = q.Id, ObjectiveIndex = i, Count = Math.Min(Inventory.Count(itemId), q.Objectives[i].Count), Need = q.Objectives[i].Count });
        }

        // ---------------- 使う

        /// <summary>消費アイテムを使う（薬・強化の薬・帰還の書）。</summary>
        public bool UseItem(string itemId)
        {
            var def = Data.Item(itemId);
            if (def == null || !Inventory.Has(itemId) || Dead) return false;
            var pet = TryUsePetItem(def); // ペット・餌・技の本（GameSession.Pets.cs）
            if (pet.HasValue) return pet.Value;
            if (def.IsChair) { if (Sitting == itemId) { StandUp(); return true; } return SitOnChair(itemId); } // 椅子（GameSession.Town.cs）
            if (def.Use == null) return false;
            var u = def.Use;
            if (u.ReturnTo != null)
            {
                string to = u.ReturnTo == "nearest" ? (Map.Data.ReturnMap ?? StartMap) : u.ReturnTo;
                if (u.ReturnRegion != null && Map.Data.Region != u.ReturnRegion)
                {
                    Out.Add(GameEventType.Message, itemId, text: "この地域では使えない");
                    return false;
                }
                Inventory.Remove(itemId);
                Out.Add(GameEventType.ItemUsed, itemId);
                var md = Data.GetMap(to);
                ChangeMap(to, md?.FindPortalByName("town") != null ? "town" : null);
                return true;
            }
            bool did = false;
            if (u.Hp > 0) { HealHp(u.Hp); did = true; }
            if (u.Mp > 0) { HealMp(u.Mp); did = true; }
            if (u.HpPct > 0) { HealHp((int)Math.Floor(Stats.MaxHp * u.HpPct)); did = true; }
            if (u.MpPct > 0) { HealMp((int)Math.Floor(Stats.MaxMp * u.MpPct)); did = true; }
            bool potion = did;
            if (u.Buff != null && u.BuffSec > 0)
            {
                Buffs.Apply(new ActiveBuff { Id = itemId, Name = def.Name, Stats = u.Buff.Clone(), Total = u.BuffSec, Remaining = u.BuffSec });
                Out.Add(GameEventType.BuffStarted, itemId, (long)u.BuffSec);
                did = true;
            }
            // 解毒薬・目薬・聖水・万能薬（治す物が無くても使える。クラシックどおり）
            var cure = new List<StatusKind>();
            foreach (var key in u.Cure) if (StatusSystem.TryParse(key, out var k)) cure.Add(k);
            if (u.Cure.Count > 0) did = true;
            if (!did) return false;
            Inventory.Remove(itemId);
            if (cure.Count > 0) CureStatus(cure);
            Out.Add(GameEventType.ItemUsed, itemId);
            if (potion) QuestEvent("use_potion");
            RefreshStats();
            return true;
        }

        /// <summary>クイックスロット（16 個）に置く。kind = "skill" / "item"。</summary>
        public void SetQuickSlot(int key, string kind, string id)
        {
            if (key < 0 || key >= QuickSlotCount) return;
            QuickSlots[key] = id == null ? null : new QuickSlot { Kind = kind, Id = id };
            QuestEvent("quickslot_set");
        }

        /// <summary>クイックスロットのキーを押した（Unity 側の入力からはこれか PlayerInput.SkillPressed/ItemPressed）。</summary>
        public void PressQuickSlot(int key)
        {
            var q = key >= 0 && key < QuickSlotCount ? QuickSlots[key] : null;
            if (q == null) return;
            if (q.Kind == "skill") UseSkill(q.Id); else UseItem(q.Id);
        }

        // ---------------- 装備

        public EquipResult EquipFromInventory(int equipTabSlot)
        {
            var r = Equipment.EquipFromInventory(Inventory, equipTabSlot, Character);
            if (r == EquipResult.Ok) { RefreshStats(); Out.Add(GameEventType.EquipChanged); }
            else Out.Add(GameEventType.Message, text: EquipMessage(r));
            return r;
        }

        /// <summary>持ち物にある最初のその装備を着る（テスト・道具用）。</summary>
        public EquipResult EquipItem(string itemId)
        {
            for (int i = 0; i < Inventory.SlotCount(InvTab.Equip); i++)
                if (Inventory.Get(InvTab.Equip, i)?.ItemId == itemId) return EquipFromInventory(i);
            return EquipResult.Empty;
        }

        public EquipResult Unequip(EquipSlot slot)
        {
            var r = Equipment.Unequip(slot, Inventory);
            if (r == EquipResult.Ok) { RefreshStats(); Out.Add(GameEventType.EquipChanged); }
            return r;
        }

        private static string EquipMessage(EquipResult r)
        {
            switch (r)
            {
                case EquipResult.WrongJob: return "この職では装備できない";
                case EquipResult.LevelTooLow: return "Lv が足りない";
                case EquipResult.StatTooLow: return "能力値が足りない";
                case EquipResult.InventoryFull: return "持ち物がいっぱい";
                default: return "装備できない";
            }
        }

        // ---------------- 書

        /// <summary>着ている装備に書を使う。</summary>
        public ScrollResult ApplyScrollToEquipped(string scrollId, EquipSlot slot)
        {
            var it = Equipment.Get(slot);
            if (it == null) return ScrollResult.WrongTarget;
            var r = ApplyScroll(scrollId, it);
            if (r == ScrollResult.Destroyed) Equipment.SetRaw(slot, null);
            RefreshStats();
            return r;
        }

        /// <summary>持ち物の装備に書を使う。</summary>
        public ScrollResult ApplyScrollToInventory(string scrollId, int equipTabSlot)
        {
            var it = Inventory.Get(InvTab.Equip, equipTabSlot);
            if (it == null) return ScrollResult.WrongTarget;
            var r = ApplyScroll(scrollId, it);
            if (r == ScrollResult.Destroyed) Inventory.TakeAt(InvTab.Equip, equipTabSlot);
            return r;
        }

        private ScrollResult ApplyScroll(string scrollId, ItemInstance target)
        {
            var sdef = Data.Item(scrollId);
            if (sdef?.Scroll == null || !Inventory.Has(scrollId)) return ScrollResult.NotScroll;
            var r = ScrollSystem.Apply(sdef, Data.Item(target.ItemId), target, Rng);
            if (r == ScrollResult.Success || r == ScrollResult.Fail || r == ScrollResult.Destroyed) Inventory.Remove(scrollId);
            Out.Add(GameEventType.ScrollResult, scrollId, (long)r, text: r == ScrollResult.Success ? "書の力で強くなった" : r == ScrollResult.Destroyed ? "装備が壊れてしまった" : r == ScrollResult.Fail ? "書は失敗した" : null);
            return r;
        }

        // ---------------- 店・宿屋

        private bool ShopHere(string shopId)
        {
            foreach (var n in Map.Data.Npcs) if (n.Shop == shopId) return true;
            return false;
        }

        /// <summary>店で買う。count は個数（弾・矢・投げ星は 1 束ごと）。</summary>
        public ShopResult Buy(string shopId, string itemId, int count = 1)
        {
            if (!Data.Shops.TryGetValue(shopId, out var shop) || !ShopHere(shopId)) return ShopResult.NoShopHere;
            var e = ShopItems(shopId).Find(x => x.Item == itemId); // 日替わりの店は今日の品だけ
            if (e == null) return ShopResult.NotSold;
            if (count <= 0) return ShopResult.NotEnough;
            long cost = e.Price * count;
            if (Inventory.Meso < cost) return ShopResult.NotEnoughMeso;
            int qty = count * Math.Max(1, e.Bundle);
            if (!Inventory.CanAdd(itemId, qty)) return ShopResult.InventoryFull;
            Inventory.AddMeso(-cost);
            Inventory.Add(itemId, qty);
            Out.Add(GameEventType.ItemBought, itemId, qty);
            CollectNotes(itemId);
            RefreshStats();
            return ShopResult.Ok;
        }

        /// <summary>店に売る（装備は値段の 1/5、そのほかは決まった値段。クエストの品は売れない）。</summary>
        public ShopResult Sell(InvTab tab, int slot, int count = 1)
        {
            bool shopHere = false;
            foreach (var n in Map.Data.Npcs) if (n.Shop != null) shopHere = true;
            if (!shopHere) return ShopResult.NoShopHere;
            var it = Inventory.Get(tab, slot);
            if (it == null) return ShopResult.NotEnough;
            var def = Data.Item(it.ItemId);
            if (def == null || def.Quest) return ShopResult.CannotSell;
            count = Math.Min(count, it.Count);
            long gain = def.AmmoKind != null ? def.SellPrice * count / Math.Max(1, def.MaxStack) : def.SellPrice * count;
            Inventory.TakeAt(tab, slot, count);
            Inventory.AddMeso(gain);
            Out.Add(GameEventType.ItemSold, def.Id, gain);
            RefreshStats();
            return ShopResult.Ok;
        }

        /// <summary>宿屋に泊まる（HP/MP 全回復、お金）。</summary>
        public bool RestAtInn(string npcId)
        {
            var n = Map.Npc(npcId);
            if (n == null || n.InnFee < 0 || Inventory.Meso < n.InnFee) return false;
            Inventory.AddMeso(-n.InnFee);
            Character.Hp = Stats.MaxHp; Character.Mp = Stats.MaxMp;
            Out.Add(GameEventType.Healed, npcId, Stats.MaxHp, text: "ぐっすり休んだ");
            return true;
        }

        // ---------------- AP・SP・転職

        public bool SpendAp(Stat stat)
        {
            if (!Character.SpendAp(stat)) return false;
            Out.Add(GameEventType.ApChanged, stat.ToString(), Character.Ap);
            QuestEvent("ap_spent");
            RefreshStats();
            return true;
        }

        public bool SpendApHp()
        {
            if (!Character.SpendApHp(Skills.Growth(Character.Level))) return false;
            QuestEvent("ap_spent");
            RefreshStats();
            return true;
        }

        public bool SpendApMp()
        {
            if (!Character.SpendApMp(Skills.Growth(Character.Level))) return false;
            QuestEvent("ap_spent");
            RefreshStats();
            return true;
        }

        public LearnResult LearnSkill(string skillId)
        {
            var r = Skills.Learn(skillId, Character);
            if (r == LearnResult.Ok)
            {
                Out.Add(GameEventType.SpChanged, skillId, Skills.Level(skillId));
                QuestEvent("sp_spent");
                RefreshStats();
            }
            return r;
        }

        /// <summary>1 次転職（JOBS.md 3-1。試験は別）。持ち物の枠が装備・消費・その他で +4。</summary>
        public AdvanceResult AdvanceJob(string line)
        {
            var r = Character.AdvanceFirst(line, Rng);
            if (r != AdvanceResult.Ok) return r;
            AfterAdvance(1); // 持ち物の枠 +4・お知らせ・job_advance.1（GameSession.Jobs.cs。2〜4 次も同じ）
            return r;
        }
    }
}
