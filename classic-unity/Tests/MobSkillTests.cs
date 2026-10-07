// 敵の速さ・敵の技（近接・飛び道具・足元に予兆の魔法・全体・潜る）・状態異常つきの攻撃・ボスの段階・呼び出し・HP バー。
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Status;
using Lumina.Core.Util;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class MobSkillTests
    {
        private static MobDef Def(string id, string attacks, string extra = "")
            => MobDef.FromDict(Json.ParseObject(
                "{\"id\":\"" + id + "\",\"name\":\"" + id + "\",\"lv\":30,\"kind\":\"normal\",\"move\":\"stand\",\"touch\":false,\"hp\":10000,\"exp\":1,"
                + "\"atk\":100,\"matk\":100,\"def\":0,\"avoid\":0,\"acc\":9999,\"meso\":0,\"width\":40,\"height\":50,\"pushed\":0,\"speed\":0,"
                + "\"attacks\":[" + attacks + "]" + extra + "}"));

        private static (GameSession s, Mob m) With(string id, string attacks, double dx, string extra = "")
        {
            var d = StatusTests.Ground();
            d.Mobs[id] = Def(id, attacks, extra);
            var s = StatusTests.Session(d);
            var m = s.Map.Spawn(id, s.Body.X + dx, s.Body.Y);
            return (s, m);
        }

        private static List<GameEvent> Run(GameSession s, PlayerInput inp, int frames, List<DamageNumber> nums = null)
        {
            var log = new List<GameEvent>();
            for (int i = 0; i < frames; i++) { s.Out.Clear(); s.Step(inp); log.AddRange(s.Out.Events); nums?.AddRange(s.Out.Damage); }
            return log;
        }

        // ---------------- 速さ

        [Fact]
        public void EveryMonsterHasClassicSpeedAndMovesAtIt()
        {
            var d = TestData.Get();
            foreach (var m in d.Mobs.Values)
            {
                Assert.InRange(m.SpeedStat, -50, 50);
                Assert.Equal(m.Move == MobMove.Stand ? 0 : 100 + m.SpeedStat, m.Speed);
            }
            Assert.Equal(-50, d.Mob("M001").SpeedStat);
            Assert.True(d.Mob("M044").Speed > d.Mob("M078").Speed); // イノシシはゴーレムより速い

            // MONSTERS.md の表の「速さ」の列と同じ
            var md = File.ReadAllText(Path.Combine(TestPaths.Root, "..", "classic", "docs", "MONSTERS.md"));
            int rows = 0;
            foreach (Match r in Regex.Matches(md, @"^\| (M\d{3}) \|(?:[^|]*\|){11} ([-+]?\d+|-) \|", RegexOptions.Multiline))
            {
                var m = d.Mob(r.Groups[1].Value);
                Assert.Equal(m.Move == MobMove.Stand ? "-" : (m.SpeedStat > 0 ? "+" : "") + m.SpeedStat, r.Groups[2].Value);
                rows++;
            }
            Assert.True(rows >= 160, "表の行 " + rows);

            // 追う時の速さ: コロ貝は 1 秒で 50 px
            var map = new PhysicsMap(2000, 800);
            map.AddChain("g", true, 0, 600, 2000, 600);
            var mob = new Mob { Uid = 1, Def = d.Mob("M001") }; mob.Hp = mob.Def.Hp;
            MobAI.Place(mob, map, 500, 600);
            mob.AggroT = 10;
            var sense = new PlayerSense { X = 1500, Y = 600, Chain = mob.Seg.Chain };
            var rng = new Rng(1);
            for (int i = 0; i < 60; i++) MobAI.Step(mob, map, sense, Feel.Dt, rng);
            Assert.Equal(550, mob.X, 3);
        }

        [Fact]
        public void JumpersHopWhileMovingAndNotWhenWeak()
        {
            var d = TestData.Get();
            var map = new PhysicsMap(2000, 800);
            map.AddChain("g", true, 0, 600, 2000, 600);
            var m = new Mob { Uid = 1, Def = d.Mob("M005") }; m.Hp = m.Def.Hp;
            MobAI.Place(m, map, 500, 600);
            m.AggroT = 100;
            var sense = new PlayerSense { X = 1500, Y = 600, Chain = m.Seg.Chain };
            var rng = new Rng(2);
            int hops = 0; bool up = false; double movedInAir = 0;
            for (int i = 0; i < 60 * 5; i++)
            {
                double x = m.X;
                MobAI.Step(m, map, sense, Feel.Dt, rng);
                if (m.HopY > 0) movedInAir += m.X - x;
                if (m.HopY > 0 && !up) hops++;
                up = m.HopY > 0;
            }
            Assert.True(hops >= 4, "追う時はよく跳ねる " + hops);
            Assert.True(movedInAir > 50, "跳ねている間も進む");
            m.Status.Set(StatusKind.Weak, 100, 0);
            for (int i = 0; i < 60; i++) MobAI.Step(m, map, sense, Feel.Dt, rng);
            for (int i = 0; i < 60 * 3; i++) { MobAI.Step(m, map, sense, Feel.Dt, rng); Assert.Equal(0, m.HopY); }
        }

        [Fact]
        public void FlyersDriftUpAndDownAroundHome()
        {
            var d = TestData.Get();
            var map = new PhysicsMap(2000, 800);
            var f = new Mob { Uid = 1, Def = d.Mob("M011") }; f.Hp = f.Def.Hp;
            MobAI.Place(f, map, 1000, 300);
            var rng = new Rng(9);
            double minY = 1e9, maxY = -1e9;
            for (int i = 0; i < 60 * 60; i++)
            {
                MobAI.Step(f, map, new PlayerSense { X = -9999, Y = -9999 }, Feel.Dt, rng);
                minY = Math.Min(minY, f.Y); maxY = Math.Max(maxY, f.Y);
                Assert.InRange(f.Y, 300 - Mob.FlyRangeY - Mob.FlyBob - 1, 300 + Mob.FlyRangeY + Mob.FlyBob + 1);
            }
            Assert.True(maxY - minY > 60, "家から上下に漂う " + (maxY - minY));
        }

        // ---------------- 技

        [Fact]
        public void MagicShowsWarningAtFeetThenHits()
        {
            var (s, m) = With("T_MAGE", "{\"id\":\"bolt\",\"name\":\"雷\",\"type\":\"magic\",\"range\":400,\"cd\":5,\"windup\":1.0,\"pct\":100,\"w\":60,\"h\":90}", 250);
            var log = Run(s, new PlayerInput(), 1);
            Assert.Contains(log, e => e.Type == GameEventType.MobCast && e.Id == "bolt" && e.Value == m.Uid);
            var h = Assert.Single(s.Map.Hazards);
            Assert.True(h.ShowWarning && h.Box.Contains(s.Body.X, s.Body.Y - 10));
            Assert.Equal("skill1", m.Motion);
            int hp = s.Character.Hp;
            Run(s, new PlayerInput(), 50);
            Assert.Equal(hp, s.Character.Hp); // 予兆の間は当たらない
            Assert.InRange(h.Progress, 0.8, 1);
            log = Run(s, new PlayerInput(), 15);
            Assert.True(s.Character.Hp < hp, "予兆の所にいたので当たる");
            Assert.Contains(log, e => e.Type == GameEventType.MobSkillHit && e.Id == "bolt");
            Assert.Empty(s.Map.Hazards);

            // 予兆を見て逃げれば当たらない
            var (t, m2) = With("T_MAGE", "{\"id\":\"bolt\",\"name\":\"雷\",\"type\":\"magic\",\"range\":400,\"cd\":5,\"windup\":1.0,\"pct\":100,\"w\":60,\"h\":90}", 250);
            Run(t, new PlayerInput(), 1);
            int hp2 = t.Character.Hp;
            Run(t, new PlayerInput { Left = true }, 70);
            Assert.Equal(hp2, t.Character.Hp);
        }

        [Fact]
        public void MeleeWindsUpThenHitsInFrontAndShotsCarryStatus()
        {
            var (s, m) = With("T_KNIGHT", "{\"id\":\"slash\",\"name\":\"斬り\",\"type\":\"melee\",\"range\":100,\"cd\":3,\"windup\":0.5,\"pct\":100,\"w\":100,\"h\":80}", 60);
            int hp = s.Character.Hp;
            Run(s, new PlayerInput(), 1);
            Assert.Equal("attack1", m.Motion);
            Assert.False(Assert.Single(s.Map.Hazards).ShowWarning);
            Run(s, new PlayerInput(), 25);
            Assert.Equal(hp, s.Character.Hp);
            Run(s, new PlayerInput(), 10);
            Assert.True(s.Character.Hp < hp);

            var (t, _) = With("T_INK", "{\"id\":\"ink\",\"name\":\"墨\",\"type\":\"shot\",\"range\":300,\"cd\":3,\"windup\":0.3,\"pct\":100,\"speed\":300,\"status\":{\"kind\":\"darkness\",\"sec\":6,\"chance\":1}}", 200);
            var log = Run(t, new PlayerInput(), 60);
            Assert.True(t.Status.Has(StatusKind.Darkness));
            Assert.Contains(log, e => e.Type == GameEventType.StatusApplied && e.Id == "darkness" && e.Value == 0);
            Assert.True(t.Pose.HasStatus(StatusKind.Darkness));
        }

        [Fact]
        public void TouchStatusAndDefaultAttacksFromData()
        {
            var d = TestData.Get();
            Assert.Equal(StatusKind.Poison, d.Mob("M172").TouchStatus.Kind);       // フグトゲ
            Assert.Equal(MobSkillType.Magic, d.Mob("M083").Attacks[0].Type);      // ネムリ蛾: 眠りの鱗粉
            Assert.Equal(StatusKind.Sleep, d.Mob("M083").Attacks[0].Status.Kind);
            Assert.Equal(MobSkillType.Shot, d.Mob("M049").Attacks[0].Type);       // ガイコツ隊長（遠）: 自動で飛び道具
            Assert.Equal(MobSkillType.Magic, d.Mob("M066").Attacks[0].Type);      // 地下亡霊（魔）: 自動で予兆の魔法
            Assert.Empty(d.Mob("M001").Attacks);                                  // 体当たりだけ
            foreach (var m in d.Mobs.Values.Where(x => x.IsBoss)) Assert.True(m.Boss != null && m.Boss.Phases.Count >= 1, m.Id);

            var (s, m2) = With("T_TOUCH", "", 0, ",\"touch\":true,\"touchStatus\":{\"kind\":\"poison\",\"sec\":5,\"chance\":1}");
            Run(s, new PlayerInput(), 2);
            Assert.True(s.Status.Has(StatusKind.Poison));
        }

        [Fact]
        public void GlobalAreaRespectsGroundOnlyAndSafeHeight()
        {
            // 地面にいる時だけ（着地の揺れ）
            var quake = "{\"id\":\"quake\",\"name\":\"揺れ\",\"type\":\"area\",\"global\":true,\"groundOnly\":true,\"cd\":10,\"windup\":0.5,\"pct\":0,\"status\":{\"kind\":\"stun\",\"sec\":1}}";
            var (s, _) = With("T_QUAKE", quake, 700);
            Run(s, new PlayerInput(), 35);
            Assert.True(s.Status.Has(StatusKind.Stun), "地面にいると気絶");
            var (t, _) = With("T_QUAKE", quake, 700);
            Run(t, new PlayerInput(), 24);
            Run(t, new PlayerInput { Jump = true, JumpPressed = true }, 8);
            Assert.False(t.Body.OnGround);
            Run(t, new PlayerInput(), 4);
            Assert.False(t.Status.Has(StatusKind.Stun), "跳んでいれば当たらない");

            // 高い所なら当たらない（吹雪）
            var bliz = "{\"id\":\"bliz\",\"name\":\"吹雪\",\"type\":\"area\",\"global\":true,\"safeHeight\":120,\"cd\":10,\"windup\":0.5,\"pct\":50,\"status\":{\"kind\":\"freeze\",\"sec\":2}}";
            var (u, _) = With("T_BLIZ", bliz, -400);
            PlayerPhysics.PlaceOnGround(u.Body, u.Map.Physics, 1400, 400);
            Assert.Equal(420, u.Body.Y, 3);
            int hp = u.Character.Hp;
            Run(u, new PlayerInput(), 40);
            Assert.Equal(hp, u.Character.Hp);
            Assert.False(u.Status.Has(StatusKind.Freeze));
            var (v, _) = With("T_BLIZ", bliz, -400);
            Run(v, new PlayerInput(), 40);
            Assert.True(v.Status.Has(StatusKind.Freeze));
        }

        [Fact]
        public void StunnedMobCancelsItsCastAndSealedMobDoesNotCast()
        {
            var bolt = "{\"id\":\"bolt\",\"name\":\"雷\",\"type\":\"magic\",\"range\":400,\"cd\":5,\"windup\":1.0,\"pct\":100,\"w\":60,\"h\":90}";
            var (s, m) = With("T_MAGE", bolt, 250);
            Run(s, new PlayerInput(), 1);
            Assert.NotNull(m.Casting);
            s.ApplyStatus(m, StatusKind.Stun, 2);
            int hp = s.Character.Hp;
            Run(s, new PlayerInput(), 80);
            Assert.Null(m.Casting);
            Assert.Equal(hp, s.Character.Hp);
            var (t, m2) = With("T_MAGE", bolt, 250);
            t.ApplyStatus(m2, StatusKind.Seal, 5);
            var log = Run(t, new PlayerInput(), 120);
            Assert.DoesNotContain(log, e => e.Type == GameEventType.MobCast);
        }

        // ---------------- ボス

        [Fact]
        public void MushroomQueenSummonsAndQuakes()
        {
            var d = StatusTests.Ground();
            var s = StatusTests.Session(d);
            var q = s.Map.Spawn("M029", s.Body.X + 400, s.Body.Y);
            var log = Run(s, new PlayerInput(), 60 * 30);
            Assert.Contains(log, e => e.Type == GameEventType.BossPhase && e.Id == "M029" && e.Value == 0);
            Assert.Contains(log, e => e.Type == GameEventType.MobCast && e.Id == "call");
            var summoned = s.Map.Mobs.Where(x => x.SummonerUid == q.Uid).ToList();
            Assert.InRange(summoned.Count, 1, 6);
            Assert.True(summoned.All(x => x.Def.Id == "M024" || x.Def.Id == "M021"));
            Assert.Contains(log, e => e.Type == GameEventType.MobSummoned);
            Assert.Contains(log, e => e.Type == GameEventType.MobCast && e.Id == "quake");
            Assert.Contains(log, e => e.Type == GameEventType.StatusApplied && e.Id == "stun"); // 地面にいたので気絶
            // 呼んだ手下は湧き直しの数に入らない
            Assert.Equal(1, s.Map.AliveCount); // 女王だけ
            var bar = s.Map.BossBar.Value;
            Assert.Equal(q.Uid, bar.Uid);
            Assert.Equal("キノコの女王", bar.Name);
            Assert.Equal(1, bar.PhaseCount);
        }

        [Fact]
        public void BossPhasesChangeWeaknessHealAndBar()
        {
            var s = StatusTests.Session();
            var g = s.Map.Spawn("M199", s.Body.X + 2000, s.Body.Y); // 神殿の守護神（遠くに置いて技を使わせない）
            Run(s, new PlayerInput(), 1);
            Assert.Equal(1.5, g.ElementMul("lightning"));
            Assert.Equal(1.0, g.ElementMul("ice"));
            var bar = s.Map.BossBar.Value;
            Assert.Equal(0, bar.Phase); Assert.Equal(3, bar.PhaseCount); Assert.Equal("石", bar.PhaseName);
            Assert.Equal(1, bar.PhaseRatio, 6);
            g.Hp = (int)(g.MaxHp * 0.80);
            Run(s, new PlayerInput(), 1);
            bar = s.Map.BossBar.Value;
            Assert.Equal(0, bar.Phase);
            Assert.InRange(bar.PhaseRatio, 0.40, 0.42); // (0.80 − 0.66) ÷ (1 − 0.66)
            g.Hp = (int)(g.MaxHp * 0.5);
            var log = Run(s, new PlayerInput(), 1);
            Assert.Contains(log, e => e.Type == GameEventType.BossPhase && e.Value == 1 && e.Text == "金");
            Assert.Equal(1.5, g.ElementMul("ice"));
            Assert.Equal(1.0, g.ElementMul("lightning"));
            g.Hp = (int)(g.MaxHp * 0.1);
            Run(s, new PlayerInput(), 1);
            Assert.Equal(2, g.Phase);
            Assert.Equal(1.5, g.ElementMul("dark"));
            g.Hp = g.MaxHp; // 治っても段階は戻らない
            Run(s, new PlayerInput(), 1);
            Assert.Equal(2, g.Phase);

            // 深淵の大魚: 段階が変わると深く潜る（治り方は BossMechanicTests）
            var f = s.Map.Spawn("M189", s.Body.X + 2500, s.Body.Y - 100);
            Run(s, new PlayerInput(), 1);
            f.Hp = (int)(f.MaxHp * 0.70);
            Run(s, new PlayerInput(), 1);
            Assert.Equal(1, f.Phase);
            Assert.True(f.Submerged && f.Hidden);

            // 大ボスは段階ごとに守りが変わる（星を呑む者の鎧）
            var r = s.Map.Spawn("M239", s.Body.X + 1500, s.Body.Y);
            Run(s, new PlayerInput(), 1);
            int def0 = r.Defender.Def;
            Assert.Equal(4, s.Map.Mobs.Count(x => x.SummonerUid == r.Uid)); // 最初の段階で星喰い 4 体
            r.Hp = (int)(r.MaxHp * 0.7);
            Run(s, new PlayerInput(), 1);
            Assert.Equal(1, r.Phase);
            Assert.InRange(r.Defender.Def, def0 * 3 - 2, def0 * 3 + 2);
        }

        [Fact]
        public void PhaseOnlySkillsAndDive()
        {
            var s = StatusTests.Session();
            var w = s.Map.Spawn("M069", s.Body.X + 450, s.Body.Y); // 下水の大ワニ: 潜るのは 2 段目だけ
            var log = Run(s, new PlayerInput(), 60 * 15);
            Assert.DoesNotContain(log, e => e.Type == GameEventType.MobCast && e.Id == "dive");
            w.Hp = w.MaxHp / 3;
            bool sawHidden = false; double xAtCast = 0;
            for (int i = 0; i < 60 * 30; i++)
            {
                s.Out.Clear();
                s.Character.Hp = s.Stats.MaxHp; // 倒れないように
                s.Step(new PlayerInput());
                if (s.Out.Events.Any(e => e.Type == GameEventType.MobCast && e.Id == "dive")) { xAtCast = s.Body.X; }
                if (w.Hidden) sawHidden = true;
                if (sawHidden && !w.Hidden && w.Casting == null) break;
            }
            Assert.True(sawHidden, "潜った");
            Assert.False(w.Hidden);
            Assert.InRange(w.X, xAtCast - 5, xAtCast + 5); // 主人公のいた所に出てくる
        }

        [Fact]
        public void BossDataIsConsistent()
        {
            var d = TestData.Get();
            foreach (var m in d.Mobs.Values)
            {
                foreach (var a in m.Attacks)
                {
                    foreach (var id in a.Mobs) Assert.True(d.Mob(id) != null, m.Id + " が呼ぶ " + id);
                    if (a.Phases != null) foreach (var p in a.Phases) Assert.True(m.Boss != null && p < m.Boss.Phases.Count, m.Id + " " + a.Id);
                }
                if (m.Boss == null) continue;
                Assert.Equal(1, m.Boss.Phases[0].Hp, 9);
                for (int i = 1; i < m.Boss.Phases.Count; i++) Assert.True(m.Boss.Phases[i].Hp < m.Boss.Phases[i - 1].Hp, m.Id);
            }
            // 地域のボス 12 体・大ボス 3 体には技がある
            Assert.Equal(15, d.Mobs.Values.Count(m => m.IsBoss));
            foreach (var m in d.Mobs.Values.Where(x => x.IsBoss)) Assert.True(m.Attacks.Count >= 2, m.Id);
            Assert.Equal(3, d.Mob("M219").Boss.Phases.Count);
            Assert.Equal(4, d.Mob("M239").Boss.Phases.Count);
        }
    }
}
