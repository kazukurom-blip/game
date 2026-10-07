// 持ち物（ITEMS.md 1 章）: 5 つのタブ・枠の数・同じ物は 1 枠に重なる・お金。
using System;
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Items
{
    /// <summary>持ち物の 1 枠の中身。重なる物は Count、装備は 1 つずつ（その装備だけの値を持つ）。</summary>
    public sealed class ItemInstance
    {
        public string ItemId;
        public int Count = 1;
        // 装備だけ
        public StatBlock Stats;         // その装備の実際の値（基本値のぶれ・書で上がった分を含む）
        public int UpgradesLeft;        // 書を使える残りの回数
        public int Upgraded;            // 書が成功した回数（名前の後ろに +N と出す）
        public bool Quality;            // 上質（落とした装備の 1%）

        public ItemInstance Clone()
        {
            return new ItemInstance { ItemId = ItemId, Count = Count, Stats = Stats?.Clone(), UpgradesLeft = UpgradesLeft, Upgraded = Upgraded, Quality = Quality };
        }

        /// <summary>店で買った・クエストでもらった装備（ふつうの値）。</summary>
        public static ItemInstance NewEquip(ItemDef def)
        {
            return new ItemInstance { ItemId = def.Id, Count = 1, Stats = def.Stats.Clone(), UpgradesLeft = def.Upgrades };
        }

        /// <summary>敵が落とした装備: 基本値が ±（最大 5%、最低 1）ぶれる。1% で上質（+10%）。</summary>
        public static ItemInstance DroppedEquip(ItemDef def, IRandom rng)
        {
            var it = NewEquip(def);
            foreach (var k in StatBlock.Keys)
            {
                int v = it.Stats.Get(k);
                if (v == 0) continue;
                int spread = Math.Max(1, (int)Math.Round(Math.Abs(v) * 0.05));
                it.Stats.Set(k, Math.Max(0, v + rng.Range(-spread, spread)));
            }
            if (rng.Chance(0.01))
            {
                it.Quality = true;
                foreach (var k in StatBlock.Keys)
                {
                    int v = it.Stats.Get(k);
                    if (v > 0) it.Stats.Set(k, v + Math.Max(1, (int)Math.Round(v * 0.1)));
                }
            }
            return it;
        }
    }

    public sealed class Inventory
    {
        public const int StartSlots = 24;
        public const int MaxSlots = 96;

        private readonly ItemInstance[][] tabs = new ItemInstance[5][];
        private readonly Func<string, ItemDef> lookup;
        public long Meso;
        public const long MaxMeso = 2147483647; // クラシックの上限（21 億）

        public Inventory(Func<string, ItemDef> lookup)
        {
            this.lookup = lookup;
            for (int i = 0; i < 5; i++) tabs[i] = new ItemInstance[StartSlots];
        }

        public int SlotCount(InvTab tab) => tabs[(int)tab].Length;
        public ItemInstance Get(InvTab tab, int slot) => slot >= 0 && slot < tabs[(int)tab].Length ? tabs[(int)tab][slot] : null;
        public void SetRaw(InvTab tab, int slot, ItemInstance it) { tabs[(int)tab][slot] = it; }

        public IEnumerable<(InvTab tab, int slot, ItemInstance item)> All()
        {
            for (int t = 0; t < 5; t++)
                for (int s = 0; s < tabs[t].Length; s++)
                    if (tabs[t][s] != null) yield return ((InvTab)t, s, tabs[t][s]);
        }

        /// <summary>枠を増やす（転職のたびに装備・消費・その他 +4、持ち物の袋）。</summary>
        public void Expand(InvTab tab, int add)
        {
            var old = tabs[(int)tab];
            int n = Math.Min(MaxSlots, old.Length + add);
            if (n == old.Length) return;
            var nw = new ItemInstance[n];
            Array.Copy(old, nw, old.Length);
            tabs[(int)tab] = nw;
        }

        public void SetSlotCount(InvTab tab, int n)
        {
            n = Math.Max(1, Math.Min(MaxSlots, n));
            var old = tabs[(int)tab];
            var nw = new ItemInstance[n];
            Array.Copy(old, nw, Math.Min(old.Length, n));
            tabs[(int)tab] = nw;
        }

        public int FreeSlots(InvTab tab)
        {
            int n = 0;
            foreach (var it in tabs[(int)tab]) if (it == null) n++;
            return n;
        }

        public int Count(string itemId)
        {
            var def = lookup(itemId);
            if (def == null) return 0;
            int n = 0;
            foreach (var it in tabs[(int)def.Tab]) if (it != null && it.ItemId == itemId) n += it.Count;
            return n;
        }

        public bool Has(string itemId, int count = 1) => Count(itemId) >= count;

        /// <summary>count 個入るか（重なる物は既にある枠の空きも数える）</summary>
        public bool CanAdd(string itemId, int count = 1)
        {
            var def = lookup(itemId);
            if (def == null || count <= 0) return false;
            var tab = tabs[(int)def.Tab];
            int room = 0;
            foreach (var it in tab)
            {
                if (it == null) room += def.MaxStack;
                else if (it.ItemId == itemId && def.Stackable) room += Math.Max(0, def.MaxStack - it.Count);
                if (room >= count) return true;
            }
            return room >= count;
        }

        /// <summary>アイテムを入れる。入らなかった数を返す（0 なら全部入った）。装備は 1 つずつ新しい値で作る。</summary>
        public int Add(string itemId, int count = 1)
        {
            var def = lookup(itemId);
            if (def == null || count <= 0) return count;
            if (def.IsEquip)
            {
                int left = count;
                while (left > 0 && AddInstance(ItemInstance.NewEquip(def)) >= 0) left--;
                return left;
            }
            var tab = tabs[(int)def.Tab];
            int rest = count;
            if (def.Stackable)
            {
                for (int i = 0; i < tab.Length && rest > 0; i++)
                {
                    var it = tab[i];
                    if (it == null || it.ItemId != itemId || it.Count >= def.MaxStack) continue;
                    int put = Math.Min(rest, def.MaxStack - it.Count);
                    it.Count += put; rest -= put;
                }
            }
            for (int i = 0; i < tab.Length && rest > 0; i++)
            {
                if (tab[i] != null) continue;
                int put = Math.Min(rest, def.MaxStack);
                tab[i] = new ItemInstance { ItemId = itemId, Count = put };
                rest -= put;
            }
            return rest;
        }

        /// <summary>1 つの装備（値を持つ物）をそのまま入れる。入った枠の番号、入らなければ -1。</summary>
        public int AddInstance(ItemInstance inst)
        {
            var def = lookup(inst.ItemId);
            if (def == null) return -1;
            if (!def.IsEquip)
            {
                int rest = Add(inst.ItemId, inst.Count);
                return rest == 0 ? 0 : -1;
            }
            var tab = tabs[(int)def.Tab];
            for (int i = 0; i < tab.Length; i++)
            {
                if (tab[i] == null) { tab[i] = inst; return i; }
            }
            return -1;
        }

        /// <summary>同じ ID の物を count 個減らす（足りなければ何もしないで false）。</summary>
        public bool Remove(string itemId, int count = 1)
        {
            if (Count(itemId) < count) return false;
            var def = lookup(itemId);
            var tab = tabs[(int)def.Tab];
            int rest = count;
            for (int i = tab.Length - 1; i >= 0 && rest > 0; i--)
            {
                var it = tab[i];
                if (it == null || it.ItemId != itemId) continue;
                int take = Math.Min(rest, it.Count);
                it.Count -= take; rest -= take;
                if (it.Count <= 0) tab[i] = null;
            }
            return true;
        }

        /// <summary>枠から取り出す（count が中身以上なら枠ごと）。取り出した物を返す。</summary>
        public ItemInstance TakeAt(InvTab tab, int slot, int count = int.MaxValue)
        {
            var it = Get(tab, slot);
            if (it == null) return null;
            if (count >= it.Count) { tabs[(int)tab][slot] = null; return it; }
            it.Count -= count;
            var part = it.Clone(); part.Count = count;
            return part;
        }

        public bool Swap(InvTab tab, int a, int b)
        {
            var t = tabs[(int)tab];
            if (a < 0 || b < 0 || a >= t.Length || b >= t.Length) return false;
            var x = t[a]; t[a] = t[b]; t[b] = x;
            return true;
        }

        /// <summary>種類順に並べ替え（同じ物は重ね直す）。</summary>
        public void Sort(InvTab tab)
        {
            var list = new List<ItemInstance>();
            foreach (var it in tabs[(int)tab]) if (it != null) list.Add(it);
            list.Sort((x, y) => string.CompareOrdinal(x.ItemId, y.ItemId));
            var t = tabs[(int)tab];
            for (int i = 0; i < t.Length; i++) t[i] = null;
            foreach (var it in list)
            {
                var def = lookup(it.ItemId);
                if (def != null && !def.IsEquip) Add(it.ItemId, it.Count);
                else AddInstance(it);
            }
        }

        public bool AddMeso(long amount)
        {
            if (amount < 0 && Meso + amount < 0) return false;
            Meso = Math.Min(MaxMeso, Meso + amount);
            return true;
        }
    }
}
