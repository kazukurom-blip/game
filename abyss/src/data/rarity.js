// レアリティ（希少度）。色・名前・オプション数・演出の強さ。
// idx が大きいほど珍しい。ancient（太古）/ primal（原初）は品質の上乗せで、レアリティとは別に持つ。

export const RARITIES = [
  { id: 'common', idx: 0, name: 'ノーマル', color: '#c8c8c8', glow: null, affixes: [0, 0], beam: 0, sfx: 'drop_common' },
  { id: 'magic', idx: 1, name: 'マジック', color: '#5aa0ff', glow: '#2a6cff', affixes: [1, 2], beam: 0, sfx: 'drop_magic' },
  { id: 'rare', idx: 2, name: 'レア', color: '#ffe25a', glow: '#ffc400', affixes: [3, 4], beam: 1, sfx: 'drop_rare' },
  { id: 'epic', idx: 3, name: 'エピック', color: '#c56bff', glow: '#9b30ff', affixes: [5, 6], beam: 2, sfx: 'drop_epic' },
  { id: 'legendary', idx: 4, name: 'レジェンダリー', color: '#ff9a2e', glow: '#ff7a00', affixes: [4, 4], beam: 3, sfx: 'drop_legendary', power: true },
  { id: 'set', idx: 5, name: 'セット', color: '#3dff7a', glow: '#00d65a', affixes: [3, 3], beam: 3, sfx: 'drop_set', fixed: true },
  { id: 'unique', idx: 6, name: 'ユニーク', color: '#e8b56b', glow: '#c98a2b', affixes: [0, 0], beam: 3, sfx: 'drop_unique', fixed: true },
  { id: 'mythic', idx: 7, name: 'ミシック', color: '#ff4d6d', glow: '#ff0040', affixes: [0, 0], beam: 4, sfx: 'drop_mythic', fixed: true },
];
export const RARITY = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

export const QUALITY = {
  0: { id: 'normal', name: '', mult: 1, color: null },
  1: { id: 'ancient', name: '覚醒の', mult: 1.3, color: '#ffd27a', badge: '覚醒' },
  2: { id: 'primal', name: '極致の', mult: 1.6, color: '#ff3355', badge: '極致' },
};

export const rarityColor = (id) => RARITY[id]?.color ?? '#fff';
