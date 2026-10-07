// NPC のセリフ（npc_lines.mjs → npcs.json の lines → NpcData.Lines → GameSession.NpcLine）と、クエストの残りの一言（QuestHint）。
using System.Linq;
using Lumina.Core.Game;
using Lumina.Core.Quests;
using Xunit;

namespace Lumina.Core.Tests
{
    public class NpcLineTests
    {
        [Fact]
        public void EveryNpcHasLines()
        {
            var d = TestData.Fresh();
            Assert.True(d.Npcs.Count >= 173);
            foreach (var n in d.Npcs.Values) Assert.True(n.Lines.Count >= 3, n.Id + " のセリフが少ない");
            // マップの NPC にも写る
            Assert.True(d.GetMap("S000").Npcs.Single(n => n.Id == "luka").Lines.Count >= 3);
        }

        [Fact]
        public void TalkingAgainChangesTheLine()
        {
            var h = Harness.NewGame(7);
            var s = h.S;
            var a = s.Talk("luka").Say;
            var b = s.Talk("luka").Say;
            Assert.False(string.IsNullOrEmpty(a));
            Assert.NotEqual(a, b);
            // 窓を作り直す時（受けた後など）は進めない
            Assert.Equal(b, s.Talk("luka", true).Say);
            // 最初は「まだ S-01 を終えていない」時の一言が先に出る
            Assert.Contains("浜で倒れてた", a);
        }

        [Fact]
        public void ConditionsAndPlaceholders()
        {
            var h = Harness.NewGame(8);
            var s = h.S;
            Assert.True(s.LineCondition("tier=0,lv<7"));
            Assert.False(s.LineCondition("tier>=1"));
            Assert.True(s.LineCondition("!done=S-01"));
            Assert.False(s.LineCondition("done=S-01"));
            Assert.False(s.LineCondition("doing=S-01"));
            Assert.Equal(StartResult.Ok, s.AcceptQuest("S-01"));
            Assert.True(s.LineCondition("doing=S-01"));
            Assert.True(s.LineCondition("line=beginner"));
        }

        [Fact]
        public void HintTellsWhatIsLeft()
        {
            var h = Harness.NewGame(9);
            var s = h.S;
            Assert.Null(s.Talk("luka").Hint);
            Assert.Equal(StartResult.Ok, s.AcceptQuest("S-01"));
            var hint = s.Talk("luka").Hint;
            Assert.NotNull(hint);
            Assert.Contains("はじめの小道", hint); // S-01: はじめの小道へ行く
        }
    }
}
