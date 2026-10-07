// マップのデータ（Data/maps/<ID>.json）。ブラウザ版 classic/src/world/mapFormat.js の形を広げたもの。
//
// {
//   "id": "S001", "name": "はじめの小道", "region": "S", "type": "狩",   // 種類: 町/狩/洞/ボ/特/移
//   "lv": [1, 2], "width": 1600, "height": 720, "bgm": "field_island",      // 曲は SOUND.md の ID
//   "bg": "grass", "theme": "field",            // 背景の種類・地形の型（Data/tools/world/specs.mjs）
//   "returnMap": "S003",                       // 死んだ時・帰還の書で戻る町
//   "footholds": [ { "id": "g", "ground": true, "points": [[0,640],[1600,640]] } ],   // 点は左から右へ
//   "ropes":     [ { "x": 600, "top": 512, "bottom": 616, "ladder": false } ],         // top/bottom は足元の y
//   "walls":     [ { "x": 0, "top": 0, "bottom": 640 } ],                              // 縦の壁（任意）
//   "portals":   [ { "name": "sp", "type": "spawn", "x": 90, "y": 640 },
//                  { "name": "east", "type": "visible", "x": 1550, "y": 640, "to": "S002", "toPortal": "west" } ],
//                 // type: spawn（出現の位置）/ visible（光の渦）/ hidden（見えない）/ town（帰還の書の位置）/ landing（一方通行で着くだけの位置）
//                 // to が無く toPortal だけ → 同じマップの中の別の位置へ（隠し部屋など）。"oneWay": true → 一方通行（滑り台・落とし穴。戻りが無い）
//   "spawns":    [ { "mob": "M001", "x": 300, "y": 640 } ], "mobMax": 8, "respawnSec": 7,
//   "timedSpawns": [ { "mob": "M007", "x": 800, "y": 640, "intervalSec": 600 } ],     // 強敵・ボス
//   "npcs":      [ { "id": "luka", "name": "案内人ルカ", "x": 200, "y": 640, "shop": null, "role": "guide" } ],
//                 // travel（乗り物 1 つ）/ taxi（{ "dests": [ { "to", "toPortal", "fee" } ], "beginnerDiv": 10 }）/ inn（宿屋の料金）
//   "objects":   [ { "id": "S001.crate", "name": "木箱", "x": 500, "y": 512 } ],      // 調べられる物（"quest": そのクエストの間だけ見つかる隠し物）
//   timedSpawns の "quest": クエスト専用の敵（そのクエストを進めている間だけ湧く。QUESTS.md 8 章）
//   "jump":      { "town": "V200", "stages": 3, "floors": [y…], "first": { "meso", "items": [{ "item", "count" }] }, "daily": {…}, "medal": "jump.J001" }
//                 // ジャンプの試練だけ（Data/tools/world/jump.mjs）
// }
using System;
using System.Collections.Generic;
using Lumina.Core.Physics;
using Lumina.Core.Util;

namespace Lumina.Core.World
{
    public sealed class FootholdData
    {
        public string Id;
        public bool Ground;
        public string Tile = "grass";
        public List<double[]> Points = new List<double[]>();
    }

    public sealed class RopeData { public double X, Top, Bottom; public bool Ladder; }
    public sealed class WallData { public double X, Top, Bottom; }

    public static class PortalType
    {
        public const string Spawn = "spawn";
        public const string Visible = "visible";
        public const string Hidden = "hidden";
        public const string Town = "town";
        public const string Landing = "landing";
    }

    public sealed class PortalData
    {
        public string Name, Type = PortalType.Visible, To, ToPortal;
        public double X, Y;
        /// <summary>入るのに必要なクエスト（進行中か完了）。無ければ null。</summary>
        public string RequiresQuest;
        /// <summary>一方通行（雲の塔の窓の滑り台・おもちゃ箱の底へ落ちる穴）。着く先から戻るポータルは無い。</summary>
        public bool OneWay;
        public bool IsEnterable => Type != PortalType.Spawn && Type != PortalType.Town && Type != PortalType.Landing && (To != null || ToPortal != null);
    }

    public sealed class SpawnData
    {
        public string Mob; public double X, Y; public double IntervalSec;
        /// <summary>クエスト専用の敵（強敵・ボス）: このクエストを進めている間だけ湧く。null ならいつも</summary>
        public string Quest;
    }
    /// <summary>乗り物（船など）。NPC に話して乗る。</summary>
    public sealed class TravelData
    {
        public string To, ToPortal, RequiresQuest;
        public int MinLevel; public long Fee; public bool OneWay;
        /// <summary>帰りの便（大陸の方へ戻る乗り物）。お金が足りない時は有り金だけで乗せてくれる（乗り物でしか出入りできない地域で詰まないように。PLAYTEST.md）</summary>
        public bool Homeward;
    }

    /// <summary>タクシー（行き先がいくつもある乗り物）。初心者（0 次）は料金 ÷ BeginnerDiv。</summary>
    public sealed class TaxiData
    {
        public sealed class Dest { public string To, ToPortal; public long Fee; }
        public readonly List<Dest> Dests = new List<Dest>();
        public int BeginnerDiv = 10;
    }

    public sealed class NpcData
    {
        public string Id, Name, Shop;
        /// <summary>見た目・会話の手がかり（weapon / armor / potion / general / storage / taxi / pet / craft / guide / job）。無ければ null</summary>
        public string Role;
        public double X, Y;
        public int InnFee = -1;          // 宿屋（休むと HP/MP 全回復）の料金。-1 = 宿屋でない
        public TravelData Travel;
        public TaxiData Taxi;
        /// <summary>話しかけた時のセリフ（npcs.json の lines を GameData.GetMap が写す）。先頭の [条件] は Game/NpcLines.cs</summary>
        public readonly List<string> Lines = new List<string>();
    }
    public sealed class MapObjectData
    {
        public string Id, Name; public double X, Y;
        /// <summary>クエストの隠し物: このクエストを進めている間だけ見つかる（ほかの時は調べても何も無い）。null ならいつも</summary>
        public string Quest;
    }

    /// <summary>ごほうび（お金と品）。</summary>
    public sealed class RewardData
    {
        public long Meso;
        public readonly List<(string item, int count)> Items = new List<(string, int)>();
        public static RewardData FromDict(Dictionary<string, object> d)
        {
            var r = new RewardData();
            if (d == null) return r;
            r.Meso = J.Long(d, "meso");
            foreach (var o in J.Arr(d, "items")) { var x = (Dictionary<string, object>)o; r.Items.Add((J.Str(x, "item"), Math.Max(1, J.Int(x, "count", 1)))); }
            return r;
        }
    }

    /// <summary>ジャンプの試練（Data/tools/world/jump.mjs）。てっぺんの宝箱（"&lt;マップ&gt;.chest"）を調べるとクリア。</summary>
    public sealed class JumpCourseData
    {
        public string Town, Medal;
        public int Stages;
        /// <summary>段の床の高さ（下から。0 = 地面、最後 = てっぺん）</summary>
        public readonly List<double> Floors = new List<double>();
        public RewardData First, Daily;
        public string ChestId;
    }

    public sealed class MapData
    {
        public string Id, Name, Region, Type, Bgm, ReturnMap;
        /// <summary>背景の種類（beach・forest・cave …）と地形の型（town・field・cave・tower …）</summary>
        public string Background, Theme;
        public int LvMin, LvMax;
        public double Width, Height;
        public readonly List<FootholdData> Footholds = new List<FootholdData>();
        public readonly List<RopeData> Ropes = new List<RopeData>();
        public readonly List<WallData> Walls = new List<WallData>();
        public readonly List<PortalData> Portals = new List<PortalData>();
        public readonly List<SpawnData> Spawns = new List<SpawnData>();
        public readonly List<SpawnData> TimedSpawns = new List<SpawnData>();
        public readonly List<NpcData> Npcs = new List<NpcData>();
        public readonly List<MapObjectData> Objects = new List<MapObjectData>();
        public int MobMax = 10;
        public double RespawnSec = 7;

        public bool IsTown => Type == "町";
        /// <summary>ジャンプの試練のマップなら、その決まり（無ければ null）。</summary>
        public JumpCourseData Jump;

        public static MapData FromJson(string json) => FromDict(Json.ParseObject(json));

        public static MapData FromDict(Dictionary<string, object> d)
        {
            var m = new MapData
            {
                Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Region = J.Str(d, "region", ""), Type = J.Str(d, "type", "狩"),
                Bgm = J.Str(d, "bgm", ""), ReturnMap = J.Str(d, "returnMap"),
                Background = J.Str(d, "bg", ""), Theme = J.Str(d, "theme", ""),
                Width = J.Num(d, "width", 800), Height = J.Num(d, "height", 600),
                MobMax = J.Int(d, "mobMax", 10), RespawnSec = J.Num(d, "respawnSec", 7),
            };
            var lv = J.Arr(d, "lv");
            if (lv.Count == 2) { m.LvMin = (int)J.ToDouble(lv[0]); m.LvMax = (int)J.ToDouble(lv[1]); }
            foreach (var o in J.Arr(d, "footholds"))
            {
                var f = (Dictionary<string, object>)o;
                var fd = new FootholdData { Id = J.Str(f, "id"), Ground = J.Bool(f, "ground"), Tile = J.Str(f, "tile", "grass") };
                foreach (var pt in J.Arr(f, "points"))
                {
                    var a = (List<object>)pt;
                    fd.Points.Add(new[] { J.ToDouble(a[0]), J.ToDouble(a[1]) });
                }
                m.Footholds.Add(fd);
            }
            foreach (var o in J.Arr(d, "ropes"))
            {
                var r = (Dictionary<string, object>)o;
                m.Ropes.Add(new RopeData { X = J.Num(r, "x"), Top = J.Num(r, "top"), Bottom = J.Num(r, "bottom"), Ladder = J.Bool(r, "ladder") });
            }
            foreach (var o in J.Arr(d, "walls"))
            {
                var r = (Dictionary<string, object>)o;
                m.Walls.Add(new WallData { X = J.Num(r, "x"), Top = J.Num(r, "top"), Bottom = J.Num(r, "bottom") });
            }
            foreach (var o in J.Arr(d, "portals"))
            {
                var r = (Dictionary<string, object>)o;
                m.Portals.Add(new PortalData
                {
                    Name = J.Str(r, "name"), Type = J.Str(r, "type", PortalType.Visible), To = J.Str(r, "to"), ToPortal = J.Str(r, "toPortal"),
                    X = J.Num(r, "x"), Y = J.Num(r, "y"), RequiresQuest = J.Str(r, "requiresQuest"), OneWay = J.Bool(r, "oneWay"),
                });
            }
            foreach (var o in J.Arr(d, "spawns"))
            {
                var r = (Dictionary<string, object>)o;
                m.Spawns.Add(new SpawnData { Mob = J.Str(r, "mob"), X = J.Num(r, "x"), Y = J.Num(r, "y") });
            }
            foreach (var o in J.Arr(d, "timedSpawns"))
            {
                var r = (Dictionary<string, object>)o;
                m.TimedSpawns.Add(new SpawnData { Mob = J.Str(r, "mob"), X = J.Num(r, "x"), Y = J.Num(r, "y"), IntervalSec = J.Num(r, "intervalSec", 600), Quest = J.Str(r, "quest") });
            }
            foreach (var o in J.Arr(d, "npcs"))
            {
                var r = (Dictionary<string, object>)o;
                var npc = new NpcData { Id = J.Str(r, "id"), Name = J.Str(r, "name", ""), Shop = J.Str(r, "shop"), Role = J.Str(r, "role"), X = J.Num(r, "x"), Y = J.Num(r, "y"), InnFee = J.Int(r, "inn", -1) };
                foreach (var l in J.Arr(r, "lines")) if (l is string ls) npc.Lines.Add(ls);
                var tr = J.Obj(r, "travel");
                if (tr != null)
                {
                    npc.Travel = new TravelData
                    {
                        To = J.Str(tr, "to"), ToPortal = J.Str(tr, "toPortal"), RequiresQuest = J.Str(tr, "requiresQuest"),
                        MinLevel = J.Int(tr, "minLevel"), Fee = J.Long(tr, "fee"), OneWay = J.Bool(tr, "oneWay"), Homeward = J.Bool(tr, "homeward"),
                    };
                }
                var tx = J.Obj(r, "taxi");
                if (tx != null)
                {
                    npc.Taxi = new TaxiData { BeginnerDiv = Math.Max(1, J.Int(tx, "beginnerDiv", 10)) };
                    foreach (var o2 in J.Arr(tx, "dests"))
                    {
                        var dd = (Dictionary<string, object>)o2;
                        npc.Taxi.Dests.Add(new TaxiData.Dest { To = J.Str(dd, "to"), ToPortal = J.Str(dd, "toPortal"), Fee = J.Long(dd, "fee") });
                    }
                }
                m.Npcs.Add(npc);
            }
            foreach (var o in J.Arr(d, "objects"))
            {
                var r = (Dictionary<string, object>)o;
                m.Objects.Add(new MapObjectData { Id = J.Str(r, "id"), Name = J.Str(r, "name", ""), X = J.Num(r, "x"), Y = J.Num(r, "y"), Quest = J.Str(r, "quest") });
            }
            var jq = J.Obj(d, "jump");
            if (jq != null)
            {
                m.Jump = new JumpCourseData
                {
                    Town = J.Str(jq, "town"), Medal = J.Str(jq, "medal"), Stages = J.Int(jq, "stages"),
                    First = RewardData.FromDict(J.Obj(jq, "first")), Daily = RewardData.FromDict(J.Obj(jq, "daily")), ChestId = m.Id + ".chest",
                };
                foreach (var f in J.Arr(jq, "floors")) m.Jump.Floors.Add(J.ToDouble(f));
            }
            return m;
        }

        /// <summary>物理で使う形（線分・縄・壁）を作る。足場の順番はデータの順のまま（着地の判定の順番がブラウザ版と同じになる）。</summary>
        public PhysicsMap BuildPhysics()
        {
            var pm = new PhysicsMap(Width, Height);
            foreach (var f in Footholds)
            {
                var pts = new double[f.Points.Count * 2];
                for (int i = 0; i < f.Points.Count; i++) { pts[i * 2] = f.Points[i][0]; pts[i * 2 + 1] = f.Points[i][1]; }
                var ch = pm.AddChain(f.Id, f.Ground, pts);
                ch.Tile = f.Tile;
            }
            foreach (var r in Ropes) pm.AddRope(r.X, r.Top, r.Bottom, r.Ladder);
            foreach (var w in Walls) pm.AddWall(w.X, w.Top, w.Bottom);
            return pm;
        }

        public PortalData FindPortalByName(string name)
        {
            foreach (var p in Portals) if (p.Name == name) return p;
            return null;
        }

        /// <summary>出現の位置（名前を指定しなければ spawn の種類の最初の物）。mapFormat.js の spawnPoint。</summary>
        public (double x, double y) SpawnPoint(string portalName = null)
        {
            PortalData found = null;
            foreach (var p in Portals)
            {
                if (portalName != null ? p.Name == portalName : p.Type == PortalType.Spawn) { found = p; break; }
            }
            if (found == null && Portals.Count > 0) found = Portals[0];
            if (found != null) return (found.X, found.Y);
            return (Width / 2, 0);
        }

        /// <summary>足元 (x, y) の近くにある入れるポータル（↑で入る）。</summary>
        public PortalData FindPortalAt(double x, double y)
        {
            PortalData best = null; double bd = double.PositiveInfinity;
            foreach (var p in Portals)
            {
                if (!p.IsEnterable) continue;
                double dx = Math.Abs(p.X - x), dy = Math.Abs(p.Y - y);
                if (dx > Feel.PortalRangeX || dy > Feel.PortalRangeY) continue;
                if (dx < bd) { bd = dx; best = p; }
            }
            return best;
        }
    }
}
