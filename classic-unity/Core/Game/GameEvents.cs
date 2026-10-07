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
