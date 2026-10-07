// 状態異常をかける・治す・時間を進める（公開の入口）。スキル・アイテム・敵の技はここを通す。
//
//   StatusSystem.Apply(target, StatusKind.Poison, 10, 3, session.Out);   // 10 秒・最大 HP の 3%/秒
//   StatusSystem.Apply(mob, "stun", 2);                                  // 名前でも（データから）
//   StatusSystem.Cure(target, StatusKind.Poison, session.Out);
//   session.ApplyStatus(mob, StatusKind.Freeze, 3)                       // GameSession から（お知らせ付き）
//
// target は IStatusTarget（敵 = Mob、主人公 = GameSession）。
// 効きにくさ（MONSTERS.md 5 章）: ボスは気絶・凍結・眠りが 1/3 の時間、毒は 1/10 の強さ、変化・錯乱は効かない。大ボスは何も効かない。
using System;
using System.Collections.Generic;
using Lumina.Core.Game;

namespace Lumina.Core.Status
{
    public enum StatusResist { None, Boss, Immune }

    public enum StatusApplyResult { Applied, Refreshed, Resisted, Immune, Invalid }

    /// <summary>状態異常をかけられる物（主人公・敵）。</summary>
    public interface IStatusTarget
    {
        StatusSet Status { get; }
        StatusResist StatusResist { get; }
        int StatusUid { get; }          // お知らせの Value（主人公は 0、敵は Uid）
        double StatusX { get; }         // お知らせの位置（頭の上）
        double StatusY { get; }
    }

    public static class StatusSystem
    {
        public static readonly string[] Keys = { "poison", "stun", "darkness", "seal", "curse", "weak", "freeze", "sleep", "slow", "polymorph", "confuse" };
        public static readonly string[] Names = { "毒", "気絶", "暗闇", "封印", "呪い", "弱り", "凍結", "眠り", "遅延", "変化", "錯乱" };

        public static string Key(StatusKind k) => Keys[(int)k];
        public static string Name(StatusKind k) => Names[(int)k];

        /// <summary>データの名前（poison など）→ 種類。知らない名前は false。</summary>
        public static bool TryParse(string key, out StatusKind kind)
        {
            for (int i = 0; i < Keys.Length; i++)
                if (Keys[i] == key) { kind = (StatusKind)i; return true; }
            kind = StatusKind.Poison;
            return false;
        }

        /// <summary>
        /// 状態異常をかける。seconds = 続く時間（秒）、power = 強さ（0 なら種類ごとの既定: 毒 2%/秒・暗闇 50%・呪い 20%）。
        /// events を渡すと StatusApplied / StatusResisted のお知らせを出す。
        /// </summary>
        public static StatusApplyResult Apply(IStatusTarget target, StatusKind kind, double seconds, double power = 0, EventQueue events = null)
        {
            if (target == null || seconds <= 0) return StatusApplyResult.Invalid;
            var resist = target.StatusResist;
            if (resist == StatusResist.Immune)
            {
                events?.Add(GameEventType.StatusResisted, Key(kind), target.StatusUid, target.StatusX, target.StatusY, Name(kind));
                return StatusApplyResult.Immune;
            }
            if (resist == StatusResist.Boss)
            {
                // 変化・錯乱はボスに効かない（JOBS.md「ボス以外」）
                if (kind == StatusKind.Polymorph || kind == StatusKind.Confuse)
                {
                    events?.Add(GameEventType.StatusResisted, Key(kind), target.StatusUid, target.StatusX, target.StatusY, Name(kind));
                    return StatusApplyResult.Immune;
                }
                if (kind == StatusKind.Stun || kind == StatusKind.Freeze || kind == StatusKind.Sleep) seconds /= 3;
                if (kind == StatusKind.Poison) power = (power > 0 ? power : StatusSet.DefaultPower(kind)) / 10;
            }
            bool fresh = target.Status.Set(kind, seconds, power);
            events?.Add(GameEventType.StatusApplied, Key(kind), target.StatusUid, target.StatusX, target.StatusY, Name(kind));
            return fresh ? StatusApplyResult.Applied : StatusApplyResult.Refreshed;
        }

        /// <summary>名前（"poison" など）でかける。データ（スキル・敵の技）から使う。</summary>
        public static StatusApplyResult Apply(IStatusTarget target, string kind, double seconds, double power = 0, EventQueue events = null)
            => TryParse(kind, out var k) ? Apply(target, k, seconds, power, events) : StatusApplyResult.Invalid;

        /// <summary>確率つきでかける（chance 0〜1）。外れたら Resisted。</summary>
        public static StatusApplyResult TryApply(IStatusTarget target, StatusKind kind, double seconds, double power, double chance, Util.IRandom rng, EventQueue events = null)
        {
            if (chance < 1 && !Util.RandomExt.Chance(rng, chance)) return StatusApplyResult.Resisted;
            return Apply(target, kind, seconds, power, events);
        }

        /// <summary>治す。治ったら true（StatusCured のお知らせ）。</summary>
        public static bool Cure(IStatusTarget target, StatusKind kind, EventQueue events = null)
        {
            if (target == null || !target.Status.Remove(kind)) return false;
            events?.Add(GameEventType.StatusCured, Key(kind), target.StatusUid, target.StatusX, target.StatusY, Name(kind));
            return true;
        }

        /// <summary>いくつかまとめて治す（万能薬など）。治った数。</summary>
        public static int Cure(IStatusTarget target, IEnumerable<StatusKind> kinds, EventQueue events = null)
        {
            int n = 0;
            foreach (var k in kinds) if (Cure(target, k, events)) n++;
            return n;
        }

        private static readonly StatusKind[] BreakKinds = { StatusKind.Freeze, StatusKind.Sleep };

        /// <summary>攻撃を受けた: 凍結・眠りが解ける。</summary>
        public static void BreakOnHit(IStatusTarget target, EventQueue events = null)
        {
            foreach (var k in BreakKinds)
                if (target.Status.Remove(k)) events?.Add(GameEventType.StatusEnded, Key(k), target.StatusUid, target.StatusX, target.StatusY, Name(k));
        }

        /// <summary>
        /// 時間を進める。終わった物は StatusEnded のお知らせ。返り値は毒で減らす HP（HP 1 で止まるよう hp − 1 まで）。
        /// </summary>
        public static int Tick(IStatusTarget target, double dt, int hp, int maxHp, EventQueue events = null)
        {
            var set = target.Status;
            if (!set.Any) return 0;
            var poison = set.Get(StatusKind.Poison);
            double power = poison?.Power ?? 0;
            var expired = new List<StatusKind>(0);
            int ticks = set.Tick(dt, expired);
            foreach (var k in expired) events?.Add(GameEventType.StatusEnded, Key(k), target.StatusUid, target.StatusX, target.StatusY, Name(k));
            if (ticks <= 0 || hp <= 1) return 0;
            int per = PoisonDamage(maxHp, power);
            return Math.Min(hp - 1, per * ticks);
        }

        /// <summary>毒の 1 回のダメージ（最大 HP の power%、最低 1）。</summary>
        public static int PoisonDamage(int maxHp, double power) => Math.Max(1, (int)Math.Floor(maxHp * power / 100));
    }
}
