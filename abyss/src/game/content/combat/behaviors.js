// スキルの動き（戦闘担当）。behaviors[名前] = (c, h, p, target) => void
//   .prepare(c, h, p, target, ct) … 詠唱の始めに呼ばれる（跳躍・突進の移動を決める）
//   .tick(c, h, p, ch, dt)          … 詠唱し続ける技の 1 刻み（ch = h.channel）
//   .move(c, h, p, ch, dt)          … 詠唱し続ける技の毎ティックの移動
//   .end(c, h, p, ch)               … 詠唱し続ける技の終わり
// 出す見た目の出来事（fx）は game/content/combat.js の先頭の一覧を参照。

import { behaviors, pullTo, spawnCloneAt } from '../../combat.js';

const HERO = 'hero';
const dirTo = (h, t) => (t ? (t.x >= h.x ? 1 : -1) : h.face || 1);
const afterBuff = (c, p) => { const b = p.extra?.afterBuff; if (b) c.addBuff(`${p.id}_after`, b.mods, b.dur, { name: b.name || p.def.name }); };
const resGain = (c, h, p) => { if (p.extra?.resGain) h.resource = Math.min(c.H.resourceMax, h.resource + p.extra.resGain); };

/** 燃える地面（burn: { dur, tick, mult }） */
function burnAt(c, h, p, x, y, r) {
  const b = p.burn;
  if (!b) return;
  c.spawnArea({ team: HERO, kind: 'burn', x, y, r: r * 0.85, delay: 0.05, dur: b.dur || 3, tick: b.tick || 0.5, p, mult: b.mult || 0.15, src: h, dot: true, el: p.element });
  c.emit({ t: 'cloud', x, y, r: r * 0.85, dur: b.dur || 3, skill: p.id, el: p.element, kind: 'burn' });
}

/** 毒の霧を残す（leaveCloud: { dur, tick, mult }） */
function cloudAt(c, h, p, x, y, r, o) {
  c.spawnArea({ team: HERO, kind: 'cloud', x, y, r, delay: 0.05, dur: o.dur || 3, tick: o.tick || 0.5, p, mult: o.mult || 0.12, src: h, dot: true, el: 'poison' });
  c.emit({ t: 'cloud', x, y, r, dur: o.dur || 3, skill: p.id, el: 'poison' });
}

/** 半径 r の敵すべてに当てる */
function blast(c, h, p, x, y, r, mult = 1, opts = {}) {
  const hits = c.enemiesNear(x, y, r);
  hits.forEach((u, i) => c.hitUnit(h, u, p, mult, { aoeHit: i > 0, ...opts }));
  return hits;
}

// ================================================================ 跳躍（跳びかかって着地点に衝撃）
behaviors.leap = (c, h, p) => {
  const r = p.radius || 140;
  const hits = blast(c, h, p, h.x, h.y, r);
  c.emit({ t: 'nova', x: h.x, y: h.y, r, el: p.element, skill: p.id, land: true });
  c.emit({ t: 'shake', power: hits.length >= 2 ? 4 : 2 });
  burnAt(c, h, p, h.x, h.y, r);
  resGain(c, h, p);
};
behaviors.leap.prepare = (c, h, p, target, ct) => {
  if (!target) return;
  const dir = dirTo(h, target);
  const dist = Math.min(p.range || 450, Math.max(0, Math.abs(target.x - h.x) - 50));
  const x1 = h.x + dir * dist;
  const y1 = target.y * 0.6;
  h.motion = { x0: h.x, y0: h.y, x1, y1, t: 0, dur: ct * 0.55, arc: Math.min(160, 60 + dist * 0.25) };
  c.emit({ t: 'leap', unit: h, x0: h.x, y0: h.y, x1, y1, dur: ct * 0.55, skill: p.id, el: p.element });
};

// ================================================================ 突進（通り抜けた敵に当てる）
function dashHit(c, h, p, x0, x1, mult) {
  const lo = Math.min(x0, x1) - 30; const hi = Math.max(x0, x1) + 30;
  const w = (p.radius || 60) + 30;
  let i = 0;
  for (const u of c.enemies()) {
    if (u.x < lo || u.x > hi || Math.abs(u.y - h.y) > w + 20 * u.size) continue;
    c.hitUnit(h, u, p, mult, { aoeHit: i++ > 0 });
  }
  c.emit({ t: 'swing', x: x1, y: h.y, r: 80, el: p.element, skill: p.id, src: h, fallbackOf: 'dash' });
}
behaviors.dash = (c, h, p) => {
  const m = h.lastDash;
  if (!m) return;
  dashHit(c, h, p, m.x0, m.x1, 1);
  afterBuff(c, p);
  if (p.extra?.spawnClone) spawnCloneAt(c, h, m.x0, p.extra.spawnClone, 1);
  const back = p.extra?.back;
  if (back) {
    c.after(0.12, () => {
      if (h.dead) return;
      const x0 = h.x;
      h.motion = { x0, y0: h.y, x1: m.x0, y1: h.y, t: 0, dur: 0.2 };
      h.busy = Math.max(h.busy, 0.22);
      c.emit({ t: 'dash', unit: h, x0, y0: h.y, x1: m.x0, y1: h.y, dur: 0.2, skill: p.id, el: p.element, back: true });
      c.after(0.2, () => { if (!h.dead) dashHit(c, h, p, x0, m.x0, back); });
    });
  }
};
behaviors.dash.prepare = (c, h, p, target, ct) => {
  const dir = dirTo(h, target);
  const want = target ? Math.abs(target.x - h.x) + 90 : p.range;
  const dist = Math.min((p.range || 400) + 90, Math.max(120, want));
  const x1 = h.x + dir * dist;
  const y1 = target ? h.y + (target.y - h.y) * 0.5 : h.y;
  h.lastDash = { x0: h.x, x1 };
  h.motion = { x0: h.x, y0: h.y, x1, y1, t: 0, dur: ct * 0.5, ease: 'in' };
  c.emit({ t: 'dash', unit: h, x0: h.x, y0: h.y, x1, y1, dur: ct * 0.5, skill: p.id, el: p.element });
};

// ================================================================ 後転射ち（下がってから矢を放つ）
behaviors.roll = (c, h, p, target) => {
  const t = target && !target.dead ? target : c.nearestEnemy(h.x, h.y);
  h.face = dirTo(h, t);
  behaviors.projectile(c, h, p, t);
  if (p.extra?.leaveTrap && h.lastRoll) {
    const x = h.lastRoll.x0;
    const mult = p.extra.leaveTrap / Math.max(0.1, p.dmgPct / 100);
    c.spawnArea({ team: HERO, kind: 'trap', x, y: h.y, r: 130, delay: 0.3, life: 10, trigger: 80, p, mult, src: h, el: p.element });
    c.emit({ t: 'trap', x, y: h.y, r: 130, skill: p.id, el: p.element });
  }
};
behaviors.roll.prepare = (c, h, p, target, ct) => {
  const dir = dirTo(h, target);
  const dist = 180 * (p.extra?.rollDist || 1);
  const x1 = h.x - dir * dist;
  h.lastRoll = { x0: h.x, x1 };
  h.motion = { x0: h.x, y0: h.y, x1, y1: h.y, t: 0, dur: ct * 0.5, arc: 30 };
  c.emit({ t: 'dash', unit: h, x0: h.x, y0: h.y, x1, y1: h.y, dur: ct * 0.5, skill: p.id, el: p.element, roll: true });
};

// ================================================================ 地を走る衝撃波（通り道の敵すべて）
behaviors.wave = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const base = target ? Math.atan2((target.y - h.y) * 2, target.x - h.x) : (h.face < 0 ? Math.PI : 0);
  const spread = n > 1 ? (p.spread || 0.7) : 0;
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? base - spread / 2 + (spread * i) / (n - 1) : base;
    c.spawnProj({ src: h, team: HERO, x: h.x + 40 * h.face, y: h.y, z: 0, angle: a, speed: p.speed || 900, p, pierce: 999, range: p.range || 600, hitR: p.radius || 70, wave: true, kind: 'wave' });
  }
  c.emit({ t: 'wave', unit: h, x: h.x, y: h.y, dir: h.face, range: p.range, r: p.radius, count: n, skill: p.id, el: p.element });
  c.emit({ t: 'shake', power: 3 });
};

// ================================================================ 旋風（回転しながら進む）
behaviors.whirl = (c, h, p, target) => { c.startChannel(h, p, target, 'whirl'); c.emit({ t: 'whirl', unit: h, r: p.radius, dur: p.duration, skill: p.id, el: p.element }); };
behaviors.whirl.tick = (c, h, p) => {
  if (p.extra?.pull) pullTo(c, h, p.extra.pull);
  const hits = blast(c, h, p, h.x, h.y, p.radius || 150);
  c.emit({ t: 'nova', x: h.x, y: h.y, r: p.radius, el: p.element, skill: p.id, small: true, fallbackOf: 'whirl' });
  return hits;
};
behaviors.whirl.move = (c, h, p, ch, dt) => {
  const t = c.nearestEnemy(h.x, h.y);
  if (!t) return;
  const d = t.x - h.x;
  if (Math.abs(d) > 40) { h.x += Math.sign(d) * c.H.move * 0.75 * dt * c.slowOf(h); h.face = Math.sign(d); }
  h.y += Math.sign(t.y - h.y) * Math.min(Math.abs(t.y - h.y), 40 * dt);
};
behaviors.whirl.end = (c, h, p) => {
  const fin = p.extra?.finisher;
  if (!fin || h.dead) return;
  blast(c, h, p, h.x, h.y, 220 * (c.H.area || 1), fin / Math.max(0.1, p.dmgPct / 100));
  c.emit({ t: 'nova', x: h.x, y: h.y, r: 220 * (c.H.area || 1), el: p.element, skill: p.id });
  c.emit({ t: 'shake', power: 4 });
};

// ================================================================ 光線（線上の敵すべてに刻み）
behaviors.beam = (c, h, p, target) => {
  const dir = dirTo(h, target);
  h.face = dir;
  c.startChannel(h, p, target, 'beam', { dir });
  c.emit({ t: 'beam', unit: h, x1: h.x + 30 * dir, y1: h.y, x2: h.x + dir * p.range, y2: h.y, w: p.radius || 40, dur: p.duration, skill: p.id, el: p.element });
};
behaviors.beam.tick = (c, h, p, ch) => {
  const t = c.nearestEnemy(h.x, h.y, p.range + 100);
  if (t) { ch.dir = dirTo(h, t); h.face = ch.dir; ch.ty = t.y; }
  const dir = ch.dir || h.face;
  const w = (p.radius || 40) + 20;
  const ty = ch.ty ?? h.y;
  let i = 0;
  for (const u of c.enemies()) {
    const dx = (u.x - h.x) * dir;
    if (dx < -20 || dx > p.range) continue;
    const ly = h.y + (ty - h.y) * Math.min(1, dx / Math.max(1, p.range * 0.6));
    if (Math.abs(u.y - ly) > w + 20 * u.size) continue;
    c.hitUnit(h, u, p, 1, { aoeHit: i++ > 0 });
  }
  c.emit({ t: 'chain', pts: [{ x: h.x + 30 * dir, y: h.y, z: 70 }, { x: h.x + dir * p.range, y: ty, z: 50 }], el: p.element, skill: p.id, fallbackOf: 'beam' });
};

// ================================================================ 千刃（目の前を切り続ける）
behaviors.flurry = (c, h, p, target) => { c.startChannel(h, p, target, 'flurry'); c.emit({ t: 'flurry', unit: h, r: p.radius, dur: p.duration, skill: p.id, el: p.element }); };
behaviors.flurry.tick = (c, h, p, ch) => {
  let t = ch.target;
  if (!t || t.dead) { t = c.nearestEnemy(h.x, h.y, (p.range || 110) + 60); ch.target = t; }
  if (!t) return;
  h.face = dirTo(h, t);
  blast(c, h, p, t.x, t.y, p.radius || 80);
  c.emit({ t: 'swing', x: t.x, y: t.y, r: p.radius, el: p.element, skill: p.id, src: h, small: true, fallbackOf: 'flurry' });
};
behaviors.flurry.move = (c, h, p, ch, dt) => {
  const t = ch.target;
  if (!t || t.dead) return;
  const d = t.x - h.x;
  if (Math.abs(d) > (p.range || 110) * 0.7) h.x += Math.sign(d) * c.H.move * 0.6 * dt;
};

// ================================================================ オーラ（主人公についていく範囲。呪い・ダメージ）
behaviors.aura = (c, h, p) => {
  const r = Math.max(200, p.radius || 220);
  const dur = p.extra?.auraDur || p.duration || 8;
  for (const a of c.areas) if (a.p?.id === p.id && a.kind === 'aura') a.dead = true;
  c.spawnArea({ team: HERO, kind: 'aura', x: h.x, y: h.y, follow: h, r, delay: 0, dur, tick: p.tick || 0.5, p, src: h, dot: true, quiet: true, curse: p.curse });
  c.addBuff(`${p.id}_aura`, [], dur, { name: p.def.name });
  c.emit({ t: 'aura', unit: h, r, dur, skill: p.id, el: p.element });
};

// ================================================================ 罠（踏むと爆発）
behaviors.trap = (c, h, p, target) => {
  const mine = c.areas.filter((a) => a.kind === 'trap' && a.p?.id === p.id && !a.dead);
  while (mine.length >= p.count) { const old = mine.shift(); old.dead = true; }
  const dir = dirTo(h, target);
  const dist = target ? Math.min(p.range || 380, Math.abs(target.x - h.x) - 30) : 200;
  const x = h.x + dir * Math.max(60, dist);
  const y = target ? target.y : h.y;
  const a = c.spawnArea({ team: HERO, kind: 'trap', x, y, r: p.radius || 130, delay: p.delay || 0.4, life: p.duration || 12, trigger: (p.radius || 130) * 0.55, p, src: h, el: p.element });
  const lc = p.extra?.leaveCloud;
  if (lc) a.onFire = (cc, ar) => cloudAt(cc, h, p, ar.x, ar.y, ar.r, lc);
  c.emit({ t: 'trap', x, y, r: a.r, skill: p.id, el: p.element, life: a.life });
};

// ================================================================ 砲台（動かない召喚物）
behaviors.turret = (c, h, p) => {
  const mine = c.minionsOf(p.id);
  while (mine.length >= p.maxSummons) { const old = mine.shift(); old.dead = true; old.deadT = 0; }
  const s = p.summon || {};
  c.spawnMinion(s.unit || 'turret', p, { ttl: s.ttl || 15, stationary: true, x: h.x + 50 * h.face, y: h.y + c.rng.range(-20, 20), size: 0.9 });
};

// ================================================================ 霧・吹雪（置いた所で刻みのダメージ）
behaviors.cloud = (c, h, p, target) => {
  const t = target && !target.dead ? target : c.nearestEnemy(h.x, h.y, p.range + 100);
  const x = t ? t.x : h.x + 250 * h.face;
  const y = t ? t.y * 0.7 : 0;
  c.spawnArea({ team: HERO, kind: 'cloud', x, y, r: p.radius || 160, delay: 0.2, dur: p.duration || 5, tick: p.tick || 0.5, p, src: h, dot: true, curse: p.curse });
  c.emit({ t: 'cloud', x, y, r: p.radius, dur: p.duration, skill: p.id, el: p.element });
};

// ================================================================ 炎の壁（横に長い範囲）
behaviors.wall = (c, h, p, target) => {
  const dir = dirTo(h, target);
  const x = target ? target.x - dir * 40 : h.x + dir * 260;
  const len = (p.extra?.len || 340) * (p.extra?.lenMul || 1) * (c.H.area || 1);
  c.spawnArea({ team: HERO, kind: 'wall', shape: 'line', len, x, y: target ? target.y * 0.5 : 0, r: p.radius || 50, delay: 0.15, dur: p.duration || 5, tick: p.tick || 0.4, p, src: h, dot: true });
  c.emit({ t: 'wall', x, y: target ? target.y * 0.5 : 0, len, depth: p.radius, dur: p.duration, skill: p.id, el: p.element });
};

// ================================================================ 隕石（遅れて落ちる大きな一撃）
behaviors.meteor = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const t0 = target && !target.dead ? target : c.nearestEnemy(h.x, h.y, p.range + 200);
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? t0 : c.rng.pick(c.enemies()) || t0;
    const x = (t ? t.x : h.x + 300 * h.face) + (n > 1 && i ? c.rng.range(-80, 80) : 0);
    const y = t ? t.y * 0.8 : 0;
    const delay = (p.delay || 1) + i * 0.18;
    c.spawnArea({ team: HERO, kind: 'meteor', x, y, r: p.radius || 170, delay, p, src: h, onFire: (cc, a) => { cc.emit({ t: 'shake', power: 5 }); burnAt(cc, h, p, a.x, a.y, a.r); } });
    c.emit({ t: 'meteor', x, y, r: p.radius, delay, skill: p.id, el: p.element });
  }
};

// ================================================================ 回る刃・骨（主人公のまわりを回る）
behaviors.orbit = (c, h, p) => {
  for (const a of c.areas) if (a.p?.id === p.id && a.kind === 'orbit') a.dead = true;
  const n = Math.max(1, p.count);
  c.spawnArea({ team: HERO, kind: 'orbit', x: h.x, y: h.y, follow: h, r: p.radius || 120, delay: 0, dur: p.duration || 6, p, src: h, quiet: true, orbit: { n, ang: 0, speed: 3.4, hitCd: p.tick || 0.35 } });
  const sb = p.extra?.selfBuff;
  c.addBuff(`${p.id}_orbit`, sb?.mods || [], p.duration || 6, { name: sb?.name || p.def.name });
  c.emit({ t: 'orbit', unit: h, n, r: p.radius, dur: p.duration, speed: 3.4, skill: p.id, el: p.element });
};

// ================================================================ 呪い（範囲の敵の被ダメ増・与ダメ減・鈍足・継続）
behaviors.curse = (c, h, p, target) => {
  const t = target && !target.dead ? target : c.nearestEnemy(h.x, h.y, p.range + 100);
  if (!t) return;
  const r = p.radius || 200;
  const list = r <= 80 ? [t] : c.enemiesNear(t.x, t.y, r);
  if (!list.includes(t)) list.unshift(t);
  for (const u of list) c.applyCurse(u, p.curse, p);
  c.emit({ t: 'curse', x: t.x, y: t.y, r, skill: p.id, el: p.element, curse: { ...p.curse }, single: r <= 80, unit: r <= 80 ? t : null });
};

// ================================================================ 障壁（最大ライフの割合の障壁＋強化）
behaviors.barrier = (c, h, p) => {
  const sh = p.shield || { pct: 20, dur: 8 };
  const v = c.H.life * (sh.pct / 100);
  h.shield = Math.max(h.shield, v);
  h.shieldMax = Math.max(h.shieldMax || 0, h.shield);
  h.shieldT = sh.dur;
  h.shieldSkill = p.id;
  c.addBuff(p.id, p.buff?.mods || [], sh.dur, { name: p.def.name, skill: p.id });
  if (p.extra?.retaliate || p.extra?.chillAttackers) h.retaliate = { p, el: p.extra.retaliate?.el, mult: p.extra.retaliate?.mult || 0, chill: !!p.extra.chillAttackers, t: sh.dur };
  if (p.extra?.shieldBurst) h.shieldBurst = { p, mult: p.extra.shieldBurst, t: c.time + sh.dur };
  c.emit({ t: 'shield', unit: h, v, max: h.shieldMax, dur: sh.dur, skill: p.id, el: p.element });
};

// ================================================================ 死体爆発
behaviors.corpse = (c, h, p, target) => {
  const tx = target ? target.x : h.x;
  const list = c.corpsesNear(h.x, p.range).sort((a, b) => Math.abs(a.x - tx) - Math.abs(b.x - tx)).slice(0, Math.max(1, p.count));
  const r = p.radius || 150;
  const pct = p.extra?.corpsePct || 0.05;
  list.forEach((cp, k) => {
    c.corpses.splice(c.corpses.indexOf(cp), 1);
    c.after(k * 0.08, () => {
      const flat = cp.maxLife * pct * (cp.boss ? 0.3 : 1);
      const hits = c.enemiesNear(cp.x, cp.y, r);
      hits.forEach((u, i) => c.hitUnit(h, u, p, 1, { aoeHit: i > 0, flatAdd: flat }));
      c.emit({ t: 'corpse', x: cp.x, y: cp.y, r, skill: p.id, el: p.element });
      c.emit({ t: 'nova', x: cp.x, y: cp.y, r, el: p.element, skill: p.id, fallbackOf: 'corpse' });
      if (p.extra?.leaveCloud) cloudAt(c, h, p, cp.x, cp.y, r * 0.8, p.extra.leaveCloud);
    });
  });
  if (list.length >= 2) c.emit({ t: 'shake', power: 3 });
};

// ================================================================ 奥義
/** 剣闘士: 天崩し（大跳躍 → 巨大な衝撃 → 余震 3 回） */
behaviors.ult_cataclysm = (c, h, p) => {
  const r = p.radius || 360;
  blast(c, h, p, h.x, h.y, r);
  c.emit({ t: 'nova', x: h.x, y: h.y, r, el: p.element, skill: p.id, land: true, ult: true });
  c.emit({ t: 'shake', power: 12 });
  burnAt(c, h, p, h.x, h.y, r * 0.7);
  for (let i = 1; i <= 3; i++) {
    c.after(0.35 * i, () => {
      if (h.dead) return;
      blast(c, h, p, h.x, h.y, r * 0.8, 0.3, { noProc: true });
      c.emit({ t: 'nova', x: h.x, y: h.y, r: r * (0.6 + 0.15 * i), el: p.element, skill: p.id, small: true });
      c.emit({ t: 'shake', power: 4 });
    });
  }
  afterBuff(c, p);
};
behaviors.ult_cataclysm.prepare = (c, h, p, target, ct) => {
  if (!target) return;
  const dir = dirTo(h, target);
  const dist = Math.min(p.range || 600, Math.max(0, Math.abs(target.x - h.x) - 30));
  const x1 = h.x + dir * dist;
  h.motion = { x0: h.x, y0: h.y, x1, y1: target.y * 0.5, t: 0, dur: ct * 0.55, arc: 320 };
  c.emit({ t: 'leap', unit: h, x0: h.x, y0: h.y, x1, y1: target.y * 0.5, dur: ct * 0.55, skill: p.id, el: p.element, ult: true });
};

/** 狩人: 星落としの矢（2 秒かけて矢を降らせる） */
behaviors.ult_barrage = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const dur = p.duration || 2;
  const cx = target ? target.x : h.x + 350 * h.face;
  const R = p.radius || 420;
  c.emit({ t: 'barrage', x: cx, y: 0, r: R, dur, count: n, skill: p.id, el: p.element });
  for (let i = 0; i < n; i++) {
    c.after((dur * i) / n, () => {
      if (h.dead) return;
      const foes = c.enemiesNear(cx, 0, R);
      const t = foes.length && c.rng.chance(0.6) ? c.rng.pick(foes) : null;
      const x = t ? t.x + c.rng.range(-30, 30) : cx + c.rng.range(-R, R);
      const y = t ? t.y : c.rng.range(-40, 40);
      c.spawnArea({ team: HERO, kind: 'rain', x, y, r: 75, delay: 0.3, p, src: h });
    });
  }
};

/** 魔導士: 星崩し（隕石を次々に落とす） */
behaviors.ult_starfall = (c, h, p, target) => {
  const n = Math.max(1, p.count);
  const cx = target ? target.x : h.x + 350 * h.face;
  for (let i = 0; i < n; i++) {
    c.after(i * 0.2, () => {
      if (h.dead) return;
      const foes = c.enemies();
      const t = foes.length ? foes[(i * 7) % foes.length] : null;
      const x = t ? t.x + c.rng.range(-40, 40) : cx + c.rng.range(-300, 300);
      const y = t ? t.y * 0.8 : 0;
      c.spawnArea({ team: HERO, kind: 'meteor', x, y, r: p.radius || 160, delay: 0.6, p, src: h, onFire: (cc) => cc.emit({ t: 'shake', power: 4 }) });
      c.emit({ t: 'meteor', x, y, r: p.radius, delay: 0.6, skill: p.id, el: p.element, ult: true });
    });
  }
};

/** 死霊術師: 死者の行進（骨の衝撃と一時的な骸骨の軍勢） */
behaviors.ult_deathmarch = (c, h, p) => {
  const r = p.radius || 300;
  blast(c, h, p, h.x, h.y, r);
  c.emit({ t: 'nova', x: h.x, y: h.y, r, el: p.element, skill: p.id, ult: true });
  c.emit({ t: 'shake', power: 8 });
  const s = p.summon || {};
  const n = Math.max(1, p.count);
  for (let i = 0; i < n; i++) {
    c.after(0.06 * i, () => {
      if (h.dead) return;
      c.spawnMinion(s.unit || 'skeleton', p, { ttl: s.ttl || 15, temp: true, mult: (s.dmgPct || 0.25), x: h.x + c.rng.range(-120, 160), y: c.rng.range(-36, 36), size: 0.78 });
    });
  }
};

/** 影刃: 冥府の舞（敵から敵へ跳び移って必ずクリティカル） */
behaviors.ult_shadowdance = (c, h, p) => {
  const n = Math.max(1, p.count);
  const step = 0.14;
  h.busy = Math.max(h.busy, n * step + 0.1);
  let last = null;
  for (let i = 0; i < n; i++) {
    c.after(i * step, () => {
      if (h.dead) return;
      const foes = c.enemies().filter((u) => Math.abs(u.x - h.x) < 700);
      if (!foes.length) { h.busy = Math.min(h.busy, 0.05); return; }
      foes.sort((a, b) => (b.boss - a.boss) || ((b.rank !== 'normal') - (a.rank !== 'normal')) || Math.abs(a.x - h.x) - Math.abs(b.x - h.x));
      const t = foes.find((u) => u !== last) || foes[0];
      last = t;
      const side = i % 2 ? 1 : -1;
      const x0 = h.x; const y0 = h.y;
      h.x = t.x + side * 45; h.y = t.y; h.face = -side;
      c.emit({ t: 'blink', unit: h, x0, y0, x1: h.x, y1: h.y, skill: p.id });
      c.hitUnit(h, t, p, 1, { forceCrit: true });
      for (const u of c.enemiesNear(t.x, t.y, p.radius || 70)) if (u !== t) c.hitUnit(h, u, p, 0.5, { aoeHit: true, forceCrit: true });
      c.emit({ t: 'swing', x: t.x, y: t.y, r: 90, el: p.element, skill: p.id, src: h });
      if (i === n - 1 && p.extra?.spawnClone) spawnCloneAt(c, h, h.x - 40, p.extra.spawnClone, p.extra.cloneCount || 1);
    });
  }
};
