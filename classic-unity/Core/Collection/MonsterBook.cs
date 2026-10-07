// 敵の図鑑（カード集め）。どの敵も低い確率で「その敵のカード」を落とす（強敵・ボスは高め）。1 種類 5 枚で完成。
// 完成した種類の数で図鑑の段（Lv）が上がり、段ごとに小さな能力の上乗せ（StatBlock）。地域の敵を全部完成させると地域のごほうび（勲章）。
// カードは持ち物に入らない（拾うと図鑑へ）。落ちている時のアイテムの ID は "card.<敵の ID>"。
using System;
using System.Collections.Generic;
using Lumina.Core.Items;
using Lumina.Core.Mobs;

namespace Lumina.Core.Collection
{
    public sealed class MonsterBook
    {
        public const int CardsPerSet = 5;
        public const string CardPrefix = "card.";

        /// <summary>敵の ID → 持っているカードの数（0〜5）</summary>
        public readonly Dictionary<string, int> Cards = new Dictionary<string, int>();

        public static bool IsCard(string itemId) => itemId != null && itemId.StartsWith(CardPrefix, StringComparison.Ordinal);
        public static string CardId(string mobId) => CardPrefix + mobId;
        public static string MobOfCard(string itemId) => IsCard(itemId) ? itemId.Substring(CardPrefix.Length) : null;

        public int Count(string mobId) => mobId != null && Cards.TryGetValue(mobId, out var n) ? n : 0;
        public bool Complete(string mobId) => Count(mobId) >= CardsPerSet;

        public int CompletedCount { get { int c = 0; foreach (var v in Cards.Values) if (v >= CardsPerSet) c++; return c; } }
        public int TotalCards { get { int c = 0; foreach (var v in Cards.Values) c += v; return c; } }
        public int Level => LevelFor(CompletedCount);

        /// <summary>1 枚足す。完成していたら false（足さない）。</summary>
        public bool Add(string mobId)
        {
            if (mobId == null || Complete(mobId)) return false;
            Cards[mobId] = Count(mobId) + 1;
            return true;
        }

        /// <summary>カードが落ちる確率。ふつう 1.2%・強敵 8%・ボス（段階のある敵・ボス）30%・大ボス 60%。仕掛けの物は落とさない。</summary>
        public static double CardChance(MobDef def)
        {
            if (def == null) return 0;
            if (def.Kind == "raid") return 0.6;
            if (def.IsBoss || def.Boss != null) return 0.3;
            if (def.IsElite) return 0.08;
            return 0.012;
        }

        // 段（Lv）: 完成した種類の数がこの値に届くと 1 つ上がる
        public static readonly int[] LevelSteps = { 3, 8, 15, 25, 40, 60, 85, 115, 145, 170 };

        public static int LevelFor(int completed)
        {
            int lv = 0;
            foreach (var s in LevelSteps) if (completed >= s) lv++;
            return lv;
        }

        /// <summary>次の段までに要る完成の数（最大なら -1）。</summary>
        public static int NextStep(int completed)
        {
            foreach (var s in LevelSteps) if (completed < s) return s;
            return -1;
        }

        /// <summary>段ごとの上乗せ: HP・MP +30×Lv、命中・回避 +2×Lv、攻撃力・魔力 +Lv÷2、Lv5 から防御・魔防 +5×(Lv−4)。</summary>
        public static StatBlock BonusFor(int lv)
        {
            var b = new StatBlock();
            if (lv <= 0) return b;
            b.Hp = 30 * lv; b.Mp = 30 * lv;
            b.Acc = 2 * lv; b.Avoid = 2 * lv;
            b.Watk = lv / 2; b.Matk = lv / 2;
            if (lv >= 5) { b.Wdef = 5 * (lv - 4); b.Mdef = 5 * (lv - 4); }
            return b;
        }

        public static string BonusText(int lv)
        {
            if (lv <= 0) return "なし";
            var b = BonusFor(lv);
            var s = $"HP・MP +{b.Hp}　命中・回避 +{b.Acc}";
            if (b.Watk > 0) s += $"　攻撃力・魔力 +{b.Watk}";
            if (b.Wdef > 0) s += $"　防御・魔防 +{b.Wdef}";
            return s;
        }

        public Dictionary<string, object> ToDict()
        {
            var d = new Dictionary<string, object>();
            foreach (var kv in Cards) if (kv.Value > 0) d[kv.Key] = (long)kv.Value;
            return d;
        }

        public void Read(Dictionary<string, object> d)
        {
            Cards.Clear();
            if (d == null) return;
            foreach (var kv in d) Cards[kv.Key] = Math.Max(0, Math.Min(CardsPerSet, (int)Util.J.ToDouble(kv.Value)));
        }
    }
}
