// 2〜4 次のスキル（JOBS.md 4-2〜4-41）: 全 306 スキルが読めて例外なく使えること、職ごとの代表スキルの数値、
// 闘気・気合い・追撃・付与・召喚・テレポート・突進・矢が無い時の弱い殴り・動きの種類（Pose.AttackKind）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Save;
using Lumina.Core.Skills;
using Lumina.Core.Status;
using Xunit;

namespace Lumina.Core.Tests
{
    public class SkillTierTests
    {
        private static readonly Dictionary<string, string> WeaponItem = new Dictionary<string, string>
        {
            { "片手剣", "eq.starter.9" }, { "両手剣", "eq.warrior.sword2.10" }, { "片手斧", "eq.warrior.axe1.10" }, { "片手鈍器", "eq.starter.10" },
            { "槍", "eq.warrior.spear.10" }, { "矛", "eq.warrior.polearm.10" }, { "弓", "eq.starter.12" }, { "クロスボウ", "eq.bowman.xbow.10" },
            { "クロー", "eq.thief.claw.10" }, { "短剣", "eq.starter.13" }, { "ナックル", "eq.pirate.knuckle.10" }, { "銃", "eq.pirate.gun.10" },
            { "ワンド", "eq.magician.wand.8" }, { "スタッフ", "eq.starter.11" },
        };
        private static readonly Dictionary<string, string> AmmoItem = new Dictionary<string, string>
        {
            { "弓", "use.arrow_bow" }, { "クロスボウ", "use.arrow_xbow" }, { "クロー", "use.star_iron" }, { "銃", "use.bullet_lead" },
        };
        private static readonly Dictionary<string, string> LineWeapon = new Dictionary<string, string>
        {
            { JobLine.Beginner, "片手剣" }, { JobLine.Warrior, "片手剣" }, { JobLine.Magician, "ワンド" }, { JobLine.Bowman, "弓" }, { JobLine.Thief, "クロー" }, { JobLine.Pirate, "ナックル" },
        };

        /// <summary>系統・段階・枝・武器を決めた試しのキャラ（Lv 200、SP はたっぷり）。</summary>
        private static GameSession Hero(string line, int tier, int branch, string weaponType)
        {
            var w = WeaponItem[weaponType];
            AmmoItem.TryGetValue(weaponType, out var ammo);
            var s = SkillTests.Hero(line, w, ammo, 200);
            s.Character.Tier = line == JobLine.Beginner ? 0 : tier;
            s.Character.Branch = Math.Max(0, branch);
            for (int t = 0; t < 5; t++) s.Character.Sp[t] = 999;
            s.Character.Int = 300;
            s.RefreshStats();
            s.Character.Hp = s.Stats.MaxHp; s.Character.Mp = s.Stats.MaxMp;
            return s;
        }

        private static GameSession HeroFor(string skillId, string weaponType = null)
        {
            var def = TestData.Get().Skill(skillId);
            string wt = weaponType ?? def.Weapons?.FirstOrDefault() ?? def.Buff?.Weapons?.FirstOrDefault() ?? LineWeapon[def.Job];
            return Hero(def.Job, Math.Max(1, def.Tier), def.Branch, wt);
        }

        private static void Max(GameSession s, string id)
        {
            var def = s.Data.Skill(id);
            SkillTests.Learn(s, id, s.Skills.MaxLevel(def));
        }

        private static List<DamageNumber> Use(GameSession s, string id, int frames = 240)
        {
            var nums = new List<DamageNumber>();
            s.Out.Clear();
            var r = s.UseSkill(id);
            Assert.True(r == SkillUseResult.Ok, id + ": " + r + " " + string.Join(",", s.Out.Events));
            for (int i = 0; i < frames; i++)
            {
                s.Step(new PlayerInput());
                nums.AddRange(s.Out.Damage.Where(d => d.Kind == DamageKind.Dealt || d.Kind == DamageKind.Critical || d.Kind == DamageKind.Miss));
                s.Out.Damage.Clear();
                if (s.Attack == null && i > 2 && frames == 240) break;
            }
            return nums;
        }

        private static void Prepare(GameSession s, SkillDef def)
        {
            // 使う条件をそろえる（変身・付与・闇の獣・闘気・気合い・空中・お金）
            if (def.NeedsBuff != null)
            {
                var need = s.Data.Skill(def.NeedsBuff.First(b => s.Skills.CanLearn(b, s.Character) == LearnResult.Ok || s.Skills.Level(b) > 0));
                if (s.Skills.Level(need.Id) == 0) SkillTests.Learn(s, need.Id, 1);
                Assert.Equal(SkillUseResult.Ok, s.UseSkill(need.Id));
            }
            if (def.NeedsCharge)
            {
                var ch = s.Data.SkillList.First(k => k.Buff != null && k.Buff.Charge && SkillBook.JobMatches(k, s.Character) && k.Tier <= s.Character.Tier);
                SkillTests.Learn(s, ch.Id, 1);
                Assert.Equal(SkillUseResult.Ok, s.UseSkill(ch.Id));
            }
            if (def.ComboUse != 0)
            {
                var cb = s.Data.SkillList.First(k => k.Buff != null && k.Buff.ComboMax > 0 && SkillBook.JobMatches(k, s.Character));
                SkillTests.Learn(s, cb.Id, 1);
                Assert.Equal(SkillUseResult.Ok, s.UseSkill(cb.Id));
                s.Buffs.ComboBuff.Orbs = 10;
            }
            if (def.NeedsEnergy) s.Energy = GameSession.EnergyMax;
            s.Inventory.AddMeso(10_000_000);
            s.Character.Hp = s.Stats.MaxHp; s.Character.Mp = s.Stats.MaxMp;
            if (def.AirJumpVx != null) s.Step(new PlayerInput { Jump = true, JumpPressed = true }, 4);
        }

        // ---------------- データ

        [Fact]
        public void AllJobsMdSkillsAreInData()
        {
            var d = TestData.Get();
            Assert.Equal(306, d.SkillList.Count);
            int[] want = { 3, 30, 82, 87, 104 };
            for (int t = 0; t <= 4; t++) Assert.Equal(want[t], d.SkillList.Count(s => s.Tier == t));
            Assert.Equal(d.SkillList.Count, d.SkillList.Select(s => s.Id).Distinct().Count());
            foreach (var s in d.SkillList)
            {
                Assert.False(string.IsNullOrEmpty(s.Name), s.Id);
                Assert.False(string.IsNullOrEmpty(s.Desc), s.Id);
                if (s.Tier >= 2) Assert.True(s.Branch >= 0, s.Id + " の枝が無い");
                foreach (var p in s.Prereqs)
                {
                    var pd = d.Skill(p.Skill);
                    Assert.NotNull(pd);
                    Assert.True(pd.Job == s.Job && (pd.Branch < 0 || pd.Branch == s.Branch) && pd.Tier <= s.Tier, s.Id + " の前提 " + p.Skill);
                }
                if (s.IsAttack) Assert.True(s.Range.Front > 0, s.Id);
            }
            // ★ のスキル（4 次の極意の書）
            var stars = d.SkillList.Where(s => s.MasterLevel > 0).ToList();
            Assert.All(stars, s => Assert.Equal(4, s.Tier));
            Assert.Equal(30, d.Skill("champion.brandish").MasterLevel);
            // 4 次の共通（全能力の加護・意志の力）は 4 次の 12 職みんなにある
            Assert.Equal(12, d.SkillList.Count(s => s.Name == "全能力の加護"));
            Assert.Equal(12, d.SkillList.Count(s => s.Name == "意志の力" && s.CooldownSec(5) == 300));
            // 2〜3 次は待ち時間なし（気合いの回復だけ例外）・JOBS.md 6 章
            Assert.Equal(new[] { "brawler.mp_recovery" }, d.SkillList.Where(s => s.Tier is 2 or 3 && s.Cooldown != null).Select(s => s.Id).ToArray());
        }

        [Fact]
        public void EverySkillLearnsAndUsesWithoutException()
        {
            var d = TestData.Get();
            var failed = new List<string>();
            foreach (var def in d.SkillList)
            {
                var s = HeroFor(def.Id);
                foreach (var dx in new[] { -60, 40, 90, 150, 260 }) SkillTests.Dummy(s, dx);
                Max(s, def.Id);
                Assert.Equal(s.Skills.MaxLevel(def), s.Skills.Level(def.Id));
                if (def.Kind == SkillKind.Passive)
                {
                    Assert.Equal(SkillUseResult.Passive, s.UseSkill(def.Id));
                    s.RefreshStats();
                    continue;
                }
                Prepare(s, def);
                s.Out.Clear();
                var r = s.UseSkill(def.Id);
                if (r != SkillUseResult.Ok) { failed.Add(def.Id + ":" + r + " " + string.Join(",", s.Out.Events)); continue; }
                s.Step(new PlayerInput(), 60 * 4);
                Assert.False(s.Dead, def.Id);
            }
            Assert.Empty(failed);
        }

        [Fact]
        public void BranchesAndMasteryBook()
        {
            var s = Hero(JobLine.Warrior, 4, 1, "片手剣"); // パラディン
            Assert.Equal(LearnResult.WrongJob, s.LearnSkill("fighter.sword_mastery"));
            Assert.Equal(LearnResult.Ok, s.LearnSkill("page.sword_mastery"));
            Assert.Equal(LearnResult.Ok, s.LearnSkill("paladin.blast"));
            s.Character.Branch = 0; // チャンピオン
            SkillTests.Learn(s, "champion.brandish", 20);
            Assert.Equal(LearnResult.MaxLevel, s.LearnSkill("champion.brandish"));
            Assert.False(s.Skills.UseMasteryBook("champion.rush", 30, 1, s.Rng)); // ★でない
            Assert.True(s.Skills.UseMasteryBook("champion.brandish", 30, 1, s.Rng));
            Assert.Equal(LearnResult.Ok, s.LearnSkill("champion.brandish"));
            Assert.Equal(21, s.Skills.Level("champion.brandish"));
            // 保存しても残る
            var back = SaveSerializer.FromJson(SaveSerializer.ToJson(s.ToSaveData("t")));
            var g = GameSession.FromSave(s.Data, back);
            Assert.Equal(30, g.Skills.MaxLevel(g.Data.Skill("champion.brandish")));
        }

        // ---------------- 戦士

        [Fact]
        public void WarriorComboFinalAttackAndBrandish()
        {
            var s = Hero(JobLine.Warrior, 4, 0, "片手剣");
            Max(s, "crusader.combo"); Max(s, "crusader.panic_sword"); Max(s, "fighter.sword_final");
            var m = SkillTests.Dummy(s, 40);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("crusader.combo"));
            for (int i = 0; i < 3; i++) { s.StartBasicAttack(); s.Step(new PlayerInput(), 60); }
            Assert.Equal(3, s.ComboOrbs);
            Assert.Equal(3 * (30 / 2.0 + 5), s.ComboBonusPct(), 6);
            int mp = s.Character.Mp;
            Use(s, "crusader.panic_sword");
            Assert.Equal(0, s.ComboOrbs);                // 闘気を全部使う
            Assert.Equal(mp - (12 + 10), s.Character.Mp);
            Assert.True(m.Status.Has(StatusKind.Darkness)); // 暗闇
            // 剣の追撃 30: 60% で 190% の追撃
            int fa = 0;
            for (int i = 0; i < 60; i++)
            {
                s.Out.Clear(); s.StartBasicAttack(); s.Step(new PlayerInput(), 50);
                if (s.Out.Events.Any(e => e.Type == GameEventType.MobHit && e.Text == "final_attack")) fa++;
            }
            Assert.InRange(fa, 22, 50);
            // 乱れ斬り（20）: 前の 3 体に 2 回ずつ、各 360%
            s.Buffs.Clear(); s.Map.Mobs.Clear(); s.RefreshStats();
            Max(s, "champion.brandish");
            for (int i = 0; i < 5; i++) SkillTests.Dummy(s, 30 + i * 15);
            s.Out.Clear();
            s.UseSkill("champion.brandish");
            Assert.Equal(AttackMotion.Swing, s.Attack.Motion);
            var nums = new List<DamageNumber>();
            for (int i = 0; i < 90 && s.Attack != null; i++) { s.Step(new PlayerInput()); nums.AddRange(s.Out.Damage.Where(n => n.Kind == DamageKind.Dealt || n.Kind == DamageKind.Critical)); s.Out.Damage.Clear(); }
            var main = nums.Where(n => n.Stack < 2).ToList(); // 追撃の数字（Stack 8）は除く
            Assert.Equal(6, main.Count);
            Assert.Equal(3, main.Select(n => n.TargetUid).Distinct().Count());
            var r = Formulas.PhysRange("片手剣", s.Stats.Str, s.Stats.Dex, s.Stats.Watk, s.Stats.Mastery);
            foreach (var n in main) Assert.InRange(n.Value, (int)Math.Floor(r.Min * 3.6) - 1, (int)Math.Ceiling(r.Max * 3.6));
        }

        [Fact]
        public void SpearmanCrusherRoarAndHyperBody()
        {
            var s = Hero(JobLine.Warrior, 3, 2, "槍");
            Max(s, "dragoon.crusher_spear");
            for (int i = 0; i < 4; i++) SkillTests.Dummy(s, 40 + i * 20);
            s.UseSkill("dragoon.crusher_spear");
            Assert.Equal(AttackMotion.Stab, s.Attack.Motion);
            Assert.Equal(s.Stats.AttackDelay * 1.3, s.Attack.Duration, 6);
            s.Step(new PlayerInput(), 2);
            Assert.Equal(AttackMotion.Stab, s.Pose.AttackKind);
            var nums = new List<DamageNumber>();
            for (int i = 0; i < 90 && s.Attack != null; i++) { s.Step(new PlayerInput()); nums.AddRange(s.Out.Damage.Where(n => n.Kind != DamageKind.Taken)); s.Out.Damage.Clear(); }
            Assert.Equal(9, nums.Count(n => n.Stack < 3)); // 3 体 × 3 回
            // 竜の咆哮: HP を最大の 20% 払い、自分は 2 秒動けない
            Max(s, "dragoon.dragon_roar");
            int hp = s.Character.Hp = s.Stats.MaxHp;
            Use(s, "dragoon.dragon_roar");
            Assert.Equal(hp - s.Stats.MaxHp * 20 / 100, s.Character.Hp);
            Assert.True(s.Status.Has(StatusKind.Stun));               // 自分は 2 秒動けない
            Assert.Equal(SkillUseResult.Stunned, s.UseSkill("dragoon.dragon_roar"));
            s.Step(new PlayerInput(), 60 * 2 + 5);
            // 体力強化: 最大 HP +60%
            Max(s, "spearman.hyper_body");
            int max0 = s.Stats.MaxHp;
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("spearman.hyper_body"));
            Assert.Equal(max0 + max0 * 60 / 100, s.Stats.MaxHp);
        }

        // ---------------- 魔法使い

        [Fact]
        public void MagicianSpellsAmplifyTeleportAndStatus()
        {
            var s = Hero(JobLine.Magician, 4, 0, "ワンド");
            Max(s, "firewizard.fire_arrow");
            Assert.Equal(180, s.Data.Skill("firewizard.fire_arrow").Spell.Eval(30));
            Assert.Equal(12 + 10, s.SkillMpCost(s.Data.Skill("firewizard.fire_arrow"), 30));
            SkillTests.Dummy(s, 200);
            var nums = Use(s, "firewizard.fire_arrow");
            Assert.Single(nums);
            var r = Formulas.MagicRange(s.Stats.Int, s.Stats.Matk, 180, s.Stats.Mastery);
            Assert.InRange(nums[0].Value, 1, r.Max);
            // 属性の増幅 30: MP ×1.5・熟練度 60%
            Max(s, "firemage.amplify");
            s.RefreshStats();
            Assert.Equal(33, s.SkillMpCost(s.Data.Skill("firewizard.fire_arrow"), 30));
            Assert.Equal(0.6, s.Stats.Mastery, 6);
            // 流星群: 詠唱 1.5 秒の後、画面の 15 体
            s.Map.Mobs.Clear();
            for (int i = 0; i < 16; i++) SkillTests.Dummy(s, -380 + i * 50);
            Max(s, "firearchmage.meteor");
            s.UseSkill("firearchmage.meteor");
            Assert.Equal(AttackMotion.Cast, s.Attack.Motion);
            Assert.Equal(1.5 + s.Stats.AttackDelay * Physics.Feel.SwingHitFraction, s.Attack.HitTime, 6);
            s.Out.Clear();
            s.Step(new PlayerInput(), 80);
            Assert.DoesNotContain(s.Out.Damage, n => n.Kind == DamageKind.Dealt); // まだ詠唱中
            s.Step(new PlayerInput(), 40);
            Assert.Equal(15, s.Out.Damage.Where(n => n.Kind == DamageKind.Dealt || n.Kind == DamageKind.Critical).Select(n => n.TargetUid).Distinct().Count());
            s.Step(new PlayerInput(), 60);
            // テレポート（20）: 前へ 250 px
            s.Character.Branch = 1; s.Map.Mobs.Clear();
            Max(s, "icewizard.teleport");
            double x0 = s.Body.X;
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("icewizard.teleport"));
            Assert.Equal(x0 + s.Body.Facing * 250, s.Body.X, 6);
            // 冷気の矢: 凍らせる（状態異常の仕組みへ）
            var m = SkillTests.Dummy(s, 150 * s.Body.Facing);
            Max(s, "icewizard.cold_beam");
            Use(s, "icewizard.cold_beam");
            Assert.True(m.Status.Has(StatusKind.Freeze));
        }

        [Fact]
        public void ClericHealHurtsUndeadAndBishopRevives()
        {
            var s = Hero(JobLine.Magician, 4, 2, "ワンド");
            Max(s, "bishop.resurrection");
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("bishop.resurrection"));
            s.Stats.Avoid = 0;
            s.Character.Hp = 1;
            s.TakeHit(5000, 200, 999, false, s.Body.X + 10);
            Assert.False(s.Dead);
            Assert.Equal(s.Stats.MaxHp / 2, s.Character.Hp);
            Assert.Null(s.Buffs.ReviveBuff);
            // 聖なる御印: 経験値 +40%
            Max(s, "priest.holy_symbol");
            s.UseSkill("priest.holy_symbol");
            Assert.Equal(40, s.Stats.Mods.ExpPct);
        }

        // ---------------- 弓使い

        [Fact]
        public void BowmanBombPierceSnipeAndHurricane()
        {
            var s = Hero(JobLine.Bowman, 4, 0, "弓");
            Max(s, "hunter.arrow_bomb");
            SkillTests.Dummy(s, 250); SkillTests.Dummy(s, 290); SkillTests.Dummy(s, 320); SkillTests.Dummy(s, 500);
            var nums = Use(s, "hunter.arrow_bomb");
            Assert.Equal(3, nums.Select(n => n.TargetUid).Distinct().Count()); // 最初の 1 体のまわりだけ
            // 嵐の連射: 押しっぱなしで 1 秒に 8 本（MP 1 本 1、矢 1 本 1）
            s.Map.Mobs.Clear();
            SkillTests.Dummy(s, 200);
            Max(s, "masterarcher.hurricane");
            int arrows = s.Inventory.Count("use.arrow_bow"), mp = s.Character.Mp, shots = 0;
            for (int i = 0; i < 60; i++)
            {
                s.Out.Clear();
                s.Step(new PlayerInput { SkillHeld = "masterarcher.hurricane" });
                shots += s.Out.Events.Count(e => e.Type == GameEventType.SkillUsed);
                if (i == 3) Assert.Equal(AttackMotion.Shoot, s.Pose.AttackKind);
            }
            Assert.InRange(shots, 7, 9);
            Assert.Equal(arrows - shots, s.Inventory.Count("use.arrow_bow"));
            Assert.Equal(mp - shots, s.Character.Mp);
            s.Step(new PlayerInput(), 10);
            // 魂の矢: 矢を使わない
            Max(s, "hunter.soul_arrow");
            s.UseSkill("hunter.soul_arrow");
            arrows = s.Inventory.Count("use.arrow_bow");
            Max(s, "ranger.quad_shot");
            nums = Use(s, "ranger.quad_shot");
            Assert.Equal(4, nums.Count(n => n.Stack < 4));
            Assert.Equal(arrows, s.Inventory.Count("use.arrow_bow"));
            // 四連射 30 は 160% × 4
            var r = Formulas.PhysRange(3.4, s.Stats.Dex, s.Stats.Str, s.Stats.Watk, s.Stats.Mastery);
            foreach (var n in nums.Where(n => n.Kind == DamageKind.Dealt && n.Stack < 4)) Assert.InRange(n.Value, (int)Math.Floor(r.Min * 1.6) - 1, (int)Math.Ceiling(r.Max * 1.6));
        }

        [Fact]
        public void CrossbowPierceAndSnipeCooldown()
        {
            var s = Hero(JobLine.Bowman, 4, 1, "クロスボウ");
            Max(s, "crossbowman.iron_arrow");
            for (int i = 0; i < 7; i++) SkillTests.Dummy(s, 60 + i * 50);
            var nums = Use(s, "crossbowman.iron_arrow");
            Assert.Equal(6, nums.Select(n => n.TargetUid).Distinct().Count()); // 一直線の 6 体
            Max(s, "marksman.snipe");
            Use(s, "marksman.snipe");
            Assert.Equal(SkillUseResult.Cooldown, s.UseSkill("marksman.snipe"));
            s.Step(new PlayerInput(), 60 * 5 + 1);
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("marksman.snipe"));
        }

        // ---------------- 盗賊

        [Fact]
        public void ThiefShadowPartnerMesoTossAndSavageBlow()
        {
            var s = Hero(JobLine.Thief, 4, 0, "クロー");
            Max(s, "hermit.shadow_partner"); Max(s, "thief.lucky_seven");
            SkillTests.Dummy(s, 100);
            s.UseSkill("hermit.shadow_partner");
            var nums = Use(s, "thief.lucky_seven");
            Assert.Equal(4, nums.Count); // 2 つ ＋ 影の 2 つ
            // 三つ星投げ（20）: LUK×5.0 で 200% × 3
            Max(s, "nightstalker.triple_throw");
            s.Buffs.Clear(); s.RefreshStats();
            s.Out.Clear(); s.UseSkill("nightstalker.triple_throw");
            Assert.Equal(AttackMotion.Throw, s.Attack.Motion);
            nums = new List<DamageNumber>();
            for (int i = 0; i < 60 && s.Attack != null; i++) { s.Step(new PlayerInput()); nums.AddRange(s.Out.Damage.Where(n => n.Kind == DamageKind.Dealt)); s.Out.Damage.Clear(); }
            var r = Formulas.PhysRange(5.0, s.Stats.Luk, s.Stats.Str + s.Stats.Dex, s.Stats.Watk, s.Stats.Mastery);
            Assert.Equal(3, nums.Count + 0 * r.Max);
            foreach (var n in nums) Assert.InRange(n.Value, (int)Math.Floor(r.Min * 2.0) - 1, (int)Math.Ceiling(r.Max * 2.0));
            // お金の投げ打ち（30）: お金 300 で固定 4500
            Max(s, "hermit.meso_toss");
            long meso = s.Inventory.Meso = 1000;
            nums = Use(s, "hermit.meso_toss");
            Assert.Equal(meso - 300, s.Inventory.Meso);
            Assert.Equal(5 * 30 * 30, nums.Single().Value);
            // 連続斬り（短剣）: 6 回・突き
            var b = Hero(JobLine.Thief, 2, 1, "短剣");
            Max(b, "bandit.savage_blow");
            SkillTests.Dummy(b, 40);
            b.UseSkill("bandit.savage_blow");
            Assert.Equal(AttackMotion.Stab, b.Attack.Motion);
            Assert.Equal(6, Use2(b).Count);
        }

        private static List<DamageNumber> Use2(GameSession s)
        {
            var nums = new List<DamageNumber>();
            for (int i = 0; i < 120 && s.Attack != null; i++) { s.Step(new PlayerInput()); nums.AddRange(s.Out.Damage.Where(n => n.Kind == DamageKind.Dealt || n.Kind == DamageKind.Critical || n.Kind == DamageKind.Miss)); s.Out.Damage.Clear(); }
            return nums;
        }

        [Fact]
        public void AssassinateFromDarkSightIsStronger()
        {
            var s = Hero(JobLine.Thief, 4, 1, "短剣");
            Max(s, "thief.dark_sight"); Max(s, "shadowblade.assassinate");
            SkillTests.Dummy(s, 40);
            long plain = 0, hidden = 0;
            for (int i = 0; i < 6; i++)
            {
                s.Character.Mp = s.Stats.MaxMp;
                s.UseSkill("shadowblade.assassinate"); plain += Use2(s).Sum(n => n.Value);
                s.UseSkill("thief.dark_sight");
                s.UseSkill("shadowblade.assassinate"); hidden += Use2(s).Sum(n => n.Value);
            }
            Assert.InRange(hidden / (double)plain, 1.6, 2.5); // 闇隠れ中は 2 倍
        }

        // ---------------- 海賊

        [Fact]
        public void PirateDashEnergyTransformAndTurret()
        {
            var s = Hero(JobLine.Pirate, 4, 0, "ナックル");
            // 突進の拳: 前へ突進
            Max(s, "brawler.corkscrew");
            SkillTests.Dummy(s, 160);
            double x0 = s.Body.X;
            s.UseSkill("brawler.corkscrew");
            Assert.Equal(AttackMotion.Punch, s.Attack.Motion);
            Use2(s);
            Assert.True((s.Body.X - x0) * s.Body.Facing > 60, "突進していない " + (s.Body.X - x0));
            // 気合い: 当たるたびにたまり、満タンで攻撃力 +x/2、気の弾で使い切る
            Max(s, "brawler.energy_charge");
            s.RefreshStats();
            int watk0 = s.Stats.Watk;
            Max(s, "striker.energy_blast");
            Assert.Equal(SkillUseResult.NotReady, s.UseSkill("striker.energy_blast"));
            for (int i = 0; i < 12 && s.Energy < GameSession.EnergyMax; i++) { s.StartBasicAttack(); Use2(s); s.Step(new PlayerInput(), 5); }
            Assert.Equal(GameSession.EnergyMax, s.Energy);
            Assert.Equal(watk0 + 20, s.Stats.Watk);
            Use(s, "striker.energy_blast");
            Assert.Equal(0, s.Energy);
            // 衝撃波は変身中だけ
            Max(s, "striker.shockwave");
            Assert.Equal(SkillUseResult.NotReady, s.UseSkill("striker.shockwave"));
            s.UseSkill("striker.transform");
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("striker.shockwave"));
            Use2(s);
            // 百裂拳（20）: 250% × 6
            Max(s, "fightmaster.barrage");
            s.Buffs.Clear(); s.Energy = 0; s.RefreshStats();
            s.Map.Mobs.Clear(); SkillTests.Dummy(s, 40 * s.Body.Facing);
            s.UseSkill("fightmaster.barrage");
            var nums = Use2(s).Where(n => n.Kind == DamageKind.Dealt).ToList();
            var r = Formulas.PhysRange("ナックル", s.Stats.Str, s.Stats.Dex, s.Stats.Watk, s.Stats.Mastery);
            Assert.InRange(nums.Count, 5, 6);
            foreach (var n in nums) Assert.InRange(n.Value, (int)Math.Floor(r.Min * 2.5) - 1, (int)Math.Ceiling(r.Max * 2.5));

            // ガンスリンガー: 後ろ跳び撃ち・タコの砲台
            var g = Hero(JobLine.Pirate, 3, 1, "銃");
            Max(g, "gunslinger.backspin_shot");
            SkillTests.Dummy(g, 150);
            int f = g.Body.Facing;
            g.UseSkill("gunslinger.backspin_shot");
            Assert.Equal(-f * 220, g.Body.Vx, 6);
            Assert.False(g.Body.OnGround);
            Assert.Equal(AttackMotion.Shoot, g.Attack.Motion);
            Use2(g);
            g.Step(new PlayerInput(), 60);
            Max(g, "outlaw.octopus");
            g.Map.Mobs.Clear();
            SkillTests.Dummy(g, 150 * g.Body.Facing);
            g.Out.Clear();
            g.UseSkill("outlaw.octopus");
            int dmg = 0;
            for (int i = 0; i < 60 * 5; i++) { g.Step(new PlayerInput()); dmg += g.Out.Damage.Count(n => n.Kind == DamageKind.Dealt || n.Kind == DamageKind.Critical); g.Out.Damage.Clear(); }
            Assert.InRange(dmg, 2, 3); // 2 秒ごと
        }

        [Fact]
        public void PassivesMasteryCritGuard()
        {
            var s = Hero(JobLine.Warrior, 2, 0, "片手剣");
            double acc = s.Stats.Acc;
            Max(s, "fighter.sword_mastery");
            s.RefreshStats();
            Assert.Equal(0.6, s.Stats.Mastery, 6);
            Assert.Equal(acc + 20, s.Stats.Acc, 6);
            // 斧の熟練は剣では効かない
            Max(s, "fighter.axe_mastery");
            s.RefreshStats();
            Assert.Equal(acc + 20, s.Stats.Acc, 6);
            // 不屈（チャンピオン）: 受けるダメージ -10%
            s.Character.Tier = 4;
            Max(s, "champion.stoic");
            s.RefreshStats();
            Assert.Equal(10, s.Stats.Mods.DamageTakenPct);
            // 急所狙い（アサシン）: クリティカル 40%・威力 290%
            var t = Hero(JobLine.Thief, 2, 0, "クロー");
            Max(t, "assassin.critical_throw");
            t.RefreshStats();
            Assert.Equal(0.4, t.Stats.CritRate, 6);
            Assert.Equal(2.9, t.Stats.CritDamage, 6);
        }

        [Fact]
        public void StatusImmuneAndWillCure()
        {
            var s = Hero(JobLine.Magician, 4, 2, "ワンド");
            s.ApplyStatus(StatusKind.Poison, 10);
            Assert.True(s.Status.Has(StatusKind.Poison));
            Max(s, "bishop.will");
            s.UseSkill("bishop.will");
            Assert.False(s.Status.Has(StatusKind.Poison));
            Max(s, "bishop.holy_shield");
            s.UseSkill("bishop.holy_shield");
            s.RefreshStats();
            s.ApplyStatus(StatusKind.Stun, 5);
            Assert.False(s.Status.Has(StatusKind.Stun));
        }
    }
}
