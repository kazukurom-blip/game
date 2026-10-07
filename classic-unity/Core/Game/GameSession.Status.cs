// 状態異常（主人公・敵）と、敵の技が主人公に当たる所（GameSession の続き）。
//
// 主人公の状態異常: session.Status（StatusSet）。頭の上のアイコンは session.Pose.StatusIcons（ビット）か Status.Active。
//   気絶・凍結・眠り = 動けない・攻撃もスキルも使えない（薬は使える）、封印 = スキル不可（治すスキルは使える）、
//   弱り = ジャンプできない、暗闇 = 命中 −50%、呪い = 攻撃力・防御 −20%・経験値 −50%、毒 = 1 秒ごとに最大 HP の 2%（HP 1 で止まる）。
// 敵の状態異常: mob.Status（同じ形）。毒の数字は DamageKind.Poison。凍結・眠りは攻撃を受けると解ける。
using System;
using System.Collections.Generic;
using Lumina.Core.Combat;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Status;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public sealed partial class GameSession : IStatusTarget
    {
        /// <summary>主人公の状態異常。</summary>
        public readonly StatusSet Status = new StatusSet();

        // IStatusTarget（主人公）
        StatusSet IStatusTarget.Status => Status;
        StatusResist IStatusTarget.StatusResist => StatusResist.None;
        int IStatusTarget.StatusUid => 0;
        double IStatusTarget.StatusX => Body?.X ?? 0;
        double IStatusTarget.StatusY => (Body?.Y ?? 0) - PlayerBody.Height;

        /// <summary>主人公に状態異常をかける（お知らせ付き）。死んでいる時はかからない。</summary>
        public StatusApplyResult ApplyStatus(StatusKind kind, double seconds, double power = 0)
        {
            if (Dead) return StatusApplyResult.Invalid;
            if (StatusImmune) return StatusApplyResult.Immune; // 聖なる盾
            return StatusSystem.Apply(this, kind, seconds, power, Out);
        }

        /// <summary>敵に状態異常をかける（お知らせ付き。スキルから使う）。</summary>
        public StatusApplyResult ApplyStatus(Mob mob, StatusKind kind, double seconds, double power = 0)
        {
            if (mob == null || !mob.Alive) return StatusApplyResult.Invalid;
            var r = StatusSystem.Apply(mob, kind, seconds, power, Out);
            if (r == StatusApplyResult.Applied || r == StatusApplyResult.Refreshed) mob.HpBarT = 5; // 構えていたら MobCombat が次のフレームで消す
            return r;
        }

        /// <summary>主人公の状態異常を治す（アイテム・スキル）。治った数。</summary>
        public int CureStatus(IEnumerable<StatusKind> kinds) => StatusSystem.Cure(this, kinds, Out);

        /// <summary>治すスキル（意志の力など）・万能薬で治る物（STATS.md 4-3）。</summary>
        public static readonly StatusKind[] CurableAll = { StatusKind.Poison, StatusKind.Stun, StatusKind.Darkness, StatusKind.Seal, StatusKind.Curse };

        // ---------------- 毎フレーム

        private void TickPlayerStatus(double dt)
        {
            int dmg = StatusSystem.Tick(this, dt, Character.Hp, Stats.MaxHp, Out);
            if (dmg > 0)
            {
                Character.Hp -= dmg;
                Out.Damage.Add(new DamageNumber { Kind = DamageKind.Poison, Value = dmg, X = Body.X, Y = Body.Y - PlayerBody.Height });
            }
        }

        private void TickMobStatus(Mob m, double dt)
        {
            if (!m.Status.Any) return;
            int dmg = StatusSystem.Tick(m, dt, m.Hp, m.MaxHp, Out);
            if (dmg > 0)
            {
                m.Hp -= dmg;
                Out.Damage.Add(new DamageNumber { Kind = DamageKind.Poison, Value = dmg, X = m.X, Y = m.HeadY, TargetUid = m.Uid });
            }
        }

        /// <summary>
        /// 敵の技・飛び道具・体当たりが主人公に当たった。atk が 0 なら状態異常だけ（無敵の間もかかる）。
        /// 当たったら（避けられなかったら）true。
        /// </summary>
        public bool HitPlayer(int atk, int mobLv, int mobAcc, bool magic, double fromX, StatusInflict status, string skillId = null, int mobUid = 0, Mob source = null)
        {
            if (Dead) return false;
            bool hit;
            if (atk <= 0) hit = true;
            else
            {
                if (Body.InvT > 0) return false;
                hit = TakeHit(atk, mobLv, mobAcc, magic, fromX, source);
            }
            if (!hit) return false;
            if (skillId != null) Out.Add(GameEventType.MobSkillHit, skillId, mobUid, Body.X, Body.Y);
            if (status != null && !Dead && !StatusImmune) StatusSystem.TryApply(this, status.Kind, status.Sec, status.Power, status.Chance, Rng, Out);
            return true;
        }

        // ---------------- 敵の技の当たる所（予兆 → 当たる → 残る）

        private void StepHazards(double dt)
        {
            if (Map.Hazards.Count == 0) return;
            var pbox = PlayerBox;
            foreach (var h in Map.Hazards)
            {
                if (h.Done) continue;
                if (!h.Fired)
                {
                    var owner = Map.FindMob(h.MobUid);
                    if (owner == null || !owner.Alive) { h.Done = true; continue; } // 撃つ前に倒れた
                    h.Warn -= dt;
                    if (h.Warn > 1e-9) continue;
                    h.Fired = true;
                    h.LingerT = h.Linger;
                    if (HazardTouches(h, pbox))
                        HitPlayer(h.Atk, h.MobLv, h.MobAcc, h.Magic, h.FromX, h.Status, h.SkillId, h.MobUid);
                    if (h.LingerT <= 0) h.Done = true;
                    continue;
                }
                // 残る技（毒の沼など）: 中にいる間、1 秒ごとに状態異常をかけ直す
                h.LingerT -= dt;
                h.TickT += dt;
                if (h.TickT >= 1)
                {
                    h.TickT -= 1;
                    if (h.Status != null && !Dead && !StatusImmune && HazardTouches(h, pbox))
                        StatusSystem.Apply(this, h.Status.Kind, h.Status.Sec, h.Status.Power, Out);
                }
                if (h.LingerT <= 0) h.Done = true;
            }
        }

        private bool HazardTouches(MobHazard h, Rect pbox)
        {
            if (Dead || Stats.Stealth) return false;
            if (h.GroundOnly && !Body.OnGround) return false;
            if (!double.IsNaN(h.SafeAboveY) && Body.Y < h.SafeAboveY) return false;
            return h.Global || h.Box.Overlaps(pbox);
        }
    }
}
