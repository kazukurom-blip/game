// スキル固有の動き（GameSession の続き）: 闘気・気合い・召喚の攻撃・テレポート・回復・遅れて当たる攻撃・状態異常の受け渡し。
//
// 状態異常（毒・気絶・凍結 …）は Core/Status/（StatusSystem）。スキルのデータの種類（type）を StatusKind に直してかける:
//   poison・burn → 毒、stun・bind → 気絶（動けない）、darkness → 暗闇、seal → 封印、freeze → 凍結、
//   slow → 遅延（速さ −）、polymorph → 変化（コロ貝の姿・技なし）、charm（錯乱弾）→ 錯乱（主人公の味方になる）。
// 身代わり人形・秘術の扉・乗船の船の HP・毒の霧・ボスの仕掛けは GameSession.Mechanics.cs。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Physics;
using Lumina.Core.Skills;
using Lumina.Core.Status;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    /// <summary>後から当たる攻撃（忍び寄る影の 1 秒ごと）。</summary>
    public sealed class PendingHit { public Mob Mob; public double Delay; public string SkillId; public int Level; public double Mul; }

    /// <summary>狙い撃ち・挑発の印（その敵へのダメージ +%・経験値 +%）。</summary>
    public sealed class MobMark { public double DamagePct, ExpPct, Until; }

    public sealed partial class GameSession
    {
        /// <summary>気合い（ブローラー）: 攻撃が当たるたびに 10 ずつ、100 で満タン。</summary>
        public int Energy;
        public const int EnergyMax = 100, EnergyPerHit = 10;
        public const double EnergyFullSec = 60; // 満タンが続く時間（似）

        /// <summary>StatusKind に無い状態異常の名前（データの書き間違いなど）を受け取る所（今は誰もつないでいない）。</summary>
        public Action<Mob, StatusRequest> MobStatusHook;
        /// <summary>聖なる盾がかかっている間は状態異常を受けない。</summary>
        public bool StatusImmune => Stats?.Mods.StatusImmune ?? false;

        /// <summary>スキルのデータの状態異常の名前 → StatusKind（無ければ false）。</summary>
        public static bool SkillStatusKind(string type, out StatusKind kind)
        {
            switch (type)
            {
                case "burn": kind = StatusKind.Poison; return true;   // 燃焼 = 火の毒
                case "bind": kind = StatusKind.Stun; return true;     // 動けない
                case "charm": kind = StatusKind.Confuse; return true; // 錯乱弾（敵は主人公の味方になる）
                default: return StatusSystem.TryParse(type, out kind);
            }
        }

        private readonly List<PendingHit> pendingHits = new List<PendingHit>();
        private readonly Dictionary<Mob, MobMark> marks = new Dictionary<Mob, MobMark>();
        private readonly HashSet<Mob> stolenFrom = new HashSet<Mob>();
        private PlayerInput skillInput; // テレポートの向き（↑↓）を見る

        // ---------------- 状態異常（渡すだけ）

        private void TryInflict(Mob mob, StatusRequest r)
        {
            if (mob == null || !mob.Alive) return;
            if (r.NoBoss && mob.Def.IsBoss) return;
            if (!Rng.Chance(r.Chance / 100)) return;
            if (SkillStatusKind(r.Type, out var kind))
            {
                if (kind == StatusKind.Polymorph && mob.PolyDef == null) mob.PolyDef = Data.Mob(PolymorphMobId);
                var res = ApplyStatus(mob, kind, r.Sec, r.Power);
                if (kind == StatusKind.Confuse && (res == StatusApplyResult.Applied || res == StatusApplyResult.Refreshed)) OnCharmed(mob);
            }
            else
            {
                Out.Add(GameEventType.MobHit, mob.Def.Id, 0, mob.X, mob.HeadY, "status:" + r.Type);
                MobStatusHook?.Invoke(mob, r);
            }
        }

        private void InflictSelf(StatusRequest r)
        {
            if (!Rng.Chance(r.Chance / 100)) return;
            if (SkillStatusKind(r.Type, out var kind)) ApplyStatus(kind, r.Sec, r.Power); // 竜の咆哮: 自分は 2 秒動けない
        }

        private void CureSelf(string skillId)
        {
            if (CureStatus(CurableAll) > 0) Out.Add(GameEventType.Message, skillId, text: "状態異常が治った");
        }

        // ---------------- 闘気（クルセイダー・チャンピオン）

        /// <summary>今の闘気のダメージ +%（玉の数 × 1 つ分）。</summary>
        public double ComboBonusPct()
        {
            var cb = Buffs.ComboBuff;
            if (cb == null || cb.Orbs <= 0) return 0;
            return cb.Orbs * (cb.ComboDamage + Stats.Mods.ComboDamageBonus);
        }

        public int ComboOrbs => Buffs.ComboBuff?.Orbs ?? 0;
        public int ComboMax => (Buffs.ComboBuff?.ComboMax ?? 5) + (Stats?.Mods.ComboMaxBonus ?? 0);

        private void GainComboOrb()
        {
            var cb = Buffs.ComboBuff;
            if (cb == null) return;
            int add = 1 + (Stats.Mods.ComboRate > 0 && Rng.Chance(Stats.Mods.ComboRate / 100) ? 1 : 0);
            cb.Orbs = Math.Min(ComboMax, cb.Orbs + add);
        }

        /// <summary>闘気を使う（n = -1 なら全部）。</summary>
        private void UseComboOrbs(int n)
        {
            var cb = Buffs.ComboBuff;
            if (cb == null) return;
            cb.Orbs = n < 0 ? 0 : Math.Max(0, cb.Orbs - n);
        }

        // ---------------- 気合い（ブローラー）

        private void GainEnergy()
        {
            if (!Stats.Mods.HasEnergy || Energy >= EnergyMax) return;
            SetEnergy(Math.Min(EnergyMax, Energy + EnergyPerHit));
        }

        private void SetEnergy(int v)
        {
            Energy = v;
            if (Energy >= EnergyMax)
            {
                var m = Stats.Mods;
                var b = new ActiveBuff { Id = StatCalc.EnergyBuffId, Name = "気合い", Total = EnergyFullSec, Remaining = EnergyFullSec };
                b.Stats.Watk = m.EnergyWatk; b.Stats.Wdef = m.EnergyWdef;
                Buffs.Apply(b);
                Out.Add(GameEventType.BuffStarted, StatCalc.EnergyBuffId, (long)EnergyFullSec);
            }
            else if (Buffs.Has(StatCalc.EnergyBuffId)) { Buffs.Remove(StatCalc.EnergyBuffId); Out.Add(GameEventType.BuffEnded, StatCalc.EnergyBuffId); }
            RefreshStats();
        }

        // ---------------- 回復・召喚・移動

        private void UseHealSkill(SkillDef def, int x)
        {
            int lv = Character.Level;
            if (def.HealPct != null) HealHp((int)Math.Floor(Stats.MaxHp * def.HealPct.Eval(x, lv) / 100));
            if (def.HealFlat != null) HealHp(def.HealFlat.EvalInt(x, lv));
            if (def.HealMul != null) HealHp((int)Math.Floor((Stats.Luk * def.HealLuk + Stats.Dex * def.HealDex) * def.HealMul.Eval(x, lv)));
            if (def.HealMpPct != null) HealMp((int)Math.Floor(Stats.MaxMp * def.HealMpPct.Eval(x, lv) / 100));
            if (def.UndeadSpell != null)
            {
                // ヒール: まわりの不死の敵（聖が弱点の敵）に聖の魔法
                var range = Rect.InFront(Body.X, Body.Y, Body.Facing, def.UndeadRange, def.UndeadRange, 100, 30, true);
                var undead = new List<Mob>();
                foreach (var m in Map.Mobs) if (m.Alive && m.Def.ElementMul("holy") > 1) undead.Add(m);
                int n = def.UndeadTargets?.EvalInt(x, lv) ?? 5;
                foreach (var m in Targeting.Pick(undead, mb => mb.Box, range, Body.X, Body.Facing, n))
                    DamageMob(m, DamageCalc.Magic(Stats, lv, m.Defender, def.UndeadSpell.Eval(x, lv), Rng, "holy"));
            }
            if (def.Buff != null) ApplySkillBuff(def, x);
        }

        private void StartSummon(SkillDef def, int x)
        {
            int lv = Character.Level;
            var sb = new ActiveBuff
            {
                Id = def.Id, Name = def.Name, SkillLevel = x, Summon = true, Total = def.SummonSec?.Eval(x, lv) ?? 60,
                SummonHeal = def.SummonHeal?.EvalInt(x, lv) ?? 0, SummonInterval = def.SummonHealInterval,
                SummonAttack = def.SummonAttack, SummonFixed = def.SummonFixed || def.DecoyHpPct != null, SummonX = Body.X + Body.Facing * 30, SummonY = Body.Y,
                DecoyHp = def.DecoyHpPct != null ? Math.Max(1, (int)Math.Floor(Stats.MaxHp * def.DecoyHpPct.Eval(x, lv) / 100)) : 0,
                SummonMap = Map.Data.Id,
            };
            sb.DecoyMaxHp = sb.DecoyHp;
            sb.Remaining = sb.Total;
            Buffs.Apply(sb);
            Out.Add(GameEventType.BuffStarted, def.Id, (long)sb.Total);
        }

        /// <summary>召喚した物・設置した物の攻撃（interval 秒ごと、近くの敵へ）。</summary>
        private void TickSummons(double dt)
        {
            foreach (var b in Buffs.Summons)
            {
                var sa = b.SummonAttack;
                if (sa == null || b.Remaining <= 0) continue;
                b.SummonAttackTimer += dt;
                if (b.SummonAttackTimer < sa.Interval - 1e-9) continue;
                b.SummonAttackTimer -= sa.Interval;
                double ox = b.SummonFixed ? b.SummonX : Body.X, oy = b.SummonFixed ? b.SummonY : Body.Y;
                var range = sa.FrontOnly
                    ? Rect.InFront(ox, oy, Body.Facing, sa.Range, 0, 150, 60)
                    : Rect.InFront(ox, oy, Body.Facing, sa.Range, sa.Range, 150, 60, true);
                var alive = new List<Mob>();
                foreach (var m in Map.Mobs) if (m.Alive) alive.Add(m);
                int lv = Character.Level, x = b.SkillLevel;
                var targets = Targeting.Pick(alive, m => m.Box, range, ox, Body.Facing, sa.Targets?.EvalInt(x, lv) ?? 1);
                foreach (var mob in targets)
                {
                    var res = sa.Spell != null
                        ? DamageCalc.Magic(Stats, lv, mob.Defender, sa.Spell.Eval(x, lv), Rng, sa.Element)
                        : DamageCalc.Physical(Stats, lv, mob.Defender, sa.Damage?.Eval(x, lv) ?? 100, Rng, null, sa.Element);
                    DamageMob(mob, res);
                    if (!res.Miss) foreach (var st in sa.Status) TryInflict(mob, st.Eval(x, lv, b.Id));
                }
                if (targets.Count > 0) Out.Add(GameEventType.AttackHit, b.Id, targets.Count, ox, oy, "summon");
                if (sa.Once) b.Remaining = 0;
            }
        }

        private void TickPendingHits(double dt)
        {
            if (pendingHits.Count == 0) return;
            for (int i = pendingHits.Count - 1; i >= 0; i--)
            {
                var p = pendingHits[i];
                p.Delay -= dt;
                if (p.Delay > 1e-9) continue;
                pendingHits.RemoveAt(i);
                if (!p.Mob.Alive || !Map.Mobs.Contains(p.Mob)) continue;
                var def = Data.Skill(p.SkillId);
                var res = SkillDamage(p.Mob, def, p.Level, p.Mul, null);
                DamageMob(p.Mob, res);
            }
        }

        /// <summary>テレポート: 向いている方（↑↓を押していれば上下の足場）へ一瞬で。壁は越えない。</summary>
        private void DoTeleport(double dist)
        {
            var map = Map.Physics;
            if (skillInput.Up || skillInput.Down)
            {
                // 上下: その距離の中で一番遠い足場へ
                Foothold best = null; double by = Body.Y;
                foreach (var s in map.Segs)
                {
                    if (Body.X < s.X1 || Body.X > s.X2) continue;
                    double sy = s.YAt(Body.X);
                    bool ok = skillInput.Up ? sy < Body.Y - 20 && sy >= Body.Y - dist : sy > Body.Y + 20 && sy <= Body.Y + dist;
                    if (ok && (best == null || (skillInput.Up ? sy < by : sy > by))) { best = s; by = sy; }
                }
                if (best != null) PlayerPhysics.PlaceOnGround(Body, map, Body.X, by);
            }
            else
            {
                double tx = Body.X + Body.Facing * dist;
                foreach (var w in map.Walls)
                {
                    bool between = Body.Facing > 0 ? w.X > Body.X && w.X < tx : w.X < Body.X && w.X > tx;
                    bool overlap = w.Top < Body.Y && w.Bottom > Body.Y - PlayerBody.Height;
                    if (between && overlap) tx = w.X - Body.Facing * (PlayerBody.HalfW + 1);
                }
                tx = Math.Max(PlayerBody.HalfW, Math.Min(Map.Data.Width - PlayerBody.HalfW, tx));
                var seg = map.SegBelow(tx, Body.Y - 30);
                if (seg != null && seg.YAt(tx) - Body.Y < 60) PlayerPhysics.PlaceOnGround(Body, map, tx, seg.YAt(tx));
                else { Body.X = tx; Body.Seg = null; Body.Vy = 0; Body.SetState(BodyState.Air); } // 足場の無い所: そこから落ちる
            }
            PrevX = Body.X; PrevY = Body.Y;
            Out.Add(GameEventType.PortalUsed, "teleport", x: Body.X, y: Body.Y);
        }

        /// <summary>
        /// 秘術の扉: 今いる地域の町へ行き、町の側に戻る扉を開く（扉は効果の時間だけ。GameSession.Mechanics.cs の Door）。
        /// 使った場所にも扉が残り、そこからまた町へ行ける。
        /// </summary>
        private void OpenDoor(SkillDef def)
        {
            string town = Map.Data.ReturnMap ?? StartMap;
            if (Map.Data.IsTown || town == Map.Data.Id) { Out.Add(GameEventType.Message, def.Id, text: "町では使えない"); Buffs.Remove(def.Id); return; }
            var md = Data.GetMap(town);
            var door = new MysticDoor { SkillId = def.Id, FieldMap = Map.Data.Id, FieldX = Body.X, FieldY = Body.Y, TownMap = town };
            ChangeMap(town, md?.FindPortalByName("town") != null ? "town" : null);
            door.TownX = Body.X; door.TownY = Body.Y;
            Door = door;
            Out.Add(GameEventType.Mechanic, "door_open", 0, Body.X, Body.Y, "秘術の扉");
        }

        /// <summary>お金の爆発: 範囲の中の落ちているお金を使って、まわりの敵に（お金の量で決まる）固定ダメージ。</summary>
        private int MesoExplosion(SkillDef def, int x, Rect range, int maxTargets)
        {
            long total = 0;
            foreach (var d in Map.Drops)
            {
                if (!d.IsMeso || d.PickedUp || !d.Landed) continue;
                if (!range.Contains(d.X, d.GroundY - 1)) continue;
                total += d.Meso; d.PickedUp = true;
            }
            if (total <= 0) { Out.Add(GameEventType.Message, def.Id, text: "近くにお金が落ちていない"); return 0; }
            var alive = new List<Mob>();
            foreach (var m in Map.Mobs) if (m.Alive) alive.Add(m);
            int n = 0;
            int dmg = (int)Math.Min(Formulas.DamageCap, total * (5 + x)); // 似: お金 1 につき 5+x
            foreach (var mob in Targeting.Pick(alive, m => m.Box, range, Body.X, Body.Facing, maxTargets))
            {
                DamageMob(mob, new HitResult { Damage = dmg });
                n++;
            }
            return n;
        }

        /// <summary>竜の血（4 秒ごとに HP が減る。0 にはならない）。</summary>
        private void LoseHpFromBuff(int amount)
        {
            if (amount <= 0 || Dead) return;
            Character.Hp = Math.Max(1, Character.Hp - amount);
        }
    }
}
