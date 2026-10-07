// 覚えたスキルと Lv（JOBS.md 2-3）: SP で上げる・段階ごとの財布・前提スキル・待ち時間。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Data;
using Lumina.Core.Util;

namespace Lumina.Core.Skills
{
    public enum LearnResult { Ok, UnknownSkill, WrongJob, TierTooLow, MaxLevel, NoSp, PrereqMissing }

    public sealed class SkillBook
    {
        private readonly GameData data;
        public readonly Dictionary<string, int> Levels = new Dictionary<string, int>();
        public readonly Dictionary<string, double> Cooldowns = new Dictionary<string, double>();
        /// <summary>極意の書で上がった最大 Lv（★のスキルだけ。JOBS.md 2-3）。</summary>
        public readonly Dictionary<string, int> Masters = new Dictionary<string, int>();

        public SkillBook(GameData data) { this.data = data; }

        public int Level(string id) => id != null && Levels.TryGetValue(id, out var l) ? l : 0;

        public IEnumerable<(SkillDef def, int level)> Learned()
        {
            foreach (var kv in Levels)
            {
                var d = data.Skill(kv.Key);
                if (d != null && kv.Value > 0) yield return (d, kv.Value);
            }
        }

        /// <summary>その職がこのスキルの系統か（初心者のスキルは全員が持てる）。2 次以降は 2 次で選んだ枝も同じ時だけ。</summary>
        public static bool JobMatches(SkillDef s, CharacterState c)
        {
            if (s.Job == JobLine.Beginner) return true;
            if (s.Job != c.Line) return false;
            return s.Branch < 0 || s.Branch == c.Branch;
        }

        /// <summary>今の最大 Lv（★は極意の書を使うと上がる）。</summary>
        public int MaxLevel(SkillDef s) => s.CapFor(Masters.TryGetValue(s.Id, out var m) ? m : 0);

        /// <summary>極意の書（20 / 30）。成功すると最大 Lv が cap に上がる（今の上限より上の書だけ。失敗しても書は無くなる）。</summary>
        public bool UseMasteryBook(string id, int cap, double successRate, IRandom rng)
        {
            var s = data.Skill(id);
            if (s == null || s.MasterLevel <= 0 || cap <= MaxLevel(s) || cap > s.MasterLevel) return false;
            if (!rng.Chance(successRate)) return false;
            Masters[id] = cap;
            return true;
        }

        public LearnResult CanLearn(string id, CharacterState c)
        {
            var s = data.Skill(id);
            if (s == null) return LearnResult.UnknownSkill;
            if (!JobMatches(s, c)) return LearnResult.WrongJob;
            if (c.Tier < s.Tier) return LearnResult.TierTooLow;
            if (Level(id) >= MaxLevel(s)) return LearnResult.MaxLevel;
            if (c.Sp[s.Tier] <= 0) return LearnResult.NoSp;
            if (s.Prereqs.Count > 0)
            {
                bool any = false, all = true;
                foreach (var p in s.Prereqs)
                {
                    bool ok = Level(p.Skill) >= p.Level;
                    any |= ok; all &= ok;
                }
                if (s.PrereqAny ? !any : !all) return LearnResult.PrereqMissing;
            }
            return LearnResult.Ok;
        }

        /// <summary>SP を 1 使って Lv を 1 上げる。SP はそのスキルの段階の財布から引く。</summary>
        public LearnResult Learn(string id, CharacterState c)
        {
            var r = CanLearn(id, c);
            if (r != LearnResult.Ok) return r;
            var s = data.Skill(id);
            c.Sp[s.Tier]--;
            Levels[id] = Level(id) + 1;
            return LearnResult.Ok;
        }

        /// <summary>SP 振り直しの書: その段階の SP を全部戻す。</summary>
        public int ResetTier(int tier, CharacterState c)
        {
            int back = 0;
            var ids = new List<string>(Levels.Keys);
            foreach (var id in ids)
            {
                var s = data.Skill(id);
                if (s == null || s.Tier != tier) continue;
                back += Levels[id];
                Levels.Remove(id);
            }
            c.Sp[tier] += back;
            return back;
        }

        public GrowthBonus Growth(int charLevel)
        {
            var g = new GrowthBonus();
            foreach (var (def, lv) in Learned())
            {
                foreach (var p in def.Passives)
                {
                    if (p.LevelHp != null) g.LevelHp += p.LevelHp.EvalInt(lv, charLevel);
                    if (p.LevelMp != null) g.LevelMp += p.LevelMp.EvalInt(lv, charLevel);
                    if (p.ApHp != null) g.ApHp += p.ApHp.EvalInt(lv, charLevel);
                    if (p.ApMp != null) g.ApMp += p.ApMp.EvalInt(lv, charLevel);
                }
            }
            return g;
        }

        public double CooldownLeft(string id) => Cooldowns.TryGetValue(id, out var t) ? t : 0;

        public void Tick(double dt)
        {
            if (Cooldowns.Count == 0) return;
            var keys = new List<string>(Cooldowns.Keys);
            foreach (var k in keys)
            {
                double t = Cooldowns[k] - dt;
                if (t <= 0) Cooldowns.Remove(k); else Cooldowns[k] = t;
            }
        }
    }
}
