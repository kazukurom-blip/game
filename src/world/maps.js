// ワールドマップ定義（v2: 7町 + 27フィールド = 34マップ）
// 座標: y 下向き。groundY が地面。platforms は {x, y(上面), w, solid?}。
// solid !== true の足場は一方通行（下から抜けられ、↓+ジャンプで降りられる）。
//
// 町（town:true）はデータ主体（NPC・車・建物 decor 多め、モンスターなし、市民と警察）。
// フィールド（town:false）は「名前・接続・Lv・特徴（style）」だけをデータで書き、
// 足場・ロープ・decor はマップIDをシードにした手続き生成（毎回同じ形）。
// spawns に types を書かないフィールドは spawner が ENEMIES[].habitats から自動選択する。

import { TOWN_SHOPS } from '../data/shops.js';

const GROUND = 1000;
export const ROW = 130;          // 段の高さ（ジャンプ最高点 ≈168px）
const JUMP_V = 860, GRAV = 2200, RUN = 240; // player.js / physics.js と同じ値（到達判定用）

// ------------------------------------------------------------ 乱数（シード付き）
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(hashStr(String(seed)));
  const f = () => r();
  f.range = (a, b) => a + r() * (b - a);
  f.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(r() * arr.length)];
  f.chance = (p) => r() < p;
  return f;
}

// ------------------------------------------------------------ 到達判定（生成時とテストで共用）
// 面 A（y=ay, 区間 [ax1,ax2]）から面 B へ移れるか（ジャンプ or 落下）
export function canHop(a, b, gravity = 1) {
  const g = GRAV * gravity;
  const dy = a.y - b.y;                       // 正 = B が上
  const maxH = (JUMP_V * JUMP_V) / (2 * g) - 14; // 余裕を見た最高到達高さ
  if (dy > maxH) return false;
  const gap = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
  if (gap === 0) return true;
  // 滞空時間 × 走行速度 × 安全率
  const t = dy >= 0 ? (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * g * dy))) / g
    : (JUMP_V + Math.sqrt(JUMP_V * JUMP_V + 2 * g * -dy)) / g;
  return gap <= Math.min(RUN * t * 0.78, 420);
}

/**
 * 到達可能性: 地面（壁で分断されない前提。壁は跳び越せる高さのみ）から
 * 全足場への BFS（ジャンプ・落下・ロープ）。返り値 {reach:Set(index), unreachable:[platform]}
 */
export function reachability(map) {
  const grav = map.gravity ?? 1;
  const plats = map.platforms.filter((p) => !p.ceiling);
  const surf = (p) => ({ y: p.y, x1: p.x, x2: p.x + p.w });
  const ground = { y: map.groundY, x1: 0, x2: map.width };
  const reach = new Set();
  const isReach = (q) => q === 'ground' || reach.has(q);
  let changed = true;
  while (changed) {
    changed = false;
    plats.forEach((p, i) => {
      if (reach.has(i)) return;
      const sp = surf(p);
      let ok = canHop(ground, sp, grav);
      if (!ok) for (const j of reach) if (canHop(surf(plats[j]), sp, grav)) { ok = true; break; }
      if (!ok) {
        // ロープ: 上端がこの足場、下端が到達済みの面
        for (const r of map.ropes) {
          if (r.top !== p.y || r.x < p.x || r.x > p.x + p.w) continue;
          if (r.bottom === map.groundY) { ok = true; break; }
          const bi = plats.findIndex((q) => q.y === r.bottom && r.x >= q.x && r.x <= q.x + q.w);
          if (bi >= 0 && isReach(bi)) { ok = true; break; }
        }
      }
      if (ok) { reach.add(i); changed = true; }
    });
  }
  return { reach, unreachable: plats.filter((_, i) => !reach.has(i)), plats };
}

// ロープ x から下端（最初にぶつかる足場 or 地面）
function ropeBottom(platforms, p, rx, groundY) {
  let bottom = groundY;
  for (const q of platforms) {
    if (q === p || q.ceiling) continue;
    if (q.y > p.y + 40 && q.y < bottom && rx >= q.x + 10 && rx <= q.x + q.w - 10) bottom = q.y;
  }
  return bottom;
}

// ------------------------------------------------------------ 共通ビルダー
function finish(def) {
  const groundY = def.groundY ?? GROUND;
  const out = {
    height: groundY + 100,
    walls: [], vehicles: [], decor: [], npcs: [], spawns: [], portals: [], ropes: [], platforms: [],
    ...def,
    groundY,
  };
  out.theme = out.theme || out.region;
  for (const n of out.npcs) if (n.y == null) n.y = groundY;
  for (const d of out.decor) if (d.y == null) d.y = groundY;
  for (const p of out.portals) if (p.y == null) p.y = groundY;
  return out;
}

// [x, y, w, rope?, solid?] 形式（手書き足場用）
function platsFrom(list, groundY) {
  const platforms = list.map(([x, y, w, , solid]) => ({ x, y, w, ...(solid ? { solid: true } : {}) }));
  const ropes = [];
  list.forEach(([, , , rope], i) => {
    if (!rope) return;
    const p = platforms[i];
    const rx = typeof rope === 'number' ? rope : Math.round(p.x + p.w * 0.3);
    ropes.push({ x: rx, top: p.y, bottom: ropeBottom(platforms, p, rx, groundY) });
  });
  return { platforms, ropes };
}

// ------------------------------------------------------------ 地域ごとの decor セット
const DECOR_SETS = {
  beach: ['palm', 'palm', 'flamingoStatue', 'bench', 'lamp', 'billboard', 'crate'],
  downtown: ['neonSign', 'billboard', 'lamp', 'hydrant', 'car', 'graffiti', 'bench', 'neonSign'],
  slums: ['container', 'crate', 'graffiti', 'lamp', 'hydrant', 'container', 'car'],
  swamp: ['mangrove', 'mangrove', 'crate', 'lamp', 'flamingoStatue', 'mangrove'],
  casino: ['slotMachine', 'neonSign', 'palm', 'lamp', 'billboard', 'slotMachine', 'car'],
  rooftop: ['billboard', 'lamp', 'neonSign', 'crate', 'antenna', 'billboard'],
  spaceport: ['rocket', 'antenna', 'satelliteDish', 'lamp', 'crate', 'neonSign', 'antenna'],
};
const PLAT_DECOR = { // 足場の上に置ける小物
  beach: ['palm', 'lamp', 'crate', 'flamingoStatue'], downtown: ['neonSign', 'lamp', 'crate', 'billboard'],
  slums: ['crate', 'graffiti', 'lamp'], swamp: ['mangrove', 'crate'], casino: ['slotMachine', 'neonSign'],
  rooftop: ['lamp', 'antenna', 'crate', 'neonSign'], spaceport: ['antenna', 'satelliteDish', 'crate'],
};
// style ごとに優先する decor（地域セットに混ぜる）
const STYLE_DECOR = {
  tunnel: ['lamp', 'graffiti', 'neonSign'], highway: ['billboard', 'lamp', 'car'], park: ['palm', 'bench', 'lamp'],
  pier: ['crate', 'lamp', 'bench'], warehouse: ['container', 'container', 'crate'], dock: ['container', 'crate', 'lamp'],
  ship: ['crate', 'container', 'lamp'], rail: ['crate', 'graffiti', 'lamp'], vault: ['slotMachine', 'crate', 'lamp'],
  hall: ['slotMachine', 'neonSign', 'lamp'], tower: ['crate', 'lamp', 'billboard'], garden: ['palm', 'bench', 'lamp'],
  launch: ['rocket', 'antenna', 'satelliteDish'], moon: ['satelliteDish', 'antenna', 'rocket'], alienShip: ['antenna', 'neonSign', 'satelliteDish'],
};

// decor の半幅（概算, px）。ポータル前や大物同士の重なりを避けるのに使う
const DECOR_HALF_W = { billboard: 120, container: 100, rocket: 70, car: 80, slotMachine: 34, neonSign: 75, mangrove: 70, palm: 40, satelliteDish: 45, antenna: 25, graffiti: 98, bench: 40 };
const halfW = (t) => DECOR_HALF_W[t] ?? 24;
const BIG_DECOR = new Set(['billboard', 'container', 'rocket', 'car', 'slotMachine', 'neonSign', 'graffiti']);
// 地面の decor を並べる（ポータルの前・大物同士の重なりを避ける）
// 背の高い看板類の高さ（px）。上の足場が看板の文字を横切らないようにする
const DECOR_TALL = { neonSign: 165, billboard: 195, slotMachine: 135, graffiti: 112 };
function clearAbove(type, x, baseY, platforms, self) {
  const ht = DECOR_TALL[type];
  if (!ht || !platforms) return true;
  const hw = halfW(type);
  return !platforms.some((q) => q !== self && !q.ceiling && q.y < baseY - 8 && q.y > baseY - ht && q.x < x + hw && q.x + q.w > x - hw);
}
function placeGroundDecor(R, set, portals, groundY, x0, x1, step, portalAll, existing = [], platforms = null, walls = null) {
  const out = [];
  let lastBigR = -1e9;
  const fixed = existing.filter((d) => BIG_DECOR.has(d.type) && (d.y == null || d.y === groundY));
  const low = set.filter((t) => !DECOR_TALL[t]);
  for (let x = x0; x < x1; x += R.range(step[0], step[1])) {
    let type = R.pick(set);
    if (!clearAbove(type, x, groundY, platforms)) { if (!low.length) continue; type = R.pick(low); }
    const hw = halfW(type);
    // p.y は finish() 前は未設定（= 地面）
    if (portals.some((p) => (portalAll || p.y == null || p.y === groundY) && Math.abs(p.x - x) < hw + 70)) continue;
    // 地形の壁（障害物）と重ねない（壁の前にグラフィティ壁などが重なって見えていた）
    if (walls && walls.some((wl) => x + hw > wl.x - 12 && x - hw < wl.x + wl.w + 12) && (BIG_DECOR.has(type) || DECOR_TALL[type])) continue;
    if (BIG_DECOR.has(type)) {
      if (x - hw < lastBigR + 16) continue;
      if (fixed.some((d) => Math.abs(d.x - x) < hw + halfW(d.type) + 16)) continue;
      lastBigR = x + hw;
    }
    out.push({ type, x: Math.round(x) });
  }
  return out;
}
// 宇宙系フィールドに地上のネオン看板などは置かない
const STYLE_ONLY = { moon: true, alienShip: true };

// ------------------------------------------------------------ フィールド style プリセット
// tiers: 段数, w: 足場幅, gap: 足場間隔, ropeP: 追加ロープ率, rowGap: 段差
const STYLES = {
  coast:     { width: 3600, tiers: 3, w: [260, 380], gap: [180, 320] },
  standard:  { width: 3800, tiers: 4, w: [240, 360], gap: [140, 280] },
  alley:     { width: 3400, tiers: 5, w: [200, 300], gap: [100, 220], ropeP: 0.35 },
  tunnel:    { width: 4000, tiers: 2, w: [320, 520], gap: [160, 300], ceiling: true, walls: { n: 4, h: [50, 80], w: [120, 220] } },
  highway:   { width: 4500, tiers: 2, w: [480, 760], gap: [260, 460], cars: 1 },
  park:      { width: 3600, tiers: 3, w: [220, 320], gap: [160, 300], ropeP: 0.25 },
  pier:      { width: 3800, tiers: 3, w: [420, 640], gap: [100, 180], water: true, firstRowW: [520, 780], firstRowGap: [90, 150] },
  warehouse: { width: 3800, tiers: 4, w: [260, 380], gap: [140, 260], walls: { n: 6, h: [70, 110], w: [140, 200] } },
  dock:      { width: 4000, tiers: 5, w: [240, 340], gap: [140, 260], ropeP: 0.4 },
  ship:      { width: 3400, tiers: 3, w: [520, 820], gap: [70, 130], water: true },
  rail:      { width: 4200, tiers: 2, w: [300, 460], gap: [200, 360], walls: { n: 5, h: [40, 70], w: [200, 320] } },
  maze:      { width: 3600, tiers: 5, w: [150, 230], gap: [70, 160], ropeP: 0.45 },
  nest:      { width: 3600, tiers: 3, w: [220, 320], gap: [140, 240], water: true, ropeP: 0.3 },
  vault:     { width: 3600, tiers: 3, w: [300, 460], gap: [120, 240], ceiling: true, walls: { n: 3, h: [60, 90], w: [100, 160] } },
  hall:      { width: 3400, tiers: 3, w: [320, 520], gap: [140, 260] },
  tower:     { width: 3000, tiers: 11, w: [220, 340], gap: [120, 260], groundY: 1900, ropeP: 0.35, topExit: true },
  garden:    { width: 3400, tiers: 6, w: [220, 320], gap: [140, 260], groundY: 1400, ropeP: 0.3 },
  launch:    { width: 3800, tiers: 6, w: [240, 360], gap: [160, 300], groundY: 1400, ropeP: 0.45 },
  moon:      { width: 4000, tiers: 4, w: [220, 340], gap: [180, 340], gravity: 0.6, rowGap: 200 },
  alienShip: { width: 3600, tiers: 4, w: [260, 400], gap: [120, 240], ropeP: 0.3 },
};

/**
 * フィールド生成。cfg:
 *  {id, name, region, variant, lv:[a,b], style, left, right, mids:[{to, at}], boss?, desc?, extra?}
 *  left/right: 端ポータルの行き先 mapId（null で無し）
 */
function field(cfg) {
  const st = { ...STYLES[cfg.style || 'standard'], ...(cfg.extra || {}) };
  const R = makeRng(cfg.id);
  const width = st.width;
  const groundY = st.groundY ?? GROUND;
  const rowGap = st.rowGap ?? ROW;
  const tiers = st.tiers;
  const platforms = [];
  // ボス部屋（右端 ~1000px）: 下2段に足場を置かない
  const arena = cfg.boss ? [width - 1150, width - 150] : null;
  const portalXs = [90, width - 90, ...(cfg.mids || []).map((m) => Math.round(m.at * width))];

  for (let k = 0; k < tiers; k++) {
    const y = groundY - rowGap * (k + 1);
    const wR = k === 0 && st.firstRowW ? st.firstRowW : st.w;
    const gR = k === 0 && st.firstRowGap ? st.firstRowGap : st.gap;
    let x = Math.round(220 + R.range(0, 260) + (k % 2) * R.range(40, 160));
    while (x < width - 260) {
      const w = Math.round(R.range(wR[0], wR[1]));
      const x2 = Math.min(width - 160, x + w);
      const inArena = arena && k < 2 && x2 > arena[0] && x < arena[1];
      if (!inArena && x2 - x >= 140) platforms.push({ x, y, w: x2 - x });
      x = x2 + Math.round(R.range(gR[0], gR[1]));
    }
  }
  // 低い天井（トンネル等）: 最上段のさらに上に solid の天井スラブ
  if (st.ceiling) {
    const cy = groundY - rowGap * (tiers + 1) - 40;
    platforms.push({ x: 0, y: cy, w: width, solid: true, ceiling: true });
  }
  // ポータルの上空を塞がない（↑で入る位置に低い足場が重ならないよう）
  const clearOfPortals = platforms.filter((p) => p.ceiling || p.y < groundY - rowGap * 1.5 || !portalXs.some((px) => px > p.x - 50 && px < p.x + p.w + 50));
  platforms.length = 0; platforms.push(...clearOfPortals);

  const map = { id: cfg.id, width, groundY, platforms, ropes: [], gravity: st.gravity ?? 1, walls: [] };

  // 壁（跳び越せる高さのみ。ポータル・スポーン地点・ボス部屋は避ける）
  if (st.walls) {
    for (let i = 0; i < st.walls.n; i++) {
      const w = Math.round(R.range(st.walls.w[0], st.walls.w[1]));
      const h = Math.round(R.range(st.walls.h[0], st.walls.h[1]));
      const x = Math.round(R.range(400, width - 500));
      if (portalXs.some((px) => Math.abs(px - x) < 320 || Math.abs(px - (x + w)) < 320)) continue;
      if (arena && x + w > arena[0] - 100) continue;
      if (map.walls.some((o) => x < o.x + o.w + 200 && x + w > o.x - 200)) continue;
      map.walls.push({ x, y: groundY - h, w, h });
    }
  }

  // 到達性の保証: 下の段から順に、届かない足場へロープを垂らす
  const sorted = [...platforms].filter((p) => !p.ceiling).sort((a, b) => b.y - a.y);
  for (const p of sorted) {
    const { unreachable } = reachability(map);
    if (!unreachable.includes(p)) continue;
    const rx = Math.round(p.x + p.w * R.range(0.25, 0.75));
    map.ropes.push({ x: rx, top: p.y, bottom: ropeBottom(platforms, p, rx, groundY) });
  }
  // 遊び用の追加ロープ
  for (const p of platforms) {
    if (p.ceiling || !R.chance(st.ropeP ?? 0.15)) continue;
    if (map.ropes.some((r) => r.top === p.y && r.x >= p.x && r.x <= p.x + p.w)) continue;
    const rx = Math.round(p.x + p.w * R.range(0.2, 0.8));
    const bottom = ropeBottom(platforms, p, rx, groundY);
    if (bottom - p.y > 60 && !portalXs.some((px) => Math.abs(px - rx) < 60)) map.ropes.push({ x: rx, top: p.y, bottom });
  }

  // ポータル
  const portals = [];
  if (cfg.left) portals.push({ x: 90, to: cfg.left });
  if (cfg.right) {
    if (st.topExit) {
      // 塔: 出口は最上段の幅広足場の上
      const topY = Math.min(...platforms.filter((p) => !p.ceiling).map((p) => p.y));
      const tops = platforms.filter((p) => p.y === topY);
      let tp = tops.sort((a, b) => b.x - a.x)[0];
      if (tp.w < 380) { const nx = Math.min(tp.x, width - 40 - 380); tp.w = Math.max(tp.x + tp.w, nx + 380) - nx; tp.x = nx; }
      portals.push({ x: Math.round(tp.x + tp.w / 2), y: tp.y, to: cfg.right });
    } else portals.push({ x: width - 90, to: cfg.right });
  }
  for (const m of cfg.mids || []) portals.push({ x: Math.round(m.at * width), to: m.to });

  // decor
  const set = STYLE_ONLY[cfg.style] ? [...STYLE_DECOR[cfg.style], 'crate'] : [...DECOR_SETS[cfg.region], ...(STYLE_DECOR[cfg.style] || [])];
  const decor = placeGroundDecor(R, set, portals, groundY, 160 + R.range(0, 120), width - 120, [170, 320], false, [], platforms, map.walls);
  const pset = PLAT_DECOR[cfg.region];
  for (const p of platforms) {
    if (p.ceiling || p.w <= 260 || !R.chance(0.3)) continue;
    const type = R.pick(pset), x = Math.round(p.x + p.w * R.range(0.2, 0.8)), hw = halfW(type);
    if (x - hw < p.x - 10 || x + hw > p.x + p.w + 10) continue;
    if (!clearAbove(type, x, p.y, platforms, p) || p.y - (DECOR_TALL[type] || 0) < 120) continue;
    if (portals.some((q) => q.y === p.y && Math.abs(q.x - x) < hw + 70)) continue;
    decor.push({ type, x, y: p.y });
  }

  // 出現エリア（types なし = habitats から自動）。幅を3〜4分割
  const nA = width >= 3800 ? 4 : 3;
  const spawns = [];
  const usableW = (arena ? arena[0] : width) - 300;
  for (let i = 0; i < nA; i++) {
    const x1 = Math.round(300 + usableW * i / nA), x2 = Math.round(300 + usableW * (i + 1) / nA);
    spawns.push({ x1, x2, max: tiers >= 5 ? 8 : 7, interval: R.int(4, 5) });
  }
  if (arena) {
    spawns.push({ x1: arena[0], x2: arena[1], max: 3, interval: 6 });
    spawns.push({ x1: arena[0] + 150, x2: arena[1] - 150, boss: true, max: 1, interval: 240 });
  }

  const vehicles = [];
  if (st.cars) vehicles.push({ kind: R.pick(['sports', 'bike']), x: 420, color: R.pick(['#ff2e88', '#19d3c5', '#ffd166', '#b04dff']) });

  return finish({
    id: cfg.id, name: cfg.name, region: cfg.region, theme: cfg.region, variant: cfg.variant ?? 0,
    town: false, copSpawns: false, levelRange: cfg.lv, style: cfg.style, desc: cfg.desc,
    deadEnd: !!cfg.boss, bossArea: arena ? { x1: arena[0], x2: arena[1] } : null,
    width, groundY, spawnX: 260, gravity: st.gravity ?? 1, water: !!st.water,
    ceilingY: st.ceiling ? groundY - rowGap * (tiers + 1) - 40 : undefined,
    platforms, ropes: map.ropes, walls: map.walls, portals, spawns, decor, vehicles, npcs: [],
    world: cfg.world,
  });
}

// ------------------------------------------------------------ 町ビルダー
const L = (style, color, accent) => ({ style, color, accent: accent || color });

/**
 * cfg: {id, name, region, variant, width, lv, left, right, mids:[{to, x}], npcs, vehicles, plats?, decor?}
 */
function town(cfg) {
  const R = makeRng(cfg.id + ':town');
  const width = cfg.width;
  const groundY = GROUND;
  const portals = [];
  if (cfg.left) portals.push({ x: 90, to: cfg.left });
  if (cfg.right) portals.push({ x: width - 90, to: cfg.right });
  for (const m of cfg.mids || []) portals.push({ x: m.x, to: m.to });

  let platforms, ropes;
  if (cfg.plats) ({ platforms, ropes } = platsFrom(cfg.plats, groundY));
  else {
    // 建物のバルコニー / 屋根（2〜3段, 疎ら）
    platforms = []; ropes = [];
    for (let k = 0; k < (cfg.tiers || 2); k++) {
      const y = groundY - ROW * (k + 1);
      let x = Math.round(300 + R.range(0, 200) + k * 120);
      while (x < width - 400) {
        const w = Math.round(R.range(260, 380));
        if (!portals.some((p) => p.x > x - 60 && p.x < x + w + 60)) platforms.push({ x, y, w });
        x += w + Math.round(R.range(260, 480));
      }
    }
    const tmp = { width, groundY, platforms, ropes, gravity: 1 };
    for (const p of [...platforms].sort((a, b) => b.y - a.y)) {
      if (!reachability(tmp).unreachable.includes(p)) continue;
      const rx = Math.round(p.x + p.w * 0.3);
      ropes.push({ x: rx, top: p.y, bottom: ropeBottom(platforms, p, rx, groundY) });
    }
  }

  // 建物・小物の decor（多め）
  const set = DECOR_SETS[cfg.region];
  const decor = [...(cfg.decor || []), ...placeGroundDecor(R, set, portals, groundY, 140 + R.range(0, 60), width - 100, [110, 190], true, cfg.decor || [], platforms)];
  const pset = PLAT_DECOR[cfg.region];
  for (const p of platforms) {
    const type = R.pick(pset), x = Math.round(p.x + p.w * R.range(0.3, 0.7));
    // 上の足場に看板が刺さる／画面上端（HUD の裏）に看板が出る配置は避ける
    if (!clearAbove(type, x, p.y, platforms, p) || p.y - (DECOR_TALL[type] || 0) < 120) continue;
    decor.push({ type, x, y: p.y });
  }

  // NPC がポータルに重ならないよう補正
  const npcs = (cfg.npcs || []).map((n) => {
    let x = n.x;
    while (portals.some((p) => Math.abs(p.x - x) < 90)) x += 100;
    return { ...n, x: Math.min(width - 120, x) };
  });

  return finish({
    id: cfg.id, name: cfg.name, region: cfg.region, theme: cfg.region, variant: cfg.variant ?? 0,
    town: true, copSpawns: true, levelRange: cfg.lv, safe: !!cfg.safe, desc: cfg.desc,
    width, groundY, spawnX: cfg.spawnX ?? 260, gravity: 1,
    platforms, ropes, walls: [], portals, spawns: [], decor, npcs,
    vehicles: cfg.vehicles || [], bgColor: cfg.bgColor, world: cfg.world,
  });
}

// ============================================================ NPC 定義（町ごと）
const NPC = {
  rico: { id: 'rico', name: 'リコ', title: 'ビーチの情報屋',
    look: { body: 'm', skin: '#c68e5e', hair: 'wolf', hairColor: '#1a1a1a', eyeColor: '#3b2a1a' },
    equip: { hat: L('cap', '#ff5fa2', '#ffffff'), top: L('hawaiian', '#19d3c5', '#ff5fa2'), bottom: L('shorts', '#2b4c7e'), shoes: L('sandals', '#c98b4a'), accessory: L('sunglasses', '#222222', '#ff5fa2') },
    dialog: ['よう、新入り！ ヴァイス・ベイへようこそ。', '←→で移動、Spaceでジャンプ、Xで攻撃だ。', 'ロープは↑↓で上り下り、↓+Spaceで足場から飛び降りられる。', '町の外（フィールド）にはモンスターがいる。ポータルの上で↑だ。', '町じゃスキルは使えねぇ。市民を殴ればサツが飛んでくるぞ。Mキーで地図も見られる。'] },
  sunny: { id: 'sunny', name: 'サニー', title: 'ライフガード兼売店',
    look: { body: 'f', skin: '#f5d0b0', hair: 'ponytail', hairColor: '#ffcc66', eyeColor: '#2a7de1' },
    equip: { hat: L('headphones', '#ff7a00', '#ffffff'), top: L('tank', '#ff3b3b', '#ffffff'), bottom: L('shorts', '#ff3b3b'), shoes: L('sandals', '#c98b4a'), accessory: L('sunglasses', '#222222', '#ff7a00') },
    dialog: ['ハーイ！ 冷えたドリンクにポーション、なんでもあるわよ！', '無理は禁物。HPが減ったら 1/2 キーでポーションね。'],
    shop: ['potion_red', 'potion_blue', 'knife_basic', 'bat_wood', 'cap_street', 'tshirt_white', 'shorts_beach', 'sandals_beach', 'sunglasses_aviator'] },
  mama_rosa: { id: 'mama_rosa', name: 'ママ・ローザ', title: '食堂ローザ / ポーション',
    look: { body: 'f', skin: '#d9a07a', hair: 'bob', hairColor: '#8b1e3f', eyeColor: '#3b2a1a' },
    equip: { hat: L('bandana', '#e63946', '#ffffff'), top: L('tshirt', '#ffffff', '#e63946'), bottom: L('skirt', '#8b1e3f'), shoes: L('loafers', '#3a2a1a'), accessory: L('goldChain', '#ffd166') },
    dialog: ['あら、腹ペコかい？ うちの料理とポーションは街いちばんさ。'],
    shop: ['potion_red', 'potion_orange', 'potion_blue', 'drink_energy'] },
  officer_kai: { id: 'officer_kai', name: 'カイ巡査', title: 'ヴァイス・ベイ市警',
    look: { body: 'm', skin: '#e0b090', hair: 'short', hairColor: '#2a1a10', eyeColor: '#1a2a4a' },
    equip: { hat: L('cap', '#1b2a4a', '#ffd166'), top: L('police', '#1b2a4a', '#ffd166'), bottom: L('suitPants', '#1b2a4a'), shoes: L('loafers', '#111111'), accessory: L('sunglasses', '#111111', '#ffd166') },
    dialog: ['…何も見てない。俺は何も見てないぞ。', '手配度が上がったら町の外へ逃げろ。フィールドまでは追ってこない。'] },
  ammo_shop: { id: 'ammo_shop', name: 'ブリック', title: '武器屋アモ・ストリート',
    look: { body: 'f', skin: '#d9a07a', hair: 'bob', hairColor: '#ff2e88', eyeColor: '#222' },
    equip: { hat: L('beanie', '#222', '#ff2e88'), top: L('armorVest', '#4b5320', '#222'), bottom: L('cargo', '#556b2f'), shoes: L('boots', '#222') },
    dialog: ['ネオン街一の品揃えよ。トラブルはお断り。'],
    shop: ['potion_red', 'potion_orange', 'potion_blue', 'pistol_9mm', 'katana_steel', 'beanie_gray', 'bandana_red', 'tank_black', 'hawaiian_shirt', 'cargo_khaki', 'scarf_red'] },
  dash_garage: { id: 'dash_garage', name: 'ダッシュ', title: 'ガレージ',
    look: { body: 'm', skin: '#8d5a3b', hair: 'spiky', hairColor: '#ffd166', eyeColor: '#222' },
    equip: { hat: L('cap', '#e63946', '#fff'), top: L('tracksuit', '#264653', '#e9c46a'), bottom: L('trackPants', '#264653'), shoes: L('sneakers', '#fff', '#e63946') },
    dialog: ['車ならそこに停めてあるのを使いな。Eで乗れるぜ。', '乗ってる間は R でラジオ局を変えられる。'] },
  dj_pulse: { id: 'dj_pulse', name: 'DJパルス', title: '地下レイブの主催',
    look: { body: 'f', skin: '#8d5a3b', hair: 'twin', hairColor: '#b04dff', eyeColor: '#19f0ff' },
    equip: { hat: L('headphones', '#19f0ff', '#ff2e88'), top: L('hoodie', '#1a1a2e', '#b04dff'), bottom: L('shorts', '#1a1a2e'), shoes: L('sneakers', '#ffffff', '#b04dff'), accessory: L('sunglasses', '#ff2e88', '#19f0ff') },
    dialog: ['今夜も倉庫はフロアが揺れてるぜ。ビートに乗れるヤツは大歓迎さ。'] },
  tank: { id: 'tank', name: 'タンク', title: '港のメカニック',
    look: { body: 'm', skin: '#6b4226', hair: 'short', hairColor: '#111', eyeColor: '#222' },
    equip: { hat: L('beanie', '#2a9d8f'), top: L('tank', '#3d405b', '#e76f51'), bottom: L('cargo', '#3d405b'), shoes: L('boots', '#222222'), accessory: L('goldChain', '#ffd166') },
    dialog: ['車が要る？ そこのバイクを使いな。Eで乗れる。', '轢きすぎるとサツが飛んでくるぞ。'] },
  sal_pawn: { id: 'sal_pawn', name: 'サル', title: '質屋',
    look: { body: 'm', skin: '#e0b48a', hair: 'bob', hairColor: '#777', eyeColor: '#333' },
    equip: { top: L('suit', '#5c4033', '#ffd166'), bottom: L('suitPants', '#5c4033'), shoes: L('loafers', '#3a2a1a'), accessory: L('sunglasses', '#111') },
    dialog: ['盗品？ うちは何も聞かない主義でね。'],
    shop: ['potion_orange', 'potion_blue', 'potion_mana', 'smg_compact', 'bat_nail', 'guitar_electric', 'staff_neon', 'tracksuit_green', 'track_pants', 'loafers_brown', 'heels_red'] },
  old_boone: { id: 'old_boone', name: 'ブーンじいさん', title: 'ワニ猟師',
    look: { body: 'm', skin: '#c08a60', hair: 'long', hairColor: '#dddddd', eyeColor: '#3b2a1a' },
    equip: { hat: L('cowboy', '#6b4a2a', '#3a2a1a'), top: L('leatherJacket', '#5c4033', '#c9a227'), bottom: L('cargo', '#4b5320'), shoes: L('boots', '#3a2a1a') },
    dialog: ['グレイズ村へようこそ、若いの。', 'ワニの巣の主グランパ・ゲイターには近づくんじゃないぞ…'] },
  voodoo_betty: { id: 'voodoo_betty', name: 'ブードゥー・ベティ', title: '沼の魔女の薬屋',
    look: { body: 'f', skin: '#7a4b2a', hair: 'long', hairColor: '#2d6a4f', eyeColor: '#d4ff4f' },
    equip: { hat: L('cowboy', '#4a3b2a'), top: L('hoodie', '#2d6a4f', '#d4ff4f'), bottom: L('skirt', '#3a2a1a'), shoes: L('boots', '#3a2a1a'), accessory: L('scarf', '#9b5de5') },
    dialog: ['沼の主が目を覚ましたよ…気をつけな。'],
    shop: ['potion_orange', 'potion_white', 'potion_mana', 'elixir', 'drink_energy', 'cowboy_hat', 'mask_skull', 'suit_pants'] },
  vivi: { id: 'vivi', name: 'ヴィヴィ', title: 'ネオン・パレスのディーラー',
    look: { body: 'f', skin: '#f2c7a5', hair: 'long', hairColor: '#111', eyeColor: '#c77dff' },
    equip: { top: L('idolDress', '#c77dff', '#ffd166'), bottom: L('skirt', '#3c096c'), shoes: L('heels', '#ffd166'), accessory: L('goldChain', '#ffd166') },
    dialog: ['ゴールデン・ストリップへようこそ。今夜の運試しはいかが？'] },
  don_caiman: { id: 'don_caiman', name: 'ドン・カイマン', title: 'カジノ王',
    look: { body: 'm', skin: '#d0a070', hair: 'wolf', hairColor: '#e8e8e8', eyeColor: '#ffd23f' },
    equip: { hat: L('crown', '#ffd23f', '#ff2e88'), top: L('suit', '#ffd23f', '#16161e'), bottom: L('suitPants', '#16161e'), shoes: L('loafers', '#3a2a1a'), accessory: L('goldChain', '#ffd23f') },
    dialog: ['フッ…この街の夜は全て私のものだ。', '用があるなら、ヴァイス・タワーの最上階まで来るんだな。'] },
  mr_chip: { id: 'mr_chip', name: 'ミスター・チップ', title: '景品交換所',
    look: { body: 'm', skin: '#e8b88f', hair: 'short', hairColor: '#ffd166', eyeColor: '#222' },
    equip: { hat: L('cowboy', '#ffd166', '#222'), top: L('suit', '#ffffff', '#ffd166'), bottom: L('suitPants', '#ffffff'), shoes: L('loafers', '#ffd166'), accessory: L('sunglasses', '#ffd166') },
    dialog: ['チップがあるなら、とびきりの品と交換だ。'],
    shop: ['potion_white', 'potion_mana', 'elixir', 'power_elixir', 'drink_lucky', 'pistol_gold', 'katana_blood', 'suit_black', 'sunglasses_neon', 'idol_dress'] },
  nova: { id: 'nova', name: 'ノヴァ', title: '天才ハッカー',
    look: { body: 'f', skin: '#f5d0b0', hair: 'twin', hairColor: '#19d3c5', eyeColor: '#ff2e88' },
    equip: { hat: L('catEars', '#19d3c5', '#ff2e88'), top: L('hoodie', '#1a1a2e', '#19d3c5'), bottom: L('shorts', '#1a1a2e'), shoes: L('sneakers', '#19d3c5'), accessory: L('mask', '#111', '#ff2e88') },
    dialog: ['ドンはタワー最上階のペントハウスにいる。準備はいい？'] },
  shop_downtown: { id: 'shop_downtown', name: 'ミミ', title: 'ネオン・ブティック',
    look: { body: 'f', skin: '#f2c7a5', hair: 'twin', hairColor: '#ff7ad9', eyeColor: '#7a3cff' },
    equip: { hat: L('beanie', '#ff7ad9', '#ffffff'), top: L('hoodie', '#7a3cff', '#ff7ad9'), bottom: L('skirt', '#22223b'), shoes: L('sneakers', '#ffffff', '#ff7ad9'), accessory: L('sunglasses', '#ff7ad9', '#19f0ff') },
    dialog: ['いらっしゃ〜い！ ダウンタウンの最新ストリートコーデ、そろってるよ。'] },
  dr_stella: { id: 'dr_stella', name: 'ステラ博士', title: 'ルミナ宇宙港 主任研究者',
    look: { body: 'f', skin: '#f5d0b0', hair: 'long', hairColor: '#e0e0ff', eyeColor: '#19f0ff' },
    equip: { hat: L('headphones', '#e0e0ff', '#19f0ff'), top: L('suit', '#ffffff', '#19f0ff'), bottom: L('suitPants', '#c0c0e0'), shoes: L('boots', '#e0e0ff'), accessory: L('sunglasses', '#19f0ff', '#ffffff') },
    dialog: ['ルミナ宇宙港へようこそ。私はステラ、ここの主任研究者よ。', '月面シミュ区画の先で、正体不明の宇宙船が見つかったの…'] },
  ace_jet: { id: 'ace_jet', name: 'エース・ジェット', title: '月面シミュ区画の管理人',
    look: { body: 'm', skin: '#8d5a3b', hair: 'short', hairColor: '#19f0ff', eyeColor: '#222' },
    equip: { hat: L('helmet', '#ffffff', '#ff7a00'), top: L('armorVest', '#ff7a00', '#ffffff'), bottom: L('armorPants', '#ffffff'), shoes: L('boots', '#ff7a00') },
    dialog: ['元テストパイロットのエースだ。月面区画は重力0.6G、跳びすぎ注意だぜ。', '宇宙食とドリンクならうちで揃う。'] },
};
const npc = (id, x, extra = {}) => ({ ...NPC[id], x, ...extra });

// ============================================================ マップ一覧
const T = {
  beach: town({
    id: 'beach', name: 'ヴァイス・ビーチ', region: 'beach', variant: 0, width: 2800, lv: [1, 12], safe: true,
    desc: '旅の始まりの浜辺の町。モンスターは出ない。', bgColor: '#ff9a6b', world: { x: 0, y: 5 },
    right: 'beach_f1', mids: [{ to: 'beach_f3', x: 1750 }],
    plats: [[420, 870, 300], [900, 870, 320, true], [1300, 740, 300, true], [2150, 870, 300], [2250, 740, 260, true]],
    npcs: [npc('rico', 380), npc('sunny', 620)],
    vehicles: [{ kind: 'bike', x: 1000, color: '#ff5fa2' }, { kind: 'sports', x: 2300, color: '#19d3c5' }],
  }),
  downtown: town({
    id: 'downtown', name: 'ダウンタウン', region: 'downtown', variant: 0, width: 3200, lv: [10, 22], tiers: 3,
    desc: 'ネオン輝く街の中心。4方向へ道が延びる。', bgColor: '#2a1446', world: { x: 4, y: 5 },
    left: 'beach_f4', right: 'down_f3', mids: [{ to: 'down_f1', x: 1150 }, { to: 'down_f4', x: 2250 }],
    npcs: [npc('mama_rosa', 380), npc('officer_kai', 800), npc('shop_downtown', 1350), npc('ammo_shop', 1700), npc('dash_garage', 2700)],
    vehicles: [{ kind: 'sports', x: 2900, color: '#ff2e88' }, { kind: 'sports', x: 1400, color: '#19d3c5' }, { kind: 'bike', x: 600, color: '#ffd166' }],
  }),
  slums: town({
    id: 'slums', name: 'ポート・スラム', region: 'slums', variant: 0, width: 3000, lv: [20, 36], tiers: 3,
    desc: 'コンテナが積まれた港町。', bgColor: '#3b2b3a', world: { x: 7, y: 5 },
    left: 'slums_f1', right: 'slums_f4', mids: [{ to: 'slums_f2', x: 1650 }],
    npcs: [npc('dj_pulse', 380), npc('sal_pawn', 1100), npc('tank', 2300)],
    vehicles: [{ kind: 'bike', x: 2500, color: '#e76f51' }, { kind: 'sports', x: 800, color: '#2a9d8f' }],
  }),
  swamp: town({
    id: 'swamp', name: 'グレイズ村', region: 'swamp', variant: 0, width: 2600, lv: [22, 45],
    desc: '湿地のほとりの小さな村。', bgColor: '#1f3b2c', world: { x: 5, y: 3 },
    left: 'swamp_f1', right: 'swamp_f4', mids: [{ to: 'swamp_f2', x: 1350 }],
    npcs: [npc('old_boone', 380), npc('voodoo_betty', 900)],
    vehicles: [{ kind: 'bike', x: 1900, color: '#6b8f3a' }],
  }),
  casino: town({
    id: 'casino', name: 'ゴールデン・ストリップ', region: 'casino', variant: 0, width: 3200, lv: [42, 60], tiers: 3,
    desc: '黄金のカジノ街。', bgColor: '#3a0a3a', world: { x: 8, y: 3 },
    left: 'casino_f1', right: 'casino_f4', mids: [{ to: 'casino_f2', x: 1650 }],
    npcs: [npc('vivi', 380), npc('mr_chip', 1100), npc('don_caiman', 2400)],
    vehicles: [{ kind: 'sports', x: 2700, color: '#ffd166' }, { kind: 'sports', x: 700, color: '#ff2e88' }],
  }),
  rooftop: town({
    id: 'rooftop', name: 'ヴァイス・タワー', region: 'rooftop', variant: 0, width: 2400, lv: [58, 76], tiers: 3,
    desc: '摩天楼の中層ロビー兼屋上テラス。', bgColor: '#0d0b26', world: { x: 11, y: 3 },
    left: 'tower_f1', right: 'tower_f2',
    npcs: [npc('nova', 380)],
    vehicles: [],
  }),
  spaceport: town({
    id: 'spaceport', name: 'ルミナ宇宙港', region: 'spaceport', variant: 0, width: 2800, lv: [36, 100], tiers: 3,
    desc: 'ロケットが並ぶ近未来の宇宙港。', bgColor: '#0a1030', world: { x: 11, y: 5 },
    left: 'space_f2', right: 'space_f3',
    npcs: [npc('dr_stella', 400), npc('ace_jet', 1300)],
    vehicles: [{ kind: 'sports', x: 2000, color: '#e0e0ff' }],
    decor: [{ type: 'rocket', x: 700 }, { type: 'rocket', x: 2300 }, { type: 'satelliteDish', x: 1700 }],
  }),
};

const F = [
  // beach
  { id: 'beach_f1', name: 'サンセット海岸道', region: 'beach', variant: 0, lv: [1, 3], style: 'coast', left: 'beach', right: 'beach_f2', world: { x: 1, y: 5 }, desc: '夕日の海岸沿い。初心者向け。' },
  { id: 'beach_f2', name: 'ヤシの並木道', region: 'beach', variant: 1, lv: [3, 6], style: 'standard', left: 'beach_f1', right: 'beach_f4', world: { x: 2, y: 5 } },
  { id: 'beach_f3', name: 'ピア桟橋', region: 'beach', variant: 2, lv: [5, 9], style: 'pier', left: 'beach', boss: true, world: { x: 0, y: 6 }, desc: '海の上の桟橋。奥にキングゼリーが潜む。' },
  { id: 'beach_f4', name: 'ハイウェイ入口', region: 'beach', variant: 3, lv: [8, 12], style: 'highway', left: 'beach_f2', right: 'downtown', world: { x: 3, y: 5 } },
  // downtown
  { id: 'down_f1', name: 'ネオン裏通り', region: 'downtown', variant: 1, lv: [10, 14], style: 'alley', left: 'downtown', right: 'down_f2', world: { x: 4, y: 6 } },
  { id: 'down_f2', name: '地下鉄トンネル', region: 'downtown', variant: 2, lv: [13, 18], style: 'tunnel', left: 'down_f1', boss: true, world: { x: 4, y: 7 }, desc: '天井の低い廃トンネル。奥に中ボス。' },
  { id: 'down_f3', name: '高架ハイウェイ', region: 'downtown', variant: 3, lv: [16, 22], style: 'highway', left: 'downtown', right: 'slums_f1', world: { x: 5, y: 5 } },
  { id: 'down_f4', name: 'セントラル公園', region: 'downtown', variant: 0, lv: [14, 20], style: 'park', left: 'downtown', right: 'swamp_f1', world: { x: 4, y: 4 } },
  // slums
  { id: 'slums_f1', name: '倉庫街', region: 'slums', variant: 1, lv: [20, 25], style: 'warehouse', left: 'down_f3', right: 'slums', world: { x: 6, y: 5 } },
  { id: 'slums_f2', name: '造船所', region: 'slums', variant: 2, lv: [24, 30], style: 'dock', left: 'slums', right: 'slums_f3', world: { x: 7, y: 6 } },
  { id: 'slums_f3', name: '密輸船', region: 'slums', variant: 3, lv: [28, 34], style: 'ship', left: 'slums_f2', boss: true, world: { x: 7, y: 7 } },
  { id: 'slums_f4', name: '廃線路', region: 'slums', variant: 0, lv: [30, 36], style: 'rail', left: 'slums', right: 'space_f1', world: { x: 8, y: 5 } },
  // swamp
  { id: 'swamp_f1', name: '湿地の入口', region: 'swamp', variant: 1, lv: [22, 28], style: 'standard', left: 'down_f4', right: 'swamp', world: { x: 4, y: 3 } },
  { id: 'swamp_f2', name: 'マングローブ迷路', region: 'swamp', variant: 2, lv: [30, 38], style: 'maze', left: 'swamp', right: 'swamp_f3', world: { x: 5, y: 2 } },
  { id: 'swamp_f3', name: 'ワニの巣', region: 'swamp', variant: 3, lv: [36, 44], style: 'nest', left: 'swamp_f2', boss: true, world: { x: 5, y: 1 } },
  { id: 'swamp_f4', name: '霧の水路', region: 'swamp', variant: 0, lv: [38, 45], style: 'pier', left: 'swamp', right: 'casino_f1', world: { x: 6, y: 3 } },
  // casino
  { id: 'casino_f1', name: '砂漠ハイウェイ', region: 'casino', variant: 1, lv: [42, 48], style: 'highway', left: 'swamp_f4', right: 'casino', world: { x: 7, y: 3 } },
  { id: 'casino_f2', name: '地下金庫', region: 'casino', variant: 2, lv: [48, 55], style: 'vault', left: 'casino', right: 'casino_f3', world: { x: 8, y: 2 } },
  { id: 'casino_f3', name: 'VIPフロア', region: 'casino', variant: 3, lv: [54, 60], style: 'hall', left: 'casino_f2', boss: true, world: { x: 8, y: 1 } },
  { id: 'casino_f4', name: '夜景ブールバード', region: 'casino', variant: 0, lv: [52, 58], style: 'standard', left: 'casino', right: 'tower_f1', world: { x: 9, y: 3 } },
  // rooftop
  { id: 'tower_f1', name: '工事現場の足場', region: 'rooftop', variant: 1, lv: [58, 64], style: 'tower', left: 'casino_f4', right: 'rooftop', world: { x: 10, y: 3 }, desc: '高く伸びる鉄骨の足場。出口は最上段。' },
  { id: 'tower_f2', name: '空中庭園', region: 'rooftop', variant: 2, lv: [64, 70], style: 'garden', left: 'rooftop', right: 'tower_f3', world: { x: 11, y: 2 } },
  { id: 'tower_f3', name: '最上階ペントハウス', region: 'rooftop', variant: 3, lv: [70, 76], style: 'hall', left: 'tower_f2', boss: true, world: { x: 11, y: 1 }, desc: 'ドン・カイマンの待つ最上階。' },
  // spaceport
  { id: 'space_f1', name: '沿岸ロケット道', region: 'spaceport', variant: 1, lv: [36, 42], style: 'coast', left: 'slums_f4', right: 'space_f2', world: { x: 9, y: 5 } },
  { id: 'space_f2', name: '発射台エリア', region: 'spaceport', variant: 2, lv: [42, 50], style: 'launch', left: 'space_f1', right: 'spaceport', world: { x: 10, y: 5 } },
  { id: 'space_f3', name: '月面シミュ区画', region: 'spaceport', variant: 3, lv: [75, 85], style: 'moon', left: 'spaceport', right: 'space_f4', world: { x: 11, y: 6 }, desc: '重力 0.6G。ふわりと高く跳べる。' },
  { id: 'space_f4', name: '謎の宇宙船', region: 'spaceport', variant: 0, lv: [85, 100], style: 'alienShip', left: 'space_f3', boss: true, world: { x: 11, y: 7 }, desc: '正体不明の宇宙船。裏ボスが潜む。' },
];

// ショップ品揃え: システム担当の提案（data/shops.js TOWN_SHOPS）を優先して適用
for (const [mapId, shops] of Object.entries(TOWN_SHOPS || {})) {
  const m = T[mapId];
  if (!m) continue;
  for (const sh of shops) {
    const n = m.npcs.find((q) => q.id === sh.npcId);
    if (n) { n.shop = [...sh.items]; n.shopName = sh.name; }
  }
}

export const MAPS = { ...T };
for (const cfg of F) MAPS[cfg.id] = field(cfg);

// ------------------------------------------------------------ ポータル: label と到着位置を自動設定
for (const m of Object.values(MAPS)) {
  for (const p of m.portals) {
    const dest = MAPS[p.to];
    if (!dest) continue;
    p.label = p.label || dest.name;
    const back = dest.portals.find((q) => q.to === m.id);
    if (!back) { p.toX = dest.spawnX; continue; }
    let dir = back.x < dest.width / 2 ? 1 : -1;
    let tx = back.x + dir * 150;
    if (back.y < dest.groundY) {
      // 足場の上のポータル（塔の最上段）
      const pl = dest.platforms.find((q) => q.y === back.y && back.x >= q.x && back.x <= q.x + q.w);
      if (pl) {
        if (tx < pl.x + 24 || tx > pl.x + pl.w - 24) { dir = -dir; tx = back.x + dir * 150; }
        tx = Math.max(pl.x + 24, Math.min(pl.x + pl.w - 24, tx));
      }
      p.toY = back.y - 2;
    }
    // 他のポータルに重ならないようずらす
    for (let n = 0; n < 6 && dest.portals.some((q) => Math.abs(q.x - tx) <= 80); n++) tx += dir * 80;
    p.toX = Math.round(Math.max(40, Math.min(dest.width - 40, tx)));
  }
}

export const TOWN_IDS = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop', 'spaceport'];
export const FIELD_IDS = F.map((f) => f.id);
// 進行順（デバッグのワープ一覧など）
export const MAP_ORDER = [
  'beach', 'beach_f1', 'beach_f2', 'beach_f3', 'beach_f4',
  'downtown', 'down_f1', 'down_f2', 'down_f3', 'down_f4',
  'slums_f1', 'slums', 'slums_f2', 'slums_f3', 'slums_f4',
  'swamp_f1', 'swamp', 'swamp_f2', 'swamp_f3', 'swamp_f4',
  'casino_f1', 'casino', 'casino_f2', 'casino_f3', 'casino_f4',
  'tower_f1', 'rooftop', 'tower_f2', 'tower_f3',
  'space_f1', 'space_f2', 'spaceport', 'space_f3', 'space_f4',
];
// 接続表（SPEC_V2）。双方向
export const CONNECTIONS = [
  ['beach', 'beach_f1'], ['beach_f1', 'beach_f2'], ['beach_f2', 'beach_f4'], ['beach_f4', 'downtown'], ['beach', 'beach_f3'],
  ['downtown', 'down_f1'], ['down_f1', 'down_f2'],
  ['downtown', 'down_f3'], ['down_f3', 'slums_f1'], ['slums_f1', 'slums'],
  ['downtown', 'down_f4'], ['down_f4', 'swamp_f1'], ['swamp_f1', 'swamp'],
  ['slums', 'slums_f2'], ['slums_f2', 'slums_f3'],
  ['slums', 'slums_f4'], ['slums_f4', 'space_f1'], ['space_f1', 'space_f2'], ['space_f2', 'spaceport'],
  ['swamp', 'swamp_f2'], ['swamp_f2', 'swamp_f3'],
  ['swamp', 'swamp_f4'], ['swamp_f4', 'casino_f1'], ['casino_f1', 'casino'],
  ['casino', 'casino_f2'], ['casino_f2', 'casino_f3'],
  ['casino', 'casino_f4'], ['casino_f4', 'tower_f1'], ['tower_f1', 'rooftop'],
  ['rooftop', 'tower_f2'], ['tower_f2', 'tower_f3'],
  ['spaceport', 'space_f3'], ['space_f3', 'space_f4'],
];
export function getMap(id) { return MAPS[id] || null; }
export function neighbors(id) { return (MAPS[id]?.portals || []).map((p) => p.to); }
