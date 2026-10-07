// 町の用事と育て方: AP/SP を振る・装備を着る・書を使う・バフをかける・薬と弾と装備を買う・いらない物を売る。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Skills;
using Lumina.Core.World;

namespace Lumina.PlayBot
{
    public sealed partial class Bot
    {
        // ---------------- 系統ごとの育て方

        public Stat MainStat => Line switch { "warrior" => Stat.STR, "magician" => Stat.INT, "bowman" => Stat.DEX, "thief" => Stat.LUK, _ => Stat.STR };
        public Stat SubStat => Line switch { "warrior" => Stat.DEX, "magician" => Stat.LUK, "bowman" => Stat.STR, "thief" => Stat.DEX, _ => Stat.DEX };

        /// <summary>使う武器の種類（買う・着る時に選ぶ）。</summary>
        public string[] WeaponTypes => Line switch
        {
            "warrior" => new[] { "片手剣", "両手剣" },
            "magician" => new[] { "ワンド", "スタッフ" },
            "bowman" => new[] { "弓" },
            "thief" => new[] { "クロー" },
            _ => new[] { "ナックル" },
        };

        /// <summary>着てよい武器の種類。初心者は木の剣（片手剣）か、その系統で初心者でも使える物（魔法使いの杖・盗賊の短剣）。</summary>
        public bool AllowedWeapon(string type)
        {
            if (S.Character.Tier > 0) return WeaponTypes.Contains(type);
            if (type == "片手剣") return true;
            return Line == "magician" && type == "スタッフ" || Line == "thief" && type == "短剣";
        }

        /// <summary>薬のために残しておくお金（Lv に合う薬 40 個分）。</summary>
        public long PotionReserve()
        {
            int lv = Level;
            long unit = lv < 15 ? 50 : lv < 35 ? 160 : lv < 70 ? 320 : lv < 110 ? 1000 : 2200;
            return unit * (lv < 10 ? 15 : 40) + (Line == "magician" ? (lv < 30 ? 200 : 620) * 30 : 0);
        }

        /// <summary>この装備に使ってよいお金（薬のお金を残す。職の武器が無い時は全部）。</summary>
        private double Spendable(ItemDef def)
        {
            if (NeedWeapon && def.Slot == EquipSlot.Weapon && WeaponTypes.Contains(def.WeaponType)) return S.Inventory.Meso;
            // 薬を買った後に残っているお金のうち、次の薬代（PotionReserve の半分）を残した分
            double spendable = Math.Max(0, S.Inventory.Meso - PotionReserve() / 2);
            return spendable * (def.Slot == EquipSlot.Weapon ? 0.8 : 0.5);
        }

        public string AmmoKind => Line switch { "bowman" => "arrow_bow", "thief" => "star", _ => null };

        /// <summary>AP を命中（DEX）にも振る（MISS を見て人が振るのと同じ）。false なら決めた副の能力値だけ。</summary>
        public static bool AccuracyAp = true;

        /// <summary>その Lv のふつうの敵に必ず当たる命中（STATS.md 2-3: 必要な命中 = 55 × 敵の回避 ÷ 15。敵の回避はデータの平均）。</summary>
        public double AccNeeded(int mobLv)
        {
            var near = D.Mobs.Values.Where(m => m.Kind == "normal" && Math.Abs(m.Lv - mobLv) <= 3).ToList();
            double avoid = near.Count > 0 ? near.Average(m => m.Avoid) : mobLv * 0.5;
            return 55 * avoid / 15;
        }

        private int SubTarget()
        {
            int lv = Level;
            switch (Line)
            {
                case "thief": return Math.Max(25, 25 + (lv - 10) / 2);
                case "pirate": return Math.Max(20, 20 + (lv - 10) / 3);
                case "magician": return 4 + lv / 4;
                default: return 4 + lv / 3;
            }
        }

        public void AllocateAp()
        {
            var c = S.Character;
            for (int guard = 0; guard < 400 && c.Ap > 0; guard++)
            {
                Stat s;
                if (c.Tier == 0)
                {
                    var j = Jobs.Get(Line);
                    if (c.GetStat(j.AdvStat) < j.AdvValue) s = j.AdvStat;
                    else if (Line == "pirate" && c.Dex < 20) s = Stat.DEX;
                    else s = MainStat;
                }
                else if (AccuracyAp && Line != "magician" && SubStat == Stat.DEX && S.Stats.Acc < AccNeeded(Level - 2) * 0.95 && c.Dex < Level * 2) s = Stat.DEX; // MISS が多い: 命中のために DEX
                else s = c.GetStat(SubStat) < SubTarget() ? SubStat : MainStat;
                if (!S.SpendAp(s)) break;
            }
        }

        private double SpPriority(SkillDef s)
        {
            string wt = S.Stats.WeaponType;
            bool weaponOk = s.Weapons == null || s.Weapons.Contains(wt) || WeaponTypes.Any(w => s.Weapons.Contains(w));
            int cur = S.Skills.Level(s.Id);
            double p;
            if (!weaponOk) p = 1;
            else if (s.IsAttack && s.DealsDamage && s.Fixed == null && s.ComboUse == 0 && s.NeedsBuff == null && !s.NeedsCharge && s.SelfDamagePct <= 0) p = s.Kind == SkillKind.Area ? 105 : 100;
            else if (s.Kind == SkillKind.Passive && s.Passives.Any(pe => pe.Mastery != null && (pe.Weapons == null || pe.Weapons.Contains(wt) || WeaponTypes.Any(w => pe.Weapons.Contains(w))))) p = 95;
            else if (s.Kind == SkillKind.Buff && s.Buff != null && s.Buff.BoosterStages > 0) p = 85;
            else if (s.Kind == SkillKind.Buff && s.Buff != null && s.Buff.MagicGuard != null) p = 92; // 魔力の盾（打たれ弱い魔法使いの命綱）
            else if (s.Kind == SkillKind.Passive) p = 50;
            else if (s.Kind == SkillKind.Buff && UsefulBuff(s)) p = 45;
            else if (s.Kind == SkillKind.Heal) p = 30;
            else p = 10;
            if (cur > 0) p += 3; // 振り始めた物を先に上げきる
            if (s.Tier < S.Character.Tier) p -= 20; // 前の段階の SP は前の段階のスキルにしか使えない（財布）。念のため
            return p;
        }

        /// <summary>このスキルを上げると覚えられるようになる強いスキルの価値（前提の Lv に届くまで）。二つ星投げの前の身軽さ・鋭い目など。</summary>
        private double UnlockPriority(SkillDef pre, int depth)
        {
            if (depth > 3) return 0;
            double best = 0;
            int cur = S.Skills.Level(pre.Id);
            foreach (var s in D.SkillList)
            {
                if (s.Prereqs.Count == 0 || S.Skills.Level(s.Id) > 0) continue;
                var need = s.Prereqs.Find(q => q.Skill == pre.Id);
                if (need == null || cur >= need.Level) continue;
                if (!SkillBookJobOk(s)) continue;
                double p = Math.Max(SpPriority(s), UnlockPriority(s, depth + 1)) - 2;
                if (p > best) best = p;
            }
            return best;
        }

        private bool SkillBookJobOk(SkillDef s)
        {
            var r = S.Skills.CanLearn(s.Id, S.Character);
            return r == LearnResult.Ok || r == LearnResult.PrereqMissing;
        }

        public void AllocateSp()
        {
            var c = S.Character;
            // 初心者: S-09（SP を 1 振る）を受けるまで 1 つ残す
            bool keepOne = c.Tier == 0 && !S.Quests.IsCompleted("S-09") && S.Quests.Status("S-09") != QuestStatus.InProgress;
            for (int guard = 0; guard < 300; guard++)
            {
                int total = c.Sp.Sum();
                if (total <= (keepOne ? 1 : 0)) break;
                SkillDef best = null; double bp = double.NegativeInfinity;
                foreach (var s in D.SkillList)
                {
                    if (S.Skills.CanLearn(s.Id, c) != LearnResult.Ok) continue;
                    double p = Math.Max(SpPriority(s), UnlockPriority(s, 0));
                    if (p > bp) { bp = p; best = s; }
                }
                if (best == null) break;
                if (S.LearnSkill(best.Id) != LearnResult.Ok) break;
            }
        }

        // ---------------- 装備

        public double EquipScore(ItemDef def, StatBlock st)
        {
            if (def == null || st == null) return -1;
            if (def.Cosmetic) return 0;
            double score = 0;
            bool mage = Line == "magician";
            if (def.Slot == EquipSlot.Weapon)
            {
                if (!AllowedWeapon(def.WeaponType)) return -1;
                score += mage ? st.Matk * 4 + st.Watk * 0.2 : st.Watk * 4;
                if (def.TwoHanded) score *= 1.1;
                score += -def.AttackSpeed * 2;
            }
            else
            {
                score += st.Wdef + st.Mdef * 0.5 + st.Hp / 4.0 + st.Mp / 8.0 + st.Acc + st.Avoid + st.Speed * 2 + st.Jump;
                score += (mage ? st.Matk : st.Watk) * 4;
            }
            score += GetStat(st, MainStat) * 5 + GetStat(st, SubStat) * 2;
            return score;
        }

        private static int GetStat(StatBlock b, Stat s) => s switch { Stat.STR => b.Str, Stat.DEX => b.Dex, Stat.INT => b.Int, Stat.LUK => b.Luk, _ => 0 };

        private ItemInstance Worn(ItemDef def)
        {
            var slot = def.Slot;
            if (slot == EquipSlot.Ring1 || slot == EquipSlot.Ring2) return S.Equipment.Get(EquipSlot.Ring1) == null ? null : S.Equipment.Get(EquipSlot.Ring2);
            return S.Equipment.Get(slot);
        }

        private double WornScore(ItemDef def)
        {
            if (def.Slot == EquipSlot.Shield)
            {
                var w = S.Equipment.WeaponDef;
                if (w != null && (w.TwoHanded || !w.AllowsShield)) return double.PositiveInfinity; // 両手武器なら盾は着ない
            }
            if (def.Slot == EquipSlot.Weapon && (def.TwoHanded || !def.AllowsShield))
                return Score(S.Equipment.Get(EquipSlot.Weapon)) + Score(S.Equipment.Get(EquipSlot.Shield)); // 盾が外れる分も
            if (def.Slot == EquipSlot.Overall) return Score(S.Equipment.Get(EquipSlot.Top)) + Score(S.Equipment.Get(EquipSlot.Bottom)) + Score(S.Equipment.Get(EquipSlot.Overall));
            if (def.Slot == EquipSlot.Top || def.Slot == EquipSlot.Bottom)
            {
                var ov = S.Equipment.Get(EquipSlot.Overall);
                if (ov != null) return Score(ov) / 2;
            }
            return Score(Worn(def));
        }

        private double Score(ItemInstance it) => it == null ? 0 : Math.Max(0, EquipScore(D.Item(it.ItemId), it.Stats));

        private bool CanWear(ItemDef def)
        {
            if (def == null || !def.IsEquip || def.Cosmetic) return false;
            return S.Equipment.CheckRequirements(def, S.Character, S.Equipment.TotalStats()) == EquipResult.Ok;
        }

        /// <summary>持ち物の装備で、今より良い物を着る。</summary>
        /// <summary>売れる物の値段の合計（その他・いらない装備）。</summary>
        public long SellableValue()
        {
            long v = 0;
            foreach (var (tab, slot, it) in S.Inventory.All())
            {
                var def = D.Item(it.ItemId);
                if (def == null || def.Quest || QuestWants(it.ItemId)) continue;
                if (tab == InvTab.Etc) v += def.SellPrice * it.Count;
            }
            return v;
        }

        public void WearBest()
        {
            // 弾・投げ星が無くて職の武器で攻撃できない時は、持っている「弾の要らない武器」に持ち替える（木の剣など）
            if (S.Stats.NeedsAmmo && S.Stats.AmmoItem == null && !S.Stats.Mods.NoAmmo && S.Stats.WeaponType != "弓" && S.Stats.WeaponType != "クロスボウ")
            {
                for (int i = 0; i < S.Inventory.SlotCount(InvTab.Equip); i++)
                {
                    var it = S.Inventory.Get(InvTab.Equip, i);
                    var def = it != null ? D.Item(it.ItemId) : null;
                    if (def == null || def.Slot != EquipSlot.Weapon || !CanWear(def)) continue;
                    if (RangedReach(def.WeaponType) > 0 && def.WeaponType != "弓") continue;
                    if (S.EquipFromInventory(i) == EquipResult.Ok) { Note("ammo", Line, "弾が無いので " + def.Name + " に持ち替えた（Lv" + Level + "）"); return; }
                }
            }
            for (int pass = 0; pass < 3; pass++)
            {
                bool changed = false;
                for (int i = 0; i < S.Inventory.SlotCount(InvTab.Equip); i++)
                {
                    var it = S.Inventory.Get(InvTab.Equip, i);
                    if (it == null) continue;
                    var def = D.Item(it.ItemId);
                    if (!CanWear(def)) continue;
                    if (def.Slot == EquipSlot.Weapon && AmmoKind != null && WeaponTypes.Contains(def.WeaponType) && def.WeaponType != "弓" && AmmoCount() == 0 && !S.Stats.Mods.NoAmmo) continue; // 投げ星が無いクローは持たない
                    if (EquipScore(def, it.Stats) > WornScore(def) + 0.5)
                    {
                        if (S.EquipFromInventory(i) == EquipResult.Ok) changed = true;
                    }
                }
                if (!changed) break;
            }
        }

        /// <summary>着ている装備に書を使う（60% 以上・呪いでない物）。</summary>
        public void UseScrolls()
        {
            var list = S.Inventory.All().Where(t => t.tab == InvTab.Use && D.Item(t.item.ItemId)?.Scroll != null).Select(t => t.item.ItemId).Distinct().ToList();
            foreach (var id in list)
            {
                var sc = D.Item(id).Scroll;
                if (sc.Cursed || sc.Rate < 60) continue;
                foreach (var kv in S.Equipment.All.ToList())
                {
                    var def = D.Item(kv.Value.ItemId);
                    if (def == null || kv.Value.UpgradesLeft <= 0) continue;
                    bool match = sc.TargetWeapon != null ? def.WeaponType == sc.TargetWeapon : (def.Slot == sc.TargetSlot);
                    if (!match) continue;
                    while (S.Inventory.Has(id) && kv.Value.UpgradesLeft > 0)
                        if (S.ApplyScrollToEquipped(id, kv.Key) == ScrollResult.WrongTarget) break;
                }
            }
        }

        // ---------------- バフ

        private bool UsefulBuff(SkillDef s)
        {
            var b = s.Buff;
            if (b == null || s.Kind != SkillKind.Buff) return false;
            if (b.Stealth || b.Transform || b.Ship || b.Invincible || b.Charge || s.Door || b.MesoGuardPct != null || b.HpDrain != null) return false;
            if (s.NeedsBuff != null || s.NeedsEnergy || s.ComboUse != 0 || s.Cure || s.CdReset) return false;
            return b.BoosterStages > 0 || b.Stats.Count > 0 || b.MagicGuard != null || b.HpPct != null || b.ComboMax > 0 || b.ComboDamage != null
                || b.StatPct != null || b.CritRate != null || b.ShadowPartner != null || b.NoAmmo || b.MpCostPct != null || b.DamagePct != null || b.DamageReduce != null;
        }

        private double nextBuffCheck;

        public void CastBuffs()
        {
            if (Sec < nextBuffCheck || !S.Body.OnGround || S.Attack != null) return;
            nextBuffCheck = Sec + 3;
            foreach (var (def, x) in S.Skills.Learned().ToList())
            {
                if (!UsefulBuff(def) || S.Buffs.Has(def.Id)) continue;
                if (def.Buff.Weapons != null && !def.Buff.Weapons.Contains(S.Stats.WeaponType)) continue;
                if (!def.WeaponAllowed(S.Stats.WeaponType)) continue;
                int mp = S.SkillMpCost(def, x);
                if (S.Character.Mp < mp + S.Stats.MaxMp * 0.25) continue;
                Frame(new PlayerInput { SkillPressed = def.Id });
                for (int i = 0; i < 60 && S.Attack != null; i++) Frame(new PlayerInput());
            }
        }

        /// <summary>Lv アップ・転職の後: AP・SP・装備・書。</summary>
        public void Upkeep()
        {
            if (S.Character.Ap > 0) AllocateAp();
            if (S.Character.Sp.Sum() > 0) AllocateSp();
            if (Sec >= nextWear) { WearBest(); UseScrolls(); nextWear = Sec + 60; }
        }
        private double nextWear;

        // ---------------- 町へ行く用事

        private Dictionary<string, (string map, string npc)> shopLoc;
        public Dictionary<string, (string map, string npc)> ShopLoc
        {
            get
            {
                if (shopLoc != null) return shopLoc;
                shopLoc = new Dictionary<string, (string, string)>();
                foreach (var id in D.MapIds)
                    foreach (var n in D.GetMap(id).Npcs)
                        if (n.Shop != null && !shopLoc.ContainsKey(n.Shop)) shopLoc[n.Shop] = (id, n.Id);
                return shopLoc;
            }
        }

        private int CountPotions(bool hp)
        {
            int n = 0;
            foreach (var (tab, slot, it) in S.Inventory.All())
            {
                var u = D.Item(it.ItemId)?.Use;
                if (u == null || u.ReturnTo != null || u.Buff != null) continue;
                int amt = hp ? u.Hp + (int)(u.HpPct * S.Stats.MaxHp) : u.Mp + (int)(u.MpPct * S.Stats.MaxMp);
                if (amt > 0) n += it.Count;
            }
            return n;
        }

        private int AmmoCount() => AmmoKind == null ? int.MaxValue : S.Inventory.All().Where(t => D.Item(t.item.ItemId)?.AmmoKind == AmmoKind).Sum(t => t.item.Count);

        public bool UsesMpPotions => Line == "magician" || S.Character.Tier >= 1;
        private double lastTownSec = -1e9;
        private long lastEquipCheckMeso;

        internal double townCooldownUntil;
        private double lastEquipTripSec = -1e9;

        private bool HasJobWeapon => WeaponTypes.Contains(S.Stats.WeaponType) || S.Inventory.All().Any(t => t.tab == InvTab.Equip && WeaponTypes.Contains(D.Item(t.item.ItemId)?.WeaponType) && CanWear(D.Item(t.item.ItemId)));
        private bool NeedWeapon => S.Character.Tier >= 1 && !HasJobWeapon;
        private bool NeedAmmo => AmmoKind != null && S.Character.Tier >= 1 && HasJobWeapon && AmmoCount() < 200;
        private bool WantEquipCheck => Sec - lastEquipTripSec > 2400 && S.Inventory.Meso > Math.Max(3000, lastEquipCheckMeso * 1.8);

        public bool NeedTown()
        {
            if (S.Map.Data.Region == "S" && !S.Flags.ContainsKey("leftIsland") && Level < 3) return false; // 島の最初はお金が無い
            bool full = inventoryFullSeen || new[] { InvTab.Equip, InvTab.Use, InvTab.Etc }.Any(t => S.Inventory.FreeSlots(t) <= 1);
            if (Sec < townCooldownUntil) return false;
            long meso = S.Inventory.Meso;
            if (full) return true;
            if (CountPotions(true) < 8 && (meso >= 300 || SellableValue() >= 300)) return true;
            if (cannotAttack) return true;
            if (Line == "magician" && CountPotions(false) < 8 && meso >= 600) return true;
            if (NeedAmmo && meso >= 800) return true;
            if (NeedWeapon && meso >= 1500) return true;
            if (WantEquipCheck) return true;
            return false;
        }

        /// <summary>品が要るかどうか（拾う・売らない）。</summary>
        public bool WantItem(string itemId)
        {
            var def = D.Item(itemId);
            if (def == null) return false;
            if (def.Quest) return true;
            if (QuestWants(itemId)) return true;
            if (def.Tab == InvTab.Use) return true;
            if (def.IsEquip) return true;
            if (def.Tab == InvTab.Etc) return true; // 売るとお金になる
            return true;
        }

        private HashSet<string> questItemCache; private int questItemCacheAt = -1;

        /// <summary>まだ終わっていないクエストの集める物・クイズの品・製作の材料。</summary>
        public bool QuestWants(string itemId)
        {
            if (questItemCacheAt != S.Quests.Entries.Count + Level * 1000)
            {
                questItemCache = new HashSet<string>();
                foreach (var q in D.QuestList)
                {
                    if (S.Quests.IsCompleted(q.Id)) continue;
                    if (q.Line != null && q.Line != Line) continue;
                    foreach (var o in q.Objectives) if (o.Type == ObjectiveType.Collect) questItemCache.Add(o.Target);
                }
                foreach (var it in D.Systems.Jobs.QuizNeedItems) questItemCache.Add(it);
                var dc = D.Systems.Crafts.Find(c => c.Id == "craft.dark_crystal");
                if (dc != null) foreach (var x in dc.In) questItemCache.Add(x.Item);
                questItemCacheAt = S.Quests.Entries.Count + Level * 1000;
            }
            return questItemCache.Contains(itemId);
        }

        /// <summary>町の用事: 売る → 薬・弾 → 装備。一番近い薬屋のある町へ行く。</summary>
        public void DoTown() => Timed("town", () => { DoTownInner(); return 0; });

        private void DoTownInner()
        {
            cannotAttack = false;
            lastTownSec = Sec;
            inventoryFullSeen = false;
            var stops = new List<string>();
            // 先に一番近い薬屋（薬が無いまま遠くの店へ行く途中で倒れ続けないように）
            var pm = NearestShopMap(e => IsHpPotion(e.Item));
            if (pm == null) Note("town", MapId, MapId + " から行ける薬屋が無い");
            else stops.Add(pm);
            if (NeedWeapon || WantEquipCheck)
            {
                lastEquipTripSec = Sec;
                var m = BestEquipShopMap();
                if (m != null) stops.Add(m);
            }
            if (NeedAmmo)
            {
                var m = NearestShopMap(e => D.Item(e.Item)?.AmmoKind == AmmoKind);
                if (m != null && !stops.Contains(m)) stops.Add(m);
            }
            foreach (var m in stops)
            {
                if (!GoToMap(m)) continue;
                ShopHere();
            }
            // 用事が済まない（お金が足りない・売っていない）時は、しばらく町へ行かない
            if (NeedTown()) townCooldownUntil = Sec + 900;
            if (NeedWeapon) Note("weapon", Line + ":" + Level / 10, "Lv" + Level + " で職の武器（" + string.Join("/", WeaponTypes) + "）を買えない（お金 " + S.Inventory.Meso + "）");
        }

        /// <summary>行ける店のうち、この品を売っている一番近い所。</summary>
        private string NearestShopMap(Func<ShopEntry, bool> sells)
        {
            string best = null; double bc = double.PositiveInfinity;
            foreach (var kv in ShopLoc)
            {
                if (!ShopItems(kv.Key).Any(sells)) continue;
                double c = RouteCost(kv.Value.map);
                if (c < bc) { bc = c; best = kv.Value.map; }
            }
            return best;
        }

        /// <summary>装備を買うのに一番いい町（良くなる分 ÷ 道の長さ）。</summary>
        private string BestEquipShopMap()
        {
            string best = null; double bs = 0;
            var costs = new Dictionary<string, double>();
            foreach (var kv in ShopLoc)
            {
                double gain = 0;
                foreach (var e in ShopItems(kv.Key))
                {
                    var def = D.Item(e.Item);
                    if (def == null || !def.IsEquip || def.Cosmetic || !CanWear(def)) continue;
                    if (e.Price > Spendable(def)) continue;
                    double g = EquipScore(def, def.Stats) - WornScore(def);
                    if (def.Slot == EquipSlot.Weapon && NeedWeapon && WeaponTypes.Contains(def.WeaponType)) g += 1000;
                    if (g > 0) gain += g;
                }
                if (gain < 6) continue;
                if (!costs.TryGetValue(kv.Value.map, out var c)) costs[kv.Value.map] = c = RouteCost(kv.Value.map);
                if (double.IsInfinity(c)) continue;
                double score = gain / (1 + c * 0.15);
                if (score > bs) { bs = score; best = kv.Value.map; }
            }
            return best;
        }

        // 店の品（日替わりの店は日ごと）。同じ日のうちは覚えておく（考えるたびに作ると遅い）
        private readonly Dictionary<string, List<ShopEntry>> shopItemsCache = new Dictionary<string, List<ShopEntry>>();
        private int shopItemsDay = -1;
        private Dictionary<string, List<string>> itemShops;

        public List<ShopEntry> ShopItems(string shopId)
        {
            int day = Lumina.Core.Town.DailyLog.DayNumber(S.Clock());
            if (day != shopItemsDay) { shopItemsCache.Clear(); itemShops = null; shopItemsDay = day; }
            if (!shopItemsCache.TryGetValue(shopId, out var l)) shopItemsCache[shopId] = l = S.ShopItems(shopId);
            return l;
        }

        /// <summary>この品を今日売っている店。</summary>
        public List<string> ShopsSelling(string itemId)
        {
            ShopItems(ShopLoc.Keys.First());
            if (itemShops == null)
            {
                itemShops = new Dictionary<string, List<string>>();
                foreach (var k in ShopLoc.Keys)
                    foreach (var e in ShopItems(k))
                    {
                        if (!itemShops.TryGetValue(e.Item, out var l)) itemShops[e.Item] = l = new List<string>();
                        l.Add(k);
                    }
            }
            return itemShops.TryGetValue(itemId, out var r) ? r : new List<string>();
        }

        private bool IsHpPotion(string id) { var u = D.Item(id)?.Use; return u != null && u.Hp > 0 && u.Buff == null; }
        private bool IsMpPotion(string id) { var u = D.Item(id)?.Use; return u != null && u.Mp > 0 && u.Buff == null && u.Hp == 0; }

        /// <summary>職の町（武器屋のある町）。</summary>
        public string JobTown() => Line switch { "warrior" => "V400", "magician" => "V300", "bowman" => "V200", "thief" => "V500", "pirate" => "V100", _ => null };

        /// <summary>今のマップの店で、売る・買う。</summary>
        public void ShopHere()
        {
            var shops = S.Map.Data.Npcs.Where(n => n.Shop != null).ToList();
            if (shops.Count == 0) return;
            MoveNearNpc(shops[0]);
            SellJunk();
            // 先に薬と弾（足りないと倒れ続ける）。職の武器が無い時だけ武器が先
            if (NeedWeapon) foreach (var n in shops) BuyEquipFrom(n);
            foreach (var n in shops) BuyConsumablesFrom(n);
            foreach (var n in shops) BuyEquipFrom(n);
            WearBest();
            SellJunk();
            lastEquipCheckMeso = Math.Max(1000, S.Inventory.Meso);
        }

        private void SellJunk()
        {
            var list = S.Inventory.All().ToList();
            foreach (var (tab, slot, it) in list)
            {
                var def = D.Item(it.ItemId);
                if (def == null || def.Quest || QuestWants(it.ItemId)) continue;
                bool sell = false;
                if (tab == InvTab.Etc) sell = def.SellPrice > 0;
                else if (tab == InvTab.Equip)
                {
                    if (def.Cosmetic || def.Id == "eq.starter.9") continue; // 木の剣は予備の武器（弾が切れた時）
                    double sc = EquipScore(def, it.Stats);
                    sell = sc <= WornScore(def) || !Equipment.JobAllows(def, S.Character) && S.Character.Tier > 0;
                    if (def.ReqLevel > Level && Equipment.JobAllows(def, S.Character) && sc > WornScore(def)) sell = false; // 後で着る
                }
                else if (tab == InvTab.Use)
                {
                    if (def.Scroll != null) sell = def.Scroll.Cursed || def.Scroll.Rate < 60 || !ScrollFitsWorn(def.Scroll);
                    else if (def.AmmoKind != null) sell = def.AmmoKind != AmmoKind;
                }
                if (!sell) continue;
                long before = S.Inventory.Meso;
                S.Sell(tab, slot, it.Count);
            }
        }

        private bool ScrollFitsWorn(ScrollInfo sc)
        {
            foreach (var kv in S.Equipment.All)
            {
                var def = D.Item(kv.Value.ItemId);
                if (def == null) continue;
                if (sc.TargetWeapon != null ? def.WeaponType == sc.TargetWeapon : def.Slot == sc.TargetSlot) return true;
            }
            return false;
        }

        private void BuyEquipFrom(NpcData n)
        {
            var items = ShopItems(n.Shop).ToList();
            // 部位ごとに、買える一番良い物
            var bySlot = new Dictionary<EquipSlot, (ShopEntry e, double gain)>();
            foreach (var e in items)
            {
                var def = D.Item(e.Item);
                if (def == null || !def.IsEquip || def.Cosmetic) continue;
                if (!CanWear(def)) continue;
                double gain = EquipScore(def, def.Stats) - WornScore(def);
                if (gain <= 1) continue;
                if (e.Price > Spendable(def)) continue;
                if (def.Slot == EquipSlot.Weapon && AmmoKind != null && AmmoCount() < 100 && e.Price + 1000 > S.Inventory.Meso) continue; // 弾も買えないと撃てない
                var slot = def.Slot == EquipSlot.Ring2 ? EquipSlot.Ring1 : def.Slot;
                if (!bySlot.TryGetValue(slot, out var cur) || gain / Math.Max(1, e.Price) * 1000 + gain > cur.gain / Math.Max(1, cur.e.Price) * 1000 + cur.gain) bySlot[slot] = (e, gain);
            }
            foreach (var kv in bySlot.OrderByDescending(k => k.Key == EquipSlot.Weapon ? 1e9 : k.Value.gain))
            {
                var e = kv.Value.e;
                if (e.Price > S.Inventory.Meso) continue;
                if (S.Buy(n.Shop, e.Item, 1) == ShopResult.Ok) { MesoSpent += e.Price; S.EquipItem(e.Item); }
            }
        }

        private void BuyConsumablesFrom(NpcData n)
        {
            var items = ShopItems(n.Shop).ToList();
            // 弾・矢・投げ星が要るのにこの店に無い時は、その分（1 束）を残す（投げ星が無いと盗賊は攻撃できない）
            long ammoReserve = NeedAmmo && !items.Any(e => D.Item(e.Item)?.AmmoKind == AmmoKind) ? 1200 : 0;
            long budget = (long)(Math.Max(0, S.Inventory.Meso - ammoReserve) * 0.6);
            // 弾・矢・投げ星
            if (AmmoKind != null && S.Character.Tier >= 1)
            {
                var ammo = items.Where(e => D.Item(e.Item)?.AmmoKind == AmmoKind).OrderByDescending(e => D.Item(e.Item).AmmoWatk).ToList();
                foreach (var e in ammo)
                {
                    int have = AmmoCount();
                    if (have >= 1500) break;
                    long unit = e.Price;
                    if (unit > budget * 0.5) continue;
                    int packs = (int)Math.Max(1, Math.Min((2000 - have) / Math.Max(1, D.Item(e.Item).MaxStack) + 1, budget * 0.5 / Math.Max(1, unit)));
                    for (int i = 0; i < packs; i++) if (S.Buy(n.Shop, e.Item, 1) == ShopResult.Ok) { budget -= unit; MesoSpent += unit; } else break;
                    break;
                }
            }
            // HP の薬: 最大 HP の 15% 以上回る物の中で安い物（無ければ一番大きい物）
            var hpList = items.Where(e => IsHpPotion(e.Item) && e.Price > 0).ToList();
            if (hpList.Count > 0)
            {
                int maxHp = S.Stats.MaxHp;
                var pick = hpList.Where(e => D.Item(e.Item).Use.Hp >= maxHp * 0.15).OrderBy(e => e.Price).FirstOrDefault()
                           ?? hpList.OrderByDescending(e => D.Item(e.Item).Use.Hp).First();
                int want = Level < 10 ? 30 : Level < 30 ? 60 : Level < 70 ? 150 : 100;
                int have = CountPotions(true);
                long share = UsesMpPotions ? (long)(budget * (Line == "magician" ? 0.4 : 0.85)) : budget;
                int n2 = (int)Math.Min(want - have, share / Math.Max(1, pick.Price));
                if (n2 > 0 && S.Buy(n.Shop, pick.Item, n2) == ShopResult.Ok) { budget -= pick.Price * n2; MesoSpent += pick.Price * n2; }
            }
            if (UsesMpPotions)
            {
                var mpList = items.Where(e => IsMpPotion(e.Item) && e.Price > 0).ToList();
                if (mpList.Count > 0)
                {
                    int maxMp = S.Stats.MaxMp;
                    var pick = mpList.Where(e => D.Item(e.Item).Use.Mp >= maxMp * 0.2).OrderBy(e => e.Price).FirstOrDefault()
                               ?? mpList.OrderByDescending(e => D.Item(e.Item).Use.Mp).First();
                    int want = Line == "magician" ? (Level < 30 ? 80 : 150) : 15;
                    int have = CountPotions(false);
                    int n2 = (int)Math.Min(want - have, budget / Math.Max(1, pick.Price));
                    if (n2 > 0 && S.Buy(n.Shop, pick.Item, n2) == ShopResult.Ok) { MesoSpent += pick.Price * n2; }
                }
            }
        }
    }
}
