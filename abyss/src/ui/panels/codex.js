// 伝説の力の抽出と装着（3 枠）・図鑑
// 担当: アイテム担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const codexPanel = {
  id: 'codex', name: '極意', icon: '📜',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
