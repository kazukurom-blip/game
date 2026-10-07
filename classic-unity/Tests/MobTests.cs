// 敵（MONSTERS.md・FEEL.md 9 章）: 数値・歩き回り・端で向きを変える・追う・跳ねる・飛ぶ・触れるとダメージ・ふっとび・倒れる・湧き直し・ドロップ。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Util;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class MobTests
    {
        private static PhysicsMap Platform()
        {
            var m = new PhysicsMap(2000, 800);
            m.AddChain("g", true, 0, 600, 2000, 600);
            m.AddChain("p", false, 600, 500, 900, 500);
            m.AddWall(1500, 500, 600);
            return m;
        }

        private static Mob Make(string id, PhysicsMap map, double x, double y)
        {
            var m = new Mob { Uid = 1, Def = TestData.Get().Mob(id) };
            m.Hp = m.Def.Hp;
            MobAI.Place(m, map, x, y);
            m.StateDur = 1;
            return m;
        }

        private static PlayerSense Far => new PlayerSense { X = -10000, Y = -10000 };

        [Fact]
        public void IslandMonstersMatchMonstersMd()
        {
            var d = TestData.Get();
            var expect = new (string id, int hp, int exp, int atk, int def, int avoid, int meso)[]
            {
                ("M001", 8, 3, 6, 0, 1, 4), ("M002", 13, 4, 7, 1, 1, 5), ("M003", 20, 6, 8, 1, 1, 6), ("M004", 28, 8, 10, 1, 2, 7),
                ("M005", 55, 13, 14, 2, 2, 11), ("M006", 88, 19, 17, 4, 3, 17), ("M007", 1400, 224, 31, 10, 5, 150),
            };
            foreach (var e in expect)
            {
                var m = d.Mob(e.id);
                Assert.True(m.Hp == e.hp && m.Exp == e.exp && m.Atk == e.atk && m.Def == e.def && m.Avoid == e.avoid && m.Meso == e.meso, e.id);
            }
            Assert.Equal(170, d.Mobs.Count);
            Assert.Equal(1.5, d.Mob("M003").ElementMul("fire"));
            Assert.Equal(MobMove.Crawl, d.Mob("M001").Move);
            Assert.Equal(MobMove.Jump, d.Mob("M005").Move);
            Assert.Equal(MobMove.Fly, d.Mob("M011").Move);
            Assert.True(d.Mob("M007").IsElite);
        }

        [Fact]
        public void WanderStopsAndTurnsAtEdgesNeverFalls()
        {
            var map = Platform();
            var m = Make("M004", map, 750, 500); // 浮いた足場の上
            var rng = new Rng(1);
            double minX = 1e9, maxX = -1e9;
            int moving = 0, standing = 0, turns = 0, lastFacing = m.Facing;
            for (int i = 0; i < 60 * 120; i++)
            {
                MobAI.Step(m, map, Far, Feel.Dt, rng);
                Assert.Equal(500, m.Y); // 足場から落ちない
                minX = Math.Min(minX, m.X); maxX = Math.Max(maxX, m.X);
                if (m.State == MobState.Move) moving++; else standing++;
                if (m.Facing != lastFacing) { turns++; lastFacing = m.Facing; }
            }
            Assert.True(minX >= 600 && maxX <= 900);
            Assert.True(moving > 60 * 20 && standing > 60 * 20, $"歩く {moving} / 止まる {standing}");
            Assert.True(turns > 5);
            // 壁でも向きを変える
            var w = Make("M004", map, 1450, 600);
            w.State = MobState.Move; w.Facing = 1; w.StateDur = 100;
            for (int i = 0; i < 60 * 5; i++) MobAI.Step(w, map, Far, Feel.Dt, rng);
            Assert.True(w.X + w.Def.Width / 2 <= 1500 + 1e-6);
        }

        [Fact]
        public void ChasesWhenHitThenGivesUpAfter5Seconds()
        {
            var map = Platform();
            var m = Make("M004", map, 300, 600);
            var rng = new Rng(2);
            var player = new PlayerSense { X = 500, Y = 600, Chain = map.Chains[0] };
            MobAI.OnHit(m, 0, 500);
            for (int i = 0; i < 18; i++) MobAI.Step(m, map, player, Feel.Dt, rng); // ひるみ 0.3 秒
            double x0 = m.X;
            for (int i = 0; i < 60; i++) MobAI.Step(m, map, player, Feel.Dt, rng);
            Assert.True(m.X > x0 + 30, "主人公の方へ歩く");
            Assert.Equal(1, m.Facing);
            for (int i = 0; i < 60 * 5; i++) MobAI.Step(m, map, player, Feel.Dt, rng);
            Assert.True(m.AggroT <= 0);
        }

        [Fact]
        public void LevelTwentyWalkersApproachOnSight()
        {
            var map = Platform();
            var m = Make("M044", map, 300, 600); // イノシシ Lv25（歩）
            Assert.True(m.Def.ChaseOnSight);
            var player = new PlayerSense { X = 600, Y = 600, Chain = map.Chains[0] };
            for (int i = 0; i < 60; i++) MobAI.Step(m, map, player, Feel.Dt, new Rng(3));
            Assert.True(m.X > 340);
            Assert.False(Make("M004", map, 0, 0).Def.ChaseOnSight); // 這う敵は寄ってこない
        }

        [Fact]
        public void KnockbackOnlyWhenDamageReachesPushed()
        {
            var map = Platform();
            var rng = new Rng(4);
            var m = Make("M006", map, 300, 600);
            int pushed = m.Def.Pushed;
            MobAI.OnHit(m, pushed - 1, 250);
            for (int i = 0; i < 15; i++) MobAI.Step(m, map, Far, Feel.Dt, rng);
            Assert.Equal(300, m.X, 6);
            MobAI.OnHit(m, pushed, 250);
            Assert.Equal(MobState.Hit, m.State);
            for (int i = 0; i < 18; i++) MobAI.Step(m, map, Far, Feel.Dt, rng);
            Assert.InRange(m.X - 300, 12, 18); // 約 15 px 後ろへ
        }

        [Fact]
        public void DiesAndFadesIn06Seconds()
        {
            var map = Platform();
            var m = Make("M001", map, 300, 600);
            MobAI.Kill(m);
            Assert.False(m.Alive);
            for (int i = 0; i < 35; i++) MobAI.Step(m, map, Far, Feel.Dt, new Rng(1));
            Assert.False(m.Removed);
            Assert.InRange(m.FadeOut, 0.9, 1);
            for (int i = 0; i < 2; i++) MobAI.Step(m, map, Far, Feel.Dt, new Rng(1));
            Assert.True(m.Removed);
        }

        [Fact]
        public void JumpersHopAndFlyersFloat()
        {
            var map = Platform();
            var rng = new Rng(5);
            var j = Make("M005", map, 300, 600);
            double maxHop = 0;
            for (int i = 0; i < 60 * 20; i++) { MobAI.Step(j, map, Far, Feel.Dt, rng); maxHop = Math.Max(maxHop, j.HopY); Assert.True(j.HopY >= 0); }
            Assert.InRange(maxHop, 30, 40);
            var f = Make("M011", map, 1000, 300);
            double minY = 1e9, maxY = -1e9;
            for (int i = 0; i < 60 * 30; i++)
            {
                MobAI.Step(f, map, Far, Feel.Dt, rng);
                Assert.InRange(f.X, 1000 - 160, 1000 + 160);
                minY = Math.Min(minY, f.Y); maxY = Math.Max(maxY, f.Y);
            }
            Assert.True(maxY - minY > 20); // 上下に漂う
        }

        // ---------------- GameSession の中で

        private static GameSession Field(GameData d = null)
        {
            d ??= TestData.Fresh();
            if (d.GetMap("T_FIELD") == null)
                d.AddMap(MapData.FromJson("{\"id\":\"T_FIELD\",\"name\":\"試しの原\",\"region\":\"S\",\"type\":\"狩\",\"width\":2000,\"height\":800,"
                    + "\"footholds\":[{\"id\":\"g\",\"ground\":true,\"points\":[[0,600],[2000,600]]}],"
                    + "\"portals\":[{\"name\":\"sp\",\"type\":\"spawn\",\"x\":100,\"y\":600}],"
                    + "\"spawns\":[{\"mob\":\"M001\",\"x\":400,\"y\":600},{\"mob\":\"M001\",\"x\":700,\"y\":600},{\"mob\":\"M002\",\"x\":1000,\"y\":600},{\"mob\":\"M002\",\"x\":1300,\"y\":600},{\"mob\":\"M001\",\"x\":1600,\"y\":600}],"
                    + "\"mobMax\":4,\"respawnSec\":7,\"timedSpawns\":[{\"mob\":\"M007\",\"x\":1800,\"y\":600,\"intervalSec\":600}],\"returnMap\":\"S003\"}"));
            var s = GameSession.NewGame(d, "試し", 11);
            s.ChangeMap("T_FIELD");
            return s;
        }

        [Fact]
        public void RespawnFillsUpToMaxEvery7Seconds()
        {
            var s = Field();
            var normal = s.Map.Mobs.Where(m => !m.Timed).ToList();
            Assert.Equal(4, normal.Count); // 最大 4
            Assert.Single(s.Map.Mobs.Where(m => m.Timed));
            foreach (var m in normal) MobAI.Kill(m);
            s.Step(new PlayerInput(), 60);
            Assert.Equal(0, s.Map.AliveCount);
            s.Step(new PlayerInput(), 60 * 6);
            Assert.Equal(4, s.Map.AliveCount); // 7 秒で補充
            s.Step(new PlayerInput(), 60 * 30);
            Assert.True(s.Map.AliveCount <= 4);
            // 強敵: 倒すと 600 秒後に出る
            var elite = s.Map.Mobs.First(m => m.Timed);
            MobAI.Kill(elite);
            s.Step(new PlayerInput(), 60 * 2);
            Assert.DoesNotContain(s.Map.Mobs, m => m.Timed && m.Alive);
            s.Step(new PlayerInput(), 60 * 599);
            Assert.Contains(s.Map.Mobs, m => m.Timed && m.Alive);
        }

        [Fact]
        public void TouchHurtsKnocksBackAndGivesInvincibility()
        {
            var s = Field();
            s.Map.Mobs.Clear();
            var m = s.Map.Spawn("M004", s.Body.X + 10, s.Body.Y);
            s.Stats.Avoid = 0;
            s.Character.Dex = 0; s.Character.Luk = 0; // 避けない
            int hp = s.Character.Hp;
            s.Step(new PlayerInput(), 1);
            Assert.True(s.Character.Hp < hp, "触れるとダメージ");
            Assert.Contains(s.Out.Damage, d => d.Kind == DamageKind.Taken);
            Assert.True(s.Body.Vx < 0 && s.Body.InvT > 1.4); // 敵と反対へふっとび、無敵
            int hp2 = s.Character.Hp;
            s.Step(new PlayerInput(), 60);
            Assert.Equal(hp2, s.Character.Hp); // 無敵の間は当たらない
        }

        [Fact]
        public void KillGivesExpAndDropsThatCanBePickedUp()
        {
            var s = Field();
            s.Map.Mobs.Clear();
            var m = s.Map.Spawn("M002", s.Body.X + 40, s.Body.Y);
            s.Body.Facing = 1;
            long exp0 = s.Character.Exp;
            for (int i = 0; i < 60 * 20 && m.Alive; i++) s.Step(new PlayerInput { Attack = true });
            Assert.False(m.Alive);
            Assert.True(s.Character.Exp > exp0 || s.Character.Level > 1);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.MobDied);
            // 決まった乱数でドロップを作って並び方を確かめる
            var drops = new List<DropItem> { new DropItem { Meso = 10 }, new DropItem { ItemId = "etc.M002" }, new DropItem { ItemId = "use.red_potion" }, new DropItem { ItemId = "use.blue_potion" } };
            s.Map.Drops.Clear();
            s.Map.SpawnDrops(500, 600, drops);
            Assert.Equal(new double[] { 500, 525, 475, 550 }, drops.Select(d => d.X).ToArray()); // 中央 → 右 → 左 → 右
            Assert.Equal(new[] { 0, 0.05, 0.10, 0.15 }, drops.Select(d => Math.Round(d.Delay, 2)).ToArray());
            double top = 600;
            for (int i = 0; i < 60; i++) { s.Map.StepWorld(Feel.Dt, s.Rng); top = Math.Min(top, drops[0].Y); }
            Assert.InRange(600 - top, 38, 41); // 約 40 px 跳ねる
            Assert.True(drops.All(d => d.Landed && d.Y == 600));
            s.Teleport(500, 600);
            long meso = s.Inventory.Meso;
            s.Step(new PlayerInput { Pickup = true }, 1);
            Assert.Equal(meso + 10, s.Inventory.Meso);
            s.Teleport(525, 600);
            s.Step(new PlayerInput { Pickup = true }, 7); // 拾うのは 0.1 秒に 1 つ
            Assert.Equal(1, s.Inventory.Count("etc.M002"));
            // 2 分で消える
            s.Step(new PlayerInput(), 60 * 121);
            Assert.Empty(s.Map.Drops);
        }

        [Fact]
        public void DropRatesFollowItemsMd()
        {
            var d = TestData.Get();
            var def = d.Mob("M001");
            var rng = new Rng(77);
            int n = 20000, meso = 0, etc = 0, red = 0;
            for (int i = 0; i < n; i++)
            {
                foreach (var x in DropRoller.Roll(def, d, rng))
                {
                    if (x.IsMeso) { meso++; Assert.InRange(x.Meso, 2, 6); }
                    else if (x.ItemId == "etc.M001") etc++;
                    else if (x.ItemId == "use.red_potion") red++;
                }
            }
            Assert.InRange(meso / (double)n, 0.58, 0.62);
            Assert.InRange(etc / (double)n, 0.53, 0.57);
            Assert.InRange(red / (double)n, 0.03, 0.05);
            // 強敵は Lv 帯の装備を 30% で落とす
            int eq = 0;
            for (int i = 0; i < 2000; i++) eq += DropRoller.Roll(d.Mob("M007"), d, rng).Count(x => x.Equip != null && x.ItemId != "eq.unique.M007");
            Assert.InRange(eq / 2000.0, 0.26, 0.34);
        }

        [Fact]
        public void ExpFromMuchLowerMobsIsReduced()
        {
            var s = Field();
            s.Character.Level = 50; s.Character.Exp = 0;
            s.Map.Mobs.Clear();
            var m = s.Map.Spawn("M006", s.Body.X + 40, s.Body.Y); // Lv8: 差 42 → 1 - 0.05×22 → 最低 10%
            s.Out.Clear();
            s.DamageMob(m, new HitResult { Damage = 100000 });
            var e = s.Out.Events.First(x => x.Type == GameEventType.ExpGained);
            Assert.Equal((long)Math.Round(19 * 0.1), e.Value);
        }
    }
}
