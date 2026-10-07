// ブラウザの試遊版の入口（C# 側）。Core の GameSession を 1 つ持ち、JS から呼ばれる口を [JSExport] で出す。
// 呼び方の手本は classic-unity/docs/CORE.md 3 章（Unity の GameRunner と同じ流れ）。
//
//   Boot(slot, name, seed)      … セーブがあれば読み、無ければ新しく始める（系統なしの初心者）
//   NewGame(slot, name, seed)   … セーブを無視して新しく始める（すぐ保存）
//   Frame(dt, keys, skill, item, held) … 1 フレーム進めて、描く物を小さな JSON で返す（毎フレーム）
//   Ui()                        … 窓の中身（能力値・持ち物・装備・スキル・クエスト・クイックスロット）
//   Act(cmd, a, b, n)           … UI からの操作（話す・クエスト・店・AP/SP・装備・転職・セーブ…）
//
// データ（Data/*.json・maps/*.json）は JS が 1 つにまとめた data.json から [JSImport] で 1 つずつ読む。
// セーブは Core の SaveStore（壊れない書き方）を、localStorage を 1 枚のディスクに見立てた IFileSystem で動かす。
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices.JavaScript;
using System.Text;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Save;

namespace Lumina.Web
{
    public static partial class Interop
    {
        [JSImport("dataText", "lumina")] public static partial string DataText(string path);
        [JSImport("storeGet", "lumina")] public static partial string StoreGet(string key);
        [JSImport("storeSet", "lumina")] public static partial bool StoreSet(string key, string value);
        [JSImport("storeDel", "lumina")] public static partial void StoreDel(string key);
    }

    /// <summary>data.json（JS が持っている）から読む。</summary>
    public sealed class JsDataSource : IDataSource
    {
        public string ReadText(string path) => Interop.DataText(path);
    }

    /// <summary>
    /// localStorage を「ファイル」にする。値は UTF-8 の文字列（セーブは JSON なのでそのまま）。
    /// 書けなかった時（容量・プライベートの窓）は例外 → SaveStore が SaveFailed にする（ゲームは止まらない）。
    /// </summary>
    public sealed class LocalStorageFileSystem : IFileSystem
    {
        private const string Prefix = "lumina.";
        public bool Exists(string path) => Interop.StoreGet(Prefix + path) != null;
        public byte[] ReadAll(string path)
        {
            var s = Interop.StoreGet(Prefix + path);
            return s == null ? null : Encoding.UTF8.GetBytes(s);
        }
        public void WriteAllDurable(string path, byte[] data)
        {
            if (!Interop.StoreSet(Prefix + path, Encoding.UTF8.GetString(data))) throw new System.IO.IOException("localStorage に書けない");
        }
        public void MoveReplace(string src, string dst)
        {
            var s = Interop.StoreGet(Prefix + src);
            if (s == null) throw new System.IO.FileNotFoundException(src);
            if (!Interop.StoreSet(Prefix + dst, s)) throw new System.IO.IOException("localStorage に書けない");
            Interop.StoreDel(Prefix + src);
        }
        public void Copy(string src, string dst)
        {
            var s = Interop.StoreGet(Prefix + src);
            if (s == null) throw new System.IO.FileNotFoundException(src);
            if (!Interop.StoreSet(Prefix + dst, s)) throw new System.IO.IOException("localStorage に書けない");
        }
        public void Delete(string path) => Interop.StoreDel(Prefix + path);
        public void EnsureDirectory(string dir) { }
    }

    public static partial class Program
    {
        public static void Main() { }

        internal static GameData Data;
        internal static GameSession S;
        internal static SaveStore Store;
        internal static string LastLoad = "";

        private static void EnsureData()
        {
            if (Data != null) return;
            Data = GameData.Load(new JsDataSource());
            Store = new SaveStore(new LocalStorageFileSystem(), "saves");
        }

        /// <summary>セーブがあれば続きから、無ければ新しく。戻り値 {"ok":true,"loaded":bool,"msg":"…"}</summary>
        [JSExport]
        public static string Boot(string slot, string name, double seed)
        {
            try
            {
                EnsureData();
                S = null;
                string msg = "";
                bool loaded = false;
                try
                {
                    if (Store.Exists(slot))
                    {
                        S = GameSession.Load(Data, Store, slot, out var r);
                        loaded = S != null;
                        msg = S == null ? "セーブが読めなかった: " + string.Join(" / ", r.Problems) : r.Recovered ? "バックアップから戻した: " + string.Join(" / ", r.Problems) : "続きから";
                    }
                }
                catch (Exception e) { S = null; msg = "セーブの読み込みで問題: " + e.Message; }
                if (S == null) return NewGame(slot, name, seed, msg);
                return Ui.Obj(("ok", true), ("loaded", loaded), ("msg", msg));
            }
            catch (Exception e) { return Ui.Obj(("ok", false), ("msg", e.ToString())); }
        }

        [JSExport]
        public static string NewGame(string slot, string name, double seed) => NewGame(slot, name, seed, "新しく始めた");

        private static string NewGame(string slot, string name, double seed, string msg)
        {
            try
            {
                EnsureData();
                S = GameSession.NewGame(Data, string.IsNullOrEmpty(name) ? "ぼうけんしゃ" : name, (ulong)Math.Abs(seed) + 1);
                S.AttachSave(Store, slot);
                try { S.SaveNow("new"); } catch (Exception) { /* 保存できなくても遊べる */ }
                S.Out.Clear();
                return Ui.Obj(("ok", true), ("loaded", false), ("msg", msg));
            }
            catch (Exception e) { return Ui.Obj(("ok", false), ("msg", e.ToString())); }
        }

        // 入力のビット（JS の main.js と同じ）
        public const int KLeft = 1, KRight = 2, KUp = 4, KDown = 8, KJump = 16, KAttack = 32, KPickup = 64,
                         KJumpPressed = 128, KUpPressed = 256, KInteract = 512;

        /// <summary>1 フレーム。dt 秒（実時間）進めて、描く物を返す。</summary>
        [JSExport]
        public static string Frame(double dt, int keys, string skillPressed, string itemPressed, string skillHeld)
        {
            if (S == null) return "null";
            var inp = new PlayerInput
            {
                Left = (keys & KLeft) != 0, Right = (keys & KRight) != 0, Up = (keys & KUp) != 0, Down = (keys & KDown) != 0,
                Jump = (keys & KJump) != 0, Attack = (keys & KAttack) != 0, Pickup = (keys & KPickup) != 0,
                JumpPressed = (keys & KJumpPressed) != 0, UpPressed = (keys & KUpPressed) != 0, InteractPressed = (keys & KInteract) != 0,
                SkillPressed = string.IsNullOrEmpty(skillPressed) ? null : skillPressed,
                ItemPressed = string.IsNullOrEmpty(itemPressed) ? null : itemPressed,
                SkillHeld = string.IsNullOrEmpty(skillHeld) ? null : skillHeld,
            };
            try
            {
                S.Update(dt, inp);
            }
            catch (Exception e)
            {
                return "{\"error\":" + FrameWriter.Q(e.ToString()) + "}";
            }
            return FrameWriter.Write(S);
        }

        [JSExport]
        public static string GetUi() => S == null ? "null" : Ui.Build(S);

        [JSExport]
        public static string Act(string cmd, string a, string b, int n)
        {
            if (S == null) return Ui.Obj(("ok", false), ("msg", "まだ始まっていない"));
            try { return Actions.Run(S, cmd, a, b, n); }
            catch (Exception e) { return Ui.Obj(("ok", false), ("msg", "エラー: " + e.Message), ("trace", e.ToString())); }
        }

        /// <summary>セーブの JSON（中身だけ。SaveSerializer の形）。書き出し用。</summary>
        [JSExport]
        public static string ExportSave() => S == null ? "" : SaveSerializer.ToJson(S.ToSaveData("export"), true);
    }
}
