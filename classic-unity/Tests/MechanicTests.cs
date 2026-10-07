// 「形だけ」だった物を実際に効かせた所のテスト:
//   状態異常の遅延・変化・錯乱、敵の強化とそれを消すスキル・敵の反射、
//   ボスの仕掛け（分身・時の裂け目・深く潜って回復と光る岩・盾の陰・ツタの引き寄せ・渦潮の吸い込み）、
//   スキルの残り（身代わり人形・秘術の扉・乗船の船の HP・隠れ足・毒の霧・クローの熟練・調合上手・MP 吸収・星の連投のデータ）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
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
    public class MechanicTests
    {
        // ---------------- 手伝い

        private static List<GameEvent> Run(GameSession s, PlayerInput inp, int frames, bool safe = true)
        {
            var log = new List<GameEvent>();
            for (int i = 0; i < frames; i++)
            {
                if (safe) { s.Body.InvT = 5; s.Character.Hp = s.Stats.MaxHp; } // 敵の攻撃で倒れないように（仕掛けだけを見る）
                s.Out.Clear(); s.Step(inp); log.AddRange(s.Out.Events);
            }
            return log;
        }

        private static List<GameEvent> Idle(GameSession s, double sec) => Run(s, new PlayerInput(), (int)Math.Round(sec * 60));

        private static MobDef Def(string id, string attacks, string extra = "")
            => MobDef.FromDict(Json.ParseObject(
                "{\"id\":\"" + id + "\",\"name\":\"" + id + "\",\"lv\":30,\"kind\":\"normal\",\"move\":\"stand\",\"touch\":false,\"hp\":100000,\"mp\":1000,\"exp\":10,"
                + "\"atk\":100,\"matk\":100,\"def\":100,\"mdef\":100,\"avoid\":0,\"acc\":9999,\"meso\":0,\"width\":40,\"height\":50,\"pushed\":0,\"speed\":0,"
                + "\"attacks\":[" + attacks + "]" + extra + "}"));

        /// <summary>平らな原（StatusTests）に自分で決めた敵を足す。</summary>
        private static GameSession Field(params MobDef[] defs)
        {
            var d = StatusTests.Ground();
            foreach (var m in defs) d.Mobs[m.Id] = m;
            return StatusTests.Session(d);
        }

        private static readonly Dictionary<string, (string weapon, string ammo)> Weapon = new Dictionary<string, (string, string)>
        {
            { "片手剣", ("eq.starter.9", null) }, { "槍", ("eq.warrior.spear.10", null) }, { "弓", ("eq.starter.12", "use.arrow_bow") },
            { "クロー", ("eq.thief.claw.10", "use.star_iron") }, { "銃", ("eq.pirate.gun.10", "use.bullet_lead") }, { "ワンド", ("eq.magician.wand.8", null) },
        };

        /// <summary>系統・段階・枝・武器を決めた試しのキャラ（Lv 200）。data を渡すとその試しの場で。</summary>
        private static GameSession Hero(string line, int tier, int branch, string weaponType, GameData data = null)
        {
            var (w, ammo) = Weapon[weaponType];
            var s = SkillTests.Hero(line, w, ammo, 200, data ?? SkillTests.Arena());
            s.Character.Tier = tier; s.Character.Branch = branch;
            for (int t = 0; t < 5; t++) s.Character.Sp[t] = 999;
            s.Character.Int = 300;
            s.RefreshStats();
            s.Character.Hp = s.Stats.MaxHp; s.Character.Mp = s.Stats.MaxMp;
            return s;
        }

        private static void Max(GameSession s, string id)
        {
            var def = s.Data.Skill(id);
            if (def.MasterLevel > 0) s.Skills.UseMasteryBook(id, 20, 1, s.Rng); // ★は 20 の書を使った後の上限で確かめる
            SkillTests.Learn(s, id, s.Skills.MaxLevel(def));
        }

        private static void Use(GameSession s, string id)
        {
            s.Out.Clear();
            var r = s.UseSkill(id);
            Assert.True(r == SkillUseResult.Ok, id + ": " + r + " " + string.Join(",", s.Out.Events));
            for (int i = 0; i < 120 && s.Attack != null; i++) s.Step(new PlayerInput());
        }

        // ---------------- 状態異常: 遅延・変化・錯乱

        [Fact]
        public void SlowPolymorphConfuseOnPlayer()
        {
            var s = StatusTests.Session();
            Assert.Equal(11, StatusSet.KindCount);
            Assert.True(StatusSystem.TryParse("slow", out var k1) && k1 == StatusKind.Slow);
            Assert.True(StatusSystem.TryParse("polymorph", out var k2) && k2 == StatusKind.Polymorph);
            Assert.True(StatusSystem.TryParse("confuse", out var k3) && k3 == StatusKind.Confuse);
            Assert.True(GameSession.SkillStatusKind("charm", out var k4) && k4 == StatusKind.Confuse); // 錯乱弾

            // 遅延: 速さ −power
            int sp = s.Stats.Speed;
            s.ApplyStatus(StatusKind.Slow, 3, 40);
            Run(s, new PlayerInput(), 1);
            Assert.Equal(sp - 40, s.Stats.Speed);
            Assert.True(s.Pose.Slowed);
            s.ApplyStatus(StatusKind.Slow, 3, 500);
            Run(s, new PlayerInput(), 1);
            Assert.Equal(GameSession.SlowMinSpeed, s.Stats.Speed);
            s.CureStatus(new[] { StatusKind.Slow });
            Run(s, new PlayerInput(), 1);
            Assert.Equal(sp, s.Stats.Speed);

            // 錯乱: → を押すと左へ歩く
            s.ApplyStatus(StatusKind.Confuse, 2);
            double x0 = s.Body.X;
            Run(s, new PlayerInput { Right = true }, 30);
            Assert.True(s.Body.X < x0 - 20, "錯乱で左右が逆にならない");
            Assert.True(s.Pose.Confused);
            Run(s, new PlayerInput(), 120);
            Assert.False(s.Status.Has(StatusKind.Confuse));
            x0 = s.Body.X;
            Run(s, new PlayerInput { Right = true }, 30);
            Assert.True(s.Body.X > x0 + 20);

            // 変化: 攻撃もスキルもできないが、歩ける・薬は使える
            s.Character.Sp[0] = 10;
            SkillTests.Learn(s, "beginner.rest", 1);
            s.ApplyStatus(StatusKind.Polymorph, 3);
            Run(s, new PlayerInput(), 1);
            Assert.True(s.Pose.Polymorphed);
            Assert.Equal(GameSession.PolymorphMobId, s.Pose.PolymorphForm);
            Assert.False(s.StartBasicAttack());
            Assert.Equal(SkillUseResult.Polymorphed, s.UseSkill("beginner.rest"));
            x0 = s.Body.X;
            Run(s, new PlayerInput { Left = true }, 30);
            Assert.True(s.Body.X < x0 - 20);
            s.Inventory.Add("use.red_potion");
            s.Character.Hp = 1;
            Assert.True(s.UseItem("use.red_potion"));
            // 治すスキル・万能薬の仲間で治る
            Assert.True(s.CureStatus(GameSession.CurableAll) >= 1);
            Assert.True(s.StartBasicAttack());
        }

        [Fact]
        public void SlowPolymorphOnMobsAndBossResists()
        {
            var s = StatusTests.Session();
            var snail = s.Map.Spawn("M005", s.Body.X + 600, s.Body.Y);
            double v = snail.MoveSpeed;
            Assert.Equal(StatusApplyResult.Applied, s.ApplyStatus(snail, StatusKind.Slow, 5, 20));
            Assert.Equal(Math.Max(v * 0.2, v - 20), snail.MoveSpeed, 6);
            Assert.True((snail.StatusIcons & (1 << (int)StatusKind.Slow)) != 0);

            // 変化: コロ貝の姿・攻撃力と防御もコロ貝の値・技を使わない
            var big = s.Map.Spawn("M081", s.Body.X + 700, s.Body.Y); // 斧の振り下ろしを持つ敵
            big.PolyDef = s.Data.Mob(GameSession.PolymorphMobId);
            s.ApplyStatus(big, StatusKind.Polymorph, 5);
            var snailDef = s.Data.Mob("M001");
            Assert.Equal("M001", big.FormId);
            Assert.Equal(snailDef.Atk, big.Atk);
            Assert.Equal(snailDef.Def, big.Defender.Def);
            Assert.False(big.Status.CanUseSkill);
            Run(s, new PlayerInput(), 330); // 5 秒で元に戻る
            Assert.Null(big.FormId);
            Assert.Equal(s.Data.Mob("M081").Atk, big.Atk);

            // ボスには変化・錯乱が効かない（遅延は効く）
            var boss = s.Map.Spawn("M119", s.Body.X + 2000, s.Body.Y);
            Assert.Equal(StatusApplyResult.Immune, s.ApplyStatus(boss, StatusKind.Polymorph, 5));
            Assert.Equal(StatusApplyResult.Immune, s.ApplyStatus(boss, StatusKind.Confuse, 5));
            Assert.Equal(StatusApplyResult.Applied, s.ApplyStatus(boss, StatusKind.Slow, 5, 10));
        }

        [Fact]
        public void SlowDoomAndHypnotizeSkills()
        {
            // 遅延（Lv20）: まわりの敵の速さ −40
            var w = Hero(JobLine.Magician, 2, 0, "ワンド");
            Max(w, "firewizard.slow");
            var snail = w.Map.Spawn("M005", w.Body.X + 80, w.Body.Y);
            double v = snail.MoveSpeed;
            Use(w, "firewizard.slow");
            Assert.True(snail.Status.Has(StatusKind.Slow));
            Assert.Equal(40, snail.Status.Get(StatusKind.Slow).Power);
            Assert.True(snail.MoveSpeed < v);

            // 変化の呪い（Lv20 → 80%）: コロ貝の姿になる
            var p = Hero(JobLine.Magician, 3, 2, "ワンド");
            Max(p, "priest.doom");
            var d1 = SkillTests.Dummy(p, 80);
            for (int i = 0; i < 10 && d1.FormId == null; i++) { p.Character.Mp = p.Stats.MaxMp; Use(p, "priest.doom"); }
            Assert.Equal(GameSession.PolymorphMobId, d1.FormId);
            Assert.Equal(p.Data.Mob("M001").Atk, d1.Atk);

            // 錯乱弾: 前の 1 体が味方になり、主人公の攻撃は当たらず、近くの敵に体当たりする
            var c = Hero(JobLine.Pirate, 4, 1, "銃");
            Max(c, "captain.hypnotize");
            var near = SkillTests.Dummy(c, 60);
            var other = SkillTests.Dummy(c, 95);
            Use(c, "captain.hypnotize");
            Assert.True(near.Charmed);
            Assert.False(other.Charmed);
            int otherHp = other.Hp, nearHp = near.Hp;
            Run(c, new PlayerInput(), 150);
            Assert.True(other.Hp < otherHp, "操った敵が体当たりしない");
            c.StartBasicAttack();
            Run(c, new PlayerInput(), 60);
            Assert.Equal(nearHp, near.Hp); // 味方には当たらない
        }

        [Fact]
        public void MobSkillsInflictNewStatusesFromData()
        {
            var d = TestData.Get();
            Assert.Equal(StatusKind.Confuse, d.Mob("M154").Attacks.Single(a => a.Id == "daze").Status.Kind);
            Assert.Equal(StatusKind.Slow, d.Mob("M160").Attacks.Single(a => a.Id == "late").Status.Kind);
            Assert.Equal(40, d.Mob("M160").Attacks.Single(a => a.Id == "late").Status.Power);
            Assert.Equal(StatusKind.Polymorph, d.Mob("M119").Attacks.Single(a => a.Id == "change").Status.Kind);
            Assert.Equal(StatusKind.Confuse, d.Mob("M239").Attacks.Single(a => a.Id == "daze").Status.Kind);

            // 足元の魔法で錯乱（必ずかかるように chance 1 の敵で）
            var s = Field(Def("T_DAZE", "{\"id\":\"daze\",\"name\":\"惑い\",\"type\":\"magic\",\"range\":400,\"cd\":30,\"windup\":0.5,\"pct\":0,\"w\":100,\"h\":100,\"status\":{\"kind\":\"confuse\",\"sec\":3}}"));
            s.Map.Spawn("T_DAZE", s.Body.X + 200, s.Body.Y);
            Run(s, new PlayerInput(), 60);
            Assert.True(s.Status.Has(StatusKind.Confuse));
        }

        // ---------------- 敵の強化・崩す・反射

        private const string BuffSkill = "{\"id\":\"guard\",\"name\":\"守り\",\"type\":\"buff\",\"allies\":true,\"w\":300,\"range\":800,\"cd\":60,\"windup\":0.2,"
            + "\"buff\":{\"atk\":30,\"matk\":30,\"def\":50,\"mdef\":50,\"speed\":20,\"reflect\":20,\"magicReflect\":20,\"sec\":30}}";

        private static (GameSession s, Mob m, Mob ally) Buffed(string line, int tier, int branch, string weapon)
        {
            var data = SkillTests.Arena();
            data.Mobs["T_BUFF"] = Def("T_BUFF", BuffSkill);
            data.Mobs["T_ALLY"] = Def("T_ALLY", "");
            var s = Hero(line, tier, branch, weapon, data);
            var m = s.Map.Spawn("T_BUFF", s.Body.X + 50, s.Body.Y);
            var ally = s.Map.Spawn("T_ALLY", s.Body.X + 150, s.Body.Y);
            var log = Run(s, new PlayerInput(), 30);
            Assert.Contains(log, e => e.Type == GameEventType.MobBuffed && e.Id == "def" && e.Value == m.Uid);
            return (s, m, ally);
        }

        [Fact]
        public void MobBuffsRaiseStatsAndCrashSkillsRemoveThem()
        {
            var (s, m, ally) = Buffed(JobLine.Warrior, 3, 0, "片手剣");
            Assert.True(m.Buffs.Has(MobBuffKind.Def));
            Assert.True(ally.Buffs.Has(MobBuffKind.Def)); // allies: まわりの仲間にも
            Assert.Equal((int)Math.Round(100 * 1.5), m.Defender.Def);
            Assert.Equal((int)Math.Round(100 * 1.5), m.Defender.Mdef);
            Assert.Equal((int)Math.Round(100 * 1.3), m.Atk);
            Assert.Equal(MobBuffs.KindCount, Convert.ToString(m.BuffIcons, 2).Count(c => c == '1'));
            // 鎧崩し（Lv30 → 100%）: 防御と物理の反射が消える。攻撃・魔防は残る
            Max(s, "crusader.armor_crash");
            Use(s, "crusader.armor_crash");
            Assert.False(m.Buffs.Has(MobBuffKind.Def));
            Assert.False(m.Buffs.Has(MobBuffKind.Reflect));
            Assert.True(m.Buffs.Has(MobBuffKind.Atk));
            Assert.True(m.Buffs.Has(MobBuffKind.Mdef));
            Assert.Equal(100, m.Defender.Def);

            var (s2, m2, _) = Buffed(JobLine.Warrior, 3, 1, "片手剣");
            Max(s2, "knight.magic_crash");
            Use(s2, "knight.magic_crash");
            Assert.False(m2.Buffs.Has(MobBuffKind.Mdef) || m2.Buffs.Has(MobBuffKind.Matk) || m2.Buffs.Has(MobBuffKind.MagicReflect));
            Assert.True(m2.Buffs.Has(MobBuffKind.Def));

            var (s3, m3, _) = Buffed(JobLine.Warrior, 3, 2, "槍");
            Max(s3, "dragoon.power_crash");
            Use(s3, "dragoon.power_crash");
            Assert.False(m3.Buffs.Has(MobBuffKind.Atk));
            Assert.True(m3.Buffs.Has(MobBuffKind.Def));

            var (s4, m4, ally4) = Buffed(JobLine.Magician, 3, 2, "ワンド");
            Max(s4, "priest.dispel");
            Use(s4, "priest.dispel");
            Assert.False(m4.Buffs.Any);
            Assert.False(ally4.Buffs.Any); // まわりの敵全部
        }

        [Fact]
        public void MobReflectHurtsPlayerAndBuffsExpire()
        {
            var (s, m, _) = Buffed(JobLine.Warrior, 3, 0, "片手剣");
            int hp = s.Character.Hp;
            s.Out.Clear();
            Assert.True(s.StartBasicAttack());
            var log = new List<GameEvent>();
            for (int i = 0; i < 60; i++) { s.Step(new PlayerInput()); log.AddRange(s.Out.Events); s.Out.Clear(); }
            Assert.Contains(log, e => e.Type == GameEventType.Hurt && e.Id == "reflect");
            Assert.True(s.Character.Hp < hp);
            // 30 秒で切れる
            var end = Run(s, new PlayerInput(), 60 * 31);
            Assert.Contains(end, e => e.Type == GameEventType.MobBuffEnded && e.Value == m.Uid);
            Assert.False(m.Buffs.Any);
        }

        [Fact]
        public void BossBuffSkillsAreInData()
        {
            var d = TestData.Get();
            Assert.Equal(60, d.Mob("M059").Attacks.Single(a => a.Type == MobSkillType.Buff).Buff.Pct[(int)MobBuffKind.Def]);
            Assert.Equal(20, d.Mob("M199").Attacks.Single(a => a.Type == MobSkillType.Buff).Buff.Pct[(int)MobBuffKind.Reflect]);
            Assert.Equal(20, d.Mob("M119").Attacks.Single(a => a.Type == MobSkillType.Buff).Buff.Pct[(int)MobBuffKind.MagicReflect]);
            Assert.True(d.Mob("M089").Attacks.Single(a => a.Type == MobSkillType.Buff).Buff.Pct[(int)MobBuffKind.Speed] > 0);
            Assert.True(d.Mob("M195").Attacks.Single(a => a.Type == MobSkillType.Buff).Allies);
        }

        // ---------------- ボスの仕掛け

        [Fact]
        public void CloudWitchClonesHaveNoShadowAndVanishWithHer()
        {
            var s = StatusTests.Session();
            var w = s.Map.Spawn("M119", s.Body.X + 1500, s.Body.Y);
            Run(s, new PlayerInput(), 1);
            Assert.DoesNotContain(s.Map.Mobs, m => m.CloneOf != 0);
            w.Hp = w.MaxHp / 2;
            var log = Run(s, new PlayerInput(), 1);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "clones");
            var clones = s.Map.Mobs.Where(m => m.CloneOf == w.Uid).ToList();
            Assert.Equal(2, clones.Count);
            Assert.All(clones, c =>
            {
                Assert.False(c.HasShadow);
                Assert.True(c.Mechanic);
                Assert.Equal("M119", c.Def.Id);              // 同じ姿
                Assert.Equal((int)Math.Floor(w.MaxHp * 0.02), c.MaxHp);
                Assert.True(c.Atk < w.Atk);
            });
            Assert.True(w.HasShadow);
            var bar = s.Map.BossBar.Value;
            Assert.Equal(w.Uid, bar.Uid);
            Assert.Equal(2, bar.Clones);
            // 8 秒ごとに入れ替わる
            log = Run(s, new PlayerInput(), 60 * 8 + 5);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "shuffle");
            // 分身を倒しても経験値は入らない
            log = new List<GameEvent>();
            s.Out.Clear();
            var c0 = s.Map.Mobs.First(m => m.CloneOf == w.Uid && m.Alive);
            s.DamageMob(c0, new HitResult { Damage = c0.Hp });
            Assert.DoesNotContain(s.Out.Events, e => e.Type == GameEventType.ExpGained);
            Assert.Equal(1, s.Map.BossBar.Value.Clones);
            // 本物が倒れると分身も消える
            s.DamageMob(w, new HitResult { Damage = w.Hp });
            Run(s, new PlayerInput(), 2);
            Assert.DoesNotContain(s.Map.Mobs, m => m.CloneOf == w.Uid && m.Alive);
        }

        [Fact]
        public void ClockTowerRiftsGuardUntilFilledWithShards()
        {
            var s = StatusTests.Session();
            var b = s.Map.Spawn("M160", s.Body.X + 1600, s.Body.Y);
            Run(s, new PlayerInput(), 1);
            var st = s.Map.Rifts;
            Assert.NotNull(st);
            Assert.Equal(3, st.Spots.Count);
            Assert.Equal(60, st.TimeLeft, 0);
            Assert.Equal(3, s.Map.CountMechanics(b.Uid, "shard"));
            Assert.True(s.Map.BossBar.Value.Guarded);
            // 守られている間はダメージ × 0.1
            int hp = b.Hp;
            s.DamageMob(b, new HitResult { Damage = 10000 });
            Assert.Equal(hp - 1000, b.Hp);
            // 時計虫を倒すと時のかけら（経験値なし）
            s.Out.Clear();
            var bug = s.Map.Mobs.First(m => m.MechanicKind == "shard");
            Assert.Equal("M149", bug.Def.Id);
            s.DamageMob(bug, new HitResult { Damage = bug.Hp });
            Assert.Equal(1, st.Shards);
            Assert.DoesNotContain(s.Out.Events, e => e.Type == GameEventType.ExpGained);
            // 裂け目の上で調べるキー
            var spot = st.Spots[0];
            s.Teleport(spot.X, spot.Y);
            var log = Run(s, new PlayerInput { InteractPressed = true }, 1);
            Assert.True(spot.Filled);
            Assert.Equal(0, st.Shards);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "rift_filled");
            // 時間切れ: はめた物が元に戻り、足りない分の時計虫がまた出る
            st.TimeLeft = 0.001;
            log = Run(s, new PlayerInput(), 1);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "rift_reset");
            Assert.False(spot.Filled);
            Assert.Equal(3, s.Map.CountMechanics(b.Uid, "shard"));
            // 3 つはめると無防備
            foreach (var sp in st.Spots)
            {
                var m = s.Map.Mobs.First(x => x.MechanicKind == "shard" && x.Alive);
                s.DamageMob(m, new HitResult { Damage = m.Hp });
                s.Teleport(sp.X, sp.Y);
                log = Run(s, new PlayerInput { InteractPressed = true }, 1);
            }
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "rift_exposed");
            Assert.True(st.Exposed);
            Run(s, new PlayerInput(), 1);
            Assert.False(s.Map.BossBar.Value.Guarded);
            hp = b.Hp;
            s.DamageMob(b, new HitResult { Damage = 10000 });
            Assert.Equal(hp - 10000, b.Hp);
            // 次の段階では裂け目は無い
            b.Hp = b.MaxHp / 3;
            Run(s, new PlayerInput(), 1);
            Assert.Null(s.Map.Rifts);
            Assert.Equal(1, b.GuardMul);
        }

        [Fact]
        public void AbyssFishSubmergesHealsAndRocksStopIt()
        {
            var s = StatusTests.Session();
            var f = s.Map.Spawn("M189", s.Body.X + 1800, s.Body.Y - 100);
            Run(s, new PlayerInput(), 1);
            f.Hp = (int)(f.MaxHp * 0.70);
            var log = Run(s, new PlayerInput(), 1);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "submerge");
            Assert.True(f.Submerged && f.Hidden);
            var rocks = s.Map.Mobs.Where(m => m.MechanicKind == "rock" && m.OwnerUid == f.Uid).ToList();
            Assert.Equal(3, rocks.Count);
            Assert.All(rocks, r => { Assert.Equal("光る岩", r.Def.Name); Assert.Equal((int)Math.Floor(f.Def.Hp * 0.005), r.MaxHp); });
            Assert.Equal(3, s.Map.BossBar.Value.RocksLeft);
            Assert.True(s.Map.BossBar.Value.Submerged);
            // 岩がある間は治る（30 秒で 5% の速さ）
            int hp = f.Hp;
            Run(s, new PlayerInput(), 60 * 6);
            int healed = f.Hp - hp;
            Assert.InRange(healed, (int)(f.MaxHp * 0.05 * 6 / 30) - 2, (int)(f.MaxHp * 0.05 * 6 / 30) + 2);
            // 潜っている間は攻撃が当たらない
            Assert.True(f.Hidden);
            // 岩を全部壊すと出てくる（経験値なし）
            s.Out.Clear();
            foreach (var r in rocks) s.DamageMob(r, new HitResult { Damage = r.Hp });
            Assert.DoesNotContain(s.Out.Events, e => e.Type == GameEventType.ExpGained);
            log = Run(s, new PlayerInput(), 1);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "surface");
            Assert.False(f.Submerged || f.Hidden);
            hp = f.Hp;
            Run(s, new PlayerInput(), 60);
            Assert.True(f.Hp <= hp);
            // 次の段階: 時間が来ると出てきて、残った岩は消える
            f.Hp = (int)(f.MaxHp * 0.45);
            Run(s, new PlayerInput(), 1);
            Assert.True(f.Submerged);
            Assert.Equal(2, f.Phase);
            f.SubmergeT = 0.001;
            Run(s, new PlayerInput(), 2);
            Assert.False(f.Submerged);
            Assert.Equal(0, s.Map.CountMechanics(f.Uid, "rock"));
        }

        [Fact]
        public void ShelterBlocksDoomFlame()
        {
            var doom = s_doom;
            Assert.Equal(new[] { 0.06, 0.94 }, TestData.Get().Mob("M229").Attacks.Single(a => a.Id == "doom").ShelterAt);
            // 盾の陰（x = 300 と 2700）の中は当たらない
            var a = Field(Def("T_DOOM", doom));
            a.Map.Spawn("T_DOOM", 900, 600);
            a.Teleport(300, 600);
            var hz = Run(a, new PlayerInput(), 20, false);
            Assert.Contains(a.Map.Hazards, h => h.SafeZones != null && h.SafeZones.Count == 2);
            int hp = a.Character.Hp;
            Run(a, new PlayerInput(), 60, false);
            Assert.Equal(hp, a.Character.Hp);
            // 外にいると当たる
            var b = Field(Def("T_DOOM", doom));
            b.Map.Spawn("T_DOOM", 900, 600);
            b.Teleport(1000, 600);
            hp = b.Character.Hp;
            Run(b, new PlayerInput(), 80, false);
            Assert.True(b.Character.Hp < hp);
        }

        private const string s_doom = "{\"id\":\"doom\",\"name\":\"全滅の炎\",\"type\":\"area\",\"global\":true,\"cd\":60,\"windup\":0.5,\"pct\":50,\"shelter\":{\"at\":[0.1,0.9],\"w\":90}}";

        [Fact]
        public void VinePullsAndWhirlpoolSucks()
        {
            var d = TestData.Get();
            Assert.Equal(200, d.Mob("M039").Attacks.Single(a => a.Id == "vine").Pull);
            var whirl = d.Mob("M189").Attacks.Single(a => a.Id == "whirl");
            Assert.Equal(600, whirl.SuckW); Assert.Equal(110, whirl.SuckSpeed);

            // ツタ: 当たると敵の方へ引き寄せられる
            var s = Field(Def("T_VINE", "{\"id\":\"vine\",\"name\":\"ツタ\",\"type\":\"magic\",\"range\":500,\"cd\":30,\"windup\":0.5,\"pct\":10,\"w\":120,\"h\":100,\"pull\":200}"));
            var m = s.Map.Spawn("T_VINE", s.Body.X + 400, s.Body.Y);
            double x0 = s.Body.X;
            var log = Run(s, new PlayerInput(), 40, false);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "pulled");
            Assert.True(s.Body.X > x0 + 120, "引き寄せられていない: " + (s.Body.X - x0));
            Assert.True(s.Body.X < m.X);

            // 渦潮: 予兆の間、まわり 600 の中の主人公は中心へ吸い込まれる（当たるのは中心だけ）
            var s2 = Field(Def("T_WHIRL", "{\"id\":\"whirl\",\"name\":\"渦潮\",\"type\":\"area\",\"w\":140,\"cd\":30,\"windup\":1.5,\"pct\":10,\"suck\":{\"w\":600,\"speed\":110}}"));
            var m2 = s2.Map.Spawn("T_WHIRL", s2.Body.X + 250, s2.Body.Y);
            x0 = s2.Body.X;
            Run(s2, new PlayerInput(), 60, false);
            Assert.Contains(s2.Map.Hazards, h => h.SuckW == 600 && !h.Fired);
            Assert.InRange(s2.Body.X - x0, 80, 120); // 1 秒で約 110 px
            // 逆へ歩けば逃げられる（歩く速さの方が速い）
            double x1 = s2.Body.X;
            Run(s2, new PlayerInput { Left = true }, 20, false);
            Assert.True(s2.Body.X < x1);
        }

        // ---------------- スキルの残り

        [Fact]
        public void PuppetDrawsMobsAndBreaks()
        {
            var s = Hero(JobLine.Bowman, 3, 0, "弓");
            Max(s, "ranger.puppet");
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("ranger.puppet"));
            var dc = s.Decoy.Value;
            Assert.Equal(s.Body.X + 30, dc.X, 3);
            Assert.Equal((int)Math.Floor(s.Stats.MaxHp * (50 + 5 * 20) / 100.0), dc.MaxHp);
            // 歩く敵は主人公ではなく人形の方へ（主人公の後ろ側から来ても人形へ）
            var m = s.Map.Spawn("M005", dc.X + 300, s.Body.Y);
            m.AggroT = 0;
            Run(s, new PlayerInput(), 60 * 4);
            Assert.True(Math.Abs(m.X - dc.X) < 40, "人形に寄ってこない: " + (m.X - dc.X));
            Assert.True(s.Decoy.Value.Hp < dc.MaxHp);
            // 人形の HP が無くなると消える
            s.Buffs.DecoyBuff.DecoyHp = 1;
            var log = Run(s, new PlayerInput(), 60);
            Assert.Contains(log, e => e.Type == GameEventType.Mechanic && e.Id == "decoy_broken");
            Assert.Null(s.Decoy);
        }

        [Fact]
        public void MysticDoorGoesBothWays()
        {
            var s = Hero(JobLine.Magician, 3, 2, "ワンド");
            Max(s, "priest.mystic_door");
            s.Teleport(1500, 600);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("priest.mystic_door"));
            Assert.Equal("S003", s.Map.Data.Id);
            var door = s.Door;
            Assert.NotNull(door);
            Assert.Equal("T_ARENA", door.FieldMap);
            Assert.Equal(1500, door.FieldX, 3);
            // 町の扉 → 使った場所
            Run(s, new PlayerInput { Up = true, UpPressed = true }, 1);
            Assert.Equal("T_ARENA", s.Map.Data.Id);
            Assert.Equal(1500, s.Body.X, 3);
            // 使った場所の扉 → 町
            Run(s, new PlayerInput(), 5);
            Run(s, new PlayerInput { Up = true, UpPressed = true }, 1);
            Assert.Equal("S003", s.Map.Data.Id);
            // 効果が切れると扉は消える
            s.Buffs.Get("priest.mystic_door").Remaining = 0.001;
            Run(s, new PlayerInput(), 2);
            Assert.Null(s.Door);
            Run(s, new PlayerInput { Up = true, UpPressed = true }, 1);
            Assert.Equal("S003", s.Map.Data.Id);
        }

        [Fact]
        public void ShipHpBreaksAndSlowFallAndStarBundle()
        {
            // 乗船: 受けたダメージで船の HP が減り、0 で降りる
            var s = Hero(JobLine.Pirate, 4, 1, "銃");
            Max(s, "captain.ship");
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("captain.ship"));
            Assert.Equal(2000 + 200 * 20, s.ShipHp);
            Assert.Equal(s.ShipHp, s.ShipMaxHp);
            s.Body.InvT = 0;
            Assert.True(s.TakeHit(300, 100, 9999, false, s.Body.X + 10));
            Assert.True(s.ShipHp < s.ShipMaxHp);
            s.Buffs.ShipBuff.ShipHp = 1;
            s.Body.InvT = 0; s.Character.Hp = s.Stats.MaxHp;
            s.Out.Clear();
            Assert.True(s.TakeHit(300, 100, 9999, false, s.Body.X + 10));
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.Mechanic && e.Id == "ship_broken");
            Assert.Null(s.Buffs.ShipBuff);
            Assert.Equal(0, s.ShipHp);

            // 隠れ足: ジャンプキーを押している間は落ちる速さが 120 まで
            var g = Hero(JobLine.Pirate, 2, 1, "銃");
            Max(g, "gunslinger.wings");
            Assert.Equal(SkillUseResult.Ok, g.UseSkill("gunslinger.wings"));
            double maxVy = 0;
            g.Step(new PlayerInput { Jump = true, JumpPressed = true });
            for (int i = 0; i < 120 && !g.Body.OnGround; i++) { g.Step(new PlayerInput { Jump = true }); maxVy = Math.Max(maxVy, g.Body.Vy); }
            Assert.InRange(maxVy, 100, PlayerBody.SlowFallSpeed + 1e-9);
            var n = Hero(JobLine.Pirate, 2, 1, "銃");
            double maxVy2 = 0;
            n.Step(new PlayerInput { Jump = true, JumpPressed = true });
            for (int i = 0; i < 120 && !n.Body.OnGround; i++) { n.Step(new PlayerInput()); maxVy2 = Math.Max(maxVy2, n.Body.Vy); }
            Assert.True(maxVy2 > 300);

            // クローの熟練: 投げ星の 1 枠に重なる数 +10x
            var t = Hero(JobLine.Thief, 2, 0, "クロー");
            var star = t.Data.Item("use.star_iron");
            Assert.Equal(star.MaxStack, t.Inventory.StackOf(star));
            Max(t, "assassin.claw_mastery");
            t.RefreshStats();
            Assert.Equal(star.MaxStack + 200, t.Inventory.StackOf(star));
            t.Inventory.Remove("use.star_iron", t.Inventory.Count("use.star_iron"));
            Assert.Equal(0, t.Inventory.Add("use.star_iron", star.MaxStack + 200));
            Assert.Equal(1, t.Inventory.All().Count(e => e.Item3.ItemId == "use.star_iron"));
        }

        [Fact]
        public void PoisonMistStaysAndPoisonsNewcomers()
        {
            var s = Hero(JobLine.Magician, 3, 0, "ワンド");
            Max(s, "firemage.poison_mist");
            SkillTests.Dummy(s, 60);
            Use(s, "firemage.poison_mist");
            Assert.Single(s.Zones);
            var z = s.Zones[0];
            Assert.Equal(6, z.Total);
            // 後から入ってきた敵にも毒
            var late = SkillTests.Dummy(s, 150);
            Assert.False(late.Status.Has(StatusKind.Poison));
            Run(s, new PlayerInput(), 70);
            Assert.True(late.Status.Has(StatusKind.Poison));
            Run(s, new PlayerInput(), 60 * 6);
            Assert.Empty(s.Zones);
        }

        [Fact]
        public void AlchemistMpEaterAndStarChainData()
        {
            // 調合上手（Lv20）: 回復量 +30%、時間 +20%
            var s = Hero(JobLine.Thief, 3, 0, "クロー");
            Max(s, "hermit.alchemist");
            s.RefreshStats();
            s.Character.Hp = 1;
            s.Inventory.Add("use.red_potion");
            Assert.True(s.UseItem("use.red_potion"));
            Assert.Equal(1 + (int)Math.Floor(50 * 1.3), s.Character.Hp);
            var buffItem = s.Data.Items.Values.Where(i => i.Use?.Buff != null && i.Use.BuffSec > 0).OrderBy(i => i.Id).First();
            s.Inventory.Add(buffItem.Id);
            Assert.True(s.UseItem(buffItem.Id));
            Assert.Equal(buffItem.Use.BuffSec * 1.2, s.Buffs.Get(buffItem.Id).Total, 6);

            // MP 吸収: 敵の MP が減る（無くなったら吸えない）
            var data = SkillTests.Arena();
            data.Mobs["T_MP"] = Def("T_MP", "");
            var w = Hero(JobLine.Magician, 2, 0, "ワンド", data);
            Max(w, "firewizard.mp_eater");
            Max(w, "magician.energy_bolt");
            var m = w.Map.Spawn("T_MP", w.Body.X + 80, w.Body.Y);
            for (int i = 0; i < 40 && m.CurMp == 1000; i++) { w.Character.Mp = w.Stats.MaxMp; Use(w, "magician.energy_bolt"); }
            Assert.Equal(1000 - (int)Math.Floor(1000 * (2 + 20 / 2.0) / 100), m.CurMp);

            // 星の連投がのるのはデータの chainable の付いたスキルだけ
            var chain = TestData.Get().SkillList.Where(k => k.Chainable).Select(k => k.Id).ToArray();
            Assert.Equal(new[] { "thief.lucky_seven" }, chain);
        }
    }
}
