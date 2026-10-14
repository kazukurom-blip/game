// クラフト（強化 +1〜+20・オプションの付け替え・混沌の振り直し・レアリティ昇格・ソケット追加・堕落・祝福）
// 担当: アイテム担当（このファイルは土台だけ。中身は担当が作る）
// 形: constructor(game) / onNewGame?() / onLoad?() / tick?(dt) / 外から呼ぶ関数
export class CraftingSystem {
  constructor(game) { this.game = game; this.id = 'crafting'; }
}
