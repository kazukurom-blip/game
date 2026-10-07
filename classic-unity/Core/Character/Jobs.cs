// 職の表（JOBS.md 2 章・3 章）。系統（line）と段階（tier: 0=初心者, 1〜4=1〜4 次）で職を表す。
using System;
using Lumina.Core.Combat;
using Lumina.Core.Util;

namespace Lumina.Core.Character
{
    public static class JobLine
    {
        public const string Beginner = "beginner";
        public const string Warrior = "warrior";
        public const string Magician = "magician";
        public const string Bowman = "bowman";
        public const string Thief = "thief";
        public const string Pirate = "pirate";
        public static readonly string[] FirstJobs = { Warrior, Magician, Bowman, Thief, Pirate };
    }

    public sealed class JobInfo
    {
        public string Line, Name;
        public int HpMin, HpMax, MpMin, MpMax;  // Lv が 1 上がるごと
        public int ApHp, ApMp;                  // AP を HP/MP に振った時
        public Stat Main, Sub;
        public int AdvLevel; public Stat AdvStat; public int AdvValue; // 1 次転職の条件
        public double AvoidCap;
        public string[] Tier2Names, Tier3Names, Tier4Names;
    }

    public static class Jobs
    {
        public static readonly JobInfo Beginner = new JobInfo
        {
            Line = JobLine.Beginner, Name = "初心者", HpMin = 12, HpMax = 16, MpMin = 10, MpMax = 12, ApHp = 16, ApMp = 10,
            Main = Stat.STR, Sub = Stat.DEX, AvoidCap = 0.3,
        };
        public static readonly JobInfo Warrior = new JobInfo
        {
            Line = JobLine.Warrior, Name = "戦士", HpMin = 24, HpMax = 28, MpMin = 4, MpMax = 6, ApHp = 20, ApMp = 2,
            Main = Stat.STR, Sub = Stat.DEX, AdvLevel = 10, AdvStat = Stat.STR, AdvValue = 35, AvoidCap = 0.3,
            Tier2Names = new[] { "ファイター", "ページ", "スピアマン" }, Tier3Names = new[] { "クルセイダー", "ナイト", "ドラグーン" }, Tier4Names = new[] { "チャンピオン", "パラディン", "ダークナイト" },
        };
        public static readonly JobInfo Magician = new JobInfo
        {
            Line = JobLine.Magician, Name = "魔法使い", HpMin = 10, HpMax = 14, MpMin = 22, MpMax = 24, ApHp = 8, ApMp = 18,
            Main = Stat.INT, Sub = Stat.LUK, AdvLevel = 8, AdvStat = Stat.INT, AdvValue = 20, AvoidCap = 0.3,
            Tier2Names = new[] { "ファイアウィザード", "アイスウィザード", "クレリック" }, Tier3Names = new[] { "ファイアメイジ", "アイスメイジ", "プリースト" }, Tier4Names = new[] { "ファイアアークメイジ", "アイスアークメイジ", "ビショップ" },
        };
        public static readonly JobInfo Bowman = new JobInfo
        {
            Line = JobLine.Bowman, Name = "弓使い", HpMin = 20, HpMax = 24, MpMin = 14, MpMax = 16, ApHp = 16, ApMp = 10,
            Main = Stat.DEX, Sub = Stat.STR, AdvLevel = 10, AdvStat = Stat.DEX, AdvValue = 25, AvoidCap = 0.3,
            Tier2Names = new[] { "ハンター", "クロスボウマン" }, Tier3Names = new[] { "レンジャー", "スナイパー" }, Tier4Names = new[] { "マスターアーチャー", "マークスマン" },
        };
        public static readonly JobInfo Thief = new JobInfo
        {
            Line = JobLine.Thief, Name = "盗賊", HpMin = 20, HpMax = 24, MpMin = 14, MpMax = 16, ApHp = 16, ApMp = 10,
            Main = Stat.LUK, Sub = Stat.DEX, AdvLevel = 10, AdvStat = Stat.DEX, AdvValue = 25, AvoidCap = 0.8,
            Tier2Names = new[] { "アサシン", "バンディット" }, Tier3Names = new[] { "ハーミット", "ローグ" }, Tier4Names = new[] { "ナイトストーカー", "シャドウブレード" },
        };
        public static readonly JobInfo Pirate = new JobInfo
        {
            Line = JobLine.Pirate, Name = "海賊", HpMin = 22, HpMax = 26, MpMin = 18, MpMax = 22, ApHp = 16, ApMp = 10,
            Main = Stat.STR, Sub = Stat.DEX, AdvLevel = 10, AdvStat = Stat.DEX, AdvValue = 20, AvoidCap = 0.3,
            Tier2Names = new[] { "ブローラー", "ガンスリンガー" }, Tier3Names = new[] { "ストライカー", "アウトロー" }, Tier4Names = new[] { "ファイトマスター", "キャプテン" },
        };

        public static JobInfo Get(string line)
        {
            switch (line)
            {
                case JobLine.Warrior: return Warrior;
                case JobLine.Magician: return Magician;
                case JobLine.Bowman: return Bowman;
                case JobLine.Thief: return Thief;
                case JobLine.Pirate: return Pirate;
                default: return Beginner;
            }
        }

        /// <summary>2〜4 次の転職ができる Lv</summary>
        public static int TierLevel(int tier)
        {
            switch (tier)
            {
                case 1: return 10;
                case 2: return 30;
                case 3: return 70;
                case 4: return 120;
                default: return 1;
            }
        }

        /// <summary>職名（段階と枝で変わる）。branch は 2 次で選んだ枝（0 始まり）。</summary>
        public static string DisplayName(string line, int tier, int branch)
        {
            var j = Get(line);
            if (tier <= 0 || line == JobLine.Beginner) return Beginner.Name;
            if (tier == 1) return j.Name;
            var names = tier == 2 ? j.Tier2Names : tier == 3 ? j.Tier3Names : j.Tier4Names;
            if (names == null || names.Length == 0) return j.Name;
            return names[Math.Max(0, Math.Min(names.Length - 1, branch))];
        }
    }
}
