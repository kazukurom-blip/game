// 自動で遊ぶボット（docs/PLAYTEST.md）。
//
// 決まり: GameSession には「PlayerInput（キー）」と「UI から呼ぶ操作」（話す・クエストを受ける/報告する・買う・売る・
// AP/SP を振る・転職・倉庫・タクシー・乗り物・起き上がる・クイズに答える）だけを渡す。位置や数値を直接書き換えない。
// 読むのは画面に出ている物（位置・敵・落ちている物・HP/MP・持ち物・クエストの数）と、データ（マップ・クエスト・店）。
//
// Bot.cs: 1 フレームの流れ（反射: 薬を飲む・倒れたら起き上がる）・お知らせ・記録。
// Nav.cs: 道探し（マップのポータルのつながり・マップの中の足場のつながり）と本物の入力での移動。
// Fight.cs: 敵を探して近づき、攻撃・スキル、落ちた物を拾う。
// Town.cs: 店（薬・装備・弾）・売る・AP/SP・装備・バフ。
// Quester.cs: クエストを選んで受け、進め、報告する。転職（1〜4 次）。
// SaveCheck.cs: セーブ→読み込みで同じ状態になるか。
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;

namespace Lumina.PlayBot
{
    /// <summary>今の行動をやめて考え直す（倒れた・思わぬマップ移動）。</summary>
    public sealed class BotInterrupt : Exception { public BotInterrupt(string m) : base(m) { } }
    /// <summary>決めた時間・Lv に着いた（遊ぶのを終える）。</summary>
    public sealed class BotStop : Exception { public BotStop(string m) : base(m) { } }

    /// <summary>詰まった所・おかしな所の記録。</summary>
    public sealed class Issue
    {
        public string Kind, Key, Text;
        public int Count;
        public double FirstAt, LastAt;
        public int Level;
    }

    /// <summary>Lv が上がった時の記録（成長の速さの表）。</summary>
    public sealed class LevelRow
    {
        public int Level;
        public double PlaySec;
        public int Deaths;
        public long Meso;
        public long QuestExp, MobExp;
        public string Map;
        public string Job;
    }

    public sealed partial class Bot
    {
        public GameSession S;
        public readonly GameData D;
        public readonly string Line;     // warrior / magician / bowman / thief / pirate
        public readonly int Branch;      // 2 次で選ぶ枝
        public readonly string Name;
        public long Frames;
        public int Deaths;
        public double MaxGameSec = double.MaxValue;
        public int StopTier = 4;
        public int StopLevel = 200;
        public TextWriter Log = TextWriter.Null;
        public bool Verbose;

        public readonly Dictionary<string, Issue> Issues = new Dictionary<string, Issue>();
        public readonly List<LevelRow> Levels = new List<LevelRow>();
        public readonly List<(int tier, double sec, int level)> Advances = new List<(int, double, int)>();
        public readonly Dictionary<string, int> DeathsByMap = new Dictionary<string, int>();
        public long QuestExp, MobExp, MesoFromQuests, MesoSpent;
        /// <summary>何に時間を使ったか（ゲームの中の秒）。</summary>
        public readonly Dictionary<string, double> TimeUse = new Dictionary<string, double>();
        private string timeBucket = "other";
        public T Timed<T>(string bucket, Func<T> f)
        {
            string old = timeBucket; timeBucket = bucket;
            try { return f(); } finally { timeBucket = old; }
        }
        public long DamageTaken; public int HitsTaken;
        private readonly Queue<string> recentHurts = new Queue<string>();
        public int Swings, Whiffs, MobHits, Misses; public long DamageDealt;
        public long MesoDropped, MesoQuest, MesoSold, PotionMesoUsed; public int PotionsUsed;
        public int Kills, QuestsDone, SaveChecks, SaveMismatches, Reloads;

        private bool allowMapChange;
        public readonly System.Diagnostics.Stopwatch stepWatch = new System.Diagnostics.Stopwatch();
        private int potionCd;
        private static readonly DateTime Epoch = new DateTime(2026, 1, 5, 6, 0, 0, DateTimeKind.Utc);

        public Bot(GameData data, string line, int branch, ulong seed, string name = null)
        {
            D = data;
            Line = line;
            Branch = branch;
            Name = name ?? "bot-" + line;
            S = GameSession.NewGame(data, Name, seed);
            HookSession();
        }

        /// <summary>実時間の 1 日 N 回（ボスの間・ダンジョン）はゲームの中の時間で数える（ボットは何十時間も続けて遊ぶため）。</summary>
        private void HookSession()
        {
            var s = S;
            s.Clock = () => Epoch.AddSeconds(s.PlaySec);
        }

        public int Level => S.Character.Level;
        public int Tier => S.Character.Tier;
        public double Sec => S.PlaySec;
        public string MapId => S.Map.Data.Id;

        // ---------------- 1 フレーム

        /// <summary>入力を 1 フレーム入れる。薬はここで自動で飲む（人が HP を見て押すのと同じ）。倒れたら起き上がって BotInterrupt。</summary>
        public void Frame(PlayerInput inp)
        {
            if (S.Dead) HandleDeath();
            if (potionCd > 0) potionCd--;
            if (potionCd <= 0 && inp.ItemPressed == null)
            {
                var c = S.Character; var st = S.Stats;
                if (c.Hp < st.MaxHp * HpPotionAt)
                {
                    var p = BestPotion(true);
                    if (p != null) { inp.ItemPressed = p; potionCd = 12; }
                }
                else if (c.Mp < st.MaxMp * MpPotionAt)
                {
                    var p = BestPotion(false);
                    if (p != null) { inp.ItemPressed = p; potionCd = 12; }
                }
            }
            string before = S.Map.Data.Id;
            FlushEvents(); // UI の操作（話す・報告・買う）で出たお知らせ
            TimeUse[timeBucket] = (TimeUse.TryGetValue(timeBucket, out var tu) ? tu : 0) + 1.0 / 60;
            stepWatch.Start();
            S.Step(inp);
            stepWatch.Stop();
            Frames++;
            FlushEvents();
            if (S.Dead) HandleDeath();
            if (S.Map.Data.Id != before && !allowMapChange)
                throw new BotInterrupt("マップが変わった " + before + "→" + S.Map.Data.Id);
            if (S.PlaySec > MaxGameSec) throw new BotStop("時間切れ");
        }

        public void Idle(int frames) { for (int i = 0; i < frames; i++) Frame(new PlayerInput()); }

        public double HpPotionAt => S.Character.Line == "magician" ? 0.55 : 0.5;
        public double MpPotionAt => S.Character.Line == "magician" ? 0.25 : 0.08; // 魔法使い以外は MP の薬をあまり使わない

        /// <summary>持っている薬のうち、足りない分に合う物（HP: 足りない分を越えない一番大きい物、無ければ一番小さい物）。</summary>
        public string BestPotion(bool hp)
        {
            string best = null; int bestAmt = 0;
            int need = hp ? S.Stats.MaxHp - S.Character.Hp : S.Stats.MaxMp - S.Character.Mp;
            foreach (var (tab, slot, it) in S.Inventory.All())
            {
                if (tab != InvTab.Use) continue;
                var u = D.Item(it.ItemId)?.Use;
                if (u == null || u.ReturnTo != null || u.Buff != null) continue;
                int amt = hp ? u.Hp + (int)(u.HpPct * S.Stats.MaxHp) : u.Mp + (int)(u.MpPct * S.Stats.MaxMp);
                if (amt <= 0) continue;
                if ((hp ? u.Mp : u.Hp) > 0 && u.HpPct <= 0) { } // 両方回る物も使ってよい
                bool better = best == null || (amt <= need ? (bestAmt > need || amt > bestAmt) : (bestAmt > need && amt < bestAmt));
                if (better) { best = it.ItemId; bestAmt = amt; }
            }
            return best;
        }

        /// <summary>たまったお知らせを読んで空にする。</summary>
        public void FlushEvents()
        {
            foreach (var e in S.Out.Events) OnEvent(e);
            foreach (var d in S.Out.Damage) if (d.Kind == Lumina.Core.Combat.DamageKind.Miss && d.TargetUid != 0) Misses++;
            S.Out.Clear();
        }

        public string StatLine()
        {
            var c = S.Character; var st = S.Stats;
            return "STR " + st.Str + " DEX " + st.Dex + " INT " + st.Int + " LUK " + st.Luk + "（AP " + c.Ap + "・SP " + string.Join("/", c.Sp) + "）・攻撃 " + st.Range + "・魔力 " + st.Matk + "・命中 " + st.Acc.ToString("0") + "・回避 " + st.Avoid.ToString("0")
                + "・HP " + st.MaxHp + "・MP " + st.MaxMp + "・防御 " + st.Wdef + "・武器 " + st.WeaponType + "（段階 " + st.AttackStage + "）・スキル " + string.Join(",", S.Skills.Levels.Select(k => k.Key.Substring(k.Key.IndexOf('.') + 1) + k.Value));
        }

        private void HandleDeath()
        {
            Deaths++;
            string map = S.Map.Data.Id;
            DeathsByMap[map] = DeathsByMap.TryGetValue(map, out var n) ? n + 1 : 1;
            OnDeathNoted(map);
            var near = S.Map.Mobs.Where(m => m.Alive).OrderBy(m => Math.Abs(m.X - S.Body.X) + Math.Abs(m.Y - S.Body.Y)).FirstOrDefault();
            Say("倒れた: " + map + " Lv" + Level + "（" + Deaths + " 回目）近くの敵 " + (near != null ? near.Def.Id + " Lv" + near.Def.Lv + (near.Def.IsBoss ? " ボス" : "") : "-")
                + "・薬 " + CountPotions(true) + "・最大 HP " + S.Stats.MaxHp + "・防御 " + S.Stats.Wdef + "・" + (lastEngagedMob ?? "狩り"));
            if (Verbose) Say("  直前の被弾: " + string.Join(" | ", recentHurts));
            recentHurts.Clear();
            allowMapChange = true;
            try { FlushEvents(); S.Revive(); FlushEvents(); }
            finally { allowMapChange = false; }
            throw new BotInterrupt("倒れた");
        }

        /// <summary>マップが変わってよい操作（ポータル・乗り物・帰還）。</summary>
        public T WithMapChange<T>(Func<T> f)
        {
            bool old = allowMapChange;
            allowMapChange = true;
            try { return f(); }
            finally { allowMapChange = old; }
        }

        public void WithMapChange(Action f) { WithMapChange(() => { f(); return 0; }); }

        // ---------------- お知らせ

        private void OnEvent(GameEvent e)
        {
            switch (e.Type)
            {
                case GameEventType.LevelUp:
                    Levels.Add(new LevelRow
                    {
                        Level = S.Character.Level, PlaySec = S.PlaySec, Deaths = Deaths, Meso = S.Inventory.Meso,
                        QuestExp = QuestExp, MobExp = MobExp, Map = S.Map.Data.Id, Job = S.Character.JobName,
                    });
                    Say("Lv" + S.Character.Level + "（" + Fmt(S.PlaySec) + "・" + S.Map.Data.Id + "・倒れた " + Deaths + "・お金 " + S.Inventory.Meso + "）");
                    if (Verbose) Say("  能力: " + StatLine());
                    if (S.Character.Level >= StopLevel) stopRequested = "Lv" + StopLevel;
                    break;
                case GameEventType.Hurt:
                    hurtFlag = true;
                    if (e.Value > 0)
                    {
                        DamageTaken += e.Value; HitsTaken++;
                        var nm = S.Map.Mobs.Where(m => m.Alive).OrderBy(m => Math.Abs(m.X - S.Body.X) + Math.Abs(m.Y - S.Body.Y)).FirstOrDefault();
                        recentHurts.Enqueue(Fmt(S.PlaySec) + ":" + ((int)(S.PlaySec % 60)).ToString("00") + " " + S.Map.Data.Id + " x" + S.Body.X.ToString("0") + " -" + e.Value + " HP" + S.Character.Hp + " " + timeBucket + " " + (nm?.Def.Id ?? "-") + (nm != null ? "@" + (nm.X - S.Body.X).ToString("0") : ""));
                        while (recentHurts.Count > 12) recentHurts.Dequeue();
                    }
                    break;
                case GameEventType.ExpGained:
                    MobExp += e.Value;
                    break;
                case GameEventType.QuestCompleted:
                    QuestsDone++;
                    QuestExp += e.Value;
                    Say("クエスト完了 " + e.Id + " " + e.Text);
                    break;
                case GameEventType.AttackHit:
                    Swings++; if (e.Value == 0) Whiffs++;
                    break;
                case GameEventType.MobHit:
                    if (e.Text == null) { MobHits++; DamageDealt += e.Value; }
                    break;
                case GameEventType.MobDied:
                    Kills++;
                    break;
                case GameEventType.JobAdvanced:
                    Advances.Add(((int)e.Value, S.PlaySec, S.Character.Level));
                    Say("転職 " + e.Value + " 次: " + e.Text + "（Lv" + S.Character.Level + "・" + Fmt(S.PlaySec) + "）");
                    if (e.Value >= StopTier) stopRequested = "転職 " + e.Value + " 次";
                    break;
                case GameEventType.ItemBought:
                    if (Verbose) Say("  買った " + e.Id + " ×" + e.Value + "（残り " + S.Inventory.Meso + "）");
                    break;
                case GameEventType.MesoPicked:
                    if (e.Id == null) MesoDropped += e.Value; else MesoQuest += e.Value;
                    break;
                case GameEventType.ItemUsed:
                    if (D.Item(e.Id)?.Use is var u && u != null && (u.Hp > 0 || u.Mp > 0 || u.HpPct > 0)) { PotionsUsed++; PotionMesoUsed += D.Item(e.Id).Price; }
                    break;
                case GameEventType.ItemSold:
                    MesoSold += e.Value;
                    if (Verbose) Say("  売った " + e.Id + " +" + e.Value);
                    break;
                case GameEventType.EquipChanged:
                    if (Verbose) Say("  装備: 武器 " + (S.Equipment.Get(EquipSlot.Weapon)?.ItemId ?? "無し") + "（" + S.Stats.WeaponType + "）");
                    break;
                case GameEventType.SaveFailed:
                    Note("save", "セーブ失敗", e.Text);
                    break;
                case GameEventType.InventoryFull:
                    inventoryFullSeen = true;
                    break;
                case GameEventType.Message:
                    LastMessage = e.Text;
                    if (Verbose && e.Text != null) Say("  [msg] " + e.Text);
                    break;
            }
        }

        private string stopRequested;
        public string LastMessage;

        // ---------------- 記録

        public void Say(string s)
        {
            Log.WriteLine("[" + Fmt(S.PlaySec) + " " + Line + " Lv" + S.Character.Level + "] " + s);
        }

        public static string Fmt(double sec)
        {
            int h = (int)(sec / 3600), m = (int)(sec % 3600 / 60);
            return h + ":" + m.ToString("00");
        }

        /// <summary>詰まった所を記録する（同じ物は数だけ増やす）。</summary>
        public Issue Note(string kind, string key, string text)
        {
            string k = kind + ":" + key;
            if (!Issues.TryGetValue(k, out var i))
            {
                Issues[k] = i = new Issue { Kind = kind, Key = key, Text = text, FirstAt = S.PlaySec, Level = Level };
                Say("[問題] " + kind + " " + key + ": " + text);
            }
            i.Count++;
            i.LastAt = S.PlaySec;
            i.Text = text;
            return i;
        }

        public int IssueCount(string kind, string key) => Issues.TryGetValue(kind + ":" + key, out var i) ? i.Count : 0;
    }
}
