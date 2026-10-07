// ============================================================================
// InputBridge（Unity 側の見本。ビルドしていない）
//
// キー → Core の入力（Lumina.Core.Game.PlayerInput）。キー配置は DESIGN.md 3 章・UI.md:
//   矢印: 移動・↑で縄/はしご/ポータル・↓で伏せ/降りる、Alt: ジャンプ、Ctrl: 攻撃、Z: 拾う、Space: 話す/調べる
//   クイックスロット 16 個: Shift / Ins / Home / PgUp / Del / End / PgDn / A と 1〜8
//
// 「押している間」の物（Left, Jump, Attack…）は毎フレームの今の値を入れる。
// 「押した瞬間」の物（JumpPressed, UpPressed, InteractPressed, SkillPressed, ItemPressed）は GetKeyDown を入れる。
// Core（GameSession.Update）が、次の 1/60 秒の更新で読むまで覚えておくので、ここで覚えておく必要はない。
//
// 古い Input Manager（Input.GetKey）で書いた。新しい Input System を使う時は、同じ形の PlayerInput を作ればよい。
// ============================================================================
using Lumina.Core.Game;
using UnityEngine;

namespace Lumina.View
{
    public sealed class InputBridge : MonoBehaviour
    {
        public KeyCode jumpKey = KeyCode.LeftAlt;
        public KeyCode jumpKeyAlt = KeyCode.RightAlt;
        public KeyCode attackKey = KeyCode.LeftControl;
        public KeyCode attackKeyAlt = KeyCode.RightControl;
        public KeyCode pickupKey = KeyCode.Z;
        public KeyCode talkKey = KeyCode.Space;

        // クイックスロットの 16 キー（UI.md の並び）。0〜7 が上の段、8〜15 が下の段
        public KeyCode[] quickSlotKeys =
        {
            KeyCode.LeftShift, KeyCode.Insert, KeyCode.Home, KeyCode.PageUp, KeyCode.Delete, KeyCode.End, KeyCode.PageDown, KeyCode.A,
            KeyCode.Alpha1, KeyCode.Alpha2, KeyCode.Alpha3, KeyCode.Alpha4, KeyCode.Alpha5, KeyCode.Alpha6, KeyCode.Alpha7, KeyCode.Alpha8,
        };

        /// <summary>今のフレームの入力を集める。</summary>
        public PlayerInput Collect(GameSession session)
        {
            var p = new PlayerInput
            {
                Left = Input.GetKey(KeyCode.LeftArrow),
                Right = Input.GetKey(KeyCode.RightArrow),
                Up = Input.GetKey(KeyCode.UpArrow),
                Down = Input.GetKey(KeyCode.DownArrow),
                Jump = Input.GetKey(jumpKey) || Input.GetKey(jumpKeyAlt),
                Attack = Input.GetKey(attackKey) || Input.GetKey(attackKeyAlt),
                Pickup = Input.GetKey(pickupKey),
                JumpPressed = Input.GetKeyDown(jumpKey) || Input.GetKeyDown(jumpKeyAlt),
                UpPressed = Input.GetKeyDown(KeyCode.UpArrow),
                InteractPressed = Input.GetKeyDown(talkKey),
            };
            // クイックスロット: 置いてある物がスキルなら SkillPressed、アイテムなら ItemPressed
            for (int i = 0; i < quickSlotKeys.Length && i < GameSession.QuickSlotCount; i++)
            {
                // 押しっぱなしのスキル（攻撃スキルはくり返す。嵐の連射・弾幕も）
                if (Input.GetKey(quickSlotKeys[i]) && session.QuickSlots[i]?.Kind == "skill") p.SkillHeld = session.QuickSlots[i].Id;
                if (!Input.GetKeyDown(quickSlotKeys[i])) continue;
                var q = session.QuickSlots[i];
                if (q == null) continue;
                if (q.Kind == "skill") p.SkillPressed = q.Id;
                else p.ItemPressed = q.Id;
            }
            return p;
        }
    }
}
