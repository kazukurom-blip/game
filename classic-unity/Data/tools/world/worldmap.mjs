// 全体マップ（世界地図。UI.md 2-6）のデータ: 地域ごとに、マップの点の位置とつながりの線。export_data.mjs が Data/worldmap.json に書き出す。
// 位置は「地域の中のポータルのつながり」から自動で並べる（町から近い順の列を最初の位置にして、ばねの力で広げる。種が決まっているので何度でも同じ）。
// ジャンプの試練（J00x）は入口の町と同じ地域に、町からの乗り物の線で置く。
// 形: { regions: [{ id, name, note, maps: [ID…] }], maps: { ID: { region, x, y, name, type, lv, town, bgm, mobs } },
//       links: [[ID, ID]]（地域の中の歩けるポータル）, hidden: ["マップ.ポータル"…]（隠しポータル）, outer: [[ID, ID]]（地域をまたぐポータル）, travel: [[ID, ID, "乗り物"]] }
//   x・y は地域の地図の中の 0〜1000・0〜600。
import { hashStr, makeRng } from './rng.mjs';

const BOX_W = 1000, BOX_H = 600, PAD = 60;

function layoutRegion(ids, edges, rid) {
  const rng = makeRng(hashStr('worldmap.' + rid));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
  // 町（無ければ最初のマップ）から近い順の列
  const start = ids.find((id) => /00$/.test(id)) || ids[0];
  const depth = new Map([[start, 0]]);
  const q = [start];
  while (q.length) { const c = q.shift(); for (const n of adj.get(c)) if (!depth.has(n)) { depth.set(n, depth.get(c) + 1); q.push(n); } }
  let maxD = 0; for (const d of depth.values()) maxD = Math.max(maxD, d);
  for (const id of ids) if (!depth.has(id)) depth.set(id, ++maxD); // つながっていない物（乗り物でだけ来る所）は右へ
  const cols = new Map();
  for (const id of ids) { const d = depth.get(id); if (!cols.has(d)) cols.set(d, []); cols.get(d).push(id); }
  const pos = new Map();
  for (const [d, list] of cols) list.forEach((id, i) => pos.set(id, { x: d * 100, y: (i - (list.length - 1) / 2) * 70 + rng.range(-8, 8) }));
  // ばね（つながりは引き合い、全部の組は離れ合う）
  const n = ids.length;
  const k = Math.sqrt((BOX_W * BOX_H) / Math.max(1, n)) * 0.55;
  for (let it = 0; it < 400; it++) {
    const t = 40 * (1 - it / 400) + 1;
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pos.get(ids[i]), b = pos.get(ids[j]);
      let dx = a.x - b.x, dy = a.y - b.y; let d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = rng.range(-1, 1); dy = rng.range(-1, 1); d = 1; }
      const f = (k * k) / d;
      const da = disp.get(ids[i]), db = disp.get(ids[j]);
      da.x += (dx / d) * f; da.y += (dy / d) * f; db.x -= (dx / d) * f; db.y -= (dy / d) * f;
    }
    for (const [a0, b0] of edges) {
      const a = pos.get(a0), b = pos.get(b0);
      const dx = a.x - b.x, dy = a.y - b.y; const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      const da = disp.get(a0), db = disp.get(b0);
      da.x -= (dx / d) * f; da.y -= (dy / d) * f; db.x += (dx / d) * f; db.y += (dy / d) * f;
    }
    for (const id of ids) {
      const d = disp.get(id), p = pos.get(id);
      const l = Math.max(0.01, Math.hypot(d.x, d.y));
      p.x += (d.x / l) * Math.min(l, t); p.y += (d.y / l) * Math.min(l, t) * 1.0;
    }
  }
  // 箱に収める（横長に）
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const p of pos.values()) { x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x); y1 = Math.min(y1, p.y); y2 = Math.max(y2, p.y); }
  const sx = (BOX_W - 2 * PAD) / Math.max(1, x2 - x1), sy = (BOX_H - 2 * PAD) / Math.max(1, y2 - y1);
  const out = {};
  for (const [id, p] of pos) out[id] = { x: Math.round(PAD + (x2 > x1 ? (p.x - x1) * sx : (BOX_W - 2 * PAD) / 2)), y: Math.round(PAD + (y2 > y1 ? (p.y - y1) * sy : (BOX_H - 2 * PAD) / 2)) };
  return out;
}

/** maps: 生成した全マップ { ID: json }、raw: maps.mjs の行（＋ジャンプの試練の行）、regions: maps.mjs の REGIONS */
export function buildWorldMap(maps, raw, regions) {
  const RAW = Object.fromEntries(raw.map((r) => [r[0], r]));
  const regionOf = (id) => (maps[id]?.jump ? maps[id].jump.town[0] : id[0]);
  const links = [], outer = [], travel = [];
  const seen = new Set();
  for (const r of raw) {
    for (const to of r[4]) {
      if (!RAW[to]) continue;
      const key = [r[0], to].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      (regionOf(r[0]) === regionOf(to) ? links : outer).push([r[0], to].sort());
    }
  }
  const tseen = new Set();
  for (const m of Object.values(maps)) {
    for (const n of m.npcs || []) {
      const to = n.travel?.to;
      if (!to || !maps[to]) continue;
      const key = [m.id, to].sort().join('|');
      if (tseen.has(key)) continue;
      tseen.add(key);
      travel.push([...[m.id, to].sort(), m.jump || maps[to].jump ? 'ジャンプの試練' : '乗り物']);
    }
  }
  // 出る敵（湧く所・強敵）と隠しポータル（「マップ.ポータル」。勲章「隠し部屋をすべて」の数）
  const hidden = [];
  for (const r of raw) for (const p of maps[r[0]]?.portals || []) if (p.type === 'hidden') hidden.push(`${r[0]}.${p.name}`);
  const out = { note: 'Data/tools/world/worldmap.mjs が書き出した全体マップ（地域ごとの点の位置 0〜1000×0〜600 とつながり・出る敵・隠しポータル）。手で直さない。', regions: [], maps: {}, links, outer, travel, hidden };
  for (const [rid, name, note] of regions) {
    const ids = raw.map((r) => r[0]).filter((id) => maps[id] && regionOf(id) === rid);
    if (!ids.length) continue;
    const set = new Set(ids);
    const edges = links.filter(([a, b]) => set.has(a) && set.has(b));
    for (const [a, b] of travel) if (set.has(a) && set.has(b) && (maps[a].jump || maps[b].jump)) edges.push([a, b]); // 試練は町のそばに
    const pos = layoutRegion(ids, edges, rid);
    out.regions.push({ id: rid, name, note, maps: ids });
    for (const id of ids) {
      const r = RAW[id], m = maps[id];
      const mobs = [...new Set([...(m.spawns || []), ...(m.timedSpawns || []).filter((s) => !s.quest)].map((s) => s.mob))]; // クエストの間だけ湧く専用の敵は入れない（図鑑にも載らない）
      out.maps[id] = { region: rid, x: pos[id].x, y: pos[id].y, name: m.name, type: m.jump ? '試' : r[2], lv: r[3] || null, town: m.returnMap || null, bgm: m.bgm || null, mobs };
    }
  }
  return out;
}
