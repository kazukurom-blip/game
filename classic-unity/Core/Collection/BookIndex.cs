// 図鑑に載る敵の一覧（地域ごと）。どこかのマップに湧く敵（湧く所・強敵・ボス）だけ（呼び出しだけの手下・仕掛けの物は載らない）。
// 地域は「最初に出るマップ」の地域（全体マップ worldmap.json の地域の順）。
using System.Collections.Generic;
using Lumina.Core.Data;

namespace Lumina.Core.Collection
{
    public sealed class BookEntry
    {
        public string Mob, Region;
        public readonly List<string> Maps = new List<string>();
    }

    public sealed class BookIndex
    {
        public readonly List<BookEntry> Entries = new List<BookEntry>();
        public readonly Dictionary<string, BookEntry> ByMob = new Dictionary<string, BookEntry>();
        /// <summary>地域の ID → 地域の名前（図鑑のタブの順）</summary>
        public readonly List<(string id, string name)> Regions = new List<(string, string)>();

        public static BookIndex Build(GameData data)
        {
            var b = new BookIndex();
            var wm = data.WorldMap;
            foreach (var r in wm.Regions)
            {
                bool any = false;
                foreach (var id in r.Maps)
                    foreach (var mob in wm.Maps[id].Mobs)
                    {
                        if (data.Mob(mob) == null) continue;
                        if (!b.ByMob.TryGetValue(mob, out var e))
                        {
                            e = new BookEntry { Mob = mob, Region = r.Id };
                            b.ByMob[mob] = e; b.Entries.Add(e); any = true;
                        }
                        if (!e.Maps.Contains(id)) e.Maps.Add(id);
                    }
                if (any) b.Regions.Add((r.Id, r.Name));
            }
            return b;
        }

        public List<BookEntry> InRegion(string region) => Entries.FindAll(e => e.Region == region);

        public bool RegionComplete(string region, MonsterBook book)
        {
            bool any = false;
            foreach (var e in Entries)
            {
                if (e.Region != region) continue;
                any = true;
                if (!book.Complete(e.Mob)) return false;
            }
            return any;
        }
    }
}
