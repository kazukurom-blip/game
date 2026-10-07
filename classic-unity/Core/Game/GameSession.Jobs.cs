// 2〜4 次の転職の試験（JOBS.md 3 章・QUESTS.md 3 章）・賢者の石のクイズ・極意の書（GameSession の続き）。
//
// 流れ（J1 = 戦士 の場合。ほかの系統も同じ）:
//   2 次: J1-2 転職官に話す → 推薦状 / J1-3 修練場（V413）で試しの珠 30 個（20 分。時間切れ・外に出るとやり直し）→ 試験の証
//         / J1-4 転職官に試験の証を渡して AdvanceJob2(枝) → job_advance.2
//   3 次: J1-5 長老の手紙 / J1-6 修験の雪洞（F118、次元の扉。試験の間だけ入れる・20 分）でもう一人の自分 → 黒いお守り
//         / J1-7 賢者の石（F107）に黒いお守りと闇の水晶を捧げ、5 問のクイズ → 完了すると 3 次の職（job_advance.3）
//   4 次: J1-8 大老への推薦状 / J1-9 紅翼の主・蒼翼の主（試験中は印を必ず落とす）→ 完了すると 4 次の職（job_advance.4）
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Town;

namespace Lumina.Core.Game
{
    public enum QuizStartResult { Ok, NotOnQuest, MissingItems, AlreadyRunning }
    public enum MasterBookResult { Ok, Failed, Invalid }

    public sealed partial class GameSession
    {
        /// <summary>
        /// 2 次転職（Lv30・試験の証を渡して枝を選ぶ）。branch は 0 始まり（戦士: 0 ファイター / 1 ページ / 2 スピアマン）。
        /// 持ち物の枠 +4、job_advance.2 を知らせる（J?-4 の目的）。
        /// </summary>
        public AdvanceResult AdvanceJob2(int branch)
        {
            var jobs = Data.Systems.Jobs;
            if (Character.Tier != 1) return AdvanceResult.AlreadyAdvanced;
            var names = Character.Job.Tier2Names;
            if (names == null || branch < 0 || branch >= names.Length) return AdvanceResult.UnknownJob;
            if (Character.Level < Math.Max(jobs.Tier2Level, Jobs.TierLevel(2))) return AdvanceResult.LevelTooLow;
            if (!Inventory.Has(jobs.Proof)) return AdvanceResult.StatTooLow; // 試験の証が無い
            var r = Character.AdvanceTier(branch);
            if (r != AdvanceResult.Ok) return r;
            Inventory.Remove(jobs.Proof);
            AfterAdvance(2);
            return r;
        }

        private void AfterAdvance(int tier)
        {
            int plus = Data.Systems.Jobs.InventoryPlus;
            Inventory.Expand(InvTab.Equip, plus); Inventory.Expand(InvTab.Use, plus); Inventory.Expand(InvTab.Etc, plus);
            RefreshStats();
            Out.Add(GameEventType.JobAdvanced, Character.Line, tier, text: Character.JobName);
            QuestEvent("job_advance." + tier);
            AutoSave.Request("job");
        }

        /// <summary>クエストを完了した時（FinishQuest から）: 3・4 次の転職、倉庫の枠・2 匹目のペットを開く、試験の部屋の時間を止める。</summary>
        private void OnQuestFinishedTown(QuestDef q)
        {
            if (q.Advance >= 3 && Character.Tier == q.Advance - 1)
            {
                if (Character.AdvanceTier(Character.Branch) == AdvanceResult.Ok) AfterAdvance(q.Advance);
                else Out.Add(GameEventType.Message, q.Id, text: "まだ転職できない（Lv " + Jobs.TierLevel(q.Advance) + " から）");
            }
            switch (q.Unlock)
            {
                case null: break;
                case "storage+4":
                    var rules = Data.Systems.Storage;
                    Storage.Slots = Math.Min(rules.MaxSlots, Storage.Slots + rules.Step);
                    OnStorageChanged(null, 0);
                    break;
                default:
                    Flags[q.Unlock] = true;
                    break;
            }
            var room = CurrentRoom;
            if (room != null && room.TimerQuest == q.Id) roomTimerOn = false; // 試験に受かった
        }

        // ---------------- 賢者の石のクイズ（JOBS.md 3-3）

        /// <summary>今のクイズ（null = していない）。Unity の会話の窓は Quiz.Current（問題・選択肢）を出し、AnswerQuiz で答える。</summary>
        public QuizSession Quiz { get; private set; }

        /// <summary>「クイズに答える」目的のあるクエストを進めている（まだ答えていない）。</summary>
        private bool QuizWanted()
        {
            foreach (var q in Quests.InProgress())
                for (int i = 0; i < q.Objectives.Count; i++)
                    if (q.Objectives[i].Type == ObjectiveType.Event && q.Objectives[i].Target == "quiz_cleared" && Quests.Count(q, i, Inventory) < q.Objectives[i].Count) return true;
            return false;
        }

        /// <summary>クイズを始める（賢者の石を調べると自動で始まる）。黒いお守りと闇の水晶が要る。</summary>
        public QuizStartResult StartQuiz()
        {
            if (Quiz != null) return QuizStartResult.AlreadyRunning;
            if (!QuizWanted()) return QuizStartResult.NotOnQuest;
            var jobs = Data.Systems.Jobs;
            foreach (var it in jobs.QuizNeedItems)
                if (!Inventory.Has(it)) { Out.Add(GameEventType.Message, it, text: (Data.Item(it)?.Name ?? it) + "が要る"); return QuizStartResult.MissingItems; }
            Quiz = QuizSession.Make(Data.Systems.Quiz, jobs.QuizCount, Rng);
            AnnounceQuiz();
            return QuizStartResult.Ok;
        }

        private void AnnounceQuiz()
        {
            var c = Quiz.Current;
            if (c != null) Out.Add(GameEventType.QuizQuestion, c.Id, Quiz.Index + 1, text: c.Question);
        }

        /// <summary>答える（choice = Quiz.Current.Choices の何番目か）。正解なら true。間違えると闇の水晶を失って終わり（やり直し）。</summary>
        public bool AnswerQuiz(int choice)
        {
            var c = Quiz?.Current;
            if (c == null) return false;
            bool ok = choice == c.Answer;
            Out.Add(GameEventType.QuizAnswered, c.Id, ok ? 1 : 0);
            if (!ok)
            {
                var lose = Data.Systems.Jobs.QuizLoseOnWrong;
                if (lose != null && Inventory.Remove(lose)) Out.Add(GameEventType.Message, lose, text: (Data.Item(lose)?.Name ?? lose) + "が砕けた。もう一度やり直す");
                Quiz.Finished = true;
                Quiz = null;
                return false;
            }
            Quiz.Index++;
            if (Quiz.Index >= Quiz.Total)
            {
                Quiz.Finished = true; Quiz.Passed = true;
                Quiz = null;
                Out.Add(GameEventType.QuizCleared);
                QuestEvent("quiz_cleared");
                return true;
            }
            AnnounceQuiz();
            return true;
        }

        // ---------------- 極意の書（4 次の★スキルの上限）

        /// <summary>極意の書を使う。選んだ★スキルの上限が上がる（失敗しても書は無くなる）。使えない組み合わせなら Invalid（書は残る）。</summary>
        public MasterBookResult UseMasterBook(string itemId, string skillId)
        {
            var def = Data.Item(itemId);
            var s = Data.Skill(skillId);
            if (def == null || def.MasterBookCap <= 0 || !Inventory.Has(itemId) || s == null || s.MasterLevel <= 0) return MasterBookResult.Invalid;
            if (Skills.CanLearn(skillId, Character) == Lumina.Core.Skills.LearnResult.WrongJob) return MasterBookResult.Invalid;
            if (def.MasterBookCap <= Skills.MaxLevel(s) || def.MasterBookCap > s.MasterLevel) return MasterBookResult.Invalid;
            Inventory.Remove(itemId);
            bool ok = Skills.UseMasteryBook(skillId, def.MasterBookCap, def.MasterBookRate, Rng);
            Out.Add(GameEventType.ItemUsed, itemId, ok ? 1 : 0, text: ok ? s.Name + "の上限が " + def.MasterBookCap + " になった" : "極意の書は失敗した");
            return ok ? MasterBookResult.Ok : MasterBookResult.Failed;
        }
    }
}
