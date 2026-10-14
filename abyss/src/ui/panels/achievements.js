// 実績の一覧・称号・実績ポイント
// 担当: メタ担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const achievementsPanel = {
  id: 'achievements', name: '実績', icon: '🏆',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
