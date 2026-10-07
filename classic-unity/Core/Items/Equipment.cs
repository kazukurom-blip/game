// 装備（ITEMS.md 2 章）: 部位・職の制限・必要 Lv/能力・全身と上下・両手武器と盾。
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Combat;

namespace Lumina.Core.Items
{
    public enum EquipResult { Ok, NotEquip, WrongJob, LevelTooLow, StatTooLow, InventoryFull, Empty }

    public sealed class Equipment
    {
        private readonly Dictionary<EquipSlot, ItemInstance> slots = new Dictionary<EquipSlot, ItemInstance>();
        private readonly System.Func<string, ItemDef> lookup;

        public Equipment(System.Func<string, ItemDef> lookup) { this.lookup = lookup; }

        public ItemInstance Get(EquipSlot s) => slots.TryGetValue(s, out var it) ? it : null;
        public IEnumerable<KeyValuePair<EquipSlot, ItemInstance>> All => slots;
        public void SetRaw(EquipSlot s, ItemInstance it) { if (it == null) slots.Remove(s); else slots[s] = it; }

        public ItemDef WeaponDef => Get(EquipSlot.Weapon) is ItemInstance w ? lookup(w.ItemId) : null;
        public string WeaponType => WeaponDef?.WeaponType;

        /// <summary>装備の能力の合計（見た目だけの物は 0）</summary>
        public StatBlock TotalStats()
        {
            var t = new StatBlock();
            foreach (var kv in slots) if (kv.Value.Stats != null) t.Add(kv.Value.Stats);
            return t;
        }

        /// <summary>その職がこの装備を使えるか。初心者は共通だけ。</summary>
        public static bool JobAllows(ItemDef def, CharacterState c)
        {
            if (def.Job == null || def.Job == "common") return true;
            if (c.Tier == 0 || c.Line == JobLine.Beginner) return false;
            return def.Job == c.Line;
        }

        /// <summary>必要な条件（職・Lv・能力）。能力は AP で振った値＋ほかの装備の分で比べる。</summary>
        public EquipResult CheckRequirements(ItemDef def, CharacterState c, StatBlock otherEquip)
        {
            if (def == null || !def.IsEquip) return EquipResult.NotEquip;
            if (!JobAllows(def, c)) return EquipResult.WrongJob;
            if (c.Level < def.ReqLevel) return EquipResult.LevelTooLow;
            if (def.ReqStat != Stat.None)
            {
                int have = c.GetStat(def.ReqStat);
                if (otherEquip != null)
                {
                    switch (def.ReqStat)
                    {
                        case Stat.STR: have += otherEquip.Str; break;
                        case Stat.DEX: have += otherEquip.Dex; break;
                        case Stat.INT: have += otherEquip.Int; break;
                        case Stat.LUK: have += otherEquip.Luk; break;
                    }
                }
                if (have < def.ReqValue) return EquipResult.StatTooLow;
            }
            return EquipResult.Ok;
        }

        /// <summary>持ち物の装備タブの slot の物を装備する。前に付けていた物は持ち物へ戻す。</summary>
        public EquipResult EquipFromInventory(Inventory inv, int slot, CharacterState c)
        {
            var inst = inv.Get(InvTab.Equip, slot);
            if (inst == null) return EquipResult.Empty;
            var def = lookup(inst.ItemId);
            var others = TotalStats();
            var r = CheckRequirements(def, c, others);
            if (r != EquipResult.Ok) return r;

            var target = def.Slot;
            if (target == EquipSlot.Ring1) target = Get(EquipSlot.Ring1) == null ? EquipSlot.Ring1 : (Get(EquipSlot.Ring2) == null ? EquipSlot.Ring2 : EquipSlot.Ring1);

            // 外す物: 同じ部位・全身⇔上下・両手武器⇔盾
            var remove = new List<EquipSlot> { target };
            if (target == EquipSlot.Overall) { remove.Add(EquipSlot.Top); remove.Add(EquipSlot.Bottom); }
            if (target == EquipSlot.Top || target == EquipSlot.Bottom) remove.Add(EquipSlot.Overall);
            if (target == EquipSlot.Weapon && (def.TwoHanded || !def.AllowsShield)) remove.Add(EquipSlot.Shield);
            if (target == EquipSlot.Shield)
            {
                var w = WeaponDef;
                if (w != null && (w.TwoHanded || !w.AllowsShield)) remove.Add(EquipSlot.Weapon);
            }
            var toReturn = new List<ItemInstance>();
            foreach (var s in remove) if (Get(s) != null) toReturn.Add(Get(s));
            // 取り出す枠が 1 つ空くので、戻す物 - 1 個ぶんの空きが要る
            if (toReturn.Count - 1 > inv.FreeSlots(InvTab.Equip)) return EquipResult.InventoryFull;

            inv.TakeAt(InvTab.Equip, slot);
            foreach (var s in remove) slots.Remove(s);
            slots[target] = inst;
            // 1 つ目は空いた同じ枠へ（クラシックの入れ替え）
            bool first = true;
            foreach (var old in toReturn)
            {
                if (first && inv.Get(InvTab.Equip, slot) == null) { inv.SetRaw(InvTab.Equip, slot, old); first = false; continue; }
                inv.AddInstance(old);
            }
            return EquipResult.Ok;
        }

        /// <summary>外して持ち物へ。</summary>
        public EquipResult Unequip(EquipSlot s, Inventory inv)
        {
            var it = Get(s);
            if (it == null) return EquipResult.Empty;
            if (inv.FreeSlots(InvTab.Equip) <= 0) return EquipResult.InventoryFull;
            slots.Remove(s);
            inv.AddInstance(it);
            return EquipResult.Ok;
        }
    }
}
