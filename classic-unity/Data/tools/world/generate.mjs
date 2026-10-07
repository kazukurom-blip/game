// マップの生成器。地形の型（specs.mjs の tpl）と、マップごとの違い（specs.mjs・maps.mjs・npcs.mjs）から
// Data/maps/<ID>.json の形（Core/World/MapData.cs）を作る。種はマップの ID（＋試した回数）なので、何度作っても同じ結果。
//
// クラシックの手触りの決まり（FEEL.md）:
//   - 跳んで上がる段差は 40〜60 px（ジャンプの最高は約 77 px。設計では 64 px まで）
//   - 64〜80 px の「跳べそうで跳べない」段差は作らない。80 px 以上は縄・はしご
//   - 縄の上端は足場の高さちょうど（上りきると立てる）、下端は下の足場の 20 px 上（↑でつかめる）
//   - 坂は 45 度まで（地面の坂は 20〜37 度）
//   - 狩り場は横長で数層、町は平ら
// 作ったマップは check.mjs の検査を通るまで種を変えて作り直す（通らなければ problems に入る）。
import { checkMap, FEEL } from './check.mjs';
import { makeRng, hashStr } from './rng.mjs';
import { SPECS, TYPE_TPL, regionDefaults } from './specs.mjs';

const TOP_MARGIN = 200;     // 一番上の足場から上の空き
const BOTTOM_MARGIN = 80;   // 地面から下
const ROPE_GAP = 20;        // 縄の下端と下の足場の間
const STEP_MIN = 40, STEP_MAX = 60;

// ---------------- 足場の組み立て
class Builder {
  constructor(W, G) {
    this.W = W; this.G = G;
    this.grounds = [];   // { id, points }（地面。ふつうは 1 本。部屋のダンジョンは部屋ごと）
    this.plats = [];     // { id, x1, x2, y, layer, kind: 'layer'|'step'|'stair'|'deco'|'secret', reached }
    this.ropes = []; this.walls = []; this.portals = []; this.npcs = []; this.objects = [];
    this.reserved = [];  // ポータル・NPC などのために空けておく x
    this.n = 0;
  }
  id(prefix) { return `${prefix}${++this.n}`; }
  addGround(points, id = 'g') { this.grounds.push({ id, points }); }
  addPlat(x1, x2, y, o = {}) {
    const p = { id: o.id || this.id(o.kind === 'step' || o.kind === 'stair' ? 's' : 'p'), x1: Math.round(x1), x2: Math.round(x2), y: Math.round(y), layer: o.layer || 0, kind: o.kind || 'layer', ...o };
    this.plats.push(p);
    return p;
  }
  /** 地面の高さ（x の所）。無ければ null */
  groundY(x) {
    for (const g of this.grounds) {
      const pts = g.points;
      if (x < pts[0][0] || x > pts[pts.length - 1][0]) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        if (x >= x1 && x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      }
    }
    return null;
  }
  /** x で高さ y より下（y + 0.5 より大きい）の一番近い面。{ y, plat } */
  below(x, y, skip = null) {
    let best = null;
    const gy = this.groundY(x);
    if (gy != null && gy > y + 0.5) best = { y: gy, plat: null };
    for (const p of this.plats) {
      if (p === skip || x < p.x1 || x > p.x2) continue;
      if (p.y > y + 0.5 && (!best || p.y < best.y)) best = { y: p.y, plat: p };
    }
    return best;
  }
  /** x で高さ y より上の、一番近い面（浮いた足場だけ） */
  above(x, y, skip = null) {
    let best = null;
    for (const p of this.plats) {
      if (p === skip || x < p.x1 || x > p.x2) continue;
      if (p.y < y - 0.5 && (!best || p.y > best.y)) best = p;
    }
    return best;
  }
  minY() {
    let m = Infinity;
    for (const g of this.grounds) for (const [, y] of g.points) m = Math.min(m, y);
    for (const p of this.plats) m = Math.min(m, p.y);
    return m;
  }
  /** 足場を置けるか（段差の決まり）。x1〜x2 の高さ y。 */
  canPlace(x1, x2, y, o = {}) {
    const minGap = o.minGap ?? 40;
    if (x1 < 24 || x2 > this.W - 24 || x2 - x1 < 64) return false;
    for (let x = x1; x <= x2; x += 8) {
      const b = this.below(x, y);
      if (!b) return false;
      const d = b.y - y;
      if (d < minGap) return false;
      if (d > FEEL.stepMax && d < FEEL.bandHi) return false;
      if (o.maxBelow != null && d > o.maxBelow) return false;
      if (o.minBelow != null && d < o.minBelow) return false;
      // 上の足場の真下がこれになる時、その差も決まりを守る
      const a = this.above(x, y);
      if (a) {
        const u = y - a.y;
        if (u < minGap) return false;
        if (u > FEEL.stepMax && u < FEEL.bandHi) return false;
      }
    }
    // 同じ高さのとなりの足場とくっつかない
    for (const p of this.plats) {
      if (Math.abs(p.y - y) < minGap && p.x1 < x2 + 48 && p.x2 > x1 - 48) return false;
    }
    return true;
  }
  isReserved(x, d) { return this.reserved.some((r) => Math.abs(r - x) < d); }
  ropeNear(x, d) { return this.ropes.some((r) => Math.abs(r.x - x) < d); }

  /** 地面と足場（MapData の footholds の形） */
  footholds() {
    const out = this.grounds.map((g) => ({ id: g.id, ground: true, points: g.points.map(([x, y]) => [Math.round(x), Math.round(y)]) }));
    for (const p of this.plats) out.push({ id: p.id, points: [[p.x1, p.y], [p.x2, p.y]] });
    return out;
  }
}

// ---------------- 地面
function flatGround(B) { B.addGround([[0, B.G], [B.W, B.G]]); }

/** なだらかな丘（高さ 24 か 48。坂は 64 px で 24 上がる = 約 21 度）。avoid の範囲には作らない */
function hillyGround(B, rng, { count, maxH = 48, avoid = [] }) {
  const hills = [];
  for (let t = 0; t < 40 && hills.length < count; t++) {
    const h = maxH >= 48 && rng.chance(0.4) ? 48 : 24;
    const ramp = (h / 24) * 64;
    const plateau = rng.snap(rng.range(200, 480));
    const a = rng.snap(rng.range(240, B.W - 240 - plateau - 2 * ramp));
    const b = a + 2 * ramp + plateau;
    if (b > B.W - 240) continue;
    if (avoid.some(([za, zb]) => a < zb + 32 && b > za - 32)) continue;
    if (hills.some((q) => a < q.b + 120 && b > q.a - 120)) continue;
    hills.push({ a, b, h, ramp });
  }
  hills.sort((p, q) => p.a - q.a);
  const pts = [[0, B.G]];
  for (const hl of hills) {
    pts.push([hl.a, B.G]);
    if (hl.h === 48) { pts.push([hl.a + 64, B.G - 24]); pts.push([hl.a + 128, B.G - 48]); }
    else pts.push([hl.a + 64, B.G - 24]);
    pts.push([hl.b - hl.ramp, B.G - hl.h]);
    if (hl.h === 48) pts.push([hl.b - 64, B.G - 24]);
    pts.push([hl.b, B.G]);
  }
  pts.push([B.W, B.G]);
  B.addGround(pts);
  return hills;
}

/** 段々の地面（岩山・雪山・丘の町）。1 段 48 px を 64 px の坂（約 37 度）で上がる */
function terracedGround(B, rng, { steps = 3, avoid = [] }) {
  const pts = [[0, B.G]];
  let y = B.G, x = 0;
  const up = rng.chance(0.5); // 右へ上がる / 左へ上がる（後で左右を反転）
  const flats = [];
  const n = steps;
  const seg = (B.W - 400) / (n + 1);
  x = 200 + rng.snap(rng.range(seg * 0.6, seg * 1.0));
  for (let i = 0; i < n; i++) {
    if (avoid.some(([za, zb]) => x < zb && x + 64 > za)) x += 96;
    if (x + 64 > B.W - 200) break;
    pts.push([x, y]);
    y -= 48;
    pts.push([x + 64, y]);
    flats.push(x + 64);
    x += 64 + rng.snap(rng.range(seg * 0.6, seg * 1.0));
  }
  pts.push([B.W, y]);
  let out = pts;
  if (!up) out = pts.map(([px, py]) => [B.W - px, py]).reverse();
  // 点の重なりを除く
  const clean = [];
  for (const p of out) if (!clean.length || p[0] > clean[clean.length - 1][0]) clean.push(p);
  B.addGround(clean);
}

// ---------------- 層（浮いた足場）
/**
 * 層を作る。xa〜xb の範囲に、1 層ずつ上へ。
 * gaps: 層ごとの高さの差の範囲（最初の層は first）。pieces: 層ごとの足場の数の範囲。cover: 範囲のうち足場で埋める割合。
 * tower: 左右交互（塔）
 */
function addLayers(B, rng, o) {
  const { count, xa = 120, xb = B.W - 120, first = [128, 152], gap = [104, 136], pieces = [1, 3], cover = [0.55, 0.85], tower = false, minLen = 240 } = o;
  let base = Infinity;
  for (let x = xa; x <= xb; x += 16) { const gy = B.groundY(x); if (gy != null) base = Math.min(base, gy); }
  // 範囲の中の一番高い面（前に置いた足場も含む）を基準に
  let y = base;
  const layers = [];
  for (let k = 1; k <= count; k++) {
    const g = rng.snap(rng.range(...(k === 1 ? first : gap)));
    y -= g;
    const list = [];
    if (tower) {
      const left = k % 2 === 1;
      const span = xb - xa;
      const len = span * rng.range(0.58, 0.7);
      const x1 = left ? xa : xb - len;
      if (B.canPlace(x1, x1 + len, y)) list.push(B.addPlat(x1, x1 + len, y, { layer: k }));
    } else {
      const n = rng.int(pieces[0], pieces[1]);
      const slot = (xb - xa) / n;
      for (let i = 0; i < n; i++) {
        let len = Math.max(minLen, slot * rng.range(cover[0], cover[1]));
        len = Math.min(len, slot - 64);
        if (len < minLen) continue;
        const x1 = xa + i * slot + rng.range(16, Math.max(17, slot - len - 16));
        for (const dy of [0, -8, 8, -16, 16]) {
          if (B.canPlace(x1, x1 + len, y + dy)) { list.push(B.addPlat(x1, x1 + len, y + dy, { layer: k })); break; }
        }
      }
    }
    layers.push(list);
  }
  return layers;
}

/** 跳んで上がる石・枝（1 つ）。surface の上 40〜60 px。 */
function addStepStone(B, rng, o = {}) {
  const w = rng.snap(rng.range(o.wMin ?? 96, o.wMax ?? 200));
  for (let t = 0; t < 30; t++) {
    const x1 = rng.snap(rng.range(o.xa ?? 140, (o.xb ?? B.W - 140) - w));
    const x2 = x1 + w;
    // 範囲の下の面の高さがそろっている所だけ
    const ys = [];
    let ok = true;
    for (let x = x1; x <= x2; x += 8) {
      // その x で「上に何も無い面」の中で一番高い所の上に置く → ここでは x の一番上の面
      let top = B.groundY(x);
      for (const p of B.plats) if (x >= p.x1 && x <= p.x2 && (top == null || p.y < top)) top = p.y;
      if (top == null) { ok = false; break; }
      ys.push(top);
    }
    if (!ok) continue;
    const lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo > 16) continue;
    const y = lo - rng.pick([48, 52, 56, 60]);
    if (o.maxY != null && y < o.maxY) continue;
    if (B.canPlace(x1, x2, y, { maxBelow: STEP_MAX + 4 })) return B.addPlat(x1, x2, y, { kind: 'step' });
  }
  return null;
}

/** 足場 p へ跳んで上がる階段（左か右の端から）。成功したら true */
function addStair(B, rng, p, side) {
  const W = 160, OV = 48;
  const ex = side < 0 ? p.x1 : p.x2;
  // 階段の一番下の面
  const zoneA = side < 0 ? ex - 3 * (W - OV) - OV : ex - OV;
  const zoneB = side < 0 ? ex + OV : ex + 3 * (W - OV) + OV;
  if (zoneA < 40 || zoneB > B.W - 40) return false;
  const b = B.below(ex + side * -OV / 2, p.y, p);
  if (!b) return false;
  const D = b.y - p.y;
  if (D <= FEEL.stepMax) return false;
  let n = Math.ceil(D / STEP_MAX);
  let s = D / n;
  if (s < STEP_MIN) return false;
  const plan = [];
  let cx1 = side < 0 ? ex - (W - OV) : ex - OV; // 一番上の段（p と OV 重なる）
  for (let j = n - 1; j >= 1; j--) {
    const y = Math.round(p.y + (n - j) * s);
    plan.push([cx1, cx1 + W, y]);
    cx1 = side < 0 ? cx1 - (W - OV) : cx1 + (W - OV);
  }
  // 置けるか確かめてから置く（途中で失敗したら全部取り消す）
  const added = [];
  for (const [x1, x2, y] of plan) {
    if (!B.canPlace(x1, x2, y, { maxBelow: 200 })) { for (const q of added) B.plats.splice(B.plats.indexOf(q), 1); return false; }
    added.push(B.addPlat(x1, x2, y, { kind: 'stair' }));
  }
  // 一番下の段から下の面まで跳べるか
  const last = added[added.length - 1];
  for (let x = last.x1; x <= last.x2; x += 8) {
    const bb = B.below(x, last.y, last);
    if (!bb || bb.y - last.y > FEEL.stepMax) { for (const q of added) B.plats.splice(B.plats.indexOf(q), 1); return false; }
  }
  p.stair = true;
  return true;
}

/** 縄・はしご。足場ごとに 1〜2 本（長い足場は 2 本）。下の面まで 80 px 以上ある所だけ */
function addRopes(B, rng, kind = 'rope', o = {}) {
  const ladderP = kind === 'ladder' ? 1 : kind === 'mixed' ? 0.4 : 0;
  for (const p of B.plats) {
    if (p.kind === 'secret' || p.kind === 'step' || p.kind === 'stair') continue;
    let want = p.x2 - p.x1 > 900 ? 2 : 1;
    if (p.stair && rng.chance(0.5)) want--;
    if (o.max != null) want = Math.min(want, o.max);
    const cands = [];
    for (let x = p.x1 + 48; x <= p.x2 - 48; x += 8) {
      if (B.isReserved(x, 48) || B.ropeNear(x, 64)) continue;
      const b = B.below(x, p.y, p);
      if (!b) continue;
      const d = b.y - p.y;
      if (d < FEEL.bandHi) continue;
      // 下の面がこの x の前後でそろっている（坂の途中に下端を置かない）
      const b1 = B.below(x - 10, p.y, p), b2 = B.below(x + 10, p.y, p);
      if (!b1 || !b2 || Math.abs(b1.y - b.y) > 4 || Math.abs(b2.y - b.y) > 4) continue;
      cands.push({ x, by: b.y });
    }
    for (let i = 0; i < want && cands.length; i++) {
      // 2 本の時は左右に分ける
      const pool = want === 2 ? cands.filter((c) => (i === 0 ? c.x < (p.x1 + p.x2) / 2 : c.x >= (p.x1 + p.x2) / 2)) : cands;
      if (!pool.length) continue;
      const c = rng.pick(pool);
      if (B.ropeNear(c.x, 64)) continue;
      B.ropes.push({ x: c.x, top: p.y, bottom: c.by - ROPE_GAP, ladder: rng.chance(ladderP) });
    }
  }
}

// ---------------- 隠し部屋
function addSecret(B, rng, sec) {
  const top = B.minY();
  const y = top - 200;
  const RW = 280;
  let x1;
  let from;
  if (sec.from === 'ground-left') { x1 = 140; from = { x: 160, y: B.groundY(160) }; }
  else if (sec.from === 'ground-right') { x1 = B.W - 140 - RW; from = { x: B.W - 160, y: B.groundY(B.W - 160) }; }
  else {
    const tops = B.plats.filter((p) => p.kind === 'layer');
    const hp = tops.reduce((a, b) => (b.y < a.y ? b : a), tops[0]);
    const fx = Math.round(hp.x1 + (hp.x2 - hp.x1) * 0.75);
    from = { x: fx, y: hp.y };
    x1 = Math.max(40, Math.min(B.W - 40 - RW, fx - RW / 2));
  }
  const room = B.addPlat(x1, x1 + RW, y, { id: 'secret', kind: 'secret' });
  B.walls.push({ x: room.x1, top: y - 120, bottom: y }, { x: room.x2, top: y - 120, bottom: y });
  B.portals.push({ name: 'secret', type: 'hidden', x: from.x, y: from.y, toPortal: 'room' });
  B.portals.push({ name: 'room', type: 'visible', x: room.x1 + 40, y, toPortal: 'secret' });
  B.reserved.push(from.x);
  return room;
}

// ---------------- 型ごとの地形
function shapeTerrain(B, rng, tpl, spec, ctx) {
  const L = spec.layers;
  const rope = spec.rope;
  switch (tpl) {
    case 'town': {
      hillyGround(B, rng, { count: rng.int(0, 1), maxH: 24, avoid: [[0, 300], [B.W - 300, B.W]] });
      for (let i = 0; i < 3; i++) addStepStone(B, rng, { wMin: 200, wMax: 320 });
      addLayers(B, rng, { count: L ?? 1, pieces: [1, 2], cover: [0.25, 0.4], first: [128, 144] });
      addRopes(B, rng, rope || 'ladder', { max: 1 });
      break;
    }
    case 'townTall': {
      flatGround(B);
      const layers = addLayers(B, rng, { count: L ?? 2, pieces: [2, 2], cover: [0.6, 0.85], first: [128, 144], gap: [112, 136] });
      for (const lay of layers) for (const p of lay) if (rng.chance(0.3)) addStair(B, rng, p, rng.chance(0.5) ? -1 : 1);
      for (let i = 0; i < 2; i++) addStepStone(B, rng, { wMin: 160, wMax: 240 });
      addRopes(B, rng, rope || 'mixed');
      break;
    }
    case 'townHill': {
      terracedGround(B, rng, { steps: 3, avoid: [[0, 300], [B.W - 300, B.W]] });
      addLayers(B, rng, { count: L ?? 1, pieces: [2, 2], cover: [0.3, 0.5], first: [128, 144] });
      addRopes(B, rng, rope || 'ladder');
      break;
    }
    case 'field': {
      const hills = hillyGround(B, rng, { count: rng.int(1, 3), maxH: 48, avoid: [[0, 240], [B.W - 240, B.W]] });
      void hills;
      const layers = addLayers(B, rng, { count: L ?? 2, pieces: [2, 3], first: [128, 152] });
      if (layers[0]?.length) addStair(B, rng, rng.pick(layers[0]), rng.chance(0.5) ? -1 : 1);
      for (let i = 0; i < rng.int(2, 4); i++) addStepStone(B, rng);
      addRopes(B, rng, rope || 'rope');
      break;
    }
    case 'forest': {
      hillyGround(B, rng, { count: rng.int(1, 2), maxH: 24, avoid: [[0, 240], [B.W - 240, B.W]] });
      const layers = addLayers(B, rng, { count: L ?? 2, pieces: [2, 3], first: [128, 152], cover: [0.45, 0.75] });
      for (const lay of layers) for (const p of lay) if (rng.chance(0.45)) addStair(B, rng, p, rng.chance(0.5) ? -1 : 1);
      for (let i = 0; i < rng.int(4, 7); i++) addStepStone(B, rng);
      addRopes(B, rng, rope || 'rope');
      break;
    }
    case 'cliff': {
      terracedGround(B, rng, { steps: rng.int(2, 3), avoid: [[0, 240], [B.W - 240, B.W]] });
      const layers = addLayers(B, rng, { count: L ?? 2, pieces: [2, 3], first: [128, 152] });
      if (layers[0]?.length) addStair(B, rng, rng.pick(layers[0]), rng.chance(0.5) ? -1 : 1);
      for (let i = 0; i < rng.int(1, 3); i++) addStepStone(B, rng);
      addRopes(B, rng, rope || 'rope');
      break;
    }
    case 'swamp': {
      flatGround(B);
      for (let i = 0; i < rng.int(6, 10); i++) addStepStone(B, rng, { wMin: 160, wMax: 320, maxBelow: 64 });
      addLayers(B, rng, { count: L ?? 1, pieces: [2, 3], first: [136, 160], cover: [0.4, 0.7] });
      for (let i = 0; i < 2; i++) addStepStone(B, rng);
      addRopes(B, rng, rope || 'rope');
      break;
    }
    case 'cave': {
      flatGround(B);
      addLayers(B, rng, { count: L ?? 3, pieces: [1, 2], first: [120, 144], gap: [112, 136], cover: [0.7, 0.92] });
      for (let i = 0; i < rng.int(1, 3); i++) addStepStone(B, rng);
      addRopes(B, rng, rope || 'mixed');
      break;
    }
    case 'tower': {
      flatGround(B);
      addLayers(B, rng, { count: L ?? 5, tower: true, first: [112, 128], gap: [104, 128], xa: 60, xb: B.W - 60 });
      for (let i = 0; i < 2; i++) addStepStone(B, rng);
      addRopes(B, rng, rope || 'ladder', { max: 1 });
      break;
    }
    case 'ship': {
      const G = B.G;
      B.addGround([[0, G - 48], [160, G - 48], [224, G], [B.W - 320, G], [B.W - 256, G - 48], [B.W, G - 48]]);
      B.addPlat(B.W * 0.55, B.W * 0.72, G - 56, { kind: 'deco', id: 'cabin' });
      B.addPlat(B.W * 0.28 - 100, B.W * 0.28 + 100, G - 192, { layer: 1, id: 'nest1' });
      B.addPlat(B.W * 0.45 - 90, B.W * 0.45 + 90, G - 192, { layer: 1, id: 'nest2' });
      B.addPlat(B.W * 0.36 - 120, B.W * 0.36 + 120, G - 320, { layer: 2, id: 'yard' });
      addRopes(B, rng, 'rope', { max: 1 });
      break;
    }
    case 'arena': {
      flatGround(B);
      const y1 = B.G - rng.snap(rng.range(128, 144));
      B.addPlat(160, Math.min(640, B.W * 0.3), y1, { layer: 1 });
      B.addPlat(Math.max(B.W - 640, B.W * 0.7), B.W - 160, y1, { layer: 1 });
      if (rng.chance(0.6)) B.addPlat(B.W / 2 - 180, B.W / 2 + 180, y1 - rng.snap(rng.range(112, 128)), { layer: 2 });
      addRopes(B, rng, rope || 'rope', { max: 1 });
      break;
    }
    case 'room': {
      flatGround(B);
      if (rng.chance(0.5)) addStepStone(B, rng, { wMin: 160, wMax: 240 });
      else if (B.W >= 1200) addLayers(B, rng, { count: 1, pieces: [1, 1], cover: [0.3, 0.45], first: [128, 136] });
      addRopes(B, rng, rope || 'ladder', { max: 1 });
      break;
    }
    case 'rooms': {
      const RW = ctx.roomW;
      for (let i = 0; i < ctx.rooms; i++) {
        const a = i * RW, b = (i + 1) * RW;
        B.addGround([[a, B.G], [b, B.G]], `g${i}`);
        if (i < ctx.rooms - 1) B.walls.push({ x: b, top: B.G - 520, bottom: B.G });
      }
      for (let i = 0; i < ctx.rooms; i++) {
        const a = i * RW, b = (i + 1) * RW;
        addLayers(B, rng, { count: rng.int(1, 2), xa: a + 140, xb: b - 140, pieces: [1, 2], first: [128, 144], gap: [112, 128], minLen: 200 });
        addStepStone(B, rng, { xa: a + 140, xb: b - 140 });
      }
      addRopes(B, rng, 'rope', { max: 1 });
      break;
    }
    default: throw new Error('知らない地形の型 ' + tpl);
  }
}

// ---------------- ポータル・NPC・調べる物・湧く所
function onFoot(B, x, plat) { return plat ? plat.y : B.groundY(x); }

function freeX(B, xa, xb, want, minD = 64, avoidRopes = 48) {
  // want に一番近い、ほかの物から離れた x
  let best = null, bd = Infinity;
  for (let x = Math.ceil(xa / 8) * 8; x <= xb; x += 8) {
    if (B.isReserved(x, minD) || B.ropeNear(x, avoidRopes)) continue;
    const d = Math.abs(x - want);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

function layerPlats(B) { return B.plats.filter((p) => p.kind === 'layer'); }
function topPlat(B) { const l = layerPlats(B); return l.length ? l.reduce((a, b) => (b.y < a.y ? b : a)) : null; }

function placePortals(B, rng, tpl, links, ctx, spec) {
  const slots = [];
  const add = (name, x, plat, extra = {}) => {
    const y = onFoot(B, x, plat);
    B.portals.push({ name, type: 'visible', x, y, ...extra });
    B.reserved.push(x);
  };
  if (tpl === 'rooms') {
    const RW = ctx.roomW;
    links.forEach((to, i) => add(`to_${to}`, 60 + i * 80, null, { to, toPortal: `to_${ctx.id}` }));
    for (let i = 0; i < ctx.rooms; i++) {
      if (i < ctx.rooms - 1) add(`r${i}_out`, (i + 1) * RW - 70, null, { toPortal: `r${i + 1}_in` });
      if (i > 0) add(`r${i}_in`, i * RW + 70, null, { toPortal: `r${i - 1}_out` });
    }
    return;
  }
  const order = tpl === 'tower'
    ? (spec.down ? ['top', 'left', 'right', 'upper', 'mid'] : ['left', 'top', 'right', 'upper', 'mid'])
    : ['left', 'right', tpl.startsWith('town') && tpl !== 'townTall' ? 'mid' : 'top', 'mid', 'upper', 'mid', 'mid', 'upper'];
  for (let i = 0; i < links.length; i++) slots.push(order[Math.min(i, order.length - 1)]);
  const used = new Set();
  links.forEach((to, i) => {
    let slot = slots[i];
    let x = null, plat = null;
    const tries = [slot, 'mid', 'upper', 'top'];
    for (const s of tries) {
      if (s === 'left') x = freeX(B, 40, 120, 60);
      else if (s === 'right') x = freeX(B, B.W - 120, B.W - 40, B.W - 60);
      else if (s === 'top' || s === 'upper') {
        const cand = s === 'top' ? [topPlat(B)].filter(Boolean) : layerPlats(B).filter((p) => !used.has(p.id));
        for (const p of cand.sort(() => 0)) {
          const px = freeX(B, p.x1 + 40, p.x2 - 40, (p.x1 + p.x2) / 2, 80);
          if (px != null) { x = px; plat = p; break; }
        }
      } else {
        const k = links.length + 1;
        x = freeX(B, 300, B.W - 300, 300 + ((B.W - 600) * (i + 0.5)) / k + rng.range(-40, 40), 120);
      }
      if (x != null) break;
      plat = null;
    }
    if (x == null) throw new Error(`${ctx.id}: ポータル ${to} の置き場が無い`);
    if (plat) used.add(plat.id);
    add(`to_${to}`, x, plat, { to, toPortal: `to_${ctx.id}` });
  });
}

function placeNpcs(B, rng, npcs, isTown) {
  if (!npcs.length) return;
  const tiers = new Map();
  for (const n of npcs) { const t = n[3]?.tier || 0; if (!tiers.has(t)) tiers.set(t, []); tiers.get(t).push(n); }
  for (const [tier, list] of [...tiers].sort((a, b) => a[0] - b[0])) {
    let surfaces;
    if (tier > 0) {
      surfaces = layerPlats(B).filter((p) => p.layer === tier && p.x2 - p.x1 >= 240);
      if (!surfaces.length) surfaces = layerPlats(B).filter((p) => p.x2 - p.x1 >= 240);
    }
    if (!surfaces || !surfaces.length) surfaces = [null];
    // 足場の長さに合わせて割り振る
    const total = surfaces.reduce((s, p) => s + (p ? p.x2 - p.x1 : B.W - 400), 0);
    let idx = 0;
    for (const p of surfaces) {
      const len = p ? p.x2 - p.x1 : B.W - 400;
      const cnt = p === surfaces[surfaces.length - 1] ? list.length - idx : Math.round((list.length * len) / total);
      const a = p ? p.x1 + 48 : isTown ? 200 : 260;
      const b = p ? p.x2 - 48 : isTown ? B.W - 200 : Math.min(B.W - 260, 260 + cnt * 140);
      for (let j = 0; j < cnt && idx < list.length; j++, idx++) {
        const want = a + ((b - a) * (j + 0.5)) / Math.max(1, cnt);
        let x = freeX(B, a, b, want, 72, 40);
        let plat = p;
        if (x == null) { x = freeX(B, 200, B.W - 200, want, 64, 40); plat = null; }
        if (x == null) throw new Error('NPC の置き場が無い ' + list[idx][0]);
        const [id, name, , extra = {}] = list[idx];
        const { tier: _t, x: _x, ...rest } = extra;
        B.npcs.push({ id, name, x, y: onFoot(B, x, plat), ...rest });
        B.reserved.push(x);
      }
    }
  }
}

function placeObjects(B, rng, objects, secretRoom) {
  let si = 0;
  for (const o of objects || []) {
    let x, y;
    if (o.at === 'secret') {
      x = secretRoom.x1 + 110 + 60 * si++; y = secretRoom.y;
    } else if (o.at === 'top' || o.at === 'mid') {
      const tp = o.at === 'top' ? topPlat(B) : (layerPlats(B).filter((p) => p.layer === 1)[0] || topPlat(B));
      x = freeX(B, tp.x1 + 40, tp.x2 - 40, (tp.x1 + tp.x2) / 2, 48, 32);
      y = tp.y;
    } else {
      const want = o.at === 'ground-left' ? 260 : B.W - 260;
      x = freeX(B, 160, B.W - 160, want, 48, 32);
      y = B.groundY(x);
    }
    if (x == null) throw new Error('調べる物の置き場が無い ' + o.id);
    B.objects.push({ id: o.id, name: o.name, x, y });
    B.reserved.push(x);
  }
}

const BIG = new Set(['elite', 'boss', 'raid']);
function intervalOf(note, kind) {
  let m = /(\d+)\s*分ごと/.exec(note); if (m) return +m[1] * 60;
  m = /(\d+)\s*時間ごと/.exec(note); if (m) return +m[1] * 3600;
  if (/1 日 2 回/.test(note)) return 43200;
  if (/1 日 1 回/.test(note)) return 86400;
  if (/週 1 回/.test(note)) return 604800;
  return kind === 'raid' ? 43200 : kind === 'boss' ? 3600 : 900;
}

function placeSpawns(B, rng, mobs, monsters, note, tpl, ctx, spec) {
  const normal = mobs.filter((m) => !BIG.has(monsters[m]?.kind));
  const big = mobs.filter((m) => BIG.has(monsters[m]?.kind));
  const spawns = [], timed = [];
  // 強敵・ボス: 広い所の真ん中
  for (const m of big) {
    let x, y;
    if (tpl === 'rooms') { x = (ctx.rooms - 0.5) * ctx.roomW; }
    else x = B.W / 2;
    x = freeX(B, 200, B.W - 200, x, 80, 40);
    y = B.groundY(x);
    timed.push({ mob: m, x, y, intervalSec: intervalOf(note, monsters[m].kind) });
  }
  if (!normal.length) return { spawns, timed, mobMax: 0 };
  let mobMax = spec.mobMax ?? (tpl === 'arena' ? 6 : tpl === 'rooms' ? ctx.rooms * 4 : tpl === 'room' ? 8 : Math.max(10, Math.min(22, Math.round(B.W / 150))));
  // 候補: 足場の上（隠し部屋を除く）
  const cands = [];
  const surf = [{ ground: true }, ...B.plats.filter((p) => p.kind !== 'secret' && p.x2 - p.x1 >= 120)];
  for (const s of surf) {
    if (s.ground) {
      for (let x = 100; x <= B.W - 100; x += 8) if (B.groundY(x) != null) cands.push({ x, y: B.groundY(x) });
    } else for (let x = s.x1 + 32; x <= s.x2 - 32; x += 8) cands.push({ x, y: s.y });
  }
  const ok = cands.filter((c) => !B.portals.some((p) => Math.abs(p.x - c.x) < 90 && Math.abs(p.y - c.y) < 60)
    && !B.npcs.some((n) => Math.abs(n.x - c.x) < 60 && Math.abs(n.y - c.y) < 60)
    && !B.ropes.some((r) => Math.abs(r.x - c.x) < 24));
  // 混ぜて、近すぎない所を選ぶ
  for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [ok[i], ok[j]] = [ok[j], ok[i]]; }
  const picked = [];
  for (const c of ok) {
    if (picked.length >= mobMax) break;
    if (picked.some((p) => Math.abs(p.x - c.x) < 110 && Math.abs(p.y - c.y) < 40)) continue;
    picked.push(c);
  }
  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  // 敵の割り振り: まず全種類 1 つずつ、あとは 3:2:1
  const weights = normal.map((_, i) => (i === 0 ? 3 : i === 1 ? 2 : 1));
  const tot = weights.reduce((a, b) => a + b, 0);
  picked.forEach((c, i) => {
    let mob;
    if (i < normal.length) mob = normal[i];
    else { let r = rng.next() * tot; mob = normal[0]; for (let k = 0; k < normal.length; k++) { r -= weights[k]; if (r < 0) { mob = normal[k]; break; } } }
    spawns.push({ mob, x: c.x, y: c.y });
  });
  // 1 体も湧かない種類が出ないように
  for (const m of normal) if (!spawns.some((s) => s.mob === m) && spawns.length) spawns[spawns.length - 1].mob = m;
  return { spawns, timed, mobMax: Math.min(mobMax, spawns.length) };
}

// ---------------- 1 枚作る
const W_DEF = { town: [2600, 3000], townTall: [2600, 3000], townHill: [2800, 3200], field: [2600, 3400], forest: [2400, 3200], cliff: [2400, 3200], swamp: [2400, 3200], cave: [2200, 3000], tower: [1200, 1400], ship: [1800, 2000], arena: [1800, 2000], room: [1000, 1400] };

export function generateMap(raw, ctx) {
  const [id, name, type, lv, links, mobs, note] = raw;
  const spec0 = SPECS[id] || {};
  const reg = regionDefaults(id);
  let tpl = spec0.tpl || (type === '狩' && reg.tplField) || TYPE_TPL[type];
  if (type === '特' && /部屋|迷路/.test(note) && !spec0.tpl) tpl = 'rooms';
  const spec = { ...spec0, down: /^(C10[7-9]|C11[01]|T11[2-5])$/.test(id) };
  if (spec.tpl === 'townTall' && spec.hunting) tpl = 'townTall';
  const bg = spec.bg || reg.bg;
  const bgm = spec.bgm || (type === '町' ? reg.bgm : type === 'ボ' ? 'boss_mid' : reg.bgm);
  let lastErr = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = makeRng(hashStr(`${id}#${attempt}`));
    const roomsN = spec.rooms || (/(\d+)\s*部屋/.exec(note) || [])[1] * 1 || 6;
    const roomW = 1000;
    let W = tpl === 'rooms' ? roomsN * roomW : rng.snap(rng.range(...(spec.w || W_DEF[tpl])), 40);
    // 町の NPC が多い時は広げる
    const npcs = ctx.npcs.filter((n) => n[2] === id);
    if (tpl.startsWith('town')) W = Math.max(W, 600 + (npcs.length + links.length) * 150);
    const B = new Builder(W, 4000);
    const lctx = { id, rooms: roomsN, roomW };
    try {
      shapeTerrain(B, rng, tpl, spec, lctx);
      const secretRoom = spec.secret ? addSecret(B, rng, spec.secret) : null;
      placePortals(B, rng, tpl, links, lctx, spec);
      // 出現の位置・町の位置
      const spx = tpl === 'rooms' ? 140 : freeX(B, 100, B.W - 100, tpl.startsWith('town') ? B.W / 2 : 140, 40, 24);
      B.portals.unshift({ name: 'sp', type: 'spawn', x: spx, y: B.groundY(spx) });
      if (type === '町') { const tx = freeX(B, 100, B.W - 100, B.W / 2 + 40, 24, 24); B.portals.splice(1, 0, { name: 'town', type: 'town', x: tx, y: B.groundY(tx) }); }
      placeNpcs(B, rng, npcs, type === '町');
      placeObjects(B, rng, spec.objects, secretRoom);
      const sp = placeSpawns(B, rng, mobs, ctx.monsters, note, tpl, lctx, spec);
      // 上の空きをそろえて、y をずらす（一番上の足場・壁が TOP_MARGIN の所へ）
      let top = B.minY();
      for (const w of B.walls) top = Math.min(top, w.top);
      const shift = TOP_MARGIN - top;
      const sy = (y) => Math.round(y + shift);
      const map = {
        id, name, region: id[0], type, lv: lv || undefined, width: B.W, height: sy(B.G) + BOTTOM_MARGIN,
        bgm, bg, theme: tpl, returnMap: ctx.returnMap,
        footholds: B.footholds().map((f) => ({ ...f, points: f.points.map(([x, y]) => [x, sy(y)]) })),
        ropes: B.ropes.map((r) => ({ x: r.x, top: sy(r.top), bottom: sy(r.bottom), ladder: !!r.ladder })),
        walls: B.walls.map((w) => ({ x: w.x, top: sy(w.top), bottom: sy(w.bottom) })),
        portals: B.portals.map((p) => ({ ...p, y: sy(p.y) })),
        spawns: sp.spawns.map((s) => ({ ...s, y: sy(s.y) })), mobMax: sp.mobMax, respawnSec: 7,
        timedSpawns: sp.timed.map((s) => ({ ...s, y: sy(s.y) })),
        npcs: B.npcs.map((n) => ({ ...n, y: sy(n.y) })),
        objects: B.objects.map((o) => ({ ...o, y: sy(o.y) })),
        note, seed: `${id}#${attempt}`,
      };
      const problems = checkMap(map, { mobs });
      if (!problems.length) return { map, attempts: attempt + 1 };
      lastErr = problems.join(' / ');
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(`${id}: 60 回作り直しても検査を通らない: ${lastErr}`);
}
