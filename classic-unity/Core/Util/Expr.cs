// スキルの式（JOBS.md の「160+5x」「3+⌊x/4⌋」など）をデータから読むための小さな式の計算。
// 書き方: 数, x（スキルの Lv）, lv（キャラの Lv）, + - * /, かっこ, floor() ceil() round() min() max() abs()
// 例: "160+5*x"  "3+floor(x/4)"  "min(60, 20+2*x)"  "10+5*ceil(x/2)"
// 一度読んだ式は覚えておく（毎回読み直さない）。
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Lumina.Core.Util
{
    public sealed class Expr
    {
        private static readonly Dictionary<string, Expr> cache = new Dictionary<string, Expr>();

        private readonly Node root;
        public readonly string Source;

        private Expr(string src, Node root) { Source = src; this.root = root; }

        public static Expr Parse(string src)
        {
            if (string.IsNullOrEmpty(src)) src = "0";
            lock (cache)
            {
                if (cache.TryGetValue(src, out var e)) return e;
                var p = new P(src);
                var n = p.ParseExpr();
                p.Ws();
                if (p.i < src.Length) throw new FormatException("式の終わりに余分な文字: " + src);
                e = new Expr(src, n);
                cache[src] = e;
                return e;
            }
        }

        public double Eval(double x, double lv = 0) => root.Eval(x, lv);

        /// <summary>スキルの Lv x で計算して整数に（切り捨て）。式の中の floor/ceil は式に書く。</summary>
        public int EvalInt(double x, double lv = 0) => (int)Math.Floor(Eval(x, lv) + 1e-9);

        public static double Eval(string src, double x, double lv = 0) => Parse(src).Eval(x, lv);

        private abstract class Node { public abstract double Eval(double x, double lv); }
        private sealed class Num : Node { public double V; public override double Eval(double x, double lv) => V; }
        private sealed class Var : Node { public bool IsLv; public override double Eval(double x, double lv) => IsLv ? lv : x; }
        private sealed class Neg : Node { public Node A; public override double Eval(double x, double lv) => -A.Eval(x, lv); }
        private sealed class Bin : Node
        {
            public char Op; public Node A, B;
            public override double Eval(double x, double lv)
            {
                double a = A.Eval(x, lv), b = B.Eval(x, lv);
                switch (Op)
                {
                    case '+': return a + b;
                    case '-': return a - b;
                    case '*': return a * b;
                    default: return b == 0 ? 0 : a / b;
                }
            }
        }
        private sealed class Fn : Node
        {
            public string Name; public List<Node> Args;
            public override double Eval(double x, double lv)
            {
                double a = Args[0].Eval(x, lv);
                switch (Name)
                {
                    case "floor": return Math.Floor(a + 1e-9);
                    case "ceil": return Math.Ceiling(a - 1e-9);
                    case "round": return Math.Floor(a + 0.5);
                    case "abs": return Math.Abs(a);
                    case "min": { double m = a; for (int i = 1; i < Args.Count; i++) m = Math.Min(m, Args[i].Eval(x, lv)); return m; }
                    case "max": { double m = a; for (int i = 1; i < Args.Count; i++) m = Math.Max(m, Args[i].Eval(x, lv)); return m; }
                    default: throw new FormatException("知らない関数: " + Name);
                }
            }
        }

        private sealed class P
        {
            private readonly string s; public int i;
            public P(string s) { this.s = s; }
            public void Ws() { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

            public Node ParseExpr()
            {
                var a = ParseTerm();
                while (true)
                {
                    Ws();
                    if (i < s.Length && (s[i] == '+' || s[i] == '-')) { char op = s[i++]; a = new Bin { Op = op, A = a, B = ParseTerm() }; }
                    else return a;
                }
            }

            private Node ParseTerm()
            {
                var a = ParseUnary();
                while (true)
                {
                    Ws();
                    if (i < s.Length && (s[i] == '*' || s[i] == '/')) { char op = s[i++]; a = new Bin { Op = op, A = a, B = ParseUnary() }; }
                    else return a;
                }
            }

            private Node ParseUnary()
            {
                Ws();
                if (i < s.Length && s[i] == '-') { i++; return new Neg { A = ParseUnary() }; }
                if (i < s.Length && s[i] == '+') { i++; return ParseUnary(); }
                return ParseAtom();
            }

            private Node ParseAtom()
            {
                Ws();
                if (i >= s.Length) throw new FormatException("式が途中で終わっている: " + s);
                char c = s[i];
                if (c == '(')
                {
                    i++;
                    var n = ParseExpr();
                    Ws();
                    if (i >= s.Length || s[i] != ')') throw new FormatException("')' が無い: " + s);
                    i++;
                    return n;
                }
                if (char.IsDigit(c) || c == '.')
                {
                    int st = i;
                    while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.')) i++;
                    return new Num { V = double.Parse(s.Substring(st, i - st), CultureInfo.InvariantCulture) };
                }
                if (char.IsLetter(c))
                {
                    int st = i;
                    while (i < s.Length && char.IsLetter(s[i])) i++;
                    string name = s.Substring(st, i - st);
                    Ws();
                    if (i < s.Length && s[i] == '(')
                    {
                        i++;
                        var args = new List<Node> { ParseExpr() };
                        Ws();
                        while (i < s.Length && s[i] == ',') { i++; args.Add(ParseExpr()); Ws(); }
                        if (i >= s.Length || s[i] != ')') throw new FormatException("')' が無い: " + s);
                        i++;
                        return new Fn { Name = name, Args = args };
                    }
                    if (name == "x") return new Var { IsLv = false };
                    if (name == "lv") return new Var { IsLv = true };
                    throw new FormatException("知らない名前: " + name + "（" + s + "）");
                }
                throw new FormatException("思わぬ文字 '" + c + "'（" + s + "）");
            }
        }
    }
}
