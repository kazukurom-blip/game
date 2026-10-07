// 賢者の石のクイズ（JOBS.md 3-3）: 30 問から 5 問。選択肢の順番は毎回混ぜる。全問正解で quiz_cleared。
// 間違えたら闇の水晶だけ失ってやり直し（GameSession.Jobs.cs）。
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Town
{
    public sealed class QuizSession
    {
        public sealed class Item
        {
            public string Id, Question;
            public readonly List<string> Choices = new List<string>();
            public int Answer;           // Choices の何番目が正解か（混ぜた後）
        }

        public readonly List<Item> Questions = new List<Item>();
        public int Index;                // 今の問題（0〜）
        public bool Finished, Passed;

        public Item Current => Index < Questions.Count ? Questions[Index] : null;
        public int Total => Questions.Count;

        public static QuizSession Make(List<QuizQuestion> pool, int count, IRandom rng)
        {
            var s = new QuizSession();
            var idx = new List<int>();
            for (int i = 0; i < pool.Count; i++) idx.Add(i);
            for (int i = idx.Count - 1; i > 0; i--) { int j = rng.Range(0, i); (idx[i], idx[j]) = (idx[j], idx[i]); }
            for (int k = 0; k < count && k < idx.Count; k++)
            {
                var q = pool[idx[k]];
                var it = new Item { Id = q.Id, Question = q.Question };
                var order = new List<int>();
                for (int i = 0; i < q.Choices.Count; i++) order.Add(i);
                for (int i = order.Count - 1; i > 0; i--) { int j = rng.Range(0, i); (order[i], order[j]) = (order[j], order[i]); }
                foreach (var o in order) { if (o == q.Answer) it.Answer = it.Choices.Count; it.Choices.Add(q.Choices[o]); }
                s.Questions.Add(it);
            }
            return s;
        }
    }
}
