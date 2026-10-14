// 魔物図鑑（倒した数で段階・種族へのダメージ）と宝物図鑑（集めたユニーク・セット）
// 担当: メタ担当（このファイルは土台だけ。中身は担当が作る）
// 形: constructor(game) / onNewGame?() / onLoad?() / tick?(dt) / 外から呼ぶ関数
export class BestiarySystem {
  constructor(game) { this.game = game; this.id = 'bestiary'; }
}
