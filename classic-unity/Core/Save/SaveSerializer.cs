// セーブの JSON への書き出しと読み込み。版番号を見て古い版なら SaveMigrations で直してから読む。
using System;
using System.Collections.Generic;
using System.Globalization;
using Lumina.Core.Items;
using Lumina.Core.Util;

namespace Lumina.Core.Save
{
    public class SaveFormatException : Exception
    {
        public SaveFormatException(string m) : base(m) { }
    }

    public static class SaveSerializer
    {
        public static string ToJson(SaveData s, bool pretty = false)
        {
            var w = new JsonWriter(pretty);
            w.BeginObject();
            w.Prop("version", s.Version).Prop("seq", s.Seq).Prop("savedAt", s.SavedAt).Prop("playSec", s.PlaySec).Prop("reason", s.Reason);
            w.Key("character").BeginObject()
                .Prop("name", s.Name).Prop("line", s.Line).Prop("tier", s.Tier).Prop("branch", s.Branch).Prop("level", s.Level).Prop("exp", s.Exp)
                .Prop("str", s.Str).Prop("dex", s.Dex).Prop("int", s.Int).Prop("luk", s.Luk).Prop("ap", s.Ap);
            w.Key("sp").BeginArray(); foreach (var v in s.Sp) w.Number((long)v); w.EndArray();
            w.Prop("baseMaxHp", s.BaseMaxHp).Prop("baseMaxMp", s.BaseMaxMp).Prop("hp", s.Hp).Prop("mp", s.Mp).Prop("apHp", s.ApHp).Prop("apMp", s.ApMp);
            w.EndObject();

            w.Key("inventory").BeginObject().Prop("meso", s.Meso);
            w.Key("slots").BeginArray(); foreach (var v in s.Slots) w.Number((long)v); w.EndArray();
            w.Key("items").BeginArray();
            foreach (var it in s.Items) WriteItem(w, it, true);
            w.EndArray();
            w.EndObject();

            w.Key("equipment").BeginArray();
            foreach (var kv in s.Equipment)
            {
                w.BeginObject().Prop("slot", kv.Key).Key("item");
                WriteItem(w, kv.Value, false);
                w.EndObject();
            }
            w.EndArray();

            w.Key("skills").BeginObject(); foreach (var kv in s.Skills) w.Prop(kv.Key, kv.Value); w.EndObject();
            w.Key("cooldowns").BeginObject(); foreach (var kv in s.Cooldowns) w.Prop(kv.Key, kv.Value); w.EndObject();
            w.Key("skillMasters").BeginObject(); foreach (var kv in s.SkillMasters) w.Prop(kv.Key, kv.Value); w.EndObject();
            w.Key("quickslots").BeginArray();
            foreach (var q in s.QuickSlots) w.BeginObject().Prop("key", q.Key).Prop("kind", q.Kind).Prop("id", q.Id).EndObject();
            w.EndArray();
            w.Key("quests").BeginArray();
            foreach (var q in s.Quests)
            {
                w.BeginObject().Prop("id", q.Id).Prop("status", q.Status).Prop("at", q.At).Key("counts").BeginObject();
                foreach (var kv in q.Counts) w.Prop(kv.Key, kv.Value);
                w.EndObject().EndObject();
            }
            w.EndArray();
            w.Key("location").BeginObject().Prop("map", s.Map).Prop("x", s.X).Prop("y", s.Y).EndObject();
            w.Key("flags").BeginObject(); foreach (var kv in s.Flags) w.Prop(kv.Key, kv.Value); w.EndObject();
            w.Key("rng").BeginArray().String(s.Rng0).String(s.Rng1).EndArray();
            w.Key("pets").BeginArray();
            foreach (var p in s.Pets)
            {
                w.BeginObject().Prop("kind", p.Kind).Prop("name", p.Name).Prop("fullness", p.Fullness).Prop("points", p.Points).Prop("out", p.Out);
                w.Key("skills").BeginArray();
                if (p.Pickup) w.String("pickup");
                if (p.Range) w.String("range");
                if (p.Potion) w.String("potion");
                w.EndArray().EndObject();
            }
            w.EndArray();
            w.Key("daily").BeginObject();
            foreach (var kv in s.Daily) { w.Key(kv.Key).BeginArray(); foreach (var v in kv.Value) w.Number((long)v); w.EndArray(); }
            w.EndObject();
            w.Key("collection").Value(s.Collection ?? new Dictionary<string, object>());
            w.EndObject();
            return w.ToString();
        }

        private static void WriteItem(JsonWriter w, SavedItem it, bool withPos)
        {
            w.BeginObject();
            if (withPos) w.Prop("tab", it.Tab).Prop("slot", it.Slot);
            w.Prop("id", it.Id).Prop("count", it.Count);
            if (it.Stats != null)
            {
                w.Key("stats").BeginObject();
                foreach (var kv in it.Stats.ToDict()) w.Prop(kv.Key, (long)kv.Value);
                w.EndObject();
                w.Prop("upgLeft", it.UpgLeft).Prop("upg", it.Upg).Prop("quality", it.Quality);
            }
            w.EndObject();
        }

        /// <summary>JSON から読む。古い版は直してから読む。新しすぎる版・壊れた形は SaveFormatException。</summary>
        public static SaveData FromJson(string json)
        {
            Dictionary<string, object> d;
            try { d = Json.ParseObject(json); }
            catch (JsonException e) { throw new SaveFormatException("JSON として読めない: " + e.Message); }
            return FromDict(d);
        }

        public static SaveData FromDict(Dictionary<string, object> d)
        {
            int ver = J.Int(d, "version", 0);
            if (ver <= 0) throw new SaveFormatException("版番号が無い");
            if (ver > SaveMigrations.CurrentVersion) throw new SaveFormatException("このセーブは新しい版（" + ver + "）で作られている");
            d = SaveMigrations.Migrate(d, ver);

            var s = new SaveData
            {
                Version = SaveMigrations.CurrentVersion, Seq = J.Long(d, "seq"), SavedAt = J.Str(d, "savedAt"),
                PlaySec = J.Num(d, "playSec"), Reason = J.Str(d, "reason"),
            };
            var c = J.Obj(d, "character") ?? throw new SaveFormatException("character が無い");
            s.Name = J.Str(c, "name", ""); s.Line = J.Str(c, "line", "beginner"); s.Tier = J.Int(c, "tier"); s.Branch = J.Int(c, "branch");
            s.Level = J.Int(c, "level", 1); s.Exp = J.Long(c, "exp");
            s.Str = J.Int(c, "str", 4); s.Dex = J.Int(c, "dex", 4); s.Int = J.Int(c, "int", 4); s.Luk = J.Int(c, "luk", 4); s.Ap = J.Int(c, "ap");
            var sp = J.Arr(c, "sp");
            for (int i = 0; i < 5 && i < sp.Count; i++) s.Sp[i] = (int)J.ToDouble(sp[i]);
            s.BaseMaxHp = J.Int(c, "baseMaxHp", 50); s.BaseMaxMp = J.Int(c, "baseMaxMp", 5);
            s.Hp = J.Int(c, "hp", s.BaseMaxHp); s.Mp = J.Int(c, "mp", s.BaseMaxMp);
            s.ApHp = J.Int(c, "apHp"); s.ApMp = J.Int(c, "apMp");
            if (s.Level < 1 || s.Level > 200) throw new SaveFormatException("Lv が変: " + s.Level);

            var inv = J.Obj(d, "inventory") ?? throw new SaveFormatException("inventory が無い");
            s.Meso = J.Long(inv, "meso");
            var slots = J.Arr(inv, "slots");
            for (int i = 0; i < 5 && i < slots.Count; i++) s.Slots[i] = (int)J.ToDouble(slots[i]);
            foreach (var o in J.Arr(inv, "items")) s.Items.Add(ReadItem((Dictionary<string, object>)o, true));
            foreach (var o in J.Arr(d, "equipment"))
            {
                var e = (Dictionary<string, object>)o;
                s.Equipment[J.Str(e, "slot")] = ReadItem(J.Obj(e, "item"), false);
            }
            var sk = J.Obj(d, "skills");
            if (sk != null) foreach (var kv in sk) s.Skills[kv.Key] = (int)J.ToDouble(kv.Value);
            var cd = J.Obj(d, "cooldowns");
            if (cd != null) foreach (var kv in cd) s.Cooldowns[kv.Key] = J.ToDouble(kv.Value);
            var sm = J.Obj(d, "skillMasters");
            if (sm != null) foreach (var kv in sm) s.SkillMasters[kv.Key] = (int)J.ToDouble(kv.Value);
            foreach (var o in J.Arr(d, "quickslots"))
            {
                var q = (Dictionary<string, object>)o;
                s.QuickSlots.Add(new SavedQuickSlot { Key = J.Int(q, "key"), Kind = J.Str(q, "kind"), Id = J.Str(q, "id") });
            }
            foreach (var o in J.Arr(d, "quests"))
            {
                var q = (Dictionary<string, object>)o;
                var sq = new SavedQuest { Id = J.Str(q, "id"), Status = J.Str(q, "status", "active"), At = J.Long(q, "at") };
                var counts = J.Obj(q, "counts");
                if (counts != null) foreach (var kv in counts) sq.Counts[kv.Key] = (int)J.ToDouble(kv.Value);
                s.Quests.Add(sq);
            }
            var loc = J.Obj(d, "location") ?? throw new SaveFormatException("location が無い");
            s.Map = J.Str(loc, "map"); s.X = J.Num(loc, "x"); s.Y = J.Num(loc, "y");
            var fl = J.Obj(d, "flags");
            if (fl != null) foreach (var kv in fl) s.Flags[kv.Key] = kv.Value is bool b && b;
            var rng = J.Arr(d, "rng");
            if (rng.Count == 2) { s.Rng0 = rng[0] as string; s.Rng1 = rng[1] as string; }
            foreach (var o in J.Arr(d, "pets"))
            {
                var p = (Dictionary<string, object>)o;
                var skills = J.StrList(p, "skills");
                s.Pets.Add(new SavedPet
                {
                    Kind = J.Str(p, "kind"), Name = J.Str(p, "name", ""), Fullness = Math.Max(0, Math.Min(100, J.Int(p, "fullness", 100))), Points = Math.Max(0, J.Int(p, "points")),
                    Out = J.Bool(p, "out"), Pickup = skills.Contains("pickup"), Range = skills.Contains("range"), Potion = skills.Contains("potion"),
                });
            }
            var daily = J.Obj(d, "daily");
            if (daily != null)
                foreach (var kv in daily)
                {
                    var a = kv.Value as List<object>;
                    if (a != null && a.Count == 2) s.Daily[kv.Key] = new[] { (int)J.ToDouble(a[0]), (int)J.ToDouble(a[1]) };
                }
            s.Collection = J.Obj(d, "collection");
            return s;
        }

        private static SavedItem ReadItem(Dictionary<string, object> o, bool withPos)
        {
            if (o == null) throw new SaveFormatException("アイテムの形が変");
            var it = new SavedItem { Id = J.Str(o, "id"), Count = Math.Max(1, J.Int(o, "count", 1)) };
            if (it.Id == null) throw new SaveFormatException("アイテムの ID が無い");
            if (withPos) { it.Tab = J.Int(o, "tab"); it.Slot = J.Int(o, "slot"); }
            if (J.Has(o, "stats"))
            {
                it.Stats = StatBlock.FromDict(J.Obj(o, "stats"));
                it.UpgLeft = J.Int(o, "upgLeft"); it.Upg = J.Int(o, "upg"); it.Quality = J.Bool(o, "quality");
            }
            return it;
        }

        public static string UlongToHex(ulong v) => v.ToString("x16", CultureInfo.InvariantCulture);
        public static ulong HexToUlong(string s) => s != null && ulong.TryParse(s, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var v) ? v : 0;
    }
}
