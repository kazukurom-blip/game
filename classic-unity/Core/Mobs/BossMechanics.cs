// ボスの仕掛け（MONSTERS.md 5 章）。データは monsters.json の boss（元は classic/tools/data/mob_skills.mjs）。
//
//   分身（雲の魔女。段階の clones）      その段階に入ると本物と同じ姿の分身を count 体。分身は影が無い（mob.HasShadow = false）・
//                                       HP は本物の最大 HP の hpPct%・攻撃力は半分・呼び出し/回復/強化の技は使わない。
//                                       shuffle 秒ごとに本物と分身の場所が入れ替わる。本物が倒れると分身も消える。
//   深く潜って回復（深淵の大魚。段階の submerge）  その段階に入ると sec 秒潜る（Hidden・当たらない・技を使わない）。
//                                       その間、最大 HP の healPct% を少しずつ治す。まわりに光る岩を rocks 個（HP は最大 HP の rockHpPct%）。
//                                       岩を全部壊すと回復が止まって出てくる。時間が来ても出てくる（残った岩は消える）。
//   時の裂け目（時計塔の魔物。boss.rifts）  phase の段階の間、床に count 個の裂け目。本体の受けるダメージ × guard。
//                                       部屋に時計虫（mob）が出て、倒すと「時のかけら」を 1 つ持つ（map.Rifts.Shards）。
//                                       裂け目の上で調べるキー（GameSession.TryFillRift）ではめる。limit 秒で全部はめないと元に戻る。
//                                       全部はめると expose 秒無防備（ダメージがふつうに通る）。その後また開く。次の段階に入ると終わる。
// 当たる所の仕掛け（ツタの引き寄せ・渦潮の吸い込み・盾の陰）は技のデータ（pull / suck / shelter）で、GameSession.Status.cs が見る。
using System;
using System.Collections.Generic;
using Lumina.Core.Game;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Mobs
{
    public static class BossMechanics
    {
        public const double CloneOffset = 160;   // 分身を出す時の本物からの距離（px）
        public const double CloneAtkScale = 0.5; // 分身の攻撃力の倍率（似）

        private static readonly Dictionary<string, MobDef> rockDefs = new Dictionary<string, MobDef>();

        /// <summary>光る岩の定義（ボスごとに 1 つ作って使い回す）。動かない・触れても痛くない・倒しても何も落とさない。</summary>
        public static MobDef RockDef(MobDef boss, double hpPct)
        {
            string key = boss.Id + "/" + hpPct.ToString(System.Globalization.CultureInfo.InvariantCulture);
            lock (rockDefs)
            {
                if (rockDefs.TryGetValue(key, out var d)) return d;
                d = new MobDef
                {
                    Id = boss.Id + ".rock", Name = "光る岩", Kind = "object", Lv = boss.Lv, Move = MobMove.Stand, Touch = false,
                    Hp = Math.Max(1, (int)Math.Floor(boss.Hp * hpPct / 100)), Def = boss.Def / 2, Mdef = boss.Mdef / 2,
                    Width = 50, Height = 50, Pushed = 0, NoKnockback = true, Speed = 0, MesoChance = 0,
                };
                rockDefs[key] = d;
                return d;
            }
        }

        /// <summary>本物のボスの 1 フレーム（MobCombat.Step から。段階を決めた後）。</summary>
        public static void Step(Mob boss, MapInstance map, double dt, IRandom rng, EventQueue events)
        {
            var b = boss.Def.Boss;
            if (b == null || boss.CloneOf != 0) return;
            var ph = boss.PhaseDef;
            if (ph != null && ph.CloneCount > 0 && boss.ClonePhase != boss.Phase) SpawnClones(boss, map, ph, events);
            if (ph != null && ph.SubmergeSec > 0 && boss.SubmergePhase != boss.Phase) Submerge(boss, map, ph, events);
            if (boss.ClonePhase >= 0) StepClones(boss, map, dt, rng, events);
            if (boss.Submerged) StepSubmerge(boss, map, dt, events);
            if (b.Rifts != null) StepRifts(boss, map, b.Rifts, dt, events);
        }

        // ---------------- 分身

        private static void SpawnClones(Mob boss, MapInstance map, BossPhaseDef ph, EventQueue events)
        {
            boss.ClonePhase = boss.Phase;
            boss.ShuffleT = ph.CloneShuffle;
            int hp = Math.Max(1, (int)Math.Floor(boss.MaxHp * ph.CloneHpPct / 100));
            for (int i = 0; i < ph.CloneCount; i++)
            {
                double off = CloneOffset * (1 + i / 2) * (i % 2 == 0 ? 1 : -1);
                double x = Math.Max(30, Math.Min(map.Data.Width - 30, boss.X + off));
                var c = map.Spawn(boss.Def.Id, x, boss.Y);
                if (c == null) continue;
                c.CloneOf = boss.Uid; c.OwnerUid = boss.Uid; c.Mechanic = true; c.MechanicKind = "clone";
                c.MaxHpOverride = hp; c.Hp = hp; c.AtkScale = CloneAtkScale;
                c.PhaseStarted = true; c.Phase = boss.Phase; c.AggroT = Mob.AggroTime;
                c.SkillCd = null;
            }
            events?.Add(GameEventType.Mechanic, "clones", boss.Uid, boss.X, boss.HeadY, "分身");
        }

        private static void StepClones(Mob boss, MapInstance map, double dt, IRandom rng, EventQueue events)
        {
            var clones = new List<Mob>();
            foreach (var m in map.Mobs) if (m.Alive && m.CloneOf == boss.Uid) { m.Phase = boss.Phase; clones.Add(m); }
            if (clones.Count == 0) return;
            var ph = boss.PhaseDef;
            if (ph == null || ph.CloneShuffle <= 0) return;
            boss.ShuffleT -= dt;
            if (boss.ShuffleT > 0) return;
            boss.ShuffleT = ph.CloneShuffle;
            // 本物と分身の場所を入れ替える（並べ替えは乱数。近接・潜る技を構えている物はその場に残る）
            var all = new List<Mob> { boss };
            all.AddRange(clones);
            var pos = new List<(double x, double y)>();
            foreach (var m in all) pos.Add((m.X, m.Y));
            int shift = 1 + (int)Math.Floor(rng.NextDouble() * (all.Count - 1));
            for (int i = 0; i < all.Count; i++)
            {
                var p = pos[(i + shift) % all.Count];
                var c = all[i].Casting;
                if (c != null && (c.Type == MobSkillType.Melee || c.Type == MobSkillType.Dive)) continue;
                MobCombat.Teleport(all[i], map, p.x, p.y);
            }
            events?.Add(GameEventType.Mechanic, "shuffle", boss.Uid, boss.X, boss.HeadY, "入れ替わった");
        }

        // ---------------- 深く潜って回復・光る岩

        private static void Submerge(Mob boss, MapInstance map, BossPhaseDef ph, EventQueue events)
        {
            boss.SubmergePhase = boss.Phase;
            boss.Submerged = true; boss.Hidden = true;
            boss.SubmergeT = boss.SubmergeTotal = ph.SubmergeSec;
            boss.HealAcc = 0;
            foreach (var h in map.Hazards) if (h.MobUid == boss.Uid && !h.Fired) h.Done = true;
            boss.Casting = null;
            var def = RockDef(boss.Def, ph.RockHpPct);
            int n = Math.Max(0, ph.Rocks);
            for (int i = 0; i < n; i++)
            {
                double x = map.Data.Width * (i + 1) / (n + 1.0);
                var r = map.SpawnDef(def, x, boss.Y);
                r.OwnerUid = boss.Uid; r.Mechanic = true; r.MechanicKind = "rock";
            }
            events?.Add(GameEventType.Mechanic, "submerge", boss.Uid, boss.X, boss.HeadY, ph.Name);
        }

        private static void StepSubmerge(Mob boss, MapInstance map, double dt, EventQueue events)
        {
            var ph = boss.PhaseDef;
            int rocks = map.CountMechanics(boss.Uid, "rock");
            boss.SubmergeT -= dt;
            // 岩が残っている間だけ治す（sec 秒で healPct%）
            if (rocks > 0 && ph != null && boss.SubmergeTotal > 0)
            {
                boss.HealAcc += boss.MaxHp * ph.SubmergeHealPct / 100 * dt / boss.SubmergeTotal;
                int add = (int)Math.Floor(boss.HealAcc);
                if (add > 0) { boss.HealAcc -= add; boss.Hp = Math.Min(boss.MaxHp, boss.Hp + add); }
            }
            if (rocks == 0 || boss.SubmergeT <= 0) Surface(boss, map, events);
        }

        public static void Surface(Mob boss, MapInstance map, EventQueue events)
        {
            boss.Submerged = false; boss.Hidden = false; boss.SubmergeT = 0;
            foreach (var m in map.Mobs) if (m.Mechanic && m.OwnerUid == boss.Uid && m.MechanicKind == "rock" && m.Alive) m.Removed = true;
            events?.Add(GameEventType.Mechanic, "surface", boss.Uid, boss.X, boss.HeadY, "出てきた");
        }

        // ---------------- 時の裂け目

        private static void StepRifts(Mob boss, MapInstance map, RiftDef def, double dt, EventQueue events)
        {
            var st = map.Rifts;
            if (boss.Phase != def.Phase)
            {
                if (st != null && st.BossUid == boss.Uid) { map.Rifts = null; boss.GuardMul = 1; }
                return;
            }
            if (st == null || st.BossUid != boss.Uid)
            {
                st = map.Rifts = new RiftState { BossUid = boss.Uid, Def = def, TimeLeft = def.Limit };
                for (int i = 0; i < def.Count; i++)
                {
                    double x = map.Data.Width * (i + 1) / (def.Count + 1.0);
                    var seg = map.Physics.SegBelow(x, boss.Y - 4) ?? map.Physics.SegBelow(x, -1e9);
                    st.Spots.Add(new RiftSpot { Index = i, X = x, Y = seg != null ? seg.YAt(x) : boss.Y });
                }
                SpawnShardMobs(boss, map, st);
                events?.Add(GameEventType.Mechanic, "rift_open", boss.Uid, boss.X, boss.HeadY, "時の裂け目");
            }
            if (st.Exposed)
            {
                st.ExposeLeft -= dt;
                if (st.ExposeLeft <= 0)
                {
                    st.ExposeLeft = 0;
                    ResetRifts(boss, map, st);
                    events?.Add(GameEventType.Mechanic, "rift_guarded", boss.Uid, boss.X, boss.HeadY, "時の裂け目がまた開いた");
                }
            }
            else
            {
                st.TimeLeft -= dt;
                if (st.TimeLeft <= 0)
                {
                    ResetRifts(boss, map, st);
                    events?.Add(GameEventType.Mechanic, "rift_reset", boss.Uid, boss.X, boss.HeadY, "時の裂け目が元に戻った");
                }
            }
            boss.GuardMul = st.Exposed ? 1 : def.Guard;
        }

        private static void ResetRifts(Mob boss, MapInstance map, RiftState st)
        {
            foreach (var s in st.Spots) s.Filled = false;
            st.TimeLeft = st.Def.Limit;
            SpawnShardMobs(boss, map, st);
        }

        /// <summary>はめるのに足りない分だけ時計虫を出す（持っているかけら・生きている時計虫も数える）。</summary>
        private static void SpawnShardMobs(Mob boss, MapInstance map, RiftState st)
        {
            if (string.IsNullOrEmpty(st.Def.Mob)) return;
            int need = st.Spots.Count - st.FilledCount - st.Shards - map.CountMechanics(boss.Uid, "shard");
            for (int i = 0; i < need; i++)
            {
                var spot = st.Spots[i % st.Spots.Count];
                var m = map.Spawn(st.Def.Mob, spot.X, spot.Y - 40);
                if (m == null) return;
                m.OwnerUid = boss.Uid; m.Mechanic = true; m.MechanicKind = "shard"; m.AggroT = Mob.AggroTime;
            }
        }

        /// <summary>裂け目にかけらをはめる（主人公の足元 x, y の近くの、はめていない裂け目）。はめたら true。</summary>
        public static bool TryFill(MapInstance map, double x, double y, EventQueue events)
        {
            var st = map.Rifts;
            if (st == null || st.Exposed || st.Shards <= 0) return false;
            foreach (var s in st.Spots)
            {
                if (s.Filled || Math.Abs(s.X - x) > s.W / 2 + 16 || Math.Abs(s.Y - y) > 60) continue;
                s.Filled = true; st.Shards--;
                events?.Add(GameEventType.Mechanic, "rift_filled", s.Index, s.X, s.Y, "時のかけらをはめた（" + st.FilledCount + "/" + st.Spots.Count + "）");
                if (st.FilledCount >= st.Spots.Count)
                {
                    st.ExposeLeft = st.Def.Expose;
                    var boss = map.FindMob(st.BossUid);
                    if (boss != null) boss.GuardMul = 1;
                    events?.Add(GameEventType.Mechanic, "rift_exposed", st.BossUid, s.X, s.Y, "時計が止まって無防備になった");
                }
                return true;
            }
            return false;
        }

        /// <summary>仕掛けの物が倒れた（時計虫 → 時のかけらを 1 つ持つ）。</summary>
        public static void OnKilled(Mob m, MapInstance map, EventQueue events)
        {
            if (m.MechanicKind == "shard" && map.Rifts != null && map.Rifts.BossUid == m.OwnerUid)
            {
                map.Rifts.Shards++;
                events?.Add(GameEventType.Mechanic, "shard_got", m.OwnerUid, m.X, m.HeadY, "時のかけらを手に入れた");
            }
            else if (m.MechanicKind == "rock")
                events?.Add(GameEventType.Mechanic, "rock_broken", m.OwnerUid, m.X, m.HeadY, "光る岩を壊した");
        }

        /// <summary>ボスがいなくなった後の片付け（分身・光る岩・時計虫・時の裂け目）。毎フレーム GameSession から。</summary>
        public static void Cleanup(MapInstance map)
        {
            if (map.Rifts != null)
            {
                var b = map.FindMob(map.Rifts.BossUid);
                if (b == null || !b.Alive) map.Rifts = null;
            }
            foreach (var m in map.Mobs)
            {
                if (!m.Mechanic || m.OwnerUid == 0 || !m.Alive) continue;
                var owner = map.FindMob(m.OwnerUid);
                if (owner != null && owner.Alive) continue;
                if (m.MechanicKind == "clone") MobAI.Kill(m); // 本物が倒れたら分身も消える
                else if (m.MechanicKind == "rock") m.Removed = true;
            }
        }
    }
}
