// 鍛冶（強化・付け替え・振り直し・昇格・ソケット・堕落）
// 担当: アイテム担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const craftPanel = {
  id: 'craft', name: '鍛冶', icon: '⚒',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
