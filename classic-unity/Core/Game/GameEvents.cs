// Core から Unity 側へのお知らせ（音・エフェクト・画面のメッセージ用）。
// GameSession.Events に 1 回の Update の間に起きたことがたまる。Unity 側は読んだら session.Events.Clear() しなくてよい
// （次の Update の始めに Core が空にする）。
using System.Collections.Generic;
using Lumina.Core.Combat;

namespace Lumina.Core.Game
{
    public enum GameEventType
    {
        Jump, Land, Grab, DownJump, RopeJump, Hurt,      // 物理（音）
        AttackStart, AttackHit, SkillUsed, SkillFailed,  // 攻撃・スキル（Text に理由）
        MobHit, MobDied, MobSpawned,
        DropSpawned, ItemPicked, MesoPicked, InventoryFull,
        ExpGained, LevelUp, ApChanged, SpChanged, JobAdvanced,
        BuffStarted, BuffEnded, Healed,
        QuestStarted, QuestProgress, QuestCompleted, QuestFailed,
        MapChanged, PortalUsed, Travel,
        ItemUsed, ItemBought, ItemSold, EquipChanged, ScrollResult,
        Died, Revived,
        Saved, SaveFailed,
        Message,                                          // システムメッセージ（Text）
        // 状態異常（Id = poison/stun/darkness/seal/curse/weak/freeze/sleep、Value = 敵の Uid（主人公は 0）、Text = 名前）
        StatusApplied, StatusEnded, StatusCured, StatusResisted,
        // 敵の技（Id = 技の ID、Value = 敵の Uid、Text = 技の名前、X/Y = 予兆の位置）
        MobCast,        // 構え・予兆が始まった（音・予兆のエフェクト）
        MobSkillHit,    // 技が主人公に当たった
        MobSummoned,    // 手下を呼んだ（Id = 呼ばれた敵の ID）
        BossPhase,      // ボスの段階が変わった（Value = 段階（0〜）、Text = 段階の名前、Id = ボスの ID）
        // 町と成長の仕組み（GameSession.Town / Jobs / Rooms / Pets）
        StorageChanged, // 倉庫に預けた・取り出した・枠を増やした（Id = アイテム、Value = 数 / お金）
        Crafted,        // 製作・精錬した（Id = できた物）
        ChestOpened,    // 毎日の宝箱を開けた（Id = 調べる物の ID）
        SatDown, StoodUp, // 椅子に座った（Id = 椅子）・立った
        PetAdopted, PetFed, PetCloseness, PetTrick, PetHungry, PetUsedPotion, // ペット（Id = 種類、Value = 親密度 Lv など）
        RoomEntered,    // ボスの間・ダンジョン・試験の部屋に入った（Id = マップ、Value = 制限時間（秒）、Text = 今日あと何回）
        RoomTimeUp,     // 制限時間が切れて外へ出された
        RoomFailed,     // 試験の部屋を出た・時間切れでやり直し（試しの珠が消えた）
        DungeonCleared, // 1 人用ダンジョンの主を倒した（Id = マップ）
        BossKilled,     // ボス・大ボスを倒した（Id = 敵）
        QuizQuestion,   // クイズの問題（Id = 問題の ID、Value = 何問目（1〜）、Text = 問題）
        QuizAnswered,   // 答えた（Value = 1 正解 / 0 不正解）
        QuizCleared,    // 全問正解
    }

    public struct GameEvent
    {
        public GameEventType Type;
        public string Id;      // スキル・アイテム・クエスト・マップの ID など
        public long Value;     // 数（経験値・お金・Lv・ダメージなど）
        public double X, Y;    // 起きた位置（ワールドの座標）
        public string Text;    // 人が読む文（システムメッセージ）

        public override string ToString() => Type + (Id != null ? " " + Id : "") + (Value != 0 ? " " + Value : "") + (Text != null ? " 「" + Text + "」" : "");
    }

    public sealed class EventQueue
    {
        public readonly List<GameEvent> Events = new List<GameEvent>();
        public readonly List<DamageNumber> Damage = new List<DamageNumber>();

        public void Add(GameEventType t, string id = null, long value = 0, double x = 0, double y = 0, string text = null)
            => Events.Add(new GameEvent { Type = t, Id = id, Value = value, X = x, Y = y, Text = text });

        public void Clear() { Events.Clear(); Damage.Clear(); }

        public bool Has(GameEventType t)
        {
            foreach (var e in Events) if (e.Type == t) return true;
            return false;
        }
    }
}
