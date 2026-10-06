# Codex へ：男性キャラの体つきの描き直し（21枚）

ゲームで男性キャラを見ると、体つきが女性に見えます。原因は男性用の胴と腰の画像です。

- 胸の谷間の線と、胸のふくらみの陰影がある
- 腰が細くくびれている
- お尻が肩より広い

男性らしい体つきに描き直してください。

## 今の形と目標（`ref/01_torso_width_now_vs_target.png`）

胴の枠（配置図の torso 枠）の中で、横幅を 3 か所で測った値です。左右の端から端までの幅で、男性の今の値は body_m で測っています。

| 場所 | 今の男性 | 今の女性（参考） | 男性の目標 |
|---|---|---|---|
| 肩 | 175px | 131px | **約 190px**（今より少し広く） |
| くびれ | 125px | 100px | **約 160px**（ほぼまっすぐな胴） |
| 腰・お尻 | 177px | 165px | **約 150px**（肩より狭く） |

- 形：肩が広く、腰に向かってややすぼまる逆三角形〜寸胴です。いまの砂時計形はやめてください。
- 胸：平らにしてください。胸筋は浅い陰影ていどにとどめ、谷間の線やふくらみの丸い陰影は入れません。
- 腰・お尻：丸みをなくして、まっすぐにしてください。股の位置は今と同じです。
- 首：今より少し太く、首の付け根も少し広くしてください。
- 雰囲気：ちびキャラ（MapleStory 風）のままです。ムキムキにする必要はありません。少年〜青年の普通の体格です。
- 添付の参考：
  - `ref/02_ingame_male_now.png`：今のゲーム内の男性（服 11 種）
  - `ref/03_jin_fullbody_now.png`：ジン

## 変えないでほしいところ（リグが動かなくなるため）

- 配置図の枠の位置、各パーツの支点
- 首の付け根の高さ、腕の付け根（肩関節）の高さ、股の高さ
- 腕・脚・足のパーツ。形の問題は胴だけなので、腕と脚は今のままで大丈夫です。
- ファイル名・大きさ（1024×1024 透過 PNG）・基本の色（色替え用）
- 女性用（`*_f.png`）は変えないでください。

## 描き直す画像（男性用・21枚）

### 素体（1枚）

- `rig/body_m.png`：胴の部分を描き直してください。下着のタンクトップと短パンはそのままです。

### 上着の胴の部分（12枚）

袖・腕の部分はそのままでかまいません。

- `rig/top/tshirt_m.png`
- `rig/top/plainShirt_m.png`
- `rig/top/hoodie_m.png`
- `rig/top/hoodie__1d2b24_m.png`（緑ラインのパーカーの色違い専用画像。hoodie_m と同じ形に）
- `rig/top/leatherJacket_m.png`
- `rig/top/suit_m.png`
- `rig/top/police_m.png`
- `rig/top/hawaiian_m.png`
- `rig/top/tank_m.png`
- `rig/top/tracksuit_m.png`
- `rig/top/armorVest_m.png`
- `rig/top/idolDress_m.png`

### 下衣の腰回りの部分（8枚）

お尻の丸みをなくしてください。脚の部分はそのままでかまいません。

- `rig/bottom/jeans_m.png`
- `rig/bottom/plainPants_m.png`
- `rig/bottom/cargo_m.png`
- `rig/bottom/suitPants_m.png`
- `rig/bottom/trackPants_m.png`
- `rig/bottom/armorPants_m.png`
- `rig/bottom/shorts_m.png`
- `rig/bottom/skirt_m.png`

### 注意

- 素体と服の形がずれると、服から肌がはみ出します。
- 服は、新しい body_m の胴の輪郭を少し覆う大きさにしてください。
- 前回直してもらった肩口（hoodie_m・suit_m・police_m の手前の肩）は、今回も覆ったままにしてください。

## 納品

ZIP の中は `assets/sprites/rig/...` の同じ場所・同じ名前で送ってください。
こちらで検査・組み込みをして、歩き・攻撃・ジャンプを確認します。
