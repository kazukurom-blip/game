// 素材・通貨。分解やドロップで手に入り、クラフトに使う。アイコンの差し替え枠は icon.mat.<id>。
// アイテム担当がオーブなどを足す（crafting.js と対応）。

export const MATERIALS = [
  { id: 'scrap', name: '鉄屑', desc: 'ノーマル装備を分解すると出る。強化に使う。', color: '#a0a0a0', tier: 0 },
  { id: 'dust', name: '魔塵', desc: 'マジック装備を分解すると出る。オプションの付け替えに使う。', color: '#5aa0ff', tier: 1 },
  { id: 'crystal', name: '秘晶', desc: 'レア・エピック装備を分解すると出る。上位のクラフトに使う。', color: '#ffe25a', tier: 2 },
  { id: 'echo', name: '伝説の残響', desc: 'レジェンダリー以上を分解すると出る。伝説の力の抽出に使う。', color: '#ff9a2e', tier: 3 },
  { id: 'core', name: '原初の核', desc: '太古・原初の装備を分解すると出る。最上位のクラフトに使う。', color: '#ff4d6d', tier: 4 },
  { id: 'shard', name: '深淵の欠片', desc: '裂け目やボスから。商人のガチャ（目利き）に使う。', color: '#c77dff', tier: 2 },
];
export const MATERIAL = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

/** 分解したときに出る素材（レアリティごと）。[素材, 最小, 最大] */
export const SALVAGE = {
  common: [['scrap', 1, 2]],
  magic: [['dust', 1, 2], ['scrap', 0, 1]],
  rare: [['crystal', 1, 1], ['dust', 1, 2]],
  epic: [['crystal', 2, 3], ['dust', 2, 3]],
  legendary: [['echo', 1, 1], ['crystal', 1, 2]],
  set: [['echo', 1, 1], ['crystal', 1, 2]],
  unique: [['echo', 1, 2], ['crystal', 1, 2]],
  mythic: [['echo', 3, 5], ['core', 1, 1]],
};
