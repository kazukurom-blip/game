// 近道（検証用）: Lv30・70・120 の「その段階まで普通に育ったキャラ」を作って、そこから遊ばせる。
//
// ボットが Lv1 から Lv70・120 まで遊ぶと何百時間もかかる（PLAYTEST.md の成長の表）。3 次・4 次の転職の道（マップ・クエスト・
// 試験・クイズ・ボス）が通るかを確かめるために、キャラだけを作る。作り方:
//   - 島のチュートリアルは完了・大陸の港（V100）から。
//   - Lv は CharacterState.LevelUp（本物の伸び方: HP/MP の幅・AP 5・SP）を 1 つずつ。AP・SP はボットと同じ振り方（UI の操作）。
//   - 1 次は AdvanceJob（UI の操作。もらう物も）、2 次は試験の証を持たせて AdvanceJob2、3 次は数値だけ（AdvanceTier）。
//     通ってきた転職のクエストは完了にする。
//   - お金は STATS.md 8 章の稼ぎの目安から決めた額（装備と薬はボットが店で買う）。
// ここで直接いじるのはキャラを作る時だけ。作った後は PlayerInput と UI の操作だけで遊ぶ。
using System;
using System.Linq;
using Lumina.Core.Character;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Items;

namespace Lumina.PlayBot
{
    public sealed partial class Bot
    {
        /// <summary>転職のクエストと、それに要る物のクエストだけをする（近道の検証用）。</summary>
        public bool JobOnly;
        public int StartLevel = 1;

        public static long CheckpointMeso(int level) => level >= 120 ? 12_000_000 : level >= 70 ? 1_500_000 : level >= 30 ? 40_000 : 3_000;

        public static Bot MakeCheckpoint(GameData data, string line, int branch, int level, ulong seed)
        {
            var bot = new Bot(data, line, branch, seed, "ckpt-" + line + "-" + level) { StartLevel = level };
            var s = bot.S;
            var c = s.Character;
            foreach (var q in data.QuestList.Where(q => q.Tutorial)) s.Quests.MarkCompleted(q.Id, 0);
            s.Flags["leftIsland"] = true;
            bot.WithMapChange(() => s.ChangeMap("V100"));
            string pre = bot.JobQuestPrefix;
            int adv1 = line == JobLine.Magician ? 8 : 10;
            while (c.Level < level)
            {
                if (c.Tier == 0 && c.Level >= adv1)
                {
                    bot.AllocateAp();
                    var r = s.AdvanceJob(line);
                    if (r != AdvanceResult.Ok) throw new InvalidOperationException("近道: 1 次転職できない " + r + " " + bot.StatLine());
                    s.Quests.MarkCompleted(pre + "-1", 0);
                }
                if (c.Tier == 1 && c.Level >= 30 && level > 30)
                {
                    s.Inventory.Add(data.Systems.Jobs.Proof);
                    var r = s.AdvanceJob2(branch);
                    if (r != AdvanceResult.Ok) throw new InvalidOperationException("近道: 2 次転職できない " + r);
                    foreach (var k in new[] { 2, 3, 4 }) s.Quests.MarkCompleted(pre + "-" + k, 0);
                }
                if (c.Tier == 2 && c.Level >= 70 && level > 70)
                {
                    c.AdvanceTier(c.Branch);
                    int plus = data.Systems.Jobs.InventoryPlus;
                    s.Inventory.Expand(InvTab.Equip, plus); s.Inventory.Expand(InvTab.Use, plus); s.Inventory.Expand(InvTab.Etc, plus);
                    foreach (var k in new[] { 5, 6, 7 }) s.Quests.MarkCompleted(pre + "-" + k, 0);
                }
                c.LevelUp(s.Rng, s.Skills.Growth(c.Level));
                s.RefreshStats();
                bot.AllocateAp();
                bot.AllocateSp();
            }
            if (c.Tier == 0 && c.Level >= adv1) { bot.AllocateAp(); s.AdvanceJob(line); s.Quests.MarkCompleted(pre + "-1", 0); }
            bot.AllocateAp();
            bot.AllocateSp();
            s.Inventory.AddMeso(CheckpointMeso(level));
            s.RefreshStats();
            c.Hp = s.Stats.MaxHp; c.Mp = s.Stats.MaxMp;
            bot.FlushEvents();
            bot.Levels.Clear();
            bot.Advances.Clear();
            bot.JobOnly = true;
            bot.Say("近道: Lv" + c.Level + " " + c.JobName + " から（" + bot.StatLine() + "）");
            return bot;
        }
    }
}
