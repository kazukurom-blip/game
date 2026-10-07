// 強化の書（ITEMS.md 2-3）: 10% / 60% / 100%、呪い付き 30% / 70%（失敗すると 50% で装備が壊れて消える）。
// 成功しても失敗しても強化の回数は 1 減る。
using Lumina.Core.Util;

namespace Lumina.Core.Items
{
    public enum ScrollResult { Success, Fail, Destroyed, NoUpgradesLeft, WrongTarget, NotScroll }

    public static class ScrollSystem
    {
        public static bool Fits(ItemDef scroll, ItemDef equip)
        {
            if (scroll?.Scroll == null || equip == null || !equip.IsEquip) return false;
            var s = scroll.Scroll;
            if (s.TargetWeapon != null) return equip.WeaponType == s.TargetWeapon;
            return s.TargetSlot == equip.Slot;
        }

        /// <summary>書を使う。書そのものを持ち物から減らすのは呼ぶ側。Destroyed なら装備を消すのも呼ぶ側。</summary>
        public static ScrollResult Apply(ItemDef scroll, ItemDef equipDef, ItemInstance equip, IRandom rng)
        {
            if (scroll?.Scroll == null) return ScrollResult.NotScroll;
            if (!Fits(scroll, equipDef)) return ScrollResult.WrongTarget;
            if (equip.UpgradesLeft <= 0) return ScrollResult.NoUpgradesLeft;
            var s = scroll.Scroll;
            equip.UpgradesLeft--;
            if (rng.Chance(s.Rate / 100.0))
            {
                if (equip.Stats == null) equip.Stats = equipDef.Stats.Clone();
                equip.Stats.Add(s.Stats);
                equip.Upgraded++;
                return ScrollResult.Success;
            }
            if (s.Cursed && rng.Chance(0.5)) return ScrollResult.Destroyed;
            return ScrollResult.Fail;
        }
    }
}
