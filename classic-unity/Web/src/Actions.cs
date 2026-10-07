// UI からの操作（窓のボタン・会話の選択肢）→ GameSession の公開の操作（CORE.md 3 章の「UI から呼ぶ操作」）。
// 戻り値は {"ok":bool,"r":"結果の名前","msg":"人が読む文", "dialog":{…}?}
using System;
using System.Globalization;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Items;

namespace Lumina.Web
{
    public static class Actions
    {
        private static string R(bool ok, string r, string msg = null, string dialog = null)
        {
            var s = Ui.Obj(("ok", ok), ("r", r), ("msg", msg));
            if (dialog != null) s = s.Substring(0, s.Length - 1) + ",\"dialog\":" + dialog + "}";
            return s;
        }

        private static string Redialog(GameSession s, string npc) => npc != null ? Ui.Dialog(s, s.Talk(npc)) : null;

        public static string Run(GameSession s, string cmd, string a, string b, int n)
        {
            switch (cmd)
            {
                case "talk":
                {
                    var d = s.Talk(a);
                    return d == null ? R(false, "NoNpc", "近くにいない") : R(true, "Ok", null, Ui.Dialog(s, d));
                }
                case "accept":
                {
                    var r = s.AcceptQuest(a);
                    return R(r == Lumina.Core.Quests.StartResult.Ok, r.ToString(), StartMsg(r), Redialog(s, b));
                }
                case "complete":
                {
                    var r = s.CompleteQuest(a);
                    return R(r == CompleteResult.Ok, r.ToString(), r == CompleteResult.Ok ? "クエスト完了" : r == CompleteResult.InventoryFull ? "持ち物がいっぱい" : "まだ終わっていない", Redialog(s, b));
                }
                case "buy":
                {
                    var r = s.Buy(a, b, Math.Max(1, n));
                    return R(r == ShopResult.Ok, r.ToString(), ShopMsg(r));
                }
                case "sell":
                {
                    var r = s.Sell((InvTab)int.Parse(a, CultureInfo.InvariantCulture), n, b != null && int.TryParse(b, out var cnt) ? cnt : int.MaxValue);
                    return R(r == ShopResult.Ok, r.ToString(), ShopMsg(r));
                }
                case "recharge":
                {
                    var r = s.Recharge(a, n);
                    return R(r == ShopResult.Ok, r.ToString(), ShopMsg(r));
                }
                case "inn": { bool ok = s.RestAtInn(a); return R(ok, ok ? "Ok" : "No", ok ? "ぐっすり休んだ" : "お金が足りない"); }
                case "travel": { bool ok = s.Travel(a, b == "ticket"); return R(ok, ok ? "Ok" : "No"); }
                case "taxi": { var r = s.TaxiTo(a, b); return R(r == TaxiResult.Ok, r.ToString(), r == TaxiResult.NotEnoughMeso ? "お金が足りない" : null); }
                case "use": { bool ok = s.UseItem(a); return R(ok, ok ? "Ok" : "No", ok ? null : "今は使えない"); }
                case "equip": { var r = s.EquipFromInventory(n); return R(r == EquipResult.Ok, r.ToString(), EquipMsg(r)); }
                case "unequip": { var r = s.Unequip(ItemEnums.SlotFromKey(a)); return R(r == EquipResult.Ok, r.ToString(), EquipMsg(r)); }
                case "scrollEquipped": { var r = s.ApplyScrollToEquipped(a, ItemEnums.SlotFromKey(b)); return R(r == ScrollResult.Success, r.ToString()); }
                case "scrollInv": { var r = s.ApplyScrollToInventory(a, n); return R(r == ScrollResult.Success, r.ToString()); }
                case "ap":
                {
                    bool ok = a == "hp" ? s.SpendApHp() : a == "mp" ? s.SpendApMp()
                        : Enum.TryParse<Stat>(a, true, out var st) && st != Stat.None && s.SpendAp(st);
                    return R(ok, ok ? "Ok" : "No", ok ? null : "AP が無い");
                }
                case "learn": { var r = s.LearnSkill(a); return R(r == Lumina.Core.Skills.LearnResult.Ok, r.ToString(), LearnMsg(r)); }
                case "skill": { var r = s.UseSkill(a); return R(r == SkillUseResult.Ok, r.ToString()); }
                case "quick":
                {
                    if (string.IsNullOrEmpty(b)) s.SetQuickSlot(n, null, null);
                    else s.SetQuickSlot(n, a, b);
                    return R(true, "Ok");
                }
                case "advance1":
                {
                    var r = s.AdvanceJob(a, b);
                    return R(r == Lumina.Core.Character.AdvanceResult.Ok, r.ToString(), AdvMsg(r), Redialog(s, b));
                }
                case "advance2":
                {
                    var r = s.AdvanceJob2(n);
                    return R(r == Lumina.Core.Character.AdvanceResult.Ok, r.ToString(), AdvMsg(r), Redialog(s, b));
                }
                case "revive": { long lost = s.Revive(); return R(true, "Ok", lost > 0 ? "経験値を " + lost + " 失った" : null); }
                case "save": { var r = s.SaveNow(string.IsNullOrEmpty(a) ? "manual" : a); return R(r.Ok, r.Ok ? "Ok" : "Failed", r.ToString()); }
                case "quiz": { bool ok = s.AnswerQuiz(n); return R(ok, ok ? "Correct" : "Wrong"); }
                case "storeIn": { var r = s.StorageDeposit(a, (InvTab)int.Parse(b, CultureInfo.InvariantCulture), n); return R(r == StorageResult.Ok, r.ToString(), StorageMsg(r)); }
                case "storeOut": { var r = s.StorageWithdraw(a, n); return R(r == StorageResult.Ok, r.ToString(), StorageMsg(r)); }
                case "storeMesoIn": { var r = s.StorageDepositMeso(a, n); return R(r == StorageResult.Ok, r.ToString(), StorageMsg(r)); }
                case "storeMesoOut": { var r = s.StorageWithdrawMeso(a, n); return R(r == StorageResult.Ok, r.ToString(), StorageMsg(r)); }
                case "storeExpand": { var r = s.StorageExpand(a); return R(r == StorageResult.Ok, r.ToString(), StorageMsg(r)); }
                case "craft": { var r = s.Craft(a, b); return R(r == CraftResult.Ok, r.ToString()); }
                case "petFeed": { bool ok = s.FeedPet(n); return R(ok, ok ? "Ok" : "No"); }
                case "petOut": { bool ok = s.SetPetOut(n, a == "1"); return R(ok, ok ? "Ok" : "No"); }
                case "masterBook": { var r = s.UseMasterBook(a, b); return R(r == MasterBookResult.Ok, r.ToString()); }
                case "stand": s.StandUp(); return R(true, "Ok");
                // ---- 確かめ用（自動のテストが使う。ふつうの遊びでは呼ばない）
                case "dbgExp": s.GainExp(n); return R(true, "Ok");
                case "dbgWarp": s.ChangeMap(a, string.IsNullOrEmpty(b) ? null : b); return R(true, "Ok");
                case "dbgPos": s.Teleport(n, double.Parse(a, CultureInfo.InvariantCulture)); return R(true, "Ok");
                case "dbgMeso": s.Inventory.AddMeso(n); return R(true, "Ok");
                case "dbgItem": { int rest = s.Inventory.Add(a, Math.Max(1, n)); return R(rest == 0, "Ok"); }
                default: return R(false, "Unknown", "知らない操作: " + cmd);
            }
        }

        private static string StartMsg(Lumina.Core.Quests.StartResult r)
        {
            switch (r)
            {
                case Lumina.Core.Quests.StartResult.Ok: return "クエストを受けた";
                case Lumina.Core.Quests.StartResult.LevelTooLow: return "Lv が足りない";
                case Lumina.Core.Quests.StartResult.PrereqMissing: return "先にやるクエストがある";
                case Lumina.Core.Quests.StartResult.StatTooLow: return "能力値が足りない";
                case Lumina.Core.Quests.StartResult.WrongJob: return "この職では受けられない";
                case Lumina.Core.Quests.StartResult.NotToday: return "今日は受けられない";
                case Lumina.Core.Quests.StartResult.AlreadyCompleted: return "もう終えている";
                default: return r.ToString();
            }
        }

        private static string ShopMsg(ShopResult r)
        {
            switch (r)
            {
                case ShopResult.Ok: return null;
                case ShopResult.NotEnoughMeso: return "お金が足りない";
                case ShopResult.InventoryFull: return "持ち物がいっぱい";
                case ShopResult.CannotSell: return "売れない品";
                case ShopResult.NoShopHere: return "店が近くにない";
                default: return r.ToString();
            }
        }

        private static string EquipMsg(EquipResult r)
        {
            switch (r)
            {
                case EquipResult.Ok: return null;
                case EquipResult.WrongJob: return "この職では装備できない";
                case EquipResult.LevelTooLow: return "Lv が足りない";
                case EquipResult.StatTooLow: return "能力値が足りない";
                case EquipResult.InventoryFull: return "持ち物がいっぱい";
                default: return r.ToString();
            }
        }

        private static string LearnMsg(Lumina.Core.Skills.LearnResult r)
        {
            switch (r)
            {
                case Lumina.Core.Skills.LearnResult.Ok: return null;
                case Lumina.Core.Skills.LearnResult.NoSp: return "SP が無い";
                case Lumina.Core.Skills.LearnResult.PrereqMissing: return "前提のスキルが足りない";
                case Lumina.Core.Skills.LearnResult.MaxLevel: return "もう最大";
                case Lumina.Core.Skills.LearnResult.TierTooLow: return "転職するまで覚えられない";
                default: return r.ToString();
            }
        }

        private static string AdvMsg(Lumina.Core.Character.AdvanceResult r)
        {
            switch (r)
            {
                case Lumina.Core.Character.AdvanceResult.Ok: return "転職した！";
                case Lumina.Core.Character.AdvanceResult.LevelTooLow: return "Lv が足りない";
                case Lumina.Core.Character.AdvanceResult.StatTooLow: return "能力値（2 次は試験の証）が足りない";
                case Lumina.Core.Character.AdvanceResult.WrongNpc: return "この転職官の系統ではない";
                case Lumina.Core.Character.AdvanceResult.AlreadyAdvanced: return "もう転職している";
                default: return r.ToString();
            }
        }

        private static string StorageMsg(StorageResult r) => r == StorageResult.Ok ? null : r == StorageResult.NotEnoughMeso ? "お金が足りない" : r.ToString();
    }
}
