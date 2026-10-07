# ルミナリア・クラシック 試遊版（ブラウザ）

Unity 版が遊べるようになるまでの確認用。**中身は Unity 版と同じ C# の Core（`classic-unity/Core`）をそのまま WebAssembly で動かしている**（.NET 8 の素の WASM。Blazor は使っていない）。
JS が持つのは入力・描画（canvas）・音・窓だけで、物理・戦闘・スキル・敵・成長・クエスト・店・セーブはすべて Core。呼び方は `docs/CORE.md` 3 章（Unity の `GameRunner` と同じ流れ）。

絵は**仮**（四角や丸で描いた敵、ブラウザの試作の仮のアバター）。実在のゲームの絵は使っていない。

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
| `src/FrameWriter.cs` | 毎フレームの描く物を小さな JSON に（主人公・HUD・敵・ドロップ・飛び道具・予兆・ボスの HP バー・ダメージの数字・お知らせ・NPC の電球・会話・クイズ・制限時間・ペット） |
| `src/Ui.cs`・`src/Actions.cs` | 窓の中身と、UI からの操作（CORE.md の「UI から呼ぶ操作」: 話す・クエスト・店・宿屋・乗り物・タクシー・倉庫・製作・装備・書・AP・SP・クイックスロット・1 次/2 次転職・起き上がる・セーブ・クイズ）。`dbg*` は自動の確かめ用 |
| `wwwroot/main.js` | 起動・入力・1 フレームの流れ（`GameRunner.cs` と同じ） |
| `wwwroot/js/render.js` | 描画（背景・地形の型ごとの色・足場・縄・はしご・ポータル・NPC・敵・ドロップ・主人公・予兆・ダメージの数字・ミニマップ・ボスの HP バー） |
| `wwwroot/js/ui.js` | HUD と窓（持ち物・装備・能力値・スキル・クエスト・会話・店・倉庫・設定） |
| `wwwroot/js/audio.js` | BGM（イントロ → ループ）・ジングル・効果音（`audio_manifest.json` の events の表どおり） |
| `wwwroot/js/avatar/`・`pixel.js` | `classic/src/render/` の仮のアバターのコピー（攻撃・構え・座るの動きを足した） |

## 操作

| キー | 動き |
|---|---|
| ← → | 歩く |
| ↑ | はしご・縄につかまる・上る / ポータルに入る |
| ↓ | 伏せる / 下りる（↓＋ジャンプで浮いた足場から下へ） |
| Alt・Space・C | ジャンプ |
| Ctrl・X | 攻撃（押しっぱなしでくり返す） |
| Z | 拾う |
| Enter | 話す・調べる（NPC はクリックでも話せる） |
| Shift A D F G V B Y ／ 1〜8 | クイックスロット 16 個（スキル・薬。窓の「クイックに置く」で置く。右クリックで外す） |
| I / E / S / K / Q | 持ち物 / 装備 / 能力値（AP）/ スキル（SP）/ クエスト |
| O | 設定（BGM・効果音の音量・消音・セーブ・読み直す・書き出す・最初から） |
| M / H / Esc | ミニマップ / キーの表 / 窓を閉じる |

画面は 800×600 を整数倍に拡大（ドットがぼけない）。セーブは自動（マップ移動・Lv アップ・クエスト完了・3 分ごと・タブを閉じる/裏に回る時）と、設定の「今すぐセーブ」。

## 確かめたこと（`tools/playtest.mjs`）

新しく始める → 歩く・ジャンプで岩を越える・伏せ → 案内人と話してクエストを受ける → ポータルで隣のマップ → コロ貝を倒す・拾う → Lv アップ → 縄を登る → AP・SP を振る・スキルをクイックスロットに置いて使う → はしごを登る → BGM と効果音 → セーブして読み直す（マップ・Lv・経験値・お金・持ち物・クイックスロットが同じ）→ 村の店で買う → 転職官と話して 1 次転職。コンソールのエラー 0・1 フレーム（Core + 描画）平均 約 1 ms。

## まだ無い物（仮の試遊版の割り切り）

- 絵は全部仮（敵は動きの種類ごとの形と色、ボスは冠）。スキルのエフェクト・飛び道具（主人公の矢・投げ星）の絵は無い（音とダメージの数字だけ）。
- 時の裂け目・身代わり人形・秘術の扉・毒の霧・光る岩の専用の絵は無い（ボスの HP バーの「守られている」「潜っている」の字と予兆の四角だけ）。
- ペット・極意の書・名札などの細かい窓は最低限（持ち物から「使う」）。キー設定の変更は無い。
