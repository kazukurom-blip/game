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
        // 状態異常（Id = poison/stun/darkness/seal/curse/weak/freeze/sleep/slow/polymorph/confuse、Value = 敵の Uid（主人公は 0）、Text = 名前）
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
        // 敵の強化（Id = atk/matk/def/mdef/speed/reflect/magicReflect、Value = 敵の Uid）
        MobBuffed,      // 強化がかかった（技の後。Text = 技の名前）
        MobBuffEnded,   // 時間で切れた
        MobDispelled,   // 主人公の崩し・解除で消えた（Text = 消した物の名前）
        // ボスの仕掛け・スキルの仕掛け（Id = 何が起きたか、Value = 敵の Uid など、X/Y = 位置）
        //   rift_open / rift_filled / rift_reset / rift_exposed / rift_guarded / shard_got（時の裂け目）
        //   submerge / surface / rock_broken（深淵の大魚）・clones / shuffle（分身）・pulled（ツタ）
        //   decoy_hit / decoy_broken（身代わり人形）・ship_broken（乗船）・door_open / door_used（秘術の扉）・zone_start（毒の霧）
        Mechanic,
        // やりこみ（GameSession.Collection.cs）
        CardPicked,     // 図鑑のカードを拾った（Id = 敵、Value = 今の枚数（1〜5）、Text = 「◯◯のカード（3/5）」）
        BookLevelUp,    // 図鑑の段が上がった（Value = 段、Text = 上乗せ）
        MedalEarned,    // 勲章を手に入れた（Id = 勲章、Text = 名前）
        MedalEquipped,  // 勲章を付けた・外した（Id = 勲章 / null）
        JumpCleared,    // ジャンプの試練のてっぺんの宝箱を開けた（Id = マップ、Value = かかった秒、Text = 知らせ）
        // 楽しさの要素（Core/Fun・GameSession.Fun.cs。Id = 何が起きたか、Text = 人が読む文、Value = 数）
        //   gacha / jackpot（景品の機械。Id のあとに ":" で品）・boss_warn / boss_spawn / boss_down（フィールドボス）・voyage_start / voyage_raid / voyage_clear / voyage_arrive（船の旅）
        //   emote（感情表現）・rare（珍しい個体が出た）・arcade（遊び場の点数）・season（季節）・salon（美容院）・look（見た目の品）・dungeon_task / dungeon_chest（ダンジョン）
        Fun,
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
