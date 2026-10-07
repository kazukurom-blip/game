// ブラウザ版の JS・設計書の式から書き出した期待値（Tests/Golden/*.json）と、C# の Core が同じ数値になるかを比べる。
// 期待値の作り直し: node classic-unity/Data/tools/export_golden.mjs
using System;
using System.Collections.Generic;
using System.IO;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Physics;
using Lumina.Core.Util;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class GoldenPhysicsTests
    {
        private static Dictionary<string, object> golden;
        private static Dictionary<string, object> G => golden ??= Json.ParseObject(File.ReadAllText(TestPaths.Golden("physics_traces.json")));

        public static IEnumerable<object[]> Scenarios()
        {
            foreach (var o in J.Arr(G, "scenarios")) yield return new object[] { J.Str((Dictionary<string, object>)o, "name") };
        }

        private static readonly BodyState[] States = { BodyState.Stand, BodyState.Walk, BodyState.Prone, BodyState.Air, BodyState.Rope, BodyState.Ladder };

        [Theory]
        [MemberData(nameof(Scenarios))]
        public void SameTraceAsBrowser(string name)
        {
            Dictionary<string, object> sc = null;
            foreach (var o in J.Arr(G, "scenarios")) if (J.Str((Dictionary<string, object>)o, "name") == name) sc = (Dictionary<string, object>)o;
            var mapDict = J.Obj(J.Obj(G, "maps"), J.Str(sc, "map"));
            var map = MapData.FromDict(mapDict).BuildPhysics();
            var p = new PlayerBody(J.Num(sc, "x"), J.Num(sc, "y"));
            var trace = J.Arr(sc, "trace");
            var hurts = J.Arr(sc, "hurts");
            int f = 0;
            foreach (var runObj in J.Arr(sc, "inputs"))
            {
                var run = (List<object>)runObj;
                int m = (int)J.ToDouble(run[0]), n = (int)J.ToDouble(run[1]);
                var inp = new PhysicsInput { Left = (m & 1) != 0, Right = (m & 2) != 0, Up = (m & 4) != 0, Down = (m & 8) != 0, Jump = (m & 16) != 0, JumpPressed = (m & 32) != 0 };
                for (int i = 0; i < n; i++)
                {
                    foreach (var h in hurts)
                    {
                        var hd = (Dictionary<string, object>)h;
                        if (J.Int(hd, "frame") == f) PlayerPhysics.Hurt(p, J.Num(hd, "fromX"));
                    }
                    PlayerPhysics.Step(p, inp, map, Feel.Dt);
                    var row = (List<object>)trace[f];
                    string at = name + " フレーム " + f;
                    AssertNear(J.ToDouble(row[0]), p.X, at + " x");
                    AssertNear(J.ToDouble(row[1]), p.Y, at + " y");
                    AssertNear(J.ToDouble(row[2]), p.Vx, at + " vx");
                    AssertNear(J.ToDouble(row[3]), p.Vy, at + " vy");
                    Assert.True(States[(int)J.ToDouble(row[4])] == p.State, at + " 状態 期待 " + States[(int)J.ToDouble(row[4])] + " 実際 " + p.State);
                    Assert.True((int)J.ToDouble(row[5]) == p.Facing, at + " 向き");
                    AssertNear(J.ToDouble(row[6]), p.InvT, at + " 無敵");
                    f++;
                }
            }
            Assert.Equal(trace.Count, f);
        }

        private static void AssertNear(double expected, double actual, string what)
        {
            Assert.True(Math.Abs(expected - actual) <= 1e-7, what + ": 期待 " + expected.ToString("R") + " 実際 " + actual.ToString("R"));
        }
    }

    public class GoldenCurveTests
    {
        private static Dictionary<string, object> golden;
        private static Dictionary<string, object> G => golden ??= Json.ParseObject(File.ReadAllText(TestPaths.Golden("curves.json")));

        [Fact]
        public void ExpTableMatchesStatsMd()
        {
            var rows = J.Arr(G, "exp");
            Assert.Equal(200, rows.Count);
            foreach (var r in rows)
            {
                var a = (List<object>)r;
                int lv = (int)J.ToDouble(a[0]);
                Assert.True((long)J.ToDouble(a[1]) == Curves.ExpToNext(lv), "Lv" + lv + " 次まで: 期待 " + a[1] + " 実際 " + Curves.ExpToNext(lv));
                Assert.True((long)J.ToDouble(a[2]) == Curves.ExpTotalAt(lv), "Lv" + lv + " 累計");
            }
            // STATS.md の表の値を直接いくつか
            Assert.Equal(15, Curves.ExpToNext(1));
            Assert.Equal(1600, Curves.ExpToNext(10));
            Assert.Equal(70000, Curves.ExpToNext(30));
            Assert.Equal(1200000000, Curves.ExpToNext(199));
            Assert.Equal(0, Curves.ExpToNext(200));
            Assert.Equal(27692370022L, Curves.ExpTotalAt(200));
        }

        [Fact]
        public void MobBaseMatches()
        {
            foreach (var o in J.Arr(G, "mobBase"))
            {
                var d = (Dictionary<string, object>)o;
                double lv = J.Num(d, "lv");
                var b = Curves.MobBase(lv);
                Near(J.Num(d, "hp"), b.Hp, "hp", lv);
                Near(J.Num(d, "baseExp"), b.BaseExp, "baseExp", lv);
                Near(J.Num(d, "exp"), b.Exp, "exp", lv);
                Near(J.Num(d, "atk"), b.Atk, "atk", lv);
                Near(J.Num(d, "def"), b.Def, "def", lv);
                Near(J.Num(d, "avoid"), b.Avoid, "avoid", lv);
                Near(J.Num(d, "meso"), b.Meso, "meso", lv);
                Near(J.Num(d, "solo"), Curves.SoloMul(lv), "solo", lv);
            }
            foreach (var o in J.Arr(G, "nice"))
            {
                var a = (List<object>)o;
                Assert.Equal(J.ToDouble(a[1]), Curves.Nice(J.ToDouble(a[0])), 6);
            }
            foreach (var o in J.Arr(G, "logInterp"))
            {
                var a = (List<object>)o;
                Near(J.ToDouble(a[1]), Curves.LogInterp(Curves.ExpAnchors, J.ToDouble(a[0])), "logInterp", J.ToDouble(a[0]));
            }
        }

        private static void Near(double e, double a, string what, double lv)
        {
            Assert.True(Math.Abs(e - a) <= Math.Abs(e) * 1e-12 + 1e-12, what + " Lv" + lv + ": 期待 " + e.ToString("R") + " 実際 " + a.ToString("R"));
        }
    }

    public class GoldenCombatTests
    {
        private static Dictionary<string, object> golden;
        private static Dictionary<string, object> G => golden ??= Json.ParseObject(File.ReadAllText(TestPaths.Golden("combat.json")));

        [Fact]
        public void PhysRangeMatches()
        {
            int n = 0;
            foreach (var o in J.Arr(G, "phys"))
            {
                var d = (Dictionary<string, object>)o;
                var r = Formulas.PhysRange(J.Str(d, "type"), J.Num(d, "main"), J.Num(d, "sub"), J.Num(d, "watk"), J.Num(d, "mastery"), J.Bool(d, "stab"));
                Assert.True(J.Int(d, "min") == r.Min && J.Int(d, "max") == r.Max, J.Str(d, "type") + " " + Json.Serialize(d) + " 実際 " + r);
                n++;
            }
            Assert.True(n > 100);
        }

        [Fact]
        public void MagicAndOtherFormulasMatch()
        {
            foreach (var o in J.Arr(G, "magic"))
            {
                var d = (Dictionary<string, object>)o;
                var r = Formulas.MagicRange(J.Num(d, "int"), J.Num(d, "matk"), J.Num(d, "spell"), J.Num(d, "mastery"));
                Assert.Equal(J.Int(d, "min"), r.Min);
                Assert.Equal(J.Int(d, "max"), r.Max);
            }
            foreach (var o in J.Arr(G, "defs"))
            {
                var d = (Dictionary<string, object>)o;
                Assert.Equal(J.Int(d, "out"), Formulas.AfterDef(J.Num(d, "dmg"), J.Num(d, "def"), J.Num(d, "r")));
            }
            foreach (var o in J.Arr(G, "lvpen"))
            {
                var d = (Dictionary<string, object>)o;
                Assert.Equal(J.Num(d, "out"), Formulas.LevelPenalty(J.Int(d, "p"), J.Int(d, "m")), 12);
            }
            foreach (var o in J.Arr(G, "hits"))
            {
                var d = (Dictionary<string, object>)o;
                Assert.Equal(J.Num(d, "out"), Formulas.HitChance(J.Num(d, "acc"), J.Num(d, "avoid"), J.Int(d, "p"), J.Int(d, "m")), 12);
            }
            foreach (var o in J.Arr(G, "taken"))
            {
                var d = (Dictionary<string, object>)o;
                Assert.Equal(J.Int(d, "out"), Formulas.DamageTakenAverage(J.Num(d, "atk"), J.Num(d, "wdef"), J.Int(d, "ml"), J.Int(d, "pl")));
            }
        }
    }
}
