// 楽しさの要素の口（試遊版）。Core の GameSession.Fun.cs を JS の js/fun.js から呼ぶ。
//   FunFrame()            … 毎フレーム: 見た目・感情表現・町の機械・船の旅・フィールドボス・天気・季節・ダンジョンの仕掛け・V で開いた機械
//   FunUi(spot)           … 機械・係の窓の中身（景品の機械の確率・遊び場の盤・美容院の選べる物・店の品…）
//   Act の続き（Actions.cs の default から Fun.Run）: gacha / buyTicket / board / voyageSkip / emote / arcade* / gomoku / memFlip / memCont / salon / boutique / marks / season
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices.JavaScript;
using Lumina.Core.Fun;
using Lumina.Core.Game;
using Lumina.Core.Util;

namespace Lumina.Web
{
    public static partial class Program
    {
        [JSExport]
        public static string FunFrame() => S == null ? "null" : Fun.Frame(S);

        [JSExport]
        public static string FunUi(string spot) => S == null ? "null" : Fun.SpotUi(S, spot);
    }

    public static class Fun
    {
        private static Dictionary<string, object> D(params (string k, object v)[] kv) => Ui.D(kv);

        public static string Frame(GameSession s)
        {
            var l = s.Fun.Look;
            var o = D(("look", l.ToDict()), ("emote", s.Emote), ("emoteFace", s.Emote != null ? s.Data.Fun.Emote(s.Emote)?.Face : null), ("weather", s.Weather()), ("bgmVol", s.WeatherBgmVolume()),
                ("season", s.Map.Data.IsTown ? s.CurrentSeason()?.Deco : null), ("bossIn", Math.Round(s.FieldBossIn())), ("points", s.Fun.Points));
            var spots = new List<object>();
            foreach (var sp in s.SpotsHere()) spots.Add(D(("id", sp.Id), ("kind", sp.Kind), ("name", sp.Name), ("x", sp.X), ("y", sp.Y)));
            o["spots"] = spots;
            var near = s.SpotNear();
            if (near != null) o["near"] = near.Id;
            if (s.LastSpot != null) { o["open"] = s.LastSpot.Id; s.LastSpot = null; }
            var v = s.Voyage;
            if (v != null) o["voyage"] = D(("to", v.ToName), ("left", Math.Max(0, Math.Round(v.Left))), ("total", Math.Round(v.Total)), ("raid", v.RaidActive));
            var dg = s.Dungeon;
            if (dg != null && dg.MapId == s.Map.Data.Id)
            {
                var rooms = new List<object>();
                foreach (var r in dg.Rooms)
                {
                    var sw = new List<object>();
                    foreach (var p in r.Switches) sw.Add(new List<object> { p.x, p.y });
                    rooms.Add(D(("kind", r.Kind), ("done", r.Done), ("label", r.Label), ("x1", r.X1), ("x2", r.X2), ("kill", r.KillHave), ("need", r.KillNeed),
                        ("sw", sw), ("next", r.SwitchNext), ("crate", new List<object> { r.CrateX, r.CrateY }), ("goal", new List<object> { r.GoalX, r.GoalY }),
                        ("carry", r.Carrying), ("carryLeft", Math.Round(r.CarryLeft, 1)), ("flag", new List<object> { r.FlagX, r.FlagY })));
                }
                var chests = new List<object>();
                foreach (var c in dg.Chests) chests.Add(new List<object> { c.x, c.y, c.opened });
                o["dungeon"] = D(("rooms", rooms), ("at", dg.RoomAt(s.Body.X)), ("chests", chests));
            }
            return Json.Serialize(o);
        }

        public static string SpotUi(GameSession s, string spotId)
        {
            var f = s.Data.Fun;
            var sp = f.Spot(spotId);
            if (sp == null) return "null";
            var o = D(("id", sp.Id), ("kind", sp.Kind), ("name", sp.Name), ("meso", s.Inventory.Meso), ("points", s.Fun.Points),
                ("tickets", s.Inventory.Count(f.Ticket)), ("ticketPrice", f.TicketPrice));
            switch (sp.Kind)
            {
                case "gacha":
                {
                    var m = f.Machine(sp.Id);
                    var list = new List<object>();
                    double total = m.TotalWeight;
                    foreach (var p in m.Prizes) list.Add(D(("item", p.Item), ("n", p.Count), ("tier", p.Tier), ("pct", Math.Round(p.Weight * 100.0 / total, 2))));
                    var tiers = new double[3];
                    foreach (var p in m.Prizes) tiers[Math.Min(2, p.Tier)] += p.Weight * 100.0 / total;
                    o["prizes"] = list; o["tiers"] = new List<object> { Math.Round(tiers[0], 1), Math.Round(tiers[1], 1), Math.Round(tiers[2], 1) };
                    o["pulls"] = s.Fun.Pulls; o["jackpots"] = s.Fun.Jackpots;
                    break;
                }
                case "arcade":
                {
                    var list = new List<object>();
                    foreach (var p in f.ArcadePrizes) list.Add(D(("item", p.Item), ("n", p.Count), ("cost", p.Cost)));
                    o["prizes"] = list;
                    o["gomokuPts"] = Pts(f.GomokuPoints); o["memoryPts"] = Pts(f.MemoryPoints);
                    o["wins"] = s.Fun.Wins;
                    var a = s.Arcade;
                    if (a != null)
                    {
                        var g = D(("kind", a.Kind), ("level", a.Level), ("result", a.ResultText), ("paid", a.Paid));
                        if (a.Gomoku != null)
                        {
                            var b = a.Gomoku;
                            g["size"] = b.Size; g["cells"] = new List<object>(Array.ConvertAll(b.Cells, x => (object)x)); g["last"] = new List<object> { b.LastX, b.LastY };
                            g["state"] = b.Result.ToString(); g["win"] = new List<object>(b.WinLine.ConvertAll(x => (object)x));
                        }
                        if (a.Memory != null)
                        {
                            var m = a.Memory;
                            var cards = new List<object>();
                            for (int i = 0; i < m.Cards.Length; i++) cards.Add(m.FaceUp(i) ? m.Cards[i] : -1);
                            g["cards"] = cards; g["owner"] = new List<object>(Array.ConvertAll(m.Owner, x => (object)x));
                            g["mine"] = m.PlayerPairs; g["npc"] = m.NpcPairs; g["peek"] = m.PeekA >= 0; g["first"] = m.First;
                            g["npcFlips"] = new List<object>(m.NpcFlips.ConvertAll(x => (object)x));
                            var npcCards = new List<object>();
                            for (int i = 0; i + 1 < m.NpcFlips.Count; i += 3) { npcCards.Add(m.Cards[m.NpcFlips[i]]); npcCards.Add(m.Cards[m.NpcFlips[i + 1]]); }
                            g["npcCards"] = npcCards;
                            g["state"] = m.Finished ? "Finished" : "Playing";
                        }
                        o["game"] = g;
                    }
                    break;
                }
                case "salon":
                {
                    var opts = D();
                    foreach (var kv in f.Salon)
                    {
                        var l = new List<object>();
                        foreach (var (id, name) in kv.Value) l.Add(D(("id", id), ("name", name)));
                        opts[kv.Key] = l;
                    }
                    o["options"] = opts;
                    var price = D(); foreach (var kv in f.SalonPrice) price[kv.Key] = kv.Value;
                    var cp = D(); foreach (var kv in f.SalonCoupon) cp[kv.Key] = D(("item", kv.Value), ("have", s.Inventory.Count(kv.Value)));
                    o["price"] = price; o["coupon"] = cp; o["look"] = s.Fun.Look.ToDict();
                    break;
                }
                case "boutique":
                {
                    var l = new List<object>();
                    foreach (var p in f.Boutique) l.Add(D(("item", p.Item), ("price", p.Cost), ("have", s.Inventory.Count(p.Item))));
                    o["items"] = l;
                    break;
                }
                case "marks":
                {
                    var l = new List<object>();
                    foreach (var p in f.MarkPrizes) l.Add(D(("item", p.Item), ("n", p.Count), ("cost", p.Cost)));
                    o["prizes"] = l; o["marks"] = s.Inventory.Count(f.Mark); o["mark"] = f.Mark;
                    break;
                }
                case "season":
                {
                    var se = s.CurrentSeason();
                    if (se != null)
                    {
                        var (first, today) = s.SeasonStatus();
                        var rw = new List<object>();
                        foreach (var r in first ? se.Again : se.First) rw.Add(D(("item", r.Item), ("n", r.Count)));
                        o["season"] = D(("name", se.Name), ("say", se.Say), ("item", se.TaskItem), ("need", se.TaskCount), ("have", s.Inventory.Count(se.TaskItem)),
                            ("first", first), ("today", today), ("rewards", rw), ("mob", se.Mob));
                    }
                    break;
                }
            }
            return Json.Serialize(o);
        }

        private static Dictionary<string, object> Pts(Dictionary<string, int[]> t)
        {
            var d = D();
            foreach (var kv in t) d[kv.Key] = new List<object>(Array.ConvertAll(kv.Value, x => (object)x));
            return d;
        }

        private static string R(bool ok, string r, string msg = null) => Ui.Obj(("ok", ok), ("r", r), ("msg", msg));

        private static string Msg(FunResult r)
        {
            switch (r)
            {
                case FunResult.Ok: return null;
                case FunResult.NotHere: return "ここではできない";
                case FunResult.NotEnough: return "足りない";
                case FunResult.InventoryFull: return "持ち物がいっぱい";
                case FunResult.AlreadyDone: return "今日はもう済ませた";
                default: return "できない";
            }
        }

        private static string F(FunResult r) => R(r == FunResult.Ok, r.ToString(), Msg(r));

        /// <summary>Actions.Run の知らない操作の続き。知らなければ null。</summary>
        public static string Run(GameSession s, string cmd, string a, string b, int n)
        {
            switch (cmd)
            {
                case "gacha":
                {
                    var r = s.Gacha(a, out var p);
                    var msg = r == GachaResult.NoTicket ? "景品の機械の券が無い" : r == GachaResult.InventoryFull ? "持ち物がいっぱい" : r == GachaResult.NoMachineHere ? "機械が近くにない" : null;
                    var o = D(("ok", r == GachaResult.Ok), ("r", r.ToString()), ("msg", msg));
                    if (p != null) { o["item"] = p.Item; o["n"] = p.Count; o["tier"] = p.Tier; }
                    return Json.Serialize(o);
                }
                case "buyTicket": return F(s.BuyGachaTicket(a, Math.Max(1, n)));
                case "board": { bool ok = s.Board(a, b == "ticket"); return R(ok, ok ? "Ok" : "No"); }
                case "voyageSkip": { bool ok = s.VoyageSkip(); return R(ok, ok ? "Ok" : "No"); }
                case "emote": { bool ok = s.DoEmote(a); return R(ok, ok ? "Ok" : "No"); }
                case "arcadeStart": return F(s.StartArcade(a, b, n == 1 ? "normal" : "easy"));
                case "arcadeEnd": s.Arcade = null; return R(true, "Ok");
                case "gomoku": return F(s.GomokuPlay(n % s.Data.Fun.GomokuSize, n / s.Data.Fun.GomokuSize));
                case "memFlip": return F(s.MemoryFlip(n));
                case "memCont": return F(s.MemoryContinue());
                case "arcadeEx": return F(s.ArcadeExchange(a, n));
                case "salon": return F(s.SalonChange(a, b.Split(':')[0], b.Contains(":") ? b.Substring(b.IndexOf(':') + 1) : "", n == 1));
                case "boutique": return F(s.BoutiqueBuy(a, n));
                case "marks": return F(s.MarkExchange(a, n));
                case "season": return F(s.SeasonTurnIn(a));
                // 確かめ用
                case "dbgBoss": { var bd = s.Data.Fun.FieldBoss(a); if (bd == null) return R(false, "No"); s.Fun.BossDue[a] = s.PlaySec + n; return R(true, "Ok"); }
                case "dbgClock": { var t = DateTime.Parse(a, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal); s.Clock = () => t; return R(true, "Ok"); }
                default: return null;
            }
        }
    }
}
