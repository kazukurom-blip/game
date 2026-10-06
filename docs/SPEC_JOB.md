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

---

## クラス・性別（v3 追加 / システム担当実装済み）
- `heroId` は「クラス」: `luna`=ストリートスター（スピード/銃）, `jin`=ストリートブロウラー（パワー/格闘）, `hacker`=ストリートハッカー（魔法/電脳。初期武器 `staff_glitch`, weaponType magic）。
- `src/data/classes.js`: `CLASSES`, `CLASS_IDS`, `DEFAULT_LOOKS[class][f|m]`, `defaultLook(class, gender)`, `defaultName(class, gender)`, `LEGACY_GENDER`。
- `newState(classId, {name, gender:'f'|'m', look})` → `state.name / gender / look`。初期装備は `starterEquipFor(class, gender)`（items.js。luna♂はキャップ＋ジーンズ）。
- 旧セーブ: luna→♀「ルナ」、jin→♂「ジン」、look は DEFAULT_LOOKS。描画は `state.look` を drawCharacter に渡すこと（UI/ワールド担当）。
- 職名・スキル名・説明は性別に依らない表現。合計 **24 職**（3クラス×2系統×4段階）。

## 職一覧・転職ミッション一覧

| jobId | 名前 | クラス | 系統 | 段階 | from | 教官（町） | スキル（kind） | 試練 |
|---|---|---|---|---|---|---|---|---|
| `luna_gunner` | ネオン・ガンナー | luna | ガンスリンガー系 | 1 | beginner | マダム・ヴェルヴェット（downtown） | ダブルタップ(projectile) / スプレッド・ショット(projectile) / ガン・マスタリー(passive) | kill seagull_highway×12@beach_f4, boss boss_king_slime×1@beach_f3 |
| `luna_sharpshooter` | ピンク・シャープシューター | luna | ガンスリンガー系 | 2 | luna_gunner | ゴースト・リリィ（slums） | レールスナイプ(projectile) / ホット・カートリッジ(buff) / ガン・ブースター(buff) / リコイル・ジャンプ(move:flashJump) | kill thug_gunner×20@slums_f2, boss boss_captain×1@slums_f3 |
| `luna_trigger_maestro` | トリガー・マエストロ | luna | ガンスリンガー系 | 3 | luna_sharpshooter | クイーン・ダイヤ（casino） | バレット・レイン(aoe) / ハート・マグナム(projectile) / リコイル・マスター(passive:強化) / フォロー・ショット(passive:FA) | kill robot_dealer×25@casino_f3, boss boss_mecha×1@casino_f3 |
| `luna_galaxy_outlaw` | ギャラクシー・アウトロー | luna | ガンスリンガー系 | 4 | luna_trigger_maestro | セレス（spaceport） | スーパーノヴァ・バースト(projectile) / アウトロー・ソウル(passive:FA) / バウンティ・ハンター(buff) | kill robot_xeno×30@space_f4, boss boss_alien×1@space_f4 |
| `luna_dancer` | ネオン・ダンサー | luna | ネオンダンサー系 | 1 | beginner | マダム・ヴェルヴェット（downtown） | スピン・ターン(melee) / ネオン・グライド(dash) / ステップ・マスタリー(passive) | kill mushroom_cone×12@beach_f4, kill rat_alley×10@down_f1 |
| `luna_rave_star` | レイヴ・スター | luna | ネオンダンサー系 | 2 | luna_dancer | ゴースト・リリィ（slums） | ストロボ・フラッシュ(aoe) / グルーヴ・ハイ(buff) / ビート・ブースター(buff) / ネオン・ブリンク(move:teleport) | kill thug_smuggler×20@slums_f3, kill rat_ship×15@slums_f3 |
| `luna_prism_idol` | プリズム・アイドル | luna | ネオンダンサー系 | 3 | luna_rave_star | クイーン・ダイヤ（casino） | プリズム・ステップ(dash) / アンコール(passive) / プリズム・ブリンク(passive:強化) / エコー・ステップ(passive:FA) | kill ghost_jackpot×25@casino_f3, kill thug_hitman×20@tower_f1 |
| `luna_cosmo_star` | コズミック・スター | luna | ネオンダンサー系 | 4 | luna_prism_idol | セレス（spaceport） | ギャラクシー・ステージ(aoe) / スターライト・コンボ(melee) / ワールド・ツアー(buff) | kill ghost_astral×30@space_f4, kill jelly_void×25@space_f4 |
| `jin_brawler` | ネオン・ブロウラー | jin | ストリートファイター系 | 1 | beginner | ブル・ガードナー（downtown） | ジャブ・ラッシュ(melee) / ヘイメイカー(melee) / アイアン・ボディ(passive) | kill crab_iron×12@beach_f4, boss boss_king_slime×1@beach_f3 |
| `jin_knuckle_champ` | ナックル・チャンプ | jin | ストリートファイター系 | 2 | jin_brawler | クロック・ジョー（swamp） | ナックル・ボム(aoe) / 闘魂(buff) / ナックル・ブースター(buff) / ショルダー・ラッシュ(move:rush) | kill snake_mangrove×20@swamp_f2, boss boss_captain×1@slums_f3 |
| `jin_dragon_fist` | ネオン・ドラゴンフィスト | jin | ストリートファイター系 | 3 | jin_knuckle_champ | タイガー・ゴウ（casino） | 昇龍アッパー(melee) / 龍撃波(projectile) / アンストッパブル(passive:強化) / コンボ・フォロー(passive:FA) | kill golem_steel×25@tower_f1, boss boss_mecha×1@casino_f3 |
| `jin_vice_legend` | ネオン覇王 | jin | ストリートファイター系 | 4 | jin_dragon_fist | カイザー・マグナ（spaceport） | 覇王・天地崩し(aoe) / レジェンド・オーラ(passive:FA) / 覇王の気(buff) | kill alien_warrior×30@space_f4, boss boss_alien×1@space_f4 |
| `jin_racer` | ナイト・レーサー | jin | ナイトレーサー系 | 1 | beginner | ブル・ガードナー（downtown） | バーンアウト(aoe) / ドリフト・ダッシュ(dash) / ドライビング・マスタリー(passive) | drive 300m, kill thug_punk×12@down_f1 |
| `jin_drifter` | ストリート・ドリフター | jin | ナイトレーサー系 | 2 | jin_racer | クロック・ジョー（swamp） | エキゾースト・フレイム(projectile) / ターボチャージ(buff) / ギア・ブースター(buff) / ホイール・ダッシュ(move:wheelDash) | drive 600m, kill thug_scrapper×20@slums_f4 |
| `jin_nitro_ace` | ニトロ・エース | jin | ナイトレーサー系 | 3 | jin_drifter | タイガー・ゴウ（casino） | ニトロ・バースト(aoe) / スリップストリーム(passive) / アフターバーナー(passive:強化) / テールゲート(passive:FA) | drive 1000m, kill robot_worker×25@tower_f1 |
| `jin_warp_rider` | ワープ・ライダー | jin | ナイトレーサー系 | 4 | jin_nitro_ace | カイザー・マグナ（spaceport） | ワープ・ドライブ(dash) / メテオ・クラッシュ(aoe) / ハイパードライブ(buff) | drive 1500m, kill robot_xeno×30@space_f4 |
| `hk_netrunner` | ネットランナー | hacker | ネットランナー系 | 1 | beginner | ゼロ（downtown） | ロジック・ボム(aoe) / データ・スパイク(projectile) / コード・マスタリー(passive) | kill drone_peeping×12@down_f1, kill mushroom_neon×10@down_f1 |
| `hk_code_breaker` | コード・ブレイカー | hacker | ネットランナー系 | 2 | hk_netrunner | バイト（slums） | DDoSストーム(aoe) / オーバーフロー(buff) / クロック・ブースター(buff) / パケット・シフト(move:teleport) | kill robot_scrap×20@slums_f4, boss boss_captain×1@slums_f3 |
| `hk_ghost_protocol` | ゴースト・プロトコル | hacker | ネットランナー系 | 3 | hk_code_breaker | サイファー（rooftop） | ブラックアウト(aoe) / トロイの槍(projectile) / ゴースト・シフト(passive:強化) / エコー・コード(passive:FA) | kill drone_attack×25@tower_f1, boss boss_mecha×1@casino_f3 |
| `hk_cyber_oracle` | サイバー・オラクル | hacker | ネットランナー系 | 4 | hk_ghost_protocol | クェーサー（spaceport） | シンギュラリティ(aoe) / オムニサイエンス(passive:FA) / ゴッド・モード(buff) | kill ghost_astral×30@space_f4, boss boss_alien×1@space_f4 |
| `hk_drone_pilot` | ドローン・パイロット | hacker | ドローンマスター系 | 1 | beginner | ゼロ（downtown） | ドローン・ショット(projectile) / ドローン・ボム(aoe) / ドローン・マスタリー(passive) | kill seagull_highway×12@beach_f4, boss boss_king_slime×1@beach_f3 |
| `hk_swarm_commander` | スウォーム・コマンダー | hacker | ドローンマスター系 | 2 | hk_drone_pilot | バイト（slums） | ミサイル・ポッド(projectile) / シールド・ドローン(buff) / スウォーム・ブースター(buff) / ドローン・リフト(move:glide) | kill mosquito_giant×20@swamp_f2, kill rat_giant×15@slums_f4 |
| `hk_mecha_architect` | メカ・アーキテクト | hacker | ドローンマスター系 | 3 | hk_swarm_commander | サイファー（rooftop） | カーペット・ボム(aoe) / レール・ドローン(projectile) / リフト・チューニング(passive:強化) / ウィングマン(passive:FA) | kill robot_dealer×25@casino_f3, kill golem_steel×20@tower_f1 |
| `hk_orbital_master` | オービタル・マスター | hacker | ドローンマスター系 | 4 | hk_mecha_architect | クェーサー（spaceport） | オービタル・レーザー(aoe) / ハイヴ・マインド(passive:FA) / フル・デプロイ(buff) | kill robot_xeno×30@space_f4, kill alien_warrior×25@space_f4 |

## スキル構成（メイプル式。REFERENCE_MAPLE_SYSTEMS §1/§3）
- 1次: 攻撃×2＋マスタリー（passive） / 2次: 主力攻撃＋職バフ＋**ブースター**（攻撃速度 最大+25%・最大240秒, `buff.attackSpeedPct`）＋**移動スキル** / 3次: 攻撃×2＋**移動スキル強化**＋**ファイナルアタック**（最大Lvで45%・120%） / 4次: 大技＋奥義パッシブ（FA強化: 最大60%・200%）＋ハイパーバフ（CT120秒）。
- 転職スキルの成長: 威力 = 基本×(1+0.05×(Lv-1))、MP = 基本+0.5×Lv、CT は Lv10/20 で -10%。
- `computeStats().attackSpeed` はブースター（passive/buff の `attackSpeedPct` 合計、上限+60%）込み。
- ファイナルアタック: `systems/skills.js` の `finalAttackOf(state)` → `{chance, mult, color, skillId}|null`、`tryFinalAttack(game, hitEnemies)`。melee/aoe/dash スキルは自動で発動判定。**通常攻撃と弾（projectile.js）の命中時はワールド担当が `tryFinalAttack(game, [enemy])` を呼ぶ**（任意）。
- **SP は段階別プール**: `state.sp` = 基本＋1次スキル用、`state.spByTier = {2,3,4}`。レベルアップ SP(+3) とミッション報酬 SP は現職の段階のプールへ、転職ボーナス SP(+5) は新しい段階のプールへ。API（data/jobs.js）: `skillSpTier(skill)`, `getSp(state, tier)`, `addSp(state, n, tier?)`, `totalSp(state)`。UI のスキル窓は段階ごとの SP を表示すること。
- **スキルバー 8 枠**（`state.skillBar.length === 8`, `SKILL_BAR_SIZE`）。キー A S D F Q W G H（input/UI 担当がキー割り当てを追加）。
- `skillsForHero(classId)` は基本スキルのみ。`skillsForHero(classId, state)` で現職の系譜の転職スキルも含む。`{allJobs:true}` で全系統（ロック表示用）。ロック判定 `jobSkillUnlocked(state, skill)` / `jobLockOf(state, skillId)` → `{reqJob, jobName}|null`。

## 移動スキル（v3 追加）

### Lv1 共通: ストリートダッシュ（`street_dash`）
- 全クラス共通（`hero:'both'`）、見習いから使用可。**移動速度アップのバフのみ**（Lv1: +20% / 30秒、Lv10: +29% / 57秒）、MP 5→3、CT 1秒。`townOk:true`（町でも使える）。
- STARTER_SKILLS で習得済み・スキルバー2番目（S キー）。旧セーブにも migrateState で補完。

### 2次: 系統別の移動スキル（`kind:'move'`）
| skillId | 名前 | 系統 | move.type | 主な値（Lv1） |
|---|---|---|---|---|
| `lj_gun_recoil_jump` | リコイル・ジャンプ | ガンスリンガー | `flashJump` | 空中のみ。後方へ射撃（`backShot:{mult:1.0,w:260,h:40}`）し、その反動で前方へ power 640px/s・lift 380px/s、目安 300px。MP7 CT0.4 |
| `lj_dance_blink` | ネオン・ブリンク | ネオンダンサー | `teleport` | 方向キー方向（`vertical:true` で上下も可）へ 180px 瞬間移動、無敵 0.25秒。MP8 CT0.6 |
| `jj_fight_shoulder_rush` | ショルダー・ラッシュ | ストリートファイター | `rush` | 前方へ 260px 突進（power 1100px/s, time 0.24s）、敵を押し出す（`push:{mult:1.5, knock:420}`）。MP8 CT1.5 |
| `jj_race_wheel_dash` | ホイール・ダッシュ | ナイトレーサー | `wheelDash` | 地上のみ。power 900px/s で 1.6秒高速走行（distance 900px 目安）、接触ダメージ（`contact:{mult:0.8, knock:360}`）、終了時にジャンプ可。MP8 CT2.5 |
| `hn_packet_shift` | パケット・シフト | ネットランナー | `teleport` | 170px 瞬間移動（上下可）、無敵 0.2秒。MP8 CT0.7 |
| `hd_drone_lift` | ドローン・リフト | ドローンマスター | `glide` | power 650px/s で 0.65秒前方滑空、重力 `gravityScale:0.15`、目安 420px。空中可。MP8 CT1.2 |

### 3次: 移動スキル強化（passive, `enhances:'<2次移動スキルID>'`, `enhance(lv)`）
| skillId | 強化対象 | 効果 |
|---|---|---|
| `lj_gun_recoil_master` | リコイル・ジャンプ | 距離+最大30%・power+20%・反動弾威力×2・使用後 移動速度+20%（3秒） |
| `lj_dance_prism_blink` | ネオン・ブリンク | 距離+20%・無敵+0.3秒・CT-20%・**移動先で小爆発（威力120%）** |
| `jj_fight_unstoppable` | ショルダー・ラッシュ | 距離+30%・無敵+0.3秒・押し出し威力×2・使用後 防御力+30%（4秒） |
| `jj_race_afterburner` | ホイール・ダッシュ | 距離+30%・power+20%・CT-30%・使用後 移動速度+22%（4秒） |
| `hn_ghost_shift` | パケット・シフト | 距離+30%・CT-20%・無敵+0.3秒・**移動先にグリッチ（威力120%）** |
| `hd_lift_tuning` | ドローン・リフト | 距離+30%・power+20%・CT-30%・使用後 移動速度+22%（4秒） |

### データ形式（ワールド担当が player.js で実装）
```js
skill.move = {
  type: 'flashJump' | 'teleport' | 'rush' | 'glide' | 'wheelDash',
  power,      // px/s（flashJump: 前方速度 / rush・glide・wheelDash: 移動速度 / teleport: 0）
  distance,   // px（teleport: 移動距離 / 他: 目安距離。rush は distance/power 秒で到達）
  perLv,      // Lv ごとの distance 増分（moveParams で解決済みの値を渡すので通常は不要）
  // 種類別の追加キー
  lift, airOnly,              // flashJump: 上方向初速 px/s・空中のみ
  backShot: {mult, w, h},     // flashJump(リコイル): 後方への射撃判定（playerAttackArea(game, rect, mult) で実装）
  invuln, vertical,           // teleport: 無敵秒・上下方向も可（↑/↓ 入力時は縦に distance 移動）
  time, push: {mult, knock},  // rush: 突進時間・押し出し攻撃
  time, gravityScale,         // glide: 滑空時間・重力倍率
  time, groundOnly, contact: {mult, knock}, // wheelDash: 走行時間・地上のみ・接触攻撃
};
```
- **useSkill(game, id)**（systems/skills.js）が MP/CD・町判定（`townOk`）・airOnly/groundOnly 判定を行い、`game.player.doMoveSkill?.(skill, lv, params)` を呼ぶ。`params = moveParams(state, skillId, lv)` は 3次強化込みの実効値:
  `{type, power, distance, cooldown, invuln, afterBuff|null, arrivalBlast|null, enhancedBy:[skillId], backShot?, push?, contact?, lift?, time?, gravityScale?, airOnly?, groundOnly?, vertical?}`
- useSkill が自動で行うこと: `invuln > 0` なら無敵付与、エフェクト `dash`、`afterBuff` のバフ付与、`arrivalBlast` の範囲攻撃（**doMoveSkill が同期的に位置を移動させた後の位置**で判定。テレポートは doMoveSkill 内で即座に x/y を書き換えること）。
- player.js 側で実装すること: 実際の移動（teleport は壁・マップ端を考慮して即時移動、flashJump は vx/vy 設定、rush/glide/wheelDash は time 秒間の速度制御）、backShot/push/contact の攻撃判定（`playerAttackArea` を使用）、着地/空中判定（`onGround`）。

---

## 5次転職（v4 / Lv120。docs/SPEC_V4.md）

- `JOB_TIERS = [0, 10, 30, 60, 100, 120]`。各系統に 5 次の職が 1 つ（合計 30 職）。4 次の職の `from` から続く。
- 5 次の職は、4 次と同じく系統の攻撃モーション（`JOB_MOTIONS[branch]`）を使い、オーラは段階 5（描画は最大の段階 4 で頭打ち）。
- SP: `state.spByTier = {2, 3, 4, 5}`。5 次スキルは 5 次プールの SP を使う。旧セーブ（5 の枠が無い）は `migrateState` で `5: 0` を補う。
- スキルの窓は「基本・1次〜5次」のタブと、5 つの SP 表示（基本+1次・2次〜5次）。

### 5次の職

| jobId | 名前 | 系統 | from | 称号 | オーラ | 教官（町） | 試練 |
|---|---|---|---|---|---|---|---|
| `luna_dimension_desperado` | ディメンション・デスペラード | ガンスリンガー | luna_galaxy_outlaw | 次元のデスペラード | #ff4fd8 | ニクス `job_nyx`（w2_arkcity） | reach w2_arkcity_f2 / killAny×40@w2_arkcity / 地域のボス |
| `luna_hyper_icon` | ハイパー・アイコン | ネオンダンサー | luna_cosmo_star | 全次元のアイコン | #9ffcff | ニクス | reach w2_arkcity_f3 / killAny×50 / 地域のボス |
| `jin_neon_emperor` | ネオン天帝 | ストリートファイター | jin_vice_legend | 次元を統べる天帝 | #ffb347 | ガロウ `job_garo`（w2_arkcity） | reach w2_arkcity_f1 / killAny×45 / 地域のボス |
| `jin_dimension_racer` | ディメンション・レーサー | ナイトレーサー | jin_warp_rider | 次元を駆ける者 | #9d7bff | ガロウ | reach w2_arkcity_f4 / killAny×45 / 地域のボス |
| `hk_demiurge` | デミウルゴス・コード | ネットランナー | hk_cyber_oracle | 世界を書き換える者 | #3dffc8 | アカシャ `job_akasha`（w2_arkcity） | reach w2_arkcity_f2 / killAny×40 / 地域のボス |
| `hk_star_admiral` | スターフリート・アドミラル | ドローンマスター | hk_orbital_master | 星間艦隊の提督 | #ffcf3d | アカシャ | reach w2_arkcity_f3 / killAny×50 / 地域のボス |

### 試練の目的 `killAny`（敵の ID に依らない書き方。systems/missions.js）

```js
{ type: 'killAny', count, area: 'w2_arkcity', mapId?: 'w2_arkcity_f2', boss?: true, text }
```
- `area` はマップ ID の頭。倒した場所が `area` か `area + '_…'`（w2_arkcity_f1〜f4・ボス部屋など）なら数える。市民は数えない。
- `boss: true` ならボス（`def.boss`）だけを数える。`mapId` はナビの行き先（任意）。
- 倒した場所は `enemy.mapId`、無ければ今のマップ（`game.map.id`）。

### 5次スキルの種類

| 種類 | データ | 動き |
|---|---|---|
| 画面全体攻撃 | `kind:'aoe', screen:true, hits 12〜15, maxTargets 999, ult:{delay:1.0}`、CT 90〜100（最大Lvで −10%） | 押すと暗転（`ult5Dark`）＋カットイン＋画面内の敵に狙いの印（`ult5Mark`）。溜めの間は無敵。1.0 秒後に**その時の画面の矩形**（`screenRect(game)` = cam.x, cam.y, 1280×720）にいる敵すべてへ hits 回。系統の大演出（`ultChildren` → `ult5Burst` ほか）・ヒットストップ・揺れ |
| 多段の強攻撃 | melee / aoe / projectile（`hits` 4〜14）/ dash | 今までと同じ（多段の数字は積み重なる） |
| 通常攻撃強化 | `kind:'buff'`, `buff(lv).empower = {mult, hits, w, h, kind:'beam'|'wave', color}` | 持続中、通常攻撃のたびに前方へ追撃（`onBasicAttack`。player.startAttack を skills.js が包む） |
| 覚醒 | `kind:'buff'`、CT 180 秒・持続 47〜60 秒 | 攻撃力 +37〜53% ほか |
| 召喚（ハッカー） | `kind:'summon'`（systems/summons.js）CT 60 秒・持続 60〜78 秒 | daemon（光線）/ bomber（爆撃） |
| マスタリー | `kind:'passive'` | 攻撃力 +70〜80 ほか（最大Lv10） |

モーション（data/skillMotions.js）: 画面全体攻撃 = `finale`、覚醒 = `awaken`（render/character.js の SKILL_MOTIONS に追加）。ほかは既存のモーション。
