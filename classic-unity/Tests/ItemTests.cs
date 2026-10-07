// アイテム（ITEMS.md）: 持ち物 5 タブ・枠・束ねる・装備の決まり・強化の書・薬・帰還の書・店・お金。
using System;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Util;
using Xunit;

namespace Lumina.Core.Tests
{
    public class ItemTests
    {
        private static Inventory Inv() => new Inventory(TestData.Get().Item);

        [Fact]
        public void ItemsDataLoaded()
        {
            var d = TestData.Get();
            Assert.True(d.Items.Count > 1000);
            Assert.Equal(671, d.Items.Values.Count(i => i.IsEquip && (i.Id.StartsWith("eq.warrior") || i.Id.StartsWith("eq.magician") || i.Id.StartsWith("eq.bowman") || i.Id.StartsWith("eq.thief") || i.Id.StartsWith("eq.pirate") || i.Id.StartsWith("eq.common.") || i.Id.StartsWith("eq.starter"))));
            var red = d.Item("use.red_potion");
            Assert.Equal("赤ポーション", red.Name);
            Assert.Equal(50, red.Use.Hp);
            Assert.Equal(50, red.Price);
            Assert.Equal(100, red.MaxStack);
            var sword = d.Item("eq.warrior.sword1.30");
            Assert.Equal(EquipSlot.Weapon, sword.Slot);
            Assert.Equal(Stat.STR, sword.ReqStat);
            Assert.Equal(85, sword.ReqValue); // 2.5 × 30 + 10
            Assert.Equal(7, sword.Upgrades);
            Assert.True(sword.AllowsShield);
            Assert.True(d.Item("eq.warrior.sword2.30").TwoHanded);
            Assert.Equal(217, d.Items.Values.Count(i => i.Scroll != null)); // DESIGN.md「書の種類: 48（× 成功率 5 種 = 217 品）」
        }

        [Fact]
        public void FiveTabsSlotsAndStacking()
        {
            var inv = Inv();
            for (int t = 0; t < 5; t++) Assert.Equal(24, inv.SlotCount((InvTab)t));
            Assert.Equal(0, inv.Add("use.red_potion", 250));
            Assert.Equal(250, inv.Count("use.red_potion"));
            Assert.Equal(21, inv.FreeSlots(InvTab.Use)); // 100 + 100 + 50
            Assert.Equal(0, inv.Add("use.red_potion", 30)); // 50 の枠に重なる
            Assert.Equal(21, inv.FreeSlots(InvTab.Use));
            Assert.Equal(0, inv.Add("etc.M001", 5));
            Assert.Equal(23, inv.FreeSlots(InvTab.Etc));
            Assert.Equal(0, inv.Add("eq.starter.0", 3)); // 装備は重ならない
            Assert.Equal(21, inv.FreeSlots(InvTab.Equip));
            Assert.True(inv.Remove("use.red_potion", 180));
            Assert.Equal(100, inv.Count("use.red_potion"));
            Assert.False(inv.Remove("use.red_potion", 101));
            // いっぱい
            var full = Inv();
            Assert.Equal(1, full.Add("eq.starter.0", 25));
            Assert.False(full.CanAdd("eq.starter.1"));
            full.Expand(InvTab.Equip, 4);
            Assert.Equal(28, full.SlotCount(InvTab.Equip));
            Assert.True(full.CanAdd("eq.starter.1"));
            // 並べ替え
            var inv2 = Inv();
            inv2.Add("use.blue_potion", 5); inv2.Add("use.red_potion", 5);
            inv2.Swap(InvTab.Use, 0, 5);
            inv2.Sort(InvTab.Use);
            Assert.Equal("use.blue_potion", inv2.Get(InvTab.Use, 0).ItemId);
        }

        [Fact]
        public void MesoCap()
        {
            var inv = Inv();
            inv.AddMeso(Inventory.MaxMeso);
            inv.AddMeso(100);
            Assert.Equal(Inventory.MaxMeso, inv.Meso);
            Assert.False(Inv().AddMeso(-1));
        }

        [Fact]
        public void EquipRules()
        {
            var d = TestData.Get();
            var c = new CharacterState();
            var inv = Inv();
            var eq = new Equipment(d.Item);
            inv.Add("eq.warrior.sword1.10");
            Assert.Equal(EquipResult.WrongJob, eq.EquipFromInventory(inv, 0, c)); // 初心者は共通だけ
            c.Line = JobLine.Warrior; c.Tier = 1; c.Level = 9; c.Str = 40;
            Assert.Equal(EquipResult.LevelTooLow, eq.EquipFromInventory(inv, 0, c));
            c.Level = 10; c.Str = 30;
            Assert.Equal(EquipResult.StatTooLow, eq.EquipFromInventory(inv, 0, c));
            c.Str = 35;
            Assert.Equal(EquipResult.Ok, eq.EquipFromInventory(inv, 0, c));
            // 盾 → 両手剣にすると盾が外れる
            inv.Add("eq.warrior.shield.10");
            Assert.Equal(EquipResult.Ok, eq.EquipFromInventory(inv, 0, c));
            Assert.NotNull(eq.Get(EquipSlot.Shield));
            inv.Add("eq.warrior.sword2.10");
            int slot = Enumerable.Range(0, 24).First(i => inv.Get(InvTab.Equip, i)?.ItemId == "eq.warrior.sword2.10");
            Assert.Equal(EquipResult.Ok, eq.EquipFromInventory(inv, slot, c));
            Assert.Null(eq.Get(EquipSlot.Shield));
            Assert.Equal(1, inv.Count("eq.warrior.shield.10"));
            Assert.Equal(1, inv.Count("eq.warrior.sword1.10"));
            // 盾を着けると両手剣が外れる
            slot = Enumerable.Range(0, 24).First(i => inv.Get(InvTab.Equip, i)?.ItemId == "eq.warrior.shield.10");
            Assert.Equal(EquipResult.Ok, eq.EquipFromInventory(inv, slot, c));
            Assert.Null(eq.Get(EquipSlot.Weapon));
            // 全身と上下（魔法使いのローブ）
            var m = new CharacterState { Line = JobLine.Magician, Tier = 1, Level = 10, Int = 40 };
            var minv = Inv(); var meq = new Equipment(d.Item);
            minv.Add("eq.starter.2"); minv.Add("eq.starter.3");
            meq.EquipFromInventory(minv, 0, m); meq.EquipFromInventory(minv, 1, m);
            Assert.NotNull(meq.Get(EquipSlot.Top)); Assert.NotNull(meq.Get(EquipSlot.Bottom));
            minv.Add("eq.magician.overall.10");
            slot = Enumerable.Range(0, 24).First(i => minv.Get(InvTab.Equip, i)?.ItemId == "eq.magician.overall.10");
            Assert.Equal(EquipResult.Ok, meq.EquipFromInventory(minv, slot, m));
            Assert.Null(meq.Get(EquipSlot.Top)); Assert.Null(meq.Get(EquipSlot.Bottom));
            Assert.Equal(2, minv.All().Count(x => x.tab == InvTab.Equip));
            slot = Enumerable.Range(0, 24).First(i => minv.Get(InvTab.Equip, i)?.ItemId == "eq.starter.2");
            Assert.Equal(EquipResult.Ok, meq.EquipFromInventory(minv, slot, m));
            Assert.Null(meq.Get(EquipSlot.Overall));
        }

        [Fact]
        public void ScrollsSuccessRatesAndCurse()
        {
            var d = TestData.Get();
            var swordDef = d.Item("eq.warrior.sword1.30");
            var s100 = d.Item("scroll.W01.100");
            var s60 = d.Item("scroll.W01.60");
            var s10 = d.Item("scroll.W01.10");
            var s30 = d.Item("scroll.W01.30");
            var s70 = d.Item("scroll.W01.70");
            Assert.Equal(1, s100.Scroll.Stats.Watk);
            Assert.Equal(5, s10.Scroll.Stats.Watk); Assert.Equal(3, s10.Scroll.Stats.Str);
            Assert.True(s30.Scroll.Cursed); Assert.Equal(30, s30.Scroll.Rate);
            var rng = new Rng(9);
            var it = ItemInstance.NewEquip(swordDef);
            int watk = it.Stats.Watk;
            Assert.Equal(ScrollResult.Success, ScrollSystem.Apply(s100, swordDef, it, rng));
            Assert.Equal(watk + 1, it.Stats.Watk);
            Assert.Equal(6, it.UpgradesLeft);
            Assert.Equal(1, it.Upgraded);
            Assert.Equal(ScrollResult.WrongTarget, ScrollSystem.Apply(d.Item("scroll.W02.60"), swordDef, it, rng)); // 両手剣の書
            Assert.Equal(ScrollResult.WrongTarget, ScrollSystem.Apply(d.Item("scroll.A01.60"), swordDef, it, rng)); // 帽子の書
            // 確率（たくさん試す）
            double Rate(ItemDef sc, out double destroyed)
            {
                int ok = 0, gone = 0, n = 20000;
                for (int i = 0; i < n; i++)
                {
                    var x = ItemInstance.NewEquip(swordDef);
                    var r = ScrollSystem.Apply(sc, swordDef, x, rng);
                    if (r == ScrollResult.Success) ok++;
                    if (r == ScrollResult.Destroyed) gone++;
                    Assert.Equal(6, x.UpgradesLeft); // 成功しても失敗しても 1 減る
                }
                destroyed = gone / (double)n;
                return ok / (double)n;
            }
            Assert.InRange(Rate(s60, out var g60), 0.58, 0.62); Assert.Equal(0, g60);
            Assert.InRange(Rate(s10, out var g10), 0.09, 0.11); Assert.Equal(0, g10);
            Assert.InRange(Rate(s70, out var g70), 0.68, 0.72); Assert.InRange(g70, 0.13, 0.17); // 失敗 30% の半分
            Assert.InRange(Rate(s30, out var g30), 0.28, 0.32); Assert.InRange(g30, 0.33, 0.37); // 失敗 70% の半分
            // 回数が尽きたら使えない
            var y = ItemInstance.NewEquip(swordDef);
            for (int i = 0; i < 7; i++) ScrollSystem.Apply(s100, swordDef, y, rng);
            Assert.Equal(ScrollResult.NoUpgradesLeft, ScrollSystem.Apply(s100, swordDef, y, rng));
            Assert.Equal(swordDef.Stats.Watk + 7, y.Stats.Watk);
        }

        [Fact]
        public void ScrollThroughSessionDestroysEquipment()
        {
            var s = GameSession.NewGame(TestData.Get(), "書", 3);
            // 着ている木の剣（片手剣・強化 7 回）に呪いの書 30% を使い続ける。書は 1 回ごとに無くなる
            var results = new System.Collections.Generic.List<ScrollResult>();
            for (int i = 0; i < 10 && s.Equipment.Get(EquipSlot.Weapon) != null; i++)
            {
                s.Inventory.Add("scroll.W01.30");
                var r = s.ApplyScrollToEquipped("scroll.W01.30", EquipSlot.Weapon);
                results.Add(r);
                if (r == ScrollResult.NoUpgradesLeft) break;
                Assert.Equal(0, s.Inventory.Count("scroll.W01.30"));
            }
            if (results.Contains(ScrollResult.Destroyed))
            {
                Assert.Null(s.Equipment.Get(EquipSlot.Weapon));
                Assert.Equal(ScrollResult.Destroyed, results.Last());
                Assert.Equal("素手", s.Stats.WeaponType);
            }
            else Assert.Equal(0, s.Equipment.Get(EquipSlot.Weapon).UpgradesLeft);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.ScrollResult);
        }

        [Fact]
        public void DroppedEquipVariesAndQuality()
        {
            var d = TestData.Get();
            var def = d.Item("eq.warrior.cap.50");
            var rng = new Rng(12);
            int quality = 0, differs = 0;
            for (int i = 0; i < 5000; i++)
            {
                var it = ItemInstance.DroppedEquip(def, rng);
                if (it.Quality) { quality++; continue; }
                Assert.InRange(it.Stats.Wdef, def.Stats.Wdef - Math.Max(1, (int)Math.Round(def.Stats.Wdef * 0.05)), def.Stats.Wdef + Math.Max(1, (int)Math.Round(def.Stats.Wdef * 0.05)));
                if (it.Stats.Wdef != def.Stats.Wdef) differs++;
            }
            Assert.InRange(quality, 25, 80); // 1%
            Assert.True(differs > 1000);
        }

        [Fact]
        public void PotionsTonicsAndReturnScrolls()
        {
            var s = GameSession.NewGame(TestData.Get(), "薬", 5);
            s.Character.BaseMaxHp = 500; s.Character.BaseMaxMp = 500; s.RefreshStats();
            s.Character.Hp = 100; s.Character.Mp = 100;
            s.Inventory.Add("use.red_potion", 2); s.Inventory.Add("use.blue_potion"); s.Inventory.Add("use.elixir"); s.Inventory.Add("use.power_tonic");
            Assert.True(s.UseItem("use.red_potion"));
            Assert.Equal(150, s.Character.Hp);
            Assert.Equal(1, s.Inventory.Count("use.red_potion"));
            Assert.True(s.UseItem("use.blue_potion"));
            Assert.Equal(200, s.Character.Mp);
            Assert.True(s.UseItem("use.elixir"));
            Assert.Equal(150 + s.Stats.MaxHp / 2, s.Character.Hp);
            int watk = s.Stats.Watk;
            Assert.True(s.UseItem("use.power_tonic"));
            Assert.Equal(watk + 5, s.Stats.Watk);
            s.Step(new PlayerInput(), 60 * 181);
            Assert.Equal(watk, s.Stats.Watk); // 3 分で切れる
            Assert.False(s.UseItem("use.blue_potion")); // もう無い
            // 帰還の書: 地域の外では使えない
            s.Inventory.Add("use.return.V100");
            Assert.False(s.UseItem("use.return.V100"));
            s.Inventory.Add("use.return.nearest");
            Assert.True(s.UseItem("use.return.nearest"));
            Assert.Equal("S003", s.Map.Data.Id);
        }

        [Fact]
        public void ShopBuySellAndInn()
        {
            var s = GameSession.NewGame(TestData.Get(), "店", 6);
            s.ChangeMap("S003");
            s.Inventory.Meso = 1000;
            Assert.Equal(ShopResult.Ok, s.Buy("shop.S003.potion", "use.red_potion", 10));
            Assert.Equal(500, s.Inventory.Meso);
            Assert.Equal(10, s.Inventory.Count("use.red_potion"));
            Assert.Equal(ShopResult.NotEnoughMeso, s.Buy("shop.S003.potion", "use.blue_potion", 3));
            Assert.Equal(ShopResult.NotSold, s.Buy("shop.S003.potion", "use.elixir"));
            Assert.Equal(ShopResult.Ok, s.Buy("shop.S003.general", "eq.starter.1")); // 布のバンダナ 200
            Assert.Equal(300, s.Inventory.Meso);
            int slot = Enumerable.Range(0, 24).First(i => s.Inventory.Get(InvTab.Equip, i)?.ItemId == "eq.starter.1");
            Assert.Equal(ShopResult.Ok, s.Sell(InvTab.Equip, slot));
            Assert.Equal(300 + 200 / 5, s.Inventory.Meso); // 装備は 1/5
            s.Inventory.Add("special.letter_breeze");
            int ls = Enumerable.Range(0, 24).First(i => s.Inventory.Get(InvTab.Special, i) != null);
            Assert.Equal(ShopResult.CannotSell, s.Sell(InvTab.Special, ls));
            // 宿屋
            s.Character.Hp = 1;
            Assert.True(s.RestAtInn("momo"));
            Assert.Equal(s.Stats.MaxHp, s.Character.Hp);
            // 店の無いマップ
            s.ChangeMap("S004");
            Assert.Equal(ShopResult.NoShopHere, s.Buy("shop.S003.potion", "use.red_potion"));
        }

        [Fact]
        public void JobAdvanceExpandsInventory()
        {
            var s = GameSession.NewGame(TestData.Get(), "転職", 8);
            s.Character.Level = 10; s.Character.Str = 35;
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob(JobLine.Warrior));
            Assert.Equal(28, s.Inventory.SlotCount(InvTab.Equip));
            Assert.Equal(28, s.Inventory.SlotCount(InvTab.Use));
            Assert.Equal(24, s.Inventory.SlotCount(InvTab.Setup));
            Assert.Equal(28, s.Inventory.SlotCount(InvTab.Etc));
            Assert.Equal("戦士", s.Character.JobName);
        }
    }
}
