// 攻撃・スキル・敵とのやりとり（GameSession の続き）。スキル固有の細かい動き（テレポート・召喚の攻撃・闘気 …）は GameSession.Skills.cs。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Lumina.Core.Skills;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum SkillUseResult { Ok, Unknown, NotLearned, Passive, Dead, OnRope, Busy, Cooldown, WrongWeapon, NoMp, NoHp, NoAmmo, NoMeso, NotReady }

    public sealed partial class GameSession
    {
        // ふつうの攻撃の当たる範囲（似）
        public const double MeleeFront = 70, MeleeBack = 10, MeleeUp = 60, MeleeDown = 10;
        /// <summary>弓・クロスボウで矢が無い時の弱い殴り（武器係数。ふつうの弓は 3.4）。似。</summary>
        public const double BowWhackMul = 1.4;

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

        /// <summary>攻撃の動きの種類（振り・突き・撃ち・投げ・詠唱・殴り）。スキルのデータにあればそれ、無ければ武器と魔法で決まる。</summary>
        public static AttackMotion MotionFor(WeaponClass w, SkillDef s)
        {
            if (s != null && s.Motion.HasValue) return s.Motion.Value;
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
            if (s != null && !s.UsesAmmo && s.Weapons == null) return null;
            switch (w.Ammo)
            {
                case "arrow_bow":
                case "arrow_xbow": return "arrow";
                case "star": return "star";
                case "bullet": return "bullet";
                default: return null;
            }
        }

        public bool CanAttackNow => !Dead && !Body.OnRope && Attack == null;

        /// <summary>ふつうの攻撃を始める（攻撃キーを押している間くり返す）。</summary>
        public bool StartBasicAttack()
        {
            if (!CanAttackNow) return false;
            var w = Stats.Weapon;
            bool whack = false;
            if (Stats.NeedsAmmo && !Stats.Mods.NoAmmo)
            {
                if (Stats.AmmoItem == null)
                {
                    // 弓・クロスボウは矢が無いと弱く殴る（クラシックどおり）。クロー・銃はお知らせだけ
                    if (w.Type == "弓" || w.Type == "クロスボウ") whack = true;
                    else { Out.Add(GameEventType.SkillFailed, text: AmmoName(w) + "が無い"); return false; }
                }
                else Inventory.Remove(Stats.AmmoItem, 1);
            }
            bool fromStealth = Stats.Stealth;
            Buffs.RemoveStealth();
            // 斧・鈍器・槍・矛は振りと突きが 6:4（STATS.md 2-1）
            bool stab = !whack && w.Swing != w.Stab && Rng.NextDouble() < 0.4;
            var motion = whack ? AttackMotion.Swing : stab ? AttackMotion.Stab : MotionFor(w, null);
            Attack = AttackAction.Start(Stats.AttackDelay, Body.Facing, Body.OnGround, null, 0, motion);
            Attack.Stab = stab; Attack.Whack = whack; Attack.FromStealth = fromStealth;
            Attack.ComboPct = ComboBonusPct();
            poseTracker.AlertLeft = PoseTracker.AlertTime;
            Out.Add(GameEventType.AttackStart, null, x: Body.X, y: Body.Y, text: whack ? null : ProjectileKind(w, null));
            return true;
        }

        private static string AmmoName(WeaponClass w) => w.Ammo == "star" ? "投げ星" : w.Ammo == "bullet" ? "弾" : "矢";

        /// <summary>スキルの MP（属性の増幅で増え、集中の極意で減り、無限の魔力で 0）。</summary>
        public int SkillMpCost(SkillDef def, int x)
        {
            int mp = def.MpCost(x, Character.Level);
            if (mp <= 0) return 0;
            var m = Stats.Mods;
            if (m.NoMp) return 0;
            double v = mp;
            if (def.Magic && def.IsAttack) v *= m.AmpMp;
            v *= 1 - Math.Min(90, m.MpCostPct) / 100;
            return Math.Max(1, (int)Math.Round(v));
        }

        /// <summary>スキルを使う（クイックスロットのキー）。</summary>
        public SkillUseResult UseSkill(string id) => UseSkill(id, false);

        /// <summary>quiet = 押しっぱなしのくり返し（使えない時にお知らせを出さない）。</summary>
        private SkillUseResult UseSkill(string id, bool quiet)
        {
            var def = Data.Skill(id);
            SkillUseResult F(SkillUseResult r, string why) => quiet ? r : Fail(r, id, why);
            if (def == null) return F(SkillUseResult.Unknown, "知らないスキル");
            int x = Skills.Level(id);
            if (x <= 0) return F(SkillUseResult.NotLearned, "まだ覚えていない");
            if (def.Kind == SkillKind.Passive) return F(SkillUseResult.Passive, "常に効くスキル");
            if (Dead) return F(SkillUseResult.Dead, null);
            if (Body.OnRope) return F(SkillUseResult.OnRope, "縄・はしごでは使えない");
            if (def.IsAttack && Attack != null) return F(SkillUseResult.Busy, null);
            if (Skills.CooldownLeft(id) > 0) return F(SkillUseResult.Cooldown, "待ち時間 " + Math.Ceiling(Skills.CooldownLeft(id)) + " 秒");
            if (!def.WeaponAllowed(Stats.WeaponType)) return F(SkillUseResult.WrongWeapon, "この武器では使えない");
            if (def.Buff != null && def.Buff.Weapons != null && !def.Buff.Weapons.Contains(Stats.WeaponType)) return F(SkillUseResult.WrongWeapon, "この武器では使えない");
            // 条件（変身中・付与・気合い・闘気・空中）
            if (def.NeedsBuff != null && !def.NeedsBuff.Exists(Buffs.Has)) return F(SkillUseResult.NotReady, "今は使えない（" + string.Join("・", def.NeedsBuff.ConvertAll(b => Data.Skill(b)?.Name ?? b)) + " の時だけ）");
            if (def.NeedsCharge && Buffs.ChargeBuff == null) return F(SkillUseResult.NotReady, "付与をのせている時だけ使える");
            if (def.NeedsEnergy && Energy < EnergyMax) return F(SkillUseResult.NotReady, "気合いが満タンの時だけ使える");
            if (def.ComboUse != 0)
            {
                var cb = Buffs.ComboBuff;
                int need = def.ComboUse < 0 ? 1 : def.ComboUse;
                if (cb == null || cb.Orbs < need) return F(SkillUseResult.NotReady, "闘気が足りない");
            }
            if (def.AirJumpVx != null && Body.OnGround) return F(SkillUseResult.NotReady, "空中で使う");
            int mp = SkillMpCost(def, x);
            int hp = def.HpCost(x, Character.Level) + (def.HpPct != null ? (int)Math.Floor(Stats.MaxHp * def.HpPct.Eval(x, Character.Level) / 100) : 0);
            long meso = def.Meso?.EvalInt(x, Character.Level) ?? 0;
            if (Character.Mp < mp) return F(SkillUseResult.NoMp, "MP が足りない");
            if (hp > 0 && Character.Hp <= hp) return F(SkillUseResult.NoHp, "HP が足りない");
            if (meso > 0 && Inventory.Meso < meso) return F(SkillUseResult.NoMeso, "お金が足りない");
            int ammo = def.UsesAmmo && !Stats.Mods.NoAmmo ? def.HitCount(x) : 0;
            if (ammo > 0 && (Stats.AmmoItem == null || Inventory.Count(Stats.AmmoItem) < ammo)) return F(SkillUseResult.NoAmmo, AmmoName(Stats.Weapon) + "が足りない");

            Character.Mp -= mp;
            Character.Hp -= hp;
            if (meso > 0) Inventory.AddMeso(-meso);
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
                    StartSkillAttack(def, x);
                    break;
                case SkillKind.Heal:
                    UseHealSkill(def, x);
                    break;
                case SkillKind.Movement:
                    if (def.Buff != null) ApplySkillBuff(def, x);
                    if (def.Teleport != null) DoTeleport(def.Teleport.Eval(x, Character.Level));
                    if (def.AirJumpVx != null) { Body.Vx = Body.Facing * def.AirJumpVx.Eval(x, Character.Level); Body.Vy = -(def.AirJumpVy?.Eval(x, Character.Level) ?? 300); }
                    if (def.DashSpeed > 0 && Body.OnGround) Body.Vx = Body.Facing * def.DashSpeed;
                    break;
                case SkillKind.Summon:
                    StartSummon(def, x);
                    break;
                default: // Buff
                    UseBuffSkill(def, x);
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

        private void StartSkillAttack(SkillDef def, int x)
        {
            bool fromStealth = Stats.Stealth;
            Buffs.RemoveStealth();
            double swing = def.Rapid > 0 ? 1.0 / def.Rapid : Stats.AttackDelay * def.Delay;
            Attack = AttackAction.Start(swing, Body.Facing, Body.OnGround, def.Id, x, MotionFor(Stats.Weapon, def), def.Cast + def.Charge);
            Attack.FromStealth = fromStealth;
            Attack.ComboPct = ComboBonusPct();
            if (def.DashSpeed > 0 && def.DashTime > 0) { Attack.DashSpeed = def.DashSpeed; Attack.DashTime = def.DashTime; }
            if (def.BackJumpVx > 0 && Body.OnGround)
            {
                // 後ろ跳び撃ち: 後ろへ跳ねながら前へ撃つ（向きはそのまま）
                Body.Seg = null; Body.Rope = null;
                Body.Vx = -Body.Facing * def.BackJumpVx; Body.Vy = -def.BackJumpVy;
                Body.SetState(BodyState.Air);
                Attack.OnGround = false;
            }
            if (def.ComboUse != 0) UseComboOrbs(def.ComboUse);
            poseTracker.AlertLeft = PoseTracker.AlertTime;
        }

        private void UseBuffSkill(SkillDef def, int x)
        {
            if (def.ComboUse != 0) UseComboOrbs(def.ComboUse); // 怒りの解放
            if (def.Buff != null) ApplySkillBuff(def, x);
            if (def.Cure) CureSelf(def.Id);
            if (def.CdReset)
            {
                // 時の拳: ほかのスキルの待ち時間を全部なくす
                var keys = new List<string>(Skills.Cooldowns.Keys);
                foreach (var k in keys) if (k != def.Id) Skills.Cooldowns.Remove(k);
                Out.Add(GameEventType.Message, def.Id, text: "待ち時間が無くなった");
            }
            if (def.Door) OpenDoor(def);
        }

        private void ApplySkillBuff(SkillDef def, int x)
        {
            var b = def.Buff;
            int lv = Character.Level;
            var ab = new ActiveBuff
            {
                Id = def.Id, Name = def.Name, SkillLevel = x, Stats = SkillDef.EvalStats(b.Stats, x, lv),
                Total = b.Duration?.Eval(x, lv) ?? 0,
                MagicGuardPct = b.MagicGuard?.Eval(x, lv) ?? 0,
                Stealth = b.Stealth, HotHp = b.HotHp?.EvalInt(x, lv) ?? 0, HotInterval = b.HotInterval,
                Booster = b.BoosterStages, BoosterWeapons = b.Weapons, BoosterStack = b.BoosterStack,
                DamagePct = b.DamagePct?.Eval(x, lv) ?? 0, Element = b.Element, Charge = b.Charge,
                StatPct = b.StatPct?.Eval(x, lv) ?? 0, HpPct = b.HpPct?.Eval(x, lv) ?? 0, MpPct = b.MpPct?.Eval(x, lv) ?? 0,
                ExpPct = b.ExpPct?.Eval(x, lv) ?? 0, MesoPct = b.MesoPct?.Eval(x, lv) ?? 0,
                CritRate = b.CritRate?.Eval(x, lv) ?? 0, CritDamage = b.CritDamage?.Eval(x, lv) ?? 0, MpCostPct = b.MpCostPct?.Eval(x, lv) ?? 0,
                NoAmmo = b.NoAmmo, NoMp = b.NoMp, Infinity = b.Infinity,
                Reflect = b.Reflect?.Eval(x, lv) ?? 0, MagicReflect = b.MagicReflect?.Eval(x, lv) ?? 0, DamageReduce = b.DamageReduce?.Eval(x, lv) ?? 0,
                Invincible = b.Invincible, StatusImmune = b.StatusImmune, Revive = b.Revive, SlowFall = b.SlowFall, Transform = b.Transform, Ship = b.Ship,
                MesoGuardPct = b.MesoGuardPct?.Eval(x, lv) ?? 0, MesoGuardCost = b.MesoGuardCost?.Eval(x, lv) ?? 0,
                ShadowPartner = b.ShadowPartner?.Eval(x, lv) ?? 0,
                HpDrain = b.HpDrain?.EvalInt(x, lv) ?? 0, HpDrainInterval = b.HpDrainInterval,
                Combo = b.ComboDamage != null, ComboMax = b.ComboMax, ComboDamage = b.ComboDamage?.Eval(x, lv) ?? 0,
            };
            if (b.OnHitStatus.Count > 0) ab.OnHitStatus = b.OnHitStatus.ConvertAll(st => st.Eval(x, lv, def.Id));
            if (ab.Combo) { var old = Buffs.Get(def.Id); if (old != null) ab.Orbs = old.Orbs; } // かけ直しても玉は残す
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
                double reach = a.Whack ? 0 : RangedReach(Stats.WeaponType);
                range = reach > 0
                    ? Rect.InFront(Body.X, Body.Y, a.Facing, reach + Stats.RangeBonus, 0, 40, 20)
                    : Rect.InFront(Body.X, Body.Y, a.Facing, MeleeFront, MeleeBack, MeleeUp, MeleeDown);
                maxTargets = 1; hits = 1;
            }
            var alive = new List<Mob>();
            foreach (var m in Map.Mobs) if (m.Alive) alive.Add(m);
            List<Mob> targets;
            if (def != null && def.Explode > 0)
            {
                // 爆発: 最初に当たった 1 体のまわり
                targets = Targeting.Pick(alive, m => m.Box, range, Body.X, a.Facing, 1);
                if (targets.Count > 0)
                {
                    var c = targets[0].Box;
                    var boom = new Rect(c.CenterX - def.Explode, c.CenterY - def.Explode, c.CenterX + def.Explode, c.CenterY + def.Explode);
                    alive.Remove(targets[0]);
                    targets.AddRange(Targeting.Pick(alive, m => m.Box, boom, c.CenterX, a.Facing, maxTargets - 1));
                }
            }
            else targets = Targeting.Pick(alive, m => m.Box, range, Body.X, a.Facing, maxTargets);

            int landed = 0;
            long dealt = 0;
            for (int i = 0; i < targets.Count; i++)
            {
                var mob = targets[i];
                if (def != null && !def.DealsDamage)
                {
                    UtilityHit(mob, def, x);
                    continue;
                }
                double mul = def != null && def.Pierce != 0 ? Math.Max(0.1, 1 + def.Pierce / 100 * i) : 1;
                if (def != null && def.TickCount > 0)
                {
                    // 忍び寄る影: interval 秒ごとに count 回
                    for (int k = 0; k < def.TickCount; k++) pendingHits.Add(new PendingHit { Mob = mob, Delay = k * def.TickInterval, SkillId = def.Id, Level = x, Mul = mul });
                    landed++;
                    continue;
                }
                var (l, d) = HitMobRepeatedly(mob, def, x, hits, mul, a, 0);
                landed += l; dealt += d;
                if (l > 0) AfterTargetHit(mob, def, x, d);
            }
            if (def != null && def.MesoExplosion) landed += MesoExplosion(def, x, range, maxTargets);
            AfterAttack(def, x, targets, landed, dealt, a);
            Out.Add(GameEventType.AttackHit, a.SkillId, landed, Body.X, Body.Y);
        }

        /// <summary>1 体に hits 回（＋影分身のまねる攻撃）。(当たった数, 与えた合計)</summary>
        private (int landed, long dealt) HitMobRepeatedly(Mob mob, SkillDef def, int x, int hits, double mul, AttackAction a, int stack)
        {
            int landed = 0; long dealt = 0;
            for (int h = 0; h < hits && mob.Alive; h++)
            {
                var res = SkillDamage(mob, def, x, mul, a);
                DamageMob(mob, res, stack++);
                if (!res.Miss) { landed++; dealt += res.Damage; OnEachHit(mob, def, x); }
            }
            // 影分身: 同じ攻撃をもう一度（威力 50%）
            double sp = Stats.Mods.ShadowPartner;
            if (sp > 0 && (def == null || def.Damage != null))
            {
                for (int h = 0; h < hits && mob.Alive; h++)
                {
                    var res = SkillDamage(mob, def, x, mul * sp / 100, a);
                    DamageMob(mob, res, stack++);
                    if (!res.Miss) { landed++; dealt += res.Damage; }
                }
            }
            return (landed, dealt);
        }

        /// <summary>1 回のダメージ（スキルの倍率 × 付与・闘気・暗黒の力・闇隠れ・狙い撃ち・属性の増幅・無限の魔力）。</summary>
        private HitResult SkillDamage(Mob mob, SkillDef def, int x, double mul, AttackAction a)
        {
            var m = Stats.Mods;
            int lv = Character.Level;
            var defender = mob.Defender;
            string element = def?.Element ?? (def == null || !def.Magic ? m.ChargeElement : null);
            if (m.ResistPierce > 0 && defender.ElementMul != null)
            {
                var orig = defender.ElementMul;
                double pierce = m.ResistPierce / 100;
                defender.ElementMul = e => { double v = orig(e); return v > 0 && v < 1 ? v + (1 - v) * pierce : v; };
            }
            // 天からの鉄槌: ボス以外は確率で一撃
            if (def?.InstantKill != null && !mob.Def.IsBoss && Rng.Chance(def.InstantKill.Eval(x, lv) / 100))
                return new HitResult { Damage = Math.Max(1, mob.Hp) };
            double bonus = 1 + (m.DamagePct + (a?.ComboPct ?? ComboBonusPct())) / 100;
            if (m.BerserkHpPct > 0 && Character.Hp <= Stats.MaxHp * m.BerserkHpPct / 100) bonus *= 2;
            if (a != null && a.FromStealth)
            {
                if (def != null) bonus *= def.StealthMul;
                bonus *= 1 + m.StealthAttackPct / 100;
            }
            if (marks.TryGetValue(mob, out var mk) && mk.Until > PlaySec) bonus *= 1 + mk.DamagePct / 100;
            if (def == null)
            {
                if (a != null && a.Whack) return DamageCalc.Physical(Stats, lv, defender, 100 * bonus, Rng, BowWhackMul, element);
                return DamageCalc.Physical(Stats, lv, defender, 100 * bonus, Rng, null, element, a?.Stab ?? false);
            }
            if (def.Magic && def.Spell != null)
            {
                double spell = def.Spell.Eval(x, lv) * mul * bonus * m.AmpDamage * (1 + m.InfinityPct / 100);
                if (def.Charge > 0) spell *= 2; // 溜めきった
                return DamageCalc.Magic(Stats, lv, defender, spell, Rng, element);
            }
            if (def.Fixed != null) return DamageCalc.Fixed(Stats, lv, defender, def.Fixed.EvalInt(x, lv), Rng);
            double pct = (def.Damage?.Eval(x, lv) ?? 100) * mul * bonus;
            return DamageCalc.Physical(Stats, lv, defender, pct, Rng, def.WeaponMul, element, a?.Stab ?? false, def.AlwaysCrit, def.IgnoreDef);
        }

        /// <summary>当たるたびの効き目（天使の光線の回復・お金拾い・必殺の一撃）。</summary>
        private void OnEachHit(Mob mob, SkillDef def, int x)
        {
            var m = Stats.Mods;
            if (def?.HealPerHit != null) HealHp((int)Math.Floor(Stats.MaxHp * def.HealPerHit.Eval(x, Character.Level) / 100));
            if (m.MesoOnHitChance > 0 && Rng.Chance(m.MesoOnHitChance))
                Map.SpawnDrops(mob.X, mob.Y, new List<DropItem> { new DropItem { Meso = Math.Max(1, mob.Def.Lv * Rng.Range(1, 3)) } });
            if (m.ExecuteChance > 0 && mob.Alive && !mob.Def.IsBoss && mob.Hp <= mob.Def.Hp * m.ExecuteHpPct / 100 && Rng.Chance(m.ExecuteChance))
                DamageMob(mob, new HitResult { Damage = mob.Hp }, 0);
        }

        /// <summary>1 体に当たった後（状態異常・弱体・吸い取り・MP 吸収・押す）。</summary>
        private void AfterTargetHit(Mob mob, SkillDef def, int x, long dealt)
        {
            var m = Stats.Mods;
            int lv = Character.Level;
            if (def != null)
            {
                foreach (var st in def.Status) TryInflict(mob, st.Eval(x, lv, def.Id));
                if (def.Debuff != null) ApplyDebuff(mob, def, x);
                if (def.DrainPct != null && dealt > 0)
                    HealHp((int)Math.Min(dealt * def.DrainPct.Eval(x, lv) / 100, Stats.MaxHp * def.DrainCap / 100));
                if (def.Push > 0 && mob.Alive && !mob.Def.IsBoss)
                    MobAI.Place(mob, Map.Physics, Math.Max(10, Math.Min(Map.Data.Width - 10, mob.X + Attack.Facing * def.Push)), mob.Y);
                if (def.Knockback && mob.Alive && !mob.Def.IsBoss && !mob.Def.NoKnockback) { mob.KnockT = Mob.KnockTime; mob.KnockDir = Attack.Facing; }
                if (def.Magic && m.MpEaterChance > 0 && Rng.Chance(m.MpEaterChance))
                    HealMp((int)Math.Floor(mob.Def.Mp * m.MpEaterPct / 100)); // 敵の MP は減らさない（敵の MP は未実装）
            }
            bool physical = def == null || def.Damage != null;
            if (physical) foreach (var st in m.OnHitStatus) TryInflict(mob, st);
        }

        /// <summary>攻撃 1 回の後（闘気・気合い・追撃・星の連投・捨て身・付与を消す）。</summary>
        private void AfterAttack(SkillDef def, int x, List<Mob> targets, int landed, long dealt, AttackAction a)
        {
            var m = Stats.Mods;
            if (landed > 0)
            {
                if (def == null || def.ComboUse == 0) GainComboOrb();
                if (def == null || !def.NeedsEnergy) GainEnergy();
                // 追撃: 武器の攻撃の後、確率でもう 1 回（最初の 1 体）
                bool weaponAttack = def == null || (def.Damage != null && !def.Magic);
                if (weaponAttack && m.FinalAttackChance > 0 && targets.Count > 0 && targets[0].Alive && Rng.Chance(m.FinalAttackChance))
                {
                    var res = DamageCalc.Physical(Stats, Character.Level, targets[0].Defender, m.FinalAttackDamage, Rng, null, m.ChargeElement);
                    DamageMob(targets[0], res, 8);
                    Out.Add(GameEventType.MobHit, targets[0].Def.Id, res.Damage, targets[0].X, targets[0].HeadY, "final_attack");
                }
                // 星の連投: 二つ星投げの時、同じ攻撃をもう 1 体へ
                if (def != null && def.Id.EndsWith(".lucky_seven") && m.ChainStarChance > 0 && targets.Count > 0 && Rng.Chance(m.ChainStarChance))
                {
                    var c = targets[0].Box;
                    var near = new Rect(c.CenterX - 200, c.CenterY - 80, c.CenterX + 200, c.CenterY + 80);
                    var rest = new List<Mob>();
                    foreach (var mb in Map.Mobs) if (mb.Alive && !targets.Contains(mb)) rest.Add(mb);
                    var next = Targeting.Pick(rest, mb => mb.Box, near, c.CenterX, a.Facing, 1);
                    if (next.Count > 0) HitMobRepeatedly(next[0], def, x, def.HitCount(x), 1, a, 0);
                }
            }
            if (def == null) return;
            if (def.SelfDamagePct > 0 && dealt > 0)
                Character.Hp = Math.Max(1, Character.Hp - (int)Math.Floor(dealt * def.SelfDamagePct / 100));
            foreach (var st in def.SelfStatus) InflictSelf(st.Eval(x, Character.Level, def.Id));
            if (def.ConsumeCharge) { var ch = Buffs.ChargeBuff; if (ch != null) { Buffs.Remove(ch.Id); Out.Add(GameEventType.BuffEnded, ch.Id); } }
            if (def.NeedsEnergy) SetEnergy(0);
        }

        /// <summary>ダメージの無いスキル（かく乱・威圧・封印・盗む・引き寄せ・崩し・狙い撃ち）。</summary>
        private void UtilityHit(Mob mob, SkillDef def, int x)
        {
            int lv = Character.Level;
            MobAI.OnHit(mob, 0, Body.X);
            if (def.Debuff != null) ApplyDebuff(mob, def, x);
            foreach (var st in def.Status) TryInflict(mob, st.Eval(x, lv, def.Id));
            if (def.Pull != null && !mob.Def.IsBoss && Rng.Chance(def.Pull.Eval(x, lv) / 100))
            {
                MobAI.Place(mob, Map.Physics, Body.X + Attack.Facing * 40, Body.Y);
                Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "pull");
            }
            if (def.Steal != null && !stolenFrom.Contains(mob))
            {
                if (Rng.Chance(def.Steal.Eval(x, lv) / 100))
                {
                    stolenFrom.Add(mob); // 1 体に 1 回
                    var drops = DropRoller.Roll(mob.Def, Data, Rng);
                    var item = drops.Find(d => !d.IsMeso) ?? drops.Find(d => d.IsMeso);
                    if (item != null) Map.SpawnDrops(mob.X, mob.Y, new List<DropItem> { item });
                    Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "steal");
                }
            }
            if (def.DispelChance != null && Rng.Chance(def.DispelChance.Eval(x, lv) / 100))
                Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "dispel"); // 敵の強化（バフ）は未実装なので、お知らせだけ
            if (def.MarkExp != null || def.MarkDamage != null)
                marks[mob] = new MobMark { DamagePct = def.MarkDamage?.Eval(x, lv) ?? 0, ExpPct = def.MarkExp?.Eval(x, lv) ?? 0, Until = PlaySec + (def.MarkSec?.Eval(x, lv) ?? 30) };
            if (def.Cure) CureSelf(def.Id);
            if (def.Debuff == null && def.Status.Count == 0) Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "skill");
        }

        private void ApplyDebuff(Mob mob, SkillDef def, int x)
        {
            var d = def.Debuff;
            int lv = Character.Level;
            if (d.Chance != null && !Rng.Chance(d.Chance.Eval(x, lv) / 100)) return;
            int defDown = d.Def?.EvalInt(x, lv) ?? 0;
            if (d.DefPct != null) defDown = Math.Max(defDown, (int)Math.Floor(mob.Def.Def * d.DefPct.Eval(x, lv) / 100));
            mob.AtkDown = Math.Max(mob.DebuffT > 0 ? mob.AtkDown : 0, d.Atk?.EvalInt(x, lv) ?? 0);
            mob.DefDown = Math.Max(mob.DebuffT > 0 ? mob.DefDown : 0, defDown);
            mob.DebuffT = Math.Max(mob.DebuffT, d.Duration?.Eval(x, lv) ?? 0);
            Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "debuff");
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
            Out.Add(GameEventType.MobHit, mob.Def.Id, res.Damage, mob.X, mob.HeadY);
            if (mob.Hp <= 0) KillMob(mob);
        }

        private void KillMob(Mob mob)
        {
            MobAI.Kill(mob);
            var def = mob.Def;
            Out.Add(GameEventType.MobDied, def.Id, def.Exp, mob.X, mob.Y);
            // 経験値（自分より 20 Lv 以上低い敵は 1 Lv ごとに -5%、最低 10%）。聖なる御印・挑発・狙い撃ちで +%
            double mul = 1;
            int gap = Character.Level - def.Lv;
            if (gap > 20) mul = Math.Max(0.1, 1 - 0.05 * (gap - 20));
            double expPct = Stats.Mods.ExpPct;
            if (marks.TryGetValue(mob, out var mk)) { if (mk.Until > PlaySec) expPct += mk.ExpPct; marks.Remove(mob); }
            mul *= 1 + expPct / 100;
            stolenFrom.Remove(mob);
            GainExp((long)Math.Max(1, Math.Round(def.Exp * mul)));
            foreach (var note in Quests.Progress(ObjectiveType.Kill, def.Id)) OnQuestNote(note);
            var drops = DropRoller.Roll(def, Data, Rng, 1, 1 + Stats.Mods.MesoPct / 100);
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
            foreach (var m in Map.Mobs)
            {
                MobAI.Step(m, Map.Physics, sense, dt, Rng);
                if (!m.Alive || Dead) continue;
                // 遠くから撃つ敵（遠・魔）: 前にいて近ければ 3 秒ごとに撃つ
                if ((m.Def.Ranged || (m.Def.Magic && !m.Def.Touch)) && !sense.Hidden && m.AttackCooldown <= 0 && m.State != MobState.Hit)
                {
                    double dx = Body.X - m.X;
                    bool inFront = (m.AggroT > 0 || m.Def.ChaseOnSight || m.Def.Move == MobMove.Stand) && Math.Abs(dx) < 300 && Math.Abs(Body.Y - m.Y) < 60;
                    if (inFront)
                    {
                        m.Facing = dx >= 0 ? 1 : -1;
                        m.AttackCooldown = 3;
                        Map.Projectiles.Add(new MobProjectile
                        {
                            X = m.X + m.Facing * m.Def.Width / 2, Y = m.Y - m.Def.Height / 2, Vx = m.Facing * 300, Life = 1.2,
                            Atk = m.Def.Magic ? Math.Max(1, m.Def.Matk) : m.Atk, MobLv = m.Def.Lv, MobAcc = m.Def.Acc, Magic = m.Def.Magic, FromX = m.X,
                        });
                    }
                }
                if (m.Def.Touch && !sense.Hidden && Body.InvT <= 0 && m.Box.Overlaps(pbox))
                    TakeHit(m.Atk, m.Def.Lv, m.Def.Acc, false, m.X, m);
            }
            if (Dead) return;
            foreach (var p in Map.Projectiles)
            {
                if (p.Dead || !p.Box.Overlaps(pbox) || Stats.Stealth) continue;
                p.Dead = true;
                if (Body.InvT <= 0) TakeHit(p.Atk, p.MobLv, p.MobAcc, p.Magic, p.FromX);
            }
        }

        /// <summary>
        /// 敵の攻撃を受ける（避けた時は MISS）。煙玉・影の身代わり・守りの盾で受けない。不屈・聖なる守り・属性への耐性で減り、
        /// 守りの構え・魔力の反射で返し、お金の盾・魔力の盾で一部をお金・MP で受ける。source = 攻撃した敵（分かる時）。
        /// </summary>
        public void TakeHit(int atk, int mobLv, int mobAcc, bool magic, double fromX, Mob source = null)
        {
            if (Dead || Body.InvT > 0) return;
            var mods = Stats.Mods;
            double headY = Body.Y - PlayerBody.Height;
            bool front = (fromX - Body.X) * Body.Facing >= 0;
            if (mods.Invincible || (mods.DodgeChance > 0 && Rng.Chance(mods.DodgeChance)))
            {
                Out.Damage.Add(new DamageNumber { Kind = DamageKind.Miss, X = Body.X, Y = headY });
                Body.InvT = 0.6;
                return;
            }
            if (!magic && mods.GuardChance > 0 && front && Rng.Chance(mods.GuardChance))
            {
                // 守りの盾: 正面の攻撃を完全に防ぎ、その敵を気絶させる
                Out.Damage.Add(new DamageNumber { Kind = DamageKind.Miss, X = Body.X, Y = headY });
                Out.Add(GameEventType.Message, "guard", text: "盾で防いだ");
                if (source != null) TryInflict(source, new StatusRequest { Type = "stun", Chance = 100, Sec = 2, SkillId = "guard" });
                Body.InvT = 0.6;
                return;
            }
            var res = DamageCalc.Taken(atk, mobLv, mobAcc, magic, Stats, Character.Level, Character.Line == JobLine.Warrior, Rng);
            if (res.Miss)
            {
                Out.Damage.Add(new DamageNumber { Kind = DamageKind.Miss, X = Body.X, Y = headY });
                Body.InvT = 0.6; // 避けた後すぐまた当たらないように（ふっとびは無し）
                return;
            }
            double dmg = res.Damage;
            dmg *= 1 - Math.Min(90, mods.DamageTakenPct) / 100;
            if (magic) dmg *= 1 - Math.Min(90, mods.ElementResist) / 100;
            double refl = magic ? mods.MagicReflect : mods.Reflect;
            if (refl > 0 && source != null && source.Alive)
            {
                int back = (int)Math.Floor(dmg * refl / 100);
                if (back > 0)
                {
                    DamageMob(source, new HitResult { Damage = Math.Min(back, Math.Max(1, source.Def.Hp / 10)) });
                    if (!magic) dmg -= back; // 守りの構え: 返した分は自分が受けない
                }
            }
            int damage = Math.Max(1, (int)Math.Floor(dmg));
            var mg = Buffs.MesoGuard;
            if (mg != null)
            {
                int cut = (int)Math.Floor(damage * mg.MesoGuardPct / 100);
                long cost = (long)Math.Ceiling(cut * mg.MesoGuardCost);
                if (cut > 0 && Inventory.Meso >= cost) { Inventory.AddMeso(-cost); damage -= cut; }
            }
            var (hpDmg, mpDmg) = DamageCalc.SplitMagicGuard(damage, Stats.MagicGuard, Character.Mp);
            Character.Mp -= mpDmg;
            Character.Hp -= hpDmg;
            Out.Damage.Add(new DamageNumber { Kind = DamageKind.Taken, Value = damage, X = Body.X, Y = headY });
            PlayerPhysics.Hurt(Body, fromX);
            Attack = null;
            poseTracker.AlertLeft = PoseTracker.AlertTime;
            Out.Add(GameEventType.Hurt, value: damage, x: Body.X, y: Body.Y);
            if (Character.Hp <= 0) Die();
        }
    }
}
