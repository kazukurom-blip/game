// 初心者の島のチュートリアル 20 本（QUESTS.md S-01〜S-20）を、最初から最後まで遊んで通す。
// 移動は本物の入力（歩く・跳ぶ・縄・ポータル）とポータルだけでつながりをたどり、敵は攻撃キーで倒し、落ちた物は拾う。
using System;
using System.Linq;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Xunit;
using Xunit.Abstractions;

namespace Lumina.Core.Tests
{
    public class TutorialTests
    {
        private readonly ITestOutputHelper output;
        public TutorialTests(ITestOutputHelper output) { this.output = output; }

        private static void Accept(Harness h, string id)
        {
            var r = h.S.AcceptQuest(id);
            Assert.True(r == StartResult.Ok, id + " を受けられない: " + r + "（Lv" + h.S.Character.Level + "）");
        }

        private static void Complete(Harness h, string id)
        {
            var r = h.S.CompleteQuest(id);
            Assert.True(r == CompleteResult.Ok, id + " を完了できない: " + r);
            Assert.Equal(QuestStatus.Completed, h.S.Quests.Status(id));
        }

        [Fact]
        public void TutorialIslandAll20Quests()
        {
            var h = Harness.NewGame(2024);
            var s = h.S;
            Assert.Equal("S000", s.Map.Data.Id);

            // S-01: 目覚めの浜。右へ歩き、岩をジャンプで越えて、ポータルで はじめの小道 へ
            Assert.Equal(1, s.NpcBulb("luka"));
            var dlg = s.Talk("luka");
            Assert.Contains(dlg.Available, q => q.Id == "S-01");
            Accept(h, "S-01");
            int f = 0;
            while (s.Body.X < 1340 && f++ < 1200)
            {
                bool nearRock = s.Body.X > 560 && s.Body.X < 620;
                h.Run(new PlayerInput { Right = true, Jump = nearRock, JumpPressed = nearRock });
            }
            Assert.True(s.Body.X >= 1340, "岩を越えられなかった x=" + s.Body.X);
            h.Run(new PlayerInput { Up = true, UpPressed = true });
            Assert.Equal("S001", s.Map.Data.Id);
            Assert.Equal(2, s.NpcBulb("ganzo")); // 報告できる（緑の電球）
            s.Talk("ganzo");
            Complete(h, "S-01");
            Assert.Equal(5, s.Inventory.Count("use.red_potion"));

            // S-02: 縄につかまって上の段へ登り、木箱を調べる（本物の入力）
            Accept(h, "S-02");
            s.Teleport(1340, 640);
            h.Run(new PlayerInput { Up = true }, 1);
            Assert.Equal(BodyState.Rope, s.Body.State);
            for (int i = 0; i < 200 && s.Body.State != BodyState.Stand; i++) h.Run(new PlayerInput { Up = true });
            Assert.Equal(512, s.Body.Y);
            for (int i = 0; i < 200 && s.Body.X < 1478; i++) h.Run(new PlayerInput { Right = true });
            h.Idle(30);
            Assert.True(s.Interact("S001.crate"), "木箱に届かない x=" + s.Body.X + " y=" + s.Body.Y);
            Complete(h, "S-02");

            // S-03: コロ貝を 3 匹
            Accept(h, "S-03");
            h.HuntKills("M001", 3);
            Complete(h, "S-03");
            h.WearBest();

            // S-04: アオコロ貝のから ×2（はしごの丘）
            h.GoTo("S002");
            Accept(h, "S-04");
            h.HuntItems("M002", "etc.M002", 2);
            Complete(h, "S-04");
            Assert.Equal(0, s.Inventory.Count("etc.M002")); // 渡した

            // S-05: 芽吹き村の村長に会う
            h.LevelTo(2);
            Accept(h, "S-05");
            h.GoTo("S003");
            s.Talk("yomogi");
            Complete(h, "S-05");

            // S-06: 村のあいさつ回り
            Accept(h, "S-06");
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("S-06"));
            foreach (var n in new[] { "tata", "nina", "momo", "tobio" }) s.Talk(n);
            Complete(h, "S-06");

            // S-07: 訓練所。薬をクイックスロットに置いて使う
            h.GoTo("S011");
            Accept(h, "S-07");
            s.SetQuickSlot(0, "item", "use.red_potion");
            s.PressQuickSlot(0);
            Complete(h, "S-07");

            // S-08: AP を 5 振る（Lv3 から）
            h.LevelTo(3);
            h.GoTo("S011");
            Accept(h, "S-08");
            Assert.Equal(CompleteResult.NotDone, s.CompleteQuest("S-08"));
            h.LevelTo(s.Character.Level + 1); // Lv が上がってもらった AP 5 を手で振る（Harness.AllocateAp）
            h.GoTo("S011");
            Complete(h, "S-08");

            // S-09: SP を 1 振ってスキルを使う（石つぶて）
            Accept(h, "S-09");
            Assert.Equal(Skills.LearnResult.Ok, s.LearnSkill("beginner.pebble"));
            Assert.Equal(SkillUseResult.Ok, s.UseSkill("beginner.pebble"));
            h.Idle(60);
            Complete(h, "S-09");

            // S-10: アオコロ貝を 10 匹（村の畑）
            h.GoTo("S003");
            Accept(h, "S-10");
            h.GoTo("S004");
            h.HuntKills("M002", 10);
            h.GoTo("S003");
            Complete(h, "S-10");
            h.WearBest();

            // S-11: ホコリダケの胞子 ×10
            h.LevelTo(4);
            h.GoTo("S003");
            Accept(h, "S-11");
            h.HuntItems("M003", "etc.M003", 10);
            h.GoTo("S003");
            Complete(h, "S-11");

            // S-20: 貝の首飾り（コロ貝のから ×5）。Lv5 から
            h.LevelTo(5);
            h.GoTo("S003");
            Accept(h, "S-20");
            h.GoTo("S004");
            h.HuntItems("M001", "etc.M001", 5);
            h.GoTo("S003");
            Complete(h, "S-20");
            Assert.Equal(1, s.Inventory.Count("eq.cosmetic.shell_necklace"));

            // S-12: スライムの泉の隠しポータル → 小部屋の箱
            Accept(h, "S-12");
            h.GoTo("S007");
            h.TakePortal("secret");
            Assert.Equal("S007", s.Map.Data.Id);
            Assert.Equal(300, s.Body.Y);
            s.Teleport(1680, 300);
            Assert.True(s.Interact("S007.box"));
            h.TakePortal("room");
            Assert.Equal(640, s.Body.Y);
            h.GoTo("S003");
            Complete(h, "S-12");
            h.WearBest();

            // S-13: ポヨのしずく ×15 / S-14: アカコロ貝 15 匹（Lv6 から）
            h.LevelTo(6);
            h.GoTo("S003");
            Accept(h, "S-13");
            Accept(h, "S-14");
            h.HuntItems("M005", "etc.M005", 15);
            h.HuntKills("M004", 15);
            h.GoTo("S003");
            Complete(h, "S-13");
            Complete(h, "S-14");
            h.WearBest();

            // S-15: ダイダイダケのかさ ×10 / S-16: 高台から大陸を眺める（Lv7 から）
            h.LevelTo(7);
            h.GoTo("S003");
            Accept(h, "S-15");
            h.HuntItems("M006", "etc.M006", 10);
            h.GoTo("S003");
            Complete(h, "S-15");
            Accept(h, "S-16");
            h.GoTo("S008");
            s.Teleport(900, 540);
            Assert.True(s.Interact("S008.view"));
            h.GoTo("S003");
            Complete(h, "S-16");
            h.WearBest();

            // S-17: 大コロ貝（強敵、Lv9 から）
            h.LevelTo(9);
            h.GoTo("S003");
            Accept(h, "S-17");
            h.GoTo("S009");
            Assert.Contains(s.Map.Mobs, m => m.Def.Id == "M007");
            h.HuntKills("M007", 1);
            h.GoTo("S003");
            Complete(h, "S-17");
            Assert.True(s.Inventory.Has("use.safety_charm"));

            // S-18: 旅立ちの準備（村の 4 人にお別れ → 船長カイ）
            Accept(h, "S-18");
            foreach (var n in new[] { "tata", "nina", "momo", "tobio" }) s.Talk(n);
            h.GoTo("S010");
            s.Talk("kai");
            Complete(h, "S-18");
            Assert.True(s.Inventory.Has("special.letter_breeze"));

            // S-19: 大陸への船（乗ってブリーズ港に着くと自動で完了）
            Accept(h, "S-19");
            Assert.True(s.Travel("kai"));
            Assert.Equal("V100", s.Map.Data.Id);
            Assert.Equal(QuestStatus.Completed, s.Quests.Status("S-19"));
            Assert.True(s.Flags["leftIsland"]);

            // 20 本すべて完了
            var tutorial = s.Data.QuestList.Where(q => q.Tutorial).ToList();
            Assert.Equal(20, tutorial.Count);
            foreach (var q in tutorial) Assert.True(s.Quests.IsCompleted(q.Id), q.Id + " が完了していない");
            output.WriteLine($"Lv{s.Character.Level} 経験値 {s.Character.Exp} お金 {s.Inventory.Meso} 倒れた回数 {h.Deaths} フレーム {h.Frames}（{h.Frames / 60.0 / 60.0:F1} 分）");
            output.WriteLine($"STR {s.Character.Str} DEX {s.Character.Dex} HP {s.Character.Hp}/{s.Stats.MaxHp} 攻撃 {s.Stats.Range}");
        }
    }
}
