// 倉庫（ITEMS.md 1 章・UI.md 6 章）。どの町の倉庫番でも同じ中身。最初 16 枠・4 枠ずつ 48 まで。タブ無し。お金も預けられる。
// セーブの枠のキャラ全員で共有する: 中身は SaveStore の "account" の枠（AccountData）に、キャラのセーブとは別に保存する。
using System;
using System.Collections.Generic;
using Lumina.Core.Items;
using Lumina.Core.Save;
using Lumina.Core.Util;

namespace Lumina.Core.Town
{
    public sealed class Storage
    {
        public int Slots;
        public long Meso;
        /// <summary>枠ごとの中身（Count 個まで。null は空き）。並びは UI の 48 マスの順。</summary>
        public readonly List<ItemInstance> Items = new List<ItemInstance>();

        public Storage(int slots) { Slots = slots; }

        public int Used { get { int n = 0; foreach (var it in Items) if (it != null) n++; return n; } }

        public int Count(string itemId)
        {
            int n = 0;
            foreach (var it in Items) if (it != null && it.ItemId == itemId) n += it.Count;
            return n;
        }

        /// <summary>入るか（重なる物は今ある枠の空きも使う）。</summary>
        public bool CanPut(ItemDef def, int count)
        {
            int room = 0;
            if (def.Stackable) foreach (var it in Items) if (it != null && it.ItemId == def.Id) room += Math.Max(0, def.MaxStack - it.Count);
            if (room >= count) return true;
            int free = Slots - Used;
            return def.Stackable ? room + free * def.MaxStack >= count : free >= 1;
        }

        /// <summary>入れる（CanPut を確かめてから呼ぶ）。</summary>
        public void Put(ItemDef def, ItemInstance it)
        {
            int rest = it.Count;
            if (def.Stackable)
                foreach (var x in Items)
                {
                    if (rest <= 0) break;
                    if (x == null || x.ItemId != def.Id || x.Count >= def.MaxStack) continue;
                    int put = Math.Min(rest, def.MaxStack - x.Count);
                    x.Count += put; rest -= put;
                }
            while (rest > 0)
            {
                int put = def.Stackable ? Math.Min(rest, def.MaxStack) : rest;
                var n = it.Clone(); n.Count = put;
                int hole = Items.IndexOf(null);
                if (hole >= 0) Items[hole] = n; else Items.Add(n);
                rest -= put;
            }
        }

        /// <summary>枠から count 個取り出す（count が中身以上なら枠ごと）。</summary>
        public ItemInstance Take(int index, int count)
        {
            if (index < 0 || index >= Items.Count || Items[index] == null) return null;
            var it = Items[index];
            if (count >= it.Count) { Items[index] = null; Compact(); return it; }
            it.Count -= count;
            var part = it.Clone(); part.Count = count;
            return part;
        }

        private void Compact() { Items.RemoveAll(x => x == null); }
    }

    /// <summary>キャラ全員で共有する物（今は倉庫だけ）。SaveStore の "account" の枠に保存する。</summary>
    public static class AccountData
    {
        public const string Slot = "account";
        public const string Format = "lumina-account";

        public static string ToJson(Storage st)
        {
            var w = new JsonWriter();
            w.BeginObject().Prop("format", Format).Prop("version", 1);
            w.Key("storage").BeginObject().Prop("slots", st.Slots).Prop("meso", st.Meso);
            w.Key("items").BeginArray();
            foreach (var it in st.Items)
            {
                if (it == null) continue;
                w.BeginObject().Prop("id", it.ItemId).Prop("count", it.Count);
                if (it.Stats != null)
                {
                    w.Key("stats").BeginObject();
                    foreach (var kv in it.Stats.ToDict()) w.Prop(kv.Key, (long)kv.Value);
                    w.EndObject();
                    w.Prop("upgLeft", it.UpgradesLeft).Prop("upg", it.Upgraded).Prop("quality", it.Quality);
                }
                w.EndObject();
            }
            w.EndArray().EndObject().EndObject();
            return w.ToString();
        }

        /// <summary>読めれば null、読めなければ理由（SaveStore の確かめ方）。</summary>
        public static string Check(string body)
        {
            try { var d = Json.ParseObject(body); return J.Str(d, "format") == Format ? null : "アカウントの形でない"; }
            catch (Exception e) { return "読めない: " + e.Message; }
        }

        /// <summary>JSON から倉庫を作る。データに無いアイテムは外して lost に入れる。</summary>
        public static Storage FromJson(string body, Func<string, ItemDef> lookup, int startSlots, List<string> lost)
        {
            var d = Json.ParseObject(body);
            var sd = J.Obj(d, "storage");
            var st = new Storage(Math.Max(startSlots, J.Int(sd, "slots", startSlots))) { Meso = J.Long(sd, "meso") };
            foreach (var o in J.Arr(sd, "items"))
            {
                var x = (Dictionary<string, object>)o;
                var id = J.Str(x, "id");
                var def = lookup(id);
                if (def == null) { lost?.Add(id); continue; }
                var it = new ItemInstance { ItemId = id, Count = Math.Max(1, J.Int(x, "count", 1)) };
                if (J.Has(x, "stats"))
                {
                    it.Stats = StatBlock.FromDict(J.Obj(x, "stats"));
                    it.UpgradesLeft = J.Int(x, "upgLeft"); it.Upgraded = J.Int(x, "upg"); it.Quality = J.Bool(x, "quality");
                }
                else if (def.IsEquip) it = ItemInstance.NewEquip(def);
                st.Items.Add(it);
            }
            return st;
        }
    }
}
