// Unity 側の入力 → Core の入力。押している間 true の物（Held）と、押した瞬間だけの物（Pressed）がある。
// Pressed は Unity の 1 フレームと Core の 1/60 秒の更新がずれても取りこぼさないよう、
// InputBridge が「Core が読むまで」覚えておき、GameSession が読んだら消す（ConsumePressed）。
namespace Lumina.Core.Game
{
    public struct PlayerInput
    {
        // 押している間
        public bool Left, Right, Up, Down, Jump, Attack, Pickup;
        /// <summary>押している間のスキル（攻撃スキルはクラシックどおり押しっぱなしでくり返す。嵐の連射・弾幕もこれ）。null なら無し。</summary>
        public string SkillHeld;
        // 押した瞬間（Core が 1 回読んだら消える）
        public bool JumpPressed, UpPressed, InteractPressed;
        /// <summary>このフレームで使うスキル（クイックスロットのキー）。null なら無し。</summary>
        public string SkillPressed;
        /// <summary>このフレームで使う消費アイテム（クイックスロットのキー）。null なら無し。</summary>
        public string ItemPressed;

        public void ConsumePressed()
        {
            JumpPressed = false; UpPressed = false; InteractPressed = false;
            SkillPressed = null; ItemPressed = null;
        }
    }
}
