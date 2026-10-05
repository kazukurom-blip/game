# 見た目の差し替え仕様（スプライト・オーバーライド）

外部で描いたPNG画像を置くだけで、キャラ・敵・ボス・PETの見た目を差し替えられる仕組み。
画像が無いものは今まで通りコードで描く（手続き描画）にフォールバックする。**一部だけ差し替えてもゲームは動く。**

## フォルダ構成
```
assets/sprites/
  manifest.json            … どの画像があるか・コマ割り・基準点（必須。無ければ全部コード描画）
  enemies/<enemyId>.png    … 敵1種ごと（例 slime_green.png）。無ければ <art>.png（例 slime.png）を探す
  bosses/<enemyId>.png     … ボス（第2形態の行を含められる）
  pets/<style>.png         … PET（例 catPet.png）
  chars/                   … 人型キャラ（重ね合わせ式）
    body_f.png / body_m.png          … 素体（肌は tint で着色可）
    face_f.png / face_m.png          … 目・眉・口（表情ごとの行）
    hair/<style>.png                 … 髪型14種（back / front の2枚に分けてもよい: <style>_back.png, <style>_front.png）
    equip/<slot>/<style>.png         … 装備（hat, top, bottom, shoes, accessory, weapon）
    tear_1.png / tear_2.png / tear_3.png … 服破れの重ね（HP 75/50/25% 以下）
  presets/<name>.png       … 参考用：完成形の1枚絵（ゲームでは使わない）
```

## シートの形式（全種共通）
- 1枚のPNGに **行＝状態、列＝コマ**。セルの大きさは manifest の `cell: [w, h]`（推奨: 人型 160×200、通常の敵 160×160、大型ボス 512×512、PET 96×96。**ゲーム内表示の2倍で描く**）。
- **右向き**で描く（左向きはゲームが反転）。
- 基準点 `anchor: [ax, ay]` ＝ **足元中央**（既定はセルの下端中央から8px上）。
- `scale`: ゲーム内表示倍率（既定 0.5 ＝ 2倍で描いた絵を半分で表示）。
- 背景は透明。

### 状態（行）の名前と推奨コマ数
| 種類 | 行（状態） |
|---|---|
| 人型（各レイヤー共通） | idle(6), walk(8), jump(2), climb(4), attack(6), shoot(4), hurt(2), dead(4), drive(1), sit(1) |
| 敵 | idle(4), walk(6), windup(2), attack(4), hurt(2), dead(4) ［飛ぶ敵は walk の代わりに fly でも可］ |
| ボス | 敵と同じ＋第2形態 idle2, walk2, windup2, attack2（HP50%以下で使用。無ければ通常の行） |
| PET | idle(4), walk(6), fly(4), pick(4) |
| 顔 face | neutral, smile, shout, hurt(> <), happy, jito, angry, sad, wink, blink（各1〜2コマ） |

## manifest.json の例
```json
{
  "version": 1,
  "defaults": { "scale": 0.5, "fps": 8 },
  "enemies": {
    "slime_green": { "file": "enemies/slime_green.png", "cell": [160,160], "anchor": [80,152],
                     "rows": { "idle": 4, "walk": 6, "windup": 2, "attack": 4, "hurt": 2, "dead": 4 }, "fps": 8 }
  },
  "bosses": { "boss_king_slime": { "file": "bosses/boss_king_slime.png", "cell": [512,512], "anchor": [256,500],
              "rows": { "idle": 4, "walk": 6, "windup": 2, "attack": 4, "hurt": 2, "dead": 4, "idle2": 4, "attack2": 4 } } },
  "pets": { "catPet": { "file": "pets/catPet.png", "cell": [96,96], "anchor": [48,90], "rows": { "idle": 4, "walk": 6, "fly": 4, "pick": 4 } } },
  "chars": {
    "enabled": true, "cell": [160,200], "anchor": [80,192],
    "rows": { "idle": 6, "walk": 8, "jump": 2, "climb": 4, "attack": 6, "shoot": 4, "hurt": 2, "dead": 4, "drive": 1, "sit": 1 },
    "layers": {
      "body_f": { "file": "chars/body_f.png", "tint": "skin" },
      "hair:twin": { "file": "chars/hair/twin.png", "tint": "hairColor" },
      "top:hoodie": { "file": "chars/equip/top/hoodie.png", "tint": "color" }
    }
  }
}
```
- `tint`: グレースケールで描いた部分をゲーム側で着色する（`skin` / `hairColor` / `eyeColor` / `color`（装備の主色）/ `accent`）。着色しない（色まで描いた）なら省略。
- `rows` の値はコマ数。行の順番はここに書いた順。

## 人型の重ね順（下 → 上）
hair_back → body → bottom → shoes → top → tear → accessory(背面: wings 等) → face → hair_front → hat → accessory(前面: sunglasses 等) → weapon（攻撃中は手前）
- 足りないレイヤーは描かない。`chars.enabled` が false、または body が無ければ、人型は全部コード描画のまま。
- 服破れは tear_1〜3 を上着・下の上に重ねる（インナーが残る全年齢表現にすること）。

## 優先順位
1. manifest にある画像 → 2. コード描画。
デバッグパネル（F2）の「スプライト/コード描画 切替」で見比べられる。

## テンプレート
`assets/sprites_template/` に、**今のコード描画の絵を同じコマ割りで書き出したシート**（ガイド線つき版と、透明背景版）を置く。上から描き直して同じ名前で `assets/sprites/` に置けば差し替わる。
