# NPC / 敵 / マップ ID 一覧（ゲームシステム担当 v2 → ワールド担当）

`src/data/missions.js` の `MISSION_NPCS`、`src/data/enemies.js`、`src/data/shops.js` から生成（/tmp/claude-0/sys_v2/gen_npcs_md.mjs）。
maps.js の `npcs[].id` はこの npcId を使ってください。フィールドの出現は敵 def の `habitats`（spawns の `types` 省略時に spawner が自動選択）。

## ミッションNPC（maps.js の npcs に配置）

| npcId | 名前 | mapId | 役割 | ショップ | 依頼するミッション | 報告を受けるミッション |
|---|---|---|---|---|---|---|
| `rico` | リコ | `beach` | ビーチの情報屋。二人を街に引き込んだ張本人。 | - | m01_welcome, m02_jelly, m03_flamingo, m04_rosa | - |
| `sunny` | サニー | `beach` | ライフガード兼ビーチ売店。サブ/デイリー。 | ✔ サニーのビーチ売店 | s01_feathers, s02_king_slime, d01_beach_patrol | - |
| `mama_rosa` | ママ・ローザ | `downtown` | ダウンタウンの食堂店主。ポーション屋。 | ✔ ママ・ローザの食堂 | m05_protection, s03_mushroom_soup, d02_street_sweep | m04_rosa |
| `officer_kai` | カイ巡査 | `downtown` | 金で動く汚職警官。 | - | m06_dirty_badge, m07_wheels, m13_heat, m14_rooftop, s08_rat_king, d03_heat_check | - |
| `dj_pulse` | DJパルス | `slums` | 港の倉庫で地下レイブを仕切るDJ。 | - | m08_rave, m09_swamp, s07_rave_drive, s09_smuggler | - |
| `tank` | タンク | `slums` | 港のメカニック。車の手配屋。 | ✔ タンクのガレージ | s04_toxic, sp01_spaceport, d04_delivery | m07_wheels |
| `old_boone` | ブーンじいさん | `swamp` | スワンプのワニ猟師。 | ✔ ブーンの猟師小屋 | m10_grandpa, m11_casino, s05_albino, d05_swamp_hunt | m09_swamp |
| `vivi` | ヴィヴィ | `casino` | カジノ「ネオン・パレス」のディーラー。内通者。 | ✔ ネオン・パレス両替所 | m12_mecha, s06_gold_rush, d06_high_stakes | m11_casino |
| `don_caiman` | ドン・カイマン | `casino` | 街を牛耳るカジノ王（黒幕）。ボス戦は tower_f3 の boss_don。 | - | - | - |
| `nova` | ノヴァ | `rooftop` | 天才ハッカー。最終決戦の案内役。 | ✔ ノヴァの闇マーケット | m15_don, d07_rooftop_contract | m14_rooftop |
| `dr_stella` | ステラ博士 | `spaceport` | ルミナ宇宙港の主任研究者。謎の宇宙船を追っている。 | ✔ ステラ研究所の払い下げ品 | sp02_launchpad, sp03_grey, sp05_overlord | sp01_spaceport |
| `ace_jet` | エース・ジェット | `spaceport` | 元テストパイロット。月面シミュ区画の管理人。 | ✔ ジェットの宇宙食ストア | sp04_moon, d08_space_jelly | - |
| `shop_downtown` | ブティック店員ミミ | `downtown` | ダウンタウンの古着屋。ストリート系装備を売る。（ミッションなし） | ✔ ネオン・ブティック | - | - |

**v2 で追加**: `dr_stella`（ステラ博士）, `ace_jet`（エース・ジェット）を `spaceport` に、ショップ専用 `shop_downtown` を `downtown` に（任意）。全7町に依頼NPCが最低1人います（beach: rico/sunny, downtown: mama_rosa/officer_kai, slums: dj_pulse/tank, swamp: old_boone, casino: vivi, rooftop: nova, spaceport: dr_stella/ace_jet）。

## v3: 転職教官NPC（maps.js の npcs に配置。`MISSION_NPCS[id].jobInstructor === true`）

転職ミッション（`MISSIONS[*].type === 'job'`）の **報告先**。受注はプレイヤー頭上の吹き出し（`jobOffer` → `acceptJobMission`）からのみで、教官の `available()` には転職ミッションは出ない。報告可になると `npcMarker(id) === '?'`。
look/equip は `L(style, c1, c2)` 形式（maps.js の既存 NPC と同じ）の提案。

| npcId | 名前 | 町 mapId | 担当 | look 提案 | equip 提案 | 会話（dialog） |
|---|---|---|---|---|---|---|
| `job_velvet` | マダム・ヴェルヴェット | `downtown` | 1次 / ストリートスター（ガンナー・ダンサー） | `{body:'f', skin:'#f1c7a5', hair:'long', hairColor:'#7a1f5c', eyeColor:'#ff3d7f'}` | hat `L('cowboy','#2b1030','#ff3d7f')`, top `L('suit','#2b1030','#ff3d7f')`, bottom `L('skirt','#2b1030')`, shoes `L('heels','#ff3d7f')`, accessory `L('sunglasses','#ff3d7f')`, weapon `L('pistol','#ff6fb5','#ffd23f')` | 「撃つか、踊るか。どっちの才能もこの街じゃ武器になるわ」 |
| `job_bull` | ブル・ガードナー | `downtown` | 1次 / ストリートブロウラー（ブロウラー・レーサー） | `{body:'m', skin:'#a86b45', hair:'short', hairColor:'#2a1a10', eyeColor:'#ff8a00'}` | hat `L('bandana','#ff8a00','#1d1d24')`, top `L('tank','#1d1d24','#ff8a00')`, bottom `L('trackPants','#3a3a46','#ff8a00')`, shoes `L('boots','#2a2018')`, accessory `L('goldChain','#ffd166')` | 「拳で行くか、ハンドルで行くか。ガキの頃の俺は両方だったぜ」 |
| `job_zero` | ゼロ | `downtown` | 1次 / ストリートハッカー（ネットランナー・ドローンパイロット） | `{body:'m', skin:'#e8c4a8', hair:'bob', hairColor:'#1d1d24', eyeColor:'#3dff8a'}` | hat `L('headphones','#1d1d24','#3dff8a')`, top `L('hoodie','#1d2b24','#3dff8a')`, bottom `L('cargo','#2a2f38')`, shoes `L('sneakers','#f4f4f4','#3dff8a')`, accessory `L('sunglasses','#3dff8a')`, weapon `L('staff','#3dff8a','#1d1d24')` | 「ネットの海は広いよ。泳ぎ方、教えてあげる」 |
| `job_lily` | ゴースト・リリィ | `slums` | 2次 / ストリートスター | `{body:'f', skin:'#f5e6dc', hair:'ponytail', hairColor:'#e8e8ff', eyeColor:'#3dffd0'}` | hat `L('beanie','#1d1d24','#3dffd0')`, top `L('leatherJacket','#1d1d24','#ff5fa2')`, bottom `L('cargo','#2a2a33')`, shoes `L('boots','#1d1d24')`, accessory `L('scarf','#3dffd0')`, weapon `L('smg','#ff5fa2','#1d1d24')` | 「…霧の夜は好き。弾も、ステップも、音がよく響くから」 |
| `job_byte` | バイト | `slums` | 2次 / ストリートハッカー | `{body:'m', skin:'#8d5a3b', hair:'spiky', hairColor:'#ffc94d', eyeColor:'#ffb000'}` | hat `L('helmet','#3a3a46','#ffb000')`, top `L('armorVest','#3a3a46','#ffb000')`, bottom `L('cargo','#4a4a3a')`, shoes `L('boots','#2a2018')`, accessory `L('goldChain','#c0c0c8')` | 「ジャンクは宝の山だ。使えるやつにはな」 |
| `job_croc` | クロック・ジョー | `swamp` | 2次 / ストリートブロウラー | `{body:'m', skin:'#c98a5a', hair:'short', hairColor:'#4a6a2a', eyeColor:'#ffd23f'}` | hat `L('cowboy','#4a6a2a','#ffd23f')`, top `L('hawaiian','#4a6a2a','#ffd23f')`, bottom `L('shorts','#3a4a2a')`, shoes `L('sandals','#5a3a22')`, accessory `L('goldChain','#ffd166')` | 「ヘッヘ、沼じゃ強いやつと速いやつに金が集まるのさ」 |
| `job_diamond` | クイーン・ダイヤ | `casino` | 3次 / ストリートスター | `{body:'f', skin:'#ffe0cc', hair:'long', hairColor:'#ffd23f', eyeColor:'#c77dff'}` | hat `L('crown','#ffd23f','#c77dff')`, top `L('idolDress','#c77dff','#ffd23f')`, bottom `L('skirt','#c77dff')`, shoes `L('heels','#ffd23f')`, accessory `L('goldChain','#ffd23f')`, weapon `L('pistol','#ffd23f','#c77dff')` | 「ステージも賭場も同じ。主役になれるのは一人だけよ」 |
| `job_tiger` | タイガー・ゴウ | `casino` | 3次 / ストリートブロウラー | `{body:'m', skin:'#f0c8a0', hair:'spiky', hairColor:'#ff8a00', eyeColor:'#ff3b3b'}` | top `L('suit','#1d1d24','#ff3b3b')`, bottom `L('suitPants','#1d1d24')`, shoes `L('loafers','#3a2a1a')`, accessory `L('sunglasses','#ff3b3b')` | 「ストリップの夜は長い。龍になるか、風になるか決めてこい」 |
| `job_cipher` | サイファー | `rooftop` | 3次 / ストリートハッカー | `{body:'f', skin:'#d9a07a', hair:'bob', hairColor:'#00ffa3', eyeColor:'#ffffff'}` | hat `L('catEars','#1d1d24','#00ffa3')`, top `L('hoodie','#101418','#00ffa3')`, bottom `L('trackPants','#101418','#00ffa3')`, shoes `L('sneakers','#101418','#00ffa3')`, accessory `L('mask','#00ffa3')`, weapon `L('staff','#00ffa3','#ff8a3d')` | 「ノヴァ？ ああ、私の弟子。腕はまあまあね」 |
| `job_celes` | セレス | `spaceport` | 4次 / ストリートスター | `{body:'f', skin:'#f5d0b0', hair:'twin', hairColor:'#7df9ff', eyeColor:'#ffd23f'}` | hat `L('helmet','#ffffff','#7df9ff')`, top `L('idolDress','#7df9ff','#ffd23f')`, bottom `L('skirt','#ffffff')`, shoes `L('heels','#7df9ff')`, accessory `L('halo','#ffd23f')`, weapon `L('pistol','#ffd23f','#7df9ff')` | 「歌もお尋ね者も、銀河じゃ名前が売れてナンボよ」 |
| `job_kaiser` | カイザー・マグナ | `spaceport` | 4次 / ストリートブロウラー | `{body:'m', skin:'#b07a50', hair:'wolf', hairColor:'#ffffff', eyeColor:'#ffd23f'}` | hat `L('helmet','#3a3a46','#ffd23f')`, top `L('armorVest','#3a3a46','#ffd23f')`, bottom `L('armorPants','#3a3a46')`, shoes `L('boots','#1d1d24')`, accessory `L('wings','#ffd23f')` | 「覇王の拳と光速の走り。どちらも頂点は孤独だぞ」 |
| `job_quasar` | クェーサー | `spaceport` | 4次 / ストリートハッカー | `{body:'f', skin:'#bff6ff', hair:'long', hairColor:'#b6ff3d', eyeColor:'#ffffff'}`（半透明ホログラム推奨 `anim.alpha:0.8`） | top `L('suit','#e8ffff','#b6ff3d')`, bottom `L('suitPants','#e8ffff')`, shoes `L('loafers','#e8ffff')`, accessory `L('halo','#b6ff3d')` | 「……接続者を確認。演算を開始する」 |

転職段階と町: 1次=`downtown`（3人）, 2次=`slums`（リリィ・バイト）/`swamp`（クロック）, 3次=`casino`（ダイヤ・タイガー）/`rooftop`（サイファー）, 4次=`spaceport`（3人）。
転職ミッションの試練の敵/ボスは `docs/SPEC_JOB.md`「転職ミッション一覧」を参照（全て habitats で出現確認済み）。

## 町ごとのショップ品揃え（提案。`src/data/shops.js` の `TOWN_SHOPS` を import して `npcs[].shop` に使えます）

| 町 | npcId | 店名 | itemId |
|---|---|---|---|
| `beach` | `sunny` | サニーのビーチ売店 | `potion_red`, `potion_blue`, `potion_orange`, `sandals_beach`, `shorts_beach`, `tshirt_white`, `cap_street`, `sunglasses_aviator`, `pistol_9mm`, `knife_basic`, `bat_wood` |
| `downtown` | `mama_rosa` | ママ・ローザの食堂 | `potion_red`, `potion_orange`, `potion_blue`, `drink_energy`, `drink_tough` |
| `downtown` | `shop_downtown` | ネオン・ブティック | `beanie_gray`, `bandana_red`, `tank_black`, `hawaiian_shirt`, `cargo_khaki`, `loafers_brown`, `scarf_red`, `katana_steel`, `bat_nail`, `knife_butterfly` |
| `slums` | `tank` | タンクのガレージ | `potion_orange`, `potion_blue`, `potion_white`, `drink_energy`, `drink_tough`, `cargo_khaki`, `track_pants`, `tracksuit_green`, `boots_black`, `smg_compact`, `guitar_electric`, `mask_skull` |
| `swamp` | `old_boone` | ブーンの猟師小屋 | `potion_orange`, `potion_white`, `potion_mana`, `power_elixir`, `cowboy_hat`, `heels_red`, `staff_neon`, `police_uniform`, `suit_pants` |
| `casino` | `vivi` | ネオン・パレス両替所 | `potion_white`, `potion_mana`, `power_elixir`, `drink_lucky`, `suit_black`, `sunglasses_neon`, `gold_chain`, `pistol_gold`, `idol_dress`, `helmet_moto` |
| `rooftop` | `nova` | ノヴァの闇マーケット | `potion_white`, `potion_mana`, `power_elixir`, `elixir`, `drink_energy`, `drink_tough`, `drink_lucky`, `armor_vest`, `armor_pants`, `sneakers_neon`, `cat_ears_neon`, `katana_blood`, `guitar_thunder` |
| `spaceport` | `ace_jet` | ジェットの宇宙食ストア | `potion_white`, `potion_mana`, `power_elixir`, `elixir`, `drink_energy`, `drink_tough`, `drink_lucky` |
| `spaceport` | `dr_stella` | ステラ研究所の払い下げ品 | `helmet_astro`, `armor_astro`, `pants_astro`, `katana_plasma`, `pistol_ray`, `gold_chain_heavy`, `staff_moon` |

## フィールド別 出現敵（habitats から。ボスは行き止まりマップ）

| 地域 | mapId | 名前 | Lv目安 | 通常敵（Lv） | ボス |
|---|---|---|---|---|---|
| beach | `beach_f1` | サンセット海岸道 | 1-3 | `slime_green`(1), `crab_sand`(2), `slime_pink`(3) | - |
| beach | `beach_f2` | ヤシの並木道 | 3-6 | `slime_pink`(3), `seagull_beach`(4), `mushroom_orange`(5), `crab_hermit`(6) | - |
| beach | `beach_f3` | ピア桟橋 | 5-9 | `crab_hermit`(6), `jellyfish_pier`(7), `flamingo`(7), `slime_wave`(8) | `boss_king_slime`(10) |
| beach | `beach_f4` | ハイウェイ入口 | 8-12 | `flamingo`(7), `mushroom_cone`(9), `seagull_highway`(10), `crab_iron`(11) | - |
| downtown | `down_f1` | ネオン裏通り | 10-14 | `thug_punk`(11), `rat_alley`(11), `mushroom_neon`(12), `drone_peeping`(13) | - |
| downtown | `down_f2` | 地下鉄トンネル | 13-18 | `rat_subway`(14), `thug_graffiti`(15), `mushroom_glow`(16) | `boss_rat_king`(18) |
| downtown | `down_f3` | 高架ハイウェイ | 16-22 | `drone_traffic`(18), `thug_biker`(20), `rat_neon`(21) | - |
| downtown | `down_f4` | セントラル公園 | 14-20 | `thug_punk`(11), `thug_skater`(15), `mushroom_park`(17), `drone_toy`(18) | - |
| slums | `slums_f1` | 倉庫街 | 20-25 | `thug_dockhand`(21), `slime_toxic`(22), `rat_dock`(23) | - |
| slums | `slums_f2` | 造船所 | 24-30 | `flamingo_punk`(25), `thug_gunner`(27), `slime_oil`(29) | - |
| slums | `slums_f3` | 密輸船 | 28-34 | `thug_smuggler`(30), `rat_ship`(31), `crab_rust`(32) | `boss_captain`(34) |
| slums | `slums_f4` | 廃線路 | 30-36 | `rat_giant`(32), `thug_scrapper`(33), `robot_scrap`(35) | - |
| swamp | `swamp_f1` | 湿地の入口 | 22-28 | `mosquito_swamp`(23), `snake_reed`(25), `mushroom_bog`(26), `gator_swamp`(27) | - |
| swamp | `swamp_f2` | マングローブ迷路 | 30-38 | `gator_swamp`(27), `snake_mangrove`(32), `mosquito_giant`(33), `mushroom_spore`(35) | - |
| swamp | `swamp_f3` | ワニの巣 | 36-44 | `gator_albino`(38), `snake_king`(40), `mosquito_queen`(42) | `boss_gator`(44) |
| swamp | `swamp_f4` | 霧の水路 | 38-45 | `snake_fog`(39), `mushroom_fog`(41), `gator_fog`(43) | - |
| casino | `casino_f1` | 砂漠ハイウェイ | 42-48 | `snake_rattle`(43), `robot_slot`(45), `thug_desert`(47) | - |
| casino | `casino_f2` | 地下金庫 | 48-55 | `slime_gold`(50), `ghost_chip`(51), `thug_bouncer`(52), `drone_casino`(53) | - |
| casino | `casino_f3` | VIPフロア | 54-60 | `drone_casino`(53), `thug_vip`(56), `ghost_jackpot`(57), `robot_dealer`(58) | `boss_mecha`(60) |
| casino | `casino_f4` | 夜景ブールバード | 52-58 | `ghost_neon`(53), `slime_diamond`(55), `robot_valet`(56) | - |
| rooftop | `tower_f1` | 工事現場の足場 | 58-64 | `robot_worker`(59), `thug_hitman`(60), `golem_steel`(61), `drone_attack`(63) | - |
| rooftop | `tower_f2` | 空中庭園 | 64-70 | `drone_attack`(63), `mushroom_mutant`(65), `golem_garden`(66), `thug_merc`(68) | - |
| rooftop | `tower_f3` | 最上階ペントハウス | 70-76 | `thug_elite`(72), `golem_gold`(73), `drone_guardian`(74) | `boss_don`(78) |
| spaceport | `space_f1` | 沿岸ロケット道 | 36-42 | `robot_patrol`(37), `jelly_coast`(38), `seagull_jet`(40) | - |
| spaceport | `space_f2` | 発射台エリア | 42-50 | `robot_loader`(44), `drone_launch`(46), `slime_fuel`(47), `alien_grey`(49) | - |
| spaceport | `space_f3` | 月面シミュ区画 | 75-85 | `alien_moon`(77), `jelly_cosmic`(79), `robot_lunar`(81), `golem_moon`(83) | - |
| spaceport | `space_f4` | 謎の宇宙船 | 85-100 | `alien_warrior`(88), `jelly_void`(91), `robot_xeno`(94), `ghost_astral`(96) | `boss_alien`(100) |

町（`beach`, `downtown`, `slums`, `swamp`, `casino`, `rooftop`, `spaceport`）にはモンスターを出さない。市民と警察のみ。

## 市民（町で spawner が 6〜10 人歩かせる。`civilian:true, art/ai:"civilian"`）

| 敵ID | 名前 | HP | お金 |
|---|---|---|---|
| `civilian_tourist` | 観光客 | 40 | 5〜30 |
| `civilian_business` | ビジネスマン | 45 | 15〜60 |
| `civilian_skater` | スケーター | 40 | 3〜20 |
| `civilian_granny` | おばあちゃん | 35 | 10〜40 |
| `civilian_dancer` | ストリートダンサー | 40 | 5〜25 |

殴ると `addWanted(+0.8)`・`enemy.scared=true, fleeT=4, fleeDir`（逃走のヒント）・`events.emit("civilianHit")`。倒すと `addWanted(+4)`・`civilianKilled`。経験値・図鑑・kills 加算なし。

## 警察ユニット（手配度★別, spawner 用。町でのみ。habitats は空）

| ★ | 敵ID |
|---|---|
| 1 | `cop_patrol` |
| 2 | `cop_patrol`, `drone_scout` |
| 3 | `cop_patrol`, `cop_detective`, `drone_scout` |
| 4 | `cop_detective`, `swat_trooper` |
| 5 | `swat_trooper`, `swat_heavy` |

## PET（slot `pet`, rarity `pet`）と入手地域

| itemId | 名前 | style | pickRange | pickRate | ドロップ地域 |
|---|---|---|---|---|---|
| `pet_slime` | ペット: プルプル | slimePet | 160 | 1 | beach |
| `pet_flamingo` | ペット: フラミー | flamingoPet | 190 | 1.2 | beach |
| `pet_cat` | ペット: ネオンにゃん | catPet | 220 | 1.4 | downtown / SNS 1万人報酬 |
| `pet_drone` | ペット: ピコドローン | dronePet | 260 | 1.6 | downtown |
| `pet_dolphin` | ペット: ドルフィ | dolphinPet | 240 | 1.5 | slums |
| `pet_gator` | ペット: ワニ太郎 | gatorPet | 230 | 1.3 | swamp |
| `pet_ghost` | ペット: チップくん | ghostPet | 300 | 2 | casino |
| `pet_robot` | ペット: ボルトくん | robotPet | 330 | 2.2 | spaceport |
| `pet_dragon` | ペット: ネオンドラゴン | dragonPet | 380 | 2.6 | rooftop |
| `pet_alien` | ペット: ピポ | alienPet | 420 | 3 | spaceport / sp05 報酬 |

ドロップ率: 通常 0.03% / 強敵 0.05% / ボス 0.08%（LUK 補正は装備の半分）。

## 全敵一覧

| 敵ID | 名前 | Lv | art | ai | 地域 | habitats | HP | EXP | boss | isCop/市民 |
|---|---|---|---|---|---|---|---|---|---|---|
| `slime_green` | ソーダスライム | 1 | slime | jumper | beach | beach_f1 | 33 | 2 |  |  |
| `crab_sand` | サンドクラブ | 2 | crab | walker | beach | beach_f1 | 42 | 2 |  |  |
| `slime_pink` | ストロベリースライム | 3 | slime | jumper | beach | beach_f1, beach_f2 | 52 | 3 |  |  |
| `seagull_beach` | ポテト泥棒カモメ | 4 | seagull | flyer | beach | beach_f2 | 63 | 4 |  |  |
| `mushroom_orange` | ビーチマッシュ | 5 | mushroom | walker | beach | beach_f2 | 74 | 4 |  |  |
| `crab_hermit` | ヤドカリ番長 | 6 | crab | charger | beach | beach_f2, beach_f3 | 103 | 5 |  |  |
| `jellyfish_pier` | ピアクラゲ | 7 | jellyfish | flyer | beach | beach_f3 | 98 | 6 |  |  |
| `flamingo` | ヤンキーフラミンゴ | 7 | flamingo | charger | beach | beach_f3, beach_f4 | 98 | 6 |  |  |
| `slime_wave` | ビッグウェーブスライム | 8 | slime | jumper | beach | beach_f3 | 111 | 7 |  |  |
| `mushroom_cone` | コーンマッシュ | 9 | mushroom | walker | beach | beach_f4 | 125 | 8 |  |  |
| `seagull_highway` | ハイウェイカモメ | 10 | seagull | flyer | beach | beach_f4 | 140 | 8 |  |  |
| `crab_iron` | アイアンクラブ | 11 | crab | charger | beach | beach_f4 | 202 | 9 |  |  |
| `thug_punk` | ストリートチンピラ | 11 | thug | walker | downtown | down_f1, down_f4 | 155 | 12 |  |  |
| `rat_alley` | ドブネズミ | 11 | rat | walker | downtown | down_f1 | 155 | 12 |  |  |
| `mushroom_neon` | ネオンキノコ | 12 | mushroom | jumper | downtown | down_f1 | 171 | 13 |  |  |
| `drone_peeping` | のぞき見ドローン | 13 | drone | flyer | downtown | down_f1 | 188 | 14 |  |  |
| `rat_subway` | メトロラット | 14 | rat | charger | downtown | down_f2 | 206 | 15 |  |  |
| `thug_graffiti` | グラフィティ小僧 | 15 | thug | shooter | downtown | down_f2 | 224 | 17 |  |  |
| `mushroom_glow` | グロウマッシュ | 16 | mushroom | walker | downtown | down_f2 | 243 | 18 |  |  |
| `thug_skater` | スケボー・チンピラ | 15 | thug | charger | downtown | down_f4 | 224 | 17 |  |  |
| `mushroom_park` | ピクニックマッシュ | 17 | mushroom | jumper | downtown | down_f4 | 262 | 19 |  |  |
| `drone_toy` | ラジコン・ドローン | 18 | drone | flyer | downtown | down_f4 | 282 | 20 |  |  |
| `drone_traffic` | 交通監視ドローン | 18 | drone | flyer | downtown | down_f3 | 282 | 20 |  |  |
| `thug_biker` | ハイウェイ・ライダー | 20 | thug | charger | downtown | down_f3 | 325 | 23 |  |  |
| `rat_neon` | ネオンラット | 21 | rat | jumper | downtown | down_f3 | 417 | 24 |  |  |
| `thug_dockhand` | 港のゴロツキ | 21 | thug | charger | slums | slums_f1 | 347 | 27 |  |  |
| `slime_toxic` | ヘドロスライム | 22 | slime | jumper | slums | slums_f1 | 370 | 28 |  |  |
| `rat_dock` | ドックラット | 23 | rat | charger | slums | slums_f1 | 394 | 30 |  |  |
| `flamingo_punk` | パンク・フラミンゴ | 25 | flamingo | charger | slums | slums_f2 | 444 | 33 |  |  |
| `thug_gunner` | ギャングの鉄砲玉 | 27 | thug | shooter | slums | slums_f2 | 496 | 36 |  |  |
| `slime_oil` | オイルスライム | 29 | slime | jumper | slums | slums_f2 | 551 | 40 |  |  |
| `thug_smuggler` | 密輸船の船員 | 30 | thug | walker | slums | slums_f3 | 580 | 41 |  |  |
| `rat_ship` | ふなネズミ | 31 | rat | jumper | slums | slums_f3 | 609 | 43 |  |  |
| `crab_rust` | サビガニ | 32 | crab | charger | slums | slums_f3 | 831 | 45 |  |  |
| `rat_giant` | ジャイアントラット | 32 | rat | charger | slums | slums_f4 | 831 | 45 |  |  |
| `thug_scrapper` | スクラップ屋 | 33 | thug | walker | slums | slums_f4 | 670 | 47 |  |  |
| `robot_scrap` | スクラップロボ | 35 | robot | walker | slums | slums_f4 | 954 | 51 |  |  |
| `mosquito_swamp` | ヌマカ | 23 | mosquito | flyer | swamp | swamp_f1 | 394 | 31 |  |  |
| `snake_reed` | アシヘビ | 25 | snake | walker | swamp | swamp_f1 | 444 | 34 |  |  |
| `mushroom_bog` | 沼地の毒キノコ | 26 | mushroom | walker | swamp | swamp_f1 | 470 | 36 |  |  |
| `gator_swamp` | 沼ワニ | 27 | gator | charger | swamp | swamp_f1, swamp_f2 | 595 | 38 |  |  |
| `snake_mangrove` | マングローブ・ボア | 32 | snake | charger | swamp | swamp_f2 | 767 | 47 |  |  |
| `mosquito_giant` | オオヌマカ | 33 | mosquito | flyer | swamp | swamp_f2 | 670 | 49 |  |  |
| `mushroom_spore` | ガスマッシュ | 35 | mushroom | jumper | swamp | swamp_f2 | 734 | 53 |  |  |
| `gator_albino` | アルビノゲイター | 38 | gator | charger | swamp | swamp_f3 | 1085 | 76 |  |  |
| `snake_king` | ヌシヘビ | 40 | snake | charger | swamp | swamp_f3 | 1177 | 63 |  |  |
| `mosquito_queen` | ヌマカの女王 | 42 | mosquito | flyer | swamp | swamp_f3 | 1174 | 67 |  |  |
| `snake_fog` | キリヘビ | 39 | snake | walker | swamp | swamp_f4 | 869 | 61 |  |  |
| `mushroom_fog` | キリタケ | 41 | mushroom | walker | swamp | swamp_f4 | 941 | 65 |  |  |
| `gator_fog` | ミスト・ゲイター | 43 | gator | charger | swamp | swamp_f4 | 1321 | 70 |  |  |
| `snake_rattle` | ガラガラヘビ | 43 | snake | charger | casino | casino_f1 | 1016 | 75 |  |  |
| `robot_slot` | スロットロボ | 45 | robot | walker | casino | casino_f1 | 1094 | 80 |  |  |
| `thug_desert` | デザート・ライダー | 47 | thug | charger | casino | casino_f1 | 1174 | 85 |  |  |
| `slime_gold` | ゴールドスライム | 50 | slime | jumper | casino | casino_f2 | 1300 | 121 |  |  |
| `ghost_chip` | チップの亡霊 | 51 | ghost | flyer | casino | casino_f2 | 1343 | 95 |  |  |
| `thug_bouncer` | カジノの用心棒 | 52 | thug | walker | casino | casino_f2 | 1942 | 98 |  |  |
| `drone_casino` | セキュリティドローン | 53 | drone | flyer | casino | casino_f2, casino_f3 | 1432 | 101 |  |  |
| `ghost_neon` | ネオンゴースト | 53 | ghost | flyer | casino | casino_f4 | 1432 | 101 |  |  |
| `slime_diamond` | ダイヤスライム | 55 | slime | jumper | casino | casino_f4 | 1524 | 106 |  |  |
| `robot_valet` | バレー・ロボ | 56 | robot | charger | casino | casino_f4 | 1885 | 109 |  |  |
| `thug_vip` | VIPガード | 56 | thug | shooter | casino | casino_f3 | 1885 | 109 |  |  |
| `ghost_jackpot` | ジャックポット・ゴースト | 57 | ghost | flyer | casino | casino_f3 | 1942 | 112 |  |  |
| `robot_dealer` | ディーラーロボ | 58 | robot | shooter | casino | casino_f3 | 2166 | 115 |  |  |
| `robot_worker` | 建設ロボ | 59 | robot | walker | rooftop | tower_f1 | 2058 | 126 |  |  |
| `thug_hitman` | ドンの殺し屋 | 60 | thug | shooter | rooftop | tower_f1 | 2118 | 130 |  |  |
| `golem_steel` | スチールゴーレム | 61 | golem | walker | rooftop | tower_f1 | 2905 | 173 |  |  |
| `drone_attack` | アサルトドローン | 63 | drone | flyer | rooftop | tower_f1, tower_f2 | 2110 | 139 |  |  |
| `mushroom_mutant` | ミュータント・マッシュ | 65 | mushroom | jumper | rooftop | tower_f2 | 3036 | 204 |  |  |
| `golem_garden` | ガーデンゴーレム | 66 | golem | walker | rooftop | tower_f2 | 3116 | 194 |  |  |
| `thug_merc` | 傭兵スナイパー | 68 | thug | shooter | rooftop | tower_f2 | 2844 | 156 |  |  |
| `thug_elite` | ドン親衛隊 | 72 | thug | charger | rooftop | tower_f3 | 3382 | 170 |  |  |
| `golem_gold` | ゴールドゴーレム | 73 | golem | walker | rooftop | tower_f3 | 3959 | 226 |  |  |
| `drone_guardian` | ガーディアンドローン | 74 | drone | flyer | rooftop | tower_f3 | 3040 | 177 |  |  |
| `robot_patrol` | パトロールボット | 37 | robot | walker | spaceport | space_f1 | 800 | 68 |  |  |
| `jelly_coast` | コーストクラゲ | 38 | jellyfish | flyer | spaceport | space_f1 | 834 | 71 |  |  |
| `seagull_jet` | ジェットカモメ | 40 | seagull | flyer | spaceport | space_f1 | 905 | 76 |  |  |
| `robot_loader` | 搬入ロボ | 44 | robot | charger | spaceport | space_f2 | 1371 | 86 |  |  |
| `drone_launch` | 発射管制ドローン | 46 | drone | flyer | spaceport | space_f2 | 1134 | 92 |  |  |
| `slime_fuel` | ロケット燃料スライム | 47 | slime | jumper | spaceport | space_f2 | 1174 | 94 |  |  |
| `alien_grey` | グレイ | 49 | alien | shooter | spaceport | space_f2 | 1257 | 100 |  |  |
| `alien_moon` | ムーン・エイリアン | 77 | alien | jumper | spaceport | space_f3 | 2716 | 195 |  |  |
| `jelly_cosmic` | コズミッククラゲ | 79 | jellyfish | flyer | spaceport | space_f3 | 2841 | 203 |  |  |
| `robot_lunar` | ルナローバー | 81 | robot | charger | spaceport | space_f3 | 3860 | 211 |  |  |
| `golem_moon` | ムーンゴーレム | 83 | golem | walker | spaceport | space_f3 | 4960 | 285 |  |  |
| `alien_warrior` | エイリアン戦士 | 88 | alien | charger | spaceport | space_f4 | 4471 | 240 |  |  |
| `jelly_void` | ヴォイドクラゲ | 91 | jellyfish | flyer | spaceport | space_f4 | 3651 | 253 |  |  |
| `robot_xeno` | ゼノメカ | 94 | robot | shooter | spaceport | space_f4 | 5417 | 267 |  |  |
| `ghost_astral` | アストラル体 | 96 | ghost | flyer | spaceport | space_f4 | 4822 | 276 |  |  |
| `civilian_tourist` | 観光客 | 1 | civilian | civilian | town | - | 40 | 0 |  | civilian |
| `civilian_business` | ビジネスマン | 1 | civilian | civilian | town | - | 45 | 0 |  | civilian |
| `civilian_skater` | スケーター | 1 | civilian | civilian | town | - | 40 | 0 |  | civilian |
| `civilian_granny` | おばあちゃん | 1 | civilian | civilian | town | - | 35 | 0 |  | civilian |
| `civilian_dancer` | ストリートダンサー | 1 | civilian | civilian | town | - | 40 | 0 |  | civilian |
| `cop_patrol` | パトロール警官 | 14 | cop | cop | police | - | 206 | 14 |  | cop |
| `drone_scout` | 監視ドローン | 16 | drone | flyer | police | - | 243 | 16 |  | cop |
| `cop_detective` | 覆面刑事 | 30 | cop | cop | police | - | 580 | 35 |  | cop |
| `swat_trooper` | SWAT隊員 | 36 | swat | cop | police | - | 997 | 44 |  | cop |
| `swat_heavy` | ヘビーSWAT | 56 | swat | cop | police | - | 2513 | 81 |  | cop |
| `boss_king_slime` | キングゼリー | 10 | slime | boss | beach | beach_f3 | 2800 | 156 | ✔ |  |
| `boss_rat_king` | ラットキング | 18 | rat | boss | downtown | down_f2 | 4500 | 523 | ✔ |  |
| `boss_captain` | キャプテン・ハーケン | 34 | thug | boss | slums | slums_f3 | 11200 | 2357 | ✔ |  |
| `boss_gator` | グランパ・ゲイター | 44 | bossGator | boss | swamp | swamp_f3 | 19000 | 4613 | ✔ |  |
| `boss_mecha` | メカ・ハイローラー | 60 | drone | boss | casino | casino_f3 | 31800 | 10862 | ✔ |  |
| `boss_don` | ドン・カイマン | 78 | bossDon | boss | rooftop | tower_f3 | 55600 | 23369 | ✔ |  |
| `boss_alien` | オーバーロード・ゾグ | 100 | bossAlien | boss | spaceport | space_f4 | 103800 | 38867 | ✔ |  |

## 注意

- ボスは行き止まりフィールドに1体（`boss_king_slime`=beach_f3, `boss_rat_king`=down_f2(中ボス), `boss_captain`=slums_f3, `boss_gator`=swamp_f3, `boss_mecha`=casino_f3, `boss_don`=tower_f3, `boss_alien`=space_f4 裏ボス）。各ボスは `summon` に手下IDを持つ。
- `don_caiman` は casino に立つ会話用 NPC（黒幕）。戦闘は tower_f3 の敵 `boss_don`。
- 報告先が依頼主と異なるミッションは `mission.turnIn`（`turnInNpcOf(m)`）。
- NPC と話したら `events.emit("talkNpc", {npcId})`、マップ移動時は `events.emit("mapChanged", {mapId})`（talk / reach 目的・訪問記録）。
- 新 art 名: crab, jellyfish, seagull, rat, snake, mosquito, ghost, robot, alien, golem, civilian, bossAlien。色違いは `def.color` / `def.accent`、大きさは `def.scale`。

---

## v3（エンドコンテンツ・システム担当）

### ストーリー分岐（`MISSIONS[id].choices`）
報告時に選択（UI: `game.missions.needsChoice(id)` が true なら `m.choicePrompt` と `m.choices[].text` を表示 → `game.missions.choose(id, choiceId)` → `turnIn(id)`）。未選択で報告すると `choices[0]`。
セリフは `game.missions.dialog(id, 'offer'|'done')`（= `missionDialog(state, id, phase)`）を使うこと（flag と選択で変化）。

| ミッション | 依頼/報告 | 選択肢 `police` | 選択肢 `street` | 後の変化 |
|---|---|---|---|---|
| `m06_dirty_badge` 汚れたバッジ | カイ巡査 | 証拠を署の正義派に渡す（flag `sidePolice`、称号「VBPDの協力者」、$+1000・アイアン・ミルク） | 証拠を情報屋に売る（flag `sideStreet`、称号「裏通りの顔」、$+4000・リロール・チップ） | m07 / m13 の offer セリフ |
| `m13_heat` ヴァイス・ベイ大炎上 | カイ巡査 | カイと正義派に付く（`sidePolice2`） | ギャングと共闘（`sideStreet2`） | m14 の done セリフ |
| `m15_don` 最終話 | ノヴァ | ドンを警察に引き渡す（`endingHero`、称号「ヴァイス・ベイの英雄」） | ドンの座を奪う（`endingDon`、称号「新しいドン」） | エンディングのセリフ（choice.dialog） |

3回とも同じ側を選ぶと隠し実績＋称号（「VBPDの英雄」/「裏通りの王」）。

### 夜だけ開く店（`src/data/shops.js` `NIGHT_SHOPS`、20〜5時）
ワールド担当が配置済みの夜 NPC（`npc.hours`）と同じ npcId。夜限定の目玉としてチップ類の追加を提案:

| npcId | 町 | hours | 品揃え（提案） |
|---|---|---|---|
| `night_marin` | beach | [20,5] | drink_energy, drink_tough, potion_red, potion_blue, **pet_food** |
| `night_noodle` | downtown | [21,5] | potion_orange, potion_white, drink_energy, drink_tough |
| `night_smuggler` | slums | [22,4] | potion_white, potion_mana, smg_compact, mask_skull, drink_lucky, **chip_reroll, chip_lock** |
| `night_bartender` | casino | [20,5] | drink_lucky, power_elixir, elixir, sunglasses_neon, **chip_reroll** |
| `night_astro` | spaceport | [20,5] | elixir, potion_white, potion_mana, power_elixir, **tune_ticket** |

判定は `systems/night.js`: `isNightNow(game)`, `isOpenAt(hours, clock)`, `npcAvailableNow(game, npc)`。

### 夜限定の敵（`night:true`。spawner は `enemyAvailableNow(game, def)` で昼は出さない）

| enemyId | 名前 | Lv | 出現 | 備考 |
|---|---|---|---|---|
| `jelly_moonlit` | ムーンライト・クラゲ | 8 | beach_f3 | 経験値・$多め、チップ 2% |
| `thug_night_racer` | ナイト・ゴーストレーサー | 21 | down_f3 | 人型（look/equip あり） |
| `ghost_bayou` | バイユーの鬼火 | 42 | swamp_f4 | |
| `ghost_after_hours` | アフターアワーズの客 | 57 | casino_f4 | ダイヤ 0.5% |
| `drone_night_owl` | ナイトオウル観測機 | 48 | space_f2 | ロック・チップ 0.2% |

### 新アイテム
| itemId | 種類 | 入手 |
|---|---|---|
| `chip_reroll` リロール・チップ | etc | 全モンスター低確率（Lv15+ 0.2%、エリート/夜 0.6%）、ボス 60%、ショップ（vivi/nova/夜の店）、ログイン、タワー/アリーナ/ボス報酬 |
| `chip_lock` ロック・チップ | etc | ボス 5%、nova、夜の闇市、交換所 |
| `tune_ticket` チューン・チケット | etc | タワー50階ごと、ログイン7日/21日、交換所、夜間補給所 |
| `pet_food` ネオン・ペットフード | etc（`use:'petFood'`） | 全モンスター 0.4%、ボス 50%、sunny/vivi/ace_jet、ログイン |
| `spire_token` / `boss_trophy` | etc | 表示用（実数は `state.tower.tokens` / `state.bossTrophies`） |
| `crown_caiman` / `suit_vice` / `neon_sword_spire` / `pistol_spire` / `staff_spire` / `halo_zog` | 装備（Lv100〜150, ★20/25 まで） | カオス固有・トロフィー交換所・スパイア100階 |

### コンテンツ受付（ワールド担当の `concierge_<town>`, service:'content'）
UI のコンテンツ窓（U）から: `towerEnter(game, floor)` / `arenaEnter(game, stageId)` / `bossEntry(game, bossId, mode)`。一覧データは `towerBest(state)` / `arenaInfo(state)` / `bossClears(state)`。

## v4: 連作クエストの NPC（クエスト担当。`src/data/questNpcs.js` → maps.js の町の npcs の末尾）

見た目は今の NPC と同じ組み合わせ（`look` = 体・肌・髪・目、`equip` = `L(style, 色, 差し色)`）。顔・髪の絵は `render/npcFace.js` が id から選ぶ（`old_*` / 「じいさん」「ばあちゃん」は老人の顔）。
置く位置は、同じ町の NPC と 140px 以上・ポータルと 90px 以上離した（`tests/quests_v4.mjs` で確認）。ダウンタウンは満員なので、ウメばあちゃんは港・トニーは浜に住んでいる。

| npcId | 名前 | 町 | x | 役割 | 見た目 | あいさつ（dialog[0]） | 依頼するクエスト |
|---|---|---|---|---|---|---|---|
| `mel` | メル | `beach` | 860 | 砂の城職人の少女。毎晩城を壊されて困っている。 | 女・twin・髪#ffb36b／hat:cap top:tank bottom:shorts shoes:sandals | 「砂の城はね、波が来る前に完成させるのがコツなの！」 | `q_sandcastle_1`, `q_sandcastle_2`, `q_sandcastle_3`, `q_sandcastle_4a`, `q_sandcastle_4b` |
| `old_gus` | ガスじいさん | `beach` | 1400 | ピア桟橋の灯台守。亡き妻の灯りを守り続けている。 | 男・short・髪#e8e8e8／hat:beanie top:leatherJacket bottom:cargo shoes:boots | 「ピア桟橋の先に灯台があるじゃろう。わしはあれを五十年守っとる。」 | `q_lighthouse_1`, `q_lighthouse_2`, `q_lighthouse_3`, `q_lighthouse_4`, `q_lighthouse_5` |
| `popo` | ポップコーン屋ポポ | `beach` | 2020 | [ネタ] カモメに売り物を全部取られる発明好きの屋台主。 | 男・spiky・髪#ff3d7f／hat:cap top:tshirt bottom:shorts shoes:sneakers | 「へいらっしゃい！ 今日のポップコーンは…カモメが全部持っていきました！」 | `q_popcorn_1`, `q_popcorn_2`, `q_popcorn_3`, `q_popcorn_4` |
| `kiki` | キキ | `beach` | 2600 | 迷子のペット「ポチ」を探す観光客。 | 女・bob・髪#7a3dff／hat:catEars top:hoodie bottom:jeans shoes:sneakers | 「ポチ〜！ どこ〜！？」 | `q_lostdog_1`, `q_lostdog_2`, `q_lostdog_3` |
| `lyra` | 語り部リラ | `beach` | 1620 | [地域をまたぐ連作] 街の伝説「ネオン・フェニックス」を追う吟遊詩人。 | 女・long・髪#ff8a00／hat:cowboy top:hawaiian bottom:cargo shoes:boots accessory:scarf weapon:guitar | 「「街が闇に沈むとき、ネオンの不死鳥が夜を焼き払う」…この街の古い歌よ。」 | `q_legend_1`, `q_legend_2`, `q_legend_3`, `q_legend_4`, `q_legend_5`, `q_legend_6`, `q_legend_7` |
| `pierre` | ピエール | `downtown` | 200 | [ネタ] 一言もしゃべらないパントマイマー。 | 男・short・髪#16161e／hat:beanie top:tshirt bottom:suitPants shoes:loafers accessory:scarf | 「……（見えない壁を、両手でぺたぺた触っている）」 | `q_mime_1`, `q_mime_2`, `q_mime_3`, `q_mime_4` |
| `mika` | 記者ミカ | `downtown` | 1525 | ヴァイス・ベイ新報の記者。「地下鉄の怪物」を追う。 | 女・ponytail・髪#3a2a1a／hat:cap top:leatherJacket bottom:jeans shoes:sneakers accessory:sunglasses | 「ヴァイス・ベイ新報のミカよ。ネタがあったら教えて！」 | `q_scoop_1`, `q_scoop_2`, `q_scoop_3`, `q_scoop_4a`, `q_scoop_5a`, `q_scoop_4b`, `q_scoop_5b` |
| `granny_ume` | ウメばあちゃん | `slums` | 1520 | 港の長屋に住むおばあちゃん。亡き夫のレシピ帳を探す。実はママ・ローザの母。 | 女・bob・髪#dddddd／hat:bandana top:hoodie bottom:cargo shoes:loafers accessory:scarf | 「おや、いい顔してるねえ。ちゃんとご飯食べてるかい？」 | `q_ume_1`, `q_ume_2`, `q_ume_3`, `q_ume_4` |
| `tony` | スケーターのトニー | `beach` | 1850 | ボードウォークのスケーター。ダウンタウンのセントラル公園のスケボー場を守りたい。 | 男・wolf・髪#ffb000／hat:cap top:hoodie bottom:cargo shoes:sneakers | 「ヨー！ 板に乗ってると、街が全部パークに見えるんだ。」 | `q_skate_1`, `q_skate_2`, `q_skate_3`, `q_skate_4` |
| `old_mori` | モリ船長 | `slums` | 570 | 陸に上がった元船長。幽霊船の噂を追う。 | 男・long・髪#cccccc／hat:cap top:leatherJacket bottom:cargo shoes:boots | 「霧の夜は、昔の船の汽笛が聞こえる気がするんじゃ。」 | `q_ghostship_1`, `q_ghostship_2`, `q_ghostship_3`, `q_ghostship_4a`, `q_ghostship_5a`, `q_ghostship_4b`, `q_ghostship_5b` |
| `rina` | リナ | `slums` | 930 | タンクの弟子。自分だけの相棒ロボを作りたい。 | 女・ponytail・髪#ff8a00／hat:headphones top:tank bottom:cargo shoes:boots accessory:goldChain | 「タンクさんの弟子のリナです！ 油まみれですみません！」 | `q_junkrobot_1`, `q_junkrobot_2`, `q_junkrobot_3`, `q_junkrobot_4`, `q_junkrobot_5` |
| `dan_sweeper` | 清掃員ダン | `slums` | 1800 | 港の清掃員（三十年）。黒い排水の出どころを探る。 | 男・short・髪#555555／hat:helmet top:armorVest bottom:cargo shoes:boots | 「港がきれいなら、人の心もちっとはきれいになるもんさ。」 | `q_toxic_1`, `q_toxic_2`, `q_toxic_3`, `q_toxic_4` |
| `bubbles` | シャボンおじさん | `slums` | 2130 | [ネタ] 港を包む巨大シャボン玉を作りたいおじさん。 | 男・spiky・髪#bff6ff／hat:beanie top:hawaiian bottom:shorts shoes:sandals | 「ぷく〜。シャボン玉は、割れる瞬間が一番きれいなんだよ。」 | `q_bubbles_1`, `q_bubbles_2`, `q_bubbles_3`, `q_bubbles_4` |
| `barney` | レコード屋バーニー | `slums` | 2780 | [地域をまたぐ連作] 幻のレコード「ヴァイス・ナイト」を追う中古盤屋。 | 男・wolf・髪#16161e／hat:headphones top:suit bottom:jeans shoes:loafers accessory:sunglasses | 「いらっしゃい。針を落とす前に、盤の匂いを嗅ぐのが通ってもんだ。」 | `q_record_1`, `q_record_2`, `q_record_3`, `q_record_4`, `q_record_5a`, `q_record_5b`, `q_record_6` |
| `sue` | レンジャーのスー | `swamp` | 1130 | グレイズ自然保護区のレンジャー。密猟者を追う。 | 女・ponytail・髪#3a2a1a／hat:cowboy top:armorVest bottom:cargo shoes:boots | 「沼は怖いところじゃない。怖いのは、沼を荒らす人間よ。」 | `q_ranger_1`, `q_ranger_2`, `q_ranger_3`, `q_ranger_4`, `q_ranger_5` |
| `geko` | ゲコ様 | `swamp` | 1880 | [ネタ] 自称・呪いで人間のおじさんにされたカエルの王子。 | 男・short・髪#3f8f3a／hat:crown top:suit bottom:shorts shoes:sandals accessory:scarf | 「ゲコッ。わしはカエル王国の王子じゃ。今は呪いで人間のおじさんの姿をしておる。」 | `q_geko_1`, `q_geko_2`, `q_geko_3`, `q_geko_4`, `q_geko_5` |
| `tad` | 少年タッド | `swamp` | 2330 | 伝説の白いワニを見たい村の少年。 | 男・spiky・髪#c98b4a／hat:cap top:tshirt bottom:shorts shoes:sneakers | 「ぼく、白いワニを探してるんだ！ 伝説なんだよ！」 | `q_tad_1`, `q_tad_2`, `q_tad_3` |
| `lou` | ラッキー・ルー | `casino` | 570 | 一度も勝ったことがないギャンブラー。父の亡霊を追う。 | 男・bob・髪#5a3a22／hat:cowboy top:suit bottom:suitPants shoes:loafers accessory:goldChain | 「へへ…ラッキー・ルーってのは皮肉さ。」 | `q_lou_1`, `q_lou_2`, `q_lou_3`, `q_lou_4a`, `q_lou_5a`, `q_lou_4b`, `q_lou_5b` |
| `coco` | ショーガールのココ | `casino` | 1300 | ネオン・パレスの踊り子。盗まれた衣装を探す。 | 女・long・髪#ff3dd2／hat:crown top:idolDress bottom:skirt shoes:heels accessory:goldChain | 「ショーは毎晩九時から！ 見に来てね！」 | `q_coco_1`, `q_coco_2`, `q_coco_3`, `q_coco_4`, `q_coco_5` |
| `ken_valet` | 駐車係ケン | `casino` | 1480 | ロボに仕事を奪われた元バレー。 | 男・short・髪#16161e／hat:cap top:suit bottom:suitPants shoes:loafers | 「お客様のお車、責任を持って…いや、今はロボの仕事だったな。」 | `q_valet_1`, `q_valet_2`, `q_valet_3`, `q_valet_4` |
| `king_bob` | 「キング」ボブ | `casino` | 2230 | [ネタ] ものまね芸人。正体はコンビニの店長。 | 男・wolf・髪#16161e／top:suit bottom:suitPants shoes:loafers accessory:sunglasses | 「サンキュー、ベリーマッチ。」 | `q_bob_1`, `q_bob_2`, `q_bob_3`, `q_bob_4` |
| `hound` | 探偵ハウンド | `casino` | 2950 | [地域をまたぐ連作] ネオン怪盗団を追う私立探偵。 | 男・short・髪#5a3a22／hat:cowboy top:suit bottom:suitPants shoes:loafers accessory:scarf | 「…私の鼻は嘘をつかない。この街には、まだ匂う事件がある。」 | `q_phantom_1`, `q_phantom_2`, `q_phantom_3`, `q_phantom_4`, `q_phantom_5`, `q_phantom_6`, `q_phantom_7a`, `q_phantom_7b` |
| `jo_window` | 窓拭きのジョー | `rooftop` | 590 | 地上300mの窓拭き職人。勝手に動く足場に悩む。 | 男・short・髪#ffb000／hat:helmet top:armorVest bottom:cargo shoes:boots | 「高いところは平気さ。下を見なけりゃな。」 | `q_window_1`, `q_window_2`, `q_window_3`, `q_window_4` |
| `ivy` | 庭師アイビー | `rooftop` | 1050 | 空中庭園の庭師。枯れていく木を救いたい。 | 女・long・髪#5cff9a／hat:cowboy top:hoodie bottom:cargo shoes:boots accessory:scarf | 「空の上でも、木はちゃんと育つんですよ。」 | `q_ivy_1`, `q_ivy_2`, `q_ivy_3`, `q_ivy_4`, `q_ivy_5` |
| `rook` | 元傭兵ルーク | `rooftop` | 1550 | ビルの管理人。ドン親衛隊に残る弟を連れ戻したい。 | 男・wolf・髪#3a3a46／hat:beanie top:armorVest bottom:armorPants shoes:boots accessory:mask | 「…今は管理人だ。銃は引き出しの奥にしまってある。」 | `q_rook_1`, `q_rook_2`, `q_rook_3`, `q_rook_4a`, `q_rook_5a`, `q_rook_4b`, `q_rook_5b` |
| `yui` | ユイ | `rooftop` | 2050 | [ネタ] フォロワー3人の自撮りインフルエンサー。 | 女・twin・髪#ff2fd0／hat:catEars top:tracksuit bottom:skirt shoes:sneakers accessory:sunglasses | 「はい、チーズ☆ …あ、勝手に撮っちゃった。」 | `q_yui_1`, `q_yui_2`, `q_yui_3`, `q_yui_4` |
| `pip` | 訓練生ピップ | `spaceport` | 620 | パイロット訓練生。試験に三回落ちている。 | 男・bob・髪#ffd166／hat:helmet top:tracksuit bottom:trackPants shoes:sneakers | 「ぼく、いつか宇宙を飛ぶんだ！ …試験に受かったら。」 | `q_cadet_1`, `q_cadet_2`, `q_cadet_3`, `q_cadet_4`, `q_cadet_5` |
| `chef_orbit` | シェフ・オービット | `spaceport` | 1080 | 「うまい宇宙食」を作りたい宇宙食シェフ。 | 男・short・髪#ffffff／hat:beanie top:suit bottom:cargo shoes:boots | 「宇宙食はまずい？ その常識、今日で終わりにしてやる！」 | `q_spacefood_1`, `q_spacefood_2`, `q_spacefood_3`, `q_spacefood_4` |
| `tanaka` | ギャラクシー田中 | `spaceport` | 1500 | [ネタ] UFOを呼ぶ男。 | 男・bob・髪#5a5a62／hat:beanie top:hoodie bottom:trackPants shoes:sneakers accessory:sunglasses | 「…しっ。いま宇宙からの電波を受信しています。」 | `q_ufo_1`, `q_ufo_2`, `q_ufo_3`, `q_ufo_4`, `q_ufo_5` |
| `gate_vega` | ゲート技師ベガ | `spaceport` | 2250 | [第2部] 次元ゲートを研究する技師。m2 の連作の中心人物。 | 女・bob・髪#7a3dff／hat:headphones top:armorVest bottom:armorPants shoes:boots accessory:halo | 「次元ゲート？ 夢物語だって笑われるわ。…でも私は、本気よ。」 | `m2_03_parts`, `m2_04_moon`, `m2_07_rift`, `m2_08_gate` |

### 今いる NPC で、v4 から依頼をするようになった NPC（`MISSION_NPCS` に追加）

| npcId | 名前 | 町 | 役割 | 依頼するクエスト |
|---|---|---|---|---|
| `dash_garage` | ダッシュ | `downtown` | ガレージの主。副業でネオン看板も直している。 | `q_neonsign_1`, `q_neonsign_2`, `q_neonsign_3`, `q_neonsign_4`, `q_neonsign_5` |
| `shop_downtown` | ミミ | `downtown` | ネオン・ブティックの店員。…その正体は？ | - |
| `sal_pawn` | サル | `slums` | 港の質屋。盗品の行方を知っている。 | - |
| `voodoo_betty` | ブードゥー・ベティ | `swamp` | 沼の魔女の薬屋。霧の鬼火の正体を知っている。 | `q_voodoo_1`, `q_voodoo_2`, `q_voodoo_3`, `q_voodoo_4a`, `q_voodoo_5a`, `q_voodoo_4b`, `q_voodoo_5b` |
| `mr_chip` | ミスター・チップ | `casino` | 景品交換所の主。景品の在庫が消えて困っている。 | `q_chip_1`, `q_chip_2`, `q_chip_3`, `q_chip_4` |

### 今いるミッション NPC が依頼する v4 のクエスト

| npcId | 依頼するクエスト |
|---|---|
| `rico` | `q_memento_beach` |
| `mama_rosa` | `q_memento_downtown` |
| `dj_pulse` | `q_dockrave_1`, `q_dockrave_2`, `q_dockrave_3`, `q_dockrave_4` |
| `tank` | `q_memento_slums` |
| `old_boone` | `q_legacy_1`, `q_legacy_2`, `q_legacy_3`, `q_legacy_4`, `q_memento_swamp` |
| `vivi` | `q_memento_casino` |
| `nova` | `q_memento_rooftop`, `m2_06_legacy` |
| `dr_stella` | `q_memento_spaceport`, `m2_01_signal`, `m2_02_vega` |
| `ace_jet` | `q_moonecho_1`, `q_moonecho_2`, `q_moonecho_3`, `q_moonecho_4`, `q_moonecho_5`, `m2_05_code` |
