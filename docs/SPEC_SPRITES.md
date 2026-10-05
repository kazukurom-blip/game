# 見た目の差し替え仕様（スプライト・オーバーライド）

外部で描いたPNG画像を置くだけで、キャラ・敵・ボス・PETの見た目を差し替えられる仕組み。
画像が無いものは今まで通りコードで描く（手続き描画）にフォールバックする。**一部だけ差し替えてもゲームは動く。**

- 実装: `src/render/sprites.js`（main 起動時に `loadSpriteManifest()` を1回）。入口: `drawEnemy` / `drawPet` / `drawCharacter` の先頭で分岐。
- manifest が無い・JSON が壊れている → 全部コード描画。画像は**最初に必要になった時に読み込み**、読み込み完了まではコード描画。読めない画像のものはコード描画（人型はそのレイヤーだけ省略）。
- パスはすべて `assets/sprites/` からの相対（`..` や `http://` は無視）。公開ページでも同じ。
- デバッグパネル（F2）の「見た目: スプライト / コード描画」ボタンで切替（`spriteMode` = `auto` | `procedural`、localStorage に保存）。パネルに読込数を表示。
- HPバー・ボス名・オーラ・影・斬撃の軌跡・PETのハート/きらめき/親密度オーラはスプライトの上下にコードで描く（シートには描かない）。PET の親密度リボン/王冠はスプライト時は出ない。

## テンプレート（今の絵を同じコマ割りで書き出したもの）
`npm run export:sprites`（= `node tools/export_sprites.mjs`、Playwright 使用。約80秒）で `assets/sprites_template/` に書き出す。

- 各シート `<name>.png`（透明背景）＋ `<name>_guide.png`（セル枠・足元の基準点＝桃色の十字・地面の点線・行名/コマ数/fps・コマ番号）。
- tint 対象（肌・髪・装備）は `<name>_gray.png`（グレースケール）も出す。レイアウトはカラー版と同じ（`--gray-guides` でそのガイドも出す）。
- **`assets/sprites_template/manifest.json` はそのまま使える**。フォルダごと `assets/sprites/` にコピーすれば全部スプライト表示になる（描き直したファイルだけ置いて、manifest から他の行を消してもよい）。
- `assets/sprites/manifest.json` は既定では `{"version":1}`（空 = 全部コード描画）。
- オプション: `--only=chars,presets,enemies,pets` / `--out=<dir>` / `--no-guides` / `--gray-guides` / `--jobs=4`。
- 容量の目安: 全部で PNG 約1000枚・約320MB（うちガイド約半分）。

## フォルダ構成
```
assets/sprites/
  manifest.json                     … どの画像があるか・コマ割り・基準点（必須）
  enemies/<enemyId>.png             … 敵1種ごと（例 slime_green.png）。manifest のキーが敵ID。キーに art 名（例 slime）を使えば同じ art の敵すべてに効く
  bosses/<enemyId>.png              … ボス（第2形態の行を含められる）
  pets/<style>.png                  … PET（例 catPet.png）
  chars/                            … 人型キャラ（重ね合わせ式・レイヤー別）
    body_f.png / body_m.png               … 素体（手前の腕を除く。インナーのタンクトップ/スパッツ込み）
    arm_f.png, arm_f__melee.png, __gun, __magic … 手前の腕と手（武器の種類で腕の形が違うので別シート）
    face_f.png / face_m.png               … 顔（目・眉・口・頬・汗）。行＝表情。頭の座標系で描く（後述）
    face_f__19f0ff.png                    … 目の色ごとの顔（あれば優先: キー face_f@19f0ff）
    hair/<style>_back_<g>.png / <style>_front_<g>.png … 髪型14種（後ろ髪 / 前髪）
    equip/<slot>/<style>_<g>.png          … 装備（hat, top, bottom, shoes, accessory, weapon）
    equip/top/<style>_sleeve_<g>[__melee|__gun|__magic].png … 上着の手前の袖
    equip/accessory/<style>_back_<g>.png  … 背中側のアクセ（wings, scarf のなびく部分）
    equip/<slot>/_default_<g>.png         … 何も装備していない時の服（Tシャツ・短パン・靴）
    tear_1_<g>.png / tear_2 / tear_3      … 服破れの重ね（HP 75/50/25% 以下）
  presets/<class>_<g>.png           … 参考用：完成形の1枚絵（ゲームでは使わない）
```
`<g>` = `f` / `m`（体格が違うので性別ごと）。

## シートの形式（全種共通）
- 1枚のPNGに **行＝状態、列＝コマ**。セルの大きさは manifest の `cell: [w, h]`。**ゲーム内表示の2倍で描く**（`scale` 既定 0.5）。
  テンプレートのセルは中身に合わせて自動で決めている（例: 素体 168×176、手前の腕 88×128、敵 120×80〜256×256、ボス 312×304〜728×736、PET 96×144）。描き直す時はセルの大きさを変えなければ manifest はそのまま。
- **右向き**で描く（左向きはゲームが反転）。背景は透明。
- 基準点 `anchor: [ax, ay]` ＝ **足元中央**（セル左上からの px）。顔だけは**頭の中心**。
- `scale`: ゲーム内表示倍率（既定 0.5）。
- `fps`: 数値、または行ごとの `{ "default": 8, "idle": 2.5, ... }`。`rows` の値を `[コマ数, fps]` にすると行ごとに指定できる。
- `size: [w, h]`（敵・ボス）: そのシートを描いた時の敵の大きさ（ゲーム内 px）。実際の敵の幅がこれと違えば比率で拡大縮小する。
- 行がシートの高さに足りない・コマが無い場合は、その行を使わず `idle` にフォールバック。

### 状態（行）の名前とコマの選び方
| 種類 | 行（状態） | コマの進め方 |
|---|---|---|
| 人型（各レイヤー共通） | idle(6), walk(8), jump(2), climb(4), attack(6), shoot(4), hurt(2), dead(4), drive(1), sit(1)＋ attack_melee(6), attack_magic(6) | 待機などのループは `t × fps`。attack/shoot は攻撃の進み(attackT)、hurt は被弾からの時間、dead は倒れる進み |
| 敵 | idle(4), walk(6), windup(2), attack(4), hurt(2), dead(4) ［飛ぶ敵は walk の代わりに fly でも可］ | ループは fps、dead は消える進み |
| ボス | 敵と同じ＋第2形態 idle2(4), walk2(6), windup2(2), attack2(4)（HP50%以下で使用。無ければ通常の行） | 同上 |
| PET | idle(4), walk(6), fly(4), pick(4) | fps |
| 顔 face | neutral, smile, shout, hurt, happy, jito, angry, sad, wink, blink, dead, aim, panic（各1コマ） | 状態・表情（anim.face）・HP から選ぶ |

- 状態名の対応: ゲーム内の状態 → 行名。武器を持っていれば `<状態>_<melee|gun|magic>` の行を先に探す（例 `attack_melee`）。無い行は `jump→walk`、`shoot→attack`、`sit↔drive`、最後は `idle`。
- 人型の行の時間（テンプレートの既定）: idle 2.5fps（呼吸1周 2.4秒）、walk 13.3fps（2歩 0.6秒）、jump 1.7fps、climb 4.4fps。
- 顔の選び方: dead→dead、慌て→panic、`anim.face`（happy/jito/angry/sad/wink/shout）、attack→shout、shoot→aim、hurt→hurt、悪役→angry、HP 25%以下の待機/歩き→sad、待機中のまばたき→blink、他は neutral。無い行は neutral。

## manifest.json の例
```json
{
  "version": 1,
  "defaults": { "scale": 0.5, "fps": 8 },
  "enemies": {
    "slime_green": { "file": "enemies/slime_green.png", "cell": [120,96], "anchor": [60,88], "size": [40,32],
                     "rows": { "idle": 4, "walk": 6, "windup": 2, "attack": 4, "hurt": 2, "dead": 4 }, "fps": 8 }
  },
  "bosses": { "boss_king_slime": { "file": "bosses/boss_king_slime.png", "cell": [472,376], "anchor": [236,340], "size": [120,96],
              "rows": { "idle": 4, "walk": 6, "windup": 2, "attack": 4, "hurt": 2, "dead": 4, "idle2": 4, "walk2": 6, "windup2": 2, "attack2": 4 } } },
  "pets": { "catPet": { "file": "pets/catPet.png", "cell": [96,144], "anchor": [46,125], "rows": { "idle": 4, "walk": 6, "fly": 4, "pick": [4, 11.46] } } },
  "chars": {
    "enabled": true, "scale": 0.5,
    "fps": { "default": 8, "idle": 2.5, "walk": 13.333, "jump": 1.667, "climb": 4.444, "drive": 1, "sit": 1 },
    "rows": { "idle": 6, "walk": 8, "jump": 2, "climb": 4, "attack": 6, "shoot": 4, "hurt": 2, "dead": 4, "drive": 1, "sit": 1, "attack_melee": 6, "attack_magic": 6 },
    "layers": {
      "body_f":          { "file": "chars/body_f_gray.png", "cell": [168,176], "anchor": [91,154], "tint": "skin",
                           "plain": "chars/body_f.png", "plainColor": "#ffe3d3" },
      "arm_f@melee":     { "file": "chars/arm_f__melee_gray.png", "cell": [88,128], "anchor": [24,116], "tint": "skin",
                           "rows": { "idle": 6, "walk": 8, "jump": 2, "climb": 4, "attack": 6, "shoot": 4, "hurt": 2, "dead": 4, "drive": 1, "sit": 1 } },
      "face_f":          { "file": "chars/face_f.png", "cell": [104,112], "anchor": [52,68], "fps": 1, "rows": { "neutral": 1, "blink": 1, "...": 1 } },
      "hair:twin_back_f":  { "file": "chars/hair/twin_back_f_gray.png",  "cell": [...], "anchor": [...], "tint": "hairColor" },
      "hair:twin_front_f": { "file": "chars/hair/twin_front_f_gray.png", "cell": [...], "anchor": [...], "tint": "hairColor" },
      "top:hoodie_f":    { "file": "chars/equip/top/hoodie_f_gray.png", "tint": "color", "plain": "chars/equip/top/hoodie_f.png", "plainColor": "#7b2ff7" },
      "top:hoodie_sleeve_f@gun": { "file": "chars/equip/top/hoodie_sleeve_f__gun_gray.png", "tint": "color" },
      "top:_default_f":  { "file": "chars/equip/top/_default_f.png" },
      "tear_2_f":        { "file": "chars/tear_2_f.png" }
    }
  }
}
```
- `tint`: グレースケールで描いた画像をゲーム側で着色する（`skin` / `hairColor` / `eyeColor` / `color`（装備の主色）/ `accent` / `#rrggbb`）。オフスクリーンで multiply → destination-in（元の透明度）で塗り、コマ×色ごとにキャッシュ（上限 約2400万画素）。着色しない（色まで描いた）なら省略。
  - 画像全体に色を掛けるので、アクセント色の部分も主色に染まる。色を固定したい部分はグレーにせず色で描くと、その色に主色が掛け算される点に注意（白〜明るいグレーで描くのが基本）。
- `plain` / `plainColor`: 着色する色が `plainColor` と同じ時は、色まで描いた `plain` 画像をそのまま使う（既定色の装備・既定の髪色/肌が完全一致する）。
- `rows` の値はコマ数（または `[コマ数, fps]`）。行の順番はここに書いた順。レイヤーごとに `cell` / `anchor` / `rows` / `fps` / `scale` を上書きでき、省略時は `chars` の値。
- レイヤーのキーの探し方（上から順に最初に見つかったもの）:
  - 素体 `body_<g>` → `body`、手前の腕 `arm_<g>@<武器種>` → `arm_<g>`（武器種 = melee / gun / magic、素手は無印）
  - 顔 `face_<g>@<目の色hex>` → `face_<g>` → `face`
  - 髪 `hair:<style>_back_<g>` → `hair:<style>_back`、前髪 `hair:<style>_front_<g>` → `hair:<style>_front` → `hair:<style>_<g>` → `hair:<style>`（1枚にまとめる場合は前髪の位置に描く）
  - 装備 `<slot>:<style>_<g>` → `<slot>:<style>`、未装備の top/bottom/shoes は `<slot>:_default_<g>` → `<slot>:_default`
  - 手前の袖 `top:<style>_sleeve_<g>@<武器種>` → `top:<style>_sleeve_<g>` → `top:<style>_sleeve`、背中のアクセ `accessory:<style>_back_<g>`
  - 武器 `weapon:<style>_<g>` → `weapon:<style>`（その武器を持った姿勢で描く）、服破れ `tear_<n>_<g>` → `tear_<n>`

## 人型の重ね順（下 → 上）
accessory_back（wings・scarf のなびき） → hair_back → body → bottom → shoes → top → tear → face → hair_front → accessory（sunglasses・goldChain・mask・halo 等） → hat → arm（手前の腕） → sleeve（手前の袖） → weapon
- 足りないレイヤーは描かない。`chars.enabled` が false、または body が無ければ、人型は全部コード描画のまま。必要なレイヤーのどれかが読み込み中の間もコード描画。
- テンプレートの各レイヤーは「完成形で見えている部分」だけ（他のレイヤーに隠れる所は抜いてある）。例: 上着は手前の腕の所が抜けている、前髪は眉の所が抜けている。
- 顔は頭の座標系で描く（基準点＝頭の中心、ゲームが毎コマ頭の位置・傾きに合わせて置く）。背面（climb）では顔を描かない。
- 服破れは tear_1〜3 を上着・下の上に重ねる（インナーが残る全年齢表現にすること）。破れで裾がギザギザになる・袖が短くなる形の変化は、スプライトでは再現しない（tear の重ねのみ）。
- 慌て（市民が逃げる）は `panic` 行があれば使う（テンプレートには無く、walk になる）。

## 優先順位
1. manifest にある画像 → 2. コード描画。
- 敵: `bosses[<id>]`（ボス）→ `enemies[<id>]` → `enemies[<art>]`。人型の敵（thug/cop/swat/bossDon）も敵シートがあればそれを使い、無ければ人型レイヤー → コード描画。
- 市民（civilian）は見た目がランダムなので、テンプレートでは manifest に入れていない（PNG は enemies/ に参考として出力）。人型レイヤーがあれば市民もそれで描かれる。
- アイテム欄の PET アイコンも PET のスプライトで描く（読み込み・切替でアイコンのキャッシュを作り直す）。

## 書き出しのしくみ（tools/export_sprites.mjs）
- `drawCharacter(ctx, x, y, look, equip, { onlyLayers: ['body'|'arm'|'hair_back'|'hair_front'|'face'|'top'|'sleeve'|'bottom'|'shoes'|'hat'|'accessory'|'weapon'|'tear', ...], noErase })`
  で指定レイヤーだけを描く（`body` = 素体＋手前の腕、`top` = 上着＋手前の袖、`body_main` / `top_main` / `accessory_front` / `accessory_back` / `hair` も可）。
  重ね順で下になるのにコードでは上に描かれる部品は destination-out で抜く（`noErase: true` で抜かない）。
- 敵は `setEnemyArtExport(true)` で影・オーラ・ボス演出・HPバーを描かずに書き出す（ゲームではこれらをスプライトの上下にコードで描く）。
- 既知の差: 暗い色の装備（黒レザー等）は着色（掛け算）だとコード描画のハイライトが出ず黒っぽくなる。夜のリムライト・ネオン（敵）はシートに入らない。


## 1枚絵モード（enemies / bosses / pets）
- manifest の値を**文字列（ファイル名）だけ**にするか、`"single": true` を付けると1枚絵として扱う。
- 読み込み時に、四隅が不透明でほぼ同色なら四隅から塗りつぶして背景を透明化（`bgRemove: "auto"` 既定 / `true` 強制 / `false` 無効）、不透明部分で自動トリミング。足元＝トリミング後の下端中央。
- 表示の高さ: `height`（px）。省略時は敵の当たり判定の高さ×1.35（ボス×1.25）、PET は36px。
- 動きはエンジン側で付ける: idle 呼吸、walk 弾み＋傾き、windup 縮み＋後傾、attack 伸び＋前進、hurt 揺れ＋白フラッシュ、dead 倒れ＋フェード、飛行は上下浮遊、第2形態は `file2`（無ければ赤く着色＋小刻みな震え）。
- オプション: `facesLeft`, `flyBob`, `motion:false`（動きを付けない）。
- 指示文の一覧は `node tools/gen_ai_prompts.mjs` で `docs/art_handoff/AI_PROMPTS.{md,csv}` と `manifest_single_example.json` に生成。

## 主人公の立ち絵・頭の差し替え（画像生成AI向け）
キー: `<classId>_<gender>`（例 `luna_f`, `jin_m`, `hacker_f`）。どれも1枚絵（背景は透明か単色。自動で透明化・トリミング）。

### ① 立ち絵 `portraits`
```json
"portraits": { "luna_f": { "file": "portraits/luna_f.png",
                           "expr": { "smile": "portraits/luna_f_smile.png", "angry": "portraits/luna_f_angry.png",
                                     "surprised": "portraits/luna_f_surprised.png", "sad": "portraits/luna_f_sad.png", "shout": "portraits/luna_f_shout.png" } } }
```
- 腰から上〜全身の立ち絵。使う場所: 会話窓（主人公が話す行）、キャラ選択・作成画面のプレビュー、4次スキルのカットイン、転職の祝福演出。表情が無ければ基本の絵。
- 文字列だけ（`"luna_f": "portraits/luna_f.png"`）でも可。

### ② 頭 `heads`
```json
"heads": { "luna_f": { "file": "heads/luna_f.png", "expr": { "blink": "heads/luna_f_blink.png", "hurt": "heads/luna_f_hurt.png",
                                                              "shout": "heads/luna_f_shout.png", "happy": "heads/luna_f_happy.png" },
                       "scale": 1.0, "offset": [0, 0], "facesLeft": false } }
```
- 首から上（顔＋髪）だけの絵。右向き（斜め前）。ゲーム中の主人公の頭をこの絵に置き換え、体・服・装備はコード描画のまま（着せ替えは維持）。帽子・ヘルメットは上に重ねる。
- 頭の位置・傾き・大きさは毎フレーム `charHeadPose()` に合わせる。`scale` / `offset` で微調整。
- 表情: blink（まばたき）、hurt（被弾）、shout（攻撃）、happy（レベルアップ等）。無ければ基本の絵。
- キャラ作成で「AIの顔を使う」を選んだキャラだけに適用（`state.look.aiHead = true`。既定は、画像があれば true）。髪型・髪色の選択はこの場合は無効（絵の髪になる）。

### 実装メモ（src/render/sprites.js / character.js）
- 読み込み: `portraits` / `heads` の各項目（文字列、または `{ file, expr: {名前: ファイル}, scale, offset, facesLeft, bgRemove }`）を1枚絵として扱う（背景除去・トリミングは1枚絵モードと同じ `prepSingle`）。読み込み時に立ち絵は高さ720px、頭は320pxまで半分ずつ縮小（毎フレームの drawImage を軽くする）。不正なパスの項目は無視。項目を最初に使った時に、その人の表情の絵もまとめて先読み。
- API（sprites.js）:
  - `portraitFor(classId, gender, expr)` / `headFor(classId, gender, expr)` → `{ canvas, w, h, expr, file, scale, offset, facesLeft }` | null（無い・読み込み中・壊れている・spriteMode=procedural）。`classId` に `'luna_f'` や look（`classId`・`gender` を持つ）も可。表情が無ければ別名（smile↔happy, shout↔angry, surprised↔hurt）→ 基本の絵。
  - `drawPortrait(ctx, key, expr, x, y, h, opts)` → 描いた矩形 | null。`opts.anchor`: `'foot'`（既定・足元中央）/ `'center'`、`crop: [u0,v0,u1,v1]`（0..1 の切り出し）、`maxW`、`flip`、`alpha`、`dim`（0..1 暗く）、`flash`。
  - `hasHeroArt('portraits'|'heads', classId, gender)`（manifest にあるか）/ `heroArtState(...)`（0 無し / 1 読み込み中 / 2 完了 / 3 失敗）/ `headBackOf(head)`（背面用シルエット）。
- 頭の差し替え（character.js）: `aiHeadOf(look, anim, state, t)` が `look.aiHead !== false` かつ `look.classId`・`look.gender` あり（悪役・テンプレート書き出し（onlyLayers）中は除く）で頭の絵を返す。`renderChar` は K.ai があれば後ろ髪・耳・顔・前髪・眉・頬・煤を描かず、頭の座標系（`charHeadPose` と同じ `enterHead`）に `paintAiHead` で絵を置き、マスク・サングラス・帽子・汗・天使の輪を上に重ねる。かぶる帽子（cap/beanie/bandana/helmet/cowboy）はつばの線より上・帽子の外の部分を clip で隠す。背面（climb）はシルエット。被弾の白フラッシュは白いシルエット。
  - 置き方: 絵を「高さ46・幅58」に収まる倍率 × `scale` で、中心を頭の座標 (1.1, -3) + `offset` に置く（頭の座標: 原点=頭の中心、顔の幅 約34、あご +15.5、髪の上端 約 -25）。`facesLeft` なら左右反転。
  - 表情 `aiHeadExpr(state, t, anim)`: dead/panic→hurt、`anim.headExpr`（プレイヤーはレベルアップ・転職・ボス撃破・ミッション達成・タワー階クリアで 1.8 秒 happy）、`anim.face`（happy/wink→happy, shout/angry→shout, sad→sad）、attack/shoot→shout、hurt→hurt、cheer→happy、idle/sit のまばたき（コードの目と同じ周期 4.8 秒中 3.82〜4.0 秒）→blink、他は基本。
  - 2xキャッシュのキーに使う絵のファイル名を含める（読み込み前はコード描画のキー → 読み込み完了で別のキー＝自動で作り直し）。`boxOf` は頭の絵の `scale`/`offset` に合わせて広げる。
  - 人型レイヤー（`chars`）のスプライトで描く時も、頭の絵があれば hair_back / face / hair_front の代わりに頭の絵を置く。
  - look.classId / look.gender: `progression.newState` / 旧セーブの補完（`tagHeroLook`）と `player.heroLookOf` が state.heroId / state.gender から**列挙されないプロパティ**として付ける（セーブ・見た目の比較には出ない）。NPC・敵・市民の look には付かない → 適用されない。タイトルのプレビューは classId・gender を付けたコピーで描く。
- 立ち絵の使い場所:
  - 会話窓（windows.js）: 行の先頭が `@me:` / `@hero:`（全角コロン可）の行は主人公のセリフ（名前プレートが主人公の名前、左の枠に立ち絵の上の方を枠の縦横比で切り出し。立ち絵が無ければ主人公のちびキャラ）。それ以外の行では窓の右上に主人公の立ち絵（顔欄。相手が話している間は少し暗く、選択肢の時は明るく）。表情: 報酬=smile、「！？」=surprised、「…」で始まる=sad、「♪/ありがと/やった」=smile。
  - キャラ選択の詳細・キャラ作成のプレビュー（title.js）: 立ち絵があればコード描画のキャラを少し小さくして左へ、立ち絵を右に並べる（作成の攻撃ポーズ中は shout、名前の段階は smile）。
  - カットイン（cutin.js）: 立ち絵があれば上の方（高さ＝幅×0.75。腰上なら顔〜肩、全身なら顔〜胸）を帯の中に拡大。`pushCutin(game, { expr })`（既定 shout、転職のカットインは smile）。無ければ今まで通りコード描画の顔アップ（`spriteRev` が変わったら作り直す＝頭の絵の読み込み完了も反映）。
  - 転職の祝福演出（hud3.js）: 左に笑顔（smile）の立ち絵を並べる。中央のキャラは happy。
- テスト: `node tests/hero_art_browser.mjs`（`npm run test:heroart`。仮のAI画像を canvas で生成して page.route で差し替え。スクショ `tests/screenshots/heroart_*.png`）、`tests/sprites_unit.mjs`（Node: 読み込み・不正な項目・表情の選び方・NPC に適用しない）。
- 制限: 頭の絵は1方向（右向き）だけ。背面はシルエット。サングラス・マスクはコードの顔の位置（絵と合わなければ offset）。帽子の大きさは絵の頭の大きさに合わせない。服破れの煤・絆創膏は頭の絵には付かない。


## リグ（パーツ式の着せ替え人形。主人公用・画像生成AI向け）
主人公の体・服・武器を「パーツの絵」で組み立てて、関節の回転で動かす。AI は**配置図の枠の中に描く**だけ（コマ割り不要）。頭は `heads`（無ければコードの頭）。
描く人向けの説明・1枚ごとの指示文: `docs/art_handoff/HERO_PARTS_GUIDE.md`（一覧 `HERO_PARTS_LIST.csv`。全 90 枚: S 24 / A 35 / B 31）。

- 実装: `src/render/rigLayout.js`（配置図・基準色・グループ）、`src/render/rig.js`（読み込み・切り出し・位置合わせ・色替え・合成・プラン）、
  `src/render/character.js`（`renderRig` = リグで描く、`renderRigCode` = コード描画を休めの姿勢でパーツに分けて描く、`renderRigWeapon`）。
- 入口: `drawCharacter` の先頭で `rigPlanFor(look, equip)`。プランがあれば既存の 2x キャッシュ・半透明・オーラ・斬撃/ホロのライブ描画の経路のまま、描画関数だけ `renderRig` に替える（キャッシュのキーに `|G<rev>`）。
  無ければ今まで通り（人型レイヤー `chars` → コード描画）。`anim.noRig` でリグを使わない（テスト・見比べ用）。

### 配置図（♀♂共通 1024×1024、1単位 = 8px）
| 枠 | 局所座標の範囲（単位） | 支点 | 付く座標系 |
|---|---|---|---|
| head | x -34..34, y -38..22 | 頭の中心（`charHeadPose` と同じ、BODY.head の縮尺は描く時に掛ける） | 頭（首の位置・頭の傾き） |
| back | x -38..14, y -42..4 | 腰（胴と同じ） | 上半身（翼・フード・スカーフの端） |
| torso | x -18..18, y -31..13 | 腰 | 上半身（`translate(hx, hipY+bob) rotate(tilt)`） |
| armB / armF | x -6..6, y -4..22 | 肩（SHOULDER_Y、ひねりで左右に動く） | 上半身。肘 = 支点から BODY.upper |
| legB / legF | x -7..7, y -4..23 | 股（±legX） | 足元。膝 = 支点から BODY.thigh |
| footB / footF | x -7..10, y -10..5 | 足首 | 足首で `rotate(-(脚の角度)*0.85)`（コードの靴と同じ） |
- 枠の位置（px）は `RIG_PARTS[name].x/y/w/h`、支点 `px/py`。武器は別の配置図 1024×512（1単位 = 16px、持ち手 = 支点 (240,256)、右向きに水平）。
- 腕・脚は「まっすぐ下」の1枚。描く時に関節の行で上下2つに分け（重なり 1.15 単位）、下は関節で `-(a+e)`、上は付け根で `-a` 回し、曲がりが大きい時は中間の角度の帯で外側の隙間を埋める。
  手前の手（支点から upper+fore の丸、半径 3）は武器の上にもう一度描く（握っている見た目）。合成時にも袖の上に手を重ねる。
- 重ね順（前向き）: 影 → [上半身] back(アクセ) → 後ろ髪（コードの頭の時）→ back(上着のフード) → 後ろ腕 → [足元] 後ろ脚・後ろ足・前脚・前足 → [上半身] 胴 → 頭（AIの頭 or コードの頭）＋頭の物（メガネ/マスク → 帽子） → 汗 → 前腕 → 武器 → 手 → 斬撃/ホロ。
  背面（climb）: 脚 → 胴 → フード・翼 → 頭の背面（AIの頭のシルエット or コードの後ろ頭）＋帽子 → 両腕（前）。倒れる（dead）はコードと同じく全体を回す。

### ファイルと manifest
```json
"rig": { "enabled": true, "defaultWear": true,
         "parts": ["body_f", "body_m", "top/hoodie_f", "top/hoodie__1d2b24_f", "weapon/knife", "tear/1_f"] }
```
- 値は配列（ファイル = `rig/<キー>.png`）か、`{ "<キー>": "rig/...png" | { "file", "base", "accent", "fit", "recolor", "bgRemove" } }`。
  `npm run rig:manifest`（`tools/rig_manifest.mjs`）が `assets/sprites/rig/` を見て書き直す（既存の指定は残す）。
- キー: `body_<g>`（素体＝肌＋インナー＋室内靴。**無ければリグは使わない**）、`<slot>/<style>_<g>`（slot = top / bottom / shoes / hat / accessory）、
  `<slot>/<style>__<rrggbb>_<g>`（色違い専用。その色のアイテムで優先）、`weapon/<style>`・`weapon/<style>__<rrggbb>`（性別共通）、`tear/<1|2|3>_<g>`（服破れの重ね、HP 75/50/25% 以下）。
  性別を省いた `<slot>/<style>` も可（♀♂共通）。
- グループ → 枠: body = 胴・腕・脚・足、top = 背中・胴・腕、bottom = 胴・脚、shoes = 足、hat = 頭、accessory = 頭/背中/胴（種類ごと `RIG_ACC_PARTS`）、tear = 胴・腕・脚。
- 何も装備していない top/bottom は、今と同じ白Tシャツ・青の短パン（`tshirt`/`shorts` の絵 → 無ければコード）。`defaultWear: false` なら素体のまま。靴が無い時は素体の足。
- 主人公（look に `classId` がある）だけ。悪役・NPC・市民には使わない（`heroesOnly: false` で classId の無い look にも）。spriteMode=procedural（F2）で使わない。

### 読み込み・切り出し・位置合わせ
- 絵を配置図の大きさ（1024×1024 / 武器 1024×512）に拡大縮小 → 背景の自動透明化（`removeBg`、1枚絵と同じ。四隅が同じ色なら塗りつぶして消す）→
  縁のにじみ取り（透明に接する、背景色と輪郭線 #2A1430 の中間の画素を、線の色＋半透明に）。
- 4px のブロックで連結成分（塊）を作り、一番重なる枠（枠から 44px まで広げた範囲）に割り当てる（小さなゴミ、枠の外の小さな塊＝写った文字・点線は捨てる）。
- 位置合わせ: そのシートと同じ物のコード描画（基準色・休めの姿勢）の、同じ枠の不透明範囲に合わせる。拡大率は 腕・脚・胴 = 高さ、足 = 幅、頭・背中 = 面積（0.8〜1.25 に制限、±3% 未満は 1）。
  合わせる点: 腕・脚 = 上端の中央（肩・股）、足 = 下端の中央、他 = 中心。コード描画に中身が無い枠や `fit: false` は枠の位置のまま。
- 武器: マゼンタ（#FF00FF）の印があればそこを持ち手に（印は消す）。無ければ左端と上下の中央をコードの武器に合わせる。拡大率は幅（0.6〜1.6）。
- 保持する解像度: 体 1単位 = 4px、武器 = 8px（読み込み時に切り出して縮小）。

### 色（色相回転＋彩度・明度補正）
- スタイルごとの基準色 `RIG_BASE`（初期装備の色、無ければ最初のアイテム。manifest の `base`/`accent` で上書き）→ アイテムの色（`itemColors`）。同じ色（RGB の差 < 10）なら補正しない。
- 画素ごとに「基準色の布らしさ」（色相 ±24〜44°・彩度・明るさが近い。無彩色の基準色は無彩色の画素。輪郭線（基準色より #2A1430 に近い）・黒は除く）を重みにして、
  色相を回し（無彩色の基準なら目標の色相に）、彩度を比で、明るさを「基準 → 目標、陰影の差は保つ（はみ出す側だけ縮める）」で写し、元の色と重みで混ぜる。
  アクセントは基準のアクセントがはっきりした色（彩度 > 0.15）の時だけ同じ方法で（画素ごとに近い方）。補正の元は、実際に描かれた布の平均色と基準色の中間。
- 素体の肌も同じ方法で `look.skin` に（基準 ♀ #ffe3d3 / ♂ #f6d5be）。頭の絵（heads）は変えない。
- キャッシュ: シート×枠×色ごと（シートあたり最大 40）。

### 合成・代用・キャッシュ
- プラン（`rigPlanFor`）: 性別・肌・装備（スタイル・色・アクセント・レア度）・どの絵を使うか・リグの画像の読み込み番号 → LRU 48。素体や着ている装備の絵が読み込み中なら null（コード描画）。
- 合成（`plan.parts(damage)`、破れの段階 0..4 ごと）: 枠ごとに 素体（肌の色） → 下 → 上着 → アクセサリ、破れは服の上だけ（source-atop）、腕は最後に手を重ねる。足は靴があれば靴だけ。頭の物 = アクセサリ（頭）→ 帽子。
- 絵の無い装備: その装備だけ `renderRigCode`（今のコード描画を休めの姿勢・その色・その破れの段階で描いてパーツに分けたもの）で代用（LRU 60）。武器の絵が無ければ手の位置にコードの `drawWeapon`。
  絵の無い破れ: コード描画の破れ（上着・下のスタイルごと）。銃口の火花・杖の光はコードで武器の絵の上に。
- 白フラッシュ: パーツごとに白く塗った版（キャッシュ）。半透明・オーラ・左右反転・拡大縮小は既存の経路のまま。

### テンプレート・テスト
- `npm run export:rig`（`tools/export_rig_templates.mjs` + `tools/gen_rig_guide.mjs`、約10秒）: `docs/art_handoff/rig/layout_f|m.png`（枠・支点・パーツ名・薄い参考シルエット）、`layout_weapon.png`、
  `templates/<slot>/<style>_<g>.png`（その装備のコード描画を枠に分解して薄く）、`templates/body|weapon|tear/...`、`parts.json`（使う枠）→ 指示書と CSV。
  `--fake=<dir>` で「AIが描いた」とみなせる仮の絵（コード描画のパーツを不透明で）と manifest を書き出す。ブラウザ内の描画は `tools/rig_page.js`（`window.RIGTOOL`）。
- `npm run test:rig`（`tests/rig_browser.mjs`）: 仮のAI画像（ずらし・拡大・透明/灰色の背景・持ち手の印）を page.route で差し込み、全状態×装備×♀♂×色×武器×破れをコード描画と画素で比較（差の平均 < 6%、関節の隙間 < 6%）、
  色替えの平均色、色違い専用の優先、ゲーム中・F2・NPC 不適用・AIの頭と一緒・フォールバック（rig 無し/素体無し/壊れた絵/読み込み中/一部だけ）・性能（10人）。スクショ `tests/screenshots/rig_*.png`。
  `tests/rig_unit.mjs`（Node、`npm run test:unit` に含む）: manifest の解釈・canvas 無しで例外なし・配置図の整合・基準色の網羅・初期装備が S。
- 制限: 腕・脚は1枚の絵を関節で折るだけ（曲げた時の形の変化・手の形（グー/パー/握り）・袖の破れで短くなる等の形の変化は無い）。向きは右向き1方向（背面のはしご登りは前向きの胴の絵を使う）。
  翼のはばたき・ネコミミの動き・天使の輪の上下・スカートのなびきは無い（コードの代用部品も休めの姿勢の静止画）。夜のリムライトは絵に入らない。読み込み時の前処理は1枚あたり数十〜百ms（着ている物だけ、1回だけ）。
  暗い基準色（黒レザー等）→ 明るい色、への色替えは陰影が浅くなりやすい（色違い専用の絵で対処）。
