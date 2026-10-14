// ワールド担当の小道具: 遅れて起きる出来事の予定表・予告つきの地面の攻撃・手下の呼び出し・敵の「操作中」状態。
//
// 予定表: sched(c, 秒, fn) … c.time が来たら fn() を呼ぶ（WorldSystem.tick が runSched で回す。ステージが変わると捨てる）
// 予告: telegraph(c, u, { x, y, r, delay, mult, el, art, dur, tick, onFire }) … 地面に警告の円 → delay 秒後にダメージ
// 操作中: u.ctl = { kind, t, ... } … 突進・潜行・逃走などの間は combat の普通の動きを止める（u.windup を大きくしておく）

import { MONSTER } from '../../../data/monsters.js';

/** 予定を足す */
export function sched(c, delay, fn) {
  (c._wq ||= []).push({ at: c.time + Math.max(0, delay), fn });
}

/** 予定を回す（WorldSystem.tick から） */
export function runSched(c) {
  const q = c._wq;
  if (!q || !q.length) return;
  const now = c.time;
  // 先に入れ替えておく（fn の中で足された予定は新しい配列に入る）
  c._wq = [];
  for (const e of q) {
    if (e.at <= now) { try { e.fn(); } catch (err) { console.error('[world:sched]', err); } } else c._wq.push(e);
  }
}

/** 予定を全部捨てる */
export function clearSched(c) { if (c._wq) c._wq.length = 0; }

export const heroAlive = (c) => (c.hero && !c.hero.dead ? c.hero : null);
export const near = (a, b, r) => !!a && !!b && Math.abs(a.x - b.x) <= r && Math.abs((a.y || 0) - (b.y || 0)) <= r * 0.75;

/** 敵の属性（物理なら代わりの属性） */
export function abilityEl(u, fallback = 'fire') { return u.element && u.element !== 'phys' ? u.element : fallback; }

/** 予告つきの地面の攻撃。mult は u.dmg に掛ける。onFire(hit: 主人公が範囲にいたか) */
export function telegraph(c, u, o) {
  const delay = o.delay ?? 0.8;
  c.spawnArea({ team: 'enemy', x: o.x, y: o.y ?? 0, r: o.r || 90, delay, dur: o.dur || 0, tick: o.tick || 0, dmg: (o.mult || 0) * (u?.dmg || 0), el: o.el || 'phys', src: u, art: o.art || 'fx.enemy.area' });
  if (o.onFire) {
    sched(c, delay, () => {
      const h = heroAlive(c);
      const hit = !!h && Math.abs(h.x - o.x) <= (o.r || 90) && Math.abs(h.y - (o.y ?? 0)) <= (o.r || 90) * 0.75;
      o.onFire(hit, h);
    });
  }
}

/** 頭の上に文字（技の名前など） */
export function say(c, u, text, color = '#ffb080') {
  c.emit({ t: 'text', x: u.x, y: u.y, z: (u.z || 0) + 120 * (u.size || 1), text, color });
}

/** 今の難しさ（苦行・裂け目の倍率） */
export function diffOf(c) {
  try { return c.game.sys.world.difficulty(); } catch { return { life: 1, dmg: 1 }; }
}

/** 手下を呼ぶ。ids の中から選ぶ（無ければ今の地域の敵）。報酬は少なめ（呼び出しで稼げないように） */
export function spawnAdds(c, u, n, ids = null, { max = 5, spread = 140 } = {}) {
  const alive = c.units.filter((x) => !x.dead && x.summoner === u.id).length;
  n = Math.min(n, Math.max(0, max - alive));
  if (n <= 0) return [];
  let pool = ids && ids.length ? ids : (u.def?.summons || null);
  if (!pool || !pool.length) {
    const z = c.game.sys.world.zone?.();
    pool = (z?.monsters || []).filter((id) => MONSTER[id] && MONSTER[id].attack !== 'summoner');
  }
  pool = pool.filter((id) => MONSTER[id]);
  if (!pool.length) return [];
  const d = diffOf(c);
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = pool[Math.floor(c.rng.next() * pool.length)];
    const a = c.spawnMonster(id, {
      level: u.level, rank: 'normal', x: u.x + c.rng.range(-spread, spread * 0.6), y: c.rng.range(-36, 36),
      lifeMul: d.life || 1, dmgMul: d.dmg || 1, xpMul: 0.25, lootMul: 0.15, goldMul: 0.25, tag: 'add',
    });
    if (a) { a.summoner = u.id; a.isAdd = true; out.push(a); }
  }
  if (out.length) c.emit({ t: 'summon', x: u.x, y: u.y, unit: u, enemy: true });
  return out;
}

/** 敵を「操作中」にする（普通の動き・攻撃を止める） */
export function control(u, ctl) {
  u.ctl = ctl;
  u.windup = 99;
}
export function release(u) {
  u.ctl = null;
  u.windup = 0;
}
