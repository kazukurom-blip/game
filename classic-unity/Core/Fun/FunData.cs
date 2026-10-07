// 「楽しさの要素」のデータ（Data/fun.json ← Data/tools/fun.mjs）。無ければ空（どれも出ない）。
// 景品の機械・フィールドボス・船の旅・感情表現・遊び場・季節・美容院・珍しい敵・ダンジョンの課題・見た目の品・天気。
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Fun
{
    /// <summary>町に置いた機械・係（NPC ではない。V で調べると窓が開く）。kind: gacha / arcade / salon / boutique / marks / season</summary>
    public sealed class FunSpot { public string Id, Kind, Map, Name; public double X, Y; }

    public sealed class GachaPrize { public string Item; public int Count = 1, Tier, Weight; }
    public sealed class GachaMachine
    {
        public string Id, Town, Name;
        public readonly List<GachaPrize> Prizes = new List<GachaPrize>();
        public int TotalWeight { get { int t = 0; foreach (var p in Prizes) t += p.Weight; return t; } }
    }

    public sealed class FunDrop { public string Item; public double Chance; public int Count = 1; }
    public sealed class FieldBossDef { public string Mob, Map; public double MinSec, MaxSec, WarnSec = 60; public readonly List<FunDrop> Drops = new List<FunDrop>(); }

    public sealed class VoyageRaid { public double At; public readonly List<string> Mobs = new List<string>(); public int Count; }
    public sealed class VoyageDef
    {
        public string Npc, Deck;
        public double Sec;
        public readonly List<VoyageRaid> Raids = new List<VoyageRaid>();
        public long BonusMeso; public double TicketChance;
    }

    public sealed class EmoteDef { public string Id, Name, Face; }
    public sealed class FunPrize { public string Item; public int Cost, Count = 1; }
    public sealed class FunReward { public string Item; public int Count = 1; }

    public sealed class SeasonDef
    {
        public string Id, Name, Deco, Mob, TaskItem, Say;
        public readonly List<int> Months = new List<int>();
        public readonly List<string> Maps = new List<string>();
        public double MobChance;
        public int TaskCount;
        public readonly List<FunReward> First = new List<FunReward>(), Again = new List<FunReward>();
    }

    public sealed class WeatherRule { public string Match, Kind; public double Chance; }

    public sealed class FunData
    {
        public readonly List<FunSpot> Spots = new List<FunSpot>();
        /// <summary>見た目の品（アイテムの ID → kind: hat/outfit/tag/bubble と絵の名前）</summary>
        public readonly Dictionary<string, (string kind, string look)> Looks = new Dictionary<string, (string, string)>();
        public string Ticket = "use.gacha_ticket"; public long TicketPrice = 1500; public double MobTicketChance;
        public readonly List<GachaMachine> Machines = new List<GachaMachine>();
        public readonly List<FieldBossDef> FieldBosses = new List<FieldBossDef>();
        public readonly List<VoyageDef> Voyages = new List<VoyageDef>();
        public readonly List<EmoteDef> Emotes = new List<EmoteDef>();
        public double EmoteSec = 4;
        // 遊び場
        public int GomokuSize = 15;
        public readonly Dictionary<string, int[]> GomokuPoints = new Dictionary<string, int[]>(), MemoryPoints = new Dictionary<string, int[]>();
        public int MemoryPairs = 8;
        public readonly Dictionary<string, double> MemoryRecall = new Dictionary<string, double>();
        public readonly List<FunPrize> ArcadePrizes = new List<FunPrize>();
        public readonly List<SeasonDef> Seasons = new List<SeasonDef>();
        // 美容院（[ID, 名前]）
        public readonly Dictionary<string, List<(string id, string name)>> Salon = new Dictionary<string, List<(string, string)>>();
        public readonly Dictionary<string, long> SalonPrice = new Dictionary<string, long>();
        public readonly Dictionary<string, string> SalonCoupon = new Dictionary<string, string>();
        public readonly List<FunPrize> Boutique = new List<FunPrize>(); // Cost = 値段（ルド）
        // 珍しい色違いの敵
        public double RareChance, RareHpMul = 3, RareAtkMul = 1.3, RareExpMul = 5, RareMesoMul = 3; public int RareDropRolls = 3;
        public readonly List<FunDrop> RareBonus = new List<FunDrop>();
        // ダンジョン
        public readonly Dictionary<string, List<string>> DungeonTasks = new Dictionary<string, List<string>>();
        public double CarrySec = 25; public int Chests = 3; public string Mark = "etc.fun.dungeon_mark";
        public readonly List<string> ChestItems = new List<string>();
        public readonly List<FunPrize> MarkPrizes = new List<FunPrize>();
        // 天気
        public readonly List<string> IndoorThemes = new List<string>();
        public readonly List<WeatherRule> Weather = new List<WeatherRule>();
        public readonly Dictionary<string, double> WeatherBgm = new Dictionary<string, double>();

        public GachaMachine Machine(string id) => Machines.Find(m => m.Id == id);
        public FunSpot Spot(string id) => Spots.Find(s => s.Id == id);
        public FieldBossDef FieldBoss(string mob) => FieldBosses.Find(b => b.Mob == mob);
        public VoyageDef Voyage(string npc) => Voyages.Find(v => v.Npc == npc);
        public EmoteDef Emote(string id) => Emotes.Find(e => e.Id == id);

        private static List<FunDrop> Drops(Dictionary<string, object> d, string k)
        {
            var l = new List<FunDrop>();
            foreach (var o in J.Arr(d, k)) { var x = (Dictionary<string, object>)o; l.Add(new FunDrop { Item = J.Str(x, "item"), Chance = J.Num(x, "chance", 1), Count = J.Int(x, "count", 1) }); }
            return l;
        }
        private static List<FunPrize> Prizes(List<object> a, string costKey = "cost")
        {
            var l = new List<FunPrize>();
            foreach (var o in a) { var x = (Dictionary<string, object>)o; l.Add(new FunPrize { Item = J.Str(x, "item"), Cost = J.Int(x, costKey), Count = J.Int(x, "n", 1) }); }
            return l;
        }
        private static List<FunReward> Rewards(List<object> a)
        {
            var l = new List<FunReward>();
            foreach (var o in a) { var x = (Dictionary<string, object>)o; l.Add(new FunReward { Item = J.Str(x, "item"), Count = J.Int(x, "n", 1) }); }
            return l;
        }
        private static int[] Ints(object o)
        {
            var a = o as List<object>;
            if (a == null) return new int[3];
            var r = new int[a.Count];
            for (int i = 0; i < a.Count; i++) r[i] = (int)J.ToDouble(a[i]);
            return r;
        }

        public static FunData FromDict(Dictionary<string, object> d)
        {
            var f = new FunData();
            foreach (var o in J.Arr(d, "spots"))
            {
                var x = (Dictionary<string, object>)o;
                f.Spots.Add(new FunSpot { Id = J.Str(x, "id"), Kind = J.Str(x, "kind"), Map = J.Str(x, "map"), Name = J.Str(x, "name", ""), X = J.Num(x, "x"), Y = J.Num(x, "y") });
            }
            var looks = J.Obj(d, "looks");
            if (looks != null) foreach (var kv in looks) { var x = kv.Value as Dictionary<string, object>; f.Looks[kv.Key] = (J.Str(x, "kind"), J.Str(x, "look")); }
            var g = J.Obj(d, "gacha");
            if (g != null)
            {
                f.Ticket = J.Str(g, "ticket", f.Ticket); f.TicketPrice = J.Long(g, "ticketPrice", 1500); f.MobTicketChance = J.Num(g, "mobTicketChance");
                foreach (var o in J.Arr(g, "machines"))
                {
                    var x = (Dictionary<string, object>)o;
                    var m = new GachaMachine { Id = J.Str(x, "id"), Town = J.Str(x, "town"), Name = J.Str(x, "name", "") };
                    foreach (var p in J.Arr(x, "prizes")) { var y = (Dictionary<string, object>)p; m.Prizes.Add(new GachaPrize { Item = J.Str(y, "item"), Count = J.Int(y, "n", 1), Tier = J.Int(y, "tier"), Weight = J.Int(y, "w", 1) }); }
                    f.Machines.Add(m);
                }
            }
            foreach (var o in J.Arr(d, "fieldBosses"))
            {
                var x = (Dictionary<string, object>)o;
                var b = new FieldBossDef { Mob = J.Str(x, "mob"), Map = J.Str(x, "map"), MinSec = J.Num(x, "minSec", 1800), MaxSec = J.Num(x, "maxSec", 5400), WarnSec = J.Num(x, "warnSec", 60) };
                b.Drops.AddRange(Drops(x, "drops"));
                f.FieldBosses.Add(b);
            }
            foreach (var o in J.Arr(d, "voyages"))
            {
                var x = (Dictionary<string, object>)o;
                var v = new VoyageDef { Npc = J.Str(x, "npc"), Deck = J.Str(x, "deck"), Sec = J.Num(x, "sec", 90), BonusMeso = J.Long(x, "bonusMeso"), TicketChance = J.Num(x, "ticketChance") };
                foreach (var r in J.Arr(x, "raids")) { var y = (Dictionary<string, object>)r; var vr = new VoyageRaid { At = J.Num(y, "at"), Count = J.Int(y, "count", 1) }; vr.Mobs.AddRange(J.StrList(y, "mobs")); v.Raids.Add(vr); }
                f.Voyages.Add(v);
            }
            foreach (var o in J.Arr(d, "emotes")) { var x = (Dictionary<string, object>)o; f.Emotes.Add(new EmoteDef { Id = J.Str(x, "id"), Name = J.Str(x, "name", ""), Face = J.Str(x, "face") }); }
            f.EmoteSec = J.Num(d, "emoteSec", 4);
            var a = J.Obj(d, "arcade");
            if (a != null)
            {
                var gm = J.Obj(a, "gomoku");
                f.GomokuSize = J.Int(gm, "size", 15);
                var gp = J.Obj(gm, "points"); if (gp != null) foreach (var kv in gp) f.GomokuPoints[kv.Key] = Ints(kv.Value);
                var mm = J.Obj(a, "memory");
                f.MemoryPairs = J.Int(mm, "pairs", 8);
                var rc = J.Obj(mm, "recall"); if (rc != null) foreach (var kv in rc) f.MemoryRecall[kv.Key] = J.ToDouble(kv.Value);
                var mp = J.Obj(mm, "points"); if (mp != null) foreach (var kv in mp) f.MemoryPoints[kv.Key] = Ints(kv.Value);
                f.ArcadePrizes.AddRange(Prizes(J.Arr(a, "prizes")));
            }
            foreach (var o in J.Arr(d, "seasons"))
            {
                var x = (Dictionary<string, object>)o;
                var s = new SeasonDef { Id = J.Str(x, "id"), Name = J.Str(x, "name", ""), Deco = J.Str(x, "deco"), Mob = J.Str(x, "mob"), MobChance = J.Num(x, "mobChance"), Say = J.Str(x, "say", "") };
                foreach (var m in J.Arr(x, "months")) s.Months.Add((int)J.ToDouble(m));
                s.Maps.AddRange(J.StrList(x, "maps"));
                var t = J.Obj(x, "task");
                if (t != null) { s.TaskItem = J.Str(t, "item"); s.TaskCount = J.Int(t, "count", 1); s.First.AddRange(Rewards(J.Arr(t, "first"))); s.Again.AddRange(Rewards(J.Arr(t, "again"))); }
                f.Seasons.Add(s);
            }
            var sa = J.Obj(d, "salon");
            if (sa != null)
            {
                foreach (var k in new[] { "hair", "hairColor", "face", "skin" })
                {
                    var l = new List<(string, string)>();
                    foreach (var o in J.Arr(sa, k)) { var p = o as List<object>; if (p != null && p.Count >= 2) l.Add((p[0] as string, p[1] as string)); }
                    f.Salon[k] = l;
                }
                var pr = J.Obj(sa, "price"); if (pr != null) foreach (var kv in pr) f.SalonPrice[kv.Key] = (long)J.ToDouble(kv.Value);
                var cp = J.Obj(sa, "coupon"); if (cp != null) foreach (var kv in cp) f.SalonCoupon[kv.Key] = kv.Value as string;
            }
            f.Boutique.AddRange(Prizes(J.Arr(d, "boutique"), "price"));
            var ra = J.Obj(d, "rare");
            if (ra != null)
            {
                f.RareChance = J.Num(ra, "chance"); f.RareHpMul = J.Num(ra, "hpMul", 3); f.RareAtkMul = J.Num(ra, "atkMul", 1.3);
                f.RareExpMul = J.Num(ra, "expMul", 5); f.RareMesoMul = J.Num(ra, "mesoMul", 3); f.RareDropRolls = J.Int(ra, "dropRolls", 3);
                f.RareBonus.AddRange(Drops(ra, "bonus"));
            }
            var du = J.Obj(d, "dungeons");
            if (du != null)
            {
                var rooms = J.Obj(du, "rooms");
                if (rooms != null) foreach (var kv in rooms) { var l = new List<string>(); foreach (var t in (kv.Value as List<object>) ?? new List<object>()) l.Add(t as string); f.DungeonTasks[kv.Key] = l; }
                f.CarrySec = J.Num(du, "carrySec", 25); f.Chests = J.Int(du, "chests", 3); f.Mark = J.Str(du, "mark", f.Mark);
                f.ChestItems.AddRange(J.StrList(du, "chestItems"));
                f.MarkPrizes.AddRange(Prizes(J.Arr(du, "prizes")));
            }
            var we = J.Obj(d, "weather");
            if (we != null)
            {
                f.IndoorThemes.AddRange(J.StrList(we, "indoorThemes"));
                foreach (var o in J.Arr(we, "rules")) { var x = (Dictionary<string, object>)o; f.Weather.Add(new WeatherRule { Match = J.Str(x, "match"), Kind = J.Str(x, "kind"), Chance = J.Num(x, "chance", 1) }); }
                var bv = J.Obj(we, "bgmVolume"); if (bv != null) foreach (var kv in bv) f.WeatherBgm[kv.Key] = J.ToDouble(kv.Value);
            }
            return f;
        }
    }
}
