// 敵の定義（Data/monsters.json）。数値は MONSTERS.md の表と同じ（export_data.mjs が curves.mjs の式で作る）。
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Mobs
{
    public enum MobMove { Crawl, Walk, Jump, Fly, Stand, Teleport }

    public sealed class DropEntry { public string Item; public double Chance; public int Count = 1; }

    public sealed class MobDef
    {
        public string Id, Name, Kind, AttackText, Etc, Special, Note;
        public int Lv;
        public MobMove Move;
        public bool Touch, Ranged, Magic;
        public readonly Dictionary<string, double> Elements = new Dictionary<string, double>();
        public int Hp, Mp, Exp, Atk, Matk, Def, Mdef, Avoid, Acc;
        public int Meso; public double MesoChance = 0.6;
        public double Speed;           // px/秒（= 100 + SpeedStat。止は 0）
        public int SpeedStat;          // クラシック流の速さ（-50〜+50。MONSTERS.md の表の「速さ」）
        public bool ChaseOnSight;      // 同じ足場に主人公がいると近づく（Lv20 以上の歩く敵）
        public double Width, Height;
        public int Pushed;             // 1 回でこのダメージ以上を受けると押される（0 = 押されない）
        public bool NoKnockback;
        public readonly List<DropEntry> Drops = new List<DropEntry>();
        public int EquipBand; public double EquipChance; public int EquipCount = 1;
        public double CursedScrollChance;
        public readonly List<MobSkillDef> Attacks = new List<MobSkillDef>(); // 技（体当たり以外）
        public StatusInflict TouchStatus;   // 触れた時の状態異常
        public BossDef Boss;                // ボスの段階（ボス・大ボス・ダンジョンの主。HP バーを出す）

        public bool IsBoss => Kind == "boss" || Kind == "raid";
        public bool IsElite => Kind == "elite";

        /// <summary>属性の倍率（弱点 1.5 / 耐性 0.5 / 無効 0 / 無し 1）</summary>
        public double ElementMul(string element)
        {
            if (string.IsNullOrEmpty(element)) return 1;
            return Elements.TryGetValue(element, out var m) ? m : 1;
        }

        public static MobMove ParseMove(string s)
        {
            switch (s)
            {
                case "crawl": return MobMove.Crawl;
                case "jump": return MobMove.Jump;
                case "fly": return MobMove.Fly;
                case "stand": return MobMove.Stand;
                case "teleport": return MobMove.Teleport;
                default: return MobMove.Walk;
            }
        }

        public static MobDef FromDict(Dictionary<string, object> d)
        {
            var m = new MobDef
            {
                Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Kind = J.Str(d, "kind", "normal"), AttackText = J.Str(d, "attack", ""),
                Etc = J.Str(d, "etc"), Special = J.Str(d, "special"), Note = J.Str(d, "note", ""),
                Lv = J.Int(d, "lv", 1), Move = ParseMove(J.Str(d, "move", "walk")),
                Touch = J.Bool(d, "touch", true), Ranged = J.Bool(d, "ranged"), Magic = J.Bool(d, "magic"),
                Hp = J.Int(d, "hp", 1), Mp = J.Int(d, "mp"), Exp = J.Int(d, "exp"), Atk = J.Int(d, "atk"), Matk = J.Int(d, "matk"),
                Def = J.Int(d, "def"), Mdef = J.Int(d, "mdef"), Avoid = J.Int(d, "avoid"), Acc = J.Int(d, "acc"),
                Meso = J.Int(d, "meso"), MesoChance = J.Num(d, "mesoChance", 0.6),
                Speed = J.Num(d, "speed", 60), SpeedStat = J.Int(d, "speedStat"), ChaseOnSight = J.Bool(d, "chaseOnSight"),
                Width = J.Num(d, "width", 40), Height = J.Num(d, "height", 40),
                Pushed = J.Int(d, "pushed", 1), NoKnockback = J.Bool(d, "noKnockback"),
                CursedScrollChance = J.Num(d, "cursedScrollChance"),
            };
            var el = J.Obj(d, "elements");
            if (el != null) foreach (var kv in el) m.Elements[kv.Key] = J.ToDouble(kv.Value, 1);
            foreach (var o in J.Arr(d, "drops"))
            {
                var dd = (Dictionary<string, object>)o;
                m.Drops.Add(new DropEntry { Item = J.Str(dd, "item"), Chance = J.Num(dd, "chance"), Count = J.Int(dd, "count", 1) });
            }
            var eq = J.Obj(d, "equipDrop");
            if (eq != null) { m.EquipBand = J.Int(eq, "band"); m.EquipChance = J.Num(eq, "chance"); m.EquipCount = J.Int(eq, "count", 1); }
            if (J.Has(d, "attacks")) foreach (var o in J.Arr(d, "attacks")) m.Attacks.Add(MobSkillDef.FromDict((Dictionary<string, object>)o));
            else m.Attacks.AddRange(DefaultAttacks(m));
            m.TouchStatus = StatusInflict.FromDict(J.Obj(d, "touchStatus"));
            m.Boss = BossDef.FromDict(J.Obj(d, "boss"));
            if (m.Boss == null && m.IsBoss) { m.Boss = new BossDef(); m.Boss.Phases.Add(new BossPhaseDef { Name = m.Name }); }
            return m;
        }

        /// <summary>技のデータが無い敵: 遠 = 真っすぐの飛び道具（3 秒ごと）、魔 = 足元に予兆 → 当たる魔法（export_data.mjs と同じ）。</summary>
        public static List<MobSkillDef> DefaultAttacks(MobDef m)
        {
            var r = new List<MobSkillDef>();
            if (m.Ranged) r.Add(new MobSkillDef { Id = "shot", Name = "飛び道具", Type = MobSkillType.Shot, Range = 300, Cooldown = 3, Windup = 0.3, Speed = 300, Life = 1.2 });
            else if (m.Magic) r.Add(new MobSkillDef { Id = "magic", Name = "魔法", Type = MobSkillType.Magic, Magic = true, Range = 300, Cooldown = 3.5, Windup = 0.8, W = 70, H = 90 });
            return r;
        }
    }
}
