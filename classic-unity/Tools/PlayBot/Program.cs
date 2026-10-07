// 自動で遊ぶボットのコンソール（docs/PLAYTEST.md）。
//
//   cd classic-unity
//   dotnet run -c Release --project Tools/PlayBot -- --lines all --tier 4 --hours 200
//
// --lines warrior,magician,bowman,thief,pirate（all = 5 系統。並べて同時に動かす）
// --tier N   N 次転職したら終わり（既定 4）      --level N  Lv N で終わり
// --hours H  ゲームの中の時間 H 時間で打ち切り    --seed S   乱数の種
// --start L  近道: Lv L（30・70・120）まで育ったキャラから（PLAYTEST.md 1-4）
// --out DIR  系統ごとのログ（<line>.log）・Lv の表（<line>.csv）・まとめ（summary.md）。既定は .build/playbot/
// --verbose  考えたことを全部ログに出す        --tracefight  空振りを全部ログに出す   --tracehurt  被弾を全部ログに出す
// --noacc    命中のために DEX を振らない       --above N / --below N  狩る敵の Lv（自分より N 上まで倒す・N 下の所で狩る）
// --probe MAP,x,y,tx,ty  調べる用: そのマップの x,y から tx,ty まで歩かせて、動きを全部出す
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Lumina.Core.Data;

namespace Lumina.PlayBot
{
    public static class Program
    {
        public static readonly Dictionary<string, int> Branches = new Dictionary<string, int>
        {
            { "warrior", 0 },   // ファイター
            { "magician", 0 },  // ファイアウィザード
            { "bowman", 0 },    // ハンター
            { "thief", 0 },     // アサシン
            { "pirate", 0 },    // ブローラー
        };

        public static int Main(string[] args)
        {
            var opt = new Dictionary<string, string>();
            for (int i = 0; i < args.Length; i++)
            {
                if (!args[i].StartsWith("--")) continue;
                string k = args[i].Substring(2);
                string v = i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[++i] : "1";
                opt[k] = v;
            }
            string dataDir = opt.TryGetValue("data", out var dd) ? dd : FindData();
            string lines = opt.TryGetValue("lines", out var l) ? l : "all";
            var list = lines == "all" ? Branches.Keys.ToList() : lines.Split(',').ToList();
            int tier = opt.TryGetValue("tier", out var t) ? int.Parse(t) : 4;
            int level = opt.TryGetValue("level", out var lv) ? int.Parse(lv) : 200;
            double hours = opt.TryGetValue("hours", out var h) ? double.Parse(h, System.Globalization.CultureInfo.InvariantCulture) : 250;
            ulong seed = opt.TryGetValue("seed", out var sd) ? ulong.Parse(sd) : 20261007;
            if (opt.TryGetValue("probe", out var probe)) return Probe(dataDir, probe);
            string outDir = opt.TryGetValue("out", out var o) ? o : Path.Combine(dataDir, "..", ".build", "playbot");
            bool verbose = opt.ContainsKey("verbose");
            Directory.CreateDirectory(outDir);

            var bots = new Bot[list.Count];
            Parallel.For(0, list.Count, new ParallelOptions { MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount) }, i =>
            {
                var data = GameData.Load(new FileDataSource(dataDir));
                string line = list[i];
                using var log = new StreamWriter(Path.Combine(outDir, line + ".log"), false, new UTF8Encoding(false)) { AutoFlush = true };
                int br = Branches.TryGetValue(line, out var b) ? b : 0;
                Bot bot;
                if (opt.TryGetValue("start", out var st) && int.Parse(st) > 1)
                {
                    bot = Bot.MakeCheckpoint(data, line, br, int.Parse(st), seed + (ulong)i * 7919);
                    bot.Log = log;
                    bot.Say("近道: " + bot.StatLine());
                }
                else bot = new Bot(data, line, br, seed + (ulong)i * 7919);
                bot.StopTier = tier; bot.StopLevel = level; bot.MaxGameSec = bot.Sec + hours * 3600; bot.Log = log; bot.Verbose = verbose; bot.TraceFight = opt.ContainsKey("tracefight"); bot.TraceHurt = opt.ContainsKey("tracehurt");
                bots[i] = bot;
                RunBot(bot);
                File.WriteAllText(Path.Combine(outDir, line + ".csv"), bot.LevelCsv());
                File.WriteAllText(Path.Combine(outDir, line + ".md"), bot.Summary());
                Console.WriteLine(line + ": " + bot.StopReason + " Lv" + bot.Level + " " + bot.S.Character.JobName + " " + Bot.Fmt(bot.Sec) + "（計算 " + bot.WallSec.ToString("0") + " 秒）問題 " + bot.Issues.Count);
            });
            var sb = new StringBuilder();
            foreach (var bot in bots) if (bot != null) sb.AppendLine(bot.Summary());
            File.WriteAllText(Path.Combine(outDir, "summary.md"), sb.ToString());
            Console.WriteLine("→ " + Path.GetFullPath(Path.Combine(outDir, "summary.md")));
            return 0;
        }

        /// <summary>調べる用: --probe MAP,x,y,tx,ty（そのマップの x,y に置いて tx,ty へ歩かせ、動きを全部出す）。</summary>
        private static int Probe(string dataDir, string spec)
        {
            var a = spec.Split(',');
            var data = GameData.Load(new FileDataSource(dataDir));
            var bot = new Bot(data, "warrior", 0, 1) { Log = Console.Out, Verbose = true, TraceMoves = true };
            bot.WithMapChange(() => bot.S.ChangeMap(a[0]));
            bot.S.Teleport(double.Parse(a[1]), double.Parse(a[2]));
            bool ok = false;
            try { ok = bot.MoveToPoint(double.Parse(a[3]), double.Parse(a[4])); }
            catch (BotInterrupt e) { Console.WriteLine("中断: " + e.Message); }
            Console.WriteLine("結果 " + ok + " " + bot.DescribeHere());
            return 0;
        }

        public static void RunBot(Bot bot) => bot.RunToEnd();

        private static string FindData()
        {
            var d = new DirectoryInfo(AppContext.BaseDirectory);
            while (d != null)
            {
                var p = Path.Combine(d.FullName, "Data", "items.json");
                if (File.Exists(p) && Directory.Exists(Path.Combine(d.FullName, "Core"))) return Path.Combine(d.FullName, "Data");
                d = d.Parent;
            }
            return "Data";
        }
    }
}
