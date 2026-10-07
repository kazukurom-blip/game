// 敵の動き（FEEL.md 9 章・MONSTERS.md 2 章）:
//   歩き回り（1〜3 秒歩く → 1〜3 秒止まる）・足場の端と壁で向きを変える（落ちない）・攻撃されたら追う（5 秒当たらなければやめる）
//   跳ねる（キノコ・スライム）・飛ぶ（足場に関係なく漂う）・動かない・瞬間移動
//   被弾で 0.3 秒ひるむ・「押される量」以上で後ろへ押される（約 15 px・0.2 秒）・倒れると 0.6 秒で消える
using System;
using Lumina.Core.Combat;
using Lumina.Core.Physics;
using Lumina.Core.Util;

namespace Lumina.Core.Mobs
{
    public enum MobState { Stand, Move, Hit, Die }

    public sealed class Mob
    {
        public const double WanderMin = 1, WanderMax = 3;
        public const double AggroTime = 5;
        public const double HitStunTime = 0.3;
        public const double KnockTime = 0.2, KnockSpeed = 75;   // 0.2 秒で 15 px
        public const double DieTime = 0.6;
        public const double HopSpeed = 380;                     // 跳ねる敵の小さな跳ね（約 36 px）
        public const double FlyBob = 18;

        public int Uid;
        public MobDef Def;
        public int SpawnIndex = -1;    // どの湧く所から出たか（-1 = 時間で湧く物など）
        public bool Timed;
        public double X, Y, Vx;
        public int Facing = -1;
        public Foothold Seg;
        public MobState State = MobState.Stand;
        public int Hp;
        public double StateT, StateDur;
        public double AggroT;
        public double StunT, KnockT; public int KnockDir;
        public double DieT;
        public bool Removed;
        public double HopY, HopV, HopCooldown;  // 跳ねる敵の見た目の高さ（足場からの上へのずれ）
        public double HomeX, HomeY, FlyPhase;
        public double AttackCooldown;
        public double TeleportT;
        public int AtkDown, DefDown; public double DebuffT;
        public double HpBarT;          // 被弾した後しばらく HP バーを出す

        public bool Alive => State != MobState.Die && !Removed;
        public double Width => Def.Width;
        public double Height => Def.Height;
        /// <summary>当たりの四角（足元が (X, Y)、跳ねている分だけ上へ）</summary>
        public Rect Box => new Rect(X - Def.Width / 2, Y - HopY - Def.Height, X + Def.Width / 2, Y - HopY);
        public double HeadY => Y - HopY - Def.Height;

        public DefenderInfo Defender => new DefenderInfo
        {
            Level = Def.Lv, Def = Math.Max(0, Def.Def - DefDown), Mdef = Def.Mdef, Avoid = Def.Avoid, ElementMul = Def.ElementMul,
        };
        public int Atk => Math.Max(1, Def.Atk - AtkDown);

        /// <summary>動きの名前（Unity 側の絵の選び方）: stand / move / hit1 / die1</summary>
        public string Motion
        {
            get
            {
                switch (State)
                {
                    case MobState.Move: return Def.Move == MobMove.Fly ? "fly" : "move";
                    case MobState.Hit: return "hit1";
                    case MobState.Die: return "die1";
                    default: return "stand";
                }
            }
        }

        /// <summary>倒れる時の消え方（0〜1、1 で見えない）</summary>
        public double FadeOut => State == MobState.Die ? Math.Min(1, DieT / DieTime) : 0;
    }

    /// <summary>主人公の位置（敵の AI が見る物）</summary>
    public struct PlayerSense
    {
        public double X, Y;
        public FootholdChain Chain;
        public bool Hidden;   // 闇隠れ・死んでいる時
    }

    public static class MobAI
    {
        public static void Place(Mob m, PhysicsMap map, double x, double y)
        {
            m.X = x; m.Y = y; m.HomeX = x; m.HomeY = y;
            if (m.Def.Move != MobMove.Fly)
            {
                var s = map.SegBelow(x, y - 4) ?? map.SegBelow(x, -1e9);
                if (s != null) { m.Seg = s; m.Y = s.YAt(x); }
            }
        }

        public static void Step(Mob m, PhysicsMap map, PlayerSense player, double dt, IRandom rng)
        {
            if (m.Removed) return;
            if (m.HpBarT > 0) m.HpBarT -= dt;
            if (m.State == MobState.Die)
            {
                m.DieT += dt;
                if (m.DieT >= Mob.DieTime) m.Removed = true;
                return;
            }
            if (m.DebuffT > 0) { m.DebuffT -= dt; if (m.DebuffT <= 0) { m.AtkDown = 0; m.DefDown = 0; } }
            if (m.AttackCooldown > 0) m.AttackCooldown -= dt;
            if (m.AggroT > 0) m.AggroT -= dt;
            StepHop(m, dt);

            // ひるみ・押される
            if (m.KnockT > 0)
            {
                m.KnockT -= dt;
                MoveAlong(m, map, m.KnockDir * Mob.KnockSpeed * dt, false);
            }
            if (m.StunT > 0)
            {
                m.StunT -= dt;
                if (m.StunT <= 0 && m.State == MobState.Hit) { m.State = MobState.Stand; m.StateT = 0; m.StateDur = rng.Range(Mob.WanderMin, Mob.WanderMax); }
                return;
            }

            switch (m.Def.Move)
            {
                case MobMove.Stand:
                    m.State = MobState.Stand;
                    if (!player.Hidden) m.Facing = player.X >= m.X ? 1 : -1;
                    return;
                case MobMove.Fly:
                    StepFly(m, map, player, dt, rng);
                    return;
                case MobMove.Teleport:
                    m.TeleportT += dt;
                    if (m.TeleportT >= 4 && m.Seg != null)
                    {
                        m.TeleportT = 0;
                        double nx = player.Hidden ? m.X + rng.Range(-100.0, 100.0) : player.X + rng.Range(-80.0, 80.0);
                        var chain = m.Seg.Chain;
                        foreach (var s in chain.Segs) if (nx >= s.X1 && nx <= s.X2) { m.X = nx; m.Seg = s; m.Y = s.YAt(nx); break; }
                    }
                    break;
            }

            // 追う: 攻撃されてから 5 秒、または近くの同じ足場にいる（Lv20 以上の歩く敵）
            bool chase = !player.Hidden && m.Seg != null && (m.AggroT > 0 ||
                (m.Def.ChaseOnSight && player.Chain == m.Seg.Chain && Math.Abs(player.X - m.X) < 400));
            if (chase)
            {
                m.State = MobState.Move;
                int dir = Math.Abs(player.X - m.X) < 4 ? 0 : (player.X > m.X ? 1 : -1);
                if (dir != 0)
                {
                    m.Facing = dir;
                    if (!MoveAlong(m, map, dir * m.Def.Speed * dt, true)) m.State = MobState.Stand;
                }
                else m.State = MobState.Stand;
                return;
            }

            // 歩き回り
            m.StateT += dt;
            if (m.StateT >= m.StateDur)
            {
                m.StateT = 0;
                m.StateDur = rng.Range(Mob.WanderMin, Mob.WanderMax);
                if (m.State == MobState.Move) m.State = MobState.Stand;
                else
                {
                    m.State = MobState.Move;
                    m.Facing = rng.NextDouble() < 0.5 ? -1 : 1;
                }
            }
            if (m.State == MobState.Move && m.Def.Speed > 0 && m.Seg != null)
            {
                if (!MoveAlong(m, map, m.Facing * m.Def.Speed * dt, true)) m.Facing = -m.Facing; // 端・壁で向きを変える
            }
        }

        private static void StepHop(Mob m, double dt)
        {
            if (m.Def.Move != MobMove.Jump) return;
            if (m.HopY > 0 || m.HopV != 0)
            {
                // 速さの平均で進める（主人公と同じやり方）
                double nv = m.HopV - Feel.Gravity * dt;
                m.HopY += (m.HopV + nv) / 2 * dt;
                m.HopV = nv;
                if (m.HopY <= 0) { m.HopY = 0; m.HopV = 0; m.HopCooldown = 0.6; }
            }
            else if (m.State == MobState.Move)
            {
                m.HopCooldown -= dt;
                if (m.HopCooldown <= 0) m.HopV = Mob.HopSpeed;
            }
        }

        /// <summary>足場の線にそって dx 進む。足場の端（となりが無い）・壁・急な坂では止まって false。</summary>
        public static bool MoveAlong(Mob m, PhysicsMap map, double dx, bool stopAtEdge)
        {
            if (m.Seg == null || dx == 0) return true;
            var s = m.Seg;
            double nx = m.X + dx * s.Cos;
            double half = m.Def.Width / 2;
            // 壁
            foreach (var w in map.Walls)
            {
                if (m.Y <= w.Top || m.Y - m.Def.Height >= w.Bottom) continue;
                if (dx > 0 && m.X + half <= w.X && nx + half > w.X) return false;
                if (dx < 0 && m.X - half >= w.X && nx - half < w.X) return false;
            }
            for (int guard = 0; guard < 8; guard++)
            {
                if (nx > s.X2)
                {
                    if (s.Next != null && Math.Abs(s.Next.Y2 - s.Next.Y1) <= (s.Next.X2 - s.Next.X1) * 1.01) { s = s.Next; continue; }
                    if (stopAtEdge) { m.X = s.X2; m.Seg = s; m.Y = s.YAt(m.X); return false; }
                    nx = s.X2; break;
                }
                if (nx < s.X1)
                {
                    if (s.Prev != null && Math.Abs(s.Prev.Y2 - s.Prev.Y1) <= (s.Prev.X2 - s.Prev.X1) * 1.01) { s = s.Prev; continue; }
                    if (stopAtEdge) { m.X = s.X1; m.Seg = s; m.Y = s.YAt(m.X); return false; }
                    nx = s.X1; break;
                }
                break;
            }
            if (nx < half) { m.X = half; return false; }
            if (nx > map.Width - half) { m.X = map.Width - half; return false; }
            m.X = nx; m.Seg = s; m.Y = s.YAt(nx);
            return true;
        }

        private static void StepFly(Mob m, PhysicsMap map, PlayerSense player, double dt, IRandom rng)
        {
            m.FlyPhase += dt * 2.2;
            bool chase = !player.Hidden && m.AggroT > 0;
            double tx = m.HomeX, ty = m.HomeY;
            if (chase) { tx = player.X; ty = player.Y - 30; }
            else
            {
                m.StateT += dt;
                if (m.StateT >= m.StateDur)
                {
                    m.StateT = 0; m.StateDur = rng.Range(Mob.WanderMin, Mob.WanderMax);
                    m.State = m.State == MobState.Move ? MobState.Stand : MobState.Move;
                    if (m.State == MobState.Move) m.Facing = rng.NextDouble() < 0.5 ? -1 : 1;
                }
                if (m.State == MobState.Move)
                {
                    tx = m.X + m.Facing * 100;
                    if (Math.Abs(tx - m.HomeX) > 150) { m.Facing = -m.Facing; tx = m.X + m.Facing * 100; }
                }
                else tx = m.X;
            }
            double dx = tx - m.X;
            double step = m.Def.Speed * dt;
            if (Math.Abs(dx) > 2) { m.Facing = dx > 0 ? 1 : -1; m.X += Math.Sign(dx) * Math.Min(step, Math.Abs(dx)); m.State = MobState.Move; }
            double dy = ty - m.HomeY;
            if (chase) m.HomeY += Math.Sign(dy) * Math.Min(step * 0.6, Math.Abs(dy));
            m.Y = m.HomeY + Math.Sin(m.FlyPhase) * Mob.FlyBob;
            m.X = Math.Max(m.Def.Width / 2, Math.Min(map.Width - m.Def.Width / 2, m.X));
        }

        /// <summary>攻撃を受けた: ひるみ・押される・追いかけ開始。dmg が「押される量」以上なら押される。</summary>
        public static void OnHit(Mob m, int damage, double fromX)
        {
            if (!m.Alive) return;
            m.AggroT = Mob.AggroTime;
            m.HpBarT = 5;
            if (m.Def.IsBoss) return; // ボスは怯まない
            m.State = MobState.Hit;
            m.StunT = Mob.HitStunTime;
            m.Facing = fromX >= m.X ? 1 : -1;
            if (!m.Def.NoKnockback && m.Def.Pushed > 0 && damage >= m.Def.Pushed)
            {
                m.KnockT = Mob.KnockTime;
                m.KnockDir = fromX >= m.X ? -1 : 1;
            }
        }

        public static void Kill(Mob m)
        {
            m.Hp = 0;
            m.State = MobState.Die;
            m.DieT = 0;
            m.StunT = 0; m.KnockT = 0;
        }
    }
}
