// エリートの詞（data/monsters.js の ELITE_AFFIXES）のうち、combat.js に無い動き。
// 選び方（pickAffixes）: 区域のレベルで数が増える（〜29: 1 / 30〜49: 2 / 50〜59: 3 / 60〜: 4）。
//   攻めは 3 つまで、守り・妨害は 1 つずつまで。ex に書いた組み合わせは付かない（避けられない死につながる組を除く）。
// 見た目の出来事: { t: 'eliteShield', unit, on: bool } / { t: 'teleport', unit, from, to } / { t: 'chain', pts, el, enemy: true }

import { unitHooks } from '../../combat.js';
import { ELITE_AFFIXES } from '../../../data/monsters.js';
import { telegraph, spawnAdds, heroAlive } from './util.js';

const AFF = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));
const CAT_MAX = { atk: 3, def: 1, ctl: 1 };

/** 詞の数（区域のレベルで決まる。群れの長は +1） */
export function affixCount(level, leader = false) {
  const n = level < 30 ? 1 : level < 50 ? 2 : level < 60 ? 3 : 4;
  return Math.min(4, n + (leader && level >= 10 ? 1 : 0));
}

/** 規則を守って n 個選ぶ */
export function pickAffixes(rng, n, level = 1) {
  const out = [];
  const cats = { atk: 0, def: 0, ctl: 0 };
  // 序盤（Lv 10 未満）は妨害系を付けない
  let pool = ELITE_AFFIXES.filter((a) => level >= 10 || a.cat !== 'ctl');
  while (out.length < n && pool.length) {
    const a = rng.pick(pool);
    pool = pool.filter((x) => x !== a);
    if (cats[a.cat] >= CAT_MAX[a.cat]) continue;
    if (out.some((id) => (AFF[id].ex || []).includes(a.id) || (a.ex || []).includes(id))) continue;
    out.push(a.id);
    cats[a.cat]++;
  }
  return out;
}

unitHooks.onSpawn.push((c, u) => {
  if (!u.elite?.length) return;
  const f = u.flags;
  u._et = {};
  for (const k of ['teleporter', 'shielding', 'mortar', 'plagued', 'jailer', 'horde']) if (f[k]) u._et[k] = f[k] * c.rng.range(0.4, 0.9);
  if (f.horde) u._et.horde = 1.5;
});

unitHooks.onMonsterTick.push((c, u, dt) => {
  const et = u._et;
  if (!et || u.dead || u.ctl) return;
  const h = heroAlive(c);
  if (!h) return;
  const f = u.flags;
  if (u._shieldT > 0) { u._shieldT -= dt; if (u._shieldT <= 0) c.emit({ t: 'eliteShield', unit: u, on: false }); }
  for (const k in et) {
    et[k] -= dt;
    if (et[k] > 0) continue;
    et[k] = f[k];
    const d = Math.abs(h.x - u.x);
    if (k === 'teleporter') {
      if (d > 160 && d < 1000) { const from = u.x; u.x = h.x + 85 * (u.x > h.x ? 1 : -1); c.emit({ t: 'teleport', unit: u, from, to: u.x }); u.atkT = Math.min(u.atkT, 0.4); }
    } else if (k === 'shielding') {
      u._shieldT = 2; c.emit({ t: 'eliteShield', unit: u, on: true });
      c.emit({ t: 'text', x: u.x, y: u.y, z: 110 * u.size, text: '結界', color: '#a0d0ff' });
    } else if (k === 'mortar') {
      if (d < 950) { telegraph(c, u, { x: h.x, y: h.y, r: 90, delay: 1.3, mult: 0.7, el: u.element === 'phys' ? 'fire' : u.element, art: 'fx.enemy.mortar' }); c.emit({ t: 'mortar', unit: u, x1: u.x, x2: h.x, y: h.y, delay: 1.3, el: 'fire' }); }
    } else if (k === 'plagued') {
      if (d < 900) telegraph(c, u, { x: h.x, y: h.y, r: 100, delay: 0.6, dur: 5, tick: 0.5, mult: 0.08, el: 'poison', art: 'fx.enemy.pool' });
    } else if (k === 'jailer') {
      if (d < 900) telegraph(c, u, { x: h.x, y: h.y, r: 70, delay: 1.2, mult: 0, el: 'void', art: 'fx.enemy.jail', onFire: (hit, hh) => { if (hit) c.addStatus(hh, 'stun', { dur: 0.9 }); } });
    } else if (k === 'horde') {
      spawnAdds(c, u, 1, null, { max: 4, spread: 100 });
    }
  }
});

unitHooks.onMonsterHit.push((c, u, hit) => {
  const f = u.flags;
  if (!f) return;
  if (u._shieldT > 0) hit.dmg *= 0.15;
  if (f.stalwart) hit.dmg = Math.min(hit.dmg, u.maxLife * f.stalwart);
  if (f.electrified && !hit.dot && (u._elT || 0) <= c.time && c.rng.chance(f.electrified)) { // 継続ダメージの刻みでは雷を返さない
    u._elT = c.time + 0.6;
    const h = heroAlive(c);
    if (h) {
      c.damageAlly(h, u.dmg * 0.4, 'lightning', u);
      c.emit({ t: 'chain', pts: [{ x: u.x, y: u.y, z: 60 }, { x: h.x, y: h.y, z: 60 }], el: 'lightning', enemy: true });
    }
  }
});
