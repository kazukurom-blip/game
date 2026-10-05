# NEON VICE STORY — アート申し送り書（キャラ・敵の見た目の差し替え）

外部のイラスト担当（人・別のAIどちらでも）向けの資料です。**これと同じフォルダの参考画像・`ASSET_LIST.csv`・テンプレート（`assets/sprites_template/`）だけで作業できる**ようにまとめています。

- ゲーム本体: HTML5 Canvas の 2D 横スクロール RPG。今の絵は**全部コードで描いた手続き描画**。
- 頼みたいこと: 主人公・敵・ボス・PET の見た目を **PNG のスプライトで描き直す**。描いた PNG を置くとゲームがそれを使い、無いものは今まで通りコードで描く（**一部だけでも差し替えられる**）。
- 仕組みの仕様: `docs/SPEC_SPRITES.md`（エンジニア向け）。この README は描く人向けに噛み砕いたもの。**食い違ったときはテンプレートの `manifest.json` が正**。

---

## 1. ゲームの概要とアートの方向性

| 項目 | 内容 |
|---|---|
| ジャンル | メイプルストーリー風の横スクロール狩り RPG × GTA 風の犯罪都市（手配度・車・警察） |
| 舞台 | 架空の州「ネオリダ」の港湾都市「ヴァイス・ベイ」。フロリダ風のヤシ並木・ビーチ・湿地・カジノ・摩天楼・宇宙港 |
| 時間帯の雰囲気 | ゴールデンアワー〜夕焼け〜ネオンの夜。空は「オレンジ→ピンク→パープル」。差し色はネオン桃 `#FF4FA0` とネオン青緑 `#3EE6D2` |
| キャラの絵柄 | **ちびアニメ調・約 2.5 頭身**。頭が大きく（全身の約 40%）、手足は短い。大きな瞳とハイライト、頬の赤み |
| トーン | **かわいい・かっこいい**。陽気なクライムコメディ。**全年齢**（流血・露出・性的表現なし） |
| 線 | 外側の輪郭は太め（画面上 2〜2.5px ＝ 2 倍描きで 4〜5px）、色は純黒ではなく**濃い紫黒 `#2A1430`**。内側の細線は `#3A1C40` |
| 塗り | セル塗り（ベタ影 1〜2 段、光源は左上）。影側の縁にネオンのリムライトを入れると世界観に合う |
| 敵 | モンスターは「丸いシルエット＋大きな目＋頬の赤み」でかわいく。ギャング・警官は同じちび体型にサングラスや眉の角度で「悪そう／かっこいい」 |
| ボス | 通常の敵より大きく、オーラ・王冠・小物で格を出す。HP 50% 以下で**第2形態**（怒り顔・色や発光の変化） |

### 著作権について（必ず守る）
- **完全オリジナル**で描くこと。既存のゲーム・アニメのキャラ、ロゴ、固有デザインに似せない。
  - 特に GTA の主人公・地名・ロゴ、メイプルストーリーの「スライム」「オレンジキノコ」「メイプルリーフ」等の固有デザインは使わない。本作のスライムは「サングラスのネオンゼリー」、キノコは「ネオン傘・ビーチパラソル傘」など**独自形状**。
  - 実在のブランド・アプリ名・ロゴ（SNS、車メーカー、飲料など）を描かない。看板やロゴは架空のものに。
- 参考にしてよいのは「雰囲気」と「仕組み」だけ。ネット上の画像をトレース・コラージュしない。
- AI で描く場合も、特定作品・作家名を指定したプロンプトは使わない。

---

## 2. 納品形式（描く人向けのまとめ）

### 2-1. フォルダとファイル名
納品先は `assets/sprites/`。**ファイル名はテンプレート（`assets/sprites_template/`）と同じ**にする。全ファイルの一覧は `ASSET_LIST.csv`（下の §4 にも表）。

```
assets/sprites/
  manifest.json                         … どの画像を使うか（テンプレートの manifest.json をコピーして使う）
  enemies/<敵ID>.png                    … 通常の敵 1種 = 1枚（例 slime_green.png）
  bosses/<ボスID>.png                   … ボス（第2形態の行を含む）
  pets/<PETスタイル>.png                … PET（例 catPet.png）
  chars/                                … 人型キャラ（主人公・人型の敵）は「部品の重ね合わせ」
    body_f_gray.png / body_m_gray.png   … 素体（奥の腕・胴・脚。インナー込み）
    arm_f_gray.png  (+ arm_f__gun / __melee / __magic) … 手前の腕（武器の持ち方で 4 種）
    face_f.png / face_m.png             … 顔（目・眉・口）。行 = 表情。瞳の色まで描く
    face_f__19f0ff.png など             … 瞳の色ごとの顔（その瞳の色のキャラで優先して使う。初期キャラの瞳色ぶん）
    hair/<髪型>_back_<f|m>_gray.png     … 後ろ髪
    hair/<髪型>_front_<f|m>_gray.png    … 前髪
    equip/<部位>/<スタイル>_<f|m>_gray.png        … 装備（hat / top / bottom / shoes / accessory / weapon）
    equip/top/<スタイル>_sleeve_<f|m>[__gun|__melee|__magic]_gray.png … 上着の手前の袖
    equip/accessory/<スタイル>_back_<f|m>_gray.png … アクセサリーの背面パーツ（翼など）
    equip/<部位>/_default_<f|m>.png     … 何も装備していないときの服（Tシャツ・短パン・靴）
    tear_1_<f|m>.png / tear_2_… / tear_3_… … 服破れの重ね（HP 75/50/25% 以下）
```
- `_f` は♀の体、`_m` は♂の体用。同じ装備でも体形が違うので別ファイル。
- **`_gray` が付いているファイルはグレースケールで描く**（ゲームが色を付ける＝tint、§2-4）。付いていないファイルは色まで描く。
- tint するレイヤーの多くには、同じ名前で `_gray` の無い**色付き版（plain）**もある（例 `body_f.png`、`equip/top/hoodie_f.png`）。ゲームは「色が既定色と同じとき」だけ plain をそのまま使う（初期キャラ・既定色の装備がきれいに出る）。**必須はグレー版、plain は任意**（描くと既定色の見た目が一段よくなる）。CSV の備考に plain のファイル名と既定色を書いてある。
- テンプレートには同名の `_guide.png`（セル枠・基準点・行名・コマ番号入り）もある。描くのは**ガイド無しの方**（`_guide` は見本）。

### 2-2. シートのルール（全種共通）
| ルール | 内容 |
|---|---|
| 1枚の並び | **行 ＝ 状態（idle, walk …）、列 ＝ コマ**。左上から詰める。行の順番は manifest の `rows` の順（テンプレートと同じ） |
| セルの大きさ | **ファイルごとに違う**（テンプレートが絵の大きさに合わせて切り詰めている）。`ASSET_LIST.csv` の「セル」列、または manifest の `cell`。**変えない**（変えるなら manifest も直す） |
| 描く倍率 | **ゲーム画面の 2 倍**で描く（ゲームが 0.5 倍で表示）。主人公は画面上 約 80px → 絵は約 160px |
| 向き | **右向き**で描く（左向きはゲームが反転） |
| 基準点 | `anchor`＝**足元**（人型・敵・PET）。顔だけは**頭の中心**。テンプレートの桃色の十字の位置。各ファイルの値は CSV の備考「基準点 x,y」 |
| 背景 | **透明**（PNG のアルファ）。白背景・影の地面は描かない（足元の丸い影はゲームが描く） |
| はみ出し | セルの外にはみ出した分は切れる。武器の振り・髪の揺れも枠内に |
| HP バー・名前札・ダメージ数字・オーラの光 | ゲームが描く。**描かない** |

### 2-3. 行（状態）とコマ数
| 種類 | 行（状態）とコマ数 | 補足 |
|---|---|---|
| 人型の部品（素体・髪・装備・服破れ） | idle(6) walk(8) jump(2) climb(4) attack(6) shoot(4) hurt(2) dead(4) drive(1) sit(1) ＋ attack_melee(6) attack_magic(6) | climb は**背面**（はしごを登る後ろ姿）。shoot は銃、attack_melee は近接武器、attack_magic は杖を持ったときの攻撃。drive は車の運転席に座った姿 |
| 手前の腕・袖・武器 | idle(6) … sit(1)（上の 10 行） | 武器の持ち方ごとに `__gun / __melee / __magic` の別ファイル |
| 顔 face | neutral smile shout hurt happy jito angry sad wink blink dead aim panic（各 1 コマ） | §6 表情一覧 |
| 敵 | idle(4) walk(6) windup(2) attack(4) hurt(2) dead(4) | windup ＝攻撃前の溜め（予告）。飛ぶ敵は walk 行に飛行モーション |
| ボス | 敵と同じ ＋ 第2形態 idle2(4) walk2(6) windup2(2) attack2(4) | HP 50% 以下で `…2` の行を使う（無ければ通常の行） |
| PET | idle(4) walk(6) fly(4) pick(4) | pick ＝アイテムを拾って喜ぶ |

コマ数は推奨。増減するときは manifest の `rows` の数字も合わせる。再生速度（fps）は manifest にある（人型 idle は 2.5fps と遅め、walk は 13fps）。

### 2-4. tint（色付け）用はグレースケールで描く
髪色・肌色・装備の色はプレイヤーやアイテムで変わるので、**明るさだけのグレースケールで描き、ゲームが掛け算で色を付ける**。
- **白 = その色そのもの（いちばん明るい）**、グレー = 影、濃いグレー = 濃い影。黒に近い所は黒っぽくなる。
- 線（輪郭）は濃いグレー〜黒でよい（掛け算でほぼ黒のまま）。
- 目安: 基本の塗り = 白〜明るいグレー（#E0E0E0 前後）、1 段目の影 = #A8A8A8、2 段目の影 = #787878、輪郭 = #303030。
- `_gray` のテンプレートが、今の絵をこの方式でグレーにしたもの。明るさの配分の参考に。
- 現状の注意:
  - **1 ファイルに付く色は 1 色（装備の「主色」）だけ**。差し色（accent）の部分も主色に引っ張られる（色で描いても、その色に主色が掛け算される）。
  - 掛け算なので**暗い主色（黒レザー `#1D1D24` など）は真っ黒に潰れやすい**。グレー版はハイライトを強め（白に近い光沢・明るいエッジ）に描き込むか、色付きの plain 版を描く。
- tint が付かないファイル（顔・服破れ・敵・ボス・PET・`_default`）は**色まで描く**。

### 2-5. 人型の重ね順（下 → 上）
```
accessory_back（翼など背面） → hair_back（後ろ髪） → body（素体: 奥の腕・胴・脚） → bottom（下衣） → shoes（靴）
→ top（上着） → tear（服破れ） → face（顔） → hair_front（前髪） → accessory（サングラス・チェーン等） → hat（帽子）
→ arm（手前の腕） → sleeve（手前の袖） → weapon（武器）
```
- 各部品は「その部品だけ」を描く。**下の部品に隠れる部分は描かなくてよい**が、上の部品で隠れる部分は描いておく（装備を外したときに穴が開かないように）。
- 素体には**インナー（濃い紫グレーのタンクトップ＋スパッツ）**を必ず描く。服を全部外しても・破れてもこれが残る（全年齢）。
- 顔はゲームが頭の位置・傾きに合わせて動かす（charHeadPose）ので、**頭の中心を基準点**にして正面の表情だけ描く（テンプレートの顔シートは頭の座標系で書き出してある）。climb（背面）では顔は出ない。
- テンプレートの各レイヤーは「完成形で見えている部分」だけ（他の部品に隠れる所は抜いてある。例: 上着は手前の腕の所、前髪は眉の所）。

---

## 3. 差し替えの手順

1. **テンプレートを開く**: `assets/sprites_template/`。描くファイルと、同名の `_guide.png` を並べて見る。
   - git に入っているのは `manifest.json`・`presets/`・`pets/` だけ。**残り（chars・enemies・bosses と `_gray`・`_guide`）はプロジェクトで `npm run export:sprites` を実行して生成**する（約 80 秒、全部で約 320MB。`--no-guides` でガイド無し＝約半分）。Node と Playwright が必要。
   - **外部の担当に渡すとき**は、生成した `assets/sprites_template/` フォルダを **zip にして**、この `docs/art_handoff/` フォルダ（README・CSV・参考画像）と一緒に渡す。描く人は Node 等の環境が無くても作業できる。
2. **上から描く**: テンプレートの PNG を下絵（別レイヤー）にして、同じセル・同じ基準点で描き直す。完成したら下絵を消して**透明背景の PNG** で書き出す（キャンバスの大きさはテンプレートと同じ）。
3. **同名で置く**: `assets/sprites/` の同じパスに置く（例 `assets/sprites/enemies/slime_green.png`）。
4. **manifest.json を用意する**:
   - 初回は `assets/sprites_template/manifest.json` を `assets/sprites/manifest.json` にコピー。
   - **敵・ボス・PET**: 描いた分だけ manifest に残す（無い項目はコード描画に戻る）。manifest のキーに art 名（例 `"slime": { "file": "enemies/slime_green.png", … }`）を書くと、同じ art の敵すべてにそのシートが効く。
   - **人型（chars）**: 部品が 1 つでも欠けるとその部品が描かれない（例: 帽子の画像が無いと帽子が消える）。なので、**テンプレートの chars フォルダを丸ごと `assets/sprites/chars/` にコピー**してから、描いたファイルで上書きする（未着手の部品はテンプレート＝今の見た目のまま動く）。人型をまだ使いたくない間は `"chars": { "enabled": false, … }`。
   - セルやコマ数を変えたら、その項目の `cell` / `anchor` / `rows` を直す。
5. **ブラウザで確認**: `npm run serve` → http://localhost:8080/ 。（manifest を書き換えたらリロード）
6. **F2 で見比べ**: F2 のデバッグパネル「見た目: スプライト / コード描画」で切り替えて比べる。読み込み数・失敗数もパネルに出る。

**一部だけ差し替えて OK**。例えば「ボス 1 体だけ」「主人公の素体と髪だけ」でもゲームは動く。

---

## 4. 納品物チェックリスト

優先度の考え方:
- **S** … 主人公 3 クラス×♂♀の素体・手前の腕・顔・初期髪型・初期装備（＋その手前の袖）、ボス 7 体
- **A** … 各地域の代表的な敵（art ごとの代表 1 体）、PET 10 種、人気装備、初期髪型の反対の性別版、服破れ、未装備時の服
- **B** … 残りの敵と装備・髪型

全件の詳細（行・セル・基準点・tint・色違いのアイテム ID）は **`ASSET_LIST.csv`**（Excel で開ける）。データが増えたら `node tools/gen_asset_list.mjs` でこの表と CSV を作り直せる。

<!-- ASSET_TABLE:BEGIN -->
**総数 371 ファイル**（S: 68 / A: 124 / B: 179）— `node tools/gen_asset_list.mjs` で自動生成（テンプレートの manifest.json と 1 対 1）

| 種類 | S | A | B | 計 |
|---|---:|---:|---:|---:|
| 手前の腕 | 8 | 0 | 0 | 8 |
| 素体 | 2 | 0 | 0 | 2 |
| 装備（スタイル×性別、袖・背面を含む） | 33 | 78 | 67 | 178 |
| 顔 | 6 | 0 | 0 | 6 |
| 髪型 | 12 | 12 | 32 | 56 |
| ボス | 7 | 0 | 0 | 7 |
| 服破れ | 0 | 6 | 0 | 6 |
| 敵 | 0 | 18 | 80 | 98 |
| PET | 0 | 10 | 0 | 10 |

#### 優先度 S（68）

| ☐ | ファイル（assets/sprites/ 以下） | 名前 | セル | tint |
|---|---|---|---|---|
| ☐ | `chars/arm_f_gray.png` | 手前の腕 ♀（素手） | 88x128 | skin |
| ☐ | `chars/arm_f__gun_gray.png` | 手前の腕 ♀（銃を持つとき） | 80x128 | skin |
| ☐ | `chars/arm_f__magic_gray.png` | 手前の腕 ♀（杖を持つとき） | 88x128 | skin |
| ☐ | `chars/arm_f__melee_gray.png` | 手前の腕 ♀（近接武器を持つとき） | 88x128 | skin |
| ☐ | `chars/arm_m_gray.png` | 手前の腕 ♂（素手） | 96x136 | skin |
| ☐ | `chars/arm_m__gun_gray.png` | 手前の腕 ♂（銃を持つとき） | 88x136 | skin |
| ☐ | `chars/arm_m__magic_gray.png` | 手前の腕 ♂（杖を持つとき） | 96x136 | skin |
| ☐ | `chars/arm_m__melee_gray.png` | 手前の腕 ♂（近接武器を持つとき） | 96x136 | skin |
| ☐ | `chars/body_f_gray.png` | 素体 ♀（奥の腕・胴・脚） | 168x176 | skin |
| ☐ | `chars/body_m_gray.png` | 素体 ♂（奥の腕・胴・脚） | 168x184 | skin |
| ☐ | `chars/equip/bottom/jeans_f_gray.png` | 下衣 ジーンズ ♀ | 120x72 | color |
| ☐ | `chars/equip/bottom/jeans_m_gray.png` | 下衣 ジーンズ ♂ | 120x72 | color |
| ☐ | `chars/equip/bottom/skirt_f_gray.png` | 下衣 スカート ♀ | 88x80 | color |
| ☐ | `chars/equip/bottom/trackPants_f_gray.png` | 下衣 ジャージパンツ ♀ | 120x72 | color |
| ☐ | `chars/equip/bottom/trackPants_m_gray.png` | 下衣 ジャージパンツ ♂ | 120x72 | color |
| ☐ | `chars/face_f.png` | 顔 ♀（目・眉・口）基本 | 104x112 | — |
| ☐ | `chars/face_f__19f0ff.png` | 顔 ♀（目・眉・口）瞳 #19f0ff 用 | 104x112 | — |
| ☐ | `chars/face_f__33c7e6.png` | 顔 ♀（目・眉・口）瞳 #33c7e6 用 | 104x112 | — |
| ☐ | `chars/face_m.png` | 顔 ♂（目・眉・口）基本 | 104x112 | — |
| ☐ | `chars/face_m__19f0ff.png` | 顔 ♂（目・眉・口）瞳 #19f0ff 用 | 104x112 | — |
| ☐ | `chars/face_m__ff3d8b.png` | 顔 ♂（目・眉・口）瞳 #ff3d8b 用 | 104x112 | — |
| ☐ | `chars/hair/bob_back_f_gray.png` | 髪 ボブ 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/bob_front_f_gray.png` | 髪 ボブ 前髪 ♀ | 192x208 | hairColor |
| ☐ | `chars/hair/ponytail_back_f_gray.png` | 髪 ポニーテール 後ろ髪 ♀ | 176x200 | hairColor |
| ☐ | `chars/hair/ponytail_front_f_gray.png` | 髪 ポニーテール 前髪 ♀ | 176x192 | hairColor |
| ☐ | `chars/hair/short_back_m_gray.png` | 髪 ショート 後ろ髪 ♂ | 176x184 | hairColor |
| ☐ | `chars/hair/short_front_m_gray.png` | 髪 ショート 前髪 ♂ | 192x208 | hairColor |
| ☐ | `chars/hair/spiky_back_m_gray.png` | 髪 ツンツン 後ろ髪 ♂ | 176x184 | hairColor |
| ☐ | `chars/hair/spiky_front_m_gray.png` | 髪 ツンツン 前髪 ♂ | 200x208 | hairColor |
| ☐ | `chars/hair/twin_back_f_gray.png` | 髪 ツインテール 後ろ髪 ♀ | 184x192 | hairColor |
| ☐ | `chars/hair/twin_front_f_gray.png` | 髪 ツインテール 前髪 ♀ | 192x208 | hairColor |
| ☐ | `chars/hair/wolf_back_m_gray.png` | 髪 ウルフ 後ろ髪 ♂ | 176x192 | hairColor |
| ☐ | `chars/hair/wolf_front_m_gray.png` | 髪 ウルフ 前髪 ♂ | 200x208 | hairColor |
| ☐ | `chars/equip/hat/cap_m_gray.png` | 帽子 キャップ ♂ | 192x184 | color |
| ☐ | `chars/equip/hat/catEars_f_gray.png` | 帽子 ネコミミ ♀ | 176x192 | color |
| ☐ | `chars/equip/hat/headphones_f_gray.png` | 帽子 ヘッドホン ♀ | 176x184 | color |
| ☐ | `chars/equip/hat/headphones_m_gray.png` | 帽子 ヘッドホン ♂ | 176x192 | color |
| ☐ | `chars/equip/shoes/boots_f_gray.png` | 靴 ブーツ ♀ | 120x64 | color |
| ☐ | `chars/equip/shoes/boots_m_gray.png` | 靴 ブーツ ♂ | 120x64 | color |
| ☐ | `chars/equip/shoes/sneakers_f_gray.png` | 靴 スニーカー ♀ | 120x64 | color |
| ☐ | `chars/equip/shoes/sneakers_m_gray.png` | 靴 スニーカー ♂ | 120x64 | color |
| ☐ | `chars/equip/top/hoodie_f_gray.png` | 上着 パーカー ♀ | 104x136 | color |
| ☐ | `chars/equip/top/hoodie_m_gray.png` | 上着 パーカー ♂ | 112x144 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_f_gray.png` | 上着 パーカー 手前の袖 ♀ | 88x128 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_f__magic_gray.png` | 上着 パーカー 手前の袖 ♀（杖を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_f__melee_gray.png` | 上着 パーカー 手前の袖 ♀（近接武器を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_m_gray.png` | 上着 パーカー 手前の袖 ♂ | 96x128 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_m__magic_gray.png` | 上着 パーカー 手前の袖 ♂（杖を持つとき） | 96x128 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_m__melee_gray.png` | 上着 パーカー 手前の袖 ♂（近接武器を持つとき） | 96x136 | color |
| ☐ | `chars/equip/top/leatherJacket_f_gray.png` | 上着 レザージャケット ♀ | 96x136 | color |
| ☐ | `chars/equip/top/leatherJacket_m_gray.png` | 上着 レザージャケット ♂ | 104x144 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_f_gray.png` | 上着 レザージャケット 手前の袖 ♀ | 88x128 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_f__melee_gray.png` | 上着 レザージャケット 手前の袖 ♀（近接武器を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_m_gray.png` | 上着 レザージャケット 手前の袖 ♂ | 96x128 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_m__melee_gray.png` | 上着 レザージャケット 手前の袖 ♂（近接武器を持つとき） | 96x136 | color |
| ☐ | `chars/equip/weapon/bat_f_gray.png` | 武器 バット ♀ | 160x184 | color |
| ☐ | `chars/equip/weapon/bat_m_gray.png` | 武器 バット ♂ | 160x184 | color |
| ☐ | `chars/equip/weapon/knife_f_gray.png` | 武器 ナイフ ♀ | 112x152 | color |
| ☐ | `chars/equip/weapon/knife_m_gray.png` | 武器 ナイフ ♂ | 112x152 | color |
| ☐ | `chars/equip/weapon/staff_f_gray.png` | 武器 杖（デバイス） ♀ | 208x200 | color |
| ☐ | `chars/equip/weapon/staff_m_gray.png` | 武器 杖（デバイス） ♂ | 216x200 | color |
| ☐ | `bosses/boss_alien.png` | オーバーロード・ゾグ | 728x736 | — |
| ☐ | `bosses/boss_captain.png` | キャプテン・ハーケン | 336x296 | — |
| ☐ | `bosses/boss_don.png` | ドン・カイマン | 312x304 | — |
| ☐ | `bosses/boss_gator.png` | グランパ・ゲイター | 640x296 | — |
| ☐ | `bosses/boss_king_slime.png` | キングゼリー | 472x376 | — |
| ☐ | `bosses/boss_mecha.png` | メカ・ハイローラー | 448x448 | — |
| ☐ | `bosses/boss_rat_king.png` | ラットキング | 360x320 | — |

#### 優先度 A（124）

| ☐ | ファイル（assets/sprites/ 以下） | 名前 | セル | tint |
|---|---|---|---|---|
| ☐ | `chars/equip/accessory/goldChain_f_gray.png` | アクセサリー 金のチェーン ♀ | 72x104 | color |
| ☐ | `chars/equip/accessory/goldChain_m_gray.png` | アクセサリー 金のチェーン ♂ | 72x104 | color |
| ☐ | `chars/equip/accessory/halo_f_gray.png` | アクセサリー 天使の輪 ♀ | 192x208 | color |
| ☐ | `chars/equip/accessory/halo_m_gray.png` | アクセサリー 天使の輪 ♂ | 192x208 | color |
| ☐ | `chars/equip/accessory/sunglasses_f_gray.png` | アクセサリー サングラス ♀ | 128x144 | color |
| ☐ | `chars/equip/accessory/sunglasses_m_gray.png` | アクセサリー サングラス ♂ | 136x152 | color |
| ☐ | `chars/equip/accessory/wings_back_f_gray.png` | アクセサリー 翼 背面パーツ ♀ | 112x160 | color |
| ☐ | `chars/equip/accessory/wings_back_m_gray.png` | アクセサリー 翼 背面パーツ ♂ | 112x160 | color |
| ☐ | `chars/equip/accessory/wings_f_gray.png` | アクセサリー 翼 ♀ | 160x120 | color |
| ☐ | `chars/equip/accessory/wings_m_gray.png` | アクセサリー 翼 ♂ | 160x120 | color |
| ☐ | `chars/equip/bottom/_default_f.png` | 下衣 未装備時の服 ♀ | 96x72 | — |
| ☐ | `chars/equip/bottom/_default_m.png` | 下衣 未装備時の服 ♂ | 96x72 | — |
| ☐ | `chars/equip/bottom/shorts_f_gray.png` | 下衣 ショートパンツ ♀ | 96x72 | color |
| ☐ | `chars/equip/bottom/shorts_m_gray.png` | 下衣 ショートパンツ ♂ | 96x72 | color |
| ☐ | `chars/equip/bottom/suitPants_f_gray.png` | 下衣 スーツパンツ ♀ | 120x72 | color |
| ☐ | `chars/equip/bottom/suitPants_m_gray.png` | 下衣 スーツパンツ ♂ | 120x72 | color |
| ☐ | `chars/hair/bob_back_m_gray.png` | 髪 ボブ 後ろ髪 ♂ | 176x184 | hairColor |
| ☐ | `chars/hair/bob_front_m_gray.png` | 髪 ボブ 前髪 ♂ | 192x208 | hairColor |
| ☐ | `chars/hair/ponytail_back_m_gray.png` | 髪 ポニーテール 後ろ髪 ♂ | 176x208 | hairColor |
| ☐ | `chars/hair/ponytail_front_m_gray.png` | 髪 ポニーテール 前髪 ♂ | 184x192 | hairColor |
| ☐ | `chars/hair/short_back_f_gray.png` | 髪 ショート 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/short_front_f_gray.png` | 髪 ショート 前髪 ♀ | 192x208 | hairColor |
| ☐ | `chars/hair/spiky_back_f_gray.png` | 髪 ツンツン 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/spiky_front_f_gray.png` | 髪 ツンツン 前髪 ♀ | 200x208 | hairColor |
| ☐ | `chars/hair/twin_back_m_gray.png` | 髪 ツインテール 後ろ髪 ♂ | 192x200 | hairColor |
| ☐ | `chars/hair/twin_front_m_gray.png` | 髪 ツインテール 前髪 ♂ | 192x208 | hairColor |
| ☐ | `chars/hair/wolf_back_f_gray.png` | 髪 ウルフ 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/wolf_front_f_gray.png` | 髪 ウルフ 前髪 ♀ | 192x200 | hairColor |
| ☐ | `chars/equip/hat/crown_f_gray.png` | 帽子 王冠 ♀ | 168x192 | color |
| ☐ | `chars/equip/hat/crown_m_gray.png` | 帽子 王冠 ♂ | 176x200 | color |
| ☐ | `chars/equip/hat/helmet_f_gray.png` | 帽子 ヘルメット ♀ | 176x184 | color |
| ☐ | `chars/equip/hat/helmet_m_gray.png` | 帽子 ヘルメット ♂ | 176x184 | color |
| ☐ | `chars/equip/shoes/_default_f.png` | 靴 未装備時の服 ♀ | 120x64 | — |
| ☐ | `chars/equip/shoes/_default_m.png` | 靴 未装備時の服 ♂ | 120x64 | — |
| ☐ | `chars/equip/shoes/heels_f_gray.png` | 靴 ヒール ♀ | 120x56 | color |
| ☐ | `chars/equip/shoes/heels_m_gray.png` | 靴 ヒール ♂ | 120x64 | color |
| ☐ | `chars/tear_1_f.png` | 服破れ 段階1 ♀（HP 75% 以下） | 56x96 | — |
| ☐ | `chars/tear_1_m.png` | 服破れ 段階1 ♂（HP 75% 以下） | 56x88 | — |
| ☐ | `chars/tear_2_f.png` | 服破れ 段階2 ♀（HP 50% 以下） | 88x128 | — |
| ☐ | `chars/tear_2_m.png` | 服破れ 段階2 ♂（HP 50% 以下） | 88x128 | — |
| ☐ | `chars/tear_3_f.png` | 服破れ 段階3 ♀（HP 25% 以下） | 88x128 | — |
| ☐ | `chars/tear_3_m.png` | 服破れ 段階3 ♂（HP 25% 以下） | 88x128 | — |
| ☐ | `chars/equip/top/_default_f.png` | 上着 未装備時の服 ♀ | 88x112 | — |
| ☐ | `chars/equip/top/_default_m.png` | 上着 未装備時の服 ♂ | 96x120 | — |
| ☐ | `chars/equip/top/_default_sleeve_f.png` | 上着 未装備時の服 手前の袖 ♀ | 80x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_f__gun.png` | 上着 未装備時の服 手前の袖 ♀（銃を持つとき） | 72x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_f__magic.png` | 上着 未装備時の服 手前の袖 ♀（杖を持つとき） | 72x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_f__melee.png` | 上着 未装備時の服 手前の袖 ♀（近接武器を持つとき） | 72x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_m.png` | 上着 未装備時の服 手前の袖 ♂ | 80x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_m__gun.png` | 上着 未装備時の服 手前の袖 ♂（銃を持つとき） | 72x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_m__magic.png` | 上着 未装備時の服 手前の袖 ♂（杖を持つとき） | 80x112 | — |
| ☐ | `chars/equip/top/_default_sleeve_m__melee.png` | 上着 未装備時の服 手前の袖 ♂（近接武器を持つとき） | 80x112 | — |
| ☐ | `chars/equip/top/hoodie_sleeve_f__gun_gray.png` | 上着 パーカー 手前の袖 ♀（銃を持つとき） | 80x128 | color |
| ☐ | `chars/equip/top/hoodie_sleeve_m__gun_gray.png` | 上着 パーカー 手前の袖 ♂（銃を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/idolDress_f_gray.png` | 上着 アイドル衣装 ♀ | 104x112 | color |
| ☐ | `chars/equip/top/idolDress_m_gray.png` | 上着 アイドル衣装 ♂ | 104x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_f_gray.png` | 上着 アイドル衣装 手前の袖 ♀ | 64x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_f__gun_gray.png` | 上着 アイドル衣装 手前の袖 ♀（銃を持つとき） | 56x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_f__magic_gray.png` | 上着 アイドル衣装 手前の袖 ♀（杖を持つとき） | 64x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_f__melee_gray.png` | 上着 アイドル衣装 手前の袖 ♀（近接武器を持つとき） | 64x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_m_gray.png` | 上着 アイドル衣装 手前の袖 ♂ | 72x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_m__gun_gray.png` | 上着 アイドル衣装 手前の袖 ♂（銃を持つとき） | 64x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_m__magic_gray.png` | 上着 アイドル衣装 手前の袖 ♂（杖を持つとき） | 64x112 | color |
| ☐ | `chars/equip/top/idolDress_sleeve_m__melee_gray.png` | 上着 アイドル衣装 手前の袖 ♂（近接武器を持つとき） | 64x112 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_f__gun_gray.png` | 上着 レザージャケット 手前の袖 ♀（銃を持つとき） | 80x128 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_f__magic_gray.png` | 上着 レザージャケット 手前の袖 ♀（杖を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_m__gun_gray.png` | 上着 レザージャケット 手前の袖 ♂（銃を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/leatherJacket_sleeve_m__magic_gray.png` | 上着 レザージャケット 手前の袖 ♂（杖を持つとき） | 96x128 | color |
| ☐ | `chars/equip/top/suit_f_gray.png` | 上着 スーツ ♀ | 104x136 | color |
| ☐ | `chars/equip/top/suit_m_gray.png` | 上着 スーツ ♂ | 112x144 | color |
| ☐ | `chars/equip/top/suit_sleeve_f_gray.png` | 上着 スーツ 手前の袖 ♀ | 88x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_f__gun_gray.png` | 上着 スーツ 手前の袖 ♀（銃を持つとき） | 80x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_f__magic_gray.png` | 上着 スーツ 手前の袖 ♀（杖を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_f__melee_gray.png` | 上着 スーツ 手前の袖 ♀（近接武器を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_m_gray.png` | 上着 スーツ 手前の袖 ♂ | 96x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_m__gun_gray.png` | 上着 スーツ 手前の袖 ♂（銃を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_m__magic_gray.png` | 上着 スーツ 手前の袖 ♂（杖を持つとき） | 96x128 | color |
| ☐ | `chars/equip/top/suit_sleeve_m__melee_gray.png` | 上着 スーツ 手前の袖 ♂（近接武器を持つとき） | 96x136 | color |
| ☐ | `chars/equip/top/tshirt_f_gray.png` | 上着 Tシャツ ♀ | 88x112 | color |
| ☐ | `chars/equip/top/tshirt_m_gray.png` | 上着 Tシャツ ♂ | 96x120 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_f_gray.png` | 上着 Tシャツ 手前の袖 ♀ | 80x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_f__gun_gray.png` | 上着 Tシャツ 手前の袖 ♀（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_f__magic_gray.png` | 上着 Tシャツ 手前の袖 ♀（杖を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_f__melee_gray.png` | 上着 Tシャツ 手前の袖 ♀（近接武器を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_m_gray.png` | 上着 Tシャツ 手前の袖 ♂ | 80x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_m__gun_gray.png` | 上着 Tシャツ 手前の袖 ♂（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_m__magic_gray.png` | 上着 Tシャツ 手前の袖 ♂（杖を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/tshirt_sleeve_m__melee_gray.png` | 上着 Tシャツ 手前の袖 ♂（近接武器を持つとき） | 80x112 | color |
| ☐ | `chars/equip/weapon/katana_f_gray.png` | 武器 刀 ♀ | 184x200 | color |
| ☐ | `chars/equip/weapon/katana_m_gray.png` | 武器 刀 ♂ | 192x200 | color |
| ☐ | `chars/equip/weapon/neonSword_f_gray.png` | 武器 ネオンソード ♀ | 192x216 | color |
| ☐ | `chars/equip/weapon/neonSword_m_gray.png` | 武器 ネオンソード ♂ | 192x216 | color |
| ☐ | `chars/equip/weapon/pistol_f_gray.png` | 武器 拳銃 ♀ | 104x144 | color |
| ☐ | `chars/equip/weapon/pistol_m_gray.png` | 武器 拳銃 ♂ | 112x144 | color |
| ☐ | `chars/equip/weapon/smg_f_gray.png` | 武器 サブマシンガン ♀ | 120x160 | color |
| ☐ | `chars/equip/weapon/smg_m_gray.png` | 武器 サブマシンガン ♂ | 128x160 | color |
| ☐ | `enemies/alien_grey.png` | グレイ | 88x160 | — |
| ☐ | `enemies/cop_patrol.png` | パトロール警官 | 208x200 | — |
| ☐ | `enemies/crab_sand.png` | サンドクラブ | 136x96 | — |
| ☐ | `enemies/drone_peeping.png` | のぞき見ドローン | 136x104 | — |
| ☐ | `enemies/flamingo.png` | ヤンキーフラミンゴ | 136x184 | — |
| ☐ | `enemies/gator_swamp.png` | 沼ワニ | 248x112 | — |
| ☐ | `enemies/ghost_chip.png` | チップの亡霊 | 144x144 | — |
| ☐ | `enemies/golem_steel.png` | スチールゴーレム | 248x248 | — |
| ☐ | `enemies/jellyfish_pier.png` | ピアクラゲ | 136x144 | — |
| ☐ | `enemies/mosquito_swamp.png` | ヌマカ | 136x80 | — |
| ☐ | `enemies/mushroom_orange.png` | ビーチマッシュ | 120x128 | — |
| ☐ | `enemies/rat_alley.png` | ドブネズミ | 120x80 | — |
| ☐ | `enemies/robot_scrap.png` | スクラップロボ | 128x176 | — |
| ☐ | `enemies/seagull_beach.png` | ポテト泥棒カモメ | 128x88 | — |
| ☐ | `enemies/slime_green.png` | ソーダスライム | 144x104 | — |
| ☐ | `enemies/snake_reed.png` | アシヘビ | 168x80 | — |
| ☐ | `enemies/swat_trooper.png` | SWAT隊員 | 216x208 | — |
| ☐ | `enemies/thug_punk.png` | ストリートチンピラ | 232x200 | — |
| ☐ | `pets/alienPet.png` | PET ピポ | 96x128 | — |
| ☐ | `pets/catPet.png` | PET ネオンにゃん | 88x120 | — |
| ☐ | `pets/dolphinPet.png` | PET ドルフィ | 88x128 | — |
| ☐ | `pets/dragonPet.png` | PET ネオンドラゴン | 120x136 | — |
| ☐ | `pets/dronePet.png` | PET ピコドローン | 80x120 | — |
| ☐ | `pets/flamingoPet.png` | PET フラミー | 96x128 | — |
| ☐ | `pets/gatorPet.png` | PET ワニ太郎 | 120x112 | — |
| ☐ | `pets/ghostPet.png` | PET チップくん | 96x128 | — |
| ☐ | `pets/robotPet.png` | PET ボルトくん | 88x136 | — |
| ☐ | `pets/slimePet.png` | PET プルプル | 88x112 | — |

#### 優先度 B（179）

| ☐ | ファイル（assets/sprites/ 以下） | 名前 | セル | tint |
|---|---|---|---|---|
| ☐ | `chars/equip/accessory/mask_f_gray.png` | アクセサリー マスク ♀ | 120x144 | color |
| ☐ | `chars/equip/accessory/mask_m_gray.png` | アクセサリー マスク ♂ | 120x144 | color |
| ☐ | `chars/equip/accessory/scarf_back_f_gray.png` | アクセサリー マフラー 背面パーツ ♀ | 80x120 | color |
| ☐ | `chars/equip/accessory/scarf_back_m_gray.png` | アクセサリー マフラー 背面パーツ ♂ | 80x120 | color |
| ☐ | `chars/equip/accessory/scarf_f_gray.png` | アクセサリー マフラー ♀ | 80x112 | color |
| ☐ | `chars/equip/accessory/scarf_m_gray.png` | アクセサリー マフラー ♂ | 80x112 | color |
| ☐ | `chars/equip/bottom/armorPants_f_gray.png` | 下衣 アーマーパンツ ♀ | 120x72 | color |
| ☐ | `chars/equip/bottom/armorPants_m_gray.png` | 下衣 アーマーパンツ ♂ | 120x80 | color |
| ☐ | `chars/equip/bottom/cargo_f_gray.png` | 下衣 カーゴパンツ ♀ | 120x72 | color |
| ☐ | `chars/equip/bottom/cargo_m_gray.png` | 下衣 カーゴパンツ ♂ | 128x80 | color |
| ☐ | `chars/equip/bottom/skirt_m_gray.png` | 下衣 スカート ♂ | 96x80 | color |
| ☐ | `chars/hair/braid_back_f_gray.png` | 髪 三つ編み 後ろ髪 ♀ | 168x200 | hairColor |
| ☐ | `chars/hair/braid_back_m_gray.png` | 髪 三つ編み 後ろ髪 ♂ | 176x200 | hairColor |
| ☐ | `chars/hair/braid_front_f_gray.png` | 髪 三つ編み 前髪 ♀ | 176x192 | hairColor |
| ☐ | `chars/hair/braid_front_m_gray.png` | 髪 三つ編み 前髪 ♂ | 184x192 | hairColor |
| ☐ | `chars/hair/bun_back_f_gray.png` | 髪 おだんご 後ろ髪 ♀ | 184x192 | hairColor |
| ☐ | `chars/hair/bun_back_m_gray.png` | 髪 おだんご 後ろ髪 ♂ | 184x200 | hairColor |
| ☐ | `chars/hair/bun_front_f_gray.png` | 髪 おだんご 前髪 ♀ | 176x192 | hairColor |
| ☐ | `chars/hair/bun_front_m_gray.png` | 髪 おだんご 前髪 ♂ | 184x192 | hairColor |
| ☐ | `chars/hair/curly_back_f_gray.png` | 髪 カーリー 後ろ髪 ♀ | 200x208 | hairColor |
| ☐ | `chars/hair/curly_back_m_gray.png` | 髪 カーリー 後ろ髪 ♂ | 208x216 | hairColor |
| ☐ | `chars/hair/curly_front_f_gray.png` | 髪 カーリー 前髪 ♀ | 200x200 | hairColor |
| ☐ | `chars/hair/curly_front_m_gray.png` | 髪 カーリー 前髪 ♂ | 208x208 | hairColor |
| ☐ | `chars/hair/long_back_f_gray.png` | 髪 ロング 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/long_back_m_gray.png` | 髪 ロング 後ろ髪 ♂ | 176x192 | hairColor |
| ☐ | `chars/hair/long_front_f_gray.png` | 髪 ロング 前髪 ♀ | 176x192 | hairColor |
| ☐ | `chars/hair/long_front_m_gray.png` | 髪 ロング 前髪 ♂ | 184x192 | hairColor |
| ☐ | `chars/hair/messy_back_f_gray.png` | 髪 ふわくせ毛 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/messy_back_m_gray.png` | 髪 ふわくせ毛 後ろ髪 ♂ | 176x184 | hairColor |
| ☐ | `chars/hair/messy_front_f_gray.png` | 髪 ふわくせ毛 前髪 ♀ | 192x200 | hairColor |
| ☐ | `chars/hair/messy_front_m_gray.png` | 髪 ふわくせ毛 前髪 ♂ | 192x208 | hairColor |
| ☐ | `chars/hair/sidepart_back_f_gray.png` | 髪 メカクレ 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/sidepart_back_m_gray.png` | 髪 メカクレ 後ろ髪 ♂ | 176x184 | hairColor |
| ☐ | `chars/hair/sidepart_front_f_gray.png` | 髪 メカクレ 前髪 ♀ | 184x192 | hairColor |
| ☐ | `chars/hair/sidepart_front_m_gray.png` | 髪 メカクレ 前髪 ♂ | 184x192 | hairColor |
| ☐ | `chars/hair/topknot_back_f_gray.png` | 髪 ちょんまげ 後ろ髪 ♀ | 184x200 | hairColor |
| ☐ | `chars/hair/topknot_back_m_gray.png` | 髪 ちょんまげ 後ろ髪 ♂ | 192x200 | hairColor |
| ☐ | `chars/hair/topknot_front_f_gray.png` | 髪 ちょんまげ 前髪 ♀ | 176x200 | hairColor |
| ☐ | `chars/hair/topknot_front_m_gray.png` | 髪 ちょんまげ 前髪 ♂ | 184x200 | hairColor |
| ☐ | `chars/hair/undercut_back_f_gray.png` | 髪 アンダーカット 後ろ髪 ♀ | 168x184 | hairColor |
| ☐ | `chars/hair/undercut_back_m_gray.png` | 髪 アンダーカット 後ろ髪 ♂ | 176x184 | hairColor |
| ☐ | `chars/hair/undercut_front_f_gray.png` | 髪 アンダーカット 前髪 ♀ | 192x192 | hairColor |
| ☐ | `chars/hair/undercut_front_m_gray.png` | 髪 アンダーカット 前髪 ♂ | 192x200 | hairColor |
| ☐ | `chars/equip/hat/bandana_f_gray.png` | 帽子 バンダナ ♀ | 176x184 | color |
| ☐ | `chars/equip/hat/bandana_m_gray.png` | 帽子 バンダナ ♂ | 184x184 | color |
| ☐ | `chars/equip/hat/beanie_f_gray.png` | 帽子 ビーニー ♀ | 184x192 | color |
| ☐ | `chars/equip/hat/beanie_m_gray.png` | 帽子 ビーニー ♂ | 184x200 | color |
| ☐ | `chars/equip/hat/cap_f_gray.png` | 帽子 キャップ ♀ | 184x184 | color |
| ☐ | `chars/equip/hat/catEars_m_gray.png` | 帽子 ネコミミ ♂ | 176x192 | color |
| ☐ | `chars/equip/hat/cowboy_f_gray.png` | 帽子 カウボーイハット ♀ | 200x200 | color |
| ☐ | `chars/equip/hat/cowboy_m_gray.png` | 帽子 カウボーイハット ♂ | 208x208 | color |
| ☐ | `chars/equip/shoes/loafers_f_gray.png` | 靴 ローファー ♀ | 120x64 | color |
| ☐ | `chars/equip/shoes/loafers_m_gray.png` | 靴 ローファー ♂ | 120x64 | color |
| ☐ | `chars/equip/shoes/sandals_f_gray.png` | 靴 サンダル ♀ | 120x56 | color |
| ☐ | `chars/equip/shoes/sandals_m_gray.png` | 靴 サンダル ♂ | 120x64 | color |
| ☐ | `chars/equip/top/armorVest_f_gray.png` | 上着 アーマーベスト ♀ | 88x112 | color |
| ☐ | `chars/equip/top/armorVest_m_gray.png` | 上着 アーマーベスト ♂ | 96x120 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_f_gray.png` | 上着 アーマーベスト 手前の袖 ♀ | 80x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_f__gun_gray.png` | 上着 アーマーベスト 手前の袖 ♀（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_f__magic_gray.png` | 上着 アーマーベスト 手前の袖 ♀（杖を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_f__melee_gray.png` | 上着 アーマーベスト 手前の袖 ♀（近接武器を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_m_gray.png` | 上着 アーマーベスト 手前の袖 ♂ | 80x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_m__gun_gray.png` | 上着 アーマーベスト 手前の袖 ♂（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_m__magic_gray.png` | 上着 アーマーベスト 手前の袖 ♂（杖を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/armorVest_sleeve_m__melee_gray.png` | 上着 アーマーベスト 手前の袖 ♂（近接武器を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/hawaiian_f_gray.png` | 上着 アロハシャツ ♀ | 88x112 | color |
| ☐ | `chars/equip/top/hawaiian_m_gray.png` | 上着 アロハシャツ ♂ | 96x120 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_f_gray.png` | 上着 アロハシャツ 手前の袖 ♀ | 80x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_f__gun_gray.png` | 上着 アロハシャツ 手前の袖 ♀（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_f__magic_gray.png` | 上着 アロハシャツ 手前の袖 ♀（杖を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_f__melee_gray.png` | 上着 アロハシャツ 手前の袖 ♀（近接武器を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_m_gray.png` | 上着 アロハシャツ 手前の袖 ♂ | 80x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_m__gun_gray.png` | 上着 アロハシャツ 手前の袖 ♂（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_m__magic_gray.png` | 上着 アロハシャツ 手前の袖 ♂（杖を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/hawaiian_sleeve_m__melee_gray.png` | 上着 アロハシャツ 手前の袖 ♂（近接武器を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/police_f_gray.png` | 上着 警官制服 ♀ | 88x112 | color |
| ☐ | `chars/equip/top/police_m_gray.png` | 上着 警官制服 ♂ | 96x120 | color |
| ☐ | `chars/equip/top/police_sleeve_f_gray.png` | 上着 警官制服 手前の袖 ♀ | 80x112 | color |
| ☐ | `chars/equip/top/police_sleeve_f__gun_gray.png` | 上着 警官制服 手前の袖 ♀（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/police_sleeve_f__magic_gray.png` | 上着 警官制服 手前の袖 ♀（杖を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/police_sleeve_f__melee_gray.png` | 上着 警官制服 手前の袖 ♀（近接武器を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/police_sleeve_m_gray.png` | 上着 警官制服 手前の袖 ♂ | 80x112 | color |
| ☐ | `chars/equip/top/police_sleeve_m__gun_gray.png` | 上着 警官制服 手前の袖 ♂（銃を持つとき） | 72x112 | color |
| ☐ | `chars/equip/top/police_sleeve_m__magic_gray.png` | 上着 警官制服 手前の袖 ♂（杖を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/police_sleeve_m__melee_gray.png` | 上着 警官制服 手前の袖 ♂（近接武器を持つとき） | 80x112 | color |
| ☐ | `chars/equip/top/tank_f_gray.png` | 上着 タンクトップ ♀ | 72x104 | color |
| ☐ | `chars/equip/top/tank_m_gray.png` | 上着 タンクトップ ♂ | 80x104 | color |
| ☐ | `chars/equip/top/tracksuit_f_gray.png` | 上着 ジャージ ♀ | 96x136 | color |
| ☐ | `chars/equip/top/tracksuit_m_gray.png` | 上着 ジャージ ♂ | 104x144 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_f_gray.png` | 上着 ジャージ 手前の袖 ♀ | 88x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_f__gun_gray.png` | 上着 ジャージ 手前の袖 ♀（銃を持つとき） | 80x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_f__magic_gray.png` | 上着 ジャージ 手前の袖 ♀（杖を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_f__melee_gray.png` | 上着 ジャージ 手前の袖 ♀（近接武器を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_m_gray.png` | 上着 ジャージ 手前の袖 ♂ | 96x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_m__gun_gray.png` | 上着 ジャージ 手前の袖 ♂（銃を持つとき） | 88x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_m__magic_gray.png` | 上着 ジャージ 手前の袖 ♂（杖を持つとき） | 96x128 | color |
| ☐ | `chars/equip/top/tracksuit_sleeve_m__melee_gray.png` | 上着 ジャージ 手前の袖 ♂（近接武器を持つとき） | 96x136 | color |
| ☐ | `chars/equip/weapon/guitar_f_gray.png` | 武器 エレキギター ♀ | 192x216 | color |
| ☐ | `chars/equip/weapon/guitar_m_gray.png` | 武器 エレキギター ♂ | 192x216 | color |
| ☐ | `enemies/alien_moon.png` | ムーン・エイリアン | 96x168 | — |
| ☐ | `enemies/alien_warrior.png` | エイリアン戦士 | 96x176 | — |
| ☐ | `enemies/cop_detective.png` | 覆面刑事 | 216x216 | — |
| ☐ | `enemies/crab_hermit.png` | ヤドカリ番長 | 144x120 | — |
| ☐ | `enemies/crab_iron.png` | アイアンクラブ | 160x120 | — |
| ☐ | `enemies/crab_rust.png` | サビガニ | 160x120 | — |
| ☐ | `enemies/drone_attack.png` | アサルトドローン | 160x120 | — |
| ☐ | `enemies/drone_casino.png` | セキュリティドローン | 152x112 | — |
| ☐ | `enemies/drone_guardian.png` | ガーディアンドローン | 176x120 | — |
| ☐ | `enemies/drone_launch.png` | 発射管制ドローン | 152x104 | — |
| ☐ | `enemies/drone_night_owl.png` | ナイトオウル観測機 | 152x112 | — |
| ☐ | `enemies/drone_scout.png` | 監視ドローン | 144x104 | — |
| ☐ | `enemies/drone_toy.png` | ラジコン・ドローン | 136x96 | — |
| ☐ | `enemies/drone_traffic.png` | 交通監視ドローン | 144x104 | — |
| ☐ | `enemies/flamingo_punk.png` | パンク・フラミンゴ | 144x192 | — |
| ☐ | `enemies/gator_albino.png` | アルビノゲイター | 264x112 | — |
| ☐ | `enemies/gator_fog.png` | ミスト・ゲイター | 256x112 | — |
| ☐ | `enemies/ghost_after_hours.png` | アフターアワーズの客 | 152x144 | — |
| ☐ | `enemies/ghost_astral.png` | アストラル体 | 152x160 | — |
| ☐ | `enemies/ghost_bayou.png` | バイユーの鬼火 | 136x136 | — |
| ☐ | `enemies/ghost_jackpot.png` | ジャックポット・ゴースト | 184x176 | — |
| ☐ | `enemies/ghost_neon.png` | ネオンゴースト | 144x144 | — |
| ☐ | `enemies/golem_garden.png` | ガーデンゴーレム | 248x248 | — |
| ☐ | `enemies/golem_gold.png` | ゴールドゴーレム | 256x256 | — |
| ☐ | `enemies/golem_moon.png` | ムーンゴーレム | 256x256 | — |
| ☐ | `enemies/jelly_coast.png` | コーストクラゲ | 144x152 | — |
| ☐ | `enemies/jelly_cosmic.png` | コズミッククラゲ | 176x208 | — |
| ☐ | `enemies/jelly_moonlit.png` | ムーンライト・クラゲ | 152x152 | — |
| ☐ | `enemies/jelly_void.png` | ヴォイドクラゲ | 184x224 | — |
| ☐ | `enemies/mosquito_giant.png` | オオヌマカ | 184x144 | — |
| ☐ | `enemies/mosquito_queen.png` | ヌマカの女王 | 216x160 | — |
| ☐ | `enemies/mushroom_bog.png` | 沼地の毒キノコ | 128x136 | — |
| ☐ | `enemies/mushroom_cone.png` | コーンマッシュ | 120x128 | — |
| ☐ | `enemies/mushroom_fog.png` | キリタケ | 128x136 | — |
| ☐ | `enemies/mushroom_glow.png` | グロウマッシュ | 128x128 | — |
| ☐ | `enemies/mushroom_mutant.png` | ミュータント・マッシュ | 144x152 | — |
| ☐ | `enemies/mushroom_neon.png` | ネオンキノコ | 128x128 | — |
| ☐ | `enemies/mushroom_park.png` | ピクニックマッシュ | 128x128 | — |
| ☐ | `enemies/mushroom_spore.png` | ガスマッシュ | 136x144 | — |
| ☐ | `enemies/rat_dock.png` | ドックラット | 136x88 | — |
| ☐ | `enemies/rat_giant.png` | ジャイアントラット | 176x120 | — |
| ☐ | `enemies/rat_neon.png` | ネオンラット | 136x88 | — |
| ☐ | `enemies/rat_ship.png` | ふなネズミ | 136x88 | — |
| ☐ | `enemies/rat_subway.png` | メトロラット | 136x88 | — |
| ☐ | `enemies/robot_dealer.png` | ディーラーロボ | 136x176 | — |
| ☐ | `enemies/robot_loader.png` | 搬入ロボ | 144x184 | — |
| ☐ | `enemies/robot_lunar.png` | ルナローバー | 152x176 | — |
| ☐ | `enemies/robot_patrol.png` | パトロールボット | 128x176 | — |
| ☐ | `enemies/robot_slot.png` | スロットロボ | 128x176 | — |
| ☐ | `enemies/robot_valet.png` | バレー・ロボ | 128x176 | — |
| ☐ | `enemies/robot_worker.png` | 建設ロボ | 136x176 | — |
| ☐ | `enemies/robot_xeno.png` | ゼノメカ | 144x192 | — |
| ☐ | `enemies/seagull_highway.png` | ハイウェイカモメ | 136x88 | — |
| ☐ | `enemies/seagull_jet.png` | ジェットカモメ | 144x88 | — |
| ☐ | `enemies/slime_diamond.png` | ダイヤスライム | 160x112 | — |
| ☐ | `enemies/slime_fuel.png` | ロケット燃料スライム | 168x120 | — |
| ☐ | `enemies/slime_gold.png` | ゴールドスライム | 160x112 | — |
| ☐ | `enemies/slime_oil.png` | オイルスライム | 176x128 | — |
| ☐ | `enemies/slime_pink.png` | ストロベリースライム | 144x112 | — |
| ☐ | `enemies/slime_toxic.png` | ヘドロスライム | 168x120 | — |
| ☐ | `enemies/slime_wave.png` | ビッグウェーブスライム | 168x120 | — |
| ☐ | `enemies/snake_fog.png` | キリヘビ | 176x88 | — |
| ☐ | `enemies/snake_king.png` | ヌシヘビ | 200x128 | — |
| ☐ | `enemies/snake_mangrove.png` | マングローブ・ボア | 192x96 | — |
| ☐ | `enemies/snake_rattle.png` | ガラガラヘビ | 176x88 | — |
| ☐ | `enemies/swat_heavy.png` | ヘビーSWAT | 248x240 | — |
| ☐ | `enemies/thug_biker.png` | ハイウェイ・ライダー | 224x208 | — |
| ☐ | `enemies/thug_bouncer.png` | カジノの用心棒 | 224x248 | — |
| ☐ | `enemies/thug_desert.png` | デザート・ライダー | 248x208 | — |
| ☐ | `enemies/thug_dockhand.png` | 港のゴロツキ | 232x208 | — |
| ☐ | `enemies/thug_elite.png` | ドン親衛隊 | 264x232 | — |
| ☐ | `enemies/thug_graffiti.png` | グラフィティ小僧 | 208x200 | — |
| ☐ | `enemies/thug_gunner.png` | ギャングの鉄砲玉 | 208x208 | — |
| ☐ | `enemies/thug_hitman.png` | ドンの殺し屋 | 208x200 | — |
| ☐ | `enemies/thug_merc.png` | 傭兵スナイパー | 216x208 | — |
| ☐ | `enemies/thug_night_racer.png` | ナイト・ゴーストレーサー | 216x200 | — |
| ☐ | `enemies/thug_scrapper.png` | スクラップ屋 | 232x208 | — |
| ☐ | `enemies/thug_skater.png` | スケボー・チンピラ | 216x200 | — |
| ☐ | `enemies/thug_smuggler.png` | 密輸船の船員 | 208x208 | — |
| ☐ | `enemies/thug_vip.png` | VIPガード | 224x216 | — |
<!-- ASSET_TABLE:END -->

---

## 5. キャラクター設定シート

### 5-1. 主人公（3 クラス × ♂♀）
名前は既定（プレイヤーが変更可）。髪型・髪色・瞳・肌はキャラ作成で選べるので、**下の配色は既定値**。性格は描き分けのための指針。

| クラス / 性別 | 既定の名前 | 性格・雰囲気（指針） | 肌 | 髪型 / 髪色（影・ハイライト） | 瞳 | 初期装備（hat / top / bottom / shoes / weapon） |
|---|---|---|---|---|---|---|
| ストリートスター（luna）♀ | ルナ | かわいい＋強気。八重歯、つり気味の大きな目、ノリが良い | `#FFE3D3` | ツインテール twin / `#FF6FB5`（`#C8458F`・`#FFD0EA`、毛先 `#B47CFF`、ゴム `#FFD23F`） | `#FF3D8B` | ネコミミ / ピンクのパーカー / ピンクのスカート / 白スニーカー / ナイフ |
| ストリートスター（luna）♂ | ルカ | 人懐っこいお調子者。笑顔が多い | `#FBDCC6` | ショート short / `#FF5FA8`（`#B8337E`・`#FFC6E4`） | `#FF3D8B` | ストリートキャップ / ピンクのパーカー / ジーンズ / 白スニーカー / ナイフ |
| ストリートブロウラー（jin）♀ | ジーナ | クールで面倒見のいい姉御肌。少し半目 | `#F8DAC6` | ポニーテール ponytail / `#E2E7F2`（`#8790AB`・`#FFFFFF`、メッシュ `#3EE6D2`、ゴム `#FF4F8B`） | `#33C7E6` | なし / 黒レザージャケット / ジーンズ / 黒ブーツ / 木製バット |
| ストリートブロウラー（jin）♂ | ジン | クール・寡黙。ポケットに手、口は水平の線 | `#F2CFB6` | ウルフ wolf / `#DDE3EE`（`#7D86A3`・`#FFFFFF`、メッシュ `#3EE6D2`） | `#2FB8E8` | なし / 黒レザージャケット / ジーンズ / 黒ブーツ / 木製バット |
| ストリートハッカー（hacker）♀ | ノア | 理系の天才肌。ジト目気味、得意げに笑う | `#F0D2BC` | ボブ bob / `#3DFF8A`（`#14A06A`・`#D4FFE6`） | `#19F0FF` | ジャンク・ヘッドセット / サイバーパーカー / サイバーパンツ / 白スニーカー / グリッチ杖 |
| ストリートハッカー（hacker）♂ | ネオ | 自作ドローン好きの発明家。ゴーグル映えする元気な目 | `#E8C6AA` | ツンツン spiky / `#36F08A`（`#12925E`・`#C8FFDF`） | `#19F0FF` | ジャンク・ヘッドセット / サイバーパーカー / サイバーパンツ / 白スニーカー / グリッチ杖 |

リムライト（影側の縁の光）: luna `#8FF4FF` / jin `#D0A8FF` / hacker `#FF8AE0`。

**職の系統とオーラ色**（転職するとキャラの周りにオーラ。オーラはゲームが描くが、キャラの差し色の参考に）

| クラス | 系統 | 系統色 | 1次 → 4次 のオーラ色 |
|---|---|---|---|
| luna | ガンスリンガー系（銃・クリティカル） | `#FF3D7F` | `#FF3D7F` → `#FF5FA2` → `#FF2A6D` → `#FFD23F` |
| luna | ネオンダンサー系（スピード・連撃） | `#19F0FF` | `#19F0FF` → `#3DFFD0` → `#C77DFF` → `#7DF9FF` |
| jin | ストリートファイター系（格闘・タフ） | `#FF8A00` | `#FF8A00` → `#FF5A1F` → `#FF3B3B` → `#FFD23F` |
| jin | ナイトレーサー系（車・ニトロ） | `#7B5CFF` | `#7B5CFF` → `#5C7CFF` → `#A24DFF` → `#19F0FF` |
| hacker | ネットランナー系（電脳魔法） | `#3DFF8A` | `#3DFF8A` → `#5CFFB0` → `#00FFA3` → `#B6FF3D` |
| hacker | ドローンマスター系（ドローン召喚） | `#FFB000` | `#FFB000` → `#FFC94D` → `#FF8A3D` → `#FFE14D` |

参考画像: `ref_heroes.png`（全状態）、`ref_faces.png`、`ref_hair.png`、`ref_equip_*.png`、`ref_palette.png`。

### 5-2. ボス 7 体
| ID | 名前（称号） | 地域 / Lv | 設定（lore） | 見た目の要点 | 第2形態（HP 50% 以下） |
|---|---|---|---|---|---|
| `boss_king_slime` | キングゼリー（ビーチの王様） | ビーチ / 10 | 捨てられたネオン蛍光ドリンクを吸って巨大化。サングラスは観光客の落とし物 | 巨大なソーダ色ゼリー、王冠、サングラス、赤いマント。手下はスライム | 怒りでマゼンタに変色、赤いサングラス、怒りマーク |
| `boss_rat_king` | ラットキング（地下鉄の支配者） | ダウンタウン / 18 | 地下鉄トンネルの“家賃徴収人”。小銭を溶かした王冠 | 灰色の太ったネズミ、小さな王冠、光るアンテナ付きの杖、金の歯 | 目が赤く光る、杖の玉が赤に |
| `boss_captain` | キャプテン・ハーケン（密輸船の船長） | スラム・港 / 34 | ハリケーンで船も家族も失い、ドンに拾われた密輸船長。義手は嵐の夜の名残 | 人型（褐色の肌・カウボーイハット・レザージャケット・赤い刀・金のチェーン）、足元に青い魔法陣、水しぶき | 赤いオーラと眼光、怒りの湯気 |
| `boss_gator` | グランパ・ゲイター（沼の主） | スワンプ / 44 | 猟師ブーンが若い頃から追う伝説のワニ。縄張りを守っているだけ | 画面幅の 1/6 ある巨大ワニ、背中のトゲ、小さな王冠とサングラス、胴のベルト | 背中が赤く燃える、口から炎 |
| `boss_mecha` | メカ・ハイローラー（カジノ警備システム） | カジノ / 60 | 軍の払い下げ警備ドローンを改造したカジノ AI。負けると怒る | スロットマシン型の胴（777）、4 つのローター、両腕の銃、JACKPOT の看板 | リールがドクロ（💀💀💀）、赤い警告灯 |
| `boss_don` | ドン・カイマン（ヴァイス・ベイの支配者） | 摩天楼 / 78 | 港の荷役から成り上がった男。口癖は「この街の光は全部、俺が灯した」 | 人型（銀髪ウルフ・王冠・金のスーツ・金の拳銃・太いチェーン）、札束とコインが周りを回る | 服がボロボロに（HP 減少で破れる）、赤い眼光と湯気 |
| `boss_alien` | オーバーロード・ゾグ（謎の宇宙船の主・裏ボス） | 宇宙港 / 100 | 人の熱狂（ネオン）を糧とする来訪者。SNS のバズで強くなる | UFO に乗った緑の宇宙人、王冠、ガラスのドーム、多数のライト。画面上 約 272px の最大の敵 | 目とライトが赤く、オーラが赤紫に |

参考画像: `ref_bosses.png`（通常 / 溜め / 第2形態）。人型ボス（船長・ドン）も **1 枚のボスシート**として描いてよい（`bosses/<ID>.png`）。

### 5-3. 地域ごとの敵の系統と色
| 地域 | 雰囲気 | 主な敵（art） | 色の傾向 | 参考画像 |
|---|---|---|---|---|
| beach ビーチ（Lv1〜12） | 夕焼けの浜・桟橋 | スライム、カニ、カモメ、ビーチキノコ、クラゲ、ヤンキーフラミンゴ | ソーダ緑・いちごピンク・オレンジ・空色 | `ref_enemies_beach.png` |
| downtown ダウンタウン（Lv11〜21） | ネオンの夜の街・地下鉄 | チンピラ（人型）、ドブネズミ、ネオンキノコ、ドローン | 蛍光緑・マゼンタ・シアン・オレンジ | `ref_enemies_downtown.png` |
| slums スラム/港（Lv21〜35） | 錆びた港・コンテナ・廃線 | 港のゴロツキ（人型）、ヘドロ/オイルスライム、ネズミ、パンクフラミンゴ、サビガニ、スクラップロボ | 錆オレンジ・毒々しい黄緑・くすんだ茶 | `ref_enemies_slums.png` |
| swamp スワンプ（Lv23〜43） | 霧の湿地・マングローブ | ヌマカ（蚊）、ヘビ、毒キノコ、ワニ、鬼火 | 苔緑・黄土・霧の水色・紫 | `ref_enemies_swamp.png` |
| casino カジノ（Lv43〜58） | ゴールド×マゼンタの電飾 | ガラガラヘビ、スロット/ディーラーロボ、ゴールド/ダイヤスライム、チップの亡霊、用心棒（人型） | 金・赤・黒・白 | `ref_enemies_casino.png` |
| rooftop 摩天楼（Lv59〜74） | 屋上・空中庭園・ペントハウス | 建設ロボ、スチール/ガーデン/ゴールドゴーレム、アサルトドローン、殺し屋・傭兵・親衛隊（人型） | 鉄灰・金・黒・赤 | `ref_enemies_rooftop.png` |
| spaceport 宇宙港（Lv37〜96） | ロケット・月面シミュ・宇宙船 | パトロール/ローダー/ルナローバー/ゼノメカ、グレイ・エイリアン、クラゲ、ムーンゴーレム、アストラル体 | 白銀・紫・ロケット赤・エイリアン緑 | `ref_enemies_spaceport.png` |
| police 警察（手配度で出現） | 町で暴れると来る | 巡回警官・覆面刑事（人型）、監視ドローン、SWAT | 紺 `#1F3A8A` ＋金バッジ `#FFD23F`、パトランプ赤 `#FF2E4D` / 青 `#2E7BFF` | `ref_enemies_police.png` |
| town 町の市民 | 観光客・ビジネスマン等 | 服装が乱数で変わるため**差し替え対象外**（参考のみ） | — | `ref_enemies_town.png` |

- 同じ art（例 slime）の敵は色違い・小物違い。**代表（優先度 A）を 1 体描けば、manifest のキーを art 名（例 `slime`）にして登録すると同じ art の他の敵の代わりにもなる**（ただし色はそのまま＝全部同じ色になる。最終的には個別に描くのが理想）。
- 敵の名前と一言設定は `ref_enemies_*.png` と `ASSET_LIST.csv` に。lore 全文は `src/data/lore.js`。

### 5-4. PET 10 種（超レアドロップのマスコット）
画面上は高さ 28〜40px と小さいので、**シルエットと大きな目で一目で分かる**ように。

| スタイル（ファイル名） | 名前 | 性格・設定 | 主色 / 差し色 | 飛ぶ |
|---|---|---|---|---|
| `slimePet` | プルプル | ソーダ味のちびスライム。のんびり屋 | `#5CFF9A` / `#FFFFFF` | |
| `flamingoPet` | フラミー | 片足立ちが得意なひなフラミンゴ。気取り屋 | `#FF7FB0` / `#FFD23F` | |
| `catPet` | ネオンにゃん | 路地裏生まれ。光るものが大好きな気まぐれ | `#B04DFF` / `#19F0FF` | |
| `dronePet` | ピコドローン | 回収アームつきの小型ドローン。働き者 | `#19F0FF` / `#FF3DD2` | ○ |
| `dolphinPet` | ドルフィ | 空中をすいすい泳ぐ不思議なイルカ。人懐っこい | `#4DA6FF` / `#BFF6FF` | ○ |
| `gatorPet` | ワニ太郎 | グランパ・ゲイターの孫…らしい。噛まない、甘えん坊 | `#3F8F3A` / `#FFD23F` | |
| `ghostPet` | チップくん | カジノで負け続けた亡霊。今は幸運の味方。ちょっと臆病 | `#E8F0FF` / `#FFD23F` | ○ |
| `robotPet` | ボルトくん | 宇宙港の整備ロボ。几帳面に全部拾う | `#C9CCD6` / `#FF8A00` | |
| `dragonPet` | ネオンドラゴン | 摩天楼の頂に棲む小竜。誇り高いが寂しがり | `#FF3D7F` / `#FFF06A` | ○ |
| `alienPet` | ピポ | 謎の宇宙船から付いてきた。テレパシーで拾う不思議ちゃん | `#5CFF9A` / `#7A3DFF` | ○ |

親密度のオーラ・ハート・きらめきはゲームが重ねるので描かない（リボン・王冠はスプライト版では今は出ない → §9）。参考: `ref_pets.png`。

---

## 6. 表情一覧（face_f.png / face_m.png の行）
| 行 | 意味・使われる場面 | 描き方 |
|---|---|---|
| `neutral` | 通常（待機・歩き） | 大きな瞳、口は小さな弧。cute は口角上げ、cool はやや半目・水平の口 |
| `smile` | 喜び（ガッツポーズ cheer・会話） | neutral の目のまま口角を上げてにっこり。**今のコードは単独の表情が弱い→新しく描いてほしい** |
| `shout` | 攻撃中 | 目を見開き眉を吊り上げ、口を大きく開ける（中は `#C2304A`） |
| `hurt` | 被ダメ | `> <` の目、食いしばった口、汗 |
| `happy` | レベルアップ・勝利 | `^ ^` の目、開いた笑顔 |
| `jito` | あきれ（ジト目） | 上まぶたを下げた半目、平らな口 |
| `angry` | 怒り・悪役 | 眉を内側へ下げ、目を細く鋭く |
| `sad` | 落ち込み・HP 25% 以下の待機 | 困り眉、目を伏せ気味、への字口 |
| `wink` | 決めポーズ | 片目を閉じる、笑顔 |
| `blink` | まばたき（数秒に 1 回） | 目を閉じた線 |
| `dead` | 戦闘不能 | `× ×` の目 |
| `aim` | 銃を構える | 片目を細めて狙う、口は不敵に |
| `panic` | 逃げる・慌てる（市民など） | 目を見開いて口を大きく開ける、困り眉 |

参考: `ref_faces.png`（3 クラス × ♂♀ × 表情）。瞳の構造: 虹彩（上が暗く下が明るい縦グラデ）→ 瞳孔 → ハイライト大（右上）＋小（左下）→ 太い上まつ毛（外側を跳ね上げ）。頬の赤み `rgba(255,110,150,0.45)`。

---

## 7. 服破れの描き方（全年齢）
HP が減ると服が破れていく（メイプル的な「やられ」表現）。`tear_1〜3` は上着・下衣の**上に重ねる**レイヤー（破れ目・すす・ほつれ・絆創膏）。

| 段階 | いつ | 描くもの |
|---|---|---|
| tear_1 | HP 75% 以下 | 上着に小さな穴 1〜2 個、すり傷のような線、少しのすす |
| tear_2 | HP 50% 以下 | 裾・袖口のギザギザ、膝の穴、穴が増える。穴の中は**インナーの色**（`#3A3346` / 下 `#2A2633`） |
| tear_3 | HP 25% 以下 | 大きな裂け目、袖が片方ちぎれる、すす汚れ、絆創膏。疲れた表情（`sad`）と汗 |

**線引き（必ず守る）**
- 破れ目から見えるのは**インナー（タンクトップ＋スパッツ）だけ**。肌が見えてよいのは腕・脚・すねなど普段から出ている所まで。胸・お腹・お尻・下着は絶対に見せない。
- 血・傷口・あざは描かない（すり傷の白い線・すす・絆創膏で表現）。
- 体のラインを強調するポーズ・構図にしない。男女で表現の程度を変えない。
- 参考: `ref_heroes.png` の「HP25%（破れ）」列、`docs/images/tear.png`。
- スプライト版では**裾のギザギザ・袖が短くなる等の「形の変化」は再現されない**（tear レイヤーを上に重ねるだけ）。ギザギザに見せたいときは tear レイヤーに「破れた縁＋その奥のインナー色」を描き込んで表現する。

---

## 8. 今のコード描画の弱点メモ（ここを伸ばしてほしい）
参考画像を見ると分かる、今の絵の弱いところ。差し替えで特に良くしてほしい点です。

1. **背面（climb）がのっぺり**: ほとんどの髪型で後ろ姿が同じ「丸い頭」になる（`ref_hair.png` の背面列）。髪型ごとの後ろ姿・ツインテやポニーテールの揺れを。
2. **ポーズが硬い**: idle が直立に近く、歩きも腕・脚の振り子だけ。体重移動・ひねり・溜めのある攻撃、着地の潰れ、ジャンプの伸びなど**メリハリのある動き**を。
3. **攻撃の溜めと決めが弱い**: 敵の windup / attack は表情が変わるだけのものが多い（`ref_enemies_*.png`）。予備動作（後ろに引く・膨らむ・光る）がひと目で分かる形に。被弾（hurt）ものけぞりを大きく。
4. **ボスの第2形態が色替え中心**: 形やパーツの変化（壊れる・変形・武器が増える・目が光る）で「本気になった」感を。
5. **手・足先・小物が小さく潰れる**: 画面上 80px では手が丸い点、靴やアクセが読みにくい。デフォルメして大きめに。
6. **dead（倒れ）がセルに収まりにくい**: 横倒しで体がはみ出しがち（`ref_heroes.png` の dead 列）。座り込み・膝をつく等、枠内に収まる倒れ方でもよい。
7. **人型の敵が主人公と同じ体**: チンピラ・警官・SWAT がマネキンの着せ替えに見える。体格（ガタイ・猫背）、悪そうな表情で差を。
8. **smile（微笑み）表情が無い**: 会話・喜び用に新しく。
9. **質感の描き分け**: 金属（ロボ・ゴーレム）、ゼリー（スライム）、羽毛（カモメ・フラミンゴ）、布の違いをもう一段。
10. **小さく表示されても読めること**: `ref_scale.png` の実プレイ画面で、主人公は画面の約 1/9 の高さ。細かい描き込みより**シルエット・色の塊・目**で勝負。

---

## 9. 注意点・相談事項
- **スプライト版で今は未対応のもの**（コード描画にはあるが、PNG に差し替えると出ない／変わらない）:
  | 項目 | 今の扱い | 描いてもらう場合 |
  |---|---|---|
  | 服破れの裾ギザギザ・袖の短縮 | tear の重ねだけ | `tear_1〜3_<f/m>.png` の中に描き込む（§7） |
  | 逃げる市民などの慌てポーズ | walk 行で代用 | 人型レイヤーに **`panic` 行**を追加（コマ数は walk と同じ 8 が目安）して manifest の `rows` に `"panic": 8` を足す。顔は face の `panic` 行 |
  | 敵の夜のリムライト・ネオンの縁取り | シートに入らない（夜も昼と同じ絵） | 今は行名なし（仕組み側の対応待ち）。描くなら昼の絵を基本に |
  | PET 親密度のリボン（Lv10）・王冠（Lv20） | スプライト時は出ない | 今は行名なし（仕組み側の対応待ち）。オーラ（Lv30）はゲームが描く |
- **差し色（accent）は今は付かない**: tint は 1 ファイル 1 色（主色）。例えば「ピンクのパーカーの白いひも」は主色で塗られてしまう。差し色が大事な装備は、色付きで描いて tint を外す（色違いアイテムも同じ色になる）か、仕組み側の対応を待つ。
- **顔（瞳）は tint しない**: 顔は白目・口も含むので色まで描く。キャラ作成で選べる他の瞳の色は、その色の `face_<f|m>__<色>.png` が無いと基本の顔の瞳色で表示される。
- **ファイル数が多い**: 人型は「部品 × 性別 × 武器の持ち方」で分かれるため、主人公まわりだけで 250 枚以上ある。S → A → B の順に。
- セルの大きさ・基準点は**テンプレートと同じに**。変えたら manifest の `cell` / `anchor` を直す。
- 1 枚の PNG は大きくても 4096×4096 まで。
- 作業前後の比較は F2 の切り替えで。不具合（ずれ・欠け）があればファイル名と状態名を添えて連絡。

---

## 10. このフォルダの中身
| ファイル | 内容 |
|---|---|
| `README.md` | この申し送り書 |
| `ASSET_LIST.csv` | 全納品ファイルの一覧（パス, 種類, ID, 名前, 行（状態）, セル, 優先度, tint, 備考）。`node tools/gen_asset_list.mjs` で再生成 |
| `ref_heroes.png` | 主人公 3 クラス×♂♀の今の見た目（全状態、2 倍＝納品サイズ） |
| `ref_faces.png` | 表情（face の行ごと） |
| `ref_hair.png` | 髪型 14 種（♀・♂・背面・tint 見本） |
| `ref_equip_hat/top/bottom/shoes/accessory/weapon.png` | 装備の全スタイル・全色違い（主色/差し色の HEX 付き） |
| `ref_enemies_<地域>.png` | 地域別の全敵（ID・名前・Lv・セル・優先度・5 状態） |
| `ref_bosses.png` | ボス 7 体（通常 / 溜め / 第2形態） |
| `ref_pets.png` | PET 10 種（4 状態＋親密度 Lv30 の参考） |
| `ref_palette.png` | 配色見本（主人公・地域・レア度・オーラ色・共通） |
| `ref_scale.png` | ゲーム画面上の実寸比較（等倍の並び＋実プレイ画面） |

参考画像は `node tools/gen_art_refs.mjs` で作り直せる（ゲームの描画関数から書き出し）。テンプレートは [`assets/sprites_template/`](../../assets/sprites_template/)（`npm run export:sprites`）。
