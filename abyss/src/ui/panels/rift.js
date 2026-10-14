// 深淵の裂け目（段階を選んで挑む・最高記録・報酬）と苦行の選択
// 担当: ワールド担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const riftPanel = {
  id: 'rift', name: '裂け目', icon: '🌀',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
