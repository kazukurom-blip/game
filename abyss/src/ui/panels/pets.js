// ペット（卵・孵す・育てる・連れて歩く）
// 担当: メタ担当（土台だけ。中身は担当が作る）
import { h } from '../dom.js';

export const petsPanel = {
  id: 'pets', name: 'ペット', icon: '🐾',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  render(ui, el) {
    el.append(h('p.dim', '準備中'));
  },
};
