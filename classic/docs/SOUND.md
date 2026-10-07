# 音（BGM と効果音）

ルミナリア・クラシックの音の一覧と作り方。方針は DESIGN.md 4 章（地域の音楽の感じ）と 6 章（音の方向）。

- **すべてオリジナル**。クラシックの曲のメロディ・和音の進み・リズムの型は写さない。似せるのは「曲調・楽器の組み合わせ・テンポ・雰囲気」だけ。外部の音声ファイル・データは使わない。
- 目指す雰囲気: 明るく親しみやすい、MIDI・ゲーム音源らしい少しおもちゃっぽい音色、地域ごとにはっきり違う曲調、1 曲 1〜2 分のループ。
- 音はサンプルを使わず Web Audio で合成する（`classic/src/audio/`）。楽譜は JS のデータ（`classic/src/audio/songs/`）。Unity 版へはブラウザで書き出した ogg を渡す（4 章）。
- 状態: ✅ できた / 🎼 次に作る / ・ まだ

## 1. BGM の一覧

「クラシックの雰囲気」は、クラシックのどの**種類**の曲の感じに寄せるか（曲そのものではない）。

### 1-1. 画面・共通

| ID | 使う所 | テンポ | 調・拍子 | 楽器 | 雰囲気 | クラシックの雰囲気 | 状態 |
|---|---|---|---|---|---|---|---|
| title | タイトル画面 | 92 | C 長調・4/4 | ストリングス・ピアノ・ベル・パッド・ティンパニ風の太鼓 | 広がりのある、これから冒険が始まる期待 | ログイン画面のオーケストラ風の曲 | ✅ |
| login | キャラ選び・作成 | 84 | F 長調・4/4 | ピアノ・オルゴール・パッド | 静かで温かい。何度聞いても疲れない | キャラ選び画面のゆったりした曲 | ✅ |
| ship | 船の旅（島→港の演出） | ♩.=66 | G 長調・6/8 | フルート・アコーディオン・ギター・ベース・ベル | 波に揺られる。わくわく | 船で大陸へ渡るときの曲 | ✅ |

### 1-2. 町（ループ 1〜2 分。のんびり、長く聞いても邪魔にならない）

| ID | 町 | テンポ | 調・拍子 | 楽器 | 雰囲気 | クラシックの雰囲気 | 状態 |
|---|---|---|---|---|---|---|---|
| town_beginner | 芽吹き村（S003） | 108 | D 長調・4/4 | フルート（旋律）・ナイロンギター・アコーディオン・ベル・ストリングス・ベース・軽い太鼓 | のどかな漁村の朝。明るい笛 | 初心者の島の村の曲 | ✅ |
| town_port | ブリーズ港（V100） | ♩.=76 | A 長調・6/8 | アコーディオン・ベル（鐘）・ギター・ベース・タンバリン | 港の活気、潮風、旅立ち | 大陸の港町の曲 | ✅ |
| town_pom | ポム丘（V200） | 104 | F 長調・3/4 | フルート・アコーディオン（ンチャチャ）・ピチカート・ベース | のどかな丘と風車。ワルツ | 弓使いの村ののどかな曲 | ✅ |
| town_silva | シルワ森都（V300） | 84 | E ドリア・3/4 | ハープ・フルート・ストリングス・ベル | 夕暮れの森、ランタン。少し不思議 | 魔法使いの森の町の幻想的な曲 | ✅ |
| town_gard | ガルド岩台（V400） | 92 | D ドリア・4/4 | 大太鼓・タム・低めの笛・ストリングス・ピチカート・ホルン | 乾いた風、勇ましい | 戦士の岩山の町の曲 | ✅ |
| town_crow | クロウ街（V500） | 96 スイング | C 短調・4/4 | 口笛風の笛・ウォーキングベース・ピアノ・ブラシとライド | 夜の街、霧、少し怪しいジャズ | 盗賊の夜の街のジャズ風の曲 | ✅ |
| town_nemuri | ねむり谷（V600） | 76 | F# 短調・4/4 | 木琴（マリンバ）・パッド・ハープ・水の滴 | 薄暗い森の底の静けさ、湯気 | 森の奥の静かな村の曲 | ✅ |
| market | にぎわい市場（V090） | 132 | B♭ 長調・4/4（2 拍子のポルカ） | アコーディオン・トランペット風の金管・チューバ風の低い金管・ベル・タンバリン・手拍子 | にぎやかなポルカ | 自由市場のにぎやかな曲 | ✅ |
| town_ceres | セレス（C100） | 96 | E♭ 長調・4/4 | 明るいストリングス・ハープ・ベル・合唱風パッド | 雲の上の白い都、金色の光 | 空の上の都の曲 | ✅ |
| town_hyoga | ヒョウガ村（F100） | 84 | A 長調・3/4 | ピアノ・ベル・ストリングス | 雪、暖炉の温かさ | 雪の村の曲 | ✅ |
| town_tinkle | ティンクル（T100） | 132 | C 長調・4/4（マーチ） | グロッケン・オルゴール・おもちゃの小太鼓・ファゴット風の低い木管・小さな金管 | おもちゃのマーチ | おもちゃの町の曲 | ✅ |
| town_marina | マリナ（M100） | ♩.=60 | A♭ 長調・6/8 | カリンバ・ハープ・柔らかいパッド・ベル・泡の音 | 海の底、泡の光、ゆったり | 海底の都の曲 | ✅ |
| town_dragon | 竜の背の村（D100） | 86 | F 短調・4/4 | 大太鼓・ティンパニ・低めの笛・ストリングス・ホルン・ピチカート | 大きな空と骨の村、雄大 | 竜の谷の村の曲 | ✅ |
| camp | 神殿前・焔の門前・星見の塔の野営地 | 70 | E 長調・4/4 | ハープ（旋律と分散和音）・パッド・ベル | 一息つく、短めのループ（約 69 秒） | 終盤の小さな休み場の曲 | ✅ |

### 1-3. 狩場・道（町より少し速く、前向き。ループ 1〜2 分）

| ID | 地域・マップ | テンポ | 調・拍子 | 楽器 | 雰囲気 | クラシックの雰囲気 | 状態 |
|---|---|---|---|---|---|---|---|
| field_island | 芽吹きの島の狩場・小道（S001〜S009） | 120 | G 長調・4/4 | フルート・ピチカート・グロッケン・小太鼓（軽く） | 冒険の始まり、草原、明るい | 初心者の島の草原の曲 | ✅ |
| field_port | 港のまわり・海岸（V101〜） | 126 | E 長調・4/4 | トランペット風の金管・ストリングス・ギター（8 分の刻み）・太鼓 | 海辺を駆ける | 港のまわりの草原の曲 | ✅ |
| field_pom | ポム丘の丘・花畑 | 116 シャッフル | G 長調・4/4 | フルート・アコーディオン・ギター・ブラシ | 花畑、ピクニック | 弓使いの村のまわりの曲 | ✅ |
| field_silva | シルワの森 | 96 | A 短調・4/4 | ハープ・マリンバ・パッド・フルート | 深い森、木漏れ日 | 魔法使いの森の狩場の曲 | ✅ |
| field_gard | ガルドの岩山 | 132 | A 短調・4/4 | 金管・スピッカートの刻み・ストリングス・タム | 岩山を登る、緊張と勇気 | 戦士の岩山の狩場の曲 | ✅ |
| field_crow | クロウ街の工事現場・地下鉄 | 112 | E♭ 短調・4/4 | エレピ風の鍵盤・はねるベース・16 分のハイハット・金床 | 夜の工事現場、地下鉄 | 盗賊の街の地下鉄の曲 | ✅ |
| field_swamp | 沼・下水 | 100 | G 短調・4/4 | 低いクラリネット風・マリンバ・ベース | じめじめ、少しおどけた | 沼地の曲 | ✅ |
| field_sky | セレスのまわり・雲の塔 | 120 | B♭ 長調・4/4 | フルート・ストリングス・ハープ・ベル | 空を飛ぶような | 空の都のまわりの曲 | ✅ |
| field_snow | 雪原・雪の頂 | 104 | E 短調・4/4 | ストリングス（旋律）・ベル・ハープ・パッド | 冷たい風、白い世界 | 雪原の曲 | ✅ |
| field_toy | 時の塔・おもちゃの工場 | 112 | B♭ 短調・4/4 | オルゴール・ピチカート・ファゴット風の木管・時計の音・歯車 | 機械じかけ、ちょっと不気味 | 時計塔の曲 | ✅ |
| field_sea | 海の中 | 88 | F 長調・4/4 | 合唱風の声（旋律）・ハープ・パッド・ベル・泡の音 | ゆらゆら、広い海 | 海の中の曲 | ✅ |
| field_dragon | 竜の谷 | 120 | C 短調・4/4 | ホルン風の金管・ストリングス・合唱風の声・大太鼓 | 力強い、大きな生き物の気配 | 竜の森の曲 | ✅ |
| field_volcano | 焔の坑道 | 140 | E フリギア・4/4 | 金管・低いスピッカート・合唱風の声・低いタム・金床 | 熱い、重い | 火山の曲 | ✅ |
| field_star | 星の果て | 80 | D♭ 長調・4/4 | オーケストラ風（ホルン・ストリングス・ハープ・ベル・パッド・ティンパニ） | 静かで大きい、旅の終わり | 最終地域の静かな大曲 | ✅ |

### 1-4. ダンジョン・ボス

| ID | 使う所 | テンポ | 調・拍子 | 楽器 | 雰囲気 | クラシックの雰囲気 | 状態 |
|---|---|---|---|---|---|---|---|
| dungeon_deep | ねむり谷の地下ダンジョン | 70 | D 短調・4/4 | 低いストリングス・パッド・水の滴る音 | 暗い地下、青い光 | 地下ダンジョンの曲 | ✅ |
| dungeon_temple | 古の神殿 | 64 | G# 短調・4/4 | 小さなパイプオルガン・合唱風の声・ストリングス・遠くの大太鼓 | 止まった時間、白い石 | 神殿の曲 | ✅ |
| pq | 1 人用ダンジョン（PQ） | 126 | B 短調・4/4 | ピチカート（旋律）・木琴の 16 分・オルゴール・時計の音・手拍子 | 少し急かす、パズル | パーティクエストの曲 | ✅ |
| boss_mid | 中ボス（キノコの女王・大ワニ など） | 150 | D 短調・4/4 | ブラス・ストリングス・太鼓 | 緊張、でも怖すぎない | ボス戦の曲 | ✅ |
| boss_big | 大ボス（時計塔の魔物・焔の巨像 など） | 160 | C# 短調・4/4 | 金管・合唱風パッド・重い太鼓 | 大きな敵、手に汗 | 大ボスの曲 | ✅ |
| boss_final | 三つ首の黒竜・最後の敵 | 144（C の段は 3 連で 6/8 のように） | F 短調・4/4 | オーケストラ風すべて（金管・16 分のストリングス・合唱・ティンパニ・大太鼓） | 最後の戦い | 最終ボスの曲 | ✅ |

### 1-5. ファンファーレ・ジングル（くり返さない短い曲）

Unity 用は `classic-unity/Audio/BGM/<id>.ogg`（1 回＋残響。`loop: false`）、一覧は manifest の `jingle` の欄。BGM の上に鳴らし、その間 BGM を小さくする（web 版は `playJingle(id)`）。どのお知らせで鳴らすかは manifest の `events.jingle`（4 章）。

| ID | いつ | 長さ（曲＋残響） | 楽器 | 雰囲気 | 状態 |
|---|---|---|---|---|---|
| jingle_levelup | Lv アップ | 2.0＋1.8 秒 | 金管・ベル・ストリングス・ティンパニ・シンバル | 3 連で駆け上がる明るい上昇（D 長調） | ✅ |
| jingle_jobup | 転職 | 5.5＋1.8 秒 | 金管・ホルン・ストリングス・ベル・ティンパニのロール・シンバル | 晴れやか、少し荘厳（E♭ 長調） | ✅ |
| jingle_quest | クエスト完了 | 1.8＋1.8 秒 | ピアノ・ベル・トライアングル | 「できた！」（F 長調） | ✅ |
| jingle_boss_clear | ボスを倒した・1 人用ダンジョンを抜けた | 4.0＋0.8 秒 | 金管・ホルン・ストリングス・ティンパニ・大太鼓・シンバル | 勝利（C 長調） | ✅ |
| jingle_death | 自分が倒れた | 3.3＋1.0 秒 | ピアノ・パッド | 静かな下降（A 短調） | ✅ |
| jingle_ship | 船が出る・着く | 2.7＋1.8 秒 | 汽笛風の低い金管の和音・ベル | 旅立ち（C 長調） | ✅ |

### 1-6. マップと曲の対応

マップの曲は各マップのデータ（`classic-unity/Data/maps/<id>.json` の `bgm`）に書いてある。どの曲をどのマップが使っているかは manifest の各曲の `maps`。マップが使う曲はすべてそろった（`bgmFallback` は空）。

| マップ | 曲 |
|---|---|
| S000 目覚めの浜 | field_island（最初の 1 回だけ波の音から入る） |
| S001・S002・S004〜S009 | field_island |
| S003 芽吹き村・S011 村の訓練所 | town_beginner |
| S010 旅立ちの桟橋 | town_beginner（船に乗ると ship） |

## 2. できた曲

### 2-1. 一覧（BGM 37 曲）

- すべてオリジナル。クラシックの曲からは「曲の種類ごとの編成・テンポ・明るさ・ループの長さ」だけを寄せた（メロディ・和音の進み・リズムの型は写していない）。
- ファイル: Unity 用は `classic-unity/Audio/BGM/<id>.ogg`（**ループ部分だけ**。`AudioSource.loop = true` でそのままくり返せる）と `<id>_intro.ogg`（イントロ。先に鳴らし、終わる時刻に `<id>.ogg` を `PlayScheduled` でつなぐ）。どの ID がどのファイルかは `classic-unity/Audio/audio_manifest.json`。試聴は `classic/assets/audio/preview/<id>.mp3`（イントロから 30 秒、最後 2 秒で消える）。
- ループ点: 書き出しの WAV（`preview/<id>.wav`、git には入れない）は「イントロ＋ループ 1 周」で、smpl チャンクのループが「ループ点（サンプル）〜最後」。44.1kHz。
- 大きさ: ループ部分の RMS を -16dBFS にそろえ、最大は -2dBFS まで（静かな曲はその分小さい）。
- まだ作っていない曲をマップが使っているときは、manifest の `bgmFallback` に雰囲気の近い代わりの曲を書く（作ったら書き出しで自動で外れる）。今はマップが使う曲が全部そろったので空。
- 2 回目（26 曲）は、前の 11 曲と似すぎないよう調・テンポ・編成を散らした（同じ調の曲は、テンポ・拍子・旋律の楽器のどれかをはっきり変えた）。伴奏の型は `songs/_kit.js` から使い回す。
- ジングル（6 曲）は 1-5 の表。

<!-- BGM_TABLE_START -->
| ID | 曲名 | 雰囲気・楽器 | テンポ | 調・拍子 | 長さ（イントロ＋ループ） | 構成（小節） | ループ点（サンプル） | Unity の ogg |
|---|---|---|---|---|---|---|---|---|
| title | ルミナリアの空へ | 広がり・期待。ストリングスとホルン風の金管が歌い、ピアノの分散和音・ベル・ティンパニ | 92 | C 長調・4/4 | 10.4 秒＋93.9 秒 | intro 4 → A 16 B 8 A2 8 tag 4（ループ 36 小節） | 460174 | 1.43 MB |
| login | はじまりの灯 | 静かで温かい。オルゴールの旋律、ピアノのゆっくりした分散和音、パッド | 84 | F 長調・4/4 | 5.7 秒＋91.4 秒 | intro 2 → A 8 A2 8 B 8 A 8（ループ 32 小節） | 252000 | 1.00 MB |
| town_beginner | 芽吹き村の朝 | のどかな漁村の朝。笛・ギター・アコーディオンの「ンチャ」 | 108 | D 長調・4/4 | 8.9 秒＋97.8 秒 | intro 4 → A 16 B 8 A2 16 tag 4（ループ 44 小節） | 392000 | 1.48 MB |
| town_port | 潮風の港 | 港の活気と潮風。6/8 で揺れるアコーディオン、港の鐘、ギター、タンバリン | 付点4分=76 | A 長調・6/8 | 6.3 秒＋75.8 秒 | intro 4 → A 16 B 8 A2 16 C 8（ループ 48 小節） | 278526 | 1.14 MB |
| town_ceres | 白い雲の都 | 雲の上の白い都。ストリングスがゆったり歌い、ハープ・ベル・合唱風パッド | 96 | Eb 長調・4/4 | 5.0 秒＋100.0 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 220500 | 1.57 MB |
| field_island | はじまりの草原 | 冒険の始まり、明るい。はずむ笛、ピチカート、グロッケン。C で E♭・F へ寄り道 | 120 | G 長調・4/4 | 4.0 秒＋96.0 秒 | intro 2 → A 16 B 8 C 8 A2 16（ループ 48 小節） | 176400 | 1.36 MB |
| field_silva | 木漏れ日の小径 | 深い森と木漏れ日、少し不思議。ハープの分散和音、笛、木琴（D の和音でドリアの色） | 96 | A 短調・4/4 | 5.0 秒＋100.0 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 220500 | 1.48 MB |
| field_swamp | ぬかるみの行進 | じめじめ、少しおどけた。切れぎれの低いクラリネット、木琴、はねるベース。B で A♭ へずれる | 100 | G 短調・4/4 | 4.8 秒＋96.0 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 211680 | 1.11 MB |
| dungeon_deep | 青い地底湖 | 暗い地下と青い光（洞くつ）。低いストリングスとパッド、ぽつりと置くベル、水の滴る音 | 70 | D 短調・4/4 | 6.9 秒＋82.3 秒 | intro 2 → A 8 B 8 A2 8（ループ 24 小節） | 302400 | 1.02 MB |
| boss_mid | 立ちはだかる影 | 緊張、でも怖すぎない。8 分・16 分で刻むストリングス、金管の旋律、ティンパニ | 150 | D 短調・4/4 | 3.2 秒＋76.8 秒 | intro 2 → A 16 B 8 A2 16 C 8（ループ 48 小節） | 141120 | 1.18 MB |
| boss_big | 時を喰らうもの | 大きな敵、手に汗。大太鼓、合唱風パッド、16 分の刻み、半音上の D の和音で不気味さ | 160 | C# 短調・4/4 | 3.0 秒＋84.0 秒 | intro 2 → A 16 B 8 A2 16 C 8 D 8（ループ 56 小節） | 132300 | 1.28 MB |
| ship | 波間の航路 | 波に揺られて、わくわく。笛がゆったり 6/8 で歌い、ギターの分散和音とアコーディオンが波のように付いてくる | 付点4分=66 | G 長調・6/8 | 3.6 秒＋72.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 160364 | 1.06 MB |
| town_pom | 風車の丘のワルツ | のどかな丘と風車のワルツ。笛が歌い、アコーディオンが 2・3 拍目で「ンチャチャ」、ピチカートとベース | 104 | F 長調・3/4 | 3.5 秒＋83.1 秒 | intro 2 → A 16 B 8 A2 16 C 8（ループ 48 小節） | 152654 | 1.13 MB |
| town_silva | ランタンの森都 | 夕暮れの森とランタン、少し不思議。3 拍子でハープが流れ、笛がドリア（C# の明るい 6 度）で歌う。ストリングスとベル | 84 | E ドリア・3/4 | 4.3 秒＋85.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 189000 | 1.26 MB |
| town_gard | 岩台の太鼓 | 乾いた風、勇ましい。低い太鼓とタムが大きく刻み、笛が低めの所でドリア（B の明るい 6 度）の旋律を吹く | 92 | D ドリア・4/4 | 5.2 秒＋83.5 秒 | intro 2 → A 16 B 8 A2 8（ループ 32 小節） | 230087 | 1.16 MB |
| town_crow | 霧の路地のジャズ | 夜の街、霧、少し怪しいジャズ。口笛風の笛がブルージーに歌い、ウォーキングベース、ピアノの和音、ブラシとライド | 96 スイング | C 短調・4/4 | 5.0 秒＋80.0 秒 | intro 2 → A 8 A2 8 B 8 A 8（ループ 32 小節） | 220500 | 1.11 MB |
| town_nemuri | 湯けむりの谷 | 薄暗い森の底の静けさと湯気。木琴がぽつぽつ歌い、B ではハープが受け取る。パッドが湯気のように包む | 76 | F# 短調・4/4 | 6.3 秒＋75.8 秒 | intro 2 → A 8 B 8 A2 8（ループ 24 小節） | 278526 | 1.06 MB |
| market | にぎわい広場のポルカ | にぎやかなポルカ。アコーディオンがはねる旋律、チューバ風の低い金管が「ブン」、和音が「チャ」 | 132 | B♭ 長調・4/4 | 3.6 秒＋87.3 秒 | intro 2 → A 16 B 8 C 8 A2 16（ループ 48 小節） | 160364 | 1.26 MB |
| town_hyoga | 暖炉の灯る雪村 | 雪と暖炉の温かさ。ピアノがやさしいワルツを弾き、ストリングスが包む。B は雪が降るようにベルが歌う | 84 | A 長調・3/4 | 4.3 秒＋85.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 189000 | 1.06 MB |
| town_tinkle | ブリキのマーチ | おもちゃのマーチ。グロッケンとオルゴールが付点のはずむ旋律、ファゴット風の低い木管が「ブン・ブン」、おもちゃの小太鼓 | 132 | C 長調・4/4 | 3.6 秒＋72.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 160364 | 1.04 MB |
| town_marina | 泡の灯の都 | 海の底、泡の光、ゆったり。カリンバ（親指ピアノ）が 6/8 でゆれる旋律、ハープの分散和音、柔らかいパッド、泡の音 | 付点4分=60 | A♭ 長調・6/8 | 4.0 秒＋80.0 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 176400 | 1.19 MB |
| town_dragon | 竜の背の村 | 大きな空と骨の村、雄大。大太鼓とティンパニがゆっくり鳴り、笛が低めの所で長い音を吹く | 86 | F 短調・4/4 | 5.6 秒＋89.3 秒 | intro 2 → A 16 B 8 A2 8（ループ 32 小節） | 246140 | 1.23 MB |
| camp | 焚き火のそばで | 一息つく、短めのループ。ハープがゆっくり歌い、パッドとベルが包む。焚き火のはぜる音（シェイカーを小さく） | 70 | E 長調・4/4 | 6.9 秒＋68.6 秒 | intro 2 → A 8 B 8 tag 4（ループ 20 小節） | 302400 | 1.01 MB |
| field_port | 海辺を駆けて | 海辺を駆ける。トランペット風の金管が元気に歌い、ギターが 8 分で和音を刻み、太鼓がはっきり 2・4 拍 | 126 | E 長調・4/4 | 3.8 秒＋76.2 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 168000 | 1.20 MB |
| field_pom | 花畑のピクニック | 花畑でピクニック。シャッフル（はねる 8 分）で、笛が楽しく歌い、ギターの分散和音とアコーディオンの「ンチャ」 | 116 スイング | G 長調・4/4 | 4.1 秒＋82.8 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 182483 | 1.21 MB |
| field_gard | 岩山を登る | 岩山を登る、緊張と勇気。短いストリングス（スピッカート）が 8 分で刻み、金管が勇ましく歌い、タムが大きく鳴る | 132 | A 短調・4/4 | 3.6 秒＋72.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 160364 | 1.08 MB |
| field_crow | 終電のない地下鉄 | 夜の工事現場と地下鉄。エレピ風の鍵盤が旋律、はねるベース、16 分のハイハット、ときどき金床の「かーん」 | 112 | E♭ 短調・4/4 | 4.3 秒＋85.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 189000 | 1.28 MB |
| field_sky | 風の階段 | 空を飛ぶような、明るく伸びやかな曲。笛が長い音で歌い、ハープが上へ駆け上がる分散和音、ストリングス、ベル | 120 | B♭ 長調・4/4 | 4.0 秒＋96.0 秒 | intro 2 → A 16 B 8 C 8 A2 16（ループ 48 小節） | 176400 | 1.45 MB |
| field_snow | 白い風の雪原 | 冷たい風と白い世界。ストリングスが長い音で歌い、ハープとパッドが雪のように包む | 104 | E 短調・4/4 | 4.6 秒＋73.8 秒 | intro 2 → A 16 B 8 A2 8（ループ 32 小節） | 203538 | 1.17 MB |
| field_toy | ぜんまい仕掛けの塔 | 機械じかけで、ちょっと不気味。オルゴールが半音でゆれる旋律を弾き、ピチカートと | 112 | B♭ 短調・4/4 | 4.3 秒＋85.7 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 189000 | 1.11 MB |
| field_sea | ゆらめく海の道 | ゆらゆら、広い海。合唱風の声（「あー」）がゆっくり歌い、ハープの 8 分の分散和音が水のように流れ、パッドと泡の音 | 88 | F 長調・4/4 | 5.5 秒＋87.3 秒 | intro 2 → A 16 B 8 A2 8（ループ 32 小節） | 240545 | 1.41 MB |
| field_dragon | 竜の谷を往く | 力強い、大きな生き物の気配。ホルン風の金管が太く歌い、ストリングスが 4 分で分散和音、合唱風の声が後ろで伸び、 | 120 | C 短調・4/4 | 4.0 秒＋80.0 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 176400 | 1.22 MB |
| field_volcano | 焔の坑道 | 熱い、重い。低いタムと大太鼓が打ち続け、金管が E フリギア（半音上の F）の短い句で迫る | 140 | E フリギア・4/4 | 3.4 秒＋82.3 秒 | intro 2 → A 16 B 8 A2 16 C 8（ループ 48 小節） | 151200 | 1.18 MB |
| field_star | 星の果ての旅路 | 静かで大きい、旅の終わり。ホルン風の金管がゆっくり歌い、ハープが上へ流れ、ストリングスとパッドが広がる | 80 | D♭ 長調・4/4 | 6.0 秒＋96.0 秒 | intro 2 → A 16 B 8 A2 8（ループ 32 小節） | 264600 | 1.54 MB |
| dungeon_temple | 止まった時の神殿 | 止まった時間、白い石。小さなパイプオルガンがゆっくり歌い、合唱風の声とストリングスが長く伸び、遠くで大太鼓 | 64 | G# 短調・4/4 | 7.5 秒＋75.0 秒 | intro 2 → A 8 B 8 C 4（ループ 20 小節） | 330750 | 1.06 MB |
| pq | 試しの回廊 | 少し急かす、パズルを解く感じ。はじく弦（ピチカート）が 8 分で動き回り、木琴が 16 分で刻み、時計の音が後ろで鳴る | 126 | B 短調・4/4 | 3.8 秒＋76.2 秒 | intro 2 → A 16 B 8 A2 16（ループ 40 小節） | 168000 | 1.07 MB |
| boss_final | 三つ首の黒竜 | 最後の戦い。オーケストラ風すべて: 金管の旋律、16 分で刻むストリングス、合唱風の声、ティンパニと大太鼓 | 144 | F 短調・4/4 | 3.3 秒＋80.0 秒 | intro 2 → A 16 B 8 C 8 A2 16（ループ 48 小節） | 147000 | 1.22 MB |
<!-- BGM_TABLE_END -->

### 2-2. 「芽吹き村の朝」（town_beginner）の中身

- 楽譜: `classic/src/audio/songs/town_beginner.js`
- 試聴: `classic/assets/audio/preview/town_beginner.mp3`（30 秒）。Unity 用は `classic-unity/Audio/BGM/town_beginner.ogg`（ループ）と `town_beginner_intro.ogg`（イントロ）。イントロ 8.9 秒＋ループ 97.8 秒。
- D 長調・4/4・108 BPM。
- 構成（小節）: イントロ 4（最初の 1 回だけ）→ A 16 → B 8 → A' 16 → つなぎ 4 →（A へ戻る）。ループは 44 小節。

| 区間 | 和音 | 中身 |
|---|---|---|
| イントロ | D・Bm7・Gmaj7・A7sus4→A7 | ベルの分散和音とギターのゆっくりしたアルペジオ、トライアングル。最後に笛が「入り」の 3 音 |
| A | D・Gmaj7・F#m7・Bm7・Em7・A7・D・A7sus4→A7 / D・Gmaj7・F#m7・B7・Em7・Gm6・D/A→A7・D | 笛の主旋律（付点のはずむ形）。ギター 8 分のアルペジオ、アコーディオンが裏拍で「ンチャ」、2 拍子のベース、木魚風の軽い打ち物とシェイカー。後半は B7 と借りてきた Gm6 で少し懐かしい色 |
| B | Gmaj7・A6・F#m7・Bm7・Gmaj7・A・B♭maj7・A7sus4→A7 | 笛は長い音でゆったり。アコーディオンとストリングスが和音を伸ばし、ベルが合いの手。7 小節目の B♭ で一瞬遠くへ行って戻る |
| A' | A と同じ和音 | 主旋律の後半を 1 オクターブ近く上げて盛り上げる。ストリングスを薄く足し、小太鼓とタンバリン、頭にシンバル。ベルの対旋律 |
| つなぎ | Gmaj7・F#m7・Em7・A7 | 笛の短い下降と、イントロと同じ「入り」の 3 音で A へ戻る。最後の小節に小さな太鼓のフィル |

- 音域: 笛 D5〜A6、ベル F#5〜A#6、ギター D2〜B4、ベース C#2〜B2、アコーディオン A3〜G4、ストリングス D4〜C#5。

## 3. 効果音の一覧

すべて Unity 用に `classic-unity/Audio/SFX/<id>.ogg`（モノラル 44.1kHz、0.3〜2.6 秒）へ書き出してある（`node classic/tools/render_sfx.mjs`）。大きさは種類ごとに決めた最大値（UI・足音 -14〜-10dBFS、動き -13〜-7、攻撃・当たり -7〜-3、ボス登場・ボスの段階 -2）にそろえてあるので、Unity 側では同じ音量で鳴らしてよい。

音はすべて合成（`classic/src/audio/sfx.js`）。音量は BGM と別（`setVolume({ sfx })`）。同じ音が一度にたくさん鳴りすぎないよう、同じフレームの同じ音は 1 回にまとめる（敵の出現・当たり・ドロップは特に）。

全 100 個（1 回目 24 個＋2 回目 76 個）。

| ID | いつ | 長さ | 大きさ（最大） |
|---|---|---|---|
| ui_click | ボタン・一覧を選ぶ | 0.40 秒 | -12 dBFS |
| ui_open | ウィンドウを開く | 0.40 秒 | -12 dBFS |
| ui_close | ウィンドウを閉じる | 0.40 秒 | -12 dBFS |
| ui_ok | 決定 | 0.60 秒 | -10 dBFS |
| ui_cancel | 取り消し | 0.45 秒 | -11 dBFS |
| ui_error | できない操作 | 0.56 秒 | -12 dBFS |
| jump | ジャンプ | 0.40 秒 | -8 dBFS |
| ladder | はしご・縄の 1 段（上り下りで一定間隔に鳴らす） | 0.35 秒 | -12 dBFS |
| land | 高い所から着地 | 0.44 秒 | -9 dBFS |
| portal | ポータルを通る | 1.60 秒 | -6 dBFS |
| atk_sword1 | 片手武器の振り | 0.46 秒 | -6 dBFS |
| atk_sword2 | 両手・重い武器の振り | 0.56 秒 | -5 dBFS |
| hit | 敵に当たる | 0.49 秒 | -4 dBFS |
| crit | クリティカル | 0.49 秒 | -3 dBFS |
| hurt | 自分が殴られる | 0.49 秒 | -5 dBFS |
| mob_die_s | 小さな敵が倒れる | 0.49 秒 | -7 dBFS |
| mag_cast | 魔法の詠唱 | 1.50 秒 | -6 dBFS |
| boss_appear | ボスの登場 | 3.31 秒 | -2 dBFS |
| pickup | アイテムを拾う | 0.70 秒 | -8 dBFS |
| coin | お金を拾う | 0.80 秒 | -8 dBFS |
| potion | 薬を飲む | 0.60 秒 | -9 dBFS |
| levelup | Lv アップ | 2.60 秒 | -3 dBFS |
| quest_accept | クエストを受ける | 1.00 秒 | -7 dBFS |
| quest_done | クエスト完了 | 2.40 秒 | -4 dBFS |
| ui_equip | 装備する・外す | 0.39 秒 | -11 dBFS |
| shop_buy | 店で買う | 1.00 秒 | -8 dBFS |
| shop_sell | 店で売る | 0.90 秒 | -8 dBFS |
| storage | 倉庫に預ける・出す | 0.46 秒 | -9 dBFS |
| craft | 製作・精錬 | 1.40 秒 | -7 dBFS |
| chest_open | 宝箱を開ける | 1.40 秒 | -7 dBFS |
| scroll_ok | 書（強化）の成功 | 1.60 秒 | -5 dBFS |
| scroll_fail | 書の失敗 | 1.00 秒 | -7 dBFS |
| scroll_break | 書の失敗で装備が壊れる | 0.91 秒 | -4 dBFS |
| jobup | 転職（ジングルと一緒） | 2.40 秒 | -4 dBFS |
| death | 自分が倒れた | 1.91 秒 | -5 dBFS |
| revive | 生き返る | 1.80 秒 | -6 dBFS |
| quest_fail | クエスト失敗 | 1.23 秒 | -8 dBFS |
| sit | 椅子に座る | 0.38 秒 | -11 dBFS |
| quiz_ok | クイズ正解 | 1.00 秒 | -8 dBFS |
| quiz_ng | クイズ不正解 | 0.60 秒 | -10 dBFS |
| room_enter | ボスの間・ダンジョン・試験の部屋に入る | 2.32 秒 | -5 dBFS |
| room_timeup | 制限時間が切れた | 1.40 秒 | -6 dBFS |
| mech_glass | 仕掛け: 時の裂け目・かけら | 1.00 秒 | -7 dBFS |
| mech_rock | 仕掛け: 岩が砕ける | 0.52 秒 | -4 dBFS |
| mech_door | 仕掛け: 扉が開く | 1.39 秒 | -5 dBFS |
| mech_splash | 仕掛け: 水にもぐる・出る | 0.70 秒 | -6 dBFS |
| ship_horn | 船の汽笛 | 1.65 秒 | -4 dBFS |
| buff_end | 強化が切れる | 0.60 秒 | -11 dBFS |
| rope | 縄の 1 段（上り下りで一定間隔に鳴らす） | 0.42 秒 | -13 dBFS |
| grab | はしご・縄につかまる | 0.32 秒 | -11 dBFS |
| jump_down | 下へ飛び降りる | 0.45 秒 | -12 dBFS |
| drop | アイテムが落ちる | 0.40 秒 | -11 dBFS |
| drop_meso | お金が落ちる | 0.35 秒 | -12 dBFS |
| atk_dagger | 短剣の振り | 0.43 秒 | -7 dBFS |
| atk_axe | 斧の振り | 0.63 秒 | -5 dBFS |
| atk_blunt | 鈍器の振り | 0.65 秒 | -5 dBFS |
| atk_spear | 槍・矛の突き | 0.47 秒 | -6 dBFS |
| atk_claw | 手裏剣を投げる | 0.47 秒 | -7 dBFS |
| atk_bow | 弓を射る | 0.59 秒 | -6 dBFS |
| atk_xbow | 弩を射る | 0.45 秒 | -6 dBFS |
| atk_wand | 杖・ワンドの通常攻撃 | 0.70 秒 | -8 dBFS |
| atk_knuckle | ナックル（殴る） | 0.40 秒 | -5 dBFS |
| atk_gun | 銃（撃つ） | 0.34 秒 | -5 dBFS |
| skill_swing | スキル: 斬る | 0.66 秒 | -4 dBFS |
| skill_stab | スキル: 突く | 0.59 秒 | -4 dBFS |
| skill_shoot | スキル: 撃つ・射る | 0.61 秒 | -4 dBFS |
| skill_throw | スキル: 投げる | 0.55 秒 | -5 dBFS |
| skill_punch | スキル: 殴る | 0.90 秒 | -4 dBFS |
| mag_fire | 魔法: 火 | 1.10 秒 | -4 dBFS |
| mag_ice | 魔法: 氷 | 1.40 秒 | -5 dBFS |
| mag_thunder | 魔法: 雷 | 0.96 秒 | -3 dBFS |
| mag_poison | 魔法: 毒 | 0.88 秒 | -6 dBFS |
| mag_holy | 魔法: 聖 | 1.60 秒 | -5 dBFS |
| mag_dark | 魔法: 闇 | 1.50 秒 | -5 dBFS |
| heal | 回復 | 1.40 秒 | -6 dBFS |
| buff | 強化がかかる | 1.20 秒 | -6 dBFS |
| summon | 召喚 | 1.20 秒 | -6 dBFS |
| dash | 移動スキル（突進・瞬間移動） | 0.50 秒 | -7 dBFS |
| mob_attack | 敵の攻撃 | 0.47 秒 | -7 dBFS |
| mob_cast | 敵の技の構え・予兆 | 1.40 秒 | -5 dBFS |
| mob_skill_hit | 敵の技が当たる | 0.49 秒 | -4 dBFS |
| mob_summon | 敵が手下を呼ぶ | 0.90 秒 | -7 dBFS |
| mob_buff | 敵の強化 | 1.12 秒 | -6 dBFS |
| dispel | 強化を崩す・消す | 0.63 秒 | -7 dBFS |
| mob_spawn | 敵が出てくる | 0.43 秒 | -14 dBFS |
| mob_die_m | 中くらいの敵が倒れる | 0.66 秒 | -6 dBFS |
| mob_die_l | 大きな敵が倒れる | 1.27 秒 | -3 dBFS |
| boss_phase | ボスの段階が変わる | 2.30 秒 | -2 dBFS |
| st_poison | 状態異常: 毒 | 0.82 秒 | -8 dBFS |
| st_stun | 状態異常: 気絶 | 0.90 秒 | -7 dBFS |
| st_freeze | 状態異常: 凍結 | 0.54 秒 | -7 dBFS |
| st_sleep | 状態異常: 睡眠 | 1.20 秒 | -8 dBFS |
| st_curse | 状態異常: 暗闇・封印・呪い・弱体・鈍足・混乱・変身 | 1.20 秒 | -7 dBFS |
| status_end | 状態異常が時間で切れる | 0.60 秒 | -12 dBFS |
| status_cure | 状態異常が治る | 0.90 秒 | -8 dBFS |
| status_resist | 状態異常を防いだ | 0.52 秒 | -9 dBFS |
| pet_adopt | ペットを迎える | 1.40 秒 | -7 dBFS |
| pet_feed | ペットにえさ | 0.55 秒 | -10 dBFS |
| pet_happy | ペットが喜ぶ（親密度アップ・芸の成功） | 0.70 秒 | -9 dBFS |
| pet_sulk | ペットがすねる（空腹・芸の失敗） | 0.80 秒 | -10 dBFS |

### 3-1. Core のお知らせ → 音（manifest の `events`）

`classic-unity/Audio/audio_manifest.json` の `events` に、Core の `GameEventType`（`classic-unity/Core/Game/GameEvents.cs`。全 73 種類）ごとに鳴らす効果音とジングルを書いてある。元は `classic/src/audio/events.js`（書き出しのとき manifest へそのまま写す）。`node classic/tests/audio_unit.mjs` が「GameEventType を全部書いてあるか」「武器・スキルの属性と動き・状態異常の種類をすべて覆っているか」「書いた ID の音があるか」を確かめる。

値の決め方:

- 文字 = いつもその音。`null` = 鳴らさない（表示だけ、または別のお知らせの音に任せる）
- `{ byId | byValue | byText: {...}, default }` = GameEvent の Id / Value / Text で選ぶ（Id と Text は前方一致。値の中にさらに決め方を入れてよい）
- `{ rule: "weapon" }` = 今の武器の種類 → `weaponSfx`（片手剣 atk_sword1、両手剣 atk_sword2、斧 atk_axe、鈍器 atk_blunt、槍・矛 atk_spear、短剣 atk_dagger、クロー atk_claw、弓 atk_bow、クロスボウ atk_xbow、ナックル・素手 atk_knuckle、銃 atk_gun、ワンド・スタッフ atk_wand）
- `{ rule: "skill" }` = スキルのデータ（skills.json）→ `skillSfx`。`order` の順に、属性（element: 火 mag_fire・氷 mag_ice・雷 mag_thunder・毒 mag_poison・聖 mag_holy・闇 mag_dark）→ 種類（kind: buff・heal・summon・movement=dash）→ 動き（motion: 斬る skill_swing・突く skill_stab・撃つ skill_shoot・投げる skill_throw・殴る skill_punch・唱える mag_cast）→ 弾の種類（SkillUsed の Text）→ 武器の種類
- `{ rule: "mobSize" }` = 敵のデータ（monsters.json）: boss がある・kind が boss/raid は mob_die_l、tough/elite か高さ 70 以上は mob_die_m、ほかは mob_die_s
- `{ rule: "status" }` = 状態異常の種類 → `statusSfx`（毒 st_poison・気絶 st_stun・凍結 st_freeze・睡眠 st_sleep、ほか（暗闇・封印・呪い・弱体・鈍足・混乱・変身）は st_curse）。時間で切れたときは `status_end` を主人公だけ
- お知らせの無い物: はしご・縄の上り下りは `climb`（ladder / rope を 0.3 秒ごと）、敵の動き（Motion の attack1 / skill1）は `mobMotion`（mob_attack）。敵の技の予兆は MobCast の mob_cast

| GameEventType | 効果音 | ジングル |
|---|---|---|
| Jump | jump |  |
| Land | land |  |
| Grab | grab |  |
| DownJump | jump_down |  |
| RopeJump | jump |  |
| Hurt | hurt |  |
| AttackStart | 武器の種類で weaponSfx |  |
| AttackHit | （鳴らさない） |  |
| SkillUsed | スキルで skillSfx |  |
| SkillFailed | ui_error |  |
| MobHit | Text status:→（鳴らさない）、Text pull→grab、Text steal→coin、Text dispel→dispel、Text debuff→st_curse、ほか hit |  |
| MobDied | 敵の大きさで mobSize |  |
| MobSpawned | mob_spawn |  |
| DropSpawned | drop |  |
| ItemPicked | pickup |  |
| MesoPicked | coin |  |
| InventoryFull | ui_error |  |
| ExpGained | （鳴らさない） |  |
| LevelUp | levelup | jingle_levelup |
| ApChanged | ui_click |  |
| SpChanged | ui_click |  |
| JobAdvanced | jobup | jingle_jobup |
| BuffStarted | buff |  |
| BuffEnded | buff_end |  |
| Healed | heal |  |
| QuestStarted | quest_accept |  |
| QuestProgress | （鳴らさない） |  |
| QuestCompleted | quest_done | jingle_quest |
| QuestFailed | quest_fail |  |
| MapChanged | （鳴らさない） |  |
| PortalUsed | portal |  |
| Travel | Value 0→ship_horn、ほか portal | Value 0→jingle_ship、ほか （鳴らさない） |
| ItemUsed | Id use.return.→portal、Id use.master_book.→Value 0→scroll_fail、Value 1→scroll_ok、ほか scroll_fail、ほか potion |  |
| ItemBought | shop_buy |  |
| ItemSold | shop_sell |  |
| EquipChanged | ui_equip |  |
| ScrollResult | Value 0→scroll_ok、Value 1→scroll_fail、Value 2→scroll_break、ほか ui_error |  |
| Died | death | jingle_death |
| Revived | revive |  |
| Saved | （鳴らさない） |  |
| SaveFailed | ui_error |  |
| Message | （鳴らさない） |  |
| StatusApplied | 状態異常の種類で statusSfx |  |
| StatusEnded | status_end（主人公だけ） |  |
| StatusCured | status_cure |  |
| StatusResisted | status_resist |  |
| MobCast | mob_cast |  |
| MobSkillHit | mob_skill_hit |  |
| MobSummoned | mob_summon |  |
| BossPhase | boss_phase |  |
| StorageChanged | storage |  |
| Crafted | craft |  |
| ChestOpened | chest_open |  |
| SatDown | sit |  |
| StoodUp | （鳴らさない） |  |
| PetAdopted | pet_adopt |  |
| PetFed | pet_feed |  |
| PetCloseness | pet_happy |  |
| PetTrick | Value 0→pet_sulk、Value 1→pet_happy、ほか pet_happy |  |
| PetHungry | pet_sulk |  |
| PetUsedPotion | potion |  |
| RoomEntered | room_enter |  |
| RoomTimeUp | room_timeup |  |
| RoomFailed | quest_fail |  |
| DungeonCleared | （鳴らさない） | jingle_boss_clear |
| BossKilled | （鳴らさない） | jingle_boss_clear |
| QuizQuestion | ui_open |  |
| QuizAnswered | Value 0→quiz_ng、Value 1→quiz_ok、ほか quiz_ng |  |
| QuizCleared | quest_done |  |
| MobBuffed | mob_buff |  |
| MobBuffEnded | buff_end |  |
| MobDispelled | dispel |  |
| Mechanic | Id rift_open→mech_glass、Id rift_filled→mech_glass、Id rift_reset→mob_cast、Id rift_exposed→mech_glass、Id rift_guarded→status_resist、Id shard_got→pickup、Id submerge→mech_splash、Id surface→mech_splash、Id rock_broken→mech_rock、Id clones→summon、Id shuffle→dash、Id pulled→grab、Id decoy_hit→hit、Id decoy_broken→mech_rock、Id ship_broken→mech_rock、Id door_open→mech_door、Id door_used→portal、Id zone_start→mag_poison、ほか mob_cast |  |

## 4. 仕組み

| ファイル | 中身 |
|---|---|
| `src/audio/index.js` | 入口。`playBgm(id)` / `stopBgm()` / `playSfx(id)` / `playJingle(id)`（ジングル。鳴っている間は曲を小さく）/ `setVolume({bgm,sfx})` / `getVolume()` / `unlockAudio()`。最初のキー・クリック・タッチで音を出せるようにし、それより前の `playBgm` は覚えておいて操作のときに鳴らす。音量は端末に保存（`lumi_audio_v1`）。画面が隠れたら止める |
| `src/audio/synth.js` | 音源。ピアノ・ストリングス・短いストリングス（spicc）・ピチカート・パッド・合唱風（choir）・ブラス・フルート・クラリネット風・ベル・オルゴール・アコーディオン・ナイロンギター（はじく弦を JS で計算）・ハープ・マリンバ・ベース・エレピ風（epiano）・口笛風（whistle）・小さなパイプオルガン（organ）・カリンバ（kalimba）、太鼓（キック・スネア・木魚風・リム・ハイハット・シェイカー・タンバリン・トライアングル・シンバル・タム・低いタム・ティンパニ風・大太鼓・水の滴・時計のカチ・手拍子・ブラシ・ライド・金床・歯車・泡）。倍音（PeriodicWave）・エンベロープ・フィルター・ビブラート、作った残響（ConvolverNode） |
| `src/audio/score.js` | 楽譜の読み方と、曲を「いつ・何を鳴らすか」の一覧に変える（DOM 無し。テストから読む）。`song.swing` で裏の 8 分をはねさせる（スイング・シャッフル） |
| `src/audio/bgm.js` | パートごとのミキサー（音量・左右・残響）、少し先まで予約して鳴らす再生機（イントロ→ループのくり返し）、書き出し用の `renderSong`（ジングルは 1 回＋残響） |
| `src/audio/sfx.js` | 効果音（100 個）。`SFX[id]` と、説明・書き出しの大きさ・長さの `SFX_INFO[id]` |
| `src/audio/songs/` | 曲の楽譜（1 曲 1 ファイル）と一覧 `index.js`。ジングルは `jingles.js` にまとめて、使い回す伴奏の型は `_kit.js` |
| `src/audio/events.js` | Core のお知らせ（GameEventType）→ 効果音・ジングルの対応表（3-1）。書き出しで manifest の `events` へ |
| `tools/render_bgm.mjs` | 曲を書き出す（playwright の chromium ＋ OfflineAudioContext、PORT=8711）。Unity 用 ogg（ループ・イントロ）、試聴 mp3（30 秒。ジングルは全部）、WAV（ループ位置つき）、manifest（bgm・jingle・events・bgmFallback）。`node classic/tools/render_bgm.mjs`（全部）/ `--song=town_port` |
| `tools/render_sfx.mjs` | 効果音を書き出す（モノラル ogg）。`node classic/tools/render_sfx.mjs`（全部）/ `--sfx=jump,coin` |
| `tools/lib/audio_render.mjs`・`audio_manifest.mjs` | 書き出しの共通部分（サーバー・ブラウザ・WAV・ffmpeg）と manifest の更新 |
| `tests/audio_unit.mjs` | 楽譜の検査（小節の拍の数・音域・ループの長さ・楽器の名前・メロディの跳び）、効果音の一覧と GameEventType の対応表の抜け。`node classic/tests/audio_unit.mjs` |
| `tests/audio_files.mjs` | 書き出したファイルの検査（ffmpeg で読み戻す）: 最大 -1dBFS 以下、ループ 60〜120 秒、長さが manifest と合う、ループのつなぎ目とイントロ→ループの境目にプチ音・途切れが無い、1 曲 2MB まで、効果音・ジングルの頭と終わりが無音、マップが使う曲が全部ある（bgmFallback が空）、events の ID がすべて一覧にある。`node classic/tests/audio_files.mjs` |

### 楽譜の書き方（短く）

- 3/4 の曲（town_pom・town_silva・town_hyoga）は `beatsPerBar: 3`、`meter: '3/4'`。太鼓は 16 分 × 12。
- スイング・シャッフルの曲（town_crow・field_pom）は `swing: 0.14〜0.16`（裏の 8 分を拍の何分だけ遅らせるか）。
- 太鼓の 1 小節の文字の数は自由（12 個にすると 3 連の 8 分。boss_final の C の段）。
- 6/8 の曲（town_port・ship・town_marina）は 8 分音符を 1 拍として書く（`beatsPerBar: 6`、bpm は 8 分の速さ、`meter: '6/8'`）。q = 8 分、h. = 付点 4 分、w. = 1 小節。太鼓は 16 分 × 12。
- `melody: true` のパートがメロディの検査（跳び・同じ音の連続）の対象。

- 1 小節 = 1 つの文字列。`"F#5:q. A5:e D6:q C#6:e B5:e"`（高さ:長さ。w=4 拍・h=2・q=1・e=0.5・s=0.25、`.` で付点、`t` で 3 連、`~` で次の同じ音とつなぐ。休符は `r`）。
- 和音は小節ごとに `'D'`、2 つなら `'D/A A7'`（等分）。伴奏（ギター・ベース・アコーディオン・ストリングス）は和音と「伴奏の型」（`patterns`）から自動で作る。太鼓は 16 分 × 16 の `x` / `o` の並び。
- `range` に各パートの音域を書く。テストで外れた音を見つける。

### 曲を作るときの約束

1. 既存の曲（クラシックを含む）のメロディ・和音の進み・リズムの型を写さない。作った後、有名な曲の一節に聞こえないか自分で見直し、似ていたら直す。
2. 作曲の道具・音楽生成 AI を使う場合も、既存の曲名・作品名を指定しない。
3. 1 曲 1〜2 分のループ。ループのつなぎ目で音が切れないこと（書き出しでは 2 周目の頭を使い、残響ごとつながるようにしてある）。
