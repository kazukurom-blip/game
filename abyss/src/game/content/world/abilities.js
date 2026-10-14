// ボスの特技（monsterAbilities）。数字は data/monsters.js の BOSS_ABILITIES が正。
// どれも「予告（地面の警告の円・頭の上の技名）→ 少し後に当たる」形にして、見ていて何が起きたか分かるようにする。
// 主人公は避けないので、予告は見た目と「次に何が来るか」の知らせ。ダメージは u.dmg（敵の攻撃力）× mult。
//
// ここで出す見た目の出来事（combat.fx。アート担当・サウンド担当向け）:
//   { t: 'bossAbility', unit, ability, name }      特技を使い始めた
//   { t: 'charge', unit, x, tx }                    突進（x から tx へ）
//   { t: 'teleport', unit, from, to }               瞬間移動
//   { t: 'enemyBeam', unit, x1, x2, y, z, el, dur } 敵の光線（予告のあと）
//   { t: 'mortar', unit, x1, x2, y, delay, el }     弧を描く弾（delay 秒後に x2 へ落ちる）
//   { t: 'drain', unit, target }                    生命吸収の 1 回
//   { t: 'pull', unit, target }                     引き寄せ
//   { t: 'burrow', unit, up: bool }                 潜る / 出る（潜っている間 unit.burrowed = true）
//   { t: 'enrage', unit } / { t: 'shieldUp', unit } / { t: 'shieldBreak', unit }
//   { t: 'chain', pts, el, enemy: true }            敵の連鎖雷（既存の chain と同じ形）
// 地面の範囲の art: fx.enemy.meteor / nova / pool / beam / spikes / breath / quake / firewall / jail / warp / mortar / slam / blood

import { monsterAbilities, unitHooks } from '../../combat.js';
import { BOSS_ABILITIES as A } from '../../../data/monsters.js';
import { sched, telegraph, say, spawnAdds, control, release, heroAlive, abilityEl, near } from './util.js';

const dirTo = (u, t) => (t.x >= u.x ? 1 : -1);

function def(id, use, opts = {}) {
  const a = A[id];
  monsterAbilities[id] = {
    cd: a.cd || 1e9, range: a.range || 700, name: a.name, passive: !!a.passive,
    use(c, u, t) {
      if (a.passive) return;
      if (u.ctl || u.burrowed) { u.abilityT[id] = 0.6; return; } // 突進などの最中は後回し
      if (opts.check && !opts.check(c, u, t)) { u.abilityT[id] = 1.5; return; }
      if (!opts.quiet) say(c, u, a.name);
      c.emit({ t: 'bossAbility', unit: u, ability: id, name: a.name });
      use(c, u, t, a);
    },
  };
}

// ---------------- 動き
def('charge', (c, u, t, a) => {
  const tx = t.x - dirTo(u, t) * (35 + 25 * (u.size || 1)); // 体の大きさぶん離れて止まる（弾は線分で当たりを調べるので、近くてもすり抜けない）
  telegraph(c, u, { x: t.x, y: t.y, r: 95, delay: a.delay, mult: a.mult, el: u.element, art: 'fx.enemy.slam' });
  control(u, { kind: 'dash', t: 0, wind: a.delay - 0.2, dur: 0.2, x0: u.x, x1: tx });
  c.emit({ t: 'charge', unit: u, x: u.x, tx });
});

def('teleport', (c, u, t) => {
  const from = u.x;
  const to = t.x + (t.face >= 0 ? -1 : 1) * 95; // 主人公の背中側
  u.x = to; u.face = to < t.x ? 1 : -1; u.atkT = 0.2;
  c.emit({ t: 'teleport', unit: u, from, to });
});

def('burrow', (c, u, t, a) => {
  control(u, { kind: 'burrow', t: 0, dur: a.delay, tx: t.x + 30 });
  u.burrowed = true;
  c.emit({ t: 'burrow', unit: u, up: false });
  telegraph(c, u, { x: t.x, y: t.y, r: 100, delay: a.delay, mult: a.mult, el: u.element, art: 'fx.enemy.spikes' });
});

def('pull', (c, u, t, a) => {
  const h = heroAlive(c);
  if (!h) return;
  const d = dirTo(u, h);
  h.x = u.x + d * 110;
  c.emit({ t: 'pull', unit: u, target: h });
  telegraph(c, u, { x: h.x, y: h.y, r: 100, delay: a.delay, mult: a.mult, el: u.element, art: 'fx.enemy.slam' });
});

// ---------------- 地面の攻撃
def('slam_wave', (c, u, t, a) => {
  const d = dirTo(u, t);
  for (let i = 0; i < a.count; i++) telegraph(c, u, { x: u.x + d * (90 + i * 110), y: t.y, r: 80, delay: a.delay + i * 0.18, mult: a.mult, el: u.element, art: 'fx.enemy.slam' });
  sched(c, a.delay, () => c.emit({ t: 'shake', power: 5 }));
});

def('meteor', (c, u, t, a) => {
  const el = abilityEl(u, 'fire');
  for (let i = 0; i < a.count; i++) {
    const x = i === 0 ? t.x : t.x + c.rng.range(-170, 170);
    telegraph(c, u, { x, y: t.y + (i ? c.rng.range(-30, 30) : 0), r: 85, delay: a.delay + i * 0.15, mult: a.mult, el, art: 'fx.enemy.meteor' });
  }
});

def('frost_nova', (c, u, t, a) => {
  telegraph(c, u, { x: u.x, y: u.y, r: a.r, delay: a.delay, mult: a.mult, el: 'cold', art: 'fx.enemy.nova', onFire: (hit, h) => { if (hit) c.addStatus(h, 'chill', { dur: 2 }); } });
});

def('poison_pool', (c, u, t, a) => {
  telegraph(c, u, { x: t.x, y: t.y, r: a.r, delay: a.delay, dur: a.dur, tick: 0.5, mult: a.mult, el: 'poison', art: 'fx.enemy.pool' });
});

def('spikes', (c, u, t, a) => {
  for (let i = 0; i < a.count; i++) telegraph(c, u, { x: t.x + (i === 0 ? 0 : (i % 2 ? 1 : -1) * c.rng.range(70, 140)), y: t.y, r: 60, delay: a.delay + i * 0.12, mult: a.mult, el: u.element === 'cold' ? 'cold' : 'phys', art: 'fx.enemy.spikes' });
});

def('breath', (c, u, t, a) => {
  const d = dirTo(u, t);
  const el = abilityEl(u, 'fire');
  for (let i = 0; i < a.count; i++) telegraph(c, u, { x: u.x + d * (80 + i * 70), y: t.y, r: 75, delay: a.delay + i * 0.1, mult: a.mult, el, art: 'fx.enemy.breath' });
});

def('quake', (c, u, t, a) => {
  telegraph(c, u, { x: u.x, y: 0, r: a.r, delay: a.delay, mult: a.mult, el: 'phys', art: 'fx.enemy.quake' });
  sched(c, a.delay, () => c.emit({ t: 'shake', power: 12 }));
});

def('firewall', (c, u, t, a) => {
  for (let i = 0; i < a.count; i++) telegraph(c, u, { x: t.x + (i - 1) * 140, y: t.y, r: 70, delay: a.delay, dur: a.dur, tick: 0.5, mult: a.mult, el: 'fire', art: 'fx.enemy.firewall' });
});

def('blood_nova', (c, u, t, a) => {
  telegraph(c, u, { x: u.x, y: u.y, r: a.r, delay: a.delay, mult: a.mult, el: 'phys', art: 'fx.enemy.blood', onFire: (hit) => { if (hit && !u.dead) u.life = Math.min(u.maxLife, u.life + u.maxLife * 0.04); } });
});

def('mortar', (c, u, t, a) => {
  const el = abilityEl(u, 'fire');
  for (let i = 0; i < a.count; i++) {
    const x2 = t.x + (i ? c.rng.range(-90, 90) : 0);
    telegraph(c, u, { x: x2, y: t.y, r: 90, delay: a.delay + i * 0.2, mult: a.mult, el, art: 'fx.enemy.mortar' });
    c.emit({ t: 'mortar', unit: u, x1: u.x, x2, y: t.y, delay: a.delay + i * 0.2, el });
  }
});

def('beam', (c, u, t, a) => {
  const el = abilityEl(u, 'lightning');
  const x2 = t.x;
  const n = Math.max(1, Math.min(8, Math.round(Math.abs(x2 - u.x) / 90)));
  // 見た目の予告（ダメージなし）＋ 主人公の場所にだけ本当の当たり
  for (let i = 1; i < n; i++) telegraph(c, u, { x: u.x + ((x2 - u.x) * i) / n, y: t.y, r: 45, delay: a.delay, mult: 0, el, art: 'fx.enemy.beam' });
  telegraph(c, u, { x: x2, y: t.y, r: 75, delay: a.delay, mult: a.mult, el, art: 'fx.enemy.beam' });
  sched(c, a.delay, () => { if (!u.dead) c.emit({ t: 'enemyBeam', unit: u, x1: u.x, x2, y: t.y, z: 60 * (u.size || 1), el, dur: 0.35 }); });
});

def('chain_bolt', (c, u, t, a) => {
  const targets = c.allies().sort((p, q) => Math.abs(p.x - u.x) - Math.abs(q.x - u.x)).slice(0, 4);
  const pts = [{ x: u.x, y: u.y, z: 80 * (u.size || 1) }];
  targets.forEach((v, i) => {
    telegraph(c, u, { x: v.x, y: v.y, r: 55, delay: a.delay + i * 0.1, mult: a.mult, el: 'lightning', art: 'fx.enemy.zap' });
    pts.push({ x: v.x, y: v.y, z: 50 });
  });
  sched(c, a.delay, () => c.emit({ t: 'chain', pts, el: 'lightning', enemy: true }));
});

def('jail', (c, u, t, a) => {
  telegraph(c, u, { x: t.x, y: t.y, r: 75, delay: a.delay, mult: 0, el: 'void', art: 'fx.enemy.jail', onFire: (hit, h) => { if (hit) c.addStatus(h, 'stun', { dur: a.stun }); } });
});

def('timewarp', (c, u, t, a) => {
  const x = t.x; const y = t.y;
  telegraph(c, u, { x, y, r: a.r, delay: a.delay, dur: a.dur, tick: 0, mult: 0, el: 'cold', art: 'fx.enemy.warp' });
  for (let k = 0; k < a.dur * 2; k++) {
    sched(c, a.delay + k * 0.5, () => {
      const h = heroAlive(c);
      if (h && Math.abs(h.x - x) <= a.r && Math.abs(h.y - y) <= a.r * 0.75) {
        c.addStatus(h, 'chill', { dur: 0.8 });
        c.addBuff('timewarp', [{ s: 'attack_speed', v: -25 }], 0.7, { name: '時の淀み' });
      }
    });
  }
});

// ---------------- 呼び出し・自分の強化
def('summon', (c, u, t, a) => { spawnAdds(c, u, a.count, u.def?.summons, { max: a.max }); }, {
  check: (c, u) => c.units.filter((x) => !x.dead && x.summoner === u.id).length < (A.summon.max || 5),
});

def('totems', (c, u, t, a) => {
  u._totems = (u._totems || []).filter((x) => !x.dead);
  const d = c.game.sys.world.difficulty();
  for (let i = u._totems.length; i < a.count; i++) {
    const x = u.x + (i % 2 ? 1 : -1) * c.rng.range(120, 200);
    const tt = c.spawnMonster('totem_ward', { level: u.level, rank: 'normal', x, y: c.rng.range(-30, 30), lifeMul: (d.life || 1) * (u.rank === 'actboss' ? 4 : 3), dmgMul: d.dmg || 1, xpMul: 0.2, lootMul: 0.1, goldMul: 0.2, tag: 'totem' });
    if (tt) { tt.summoner = u.id; tt.isAdd = true; u._totems.push(tt); }
  }
}, { check: (c, u) => (u._totems || []).filter((x) => !x.dead).length < A.totems.count });

def('drain', (c, u, t, a) => {
  for (let k = 0; k < a.dur * 2; k++) {
    sched(c, 0.3 + k * 0.5, () => {
      const h = heroAlive(c);
      if (!h || u.dead || Math.abs(h.x - u.x) > a.range) return;
      const got = c.damageAlly(h, u.dmg * a.mult, 'void', u, true);
      if (got > 0) u.life = Math.min(u.maxLife, u.life + got * 3);
      c.emit({ t: 'drain', unit: u, target: h });
    });
  }
});

def('whirl', (c, u, t, a) => {
  c.spawnArea({ team: 'enemy', x: u.x, y: u.y, r: 120, delay: 0.3, dur: a.dur, tick: 0.4, dmg: u.dmg * a.mult, el: u.element, src: u, follow: u, art: 'fx.enemy.whirl' });
  u.speed *= 1.6;
  sched(c, a.dur + 0.3, () => { u.speed /= 1.6; });
});

def('orbs', (c, u, t, a) => {
  const el = abilityEl(u, 'void');
  const base = Math.atan2((t.y - u.y) * 2, t.x - u.x);
  for (let i = 0; i < a.count; i++) {
    const ang = base - 0.5 + (1.0 * i) / Math.max(1, a.count - 1);
    c.spawnProj({ src: u, team: 'enemy', x: u.x - 20 * (u.size || 1), y: u.y, z: 60 * (u.size || 1), angle: ang, speed: 380, dmg: u.dmg * a.mult, el, range: 900, art: 'fx.enemy.orb' });
  }
});

def('frenzy', (c, u, t, a) => {
  u.atkCd *= 0.5; u.atkT = Math.min(u.atkT, 0.2);
  sched(c, a.dur, () => { u.atkCd /= 0.5; });
});

def('heal', (c, u, t, a) => {
  u.life = Math.min(u.maxLife, u.life + u.maxLife * a.pct);
  c.emit({ t: 'text', x: u.x, y: u.y, z: 140 * (u.size || 1), text: `+${Math.round(a.pct * 100)}% 回復`, color: '#6ee08a' });
}, { check: (c, u) => u.life < u.maxLife * 0.5 });

def('clones', (c, u, t, a) => {
  for (let i = 0; i < a.count; i++) {
    const k = c.spawnMonster(u.defId, { level: u.level, rank: 'normal', x: u.x + (i ? 1 : -1) * c.rng.range(90, 160), y: c.rng.range(-30, 30), sizeMul: 0.7, xpMul: 0.1, lootMul: 0.05, goldMul: 0.1, tag: 'clone' });
    if (!k) continue;
    k.boss = false; k.isClone = true; k.isAdd = true; k.summoner = u.id;
    k.maxLife = k.life = u.maxLife * 0.1; k.dmg = u.dmg * 0.5; k.abilityT = {};
    c.emit({ t: 'teleport', unit: k, from: u.x, to: k.x });
  }
}, { check: (c, u) => !c.units.some((x) => !x.dead && x.isClone && x.summoner === u.id) });

def('curse', (c, u, t, a) => {
  c.addBuff('curse_weak', [{ s: 'more_dmg', v: -a.pct }], a.dur, { name: '衰弱の呪い' });
});

// 受け身の特技（激昂・障壁）は bosses.js が見張る
def('enrage', () => {});
def('shield', () => {});

// ---------------- 操作中の動き（突進・潜行）
unitHooks.onMonsterTick.push((c, u, dt) => {
  const k = u.ctl;
  if (!k || c.isFrozen(u)) return;
  k.t += dt;
  if (k.kind === 'dash') {
    if (k.t >= k.wind) {
      const p = Math.min(1, (k.t - k.wind) / Math.max(0.05, k.dur));
      u.x = k.x0 + (k.x1 - k.x0) * p;
      u.anim = { s: 'attack', t: 0.35 + p * 0.25, dur: 0.6 };
      if (p >= 1) {
        release(u); u.atkT = Math.max(u.atkT, 0.6);
        if (k.onArrive) k.onArrive(c, u);
      }
    } else if (u.anim.s !== 'attack') u.anim = { s: 'attack', t: 0, dur: k.wind };
  } else if (k.kind === 'burrow') {
    if (k.t >= k.dur) {
      u.x = k.tx; u.burrowed = false; release(u); u.atkT = 0.3;
      c.emit({ t: 'burrow', unit: u, up: true });
    }
  } else if (k.kind === 'hold') {
    if (k.t >= k.dur) release(u);
  }
});

export { near };
