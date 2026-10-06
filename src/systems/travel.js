// ワールド構成（SPEC_V2 確定版）・訪問記録・タクシー（ファストトラベル）
// UI のワールドマップ(M) は WORLD_GRAPH / MAP_INFO / WORLD_EDGES を使う。
// 名前はワールド担当の src/world/maps.js に同じ id があればその name を優先する（getter で常に最新）。
import { MAPS } from '../world/maps.js';

// 町 7 つ（region は背景テーマ兼地域ID）
export const TOWN_IDS = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop', 'spaceport'];

// id → 基本情報。pos は簡易ワールドマップ用の正規化座標（0〜1, 左上原点）
const BASE_INFO = {
  // beach
  beach:      { name: 'ヴァイス・ビーチ',        region: 'beach', town: true,  levelRange: [1, 10],  grid: [1, 7] },
  beach_f1:   { name: 'サンセット海岸道',        region: 'beach', town: false, levelRange: [1, 3],   grid: [2, 7] },
  beach_f2:   { name: 'ヤシの並木道',            region: 'beach', town: false, levelRange: [3, 6],   grid: [3, 7] },
  beach_f3:   { name: 'ピア桟橋',                region: 'beach', town: false, levelRange: [5, 9],   grid: [0, 7], deadEnd: true, boss: 'boss_king_slime' },
  beach_f4:   { name: 'ハイウェイ入口',          region: 'beach', town: false, levelRange: [8, 12],  grid: [4, 7] },
  // downtown
  downtown:   { name: 'ダウンタウン',            region: 'downtown', town: true,  levelRange: [10, 22], grid: [5, 6] },
  down_f1:    { name: 'ネオン裏通り',            region: 'downtown', town: false, levelRange: [10, 14], grid: [6, 7] },
  down_f2:    { name: '地下鉄トンネル',          region: 'downtown', town: false, levelRange: [13, 18], grid: [7, 7], deadEnd: true, boss: 'boss_rat_king' },
  down_f3:    { name: '高架ハイウェイ',          region: 'downtown', town: false, levelRange: [16, 22], grid: [5, 5] },
  down_f4:    { name: 'セントラル公園',          region: 'downtown', town: false, levelRange: [14, 20], grid: [4, 5] },
  // slums
  slums:      { name: 'ポート・スラム',          region: 'slums', town: true,  levelRange: [20, 36], grid: [5, 3] },
  slums_f1:   { name: '倉庫街',                  region: 'slums', town: false, levelRange: [20, 25], grid: [5, 4] },
  slums_f2:   { name: '造船所',                  region: 'slums', town: false, levelRange: [24, 30], grid: [4, 2] },
  slums_f3:   { name: '密輸船',                  region: 'slums', town: false, levelRange: [28, 34], grid: [4, 1], deadEnd: true, boss: 'boss_captain' },
  slums_f4:   { name: '廃線路',                  region: 'slums', town: false, levelRange: [30, 36], grid: [6, 3] },
  // swamp
  swamp:      { name: 'グレイズ村',              region: 'swamp', town: true,  levelRange: [22, 45], grid: [2, 4] },
  swamp_f1:   { name: '湿地の入口',              region: 'swamp', town: false, levelRange: [22, 28], grid: [3, 4] },
  swamp_f2:   { name: 'マングローブ迷路',        region: 'swamp', town: false, levelRange: [30, 38], grid: [1, 5] },
  swamp_f3:   { name: 'ワニの巣',                region: 'swamp', town: false, levelRange: [36, 44], grid: [0, 5], deadEnd: true, boss: 'boss_gator' },
  swamp_f4:   { name: '霧の水路',                region: 'swamp', town: false, levelRange: [38, 45], grid: [2, 3] },
  // casino
  casino:     { name: 'ゴールデン・ストリップ',  region: 'casino', town: true,  levelRange: [42, 60], grid: [2, 1] },
  casino_f1:  { name: '砂漠ハイウェイ',          region: 'casino', town: false, levelRange: [42, 48], grid: [2, 2] },
  casino_f2:  { name: '地下金庫',                region: 'casino', town: false, levelRange: [48, 55], grid: [1, 1] },
  casino_f3:  { name: 'VIPフロア',               region: 'casino', town: false, levelRange: [54, 60], grid: [0, 1], deadEnd: true, boss: 'boss_mecha' },
  casino_f4:  { name: '夜景ブールバード',        region: 'casino', town: false, levelRange: [52, 58], grid: [3, 0] },
  // rooftop（タワー）
  rooftop:    { name: 'ヴァイス・タワー',        region: 'rooftop', town: true,  levelRange: [58, 76], grid: [5, 0] },
  tower_f1:   { name: '工事現場の足場',          region: 'rooftop', town: false, levelRange: [58, 64], grid: [4, 0] },
  tower_f2:   { name: '空中庭園',                region: 'rooftop', town: false, levelRange: [64, 70], grid: [6, 0] },
  tower_f3:   { name: '最上階ペントハウス',      region: 'rooftop', town: false, levelRange: [70, 76], grid: [7, 0], deadEnd: true, boss: 'boss_don' },
  // spaceport
  spaceport:  { name: 'ルミナ宇宙港',            region: 'spaceport', town: true,  levelRange: [36, 100], grid: [8, 2] },
  space_f1:   { name: '沿岸ロケット道',          region: 'spaceport', town: false, levelRange: [36, 42],  grid: [7, 3] },
  space_f2:   { name: '発射台エリア',            region: 'spaceport', town: false, levelRange: [42, 50],  grid: [8, 3] },
  space_f3:   { name: '月面シミュ区画',          region: 'spaceport', town: false, levelRange: [75, 85],  grid: [8, 1] },
  space_f4:   { name: '謎の宇宙船',              region: 'spaceport', town: false, levelRange: [85, 100], grid: [8, 0], deadEnd: true, boss: 'boss_alien' },
};

// 接続（ポータル。双方向）
export const WORLD_EDGES = [];
const CHAINS = [
  ['beach', 'beach_f1', 'beach_f2', 'beach_f4', 'downtown'],
  ['beach', 'beach_f3'],
  ['downtown', 'down_f1', 'down_f2'],
  ['downtown', 'down_f3', 'slums_f1', 'slums'],
  ['downtown', 'down_f4', 'swamp_f1', 'swamp'],
  ['slums', 'slums_f2', 'slums_f3'],
  ['slums', 'slums_f4', 'space_f1', 'space_f2', 'spaceport'],
  ['swamp', 'swamp_f2', 'swamp_f3'],
  ['swamp', 'swamp_f4', 'casino_f1', 'casino'],
  ['casino', 'casino_f2', 'casino_f3'],
  ['casino', 'casino_f4', 'tower_f1', 'rooftop'],
  ['rooftop', 'tower_f2', 'tower_f3'],
  ['spaceport', 'space_f3', 'space_f4'],
];
for (const c of CHAINS) for (let i = 0; i < c.length - 1; i++) WORLD_EDGES.push([c[i], c[i + 1]]);

/** WORLD_GRAPH = {mapId: [隣接mapId]} */
export const WORLD_GRAPH = {};
for (const id of Object.keys(BASE_INFO)) WORLD_GRAPH[id] = [];
for (const [a, b] of WORLD_EDGES) { WORLD_GRAPH[a].push(b); WORLD_GRAPH[b].push(a); }

export const WORLD_MAP_IDS = Object.keys(BASE_INFO);
export const FIELD_IDS = WORLD_MAP_IDS.filter((id) => !BASE_INFO[id].town);
const GRID_W = 9, GRID_H = 8;

function worldMap(id) {
  try { return MAPS?.[id] || null; } catch { return null; } // 循環 import 中の TDZ 対策
}

/** MAP_INFO = {id: {id, name, region, town, levelRange, deadEnd?, boss?, pos:{x,y}, neighbors}}（name は maps.js 優先） */
export const MAP_INFO = {};
for (const [id, b] of Object.entries(BASE_INFO)) {
  const info = {
    id, region: b.region, town: b.town, levelRange: b.levelRange,
    deadEnd: !!b.deadEnd, boss: b.boss || null,
    pos: { x: (b.grid[0] + 0.5) / GRID_W, y: (b.grid[1] + 0.5) / GRID_H },
    neighbors: WORLD_GRAPH[id],
    baseName: b.name,
  };
  Object.defineProperty(info, 'name', {
    enumerable: true,
    get() { return worldMap(id)?.name || b.name; },
  });
  MAP_INFO[id] = info;
}

/** mapInfo(id) → MAP_INFO[id]。未知の id（旧マップ等）は maps.js から推定 */
export function mapInfo(id) {
  if (MAP_INFO[id]) return MAP_INFO[id];
  const m = worldMap(id);
  if (!m) return null;
  return { id, name: m.name || id, region: m.region || m.theme || 'beach', town: !!m.town, levelRange: m.levelRange || [1, 1], pos: { x: 0.5, y: 0.5 }, neighbors: (m.portals || []).map((p) => p.to) };
}
export function mapName(id) { return mapInfo(id)?.name || id; }

/** 町か（maps.js の town を優先、未定義なら仕様表） */
export function isTownMap(id) {
  const m = worldMap(id);
  if (m && typeof m.town === 'boolean') return m.town;
  return !!MAP_INFO[id]?.town;
}
/** フィールドか（town === false。旧マップで town 未定義なら仕様表） */
export function isFieldMap(map) {
  if (!map) return false;
  if (typeof map.town === 'boolean') return !map.town;
  const info = MAP_INFO[map.id];
  return !!info && !info.town;
}

/** グラフ上のホップ数（到達不可なら Infinity） */
export function mapDistance(a, b) {
  if (a === b) return 0;
  const seen = new Set([a]); let frontier = [a]; let d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const c of frontier) {
      for (const n of WORLD_GRAPH[c] || worldMap(c)?.portals?.map((p) => p.to) || []) {
        if (seen.has(n)) continue;
        if (n === b) return d;
        seen.add(n); next.push(n);
      }
    }
    frontier = next;
  }
  return Infinity;
}

// ---- 訪問記録 ----
export function markVisited(state, mapId) {
  if (!state || !mapId) return false;
  if (!Array.isArray(state.visited)) state.visited = [];
  if (state.visited.includes(mapId)) return false;
  state.visited.push(mapId);
  return true;
}
export function isVisited(state, mapId) { return !!state?.visited?.includes(mapId); }

/** ワールドマップ表示用: 'current' | 'visited' | 'adjacent'(???) | 'hidden' */
export function mapVisibility(state, mapId) {
  if (state?.mapId === mapId) return 'current';
  if (isVisited(state, mapId)) return 'visited';
  const nb = WORLD_GRAPH[mapId] || [];
  if (nb.some((n) => isVisited(state, n) || state?.mapId === n)) return 'adjacent';
  return 'hidden';
}

/** attachTravel(game) — mapChanged で訪問記録。戻り値: 購読解除関数 */
export function attachTravel(game) {
  if (game._travelUnsub) return game._travelUnsub;
  const ev = game.events;
  if (game.state) markVisited(game.state, game.map?.id || game.state.mapId);
  const off = ev?.on('mapChanged', (d) => {
    const id = d?.mapId || game.map?.id;
    if (markVisited(game.state, id) && isTownMap(id)) {
      game.notify?.(`${mapName(id)} を訪れた！ タクシーで移動できるようになった`, '#ffd23f');
    }
    game.events?.emit('visitedChanged', { mapId: id });
  });
  game._travelUnsub = () => { off?.(); game._travelUnsub = null; };
  return game._travelUnsub;
}

// ---- タクシー ----
export const TAXI_BASE = 50;
export const TAXI_PER_HOP_LEVEL = 6;

/** taxiFare(game, mapId) → 料金 $（距離ホップ × プレイヤーLv × 6 + 50）。不可なら null */
export function taxiFare(game, mapId) {
  const st = game.state;
  const from = game.map?.id || st?.mapId;
  if (!st || !MAP_INFO[mapId] || from === mapId) return null;
  const hops = mapDistance(from, mapId);
  if (!Number.isFinite(hops)) return null;
  return Math.round(TAXI_BASE + hops * Math.max(1, st.level || 1) * TAXI_PER_HOP_LEVEL);
}

/** canTaxi(game, mapId) → {ok, msg, fare} */
export function canTaxi(game, mapId) {
  const st = game.state;
  if (!st) return { ok: false, msg: 'データがありません' };
  const from = game.map?.id || st.mapId;
  if (!MAP_INFO[mapId] && !worldMap(mapId)) return { ok: false, msg: '行き先が見つからない' };
  if (!isTownMap(mapId)) return { ok: false, msg: 'タクシーは町にしか行けない' };
  if (!isVisited(st, mapId)) return { ok: false, msg: 'まだ訪れていない町だ' };
  if (from === mapId) return { ok: false, msg: 'もうここにいる' };
  if (!worldMap(mapId)) return { ok: false, msg: 'その町への道は工事中だ' };
  const fare = taxiFare(game, mapId);
  if (fare == null) return { ok: false, msg: 'そこへの道がない' };
  if ((st.money || 0) < fare) return { ok: false, msg: `お金が足りない（$${fare}）`, fare };
  return { ok: true, msg: '', fare };
}

/** taxiTravel(game, mapId) → {ok, msg, fare?}（訪問済みの町のみ。お金を払って game.changeMap） */
export function taxiTravel(game, mapId) {
  const c = canTaxi(game, mapId);
  if (!c.ok) { game.notify?.(c.msg, '#ff8a8a'); return c; }
  game.state.money -= c.fare;
  game.changeMap(mapId);
  const msg = `タクシーで ${mapName(mapId)} へ（-$${c.fare}）`;
  game.notify?.(msg, '#ffd23f');
  game.events?.emit('taxiTravel', { mapId, fare: c.fare, name: mapName(mapId) });
  return { ok: true, msg, fare: c.fare };
}
