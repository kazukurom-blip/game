// 小さな JSON の読み書き（外部のパッケージを使わない）。
// 読み: Json.Parse(text) → Dictionary<string, object> / List<object> / string / double / long / bool / null
//   - 整数（小数点・指数なし、long に入る）は long、それ以外の数は double。
// 書き: JsonWriter（順番を保つ・決まった形で書く）か Json.Serialize(object)。
// Unity の JsonUtility・.NET の System.Text.Json のどちらでも読める、ふつうの JSON だけを書く。
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Lumina.Core.Util
{
    public class JsonException : Exception
    {
        public JsonException(string msg) : base(msg) { }
    }

    public static class Json
    {
        public static object Parse(string text)
        {
            if (text == null) throw new JsonException("JSON が null");
            var p = new Parser(text);
            p.SkipWs();
            var v = p.ReadValue();
            p.SkipWs();
            if (!p.End) throw new JsonException("JSON の後ろに余分な文字がある（位置 " + p.Pos + "）");
            return v;
        }

        public static Dictionary<string, object> ParseObject(string text)
        {
            var o = Parse(text) as Dictionary<string, object>;
            if (o == null) throw new JsonException("JSON のいちばん外がオブジェクトでない");
            return o;
        }

        public static string Serialize(object value, bool pretty = false)
        {
            var w = new JsonWriter(pretty);
            w.Value(value);
            return w.ToString();
        }

        private sealed class Parser
        {
            private readonly string s;
            public int Pos;
            public Parser(string s) { this.s = s; }
            public bool End => Pos >= s.Length;

            public void SkipWs()
            {
                while (Pos < s.Length)
                {
                    char c = s[Pos];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '﻿') Pos++;
                    else break;
                }
            }

            private JsonException Err(string m) => new JsonException(m + "（位置 " + Pos + "）");

            public object ReadValue()
            {
                if (End) throw Err("JSON が途中で終わっている");
                char c = s[Pos];
                switch (c)
                {
                    case '{': return ReadObject();
                    case '[': return ReadArray();
                    case '"': return ReadString();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber();
                        throw Err("思わぬ文字 '" + c + "'");
                }
            }

            private void Expect(string word)
            {
                if (Pos + word.Length > s.Length || string.CompareOrdinal(s, Pos, word, 0, word.Length) != 0) throw Err(word + " のはず");
                Pos += word.Length;
            }

            private Dictionary<string, object> ReadObject()
            {
                var d = new Dictionary<string, object>();
                Pos++; SkipWs();
                if (!End && s[Pos] == '}') { Pos++; return d; }
                while (true)
                {
                    SkipWs();
                    if (End || s[Pos] != '"') throw Err("キーの文字列のはず");
                    string k = ReadString();
                    SkipWs();
                    if (End || s[Pos] != ':') throw Err("':' のはず");
                    Pos++; SkipWs();
                    d[k] = ReadValue();
                    SkipWs();
                    if (End) throw Err("オブジェクトが閉じていない");
                    if (s[Pos] == ',') { Pos++; continue; }
                    if (s[Pos] == '}') { Pos++; return d; }
                    throw Err("',' か '}' のはず");
                }
            }

            private List<object> ReadArray()
            {
                var a = new List<object>();
                Pos++; SkipWs();
                if (!End && s[Pos] == ']') { Pos++; return a; }
                while (true)
                {
                    SkipWs();
                    a.Add(ReadValue());
                    SkipWs();
                    if (End) throw Err("配列が閉じていない");
                    if (s[Pos] == ',') { Pos++; continue; }
                    if (s[Pos] == ']') { Pos++; return a; }
                    throw Err("',' か ']' のはず");
                }
            }

            private string ReadString()
            {
                Pos++; // "
                var sb = new StringBuilder();
                while (true)
                {
                    if (End) throw Err("文字列が閉じていない");
                    char c = s[Pos++];
                    if (c == '"') return sb.ToString();
                    if (c == '\\')
                    {
                        if (End) throw Err("文字列が閉じていない");
                        char e = s[Pos++];
                        switch (e)
                        {
                            case '"': sb.Append('"'); break;
                            case '\\': sb.Append('\\'); break;
                            case '/': sb.Append('/'); break;
                            case 'b': sb.Append('\b'); break;
                            case 'f': sb.Append('\f'); break;
                            case 'n': sb.Append('\n'); break;
                            case 'r': sb.Append('\r'); break;
                            case 't': sb.Append('\t'); break;
                            case 'u':
                                if (Pos + 4 > s.Length) throw Err("\\u が途中で終わっている");
                                sb.Append((char)int.Parse(s.Substring(Pos, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                                Pos += 4;
                                break;
                            default: throw Err("知らないエスケープ \\" + e);
                        }
                    }
                    else sb.Append(c);
                }
            }

            private object ReadNumber()
            {
                int start = Pos;
                bool isFloat = false;
                if (s[Pos] == '-') Pos++;
                while (Pos < s.Length)
                {
                    char c = s[Pos];
                    if (c >= '0' && c <= '9') { Pos++; continue; }
                    if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { isFloat = true; Pos++; continue; }
                    break;
                }
                string t = s.Substring(start, Pos - start);
                if (!isFloat && long.TryParse(t, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out long l)) return l;
                if (double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out double d)) return d;
                throw Err("数として読めない: " + t);
            }
        }
    }

    /// <summary>決まった形で JSON を書く。キーの順番は書いた順のまま。</summary>
    public sealed class JsonWriter
    {
        private readonly StringBuilder sb = new StringBuilder();
        private readonly bool pretty;
        private readonly Stack<int> counts = new Stack<int>();
        private bool afterKey;

        public JsonWriter(bool pretty = false) { this.pretty = pretty; }
        public override string ToString() => sb.ToString();

        private void Newline()
        {
            if (!pretty) return;
            sb.Append('\n');
            sb.Append(' ', counts.Count * 2);
        }

        // 値（またはキー）を書く前: カンマと改行
        private void Pre()
        {
            if (afterKey) { afterKey = false; return; }
            if (counts.Count == 0) return;
            int n = counts.Pop();
            if (n > 0) sb.Append(',');
            counts.Push(n + 1);
            Newline();
        }

        public JsonWriter BeginObject() { Pre(); sb.Append('{'); counts.Push(0); return this; }
        public JsonWriter EndObject() { int n = counts.Pop(); if (n > 0) Newline(); sb.Append('}'); return this; }
        public JsonWriter BeginArray() { Pre(); sb.Append('['); counts.Push(0); return this; }
        public JsonWriter EndArray() { int n = counts.Pop(); if (n > 0) Newline(); sb.Append(']'); return this; }

        public JsonWriter Key(string k)
        {
            Pre();
            WriteString(k);
            sb.Append(pretty ? ": " : ":");
            afterKey = true;
            return this;
        }

        public JsonWriter String(string v) { Pre(); if (v == null) sb.Append("null"); else WriteString(v); return this; }
        public JsonWriter Number(long v) { Pre(); sb.Append(v.ToString(CultureInfo.InvariantCulture)); return this; }
        public JsonWriter Number(double v)
        {
            Pre();
            if (double.IsNaN(v) || double.IsInfinity(v)) sb.Append("0");
            else if (v == Math.Floor(v) && Math.Abs(v) < 1e15) sb.Append(((long)v).ToString(CultureInfo.InvariantCulture));
            else sb.Append(v.ToString("R", CultureInfo.InvariantCulture));
            return this;
        }
        public JsonWriter Bool(bool v) { Pre(); sb.Append(v ? "true" : "false"); return this; }
        public JsonWriter Null() { Pre(); sb.Append("null"); return this; }

        // 書きやすい短い形
        public JsonWriter Prop(string k, string v) => Key(k).String(v);
        public JsonWriter Prop(string k, long v) => Key(k).Number(v);
        public JsonWriter Prop(string k, int v) => Key(k).Number((long)v);
        public JsonWriter Prop(string k, double v) => Key(k).Number(v);
        public JsonWriter Prop(string k, bool v) => Key(k).Bool(v);

        /// <summary>任意の値（Dictionary / IList / 文字列 / 数 / bool / null）を書く。</summary>
        public JsonWriter Value(object v)
        {
            switch (v)
            {
                case null: return Null();
                case string s: return String(s);
                case bool b: return Bool(b);
                case int i: return Number((long)i);
                case long l: return Number(l);
                case float f: return Number((double)f);
                case double d: return Number(d);
                case IDictionary<string, object> dict:
                    BeginObject();
                    foreach (var kv in dict) { Key(kv.Key); Value(kv.Value); }
                    return EndObject();
                case IDictionary idict:
                    BeginObject();
                    foreach (DictionaryEntry kv in idict) { Key(Convert.ToString(kv.Key, CultureInfo.InvariantCulture)); Value(kv.Value); }
                    return EndObject();
                case IEnumerable list:
                    BeginArray();
                    foreach (var x in list) Value(x);
                    return EndArray();
                default:
                    if (v is IConvertible) return Number(Convert.ToDouble(v, CultureInfo.InvariantCulture));
                    return String(v.ToString());
            }
        }

        private void WriteString(string v)
        {
            sb.Append('"');
            foreach (char c in v)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }

    /// <summary>Parse の結果（Dictionary）から型つきで読む小さな手伝い。無ければ既定値。</summary>
    public static class J
    {
        public static object Get(IDictionary<string, object> d, string k) => d != null && d.TryGetValue(k, out var v) ? v : null;
        public static bool Has(IDictionary<string, object> d, string k) => d != null && d.ContainsKey(k) && d[k] != null;

        public static string Str(IDictionary<string, object> d, string k, string def = null)
        {
            var v = Get(d, k);
            if (v == null) return def;
            return v as string ?? Convert.ToString(v, CultureInfo.InvariantCulture);
        }

        public static double Num(IDictionary<string, object> d, string k, double def = 0) => ToDouble(Get(d, k), def);
        public static int Int(IDictionary<string, object> d, string k, int def = 0) => (int)Math.Round(ToDouble(Get(d, k), def));
        public static long Long(IDictionary<string, object> d, string k, long def = 0)
        {
            var v = Get(d, k);
            if (v is long l) return l;
            if (v == null) return def;
            return (long)Math.Round(ToDouble(v, def));
        }
        public static bool Bool(IDictionary<string, object> d, string k, bool def = false)
        {
            var v = Get(d, k);
            if (v is bool b) return b;
            return def;
        }
        public static Dictionary<string, object> Obj(IDictionary<string, object> d, string k) => Get(d, k) as Dictionary<string, object>;
        public static List<object> Arr(IDictionary<string, object> d, string k) => Get(d, k) as List<object> ?? new List<object>();

        public static double ToDouble(object v, double def = 0)
        {
            switch (v)
            {
                case null: return def;
                case double d: return d;
                case long l: return l;
                case int i: return i;
                case float f: return f;
                case bool b: return b ? 1 : 0;
                case string s:
                    return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r) ? r : def;
                default: return def;
            }
        }

        public static List<string> StrList(IDictionary<string, object> d, string k)
        {
            var r = new List<string>();
            foreach (var x in Arr(d, k)) if (x != null) r.Add(x as string ?? Convert.ToString(x, CultureInfo.InvariantCulture));
            return r;
        }
    }
}
