// スキルとボスの「仕掛け」（GameSession の続き）:
//   身代わり人形（敵を引きつける）・秘術の扉（町と行き来する扉）・乗船の船の HP・毒の霧（置いておく）・
//   錯乱弾で操った敵（主人公の味方）・敵の強化を崩す・敵の反射・MP 吸収で敵の MP を減らす・
//   ボスの仕掛けのうち主人公が触る所（時の裂け目にかけらをはめる・ツタの引き寄せ・渦潮の吸い込み）。
// ボスの仕掛けそのもの（分身・潜って回復・光る岩・時の裂け目）は Mobs/BossMechanics.cs。
//
// Unity 側が読む物:
//   session.Decoy   身代わり人形（X, Y, Hp, MaxHp, Remaining。無ければ null）
//   session.Door    秘術の扉（FieldMap/FieldX/FieldY と TownMap/TownX/TownY、Remaining。今いるマップの扉だけ描く）
//   session.Zones   毒の霧（Box・Progress 0→1）
//   session.ShipHp / ShipMaxHp   乗船中の船の HP（乗っていなければ 0）
//   session.Map.Rifts            時の裂け目（Spots の X/Y/Filled・Progress・Shards・Exposed）
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Skills;
using Lumina.Core.Status;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    /// <summary>秘術の扉（使った場所と、町の側の扉）。</summary>
    public sealed class MysticDoor
    {
        public string SkillId;
        public string FieldMap, TownMap;
        public double FieldX, FieldY, TownX, TownY;
        public double Remaining, Total;
    }

    /// <summary>置いておく技（毒の霧）。</summary>
    public sealed class PlayerZone
    {
        public string SkillId;
        public int Level, MaxTargets;
        public Rect Box;
        public double Remaining, Total, TickT;
        public double Progress => Total > 0 ? Math.Min(1, Math.Max(0, 1 - Remaining / Total)) : 1;
    }

    /// <summary>身代わり人形（Unity 側の絵と HP バー用）。</summary>
    public struct DecoyInfo
    {
        public string SkillId;
        public double X, Y, Remaining;
        public int Hp, MaxHp;
    }

    public sealed partial class GameSession
    {
        /// <summary>変化の呪いで変える敵（コロ貝）。</summary>
        public const string PolymorphMobId = "M001";
        public const double DecoyRange = 450;        // 身代わり人形が敵を引きつける距離（似）
        public const double DecoyHitInterval = 0.5;  // 1 体の敵が人形に体当たりする間（秒）
        public const double CharmRange = 400;        // 操った敵が狙う敵を探す距離
        public const double CharmHitInterval = 1.0;  // 操った敵が体当たりする間（秒）
        public const double ReflectCapPct = 20;      // 敵の反射で返るのは 1 回で最大 HP のこの % まで（倒れない）
        public const int SlowMinSpeed = 30;          // 遅延でもこれより遅くしない
        public const double DoorReach = 30;          // 扉に入れる横の距離

        private MysticDoor door;
        /// <summary>秘術の扉（効果が切れたら null）。</summary>
        public MysticDoor Door
        {
            get
            {
                if (door == null) return null;
                var b = Buffs.Get(door.SkillId);
                if (b == null) { door = null; return null; }
                door.Remaining = b.Remaining; door.Total = b.Total;
                return door;
            }
            private set => door = value;
        }

        /// <summary>置いてある毒の霧（今のマップ）。</summary>
        public readonly List<PlayerZone> Zones = new List<PlayerZone>();

        /// <summary>今のマップにある身代わり人形（無ければ null）。</summary>
        public DecoyInfo? Decoy
        {
            get
            {
                var d = ActiveDecoy;
                if (d == null) return null;
                return new DecoyInfo { SkillId = d.Id, X = d.SummonX, Y = d.SummonY, Hp = d.DecoyHp, MaxHp = d.DecoyMaxHp, Remaining = d.Remaining };
            }
        }

        public int ShipHp => Buffs.ShipBuff?.ShipHp ?? 0;
        public int ShipMaxHp => Buffs.ShipBuff?.ShipMaxHp ?? 0;

        // ---------------- 毎フレーム

        private void TickMechanics(double dt)
        {
            TickZones(dt);
            BossMechanics.Cleanup(Map);
        }

        // ---------------- 身代わり人形

        private ActiveBuff ActiveDecoy
        {
            get
            {
                var d = Buffs.DecoyBuff;
                return d != null && d.DecoyHp > 0 && d.SummonMap == Map?.Data.Id ? d : null;
            }
        }

        private static Rect DecoyBox(ActiveBuff d) => new Rect(d.SummonX - 16, d.SummonY - 50, d.SummonX + 16, d.SummonY);

        /// <summary>敵が見る相手。操った敵は近くの敵、人形の近くの敵は人形（追ってくる）、ほかは主人公。</summary>
        private PlayerSense SenseFor(Mob m, PlayerSense player, ActiveBuff decoy)
        {
            if (!m.Alive) return player;
            if (m.Charmed)
            {
                var t = CharmTarget(m);
                if (t == null) return new PlayerSense { X = m.X, Y = m.Y, Hidden = true };
                m.AggroT = Math.Max(m.AggroT, 1);
                return new PlayerSense { X = t.X, Y = t.Y, Chain = t.Seg?.Chain };
            }
            if (decoy != null && !player.Hidden && Math.Abs(m.X - decoy.SummonX) <= DecoyRange && Math.Abs(m.Y - decoy.SummonY) <= 300)
            {
                m.AggroT = Math.Max(m.AggroT, 1);
                var seg = Map.Physics.SegBelow(decoy.SummonX, decoy.SummonY - 2);
                return new PlayerSense { X = decoy.SummonX, Y = decoy.SummonY, Chain = seg?.Chain };
            }
            return player;
        }

        private void TouchDecoy(Mob m, ActiveBuff d)
        {
            if (m.AttackCooldown > 0 || !m.Box.Overlaps(DecoyBox(d))) return;
            m.AttackCooldown = DecoyHitInterval;
            HitDecoy(d, m.Atk);
        }

        private void HitDecoy(ActiveBuff d, int atk)
        {
            if (d.DecoyHp <= 0) return;
            int dmg = Math.Max(1, atk);
            d.DecoyHp -= dmg;
            Out.Add(GameEventType.Mechanic, "decoy_hit", dmg, d.SummonX, d.SummonY - 50);
            if (d.DecoyHp > 0) return;
            d.DecoyHp = 0;
            Buffs.Remove(d.Id);
            Out.Add(GameEventType.Mechanic, "decoy_broken", 0, d.SummonX, d.SummonY - 50, "身代わり人形が壊れた");
            Out.Add(GameEventType.BuffEnded, d.Id);
        }

        // ---------------- 錯乱弾で操った敵

        /// <summary>錯乱がかかった: 構えをやめ、主人公を追うのをやめる。</summary>
        private void OnCharmed(Mob m)
        {
            foreach (var h in Map.Hazards) if (h.MobUid == m.Uid && !h.Fired) h.Done = true;
            m.Casting = null;
            m.Hidden = m.Submerged;
            m.AggroT = 0;
        }

        private Mob CharmTarget(Mob m)
        {
            Mob best = null; double bd = CharmRange;
            foreach (var o in Map.Mobs)
            {
                if (o == m || !o.Alive || o.Hidden || o.Charmed) continue;
                double d = Math.Abs(o.X - m.X);
                if (d <= bd && Math.Abs(o.Y - m.Y) <= 120) { bd = d; best = o; }
            }
            return best;
        }

        /// <summary>操った敵の体当たり（触れている敵に、1 秒ごと）。倒した分の経験値は主人公に入る。</summary>
        private void StepCharmed(Mob m)
        {
            if (m.AttackCooldown > 0 || !m.Status.CanMove) return;
            var t = CharmTarget(m);
            if (t == null) return;
            var reach = new Rect(m.Box.X1 - 10, m.Box.Y1, m.Box.X2 + 10, m.Box.Y2);
            if (!reach.Overlaps(t.Box)) return;
            m.AttackCooldown = CharmHitInterval;
            int dmg = Math.Max(1, (int)Math.Floor(m.Atk * Rng.Range(0.85, 1.0) - t.Defender.Def * 0.5));
            DamageMob(t, new HitResult { Damage = dmg });
        }

        // ---------------- 敵の強化（崩す・反射）

        /// <summary>鎧崩し（def）・魔法崩し（magic）・力崩し（atk）・解除（all）。</summary>
        private void DispelMob(Mob mob, string what, string skillId)
        {
            var removed = mob.Buffs.Dispel(what ?? "all");
            foreach (var k in removed)
                Out.Add(GameEventType.MobDispelled, MobBuffs.Keys[(int)k], mob.Uid, mob.X, mob.HeadY, MobBuffs.Names[(int)k]);
            Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "dispel");
        }

        /// <summary>敵の反射（物理・魔法）: 与えたダメージの % が主人公に返る（1 回で最大 HP の ReflectCapPct% まで・HP 1 で止まる）。</summary>
        private void ReflectFromMob(Mob mob, int dealt, bool magic)
        {
            double pct = mob.Buffs.Pct(magic ? MobBuffKind.MagicReflect : MobBuffKind.Reflect);
            if (pct <= 0 || dealt <= 0 || Dead) return;
            int dmg = Math.Max(1, (int)Math.Floor(Math.Min(dealt * pct / 100, Stats.MaxHp * ReflectCapPct / 100)));
            Character.Hp = Math.Max(1, Character.Hp - dmg);
            Out.Damage.Add(new DamageNumber { Kind = DamageKind.Taken, Value = dmg, X = Body.X, Y = Body.Y - PlayerBody.Height });
            Out.Add(GameEventType.Hurt, "reflect", dmg, Body.X, Body.Y);
        }

        /// <summary>MP 吸収: 敵の最大 MP の pct% を吸う（敵の MP が減る。無くなったら吸えない）。</summary>
        private void DrainMobMp(Mob mob, double pct)
        {
            int amount = Math.Min(mob.CurMp, (int)Math.Floor(mob.Def.Mp * pct / 100));
            if (amount <= 0) return;
            mob.Mp = mob.CurMp - amount;
            HealMp(amount);
        }

        // ---------------- 毒の霧

        private void AddZone(SkillDef def, int x, Rect box, int maxTargets)
        {
            Zones.Add(new PlayerZone { SkillId = def.Id, Level = x, Box = box, Remaining = def.Zone, Total = def.Zone, MaxTargets = Math.Max(1, maxTargets) });
            Out.Add(GameEventType.Mechanic, "zone_start", (long)def.Zone, box.CenterX, box.Y2, def.Name);
        }

        /// <summary>置いた霧の中の敵に、1 秒ごとにスキルの状態異常をかけ直す（新しく入ってきた敵にも）。</summary>
        private void TickZones(double dt)
        {
            for (int i = Zones.Count - 1; i >= 0; i--)
            {
                var z = Zones[i];
                z.Remaining -= dt;
                z.TickT += dt;
                if (z.TickT >= 1 - 1e-9)
                {
                    z.TickT -= 1;
                    var def = Data.Skill(z.SkillId);
                    if (def != null && def.Status.Count > 0)
                    {
                        var alive = new List<Mob>();
                        foreach (var m in Map.Mobs) if (m.Alive && !m.Hidden && !m.Charmed) alive.Add(m);
                        foreach (var m in Targeting.Pick(alive, mb => mb.Box, z.Box, z.Box.CenterX, Body.Facing, z.MaxTargets))
                            foreach (var st in def.Status) TryInflict(m, st.Eval(z.Level, Character.Level, def.Id));
                    }
                }
                if (z.Remaining <= 1e-9) Zones.RemoveAt(i);
            }
        }

        // ---------------- 乗船

        /// <summary>乗船中に攻撃を受けた: 船の HP が減る。0 で降りる。</summary>
        private void OnShipHit(int damage)
        {
            var ship = Buffs.ShipBuff;
            if (ship == null || ship.ShipMaxHp <= 0 || damage <= 0) return;
            ship.ShipHp -= damage;
            if (ship.ShipHp > 0) return;
            ship.ShipHp = 0;
            Buffs.Remove(ship.Id);
            Out.Add(GameEventType.Mechanic, "ship_broken", 0, Body.X, Body.Y, "船が壊れて降りた");
            Out.Add(GameEventType.BuffEnded, ship.Id);
            RefreshStats();
        }

        // ---------------- 秘術の扉

        /// <summary>扉の前で ↑: 町の扉なら使った場所へ、使った場所の扉なら町へ。入ったら true。</summary>
        private bool TryUseDoor()
        {
            var d = Door;
            if (d == null) return false;
            string to; double tx, ty;
            if (Map.Data.Id == d.TownMap && Math.Abs(Body.X - d.TownX) <= DoorReach && Math.Abs(Body.Y - d.TownY) <= 40) { to = d.FieldMap; tx = d.FieldX; ty = d.FieldY; }
            else if (Map.Data.Id == d.FieldMap && Math.Abs(Body.X - d.FieldX) <= DoorReach && Math.Abs(Body.Y - d.FieldY) <= 40) { to = d.TownMap; tx = d.TownX; ty = d.TownY; }
            else return false;
            Out.Add(GameEventType.Mechanic, "door_used", 0, Body.X, Body.Y, "秘術の扉");
            ChangeMap(to);
            PlayerPhysics.PlaceOnGround(Body, Map.Physics, tx, ty);
            PrevX = Body.X; PrevY = Body.Y;
            return true;
        }

        // ---------------- ボスの仕掛け（主人公の側）

        /// <summary>時の裂け目の上で調べるキー: 時のかけらをはめる。はめたら true。</summary>
        private bool TryFillRift() => !Dead && BossMechanics.TryFill(Map, Body.X, Body.Y, Out);

        /// <summary>ツタ: 敵の方へ dist px 引き寄せる（敵の手前 40 px まで）。</summary>
        private void PullPlayer(Mob owner, double dist)
        {
            double gap = owner.X - Body.X;
            double d = Math.Min(dist, Math.Max(0, Math.Abs(gap) - 40));
            if (d <= 0) return;
            PlayerPhysics.Shove(Body, Map.Physics, Math.Sign(gap) * d);
            Out.Add(GameEventType.Mechanic, "pulled", owner.Uid, Body.X, Body.Y, "引き寄せられた");
        }

        /// <summary>渦潮: 予兆の間、まわり SuckW/2 の中にいれば中心へ吸い込まれる。</summary>
        private void SuckPlayer(MobHazard h, double dt)
        {
            if (Dead || Body.OnRope) return;
            double gap = h.Box.CenterX - Body.X;
            if (Math.Abs(gap) > h.SuckW / 2 || Math.Abs(Body.Y - h.Box.Y2) > 220) return;
            double step = Math.Min(Math.Abs(gap), h.SuckSpeed * dt);
            if (step > 0) PlayerPhysics.Shove(Body, Map.Physics, Math.Sign(gap) * step);
        }
    }
}
