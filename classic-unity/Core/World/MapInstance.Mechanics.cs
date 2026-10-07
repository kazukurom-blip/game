// ボスの仕掛けのうち、マップに置く物（MONSTERS.md 5 章）。動かすのは Mobs/BossMechanics.cs。
//   時の裂け目（時計塔の魔物）: map.Rifts（裂け目の位置・はめたか・残り時間・無防備の残り・持っている時のかけら）
//   光る岩（深淵の大魚）・分身（雲の魔女）・時計虫（時のかけらを落とす）は敵（Mob）として Mobs に入る（mob.Mechanic = true、MechanicKind で区別）
using System;
using System.Collections.Generic;
using Lumina.Core.Mobs;

namespace Lumina.Core.World
{
    /// <summary>時の裂け目 1 つ（床の上。X は真ん中、Y は足場の高さ）。</summary>
    public sealed class RiftSpot
    {
        public int Index;
        public double X, Y, W = 64;
        public bool Filled;                // 時のかけらをはめた
    }

    /// <summary>時の裂け目の今の状態（Unity 側はこれで裂け目・残り時間のバーを描く）。</summary>
    public sealed class RiftState
    {
        public int BossUid;
        public RiftDef Def;
        public readonly List<RiftSpot> Spots = new List<RiftSpot>();
        public double TimeLeft;            // 全部はめるまでの残り（0 で元に戻る）
        public double ExposeLeft;          // 無防備の残り（0 = 守られている）
        public int Shards;                 // 主人公が持っている時のかけら（このボスの間の中だけ）

        public bool Exposed => ExposeLeft > 0;
        public int FilledCount { get { int n = 0; foreach (var s in Spots) if (s.Filled) n++; return n; } }
        /// <summary>残り時間の割合（1 → 0）。無防備の間は無防備の残り</summary>
        public double Progress => Exposed ? (Def.Expose > 0 ? ExposeLeft / Def.Expose : 0) : (Def.Limit > 0 ? Math.Max(0, TimeLeft / Def.Limit) : 0);
    }

    public sealed partial class MapInstance
    {
        /// <summary>時の裂け目（無ければ null）。</summary>
        public RiftState Rifts;

        /// <summary>データに無い敵（光る岩など、その場で作った定義）を出す。</summary>
        public Mob SpawnDef(MobDef def, double x, double y)
        {
            var m = new Mob { Uid = NewUid(), Def = def, Hp = def.Hp };
            MobAI.Place(m, Physics, x, y);
            m.StateDur = 1;
            Mobs.Add(m);
            return m;
        }

        /// <summary>このボスの仕掛けの物（"clone" / "rock" / "shard"）で生きている数。</summary>
        public int CountMechanics(int ownerUid, string kind)
        {
            int n = 0;
            foreach (var m in Mobs) if (m.Alive && m.Mechanic && m.OwnerUid == ownerUid && m.MechanicKind == kind) n++;
            return n;
        }
    }
}
