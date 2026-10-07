// 町と成長の仕組みのデータ（Data/systems.json。元は Data/tools/systems.mjs）。
// 倉庫の決まり・ボスの間/1 人用ダンジョン/試験の部屋の決まり・ペット・製作・賢者の石のクイズ・転職の試験・毎日の宝箱。
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Town
{
    public sealed class StorageRules
    {
        public int StartSlots = 16, MaxSlots = 48, Step = 4;
        public long ExpandBase = 10000, Fee = 100;
        public bool Shared = true;

        /// <summary>今の枠の数から、次に 4 枠増やす値段（10,000 → 20,000 → …）。</summary>
        public long ExpandCost(int slots) => ExpandBase * (1 + (slots - StartSlots) / Step);
    }

    public enum RoomKind { Boss, Dungeon, Test }

    /// <summary>ボスの間・1 人用ダンジョン・試験の部屋の決まり（入る回数・制限時間・戻り先）。</summary>
    public sealed class RoomRule
    {
        public string Map, Exit, RequiresItem, RequiresQuest, TimerQuest, ClearMob, Medal;
        public RoomKind Kind;
        public int PerDay;              // 0 = 回数の制限なし
        public bool Weekly;             // PerDay を 7 日で数える
        public double TimeSec;          // 0 = 制限時間なし
        public int LvMin, LvMax;        // 0 = 制限なし
        public bool Fresh;              // 入るたびに作り直す（ボス・主がすぐ出る）
        public readonly List<string> RequiresAnyQuest = new List<string>();
        public readonly List<string> ResetItems = new List<string>();

        public static RoomRule FromDict(Dictionary<string, object> d)
        {
            var r = new RoomRule
            {
                Map = J.Str(d, "map"), Exit = J.Str(d, "exit"), RequiresItem = J.Str(d, "requiresItem"), RequiresQuest = J.Str(d, "requiresQuest"),
                TimerQuest = J.Str(d, "timerQuest"), ClearMob = J.Str(d, "clearMob"), Medal = J.Str(d, "medal"),
                PerDay = J.Int(d, "perDay"), Weekly = J.Str(d, "period") == "week", TimeSec = J.Num(d, "timeSec"), Fresh = J.Bool(d, "fresh"),
            };
            switch (J.Str(d, "kind", "boss"))
            {
                case "dungeon": r.Kind = RoomKind.Dungeon; break;
                case "test": r.Kind = RoomKind.Test; break;
                default: r.Kind = RoomKind.Boss; break;
            }
            var lv = J.Arr(d, "lv");
            if (lv.Count == 2) { r.LvMin = (int)J.ToDouble(lv[0]); r.LvMax = (int)J.ToDouble(lv[1]); }
            r.RequiresAnyQuest.AddRange(J.StrList(d, "requiresAnyQuest"));
            r.ResetItems.AddRange(J.StrList(d, "resetItems"));
            return r;
        }
    }

    public sealed class PetKind { public string Id, Name, GrownName; public int GrowAt; }

    public sealed class PetRules
    {
        public readonly List<PetKind> Kinds = new List<PetKind>();
        public int FullnessMax = 100, FoodFullness = 30, ClosenessMax = 30, PointsPerLevel = 3, FeedPoints = 3, TrickPoints = 1;
        public double HungerSec = 36, TrickChance = 0.6, TrickCooldown = 10, WalkPointSec = 300, StarvePenaltySec = 600;
        public double PickupRange = 80, PickupRangeWide = 200, PickupInterval = 0.2, PotionHpPct = 0.5, PotionMpPct = 0.3, FollowGap = 36;
        public string FoodItem = "use.pet_food";
        public readonly List<string> Tricks = new List<string>();

        public PetKind Kind(string id) => Kinds.Find(k => k.Id == id);

        /// <summary>親密度 Lv（1〜ClosenessMax）になるまでに要る点の合計。Lv n → n+1 は PointsPerLevel × n 点。</summary>
        public int PointsFor(int level) => PointsPerLevel * (level - 1) * level / 2;
    }

    public sealed class CraftIngredient { public string Item; public int Count = 1; }

    public sealed class CraftRecipe
    {
        public string Id, Npc;
        public long Fee;
        public readonly List<CraftIngredient> In = new List<CraftIngredient>();
        public CraftIngredient Out = new CraftIngredient();
    }

    public sealed class QuizQuestion
    {
        public string Id, Question;
        public readonly List<string> Choices = new List<string>();
        public int Answer;
    }

    public sealed class QuestDrop { public string Quest, Mob, Item; }

    public sealed class JobTestRules
    {
        public int Tier2Level = 30;
        public string Proof = "special.job.proof";
        public int QuizCount = 5;
        public readonly List<string> QuizNeedItems = new List<string>();
        public string QuizLoseOnWrong, QuizStone;
        public readonly List<QuestDrop> QuestDrops = new List<QuestDrop>();
        public int InventoryPlus = 4;
        /// <summary>1 次転職でもらう物（JOBS.md 3-1）。系統 → 品と個数。</summary>
        public readonly Dictionary<string, List<CraftIngredient>> FirstJobItems = new Dictionary<string, List<CraftIngredient>>();
    }

    public sealed class ChestDef
    {
        public long Meso;
        public readonly List<CraftIngredient> Items = new List<CraftIngredient>();
    }

    public sealed class SystemsData
    {
        public StorageRules Storage = new StorageRules();
        public readonly Dictionary<string, RoomRule> Rooms = new Dictionary<string, RoomRule>();
        public PetRules Pets = new PetRules();
        public readonly List<CraftRecipe> Crafts = new List<CraftRecipe>();
        public readonly List<QuizQuestion> Quiz = new List<QuizQuestion>();
        public JobTestRules Jobs = new JobTestRules();
        public readonly Dictionary<string, ChestDef> Chests = new Dictionary<string, ChestDef>();

        public RoomRule Room(string mapId) => mapId != null && Rooms.TryGetValue(mapId, out var r) ? r : null;

        public static SystemsData FromDict(Dictionary<string, object> d)
        {
            var s = new SystemsData();
            if (d == null) return s;
            var st = J.Obj(d, "storage");
            if (st != null)
                s.Storage = new StorageRules
                {
                    StartSlots = J.Int(st, "startSlots", 16), MaxSlots = J.Int(st, "maxSlots", 48), Step = J.Int(st, "step", 4),
                    ExpandBase = J.Long(st, "expandBase", 10000), Fee = J.Long(st, "fee", 100), Shared = J.Bool(st, "shared", true),
                };
            foreach (var o in J.Arr(d, "rooms")) { var r = RoomRule.FromDict((Dictionary<string, object>)o); s.Rooms[r.Map] = r; }
            var p = J.Obj(d, "pets");
            if (p != null)
            {
                var pr = s.Pets;
                foreach (var o in J.Arr(p, "kinds"))
                {
                    var k = (Dictionary<string, object>)o;
                    pr.Kinds.Add(new PetKind { Id = J.Str(k, "id"), Name = J.Str(k, "name", ""), GrownName = J.Str(k, "grownName"), GrowAt = J.Int(k, "growAt") });
                }
                pr.FullnessMax = J.Int(p, "fullnessMax", 100); pr.HungerSec = J.Num(p, "hungerSec", 36);
                pr.FoodItem = J.Str(p, "foodItem", "use.pet_food"); pr.FoodFullness = J.Int(p, "foodFullness", 30);
                pr.ClosenessMax = J.Int(p, "closenessMax", 30); pr.PointsPerLevel = J.Int(p, "pointsPerLevel", 3);
                pr.FeedPoints = J.Int(p, "feedPoints", 3); pr.TrickPoints = J.Int(p, "trickPoints", 1);
                pr.TrickChance = J.Num(p, "trickChance", 0.6); pr.TrickCooldown = J.Num(p, "trickCooldown", 10);
                pr.WalkPointSec = J.Num(p, "walkPointSec", 300); pr.StarvePenaltySec = J.Num(p, "starvePenaltySec", 600);
                pr.PickupRange = J.Num(p, "pickupRange", 80); pr.PickupRangeWide = J.Num(p, "pickupRangeWide", 200); pr.PickupInterval = J.Num(p, "pickupInterval", 0.2);
                pr.PotionHpPct = J.Num(p, "potionHpPct", 0.5); pr.PotionMpPct = J.Num(p, "potionMpPct", 0.3); pr.FollowGap = J.Num(p, "followGap", 36);
                pr.Tricks.AddRange(J.StrList(p, "tricks"));
            }
            foreach (var o in J.Arr(d, "crafts"))
            {
                var c = (Dictionary<string, object>)o;
                var r = new CraftRecipe { Id = J.Str(c, "id"), Npc = J.Str(c, "npc"), Fee = J.Long(c, "fee") };
                foreach (var i in J.Arr(c, "in")) { var x = (Dictionary<string, object>)i; r.In.Add(new CraftIngredient { Item = J.Str(x, "item"), Count = J.Int(x, "count", 1) }); }
                var ot = J.Obj(c, "out");
                r.Out = new CraftIngredient { Item = J.Str(ot, "item"), Count = J.Int(ot, "count", 1) };
                s.Crafts.Add(r);
            }
            foreach (var o in J.Arr(d, "quiz"))
            {
                var q = (Dictionary<string, object>)o;
                var qq = new QuizQuestion { Id = J.Str(q, "id"), Question = J.Str(q, "q", ""), Answer = J.Int(q, "answer") };
                qq.Choices.AddRange(J.StrList(q, "choices"));
                s.Quiz.Add(qq);
            }
            var jb = J.Obj(d, "jobs");
            if (jb != null)
            {
                var t2 = J.Obj(jb, "tier2");
                if (t2 != null) { s.Jobs.Tier2Level = J.Int(t2, "level", 30); s.Jobs.Proof = J.Str(t2, "proof", s.Jobs.Proof); }
                var qz = J.Obj(jb, "quiz");
                if (qz != null)
                {
                    s.Jobs.QuizCount = J.Int(qz, "count", 5);
                    s.Jobs.QuizNeedItems.AddRange(J.StrList(qz, "needItems"));
                    s.Jobs.QuizLoseOnWrong = J.Str(qz, "loseOnWrong");
                    s.Jobs.QuizStone = J.Str(qz, "stone");
                }
                foreach (var o in J.Arr(jb, "questDrops"))
                {
                    var x = (Dictionary<string, object>)o;
                    s.Jobs.QuestDrops.Add(new QuestDrop { Quest = J.Str(x, "quest"), Mob = J.Str(x, "mob"), Item = J.Str(x, "item") });
                }
                s.Jobs.InventoryPlus = J.Int(jb, "inventoryPlus", 4);
                var fj = J.Obj(jb, "firstJobItems");
                if (fj != null)
                    foreach (var kv in fj)
                    {
                        var list = new List<CraftIngredient>();
                        foreach (var o in (List<object>)kv.Value)
                        {
                            var x = (Dictionary<string, object>)o;
                            list.Add(new CraftIngredient { Item = J.Str(x, "item"), Count = J.Int(x, "count", 1) });
                        }
                        s.Jobs.FirstJobItems[kv.Key] = list;
                    }
            }
            var ch = J.Obj(d, "chests");
            if (ch != null)
                foreach (var kv in ch)
                {
                    var c = (Dictionary<string, object>)kv.Value;
                    var def = new ChestDef { Meso = J.Long(c, "meso") };
                    foreach (var i in J.Arr(c, "items")) { var x = (Dictionary<string, object>)i; def.Items.Add(new CraftIngredient { Item = J.Str(x, "item"), Count = J.Int(x, "count", 1) }); }
                    s.Chests[kv.Key] = def;
                }
            return s;
        }
    }
}
