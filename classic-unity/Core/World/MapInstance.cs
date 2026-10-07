// 今いるマップの中身: 物理の形・敵・落ちている物・敵の飛び道具・湧き直し。
// 湧き直し（WORLD.md 2 章）: 湧く所ごとに 1 体、最大数まで。倒された分は 7 秒ごとに補充。強敵は決まった時間ごと。
// ドロップ（FEEL.md 9 章・ITEMS.md 5 章）: 倒れた位置から上へ約 40 px 跳ねて落ちる。複数は左右に 25 px おき（中央→右→左→右…）、0.05 秒ずつずらす。2 分で消える。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Util;

namespace Lumina.Core.World
{
    public sealed class DropItem
    {
        public const double BounceHeight = 40, Spacing = 25, Stagger = 0.05, Lifetime = 120, BobAmp = 3, BobPeriod = 1.2;
        public int Uid;
        public string ItemId;          // null ならお金
        public int Count = 1;
        public long Meso;
        public ItemInstance Equip;     // 装備（値のぶれ込み）
        public double X, Y, GroundY, Vy;
        public double Delay, Age;
        public bool Landed, Visible, PickedUp;
        public int MesoTier => Meso <= 0 ? 0 : Meso < 50 ? 1 : Meso < 100 ? 2 : Meso < 1000 ? 3 : 4; // 4 段階の絵（ブロンズ・シルバー・ゴールド・束）

        /// <summary>地面で上下に小さく揺れる分（描く時に足す）</summary>
        public double BobOffset => Landed ? Math.Sin(Age * 2 * Math.PI / BobPeriod) * BobAmp : 0;
        public bool IsMeso => ItemId == null;
    }

    public sealed class MobProjectile
    {
        public double X, Y, Vx, Life;
        public int Atk, MobLv, MobAcc; public bool Magic;
        public double FromX;
        public bool Dead;
        public Rect Box => new Rect(X - 8, Y - 8, X + 8, Y + 8);
    }

    public sealed class MapInstance
    {
        public readonly MapData Data;
        public readonly PhysicsMap Physics;
        public readonly List<Mob> Mobs = new List<Mob>();
        public readonly List<DropItem> Drops = new List<DropItem>();
        public readonly List<MobProjectile> Projectiles = new List<MobProjectile>();
        private readonly GameData data;
        private int nextUid = 1;
        private double respawnT;
        private readonly double[] timedT;
        private readonly int[] timedUid;

        public MapInstance(MapData md, GameData data)
        {
            Data = md;
            this.data = data;
            Physics = md.BuildPhysics();
            timedT = new double[md.TimedSpawns.Count];
            timedUid = new int[md.TimedSpawns.Count];
        }

        public int NewUid() => nextUid++;

        /// <summary>入った時: 湧く所を全部うめる。時間で湧く強敵も最初は出ている。</summary>
        public void InitialSpawn(IRandom rng)
        {
            FillSpawns(rng);
            for (int i = 0; i < Data.TimedSpawns.Count; i++) SpawnTimed(i);
        }

        /// <summary>しばらく離れていたマップに戻った: 倒された分を補充する（敵の HP・落ちている物はそのまま）。</summary>
        public void OnReenter(IRandom rng)
        {
            Mobs.RemoveAll(m => m.Removed || m.State == MobState.Die);
            Projectiles.Clear();
            foreach (var m in Mobs) { m.AggroT = 0; m.StunT = 0; m.KnockT = 0; if (m.State == MobState.Hit) m.State = MobState.Stand; }
            FillSpawns(rng);
            respawnT = 0;
        }

        public Mob Spawn(string mobId, double x, double y, int spawnIndex = -1)
        {
            var def = data.Mob(mobId);
            if (def == null) return null;
            var m = new Mob { Uid = NewUid(), Def = def, Hp = def.Hp, SpawnIndex = spawnIndex };
            MobAI.Place(m, Physics, x, y);
            m.StateDur = 1 + (m.Uid % 3) * 0.5;
            Mobs.Add(m);
            return m;
        }

        private void SpawnTimed(int i)
        {
            var t = Data.TimedSpawns[i];
            var m = Spawn(t.Mob, t.X, t.Y);
            if (m != null) { m.Timed = true; timedUid[i] = m.Uid; }
            timedT[i] = 0;
        }

        public int AliveCount
        {
            get { int n = 0; foreach (var m in Mobs) if (m.Alive && !m.Timed) n++; return n; }
        }

        private void FillSpawns(IRandom rng)
        {
            int max = Data.MobMax > 0 ? Data.MobMax : Data.Spawns.Count;
            var used = new HashSet<int>();
            foreach (var m in Mobs) if (!m.Removed && m.SpawnIndex >= 0) used.Add(m.SpawnIndex);
            int alive = AliveCount;
            for (int i = 0; i < Data.Spawns.Count && alive < max; i++)
            {
                if (used.Contains(i)) continue;
                var s = Data.Spawns[i];
                if (Spawn(s.Mob, s.X, s.Y, i) != null) alive++;
            }
        }

        /// <summary>湧き直しとドロップの時間を進める（敵の動きは GameSession が主人公の位置と一緒に進める）。</summary>
        public void StepWorld(double dt, IRandom rng)
        {
            Mobs.RemoveAll(m => m.Removed);
            respawnT += dt;
            if (respawnT >= Data.RespawnSec - 1e-9)
            {
                respawnT = 0;
                FillSpawns(rng);
            }
            for (int i = 0; i < timedT.Length; i++)
            {
                bool alive = Mobs.Exists(m => m.Uid == timedUid[i] && !m.Removed);
                if (alive) continue;
                timedT[i] += dt;
                if (timedT[i] >= Data.TimedSpawns[i].IntervalSec - 1e-9) SpawnTimed(i);
            }
            for (int i = Drops.Count - 1; i >= 0; i--)
            {
                var d = Drops[i];
                if (d.PickedUp) { Drops.RemoveAt(i); continue; }
                if (d.Delay > 0) { d.Delay -= dt; if (d.Delay > 0) continue; d.Visible = true; }
                d.Visible = true;
                d.Age += dt;
                if (!d.Landed)
                {
                    double nv = d.Vy + Feel.Gravity * dt;
                    d.Y += (d.Vy + nv) / 2 * dt;
                    d.Vy = nv;
                    if (d.Vy > 0 && d.Y >= d.GroundY) { d.Y = d.GroundY; d.Landed = true; d.Vy = 0; }
                }
                if (d.Age >= DropItem.Lifetime) Drops.RemoveAt(i);
            }
            foreach (var p in Projectiles)
            {
                p.X += p.Vx * dt;
                p.Life -= dt;
                if (p.Life <= 0 || p.X < 0 || p.X > Data.Width) p.Dead = true;
            }
            Projectiles.RemoveAll(p => p.Dead);
        }

        /// <summary>倒れた敵の位置から物を落とす（何番目かで左右と時間をずらす）。</summary>
        public void SpawnDrops(double x, double y, List<DropItem> items)
        {
            for (int i = 0; i < items.Count; i++)
            {
                var d = items[i];
                // 中央 → 右 → 左 → 右 → 左 …
                int k = (i + 1) / 2;
                double off = i == 0 ? 0 : (i % 2 == 1 ? k : -k) * DropItem.Spacing;
                d.Uid = NewUid();
                d.X = Math.Max(10, Math.Min(Data.Width - 10, x + off));
                d.Y = y;
                var s = Physics.SegBelow(d.X, y - 30) ?? Physics.SegBelow(d.X, -1e9);
                d.GroundY = s != null ? s.YAt(d.X) : y;
                d.Vy = -Math.Sqrt(2 * Feel.Gravity * DropItem.BounceHeight);
                d.Delay = i * DropItem.Stagger;
                d.Visible = i == 0;
                Drops.Add(d);
            }
        }

        /// <summary>主人公の足元 (x, y) で拾える物（地面に落ちた物の中で一番近い物）。</summary>
        public DropItem DropAt(double x, double y)
        {
            DropItem best = null; double bd = double.PositiveInfinity;
            foreach (var d in Drops)
            {
                if (!d.Landed || d.PickedUp) continue;
                double dx = Math.Abs(d.X - x), dy = Math.Abs(d.Y - y);
                if (dx > 24 || dy > 40) continue;
                if (dx < bd) { bd = dx; best = d; }
            }
            return best;
        }

        public MapObjectData ObjectAt(double x, double y)
        {
            foreach (var o in Data.Objects) if (Math.Abs(o.X - x) <= 32 && Math.Abs(o.Y - y) <= 48) return o;
            return null;
        }

        public NpcData Npc(string id)
        {
            foreach (var n in Data.Npcs) if (n.Id == id) return n;
            return null;
        }

        public Mob FindMob(int uid) => Mobs.Find(m => m.Uid == uid);
    }
}
