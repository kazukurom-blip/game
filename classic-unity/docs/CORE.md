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
    Mobs/      MobDef・Mob/MobAI（動き）・MobSkill（技・ボスの段階の形）・MobCombat（技を選ぶ・予兆・段階・呼び出し）・MobBuffs（敵の強化）・BossMechanics（ボスの仕掛け）・DropRoller（ドロップ）
    Status/    StatusSet（かかっている状態異常）・StatusSystem（かける・治す・時間を進める公開の入口）
    Items/     ItemDef・StatBlock・Inventory（5 タブ）・Equipment・ScrollSystem
    Quests/    QuestDef・QuestLog
    World/     MapData（マップの JSON の形）・MapInstance（敵・落ちている物・湧き直し）
    Save/      SaveData・SaveSerializer・SaveMigrations・SaveStore（壊れない書き方）・FileSystem
    Town/      SystemsData（systems.json の形）・Storage（倉庫・共有の AccountData）・PetState・DailyLog（実時間の 1 日 N 回）・QuizSession
    Game/      GameSession（全部をまとめる。Unity が持つのはこれ 1 つ。.Combat/.Skills/.Status/.Items/.Quests/.Mechanics/.Town/.Jobs/.Rooms/.Pets に分けてある）・PlayerInput・GameEvents・AvatarPose
    Data/      GameData（JSON を読む）・IDataSource
    Util/      Json（小さな読み書き）・Rng（決まった乱数）・Expr（スキルの式）
  Data/                     ← ゲームのデータ（JSON）。Unity では Assets/Resources/Lumina/ へコピー
    items.json monsters.json quests.json shops.json npcs.json skills.json systems.json maps/*.json
    tools/systems.mjs       ← 町と成長の仕組み（店の品ぞろえ・倉庫・タクシー・部屋の決まり・ペット・製作・クイズ・転職の試験）→ shops.json・systems.json・items.json の品
    tools/export_data.mjs   ← classic/tools/data/*.mjs → JSON（--check で書き出さずに検査）
    tools/skills_export.mjs ← skills.json = JOBS.md 4 章の表（名前・最大Lv・効果・MP・前提）＋ classic/tools/data/skills.mjs（範囲・式・動き・状態異常）
    tools/world/            ← マップの生成器と検査（generate.mjs・check.mjs・specs.mjs（マップごとの違い）・npcs.mjs・island.mjs（島は手で置いた））
    tools/quest_goals.mjs   ← 文章だけだったクエストの目的を、判定できる形（talk/visit/interact/collect/event）に直した表
    tools/export_golden.mjs ← テストの期待値（ブラウザ版の物理・設計書の式）→ Tests/Golden/
  Tests/                    ← xUnit（net8.0）。PlaytestTests.cs は通しのボットのテスト（長い物は LUMINA_LONG=1 の時だけ）
  Tools/PlayBot/            ← 通しで遊ぶボット（net8.0 のコンソール。docs/PLAYTEST.md）。Bot/ は Tests からも一緒にビルドする
  Unity/                    ← Unity 側の見本（GameRunner・PlayerView・InputBridge・DamageNumberView・MapLoader）
```

## 2. 確かめ方

```
cd classic-unity
dotnet test Tests/Lumina.Core.Tests.csproj          # 全部のテスト
node Data/tools/export_data.mjs                    # データを書き出し直す（classic/tools/data・JOBS.md・tools/world を直したら）
node Data/tools/export_data.mjs --check            # 書き出さずに: 今の JSON が元のデータと同じか（マップは種が決まっているので同じになる）・スキルの表とのつじつま・マップの検査
node Data/tools/world/check.mjs                    # Data/maps/*.json の検査だけ（下の 4-8）
node Data/tools/export_golden.mjs                  # 期待値を書き出し直す（ブラウザ版の物理・式を直したら）
node ../classic/tools/gen_docs.mjs --check         # 設計書の表とのつじつま
dotnet run -c Release --project Tools/PlayBot -- --lines all --tier 4 --hours 200   # 通しで遊ぶ（PLAYTEST.md。出力は .build/playbot/）
dotnet run -c Release --project Tools/PlayBot -- --lines all --start 70 --tier 3 --hours 40                # 近道: Lv70 から 3 次転職
LUMINA_LONG=1 dotnet test Tests/Lumina.Core.Tests.csproj --filter Category=Long                             # 長いテスト（ボットで 1 次・2 次・3 次）
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
session.Map           // Data（マップの JSON）・Mobs（敵: X, Y, HopY, Facing, Motion, Hp, MaxHp, FadeOut, Uid, Hidden, StatusIcons, BuffIcons, FormId, CloneOf/HasShadow, Charmed, Mechanic/MechanicKind）・Drops（落ちている物）
                      // Projectiles（敵の飛び道具）・Hazards（敵の技の予兆と当たる所・SuckW・SafeZones）・BossBar（ボスの HP バーの値。いなければ null）・Rifts（時の裂け目）
session.Decoy / Door / Zones / ShipHp   // 身代わり人形・秘術の扉・毒の霧・乗船の船の HP（4-4）
session.Status        // 主人公の状態異常（Active で一覧、Pose.StatusIcons にビット）
session.Out.Events    // 起きたこと（音・エフェクト・メッセージ）。次の Update の始めに空になる
session.Out.Damage    // ダメージの数字（Kind・Value・X/Y・Stack・Delay）
session.Character / Stats / Inventory / Equipment / Skills / Buffs / Status / Quests / QuickSlots
```

- **入力**（`PlayerInput`）: 押している間の物（Left/Right/Up/Down/Jump/Attack/Pickup）と、押した瞬間の物（JumpPressed/UpPressed/InteractPressed/SkillPressed/ItemPressed）。押した瞬間の物は Core が次の固定の更新で読むまで覚えている。キー配置は `Unity/InputBridge.cs`。
- **座標**: Core は 1 px = 1・y は下が正。Unity（PPU = 1）では `(x, -y)`。Pixel Perfect Camera は 800×600。
- **UI から呼ぶ操作**: `Talk(npcId)` → `NpcDialog`（受けられる・報告できるクエスト、店、宿屋、乗り物）／`AcceptQuest`／`CompleteQuest`／`Buy`／`Sell`／`RestAtInn`／`Travel`／`UseItem`／`UseSkill`／`SetQuickSlot`／`EquipFromInventory`／`Unequip`／`ApplyScrollToEquipped`／`ApplyScrollToInventory`／`SpendAp`／`SpendApHp`／`SpendApMp`／`LearnSkill`／`AdvanceJob`／`AdvanceJob2`（2 次: 試験の証と枝）／`Revive`／`SaveNow`／`NpcBulb`（電球）。
  町の仕組み（4-11）: `StorageDeposit`／`StorageWithdraw`／`StorageDepositMeso`／`StorageWithdrawMeso`／`StorageExpand`／`ShopItems`（今日の品）／`Recharge`（詰め直し）／`TaxiTo`・`TaxiFee`／`Craft`・`CraftsAt`／`SitOnChair`・`StandUp`（または椅子を `UseItem`）／`FeedPet`・`TalkToPet`・`SetPetOut`・`RenamePet`（ペットの品・餌・技の本は `UseItem`）／`StartQuiz`・`AnswerQuiz`（賢者の石を `Interact` すると始まる）／`UseMasterBook`／`CanEnterRoom`・`RoomEntriesLeft`。
  読む物: `session.Storage`・`Pets`（X/Y/Motion）・`Quiz`（Current: 問題と混ぜた選択肢）・`CurrentRoom`・`RoomTimeLeft`/`RoomTimerRunning`/`RoomCleared`・`Sitting`（Pose.Motion = "sit"）・`Daily`。
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

`Data/skills.json`（**JOBS.md の全 306 スキル**: 初心者 3・1 次 30・2 次 82・3 次 87・4 次 104）。式の `x` はスキルの Lv、`lv` はキャラの Lv（`floor`・`ceil`・`min`・`max` が使える）。
名前・最大 Lv（★は `masterLevel`）・効果の文・MP・前提は JOBS.md の表から、動きは `classic/tools/data/skills.mjs` から書き出す（手で直さない）。2 次以降は `branch`（2 次で選んだ枝）が合う時だけ覚えられる。

| 種類 | kind | 例 |
|---|---|---|
| 攻撃 | attack | 強打・二段突き・闘気爆発・天の一撃（4 回）・捨て身（防御無視）・暗殺（闇隠れ中 2 倍）・百裂拳（6 回） |
| 範囲 | area | なぎ払い・乱れ斬り（3 体 × 2）・連突き（3 体 × 3）・竜の咆哮（画面・HP 20%）・爆裂矢（最初の 1 体のまわりに爆発）・鉄の矢（貫く -10%/体）・貫く矢（+30%/体）・連鎖の雷・忍び寄る影（1 秒ごと 5 回） |
| 遠距離 | ranged | 魔力の矢・火の矢・二つ星投げ（LUK×5.0）・嵐の連射／弾幕（押しっぱなしで 1 秒 8 本）・狙撃（待ち時間 5 秒） |
| 移動 | movement | 早足・テレポート（向き／↑↓で上下の足場、壁は越えない）・空中ジャンプ |
| 強化 | buff | 加速（+2 段階）・神速（重なる）・闘気・付与（属性・同時に 1 つ）・全能力の加護・体力強化・魂の矢・影分身・お金の盾・煙玉・復活・変身・乗船 |
| 回復 | heal | ひと休み・ヒール（不死の敵に聖）・気の回復（LUK・DEX）・気合いの回復（MP） |
| パッシブ | passive | 熟練（最小ダメージ・命中）・追撃・闘気の極み・不屈・属性の増幅（MP も増える）・急所狙い・必殺の一撃・気合い・影の衣・暗黒の力 |
| 召喚 | summon | 闇の獣（回復）・火の精／銀の鷹など（interval 秒ごとに近くの敵へ）・タコの砲台（その場に置く）・身代わり人形（敵を引きつける） |

- 決まり: SP はそのスキルの段階の財布から・前提（`prereqs`、「または」は `prereqAny`）・MP/HP（`hpPct` は最大 HP の %）・お金（`meso`）・待ち時間（`cooldown`。4 次の一部と気合いの回復だけ）・効果の時間（`buff.sec`）・使える武器（`weapons`。2 次以降の攻撃は職の武器だけ）・弾を使う（`ammo`、1 回ごとに 1 つ）・射程のパッシブがのる（`rangeBonus`）。縄・はしごの上では使えない。
- 動きの種類（`motion`: swing/stab/shoot/throw/cast/punch）→ `Pose.AttackKind`。無ければ武器（剣=振り・槍と短剣=突き・弓と銃=撃ち・クロー=投げ・ナックル=殴り）、魔法は詠唱。
- 1 回の時間 = 攻撃速度の時間 × `delay` ＋ 詠唱 `cast`（流星群・吹雪・天の裁き 1.5 秒）・溜め `charge`（溜めの大魔法 2 秒、溜めきった扱いで ×2）。当たる瞬間は詠唱の後の振りの 300/800。突進（`dash`・`dashTime`）は攻撃中も前へ進む。
- 攻撃スキルのキーを押しっぱなし（`PlayerInput.SkillHeld`）で、終わるたびにくり返す。
- 弓・クロスボウで矢が無い時のふつうの攻撃は**弱い殴り**（振り・武器係数 1.4・矢は減らない）。クロー・銃はお知らせだけ。
- 状態異常: スキルのデータの `status`（種類・確率・秒・強さ）を `StatusSystem` へ渡す（poison/burn → 毒、stun/bind → 気絶、darkness・seal・freeze、slow → 遅延、polymorph → 変化（コロ貝 `M001` の姿）、charm → 錯乱（錯乱弾。敵は主人公の味方になる））。意志の力・解除は `CureStatus`、聖なる盾の間は受けない。
- **敵の強化を消す**: 鎧崩し（`dispel.what` = def: 防御・物理の反射）・魔法崩し（magic: 魔法攻撃・魔防・魔法の反射）・力崩し（atk）・解除（all・まわりの敵全部）。確率で `mob.Buffs` から消して `MobDispelled`。
- **錯乱弾で操った敵**（`mob.Charmed`）: 主人公に当たらない・技を使わない・主人公の攻撃の的にならない。近くの敵（400 px）を追って 1 秒ごとに体当たり（攻撃力 × 0.85〜1 − 防御 × 0.5）。倒した分の経験値は主人公に入る。
- **身代わり人形**: 主人公の前 30 px に置く（そのマップだけ）。HP は最大 HP の 50+5x%。450 px の中の敵は人形を追い（技も人形をねらう）、体当たり（0.5 秒ごと）・飛び道具・予兆の技で HP が減り、0 で消える。`session.Decoy`。
- **秘術の扉**: 町へ行き、町の着いた所に扉。扉の前で ↑ → 使った場所へ、使った場所の扉で ↑ → 町へ（効果の 30+5x 秒の間、何度でも）。`session.Door`。
- **乗船**: 船の HP（`shipHp` = 2000+200x）。受けたダメージで減り、0 で降りる（`ship_broken`）。`session.ShipHp / ShipMaxHp`。
- **隠れ足**: 空中でジャンプキーを押している間、落ちる速さを 120 px/秒まで（`PlayerBody.SlowFall`）。
- **毒の霧**: 当たった範囲を 6 秒（`zone`）置いておき、1 秒ごとに中の敵（最大 6 体）に毒をかけ直す（後から入った敵にも）。`session.Zones`。
- **クローの熟練**: 投げ星の 1 枠に重なる数 +10x（`Inventory.StackOf`）。**調合上手**: 薬の回復量 +(10+x)%・強化の薬の時間 +x%。**MP 吸収**: 敵の MP（`mob.CurMp`）を減らし、無くなったら吸えない。**星の連投**: データで `chainable` の付いたスキル（二つ星投げ）だけ。
- 効き目の合計は `Stats.Mods`（`SkillMods`）。闘気の玉は `session.ComboOrbs`、気合いは `session.Energy`（100 で満タン → 60 秒の強化）。

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
| buff | 自分（`allies` なら w 幅の中の仲間も）を強化（`buff`: atk・matk・def・mdef・speed は +%、reflect・magicReflect は受けたダメージの % を返す、sec） | `mob.BuffIcons` |

- 技の無い敵は「攻撃」の列から自動（遠 = 3 秒ごとの飛び道具、魔 = 足元に予兆の魔法）。体当たりは今までどおり。`touchStatus` で触れた時の状態異常（フグトゲの毒・クラゲンの気絶など）。
- 技を使うのは: ボス、攻撃されて追っている間、Lv20 以上の歩く敵、動かない敵。待ち時間は技ごと（ボスは入った直後 30%）、技と技の間 1 秒。気絶・凍結・眠りで構えは消える（予兆も消える）。封印の間は技を使わない。闇隠れ中は狙わない・当たらない。
- 当たると `HitPlayer`（ダメージは攻撃力 × pct%。魔法は避けられない。pct 0 は状態異常だけで、無敵の間もかかる）。お知らせ: `MobCast`（構え・予兆の始まり）・`MobSkillHit`・`MobSummoned`・`MobBuffed`/`MobBuffEnded`。
- 技の追加の項目: `pull`（当たったら敵の方へ px 引き寄せる。ツタ）・`suck: { w, speed }`（予兆の間、w 幅の中の主人公を中心へ吸い込む。当たるのは中心の w×h。渦潮）・`shelter: { at, w }`（マップの横幅の割合の所の w 幅にいれば当たらない。全滅の炎の盾の陰。`Hazard.SafeZones`）。主人公を動かすのは `PlayerPhysics.Shove`（地面では足場にそって・壁は越えない）。
- **敵の強化**（`Mobs/MobBuffs.cs`）: 攻撃・魔法攻撃・防御・魔防・速さ（+%）と反射（物理・魔法）。同じ種類は強い方・長い方。反射は主人公が与えたダメージの % を返す（1 回で最大 HP の 20% まで・HP 1 で止まる。似）。データ: ガイコツ大将（骨の守り: 防御）・黒角の魔獣（怒りの咆哮: 攻撃・速さ、怒りの段階）・雲の魔女（雲の衣: 魔防・魔法の反射）・神殿の守護神（光の鏡: 反射・防御、金と光の段階）・封印の司祭（守りの祈り: まわりの仲間の防御・魔防）。

#### ボス（`MobDef.Boss`）

- `boss.phases`: HP がその割合以下で次の段階（戻らない）。段階ごとに `atkMul`・`defMul`・`speedMul`・`rate`（技の速さ）・`elements`（弱点の上書き）・`healPct`（始まった時に治す）・`summon`（始まった時に呼ぶ）。技は `phases` で使う段階を決める。お知らせ `BossPhase`（Value = 段階、Text = 名前）。
- 地域のボス 12 体・大ボス 3 体・ダンジョンの主 7 体にデータあり（MONSTERS.md 5 章をもとに。大ボスの部位は段階にまとめた簡略版）。データの無いボスも 1 段階で HP バーは出る。
- **ボスの HP バー**: `session.Map.BossBar`（`BossBarInfo`: Name・Lv・Hp/MaxHp・Ratio・Phase/PhaseCount/PhaseName・段階の中の残り PhaseRatio・状態異常・強化 BuffIcons・大技の詠唱 Casting/CastName/CastProgress・Guarded（時の裂け目）・Submerged/SubmergeProgress/RocksLeft・Clones）。色は Phase で変える。分身はバーに出ない。

#### ボスの仕掛け（`Mobs/BossMechanics.cs`・データは mob_skills.mjs の `boss`）

| 仕掛け | データ | 動き | Unity へ出す値 |
|---|---|---|---|
| 分身（雲の魔女・HP 50%） | 段階の `clones: { count: 2, hpPct: 2, shuffle: 8 }` | 本物と同じ姿の分身（HP は最大 HP の 2%・攻撃力半分・呼び出し/回復/強化はしない）。8 秒ごとに本物と分身の場所が入れ替わる。本物が倒れると消える | `mob.CloneOf`・`HasShadow`（本物だけ影）・`BossBar.Clones`・`Mechanic "clones"/"shuffle"` |
| 時の裂け目（時計塔の魔物・1 段目） | `boss.rifts: { phase: 0, count: 3, mob: M149, limit: 60, guard: 0.1, expose: 20 }` | 床に裂け目 3 つ。本体の受けるダメージ × 0.1。部屋の時計虫（M149）を倒すと時のかけら。裂け目の上で調べるキーではめる。60 秒で全部はめないと元に戻る（時計虫がまた出る）。全部はめると 20 秒無防備。2 段目で終わり | `session.Map.Rifts`（Spots の X/Y/W/Filled・Progress・Shards・Exposed）・`BossBar.Guarded`・`Mechanic "rift_*"/"shard_got"` |
| 深く潜って回復・光る岩（深淵の大魚・HP 75/50/25%） | 段階の `submerge: { sec: 30, healPct: 5, rocks: 3, rockHpPct: 0.5 }` | 30 秒潜る（当たらない・技なし）。岩が残っている間、30 秒で最大 HP の 5% の速さで治る。岩（HP は最大 HP の 0.5%）を全部壊すと止まって出てくる | `BossBar.Submerged/SubmergeProgress/RocksLeft`・岩は `mob.MechanicKind == "rock"`（ID は `M189.rock`）・`Mechanic "submerge"/"surface"/"rock_broken"` |
| 盾の陰（焔の巨像・全滅の炎） | 技の `shelter: { at: [0.06, 0.94], w: 90 }` | 予兆 5 秒の間に隅の盾の陰へ入れば当たらない | `Hazard.SafeZones` |
| ツタの引き寄せ（大樹の怪） | 技の `pull: 200` | 当たると敵の方へ最大 200 px（敵の手前 40 px まで） | `Mechanic "pulled"` |
| 渦潮の吸い込み（深淵の大魚） | 技の `suck: { w: 600, speed: 110 }`・当たるのは中心 140 px | 予兆 1.6 秒の間、中心へ 110 px/秒（歩けば逃げられる） | `Hazard.SuckW`・`Progress` |

- 仕掛けの物（分身・光る岩・時計虫）は倒しても経験値・ドロップ・クエストの数にならない（`mob.Mechanic`）。湧き直しの数にも入らない。

### 4-6. アイテム（ITEMS.md）

- 持ち物 5 タブ（装備・消費・設置・その他・特別）、各 24 枠、転職で +4。薬 100・素材 200・矢 1000・投げ星 500 などで重なる。お金の上限 21 億。
- 装備: 部位（全身は上下を外す・両手武器は盾を外す・盾は両手武器を外す）、職の制限（初心者は共通だけ）、必要 Lv・能力（AP ＋ ほかの装備）。落とした装備は ±5% ぶれ、1% で上質（+10%）。
- 強化の書: 10/60/100%、呪いの 30/70%（失敗の半分で壊れる）。成功しても失敗しても回数 −1。
- 解毒薬（毒）・目薬（暗闇）・聖水（呪い）・万能薬（毒・気絶・暗闇・封印・呪い）。弱り・凍結・眠りは時間だけ（STATS.md 4-3）。治す物が無くても使える。
- 薬・強化の薬（時間）・帰還の書（地域の中だけ。「一番近い町」もある）・店（買う・売る。装備は 1/5）・宿屋。

### 4-7. クエスト（QUESTS.md）

- `Data/quests.json`（286 本）。目的: `kill`（倒す）・`collect`（持ち物の数。完了で渡す）・`talk`（話す）・`visit`（行く）・`interact`（調べる）・`event`（操作の名前。`GameSession.QuestEvent` で知らせる）。報告先 `end`（`auto` は着いたら完了）。受ける条件の能力値 `minStats`（転職の「STR35 以上」。足りなければ `StartResult.StatTooLow`）。
- **全部のクエストに判定できる目的がある**。文章だけだった物（手紙を届ける・灯台のランプ・化石を調べる・ダンジョンをクリア・転職 など 91 本）は `Data/tools/quest_goals.mjs` で直した。依頼者・報告先は「名前＠マップ」から NPC の ID に直してある（そのマップにいない依頼者は書き出しの時に問題として止まる）。
- event の名前: quickslot_set / use_potion / ap_spent / sp_spent / skill_used（チュートリアル）・`job_advance.1`（`AdvanceJob` が知らせる）・`job_advance.2〜4`・`storage_deposit` / `storage_withdraw`・`pet_adopted` / `pet_fed` / `pet_closeness`・`dungeon_clear` と `dungeon_clear.<マップID>`・`boss_kill`・`quiz_cleared`。全部 Core が知らせる（4-11）。
- 転職のクエスト（J 系）は `line`（自分の系統だけ受けられる。違えば `StartResult.WrongJob`）。1 次転職のクエスト（目的が `job_advance.1` の J?-1）は初心者だけ（転職した後は `WrongJob`。受けると終わらないクエストが残るため。PLAYTEST.md）。`advance`（J?-7 = 3 次・J?-9 = 4 次: 完了すると転職）・`unlock`（V-13 = 倉庫の枠 +4、PET-07 = ペット 2 匹）は quest_goals.mjs。
- 報酬の経験値・お金は QUESTS.md 1-3 の式。品は名前から ID に直してある（直せない物は `rewardUnparsed` に残る。大陸のクエストの「自分の職の◯◯」など）。
- 頭の上の電球: `NpcBulb`（2 = 緑、1 = 黄）。
- **チュートリアル 20 本（S-01〜S-20）は、目的を機械で判定できる形に書き直し、テストで最初から最後まで遊んで通す**（歩いて岩を越える・縄を登って木箱・ポータル・狩り・拾う・隠し部屋・船で大陸へ）。

### 4-8. ワールド（WORLD.md）

- マップの JSON の形は `Core/World/MapData.cs` の先頭。足場（折れ線）・縄/はしご・壁・ポータル・湧く所・強敵・NPC（店・宿屋・乗り物・role）・調べる物・BGM（SOUND.md の曲の ID）・背景の種類（`bg` → `Background`）・地形の型（`theme` → `Theme`）。
- **234 枚すべてある**（WORLD.md 5 章の表と同じ。つながりと出る敵は `maps.mjs` のとおり）。芽吹きの島 12 枚はチュートリアルに合わせて手で置いた物（`tools/world/island.mjs`）。ほかの 222 枚は**地形の型から生成**（`tools/world/generate.mjs`）。マップごとの違い（型・横幅・層の数・縄かはしごか・背景・曲・隠し部屋・調べる物）は `tools/world/specs.mjs` のデータ。種はマップの ID なので、何度作っても同じ。
- 地形の型: 町（平ら）・高い町（地面の上に 2〜3 段）・丘の町（段々）・平原・森（跳んで上がる根や枝の階段）・岩山/雪山（段々の地面＋岩棚）・沼/海（浮き島）・洞くつ（全幅の層＋はしご）・塔（左右交互の層）・船・ボスの間・部屋・1 人用ダンジョン（壁で区切った部屋をポータルで進む）。
- 手触りの決まり（FEEL.md）: 跳んで上がる段差は 40〜60 px（設計の上限 64）、64〜80 px の「跳べそうで跳べない」段差は作らない、80 px 以上は縄・はしご（上端は足場の高さちょうど、下端は下の足場の 20 px 上）、坂は 45 度まで。狩り場は横長で 3 層以上・湧く所 8 以上。
- **検査**（`tools/world/check.mjs`。生成器は通るまで種を変えて作り直す）: どのポータル（出現の位置も）からも全部の足場に行ける・ポータルの行き先が両方向で合っている・maps.mjs のつながりと同じ・湧く所/強敵/NPC/調べる物が足場の上・maps.mjs の敵が全部湧く・縄の両端・跳べない段差なし。動きのモデルは物理と同じ数値（その場ジャンプ・↓ジャンプ・端から落ちる・縄・同じマップの中のポータル）。
- **テストは本物の物理でも確かめる**（`Tests/MapReach.cs`・`WorldMapTests.cs`）: 全マップで、足場の上の 16 px おきの位置から PlayerPhysics で動いて行ける所を調べ、どのポータルからも全部の足場に行けること。代表の 17 枚は 1 つの体で全部の足場を順に回り、全部のポータルの前に立つ（歩いて止まる → 動く、を続けて）。
- ボス（monsters.json の `boss` を持つ 22 体: 地域ボス 12・大ボス 3・ダンジョンの主など 7）は、ボスの間（1 人用ダンジョンは最後の部屋・試験の部屋）の `timedSpawns` に置いてある。間隔は WORLD.md の特徴の欄（「1 時間ごと」「1 日 2 回」「週 1 回」）から。
- 戻る町（`returnMap`）: ポータルでたどって一番近い町。島は芽吹き村。
- NPC は `tools/world/npcs.mjs`（167 人）。位置は生成の時に決まる（高い町では `tier` の段に）。同じ人が別のマップにもいる時（転職官が修練場にいる）は `dorga_V413` のような別の ID。乗り物の NPC（雲の船・潜水船・大きな鳥・そり）は `travel`。町の薬屋には店（`shop.<町>.potion`）がある。
- 隠し部屋（WORLD.md 6 章）: S007・V102（灯台のてっぺん）・V105・V409・V506・V601・M107・T104（おもちゃ箱の底）。隠しポータル（`hidden`）で入り、部屋のポータルで戻る。
- **一方通行のポータル**（`oneWay: true`）: 雲の塔 C107〜C110 の窓（`window`）→ C111 の `slide_in`（type `landing` = 着くだけの位置。入れない）。T104 の落とし穴（`secret`、同じマップの中）→ おもちゃ箱の底 → 部屋の出口は出現の位置（`sp`）へ。specs.mjs の `slide` / `landing` / `secret.oneWay`。検査（check.mjs・WorldMapTests）: 一方通行は戻りが要らない（着く先から戻れたら間違い）・ふつうのポータルの着く先は landing でない・landing はどこかの一方通行の着く先・maps.mjs のつながりの比べには入れない。
- 町の店の人（武器屋・防具屋・薬屋/雑貨・ペット屋・市場）には export_data.mjs が `shop` を付ける（品ぞろえは systems.mjs）。タクシーの運転手（大陸の 6 町）は `taxi`（行き先 5 つと料金）。

### 4-9. セーブ（いちばん大事）

- ファイル: `<slot>.json`（今）・`.tmp`（書いている途中）・`.bak1〜3`（前の版）。中身は全体が 1 つの JSON:
  `{"format":"lumina-save","seq":12,"length":3456,"crc32":"89abcdef","data":{…}}`
- 書く順番: `.tmp` に書いて fsync → 読み直して確かめる → bak を 1 つずつ後ろへ → 今のセーブを bak1 へ → `.tmp` で一度に置き換え。**どこで落ちても、前の版か新しい版のどちらかが必ず読める**（テストで全部の手順で「落ちた」を再現。ちぎれた書き込みも）。
- 読む順番: 今のセーブと `.tmp` のうち壊れていなくて `seq` の大きい方 → bak1 → bak2 → bak3。壊れていたら `LoadResult.Recovered` と理由（`Problems`）。全部壊れていても落ちずに「読めない」を返す。
- 版: `version`（今は 2）。古い版は `SaveMigrations` で 1 つずつ直してから読む。新しすぎる版は断る（バックアップへ）。データに無いアイテムは外してお知らせ。
- 版 3: ペット（`pets`）と実時間の回数（`daily`: ボスの間・ダンジョン・毎日の宝箱）を足した。版 2 は空で足して読む。
- **倉庫はキャラ全員で共有**: キャラのセーブとは別の枠 `account`（同じ壊れない書き方。`SaveStore.SaveText/LoadText`、中身は `AccountData`）。`AttachSave` で読み、`SaveNow` でキャラより先に書く（間で落ちると品が両方に残る向き。消えはしない）。
- 制限時間のある部屋（ボスの間・ダンジョン・試験）の中では、場所を戻り先にして保存する。
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
| 遅延 | Slow / slow | 速さ −power（既定 20。主人公は 30 より下げない、敵は元の 2 割より下げない） | 意志の力・解除・時間 |
| 変化 | Polymorph / polymorph | 攻撃・スキルが使えない（歩ける・薬は使える）。敵はコロ貝（M001）の姿・攻撃力・防御になり技を使わない（`mob.FormId`、`Pose.Polymorphed`） | 意志の力・解除・時間 |
| 錯乱 | Confuse / confuse | 主人公は左右が逆（`Pose.Confused`）。敵は錯乱弾で主人公の味方になる（`mob.Charmed`） | 意志の力・解除・時間 |

- **重ねがけ**: 同じ種類は重ならない（かけ直すと残り時間は長い方・強さは強い方）。違う種類は同時にかかる。死ぬと全部消える。セーブしない（バフと同じ）。
- **効きにくさ**: ボス（kind = boss）は気絶・凍結・眠りが 1/3 の時間、毒は 1/10 の強さ、変化・錯乱は効かない。大ボス（raid）は何も効かない（`StatusResisted`）。
- **敵の技から**: 時計塔の魔物（時の遅れ: 遅延 6 秒・−40）・雲の魔女（変化の光: 変化 4 秒・50%）・ダラダラオバケ（惑わしの息: 錯乱 4 秒・30%）・星を呑む者（惑いの星: 画面全体の錯乱 4 秒）。
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

### 4-11. 町と成長の仕組み — `Core/Town/`・`GameSession.Town/Jobs/Rooms/Pets.cs`（データは `Data/systems.json` ← `Data/tools/systems.mjs`）

- **店**（ITEMS.md 6 章）: 町ごとに武器屋・防具屋（職と Lv の範囲で装備を選ぶ。Lv100 以上は売らない）・薬屋/雑貨（薬・強化の薬・状態異常の薬・帰還の書・お守り）。ペット屋（V200）・ねむり谷の雑貨屋・市場の家具。買値 = 装備の値段、売値 = 装備 1/5・ほか 1/2（今までどおり）。**市場の日替わり**（`daily`: 古道具屋 8 品（中古は 0.7 倍）・書の行商人 5 品（60% 3 万・100% 2 万））は日付と店の ID の種で選ぶ（`ShopItems`）。**詰め直し**（クロウ街・潮風号の武器屋）: 減った分を新品の 1/2。
- **倉庫**（ITEMS.md 1 章）: 倉庫番（role `storage`）で出し入れ 1 回 100 ルド（お金の出し入れは無料）。16 枠 → 4 枠ずつ 48 まで（10,000 → 20,000 → …）。クエストの品は預けられない。重なる物は重ねる。`storage_deposit` / `storage_withdraw`。共有の保存は 4-9。
- **タクシー**（WORLD.md 4 章）: 大陸の 6 町（V100・V200・V300・V400・V500・V600）の運転手から残り 5 町へ。料金 800 ＋ 140 ×（町の並びの離れ − 1）= 800〜1,500、初心者（0 次）は 1/10。回数券で無料。雲の船は `Travel(npc, useTicket)` で切符が使える。
- **製作**（ITEMS.md 4 章）: 精錬（原石 10 → 板。カジ・ツララ・ドラン）・宝石（原石 10 → 宝石。ネズ）・ミスリルの小手（攻撃力 +2）・闇の水晶（ジュエ）。`CraftsAt(npc)` が `NpcDialog.Crafts` にも入る。
- **毎日の宝箱**: T104 おもちゃ箱の宝箱・M107 沈んだ宝箱。`Interact` で 1 日 1 回（その Lv の敵のお金 × 20 と薬 5 つずつ）。
- **椅子**（設置）: `UseItem`（または `SitOnChair`）で座る。地上で止まっている時だけ。自然回復 1 回の量が 1.5 倍。左右・上下・ジャンプ・攻撃・スキルで立つ。`Pose.Motion = "sit"`。
- **1 次の転職でもらう物**（JOBS.md 3-1）: `AdvanceJob` が職の武器と薬・矢・投げ星・弾を渡す（systems.json の `jobs.firstJobItems`。戦士 青銅のソード・赤ポーション 20／魔法使い 麻のワンド・青ポーション 20／弓使い 草原の弓・弓の矢 2000／盗賊 黒布のクロー・投げ星 2400／海賊 帆布のナックル・帆布の銃・弾 800）。入りきらない分は足元に落とす。
- **2〜4 次の転職**（JOBS.md 3 章）: 2 次 = J?-2 推薦状 → J?-3 修練場で試しの珠 30（20 分。外に出る・時間切れ・中で倒れるとやり直しで珠が消える）→ 試験の証 → `AdvanceJob2(枝)`（J?-4 の `job_advance.2`）。3 次 = J?-5 手紙 → J?-6 **次元の扉**（修験の雪洞 F118 は J?-6 を進めている間か、J?-6 を受けられる間だけ入れる（依頼者が雪洞の中にいるため。`requiresAnyQuest` のクエストの依頼者がその部屋の中なら「受けられる」でも入れる）。入るとすぐもう一人の自分。20 分）→ J?-7 賢者の石（`Interact` でクイズ。黒いお守りと闇の水晶が要る）→ 完了で 3 次（`job_advance.3`、AP +5・SP +1）。4 次 = J?-8 → J?-9 紅翼の主・蒼翼の主（試験中は印を必ず落とす）→ 完了で 4 次（`job_advance.4`・極意の書 20）。転職のたびに持ち物の枠 +4（装備・消費・その他）。
- **クイズ**: 30 問（このゲームの町・人・決まりのオリジナルの問題）から 5 問。選択肢の順番は毎回混ぜる。全問正解で `quiz_cleared`、間違えると闇の水晶を 1 つ失って終わり。
- **極意の書**: `UseMasterBook(書, ★スキル)`。20 は 70%、30 は 50%（決めた値）。上限が上がらない組み合わせは `Invalid`（書は残る）。
- **ボスの間・1 人用ダンジョン・試験の部屋**（`RoomRule`。MONSTERS.md 5 章・QUESTS.md 6 章）: 入る条件（鍵の品・前提クエスト・Lv の範囲・実時間の 1 日 N 回/週 1 回）はポータルで入る時に確かめ（`CanEnterRoom`）、入ったら 1 回使う。`fresh` の部屋は入るたびに作り直し（ボス・主がすぐ出る）。制限時間が切れると戻り先へ（`RoomTimeUp`）。中で倒れると戻り先で起き上がる（1 人用ダンジョンは経験値 1%）。

| 部屋 | 回数 | 時間 | 条件 |
|---|---|---|---|
| V309 大樹の根元 / V412 / V512 | 1 日 3 回 | 30 分（決めた） | V309 は W-15 の後 |
| V618 封印の間 / C116 / F110 | 1 日 2 回 | 30 分（決めた） | V618 は封印の鍵 |
| T117 時の門 / M112 / P109 | 1 日 2 回 | 20 / 20 / 25 分 | T117 は時の鍵 |
| H107 焔の祭壇 | 1 日 1 回 | 45 分 | 焔の目 |
| D114 黒竜の洞くつ 最奥 / E108 星の玉座 | 週 1 回 | 60 分 | 通行証 / 星の玉座の鍵 |
| 1 人用ダンジョン V516・T121・T122・C119・M115・D117 | 1 日 5 回 | 20・30・15・45・30・30 分 | Lv の範囲。主を倒すと `dungeon_clear` と `dungeon_clear.<マップ>`・試練のメダル（ダンジョンごと） |
| 修練場 V413・V311・V211・V513・V108 | — | 20 分（J?-3 の間だけ） | 外に出る・時間切れで試しの珠が消える |
| F118 修験の雪洞（次元の扉） | — | 20 分 | J?-6 を進めている間だけ |

- **boss_kill**: ボス・大ボス（kind boss/raid）を倒すと（R-21）。お知らせ `BossKilled`。
- **ペット**（QUESTS.md 4 章）: ペット屋で買った「子犬」などを `UseItem` で迎える（`pet_adopted`）。連れて歩けるのは 1 匹（PET-07 の後 2 匹）。満腹度 0〜100（36 秒で 1 減る・餌 +30・0 で動かない）。親密度 Lv1〜30（Lv n → n+1 に 3n 点。餌 +3（お腹が空いている時）・芸の成功 +1（60%・10 秒に 1 回）・満腹度 50 以上で 5 分連れて歩くと +1・満腹度 0 のまま 10 分で −1）。親密度の目的（PET-04〜07）は「今の Lv」まで進む。技の本: 自動で拾う（80 px、範囲を広げると 200 px）・自動で薬（HP 50%・MP 30% を下回ると一番効く薬）。子竜は親密度 30 で「竜」。名札で名前を変える。数は全部「決めた値」（systems.mjs）。
- お知らせ（GameEvents）: `StorageChanged`・`Crafted`・`ChestOpened`・`SatDown`/`StoodUp`・`PetAdopted`/`PetFed`/`PetCloseness`/`PetTrick`/`PetHungry`/`PetUsedPotion`・`RoomEntered`（Value = 制限時間、Text = あと何回）/`RoomTimeUp`/`RoomFailed`/`DungeonCleared`・`BossKilled`・`QuizQuestion`/`QuizAnswered`/`QuizCleared`。

## 5. クラシックに比べてまだ違う所・次にやること

- **敵の速さ**: 這う敵は前の 40 px/秒から 50〜62 px/秒（FEEL.md の「-50〜+50 で 50〜150」に合わせた。MONSTERS.md の「30〜50」の書き方も直した）。
- **ボス**: 簡略にした所がある — 大ボスの部位（焔の巨像の腕 8 本・黒竜の 6 部位・星を呑む者の背中の核）は段階にまとめた。ボスの間の回数制限・制限時間は 4-11。仕掛け（分身・時の裂け目・光る岩・盾の陰・ツタ・渦潮）は 4-5 のとおり入れたが、盾の陰は全滅の炎の予兆の間だけ（いつも置いてある盾の絵はマップの方で）。時のかけらは持ち物ではなく、そのボスの間の中だけの数（`Rifts.Shards`）。
- **状態異常**: ボスの毒を 1/10 にしたのは独自（クラシックは技ごとの上限）。石化（雲の魔女）は気絶で代わりにした。誘惑などクラシックの他の異常は無い。錯乱は「主人公 = 左右逆」「敵 = 味方になる（錯乱弾）」の 2 つの意味で 1 つの種類にした。
- **敵の技の絵**: Core は `Motion`（attack1 / skill1）・`Hazards`（予兆）・`Projectiles`（SkillId）を出すだけ。絵・音は Unity 側。
- **2〜4 次のスキル**: 全部入れて効かせた（敵の強化を消す・遅延・変化の呪い・錯乱弾・秘術の扉の戻りの扉・身代わり人形・乗船の HP・隠れ足・毒の霧の設置・クローの熟練の 1 束・調合上手・MP 吸収で敵の MP を減らす）。残り: 溜めの大魔法は溜める長さを選べない（いつも 2 秒で ×2）。盗賊団・爆弾カモメは即時の攻撃。当たる範囲・ディレイ・状態異常の秒（JOBS.md に無い物）・身代わり人形の引きつける距離（450 px）・船の HP（2000+200x）・隠れ足の落ちる速さ（120 px/秒）・敵の反射の上限（最大 HP の 20%）は「似」で決めた値。
- **攻撃の絵**: Core は攻撃の種類（振り・突き・撃ち・投げ・詠唱・殴り）を `Pose.AttackKind` で出しているが、絵の名前は ART_SPEC の `swingO1` だけ。
- **闇隠れの「速さ −20+x」**: ブラウザ版の速さの計算（100 より下にしない）に合わせているので、遅くはならない。
- **町と成長の仕組み（4-11）の簡略**: 1 人用ダンジョンの部屋ごとの課題（合い札・縄の組み合わせ・鍵集め・迷路のつながりが変わる 等）は無く、最後の主を倒すとクリア。ごほうびの部屋・ランダムの報酬・メダルの交換（6-7）・R-22 のメダル 2 枚は無い。修練場の職ごとの仕掛け（テレポート台・動く的・暗い倉庫 等）は無い。もう一人の自分は自分のスキルを使わない（ふつうの強敵）。市場の素材屋の 1 割高の買い取り・露店の冒険者は無い。製作は例の分だけ（手袋 6・靴 4 などの一覧はまだ）。ペットの装備・芸の絵は Unity 側。
- **極意の書**: クラシックどおり★は最初 10、20 の書で 20、その後 30 の書で 30（JOBS.md の表を 10/30 に直した）。
- **マップの見た目**: 足場の配置は生成なので、絵（タイル・背景の層・飾り）を置く時に「ここに家」「ここに風車」などの手直しが要るかもしれない。直す時は `specs.mjs`（型・層の数・横幅）か、その 1 枚だけ島のように手で置く。
- **乗り物**: 雲の船・潜水船などは 1 人 1 行き先のまま（雲の船の駅は行き先ごとに係がいる）。複数の行き先はタクシーだけ。船の「10 分ごとに出る・乗っている 2 分」は無い（すぐ着く）。
- **崩れる足場**（T104）は物理に無いので、おもちゃ箱の底へは地面の右端の隠しの落とし穴から入る。
- **命中**: 初心者が当たらなすぎたので、レベルで上がる基礎の命中（5 + Lv × 0.5）を足した（`StatCalc.BaseAcc`）。Lv8・DEX 4 で Lv8 のダイダイダケに約 94%。
- 敵の HP バー・ボスの HP バー・NPC の会話の窓・UI の窓は Unity 側の仕事（Core は値を出している）。
- **通しの検証（docs/PLAYTEST.md）で見つけて、まだ直していない物**: Lv20〜30 で薬代が稼ぎを上回る・命中（敵の回避 Lv×0.5）で近接職の MISS が多い・投げ星が尽きた盗賊は攻撃できず詰む・乗り物でしか出入りできない地域でお金が尽きると出られない・2 次の試験（試しの珠）と 4 次の試験（紅翼の主・蒼翼の主）の難しさが職で違う・繰り返しのクエスト（R 系）は 1 回だけの扱い。案は PLAYTEST.md 3-3・4 章。
