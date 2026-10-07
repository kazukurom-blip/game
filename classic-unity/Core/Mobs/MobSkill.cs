// 敵の技とボスの段階の定義（Data/monsters.json の attacks / touchStatus / boss。元は classic/tools/data/mob_skills.mjs）。
using System;
using System.Collections.Generic;
using Lumina.Core.Status;
using Lumina.Core.Util;

namespace Lumina.Core.Mobs
{
    public enum MobSkillType { Melee, Shot, Magic, Area, Summon, Heal, Dive, Buff }

    /// <summary>敵の強化の種類（MobBuffs のビット: 1 &lt;&lt; (int)MobBuffKind）。</summary>
    public enum MobBuffKind { Atk, Matk, Def, Mdef, Speed, Reflect, MagicReflect }

    /// <summary>敵の技で掛ける強化（+% と秒）。reflect・magicReflect は受けたダメージの何 % を返すか。</summary>
    public sealed class MobBuffDef
    {
        public readonly double[] Pct = new double[MobBuffs.KindCount];
        public double Sec;

        public static MobBuffDef FromDict(Dictionary<string, object> d)
        {
            if (d == null) return null;
            var b = new MobBuffDef { Sec = J.Num(d, "sec", 10) };
            for (int i = 0; i < MobBuffs.KindCount; i++) b.Pct[i] = J.Num(d, MobBuffs.Keys[i]);
            return b;
        }
    }

    /// <summary>当たった時にかける状態異常。</summary>
    public sealed class StatusInflict
    {
        public StatusKind Kind;
        public double Sec, Chance = 1, Power;

        public static StatusInflict FromDict(Dictionary<string, object> d)
        {
            if (d == null || !StatusSystem.TryParse(J.Str(d, "kind", ""), out var k)) return null;
            return new StatusInflict { Kind = k, Sec = J.Num(d, "sec", 3), Chance = J.Num(d, "chance", 1), Power = J.Num(d, "power") };
        }
    }

    /// <summary>敵の技 1 つ。</summary>
    public sealed class MobSkillDef
    {
        public string Id, Name;
        public MobSkillType Type;
        public double Range = 300;          // 主人公がこの横の距離にいる時だけ使う
        public double Cooldown = 3, Windup = 0.5;
        public double Pct = 100;            // 攻撃力の何 %
        public bool Magic;                  // 魔法（魔法防御で受ける・避けられない）
        public double W = 70, H = 90;       // 当たる四角
        public bool Back;                   // melee: 後ろを払う
        public double Speed = 300, Life = 1.2; // shot
        public int Count = 1; public double Spread;
        public double Linger;               // magic: その場に残る時間（毒の沼など）
        public bool Global, GroundOnly; public double SafeHeight;
        public List<string> Mobs = new List<string>(); public int Max = 4; // summon
        public StatusInflict Status;
        public List<int> Phases;            // 使う段階（null = 全部）
        public double Weight = 1;
        public MobBuffDef Buff; public bool Allies; // buff: 自分（allies なら W 幅の中の仲間も）を強化
        public double Pull;                 // 当たったら主人公を px 引き寄せる（ツタ）
        public double SuckW, SuckSpeed;     // 予兆の間、SuckW 幅の中の主人公を中心へ吸い込む（渦潮）
        public List<double> ShelterAt; public double ShelterW; // 盾の陰（マップの横幅の割合の位置、幅）

        public bool InPhase(int phase) => Phases == null || Phases.Contains(phase);

        public static MobSkillType ParseType(string s)
        {
            switch (s)
            {
                case "melee": return MobSkillType.Melee;
                case "magic": return MobSkillType.Magic;
                case "area": return MobSkillType.Area;
                case "summon": return MobSkillType.Summon;
                case "heal": return MobSkillType.Heal;
                case "dive": return MobSkillType.Dive;
                case "buff": return MobSkillType.Buff;
                default: return MobSkillType.Shot;
            }
        }

        public static MobSkillDef FromDict(Dictionary<string, object> d)
        {
            var t = ParseType(J.Str(d, "type", "shot"));
            var s = new MobSkillDef
            {
                Id = J.Str(d, "id", "skill"), Name = J.Str(d, "name", ""), Type = t,
                Range = J.Num(d, "range", 300), Cooldown = J.Num(d, "cd", 3), Windup = J.Num(d, "windup", 0.5),
                Pct = J.Num(d, "pct", 100),
                // magic 型は「physical: true」でなければ魔法、shot 型は「magic: true」なら魔法
                Magic = t == MobSkillType.Magic ? !J.Bool(d, "physical") : J.Bool(d, "magic"),
                W = J.Num(d, "w", 70), H = J.Num(d, "h", 90), Back = J.Bool(d, "back"),
                Speed = J.Num(d, "speed", 300), Life = J.Num(d, "life", 1.2),
                Count = J.Int(d, "count", 1), Spread = J.Num(d, "spread"), Linger = J.Num(d, "linger"),
                Global = J.Bool(d, "global"), GroundOnly = J.Bool(d, "groundOnly"), SafeHeight = J.Num(d, "safeHeight"),
                Max = J.Int(d, "max", 4), Status = StatusInflict.FromDict(J.Obj(d, "status")), Weight = J.Num(d, "weight", 1),
            };
            s.Mobs = J.StrList(d, "mobs");
            s.Buff = MobBuffDef.FromDict(J.Obj(d, "buff")); s.Allies = J.Bool(d, "allies");
            s.Pull = J.Num(d, "pull");
            var sk = J.Obj(d, "suck"); if (sk != null) { s.SuckW = J.Num(sk, "w", 400); s.SuckSpeed = J.Num(sk, "speed", 100); }
            var sh = J.Obj(d, "shelter");
            if (sh != null) { s.ShelterAt = new List<double>(); foreach (var o in J.Arr(sh, "at")) s.ShelterAt.Add(J.ToDouble(o)); s.ShelterW = J.Num(sh, "w", 80); }
            if (J.Has(d, "phases")) { s.Phases = new List<int>(); foreach (var o in J.Arr(d, "phases")) s.Phases.Add((int)J.ToDouble(o)); }
            return s;
        }
    }

    /// <summary>ボスの段階 1 つ（HP が Hp の割合以下になると始まる）。</summary>
    public sealed class BossPhaseDef
    {
        public double Hp = 1;
        public string Name = "";
        public double AtkMul = 1, DefMul = 1, SpeedMul = 1, Rate = 1;
        public Dictionary<string, double> Elements;    // 弱点の上書き（無ければ元のまま）
        public double HealPct;                          // 始まった時に治す（最大 HP の %）
        public List<string> SummonMobs = new List<string>(); public int SummonCount;
        public int CloneCount; public double CloneHpPct = 2, CloneShuffle = 8;       // 分身（雲の魔女）
        public double SubmergeSec, SubmergeHealPct, RockHpPct = 0.5; public int Rocks; // 深く潜って回復（深淵の大魚）。光る岩

        public static BossPhaseDef FromDict(Dictionary<string, object> d)
        {
            var p = new BossPhaseDef
            {
                Hp = J.Num(d, "hp", 1), Name = J.Str(d, "name", ""), AtkMul = J.Num(d, "atkMul", 1), DefMul = J.Num(d, "defMul", 1),
                SpeedMul = J.Num(d, "speedMul", 1), Rate = J.Num(d, "rate", 1), HealPct = J.Num(d, "healPct"),
            };
            var el = J.Obj(d, "elements");
            if (el != null) { p.Elements = new Dictionary<string, double>(); foreach (var kv in el) p.Elements[kv.Key] = J.ToDouble(kv.Value, 1); }
            var sm = J.Obj(d, "summon");
            if (sm != null) { p.SummonMobs = J.StrList(sm, "mobs"); p.SummonCount = J.Int(sm, "count", 1); }
            var cl = J.Obj(d, "clones");
            if (cl != null) { p.CloneCount = J.Int(cl, "count", 2); p.CloneHpPct = J.Num(cl, "hpPct", 2); p.CloneShuffle = J.Num(cl, "shuffle", 8); }
            var su = J.Obj(d, "submerge");
            if (su != null) { p.SubmergeSec = J.Num(su, "sec", 30); p.SubmergeHealPct = J.Num(su, "healPct", 5); p.Rocks = J.Int(su, "rocks", 3); p.RockHpPct = J.Num(su, "rockHpPct", 0.5); }
            return p;
        }
    }

    /// <summary>時の裂け目（時計塔の魔物）。</summary>
    public sealed class RiftDef
    {
        public int Phase, Count = 3;
        public string Mob;                  // 「時のかけら」を落とす手下
        public double Limit = 60, Guard = 0.1, Expose = 20;

        public static RiftDef FromDict(Dictionary<string, object> d)
        {
            if (d == null) return null;
            return new RiftDef
            {
                Phase = J.Int(d, "phase"), Count = Math.Max(1, J.Int(d, "count", 3)), Mob = J.Str(d, "mob"),
                Limit = J.Num(d, "limit", 60), Guard = J.Num(d, "guard", 0.1), Expose = J.Num(d, "expose", 20),
            };
        }
    }

    public sealed class BossDef
    {
        public readonly List<BossPhaseDef> Phases = new List<BossPhaseDef>();
        public RiftDef Rifts;

        public static BossDef FromDict(Dictionary<string, object> d)
        {
            if (d == null) return null;
            var b = new BossDef();
            foreach (var o in J.Arr(d, "phases")) b.Phases.Add(BossPhaseDef.FromDict((Dictionary<string, object>)o));
            if (b.Phases.Count == 0) b.Phases.Add(new BossPhaseDef());
            b.Rifts = RiftDef.FromDict(J.Obj(d, "rifts"));
            b.Phases.Sort((a, c) => c.Hp.CompareTo(a.Hp)); // HP の多い順
            return b;
        }
    }
}
