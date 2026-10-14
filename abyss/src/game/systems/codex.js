// 伝説の力の抽出と装着（3 枠: 武器・防具・装飾）
// 担当: アイテム担当（このファイルは土台だけ。中身は担当が作る）
// 形: constructor(game) / onNewGame?() / onLoad?() / tick?(dt) / 外から呼ぶ関数
export class CodexSystem {
  constructor(game) { this.game = game; this.id = 'codex'; }
}
