# ABYSS DROP — 作りの説明（担当向け）

ブラウザだけで動く放置ハクスラ。HTML5 Canvas（戦闘の画面）＋ DOM（窓・HUD）。ES Modules、ビルド不要。
`abyss/` の中だけで完結する（リポジトリの他のフォルダとは無関係）。

```
abyss/
  index.html, style.css
  src/
    main.js              起動・毎フレーム・自動セーブ・離れていた時間
    engine/              rng（シード付き乱数）, events（出来事の知らせ）, format（万・億・兆）, save, storage（localStorage / IndexedDB）
    data/                データだけ（ロジックなし）: stats, balance, rarity, classes, skills, items, materials, monsters, world
    game/                ゲームの中身（DOM を使わない → Node でも動く）
      game.js            Game 本体（state・combat・sys・報酬・経験値）
      state.js           セーブの形（名前空間: hero / inv / world / meta / settings）と migrate
      character.js       能力の計算 computeHero(state) → H
      skills.js          スキルの数値 resolveSkill / estimateDps
      combat.js          戦闘のシミュレーション（behaviors・monsterAbilities・statusDefs・power フック）
      items.js, loot.js  アイテムの数値・名前・生成（lootHooks）
      registry.js        拡張の登録所（ユニーク・宝石・伝説の力・主人公への効果の出どころ）
      content/index.js   中身を登録するファイルの import 一覧
      systems/           仕組み（game.sys.<id>）: world, inv, skills, offline, crafting, gems, codex, merchant, tree, rift, prestige, achievements, bestiary, bounties, pets
    render/
      assets.js          画像の登録所（差し替えの中心）
      manifest.js        枠の一覧をデータから作る
      painters/          コードで描く絵（差し替えが無いときの絵）
      paperdoll.js       主人公の着せ替えと動き
      scene.js           戦闘の画面（sceneHooks で演出を足す）
    ui/                  ui.js（画面の組み立て）, hud.js, tooltip.js, title.js, offline.js, dom.js, panels/*
    audio/audio.js       音
  assets/custom/         差し替え画像を置くフォルダ（custom.json が一覧）
  docs/  tools/  tests/
```

## 時間の進め方
- `game.update(実時間)` が 1/20 秒（`BAL.TICK`）ずつ `game.tick(dt)` を呼ぶ。速度の設定（×1〜×4）で回数が増える。
- 5 秒を超える空白（タブを離れた・閉じていた）は戦闘をせず `sys.offline.grant(秒)` で稼ぎを渡す（遊んでいる間の 1 秒あたりの稼ぎ × 効率）。
- `tick` の順: combat.tick → world の保留（ステージ開始）→ 各 sys.tick。

## 状態（state）の決まり
- セーブされるのは `game.state` だけ。JSON にできる値だけを入れる（Set・関数は不可）。
- 担当ごとの名前空間: hero（主人公・スキル・パッシブ）/ inv（持ち物）/ world（場所・難易度・裂け目）/ meta（お金・転生・実績・図鑑・日課・ペット・統計・解放）/ settings。
- 新しい項目は `state.js` の `newState()` に足す。古いセーブは `migrate()` の `fillDefaults` で自動的に埋まる。形を変えるときは `SAVE_VERSION` を上げて `migrate()` に変換を書く。
- 壊れたセーブも読めるように、`Game.load` は「新しく始めた直後のすべての仕組みの形」（`referenceState`）を手本に `repairTypes` で形の違う値を直し、`sanitizeLoaded` で数・装備・持ち物（`items.sanitizeItem`）・uid を整えてから各仕組みの `ensureState` を呼ぶ。`ensureState` は自分の名前空間の中身（`x ||= {}` で済まない物）も確かめる。

## 能力（ステータス）
- すべての効果は `{ s: '能力のキー', v: 数値 }`。キーは `data/stats.js`。`agg` が 'sum'（足し算）か 'mul'（掛け算）。
- `computeHero(state, game, { extraMods, equipOverride })` が装備・クラス・レベル・`registry.heroMods()` を集めて H を作る。
- 主人公への効果の出どころ（パッシブ・アビスLv・転生・実績・図鑑・ペット・セット効果）は `registry.addHeroSource(id, (state, game) => mods)` で登録する。
- 能力に効く物が変わったら `game.onStatsChanged()`（装備は `onGearChanged()`、スキルは `onSkillsChanged()`）を呼ぶ → combat.recalc。

## ダメージの式
```
1 回のダメージ = (武器ダメージの乱数 + 追加ダメージの合計) × スキルの% × dmgMul × (1 + 増加%/100) × 最終倍率 × クリティカル × (1 - 敵の耐性 + 貫通) × 被ダメ増加
増加% = 全ダメージ + 主能力×0.25 + 属性 + 属性全般 + タグ（攻撃/呪文/近接/投射/範囲/継続/召喚）+ スキル個別 + エリート/ボス/瀕死/種族
受けるダメージ = 物理なら × (1 - アーマー軽減)、属性なら × (1 - 耐性)、× (1 - 被ダメージ軽減)。回避・ブロックは先に判定
アーマー軽減 = armor / (armor + 80 × P(敵のレベル))（上限 85%）
```
数値の伸びは `data/balance.js` の `P(L)`（1.075^(L-1) × (1 + 0.04(L-1))）。装備の scale 能力・敵のライフ/攻撃が同じ曲線で伸びる。

## 戦闘（combat.js）
- `units`（主人公・召喚物・敵）, `projs`（弾）, `areas`（地面の効果・遅れて爆発・継続）, `fx`（見た目の出来事。scene が毎フレーム読み出す）。
- 主人公は「スキルバーの左から、使えるスキル（待ち時間・リソース・条件・射程）を自動で使う」。基本攻撃は最後。敵がいなければ前へ歩く。
- スキルの動き: `behaviors[behavior] = (c, caster, p, target) => {}`。今あるのは melee, projectile, nova, rain, chain, summon, buff。足すときは content のファイルで `behaviors.leap = ...` のように登録。
- ダメージは必ず `c.hitUnit(src, target, p, mult, opts)`（主人公側→敵）/ `c.damageAlly(u, amount, element, from)`（敵→味方）を通す（フック・状態異常・回復が効く）。
- 力（伝説の力・ユニーク・セット・キーストーン）: `registry.definePower({ id, name, desc(v), range, hooks: { modifySkill, onHit, onCrit, onKill, onCast, onTick, onDamaged } })`、今効いている力の一覧は `registry.addPowerSource(id, (state, game) => [{ id, v }])`。

## アイテム
- 形は `game/items.js` の先頭のコメント。生成は `generateItem(rng, opts)`（`loot.js`）。ユニーク・セット・ミシック・伝説の力・ソケット・レアの名前は `lootHooks` に差し込む。
- アイテムの効果は `itemMods(item)` に集まる（ベース固有・オプション・アーマー・registry の uniqueMods / socketMods / powerMods）。
- 受け取り（`sys.inv.receive`）: フィルタで自動分解 → 強くなりそうなら残す → バッグが満杯なら弱い物を分解して空ける。

## 進行（systems/world.js）
- ステージ = ウェーブ 20 回（`WAVES_PER_STAGE`。全滅で次）。ステージ 10 は地域のボス（30 秒）。勝つと次の地域を解放、自動前進なら移動。
- ふつうのステージで倒れたら、5 ウェーブごとの区切り（`WAVE_CHECKPOINT`）から続ける（最初からだと倒れやすい主人公が同じステージから出られない）。
- ボスに失敗（時間切れ・倒れた）→ 自動前進を切ってステージ 9 で稼ぐ。HUD の「ボスに挑む」で再挑戦。はじめて負けると祭壇の「再挑戦の誓い」（autoBoss）がただで開き、ステージ 9 を終えるたびに火力が足りたら（足りなくても 3 分ごとに）自動で挑む。魔境では踏破済みの地域でも挑む。
- 魔境（torment）・深淵の裂け目などのモードは `worldHooks.modes[mode] = { start, tick, onKill, onHeroDeath, level }` で足す。ウェーブの中身は `worldHooks.waveComposer`。

## 画像の差し替え（render/assets.js）
- すべての絵に枠 ID がある（manifest.js がデータから作る）。探す順: ゲーム内で入れた画像（IndexedDB）→ `assets/custom/custom.json` の画像 → 予備の ID → コードで描いた絵。
- 1 枚絵を前提に、動きは変形（揺れ・踏み込み・振り）でつける。コマ送りの横並び画像（frames）にも対応。
- キャラは足元が基準点、武器は握りが基準点。主人公の体には hand / offhand / head / back のアンカーがある。
- 演出（fx.*）は差し替えがあれば画像、無ければコードの演出（`assets.isCustom(id)` で分ける）。

## UI
- `ui/panels/index.js` の PANELS が右の窓のタブ。パネルは `{ id, name, icon, render(ui, el), refreshOn: ['inv','gear','skills','level','stats','world'], badge?(game), visible?(game), help? }`。
- 出来事（'invChanged' など）で印が付き、関係するパネルだけ描き直す（マウスが窓の上にある間は待つ。窓の中で押した・変えた直後はすぐ描き直す＝ `ui.afterAction()`）。
- タブは 5 つのまとまり（キャラ・鍛える・冒険・集める・その他）＋その中の窓（`ui/nav.js` の NAV_GROUPS。一覧に無い新しい窓は「その他」に入る）。印（数・NEW）はまとまりにも上がる。スマホではまとまりが画面の下のタブになる。
- 機能は少しずつ開く（`ui/unlocks.js` の FEATURES: 条件・いつ開くか・初めて開いたときの説明）。記録は `state.meta.tutorial.unlocked / seen`。設定の「機能を少しずつ開く」を OFF（`settings.progressive = false`）にすると全部見える。コードから `ui.openPanel(id)` で開くと、まだの機能も開いたことになる。テストは `window.__ui.unlockAll()`。
- 戦闘の画面の下の欄（`ui/dock.js`）: 次の目標（`ui/goals.js` の nextGoal: 必要 DPS・目安の時間・手段・次に開く機能）・直近のドロップ・進み具合・戦闘の記録。
- はじめての案内（`ui/guide.js`、6 歩・飛ばせる・`state.meta.tutorial.guide`）、キー操作（`ui/keys.js`）、上の帯の戦力（heroPower、変わると ▲▼）。
- 表示の言葉: パラゴン → **アビスLv**、苦行 → **魔境**（段は必ずローマ数字 I〜XVI）、品質の太古 → **覚醒**（★）、原初 → **極致**（✦）、ペットの重なり → **進化★**。内部の id・state のキー（paragon・torment・ancient・primal）はそのまま。
- レアリティは色だけで示さない: マスの左下に 1 文字（並・魔・稀・秀・伝・組・唯・神。`RARITY_MARK`）、説明の窓に ●の数。
- 共通の部品: `ui/dom.js`（h, button, spriteImg）、`ui/panels/common.js`（itemCell, itemMenu, kvTable, itemMenuHooks, rarityMark）、`ui/tooltip.js`（itemCard, attachTip, tooltipHooks）。
- 埋め込み先（iframe）では window.confirm / alert / prompt が出ない。確認は `ui.confirm()`（ページの中の窓）、書き出しは文字列の欄も必ず出す。
- 埋め込み先ではダウンロード（a[download]）・window.open・印刷も止められる。ファイルの保存は `ui/dom.js` の `downloadBlob`（埋め込み先では `window.claude.use('downloads')` があればそれを使い、無ければ false → 呼んだ側が文字のコピーや画像の表示にする）、ボタンを出すかは `canDownload()`、コピーは `copyText`。localStorage / IndexedDB は使えないことがある（`local.persistent()` が false なら「保存できない」と知らせる）。
- 画面を作り直すとき（タイトルへ戻る）は `ui.dispose()` で出来事の聞き手を外す。`game.events.on` / `assets.onChange` で UI・Scene をつかむときは、外す関数を `ui.offs` に入れる（入れないと前の画面が丸ごとメモリに残る）。

## 公開（claude.ai の Artifact）
- `node tools/build_artifact.mjs` で `dist/artifact/` を作る: 外側（doctype・html・head・body）の無い `index.html`（先頭に `<title>`・`claude:viewport-fit-sides`・style.css を `<style>` で）と、公開する部品の写し・`files.json`（公開の場所 → 元のファイル）・`removed.json`（前回からなくなった場所。公開し直すときは null にする）。
- 公開: Artifact の file_path = `abyss/dist/artifact/index.html`、files = `files.json` の中身。2 回目からは同じ URL に出し直す。`capabilities: { downloads: true }` を付けると、画像のパック・型紙をファイルで保存できる（無くても文字のコピーで動く）。
- 確かめ: `node tests/qa_publish.mjs`（別の origin の sandbox iframe・外のサイトを読めない決まり・保存できないブラウザ・srcdoc・始め直してもメモリが残らない）。長く遊んだときの重さは `node tests/qa_publish.mjs --perf=20`（20 分）。

## テスト
- `npm run test:unit`（tests/unit.mjs）… データの整合・計算
- `npm run test:sim`（tests/sim.mjs）… Node で何時間ぶんも回して進み具合・数値を確かめる
- `npm run test:smoke`（tests/smoke.mjs）… Chromium で通して動かし、写真とエラー 0 件を確かめる
- `node tests/qa_publish.mjs` … 公開の形（dist/artifact）を作って、埋め込み先の制限の中で通して動かす
