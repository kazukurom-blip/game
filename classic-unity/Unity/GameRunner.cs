// ============================================================================
// GameRunner（Unity 側の見本。ここ＝クラウドではビルドしていない）
//
// 役目: Core（Lumina.Core）の GameSession を 1 つ持ち、毎フレーム
//   1) InputBridge からキーの状態を集め
//   2) session.Update(Time.deltaTime, input) で Core を 60 回/秒の固定の更新で進め
//   3) Core から出てきたお知らせ（Out.Events）とダメージの数字（Out.Damage）を各 View に配る
// 描く・音を鳴らす・入力を読むのは Unity、ゲームの中身（物理・戦闘・セーブ）はすべて Core。
//
// ---- 使い方（シーンの作り方）
//  1. classic-unity/Core/ を Assets/Lumina/Core/ へそのままコピー（Lumina.Core.asmdef が入っている）。
//     .csproj は Unity が無視するので入っていてもよい（消してもよい）。
//  2. classic-unity/Data/*.json と Data/maps/*.json を Assets/Resources/Lumina/ の下へ同じ形でコピー
//     （例: Assets/Resources/Lumina/items.json、Assets/Resources/Lumina/maps/S001.json）。tools/ は要らない。
//  3. この Unity/ のスクリプトを Assets/Lumina/View/ などへ。asmdef を作る時は Lumina.Core を参照に入れる。
//  4. 空の GameObject「Game」に GameRunner・InputBridge・MapLoader・DamageNumberView を付け、
//     主人公の GameObject に PlayerView を付けて、GameRunner の欄にドラッグでつなぐ。
//  5. カメラ: Pixel Perfect Camera（Reference Resolution 800×600、Assets PPU = 1）。
//     Core の座標は「1 px = 1、y は下が正」。Unity は y が上なので、位置は (x, -y) にする（ToUnity を使う）。
//
// ---- セーブ
//  - 置き場所: Application.persistentDataPath/saves/<slot>.json（＋ .tmp・.bak1〜3）。
//  - 自動セーブは Core が決める（マップ移動・Lv アップ・クエスト完了・3 分ごと）。ここでは
//    アプリを閉じる時・裏に回った時にも SaveNow を呼ぶ。保存は数ミリ秒（同期でよい）。
//  - 読み込みで今のセーブが壊れていたら、Core がバックアップから戻し、Out.Events に Message が出る。
// ============================================================================
using System.IO;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Game;
using Lumina.Core.Save;
using UnityEngine;

namespace Lumina.View
{
    /// <summary>Resources/Lumina の下の TextAsset から読む（全部のプラットフォームで同じに動く）。</summary>
    public sealed class ResourcesDataSource : IDataSource
    {
        private readonly string root;
        public ResourcesDataSource(string root) { this.root = root; }

        public string ReadText(string path)
        {
            // "maps/S001.json" → Resources.Load("Lumina/maps/S001")（Resources は拡張子を付けない）
            string p = root + "/" + (path.EndsWith(".json") ? path.Substring(0, path.Length - 5) : path);
            var ta = Resources.Load<TextAsset>(p);
            return ta != null ? ta.text : null;
        }
    }

    public sealed class GameRunner : MonoBehaviour
    {
        [Header("セーブ")]
        [Tooltip("セーブの枠の名前（6 人まで: char1〜char6）")]
        public string slot = "char1";
        [Tooltip("新しく始める時の名前")]
        public string newCharacterName = "ぼうけんしゃ";

        [Header("つなぐ物")]
        public InputBridge input;
        public MapLoader mapLoader;
        public PlayerView playerView;
        public DamageNumberView damageNumbers;

        public GameSession Session { get; private set; }
        public GameData Data { get; private set; }

        /// <summary>Core の座標（px、y は下が正）→ Unity の座標（1 unit = 1 px、y は上が正）</summary>
        public static Vector3 ToUnity(double x, double y, float z = 0) => new Vector3((float)x, -(float)y, z);

        private SaveStore store;

        private void Awake()
        {
            Application.targetFrameRate = 60; // 60 でなくても Core は固定 60 回/秒で動く（描く側の好みで変えてよい）
            Data = GameData.Load(new ResourcesDataSource("Lumina"));
            store = new SaveStore(new DiskFileSystem(), Path.Combine(Application.persistentDataPath, "saves"));

            Session = GameSession.Load(Data, store, slot, out var result);
            if (Session == null)
            {
                // セーブが無い（初めて）か、全部壊れていて読めない → 新しく始める
                if (store.Exists(slot)) Debug.LogWarning("セーブが読めなかった: " + result);
                Session = GameSession.NewGame(Data, newCharacterName, (ulong)System.DateTime.UtcNow.Ticks);
                Session.AttachSave(store, slot);
                Session.SaveNow("new");
            }
            else if (result.Recovered)
            {
                Debug.LogWarning("セーブが壊れていたので " + result.Source + " から戻した: " + string.Join(" / ", result.Problems));
            }
        }

        private void Start()
        {
            mapLoader.Build(Session);
            playerView.Bind(Session);
        }

        private void Update()
        {
            // 1) 入力 → 2) Core を進める
            var inp = input.Collect(Session);
            Session.Update(Time.deltaTime, inp);

            // 3) お知らせを配る
            foreach (var e in Session.Out.Events)
            {
                switch (e.Type)
                {
                    case GameEventType.MapChanged:
                        mapLoader.Build(Session);       // 新しいマップの足場・NPC・ポータルを作り直す
                        break;
                    case GameEventType.LevelUp:
                        // TODO: 光の柱のエフェクト・「LEVEL UP」・音（UI.md 1-3）
                        break;
                    case GameEventType.Saved:
                        // TODO: 画面の隅に小さく「保存しました」
                        break;
                    case GameEventType.SaveFailed:
                        Debug.LogError("保存できなかった: " + e.Text);
                        break;
                    case GameEventType.Message:
                    case GameEventType.QuestProgress:
                    case GameEventType.ItemPicked:
                    case GameEventType.ExpGained:
                        // TODO: システムメッセージの欄へ（UI.md 1-4）。e.Text・e.Value を使う
                        break;
                    case GameEventType.Jump:
                    case GameEventType.Land:
                    case GameEventType.Hurt:
                    case GameEventType.AttackStart:
                    case GameEventType.MobHit:
                    case GameEventType.MobDied:
                        // TODO: 効果音（classic/docs/SOUND.md）。e.Text が "arrow"/"star"/"bullet"/"magic" なら飛び道具を飛ばす
                        break;
                    case GameEventType.Died:
                        // TODO: 墓石を落とし、「町で起き上がる」の窓 → Session.Revive()
                        break;
                }
            }
            foreach (var d in Session.Out.Damage) damageNumbers.Spawn(d);

            // 敵・落ちている物の見た目を Core の中身に合わせる
            mapLoader.SyncDynamic(Session);
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused && Session != null) Session.SaveNow("pause"); // スマホで裏に回った時
        }

        private void OnApplicationQuit()
        {
            if (Session != null) Session.SaveNow("quit");
        }
    }
}
