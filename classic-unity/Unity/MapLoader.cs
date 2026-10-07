// ============================================================================
// MapLoader（Unity 側の見本。ビルドしていない）
//
// Core の今のマップ（session.Map）から、見える物を作る:
//   - 足場の線（foothold）: 折れ線を LineRenderer で（はじめの確認用。後でタイル 16 px を並べる）
//   - 縄（幅 8）・はしご（幅 16）・壁・ポータル・NPC・調べられる物
//   - 敵と落ちている物（SyncDynamic で毎フレーム Core に合わせる。Uid で 1 対 1）
// 当たり判定は Unity の Collider を使わない（物理は全部 Core）。ここは「描くだけ」。
//
// 座標: Core は 1 px = 1、y は下が正 → GameRunner.ToUnity(x, y) で (x, -y)。
// マップの広さ: session.Map.Data.Width / Height（カメラはこの中だけ動かす。FEEL.md 8 章）。
// 背景・BGM: session.Map.Data.Bgm（曲の ID。SOUND.md）、Background（背景の種類: beach・forest・cave …）、
//            Theme（地形の型: town・field・cave・tower …）。背景の絵そのものはまだ無い（ブラウザ版の background を後で移す）。
// ============================================================================
using System.Collections.Generic;
using Lumina.Core.Game;
using Lumina.Core.Mobs;
using Lumina.Core.World;
using UnityEngine;

namespace Lumina.View
{
    public sealed class MapLoader : MonoBehaviour
    {
        [Header("確認用の線の色")]
        public Color groundColor = new Color32(120, 200, 90, 255);
        public Color platformColor = new Color32(230, 200, 120, 255);
        public Color ropeColor = new Color32(170, 120, 60, 255);
        public Color portalColor = new Color32(80, 160, 255, 255);
        public Material lineMaterial; // Sprites/Default など

        [Header("敵・落ちている物（無ければ四角で仮に出す）")]
        public GameObject mobPrefab;   // 中に SpriteRenderer。後で敵ごとの絵（MONSTERS の ID）に差し替える
        public GameObject dropPrefab;

        private Transform staticRoot, dynamicRoot;
        private readonly Dictionary<int, GameObject> mobs = new Dictionary<int, GameObject>();
        private readonly Dictionary<int, GameObject> drops = new Dictionary<int, GameObject>();
        private string builtMapId;

        /// <summary>マップに入った時（GameRunner が MapChanged で呼ぶ）。</summary>
        public void Build(GameSession session)
        {
            var md = session.Map.Data;
            if (staticRoot != null) Destroy(staticRoot.gameObject);
            if (dynamicRoot != null) Destroy(dynamicRoot.gameObject);
            mobs.Clear(); drops.Clear();
            staticRoot = new GameObject("Map " + md.Id + " " + md.Name).transform;
            staticRoot.SetParent(transform, false);
            dynamicRoot = new GameObject("Dynamic").transform;
            dynamicRoot.SetParent(transform, false);
            builtMapId = md.Id;

            // 足場（折れ線）。ground = 一番下の地面（下まで土で埋める絵にする）
            foreach (var f in md.Footholds)
            {
                var pts = new Vector3[f.Points.Count];
                for (int i = 0; i < pts.Length; i++) pts[i] = GameRunner.ToUnity(f.Points[i][0], f.Points[i][1]);
                Line("foothold " + f.Id, pts, f.Ground ? groundColor : platformColor, 2);
                // TODO: タイル（16×16）を線にそって並べる。坂は 16 px ごとに段をずらす。浮いた足場は厚さ 16
            }
            foreach (var r in md.Ropes)
                Line((r.Ladder ? "ladder " : "rope ") + r.X, new[] { GameRunner.ToUnity(r.X, r.Top), GameRunner.ToUnity(r.X, r.Bottom) }, ropeColor, r.Ladder ? 16 : 8);
            foreach (var w in md.Walls)
                Line("wall " + w.X, new[] { GameRunner.ToUnity(w.X, w.Top), GameRunner.ToUnity(w.X, w.Bottom) }, Color.gray, 2);
            foreach (var p in md.Portals)
            {
                if (p.Type == PortalType.Spawn || p.Type == PortalType.Town) continue;
                // 隠しポータル（hidden）は見えない。近づくと小さな光の粒（WORLD.md 2 章）→ ここでは薄く
                var c = portalColor; if (p.Type == PortalType.Hidden) c.a = 0.15f;
                Line("portal " + p.Name, new[] { GameRunner.ToUnity(p.X, p.Y), GameRunner.ToUnity(p.X, p.Y - 60) }, c, 30);
            }
            foreach (var n in md.Npcs)
            {
                var go = new GameObject("NPC " + n.Name);
                go.transform.SetParent(staticRoot, false);
                go.transform.position = GameRunner.ToUnity(n.X, n.Y);
                var t = go.AddComponent<TextMesh>();
                t.text = n.Name; t.anchor = TextAnchor.UpperCenter; t.characterSize = 3; t.fontSize = 24;
                // TODO: NPC の絵。頭の上の電球は session.NpcBulb(n.Id)（2 = 緑・報告できる、1 = 黄・受けられる）
            }
            foreach (var o in md.Objects)
            {
                var go = new GameObject("Object " + o.Name);
                go.transform.SetParent(staticRoot, false);
                go.transform.position = GameRunner.ToUnity(o.X, o.Y);
            }
        }

        private void Line(string name, Vector3[] pts, Color color, float width)
        {
            var go = new GameObject(name);
            go.transform.SetParent(staticRoot, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = pts.Length;
            lr.SetPositions(pts);
            lr.startWidth = lr.endWidth = width;
            lr.startColor = lr.endColor = color;
            lr.useWorldSpace = true;
            if (lineMaterial != null) lr.material = lineMaterial;
        }

        /// <summary>毎フレーム: 敵と落ちている物を Core に合わせる（出す・動かす・消す）。</summary>
        public void SyncDynamic(GameSession session)
        {
            if (session.Map.Data.Id != builtMapId) Build(session);
            var alive = new HashSet<int>();
            foreach (var m in session.Map.Mobs)
            {
                if (m.Removed) continue;
                alive.Add(m.Uid);
                if (!mobs.TryGetValue(m.Uid, out var go))
                {
                    go = mobPrefab != null ? Instantiate(mobPrefab, dynamicRoot) : Box("Mob " + m.Def.Name, (float)m.Width, (float)m.Height, new Color32(230, 120, 160, 255));
                    mobs[m.Uid] = go;
                }
                // 足元が (X, Y)。跳ねている分（HopY）だけ上。絵は m.Motion（stand/move/fly/hit1/die1/attack1/skill1）と m.Facing で選ぶ
                // 潜っている間（m.Hidden）は描かない。頭の上の状態異常のアイコンは m.StatusIcons（ビット）
                go.SetActive(!m.Hidden);
                go.transform.position = GameRunner.ToUnity(m.X, m.Y - m.HopY);
                go.transform.localScale = new Vector3(m.Facing > 0 ? -1 : 1, 1, 1); // 敵の絵も左向きが基本なら右で反転
                // 倒れる時は 0.6 秒で消える（m.FadeOut 0→1）
                foreach (var r in go.GetComponentsInChildren<SpriteRenderer>()) { var c = r.color; c.a = 1f - (float)m.FadeOut; r.color = c; }
                // TODO: m.HpBarT > 0 の間だけ頭の上に HP バー（m.Hp / m.Def.Hp）
                // TODO: 敵の技の予兆は session.Map.Hazards（ShowWarning の物の Box に Progress 0→1 で印）、ボスの HP バーは session.Map.BossBar
            }
            RemoveMissing(mobs, alive);

            var seen = new HashSet<int>();
            foreach (var d in session.Map.Drops)
            {
                if (d.PickedUp || !d.Visible) continue;
                seen.Add(d.Uid);
                if (!drops.TryGetValue(d.Uid, out var go))
                {
                    go = dropPrefab != null ? Instantiate(dropPrefab, dynamicRoot) : Box(d.IsMeso ? "Meso" : "Item " + d.ItemId, 14, 14, d.IsMeso ? new Color32(250, 210, 60, 255) : new Color32(240, 240, 240, 255));
                    drops[d.Uid] = go;
                }
                // 地面では上下に小さく揺れる（BobOffset）。お金は d.MesoTier（1〜4）で絵を変える
                go.transform.position = GameRunner.ToUnity(d.X, d.Y - d.BobOffset);
            }
            RemoveMissing(drops, seen);
        }

        private static void RemoveMissing(Dictionary<int, GameObject> map, HashSet<int> keep)
        {
            var gone = new List<int>();
            foreach (var kv in map) if (!keep.Contains(kv.Key)) gone.Add(kv.Key);
            foreach (var k in gone) { Destroy(map[k]); map.Remove(k); }
        }

        private GameObject Box(string name, float w, float h, Color c)
        {
            var go = new GameObject(name);
            go.transform.SetParent(dynamicRoot, false);
            var child = new GameObject("sprite");
            child.transform.SetParent(go.transform, false);
            var r = child.AddComponent<SpriteRenderer>();
            var tex = Texture2D.whiteTexture;
            r.sprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0f), tex.width / Mathf.Max(1, w));
            child.transform.localScale = new Vector3(1, h / w, 1);
            r.color = c;
            return go;
        }
    }
}
