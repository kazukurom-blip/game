// テストで「遊ぶ」ための手伝い。GameSession の公開の操作（入力・ポータル・攻撃・拾う・話す）だけを使って進める。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public sealed class Harness
    {
        public readonly GameSession S;
        public readonly List<GameEvent> Log = new List<GameEvent>();
        public int Frames;
        public int Deaths;

        public Harness(GameSession s) { S = s; }

        public static Harness NewGame(ulong seed = 42)
        {
            var s = GameSession.NewGame(TestData.Get(), "テスト", seed);
            // サイコロの代わりに決めた値（合計 25）
            s.Character.Str = 12; s.Character.Dex = 5; s.Character.Int = 4; s.Character.Luk = 4;
            s.RefreshStats();
            return new Harness(s);
        }

        /// <summary>入力を n フレーム続ける（Out はフレームごとに Log へ移す）。</summary>
        public void Run(PlayerInput inp, int frames = 1)
        {
            for (int i = 0; i < frames; i++)
            {
                S.Out.Clear();
                var x = inp;
                if (i > 0) { x.JumpPressed = false; x.UpPressed = false; x.InteractPressed = false; x.SkillPressed = null; x.ItemPressed = null; }
                S.Step(x);
                Log.AddRange(S.Out.Events);
                Frames++;
            }
        }

        public void Idle(int frames) => Run(new PlayerInput(), frames);

        // ---------------- 移動

        /// <summary>ポータルの所へ行って ↑ で入る（位置は飛んで合わせる）。</summary>
        public void TakePortal(string portalName)
        {
            var p = S.Map.Data.FindPortalByName(portalName);
            Assert.True(p != null, S.Map.Data.Id + " にポータル " + portalName + " が無い");
            S.Teleport(p.X, p.Y);
            Idle(2);
            string before = S.Map.Data.Id;
            Run(new PlayerInput { Up = true, UpPressed = true });
            Assert.True(S.Map.Data.Id != before || p.To == null, "ポータル " + portalName + " で移れなかった");
        }

        /// <summary>ポータルだけをたどって目的のマップへ行く（つながりの検査も兼ねる）。</summary>
        public void GoTo(string mapId)
        {
            for (int guard = 0; guard < 20 && S.Map.Data.Id != mapId; guard++)
            {
                var path = PathTo(S.Map.Data.Id, mapId);
                Assert.True(path != null, S.Map.Data.Id + " から " + mapId + " へ行く道が無い");
                var next = path[1];
                var portal = S.Map.Data.Portals.First(p => p.To == next);
                TakePortal(portal.Name);
                Assert.Equal(next, S.Map.Data.Id);
            }
            Assert.Equal(mapId, S.Map.Data.Id);
        }

        private List<string> PathTo(string from, string to)
        {
            var prev = new Dictionary<string, string> { { from, null } };
            var q = new Queue<string>();
            q.Enqueue(from);
            while (q.Count > 0)
            {
                var c = q.Dequeue();
                if (c == to) break;
                var md = S.Data.GetMap(c);
                if (md == null) continue;
                foreach (var p in md.Portals)
                    if (p.To != null && !prev.ContainsKey(p.To) && S.Data.GetMap(p.To) != null) { prev[p.To] = c; q.Enqueue(p.To); }
            }
            if (!prev.ContainsKey(to)) return null;
            var path = new List<string>();
            for (var c = to; c != null; c = prev[c]) path.Insert(0, c);
            return path;
        }

        // ---------------- 戦う

        public static readonly Dictionary<string, string[]> IslandMobMaps = new Dictionary<string, string[]>
        {
            { "M001", new[] { "S001", "S002", "S004" } }, { "M002", new[] { "S002", "S004" } }, { "M003", new[] { "S004", "S005" } },
            { "M004", new[] { "S006", "S008" } }, { "M005", new[] { "S005", "S007" } }, { "M006", new[] { "S007", "S008" } }, { "M007", new[] { "S009" } },
        };

        /// <summary>HP が減っていたら薬を飲む・無ければ宿屋で休む。死んでいたら起き上がる。</summary>
        public void TakeCare()
        {
            if (S.Dead) { Deaths++; S.Revive(); Idle(5); }
            if (S.Character.Hp < S.Stats.MaxHp * 0.5)
            {
                if (S.Inventory.Has("use.red_potion")) S.UseItem("use.red_potion");
                else if (S.Inventory.Has("use.orange_potion")) S.UseItem("use.orange_potion");
                else
                {
                    string back = S.Map.Data.Id;
                    GoTo("S003");
                    if (S.Inventory.Meso >= 500) S.Buy("shop.S003.potion", "use.red_potion", Math.Min(30, (int)(S.Inventory.Meso / 50) - 2));
                    else S.RestAtInn("momo");
                    if (S.Character.Hp < S.Stats.MaxHp * 0.5) S.RestAtInn("momo");
                    GoTo(back);
                }
            }
        }

        /// <summary>この敵を 1 体倒す（近くへ飛び、向いて、倒れるまで攻撃キーを押し続ける）。倒せたら true。</summary>
        public bool KillOne(string mobId, int maxFrames = 6000)
        {
            int start = Frames;
            while (Frames - start < maxFrames)
            {
                TakeCare();
                var mob = S.Map.Mobs.Where(m => m.Alive && m.Def.Id == mobId).OrderBy(m => Math.Abs(m.X - S.Body.X)).FirstOrDefault();
                if (mob == null) { Idle(60); continue; }
                int uid = mob.Uid;
                // 敵の足場の上で、敵の横に立つ
                foreach (int side in new[] { -1, 1 })
                {
                    double x = mob.X + side * (mob.Def.Width / 2 + 16);
                    if (mob.Seg != null && (x < mob.Seg.Chain.Segs[0].X1 || x > mob.Seg.Chain.Segs[mob.Seg.Chain.Segs.Count - 1].X2)) continue;
                    S.Teleport(x, mob.Y);
                    S.Body.Facing = -side;
                    break;
                }
                for (int i = 0; i < 90; i++)
                {
                    Run(new PlayerInput { Attack = true });
                    var m = S.Map.FindMob(uid);
                    if (m == null || !m.Alive) { PickupNear(); return true; }
                    if (S.Dead || S.Character.Hp < S.Stats.MaxHp * 0.5) break;
                    if (Math.Abs(m.X - S.Body.X) > 60 || Math.Abs(m.Y - S.Body.Y) > 40) break; // 離れた: 立ち直す
                }
            }
            return false;
        }

        /// <summary>まわりに落ちた物を全部拾う。</summary>
        public void PickupNear()
        {
            Idle(45); // 跳ねて落ちるのを待つ
            for (int guard = 0; guard < 30; guard++)
            {
                var d = S.Map.Drops.Where(x => x.Landed && !x.PickedUp).OrderBy(x => Math.Abs(x.X - S.Body.X)).FirstOrDefault();
                if (d == null || Math.Abs(d.X - S.Body.X) > 200) break;
                S.Teleport(d.X, d.GroundY);
                int before = S.Map.Drops.Count(x => !x.PickedUp);
                Run(new PlayerInput { Pickup = true }, 2);
                if (!d.PickedUp) break; // 持ち物がいっぱい
            }
        }

        public void HuntKills(string mobId, int count)
        {
            EnsureIn(mobId);
            for (int i = 0; i < count; i++)
            {
                int hitsBefore = Log.Count(e => e.Type == GameEventType.MobHit);
                bool ok = KillOne(mobId, 60000);
                var m = S.Map.Mobs.FirstOrDefault(x => x.Def.Id == mobId && x.Alive);
                Assert.True(ok, mobId + " を倒せなかった（" + i + "/" + count + "） 敵の残り HP " + m?.Hp + " 当てた回数 " + (Log.Count(e => e.Type == GameEventType.MobHit) - hitsBefore)
                    + " 倒れた " + Deaths + " Lv" + S.Character.Level + " STR " + S.Stats.Str + " DEX " + S.Stats.Dex + " 攻撃 " + S.Stats.Range + " 命中 " + S.Stats.Acc + " 薬 " + S.Inventory.Count("use.red_potion"));
            }
        }

        public void HuntItems(string mobId, string itemId, int count, int maxKills = 400)
        {
            EnsureIn(mobId);
            int kills = 0;
            while (S.Inventory.Count(itemId) < count)
            {
                Assert.True(kills++ < maxKills, itemId + " が集まらない（" + S.Inventory.Count(itemId) + "/" + count + "）");
                Assert.True(KillOne(mobId), mobId + " を倒せなかった");
            }
        }

        private void EnsureIn(string mobId)
        {
            if (S.Map.Data.Spawns.Any(s => s.Mob == mobId) || S.Map.Data.TimedSpawns.Any(s => s.Mob == mobId)) return;
            GoTo(IslandMobMaps[mobId][0]);
        }

        /// <summary>この Lv になるまで狩る（島の敵の中から Lv に合う物）。AP は DEX を 25 まで、残りは STR に振る。</summary>
        public void LevelTo(int lv)
        {
            AllocateAp();
            while (S.Character.Level < lv)
            {
                string mob = S.Character.Level < 3 ? "M002" : S.Character.Level < 5 ? "M003" : S.Character.Level < 7 ? "M004" : "M006";
                EnsureIn(mob);
                Assert.True(KillOne(mob));
                AllocateAp();
            }
        }

        public void AllocateAp()
        {
            while (S.Character.Ap > 0)
                S.SpendAp(S.Character.Dex < 25 ? Combat.Stat.DEX : Combat.Stat.STR);
        }

        /// <summary>持ち物の中の着られる装備で、今より防御か攻撃の高い物を着る。</summary>
        public void WearBest()
        {
            for (int i = 0; i < S.Inventory.SlotCount(InvTab.Equip); i++)
            {
                var it = S.Inventory.Get(InvTab.Equip, i);
                if (it == null) continue;
                var def = S.Data.Item(it.ItemId);
                if (def.Cosmetic) continue;
                var cur = S.Equipment.Get(def.Slot);
                int score(ItemInstance x) => x == null ? -1 : x.Stats.Wdef + x.Stats.Watk * 3 + x.Stats.Speed;
                if (score(it) > score(cur)) S.EquipFromInventory(i);
            }
        }
    }
}
