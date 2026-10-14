# 差し替え画像を置くフォルダ（assets/custom）

ここに置いた画像は、ゲームと一緒に配る「差し替えの絵」になります（ゲーム内の「画像」の窓で入れた画像のほうが優先）。

1. 画像の名前を **枠 ID** にして置く: `hero.warrior.body.png`、`monster.ash_wolf.png`、`fx.s_bolt.proj.png` など。
   - フォルダを分けてもよい（`monster/act1/monster.ash_wolf.png`）。png・webp・jpg が使えます。
   - 横 1 列に並べたコマ送りは `@コマ数f`（`fx.s_bolt.proj@8f.png`、1 秒のコマ数も書くなら `@8f12`）。
   - 置いた画像は、ゲーム内で入れたときと同じように自動で加工されます（背景を抜く・外側を切って元の絵と同じ大きさに置き直す・足元を合わせる）。
   - 変えたい所だけ、同じ名前の `.json`（`hero.warrior.body.json`）に書ける（基準点・アンカー・大きさ・背景の抜き方など。抜きたくないときは `"bg": "none"`）。
2. `abyss/` の中で `node tools/scan_custom.mjs` を実行する → `custom.json` が作り直されます（知らない枠 ID は「もしかして」で案内）。
3. ゲームを開き直す。

音の差し替えは `audio/` フォルダに `音の ID.ogg`（mp3・wav も可）を置いて、同じようにスキャンします。

枠 ID の一覧・大きさ・向き・作り方・AI 用の指示文は `docs/ASSETS.md` と `docs/AI_PROMPTS.md`（`docs/AI_PROMPTS.csv`）。
型紙（どこに描けばよいかの見本）は `assets/templates/`。
