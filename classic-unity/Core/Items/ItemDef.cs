// アイテムの定義（Data/items.json）。ITEMS.md の決まり。
// 持ち物のタブは 5 つ: 装備 / 消費 / 設置 / その他 / 特別。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Util;

namespace Lumina.Core.Items
{
    public enum InvTab { Equip = 0, Use = 1, Setup = 2, Etc = 3, Special = 4 }

    public enum EquipSlot { None, Cap, FaceAcc, EyeAcc, Earring, Top, Bottom, Overall, Shoes, Gloves, Cape, Shield, Weapon, Ring1, Ring2, Pendant }

    public static class ItemEnums
    {
        public static InvTab ParseTab(string s)
        {
            switch (s)
            {
                case "equip": return InvTab.Equip;
                case "use": return InvTab.Use;
                case "setup": return InvTab.Setup;
                case "special": return InvTab.Special;
                default: return InvTab.Etc;
            }
        }

        public static string TabName(InvTab t)
        {
            switch (t)
            {
                case InvTab.Equip: return "装備";
                case InvTab.Use: return "消費";
                case InvTab.Setup: return "設置";
                case InvTab.Etc: return "その他";
                default: return "特別";
            }
        }

        public static EquipSlot ParseSlot(string s)
        {
            switch (s)
            {
                case "cap": return EquipSlot.Cap;
                case "face": return EquipSlot.FaceAcc;
                case "eye": return EquipSlot.EyeAcc;
                case "earring": return EquipSlot.Earring;
                case "top": return EquipSlot.Top;
                case "bottom": return EquipSlot.Bottom;
                case "overall": return EquipSlot.Overall;
                case "shoes": return EquipSlot.Shoes;
                case "gloves": return EquipSlot.Gloves;
                case "cape": return EquipSlot.Cape;
                case "shield": return EquipSlot.Shield;
                case "weapon": return EquipSlot.Weapon;
                case "ring": return EquipSlot.Ring1;
                case "pendant": return EquipSlot.Pendant;
                default: return EquipSlot.None;
            }
        }

        public static string SlotKey(EquipSlot s)
        {
            switch (s)
            {
                case EquipSlot.Cap: return "cap";
                case EquipSlot.FaceAcc: return "face";
                case EquipSlot.EyeAcc: return "eye";
                case EquipSlot.Earring: return "earring";
                case EquipSlot.Top: return "top";
                case EquipSlot.Bottom: return "bottom";
                case EquipSlot.Overall: return "overall";
                case EquipSlot.Shoes: return "shoes";
                case EquipSlot.Gloves: return "gloves";
                case EquipSlot.Cape: return "cape";
                case EquipSlot.Shield: return "shield";
                case EquipSlot.Weapon: return "weapon";
                case EquipSlot.Ring1: return "ring1";
                case EquipSlot.Ring2: return "ring2";
                case EquipSlot.Pendant: return "pendant";
                default: return "none";
            }
        }

        public static EquipSlot SlotFromKey(string k)
        {
            if (k == "ring1") return EquipSlot.Ring1;
            if (k == "ring2") return EquipSlot.Ring2;
            return ParseSlot(k);
        }
    }

    /// <summary>消費アイテムを使った時の効果</summary>
    public sealed class UseEffect
    {
        public int Hp, Mp;              // 決まった量の回復
        public double HpPct, MpPct;     // 最大の割合（0〜1）で回復
        public StatBlock Buff;          // 一時的な強化（力の薬など）
        public double BuffSec;
        public string ReturnTo;         // 帰還の書: 戻る町のマップ ID（"nearest" = 一番近い町）
        public string ReturnRegion;     // 使える地域（null なら どこでも）
        public List<string> Cure = new List<string>(); // 治す状態異常
    }

    /// <summary>書（スクロール）</summary>
    public sealed class ScrollInfo
    {
        public EquipSlot TargetSlot;    // 防具の書の部位（Overall なら全身）
        public string TargetWeapon;     // 武器の書の種類（片手剣 など）。null なら防具
        public int Rate;                // 成功率 10/30/60/70/100
        public bool Cursed;             // 呪い付き（失敗すると 50% で壊れる）
        public StatBlock Stats = new StatBlock();
    }

    public sealed class ItemDef
    {
        public string Id, Name, Desc;
        public InvTab Tab;
        public int MaxStack = 1;
        public long Price;              // 店の売値（0 = 売っていない）
        public long SellPrice;          // 店に売る時の値段
        public bool Quest;              // クエストの品（捨てられない・売れない）

        // 装備
        public EquipSlot Slot;
        public string Job = "common";   // common / warrior / magician / bowman / thief / pirate
        public int ReqLevel;
        public Stat ReqStat;
        public int ReqValue;
        public StatBlock Stats = new StatBlock();
        public int Upgrades;            // 書を使える回数
        public string WeaponType;       // 武器の種類（片手剣 など）
        public bool TwoHanded;
        public bool AllowsShield;
        public int AttackSpeed;         // 武器の速さの段階（2〜9）
        public bool Cosmetic;           // 見た目だけ（能力なし）

        // 消費・その他
        public UseEffect Use;
        public ScrollInfo Scroll;
        public string AmmoKind;         // 弾・矢・投げ星の種類（arrow_bow / arrow_xbow / star / bullet）
        public int AmmoWatk;

        public bool IsEquip => Tab == InvTab.Equip;
        public bool Stackable => MaxStack > 1;

        public static ItemDef FromDict(Dictionary<string, object> d)
        {
            var it = new ItemDef
            {
                Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Desc = J.Str(d, "desc", ""),
                Tab = ItemEnums.ParseTab(J.Str(d, "tab", "etc")),
                MaxStack = J.Int(d, "maxStack", 1), Price = J.Long(d, "price"), Quest = J.Bool(d, "quest"),
                Slot = ItemEnums.ParseSlot(J.Str(d, "slot", "")), Job = J.Str(d, "job", "common"),
                ReqLevel = J.Int(d, "reqLevel"), ReqValue = J.Int(d, "reqValue"),
                Stats = StatBlock.FromDict(J.Obj(d, "stats")), Upgrades = J.Int(d, "upgrades"),
                WeaponType = J.Str(d, "weaponType"), TwoHanded = J.Bool(d, "twoHanded"), AllowsShield = J.Bool(d, "allowsShield"),
                AttackSpeed = J.Int(d, "attackSpeed"), Cosmetic = J.Bool(d, "cosmetic"),
                AmmoKind = J.Str(d, "ammo"), AmmoWatk = J.Int(d, "ammoWatk"),
            };
            it.SellPrice = J.Has(d, "sellPrice") ? J.Long(d, "sellPrice") : (it.IsEquip ? it.Price / 5 : it.Price / 2);
            switch (J.Str(d, "reqStat", ""))
            {
                case "STR": it.ReqStat = Stat.STR; break;
                case "DEX": it.ReqStat = Stat.DEX; break;
                case "INT": it.ReqStat = Stat.INT; break;
                case "LUK": it.ReqStat = Stat.LUK; break;
                default: it.ReqStat = Stat.None; break;
            }
            if (it.WeaponType != null && it.AttackSpeed == 0) it.AttackSpeed = WeaponClass.Get(it.WeaponType).Speed;
            var u = J.Obj(d, "use");
            if (u != null)
            {
                it.Use = new UseEffect
                {
                    Hp = J.Int(u, "hp"), Mp = J.Int(u, "mp"), HpPct = J.Num(u, "hpPct"), MpPct = J.Num(u, "mpPct"),
                    Buff = J.Has(u, "buff") ? StatBlock.FromDict(J.Obj(u, "buff")) : null, BuffSec = J.Num(u, "buffSec"),
                    ReturnTo = J.Str(u, "returnTo"), ReturnRegion = J.Str(u, "returnRegion"), Cure = J.StrList(u, "cure"),
                };
            }
            var s = J.Obj(d, "scroll");
            if (s != null)
            {
                it.Scroll = new ScrollInfo
                {
                    TargetSlot = ItemEnums.ParseSlot(J.Str(s, "slot", "")), TargetWeapon = J.Str(s, "weapon"),
                    Rate = J.Int(s, "rate"), Cursed = J.Bool(s, "cursed"), Stats = StatBlock.FromDict(J.Obj(s, "stats")),
                };
            }
            return it;
        }
    }
}
