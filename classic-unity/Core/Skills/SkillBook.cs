// 覚えたスキルと Lv（JOBS.md 2-3）: SP で上げる・段階ごとの財布・前提スキル・待ち時間。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Data;

namespace Lumina.Core.Skills
{
    public enum LearnResult { Ok, UnknownSkill, WrongJob, TierTooLow, MaxLevel, NoSp, PrereqMissing }

    public sealed class SkillBook
    {
        private readonly GameData data;
        public readonly Dictionary<string, int> Levels = new Dictionary<string, int>();
        public readonly Dictionary<string, double> Cooldowns = new Dictionary<string, double>();

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

        /// <summary>その職がこのスキルの系統か（初心者のスキルは全員が持てる）。</summary>
        public static bool JobMatches(SkillDef s, CharacterState c)
        {
            if (s.Job == JobLine.Beginner) return true;
            return s.Job == c.Line;
        }

        public LearnResult CanLearn(string id, CharacterState c)
        {
            var s = data.Skill(id);
            if (s == null) return LearnResult.UnknownSkill;
            if (!JobMatches(s, c)) return LearnResult.WrongJob;
            if (c.Tier < s.Tier) return LearnResult.TierTooLow;
            if (Level(id) >= s.MaxLevel) return LearnResult.MaxLevel;
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
