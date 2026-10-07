# ルミナリア・クラシック 試遊版（ブラウザ）

Unity 版が遊べるようになるまでの確認用。**中身は Unity 版と同じ C# の Core（`classic-unity/Core`）をそのまま WebAssembly で動かしている**（.NET 8 の素の WASM。Blazor は使っていない）。
JS が持つのは入力・描画（canvas）・音・窓だけで、物理・戦闘・スキル・敵・成長・クエスト・店・セーブはすべて Core。呼び方は `docs/CORE.md` 3 章（Unity の `GameRunner` と同じ流れ）。

絵は**仮**（四角や丸で描いた敵）だが、**主人公・芽吹きの島の敵 5 体（＋色違い 2）・UI はクラシック風の見本**に描き直した（下の「絵の見本」）。実在のゲームの絵は使っていない・写していない。

## 作り方

```
# .NET 8 SDK と wasm-tools ワークロード（dotnet workload install wasm-tools）が要る
node classic-unity/Web/tools/make_dist.mjs              # dotnet publish -c Release → classic-unity/Web/dist/
node classic-unity/Web/tools/make_dist.mjs --no-publish # JS・CSS・データだけ直した時（publish し直さない）
node classic-unity/Web/tools/playtest.mjs               # Chromium で自動で遊んで確かめる（写真は shots/）
```

- `dist/` は git に入れない（`.gitignore`）。公開はメインが `dist/index.html` をそのまま出す（ほかのファイルは相対パス）。
- 開く時は HTTP で（`npx http-server classic-unity/Web/dist` など）。`file://` では WASM が読めない。
- Core のテスト（`dotnet test Tests/Lumina.Core.Tests.csproj`）は Web のプロジェクトを参照しない（壊さない）。

### dist/ の中身（約 100 個・約 50 MB。上限 1 ファイル 15MB・合計 200MB・250 個の中）

| ファイル | 中身 |
|---|---|
| `index.html`・`main.js`・`style.css`・`js/`（7 個） | 画面（`wwwroot/` のまま） |
| `_framework/`（9 個・約 2.7 MB） | .NET の WebAssembly（`dotnet.js`・`dotnet.native.wasm`・`System.Private.CoreLib.wasm`・Core 入りの `Lumina.Web.wasm` など。トリミング済み） |
| `data.json`（約 2 MB） | `Data/*.json` と `maps/*.json`（234 枚）を 1 つにまとめた物 |
| `sfx.json`（約 1.5 MB） | 効果音 100 個（`Audio/SFX/*.ogg`）を base64 で 1 つにまとめた物 |
| `audio/audio_manifest.json`・`audio/BGM/`（80 個・約 43 MB） | BGM（イントロとループ）・ジングル |

`make_dist.mjs` の最後に、まとまりごとの数と大きさ・合計・上限の判定が出る。

## しくみ

| 場所 | 役目 |
|---|---|
| `Lumina.Web.csproj` | `../Core/**/*.cs` をそのまま取り込む（Core には何も足していない） |
| `src/Program.cs` | `[JSExport]` の口: `Boot`（セーブがあれば続きから）・`NewGame`（系統なしの初心者）・`Frame(dt, 入力のビット, スキル, アイテム, 押しっぱなしのスキル)`・`GetUi`・`Act`・`ExportSave`。データは `[JSImport] dataText` で data.json から、セーブは localStorage を「ファイル」に見立てた `IFileSystem` で Core の `SaveStore`（壊れない書き方・bak1〜3）をそのまま使う |
| `src/FrameWriter.cs` | 毎フレームの描く物を小さな JSON に（主人公・HUD・敵・ドロップ・飛び道具・予兆・ボスの HP バー・ダメージの数字・お知らせ・NPC の頭の上のマーク（1 = 受けられる「？」・2 = 報告できる電球）・会話・クイズ・制限時間・ペット） |
| `src/CollectionUi.cs` | 図鑑・勲章・記録・全体マップの印（Actions の `book` / `medals` / `records` / `world` / `medal`） |
| `src/Ui.cs`・`src/Actions.cs` | 窓の中身と、UI からの操作（CORE.md の「UI から呼ぶ操作」: 話す・クエスト・店・宿屋・乗り物・タクシー・倉庫・製作・装備・書・AP・SP・クイックスロット・1 次/2 次転職・起き上がる・セーブ・クイズ）。`dbg*` は自動の確かめ用 |
| `wwwroot/main.js` | 起動・入力・1 フレームの流れ（`GameRunner.cs` と同じ） |
| `wwwroot/js/render.js` | 描画（背景・地形の型ごとの色・足場・縄・はしご・ポータル・NPC・敵・ドロップ・主人公・予兆・ダメージの数字・ミニマップ・ボスの HP バー） |
| `wwwroot/js/ui.js` | HUD と窓（持ち物・装備・能力値・スキル・クエスト・会話・店・倉庫・設定） |
| `src/Fun.cs`・`wwwroot/js/fun.js`・`js/avatar/parts_fun.js` | 楽しさの要素（`FunFrame`・`FunUi`・Act の続き → Core の `GameSession.Fun.cs`）: 町の機械・係の絵と窓、船の旅の残り時間、感情表現、髪型・顔・帽子・服の仮の部品、名札・吹き出し、珍しい個体の光、天気と季節の飾り、ダンジョンの仕掛け。ほかの画面のファイル（main.js・ui.js・render.js）には呼び出しとつなぎだけ |
| `wwwroot/js/audio.js` | BGM（イントロ → ループ）・ジングル・効果音（`audio_manifest.json` の events の表どおり） |
| `wwwroot/js/avatar/`・`pixel.js` | 主人公（クラシック風のちびキャラ。元は `classic/src/render/` の仮のアバターで、型紙に攻撃・構え・座るを足し、部品の絵を描き直した） |
| `wwwroot/js/art.js`・`wwwroot/art/` | 敵のドット絵（PNG）の読み込みと描画・UI の枠の絵（`tools/make_art.mjs` が作る） |

## 絵の見本（クラシック風。`tools/make_art.mjs`）

ジャンルの作法（約 2.5 頭身の大きな頭と目・1px の濃い色の線・光は左上の 3 段の塗り・明るく彩度の高い色・下の横長の状態の帯・丸みのある窓・太い縁取りの数字）だけに寄せ、形・顔・模様・色の組み合わせはすべてオリジナル。

| 物 | 作り方 | 置き場所 |
|---|---|---|
| 主人公 | コードで描く（`js/avatar/parts.js`・`parts_fun.js`）。形を Mask（楕円・多角形・太い線の足し引き）で作り、`pixel.js` の `paintMask` で「線・明るい縁・ふつう・暗い縁」に塗る。頭 24×22（頭身 約 2.5）、目は手前 4×7・奥 3×6。美容院の髪型 7・髪の色 8・顔 5・感情表現 7・帽子 12・肌 4・服の色をそのまま使える。動きは今の型紙（`skeleton.js`）のまま（立ち 3・歩き 4・ジャンプ・構え・振り 3・突き・撃つ・投げ・詠唱・殴り・縄 2・はしご 2・伏せ・座る） | 実行時に描く |
| 敵 | `node tools/make_art.mjs` が PNG を作る。M001 コロ貝・M003 ホコリダケ・M005 ポヨスライム・M006 ダイダイダケ・M007 大コロ貝（と色違いの M002 アオコロ貝・M004 アカコロ貝）。コマ: 立ち 3・動く 4・やられ 1・倒れる 3（跳ねる敵は宙 1 も）。大きさは monsters.json の width・height | `wwwroot/art/mobs/<ID>.png`・`art/mobs.json` |
| UI | 9 分割の枠（窓・ボタン・金のボタン・スロット・下の帯）を `make_art.mjs` が作り、`style.css` の最後の章が border-image で使う。ダメージの数字は `render.js` の 6×8 の字の型を 2 倍（クリティカルは 3 倍）＋縁取り・上が明るい 2 色。名前の札・敵の HP バー・剣・振りの弧もドットで描く | `wwwroot/art/ui/*.png` |

- 絵の無い敵・NPC は今までの仮の絵のまま（`js/art.js` が `art/mobs.json` にある敵だけ差し替える）。ドットは `imageSmoothingEnabled = false` と `image-rendering: pixelated`、整数倍の拡大でぼけない。
- 見本の写真: `node tools/art_shots.mjs`（島の狩り場 S005 に 5 体を `dbgSpawn` で並べる → `shots/art_lineup.png`・`art_battle.png`・`art_window.png`・`art_hud.png`）、`--tag before` で直す前の同じ場面（`art_before_*.png`）。コマの一覧は `shots/art_mobs_sheet.png`（`make_art.mjs`）と `shots/art_hero_sheet.png`（`node tools/hero_sheet.mjs`）。
- Unity へ: 主人公の基準点は ART_SPEC_UNITY.md の考え方（足元の中央・首・へそ・手・頭の中心 = brow）のまま。敵の PNG は右向き・足元の中央が基準点（`mobs.json` の ox・oy）なので、そのまま Sprite（PPU 1・Point）にできる。

## 操作

| キー | 動き |
|---|---|
| ← → | 歩く |
| ↑ | はしご・縄につかまる・上る / ポータルに入る |
| ↓ | 伏せる / 下りる（↓＋ジャンプで浮いた足場から下へ） |
| Alt・Space・C | ジャンプ |
| Ctrl・X | 攻撃（押しっぱなしでくり返す） |
| Z | 拾う |
| V（Enter も同じ） | 話す・調べる（いちばん近い、話せる距離の NPC・調べる物。NPC はクリックでも話せる） |
| 会話の窓が開いている間: V・Enter ／ ↑↓ ／ Esc | 光っているボタンを押す ／ 選ぶボタンを変える ／ 閉じる。決まりの順は「報告する → 話を聞く → 受ける → さようなら」なので、V を押し続けるだけで話しかけてクエストを受けて閉じられる。会話の間は主人公は動かない・攻撃しない |
| Shift A D F G T B Y ／ 1〜8 | クイックスロット 16 個（スキル・薬。窓の「クイックに置く」で置く。右クリックで外す。V は話すキーなので 6 番目は T） |
| I / E / S / K / Q | 持ち物 / 装備 / 能力値（AP）/ スキル（SP）/ クエスト |
| L / N / U / W | 敵の図鑑（カード）/ 勲章（1 つ付ける）/ 記録と統計（ジャンプの試練・椅子）/ 全体マップ |
| O | 設定（BGM・効果音の音量・消音・セーブ・読み直す・書き出す・最初から） |
| M / H / Esc | ミニマップ / キーの表 / 窓を閉じる |
| R ＋ 1〜7 ／ R だけ | 感情表現（にっこり・泣く・怒る・驚く・照れる・眠い・ウインク。数秒で戻る）／ 選ぶ帯を出す。F1〜F7 はブラウザが使うので R にした。R を押している間の数字はクイックスロットにならない |
| V（町の機械・係の前） | 景品の機械・遊び場・美容院・見た目の品の店・印の交換・祭りの係の窓（V・Esc で閉じる。開いている間は動かない） |

画面は 800×600 を整数倍に拡大（ドットがぼけない）。セーブは自動（マップ移動・Lv アップ・クエスト完了・1 分ごと・タブを閉じる/裏に回る時）と、設定の「今すぐセーブ」。

## 確かめたこと（`tools/playtest.mjs`）

新しく始める → 歩く・ジャンプで岩を越える・伏せ → 案内人の頭に「？」→ **V だけで**話しかける（「話を聞く」が光る）→ 話を聞く（「受ける」が光る）→ 受ける（「さようなら」が光る）→ 閉じる → もう一度 V で話すとセリフが変わり、クエストの残りを言う・会話の間は動かない・Esc で閉じる → ポータルで隣のマップ（報告先の頭に電球）→ コロ貝を倒す・拾う → Lv アップ → 縄を登る → AP・SP を振る・スキルをクイックスロットに置いて使う → はしごを登る → BGM と効果音 → セーブして読み直す（マップ・Lv・経験値・お金・持ち物・クイックスロットが同じ）→ 村の店で買う → 転職官と話して 1 次転職 → 図鑑のカードを拾うと数が増える（持ち物には入らない）→ L で図鑑（未発見はシルエット）→ N で勲章（付けると名前の上に札・装備の窓のメダルの欄）→ U で記録 → W で全体マップ（今いるマップに印）→ ポム丘の案内人からジャンプの試練に入り、1 つ目の足場に跳び乗る → R＋1 で感情表現（顔が変わり数秒で戻る）・R だけで帯 → 港の景品の機械（確率の表示・券が減って景品）・大当たりの画面全体の知らせ → 遊び場の五目並べ（15×15・係が置き返す）と神経衰弱 → 美容院で髪型と髪の色 → 雲の船の「船の旅で行く」で船の上（C118・BGM ship・残り時間）→「すぐ着く」→ フィールドボスが時間で湧く → 雪の地域の雪。コンソールのエラー 0・1 フレーム（Core + 描画）平均 約 1 ms。

## まだ無い物（仮の試遊版の割り切り）

- 絵は見本の物（主人公・島の敵 5 体＋色違い 2・UI）のほかは仮（敵は動きの種類ごとの形と色、ボスは冠）。スキルのエフェクト・飛び道具（主人公の矢・投げ星）の絵は無い（音とダメージの数字だけ）。
- 時の裂け目・身代わり人形・秘術の扉・毒の霧・光る岩の専用の絵は無い（ボスの HP バーの「守られている」「潜っている」の字と予兆の四角だけ）。
- ペット・極意の書・名札などの細かい窓は最低限（持ち物から「使う」）。キー設定の変更は無い。
