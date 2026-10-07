// 戦う: 敵を選び、同じ足場へ行って向き、ふつうの攻撃か攻撃スキル（押しっぱなし）で倒す。倒したら落ちた物を拾う。
using System;
using System.Collections.Generic;
using System.Linq;
using Lumina.Core.Combat;
using Lumina.Core.Game;
using Lumina.Core.Mobs;
using Lumina.Core.Skills;
using Lumina.Core.World;

namespace Lumina.PlayBot
{
    public sealed class AttackPlan
    {
        public string SkillId;    // null = ふつうの攻撃
        public double Front, Back, Up, Down;
        public bool Around, Ranged;
        public double Score;
    }

    public sealed partial class Bot
    {
        private readonly Dictionary<int, double> mobBlacklist = new Dictionary<int, double>(); // Uid → この時まで狙わない
        private string blacklistMap;

        // ---------------- 攻撃の選び方

        private static double RangedReach(string weaponType)
        {
            switch (weaponType)
            {
                case "弓":
                case "クロスボウ": return 350;
                case "クロー": return 250;
                case "銃": return 280;
                default: return 0;
            }
        }

        public AttackPlan BasicPlan()
        {
            var st = S.Stats;
            double reach = RangedReach(st.WeaponType);
            bool canShoot = reach > 0 && (!st.NeedsAmmo || st.Mods.NoAmmo || st.AmmoItem != null);
            if (reach > 0 && st.WeaponType != "弓" && st.WeaponType != "クロスボウ" && !canShoot) return null; // クロー・銃で弾が無い
            if (canShoot) return new AttackPlan { Front = reach + st.RangeBonus, Back = 0, Up = 40, Down = 20, Ranged = true, Score = 100 };
            return new AttackPlan { Front = GameSession.MeleeFront, Back = GameSession.MeleeBack, Up = GameSession.MeleeUp, Down = GameSession.MeleeDown, Score = reach > 0 ? 30 : 100 };
        }

        /// <summary>今使える一番強い攻撃（近くの敵の数で範囲攻撃を選ぶ）。</summary>
        public AttackPlan ChooseAttack(int nearby, int dir = 0)
        {
            var best = BasicPlan();
            bool mage = S.Character.Line == "magician";
            if (mage && best != null) best.Score = 20; // 魔法使いの杖で殴るのは弱い
            double basic = best?.Score ?? 0;
            int lv = S.Character.Level;
            bool lowMp = S.Character.Mp < S.Stats.MaxMp * 0.3;
            foreach (var (def, x) in S.Skills.Learned())
            {
                if (!def.IsAttack || !def.DealsDamage || def.Fixed != null || def.MesoExplosion) continue;
                if (def.ComboUse != 0 || def.NeedsBuff != null || def.NeedsCharge || def.NeedsEnergy) continue;
                if (def.SelfDamagePct > 0 || def.DecoyHpPct != null || def.BackJumpVx > 0 || def.Teleport != null) continue;
                if (!def.WeaponAllowed(S.Stats.WeaponType)) continue;
                if (S.Skills.CooldownLeft(def.Id) > 0) continue;
                int mp = S.SkillMpCost(def, x);
                if (S.Character.Mp < mp + 2) continue;
                if (def.UsesAmmo && !S.Stats.Mods.NoAmmo && (S.Stats.AmmoItem == null || S.Inventory.Count(S.Stats.AmmoItem) < def.HitCount(x) + 5)) continue;
                double power = def.Magic ? (def.Spell?.Eval(x, lv) ?? 0) * 2.2 : (def.Damage?.Eval(x, lv) ?? 0);
                if (def.WeaponMul.HasValue) power *= def.WeaponMul.Value / 3.6;
                var r = def.Range;
                double front = r.Front + (def.RangeBonus ? S.Stats.RangeBonus : 0);
                // 範囲の技は、実際に範囲に入っている敵の数で
                int inRange = dir != 0 ? CountInRect(Rect.InFront(S.Body.X, S.Body.Y, dir, front, r.Back, r.Up, r.Down, r.Around)) : nearby;
                int targets = Math.Max(1, Math.Min(def.TargetCount(x), Math.Max(1, inRange)));
                double time = Math.Max(0.3, def.Delay) + def.Cast + def.Charge;
                if (def.Rapid > 0) time = 1.0 / def.Rapid * 1.4;
                double score = power * def.HitCount(x) * targets / time;
                // MP は大事に（魔法使い以外は、ふつうの攻撃よりはっきり強い時だけ）
                if (!mage && score < basic * (lowMp ? 2.0 : 1.35)) continue;
                if (lowMp && !HasPotion(false)) score *= 0.5;
                if (best != null && score <= best.Score) continue;
                best = new AttackPlan
                {
                    SkillId = def.Id, Front = front, Back = r.Back, Up = r.Up, Down = r.Down,
                    Around = r.Around, Ranged = r.Front >= 150, Score = score,
                };
            }
            return best;
        }

        private int CountInRect(Rect r)
        {
            int n = 0;
            foreach (var m in S.Map.Mobs) if (Targetable(m) && r.Overlaps(m.Box)) n++;
            return n;
        }

        public bool HasPotion(bool hp)
        {
            foreach (var (tab, slot, it) in S.Inventory.All())
            {
                var u = D.Item(it.ItemId)?.Use;
                if (u == null || u.ReturnTo != null) continue;
                if (hp ? (u.Hp > 0 || u.HpPct > 0) : (u.Mp > 0 || u.MpPct > 0)) return true;
            }
            return false;
        }

        public static double RangeMargin = 8;
        public bool TraceFight;

        /// <summary>当たる範囲に入っているか。margin = 振り始めから当たるまでに敵が動く・押される分の余裕（px）。</summary>
        private bool InRange(AttackPlan a, Mob m, int dir, double margin = 0)
        {
            var b = S.Body;
            double front = Math.Max(20, a.Front - margin);
            double up = margin > 0 && m.Def.Move == MobMove.Fly ? Math.Max(10, a.Up - 18) : a.Up; // 飛ぶ敵は上下に揺れる
            var r = Rect.InFront(b.X, b.Y, dir, front, a.Back, up, a.Down, a.Around);
            // 当たる瞬間（振りの 300/800）に敵がいる所で見る
            double t = S.Stats.AttackDelay * 0.375;
            var box = m.Box;
            double dx = m.Vx * t;
            var moved = new Rect(box.X1 + dx, box.Y1, box.X2 + dx, box.Y2);
            return r.Overlaps(moved) && r.Overlaps(box);
        }

        // ---------------- 敵の場所

        public static double MeleeGapFrac = 0.55;

        public string MobNode(Mob m)
        {
            if (m.Seg != null)
            {
                double x = Math.Max(m.Seg.X1, Math.Min(m.Seg.X2, m.X));
                return R.NodeOf(m.Seg.Chain.Id, x);
            }
            return NodeBelow(m.X, m.Y - m.HopY);
        }

        private bool Blacklisted(Mob m)
        {
            if (blacklistMap != MapId) { mobBlacklist.Clear(); blacklistMap = MapId; }
            return mobBlacklist.TryGetValue(m.Uid, out var t) && t > Sec;
        }

        private void BlacklistMob(Mob m, double sec)
        {
            if (blacklistMap != MapId) { mobBlacklist.Clear(); blacklistMap = MapId; }
            mobBlacklist[m.Uid] = Sec + sec;
        }

        public bool Targetable(Mob m) => m.Alive && !m.Hidden && !m.Charmed && !m.Submerged && m.Def != null;

        /// <summary>狙う敵（近くて行ける物）。</summary>
        public Mob PickTarget(Func<Mob, bool> want)
        {
            string cur = Settle();
            if (cur == null) return null;
            Mob best = null; double bs = double.PositiveInfinity;
            foreach (var m in S.Map.Mobs)
            {
                if (!Targetable(m) || !want(m) || Blacklisted(m)) continue;
                string node = MobNode(m);
                if (node == null) continue;
                double score;
                if (node == cur) score = Math.Abs(m.X - S.Body.X);
                else
                {
                    var path = PathAvoiding(cur, node);
                    if (path == null) continue;
                    score = 250 * path.Count + Math.Abs(m.X - S.Body.X) * 0.5;
                }
                if (score < bs) { bs = score; best = m; }
            }
            return best;
        }

        private int NearbyMobs(double radius)
        {
            int n = 0;
            foreach (var m in S.Map.Mobs) if (Targetable(m) && Math.Abs(m.X - S.Body.X) < radius && Math.Abs(m.Y - S.Body.Y) < 80) n++;
            return n;
        }

        // ---------------- 1 体と戦う

        /// <summary>この敵を倒す（倒せたら true）。届かない・時間切れは false（しばらく狙わない）。</summary>
        public bool Engage(Mob m, double maxSec = 45)
        {
            string old = lastEngagedMob;
            lastEngagedMob = m.Def.Id; // 倒れた時にどの敵にやられたか（CanFight で避ける）
            try { return Timed("fight", () => EngageInner(m, maxSec)); }
            finally { lastEngagedMob = old; }
        }

        private bool EngageInner(Mob m, double maxSec)
        {
            double t0 = Sec;
            int uid = m.Uid;
            int lastHp = m.Hp; double lastProgress = Sec;
            int approachFails = 0, stalls = 0, stepBacks = 0, retreats = 0;
            long lastFrames = -1;
            while (Sec - t0 < maxSec)
            {
                // 1 回まわっても時間が進まない（近づけたつもりで届かない）時は待って数える
                if (Frames == lastFrames) { Frame(new PlayerInput()); if (++stalls > 120) { BlacklistMob(m, 60); return false; } }
                lastFrames = Frames;
                if (!m.Alive || m.Removed) return true;
                // 薬が無いまま HP が減った: 戦うのをやめて町で休む（町までの道で倒れないうちに）
                if (CountPotions(true) == 0 && S.Character.Hp < S.Stats.MaxHp * (Broke ? 0.35 : 0.55) && !fightingBack) { BlacklistMob(m, 20); return false; }
                if (!Targetable(m)) { Idle(10); if (Sec - t0 > maxSec * 0.8) break; continue; }
                if (m.Hp < lastHp) { lastHp = m.Hp; lastProgress = Sec; }
                if (Sec - lastProgress > 25) { BlacklistMob(m, 60); return false; } // 当たらない・減らない
                var plan = ChooseAttack(NearbyMobs(200), m.X >= S.Body.X ? 1 : -1);
                if (plan == null) { Note("attack", Line + ":" + S.Stats.WeaponType, "攻撃できない（" + S.Stats.WeaponType + "・弾 " + (S.Stats.AmmoItem ?? "無し") + "）"); return false; }
                if (!S.Body.OnGround) { if (Settle() == null) return false; continue; }
                int dir = m.X >= S.Body.X ? 1 : -1;
                // 遠くから撃つ職: 敵が近づいたら離れてから撃つ（引き撃ち）
                if (plan.Ranged && S.Attack == null && S.Body.OnGround && Math.Abs(m.X - S.Body.X) < 75 && retreats < 8 && CurNode() is string cn && cn == MobNode(m))
                {
                    var (ra, rb) = R.StandRange(cn);
                    double tx = Math.Max(ra, Math.Min(rb, S.Body.X - dir * 140));
                    if (Math.Abs(tx - S.Body.X) > 50) { retreats++; WalkTo(tx, 50); continue; }
                }
                // 敵が体に重なっている（後ろへ回られる）: 少し下がってから（人と同じ）
                if (!plan.Ranged && S.Attack == null && Math.Abs(m.X - S.Body.X) < 6 && S.Body.OnGround && stepBacks < 3)
                {
                    stepBacks++;
                    for (int k = 0; k < 10; k++) Frame(new PlayerInput { Left = S.Body.Facing > 0, Right = S.Body.Facing < 0 });
                    continue;
                }
                if (InRange(plan, m, dir, plan.Ranged ? 0 : RangeMargin) && S.Attack == null)
                {
                    if (S.Body.Facing != dir) { Frame(new PlayerInput { Left = dir < 0, Right = dir > 0 }); continue; }
                    var inp = plan.SkillId != null ? new PlayerInput { SkillHeld = plan.SkillId, SkillPressed = plan.SkillId } : new PlayerInput { Attack = true };
                    int sw0 = Swings, wh0 = Whiffs; double bx0 = S.Body.X, mx0 = m.X;
                    Frame(inp);
                    if (S.Attack == null) { Frame(new PlayerInput()); continue; } // 使えなかった（MP など）
                    for (int i = 0; i < 150 && S.Attack != null; i++) Frame(new PlayerInput());
                    if (TraceFight && Whiffs > wh0) Say("  空振り " + (plan.SkillId ?? "basic") + " 始め: 自分 " + bx0.ToString("0") + " 敵 " + mx0.ToString("0") + "（幅 " + m.Def.Width + "）→ 当たる時 自分 " + S.Body.X.ToString("0") + " 敵 " + m.X.ToString("0") + " 向き " + S.Body.Facing + " 敵の状態 " + m.State + " 生きている " + m.Alive + " y " + S.Body.Y.ToString("0") + "/" + m.Y.ToString("0"));
                    continue;
                }
                if (S.Attack != null) { Frame(new PlayerInput()); continue; }
                // 近づく
                string node = MobNode(m);
                string cur = CurNode();
                if (node == null) { BlacklistMob(m, 30); return false; }
                var (a, b) = R.StandRange(node);
                double gap = plan.Ranged ? Math.Max(40, Math.Min(plan.Front * 0.55, 200)) : m.Def.Width / 2 + plan.Front * MeleeGapFrac; // 近接も少し離れて（触れられる前に当てる）
                double sx = m.X - dir * gap;
                if (sx < a || sx > b) sx = m.X + dir * gap; // 反対側から
                sx = Math.Max(a, Math.Min(b, sx));
                if (cur == node)
                {
                    WalkTo(sx, 45);
                }
                else if (!MoveToNode(node, sx, 8))
                {
                    if (++approachFails >= 3) { BlacklistMob(m, 45); return false; }
                }
                // 遠い・高い所の敵に近づけないまま（縦の範囲が届かない）
                if (CurNode() == node && Math.Abs(S.Body.X - sx) < 4 && !InRange(plan, m, m.X >= S.Body.X ? 1 : -1) && Math.Abs(m.Y - S.Body.Y) > plan.Up + 20)
                {
                    if (++approachFails >= 6) { BlacklistMob(m, 45); return false; }
                }
            }
            if (m.Alive) BlacklistMob(m, 30);
            return !m.Alive;
        }

        // ---------------- 拾う

        /// <summary>まわりの落ちた物を拾う（同じ足場か近くの足場の物）。</summary>
        public void PickupAround(double radius = 260) => Timed("pickup", () => { PickupInner(radius); return 0; });

        private void PickupInner(double radius)
        {
            for (int i = 0; i < 40; i++)
            {
                if (S.Map.Drops.Any(d => !d.Landed && !d.PickedUp && Math.Abs(d.X - S.Body.X) < radius)) Frame(new PlayerInput());
                else break;
            }
            var tried = new HashSet<int>();
            for (int guard = 0; guard < 25; guard++)
            {
                var cur = Settle();
                if (cur == null) return;
                DropItem best = null; double bd = double.PositiveInfinity;
                foreach (var d in S.Map.Drops)
                {
                    if (!d.Landed || d.PickedUp || tried.Contains(d.Uid)) continue;
                    double dx = Math.Abs(d.X - S.Body.X);
                    if (dx > radius || Math.Abs(d.GroundY - S.Body.Y) > 200) continue;
                    if (!d.IsMeso && !WantItem(d.ItemId)) continue;
                    if (dx < bd) { bd = dx; best = d; }
                }
                if (best == null) return;
                tried.Add(best.Uid);
                string node = NodeAt(best.X, best.GroundY) ?? NodeBelow(best.X, best.GroundY - 5);
                if (node == null) continue;
                if (node != cur && !MoveToNode(node, best.X, 6)) continue;
                if (node == cur && !WalkTo(best.X, 300)) continue;
                for (int k = 0; k < 6 && !best.PickedUp; k++) Frame(new PlayerInput { Pickup = true });
                // 同じ所に重なった物も拾う
                for (int k = 0; k < 20 && S.Map.DropAt(S.Body.X, S.Body.Y) is DropItem more && WantDrop(more); k++) Frame(new PlayerInput { Pickup = true });
                if (!best.PickedUp && inventoryFullSeen) return;
            }
        }

        private bool WantDrop(DropItem d) => d.IsMeso || WantItem(d.ItemId);
        private bool inventoryFullSeen;
        public bool cannotAttack;

        // ---------------- 狩り

        /// <summary>このマップで want の敵を狩る。done が true になるか maxSec 秒たつまで。町へ行く必要が出たら戻る。</summary>
        public void HuntHere(Func<Mob, bool> want, Func<bool> done, double maxSec)
        {
            double t0 = Sec;
            int idle = 0;
            while (!done() && Sec - t0 < maxSec)
            {
                Upkeep();
                if (NeedTown()) return;
                if (CountPotions(true) == 0 && S.Character.Hp < S.Stats.MaxHp * (Broke ? 0.4 : 0.6)) return; // 薬が無い: 町で休む（Think → RestIfNeeded）
                if (Line == "magician" && CountPotions(false) == 0 && S.Character.Mp < S.Stats.MaxMp * 0.15) return; // MP が無い魔法使いは戦えない
                CastBuffs();
                var m = PickTarget(want);
                if (m == null)
                {
                    idle++;
                    if (idle % 3 == 1) WanderToSpawn(want);
                    else Idle(60);
                    if (idle > 40 && S.Map.Data.TimedSpawns.Count == 0) return; // 湧かない
                    continue;
                }
                idle = 0;
                if (BasicPlan() == null && ChooseAttack(1) == null) { cannotAttack = true; return; } // 弾が無い: 町へ
                long f0 = Frames;
                bool killed = Engage(m);
                if (killed) PickupAround();
                if (Frames == f0) Idle(30); // 時間が進まないまま回らないように
            }
        }

        private void WanderToSpawn(Func<Mob, bool> want)
        {
            var md = S.Map.Data;
            var spots = md.Spawns.Concat(md.TimedSpawns).Where(sp => { var def = D.Mob(sp.Mob); return def != null; }).ToList();
            if (spots.Count == 0) { Idle(60); return; }
            var sp2 = spots[(int)(Frames / 7 % spots.Count)];
            string node = NodeAt(sp2.X, sp2.Y) ?? NodeBelow(sp2.X, sp2.Y - 5);
            if (node != null) MoveToNode(node, sp2.X, 10);
            Idle(30);
        }
    }
}
