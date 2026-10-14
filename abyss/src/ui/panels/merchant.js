// 商人（目利き＝部位を選ぶガチャ・バッグや倉庫の拡張・素材）
// 担当: アイテム担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const merchantPanel = {
  id: 'merchant', name: '商人', icon: '⚖',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
