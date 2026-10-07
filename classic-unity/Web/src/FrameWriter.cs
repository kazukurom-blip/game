// 毎フレームの描く物を小さな JSON にする（配列の並びは wwwroot/js/main.js の readFrame と同じ）。
// 60 回/秒で呼ぶので Dictionary を作らず StringBuilder に直接書く。
using System;
using System.Globalization;
using System.Text;
using Lumina.Core.Game;
using Lumina.Core.World;

namespace Lumina.Web
{
    public static class FrameWriter
    {
        private static readonly StringBuilder sb = new StringBuilder(8192);
        private static int frameNo;

        public static string Q(string s)
        {
            if (s == null) return "null";
            var b = new StringBuilder(s.Length + 2);
            Esc(b, s);
            return b.ToString();
        }

        private static void Esc(StringBuilder b, string s)
        {
            if (s == null) { b.Append("null"); return; }
            b.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    default:
                        if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else b.Append(c);
                        break;
                }
            }
            b.Append('"');
        }

        private static void N(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) { sb.Append('0'); return; }
            sb.Append(Math.Round(v, 2).ToString("0.##", CultureInfo.InvariantCulture));
        }
        private static void I(long v) => sb.Append(v.ToString(CultureInfo.InvariantCulture));
        private static void S(string s) => Esc(sb, s);
        private static void C() => sb.Append(',');

        public static string Write(GameSession s)
        {
            frameNo++;
            sb.Clear();
            var b = s.Body;
            double a = Math.Max(0, Math.Min(1, s.Stepper.Alpha));
            double px = s.PrevX + (b.X - s.PrevX) * a, py = s.PrevY + (b.Y - s.PrevY) * a;
            var pose = s.Pose;
            var c = s.Character;
            sb.Append("{\"m\":"); S(s.Map.Data.Id);
            // 主人公: x, y, 動き, コマ, 右向き, 見える, 倒れている, 攻撃の種類, 状態異常, 体の状態, 登っている, 無敵
            sb.Append(",\"p\":["); N(px); C(); N(py); C(); S(pose.Motion ?? "stand1"); C(); I(pose.Frame); C();
            I(pose.FacingRight ? 1 : 0); C(); I(pose.Visible ? 1 : 0); C(); I(pose.Dead || s.Dead ? 1 : 0); C();
            I(s.Attack != null ? (int)pose.AttackKind : -1); C(); I(pose.StatusIcons); C(); I((int)b.State); C(); I(b.Climbing ? 1 : 0); C(); I(b.InvT > 0 ? 1 : 0);
            sb.Append(']');
            // HUD: HP, 最大, MP, 最大, 経験値, 次まで, Lv, AP, SP（今の段階）, お金
            var st = s.Stats;
            sb.Append(",\"h\":["); I(c.Hp); C(); I(st.MaxHp); C(); I(c.Mp); C(); I(st.MaxMp); C(); I(c.Exp); C(); I(c.ExpToNext); C();
            I(c.Level); C(); I(c.Ap); C(); I(c.Sp[Math.Max(0, Math.Min(4, c.Tier))]); C(); I(s.Inventory.Meso); sb.Append(']');
            sb.Append(",\"j\":"); S(c.JobName);
            // 敵
            sb.Append(",\"mo\":[");
            bool first = true;
            foreach (var m in s.Map.Mobs)
            {
                if (m.Removed) continue;
                if (!first) C(); first = false;
                int flags = (m.Hidden ? 1 : 0) | (m.HpBarT > 0 ? 2 : 0) | (m.CloneOf != 0 ? 4 : 0) | (m.Charmed ? 8 : 0) | (m.Def.Boss != null ? 16 : 0) | (m.Mechanic ? 32 : 0) | (m.Def.IsElite || m.Timed ? 64 : 0);
                sb.Append('['); I(m.Uid); C(); S(m.FormId ?? m.Def.Id); C(); N(m.X); C(); N(m.Y - m.HopY); C(); I(m.Facing); C();
                S(m.Motion); C(); I(m.Hp); C(); I(m.MaxHp); C(); N(m.FadeOut); C(); I(flags); C(); I(m.StatusIcons); C(); S(m.MechanicKind); sb.Append(']');
            }
            sb.Append(']');
            // 落ちている物
            sb.Append(",\"dr\":[");
            first = true;
            foreach (var d in s.Map.Drops)
            {
                if (d.PickedUp || !d.Visible) continue;
                if (!first) C(); first = false;
                sb.Append('['); I(d.Uid); C(); S(d.ItemId ?? ""); C(); I(d.Meso); C(); N(d.X); C(); N(d.Y - d.BobOffset); C(); I(d.MesoTier); sb.Append(']');
            }
            sb.Append(']');
            // 敵の飛び道具
            sb.Append(",\"pr\":[");
            first = true;
            foreach (var p in s.Map.Projectiles)
            {
                if (p.Dead) continue;
                if (!first) C(); first = false;
                sb.Append('['); N(p.X); C(); N(p.Y); C(); N(p.Vx); C(); S(p.SkillId); sb.Append(']');
            }
            sb.Append(']');
            // 予兆・当たる所
            sb.Append(",\"hz\":[");
            first = true;
            foreach (var h in s.Map.Hazards)
            {
                if (h.Done) continue;
                if (!first) C(); first = false;
                int flags = (h.Global ? 1 : 0) | (h.ShowWarning ? 2 : 0) | (h.Fired ? 4 : 0) | (h.GroundOnly ? 8 : 0);
                sb.Append('['); I((int)h.Kind); C(); N(h.Box.X1); C(); N(h.Box.Y1); C(); N(h.Box.X2); C(); N(h.Box.Y2); C(); N(h.Progress); C(); I(flags); C(); S(h.Name);
                sb.Append(",[");
                if (h.SafeZones != null) for (int i = 0; i < h.SafeZones.Count; i++) { if (i > 0) C(); N(h.SafeZones[i].X1); C(); N(h.SafeZones[i].X2); }
                sb.Append("]]");
            }
            sb.Append(']');
            // ボスの HP バー
            sb.Append(",\"bb\":");
            var bb = s.Map.BossBar;
            if (bb.HasValue)
            {
                var v = bb.Value;
                sb.Append('['); S(v.Name); C(); I(v.Level); C(); N(v.Ratio); C(); I(v.Phase); C(); I(v.PhaseCount); C(); S(v.PhaseName); C();
                S(v.Casting ? v.CastName : null); C(); N(v.CastProgress); C(); I(v.Guarded ? 1 : 0); C(); I(v.Submerged ? 1 : 0); C(); N(v.PhaseRatio); sb.Append(']');
            }
            else sb.Append('0');
            // ダメージの数字
            sb.Append(",\"dm\":[");
            for (int i = 0; i < s.Out.Damage.Count; i++)
            {
                var d = s.Out.Damage[i];
                if (i > 0) C();
                sb.Append('['); I((int)d.Kind); C(); I(d.Value); C(); N(d.X); C(); N(d.Y); C(); I(d.Stack); C(); N(d.Delay); C(); I(d.TargetUid); sb.Append(']');
            }
            sb.Append(']');
            // お知らせ（GameEvents）
            sb.Append(",\"ev\":[");
            for (int i = 0; i < s.Out.Events.Count; i++)
            {
                var e = s.Out.Events[i];
                if (i > 0) C();
                sb.Append('['); S(e.Type.ToString()); C(); S(e.Id); C(); I(e.Value); C(); N(e.X); C(); N(e.Y); C(); S(e.Text); sb.Append(']');
            }
            sb.Append(']');
            // NPC の電球（重いので 15 フレームに 1 回）
            if (frameNo % 15 == 0 || s.Out.Events.Count > 0)
            {
                sb.Append(",\"bu\":{");
                first = true;
                foreach (var n in s.Map.Data.Npcs)
                {
                    int bulb = s.NpcBulb(n.Id);
                    if (bulb == 0) continue;
                    if (!first) C(); first = false;
                    S(n.Id); sb.Append(':'); I(bulb);
                }
                sb.Append('}');
            }
            // 話す/調べるキーで開いた会話
            if (s.LastDialog != null)
            {
                sb.Append(",\"dl\":").Append(Ui.Dialog(s, s.LastDialog));
                s.LastDialog = null;
            }
            // クイズ
            var qz = s.Quiz;
            if (qz != null && !qz.Finished && qz.Current != null)
            {
                sb.Append(",\"qz\":[").Append(qz.Index + 1).Append(',').Append(qz.Total).Append(','); S(qz.Current.Question); sb.Append(",[");
                for (int i = 0; i < qz.Current.Choices.Count; i++) { if (i > 0) C(); S(qz.Current.Choices[i]); }
                sb.Append("]]");
            }
            // ジャンプの試練: 今の段, 段の数, 入ってからの秒
            var jq = s.Map.Data.Jump;
            if (jq != null) { sb.Append(",\"jq\":["); I(s.JumpStage); C(); I(jq.Stages); C(); N(s.JumpElapsed); sb.Append(']'); }
            // 部屋の制限時間
            if (s.RoomTimerRunning) { sb.Append(",\"rt\":"); N(s.RoomTimeLeft); }
            // ペット
            if (s.Pets.Count > 0)
            {
                sb.Append(",\"pe\":[");
                first = true;
                foreach (var pet in s.Pets)
                {
                    if (!pet.Out) continue;
                    if (!first) C(); first = false;
                    sb.Append('['); N(pet.X); C(); N(pet.Y); C(); S(pet.Name); sb.Append(']');
                }
                sb.Append(']');
            }
            sb.Append('}');
            return sb.ToString();
        }
    }
}
