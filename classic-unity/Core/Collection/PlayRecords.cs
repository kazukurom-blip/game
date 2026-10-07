// 記録と統計（倒した数・倒れた回数・拾ったお金・最大ダメージ・ボスの最短撃破 …）。遊んだ時間は GameSession.PlaySec。
// 訪れたマップ・倒した敵の種類は冒険の記録（GameSession.Records.cs の Flags "visit.*" / "kill.*"）を使う。ここは見つけた隠しポータル・ジャンプの試練の記録・持ったことのある椅子もここ。
using System;
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Collection
{
    public sealed class PlayRecords
    {
        public long Kills, Deaths, MesoPicked, ItemsPicked, BossKills, MaxDamage, PotionsUsed, DungeonClears;
        public long ScrollSuccess, ScrollFail, ScrollBroken;
        public int BestUpgrade;            // 書で一番上がった装備の +数
        public long MaxMeso;               // 持っていたお金の一番多い時
        /// <summary>敵ごとの倒した数（図鑑の「見つけた」もこれ）</summary>
        public readonly Dictionary<string, long> KillsBy = new Dictionary<string, long>();
        /// <summary>ボスの最短撃破（秒。最初に攻撃してから倒れるまで）</summary>
        public readonly Dictionary<string, double> BossBest = new Dictionary<string, double>();
        public readonly HashSet<string> Hidden = new HashSet<string>();
        public readonly HashSet<string> Chairs = new HashSet<string>();
        /// <summary>ジャンプの試練: マップ → クリアした回数・最短（秒）</summary>
        public readonly Dictionary<string, int> JumpClears = new Dictionary<string, int>();
        public readonly Dictionary<string, double> JumpBest = new Dictionary<string, double>();

        public long KillsOf(string mobId) => mobId != null && KillsBy.TryGetValue(mobId, out var n) ? n : 0;

        public void OnKill(string mobId)
        {
            Kills++;
            KillsBy[mobId] = KillsOf(mobId) + 1;
        }

        /// <summary>ボスを倒した時間を記録する。新記録なら true。</summary>
        public bool OnBossTime(string mobId, double sec)
        {
            if (sec <= 0) return false;
            if (BossBest.TryGetValue(mobId, out var best) && best <= sec) return false;
            BossBest[mobId] = sec;
            return true;
        }

        public bool OnJumpClear(string mapId, double sec)
        {
            JumpClears[mapId] = (JumpClears.TryGetValue(mapId, out var n) ? n : 0) + 1;
            if (sec <= 0) return false;
            if (JumpBest.TryGetValue(mapId, out var best) && best <= sec) return false;
            JumpBest[mapId] = sec;
            return true;
        }

        public Dictionary<string, object> ToDict()
        {
            var d = new Dictionary<string, object>
            {
                { "kills", Kills }, { "deaths", Deaths }, { "mesoPicked", MesoPicked }, { "itemsPicked", ItemsPicked }, { "bossKills", BossKills },
                { "maxDamage", MaxDamage }, { "potions", PotionsUsed }, { "scrollOk", ScrollSuccess }, { "scrollFail", ScrollFail }, { "scrollBroken", ScrollBroken },
                { "bestUpgrade", (long)BestUpgrade }, { "maxMeso", MaxMeso }, { "dungeons", DungeonClears },
            };
            var kb = new Dictionary<string, object>(); foreach (var kv in KillsBy) kb[kv.Key] = kv.Value; d["killsBy"] = kb;
            var bb = new Dictionary<string, object>(); foreach (var kv in BossBest) bb[kv.Key] = Math.Round(kv.Value, 2); d["bossBest"] = bb;
            d["hidden"] = Sorted(Hidden); d["chairs"] = Sorted(Chairs);
            var jc = new Dictionary<string, object>();
            foreach (var kv in JumpClears) jc[kv.Key] = new List<object> { (long)kv.Value, JumpBest.TryGetValue(kv.Key, out var b) ? Math.Round(b, 2) : 0.0 };
            d["jumps"] = jc;
            return d;
        }

        private static List<object> Sorted(HashSet<string> s)
        {
            var l = new List<string>(s); l.Sort(string.CompareOrdinal);
            return l.ConvertAll(x => (object)x);
        }

        public void Read(Dictionary<string, object> d)
        {
            if (d == null) return;
            Kills = J.Long(d, "kills"); Deaths = J.Long(d, "deaths"); MesoPicked = J.Long(d, "mesoPicked"); ItemsPicked = J.Long(d, "itemsPicked");
            BossKills = J.Long(d, "bossKills"); MaxDamage = J.Long(d, "maxDamage"); PotionsUsed = J.Long(d, "potions");
            ScrollSuccess = J.Long(d, "scrollOk"); ScrollFail = J.Long(d, "scrollFail"); ScrollBroken = J.Long(d, "scrollBroken");
            BestUpgrade = J.Int(d, "bestUpgrade"); MaxMeso = J.Long(d, "maxMeso"); DungeonClears = J.Long(d, "dungeons");
            var kb = J.Obj(d, "killsBy"); if (kb != null) foreach (var kv in kb) KillsBy[kv.Key] = (long)J.ToDouble(kv.Value);
            var bb = J.Obj(d, "bossBest"); if (bb != null) foreach (var kv in bb) BossBest[kv.Key] = J.ToDouble(kv.Value);
            foreach (var x in J.StrList(d, "hidden")) Hidden.Add(x);
            foreach (var x in J.StrList(d, "chairs")) Chairs.Add(x);
            var jc = J.Obj(d, "jumps");
            if (jc != null)
                foreach (var kv in jc)
                    if (kv.Value is List<object> a && a.Count == 2)
                    {
                        JumpClears[kv.Key] = (int)J.ToDouble(a[0]);
                        double b = J.ToDouble(a[1]);
                        if (b > 0) JumpBest[kv.Key] = b;
                    }
        }
    }
}
