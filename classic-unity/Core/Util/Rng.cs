// 乱数。テストで同じ結果を出せるよう、種（seed）から決まる自前の乱数（xorshift128+）。
// UnityEngine.Random や System.Random には頼らない（版で中身が変わらないように）。
using System;

namespace Lumina.Core.Util
{
    public interface IRandom
    {
        /// <summary>0 以上 1 未満</summary>
        double NextDouble();
    }

    public sealed class Rng : IRandom
    {
        private ulong s0, s1;

        public Rng(ulong seed)
        {
            // splitmix64 で 2 つの状態を作る（0 にならないように）
            s0 = SplitMix(ref seed);
            s1 = SplitMix(ref seed);
            if (s0 == 0 && s1 == 0) s1 = 1;
        }

        public ulong State0 => s0;
        public ulong State1 => s1;
        public void SetState(ulong a, ulong b) { s0 = a; s1 = b == 0 && a == 0 ? 1 : b; }

        private static ulong SplitMix(ref ulong x)
        {
            x += 0x9E3779B97F4A7C15UL;
            ulong z = x;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return z ^ (z >> 31);
        }

        public ulong NextULong()
        {
            ulong x = s0, y = s1;
            s0 = y;
            x ^= x << 23;
            s1 = x ^ y ^ (x >> 17) ^ (y >> 26);
            return s1 + y;
        }

        public double NextDouble() => (NextULong() >> 11) * (1.0 / 9007199254740992.0);
    }

    public static class RandomExt
    {
        /// <summary>min 以上 max 以下の整数</summary>
        public static int Range(this IRandom r, int min, int max)
        {
            if (max <= min) return min;
            return min + (int)Math.Floor(r.NextDouble() * (max - min + 1));
        }

        /// <summary>min 以上 max 未満の実数</summary>
        public static double Range(this IRandom r, double min, double max) => min + r.NextDouble() * (max - min);

        /// <summary>確率 p（0〜1）で true</summary>
        public static bool Chance(this IRandom r, double p) => p >= 1 || (p > 0 && r.NextDouble() < p);
    }

    /// <summary>テスト用: 決まった値を順に返す乱数（尽きたら最後の値をくり返す）。</summary>
    public sealed class FixedRandom : IRandom
    {
        private readonly double[] values;
        private int i;
        public FixedRandom(params double[] values) { this.values = values.Length > 0 ? values : new[] { 0.5 }; }
        public double NextDouble() { var v = values[Math.Min(i, values.Length - 1)]; i++; return v; }
    }
}
