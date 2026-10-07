// セーブの版の移行。版を上げる時は CurrentVersion を 1 増やし、Steps に「前の版 → 次の版」の直し方を 1 つ足す。
// 古いセーブは 1 → 2 → 3 … と順番に直してから読む（途中の版を飛ばさない）。
//
// 版 1（最初の形。平らな形）:
//   { "version": 1, "name", "job", "level", "exp", "str", "dex", "int", "luk", "ap", "hp", "mp", "maxHp", "maxMp",
//     "meso", "map", "x", "y", "items": [ { "id", "count" } ], "skills": { id: lv }, "quests": { id: "active"|"done" } }
// 版 2: キャラ・持ち物・装備・場所を分けた形。
// 版 3: 版 2 ＋ ペット（pets）と実時間の回数（daily）。版 2 には無いので空で足す。
// 版 4（今）: 版 3 ＋ やりこみ（collection: 図鑑・勲章・記録）。版 3 には無いので空で足す（記録は 0 から）。
using System;
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Save
{
    public static class SaveMigrations
    {
        public const int CurrentVersion = 4;

        private static readonly Dictionary<int, Func<Dictionary<string, object>, Dictionary<string, object>>> Steps =
            new Dictionary<int, Func<Dictionary<string, object>, Dictionary<string, object>>>
            {
                { 1, V1ToV2 },
                { 2, V2ToV3 },
                { 3, V3ToV4 },
            };

        public static Dictionary<string, object> Migrate(Dictionary<string, object> d, int fromVersion)
        {
            int v = fromVersion;
            while (v < CurrentVersion)
            {
                if (!Steps.TryGetValue(v, out var step)) throw new SaveFormatException("版 " + v + " からの直し方が無い");
                d = step(d);
                v++;
                d["version"] = (long)v;
            }
            return d;
        }

        private static Dictionary<string, object> V3ToV4(Dictionary<string, object> o)
        {
            if (!o.ContainsKey("collection")) o["collection"] = new Dictionary<string, object>();
            return o;
        }

        private static Dictionary<string, object> V2ToV3(Dictionary<string, object> o)
        {
            if (!o.ContainsKey("pets")) o["pets"] = new List<object>();
            if (!o.ContainsKey("daily")) o["daily"] = new Dictionary<string, object>();
            return o;
        }

        private static Dictionary<string, object> V1ToV2(Dictionary<string, object> o)
        {
            string job = J.Str(o, "job", "beginner");
            int level = J.Int(o, "level", 1);
            // 版 1 には段階が無かった: 初心者以外は 1 次とする。SP は段階ごとの財布に分けていなかったので、全部を今の段階へ。
            int tier = job == "beginner" ? 0 : 1;
            var sp = new List<object> { 0L, 0L, 0L, 0L, 0L };
            sp[tier] = (long)J.Int(o, "sp");
            var character = new Dictionary<string, object>
            {
                { "name", J.Str(o, "name", "ぼうけんしゃ") }, { "line", job }, { "tier", (long)tier }, { "branch", 0L },
                { "level", (long)level }, { "exp", J.Long(o, "exp") },
                { "str", (long)J.Int(o, "str", 4) }, { "dex", (long)J.Int(o, "dex", 4) }, { "int", (long)J.Int(o, "int", 4) }, { "luk", (long)J.Int(o, "luk", 4) },
                { "ap", (long)J.Int(o, "ap") }, { "sp", sp },
                { "baseMaxHp", (long)J.Int(o, "maxHp", 50) }, { "baseMaxMp", (long)J.Int(o, "maxMp", 5) },
                { "hp", (long)J.Int(o, "hp", 50) }, { "mp", (long)J.Int(o, "mp", 5) }, { "apHp", 0L }, { "apMp", 0L },
            };
            // 持ち物: 版 1 は枠の位置が無かった → タブは ID の頭で決め、前から詰める
            var items = new List<object>();
            var next = new int[5];
            foreach (var x in J.Arr(o, "items"))
            {
                var it = (Dictionary<string, object>)x;
                string id = J.Str(it, "id");
                if (id == null) continue;
                int tab = id.StartsWith("eq.", StringComparison.Ordinal) ? 0 : id.StartsWith("use.", StringComparison.Ordinal) || id.StartsWith("scroll.", StringComparison.Ordinal) ? 1
                    : id.StartsWith("setup.", StringComparison.Ordinal) ? 2 : id.StartsWith("special.", StringComparison.Ordinal) ? 4 : 3;
                items.Add(new Dictionary<string, object> { { "tab", (long)tab }, { "slot", (long)next[tab]++ }, { "id", id }, { "count", (long)Math.Max(1, J.Int(it, "count", 1)) } });
            }
            var quests = new List<object>();
            var qd = J.Obj(o, "quests");
            if (qd != null)
                foreach (var kv in qd)
                    quests.Add(new Dictionary<string, object> { { "id", kv.Key }, { "status", (kv.Value as string) == "done" ? "done" : "active" }, { "counts", new Dictionary<string, object>() }, { "at", 0L } });
            return new Dictionary<string, object>
            {
                { "version", 1L }, { "seq", 0L }, { "savedAt", J.Str(o, "savedAt") }, { "playSec", J.Num(o, "playSec") }, { "reason", "migrated" },
                { "character", character },
                { "inventory", new Dictionary<string, object> { { "meso", J.Long(o, "meso") }, { "slots", new List<object> { 24L, 24L, 24L, 24L, 24L } }, { "items", items } } },
                { "equipment", new List<object>() },
                { "skills", J.Obj(o, "skills") ?? new Dictionary<string, object>() },
                { "quickslots", new List<object>() },
                { "quests", quests },
                { "location", new Dictionary<string, object> { { "map", J.Str(o, "map", "S000") }, { "x", J.Num(o, "x") }, { "y", J.Num(o, "y") } } },
                { "flags", new Dictionary<string, object>() },
            };
        }
    }
}
