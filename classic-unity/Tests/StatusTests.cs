// 状態異常（STATS.md 4-3）: 重ねがけ・時間・毒（HP 1 で止まる）・気絶・暗闇・封印・呪い・弱り・凍結・眠り・治す薬・ボスの効きにくさ・お知らせ・アイコン。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Status;
using Lumina.Core.Util;
using Lumina.Core.World;
using Xunit;

namespace Lumina.Core.Tests
{
    public class StatusTests
    {
        // 平らな地面（y=600）と、高い足場（x 1200〜1600、y=420）
        internal static GameData Ground()
        {
            var d = TestData.Fresh();
            d.AddMap(MapData.FromJson("{\"id\":\"T_FLAT\",\"name\":\"平らな原\",\"region\":\"T\",\"type\":\"狩\",\"width\":3000,\"height\":800,"
                + "\"footholds\":[{\"id\":\"g\",\"ground\":true,\"points\":[[0,600],[3000,600]]},{\"id\":\"hi\",\"ground\":false,\"points\":[[1200,420],[1600,420]]}],"
                + "\"portals\":[{\"name\":\"sp\",\"type\":\"spawn\",\"x\":1000,\"y\":600}],\"returnMap\":\"S003\"}"));
            d.Mobs["T_DUMMY"] = MobDef.FromDict(Json.ParseObject(
                "{\"id\":\"T_DUMMY\",\"name\":\"わら人形\",\"lv\":30,\"kind\":\"normal\",\"move\":\"stand\",\"touch\":false,\"hp\":100000,\"exp\":100,"
                + "\"atk\":1,\"def\":0,\"avoid\":0,\"acc\":1,\"meso\":0,\"width\":40,\"height\":50,\"pushed\":0,\"speed\":0,\"attacks\":[]}"));
            return d;
        }

        internal static GameSession Session(GameData d = null, ulong seed = 3)
        {
            d ??= Ground();
            var s = GameSession.NewGame(d, "試し", seed);
            s.ChangeMap("T_FLAT");
            s.Map.Mobs.Clear();
            s.Character.Level = 30; s.Character.BaseMaxHp = 1000; s.Character.BaseMaxMp = 500;
            s.Character.Str = 40; s.Character.Dex = 40;
            s.RefreshStats();
            s.Character.Hp = s.Stats.MaxHp; s.Character.Mp = s.Stats.MaxMp;
            s.Out.Clear();
            return s;
        }

        private static void Run(GameSession s, PlayerInput inp, int frames, List<GameEvent> log = null)
        {
            for (int i = 0; i < frames; i++) { s.Out.Clear(); s.Step(inp); log?.AddRange(s.Out.Events); }
        }

        [Fact]
        public void SameKindRefreshesDifferentKindsStack()
        {
            var set = new StatusSet();
            Assert.True(set.Set(StatusKind.Poison, 5, 2));
            Assert.False(set.Set(StatusKind.Poison, 3, 4)); // かけ直し: 時間は長い方、強さは強い方
            Assert.Equal(5, set.Get(StatusKind.Poison).Remaining, 9);
            Assert.Equal(4, set.Get(StatusKind.Poison).Power, 9);
            set.Set(StatusKind.Poison, 8, 1);
            Assert.Equal(8, set.Get(StatusKind.Poison).Remaining, 9);
            Assert.Equal(4, set.Get(StatusKind.Poison).Power, 9);
            set.Set(StatusKind.Seal, 2, 0);
            set.Set(StatusKind.Darkness, 2, 0);
            Assert.Equal(50, set.Get(StatusKind.Darkness).Power); // 既定の強さ
            Assert.Equal((1 << (int)StatusKind.Poison) | (1 << (int)StatusKind.Seal) | (1 << (int)StatusKind.Darkness), set.Mask);
            Assert.Equal(new[] { StatusKind.Poison, StatusKind.Darkness, StatusKind.Seal }, set.Active.Select(e => e.Kind).ToArray());
            var ended = new List<StatusKind>();
            int ticks = set.Tick(2.0, ended);
            Assert.Equal(2, ticks); // 毒の 1 秒が 2 回
            Assert.Contains(StatusKind.Seal, ended);
            Assert.True(set.Has(StatusKind.Poison) && !set.Has(StatusKind.Seal));
            Assert.True(StatusSystem.TryParse("freeze", out var k) && k == StatusKind.Freeze);
            Assert.False(StatusSystem.TryParse("burn", out _));
        }

        [Fact]
        public void PoisonTicksPercentAndStopsAtOne()
        {
            var s = Session();
            int max = s.Stats.MaxHp;
            var log = new List<GameEvent>();
            Assert.Equal(StatusApplyResult.Applied, s.ApplyStatus(StatusKind.Poison, 3.5, 5));
            Assert.True(s.Pose.StatusIcons == 0); // まだ更新していない
            int hp0 = s.Character.Hp;
            var nums = new List<DamageNumber>();
            for (int i = 0; i < 60 * 4; i++) { s.Out.Clear(); s.Step(new PlayerInput()); log.AddRange(s.Out.Events); nums.AddRange(s.Out.Damage); }
            Assert.Equal(hp0 - 3 * (max * 5 / 100), s.Character.Hp); // 1 秒ごと 3 回（3.5 秒）
            Assert.Equal(3, nums.Count(n => n.Kind == DamageKind.Poison));
            Assert.Contains(log, e => e.Type == GameEventType.StatusEnded && e.Id == "poison" && e.Value == 0);
            // HP 1 で止まる（毒では倒れない）
            s.Character.Hp = 30;
            s.ApplyStatus(StatusKind.Poison, 10, 20);
            Run(s, new PlayerInput(), 60 * 10);
            Assert.Equal(1, s.Character.Hp);
            Assert.False(s.Dead);
        }

        [Fact]
        public void StunStopsMovingAttackingAndSkillsButNotPotions()
        {
            var s = Session();
            s.Inventory.Add("use.red_potion", 5);
            s.Inventory.Add("use.all_cure", 1);
            s.ApplyStatus(StatusKind.Stun, 2);
            double x0 = s.Body.X;
            Run(s, new PlayerInput { Right = true, Attack = true }, 30);
            Assert.Equal(x0, s.Body.X, 6);
            Assert.Null(s.Attack);
            Assert.True(s.Pose.HasStatus(StatusKind.Stun));
            s.Character.Hp -= 100;
            int hp = s.Character.Hp;
            Assert.True(s.UseItem("use.red_potion"));
            Assert.True(s.Character.Hp > hp);
            // 万能薬で治る → 動ける
            s.Out.Clear();
            Assert.True(s.UseItem("use.all_cure"));
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.StatusCured && e.Id == "stun");
            Run(s, new PlayerInput { Right = true }, 30);
            Assert.True(s.Body.X > x0 + 20);
        }

        [Fact]
        public void SealBlocksSkillsDarknessLowersAccCurseLowersAttackAndExp()
        {
            var s = Session();
            s.Character.Sp[0] = 10;
            Assert.Equal(Skills.LearnResult.Ok, s.LearnSkill("beginner.rest"));
            s.ApplyStatus(StatusKind.Seal, 5);
            Assert.Equal(SkillUseResult.Sealed, s.UseSkill("beginner.rest"));
            s.ApplyStatus(StatusKind.Stun, 1);
            Assert.Equal(SkillUseResult.Stunned, s.UseSkill("beginner.rest"));

            var t = Session();
            double acc = t.Stats.Acc; int watk = t.Stats.Watk, wdef = t.Stats.Wdef;
            t.ApplyStatus(StatusKind.Darkness, 5);
            t.RefreshStats();
            Assert.Equal(acc * 0.5, t.Stats.Acc, 6);
            t.ApplyStatus(StatusKind.Curse, 5);
            t.RefreshStats();
            Assert.Equal((int)Math.Floor(watk * 0.8), t.Stats.Watk);
            Assert.Equal((int)Math.Floor(wdef * 0.8), t.Stats.Wdef);
            // 呪い: 倒した時の経験値が半分
            var m = t.Map.Spawn("T_DUMMY", t.Body.X + 30, t.Body.Y);
            t.Out.Clear();
            t.DamageMob(m, new HitResult { Damage = 999999 });
            Assert.Contains(t.Out.Events, e => e.Type == GameEventType.ExpGained && e.Value == 50);
        }

        [Fact]
        public void WeakStopsJumpingFreezeAndSleepBreakOnHit()
        {
            var s = Session();
            s.ApplyStatus(StatusKind.Weak, 3);
            Run(s, new PlayerInput { Jump = true, JumpPressed = true }, 20);
            Assert.True(s.Body.OnGround);
            Assert.Equal(600, s.Body.Y, 6);
            Run(s, new PlayerInput(), 60 * 3);
            Assert.False(s.Status.Has(StatusKind.Weak));
            Run(s, new PlayerInput { Jump = true, JumpPressed = true }, 10);
            Assert.False(s.Body.OnGround);
            Run(s, new PlayerInput(), 120);

            s.ApplyStatus(StatusKind.Freeze, 10);
            s.ApplyStatus(StatusKind.Sleep, 10);
            Assert.False(s.Status.CanMove);
            s.Stats.Avoid = 0;
            Assert.True(s.TakeHit(10, 1, 9999, true, s.Body.X + 10));
            Assert.False(s.Status.Has(StatusKind.Freeze) || s.Status.Has(StatusKind.Sleep));

            // 敵も: 攻撃を受けると眠りが解ける
            var m = s.Map.Spawn("T_DUMMY", s.Body.X + 30, s.Body.Y);
            s.ApplyStatus(m, StatusKind.Sleep, 10);
            Assert.True(m.Status.Has(StatusKind.Sleep));
            s.DamageMob(m, new HitResult { Damage = 5 });
            Assert.False(m.Status.Has(StatusKind.Sleep));
        }

        [Fact]
        public void CurePotionsCureOnlyTheirKinds()
        {
            var s = Session();
            foreach (var id in new[] { "use.antidote", "use.eye_drop", "use.holy_water", "use.all_cure" }) s.Inventory.Add(id, 2);
            s.ApplyStatus(StatusKind.Poison, 30);
            s.ApplyStatus(StatusKind.Darkness, 30);
            s.ApplyStatus(StatusKind.Curse, 30);
            s.ApplyStatus(StatusKind.Weak, 30);
            Assert.True(s.UseItem("use.antidote"));
            Assert.False(s.Status.Has(StatusKind.Poison));
            Assert.True(s.Status.Has(StatusKind.Darkness));
            Assert.True(s.UseItem("use.eye_drop"));
            Assert.False(s.Status.Has(StatusKind.Darkness));
            Assert.True(s.UseItem("use.holy_water"));
            Assert.False(s.Status.Has(StatusKind.Curse));
            s.ApplyStatus(StatusKind.Seal, 30);
            s.ApplyStatus(StatusKind.Stun, 30);
            Assert.True(s.UseItem("use.all_cure"));
            Assert.False(s.Status.Has(StatusKind.Seal) || s.Status.Has(StatusKind.Stun));
            Assert.True(s.Status.Has(StatusKind.Weak)); // 弱りは時間だけ（STATS.md 4-3）
            Assert.Equal(1, s.Inventory.Count("use.all_cure"));
            // 治す物が無くても使える（なくなる）
            Assert.True(s.UseItem("use.all_cure"));
            Assert.Equal(0, s.Inventory.Count("use.all_cure"));
        }

        [Fact]
        public void MobsTakeStatusesAndBossesResist()
        {
            var s = Session();
            var log = new List<GameEvent>();
            var m = s.Map.Spawn("M044", s.Body.X + 300, s.Body.Y); // イノシシ（歩く）
            m.AggroT = 100; // 追ってくる
            Assert.Equal(StatusApplyResult.Applied, StatusSystem.Apply(m, "stun", 2, 0, s.Out));
            double x0 = m.X;
            Run(s, new PlayerInput(), 60, log);
            Assert.Equal(x0, m.X, 6); // 気絶中は動かない
            Assert.Equal(1 << (int)StatusKind.Stun, m.StatusIcons);
            Run(s, new PlayerInput(), 70, log);
            Assert.True(Math.Abs(m.X - x0) > 10); // 解けたら動く
            Assert.Contains(log, e => e.Type == GameEventType.StatusEnded && e.Id == "stun" && e.Value == m.Uid);
            // 毒: 1 で止まる
            m.Hp = 50;
            s.ApplyStatus(m, StatusKind.Poison, 30, 50);
            Run(s, new PlayerInput(), 60 * 3);
            Assert.Equal(1, m.Hp);
            Assert.True(m.Alive);
            // 暗闇・呪い
            int acc = m.Acc, atk = m.Atk;
            s.ApplyStatus(m, StatusKind.Darkness, 5);
            s.ApplyStatus(m, StatusKind.Curse, 5);
            Assert.Equal((int)Math.Round(acc * 0.5), m.Acc);
            Assert.Equal((int)Math.Round(atk * 0.8), m.Atk);

            // ボス: 気絶は 1/3、大ボスは効かない
            var boss = s.Map.Spawn("M029", s.Body.X + 600, s.Body.Y);
            s.ApplyStatus(boss, StatusKind.Stun, 3);
            Assert.Equal(1, boss.Status.Get(StatusKind.Stun).Remaining, 6);
            s.ApplyStatus(boss, StatusKind.Seal, 3);
            Assert.Equal(3, boss.Status.Get(StatusKind.Seal).Remaining, 6);
            var raid = s.Map.Spawn("M239", s.Body.X + 900, s.Body.Y);
            s.Out.Clear();
            Assert.Equal(StatusApplyResult.Immune, s.ApplyStatus(raid, StatusKind.Poison, 5));
            Assert.False(raid.Status.Any);
            Assert.Contains(s.Out.Events, e => e.Type == GameEventType.StatusResisted);
        }

        [Fact]
        public void DeathClearsStatuses()
        {
            var s = Session();
            s.ApplyStatus(StatusKind.Curse, 30);
            s.Stats.Avoid = 0;
            s.TakeHit(999999, 200, 9999, true, s.Body.X);
            Assert.True(s.Dead);
            Assert.False(s.Status.Any);
            Assert.Equal(StatusApplyResult.Invalid, s.ApplyStatus(StatusKind.Poison, 3));
        }
    }
}
