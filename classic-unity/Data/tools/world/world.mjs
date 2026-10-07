// 全マップ（maps.mjs の 234 枚）を作る入口。芽吹きの島は手で置いた island.mjs、ほかは generate.mjs。
// 戻り: { maps: { id: json }, problems, stats }
import { ISLAND, ISLAND_BGM, G as IG } from './island.mjs';
import { NPCS } from './npcs.mjs';
import { generateMap } from './generate.mjs';
import { checkWorld } from './check.mjs';

/** 死んだ時・帰還の書で戻る町: ポータルでたどって一番近い町（同じ距離なら同じ地域の町）。島は芽吹き村。 */
export function returnTowns(raw) {
  const R = Object.fromEntries(raw.map((m) => [m[0], m]));
  const out = {};
  for (const [id] of raw) {
    if (id[0] === 'S') { out[id] = 'S003'; continue; }
    if (R[id][2] === '町') { out[id] = id; continue; }
    const seen = new Map([[id, 0]]);
    const q = [id];
    let found = [];
    let depth = Infinity;
    while (q.length) {
      const c = q.shift();
      const d = seen.get(c);
      if (d > depth) break;
      if (R[c][2] === '町' && c !== id) { found.push(c); depth = d; continue; }
      for (const n of R[c][4]) if (R[n] && !seen.has(n)) { seen.set(n, d + 1); q.push(n); }
    }
    found.sort((a, b) => (a[0] === id[0] ? 0 : 1) - (b[0] === id[0] ? 0 : 1) || a.localeCompare(b));
    out[id] = found[0] || null;
  }
  // 乗り物でしか来ない所（雲の船の上）
  if (!out.C118) out.C118 = 'C100';
  return out;
}

function islandMap(raw, L, RAW_BY) {
  const [mid, name, type, lv, links, mobs, note] = raw;
  const yAt = (x) => {
    const pts = L.footholds[0].points;
    for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) return pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * (x - pts[i][0])) / (pts[i + 1][0] - pts[i][0]);
    return IG;
  };
  const portals = [];
  const sx = L.spawn ?? 120;
  portals.push({ name: 'sp', type: 'spawn', x: sx, y: yAt(sx) });
  if (L.town) portals.push({ name: 'town', type: 'town', x: L.town, y: yAt(L.town) });
  for (const [to, pos] of Object.entries(L.portals)) {
    const [x, y] = Array.isArray(pos) ? pos : [pos, yAt(pos)];
    portals.push({ name: `to_${to}`, type: 'visible', x, y, to, toPortal: `to_${mid}` });
  }
  for (const p of L.extraPortals || []) portals.push(p);
  const npcs = NPCS.filter((n) => n[2] === mid).map(([id, nm, , extra = {}]) => {
    const { x, tier: _t, ...rest } = extra;
    return { id, name: nm, x, y: yAt(x), ...rest };
  });
  void RAW_BY; void links;
  return {
    id: mid, name, region: 'S', type, lv: lv || undefined, width: L.width, height: 720,
    bgm: ISLAND_BGM[mid] || 'field_island', bg: L.bg || 'grass', theme: 'island', returnMap: 'S003',
    footholds: L.footholds, ropes: (L.ropes || []).map((r) => ({ ladder: false, ...r })), walls: L.walls || [], portals,
    spawns: (L.spawns || []).map(([mob, x, y]) => ({ mob, x, y: y ?? yAt(x) })), mobMax: L.mobMax || 0, respawnSec: 7,
    timedSpawns: (L.timed || []).map(([mob, x, y, sec]) => ({ mob, x, y, intervalSec: sec })),
    npcs, objects: L.objects || [], note,
  };
}

export function buildWorld({ MAPS_RAW, MONSTERS_RAW }) {
  const monsters = Object.fromEntries(MONSTERS_RAW.map((m) => [m[0], { kind: m[3], move: m[4], lv: m[2] }]));
  const RAW_BY = Object.fromEntries(MAPS_RAW.map((m) => [m[0], m]));
  const ret = returnTowns(MAPS_RAW);
  const maps = {};
  const problems = [];
  let attempts = 0;
  for (const raw of MAPS_RAW) {
    const id = raw[0];
    try {
      if (ISLAND[id]) { maps[id] = islandMap(raw, ISLAND[id], RAW_BY); continue; }
      const r = generateMap(raw, { npcs: NPCS, monsters, returnMap: ret[id] });
      maps[id] = r.map;
      attempts += r.attempts;
    } catch (e) {
      problems.push(e.message);
    }
  }
  for (const n of NPCS) if (!RAW_BY[n[2]]) problems.push(`NPC ${n[0]} のマップ ${n[2]} が無い`);
  const ids = new Set();
  for (const n of NPCS) { if (ids.has(n[0])) problems.push(`NPC の ID が重なっている: ${n[0]}`); ids.add(n[0]); }
  problems.push(...checkWorld(maps, MAPS_RAW));
  return { maps, problems, stats: { maps: Object.keys(maps).length, generated: Object.keys(maps).length - Object.keys(ISLAND).length, attempts } };
}
