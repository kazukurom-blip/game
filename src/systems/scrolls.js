// 移動の書（MapleStory の「帰還の書」「町の移動書」）
//  帰還の書 scroll_return: 今いる地域の町へすぐ戻る（町・ボス部屋・塔・闘技場では使えない）
//  町移動の書 scroll_town: 行ったことのある町を選んで飛ぶ（Lv30 から。同じワールドの町だけ）
import { ITEMS } from '../data/items.js';
import { TOWN_IDS, W2_TOWN_IDS, isTownMap, isVisited, mapName, mapDistance, worldOfMap } from './travel.js';
import { MAPS } from '../world/maps.js';
import { countItem, removeItem } from './inventory.js';

export const TOWN_SCROLL_LV = 30;
const worldMap = (id) => { try { return MAPS?.[id] || null; } catch { return null; } };

/** その場所から一番近い町（同じ地域の町を優先。無ければ道でつながる一番近い町） */
export function nearestTownOf(mapId) {
  if (!mapId) return null;
  if (isTownMap(mapId)) return mapId;
  const m = worldMap(mapId);
  const w = worldOfMap(mapId);
  const towns = w === 2 ? W2_TOWN_IDS : TOWN_IDS;
  const region = m?.region;
  const same = towns.find((t) => t === region || t === `w2_${region}`);
  if (same && worldMap(same)) return same;
  let best = null, bd = Infinity;
  for (const t of towns) { const d = mapDistance(mapId, t); if (d < bd) { bd = d; best = t; } }
  return best;
}

function blocked(game) {
  const m = game.map;
  if (!m) return '今は使えない';
  if (m.instance) return 'ここでは使えない（ボス戦・塔・闘技場の中）';
  if ((game.state?.hp ?? 1) <= 0) return '倒れているときは使えない';
  return null;
}

/** 帰還の書を使う → bool（使えたら 1 枚へる） */
export function useReturnScroll(game, id = 'scroll_return') {
  const st = game.state;
  if (countItem(st, id) <= 0) { game.notify?.(`${ITEMS[id]?.name || id} を持っていません`, '#ff5555'); return false; }
  const why = blocked(game);
  if (why) { game.notify?.(why, '#ff8a8a'); return false; }
  const from = game.map?.id || st.mapId;
  if (isTownMap(from)) { game.notify?.('もう町にいる', '#aaaaaa'); return false; }
  const to = nearestTownOf(from);
  if (!to || !worldMap(to)) { game.notify?.('戻れる町が見つからない', '#ff8a8a'); return false; }
  removeItem(st, id, 1);
  game.changeMap(to);
  game.notify?.(`${ITEMS[id]?.name || '帰還の書'}で ${mapName(to)} へ戻った`, '#ffd23f');
  game.events?.emit('scrollTravel', { id, mapId: to });
  return true;
}

/** 町移動の書で行ける町の一覧（行ったことがある・同じワールド・今いる町は除く） */
export function townScrollTargets(game) {
  const st = game.state;
  const from = game.map?.id || st?.mapId;
  const w = worldOfMap(from) || 1;
  const towns = w === 2 ? W2_TOWN_IDS : TOWN_IDS;
  return towns.filter((t) => t !== from && worldMap(t) && isVisited(st, t));
}

/** 町移動の書で townId へ飛ぶ → bool */
export function townScrollTravel(game, townId, id = 'scroll_town') {
  const st = game.state;
  if (countItem(st, id) <= 0) { game.notify?.(`${ITEMS[id]?.name || id} を持っていません`, '#ff5555'); return false; }
  if ((st.level || 1) < TOWN_SCROLL_LV) { game.notify?.(`Lv${TOWN_SCROLL_LV} から使える`, '#ff8a8a'); return false; }
  const why = blocked(game);
  if (why) { game.notify?.(why, '#ff8a8a'); return false; }
  if (!townScrollTargets(game).includes(townId)) { game.notify?.('その町へは飛べない（行ったことのある、同じワールドの町だけ）', '#ff8a8a'); return false; }
  removeItem(st, id, 1);
  game.changeMap(townId);
  game.notify?.(`${ITEMS[id]?.name || '町移動の書'}で ${mapName(townId)} へ`, '#ffd23f');
  game.events?.emit('scrollTravel', { id, mapId: townId });
  return true;
}

/** 町移動の書を使う: 行き先を選ぶ窓を出す（6 つより多ければページ送り）→ bool（窓を出せたか） */
export function useTownScroll(game, id = 'scroll_town') {
  const st = game.state;
  if (countItem(st, id) <= 0) { game.notify?.(`${ITEMS[id]?.name || id} を持っていません`, '#ff5555'); return false; }
  if ((st.level || 1) < TOWN_SCROLL_LV) { game.notify?.(`Lv${TOWN_SCROLL_LV} から使える`, '#ff8a8a'); return false; }
  const why = blocked(game);
  if (why) { game.notify?.(why, '#ff8a8a'); return false; }
  const list = townScrollTargets(game);
  if (!list.length) { game.notify?.('飛べる町がまだ無い（町を訪れると増える）', '#aaaaaa'); return false; }
  if (!game.ui?.askChoice) return townScrollTravel(game, list[0], id); // 窓が無いとき（テスト）は最初の町
  const page = (p) => {
    const per = 5, slice = list.slice(p * per, p * per + per);
    const choices = slice.map((t) => ({ id: t, text: `#g${mapName(t)}#k` }));
    if (list.length > per) choices.push({ id: '__next', text: 'ほかの町…', hint: `${p + 1}/${Math.ceil(list.length / per)}` });
    game.ui.askChoice({
      npc: { name: ITEMS[id]?.name || '町移動の書' }, prompt: 'どの町へ飛ぶ？', choices, key: 'scroll_town', cancelText: 'やめる',
      onPick: (cid) => { if (cid === '__next') page((p + 1) % Math.ceil(list.length / per)); else townScrollTravel(game, cid, id); },
    });
  };
  page(0);
  return true;
}
