// モンスター図鑑: state.book[enemyId] = 撃破数
// 初撃破で登録（events 'bookNew'）。撃破数 10/50/100 でランク 1/2/3（events 'bookRank'）。
// 登録数・ランク・地域コンプで永続ボーナス → progression.computeStats に反映。
import { ENEMIES, ENEMY_REGIONS } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';

export const BOOK_RANKS = [10, 50, 100];
export const BOOK_RANK_NAMES = ['', 'ブロンズ', 'シルバー', 'ゴールド'];
export const REGION_NAMES = {
  beach: 'ビーチ', downtown: 'ダウンタウン', slums: 'ポート・スラム', swamp: 'スワンプ',
  casino: 'カジノ', rooftop: 'ヴァイス・タワー', spaceport: 'ルミナ宇宙港', police: '警察',
};
// 地域コンプ（その地域のモンスター＋ボスを全種登録）ボーナス
export const REGION_COMPLETE_BONUS = {
  beach: { maxHp: 50 },
  downtown: { atk: 4 },
  slums: { def: 8 },
  swamp: { maxMp: 80, maxHp: 80 },
  casino: { luk: 6, crit: 0.01 },
  rooftop: { atk: 10, def: 10 },
  spaceport: { atk: 12, maxHp: 200, crit: 0.02 },
  police: { def: 5 },
};

/** 図鑑に載る敵（市民を除く。警官は 'police' 地域として掲載） */
export function isBookTarget(def) { return !!def && !def.civilian; }
export const BOOK_IDS = Object.values(ENEMIES).filter(isBookTarget)
  .sort((a, b) => regionOrder(a.region) - regionOrder(b.region) || (a.boss - b.boss) || a.level - b.level)
  .map((e) => e.id);
function regionOrder(r) { const i = ENEMY_REGIONS.indexOf(r); return i < 0 ? 99 : i; }

export function bookRank(kills) {
  let r = 0;
  for (let i = 0; i < BOOK_RANKS.length; i++) if ((kills || 0) >= BOOK_RANKS[i]) r = i + 1;
  return r;
}

/** bookEntries(state?) → [{id, name, level, region, regionName, habitats, boss, art, kills, registered, rank, rankName, nextRank, drops:[{id, name, rarity, known}]}] */
export function bookEntries(state) {
  const book = state?.book || {};
  const found = state?.itemsFound || {};
  const rare = new Set(state?.rareFound || []);
  return BOOK_IDS.map((id) => {
    const e = ENEMIES[id];
    const kills = book[id] || 0;
    const rank = bookRank(kills);
    return {
      id, def: e, name: e.name, level: e.level, region: e.region, regionName: REGION_NAMES[e.region] || e.region,
      habitats: e.habitats, boss: !!e.boss, isCop: !!e.isCop, art: e.art,
      kills, registered: kills > 0, rank, rankName: BOOK_RANK_NAMES[rank],
      nextRank: BOOK_RANKS[rank] ?? null,
      drops: (e.drops || []).filter((d) => ITEMS[d.id]).map((d) => ({
        id: d.id, name: ITEMS[d.id].name, rarity: ITEMS[d.id].rarity, chance: d.chance,
        known: kills > 0 && (!!found[d.id] || rare.has(d.id)),
      })),
    };
  });
}

/** 地域別の登録状況 {region: {total, registered, complete}} */
export function bookProgress(state) {
  const book = state?.book || {};
  const out = {};
  for (const id of BOOK_IDS) {
    const r = ENEMIES[id].region;
    const o = (out[r] ||= { total: 0, registered: 0, complete: false, name: REGION_NAMES[r] || r });
    o.total++;
    if (book[id] > 0) o.registered++;
  }
  for (const o of Object.values(out)) o.complete = o.total > 0 && o.registered === o.total;
  return out;
}

const ZERO = () => ({ atk: 0, def: 0, maxHp: 0, maxMp: 0, crit: 0, luk: 0 });
let _cacheKey = null, _cacheVal = null;

/**
 * bookBonus(state) → {atk, def, maxHp, maxMp, crit(0〜1), luk, registered, total, completeRegions:[...]}
 *  - 登録 1 種ごとに maxHp+3、4 種ごとに atk+1、5 種ごとに def+1
 *  - ランク合計 1 ごとに crit +0.01%（上限 +3%）
 *  - 地域コンプで REGION_COMPLETE_BONUS
 */
export function bookBonus(state) {
  const book = state?.book;
  if (!book) return { ...ZERO(), registered: 0, total: BOOK_IDS.length, completeRegions: [] };
  const key = JSON.stringify(book);
  if (key === _cacheKey) return _cacheVal;
  const b = ZERO();
  let registered = 0, rankSum = 0;
  for (const id of BOOK_IDS) {
    const k = book[id] || 0;
    if (k > 0) registered++;
    rankSum += bookRank(k);
  }
  b.maxHp += registered * 3;
  b.atk += Math.floor(registered / 4);
  b.def += Math.floor(registered / 5);
  b.crit += Math.min(0.03, rankSum * 0.0001);
  const completeRegions = [];
  for (const [r, o] of Object.entries(bookProgress(state))) {
    if (!o.complete) continue;
    completeRegions.push(r);
    for (const [k, v] of Object.entries(REGION_COMPLETE_BONUS[r] || {})) b[k] = (b[k] || 0) + v;
  }
  _cacheKey = key;
  _cacheVal = { ...b, registered, total: BOOK_IDS.length, completeRegions };
  return _cacheVal;
}

/** 撃破を記録（combat.killEnemy から呼ぶ）。初回は bookNew、ランクアップは bookRank を emit */
export function bookRecord(game, enemyId) {
  const st = game.state;
  const def = ENEMIES[enemyId];
  if (!st || !isBookTarget(def)) return 0;
  if (!st.book) st.book = {};
  const before = st.book[enemyId] || 0;
  const after = before + 1;
  st.book[enemyId] = after;
  if (before === 0) {
    const n = Object.keys(st.book).filter((k) => st.book[k] > 0 && ENEMIES[k] && isBookTarget(ENEMIES[k])).length;
    game.notify?.(`図鑑に登録: ${def.name}  NEW!（${n}/${BOOK_IDS.length}）`, '#5cff9a');
    game.events?.emit('bookNew', { id: enemyId, count: n, total: BOOK_IDS.length });
    const prog = bookProgress(st)[def.region];
    if (prog?.complete) {
      game.notify?.(`${prog.name} の図鑑コンプリート！ 永続ボーナス獲得`, '#ffd23f');
      game.events?.emit('bookComplete', { region: def.region });
    }
  }
  const rb = bookRank(before), ra = bookRank(after);
  if (ra > rb) {
    if (ra > 0 && before > 0) game.notify?.(`図鑑ランクUP: ${def.name} ${BOOK_RANK_NAMES[ra]}`, '#ffd23f');
    game.events?.emit('bookRank', { id: enemyId, rank: ra });
  }
  return after;
}
