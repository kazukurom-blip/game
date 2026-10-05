# Codex への一括依頼（第3弾）: キャラ以外の画像（背景・地面/足場・アイコン・乗り物・タイトル）

**作業の続け方:**
- 第2弾（`CODEX_BATCH_02.md`）が終わったら、そのまま続けてください。
- 上の段から順に、1段ごと（⑪、⑫…）に ZIP で納品してください。
- 自分で確認（大きさ・透明・継ぎ目・マゼンタの印）して合格したら、こちらの返事を待たずに次へ進んでください。
- 大きな不具合で進められない段だけ止め、ほかは続けてください。

**共通:**
- 絵柄は第1弾と同じです（見本 `style/luna_f_reference.png`）。
- 保存先は `assets/sprites/` の下、表のファイル名のとおりです。
- 各ファイルの詳しい指示文は `CODEX_BATCH_03.csv` にあります（「AIへの指示文」の列）。

**背景の重ね方（ゲーム側）:**
- 空（ゲームが時間で塗る）の上に、遠景（ゆっくり動く）と中景（少し速く動く）を重ねます。
- 夜は「あかり」を光らせて重ねます。
- 横に繰り返して並べるので、**左右の端が必ずつながる**ように描いてください。
- 中景の建物の足元は y=640 にそろえます。

**合計: 269 枚**

## ⑪ 背景（42枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `bg/beach_town_far.png` | 2560×720 | ヴァイス・ビーチ・町・遠景 |
| `bg/beach_town_mid.png` | 2560×720 | ヴァイス・ビーチ・町・中景 |
| `bg/beach_town_lights.png` | 2560×720 | ヴァイス・ビーチ・町・夜のあかり |
| `bg/beach_field_far.png` | 2560×720 | ヴァイス・ビーチ・フィールド・遠景 |
| `bg/beach_field_mid.png` | 2560×720 | ヴァイス・ビーチ・フィールド・中景 |
| `bg/beach_field_lights.png` | 2560×720 | ヴァイス・ビーチ・フィールド・夜のあかり |
| `bg/downtown_town_far.png` | 2560×720 | ダウンタウン・町・遠景 |
| `bg/downtown_town_mid.png` | 2560×720 | ダウンタウン・町・中景 |
| `bg/downtown_town_lights.png` | 2560×720 | ダウンタウン・町・夜のあかり |
| `bg/downtown_field_far.png` | 2560×720 | ダウンタウン・フィールド・遠景 |
| `bg/downtown_field_mid.png` | 2560×720 | ダウンタウン・フィールド・中景 |
| `bg/downtown_field_lights.png` | 2560×720 | ダウンタウン・フィールド・夜のあかり |
| `bg/slums_town_far.png` | 2560×720 | 港のスラム・町・遠景 |
| `bg/slums_town_mid.png` | 2560×720 | 港のスラム・町・中景 |
| `bg/slums_town_lights.png` | 2560×720 | 港のスラム・町・夜のあかり |
| `bg/slums_field_far.png` | 2560×720 | 港のスラム・フィールド・遠景 |
| `bg/slums_field_mid.png` | 2560×720 | 港のスラム・フィールド・中景 |
| `bg/slums_field_lights.png` | 2560×720 | 港のスラム・フィールド・夜のあかり |
| `bg/swamp_town_far.png` | 2560×720 | 霧のワニ沼・町・遠景 |
| `bg/swamp_town_mid.png` | 2560×720 | 霧のワニ沼・町・中景 |
| `bg/swamp_town_lights.png` | 2560×720 | 霧のワニ沼・町・夜のあかり |
| `bg/swamp_field_far.png` | 2560×720 | 霧のワニ沼・フィールド・遠景 |
| `bg/swamp_field_mid.png` | 2560×720 | 霧のワニ沼・フィールド・中景 |
| `bg/swamp_field_lights.png` | 2560×720 | 霧のワニ沼・フィールド・夜のあかり |
| `bg/casino_town_far.png` | 2560×720 | カジノ・ストリップ・町・遠景 |
| `bg/casino_town_mid.png` | 2560×720 | カジノ・ストリップ・町・中景 |
| `bg/casino_town_lights.png` | 2560×720 | カジノ・ストリップ・町・夜のあかり |
| `bg/casino_field_far.png` | 2560×720 | カジノ・ストリップ・フィールド・遠景 |
| `bg/casino_field_mid.png` | 2560×720 | カジノ・ストリップ・フィールド・中景 |
| `bg/casino_field_lights.png` | 2560×720 | カジノ・ストリップ・フィールド・夜のあかり |
| `bg/rooftop_town_far.png` | 2560×720 | 摩天楼の屋上・町・遠景 |
| `bg/rooftop_town_mid.png` | 2560×720 | 摩天楼の屋上・町・中景 |
| `bg/rooftop_town_lights.png` | 2560×720 | 摩天楼の屋上・町・夜のあかり |
| `bg/rooftop_field_far.png` | 2560×720 | 摩天楼の屋上・フィールド・遠景 |
| `bg/rooftop_field_mid.png` | 2560×720 | 摩天楼の屋上・フィールド・中景 |
| `bg/rooftop_field_lights.png` | 2560×720 | 摩天楼の屋上・フィールド・夜のあかり |
| `bg/spaceport_town_far.png` | 2560×720 | 宇宙港・町・遠景 |
| `bg/spaceport_town_mid.png` | 2560×720 | 宇宙港・町・中景 |
| `bg/spaceport_town_lights.png` | 2560×720 | 宇宙港・町・夜のあかり |
| `bg/spaceport_field_far.png` | 2560×720 | 宇宙港・フィールド・遠景 |
| `bg/spaceport_field_mid.png` | 2560×720 | 宇宙港・フィールド・中景 |
| `bg/spaceport_field_lights.png` | 2560×720 | 宇宙港・フィールド・夜のあかり |

## ⑫ 地面・足場（14枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `tiles/beach_ground.png` | 512×256 | ヴァイス・ビーチの地面 |
| `tiles/beach_platform.png` | 512×96 | ヴァイス・ビーチの足場 |
| `tiles/downtown_ground.png` | 512×256 | ダウンタウンの地面 |
| `tiles/downtown_platform.png` | 512×96 | ダウンタウンの足場 |
| `tiles/slums_ground.png` | 512×256 | 港のスラムの地面 |
| `tiles/slums_platform.png` | 512×96 | 港のスラムの足場 |
| `tiles/swamp_ground.png` | 512×256 | 霧のワニ沼の地面 |
| `tiles/swamp_platform.png` | 512×96 | 霧のワニ沼の足場 |
| `tiles/casino_ground.png` | 512×256 | カジノ・ストリップの地面 |
| `tiles/casino_platform.png` | 512×96 | カジノ・ストリップの足場 |
| `tiles/rooftop_ground.png` | 512×256 | 摩天楼の屋上の地面 |
| `tiles/rooftop_platform.png` | 512×96 | 摩天楼の屋上の足場 |
| `tiles/spaceport_ground.png` | 512×256 | 宇宙港の地面 |
| `tiles/spaceport_platform.png` | 512×96 | 宇宙港の足場 |

## ⑬ 装備アイコン（48枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `icons/equip/hat_catEars.png` | 256×256 | 帽子：ピンクのネコミミなど（3種） |
| `icons/equip/hat_headphones.png` | 256×256 | 帽子：ジャンク・ヘッドセットなど（2種） |
| `icons/equip/hat_cap.png` | 256×256 | 帽子：ストリートキャップなど（1種） |
| `icons/equip/hat_beanie.png` | 256×256 | 帽子：グレーのビーニーなど（1種） |
| `icons/equip/hat_bandana.png` | 256×256 | 帽子：レッドバンダナなど（1種） |
| `icons/equip/hat_cowboy.png` | 256×256 | 帽子：デザートカウボーイなど（1種） |
| `icons/equip/hat_helmet.png` | 256×256 | 帽子：バイカーヘルメットなど（2種） |
| `icons/equip/hat_crown.png` | 256×256 | 帽子：ベイの王冠など（3種） |
| `icons/equip/top_hoodie.png` | 256×256 | 上着：サイバーパーカーなど（2種） |
| `icons/equip/top_plainShirt.png` | 256×256 | 上着：生成りのシャツなど（1種） |
| `icons/equip/top_leatherJacket.png` | 256×256 | 上着：ブラックレザージャケットなど（2種） |
| `icons/equip/top_tshirt.png` | 256×256 | 上着：ホワイトTシャツなど（1種） |
| `icons/equip/top_tank.png` | 256×256 | 上着：ブラックタンクトップなど（1種） |
| `icons/equip/top_hawaiian.png` | 256×256 | 上着：サンセット・アロハなど（1種） |
| `icons/equip/top_tracksuit.png` | 256×256 | 上着：グリーンジャージなど（1種） |
| `icons/equip/top_police.png` | 256×256 | 上着：奪った警官制服など（1種） |
| `icons/equip/top_suit.png` | 256×256 | 上着：マフィアスーツなど（3種） |
| `icons/equip/top_idolDress.png` | 256×256 | 上着：ステージ・アイドルドレスなど（2種） |
| `icons/equip/top_armorVest.png` | 256×256 | 上着：タクティカルベストなど（2種） |
| `icons/equip/bottom_plainPants.png` | 256×256 | 下：綿のズボンなど（1種） |
| `icons/equip/bottom_skirt.png` | 256×256 | 下：プリーツスカートなど（2種） |
| `icons/equip/bottom_trackPants.png` | 256×256 | 下：カーゴ・ジョガーなど（2種） |
| `icons/equip/bottom_jeans.png` | 256×256 | 下：ダメージジーンズなど（1種） |
| `icons/equip/bottom_shorts.png` | 256×256 | 下：ビーチショーツなど（1種） |
| `icons/equip/bottom_cargo.png` | 256×256 | 下：カーゴパンツなど（1種） |
| `icons/equip/bottom_suitPants.png` | 256×256 | 下：スーツパンツなど（1種） |
| `icons/equip/bottom_armorPants.png` | 256×256 | 下：タクティカルパンツなど（2種） |
| `icons/equip/shoes_oldShoes.png` | 256×256 | 靴：古い布靴など（1種） |
| `icons/equip/shoes_sneakers.png` | 256×256 | 靴：ホワイトスニーカーなど（2種） |
| `icons/equip/shoes_boots.png` | 256×256 | 靴：エンジニアブーツなど（3種） |
| `icons/equip/shoes_sandals.png` | 256×256 | 靴：ビーチサンダルなど（1種） |
| `icons/equip/shoes_loafers.png` | 256×256 | 靴：ブラウンローファーなど（1種） |
| `icons/equip/shoes_heels.png` | 256×256 | 靴：レッドヒールなど（2種） |
| `icons/equip/accessory_sunglasses.png` | 256×256 | アクセサリー：アビエーターサングラスなど（2種） |
| `icons/equip/accessory_scarf.png` | 256×256 | アクセサリー：レッドスカーフなど（1種） |
| `icons/equip/accessory_goldChain.png` | 256×256 | アクセサリー：ゴールドチェーンなど（2種） |
| `icons/equip/accessory_mask.png` | 256×256 | アクセサリー：スカルマスクなど（1種） |
| `icons/equip/accessory_wings.png` | 256×256 | アクセサリー：エンジェルウィングなど（2種） |
| `icons/equip/accessory_halo.png` | 256×256 | アクセサリー：天使の輪など（3種） |
| `icons/equip/weapon_woodSword.png` | 256×256 | 武器：木剣など（1種） |
| `icons/equip/weapon_knife.png` | 256×256 | 武器：ポケットナイフなど（2種） |
| `icons/equip/weapon_staff.png` | 256×256 | 武器：グリッチ・ワンドなど（5種） |
| `icons/equip/weapon_bat.png` | 256×256 | 武器：ウッドバットなど（2種） |
| `icons/equip/weapon_pistol.png` | 256×256 | 武器：9mmピストルなど（5種） |
| `icons/equip/weapon_katana.png` | 256×256 | 武器：スチールカタナなど（3種） |
| `icons/equip/weapon_smg.png` | 256×256 | 武器：コンパクトSMGなど（3種） |
| `icons/equip/weapon_guitar.png` | 256×256 | 武器：エレキギターなど（2種） |
| `icons/equip/weapon_neonSword.png` | 256×256 | 武器：ネオンソードなど（4種） |

## ⑭ 消耗品・素材アイコン（47枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `icons/item/potion_red.png` | 256×256 | 赤ポーション |
| `icons/item/potion_orange.png` | 256×256 | オレンジポーション |
| `icons/item/potion_white.png` | 256×256 | ホワイトポーション |
| `icons/item/potion_blue.png` | 256×256 | 青ポーション |
| `icons/item/potion_mana.png` | 256×256 | マナエリクサー |
| `icons/item/elixir.png` | 256×256 | エリクサー |
| `icons/item/power_elixir.png` | 256×256 | ハーフエリクサー |
| `icons/item/drink_energy.png` | 256×256 | ネオン・エナジー |
| `icons/item/drink_tough.png` | 256×256 | アイアン・ミルク |
| `icons/item/drink_lucky.png` | 256×256 | ラッキー・ソーダ |
| `icons/item/slime_jelly.png` | 256×256 | スライムゼリー |
| `icons/item/mushroom_cap.png` | 256×256 | キノコのかさ |
| `icons/item/flamingo_feather.png` | 256×256 | フラミンゴの羽 |
| `icons/item/street_tag.png` | 256×256 | ギャングのワッペン |
| `icons/item/cop_badge.png` | 256×256 | 警官バッジ |
| `icons/item/stolen_vinyl.png` | 256×256 | 盗まれたレコード |
| `icons/item/toxic_goo.png` | 256×256 | 毒々しいゼリー |
| `icons/item/gator_tooth.png` | 256×256 | ワニの牙 |
| `icons/item/gator_scale.png` | 256×256 | アルビノの鱗 |
| `icons/item/drone_chip.png` | 256×256 | ドローンのチップ |
| `icons/item/casino_chip.png` | 256×256 | カジノチップ |
| `icons/item/gold_bar.png` | 256×256 | 金の延べ棒 |
| `icons/item/diamond.png` | 256×256 | ブルーダイヤ |
| `icons/item/neon_core.png` | 256×256 | ネオンコア |
| `icons/item/king_crown_shard.png` | 256×256 | 王冠のかけら |
| `icons/item/crab_shell.png` | 256×256 | カニの甲羅 |
| `icons/item/seagull_feather.png` | 256×256 | カモメの羽 |
| `icons/item/jelly_tentacle.png` | 256×256 | クラゲの触手 |
| `icons/item/rat_tail.png` | 256×256 | ネズミのしっぽ |
| `icons/item/neon_bulb.png` | 256×256 | 割れたネオン管 |
| `icons/item/rusty_bolt.png` | 256×256 | サビたボルト |
| `icons/item/snake_skin.png` | 256×256 | ヘビの抜け殻 |
| `icons/item/mosquito_wing.png` | 256×256 | ヌマカの羽 |
| `icons/item/ghost_wisp.png` | 256×256 | 亡霊のゆらめき |
| `icons/item/robot_gear.png` | 256×256 | ロボの歯車 |
| `icons/item/golem_core.png` | 256×256 | ゴーレムの核 |
| `icons/item/alien_crystal.png` | 256×256 | エイリアン・クリスタル |
| `icons/item/moon_rock.png` | 256×256 | 月の石（模造） |
| `icons/item/pirate_map.png` | 256×256 | 密輸船の海図 |
| `icons/item/rat_crown.png` | 256×256 | ネズミの王冠 |
| `icons/item/alien_core.png` | 256×256 | オーバーロード・コア |
| `icons/item/chip_reroll.png` | 256×256 | リロール・チップ |
| `icons/item/chip_lock.png` | 256×256 | ロック・チップ |
| `icons/item/tune_ticket.png` | 256×256 | チューン・チケット |
| `icons/item/pet_food.png` | 256×256 | ネオン・ペットフード |
| `icons/item/spire_token.png` | 256×256 | スパイア・トークン |
| `icons/item/boss_trophy.png` | 256×256 | ボス・トロフィー |

## ⑮ スキルアイコン（109枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `icons/skill/luna_neon_rush.png` | 256×256 | ネオン・ラッシュ（luna） |
| `icons/skill/luna_pink_bullet.png` | 256×256 | ピンクバレット（luna） |
| `icons/skill/luna_hiphop_step.png` | 256×256 | ヒップホップ・ステップ（luna） |
| `icons/skill/luna_party_bomb.png` | 256×256 | パーティー・ボム（luna） |
| `icons/skill/luna_idol_aura.png` | 256×256 | アイドル・オーラ（luna） |
| `icons/skill/luna_critical_heart.png` | 256×256 | クリティカル・ハート（luna） |
| `icons/skill/luna_star_shower.png` | 256×256 | スター・シャワー（luna） |
| `icons/skill/luna_moonwalk.png` | 256×256 | ムーンウォーク（luna） |
| `icons/skill/jin_heavy_smash.png` | 256×256 | ヘビースマッシュ（jin） |
| `icons/skill/jin_street_upper.png` | 256×256 | ストリート・アッパー（jin） |
| `icons/skill/jin_nitro_dash.png` | 256×256 | ニトロ・ダッシュ（jin） |
| `icons/skill/jin_ground_quake.png` | 256×256 | グラウンド・クエイク（jin） |
| `icons/skill/jin_boss_dignity.png` | 256×256 | ボスの威厳（jin） |
| `icons/skill/jin_tough_guy.png` | 256×256 | タフガイ（jin） |
| `icons/skill/jin_v8_cannon.png` | 256×256 | V8キャノン（jin） |
| `icons/skill/jin_street_king.png` | 256×256 | ストリートキング（jin） |
| `icons/skill/hk_data_bolt.png` | 256×256 | データ・ボルト（hacker） |
| `icons/skill/hk_glitch_wave.png` | 256×256 | グリッチ・ウェーブ（hacker） |
| `icons/skill/hk_packet_dash.png` | 256×256 | パケット・ダッシュ（hacker） |
| `icons/skill/hk_overclock.png` | 256×256 | オーバークロック（hacker） |
| `icons/skill/hk_virus_bomb.png` | 256×256 | ウイルス・ボム（hacker） |
| `icons/skill/hk_firewall.png` | 256×256 | ファイアウォール（hacker） |
| `icons/skill/hk_root_access.png` | 256×256 | ルート・アクセス（hacker） |
| `icons/skill/hk_cyber_storm.png` | 256×256 | サイバー・ストーム（hacker） |
| `icons/skill/street_dash.png` | 256×256 | ストリートダッシュ（both） |
| `icons/skill/lj_gun_double_tap.png` | 256×256 | ダブルタップ（luna） |
| `icons/skill/lj_gun_spread_shot.png` | 256×256 | スプレッド・ショット（luna） |
| `icons/skill/lj_gun_mastery.png` | 256×256 | ガン・マスタリー（luna） |
| `icons/skill/lj_gun_rail_snipe.png` | 256×256 | レールスナイプ（luna） |
| `icons/skill/lj_gun_hot_cartridge.png` | 256×256 | ホット・カートリッジ（luna） |
| `icons/skill/lj_gun_booster.png` | 256×256 | ガン・ブースター（luna） |
| `icons/skill/lj_gun_recoil_jump.png` | 256×256 | リコイル・ジャンプ（luna） |
| `icons/skill/lj_gun_bullet_rain.png` | 256×256 | バレット・レイン（luna） |
| `icons/skill/lj_gun_heart_magnum.png` | 256×256 | ハート・マグナム（luna） |
| `icons/skill/lj_gun_recoil_master.png` | 256×256 | リコイル・マスター（luna） |
| `icons/skill/lj_gun_follow_shot.png` | 256×256 | フォロー・ショット（luna） |
| `icons/skill/lj_gun_supernova.png` | 256×256 | スーパーノヴァ・バースト（luna） |
| `icons/skill/lj_gun_outlaw_soul.png` | 256×256 | アウトロー・ソウル（luna） |
| `icons/skill/lj_gun_bounty_hunter.png` | 256×256 | バウンティ・ハンター（luna） |
| `icons/skill/lj_dance_spin_turn.png` | 256×256 | スピン・ターン（luna） |
| `icons/skill/lj_dance_glide.png` | 256×256 | ネオン・グライド（luna） |
| `icons/skill/lj_dance_mastery.png` | 256×256 | ステップ・マスタリー（luna） |
| `icons/skill/lj_dance_strobe.png` | 256×256 | ストロボ・フラッシュ（luna） |
| `icons/skill/lj_dance_groove.png` | 256×256 | グルーヴ・ハイ（luna） |
| `icons/skill/lj_dance_booster.png` | 256×256 | ビート・ブースター（luna） |
| `icons/skill/lj_dance_blink.png` | 256×256 | ネオン・ブリンク（luna） |
| `icons/skill/lj_dance_prism_step.png` | 256×256 | プリズム・ステップ（luna） |
| `icons/skill/lj_dance_encore.png` | 256×256 | アンコール（luna） |
| `icons/skill/lj_dance_prism_blink.png` | 256×256 | プリズム・ブリンク（luna） |
| `icons/skill/lj_dance_echo_step.png` | 256×256 | エコー・ステップ（luna） |
| `icons/skill/lj_dance_galaxy_stage.png` | 256×256 | ギャラクシー・ステージ（luna） |
| `icons/skill/lj_dance_starlight_combo.png` | 256×256 | スターライト・コンボ（luna） |
| `icons/skill/lj_dance_world_tour.png` | 256×256 | ワールド・ツアー（luna） |
| `icons/skill/jj_fight_jab_rush.png` | 256×256 | ジャブ・ラッシュ（jin） |
| `icons/skill/jj_fight_haymaker.png` | 256×256 | ヘイメイカー（jin） |
| `icons/skill/jj_fight_iron_body.png` | 256×256 | アイアン・ボディ（jin） |
| `icons/skill/jj_fight_knuckle_bomb.png` | 256×256 | ナックル・ボム（jin） |
| `icons/skill/jj_fight_fighting_spirit.png` | 256×256 | 闘魂（jin） |
| `icons/skill/jj_fight_booster.png` | 256×256 | ナックル・ブースター（jin） |
| `icons/skill/jj_fight_shoulder_rush.png` | 256×256 | ショルダー・ラッシュ（jin） |
| `icons/skill/jj_fight_dragon_upper.png` | 256×256 | 昇龍アッパー（jin） |
| `icons/skill/jj_fight_dragon_wave.png` | 256×256 | 龍撃波（jin） |
| `icons/skill/jj_fight_unstoppable.png` | 256×256 | アンストッパブル（jin） |
| `icons/skill/jj_fight_combo_follow.png` | 256×256 | コンボ・フォロー（jin） |
| `icons/skill/jj_fight_haoh_quake.png` | 256×256 | 覇王・天地崩し（jin） |
| `icons/skill/jj_fight_legend_aura.png` | 256×256 | レジェンド・オーラ（jin） |
| `icons/skill/jj_fight_haoh_spirit.png` | 256×256 | 覇王の気（jin） |
| `icons/skill/jj_race_burnout.png` | 256×256 | バーンアウト（jin） |
| `icons/skill/jj_race_drift_dash.png` | 256×256 | ドリフト・ダッシュ（jin） |
| `icons/skill/jj_race_mastery.png` | 256×256 | ドライビング・マスタリー（jin） |
| `icons/skill/jj_race_exhaust_flame.png` | 256×256 | エキゾースト・フレイム（jin） |
| `icons/skill/jj_race_turbo.png` | 256×256 | ターボチャージ（jin） |
| `icons/skill/jj_race_booster.png` | 256×256 | ギア・ブースター（jin） |
| `icons/skill/jj_race_wheel_dash.png` | 256×256 | ホイール・ダッシュ（jin） |
| `icons/skill/jj_race_nitro_burst.png` | 256×256 | ニトロ・バースト（jin） |
| `icons/skill/jj_race_slipstream.png` | 256×256 | スリップストリーム（jin） |
| `icons/skill/jj_race_afterburner.png` | 256×256 | アフターバーナー（jin） |
| `icons/skill/jj_race_tailgate.png` | 256×256 | テールゲート（jin） |
| `icons/skill/jj_race_warp_drive.png` | 256×256 | ワープ・ドライブ（jin） |
| `icons/skill/jj_race_meteor_crash.png` | 256×256 | メテオ・クラッシュ（jin） |
| `icons/skill/jj_race_hyperdrive.png` | 256×256 | ハイパードライブ（jin） |
| `icons/skill/hn_logic_bomb.png` | 256×256 | ロジック・ボム（hacker） |
| `icons/skill/hn_data_spike.png` | 256×256 | データ・スパイク（hacker） |
| `icons/skill/hn_code_mastery.png` | 256×256 | コード・マスタリー（hacker） |
| `icons/skill/hn_ddos_storm.png` | 256×256 | DDoSストーム（hacker） |
| `icons/skill/hn_overflow.png` | 256×256 | オーバーフロー（hacker） |
| `icons/skill/hn_booster.png` | 256×256 | クロック・ブースター（hacker） |
| `icons/skill/hn_packet_shift.png` | 256×256 | パケット・シフト（hacker） |
| `icons/skill/hn_blackout.png` | 256×256 | ブラックアウト（hacker） |
| `icons/skill/hn_trojan_lance.png` | 256×256 | トロイの槍（hacker） |
| `icons/skill/hn_ghost_shift.png` | 256×256 | ゴースト・シフト（hacker） |
| `icons/skill/hn_echo_code.png` | 256×256 | エコー・コード（hacker） |
| `icons/skill/hn_singularity.png` | 256×256 | シンギュラリティ（hacker） |
| `icons/skill/hn_omniscience.png` | 256×256 | オムニサイエンス（hacker） |
| `icons/skill/hn_god_mode.png` | 256×256 | ゴッド・モード（hacker） |
| `icons/skill/hd_drone_shot.png` | 256×256 | ドローン・ショット（hacker） |
| `icons/skill/hd_drone_bomb.png` | 256×256 | ドローン・ボム（hacker） |
| `icons/skill/hd_drone_mastery.png` | 256×256 | ドローン・マスタリー（hacker） |
| `icons/skill/hd_missile_pod.png` | 256×256 | ミサイル・ポッド（hacker） |
| `icons/skill/hd_shield_drone.png` | 256×256 | シールド・ドローン（hacker） |
| `icons/skill/hd_booster.png` | 256×256 | スウォーム・ブースター（hacker） |
| `icons/skill/hd_drone_lift.png` | 256×256 | ドローン・リフト（hacker） |
| `icons/skill/hd_carpet_bomb.png` | 256×256 | カーペット・ボム（hacker） |
| `icons/skill/hd_rail_drone.png` | 256×256 | レール・ドローン（hacker） |
| `icons/skill/hd_lift_tuning.png` | 256×256 | リフト・チューニング（hacker） |
| `icons/skill/hd_wingman.png` | 256×256 | ウィングマン（hacker） |
| `icons/skill/hd_orbital_laser.png` | 256×256 | オービタル・レーザー（hacker） |
| `icons/skill/hd_hive_mind.png` | 256×256 | ハイヴ・マインド（hacker） |
| `icons/skill/hd_full_deploy.png` | 256×256 | フル・デプロイ（hacker） |

## ⑯ 乗り物（6枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `vehicles/bike.png` | 1024×512 | ネオンのバイク（スクーター寄りのストリートバイク）の車体 |
| `vehicles/bike_wheel.png` | 256×256 | ネオンのバイク（スクーター寄りのストリートバイク）のタイヤ |
| `vehicles/sports.png` | 1024×512 | 真っ赤なスポーツカー（オープンカー）の車体 |
| `vehicles/sports_wheel.png` | 256×256 | 真っ赤なスポーツカー（オープンカー）のタイヤ |
| `vehicles/police.png` | 1024×512 | パトカー（白黒・屋根に赤青の回転灯）の車体 |
| `vehicles/police_wheel.png` | 256×256 | パトカー（白黒・屋根に赤青の回転灯）のタイヤ |

## ⑰ タイトル・地図（3枚）

| 保存先 | 大きさ | 内容 |
|---|---|---|
| `ui/title_art.png` | 1920×1080 | タイトル画面の絵 |
| `ui/logo.png` | 1600×600 | ロゴ「NEON VICE STORY」 |
| `ui/world_map.png` | 2048×1152 | ワールドマップの絵 |
