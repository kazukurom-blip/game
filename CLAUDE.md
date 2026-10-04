# NEON VICE STORY — 作業ルール

- 作業ログ: **作業している間だけ**記録する。作業を始めたら1時間ごとのログ（Routine「NEON VICE STORY 作業ログ（1時間ごと）」, trig_01D6B5yWvAez28Twjc5gtEyv）を有効にし、作業が終わったら無効に戻す。ログは docs/WORKLOG.md に追記し、各担当の状態・コミット・バグ・消費トークン・次の予定を書く。**トークン数は「万」単位で表記する**（例: 302.9万、約30万）。
- 修正は検証つきで行う。同じ問題に10回修正を試みても直らなければ打ち切り、未解決として報告する。その他の問題点も最終報告にまとめる。
- 開発は担当エージェント（リサーチ/アート/システム/ワールド/UI/サウンド/デバッグ）に分担し、必ずデバッグ担当が通しで検証する。
- テスト: `npm run test:unit` と `npm run test:smoke` が全て合格すること。
- 公開ページ: https://claude.ai/artifact/CHaCfKuy4mPHaUGhtwY33g （更新したら同じURLに再公開）
- 設計: docs/ARCHITECTURE.md, docs/SPEC_V2.md
