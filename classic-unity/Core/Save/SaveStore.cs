// セーブのファイル（書き込みの途中で落ちても壊れない）。
//
// ファイル（枠 "char1" の場合。dir の下）:
//   char1.json        … 今のセーブ
//   char1.json.tmp    … 書いている途中の新しいセーブ（書き終えて確かめてから char1.json と入れ替える）
//   char1.json.bak1〜3 … 前の版のバックアップ 3 つ（bak1 が一番新しい）
//
// 1 つのファイルの形（全体が 1 つの JSON）:
//   {"format":"lumina-save","seq":12,"length":3456,"crc32":"89abcdef","data":{ …SaveSerializer の JSON… }}
//   - seq: 保存するたびに 1 ずつ増える番号（どれが新しいかを決める）
//   - length / crc32: data の部分の長さと CRC32。途中で切れた・壊れたファイルを見分ける
//
// 書く順番（どこで落ちても「前の版」か「新しい版」のどちらかが必ず読める）:
//   1. .tmp に書いて fsync → 2. .tmp を読み直して確かめる → 3. bak3 を消す → 4. bak2→bak3 → 5. bak1→bak2
//   → 6. 今のセーブを bak1 へコピー → 7. .tmp を今のセーブへ一度に置き換える
// 読む順番: 今のセーブと .tmp のうち、壊れていなくて seq の大きい方。どちらも壊れていたら bak1 → bak2 → bak3。
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Lumina.Core.Util;

namespace Lumina.Core.Save
{
    public sealed class SaveResult
    {
        public bool Ok;
        public string Error;
        public long Seq;
        public override string ToString() => Ok ? "保存した（" + Seq + "）" : "保存できなかった: " + Error;
    }

    public sealed class LoadResult
    {
        public SaveData Data;
        public string Source;         // main / tmp / bak1 / bak2 / bak3
        public bool Recovered;        // 今のセーブが使えず、ほかから戻した
        public readonly List<string> Problems = new List<string>();
        public bool Ok => Data != null;
        public override string ToString() => Ok ? Source + (Recovered ? "（戻した）" : "") : "読めない: " + string.Join(" / ", Problems);
    }

    public sealed class SaveStore
    {
        public const string Format = "lumina-save";
        public const int Backups = 3;
        private readonly IFileSystem fs;
        private readonly string dir;

        public SaveStore(IFileSystem fs, string dir)
        {
            this.fs = fs;
            this.dir = dir ?? "";
        }

        public string MainPath(string slot) => Path.Combine(dir, slot + ".json");
        public string TmpPath(string slot) => MainPath(slot) + ".tmp";
        public string BakPath(string slot, int i) => MainPath(slot) + ".bak" + i;

        public bool Exists(string slot)
        {
            if (fs.Exists(MainPath(slot)) || fs.Exists(TmpPath(slot))) return true;
            for (int i = 1; i <= Backups; i++) if (fs.Exists(BakPath(slot, i))) return true;
            return false;
        }

        // ---------------- 包み（envelope）

        private const string DataKey = ",\"data\":";

        public static string Wrap(string body, long seq)
        {
            var bytes = Encoding.UTF8.GetBytes(body);
            uint crc = Crc32.Compute(bytes);
            return "{\"format\":\"" + Format + "\",\"seq\":" + seq + ",\"length\":" + body.Length + ",\"crc32\":\"" + crc.ToString("x8") + "\"" + DataKey + body + "}";
        }

        /// <summary>包みを開いて data の部分を返す。壊れていれば null（problem に理由）。</summary>
        public static string Unwrap(byte[] bytes, out long seq, out string problem)
        {
            seq = -1; problem = null;
            if (bytes == null) { problem = "ファイルが無い"; return null; }
            string text;
            try { text = new UTF8Encoding(false, true).GetString(bytes); }
            catch (ArgumentException) { problem = "文字として読めない"; return null; }
            int k = text.IndexOf(DataKey, StringComparison.Ordinal);
            if (k < 0 || !text.StartsWith("{", StringComparison.Ordinal)) { problem = "セーブの形でない（途中で切れている）"; return null; }
            Dictionary<string, object> head;
            try { head = Json.ParseObject(text.Substring(0, k) + "}"); }
            catch (JsonException) { problem = "頭の部分が読めない"; return null; }
            if (J.Str(head, "format") != Format) { problem = "セーブの形でない"; return null; }
            int len = J.Int(head, "length", -1);
            int start = k + DataKey.Length;
            if (len < 0 || start + len + 1 != text.Length || text[text.Length - 1] != '}') { problem = "長さが合わない（途中で切れている）"; return null; }
            string body = text.Substring(start, len);
            uint crc = Crc32.Compute(Encoding.UTF8.GetBytes(body));
            if (crc.ToString("x8") != J.Str(head, "crc32")) { problem = "CRC が合わない（中身が壊れている）"; return null; }
            seq = J.Long(head, "seq", -1);
            return body;
        }

        private SaveData TryRead(string path, out long seq, out string problem)
        {
            seq = -1;
            var body = Unwrap(fs.ReadAll(path), out seq, out problem);
            if (body == null) return null;
            try { return SaveSerializer.FromJson(body); }
            catch (SaveFormatException e) { problem = e.Message; return null; }
            catch (Exception e) { problem = "読めない: " + e.Message; return null; }
        }

        /// <summary>中身の確かめ方（読めれば null、読めなければ理由）。</summary>
        private static string CheckSave(string body)
        {
            try { SaveSerializer.FromJson(body); return null; }
            catch (SaveFormatException e) { return e.Message; }
            catch (Exception e) { return "読めない: " + e.Message; }
        }

        private string TryReadText(string path, Func<string, string> check, out long seq, out string problem)
        {
            var body = Unwrap(fs.ReadAll(path), out seq, out problem);
            if (body == null) return null;
            problem = check?.Invoke(body);
            return problem == null ? body : null;
        }

        // ---------------- 保存

        public SaveResult Save(string slot, SaveData data)
        {
            return SaveCore(slot, seq =>
            {
                data.Seq = seq;
                data.Version = SaveMigrations.CurrentVersion;
                return SaveSerializer.ToJson(data);
            }, CheckSave);
        }

        /// <summary>
        /// セーブと同じ書き方（.tmp → 確かめる → bak1〜3 → 置き換え）で、ほかの中身（倉庫を入れた「アカウント」など）を保存する。
        /// check は読み直した中身の確かめ方（読めれば null）。
        /// </summary>
        public SaveResult SaveText(string slot, string body, Func<string, string> check = null) => SaveCore(slot, _ => body, check);

        private SaveResult SaveCore(string slot, Func<long, string> makeBody, Func<string, string> check)
        {
            string main = MainPath(slot), tmp = TmpPath(slot);
            try
            {
                fs.EnsureDirectory(dir);
                long seq = Math.Max(SeqOf(main), SeqOf(tmp)) + 1;
                string text = Wrap(makeBody(seq), seq);
                var bytes = Encoding.UTF8.GetBytes(text);

                // 1. 一時ファイルに書く（fsync まで）
                fs.WriteAllDurable(tmp, bytes);
                // 2. 読み直して確かめる
                long check2;
                if (TryReadText(tmp, check, out check2, out string problem) == null || check2 != seq)
                    return new SaveResult { Ok = false, Error = "書いたファイルを確かめられない: " + problem };
                // 3〜5. バックアップを 1 つずつ後ろへ
                string bLast = BakPath(slot, Backups);
                if (fs.Exists(bLast)) fs.Delete(bLast);
                for (int i = Backups - 1; i >= 1; i--)
                {
                    string b = BakPath(slot, i);
                    if (fs.Exists(b)) fs.MoveReplace(b, BakPath(slot, i + 1));
                }
                // 6. 今のセーブ（壊れていなければ）を bak1 へ
                if (fs.Exists(main) && TryReadText(main, check, out _, out _) != null) fs.Copy(main, BakPath(slot, 1));
                // 7. 一度に置き換え
                fs.MoveReplace(tmp, main);
                return new SaveResult { Ok = true, Seq = seq };
            }
            catch (SimulatedCrashException) { throw; } // テスト: 「落ちた」はそのまま外へ
            catch (Exception e)
            {
                return new SaveResult { Ok = false, Error = e.GetType().Name + ": " + e.Message };
            }
        }

        private long SeqOf(string path)
        {
            if (!fs.Exists(path)) return 0;
            return Unwrap(fs.ReadAll(path), out long seq, out _) != null ? seq : 0;
        }

        // ---------------- 読み込み

        public LoadResult Load(string slot)
        {
            var r = new LoadResult();
            SaveData best = null; long bestSeq = -1; string bestSrc = null;
            foreach (var (path, name) in new[] { (MainPath(slot), "main"), (TmpPath(slot), "tmp") })
            {
                if (!fs.Exists(path)) { if (name == "main") r.Problems.Add("main: 無い"); continue; }
                var d = TryRead(path, out long seq, out string problem);
                if (d == null) { r.Problems.Add(name + ": " + problem); continue; }
                if (seq > bestSeq) { best = d; bestSeq = seq; bestSrc = name; }
            }
            if (best == null)
            {
                for (int i = 1; i <= Backups && best == null; i++)
                {
                    string path = BakPath(slot, i);
                    if (!fs.Exists(path)) continue;
                    var d = TryRead(path, out _, out string problem);
                    if (d == null) { r.Problems.Add("bak" + i + ": " + problem); continue; }
                    best = d; bestSrc = "bak" + i;
                }
            }
            r.Data = best;
            r.Source = bestSrc;
            r.Recovered = best != null && bestSrc != "main";
            return r;
        }

        /// <summary>SaveText で保存した中身を読む（Load と同じ順番: 今と .tmp の新しい方 → bak1〜3）。無ければ null。</summary>
        public string LoadText(string slot, Func<string, string> check = null)
        {
            string best = null; long bestSeq = -1;
            foreach (var path in new[] { MainPath(slot), TmpPath(slot) })
            {
                if (!fs.Exists(path)) continue;
                var body = TryReadText(path, check, out long seq, out _);
                if (body != null && seq > bestSeq) { best = body; bestSeq = seq; }
            }
            for (int i = 1; i <= Backups && best == null; i++)
            {
                string path = BakPath(slot, i);
                if (fs.Exists(path)) best = TryReadText(path, check, out _, out _);
            }
            return best;
        }

        public void Delete(string slot)
        {
            fs.Delete(MainPath(slot));
            fs.Delete(TmpPath(slot));
            for (int i = 1; i <= Backups; i++) fs.Delete(BakPath(slot, i));
        }
    }

    public static class Crc32
    {
        private static readonly uint[] Table = Make();

        private static uint[] Make()
        {
            var t = new uint[256];
            for (uint i = 0; i < 256; i++)
            {
                uint c = i;
                for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                t[i] = c;
            }
            return t;
        }

        public static uint Compute(byte[] data)
        {
            uint c = 0xFFFFFFFFu;
            foreach (var b in data) c = Table[(c ^ b) & 0xFF] ^ (c >> 8);
            return c ^ 0xFFFFFFFFu;
        }
    }

    /// <summary>
    /// 自動セーブの決まり: マップ移動・レベルアップ・クエスト完了の後すぐ（1 秒以内に 1 回にまとめる）と、遊んでいる時間の 3 分ごと。
    /// </summary>
    public sealed class AutoSaver
    {
        public double IntervalSec = 180;
        public double MinGapSec = 1;
        private double sinceLast;
        private string pending;

        public string PendingReason => pending;

        public void Request(string reason) { if (pending == null) pending = reason; }

        /// <summary>時間を進める。今セーブすべきなら理由を返す（null なら不要）。</summary>
        public string Tick(double dt)
        {
            sinceLast += dt;
            if (pending != null && sinceLast >= MinGapSec) { var r = pending; pending = null; sinceLast = 0; return r; }
            if (sinceLast >= IntervalSec) { sinceLast = 0; return "timer"; }
            return null;
        }

        public void MarkSaved() { sinceLast = 0; pending = null; }
    }
}
