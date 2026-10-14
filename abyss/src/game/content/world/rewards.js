// 倒したときの追加の報酬（gameHooks.rewardMods）:
//   ため込み屋 4 種 … 金貨（ゴールド ×6）/ 宝石（秘晶・深淵の欠片、5% で深淵の宝石）/ がらくた（素材の山）/ 欠片（欠片とレジェンダリー確定）
//                     どれもアイテム +4（レア以上が出やすい）
//   呪われた宝箱 … 守り手を全部倒すとレア以上 3 つ
//   門の欠片 … 苦行で地域のボス（1〜4 番目の地域）が落とす（50% + 苦行の段 × 2%、最大 80%）
// 見た目: { t: 'loot' ... }（既存）・game.events 'goblinKill' / 'gateFragment' / 'chestOpen'

import { gameHooks } from '../../game.js';
import { onWorldInstall } from '../../systems/world.js';
import { generateItem } from '../../loot.js';
import { ZONE, GATE_GROUPS, gateGroupOfAct } from '../../../data/world.js';

export const GOBLIN_REWARD = {
  gold: { items: 4, goldMul: 6, mats: { scrap: [4, 8] } },
  gem: { items: 4, goldMul: 1, mats: { crystal: [4, 8], shard: [2, 4] }, legendaryGem: 0.05 },
  mat: { items: 4, goldMul: 1, mats: { scrap: [10, 20], dust: [8, 14], crystal: [3, 6], echo: [1, 2] } },
  shard: { items: 4, goldMul: 1, mats: { shard: [5, 9] }, legendary: 1 },
};

/** 追加のアイテムを作る。商人の bonusDrops があればそちらに任せる */
export function extraItems(game, u, n, opts = {}) {
  const m = game.sys.merchant;
  if (typeof m?.bonusDrops === 'function') {
    try {
      const r = m.bonusDrops(u, n);
      if (Array.isArray(r)) return r;
      if (r !== undefined) return [];
    } catch (e) { console.error('[world:bonusDrops]', e); }
  }
  const st = game.state;
  const H = game.H || {};
  const diff = game.sys.world.difficulty();
  const out = [];
  for (let i = 0; i < n; i++) {
    const it = generateItem(game.rng, {
      ilvl: u.level, cls: st.hero.cls, mf: (H.mf || 0) + (diff.mf || 0) + (opts.mf || 80), rank: opts.rank || 'goblin', torment: st.world.torment,
      minRarity: opts.minRarity || null, rarity: i < (opts.forced || 0) ? opts.forcedRarity : undefined, ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0,
    });
    if (it) out.push(it);
  }
  return out;
}

export function addMats(game, mats, mul = 1) {
  const inv = game.state.inv.mats;
  const got = {};
  for (const [id, [a, b]] of Object.entries(mats)) {
    const n = Math.round(game.rng.int(a, b) * mul);
    if (n > 0) { inv[id] = (inv[id] || 0) + n; got[id] = n; }
  }
  return got;
}

// game.js はこのファイルより後に読み込まれ終わるので、登録は Game を作るときに行う
onWorldInstall(() => gameHooks.rewardMods.push((game, u, reward) => {
  const st = game.state;
  const ws = game.sys.world;
  // ---- ため込み屋
  if (u.def?.kind === 'goblin') {
    const R = GOBLIN_REWARD[u.def.goblin] || GOBLIN_REWARD.gold;
    reward.gold = Math.max(reward.gold, 1) * R.goldMul;
    const forced = R.legendary || 0;
    reward.items.push(...extraItems(game, u, R.items, { minRarity: 'magic', forced, forcedRarity: 'legendary' }));
    const t = st.world.torment || 0;
    const got = addMats(game, R.mats, 1 + Math.floor(u.level / 25) * 0.5 + t * 0.1);
    if (R.legendaryGem && game.rng.chance(R.legendaryGem)) { try { game.sys.gems?.grantLegendaryGem?.(); got.legendaryGem = 1; } catch (e) { console.error(e); } }
    st.meta.stats.goblins = (st.meta.stats.goblins || 0) + 1;
    game.events.emit('goblinKill', { unit: u, kind: u.def.goblin, mats: got, items: reward.items.length });
    game.events.emit('invChanged', {});
  }
  // ---- 呪われた宝箱
  if (u.tag === 'chest' && !game.combat.units.some((x) => !x.dead && x.tag === 'chest' && x !== u)) {
    reward.items.push(...extraItems(game, u, 3, { minRarity: 'rare', mf: 100, rank: 'rare' }));
    game.events.emit('chestOpen', { unit: u });
    game.combat.emit({ t: 'text', x: u.x, y: u.y, z: 130, text: '宝箱が開いた！', color: '#ffd860' });
  }
  // ---- 門の欠片（苦行・地域のボス）
  if (u === ws.bossUnit && st.world.mode === 'campaign' && (st.world.torment || 0) >= 1) {
    const z = ws.zone();
    if (z && z.zoneIdx <= 3) {
      const t = st.world.torment;
      if (game.rng.chance(Math.min(0.8, 0.5 + t * 0.02))) {
        const gi = gateGroupOfAct(z.act);
        const key = `${GATE_GROUPS[gi].id}_${z.zoneIdx}`;
        const g = st.world.gate;
        g.frags[key] = (g.frags[key] || 0) + 1;
        game.events.emit('gateFragment', { group: gi, kind: z.zoneIdx, key, name: GATE_GROUPS[gi].frags[z.zoneIdx] });
        game.combat.emit({ t: 'text', x: u.x, y: u.y, z: 160, text: `${GATE_GROUPS[gi].frags[z.zoneIdx]}を手に入れた`, color: GATE_GROUPS[gi].color });
      }
    }
  }
}));

export { ZONE };
