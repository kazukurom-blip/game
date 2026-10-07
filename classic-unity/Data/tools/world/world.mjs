// 全マップ（maps.mjs の 234 枚＋ジャンプの試練 5 枚）を作る入口。芽吹きの島は手で置いた island.mjs、ジャンプの試練は jump.mjs、ほかは generate.mjs。
// 戻り: { maps: { id: json }, problems, stats }
import { ISLAND, ISLAND_BGM, G as IG } from './island.mjs';
import { NPCS } from './npcs.mjs';
import { generateMap } from './generate.mjs';
import { checkWorld } from './check.mjs';
import { QUEST_OBJECTS, QUEST_SPAWNS } from '../../../../classic/tools/data/quests_more.mjs';
import { JUMP_RAW, buildJumpMaps } from './jump.mjs';

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
  problems.push(...placeQuestExtras(maps));
  // ジャンプの試練（jump.mjs。maps.mjs の外の J001〜）
  Object.assign(maps, buildJumpMaps());
  for (const r of JUMP_RAW) RAW_BY[r[0]] = r;
  for (const n of NPCS) if (!RAW_BY[n[2]]) problems.push(`NPC ${n[0]} のマップ ${n[2]} が無い`);
  const ids = new Set();
  for (const n of NPCS) { if (ids.has(n[0])) problems.push(`NPC の ID が重なっている: ${n[0]}`); ids.add(n[0]); }
  problems.push(...checkWorld(maps, [...MAPS_RAW, ...JUMP_RAW]));
  return { maps, problems, stats: { maps: Object.keys(maps).length, generated: Object.keys(maps).length - Object.keys(ISLAND).length - JUMP_RAW.length, jump: JUMP_RAW.length, attempts } };
}

// ---------------- クエストの隠し物・専用の敵（QUESTS.md 8 章。classic/tools/data/quests_more.mjs）
// 生成したマップに後から足す（乱数を使わないので、ほかの足場・湧く所は変わらない）。置き場は足場の上（check.mjs が確かめる）。
//   at: 'secret'（隠し部屋の次の空き）/ 'high'（一番高い足場）/ 'left' / 'right' / 'mid'（地面の左・右・真ん中）/ 'upper'（2 番目に高い足場）
const segsOf = (m) => {
  const out = [];
  for (const f of m.footholds || []) for (let i = 0; i + 1 < f.points.length; i++) {
    const [x1, y1] = f.points[i], [x2, y2] = f.points[i + 1];
    out.push({ f, x1, y1, x2, y2 });
  }
  return out;
};
const yOn = (s, x) => s.y1 + ((s.y2 - s.y1) * (x - s.x1)) / (s.x2 - s.x1);

function freeSpot(m, segs, want, extra = []) {
  const taken = [...(m.objects || []).map((o) => [o.x, o.y, 56]), ...(m.npcs || []).map((n) => [n.x, n.y, 48]), ...(m.portals || []).map((p) => [p.x, p.y, 56]),
    ...(m.timedSpawns || []).map((t) => [t.x, t.y, 40]), ...extra];
  for (let k = 0; k < 40; k++) {
    const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 36;
    for (const s of segs) {
      const x = Math.round(want(s) + dx);
      if (x < s.x1 + 24 || x > s.x2 - 24) continue;
      const y = Math.round(yOn(s, x));
      if (Math.abs(y - yOn(s, x)) > 0.01 && s.y1 !== s.y2) continue; // 坂の途中は丸めでずれるので避ける
      if (taken.some(([tx, ty, r]) => Math.abs(tx - x) < r && Math.abs(ty - y) < 80)) continue;
      return { x, y };
    }
  }
  return null;
}

function placeQuestExtras(maps) {
  const problems = [];
  for (const o of QUEST_OBJECTS) {
    const m = maps[o.map];
    if (!m) { problems.push(`クエストの調べる物 ${o.id}: マップ ${o.map} が無い`); continue; }
    if ((m.objects || []).some((x) => x.id === o.id)) { problems.push(`クエストの調べる物 ${o.id} が重なっている`); continue; }
    const all = segsOf(m).filter((s) => s.x2 - s.x1 >= 64);
    const normal = all.filter((s) => s.f.id !== 'secret' && s.y1 === s.y2 || s.f.ground && s.f.id !== 'secret');
    let spot = null;
    if (o.at === 'secret') {
      const room = all.find((s) => s.f.id === 'secret');
      if (room) {
        const n = (m.objects || []).filter((x) => x.y === room.y1 && x.x >= room.x1 && x.x <= room.x2).length;
        const x = room.x1 + 110 + 60 * n;
        if (x <= room.x2 - 30) spot = { x, y: room.y1 };
      }
    } else if (o.at === 'high' || o.at === 'upper') {
      const flat = normal.filter((s) => !s.f.ground && s.y1 === s.y2).sort((a, b) => a.y1 - b.y1);
      const ys = [...new Set(flat.map((s) => s.y1))];
      // 一番高い段（upper は 2 番目）から。置けなければ 1 つ下の段へ
      for (let i = o.at === 'high' ? 0 : Math.min(1, ys.length - 1); i < ys.length && !spot; i++) spot = freeSpot(m, flat.filter((s) => s.y1 === ys[i]), (s) => (s.x1 + s.x2) / 2);
    } else {
      const ground = normal.filter((s) => s.f.ground);
      const W = m.width;
      const wx = o.at === 'left' ? W * 0.15 : o.at === 'right' ? W * 0.85 : W * 0.5;
      ground.sort((a, b) => Math.abs((a.x1 + a.x2) / 2 - wx) - Math.abs((b.x1 + b.x2) / 2 - wx));
      spot = freeSpot(m, ground, (s) => Math.max(s.x1 + 30, Math.min(s.x2 - 30, wx)));
    }
    if (!spot) { problems.push(`クエストの調べる物 ${o.id}: ${o.map} に置き場（${o.at}）が無い`); continue; }
    (m.objects ||= []).push({ id: o.id, name: o.name, x: spot.x, y: spot.y, quest: o.quest });
  }
  for (const [mob, mapId, quest] of QUEST_SPAWNS) {
    const m = maps[mapId];
    if (!m) { problems.push(`クエスト専用の敵 ${mob}: マップ ${mapId} が無い`); continue; }
    const ground = segsOf(m).filter((s) => s.f.ground && s.f.id !== 'secret' && s.x2 - s.x1 >= 120);
    ground.sort((a, b) => Math.abs((a.x1 + a.x2) / 2 - m.width / 2) - Math.abs((b.x1 + b.x2) / 2 - m.width / 2));
    const spot = freeSpot(m, ground, (s) => Math.max(s.x1 + 60, Math.min(s.x2 - 60, m.width / 2)));
    if (!spot) { problems.push(`クエスト専用の敵 ${mob}: ${mapId} に置き場が無い`); continue; }
    (m.timedSpawns ||= []).push({ mob, x: spot.x, y: spot.y, intervalSec: 10, quest });
  }
  return problems;
}
