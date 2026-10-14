// 記録（統計・能力の詳しい内訳・DPS の内訳）
// 担当: メタ担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const statsPanel = {
  id: 'stats', name: '記録', icon: '📊',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
