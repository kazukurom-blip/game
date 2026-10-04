// v2 追加ウィンドウ: ワールドマップ(M) / モンスター図鑑(B) / スマホ NeonGram(P)
import {
  COL, txt, inset, panel, rrPath, wrap, fmtMoney, rgba, clamp, measure, STAT_LABELS, font, starPath, lighten,
  getClock, clockStr, clockPhase, drawPhaseIcon, rainbowGrad,
} from './theme.js';
import {
  guard, getItemDef, rarityInfo, drawChar, drawItemIco, heroLook, equipLooks, HERO_NAMES, allMaps, allEnemies,
  mapInfo, worldGraph, visitedSet, regionColor, REGIONS, REGION_BY_ID, taxiFareOf, doTaxi, OPT, bookList, bookKills,
  bookRankOf, bookBonusOf, itemKnown, drawEnemyArt, snsTitleOf, taxiCheck,
} from './deps.js';
import { charLook, charName } from './v3deps.js';
import { audio } from '../audio/audio.js';

const W = 1280, H = 720;

// ============================================================
// ワールドマップ
// ============================================================
// 仮想座標 1000×560（左=西, 上=北）。SPEC_V2 のマップIDに合わせた地理配置。
const LAYOUT = {
  // beach（南西）
  beach: [150, 445], beach_f3: [58, 515], beach_f1: [215, 522], beach_f2: [305, 478], beach_f4: [365, 398],
  // downtown（中央）
  downtown: [445, 318], down_f1: [478, 428], down_f2: [548, 505], down_f3: [552, 318], down_f4: [372, 238],
  // slums（東）
  slums_f1: [640, 382], slums: [728, 428], slums_f2: [712, 515], slums_f3: [812, 530], slums_f4: [812, 362],
  // spaceport（東端）
  space_f1: [880, 420], space_f2: [940, 332], spaceport: [930, 232], space_f3: [968, 142], space_f4: [968, 48],
  // swamp（北西）
  swamp_f1: [282, 262], swamp: [168, 218], swamp_f2: [78, 292], swamp_f3: [52, 178], swamp_f4: [212, 120],
  // casino（北）
  casino_f1: [318, 72], casino: [440, 105], casino_f2: [470, 212], casino_f3: [565, 205], casino_f4: [560, 85],
  // tower（北東）
  tower_f1: [655, 118], rooftop: [748, 168], tower_f2: [752, 62], tower_f3: [848, 52],
};

// 地域名ウォーターマーク: 各地域のノード群の重心から近い順に探し、ノード（名前・Lv 表記込み）と
// 他の地域名に重ならない最初の位置に置く（決定論的。レイアウトと表示領域が同じならキャッシュ）
let labelCache = { key: '', pos: null };
function placeRegionLabels(ctx, ids, P, area, cur) {
  const key = ids.length + '|' + area.x + ',' + area.y + ',' + area.w + ',' + area.h + '|' + cur + '|' + layoutCache.key;
  if (labelCache.key === key) return labelCache.pos;
  // 障害物: ノード＋名前＋Lv 表記、現在地マーカー（YOU）、コンパス、左上の州名
  const obst = ids.map((id) => {
    const p = P(id), town = !!mapInfo(id).town;
    const nw = Math.max(70, String(mapInfo(id).name || '').length * (town ? 14 : 11.5) + 10);
    return town ? { x: p.x - nw / 2, y: p.y - 24, w: nw, h: 80 } : { x: p.x - nw / 2, y: p.y - 13, w: nw, h: 50 };
  });
  if (cur && ids.includes(cur)) { const p = P(cur); obst.push({ x: p.x - 24, y: p.y - 72, w: 70, h: 50 }); }
  obst.push({ x: area.x + area.w - 80, y: area.y + 10, w: 66, h: 70 });
  obst.push({ x: area.x + 10, y: area.y + 6, w: 190, h: 26 });
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const out = {};
  const placed = [];
  ctx.save();
  const find = (cx, cy, name, size, maxR) => {
    ctx.font = font(size, 900);
    const lw = ctx.measureText(name).width + 8, lh = size + 4;
    for (let r = 0; r <= maxR; r += 8) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r / 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.PI / 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
        const box = { x: x - lw / 2, y: y - lh / 2, w: lw, h: lh };
        if (box.x < area.x + 6 || box.x + box.w > area.x + area.w - 6 || box.y < area.y + 6 || box.y + box.h > area.y + area.h - 6) continue;
        if (obst.some((o) => hit(o, box)) || placed.some((o) => hit(o, box))) continue;
        return { x, y, box, size };
      }
    }
    return null;
  };
  for (const R of REGIONS) {
    if (R.noMap) continue;
    const members = ids.filter((i) => mapInfo(i).region === R.id);
    if (!members.length) continue;
    let cx = 0, cy = 0;
    for (const m of members) { const p = P(m); cx += p.x; cy += p.y; }
    cx /= members.length; cy /= members.length;
    // 重心の近く（〜130px）で 28px → 22px → 18px の順に探し、無ければ遠くまで
    const best = find(cx, cy, R.name, 28, 130) || find(cx, cy, R.name, 22, 130) || find(cx, cy, R.name, 18, 150)
      || find(cx, cy, R.name, 22, 320) || { x: cx, y: cy, size: 22, box: { x: cx, y: cy, w: 0, h: 0 } };
    placed.push(best.box);
    out[R.id] = { x: best.x, y: best.y, size: best.size };
  }
  ctx.restore();
  labelCache = { key, pos: out };
  return out;
}

let layoutCache = { key: '', pos: null };
function computeLayout(adj) {
  const ids = Object.keys(adj).sort();
  const key = ids.join(',') + '|' + ids.map((i) => adj[i].size).join('');
  if (layoutCache.key === key) return layoutCache.pos;
  const pos = {};
  for (const id of ids) if (LAYOUT[id]) pos[id] = { x: LAYOUT[id][0], y: LAYOUT[id][1] };
  // 未知のIDは配置済みの隣接ノード周りに置く
  let guardN = 0, pending = ids.filter((i) => !pos[i]);
  while (pending.length && guardN++ < 20) {
    const still = [];
    for (const id of pending) {
      const nb = [...adj[id]].find((n) => pos[n]);
      if (!nb) { still.push(id); continue; }
      const k = Object.keys(pos).length;
      let a = k * 2.399, placed = null;
      for (let tries = 0; tries < 16 && !placed; tries++, a += 0.7) {
        const c = { x: clamp(pos[nb].x + Math.cos(a) * 85, 30, 970), y: clamp(pos[nb].y + Math.sin(a) * 70, 30, 530) };
        if (Object.values(pos).every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 55)) placed = c;
      }
      pos[id] = placed || { x: clamp(pos[nb].x + 60, 30, 970), y: clamp(pos[nb].y + 40, 30, 530) };
    }
    pending = still;
  }
  pending.forEach((id, i) => { pos[id] = { x: 60 + (i % 12) * 80, y: 545 }; });
  layoutCache = { key, pos };
  return pos;
}

function mapEnemies(id) {
  const mi = mapInfo(id);
  if (Array.isArray(mi.enemies) && mi.enemies.length) return mi.enemies.map((e) => (typeof e === 'string' ? e : e?.id)).filter(Boolean);
  const out = [];
  for (const d of Object.values(allEnemies())) {
    if (!d || d.civilian || d.isCop) continue;
    if ((d.habitats || []).includes(id)) out.push(d.id);
  }
  if (!out.length) {
    for (const s of allMaps()[id]?.spawns || []) for (const t of s.types || []) if (!out.includes(t)) out.push(t);
  }
  return out;
}

function drawTownGlyph(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - s * 0.55, y - s * 0.1, s * 0.3, s * 0.55);
  ctx.fillRect(x - s * 0.18, y - s * 0.5, s * 0.36, s * 0.95);
  ctx.fillRect(x + s * 0.25, y - s * 0.25, s * 0.3, s * 0.7);
  ctx.fillStyle = 'rgba(30,20,70,0.85)';
  for (let i = 0; i < 3; i++) ctx.fillRect(x - s * 0.08, y - s * 0.38 + i * s * 0.25, s * 0.16, s * 0.1);
  ctx.restore();
}

export function drawWorldMap(ui, ctx, win) {
  // 画面中央に固定
  win.x = Math.round((W - win.w) / 2); win.y = Math.round((H - win.h) / 2);
  const g = ui.game, st = g.state || {};
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  const adj = worldGraph();
  const pos = computeLayout(adj);
  const visited = visitedSet(g);
  const cur = st.mapId || g.map?.id;
  const ids = Object.keys(adj);
  const state = {};
  for (const id of ids) {
    if (visited.has(id)) state[id] = 'seen';
    else if ([...adj[id]].some((n) => visited.has(n))) state[id] = 'near';
    else state[id] = 'hidden';
  }
  // v3: クエスト目的地のフォーカス（点滅・ルート強調。未訪問でも名前を出す）
  const F = win.data?.focus || null;
  const fset = new Set((F?.maps || []).filter((id) => pos[id]));
  const route = (F?.route || []).filter((id) => pos[id]);
  const rset = new Set(route);
  for (const id of [...fset, ...route]) if (state[id] === 'hidden') state[id] = 'near';
  // マップ領域
  const ax = x + 16, ay = y + 44, aw = w - 32, ah = h - 44 - 62;
  const pad = 46;
  const sx = (aw - pad * 2) / 1000, sy = (ah - pad * 2) / 560;
  const P = (id) => ({ x: ax + pad + pos[id].x * sx, y: ay + pad + pos[id].y * sy });
  ctx.save();
  rrPath(ctx, ax, ay, aw, ah, 12);
  const sea = ctx.createLinearGradient(0, ay, 0, ay + ah);
  sea.addColorStop(0, '#0d0a33'); sea.addColorStop(0.6, '#13164a'); sea.addColorStop(1, '#0a2a4a');
  ctx.fillStyle = sea; ctx.fill();
  ctx.clip();
  // グリッド
  ctx.strokeStyle = 'rgba(120,150,255,0.07)'; ctx.lineWidth = 1;
  for (let gx = ax; gx < ax + aw; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, ay); ctx.lineTo(gx, ay + ah); ctx.stroke(); }
  for (let gy = ay; gy < ay + ah; gy += 40) { ctx.beginPath(); ctx.moveTo(ax, gy); ctx.lineTo(ax + aw, gy); ctx.stroke(); }
  // 陸地（霧）: 地域色のぼかし円
  for (const id of ids) {
    const p = P(id), s = state[id];
    const col = s === 'hidden' ? '#3a3560' : regionColor(mapInfo(id).region);
    const r = mapInfo(id).town ? 95 : 72;
    const rg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r);
    rg.addColorStop(0, rgba(col, s === 'seen' ? 0.30 : s === 'near' ? 0.16 : 0.10));
    rg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 地域名
  const labelPos = placeRegionLabels(ctx, ids, P, { x: ax, y: ay, w: aw, h: ah }, cur);
  for (const R of REGIONS) {
    if (R.noMap) continue;
    const members = ids.filter((i) => mapInfo(i).region === R.id);
    if (!members.length || !labelPos[R.id]) continue;
    const known = members.some((i) => state[i] === 'seen');
    const any = members.some((i) => state[i] !== 'hidden');
    if (!any) continue;
    const { x: cx, y: cy, size: lsz } = labelPos[R.id];
    txt(ctx, known ? R.name : '???', cx, cy, { size: lsz || 28, align: 'center', color: rgba(R.color, 0.2), stroke: false, weight: 900 });
  }
  // 接続線
  const drawn = new Set();
  for (const a of ids) for (const b of adj[a]) {
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (drawn.has(k) || !pos[b]) continue;
    drawn.add(k);
    const sa = state[a], sb = state[b];
    if (sa === 'hidden' || sb === 'hidden') continue;
    if (sa === 'near' && sb === 'near') continue;
    const pa = P(a), pb = P(b);
    ctx.save();
    if (sa === 'seen' && sb === 'seen') {
      const lg = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      lg.addColorStop(0, regionColor(mapInfo(a).region)); lg.addColorStop(1, regionColor(mapInfo(b).region));
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.strokeStyle = lg; ctx.lineWidth = 3.5; ctx.shadowColor = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([2, 14]); ctx.lineDashOffset = -t * 24; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.restore();
  }
  // v3: ルート強調
  if (route.length > 1) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    route.forEach((id, i) => { const p = P(id); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,212,71,0.95)'; ctx.lineWidth = 6; ctx.shadowColor = '#ffd447'; ctx.shadowBlur = 16; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([4, 16]); ctx.lineDashOffset = -t * 40; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.restore();
    // 矢印（各区間の中点）
    for (let i = 1; i < route.length; i++) {
      const a = P(route[i - 1]), b = P(route[i]);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
      ctx.fillStyle = '#ffd447'; ctx.strokeStyle = '#3a2000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  // ノード
  let hovId = null;
  const confirmOpen = !!win.confirm;
  const order = ids.slice().sort((a, b) => (state[a] === 'hidden') - (state[b] === 'hidden'));
  for (const id of order) {
    const p = P(id), s = state[id], mi = mapInfo(id);
    const col = regionColor(mi.region);
    if (s === 'hidden') {
      ctx.fillStyle = 'rgba(200,190,255,0.16)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    const town = s === 'seen' && mi.town;
    const r = town ? 21 : s === 'seen' ? 10 : 11;
    const hr = { x: p.x - Math.max(r, 16), y: p.y - Math.max(r, 16), w: Math.max(r, 16) * 2, h: Math.max(r, 16) * 2 };
    const hov = !confirmOpen && ui.hover(win, hr);
    if (hov) hovId = id;
    ctx.save();
    const focused = fset.has(id);
    if (focused || rset.has(id)) {
      const blink = 0.5 + 0.5 * Math.sin(t * 7);
      ctx.save();
      ctx.lineWidth = focused ? 4 : 2; ctx.strokeStyle = focused ? `rgba(255,95,162,${0.4 + blink * 0.6})` : 'rgba(255,212,71,0.6)';
      ctx.shadowColor = focused ? '#ff5fa2' : '#ffd447'; ctx.shadowBlur = focused ? 22 : 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + (focused ? 10 + blink * 8 : 5), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (s === 'near' && focused) {
      ctx.fillStyle = 'rgba(80,20,60,0.95)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff5fa2'; ctx.stroke();
      ctx.restore();
      txt(ctx, '!', p.x, p.y + 1, { size: 14, align: 'center', color: '#fff', sw: 2 });
      txt(ctx, mi.name, p.x, p.y + r + 12, { size: 12, align: 'center', color: '#ffd6e8', sw: 3 });
      const lr0 = mi.levelRange;
      if (lr0) txt(ctx, `Lv${lr0[0]}-${lr0[1]}`, p.x, p.y + r + 26, { size: 10, align: 'center', color: COL.pink, sw: 2.5 });
    } else if (s === 'near') {
      ctx.fillStyle = 'rgba(20,16,50,0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.55)'; ctx.stroke();
      ctx.restore();
      txt(ctx, '?', p.x, p.y + 1, { size: 12, align: 'center', color: '#cfc8ff', sw: 2 });
      txt(ctx, '???', p.x, p.y + r + 11, { size: 11, align: 'center', color: 'rgba(220,210,255,0.6)', sw: 2.5 });
    } else {
      if (town) {
        ctx.shadowColor = col; ctx.shadowBlur = hov ? 26 : 14;
        const gg = ctx.createRadialGradient(p.x - 6, p.y - 8, 2, p.x, p.y, r);
        gg.addColorStop(0, lighten(col, 0.6)); gg.addColorStop(1, col);
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba('#1a1440', 0.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, r - 4, 0, Math.PI * 2); ctx.stroke();
        drawTownGlyph(ctx, p.x, p.y + 1, 18);
        if (hov && id !== cur) {
          ctx.lineWidth = 2; ctx.strokeStyle = COL.gold; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 20;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.stroke();
        }
      } else {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.8)'; ctx.stroke();
        if (mi.deadEnd || mi.boss) { ctx.fillStyle = '#1a1440'; starPath(ctx, p.x, p.y, 5.5, 2.4); ctx.fill(); }
      }
      ctx.restore();
      const ny = p.y + r + (town ? 13 : 11);
      txt(ctx, mi.name, p.x, ny, { size: town ? 14 : 11.5, align: 'center', color: town ? '#fff' : '#efeaff', sw: 3, weight: town ? 900 : 800 });
      const lr = mi.levelRange;
      if (lr) txt(ctx, town ? `TOWN · Lv${lr[0]}-${lr[1]}` : `Lv${lr[0]}-${lr[1]}`, p.x, ny + (town ? 15 : 13), { size: 10, align: 'center', color: town ? COL.gold : rgba(col, 1), sw: 2.5 });
      else if (town) txt(ctx, 'TOWN', p.x, ny + 15, { size: 10, align: 'center', color: COL.gold, sw: 2.5 });
    }
    // 現在地
    if (id === cur) {
      const blink = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,230,80,${0.4 + blink * 0.6})`;
      ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 6 + blink * 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      const bob = Math.sin(t * 4) * 3;
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y - r - 26 + bob, 19, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe14d'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - r - 10 + bob); ctx.lineTo(p.x + 7, p.y - r - 10 + bob); ctx.lineTo(p.x, p.y - r - 1 + bob); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y - r - 26 + bob, 17, 0, Math.PI * 2); ctx.clip();
      drawChar(ctx, p.x, p.y - r - 26 + bob + 34, charLook(st), equipLooks(st), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 0.62 });
      ctx.restore();
      txt(ctx, 'YOU', p.x + 24, p.y - r - 40 + bob, { size: 10, color: '#ffe14d', sw: 3 });
    }
    if (focused) {
      const bob2 = Math.sin(t * 5) * 4;
      ctx.save();
      ctx.translate(p.x, p.y - r - (id === cur ? 62 : 20) + bob2);
      ctx.fillStyle = '#ff5fa2'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -14); ctx.lineTo(9, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (!confirmOpen) {
      ui.hit(win, 'node:' + id, hr, {
        onClick: () => {
          if (s !== 'seen') { ui.notify('まだ訪れていないエリアです', COL.dim); return; }
          if (id === cur) { ui.notify('ここが現在地です', COL.gold); return; }
          if (!mi.town) { ui.notify('タクシーは訪問済みの「町」にだけ行けます', COL.bad); return; }
          if (g.player?.inVehicle) { /* 乗車中でもOK */ }
          win.confirm = { id, t: 0 };
        },
      });
    }
  }
  // コンパス
  const cx0 = ax + aw - 48, cy0 = ay + 50;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx0, cy0, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COL.pink;
  ctx.beginPath(); ctx.moveTo(cx0, cy0 - 20); ctx.lineTo(cx0 + 6, cy0); ctx.lineTo(cx0 - 6, cy0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.moveTo(cx0, cy0 + 20); ctx.lineTo(cx0 + 6, cy0); ctx.lineTo(cx0 - 6, cy0); ctx.closePath(); ctx.fill();
  ctx.restore();
  txt(ctx, 'N', cx0, cy0 - 32, { size: 12, align: 'center', color: '#fff', sw: 2.5 });
  txt(ctx, 'NEORIDA STATE · VICE BAY', ax + 18, ay + 18, { size: 12, color: 'rgba(255,255,255,0.4)', stroke: false });
  ctx.restore(); // clip
  ctx.save(); rrPath(ctx, ax, ay, aw, ah, 12); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(190,170,255,0.45)'; ctx.stroke(); ctx.restore();

  // 凡例・情報バー
  const ly = y + h - 52;
  inset(ctx, ax, ly, aw, 38, { r: 10 });
  let lx = ax + 16;
  const lc = ly + 19;
  ctx.save();
  ctx.fillStyle = COL.pink; ctx.beginPath(); ctx.arc(lx + 8, lc, 8, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
  txt(ctx, '町（タクシー可）', lx + 22, lc, { size: 12, color: COL.sub, sw: 2.5 }); lx += 130;
  ctx.save(); ctx.fillStyle = COL.teal; ctx.beginPath(); ctx.arc(lx + 6, lc, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  txt(ctx, 'フィールド', lx + 16, lc, { size: 12, color: COL.sub, sw: 2.5 }); lx += 92;
  txt(ctx, '???', lx, lc, { size: 12, color: '#cfc8ff', sw: 2.5 });
  txt(ctx, '未踏（隣接）', lx + 28, lc, { size: 12, color: COL.sub, sw: 2.5 }); lx += 116;
  ctx.save(); ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(lx + 6, lc, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  txt(ctx, '現在地', lx + 17, lc, { size: 12, color: COL.sub, sw: 2.5 }); lx += 72;
  const nSeen = ids.filter((i) => state[i] === 'seen').length;
  txt(ctx, `訪問 ${nSeen} / ${ids.length}`, lx + 10, lc, { size: 14, color: COL.gold });
  txt(ctx, `${fmtMoney(st.money || 0)}`, ax + aw - 16, lc, { size: 15, align: 'right', color: COL.money, stroke: COL.moneyShadow, sw: 4 });
  if (F) {
    const fr = { x: ax + aw - 560, y: ly + 5, w: 420, h: 28 };
    ctx.save(); rrPath(ctx, fr.x, fr.y, fr.w, fr.h, 14); ctx.fillStyle = 'rgba(255,95,162,0.3)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = COL.pink; ctx.stroke(); ctx.restore();
    const dn = F.dest ? mapInfo(F.dest).name : (F.maps || []).map((id) => mapInfo(id).name).join('・');
    txt(ctx, `⌖ ${F.name || 'クエスト'} → ${dn}${route.length > 1 ? `（${route.length - 1}マップ先）` : ''}`, fr.x + 12, fr.y + 14.5, { size: 12, color: '#fff', sw: 2.5, maxW: fr.w - 24 });
  } else txt(ctx, '町をクリックでタクシー移動  /  M・Esc で閉じる', ax + aw - 130, lc, { size: 11.5, align: 'right', color: COL.dim, sw: 2.5 });

  // ホバー詳細
  if (hovId && !confirmOpen) ui.setTip(nodeTip(g, hovId, state[hovId], cur));

  // タクシー確認
  if (win.confirm) drawTaxiConfirm(ui, ctx, win);
}

function nodeTip(g, id, s, cur) {
  const mi = mapInfo(id);
  const col = regionColor(mi.region);
  const L = [];
  if (s !== 'seen') {
    L.push({ t: '???', c: '#cfc8ff', size: 18 });
    L.push({ t: '未踏のエリア', c: COL.sub, size: 12.5 });
    L.push({ t: '隣接する訪問済みマップから行けそうだ…', c: COL.dim, size: 12, wrap: true });
    return { lines: L, border: '#8d88bd' };
  }
  L.push({ t: mi.name, c: col, size: 18 });
  L.push({ t: `${REGION_BY_ID[mi.region]?.name || mi.region}  ・  ${mi.town ? '町 (SAFE ZONE)' : 'フィールド'}`, c: COL.sub, size: 12 });
  if (mi.levelRange) L.push({ t: `推奨Lv ${mi.levelRange[0]} 〜 ${mi.levelRange[1]}`, c: '#fff', size: 13.5 });
  if (id === cur) L.push({ t: '★ 現在地', c: COL.gold, size: 13 });
  if (mi.town) {
    L.push({ sep: true });
    L.push({ t: 'モンスターは出現しない（市民・警察）', c: COL.good, size: 12 });
    if (id !== cur) {
      const fare = taxiFareOf(g, id);
      L.push({ t: `TAXI 料金 ${fmtMoney(fare)}`, c: (g.state?.money || 0) >= fare ? COL.money : COL.bad, size: 13.5 });
      L.push({ t: 'クリックでタクシー移動', c: COL.dim, size: 11.5 });
    }
  } else {
    const ens = mapEnemies(id);
    if (ens.length) {
      L.push({ sep: true });
      L.push({ t: '出現モンスター', c: COL.sub, size: 12 });
      const st = g.state;
      const names = ens.slice(0, 8).map((eid) => (bookKills(st, eid) > 0 ? (allEnemies()[eid]?.name || eid) : '???'));
      for (let i = 0; i < names.length; i += 2) L.push({ t: '・' + names.slice(i, i + 2).join('  ・'), c: '#fff', size: 12.5 });
      if (ens.length > 8) L.push({ t: `ほか ${ens.length - 8} 種`, c: COL.dim, size: 11.5 });
    }
  }
  return { lines: L, border: col };
}

function drawTaxiConfirm(ui, ctx, win) {
  const g = ui.game, st = g.state || {};
  const id = win.confirm.id, mi = mapInfo(id);
  const fare = taxiFareOf(g, id);
  const chk = taxiCheck(g, id);
  const can = chk.ok && (st.money || 0) >= fare;
  ctx.save();
  ctx.fillStyle = 'rgba(5,3,20,0.55)';
  rrPath(ctx, win.x + 6, win.y + 40, win.w - 12, win.h - 46, 12); ctx.fill();
  ctx.restore();
  const bw = 440, bh = 230, bx = win.x + (win.w - bw) / 2, by = win.y + (win.h - bh) / 2;
  panel(ctx, bx, by, bw, bh, { r: 16, glow: 'rgba(255,212,71,0.6)', inner: 'rgba(255,212,71,0.6)' });
  // タクシー帯（チェッカー）
  ctx.save();
  rrPath(ctx, bx + 8, by + 8, bw - 16, 34, 10); ctx.clip();
  ctx.fillStyle = '#ffd447'; ctx.fillRect(bx + 8, by + 8, bw - 16, 34);
  ctx.fillStyle = '#1a1440';
  for (let i = 0; i < 40; i++) { if (i % 2 === 0) ctx.fillRect(bx + 8 + i * 12, by + 8, 12, 6); else ctx.fillRect(bx + 8 + i * 12, by + 36, 12, 6); }
  ctx.restore();
  txt(ctx, 'VICE CAB  TAXI', bx + bw / 2, by + 25, { size: 17, align: 'center', color: '#1a1440', stroke: '#fff7c0', sw: 3, weight: 900 });
  txt(ctx, `「${mi.name}」へ移動しますか？`, bx + bw / 2, by + 72, { size: 18, align: 'center', color: '#fff', maxW: bw - 40 });
  txt(ctx, `料金`, bx + 110, by + 110, { size: 14, color: COL.sub });
  txt(ctx, fmtMoney(fare), bx + bw - 110, by + 110, { size: 22, align: 'right', color: (st.money || 0) >= fare ? COL.money : COL.bad, stroke: COL.moneyShadow, sw: 4 });
  txt(ctx, `所持金 ${fmtMoney(st.money || 0)}`, bx + bw / 2, by + 136, { size: 12.5, align: 'center', color: (st.money || 0) >= fare ? COL.sub : COL.bad });
  if (!chk.ok && chk.msg) txt(ctx, chk.msg, bx + bw / 2, by + 156, { size: 12.5, align: 'center', color: COL.bad, maxW: bw - 30 });
  const r1 = { x: bx + bw / 2 - 160, y: by + bh - 62, w: 150, h: 42 };
  const r2 = { x: bx + bw / 2 + 10, y: by + bh - 62, w: 150, h: 42 };
  ui.btn(ctx, win, 'taxiGo', r1, can ? '乗る [Enter]' : '乗車できません', () => rideTaxi(ui, win), { color: '#d9a400', disabled: !can, size: 15 });
  ui.btn(ctx, win, 'taxiNo', r2, 'やめる [Esc]', () => { win.confirm = null; }, { color: COL.purple, size: 15 });
}

export function rideTaxi(ui, win) {
  const g = ui.game;
  const c = win?.confirm;
  if (!c) return;
  const id = c.id, name = mapInfo(id).name, fare = taxiFareOf(g, id);
  const chk = taxiCheck(g, id);
  if (!chk.ok) { ui.notify(chk.msg || '乗車できません', COL.bad); return; }
  const usedReal = typeof OPT.travel?.taxiTravel === 'function'; // 本物は自前で通知する
  const r = doTaxi(g, id);
  win.confirm = null;
  if (r.ok) {
    ui.close('worldmap');
    if (!usedReal) ui.notify(`タクシーで ${name} へ到着 (-${fmtMoney(fare)})`, COL.gold);
  } else if (!usedReal) ui.notify(r.msg || '移動できませんでした', COL.bad);
}

// ============================================================
// モンスター図鑑
// ============================================================
const RANK = [
  { name: '未登録', color: '#8d88bd' },
  { name: 'ブロンズ', color: '#e0955a' },
  { name: 'シルバー', color: '#dfe6ff' },
  { name: 'ゴールド', color: '#ffd447' },
];
const silCache = new Map();
function enemyDims(def) {
  const human = ['thug', 'cop', 'swat', 'bossDon', 'civilian'].includes(def?.art);
  const sc = def?.scale || 1;
  const hh = human ? 84 * (def.scale || clamp((def.h || 70) / 72, 0.8, 2.2)) : (def?.h || 40) * (def?.art ? sc : 1);
  const ww = (def?.w || 40) * (human ? 1 : sc);
  return { w: ww, h: hh };
}
function dummyEnemy(def, t, st = 'idle') {
  const d = { ...def, boss: false };
  return { def: d, x: 0, y: 0, facing: 1, state: st, t, hurtT: 0, hp: def.hp || 100, maxHp: def.hp || 100, w: def.w, h: def.h, onGround: true, seed: hashId(def.id), dead: false, vx: 0, vy: 0 };
}
function hashId(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 10000; }
function drawEnemyFit(ctx, def, cx, footY, boxW, boxH, t, st, maxS = 1.6) {
  const d = enemyDims(def);
  const s = clamp(Math.min(boxH / Math.max(20, d.h * 1.12), boxW / Math.max(20, d.w * 1.1)), 0.25, maxS);
  ctx.save();
  ctx.translate(cx, footY);
  ctx.scale(s, s);
  const ok = drawEnemyArt(ctx, dummyEnemy(def, t, st));
  ctx.restore();
  if (!ok) {
    ctx.save();
    ctx.fillStyle = def.color || '#5cff9a';
    ctx.beginPath(); ctx.ellipse(cx, footY - boxH * 0.3, boxW * 0.3, boxH * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
function drawSilhouette(ctx, def, x, y, w, h) {
  const key = def.id + ':' + w + 'x' + h;
  let c = silCache.get(key);
  if (!c && typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    drawEnemyFit(cx, def, w / 2, h - 8, w - 12, h - 14, 0.3, 'idle');
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = '#120c34';
    cx.fillRect(0, 0, w, h);
    silCache.set(key, c);
  }
  if (c) {
    ctx.save();
    ctx.shadowColor = 'rgba(160,130,255,0.55)'; ctx.shadowBlur = 6;
    ctx.drawImage(c, x, y);
    ctx.restore();
  }
}

function regionName(r) { return REGION_BY_ID[r]?.name || r || '?'; }

export function drawBook(ui, ctx, win) {
  const g = ui.game, st = g.state || {};
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  const all = bookList(st);
  const SHORT = { rooftop: 'タワー', spaceport: '宇宙港', slums: 'スラム', downtown: 'ダウン\nタウン' };
  const tabsDef = [{ id: null, name: '全て' }, ...REGIONS.filter((r) => !r.noMap || all.some((e) => e.region === r.id)).map((r) => ({ id: r.id, name: SHORT[r.id] || r.name }))];
  // タブ
  tabsDef.forEach((tb, i) => {
    const tw = Math.min(92, Math.floor((w - 32) / tabsDef.length));
    const r = { x: x + 16 + i * tw, y: y + 46, w: tw - 6, h: 30 };
    const on = (win.tab || 0) === i, hov = ui.hover(win, r);
    const col = tb.id ? regionColor(tb.id) : COL.pink;
    const list = all.filter((e) => !tb.id || e.region === tb.id);
    const reg = list.filter((e) => bookKills(st, e.id) > 0).length;
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 10);
    if (on) { const gg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); gg.addColorStop(0, lighten(col, 0.25)); gg.addColorStop(1, col); ctx.fillStyle = gg; ctx.shadowColor = col; ctx.shadowBlur = 10; } else ctx.fillStyle = hov ? rgba(col, 0.35) : 'rgba(10,6,30,0.55)';
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff' : rgba(col, 0.6); ctx.stroke();
    ctx.restore();
    txt(ctx, tb.name.replace('\n', ''), r.x + r.w / 2, r.y + 11, { size: 12, align: 'center', color: on ? '#1a1440' : '#fff', stroke: on ? 'rgba(255,255,255,0.7)' : undefined, sw: on ? 2 : 3, maxW: r.w - 8 });
    txt(ctx, `${reg}/${list.length}`, r.x + r.w / 2, r.y + 23, { size: 9.5, align: 'center', color: on ? '#1a1440' : COL.sub, stroke: false });
    ui.hit(win, 'btab' + i, r, { onClick: () => { win.tab = i; win.page = 0; win.sel = null; } });
  });
  const region = tabsDef[win.tab || 0]?.id;
  const list = all.filter((e) => !region || e.region === region);
  // グリッド
  const COLS = 5, ROWS = 3, PER = COLS * ROWS;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  win.page = clamp(win.page || 0, 0, pages - 1);
  const gx = x + 16, gy = y + 86, cw = 120, ch = 144, gap = 8;
  if (!list.length) txt(ctx, 'この地域のモンスターデータはまだありません', gx + 310, gy + 200, { size: 15, align: 'center', color: COL.dim });
  const page = list.slice(win.page * PER, win.page * PER + PER);
  if (win.sel == null && page[0]) win.sel = page[0].id;
  const newSet = ui.bookNewIds || new Set();
  page.forEach((e, k) => {
    const r = { x: gx + (k % COLS) * (cw + gap), y: gy + Math.floor(k / COLS) * (ch + gap), w: cw, h: ch };
    const kills = bookKills(st, e.id), reg = kills > 0;
    const rank = reg ? bookRankOf(kills) : 0;
    const hov = ui.hover(win, r), sel = win.sel === e.id;
    const col = regionColor(e.region);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 12, fill: sel ? rgba(col, 0.28) : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.6)', stroke: sel ? '#fff' : reg ? rgba(col, 0.75) : 'rgba(190,170,255,0.3)', lw: sel ? 2.5 : 1.5 });
    // 背景
    ctx.save();
    rrPath(ctx, r.x + 4, r.y + 4, r.w - 8, 100, 9); ctx.clip();
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + 104);
    bg.addColorStop(0, rgba(col, reg ? 0.35 : 0.12)); bg.addColorStop(1, 'rgba(10,6,30,0.2)');
    ctx.fillStyle = bg; ctx.fillRect(r.x, r.y, r.w, 104);
    if (reg) drawEnemyFit(ctx, e.def, r.x + r.w / 2, r.y + 96, r.w - 20, 84, t + k * 0.37, hov ? 'walk' : 'idle');
    else drawSilhouette(ctx, e.def, r.x + 4, r.y + 4, r.w - 8, 100);
    ctx.restore();
    txt(ctx, 'No.' + String(e.no).padStart(3, '0'), r.x + 8, r.y + 13, { size: 9.5, color: COL.sub, sw: 2.5 });
    if (e.boss) txt(ctx, 'BOSS', r.x + r.w - 8, r.y + 13, { size: 9.5, align: 'right', color: COL.pink, sw: 2.5 });
    if (reg) {
      txt(ctx, e.name, r.x + r.w / 2, r.y + 116, { size: 12.5, align: 'center', color: '#fff', maxW: r.w - 10 });
      for (let i = 0; i < 3; i++) {
        ctx.save();
        starPath(ctx, r.x + r.w / 2 - 16 + i * 16, r.y + 133, 6, 2.6);
        ctx.fillStyle = i < rank ? RANK[rank].color : 'rgba(255,255,255,0.15)'; ctx.fill();
        ctx.restore();
      }
    } else {
      txt(ctx, '???', r.x + r.w / 2, r.y + 116, { size: 13, align: 'center', color: COL.dim });
      txt(ctx, '未発見', r.x + r.w / 2, r.y + 133, { size: 10, align: 'center', color: 'rgba(141,136,189,0.7)', sw: 2 });
    }
    if (newSet.has(e.id)) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 8);
      ctx.save(); ctx.translate(r.x + r.w - 20, r.y + 28); ctx.scale(pulse, pulse);
      rrPath(ctx, -18, -9, 36, 18, 9); ctx.fillStyle = COL.pink; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
      txt(ctx, 'NEW!', r.x + r.w - 20, r.y + 28.5, { size: 10, align: 'center', sw: 2 });
    }
    ui.hit(win, 'card:' + e.id, r, { onClick: () => { win.sel = e.id; newSet.delete(e.id); } });
  });
  // ページャ
  if (pages > 1) {
    const py = gy + ROWS * (ch + gap) + 2;
    ui.btn(ctx, win, 'bpL', { x: gx + 220, y: py, w: 34, h: 26 }, '◀', () => { win.page = Math.max(0, win.page - 1); win.sel = null; }, { disabled: win.page <= 0, size: 12 });
    txt(ctx, `${win.page + 1} / ${pages}`, gx + 310, py + 13, { size: 13, align: 'center' });
    ui.btn(ctx, win, 'bpR', { x: gx + 366, y: py, w: 34, h: 26 }, '▶', () => { win.page = Math.min(pages - 1, win.page + 1); win.sel = null; }, { disabled: win.page >= pages - 1, size: 12 });
  }
  // 詳細
  const sel = list.find((e) => e.id === win.sel) || page[0];
  drawBookDetail(ui, ctx, win, sel, x + 660, y + 86, w - 676, 474, t);
  // 下部: 登録数・ボーナス
  const by = y + h - 50;
  inset(ctx, x + 16, by, w - 32, 38, { r: 10 });
  const regAll = all.filter((e) => bookKills(st, e.id) > 0).length;
  txt(ctx, '登録', x + 30, by + 19, { size: 13, color: COL.sub });
  txt(ctx, `${regAll} / ${all.length}`, x + 66, by + 19, { size: 16, color: COL.gold });
  const pbx = x + 150, pbw = 180;
  ctx.save();
  rrPath(ctx, pbx, by + 12, pbw, 14, 7); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  const k = all.length ? regAll / all.length : 0;
  if (k > 0) { rrPath(ctx, pbx, by + 12, Math.max(14, pbw * k), 14, 7); ctx.fillStyle = rainbowGrad(ctx, pbx, 0, pbx + pbw, 0, t * 0.2); ctx.fill(); }
  ctx.restore();
  txt(ctx, `${Math.round(k * 100)}%`, pbx + pbw + 10, by + 19, { size: 12, color: '#fff' });
  txt(ctx, '図鑑ボーナス', x + 400, by + 19, { size: 13, color: COL.teal });
  txt(ctx, bonusText(bookBonusOf(st)), x + 494, by + 19, { size: 13, color: COL.good, maxW: w - 522 });
}

function bonusText(b) {
  if (!b) return '—（モンスターを倒して登録しよう）';
  if (typeof b === 'string') return b;
  if (Array.isArray(b)) return b.join('  ') || '—';
  if (Array.isArray(b.lines)) return b.lines.join('  ') || '—';
  if (typeof b.text === 'string') return b.text;
  const src = b.stats && typeof b.stats === 'object' ? b.stats : b;
  const parts = [];
  for (const [k, v] of Object.entries(src)) {
    if (typeof v !== 'number' || !v || k === 'registered' || k === 'total' || k === 'count') continue;
    const pct = (k === 'crit' || k === 'critDmg' || k === 'exp' || k === 'expRate' || k === 'drop' || k === 'dropRate') && Math.abs(v) < 5;
    const pv = pct ? (v * 100 >= 1 ? Math.round(v * 100) : +(v * 100).toFixed(2)) + '%' : Math.round(v * 100) / 100;
    parts.push(`${STAT_LABELS[k] || ({ exp: 'EXP', expRate: 'EXP', drop: 'ドロップ', dropRate: 'ドロップ' }[k]) || k} +${pv}`);
  }
  return parts.join('  ') || '—（まだボーナスなし）';
}

function drawBookDetail(ui, ctx, win, e, x, y, w, h, t) {
  const g = ui.game, st = g.state || {};
  inset(ctx, x, y, w, h, { r: 12 });
  if (!e) return;
  const kills = bookKills(st, e.id), reg = kills > 0;
  const col = regionColor(e.region);
  // 絵
  ctx.save();
  rrPath(ctx, x + 8, y + 8, w - 16, 170, 10); ctx.clip();
  const bg = ctx.createLinearGradient(0, y, 0, y + 178);
  bg.addColorStop(0, rgba(col, reg ? 0.5 : 0.15)); bg.addColorStop(1, 'rgba(10,6,30,0.4)');
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, 180);
  ctx.strokeStyle = rgba('#ffffff', 0.08);
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x, y + 150 + i * i * 2); ctx.lineTo(x + w, y + 150 + i * i * 2); ctx.stroke(); }
  if (reg) {
    const stt = Math.floor(t / 2.5) % 2 ? 'walk' : 'idle';
    drawEnemyFit(ctx, e.def, x + w / 2, y + 162, w - 60, 140, t, stt, 2.6);
  } else drawSilhouette(ctx, e.def, x + 8 + (w - 16 - 200) / 2, y + 18, 200, 150);
  ctx.restore();
  txt(ctx, 'No.' + String(e.no).padStart(3, '0'), x + 16, y + 22, { size: 11, color: COL.sub, sw: 2.5 });
  // 名前
  let yy = y + 198;
  txt(ctx, reg ? e.name : '???', x + 16, yy, { size: 20, color: reg ? '#fff' : COL.dim, glow: reg ? col : null, maxW: w - 100 });
  if (e.boss) txt(ctx, 'BOSS', x + w - 16, yy, { size: 13, align: 'right', color: COL.pink });
  yy += 26;
  // 地域チップ
  ctx.save(); rrPath(ctx, x + 16, yy - 10, 108, 20, 10); ctx.fillStyle = rgba(col, 0.35); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
  txt(ctx, regionName(e.region), x + 70, yy, { size: 11, align: 'center', sw: 2.5 });
  txt(ctx, `Lv. ${reg ? (e.level ?? '?') : '??'}`, x + 140, yy, { size: 14, color: COL.gold });
  yy += 26;
  // 出現地
  txt(ctx, '出現地', x + 16, yy, { size: 12, color: COL.sub, sw: 2.5 });
  const visited = visitedSet(g);
  const hab = (e.habitats || []).map((id) => (visited.has(id) ? mapInfo(id).name : '???'));
  txt(ctx, hab.length ? hab.slice(0, 3).join(' / ') + (hab.length > 3 ? ' …' : '') : '—', x + 70, yy, { size: 12, color: '#fff', maxW: w - 86, sw: 2.5 });
  yy += 24;
  // 撃破数・ランク
  const rank = reg ? bookRankOf(kills) : 0;
  txt(ctx, '撃破数', x + 16, yy, { size: 12, color: COL.sub, sw: 2.5 });
  txt(ctx, `${kills}`, x + 70, yy, { size: 15, color: '#fff' });
  txt(ctx, 'ランク', x + 140, yy, { size: 12, color: COL.sub, sw: 2.5 });
  for (let i = 0; i < 3; i++) {
    ctx.save(); starPath(ctx, x + 192 + i * 18, yy, 7, 3); ctx.fillStyle = i < rank ? RANK[rank].color : 'rgba(255,255,255,0.15)'; ctx.fill(); ctx.restore();
  }
  txt(ctx, RANK[rank]?.name || '', x + w - 16, yy, { size: 11, align: 'right', color: RANK[rank]?.color || '#fff', sw: 2.5 });
  yy += 16;
  const next = [10, 50, 100].find((n) => kills < n);
  if (reg) {
    const prev = next === 10 ? 0 : next === 50 ? 10 : next === 100 ? 50 : 100;
    const k = next ? (kills - prev) / (next - prev) : 1;
    ctx.save();
    rrPath(ctx, x + 16, yy, w - 32, 8, 4); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    rrPath(ctx, x + 16, yy, Math.max(8, (w - 32) * k), 8, 4); ctx.fillStyle = RANK[Math.min(3, rank + 1)].color; ctx.fill();
    ctx.restore();
    txt(ctx, next ? `次のランクまで ${next - kills} 体` : 'ランクMAX！', x + w - 16, yy + 18, { size: 10.5, align: 'right', color: COL.dim, sw: 2.5 });
  }
  yy += 34;
  // ドロップ
  txt(ctx, 'ドロップ', x + 16, yy, { size: 12, color: COL.sub, sw: 2.5 });
  yy += 18;
  const drops = (e.drops || []).map((d) => (typeof d === 'string' ? { id: d } : d)).filter((d) => d?.id);
  if (!drops.length) txt(ctx, '—', x + 24, yy + 4, { size: 12, color: COL.dim });
  const perRow = 2, dw = (w - 32) / perRow;
  drops.slice(0, 10).forEach((d, i) => {
    const id = d.id;
    const it = getItemDef(id);
    const known = reg && (d.known || itemKnown(st, id));
    const dx = x + 16 + (i % perRow) * dw, dy = yy + Math.floor(i / perRow) * 26;
    if (dy > y + h - 20) return;
    const rr = { x: dx, y: dy - 2, w: dw - 6, h: 24 };
    inset(ctx, rr.x, rr.y, rr.w, rr.h, { r: 6, fill: 'rgba(0,0,0,0.3)', stroke: known && it ? rgba(rarityInfo(it.rarity).color, 0.6) : 'rgba(190,170,255,0.2)', lw: 1 });
    if (known && it) {
      drawItemIco(ctx, it, dx + 12, dy + 10, 20);
      txt(ctx, it.name, dx + 26, dy + 10, { size: 11, color: rarityInfo(it.rarity).color, maxW: dw - 38, sw: 2.5 });
    } else {
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(dx + 12, dy + 10, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      txt(ctx, '???', dx + 26, dy + 10, { size: 11, color: COL.dim, sw: 2.5 });
    }
    if (known && it && ui.hover(win, rr)) {
      ui.setTip({ lines: [{ t: it.name, c: rarityInfo(it.rarity).color, size: 15 }, { t: rarityInfo(it.rarity).name, c: COL.sub, size: 11.5 }, ...(it.desc ? [{ t: it.desc, c: '#e6e0ff', size: 12, wrap: true }] : [])], border: rarityInfo(it.rarity).color });
    }
  });
  if (!reg) txt(ctx, 'まだ倒したことがない…', x + w / 2, y + h - 18, { size: 12, align: 'center', color: COL.dim });
}

// ============================================================
// スマホ NeonGram
// ============================================================
function fmtAgo(game, p) {
  if (typeof p.clock === 'number') return clockStr(p.clock);
  const tv = p.t ?? p.time;
  if (typeof tv !== 'number') return '';
  let sec;
  if (tv > 1e11) sec = (Date.now() - tv) / 1000;
  else sec = (game.time || 0) - tv;
  if (!(sec >= 0)) return 'たった今';
  if (sec < 60) return 'たった今';
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
  return `${Math.floor(sec / 86400)}日前`;
}
function fmtNum(n) {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
  return n.toLocaleString('en-US');
}
const POST_KIND = {
  level: { c: '#ffd447', g: '▲' }, boss: { c: '#ff5fa2', g: '★' }, pet: { c: '#ff6ad5', g: '♥' }, rare: { c: '#4FA8FF', g: '◆' },
  wanted: { c: '#ff2e4d', g: '!' }, milestone: { c: '#7CFF9B', g: '✦' }, post: { c: '#19d3c5', g: '●' },
  system: { c: '#7b8cff', g: 'N' }, book: { c: '#5cff9a', g: 'B' }, taxi: { c: '#ffd447', g: 'T' },
};
function postKind(p) {
  const k = p.kind || p.type || p.icon;
  if (k && POST_KIND[k]) return POST_KIND[k];
  const s = String(p.text || '');
  if (/PET|ペット/.test(s)) return POST_KIND.pet;
  if (/ボス|BOSS|撃破/.test(s)) return POST_KIND.boss;
  if (/レベル|Lv/.test(s)) return POST_KIND.level;
  if (/手配|警察|★/.test(s)) return POST_KIND.wanted;
  if (/ゲット|入手|レア/.test(s)) return POST_KIND.rare;
  if (/フォロワー/.test(s)) return POST_KIND.milestone;
  return POST_KIND.post;
}

export function drawPhone(ui, ctx, win) {
  const g = ui.game, st = g.state || {};
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  // 本体
  ctx.save();
  ctx.shadowColor = 'rgba(255,95,162,0.55)'; ctx.shadowBlur = 26;
  rrPath(ctx, x, y, w, h, 42);
  const body = ctx.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, '#2a2350'); body.addColorStop(0.5, '#151030'); body.addColorStop(1, '#2a1640');
  ctx.fillStyle = body; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3; ctx.strokeStyle = rainbowGrad(ctx, x, y, x + w, y + h, t * 0.1); ctx.stroke();
  ctx.restore();
  const sx = x + 12, sy = y + 12, sw = w - 24, sh = h - 24;
  ctx.save();
  rrPath(ctx, sx, sy, sw, sh, 32);
  const scr = ctx.createLinearGradient(0, sy, 0, sy + sh);
  scr.addColorStop(0, '#1b1240'); scr.addColorStop(1, '#0c0820');
  ctx.fillStyle = scr; ctx.fill();
  ctx.clip();
  // ステータスバー
  const clock = getClock(g);
  const ph = clockPhase(clock);
  txt(ctx, clock == null ? '--:--' : clockStr(clock), sx + 26, sy + 20, { size: 12, color: '#fff', sw: 2 });
  drawPhaseIcon(ctx, ph, sx + 102, sy + 20, 5, t);
  // ノッチ
  ctx.fillStyle = '#05030f';
  rrPath(ctx, sx + sw / 2 - 46, sy + 6, 92, 24, 12); ctx.fill();
  // 電波・電池
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#fff'; ctx.fillRect(sx + sw - 82 + i * 5, sy + 24 - i * 3 - 3, 3, i * 3 + 3); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(sx + sw - 54, sy + 14, 24, 12);
  ctx.fillStyle = COL.good; ctx.fillRect(sx + sw - 52, sy + 16, 16, 8);
  ctx.fillStyle = '#fff'; ctx.fillRect(sx + sw - 29, sy + 17, 2, 6);
  // ラジオ
  const radio = ui.radio?.name || (g.player?.inVehicle ? guard('radioName', () => audio?.radioName) : null) || null;
  ctx.save();
  rrPath(ctx, sx + 14, sy + 36, sw - 28, 24, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(sx + 44, sy + 36, sw - 70, 24); ctx.clip();
  const rt = radio ? `ON AIR  ${radio}` : 'RADIO OFF  （車に乗って R で選局）';
  const rw = measure(ctx, rt, 11.5);
  const off = rw > sw - 80 ? ((t * 30) % (rw + 40)) : 0;
  txt(ctx, rt, sx + 46 - off, sy + 48.5, { size: 11.5, color: radio ? '#ffd447' : COL.dim, sw: 2 });
  if (off) txt(ctx, rt, sx + 46 - off + rw + 40, sy + 48.5, { size: 11.5, color: radio ? '#ffd447' : COL.dim, sw: 2 });
  ctx.restore();
  // 音符
  ctx.save();
  ctx.fillStyle = radio ? COL.pink : COL.dim;
  for (let i = 0; i < 3; i++) { const bh2 = radio ? 4 + 6 * Math.abs(Math.sin(t * 6 + i * 1.7)) : 3; ctx.fillRect(sx + 24 + i * 5, sy + 54 - bh2, 3, bh2); }
  ctx.restore();
  // ロゴ
  ctx.save();
  ctx.font = `italic 900 26px 'M PLUS Rounded 1c', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rainbowGrad(ctx, sx + 20, 0, sx + 200, 0, 0);
  ctx.shadowColor = COL.pink; ctx.shadowBlur = 10;
  ctx.fillText('NeonGram', sx + 20, sy + 82);
  ctx.restore();
  // プロフィール
  const sns = st.sns || { followers: 0, posts: [] };
  const py0 = sy + 104;
  ctx.save();
  ctx.beginPath(); ctx.arc(sx + 50, py0 + 34, 30, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,95,162,0.25)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = rainbowGrad(ctx, sx + 20, py0, sx + 80, py0 + 68, t * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.arc(sx + 50, py0 + 34, 27, 0, Math.PI * 2); ctx.clip();
  drawChar(ctx, sx + 50, py0 + 34 + 72, charLook(st), equipLooks(st), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 1.05 });
  ctx.restore();
  const handle = '@' + (st.heroId || 'hero') + '_vicebay';
  txt(ctx, charName(st) || 'HERO', sx + 92, py0 + 14, { size: 16 });
  txt(ctx, handle, sx + 92, py0 + 33, { size: 11, color: COL.sub, sw: 2 });
  const title = snsTitleOf(st);
  if (title.name) {
    const tw = measure(ctx, title.name, 11) + 18;
    ctx.save(); rrPath(ctx, sx + 92, py0 + 44, tw, 18, 9); ctx.fillStyle = rainbowGrad(ctx, sx + 92, 0, sx + 92 + tw, 0, t * 0.2); ctx.fill(); ctx.restore();
    txt(ctx, title.name, sx + 92 + tw / 2, py0 + 53.5, { size: 11, align: 'center', color: '#1a1440', stroke: 'rgba(255,255,255,0.6)', sw: 2 });
  }
  // カウンタ
  const posts = Array.isArray(sns.posts) ? sns.posts : [];
  const cy1 = py0 + 82;
  const cnt = [['投稿', fmtNum(posts.length)], ['フォロワー', fmtNum(sns.followers || 0)], ['いいね', fmtNum(posts.reduce((a, p) => a + (p?.likes || 0), 0))]];
  cnt.forEach(([k, v], i) => {
    const cx = sx + 20 + (sw - 40) * (i + 0.5) / 3;
    txt(ctx, v, cx, cy1, { size: i === 1 ? 19 : 16, align: 'center', color: i === 1 ? COL.gold : '#fff' });
    txt(ctx, k, cx, cy1 + 18, { size: 10, align: 'center', color: COL.sub, sw: 2 });
  });
  // タブ
  const ty = cy1 + 34;
  const TABS = [['タイムライン', null], ['マップ', 'worldmap'], ['図鑑', 'book']];
  const tw3 = (sw - 28) / 3;
  TABS.forEach(([lab, target], i) => {
    const r = { x: sx + 14 + i * tw3, y: ty, w: tw3 - 4, h: 28 };
    const hov = ui.hover(win, r), on = i === 0;
    ctx.save(); rrPath(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = on ? COL.pink : hov ? 'rgba(123,47,247,0.6)' : 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.restore();
    txt(ctx, (target ? '▸ ' : '') + lab, r.x + r.w / 2, r.y + 14.5, { size: 11.5, align: 'center', sw: 2, maxW: r.w - 6 });
    if (target) ui.hit(win, 'ptab' + i, r, { onClick: () => { ui.close('phone'); ui.open(target); } });
  });
  // タイムライン
  const fy = ty + 38, fh = sy + sh - 30 - fy;
  // 新しい順（t があれば t 降順、無ければ配列末尾を新しいとみなす）
  const list = posts.map((p, i) => ({ p, i, k: typeof p?.t === 'number' ? p.t : null }))
    .sort((a, b) => (a.k != null && b.k != null && a.k !== b.k ? b.k - a.k : b.i - a.i)).map((e) => e.p);
  const PER = 5;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  win.page = clamp(win.page || 0, 0, pages - 1);
  if (!list.length) {
    txt(ctx, 'まだ投稿がありません', sx + sw / 2, fy + 60, { size: 14, align: 'center', color: COL.sub });
    txt(ctx, 'レア入手・ボス撃破・レベルアップで', sx + sw / 2, fy + 90, { size: 11.5, align: 'center', color: COL.dim, sw: 2 });
    txt(ctx, '自動で投稿されるよ！', sx + sw / 2, fy + 108, { size: 11.5, align: 'center', color: COL.dim, sw: 2 });
  }
  let yy = fy;
  for (const p of list.slice(win.page * PER, win.page * PER + PER)) {
    if (!p) continue;
    const lines = wrap(ctx, String(p.text || ''), sw - 80, 12, 700).slice(0, 3);
    const ch = 44 + lines.length * 16;
    if (yy + ch > fy + fh) break;
    ctx.save(); rrPath(ctx, sx + 12, yy, sw - 24, ch, 12); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke(); ctx.restore();
    const K = postKind(p);
    ctx.save(); ctx.beginPath(); ctx.arc(sx + 32, yy + 20, 12, 0, Math.PI * 2); ctx.fillStyle = K.c; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
    txt(ctx, K.g, sx + 32, yy + 20.5, { size: 12, align: 'center', color: '#fff', sw: 2.5 });
    txt(ctx, handle, sx + 52, yy + 14, { size: 11, color: '#fff', sw: 2 });
    txt(ctx, fmtAgo(g, p), sx + sw - 22, yy + 14, { size: 10, align: 'right', color: COL.dim, sw: 2 });
    lines.forEach((l, i) => txt(ctx, l, sx + 52, yy + 32 + i * 16, { size: 12, color: '#efeaff', weight: 700, sw: 2 }));
    txt(ctx, `♥ ${fmtNum(p.likes || 0)}`, sx + sw - 22, yy + ch - 10, { size: 11, align: 'right', color: COL.pink, sw: 2 });
    yy += ch + 6;
  }
  if (pages > 1) {
    const by = sy + sh - 30;
    ui.btn(ctx, win, 'ppU', { x: sx + sw / 2 - 74, y: by - 4, w: 40, h: 22 }, '▲', () => { win.page = Math.max(0, win.page - 1); }, { disabled: win.page <= 0, size: 11 });
    txt(ctx, `${win.page + 1}/${pages}`, sx + sw / 2, by + 7, { size: 11, align: 'center' });
    ui.btn(ctx, win, 'ppD', { x: sx + sw / 2 + 34, y: by - 4, w: 40, h: 22 }, '▼', () => { win.page = Math.min(pages - 1, win.page + 1); }, { disabled: win.page >= pages - 1, size: 11 });
  }
  // ホームバー
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  rrPath(ctx, sx + sw / 2 - 50, sy + sh - 8, 100, 4, 2); ctx.fill();
  ctx.restore();
  // 閉じる
  const cr = { x: x + w / 2 + 52, y: y + 15, w: 30, h: 30 };
  const hov = ui.hover(win, cr);
  ctx.save(); ctx.beginPath(); ctx.arc(cr.x + 15, cr.y + 15, 13, 0, Math.PI * 2); ctx.fillStyle = hov ? COL.pink : 'rgba(20,10,50,0.9)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  txt(ctx, '×', cr.x + 15, cr.y + 16, { size: 16, align: 'center', sw: 2 });
  ui.hit(win, 'close', cr, { onClick: () => ui.close('phone') });
  void font; void panel;
}
