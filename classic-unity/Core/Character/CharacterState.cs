// キャラの育ち（JOBS.md 2 章・STATS.md 6 章）: Lv・経験値・AP（手で振る）・SP（段階ごとの財布）・HP/MP の上がり方・転職・死んだ時。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Util;

namespace Lumina.Core.Character
{
    /// <summary>スキル（パッシブ）から来る育ちのおまけ。SkillBook が作る。</summary>
    public struct GrowthBonus
    {
        public int LevelHp;   // 最大HPアップ: +2x
        public int LevelMp;   // 最大MPアップ: +x
        public int ApHp;      // 最大HPアップ: AP を HP に振った時 +x
        public int ApMp;
    }

    public sealed class LevelUpInfo
    {
        public int NewLevel, HpGain, MpGain, ApGain, SpGain, SpTier;
    }

    public enum AdvanceResult { Ok, AlreadyAdvanced, LevelTooLow, StatTooLow, UnknownJob, WrongNpc }

    public sealed class CharacterState
    {
        public string Name = "ぼうけんしゃ";
        public string Line = JobLine.Beginner;
        public int Tier;            // 0 = 初心者, 1〜4
        public int Branch;          // 2 次で選んだ枝
        public int Level = 1;
        public long Exp;
        public int Str = 4, Dex = 4, Int = 4, Luk = 4;
        public int Ap;
        public readonly int[] Sp = new int[5];
        public int BaseMaxHp = 50, BaseMaxMp = 5;  // JOBS.md 2-2「最初の HP 50・MP 5」
        public int Hp = 50, Mp = 5;
        public int ApHpCount, ApMpCount;          // HP/MP に振った AP の数（振り直し用）

        public JobInfo Job => Jobs.Get(Line);
        public string JobName => Jobs.DisplayName(Line, Tier, Branch);
        public long ExpToNext => Curves.ExpToNext(Level);
        public double ExpPercent => ExpToNext <= 0 ? 0 : (double)Exp / ExpToNext * 100;

        public int GetStat(Stat s)
        {
            switch (s)
            {
                case Stat.STR: return Str;
                case Stat.DEX: return Dex;
                case Stat.INT: return Int;
                case Stat.LUK: return Luk;
                default: return 0;
            }
        }

        /// <summary>キャラ作りのサイコロ（合計 25、各 4 以上）。</summary>
        public void RollStats(IRandom rng)
        {
            int[] v = { 4, 4, 4, 4 };
            for (int i = 0; i < 9; i++) v[rng.Range(0, 3)]++;
            Str = v[0]; Dex = v[1]; Int = v[2]; Luk = v[3];
        }

        // ---------------- 経験値と Lv

        /// <summary>
        /// 経験値を足す。クラシックどおり 1 回で上がる Lv は 1 つだけ（あふれた分は「次の Lv の必要量 − 1」まで残す）。
        /// 上がった時はその情報を返す（上がらなければ null）。
        /// </summary>
        public LevelUpInfo GainExp(long amount, IRandom rng, GrowthBonus bonus)
        {
            if (amount <= 0 || Level >= Curves.MaxLevel) return null;
            Exp += amount;
            long need = ExpToNext;
            if (Exp < need) return null;
            long rest = Exp - need;
            var info = LevelUp(rng, bonus);
            long nextNeed = ExpToNext;
            Exp = nextNeed <= 0 ? 0 : Math.Min(rest, nextNeed - 1);
            return info;
        }

        /// <summary>Lv を 1 上げる（HP/MP が増え、AP 5・SP をもらい、HP/MP は全部回復）。</summary>
        public LevelUpInfo LevelUp(IRandom rng, GrowthBonus bonus)
        {
            if (Level >= Curves.MaxLevel) return null;
            Level++;
            var j = Job;
            int hp = rng.Range(j.HpMin, j.HpMax) + bonus.LevelHp;
            int mp = rng.Range(j.MpMin, j.MpMax) + bonus.LevelMp;
            if (Line == JobLine.Magician) mp += bonus.LevelMp > 0 ? Int / 10 : Int / 20;
            BaseMaxHp += hp; BaseMaxMp += mp;
            Ap += 5;
            int sp = 0;
            if (Tier == 0) { if (Level >= 2 && Level <= 7) sp = 1; }
            else sp = 3;
            Sp[Math.Min(4, Tier)] += sp;
            Hp = BaseMaxHp; Mp = BaseMaxMp; // 装備の分は GameSession が上限に合わせて回復する
            return new LevelUpInfo { NewLevel = Level, HpGain = hp, MpGain = mp, ApGain = 5, SpGain = sp, SpTier = Math.Min(4, Tier) };
        }

        // ---------------- AP（自動で振る機能は無い。全部手で振る）

        public bool SpendAp(Stat s)
        {
            if (Ap <= 0) return false;
            switch (s)
            {
                case Stat.STR: Str++; break;
                case Stat.DEX: Dex++; break;
                case Stat.INT: Int++; break;
                case Stat.LUK: Luk++; break;
                default: return false;
            }
            Ap--;
            return true;
        }

        public bool SpendApHp(GrowthBonus bonus)
        {
            if (Ap <= 0) return false;
            Ap--; ApHpCount++;
            BaseMaxHp += Job.ApHp + bonus.ApHp;
            return true;
        }

        public bool SpendApMp(GrowthBonus bonus)
        {
            if (Ap <= 0) return false;
            Ap--; ApMpCount++;
            BaseMaxMp += Job.ApMp + bonus.ApMp;
            return true;
        }

        /// <summary>AP 振り直しの書: from から 1 点戻して to へ。必要な最低値（4）を割らない。</summary>
        public bool ResetAp(Stat from, Stat to)
        {
            if (from == to || from == Stat.None || to == Stat.None) return false;
            if (GetStat(from) <= 4) return false;
            switch (from) { case Stat.STR: Str--; break; case Stat.DEX: Dex--; break; case Stat.INT: Int--; break; case Stat.LUK: Luk--; break; }
            switch (to) { case Stat.STR: Str++; break; case Stat.DEX: Dex++; break; case Stat.INT: Int++; break; case Stat.LUK: Luk++; break; }
            return true;
        }

        // ---------------- 転職

        public AdvanceResult CanAdvanceFirst(string line)
        {
            if (Tier > 0) return AdvanceResult.AlreadyAdvanced;
            var j = Jobs.Get(line);
            if (j == Jobs.Beginner) return AdvanceResult.UnknownJob;
            if (Level < j.AdvLevel) return AdvanceResult.LevelTooLow;
            if (GetStat(j.AdvStat) < j.AdvValue) return AdvanceResult.StatTooLow;
            return AdvanceResult.Ok;
        }

        /// <summary>1 次転職。HP/MP のボーナス・SP +1（JOBS.md 2-2・2-3）。持ち物の枠 +4 は GameSession が行う。</summary>
        public AdvanceResult AdvanceFirst(string line, IRandom rng)
        {
            var r = CanAdvanceFirst(line);
            if (r != AdvanceResult.Ok) return r;
            Line = line; Tier = 1;
            if (line == JobLine.Warrior) BaseMaxHp += rng.Range(200, 250);
            else if (line == JobLine.Magician) BaseMaxMp += rng.Range(100, 150);
            else { BaseMaxHp += 100; BaseMaxMp += 25; }
            Sp[1] += 1;
            return AdvanceResult.Ok;
        }

        /// <summary>2〜4 次転職（試験は別。ここは数値だけ）。</summary>
        public AdvanceResult AdvanceTier(int branch)
        {
            if (Tier < 1 || Tier >= 4) return AdvanceResult.AlreadyAdvanced;
            int next = Tier + 1;
            if (Level < Jobs.TierLevel(next)) return AdvanceResult.LevelTooLow;
            Tier = next;
            if (next == 2) Branch = branch;
            double mul = next == 2 ? 1 : 1.5;
            if (Line == JobLine.Warrior) BaseMaxHp += (int)(300 * mul);
            else if (Line == JobLine.Magician) BaseMaxMp += (int)(450 * mul);
            else { BaseMaxHp += (int)(300 * mul); BaseMaxMp += (int)(150 * mul); }
            Sp[next] += 1;
            if (next >= 3) Ap += 5;
            return AdvanceResult.Ok;
        }

        // ---------------- 死んだ時

        /// <summary>
        /// 死んだ時に失う経験値（STATS.md 6-2）。初心者は 0。1 次以上は「次まで」の 10%（町・1 人用ダンジョンの中は 1%）。
        /// 経験値は 0 より下がらない（Lv は下がらない）。
        /// </summary>
        public long DeathExpLoss(bool safeZone)
        {
            if (Tier == 0 || Line == JobLine.Beginner) return 0;
            long need = ExpToNext;
            long loss = (long)Math.Floor(need * (safeZone ? 0.01 : 0.10));
            return Math.Min(loss, Exp);
        }

        public long ApplyDeath(bool safeZone, bool hasCharm)
        {
            long loss = hasCharm ? 0 : DeathExpLoss(safeZone);
            Exp -= loss;
            return loss;
        }
    }
}
