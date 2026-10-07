// 最終の能力（ステータス画面に出る値）: AP で振った値＋装備＋バフ＋パッシブ → 攻撃の幅・命中・回避・防御・魔法攻撃・速さ。
// 式は STATS.md 1〜4 章。
using System;
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

    public static class StatCalc
    {
        /// <summary>素手の攻撃力（初心者が武器を持たない時）。STATS.md「攻撃力は Lv で決まる」→ 8 + Lv（最大 20）。似。</summary>
        public static int BareHandWatk(int level) => Math.Min(20, 8 + level);
        /// <summary>基礎の命中（レベルで自然に上がる分）。DEX に振らない初心者でも同じくらいの Lv の敵に当たるように: 5 + Lv × 0.5（STATS.md 2 章）</summary>
        public static double BaseAcc(int level) => 5 + level * 0.5;

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
            double masteryPct = 0, critPct = 0, critDmgPct = 0;
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
                    }
                }
            }

            f.Str = c.Str + es.Str + bs.Str + ps.Str;
            f.Dex = c.Dex + es.Dex + bs.Dex + ps.Dex;
            f.Int = c.Int + es.Int + bs.Int + ps.Int;
            f.Luk = c.Luk + es.Luk + bs.Luk + ps.Luk;
            f.MaxHp = Math.Max(1, c.BaseMaxHp + es.Hp + bs.Hp + ps.Hp);
            f.MaxMp = Math.Max(0, c.BaseMaxMp + es.Mp + bs.Mp + ps.Mp);

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

            // 防御: 装備＋STR÷10（物理）、INT÷2（魔法）
            f.Wdef = es.Wdef + bs.Wdef + ps.Wdef + f.Str / 10;
            f.Mdef = es.Mdef + bs.Mdef + ps.Mdef + f.Int / 2;
            // 命中・回避
            f.Acc = BaseAcc(c.Level) + f.Dex * 0.8 + f.Luk * 0.5 + es.Acc + bs.Acc + ps.Acc;
            f.Avoid = f.Dex * 0.25 + f.Luk * 0.5 + es.Avoid + bs.Avoid + ps.Avoid;
            f.AvoidCap = Jobs.Get(c.Line).AvoidCap;
            // 速さ・ジャンプ（100 が基準、最大 140 / 123）
            f.Speed = Math.Max(100 - 50, Math.Min(140, 100 + es.Speed + bs.Speed + ps.Speed));
            f.Jump = Math.Max(100 - 50, Math.Min(123, 100 + es.Jump + bs.Jump + ps.Jump));

            f.Mastery = Math.Max(0.1, masteryPct / 100);
            f.CritRate = Math.Min(1, critPct / 100);
            f.CritDamage = critPct > 0 ? Math.Max(2.0, critDmgPct / 100) : 1;

            // 攻撃速度: 武器の段階 − 加速（最小 2）
            int stage = wdef?.AttackSpeed > 0 ? wdef.AttackSpeed : f.Weapon.Speed;
            stage -= buffs?.BoosterFor(f.WeaponType) ?? 0;
            f.AttackStage = Math.Max(2, stage);
            f.AttackDelay = Feel.AttackDelay(f.AttackStage);

            f.Range = Formulas.PhysRange(f.Weapon.Mul(false), f.MainStat, f.SubStat, f.Watk, f.Mastery);

            // 自然回復（STATS.md 5 章）: HP +10、MP +3 + INT÷10（＋スキル）
            f.HpRegen += 10;
            f.MpRegen += 3 + f.Int / 10;
            f.MagicGuard = buffs?.MagicGuard ?? 0;
            f.Stealth = buffs?.Stealth ?? false;
            return f;
        }
    }
}
