// 主人公の絵の選び方（ART_SPEC_UNITY.md 4 章の動きの名前とコマ）。Unity の PlayerView はこれを見て部品を重ねて描く。
// stand1（3 コマ 0→1→2→1 の往復・500ms）/ walk1（4 コマ・180ms）/ jump（1）/ ladder・rope（2 コマ・250ms、動いている時だけ進む）
// alert（構え。攻撃・被弾の後しばらく。3 コマ・500ms）/ swingO1（3 コマ 300/150/350ms を攻撃の時間に合わせて伸び縮み）/ prone（1）
using System;
using Lumina.Core.Combat;
using Lumina.Core.Physics;

namespace Lumina.Core.Game
{
    public struct AvatarPose
    {
        public string Motion;
        public int Frame;
        public bool FacingRight;
        public bool Visible;      // 無敵の点滅で消えるフレームは false
        public bool Dead;         // 倒れている（墓石を出す）
        public AttackMotion AttackKind; // 攻撃中なら、どの種類の攻撃か（今は絵は swingO1 だけ）
        /// <summary>頭の上に出す状態異常のアイコン（ビット: 1 &lt;&lt; (int)StatusKind。毒・気絶・暗闇・封印・呪い・弱り・凍結・眠り の順）</summary>
        public int StatusIcons;
        public bool HasStatus(Status.StatusKind k) => (StatusIcons & (1 << (int)k)) != 0;

        public override string ToString() => Motion + "[" + Frame + "]" + (FacingRight ? "→" : "←") + (Visible ? "" : " (点滅)");
    }

    public sealed class PoseTracker
    {
        public const double AlertTime = 5.0; // 攻撃・被弾の後、構えでいる時間（似）
        private string motion = "stand1";
        private double t;
        private double climbT;
        public double AlertLeft;

        public AvatarPose Update(PlayerBody body, AttackAction attack, bool dead, double dt, int statusIcons = 0)
        {
            if (AlertLeft > 0) AlertLeft -= dt;
            var p = new AvatarPose { FacingRight = body.Facing > 0, Visible = body.BlinkVisible, Dead = dead, StatusIcons = statusIcons };
            string m;
            if (dead) m = "dead";
            else if (attack != null && !attack.Finished) m = "swingO1";
            else if (body.State == BodyState.Rope) m = "rope";
            else if (body.State == BodyState.Ladder) m = "ladder";
            else if (body.State == BodyState.Air) m = "jump";
            else if (body.State == BodyState.Prone) m = "prone";
            else if (body.State == BodyState.Walk) m = "walk1";
            else m = AlertLeft > 0 ? "alert" : "stand1";
            if (m != motion) { motion = m; t = 0; climbT = 0; }
            else t += dt;
            p.Motion = m;
            switch (m)
            {
                case "stand1":
                {
                    int i = (int)Math.Floor(t / Feel.StandFrame) % 4; // 0→1→2→1
                    p.Frame = i == 3 ? 1 : i;
                    break;
                }
                case "alert":
                    p.Frame = (int)Math.Floor(t / 0.5) % 3;
                    break;
                case "walk1":
                    p.Frame = (int)Math.Floor(t / Feel.WalkFrame) % 4;
                    break;
                case "rope":
                case "ladder":
                    if (body.Climbing) climbT += dt;
                    p.Frame = (int)Math.Floor(climbT / Feel.RopeFrame) % 2;
                    break;
                case "swingO1":
                    p.Frame = attack.Frame;
                    p.AttackKind = attack.Motion;
                    break;
                default:
                    p.Frame = 0;
                    break;
            }
            return p;
        }
    }
}
