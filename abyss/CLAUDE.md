# ABYSS DROP（abyss/）— 作業ルール

- このフォルダは新作の放置ハクスラ。リポジトリの他のフォルダ（NEON VICE STORY など）とは無関係で、触らない。
- 設計: docs/DESIGN.md（遊びと目標の数）、docs/ARCHITECTURE.md（作りと決まり）、docs/REFERENCE.md（人気作の調査）、docs/ASSETS.md（画像の差し替え）。
- テスト（abyss/ の中で）: `node tests/unit.mjs`（軽い）・`node tests/sim.mjs 30`（数値・進み具合）・`node tests/smoke.mjs`（Chromium で通し。写真は tests/screenshots/）。
- 変更したら必ずテストを通してからコミットする。console のエラーは 0 件に保つ。
- 文章（UI・説明・コメント）は自然な日本語。既存の作品の固有名詞・絵は使わない（仕組みだけ取り入れる）。
- セーブの形を変えたら state の migrate で古いセーブが読めるようにする。
