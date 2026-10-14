// 商人（深淵の欠片で部位を選んで目利き＝ガチャ、バッグ・倉庫の拡張、素材の売買）
// 担当: アイテム担当（このファイルは土台だけ。中身は担当が作る）
// 形: constructor(game) / onNewGame?() / onLoad?() / tick?(dt) / 外から呼ぶ関数
export class MerchantSystem {
  constructor(game) { this.game = game; this.id = 'merchant'; }
}
