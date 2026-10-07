// 遊んだ結果のまとめ（PLAYTEST.md に貼る表）。
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Lumina.PlayBot
{
    public sealed partial class Bot
    {
        public string StopReason;
        public double WallSec;

        /// <summary>止まるまで遊ぶ（時間・Lv・転職で止まる。例外は問題として記録）。</summary>
        public void RunToEnd()
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            try { Play(); }
            catch (BotStop e) { StopReason = e.Message; }
            catch (Exception e)
            {
                StopReason = "例外: " + e.GetType().Name + ": " + e.Message;
                Note("exception", e.GetType().Name + ":" + e.Message, e.ToString());
                Log.WriteLine(e.ToString());
            }
            WallSec = sw.Elapsed.TotalSeconds;
            Say("終わり: " + StopReason);
        }

        /// <summary>Markdown のまとめ（1 系統分）。</summary>
        public string Summary()
        {
            var sb = new StringBuilder();
            var c = S.Character;
            sb.AppendLine("### " + Line + "（" + c.JobName + "）");
            sb.AppendLine();
            sb.AppendLine("- 終わり: " + (StopReason ?? "?") + "・ゲームの中の時間 " + Fmt(S.PlaySec) + "（" + (S.PlaySec / 3600).ToString("0.0") + " 時間）・計算 " + WallSec.ToString("0") + " 秒（Core の更新 " + stepWatch.Elapsed.TotalSeconds.ToString("0") + " 秒・" + Frames + " フレーム・考える " + thinkWatch.Elapsed.TotalSeconds.ToString("0") + " 秒・" + Thinks + " 回）");
            sb.AppendLine("- Lv" + c.Level + "・倒れた " + Deaths + " 回・倒した敵 " + Kills + "・クエスト完了 " + QuestsDone + "・お金 " + S.Inventory.Meso.ToString("N0") + "（店で使った " + MesoSpent.ToString("N0") + "）");
            double hrs = Math.Max(0.01, S.PlaySec / 3600);
            sb.AppendLine("- お金の出入り（1 時間あたり）: 拾った " + (MesoDropped / hrs).ToString("N0") + "・売った " + (MesoSold / hrs).ToString("N0") + "・クエスト " + (MesoQuest / hrs).ToString("N0")
                + " / 薬 " + (PotionMesoUsed / hrs).ToString("N0") + "（" + (PotionsUsed / hrs).ToString("0") + " 個）・店で使った全部 " + (MesoSpent / hrs).ToString("N0"));
            sb.AppendLine("- 時間の使い方: " + string.Join("・", TimeUse.OrderByDescending(k => k.Value).Select(k => k.Key + " " + (100 * k.Value / Math.Max(1, S.PlaySec)).ToString("0") + "%"))
                + "・受けたダメージ " + DamageTaken.ToString("N0") + "（" + HitsTaken + " 回・1 体あたり " + (Kills > 0 ? (double)HitsTaken / Kills : 0).ToString("0.00") + " 回）");
            sb.AppendLine("- 攻撃: 振った " + Swings + "（1 体も当たらなかった " + Whiffs + "）・当たった " + MobHits + "・MISS " + Misses + "（" + (MobHits + Misses > 0 ? 100.0 * Misses / (MobHits + Misses) : 0).ToString("0") + "%）・1 体あたり " + (Kills > 0 ? (double)Swings / Kills : 0).ToString("0.0") + " 振り・1 撃 " + (MobHits > 0 ? DamageDealt / MobHits : 0));
            sb.AppendLine("- 経験値: クエスト " + QuestExp.ToString("N0") + " / 全部 " + MobExp.ToString("N0") + "（クエストの割合 " + (MobExp > 0 ? (100.0 * QuestExp / MobExp).ToString("0.0") : "0") + "%）");
            sb.AppendLine("- セーブ→読み込み " + SaveChecks + " 回（違い " + SaveMismatches + " 回）");
            foreach (var a in Advances) sb.AppendLine("- " + a.tier + " 次転職: Lv" + a.level + "・" + Fmt(a.sec));
            sb.AppendLine();
            sb.AppendLine("| Lv | 着いた時間 | この Lv にかかった | 倒れた（累計） | お金 | 場所 |");
            sb.AppendLine("|---|---|---|---|---|---|");
            double prev = 0;
            foreach (var r in Levels)
            {
                bool show = r.Level <= 12 || r.Level % 5 == 0 || r.Level == 30 || r.Level == 70 || r.Level == 120 || r == Levels.Last();
                double took = r.PlaySec - prev;
                prev = r.PlaySec;
                if (!show) continue;
                sb.AppendLine("| " + r.Level + " | " + Fmt(r.PlaySec) + " | " + (took / 60).ToString("0.0") + " 分 | " + r.Deaths + " | " + r.Meso.ToString("N0") + " | " + r.Map + " |");
            }
            sb.AppendLine();
            if (Issues.Count > 0)
            {
                sb.AppendLine("問題（" + Issues.Count + "）:");
                foreach (var i in Issues.Values.OrderBy(x => x.FirstAt)) sb.AppendLine("- [" + i.Kind + "] " + i.Text + "（Lv" + i.Level + "・" + Fmt(i.FirstAt) + "・" + i.Count + " 回）");
                sb.AppendLine();
            }
            return sb.ToString();
        }

        /// <summary>CSV: Lv, 秒, 倒れた, お金</summary>
        public string LevelCsv()
        {
            var sb = new StringBuilder("line,level,sec,deaths,meso,questExp,allExp,map\n");
            foreach (var r in Levels) sb.AppendLine(Line + "," + r.Level + "," + r.PlaySec.ToString("0") + "," + r.Deaths + "," + r.Meso + "," + r.QuestExp + "," + r.MobExp + "," + r.Map);
            return sb.ToString();
        }
    }
}
