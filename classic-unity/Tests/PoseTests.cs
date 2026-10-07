// 主人公の絵の動きの名前とコマ（ART_SPEC_UNITY.md 4 章）: stand1 / walk1 / jump / ladder / rope / alert / swingO1 / prone。
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Xunit;

namespace Lumina.Core.Tests
{
    public class PoseTests
    {
        [Fact]
        public void MotionNamesAndFrames()
        {
            var s = GameSession.NewGame(TestData.Get(), "絵", 1);
            s.ChangeMap("S001");
            var seen = new HashSet<string>();
            void Run(PlayerInput i, int n) { for (int k = 0; k < n; k++) { s.Step(i); seen.Add(s.Pose.Motion); } }

            Run(new PlayerInput(), 10);
            Assert.Equal("stand1", s.Pose.Motion);
            // 立ち: 0→1→2→1 を 0.5 秒ずつ
            var frames = new List<int>();
            for (int k = 0; k < 120; k++) { s.Step(new PlayerInput()); if (k % 30 == 15) frames.Add(s.Pose.Frame); }
            Assert.Equal(new[] { 0, 1, 2, 1 }, frames.Take(4).ToArray());
            Run(new PlayerInput { Right = true }, 30);
            Assert.Equal("walk1", s.Pose.Motion);
            Assert.True(s.Pose.FacingRight);
            Run(new PlayerInput { Jump = true, JumpPressed = true }, 3);
            Assert.Equal("jump", s.Pose.Motion);
            Run(new PlayerInput(), 60);
            Run(new PlayerInput { Down = true }, 5);
            Assert.Equal("prone", s.Pose.Motion);
            // 攻撃: swingO1 の 3 コマ → その後しばらく構え（alert）
            var sw = new List<int>();
            s.Step(new PlayerInput { Attack = true });
            for (int k = 0; k < 60 && s.Attack != null; k++) { s.Step(new PlayerInput()); if (s.Pose.Motion == "swingO1") sw.Add(s.Pose.Frame); }
            Assert.Equal(new[] { 0, 1, 2 }, sw.Distinct().ToArray());
            s.Step(new PlayerInput());
            Assert.Equal("alert", s.Pose.Motion);
            // 縄: 動いている時だけコマが進む
            s.Teleport(1340, 640);
            Run(new PlayerInput { Up = true }, 2);
            Assert.Equal("rope", s.Pose.Motion);
            int f0 = s.Pose.Frame;
            Run(new PlayerInput(), 40);
            Assert.Equal(f0, s.Pose.Frame);
            var climbFrames = new HashSet<int>();
            for (int k = 0; k < 40; k++) { s.Step(new PlayerInput { Up = true }); if (s.Pose.Motion == "rope") climbFrames.Add(s.Pose.Frame); }
            Assert.Equal(2, climbFrames.Count);
            // はしご
            s.ChangeMap("S002");
            s.Teleport(700, 640);
            Run(new PlayerInput { Up = true }, 2);
            Assert.Equal("ladder", s.Pose.Motion);
        }

        [Fact]
        public void BlinkWhileInvincible()
        {
            var s = GameSession.NewGame(TestData.Get(), "絵", 1);
            s.ChangeMap("S001");
            s.Step(new PlayerInput(), 5);
            PlayerPhysics.Hurt(s.Body, s.Body.X + 10);
            int hidden = 0;
            for (int i = 0; i < 80; i++) { s.Step(new PlayerInput()); if (!s.Pose.Visible) hidden++; }
            Assert.InRange(hidden, 30, 50);
        }
    }
}
