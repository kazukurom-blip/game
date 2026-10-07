// 敵の動き（FEEL.md 9 章・MONSTERS.md 2 章）:
//   歩き回り（1〜3 秒歩く → 1〜3 秒止まる）・足場の端と壁で向きを変える（落ちない）・攻撃されたら追う（5 秒当たらなければやめる）
//   跳ねる（キノコ・スライム）・飛ぶ（足場に関係なく漂う）・動かない・瞬間移動
//   被弾で 0.3 秒ひるむ・「押される量」以上で後ろへ押される（約 15 px・0.2 秒）・倒れると 0.6 秒で消える
//   速さは敵ごと（MobDef.Speed = 100 + 速さ）。状態異常（気絶・凍結・眠り）の間・技の構えの間は動かない。
//   技（飛び道具・魔法・ボスの技）は MobCombat.cs。
using System;
using Lumina.Core.Combat;
using Lumina.Core.Physics;
using Lumina.Core.Status;
using Lumina.Core.Util;

namespace Lumina.Core.Mobs
{
    public enum MobState { Stand, Move, Hit, Die }

    public sealed class Mob : IStatusTarget
    {
        public const double WanderMin = 1, WanderMax = 3;
        public const double AggroTime = 5;
        public const double HitStunTime = 0.3;
        public const double KnockTime = 0.2, KnockSpeed = 75;   // 0.2 秒で 15 px
        public const double DieTime = 0.6;
        public const double HopSpeed = 380;                     // 跳ねる敵の小さな跳ね（約 36 px）
        public const double HopWaitMin = 0.4, HopWaitMax = 1.4; // 跳ねる間（歩いている時）。追う時はすぐ跳ねる
        public const double FlyBob = 18;
        public const double FlyRangeX = 150, FlyRangeY = 60;    // 飛ぶ敵が家から離れる幅

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
        public double SpawnY;          // 飛ぶ敵の家の高さ（HomeY は今漂っている高さ）
        public double AttackCooldown;
        public double TeleportT;
        public int AtkDown, DefDown; public double DebuffT;
        public double HpBarT;          // 被弾した後しばらく HP バーを出す

        // 状態異常（StatusSystem でかける）
        public readonly StatusSet Status = new StatusSet();
        // 技（MobCombat）
        public double[] SkillCd;       // 技ごとの残りの待ち時間
        public double SkillGap;        // 技と技の間（1 秒）
        public MobSkillDef Casting;    // 構え・予兆の間の技（null = していない）
        public double CastT, CastTotal;
        public double CastX, CastY;    // 狙った所（dive の出る所）
        public bool Hidden;            // 潜っている・消えている（当たらない・描かない）
        // ボス
        public int Phase;              // 今の段階（0〜）
        public bool PhaseStarted;
        // 呼ばれた手下
        public int SummonerUid;        // 呼んだボスの Uid（0 = ふつうに湧いた）
        public bool Summoned => SummonerUid != 0;
        public double FlyTargetY;      // 飛ぶ敵が漂う高さ（家からのずれ）

        // 強化（敵の技 type: buff）。主人公の崩しで消える
        public readonly MobBuffs Buffs = new MobBuffs();
        /// <summary>今の MP（-1 = まだ減っていない = 最大）。MP 吸収で減る</summary>
        public int Mp = -1;
        public int CurMp => Mp < 0 ? Def.Mp : Mp;
        /// <summary>変化の呪いで変わった姿（変化の間だけ効く。null = 元のまま）</summary>
        public MobDef PolyDef;

        // ボスの仕掛け（Mobs/BossMechanics.cs）
        public int MaxHpOverride;      // 分身・光る岩の HP（0 = Def.Hp）
        public int CloneOf;            // 分身なら本物の Uid（0 = 分身でない）
        public int OwnerUid;           // 仕掛けの物を出したボスの Uid
        public double AtkScale = 1;    // 攻撃力の倍率（分身は 0.5）
        public bool FieldBoss;         // フィールドボス（Core/Fun。決まったマップに時間で 1 体だけ湧く）
        public bool Rare;              // 珍しい色違いの個体（Core/Fun。HP・攻撃力が高く、経験値と落とす物が多い。Unity 側は色を変えて光らせる）
        public bool Mechanic;          // 仕掛けの物（分身・光る岩・時計虫）: 倒しても経験値・ドロップ・クエストの数にならない
        public string MechanicKind;    // "clone" / "rock" / "shard"（Unity 側の絵の選び方）
        public double GuardMul = 1;    // 受けるダメージの倍率（時の裂け目が閉じていない間 0.1 など）
        public bool Submerged; public double SubmergeT, SubmergeTotal; // 深く潜っている（当たらない・技を使わない）
        public double ShuffleT;        // 分身と入れ替わるまで
        public int ClonePhase = -1, SubmergePhase = -1; // 分身を出した・潜った段階（同じ段階で 2 回しない）
        public double HealAcc;         // 潜っている間の回復の端数

        public int MaxHp => MaxHpOverride > 0 ? MaxHpOverride : Def.Hp;
        public BossPhaseDef PhaseDef => Def.Boss != null && Def.Boss.Phases.Count > 0 ? Def.Boss.Phases[Math.Min(Phase, Def.Boss.Phases.Count - 1)] : null;
        /// <summary>今の姿（変化の間は変わった姿の定義）。攻撃力・防御・速さはこちらの値</summary>
        public MobDef Form => PolyDef != null && Status.Polymorphed ? PolyDef : Def;
        /// <summary>変化している時の姿の敵の ID（Unity 側はこの敵の絵で描く。変化していなければ null）</summary>
        public string FormId => Form != Def ? Form.Id : null;
        /// <summary>錯乱弾で操られている（主人公の味方。主人公に当たらず、近くの敵に体当たりする）</summary>
        public bool Charmed => Status.Confused;
        /// <summary>本物だけにある影（分身には無い）</summary>
        public bool HasShadow => CloneOf == 0;
        /// <summary>動く速さ（ボスの段階・速さの強化・遅延込み。遅延でも元の 2 割より下げない）</summary>
        public double MoveSpeed
        {
            get
            {
                double v = Form.Speed * (PhaseDef?.SpeedMul ?? 1) * (1 + Buffs.Pct(MobBuffKind.Speed) / 100);
                double slow = Status.SpeedDown;
                return slow > 0 && v > 0 ? Math.Max(v * 0.2, v - slow) : v;
            }
        }
        /// <summary>かかっている状態異常のビット（頭の上のアイコン用。1 &lt;&lt; (int)StatusKind）</summary>
        public int StatusIcons => Status.Mask;
        /// <summary>かかっている強化のビット（1 &lt;&lt; (int)MobBuffKind）</summary>
        public int BuffIcons => Buffs.Mask;

        /// <summary>属性の倍率（ボスの段階で弱点が変わる時はそちら）</summary>
        public double ElementMul(string element)
        {
            var ph = PhaseDef;
            if (ph?.Elements != null && element != null && ph.Elements.TryGetValue(element, out var v)) return v;
            return Def.ElementMul(element);
        }

        // IStatusTarget
        StatusSet IStatusTarget.Status => Status;
        public StatusResist StatusResist => Def.Kind == "raid" ? StatusResist.Immune : Def.Kind == "boss" ? StatusResist.Boss : StatusResist.None;
        int IStatusTarget.StatusUid => Uid;
        double IStatusTarget.StatusX => X;
        double IStatusTarget.StatusY => HeadY;

        public bool Alive => State != MobState.Die && !Removed;
        public double Width => Def.Width;
        public double Height => Def.Height;
        /// <summary>当たりの四角（足元が (X, Y)、跳ねている分だけ上へ）</summary>
        public Rect Box => new Rect(X - Def.Width / 2, Y - HopY - Def.Height, X + Def.Width / 2, Y - HopY);
        public double HeadY => Y - HopY - Def.Height;

        public DefenderInfo Defender => new DefenderInfo
        {
            Level = Def.Lv,
            Def = Math.Max(0, (int)Math.Round((Form.Def - DefDown) * DefMul * (1 + Buffs.Pct(MobBuffKind.Def) / 100))),
            Mdef = (int)Math.Round(Form.Mdef * DefMul * (1 + Buffs.Pct(MobBuffKind.Mdef) / 100)),
            Avoid = Form.Avoid, ElementMul = ElementMul,
        };
        private double DefMul => (PhaseDef?.DefMul ?? 1) * Status.DefMul;
        private double AtkMul => (PhaseDef?.AtkMul ?? 1) * Status.AtkMul;
        /// <summary>物理の攻撃力（かく乱・呪い・ボスの段階・攻撃の強化・変化込み）</summary>
        public int Atk => Math.Max(1, (int)Math.Round((Form.Atk - AtkDown) * AtkMul * AtkScale * (1 + Buffs.Pct(MobBuffKind.Atk) / 100)));
        /// <summary>魔法の攻撃力（無い敵は物理の値）</summary>
        public int Matk => Form.Matk > 0 ? Math.Max(1, (int)Math.Round(Form.Matk * AtkMul * AtkScale * (1 + Buffs.Pct(MobBuffKind.Matk) / 100))) : Atk;
        /// <summary>命中（暗闇で下がる）</summary>
        public int Acc => (int)Math.Round(Form.Acc * Status.AccMul);

        /// <summary>動きの名前（Unity 側の絵の選び方）: stand / move / fly / hit1 / die1 / attack1（近接・飛び道具の構え）/ skill1（魔法・全体・呼び出しの詠唱）</summary>
        public string Motion
        {
            get
            {
                if (Casting != null && State != MobState.Hit && State != MobState.Die)
                    return Casting.Type == MobSkillType.Melee || Casting.Type == MobSkillType.Shot ? "attack1" : "skill1";
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
            m.X = x; m.Y = y; m.HomeX = x; m.HomeY = y; m.SpawnY = y;
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
            if (m.Submerged) return; // 深く潜っている（深淵の大魚）: その場で動かない
            StepHop(m, dt, rng);

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
            // 気絶・凍結・眠り・技の構えの間は動かない
            if (!m.Status.CanMove || m.Casting != null)
            {
                if (m.State == MobState.Move) m.State = MobState.Stand;
                if (m.Casting != null && !player.Hidden && m.Casting.Type != MobSkillType.Melee) m.Facing = player.X >= m.X ? 1 : -1;
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
                    if (!MoveAlong(m, map, dir * m.MoveSpeed * dt, true)) m.State = MobState.Stand;
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
            if (m.State == MobState.Move && m.MoveSpeed > 0 && m.Seg != null)
            {
                if (!MoveAlong(m, map, m.Facing * m.MoveSpeed * dt, true)) m.Facing = -m.Facing; // 端・壁で向きを変える
            }
        }

        // 跳ねる敵（キノコ・スライム）: 歩いている間、0.4〜1.4 秒おきに小さく跳ねる（跳ねている間も前へ進む）。
        // 追っている時は着地してすぐ跳ねる。弱り（ジャンプできない）の間は跳ねない。
        private static void StepHop(Mob m, double dt, IRandom rng)
        {
            if (m.Def.Move != MobMove.Jump) return;
            if (m.HopY > 0 || m.HopV != 0)
            {
                // 速さの平均で進める（主人公と同じやり方）
                double nv = m.HopV - Feel.Gravity * dt;
                m.HopY += (m.HopV + nv) / 2 * dt;
                m.HopV = nv;
                if (m.HopY <= 0) { m.HopY = 0; m.HopV = 0; m.HopCooldown = m.AggroT > 0 ? 0.15 : rng.Range(Mob.HopWaitMin, Mob.HopWaitMax); }
            }
            else if (m.State == MobState.Move && m.Status.CanJump && m.Casting == null && m.StunT <= 0)
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
                    if (m.State == MobState.Move)
                    {
                        m.Facing = rng.NextDouble() < 0.5 ? -1 : 1;
                        m.FlyTargetY = rng.Range(-Mob.FlyRangeY, Mob.FlyRangeY); // 次に漂う高さ
                    }
                }
                if (m.State == MobState.Move)
                {
                    tx = m.X + m.Facing * 100;
                    if (Math.Abs(tx - m.HomeX) > 150) { m.Facing = -m.Facing; tx = m.X + m.Facing * 100; }
                }
                else tx = m.X;
            }
            double dx = tx - m.X;
            double step = m.MoveSpeed * dt;
            if (Math.Abs(dx) > 2) { m.Facing = dx > 0 ? 1 : -1; m.X += Math.Sign(dx) * Math.Min(step, Math.Abs(dx)); m.State = MobState.Move; }
            // 上下: 追う時は主人公の高さへ（縄の上も狙う）、歩き回る時は家から ±60 の中でゆっくり高さを変える
            if (!chase) ty = m.SpawnY + m.FlyTargetY;
            double dy = ty - m.HomeY;
            m.HomeY += Math.Sign(dy) * Math.Min(step * (chase ? 0.6 : 0.3), Math.Abs(dy));
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
