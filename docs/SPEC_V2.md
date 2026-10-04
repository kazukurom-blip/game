# NEON VICE STORY — 拡張仕様 v2（大型アップデート）

ARCHITECTURE.md の契約は引き続き有効。本書はその**追加・変更**。担当とファイル所有権は ARCHITECTURE.md と同じ（＋サウンド担当 `src/audio/*`）。

## ユーザー要望（必須）
1. **M キーでワールドマップ表示**。訪れたマップ（state.visited）はすべて名前つきで表示、未訪問だが隣接するマップは「???」、現在地を強調。
2. **警察はフィールド（道）には出ず、町のみ出現**。
3. **町ではNPC（市民）に通常攻撃のみできる**（町ではスキル使用不可。市民を殴ると手配度が上がり警察が来る＝GTA）。町にモンスターは出ない。
4. **序盤マップは経験値少なめ**、先に進むと**町から分岐**して色々なマップへ。
5. **町は7個**。
6. **超低確率のレアドロップは PET（専用装備スロット `pet`）**。装備すると追従し、**アイテム・お金を自動取得**（取得範囲はペットごと 160〜420px）。
7. **敵は50種類以上**。
8. **町のテーマに沿った背景、その周辺フィールドは似た背景・似た敵**（地域＝region）。
9. 別途「こだわり要素」（下記）。

## ワールド構成（マップID確定版。全担当このIDを使う）

`map.town = true` の町7つ（※既存IDを町として再利用）＋フィールド27。`map.region` は背景テーマ兼地域ID。

| 地域 region (theme) | 町 (town) | フィールド (Lv目安) |
|---|---|---|
| beach | `beach` ヴァイス・ビーチ (安全) | `beach_f1` サンセット海岸道 1-3 / `beach_f2` ヤシの並木道 3-6 / `beach_f3` ピア桟橋 5-9 (行き止まり・ボス king slime) / `beach_f4` ハイウェイ入口 8-12 |
| downtown | `downtown` ダウンタウン | `down_f1` ネオン裏通り 10-14 / `down_f2` 地下鉄トンネル 13-18 (行き止まり・中ボス) / `down_f3` 高架ハイウェイ 16-22 / `down_f4` セントラル公園 14-20 |
| slums | `slums` ポート・スラム | `slums_f1` 倉庫街 20-25 / `slums_f2` 造船所 24-30 / `slums_f3` 密輸船 28-34 (行き止まり・ボス) / `slums_f4` 廃線路 30-36 |
| swamp | `swamp` グレイズ村 | `swamp_f1` 湿地の入口 22-28 / `swamp_f2` マングローブ迷路 30-38 / `swamp_f3` ワニの巣 36-44 (行き止まり・ボス gator) / `swamp_f4` 霧の水路 38-45 |
| casino | `casino` ゴールデン・ストリップ | `casino_f1` 砂漠ハイウェイ 42-48 / `casino_f2` 地下金庫 48-55 / `casino_f3` VIPフロア 54-60 (行き止まり・ボス mecha) / `casino_f4` 夜景ブールバード 52-58 |
| rooftop | `rooftop` ヴァイス・タワー | `tower_f1` 工事現場の足場 58-64 / `tower_f2` 空中庭園 64-70 / `tower_f3` 最上階ペントハウス 70-76 (行き止まり・ラスボス don) |
| spaceport | `spaceport` ルミナ宇宙港 | `space_f1` 沿岸ロケット道 36-42 / `space_f2` 発射台エリア 42-50 / `space_f3` 月面シミュ区画 75-85 / `space_f4` 謎の宇宙船 85-100 (行き止まり・裏ボス alien) |

接続（ポータル。双方向）:
```
beach—beach_f1—beach_f2—beach_f4—downtown
beach—beach_f3
downtown—down_f1—down_f2
downtown—down_f3—slums_f1—slums
downtown—down_f4—swamp_f1—swamp
slums—slums_f2—slums_f3
slums—slums_f4—space_f1—space_f2—spaceport
swamp—swamp_f2—swamp_f3
swamp—swamp_f4—casino_f1—casino
casino—casino_f2—casino_f3
casino—casino_f4—tower_f1—rooftop
rooftop—tower_f2—tower_f3
spaceport—space_f3—space_f4
```
- ポータルは端だけでなく**マップ中ほどにも分岐ポータル**を置いてよい。各ポータル `label` は行き先マップ名。
- 町マップ: 幅 2400〜3200、ショップ・NPC・車・建物の装飾多め、**モンスターなし**、市民（civilian）と警察が出る。 `map.town=true`, `map.copSpawns=true`。
- フィールド: 幅 3000〜4500、多段足場・ロープ、`map.town=false`, `map.copSpawns=false`。`map.levelRange=[min,max]`。
- 全マップに `map.region`（上表の地域）と `map.variant`（0〜3、同地域内で背景の色味・時間帯・小物を変える番号）。

## 敵 (システム担当) — 50種以上
- 各敵 def に **`habitats: [mapId,...]`**（出現フィールド）と **`region`** を必須で追加。マップの spawns に `types` が無い場合、spawner は `habitats` に現在マップを含む敵（boss除く）から自動選択する。ボスは `boss:true` かつ habitats に行き止まりマップ。
- 地域ごとに見た目と系統を揃える（ビーチ=スライム・カニ・カモメ・クラゲ・フラミンゴ、ダウンタウン=チンピラ・ネズミ・ネオンキノコ・ドローン、スラム=港湾ギャング・毒スライム・ネズミ、スワンプ=ワニ・ヘビ・蚊・沼キノコ、カジノ=ゴースト(チップの亡霊)・ガードマン・金スライム・ロボ、タワー=ヒットマン・SWAT風傭兵・アタックドローン・ゴーレム、宇宙港=ロボ・エイリアン・宇宙クラゲ）。
- **新しい art 名（アート担当が実装）**: `crab, jellyfish, seagull, rat, snake, mosquito, ghost, robot, alien, golem, civilian, bossAlien` ＋既存10種。色違いは `def.color` / `def.accent` で（アート側は color を反映する）。`def.scale` で大きさ。
- 警官系 (`isCop`) は spawner が**町でのみ**出す。フィールドの spawns/habitats に警官を入れない。
- **市民** `civilian_*`（3〜5種: 観光客・ビジネスマン・スケーター・おばあちゃん等、`civilian:true, art:'civilian', ai:'civilian'`, 低HP, 経験値0〜わずか, お金を少しドロップ, 殴られると逃げる）。def.look/equip は未指定可（アート側がインスタンスごとにランダム服装: `enemy.seed` を使う）。殴ると `addWanted`（小）、倒すと（中）。
- **経験値バランス**: 序盤（beach地域）は少なめ（Lv1-10 で1匹 2〜8 exp 程度、レベル上げに時間がかかる）、地域が進むほど敵1体あたりの経験値効率が上がる。expToNext と合わせて調整（目安: beach地域で Lv10 まで 20〜30分、以降もメイプル的なペース）。

## PET（システム＋ワールド＋アート）
- 装備スロットに **`pet`** 追加（`equipped.pet`）。PETアイテム: `slot:'pet', type:'equip', rarity:'mythic'`（または `'pet'` 専用レア度でも可。RARITY に追加し色は虹色）、`look:{style, color, accent}`、`pet:{pickRange, pickRate(秒あたり取得数), name}`、少しの stats。
- PET style（アート担当が `drawPet(ctx, x, y, look, anim)` で描く）: `slimePet, flamingoPet, gatorPet, catPet, dronePet, ghostPet, alienPet, dragonPet, dolphinPet, robotPet`（10種）。
- 入手: 各地域の敵ドロップに **0.01%〜0.08%**（超低確率）。LUK で微増。図鑑コンプ報酬などで1体確定入手手段があってもよい。
- `entities/pet.js` `class Pet { constructor(game); update(dt); draw(ctx) }`：game.pet。装備中のみ存在。プレイヤーの後ろをふわふわ/てくてく追従（ジャンプ・ロープにも追いつく、離れすぎたらワープ）。範囲内の `game.drops` に向かって移動し取得（`drop.pickup()` 相当を呼ぶ）。取得時に小エフェクト。
- 拾ったPETドロップは超豪華演出（`rareDrop` に加え `events.emit('petDrop', {item})`）。

## 町ルール
- `game.map.town === true` のとき:
  - `useSkill` は false（「町ではスキルは使えない」通知、1.5秒に1回まで）。
  - 通常攻撃は市民・警官に当たる。市民への攻撃で手配度上昇。
  - spawner は市民を常時 6〜10人歩かせる（左右に歩く、たまに止まる、殴られると逃げる）。警察は手配度に応じて出現（既存ロジック）。
- フィールドでは手配度は**素早く減衰**（警察がいないため）。町に戻るとまだ残っていれば警察が来る。

## こだわり要素（任せられた分）
1. **モンスター図鑑**（B キー, UI＋システム）: 敵を倒すと登録（state.book[enemyId]=撃破数）。初撃破で「NEW!」。撃破数 10/50/100 でランク。地域コンプ・登録数に応じて永続ステータスボーナス（computeStats に反映）。図鑑画面で敵の絵（drawEnemy をダミーenemyで描画）、名前、Lv、出現地、ドロップ（未入手は ???）。
2. **タクシー（ファストトラベル）**: ワールドマップ(M)で**訪問済みの町**をクリック → 料金 $（距離×レベル）を払って移動。フィールドへは不可。
3. **昼夜サイクル**: `game.clock`（0〜24時, 実時間12分で1日）。背景に時間帯の色調オーバーレイ（夕方=オレンジ, 夜=紺+ネオン強調, 朝=淡いピンク）。夜は敵の経験値+10%、HUD に時計表示。`drawBackground` は `map`, `cam`, ... に加え `game.clock` を参照（`map._clock` に main が毎フレーム入れる）。
4. **スマホSNS「NeonGram」**（P キー, UI＋システム）: 行動（レア入手・ボス撃破・手配★3以上・レベルアップ・PET入手）で自動投稿とフォロワー増加（state.sns = {followers, posts:[{t,text,likes}]}）。フォロワー数で称号（HUD名前横）。フォロワー節目で報酬（お金・アイテム）。
5. **サウンド**（サウンド担当, `src/audio/audio.js`）: WebAudio のみでSE合成（ヒット/クリティカル/ジャンプ/拾う/レア/レベルアップ/被弾/ポータル/警察サイレン/車エンジン/UIクリック）と、地域ごとのチップチューン風BGM（シンセ＋ドラム、ループ。町とフィールドで曲調差）。**カーラジオ**：乗車中は R キーで局切替（3局: ネオン・ウェーブ / ヴァイス・ヒップホップ / トロピカル・ラテン 風の自作パターン）。ユーザー操作まで AudioContext を開始しない（ブラウザ制約）。ミュート切替（Shift+M ではなく **N キー**）。
   - API: `export const audio = { init(), unlock(), sfx(name, opts), playMusic(trackId), stopMusic(), setRadio(i), nextRadio(), toggleMute(), muted }`。`events` を購読して自動で鳴らす `attachAudio(game)` も提供。

## 入力の追加（メインが core/input.js に追加済み）
`mapWin`=M, `bookWin`=B, `phoneWin`=P, `radio`=R, `mute`=N。

## state 追加フィールド（progression.newState と旧セーブ移行で必ず初期化）
`visited: [mapId]`, `book: {enemyId: kills}`, `sns: {followers:0, posts:[]}`, `equipped.pet: null`, `petBar?`, `clock?`。
旧セーブ（v1）を読んだ場合も壊れないよう `migrateState(state)` を progression.js に追加（main が loadState 後に呼ぶ）。旧マップIDはそのまま町として有効。
