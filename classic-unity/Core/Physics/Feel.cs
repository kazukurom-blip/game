// 手触りの数値（classic/docs/FEEL.md・classic/src/engine/feel.js と同じ値）。
// 単位: px（内部解像度 800×600 の 1 px）・秒。速さは px/秒、加速は px/秒²。
// 「速さ 100・ジャンプ 100」（装備やスキルで変わる能力値）のときの値。
// ブラウザ版と同じ結果になるよう、計算はすべて double で行う（Unity 側で float に直して描く）。
namespace Lumina.Core.Physics
{
    public static class Feel
    {
        public const int Fps = 60;
        public const double Dt = 1.0 / Fps;

        // --- 地上 ---
        public const double WalkSpeed = 125;       // 歩く最高速（速さ 100）
        public const double WalkAccel = 1400;      // 押した時の加速（約 0.09 秒で最高速）
        public const double WalkDecel = 800;       // 離した時の減速（約 0.16 秒・約 10 px すべる）
        public const double TurnDecel = 2200;      // 逆向きを押した時の減速
        public const bool SlopeSpeedByLength = true; // 坂は線にそって進む（横の速さは cos 倍）

        // --- 空中 ---
        public const double JumpSpeed = 555;       // ジャンプの初速 → 最高 約 77 px
        public const double Gravity = 2000;
        public const double MaxFall = 670;
        public const double AirAccel = 100;        // 空中で左右を押した時の加速（ほとんど変わらない）
        public const double AirMaxSpeed = 125;

        // --- 縄・はしご ---
        public const double ClimbSpeed = 90;
        public const double RopeGrabRange = 10;    // 縄の中心から左右この距離（はしごは +4）
        public const double RopeBottomReach = 28;
        public const double RopeTopReach = 6;
        public const double RopeJumpSpeedX = 100;
        public const double RopeJumpSpeedY = 370;
        public const double RopeRegrabDelay = 0.25;

        // --- 足場 ---
        public const double DownJumpSpeed = 200;
        public const double DownJumpIgnore = 0.35;

        // --- 被弾 ---
        public const double HurtKnockX = 150;
        public const double HurtKnockY = 280;
        public const double HurtInvincible = 1.5;
        public const double HurtBlink = 0.08;

        // --- カメラ ---
        public const double CamFollowX = 3.0;
        public const double CamFollowY = 1.4;
        public const double CamOffsetY = 70;
        public const double CamDeadY = 12;

        // --- 絵の動き（コマの時間） ---
        public const double StandFrame = 0.5;
        public const double WalkFrame = 0.18;
        public const double RopeFrame = 0.25;

        // --- ポータル（似: ブラウザ版にはまだ無い。クラシックの「近くで ↑」） ---
        public const double PortalRangeX = 20;
        public const double PortalRangeY = 40;

        // --- 攻撃中の地上の止まり方（FEEL.md 7 章「地上で攻撃中は歩けない（止まる）」。伏せと同じ減速） ---
        public const double AttackGroundDecel = WalkDecel * 3;

        /// <summary>武器の速さの段階（2〜9）→ ふつうの攻撃 1 回の時間（秒）。feel.js の ATTACK_SPEED。</summary>
        public static double AttackDelay(int stage)
        {
            if (stage < 2) stage = 2;
            if (stage > 9) stage = 9;
            switch (stage)
            {
                case 2: return 0.48;
                case 3: return 0.54;
                case 4: return 0.60;
                case 5: return 0.66;
                case 6: return 0.72;
                case 7: return 0.78;
                case 8: return 0.84;
                default: return 0.90;
            }
        }

        /// <summary>段階の名前（クラシックの表示）</summary>
        public static string AttackSpeedName(int stage)
        {
            if (stage <= 3) return "より速い";
            if (stage <= 5) return "速い";
            if (stage == 6) return "ふつう";
            if (stage <= 8) return "遅い";
            return "より遅い";
        }

        /// <summary>振りの 3 コマ（300/150/350ms）の 2 コマ目の始め = 当たる瞬間の割合。ART_SPEC_UNITY.md の swingO1。</summary>
        public const double SwingHitFraction = 300.0 / 800.0;
    }

    /// <summary>能力値「速さ」「ジャンプ」から実際の速さ（feel.js の moveStats）。</summary>
    public struct MoveStats
    {
        public double WalkSpeed, JumpSpeed, ClimbSpeed;

        public static MoveStats From(double speed = 100, double jump = 100)
        {
            double s = System.Math.Max(100, System.Math.Min(140, speed)) / 100;
            double j = System.Math.Max(100, System.Math.Min(123, jump)) / 100;
            return new MoveStats { WalkSpeed = Feel.WalkSpeed * s, JumpSpeed = Feel.JumpSpeed * j, ClimbSpeed = Feel.ClimbSpeed * s };
        }
    }
}
