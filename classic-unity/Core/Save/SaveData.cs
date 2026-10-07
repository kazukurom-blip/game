// セーブの中身（JSON にする前の形）。版番号（Version）を付け、古い版は SaveMigrations で今の版へ直してから読む。
//
// 今の版（3）の JSON:
// {
//   "version": 3, "seq": 12, "savedAt": "2026-10-07T12:00:00Z", "playSec": 3600.5, "reason": "map",
//   "character": { "name": "...", "line": "warrior", "tier": 1, "branch": 0, "level": 12, "exp": 345,
//                  "str": 40, "dex": 12, "int": 4, "luk": 4, "ap": 0, "sp": [0, 3, 0, 0, 0],
//                  "baseMaxHp": 400, "baseMaxMp": 60, "hp": 300, "mp": 60, "apHp": 0, "apMp": 0 },
//   "inventory": { "meso": 1234, "slots": [24, 24, 24, 24, 24],
//                  "items": [ { "tab": 1, "slot": 0, "id": "use.red_potion", "count": 20 },
//                             { "tab": 0, "slot": 3, "id": "eq.starter.9", "count": 1, "stats": { "watk": 18 }, "upgLeft": 6, "upg": 1, "quality": false } ] },
//   "equipment": [ { "slot": "weapon", "item": { "id": "...", "stats": {...}, "upgLeft": 7, "upg": 0 } } ],
//   "skills": { "warrior.power_strike": 5 },
//   "cooldowns": { "common4.will": 120.5 },
//   "quickslots": [ { "key": 0, "kind": "skill", "id": "warrior.power_strike" } ],
//   "quests": [ { "id": "S-01", "status": "done", "counts": {}, "at": 120 } ],
//   "location": { "map": "S001", "x": 300, "y": 640 },
//   "flags": { "leftIsland": false },
//   "pets": [ { "kind": "puppy", "name": "子犬", "fullness": 80, "points": 40, "out": true, "skills": ["pickup"] } ],  … 版 3 から
//   "daily": { "room.V516": [9410, 2], "chest.T104.toybox": [9410, 1] },   … 版 3 から（[日の番号, 回数]）
//   （倉庫はキャラ全員で共有するので、ここではなく "account" の枠: Town/Storage.cs の AccountData）
//   "rng": ["0123456789abcdef", "fedcba9876543210"]
// }
using System.Collections.Generic;
using Lumina.Core.Items;

namespace Lumina.Core.Save
{
    public sealed class SavedItem
    {
        public int Tab, Slot;
        public string Id;
        public int Count = 1;
        public StatBlock Stats;
        public int UpgLeft, Upg;
        public bool Quality;
    }

    public sealed class SavedQuest
    {
        public string Id, Status; // "active" / "done"
        public Dictionary<string, int> Counts = new Dictionary<string, int>();
        public long At;
    }

    public sealed class SavedQuickSlot { public int Key; public string Kind, Id; }

    public sealed class SavedPet
    {
        public string Kind, Name;
        public int Fullness = 100, Points;
        public bool Out, Pickup, Range, Potion;
    }

    public sealed class SaveData
    {
        public int Version = SaveMigrations.CurrentVersion;
        public long Seq;
        public string SavedAt;
        public double PlaySec;
        public string Reason;

        // キャラ
        public string Name, Line;
        public int Tier, Branch, Level;
        public long Exp;
        public int Str, Dex, Int, Luk, Ap;
        public int[] Sp = new int[5];
        public int BaseMaxHp, BaseMaxMp, Hp, Mp, ApHp, ApMp;

        // 持ち物・装備
        public long Meso;
        public int[] Slots = { 24, 24, 24, 24, 24 };
        public List<SavedItem> Items = new List<SavedItem>();
        public Dictionary<string, SavedItem> Equipment = new Dictionary<string, SavedItem>();

        public Dictionary<string, int> Skills = new Dictionary<string, int>();
        public Dictionary<string, double> Cooldowns = new Dictionary<string, double>();
        public Dictionary<string, int> SkillMasters = new Dictionary<string, int>(); // 極意の書で上がった最大 Lv（無ければ空）
        public List<SavedQuickSlot> QuickSlots = new List<SavedQuickSlot>();
        public List<SavedQuest> Quests = new List<SavedQuest>();

        public string Map;
        public double X, Y;
        public Dictionary<string, bool> Flags = new Dictionary<string, bool>();
        public string Rng0, Rng1;

        // 版 3: ペット・実時間の回数（ボスの間・ダンジョン・毎日の宝箱）
        public List<SavedPet> Pets = new List<SavedPet>();
        public Dictionary<string, int[]> Daily = new Dictionary<string, int[]>();
    }
}
