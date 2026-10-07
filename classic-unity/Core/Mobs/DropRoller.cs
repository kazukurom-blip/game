// 倒した敵が落とす物を決める（ITEMS.md 5 章の確率。値は Data/monsters.json の drops）。
// お金 60%（量は 0.7〜1.3 倍）・素材 55%・薬 各 4%・原石 2%・宝石 1%・装備（Lv 帯）0.8%・書・呪いの書・固有品。
using System;
using System.Collections.Generic;
using Lumina.Core.Data;
using Lumina.Core.Items;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Mobs
{
    public static class DropRoller
    {
        /// <summary>dropRate: ドロップ 2 倍の時間などの倍率（ふつう 1）。questNeeds: 今集めているクエストの素材（確率はそのまま）。</summary>
        public static List<DropItem> Roll(MobDef def, GameData data, IRandom rng, double dropRate = 1, double mesoRate = 1)
        {
            var list = new List<DropItem>();
            if (def.Meso > 0 && rng.Chance(def.MesoChance))
            {
                long amount = (long)Math.Max(1, Math.Round(def.Meso * rng.Range(0.7, 1.3) * mesoRate));
                list.Add(new DropItem { Meso = amount });
            }
            foreach (var d in def.Drops)
            {
                if (d.Item == null || data.Item(d.Item) == null) continue;
                if (!rng.Chance(Math.Min(1, d.Chance * dropRate))) continue;
                var it = data.Item(d.Item);
                if (it.IsEquip) list.Add(new DropItem { ItemId = it.Id, Equip = ItemInstance.DroppedEquip(it, rng) });
                else list.Add(new DropItem { ItemId = it.Id, Count = Math.Max(1, d.Count) });
            }
            if (def.EquipChance > 0)
            {
                var band = data.EquipsOfBand(def.EquipBand);
                for (int i = 0; i < def.EquipCount && band.Count > 0; i++)
                {
                    if (!rng.Chance(Math.Min(1, def.EquipChance * dropRate))) continue;
                    var it = band[rng.Range(0, band.Count - 1)];
                    list.Add(new DropItem { ItemId = it.Id, Equip = ItemInstance.DroppedEquip(it, rng) });
                }
            }
            if (def.CursedScrollChance > 0 && rng.Chance(Math.Min(1, def.CursedScrollChance * dropRate)))
            {
                var cs = data.CursedScrolls();
                if (cs.Count > 0) list.Add(new DropItem { ItemId = cs[rng.Range(0, cs.Count - 1)].Id });
            }
            return list;
        }
    }
}
