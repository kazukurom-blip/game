// v3 UI 用の安全アクセス層（転職・クラス・ナビ・強化・潜在・エンドレスコンテンツ・設定）
// 既存モジュールは名前空間 import、並行実装中のモジュールは動的 import（無くても UI は落ちない）。
import * as ClassM from '../data/classes.js';
import * as JobD from '../data/jobs.js';
import * as JobS from '../systems/jobs.js';
import * as SkillD from '../data/skills.js';
import * as SkillS from '../systems/skills.js';
import * as ItemsM from '../data/items.js';
import * as MissD from '../data/missions.js';
import * as CharM from '../render/character.js';
import { guard, getItemDef, allMaps, mapInfo, worldGraph, enemyDef, missionDef } from './deps.js';

export const V3 = { guide: null, tune: null, potential: null, tower: null, arena: null, bosses: null, achievements: null, daily: null, presets: null, shared: null };
function tryImport(key, path) {
  import(path).then((m) => { V3[key] = m; }).catch(() => { /* 未実装（フォールバック表示） */ });
}
for (const k of Object.keys(V3)) tryImport(k, `../systems/${k}.js`);
if (typeof window !== 'undefined') window.__uiV3 = V3; // テスト用

/** 動的モジュールの関数を安全に呼ぶ（無ければ fb） */
export function call(mod, fn, args, fb) {
  const f = V3[mod]?.[fn];
  if (typeof f !== 'function') return fb;
  return guard(mod + '.' + fn, () => f(...args), fb);
}
export function has(mod, fn) { return typeof V3[mod]?.[fn] === 'function'; }
export function val(mod, key) { return V3[mod]?.[key]; }

// ---------------- クラス・キャラ ----------------
export const CLASSES = ClassM.CLASSES || {};
export const CLASS_IDS = ClassM.CLASS_IDS || Object.keys(CLASSES);
export function classOf(id) { return CLASSES[id] || CLASSES.luna || { id, name: id }; }
export function defaultLook(cls, gender) {
  return guard('defaultLook', () => ClassM.defaultLook(cls, gender), null) || CharM.HERO_LOOKS?.[cls] || CharM.HERO_LOOKS?.luna;
}
export function defaultName(cls, gender) { return guard('defaultName', () => ClassM.defaultName(cls, gender), null) || 'ルナ'; }
export function legacyGender(cls) { return ClassM.LEGACY_GENDER?.[cls] || 'f'; }
/** state の見た目（state.look → DEFAULT_LOOKS → HERO_LOOKS） */
export function charLook(state) {
  if (!state) return CharM.HERO_LOOKS?.luna;
  if (state.look && typeof state.look === 'object') return state.look;
  return defaultLook(state.heroId || 'luna', state.gender || legacyGender(state.heroId));
}
export function charName(state) {
  if (!state) return '';
  return state.name || defaultName(state.heroId || 'luna', state.gender || legacyGender(state.heroId));
}
export function starterEquipLooks(cls, gender) {
  const ids = guard('starterEquipFor', () => ItemsM.starterEquipFor(cls, gender), null) || ItemsM.STARTER_EQUIP?.[cls] || {};
  return guard('looksFromIds', () => ItemsM.looksFromIds(ids), {}) || {};
}
export function looksFromIds(ids) { return guard('looksFromIds', () => ItemsM.looksFromIds(ids || {}), {}) || {}; }
export function branchInfo(id) { return JobD.JOB_BRANCHES?.[id] || null; }

// 髪型・色（アート担当が HAIR_STYLES を export したらそれを使う）
const HAIR_NAMES = { twin: 'ツインテール', bob: 'ボブ', long: 'ロング', short: 'ショート', ponytail: 'ポニーテール', spiky: 'ツンツン', wolf: 'ウルフ', bun: 'おだんご', mohawk: 'モヒカン', braid: 'みつあみ', afro: 'アフロ', undercut: 'ツーブロック', sidetail: 'サイドテール', hime: 'ひめカット', buzz: 'ボウズ' };
export function hairStyles() {
  const ex = CharM.HAIR_STYLES;
  let ids = Array.isArray(ex) ? ex.map((h) => (typeof h === 'string' ? h : h?.id)).filter(Boolean)
    : ex && typeof ex === 'object' ? Object.keys(ex) : null;
  if (!ids || !ids.length) ids = ['short', 'spiky', 'wolf', 'bob', 'long', 'twin', 'ponytail', 'bun'];
  return ids.map((id) => ({ id, name: (ex && !Array.isArray(ex) && ex[id]?.name) || (Array.isArray(ex) && ex.find((h) => h?.id === id)?.name) || HAIR_NAMES[id] || id }));
}
export const HAIR_COLORS = ['#ff6fb5', '#d9dee8', '#3dff8a', '#19d3c5', '#7b5cff', '#ffd23f', '#ff8a3d', '#ff3d4d', '#3a2a2a', '#8a5a3a', '#f4e2b0', '#2b2f55', '#b47cff', '#ffffff'];
export const EYE_COLORS = ['#ff3d8b', '#33c7e6', '#19f0ff', '#3dff8a', '#ffd23f', '#ff8a3d', '#b47cff', '#6a4a2a', '#2a2a40', '#ff3d4d'];
export const SKIN_COLORS = ['#ffe9dc', '#ffe0cc', '#f6d5be', '#e8c4a8', '#d9a882', '#b98262', '#8a5a40', '#5e3a2a'];
/** 髪色から影・ハイライトも作る */
function hexMix(hex, to, k) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16) || 0;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * k));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function withHairColor(look, c) {
  const o = { ...look, hairColor: c, hairShadow: hexMix(c, 0, 0.32), hairHi: hexMix(c, 255, 0.55) };
  delete o.hairTip; delete o.mesh;
  return o;
}

// ---------------- 職 ----------------
export const JOBS = JobD.JOBS || {};
export function jobDef(id) { return JOBS[id] || null; }
export function currentJob(state) {
  return guard('currentJob', () => (typeof JobS.currentJob === 'function' ? JobS.currentJob(state) : null), null) || JOBS[state?.job?.id] || JOBS.beginner || { name: '見習い', title: '見習い', tier: 0 };
}
export function jobOffer(state) { return guard('jobOffer', () => (typeof JobS.jobOffer === 'function' ? JobS.jobOffer(state) : null), null); }
export function acceptJob(game, jobId) {
  return guard('acceptJobMission', () => (typeof JobS.acceptJobMission === 'function' ? JobS.acceptJobMission(game, jobId) : null), null) || { ok: false, msg: '受注できませんでした' };
}
export function jobLineage(id) { return guard('jobLineage', () => JobD.jobLineage(id), []) || []; }
export function hasJob(state, id) { return guard('hasJob', () => JobD.hasJob(state, id), false); }
export function getSp(state, tier) { return guard('getSp', () => JobD.getSp(state, tier), tier <= 1 ? state?.sp || 0 : 0) || 0; }
export function skillSpTier(sk) { return guard('skillSpTier', () => JobD.skillSpTier(sk), 1) || 1; }
export function jobLockOf(state, id) { return guard('jobLockOf', () => (typeof SkillS.jobLockOf === 'function' ? SkillS.jobLockOf(state, id) : null), null); }
export function skillsForHero(heroId, state, opts) {
  return guard('skillsForHero', () => SkillD.skillsForHero(heroId, state, opts), null) || Object.values(SkillD.SKILLS || {}).filter((s) => s.hero === heroId || s.hero === 'both');
}
export function moveParams(state, id, lv) { return guard('moveParams', () => (typeof SkillS.moveParams === 'function' ? SkillS.moveParams(state, id, lv) : null), null); }
export const SKILL_BAR_SIZE = SkillD.SKILL_BAR_SIZE || 8;
export const BAR_KEYS = 'ASDFQWGH';

// ---------------- ミッション / ナビ ----------------
export const MISSION_NPCS = MissD.MISSION_NPCS || {};
function bfs(adj, a, b) {
  if (!a || !b) return [];
  if (a === b) return [a];
  const prev = { [a]: null };
  const q = [a];
  while (q.length) {
    const n = q.shift();
    for (const m of adj[n] || []) {
      if (m in prev) continue;
      prev[m] = n;
      if (m === b) {
        const path = [b];
        let c = n;
        while (c != null) { path.unshift(c); c = prev[c]; }
        return path;
      }
      q.push(m);
    }
  }
  return [];
}
export function routeTo(game, to) { return bfs(worldGraph(), game?.state?.mapId || game?.map?.id, to); }
function portalTo(game, to) {
  const map = game?.map;
  const p = (map?.portals || []).find((po) => po && po.to === to);
  if (!p) return null;
  return { x: p.x, y: p.y, to, label: mapInfo(to).name };
}
function objTargetName(o) {
  if (!o) return null;
  if (o.type === 'kill' || o.type === 'boss') return enemyDef(o.target)?.name || o.target;
  if (o.type === 'collect') return getItemDef(o.target)?.name || o.target;
  if (o.type === 'talk') return MISSION_NPCS[o.target]?.name || o.target;
  if (o.type === 'reach') return mapInfo(o.target).name;
  return null;
}
/** systems/guide.js の missionGuide。未実装ならミッションデータから組み立てる */
export function missionGuide(game, missionId) {
  const r = call('guide', 'missionGuide', [game, missionId], null);
  if (Array.isArray(r)) return r;
  const m = missionDef(missionId);
  if (!m) return [];
  const vals = guard('objValues', () => game.missions?.objectiveValues?.(missionId), null) || [];
  const active = (game.state?.missions?.active || []).includes(missionId);
  return (m.objectives || []).map((o, i) => {
    let mapId = o.mapId || (o.type === 'reach' ? o.target : null);
    let npcId = null, npcName = null, npcMapId = null;
    if (o.type === 'talk') { npcId = o.target; npcName = MISSION_NPCS[o.target]?.name || o.target; npcMapId = MISSION_NPCS[o.target]?.mapId || null; mapId = mapId || npcMapId; }
    if (!mapId && (o.type === 'kill' || o.type === 'boss')) mapId = (enemyDef(o.target)?.habitats || [])[0] || null;
    const route = mapId ? routeTo(game, mapId) : [];
    const v = Math.min(vals[i] ?? 0, o.count || 1);
    return {
      objIndex: i, text: o.text || o.type, done: active && v >= (o.count || 1), count: o.count || 1, value: v, type: o.type,
      mapId, mapName: mapId ? mapInfo(mapId).name : null, npcId, npcName, npcMapId, targetName: objTargetName(o), targetId: o.target,
      route, nextPortal: route.length > 1 ? portalTo(game, route[1]) : null,
    };
  });
}
/** 追跡中ミッション（state.trackedMission → 進行中の先頭）の次の目的地 */
export function trackedMissionId(game) {
  const act = game?.state?.missions?.active || [];
  const t = game?.state?.trackedMission;
  if (t && act.includes(t)) return t;
  return act[0] || null;
}
export function trackedGuide(game) {
  if (has('guide', 'trackedGuide')) {
    const r = call('guide', 'trackedGuide', [game], undefined);
    if (r !== undefined) return r;
  }
  const id = trackedMissionId(game);
  if (!id) return null;
  const complete = guard('isComplete', () => game.missions?.isComplete?.(id), false);
  const list = missionGuide(game, id);
  let g = complete ? null : list.find((e) => !e.done && !(e.type === 'talk' && e.npcId === (missionDef(id)?.turnIn || missionDef(id)?.giver)));
  if (!g) {
    const m = missionDef(id);
    const npc = m?.turnIn || m?.giver;
    const mapId = MISSION_NPCS[npc]?.mapId;
    const route = mapId ? routeTo(game, mapId) : [];
    g = { objIndex: -1, text: `${MISSION_NPCS[npc]?.name || npc} に報告`, mapId, mapName: mapId ? mapInfo(mapId).name : null, npcId: npc, npcName: MISSION_NPCS[npc]?.name, npcMapId: mapId, route, nextPortal: route.length > 1 ? portalTo(game, route[1]) : null, type: 'talk' };
  }
  return { ...g, missionId: id };
}
export function setTracked(game, id) {
  if (!game?.state) return;
  game.state.trackedMission = id;
  call('guide', 'setTracked', [game, id], null);
}

// ---------------- 設定 ----------------
const SETTINGS_KEY = 'nvs_settings';
export const DEFAULT_SETTINGS = { fx: 1, dmgMerge: false, bgm: 0.8, se: 0.9, master: 0.8 };
export function loadSettings(game) {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { s = {}; }
  const out = { ...DEFAULT_SETTINGS, ...(game?.settings || {}), ...s };
  if (game) game.settings = out;
  return out;
}
export function saveSettings(game) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(game.settings || {})); } catch { /* ignore */ }
}

import { audio } from '../audio/audio.js';
/** 設定を各所へ反映（音量は audio.setVolumes、エフェクト濃さ等は game.settings を各担当が参照） */
export function applySettings(game) {
  const s = game?.settings;
  if (!s) return;
  guard('audio.setVolumes', () => audio?.setVolumes?.({ bgm: s.bgm, se: s.se, master: s.master }));
  s.fxLevel = s.fx >= 1 ? 'full' : s.fx >= 0.5 ? 'half' : 'min';
}
