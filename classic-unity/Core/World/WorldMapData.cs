// 全体マップ（世界地図。UI.md 2-6）のデータ: Data/worldmap.json（Data/tools/world/worldmap.mjs が書き出す）。
// 地域ごとのマップの点の位置（0〜1000 × 0〜600）・つながりの線・出る敵・隠しポータル。
// 印（受けられるクエスト・報告できる・進めているクエストの目的地・今いる所）は GameSession.WorldMarks() が作る。
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.World
{
    public sealed class WorldMapNode
    {
        public string Id, Region, Name, Type, Town, Bgm;
        public double X, Y;
        public int LvMin, LvMax;
        public readonly List<string> Mobs = new List<string>();
    }

    public sealed class WorldMapRegion
    {
        public string Id, Name, Note;
        public readonly List<string> Maps = new List<string>();
    }

    public sealed class WorldMapData
    {
        public readonly List<WorldMapRegion> Regions = new List<WorldMapRegion>();
        public readonly Dictionary<string, WorldMapNode> Maps = new Dictionary<string, WorldMapNode>();
        /// <summary>地域の中の歩けるポータル（両方向）</summary>
        public readonly List<(string a, string b)> Links = new List<(string, string)>();
        /// <summary>地域をまたぐポータル</summary>
        public readonly List<(string a, string b)> Outer = new List<(string, string)>();
        /// <summary>乗り物（船・鳥・ジャンプの試練の入口）。kind は「乗り物」「ジャンプの試練」</summary>
        public readonly List<(string a, string b, string kind)> Travel = new List<(string, string, string)>();
        /// <summary>隠しポータル（"マップ.ポータル"）</summary>
        public readonly List<string> Hidden = new List<string>();

        public WorldMapNode Node(string id) => id != null && Maps.TryGetValue(id, out var n) ? n : null;

        /// <summary>その敵が出るマップ（データの順）。</summary>
        public List<string> MapsOfMob(string mobId)
        {
            var l = new List<string>();
            foreach (var r in Regions) foreach (var id in r.Maps) if (Maps[id].Mobs.Contains(mobId)) l.Add(id);
            return l;
        }

        public static WorldMapData FromDict(Dictionary<string, object> d)
        {
            var w = new WorldMapData();
            if (d == null) return w;
            foreach (var o in J.Arr(d, "regions"))
            {
                var r = (Dictionary<string, object>)o;
                var reg = new WorldMapRegion { Id = J.Str(r, "id"), Name = J.Str(r, "name", ""), Note = J.Str(r, "note", "") };
                reg.Maps.AddRange(J.StrList(r, "maps"));
                w.Regions.Add(reg);
            }
            var maps = J.Obj(d, "maps");
            if (maps != null)
                foreach (var kv in maps)
                {
                    var m = (Dictionary<string, object>)kv.Value;
                    var n = new WorldMapNode
                    {
                        Id = kv.Key, Region = J.Str(m, "region"), Name = J.Str(m, "name", ""), Type = J.Str(m, "type", ""), Town = J.Str(m, "town"), Bgm = J.Str(m, "bgm"),
                        X = J.Num(m, "x"), Y = J.Num(m, "y"),
                    };
                    var lv = J.Arr(m, "lv");
                    if (lv.Count == 2) { n.LvMin = (int)J.ToDouble(lv[0]); n.LvMax = (int)J.ToDouble(lv[1]); }
                    n.Mobs.AddRange(J.StrList(m, "mobs"));
                    w.Maps[n.Id] = n;
                }
            foreach (var o in J.Arr(d, "links")) { var a = (List<object>)o; w.Links.Add(((string)a[0], (string)a[1])); }
            foreach (var o in J.Arr(d, "outer")) { var a = (List<object>)o; w.Outer.Add(((string)a[0], (string)a[1])); }
            foreach (var o in J.Arr(d, "travel")) { var a = (List<object>)o; w.Travel.Add(((string)a[0], (string)a[1], a.Count > 2 ? (string)a[2] : "乗り物")); }
            w.Hidden.AddRange(J.StrList(d, "hidden"));
            return w;
        }
    }
}
