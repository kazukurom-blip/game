// 五目並べ（15×15）。主人公が黒（先手）、遊び場の係が白。縦・横・斜めに 5 つ以上並べた方の勝ち（禁じ手なし）。
// 係の考え: 置ける所（石の近く）ごとに「自分が置いた時の並び」と「相手の並びを止める」の点を足し、一番高い所に置く。
//   easy   … 相手の 4 つは止めるが、3 つは時々見のがし、点に大きなゆらぎ
//   normal … 4 つ・開いた 3 つを必ず見て、ゆらぎは小さい
using System;
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Fun
{
    public enum GomokuResult { Playing, PlayerWin, NpcWin, Draw }

    public sealed class Gomoku
    {
        public readonly int Size;
        /// <summary>盤（0 = 空・1 = 主人公（黒）・2 = 係（白））。[y * Size + x]</summary>
        public readonly int[] Cells;
        public readonly string Level;
        public GomokuResult Result = GomokuResult.Playing;
        public int LastX = -1, LastY = -1, Moves;
        /// <summary>勝った時の 5 つの並び（[x, y] の 5 組）</summary>
        public readonly List<int> WinLine = new List<int>();
        private readonly IRandom rng;

        public Gomoku(int size, string level, IRandom rng)
        {
            Size = Math.Max(5, size);
            Cells = new int[Size * Size];
            Level = level == "normal" ? "normal" : "easy";
            this.rng = rng;
        }

        public int At(int x, int y) => x < 0 || y < 0 || x >= Size || y >= Size ? -1 : Cells[y * Size + x];

        /// <summary>主人公が (x, y) に置き、続けて係が置く。置けなければ false。</summary>
        public bool Play(int x, int y)
        {
            if (Result != GomokuResult.Playing || At(x, y) != 0) return false;
            Put(x, y, 1);
            if (Result != GomokuResult.Playing) return true;
            var (nx, ny) = ChooseMove();
            if (nx >= 0) Put(nx, ny, 2);
            return true;
        }

        private void Put(int x, int y, int who)
        {
            Cells[y * Size + x] = who;
            LastX = x; LastY = y; Moves++;
            if (FiveFrom(x, y, who)) Result = who == 1 ? GomokuResult.PlayerWin : GomokuResult.NpcWin;
            else if (Moves >= Size * Size) Result = GomokuResult.Draw;
        }

        private static readonly int[,] Dirs = { { 1, 0 }, { 0, 1 }, { 1, 1 }, { 1, -1 } };

        private bool FiveFrom(int x, int y, int who)
        {
            for (int d = 0; d < 4; d++)
            {
                int dx = Dirs[d, 0], dy = Dirs[d, 1];
                int a = 0, b = 0;
                while (At(x + dx * (a + 1), y + dy * (a + 1)) == who) a++;
                while (At(x - dx * (b + 1), y - dy * (b + 1)) == who) b++;
                if (a + b + 1 >= 5)
                {
                    WinLine.Clear();
                    for (int k = -b; k < -b + 5; k++) { WinLine.Add(x + dx * k); WinLine.Add(y + dy * k); }
                    return true;
                }
            }
            return false;
        }

        /// <summary>その所に who が置いた時の、1 方向の並びの長さと開いている端の数。</summary>
        private (int len, int open) Line(int x, int y, int dx, int dy, int who)
        {
            int a = 0, b = 0;
            while (At(x + dx * (a + 1), y + dy * (a + 1)) == who) a++;
            while (At(x - dx * (b + 1), y - dy * (b + 1)) == who) b++;
            int open = (At(x + dx * (a + 1), y + dy * (a + 1)) == 0 ? 1 : 0) + (At(x - dx * (b + 1), y - dy * (b + 1)) == 0 ? 1 : 0);
            return (a + b + 1, open);
        }

        private static double Shape(int len, int open)
        {
            if (len >= 5) return 100000;
            if (open == 0) return 0;
            switch (len)
            {
                case 4: return open == 2 ? 20000 : 3000;
                case 3: return open == 2 ? 2500 : 300;
                case 2: return open == 2 ? 200 : 40;
                default: return open == 2 ? 10 : 2;
            }
        }

        /// <summary>その所の点（自分の攻め ＋ 相手の守り）。</summary>
        public double Score(int x, int y, bool easy)
        {
            double atk = 0, def = 0;
            for (int d = 0; d < 4; d++)
            {
                var (la, oa) = Line(x, y, Dirs[d, 0], Dirs[d, 1], 2);
                var (ld, od) = Line(x, y, Dirs[d, 0], Dirs[d, 1], 1);
                atk += Shape(la, oa);
                double s = Shape(ld, od);
                // easy: 開いた 3 つ以下の守りは時々見のがす（4 つ・5 つは止める）
                if (easy && ld <= 3 && rng.NextDouble() < 0.4) s *= 0.2;
                def += s;
            }
            return atk * 1.1 + def;
        }

        /// <summary>係の手（置ける所が無ければ (-1, -1)）。</summary>
        public (int, int) ChooseMove()
        {
            bool easy = Level == "easy";
            if (Moves == 0) return (Size / 2, Size / 2);
            double best = double.NegativeInfinity; int bx = -1, by = -1;
            for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                {
                    if (Cells[y * Size + x] != 0 || !Near(x, y)) continue;
                    double s = Score(x, y, easy);
                    s *= 1 + (rng.NextDouble() - 0.5) * (easy ? 0.6 : 0.1); // ゆらぎ
                    if (s > best) { best = s; bx = x; by = y; }
                }
            if (bx < 0) for (int i = 0; i < Cells.Length; i++) if (Cells[i] == 0) return (i % Size, i / Size);
            return (bx, by);
        }

        private bool Near(int x, int y)
        {
            for (int dy = -2; dy <= 2; dy++)
                for (int dx = -2; dx <= 2; dx++)
                    if (At(x + dx, y + dy) > 0) return true;
            return false;
        }
    }
}
