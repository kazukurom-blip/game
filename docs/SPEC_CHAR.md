# キャラクター作成・キャラスロット仕様（v3）

## 要望
- **各職業ごとに♂♀を選べる**。
- **キャラスロット**で各キャラが個別に保存される。
- 職業の設計は任されている → 3クラス制。

## クラス（`src/data/classes.js`、システム担当）
| classId (=state.heroId) | 表示名 | 役割 | 武器 | 系統（1次で選択） |
|---|---|---|---|---|
| `luna` | ストリートスター | スピード／銃・連撃 | knife/pistol | ガンスリンガー系 / ネオンダンサー系 |
| `jin` | ストリートブロウラー | パワー／格闘・車 | bat | ストリートファイター系 / ナイトレーサー系 |
| `hacker` | ハッカー | 魔法／範囲・召喚 | staff | ネットランナー系 / ドローンマスター系 |

3クラス × 2系統 × 4段階 = **24職**。どのクラスも♂♀選択可。`DEFAULT_LOOKS[classId][gender]`。

## state 追加
`name`, `gender: 'f'|'m'`, `look: {body, skin, hair, hairColor, eyeColor}`, `savedAt`。
描画はすべて `state.look`（無ければ DEFAULT_LOOKS → HERO_LOOKS の順でフォールバック）を使う。

## セーブ（`src/core/save.js`、メイン実装済み）
- `MAX_SLOTS = 6`。`listSlots()`（概要配列、空きは null）, `loadSlot(i)`, `saveSlot(i, state)`, `deleteSlot(i)`, `firstEmptySlot()`, `activeSlot()`, `setActiveSlot(i)`。
- 旧単一セーブ `nvs_save` は自動でスロットへ移行。`saveState/loadState/hasSave` はアクティブスロットに対して動作（互換）。

## 画面フロー（UI担当）
1. **タイトル** → Enter
2. **キャラクター選択**（6スロット）: 各スロットに キャラのプレビュー（装備反映）、名前、Lv、職、現在地。空きスロットは「＋新規作成」。選択→「ゲームスタート」、「削除」（確認つき）。
3. **キャラクター作成**: クラス選択（3枚のカード：説明・得意・系統の紹介）→ 性別 ♂/♀ → 見た目（髪型・髪色・瞳の色・肌色を ←→ で切替、ランダムボタン）→ 名前入力（DOM の `<input>` を canvas 上に重ねて日本語IME対応。最大10文字、空なら既定名）→ 決定でスロットに保存して開始。
4. ゲーム中: スマホ(P) or Esc メニューに「キャラクター選択へ戻る」（セーブしてタイトルへ）。

## main.js（メイン）
- `startGame({slot, state})`／新規作成時は `newState(classId, {name, gender, look})` → `setActiveSlot(slot)` → 保存。
- タイトルへ戻る処理（イベント購読の解除、game の各配列をクリア）。
