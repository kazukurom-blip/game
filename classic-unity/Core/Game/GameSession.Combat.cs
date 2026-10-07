// 攻撃・スキル・敵とのやりとり（GameSession の続き）。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Lumina.Core.Skills;
using Lumina.Core.Status;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum SkillUseResult { Ok, Unknown, NotLearned, Passive, Dead, OnRope, Busy, Cooldown, WrongWeapon, NoMp, NoHp, NoAmmo, Stunned, Sealed }

    public sealed partial class GameSession
    {
        // ふつうの攻撃の当たる範囲（似）
        public const double MeleeFront = 70, MeleeBack = 10, MeleeUp = 60, MeleeDown = 10;

        private static double RangedReach(string weaponType)
        {
            switch (weaponType)
            {
                case "弓":
                case "クロスボウ": return 350;
                case "クロー": return 250;
                case "銃": return 280;
                default: return 0;
            }
        }

        private static AttackMotion MotionFor(WeaponClass w, SkillDef s)
        {
            if (s != null && s.Magic) return AttackMotion.Cast;
            switch (w.Type)
            {
                case "弓":
                case "クロスボウ":
                case "銃": return AttackMotion.Shoot;
                case "クロー": return AttackMotion.Throw;
                case "ナックル": return AttackMotion.Punch;
                case "短剣":
                case "槍": return AttackMotion.Stab;
                default: return AttackMotion.Swing;
            }
        }

        private static string ProjectileKind(WeaponClass w, SkillDef s)
        {
            if (s != null && s.Magic) return "magic";
            if (s != null && s.Fixed != null) return "pebble";
            switch (w.Ammo)
            {
                case "arrow_bow":
                case "arrow_xbow": return "arrow";
                case "star": return "star";
                case "bullet": return "bullet";
                default: return null;
            }
        }

        public bool CanAttackNow => !Dead && !Body.OnRope && Attack == null && Status.CanAct;

        /// <summary>ふつうの攻撃を始める（攻撃キーを押している間くり返す）。</summary>
        public bool StartBasicAttack()
        {
            if (!CanAttackNow) return false;
            var w = Stats.Weapon;
            if (Stats.NeedsAmmo)
            {
                if (Stats.AmmoItem == null) { Out.Add(GameEventType.SkillFailed, text: AmmoName(w) + "が無い"); return false; }
                Inventory.Remove(Stats.AmmoItem, 1);
            }
            Buffs.RemoveStealth();
            // 斧・鈍器・槍・矛は振りと突きが 6:4（STATS.md 2-1）
            bool stab = w.Swing != w.Stab && Rng.NextDouble() < 0.4;
            Attack = AttackAction.Start(Stats.AttackDelay, Body.Facing, Body.OnGround, null, 0, stab ? AttackMotion.Stab : MotionFor(w, null));
            Attack.Stab = stab;
            poseTracker.AlertLeft = PoseTracker.AlertTime;
            Out.Add(GameEventType.AttackStart, null, x: Body.X, y: Body.Y, text: ProjectileKind(w, null));
            return true;
        }

        private static string AmmoName(WeaponClass w) => w.Ammo == "star" ? "投げ星" : w.Ammo == "bullet" ? "弾" : "矢";

        /// <summary>スキルを使う（クイックスロットのキー）。</summary>
        public SkillUseResult UseSkill(string id)
        {
            var def = Data.Skill(id);
            if (def == null) return Fail(SkillUseResult.Unknown, id, "知らないスキル");
            int x = Skills.Level(id);
            if (x <= 0) return Fail(SkillUseResult.NotLearned, id, "まだ覚えていない");
            if (def.Kind == SkillKind.Passive) return Fail(SkillUseResult.Passive, id, "常に効くスキル");
            if (Dead) return Fail(SkillUseResult.Dead, id, null);
            // 状態異常: 気絶・凍結・眠りは動けない、封印はスキル不可（治すスキルだけは使える）
            if (!def.Cure && !Status.CanAct) return Fail(SkillUseResult.Stunned, id, "動けない");
            if (!def.Cure && Status.Has(StatusKind.Seal)) return Fail(SkillUseResult.Sealed, id, "封印されていてスキルが使えない");
            if (Body.OnRope) return Fail(SkillUseResult.OnRope, id, "縄・はしごでは使えない");
            bool isAttack = def.Kind == SkillKind.Attack || def.Kind == SkillKind.Area || def.Kind == SkillKind.Ranged;
            if (isAttack && Attack != null) return Fail(SkillUseResult.Busy, id, null);
            if (Skills.CooldownLeft(id) > 0) return Fail(SkillUseResult.Cooldown, id, "待ち時間 " + Math.Ceiling(Skills.CooldownLeft(id)) + " 秒");
            if (!def.WeaponAllowed(Stats.WeaponType)) return Fail(SkillUseResult.WrongWeapon, id, "この武器では使えない");
            if (def.Buff != null && def.Buff.Weapons != null && !def.Buff.Weapons.Contains(Stats.WeaponType)) return Fail(SkillUseResult.WrongWeapon, id, "この武器では使えない");
            int mp = def.MpCost(x, Character.Level), hp = def.HpCost(x, Character.Level);
            if (Character.Mp < mp) return Fail(SkillUseResult.NoMp, id, "MP が足りない");
            if (hp > 0 && Character.Hp <= hp) return Fail(SkillUseResult.NoHp, id, "HP が足りない");
            int ammo = def.UsesAmmo ? def.HitCount(x) : 0;
            if (ammo > 0 && (Stats.AmmoItem == null || Inventory.Count(Stats.AmmoItem) < ammo)) return Fail(SkillUseResult.NoAmmo, id, AmmoName(Stats.Weapon) + "が足りない");

            Character.Mp -= mp;
            Character.Hp -= hp;
            if (ammo > 0) Inventory.Remove(Stats.AmmoItem, ammo);
            double cd = def.CooldownSec(x);
            if (cd > 0) Skills.Cooldowns[id] = cd;
            Out.Add(GameEventType.SkillUsed, id, x, Body.X, Body.Y, ProjectileKind(Stats.Weapon, def));
            QuestEvent("skill_used");

            switch (def.Kind)
            {
                case SkillKind.Attack:
                case SkillKind.Area:
                case SkillKind.Ranged:
                    Buffs.RemoveStealth();
                    Attack = AttackAction.Start(Stats.AttackDelay, Body.Facing, Body.OnGround, id, x, MotionFor(Stats.Weapon, def));
                    poseTracker.AlertLeft = PoseTracker.AlertTime;
                    break;
                case SkillKind.Heal:
                    if (def.HealPct != null) HealHp((int)Math.Floor(Stats.MaxHp * def.HealPct.Eval(x, Character.Level) / 100));
                    if (def.HealFlat != null) HealHp(def.HealFlat.EvalInt(x, Character.Level));
                    if (def.Buff != null) ApplySkillBuff(def, x);
                    break;
                case SkillKind.Movement:
                    if (def.Buff != null) ApplySkillBuff(def, x);
                    if (def.DashSpeed > 0 && Body.OnGround) Body.Vx = Body.Facing * def.DashSpeed;
                    break;
                case SkillKind.Summon:
                    var sb = new ActiveBuff
                    {
                        Id = id, Name = def.Name, Summon = true, Total = def.SummonSec?.Eval(x, Character.Level) ?? 60,
                        SummonHeal = def.SummonHeal?.EvalInt(x, Character.Level) ?? 0, SummonInterval = def.SummonHealInterval,
                    };
                    sb.Remaining = sb.Total;
                    Buffs.Apply(sb);
                    Out.Add(GameEventType.BuffStarted, id, (long)sb.Total);
                    break;
                default: // Buff
                    if (def.Buff != null) ApplySkillBuff(def, x);
                    if (def.Cure && CureStatus(CurableAll) > 0) Out.Add(GameEventType.Message, id, text: "状態異常が治った");
                    break;
            }
            RefreshStats();
            return SkillUseResult.Ok;
        }

        private SkillUseResult Fail(SkillUseResult r, string id, string why)
        {
            Out.Add(GameEventType.SkillFailed, id, (long)r, text: why);
            return r;
        }

        private void ApplySkillBuff(SkillDef def, int x)
        {
            var b = def.Buff;
            var ab = new ActiveBuff
            {
                Id = def.Id, Name = def.Name, Stats = SkillDef.EvalStats(b.Stats, x, Character.Level),
                Total = b.Duration?.Eval(x, Character.Level) ?? 0,
                MagicGuardPct = b.MagicGuard?.Eval(x, Character.Level) ?? 0,
                Stealth = b.Stealth, HotHp = b.HotHp?.EvalInt(x, Character.Level) ?? 0, HotInterval = b.HotInterval,
                Booster = b.BoosterStages, BoosterWeapons = b.Weapons,
            };
            ab.Remaining = ab.Total;
            if (ab.Total <= 0) return;
            Buffs.Apply(ab);
            Out.Add(GameEventType.BuffStarted, def.Id, (long)ab.Total);
        }

        // ---------------- 当たる瞬間

        private void ResolveAttackHit()
        {
            var a = Attack;
            SkillDef def = a.SkillId != null ? Data.Skill(a.SkillId) : null;
            int x = a.SkillLevel;
            Rect range;
            int maxTargets, hits;
            if (def != null)
            {
                var r = def.Range;
                double front = r.Front + (def.RangeBonus ? Stats.RangeBonus : 0);
                range = Rect.InFront(Body.X, Body.Y, a.Facing, front, r.Back, r.Up, r.Down, r.Around);
                maxTargets = def.TargetCount(x);
                hits = def.HitCount(x);
            }
            else
            {
                double reach = RangedReach(Stats.WeaponType);
                range = reach > 0
                    ? Rect.InFront(Body.X, Body.Y, a.Facing, reach + Stats.RangeBonus, 0, 40, 20)
                    : Rect.InFront(Body.X, Body.Y, a.Facing, MeleeFront, MeleeBack, MeleeUp, MeleeDown);
                maxTargets = 1; hits = 1;
            }
            var alive = new List<Mob>();
            foreach (var m in Map.Mobs) if (m.Alive && !m.Hidden) alive.Add(m);
            var targets = Targeting.Pick(alive, m => m.Box, range, Body.X, a.Facing, maxTargets);
            int landed = 0;
            foreach (var mob in targets)
            {
                for (int h = 0; h < hits && mob.Alive; h++)
                {
                    if (def != null && def.Debuff != null && def.Damage == null && def.Spell == null && def.Fixed == null)
                    {
                        // かく乱: ダメージは無く、攻撃と防御を下げる
                        mob.AtkDown = def.Debuff.Atk?.EvalInt(x, Character.Level) ?? 0;
                        mob.DefDown = def.Debuff.Def?.EvalInt(x, Character.Level) ?? 0;
                        mob.DebuffT = def.Debuff.Duration?.Eval(x, Character.Level) ?? 0;
                        MobAI.OnHit(mob, 0, Body.X);
                        Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "debuff");
                        break;
                    }
                    HitResult res;
                    if (def == null) res = DamageCalc.Physical(Stats, Character.Level, mob.Defender, 100, Rng, null, null, a.Stab);
                    else if (def.Magic) res = DamageCalc.Magic(Stats, Character.Level, mob.Defender, def.Spell.Eval(x, Character.Level), Rng, def.Element);
                    else if (def.Fixed != null) res = DamageCalc.Fixed(Stats, Character.Level, mob.Defender, def.Fixed.EvalInt(x, Character.Level), Rng);
                    else res = DamageCalc.Physical(Stats, Character.Level, mob.Defender, def.Damage?.Eval(x, Character.Level) ?? 100, Rng, def.WeaponMul, def.Element, a.Stab, def.AlwaysCrit);
                    DamageMob(mob, res, h);
                    if (!res.Miss) landed++;
                }
            }
            Out.Add(GameEventType.AttackHit, a.SkillId, landed, Body.X, Body.Y);
        }

        /// <summary>敵にダメージを与える（数字を出し、ひるませ、倒れたら経験値とドロップ）。</summary>
        public void DamageMob(Mob mob, HitResult res, int stack = 0)
        {
            var num = new DamageNumber
            {
                Kind = res.Miss ? DamageKind.Miss : res.Critical ? DamageKind.Critical : DamageKind.Dealt,
                Value = res.Damage, X = mob.X, Y = mob.HeadY, Stack = stack, Delay = stack * DamageNumber.StackDelay, TargetUid = mob.Uid,
            };
            Out.Damage.Add(num);
            if (res.Miss) { mob.AggroT = Mob.AggroTime; return; }
            mob.Hp -= res.Damage;
            MobAI.OnHit(mob, res.Damage, Body.X);
            if (res.Damage > 0) StatusSystem.BreakOnHit(mob, Out); // 凍結・眠りは攻撃で解ける
            Out.Add(GameEventType.MobHit, mob.Def.Id, res.Damage, mob.X, mob.HeadY);
            if (mob.Hp <= 0) KillMob(mob);
        }

        private void KillMob(Mob mob)
        {
            MobAI.Kill(mob);
            var def = mob.Def;
            Out.Add(GameEventType.MobDied, def.Id, def.Exp, mob.X, mob.Y);
            // 経験値（自分より 20 Lv 以上低い敵は 1 Lv ごとに -5%、最低 10%）
            double mul = 1;
            int gap = Character.Level - def.Lv;
            if (gap > 20) mul = Math.Max(0.1, 1 - 0.05 * (gap - 20));
            mul *= Status.ExpMul; // 呪い: 経験値 −50%
            GainExp((long)Math.Max(1, Math.Round(def.Exp * mul)));
            foreach (var note in Quests.Progress(ObjectiveType.Kill, def.Id)) OnQuestNote(note);
            var drops = DropRoller.Roll(def, Data, Rng);
            if (drops.Count > 0)
            {
                Map.SpawnDrops(mob.X, mob.Y, drops);
                Out.Add(GameEventType.DropSpawned, def.Id, drops.Count, mob.X, mob.Y);
            }
        }

        /// <summary>経験値をもらう（Lv が上がったらお知らせと自動セーブ）。</summary>
        public void GainExp(long amount)
        {
            if (amount <= 0) return;
            Out.Add(GameEventType.ExpGained, value: amount);
            var info = Character.GainExp(amount, Rng, Skills.Growth(Character.Level));
            if (info != null)
            {
                RefreshStats();
                Character.Hp = Stats.MaxHp; Character.Mp = Stats.MaxMp;
                Out.Add(GameEventType.LevelUp, Character.JobName, info.NewLevel, Body.X, Body.Y);
                AutoSave.Request("levelup");
            }
        }

        // ---------------- 敵の動き・触れた時

        private void StepMobs(double dt)
        {
            var sense = new PlayerSense { X = Body.X, Y = Body.Y, Chain = Body.Seg?.Chain, Hidden = Dead || Stats.Stealth };
            var pbox = PlayerBox;
            // 呼び出しで Mobs が増えるので、今いる分だけ回す
            int count = Map.Mobs.Count;
            for (int i = 0; i < count && i < Map.Mobs.Count; i++)
            {
                var m = Map.Mobs[i];
                if (m.Alive) TickMobStatus(m, dt);
                MobAI.Step(m, Map.Physics, sense, dt, Rng);
                // 技（飛び道具・魔法の予兆・ボスの技・段階）
                MobCombat.Step(m, Map, sense, Body.OnGround, dt, Rng, Out);
                if (!m.Alive || Dead || m.Hidden) continue;
                // 触れるとダメージ（状態異常つきの敵もいる）
                if (m.Def.Touch && !sense.Hidden && Body.InvT <= 0 && m.Box.Overlaps(pbox))
                    HitPlayer(m.Atk, m.Def.Lv, m.Acc, false, m.X, m.Def.TouchStatus);
            }
            if (!Dead)
            {
                foreach (var p in Map.Projectiles)
                {
                    if (p.Dead || !p.Box.Overlaps(pbox) || Stats.Stealth) continue;
                    p.Dead = true;
                    if (Body.InvT <= 0) HitPlayer(p.Atk, p.MobLv, p.MobAcc, p.Magic, p.FromX, p.Status, p.SkillId, p.MobUid);
                }
            }
            StepHazards(dt);
        }

        /// <summary>敵の攻撃を受ける（避けた時は MISS）。魔力の盾があれば一部を MP で受ける。</summary>
        public bool TakeHit(int atk, int mobLv, int mobAcc, bool magic, double fromX)
        {
            if (Dead || Body.InvT > 0) return false;
            var res = DamageCalc.Taken(atk, mobLv, mobAcc, magic, Stats, Character.Level, Character.Line == JobLine.Warrior, Rng);
            double headY = Body.Y - PlayerBody.Height;
            if (res.Miss)
            {
                Out.Damage.Add(new DamageNumber { Kind = DamageKind.Miss, X = Body.X, Y = headY });
                Body.InvT = 0.6; // 避けた後すぐまた当たらないように（ふっとびは無し）
                return false;
            }
            var (hpDmg, mpDmg) = DamageCalc.SplitMagicGuard(res.Damage, Stats.MagicGuard, Character.Mp);
            Character.Mp -= mpDmg;
            Character.Hp -= hpDmg;
            Out.Damage.Add(new DamageNumber { Kind = DamageKind.Taken, Value = res.Damage, X = Body.X, Y = headY });
            PlayerPhysics.Hurt(Body, fromX);
            Attack = null;
            poseTracker.AlertLeft = PoseTracker.AlertTime;
            Out.Add(GameEventType.Hurt, value: res.Damage, x: Body.X, y: Body.Y);
            StatusSystem.BreakOnHit(this, Out); // 凍結・眠りは攻撃を受けると解ける
            if (Character.Hp <= 0) Die();
            return true;
        }
    }
}
