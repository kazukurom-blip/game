// 主人公の動き（クラシックの手触り）。DOM を使わない純粋な計算なので node の単体テストで確かめられる。
// 数値は feel.js（= docs/FEEL.md）。
//
// 状態: 'stand' | 'walk' | 'prone' | 'air' | 'rope' | 'ladder'
// 入力: { left, right, up, down, jump (押している), jumpPressed (押した瞬間) }
import { FEEL, moveStats } from './feel.js';
import { segY, segBelow } from '../world/mapFormat.js';

export const HALF_W = 12; // 当たりの横幅の半分（マップの端で止まる）

export function createPlayer(x, y, stats = {}) {
  return {
    x, y, vx: 0, vy: 0,
    state: 'air', seg: null, rope: null,
    facing: 1,
    stateTime: 0,
    dropChain: null, dropT: 0,   // ↓＋ジャンプで降りている足場
    regrabT: 0,                  // 縄から飛び降りた後、つかまれない時間
    invT: 0, knockLock: false,   // 被弾の無敵・ふっとび中（着地まで操作できない）
    climbing: false,
    stats: moveStats(stats.speed, stats.jump),
    events: [],                  // このフレームで起きたこと（音・エフェクト用）: 'jump','land','grab','downjump','ropejump','hurt'
  };
}

function setState(p, s) {
  if (p.state !== s) { p.state = s; p.stateTime = 0; }
}
const onGround = (p) => p.state === 'stand' || p.state === 'walk' || p.state === 'prone';

// 縄・はしごを探す。mode: 'up'（下や途中からつかまる）/ 'down'（上の足場から降りる）
export function findRope(map, p, mode) {
  let best = null, bd = Infinity;
  for (const r of map.ropes) {
    const range = FEEL.ropeGrabRange + (r.ladder ? 4 : 0);
    const d = Math.abs(r.x - p.x);
    if (d > range || d >= bd) continue;
    if (mode === 'up') {
      if (p.y > r.top + 2 && p.y <= r.bottom + FEEL.ropeBottomReach) { best = r; bd = d; }
    } else if (Math.abs(p.y - r.top) <= FEEL.ropeTopReach) { best = r; bd = d; }
  }
  return best;
}

function grab(p, r, fromTop) {
  p.rope = r; p.seg = null; p.vx = 0; p.vy = 0; p.knockLock = false;
  p.x = r.x;
  p.y = fromTop ? r.top + 4 : Math.min(Math.max(p.y, r.top + 4), r.bottom);
  setState(p, r.ladder ? 'ladder' : 'rope');
  p.events.push('grab');
}

function land(p, s) {
  p.seg = s; p.y = segY(s, p.x); p.vy = 0; p.knockLock = false;
  p.dropChain = null; p.dropT = 0;
  setState(p, Math.abs(p.vx) > 1 ? 'walk' : 'stand');
  p.events.push('land');
}

function fall(p) {
  p.seg = null; p.vy = 0;
  setState(p, 'air');
}

function clampX(p, map) {
  if (p.x < HALF_W) { p.x = HALF_W; if (p.vx < 0) p.vx = 0; }
  if (p.x > map.width - HALF_W) { p.x = map.width - HALF_W; if (p.vx > 0) p.vx = 0; }
}

function approach(v, target, rate) {
  if (v < target) return Math.min(target, v + rate);
  return Math.max(target, v - rate);
}

// 1 フレーム進める
export function stepPlayer(p, inp, map, dt) {
  p.events.length = 0;
  p.stateTime += dt;
  if (p.invT > 0) p.invT = Math.max(0, p.invT - dt);
  if (p.regrabT > 0) p.regrabT = Math.max(0, p.regrabT - dt);
  if (p.dropT > 0) { p.dropT = Math.max(0, p.dropT - dt); if (p.dropT === 0) p.dropChain = null; }
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

  if (p.state === 'rope' || p.state === 'ladder') return stepClimb(p, inp, map, dt, dir);
  if (onGround(p) && p.seg) return stepGround(p, inp, map, dt, dir);
  return stepAir(p, inp, map, dt, dir);
}

function stepGround(p, inp, map, dt, dir) {
  const st = p.stats;
  // ↓＋ジャンプ: 浮いた足場から降りる（下に足場がある時だけ）
  if (inp.down && inp.jump) {
    if (!p.seg.chain.ground && segBelow(map, p.x, p.y + 1, p.seg.chain)) {
      p.dropChain = p.seg.chain; p.dropT = FEEL.downJumpIgnore;
      p.vy = -FEEL.downJumpSpeed; p.seg = null;
      setState(p, 'air');
      p.events.push('downjump');
      return;
    }
  }
  // ↓: 足元にはしご・縄の上端があれば降りる。無ければ伏せ
  if (inp.down) {
    const r = findRope(map, p, 'down');
    if (r) { grab(p, r, true); return; }
    p.vx = approach(p.vx, 0, FEEL.walkDecel * 3 * dt);
    moveOnGround(p, map, dt);
    setState(p, 'prone');
    return;
  }
  // ↑: 縄・はしごにつかまる
  if (inp.up && p.regrabT <= 0) {
    const r = findRope(map, p, 'up');
    if (r) { grab(p, r, false); return; }
  }
  // ジャンプ（押しっぱなしで着地のたびに跳ぶ）
  if (inp.jump) {
    p.vy = -st.jumpSpeed; p.seg = null;
    if (dir) p.facing = dir;
    setState(p, 'air');
    p.events.push('jump');
    return;
  }
  // 歩く
  if (dir) {
    p.facing = dir;
    const rate = (p.vx * dir < 0 ? FEEL.turnDecel : FEEL.walkAccel) * dt;
    p.vx = approach(p.vx, dir * st.walkSpeed, rate);
  } else {
    p.vx = approach(p.vx, 0, FEEL.walkDecel * dt);
  }
  moveOnGround(p, map, dt);
  if (onGround(p)) setState(p, dir || Math.abs(p.vx) > 1 ? 'walk' : 'stand');
}

// 線にそって進む。端に来たらとなりの線分へ、無ければ落ちる
function moveOnGround(p, map, dt) {
  if (!p.vx) { p.y = segY(p.seg, p.x); return; }
  let s = p.seg;
  p.x += p.vx * dt * (FEEL.slopeSpeedByLength ? s.cos : 1);
  for (let guard = 0; guard < 8; guard++) {
    if (p.x > s.x2) {
      if (s.next) { s = s.next; continue; }
      p.seg = s; clampX(p, map);
      if (p.x > s.x2) { fall(p); return; }
    } else if (p.x < s.x1) {
      if (s.prev) { s = s.prev; continue; }
      p.seg = s; clampX(p, map);
      if (p.x < s.x1) { fall(p); return; }
    }
    break;
  }
  p.seg = s;
  clampX(p, map);
  p.y = segY(s, p.x);
}

function stepAir(p, inp, map, dt, dir) {
  const st = p.stats;
  if (!p.knockLock && dir) {
    p.facing = dir;
    const cap = FEEL.airMaxSpeed * (st.walkSpeed / FEEL.walkSpeed);
    // 上限を超えている時（ふっとび等）は加速しない
    if (p.vx * dir < cap) p.vx = Math.min(cap, p.vx * dir + FEEL.airAccel * dt) * dir;
  }
  // 空中で ↑: 縄にとびつく
  if (inp.up && !p.knockLock && p.regrabT <= 0) {
    const r = findRope(map, p, 'up');
    if (r) { grab(p, r, false); return; }
  }
  // 重力（速さの平均で進める → ジャンプの高さが計算どおり v²/2g になる）
  const prevX = p.x, prevY = p.y;
  const nvy = Math.min(FEEL.maxFall, p.vy + FEEL.gravity * dt);
  p.y += (p.vy + nvy) / 2 * dt;
  p.vy = nvy;
  p.x += p.vx * dt;
  clampX(p, map);
  setState(p, 'air');
  // 着地: 線を上から下へまたいだ時だけ（下からはすり抜ける）
  if (p.vy >= 0) {
    let best = null, by = Infinity;
    for (const s of map.segs) {
      if (s.chain === p.dropChain) continue;
      if (p.x < s.x1 || p.x > s.x2) continue;
      const yNow = segY(s, p.x);
      const yPrev = segY(s, Math.min(s.x2, Math.max(s.x1, prevX)));
      if (prevY <= yPrev + 1 && p.y >= yNow && yNow < by) { by = yNow; best = s; }
    }
    if (best) land(p, best);
  }
  if (p.y > map.height + 200) { p.y = map.height + 200; p.vy = 0; }
}

function stepClimb(p, inp, map, dt, dir) {
  const r = p.rope, st = p.stats;
  p.x = r.x; p.vx = 0; p.vy = 0;
  // 左右＋ジャンプで飛び降りる（ジャンプだけでは離れない）
  if (inp.jumpPressed && dir) {
    p.rope = null; p.facing = dir;
    p.vx = dir * FEEL.ropeJumpSpeedX; p.vy = -FEEL.ropeJumpSpeedY;
    p.regrabT = FEEL.ropeRegrabDelay;
    setState(p, 'air');
    p.events.push('ropejump');
    return;
  }
  const v = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  p.climbing = v !== 0;
  p.y += v * st.climbSpeed * dt;
  if (p.y < r.top) {
    // 上端: 足場があれば上に立つ
    const s = map.segs.find((q) => p.x >= q.x1 && p.x <= q.x2 && Math.abs(segY(q, p.x) - r.top) <= 8);
    p.rope = null; p.climbing = false;
    if (s) { p.vx = 0; land(p, s); } else { p.y = r.top; p.rope = r; p.climbing = false; }
    return;
  }
  if (p.y > r.bottom) {
    // 下端: 手を離して落ちる
    p.y = r.bottom; p.rope = null; p.climbing = false;
    p.regrabT = FEEL.ropeRegrabDelay;
    fall(p);
  }
}

// 被弾: 敵と反対へふっとび、着地まで操作できない。無敵の間は何もしない
export function hurtPlayer(p, fromX) {
  if (p.invT > 0) return false;
  p.invT = FEEL.hurtInvincible;
  const away = p.x >= fromX ? 1 : -1;
  p.rope = null; p.seg = null; p.climbing = false;
  p.vx = away * FEEL.hurtKnockX; p.vy = -FEEL.hurtKnockY;
  p.knockLock = true;
  setState(p, 'air');
  p.events.push('hurt');
  return true;
}

// 無敵の点滅: 表示するフレームか
export function blinkVisible(p) {
  if (p.invT <= 0) return true;
  return Math.floor(p.invT / FEEL.hurtBlink) % 2 === 0;
}
