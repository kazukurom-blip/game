// セーブ→読み込みで同じ状態になるか。決めた間隔（ゲームの中の時間）で、
//   SaveNow（メモリの上のファイル。壊れない書き方の手順も通る）→ GameSession.Load → もう一度セーブの形にして比べる。
// 違っていたら問題として記録し、読み込んだ方で遊び続ける（読み込んだ後も遊べるかも確かめる）。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Game;
using Lumina.Core.Save;
using Lumina.Core.Town;
using Lumina.Core.Util;

namespace Lumina.PlayBot
{
    public sealed partial class Bot
    {
        public double SaveCheckEvery = 1800;
        private double nextSaveCheck = 600;
        private MemoryFileSystem saveFs;
        private SaveStore saveStore;

        private void MaybeSaveCheck()
        {
            if (Sec < nextSaveCheck) return;
            if (S.Dead || S.CurrentRoom != null || S.Quiz != null) return;
            nextSaveCheck = Sec + SaveCheckEvery;
            SaveCheck();
        }

        public bool SaveCheck()
        {
            SaveChecks++;
            if (saveStore == null) { saveFs = new MemoryFileSystem(); saveStore = new SaveStore(saveFs, "saves"); }
            if (S.Store == null) S.AttachSave(saveStore, "bot");
            var r = S.SaveNow("bot");
            if (!r.Ok) { Note("save", "write", "セーブできない: " + r.Error); SaveMismatches++; return false; }
            string j1 = SaveSerializer.ToJson(S.ToSaveData("bot"));
            string acc1 = AccountData.ToJson(S.Storage);
            var before = Snapshot(S);
            var g = GameSession.Load(D, saveStore, "bot", out var lr);
            if (g == null) { Note("save", "load", "読めない: " + string.Join(" / ", lr.Problems)); SaveMismatches++; return false; }
            g.Clock = S.Clock;
            string j2 = SaveSerializer.ToJson(g.ToSaveData("bot"));
            string acc2 = AccountData.ToJson(g.Storage);
            var after = Snapshot(g);
            var diffs = new List<string>();
            bool buffs = S.Buffs.List.Count > 0 || S.Status.Any; // バフ・状態異常はクラシックどおり保存しない（能力値が変わるのは正しい）
            bool air = !S.Body.OnGround; // 空中で保存すると、読み込んだ時は足場に立たせる（正しい）
            foreach (var k in JsonDiff(j1, j2))
                if (!(buffs && (k.EndsWith("hp") || k.EndsWith("mp"))) && !(air && k.Contains("location"))) diffs.Add(k);
            if (acc1 != acc2) diffs.Add("account（倉庫）");
            foreach (var kv in before)
                if (!after.TryGetValue(kv.Key, out var v) || v != kv.Value)
                    if (!(buffs && kv.Key.StartsWith("stats."))) diffs.Add(kv.Key + ": " + kv.Value + " → " + v);
            if (diffs.Count > 0)
            {
                SaveMismatches++;
                Note("save", string.Join(",", diffs.Take(3)), "セーブ→読み込みで変わった: " + string.Join(" / ", diffs.Take(8)) + "（" + DescribeHere() + "）");
            }
            // 読み込んだ方で続ける
            S = g;
            HookSession();
            Reloads++;
            return diffs.Count == 0;
        }

        private static Dictionary<string, string> Snapshot(GameSession s)
        {
            var d = new Dictionary<string, string>();
            var st = s.Stats;
            d["stats.maxhp"] = st.MaxHp.ToString(); d["stats.maxmp"] = st.MaxMp.ToString();
            d["stats.watk"] = st.Watk.ToString(); d["stats.magic"] = st.MagicPower.ToString();
            d["stats.wdef"] = st.Wdef.ToString(); d["stats.mdef"] = st.Mdef.ToString();
            d["stats.acc"] = st.Acc.ToString("0.###"); d["stats.avoid"] = st.Avoid.ToString("0.###");
            d["stats.speed"] = st.Speed.ToString(); d["stats.jump"] = st.Jump.ToString();
            d["stats.stage"] = st.AttackStage.ToString(); d["stats.range"] = st.Range.Min + "-" + st.Range.Max;
            d["job"] = s.Character.JobName; d["level"] = s.Character.Level.ToString(); d["exp"] = s.Character.Exp.ToString();
            d["map"] = s.Map.Data.Id;
            d["meso"] = s.Inventory.Meso.ToString();
            d["quests"] = string.Join(",", s.Quests.Entries.OrderBy(k => k.Key).Select(k => k.Key + ":" + k.Value.Status + ":" + string.Join("+", k.Value.Counts.OrderBy(c => c.Key).Select(c => c.Key + "=" + c.Value))));
            d["skills"] = string.Join(",", s.Skills.Levels.OrderBy(k => k.Key).Select(k => k.Key + "=" + k.Value));
            d["pets"] = string.Join(",", s.Pets.Select(p => p.Kind + ":" + p.Fullness + ":" + p.Points + ":" + p.Out));
            d["flags"] = string.Join(",", s.Flags.OrderBy(k => k.Key).Select(k => k.Key + "=" + k.Value));
            d["storage.slots"] = s.Storage.Slots.ToString(); d["storage.meso"] = s.Storage.Meso.ToString();
            return d;
        }

        /// <summary>2 つの JSON の違う所（キーの道）。savedAt・reason は見ない。</summary>
        public static List<string> JsonDiff(string a, string b)
        {
            var list = new List<string>();
            Diff("", Json.Parse(a), Json.Parse(b), list);
            list.RemoveAll(k => k.EndsWith("savedAt") || k.EndsWith("reason") || k.EndsWith("crc32") || k.EndsWith("length") || k.EndsWith(".seq"));
            return list;
        }

        private static void Diff(string path, object x, object y, List<string> outList)
        {
            if (outList.Count > 50) return;
            if (x is Dictionary<string, object> dx && y is Dictionary<string, object> dy)
            {
                foreach (var k in dx.Keys.Union(dy.Keys))
                {
                    dx.TryGetValue(k, out var vx); dy.TryGetValue(k, out var vy);
                    Diff(path == "" ? k : path + "." + k, vx, vy, outList);
                }
                return;
            }
            if (x is List<object> lx && y is List<object> ly)
            {
                if (lx.Count != ly.Count) { outList.Add(path + "[数 " + lx.Count + "→" + ly.Count + "]"); return; }
                for (int i = 0; i < lx.Count; i++) Diff(path + "[" + i + "]", lx[i], ly[i], outList);
                return;
            }
            string sx = x == null ? "null" : Convert.ToString(x, System.Globalization.CultureInfo.InvariantCulture);
            string sy = y == null ? "null" : Convert.ToString(y, System.Globalization.CultureInfo.InvariantCulture);
            if (sx != sy) outList.Add(path);
        }
    }
}
