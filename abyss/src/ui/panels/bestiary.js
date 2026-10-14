// 魔物図鑑と宝物図鑑（集めたユニーク・セット・ミシック）
// 担当: メタ担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const bestiaryPanel = {
  id: 'bestiary', name: '図鑑', icon: '📖',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
