// 普通の敵の攻撃の型のうち、combat.js の基本（近接・弾・叩きつけ）に無いもの:
//   charge   … 離れていると予告のあと突進して体当たり（攻撃力の 140%）
//   explode  … 近づくと 0.55 秒の予告のあと自爆（半径 120・攻撃力の 220%。倒した扱いになる）
//   summoner … 弾で攻撃しながら、8 秒ごとに手下を 1 体呼ぶ（同時に 3 体まで）
// 見た目の出来事: { t: 'charge', unit, x, tx } / { t: 'selfDestruct', unit } / { t: 'summon', x, y, unit, enemy: true }

import { unitHooks } from '../../combat.js';
import { control, telegraph, spawnAdds, say } from './util.js';

const CHARGE = { min: 170, max: 430, cd: 5, wind: 0.4, dur: 0.28, mult: 1.4 };
const EXPLODE = { delay: 0.55, r: 120, mult: 2.2 };
const SUMMON = { cd: 8, max: 3 };

unitHooks.onSpawn.push((c, u) => {
  if (u.kind !== 'monster') return;
  const atk = u.def.attack;
  if (atk === 'summoner') {
    // 攻撃は弾で行う（combat.js は summoner を近接として扱うため、その敵だけの写しで caster にする）
    u.def = { ...u.def, attack: 'caster', proj: u.def.proj || 'orb' };
    u.isSummoner = true;
    u._sumT = SUMMON.cd * c.rng.range(0.3, 0.7);
  } else if (atk === 'charge') {
    u._chT = c.rng.range(0.5, 2);
  } else if (atk === 'explode') {
    u.isBomber = true;
  }
});

unitHooks.onMonsterTick.push((c, u, dt) => {
  if (u.ctl || u.dead) return;
  const h = c.hero;
  if (!h || h.dead) return;
  if (u._chT !== undefined) {
    u._chT -= dt;
    if (u._chT <= 0) {
      const d = Math.abs(h.x - u.x);
      if (d >= CHARGE.min && d <= CHARGE.max && !c.isFrozen(u)) {
        u._chT = CHARGE.cd * c.rng.range(0.8, 1.2);
        const dir = h.x >= u.x ? 1 : -1;
        const tx = h.x - dir * 45;
        control(u, { kind: 'dash', t: 0, wind: CHARGE.wind, dur: CHARGE.dur, x0: u.x, x1: tx, onArrive: (cc, uu) => {
          const hh = cc.hero;
          if (hh && !hh.dead && Math.abs(hh.x - uu.x) <= uu.range + 50) cc.damageAlly(hh, uu.dmg * CHARGE.mult, uu.element, uu);
          cc.emit({ t: 'swing', x: uu.x + dir * 30, y: uu.y, el: uu.element, enemy: true, src: uu });
        } });
        u.face = dir;
        c.emit({ t: 'charge', unit: u, x: u.x, tx });
      } else u._chT = 0.5;
    }
  }
  if (u.isBomber && !u._boom) {
    const d = Math.abs(h.x - u.x);
    if (d <= u.range + 25) {
      u._boom = true;
      control(u, { kind: 'hold', t: 0, dur: EXPLODE.delay + 1 });
      telegraph(c, u, { x: u.x, y: u.y, r: EXPLODE.r, delay: EXPLODE.delay, mult: EXPLODE.mult, el: u.element, art: 'fx.enemy.blast', onFire: () => {
        if (!u.dead) { c.emit({ t: 'selfDestruct', unit: u }); c.killUnit(u, h); }
      } });
      say(c, u, '！', '#ff6060');
    }
  }
  if (u.isSummoner) {
    u._sumT -= dt;
    if (u._sumT <= 0) {
      u._sumT = SUMMON.cd * c.rng.range(0.85, 1.15);
      if (Math.abs(h.x - u.x) < 900) spawnAdds(c, u, 1, null, { max: SUMMON.max, spread: 80 });
    }
  }
});
