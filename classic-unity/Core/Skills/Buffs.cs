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
        public StatBlock Stats = new StatBlock();
        public double Remaining, Total;
        public double MagicGuardPct; // 魔力の盾（%）
        public bool Stealth;         // 闇隠れ
        public int HotHp; public double HotInterval, HotTimer;
        public int Booster; public List<string> BoosterWeapons;
        // 召喚
        public bool Summon; public int SummonHeal; public double SummonInterval, SummonTimer;

        public bool Blinking => Remaining <= 5;
    }

    public struct BuffTickResult
    {
        public int HealHp;
        public List<string> Expired;
    }

    public sealed class BuffSet
    {
        public readonly List<ActiveBuff> List = new List<ActiveBuff>();

        public void Apply(ActiveBuff b)
        {
            List.RemoveAll(x => x.Id == b.Id);
            List.Add(b);
        }

        public bool Has(string id) => List.Exists(x => x.Id == id);
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
                if (b.Remaining <= 1e-9)
                {
                    (r.Expired ??= new List<string>()).Add(b.Id);
                    List.RemoveAt(i);
                }
            }
            return r;
        }

        public StatBlock TotalStats()
        {
            var s = new StatBlock();
            foreach (var b in List) s.Add(b.Stats);
            return s;
        }

        public double MagicGuard
        {
            get { double m = 0; foreach (var b in List) m = Math.Max(m, b.MagicGuardPct); return m; }
        }

        public bool Stealth => List.Exists(b => b.Stealth);

        public int BoosterFor(string weaponType)
        {
            int best = 0;
            foreach (var b in List)
            {
                if (b.Booster <= 0) continue;
                if (b.BoosterWeapons != null && b.BoosterWeapons.Count > 0 && (weaponType == null || !b.BoosterWeapons.Contains(weaponType))) continue;
                best = Math.Max(best, b.Booster);
            }
            return best;
        }

        public ActiveBuff Summon => List.Find(b => b.Summon);
    }
}
