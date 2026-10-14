// 伝説の力を書くための道具（発動ダメージ・範囲・連鎖・回復・障壁・待ち時間）。
// 力の形は registry.definePower。ここでは「どの山（pool）に入るか」「分類（攻め/守り/補助）」「付く部位」を足して登録する。
//
// pool: 'legendary'（レジェンダリーに付く・極意に登録できる）| 'unique' | 'set' | 'mythic' | 'lgem'（深淵の宝石）
// cat:  'atk'（攻め）| 'def'（守り）| 'util'（補助）… 極意の 3 枠の分類
// slots: 付く部位（ベースの slot）。cls: クラス専用（スマートドロップで出やすい）

import { registry } from '../../registry.js';
import { incFor } from '../../character.js';
import { statusDefs } from '../../combat.js';

export const SL = {
  W: ['weapon'],
  O: ['offhand'],
  WO: ['weapon', 'offhand'],
  A: ['helm', 'chest', 'gloves', 'belt', 'legs', 'boots'],
  J: ['amulet', 'ring'],
};
SL.AJ = [...SL.A, ...SL.J];
SL.ALL = [...SL.WO, ...SL.AJ];
SL.WJ = [...SL.W, ...SL.J];
SL.OA = [...SL.O, ...SL.A];

/** 山ごとの力の id */
export const POOLS = { legendary: [], unique: [], set: [], mythic: [], lgem: [], skill: [] };

export const CAT_NAMES = { atk: '攻め', def: '守り', util: '補助' };

/** 力を登録する（registry.definePower に分類を足す） */
export function power(def) {
  const d = registry.definePower({ pool: 'legendary', cat: 'atk', slots: SL.ALL, hooks: {}, ...def });
  (POOLS[d.pool] ||= []).push(d.id);
  return d;
}

/** 表示用の数（整数は整数、小さい数は小数 1 桁） */
export function n(v) {
  const a = Math.abs(v);
  if (a >= 20 || Number.isInteger(v)) return String(Math.round(v));
  return String(Math.round(v * 10) / 10);
}

// ---------------- 戦闘の道具
const PROC_TAGS = ['proc'];
const procCache = new Map();
/** 発動ダメージ用のスキルの数値（武器ダメージの pct%） */
export function procP(id, pct, el = 'phys', tags = PROC_TAGS) {
  const key = `${id}|${pct}|${el}|${tags.join(',')}`;
  let p = procCache.get(key);
  if (!p) {
    p = { id: `proc_${id}`, dmgPct: pct, dmgMul: 1, tags: tags === PROC_TAGS ? PROC_TAGS : ['proc', ...tags], element: el, extra: {}, basic: false, lvl: 1 };
    if (procCache.size > 4000) procCache.clear();
    procCache.set(key, p);
  }
  return p;
}

/** 1 体に武器ダメージの pct% を当てる（ほかの力は発動しない） */
export function procHit(c, target, pct, el = 'phys', id = 'hit', tags) {
  if (!target || target.dead || !c.hero) return 0;
  return c.hitUnit(c.hero, target, procP(id, pct, el, tags), 1, { noProc: true, element: el });
}

/** (x, y) の周り r に武器ダメージの pct% */
export function procNova(c, x, y, r, pct, el = 'phys', id = 'nova', o = {}) {
  if (!c.hero) return 0;
  const hits = c.enemiesNear(x, y, r);
  const p = procP(id, pct, el, ['area']);
  for (const u of hits) {
    c.hitUnit(c.hero, u, p, 1, { noProc: true, element: el, aoeHit: true });
    if (o.status && !u.dead) c.addStatus(u, o.status, { dur: o.dur });
  }
  c.emit({ t: 'nova', x, y, r, el, skill: o.skill, small: !o.big });
  return hits.length;
}

/** from から近くの敵へ n 回跳ねる */
export function procChain(c, from, count, pct, el = 'lightning', id = 'chain') {
  if (!c.hero || !from) return;
  const hit = new Set([from.id]);
  const pts = [{ x: from.x, y: from.y, z: (from.z || 0) + 40 }];
  let cur = from;
  for (let i = 0; i < count; i++) {
    const nx = c.nearestEnemy(cur.x, cur.y, 340, (u) => !hit.has(u.id));
    if (!nx) break;
    hit.add(nx.id);
    procHit(c, nx, pct, el, id);
    pts.push({ x: nx.x, y: nx.y, z: (nx.z || 0) + 40 * (nx.size || 1) });
    cur = nx;
  }
  if (pts.length > 1) c.emit({ t: 'chain', pts, el });
}

/** 敵に決まった量のダメージ（耐性・感電は効く）。死体の爆発など */
export function rawHit(c, target, amount, el = 'phys') {
  if (!target || target.dead || !(amount > 0)) return 0;
  const res = Math.max(-100, Math.min(90, (target.res?.[el] || 0) - (c.H?.resPen || 0)));
  let dmg = amount * (1 - res / 100);
  if (target.statuses.shock?.t > 0) dmg *= 1 + statusDefs.shock.taken;
  dmg *= 1 - (target.dr || 0);
  target.life -= dmg;
  target.hitFlash = 0.1;
  c.stats.dmgDone += dmg;
  c.emit({ t: 'dmg', x: target.x, y: target.y, z: target.z + 70 * target.size, v: dmg, el, team: target.team });
  if (target.life <= 0) c.killUnit(target, c.hero);
  return dmg;
}

/** 武器ダメージの平均（増加・最終倍率込み）。継続ダメージの基準に使う */
export function wdmg(c, el = 'phys', tags = []) {
  const H = c.H;
  if (!H) return 0;
  const w = (H.weapon.min + H.weapon.max) / 2 + H.addTotal;
  return w * (1 + incFor(H, el, tags) / 100) * H.more;
}

export function heal(c, amount) {
  const h = c.hero;
  if (!h || h.dead || !(amount > 0)) return;
  h.life = Math.min(h.maxLife, h.life + amount);
}

export function lifePct(c, pct) { return (c.hero?.maxLife || 0) * pct / 100; }

/** 力ごとの一時的な記憶（戦闘ごと） */
export function mem(c, key) {
  c._pwMem ||= {};
  return (c._pwMem[key] ||= {});
}

/** key の待ち時間が sec 秒たっていれば true を返して時計を戻す */
export function every(c, key, sec) {
  c._pwT ||= {};
  const last = c._pwT[key];
  if (last === undefined || c.time - last >= sec || c.time < last) { c._pwT[key] = c.time; return true; }
  return false;
}
/** 待ち時間が明けているか（使わずに確かめる） */
export function ready(c, key, sec) {
  const last = c._pwT?.[key];
  return last === undefined || c.time - last >= sec || c.time < last;
}

export const isHero = (c, u) => u && u === c.hero;
export const has = (p, tag) => !!p?.tags?.includes(tag);
export const lifeRatio = (u) => (u.maxLife > 0 ? u.life / u.maxLife : 0);

/** 主人公の前にいる敵の数（0.25 秒ごとに数え直す） */
export function enemyCount(c) {
  const m = mem(c, '_count');
  if (m.t === undefined || c.time - m.t > 0.25 || c.time < m.t) {
    m.t = c.time;
    let k = 0; let minions = 0;
    for (const u of c.units) { if (u.dead) continue; if (u.team === 'enemy') k++; else if (u.kind === 'minion') minions++; }
    m.n = k; m.minions = minions;
  }
  return m;
}

/** 主人公から一番近い敵（前方優先） */
export function frontEnemy(c, maxR = 900) {
  const h = c.hero;
  if (!h) return null;
  return c.nearestEnemy(h.x, h.y, maxR, (u) => u.x > h.x - 120) || c.nearestEnemy(h.x, h.y, maxR);
}

/** 弾を撃つ（主人公側）。target が無ければ前へ */
export function shoot(c, target, pct, el, id, o = {}) {
  const h = c.hero;
  if (!h) return null;
  const ang = o.angle ?? (target ? Math.atan2((target.y - h.y) * 2, target.x - h.x) : 0);
  return c.spawnProj({ src: h, team: 'hero', x: (o.x ?? h.x) + 20, y: o.y ?? h.y, z: o.z ?? 70, angle: ang, speed: o.speed || 1000, p: procP(id, pct, el, o.tags || ['projectile']), pierce: o.pierce || 0, range: o.range || 800, art: o.art, explode: o.explode || 0 });
}

/** 遅れて爆発する範囲（主人公側） */
export function blast(c, x, y, r, pct, el, id, o = {}) {
  return c.spawnArea({ team: 'hero', x, y, r, delay: o.delay ?? 0.4, dur: o.dur || 0, tick: o.tick || 0, p: procP(id, pct, el, o.tags || ['area']), src: c.hero, art: o.art, status: o.status });
}
