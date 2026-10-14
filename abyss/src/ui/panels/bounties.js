// 日課の懸賞・毎週・ログインの贈り物
// 担当: メタ担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const bountiesPanel = {
  id: 'bounties', name: '日課', icon: '📋',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
