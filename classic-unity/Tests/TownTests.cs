// 町と成長の仕組み: 店の品ぞろえ・倉庫（キャラ全員で共有）・タクシー・2〜4 次の転職の試験とクイズ・ボスの間の決まり・
// 1 人用ダンジョンのクリア・一方通行のポータル・毎日の宝箱・ペット・椅子・製作。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;
using Lumina.Core.Quests;
using Lumina.Core.Save;
using Lumina.Core.Town;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class TownTests
    {
        private static readonly DateTime Day1 = new DateTime(2026, 10, 7, 12, 0, 0, DateTimeKind.Utc);

        private static GameSession NewAt(string map, int level = 30, ulong seed = 7)
        {
            var s = GameSession.NewGame(TestData.Get(), "町", seed);
            s.Clock = () => Day1;
            s.Character.Level = level;
            foreach (var q in TestData.Get().QuestList.Where(q => q.Tutorial)) s.Quests.MarkCompleted(q.Id, 0);
            s.ChangeMap(map);
            return s;
        }

        private static void Accept(GameSession s, string id) => Assert.Equal(StartResult.Ok, s.AcceptQuest(id));

        /// <summary>その敵を 1 体倒す（HP を 1 にしてから攻撃キー）。</summary>
        private static void KillWeakened(GameSession s, string mobId)
        {
            var h = new Harness(s);
            s.Character.Dex = 999; s.Character.BaseMaxHp = Math.Max(s.Character.BaseMaxHp, 10_000_000); s.RefreshStats();
            s.Character.Hp = s.Stats.MaxHp;
            foreach (var m in s.Map.Mobs.Where(m => m.Alive && m.Def.Id == mobId)) m.Hp = 1;
            Assert.True(h.KillOne(mobId, 3000), mobId + " を倒せなかった");
        }

        // ---------------- 店（ITEMS.md 6 章）

        [Fact]
        public void EveryTownHasWeaponArmorAndPotionShopsInItsLevelBand()
        {
            var d = TestData.Get();
            var bands = new Dictionary<string, (int lo, int hi)>
            {
                { "V100", (10, 15) }, { "V200", (10, 35) }, { "V300", (8, 35) }, { "V400", (10, 35) }, { "V500", (10, 35) }, { "V107", (10, 35) },
                { "C100", (30, 50) }, { "F100", (50, 60) }, { "T100", (35, 60) }, { "M100", (60, 70) }, { "D100", (70, 90) },
            };
            foreach (var kv in bands)
            {
                var m = d.GetMap(kv.Key);
                foreach (var kind in new[] { "weapon", "armor" })
                {
                    var id = "shop." + kv.Key + "." + kind;
                    Assert.True(d.Shops.ContainsKey(id), id);
                    Assert.Contains(m.Npcs, n => n.Shop == id); // 店の人がそのマップにいる
                    foreach (var e in d.Shops[id].Items)
                    {
                        var it = d.Item(e.Item);
                        if (!it.IsEquip) continue;
                        Assert.InRange(it.ReqLevel, kv.Value.lo, kv.Value.hi);
                        Assert.True(it.ReqLevel < 100, "Lv100 以上は店で売らない");
                        Assert.Equal(it.Price, e.Price); // 店の値段は装備の値段のまま（売る時は 1/5）
                    }
                }
            }
            // 薬屋は全部の町（野営地も）
            foreach (var t in new[] { "V100", "V200", "V300", "V400", "V500", "V600", "C100", "F100", "T100", "M100", "P100", "D100", "H100", "E100" })
                Assert.Contains(d.GetMap(t).Npcs, n => n.Shop == "shop." + t + ".potion");
            // 戦士の町は剣・盾、弓の町は矢
            Assert.Contains(d.Shops["shop.V400.weapon"].Items, e => d.Item(e.Item).WeaponType == "両手剣");
            Assert.Contains(d.Shops["shop.V400.armor"].Items, e => d.Item(e.Item).Slot == EquipSlot.Shield);
            Assert.Contains(d.Shops["shop.V200.weapon"].Items, e => e.Item == "use.arrow_bow");
            Assert.DoesNotContain(d.Shops["shop.V200.weapon"].Items, e => d.Item(e.Item).Job == "warrior");
        }

        [Fact]
        public void BuyAtWeaponShopSellForAFifthAndRecharge()
        {
            var s = NewAt("V400");
            s.Inventory.Meso = 100000;
            var e = s.ShopItems("shop.V400.weapon").First(x => TestData.Get().Item(x.Item).ReqLevel == 10);
            Assert.Equal(ShopResult.Ok, s.Buy("shop.V400.weapon", e.Item));
            Assert.Equal(100000 - e.Price, s.Inventory.Meso);
            int slot = Enumerable.Range(0, s.Inventory.SlotCount(InvTab.Equip)).First(i => s.Inventory.Get(InvTab.Equip, i)?.ItemId == e.Item);
            long before = s.Inventory.Meso;
            Assert.Equal(ShopResult.Ok, s.Sell(InvTab.Equip, slot));
            Assert.Equal(before + e.Price / 5, s.Inventory.Meso);
            // ほかの町の店では買えない
            Assert.Equal(ShopResult.NoShopHere, s.Buy("shop.V500.weapon", "use.star_iron"));
            // クロウ街: 投げ星の詰め直し（減った分を 1/2 の値段で）
            s.ChangeMap("V500");
            Assert.Equal(ShopResult.Ok, s.Buy("shop.V500.weapon", "use.star_iron"));
            int u = Enumerable.Range(0, s.Inventory.SlotCount(InvTab.Use)).First(i => s.Inventory.Get(InvTab.Use, i)?.ItemId == "use.star_iron");
            s.Inventory.Get(InvTab.Use, u).Count = 100;
            before = s.Inventory.Meso;
            Assert.Equal(ShopResult.Ok, s.Recharge("shop.V500.weapon", u));
            Assert.Equal(500, s.Inventory.Get(InvTab.Use, u).Count);
            Assert.Equal(before - 200, s.Inventory.Meso); // 400 個 × 500/500 ÷ 2
            Assert.Equal(ShopResult.NoShopHere, s.Recharge("shop.V500.armor", u));
        }

        [Fact]
        public void MarketShopsChangeEveryDay()
        {
            var s = NewAt("V090");
            s.Inventory.Meso = 10_000_000;
            var today = s.ShopItems("shop.V090.used").Select(e => e.Item).ToList();
            Assert.Equal(8, today.Count);
            Assert.Equal(today, s.ShopItems("shop.V090.used").Select(e => e.Item).ToList()); // 同じ日は同じ
            Assert.Equal(5, s.ShopItems("shop.V090.scroll").Count);
            var notToday = TestData.Get().Shops["shop.V090.used"].Items.First(e => !today.Contains(e.Item));
            Assert.Equal(ShopResult.NotSold, s.Buy("shop.V090.used", notToday.Item));
            Assert.Equal(ShopResult.Ok, s.Buy("shop.V090.used", today[0]));
            bool changed = false;
            for (int d = 1; d < 5 && !changed; d++)
            {
                var day = Day1.AddDays(d);
                s.Clock = () => day;
                changed = !s.ShopItems("shop.V090.used").Select(e => e.Item).SequenceEqual(today);
            }
            Assert.True(changed, "日が変わっても品が同じ");
        }

        // ---------------- 倉庫（ITEMS.md 1 章）

        [Fact]
        public void StorageFeeQuestEventsAndSharedBetweenCharacters()
        {
            var mem = new MemoryFileSystem();
            var store = new SaveStore(mem, "saves");
            var s = NewAt("V100", 12);
            s.AttachSave(store, "c1");
            s.Inventory.Meso = 50_000;
            s.Inventory.Add("use.red_potion", 30);
            s.Inventory.Add("eq.starter.0");
            s.Quests.MarkCompleted("V-01", 0);
            Accept(s, "V-13");
            Assert.Equal(16, s.Storage.Slots);
            int pot = Enumerable.Range(0, 24).First(i => s.Inventory.Get(InvTab.Use, i)?.ItemId == "use.red_potion");
            Assert.Equal(StorageResult.NoKeeperHere, s.StorageDeposit("jan", InvTab.Use, pot, 10));
            Assert.Equal(StorageResult.Ok, s.StorageDeposit("dan", InvTab.Use, pot, 10));
            Assert.Equal(49_900, s.Inventory.Meso); // 1 回 100 ルド
            Assert.Equal(20, s.Inventory.Count("use.red_potion"));
            Assert.Equal(10, s.Storage.Count("use.red_potion"));
            int eq = Enumerable.Range(0, 24).First(i => s.Inventory.Get(InvTab.Equip, i)?.ItemId == "eq.starter.0");
            Assert.Equal(StorageResult.Ok, s.StorageDeposit("dan", InvTab.Equip, eq));
            Assert.Equal(StorageResult.Ok, s.StorageWithdraw("dan", 0, 4));
            Assert.Equal(24, s.Inventory.Count("use.red_potion"));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("V-13"));   // 預けて取り出した
            Assert.Equal(20, s.Storage.Slots);                          // 報酬: 倉庫の枠 +4
            Assert.Equal(StorageResult.Ok, s.StorageDepositMeso("dan", 10_000));
            // 枠を増やす: 今 20 枠 → 2 回目の値段 20,000
            long m0 = s.Inventory.Meso;
            Assert.Equal(StorageResult.Ok, s.StorageExpand("dan"));
            Assert.Equal(24, s.Storage.Slots);
            Assert.Equal(m0 - 20_000, s.Inventory.Meso);
            // クエストの品は預けられない
            s.Inventory.Add("special.job.proof");
            Assert.Equal(StorageResult.CannotStore, s.StorageDeposit("dan", InvTab.Special, 0));
            Assert.True(s.SaveNow().Ok);

            // 別のキャラ（別の枠）でも同じ倉庫。別の町の倉庫番でも出せる
            var t = NewAt("V200", 15, 9);
            t.AttachSave(store, "c2");
            Assert.Equal(6, t.Storage.Count("use.red_potion"));
            Assert.Equal(24, t.Storage.Slots);
            Assert.Equal(10_000, t.Storage.Meso);
            t.Inventory.Meso = 1000;
            int idx = t.Storage.Items.FindIndex(x => x.ItemId == "eq.starter.0");
            Assert.Equal(StorageResult.Ok, t.StorageWithdraw("hako", idx));
            Assert.Equal(1, t.Inventory.Count("eq.starter.0"));
            Assert.True(t.SaveNow().Ok);
            // 最初のキャラを読み直すと、倉庫は 2 人目が取り出した後
            var again = GameSession.Load(TestData.Get(), store, "c1", out var lr);
            Assert.True(lr.Ok);
            Assert.Equal(0, again.Storage.Count("eq.starter.0"));
        }

        // ---------------- タクシー（WORLD.md 4 章）

        [Fact]
        public void TaxiGoesToEveryContinentTownWithBeginnerDiscount()
        {
            var d = TestData.Get();
            foreach (var town in new[] { "V100", "V200", "V300", "V400", "V500", "V600" })
            {
                var taxi = d.GetMap(town).Npcs.Single(n => n.Taxi != null);
                Assert.Equal(5, taxi.Taxi.Dests.Count);
                foreach (var dst in taxi.Taxi.Dests) Assert.InRange(dst.Fee, 800, 1500);
            }
            var s = NewAt("V100", 8);
            s.Inventory.Meso = 1000;
            Assert.Equal(0, s.Character.Tier);
            long fee = s.TaxiFee("marco", "V600");
            Assert.Equal(d.GetMap("V100").Npcs.First(n => n.Id == "marco").Taxi.Dests.First(x => x.To == "V600").Fee / 10, fee); // 初心者は 1/10
            Assert.Equal(TaxiResult.Ok, s.TaxiTo("marco", "V600"));
            Assert.Equal("V600", s.Map.Data.Id);
            Assert.Equal(1000 - fee, s.Inventory.Meso);
            // 1 次の後はふつうの料金。回数券なら無料
            s.Character.Level = 10; s.Character.Str = 35;
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob(JobLine.Warrior));
            s.Inventory.Meso = 500;
            var nemu = s.Map.Data.Npcs.Single(n => n.Taxi != null).Id;
            Assert.Equal(TaxiResult.NotEnoughMeso, s.TaxiTo(nemu, "V100"));
            s.Inventory.Add("use.taxi_ticket", 5);
            Assert.Equal(TaxiResult.Ok, s.TaxiTo(nemu, "V100", useTicket: true));
            Assert.Equal(4, s.Inventory.Count("use.taxi_ticket"));
            Assert.Equal(500, s.Inventory.Meso);
        }

        // ---------------- 2〜4 次の転職（JOBS.md 3 章）

        [Fact]
        public void SecondJobTrialOrbsResetOnLeavingAndAdvance()
        {
            var s = NewAt("V400", 30);
            s.Character.Str = 35;
            s.Character.Level = 10; s.AdvanceJob(JobLine.Warrior); s.Character.Level = 30;
            s.Quests.MarkCompleted("J1-1", 0);
            var b = NewAt("V400");
            b.Quests.MarkCompleted("J1-1", 0);
            Assert.Equal(StartResult.WrongJob, b.Quests.CanStart("J1-2", b.Character)); // 初心者は戦士の試験を受けられない
            s.Character.BaseMaxHp = 1_000_000; s.RefreshStats(); s.Character.Hp = s.Stats.MaxHp;
            Accept(s, "J1-2");
            s.Talk("dorga");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-2"));
            Assert.Equal(1, s.Inventory.Count("special.job.recommend"));
            // 修練場で試験を受ける → 20 分の制限時間
            s.ChangeMap("V413");
            Accept(s, "J1-3");
            Assert.True(s.RoomTimerRunning);
            Assert.Equal(1200, s.RoomTimeLeft, 3);
            s.Inventory.Add("etc.M301", 12);
            // 外に出るとやり直し（集めた珠は消える）
            s.ChangeMap("V400");
            Assert.Equal(0, s.Inventory.Count("etc.M301"));
            // 時間切れでもやり直し・外へ出される
            s.ChangeMap("V413");
            Assert.True(s.RoomTimerRunning);
            s.Inventory.Add("etc.M301", 29);
            s.Step(new PlayerInput(), 60);
            Assert.InRange(s.RoomTimeLeft, 1198.5, 1199.5);
            var h = new Harness(s);
            h.Idle(60 * 1200);
            Assert.Equal("V400", s.Map.Data.Id);
            Assert.Contains(h.Log, e => e.Type == GameEventType.RoomTimeUp);
            Assert.Equal(0, s.Inventory.Count("etc.M301"));
            // 3 度目: 30 個集めて受かる
            s.ChangeMap("V413");
            s.Inventory.Add("etc.M301", 30);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-3"));
            Assert.False(s.RoomTimerRunning);
            Assert.Equal(1, s.Inventory.Count("special.job.proof"));
            // 転職官に試験の証を渡して 2 次の職を選ぶ
            s.ChangeMap("V400");
            Accept(s, "J1-4");
            int slots = s.Inventory.SlotCount(InvTab.Equip);
            Assert.Equal(AdvanceResult.UnknownJob, s.AdvanceJob2(5));
            Assert.Equal(AdvanceResult.Ok, s.AdvanceJob2(0));
            Assert.Equal(2, s.Character.Tier);
            Assert.Equal("ファイター", s.Character.JobName);
            Assert.Equal(slots + 4, s.Inventory.SlotCount(InvTab.Equip));
            Assert.Equal(0, s.Inventory.Count("special.job.proof"));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-4"));   // job_advance.2
            Assert.Equal(AdvanceResult.AlreadyAdvanced, s.AdvanceJob2(1));
        }

        private static GameSession SecondJobWarrior(int level)
        {
            var s = NewAt("V400", 30);
            s.Character.Str = 35;
            s.Character.Level = 10; s.AdvanceJob(JobLine.Warrior); s.Character.Level = 30;
            s.Inventory.Add("special.job.proof");
            s.AdvanceJob2(0);
            foreach (var id in new[] { "J1-1", "J1-2", "J1-3", "J1-4" }) s.Quests.MarkCompleted(id, 0);
            s.Character.Level = level;
            return s;
        }

        [Fact]
        public void ThirdJobDimensionDoorCloneAndSageStoneQuiz()
        {
            var s = SecondJobWarrior(70);
            // 長老の手紙
            s.ChangeMap("F117");
            Accept(s, "J1-5");
            s.ChangeMap("V400"); s.Talk("dorga");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-5"));
            // 次元の扉: 試験を受けていないと修験の雪洞には入れない
            s.ChangeMap("F117");
            var door = s.Map.Data.Portals.First(p => p.To == "F118");
            Assert.Equal(RoomEntryResult.NeedQuest, s.CanEnterRoom("F118"));
            Assert.False(s.UsePortal(door));
            Assert.Equal("F117", s.Map.Data.Id);
            s.ChangeMap("F118");                                           // 依頼者は雪洞の中（テストなので直接）
            Accept(s, "J1-6");
            s.ChangeMap("F117");
            Assert.Equal(RoomEntryResult.Ok, s.CanEnterRoom("F118"));
            Assert.True(s.UsePortal(door));
            Assert.Equal("F118", s.Map.Data.Id);
            Assert.True(s.RoomTimerRunning);
            Assert.Contains(s.Map.Mobs, m => m.Def.Id == "M300" && m.Alive); // 入るとすぐもう一人の自分が出る
            KillWeakened(s, "M300");
            Assert.False(s.RoomTimerRunning);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-6"));
            int charms = s.Inventory.Count("etc.M300");
            Assert.True(charms >= 1);
            // 賢者の石: 黒いお守りと闇の水晶を捧げて 5 問
            s.ChangeMap("F107");
            Accept(s, "J1-7");
            var stone = s.Map.Data.Objects.First(o => o.Id == "F107.sage_stone");
            s.Teleport(stone.X, stone.Y);
            Assert.True(s.Interact(stone.Id));
            Assert.Null(s.Quiz);                                            // 闇の水晶が無い
            s.Inventory.Add("special.dark_crystal", 2);
            s.Interact(stone.Id);
            Assert.NotNull(s.Quiz);
            Assert.Equal(5, s.Quiz.Total);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.QuizQuestion);
            // 間違えると水晶を 1 つ失ってやり直し
            var q = s.Quiz.Current;
            Assert.Equal(4, q.Choices.Count);
            Assert.False(s.AnswerQuiz((q.Answer + 1) % 4));
            Assert.Null(s.Quiz);
            Assert.Equal(1, s.Inventory.Count("special.dark_crystal"));
            s.Interact(stone.Id);
            var seen = new HashSet<string>();
            for (int i = 0; i < 5; i++) { seen.Add(s.Quiz.Current.Id); Assert.True(s.AnswerQuiz(s.Quiz.Current.Answer)); }
            Assert.Equal(5, seen.Count);                                    // 同じ問題は出ない
            Assert.Null(s.Quiz);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-7"));      // 完了で 3 次の職
            Assert.Equal(3, s.Character.Tier);
            Assert.Equal("クルセイダー", s.Character.JobName);
            Assert.Equal(charms - 1, s.Inventory.Count("etc.M300"));     // 黒いお守りを捧げた
        }

        [Fact]
        public void FourthJobSealsAlwaysDropDuringTheTrialAndMasterBook()
        {
            var s = SecondJobWarrior(120);
            s.Character.AdvanceTier(0);
            foreach (var id in new[] { "J1-5", "J1-6", "J1-7" }) s.Quests.MarkCompleted(id, 0);
            s.ChangeMap("F117");
            Accept(s, "J1-8");
            s.ChangeMap("D115"); s.Talk("vald");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-8"));
            Accept(s, "J1-9");
            foreach (var (map, mob) in new[] { ("D105", "M211"), ("D106", "M212") })
            {
                s.ChangeMap(map);
                Assert.Contains(s.Map.Mobs, m => m.Def.Id == mob && m.Alive);
                KillWeakened(s, mob);
                new Harness(s).Idle(60);
                foreach (var dr in s.Map.Drops.Where(x => x.ItemId == "etc." + mob).ToList()) s.PickupDrop(dr);
                Assert.Equal(1, s.Inventory.Count("etc." + mob));          // 試験の間は必ず落とす
            }
            s.ChangeMap("D115");
            var log = new List<GameEvent>();
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("J1-9"));
            log.AddRange(s.Out.Events);
            Assert.Equal(4, s.Character.Tier);
            Assert.Equal("チャンピオン", s.Character.JobName);
            Assert.Contains(log, e => e.Type == GameEventType.JobAdvanced && e.Value == 4);
            Assert.Equal(1, s.Inventory.Count("use.master_book.20"));
            // 極意の書: ★のスキルの上限が上がる（★でない・今の上限以下の書は使えない＝書は残る）。
            // ★は最初 10。書は 10 ずつ（20 の書 → 30 の書）。30 の書を先には使えない
            Assert.Equal(MasterBookResult.Invalid, s.UseMasterBook("use.master_book.30", "champion.rush"));
            var star = TestData.Get().SkillList.First(k => k.Job == "warrior" && k.Tier == 4 && k.MasterLevel >= 30 && k.Branch == 0);
            Assert.Equal(10, s.Skills.MaxLevel(star));
            s.Inventory.Add("use.master_book.30");
            Assert.Equal(MasterBookResult.Invalid, s.UseMasterBook("use.master_book.30", star.Id));
            Assert.Equal(1, s.Inventory.Count("use.master_book.30"));
            MasterBookResult r20;
            int tries = 0;
            do { s.Inventory.Add("use.master_book.20"); r20 = s.UseMasterBook("use.master_book.20", star.Id); } while (r20 == MasterBookResult.Failed && ++tries < 100);
            Assert.Equal(MasterBookResult.Ok, r20);
            Assert.Equal(20, s.Skills.MaxLevel(star));
            var r = s.UseMasterBook("use.master_book.30", star.Id);
            Assert.NotEqual(MasterBookResult.Invalid, r);
            Assert.Equal(0, s.Inventory.Count("use.master_book.30"));
            if (r == MasterBookResult.Ok) Assert.Equal(30, s.Skills.MaxLevel(star));
        }

        // ---------------- ボスの間・ダンジョン（MONSTERS.md 5 章・QUESTS.md 6 章）

        [Fact]
        public void BossRoomEntriesPerDayTimeLimitAndDeathExit()
        {
            var s = NewAt("V411", 55);
            var portal = s.Map.Data.Portals.First(p => p.To == "V412");
            for (int i = 0; i < 3; i++)
            {
                Assert.Equal(3 - i, s.RoomEntriesLeft("V412"));
                Assert.True(s.UsePortal(portal), "入れない " + i);
                Assert.Equal("V412", s.Map.Data.Id);
                Assert.Contains(s.Map.Mobs, m => m.Def.Id == "M059" && m.Alive); // 入るたびにボスが出る
                s.ChangeMap("V411");
            }
            Assert.Equal(RoomEntryResult.NoEntriesLeft, s.CanEnterRoom("V412"));
            Assert.False(s.UsePortal(portal));
            Assert.Equal("V411", s.Map.Data.Id);
            // 次の日はまた 3 回
            s.Clock = () => Day1.AddDays(1);
            Assert.Equal(3, s.RoomEntriesLeft("V412"));
            Assert.True(s.UsePortal(portal));
            Assert.True(s.RoomTimerRunning);
            // 中で倒れたら戻り先（大将の墓所の前）で起き上がる
            s.Character.Hp = 1;
            s.Character.Tier = 1; s.Character.Line = JobLine.Warrior;
            s.Character.Exp = 1000;
            var die = typeof(GameSession).GetMethod("Die", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            die.Invoke(s, null);
            Assert.True(s.Dead);
            s.Revive();
            Assert.Equal("V411", s.Map.Data.Id);
            // 鍵が要る部屋・週 1 回の部屋
            var t = NewAt("T116", 115);
            Assert.Equal(RoomEntryResult.NeedItem, t.CanEnterRoom("T117"));
            t.Inventory.Add("special.key.time");
            Assert.Equal(RoomEntryResult.Ok, t.CanEnterRoom("T117"));
            t.Character.BaseMaxHp = 10_000_000; t.RefreshStats(); t.Character.Hp = t.Stats.MaxHp;
            Assert.True(t.UsePortal(t.Map.Data.Portals.First(p => p.To == "T117")));
            Assert.Equal(1200, t.RoomTimeLeft, 3);
            new Harness(t).Idle(60 * 1201);
            Assert.Equal("T116", t.Map.Data.Id);                         // 時間切れで外へ
            Assert.Equal(1, t.RoomEntriesLeft("T117"));                    // 入った回数は減ったまま
            var dragon = TestData.Get().Systems.Room("D114");
            Assert.True(dragon.Weekly && dragon.PerDay == 1);
        }

        [Fact]
        public void DungeonClearSendsEventsGivesMedalAndCountsBossKill()
        {
            var s = NewAt("V515", 20);
            var gate = s.Map.Data.Portals.First(p => p.To == "V516");
            Assert.Equal(RoomEntryResult.LevelOutOfRange, s.CanEnterRoom("V516"));
            s.Character.Level = 25;
            Accept(s, "PQ-1");
            s.ChangeMap("V090");
            Accept(s, "R-22");
            s.ChangeMap("V515");
            Assert.True(s.UsePortal(gate));
            Assert.Equal(1200, s.RoomTimeLeft, 3);
            Assert.True(s.InDungeon);
            Assert.Equal(4, s.RoomEntriesLeft("V516"));
            KillWeakened(s, "M068");
            Assert.True(s.RoomCleared);
            Assert.False(s.RoomTimerRunning);
            Assert.True(s.Inventory.Count("etc.medal.V516") >= 1);
            s.ChangeMap("V515");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("PQ-1"));   // dungeon_clear.V516
            s.ChangeMap("V090");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("R-22"));   // dungeon_clear
            // ボスを倒すと boss_kill
            s.Character.Level = 30;
            Accept(s, "R-21");
            s.ChangeMap("V208");
            KillWeakened(s, "M029");
            s.ChangeMap("V090");
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("R-21"));
        }

        [Fact]
        public void DyingInADungeonLosesOnePercent()
        {
            var s = NewAt("V515", 25);
            s.Character.Tier = 1; s.Character.Line = JobLine.Warrior;
            s.Character.Exp = s.Character.ExpToNext / 2;
            s.UsePortal(s.Map.Data.Portals.First(p => p.To == "V516"));
            long before = s.Character.Exp;
            typeof(GameSession).GetMethod("Die", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance).Invoke(s, null);
            long lost = s.Revive();
            Assert.Equal((long)Math.Floor(s.Character.ExpToNext * 0.01), lost);
            Assert.Equal(before - lost, s.Character.Exp);
            Assert.Equal("V515", s.Map.Data.Id);
        }

        // ---------------- 一方通行・毎日の宝箱（WORLD.md 6 章）

        [Fact]
        public void CloudTowerWindowSlidesDownOneWayAndToyBoxBottom()
        {
            var d = TestData.Get();
            foreach (var id in new[] { "C107", "C108", "C109", "C110" })
            {
                var w = d.GetMap(id).FindPortalByName("window");
                Assert.True(w != null && w.OneWay && w.To == "C111");
            }
            var landing = d.GetMap("C111").FindPortalByName("slide_in");
            Assert.Equal(PortalType.Landing, landing.Type);
            Assert.False(landing.IsEnterable);                                // 戻れない
            Assert.DoesNotContain(d.GetMap("C111").Portals, p => p.To == "C107");
            var s = NewAt("C107", 40);
            var win = s.Map.Data.FindPortalByName("window");
            s.Teleport(win.X, win.Y);
            s.Step(new PlayerInput { Up = true, UpPressed = true });
            Assert.Equal("C111", s.Map.Data.Id);
            Assert.Equal(landing.X, s.Body.X, 1);
            // おもちゃ箱の底: 落とし穴（一方通行）→ 宝箱は 1 日 1 回 → 出口は出現の位置へ
            var t = NewAt("T104", 32);
            var hole = t.Map.Data.FindPortalByName("secret");
            Assert.True(hole.OneWay && hole.Type == PortalType.Hidden);
            t.Teleport(hole.X, hole.Y);
            t.Step(new PlayerInput { Up = true, UpPressed = true });
            var box = t.Map.Data.Objects.First(o => o.Id == "T104.toybox");
            Assert.Equal(box.Y, t.Body.Y);
            t.Teleport(box.X, box.Y);
            long m0 = t.Inventory.Meso;
            Assert.True(t.Interact(box.Id));
            Assert.True(t.Inventory.Meso > m0);
            Assert.Contains(t.Out.Events, e => e.Type == GameEventType.ChestOpened);
            long m1 = t.Inventory.Meso;
            t.Interact(box.Id);
            Assert.Equal(m1, t.Inventory.Meso);                               // 今日はもう空
            t.Clock = () => Day1.AddDays(1);
            t.Interact(box.Id);
            Assert.True(t.Inventory.Meso > m1);
            var room = t.Map.Data.FindPortalByName("room");
            Assert.Equal("sp", room.ToPortal);
        }

        // ---------------- ペット（QUESTS.md 4 章）

        [Fact]
        public void PetAdoptFeedClosenessPickupPotionAndSave()
        {
            var mem = new MemoryFileSystem();
            var s = NewAt("V200", 12);
            s.AttachSave(new SaveStore(mem, ""), "p");
            s.Inventory.Meso = 20_000;
            Accept(s, "PET-01");
            Assert.Equal(ShopResult.Ok, s.Buy("shop.V200.pet", "use.pet.puppy"));
            Assert.Equal(10_000, s.Inventory.Meso);
            Assert.True(s.UseItem("use.pet.puppy"));
            Assert.Single(s.Pets);
            Assert.True(s.Pets[0].Out);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("PET-01"));     // pet_adopted
            Assert.Equal(10, s.Inventory.Count("use.pet_food"));            // 報酬
            // 満腹度は時間で減る（36 秒で 1）
            var h = new Harness(s);
            h.Idle(60 * 37);
            Assert.Equal(99, s.Pets[0].Fullness);
            Accept(s, "PET-02");
            for (int i = 0; i < 3; i++) Assert.True(s.UseItem("use.pet_food"));
            Assert.Equal(100, s.Pets[0].Fullness);
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("PET-02"));     // 餌を 3 回
            // 親密度: 10 になると PET-04 の目的が「10」まで進む
            s.Quests.MarkCompleted("PET-03", 0);
            s.Character.Level = 15;
            Accept(s, "PET-04");
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("PET-04"));
            var rules = TestData.Get().Systems.Pets;
            s.Pets[0].Points = rules.PointsFor(10) - 1;
            s.Pets[0].Fullness = 50;
            Assert.True(s.FeedPet(0));
            Assert.Equal(10, s.Pets[0].Closeness(rules));
            Assert.Equal(CompleteResult.Ok, s.CompleteQuest("PET-04"));
            Assert.Equal(1, s.Inventory.Count("use.petskill.pickup"));
            Assert.True(s.UseItem("use.petskill.pickup"));
            Assert.True(s.Pets[0].SkillPickup);
            // 自動で拾う: 足元から 80 px の物
            s.Map.SpawnDrops(s.Body.X + 60, s.Body.Y, new List<DropItem> { new DropItem { ItemId = "use.red_potion", Count = 3 } });
            int pots = s.Inventory.Count("use.red_potion");
            h.Idle(90);
            Assert.Equal(pots + 3, s.Inventory.Count("use.red_potion"));
            // 自動で薬（技の本）: HP が半分を下回ると飲ませてくれる
            s.Pets[0].SkillPotion = true;
            s.Character.Hp = 5;
            h.Idle(2);
            Assert.True(s.Character.Hp > 5);
            Assert.Contains(h.Log, e => e.Type == GameEventType.PetUsedPotion);
            // 2 匹目は PET-07 の後
            s.Inventory.Add("use.pet.kitten");
            s.UseItem("use.pet.kitten");
            Assert.False(s.Pets[1].Out);
            Assert.False(s.SetPetOut(1, true));
            s.Flags["pet.second"] = true;
            Assert.True(s.SetPetOut(1, true));
            // お腹が空くと動かない（死なない）
            s.Pets[1].Fullness = 0;
            h.Idle(2);
            Assert.Equal("hungry", s.Pets[1].Motion);
            // 名札で名前を変える
            s.Inventory.Add("use.pet_name_tag");
            Assert.True(s.RenamePet(0, "ポチ"));
            // 保存して読み直す
            Assert.True(s.SaveNow().Ok);
            var g = GameSession.Load(TestData.Get(), new SaveStore(mem, ""), "p", out _);
            Assert.Equal(2, g.Pets.Count);
            Assert.Equal("ポチ", g.Pets[0].Name);
            Assert.True(g.Pets[0].SkillPickup && g.Pets[0].SkillPotion);
            Assert.Equal(s.Pets[0].Points, g.Pets[0].Points);
            Assert.Equal(0, g.Pets[1].Fullness);
        }

        [Fact]
        public void BabyDragonGrowsAtCloseness30()
        {
            var s = NewAt("D100", 100);
            s.Inventory.Add("use.pet.dragon");
            Assert.True(s.UseItem("use.pet.dragon"));
            var rules = TestData.Get().Systems.Pets;
            Assert.Equal("子竜", s.Pets[0].KindName(rules));
            s.Pets[0].Points = rules.PointsFor(30);
            Assert.Equal("竜", s.Pets[0].KindName(rules));
            Assert.Equal(rules.Tricks.Count, s.Pets[0].TrickCount(rules));
            Assert.Contains(TestData.Get().Quest("PET-08").Rewards, r => r.Item == "use.pet.dragon");
        }

        // ---------------- 椅子・製作

        [Fact]
        public void ChairRegensOneAndAHalfTimes()
        {
            var s = NewAt("V400", 20);
            s.Character.BaseMaxHp = 5000; s.Character.BaseMaxMp = 5000; s.RefreshStats();
            s.Inventory.Add("setup.chair.windmill");
            var h = new Harness(s);
            int r = s.Stats.HpRegen;
            s.Character.Hp = 10;
            h.Idle(60 * 11);
            int plain = s.Character.Hp - 10;
            Assert.True(plain > 0 && plain % r == 0);
            Assert.True(s.UseItem("setup.chair.windmill"));
            Assert.Equal("setup.chair.windmill", s.Sitting);
            s.Character.Hp = 10;
            h.Idle(60 * 11);
            Assert.Equal("sit", s.Pose.Motion);
            int chair = s.Character.Hp - 10;
            int per = (int)Math.Round(r * 1.5);
            Assert.True(chair > 0 && chair % per == 0, "座ると 1 回 " + per + "（" + chair + "）");
            // 歩くと立つ
            h.Run(new PlayerInput { Right = true }, 2);
            Assert.Null(s.Sitting);
            Assert.Contains(h.Log, e => e.Type == GameEventType.StoodUp);
            Assert.Contains(TestData.Get().Quest("B-12").Rewards, x => x.Item == "setup.chair.windmill");
        }

        [Fact]
        public void RefineOreAndCraftGauntlet()
        {
            var s = NewAt("V400", 50);
            s.Inventory.Meso = 100_000;
            s.Inventory.Add("etc.ore.mithril", 50);
            Assert.Contains(s.Talk("kaji").Crafts, c => c.Id == "refine.mithril");
            for (int i = 0; i < 5; i++) Assert.Equal(CraftResult.Ok, s.Craft("kaji", "refine.mithril"));
            Assert.Equal(5, s.Inventory.Count("etc.plate.mithril"));
            Assert.Equal(90_000, s.Inventory.Meso);
            Assert.Equal(CraftResult.MissingItems, s.Craft("kaji", "craft.mithril_gauntlet"));
            s.Inventory.Add("etc.M079", 30);
            Assert.Equal(CraftResult.Ok, s.Craft("kaji", "craft.mithril_gauntlet"));
            Assert.Equal(1, s.Inventory.Count("eq.craft.mithril_gauntlet"));
            Assert.Equal(2, TestData.Get().Item("eq.craft.mithril_gauntlet").Stats.Watk);
            Assert.Equal(CraftResult.NoCrafterHere, s.Craft("doran", "refine.starsteel"));
        }

        // ---------------- セーブの版 2 → 3

        [Fact]
        public void Version2SavesGetEmptyPetsAndDaily()
        {
            var s = NewAt("V100", 12);
            s.Daily.Use("room.V412", Day1);
            var json = SaveSerializer.ToJson(s.ToSaveData("t"));
            var sd = SaveSerializer.FromJson(json);
            Assert.Equal(new[] { DailyLog.DayNumber(Day1), 1 }, sd.Daily["room.V412"]);
            // 版 2 の形（pets・daily が無い）
            var v2 = json.Replace("\"version\":" + SaveMigrations.CurrentVersion, "\"version\":2");
            int k = v2.IndexOf(",\"pets\":", StringComparison.Ordinal);
            v2 = v2.Substring(0, k) + "}";
            var old = SaveSerializer.FromJson(v2);
            Assert.Equal(SaveMigrations.CurrentVersion, old.Version);
            Assert.Empty(old.Pets);
            Assert.Empty(old.Daily);
        }
    }
}
