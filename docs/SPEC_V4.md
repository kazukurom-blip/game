# SPEC v4：第2ワールド・Lv200・5次転職・クエストの大幅増量・会話画面

ユーザーの要望（2026-10-06）：

- クエストの会話をもっと見やすく
- クエストの作り込みを強化
  - サブクエストの派生・連作
  - 全部やると良い装備がもらえるクエスト
  - 見た目だけのネタ装備がもらえるクエスト
  - 莫大な量
- 特定のクエストを進めると、別のワールドへ行けて、Lv101 以上（最大 200）まで育つ
- Lv120 から 5 次転職。画面全体攻撃（クールタイム・多段）など専用スキル

4 つの担当が並行で作る。ぶつからないよう、担当の境目と共通の決まりをここに書く。

## 共通の決まり（全担当が守る）

### 第2ワールド

- 名前：**ネオン・アーク（NEON ARK）**
  - 次元ゲートの向こうにある、ネオンの未来都市の群島。
  - ヴァイス・ベイ（今のワールド＝第1ワールド）の「上位の世界」。
- マップの ID は `w2_` で始める。地域（region）の ID は次の 4 つに固定する（世界担当が作る）。

| region | 町の ID | 名前（仮） | レベル帯 |
|---|---|---|---|
| `arkcity` | `w2_arkcity` | アーク・シティ（第2ワールドの最初の町） | 100〜130 |
| `cyberwild` | `w2_cyberwild` | サイバー・ワイルド（電脳の密林） | 125〜155 |
| `abyss` | `w2_abyss` | ネオン・アビス（深海都市） | 150〜180 |
| `zenith` | `w2_zenith` | ゼニス・タワー（天空の最上層。最後の地域） | 175〜200 |

- 各地域に、町 1 つとフィールド 4 つ前後、ボス 1 体（zenith はラスボス）を置く。
  - フィールドの ID は `w2_<region>_f1` 〜 `w2_<region>_f4`。
- 第1ワールドから第2ワールドへは、**ルミナ宇宙港（spaceport）の「次元ゲート」** を使う。
  - 次元ゲートは、NPC かポータル。
  - `state.flags.world2Unlocked === true` のときだけ通れる。
  - 帰り道：アーク・シティから宇宙港へ戻れる。
- フラグ `world2Unlocked` は、クエストの報酬 `reward.flags: ['world2Unlocked']` で立てる。
  - 報酬で `flags` を立てる仕組みは、クエスト担当が missions に足す。
  - 世界担当は、フラグを読むだけ。
- ワールドマップは、第1と第2を切り替えて見られるようにする（世界担当）。
- 経験値の曲線（`balance.js` の `expToNext`）は Lv200 まで続いている。
  - Lv100 以降の伸び方が遊べる範囲かを、世界担当が見直す（敵の経験値と合わせる）。

### 5 次転職（Lv120）

- `JOB_TIERS` に 5 次＝ **120** を足す（5 次転職担当）。
  - 今は `[0, 10, 30, 60, 100]`。
- 6 つの系統それぞれに 5 次の職を 1 つ置く。系統は次の 6 つ。
  - gunslinger・neondancer・streetfighter・nightracer・netrunner・dronemaster
- 5 次の転職クエストの試練は、第2ワールド（`w2_arkcity` の周辺）で行う。
  - 試練の場所に使う敵の ID は、世界担当と決めた名前を使う。
  - 決まるまでは、`w2_arkcity_f1` に出る敵を「その地域の敵を N 体」の形で数える（敵の ID に依存しない書き方があれば使う）。

### クエスト

- クエストの ID の決め方：
  - 第1ワールドのサブの連作は `q_<名前>_<番号>`。
  - 第2ワールドは `q2_...`。
  - 第2ワールドへ行くメインの連作は `m2_...`。
- 「全部やると良い装備」：
  - 連作の最後の報酬に、専用の装備を置く。
  - 装備のデータは `items.js` に足す。ID は `qset_...`。
- 「見た目だけのネタ装備」：
  - `items.js` に `cosmetic: true` の装備として足す。能力はほぼ 0 にする。
  - 見た目は、今ある見た目の種類（look.style）の色違いで作る。新しい絵は要らない。
  - 名前と説明文で笑わせる。
- 第2ワールドのクエストは、世界担当のマップと敵ができてから、2 回目の作業で作る。
  - 今回の作業では、第1ワールドの分と、第2ワールドへ行く連作（ゲートを開ける所まで）を作る。

### 会話画面

- 会話の窓（`ui` の `dialog`）を、MapleStory の NPC 会話の窓の形にする（会話UI担当）。
  - NPC の大きな顔
  - 名前の札
  - ページ送り
  - 文字が流れる表示
  - 選択肢のボタン
  - 報酬の見え方
- クエストのデータの書き方（`lines`・`steps` など）は変えない。
  - 変える必要があれば、ここに追記して、クエスト担当と合わせる。

#### 窓の形（会話UI担当が作った。`src/ui/dialogMaple.js`）

- 画面の下寄りの中央に横長の窓。左に NPC の大きな顔（立ち絵があれば立ち絵）と名前の札、右に本文の欄（白い紙の色）。
- 本文は 16px（スマホは 21px）・1 ページ 4 行まで。長い文は自動でページに分ける。1 文字ずつ流れる。
  - クリック・Enter・Space で全部出す → もう一度で次のページ。← で前のページ。Esc で閉じる。
- 下のボタン：左に「会話を終える」、右に「前へ」「次へ」／「受ける」「断る」／「OK」。
- NPC に話しかけた最初の画面：あいさつ（`dialog[0]`。`greeting` があればそれ）と、選べる項目の一覧。
  - 「！」受けられるクエスト ／ 時計 進行中 ／ 「？」報告できる ／ ショップ・転職の相談・タクシー・受付 ／ 「話を聞く」（`dialog` の 2 行目から）
  - クエストもショップも無い NPC は、今まで通り `dialog` を順に話して終わる。
- 受注：`dialog.offer` を話したあと、受注の窓（種類・クエスト名・推奨 Lv・`desc`・目的・報酬のアイコン）＋「受ける」「断る」。
  - 目的は `objectives` から自動で作る：kill「#r敵#k を #rN#k 体倒す」／ collect「#bアイテム#k を #rN#k 個集める」／ talk「#d人#k と話す」／ reach「#g場所#k へ行く」／ boss「ボス #r敵#k を倒す」。
- 報告：`dialog.done` を話したあと、「クエスト完了」と報酬のアイコンが順に出る短い演出 ＋「OK」。

#### 本文の強調の書き方（セリフ・`desc`・`choicePrompt`・選択肢の文で使える）

| 書き方 | 意味 | 使いどころ |
|---|---|---|
| `#b` | 青 | **アイテム名**・クエストの目標 |
| `#r` | 赤 | **数**・敵の名前・大事な注意 |
| `#d` | 紫 | **人名** |
| `#g` | 緑 | **地名** |
| `#k` | 元の色に戻す | 強調の終わりに必ず付ける |
| `#e` … `#n` | 太字 … 元に戻す（`#n` は色も戻す） | |
| `#h#` | 主人公の名前 | |
| `#t<アイテムID>#` | アイテム名（色を付けていなければ青） | `#tdrone_chip#` |
| `#m<マップID>#` | 地名（緑） | `#mdown_f1#` |
| `#p<NPC ID>#` | 人名（紫） | `#prico#` |
| `#o<敵ID>#` | 敵の名前（赤） | `#odrone_peeping#` |
| `#c<アイテムID>#` | 今の所持数（赤） | `今 #cdrone_chip# 個持っている` |
| `##` | 「#」の文字そのもの | |
| `\n` | ここで改行 | |

- 例：`'#dカイ#k に頼まれて、#g裏通り#k の #r12体#k のドローンから #bメモリーチップ#k を集める。'`
- 記号の無い文は今まで通りに出る（全部これまでのセリフと互換）。強調の記号は文字数に数えない。
- 主人公のセリフは今まで通り、行の先頭に `@me:` を付ける。

#### 選択肢（派生）を窓に出す形

窓の側は次の 3 つの入り口を持つ。データの形（どのクエストのどこで分かれるか）はクエスト担当が決める。

1. **セリフの配列の中に選択肢を混ぜる**（データだけで書ける）
   ```js
   dialog: { offer: [
     'よう、相棒。',
     { id: 'q_x_route', ask: 'どっちの道で行く？', choices: [
       { id: 'sea', text: '#g海沿い#k の道', hint: '敵が少ない', lines: ['海沿いか。気持ちいいぜ。'] },
       { id: 'alley', text: '#r裏通り#k を抜ける', lines: ['@me: 近道でいこう！'] },
     ] },
     'じゃ、頼んだぜ。',
   ] }
   ```
   - `ask` を省くと、直前の文が問いになる。`choices` は 2〜4 個（6 個まで出る）。`cancel: '考える'` を付けるとやめる項目が出る。
   - 選んだら、その選択肢の `lines` を話し、続きの文へ進む。
   - 選んだ結果は、イベント `dialogChoice {npcId, key: 選択肢の id, id: 選んだ choices の id, index}` で知らせる（フラグを立てるなどはクエスト担当が受け取って行う）。
2. **今のクエストの分岐** `m.choices = [{id, text, reward, flag, title, dialog}]`（v3 の形）は今まで通り。報告のときに一覧で出し、`MissionManager.choose` → `turnIn`。
3. **コードから出す** `game.ui.askChoice({ npc, prompt, choices: [{id, text, hint?}], onPick(id, choice), onCancel?, cancelText?, key? })`
   - `cancelText: false` でやめる項目を出さない。選んだ結果は `onPick` で返る（`dialogChoice` も出る）。
- ほかに `game.ui.open('dialog', { npc, lines: [...], onDone })` で、決まったセリフだけを話させることもできる。

#### クエストのデータの書き方（v4。クエスト担当が追記）

今の書き方（`dialog.offer` / `dialog.done` / `objectives` / `reward` / `choices` / `dialogByFlag`）はそのまま。次を足した。

- **派生（A 編・B 編）**: 分かれ道の話に `choicePrompt` と `choices: [{id:'a'|'b', text, flag:'qc_<連作>_<選択>', dialog, flags?, reward?}]`（v3 の形と同じ。報告のときに選ぶ → `choose` → `turnIn`）。
  - 続きの話は `reqChoice: {mission, choice}`。選んだ側だけが受けられる（`MissionManager.canAccept` が見る）。
  - 分かれたあと合流する話は `prereqAny: [[A の最後, B の最後]]`（各グループのどれか 1 つが完了していれば良い）。
  - `reqFlags: [flag]` で、フラグが立っているときだけ受けられる話も書ける。
- **前の結果でセリフが変わる**: 選択肢の `flag` を `dialogByFlag: {qc_..: {offer?, done?}}` で読む。受注のセリフも `game.missions.dialog(id, 'offer')` を通す（会話の窓は `linesOf` で対応済み）。
- **報酬でフラグを立てる**: `reward.flags: ['world2Unlocked', 'title_...']` → `state.flags[f] = true`（古いセーブで `state.flags` が無くても作る）。選択肢にも `flags: [...]` を書ける。
  - 第2ワールドの入口は `m2_08_gate` の報酬で `world2Unlocked` が立つ。世界担当は `state.flags.world2Unlocked === true` を読むだけ。
- **称号**: `reward.flags` の `title_*` は `achievements.js` の `EXTRA_TITLES`（`QUEST_TITLES` を足している）で称号になる。
- **連作の目印**（窓の表示用・任意で使える）: `series`（連作のキー）・`seriesName`・`episode`（'1'・'4a' など）・`region`・`questKind`（'story' | 'joke' | 'cross' | 'memento' | 'main2'）・`seriesLast`（最後の話）。
- **装備の印**: 連作の報酬装備は `questSet: true`（ID は `qset_*`）、見た目だけのネタ装備は `cosmetic: true`（持ち物の窓で「見た目専用」の印を出してほしい）。一覧は `items.js` の `QSET_IDS` / `COSMETIC_IDS`。
- **強調の印**: クエストのセリフ・`choicePrompt`・選択肢の `dialog` には、人名 `#d`・地名 `#g`・アイテム `#b`・敵 `#r` を `questsW1.js` の `hl()` が自動で付ける。`desc` と選択肢の `text` は J の窓や通知にも出るので平文のまま。
- データは `src/data/questsW1.js`（`missions.js` の「v4 クエスト」区画が読み込む）、新しい NPC の見た目と置き場所は `src/data/questNpcs.js`（`maps.js` の町の `npcs` の末尾で `...questNpcsFor(町)`）。一覧は `docs/QUESTS.md`。

## 担当の境目

| 担当 | 主に触るファイル | 触らない |
|---|---|---|
| 世界担当 | `src/world/maps.js`、`src/data/enemies.js`（第2ワールドの敵・ボス）、`src/systems/travel.js`、`src/systems/bosses.js`、背景（`src/render/bg*.js`）、ワールドマップの表示、`balance.js` の経験値 | クエスト、職・スキル、会話の窓 |
| 5 次転職担当 | `src/data/jobs.js`、`src/data/jobSkills.js`、`src/data/skillMotions.js`、`src/systems/skills.js`、`src/systems/jobs.js`、スキルの演出（`fxJob.js`）、転職の窓 | マップ・敵、クエストのデータ（転職クエストの `job_*` を除く） |
| クエスト担当 | `src/data/missions.js`、`src/systems/missions.js`（報酬の flags など）、`src/data/items.js`（qset・cosmetic）、`src/data/lore.js`、NPC のセリフ | マップ・敵、職、会話の窓の描画 |
| 会話UI担当 | 会話の窓の描画と操作（`src/ui/` の dialog の部分、`ui.js` の dialogKey） | データ |
