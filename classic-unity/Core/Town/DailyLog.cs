// 実時間の「1 日 N 回」「週 1 回」を数える（MONSTERS.md 5 章: 1 日 = ゲーム内の時計ではなく実時間の 1 日）。
// 日は GameSession.Clock の日付（既定は UTC。Unity 側で現地の時刻を返すようにすれば現地の日付で切り替わる）。
// キー: "room.<マップID>"（ボスの間・1 人用ダンジョン）、"chest.<調べる物の ID>"（毎日の宝箱）など。保存する。
using System;
using System.Collections.Generic;

namespace Lumina.Core.Town
{
    public sealed class DailyLog
    {
        /// <summary>キー → (数え始めた日の番号, 回数)</summary>
        public readonly Dictionary<string, (int day, int count)> Entries = new Dictionary<string, (int, int)>();

        public static int DayNumber(DateTime t) => (int)(t.Date - new DateTime(2000, 1, 1)).TotalDays;

        /// <summary>今の区切り（1 日・7 日）の始まりの日の番号。</summary>
        public static int PeriodStart(int day, bool weekly) => weekly ? day - ((day % 7) + 7) % 7 : day;

        public int Used(string key, DateTime now, bool weekly = false)
        {
            if (!Entries.TryGetValue(key, out var e)) return 0;
            return e.day == PeriodStart(DayNumber(now), weekly) ? e.count : 0;
        }

        public void Use(string key, DateTime now, bool weekly = false)
        {
            int p = PeriodStart(DayNumber(now), weekly);
            int n = Entries.TryGetValue(key, out var e) && e.day == p ? e.count : 0;
            Entries[key] = (p, n + 1);
        }
    }
}
