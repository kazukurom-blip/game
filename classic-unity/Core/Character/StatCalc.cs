// 最終の能力（ステータス画面に出る値）: AP で振った値＋装備＋バフ＋パッシブ → 攻撃の幅・命中・回避・防御・魔法攻撃・速さ。
// 式は STATS.md 1〜4 章。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Items;
using Lumina.Core.Physics;
using Lumina.Core.Skills;

namespace Lumina.Core.Character
{
    public sealed class FinalStats
    {
        public int Str, Dex, Int, Luk;
        public int MaxHp, MaxMp;
        public int Watk;              // 攻撃力（武器＋装備＋バフ＋弾）
        public int MagicPower;        // 魔力（装備＋バフ）
        public int Matk => Int + MagicPower; // 魔法の式の M = INT + 魔力
        public int Wdef, Mdef;
        public double Acc, Avoid;
        public int Speed = 100, Jump = 100;
        public double Mastery = 0.1;
        public double CritRate;       // 0〜1
        public double CritDamage = 1; // 倍率（2.0 = 200%）
        public string WeaponType = "素手";
        public WeaponClass Weapon;
        public int AttackStage;       // 攻撃速度の段階（2〜9）
        public double AttackDelay;    // ふつうの攻撃 1 回の時間（秒）
        public DamageRange Range;     // 表示用の攻撃力の幅（振り）
        public double RangeBonus;     // 遠目・鋭い目・銃の心得
        public double AvoidCap;
        public int HpRegen, MpRegen;  // 10 秒ごと（立ち止まって）
        public double RopeRegenInterval; // 我慢: 縄でも回復する間隔（0 = 回復しない）
        public double MagicGuard;     // 魔力の盾（%）
        public bool Stealth;
        public string AmmoItem;       // 使う弾・矢・投げ星（無ければ null）
        public int AmmoWatk;
        public bool NeedsAmmo;
        /// <summary>2〜4 次のパッシブ・バフの効き目（追撃・闘気・不屈・増幅 …）。</summary>
        public SkillMods Mods = new SkillMods();

        public int MainStat => Get(Weapon.Main);
        public int SubStat => Weapon.SubIsStrDex ? Str + Dex : Get(Weapon.Sub);

        public int Get(Stat s)
        {
            switch (s)
            {
                case Stat.STR: return Str;
                case Stat.DEX: return Dex;
                case Stat.INT: return Int;
                case Stat.LUK: return Luk;
                default: return 0;
            }
        }
    }

    /// <summary>スキルの効き目の合計（パッシブは今の武器で効く物だけ）。GameSession の攻撃・被弾がこれを見る。</summary>
    public sealed class SkillMods
    {
        public double DamagePct;                  // バフのダメージ +%（付与・怒りの解放）
        public string ChargeElement;              // 付与の属性
        public double FinalAttackChance, FinalAttackDamage; // 追撃（0〜1・%）
        public int ComboMaxBonus; public double ComboDamageBonus, ComboRate; // 闘気の極み
        public double DamageTakenPct;             // 受けるダメージ -%（不屈・聖なる守り）
        public double ElementResist;              // 魔法のダメージ -%
        public double ResistPierce;               // 耐性のある敵へのダメージの低下を -%
        public double AmpDamage = 1, AmpMp = 1;   // 属性の増幅（倍率）
        public double MpEaterChance, MpEaterPct;
        public double GuardChance;                // 守りの盾（盾を持っている時だけ。0〜1）
        public double DodgeChance;                // 影の身代わり（0〜1）
        public readonly List<StatusRequest> OnHitStatus = new List<StatusRequest>();
        public double MesoOnHitChance;
        public double ExecuteChance, ExecuteHpPct;
        public int StarBundle;
        public double PotionPct, PotionTimePct, StunCrit;
        public bool HasEnergy; public int EnergyWatk, EnergyWdef, EnergyHpRegen;
        public double ChainStarChance;
        public double StealthAttackPct; public bool StealthNoSlow;
        public double BerserkHpPct;
        public double ExpPct, MesoPct, MpCostPct, DropPct;
        public bool NoAmmo, NoMp, Invincible, StatusImmune;
        public double Reflect, MagicReflect, ShadowPartner, InfinityPct;
    }

    public static class StatCalc
    {
        /// <summary>素手の攻撃力（初心者が武器を持たない時）。STATS.md「攻撃力は Lv で決まる」→ 8 + Lv（最大 20）。似。</summary>
        public static int BareHandWatk(int level) => Math.Min(20, 8 + level);
        /// <summary>基礎の命中（レベルで自然に上がる分）。DEX に振らない近接職でも同じくらいの Lv の敵にほぼ当たるように（STATS.md 2-3。式は Formulas.BaseAcc）</summary>
        public static double BaseAcc(int level) => Formulas.BaseAcc(level);

        public static FinalStats Compute(CharacterState c, Equipment eq, SkillBook book, BuffSet buffs, Inventory inv, GameData data)
        {
            var f = new FinalStats();
            var es = eq?.TotalStats() ?? new StatBlock();
            var bs = buffs?.TotalStats() ?? new StatBlock();
            var wdef = eq?.WeaponDef;
            f.WeaponType = wdef?.WeaponType ?? "素手";
            f.Weapon = WeaponClass.Get(f.WeaponType);

            // パッシブ（武器の種類で効く物を分ける）
            var ps = new StatBlock();
            var mods = f.Mods;
            double masteryPct = 0, critPct = 0, critDmgPct = 0, shieldDefPct = 0;
            if (book != null)
            {
                foreach (var (def, lv) in book.Learned())
                {
                    foreach (var p in def.Passives)
                    {
                        if (p.Weapons != null && !p.Weapons.Contains(f.WeaponType)) continue;
                        ps.Add(SkillDef.EvalStats(p.Stats, lv, c.Level));
                        if (p.Mastery != null) masteryPct = Math.Max(masteryPct, p.Mastery.Eval(lv, c.Level));
                        if (p.CritRate != null) critPct += p.CritRate.Eval(lv, c.Level);
                        if (p.CritDamage != null) critDmgPct = Math.Max(critDmgPct, p.CritDamage.Eval(lv, c.Level));
                        if (p.Range != null) f.RangeBonus += p.Range.Eval(lv, c.Level);
                        if (p.HpRegen != null) f.HpRegen += p.HpRegen.EvalInt(lv, c.Level);
                        if (p.MpRegen != null) f.MpRegen += p.MpRegen.EvalInt(lv, c.Level);
                        if (p.RopeRegenInterval != null) f.RopeRegenInterval = p.RopeRegenInterval.Eval(lv, c.Level);
                        AddPassiveMods(mods, p, def.Id, lv, c.Level, ref shieldDefPct);
                    }
                }
            }

            if (mods.StealthNoSlow && buffs != null) bs = buffs.TotalStats(true);
            // 全能力の加護: AP で振った能力値の +%
            double statPct = buffs?.StatPct ?? 0;
            f.Str = c.Str + es.Str + bs.Str + ps.Str + (int)Math.Floor(c.Str * statPct / 100);
            f.Dex = c.Dex + es.Dex + bs.Dex + ps.Dex + (int)Math.Floor(c.Dex * statPct / 100);
            f.Int = c.Int + es.Int + bs.Int + ps.Int + (int)Math.Floor(c.Int * statPct / 100);
            f.Luk = c.Luk + es.Luk + bs.Luk + ps.Luk + (int)Math.Floor(c.Luk * statPct / 100);
            f.MaxHp = Math.Max(1, c.BaseMaxHp + es.Hp + bs.Hp + ps.Hp);
            f.MaxMp = Math.Max(0, c.BaseMaxMp + es.Mp + bs.Mp + ps.Mp);
            // 体力強化（最大 HP・MP +%）
            if (buffs != null && buffs.HpPct > 0) f.MaxHp += (int)Math.Floor(f.MaxHp * buffs.HpPct / 100);
            if (buffs != null && buffs.MpPct > 0) f.MaxMp += (int)Math.Floor(f.MaxMp * buffs.MpPct / 100);

            f.Watk = es.Watk + bs.Watk + ps.Watk;
            if (wdef == null) f.Watk += BareHandWatk(c.Level);
            f.MagicPower = es.Matk + bs.Matk + ps.Matk;

            // 弾・矢・投げ星: 持ち物の消費タブの最初の 1 束（攻撃力を足す）
            if (f.Weapon.Ammo != null)
            {
                f.NeedsAmmo = true;
                if (inv != null && data != null)
                {
                    foreach (var (tab, slot, it) in inv.All())
                    {
                        if (tab != InvTab.Use) continue;
                        var d = data.Item(it.ItemId);
                        if (d != null && d.AmmoKind == f.Weapon.Ammo && it.Count > 0) { f.AmmoItem = d.Id; f.AmmoWatk = d.AmmoWatk; break; }
                    }
                }
                f.Watk += f.AmmoWatk;
            }

            // 気合い（満タンの時の攻撃力・防御は GameSession が「気合い満タン」のバフで足す）
            // 盾の熟練: 盾の防御 +%
            var shield = eq?.Get(EquipSlot.Shield);
            int shieldWdef = shield?.Stats?.Wdef ?? 0;
            if (shield == null) mods.GuardChance = 0; // 守りの盾は盾が要る
            // 防御: 装備＋STR÷10（物理）、INT÷2（魔法）
            f.Wdef = es.Wdef + bs.Wdef + ps.Wdef + f.Str / 10 + (int)Math.Floor(shieldWdef * shieldDefPct / 100);
            f.Mdef = es.Mdef + bs.Mdef + ps.Mdef + f.Int / 2;
            // 命中・回避
            f.Acc = Formulas.PlayerAcc(c.Level, f.Dex, f.Luk, es.Acc + bs.Acc + ps.Acc);
            f.Avoid = f.Dex * 0.25 + f.Luk * 0.5 + es.Avoid + bs.Avoid + ps.Avoid;
            f.AvoidCap = Jobs.Get(c.Line).AvoidCap;
            // 速さ・ジャンプ（100 が基準、最大 140 / 123）
            f.Speed = Math.Max(100 - 50, Math.Min(140, 100 + es.Speed + bs.Speed + ps.Speed));
            f.Jump = Math.Max(100 - 50, Math.Min(123, 100 + es.Jump + bs.Jump + ps.Jump));

            f.Mastery = Math.Max(0.1, masteryPct / 100);
            critPct += buffs?.CritRate ?? 0;   // 鷹の目
            f.CritRate = Math.Min(1, critPct / 100);
            f.CritDamage = critPct > 0 ? Math.Max(2.0, critDmgPct / 100) + (buffs?.CritDamage ?? 0) / 100 : 1;

            // バフの効き目
            if (buffs != null)
            {
                mods.DamagePct += buffs.DamagePct;
                mods.ChargeElement = buffs.ChargeBuff?.Element;
                foreach (var b in buffs.List) if (b.OnHitStatus != null) mods.OnHitStatus.AddRange(b.OnHitStatus);
                mods.DamageTakenPct += buffs.DamageReduce;
                mods.ExpPct = buffs.ExpPct; mods.MesoPct = buffs.MesoPct; mods.MpCostPct = buffs.MpCostPct; mods.DropPct = buffs.DropPct;
                mods.NoAmmo = buffs.NoAmmo; mods.NoMp = buffs.NoMp; mods.Invincible = buffs.Invincible; mods.StatusImmune = buffs.StatusImmune;
                mods.Reflect = buffs.Reflect; mods.MagicReflect = buffs.MagicReflect; mods.ShadowPartner = buffs.ShadowPartner;
                mods.InfinityPct = buffs.InfinityPct;
            }

            // 攻撃速度: 武器の段階 − 加速（最小 2）
            int stage = wdef?.AttackSpeed > 0 ? wdef.AttackSpeed : f.Weapon.Speed;
            stage -= buffs?.BoosterFor(f.WeaponType) ?? 0;
            f.AttackStage = Math.Max(2, stage);
            f.AttackDelay = Feel.AttackDelay(f.AttackStage);

            f.Range = Formulas.PhysRange(f.Weapon.Mul(false), f.MainStat, f.SubStat, f.Watk, f.Mastery);

            // 自然回復（STATS.md 5 章）: HP +10、MP +3 + INT÷10（＋スキル）
            f.HpRegen += 10 + (mods.HasEnergy && buffs != null && buffs.Has(EnergyBuffId) ? mods.EnergyHpRegen : 0);
            f.MpRegen += 3 + f.Int / 10;
            f.MagicGuard = buffs?.MagicGuard ?? 0;
            f.Stealth = buffs?.Stealth ?? false;
            return f;
        }
    
        /// <summary>気合いが満タンの時にかかるバフの ID（GameSession が付け外しする）。</summary>
        public const string EnergyBuffId = "energy_full";

        private static void AddPassiveMods(SkillMods m, PassiveEffect p, string skillId, int x, int lv, ref double shieldDefPct)
        {
            if (p.FinalAttackChance != null)
            {
                m.FinalAttackChance = Math.Max(m.FinalAttackChance, p.FinalAttackChance.Eval(x, lv) / 100);
                m.FinalAttackDamage = Math.Max(m.FinalAttackDamage, p.FinalAttackDamage?.Eval(x, lv) ?? 100);
            }
            if (p.ComboMax > 0 || p.ComboDamage != null || p.ComboRate != null)
            {
                m.ComboMaxBonus += p.ComboMax;
                m.ComboDamageBonus += p.ComboDamage?.Eval(x, lv) ?? 0;
                m.ComboRate += p.ComboRate?.Eval(x, lv) ?? 0;
            }
            if (p.DamageTaken != null) m.DamageTakenPct += p.DamageTaken.Eval(x, lv);
            if (p.ElementResist != null) m.ElementResist += p.ElementResist.Eval(x, lv);
            if (p.ResistPierce != null) m.ResistPierce += p.ResistPierce.Eval(x, lv);
            if (p.AmpDamage != null) m.AmpDamage = 1 + p.AmpDamage.Eval(x, lv) / 60;
            if (p.AmpMp != null) m.AmpMp = 1 + p.AmpMp.Eval(x, lv) / 60;
            if (p.MpEaterChance != null) { m.MpEaterChance = p.MpEaterChance.Eval(x, lv) / 100; m.MpEaterPct = p.MpEaterPct?.Eval(x, lv) ?? 0; }
            if (p.ShieldDefPct != null) shieldDefPct += p.ShieldDefPct.Eval(x, lv);
            if (p.Guard != null) m.GuardChance = Math.Max(m.GuardChance, p.Guard.Eval(x, lv) / 100);
            if (p.Dodge != null) m.DodgeChance = Math.Max(m.DodgeChance, p.Dodge.Eval(x, lv) / 100);
            foreach (var st in p.OnHitStatus) m.OnHitStatus.Add(st.Eval(x, lv, skillId));
            if (p.MesoOnHit != null) m.MesoOnHitChance = p.MesoOnHit.Eval(x, lv) / 100;
            if (p.ExecuteChance != null) { m.ExecuteChance = p.ExecuteChance.Eval(x, lv) / 100; m.ExecuteHpPct = p.ExecuteHpPct?.Eval(x, lv) ?? 10; }
            if (p.StarBundle != null) m.StarBundle += p.StarBundle.EvalInt(x, lv);
            if (p.PotionPct != null) m.PotionPct += p.PotionPct.Eval(x, lv);
            if (p.PotionTimePct != null) m.PotionTimePct += p.PotionTimePct.Eval(x, lv);
            if (p.StunCrit != null) m.StunCrit += p.StunCrit.Eval(x, lv);
            if (p.EnergyWatk != null || p.EnergyWdef != null)
            {
                m.HasEnergy = true;
                m.EnergyWatk = p.EnergyWatk?.EvalInt(x, lv) ?? 0; m.EnergyWdef = p.EnergyWdef?.EvalInt(x, lv) ?? 0; m.EnergyHpRegen = p.EnergyHpRegen?.EvalInt(x, lv) ?? 0;
            }
            if (p.ChainStar != null) m.ChainStarChance = p.ChainStar.Eval(x, lv) / 100;
            if (p.StealthAttack != null) m.StealthAttackPct += p.StealthAttack.Eval(x, lv);
            if (p.StealthNoSlow) m.StealthNoSlow = true;
            if (p.Berserk != null) m.BerserkHpPct = Math.Max(m.BerserkHpPct, p.Berserk.Eval(x, lv));
        }
    }
}
