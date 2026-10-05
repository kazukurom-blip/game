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

### ② 頭 `heads`（前の頭＋後ろ髪。頭の配置図方式）
```json
"heads": { "luna_f": { "file": "heads/luna_f.png", "back": "heads/luna_f_back.png",
                       "expr": { "blink": "heads/luna_f_blink.png", "hurt": "heads/luna_f_hurt.png",
                                 "shout": "heads/luna_f_shout.png", "happy": "heads/luna_f_happy.png" },
                       "scale": 1.0, "offset": [0, 0], "facesLeft": false } }
```
- **頭の配置図**（`docs/art_handoff/rig/layout_head.png`、`rigLayout.js` の `HEAD_*`）: 1024×1024、1単位 = 10px、支点 = 頭の中心 (512, 400)。
  目安: 頭頂 y=220（-18）、目 y≈450（+5）、顎 y=560（+16）、肩 y=600（+20）、腰 y=800（+40）。( ) は頭の座標（単位）。足裏から頭の中心 = 66（骨格 v2）。
- **前の頭**（`file` と表情 `expr`）: 顔・前髪・頭頂の髪だけ。右向き（斜め前）。**後ろ髪**（`back`、表情なしの1枚）: ツインテール・ポニーテール・後ろの髪。どちらも同じ配置図の位置で描く。
  ネコミミ・鈴・帽子・ヘッドホンは描かない（帽子の装備として上に重ねる）。描く人向け: `docs/art_handoff/HERO_PROMPTS.md`「② 前の頭」「③ 後ろ髪」、下絵 `rig/templates/head/<key>.png` / `<key>_back.png`。
- 置き方 `fit`（各項目。既定 false）: false = 配置図のまま（自動フィットしない。絵の切り抜き位置から頭の座標の置き場所 `place` を計算）。
  true = 旧方式（首から上を画像いっぱいに描いた絵を、範囲 46×58 に収める。後ろ髪は使えない）。fit:false でも絵が正方形でなければ警告して旧方式で置く（互換）。
- 頭の位置・傾きは毎フレーム `charHeadPose()`（コード描画の体）/ リグの頭の座標（骨格 v2）に合わせる。`scale`（頭の中心を基準）/ `offset`（単位）で微調整。
- 後ろ髪は体の後ろ（前向き: 翼・マフラーの端の前、フード・後ろの腕の後ろ）に頭の座標で描き、二次運動を付ける: 結び目（`HEAD_BACK_PIVOT` = 頭の座標 (0,-6)）を中心に
  `rotate(hairSway*0.075 + hairLift*0.05)`（±0.18 rad まで。歩き・被弾で遅れて揺れる）、ジャンプ（hairLift）で縦に 8% 縮めて横に 3% 広げる（ふわっと上がる）。
  背面（はしご）は頭のシルエットの上に後ろ髪。かぶる帽子は前の頭と同じ clip（つばより上・帽子の外の髪を隠す）。人型レイヤー（`chars`）で描く時は揺れ無し。
- 表情: blink（まばたき）、hurt（被弾）、shout（攻撃）、happy（レベルアップ等）。無ければ基本の絵。
- キャラ作成で「AIの顔を使う」を選んだキャラだけに適用（`state.look.aiHead = true`。既定は、画像があれば true）。髪型・髪色の選択はこの場合は無効（絵の髪になる）。

### 実装メモ（src/render/sprites.js / character.js）
- 読み込み: `portraits` / `heads` の各項目（文字列、または `{ file, expr: {名前: ファイル}, back, fit, scale, offset, facesLeft, bgRemove }`）を1枚絵として扱う（背景除去・トリミングは1枚絵モードと同じ `prepSingle`。切り抜き前の位置 `ox/oy/cw/ch/srcW/srcH` も残す）。読み込み時に立ち絵は高さ720px、頭は320px（配置図方式の頭・後ろ髪は420px）まで半分ずつ縮小（毎フレームの drawImage を軽くする）。不正なパスの項目は無視。項目を最初に使った時に、その人の表情の絵・後ろ髪もまとめて先読み（`preloadSprites` も後ろ髪を含む）。
- API（sprites.js）:
  - `portraitFor(classId, gender, expr)` / `headFor(classId, gender, expr)` → `{ canvas, w, h, expr, file, scale, offset, facesLeft, fit, place, back }` | null（頭: `place` = 配置図方式の置き場所 [x, y, w, h]（頭の座標の単位）、`back` = 後ろ髪 `{ canvas, w, h, place }` | null（無い・読み込み中））（無い・読み込み中・壊れている・spriteMode=procedural）。`classId` に `'luna_f'` や look（`classId`・`gender` を持つ）も可。表情が無ければ別名（smile↔happy, shout↔angry, surprised↔hurt）→ 基本の絵。
  - `drawPortrait(ctx, key, expr, x, y, h, opts)` → 描いた矩形 | null。`opts.anchor`: `'foot'`（既定・足元中央）/ `'center'`、`crop: [u0,v0,u1,v1]`（0..1 の切り出し）、`maxW`、`flip`、`alpha`、`dim`（0..1 暗く）、`flash`。
  - `hasHeroArt('portraits'|'heads', classId, gender)`（manifest にあるか）/ `heroArtState(...)`（0 無し / 1 読み込み中 / 2 完了 / 3 失敗）/ `headBackOf(head)`（背面用シルエット）。
- 頭の差し替え（character.js）: `aiHeadOf(look, anim, state, t)` が `look.aiHead !== false` かつ `look.classId`・`look.gender` あり（悪役・テンプレート書き出し（onlyLayers）中は除く）で頭の絵を返す。`renderChar` は K.ai があれば後ろ髪・耳・顔・前髪・眉・頬・煤を描かず、頭の座標系（`charHeadPose` と同じ `enterHead`）に `paintAiHead` で絵を置き、マスク・サングラス・帽子・汗・天使の輪を上に重ねる。かぶる帽子（cap/beanie/bandana/helmet/cowboy）はつばの線より上・帽子の外の部分を clip で隠す。背面（climb）はシルエット。被弾の白フラッシュは白いシルエット。
  - 置き方（`paintAiHead(ctx, h, hat, back, flash, frame)` / 後ろ髪 `paintAiHeadBack(ctx, h, hat, P, flash, frame, backView)`）: frame = 'code'（コードの体の頭の座標: 中心から 髪の上端 約 -25・顎 +15.5）| 'rig'（骨格 v2 の頭の座標 = 配置図の単位: 頭頂 -18・顎 +16）。
    2つの座標は `RIG_CODE_HEAD`（y_rig = 2.4 + 0.88 × y_code）で行き来する。fit:false の絵は配置図の単位で `place` に描く（コードの体では 1/0.88 倍して顎・頭頂をコードの頭に合わせる）。
    fit:true（旧方式）は「高さ46・幅58」に収まる倍率 × `scale` で、中心をコードの頭の座標 (1.1, -3) + `offset` に置く。`facesLeft` なら左右反転。
  - 表情 `aiHeadExpr(state, t, anim)`: dead/panic→hurt、`anim.headExpr`（プレイヤーはレベルアップ・転職・ボス撃破・ミッション達成・タワー階クリアで 1.8 秒 happy）、`anim.face`（happy/wink→happy, shout/angry→shout, sad→sad）、attack/shoot→shout、hurt→hurt、cheer→happy、idle/sit のまばたき（コードの目と同じ周期 4.8 秒中 3.82〜4.0 秒）→blink、他は基本。
  - 2xキャッシュのキーに使う絵のファイル名（＋後ろ髪の有無）を含める（読み込み前はコード描画のキー → 読み込み完了で別のキー＝自動で作り直し）。`boxOf` は頭の絵の `scale`/`offset`（配置図方式は `place` と後ろ髪の範囲）に合わせて広げる。
  - 人型レイヤー（`chars`）のスプライトで描く時も、頭の絵があれば hair_back の位置に後ろ髪（`aiback` レイヤー）、face の位置に前の頭（`aihead`）を置く（hair_front は描かない）。
  - look.classId / look.gender: `progression.newState` / 旧セーブの補完（`tagHeroLook`）と `player.heroLookOf` が state.heroId / state.gender から**列挙されないプロパティ**として付ける（セーブ・見た目の比較には出ない）。NPC・敵・市民の look には付かない → 適用されない。タイトルのプレビューは classId・gender を付けたコピーで描く。
- 立ち絵の使い場所:
  - 会話窓（windows.js）: 行の先頭が `@me:` / `@hero:`（全角コロン可）の行は主人公のセリフ（名前プレートが主人公の名前、左の枠に立ち絵の上の方を枠の縦横比で切り出し。立ち絵が無ければ主人公のちびキャラ）。それ以外の行では窓の右上に主人公の立ち絵（顔欄。相手が話している間は少し暗く、選択肢の時は明るく）。表情: 報酬=smile、「！？」=surprised、「…」で始まる=sad、「♪/ありがと/やった」=smile。
  - キャラ選択の詳細・キャラ作成のプレビュー（title.js）: 立ち絵があればコード描画のキャラを少し小さくして左へ、立ち絵を右に並べる（作成の攻撃ポーズ中は shout、名前の段階は smile）。
  - カットイン（cutin.js）: 立ち絵があれば上の方（高さ＝幅×0.75。腰上なら顔〜肩、全身なら顔〜胸）を帯の中に拡大。`pushCutin(game, { expr })`（既定 shout、転職のカットインは smile）。無ければ今まで通りコード描画の顔アップ（`spriteRev` が変わったら作り直す＝頭の絵の読み込み完了も反映）。
  - 転職の祝福演出（hud3.js）: 左に笑顔（smile）の立ち絵を並べる。中央のキャラは happy。
- テスト: `node tests/hero_art_browser.mjs`（`npm run test:heroart`。仮のAI画像を canvas で生成して page.route で差し替え。スクショ `tests/screenshots/heroart_*.png`）、`tests/sprites_unit.mjs`（Node: 読み込み・不正な項目・表情の選び方・NPC に適用しない）。
- 制限: 頭の絵は1方向（右向き）だけ。背面はシルエット＋後ろ髪。サングラス・マスク・帽子はコードの顔・頭の位置と大きさ（配置図の頭頂・顎の線に合わせて描けば合う。合わなければ offset）。服破れの煤・絆創膏は頭の絵には付かない。後ろ髪の揺れは絵全体を結び目で回すだけ（毛先だけ曲がる動きは無い）。


## リグ（パーツ式の着せ替え人形。主人公用・画像生成AI向け）
主人公の体・服・武器を「パーツの絵」で組み立てて、関節の回転で動かす。AI は**配置図の枠の中に描く**だけ（コマ割り不要）。頭は `heads`（前の頭＋後ろ髪。無ければコードの頭）。
絵柄の基準は承認済みの見本 `docs/art_handoff/style/luna_f_reference.png`（正面寄り・腕を曲げたポーズの見本。パーツは右向き斜め前・腕脚まっすぐで描く）。
描く人向けの説明・1枚ごとの指示文: `docs/art_handoff/HERO_PARTS_GUIDE.md`（一覧 `HERO_PARTS_LIST.csv`。全 90 枚: S 24 / A 35 / B 31）。

- 実装: `src/render/rigLayout.js`（配置図・基準色・グループ）、`src/render/rig.js`（読み込み・切り出し・位置合わせ・色替え・合成・プラン）、
  `src/render/character.js`（`renderRig` = リグで描く、`renderRigCode` = コード描画を休めの姿勢でパーツに分けて描く、`renderRigWeapon`）。
- 入口: `drawCharacter` の先頭で `rigPlanFor(look, equip)`。プランがあれば既存の 2x キャッシュ・半透明・オーラ・斬撃/ホロのライブ描画の経路のまま、描画関数だけ `renderRig` に替える（キャッシュのキーに `|G<rev>`）。
  無ければ今まで通り（人型レイヤー `chars` → コード描画）。`anim.noRig` でリグを使わない（テスト・見比べ用）。

### 骨格 v2（リグ専用。`rigLayout.js` の `RIG_PROFILE` / `RIG_Y` / `RIG_LIMBS`）
見本の頭身（頭頂〜足裏 1105px で 頭 約40%・胴 約28%・脚 約28%・靴が大きい）に合わせた、主人公のリグだけの寸法。**NPC・敵・市民のコード描画（`BODY`）は変えない**。
| 足裏からの高さ（単位） | 足裏 0 | 足首 6 | 膝 15 | 股 24 | 腰 26 | 肩 46 | 首 48 | 顎 50 | 頭の中心 66 | 頭頂 84 |
|---|---|---|---|---|---|---|---|---|---|---|
- 上半身の座標（股 = 原点 `hipY = -24`）: 肩 -22、首の付け根 -24、顎 -26、頭の中心 -42。腕 = 上腕 9 ＋ 前腕（手の中心まで）9、脚 = 太もも 9 ＋ すね 9。
  ♂は `BODY.m` の肩幅・胸板に加えて肩の半幅 11.4・肩の位置 9.6・腕の太さ 6.4/5.7。頭の座標は縮尺 1（`BODY.head` を掛けない）。
- character.js: `RIG_B`（`BODY` ＋ `RIG_LIMBS`）、`makeK(..., rig=true)` で `K.B`・`K.shY`（肩）・`K.headY`（頭の中心）・`K.rig`。`enterHead` は `K.headY`、`enterCodeHead` はコードの頭・帽子・汗を
  `RIG_CODE_HEAD`（`translate(0, 2.4) scale(0.88)`）で v2 の頭（頭頂 -18・顎 +16）に置く。ポーズ（`makePose`）はコード描画と同じ。斬撃（`liveFx`）も v2 の肩から。
- 絵が無い装備の代用（`renderRigCode`）も v2 で描く: 腕・脚は v2 の長さ、胴・背中はコードの絵の y > -4 はそのまま・それより上を縦に 1.33 倍（`RIG_STRETCH`。旧い肩 -17.5 → -22。
  首は顎の 3 上で切る）、靴は足首を中心に 1.3 倍して 2.36 下げる（`RIG_FOOT`。靴底が足首から +6）、頭の物（帽子・メガネ・マスク・天使の輪）は `RIG_CODE_HEAD`。
  頭の配置図用に `group = 'headFront' | 'headBack'`（コードの前の頭 / 後ろ髪だけ）と `opts.frame = 'head'`（支点 `opts.px/py`）。
- 当たり判定（幅32×高さ70）・頭上の表示（ダメージ数字 = 足元から 当たり判定の高さ＋8）は変えていない。絵の背丈は 84＋髪・帽子（今のコードの絵 約80 と同じく当たり判定より上にはみ出す）。

### 配置図 v2（♀♂共通 1024×1024、1単位 = 8px）
| 枠 | 左上 x,y（px） | 幅×高さ（px） | 支点 x,y（px） | 局所座標の範囲（単位） | 付く座標系 |
|---|---|---|---|---|---|
| head | 16, 16 | 512×432 | 272, 288 | x -32..32, y -34..20 | 頭（v2 の頭の座標。頭頂 -18・顎 +16） |
| back | 560, 16 | 448×448 | 880, 432 | x -40..16, y -52..4 | 上半身（翼・フード・スカーフの端） |
| torso | 16, 500 | 320×384 | 176, 756 | x -20..20, y -32..16 | 上半身（`translate(hx, hipY+bob) rotate(tilt)`）。肩 -22・顎 -26 |
| armB / armF | 356 / 488, 500 | 112×232 | 412 / 544, 540 | x -7..7, y -5..24 | 上半身。肩（`K.shY`、ひねりで左右に動く）。肘 = 支点から 9、手の中心 = 18 |
| legB / legF | 620 / 768, 500 | 128×224 | 684 / 832, 540 | x -8..8, y -5..23 | 足元。股（±legX）。膝 = 支点から 9、足首 = 18 |
| footB / footF | 356 / 544, 752 | 168×136 | 420 / 608, 824 | x -8..13, y -9..8 | 足首で `rotate(-(脚の角度)*0.85)`。靴底 = 支点から +6 |
- 枠の位置（px）は `RIG_PARTS[name].x/y/w/h`、支点 `px/py`（`npm run export:rig` が `docs/art_handoff/rig/layout.json` にも書き出す）。武器は別の配置図 1024×512（1単位 = 16px、持ち手 = 支点 (240,256)、右向きに水平）。
  頭（前の頭・後ろ髪）は頭の配置図 1024×1024（1単位 = 10px、支点 (512,400)）。旧い配置図 v1 の枠は `RIG_PARTS_V1`（`layout: 1` の古い絵の読み込みだけに使う）。
- 腕・脚は「まっすぐ下」の1枚。描く時に関節の行で上下2つに分け（重なり 1.15 単位）、下は関節で `-(a+e)`、上は付け根で `-a` 回し、曲がりが大きい時は中間の角度の帯で外側の隙間を埋める。
  手前の手（支点から upper+fore の丸、半径 3）は武器の上にもう一度描く（握っている見た目）。合成時にも袖の上に手を重ねる。
- 重ね順（前向き）: 影 → [上半身] back(アクセ) → 後ろ髪（AIの後ろ髪 or コードの後ろ髪）→ back(上着のフード) → 後ろ腕 → [足元] 後ろ脚・後ろ足・前脚・前足 → [上半身] 胴 → 前の頭（AIの頭 or コードの頭）＋頭の物（メガネ/マスク → 帽子） → 汗 → 前腕 → 武器 → 手 → 斬撃/ホロ。
  背面（climb）: 脚 → 胴 → フード・翼 → 頭の背面（AIの頭のシルエット＋後ろ髪 or コードの後ろ頭）＋帽子 → 両腕（前）。倒れる（dead）はコードと同じく全体を回す。

### ファイルと manifest
```json
"rig": { "enabled": true, "defaultWear": true, "fit": false,
         "parts": { "body_f": true, "body_m": true, "top/hoodie_f": true, "top/hoodie__1d2b24_f": true,
                    "weapon/knife": true, "shoes/boots_m": { "fit": true }, "tear/1_f": true } }
```
- 値は配列（ファイル = `rig/<キー>.png`）か、`{ "<キー>": true | "rig/...png" | { "file", "base", "accent", "fit", "layout", "recolor", "bgRemove" } }`。
  `npm run rig:manifest`（`tools/rig_manifest.mjs`）が `assets/sprites/rig/` を見て書き直す（既存の指定は残す。rig を新しく作る時は `"fit": false`）。
- **`view`**（rig 節）: `"3q"` = 右向き斜め前（体の右半身が手前。手前の腕 armF・脚 legF を画面の左側＝背中側に付けて胴の前へ、奥の腕・脚を顔の向きの側に付けて後ろへ）。配置図 v2 の既定。`"front"` = 正面の旧い重ね方。
- **`fit`**（rig 節 = 全体の既定、各パーツで上書き）: `false` = 配置図 v2 の枠・支点の位置のまま正確に組む（新しい配置図で描いた絵。支点に関節が来る前提）。
  `true` = 枠の中の絵の範囲を、同じ物のコード描画（v2）の範囲に自動で合わせる（ずれた絵）。武器は `fit:false` のとき持ち手のマゼンタ印が必須（無ければ警告して自動フィット。`rigStats().fitFallback`）。
- **`layout`**（全体の既定、各パーツで上書き）: `2` = 配置図 v2、`1` = 旧い配置図（旧い頭身。必ず自動フィットで v2 の骨格に合わせる）。
  既定は「rig 節に `fit` も `layout` も無ければ 1（前からある manifest の互換）、どちらかがあれば 2」。`rigStats()` に `fit` / `layout`。
- キー: `body_<g>`（素体＝肌＋インナー＋室内靴。**無ければリグは使わない**）、`<slot>/<style>_<g>`（slot = top / bottom / shoes / hat / accessory）、
  `<slot>/<style>__<rrggbb>_<g>`（色違い専用。その色のアイテムで優先）、`weapon/<style>`・`weapon/<style>__<rrggbb>`（性別共通）、`tear/<1|2|3>_<g>`（服破れの重ね、HP 75/50/25% 以下）。
  性別を省いた `<slot>/<style>` も可（♀♂共通）。
- グループ → 枠: body = 胴・腕・脚・足、top = 背中・胴・腕、bottom = 胴・脚、shoes = 足、hat = 頭、accessory = 頭/背中/胴（種類ごと `RIG_ACC_PARTS`）、tear = 胴・腕・脚。
- 何も装備していない top/bottom は、今と同じ白Tシャツ・青の短パン（`tshirt`/`shorts` の絵 → 無ければコード）。`defaultWear: false` なら素体のまま。靴が無い時は素体の足。
- 主人公（look に `classId` がある）だけ。悪役・NPC・市民には使わない（`heroesOnly: false` で classId の無い look にも）。spriteMode=procedural（F2）で使わない。

### 読み込み・切り出し・位置合わせ
- 絵を配置図の大きさ（1024×1024 / 武器 1024×512）に拡大縮小（正方形でなければ警告）→ 背景の自動透明化（`removeBg`、1枚絵と同じ。四隅が同じ色なら塗りつぶして消す）→
  縁のにじみ取り（透明に接する、背景色と輪郭線 #2A1430 の中間の画素を、線の色＋半透明に）。
- 4px のブロックで連結成分（塊）を作り、一番重なる枠（枠から 44px まで広げた範囲。layout 1 は旧い枠 `RIG_PARTS_V1`）に割り当てる（小さなゴミ、枠の外の小さな塊＝写った文字・点線は捨てる）。
- 位置合わせ: そのシートと同じ物のコード描画（基準色・休めの姿勢）の、同じ枠の不透明範囲に合わせる。拡大率は 腕・脚・胴 = 高さ、足 = 幅、頭・背中 = 面積（0.8〜1.25 に制限、±3% 未満は 1）。
  合わせる点: 腕・脚 = 上端の中央（肩・股）、足 = 下端の中央、他 = 中心。コード描画に中身が無い枠や `fit: false` は枠の位置のまま（拡大縮小もしない）。
- 武器: マゼンタ（#FF00FF）の印があればそこを持ち手に（印は消す）。fit:false は印の位置・描いた大きさのまま。fit:true（または印の無い fit:false）は拡大率を幅（0.6〜1.6）で、印が無ければ左端と上下の中央をコードの武器に合わせる。
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
- 絵の無い装備: その装備だけ `renderRigCode`（今のコード描画を休めの姿勢・骨格 v2・その色・その破れの段階で描いてパーツに分けたもの）で代用（LRU 60）。
  `rigCodePlanFor(look, equip)`（character.js の `rigCodePlanOf`、`anim.rigCode = true`）: 絵を1枚も使わず素体も含めて全部コードの代用で組んだプラン（v2 の見本・テストの基準）。武器の絵が無ければ手の位置にコードの `drawWeapon`。
  絵の無い破れ: コード描画の破れ（上着・下のスタイルごと）。銃口の火花・杖の光はコードで武器の絵の上に。
- 白フラッシュ: パーツごとに白く塗った版（キャッシュ）。半透明・オーラ・左右反転・拡大縮小は既存の経路のまま。

### テンプレート・テスト
- `npm run export:rig`（`tools/export_rig_templates.mjs` + `tools/gen_rig_guide.mjs`、約15秒）: `docs/art_handoff/rig/layout_f|m.png`（枠・支点・パーツ名・肘/手/膝/足首/靴底/肩/顎の目安線・薄い参考シルエット）、`layout_weapon.png`、
  `layout_head.png`（頭の配置図: 支点・頭頂/目/顎/肩/腰の線・前の頭の枠）、`templates/head/<cls>_<g>.png` / `_back.png`（キャラ別の前の頭・後ろ髪の下絵）、`layout.json`（枠・支点の表）、
  `templates/<slot>/<style>_<g>.png`（その装備のコード描画を枠に分解して薄く）、`templates/body|weapon|tear/...`、`parts.json`（使う枠）→ 指示書と CSV。
  `--fake=<dir>` で「AIが描いた」とみなせる仮の絵（コード描画のパーツ・頭を不透明で。武器は持ち手の印付き）と manifest（`fit:false`・heads の back 付き）を書き出す。ブラウザ内の描画は `tools/rig_page.js`（`window.RIGTOOL`。`fakeOld` = 旧い配置図の位置に移した古い絵の代わり）。
- `npm run test:rig`（`tests/rig_browser.mjs`）: 仮のAI画像（下絵そのもの。一部はずらし・拡大して fit:true、透明/灰色の背景、持ち手の印あり/なし）を page.route で差し込み、
  全状態×装備×♀♂×色×武器×破れを「全部コードの代用で組んだリグ（`anim.rigCode`）」と画素で比較（差の平均 < 6%・関節の隙間 < 6%、ずらしていない fit:false の絵だけなら平均 < 2%・最大 < 5%）、
  持ち手の印が無い武器だけ自動フィットに戻る、色替えの平均色、色違い専用の優先、ゲーム中・F2・NPC 不適用、
  AIの頭（配置図方式の前の頭＋後ろ髪の位置・揺れ・重なり順、旧方式 fit:true・正方形でない絵）、旧い配置図の古い絵（layout 1）、フォールバック（rig 無し/素体無し/壊れた絵/読み込み中/一部だけ）・性能（10人）。スクショ `tests/screenshots/rig_*.png`。
  `tests/rig_unit.mjs`（Node、`npm run test:unit` に含む）: manifest の解釈・canvas 無しで例外なし・配置図の整合・基準色の網羅・初期装備が S。
- 制限: 骨格 v2 はリグ（主人公の絵が読み込まれた時）だけ。素体の絵が無い間・F2 のコード描画・NPC は今の体型（頭が大きく胴が短い）なので、絵の読み込み前後で背丈と頭身が変わる。
  腕・脚は1枚の絵を関節で折るだけ（曲げた時の形の変化・手の形（グー/パー/握り）・袖の破れで短くなる等の形の変化は無い）。向きは右向き1方向（背面のはしご登りは前向きの胴の絵を使う）。
  翼のはばたき・ネコミミの動き・天使の輪の上下・スカートのなびきは無い（コードの代用部品も休めの姿勢の静止画）。夜のリムライトは絵に入らない。読み込み時の前処理は1枚あたり数十〜百ms（着ている物だけ、1回だけ）。
  暗い基準色（黒レザー等）→ 明るい色、への色替えは陰影が浅くなりやすい（色違い専用の絵で対処）。
