// やりこみの窓の中身（図鑑・勲章・記録・全体マップの印）。窓を開いた時・操作の後にだけ呼ぶ（Actions の book / medals / records / world）。
using System;
using System.Collections.Generic;
using Lumina.Core.Collection;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Util;

namespace Lumina.Web
{
    public static class CollectionUi
    {
        private static Dictionary<string, object> D(params (string k, object v)[] kv) => Ui.D(kv);

        public static Dictionary<string, object> Book(GameSession s)
        {
            var b = s.Book;
            var idx = s.BookIndex;
            var mobs = new List<object>();
            foreach (var e in idx.Entries)
            {
                bool seen = s.Flags.TryGetValue("kill." + e.Mob, out var k) && k || b.Count(e.Mob) > 0;
                var maps = new List<object>();
                foreach (var m in e.Maps) { if (maps.Count >= 4) break; maps.Add(m); }
                mobs.Add(D(("id", e.Mob), ("r", e.Region), ("n", b.Count(e.Mob)), ("seen", seen), ("kills", s.Records.KillsOf(e.Mob)), ("maps", maps), ("more", Math.Max(0, e.Maps.Count - 4))));
            }
            var regions = new List<object>();
            foreach (var (id, name) in idx.Regions)
            {
                int done = 0, total = 0;
                foreach (var e in idx.InRegion(id)) { total++; if (b.Complete(e.Mob)) done++; }
                var medal = s.Data.Item(Medals.ItemPrefix + "book." + id);
                regions.Add(D(("id", id), ("name", name), ("done", done), ("total", total), ("medal", medal?.Name), ("meso", medal?.MedalMeso ?? 0), ("got", s.HasMedal("book." + id))));
            }
            int c = b.CompletedCount;
            return D(("lv", b.Level), ("done", c), ("total", idx.Entries.Count), ("cards", b.TotalCards), ("next", MonsterBook.NextStep(c)),
                ("bonus", MonsterBook.BonusText(b.Level)), ("nextBonus", MonsterBook.BonusText(b.Level + 1)), ("per", MonsterBook.CardsPerSet), ("regions", regions), ("mobs", mobs));
        }

        public static Dictionary<string, object> MedalList(GameSession s)
        {
            var l = new List<object>();
            foreach (var def in s.MedalList())
            {
                var rule = Medals.OfItem(def.Id);
                bool got = s.HasMedal(def.Id);
                var o = D(("id", def.Id), ("name", def.Name), ("group", def.MedalAuto ? def.MedalGroup : "クエスト"), ("hint", def.MedalAuto ? def.MedalHint : def.Desc),
                    ("auto", def.MedalAuto), ("got", got), ("stats", def.Stats.ToDict()));
                if (rule?.Progress != null && !got)
                {
                    try { var (have, need) = rule.Progress(s); o["prog"] = new List<object> { have, need }; } catch (Exception) { }
                }
                l.Add(o);
            }
            return D(("worn", s.Medal), ("count", s.MedalCount()), ("list", l));
        }

        public static Dictionary<string, object> Records(GameSession s)
        {
            var r = s.Records;
            var boss = new List<object>();
            foreach (var kv in r.BossBest) boss.Add(D(("mob", kv.Key), ("sec", Math.Round(kv.Value, 1))));
            var jumps = new List<object>();
            foreach (var m in Medals.JumpCourses)
            {
                var md = s.Data.GetMap(m);
                if (md == null) continue;
                jumps.Add(D(("map", m), ("name", md.Name), ("stages", md.Jump?.Stages ?? 0), ("town", md.Jump?.Town), ("clears", r.JumpClears.TryGetValue(m, out var n) ? n : 0), ("best", r.JumpBest.TryGetValue(m, out var b) ? Math.Round(b, 1) : 0)));
            }
            var chairs = new List<object>();
            foreach (var it in s.Data.Items.Values) if (it.IsChair) chairs.Add(D(("id", it.Id), ("name", it.Name), ("got", r.Chairs.Contains(it.Id)), ("have", s.Inventory.Has(it.Id))));
            return D(("play", Math.Round(s.PlaySec)), ("kills", r.Kills), ("kinds", s.KindsKilled), ("bossKills", r.BossKills), ("bossKinds", s.BossTypesKilled()), ("bossTotal", s.BossTypes()),
                ("deaths", r.Deaths), ("mesoPicked", r.MesoPicked), ("maxMeso", r.MaxMeso), ("itemsPicked", r.ItemsPicked), ("potions", r.PotionsUsed),
                ("maxDamage", r.MaxDamage), ("scrollOk", r.ScrollSuccess), ("scrollFail", r.ScrollFail), ("scrollBroken", r.ScrollBroken), ("bestUpgrade", r.BestUpgrade),
                ("dungeons", r.DungeonClears), ("maps", s.MapsVisited), ("mapsTotal", s.Data.WorldMap.Maps.Count), ("towns", s.TownsVisited), ("quests", s.QuestsDone),
                ("hidden", r.Hidden.Count), ("hiddenTotal", s.Data.WorldMap.Hidden.Count), ("cards", s.Book.TotalCards), ("bookDone", s.Book.CompletedCount),
                ("medals", s.MedalCount()), ("boss", boss), ("jumps", jumps), ("chairs", chairs));
        }

        public static Dictionary<string, object> World(GameSession s)
        {
            var marks = new Dictionary<string, object>();
            foreach (var kv in s.WorldMarks()) marks[kv.Key] = kv.Value;
            return D(("here", s.Map.Data.Id), ("region", s.Data.WorldMap.Node(s.Map.Data.Id)?.Region), ("marks", marks));
        }
    }
}
