// 敵の技（MONSTERS.md 2・5 章）: 技を選ぶ → 構え・予兆（windup 秒）→ 撃つ・当たる。ボスの段階の切り替え。
//
//   近接 melee  構えてから前（back なら後ろ）の四角に当たる
//   飛び道具 shot  構えてから真っすぐ飛ぶ（count 本を上下に広げる）
//   魔法 magic  主人公の足元に予兆 → windup 秒後に当たる（count 個を spread px おき、linger 秒残る）
//   全体 area   敵のまわり、または画面全体（global）。地面にいる時だけ（groundOnly）・高い所は安全（safeHeight）
//   呼び出し summon / 回復 heal / 潜る・急降下 dive（消えて、主人公の所に予兆 → 出てきて当たる）
//   強化 buff   自分（allies なら w 幅の中の仲間も）に攻撃・防御・魔防・速さ・反射の強化（Mobs/MobBuffs.cs）
// ボスの仕掛け（分身・潜って回復・時の裂け目）は BossMechanics.cs。
//
// 当たる判定（主人公のダメージ・状態異常）は GameSession（GameSession.Status.cs）が MapInstance.Hazards と Projectiles を見て行う。
// 乱数は使える技がある時だけ引く（技の無い敵では乱数の並びが変わらない）。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Mobs
{
    public static class MobCombat
    {
        public const double SkillGap = 1.0;        // 技と技の間（秒）
        public const double BossSight = 900;       // ボスの全体技・呼び出しを使う距離
        public const double ShotRangeY = 60, MagicRangeY = 260, DiveRangeY = 400;

        /// <summary>1 フレーム: 待ち時間・段階・構え。player は主人公の位置（Hidden なら技を始めない）。</summary>
        public static void Step(Mob m, MapInstance map, PlayerSense player, bool playerOnGround, double dt, IRandom rng, EventQueue events)
        {
            if (!m.Alive) return;
            var skills = m.Def.Attacks;
            if (m.SkillCd == null || m.SkillCd.Length != skills.Count)
            {
                m.SkillCd = new double[skills.Count];
                for (int i = 0; i < skills.Count; i++) m.SkillCd[i] = m.Def.Boss != null ? skills[i].Cooldown * 0.3 : 0; // ボスは入ってすぐ大技を撃たない
            }
            double rate = m.PhaseDef?.Rate ?? 1;
            for (int i = 0; i < m.SkillCd.Length; i++) if (m.SkillCd[i] > 0) m.SkillCd[i] -= dt * rate;
            if (m.SkillGap > 0) m.SkillGap -= dt;
            if (m.Buffs.Any)
            {
                var ended = new List<MobBuffKind>(0);
                m.Buffs.Tick(dt, ended);
                foreach (var k in ended) events?.Add(GameEventType.MobBuffEnded, MobBuffs.Keys[(int)k], m.Uid, m.X, m.HeadY, MobBuffs.Names[(int)k]);
            }
            if (m.CloneOf == 0)
            {
                UpdatePhase(m, map, events);
                if (m.Def.Boss != null) BossMechanics.Step(m, map, dt, rng, events);
            }

            if (m.Casting != null)
            {
                // 気絶・凍結・眠りで止められた: 構えは消える（予兆も消す）
                if (!m.Status.CanAct)
                {
                    CancelCast(m, map);
                    return;
                }
                m.CastT -= dt;
                if (m.CastT <= 0) Fire(m, map, events);
                return;
            }
            if (skills.Count == 0 || !m.Status.CanUseSkill || player.Hidden || m.State == MobState.Hit || m.SkillGap > 0 || m.Submerged) return;

            bool boss = m.Def.Boss != null;
            bool engaged = boss || m.AggroT > 0 || m.Def.ChaseOnSight || m.Def.Move == MobMove.Stand;
            if (!engaged) return;
            double dx = player.X - m.X, dy = player.Y - m.Y;
            double total = 0;
            var ready = new List<int>(2);
            for (int i = 0; i < skills.Count; i++)
            {
                var s = skills[i];
                if (m.SkillCd[i] > 0 || !s.InPhase(m.Phase) || !CanUse(m, map, s, dx, dy)) continue;
                ready.Add(i); total += Math.Max(0.0001, s.Weight);
            }
            if (ready.Count == 0) return;
            int pick = ready[0];
            if (ready.Count > 1)
            {
                double r = rng.NextDouble() * total;
                foreach (var i in ready) { r -= Math.Max(0.0001, skills[i].Weight); if (r < 0) { pick = i; break; } }
            }
            StartCast(m, map, pick, player, events);
        }

        private static bool CanUse(Mob m, MapInstance map, MobSkillDef s, double dx, double dy)
        {
            double adx = Math.Abs(dx), ady = Math.Abs(dy);
            switch (s.Type)
            {
                case MobSkillType.Melee:
                    if (adx > s.Range || ady > Math.Max(60, s.H)) return false;
                    // 前の技は前に、後ろの技は後ろにいる時（向きは構えで主人公の方へ変える。後ろは今の向きのまま）
                    return !s.Back || Math.Sign(dx) == -m.Facing;
                case MobSkillType.Shot: return adx <= s.Range && ady <= ShotRangeY;
                case MobSkillType.Magic: return adx <= s.Range && ady <= MagicRangeY;
                case MobSkillType.Dive: return adx <= s.Range && ady <= DiveRangeY;
                case MobSkillType.Area: return s.Global ? adx <= BossSight : adx <= Math.Max(s.W / 2 + 40, s.SuckW / 2) && ady <= 200; // 渦潮は吸い込む広さで
                case MobSkillType.Summon:
                    if (m.CloneOf != 0) return false;
                    return adx <= BossSight && s.Mobs.Count > 0 && map.SummonCount(m.Uid) < s.Max;
                case MobSkillType.Heal: return m.CloneOf == 0 && m.Hp < m.MaxHp;
                case MobSkillType.Buff:
                {
                    // まだかかっていない強化がある時だけ（分身は使わない）
                    if (m.CloneOf != 0 || s.Buff == null || adx > s.Range) return false;
                    for (int i = 0; i < MobBuffs.KindCount; i++) if (s.Buff.Pct[i] > 0 && !m.Buffs.Has((MobBuffKind)i)) return true;
                    return false;
                }
                default: return false;
            }
        }

        private static void StartCast(Mob m, MapInstance map, int index, PlayerSense player, EventQueue events)
        {
            var s = m.Def.Attacks[index];
            m.SkillCd[index] = s.Cooldown;
            m.SkillGap = SkillGap;
            m.Casting = s;
            m.CastT = m.CastTotal = Math.Max(0.01, s.Windup);
            m.CastX = player.X; m.CastY = player.Y;
            if (m.State == MobState.Move) m.State = MobState.Stand;
            if (!s.Back) m.Facing = player.X >= m.X ? 1 : -1;
            int atk = s.Magic ? m.Matk : m.Atk;
            int dmg = (int)Math.Round(atk * s.Pct / 100.0);
            switch (s.Type)
            {
                case MobSkillType.Melee:
                {
                    int dir = s.Back ? -m.Facing : m.Facing;
                    var box = dir > 0 ? new Rect(m.X, m.Y - s.H, m.X + s.W, m.Y) : new Rect(m.X - s.W, m.Y - s.H, m.X, m.Y);
                    AddHazard(m, map, s, HazardKind.Melee, box, dmg);
                    break;
                }
                case MobSkillType.Magic:
                    for (int i = 0; i < Math.Max(1, s.Count); i++)
                    {
                        double x = player.X + (i - (s.Count - 1) / 2.0) * s.Spread;
                        x = Math.Max(0, Math.Min(map.Data.Width, x));
                        AddHazard(m, map, s, HazardKind.Magic, new Rect(x - s.W / 2, player.Y - s.H, x + s.W / 2, player.Y + 4), dmg);
                    }
                    break;
                case MobSkillType.Area:
                {
                    var box = s.Global ? new Rect(-1e5, -1e5, 1e5, 1e5) : new Rect(m.X - s.W / 2, m.Y - 200, m.X + s.W / 2, m.Y + 20);
                    var h = AddHazard(m, map, s, HazardKind.Area, box, dmg);
                    h.Global = s.Global; h.GroundOnly = s.GroundOnly;
                    if (s.SafeHeight > 0) h.SafeAboveY = m.Y - s.SafeHeight;
                    if (s.ShelterAt != null)
                    {
                        // 盾の陰: マップの横幅の割合の位置に w 幅（上下は全部）
                        h.SafeZones = new List<Rect>();
                        foreach (var at in s.ShelterAt)
                        {
                            double cx = map.Data.Width * at;
                            h.SafeZones.Add(new Rect(cx - s.ShelterW / 2, -1e5, cx + s.ShelterW / 2, 1e5));
                        }
                    }
                    break;
                }
                case MobSkillType.Dive:
                    m.Hidden = true;
                    AddHazard(m, map, s, HazardKind.Dive, new Rect(player.X - s.W / 2, player.Y - s.H, player.X + s.W / 2, player.Y + 4), dmg);
                    break;
            }
            events?.Add(GameEventType.MobCast, s.Id, m.Uid, m.CastX, m.CastY, s.Name);
        }

        private static MobHazard AddHazard(Mob m, MapInstance map, MobSkillDef s, HazardKind kind, Rect box, int dmg)
        {
            var h = new MobHazard
            {
                Uid = map.NewUid(), MobUid = m.Uid, MobId = m.Def.Id, SkillId = s.Id, Name = s.Name, Kind = kind, Box = box,
                Warn = m.CastTotal, WarnTotal = m.CastTotal, Linger = s.Linger,
                Atk = dmg, MobLv = m.Def.Lv, MobAcc = m.Acc, Magic = s.Magic, FromX = m.X, Status = s.Status,
                Pull = s.Pull, SuckW = s.SuckW, SuckSpeed = s.SuckSpeed,
            };
            map.Hazards.Add(h);
            return h;
        }

        private static void CancelCast(Mob m, MapInstance map)
        {
            foreach (var h in map.Hazards) if (h.MobUid == m.Uid && !h.Fired) h.Done = true;
            m.Casting = null;
            m.Hidden = m.Submerged;
        }

        /// <summary>構えが終わった: 撃つ・呼ぶ・治す・出てくる（近接・魔法・全体は予兆が同じ時に当たる）。</summary>
        private static void Fire(Mob m, MapInstance map, EventQueue events)
        {
            var s = m.Casting;
            m.Casting = null;
            switch (s.Type)
            {
                case MobSkillType.Shot:
                {
                    int n = Math.Max(1, s.Count);
                    int atk = s.Magic ? m.Matk : m.Atk;
                    for (int i = 0; i < n; i++)
                    {
                        double spread = n > 1 ? (i - (n - 1) / 2.0) * (s.Spread > 0 ? s.Spread : 30) : 0;
                        map.Projectiles.Add(new MobProjectile
                        {
                            X = m.X + m.Facing * m.Def.Width / 2, Y = m.Y - m.Def.Height / 2 + spread * 0.5, Vx = m.Facing * s.Speed, Vy = spread * 0.5,
                            Life = s.Life, Atk = Math.Max(1, (int)Math.Round(atk * s.Pct / 100.0)), MobLv = m.Def.Lv, MobAcc = m.Acc, Magic = s.Magic,
                            FromX = m.X, MobUid = m.Uid, SkillId = s.Id, Status = s.Status,
                        });
                    }
                    break;
                }
                case MobSkillType.Summon:
                {
                    int room = s.Max - map.SummonCount(m.Uid);
                    Summon(m, map, s.Mobs, Math.Min(Math.Max(1, s.Count), room), events);
                    break;
                }
                case MobSkillType.Heal:
                {
                    int before = m.Hp;
                    m.Hp = Math.Min(m.MaxHp, m.Hp + Math.Max(1, (int)Math.Floor(m.MaxHp * s.Pct / 100.0)));
                    events?.Add(GameEventType.Healed, m.Def.Id, m.Hp - before, m.X, m.HeadY, s.Name);
                    break;
                }
                case MobSkillType.Dive:
                {
                    m.Hidden = false;
                    Teleport(m, map, m.CastX, m.CastY);
                    break;
                }
                case MobSkillType.Buff:
                {
                    ApplyBuff(m, s, events);
                    if (s.Allies)
                        foreach (var o in map.Mobs)
                            if (o != m && o.Alive && !o.Mechanic && !o.Charmed && Math.Abs(o.X - m.X) <= s.W / 2 && Math.Abs(o.Y - m.Y) <= 200) ApplyBuff(o, s, events);
                    break;
                }
            }
        }

        private static void ApplyBuff(Mob m, MobSkillDef s, EventQueue events)
        {
            var kinds = new List<MobBuffKind>(2);
            m.Buffs.Apply(s.Buff, kinds);
            foreach (var k in kinds) events?.Add(GameEventType.MobBuffed, MobBuffs.Keys[(int)k], m.Uid, m.X, m.HeadY, s.Name);
        }

        /// <summary>手下を count 体呼ぶ（mobs を順に、ボスの左右に並べる）。呼んだ数。</summary>
        public static int Summon(Mob boss, MapInstance map, List<string> mobs, int count, EventQueue events)
        {
            int n = 0;
            for (int i = 0; i < count && mobs.Count > 0; i++)
            {
                double off = (40 + 45 * (i / 2)) * (i % 2 == 0 ? 1 : -1);
                double x = Math.Max(20, Math.Min(map.Data.Width - 20, boss.X + off));
                var c = map.Spawn(mobs[i % mobs.Count], x, boss.Y);
                if (c == null) continue;
                c.SummonerUid = boss.Uid;
                c.AggroT = Mob.AggroTime; // 呼ばれた手下はすぐ向かってくる
                n++;
                events?.Add(GameEventType.MobSummoned, c.Def.Id, c.Uid, c.X, c.Y, c.Def.Name);
            }
            return n;
        }

        /// <summary>(x, y) の近くへ移る（歩く敵はその下の足場へ、飛ぶ敵はそのまま）。</summary>
        public static void Teleport(Mob m, MapInstance map, double x, double y)
        {
            x = Math.Max(m.Def.Width / 2, Math.Min(map.Data.Width - m.Def.Width / 2, x));
            if (m.Def.Move == MobMove.Fly) { m.X = x; m.HomeY = y - 30; m.Y = m.HomeY; return; }
            var seg = map.Physics.SegBelow(x, y - 4);
            if (seg == null) return;
            m.X = x; m.Seg = seg; m.Y = seg.YAt(x);
        }

        /// <summary>ボスの段階: HP の割合が次の段階の値以下になったら進む（戻らない）。</summary>
        public static void UpdatePhase(Mob m, MapInstance map, EventQueue events)
        {
            var b = m.Def.Boss;
            if (b == null) return;
            if (!m.PhaseStarted)
            {
                m.PhaseStarted = true;
                EnterPhase(m, map, 0, events);
            }
            double ratio = m.MaxHp > 0 ? (double)m.Hp / m.MaxHp : 0;
            int target = m.Phase;
            for (int i = m.Phase + 1; i < b.Phases.Count; i++) if (ratio <= b.Phases[i].Hp + 1e-12) target = i;
            if (target != m.Phase)
            {
                if (m.Casting != null) CancelCast(m, map);
                for (int i = m.Phase + 1; i <= target; i++) EnterPhase(m, map, i, events);
            }
        }

        private static void EnterPhase(Mob m, MapInstance map, int index, EventQueue events)
        {
            m.Phase = index;
            var ph = m.Def.Boss.Phases[index];
            events?.Add(GameEventType.BossPhase, m.Def.Id, index, m.X, m.HeadY, ph.Name);
            if (ph.HealPct > 0)
            {
                int before = m.Hp;
                m.Hp = Math.Min(m.MaxHp, m.Hp + (int)Math.Floor(m.MaxHp * ph.HealPct / 100));
                events?.Add(GameEventType.Healed, m.Def.Id, m.Hp - before, m.X, m.HeadY, ph.Name);
            }
            if (ph.SummonMobs.Count > 0 && ph.SummonCount > 0) Summon(m, map, ph.SummonMobs, ph.SummonCount, events);
        }
    }
}
