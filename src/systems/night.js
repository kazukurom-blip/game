// 昼夜で変わる町: 夜限定の敵・夜だけ開く店/NPC（20〜5時）
//  spawner（ワールド担当）は enemyAvailableNow(game, def) で night:true の敵を昼に出さない。
//  NPC の hours:[from, to] / 店の hours は isOpenAt(hours, clock) で判定。
import { isNight } from '../data/balance.js';
import { ENEMIES, NIGHT_ENEMY_IDS } from '../data/enemies.js';
import { NIGHT_SHOPS } from '../data/shops.js';

export { NIGHT_ENEMY_IDS, NIGHT_SHOPS };

/** 現在の時刻（0〜24）: game.clock → state.clock → 12 */
export function clockNow(game) {
  const c = game?.clock ?? game?.map?._clock ?? game?.state?.clock;
  return typeof c === 'number' && Number.isFinite(c) ? c : 12;
}
/** 夜（20〜5時）か */
export function isNightNow(game) { return isNight(clockNow(game)); }

/** hours:[from, to]（from>to は日またぎ）に clock が入るか。hours 無しは常に true */
export function isOpenAt(hours, clock) {
  if (!Array.isArray(hours) || hours.length < 2) return true;
  const [a, b] = hours;
  const h = ((clock % 24) + 24) % 24;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/** その敵を今出してよいか（night:true は夜のみ、day:true は昼のみ） */
export function enemyAvailableNow(game, defOrId) {
  const def = typeof defOrId === 'string' ? ENEMIES[defOrId] : defOrId;
  if (!def) return false;
  if (def.night) return isNightNow(game);
  if (def.day) return !isNightNow(game);
  return true;
}

/** NPC / 店が今開いているか（npc.hours または shop.hours） */
export function npcAvailableNow(game, npcOrShop) { return isOpenAt(npcOrShop?.hours, clockNow(game)); }

/** 夜限定ショップのうち今開いているもの（mapId 指定でその町のみ） */
export function openNightShops(game, mapId = null) {
  return NIGHT_SHOPS.filter((s) => (!mapId || s.mapId === mapId) && isOpenAt(s.hours, clockNow(game)));
}
