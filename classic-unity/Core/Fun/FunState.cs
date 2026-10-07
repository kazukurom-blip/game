// 「楽しさの要素」の保存する物（セーブの "fun"。版 4 から）。読めない・無い値は既定値（いつもの姿・点数 0）。
//   points: 遊び場の点数 / look: 見た目（髪型・髪の色・顔・肌・帽子・服・名札・吹き出し）/ boss: フィールドボスが次に湧く遊んだ時間（秒。-1 = 湧いている）
//   pulls・jackpots: 景品の機械を回した数・大当たりの数 / seasons: 季節の頼みごとの初回を済ませた "autumn.2026" など / wins: 遊び場の勝ちの数
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Fun
{
    /// <summary>主人公の見た目（仮のアバターの部品の名前。Unity 側も同じ名前で部品を選ぶ）。</summary>
    public sealed class FunLook
    {
        public string Hair = "hair_spiky", HairColor = "brown", Face = "face_basic", Skin = "light";
        /// <summary>着けている見た目の品（アイテムの ID。null = 着けていない）</summary>
        public string Hat, Outfit, Tag, Bubble;

        public Dictionary<string, object> ToDict()
        {
            var d = new Dictionary<string, object> { { "hair", Hair }, { "hairColor", HairColor }, { "face", Face }, { "skin", Skin } };
            if (Hat != null) d["hat"] = Hat;
            if (Outfit != null) d["outfit"] = Outfit;
            if (Tag != null) d["tag"] = Tag;
            if (Bubble != null) d["bubble"] = Bubble;
            return d;
        }

        public static FunLook FromDict(Dictionary<string, object> d)
        {
            var l = new FunLook();
            if (d == null) return l;
            l.Hair = J.Str(d, "hair", l.Hair); l.HairColor = J.Str(d, "hairColor", l.HairColor); l.Face = J.Str(d, "face", l.Face); l.Skin = J.Str(d, "skin", l.Skin);
            l.Hat = J.Str(d, "hat"); l.Outfit = J.Str(d, "outfit"); l.Tag = J.Str(d, "tag"); l.Bubble = J.Str(d, "bubble");
            return l;
        }

        public string Get(string kind) => kind == "hat" ? Hat : kind == "outfit" ? Outfit : kind == "tag" ? Tag : kind == "bubble" ? Bubble : null;
        public void Set(string kind, string itemId)
        {
            switch (kind) { case "hat": Hat = itemId; break; case "outfit": Outfit = itemId; break; case "tag": Tag = itemId; break; case "bubble": Bubble = itemId; break; }
        }
    }

    public sealed class FunState
    {
        public long Points;
        public FunLook Look = new FunLook();
        /// <summary>フィールドボス（敵の ID）→ 次に湧く遊んだ時間（PlaySec）。-1 = 湧いている（倒されるまで）</summary>
        public readonly Dictionary<string, double> BossDue = new Dictionary<string, double>();
        public int Pulls, Jackpots, Wins;
        public readonly HashSet<string> SeasonFirst = new HashSet<string>();

        public Dictionary<string, object> ToDict()
        {
            var boss = new Dictionary<string, object>();
            foreach (var kv in BossDue) boss[kv.Key] = kv.Value;
            var seasons = new List<object>();
            foreach (var s in SeasonFirst) seasons.Add(s);
            return new Dictionary<string, object>
            {
                { "points", Points }, { "look", Look.ToDict() }, { "boss", boss },
                { "pulls", (long)Pulls }, { "jackpots", (long)Jackpots }, { "wins", (long)Wins }, { "seasons", seasons },
            };
        }

        public static FunState FromDict(Dictionary<string, object> d)
        {
            var f = new FunState();
            if (d == null) return f;
            f.Points = System.Math.Max(0, J.Long(d, "points"));
            f.Look = FunLook.FromDict(J.Obj(d, "look"));
            var boss = J.Obj(d, "boss");
            if (boss != null) foreach (var kv in boss) f.BossDue[kv.Key] = J.ToDouble(kv.Value);
            f.Pulls = J.Int(d, "pulls"); f.Jackpots = J.Int(d, "jackpots"); f.Wins = J.Int(d, "wins");
            foreach (var s in J.StrList(d, "seasons")) f.SeasonFirst.Add(s);
            return f;
        }
    }
}
