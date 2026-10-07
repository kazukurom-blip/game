// ============================================================================
// PlayerView（Unity 側の見本。ビルドしていない）
//
// Core の状態（session.Body と session.Pose）から、classic/docs/ART_SPEC_UNITY.md の部品を基準点で重ねて主人公を描く。
//
// ---- 絵の置き方（ART_SPEC_UNITY.md 6 章）
//   Assets/Resources/Character/Starter/<part>/<part>_<motion>_<frame>.png   ← Sprite
//   Assets/Resources/Character/Starter/<part>/<part>_<motion>_<frame>.json  ← 基準点（TextAsset）
//   取り込みの設定: Sprite (2D and UI)、Pixels Per Unit = 1、Filter Mode = Point、Compression = None、Mip Maps = Off、
//   **Pivot = Top Left**（この見本は「PNG の左上」を位置の基準にする。基準点は PNG の左上が (0,0)、x 右・y 下）。
//
// ---- 動きの名前（Core の Pose.Motion）
//   stand1（3 コマ・0→1→2→1）/ walk1（4）/ jump（1）/ ladder（2）/ rope（2）/ alert（3）/ swingO1（3）/ prone（1）/ dead
//   Pose.Frame がコマの番号。コマの時間は Core が決めている（FEEL.md 10 章・ART_SPEC 4 章）。
//
// ---- つなぎ方（ART_SPEC_UNITY.md 2 章）
//   body の origin（足元）をキャラの位置に置く → body の navel/neck/hand から
//   arm（navel）・head（neck）・coat/pants/shoes（navel）・face/hair/hairBack/cap（head の brow）・weapon（arm の hand）。
//
// ---- 向き
//   絵は「左向き」が基本（ART_SPEC 1 章）。右を向いている時は localScale.x = -1 で反転。
//
// ---- 重ねる順番（ART_SPEC 3 章。数が大きいほど手前）
//   hairBack 0 → weaponBack 1 → body 2 → shoes 3 → pants 4 → coat 5 → head 6 → face 7 → hair 8 → cap 9 → arm 10 → coatArm 11 → weapon 12
//   縄・はしご（背中向き）は別: 顔を描かず、頭・髪を手前へ。
// ============================================================================
using System.Collections.Generic;
using Lumina.Core.Game;
using Lumina.Core.Physics;
using Lumina.Core.Util;
using UnityEngine;

namespace Lumina.View
{
    public sealed class PlayerView : MonoBehaviour
    {
        [Tooltip("部品の絵の置き場所（Resources の下）")]
        public string partsRoot = "Character/Starter";
        [Tooltip("今着ている部品のセット（後で装備から決める。今はスターターの 1 体）")]
        public string[] parts = { "hairBack", "body", "shoes", "pants", "coat", "head", "face", "hair", "arm", "coatArm", "weapon" };

        private static readonly Dictionary<string, int> Order = new Dictionary<string, int>
        {
            { "hairBack", 0 }, { "weaponBack", 1 }, { "body", 2 }, { "shoes", 3 }, { "pants", 4 }, { "coat", 5 }, { "head", 6 },
            { "face", 7 }, { "hair", 8 }, { "cap", 9 }, { "arm", 10 }, { "coatArm", 11 }, { "weapon", 12 },
        };
        // 背中向き（縄・はしご）の順番: 体 → 服 → 腕 → 頭 → 髪（顔は描かない）
        private static readonly Dictionary<string, int> BackOrder = new Dictionary<string, int>
        {
            { "weapon", 0 }, { "body", 1 }, { "shoes", 2 }, { "pants", 3 }, { "coat", 4 }, { "arm", 5 }, { "coatArm", 6 },
            { "head", 7 }, { "hairBack", 8 }, { "hair", 9 }, { "cap", 10 },
        };

        private sealed class PartFrame
        {
            public Sprite Sprite;
            public readonly Dictionary<string, Vector2> Points = new Dictionary<string, Vector2>(); // PNG の左上から、y は下が正
        }

        private readonly Dictionary<string, SpriteRenderer> renderers = new Dictionary<string, SpriteRenderer>();
        private readonly Dictionary<string, PartFrame> cache = new Dictionary<string, PartFrame>();
        private GameSession session;
        private Transform rig; // 反転用の子

        public void Bind(GameSession s)
        {
            session = s;
            if (rig == null)
            {
                rig = new GameObject("Rig").transform;
                rig.SetParent(transform, false);
            }
            foreach (var p in parts)
            {
                if (renderers.ContainsKey(p)) continue;
                var go = new GameObject(p);
                go.transform.SetParent(rig, false);
                renderers[p] = go.AddComponent<SpriteRenderer>();
            }
        }

        private void LateUpdate()
        {
            if (session == null) return;
            var body = session.Body;
            var pose = session.Pose;

            // 位置: 1 つ前の固定の更新との間を補間（60 回/秒より画面が速い時になめらかに）。ドットがにじまないよう整数に丸める
            double a = session.Stepper.Alpha;
            double x = session.PrevX + (body.X - session.PrevX) * a;
            double y = session.PrevY + (body.Y - session.PrevY) * a;
            transform.position = new Vector3(Mathf.Round((float)x), -Mathf.Round((float)y), 0);

            // 向き: 絵は左向きが基本 → 右を向いている時だけ反転
            rig.localScale = new Vector3(pose.FacingRight ? -1 : 1, 1, 1);

            // 無敵の点滅（0.08 秒ごと。半透明は使わない）
            bool visible = pose.Visible;
            bool back = pose.Motion == "rope" || pose.Motion == "ladder";

            // 部品ごとの絵（無い部品・コマは隠す）
            var frames = new Dictionary<string, PartFrame>();
            foreach (var p in parts) frames[p] = Load(p, pose.Motion, pose.Frame) ?? Load(p, "stand1", 0);

            // 基準点でつなぐ（キャラの中の座標: 足元が (0,0)、y は下が正）
            var tl = new Dictionary<string, Vector2>();
            if (!frames.TryGetValue("body", out var bodyF) || bodyF == null) { SetAll(false); return; }
            tl["body"] = -P(bodyF, "origin");
            Vector2 navel = tl["body"] + P(bodyF, "navel"), neck = tl["body"] + P(bodyF, "neck"), bodyHand = tl["body"] + P(bodyF, "hand");
            Vector2 hand = bodyHand, brow = neck;
            if (frames.TryGetValue("arm", out var armF) && armF != null) { tl["arm"] = navel - P(armF, "navel"); hand = tl["arm"] + P(armF, "hand"); }
            if (frames.TryGetValue("head", out var headF) && headF != null) { tl["head"] = neck - P(headF, "neck"); brow = tl["head"] + P(headF, "brow"); }
            foreach (var p in new[] { "coat", "pants", "shoes", "coatArm" }) if (frames.TryGetValue(p, out var f) && f != null) tl[p] = navel - P(f, "navel");
            foreach (var p in new[] { "face", "hair", "hairBack", "cap" }) if (frames.TryGetValue(p, out var f) && f != null) tl[p] = brow - P(f, "brow");
            if (frames.TryGetValue("weapon", out var wF) && wF != null) tl["weapon"] = hand - P(wF, "hand");

            foreach (var kv in renderers)
            {
                var r = kv.Value;
                frames.TryGetValue(kv.Key, out var f);
                bool show = visible && f != null && tl.ContainsKey(kv.Key) && !(back && kv.Key == "face");
                r.enabled = show;
                if (!show) continue;
                r.sprite = f.Sprite;
                var t = tl[kv.Key];
                r.transform.localPosition = new Vector3(t.x, -t.y, 0); // Pivot = Top Left の前提
                r.sortingOrder = back ? (BackOrder.TryGetValue(kv.Key, out var bo) ? bo : 0) : (Order.TryGetValue(kv.Key, out var o) ? o : 0);
            }
        }

        private void SetAll(bool on) { foreach (var r in renderers.Values) r.enabled = on; }

        private static Vector2 P(PartFrame f, string name) => f.Points.TryGetValue(name, out var v) ? v : Vector2.zero;

        /// <summary>部品の 1 コマ（PNG ＋ 基準点の JSON）を読む。無ければ null。</summary>
        private PartFrame Load(string part, string motion, int frame)
        {
            string key = part + "_" + motion + "_" + frame;
            if (cache.TryGetValue(key, out var f)) return f;
            string path = partsRoot + "/" + part + "/" + key;
            var sprite = Resources.Load<Sprite>(path);
            var json = Resources.Load<TextAsset>(path);
            if (sprite == null || json == null) { cache[key] = null; return null; }
            f = new PartFrame { Sprite = sprite };
            // 例: { "points": { "origin": [22, 61], "navel": [21, 36] } }（Core の小さな JSON の読み手を使う）
            var d = Json.ParseObject(json.text);
            var pts = J.Obj(d, "points");
            if (pts != null)
                foreach (var kv in pts)
                    if (kv.Value is List<object> a && a.Count == 2) f.Points[kv.Key] = new Vector2((float)J.ToDouble(a[0]), (float)J.ToDouble(a[1]));
            cache[key] = f;
            return f;
        }
    }
}
