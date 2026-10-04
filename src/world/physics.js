// 物理: 重力・一方通行足場（メイプル式）・地面・壁・マップ端
export const GRAVITY = 2200;
export const MAX_FALL = 1500;

export function entRect(e) {
  return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
}

export function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// x 付近（±tol）にあり、y（足元）が top〜bottom の範囲にあるロープ
export function findRope(map, x, y, tol = 18) {
  if (!map || !map.ropes) return null;
  let best = null, bd = Infinity;
  for (const r of map.ropes) {
    const d = Math.abs(r.x - x);
    if (d <= tol && y >= r.top - 2 && y <= r.bottom + 2 && d < bd) { best = r; bd = d; }
  }
  return best;
}

// 足元 (x, y) の直下にある足場（y に一致するもの）
export function platformAt(map, x, y, eps = 3) {
  if (!map || !map.platforms) return null;
  for (const p of map.platforms) {
    if (x >= p.x && x <= p.x + p.w && Math.abs(y - p.y) <= eps) return p;
  }
  return null;
}

/**
 * ent: {x, y, w, h, vx, vy, onGround, dropThrough?, noGravity?, gravityScale?}
 * 戻り値: {landed, hitWall, hitCeil}
 * ent.groundPlat に乗っている足場（地面なら null）を設定。
 */
export function moveAndCollide(ent, map, dt) {
  const res = { landed: false, hitWall: false, hitCeil: false };
  if (!map) return res;
  if (ent.dropThrough > 0) ent.dropThrough = Math.max(0, ent.dropThrough - dt);

  if (!ent.noGravity) {
    ent.vy = Math.min(MAX_FALL, (ent.vy || 0) + GRAVITY * (ent.gravityScale ?? 1) * (map.gravity ?? 1) * dt);
  }
  const hw = ent.w / 2;

  // --- X ---
  ent.x += (ent.vx || 0) * dt;
  if (map.walls) {
    for (const w of map.walls) {
      const r = entRect(ent);
      if (rectOverlap(r, w)) {
        if (ent.vx > 0 || (ent.x < w.x + w.w / 2)) ent.x = w.x - hw - 0.01;
        else ent.x = w.x + w.w + hw + 0.01;
        ent.vx = 0; res.hitWall = true;
      }
    }
  }
  if (ent.x < hw) { ent.x = hw; if (ent.vx < 0) ent.vx = 0; res.hitWall = true; }
  if (ent.x > map.width - hw) { ent.x = map.width - hw; if (ent.vx > 0) ent.vx = 0; res.hitWall = true; }

  // --- Y ---
  const prevY = ent.y;
  ent.y += (ent.vy || 0) * dt;
  ent.onGround = false;
  ent.groundPlat = null;

  if (ent.vy >= 0) {
    // 落下中: 足場に上から着地
    let landY = Infinity, landP = null;
    for (const p of map.platforms || []) {
      if (ent.x < p.x || ent.x > p.x + p.w) continue;
      const oneWay = p.solid !== true;
      if (oneWay && ent.dropThrough > 0) continue;
      if (prevY <= p.y + 0.5 && ent.y >= p.y && p.y < landY) { landY = p.y; landP = p; }
    }
    if (landP) {
      ent.y = landY; ent.vy = 0; ent.onGround = true; ent.groundPlat = landP; res.landed = true;
    }
  } else {
    // 上昇中: solid 足場は頭をぶつける
    for (const p of map.platforms || []) {
      if (p.solid !== true) continue;
      if (ent.x < p.x || ent.x > p.x + p.w) continue;
      const bottom = p.y + (p.h || 16);
      const prevTop = prevY - ent.h, top = ent.y - ent.h;
      if (prevTop >= bottom - 0.5 && top < bottom) { ent.y = bottom + ent.h; ent.vy = 0; res.hitCeil = true; }
    }
  }
  // 壁の上面にも着地 / 下面で頭打ち
  if (map.walls) {
    for (const w of map.walls) {
      if (ent.x + hw <= w.x || ent.x - hw >= w.x + w.w) continue;
      if (ent.vy >= 0 && prevY <= w.y + 0.5 && ent.y >= w.y) {
        ent.y = w.y; ent.vy = 0; ent.onGround = true; res.landed = true;
      } else if (ent.vy < 0 && prevY - ent.h >= w.y + w.h - 0.5 && ent.y - ent.h < w.y + w.h) {
        ent.y = w.y + w.h + ent.h; ent.vy = 0; res.hitCeil = true;
      }
    }
  }
  // 地面
  if (ent.y >= map.groundY) {
    ent.y = map.groundY; if (ent.vy > 0) ent.vy = 0; ent.onGround = true; ent.groundPlat = null; res.landed = true;
  }
  if (ent.y - ent.h < 0 && ent.vy < 0) { ent.y = ent.h; ent.vy = 0; res.hitCeil = true; }
  return res;
}
