# ABYSS DROP — AI で画像を作るための指示文（全部の枠）

> このファイルは `node tools/gen_prompts.mjs` で自動で作っています（手で直さない）。表計算ソフトで扱うなら `docs/AI_PROMPTS.csv`。
> 使い方・差し替えの手順は [docs/ASSETS.md](ASSETS.md)。ゲームの「画像」の窓の「AI で作る」からも同じ文をコピーできます。

枠の数: **205**（主人公 30・装備（着た姿） 41・敵・ボス 8・召喚物・ペット 4・スキルの演出 31・アイコン 59・背景 30・画面の飾り 2）

## 1. すべての指示文に入っている決まり

画風をそろえるため、下の「画風の決まり文」を毎回そのまま入れています（途中で変えない）。

| 種類 | 英語 | 日本語 |
|---|---|---|
| キャラ・装備・アイコン | hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above | 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光 |
| 光の演出（fx.*） | hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon) | 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない） |
| 背景（bg.*・タイトル） | hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light | 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光 |

- 否定のプロンプト（Stable Diffusion・NovelAI）: `text, letters, watermark, signature, logo, frame, border, ground, floor, cast shadow, reflection, multiple subjects, cropped, out of frame, blurry, lowres, jpeg artifacts, photo, 3d render, gradient background, scenery`
- 向き: 主人公・召喚物・ペットは**右向き**、敵・ボスは**左向き**、武器は**先が上・柄が下**。逆に出たら画像の窓の「左右反転」で直せます。
- 背景: キャラ・装備・アイコンは**透明**（ChatGPT／GPT Image の透明背景）。透明にできない AI では**ムラのない単色の緑 #00FF00**（体が緑の敵はマゼンタ #FF00FF）にすると、画像の窓が自動で抜きます。光の演出は**真っ黒**（加算で黒が消える）。
- 既存のゲーム・アニメ・キャラ・作家の名前は入れないでください（似せた絵は権利の問題になります）。

### AI ごとの使い方

| AI | 使う文 | 大きさ | メモ |
|---|---|---|---|
| ChatGPT／GPT Image | 英語か日本語 | 各枠の「GPT」 | API なら `background: "transparent"`・`output_format: "png"`。透明背景が使える |
| Midjourney／Niji | Midjourney の文（CSV） | `--ar` が入っている | 背景は単色になるので、画像の窓で「背景を抜く」 |
| Stable Diffusion（SDXL 系） | 英語＋否定 | 各枠の「SDXL」 | シードを固定すると同じ画風で量産しやすい |
| FLUX | 英語 | 各枠の「FLUX」 | 否定の文は使えない。英語の文に背景の色が入っている |
| NovelAI | 英語（タグに直してもよい）＋否定 | SDXL と同じ | 画像の透明チャンネルに情報が入っているので、透明に見えても「背景を抜く」を試す |

## 2. 枠ごとの指示文

- [主人公（30）](#cat-hero)
- [装備（着た姿）（41）](#cat-gear)
- [敵・ボス（8）](#cat-monster)
- [召喚物・ペット（4）](#cat-minion)
- [スキルの演出（31）](#cat-fx)
- [アイコン（59）](#cat-icon)
- [背景（30）](#cat-bg)
- [画面の飾り（2）](#cat-ui)

<a id="cat-hero"></a>
### 主人公（30 枠）

体・鎧を着た姿・クラス選択の立ち絵。

#### 剣闘士

##### `hero.warrior.body` — 剣闘士（体・基本の服）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 1 枚の絵を傾けたり揺らしたりして動かします。手は武器を持つ位置（アンカー「手」）に合わせてください

```text
Create ONE full-body character sprite for a side-scrolling 2D action RPG. Character: a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents, wearing simple base clothes, empty hands closed into fists ready to hold a weapon (the game attaches weapons separately). Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用に、全身のキャラクター画像を1体だけ作ってください。キャラ: 「剣闘士」歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色。簡素な基本の服。手は何も持たず、武器を握れる形の握り拳（武器はゲームが別に持たせる）。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.warrior.outfit.cloth` — 剣闘士（布の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.warrior.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に布の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to layered cloth robes and wraps. Character: a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「布」の装備＝重ね着した布の衣と巻き布に変える。キャラ: 「剣闘士」歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.warrior.outfit.leather` — 剣闘士（革の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.warrior.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に革の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to fitted leather armor with straps and buckles. Character: a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「革」の装備＝ベルトと留め金のついた体に合う革鎧に変える。キャラ: 「剣闘士」歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.warrior.outfit.mail` — 剣闘士（鎖の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.warrior.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に鎖の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to a chainmail hauberk with leather pauldrons. Character: a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「鎖」の装備＝革の肩当てつきの鎖帷子に変える。キャラ: 「剣闘士」歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.warrior.outfit.plate` — 剣闘士（板金の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.warrior.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に板金の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to full steel plate armor with engraved edges. Character: a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「板金」の装備＝縁に彫りのある全身の鋼の板金鎧に変える。キャラ: 「剣闘士」歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.warrior.portrait` — 剣闘士（立ち絵・クラス選択の画面）

- ゲーム内 300×420（比 3:4）・基準点 (0.5, 1)・右向き・背景 画面いっぱいの風景
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 背景つきの 1 枚絵でかまいません

```text
A dramatic character select portrait illustration of a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents, knees-up three-quarter view, heroic pose, rim light, dark atmospheric background with drifting ash. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
クラス選択画面の立ち絵。「剣闘士」歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色。膝から上、3/4 の角度、勇ましいポーズ、縁の光、灰が舞う暗い背景。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 狩人

##### `hero.ranger.body` — 狩人（体・基本の服）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 1 枚の絵を傾けたり揺らしたりして動かします。手は武器を持つ位置（アンカー「手」）に合わせてください

```text
Create ONE full-body character sprite for a side-scrolling 2D action RPG. Character: a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest, wearing simple base clothes, empty hands closed into fists ready to hold a weapon (the game attaches weapons separately). Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用に、全身のキャラクター画像を1体だけ作ってください。キャラ: 「狩人」フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト。簡素な基本の服。手は何も持たず、武器を握れる形の握り拳（武器はゲームが別に持たせる）。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.ranger.outfit.cloth` — 狩人（布の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.ranger.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に布の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to layered cloth robes and wraps. Character: a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「布」の装備＝重ね着した布の衣と巻き布に変える。キャラ: 「狩人」フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.ranger.outfit.leather` — 狩人（革の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.ranger.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に革の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to fitted leather armor with straps and buckles. Character: a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「革」の装備＝ベルトと留め金のついた体に合う革鎧に変える。キャラ: 「狩人」フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.ranger.outfit.mail` — 狩人（鎖の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.ranger.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に鎖の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to a chainmail hauberk with leather pauldrons. Character: a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「鎖」の装備＝革の肩当てつきの鎖帷子に変える。キャラ: 「狩人」フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.ranger.outfit.plate` — 狩人（板金の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.ranger.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に板金の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to full steel plate armor with engraved edges. Character: a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「板金」の装備＝縁に彫りのある全身の鋼の板金鎧に変える。キャラ: 「狩人」フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.ranger.portrait` — 狩人（立ち絵・クラス選択の画面）

- ゲーム内 300×420（比 3:4）・基準点 (0.5, 1)・右向き・背景 画面いっぱいの風景
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 背景つきの 1 枚絵でかまいません

```text
A dramatic character select portrait illustration of a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest, knees-up three-quarter view, heroic pose, rim light, dark atmospheric background with drifting ash. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
クラス選択画面の立ち絵。「狩人」フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト。膝から上、3/4 の角度、勇ましいポーズ、縁の光、灰が舞う暗い背景。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 魔導士

##### `hero.sorcerer.body` — 魔導士（体・基本の服）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 1 枚の絵を傾けたり揺らしたりして動かします。手は武器を持つ位置（アンカー「手」）に合わせてください

```text
Create ONE full-body character sprite for a side-scrolling 2D action RPG. Character: a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves, wearing simple base clothes, empty hands closed into fists ready to hold a weapon (the game attaches weapons separately). Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用に、全身のキャラクター画像を1体だけ作ってください。キャラ: 「魔導士」流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋。簡素な基本の服。手は何も持たず、武器を握れる形の握り拳（武器はゲームが別に持たせる）。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.sorcerer.outfit.cloth` — 魔導士（布の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.sorcerer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に布の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to layered cloth robes and wraps. Character: a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「布」の装備＝重ね着した布の衣と巻き布に変える。キャラ: 「魔導士」流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.sorcerer.outfit.leather` — 魔導士（革の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.sorcerer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に革の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to fitted leather armor with straps and buckles. Character: a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「革」の装備＝ベルトと留め金のついた体に合う革鎧に変える。キャラ: 「魔導士」流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.sorcerer.outfit.mail` — 魔導士（鎖の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.sorcerer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に鎖の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to a chainmail hauberk with leather pauldrons. Character: a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「鎖」の装備＝革の肩当てつきの鎖帷子に変える。キャラ: 「魔導士」流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.sorcerer.outfit.plate` — 魔導士（板金の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.sorcerer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に板金の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to full steel plate armor with engraved edges. Character: a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「板金」の装備＝縁に彫りのある全身の鋼の板金鎧に変える。キャラ: 「魔導士」流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.sorcerer.portrait` — 魔導士（立ち絵・クラス選択の画面）

- ゲーム内 300×420（比 3:4）・基準点 (0.5, 1)・右向き・背景 画面いっぱいの風景
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 背景つきの 1 枚絵でかまいません

```text
A dramatic character select portrait illustration of a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves, knees-up three-quarter view, heroic pose, rim light, dark atmospheric background with drifting ash. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
クラス選択画面の立ち絵。「魔導士」流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋。膝から上、3/4 の角度、勇ましいポーズ、縁の光、灰が舞う暗い背景。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 死霊術師

##### `hero.necromancer.body` — 死霊術師（体・基本の服）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 1 枚の絵を傾けたり揺らしたりして動かします。手は武器を持つ位置（アンカー「手」）に合わせてください

```text
Create ONE full-body character sprite for a side-scrolling 2D action RPG. Character: a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes, wearing simple base clothes, empty hands closed into fists ready to hold a weapon (the game attaches weapons separately). Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用に、全身のキャラクター画像を1体だけ作ってください。キャラ: 「死霊術師」やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光。簡素な基本の服。手は何も持たず、武器を握れる形の握り拳（武器はゲームが別に持たせる）。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.necromancer.outfit.cloth` — 死霊術師（布の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.necromancer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に布の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to layered cloth robes and wraps. Character: a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「布」の装備＝重ね着した布の衣と巻き布に変える。キャラ: 「死霊術師」やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.necromancer.outfit.leather` — 死霊術師（革の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.necromancer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に革の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to fitted leather armor with straps and buckles. Character: a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「革」の装備＝ベルトと留め金のついた体に合う革鎧に変える。キャラ: 「死霊術師」やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.necromancer.outfit.mail` — 死霊術師（鎖の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.necromancer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に鎖の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to a chainmail hauberk with leather pauldrons. Character: a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「鎖」の装備＝革の肩当てつきの鎖帷子に変える。キャラ: 「死霊術師」やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.necromancer.outfit.plate` — 死霊術師（板金の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.necromancer.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に板金の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to full steel plate armor with engraved edges. Character: a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「板金」の装備＝縁に彫りのある全身の鋼の板金鎧に変える。キャラ: 「死霊術師」やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.necromancer.portrait` — 死霊術師（立ち絵・クラス選択の画面）

- ゲーム内 300×420（比 3:4）・基準点 (0.5, 1)・右向き・背景 画面いっぱいの風景
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 背景つきの 1 枚絵でかまいません

```text
A dramatic character select portrait illustration of a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes, knees-up three-quarter view, heroic pose, rim light, dark atmospheric background with drifting ash. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
クラス選択画面の立ち絵。「死霊術師」やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光。膝から上、3/4 の角度、勇ましいポーズ、縁の光、灰が舞う暗い背景。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 影刃

##### `hero.assassin.body` — 影刃（体・基本の服）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 1 枚の絵を傾けたり揺らしたりして動かします。手は武器を持つ位置（アンカー「手」）に合わせてください

```text
Create ONE full-body character sprite for a side-scrolling 2D action RPG. Character: an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture, wearing simple base clothes, empty hands closed into fists ready to hold a weapon (the game attaches weapons separately). Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用に、全身のキャラクター画像を1体だけ作ってください。キャラ: 「影刃」身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢。簡素な基本の服。手は何も持たず、武器を握れる形の握り拳（武器はゲームが別に持たせる）。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.assassin.outfit.cloth` — 影刃（布の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.assassin.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に布の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to layered cloth robes and wraps. Character: an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「布」の装備＝重ね着した布の衣と巻き布に変える。キャラ: 「影刃」身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.assassin.outfit.leather` — 影刃（革の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.assassin.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に革の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to fitted leather armor with straps and buckles. Character: an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「革」の装備＝ベルトと留め金のついた体に合う革鎧に変える。キャラ: 「影刃」身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.assassin.outfit.mail` — 影刃（鎖の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.assassin.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に鎖の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to a chainmail hauberk with leather pauldrons. Character: an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「鎖」の装備＝革の肩当てつきの鎖帷子に変える。キャラ: 「影刃」身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.assassin.outfit.plate` — 影刃（板金の鎧を着た姿）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）・無ければ hero.assassin.body
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 胴に板金の鎧を着たときの全身。無ければ「体」の画像を使います

```text
Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to full steel plate armor with engraved edges. Character: an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture. Empty hands closed into fists. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「板金」の装備＝縁に彫りのある全身の鋼の板金鎧に変える。キャラ: 「影刃」身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢。手は何も持たない握り拳。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `hero.assassin.portrait` — 影刃（立ち絵・クラス選択の画面）

- ゲーム内 300×420（比 3:4）・基準点 (0.5, 1)・右向き・背景 画面いっぱいの風景
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 背景つきの 1 枚絵でかまいません

```text
A dramatic character select portrait illustration of an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture, knees-up three-quarter view, heroic pose, rim light, dark atmospheric background with drifting ash. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
クラス選択画面の立ち絵。「影刃」身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢。膝から上、3/4 の角度、勇ましいポーズ、縁の光、灰が舞う暗い背景。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

<a id="cat-gear"></a>
### 装備（着た姿）（41 枠）

手に持つ武器・副手・兜・ユニークの見た目。

#### 武器

##### `gear.sword` — 片手剣（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One one-handed longsword as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
片手剣（one-handed longsword）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.axe` — 斧（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One one-handed battle axe as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
斧（one-handed battle axe）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.mace` — 槌（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One flanged war mace as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
槌（flanged war mace）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.greatsword` — 両手剣（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One huge two-handed greatsword as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
両手剣（huge two-handed greatsword）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.bow` — 弓（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One recurve longbow as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: seen from the side, held vertically as if aiming to the right, the grip at the center. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
弓（recurve longbow）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: 横から見て縦に構えた形（右へ狙う向き）、握りが中央。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.crossbow` — 弩（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One heavy crossbow as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: seen from the side, held vertically as if aiming to the right, the grip at the center. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
弩（heavy crossbow）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: 横から見て縦に構えた形（右へ狙う向き）、握りが中央。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.staff` — 杖（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One tall wooden mage staff topped with a glowing crystal as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
杖（tall wooden mage staff topped with a glowing crystal）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.wand` — 短杖（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One short carved magic wand as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
短杖（short carved magic wand）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.scythe` — 大鎌（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One large reaper scythe as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
大鎌（large reaper scythe）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.rod` — 骨杖（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One bone rod with a small skull ornament as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
骨杖（bone rod with a small skull ornament）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.dagger` — 短剣（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One curved dagger as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
短剣（curved dagger）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.claw` — 鉤爪（手に持った姿）

- ゲーム内 110×150（比 3:4）・基準点 (0.5, 0.82)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます

```text
One katar-style punching claw blade as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand. Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鉤爪（katar-style punching claw blade）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 副手

##### `gear.shield` — 盾（副手）

- ゲーム内 90×110（比 3:4）・基準点 (0.5, 0.55)・正面・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 基準点は持つ所（取っ手）

```text
One heater shield with metal rim as a standalone 2D game equipment sprite carried in the off hand. No hands, no character. Orientation: seen from the front. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
盾を1つだけ、副手に持つ装備の単体画像として描いてください。手・キャラなし。向き: 正面から。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.quiver` — 矢筒（副手）

- ゲーム内 90×110（比 3:4）・基準点 (0.5, 0.55)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 基準点は持つ所（取っ手）

```text
One leather quiver full of arrows as a standalone 2D game equipment sprite carried in the off hand. No hands, no character. Orientation: side view, upright. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
矢筒を1つだけ、副手に持つ装備の単体画像として描いてください。手・キャラなし。向き: 横から見て立てた形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.orb` — 宝珠（副手）

- ゲーム内 90×110（比 3:4）・基準点 (0.5, 0.55)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 基準点は持つ所（取っ手）

```text
One floating arcane orb in a metal cradle as a standalone 2D game equipment sprite carried in the off hand. No hands, no character. Orientation: side view, upright. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
宝珠を1つだけ、副手に持つ装備の単体画像として描いてください。手・キャラなし。向き: 横から見て立てた形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.grimoire` — 魔導書（副手）

- ゲーム内 90×110（比 3:4）・基準点 (0.5, 0.55)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 基準点は持つ所（取っ手）

```text
One leather-bound grimoire with metal corners as a standalone 2D game equipment sprite carried in the off hand. No hands, no character. Orientation: side view, upright. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
魔導書を1つだけ、副手に持つ装備の単体画像として描いてください。手・キャラなし。向き: 横から見て立てた形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.offblade` — 副刀（副手）

- ゲーム内 90×110（比 3:4）・基準点 (0.5, 0.55)・上向き（柄が下）・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 基準点は持つ所（取っ手）

```text
One short offhand parrying blade as a standalone 2D game equipment sprite carried in the off hand. No hands, no character. Orientation: side view, upright. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
副刀を1つだけ、副手に持つ装備の単体画像として描いてください。手・キャラなし。向き: 横から見て立てた形。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 兜

##### `gear.helm.cloth` — 布の兜

- ゲーム内 80×70（比 1:1）・基準点 (0.5, 0.72)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 体の「頭」のアンカーに重ねます（体を差し替えたときは描かれません）

```text
One cloth hood (layered cloth robes and wraps) as a standalone 2D game sprite, seen from the side facing RIGHT, as it would sit on a head. No head inside, no character. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
布の兜（重ね着した布の衣と巻き布の頭の装備）を1つ。頭にかぶった時の形で、真横から見て右向き。中に頭は描かない。キャラなし。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.helm.leather` — 革の兜

- ゲーム内 80×70（比 1:1）・基準点 (0.5, 0.72)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 体の「頭」のアンカーに重ねます（体を差し替えたときは描かれません）

```text
One leather helmet (fitted leather armor with straps and buckles) as a standalone 2D game sprite, seen from the side facing RIGHT, as it would sit on a head. No head inside, no character. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
革の兜（ベルトと留め金のついた体に合う革鎧の頭の装備）を1つ。頭にかぶった時の形で、真横から見て右向き。中に頭は描かない。キャラなし。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.helm.mail` — 鎖の兜

- ゲーム内 80×70（比 1:1）・基準点 (0.5, 0.72)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 体の「頭」のアンカーに重ねます（体を差し替えたときは描かれません）

```text
One mail helmet (a chainmail hauberk with leather pauldrons) as a standalone 2D game sprite, seen from the side facing RIGHT, as it would sit on a head. No head inside, no character. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鎖の兜（革の肩当てつきの鎖帷子の頭の装備）を1つ。頭にかぶった時の形で、真横から見て右向き。中に頭は描かない。キャラなし。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.helm.plate` — 板金の兜

- ゲーム内 80×70（比 1:1）・基準点 (0.5, 0.72)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 体の「頭」のアンカーに重ねます（体を差し替えたときは描かれません）

```text
One plate helmet (full steel plate armor with engraved edges) as a standalone 2D game sprite, seen from the side facing RIGHT, as it would sit on a head. No head inside, no character. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
板金の兜（縁に彫りのある全身の鋼の板金鎧の頭の装備）を1つ。頭にかぶった時の形で、真横から見て右向き。中に頭は描かない。キャラなし。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 鎧の部品

##### `gear.chest.cloth` — 布の鎧（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The chest armor piece only of layered cloth robes and wraps, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
布の鎧の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.chest.leather` — 革の鎧（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The chest armor piece only of fitted leather armor with straps and buckles, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
革の鎧の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.chest.mail` — 鎖の鎧（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The chest armor piece only of a chainmail hauberk with leather pauldrons, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鎖の鎧の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.chest.plate` — 板金の鎧（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The chest armor piece only of full steel plate armor with engraved edges, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
板金の鎧の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.gloves.cloth` — 布の手甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The gauntlets piece only of layered cloth robes and wraps, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
布の手甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.gloves.leather` — 革の手甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The gauntlets piece only of fitted leather armor with straps and buckles, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
革の手甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.gloves.mail` — 鎖の手甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The gauntlets piece only of a chainmail hauberk with leather pauldrons, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鎖の手甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.gloves.plate` — 板金の手甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The gauntlets piece only of full steel plate armor with engraved edges, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
板金の手甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.belt.cloth` — 布の帯（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored belt piece only of layered cloth robes and wraps, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
布の帯の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.belt.leather` — 革の帯（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored belt piece only of fitted leather armor with straps and buckles, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
革の帯の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.belt.mail` — 鎖の帯（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored belt piece only of a chainmail hauberk with leather pauldrons, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鎖の帯の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.belt.plate` — 板金の帯（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored belt piece only of full steel plate armor with engraved edges, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
板金の帯の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.legs.cloth` — 布の脚甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The leg armor piece only of layered cloth robes and wraps, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
布の脚甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.legs.leather` — 革の脚甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The leg armor piece only of fitted leather armor with straps and buckles, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
革の脚甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.legs.mail` — 鎖の脚甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The leg armor piece only of a chainmail hauberk with leather pauldrons, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鎖の脚甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.legs.plate` — 板金の脚甲（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The leg armor piece only of full steel plate armor with engraved edges, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
板金の脚甲の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.boots.cloth` — 布の靴（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored boots piece only of layered cloth robes and wraps, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
布の靴の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.boots.leather` — 革の靴（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored boots piece only of fitted leather armor with straps and buckles, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
革の靴の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.boots.mail` — 鎖の靴（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored boots piece only of a chainmail hauberk with leather pauldrons, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
鎖の靴の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `gear.boots.plate` — 板金の靴（重ね着の部品）

- ゲーム内 150×200（比 3:4）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1536／SDXL 896×1152／FLUX 896×1184／Midjourney `--ar 3:4`
- メモ: 体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う

```text
The armored boots piece only of full steel plate armor with engraved edges, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent. Framing: the whole item is visible and centered with an 8% margin. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
板金の靴の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。構図: 全体が入るよう中央に置き、余白は 8%。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

<a id="cat-monster"></a>
### 敵・ボス（8 枠）

章ごとの敵とボス（左向き）。

#### 第一章

##### `monster.rot_zombie` — 敵「腐れ屍」

- ゲーム内 150×150（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色のマゼンタ #FF00FF）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE monster sprite for a side-scrolling 2D action RPG: an undead humanoid creature (rot zombie), dripping with toxic venom, muted green body with dark green shading, glowing light yellow eyes. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid magenta #FF00FF background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の敵の画像を1体: 「腐れ屍」（不死・人型）。毒のしたたる。体はくすんだ緑、影や服は暗い緑、目は光る明るい黄色。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色のマゼンタ（#FF00FF）にする（体が緑なので緑は使わない）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.ash_wolf` — 敵「灰狼」

- ゲーム内 150×150（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE monster sprite for a side-scrolling 2D action RPG: a four-legged beast (ash wolf), ash-gray, feral, gray body with dark gray shading, glowing red eyes. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の敵の画像を1体: 「灰狼」（獣・四足の獣）。灰色の・獣のような。体は灰色、影や服は濃い灰色、目は光る赤。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.grave_bat` — 敵「墓場の蝙蝠」

- ゲーム内 150×150（比 1:1）・基準点 (0.5, 0.6)・左向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 飛ぶ敵。基準点は体の中心あたり

```text
Create ONE monster sprite for a side-scrolling 2D action RPG: a beast winged flying creature (grave bat), dark purple body with very dark purple shading, glowing red eyes. Pose: strict side view, facing LEFT, hovering in mid-air. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の敵の画像を1体: 「墓場の蝙蝠」（獣・翼で飛ぶ生き物）。体は暗い紫、影や服はとても暗い紫、目は光る赤。向き: 完全な真横で画面の左を向き、宙に浮いている。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.bone_archer` — 敵「骸骨の射手」

- ゲーム内 150×150（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE monster sprite for a side-scrolling 2D action RPG: an undead humanoid creature (bone archer), made of carved bone, pale yellow body with brown shading, glowing light cyan eyes. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の敵の画像を1体: 「骸骨の射手」（不死・人型）。骨でできた。体は淡い黄色、影や服は茶色、目は光る明るい水色。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.bog_slime` — 敵「沼の粘体」

- ゲーム内 150×150（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色のマゼンタ #FF00FF）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE monster sprite for a side-scrolling 2D action RPG: an aberrant slime blob creature (bog slime), green body with dark green shading, glowing black eyes. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid magenta #FF00FF background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の敵の画像を1体: 「沼の粘体」（異形・粘体）。体は緑、影や服は暗い緑、目は光る黒。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色のマゼンタ（#FF00FF）にする（体が緑なので緑は使わない）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.cultist` — 敵「灰の信徒」

- ゲーム内 150×150（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE monster sprite for a side-scrolling 2D action RPG: a human robed spellcaster (cultist), ash-gray, brown body with dark brown shading, glowing orange eyes, orange and red fire magic. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の敵の画像を1体: 「灰の信徒」（人・ローブの術者）。灰色の。体は茶色、影や服はこげ茶、目は光る橙。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.boss_butcher` — ボス「肉屋のグロム」

- ゲーム内 240×240（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE boss monster sprite for a side-scrolling 2D action RPG: an imposing boss undead hulking brute humanoid (butcher), brown body with dark brown shading, glowing red eyes. Larger, more ornate and threatening than normal enemies, with a crown, trophies or an aura. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用のボスの画像を1体: 「肉屋のグロム」（不死・大柄な人型）。体は茶色、影や服はこげ茶、目は光る赤。ボスらしく大きく、豪華で恐ろしく。冠・戦利品・オーラなど。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `monster.boss_ashlord` — ボス「灰の司祭ヴォルク」

- ゲーム内 240×240（比 1:1）・基準点 (0.5, 0.97)・左向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 左向き（主人公の方を向く）。右向きの絵なら「左右反転」

```text
Create ONE boss monster sprite for a side-scrolling 2D action RPG: an imposing boss human robed spellcaster (ashlord), ash-gray, dark indigo body with very dark indigo shading, glowing orange eyes, orange and red fire magic. Larger, more ornate and threatening than normal enemies, with a crown, trophies or an aura. Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用のボスの画像を1体: 「灰の司祭ヴォルク」（人・ローブの術者）。灰色の。体は暗い藍色、影や服はとても暗い藍色、目は光る橙。ボスらしく大きく、豪華で恐ろしく。冠・戦利品・オーラなど。向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

<a id="cat-minion"></a>
### 召喚物・ペット（4 枠）

死霊術師の骸骨などの召喚物と、連れて歩くペット。

#### 召喚物

##### `minion.skeleton` — 召喚物「骸骨の戦士」

- ゲーム内 120×140（比 1:1）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
Create ONE summoned ally creature sprite for a side-scrolling 2D action RPG: a skeleton warrior with a rusty sword and a cracked round shield, faint violet glow in the eye sockets. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の、味方の召喚物の画像を1体: 錆びた剣と割れた丸盾を持つ骸骨の戦士。目のくぼみにかすかな紫の光。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `minion.skelmage` — 召喚物「骸骨の魔術師」

- ゲーム内 120×140（比 1:1）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
Create ONE summoned ally creature sprite for a side-scrolling 2D action RPG: a skeleton mage in tattered robes holding a bone staff, icy blue glowing eyes. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の、味方の召喚物の画像を1体: ぼろの衣を着て骨の杖を持つ骸骨の魔術師。目は氷のような青に光る。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `minion` — 召喚物（全部まとめて）

- ゲーム内 120×140（比 1:1）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: ここに入れると、専用の画像が無い召喚物すべてに使われます

```text
Create ONE summoned ally creature sprite for a side-scrolling 2D action RPG: a skeleton warrior with a rusty sword and a cracked round shield, faint violet glow in the eye sockets. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
横スクロールの2DアクションRPG用の、味方の召喚物の画像を1体: 錆びた剣と割れた丸盾を持つ骸骨の戦士。目のくぼみにかすかな紫の光。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### ペット

##### `pet.emberfox` — ペット「火狐のほむら」

- ゲーム内 90×90（比 1:1）・基準点 (0.5, 0.97)・右向き・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
Create ONE small companion pet sprite for a 2D action RPG: a small four-legged beast (emberfox), cute but fitting a dark fantasy world, orange with dark orange markings and light yellow eyes. Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line. Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2DアクションRPGの、連れて歩く小さなペットの画像を1体: 「火狐のほむら」。尾に火を灯す小さな狐。敵に火の粉を飛ばす。小さな四足の獣で、かわいいがダークファンタジーに合う雰囲気。体は橙、模様は暗い橙、目は明るい黄色。向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

<a id="cat-fx"></a>
### スキルの演出（31 枠）

弾・当たった瞬間・範囲・斬撃などの光（黒い背景で作ると加算で黒が消える）。

#### 剣闘士

##### `fx.w_slash.swing` — 「強打」の斬撃・振りの軌跡

- ゲーム内 200×200（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold crescent weapon-slash arc, curved like a half moon, sweeping from upper left to lower right: a visual effect for a 2D game skill "slash". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「強打」の演出: 鋼の白と淡い金の三日月形の斬撃の軌跡。左上から右下へ振り抜く弧。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.w_slash.hit` — 「強打」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "slash". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「強打」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.w_cleave.area` — 「大旋斬」の範囲（地面・爆発）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold circular explosion burst seen from the front, radial shockwave ring: a visual effect for a 2D game skill "cleave". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「大旋斬」の演出: 鋼の白と淡い金の円形の爆発。正面から見た放射状の衝撃波の輪。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.w_cleave.hit` — 「大旋斬」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "cleave". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「大旋斬」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 狩人

##### `fx.r_shot.proj` — 「速射」の弾

- ゲーム内 90×46（比 16:9）・基準点 (0.6, 0.5)・右向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A single steel-white and pale gold projectile flying to the RIGHT, bright hot core with a tapering trailing tail: a visual effect for a 2D game skill "shot". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「速射」の演出: 鋼の白と淡い金の弾を1つ。右へ飛ぶ向きで、明るい芯と細くなっていく尾。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.r_shot.hit` — 「速射」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "shot". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「速射」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.r_multishot.proj` — 「扇射ち」の弾

- ゲーム内 90×46（比 16:9）・基準点 (0.6, 0.5)・右向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A single steel-white and pale gold projectile flying to the RIGHT, bright hot core with a tapering trailing tail: a visual effect for a 2D game skill "multishot". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「扇射ち」の演出: 鋼の白と淡い金の弾を1つ。右へ飛ぶ向きで、明るい芯と細くなっていく尾。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.r_multishot.hit` — 「扇射ち」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "multishot". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「扇射ち」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 魔導士

##### `fx.s_bolt.proj` — 「魔弾」の弾

- ゲーム内 90×46（比 16:9）・基準点 (0.6, 0.5)・右向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A single electric yellow and white lightning projectile flying to the RIGHT, bright hot core with a tapering trailing tail: a visual effect for a 2D game skill "bolt". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「魔弾」の演出: 黄色と白の雷の弾を1つ。右へ飛ぶ向きで、明るい芯と細くなっていく尾。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.s_bolt.hit` — 「魔弾」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A electric yellow and white lightning impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "bolt". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「魔弾」の演出: 黄色と白の雷の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.s_bolt.area` — 「魔弾」の範囲（地面・爆発）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A electric yellow and white lightning circular explosion burst seen from the front, radial shockwave ring: a visual effect for a 2D game skill "bolt". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「魔弾」の演出: 黄色と白の雷の円形の爆発。正面から見た放射状の衝撃波の輪。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.s_nova.area` — 「氷結の環」の範囲（地面・爆発）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A icy cyan and white frost circular explosion burst seen from the front, radial shockwave ring: a visual effect for a 2D game skill "nova". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「氷結の環」の演出: 水色と白の冷気の円形の爆発。正面から見た放射状の衝撃波の輪。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.s_nova.hit` — 「氷結の環」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A icy cyan and white frost impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "nova". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「氷結の環」の演出: 水色と白の冷気の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 死霊術師

##### `fx.n_bonespear.proj` — 「骨の槍」の弾

- ゲーム内 90×46（比 16:9）・基準点 (0.6, 0.5)・右向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A single steel-white and pale gold projectile flying to the RIGHT, bright hot core with a tapering trailing tail: a visual effect for a 2D game skill "bonespear". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「骨の槍」の演出: 鋼の白と淡い金の弾を1つ。右へ飛ぶ向きで、明るい芯と細くなっていく尾。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.n_bonespear.hit` — 「骨の槍」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "bonespear". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「骨の槍」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.n_skeleton.summon` — 「骸骨召喚」の呼び出す魔法陣

- ゲーム内 200×120（比 16:9）・基準点 (0.5, 0.6)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A steel-white and pale gold magic summoning circle with runes, seen slightly from above: a visual effect for a 2D game skill "skeleton". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「骸骨召喚」の演出: 少し上から見た鋼の白と淡い金の魔法陣（文字ではなく模様の紋）。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 影刃

##### `fx.a_stab.swing` — 「連刃」の斬撃・振りの軌跡

- ゲーム内 200×200（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold crescent weapon-slash arc, curved like a half moon, sweeping from upper left to lower right: a visual effect for a 2D game skill "stab". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「連刃」の演出: 鋼の白と淡い金の三日月形の斬撃の軌跡。左上から右下へ振り抜く弧。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.a_stab.hit` — 「連刃」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "stab". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「連刃」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.a_fan.area` — 「刃の扇」の範囲（地面・爆発）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold circular explosion burst seen from the front, radial shockwave ring: a visual effect for a 2D game skill "fan". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「刃の扇」の演出: 鋼の白と淡い金の円形の爆発。正面から見た放射状の衝撃波の輪。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.a_fan.hit` — 「刃の扇」の当たった瞬間

- ゲーム内 120×120（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A steel-white and pale gold impact spark burst, star-shaped flash with flying sparks: a visual effect for a 2D game skill "fan". Bright glowing energy, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームのスキル「刃の扇」の演出: 鋼の白と淡い金の当たった瞬間の火花。星形の閃光と飛び散る粒。明るく光るエネルギー、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 敵の攻撃

##### `fx.enemy.arrow` — 敵の弾（矢）

- ゲーム内 70×40（比 16:9）・基準点 (0.5, 0.5)・左向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A dark wooden arrow with a rusty iron head flying to the LEFT: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ飛ぶ、錆びた鉄の鏃の黒い木の矢。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.fireball` — 敵の弾（火の玉）

- ゲーム内 70×40（比 16:9）・基準点 (0.5, 0.5)・左向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A roaring fireball flying to the LEFT with a smoky tail: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ飛ぶ、煙の尾を引く火の玉。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.orb` — 敵の弾（魔弾）

- ゲーム内 70×40（比 16:9）・基準点 (0.5, 0.5)・左向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A crackling dark magic orb flying to the LEFT: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ飛ぶ、ばちばちと鳴る闇の魔弾。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.bone` — 敵の弾（骨の破片）

- ゲーム内 70×40（比 16:9）・基準点 (0.5, 0.5)・左向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A spinning shard of bone flying to the LEFT: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ回りながら飛ぶ骨の破片。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.ice` — 敵の弾（氷の棘）

- ゲーム内 70×40（比 16:9）・基準点 (0.5, 0.5)・左向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A sharp ice spike flying to the LEFT: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ飛ぶ鋭い氷の棘。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.spit` — 敵の弾（毒のつば）

- ゲーム内 70×40（比 16:9）・基準点 (0.5, 0.5)・左向き・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`

```text
A glob of acidic green spit flying to the LEFT: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ飛ぶ酸の緑のつば。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.area` — 敵の攻撃（地面の危険な範囲）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A red danger zone of corrupted energy on the ground, seen from the front: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 地面に広がる赤い危険な力の渦。正面から。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.slam` — 敵の攻撃（叩きつけの衝撃）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A ground-slam shockwave with cracked rock debris, seen from the front: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 地面を叩きつけた衝撃波と飛び散る岩。正面から。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.blast` — 敵の攻撃（死に際の爆発）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A fiery death explosion burst: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 死に際の炎の爆発。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy.zap` — 敵の攻撃（落ちる雷）

- ゲーム内 256×256（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A lightning bolt striking down from above: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 上から落ちる雷。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `fx.enemy` — 敵の攻撃の演出（全部まとめて）

- ゲーム内 128×128（比 1:1）・基準点 (0.5, 0.5)・—・背景 真っ黒 #000000（加算）・加算
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: ここに入れると、専用の画像が無い敵の弾・攻撃すべてに使われます（ボスの特技も）

```text
A crackling dark magic orb flying to the LEFT: a visual effect for a 2D game enemy attack. Glowing, high contrast. Framing: centered. Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders. Style: hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon). Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
2Dゲームの敵の攻撃の演出: 左へ飛ぶ、ばちばちと鳴る闇の魔弾。光る、強いコントラスト。構図: 中央に置く。背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。画風: 手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

<a id="cat-icon"></a>
### アイコン（59 枠）

持ち物・素材・スキル・宝石のアイコン。

#### 武器・副手

##### `icon.item.sword` — 片手剣のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.sword
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one one-handed longsword. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 片手剣を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.axe` — 斧のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.axe
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one one-handed battle axe. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 斧を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.mace` — 槌のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.mace
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one flanged war mace. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 槌を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.greatsword` — 両手剣のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.greatsword
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one huge two-handed greatsword. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 両手剣を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.bow` — 弓のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.bow
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one recurve longbow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 弓を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.crossbow` — 弩のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.crossbow
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one heavy crossbow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 弩を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.staff` — 杖のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.staff
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one tall wooden mage staff topped with a glowing crystal. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 杖を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.wand` — 短杖のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.wand
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one short carved magic wand. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 短杖を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.scythe` — 大鎌のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.scythe
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one large reaper scythe. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 大鎌を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.rod` — 骨杖のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.rod
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one bone rod with a small skull ornament. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 骨杖を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.dagger` — 短剣のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.dagger
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one curved dagger. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 短剣を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.claw` — 鉤爪のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.claw
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one katar-style punching claw blade. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鉤爪を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.shield` — 盾のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.shield
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one heater shield with metal rim. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 盾を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.quiver` — 矢筒のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.quiver
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one leather quiver full of arrows. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 矢筒を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.orb` — 宝珠のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.orb
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one floating arcane orb in a metal cradle. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 宝珠を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.grimoire` — 魔導書のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.grimoire
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one leather-bound grimoire with metal corners. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 魔導書を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.offblade` — 副刀のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.offblade
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`
- メモ: 無ければ「手に持った姿」の画像を使います

```text
An inventory icon of one short offhand parrying blade. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 副刀を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 防具

##### `icon.item.helm.cloth` — 布の兜のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.helm.cloth
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one cloth helmet (layered cloth robes and wraps). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 布の兜を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.helm.leather` — 革の兜のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.helm.leather
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one leather helmet (fitted leather armor with straps and buckles). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 革の兜を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.helm.mail` — 鎖の兜のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.helm.mail
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one mail helmet (a chainmail hauberk with leather pauldrons). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鎖の兜を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.helm.plate` — 板金の兜のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.helm.plate
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one plate helmet (full steel plate armor with engraved edges). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 板金の兜を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.chest.cloth` — 布の鎧のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.chest.cloth
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one cloth chest armor (layered cloth robes and wraps). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 布の鎧を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.chest.leather` — 革の鎧のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.chest.leather
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one leather chest armor (fitted leather armor with straps and buckles). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 革の鎧を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.chest.mail` — 鎖の鎧のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.chest.mail
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one mail chest armor (a chainmail hauberk with leather pauldrons). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鎖の鎧を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.chest.plate` — 板金の鎧のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.chest.plate
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one plate chest armor (full steel plate armor with engraved edges). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 板金の鎧を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.gloves.cloth` — 布の手甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.gloves.cloth
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one cloth gauntlets (layered cloth robes and wraps). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 布の手甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.gloves.leather` — 革の手甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.gloves.leather
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one leather gauntlets (fitted leather armor with straps and buckles). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 革の手甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.gloves.mail` — 鎖の手甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.gloves.mail
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one mail gauntlets (a chainmail hauberk with leather pauldrons). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鎖の手甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.gloves.plate` — 板金の手甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.gloves.plate
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one plate gauntlets (full steel plate armor with engraved edges). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 板金の手甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.belt.cloth` — 布の帯のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.belt.cloth
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one cloth armored belt (layered cloth robes and wraps). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 布の帯を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.belt.leather` — 革の帯のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.belt.leather
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one leather armored belt (fitted leather armor with straps and buckles). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 革の帯を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.belt.mail` — 鎖の帯のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.belt.mail
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one mail armored belt (a chainmail hauberk with leather pauldrons). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鎖の帯を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.belt.plate` — 板金の帯のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.belt.plate
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one plate armored belt (full steel plate armor with engraved edges). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 板金の帯を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.legs.cloth` — 布の脚甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.legs.cloth
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one cloth leg armor (layered cloth robes and wraps). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 布の脚甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.legs.leather` — 革の脚甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.legs.leather
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one leather leg armor (fitted leather armor with straps and buckles). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 革の脚甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.legs.mail` — 鎖の脚甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.legs.mail
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one mail leg armor (a chainmail hauberk with leather pauldrons). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鎖の脚甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.legs.plate` — 板金の脚甲のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.legs.plate
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one plate leg armor (full steel plate armor with engraved edges). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 板金の脚甲を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.boots.cloth` — 布の靴のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.boots.cloth
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one cloth armored boots (layered cloth robes and wraps). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 布の靴を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.boots.leather` — 革の靴のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.boots.leather
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one leather armored boots (fitted leather armor with straps and buckles). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 革の靴を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.boots.mail` — 鎖の靴のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.boots.mail
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one mail armored boots (a chainmail hauberk with leather pauldrons). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 鎖の靴を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.boots.plate` — 板金の靴のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）・無ければ gear.boots.plate
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one plate armored boots (full steel plate armor with engraved edges). Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 板金の靴を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 装飾品

##### `icon.item.amulet` — 首飾りのアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one amulet pendant on a chain. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 首飾りを1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.item.ring` — 指輪のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of one ornate ring. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 指輪を1つ。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### 素材

##### `icon.mat.scrap` — 素材「鉄屑」のアイコン

- ゲーム内 64×64（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of a crafting material: scrap, a small pile or single piece, gray colored with a soft glow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 素材「鉄屑」。ノーマル装備を分解すると出る。強化に使う。小さな山か 1 つのかけら、灰色でほのかに光る。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.mat.dust` — 素材「魔塵」のアイコン

- ゲーム内 64×64（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of a crafting material: dust, a small pile or single piece, light blue colored with a soft glow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 素材「魔塵」。マジック装備を分解すると出る。オプションの付け替えに使う。小さな山か 1 つのかけら、明るい青でほのかに光る。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.mat.crystal` — 素材「秘晶」のアイコン

- ゲーム内 64×64（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of a crafting material: crystal, a small pile or single piece, light yellow colored with a soft glow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 素材「秘晶」。レア・エピック装備を分解すると出る。上位のクラフトに使う。小さな山か 1 つのかけら、明るい黄色でほのかに光る。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.mat.echo` — 素材「伝説の残響」のアイコン

- ゲーム内 64×64（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of a crafting material: echo, a small pile or single piece, orange colored with a soft glow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 素材「伝説の残響」。レジェンダリー以上を分解すると出る。伝説の力の抽出に使う。小さな山か 1 つのかけら、橙でほのかに光る。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.mat.core` — 素材「原初の核」のアイコン

- ゲーム内 64×64（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of a crafting material: core, a small pile or single piece, light red colored with a soft glow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 素材「原初の核」。太古・原初の装備を分解すると出る。最上位のクラフトに使う。小さな山か 1 つのかけら、明るい赤でほのかに光る。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.mat.shard` — 素材「深淵の欠片」のアイコン

- ゲーム内 64×64（比 1:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
An inventory icon of a crafting material: shard, a small pile or single piece, light indigo colored with a soft glow. Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items. Framing: centered in a square with a 10% margin, large and readable at small size. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
持ち物のアイコン: 素材「深淵の欠片」。裂け目やボスから。商人のガチャ（目利き）に使う。小さな山か 1 つのかけら、明るい藍色でほのかに光る。向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

#### スキル

##### `icon.skill.w_slash` — スキル「強打」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a heavy weapon strike themed "slash", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「強打」。目の前の敵を武器で叩き、大きなダメージ。怒りがたまる。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.w_cleave` — スキル「大旋斬」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a radial burst of power themed "cleave", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「大旋斬」。武器を振り回し、周りの敵すべてに大きなダメージ。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.r_shot` — スキル「速射」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a flying projectile themed "shot", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「速射」。矢を放ち大きなダメージ。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.r_multishot` — スキル「扇射ち」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a flying projectile themed "multishot", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「扇射ち」。何本もの矢を扇状に放ち、それぞれ大きなダメージ。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.s_bolt` — スキル「魔弾」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a flying projectile themed "bolt", electric yellow and white lightning colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「魔弾」。魔力の弾で雷撃ダメージ。黄色と白の雷の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.s_nova` — スキル「氷結の環」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a radial burst of power themed "nova", icy cyan and white frost colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「氷結の環」。周りに冷気を放ち大きなダメージ。凍結させることがある。水色と白の冷気の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.n_bonespear` — スキル「骨の槍」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a flying projectile themed "bonespear", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「骨の槍」。敵を貫く骨の槍で大きなダメージ。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.n_skeleton` — スキル「骸骨召喚」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a summoning circle with a rising figure themed "skeleton", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「骸骨召喚」。骸骨の戦士を何体も呼ぶ。骸骨は武器ダメージで攻撃する。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.a_stab` — スキル「連刃」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a heavy weapon strike themed "stab", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「連刃」。素早く切りつけ大きなダメージ。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `icon.skill.a_fan` — スキル「刃の扇」のアイコン

- ゲーム内 96×96（比 1:1）・基準点 (0.5, 0.5)・—・背景 暗いぼかし（正方形いっぱい）
- 作る大きさ: GPT 1024×1024／SDXL 1024×1024／FLUX 1024×1024／Midjourney `--ar 1:1`

```text
A square skill icon for an action RPG: a radial burst of power themed "fan", steel-white and pale gold colors, bold readable silhouette. Framing: centered in a square with a 10% margin, large and readable at small size. Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame). Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
アクションRPGのスキルのアイコン（正方形）: スキル「刃の扇」。周りに刃をばらまき大きなダメージ。出血させる。鋼の白と淡い金の色で、形がはっきり分かる絵。構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

<a id="cat-bg"></a>
### 背景（30 枠）

章ごとの奥・中景・地面の 3 枚（横につながる絵）。

#### 第一章

##### `bg.act1` — 第一章　灰の村（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of an ash-covered desolate village, a rotting forest, a graveyard, a swamp and a ruined chapel; gray and withered brown tones with a distant blood-red moon. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第一章 灰の村。灰の降る寒村・腐った森・墓地・沼・礼拝堂。灰色と枯れた茶、遠くに赤い月。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act1.mid` — 第一章　灰の村（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of an ash-covered desolate village, a rotting forest, a graveyard, a swamp and a ruined chapel; gray and withered brown tones with a distant blood-red moon standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第一章 灰の村。灰の降る寒村・腐った森・墓地・沼・礼拝堂。灰色と枯れた茶、遠くに赤い月。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act1.ground` — 第一章　灰の村（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of an ash-covered desolate village, a rotting forest, a graveyard, a swamp and a ruined chapel; gray and withered brown tones with a distant blood-red moon, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第一章 灰の村。灰の降る寒村・腐った森・墓地・沼・礼拝堂。灰色と枯れた茶、遠くに赤い月。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第二章

##### `bg.act2` — 第二章　砂塵の墓所（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a desert of dunes, crumbling temples and tombs, tall obelisks; orange and gold sunset sky, sandstorm haze. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第二章 砂塵の墓所。砂漠・砂丘・崩れた神殿と墓・オベリスク。橙と金の夕空、砂嵐。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act2.mid` — 第二章　砂塵の墓所（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a desert of dunes, crumbling temples and tombs, tall obelisks; orange and gold sunset sky, sandstorm haze standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第二章 砂塵の墓所。砂漠・砂丘・崩れた神殿と墓・オベリスク。橙と金の夕空、砂嵐。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act2.ground` — 第二章　砂塵の墓所（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a desert of dunes, crumbling temples and tombs, tall obelisks; orange and gold sunset sky, sandstorm haze, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第二章 砂塵の墓所。砂漠・砂丘・崩れた神殿と墓・オベリスク。橙と金の夕空、砂嵐。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第三章

##### `bg.act3` — 第三章　凍てつく峰（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of snowy mountains, ice caves, frozen waterfalls and a glacier fortress; pale blue light and a faint aurora. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第三章 凍てつく峰。雪山・氷の洞窟・凍った滝・氷河の砦。青白い光、オーロラ。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act3.mid` — 第三章　凍てつく峰（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of snowy mountains, ice caves, frozen waterfalls and a glacier fortress; pale blue light and a faint aurora standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第三章 凍てつく峰。雪山・氷の洞窟・凍った滝・氷河の砦。青白い光、オーロラ。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act3.ground` — 第三章　凍てつく峰（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of snowy mountains, ice caves, frozen waterfalls and a glacier fortress; pale blue light and a faint aurora, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第三章 凍てつく峰。雪山・氷の洞窟・凍った滝・氷河の砦。青白い光、オーロラ。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第四章

##### `bg.act4` — 第四章　沈んだ都（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a sunken drowned city, coral, broken towers and an undersea temple; teal light rays and rising bubbles. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第四章 沈んだ都。水没した都・珊瑚・崩れた塔・海底の神殿。青緑の光の筋、泡。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act4.mid` — 第四章　沈んだ都（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a sunken drowned city, coral, broken towers and an undersea temple; teal light rays and rising bubbles standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第四章 沈んだ都。水没した都・珊瑚・崩れた塔・海底の神殿。青緑の光の筋、泡。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act4.ground` — 第四章　沈んだ都（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a sunken drowned city, coral, broken towers and an undersea temple; teal light rays and rising bubbles, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第四章 沈んだ都。水没した都・珊瑚・崩れた塔・海底の神殿。青緑の光の筋、泡。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第五章

##### `bg.act5` — 第五章　紅蓮の溶鉱炉（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a volcano, rivers of lava, giant forges hung with chains, black rock; red and orange with flying embers. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第五章 紅蓮の溶鉱炉。火山・溶岩の川・巨大な炉と鎖・黒い岩。赤と橙、火の粉。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act5.mid` — 第五章　紅蓮の溶鉱炉（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a volcano, rivers of lava, giant forges hung with chains, black rock; red and orange with flying embers standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第五章 紅蓮の溶鉱炉。火山・溶岩の川・巨大な炉と鎖・黒い岩。赤と橙、火の粉。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act5.ground` — 第五章　紅蓮の溶鉱炉（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a volcano, rivers of lava, giant forges hung with chains, black rock; red and orange with flying embers, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第五章 紅蓮の溶鉱炉。火山・溶岩の川・巨大な炉と鎖・黒い岩。赤と橙、火の粉。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第六章

##### `bg.act6` — 第六章　毒霧の森沼（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a forest of giant mushrooms, a poison swamp, spider webs and rotting great trees; yellow-green and purple mist with drifting spores. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第六章 毒霧の森沼。巨大な茸・毒の沼・蜘蛛の巣・朽ちた大樹。黄緑と紫の霧、胞子。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act6.mid` — 第六章　毒霧の森沼（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a forest of giant mushrooms, a poison swamp, spider webs and rotting great trees; yellow-green and purple mist with drifting spores standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第六章 毒霧の森沼。巨大な茸・毒の沼・蜘蛛の巣・朽ちた大樹。黄緑と紫の霧、胞子。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act6.ground` — 第六章　毒霧の森沼（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a forest of giant mushrooms, a poison swamp, spider webs and rotting great trees; yellow-green and purple mist with drifting spores, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第六章 毒霧の森沼。巨大な茸・毒の沼・蜘蛛の巣・朽ちた大樹。黄緑と紫の霧、胞子。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第七章

##### `bg.act7` — 第七章　天穹の廃城（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a white castle above the clouds, broken colonnades, floating islands and thunderclouds; white and gold with storm light. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第七章 天穹の廃城。雲の上の白い城・崩れた回廊・浮かぶ島・雷雲。白と金、嵐の光。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act7.mid` — 第七章　天穹の廃城（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a white castle above the clouds, broken colonnades, floating islands and thunderclouds; white and gold with storm light standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第七章 天穹の廃城。雲の上の白い城・崩れた回廊・浮かぶ島・雷雲。白と金、嵐の光。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act7.ground` — 第七章　天穹の廃城（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a white castle above the clouds, broken colonnades, floating islands and thunderclouds; white and gold with storm light, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第七章 天穹の廃城。雲の上の白い城・崩れた回廊・浮かぶ島・雷雲。白と金、嵐の光。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第八章

##### `bg.act8` — 第八章　機巧の迷宮（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a clockwork labyrinth of gears, steam pipes, brass corridors and giant clock mechanisms; copper and gold with steam. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第八章 機巧の迷宮。歯車・蒸気管・真鍮の通路・巨大な時計仕掛け。銅と金、蒸気。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act8.mid` — 第八章　機巧の迷宮（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a clockwork labyrinth of gears, steam pipes, brass corridors and giant clock mechanisms; copper and gold with steam standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第八章 機巧の迷宮。歯車・蒸気管・真鍮の通路・巨大な時計仕掛け。銅と金、蒸気。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act8.ground` — 第八章　機巧の迷宮（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a clockwork labyrinth of gears, steam pipes, brass corridors and giant clock mechanisms; copper and gold with steam, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第八章 機巧の迷宮。歯車・蒸気管・真鍮の通路・巨大な時計仕掛け。銅と金、蒸気。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第九章

##### `bg.act9` — 第九章　虚無の境界（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of floating rock islands under a twisted sky, rifts full of stars, glowing crystals; purple and black with stardust. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第九章 虚無の境界。浮かぶ岩の島・ねじれた空・星の裂け目・結晶。紫と黒、星屑。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act9.mid` — 第九章　虚無の境界（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of floating rock islands under a twisted sky, rifts full of stars, glowing crystals; purple and black with stardust standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第九章 虚無の境界。浮かぶ岩の島・ねじれた空・星の裂け目・結晶。紫と黒、星屑。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act9.ground` — 第九章　虚無の境界（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of floating rock islands under a twisted sky, rifts full of stars, glowing crystals; purple and black with stardust, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第九章 虚無の境界。浮かぶ岩の島・ねじれた空・星の裂け目・結晶。紫と黒、星屑。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

#### 第十章

##### `bg.act10` — 第十章　深淵の玉座（背景・一番奥）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: ゆっくり横に流れます。下の方は暗めに

```text
A side-scrolling game background, far layer: distant sky and horizon of a hellish castle, pillars of bone, a river of blood and a colossal throne; crimson and black under a burning sky. Low detail, atmospheric perspective, darker toward the bottom where the battle happens. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（一番奥の層）: 第十章 深淵の玉座。地獄の城・骨の柱・血の川・巨大な玉座。深紅と黒、炎の空。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act10.mid` — 第十章　深淵の玉座（背景・中景、横につながる絵）

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）

```text
A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of a hellish castle, pillars of bone, a river of blood and a colossal throne; crimson and black under a burning sky standing along the bottom half. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: 第十章 深淵の玉座。地獄の城・骨の柱・血の川・巨大な玉座。深紅と黒、炎の空。下半分に並ぶ建物や木などのシルエット。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

##### `bg.act10.ground` — 第十章　深淵の玉座（地面、横につながる絵）

- ゲーム内 1280×220（比 3:1）・基準点 (0, 0)・—・背景 下だけ絵・上は透明
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります

```text
A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of a hellish castle, pillars of bone, a river of blood and a colossal throne; crimson and black under a burning sky, the walkable top edge flat and near the top of the image, rocks and roots below. Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: 第十章 深淵の玉座。地獄の城・骨の柱・血の川・巨大な玉座。深紅と黒、炎の空。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

<a id="cat-ui"></a>
### 画面の飾り（2 枠）

タイトルロゴとタイトル画面。

#### タイトル

##### `ui.logo` — タイトルロゴ

- ゲーム内 720×240（比 3:1）・基準点 (0.5, 0.5)・—・背景 透明（無理なら単色の緑 #00FF00）
- 作る大きさ: GPT 1536×512／SDXL 1536×512／FLUX 1536×512／Midjourney `--ar 3:1`（横に長い。作った後で上下を切り抜く）
- メモ: 背景は透明に

```text
A game title logo with the words "ABYSS DROP" in ornate gothic metal letters, cracked dark iron with glowing ember-red edges, a small abyss chasm motif. Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient. Style: hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above. Exactly one subject. No watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.
```

```text
ゲームのタイトルロゴ。「ABYSS DROP」の文字を、ひびの入った黒鉄と赤く光る縁の装飾的なゴシック体の金属文字で。小さな深淵の裂け目の意匠。背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。画風: 手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光。描くのは1つだけ。透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。
```

##### `ui.title` — タイトル画面の背景

- ゲーム内 1280×720（比 16:9）・基準点 (0, 0)・—・背景 画面いっぱいの風景
- 作る大きさ: GPT 1536×1024（または 1792×1008）／SDXL 1344×768／FLUX 1344×768／Midjourney `--ar 16:9`
- メモ: 画面いっぱいに広げて表示（はみ出た所は切れる）

```text
Title screen key art for a dark fantasy hack-and-slash game: a vast glowing abyss chasm under an ash-filled blood-red sky, ruins at its rim, a lone hero silhouette standing at the edge. Leave the center top area calm for the logo. The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI. Style: hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light.
```

```text
ダークファンタジーのハクスラのタイトル画面の絵: 灰の舞う血のように赤い空の下に口を開けた巨大な光る深淵の裂け目、縁の廃墟、端に立つ主人公の小さなシルエット。中央の上はロゴが乗るので落ち着いた絵に。画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。画風: 手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光。
```

