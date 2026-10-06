# 公開ページ（claude.ai の Artifact）への出し方

公開ページは 1 つの版に置けるファイルが **511 個まで**なので、画像の一部をまとめた「pack」を使う。

- `artifact_index.html`: 公開ページの本体。`<img>.src` を pack の中の画像に差し替える小さな仕組み入り。
  - pack3・pack4: 起動の前に全部切り出す（アイコン・足場・UI・タイトルなど）
  - pack5: 顔・髪（`assets/sprites/heads/**`、188 枚）。透明の外側を切り詰めて詰め、**使うときだけ**元の大きさに戻して切り出す
- `mkatlas.py <files.json> <tag> <最大の高さ>`: pack3・pack4 を作った道具（{公開パス: 元ファイル} の JSON から）
- `mkatlas_heads.py <リポジトリのルート> 5 <出力先>`: pack5（顔・髪）を作る。`files[k] = [atlas, x, y, w, h, ox, oy, W, H]`
- 公開ページは WebP を使わない（`assets/sprites/webp.json` を置かないので PNG を読む）。
- 出すもの: `src/**` 全部、`assets/sprites/manifest.json`、`assets/packs/*`、pack に入れていない画像（背景・敵・ボス・リグなど）。pack に入れた画像のパスは置かない（置いてあれば `null` で消す）。
