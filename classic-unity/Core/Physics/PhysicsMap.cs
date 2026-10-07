// 足場（foothold）の線・縄・はしご・壁。ブラウザ版の classic/src/world/mapFormat.js と同じ考え方。
// - 足場は「つながった折れ線」。点は左から右へ。線分ごとに Prev/Next でつながる（クラシックの足場と同じ）。
// - Ground = 一番下の地面（↓＋ジャンプで降りられない）。それ以外は浮いた足場（下からすり抜けて乗れる）。
// - 座標: x は右が正、y は下が正（画面と同じ）。y は「足元の高さ」。
using System;
using System.Collections.Generic;

namespace Lumina.Core.Physics
{
    public sealed class FootholdChain
    {
        public string Id;
        public bool Ground;
        public string Tile = "grass";
        public readonly List<Foothold> Segs = new List<Foothold>();
    }

    public sealed class Foothold
    {
        public string Id;
        public FootholdChain Chain;
        public double X1, Y1, X2, Y2;
        public Foothold Prev, Next;
        public double Len, Cos;

        public double YAt(double x)
        {
            double t = (x - X1) / (X2 - X1);
            return Y1 + (Y2 - Y1) * t;
        }
    }

    public sealed class Rope
    {
        public int Id;
        public bool Ladder;
        public double X, Top, Bottom;
    }

    /// <summary>縦の壁（クラシックの縦の足場の線）。Top〜Bottom の高さにいる時、左右に通れない。</summary>
    public sealed class Wall
    {
        public double X, Top, Bottom;
    }

    public sealed class PhysicsMap
    {
        public double Width, Height;
        public readonly List<Foothold> Segs = new List<Foothold>();
        public readonly List<FootholdChain> Chains = new List<FootholdChain>();
        public readonly List<Rope> Ropes = new List<Rope>();
        public readonly List<Wall> Walls = new List<Wall>();

        public PhysicsMap(double width, double height) { Width = width; Height = height; }

        /// <summary>折れ線を 1 本足す。points = [x0,y0, x1,y1, ...]</summary>
        public FootholdChain AddChain(string id, bool ground, params double[] points)
        {
            if (points.Length < 4 || points.Length % 2 != 0) throw new ArgumentException("footholds " + id + ": 点が 2 つ以上必要");
            var chain = new FootholdChain { Id = id, Ground = ground };
            Foothold prev = null;
            for (int i = 0; i + 3 < points.Length; i += 2)
            {
                double x1 = points[i], y1 = points[i + 1], x2 = points[i + 2], y2 = points[i + 3];
                if (!(x2 > x1)) throw new ArgumentException("footholds " + id + ": 点は左から右へ（縦の線は Walls に書く）");
                double len = Hypot(x2 - x1, y2 - y1);
                var s = new Foothold
                {
                    Id = id + "#" + (i / 2), Chain = chain, X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Prev = prev,
                    Len = len, Cos = (x2 - x1) / len,
                };
                if (prev != null) prev.Next = s;
                chain.Segs.Add(s);
                Segs.Add(s);
                prev = s;
            }
            Chains.Add(chain);
            return chain;
        }

        public Rope AddRope(double x, double top, double bottom, bool ladder = false)
        {
            if (!(bottom > top)) throw new ArgumentException("ropes: bottom > top が必要");
            var r = new Rope { Id = Ropes.Count, X = x, Top = top, Bottom = bottom, Ladder = ladder };
            Ropes.Add(r);
            return r;
        }

        public Wall AddWall(double x, double top, double bottom)
        {
            var w = new Wall { X = x, Top = Math.Min(top, bottom), Bottom = Math.Max(top, bottom) };
            Walls.Add(w);
            return w;
        }

        // JS の Math.hypot と同じ値になるように（ふつうの範囲では sqrt(a²+b²) と一致する）
        private static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);

        /// <summary>x の真下（y より下、または同じ高さ）にある一番近い線分（mapFormat.js の segBelow）</summary>
        public Foothold SegBelow(double x, double y, FootholdChain ignore = null)
        {
            Foothold best = null; double by = double.PositiveInfinity;
            foreach (var s in Segs)
            {
                if (s.Chain == ignore) continue;
                if (x < s.X1 || x > s.X2) continue;
                double sy = s.YAt(x);
                if (sy >= y - 0.5 && sy < by) { by = sy; best = s; }
            }
            return best;
        }
    }
}
