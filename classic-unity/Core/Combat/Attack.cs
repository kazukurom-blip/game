// 攻撃の振り（FEEL.md 7 章）: 1 回の時間は武器の速さで決まる。当たる瞬間は振りの 2 コマ目の始め。
// 当たる範囲は四角（Rect）、同時に当たる数（Targets）。Unity 側へはダメージの数字（DamageNumber）を渡す。
using System;
using System.Collections.Generic;

namespace Lumina.Core.Combat
{
    /// <summary>四角（ワールドの座標。y は下が正）。</summary>
    public struct Rect
    {
        public double X1, Y1, X2, Y2;
        public Rect(double x1, double y1, double x2, double y2)
        {
            X1 = Math.Min(x1, x2); X2 = Math.Max(x1, x2);
            Y1 = Math.Min(y1, y2); Y2 = Math.Max(y1, y2);
        }
        public bool Overlaps(Rect o) => X1 < o.X2 && o.X1 < X2 && Y1 < o.Y2 && o.Y1 < Y2;
        public bool Contains(double x, double y) => x >= X1 && x <= X2 && y >= Y1 && y <= Y2;
        public double CenterX => (X1 + X2) / 2;
        public double CenterY => (Y1 + Y2) / 2;
        public override string ToString() => "(" + X1 + "," + Y1 + ")-(" + X2 + "," + Y2 + ")";

        /// <summary>足元 (x, y) にいて facing を向いている時の当たる範囲。</summary>
        public static Rect InFront(double x, double y, int facing, double front, double back, double up, double down, bool around = false)
        {
            if (around) return new Rect(x - front, y - up, x + front, y + down);
            return facing >= 0 ? new Rect(x - back, y - up, x + front, y + down) : new Rect(x - front, y - up, x + back, y + down);
        }
    }

    public enum DamageKind { Dealt, Critical, Taken, Heal, MpHeal, Miss, Poison } // Poison = 毒で減った分（紫の数字）

    /// <summary>画面に出すダメージの数字（FEEL.md 6 章・UI.md 1-3）。Unity 側の DamageNumberView が描く。</summary>
    public struct DamageNumber
    {
        public DamageKind Kind;
        public int Value;
        public double X, Y;         // 出す位置（ワールドの座標。当たった敵の頭の上）
        public int Stack;           // 1 回の攻撃の何個目か（縦に 18 px ずつ積む）
        public double Delay;        // 出すまでの遅れ（0.05 秒ずつ）
        public int TargetUid;       // 当たった敵（主人公なら 0）

        public const double StackStepPx = 18;
        public const double StackDelay = 0.05;
        public override string ToString() => Kind + ":" + Value;
    }

    /// <summary>攻撃の動きの種類（Unity の絵の動きの名前を選ぶのに使う）。</summary>
    public enum AttackMotion { Swing, Stab, Shoot, Throw, Cast, Punch }

    /// <summary>今している 1 回の攻撃（ふつうの攻撃かスキル）。</summary>
    public sealed class AttackAction
    {
        public string SkillId;          // null = ふつうの攻撃
        public int SkillLevel;
        public AttackMotion Motion;
        public double Duration;         // 1 回の時間（秒）
        public double HitTime;          // 当たる瞬間（開始からの秒）
        public double Elapsed;
        public bool HitDone;
        public int Facing;
        public bool OnGround;           // 地上で始めたか（地上なら止まる）
        public bool Stab;
        public double Pre;              // 詠唱・溜め（秒）。この間は 1 コマ目のまま、その後に振る
        public double DashSpeed, DashTime; // 突進（攻撃の始めから DashTime 秒、前へ DashSpeed px/秒）
        public bool FromStealth;        // 闇隠れから出した攻撃（暗殺・影の衣）
        public bool Whack;              // 弓・クロスボウで矢が無い時の弱い殴り
        public double ComboPct;         // 始めた時の闘気のダメージ +%

        public bool Finished => Elapsed >= Duration;
        public bool Dashing => DashTime > 0 && Elapsed < DashTime;
        /// <summary>振りの何コマ目か（0〜2）。swingO1 の 300/150/350ms の割合（詠唱の間は 0）。</summary>
        public int Frame
        {
            get
            {
                double swing = Duration - Pre;
                double t = swing <= 0 ? 1 : (Elapsed - Pre) / swing;
                if (t < 0) return 0;
                if (t < 300.0 / 800) return 0;
                if (t < 450.0 / 800) return 1;
                return 2;
            }
        }

        /// <summary>攻撃を始める。duration = 振りの時間、pre = その前の詠唱・溜め（当たる瞬間は pre + 振りの 300/800）。</summary>
        public static AttackAction Start(double duration, int facing, bool onGround, string skillId = null, int skillLevel = 0, AttackMotion motion = AttackMotion.Swing, double pre = 0)
        {
            return new AttackAction
            {
                SkillId = skillId, SkillLevel = skillLevel, Motion = motion, Duration = pre + duration, Pre = pre,
                HitTime = pre + duration * Physics.Feel.SwingHitFraction, Facing = facing, OnGround = onGround,
            };
        }

        /// <summary>時間を進める。当たる瞬間を越えたフレームだけ true。</summary>
        public bool Advance(double dt)
        {
            double before = Elapsed;
            Elapsed += dt;
            if (!HitDone && before <= HitTime && Elapsed >= HitTime - 1e-9) { HitDone = true; return true; }
            return false;
        }
    }

    public static class Targeting
    {
        /// <summary>範囲に入っている的の中から、前にいる近い順に max 個を選ぶ。</summary>
        public static List<T> Pick<T>(IEnumerable<T> candidates, Func<T, Rect> boxOf, Rect range, double fromX, int facing, int max)
        {
            var list = new List<(T t, double d)>();
            foreach (var c in candidates)
            {
                var b = boxOf(c);
                if (!range.Overlaps(b)) continue;
                double d = (b.CenterX - fromX) * (facing >= 0 ? 1 : -1);
                // 後ろにいる物は前の物より後回し
                if (d < 0) d = 100000 - d;
                list.Add((c, d));
            }
            list.Sort((a, b) => a.d.CompareTo(b.d));
            var r = new List<T>();
            for (int i = 0; i < list.Count && r.Count < max; i++) r.Add(list[i].t);
            return r;
        }
    }
}
