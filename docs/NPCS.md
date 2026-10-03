# NPC / 敵 / マップ ID 一覧（ゲームシステム担当 → ワールド担当）

`src/data/missions.js` の `MISSION_NPCS` / `src/data/enemies.js` の `ENEMIES_BY_MAP` から生成。maps.js の `npcs[].id` と `spawns[].types` はこの ID を使ってください。

## マップID

`beach`, `downtown`, `slums`, `swamp`, `casino`, `rooftop`

## ミッションNPC（maps.js の npcs に配置）

| npcId | 名前 | 配置マップ | 役割 | 依頼するミッション | 報告を受けるミッション |
|---|---|---|---|---|---|
| `rico` | リコ | `beach` | ビーチの情報屋。二人を街に引き込んだ張本人。 | m01_welcome, m02_jelly, m03_flamingo, m04_rosa | - |
| `sunny` | サニー | `beach` | ライフガード兼ビーチ売店。サブ/デイリー。 | s01_feathers, s02_king_slime, d01_beach_patrol | - |
| `mama_rosa` | ママ・ローザ | `downtown` | ダウンタウンの食堂店主。ポーション屋。 | m05_protection, s03_mushroom_soup, d02_street_sweep | m04_rosa |
| `officer_kai` | カイ巡査 | `downtown` | 金で動く汚職警官。 | m06_dirty_badge, m07_wheels, m13_heat, m14_rooftop, d03_heat_check | - |
| `dj_pulse` | DJパルス | `slums` | 港の倉庫で地下レイブを仕切るDJ。 | m08_rave, m09_swamp, s07_rave_drive | - |
| `tank` | タンク | `slums` | 港のメカニック。車の手配屋。 | s04_toxic, d04_delivery | m07_wheels |
| `old_boone` | ブーンじいさん | `swamp` | スワンプのワニ猟師。 | m10_grandpa, m11_casino, s05_albino, d05_swamp_hunt | m09_swamp |
| `vivi` | ヴィヴィ | `casino` | カジノ「ネオン・パレス」のディーラー。内通者。 | m12_mecha, s06_gold_rush, d06_high_stakes | m11_casino |
| `don_caiman` | ドン・カイマン | `casino` | 街を牛耳るカジノ王（黒幕）。ボス戦は rooftop の boss_don。 | - | - |
| `nova` | ノヴァ | `rooftop` | 天才ハッカー。最終決戦の案内役。 | m15_don, d07_rooftop_contract | m14_rooftop |

## マップ別 出現敵（spawns[].types 用）

| マップ | 敵ID（Lv） |
|---|---|
| `beach` | `slime_green`(1), `slime_pink`(3), `mushroom_orange`(5), `flamingo`(7), `boss_king_slime`(12 BOSS) |
| `downtown` | `thug_punk`(10), `mushroom_neon`(12), `cop_patrol`(14), `drone_scout`(16) |
| `slums` | `thug_dockhand`(18), `slime_toxic`(20), `flamingo_punk`(22), `thug_gunner`(24) |
| `swamp` | `gator_swamp`(26), `mushroom_bog`(28), `gator_albino`(32), `boss_gator`(32 BOSS) |
| `casino` | `thug_bouncer`(38), `drone_casino`(40), `slime_gold`(42), `boss_mecha`(44 BOSS) |
| `rooftop` | `thug_hitman`(48), `drone_attack`(52), `swat_heavy`(56), `mushroom_mutant`(60), `boss_don`(58 BOSS) |

## 警察ユニット（手配度★別, spawner 用）

| ★ | 敵ID |
|---|---|
| 1 | `cop_patrol` |
| 2 | `cop_patrol`, `drone_scout` |
| 3 | `cop_patrol`, `cop_detective`, `drone_scout` |
| 4 | `cop_detective`, `swat_trooper` |
| 5 | `swat_trooper`, `swat_heavy` |

## 全敵一覧

| 敵ID | 名前 | Lv | art | ai | HP | boss | isCop |
|---|---|---|---|---|---|---|---|
| `slime_green` | ソーダスライム | 1 | slime | jumper | 34 |  |  |
| `slime_pink` | ストロベリースライム | 3 | slime | jumper | 54 |  |  |
| `mushroom_orange` | ビーチマッシュ | 5 | mushroom | walker | 78 |  |  |
| `flamingo` | ヤンキーフラミンゴ | 7 | flamingo | charger | 106 |  |  |
| `thug_punk` | ストリートチンピラ | 10 | thug | walker | 155 |  |  |
| `mushroom_neon` | ネオンキノコ | 12 | mushroom | jumper | 193 |  |  |
| `cop_patrol` | パトロール警官 | 14 | cop | cop | 235 |  | ✔ |
| `drone_scout` | 監視ドローン | 16 | drone | flyer | 281 |  | ✔ |
| `thug_dockhand` | 港のゴロツキ | 18 | thug | charger | 331 |  |  |
| `slime_toxic` | ヘドロスライム | 20 | slime | jumper | 385 |  |  |
| `flamingo_punk` | パンク・フラミンゴ | 22 | flamingo | charger | 443 |  |  |
| `thug_gunner` | ギャングの鉄砲玉 | 24 | thug | shooter | 505 |  |  |
| `gator_swamp` | 沼ワニ | 26 | gator | charger | 685 |  |  |
| `mushroom_bog` | 沼地の毒キノコ | 28 | mushroom | walker | 641 |  |  |
| `gator_albino` | アルビノゲイター | 32 | gator | charger | 1031 |  |  |
| `cop_detective` | 覆面刑事 | 30 | cop | cop | 715 |  | ✔ |
| `swat_trooper` | SWAT隊員 | 36 | swat | cop | 1249 |  | ✔ |
| `thug_bouncer` | カジノの用心棒 | 38 | thug | walker | 1471 |  |  |
| `drone_casino` | セキュリティドローン | 40 | drone | flyer | 1145 |  |  |
| `slime_gold` | ゴールドスライム | 42 | slime | jumper | 1243 |  |  |
| `thug_hitman` | ドンの殺し屋 | 48 | thug | shooter | 1873 |  |  |
| `drone_attack` | アサルトドローン | 52 | drone | flyer | 1972 |  |  |
| `swat_heavy` | ヘビーSWAT | 56 | swat | cop | 3266 |  | ✔ |
| `mushroom_mutant` | ミュータント・マッシュ | 60 | mushroom | jumper | 3458 |  |  |
| `boss_king_slime` | キングゼリー | 12 | slime | boss | 3200 | ✔ |  |
| `boss_gator` | グランパ・ゲイター | 32 | bossGator | boss | 16000 | ✔ |  |
| `boss_mecha` | メカ・ハイローラー | 44 | drone | boss | 32000 | ✔ |  |
| `boss_don` | ドン・カイマン | 58 | bossDon | boss | 65000 | ✔ |  |

## 注意

- ボスは各マップに 1 体ずつ（`boss_king_slime`=beach, `boss_gator`=swamp, `boss_mecha`=casino, `boss_don`=rooftop）。spawns に max:1 で置くかボス部屋に配置してください（ミッション `boss` 目的の対象）。
- `don_caiman` は casino に立つ会話用 NPC（黒幕）。戦闘は rooftop の敵 `boss_don`。
- 報告先が依頼主と異なるミッションは `mission.turnIn` に npcId（`turnInNpcOf(m)` で取得）。`MissionManager.completable(npcId)` / `npcMarker(npcId)` で判定できます。
- NPC と話したら `events.emit('talkNpc', {npcId})`、マップ移動時は `events.emit('mapChanged', {mapId})` を発行してください（talk / reach 目的の進捗）。
- drive 目的は `game.player.inVehicle`（車オブジェクト、`x` を参照）中の移動距離（10px=1m）で自動加算されます。
