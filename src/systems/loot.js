// レア度とドロップ抽選
import { ITEMS } from '../data/items.js';

export const RARITY = {
  common:    { name: 'ノーマル',     color: '#ffffff', glow: null,      order: 0 },
  rare:      { name: 'レア',         color: '#4da6ff', glow: '#4da6ff', order: 1 },
  epic:      { name: 'エピック',     color: '#b04dff', glow: '#b04dff', order: 2 },
  legendary: { name: 'レジェンダリ', color: '#ffb800', glow: '#ffd23f', order: 3 },
  mythic:    { name: 'ミシック',     color: '#ff3d7f', glow: '#ff3dd2', order: 4 },
  // PET 専用レア度（虹色。UI は gradient があれば虹グラデーション、なければ color）
  pet:       { name: 'PET',          color: '#ff6fd8', glow: '#fff06a', order: 5,
               gradient: ['#ff3d7f', '#ffb800', '#fff06a', '#5cff9a', '#19f0ff', '#7a3dff'], rainbow: true },
};

export function rarityOf(id) {
  const it = ITEMS[id];
  return it ? RARITY[it.rarity] || RARITY.common : RARITY.common;
}

export function isRare(item) {
  return !!item && item.rarity && item.rarity !== 'common';
}

// ルーク補正: luck 0 → 1倍, 100 → 1.5倍, 上限 3倍（確率は最大 1）
export function luckMultiplier(luck = 0) {
  return Math.min(3, 1 + Math.max(0, luck) * 0.005);
}

/**
 * rollDrops(enemyDef, luck, rng, opts={dropMult, moneyMult}) → [{id} | {money:n}]
 * 装備（equip）にのみルーク補正を強く、それ以外は弱めにかける。
 * v3: dropMult（潜在ドロップ率・曜日イベント。PET は半分の効果）, moneyMult（潜在所持金・曜日イベント）
 */
export function rollDrops(enemyDef, luck = 0, rng = Math.random, opts = {}) {
  const dm = Number.isFinite(opts.dropMult) && opts.dropMult > 0 ? opts.dropMult : 1;
  const mm = Number.isFinite(opts.moneyMult) && opts.moneyMult > 0 ? opts.moneyMult : 1;
  const out = [];
  if (!enemyDef) return out;
  const lm = luckMultiplier(luck);
  // お金
  const [mn, mx] = enemyDef.money || [0, 0];
  if (mx > 0 && (enemyDef.boss || rng() < 0.75)) {
    const amount = Math.round((mn + rng() * (mx - mn)) * mm);
    if (enemyDef.boss) {
      // ボスは札束を複数に分けてばらまく
      const n = 5;
      for (let i = 0; i < n; i++) out.push({ money: Math.max(1, Math.round(amount / n)) });
    } else if (amount > 0) out.push({ money: amount });
  }
  for (const d of enemyDef.drops || []) {
    const it = ITEMS[d.id];
    if (!it) continue;
    // PET は LUK で微増（効果半分）、装備は強め、その他は弱め
    const base = it.slot === 'pet' ? 1 + (lm - 1) * 0.5 : it.type === 'equip' ? lm : 1 + (lm - 1) * 0.3;
    const mult = base * (it.slot === 'pet' ? 1 + (dm - 1) * 0.5 : dm);
    if (rng() < Math.min(1, d.chance * mult)) out.push({ id: d.id });
  }
  return out;
}
