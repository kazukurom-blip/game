// スキルの定義（Data/skills.json）。JOBS.md 4 章の全 306 スキル。式の x はスキルの Lv、lv はキャラの Lv。
// skills.json は export_data.mjs が JOBS.md の表（名前・最大Lv・効果・MP・前提）と classic/tools/data/skills.mjs（動き）から書き出す。
//
// 種類（kind）:
//   attack   = 攻撃（前の敵。近く）        area    = 範囲（まわり・複数）
//   ranged   = 遠距離（弓・投げ・弾・魔法）   movement = 移動（突進・早足・テレポート・空中ジャンプ）
//   buff     = 強化（自分にかける）          heal    = 回復
//   passive  = 常に効く                      summon  = 召喚・設置
//
// 例（強打）:
// { "id": "warrior.power_strike", "name": "強打", "job": "warrior", "tier": 1, "kind": "attack", "maxLevel": 20,
//   "mp": "3+floor(x/4)", "damage": "160+5*x", "targets": "1", "hits": "1", "range": { "front": 75, "back": 10, "up": 60, "down": 10 } }
// 2 次以降は "branch"（2 次で選んだ枝の番号）と "jobName"（ファイター など）が付く。★のスキルは "masterLevel"（極意の書の上限）。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
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

    /// <summary>
    /// スキルが付ける状態異常（毒・気絶・凍結 …）の種類・確率・秒数。かける仕組みそのものは Core/Status/（別担当）。
    /// type: poison / stun / darkness / seal / freeze / slow（遅延）/ bind（動けない）/ burn / polymorph（コロ貝に変える）/ charm（錯乱弾: 味方にする = 錯乱）
    /// </summary>
    public sealed class StatusSpec
    {
        public string Type;
        public Expr Chance;   // %（null = 100）
        public Expr Sec;      // 秒
        public Expr Power;    // 強さ（毒 = 最大 HP の %/秒、暗闇 = 命中 -%、遅延 = 速さ -）
        public bool NoBoss;   // ボスにはかからない

        public static List<StatusSpec> List(Dictionary<string, object> d, string key)
        {
            var r = new List<StatusSpec>();
            foreach (var o in J.Arr(d, key))
            {
                var s = (Dictionary<string, object>)o;
                r.Add(new StatusSpec { Type = J.Str(s, "type"), Chance = SkillDef.E(s, "chance"), Sec = SkillDef.E(s, "sec"), Power = SkillDef.E(s, "power"), NoBoss = J.Bool(s, "noBoss") });
            }
            return r;
        }

        public StatusRequest Eval(int x, int lv, string skillId) => new StatusRequest
        {
            Type = Type, Chance = Chance == null ? 100 : Chance.Eval(x, lv), Sec = Sec?.Eval(x, lv) ?? 0, Power = Power?.Eval(x, lv) ?? 0, NoBoss = NoBoss, SkillId = skillId,
        };
    }

    /// <summary>実際にかける時の値（Lv で計算済み）。別担当の状態異常の仕組みへ渡す。</summary>
    public struct StatusRequest
    {
        public string Type, SkillId;
        public double Chance, Sec, Power;
        public bool NoBoss;
        public override string ToString() => Type + " " + Chance + "% " + Sec + "s";
    }

    public sealed class PassiveEffect
    {
        public List<string> Weapons;                 // この武器の時だけ（null = いつも）
        public Dictionary<string, Expr> Stats = new Dictionary<string, Expr>(); // StatBlock のキー → 式
        public Expr Mastery, CritRate, CritDamage, Range;
        public Expr HpRegen, MpRegen, LevelHp, LevelMp, ApHp, ApMp, RopeRegenInterval;
        // 2〜4 次
        public Expr FinalAttackChance, FinalAttackDamage;   // 追撃（%・威力 %）
        public int ComboMax; public Expr ComboDamage, ComboRate; // 闘気の極み（玉の最大 +・玉 1 つの攻撃 +%・たまる確率 +%）
        public Expr DamageTaken;                            // 受けるダメージ -%（不屈）
        public Expr ElementResist; public bool AllElements; // 属性への耐性（魔法のダメージ -%）
        public Expr ResistPierce;                           // 属性への耐性（魔法使い: 耐性のある敵へのダメージの低下を -%）
        public Expr AmpDamage, AmpMp;                       // 属性の増幅（×(1+x/60)）
        public Expr MpEaterChance, MpEaterPct;              // MP 吸収
        public Expr ShieldDefPct;                           // 盾の熟練
        public Expr Guard;                                  // 守りの盾（%）
        public Expr Dodge;                                  // 影の身代わり（%）
        public List<StatusSpec> OnHitStatus = new List<StatusSpec>(); // 毒の星・毒の刃
        public Expr MesoOnHit;                              // お金拾い（%）
        public Expr ExecuteChance, ExecuteHpPct;            // 必殺の一撃
        public Expr StarBundle;                             // クローの熟練: 投げ星の 1 枠に重なる数 +
        public Expr PotionPct, PotionTimePct;               // 調合上手
        public Expr StunCrit;                               // 気絶の極み（TODO(status): 気絶している敵が分かったら）
        public Expr EnergyWatk, EnergyWdef, EnergyHpRegen;  // 気合い（満タンの時）
        public Expr ChainStar;                              // 星の連投（%）
        public Expr StealthAttack; public bool StealthNoSlow; // 影の衣
        public Expr Berserk;                                // 暗黒の力（HP が x% 以下で 2 倍）
    }

    public sealed class BuffEffect
    {
        public Dictionary<string, Expr> Stats = new Dictionary<string, Expr>();
        public Expr Duration;          // 秒
        public Expr MagicGuard;        // 魔力の盾: MP で受ける割合（%）
        public bool Stealth;           // 闇隠れ
        public Expr HotHp; public double HotInterval = 10; // ひと休み: interval 秒ごとに HP 回復
        public int BoosterStages;      // 加速スキル（攻撃速度の段階を減らす）
        public int BoosterStack;       // 神速（加速と重なる）
        public List<string> Weapons;   // 加速スキル等: この武器の時だけ使える
        // 2〜4 次
        public Expr DamagePct;         // ダメージ +%（付与・怒りの解放）
        public string Element;         // 付与の属性
        public bool Charge;            // 付与（同時に 1 つだけ。付与の一撃で消える）
        public List<StatusSpec> OnHitStatus = new List<StatusSpec>(); // 氷の付与
        public Expr StatPct;           // 全能力の加護（STR・DEX・INT・LUK +%）
        public Expr HpPct, MpPct;      // 体力強化（最大 HP・MP +%）
        public Expr ExpPct, MesoPct;   // 聖なる御印・お金の加護
        public Expr CritRate, CritDamage; // 鷹の目
        public bool NoAmmo, NoMp;      // 魂の矢・尽きない星 / 無限の魔力
        public double Infinity;        // 無限の魔力: この秒数ごとに魔法のダメージ +4%
        public Expr MpCostPct;         // 集中の極意: MP 消費 -%
        public Expr Reflect, MagicReflect; // 守りの構え（物理を返す）・魔力の反射
        public bool Invincible;        // 煙玉
        public bool StatusImmune;      // 聖なる盾
        public bool Revive;            // 復活
        public Expr MesoGuardPct, MesoGuardCost; // お金の盾
        public Expr ShadowPartner;     // 影分身（まねる攻撃の威力 %）
        public bool SlowFall;          // 隠れ足（空中でジャンプキーを押している間ゆっくり落ちる）
        public Expr HpDrain; public double HpDrainInterval = 4; // 竜の血
        public int ComboMax; public Expr ComboDamage; // 闘気
        public Expr DamageReduce;      // 聖なる守り（受けるダメージ -%）
        public bool Transform, Ship;   // 変身・乗船
        public Expr ShipHp;            // 乗船: 船の HP（受けたダメージで減り、0 で降りる）
    }

    public sealed class DebuffEffect
    {
        public Expr Atk, Def, DefPct, Duration, Chance;
    }

    /// <summary>召喚した物の攻撃（火の精・銀の鷹・タコの砲台 …）。</summary>
    public sealed class SummonAttackDef
    {
        public Expr Damage, Spell;     // 物理の倍率（%）か魔法攻撃力
        public string Element;
        public Expr Targets;
        public double Interval = 3, Range = 300;
        public bool Once, FrontOnly;
        public List<StatusSpec> Status = new List<StatusSpec>();
    }

    public sealed class SkillDef
    {
        public string Id, Name, Job, JobName, Desc, Element;
        public int Tier, MaxLevel, MasterLevel;
        public int Branch = -1;        // 2 次で選んだ枝（-1 = 系統の全員）
        public SkillKind Kind;
        public bool Sample;            // 見本（今は無い）
        public readonly List<SkillPrereq> Prereqs = new List<SkillPrereq>();
        public bool PrereqAny;         // 「A 1 または B 1」
        public Expr Mp, Hp, HpPct, Meso, Cooldown;

        // 攻撃
        public Expr Damage;            // 物理の倍率（%）
        public Expr Spell;             // 魔法攻撃力（魔法の式の「スキルの魔法攻撃力」）
        public Expr Fixed;             // 固定ダメージ（石つぶて・お金の投げ打ち）
        public Expr Hits, Targets;
        public bool Magic;
        public double? WeaponMul;      // 武器係数の上書き（二つ星投げ: LUK×5.0）
        public List<string> Weapons;   // 使える武器（null = どれでも）
        public HitRange Range = new HitRange();
        public bool UsesAmmo;
        public bool RangeBonus;        // 遠目・鋭い目・銃の心得の射程がのる
        public DebuffEffect Debuff;
        public bool AlwaysCrit;
        public bool Cure;              // 状態異常を治す（意志の力・解除）
        public AttackMotion? Motion;   // 動きの種類（無ければ武器と魔法で決まる）
        public double Delay = 1;       // 1 回の時間 = 攻撃速度の時間 × Delay
        public double Cast;            // 詠唱（秒）。この後に当たる
        public double Charge;          // 溜め（秒）。溜めきった物として ×2
        public int Rapid;              // 押している間 1 秒にこの回数（嵐の連射・弾幕）
        public double Pierce;          // 1 体ごとの威力の増減（%）。鉄の矢 -10・貫く矢 +30・連鎖の雷 -10
        public double Explode;         // 最初の 1 体のまわり（px）に爆発（爆裂矢・爆発弾）
        public double DashTime;        // 突進（DashSpeed で DashTime 秒、前へ）
        public double Push;            // 突撃: 当たった敵を前へ押す（px）
        public bool Knockback;         // 力の解放
        public readonly List<StatusSpec> Status = new List<StatusSpec>();
        public readonly List<StatusSpec> SelfStatus = new List<StatusSpec>(); // 竜の咆哮: 自分は動けない
        public bool IgnoreDef;         // 捨て身
        public Expr InstantKill;       // 天からの鉄槌（ボス以外 %）
        public Expr DrainPct; public double DrainCap = 50; // 吸い取り（与えたダメージの % を HP に、最大で最大 HP の cap%）
        public Expr HealPerHit;        // 天使の光線（当てるたびに最大 HP の %）
        public double SelfDamagePct;   // 捨て身（与えたダメージの % を自分が失う）
        public int ComboUse;           // 闘気を使う: -1 = 全部（1 つ以上要る）、n = n 個
        public List<string> NeedsBuff; // このバフ（どれか）がかかっている時だけ
        public bool NeedsCharge, ConsumeCharge, NeedsEnergy;
        public Expr Pull;              // 怪物の引き寄せ（%）
        public Expr Steal;             // 盗む（%）
        public Expr DispelChance; public string DispelWhat; // 鎧崩し（def）・魔法崩し（magic）・力崩し（atk）・解除（all）: 敵の強化（MobBuffs）を消す
        public Expr MarkDamage, MarkExp, MarkSec; // 狙い撃ち・挑発
        public bool MesoExplosion;     // お金の爆発
        public int TickCount; public double TickInterval; // 忍び寄る影（1 秒ごと 5 回）
        public double StealthMul = 1;  // 暗殺（闇隠れ中 2 倍）
        public double BackJumpVx, BackJumpVy; // 後ろ跳び撃ち
        public Expr Teleport;          // テレポートの距離
        public Expr AirJumpVx, AirJumpVy; // 空中ジャンプ
        public bool Door;              // 秘術の扉（町へ）
        public Expr DecoyHpPct;        // 身代わり人形
        public bool CdReset;           // 時の拳
        public Expr HealMpPct;         // 気合いの回復
        public double HealLuk, HealDex; public Expr HealMul; // 気の回復
        public Expr UndeadSpell, UndeadTargets; public double UndeadRange = 200; // ヒール: まわりの不死の敵
        public double Zone;            // 毒の霧: 当たった所に置いておく秒（中の敵に 1 秒ごとに状態異常をかけ続ける）
        public bool Chainable;         // 星の連投がのる（二つ星投げ）

        // 移動
        public double DashSpeed;       // 前へ押す速さ（px/秒）

        // 強化・回復・召喚・パッシブ
        public BuffEffect Buff;
        public Expr HealPct;           // 最大 HP の割合（%）
        public Expr HealFlat;
        public Expr SummonSec, SummonHeal; public double SummonHealInterval = 20;
        public SummonAttackDef SummonAttack;
        public bool SummonFixed;       // その場に置く（タコの砲台）
        public readonly List<PassiveEffect> Passives = new List<PassiveEffect>();

        public bool IsActive => Kind != SkillKind.Passive;
        public bool IsAttack => Kind == SkillKind.Attack || Kind == SkillKind.Area || Kind == SkillKind.Ranged;
        public bool DealsDamage => Damage != null || Spell != null || Fixed != null || MesoExplosion;
        /// <summary>今の最大 Lv（★は極意の書で MasterLevel まで上がる）。</summary>
        public int CapFor(int bookCap) => MasterLevel > 0 && bookCap > MaxLevel ? Math.Min(MasterLevel, bookCap) : MaxLevel;

        internal static Expr E(Dictionary<string, object> d, string k)
        {
            if (d == null || !J.Has(d, k)) return null;
            var v = d[k];
            if (v is bool) return null;
            return Expr.Parse(Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture));
        }

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

        public static AttackMotion? ParseMotion(string s)
        {
            switch (s)
            {
                case "swing": return AttackMotion.Swing;
                case "stab": return AttackMotion.Stab;
                case "shoot": return AttackMotion.Shoot;
                case "throw": return AttackMotion.Throw;
                case "cast": return AttackMotion.Cast;
                case "punch": return AttackMotion.Punch;
                default: return null;
            }
        }

        public static SkillDef FromDict(Dictionary<string, object> d)
        {
            var s = new SkillDef
            {
                Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Job = J.Str(d, "job", "beginner"), JobName = J.Str(d, "jobName", ""), Desc = J.Str(d, "desc", ""),
                Element = J.Str(d, "element"), Tier = J.Int(d, "tier"), MaxLevel = J.Int(d, "maxLevel", 1), MasterLevel = J.Int(d, "masterLevel"),
                Branch = J.Has(d, "branch") ? J.Int(d, "branch") : -1,
                Kind = ParseKind(J.Str(d, "kind", "passive")), Sample = J.Bool(d, "sample"),
                PrereqAny = J.Bool(d, "prereqAny"),
                Mp = E(d, "mp"), Hp = E(d, "hp"), HpPct = E(d, "hpPct"), Meso = E(d, "meso"), Cooldown = E(d, "cooldown"),
                Damage = E(d, "damage"), Spell = E(d, "spell"), Fixed = E(d, "fixed"),
                Hits = E(d, "hits"), Targets = E(d, "targets"), Magic = J.Bool(d, "magic"),
                Weapons = StrListOrNull(d, "weapons"), UsesAmmo = J.Bool(d, "ammo"), RangeBonus = J.Bool(d, "rangeBonus"),
                AlwaysCrit = J.Bool(d, "alwaysCrit"), Cure = J.Bool(d, "cure"), DashSpeed = J.Num(d, "dash"),
                HealPct = E(d, "healPct"), HealFlat = E(d, "healFlat"),
                SummonSec = E(d, "summonSec"), SummonHeal = E(d, "summonHeal"), SummonHealInterval = J.Num(d, "summonHealInterval", 20),
                Motion = ParseMotion(J.Str(d, "motion")), Delay = J.Num(d, "delay", 1), Cast = J.Num(d, "cast"), Charge = J.Num(d, "charge"),
                Rapid = J.Int(d, "rapid"), Pierce = J.Num(d, "pierce"), Explode = J.Num(d, "explode"), DashTime = J.Num(d, "dashTime"),
                Push = J.Num(d, "push"), Knockback = J.Bool(d, "knockback"), IgnoreDef = J.Bool(d, "ignoreDef"),
                InstantKill = E(d, "instantKill"), HealPerHit = E(d, "healPerHit"), SelfDamagePct = J.Num(d, "selfDamagePct"),
                NeedsBuff = StrListOrNull(d, "needsBuff"), NeedsCharge = J.Bool(d, "needsCharge"), ConsumeCharge = J.Bool(d, "consumeCharge"),
                NeedsEnergy = J.Bool(d, "needsEnergy"), MesoExplosion = J.Bool(d, "mesoExplosion"), StealthMul = J.Num(d, "stealthMul", 1),
                Teleport = E(d, "teleport"), Door = J.Bool(d, "door"), CdReset = J.Bool(d, "cdReset"), HealMpPct = E(d, "healMpPct"),
                SummonFixed = J.Bool(d, "summonFixed"), Zone = J.Num(d, "zone"), Chainable = J.Bool(d, "chainable"),
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
            s.Status.AddRange(StatusSpec.List(d, "status"));
            s.SelfStatus.AddRange(StatusSpec.List(d, "selfStatus"));
            var db = J.Obj(d, "debuff");
            if (db != null) s.Debuff = new DebuffEffect { Atk = E(db, "atk"), Def = E(db, "def"), DefPct = E(db, "defPct"), Duration = E(db, "sec"), Chance = E(db, "chance") };
            var dr = J.Obj(d, "drain");
            if (dr != null) { s.DrainPct = E(dr, "pct"); s.DrainCap = J.Num(dr, "cap", 50); }
            var cb = J.Obj(d, "combo");
            if (cb != null && J.Has(cb, "use")) s.ComboUse = J.Str(cb, "use") == "all" ? -1 : J.Int(cb, "use");
            var pl = J.Obj(d, "pull"); if (pl != null) s.Pull = E(pl, "chance");
            var st = J.Obj(d, "steal"); if (st != null) s.Steal = E(st, "chance");
            var dp = J.Obj(d, "dispel"); if (dp != null) { s.DispelChance = E(dp, "chance"); s.DispelWhat = J.Str(dp, "what"); }
            var mk = J.Obj(d, "mark"); if (mk != null) { s.MarkDamage = E(mk, "damage"); s.MarkExp = E(mk, "exp"); s.MarkSec = E(mk, "sec"); }
            var tk = J.Obj(d, "ticks"); if (tk != null) { s.TickCount = J.Int(tk, "count"); s.TickInterval = J.Num(tk, "interval", 1); }
            var bj = J.Obj(d, "backJump"); if (bj != null) { s.BackJumpVx = J.Num(bj, "vx"); s.BackJumpVy = J.Num(bj, "vy"); }
            var aj = J.Obj(d, "airJump"); if (aj != null) { s.AirJumpVx = E(aj, "vx"); s.AirJumpVy = E(aj, "vy"); }
            var dc = J.Obj(d, "decoy"); if (dc != null) s.DecoyHpPct = E(dc, "hpPct");
            var hs = J.Obj(d, "healStats"); if (hs != null) { s.HealLuk = J.Num(hs, "luk"); s.HealDex = J.Num(hs, "dex"); s.HealMul = E(hs, "mul"); }
            var us = J.Obj(d, "undeadSpell"); if (us != null) { s.UndeadSpell = E(us, "spell"); s.UndeadTargets = E(us, "targets"); s.UndeadRange = J.Num(us, "range", 200); }
            var sa = J.Obj(d, "summonAttack");
            if (sa != null)
            {
                s.SummonAttack = new SummonAttackDef
                {
                    Damage = E(sa, "damage"), Spell = E(sa, "spell"), Element = J.Str(sa, "element"), Targets = E(sa, "targets"),
                    Interval = J.Num(sa, "interval", 3), Range = J.Num(sa, "range", 300), Once = J.Bool(sa, "once"), FrontOnly = J.Bool(sa, "front"),
                };
                s.SummonAttack.Status.AddRange(StatusSpec.List(sa, "status"));
            }
            var b = J.Obj(d, "buff");
            if (b != null)
            {
                s.Buff = new BuffEffect
                {
                    Stats = StatExprs(J.Obj(b, "stats")), Duration = E(b, "sec"), MagicGuard = E(b, "magicGuard"),
                    Stealth = J.Bool(b, "stealth"), HotHp = E(b, "hotHp"), HotInterval = J.Num(b, "hotInterval", 10),
                    BoosterStages = J.Int(b, "booster"), BoosterStack = J.Int(b, "boosterStack"), Weapons = StrListOrNull(b, "weapons"),
                    DamagePct = E(b, "damagePct"), Element = J.Str(b, "element"), Charge = J.Bool(b, "charge"),
                    StatPct = E(b, "statPct"), HpPct = E(b, "hpPct"), MpPct = E(b, "mpPct"), ExpPct = E(b, "expPct"), MesoPct = E(b, "mesoPct"),
                    CritRate = E(b, "critRate"), CritDamage = E(b, "critDamage"), NoAmmo = J.Bool(b, "noAmmo"), NoMp = J.Bool(b, "noMp"),
                    Infinity = J.Num(b, "infinity"), MpCostPct = E(b, "mpCostPct"), Reflect = E(b, "reflect"), MagicReflect = E(b, "magicReflect"),
                    Invincible = J.Bool(b, "invincible"), StatusImmune = J.Bool(b, "statusImmune"), Revive = J.Bool(b, "revive"),
                    ShadowPartner = E(b, "shadowPartner"), SlowFall = J.Bool(b, "slowFall"), DamageReduce = E(b, "damageReduce"),
                    Transform = J.Bool(b, "transform"), Ship = J.Bool(b, "ship"), ShipHp = E(b, "shipHp"),
                };
                s.Buff.OnHitStatus.AddRange(StatusSpec.List(b, "onHitStatus"));
                var mg = J.Obj(b, "mesoGuard"); if (mg != null) { s.Buff.MesoGuardPct = E(mg, "pct"); s.Buff.MesoGuardCost = E(mg, "cost"); }
                var hd = J.Obj(b, "hpDrain"); if (hd != null) { s.Buff.HpDrain = E(hd, "amount"); s.Buff.HpDrainInterval = J.Num(hd, "interval", 4); }
                var co = J.Obj(b, "combo"); if (co != null) { s.Buff.ComboMax = J.Int(co, "max", 5); s.Buff.ComboDamage = E(co, "damage"); }
            }
            foreach (var o in J.Arr(d, "passive"))
            {
                var p = (Dictionary<string, object>)o;
                var pe = new PassiveEffect
                {
                    Weapons = StrListOrNull(p, "weapons"), Stats = StatExprs(J.Obj(p, "stats")),
                    Mastery = E(p, "mastery"), CritRate = E(p, "critRate"), CritDamage = E(p, "critDamage"), Range = E(p, "range"),
                    HpRegen = E(p, "hpRegen"), MpRegen = E(p, "mpRegen"), LevelHp = E(p, "levelHp"), LevelMp = E(p, "levelMp"),
                    ApHp = E(p, "apHp"), ApMp = E(p, "apMp"), RopeRegenInterval = E(p, "ropeRegenInterval"),
                    DamageTaken = E(p, "damageTaken"), ElementResist = E(p, "elementResist"), AllElements = J.Bool(p, "allElements"),
                    ResistPierce = E(p, "resistPierce"), ShieldDefPct = E(p, "shieldDefPct"), Guard = E(p, "guard"), Dodge = E(p, "dodge"),
                    MesoOnHit = E(p, "mesoOnHit"), StarBundle = E(p, "starBundle"), PotionPct = E(p, "potionPct"), PotionTimePct = E(p, "potionTimePct"),
                    StunCrit = E(p, "stunCrit"), ChainStar = E(p, "chainStar"), StealthAttack = E(p, "stealthAttack"),
                    StealthNoSlow = J.Bool(p, "stealthNoSlow"), Berserk = E(p, "berserk"),
                };
                var fa = J.Obj(p, "finalAttack"); if (fa != null) { pe.FinalAttackChance = E(fa, "chance"); pe.FinalAttackDamage = E(fa, "damage"); }
                var co = J.Obj(p, "combo"); if (co != null) { pe.ComboMax = J.Int(co, "max"); pe.ComboDamage = E(co, "damage"); pe.ComboRate = E(co, "rate"); }
                var am = J.Obj(p, "amp"); if (am != null) { pe.AmpDamage = E(am, "damage"); pe.AmpMp = E(am, "mp"); }
                var me = J.Obj(p, "mpEater"); if (me != null) { pe.MpEaterChance = E(me, "chance"); pe.MpEaterPct = E(me, "pct"); }
                var ex = J.Obj(p, "execute"); if (ex != null) { pe.ExecuteChance = E(ex, "chance"); pe.ExecuteHpPct = E(ex, "hpPct"); }
                var en = J.Obj(p, "energy"); if (en != null) { pe.EnergyWatk = E(en, "watk"); pe.EnergyWdef = E(en, "wdef"); pe.EnergyHpRegen = E(en, "hpRegen"); }
                pe.OnHitStatus.AddRange(StatusSpec.List(p, "onHitStatus"));
                s.Passives.Add(pe);
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
