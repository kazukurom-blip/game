// 宝石の合成・はめる・外す、ルーンとルーン語の一覧
// 担当: アイテム担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const gemsPanel = {
  id: 'gems', name: '宝石', icon: '💎',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
