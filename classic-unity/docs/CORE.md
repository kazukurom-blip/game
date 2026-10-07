# CORE — ゲームの中身（Unity に依存しない C#）と Unity 側からの呼び方

> 「ルミナリア・クラシック」Unity 版の仕組みの説明。設計の元は `classic/docs/`（DESIGN・FEEL・STATS・JOBS・ITEMS・MONSTERS・QUESTS・WORLD・UI・ART_SPEC_UNITY）。
> 画面（描画・アニメ・入力・音）は Unity 側（Codex）。**ゲームの中身はすべて `classic-unity/Core/`**。Unity 側は Core を呼んで、出てきた状態を描くだけ。

## 1. 置き場所

```
classic-unity/
  Directory.Build.props     ← ビルドの中間物を .build/ へ（Core/ に obj が混ざらない）
  Core/                     ← Unity の Assets/ にそのまま入れる C#（netstandard2.1・C# 9・外部パッケージなし）
    Lumina.Core.asmdef      ← noEngineReferences: true（UnityEngine を使わない）
    Lumina.Core.csproj      ← ここ（クラウド）でのビルド用。Unity は無視する
    Physics/   Feel（手触りの数値）・PhysicsMap（足場・縄・壁）・PlayerPhysics（主人公の動き）・FixedStepper（60 回/秒）
    Combat/    Formulas（STATS.md の式）・DamageCalc（乱数入りの 1 回のダメージ）・Attack（振りの時間・当たる瞬間・範囲・数字）
    Character/ Curves（経験値の表・敵の基礎値）・Jobs・CharacterState（Lv/AP/SP/HP/MP/転職/死）・StatCalc（最終の能力）
    Skills/    SkillDef（データの形）・SkillBook（SP・前提・待ち時間）・Buffs（強化・召喚）
    Mobs/      MobDef・Mob/MobAI（動き）・MobSkill（技・ボスの段階の形）・MobCombat（技を選ぶ・予兆・段階・呼び出し）・DropRoller（ドロップ）
    Status/    StatusSet（かかっている状態異常）・StatusSystem（かける・治す・時間を進める公開の入口）
    Items/     ItemDef・StatBlock・Inventory（5 タブ）・Equipment・ScrollSystem
    Quests/    QuestDef・QuestLog
    World/     MapData（マップの JSON の形）・MapInstance（敵・落ちている物・湧き直し）
    Save/      SaveData・SaveSerializer・SaveMigrations・SaveStore（壊れない書き方）・FileSystem
    Game/      GameSession（全部をまとめる。Unity が持つのはこれ 1 つ）・PlayerInput・GameEvents・AvatarPose
    Data/      GameData（JSON を読む）・IDataSource
    Util/      Json（小さな読み書き）・Rng（決まった乱数）・Expr（スキルの式）
  Data/                     ← ゲームのデータ（JSON）。Unity では Assets/Resources/Lumina/ へコピー
    items.json monsters.json quests.json shops.json npcs.json skills.json maps/*.json
    tools/export_data.mjs   ← classic/tools/data/*.mjs → JSON（skills.json だけは手で書く。元は JOBS.md）
    tools/export_golden.mjs ← テストの期待値（ブラウザ版の物理・設計書の式）→ Tests/Golden/
  Tests/                    ← xUnit（net8.0）
  Unity/                    ← Unity 側の見本（GameRunner・PlayerView・InputBridge・DamageNumberView・MapLoader）
```

## 2. 確かめ方

```
cd classic-unity
dotnet test Tests/Lumina.Core.Tests.csproj          # 全部のテスト
node Data/tools/export_data.mjs                    # データを書き出し直す（classic/tools/data を直したら）
node Data/tools/export_golden.mjs                  # 期待値を書き出し直す（ブラウザ版の物理・式を直したら）
node ../classic/tools/gen_docs.mjs --check         # 設計書の表とのつじつま
```

- .NET 8 SDK が要る（Ubuntu なら `apt-get install dotnet-sdk-8.0`）。
- **物理はブラウザ版と 1 フレームずつ同じ数値**: `export_golden.mjs` が `classic/src/engine/physics.js` を 18 の場面（歩く・すべる・ジャンプ・空中の左右・走りジャンプ・押しっぱなし・段差・落下・すり抜け・下ジャンプ・端から落ちる・坂・縄・空中でとびつく・はしご・伏せ・被弾・テストマップを 1 分ずつ 2 回ランダムに）で動かして書き出し、C# で同じ入力を入れて x・y・速さ・状態・向き・無敵を比べる（差 1e-7 以下）。
- 経験値の表（Lv1〜200）・敵の基礎値・戦闘の式も `curves.mjs`・`combat.mjs` から書き出した値と比べる。

## 3. Unity 側からの呼び方（要点）

```csharp
// 起動
var data = GameData.Load(new ResourcesDataSource("Lumina"));               // Unity/GameRunner.cs にある
var store = new SaveStore(new DiskFileSystem(), Path.Combine(Application.persistentDataPath, "saves"));
var session = GameSession.Load(data, store, "char1", out var result)      // セーブから（壊れていたらバックアップから）
           ?? GameSession.NewGame(data, "なまえ", seed);                   // 無ければ新しく
session.AttachSave(store, "char1");

// 毎フレーム（Update）
session.Update(Time.deltaTime, input);     // 中で 1/60 秒の固定の更新を必要な回数だけ回す
// 読む物
session.Body          // 足元の位置 X, Y（px・y は下が正）、State、Facing、InvT（無敵）
session.PrevX/PrevY + session.Stepper.Alpha   // 描く時の補間
session.Pose          // Motion（stand1/walk1/jump/ladder/rope/alert/swingO1/prone/dead）・Frame・FacingRight・Visible（点滅）
session.Map           // Data（マップの JSON）・Mobs（敵: X, Y, HopY, Facing, Motion, Hp, FadeOut, Uid, Hidden, StatusIcons）・Drops（落ちている物）
                      // Projectiles（敵の飛び道具）・Hazards（敵の技の予兆と当たる所）・BossBar（ボスの HP バーの値。いなければ null）
session.Status        // 主人公の状態異常（Active で一覧、Pose.StatusIcons にビット）
session.Out.Events    // 起きたこと（音・エフェクト・メッセージ）。次の Update の始めに空になる
session.Out.Damage    // ダメージの数字（Kind・Value・X/Y・Stack・Delay）
session.Character / Stats / Inventory / Equipment / Skills / Buffs / Status / Quests / QuickSlots
```

- **入力**（`PlayerInput`）: 押している間の物（Left/Right/Up/Down/Jump/Attack/Pickup）と、押した瞬間の物（JumpPressed/UpPressed/InteractPressed/SkillPressed/ItemPressed）。押した瞬間の物は Core が次の固定の更新で読むまで覚えている。キー配置は `Unity/InputBridge.cs`。
- **座標**: Core は 1 px = 1・y は下が正。Unity（PPU = 1）では `(x, -y)`。Pixel Perfect Camera は 800×600。
- **UI から呼ぶ操作**: `Talk(npcId)` → `NpcDialog`（受けられる・報告できるクエスト、店、宿屋、乗り物）／`AcceptQuest`／`CompleteQuest`／`Buy`／`Sell`／`RestAtInn`／`Travel`／`UseItem`／`UseSkill`／`SetQuickSlot`／`EquipFromInventory`／`Unequip`／`ApplyScrollToEquipped`／`ApplyScrollToInventory`／`SpendAp`／`SpendApHp`／`SpendApMp`／`LearnSkill`／`AdvanceJob`／`Revive`／`SaveNow`／`NpcBulb`（電球）。
- **セーブ**: 自動（マップ移動・Lv アップ・クエスト完了・転職・起き上がり・3 分ごと）。アプリを閉じる時・裏に回った時は Unity 側で `SaveNow`。

## 4. 仕組みの説明

### 4-1. 物理（FEEL.md）

- `PlayerPhysics.Step` は `physics.js` の stepPlayer をそのまま移した物。数値は `Feel`（= feel.js）。
- 追加（使わなければブラウザ版と同じ）: **壁**（マップの `walls`。体の縦の範囲が重なる時だけ止まる）、**攻撃中**（地上では止まる・跳べない。空中は勢いそのまま）、**ジャンプできない**（状態異常「弱り」用の `NoJump`）。
- **ポータル**: ↑を押した瞬間（UpPressed）、足元から左右 20・上下 40 px 以内のポータルに入る（縄より先）。`to` が無く `toPortal` だけの物は同じマップの中の別の位置（S007 の隠し部屋）。
- **固定 60 回/秒**: `FixedStepper`。1 回の Update で回す数の上限 8、長く止まっていた後は 0.25 秒ぶんまで。

### 4-2. キャラ（JOBS.md 2 章・STATS.md 6 章）

- 最初は HP 50・MP 5、能力値はサイコロ（合計 25、各 4 以上）。初期装備は白いシャツ・青い半ズボン・革のサンダル・木の剣。
- Lv アップ: AP 5（自動で振る機能なし）、SP は初心者 Lv2〜7 で 1、転職後は 3（段階ごとの財布）、HP/MP は職ごとの幅（`Jobs`）＋パッシブ。HP/MP は全回復。
- **1 回で上がる Lv は 1 つ**（あふれた分は「次の必要量 − 1」まで。クラシックの決まり）。
- 1 次転職: 戦士 HP+200〜250 / 魔法使い MP+100〜150 / ほか HP+100 MP+25、SP+1、持ち物の枠 装備・消費・その他 +4。2〜4 次は数値だけ（`AdvanceTier`）。
- 死んだ時: 初心者は失わない。1 次以上は「次まで」の 10%（町では 1%）、0 より下がらない。守りのお守りで失わない。近くの町で HP 50%。
- 最終の能力（`StatCalc`）: 攻撃の幅（主 × 武器係数 + 副）× 攻撃力 ÷ 100（熟練度で最小）、命中 = DEX×0.8 + LUK×0.5 + …、回避 = DEX×0.25 + LUK×0.5 + …、防御 + STR÷10、魔防 + INT÷2、速さ・ジャンプ（100 基準、上限 140/123）、攻撃速度の段階 − 加速、弾・矢・投げ星の攻撃力を足す。

### 4-3. 戦闘（STATS.md 2〜4 章・FEEL.md 6〜7 章）

- 物理: 幅の中の一様な乱数 × スキルの倍率 × 属性 × レベル差 → 会心なら × 威力 → − 防御 × (0.5〜0.6)、1〜199,999。命中は STATS.md の式で外れると MISS。
- 魔法: ((M²÷1000 + M) ÷ 30 + INT÷200) × 魔法攻撃力、必ず当たる（敵が 5 Lv 以上高いと 1 Lv ごとに 2% 外れる）。
- 受ける: 敵の攻撃 × (0.85〜1.0) × (1 − 防御 ÷ (防御 + 4 × 攻撃)) × レベル差 − 戦士は STR÷10。回避は上限 30%（盗賊 80%）。魔力の盾は一部を MP で。
- 攻撃の時間: 武器の速さの段階 2〜9 → 0.48〜0.90 秒（feel.js）。**当たる瞬間は振りの 2 コマ目の始め（300/800 の所）**。当たる範囲は四角（主人公の前）、近い順に「同時に当たる数」まで。
- ダメージの数字: `DamageNumber`（与えた/会心/受けた/回復/MISS、Stack で縦に 18 px ずつ積む、0.05 秒ずつずらす）。

### 4-4. スキル（JOBS.md 4 章）— データ駆動

`Data/skills.json`。式の `x` はスキルの Lv、`lv` はキャラの Lv（`floor`・`ceil`・`min`・`max` が使える）。

| 種類 | kind | 例 |
|---|---|---|
| 攻撃 | attack | 強打・二段突き・拳の連打・かく乱（弱体だけ） |
| 範囲 | area | なぎ払い（6 体・HP 5）・宙返り蹴り（まわり） |
| 遠距離 | ranged | 魔力の矢・魔力の爪（2 回）・強弓・ダブルショット（2 本）・二つ星投げ（LUK×5.0・2 つ）・石つぶて（固定） |
| 移動 | movement | 早足（前へ押し出す＋速さ・ジャンプ） |
| 強化 | buff | 鉄の体・魔力の盾・魔力の鎧・集中・闇隠れ・身軽な足 |
| 回復 | heal | ひと休み（10 秒ごと）・ヒール（見本） |
| パッシブ | passive | HP/MP回復力・最大HP/MP・我慢・弓の心得・遠目・必中の矢・身のこなし・鋭い目・身軽な構え・銃の心得 |
| 召喚 | summon | 闇の獣（見本） |

- 初心者 3 と 1 次職 5 系統 × 6 = **33 スキル**（JOBS.md のとおり）。`sample: true` は仕組みを試すための見本（ヒール・ヘイスト・剣の加速・闇の獣・意志の力の待ち時間）。
- 決まり: SP はそのスキルの段階の財布から・前提（`prereqs`、「または」は `prereqAny`）・MP/HP・待ち時間（`cooldown`）・効果の時間（`buff.sec`）・使える武器（`weapons`）・弾を使う（`ammo`）・射程のパッシブがのる（`rangeBonus`）。縄・はしごの上では使えない。

### 4-5. 敵（MONSTERS.md・FEEL.md 9 章）

- 数値は `export_data.mjs` が `monsters.mjs` と `curves.mjs` の式で作る（MONSTERS.md の表と同じ。テストで島の 7 体を確かめる）。
- 動き: 這・歩・跳（時々約 36 px 跳ねる）・飛（足場に関係なく漂う）・止・瞬（4 秒ごと）。速さは敵ごと（下の「速さ」）。1〜3 秒歩く ↔ 1〜3 秒止まる。足場の端・壁・45° より急な坂で向きを変える（落ちない）。
- 攻撃されたら 5 秒追う。Lv20 以上の歩く敵は同じ足場にいると近づく。触れるとダメージ（闇隠れ中は当たらない）。技は下の「敵の技」。気絶・凍結・眠り・技の構えの間は動かない。
- 被弾で 0.3 秒ひるむ。「押される量」（HP の 10%、ボスは押されない）以上で約 15 px 押される。倒れると 0.6 秒で消える。
- 湧き直し: 湧く所ごとに 1 体・最大数まで・7 秒ごとに補充。強敵（`timedSpawns`）は倒されてから決まった時間（大コロ貝 600 秒）。**最近いた 6 マップはそのまま残す**（離れて戻っても削った HP・落ちている物はそのまま）。
- ドロップ: お金 60%（0.7〜1.3 倍）・素材 55%・薬 各 4%・原石 2%・宝石 1%・装備（Lv 帯）0.8%（強敵 30%・ボス確定 3）・書 0.3%/0.1%・呪いの書・固有品。倒れた所から約 40 px 跳ねて落ち、中央 → 右 → 左 …（25 px おき・0.05 秒ずつ）。2 分で消える。拾うキーで 0.1 秒に 1 つ。

- **速さ**（敵ごと）: `monsters.mjs` の最後の列にクラシック流の速さ（-50〜+50）。動く速さ = 100 + 速さ px/秒（FEEL.md 9 章。止は 0）。MONSTERS.md の表の「速さ」の列（`gen_docs.mjs` が作る）。這は -50〜-38（50〜62 px/秒）、歩は -25 前後、素早い獣は +、重い物は −。ボスの段階で `speedMul`。
- **跳ねる敵**: 歩いている間 0.4〜1.4 秒おきに約 36 px 跳ね、跳ねている間も前へ進む。追う時は着地してすぐ跳ねる。弱りの間は跳ねない。
- **飛ぶ敵**: 家から左右 ±150・上下 ±60 の中を漂う（歩き出すたびに次の高さを選ぶ）。追う時は主人公の高さ（縄の上も）へ。

#### 敵の技（`Mobs/MobCombat.cs`・データは `classic/tools/data/mob_skills.mjs` → monsters.json の `attacks`）

| type | 動き | 当たる所 |
|---|---|---|
| melee | 構え（windup）→ 前（`back` なら後ろ）の四角 | `Hazards`（ShowWarning = false。構えの絵 `attack1`） |
| shot | 構え → 真っすぐ飛ぶ（count 本を上下に広げる） | `Projectiles`（SkillId・Status つき） |
| magic | **主人公の足元に予兆 → windup 秒後に当たる**（count 個を spread px おき、`linger` 秒残って状態異常をかけ続ける＝毒の沼） | `Hazards`（Progress 0→1） |
| area | 敵のまわり（w）か画面全体（global）。`groundOnly`（跳べばよけられる）・`safeHeight`（高い足場は安全） | `Hazards` |
| summon | 手下を呼ぶ（mobs を順に count 体、生きている手下は max まで。呼んだ手下は湧き直しの数に入らない・すぐ向かってくる） | — |
| heal | 自分の HP を pct% 治す | — |
| dive | 消えて（`Hidden`・当たらない）、主人公の所に予兆 → 出てきて当たる | `Hazards` |

- 技の無い敵は「攻撃」の列から自動（遠 = 3 秒ごとの飛び道具、魔 = 足元に予兆の魔法）。体当たりは今までどおり。`touchStatus` で触れた時の状態異常（フグトゲの毒・クラゲンの気絶など）。
- 技を使うのは: ボス、攻撃されて追っている間、Lv20 以上の歩く敵、動かない敵。待ち時間は技ごと（ボスは入った直後 30%）、技と技の間 1 秒。気絶・凍結・眠りで構えは消える（予兆も消える）。封印の間は技を使わない。闇隠れ中は狙わない・当たらない。
- 当たると `HitPlayer`（ダメージは攻撃力 × pct%。魔法は避けられない。pct 0 は状態異常だけで、無敵の間もかかる）。お知らせ: `MobCast`（構え・予兆の始まり）・`MobSkillHit`・`MobSummoned`。

#### ボス（`MobDef.Boss`）

- `boss.phases`: HP がその割合以下で次の段階（戻らない）。段階ごとに `atkMul`・`defMul`・`speedMul`・`rate`（技の速さ）・`elements`（弱点の上書き）・`healPct`（始まった時に治す）・`summon`（始まった時に呼ぶ）。技は `phases` で使う段階を決める。お知らせ `BossPhase`（Value = 段階、Text = 名前）。
- 地域のボス 12 体・大ボス 3 体・ダンジョンの主 7 体にデータあり（MONSTERS.md 5 章をもとに。大ボスの部位は段階にまとめた簡略版）。データの無いボスも 1 段階で HP バーは出る。
- **ボスの HP バー**: `session.Map.BossBar`（`BossBarInfo`: Name・Lv・Hp/MaxHp・Ratio・Phase/PhaseCount/PhaseName・段階の中の残り PhaseRatio・状態異常・大技の詠唱 Casting/CastName/CastProgress）。色は Phase で変える。

### 4-6. アイテム（ITEMS.md）

- 持ち物 5 タブ（装備・消費・設置・その他・特別）、各 24 枠、転職で +4。薬 100・素材 200・矢 1000・投げ星 500 などで重なる。お金の上限 21 億。
- 装備: 部位（全身は上下を外す・両手武器は盾を外す・盾は両手武器を外す）、職の制限（初心者は共通だけ）、必要 Lv・能力（AP ＋ ほかの装備）。落とした装備は ±5% ぶれ、1% で上質（+10%）。
- 強化の書: 10/60/100%、呪いの 30/70%（失敗の半分で壊れる）。成功しても失敗しても回数 −1。
- 解毒薬（毒）・目薬（暗闇）・聖水（呪い）・万能薬（毒・気絶・暗闇・封印・呪い）。弱り・凍結・眠りは時間だけ（STATS.md 4-3）。治す物が無くても使える。
- 薬・強化の薬（時間）・帰還の書（地域の中だけ。「一番近い町」もある）・店（買う・売る。装備は 1/5）・宿屋。

### 4-7. クエスト（QUESTS.md）

- `Data/quests.json`（286 本）。目的: `kill`（倒す）・`collect`（持ち物の数。完了で渡す）・`talk`（話す）・`visit`（行く）・`interact`（調べる）・`event`（操作: quickslot_set / use_potion / ap_spent / sp_spent / skill_used）。報告先 `end`（`auto` は着いたら完了）。
- 報酬の経験値・お金は QUESTS.md 1-3 の式。品は名前から ID に直してある（直せない物は `rewardUnparsed` に残る。大陸のクエストの「自分の職の◯◯」など）。
- 頭の上の電球: `NpcBulb`（2 = 緑、1 = 黄）。
- **チュートリアル 20 本（S-01〜S-20）は、目的を機械で判定できる形に書き直し、テストで最初から最後まで遊んで通す**（歩いて岩を越える・縄を登って木箱・ポータル・狩り・拾う・隠し部屋・船で大陸へ）。

### 4-8. ワールド（WORLD.md）

- マップの JSON の形は `Core/World/MapData.cs` の先頭。足場（折れ線）・縄/はしご・壁・ポータル・湧く所・強敵・NPC（店・宿屋・乗り物）・調べる物。
- 初心者の島 12 マップ（S000〜S011）＋ブリーズ港（V100、島から船で着くだけの仮）。**足場の配置は仮**、つながりは `maps.mjs` のとおり（書き出しの時とテストで検査）。どのマップからもポータルで町へ戻れる。

### 4-9. セーブ（いちばん大事）

- ファイル: `<slot>.json`（今）・`.tmp`（書いている途中）・`.bak1〜3`（前の版）。中身は全体が 1 つの JSON:
  `{"format":"lumina-save","seq":12,"length":3456,"crc32":"89abcdef","data":{…}}`
- 書く順番: `.tmp` に書いて fsync → 読み直して確かめる → bak を 1 つずつ後ろへ → 今のセーブを bak1 へ → `.tmp` で一度に置き換え。**どこで落ちても、前の版か新しい版のどちらかが必ず読める**（テストで全部の手順で「落ちた」を再現。ちぎれた書き込みも）。
- 読む順番: 今のセーブと `.tmp` のうち壊れていなくて `seq` の大きい方 → bak1 → bak2 → bak3。壊れていたら `LoadResult.Recovered` と理由（`Problems`）。全部壊れていても落ちずに「読めない」を返す。
- 版: `version`（今は 2）。古い版は `SaveMigrations` で 1 つずつ直してから読む。新しすぎる版は断る（バックアップへ）。データに無いアイテムは外してお知らせ。
- 保存する物: キャラ・持ち物・装備（ぶれ・書の結果込み）・スキル・待ち時間・クイックスロット・クエスト（数も）・場所・フラグ・乱数の状態。バフはクラシックどおり保存しない。死んでいる時は町に置いて保存。

### 4-10. 状態異常（STATS.md 4-3）— `Core/Status/`

| 種類 | StatusKind / データの名前 | 効き目 | 治し方 |
|---|---|---|---|
| 毒 | Poison / poison | 1 秒ごとに最大 HP の power%（既定 2%）。**HP 1 で止まる**（敵も） | 解毒薬・万能薬・時間 |
| 気絶 | Stun / stun | 動けない・攻撃もスキルもできない（薬は使える） | 万能薬・時間 |
| 暗闇 | Darkness / darkness | 命中 −power%（既定 50%） | 目薬・万能薬・時間 |
| 封印 | Seal / seal | スキルが使えない（治すスキルは使える）。敵は技を使わない | 万能薬・時間 |
| 呪い | Curse / curse | 攻撃力・魔力・防御 −power%（既定 20%）、主人公が得る経験値 −50% | 聖水・万能薬・時間 |
| 弱り | Weak / weak | ジャンプできない（跳ねる敵は跳ねない） | 時間 |
| 凍結 | Freeze / freeze | 動けない・攻撃できない。**攻撃を受けると解ける** | 時間 |
| 眠り | Sleep / sleep | 同上 | 時間 |

- **重ねがけ**: 同じ種類は重ならない（かけ直すと残り時間は長い方・強さは強い方）。違う種類は同時にかかる。死ぬと全部消える。セーブしない（バフと同じ）。
- **効きにくさ**: ボス（kind = boss）は気絶・凍結・眠りが 1/3 の時間、毒は 1/10 の強さ。大ボス（raid）は何も効かない（`StatusResisted`）。
- **公開の入口**（スキル担当が「スキルが状態異常を付ける」時に使う）:

```csharp
StatusSystem.Apply(target, StatusKind.Poison, seconds, power, session.Out);   // target = Mob か GameSession（IStatusTarget）
StatusSystem.Apply(target, "stun", seconds);                                  // データの名前でも
StatusSystem.TryApply(target, kind, seconds, power, chance, session.Rng, session.Out); // 確率つき
StatusSystem.Cure(target, kind, session.Out);  StatusSystem.Cure(target, kinds, session.Out);
session.ApplyStatus(mob, kind, seconds, power);   // お知らせ付き（敵）
session.ApplyStatus(kind, seconds, power);        // お知らせ付き（主人公）
session.CureStatus(GameSession.CurableAll);       // 治すスキル（意志の力の見本は今これを呼ぶ）
// 戻り値 StatusApplyResult: Applied / Refreshed / Resisted（確率で外れ）/ Immune / Invalid
```

- **お知らせ**（GameEvents）: `StatusApplied`・`StatusEnded`・`StatusCured`・`StatusResisted`（Id = poison など、Value = 敵の Uid・主人公は 0、Text = 名前、X/Y = 頭の上）。毒の数字は `DamageKind.Poison`。
- **頭の上のアイコン**: 主人公は `session.Pose.StatusIcons`（ビット `1 << (int)StatusKind`、`HasStatus(kind)`）。残り時間は `session.Status.Active` の `Ratio`。敵は `mob.StatusIcons`、ボスは `BossBar.StatusIcons`。

## 5. クラシックに比べてまだ違う所・次にやること

- **敵の速さ**: 這う敵は前の 40 px/秒から 50〜62 px/秒（FEEL.md の「-50〜+50 で 50〜150」に合わせた。MONSTERS.md の「30〜50」の書き方も直した）。
- **ボス**: 簡略にした所がある — 大ボスの部位（焔の巨像の腕 8 本・黒竜の 6 部位・星を呑む者の背中の核）は段階にまとめた。雲の魔女の分身・時計塔の「時の裂け目」・深淵の大魚の「光る岩」・巨像の「盾の陰」・大樹の怪の「ツタで引き寄せる」・渦潮の吸い込みは無い（技の数値だけ）。ボスの間の回数制限・制限時間も未実装。
- **状態異常**: ボスの毒を 1/10 にしたのは独自（クラシックは技ごとの上限）。石化（雲の魔女）は気絶で代わりにした。誘惑・混乱などクラシックの他の異常は無い。
- **敵の技の絵**: Core は `Motion`（attack1 / skill1）・`Hazards`（予兆）・`Projectiles`（SkillId）を出すだけ。絵・音は Unity 側。
- **2〜4 次のスキル**は見本の 5 つだけ。熟練（最小ダメージ）・追撃・闘気などは形（`passive.mastery` など）だけ用意。
- **攻撃の絵**: Core は攻撃の種類（振り・突き・撃ち・投げ・詠唱・殴り）を `Pose.AttackKind` で出しているが、絵の名前は ART_SPEC の `swingO1` だけ。
- **弓が矢なしの時**: クラシックは弱い殴りになるが、今は撃てない（お知らせだけ）。
- **闇隠れの「速さ −20+x」**: ブラウザ版の速さの計算（100 より下にしない）に合わせているので、遅くはならない。
- **ペット・倉庫・椅子・製作・2 次以降の転職の試験・1 人用ダンジョン・ボスの間（入る回数・制限時間）**は未実装（ボスそのものの技・段階は 4-5）。
- **大陸のマップ**は未作成（V100 の仮だけ）。大陸のクエストはデータとしては読めるが、目的の一部（「手紙を届ける」など文章だけの物）は `event` に直していない。
- **命中**: 初心者が当たらなすぎたので、レベルで上がる基礎の命中（5 + Lv × 0.5）を足した（`StatCalc.BaseAcc`）。Lv8・DEX 4 で Lv8 のダイダイダケに約 94%。
- 敵の HP バー・ボスの HP バー・NPC の会話の窓・UI の窓は Unity 側の仕事（Core は値を出している）。
