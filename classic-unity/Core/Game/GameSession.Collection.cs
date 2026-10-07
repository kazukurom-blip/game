// やりこみ要素（GameSession の続き）: 敵の図鑑（カード）・勲章（称号）・記録と統計・ジャンプの試練・全体マップの印・見た目（美容院）・椅子の収集。
// 中身の形は Core/Collection/（MonsterBook・BookIndex・Medals・PlayRecords）。保存は SaveData.Collection（版 4）。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Collection;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum MedalResult { Ok, NotEarned, Unknown }
    public enum LookResult { Ok, NoStylistHere, NotEnoughMeso, Unknown, Same }

    /// <summary>見た目（美容院で変える）。名前は Web の avatar/parts.js・Unity 側の部品の名前。</summary>
    public sealed class LookState
    {
        public static readonly string[] Hairs = { "spiky", "short", "long", "bun" };
        public static readonly string[] HairColors = { "brown", "black", "blond", "red", "silver", "blue" };
        public static readonly string[] Faces = { "basic", "smile", "sharp" };
        public string Hair = "spiky", HairColor = "brown", Face = "basic";
    }

    public sealed partial class GameSession
    {
        /// <summary>敵の図鑑（カード）</summary>
        public readonly MonsterBook Book = new MonsterBook();
        /// <summary>記録と統計</summary>
        public readonly PlayRecords Records = new PlayRecords();
        /// <summary>手に入れた勲章（手に入れた順）</summary>
        public readonly List<string> MedalsEarned = new List<string>();
        /// <summary>付けている勲章（無ければ null）</summary>
        public string Medal { get; private set; }
        /// <summary>見た目（美容院）</summary>
        public readonly LookState Look = new LookState();
        /// <summary>美容院の料金（1 回）</summary>
        public const long LookFee = 3000;

        /// <summary>カードを落とす乱数（ふつうのドロップの乱数とは別。図鑑を足しても今までの乱数の流れは変わらない）</summary>
        private Rng cardRng;
        private Rng CardRng => cardRng ??= new Rng(Rng.State0 ^ 0x5DEECE66DUL);

        private BookIndex bookIndex;
        /// <summary>図鑑に載る敵の一覧（地域ごと）</summary>
        public BookIndex BookIndex => bookIndex ??= BookIndex.Build(Data);

        private StatBlock collectionBonus;
        private int bonusBookLv = -1;
        private string bonusMedal;
        private double medalT;
        private readonly Dictionary<int, double> bossFirstHit = new Dictionary<int, double>();
        /// <summary>ジャンプの試練に入った時間（PlaySec）。てっぺんの宝箱で、かかった秒を記録する</summary>
        private double jumpStartT = -1;
        private string jumpMap;

        // ---------------- 能力（図鑑の段＋付けている勲章）

        private StatBlock CollectionBonus()
        {
            int lv = Book.Level;
            if (collectionBonus == null || lv != bonusBookLv || bonusMedal != Medal)
            {
                var b = MonsterBook.BonusFor(lv);
                var m = Medals.Get(Medal);
                if (m != null) b.Add(m.Bonus);
                collectionBonus = b; bonusBookLv = lv; bonusMedal = Medal;
            }
            return collectionBonus;
        }

        private void ApplyMedalPct(FinalStats st)
        {
            var m = Medals.Get(Medal);
            if (m == null) return;
            st.Mods.ExpPct += m.ExpPct; st.Mods.MesoPct += m.MesoPct; st.Mods.DropPct += m.DropPct;
        }

        // ---------------- 勲章

        public bool HasMedal(string id) => MedalsEarned.Contains(id);

        /// <summary>勲章を付ける（手に入れた物だけ）。id = null か "" で外す。</summary>
        public MedalResult EquipMedal(string id)
        {
            if (string.IsNullOrEmpty(id)) { Medal = null; RefreshStats(); Out.Add(GameEventType.MedalEquipped, null); return MedalResult.Ok; }
            if (Medals.Get(id) == null) return MedalResult.Unknown;
            if (!HasMedal(id)) return MedalResult.NotEarned;
            Medal = id;
            RefreshStats();
            Out.Add(GameEventType.MedalEquipped, id, text: Medals.Get(id).Name);
            return MedalResult.Ok;
        }

        /// <summary>全部の勲章の条件を調べ、満たした物を渡す（0.5 秒ごと・倒した時など）。新しく手に入れた数。</summary>
        public int CheckMedals()
        {
            int n = 0;
            if (Inventory.Meso > Records.MaxMeso) Records.MaxMeso = Inventory.Meso;
            foreach (var m in Medals.All)
            {
                if (HasMedal(m.Id)) continue;
                bool ok;
                try { ok = m.Test(this); } catch (Exception) { ok = false; }
                if (!ok) continue;
                MedalsEarned.Add(m.Id);
                n++;
                Out.Add(GameEventType.MedalEarned, m.Id, x: Body?.X ?? 0, y: Body?.Y ?? 0, text: m.Name);
                if (m.RewardMeso > 0) { Inventory.AddMeso(m.RewardMeso); Out.Add(GameEventType.MesoPicked, m.Id, m.RewardMeso); }
            }
            if (n > 0) AutoSave.Request("medal");
            return n;
        }

        private void TickCollection(double dt)
        {
            medalT -= dt;
            if (medalT > 0) return;
            medalT = 0.5;
            // 持っている椅子（集めた椅子の一覧）
            foreach (var (tab, _, it) in Inventory.All())
            {
                if (tab != InvTab.Setup) continue;
                var d = Data.Item(it.ItemId);
                if (d != null && d.IsChair) Records.Chairs.Add(d.Id);
            }
            CheckMedals();
        }

        // 勲章の条件で使う数
        public long QuestsDone()
        {
            long n = 0;
            foreach (var kv in Quests.Entries) if (kv.Value.Status == QuestStatus.Completed) n++;
            return n;
        }

        private int bossKinds = -1;
        /// <summary>ボスの種類の数（図鑑に載るボス・大ボス・段階のある敵）</summary>
        public long BossKinds()
        {
            if (bossKinds < 0) { bossKinds = 0; foreach (var e in BookIndex.Entries) if (IsBossDef(Data.Mob(e.Mob))) bossKinds++; }
            return bossKinds;
        }
        public long BossKindsKilled()
        {
            long n = 0;
            foreach (var e in BookIndex.Entries) if (IsBossDef(Data.Mob(e.Mob)) && Records.KillsOf(e.Mob) > 0) n++;
            return n;
        }
        private static bool IsBossDef(MobDef d) => d != null && (d.IsBoss || d.Boss != null);
        public bool RaidKilled()
        {
            foreach (var kv in Records.KillsBy) if (kv.Value > 0 && Data.Mob(kv.Key)?.Kind == "raid") return true;
            return false;
        }
        public double BestBossTime()
        {
            double best = 0;
            foreach (var v in Records.BossBest.Values) if (best == 0 || v < best) best = v;
            return best;
        }
        private int townCount = -1;
        public long TownCount()
        {
            if (townCount < 0) { townCount = 0; foreach (var n in Data.WorldMap.Maps.Values) if (n.Type == "町") townCount++; }
            return townCount;
        }
        public long TownsVisited()
        {
            long n = 0;
            foreach (var id in Records.Visited) if (Data.WorldMap.Node(id)?.Type == "町") n++;
            return n;
        }
        public long DungeonClears() => Records.DungeonClears;

        // ---------------- 倒した・殴った・拾った・書・マップ（各所から呼ぶ）

        private void OnDamageCollection(Mob mob, int dmg)
        {
            if (dmg > Records.MaxDamage) Records.MaxDamage = dmg;
            if (IsBossDef(mob.Def) && !mob.Mechanic && !bossFirstHit.ContainsKey(mob.Uid)) bossFirstHit[mob.Uid] = PlaySec;
        }

        private void OnKillCollection(Mob mob, List<DropItem> drops)
        {
            var def = mob.Def;
            Records.OnKill(def.Id);
            if (IsBossDef(def))
            {
                Records.BossKills++;
                if (bossFirstHit.TryGetValue(mob.Uid, out var t0))
                {
                    double sec = PlaySec - t0;
                    bossFirstHit.Remove(mob.Uid);
                    if (Records.OnBossTime(def.Id, sec)) Out.Add(GameEventType.Message, def.Id, text: def.Name + "の最短撃破 " + sec.ToString("0.0") + " 秒");
                }
            }
            // 図鑑のカード（図鑑に載る敵だけ・完成した種類は落とさない）
            if (BookIndex.ByMob.ContainsKey(def.Id) && !Book.Complete(def.Id) && CardRng.Chance(MonsterBook.CardChance(def)))
                drops.Add(new DropItem { ItemId = MonsterBook.CardId(def.Id) });
            medalT = 0; // すぐ勲章を調べる
        }

        /// <summary>落ちているカードを拾う（持ち物には入らず図鑑へ）。</summary>
        private bool PickupCard(DropItem d)
        {
            string mob = MonsterBook.MobOfCard(d.ItemId);
            d.PickedUp = true;
            var def = Data.Mob(mob);
            string name = (def?.Name ?? mob) + "のカード";
            if (!Book.Add(mob)) { Out.Add(GameEventType.Message, d.ItemId, text: name + "はもう 5 枚そろっている"); return true; }
            int n = Book.Count(mob);
            int lvBefore = MonsterBook.LevelFor(Book.CompletedCount - (n == MonsterBook.CardsPerSet ? 1 : 0));
            Out.Add(GameEventType.CardPicked, mob, n, d.X, d.Y, name + "（" + n + "/" + MonsterBook.CardsPerSet + "）");
            if (n == MonsterBook.CardsPerSet)
            {
                Out.Add(GameEventType.Message, mob, text: (def?.Name ?? mob) + "の図鑑が完成した！");
                int lv = Book.Level;
                if (lv > lvBefore) { Out.Add(GameEventType.BookLevelUp, null, lv, Body.X, Body.Y, "図鑑の段が " + lv + " になった（" + MonsterBook.BonusText(lv) + "）"); RefreshStats(); }
            }
            medalT = 0;
            return true;
        }

        private void OnScrollCollection(ScrollResult r, ItemInstance target)
        {
            if (r == ScrollResult.Success) { Records.ScrollSuccess++; if (target.Upgraded > Records.BestUpgrade) Records.BestUpgrade = target.Upgraded; }
            else if (r == ScrollResult.Fail) Records.ScrollFail++;
            else if (r == ScrollResult.Destroyed) Records.ScrollBroken++;
            medalT = 0;
        }

        private void OnVisitCollection(string mapId)
        {
            Records.Visited.Add(mapId);
            var md = Data.GetMap(mapId);
            if (md?.Jump != null) { if (jumpMap != mapId) { jumpStartT = PlaySec; jumpMap = mapId; } }
            else { jumpMap = null; jumpStartT = -1; }
        }

        private void OnHiddenPortal(PortalData p) { Records.Hidden.Add(Map.Data.Id + "." + p.Name); medalT = 0; }

        // ---------------- ジャンプの試練（てっぺんの宝箱）

        /// <summary>ジャンプの試練の今の段（1〜。地面 = 1）。試練の外なら 0。</summary>
        public int JumpStage
        {
            get
            {
                var j = Map?.Data.Jump;
                if (j == null || Body == null) return 0;
                int st = 1;
                for (int i = 1; i < j.Floors.Count; i++) if (Body.Y <= j.Floors[i] + 1) st = i + 1;
                return Math.Min(st, j.Stages + 1);
            }
        }

        /// <summary>ジャンプの試練に入ってからの秒（試練の外なら -1）</summary>
        public double JumpElapsed => jumpMap != null && Map?.Data.Id == jumpMap && jumpStartT >= 0 ? PlaySec - jumpStartT : -1;

        private void OnInteractCollection(MapObjectData o)
        {
            var j = Map.Data.Jump;
            if (j == null || o.Id != j.ChestId) return;
            string id = Map.Data.Id;
            bool first = !Records.JumpClears.ContainsKey(id);
            double sec = JumpElapsed;
            string dkey = "jump." + id;
            bool dailyOk = Daily.Used(dkey, Clock()) == 0;
            if (!first && !dailyOk) { Out.Add(GameEventType.Message, o.Id, text: "今日のごほうびはもうもらった（明日また来よう）"); return; }
            Daily.Use(dkey, Clock());
            bool best = Records.OnJumpClear(id, sec);
            GiveReward(first ? j.First : j.Daily, o.X, o.Y);
            Out.Add(GameEventType.JumpCleared, id, (long)Math.Round(Math.Max(0, sec)), o.X, o.Y,
                Map.Data.Name + "を登りきった！" + (sec > 0 ? "（" + FormatTime(sec) + (best ? "・最短" : "") + "）" : ""));
            jumpStartT = PlaySec; // もう一度登るなら、ここから測り直す
            medalT = 0;
            CheckMedals();
            AutoSave.Request("jump");
        }

        private void GiveReward(RewardData r, double x, double y)
        {
            if (r == null) return;
            if (r.Meso > 0) { Inventory.AddMeso(r.Meso); Out.Add(GameEventType.MesoPicked, null, r.Meso, x, y); }
            foreach (var (item, count) in r.Items)
            {
                var def = Data.Item(item);
                if (def == null) continue;
                int rest = Inventory.Add(item, count);
                if (rest < count) Out.Add(GameEventType.ItemPicked, item, count - rest, x, y, def.Name);
                if (rest > 0) Map.SpawnDrops(Body.X, Body.Y, new List<DropItem> { new DropItem { ItemId = item, Count = rest } });
            }
        }

        public static string FormatTime(double sec)
        {
            int s = (int)Math.Round(sec);
            return s >= 60 ? (s / 60) + " 分 " + (s % 60) + " 秒" : s + " 秒";
        }

        // ---------------- 見た目（美容院）

        /// <summary>美容院（role "beauty" の NPC）で見た目を変える（1 回 LookFee ルド）。null の所は変えない。</summary>
        public LookResult ChangeLook(string npcId, string hair, string hairColor, string face)
        {
            var n = Map.Npc(npcId);
            if (n == null || n.Role != "beauty" || Dead) return LookResult.NoStylistHere;
            if ((hair != null && Array.IndexOf(LookState.Hairs, hair) < 0) || (hairColor != null && Array.IndexOf(LookState.HairColors, hairColor) < 0) || (face != null && Array.IndexOf(LookState.Faces, face) < 0)) return LookResult.Unknown;
            string h = hair ?? Look.Hair, c = hairColor ?? Look.HairColor, f = face ?? Look.Face;
            if (h == Look.Hair && c == Look.HairColor && f == Look.Face) return LookResult.Same;
            if (Inventory.Meso < LookFee) return LookResult.NotEnoughMeso;
            Inventory.AddMeso(-LookFee);
            Look.Hair = h; Look.HairColor = c; Look.Face = f;
            Out.Add(GameEventType.LookChanged, h + "/" + c + "/" + f, LookFee, text: "見た目が変わった");
            AutoSave.Request("look");
            return LookResult.Ok;
        }

        // ---------------- 全体マップの印

        public const int MarkAvailable = 1, MarkCompletable = 2, MarkObjective = 4, MarkHere = 8, MarkVisited = 16;

        /// <summary>全体マップの印（マップの ID → ビット: 1 受けられるクエストの依頼者・2 報告できる・4 進めているクエストの目的地・8 今いる所・16 行ったことがある）。開いた時だけ呼ぶ。</summary>
        public Dictionary<string, int> WorldMarks()
        {
            var m = new Dictionary<string, int>();
            void Set(string map, int bit) { if (map == null) return; m[map] = (m.TryGetValue(map, out var v) ? v : 0) | bit; }
            foreach (var id in Records.Visited) Set(id, MarkVisited);
            foreach (var n in Data.Npcs.Values)
            {
                int b = NpcBulb(n.Id);
                if (b == 2) Set(n.Map, MarkCompletable); else if (b == 1) Set(n.Map, MarkAvailable);
            }
            foreach (var q in Quests.InProgress())
            {
                for (int i = 0; i < q.Objectives.Count; i++)
                {
                    var o = q.Objectives[i];
                    if (Quests.Count(q, i, Inventory) >= o.Count) continue;
                    switch (o.Type)
                    {
                        case ObjectiveType.Kill: foreach (var map in Data.WorldMap.MapsOfMob(o.Target)) Set(map, MarkObjective); break;
                        case ObjectiveType.Visit: Set(o.Target, MarkObjective); break;
                        case ObjectiveType.Talk: if (Data.Npcs.TryGetValue(o.Target, out var nd)) Set(nd.Map, MarkObjective); break;
                        case ObjectiveType.Interact:
                        {
                            int dot = o.Target?.IndexOf('.') ?? -1;
                            if (dot > 0 && Data.WorldMap.Node(o.Target.Substring(0, dot)) != null) Set(o.Target.Substring(0, dot), MarkObjective);
                            break;
                        }
                    }
                }
            }
            Set(Map.Data.Id, MarkHere);
            return m;
        }

        // ---------------- 保存（版 4 の "collection"）

        private Dictionary<string, object> CollectionToDict()
        {
            var d = new Dictionary<string, object>
            {
                { "cards", Book.ToDict() },
                { "medals", MedalsEarned.ConvertAll(x => (object)x) },
                { "medal", Medal },
                { "records", Records.ToDict() },
                { "look", new Dictionary<string, object> { { "hair", Look.Hair }, { "hairColor", Look.HairColor }, { "face", Look.Face } } },
                { "cardRng", new List<object> { Save.SaveSerializer.UlongToHex(CardRng.State0), Save.SaveSerializer.UlongToHex(CardRng.State1) } },
            };
            return d;
        }

        private void ReadCollection(Dictionary<string, object> d, ulong seed)
        {
            cardRng = new Rng(seed ^ 0x5DEECE66DUL);
            if (d == null) return;
            Book.Read(J.Obj(d, "cards"));
            foreach (var id in J.StrList(d, "medals")) if (Medals.Get(id) != null && !MedalsEarned.Contains(id)) MedalsEarned.Add(id);
            var md = J.Str(d, "medal");
            Medal = md != null && MedalsEarned.Contains(md) ? md : null;
            Records.Read(J.Obj(d, "records"));
            var lk = J.Obj(d, "look");
            if (lk != null)
            {
                string h = J.Str(lk, "hair"), c = J.Str(lk, "hairColor"), f = J.Str(lk, "face");
                if (Array.IndexOf(LookState.Hairs, h) >= 0) Look.Hair = h;
                if (Array.IndexOf(LookState.HairColors, c) >= 0) Look.HairColor = c;
                if (Array.IndexOf(LookState.Faces, f) >= 0) Look.Face = f;
            }
            var cr = J.Arr(d, "cardRng");
            if (cr.Count == 2)
            {
                ulong a = Save.SaveSerializer.HexToUlong(cr[0] as string), b = Save.SaveSerializer.HexToUlong(cr[1] as string);
                if (a != 0 || b != 0) cardRng.SetState(a, b);
            }
        }
    }
}
