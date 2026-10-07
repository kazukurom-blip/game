// 敵の強化（バフ）: 敵の技（type: buff）でかかる攻撃・魔法攻撃・防御・魔防・速さ・反射（物理・魔法）。
// 主人公の鎧崩し（def）・魔法崩し（magic）・力崩し（atk）・解除（all）で消える（JOBS.md 4 章）。
//   def   = 防御・物理の反射        magic = 魔法攻撃・魔防・魔法の反射        atk = 攻撃        all = 全部
// 同じ種類はかけ直すと強い方・長い方。Unity 側は mob.BuffIcons（ビット 1 << (int)MobBuffKind）でアイコンを出す。
using System;
using System.Collections.Generic;

namespace Lumina.Core.Mobs
{
    public sealed class MobBuffs
    {
        public const int KindCount = 7;
        public static readonly string[] Keys = { "atk", "matk", "def", "mdef", "speed", "reflect", "magicReflect" };
        public static readonly string[] Names = { "攻撃の強化", "魔法攻撃の強化", "防御の強化", "魔防の強化", "速さの強化", "反射", "魔法の反射" };

        private readonly double[] pct = new double[KindCount];
        private readonly double[] left = new double[KindCount];

        public double Pct(MobBuffKind k) => left[(int)k] > 0 ? pct[(int)k] : 0;
        public double Remaining(MobBuffKind k) => Math.Max(0, left[(int)k]);
        public bool Has(MobBuffKind k) => left[(int)k] > 0;
        public bool Any { get { for (int i = 0; i < KindCount; i++) if (left[i] > 0) return true; return false; } }

        public int Mask
        {
            get { int m = 0; for (int i = 0; i < KindCount; i++) if (left[i] > 0) m |= 1 << i; return m; }
        }

        /// <summary>かける。かかった種類を kinds に足す。</summary>
        public void Apply(MobBuffDef b, List<MobBuffKind> kinds = null)
        {
            if (b == null) return;
            for (int i = 0; i < KindCount; i++)
            {
                if (b.Pct[i] <= 0) continue;
                pct[i] = left[i] > 0 ? Math.Max(pct[i], b.Pct[i]) : b.Pct[i];
                left[i] = Math.Max(left[i], b.Sec);
                kinds?.Add((MobBuffKind)i);
            }
        }

        /// <summary>時間を進める。切れた種類を expired に足す。</summary>
        public void Tick(double dt, List<MobBuffKind> expired = null)
        {
            for (int i = 0; i < KindCount; i++)
            {
                if (left[i] <= 0) continue;
                left[i] -= dt;
                if (left[i] <= 1e-9) { left[i] = 0; pct[i] = 0; expired?.Add((MobBuffKind)i); }
            }
        }

        /// <summary>崩しの種類（def / magic / atk / all）で消えるか。</summary>
        public static bool DispelledBy(MobBuffKind k, string what)
        {
            switch (what)
            {
                case "def": return k == MobBuffKind.Def || k == MobBuffKind.Reflect;
                case "magic": return k == MobBuffKind.Matk || k == MobBuffKind.Mdef || k == MobBuffKind.MagicReflect;
                case "atk": return k == MobBuffKind.Atk;
                default: return true; // all・書いていない
            }
        }

        /// <summary>崩す。消えた種類を返す（無ければ空）。</summary>
        public List<MobBuffKind> Dispel(string what)
        {
            var r = new List<MobBuffKind>();
            for (int i = 0; i < KindCount; i++)
            {
                if (left[i] <= 0 || !DispelledBy((MobBuffKind)i, what)) continue;
                left[i] = 0; pct[i] = 0;
                r.Add((MobBuffKind)i);
            }
            return r;
        }

        public void Clear() { for (int i = 0; i < KindCount; i++) { left[i] = 0; pct[i] = 0; } }
    }
}
