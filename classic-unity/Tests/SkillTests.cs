// スキル（JOBS.md 4-0〜4-35）: データの読み込み・SP で上げる・前提・MP/HP・待ち時間・効果の時間、
// そして 1 次職 5 系統の全スキルが実際に動くこと。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Skills;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class SkillTests
    {
        // ---------------- 試しの場（平らな広い地面と、動かない的）

        private static GameData Arena()
        {
            var d = TestData.Fresh();
            d.AddMap(MapData.FromJson("{\"id\":\"T_ARENA\",\"name\":\"試しの場\",\"region\":\"T\",\"type\":\"特\",\"width\":3000,\"height\":800,"
                + "\"footholds\":[{\"id\":\"g\",\"ground\":true,\"points\":[[0,600],[3000,600]]}],"
                + "\"ropes\":[{\"x\":2500,\"top\":400,\"bottom\":580}],"
                + "\"portals\":[{\"name\":\"sp\",\"type\":\"spawn\",\"x\":1000,\"y\":600}],\"returnMap\":\"S003\"}"));
            d.Mobs["T_DUMMY"] = MobDef.FromDict(new Dictionary<string, object>
            {
                { "id", "T_DUMMY" }, { "name", "わら人形" }, { "lv", 1L }, { "kind", "normal" }, { "move", "stand" }, { "touch", false },
                { "hp", 10000000L }, { "exp", 0L }, { "atk", 1L }, { "def", 0L }, { "avoid", 0L }, { "acc", 1L }, { "meso", 0L },
                { "width", 40L }, { "height", 50L }, { "pushed", 0L }, { "speed", 0L },
            });
            return d;
        }

        private static GameSession Hero(string line, string weapon = null, string ammo = null, int level = 30)
        {
            var data = Arena();
            var s = GameSession.NewGame(data, "試し", 7);
            s.ChangeMap("T_ARENA");
            var c = s.Character;
            c.Level = level; c.Str = 80; c.Dex = 80; c.Int = 80; c.Luk = 80;
            c.BaseMaxHp = 2000; c.BaseMaxMp = 2000;
            if (line != JobLine.Beginner) { c.Line = line; c.Tier = 1; }
            c.Sp[0] = 10; c.Sp[1] = 100;
            if (weapon != null) { s.Unequip(EquipSlot.Weapon); s.Inventory.Add(weapon); Assert.Equal(EquipResult.Ok, s.EquipItem(weapon)); }
            if (ammo != null) s.Inventory.Add(ammo, 1000);
            s.RefreshStats();
            c.Hp = s.Stats.MaxHp; c.Mp = s.Stats.MaxMp;
            s.Out.Clear();
            return s;
        }

        private static void Learn(GameSession s, string id, int level)
        {
            var def = s.Data.Skill(id);
            foreach (var p in def.Prereqs) if (s.Skills.Level(p.Skill) < p.Level) Learn(s, p.Skill, p.Level);
            while (s.Skills.Level(id) < level) Assert.Equal(LearnResult.Ok, s.LearnSkill(id));
        }

        private static Mob Dummy(GameSession s, double dx, double dy = 0) => s.Map.Spawn("T_DUMMY", s.Body.X + dx, s.Body.Y + dy);

        /// <summary>スキルを使い、当たるまで進める。出たダメージの数字を返す。</summary>
        private static List<DamageNumber> Cast(GameSession s, string id)
        {
            var nums = new List<DamageNumber>();
            s.Out.Clear();
            var r = s.UseSkill(id);
            Assert.True(r == SkillUseResult.Ok, id + ": " + r + " " + string.Join(",", s.Out.Events));
            for (int i = 0; i < 120 && s.Attack != null; i++)
            {
                s.Step(new PlayerInput());
                nums.AddRange(s.Out.Damage.Where(d => d.Kind == DamageKind.Dealt || d.Kind == DamageKind.Critical || d.Kind == DamageKind.Miss));
                s.Out.Damage.Clear();
            }
            return nums;
        }

        // ---------------- データ

        [Fact]
        public void AllFirstJobSkillsAreInData()
        {
            var d = TestData.Get();
            var first = d.SkillList.Where(x => !x.Sample).ToList();
            Assert.Equal(3, first.Count(x => x.Job == JobLine.Beginner));
            foreach (var line in JobLine.FirstJobs) Assert.Equal(6, first.Count(x => x.Job == line && x.Tier == 1));
            Assert.Equal(33, first.Count);
            // 種類がそろっている（攻撃・範囲・遠距離・移動・強化・回復・パッシブ・召喚）
            foreach (SkillKind k in Enum.GetValues(typeof(SkillKind))) Assert.Contains(d.SkillList, x => x.Kind == k);
            // 前提の参照先がある
            foreach (var s in d.SkillList) foreach (var p in s.Prereqs) Assert.NotNull(d.Skill(p.Skill));
        }

        [Fact]
        public void FormulasFromJobsMd()
        {
            var d = TestData.Get();
            var ps = d.Skill("warrior.power_strike");
            Assert.Equal(160 + 5 * 20, ps.Damage.Eval(20));
            Assert.Equal(3 + 20 / 4, ps.MpCost(20));
            Assert.Equal(3, ps.MpCost(1));
            var sb = d.Skill("warrior.slash_blast");
            Assert.Equal(6, sb.TargetCount(1));
            Assert.Equal(5, sb.HpCost(1));
            Assert.Equal(6 + 7 / 2, sb.MpCost(7));
            var eb = d.Skill("magician.energy_bolt");
            Assert.Equal(60, eb.Spell.Eval(20));   // 最大 60
            Assert.Equal(22, eb.Spell.Eval(1));
            var mg = d.Skill("magician.magic_guard");
            Assert.Equal(75, mg.Buff.MagicGuard.Eval(20)); // 最大 75%
            Assert.Equal(30 + 10 * 5, mg.Buff.Duration.Eval(5));
            var ls = d.Skill("thief.lucky_seven");
            Assert.Equal(2, ls.HitCount(1));
            Assert.Equal(5.0, ls.WeaponMul);
            Assert.Equal(20, d.Skill("bowman.double_shot").MaxLevel);
            Assert.Equal(-20 + 3, d.Skill("thief.dark_sight").Buff.Stats["speed"].EvalInt(3));
            Assert.Equal(600 - 60 * 5, d.Skill("common4.will").CooldownSec(5));
        }

        // ---------------- 覚える

        [Fact]
        public void LearnUsesTierWalletAndPrereqs()
        {
            var s = Hero(JobLine.Warrior, "eq.warrior.sword1.10");
            s.Character.Sp[1] = 3;
            Assert.Equal(LearnResult.PrereqMissing, s.LearnSkill("warrior.slash_blast"));
            Assert.Equal(LearnResult.Ok, s.LearnSkill("warrior.power_strike"));
            Assert.Equal(LearnResult.Ok, s.LearnSkill("warrior.slash_blast"));
            Assert.Equal(1, s.Character.Sp[1]);
            Assert.Equal(LearnResult.WrongJob, s.LearnSkill("magician.energy_bolt"));
            Assert.Equal(LearnResult.TierTooLow, s.LearnSkill("fighter.sword_booster"));
            Assert.Equal(LearnResult.Ok, s.LearnSkill("beginner.pebble")); // 初心者のスキルは初心者の財布から
            Assert.Equal(9, s.Character.Sp[0]);
            s.Character.Sp[1] = 50;
            Learn(s, "warrior.endure", 8);
            Assert.Equal(LearnResult.MaxLevel, s.LearnSkill("warrior.endure"));
            s.Character.Sp[1] = 0;
            Assert.Equal(LearnResult.NoSp, s.LearnSkill("warrior.iron_body"));
            // SP 振り直し
            int back = s.Skills.ResetTier(1, s.Character);
            Assert.Equal(1 + 1 + 8, back);
            Assert.Equal(0, s.Skills.Level("warrior.endure"));
        }

        // ---------------- 戦士

        [Fact]
        public void WarriorPowerStrikeAndSlashBlast()
        {
            var s = Hero(JobLine.Warrior, "eq.warrior.sword1.10");
            Learn(s, "warrior.power_strike", 20);
            Learn(s, "warrior.slash_blast", 10);
            var m = Dummy(s, 40);
            int mp0 = s.Character.Mp;
            var nums = Cast(s, "warrior.power_strike");
            Assert.Equal(mp0 - (3 + 5), s.Character.Mp);
            Assert.Single(nums);
            var r = Formulas.PhysRange("片手剣", s.Stats.Str, s.Stats.Dex, s.Stats.Watk, s.Stats.Mastery);
            Assert.InRange(nums[0].Value, (int)Math.Floor(r.Min * 2.6) - 1, (int)Math.Ceiling(r.Max * 2.6));
            // なぎ払い: 前の 8 体のうち 6 体に当たる。HP を 5 使う
            for (int i = 0; i < 7; i++) Dummy(s, 20 + i * 10);
            int hp0 = s.Character.Hp;
            nums = Cast(s, "warrior.slash_blast");
            Assert.Equal(6, nums.Select(n => n.TargetUid).Distinct().Count());
            Assert.Equal(hp0 - 5, s.Character.Hp);
        }

        [Fact]
        public void WarriorBuffsAndPassives()
        {
            var s = Hero(JobLine.Warrior, "eq.warrior.sword1.10");
            Learn(s, "warrior.iron_body", 10);
            int def0 = s.Stats.Wdef;
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("warrior.iron_body"));
            Assert.Equal(def0 + 30, s.Stats.Wdef);
            s.Step(new PlayerInput(), 60 * 100 + 2); // 持続 100 秒
            Assert.Equal(def0, s.Stats.Wdef);
            Assert.Empty(s.Buffs.List); // 消えている
            // 最大HPアップ: Lv が上がった時 +2x
            Learn(s, "warrior.hp_recovery", 5);
            Learn(s, "warrior.max_hp", 10);
            Assert.Equal(20, s.Skills.Growth(30).LevelHp);
            Assert.Equal(10, s.Skills.Growth(30).ApHp);
            s.RefreshStats();
            Assert.Equal(10 + 15, s.Stats.HpRegen); // 10 + 3x
            // 我慢: 縄でも回復
            Learn(s, "warrior.endure", 8);
            s.RefreshStats();
            Assert.Equal(30 - 16, s.Stats.RopeRegenInterval);
            s.Character.Hp = 100;
            s.Teleport(2500, 600);
            s.Step(new PlayerInput { Up = true }, 2);
            Assert.True(s.Body.OnRope);
            s.Step(new PlayerInput(), 60 * 15);
            Assert.True(s.Character.Hp > 100, "縄でも回復するはず");
            Assert.Equal(SkillUseResult.OnRope, s.UseSkill("warrior.iron_body")); // 縄の上ではスキルを使えない
        }

        // ---------------- 魔法使い

        [Fact]
        public void MagicianBoltClawAndGuard()
        {
            var s = Hero(JobLine.Magician, "eq.magician.wand.8");
            Learn(s, "magician.energy_bolt", 20);
            Learn(s, "magician.magic_claw", 20);
            var far = Dummy(s, 280);
            var nums = Cast(s, "magician.energy_bolt");
            Assert.Single(nums);
            var r = Formulas.MagicRange(s.Stats.Int, s.Stats.Matk, 60, s.Stats.Mastery);
            Assert.InRange(nums[0].Value, 1, r.Max);
            Assert.False(nums[0].Kind == DamageKind.Miss); // 魔法は必ず当たる
            // 魔力の爪は射程 220: 280 先には届かない、近ければ 2 回
            nums = Cast(s, "magician.magic_claw");
            Assert.Empty(nums);
            Dummy(s, 100);
            nums = Cast(s, "magician.magic_claw");
            Assert.Equal(2, nums.Count);
            Assert.Equal(new[] { 0, 1 }, nums.Select(n => n.Stack).ToArray()); // 数字を縦に積む
            // 魔力の盾: 受けるダメージの一部を MP で
            Learn(s, "magician.magic_guard", 20);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("magician.magic_guard"));
            s.RefreshStats();
            Assert.Equal(75, s.Stats.MagicGuard);
            int hp0 = s.Character.Hp, mp0 = s.Character.Mp;
            s.Stats.Avoid = 0;
            s.TakeHit(200, 1, 999, false, s.Body.X + 10);
            Assert.True(mp0 - s.Character.Mp > 0);
            Assert.True(mp0 - s.Character.Mp >= 3 * (hp0 - s.Character.Hp) - 3);
            // 魔力の鎧
            Learn(s, "magician.magic_armor", 10);
            int def0 = s.Stats.Wdef;
            s.UseSkill("magician.magic_armor");
            Assert.Equal(def0 + 20, s.Stats.Wdef);
            // パッシブ
            Learn(s, "magician.mp_recovery", 10);
            Learn(s, "magician.max_mp", 10);
            s.RefreshStats();
            Assert.Equal(3 + s.Stats.Int / 10 + 10 * 30 / 10, s.Stats.MpRegen);
            Assert.Equal(10, s.Skills.Growth(30).LevelMp);
        }

        [Fact]
        public void MpShortageAndCooldown()
        {
            var s = Hero(JobLine.Magician, "eq.magician.wand.8");
            Learn(s, "magician.energy_bolt", 1);
            s.Character.Mp = 3;
            Assert.Equal(SkillUseResult.NoMp, s.UseSkill("magician.energy_bolt"));
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.SkillFailed);
            // 待ち時間（4 次の見本: 意志の力 600-60x 秒）
            s.Character.Tier = 4; s.Character.Line = JobLine.Warrior; s.Character.Sp[4] = 5;
            s.Character.Mp = 1000;
            Learn(s, "common4.will", 5);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("common4.will"));
            Assert.Equal(SkillUseResult.Cooldown, s.UseSkill("common4.will"));
            s.Step(new PlayerInput(), 60 * 300 + 1);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("common4.will"));
        }

        // ---------------- 弓使い

        [Fact]
        public void BowmanArrowsDoubleShotRangeAndCrit()
        {
            var s = Hero(JobLine.Bowman, "eq.bowman.bow.10", "use.arrow_bow");
            Learn(s, "bowman.power_arrow", 10);
            Learn(s, "bowman.double_shot", 20);
            Dummy(s, 340);
            int arrows = s.Inventory.Count("use.arrow_bow");
            var nums = Cast(s, "bowman.double_shot");
            Assert.Equal(2, nums.Count);
            Assert.Equal(arrows - 2, s.Inventory.Count("use.arrow_bow"));
            nums = Cast(s, "bowman.power_arrow");
            Assert.Single(nums);
            // 遠目で射程が延びる: 400 先の的
            s.Map.Mobs.Clear();
            Dummy(s, 400);
            Assert.Empty(Cast(s, "bowman.power_arrow"));
            Learn(s, "bowman.eagle_eye", 8);
            s.RefreshStats();
            Assert.Equal(80, s.Stats.RangeBonus);
            Assert.Single(Cast(s, "bowman.power_arrow"));
            // 必中の矢: 会心が出る（20 Lv で 22%）
            Learn(s, "bowman.critical_shot", 20);
            int crit = 0, total = 0;
            for (int i = 0; i < 100; i++) foreach (var n in Cast(s, "bowman.double_shot")) { total++; if (n.Kind == DamageKind.Critical) crit++; }
            Assert.InRange(crit / (double)total, 0.12, 0.34);
            // 集中
            Learn(s, "bowman.focus", 10);
            double acc0 = s.Stats.Acc;
            s.UseSkill("bowman.focus");
            Assert.Equal(acc0 + 10, s.Stats.Acc, 9);
            // 矢が無いと撃てない
            s.Inventory.Remove("use.arrow_bow", s.Inventory.Count("use.arrow_bow"));
            s.RefreshStats();
            Assert.Equal(SkillUseResult.NoAmmo, s.UseSkill("bowman.double_shot"));
            Assert.False(s.StartBasicAttack());
        }

        // ---------------- 盗賊

        [Fact]
        public void ThiefLuckySevenStarsAndDoubleStab()
        {
            var s = Hero(JobLine.Thief, "eq.thief.claw.10", "use.star_iron");
            Learn(s, "thief.lucky_seven", 20);
            Dummy(s, 200);
            int stars = s.Inventory.Count("use.star_iron");
            var nums = Cast(s, "thief.lucky_seven");
            Assert.Equal(2, nums.Count);
            Assert.Equal(stars - 2, s.Inventory.Count("use.star_iron"));
            // 二つ星投げは LUK×5.0 で計算（ふつうの投げ 3.6 より強い）
            var r = Formulas.PhysRange(5.0, s.Stats.Luk, s.Stats.Str + s.Stats.Dex, s.Stats.Watk, s.Stats.Mastery);
            foreach (var n in nums) Assert.InRange(n.Value, 1, (int)Math.Ceiling(r.Max * 1.4));
            Learn(s, "thief.double_stab", 1);
            Assert.Equal(SkillUseResult.WrongWeapon, s.UseSkill("thief.double_stab")); // 短剣が要る
            // 短剣に持ち替えて二段突き
            s.Unequip(EquipSlot.Weapon);
            s.Inventory.Add("eq.thief.dagger.10");
            s.EquipItem("eq.thief.dagger.10");
            Learn(s, "thief.double_stab", 10);
            Dummy(s, 40);
            nums = Cast(s, "thief.double_stab");
            Assert.Equal(2, nums.Count);
            Assert.Equal(SkillUseResult.WrongWeapon, s.UseSkill("thief.lucky_seven"));
        }

        [Fact]
        public void ThiefDisorderAndDarkSight()
        {
            var s = Hero(JobLine.Thief, "eq.thief.dagger.10");
            Learn(s, "thief.disorder", 10);
            var m = s.Map.Spawn("M007", s.Body.X + 50, s.Body.Y);
            Cast(s, "thief.disorder");
            Assert.Equal(10, m.AtkDown);
            Assert.Equal(10, m.DefDown);
            Assert.Equal(m.Def.Atk - 10, m.Atk);
            Assert.Equal(m.Def.Hp, m.Hp); // ダメージは無い
            s.Step(new PlayerInput(), 60 * 31);
            Assert.Equal(0, m.AtkDown); // 3x 秒で切れる
            // 闇隠れ: 敵に触れても当たらない。攻撃すると解ける
            Learn(s, "thief.dark_sight", 10);
            s.Map.Mobs.Clear();
            var touch = s.Map.Spawn("M004", s.Body.X, s.Body.Y);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("thief.dark_sight"));
            Assert.True(s.Stats.Stealth);
            int hp = s.Character.Hp;
            s.Step(new PlayerInput(), 120);
            Assert.True(s.Character.Hp >= hp, "闇隠れ中は触れても減らない"); // 自然回復で増えることはある
            s.Step(new PlayerInput { Attack = true }, 1);
            s.RefreshStats();
            Assert.False(s.Stats.Stealth);
            // 身のこなし
            double acc = s.Stats.Acc, avoid = s.Stats.Avoid;
            Learn(s, "thief.nimble_body", 20);
            s.RefreshStats();
            Assert.Equal(acc + 20, s.Stats.Acc, 9);
            Assert.Equal(avoid + 20, s.Stats.Avoid, 9);
            Learn(s, "thief.keen_eyes", 8);
            s.Unequip(EquipSlot.Weapon);
            s.Inventory.Add("eq.thief.claw.10");
            s.EquipItem("eq.thief.claw.10");
            Assert.Equal(80, s.Stats.RangeBonus);
        }

        [Fact]
        public void HasteSampleSpeedsUpWalking()
        {
            var s = Hero(JobLine.Thief, "eq.thief.claw.10");
            s.Character.Tier = 2; s.Character.Sp[2] = 20;
            Learn(s, "assassin.haste", 20);
            s.UseSkill("assassin.haste");
            Assert.Equal(120, s.Stats.Speed);
            Assert.Equal(110, s.Stats.Jump);
            s.Step(new PlayerInput { Right = true }, 60);
            Assert.Equal(150, s.Body.Vx, 6); // 125 × 1.2
        }

        // ---------------- 海賊

        [Fact]
        public void PirateFistGunKickAndDash()
        {
            var s = Hero(JobLine.Pirate, "eq.pirate.knuckle.10");
            Learn(s, "pirate.flash_fist", 20);
            Dummy(s, 40);
            Assert.Equal(2, Cast(s, "pirate.flash_fist").Count);
            Learn(s, "pirate.double_shot", 1);
            Assert.Equal(SkillUseResult.WrongWeapon, s.UseSkill("pirate.double_shot")); // 銃が要る
            // 宙返り蹴り: まわり（前と後ろ）に当たる
            Learn(s, "pirate.somersault_kick", 10);
            s.Map.Mobs.Clear();
            Dummy(s, 50); Dummy(s, -50); Dummy(s, 400);
            var nums = Cast(s, "pirate.somersault_kick");
            Assert.Equal(2, nums.Select(n => n.TargetUid).Distinct().Count());
            // 早足: 前へ押し出され、速さとジャンプが上がる
            Learn(s, "pirate.dash", 10);
            s.Step(new PlayerInput(), 30);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("pirate.dash"));
            Assert.Equal(s.Body.Facing * 220, s.Body.Vx);
            Assert.Equal(100 + 20, s.Stats.Speed);
            Assert.Equal(110, s.Stats.Jump);
            s.Step(new PlayerInput(), 60 * 13);
            Assert.Equal(100, s.Stats.Speed); // 2+x 秒で切れる
            // 銃に持ち替えてダブルショット
            s.Unequip(EquipSlot.Weapon);
            s.Inventory.Add("eq.pirate.gun.10");
            s.Inventory.Add("use.bullet_lead", 500);
            s.EquipItem("eq.pirate.gun.10");
            Learn(s, "pirate.double_shot", 10);
            Learn(s, "pirate.gun_mastery", 8);
            s.Map.Mobs.Clear();
            Dummy(s, 320 * s.Body.Facing);
            Assert.Equal(2, Cast(s, "pirate.double_shot").Count); // 280 + 80
            Learn(s, "pirate.nimble_stance", 5);
        }

        // ---------------- 初心者・回復・召喚・加速

        [Fact]
        public void BeginnerSkills()
        {
            var s = Hero(JobLine.Beginner, null, null, 8);
            Learn(s, "beginner.pebble", 3);
            Dummy(s, 150);
            var nums = Cast(s, "beginner.pebble");
            Assert.Single(nums);
            Assert.Equal(45, nums[0].Value); // 固定ダメージ 15x
            Learn(s, "beginner.rest", 2);
            s.Character.Hp = 100;
            s.UseSkill("beginner.rest");
            s.Step(new PlayerInput { Right = true }, 60 * 10 + 1); // 歩いていても 10 秒ごとに回復
            Assert.Equal(116, s.Character.Hp);
            Learn(s, "beginner.nimble_feet", 1);
            s.UseSkill("beginner.nimble_feet");
            Assert.Equal(115, s.Stats.Speed);
        }

        [Fact]
        public void HealSummonAndBooster()
        {
            var s = Hero(JobLine.Magician, "eq.magician.wand.8");
            s.Character.Tier = 4; s.Character.Sp[2] = 30; s.Character.Sp[4] = 30;
            Learn(s, "cleric.heal", 10);
            s.Character.Hp = 100;
            s.UseSkill("cleric.heal");
            Assert.Equal(Math.Min(s.Stats.MaxHp, 100 + s.Stats.MaxHp * 30 / 100), s.Character.Hp);
            Assert.Contains(s.Out.Damage, d => d.Kind == DamageKind.Heal);
            // 召喚（見本: 闇の獣。系統が違っても仕組みは同じ）
            s.Character.Line = JobLine.Warrior;
            Learn(s, "darkknight.beholder", 2);
            s.Character.Hp = 100;
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("darkknight.beholder"));
            Assert.NotNull(s.Buffs.Summon);
            s.Step(new PlayerInput { Right = true }, 60 * 20 + 1);
            Assert.Equal(100 + 140, s.Character.Hp);
            s.Step(new PlayerInput(), 60 * 41);
            Assert.Null(s.Buffs.Summon); // 30x 秒で帰る
            // 加速（見本: 剣の加速）: 剣の時だけ
            Assert.Equal(SkillUseResult.WrongWeapon, Try(s, "fighter.sword_booster"));
            s.Unequip(EquipSlot.Weapon);
            s.Inventory.Add("eq.warrior.sword1.10");
            s.EquipItem("eq.warrior.sword1.10");
            int stage = s.Stats.AttackStage;
            Assert.Equal(SkillUseResult.Ok, Try(s, "fighter.sword_booster"));
            Assert.Equal(stage - 2, s.Stats.AttackStage);
        }

        private static SkillUseResult Try(GameSession s, string id)
        {
            if (s.Skills.Level(id) == 0) Learn(s, id, 1);
            return s.UseSkill(id);
        }

        [Fact]
        public void BuffBlinksInLastFiveSeconds()
        {
            var b = new ActiveBuff { Id = "x", Remaining = 6, Total = 6 };
            Assert.False(b.Blinking);
            var set = new BuffSet();
            set.Apply(b);
            set.Tick(1.5);
            Assert.True(b.Blinking);
            var r = set.Tick(5);
            Assert.Contains("x", r.Expired);
        }
    }
}
