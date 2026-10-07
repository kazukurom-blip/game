// マップの検査（WORLD.md 2 章・FEEL.md の手触りの値）。生成器（generate.mjs）と書き出し（export_data.mjs）と CLI が使う。
//
// 調べること（1 つでも引っかかったら problems に入る）:
//   - 足場: 点は左から右へ・坂は 45 度まで・マップの中
//   - ポータル: 足場の上・名前が重ならない・行き先のマップと着く先がある・戻りのポータルが「こちらへ」向いている（両方向）
//               maps.mjs のつながりと同じ（歩いて行けるポータルの行き先の組が一致）
//   - 湧く所・強敵・NPC・調べる物: 足場の上。maps.mjs の「出る敵」と湧く所が一致
//   - 縄・はしご: 上端に足場がある（上りきると立てる）・下端に下の足場から ↑ で届く
//   - 段差: 上の足場と真下の足場の差が 64〜80 px の「跳べそうで跳べない」所が無い（縄・はしごで結ばれていれば可）
//   - 行ける所: どのポータル（出現の位置も）からも、全部の足場に行ける（ジャンプ・↓ジャンプ・縄・はしご・端から落ちる・同じマップの中のポータル）
//
// 動きのモデルは PlayerPhysics（= physics.js）と同じ数値で作る。C# のテスト（MapCheckTests）は同じことを本物の物理で確かめる。
//
// CLI: node classic-unity/Data/tools/world/check.mjs        … Data/maps/*.json を検査する
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FEEL = {
  jumpSpeed: 555, gravity: 2000, maxFall: 670, walk: 125,
  jumpHeight: (555 * 555) / (2 * 2000), // 約 77 px（物理の上限）
  stepMax: 64,      // 跳んで上がれる段差（FEEL.md 2 章「64 px は跳んで上がれる、80 px 以上は縄・はしご」）
  bandHi: 80,       // 64〜80 は「跳べそうで跳べない」ので作らない
  ropeRange: 10, ladderExtra: 4, ropeBottomReach: 28, ropeTopReach: 6, ropeTopLand: 8,
  downJumpHop: (200 * 200) / (2 * 2000), // ↓ジャンプの小さな跳ね 10 px
  halfW: 12, bodyH: 56, maxSlopeDeg: 45,
};

// ---------------- 形
export function buildGeom(map) {
  const segs = [];
  const chains = [];
  (map.footholds || []).forEach((f, ci) => {
    const chain = { idx: ci, id: f.id, ground: !!f.ground, segs: [] };
    for (let i = 0; i + 1 < f.points.length; i++) {
      const [x1, y1] = f.points[i];
      const [x2, y2] = f.points[i + 1];
      const s = { chain: ci, x1, y1, x2, y2, i };
      segs.push(s);
      chain.segs.push(s);
    }
    chain.x1 = f.points[0][0];
    chain.x2 = f.points[f.points.length - 1][0];
    chains.push(chain);
  });
  return { W: map.width, H: map.height, segs, chains, ropes: map.ropes || [], walls: map.walls || [] };
}

export const yAt = (s, x) => (s.x2 === s.x1 ? s.y1 : s.y1 + ((s.y2 - s.y1) * (x - s.x1)) / (s.x2 - s.x1));

/** x の真下（y より下か同じ高さ）の一番近い線分（PhysicsMap.SegBelow と同じ）。 */
export function segBelow(g, x, y, ignoreChain = -1) {
  let best = null, by = Infinity;
  for (const s of g.segs) {
    if (s.chain === ignoreChain) continue;
    if (x < s.x1 || x > s.x2) continue;
    const sy = yAt(s, x);
    if (sy >= y - 0.5 && sy < by) { by = sy; best = s; }
  }
  return best;
}

/** (x, y) に立っている線分（足場の上なら）。 */
export function segAt(g, x, y) {
  const s = segBelow(g, x, y - 2);
  return s && Math.abs(yAt(s, x) - y) < 0.5 ? s : null;
}

// ---------------- かたまり（壁で区切った足場の一続き）
function wallBlocks(w, footY) {
  return footY > w.top && footY - FEEL.bodyH < w.bottom;
}

function buildPieces(g) {
  const pieces = [];
  for (const c of g.chains) {
    // この足場の上で、体の高さが壁にかかる所で区切る
    const cuts = [];
    for (const w of g.walls) {
      if (w.x <= c.x1 || w.x >= c.x2) continue;
      const s = c.segs.find((q) => w.x >= q.x1 && w.x <= q.x2);
      const fy = yAt(s, w.x);
      if (wallBlocks(w, fy)) cuts.push({ x: w.x, clear: fy - w.top });
    }
    cuts.sort((a, b) => a.x - b.x);
    let a = c.x1;
    const list = [];
    for (const cut of cuts) { list.push({ a, b: cut.x, cutRight: cut }); a = cut.x; }
    list.push({ a, b: c.x2, cutRight: null });
    list.forEach((p, k) => {
      const piece = { id: pieces.length, chain: c.idx, chainId: c.id, k, a: p.a, b: p.b, cutRight: p.cutRight };
      pieces.push(piece);
      p.piece = piece;
    });
    c.pieces = list.map((p) => p.piece);
  }
  return pieces;
}

function pieceOf(g, s, x) {
  const c = g.chains[s.chain];
  for (const p of c.pieces) if (x >= p.a - 1e-9 && x <= p.b + 1e-9) return p;
  return c.pieces[c.pieces.length - 1];
}

/** 立てる x の範囲（壁の手前・マップの端で止まる分を引く）。 */
function standRange(g, p) {
  let a = Math.max(p.a, FEEL.halfW), b = Math.min(p.b, g.W - FEEL.halfW);
  const c = g.chains[p.chain];
  if (p.k > 0) a = Math.max(a, p.a + FEEL.halfW);
  if (p.cutRight) b = Math.min(b, p.b - FEEL.halfW);
  // 足場の端に立っている壁（隠し部屋の両側）
  for (const w of g.walls) {
    const sa = c.segs.find((q) => p.a >= q.x1 && p.a <= q.x2), sb = c.segs.find((q) => p.b >= q.x1 && p.b <= q.x2);
    if (sa && Math.abs(w.x - p.a) <= FEEL.halfW && wallBlocks(w, yAt(sa, p.a))) a = Math.max(a, w.x + FEEL.halfW);
    if (sb && Math.abs(w.x - p.b) <= FEEL.halfW && wallBlocks(w, yAt(sb, p.b))) b = Math.min(b, w.x - FEEL.halfW);
  }
  return [a, b];
}

/** 落ちていく体の着く線分（physics.js の着地: 上から下へまたいだ時だけ）。 */
function landFalling(g, x, apexY, ignoreChain = -1) {
  let best = null, by = Infinity;
  for (const s of g.segs) {
    if (s.chain === ignoreChain) continue;
    if (x < s.x1 || x > s.x2) continue;
    const sy = yAt(s, x);
    if (sy >= apexY - 0.5 && sy < by) { by = sy; best = s; }
  }
  return best;
}

/** 歩いて端から落ちた時（横の速さはそのまま）。物理と同じ積分で着く所を探す。 */
function simulateWalkOff(g, x, y, dir) {
  let vx = dir * FEEL.walk, vy = 0, px = x, py = y;
  for (let f = 0; f < 600; f++) {
    const prevX = px, prevY = py;
    const nvy = Math.min(FEEL.maxFall, vy + FEEL.gravity / 60);
    py += ((vy + nvy) / 2) / 60;
    vy = nvy;
    px += vx / 60;
    for (const w of g.walls) {
      if (py <= w.top || py - FEEL.bodyH >= w.bottom) continue;
      if (prevX <= w.x - FEEL.halfW + 1e-9 && px > w.x - FEEL.halfW) { px = w.x - FEEL.halfW; vx = 0; }
      else if (prevX >= w.x + FEEL.halfW - 1e-9 && px < w.x + FEEL.halfW) { px = w.x + FEEL.halfW; vx = 0; }
    }
    if (px < FEEL.halfW) { px = FEEL.halfW; vx = 0; }
    if (px > g.W - FEEL.halfW) { px = g.W - FEEL.halfW; vx = 0; }
    let best = null, by = Infinity;
    for (const s of g.segs) {
      if (px < s.x1 || px > s.x2) continue;
      const yNow = yAt(s, px);
      const yPrev = yAt(s, Math.min(s.x2, Math.max(s.x1, prevX)));
      if (prevY <= yPrev + 1 && py >= yNow && yNow < by) { by = yNow; best = s; }
    }
    if (best) return { s: best, x: px };
    if (py > g.H + 200) return null;
  }
  return null;
}

/** 縄の上端で立てる線分（StepClimb: データの順で最初の物）。 */
function ropeTopSeg(g, r) {
  for (const s of g.segs) if (r.x >= s.x1 && r.x <= s.x2 && Math.abs(yAt(s, r.x) - r.top) <= FEEL.ropeTopLand) return s;
  return null;
}

/** 足場どうしのつながり（有向）。edges[i] = [{ to, how }] */
export function buildGraph(map) {
  const g = buildGeom(map);
  const pieces = buildPieces(g);
  const edges = pieces.map(() => []);
  const add = (from, to, how) => { if (from && to && from !== to && !edges[from.id].some((e) => e.to === to.id)) edges[from.id].push({ to: to.id, how }); };

  for (const p of pieces) {
    const c = g.chains[p.chain];
    const [a, b] = standRange(g, p);
    if (b < a) continue;
    // 壁を跳び越える（壁の高さが 64 px まで）
    if (p.cutRight && p.cutRight.clear <= FEEL.stepMax) {
      const nxt = c.pieces[p.k + 1];
      add(p, nxt, 'wall-hop'); add(nxt, p, 'wall-hop');
    }
    const n = Math.max(2, Math.ceil((b - a) / 8));
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const s = c.segs.find((q) => x >= q.x1 && x <= q.x2);
      if (!s) continue;
      const y = yAt(s, x);
      // その場ジャンプ: 最高点から落ちて最初にまたぐ線
      const up = landFalling(g, x, y - FEEL.jumpHeight);
      // 物理の上限 77 px ではなく設計の 64 px までを「跳べる」とする（余裕を残す）
      if (up && y - yAt(up, x) <= FEEL.stepMax + 1e-6) add(p, pieceOf(g, up, x), 'jump');
      // ↓ジャンプ（浮いた足場だけ。下に足場がある時）
      if (!c.ground && segBelow(g, x, y + 1, c.idx)) {
        const down = landFalling(g, x, y - FEEL.downJumpHop, c.idx);
        if (down) add(p, pieceOf(g, down, x), 'down');
      }
    }
    // 端から歩いて落ちる
    for (const [ex, dir, isEnd] of [[c.x2, 1, p.b === c.x2], [c.x1, -1, p.a === c.x1]]) {
      if (!isEnd) continue;
      if (dir > 0 && ex >= g.W - FEEL.halfW) continue;
      if (dir < 0 && ex <= FEEL.halfW) continue;
      const s = c.segs.find((q) => ex >= q.x1 && ex <= q.x2);
      const r = simulateWalkOff(g, ex + dir * 0.01, yAt(s, ex), dir);
      if (r && r.s.chain !== c.idx) add(p, pieceOf(g, r.s, r.x), 'walk-off');
    }
  }
  // 縄・はしご
  for (const r of g.ropes) {
    const top = ropeTopSeg(g, r);
    const topPiece = top ? pieceOf(g, top, r.x) : null;
    const below = landFalling(g, r.x, r.bottom);
    const belowPiece = below ? pieceOf(g, below, r.x) : null;
    for (const s of g.segs) {
      if (r.x < s.x1 || r.x > s.x2) continue;
      const y = yAt(s, r.x);
      const p = pieceOf(g, s, r.x);
      if (y > r.top + 2 && y <= r.bottom + FEEL.ropeBottomReach) {
        if (topPiece) add(p, topPiece, r.ladder ? 'ladder' : 'rope');
        if (belowPiece) add(p, belowPiece, 'rope-down');
      }
      if (Math.abs(y - r.top) <= FEEL.ropeTopReach && belowPiece) add(p, belowPiece, r.ladder ? 'ladder-down' : 'rope-down');
    }
  }
  // 同じマップの中のポータル（隠し部屋など）
  for (const pt of map.portals || []) {
    if (pt.to || !pt.toPortal || pt.type === 'spawn' || pt.type === 'town') continue;
    const dst = (map.portals || []).find((q) => q.name === pt.toPortal);
    const s1 = segAt(g, pt.x, pt.y), s2 = dst && segAt(g, dst.x, dst.y);
    if (s1 && s2) add(pieceOf(g, s1, pt.x), pieceOf(g, s2, dst.x), 'portal');
  }
  return { g, pieces, edges };
}

function reach(edges, start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    for (const e of edges[c]) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
  }
  return seen;
}

/** 1 枚のマップの中だけの検査。links = maps.mjs のつながり、mobs = maps.mjs の出る敵。 */
export function checkMap(map, opts = {}) {
  const out = [];
  const P = (msg) => out.push(`${map.id}: ${msg}`);
  const { g, pieces, edges } = buildGraph(map);
  // 足場の形
  for (const f of map.footholds || []) {
    if (!f.points || f.points.length < 2) { P(`足場 ${f.id} の点が足りない`); continue; }
    for (let i = 0; i + 1 < f.points.length; i++) {
      const [x1, y1] = f.points[i], [x2, y2] = f.points[i + 1];
      if (!(x2 > x1)) P(`足場 ${f.id} の点が左から右になっていない`);
      const deg = (Math.atan2(Math.abs(y2 - y1), x2 - x1) * 180) / Math.PI;
      if (deg > FEEL.maxSlopeDeg + 1e-6) P(`足場 ${f.id} の坂が ${deg.toFixed(1)} 度（45 度まで）`);
    }
    for (const [x, y] of f.points) if (x < 0 || x > map.width || y < 0 || y > map.height) P(`足場 ${f.id} がマップの外 (${x},${y})`);
  }
  if (!(map.footholds || []).some((f) => f.ground)) P('地面（ground）が無い');
  const on = (what, x, y) => { if (!segAt(g, x, y)) P(`${what} が足場の上に無い (${x},${y})`); };
  // ポータル
  const names = new Set();
  for (const p of map.portals || []) {
    if (names.has(p.name)) P(`ポータルの名前 ${p.name} が重なっている`);
    names.add(p.name);
    on(`ポータル ${p.name}`, p.x, p.y);
    if (!p.to && p.toPortal && !(map.portals || []).some((q) => q.name === p.toPortal)) P(`ポータル ${p.name} の着く先 ${p.toPortal} が無い`);
  }
  if (!(map.portals || []).some((p) => p.type === 'spawn')) P('出現の位置（spawn）が無い');
  if (map.type === '町' && !(map.portals || []).some((p) => p.type === 'town')) P('町の帰還の位置（town）が無い');
  // 湧く所
  for (const s of map.spawns || []) on(`湧く所 ${s.mob}`, s.x, s.y);
  for (const s of map.timedSpawns || []) on(`強敵 ${s.mob}`, s.x, s.y);
  for (const n of map.npcs || []) on(`NPC ${n.id}`, n.x, n.y);
  for (const o of map.objects || []) on(`調べる物 ${o.id}`, o.x, o.y);
  if (opts.mobs) {
    const have = new Set([...(map.spawns || []), ...(map.timedSpawns || [])].map((s) => s.mob));
    for (const m of opts.mobs) if (!have.has(m)) P(`敵 ${m} の湧く所が無い`);
    for (const m of have) if (!opts.mobs.includes(m)) P(`敵 ${m} は maps.mjs ではここに出ない`);
  }
  // 縄・はしご
  for (const r of g.ropes) {
    if (!(r.bottom > r.top)) P(`縄 x=${r.x} の上下が逆`);
    if (!ropeTopSeg(g, r)) P(`縄 x=${r.x} の上端 ${r.top} に足場が無い`);
    const ok = g.segs.some((s) => r.x >= s.x1 && r.x <= s.x2 && yAt(s, r.x) > r.top + 2 && yAt(s, r.x) <= r.bottom + FEEL.ropeBottomReach);
    if (!ok) P(`縄 x=${r.x} の下端 ${r.bottom} に下の足場から届かない`);
  }
  // 段差（跳べそうで跳べない 64〜80 px）
  const ropeLinks = new Set();
  for (const r of g.ropes) {
    const t = ropeTopSeg(g, r), b = landFalling(g, r.x, r.bottom);
    if (t && b) ropeLinks.add(`${t.chain}>${b.chain}`);
  }
  const bandReported = new Set();
  for (const p of pieces) {
    const c = g.chains[p.chain];
    for (let x = Math.ceil(p.a); x <= p.b; x += 8) {
      const s = c.segs.find((q) => x >= q.x1 && x <= q.x2);
      if (!s) continue;
      const y = yAt(s, x);
      let lower = null, ly = Infinity;
      for (const q of g.segs) {
        if (q.chain === c.idx || x < q.x1 || x > q.x2) continue;
        const qy = yAt(q, x);
        if (qy > y + 0.5 && qy < ly) { ly = qy; lower = q; }
      }
      if (!lower) continue;
      const dy = ly - y;
      if (dy > FEEL.stepMax + 0.5 && dy < FEEL.bandHi - 0.5 && !ropeLinks.has(`${c.idx}>${lower.chain}`)) {
        const key = `${c.id}/${g.chains[lower.chain].id}`;
        if (!bandReported.has(key)) { bandReported.add(key); P(`足場 ${c.id} と下の ${g.chains[lower.chain].id} の段差が ${dy.toFixed(0)} px（64 までなら跳べる・80 以上は縄で）x=${x}`); }
      }
    }
  }
  // 行ける所: どのポータルからも全部の足場へ
  const starts = new Map();
  for (const p of map.portals || []) {
    const s = segAt(g, p.x, p.y);
    if (s) starts.set(p.name, pieceOf(g, s, p.x).id);
  }
  const checkedStart = new Set();
  for (const [name, st] of starts) {
    if (checkedStart.has(st)) continue;
    checkedStart.add(st);
    const seen = reach(edges, st);
    const miss = pieces.filter((p) => !seen.has(p.id));
    if (miss.length) P(`ポータル ${name} から行けない足場: ${miss.map((m) => m.chainId + (g.chains[m.chain].pieces.length > 1 ? '#' + m.k : '')).join(', ')}`);
  }
  return out;
}

/**
 * 全部のマップの検査。maps: { id: json }、raw: maps.mjs の MAPS_RAW。
 * 戻り: problems（文字列の配列）
 */
export function checkWorld(maps, raw) {
  const out = [];
  const RAW = Object.fromEntries(raw.map((m) => [m[0], m]));
  for (const id of Object.keys(RAW)) if (!maps[id]) out.push(`${id}: マップのファイルが無い`);
  for (const [id, m] of Object.entries(maps)) {
    const r = RAW[id];
    if (!r) { out.push(`${id}: maps.mjs に無いマップ`); continue; }
    out.push(...checkMap(m, { mobs: r[5] }));
    // つながり（maps.mjs のとおり）
    const have = [...new Set((m.portals || []).filter((p) => p.to).map((p) => p.to))].sort().join(',');
    const want = [...r[4]].sort().join(',');
    if (have !== want) out.push(`${id}: ポータルの行き先 [${have}] が maps.mjs のつながり [${want}] と違う`);
    // 両方向
    for (const p of m.portals || []) {
      if (!p.to) continue;
      const dst = maps[p.to];
      if (!dst) { out.push(`${id}: ポータル ${p.name} の行き先 ${p.to} が無い`); continue; }
      const back = (dst.portals || []).find((q) => q.name === p.toPortal);
      if (!back) { out.push(`${id}: ポータル ${p.name} の着く先 ${p.to}.${p.toPortal} が無い`); continue; }
      if (back.to !== id || back.toPortal !== p.name) out.push(`${id}: ${p.name} → ${p.to}.${p.toPortal} の戻りが ${back.to}.${back.toPortal}（${id}.${p.name} であるべき）`);
    }
    if (m.returnMap && (!maps[m.returnMap] || maps[m.returnMap].type !== '町')) out.push(`${id}: 戻る町 ${m.returnMap} が町でない`);
    for (const n of m.npcs || []) {
      if (n.travel) {
        const t = maps[n.travel.to];
        if (!t) out.push(`${id}: NPC ${n.id} の乗り物の行き先 ${n.travel.to} が無い`);
        else if (n.travel.toPortal && !(t.portals || []).some((q) => q.name === n.travel.toPortal)) out.push(`${id}: NPC ${n.id} の乗り物の着く先 ${n.travel.to}.${n.travel.toPortal} が無い`);
      }
    }
  }
  return out;
}

export function readMapsDir(dir) {
  const maps = {};
  for (const f of fs.readdirSync(dir)) {
    if (!/^[A-Z]\d{3}\.json$/.test(f)) continue;
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    maps[m.id] = m;
  }
  return maps;
}

// ---------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const { MAPS_RAW } = await import('../../../../classic/tools/data/maps.mjs');
  const maps = readMapsDir(path.resolve(HERE, '../../maps'));
  const problems = checkWorld(maps, MAPS_RAW);
  let segs = 0, ropes = 0, spawns = 0;
  for (const m of Object.values(maps)) { segs += m.footholds.length; ropes += (m.ropes || []).length; spawns += (m.spawns || []).length; }
  if (problems.length) {
    console.error(`問題 ${problems.length} 件:\n  ` + problems.slice(0, 200).join('\n  '));
    process.exit(1);
  }
  console.log(`検査 OK: マップ ${Object.keys(maps).length}（足場 ${segs}・縄/はしご ${ropes}・湧く所 ${spawns}）。どのポータルからも全部の足場に行ける・ポータルは両方向・湧く所は足場の上・跳べない段差なし`);
}
