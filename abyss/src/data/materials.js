// 素材・通貨。分解やドロップで手に入り、クラフトに使う。アイコンの差し替え枠は icon.mat.<id>。
// アイテム担当が試薬を足す（crafting.js と対応）。src は「どこで手に入るか」の説明（図鑑・ツールチップ用）。

export const MATERIALS = [
  { id: 'scrap', name: '鉄屑', desc: 'ノーマル装備を分解すると出る。強化（+1〜+20）に使う。', src: 'ノーマル装備の分解・商人', color: '#a0a0a0', tier: 0 },
  { id: 'dust', name: '魔塵', desc: 'マジック装備を分解すると出る。オプションの付け替え・祝福に使う。', src: 'マジック以上の分解・商人', color: '#5aa0ff', tier: 1 },
  { id: 'crystal', name: '秘晶', desc: 'レア・エピック装備を分解すると出る。段上げ・混沌・昇格に使う。', src: 'レア以上の分解', color: '#ffe25a', tier: 2 },
  { id: 'echo', name: '伝説の残響', desc: 'レジェンダリー以上を分解すると出る。伝説の力の抽出と、ミシックの交換に使う。', src: 'レジェンダリー・セット・ユニーク・ミシックの分解', color: '#ff9a2e', tier: 3 },
  { id: 'core', name: '原初の核', desc: '太古・原初の装備を分解すると出る（太古 1・原初 3）。ミシックの交換に使う。', src: '太古・原初の分解', color: '#ff4d6d', tier: 4 },
  { id: 'shard', name: '深淵の欠片', desc: 'エリート・ボス・宝ゴブリンから。商人の目利き（部位を選ぶガチャ）に使う。', src: 'エリート（12%）・ボス（2〜4 個）・章のボス（6〜10 個）・宝ゴブリン', color: '#c77dff', tier: 2 },
  // ---- 試薬（1 つの働きを持つ）
  { id: 'chaos', name: '混沌の滴', desc: 'レア・エピックのオプションをすべて振り直す。', src: 'エリート（4%）・ボス（25%）・エピックの分解（15%）', color: '#7affd4', tier: 2 },
  { id: 'ascend', name: '昇華の印', desc: 'マジック → レア → エピックとレアリティを 1 段上げる。', src: 'エリート（2.5%）・ボス（20%）', color: '#ff9cf0', tier: 3 },
  { id: 'bless', name: '祈りの油', desc: 'オプションの段はそのままに、数値だけを振り直す。', src: 'エリート（5%）・ボス（25%）', color: '#fff0a0', tier: 2 },
  { id: 'drill', name: '穿ちの錐', desc: '装備にソケットを 1 つ開ける（部位ごとの上限まで）。', src: 'エリート（3%）・ボス（20%）', color: '#c0c8d8', tier: 2 },
  { id: 'abyssdrop', name: '深淵の雫', desc: '装備を堕落させる最後の賭け。結果は 4 通り（各 25%）。以後その装備は変えられない。', src: 'ボス（6%）・章のボス（40%）・苦行の敵（0.2%）', color: '#ff3a8a', tier: 4 },
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

/** 分解で、まれに出る試薬（レアリティごと）。[素材, 確率] */
export const SALVAGE_BONUS = {
  epic: [['chaos', 0.15], ['bless', 0.1]],
  legendary: [['chaos', 0.1], ['drill', 0.05]],
  set: [['chaos', 0.1], ['drill', 0.05]],
  unique: [['chaos', 0.1], ['drill', 0.05]],
};

/**
 * 敵の格ごとの素材ドロップ。[素材, 確率, 最小, 最大]
 * champion/rare = エリート、boss = 地域のボス、actboss = 章のボス、goblin = 宝ゴブリン、guardian = 裂け目の守護者
 */
export const MAT_DROPS = {
  champion: [['shard', 0.12, 1, 1], ['chaos', 0.04, 1, 1], ['ascend', 0.025, 1, 1], ['bless', 0.05, 1, 1], ['drill', 0.03, 1, 1]],
  rare: [['shard', 0.16, 1, 2], ['chaos', 0.05, 1, 1], ['ascend', 0.03, 1, 1], ['bless', 0.06, 1, 1], ['drill', 0.035, 1, 1]],
  goblin: [['shard', 1, 5, 8], ['chaos', 0.5, 1, 2], ['bless', 0.5, 1, 2], ['drill', 0.3, 1, 1], ['ascend', 0.3, 1, 1]],
  boss: [['shard', 1, 2, 4], ['chaos', 0.25, 1, 1], ['ascend', 0.2, 1, 1], ['bless', 0.25, 1, 1], ['drill', 0.2, 1, 1], ['abyssdrop', 0.06, 1, 1]],
  actboss: [['shard', 1, 6, 10], ['chaos', 0.6, 1, 2], ['ascend', 0.5, 1, 2], ['bless', 0.6, 1, 2], ['drill', 0.5, 1, 1], ['abyssdrop', 0.4, 1, 1]],
  guardian: [['shard', 1, 5, 8], ['chaos', 0.5, 1, 2], ['ascend', 0.4, 1, 1], ['bless', 0.5, 1, 2], ['drill', 0.4, 1, 1], ['abyssdrop', 0.3, 1, 1]],
};
/** 苦行の敵（どの格でも）が落とす深淵の雫の確率 */
export const TORMENT_ABYSSDROP = 0.002;
