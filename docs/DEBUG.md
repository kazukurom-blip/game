# デバッグ / テスト ガイド

## デバッグパネル（`src/debug/debug.js`）

プレイ中に **F2** または **`**（バッククォート）でトグル。画面右側に表示されます。

表示内容: FPS / 経過時間、エンティティ数（enemies / drops / projectiles / effects / npcs / vehicles）、現在マップ（n/6）、プレイヤー座標・速度・状態（anim.state / ground / rope / car / DEAD）、Lv・HP・MP・所持金・手配度・heat、服破れ度（`anim.damage`）、インベントリ使用数、`game.lastError`（ない時は緑で「なし」）、直近4件の操作ログ。

ボタンはマウスでクリックできます。パネル表示中だけ、以下のホットキーも使えます（ゲーム操作とは重ならない F キーだけを使用）。

| キー | 操作 | 内容 |
|---|---|---|
| F3 | 当たり判定 | `drawWorld` でワールド空間に描く: 足場（黄=一方通行 / 橙=solid）、地面、壁、ロープ、ポータルの判定範囲、出現エリア、NPC・車・ドロップ・敵（ID・AI・フェーズ・HP 付き）、弾、プレイヤー（攻撃中は攻撃範囲） |
| F4 | 無敵 | `debug.god = true`。`combat.isPlayerInvuln` が `game.debug.god` を見る |
| F5 | Lv+1 | `gainExp` で次のレベルまでの経験値を与える（レベルアップ演出・SP/AP あり） |
| F6 | HP-10% | `state.hp` を最大HPの10%ぶん減らす（最低1）。服破れの閾値を跨いだら `tear` エフェクトを出す |
| F7 | 敵スポーン | 現在マップの spawns に載っている敵（ボス含む）を順番に、プレイヤーの前方 260px に出す |
| F8 | 全敵撃破 | 全敵に `damageEnemy` を適用（経験値・ドロップ・`enemyKilled`・警官なら手配度も通常通り） |
| F9 | マップワープ | `MAP_ORDER` 順に次のマップへ `changeMap` |
| F10 | ミッション即完了 | 進行中ミッションの目的を満たして `turnIn`。進行中が無ければ受注可能な最初のミッションを受注して完了 |
| Shift+F3 | 全アイテム付与 | 未所持のアイテムを1個ずつ。48スロットを超える分はスキップして件数を表示 |
| Shift+F4 | お金+10000 | |
| Shift+F5 / F6 | 手配度 ±1 | `setWantedLevel` |
| Shift+F7 | HP/MP 全快 | |
| Shift+F8 | インベントリ整理 | 赤/青ポーション以外を削除（全アイテム付与の続きを試す用） |

コンソール / テストからは `game.debug.run('<id>')` で同じ操作を呼べます。id: `hitbox, god, level, hpDown, spawn, killAll, warp, mission, items, money, wantedUp, wantedDown, hpFull, clearInv`。`game.debug.spawnEnemy('boss_don')`、`game.debug.warp('casino')` のように引数付きでも呼べます。
`window` の `error` / `unhandledrejection` も拾って `game.lastError` に入れます。

## テスト

```bash
npm run test:unit    # node tests/unit.mjs             （約1秒）
node tests/unit.mjs --repeat=40                         # 乱数に依存するテストを40回繰り返す（フレーク検出）
npm run test:smoke   # node tests/smoke.mjs            （約60秒, Playwright + chromium headless）
npm run serve        # http-server . -p 8080 → http://localhost:8080
```

- `tests/unit.mjs` — Node 単体テスト（27件）。src/data・systems・world・entities・debug をそのまま import し、`game` は EventBus 等を使ったスタブで用意します（render 系も Node で import できるので、描画を呼ばない範囲で実物を使用）。
  - データ整合性: アイテム（スタイル名が描画仕様の範囲内か、レア度、武器パラメータ、40種以上）、初期装備、スキル（全レベルで関数値が有限か）、敵（art/ai/ドロップID/人型の look・equip）、マップ（ポータルの行き先と到着位置、全マップが相互に到達可能か、出現テーブル、NPC、ボスの配置）、ミッション（参照ID、**討伐対象が実際に出現するか**、**収集対象が入手できるか**、NPC の配置マップ、前提の循環）
  - ロジック: 成長、インベントリ（48枠・999スタック・装備）、ポーション/ショップ、ドロップ抽選（確率の統計確認）、ダメージ計算、撃破処理、被弾/無敵/服破れ/死亡、手配度、スキル全種の使用、ミッション（m01の流れ、**メイン＋サブ全ミッションを順にクリアできるか**、デイリー）、物理、プレイヤー操作（移動・ジャンプ・攻撃・会話・乗車・ポータル）、全敵AIを8秒シミュレーション（NaN・マップ外が無いか）、全マップの自動出現とボス出現、手配度による警察出現、**ボスの技の偏り**、デバッグパネルの全操作
- `tests/smoke.mjs` — http-server（無ければ組み込みの静的サーバー）でサーブし、chromium headless で以下を自動実行してスクリーンショットを `tests/screenshots/` に保存します。
  タイトル → ルナ選択 → 移動 / ジャンプ / 通常攻撃（命中確認） / スキル / インベントリ・スキル・ミッション・ステータス窓の開閉 / リコとの会話から m01 受注 / バイクに乗って走る・降りる / 撃破→ドロップ→拾う / ポータル / デバッグパネル（F2, F3, F7, クリック操作, F8, Shift+F5, F10, F5, F4） / 手配度で警察出現 / HP を下げて服破れ（4段階） → セーブ→リロード→「つづきから」 → ジン選択 → 操作 → 全マップワープ（各マップで敵がいるか） → 4ボスを出して描画 → ジンの服破れ → 死亡→復活 → 服破れシート（両ヒーロー × damage 0/0.3/0.6/0.8/0.95 を拡大描画した `*_tear_sheet.png`）。
  `console.error` / `pageerror` / 読み込み失敗 / UI のガード警告（`[ui] ... failed`）/ `game.lastError` を集め、1件でもあれば失敗にします。Google Fonts の取得失敗（`ERR_CERT_AUTHORITY_INVALID` など、ネットワーク環境のせい）は除外しています。
  playwright は `import('playwright')` で見つからなければ `/opt/node22/lib/node_modules` などを `createRequire` で探します（`NODE_PATH` も参照）。`PLAYWRIGHT_BROWSERS_PATH` が無ければ `/opt/pw-browsers` を使います。

### 現在の結果

- unit: **27 passed / 0 failed**（`--repeat=40` でも 0 failed）
- smoke: **全チェック OK / エラー 0 件**、スクリーンショット 39 枚
- 追加で、両ヒーロー × 全6マップでランダムなキー入力を流し続ける試験も行い、エラーは 0 件でした（スクリプトはリポジトリに入れていません）。

## 見つけて直したバグ

| # | 症状 | 原因 | 修正 |
|---|---|---|---|
| 1 | 地面・足元・NPC の名前・ドロップが画面下の HUD（ステータス枠・スキルバー）に隠れる | カメラの下限が `map.height - H`（=380）で、地面（y=1000）が画面 y=620 に来ていた。HUD は y≈600 から下を覆う | `main.js` にカメラ下限 `camMaxY(map) = max(map.height, groundY+160) - H` を追加。地面が画面 y≈560 に来る |
| 2 | ボスの攻撃パターンが乱数で偏る（同じ技が5〜6回続く、射撃ボスでは召喚がほとんど出ない） | 毎回 `pick(opts)` で選ぶ純粋なランダム | `enemy.js` をシャッフルバッグ方式（`makeMoveBag`）に変更。1巡で各技が重みどおりに1回ずつ出て、同じ技は最大2連続まで（巡の境目と重みの偏りがある時だけ）。召喚枠（6体）が埋まっている時は召喚を後回しにする。2万回のシミュレーションで比率は重みどおり、最大連続は2 |
| 3 | ボスが叩きつけ（slam）の予備動作中に空中にいると、その状態から抜けられなくなる可能性 | `phaseT<=0 && onGround` になるまで待ち続けるだけで、時間切れが無い | 2.5秒たっても着地しなければ `endPhase()` で終える |
| 4 | 運転中の運転手の装備がずれる場合がある | vehicles.js は `v.driverEquip` が無いとヒーローの直前の装備（`lastHeroEquip`）を使う | `vehicle.js` の運転処理で `driverEquip = getEquipLooks(state)` / `driverLook` / `driverDamage` を毎フレーム設定 |
| 5 | デイリーミッションが日本時間の朝9時に切り替わる | `todayKey()` が `toISOString()`（UTC）を使っていた | `missions.js` でローカル日付を使うように変更 |
| 6 | （予防）`startGame` を2回呼ぶと古い MissionManager / Player がイベントを購読したままで撃破が二重に数えられ、スキルのクールダウンやバフも前のゲームから引き継がれる | モジュールレベルの状態（`skills.js` の `cds`/`_dash`、`progression.js` の `_globalBuffs`）と購読を解除していなかった | `main.js` の `startGame` で `missions.destroy()` / `player.destroy()` / `resetCooldowns()` / バフのクリアを行う（今はタイトルに戻る機能が無いので実害はまだ無い） |

テスト側で直した点（ゲームのバグではありません）: 会話は1行ごとに「全文表示」と「次の行へ」で Enter が2回要ること、ダウンタウンで全敵撃破すると警官も倒すので手配度が上がること（仕様どおり）に合わせました。

## 調査メモ: 一度だけ出た「原因不明の LOGIC FAIL」

再現できず、原因は特定できていません。ロジック側の結果が毎回変わり得る要因を洗い出し、該当しそうなものを直しました。

- 乱数: `calcDamage`（±10%、クリティカル。ルナは初期8%）、`damagePlayer`（±10%。服破れの閾値を跨ぐかどうかが変わる）、`rollDrops`、敵の初期向きやAIのタイマー、`Spawner` の出現位置（候補が全部プレイヤーの近くだと `null` を返す）、ボスの技選び（#2 で直した）
- 時刻: デイリーの日付キー（#5 で直した。UTC の日付が変わる前後に実行するとデイリーの判定がずれていた）、`skills.js` の警告の間引きが `performance.now()` を使う
- モジュールレベルの状態: `skills.js` の `cds`（クールダウン）と `_dash`、`progression.js` の `_globalBuffs`。同じプロセスの中で別の `game` を作ってテストすると、前のテストのクールダウンやバフが残る。`resetCooldowns()` / `setActiveBuffs([])` を呼べば消える（unit.mjs の `makeGame` はそうしている）

当時のテストが「n 回殴れば倒せる」「このダメージで閾値を跨ぐ」のような固定値を前提にしていたなら、クリティカルや ±10% の乱数で一度だけ失敗した可能性が高いです。unit.mjs では乱数に依存するテストに `{random:true}` を付け、`--repeat=N` で何度も繰り返して確かめられるようにしました（40回で 0 failed）。

## 残課題・気づいた点

- **服破れの見え方**: ゲーム画面の等倍（キャラの高さ約80px）では 0.25〜0.5 段階の裂け目が小さく、気づきにくいです。0.75 以上ははっきり分かります。インナーは全段階で残っています（`*_tear_sheet.png` で確認）。
- **到着直後のトースト**: マップを続けて移動すると、地名のトーストが3つ重なって表示されます（見た目だけの問題）。
- **デバッグパネルの位置**: 右側のクエストトラッカーに重なります（デバッグ用なので許容）。
- **ボスの硬さ（バランス）**: boss_don は HP 65000 なので、適正レベルでも撃破にかなり時間がかかりそうです（未調整）。
- **一方通行のポータル**: rooftop → beach の帰りのポータルだけ片道です（rooftop からは casino へ戻れるので、到達できなくなることはありません）。仕様なら問題ありません。
- **会話の手数**: リコはミッションの選択肢が出る前に4行話すので、Enter を約8回押す必要があります。
- タイトル画面へ戻る機能はありません（#6 の予防修正はその機能を追加する時のため）。
