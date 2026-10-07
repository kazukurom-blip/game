// 楽しさの要素（Core/Fun・GameSession.Fun.cs・Data/fun.json）: 景品の機械・フィールドボス・船の旅と襲撃・感情表現・
// 五目並べ・神経衰弱・遊び場の景品・季節の祭り・美容院・見た目の品・珍しい色違いの敵・ダンジョンの部屋の課題・天気・セーブ。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Fun;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Save;
using Lumina.Core.Util;
using Xunit;

namespace Lumina.Core.Tests
{
    public class FunTests
    {
        private static readonly DateTime Oct = new DateTime(2026, 10, 7, 3, 0, 0, DateTimeKind.Utc);

        private static GameSession NewAt(string map, int level = 30, GameData data = null, ulong seed = 11)
        {
            var s = GameSession.NewGame(data ?? TestData.Get(), "あそび", seed);
            s.Clock = () => Oct;
            s.Character.Level = level;
            foreach (var q in s.Data.QuestList.Where(q => q.Tutorial)) s.Quests.MarkCompleted(q.Id, 0);
            s.ChangeMap(map);
            return s;
        }

        private static void StandAt(GameSession s, FunSpot sp) { s.Teleport(sp.X, sp.Y); s.Step(new PlayerInput(), 2); }

        private static void Kill(GameSession s, Mob m) => s.DamageMob(m, new HitResult { Damage = m.Hp + 1 });

        private static List<GameEvent> StepLog(GameSession s, int frames, PlayerInput inp = default)
        {
            var log = new List<GameEvent>();
            for (int i = 0; i < frames; i++) { s.Out.Clear(); s.Step(i == 0 ? inp : new PlayerInput { Left = inp.Left, Right = inp.Right }); log.AddRange(s.Out.Events); }
            return log;
        }

        [Fact]
        public void DataHasEveryPieceAndSpotsStandOnTheGround()
        {
            var f = TestData.Get().Fun;
            Assert.Equal(6, f.Machines.Count);
            Assert.Equal(8, f.FieldBosses.Count);
            Assert.Equal(6, f.Voyages.Count);
            Assert.Equal(7, f.Emotes.Count);
            Assert.Equal(2, f.Seasons.Count);
            Assert.True(f.Salon["hair"].Count >= 7 && f.Salon["face"].Count >= 5);
            Assert.Equal(6, f.DungeonTasks.Count);
            Assert.True(f.Weather.Count > 0 && f.RareChance > 0);
            foreach (var m in f.Machines)
            {
                Assert.Contains(m.Prizes, p => p.Tier == 2);
                foreach (var p in m.Prizes) Assert.True(TestData.Get().Item(p.Item) != null || TestData.Get().Mob(p.Item.Replace("card.", "")) != null, p.Item);
                Assert.NotNull(f.Spot(m.Id));
            }
            foreach (var sp in f.Spots)
            {
                var md = TestData.Get().GetMap(sp.Map);
                Assert.True(md.IsTown, sp.Id);
                Assert.Contains(md.Footholds, fh => fh.Ground && fh.Points.Any(p => Math.Abs(p[1] - sp.Y) < 0.5));
                foreach (var n in md.Npcs) Assert.True(Math.Abs(n.X - sp.X) >= 70, sp.Id + " と " + n.Id + " が近い");
            }
            foreach (var b in f.FieldBosses) { Assert.NotNull(TestData.Get().Mob(b.Mob)?.Boss); Assert.NotNull(TestData.Get().GetMap(b.Map)); }
        }

        [Fact]
        public void GachaNeedsATicketAndPaysOutEveryTierWithTheShownOdds()
        {
            var s = NewAt("V100");
            var sp = s.Data.Fun.Spot("gacha.V100");
            StandAt(s, sp);
            Assert.Equal(GachaResult.NoTicket, s.Gacha(sp.Id, out _));
            s.Inventory.AddMeso(10_000_000);
            Assert.Equal(FunResult.Ok, s.BuyGachaTicket(sp.Id, 100));
            Assert.Equal(100, s.Inventory.Count("use.gacha_ticket"));
            Assert.Equal(s.Data.Fun.TicketPrice * 100, 10_000_000 - s.Inventory.Meso + 0);
            var tiers = new int[3];
            bool jackpotEvent = false;
            for (int i = 0; i < 300; i++)
            {
                if (s.Inventory.Count("use.gacha_ticket") == 0) s.Inventory.Add("use.gacha_ticket", 50);
                s.Out.Clear();
                var r = s.Gacha(sp.Id, out var prize);
                if (r == GachaResult.InventoryFull)
                {
                    foreach (var tab in new[] { InvTab.Equip, InvTab.Use, InvTab.Setup, InvTab.Etc })
                        for (int k = 0; k < s.Inventory.SlotCount(tab); k++) { var it = s.Inventory.Get(tab, k); if (it != null && it.ItemId != "use.gacha_ticket") s.Inventory.TakeAt(tab, k, it.Count); }
                    continue;
                }
                Assert.Equal(GachaResult.Ok, r);
                tiers[prize.Tier]++;
                if (prize.Tier == 2) jackpotEvent |= s.Out.Events.Any(e => e.Type == GameEventType.Fun && e.Id.StartsWith("jackpot:") && e.Text.Contains("大当たり"));
            }
            Assert.True(tiers[0] > tiers[1] && tiers[1] > tiers[2] && tiers[2] > 0, string.Join(",", tiers));
            Assert.True(jackpotEvent);
            Assert.True(s.Fun.Pulls >= 250 && s.Fun.Jackpots == tiers[2]);
            // 機械の無い町では回せない
            s.ChangeMap("V200");
            Assert.Equal(GachaResult.NoMachineHere, s.Gacha(sp.Id, out _));
        }

        [Fact]
        public void FieldBossWarnsThenSpawnsOnceAndDropsItsOwnLoot()
        {
            var s = NewAt("V303", 25);
            var b = s.Data.Fun.FieldBoss("M420");
            s.Step(new PlayerInput());
            Assert.True(s.Fun.BossDue["M420"] >= s.PlaySec + b.MinSec - 1 && s.Fun.BossDue["M420"] <= s.PlaySec + b.MaxSec + 1);
            s.Fun.BossDue["M420"] = s.PlaySec + 2;
            var log = StepLog(s, 30);
            Assert.Contains(log, e => e.Type == GameEventType.Fun && e.Id == "boss_warn");
            Assert.DoesNotContain(s.Map.Mobs, m => m.Def.Id == "M420");
            log = StepLog(s, 120);
            Assert.Contains(log, e => e.Type == GameEventType.Fun && e.Id == "boss_spawn:M420");
            var boss = s.Map.Mobs.Single(m => m.Def.Id == "M420" && m.Alive);
            Assert.True(boss.FieldBoss);
            Assert.Equal(-1, s.Fun.BossDue["M420"]);
            Assert.NotNull(s.Map.BossBar);
            StepLog(s, 120);
            Assert.Single(s.Map.Mobs, m => m.Def.Id == "M420" && m.Alive); // 1 体だけ
            // ほかのマップへ行って戻っても 1 体
            s.ChangeMap("V302"); s.ChangeMap("V303");
            Assert.Single(s.Map.Mobs, m => m.Def.Id == "M420" && m.Alive);
            // 倒すと次の時間が決まる。専用の品は何度か倒せば出る
            bool own = false;
            for (int i = 0; i < 40 && !own; i++)
            {
                var m = s.Map.Mobs.First(x => x.Def.Id == "M420" && x.Alive);
                s.Out.Clear();
                Kill(s, m);
                Assert.Contains(s.Out.Events, e => e.Type == GameEventType.Fun && e.Id == "boss_down:M420");
                Assert.True(s.Fun.BossDue["M420"] >= s.PlaySec + b.MinSec - 1);
                own |= s.Map.Drops.Any(d => d.ItemId == "eq.fun.boss.M420");
                s.Fun.BossDue["M420"] = s.PlaySec;
                s.Step(new PlayerInput());
            }
            Assert.True(own);
        }

        [Fact]
        public void VoyageRidesTheDeckGetsRaidedAndArrives()
        {
            var s = NewAt("V310", 30);
            s.Inventory.AddMeso(5000);
            Assert.True(s.HasVoyage("noa"));
            Assert.True(s.Board("noa"));
            Assert.Equal("C118", s.Map.Data.Id);
            Assert.NotNull(s.Voyage);
            Assert.Equal("C101", s.Voyage.To);
            s.Character.BaseMaxHp = 10_000_000; s.RefreshStats(); s.Character.Hp = s.Stats.MaxHp;
            var log = StepLog(s, (int)(s.Voyage.Total * 0.4 * 60));
            Assert.Contains(log, e => e.Type == GameEventType.Fun && e.Id == "voyage_raid");
            var raid = s.Map.Mobs.Where(m => m.Alive).ToList();
            Assert.True(raid.Count >= 3);
            long meso = s.Inventory.Meso;
            foreach (var m in raid) Kill(s, m);
            log = StepLog(s, 2);
            Assert.Contains(log, e => e.Type == GameEventType.Fun && e.Id == "voyage_clear");
            Assert.True(s.Inventory.Meso >= meso + 800);
            // 途中で保存すると着いた所から
            var sd = s.ToSaveData("t");
            Assert.Equal("C101", sd.Map);
            log = StepLog(s, (int)(s.Voyage.Total * 0.7 * 60) + 30);
            Assert.Contains(log, e => e.Type == GameEventType.Fun && e.Id == "voyage_arrive");
            Assert.Equal("C101", s.Map.Data.Id);
            Assert.Null(s.Voyage);
            // すぐ着く
            s.Inventory.AddMeso(5000);
            Assert.True(s.Board("luna"));
            Assert.Equal("C118", s.Map.Data.Id);
            Assert.True(s.VoyageSkip());
            Assert.Equal("V310", s.Map.Data.Id);
            // 船の上の水夫と話して乗り物を選ぶと、そのまま着く
            s.Inventory.AddMeso(5000);
            s.Board("noa");
            Assert.True(s.Travel("kaze"));
            Assert.Equal("C101", s.Map.Data.Id);
            // 旅の無い乗り物はそのまま
            Assert.False(s.HasVoyage("tsubasa"));
        }

        [Fact]
        public void EmoteChangesTheFaceForAFewSeconds()
        {
            var s = NewAt("V100");
            Assert.False(s.DoEmote("nope"));
            Assert.True(s.DoEmote("cry"));
            Assert.Equal("cry", s.Emote);
            s.Step(new PlayerInput(), 60);
            Assert.Equal("cry", s.Emote);
            s.Step(new PlayerInput(), (int)(s.Data.Fun.EmoteSec * 60));
            Assert.Null(s.Emote);
        }

        [Fact]
        public void GomokuFindsFiveBlocksFoursAndFinishes()
        {
            var g = new Gomoku(15, "normal", new Rng(3));
            // 白が 4 つ並んだら黒の番に関係なく止めにくる（相手の 4 つを止める）
            for (int x = 3; x < 7; x++) g.Cells[7 * 15 + x] = 1;
            g.Moves = 4;
            var (mx, my) = g.ChooseMove();
            Assert.True(my == 7 && (mx == 2 || mx == 7), mx + "," + my);
            // 黒が 5 つ並べたら勝ち
            var w = new Gomoku(15, "easy", new Rng(4));
            for (int x = 0; x < 4; x++) w.Cells[0 * 15 + x] = 1;
            w.Moves = 4;
            Assert.True(w.Play(4, 0));
            Assert.Equal(GomokuResult.PlayerWin, w.Result);
            Assert.Equal(10, w.WinLine.Count);
            // 係どうしの手で最後まで（でたらめに置く主人公 vs 係）は係が勝つか引き分け
            foreach (var lv in new[] { "easy", "normal" })
            {
                var r = new Rng(9);
                var game = new Gomoku(15, lv, r);
                for (int k = 0; k < 300 && game.Result == GomokuResult.Playing; k++)
                {
                    int i = r.Range(0, 224);
                    if (game.Cells[i] == 0) game.Play(i % 15, i / 15);
                }
                Assert.NotEqual(GomokuResult.Playing, game.Result);
                Assert.NotEqual(GomokuResult.PlayerWin, game.Result);
            }
        }

        [Fact]
        public void MemoryGameEndsAndArcadePaysPointsForPrizes()
        {
            var s = NewAt("V200");
            var sp = s.Data.Fun.Spot("arcade.V200");
            Assert.Equal(FunResult.Ok, s.StartArcade(sp.Id, "memory", "easy"));
            var m = s.Arcade.Memory;
            Assert.Equal(16, m.Cards.Length);
            // 主人公は答えを知っている（全部そろえる）
            for (int guard = 0; guard < 100 && !m.Finished; guard++)
            {
                if (m.PeekA >= 0) { s.MemoryContinue(); continue; }
                int a = Array.FindIndex(m.Owner, o => o == 0);
                int b = Enumerable.Range(0, 16).First(i => i != a && m.Owner[i] == 0 && m.Cards[i] == m.Cards[a]);
                s.MemoryFlip(a); s.MemoryFlip(b);
            }
            Assert.True(m.Finished);
            Assert.Equal(8, m.PlayerPairs);
            Assert.Equal(s.Data.Fun.MemoryPoints["easy"][0], s.Fun.Points);
            Assert.Equal(1, s.Fun.Wins);
            // 係だけでも最後までめくりきる
            var solo = new MemoryGame(8, 0.7, new Rng(5));
            solo.Flip(0); solo.Flip(1);
            for (int guard = 0; guard < 50 && !solo.Finished; guard++)
            {
                if (solo.PeekA >= 0) { solo.Continue(); continue; }
                int a = Array.FindIndex(solo.Owner, o => o == 0); int b = Array.FindIndex(solo.Owner, a + 1, o => o == 0);
                solo.Flip(a); if (b >= 0) solo.Flip(b);
            }
            Assert.True(solo.Finished);
            // 点数で景品
            s.Fun.Points = 100;
            int idx = s.Data.Fun.ArcadePrizes.FindIndex(p => p.Item == "use.gacha_ticket");
            Assert.Equal(FunResult.Ok, s.ArcadeExchange(sp.Id, idx));
            Assert.Equal(100 - s.Data.Fun.ArcadePrizes[idx].Cost, s.Fun.Points);
            Assert.Equal(1, s.Inventory.Count("use.gacha_ticket"));
            s.Fun.Points = 0;
            Assert.Equal(FunResult.NotEnough, s.ArcadeExchange(sp.Id, idx));
            // 五目並べも点数が入る（勝つ形を作って置く）
            Assert.Equal(FunResult.Ok, s.StartArcade(sp.Id, "gomoku", "easy"));
            var g = s.Arcade.Gomoku;
            for (int x = 0; x < 4; x++) g.Cells[14 * 15 + x] = 1;
            g.Moves = 8;
            Assert.Equal(FunResult.Ok, s.GomokuPlay(4, 14));
            Assert.Equal(GomokuResult.PlayerWin, g.Result);
            Assert.Equal(s.Data.Fun.GomokuPoints["easy"][0], s.Fun.Points);
        }

        [Fact]
        public void SeasonFollowsTheRealDateAndTheTaskPaysOnce()
        {
            var s = NewAt("V100");
            Assert.Equal("autumn", s.CurrentSeason()?.Id);
            s.Clock = () => new DateTime(2026, 12, 20, 3, 0, 0, DateTimeKind.Utc);
            Assert.Equal("winter", s.CurrentSeason()?.Id);
            s.Clock = () => new DateTime(2026, 7, 1, 3, 0, 0, DateTimeKind.Utc);
            Assert.Null(s.CurrentSeason());
            Assert.DoesNotContain(s.SpotsHere(), x => x.Kind == "season"); // 季節の外は係もいない
            s.Clock = () => Oct;
            Assert.Contains(s.SpotsHere(), x => x.Kind == "season");
            var sp = s.Data.Fun.Spot("season.V100");
            Assert.Equal(FunResult.NotEnough, s.SeasonTurnIn(sp.Id));
            s.Inventory.Add("etc.M430", 40);
            Assert.Equal(FunResult.Ok, s.SeasonTurnIn(sp.Id));
            Assert.True(s.Inventory.Has("setup.fun.hat.pumpkin") && s.Inventory.Has("setup.fun.chair.lantern"));
            Assert.Equal(FunResult.AlreadyDone, s.SeasonTurnIn(sp.Id));
            s.Clock = () => Oct.AddDays(1);
            Assert.Equal(FunResult.Ok, s.SeasonTurnIn(sp.Id));
            Assert.Equal(2, s.Inventory.Count("use.gacha_ticket"));
            // 季節の敵が狩り場に混ざる
            var d = TestData.Fresh();
            d.Fun.Seasons[0].MobChance = 1.0;
            var t = NewAt("V201", 10, d);
            Assert.Contains(t.Map.Mobs, m => m.Def.Id == "M430");
        }

        [Fact]
        public void SalonAndLookItemsChangeTheLookAndSurviveSaving()
        {
            var s = NewAt("V500");
            var sp = s.Data.Fun.Spot("salon.V500");
            Assert.Equal(FunResult.NotEnough, s.SalonChange(sp.Id, "hair", "hair_bob", false));
            s.Inventory.AddMeso(100_000);
            Assert.Equal(FunResult.Invalid, s.SalonChange(sp.Id, "hair", "hair_nope", false));
            Assert.Equal(FunResult.Ok, s.SalonChange(sp.Id, "hair", "hair_bob", false));
            Assert.Equal(FunResult.Ok, s.SalonChange(sp.Id, "hairColor", "pink", false));
            s.Inventory.Add("use.fun.face_coupon");
            long meso = s.Inventory.Meso;
            Assert.Equal(FunResult.Ok, s.SalonChange(sp.Id, "face", "face_sparkle", true));
            Assert.Equal(meso, s.Inventory.Meso);
            Assert.False(s.Inventory.Has("use.fun.face_coupon"));
            s.ChangeMap("V100");
            Assert.Equal(FunResult.NotHere, s.SalonChange(sp.Id, "skin", "tan", false));
            // 見た目の品: 使うと着ける・もう一度で外す（減らない）
            s.Inventory.Add("setup.fun.hat.cat");
            s.Inventory.Add("setup.fun.tag.gold");
            Assert.True(s.UseItem("setup.fun.hat.cat"));
            Assert.True(s.UseItem("setup.fun.tag.gold"));
            Assert.Equal("setup.fun.hat.cat", s.Fun.Look.Hat);
            Assert.True(s.Inventory.Has("setup.fun.hat.cat"));
            s.Fun.Points = 77;
            // セーブ → 読み込み
            var json = SaveSerializer.ToJson(s.ToSaveData("t"));
            var g = GameSession.FromSave(s.Data, SaveSerializer.FromJson(json));
            Assert.Equal("hair_bob", g.Fun.Look.Hair);
            Assert.Equal("pink", g.Fun.Look.HairColor);
            Assert.Equal("face_sparkle", g.Fun.Look.Face);
            Assert.Equal("setup.fun.hat.cat", g.Fun.Look.Hat);
            Assert.Equal("setup.fun.tag.gold", g.Fun.Look.Tag);
            Assert.Equal(77, g.Fun.Points);
            Assert.True(g.UseItem("setup.fun.hat.cat"));
            Assert.Null(g.Fun.Look.Hat);
            // 売って無くなったら外れる
            g.Inventory.Remove("setup.fun.tag.gold");
            g.CheckLook();
            Assert.Null(g.Fun.Look.Tag);
            // 版 3 のセーブ（fun が無い）も読める
            var v3 = json.Replace("\"version\":" + SaveMigrations.CurrentVersion, "\"version\":3");
            int i = v3.IndexOf(",\"fun\":", StringComparison.Ordinal);
            v3 = v3.Substring(0, i) + "}";
            var old = SaveSerializer.FromJson(v3);
            Assert.Equal(SaveMigrations.CurrentVersion, old.Version);
            var og = GameSession.FromSave(s.Data, old);
            Assert.Equal("hair_spiky", og.Fun.Look.Hair);
            Assert.Equal(0, og.Fun.Points);
        }

        [Fact]
        public void BoutiqueAndMarkExchangeSellTheirGoods()
        {
            var s = NewAt("V090");
            var b = s.Data.Fun.Spot("boutique.V090");
            int idx = s.Data.Fun.Boutique.FindIndex(p => p.Item == "setup.fun.tag.wood");
            Assert.Equal(FunResult.NotEnough, s.BoutiqueBuy(b.Id, idx));
            s.Inventory.AddMeso(100_000);
            Assert.Equal(FunResult.Ok, s.BoutiqueBuy(b.Id, idx));
            Assert.True(s.Inventory.Has("setup.fun.tag.wood"));
            var mk = s.Data.Fun.Spot("marks.V090");
            Assert.Equal(FunResult.NotEnough, s.MarkExchange(mk.Id, 0));
            s.Inventory.Add("etc.fun.dungeon_mark", 3);
            Assert.Equal(FunResult.Ok, s.MarkExchange(mk.Id, 0));
            Assert.Equal(3 - s.Data.Fun.MarkPrizes[0].Cost, s.Inventory.Count("etc.fun.dungeon_mark"));
        }

        [Fact]
        public void RareMobIsTougherAndPaysMore()
        {
            var d = TestData.Fresh();
            d.Fun.RareChance = 1;
            var s = NewAt("V101", 10, d);
            var m = s.Map.Mobs.First(x => x.Alive);
            Assert.True(m.Rare);
            Assert.Equal((int)Math.Round(m.Def.Hp * d.Fun.RareHpMul), m.MaxHp);
            Assert.True(m.Atk > m.Def.Atk);
            long exp = s.Character.Exp; int lv = s.Character.Level;
            s.Out.Clear();
            Kill(s, m);
            Assert.True(s.Character.Level > lv || s.Character.Exp - exp >= (long)(m.Def.Exp * 4));
            Assert.True(s.Flags.ContainsKey("rare." + m.Def.Id));
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.Fun && e.Id.StartsWith("rare_down:"));
            Assert.Equal(1, s.Book.Variant(m.Def.Id, "rare_killed"));
            Assert.True(s.Book.Variant(m.Def.Id, "rare_seen") >= 1);
            // ボス・強敵は珍しくならない
            var t = NewAt("V303", 20, d);
            t.Fun.BossDue["M420"] = 0; t.Step(new PlayerInput());
            Assert.False(t.Map.Mobs.First(x => x.Def.Id == "M420").Rare);
        }

        [Fact]
        public void DungeonRoomsHaveTasksThatOpenTheDoorsAndARewardRoom()
        {
            var s = NewAt("V515", 25);
            s.Character.BaseMaxHp = 10_000_000; s.RefreshStats(); s.Character.Hp = s.Stats.MaxHp;
            Assert.True(s.UsePortal(s.Map.Data.Portals.First(p => p.To == "V516")));
            var run = s.Dungeon;
            Assert.NotNull(run);
            Assert.Equal(5, run.Rooms.Count);
            Assert.Equal(new[] { "kill", "switch", "carry", "climb", null }, run.Rooms.Select(r => r.Kind).ToArray());
            var out0 = s.Map.Data.FindPortalByName("r0_out");
            s.Out.Clear();
            Assert.False(s.UsePortal(out0));
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.Message && e.Id == "dungeon_locked");
            // 1: 部屋の敵を倒す
            var room = run.Rooms[0];
            for (int guard = 0; guard < 200 && !room.Done; guard++)
            {
                var m = s.Map.Mobs.FirstOrDefault(x => x.Alive && x.X >= room.X1 && x.X < room.X2);
                if (m == null) { s.Step(new PlayerInput(), 60 * 8); continue; }
                Kill(s, m);
            }
            Assert.True(room.Done);
            Assert.True(s.UsePortal(out0));
            // 2: スイッチを順に（違う順だと消える）
            room = run.Rooms[1];
            void Press((double x, double y) p) { s.Teleport(p.x, p.y); s.Step(new PlayerInput(), 2); s.Step(new PlayerInput { InteractPressed = true }); }
            Press(room.Switches[1]);
            Assert.Equal(0, room.SwitchNext);
            foreach (var p in room.Switches) Press(p);
            Assert.True(room.Done);
            Assert.True(s.UsePortal(s.Map.Data.FindPortalByName("r1_out")));
            // 3: 荷物を運ぶ（時間切れだと戻る）
            room = run.Rooms[2];
            s.Teleport(room.CrateX, room.CrateY); s.Step(new PlayerInput(), 2); s.Step(new PlayerInput { InteractPressed = true });
            Assert.True(room.Carrying);
            s.Step(new PlayerInput(), (int)(s.Data.Fun.CarrySec * 60) + 10);
            Assert.False(room.Carrying);
            s.Teleport(room.CrateX, room.CrateY); s.Step(new PlayerInput(), 2); s.Step(new PlayerInput { InteractPressed = true });
            s.Teleport(room.GoalX, room.GoalY); s.Step(new PlayerInput(), 3);
            Assert.True(room.Done);
            Assert.True(s.UsePortal(s.Map.Data.FindPortalByName("r2_out")));
            // 4: 高い足場の旗
            room = run.Rooms[3];
            s.Teleport(room.FlagX, room.FlagY); s.Step(new PlayerInput(), 5);
            Assert.True(room.Done);
            Assert.True(s.UsePortal(s.Map.Data.FindPortalByName("r3_out")));
            // 主を倒すとごほうびの宝箱と踏破の印
            var boss = s.Map.Mobs.First(m => m.Def.Id == "M068" && m.Alive);
            Kill(s, boss);
            Assert.True(s.RoomCleared);
            Assert.Equal(1, s.Inventory.Count("etc.fun.dungeon_mark"));
            Assert.Equal(s.Data.Fun.Chests, run.Chests.Count);
            int drops = s.Map.Drops.Count;
            var c = run.Chests[0];
            s.Teleport(c.x, c.y); s.Step(new PlayerInput(), 2); s.Step(new PlayerInput { InteractPressed = true });
            Assert.True(run.Chests[0].opened);
            Assert.True(s.Map.Drops.Count > drops);
        }

        [Fact]
        public void WeatherDependsOnMapAndHour()
        {
            var s = NewAt("V100");
            Assert.Equal("snow", s.WeatherAt(s.Data.GetMap("F101"), Oct));
            Assert.Null(s.WeatherAt(s.Data.GetMap("V516"), Oct)); // 部屋の型は降らない
            var kinds = new HashSet<string>();
            for (int h = 0; h < 200; h++) kinds.Add(s.WeatherAt(s.Data.GetMap("V301"), Oct.AddHours(h)) ?? "clear");
            Assert.Contains("petals", kinds); Assert.Contains("clear", kinds);
            Assert.Equal(s.WeatherAt(s.Data.GetMap("V301"), Oct), s.WeatherAt(s.Data.GetMap("V301"), Oct.AddMinutes(10)));
        }

        [Fact]
        public void TownSpotOpensWithTheTalkKey()
        {
            var s = NewAt("V100");
            var sp = s.Data.Fun.Spot("gacha.V100");
            StandAt(s, sp);
            s.Step(new PlayerInput { InteractPressed = true });
            Assert.Equal(sp, s.LastSpot);
        }
    }
}
