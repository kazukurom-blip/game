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
        public double X, Y, Vx, Vy, Life;
        public int Atk, MobLv, MobAcc; public bool Magic;
        public double FromX;
        public bool Dead;
        public int MobUid;              // 撃った敵
        public string SkillId;          // 技の ID（絵の選び方: Unity 側は敵の ID と技の ID で選ぶ）
        public StatusInflict Status;    // 当たった時の状態異常
        public double Size = 8;         // 当たりの半分の大きさ
        public Rect Box => new Rect(X - Size, Y - Size, X + Size, Y + Size);
    }

    public enum HazardKind { Melee, Magic, Area, Dive }

    /// <summary>
    /// 敵の技の当たる所（MONSTERS.md 2 章「足元に予兆を出してから当たる」）。
    /// 出てから Warn 秒は予兆だけ（Unity 側は Box に予兆の絵を出す。Progress が 0→1）。Warn が 0 になった瞬間に当たる。
    /// Linger &gt; 0 なら、その後もその場に残って、中にいる間は状態異常をかけ続ける（毒の沼など）。
    /// </summary>
    public sealed class MobHazard
    {
        public int Uid, MobUid;
        public string MobId, SkillId, Name;
        public HazardKind Kind;
        public Rect Box;                // 当たる四角（Global なら画面全体）
        public bool Global, GroundOnly;
        public double SafeAboveY = double.NaN; // この y より上（小さい）に足元があれば当たらない
        public double Warn, WarnTotal;  // 予兆の残り・全体
        public double Linger, LingerT;  // 残る時間・残りの時間
        public double TickT;
        public bool Fired, Done;
        public int Atk, MobLv, MobAcc; public bool Magic; public double FromX;
        public StatusInflict Status;
        public double Pull;             // 当たったら主人公を敵の方へ引き寄せる（px。ツタ）
        public double SuckW, SuckSpeed; // 予兆の間、中心から SuckW/2 の中の主人公を中心へ吸い込む（px/秒。渦潮）。Unity 側は渦の大きさに使う
        public List<Rect> SafeZones;    // この中（盾の陰）にいれば当たらない（全滅の炎）。Unity 側は盾の絵を出す
        /// <summary>予兆を描くか（近接は構えの絵だけで、地面の印は出さない）</summary>
        public bool ShowWarning => Kind != HazardKind.Melee;
        public double Progress => WarnTotal > 0 ? Math.Min(1, Math.Max(0, 1 - Warn / WarnTotal)) : 1;
    }

    /// <summary>ボスの HP バーに出す値（MONSTERS.md 5 章「段階ごとに色が変わる」）。</summary>
    public struct BossBarInfo
    {
        public int Uid;
        public string MobId, Name;
        public int Level;
        public long Hp, MaxHp;
        public double Ratio;            // 全体の HP の割合（0〜1）
        public int Phase, PhaseCount;   // 今の段階（0〜）と段階の数。色は Phase で変える
        public string PhaseName;
        public double PhaseTop, PhaseBottom; // 今の段階の HP の範囲（割合）
        public double PhaseRatio;       // 段階の中での残り（1→0）。段階ごとのバーに使う
        public int StatusIcons;         // かかっている状態異常のビット
        public bool Casting; public string CastName; public double CastProgress; // 大技の詠唱のバー
        public int BuffIcons;           // かかっている強化のビット（1 << (int)MobBuffKind）
        public bool Guarded;            // ダメージがほとんど通らない（時の裂け目が閉じていない）
        public bool Submerged; public double SubmergeProgress; public int RocksLeft; // 深く潜っている（0→1）・残りの光る岩
        public int Clones;              // 生きている分身の数
    }

    public sealed partial class MapInstance
    {
        public readonly MapData Data;
        public readonly PhysicsMap Physics;
        public readonly List<Mob> Mobs = new List<Mob>();
        public readonly List<DropItem> Drops = new List<DropItem>();
        public readonly List<MobProjectile> Projectiles = new List<MobProjectile>();
        public readonly List<MobHazard> Hazards = new List<MobHazard>();
        private readonly GameData data;
        private int nextUid = 1;
        private double respawnT;
        private readonly double[] timedT;
        private readonly int[] timedUid;

        /// <summary>クエスト専用の敵（SpawnData.Quest）を湧かせてよいか。GameSession が「そのクエストを進めている」で答える。null なら湧かない</summary>
        public Func<string, bool> QuestActive;
        /// <summary>敵が湧いた時（珍しい色違いの個体を決める。GameSession.Fun.cs）。null なら何もしない</summary>
        public Action<Mob> OnSpawned;

        private bool TimedAllowed(int i)
        {
            var q = Data.TimedSpawns[i].Quest;
            return q == null || QuestActive != null && QuestActive(q);
        }

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
            for (int i = 0; i < Data.TimedSpawns.Count; i++) if (TimedAllowed(i)) SpawnTimed(i);
        }

        /// <summary>しばらく離れていたマップに戻った: 倒された分を補充する（敵の HP・落ちている物はそのまま）。</summary>
        public void OnReenter(IRandom rng)
        {
            Mobs.RemoveAll(m => m.Removed || m.State == MobState.Die);
            Projectiles.Clear();
            Hazards.Clear();
            foreach (var m in Mobs)
            {
                m.AggroT = 0; m.StunT = 0; m.KnockT = 0; if (m.State == MobState.Hit) m.State = MobState.Stand;
                m.Casting = null; m.Hidden = m.Submerged;
            }
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
            OnSpawned?.Invoke(m);
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
            get { int n = 0; foreach (var m in Mobs) if (m.Alive && !m.Timed && !m.Summoned && !m.Mechanic) n++; return n; }
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
                if (!TimedAllowed(i))
                {
                    // クエスト専用の敵: クエストを進めていない時は出ない（終えた・やめた時は消える）
                    if (alive) foreach (var m in Mobs) if (m.Uid == timedUid[i]) m.Removed = true;
                    timedT[i] = 0;
                    continue;
                }
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
                p.Y += p.Vy * dt;
                p.Life -= dt;
                if (p.Life <= 0 || p.X < 0 || p.X > Data.Width) p.Dead = true;
            }
            Projectiles.RemoveAll(p => p.Dead);
            Hazards.RemoveAll(h => h.Done);
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

        /// <summary>このボスが呼んだ手下で生きている数。</summary>
        public int SummonCount(int bossUid) { int n = 0; foreach (var m in Mobs) if (m.Alive && m.SummonerUid == bossUid) n++; return n; }

        /// <summary>ボスの HP バー（生きているボス・大ボス・ダンジョンの主の 1 体目。いなければ null）。</summary>
        public BossBarInfo? BossBar
        {
            get
            {
                Mob b = null;
                foreach (var m in Mobs)
                {
                    if (!m.Alive || m.Def.Boss == null || m.CloneOf != 0) continue; // 分身は出さない
                    if (b == null || (m.Def.IsBoss && !b.Def.IsBoss)) b = m;
                }
                if (b == null) return null;
                var phases = b.Def.Boss.Phases;
                int ph = Math.Min(b.Phase, phases.Count - 1);
                double top = phases[ph].Hp, bottom = ph + 1 < phases.Count ? phases[ph + 1].Hp : 0;
                double ratio = b.MaxHp > 0 ? Math.Max(0, (double)b.Hp / b.MaxHp) : 0;
                return new BossBarInfo
                {
                    Uid = b.Uid, MobId = b.Def.Id, Name = b.Def.Name, Level = b.Def.Lv, Hp = b.Hp, MaxHp = b.MaxHp, Ratio = ratio,
                    Phase = ph, PhaseCount = phases.Count, PhaseName = phases[ph].Name, PhaseTop = top, PhaseBottom = bottom,
                    PhaseRatio = top - bottom > 1e-9 ? Math.Max(0, Math.Min(1, (ratio - bottom) / (top - bottom))) : 0,
                    StatusIcons = b.StatusIcons,
                    Casting = b.Casting != null, CastName = b.Casting?.Name, CastProgress = b.Casting != null && b.CastTotal > 0 ? 1 - b.CastT / b.CastTotal : 0,
                    BuffIcons = b.BuffIcons, Guarded = b.GuardMul < 1,
                    Submerged = b.Submerged, SubmergeProgress = b.Submerged && b.SubmergeTotal > 0 ? Math.Min(1, 1 - b.SubmergeT / b.SubmergeTotal) : 0,
                    RocksLeft = CountMechanics(b.Uid, "rock"), Clones = CountMechanics(b.Uid, "clone"),
                };
            }
        }
    }
}
