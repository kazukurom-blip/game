// ため込み屋（宝ゴブリン）。主人公が近づくと逃げ出し、気づかれてから 14 秒（主人公が追える距離にいる間だけ数える）で裂け目に消える。
// 2 秒ごとに 0.7 秒つまずく（自動戦闘でも追いつけるように）。倒すと種類ごとの大きな報酬（rewards.js）。
// 見た目の出来事: { t: 'goblin', unit, kind: 'spawn' | 'flee' | 'escape' }

import { unitHooks } from '../../combat.js';
import { control } from './util.js';

// chase: 逃げる時間（escapeSec）は、主人公がこの距離より近くにいる間だけ進む。群れの向こうから貫く矢・爆発に当たって逃げ出し、
//        主人公が手前の群れと戦っている間に時間切れになっていた（狩人はほとんど逃がしていた）
export const GOBLIN = { notice: 650, escapeSec: 14, speedMul: 0.42, stumbleEvery: 2.0, stumbleSec: 0.7, lifeMul: 0.75, chase: 800 };

unitHooks.onSpawn.push((c, u) => {
  if (u.def?.kind !== 'goblin') return;
  u.goblin = { kind: u.def.goblin, state: 'idle', t: 0, stumble: GOBLIN.stumbleEvery };
  u.atkT = 999;
  control(u, { kind: 'goblin', t: 0 });
  c.emit({ t: 'goblin', unit: u, kind: 'spawn' });
  c.emit({ t: 'text', x: u.x, y: u.y, z: 110, text: 'ため込み屋だ！', color: '#ffe060' });
});

unitHooks.onMonsterTick.push((c, u, dt) => {
  const g = u.goblin;
  if (!g || u.dead) return;
  u.windup = 99; // 普通の動きはさせない
  const h = c.hero;
  if (!h) return;
  const d = Math.abs(h.x - u.x);
  if (g.state === 'idle') {
    u.anim = u.anim.s === 'idle' ? u.anim : { s: 'idle', t: 0 };
    if (d < GOBLIN.notice || u.life < u.maxLife) { g.state = 'flee'; g.t = 0; c.emit({ t: 'goblin', unit: u, kind: 'flee' }); }
    return;
  }
  if (d <= GOBLIN.chase) g.t += dt;
  if (g.t >= GOBLIN.escapeSec) {
    // 逃げられた（報酬なし。すぐに消す）
    u.dead = true; u.deadT = 2; u.life = 0; u.escaped = true; u.anim = { s: 'die', t: 0 };
    c.emit({ t: 'goblin', unit: u, kind: 'escape' });
    c.emit({ t: 'text', x: u.x, y: u.y, z: 100, text: '逃げられた…', color: '#c0b080' });
    c.game.events.emit('goblinEscape', { unit: u });
    c.game.state.world.goblinEscaped = (c.game.state.world.goblinEscaped || 0) + 1;
    return;
  }
  if (c.isFrozen(u)) return;
  g.stumble -= dt;
  if (g.stumble <= 0) {
    if (g.stumble <= -GOBLIN.stumbleSec) g.stumble = GOBLIN.stumbleEvery;
    if (u.anim.s !== 'idle') u.anim = { s: 'idle', t: 0 };
    return;
  }
  const away = u.x >= h.x ? 1 : -1;
  const spd = (c.H?.move || 220) * GOBLIN.speedMul * c.slowOf(u);
  u.x += away * spd * dt;
  u.face = away;
  if (u.anim.s !== 'walk') u.anim = { s: 'walk', t: 0 };
});
