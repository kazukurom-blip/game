// パッシブの星座盤（ドラッグで動かす・拡大縮小・点を押して振る）とパラゴン
// 担当: 戦闘/スキル担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const treePanel = {
  id: 'tree', name: 'パッシブ', icon: '✺',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
