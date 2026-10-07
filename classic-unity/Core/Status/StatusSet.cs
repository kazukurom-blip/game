// 状態異常（STATS.md 4-3）。主人公にも敵にもかけられる。
//   毒     1 秒ごとに最大 HP の power%（既定 2%）減る。HP 1 で止まる（毒では倒れない）
//   気絶   動けない・攻撃できない・スキルを使えない
//   暗闇   命中 −power%（既定 50%）
//   封印   スキルが使えない（敵は技を使わない。体当たりだけ）
//   呪い   攻撃力・防御 −power%（既定 20%）、主人公が得る経験値 −50%
//   弱り   ジャンプできない（跳ねる敵は跳ねない）
//   凍結   動けない・攻撃できない（攻撃を受けると解ける）
//   眠り   動けない・攻撃できない（攻撃を受けると解ける）
//   遅延   速さ −power（既定 20。主人公は速さの値、敵は px/秒）
//   変化   姿が変わる。攻撃・スキルが使えない（動ける・薬は使える）。敵は技を使わず、攻撃力・防御が変わった姿（コロ貝）の値になる
//   錯乱   左右が逆になる（主人公）。敵は主人公の味方になって、近くの敵に体当たりする（錯乱弾）
// 重ねがけ: 同じ種類は重ならない（クラシックどおり）。かけ直すと残り時間は長い方、強さは強い方になる。違う種類は同時にかかる。
using System;
using System.Collections.Generic;

namespace Lumina.Core.Status
{
    public enum StatusKind { Poison, Stun, Darkness, Seal, Curse, Weak, Freeze, Sleep, Slow, Polymorph, Confuse }

    /// <summary>かかっている 1 つの状態異常。</summary>
    public sealed class StatusEffect
    {
        public StatusKind Kind;
        public double Remaining, Total;
        public double Power;        // 毒: 最大 HP の %/秒、暗闇: 命中を下げる %、呪い: 攻撃・防御を下げる %、遅延: 速さを下げる値
        public double TickT;        // 毒の 1 秒を数える
        public double Ratio => Total > 0 ? Math.Max(0, Remaining / Total) : 0; // アイコンの残り時間の表示用（1 → 0）
    }

    public sealed class StatusSet
    {
        public const int KindCount = 11;
        private readonly StatusEffect[] slots = new StatusEffect[KindCount];

        public bool Has(StatusKind k) => slots[(int)k] != null;
        public StatusEffect Get(StatusKind k) => slots[(int)k];
        public bool Any { get { foreach (var s in slots) if (s != null) return true; return false; } }

        /// <summary>かかっている物（種類の順）。頭の上のアイコンはこの順に並べる。</summary>
        public IEnumerable<StatusEffect> Active
        {
            get { foreach (var s in slots) if (s != null) yield return s; }
        }

        /// <summary>かかっている種類のビット（1 &lt;&lt; (int)StatusKind）。AvatarPose.StatusIcons・Mob.StatusIcons と同じ。</summary>
        public int Mask
        {
            get { int m = 0; for (int i = 0; i < KindCount; i++) if (slots[i] != null) m |= 1 << i; return m; }
        }

        // ---------------- 効き目（主人公・敵の両方で使う）
        public bool CanMove => !Has(StatusKind.Stun) && !Has(StatusKind.Freeze) && !Has(StatusKind.Sleep);
        /// <summary>攻撃できる（変化の間は動けるが攻撃できない）</summary>
        public bool CanAct => CanMove && !Has(StatusKind.Polymorph);
        public bool CanUseSkill => CanAct && !Has(StatusKind.Seal);
        public bool Polymorphed => Has(StatusKind.Polymorph);
        public bool Confused => Has(StatusKind.Confuse);
        /// <summary>遅延で下がる速さ（0 = かかっていない）</summary>
        public double SpeedDown => Has(StatusKind.Slow) ? Get(StatusKind.Slow).Power : 0;
        public bool CanJump => CanMove && !Has(StatusKind.Weak);
        public double AccMul => Has(StatusKind.Darkness) ? Math.Max(0, 1 - Get(StatusKind.Darkness).Power / 100) : 1;
        public double AtkMul => Has(StatusKind.Curse) ? Math.Max(0, 1 - Get(StatusKind.Curse).Power / 100) : 1;
        public double DefMul => AtkMul;
        public double ExpMul => Has(StatusKind.Curse) ? 0.5 : 1;

        public static double DefaultPower(StatusKind k)
        {
            switch (k)
            {
                case StatusKind.Poison: return 2;
                case StatusKind.Darkness: return 50;
                case StatusKind.Curse: return 20;
                case StatusKind.Slow: return 20;
                default: return 0;
            }
        }

        /// <summary>かける（重ねがけの決まりもここ）。新しくかかったら true、かけ直しなら false。</summary>
        public bool Set(StatusKind k, double seconds, double power)
        {
            if (power <= 0) power = DefaultPower(k);
            var cur = slots[(int)k];
            if (cur == null)
            {
                slots[(int)k] = new StatusEffect { Kind = k, Remaining = seconds, Total = seconds, Power = power };
                return true;
            }
            if (seconds > cur.Remaining) { cur.Remaining = seconds; cur.Total = seconds; }
            cur.Power = Math.Max(cur.Power, power);
            return false;
        }

        public bool Remove(StatusKind k)
        {
            if (slots[(int)k] == null) return false;
            slots[(int)k] = null;
            return true;
        }

        public void Clear() { for (int i = 0; i < KindCount; i++) slots[i] = null; }

        /// <summary>時間を進める。終わった物を expired に足し、毒の 1 秒が来た数を返す。</summary>
        public int Tick(double dt, List<StatusKind> expired)
        {
            int poisonTicks = 0;
            for (int i = 0; i < KindCount; i++)
            {
                var s = slots[i];
                if (s == null) continue;
                if (s.Kind == StatusKind.Poison)
                {
                    s.TickT += dt;
                    while (s.TickT >= 1 - 1e-9) { s.TickT -= 1; poisonTicks++; }
                }
                s.Remaining -= dt;
                if (s.Remaining <= 1e-9) { slots[i] = null; expired?.Add(s.Kind); }
            }
            return poisonTicks;
        }
    }
}
