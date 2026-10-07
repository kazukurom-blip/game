// スキルの定義（Data/skills.json）。JOBS.md の表をデータにしたもの。式の x はスキルの Lv、lv はキャラの Lv。
//
// 種類（kind）:
//   attack   = 攻撃（前の敵。近く）        area    = 範囲（まわり・複数）
//   ranged   = 遠距離（弓・投げ・弾・魔法）   movement = 移動（突進・早足）
//   buff     = 強化（自分にかける）          heal    = 回復
//   passive  = 常に効く                      summon  = 召喚
//
// 例（強打）:
// { "id": "warrior.power_strike", "name": "強打", "job": "warrior", "tier": 1, "kind": "attack", "maxLevel": 20,
//   "mp": "3+floor(x/4)", "damage": "160+5*x", "targets": "1", "hits": "1", "range": { "front": 70, "back": 10, "up": 50, "down": 10 } }
using System;
using System.Collections.Generic;
using Lumina.Core.Items;
using Lumina.Core.Util;

namespace Lumina.Core.Skills
{
    public enum SkillKind { Attack, Area, Ranged, Movement, Buff, Heal, Passive, Summon }

    public sealed class SkillPrereq { public string Skill; public int Level; }

    /// <summary>当たる範囲（主人公の足元が原点、front は向いている方）。</summary>
    public sealed class HitRange
    {
        public double Front = 70, Back = 10, Up = 60, Down = 10;
        public bool Around; // まわり全部（前後とも Front）
    }

    public sealed class PassiveEffect
    {
        public List<string> Weapons;                 // この武器の時だけ（null = いつも）
        public Dictionary<string, Expr> Stats = new Dictionary<string, Expr>(); // StatBlock のキー → 式
        public Expr Mastery, CritRate, CritDamage, Range;
        public Expr HpRegen, MpRegen, LevelHp, LevelMp, ApHp, ApMp, RopeRegenInterval;
    }

    public sealed class BuffEffect
    {
        public Dictionary<string, Expr> Stats = new Dictionary<string, Expr>();
        public Expr Duration;          // 秒
        public Expr MagicGuard;        // 魔力の盾: MP で受ける割合（%）
        public bool Stealth;           // 闇隠れ
        public Expr HotHp; public double HotInterval = 10; // ひと休み: interval 秒ごとに HP 回復
        public int BoosterStages;      // 加速スキル（攻撃速度の段階を減らす）
        public List<string> Weapons;   // 加速スキル等: この武器の時だけ使える
    }

    public sealed class DebuffEffect
    {
        public Expr Atk, Def, Duration, Chance;
    }

    public sealed class SkillDef
    {
        public string Id, Name, Job, Desc, Element;
        public int Tier, MaxLevel;
        public SkillKind Kind;
        public bool Sample;            // 1 次以外の見本（ヒール・ヘイスト・召喚）
        public readonly List<SkillPrereq> Prereqs = new List<SkillPrereq>();
        public bool PrereqAny;         // 「A 1 または B 1」
        public Expr Mp, Hp, Cooldown;

        // 攻撃
        public Expr Damage;            // 物理の倍率（%）
        public Expr Spell;             // 魔法攻撃力（魔法の式の「スキルの魔法攻撃力」）
        public Expr Fixed;             // 固定ダメージ（石つぶて）
        public Expr Hits, Targets;
        public bool Magic;
        public double? WeaponMul;      // 武器係数の上書き（二つ星投げ: LUK×5.0）
        public List<string> Weapons;   // 使える武器（null = どれでも）
        public HitRange Range = new HitRange();
        public bool UsesAmmo;
        public bool RangeBonus;        // 遠目・鋭い目・銃の心得の射程がのる
        public DebuffEffect Debuff;
        public bool AlwaysCrit;
        public bool Cure;              // 状態異常を治す（意志の力）

        // 移動
        public double DashSpeed;       // 前へ押す速さ（px/秒）

        // 強化・回復・召喚・パッシブ
        public BuffEffect Buff;
        public Expr HealPct;           // 最大 HP の割合（%）
        public Expr HealFlat;
        public Expr SummonSec, SummonHeal; public double SummonHealInterval = 20;
        public readonly List<PassiveEffect> Passives = new List<PassiveEffect>();

        public bool IsActive => Kind != SkillKind.Passive;

        private static Expr E(Dictionary<string, object> d, string k) => J.Has(d, k) ? Expr.Parse(J.Str(d, k)) : null;

        private static List<string> StrListOrNull(Dictionary<string, object> d, string k) => J.Has(d, k) ? J.StrList(d, k) : null;

        private static Dictionary<string, Expr> StatExprs(Dictionary<string, object> d)
        {
            var r = new Dictionary<string, Expr>();
            if (d == null) return r;
            foreach (var kv in d) r[kv.Key] = Expr.Parse(Convert.ToString(kv.Value, System.Globalization.CultureInfo.InvariantCulture));
            return r;
        }

        public static SkillKind ParseKind(string s)
        {
            switch (s)
            {
                case "attack": return SkillKind.Attack;
                case "area": return SkillKind.Area;
                case "ranged": return SkillKind.Ranged;
                case "movement": return SkillKind.Movement;
                case "buff": return SkillKind.Buff;
                case "heal": return SkillKind.Heal;
                case "summon": return SkillKind.Summon;
                default: return SkillKind.Passive;
            }
        }

        public static SkillDef FromDict(Dictionary<string, object> d)
        {
            var s = new SkillDef
            {
                Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Job = J.Str(d, "job", "beginner"), Desc = J.Str(d, "desc", ""),
                Element = J.Str(d, "element"), Tier = J.Int(d, "tier"), MaxLevel = J.Int(d, "maxLevel", 1),
                Kind = ParseKind(J.Str(d, "kind", "passive")), Sample = J.Bool(d, "sample"),
                PrereqAny = J.Bool(d, "prereqAny"),
                Mp = E(d, "mp"), Hp = E(d, "hp"), Cooldown = E(d, "cooldown"),
                Damage = E(d, "damage"), Spell = E(d, "spell"), Fixed = E(d, "fixed"),
                Hits = E(d, "hits"), Targets = E(d, "targets"), Magic = J.Bool(d, "magic"),
                Weapons = StrListOrNull(d, "weapons"), UsesAmmo = J.Bool(d, "ammo"), RangeBonus = J.Bool(d, "rangeBonus"),
                AlwaysCrit = J.Bool(d, "alwaysCrit"), Cure = J.Bool(d, "cure"), DashSpeed = J.Num(d, "dash"),
                HealPct = E(d, "healPct"), HealFlat = E(d, "healFlat"),
                SummonSec = E(d, "summonSec"), SummonHeal = E(d, "summonHeal"), SummonHealInterval = J.Num(d, "summonHealInterval", 20),
            };
            if (J.Has(d, "weaponMul")) s.WeaponMul = J.Num(d, "weaponMul");
            foreach (var o in J.Arr(d, "prereqs"))
            {
                var p = (Dictionary<string, object>)o;
                s.Prereqs.Add(new SkillPrereq { Skill = J.Str(p, "skill"), Level = J.Int(p, "level", 1) });
            }
            var r = J.Obj(d, "range");
            if (r != null)
            {
                s.Range = new HitRange
                {
                    Front = J.Num(r, "front", 70), Back = J.Num(r, "back", 10), Up = J.Num(r, "up", 60), Down = J.Num(r, "down", 10),
                    Around = J.Bool(r, "around"),
                };
            }
            var db = J.Obj(d, "debuff");
            if (db != null) s.Debuff = new DebuffEffect { Atk = E(db, "atk"), Def = E(db, "def"), Duration = E(db, "sec"), Chance = E(db, "chance") };
            var b = J.Obj(d, "buff");
            if (b != null)
            {
                s.Buff = new BuffEffect
                {
                    Stats = StatExprs(J.Obj(b, "stats")), Duration = E(b, "sec"), MagicGuard = E(b, "magicGuard"),
                    Stealth = J.Bool(b, "stealth"), HotHp = E(b, "hotHp"), HotInterval = J.Num(b, "hotInterval", 10),
                    BoosterStages = J.Int(b, "booster"), Weapons = StrListOrNull(b, "weapons"),
                };
            }
            foreach (var o in J.Arr(d, "passive"))
            {
                var p = (Dictionary<string, object>)o;
                s.Passives.Add(new PassiveEffect
                {
                    Weapons = StrListOrNull(p, "weapons"), Stats = StatExprs(J.Obj(p, "stats")),
                    Mastery = E(p, "mastery"), CritRate = E(p, "critRate"), CritDamage = E(p, "critDamage"), Range = E(p, "range"),
                    HpRegen = E(p, "hpRegen"), MpRegen = E(p, "mpRegen"), LevelHp = E(p, "levelHp"), LevelMp = E(p, "levelMp"),
                    ApHp = E(p, "apHp"), ApMp = E(p, "apMp"), RopeRegenInterval = E(p, "ropeRegenInterval"),
                });
            }
            return s;
        }

        public int MpCost(int x, int lv = 0) => Mp == null || x <= 0 ? 0 : Math.Max(0, Mp.EvalInt(x, lv));
        public int HpCost(int x, int lv = 0) => Hp == null || x <= 0 ? 0 : Math.Max(0, Hp.EvalInt(x, lv));
        public int HitCount(int x) => Hits == null ? 1 : Math.Max(1, Hits.EvalInt(x));
        public int TargetCount(int x) => Targets == null ? 1 : Math.Max(1, Targets.EvalInt(x));
        public double CooldownSec(int x) => Cooldown == null ? 0 : Math.Max(0, Cooldown.Eval(x));

        public bool WeaponAllowed(string weaponType)
        {
            if (Weapons == null || Weapons.Count == 0) return true;
            return weaponType != null && Weapons.Contains(weaponType);
        }

        public static StatBlock EvalStats(Dictionary<string, Expr> stats, int x, int lv)
        {
            var sb = new StatBlock();
            foreach (var kv in stats) sb.Set(kv.Key, sb.Get(kv.Key) + kv.Value.EvalInt(x, lv));
            return sb;
        }
    }
}
