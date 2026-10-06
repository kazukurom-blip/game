// クエストナビ（SPEC_V3 §1 / REFERENCE S-7）
//  missionGuide(game, missionId) → 目的ごとの「どこへ行けばいいか」:
//    [{objIndex, type, text, done, count, value, mapId, mapName, mapLevel, npcId, npcName, npcMapId, targetName,
//      route:[mapId...], nextPortal:{x, y, to, label}|null, targetPos:{x, y}|null, turnIn?}]
//    - route は travel.js の WORLD_GRAPH で BFS（現在地 → 目的マップ。インスタンス等は portals で補完）
//    - nextPortal は現在マップの portals から route[1] 行きを探す（同じマップなら null・targetPos に NPC/敵の位置）
//    - NPC の居場所は maps.js の npcs から逆引き（無ければ MISSION_NPCS.mapId）
//    - 全目的を満たしたら最後に報告先（objIndex:-1, turnIn:true）
//  trackedGuide(game) → 追跡中ミッション（state.trackedMission / 無ければ メイン>転職>サブ>デイリー の先頭）の次の目的地
import { MISSIONS, MISSION_NPCS, turnInNpcOf } from '../data/missions.js';
import { ENEMIES } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';
import { MAPS } from '../world/maps.js';
import { WORLD_GRAPH, MAP_INFO, mapName } from './travel.js';

function neighbors(id) {
  const g = WORLD_GRAPH[id];
  if (g && g.length) return g;
  return (MAPS[id]?.portals || []).filter((p) => p.to && !p.hidden).map((p) => p.to);
}

/** routeBetween(from, to) → [from, ..., to]（到達不可なら []） */
export function routeBetween(from, to) {
  if (!from || !to) return [];
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of neighbors(c)) {
      if (prev.has(n)) continue;
      prev.set(n, c);
      if (n === to) {
        const path = [to];
        let k = c;
        while (k != null) { path.unshift(k); k = prev.get(k); }
        return path;
      }
      q.push(n);
    }
  }
  return [];
}
const hops = (a, b) => { const r = routeBetween(a, b); return r.length ? r.length - 1 : Infinity; };

/** NPC の居場所 {mapId, x, y, name} | null（maps.js の npcs を逆引き → MISSION_NPCS） */
export function findNpc(npcId) {
  for (const m of Object.values(MAPS)) {
    const n = (m.npcs || []).find((q) => q.id === npcId);
    if (n) return { mapId: m.id, x: n.x, y: n.y ?? m.groundY, name: n.name || MISSION_NPCS[npcId]?.name || npcId };
  }
  const mn = MISSION_NPCS[npcId];
  return mn ? { mapId: mn.mapId, x: null, y: null, name: mn.name } : null;
}

function nearestOf(from, ids) {
  let best = null, bd = Infinity;
  for (const id of ids) { const d = hops(from, id); if (d < bd) { bd = d; best = id; } }
  return best || ids[0] || null;
}

/** 目的の行き先マップ */
function objectiveMap(o, from) {
  if (o.type === 'reach') return o.target;
  if (o.type === 'talk') return findNpc(o.target)?.mapId || o.mapId || null;
  if (o.mapId) return o.mapId;
  if (o.type === 'kill' || o.type === 'boss') {
    const e = ENEMIES[o.target];
    if (e?.habitats?.length) return nearestOf(from, e.habitats);
    return null;
  }
  if (o.type === 'collect') {
    const maps = [];
    for (const e of Object.values(ENEMIES)) {
      if (!(e.drops || []).some((d) => d.id === o.target)) continue;
      maps.push(...(e.habitats || []));
    }
    if (maps.length) return nearestOf(from, [...new Set(maps)]);
    return null;
  }
  return null;
}

function targetNameOf(o) {
  switch (o.type) {
    case 'kill': case 'boss': return ENEMIES[o.target]?.name || o.target;
    case 'collect': return ITEMS[o.target]?.name || o.target;
    case 'talk': return MISSION_NPCS[o.target]?.name || findNpc(o.target)?.name || o.target;
    case 'reach': return mapName(o.target);
    default: return String(o.target ?? '');
  }
}

function portalTo(game, curMap, to) {
  const m = game.map && game.map.id === curMap ? game.map : MAPS[curMap];
  const p = (m?.portals || []).find((q) => q.to === to && !q.hidden);
  return p ? { x: p.x, y: p.y ?? m.groundY, to: p.to, label: p.label || mapName(p.to) } : null;
}

function samePos(game, o, npc) {
  if (npc) {
    const live = (game.npcs || []).find((n) => (n.id || n.def?.id || n.data?.id) === npc.id);
    if (live && Number.isFinite(live.x)) return { x: live.x, y: live.y };
    return npc.x != null ? { x: npc.x, y: npc.y } : null;
  }
  if (o && (o.type === 'kill' || o.type === 'boss')) {
    const p = game.player;
    let best = null, bd = Infinity;
    for (const e of game.enemies || []) {
      if (!e || e.dead || (e.def?.id || e.defId) !== o.target) continue;
      const d = p ? Math.abs(e.x - p.x) : 0;
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }
  return null;
}

function entry(game, cur, base) {
  const route = base.mapId ? routeBetween(cur, base.mapId) : [];
  const info = base.mapId ? MAP_INFO[base.mapId] : null;
  const lr = info?.levelRange || MAPS[base.mapId]?.levelRange || null;
  const same = !base.mapId || base.mapId === cur;
  return {
    ...base,
    mapName: base.mapId ? mapName(base.mapId) : null,
    mapLevel: lr ? `Lv${lr[0]}〜${lr[1]}` : '',
    route,
    nextPortal: !same && route.length >= 2 ? portalTo(game, cur, route[1]) : null,
    targetPos: same ? samePos(game, base.objective, base.npcId ? findNpc(base.npcId) && { id: base.npcId, ...findNpc(base.npcId) } : null) : null,
  };
}

/** missionGuide(game, missionId) → 目的ごとのナビ情報（ミッションが無ければ []） */
export function missionGuide(game, missionId) {
  const m = MISSIONS[missionId];
  const st = game?.state;
  if (!m || !st) return [];
  const cur = game.map?.id || st.mapId;
  const mm = game.missions;
  const active = !!st.missions?.active?.includes(missionId);
  const vals = mm && active ? mm.objectiveValues(missionId) : m.objectives.map(() => 0);
  const turnIn = turnInNpcOf(m);
  const out = m.objectives.map((o, i) => {
    const npcId = o.type === 'talk' ? o.target : null;
    const npc = npcId ? findNpc(npcId) : null;
    const value = Math.min(vals[i] || 0, o.count);
    return entry(game, cur, {
      objIndex: i, type: o.type, text: o.text, done: value >= o.count, count: o.count, value,
      mapId: objectiveMap(o, cur), npcId, npcName: npc?.name || null, npcMapId: npc?.mapId || null,
      targetName: targetNameOf(o), objective: o, isTurnInTalk: o.type === 'talk' && o.target === turnIn,
    });
  });
  const complete = active && mm ? mm.isComplete(missionId) : false;
  if (complete || !active) {
    const npc = findNpc(active ? turnIn : m.giver);
    out.push(entry(game, cur, {
      objIndex: -1, type: 'talk', turnIn: active, text: active ? `${npc?.name || turnIn} に報告` : `${npc?.name || m.giver} から受注`,
      done: false, count: 1, value: 0, mapId: npc?.mapId || null, npcId: active ? turnIn : m.giver, npcName: npc?.name || null,
      npcMapId: npc?.mapId || null, targetName: npc?.name || null, objective: null,
    }));
  }
  for (const e of out) delete e.objective;
  return out;
}

/** 追跡するミッションを設定（null で自動） */
export function setTrackedMission(state, missionId) {
  state.trackedMission = missionId && MISSIONS[missionId] ? missionId : null;
  return state.trackedMission;
}

const CAT_ORDER = { main: 0, job: 1, sub: 2, daily: 3 };
/** trackedGuide(game) → {missionId, missionName, category, ...次の目的（missionGuide の1件）} | null */
export function trackedGuide(game) {
  const st = game?.state;
  const act = st?.missions?.active || [];
  if (!act.length) return null;
  let id = st.trackedMission && act.includes(st.trackedMission) ? st.trackedMission : null;
  if (!id) id = [...act].sort((a, b) => (CAT_ORDER[MISSIONS[a]?.category] ?? 9) - (CAT_ORDER[MISSIONS[b]?.category] ?? 9))[0];
  const m = MISSIONS[id];
  if (!m) return null;
  const g = missionGuide(game, id);
  const next = g.find((e) => e.turnIn) || g.find((e) => !e.done && !e.isTurnInTalk) || g.find((e) => !e.done) || null;
  if (!next) return null;
  return { missionId: id, missionName: m.name, category: m.category, ...next };
}
