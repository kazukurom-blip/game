// 道探しと移動。
// - マップとマップ: ポータル（入る条件・ボスの間の回数も見る）・乗り物の NPC・タクシーを辺にした最短の道（Dijkstra）。
// - マップの中: Tests/MapReach.cs（本物の物理で調べた足場の「かたまり」のつながり）の上で道を探し、
//   歩く・跳ぶ・↓跳び・端から落ちる・走って跳ぶ・縄を上り下り・同じマップの中のポータル を本物の入力で行う。
//   敵に押されて思った所に着かなければ、そこから探し直す。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Lumina.Core.Tests;
using Lumina.Core.World;

namespace Lumina.PlayBot
{
    public sealed class Hop
    {
        public string Kind;        // portal / travel / taxi
        public string From, To;
        public PortalData Portal;
        public NpcData Npc;
        public long Fee;
        public double Cost;
        public override string ToString() => From + "→" + To + "（" + Kind + (Portal != null ? " " + Portal.Name : Npc != null ? " " + Npc.Id : "") + "）";
    }

    public sealed partial class Bot
    {
        private readonly Dictionary<string, MapReach> reachCache = new Dictionary<string, MapReach>();
        private readonly Dictionary<string, double> badHopUntil = new Dictionary<string, double>();
        private bool BadHop(string key) => badHopUntil.TryGetValue(key, out var t) && t > Sec;
        private readonly Dictionary<string, double> edgeFailAt = new Dictionary<string, double>();
        private readonly Dictionary<string, int> edgeFails = new Dictionary<string, int>();
        /// <summary>片道の乗り物（島の船）に乗ってよい（S-19 の時だけ）。</summary>
        public bool AllowOneWayTravel;
        public bool TraceMoves;

        public MapReach Reach(MapData md)
        {
            if (!reachCache.TryGetValue(md.Id, out var r))
            {
                r = new MapReach(md);
                reachCache[md.Id] = r;
                if (reachCache.Count > 40) reachCache.Remove(reachCache.Keys.First(k => k != md.Id));
            }
            return r;
        }

        public MapReach R => Reach(S.Map.Data);

        // ---------------- マップとマップ

        private IEnumerable<Hop> HopsFrom(string mapId, string dest)
        {
            var md = D.GetMap(mapId);
            if (md == null) yield break;
            foreach (var p in md.Portals)
            {
                if (!p.IsEnterable || p.To == null || D.GetMap(p.To) == null) continue;
                if (p.RequiresQuest != null && S.Quests.Status(p.RequiresQuest) == QuestStatus.None) continue;
                var room = D.Systems.Room(p.To);
                if (room != null && p.To != dest) continue;                       // ボスの間・試験の部屋は通り道にしない
                if (room != null && S.CanEnterRoom(p.To) != RoomEntryResult.Ok) continue;
                if (BadHop(mapId + "/" + p.Name)) continue;
                yield return new Hop { Kind = "portal", From = mapId, To = p.To, Portal = p, Cost = 1 };
            }
            foreach (var n in md.Npcs)
            {
                if (n.Travel != null)
                {
                    var t = n.Travel;
                    if (S.Character.Level < t.MinLevel) continue;
                    if (t.RequiresQuest != null && S.Quests.Status(t.RequiresQuest) == QuestStatus.None) continue;
                    if (t.Fee > S.Inventory.Meso && !t.Homeward) continue; // 帰りの便は有り金で乗れる
                    if (t.OneWay && !AllowOneWayTravel) continue;
                    if (D.GetMap(t.To) == null || BadHop(mapId + "/" + n.Id)) continue;
                    // ほかの地域（雲の上・おもちゃの町など）へは、帰りの運賃と薬代を残して行く（お金が無いと戻れない地域がある。PLAYTEST.md）
                    var tmap = D.GetMap(t.To);
                    if (tmap.Region != md.Region && tmap.Region != "V" && t.Fee * 2 + PotionReserve() > S.Inventory.Meso) continue;
                    double extra = t.Fee > 0 && t.Fee * 3 > S.Inventory.Meso && !t.Homeward ? 30 : 0;
                    yield return new Hop { Kind = "travel", From = mapId, To = t.To, Npc = n, Fee = Math.Min(t.Fee, S.Inventory.Meso), Cost = 3 + extra };
                }
                if (n.Taxi != null)
                {
                    foreach (var d in n.Taxi.Dests)
                    {
                        long fee = S.Character.Tier == 0 ? d.Fee / Math.Max(1, n.Taxi.BeginnerDiv) : d.Fee;
                        if (fee > S.Inventory.Meso / 3 || D.GetMap(d.To) == null || BadHop(mapId + "/" + n.Id + ">" + d.To)) continue;
                        yield return new Hop { Kind = "taxi", From = mapId, To = d.To, Npc = n, Fee = fee, Cost = 6 };
                    }
                }
            }
        }

        /// <summary>今のマップから to への道（無ければ null）。</summary>
        public List<Hop> Route(string from, string to)
        {
            if (from == to) return new List<Hop>();
            var dist = new Dictionary<string, double> { { from, 0 } };
            var prev = new Dictionary<string, Hop>();
            var open = new SortedSet<(double, string)> { (0, from) };
            while (open.Count > 0)
            {
                var (d, c) = open.Min;
                open.Remove(open.Min);
                if (c == to) break;
                if (d > dist[c]) continue;
                foreach (var h in HopsFrom(c, to))
                {
                    double nd = d + h.Cost;
                    if (dist.TryGetValue(h.To, out var old) && old <= nd) continue;
                    if (dist.ContainsKey(h.To)) open.Remove((old, h.To));
                    dist[h.To] = nd; prev[h.To] = h;
                    open.Add((nd, h.To));
                }
            }
            if (!prev.ContainsKey(to)) return null;
            var path = new List<Hop>();
            for (var c = to; c != from; c = prev[c].From) path.Insert(0, prev[c]);
            return path;
        }

        public double RouteCost(string to)
        {
            var r = Route(MapId, to);
            return r == null ? double.PositiveInfinity : r.Sum(h => h.Cost);
        }

        public bool CanReach(string to) => to == MapId || Route(MapId, to) != null;

        /// <summary>ポータル・乗り物をたどって目的のマップへ行く。行けなければ false（問題として記録）。</summary>
        public bool GoToMap(string to) => Timed("travel", () => GoToMapInner(to));

        private bool GoToMapInner(string to)
        {
            for (int guard = 0; guard < 80 && MapId != to; guard++)
            {
                var route = Route(MapId, to);
                if (route == null)
                {
                    Note("route", MapId + "→" + to, MapId + " から " + to + " への道が無い（Lv" + Level + "）");
                    return false;
                }
                var h = route[0];
                if (S.Character.Hp < S.Stats.MaxHp * 0.5 && CountPotions(true) == 0 && !resting)
                {
                    // 薬が無く HP が少ないまま次のマップへ行かない（休むと町へ戻ることがあるので、道は探し直す）
                    resting = true;
                    try { RestIfNeeded(); } finally { resting = false; }
                    continue;
                }
                if (TakeHop(h)) edgeFails.Remove(h.From + "/" + (h.Portal != null ? h.Portal.Name : h.Npc.Id + (h.Kind == "taxi" ? ">" + h.To : "")));
                else
                {
                    string key = h.From + "/" + (h.Portal != null ? h.Portal.Name : h.Npc.Id + (h.Kind == "taxi" ? ">" + h.To : ""));
                    edgeFails[key] = edgeFails.TryGetValue(key, out var n) ? n + 1 : 1;
                    if (edgeFails[key] >= 3)
                    {
                        badHopUntil[key] = Sec + 900; // しばらく使わない（敵に押されただけのこともある）
                        edgeFails[key] = 0;
                        Note("hop", key, h + " が使えない（" + edgeFails[key] + " 回）");
                    }
                }
            }
            return MapId == to;
        }

        private bool TakeHop(Hop h)
        {
            if (h.Kind == "portal")
            {
                var p = h.Portal;
                if (!MoveToPoint(p.X, p.Y, 1.5))
                {
                    Note("reach", MapId + ":" + p.Name, MapId + " でポータル " + p.Name + " の前まで行けない（" + DescribeHere() + "）");
                    return false;
                }
                string before = MapId;
                LastMessage = null;
                WithMapChange(() => Frame(new PlayerInput { UpPressed = true }));
                if (MapId == before) { WithMapChange(() => Frame(new PlayerInput { UpPressed = true })); }
                if (MapId != h.To)
                {
                    if (MapId == before) Note("portal", before + ":" + p.Name, before + " のポータル " + p.Name + " に入れない（" + (LastMessage ?? "?") + "）");
                    return false;
                }
                return true;
            }
            if (!MoveNearNpc(h.Npc)) return false;
            bool ok;
            if (h.Kind == "travel") ok = WithMapChange(() => S.Travel(h.Npc.Id));
            else ok = WithMapChange(() => S.TaxiTo(h.Npc.Id, h.To) == TaxiResult.Ok);
            if (ok) MesoSpent += h.Fee;
            return ok && MapId == h.To;
        }

        private bool hurtFlag, fightingBack, resting;

        /// <summary>歩いている途中に殴られたら、近くの倒せる敵を倒してから進む（人と同じ）。</summary>
        private void FightBack()
        {
            if (fightingBack) return;
            var near = S.Map.Mobs.Where(m => Targetable(m) && CanFight(m.Def) && Math.Abs(m.X - S.Body.X) < 150 && Math.Abs(m.Y - S.Body.Y) < 60)
                .OrderBy(m => Math.Abs(m.X - S.Body.X)).FirstOrDefault();
            if (near == null) return;
            fightingBack = true;
            try { if (Engage(near, 15)) PickupAround(120); }
            finally { fightingBack = false; }
        }

        public string DescribeHere() => MapId + " x=" + S.Body.X.ToString("0") + " y=" + S.Body.Y.ToString("0") + " " + S.Body.State + " node=" + (CurNode() ?? "-");

        // ---------------- マップの中

        public string CurNode()
        {
            var b = S.Body;
            if (!b.OnGround || b.Seg == null) return null;
            return R.NodeOf(b.Seg.Chain.Id, b.X);
        }

        /// <summary>足場の上の点（NPC・ポータル・調べる物の足元）のかたまり。</summary>
        public string NodeAt(double x, double y)
        {
            var seg = R.Map.SegBelow(x, y - 3);
            if (seg == null || seg.YAt(x) - y > 4) return null;
            return R.NodeOf(seg.Chain.Id, x);
        }

        /// <summary>空中の点の下の一番近い足場のかたまり（飛ぶ敵の下）。</summary>
        public string NodeBelow(double x, double y)
        {
            var seg = R.Map.SegBelow(x, y);
            return seg == null ? null : R.NodeOf(seg.Chain.Id, x);
        }

        /// <summary>地面（縄の上・空中でない所）に立つまで待つ・縄なら上り下りする。立っているかたまりを返す。</summary>
        public string Settle()
        {
            for (int i = 0; i < 900; i++)
            {
                var b = S.Body;
                if (b.OnGround) return CurNode();
                if (b.OnRope) Frame(new PlayerInput { Up = i < 500, Down = i >= 500 });
                else Frame(new PlayerInput());
            }
            Note("stuck", MapId + ":settle", "地面に立てない（" + DescribeHere() + "）");
            return null;
        }

        /// <summary>今の足場の上で x まで歩いて止まる（MapReach.WalkTo と同じ考え: すべる分を見込んで離す）。</summary>
        public bool WalkTo(double tx, int maxFrames = 2400)
        {
            double lastX = S.Body.X; int still = 0;
            for (int f = 0; f < maxFrames; f++)
            {
                var p = S.Body;
                if (!p.OnGround) return false;
                double dx = tx - p.X;
                if (Math.Abs(dx) < 1.5 && Math.Abs(p.Vx) < 1) return true;
                double slide = p.Vx * p.Vx / (2 * Feel.WalkDecel);
                int dir = Math.Sign(dx);
                bool press;
                if (Math.Abs(p.Vx) < 1) press = Math.Abs(dx) >= 6 || f % 4 == 0;
                else if (Math.Sign(p.Vx) == dir) press = Math.Abs(dx) > slide + 1;
                else press = true;
                Frame(new PlayerInput { Left = press && dir < 0, Right = press && dir > 0 });
                if (Math.Abs(S.Body.X - lastX) < 0.05) { if (++still > 90) return false; } else still = 0;
                lastX = S.Body.X;
            }
            for (int f = 0; f < 120 && S.Body.OnGround && Math.Abs(S.Body.Vx) >= 1; f++) Frame(new PlayerInput());
            return S.Body.OnGround && Math.Abs(tx - S.Body.X) <= 3;
        }

        /// <summary>止まって、入力を入れ、どこかの足場に着くまで続ける。着いたかたまり。</summary>
        private string RunUntilLanded(Func<int, PlayerInput> input, int maxFrames)
        {
            bool left = false;
            for (int f = 0; f < maxFrames; f++)
            {
                Frame(input(f));
                var b = S.Body;
                if (!b.OnGround) left = true;
                else if (left) return CurNode();
            }
            return S.Body.OnGround ? CurNode() : null;
        }

        /// <summary>動きを 1 つ行う。walked = 動きの前の位置まで歩けた（歩く途中で押された時は false。辺の失敗に数えない）。</summary>
        private string Perform(ReachEdge e, out bool walked)
        {
            walked = WalkTo(e.X);
            if (!walked) return null;
            Idle(6);
            for (int i = 0; i < 120 && S.Body.RegrabT > 0; i++) Frame(new PlayerInput());
            switch (e.Kind)
            {
                case MoveKind.Jump: return RunUntilLanded(f => f == 0 ? new PlayerInput { Jump = true, JumpPressed = true } : new PlayerInput(), 300);
                case MoveKind.DownJump: return RunUntilLanded(f => f == 0 ? new PlayerInput { Down = true, Jump = true, JumpPressed = true } : new PlayerInput(), 900);
                case MoveKind.WalkOffLeft: return RunUntilLanded(f => new PlayerInput { Left = true }, 900);
                case MoveKind.WalkOffRight: return RunUntilLanded(f => new PlayerInput { Right = true }, 900);
                case MoveKind.RunJumpRight:
                case MoveKind.RunJumpLeft:
                    {
                        int dir = e.Kind == MoveKind.RunJumpRight ? 1 : -1;
                        var (a, b) = R.StandRange(e.From);
                        double edge = dir > 0 ? b : a;
                        bool jumped = false;
                        return RunUntilLanded(f =>
                        {
                            var inp = new PlayerInput { Left = dir < 0, Right = dir > 0 };
                            var bd = S.Body;
                            if (!jumped && bd.OnGround && (dir > 0 ? bd.X >= edge - 20 : bd.X <= edge + 20)) { inp.Jump = true; inp.JumpPressed = true; jumped = true; }
                            return inp;
                        }, 900);
                    }
                case MoveKind.RopeUp: return RunUntilLanded(f => new PlayerInput { Up = true }, 1500);
                case MoveKind.RopeDown: return RunUntilLanded(f => new PlayerInput { Down = true }, 1500);
                case MoveKind.Portal:
                    Frame(new PlayerInput { UpPressed = true });
                    Idle(2);
                    return CurNode();
            }
            return null;
        }

        private List<ReachEdge> PathAvoiding(string start, string goal)
        {
            var r = R;
            var prev = new Dictionary<string, ReachEdge> { { start, null } };
            var q = new Queue<string>(new[] { start });
            while (q.Count > 0)
            {
                var c = q.Dequeue();
                if (c == goal) break;
                foreach (var e in r.Edges[c])
                {
                    if (prev.ContainsKey(e.To)) continue;
                    string k = MapId + "#" + e;
                    if (edgeFails.TryGetValue(k, out var n) && n >= 4 && edgeFailAt.TryGetValue(k, out var at) && Sec - at < 300) continue;
                    prev[e.To] = e; q.Enqueue(e.To);
                }
            }
            if (!prev.ContainsKey(goal)) return null;
            var path = new List<ReachEdge>();
            for (var c = goal; prev[c] != null; c = prev[c].From) path.Insert(0, prev[c]);
            return path;
        }

        /// <summary>かたまり goal の x に立つ（本物の入力で）。着けなければ false。</summary>
        public bool MoveToNode(string goal, double x, int maxMoves = 60)
        {
            if (goal == null || !R.Nodes.ContainsKey(goal)) return false;
            var (a, b) = R.StandRange(goal);
            if (b < a) return false;
            double tx = Math.Max(a, Math.Min(b, x));
            for (int step = 0; step < maxMoves; step++)
            {
                string cur = Settle();
                if (cur == null) return false;
                if (cur == goal)
                {
                    if (WalkTo(tx)) return true;
                    continue;
                }
                var path = PathAvoiding(cur, goal);
                if (path == null)
                {
                    // 今のかたまりから行けない（押されて落ちた所が袋小路など）。少し待って探し直す
                    if (step > 3) return false;
                    Idle(30);
                    continue;
                }
                var e = path[0];
                hurtFlag = false;
                string got = Perform(e, out bool walked);
                bool hurtSince = hurtFlag;
                if (TraceMoves) Say("  move " + e + " → " + (got ?? "null") + "（" + DescribeHere() + "）");
                string key = MapId + "#" + e;
                if (got == e.To) edgeFails.Remove(key);
                else if (walked && !hurtSince)
                {
                    edgeFails[key] = edgeFails.TryGetValue(key, out var n) ? n + 1 : 1;
                    edgeFailAt[key] = Sec;
                }
                if (hurtSince) FightBack();
            }
            return false;
        }

        /// <summary>足場の上の点 (x, y) に立つ。tol は x の許し。</summary>
        public bool MoveToPoint(double x, double y, double tol = 3)
        {
            string node = NodeAt(x, y) ?? NodeBelow(x, y);
            if (node == null) return false;
            if (!MoveToNode(node, x)) return false;
            return Math.Abs(S.Body.X - x) <= Math.Max(tol, 3);
        }

        /// <summary>NPC の前（同じ足場の 30 px 手前）まで歩く。</summary>
        public bool MoveNearNpc(NpcData n)
        {
            if (n == null) return false;
            if (S.Map.Npc(n.Id) == null) return false;
            string node = NodeAt(n.X, n.Y) ?? NodeBelow(n.X, n.Y);
            if (node == null) { Note("npc", n.Id, MapId + " の " + n.Name + " の足元に足場が無い"); return true; }
            double x = n.X + (S.Body.X < n.X ? -30 : 30);
            if (MoveToNode(node, x)) return true;
            Note("reach", MapId + ":" + n.Id, MapId + " の " + n.Name + "（" + n.Id + "）の前まで行けない（" + DescribeHere() + "）");
            return false;
        }

        /// <summary>その NPC のいるマップへ行き、前まで歩く。</summary>
        public bool GoToNpc(string npcId)
        {
            var map = NpcMap(npcId);
            if (map == null) { Note("npc", npcId, npcId + " がどのマップにもいない"); return false; }
            if (!GoToMap(map)) return false;
            return MoveNearNpc(S.Map.Npc(npcId));
        }

        public string NpcMap(string npcId)
        {
            if (D.Npcs.TryGetValue(npcId, out var nd) && nd.Map != null && D.GetMap(nd.Map)?.Npcs.Any(n => n.Id == npcId) == true) return nd.Map;
            foreach (var id in D.MapIds) if (D.GetMap(id).Npcs.Any(n => n.Id == npcId)) return id;
            return null;
        }
    }
}
