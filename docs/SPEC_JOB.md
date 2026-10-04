# 転職システム仕様（v3）

メイプルストーリー式の転職。一定レベルに達すると**キャラの頭上に吹き出し**が出て、**クリック（タップ）すると転職ミッションを受注**できる。

## 転職段階
| 段階 tier | 必要Lv | 内容 |
|---|---|---|
| 0 | — | 見習い（初期） |
| 1 | 10 | 1次転職: ヒーローごとに**2系統から選択** |
| 2 | 30 | 2次転職（系統ごとに1つ） |
| 3 | 60 | 3次転職 |
| 4 | 100 | 4次転職（最終） |

- ルナ: 「ガンスリンガー」系（銃・遠距離・クリティカル）／「ネオンダンサー」系（スピード・連撃・ダッシュ）
- ジン: 「ストリートファイター」系（格闘・高火力・タフ）／「ナイトレーサー」系（車・ニトロ・範囲・ドライブ）
- 各職: 名前、説明、`statBonus`（永続）、`skills`（新スキル2つずつ、`reqJob` 付き）、`title`（HUD表示）、`aura` 色（キャラ足元/背後のオーラ）、`sp` ボーナス。

## データ / API（システム担当）
- `src/data/jobs.js`: `JOBS = {id: {id, name, hero, tier, branch, from, reqLevel, desc, statBonus, skills:[skillId], title, aura, sp}}`, `JOB_TIERS = [0,10,30,60,100]`, `jobsFor(heroId, tier, fromJobId)`。
- `state.job = {id: 'beginner', tier: 0, history: []}`（newState / migrateState で初期化。旧セーブは beginner。既にLv10以上でも自動転職はせず、吹き出しが出る）。
- `src/systems/jobs.js`:
  - `attachJobs(game)`: levelUp / mapChanged を購読し、転職可能になったら `events.emit('jobAvailable', {tier, options})`、`game.notify` で案内。
  - `jobOffer(state)` → `{tier, options:[jobId...], active: missionId|null}` か null（転職不可 or 既に受注中なら active を返す）。
  - `acceptJobMission(game, jobId)` → `{ok, msg}`: その職の転職ミッションを受注（MissionManager 経由）。
  - 転職ミッション（`MISSIONS` に `type:'job'`, `jobId` 付きで追加）: 目的例 = ①指定の町の**転職教官NPC**に会う（talk）②試練: 適正Lvフィールドで指定の敵を N 体（またはその段階のミニボス）③教官に報告 → 報告時に `advanceJob(game, jobId)`。
  - `advanceJob(game, jobId)`: state.job 更新、statBonus 反映（computeStats に job ボーナス）、新スキルを習得可能に（Lv1で自動習得でも可）、SP付与、`events.emit('jobAdvanced', {job})`、SNS投稿、豪華エフェクト（`spawnEffect('levelUp')` 等）。
- 転職教官NPC（`MISSION_NPCS` / docs/NPCS.md に追加）: 1次=ダウンタウン、2次=スラム or スワンプ（系統で分ける可）、3次=カジノ、4次=宇宙港 など。
- `learnSkill` / `skillsForHero` は `reqJob`（その職か上位職）を判定。

## UI（UI担当）
- **頭上の吹き出し**: `jobOffer(state)` が転職可能（未受注）を返す間、プレイヤーの頭上に「⬆ 転職できる！」吹き出し（ぴょこぴょこ揺れる・光る）。ワールド座標でプレイヤーに追従。**マウスクリック／タップで `jobOffer` ウィンドウを開く**。
- `jobOffer` ウィンドウ: 選べる職のカード（名前・説明・獲得スキル・ボーナス・オーラ色のキャラプレビュー）、「この職で受注する」→ `acceptJobMission`。2択でない段階は1枚。
- HUD: 職名を名前の横に。ステータス窓に職と転職履歴。
- 受注中は吹き出しの代わりにクエストトラッカーに表示（既存）。

## アート
- `drawCharacter` の `anim.aura`（色）で足元にオーラ（tier に応じて強く）。プレイヤー描画時に職の aura を渡す（ワールド担当の player.js）。

## 検証（デバッグ担当）
- Lv9→10 で吹き出しが出る、クリックでウィンドウ、受注、試練、報告、転職完了、ステータス/スキル反映、30/60/100 も同様、旧セーブで吹き出しが出る、両ヒーロー×両系統で最終段階まで到達可能。
