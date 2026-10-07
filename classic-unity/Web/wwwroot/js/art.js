// ドット絵（PNG）の敵。art/mobs.json にある敵だけ絵で描き、ほかの敵は今までの仮の絵（render.js）のまま。
// 絵は tools/make_art.mjs が作る（右向き・基準点は足元の中央）。読み込みが終わるまでは仮の絵で描く。
const art = { mobs: {}, img: {} };

(async () => {
  try {
    const r = await fetch('art/mobs.json');
    if (!r.ok) return;
    const j = await r.json();
    await Promise.all(Object.entries(j.mobs).map(async ([id, m]) => {
      const img = new Image();
      img.src = m.png;
      try { await img.decode(); art.mobs[id] = m; art.img[id] = img; } catch { /* 読めない絵は仮の絵のまま */ }
    }));
  } catch { /* 絵が無くても遊べる */ }
})();

export const hasMobArt = (id) => !!art.mobs[id];
export const mobArtInfo = (id) => art.mobs[id];

// 動きと時間 → コマの番号
function pick(a, t, prog) {
  const n = a.f.length;
  if (n === 1) return a.f[0];
  if (prog != null) return a.f[Math.min(n - 1, Math.floor(prog * n))];
  const k = Math.floor(t / (a.d || 0.2));
  if (a.loop === 'ping') { const m = 2 * n - 2; const q = k % m; return a.f[q < n ? q : m - q]; }
  if (a.loop === 'none') return a.f[Math.min(n - 1, k)];
  return a.f[k % n];
}

/** 敵を絵で描く。描けたら true。(x, y) は足元、facing 1 = 右。motion は Core の Mob.Motion。air = 跳ねて宙にいる。fade = 倒れる進み（0〜1） */
export function drawMobArt(g, id, motion, t, x, y, facing, air, fade) {
  const m = art.mobs[id];
  if (!m) return false;
  const A = m.anims;
  let a = A.stand, prog = null;
  if (motion === 'die1' || fade > 0) { a = A.die1 || A.hit1 || A.stand; prog = Math.min(0.999, fade * 1.6); }
  else if (motion === 'hit1') a = A.hit1 || A.stand;
  else if (air && A.air) a = A.air;
  else if (motion === 'move' || motion === 'fly' || motion === 'attack1' || motion === 'skill1') a = A.move || A.stand;
  const fi = pick(a, t, prog);
  const dx = Math.round(x), dy = Math.round(y);
  g.save();
  g.imageSmoothingEnabled = false;
  if (facing >= 0) g.drawImage(art.img[id], fi * m.fw, 0, m.fw, m.fh, dx - m.ox, dy - m.oy, m.fw, m.fh);
  else { g.translate(dx, 0); g.scale(-1, 1); g.drawImage(art.img[id], fi * m.fw, 0, m.fw, m.fh, -(m.fw - m.ox), dy - m.oy, m.fw, m.fh); }
  g.restore();
  return true;
}
