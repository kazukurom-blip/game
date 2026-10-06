// 他担当モジュールへの安全なアクセス層。
// 名前空間 import にしているので、相手側に export が欠けていても読み込みエラーにならない。
// 呼び出しはすべて try/catch でガードし、失敗時は簡易フォールバックで描画する。
import * as CharM from '../render/character.js';
import * as IconM from '../render/icons.js';
import * as ItemsM from '../data/items.js';
import * as SkillsD from '../data/skills.js';
import * as MissD from '../data/missions.js';
import * as ProgM from '../systems/progression.js';
import * as InvM from '../systems/inventory.js';
import * as SkillS from '../systems/skills.js';
import * as LootM from '../systems/loot.js';
import * as CombatM from '../systems/combat.js';
import { RARITY_FALLBACK, rrPath, txt, rgba } from './theme.js';

const warned = new Set();
export function guard(tag, fn, fb) {
  try {
    const v = fn();
    return v === undefined ? fb : v;
  } catch (e) {
    if (!warned.has(tag)) { warned.add(tag); console.warn('[ui] ' + tag + ' failed:', e); }
    return fb;
  }
}

export const HERO_NAMES = { luna: 'ルナ', jin: 'ジン' };

// ---- データ ----
export function getItemDef(id) {
  if (!id) return null;
  if (typeof id === 'object') return id;
  return guard('getItem', () => (typeof ItemsM.getItem === 'function' ? ItemsM.getItem(id) : null) || ItemsM.ITEMS?.[id] || null, null);
}
export function allItems() { return ItemsM.ITEMS || {}; }
export function starterEquip(heroId) { return ItemsM.STARTER_EQUIP?.[heroId] || null; }
export function allSkills() { return SkillsD.SKILLS || {}; }
export function skillDef(id) { return id ? (SkillsD.SKILLS?.[id] || null) : null; }
export function missionNpcName(id) { return MissD.MISSION_NPCS?.[id]?.name || null; }
export function turnInNpc(m) { return m?.turnIn || m?.giver; }
export function sellPriceOf(it) {
  if (!it) return 0;
  if (typeof InvM.sellPrice === 'function') { const v = guard('sellPrice', () => InvM.sellPrice(it.id), null); if (v != null) return v; }
  return it.sellPrice ?? Math.max(1, Math.floor((it.price || 0) * 0.3));
}
export function allMissions() { return MissD.MISSIONS || {}; }
export function missionDef(id) {
  if (!id) return null;
  if (typeof id === 'object') return id;
  return MissD.MISSIONS?.[id] || null;
}
export function rarityInfo(r) {
  const R = LootM.RARITY?.[r];
  const F = RARITY_FALLBACK[r] || RARITY_FALLBACK.common;
  const color = R?.color || F.color;
  // mythic は（RARITY 側に2色目が無ければ）フォールバックのグラデ2色目を使う
  const color2 = R?.color2 || ((r === 'mythic' || r === 'pet') ? (F.color2 || '#3EE6D2') : null);
  return { name: R?.name || F.name, color, color2, rainbow: r === 'pet' || !!R?.rainbow };
}
export function skillMp(skill, lv) {
  return guard('skill.mp', () => (typeof skill.mp === 'function' ? skill.mp(Math.max(1, lv)) : (skill.mp || 0)), 0);
}
export function skillCd(skill, lv) {
  return guard('skill.cd', () => (typeof skill.cooldown === 'function' ? skill.cooldown(Math.max(1, lv)) : (skill.cooldown || 0)), 0);
}

// ---- 進行 ----
let statCache = { key: null, val: null };
export function stats(game) {
  const st = game?.state;
  if (!st) return {};
  const key = (game.ui?.frame ?? 0) + ':' + game.time + ':' + st.level;
  if (statCache.key === key && statCache.st === st) return statCache.val;
  let v = guard('computeStats', () => (typeof ProgM.computeStats === 'function' ? ProgM.computeStats(st) : null), null);
  if (!v) v = game.player?.stats || { maxHp: Math.max(st.hp || 1, 100), maxMp: Math.max(st.mp || 1, 50) };
  statCache = { key, st, val: v };
  return v;
}
export function computeStatsRaw(state) {
  return guard('computeStats', () => (typeof ProgM.computeStats === 'function' ? ProgM.computeStats(state) : null), null);
}
// ---- ダメージの幅（能力画面・装備比較で使う） ----
// 通常攻撃の倍率（entities/player.js startAttack と同じ: 魔法弾 1.1、それ以外 1）
export function basicAttackMult(cs) { return cs?.weaponType === 'magic' ? 1.1 : 1; }
/**
 * dmgRange(cs, mult?) → {lo, hi, critLo, critHi, crit, critDmg}
 * 防御0の相手に通常攻撃1発を当てたときのダメージの幅。
 * 実際の計算（systems/combat.js calcDamage）を、乱数を最小（0）と最大（1 の手前）に固定して呼んで求める。
 * calcDamage の式（atk × 倍率 × (0.9〜1.1) × クリ倍率 → 四捨五入）が変わっても表示がずれない。
 */
export function dmgRange(cs, mult) {
  if (!cs) return null;
  const atk = cs.atk || 0, m = mult ?? basicAttackMult(cs), cd = cs.critDmg || 1.5;
  const calc = CombatM.calcDamage;
  const fb = (r, c) => Math.max(1, Math.round(atk * m * (0.9 + r * 0.2) * (c ? cd : 1)));
  const at = (r, c) => {
    if (typeof calc !== 'function') return fb(r, c);
    const rnd = Math.random;
    Math.random = () => r; // 同期処理の間だけ乱数を固定（finally で必ず戻す）
    try { return calc(atk, m, 0, c ? 1 : 0, cd).dmg; } catch { return fb(r, c); } finally { Math.random = rnd; }
  };
  const top = 1 - 1e-9;
  return { lo: at(0, false), hi: at(top, false), critLo: at(0, true), critHi: at(top, true), crit: cs.crit || 0, critDmg: cd };
}
export function fmtRange(r, crit = false) {
  if (!r) return '-';
  const a = crit ? r.critLo : r.lo, b = crit ? r.critHi : r.hi;
  return a === b ? a.toLocaleString('en-US') : `${a.toLocaleString('en-US')}〜${b.toLocaleString('en-US')}`;
}
/** 装備を付け替えたと仮定したステータス（inst は持ち物のエントリ。★・潜在も反映） */
export function statsWithEquip(state, it, inst) {
  if (!state || !it?.slot) return null;
  const st2 = { ...state, equipped: { ...(state.equipped || {}), [it.slot]: it.id } };
  if (state.equippedInst) st2.equippedInst = { ...state.equippedInst, [it.slot]: inst && inst.id === it.id ? inst : null };
  return computeStatsRaw(st2);
}
/** AP を振ったと仮定したステータス（能力画面の＋ボタンのプレビュー） */
export function statsWithAp(state, k, n = 1) {
  if (!state) return null;
  return computeStatsRaw({ ...state, stats: { ...(state.stats || {}), [k]: ((state.stats || {})[k] || 0) + n } });
}

// ---- 売却 ----
/** 持ち物のエントリ s の売値（1個あたり。装備は ★・潜在込み） */
export function sellPriceEntry(s) {
  const it = getItemDef(s?.id);
  if (!it) return 0;
  if (s.uid && typeof InvM.sellPriceInst === 'function') { const v = guard('sellPriceInst', () => InvM.sellPriceInst(s), null); if (v != null) return v; }
  return sellPriceOf(it);
}
/** doSell(game, s, qty) → {ok, msg, gain}。装備は uid でその1個を、消費・その他は個数ぶん売る */
export function doSell(game, s, qty = 1) {
  const st = game.state, it = getItemDef(s?.id);
  if (!it) return { ok: false, msg: 'アイテムが見つかりません' };
  const m0 = st.money || 0;
  if (typeof InvM.sellItem === 'function') {
    const r = guard('sellItem', () => InvM.sellItem(game, s.uid ? s.uid : s.id, s.uid ? 1 : qty), null);
    if (r) return { ...r, gain: (st.money || 0) - m0 };
  }
  const n = s.uid ? 1 : qty;
  if (doRemoveItem(st, s.uid || s.id, n) === false) return { ok: false, msg: '売却できませんでした' };
  const gain = sellPriceEntry(s) * n;
  st.money = m0 + gain;
  return { ok: true, msg: `${it.name}${n > 1 ? ' x' + n : ''} を売却した（+$${gain}）`, gain };
}

export function expNeed(level) {
  return guard('expToNext', () => (typeof ProgM.expToNext === 'function' ? ProgM.expToNext(level) : null), null)
    ?? Math.floor(20 + 15 * Math.pow(level || 1, 1.7));
}

// ---- インベントリ ----
export function countItem(state, id) {
  const f = InvM.countItem;
  if (typeof f === 'function') { const v = guard('countItem', () => f(state, id), null); if (v != null) return v; }
  let n = 0;
  for (const s of state?.inventory || []) if (s && s.id === id) n += s.qty || 1;
  return n;
}
export function doEquip(game, id) {
  if (typeof InvM.equip === 'function') return guard('equip', () => InvM.equip(game, id), { ok: false, msg: '装備できません' }) || { ok: true };
  // フォールバック（inventory.js 未実装時）
  const st = game.state, it = getItemDef(id);
  if (!it?.slot) return { ok: false, msg: '装備できません' };
  if ((it.reqLevel || 0) > (st.level || 1)) return { ok: false, msg: `Lv.${it.reqLevel} から装備できます` };
  const prev = st.equipped[it.slot];
  fbRemove(st, id, 1);
  if (prev) fbAdd(st, prev, 1);
  st.equipped[it.slot] = id;
  return { ok: true };
}
export function doUnequip(game, slot) {
  if (typeof InvM.unequip === 'function') return guard('unequip', () => InvM.unequip(game, slot), false);
  const st = game.state, id = st.equipped?.[slot];
  if (!id) return false;
  fbAdd(st, id, 1); st.equipped[slot] = null;
  return true;
}
export function doUseItem(game, id) {
  if (typeof InvM.useItem === 'function') return guard('useItem', () => InvM.useItem(game, id), false);
  return false;
}
export function doAddItem(game, id, qty = 1, opts) {
  if (typeof InvM.addItem === 'function') return guard('addItem', () => InvM.addItem(game, id, qty, opts), false);
  return fbAdd(game.state, id, qty);
}
export function doRemoveItem(state, id, qty = 1) {
  if (typeof InvM.removeItem === 'function') return guard('removeItem', () => InvM.removeItem(state, id, qty), false);
  return fbRemove(state, id, qty);
}
function fbAdd(st, id, qty) {
  const it = getItemDef(id);
  st.inventory = st.inventory || [];
  const stack = it && it.type !== 'equip' && !it.slot ? st.inventory.find((s) => s && s.id === id) : null;
  if (stack) { stack.qty = (stack.qty || 1) + qty; return true; }
  if (st.inventory.length >= 48) return false;
  st.inventory.push({ id, qty });
  return true;
}
function fbRemove(st, id, qty) {
  const i = (st.inventory || []).findIndex((s) => s && s.id === id);
  if (i < 0) return false;
  const s = st.inventory[i];
  s.qty = (s.qty || 1) - qty;
  if (s.qty <= 0) st.inventory.splice(i, 1);
  return true;
}
export function equipLooks(state) {
  const v = guard('getEquipLooks', () => (typeof InvM.getEquipLooks === 'function' ? InvM.getEquipLooks(state) : null), null);
  if (v) return v;
  const out = {};
  for (const [slot, id] of Object.entries(state?.equipped || {})) out[slot] = getItemDef(id)?.look || null;
  return out;
}
// NPC等の equip が itemId でも look でも受け付ける
export function looksFrom(equip) {
  const out = {};
  for (const [slot, v] of Object.entries(equip || {})) {
    out[slot] = typeof v === 'string' ? (getItemDef(v)?.look || null) : (v || null);
  }
  return out;
}

// ---- スキル ----
export function cooldown(id) {
  return guard('getCooldown', () => (typeof SkillS.getCooldown === 'function' ? SkillS.getCooldown(id) : null), null) || { left: 0, total: 0 };
}
export function doLearn(game, id) {
  return guard('learnSkill', () => (typeof SkillS.learnSkill === 'function' ? SkillS.learnSkill(game, id) : false), false);
}

// ---- 描画 ----
export function heroLook(id) { return CharM.HERO_LOOKS?.[id] || null; }

export function drawChar(ctx, x, y, look, equip, anim) {
  ctx.save();
  let ok = false;
  if (typeof CharM.drawCharacter === 'function' && look) {
    ok = guard('drawCharacter', () => { CharM.drawCharacter(ctx, x, y, look, equip || {}, anim); return true; }, false);
  }
  ctx.restore();
  if (!ok) {
    // フォールバック: シルエット
    const s = anim?.scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(0, -56, 22, 0, Math.PI * 2); ctx.fill();
    rrPath(ctx, -16, -36, 32, 36, 10); ctx.fill();
    ctx.restore();
  }
}

export function drawItemIco(ctx, item, x, y, size) {
  if (!item) return;
  if (item.slot === 'pet' && typeof OPT.pets?.drawPet === 'function') {
    ctx.save();
    const ok = guard('drawPet.icon', () => { OPT.pets.drawPet(ctx, x, y + size * 0.36, item.look || {}, { t: 0, facing: 1, state: 'idle', scale: size / 52 }); return true; }, false);
    ctx.restore();
    if (ok) return;
  }
  if (typeof IconM.drawItemIcon === 'function') {
    ctx.save();
    const ok = guard('drawItemIcon', () => { IconM.drawItemIcon(ctx, item, x, y, size); return true; }, false);
    ctx.restore();
    if (ok) return;
  }
  const c = item.look?.color || rarityInfo(item.rarity).color;
  ctx.save();
  rrPath(ctx, x - size * 0.38, y - size * 0.38, size * 0.76, size * 0.76, size * 0.18);
  ctx.fillStyle = rgba(c, 0.85); ctx.fill();
  ctx.restore();
  txt(ctx, (item.name || '?').slice(0, 1), x, y + 1, { size: size * 0.42, align: 'center' });
}

export function drawSkillIco(ctx, skill, x, y, size) {
  if (!skill) return;
  if (typeof IconM.drawSkillIcon === 'function') {
    ctx.save();
    const ok = guard('drawSkillIcon', () => { IconM.drawSkillIcon(ctx, skill, x, y, size); return true; }, false);
    ctx.restore();
    if (ok) return;
  }
  ctx.save();
  const g = ctx.createRadialGradient(x, y - size * 0.15, 2, x, y, size * 0.5);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.3, skill.color || '#19d3c5');
  g.addColorStop(1, rgba(skill.color || '#19d3c5', 0.2));
  rrPath(ctx, x - size * 0.42, y - size * 0.42, size * 0.84, size * 0.84, size * 0.2);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  txt(ctx, (skill.name || '?').slice(0, 1), x, y + 1, { size: size * 0.4, align: 'center' });
}

// ======================= v2: ワールド / 図鑑 / SNS / PET =======================
import * as MapsM from '../world/maps.js';
import * as EnemD from '../data/enemies.js';
import * as EnemyArtM from '../render/enemyArt.js';

// 並行開発中のモジュールは動的 import（ファイルが無くても UI 全体は落ちない）
export const OPT = { travel: null, book: null, sns: null, pets: null };
function tryImport(key, path) {
  import(path).then((m) => { OPT[key] = m; }).catch((e) => { console.info('[ui] optional module not loaded:', path, e?.message || e); });
}
tryImport('travel', '../systems/travel.js');
tryImport('book', '../systems/book.js');
tryImport('sns', '../systems/sns.js');
tryImport('pets', '../render/pets.js');

export function allMaps() { return MapsM.MAPS || {}; }
export function allEnemies() { return EnemD.ENEMIES || {}; }
export function enemyDef(id) { return id ? (EnemD.ENEMIES?.[id] || null) : null; }

export function drawEnemyArt(ctx, e) {
  if (typeof EnemyArtM.drawEnemy !== 'function') return false;
  ctx.save();
  const ok = guard('drawEnemy:' + (e?.def?.art || '?'), () => { EnemyArtM.drawEnemy(ctx, e); return true; }, false);
  ctx.restore();
  return ok;
}

export function drawPetArt(ctx, x, y, look, anim) {
  const f = OPT.pets?.drawPet;
  if (typeof f === 'function') {
    ctx.save();
    const ok = guard('drawPet', () => { f(ctx, x, y, look || {}, anim || {}); return true; }, false);
    ctx.restore();
    if (ok) return true;
  }
  // フォールバック: ふわふわの丸いマスコット
  const s = anim?.scale || 1, t = anim?.t || 0, c = look?.color || '#ff8ad8';
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 3) * 3 * s);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 2, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(-5, -22, 2, 0, -16, 20);
  g.addColorStop(0, '#fff'); g.addColorStop(0.35, c); g.addColorStop(1, look?.accent || '#7b2ff7');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -16, 17, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#1a1440';
  ctx.beginPath(); ctx.arc(-6, -18, 2.6, 0, Math.PI * 2); ctx.arc(6, -18, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,170,0.7)';
  ctx.beginPath(); ctx.arc(-10, -12, 3, 0, Math.PI * 2); ctx.arc(10, -12, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return false;
}

// ---- 地域 ----
export const REGIONS = [
  { id: 'beach', name: 'ビーチ', color: '#ffb347' },
  { id: 'downtown', name: 'ダウンタウン', color: '#ff5fa2' },
  { id: 'slums', name: 'ポート・スラム', color: '#4fc3c8' },
  { id: 'swamp', name: 'スワンプ', color: '#6fdc5a' },
  { id: 'casino', name: 'カジノ', color: '#ffd447' },
  { id: 'rooftop', name: 'ヴァイス・タワー', color: '#b77bff' },
  { id: 'spaceport', name: 'ルミナ宇宙港', color: '#5ee8ff' },
  // v4: 第2ワールド「ネオン・アーク」
  { id: 'arkcity', name: 'アーク・シティ', color: '#19f0ff', world: 2 },
  { id: 'cyberwild', name: 'サイバー・ワイルド', color: '#5cff9a', world: 2 },
  { id: 'abyss', name: 'ネオン・アビス', color: '#4f8dff', world: 2 },
  { id: 'zenith', name: 'ゼニス・タワー', color: '#ffe69a', world: 2 },
  { id: 'police', name: '警察', color: '#5f8cff', noMap: true },
];
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const PREFIX_REGION = { beach: 'beach', down: 'downtown', downtown: 'downtown', slums: 'slums', swamp: 'swamp', casino: 'casino', tower: 'rooftop', rooftop: 'rooftop', space: 'spaceport', spaceport: 'spaceport' };
// v4: 第2ワールドの ID（w2_<地域>_...）
const W2_PREFIX_REGION = { arkcity: 'arkcity', cyberwild: 'cyberwild', abyss: 'abyss', zenith: 'zenith' };
export function regionOfMap(id) {
  const m = allMaps()[id];
  const mi = travelInfo(id);
  const parts = String(id).split('_');
  return mi?.region || m?.region || (parts[0] === 'w2' ? W2_PREFIX_REGION[parts[1]] : PREFIX_REGION[parts[0]]) || m?.theme || 'downtown';
}
export function regionColor(r) { return REGION_BY_ID[r]?.color || '#cfc8ff'; }

// ---- travel.js ----
function travelInfo(id) {
  const MI = OPT.travel?.MAP_INFO;
  if (!MI) return null;
  if (Array.isArray(MI)) return MI.find((m) => m && m.id === id) || null;
  return MI[id] || null;
}
// 町/フィールドの情報を統合して返す
export function mapInfo(id) {
  const m = allMaps()[id] || {};
  const mi = travelInfo(id) || {};
  const lr = mi.levelRange || mi.lv || m.levelRange || (mi.minLv != null ? [mi.minLv, mi.maxLv] : null);
  return {
    id,
    name: mi.name || m.name || id,
    region: regionOfMap(id),
    town: !!(mi.town ?? m.town),
    levelRange: Array.isArray(lr) ? lr : null,
    boss: mi.boss || m.boss || null,
    deadEnd: !!(mi.deadEnd || m.deadEnd),
    enemies: mi.enemies || mi.monsters || null,
    exists: !!allMaps()[id],
  };
}
// 隣接グラフ {id: Set(neighborIds)}
export function worldGraph() {
  const adj = {};
  const add = (a, b) => {
    if (!a || !b || a === b) return;
    (adj[a] = adj[a] || new Set()).add(b);
    (adj[b] = adj[b] || new Set()).add(a);
  };
  const G = OPT.travel?.WORLD_GRAPH;
  if (G) {
    guard('WORLD_GRAPH', () => {
      if (Array.isArray(G)) {
        for (const e of G) {
          if (Array.isArray(e)) add(e[0], e[1]);
          else if (e && (e.a || e.from)) add(e.a || e.from, e.b || e.to);
        }
      } else {
        for (const [k, v] of Object.entries(G)) {
          const list = Array.isArray(v) ? v : (v?.links || v?.neighbors || v?.to || []);
          for (const n of list) add(k, typeof n === 'string' ? n : (n?.to || n?.id));
        }
      }
    });
  }
  if (!Object.keys(adj).length) {
    // フォールバック: MAPS の portals から推測
    for (const [id, m] of Object.entries(allMaps())) {
      adj[id] = adj[id] || new Set();
      for (const p of m.portals || []) if (p?.to && allMaps()[p.to]) add(id, p.to);
    }
  }
  for (const id of Object.keys(allMaps())) adj[id] = adj[id] || new Set();
  return adj;
}
export function hopDistance(adj, a, b) {
  if (a === b) return 0;
  const seen = new Set([a]);
  let frontier = [a], d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const n of frontier) for (const m of adj[n] || []) {
      if (m === b) return d;
      if (!seen.has(m)) { seen.add(m); next.push(m); }
    }
    frontier = next;
  }
  return 6;
}
export function taxiFareOf(game, id) {
  const f = OPT.travel?.taxiFare;
  if (typeof f === 'function') {
    const v = guard('taxiFare', () => f(game, id), null);
    if (typeof v === 'number') return v;
    if (v && typeof v.fare === 'number') return v.fare;
  }
  const adj = worldGraph();
  const d = hopDistance(adj, game.state?.mapId || game.map?.id, id);
  return Math.round(50 + d * 12 * Math.max(1, game.state?.level || 1));
}
// タクシー可否 → {ok, msg}
export function taxiCheck(game, id) {
  const f = OPT.travel?.canTaxi;
  if (typeof f === 'function') {
    const r = guard('canTaxi', () => f(game, id), null);
    if (r && typeof r === 'object') return { ok: r.ok !== false, msg: r.msg || '' };
  }
  const fare = taxiFareOf(game, id);
  if ((game.state?.money || 0) < fare) return { ok: false, msg: '所持金が足りません' };
  return { ok: true, msg: '' };
}
// → {ok, msg}
export function doTaxi(game, id) {
  const f = OPT.travel?.taxiTravel;
  if (typeof f === 'function') {
    const r = guard('taxiTravel', () => f(game, id), { ok: false, msg: 'タクシーが捕まらない…' });
    if (r === false) return { ok: false, msg: '移動できません' };
    if (r && typeof r === 'object') return { ok: r.ok !== false, msg: r.msg };
    return { ok: true };
  }
  // フォールバック
  const fare = taxiFareOf(game, id);
  const st = game.state;
  if ((st.money || 0) < fare) return { ok: false, msg: '所持金が足りません' };
  if (!allMaps()[id] || typeof game.changeMap !== 'function') return { ok: false, msg: '移動できません' };
  st.money -= fare;
  guard('changeMap', () => game.changeMap(id));
  return { ok: true };
}
export function visitedSet(game) {
  const s = new Set(Array.isArray(game.state?.visited) ? game.state.visited : Object.keys(game.state?.visited || {}));
  const cur = game.state?.mapId || game.map?.id;
  if (cur) s.add(cur);
  return s;
}

// ---- 図鑑 ----
export function bookKills(state, id) { const v = state?.book?.[id]; return typeof v === 'number' ? v : (v?.kills || 0); }
export function bookList(state) {
  const f = OPT.book?.bookEntries;
  let raw = null;
  if (typeof f === 'function') raw = guard('bookEntries', () => f(state), null);
  if (raw && !Array.isArray(raw)) raw = Object.values(raw);
  if (!raw || !raw.length) raw = Object.values(allEnemies()).filter((d) => d && !d.civilian && d.ai !== 'civilian' && d.art !== 'civilian');
  const out = [];
  for (const e of raw) {
    if (!e) continue;
    const def = e.def || (e.art || e.hp != null ? e : null) || enemyDef(e.id || e.enemyId) || null;
    const id = e.id || e.enemyId || def?.id;
    if (!id) continue;
    const habitats = e.habitats || def?.habitats || [];
    const region = e.region || def?.region || (habitats[0] ? regionOfMap(habitats[0]) : null) || 'beach';
    out.push({ id, def: def || { id, name: e.name || id }, name: e.name || def?.name || id, level: e.level ?? def?.level, region, habitats, drops: e.drops || def?.drops || [], boss: !!(e.boss || def?.boss), no: e.no ?? out.length + 1, rankName: e.rankName, nextRank: e.nextRank });
  }
  return out;
}
export function bookRankOf(kills) {
  const f = OPT.book?.bookRank;
  if (typeof f === 'function') { const v = guard('bookRank', () => f(kills), null); if (v != null) return v; }
  return kills >= 100 ? 3 : kills >= 50 ? 2 : kills >= 10 ? 1 : 0;
}
export function bookBonusOf(state) {
  const f = OPT.book?.bookBonus;
  if (typeof f === 'function') return guard('bookBonus', () => f(state), null);
  return null;
}
// 図鑑・ドロップ表示用: そのアイテムを入手したことがあるか
export function itemKnown(state, id) {
  if (!state || !id) return false;
  for (const k of ['itemsFound', 'obtained', 'itemsSeen', 'seenItems', 'itemLog', 'bookItems', 'rareFound']) {
    const v = state[k];
    if (Array.isArray(v) && v.includes(id)) return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && v[id]) return true;
  }
  if ((state.inventory || []).some((s) => s && s.id === id)) return true;
  if (Object.values(state.equipped || {}).includes(id)) return true;
  return false;
}

// ---- SNS ----
export function snsTitleOf(state) {
  const f = OPT.sns?.snsTitle;
  let v = typeof f === 'function' ? guard('snsTitle', () => f(state), null) : null;
  if (v && typeof v === 'object') return { name: v.name || v.title || '', color: v.color || null };
  if (typeof v === 'string') return { name: v, color: null };
  const n = state?.sns?.followers || 0;
  const T = [[1000000, 'ヴァイスの伝説'], [100000, 'トップインフルエンサー'], [10000, '人気インフルエンサー'], [1000, '話題の新星'], [100, 'ちょっと有名人'], [0, '一般人']];
  for (const [th, name] of T) if (n >= th) return { name, color: null };
  return { name: '', color: null };
}
