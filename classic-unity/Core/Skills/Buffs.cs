// かかっている強化（バフ）・召喚。時間が切れると消える。UI.md 1-2: 残り 5 秒から点滅（Blinking）。
using System;
using System.Collections.Generic;
using Lumina.Core.Items;

namespace Lumina.Core.Skills
{
    public sealed class ActiveBuff
    {
        public string Id;            // スキルかアイテムの ID（同じ ID はかけ直すと上書き）
        public string Name;
        public int SkillLevel;
        public StatBlock Stats = new StatBlock();
        public double Remaining, Total;
        public double MagicGuardPct; // 魔力の盾（%）
        public bool Stealth;         // 闇隠れ
        public int HotHp; public double HotInterval, HotTimer;
        public int Booster; public List<string> BoosterWeapons;
        public int BoosterStack;     // 神速（加速と重なる）
        // 2〜4 次
        public double DamagePct;     // ダメージ +%
        public string Element;       // 付与の属性
        public bool Charge;          // 付与
        public List<StatusRequest> OnHitStatus;
        public double StatPct, HpPct, MpPct, ExpPct, MesoPct, CritRate, CritDamage, MpCostPct;
        public bool NoAmmo, NoMp;
        public double Infinity, InfinityT; // 無限の魔力: Infinity 秒ごとに +4%
        public double Reflect, MagicReflect, DamageReduce;
        public bool Invincible, StatusImmune, Revive, SlowFall, Transform, Ship;
        public double MesoGuardPct, MesoGuardCost;
        public double ShadowPartner; // まねる攻撃の威力（%）
        public int HpDrain; public double HpDrainInterval, HpDrainTimer;
        public bool Combo; public int ComboMax, Orbs; public double ComboDamage; // 闘気（玉の数）
        // 召喚
        public bool Summon; public int SummonHeal; public double SummonInterval, SummonTimer;
        public SummonAttackDef SummonAttack; public double SummonAttackTimer;
        public bool SummonFixed; public double SummonX, SummonY;
        public int DecoyHp, DecoyMaxHp; // 身代わり人形の HP（0 になると消える）
        public string SummonMap;     // 置いたマップ（置く物はそのマップの中だけ）
        public int ShipHp, ShipMaxHp; // 乗船: 船の HP

        public bool Blinking => Remaining <= 5;
    }

    public struct BuffTickResult
    {
        public int HealHp;
        public int LoseHp;           // 竜の血
        public List<string> Expired;
    }

    public sealed class BuffSet
    {
        public readonly List<ActiveBuff> List = new List<ActiveBuff>();

        public void Apply(ActiveBuff b)
        {
            List.RemoveAll(x => x.Id == b.Id);
            if (b.Charge) List.RemoveAll(x => x.Charge);          // 付与は同時に 1 つ
            if (b.Transform) List.RemoveAll(x => x.Transform);    // 変身も 1 つ
            List.Add(b);
        }

        public bool Has(string id) => List.Exists(x => x.Id == id);
        public ActiveBuff Get(string id) => List.Find(x => x.Id == id);
        public void Remove(string id) => List.RemoveAll(x => x.Id == id);
        public void RemoveStealth() => List.RemoveAll(x => x.Stealth);
        public void Clear() => List.Clear();

        public BuffTickResult Tick(double dt)
        {
            var r = new BuffTickResult();
            for (int i = List.Count - 1; i >= 0; i--)
            {
                var b = List[i];
                b.Remaining -= dt;
                if (b.HotHp > 0 && b.HotInterval > 0)
                {
                    b.HotTimer += dt;
                    while (b.HotTimer >= b.HotInterval - 1e-9) { b.HotTimer -= b.HotInterval; r.HealHp += b.HotHp; }
                }
                if (b.Summon && b.SummonHeal > 0 && b.SummonInterval > 0)
                {
                    b.SummonTimer += dt;
                    while (b.SummonTimer >= b.SummonInterval - 1e-9) { b.SummonTimer -= b.SummonInterval; r.HealHp += b.SummonHeal; }
                }
                if (b.HpDrain > 0 && b.HpDrainInterval > 0)
                {
                    b.HpDrainTimer += dt;
                    while (b.HpDrainTimer >= b.HpDrainInterval - 1e-9) { b.HpDrainTimer -= b.HpDrainInterval; r.LoseHp += b.HpDrain; }
                }
                if (b.Infinity > 0) b.InfinityT += dt;
                if (b.Remaining <= 1e-9)
                {
                    (r.Expired ??= new List<string>()).Add(b.Id);
                    List.RemoveAt(i);
                }
            }
            return r;
        }

        /// <summary>バフの能力値の合計。stealthNoSlow（影の衣）なら闇隠れの速さの低下を数えない。</summary>
        public StatBlock TotalStats(bool stealthNoSlow = false)
        {
            var s = new StatBlock();
            foreach (var b in List)
            {
                s.Add(b.Stats);
                if (stealthNoSlow && b.Stealth && b.Stats.Speed < 0) s.Speed -= b.Stats.Speed;
            }
            return s;
        }

        private double Sum(Func<ActiveBuff, double> f) { double t = 0; foreach (var b in List) t += f(b); return t; }
        private double Max(Func<ActiveBuff, double> f) { double t = 0; foreach (var b in List) t = Math.Max(t, f(b)); return t; }

        public double MagicGuard => Max(b => b.MagicGuardPct);
        public bool Stealth => List.Exists(b => b.Stealth);
        public double DamagePct => Sum(b => b.DamagePct);
        public double StatPct => Max(b => b.StatPct);
        public double HpPct => Max(b => b.HpPct);
        public double MpPct => Max(b => b.MpPct);
        public double ExpPct => Sum(b => b.ExpPct);
        public double MesoPct => Sum(b => b.MesoPct);
        public double CritRate => Sum(b => b.CritRate);
        public double CritDamage => Sum(b => b.CritDamage);
        public double MpCostPct => Max(b => b.MpCostPct);
        public double Reflect => Max(b => b.Reflect);
        public double MagicReflect => Max(b => b.MagicReflect);
        public double DamageReduce => Max(b => b.DamageReduce);
        public double ShadowPartner => Max(b => b.ShadowPartner);
        public bool NoAmmo => List.Exists(b => b.NoAmmo);
        public bool NoMp => List.Exists(b => b.NoMp);
        public bool Invincible => List.Exists(b => b.Invincible);
        public bool StatusImmune => List.Exists(b => b.StatusImmune);
        public bool Transformed => List.Exists(b => b.Transform);
        public ActiveBuff ChargeBuff => List.Find(b => b.Charge);
        public ActiveBuff ComboBuff => List.Find(b => b.Combo);
        public ActiveBuff MesoGuard => List.Find(b => b.MesoGuardPct > 0);
        public ActiveBuff ReviveBuff => List.Find(b => b.Revive);
        public ActiveBuff ShipBuff => List.Find(b => b.Ship);
        public ActiveBuff DecoyBuff => List.Find(b => b.Summon && b.DecoyMaxHp > 0);
        public bool SlowFall => List.Exists(b => b.SlowFall);
        /// <summary>無限の魔力: かけてから Infinity 秒ごとに魔法のダメージ +4%。</summary>
        public double InfinityPct => Max(b => b.Infinity > 0 ? 4 * Math.Floor(b.InfinityT / b.Infinity) : 0);

        public int BoosterFor(string weaponType)
        {
            int best = 0, stack = 0;
            foreach (var b in List)
            {
                stack += b.BoosterStack;
                if (b.Booster <= 0) continue;
                if (b.BoosterWeapons != null && b.BoosterWeapons.Count > 0 && (weaponType == null || !b.BoosterWeapons.Contains(weaponType))) continue;
                best = Math.Max(best, b.Booster);
            }
            return best + stack;
        }

        public ActiveBuff Summon => List.Find(b => b.Summon);
        public IEnumerable<ActiveBuff> Summons { get { foreach (var b in List) if (b.Summon) yield return b; } }
    }
}
