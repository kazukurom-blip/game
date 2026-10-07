// 勲章（称号）。条件を満たすと手に入り（お知らせ MedalEarned）、1 つだけ付けられる。付けると小さな能力（重ならない）と、名前の上の札。
// 条件と能力の表はここ（名前・文はオリジナル）。条件の判定は GameSession.Collection.cs が時々（0.5 秒ごと・倒した時など）呼ぶ。
using System;
using System.Collections.Generic;
using Lumina.Core.Game;
using Lumina.Core.Items;

namespace Lumina.Core.Collection
{
    public sealed class MedalDef
    {
        public string Id, Name, Hint, Group;
        /// <summary>付けた時の能力（無ければ空）</summary>
        public StatBlock Bonus = new StatBlock();
        public double ExpPct, MesoPct, DropPct;
        /// <summary>手に入れた時に一度だけもらうお金（地域の図鑑の完成など）</summary>
        public long RewardMeso;
        /// <summary>条件（true で手に入る）</summary>
        public Func<GameSession, bool> Test;
        /// <summary>進み（今・目標）。無ければ null</summary>
        public Func<GameSession, (long have, long need)> Progress;

        public string BonusText
        {
            get
            {
                var l = new List<string>();
                foreach (var k in StatBlock.Keys)
                {
                    int v = Bonus.Get(k);
                    if (v != 0) l.Add(StatName(k) + " +" + v);
                }
                if (ExpPct > 0) l.Add("経験値 +" + ExpPct + "%");
                if (MesoPct > 0) l.Add("お金 +" + MesoPct + "%");
                if (DropPct > 0) l.Add("ドロップ +" + DropPct + "%");
                return l.Count == 0 ? "なし" : string.Join("・", l);
            }
        }

        public static string StatName(string k)
        {
            switch (k)
            {
                case "str": return "STR"; case "dex": return "DEX"; case "int": return "INT"; case "luk": return "LUK";
                case "hp": return "HP"; case "mp": return "MP"; case "watk": return "攻撃力"; case "matk": return "魔力";
                case "wdef": return "防御"; case "mdef": return "魔防"; case "acc": return "命中"; case "avoid": return "回避";
                case "speed": return "速さ"; case "jump": return "ジャンプ"; default: return k;
            }
        }
    }

    public static class Medals
    {
        private static List<MedalDef> all;

        public static IReadOnlyList<MedalDef> All => all ??= Build();

        public static MedalDef Get(string id)
        {
            foreach (var m in All) if (m.Id == id) return m;
            return null;
        }

        private static StatBlock S(int str = 0, int dex = 0, int intel = 0, int luk = 0, int hp = 0, int mp = 0, int watk = 0, int matk = 0, int wdef = 0, int mdef = 0, int acc = 0, int avoid = 0, int speed = 0, int jump = 0)
            => new StatBlock { Str = str, Dex = dex, Int = intel, Luk = luk, Hp = hp, Mp = mp, Watk = watk, Matk = matk, Wdef = wdef, Mdef = mdef, Acc = acc, Avoid = avoid, Speed = speed, Jump = jump };

        private static MedalDef Count(string id, string name, string group, string hint, StatBlock bonus, Func<GameSession, long> have, long need)
            => new MedalDef { Id = id, Name = name, Group = group, Hint = hint, Bonus = bonus, Test = s => have(s) >= need, Progress = s => (Math.Min(need, have(s)), need) };

        // 地域の短い名前（図鑑の地域の勲章）
        private static readonly (string id, string name, long meso)[] BookRegions =
        {
            ("S", "芽吹きの島", 3000), ("V", "ヴェルデ大陸", 30000), ("C", "空の都", 50000), ("F", "雪の里", 60000), ("T", "おもちゃの町", 80000),
            ("M", "海の底", 80000), ("P", "古の神殿", 120000), ("D", "竜の谷", 150000), ("H", "火の山", 150000), ("E", "星の果て", 300000),
        };

        private static readonly (string map, string name)[] JumpCourses =
        {
            ("J001", "梢の跳ね鳥"), ("J002", "夜の屋根渡り"), ("J003", "雲を踏む者"), ("J004", "ゼンマイの軽業師"), ("J005", "竜骨の登り手"),
        };

        private static List<MedalDef> Build()
        {
            var l = new List<MedalDef>();
            // ---- 成長
            l.Add(Count("lv10", "若葉の冒険者", "成長", "Lv 10 になる", S(hp: 50), s => s.Character.Level, 10));
            l.Add(Count("lv30", "一人前の冒険者", "成長", "Lv 30 になる", S(str: 1, dex: 1, intel: 1, luk: 1), s => s.Character.Level, 30));
            l.Add(Count("lv50", "腕利きの冒険者", "成長", "Lv 50 になる", S(str: 2, dex: 2, intel: 2, luk: 2), s => s.Character.Level, 50));
            l.Add(Count("lv70", "名うての冒険者", "成長", "Lv 70 になる", S(str: 3, dex: 3, intel: 3, luk: 3), s => s.Character.Level, 70));
            l.Add(Count("lv100", "百の峰を越えた者", "成長", "Lv 100 になる", S(str: 4, dex: 4, intel: 4, luk: 4, hp: 100, mp: 100), s => s.Character.Level, 100));
            l.Add(Count("lv150", "星を仰ぐ者", "成長", "Lv 150 になる", S(str: 5, dex: 5, intel: 5, luk: 5, watk: 2, matk: 2), s => s.Character.Level, 150));
            l.Add(Count("lv200", "頂に立つ者", "成長", "Lv 200 になる", S(str: 8, dex: 8, intel: 8, luk: 8, watk: 5, matk: 5), s => s.Character.Level, 200));
            l.Add(Count("job1", "はじめの一歩", "成長", "1 次転職する", S(hp: 30, mp: 30), s => s.Character.Tier, 1));
            l.Add(Count("job2", "二つ目の道", "成長", "2 次転職する", S(acc: 5, avoid: 5), s => s.Character.Tier, 2));
            l.Add(Count("job3", "三つ目の扉", "成長", "3 次転職する", S(watk: 2, matk: 2), s => s.Character.Tier, 3));
            l.Add(Count("job4", "極みへ至る者", "成長", "4 次転職する", S(watk: 3, matk: 3, hp: 200), s => s.Character.Tier, 4));
            l.Add(Count("play10h", "長い旅路", "成長", "10 時間遊ぶ", S(hp: 100, mp: 100), s => (long)(s.PlaySec / 3600), 10));
            // ---- 討伐
            l.Add(Count("kill100", "百の討伐", "討伐", "敵を 100 体倒す", S(acc: 3), s => s.Records.Kills, 100));
            l.Add(Count("kill1000", "千の討伐", "討伐", "敵を 1,000 体倒す", S(watk: 1, matk: 1), s => s.Records.Kills, 1000));
            l.Add(Count("kill10000", "万の討伐", "討伐", "敵を 10,000 体倒す", S(watk: 2, matk: 2, acc: 5), s => s.Records.Kills, 10000));
            l.Add(Count("kill100000", "果てなき狩人", "討伐", "敵を 100,000 体倒す", S(watk: 4, matk: 4, acc: 10), s => s.Records.Kills, 100000));
            l.Add(Count("boss1", "主を討つ者", "討伐", "ボスを初めて倒す", S(wdef: 10, mdef: 10), s => s.Records.BossKills, 1));
            l.Add(Count("boss10", "ボスの天敵", "討伐", "ボスを 10 回倒す", S(wdef: 20, mdef: 20, hp: 100), s => s.Records.BossKills, 10));
            l.Add(Count("bossAll", "すべての主を越えた者", "討伐", "ボスを全種類倒す", S(watk: 5, matk: 5, wdef: 30, mdef: 30), s => s.BossKindsKilled(), s0 => s0.BossKinds()));
            l.Add(new MedalDef { Id = "raid1", Name = "天を揺るがす者", Group = "討伐", Hint = "大ボスを倒す", Bonus = S(hp: 300, mp: 300), Test = s => s.RaidKilled() });
            l.Add(new MedalDef { Id = "bossFast", Name = "疾風の討伐", Group = "討伐", Hint = "ボスを 60 秒以内に倒す", Bonus = S(speed: 5), Test = s => s.BestBossTime() > 0 && s.BestBossTime() <= 60 });
            l.Add(Count("dmg10k", "一撃一万", "討伐", "1 回で 10,000 以上のダメージ", S(watk: 1, matk: 1), s => s.Records.MaxDamage, 10000));
            l.Add(Count("dmg100k", "一撃十万", "討伐", "1 回で 100,000 以上のダメージ", S(watk: 3, matk: 3), s => s.Records.MaxDamage, 100000));
            // ---- 旅
            l.Add(Count("visit50", "地図好き", "旅", "50 のマップを訪ねる", S(speed: 3), s => s.Records.Visited.Count, 50));
            l.Add(Count("visit150", "歩く地図帳", "旅", "150 のマップを訪ねる", S(speed: 5, jump: 2), s => s.Records.Visited.Count, 150));
            l.Add(Count("towns", "旅する足", "旅", "すべての町を訪ねる", S(speed: 5), s => s.TownsVisited(), s0 => s0.TownCount()));
            l.Add(Count("hidden1", "隠し部屋の発見者", "旅", "隠し部屋を見つける", S(luk: 2), s => s.Records.Hidden.Count, 1));
            l.Add(Count("hiddenAll", "秘密を暴く者", "旅", "隠し部屋をすべて見つける", S(luk: 5, avoid: 5), s => s.Records.Hidden.Count, s0 => s0.Data.WorldMap.Hidden.Count));
            // ---- 依頼
            l.Add(Count("quest10", "頼れる人", "依頼", "クエストを 10 本終える", S(hp: 50, mp: 50), s => s.QuestsDone(), 10));
            l.Add(Count("quest50", "町の顔", "依頼", "クエストを 50 本終える", S(hp: 100, mp: 100), s => s.QuestsDone(), 50));
            l.Add(Count("quest100", "百の依頼をこなした者", "依頼", "クエストを 100 本終える", S(hp: 200, mp: 200, acc: 3), s => s.QuestsDone(), 100));
            l.Add(Count("quest200", "大陸の守り手", "依頼", "クエストを 200 本終える", S(hp: 300, mp: 300, wdef: 20), s => s.QuestsDone(), 200));
            // ---- 図鑑
            l.Add(Count("card1", "はじめてのカード", "図鑑", "敵のカードを 1 枚拾う", S(luk: 1), s => s.Book.TotalCards, 1));
            l.Add(Count("book10", "図鑑 10 種", "図鑑", "図鑑を 10 種完成させる", S(acc: 3, avoid: 3), s => s.Book.CompletedCount, 10));
            l.Add(Count("book50", "図鑑 50 種", "図鑑", "図鑑を 50 種完成させる", S(acc: 5, avoid: 5, hp: 100), s => s.Book.CompletedCount, 50));
            l.Add(Count("book100", "図鑑 100 種", "図鑑", "図鑑を 100 種完成させる", S(watk: 2, matk: 2, hp: 200), s => s.Book.CompletedCount, 100));
            l.Add(Count("bookAll", "生き物の大博士", "図鑑", "図鑑をすべて完成させる", S(str: 5, dex: 5, intel: 5, luk: 5, watk: 3, matk: 3), s => s.Book.CompletedCount, s0 => s0.BookIndex.Entries.Count));
            foreach (var (rid, rname, meso) in BookRegions)
            {
                string r = rid;
                l.Add(new MedalDef
                {
                    Id = "book." + r, Name = rname + "の博物家", Group = "図鑑", Hint = rname + "の敵の図鑑をすべて完成させる（" + meso.ToString("N0") + " ルド）",
                    Bonus = S(acc: 2, avoid: 2), DropPct = 5, RewardMeso = meso,
                    Test = s => s.BookIndex.RegionComplete(r, s.Book),
                    Progress = s => { long have = 0, need = 0; foreach (var e in s.BookIndex.InRegion(r)) { need++; if (s.Book.Complete(e.Mob)) have++; } return (have, need); },
                });
            }
            // ---- 書・お金
            l.Add(Count("scroll3", "書の見習い", "書と財", "書で装備を +3 にする", S(acc: 2), s => s.Records.BestUpgrade, 3));
            l.Add(Count("scroll7", "書の名工", "書と財", "書で装備を +7 にする", S(watk: 2, matk: 2), s => s.Records.BestUpgrade, 7));
            l.Add(Count("scrollFail10", "めげない心", "書と財", "書を 10 回失敗する", S(luk: 3), s => s.Records.ScrollFail + s.Records.ScrollBroken, 10));
            l.Add(Count("scrollBroken", "砕けた夢", "書と財", "呪いの書で装備を壊す", S(hp: 50), s => s.Records.ScrollBroken, 1));
            l.Add(new MedalDef { Id = "meso1m", Name = "小金持ち", Group = "書と財", Hint = "拾ったお金の合計 1,000,000 ルド", MesoPct = 3, Test = s => s.Records.MesoPicked >= 1000000, Progress = s => (Math.Min(1000000, s.Records.MesoPicked), 1000000) });
            l.Add(new MedalDef { Id = "meso100m", Name = "大富豪", Group = "書と財", Hint = "100,000,000 ルドを持つ", MesoPct = 5, Test = s => s.Records.MaxMeso >= 100000000, Progress = s => (Math.Min(100000000, s.Records.MaxMeso), 100000000) });
            l.Add(Count("chair3", "椅子好き", "書と財", "椅子を 3 つ集める", S(hp: 50, mp: 50), s => s.Records.Chairs.Count, 3));
            l.Add(new MedalDef { Id = "pet", Name = "相棒と共に", Group = "書と財", Hint = "ペットを迎える", Bonus = S(luk: 2), Test = s => s.Pets.Count > 0 });
            // ---- ジャンプの試練
            foreach (var (map, name) in JumpCourses)
            {
                string m = map;
                l.Add(new MedalDef { Id = "jump." + m, Name = name, Group = "試練", Hint = "ジャンプの試練「" + (CourseName(m)) + "」のてっぺんに着く", Bonus = S(jump: 3, speed: 3), Test = s => s.Records.JumpClears.ContainsKey(m) });
            }
            l.Add(Count("jumpAll", "天空の跳躍王", "試練", "ジャンプの試練をすべて登りきる", S(jump: 6, speed: 6, avoid: 5), s => s.Records.JumpClears.Count, JumpCourses.Length));
            // ---- そのほか
            l.Add(Count("die1", "転んでも立ち上がる", "そのほか", "1 回倒れる", S(hp: 20), s => s.Records.Deaths, 1));
            l.Add(Count("die50", "不屈の魂", "そのほか", "50 回倒れる", S(hp: 150, wdef: 10), s => s.Records.Deaths, 50));
            l.Add(Count("dungeon1", "ダンジョンの踏破者", "そのほか", "1 人用ダンジョンをクリアする", S(acc: 3, avoid: 3), s => s.DungeonClears(), 1));
            var m20 = Count("medals20", "勲章の収集家", "そのほか", "勲章を 20 個集める", new StatBlock(), s => s.MedalsEarned.Count, 20);
            m20.ExpPct = 5;
            l.Add(m20);
            return l;
        }

        private static MedalDef Count(string id, string name, string group, string hint, StatBlock bonus, Func<GameSession, long> have, Func<GameSession, long> need)
            => new MedalDef { Id = id, Name = name, Group = group, Hint = hint, Bonus = bonus, Test = s => { long n = need(s); return n > 0 && have(s) >= n; }, Progress = s => (Math.Min(need(s), have(s)), need(s)) };

        public static string CourseName(string map)
        {
            switch (map)
            {
                case "J001": return "そよ風の木登り";
                case "J002": return "屋根伝いの夜道";
                case "J003": return "雲の柱のぼり";
                case "J004": return "ゼンマイ塔の階段";
                case "J005": return "竜骨の背のぼり";
                default: return map;
            }
        }
    }
}
