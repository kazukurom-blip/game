// セーブのファイルの読み書きの口。本物（DiskFileSystem）と、テスト用のメモリの中の物（MemoryFileSystem）がある。
// テストではメモリの物に「途中で止まる」仕掛け（CrashingFileSystem）をかぶせて、書き込みの途中で落ちた時を再現する。
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Lumina.Core.Save
{
    public interface IFileSystem
    {
        bool Exists(string path);
        /// <summary>中身を読む。無ければ null。</summary>
        byte[] ReadAll(string path);
        /// <summary>中身を書いて、ディスクまで確実に書き終える（fsync）。</summary>
        void WriteAllDurable(string path, byte[] data);
        /// <summary>src を dst へ動かす。dst があれば置き換える（できるだけ一度に＝atomic に）。</summary>
        void MoveReplace(string src, string dst);
        void Copy(string src, string dst);
        void Delete(string path);
        void EnsureDirectory(string dir);
    }

    /// <summary>本物のファイル。</summary>
    public sealed class DiskFileSystem : IFileSystem
    {
        public bool Exists(string path) => File.Exists(path);

        public byte[] ReadAll(string path)
        {
            try { return File.Exists(path) ? File.ReadAllBytes(path) : null; }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }

        public void WriteAllDurable(string path, byte[] data)
        {
            using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                fs.Write(data, 0, data.Length);
                fs.Flush(true); // OS の中のバッファもディスクへ
            }
        }

        public void MoveReplace(string src, string dst)
        {
            if (!File.Exists(dst)) { File.Move(src, dst); return; }
            try
            {
                // Windows: ReplaceFile、Unix: rename（どちらも一度に置き換わる）
                File.Replace(src, dst, null);
            }
            catch (PlatformNotSupportedException)
            {
                // 置き換えが使えない環境: 消してから動かす（この間に落ちても、前の版はバックアップに残っている）
                File.Delete(dst);
                File.Move(src, dst);
            }
        }

        public void Copy(string src, string dst)
        {
            // コピーも「一時ファイル → 置き換え」で、途中で落ちても dst が半分にならないように
            var tmp = dst + ".part";
            var bytes = File.ReadAllBytes(src);
            WriteAllDurable(tmp, bytes);
            MoveReplace(tmp, dst);
        }

        public void Delete(string path) { if (File.Exists(path)) File.Delete(path); }
        public void EnsureDirectory(string dir) { if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir); }
    }

    /// <summary>メモリの中のファイル（テスト用）。</summary>
    public sealed class MemoryFileSystem : IFileSystem
    {
        public readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>();
        public bool Exists(string path) => Files.ContainsKey(path);
        public byte[] ReadAll(string path) => Files.TryGetValue(path, out var b) ? (byte[])b.Clone() : null;
        public void WriteAllDurable(string path, byte[] data) { Files[path] = (byte[])data.Clone(); }
        public void MoveReplace(string src, string dst)
        {
            if (!Files.TryGetValue(src, out var b)) throw new FileNotFoundException(src);
            Files[dst] = b; Files.Remove(src);
        }
        public void Copy(string src, string dst)
        {
            if (!Files.TryGetValue(src, out var b)) throw new FileNotFoundException(src);
            Files[dst] = (byte[])b.Clone();
        }
        public void Delete(string path) { Files.Remove(path); }
        public void EnsureDirectory(string dir) { }
        public string Text(string path) => Files.TryGetValue(path, out var b) ? Encoding.UTF8.GetString(b) : null;
    }

    /// <summary>テスト用: 落ちた（電源が切れた・強制終了）ことにする例外。</summary>
    public sealed class SimulatedCrashException : Exception
    {
        public SimulatedCrashException() : base("ここで落ちた（テスト）") { }
    }

    /// <summary>
    /// テスト用: N 回目の書き込みの操作で「落ちる」。書き込みの途中で落ちた時は、途中までの中身（ちぎれたファイル）が残る。
    /// 1 回の操作 = WriteAllDurable / MoveReplace / Copy / Delete の 1 回。
    /// </summary>
    public sealed class CrashingFileSystem : IFileSystem
    {
        private readonly IFileSystem inner;
        public int CrashAt;           // この番号の操作で落ちる（0 始まり。-1 = 落ちない）
        public double TornFraction = 0.5; // 書き込みの途中で落ちる時、書けている割合
        public int Ops { get; private set; }

        public CrashingFileSystem(IFileSystem inner, int crashAt) { this.inner = inner; CrashAt = crashAt; }

        private bool Hit() => CrashAt >= 0 && Ops++ == CrashAt;

        public bool Exists(string path) => inner.Exists(path);
        public byte[] ReadAll(string path) => inner.ReadAll(path);
        public void EnsureDirectory(string dir) => inner.EnsureDirectory(dir);

        public void WriteAllDurable(string path, byte[] data)
        {
            if (Hit())
            {
                int n = (int)(data.Length * TornFraction);
                var part = new byte[n];
                Array.Copy(data, part, n);
                inner.WriteAllDurable(path, part);
                throw new SimulatedCrashException();
            }
            inner.WriteAllDurable(path, data);
        }

        public void MoveReplace(string src, string dst)
        {
            if (Hit()) throw new SimulatedCrashException(); // 置き換えは一度に起きる: 起きる前に落ちた
            inner.MoveReplace(src, dst);
        }

        public void Copy(string src, string dst)
        {
            if (Hit())
            {
                // コピーの途中: ちぎれたコピーが残る
                var b = inner.ReadAll(src) ?? new byte[0];
                var part = new byte[(int)(b.Length * TornFraction)];
                Array.Copy(b, part, part.Length);
                inner.WriteAllDurable(dst, part);
                throw new SimulatedCrashException();
            }
            inner.Copy(src, dst);
        }

        public void Delete(string path)
        {
            if (Hit()) throw new SimulatedCrashException();
            inner.Delete(path);
        }
    }
}
