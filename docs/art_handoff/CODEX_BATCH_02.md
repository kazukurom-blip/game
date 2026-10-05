# Codex への一括依頼（第2弾）: 敵・NPC用の顔と服

町の人・クエストの人・店の人（約60人）と、敵（チンピラ・警官・SWAT・ボスのドン）を、主人公と同じ部品で組み立てます。部品は、素体＋顔＋前髪＋後ろ髪＋服です。

- 主人公用の第1弾（`CODEX_BATCH_01.md`）の残り（⑤⑥⑦⑧）は、そのまま続けてください。この第2弾は、**第1弾の⑤〜⑧の後**に作ります。
- 共通のルール（向き・大きさ・基準色・関節・納品のしかた）は、第1弾と同じです。顔・髪は `FACE_HAIR_SPEC.md` を見てください。

## ⑨ 悪役の顔・ドン・NPC向けの顔 62枚（各 基本＋表情4枚）

| 保存先（`heads/face/` の下） | 顔立ち | 使う所 |
|---|---|---|
| `m_v01` | 目つきの悪いチンピラ、眉の傷、にやついた口 | チンピラ |
| `m_v02` | 太い眉、四角い顎、威圧的なにらみ | 用心棒・チンピラ |
| `m_v03` | 細い目、ずる賢い笑み、少しこけた頬 | チンピラ・密売人 |
| `m_v04` | きりっとした太い眉、厳しい真顔 | 警官 |
| `m_v05` | 無表情で冷静、鋭い目（ヘルメットの下でも分かる強い目元） | SWAT |
| `m_v06` | 冷酷な幹部、薄い笑み、切れ長の目 | 幹部・中ボス |
| `f_v01` | 強気な女ギャング、つり目、片方の口角が上がる | 女のチンピラ |
| `f_v02` | 凛とした女警官、まっすぐな眉 | 女警官 |
| `m_don` | **ボスのドン**。中年、太い眉、左頬に古い傷、口ひげ、威厳のある笑み、目元のしわ | ボスのドン専用 |
| `m_o01` | 優しいおじいさん、目尻のしわ、白い眉 | 老人のNPC |
| `m_o02` | 頑固なおじいさん、への字口、太い白眉 | 老人のNPC |
| `f_o01` | 穏やかなおばあさん、目尻のしわ、ほほえみ | 老人のNPC |

**表情4枚**（`_blink` / `_hurt` / `_shout` / `_happy`）
- 悪役の `_happy` は「勝ち誇った笑み」で構いません。
- 輪郭は、♂は `m_01`、♀は `f_01` と同じにします。
- ただし `m_don` と老人の顔は、輪郭（顎・頬）を少し変えて構いません。生え際・耳の位置は同じにしてください。
- しわ・傷・ひげは、肌の基準色 `#ffe3d3` / `#f6d5be` の濃淡と線で描きます。ゲームが肌の色を塗り替えるためです。

**ドンの髪型 2枚**
- `heads/hair/m_slick.png` / `m_slick_back.png`
- オールバック（後ろへなでつけた髪）です。基準色 `#b07850` で描いてください（ゲームが白髪交じりのグレーに塗り替えます）。

## ⑩ 敵・NPCが着る服・武器 56枚

`HERO_PARTS_LIST.csv` に、同じファイル名で細かい指示文があります。下敷きは、♀は `rig/body_f.png`、♂は `rig/body_m.png` です。

| 保存先（`assets/sprites/` の下） | 内容 | 描く枠 | 基準色（主 / アクセント） |
|---|---|---|---|
| `rig/top/suit_f.png` | 上着：スーツのジャケット（♀） | 胴・奥の腕・手前の腕 | `#15151b` / `#d8283c` |
| `rig/top/suit_m.png` | 上着：スーツのジャケット（♂） | 胴・奥の腕・手前の腕 | `#15151b` / `#d8283c` |
| `rig/top/armorVest_f.png` | 上着：タクティカルベスト（♀） | 胴・奥の腕・手前の腕 | `#3b4231` / `#9aa07a` |
| `rig/top/armorVest_m.png` | 上着：タクティカルベスト（♂） | 胴・奥の腕・手前の腕 | `#3b4231` / `#9aa07a` |
| `rig/top/police_f.png` | 上着：警官の制服シャツ（♀） | 胴・奥の腕・手前の腕 | `#20335c` / `#ffd23f` |
| `rig/top/police_m.png` | 上着：警官の制服シャツ（♂） | 胴・奥の腕・手前の腕 | `#20335c` / `#ffd23f` |
| `rig/top/tank_f.png` | 上着：タンクトップ（♀） | 胴 | `#222228` / `#ffd23f` |
| `rig/top/tank_m.png` | 上着：タンクトップ（♂） | 胴 | `#222228` / `#ffd23f` |
| `rig/top/hawaiian_f.png` | 上着：アロハシャツ（♀） | 胴・奥の腕・手前の腕 | `#ff8a00` / `#19d3a0` |
| `rig/top/hawaiian_m.png` | 上着：アロハシャツ（♂） | 胴・奥の腕・手前の腕 | `#ff8a00` / `#19d3a0` |
| `rig/top/tracksuit_f.png` | 上着：ジャージの上着（♀） | 胴・奥の腕・手前の腕 | `#1fae5b` / `#ffffff` |
| `rig/top/tracksuit_m.png` | 上着：ジャージの上着（♂） | 胴・奥の腕・手前の腕 | `#1fae5b` / `#ffffff` |
| `rig/top/idolDress_f.png` | 上着：アイドルのステージドレス（♀） | 胴・奥の腕・手前の腕 | `#ff6fb5` / `#fff06a` |
| `rig/top/idolDress_m.png` | 上着：アイドルのステージドレス（♂） | 胴・奥の腕・手前の腕 | `#ff6fb5` / `#fff06a` |
| `rig/bottom/suitPants_f.png` | 下：スーツのズボン（♀） | 胴・奥の脚・手前の脚 | `#15151b` / `#5a5a66` |
| `rig/bottom/suitPants_m.png` | 下：スーツのズボン（♂） | 胴・奥の脚・手前の脚 | `#15151b` / `#5a5a66` |
| `rig/bottom/cargo_f.png` | 下：カーゴパンツ（♀） | 胴・奥の脚・手前の脚 | `#8a7a52` / `#4a4232` |
| `rig/bottom/cargo_m.png` | 下：カーゴパンツ（♂） | 胴・奥の脚・手前の脚 | `#8a7a52` / `#4a4232` |
| `rig/bottom/armorPants_f.png` | 下：タクティカルパンツ（♀） | 胴・奥の脚・手前の脚 | `#3b4231` / `#9aa07a` |
| `rig/bottom/armorPants_m.png` | 下：タクティカルパンツ（♂） | 胴・奥の脚・手前の脚 | `#3b4231` / `#9aa07a` |
| `rig/bottom/shorts_m.png` | 下：短パン（♂） | 胴・奥の脚・手前の脚 | `#4d6fb5` / `#ffffff` |
| `rig/shoes/loafers_f.png` | 靴：ローファー（♀） | 奥の足・手前の足 | `#5a3a22` / `#c9a26a` |
| `rig/shoes/loafers_m.png` | 靴：ローファー（♂） | 奥の足・手前の足 | `#5a3a22` / `#c9a26a` |
| `rig/shoes/heels_f.png` | 靴：ヒール（♀） | 奥の足・手前の足 | `#d8283c` / `#ffd23f` |
| `rig/shoes/heels_m.png` | 靴：ヒール（♂） | 奥の足・手前の足 | `#d8283c` / `#ffd23f` |
| `rig/shoes/sandals_f.png` | 靴：ビーチサンダル（♀） | 奥の足・手前の足 | `#ffd23f` / `#19d3a0` |
| `rig/shoes/sandals_m.png` | 靴：ビーチサンダル（♂） | 奥の足・手前の足 | `#ffd23f` / `#19d3a0` |
| `rig/hat/cowboy_f.png` | 帽子：カウボーイハット（♀） | 頭の物 | `#8a5a2b` / `#e8c27a` |
| `rig/hat/cowboy_m.png` | 帽子：カウボーイハット（♂） | 頭の物 | `#8a5a2b` / `#e8c27a` |
| `rig/hat/helmet_f.png` | 帽子：バイクのヘルメット（♀） | 頭の物 | `#16161e` / `#ff8a00` |
| `rig/hat/helmet_m.png` | 帽子：バイクのヘルメット（♂） | 頭の物 | `#16161e` / `#ff8a00` |
| `rig/hat/beanie_f.png` | 帽子：ニット帽（♀） | 頭の物 | `#7a7f8c` / `#c9ccd6` |
| `rig/hat/beanie_m.png` | 帽子：ニット帽（♂） | 頭の物 | `#7a7f8c` / `#c9ccd6` |
| `rig/hat/bandana_f.png` | 帽子：バンダナ（♀） | 頭の物 | `#d8283c` / `#ffffff` |
| `rig/hat/bandana_m.png` | 帽子：バンダナ（♂） | 頭の物 | `#d8283c` / `#ffffff` |
| `rig/hat/crown_f.png` | 帽子：王冠（♀） | 頭の物 | `#ffd23f` / `#ff3d7f` |
| `rig/hat/crown_m.png` | 帽子：王冠（♂） | 頭の物 | `#ffd23f` / `#ff3d7f` |
| `rig/hat/cap_f.png` | 帽子：キャップ（♀） | 頭の物 | `#2b2b38` / `#ff3d7f` |
| `rig/hat/catEars_m.png` | 帽子：ネコミミのカチューシャ（♂） | 頭の物 | `#ff8ac8` / `#ffe0f0` |
| `rig/hat/headphones_m.png` | 帽子：ヘッドホン（♂） | 頭の物 | `#2b2b38` / `#3dff8a` |
| `rig/accessory/sunglasses_f.png` | アクセサリ：サングラス（♀） | 頭の物 | `#2a2a2a` / `#ffd23f` |
| `rig/accessory/sunglasses_m.png` | アクセサリ：サングラス（♂） | 頭の物 | `#2a2a2a` / `#ffd23f` |
| `rig/accessory/goldChain_f.png` | アクセサリ：金のチェーンネックレス（♀） | 胴 | `#ffd23f` / `#fff4b0` |
| `rig/accessory/goldChain_m.png` | アクセサリ：金のチェーンネックレス（♂） | 胴 | `#ffd23f` / `#fff4b0` |
| `rig/accessory/mask_f.png` | アクセサリ：スカルのフェイスマスク（♀） | 頭の物 | `#e8e8e8` / `#16161e` |
| `rig/accessory/mask_m.png` | アクセサリ：スカルのフェイスマスク（♂） | 頭の物 | `#e8e8e8` / `#16161e` |
| `rig/accessory/scarf_f.png` | アクセサリ：スカーフ（♀） | 胴・背中 | `#d8283c` / `#ffffff` |
| `rig/accessory/scarf_m.png` | アクセサリ：スカーフ（♂） | 胴・背中 | `#d8283c` / `#ffffff` |
| `rig/accessory/halo_f.png` | アクセサリ：天使の輪（♀） | 頭の物 | `#fff06a` / `#ffffff` |
| `rig/accessory/halo_m.png` | アクセサリ：天使の輪（♂） | 頭の物 | `#fff06a` / `#ffffff` |
| `rig/accessory/wings_f.png` | アクセサリ：天使の翼（♀） | 背中 | `#ffffff` / `#bff6ff` |
| `rig/accessory/wings_m.png` | アクセサリ：天使の翼（♂） | 背中 | `#ffffff` / `#bff6ff` |
| `rig/weapon/pistol.png` | 武器：ピストル | 武器の枠 | `#2a2a30` / `#8a8a8a` |
| `rig/weapon/smg.png` | 武器：サブマシンガン | 武器の枠 | `#1d1d24` / `#ff8a00` |
| `rig/weapon/katana.png` | 武器：刀 | 武器の枠 | `#dfe4ee` / `#d8283c` |
| `rig/weapon/guitar.png` | 武器：エレキギター | 武器の枠 | `#d8283c` / `#f4f4f4` |

- ドンは、スーツ（`suit_m`）・スーツのズボン（`suitPants_m`）・革靴（`loafers_m`）・金のネックレス（`goldChain_m`）・サングラス（`sunglasses_m`）を着ます。ドン専用の色はゲームが塗り替えます。
- 武器（`pistol`・`smg`・`katana`・`guitar`）は、1024×512 で持ち手にマゼンタ `#FF00FF` の印を付けてください。

**合計: 118枚**（⑨ 62枚・⑩ 56枚）。

**優先順:**
1. ⑨のドン（`m_don`＋表情、`m_slick`）
2. 悪役の顔
3. ⑩の敵の服（スーツ・タクティカルベスト・警官の制服・ヘルメット・ピストル・SMG）
4. 残り
