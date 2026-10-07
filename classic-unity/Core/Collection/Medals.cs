// 勲章（称号）の条件。勲章は「メダルの品」（装備の欄 medal）: 条件を満たすと自動で手に入る物（items.json の eq.medal.<ID>、medal.auto。
// 名前・文・能力は Data/tools/medals.mjs）と、クエストでもらう物（quest_items.mjs）の両方が勲章の窓に並ぶ。付けられるのは 1 つ（メダルの欄）なので能力は重ならない。
// ここは ID → 条件（と進み）の表だけ。判定は GameSession.Collection.cs が時々（0.5 秒ごと・倒した時など）呼ぶ。
using System;
using System.Collections.Generic;
using Lumina.Core.Game;

namespace Lumina.Core.Collection
{
    public sealed class MedalRule
    {
        /// <summary>medals.mjs の ID（品の ID は "eq.medal." + Id）</summary>
        public string Id;
        public Func<GameSession, bool> Test;
        /// <summary>進み（今・目標）。無ければ null</summary>
        public Func<GameSession, (long have, long need)> Progress;
        public string ItemId => Medals.ItemPrefix + Id;
    }

    public static class Medals
    {
        public const string ItemPrefix = "eq.medal.";
        private static Dictionary<string, MedalRule> rules;

        public static IReadOnlyDictionary<string, MedalRule> Rules => rules ??= Build();

        public static MedalRule Get(string id) => id != null && Rules.TryGetValue(id, out var r) ? r : null;
        /// <summary>品の ID（eq.medal.lv10）から条件</summary>
        public static MedalRule OfItem(string itemId) => itemId != null && itemId.StartsWith(ItemPrefix, StringComparison.Ordinal) ? Get(itemId.Substring(ItemPrefix.Length)) : null;

        private static void Count(Dictionary<string, MedalRule> d, string id, Func<GameSession, long> have, Func<GameSession, long> need)
            => d[id] = new MedalRule { Id = id, Test = s => { long n = need(s); return n > 0 && have(s) >= n; }, Progress = s => (Math.Min(need(s), have(s)), need(s)) };
        private static void Count(Dictionary<string, MedalRule> d, string id, Func<GameSession, long> have, long need) => Count(d, id, have, _ => need);
        private static void If(Dictionary<string, MedalRule> d, string id, Func<GameSession, bool> test) => d[id] = new MedalRule { Id = id, Test = test };

        public static readonly string[] BookRegions = { "S", "V", "C", "F", "T", "M", "P", "D", "H", "E" };
        public static readonly string[] JumpCourses = { "J001", "J002", "J003", "J004", "J005" };

        private static Dictionary<string, MedalRule> Build()
        {
            var d = new Dictionary<string, MedalRule>();
            // 成長
            foreach (var lv in new[] { 10, 30, 50, 70, 100, 150, 200 }) { int l = lv; Count(d, "lv" + l, s => s.Character.Level, l); }
            for (int t = 1; t <= 4; t++) { int tt = t; Count(d, "job" + tt, s => s.Character.Tier, tt); }
            Count(d, "play10h", s => (long)(s.PlaySec / 3600), 10);
            // 討伐
            foreach (var n in new long[] { 100, 1000, 10000, 100000 }) { long nn = n; Count(d, "kill" + nn, s => s.Records.Kills, nn); }
            Count(d, "boss1", s => s.Records.BossKills, 1);
            Count(d, "boss10", s => s.Records.BossKills, 10);
            Count(d, "bossAll", s => s.BossTypesKilled(), s => s.BossTypes());
            If(d, "raid1", s => s.RaidKilled());
            If(d, "bossFast", s => s.BestBossTime() > 0 && s.BestBossTime() <= 60);
            Count(d, "dmg10k", s => s.Records.MaxDamage, 10000);
            Count(d, "dmg100k", s => s.Records.MaxDamage, 100000);
            // 旅（訪ねたマップは冒険の記録の Flags "visit.*" を数える。GameSession.Records.cs）
            Count(d, "visit50", s => s.MapsVisited, 50);
            Count(d, "visit200", s => s.MapsVisited, 200);
            Count(d, "hidden1", s => s.Records.Hidden.Count, 1);
            Count(d, "hiddenAll", s => s.Records.Hidden.Count, s => s.Data.WorldMap.Hidden.Count);
            // 依頼（1 回だけのクエスト。GameSession.Records.cs の QuestsDone）
            Count(d, "quest10", s => s.QuestsDone, 10);
            Count(d, "quest50", s => s.QuestsDone, 50);
            Count(d, "quest200", s => s.QuestsDone, 200);
            // 図鑑
            Count(d, "card1", s => s.Book.TotalCards, 1);
            Count(d, "book10", s => s.Book.CompletedCount, 10);
            Count(d, "book50", s => s.Book.CompletedCount, 50);
            Count(d, "book100", s => s.Book.CompletedCount, 100);
            Count(d, "bookAll", s => s.Book.CompletedCount, s => s.BookIndex.Entries.Count);
            foreach (var r in BookRegions)
            {
                string rr = r;
                d["book." + rr] = new MedalRule
                {
                    Id = "book." + rr, Test = s => s.BookIndex.RegionComplete(rr, s.Book),
                    Progress = s => { long have = 0, need = 0; foreach (var e in s.BookIndex.InRegion(rr)) { need++; if (s.Book.Complete(e.Mob)) have++; } return (have, need); },
                };
            }
            // 書と財
            Count(d, "scroll3", s => s.Records.BestUpgrade, 3);
            Count(d, "scroll7", s => s.Records.BestUpgrade, 7);
            Count(d, "scrollFail10", s => s.Records.ScrollFail + s.Records.ScrollBroken, 10);
            Count(d, "scrollBroken", s => s.Records.ScrollBroken, 1);
            Count(d, "meso1m", s => s.Records.MesoPicked, 1000000);
            Count(d, "meso100m", s => s.Records.MaxMeso, 100000000);
            Count(d, "chair3", s => s.Records.Chairs.Count, 3);
            If(d, "petFriend", s => s.Pets.Count > 0);
            // ジャンプの試練
            foreach (var m in JumpCourses) { string mm = m; If(d, "jump." + mm, s => s.Records.JumpClears.ContainsKey(mm)); }
            Count(d, "jumpAll", s => s.Records.JumpClears.Count, JumpCourses.Length);
            // そのほか
            Count(d, "die1", s => s.Records.Deaths, 1);
            Count(d, "die50", s => s.Records.Deaths, 50);
            Count(d, "dungeon1", s => s.Records.DungeonClears, 1);
            Count(d, "medals20", s => s.MedalCount(), 20);
            return d;
        }
    }
}
