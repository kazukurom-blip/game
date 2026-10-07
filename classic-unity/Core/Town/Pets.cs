// ペット（QUESTS.md 4 章・ITEMS.md 3-5）。連れて歩く・満腹度・親密度・芸・技（自動で拾う・拾う範囲・自動で薬）。
// 数の決まりは PetRules（systems.json）。ここは 1 匹ぶんの状態だけ。動かすのは GameSession.Pets.cs。
using System;

namespace Lumina.Core.Town
{
    public sealed class PetState
    {
        public string Kind, Name;
        public int Fullness = 100;
        public int Points;               // 親密度の点（Lv は PetRules.PointsFor で決まる）
        public bool Out;                 // 連れて歩いている
        public bool SkillPickup, SkillRange, SkillPotion;

        // 動き（保存しない）。Unity は X, Y, FacingRight, Motion を見て描く
        public double X, Y;
        public bool FacingRight = true;
        public string Motion = "stand";  // stand / move / hungry（満腹度 0 で動かない）/ trick
        public double HungerT, WalkT, StarveT, TrickCd, PickT, TrickShowT;

        public bool Hungry => Fullness <= 0;

        public int Closeness(PetRules r)
        {
            int lv = 1;
            while (lv < r.ClosenessMax && Points >= r.PointsFor(lv + 1)) lv++;
            return lv;
        }

        /// <summary>今できる芸の数（親密度 5 ごとに 1 つ増える。最初は 1 つ）。</summary>
        public int TrickCount(PetRules r) => Math.Min(r.Tricks.Count, 1 + Closeness(r) / 5);

        /// <summary>見た目の名前（子竜は親密度 30 で「竜」に育つ）。</summary>
        public string KindName(PetRules r)
        {
            var k = r.Kind(Kind);
            if (k == null) return Kind;
            return k.GrownName != null && k.GrowAt > 0 && Closeness(r) >= k.GrowAt ? k.GrownName : k.Name;
        }
    }
}
