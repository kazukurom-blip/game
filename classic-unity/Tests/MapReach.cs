// 本物の物理（PlayerPhysics）でマップを歩き回って、どの足場からどの足場へ行けるかを調べる道具（テスト用）。
// Data/tools/world/check.mjs（設計の値で作った検査）とは別のやり方で、同じこと（どのポータルからも全部の足場へ行ける）を確かめる。
//
// 足場の「かたまり」= 足場の折れ線 1 本を、体がつかえる壁で区切った物。
// 1 つのかたまりの上の立てる所（16 px おき）から、次の動きを試して、着いたかたまりを覚える:
//   その場ジャンプ / ↓＋ジャンプ（浮いた足場）/ 端から歩いて落ちる / 壁の手前から走って跳び越える / 縄・はしごを上る・下りる / 同じマップの中のポータル
// 動く前は、その x に止まって立っている（WalkTo で歩いて止まった時と同じ）。
// ジャンプ・↓ジャンプは、x の 3 px 左右でも同じ所に着く時だけ「行ける」とする（続けて動かす時の止まる位置のずれに強く）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Physics;
using Lumina.Core.World;

namespace Lumina.Core.Tests
{
    public enum MoveKind { Jump, DownJump, WalkOffLeft, WalkOffRight, RunJumpLeft, RunJumpRight, RopeUp, RopeDown, Portal }

    public sealed class ReachEdge
    {
        public string From, To;
        public MoveKind Kind;
        public double X;          // 動く前に立つ x（縄は縄の x、ポータルはポータルの x）
        public string PortalTo;   // Portal の時の着く先の名前
        public override string ToString() => $"{From} -{Kind}@{X:0}-> {To}";
    }

    public sealed class MapReach
    {
        public readonly MapData Data;
        public readonly PhysicsMap Map;
        public readonly Dictionary<string, (FootholdChain chain, int region, double a, double b)> Nodes = new Dictionary<string, (FootholdChain, int, double, double)>();
        public readonly Dictionary<string, List<ReachEdge>> Edges = new Dictionary<string, List<ReachEdge>>();
        private readonly Dictionary<FootholdChain, List<double>> cuts = new Dictionary<FootholdChain, List<double>>();

        public MapReach(MapData md)
        {
            Data = md;
            Map = md.BuildPhysics();
            foreach (var c in Map.Chains)
            {
                double x1 = c.Segs[0].X1, x2 = c.Segs[c.Segs.Count - 1].X2;
                var list = new List<double>();
                foreach (var w in Map.Walls)
                {
                    if (w.X <= x1 || w.X >= x2) continue;
                    var s = c.Segs.First(q => w.X >= q.X1 && w.X <= q.X2);
                    double fy = s.YAt(w.X);
                    if (fy > w.Top && fy - PlayerBody.Height < w.Bottom) list.Add(w.X);
                }
                list.Sort();
                cuts[c] = list;
                double a = x1;
                for (int k = 0; k <= list.Count; k++)
                {
                    double b = k < list.Count ? list[k] : x2;
                    Nodes[Key(c, k)] = (c, k, a, b);
                    a = b;
                }
            }
            foreach (var k in Nodes.Keys) Edges[k] = new List<ReachEdge>();
            foreach (var k in Nodes.Keys.ToList()) Explore(k);
        }

        private static string Key(FootholdChain c, int region) => c.Id + "#" + region;

        public string NodeOf(Foothold s, double x)
        {
            if (s == null) return null;
            var list = cuts[s.Chain];
            int k = 0;
            while (k < list.Count && list[k] < x) k++;
            return Key(s.Chain, k);
        }

        public string NodeOf(PlayerBody p) => p.OnGround && p.Seg != null ? NodeOf(p.Seg, p.X) : null;

        /// <summary>立てる x の範囲（壁の手前・マップの端）。</summary>
        public (double a, double b) StandRange(string node)
        {
            var (c, k, a, b) = Nodes[node];
            double lo = Math.Max(a, PlayerBody.HalfW), hi = Math.Min(b, Map.Width - PlayerBody.HalfW);
            if (k > 0) lo = Math.Max(lo, a + PlayerBody.HalfW);
            if (k < cuts[c].Count) hi = Math.Min(hi, b - PlayerBody.HalfW);
            // 足場の端に立っている壁（隠し部屋の両側）
            foreach (var w in Map.Walls)
            {
                var sa = SegOf(c, a); var sb = SegOf(c, b);
                if (sa != null && Math.Abs(w.X - a) <= PlayerBody.HalfW && Blocks(w, sa.YAt(a))) lo = Math.Max(lo, w.X + PlayerBody.HalfW);
                if (sb != null && Math.Abs(w.X - b) <= PlayerBody.HalfW && Blocks(w, sb.YAt(b))) hi = Math.Min(hi, w.X - PlayerBody.HalfW);
            }
            return (lo, hi);
        }

        private static bool Blocks(Wall w, double footY) => footY > w.Top && footY - PlayerBody.Height < w.Bottom;

        private Foothold SegOf(FootholdChain c, double x)
        {
            foreach (var s in c.Segs) if (x >= s.X1 && x <= s.X2) return s;
            return null;
        }

        /// <summary>かたまり node の x に、止まって立たせる。</summary>
        public PlayerBody StandAt(string node, double x)
        {
            var c = Nodes[node].chain;
            var s = SegOf(c, x);
            var p = new PlayerBody(x, s.YAt(x));
            p.Seg = s; p.Y = s.YAt(x); p.State = BodyState.Stand; p.Vx = 0; p.Vy = 0;
            return p;
        }

        /// <summary>入力を入れて、地面に着く（立つ・歩く・伏せ）まで進める。着いたかたまり（落ちて消えたら null）。</summary>
        public string Simulate(PlayerBody p, Func<int, PhysicsInput> input, int maxFrames = 900) => Simulate(p, (b, f) => input(f), maxFrames);

        public string Simulate(PlayerBody p, Func<PlayerBody, int, PhysicsInput> input, int maxFrames = 900)
        {
            bool left = false;
            for (int f = 0; f < maxFrames; f++)
            {
                PlayerPhysics.Step(p, input(p, f), Map, Feel.Dt);
                if (!p.OnGround) left = true;
                else if (left) return NodeOf(p);
                if (p.Y > Map.Height + 100) return null;
            }
            return null;
        }

        public static PhysicsInput JumpInput(int f) => f == 0 ? new PhysicsInput { Jump = true, JumpPressed = true } : default;
        public static PhysicsInput DownJumpInput(int f) => f == 0 ? new PhysicsInput { Down = true, Jump = true, JumpPressed = true } : default;

        /// <summary>走って跳ぶ: dir へ歩き、壁（端）の 20 px 手前でジャンプ。着くまで dir を押したまま。</summary>
        public static Func<PlayerBody, int, PhysicsInput> RunJumpInput(int dir, double edgeX)
        {
            bool jumped = false;
            return (b, f) =>
            {
                var inp = new PhysicsInput { Left = dir < 0, Right = dir > 0 };
                if (!jumped && b.OnGround && (dir > 0 ? b.X >= edgeX - 20 : b.X <= edgeX + 20)) { inp.Jump = true; inp.JumpPressed = true; jumped = true; }
                return inp;
            };
        }

        private string Robust(string node, double x, Func<int, PhysicsInput> input, double a, double b)
        {
            var to = Simulate(StandAt(node, x), input, 900);
            if (to == null || to == node) return null;
            foreach (var dx in new[] { -3.0, 3.0 })
            {
                double xx = x + dx;
                if (xx < a || xx > b || SegOf(Nodes[node].chain, xx) == null) return null;
                if (Simulate(StandAt(node, xx), input, 900) != to) return null;
            }
            return to;
        }

        private void Add(string from, string to, MoveKind kind, double x, string portal = null)
        {
            if (to == null || to == from) return;
            var list = Edges[from];
            if (list.Any(e => e.To == to)) return;
            list.Add(new ReachEdge { From = from, To = to, Kind = kind, X = x, PortalTo = portal });
        }

        private void Explore(string node)
        {
            var (c, k, a0, b0) = Nodes[node];
            var (a, b) = StandRange(node);
            if (b < a) return;
            // その場ジャンプ・↓ジャンプ（16 px おき。端は 8 px 内側）
            var xs = new List<double>();
            for (double x = a + 8; x <= b - 8; x += 16) xs.Add(x);
            xs.Add(Math.Max(a, b - 8));
            foreach (var x in xs)
            {
                if (SegOf(c, x) == null) continue;
                Add(node, Robust(node, x, JumpInput, a, b), MoveKind.Jump, x);
                if (!c.Ground) Add(node, Robust(node, x, DownJumpInput, a, b), MoveKind.DownJump, x);
            }
            // 端から歩いて落ちる（壁で区切られていない端だけ）
            double cx1 = c.Segs[0].X1, cx2 = c.Segs[c.Segs.Count - 1].X2;
            if (b0 == cx2 && cx2 < Map.Width - PlayerBody.HalfW)
            {
                double x = Math.Max(a, b - 24);
                Add(node, Simulate(StandAt(node, x), f => new PhysicsInput { Right = true }), MoveKind.WalkOffRight, x);
            }
            if (a0 == cx1 && cx1 > PlayerBody.HalfW)
            {
                double x = Math.Min(b, a + 24);
                Add(node, Simulate(StandAt(node, x), f => new PhysicsInput { Left = true }), MoveKind.WalkOffLeft, x);
            }
            // 壁の手前から走って跳び越える（低い壁・岩）
            if (k < cuts[c].Count && b - a >= 100)
                Add(node, Simulate(StandAt(node, b - 90), RunJumpInput(1, b)), MoveKind.RunJumpRight, b - 90);
            if (k > 0 && b - a >= 100)
                Add(node, Simulate(StandAt(node, a + 90), RunJumpInput(-1, a)), MoveKind.RunJumpLeft, a + 90);
            // 縄・はしご
            foreach (var r in Map.Ropes)
            {
                if (r.X < a || r.X > b) continue;
                var s = SegOf(c, r.X);
                if (s == null) continue;
                double y = s.YAt(r.X);
                if (y > r.Top + 2 && y <= r.Bottom + Feel.RopeBottomReach)
                    Add(node, Simulate(StandAt(node, r.X), f => new PhysicsInput { Up = true }, 1200), MoveKind.RopeUp, r.X);
                if (Math.Abs(y - r.Top) <= Feel.RopeTopReach)
                    Add(node, Simulate(StandAt(node, r.X), f => new PhysicsInput { Down = true }, 1200), MoveKind.RopeDown, r.X);
            }
            // 同じマップの中のポータル（隠し部屋）
            foreach (var pt in Data.Portals)
            {
                if (!pt.IsEnterable || pt.To != null || pt.ToPortal == null) continue;
                if (pt.X < a - 1 || pt.X > b + 1 || SegOf(c, pt.X) == null || Math.Abs(SegOf(c, pt.X).YAt(pt.X) - pt.Y) > 0.5) continue;
                var dst = Data.FindPortalByName(pt.ToPortal);
                if (dst == null) continue;
                var p = new PlayerBody(dst.X, dst.Y);
                PlayerPhysics.PlaceOnGround(p, Map, dst.X, dst.Y);
                Add(node, NodeOf(p), MoveKind.Portal, pt.X, pt.ToPortal);
            }
        }

        public HashSet<string> ReachableFrom(string start)
        {
            var seen = new HashSet<string> { start };
            var q = new Queue<string>(new[] { start });
            while (q.Count > 0)
            {
                var c = q.Dequeue();
                foreach (var e in Edges[c]) if (seen.Add(e.To)) q.Enqueue(e.To);
            }
            return seen;
        }

        public string NodeAtPortal(PortalData p)
        {
            var s = Map.SegBelow(p.X, p.Y - 2);
            return s != null && Math.Abs(s.YAt(p.X) - p.Y) < 0.5 ? NodeOf(s, p.X) : null;
        }

        /// <summary>start から goal への動きの列（一番少ない動き）。</summary>
        public List<ReachEdge> Path(string start, string goal)
        {
            var prev = new Dictionary<string, ReachEdge> { { start, null } };
            var q = new Queue<string>(new[] { start });
            while (q.Count > 0)
            {
                var c = q.Dequeue();
                if (c == goal) break;
                foreach (var e in Edges[c]) if (!prev.ContainsKey(e.To)) { prev[e.To] = e; q.Enqueue(e.To); }
            }
            if (!prev.ContainsKey(goal)) return null;
            var path = new List<ReachEdge>();
            for (var c = goal; prev[c] != null; c = prev[c].From) path.Insert(0, prev[c]);
            return path;
        }

        // ---------------- 続けて動かす（1 つの体で、歩いて止まってから動く）

        /// <summary>今の足場の上を x まで歩いて止まる（すべる分を見込んで離す）。止まれたら true。</summary>
        public bool WalkTo(PlayerBody p, double tx, int maxFrames = 3000)
        {
            for (int f = 0; f < maxFrames; f++)
            {
                if (!p.OnGround) return false;
                double dx = tx - p.X;
                if (Math.Abs(dx) < 1 && Math.Abs(p.Vx) < 1) return true;
                double slide = p.Vx * p.Vx / (2 * Feel.WalkDecel);
                int dir = Math.Sign(dx);
                bool press;
                if (Math.Abs(p.Vx) < 1) press = Math.Abs(dx) >= 6 || f % 4 == 0;   // 止まっている: 遠ければ歩き出す、近ければ少しずつ
                else if (Math.Sign(p.Vx) == dir) press = Math.Abs(dx) > slide + 1;  // すべる分を見込んで離す
                else press = true;                                                   // 行きすぎ: 逆へ
                PlayerPhysics.Step(p, new PhysicsInput { Left = press && dir < 0, Right = press && dir > 0 }, Map, Feel.Dt);
            }
            // 少しの押し引きで行ったり来たりして止まりきれない時（すべりの小さな周期）: 手を離して止まり、3 px 以内なら着いたことにする
            for (int f = 0; f < 120 && p.OnGround && Math.Abs(p.Vx) >= 1; f++) PlayerPhysics.Step(p, default, Map, Feel.Dt);
            return p.OnGround && Math.Abs(tx - p.X) <= 3;
        }

        /// <summary>動きを 1 つ実際に行う。着いたかたまりを返す（失敗は null）。</summary>
        public string Perform(PlayerBody p, ReachEdge e)
        {
            if (!WalkTo(p, e.X)) return null;
            for (int i = 0; i < 6; i++) PlayerPhysics.Step(p, default, Map, Feel.Dt);
            // 縄から跳び降りた直後は少しの間つかまれない（RegrabT）。人と同じく、つかまれるまで待ってから動く
            for (int i = 0; i < 120 && p.RegrabT > 0; i++) PlayerPhysics.Step(p, default, Map, Feel.Dt);
            switch (e.Kind)
            {
                case MoveKind.Jump: return Simulate(p, JumpInput, 240);
                case MoveKind.DownJump: return Simulate(p, DownJumpInput);
                case MoveKind.WalkOffLeft: return Simulate(p, f => new PhysicsInput { Left = true });
                case MoveKind.WalkOffRight: return Simulate(p, f => new PhysicsInput { Right = true });
                case MoveKind.RunJumpRight: return Simulate(p, RunJumpInput(1, StandRange(e.From).b));
                case MoveKind.RunJumpLeft: return Simulate(p, RunJumpInput(-1, StandRange(e.From).a));
                case MoveKind.RopeUp: return Simulate(p, f => new PhysicsInput { Up = true }, 1200);
                case MoveKind.RopeDown: return Simulate(p, f => new PhysicsInput { Down = true }, 1200);
                case MoveKind.Portal:
                    {
                        var pt = Data.FindPortalAt(p.X, p.Y);
                        if (pt == null || pt.ToPortal != e.PortalTo) return null;
                        var dst = Data.FindPortalByName(pt.ToPortal);
                        PlayerPhysics.PlaceOnGround(p, Map, dst.X, dst.Y);
                        return NodeOf(p);
                    }
            }
            return null;
        }
    }
}
