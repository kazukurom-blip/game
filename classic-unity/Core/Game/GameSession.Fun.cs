// 楽しさの要素（GameSession の続き。データは Data/fun.json ← Data/tools/fun.mjs、形は Core/Fun/）。
//   景品の機械（ガチャ）・フィールドボス・船の旅と襲撃・感情表現・遊び場（五目並べ・神経衰弱・景品）・季節の祭り・
//   美容院・珍しい色違いの敵・1 人用ダンジョンの部屋の課題とごほうびの部屋・見た目の品・天気。
// 既存のファイルからは呼び出しだけ（TickFun・TryInteractFun・OnMobSpawnedFun・OnMobKilledFun・AfterEnterMapFun・FunPortalOpen・
// TryUseFunItem・TravelFromDeck・WriteFunSave/ReadFunSave）。乱数は本体と別（funRng）なので、ほかの仕組みの乱数の並びは変わらない。
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Lumina.Core.Fun;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Save;
using Lumina.Core.Town;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public enum GachaResult { Ok, NoMachineHere, NoTicket, InventoryFull }
    public enum FunResult { Ok, NotHere, NotEnough, InventoryFull, Invalid, AlreadyDone }

    /// <summary>船の旅の途中（C118 の船の上）。</summary>
    public sealed class VoyageState
    {
        public VoyageDef Def;
        public string To, ToPortal, ToName;
        public double Total, Left;
        public int RaidIndex;                       // 次の襲撃の番号
        public readonly List<int> RaidUids = new List<int>(); // 今の襲撃の敵
        public bool RaidActive;
        public double Progress => Total > 0 ? Math.Max(0, Math.Min(1, 1 - Left / Total)) : 1;
    }

    /// <summary>1 人用ダンジョンの部屋の課題（壁で区切った部屋ごと）。</summary>
    public sealed class DungeonRoomTask
    {
        public string Kind;                         // kill / switch / carry / climb / null（最後の部屋）
        public double X1, X2;
        public bool Done;
        public int KillNeed, KillHave;
        public readonly List<(double x, double y)> Switches = new List<(double, double)>(); // 踏む順に並べた
        public int SwitchNext;
        public double CrateX, CrateY, GoalX, GoalY;
        public bool Carrying; public double CarryLeft;
        public double FlagX, FlagY;
        public string Label => Kind == "kill" ? "部屋の敵を " + KillNeed + " 体倒す" : Kind == "switch" ? "スイッチを 1・2・3 の順に調べる" : Kind == "carry" ? "荷物を時間内に出口の印へ運ぶ" : Kind == "climb" ? "いちばん高い足場の旗に触る" : null;
    }

    public sealed class DungeonRun
    {
        public string MapId;
        public readonly List<DungeonRoomTask> Rooms = new List<DungeonRoomTask>();
        public readonly List<(double x, double y, bool opened)> Chests = new List<(double, double, bool)>();
        public bool Rewarded;
        public int RoomAt(double x) { for (int i = 0; i < Rooms.Count; i++) if (x >= Rooms[i].X1 && x < Rooms[i].X2) return i; return Rooms.Count - 1; }
    }

    /// <summary>遊び場の今の遊び（五目並べか神経衰弱のどちらか）。</summary>
    public sealed class ArcadeGame
    {
        public string Kind, Level;                  // gomoku / memory、easy / normal
        public Gomoku Gomoku;
        public MemoryGame Memory;
        public bool Paid;                           // 点数を渡した
        public int LastPoints;
        public string ResultText;
    }

    public sealed partial class GameSession
    {
        /// <summary>楽しさの要素の保存する物（遊び場の点数・見た目・フィールドボスの時計）。</summary>
        public FunState Fun = new FunState();
        /// <summary>false にするとフィールドボス・珍しい個体・季節の敵・ダンジョンの課題を出さない（通しのボット用）。</summary>
        public bool FunEvents = true;
        private Rng funRngInst;
        private Rng FunRng => funRngInst ??= new Rng((Rng.State0 ^ 0xF00DF00DUL) + 7);

        // ---------------- 毎フレーム

        private void TickFun(double dt)
        {
            if (EmoteT > 0) { EmoteT -= dt; if (EmoteT <= 0) { EmoteT = 0; Emote = null; } }
            TickFieldBosses();
            TickVoyage(dt);
            TickDungeon(dt);
        }

        private void AfterEnterMapFun(MapData md)
        {
            if (Voyage != null && md.Id != Voyage.Def.Deck) Voyage = null; // 船を下りた（倒れた・帰還の書など）
            Dungeon = FunEvents && Data.Fun.DungeonTasks.TryGetValue(md.Id, out var tasks) ? NewDungeonRun(md, tasks) : null;
            Arcade = null;
            bossWarned.Clear();
            TickFieldBosses();
        }

        // ---------------- 町の機械・係（spots）

        /// <summary>今のマップに置いてある機械・係。</summary>
        public List<FunSpot> SpotsHere()
        {
            var l = new List<FunSpot>();
            foreach (var s in Data.Fun.Spots) if (s.Map == Map.Data.Id && (s.Kind != "season" || CurrentSeason() != null)) l.Add(s);
            return l;
        }

        /// <summary>話す/調べるキーで届く機械・係（横 50 px・縦 80 px）。</summary>
        public FunSpot SpotNear()
        {
            FunSpot best = null; double bd = 50;
            foreach (var s in SpotsHere())
            {
                double d = Math.Abs(s.X - Body.X);
                if (d <= bd && Math.Abs(s.Y - Body.Y) < 80) { bd = d; best = s; }
            }
            return best;
        }

        /// <summary>V で開いた機械・係（Unity・試遊版の窓が読んだら null に戻す）。</summary>
        public FunSpot LastSpot;

        private bool SpotHere(string spotId, string kind)
        {
            var s = Data.Fun.Spot(spotId);
            return s != null && s.Kind == kind && s.Map == Map.Data.Id && !Dead;
        }

        private bool TryInteractFun()
        {
            if (Dungeon != null && InteractDungeon()) return true;
            var s = SpotNear();
            if (s == null) return false;
            // NPC の方が近ければ NPC に話す
            foreach (var n in Map.Data.Npcs) if (Math.Abs(n.X - Body.X) < Math.Abs(s.X - Body.X) && Math.Abs(n.Y - Body.Y) < 80) return false;
            LastSpot = s;
            Out.Add(GameEventType.Fun, "spot", x: s.X, y: s.Y, text: s.Name);
            return true;
        }

        private bool GiveItem(string itemId, int count, double x, double y)
        {
            var def = Data.Item(itemId);
            if (def == null) return false;
            int rest = Inventory.Add(itemId, count);
            if (rest < count) Out.Add(GameEventType.ItemPicked, itemId, count - rest, text: def.Name);
            if (rest > 0) { Map.SpawnDrops(x, y, new List<DropItem> { new DropItem { ItemId = itemId, Count = rest } }); return false; }
            CollectNotes(itemId);
            return true;
        }

        private bool RoomFor(string itemId, int count) => Inventory.CanAdd(itemId, count);

        // ---------------- 1. 景品の機械

        /// <summary>景品の機械に券を 1 枚入れる。prize に出た物。</summary>
        public GachaResult Gacha(string spotId, out GachaPrize prize)
        {
            prize = null;
            var m = Data.Fun.Machine(spotId);
            if (m == null || !SpotHere(spotId, "gacha")) return GachaResult.NoMachineHere;
            if (!Inventory.Has(Data.Fun.Ticket)) return GachaResult.NoTicket;
            int total = m.TotalWeight;
            double r = FunRng.NextDouble() * total;
            foreach (var p in m.Prizes) { r -= p.Weight; if (r < 0) { prize = p; break; } }
            prize ??= m.Prizes[m.Prizes.Count - 1];
            bool card = Lumina.Core.Collection.MonsterBook.IsCard(prize.Item); // 図鑑のカードは持ち物ではなく図鑑へ
            if (!card && !RoomFor(prize.Item, prize.Count)) { prize = null; return GachaResult.InventoryFull; }
            Inventory.Remove(Data.Fun.Ticket);
            Fun.Pulls++;
            var def = Data.Item(prize.Item);
            if (card) PickupCard(new DropItem { ItemId = prize.Item, X = Body.X, Y = Body.Y });
            else GiveItem(prize.Item, prize.Count, Body.X, Body.Y);
            string pname = card ? (Data.Mob(Lumina.Core.Collection.MonsterBook.MobOfCard(prize.Item))?.Name + "のカード") : def?.Name;
            if (prize.Tier >= 2)
            {
                Fun.Jackpots++;
                Out.Add(GameEventType.Fun, "jackpot:" + prize.Item, prize.Count, Body.X, Body.Y, Character.Name + " さんが " + m.Name + " で大当たり「" + pname + "」を当てた！");
                AutoSave.Request("gacha");
            }
            else Out.Add(GameEventType.Fun, "gacha:" + prize.Item, prize.Tier, Body.X, Body.Y, (prize.Tier == 1 ? "少し珍しい！ " : "") + pname + (prize.Count > 1 ? " ×" + prize.Count : "") + " が出た");
            RefreshStats();
            return GachaResult.Ok;
        }

        /// <summary>景品の機械の券を買う（景品の機械・見た目の品の店で）。</summary>
        public FunResult BuyGachaTicket(string spotId, int count)
        {
            var s = Data.Fun.Spot(spotId);
            if (s == null || s.Map != Map.Data.Id || (s.Kind != "gacha" && s.Kind != "boutique") || count <= 0) return FunResult.NotHere;
            long cost = Data.Fun.TicketPrice * count;
            if (Inventory.Meso < cost) return FunResult.NotEnough;
            if (!RoomFor(Data.Fun.Ticket, count)) return FunResult.InventoryFull;
            Inventory.AddMeso(-cost);
            Inventory.Add(Data.Fun.Ticket, count);
            Out.Add(GameEventType.ItemBought, Data.Fun.Ticket, count);
            return FunResult.Ok;
        }

        // ---------------- 2. フィールドボス

        private readonly HashSet<string> bossWarned = new HashSet<string>();

        private Mob FieldBossMob(FieldBossDef b)
        {
            foreach (var m in Map.Mobs) if (m.Alive && !m.Removed && m.Def.Id == b.Mob && m.FieldBoss) return m;
            return null;
        }

        private double NextBossTime(FieldBossDef b) => PlaySec + FunRng.Range(b.MinSec, b.MaxSec);

        /// <summary>このマップのフィールドボスが湧くまでの秒（湧いている・このマップに無い時は -1）。</summary>
        public double FieldBossIn()
        {
            foreach (var b in Data.Fun.FieldBosses)
            {
                if (b.Map != Map.Data.Id || !Fun.BossDue.TryGetValue(b.Mob, out var due) || due < 0) continue;
                return Math.Max(0, due - PlaySec);
            }
            return -1;
        }

        private void TickFieldBosses()
        {
            if (!FunEvents || Map == null) return;
            foreach (var b in Data.Fun.FieldBosses)
            {
                if (!Fun.BossDue.TryGetValue(b.Mob, out var due)) { Fun.BossDue[b.Mob] = NextBossTime(b); continue; }
                if (b.Map != Map.Data.Id) continue;
                if (due < 0)
                {
                    // 湧いているはず: このマップ（の残っている形）にいなければ、入った時にまた出す
                    if (FieldBossMob(b) == null) SpawnFieldBoss(b);
                    continue;
                }
                if (PlaySec >= due - b.WarnSec && !bossWarned.Contains(b.Mob))
                {
                    bossWarned.Add(b.Mob);
                    var def = Data.Mob(b.Mob);
                    Out.Add(GameEventType.Fun, "boss_warn", (long)Math.Ceiling(Math.Max(0, due - PlaySec)), Body.X, Body.Y, "どこからか大きな気配がする…（まもなく「" + def?.Name + "」が現れる）");
                }
                if (PlaySec >= due) SpawnFieldBoss(b);
            }
        }

        private void SpawnFieldBoss(FieldBossDef b)
        {
            double x = Map.Data.Width / 2, y = 0;
            if (Map.Data.Spawns.Count > 0) { var sp = Map.Data.Spawns[FunRng.Range(0, Map.Data.Spawns.Count - 1)]; x = sp.X; y = sp.Y; }
            spawningFun = true;
            var m = Map.Spawn(b.Mob, x, y);
            spawningFun = false;
            if (m == null) return;
            m.FieldBoss = true; m.Timed = true;
            Fun.BossDue[b.Mob] = -1;
            bossWarned.Remove(b.Mob);
            Out.Add(GameEventType.Fun, "boss_spawn:" + b.Mob, 0, m.X, m.Y, "「" + m.Def.Name + "」が現れた！");
        }

        // ---------------- 3. 船の旅と襲撃

        public VoyageState Voyage;

        /// <summary>この乗り物の係で船の旅ができるか（できなければ Travel でそのまま着く）。</summary>
        public bool HasVoyage(string npcId) => Data.Fun.Voyage(npcId) != null && Map.Npc(npcId)?.Travel != null;

        /// <summary>船に乗る（船の上で sec 秒の旅。途中で襲撃）。船の旅の無い乗り物は Travel と同じ。</summary>
        public bool Board(string npcId, bool useTicket = false)
        {
            var v = Data.Fun.Voyage(npcId);
            if (v == null || Data.GetMap(v.Deck) == null) return Travel(npcId, useTicket);
            if (!PayTravel(npcId, useTicket, out var t)) return false;
            Out.Add(GameEventType.Travel, t.To);
            Voyage = null;
            ChangeMap(v.Deck, Data.GetMap(v.Deck).FindPortalByName("sp") != null ? "sp" : null);
            Voyage = new VoyageState { Def = v, To = t.To, ToPortal = t.ToPortal, ToName = Data.GetMap(t.To)?.Name ?? t.To, Total = v.Sec, Left = v.Sec };
            Map.Mobs.RemoveAll(m => true); // 前の旅の敵は残さない
            Out.Add(GameEventType.Fun, "voyage_start", (long)v.Sec, Body.X, Body.Y, Voyage.ToName + "行きの船が出た（およそ " + Math.Round(v.Sec) + " 秒）");
            return true;
        }

        /// <summary>待たずに着く（船の上で「すぐ着く」）。</summary>
        public bool VoyageSkip()
        {
            if (Voyage == null) return false;
            ArriveVoyage();
            return true;
        }

        private bool TravelFromDeck(string npcId)
        {
            if (Voyage == null || Map.Data.Id != Voyage.Def.Deck || Map.Npc(npcId)?.Travel == null) return false;
            ArriveVoyage();
            return true;
        }

        private void ArriveVoyage()
        {
            var v = Voyage;
            Voyage = null;
            Out.Add(GameEventType.Fun, "voyage_arrive", 0, Body.X, Body.Y, v.ToName + "に着いた");
            ChangeMap(v.To, v.ToPortal);
        }

        private void TickVoyage(double dt)
        {
            var v = Voyage;
            if (v == null) return;
            if (Map.Data.Id != v.Def.Deck) { Voyage = null; return; }
            if (Dead) return;
            v.Left -= dt;
            // 襲撃
            if (v.RaidIndex < v.Def.Raids.Count && v.Progress >= v.Def.Raids[v.RaidIndex].At)
            {
                var r = v.Def.Raids[v.RaidIndex++];
                v.RaidUids.Clear();
                for (int i = 0; i < r.Count && r.Mobs.Count > 0; i++)
                {
                    double x = Math.Max(80, Math.Min(Map.Data.Width - 80, Body.X + (i % 2 == 0 ? 1 : -1) * (180 + 70 * i)));
                    spawningFun = true;
                    var m = Map.Spawn(r.Mobs[i % r.Mobs.Count], x, Body.Y - 120);
                    spawningFun = false;
                    if (m != null) { m.AggroT = Mob.AggroTime * 4; v.RaidUids.Add(m.Uid); }
                }
                v.RaidActive = v.RaidUids.Count > 0;
                Out.Add(GameEventType.Fun, "voyage_raid", v.RaidUids.Count, Body.X, Body.Y, "空の魔物が船に乗り込んできた！");
            }
            if (v.RaidActive && !v.RaidUids.Exists(u => Map.FindMob(u) is Mob m && m.Alive && !m.Removed))
            {
                v.RaidActive = false;
                long meso = v.Def.BonusMeso;
                Inventory.AddMeso(meso);
                Out.Add(GameEventType.MesoPicked, "voyage", meso);
                string extra = "";
                if (FunRng.Chance(v.Def.TicketChance) && GiveItem(Data.Fun.Ticket, 1, Body.X, Body.Y)) extra = "・景品の機械の券";
                Out.Add(GameEventType.Fun, "voyage_clear", meso, Body.X, Body.Y, "船を守った！ 船長からお礼 " + meso + " ルド" + extra);
            }
            if (v.Left <= 0) ArriveVoyage();
        }

        // ---------------- 4. 感情表現

        /// <summary>今の感情表現（null = いつもの顔）と残りの秒。</summary>
        public string Emote; public double EmoteT;

        public bool DoEmote(string id)
        {
            var e = Data.Fun.Emote(id);
            if (e == null || Dead) return false;
            Emote = id; EmoteT = Data.Fun.EmoteSec;
            Out.Add(GameEventType.Fun, "emote:" + id, 0, Body.X, Body.Y, e.Name);
            return true;
        }

        // ---------------- 5. 遊び場

        public ArcadeGame Arcade;

        public FunResult StartArcade(string spotId, string kind, string level)
        {
            if (!SpotHere(spotId, "arcade")) return FunResult.NotHere;
            level = level == "normal" ? "normal" : "easy";
            var f = Data.Fun;
            if (kind == "gomoku") Arcade = new ArcadeGame { Kind = kind, Level = level, Gomoku = new Gomoku(f.GomokuSize, level, FunRng) };
            else if (kind == "memory") Arcade = new ArcadeGame { Kind = kind, Level = level, Memory = new MemoryGame(f.MemoryPairs, f.MemoryRecall.TryGetValue(level, out var rc) ? rc : 0.5, FunRng) };
            else return FunResult.Invalid;
            return FunResult.Ok;
        }

        public FunResult GomokuPlay(int x, int y)
        {
            var g = Arcade?.Gomoku;
            if (g == null) return FunResult.Invalid;
            if (!g.Play(x, y)) return FunResult.Invalid;
            if (g.Result != GomokuResult.Playing) PayArcade(g.Result == GomokuResult.PlayerWin ? 0 : g.Result == GomokuResult.Draw ? 1 : 2, Data.Fun.GomokuPoints);
            return FunResult.Ok;
        }

        public FunResult MemoryFlip(int i)
        {
            var m = Arcade?.Memory;
            if (m == null || !m.Flip(i)) return FunResult.Invalid;
            if (m.Finished) PayArcade(m.PlayerPairs > m.NpcPairs ? 0 : m.PlayerPairs == m.NpcPairs ? 1 : 2, Data.Fun.MemoryPoints);
            return FunResult.Ok;
        }

        public FunResult MemoryContinue()
        {
            var m = Arcade?.Memory;
            if (m == null) return FunResult.Invalid;
            m.Continue();
            if (m.Finished) PayArcade(m.PlayerPairs > m.NpcPairs ? 0 : m.PlayerPairs == m.NpcPairs ? 1 : 2, Data.Fun.MemoryPoints);
            return FunResult.Ok;
        }

        /// <summary>outcome: 0 勝ち・1 引き分け・2 負け</summary>
        private void PayArcade(int outcome, Dictionary<string, int[]> table)
        {
            var a = Arcade;
            if (a == null || a.Paid) return;
            a.Paid = true;
            int pts = table.TryGetValue(a.Level, out var t) && t.Length > outcome ? t[outcome] : 0;
            a.LastPoints = pts;
            Fun.Points += pts;
            if (outcome == 0) Fun.Wins++;
            a.ResultText = (outcome == 0 ? "勝ち！" : outcome == 1 ? "引き分け" : "負け…") + " 遊び場の点数 +" + pts;
            Out.Add(GameEventType.Fun, "arcade", pts, Body.X, Body.Y, a.ResultText);
            AutoSave.Request("arcade");
        }

        /// <summary>遊び場の点数で景品と替える。</summary>
        public FunResult ArcadeExchange(string spotId, int index)
        {
            if (!SpotHere(spotId, "arcade")) return FunResult.NotHere;
            var l = Data.Fun.ArcadePrizes;
            if (index < 0 || index >= l.Count) return FunResult.Invalid;
            var p = l[index];
            if (Fun.Points < p.Cost) return FunResult.NotEnough;
            if (!RoomFor(p.Item, p.Count)) return FunResult.InventoryFull;
            Fun.Points -= p.Cost;
            GiveItem(p.Item, p.Count, Body.X, Body.Y);
            AutoSave.Request("arcade");
            return FunResult.Ok;
        }

        // ---------------- 6. 季節の祭り

        /// <summary>今の季節の祭り（実際の日付の月。無ければ null）。</summary>
        public SeasonDef CurrentSeason()
        {
            int month = Clock().AddHours(HourOffset).Month;
            foreach (var s in Data.Fun.Seasons) if (s.Months.Contains(month)) return s;
            return null;
        }

        private string SeasonKey(SeasonDef s)
        {
            var t = Clock().AddHours(HourOffset);
            int year = t.Month <= 2 && s.Months.Contains(12) ? t.Year - 1 : t.Year; // 冬は 12 月の年
            return s.Id + "." + year;
        }

        /// <summary>季節の頼みごとを済ませたか（今年の初回）と、今日もう済ませたか。</summary>
        public (bool first, bool today) SeasonStatus()
        {
            var s = CurrentSeason();
            if (s == null) return (false, false);
            return (Fun.SeasonFirst.Contains(SeasonKey(s)), Daily.Used("season." + s.Id, Clock()) > 0);
        }

        /// <summary>季節の品を渡す（初回は記念の品、2 回目からは 1 日 1 回の小さなお礼）。</summary>
        public FunResult SeasonTurnIn(string spotId)
        {
            var s = CurrentSeason();
            if (s == null || !SpotHere(spotId, "season")) return FunResult.NotHere;
            if (!Inventory.Has(s.TaskItem, s.TaskCount)) return FunResult.NotEnough;
            bool first = !Fun.SeasonFirst.Contains(SeasonKey(s));
            if (!first && Daily.Used("season." + s.Id, Clock()) > 0) return FunResult.AlreadyDone;
            var rewards = first ? s.First : s.Again;
            foreach (var r in rewards) if (!RoomFor(r.Item, r.Count)) return FunResult.InventoryFull;
            Inventory.Remove(s.TaskItem, s.TaskCount);
            foreach (var r in rewards) GiveItem(r.Item, r.Count, Body.X, Body.Y);
            if (first) Fun.SeasonFirst.Add(SeasonKey(s));
            Daily.Use("season." + s.Id, Clock());
            Out.Add(GameEventType.Fun, "season", first ? 1 : 0, Body.X, Body.Y, s.Name + "のお礼をもらった");
            AutoSave.Request("season");
            return FunResult.Ok;
        }

        // ---------------- 7. 美容院

        /// <summary>髪型・髪の色・顔・肌の色を変える（kind: hair / hairColor / face / skin）。券があれば券を、無ければお金を使う。</summary>
        public FunResult SalonChange(string spotId, string kind, string value, bool useCoupon)
        {
            if (!SpotHere(spotId, "salon")) return FunResult.NotHere;
            if (!Data.Fun.Salon.TryGetValue(kind, out var list) || !list.Exists(x => x.id == value)) return FunResult.Invalid;
            string coupon = Data.Fun.SalonCoupon.TryGetValue(kind, out var c) ? c : null;
            long price = Data.Fun.SalonPrice.TryGetValue(kind, out var p) ? p : 0;
            if (useCoupon) { if (coupon == null || !Inventory.Has(coupon)) return FunResult.NotEnough; Inventory.Remove(coupon); }
            else { if (Inventory.Meso < price) return FunResult.NotEnough; Inventory.AddMeso(-price); }
            var l = Fun.Look;
            switch (kind) { case "hair": l.Hair = value; break; case "hairColor": l.HairColor = value; break; case "face": l.Face = value; break; default: l.Skin = value; break; }
            Out.Add(GameEventType.Fun, "salon", 0, Body.X, Body.Y, "見た目が変わった");
            AutoSave.Request("salon");
            return FunResult.Ok;
        }

        // ---------------- 10. 見た目の品（帽子・服・名札・吹き出し）と店

        private bool TryUseFunItem(ItemDef def)
        {
            if (!Data.Fun.Looks.TryGetValue(def.Id, out var lk)) return false;
            bool off = Fun.Look.Get(lk.kind) == def.Id;
            Fun.Look.Set(lk.kind, off ? null : def.Id);
            Out.Add(GameEventType.Fun, "look", off ? 0 : 1, Body.X, Body.Y, def.Name + (off ? "を外した" : "を着けた"));
            AutoSave.Request("look");
            return true;
        }

        /// <summary>見た目の品が持ち物に無くなったら外す（売った・預けた時）。</summary>
        public void CheckLook()
        {
            foreach (var k in new[] { "hat", "outfit", "tag", "bubble" })
            {
                var id = Fun.Look.Get(k);
                if (id != null && !Inventory.Has(id) && !Storage.Items.Exists(x => x?.ItemId == id)) Fun.Look.Set(k, null);
            }
        }

        public FunResult BoutiqueBuy(string spotId, int index)
        {
            if (!SpotHere(spotId, "boutique")) return FunResult.NotHere;
            var l = Data.Fun.Boutique;
            if (index < 0 || index >= l.Count) return FunResult.Invalid;
            var p = l[index];
            if (Inventory.Meso < p.Cost) return FunResult.NotEnough;
            if (!RoomFor(p.Item, 1)) return FunResult.InventoryFull;
            Inventory.AddMeso(-p.Cost);
            GiveItem(p.Item, 1, Body.X, Body.Y);
            Out.Add(GameEventType.ItemBought, p.Item, 1);
            return FunResult.Ok;
        }

        /// <summary>踏破の印で品と替える（市場の印の交換所）。</summary>
        public FunResult MarkExchange(string spotId, int index)
        {
            if (!SpotHere(spotId, "marks")) return FunResult.NotHere;
            var l = Data.Fun.MarkPrizes;
            if (index < 0 || index >= l.Count) return FunResult.Invalid;
            var p = l[index];
            if (!Inventory.Has(Data.Fun.Mark, p.Cost)) return FunResult.NotEnough;
            if (!RoomFor(p.Item, p.Count)) return FunResult.InventoryFull;
            Inventory.Remove(Data.Fun.Mark, p.Cost);
            GiveItem(p.Item, p.Count, Body.X, Body.Y);
            return FunResult.Ok;
        }

        // ---------------- 8. 珍しい色違いの敵・季節の敵（MapInstance.OnSpawned）

        private bool spawningFun;

        private void OnMobSpawnedFun(MapInstance map, Mob m)
        {
            if (!FunEvents || spawningFun || m.Def.Boss != null || m.Def.IsElite || m.Def.IsBoss) return;
            var md = map.Data;
            var f = Data.Fun;
            if (f.RareChance > 0 && FunRng.Chance(f.RareChance))
            {
                m.Rare = true;
                m.MaxHpOverride = (int)Math.Round(m.Def.Hp * f.RareHpMul);
                m.Hp = m.MaxHpOverride;
                m.AtkScale *= f.RareAtkMul;
                Book.AddVariant(m.Def.Id, "rare_seen"); // 図鑑: 珍しい個体を見た数
                Out.Add(GameEventType.Fun, "rare:" + m.Def.Id, m.Uid, m.X, m.Y, "珍しい色違いの「" + m.Def.Name + "」が現れた！");
            }
            // 季節の敵: 季節のマップでは、湧いた敵のそばにたまに季節の敵が混ざる
            var s = CurrentSeason();
            if (s != null && md != null && s.Maps.Contains(md.Id) && FunRng.Chance(s.MobChance))
            {
                spawningFun = true;
                map.Spawn(s.Mob, m.X + 30, m.Y);
                spawningFun = false;
            }
        }

        private void OnMobKilledFun(Mob mob, List<DropItem> drops)
        {
            var def = mob.Def;
            var f = Data.Fun;
            // 景品の機械の券（どの敵からも稀に）
            if (f.MobTicketChance > 0 && FunRng.Chance(f.MobTicketChance)) drops.Add(new DropItem { ItemId = f.Ticket });
            if (mob.Rare)
            {
                GainExp((long)Math.Round(def.Exp * (f.RareExpMul - 1)));
                for (int i = 1; i < f.RareDropRolls; i++) drops.AddRange(DropRoller.Roll(def, Data, FunRng, 1 + Stats.Mods.DropPct / 100, 1 + Stats.Mods.MesoPct / 100));
                foreach (var d in drops) if (d.IsMeso) d.Meso = (long)Math.Round(d.Meso * f.RareMesoMul);
                foreach (var b in f.RareBonus) if (FunRng.Chance(b.Chance)) drops.Add(new DropItem { ItemId = b.Item, Count = b.Count });
                Flags["rare." + def.Id] = true;
                Book.AddVariant(def.Id, "rare_killed"); // 図鑑: 珍しい個体を倒した数
                Out.Add(GameEventType.Fun, "rare_down:" + def.Id, 0, mob.X, mob.Y, "珍しい「" + def.Name + "」を倒した！");
            }
            // フィールドボス
            if (mob.FieldBoss)
            {
                var b = f.FieldBoss(def.Id);
                if (b != null)
                {
                    Fun.BossDue[b.Mob] = NextBossTime(b);
                    foreach (var d in b.Drops) if (FunRng.Chance(d.Chance)) drops.Add(new DropItem { ItemId = d.Item, Count = d.Count });
                    Out.Add(GameEventType.Fun, "boss_down:" + def.Id, 0, mob.X, mob.Y, "「" + def.Name + "」を倒した！ 次に現れるのはしばらく先…");
                    AutoSave.Request("fieldboss");
                }
            }
            // ダンジョン
            var run = Dungeon;
            if (run != null)
            {
                int ri = run.RoomAt(mob.X);
                var room = run.Rooms[ri];
                if (room.Kind == "kill" && !room.Done && !mob.Summoned)
                {
                    room.KillHave++;
                    if (room.KillHave >= room.KillNeed) FinishRoomTask(ri);
                    else Out.Add(GameEventType.Fun, "dungeon_progress", room.KillHave, mob.X, mob.Y, "部屋の敵 " + room.KillHave + "/" + room.KillNeed);
                }
                if (RoomCleared && !run.Rewarded) RewardDungeon(run, mob.X);
            }
        }

        // ---------------- 9. 1 人用ダンジョン（部屋の課題・ごほうびの部屋）

        public DungeonRun Dungeon;

        private DungeonRun NewDungeonRun(MapData md, List<string> tasks)
        {
            var run = new DungeonRun { MapId = md.Id };
            var xs = new List<double>();
            foreach (var w in md.Walls) xs.Add(w.X);
            xs.Sort();
            double left = 0;
            var bounds = new List<(double, double)>();
            foreach (var x in xs) { bounds.Add((left, x)); left = x; }
            bounds.Add((left, md.Width));
            ulong seed = 0xD00DUL;
            foreach (char c in md.Id) seed = (seed ^ c) * 1099511628211UL;
            var rng = new Rng(seed ^ (ulong)DailyLog.DayNumber(Clock()) * 0x9E3779B97F4A7C15UL);
            for (int i = 0; i < bounds.Count; i++)
            {
                var (x1, x2) = bounds[i];
                var t = new DungeonRoomTask { X1 = x1, X2 = x2, Kind = i < bounds.Count - 1 && tasks.Count > 0 ? tasks[i % tasks.Count] : null };
                t.Done = t.Kind == null;
                // 部屋の中の足場（地面以外）
                var plats = new List<(double x, double y, double top)>();
                double gy = 0;
                foreach (var fh in md.Footholds)
                {
                    if (fh.Points.Count < 2) continue;
                    double a = fh.Points[0][0], b = fh.Points[fh.Points.Count - 1][0];
                    double cx = (a + b) / 2, cy = (fh.Points[0][1] + fh.Points[fh.Points.Count - 1][1]) / 2;
                    if (cx < x1 || cx >= x2) continue;
                    if (fh.Ground) { gy = cy; continue; }
                    plats.Add((cx, cy, cy));
                }
                if (gy == 0) gy = md.Height - 80;
                switch (t.Kind)
                {
                    case "kill":
                        int n = 0;
                        foreach (var sp in md.Spawns) if (sp.X >= x1 && sp.X < x2) n++;
                        t.KillNeed = Math.Max(3, Math.Min(8, n));
                        break;
                    case "switch":
                    {
                        var spots = new List<(double, double)>();
                        plats.Sort((p, q) => p.x.CompareTo(q.x));
                        foreach (var p in plats) if (spots.Count < 3) spots.Add((p.x, p.y));
                        double step = (x2 - x1) / 4;
                        for (int k = spots.Count; k < 3; k++) spots.Add((x1 + step * (k + 1), gy));
                        for (int k = spots.Count - 1; k > 0; k--) { int j = rng.Range(0, k); (spots[k], spots[j]) = (spots[j], spots[k]); }
                        t.Switches.AddRange(spots);
                        break;
                    }
                    case "carry":
                        t.CrateX = x1 + 180; t.CrateY = gy; t.GoalX = x2 - 160; t.GoalY = gy;
                        break;
                    case "climb":
                        if (plats.Count == 0) { t.FlagX = (x1 + x2) / 2; t.FlagY = gy; }
                        else { var hi = plats[0]; foreach (var p in plats) if (p.y < hi.y) hi = p; t.FlagX = hi.x; t.FlagY = hi.y; }
                        break;
                }
                run.Rooms.Add(t);
            }
            return run;
        }

        private bool FunPortalOpen(PortalData p)
        {
            var run = Dungeon;
            if (run == null || p.To != null || p.ToPortal == null || Map.Data.Id != run.MapId) return true;
            var dst = Map.Data.FindPortalByName(p.ToPortal);
            if (dst == null) return true;
            int from = run.RoomAt(p.X), to = run.RoomAt(dst.X);
            if (to <= from) return true;
            for (int i = from; i < to; i++)
            {
                if (run.Rooms[i].Done) continue;
                Out.Add(GameEventType.Message, "dungeon_locked", text: "扉が閉じている。部屋の課題: " + run.Rooms[i].Label);
                return false;
            }
            return true;
        }

        private void FinishRoomTask(int i)
        {
            var room = Dungeon.Rooms[i];
            if (room.Done) return;
            room.Done = true; room.Carrying = false;
            Out.Add(GameEventType.Fun, "dungeon_task", i + 1, Body.X, Body.Y, "部屋の課題を達成！ 次の部屋への扉が開いた");
        }

        private bool InteractDungeon()
        {
            var run = Dungeon;
            int ri = run.RoomAt(Body.X);
            var room = run.Rooms[ri];
            bool Near(double x, double y) => Math.Abs(x - Body.X) <= 36 && Math.Abs(y - Body.Y) <= 60;
            if (!room.Done && room.Kind == "switch")
            {
                for (int k = 0; k < room.Switches.Count; k++)
                {
                    if (!Near(room.Switches[k].x, room.Switches[k].y)) continue;
                    if (k < room.SwitchNext) return true;
                    if (k == room.SwitchNext)
                    {
                        room.SwitchNext++;
                        if (room.SwitchNext >= room.Switches.Count) FinishRoomTask(ri);
                        else Out.Add(GameEventType.Fun, "dungeon_progress", room.SwitchNext, Body.X, Body.Y, "スイッチ " + room.SwitchNext + " が光った");
                    }
                    else { room.SwitchNext = 0; Out.Add(GameEventType.Fun, "dungeon_reset", 0, Body.X, Body.Y, "順番が違う！ スイッチが全部消えた"); }
                    return true;
                }
            }
            if (!room.Done && room.Kind == "carry" && !room.Carrying && Near(room.CrateX, room.CrateY))
            {
                room.Carrying = true; room.CarryLeft = Data.Fun.CarrySec;
                Out.Add(GameEventType.Fun, "dungeon_progress", (long)room.CarryLeft, Body.X, Body.Y, "荷物を持った！ " + Math.Round(room.CarryLeft) + " 秒のうちに出口の印へ");
                return true;
            }
            for (int k = 0; k < run.Chests.Count; k++)
            {
                var c = run.Chests[k];
                if (c.opened || !Near(c.x, c.y)) continue;
                run.Chests[k] = (c.x, c.y, true);
                OpenDungeonChest(c.x, c.y);
                return true;
            }
            return false;
        }

        private void TickDungeon(double dt)
        {
            var run = Dungeon;
            if (run == null || Dead || Map.Data.Id != run.MapId) return;
            int ri = run.RoomAt(Body.X);
            var room = run.Rooms[ri];
            if (room.Done) return;
            if (room.Kind == "carry" && room.Carrying)
            {
                room.CarryLeft -= dt;
                if (Math.Abs(Body.X - room.GoalX) <= 40 && Math.Abs(Body.Y - room.GoalY) <= 60) FinishRoomTask(ri);
                else if (room.CarryLeft <= 0) { room.Carrying = false; Out.Add(GameEventType.Fun, "dungeon_reset", 0, Body.X, Body.Y, "時間切れ。荷物は元の所へ戻った"); }
            }
            if (room.Kind == "climb" && Math.Abs(Body.X - room.FlagX) <= 30 && Math.Abs(Body.Y - room.FlagY) <= 40 && Body.OnGround) FinishRoomTask(ri);
        }

        private void RewardDungeon(DungeonRun run, double x)
        {
            run.Rewarded = true;
            var f = Data.Fun;
            int ri = run.RoomAt(x);
            var room = run.Rooms[ri];
            double cx = (room.X1 + room.X2) / 2, gy = Body.Y;
            foreach (var fh in Map.Data.Footholds) if (fh.Ground && fh.Points.Count > 1 && fh.Points[0][0] <= cx && fh.Points[fh.Points.Count - 1][0] >= cx) gy = fh.Points[0][1];
            for (int i = 0; i < f.Chests; i++) run.Chests.Add((cx + (i - (f.Chests - 1) / 2.0) * 90, gy, false));
            GiveItem(f.Mark, 1, Body.X, Body.Y);
            Out.Add(GameEventType.Fun, "dungeon_chest", f.Chests, cx, gy, "ごほうびの宝箱が現れた！ 踏破の印を 1 つもらった");
        }

        private void OpenDungeonChest(double x, double y)
        {
            var f = Data.Fun;
            int lv = Math.Max(1, Map.Data.LvMin > 0 ? Map.Data.LvMin : Character.Level);
            var drops = new List<DropItem> { new DropItem { Meso = (long)Math.Round(lv * lv * 2 + 200 * FunRng.Range(0.8, 1.2)) } };
            if (f.ChestItems.Count > 0) drops.Add(new DropItem { ItemId = f.ChestItems[FunRng.Range(0, f.ChestItems.Count - 1)] });
            Map.SpawnDrops(x, y - 10, drops);
            Out.Add(GameEventType.ChestOpened, "dungeon_chest", drops[0].Meso, x, y);
        }

        // ---------------- 11. 天気

        /// <summary>今のマップの天気（rain / snow / petals / fog。null = 晴れ）。実時間の 1 時間ごとにマップごとに決まる。</summary>
        public string Weather() => WeatherAt(Map.Data, Clock());

        public string WeatherAt(MapData md, DateTime now)
        {
            var f = Data.Fun;
            if (md == null || (md.Theme != null && f.IndoorThemes.Contains(md.Theme))) return null;
            long hour = (long)Math.Floor((now - new DateTime(2000, 1, 1)).TotalHours);
            foreach (var r in f.Weather)
            {
                if (!Regex.IsMatch(md.Id, r.Match)) continue;
                if (r.Chance >= 1) return r.Kind;
                ulong h = 1469598103934665603UL;
                foreach (char c in md.Id) h = (h ^ c) * 1099511628211UL;
                h ^= (ulong)hour * 0x9E3779B97F4A7C15UL;
                h = (h ^ (h >> 31)) * 0xBF58476D1CE4E5B9UL;
                double roll = ((h >> 11) & ((1UL << 40) - 1)) / (double)(1UL << 40);
                return roll < r.Chance ? r.Kind : null;
            }
            return null;
        }

        /// <summary>今の天気の BGM の音量の倍率（雨は少し小さく）。</summary>
        public double WeatherBgmVolume() { var w = Weather(); return w != null && Data.Fun.WeatherBgm.TryGetValue(w, out var v) ? v : 1; }

        // ---------------- セーブ

        private void WriteFunSave(SaveData s)
        {
            CheckLook();
            s.Fun = Fun.ToDict();
            // 船の旅の途中: 着く所に置いておく（読み込んだら着いている）
            if (Voyage != null && !Dead) { s.Map = Voyage.To; s.X = 0; s.Y = 0; }
        }

        private void ReadFunSave(SaveData s)
        {
            Fun = FunState.FromDict(s.Fun);
        }
    }
}
