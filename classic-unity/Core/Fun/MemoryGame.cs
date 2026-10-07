// カードの神経衰弱（pairs 組 = 2 × pairs 枚）。主人公と遊び場の係が交代でめくる。そろえたらもう一度。多くそろえた方の勝ち。
// 係は見たカードを recall の確率で覚えている（easy 0.35 / normal 0.7）。覚えている組があれば必ず取る。
//
// 進め方: Flip(i) を 2 回。そろえば主人公の番が続く。そろわなければ Peek（2 枚が見えたまま）→ 次の Flip か Continue() で
// 係の番を最後まで進める（係のめくった順は NpcFlips に [i, j, そろった(1/0)] で残る。窓はそれを見せる）。
using System;
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Fun
{
    public sealed class MemoryGame
    {
        public readonly int[] Cards;        // 絵の番号（0〜pairs-1 が 2 枚ずつ）
        public readonly int[] Owner;        // 0 = まだ・1 = 主人公・2 = 係
        public int PlayerPairs, NpcPairs;
        public int First = -1;              // 主人公がめくった 1 枚目
        public int PeekA = -1, PeekB = -1;  // そろわなかった 2 枚（見えたまま）
        public bool Finished => PlayerPairs + NpcPairs >= Cards.Length / 2;
        public readonly List<int> NpcFlips = new List<int>();
        public readonly double Recall;
        private readonly Dictionary<int, int> memory = new Dictionary<int, int>(); // 係が覚えている: 場所 → 絵
        private readonly IRandom rng;

        public MemoryGame(int pairs, double recall, IRandom rng)
        {
            this.rng = rng;
            Recall = recall;
            pairs = Math.Max(2, pairs);
            Cards = new int[pairs * 2];
            Owner = new int[pairs * 2];
            for (int i = 0; i < Cards.Length; i++) Cards[i] = i / 2;
            for (int i = Cards.Length - 1; i > 0; i--) { int j = rng.Range(0, i); (Cards[i], Cards[j]) = (Cards[j], Cards[i]); }
        }

        /// <summary>今見えているか（そろった・めくった 1 枚目・そろわなかった 2 枚）。</summary>
        public bool FaceUp(int i) => Owner[i] != 0 || i == First || i == PeekA || i == PeekB;

        private void See(int i)
        {
            if (rng.NextDouble() < Recall) memory[i] = Cards[i];
        }

        /// <summary>主人公が i をめくる。めくれなければ false。</summary>
        public bool Flip(int i)
        {
            if (PeekA >= 0) { Continue(); return true; } // 見えたままの 2 枚がある時は、まず係の番（めくらない）
            if (Finished || i < 0 || i >= Cards.Length || Owner[i] != 0 || i == First) return false;
            NpcFlips.Clear();
            See(i);
            if (First < 0) { First = i; return true; }
            int a = First; First = -1;
            if (Cards[a] == Cards[i]) { Owner[a] = Owner[i] = 1; PlayerPairs++; memory.Remove(a); memory.Remove(i); }
            else { PeekA = a; PeekB = i; }
            return true;
        }

        /// <summary>そろわなかった 2 枚を伏せて、係の番を最後まで進める。</summary>
        public void Continue()
        {
            if (PeekA < 0) return;
            PeekA = PeekB = -1;
            NpcTurn();
        }

        private List<int> Hidden()
        {
            var l = new List<int>();
            for (int i = 0; i < Cards.Length; i++) if (Owner[i] == 0) l.Add(i);
            return l;
        }

        private void NpcTurn()
        {
            NpcFlips.Clear();
            for (int guard = 0; guard < Cards.Length && !Finished; guard++)
            {
                var hidden = Hidden();
                int a = -1, b = -1;
                // 覚えている組
                foreach (var kv in memory)
                {
                    foreach (var kv2 in memory)
                        if (kv.Key != kv2.Key && kv.Value == kv2.Value && Owner[kv.Key] == 0 && Owner[kv2.Key] == 0) { a = kv.Key; b = kv2.Key; break; }
                    if (a >= 0) break;
                }
                if (a < 0)
                {
                    var unknown = hidden.FindAll(i => !memory.ContainsKey(i));
                    var pool = unknown.Count > 0 ? unknown : hidden;
                    a = pool[rng.Range(0, pool.Count - 1)];
                    See(a);
                    foreach (var kv in memory) if (kv.Key != a && kv.Value == Cards[a] && Owner[kv.Key] == 0) { b = kv.Key; break; }
                    if (b < 0)
                    {
                        var rest = hidden.FindAll(i => i != a);
                        if (rest.Count == 0) break;
                        var u2 = rest.FindAll(i => !memory.ContainsKey(i));
                        var p2 = u2.Count > 0 ? u2 : rest;
                        b = p2[rng.Range(0, p2.Count - 1)];
                    }
                }
                See(a); See(b);
                bool match = Cards[a] == Cards[b];
                NpcFlips.Add(a); NpcFlips.Add(b); NpcFlips.Add(match ? 1 : 0);
                if (!match) break;
                Owner[a] = Owner[b] = 2; NpcPairs++; memory.Remove(a); memory.Remove(b);
            }
        }
    }
}
