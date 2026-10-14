// 日課の懸賞（毎日 3 つ・毎週 1 つ）とログインボーナス
// 担当: メタ担当（このファイルは土台だけ。中身は担当が作る）
// 形: constructor(game) / onNewGame?() / onLoad?() / tick?(dt) / 外から呼ぶ関数
export class BountySystem {
  constructor(game) { this.game = game; this.id = 'bounties'; }
}
