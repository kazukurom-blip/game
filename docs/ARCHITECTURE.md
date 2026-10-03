# NEON LEONIDA STORY — アーキテクチャ／モジュール契約

メイプルストーリー風 横スクロールアクションRPG × GTA6風 クライムオープンシティ。
ブラウザ (HTML5 Canvas 2D) / ビルド不要 / ES Modules / 外部画像なし（全グラフィックはコードで描画するオリジナル）。

> ⚠ 著作権: 実在ゲームの画像・ロゴ・キャラ・固有名詞はコピーしない。雰囲気・ゲームデザインの要素のみ参考にする。
> 架空の州「レオニダ」風 → 本作では **「ネオリダ州 / ヴァイス・ベイ市」** という架空地名を使う。

## 担当（エージェント）とファイル所有権

| 担当 | 所有ファイル |
|---|---|
| ディレクター/統合 (メイン) | `index.html`, `style.css`, `src/main.js`, `src/core/*` |
| リサーチ担当 | `docs/REFERENCE.md` |
| アート担当 | `src/render/*` |
| ゲームシステム担当 | `src/data/*`, `src/systems/*` |
| ワールド＆エンティティ担当 | `src/world/*`, `src/entities/*` |
| UI担当 | `src/ui/*` |
| デバッグ担当 | `src/debug/*`, `tests/*`, 全体のバグ修正 |

他担当のファイルは原則編集しない（必要ならこの契約どおりの関数を呼ぶだけ）。git操作はメインのみ。

## 座標・基本ルール

- 論理解像度 **1280×720**。ワールド座標は y 下向き。マップ高さは一般に 1000〜1400。
- エンティティ座標 `x,y` は **足元中央**。当たり判定矩形は `{x: e.x - e.w/2, y: e.y - e.h, w: e.w, h: e.h}`。
- 時間は秒 (`dt` 秒)。重力 `GRAVITY = 2200` px/s²。
- キャラ（プレイヤー）の見た目の高さ ≈ 80px（2.5頭身のちびアニメ調）、判定 `w=32,h=70`。
- 描画時、ワールド空間のものは main 側で `ctx.translate(-cam.x, -cam.y)` 済みの状態で呼ばれる。

## グローバル `game` オブジェクト（main.js が生成）

```js
game = {
  W: 1280, H: 720, ctx, canvas,
  time, dt,                    // 経過秒, フレームdt
  scene: 'title' | 'play',
  input,                       // core/input.js 参照
  events,                      // core/events.js EventBus: on(name, fn), off, emit(name, data)
  cam: {x, y},
  state,                       // セーブデータ（下記）
  map,                         // 現在の MAPS[mapId] オブジェクト
  player,                      // entities/player.js Player
  enemies: [], projectiles: [], drops: [], npcs: [], vehicles: [], effects: [],
  spawner,                     // entities/spawner.js Spawner
  missions,                    // systems/missions.js MissionManager
  ui,                          // ui/ui.js UIManager
  debug,                       // debug/debug.js DebugPanel
  wanted: 0,                   // 手配度 0〜5（GTA風）。wantedHeat で内部管理
  wantedHeat: 0,
  paused: false,
  notify(text, color?),        // トースト通知（ui に委譲）
  changeMap(mapId, x?, y?),    // マップ移動
  save(),                      // localStorage 保存
}
```

### `game.state`（セーブデータ。純データのみ）

```js
{
  heroId: 'luna' | 'jin',
  level: 1, exp: 0, money: 500,
  hp, mp,                       // 現在値
  sp: 0,                        // スキルポイント
  ap: 0,                        // 能力ポイント（STR/DEX/INT/LUK に振る）
  stats: {str: 4, dex: 4, int: 4, luk: 4},
  inventory: [{id, qty}],       // 最大 48 スロット
  equipped: {hat, top, bottom, shoes, weapon, accessory}, // itemId | null
  skills: {skillId: level},
  skillBar: [skillId|null x4],  // A,S,D,F
  potionBar: [itemId|null x2],  // 1,2 キー
  missions: {active: [id], completed: [id], progress: {id: number}},
  mapId: 'beach', 
  flags: {},
  kills: 0, rareFound: [],
}
```
`newState(heroId)` は `systems/progression.js` が提供。

## 入力 `core/input.js`（メイン）

`input.down(action)` 押下中 / `input.pressed(action)` このフレームで押された / `input.mouse = {x, y, down, clicked}`（論理座標）。

| action | キー |
|---|---|
| left/right/up/down | 矢印 |
| jump | Space / Alt / C |
| attack | X / Ctrl |
| skill1..4 | A S D F |
| potion1/2 | 1 / 2 |
| pickup | Z |
| interact | E / Enter（NPC会話・車の乗り降り）。ポータルは ↑ |
| inventory | I |
| skillWin | K |
| missionWin | J |
| statWin | T |
| debug | F2 / ` (バッククォート) |
| escape | Esc |

## モジュール契約

### アート担当 `src/render/`

- `character.js`
  - `drawCharacter(ctx, x, y, look, equip, anim)`
    - `look = {body:'f'|'m', skin, hair:'twin'|'bob'|'long'|'spiky'|'short'|'ponytail'|'wolf', hairColor, eyeColor}`
    - `equip = {hat, top, bottom, shoes, weapon, accessory}` 各値は **item.look**（`{style, color, accent}`）か `null`
    - `anim = {facing: 1|-1, state:'idle'|'walk'|'jump'|'climb'|'attack'|'shoot'|'hurt'|'dead'|'drive'|'sit', t, attackT:0..1, damage:0..1, scale?:1, flash?:bool, alpha?:1}`
    - `damage` = `1 - hp/maxHp`。**HPが減るほど服が破れていく**: 0.25〜 小さな裂け目/汚れ, 0.5〜 袖や裾が破れギザギザ・穴, 0.75〜 上着が大きく裂け片袖が取れる・インナー(タンクトップ/スパッツ)が見える, 0.9〜 ボロボロ＋煤・絆創膏。**露出的な表現は禁止**（必ずインナー層が残る全年齢向け）。
  - スタイル（全対応必須）
    - hat: `cap, beanie, bandana, headphones, crown, helmet, cowboy, catEars`
    - top: `tshirt, hoodie, leatherJacket, suit, hawaiian, tank, police, tracksuit, idolDress, armorVest`
    - bottom: `jeans, shorts, cargo, skirt, suitPants, trackPants, armorPants`
    - shoes: `sneakers, boots, sandals, loafers, heels`
    - accessory: `sunglasses, goldChain, mask, scarf, wings, halo`
    - weapon: `bat, knife, katana, pistol, smg, guitar, neonSword, staff`（null = 素手）
  - `HERO_LOOKS = {luna: look, jin: look}` / `HERO_DEFAULT_EQUIP`は不要（items 側で初期装備を渡す）
- `enemyArt.js`: `drawEnemy(ctx, enemy)` — `enemy.def.art` で描き分け: `slime, mushroom, flamingo, gator, thug, cop, drone, swat, bossGator, bossDon`。人型(thug/cop/swat/bossDon)は `drawCharacter` を使い `enemy.def.look/equip` で描く。`enemy.facing, enemy.state, enemy.t, enemy.hurtT, enemy.hp, enemy.maxHp, enemy.x, enemy.y` を参照。頭上にHPバー（被弾時のみ）とボスは名前。
- `vehicles.js`: `drawVehicle(ctx, v)` — `v.kind: 'sports'|'police'|'bike'`, `v.color, v.facing, v.x, v.y, v.speed, v.driver(bool)`。80年代ネオン×現代スポーツカー調。
- `icons.js`: `drawItemIcon(ctx, item, x, y, size)` — 中心(x,y)。item.look/スタイルや消費アイテム(`item.icon: 'potionRed'|'potionBlue'|'elixir'|'cash'|'gem'|'chip'`)を描く。 `drawSkillIcon(ctx, skill, x, y, size)`。
- `background.js`: `drawBackground(ctx, map, cam, W, H, time)`（スクリーン空間、パララックス: 夕焼けグラデ→遠景ビル群シルエット→ネオン看板→ヤシの木。theme: `beach | downtown | slums | swamp | casino | rooftop`）、`drawMapTiles(ctx, map, time)`（ワールド空間：地面・足場・ロープ/はしご・ポータル（メイプル風の光の渦）・装飾 `map.decor`）。
- `effects.js`
  - `spawnEffect(game, type, x, y, opts={})` → `game.effects` に追加。type: `slash, hit, critHit, explosion, levelUp, pickup, muzzle, dash, buff, rareDrop, heal, smoke, portal, spark, tear`（tear=服の切れ端が舞う）
  - `spawnDamageNumber(game, x, y, value, {crit, toPlayer, heal, miss})` — メイプル風の縁取り付き大きな数字（通常=オレンジ, クリ=赤紫+星, 被ダメ=紫）。上に浮かんで消える。
  - `updateEffects(game, dt)` / `drawEffects(ctx, game)`（ワールド空間）

### ゲームシステム担当 `src/data/`, `src/systems/`

- `data/items.js`: `ITEMS = {id: Item}`, `getItem(id)`
  ```js
  Item = {id, name, slot:'hat'|'top'|'bottom'|'shoes'|'weapon'|'accessory'|null,
          type:'equip'|'consumable'|'etc', rarity:'common'|'rare'|'epic'|'legendary'|'mythic',
          reqLevel, stats:{atk, def, maxHp, maxMp, speed, crit, str, dex, int, luk},
          look:{style, color, accent},     // 装備のみ。スタイル名は上表から
          weaponType:'melee'|'gun'|'magic', range, attackSpeed,   // 武器のみ
          effect:{hp, mp, buff}, icon, price, desc}
  ```
  初期装備 `STARTER_EQUIP = {luna: {...slot:itemId}, jin: {...}}`。武器・防具 合計40種以上、レア度ごとに色、レジェンダリ/ミシック（羽、天使の輪、ネオンソード等）。
- `data/skills.js`: `SKILLS = {id: Skill}`
  ```js
  Skill = {id, name, desc, hero:'luna'|'jin'|'both', reqLevel, maxLevel,
           kind:'melee'|'projectile'|'aoe'|'buff'|'dash'|'passive',
           mp(lv), cooldown(lv), mult(lv), hits, range:{w,h}, effect, color, key?}
  ```
  ヒーローごとに6〜8スキル（パッシブ含む）。
- `data/enemies.js`: `ENEMIES = {id: {id, name, level, hp, atk, def, exp, money:[min,max], speed, w, h, ai:'walker'|'jumper'|'charger'|'shooter'|'flyer'|'cop'|'boss', art, look?, equip?, aggro, drops:[{id, chance}], boss?:bool, isCop?:bool, color}}`
- `data/missions.js`: `MISSIONS = {id: {id, name, giver: npcId, reqLevel, prereq:[ids], desc, dialog:{offer:[lines], done:[lines]}, objectives:[{type:'kill'|'collect'|'reach'|'wanted'|'drive'|'boss'|'talk', target, count, mapId?, text}], reward:{exp, money, items:[id], sp?}}}` — ストーリー: 2人組がヴァイス・ベイでのし上がるクライム物語。10本以上＋繰り返しデイリー。
- `systems/progression.js`: `newState(heroId)`, `expToNext(level)`, `gainExp(game, amount)`（レベルアップ時 `events.emit('levelUp', {level})`, HP/MP全快, sp+3, ap+5, エフェクト）, `computeStats(state)` → `{maxHp, maxMp, atk, def, speed, jump, crit, critDmg, attackSpeed, range, weaponType, luck}`
- `systems/inventory.js`: `addItem(game, id, qty=1)`→bool, `removeItem(state, id, qty)`, `countItem(state,id)`, `equip(game, itemId)`→`{ok, msg}`, `unequip(game, slot)`, `getEquipLooks(state)`→`{slot: look|null}`, `useItem(game, id)`
- `systems/loot.js`: `RARITY = {common:{name:'ノーマル', color}, rare, epic, legendary, mythic}`, `rollDrops(enemyDef, luck)`→`[{id}|{money:n}]`。レア以上は `events.emit('rareDrop', {item})`（拾った時）。
- `systems/combat.js`:
  - `calcDamage(atk, mult, def, crit, critDmg)` → `{dmg, crit}`（乱数幅あり）
  - `playerAttackArea(game, rect, mult, opts={hits:1, knock:200, effect})` → 命中した敵配列
  - `damageEnemy(game, enemy, dmg, crit, knockDir)` — 数字表示・ノックバック・死亡処理（exp, ドロップ生成= `new Drop(...)` を `game.drops` へ, `events.emit('enemyKilled', {enemy})`, 警官殺害で手配度上昇）
  - `damagePlayer(game, amount, fromX)` — 無敵時間, ノックバック, 服破れエフェクト(`tear`)を閾値通過時, HP0で死亡→ `events.emit('playerDied')`
  - `addWanted(game, heat)`
- `systems/skills.js`: `useSkill(game, skillId)`→bool, `updateSkills(game, dt)`（クールダウン/バフ）, `getCooldown(skillId)`→{left,total}, `learnSkill(game, skillId)`→bool（sp消費）, `activeBuffs(game)`
- `systems/missions.js`: `class MissionManager { constructor(game); available(npcId)→[mission]; canAccept(id); accept(id); isComplete(id); turnIn(id); tracked()→[{name, lines:[str]}]; update(dt) }` — `events` を購読して進捗。

### ワールド＆エンティティ担当 `src/world/`, `src/entities/`

- `world/maps.js`: `MAPS = {id: Map}`
  ```js
  Map = {id, name, theme, width, height, groundY, spawnX,
         platforms:[{x, y, w, solid?:false}],   // solid=false は下から抜けられる一方通行（メイプル式）
         walls?:[{x,y,w,h}],
         ropes:[{x, top, bottom}],
         portals:[{x, y, to, toX, label}],
         spawns:[{x1, x2, types:[enemyId], max, interval}],
         npcs:[{id, name, x, y?, look, equip, dialog:[str], shop?:[itemId], title?}],
         vehicles:[{kind, x, color}],
         decor:[{type, x, y}],                  // palm, neonSign, lamp, car, billboard, crate ...
         copSpawns: true|false, bgColor? }
  ```
  マップ: ビーチ(初心者), ダウンタウン, スラム/港, スワンプ(ワニ), カジノ/摩天楼屋上(ボス) の5〜6面。
- `world/physics.js`: `moveAndCollide(ent, map, dt)`（重力・一方通行足場・地面・壁・マップ端。`ent.dropThrough` 中は一方通行足場を無視。`ent.onGround` 更新）, `findRope(map, x, y)`, `rectOverlap(a, b)`, `entRect(e)`
- `entities/player.js`: `class Player { constructor(game); update(dt); draw(ctx); x,y,w,h,vx,vy,facing,onGround,climbing,invulnT, anim, inVehicle, getAttackRect(), stats }` — 移動/ジャンプ/ロープ/攻撃（武器種で近接 or 射撃）/スキル(skillBar)/ポーション/ポータル(↑)/NPC会話(E)/車乗降(E)/拾う(Z, 近接で自動吸引も)。
- `entities/enemy.js`: `class Enemy { constructor(game, defId, x, y); update(dt); draw(ctx); def, hp, maxHp, dead, ... }` AI各種。
- `entities/spawner.js`: `class Spawner { constructor(game); reset(map); update(dt) }` — マップの spawns に従って**自動出現**（上限・間隔）。手配度に応じて警官/SWAT/パトカーが出現。
- `entities/drop.js`: `class Drop { constructor(game, x, y, payload) }` payload=`{id}`|`{money}`。ポンと跳ねて着地、レア以上は光の柱。拾うと `addItem` / money 加算、`events.emit('itemPicked', {id})`。
- `entities/projectile.js`: `class Projectile {constructor(game, opts)}` owner: 'player'|'enemy'
- `entities/npc.js`: `class NPC { constructor(game, data) }` 頭上に名前、受注可能クエストあり=黄色「！」完了報告可=「？」
- `entities/vehicle.js`: `class Vehicle` 乗車中は高速移動・敵を轢く（手配度上昇）。

各 entity は `update(dt)` と `draw(ctx)` を持ち、`dead`/`remove` フラグで main が配列から除去。

### UI担当 `src/ui/`

- `ui/ui.js`: `class UIManager { constructor(game); handleInput()→bool(入力を消費したら true); update(dt); draw(ctx); open(name, data?); close(name?); toggle(name); isModal(); notify(text, color) }`
  - ウィンドウ: `inventory`（装備スロット＋キャラプレビュー＝`drawCharacter`で装備を反映して表示、アイテムグリッド、クリック/ダブルクリックで装備・使用、ツールチップにレア色とステータス）, `skills`（SP振り、スキルバー登録）, `stats`（AP振り）, `missions`, `dialog`（NPC会話・クエスト受注/報告・ショップへ）, `shop`, `death`（復活）
  - マウス＋キーボード両対応。
- `ui/hud.js`: `drawHUD(ctx, game)` — 左下メイプル風 Lv/名前/HP/MP/EXP バー、右上 GTA 風の所持金＋手配度★5、ミニマップ（左上）、スキルバー（クールダウン表示）、クエストトラッカー（右）、通知トースト、レアドロップ演出バナー。
- `ui/title.js`: `drawTitle(ctx, game, t)` / `titleInput(game)`→ `heroId` を返したら開始。ロゴ「NEON LEONIDA STORY」風（※本作タイトル: **NEON VICE STORY**）。主人公2人(ルナ/ジン)の選択画面。

### デバッグ担当 `src/debug/`, `tests/`

- `debug/debug.js`: `class DebugPanel { constructor(game); update(dt); draw(ctx); enabled }` F2で表示: FPS, エンティティ数, 当たり判定表示, 無敵, Lv+1, 全アイテム付与, お金+, 手配度±, 敵スポーン, 全敵撃破, HP-10%（服破れ確認）, マップワープ。
- `tests/`: Node 単体テスト（systems/data の整合性）＋ Playwright スモークテスト（起動・エラーなし・スクショ）。

## イベント一覧（`game.events`）

`enemyKilled {enemy}`, `itemPicked {id, qty}`, `moneyPicked {amount}`, `levelUp {level}`, `playerDamaged {amount}`, `playerDied`, `mapChanged {mapId}`, `talkNpc {npcId}`, `missionAccepted {id}`, `missionComplete {id}`, `rareDrop {item}`, `wantedChanged {level}`, `vehicleEnter {vehicle}`, `vehicleExit`, `skillUsed {id}`, `equipChanged {slot}`
