// 主人公の動き（クラシックの手触り）。classic/src/engine/physics.js をそのまま C# に移したもの。
// 同じ入力なら同じ数値になる（Tests の Golden で 1 フレームずつ比べている）。
// ブラウザ版に無い追加（使わなければブラウザ版と同じ動き）:
//   - 壁（PhysicsMap.Walls）: 左右に通れない
//   - 攻撃中（AttackLock）: 地上では歩けず止まる・ジャンプしない。空中は勢いそのまま
//   - ジャンプできない（NoJump。状態異常「弱り」）
//   - ゆっくり落ちる（SlowFall。隠れ足）・外から横に動かす（Shove。ツタの引き寄せ・渦潮の吸い込み）
using System;
using System.Collections.Generic;

namespace Lumina.Core.Physics
{
    public enum BodyState { Stand, Walk, Prone, Air, Rope, Ladder }

    /// <summary>1 フレームの入力。JumpPressed は押した瞬間だけ true。</summary>
    public struct PhysicsInput
    {
        public bool Left, Right, Up, Down, Jump, JumpPressed;

        public static PhysicsInput None => new PhysicsInput();
    }

    /// <summary>このフレームで起きたこと（音・エフェクト用）。</summary>
    public enum BodyEvent { Jump, Land, Grab, DownJump, RopeJump, Hurt }

    public sealed class PlayerBody
    {
        public const double HalfW = 12; // 当たりの横幅の半分（マップの端で止まる）
        public const double Height = 56; // 当たりの高さ（足元から上。敵との当たり・壁に使う。ART_SPEC_UNITY.md の約 64px より少し低め）

        public double X, Y, Vx, Vy;
        public BodyState State = BodyState.Air;
        public Foothold Seg;
        public Rope Rope;
        public int Facing = 1;
        public double StateTime;
        public FootholdChain DropChain; public double DropT;
        public double RegrabT;
        public double InvT; public bool KnockLock;
        public bool Climbing;
        public MoveStats Stats;
        public readonly List<BodyEvent> Events = new List<BodyEvent>();

        // 追加の状態（ブラウザ版に無い）
        public bool AttackLock;
        public bool NoJump;
        /// <summary>隠れ足: 空中でジャンプキーを押している間、落ちる速さを SlowFallSpeed までにする</summary>
        public bool SlowFall;
        public const double SlowFallSpeed = 120; // px/秒（似。ふつうの最大の落ちる速さより十分遅い）

        public PlayerBody(double x, double y, double speed = 100, double jump = 100)
        {
            X = x; Y = y;
            Stats = MoveStats.From(speed, jump);
        }

        public bool OnGround => State == BodyState.Stand || State == BodyState.Walk || State == BodyState.Prone;
        public bool OnRope => State == BodyState.Rope || State == BodyState.Ladder;

        public void SetMoveStats(double speed, double jump) { Stats = MoveStats.From(speed, jump); }

        internal void SetState(BodyState s)
        {
            if (State != s) { State = s; StateTime = 0; }
        }

        /// <summary>無敵の点滅: 表示するフレームか</summary>
        public bool BlinkVisible
        {
            get
            {
                if (InvT <= 0) return true;
                return ((long)Math.Floor(InvT / Feel.HurtBlink)) % 2 == 0;
            }
        }
    }

    public static class PlayerPhysics
    {
        /// <summary>縄・はしごを探す。down=false: 下や途中からつかまる / true: 上の足場から降りる</summary>
        public static Rope FindRope(PhysicsMap map, PlayerBody p, bool down)
        {
            Rope best = null; double bd = double.PositiveInfinity;
            foreach (var r in map.Ropes)
            {
                double range = Feel.RopeGrabRange + (r.Ladder ? 4 : 0);
                double d = Math.Abs(r.X - p.X);
                if (d > range || d >= bd) continue;
                if (!down)
                {
                    if (p.Y > r.Top + 2 && p.Y <= r.Bottom + Feel.RopeBottomReach) { best = r; bd = d; }
                }
                else if (Math.Abs(p.Y - r.Top) <= Feel.RopeTopReach) { best = r; bd = d; }
            }
            return best;
        }

        private static void Grab(PlayerBody p, Rope r, bool fromTop)
        {
            p.Rope = r; p.Seg = null; p.Vx = 0; p.Vy = 0; p.KnockLock = false;
            p.X = r.X;
            p.Y = fromTop ? r.Top + 4 : Math.Min(Math.Max(p.Y, r.Top + 4), r.Bottom);
            p.SetState(r.Ladder ? BodyState.Ladder : BodyState.Rope);
            p.Events.Add(BodyEvent.Grab);
        }

        private static void Land(PlayerBody p, Foothold s)
        {
            p.Seg = s; p.Y = s.YAt(p.X); p.Vy = 0; p.KnockLock = false;
            p.DropChain = null; p.DropT = 0;
            p.SetState(Math.Abs(p.Vx) > 1 ? BodyState.Walk : BodyState.Stand);
            p.Events.Add(BodyEvent.Land);
        }

        private static void Fall(PlayerBody p)
        {
            p.Seg = null; p.Vy = 0;
            p.SetState(BodyState.Air);
        }

        private static void ClampX(PlayerBody p, PhysicsMap map)
        {
            if (p.X < PlayerBody.HalfW) { p.X = PlayerBody.HalfW; if (p.Vx < 0) p.Vx = 0; }
            if (p.X > map.Width - PlayerBody.HalfW) { p.X = map.Width - PlayerBody.HalfW; if (p.Vx > 0) p.Vx = 0; }
        }

        /// <summary>壁: prevX → p.X の間に壁があり、足元の高さが壁の範囲なら壁の手前で止める。</summary>
        private static bool ApplyWalls(PlayerBody p, PhysicsMap map, double prevX)
        {
            if (map.Walls.Count == 0 || prevX == p.X) return false;
            bool hit = false;
            foreach (var w in map.Walls)
            {
                // 体の縦の範囲（足元〜頭）が壁の範囲と重なる時だけ
                if (p.Y <= w.Top || p.Y - PlayerBody.Height >= w.Bottom) continue;
                if (prevX <= w.X - PlayerBody.HalfW + 1e-9 && p.X > w.X - PlayerBody.HalfW)
                {
                    p.X = w.X - PlayerBody.HalfW; if (p.Vx > 0) p.Vx = 0; hit = true;
                }
                else if (prevX >= w.X + PlayerBody.HalfW - 1e-9 && p.X < w.X + PlayerBody.HalfW)
                {
                    p.X = w.X + PlayerBody.HalfW; if (p.Vx < 0) p.Vx = 0; hit = true;
                }
            }
            return hit;
        }

        private static double Approach(double v, double target, double rate)
        {
            if (v < target) return Math.Min(target, v + rate);
            return Math.Max(target, v - rate);
        }

        /// <summary>1 フレーム進める（dt は 1/60 秒の固定を想定）。</summary>
        public static void Step(PlayerBody p, PhysicsInput inp, PhysicsMap map, double dt)
        {
            p.Events.Clear();
            p.StateTime += dt;
            if (p.InvT > 0) p.InvT = Math.Max(0, p.InvT - dt);
            if (p.RegrabT > 0) p.RegrabT = Math.Max(0, p.RegrabT - dt);
            if (p.DropT > 0) { p.DropT = Math.Max(0, p.DropT - dt); if (p.DropT == 0) p.DropChain = null; }
            int dir = (inp.Right ? 1 : 0) - (inp.Left ? 1 : 0);

            if (p.OnRope) { StepClimb(p, inp, map, dt, dir); return; }
            if (p.OnGround && p.Seg != null) { StepGround(p, inp, map, dt, dir); return; }
            StepAir(p, inp, map, dt, dir);
        }

        private static void StepGround(PlayerBody p, PhysicsInput inp, PhysicsMap map, double dt, int dir)
        {
            var st = p.Stats;
            // 攻撃中: 歩けない・跳べない（止まる）
            if (p.AttackLock)
            {
                p.Vx = Approach(p.Vx, 0, Feel.AttackGroundDecel * dt);
                MoveOnGround(p, map, dt);
                if (p.OnGround) p.SetState(p.State == BodyState.Prone ? BodyState.Prone : (Math.Abs(p.Vx) > 1 ? BodyState.Walk : BodyState.Stand));
                return;
            }
            bool jump = inp.Jump && !p.NoJump;
            // ↓＋ジャンプ: 浮いた足場から降りる（下に足場がある時だけ）
            if (inp.Down && jump)
            {
                if (!p.Seg.Chain.Ground && map.SegBelow(p.X, p.Y + 1, p.Seg.Chain) != null)
                {
                    p.DropChain = p.Seg.Chain; p.DropT = Feel.DownJumpIgnore;
                    p.Vy = -Feel.DownJumpSpeed; p.Seg = null;
                    p.SetState(BodyState.Air);
                    p.Events.Add(BodyEvent.DownJump);
                    return;
                }
            }
            // ↓: 足元にはしご・縄の上端があれば降りる。無ければ伏せ
            if (inp.Down)
            {
                var r = FindRope(map, p, true);
                if (r != null) { Grab(p, r, true); return; }
                p.Vx = Approach(p.Vx, 0, Feel.WalkDecel * 3 * dt);
                MoveOnGround(p, map, dt);
                p.SetState(BodyState.Prone);
                return;
            }
            // ↑: 縄・はしごにつかまる
            if (inp.Up && p.RegrabT <= 0)
            {
                var r = FindRope(map, p, false);
                if (r != null) { Grab(p, r, false); return; }
            }
            // ジャンプ（押しっぱなしで着地のたびに跳ぶ）
            if (jump)
            {
                p.Vy = -st.JumpSpeed; p.Seg = null;
                if (dir != 0) p.Facing = dir;
                p.SetState(BodyState.Air);
                p.Events.Add(BodyEvent.Jump);
                return;
            }
            // 歩く
            if (dir != 0)
            {
                p.Facing = dir;
                double rate = (p.Vx * dir < 0 ? Feel.TurnDecel : Feel.WalkAccel) * dt;
                p.Vx = Approach(p.Vx, dir * st.WalkSpeed, rate);
            }
            else
            {
                p.Vx = Approach(p.Vx, 0, Feel.WalkDecel * dt);
            }
            MoveOnGround(p, map, dt);
            if (p.OnGround) p.SetState(dir != 0 || Math.Abs(p.Vx) > 1 ? BodyState.Walk : BodyState.Stand);
        }

        // 線にそって進む。端に来たらとなりの線分へ、無ければ落ちる
        private static void MoveOnGround(PlayerBody p, PhysicsMap map, double dt)
        {
            if (p.Vx == 0) { p.Y = p.Seg.YAt(p.X); return; }
            var s = p.Seg;
            double prevX = p.X;
            p.X += p.Vx * dt * (Feel.SlopeSpeedByLength ? s.Cos : 1);
            ApplyWalls(p, map, prevX);
            for (int guard = 0; guard < 8; guard++)
            {
                if (p.X > s.X2)
                {
                    if (s.Next != null) { s = s.Next; continue; }
                    p.Seg = s; ClampX(p, map);
                    if (p.X > s.X2) { Fall(p); return; }
                }
                else if (p.X < s.X1)
                {
                    if (s.Prev != null) { s = s.Prev; continue; }
                    p.Seg = s; ClampX(p, map);
                    if (p.X < s.X1) { Fall(p); return; }
                }
                break;
            }
            p.Seg = s;
            ClampX(p, map);
            p.Y = s.YAt(p.X);
        }

        private static void StepAir(PlayerBody p, PhysicsInput inp, PhysicsMap map, double dt, int dir)
        {
            var st = p.Stats;
            if (!p.KnockLock && dir != 0)
            {
                p.Facing = dir;
                double cap = Feel.AirMaxSpeed * (st.WalkSpeed / Feel.WalkSpeed);
                // 上限を超えている時（ふっとび等）は加速しない
                if (p.Vx * dir < cap) p.Vx = Math.Min(cap, p.Vx * dir + Feel.AirAccel * dt) * dir;
            }
            // 空中で ↑: 縄にとびつく
            if (inp.Up && !p.KnockLock && p.RegrabT <= 0)
            {
                var r = FindRope(map, p, false);
                if (r != null) { Grab(p, r, false); return; }
            }
            // 重力（速さの平均で進める → ジャンプの高さが計算どおり v²/2g になる）
            double prevX = p.X, prevY = p.Y;
            double nvy = Math.Min(Feel.MaxFall, p.Vy + Feel.Gravity * dt);
            if (p.SlowFall && inp.Jump && nvy > PlayerBody.SlowFallSpeed) nvy = PlayerBody.SlowFallSpeed; // 隠れ足（使わなければブラウザ版と同じ）
            p.Y += (p.Vy + nvy) / 2 * dt;
            p.Vy = nvy;
            p.X += p.Vx * dt;
            ApplyWalls(p, map, prevX);
            ClampX(p, map);
            p.SetState(BodyState.Air);
            // 着地: 線を上から下へまたいだ時だけ（下からはすり抜ける）
            if (p.Vy >= 0)
            {
                Foothold best = null; double by = double.PositiveInfinity;
                foreach (var s in map.Segs)
                {
                    if (s.Chain == p.DropChain) continue;
                    if (p.X < s.X1 || p.X > s.X2) continue;
                    double yNow = s.YAt(p.X);
                    double yPrev = s.YAt(Math.Min(s.X2, Math.Max(s.X1, prevX)));
                    if (prevY <= yPrev + 1 && p.Y >= yNow && yNow < by) { by = yNow; best = s; }
                }
                if (best != null) Land(p, best);
            }
            if (p.Y > map.Height + 200) { p.Y = map.Height + 200; p.Vy = 0; }
        }

        private static void StepClimb(PlayerBody p, PhysicsInput inp, PhysicsMap map, double dt, int dir)
        {
            var r = p.Rope; var st = p.Stats;
            p.X = r.X; p.Vx = 0; p.Vy = 0;
            // 左右＋ジャンプで飛び降りる（ジャンプだけでは離れない）
            if (inp.JumpPressed && dir != 0)
            {
                p.Rope = null; p.Facing = dir;
                p.Vx = dir * Feel.RopeJumpSpeedX; p.Vy = -Feel.RopeJumpSpeedY;
                p.RegrabT = Feel.RopeRegrabDelay;
                p.SetState(BodyState.Air);
                p.Events.Add(BodyEvent.RopeJump);
                return;
            }
            int v = (inp.Down ? 1 : 0) - (inp.Up ? 1 : 0);
            p.Climbing = v != 0;
            p.Y += v * st.ClimbSpeed * dt;
            if (p.Y < r.Top)
            {
                // 上端: 足場があれば上に立つ
                Foothold s = null;
                foreach (var q in map.Segs)
                {
                    if (p.X >= q.X1 && p.X <= q.X2 && Math.Abs(q.YAt(p.X) - r.Top) <= 8) { s = q; break; }
                }
                p.Rope = null; p.Climbing = false;
                if (s != null) { p.Vx = 0; Land(p, s); }
                else { p.Y = r.Top; p.Rope = r; p.Climbing = false; }
                return;
            }
            if (p.Y > r.Bottom)
            {
                // 下端: 手を離して落ちる
                p.Y = r.Bottom; p.Rope = null; p.Climbing = false;
                p.RegrabT = Feel.RopeRegrabDelay;
                Fall(p);
            }
        }

        /// <summary>被弾: 敵と反対へふっとび、着地まで操作できない。無敵の間は何もしない（false）。</summary>
        public static bool Hurt(PlayerBody p, double fromX)
        {
            if (p.InvT > 0) return false;
            p.InvT = Feel.HurtInvincible;
            int away = p.X >= fromX ? 1 : -1;
            p.Rope = null; p.Seg = null; p.Climbing = false;
            p.Vx = away * Feel.HurtKnockX; p.Vy = -Feel.HurtKnockY;
            p.KnockLock = true;
            p.SetState(BodyState.Air);
            p.Events.Add(BodyEvent.Hurt);
            return true;
        }

        /// <summary>
        /// 外から横に押す・引く（ツタの引き寄せ・渦潮の吸い込み）。地面では足場にそって進み（端からは落ちる）、空中ではそのまま横へ。
        /// 縄・はしごの上では動かない。壁は越えない。
        /// </summary>
        public static void Shove(PlayerBody p, PhysicsMap map, double dx)
        {
            if (dx == 0 || p.OnRope) return;
            if (p.OnGround && p.Seg != null)
            {
                double vx = p.Vx;
                p.Vx = dx;
                MoveOnGround(p, map, 1);
                p.Vx = p.OnGround ? vx : 0;
                return;
            }
            double prevX = p.X;
            p.X += dx;
            ApplyWalls(p, map, prevX);
            ClampX(p, map);
        }

        /// <summary>出現の位置に置いて、足元の足場に立たせる（マップに入った時）。</summary>
        public static void PlaceOnGround(PlayerBody p, PhysicsMap map, double x, double y)
        {
            p.X = x; p.Y = y; p.Vx = 0; p.Vy = 0; p.Rope = null; p.Climbing = false;
            p.DropChain = null; p.DropT = 0; p.KnockLock = false;
            var s = map.SegBelow(x, y - 2);
            if (s != null) { p.Seg = s; p.Y = s.YAt(x); p.SetState(BodyState.Stand); }
            else { p.Seg = null; p.SetState(BodyState.Air); }
        }
    }
}
