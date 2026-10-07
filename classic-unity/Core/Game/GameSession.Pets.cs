// ペット（QUESTS.md 4 章・ITEMS.md 3-5）（GameSession の続き）。数の決まりは systems.json の pets（PetRules）。
//
// - 迎える: ペット屋で「子犬」などの品を買って使う（UseItem）→ pet_adopted。連れて歩けるのは 1 匹（PET-07 の後は 2 匹）。
// - 満腹度 0〜100: 時間で減る（36 秒で 1）。ペットの餌で +30（pet_fed）。0 になると動かない・技も使わない（死なない）。
// - 親密度 Lv1〜30: 餌（お腹が空いている時 +3 点）・話しかけて芸が成功（+1 点）・満腹で連れて歩く（5 分で +1 点）。
//   満腹度 0 のまま 10 分ごとに −1 点。Lv が上がると pet_closeness（クエストの数は「今の Lv」まで進む）。芸は 5 Lv ごとに増える。
// - 技（技の本）: 自動で拾う（足元から 80 px）/ 拾う範囲を広げる（200 px）/ 自動で薬（HP 50%・MP 30% を下回ると）。
// - 位置: 主人公の後ろ 36 px を追う（Unity は pet.X, Y, FacingRight, Motion を描く）。
using System;
using System.Collections.Generic;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Town;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public sealed partial class GameSession
    {
        /// <summary>飼っているペット（保存する）。Out のものが連れて歩いている。</summary>
        public readonly List<PetState> Pets = new List<PetState>();

        /// <summary>同時に連れて歩ける数（PET-07 の後は 2）。</summary>
        public int PetOutLimit => Flags.TryGetValue("pet.second", out var b) && b ? 2 : 1;

        private int PetsOut() { int n = 0; foreach (var p in Pets) if (p.Out) n++; return n; }

        private PetRules PetRules => Data.Systems.Pets;

        /// <summary>UseItem から: ペットの品・餌・技の本・名札を使う。使ったら true（使えない時は false でアイテムは残る）。null = ペットの品でない。</summary>
        private bool? TryUsePetItem(ItemDef def)
        {
            if (def.Pet != null) return AdoptPet(def);
            if (def.Id == PetRules.FoodItem) return FeedPet(-1);
            if (def.PetSkill != null) return LearnPetSkill(def);
            return null;
        }

        private bool AdoptPet(ItemDef def)
        {
            var kind = PetRules.Kind(def.Pet);
            if (kind == null || !Inventory.Has(def.Id)) return false;
            Inventory.Remove(def.Id);
            var p = new PetState { Kind = kind.Id, Name = kind.Name, Fullness = PetRules.FullnessMax, X = Body.X - (Body.Facing > 0 ? PetRules.FollowGap : -PetRules.FollowGap), Y = Body.Y };
            p.Out = PetsOut() < PetOutLimit;
            Pets.Add(p);
            Out.Add(GameEventType.PetAdopted, kind.Id, Pets.Count - 1, text: kind.Name + "を迎えた");
            QuestEvent("pet_adopted");
            AutoSave.Request("pet");
            return true;
        }

        /// <summary>ペットに餌をあげる（index = Pets の番号。-1 なら連れているペットのうち一番お腹が空いている子）。ペットの餌を 1 つ使う。</summary>
        public bool FeedPet(int index)
        {
            if (!Inventory.Has(PetRules.FoodItem)) return false;
            PetState p = null;
            if (index >= 0 && index < Pets.Count) p = Pets[index];
            else foreach (var x in Pets) if (x.Out && (p == null || x.Fullness < p.Fullness)) p = x;
            if (p == null) return false;
            int before = p.Closeness(PetRules);
            bool hungry = p.Fullness < PetRules.FullnessMax;
            p.Fullness = Math.Min(PetRules.FullnessMax, p.Fullness + PetRules.FoodFullness);
            if (hungry) p.Points += PetRules.FeedPoints;
            Inventory.Remove(PetRules.FoodItem);
            Out.Add(GameEventType.PetFed, p.Kind, p.Fullness, p.X, p.Y);
            QuestEvent("pet_fed");
            AfterClosenessChange(p, before);
            return true;
        }

        /// <summary>話しかける（芸）。成功すると親密度 +1 点。待ち時間 10 秒。成功したら true。</summary>
        public bool TalkToPet(int index)
        {
            if (index < 0 || index >= Pets.Count) return false;
            var p = Pets[index];
            if (!p.Out || p.Hungry || p.TrickCd > 0) return false;
            p.TrickCd = PetRules.TrickCooldown;
            int before = p.Closeness(PetRules);
            int n = p.TrickCount(PetRules);
            string trick = n > 0 ? PetRules.Tricks[Rng.Range(0, n - 1)] : "";
            bool ok = Rng.Chance(PetRules.TrickChance);
            if (ok) { p.Points += PetRules.TrickPoints; p.Motion = "trick"; p.TrickShowT = 1.5; }
            Out.Add(GameEventType.PetTrick, p.Kind, ok ? 1 : 0, p.X, p.Y, ok ? trick : "そっぽを向いた");
            AfterClosenessChange(p, before);
            return ok;
        }

        /// <summary>連れて歩く・しまう（連れて歩けるのは PetOutLimit 匹まで）。</summary>
        public bool SetPetOut(int index, bool @out)
        {
            if (index < 0 || index >= Pets.Count) return false;
            var p = Pets[index];
            if (p.Out == @out) return true;
            if (@out && PetsOut() >= PetOutLimit) return false;
            p.Out = @out;
            p.X = Body.X; p.Y = Body.Y;
            return true;
        }

        /// <summary>ペットの名札を使って名前を変える。</summary>
        public bool RenamePet(int index, string name)
        {
            if (index < 0 || index >= Pets.Count || string.IsNullOrWhiteSpace(name) || !Inventory.Has("use.pet_name_tag")) return false;
            Inventory.Remove("use.pet_name_tag");
            Pets[index].Name = name.Trim();
            return true;
        }

        private bool LearnPetSkill(ItemDef def)
        {
            foreach (var p in Pets)
            {
                if (!p.Out) continue;
                switch (def.PetSkill)
                {
                    case "pickup": if (p.SkillPickup) continue; p.SkillPickup = true; break;
                    case "range": if (p.SkillRange) continue; p.SkillRange = true; break;
                    case "potion": if (p.SkillPotion) continue; p.SkillPotion = true; break;
                    default: return false;
                }
                Inventory.Remove(def.Id);
                Out.Add(GameEventType.Message, def.Id, text: p.Name + "は技を覚えた");
                return true;
            }
            return false;
        }

        private void AfterClosenessChange(PetState p, int before)
        {
            int now = p.Closeness(PetRules);
            if (now != before) Out.Add(GameEventType.PetCloseness, p.Kind, now, p.X, p.Y, p.Name + "の親密度が " + now + " になった");
            if (now > before) SyncPetCloseness();
        }

        /// <summary>「親密度を N にする」目的を、今のペットの一番高い親密度まで進める。</summary>
        private void SyncPetCloseness()
        {
            int best = 0;
            foreach (var p in Pets) best = Math.Max(best, p.Closeness(PetRules));
            if (best <= 0) return;
            bool any = false;
            foreach (var q in Quests.InProgress())
            {
                var prog = Quests.Get(q.Id);
                for (int i = 0; i < q.Objectives.Count; i++)
                {
                    var o = q.Objectives[i];
                    if (o.Type != ObjectiveType.Event || o.Target != "pet_closeness") continue;
                    prog.Counts.TryGetValue(o.Key, out var n);
                    int want = Math.Min(o.Count, best);
                    if (want <= n) continue;
                    prog.Counts[o.Key] = want;
                    OnQuestNote(new QuestProgressNote { QuestId = q.Id, ObjectiveIndex = i, Count = want, Need = o.Count });
                    any = true;
                }
            }
            if (any) CheckAutoComplete();
        }

        // ---------------- 毎フレーム

        private void TickPets(double dt)
        {
            if (Pets.Count == 0 || Dead) return;
            var r = PetRules;
            int k = 0;
            foreach (var p in Pets)
            {
                if (!p.Out) continue;
                int before = p.Closeness(r);
                // 満腹度
                p.HungerT += dt;
                while (p.HungerT >= r.HungerSec) { p.HungerT -= r.HungerSec; if (p.Fullness > 0) { p.Fullness--; if (p.Fullness == 0) Out.Add(GameEventType.PetHungry, p.Kind, 0, p.X, p.Y, p.Name + "はお腹が空いて動けない"); } }
                if (p.Fullness >= r.FullnessMax / 2) { p.WalkT += dt; if (p.WalkT >= r.WalkPointSec) { p.WalkT = 0; p.Points++; } }
                else p.WalkT = 0;
                if (p.Hungry) { p.StarveT += dt; if (p.StarveT >= r.StarvePenaltySec) { p.StarveT = 0; p.Points = Math.Max(0, p.Points - 1); } }
                else p.StarveT = 0;
                if (p.TrickCd > 0) p.TrickCd -= dt;
                AfterClosenessChange(p, before);
                // ついて歩く（2 匹目はもう少し後ろ）
                if (!p.Hungry)
                {
                    double gap = r.FollowGap * (1 + k);
                    double tx = Body.X - Body.Facing * gap;
                    double dx = tx - p.X;
                    double step = Math.Min(Math.Abs(dx), Math.Max(60, Math.Abs(dx) * 4) * dt);
                    if (Math.Abs(dx) > 1) { p.X += Math.Sign(dx) * step; p.FacingRight = dx > 0; }
                    if (Math.Abs(dx) > 400 || Math.Abs(Body.Y - p.Y) > 300) { p.X = tx; } // 離れすぎたら追いつく
                    p.Y = Body.OnGround || Body.OnRope ? Body.Y : p.Y;
                    if (p.TrickShowT > 0) p.TrickShowT -= dt;
                    p.Motion = p.TrickShowT > 0 ? "trick" : Math.Abs(dx) > 4 ? "move" : "stand";
                }
                else p.Motion = "hungry";
                // 技: 自動で拾う・自動で薬
                if (!p.Hungry)
                {
                    p.PickT -= dt;
                    if (p.SkillPickup && p.PickT <= 0)
                    {
                        p.PickT = r.PickupInterval;
                        var d = PetFindDrop(p.SkillRange ? r.PickupRangeWide : r.PickupRange);
                        if (d != null) PickupDrop(d);
                    }
                    if (p.SkillPotion) PetPotion(p);
                }
                k++;
            }
        }

        private DropItem PetFindDrop(double range)
        {
            DropItem best = null; double bd = double.PositiveInfinity;
            foreach (var d in Map.Drops)
            {
                if (!d.Landed || d.PickedUp) continue;
                double dx = Math.Abs(d.X - Body.X), dy = Math.Abs(d.Y - Body.Y);
                if (dx > range || dy > 60) continue;
                if (dx < bd) { bd = dx; best = d; }
            }
            return best;
        }

        private double petPotionT;

        private void PetPotion(PetState p)
        {
            if (PlaySec < petPotionT) return;
            var r = PetRules;
            string use = null;
            if (Character.Hp < Stats.MaxHp * r.PotionHpPct) use = BestPotion(true);
            if (use == null && Character.Mp < Stats.MaxMp * r.PotionMpPct) use = BestPotion(false);
            if (use == null) return;
            petPotionT = PlaySec + 0.5;
            if (UseItem(use)) Out.Add(GameEventType.PetUsedPotion, use, x: p.X, y: p.Y);
        }

        /// <summary>持っている薬のうち一番よく効く物（HP か MP）。</summary>
        private string BestPotion(bool hp)
        {
            string best = null; double bv = 0;
            foreach (var (tab, _, it) in Inventory.All())
            {
                if (tab != InvTab.Use) continue;
                var u = Data.Item(it.ItemId)?.Use;
                if (u == null || u.Buff != null || u.ReturnTo != null) continue;
                double v = hp ? u.Hp + u.HpPct * Stats.MaxHp : u.Mp + u.MpPct * Stats.MaxMp;
                if (v > bv) { bv = v; best = it.ItemId; }
            }
            return best;
        }
    }
}
