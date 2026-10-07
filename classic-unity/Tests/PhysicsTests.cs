// classic/tests/physics_unit.mjs と同じ中身のテスト（FEEL.md の値どおりに動くか）を C# に移したもの。
// それに加えて、ブラウザ版に無い壁・攻撃中の止まり・固定 60 回/秒の更新を確かめる。
using System;
using Lumina.Core.Physics;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class PhysicsTests
    {
        private const double DT = Feel.Dt;

        private static PhysicsMap Flat()
        {
            var m = new PhysicsMap(4000, 2000);
            m.AddChain("g", true, 0, 1000, 4000, 1000);
            m.AddChain("p", false, 1000, 936, 1400, 936);
            m.AddChain("slope", false, 2000, 900, 2200, 900, 2400, 800, 2600, 800);
            m.AddChain("lt", false, 3400, 936, 3600, 936); // はしごの上の足場
            m.AddRope(3000, 700, 980);
            m.AddRope(3500, 936, 990, true);
            return m;
        }

        private static PhysicsMap TestField()
        {
            // classic/src/data/maps/test_field.js と同じ
            var m = new PhysicsMap(1800, 720);
            m.AddChain("ground", true, 0, 640, 680, 640, 776, 592, 1220, 592, 1284, 624, 1800, 624);
            m.AddChain("step1", false, 160, 576, 480, 576);
            m.AddChain("step2", false, 320, 512, 640, 512);
            m.AddChain("high", false, 860, 440, 1180, 440);
            m.AddChain("step3", false, 1300, 560, 1420, 560);
            m.AddChain("step4", false, 1460, 496, 1700, 496);
            m.AddRope(600, 512, 616);
            m.AddRope(1000, 440, 588, true);
            return m;
        }

        private static PhysicsInput I(bool left = false, bool right = false, bool up = false, bool down = false, bool jump = false, bool jumpPressed = false)
            => new PhysicsInput { Left = left, Right = right, Up = up, Down = down, Jump = jump, JumpPressed = jumpPressed };

        private static void Settle(PlayerBody p, PhysicsMap m) { for (int i = 0; i < 60; i++) PlayerPhysics.Step(p, I(), m, DT); }
        private static void Run(PlayerBody p, PhysicsMap m, PhysicsInput inp, int frames) { for (int i = 0; i < frames; i++) PlayerPhysics.Step(p, inp, m, DT); }
        private static bool Near(double a, double b, double tol) => Math.Abs(a - b) <= tol;

        [Fact]
        public void Walk()
        {
            var flat = Flat();
            var p = new PlayerBody(200, 1000); Settle(p, flat);
            Assert.True(p.State == BodyState.Stand && p.Y == 1000, "着地して立ち");
            int t = 0;
            while (p.Vx < Feel.WalkSpeed - 0.01 && t < 60) { PlayerPhysics.Step(p, I(right: true), flat, DT); t++; }
            Assert.True(Near(p.Vx, 125, 0.01), "最高速 125 px/秒");
            Assert.InRange(t, 5, 6); // 最高速まで 約 0.09 秒
            Run(p, flat, I(right: true), 60);
            double x0 = p.X; Run(p, flat, I(right: true), 60);
            Assert.True(Near(p.X - x0, 125, 0.5), "1 秒で 125 px 進む");
            double xs = p.X; int f = 0;
            while (p.Vx > 0 && f < 60) { PlayerPhysics.Step(p, I(), flat, DT); f++; }
            Assert.InRange(f, 9, 10); // 離すと 約 0.16 秒で止まる
            Assert.True(Near(p.X - xs, 9.8, 1.2), "止まるまで 約 10 px すべる: " + (p.X - xs));
            Assert.Equal(BodyState.Stand, p.State);
        }

        [Fact]
        public void Jump()
        {
            var flat = Flat();
            var p = new PlayerBody(200, 1000); Settle(p, flat);
            PlayerPhysics.Step(p, I(jump: true, jumpPressed: true), flat, DT);
            Assert.True(p.Vy == -Feel.JumpSpeed && p.State == BodyState.Air, "初速 555");
            double minY = p.Y; int frames = 0;
            while (p.State == BodyState.Air && frames < 200) { PlayerPhysics.Step(p, I(), flat, DT); minY = Math.Min(minY, p.Y); frames++; }
            double h = 1000 - minY;
            Assert.True(Near(h, 77, 1), "最高 約 77 px: " + h);
            Assert.True(Near((frames + 1) * DT, 0.555, 0.04), "滞空 約 0.55 秒");
            Assert.True(p.State == BodyState.Stand && p.Y == 1000, "着地すると立ち");
            var q = new PlayerBody(900, 1000); Settle(q, flat);
            Run(q, flat, I(right: true), 30);
            PlayerPhysics.Step(q, I(jump: true, right: true), flat, DT);
            for (int i = 0; i < 60 && q.State == BodyState.Air; i++) PlayerPhysics.Step(q, I(right: true), flat, DT);
            Assert.True(q.Y == 936, "64 px の段に跳び乗れる: y=" + q.Y);
        }

        [Fact]
        public void AirControl()
        {
            var flat = Flat();
            var p = new PlayerBody(200, 1000); Settle(p, flat);
            PlayerPhysics.Step(p, I(jump: true), flat, DT);
            double x0 = p.X;
            while (p.State == BodyState.Air) PlayerPhysics.Step(p, I(right: true), flat, DT);
            Assert.True(p.X - x0 > 5 && p.X - x0 < 25, "その場ジャンプ中に → で動けるのは少し: " + (p.X - x0));
            Assert.Equal(1, p.Facing);
            var q = new PlayerBody(200, 1000); Settle(q, flat);
            Run(q, flat, I(right: true), 30);
            PlayerPhysics.Step(q, I(jump: true, right: true), flat, DT);
            double qx = q.X;
            while (q.State == BodyState.Air) PlayerPhysics.Step(q, I(left: true), flat, DT);
            Assert.True(q.Vx > 60, "走りジャンプで逆を押しても勢いはほとんど変わらない: " + q.Vx);
            Assert.True(q.X - qx > 45 && q.X - qx < 75, "走りジャンプの飛距離 約 50〜70 px: " + (q.X - qx));
        }

        [Fact]
        public void Falling()
        {
            var flat = Flat();
            var p = new PlayerBody(200, 0);
            double maxV = 0;
            for (int i = 0; i < 120 && p.State == BodyState.Air; i++) { PlayerPhysics.Step(p, I(), flat, DT); maxV = Math.Max(maxV, p.Vy); }
            Assert.Equal(Feel.MaxFall, maxV);
            Assert.True(p.Y == 1000 && p.State == BodyState.Stand, "下からすり抜けて地面に着地");
            var q = new PlayerBody(1200, 1000); Settle(q, flat);
            PlayerPhysics.Step(q, I(jump: true), flat, DT);
            while (q.State == BodyState.Air) PlayerPhysics.Step(q, I(), flat, DT);
            Assert.True(q.Y == 936, "浮いた足場の下からジャンプ → すり抜けて上に乗る");
        }

        [Fact]
        public void DownJumpAndEdge()
        {
            var flat = Flat();
            var p = new PlayerBody(1200, 936); Settle(p, flat);
            Assert.True(p.Y == 936 && p.Seg != null && p.Seg.Chain.Id == "p", "足場に乗っている");
            PlayerPhysics.Step(p, I(down: true, jump: true, jumpPressed: true), flat, DT);
            Assert.True(p.State == BodyState.Air && p.Vy == -Feel.DownJumpSpeed, "↓＋ジャンプで小さく跳ねる");
            double minY = p.Y;
            while (p.State == BodyState.Air) { PlayerPhysics.Step(p, I(), flat, DT); minY = Math.Min(minY, p.Y); }
            Assert.True(Near(936 - minY, 10, 1), "跳ねる高さ 約 10 px");
            Assert.Equal(1000, p.Y);
            PlayerPhysics.Step(p, I(down: true, jump: true, jumpPressed: true), flat, DT);
            Assert.True(p.State == BodyState.Prone && p.Y == 1000, "一番下の地面では ↓＋ジャンプしても降りない（伏せのまま）");
            var q = new PlayerBody(1390, 936); Settle(q, flat);
            Run(q, flat, I(right: true), 20);
            Assert.True(q.State == BodyState.Air || q.Y == 1000, "端から歩いて出ると落ちる");
            while (q.State == BodyState.Air) PlayerPhysics.Step(q, I(right: true), flat, DT);
            Assert.Equal(1000, q.Y);
        }

        [Fact]
        public void Slope()
        {
            var flat = Flat();
            var p = new PlayerBody(2150, 900); Settle(p, flat);
            Run(p, flat, I(right: true), 30);
            bool ok = true;
            for (int i = 0; i < 120; i++)
            {
                PlayerPhysics.Step(p, I(right: true), flat, DT);
                if (p.State != BodyState.Walk) ok = false;
                if (p.X > 2200 && p.X < 2400 && !Near(p.Y, 900 - (p.X - 2200) / 2, 0.01)) ok = false;
            }
            Assert.True(ok && p.X > 2400, "坂の上り: 線にそって離れずに歩く");
            var q = new PlayerBody(2240, 870); Settle(q, flat);
            Run(q, flat, I(right: true), 30);
            double x0 = q.X; Run(q, flat, I(right: true), 30);
            Assert.True(Near(q.X - x0, 125 * Math.Cos(Math.Atan(0.5)) / 2, 0.6), "坂の横の速さは cos 倍");
        }

        [Fact]
        public void RopeAndLadder()
        {
            var flat = Flat();
            var p = new PlayerBody(3005, 1000); Settle(p, flat);
            PlayerPhysics.Step(p, I(up: true), flat, DT);
            Assert.True(p.State == BodyState.Rope && p.X == 3000 && p.Y == 980, "縄の下端より下から ↑ でつかまる");
            double y0 = p.Y; Run(p, flat, I(up: true), 60);
            Assert.True(Near(y0 - p.Y, 90, 0.01), "上る速さ 90 px/秒");
            PlayerPhysics.Step(p, I(jump: true, jumpPressed: true), flat, DT);
            Assert.Equal(BodyState.Rope, p.State); // ジャンプだけでは離れない
            PlayerPhysics.Step(p, I(right: true, jump: true, jumpPressed: true), flat, DT);
            Assert.True(p.State == BodyState.Air && p.Vx == Feel.RopeJumpSpeedX && p.Vy == -Feel.RopeJumpSpeedY, "左右＋ジャンプで飛び降りる");
            PlayerPhysics.Step(p, I(up: true), flat, DT);
            Assert.Equal(BodyState.Air, p.State); // 飛び降りた直後はつかまらない
            var q = new PlayerBody(2992, 1000); Settle(q, flat);
            PlayerPhysics.Step(q, I(jump: true), flat, DT);
            for (int i = 0; i < 10; i++) PlayerPhysics.Step(q, I(), flat, DT);
            PlayerPhysics.Step(q, I(up: true), flat, DT);
            Assert.Equal(BodyState.Rope, q.State); // 空中で ↑ を押すと縄にとびつく
            var r = new PlayerBody(3502, 936); Settle(r, flat);
            Assert.True(r.Y == 936 && r.State == BodyState.Stand, "はしごの上の足場に立つ");
            PlayerPhysics.Step(r, I(down: true), flat, DT);
            Assert.Equal(BodyState.Ladder, r.State);
            Run(r, flat, I(down: true), 120);
            Assert.True(r.Y == 1000 && r.State == BodyState.Prone, "下端で手を離して地面へ（↓ のままなので伏せ）");
            PlayerPhysics.Step(r, I(up: true), flat, DT);
            Run(r, flat, I(up: true), 60);
            Assert.True(r.State == BodyState.Stand && r.Y == 936, "上りきると上の足場に立つ");
        }

        [Fact]
        public void Hurt()
        {
            var flat = Flat();
            var p = new PlayerBody(200, 1000); Settle(p, flat);
            Assert.True(PlayerPhysics.Hurt(p, 230) && p.Vx == -Feel.HurtKnockX && p.Vy == -Feel.HurtKnockY, "ふっとぶ");
            Assert.False(PlayerPhysics.Hurt(p, 230)); // 無敵の間はもう当たらない
            PlayerPhysics.Step(p, I(right: true), flat, DT);
            Assert.Equal(-Feel.HurtKnockX, p.Vx); // 着地まで操作できない
            int vis = 0, hid = 0; double minY = 1000;
            for (int i = 0; i < 120; i++)
            {
                PlayerPhysics.Step(p, I(), flat, DT);
                minY = Math.Min(minY, p.Y);
                if (p.InvT > 0) { if (p.BlinkVisible) vis++; else hid++; }
            }
            Assert.True(Near(1000 - minY, 19.6, 1.5), "浮く高さ 約 20 px");
            Assert.True(vis > 30 && hid > 30, "点滅する");
            Assert.Equal(0, p.InvT);
        }

        [Fact]
        public void TestFieldNoFallThrough()
        {
            var map = TestField();
            Assert.Equal(10, map.Segs.Count);
            var p = new PlayerBody(90, 600); Settle(p, map);
            Assert.True(p.Y == 640 && p.State == BodyState.Stand, "出現の位置で地面に立つ");
            int bad = 0;
            for (int i = 0; i < 3600; i++)
            {
                int t = i % 600;
                PlayerPhysics.Step(p, I(right: t < 300, left: t >= 300, jump: i % 50 < 2), map, DT);
                if (p.Y > 641) bad++;
            }
            Assert.Equal(0, bad);
        }

        // ---- ここからブラウザ版に無い追加の仕組み

        [Fact]
        public void WallStopsWalkingAndAirMovement()
        {
            var m = new PhysicsMap(2000, 1200);
            m.AddChain("g", true, 0, 1000, 2000, 1000);
            m.AddWall(800, 900, 1000);
            var p = new PlayerBody(600, 1000); Settle(p, m);
            Run(p, m, I(right: true), 180);
            Assert.Equal(800 - PlayerBody.HalfW, p.X);
            Assert.Equal(BodyState.Walk, p.State);
            // 壁より高く跳べば越えられない（壁は 100 px、ジャンプは 77 px）
            Run(p, m, I(right: true, jump: true), 120);
            Assert.True(p.X <= 800 - PlayerBody.HalfW + 1e-9);
            // 反対側から
            var q = new PlayerBody(1000, 1000); Settle(q, m);
            Run(q, m, I(left: true), 180);
            Assert.Equal(800 + PlayerBody.HalfW, q.X);
        }

        [Fact]
        public void AttackLockStopsOnGroundButKeepsAirMomentum()
        {
            var flat = Flat();
            var p = new PlayerBody(200, 1000); Settle(p, flat);
            Run(p, flat, I(right: true), 40);
            p.AttackLock = true;
            Run(p, flat, I(right: true, jump: true), 20);
            Assert.Equal(0, p.Vx);
            Assert.True(p.OnGround);
            // 空中で攻撃: 勢いはそのまま
            p.AttackLock = false;
            Run(p, flat, I(right: true), 30);
            PlayerPhysics.Step(p, I(right: true, jump: true, jumpPressed: true), flat, DT);
            double vx = p.Vx;
            p.AttackLock = true;
            PlayerPhysics.Step(p, I(), flat, DT);
            Assert.Equal(vx, p.Vx);
        }

        [Fact]
        public void FixedStepperRuns60TimesPerSecond()
        {
            var st = new FixedStepper();
            int n = 0;
            // ばらばらのフレーム時間（合計 1 秒）
            double[] dts = { 0.016, 0.017, 0.033, 0.008, 0.05, 0.016, 0.02 };
            double total = 0; int i = 0;
            while (total < 1.0 - 1e-12)
            {
                double d = Math.Min(dts[i++ % dts.Length], 1.0 - total);
                total += d;
                n += st.Advance(d, _ => { });
            }
            Assert.InRange(n, 59, 60);
            Assert.InRange(st.Alpha, 0, 1);
            // 長く止まっていた後でも、一度に回し過ぎない
            int burst = st.Advance(5.0, _ => { });
            Assert.True(burst <= st.MaxStepsPerCall);
        }

        [Fact]
        public void SpeedAndJumpStats()
        {
            var ms = MoveStats.From(140, 123);
            Assert.Equal(175, ms.WalkSpeed, 9);
            Assert.Equal(555 * 1.23, ms.JumpSpeed, 9);
            Assert.Equal(126, ms.ClimbSpeed, 9);
            var lo = MoveStats.From(50, 50); // 100 より下にはならない
            Assert.Equal(125, lo.WalkSpeed);
        }

        [Fact]
        public void PortalLookupNearFeet()
        {
            var md = MapData.FromJson("{\"id\":\"T\",\"width\":800,\"height\":600,\"footholds\":[{\"id\":\"g\",\"ground\":true,\"points\":[[0,500],[800,500]]}],"
                + "\"portals\":[{\"name\":\"sp\",\"type\":\"spawn\",\"x\":50,\"y\":500},{\"name\":\"e\",\"type\":\"visible\",\"x\":700,\"y\":500,\"to\":\"X\",\"toPortal\":\"w\"}]}");
            Assert.Null(md.FindPortalAt(50, 500)); // 出現の位置は入れない
            Assert.Equal("e", md.FindPortalAt(690, 500).Name);
            Assert.Null(md.FindPortalAt(650, 500));
            var sp = md.SpawnPoint();
            Assert.Equal(50, sp.x);
        }
    }
}
