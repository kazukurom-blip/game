// ============================================================================
// DamageNumberView（Unity 側の見本。ビルドしていない）
//
// Core の DamageNumber（session.Out.Damage）を画面に出す。決まりは FEEL.md 6 章・UI.md 1-3:
//   色: 与えた = オレンジ、クリティカル = 赤（＋小さな星）、受けた = 紫、回復 = 緑、MISS = 灰の字
//   出方: 当たった物の頭の上（d.X, d.Y）に出て、ゆっくり上へ約 30 px（1 秒）。最初の 0.1 秒で少し大きく出て元の大きさへ
//   重なり: 1 回の攻撃で何回も当たる時は d.Stack 番目を 18 px ずつ上に積み、d.Delay（0.05 秒ずつ）遅らせて出す
//   消え方: 0.6 秒たったら 0.4 秒で消える（ここでは色の透明度。エフェクトの層なので半透明でもよい）
//
// 数字の絵: digits*[0..9] にドット絵の数字のスプライトを入れる（1 桁 12×16 前後）。
//   入れていなければ TextMesh で仮に出す（見た目の確認用）。
// ============================================================================
using System.Collections.Generic;
using Lumina.Core.Combat;
using UnityEngine;

namespace Lumina.View
{
    public sealed class DamageNumberView : MonoBehaviour
    {
        [Header("数字の絵（0〜9 の順）。無ければ TextMesh で仮に出す")]
        public Sprite[] digitsDealt;
        public Sprite[] digitsCritical;
        public Sprite[] digitsTaken;
        public Sprite[] digitsHeal;
        public Sprite missSprite;
        public Sprite critStar;
        [Tooltip("桁と桁の間を詰める（px）")]
        public float digitSpacing = 10;

        public static readonly Color Orange = new Color32(255, 150, 30, 255);
        public static readonly Color Red = new Color32(240, 40, 40, 255);
        public static readonly Color Purple = new Color32(190, 90, 255, 255);
        public static readonly Color Green = new Color32(80, 220, 90, 255);
        public static readonly Color Gray = new Color32(170, 170, 170, 255);

        private sealed class Live
        {
            public GameObject Go;
            public float Age, Delay;
            public Vector3 Start;
            public List<SpriteRenderer> Sprites = new List<SpriteRenderer>();
            public TextMesh Text;
            public Color Color;
        }

        private readonly List<Live> live = new List<Live>();

        public void Spawn(DamageNumber d)
        {
            var go = new GameObject("Damage " + d.Kind + " " + d.Value);
            go.transform.SetParent(transform, false);
            var start = GameRunner.ToUnity(d.X, d.Y - d.Stack * DamageNumber.StackStepPx, -1);
            go.transform.position = start;
            var l = new Live { Go = go, Delay = (float)d.Delay, Start = start, Color = ColorOf(d.Kind) };
            Sprite[] set = SetOf(d.Kind);
            if (d.Kind == DamageKind.Miss && missSprite != null) AddSprite(l, missSprite, 0);
            else if (set != null && set.Length == 10)
            {
                string s = d.Value.ToString();
                float x0 = -(s.Length - 1) * digitSpacing / 2;
                for (int i = 0; i < s.Length; i++) AddSprite(l, set[s[i] - '0'], x0 + i * digitSpacing);
                if (d.Kind == DamageKind.Critical && critStar != null) AddSprite(l, critStar, x0 - digitSpacing);
            }
            else
            {
                // 仮の字（絵がまだ無い時）
                l.Text = go.AddComponent<TextMesh>();
                l.Text.text = d.Kind == DamageKind.Miss ? "MISS" : d.Value.ToString();
                l.Text.anchor = TextAnchor.LowerCenter;
                l.Text.characterSize = 4;
                l.Text.fontSize = 32;
                l.Text.color = l.Color;
            }
            go.SetActive(l.Delay <= 0);
            live.Add(l);
        }

        private void AddSprite(Live l, Sprite s, float x)
        {
            var g = new GameObject("d");
            g.transform.SetParent(l.Go.transform, false);
            g.transform.localPosition = new Vector3(x, 0, 0);
            var r = g.AddComponent<SpriteRenderer>();
            r.sprite = s;
            r.sortingOrder = 1000;
            l.Sprites.Add(r);
        }

        private Sprite[] SetOf(DamageKind k)
        {
            switch (k)
            {
                case DamageKind.Critical: return digitsCritical;
                case DamageKind.Taken: return digitsTaken;
                case DamageKind.Heal:
                case DamageKind.MpHeal: return digitsHeal;
                default: return digitsDealt;
            }
        }

        private static Color ColorOf(DamageKind k)
        {
            switch (k)
            {
                case DamageKind.Critical: return Red;
                case DamageKind.Taken: return Purple;
                case DamageKind.Heal: return Green;
                case DamageKind.MpHeal: return new Color32(80, 160, 255, 255);
                case DamageKind.Miss: return Gray;
                case DamageKind.Poison: return new Color32(150, 210, 90, 255); // 毒で減った分
                default: return Orange;
            }
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            for (int i = live.Count - 1; i >= 0; i--)
            {
                var l = live[i];
                if (l.Delay > 0)
                {
                    l.Delay -= dt;
                    if (l.Delay > 0) continue;
                    l.Go.SetActive(true);
                }
                l.Age += dt;
                // 1 秒で 30 px 上へ（ゆっくり）
                l.Go.transform.position = l.Start + new Vector3(0, Mathf.Min(1f, l.Age) * 30f, 0);
                // 最初の 0.1 秒は少し大きく（1.3 → 1.0）
                float s = l.Age < 0.1f ? Mathf.Lerp(1.3f, 1f, l.Age / 0.1f) : 1f;
                l.Go.transform.localScale = new Vector3(s, s, 1);
                // 0.6 秒から 0.4 秒で消える
                float alpha = l.Age < 0.6f ? 1f : Mathf.Clamp01(1f - (l.Age - 0.6f) / 0.4f);
                foreach (var r in l.Sprites) { var c = r.color; c.a = alpha; r.color = c; }
                if (l.Text != null) { var c = l.Color; c.a = alpha; l.Text.color = c; }
                if (l.Age >= 1f) { Destroy(l.Go); live.RemoveAt(i); }
            }
        }
    }
}
