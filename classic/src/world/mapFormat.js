// マップのデータ形式と読み込み
//
// データ（classic/src/data/maps/*.js）:
// {
//   id, name, area,               // 名前
//   width, height,                // マップの広さ（px）。カメラはこの中だけ動く
//   bgm,                          // 曲の ID（audio の playBgm に渡す）
//   background: [ {layer, parallax, ...} ],  // 背景の層（DESIGN.md 5-5。render/background.js が描く）
//   footholds: [                  // 足場の線（つながった折れ線）。左から右へ点を並べる
//     { id, points: [[x,y], ...], ground?: true, tile?: 'grass' }
//       // ground: 一番下の地面（下まで土で埋める。↓＋ジャンプで降りられない）
//       // それ以外は浮いた足場（厚さ 16。下からすり抜けて乗れる・↓＋ジャンプで降りる）
//   ],
//   ropes: [ { x, top, bottom, ladder?: true } ],  // 縄（幅 8）・はしご（幅 16）。top/bottom は足元の y
//   portals: [ { name, x, y, type: 'spawn'|'visible'|'hidden', to?, toPortal? } ],
// }
//
// 読み込むと、足場の線を「線分」に分け、となりの線分を prev/next でつなぐ（クラシックの足場と同じ考え方）。

export function loadMap(data) {
  const segs = [];
  const chains = [];
  for (const fh of data.footholds) {
    const pts = fh.points;
    if (!pts || pts.length < 2) throw new Error(`footholds ${fh.id}: 点が 2 つ以上必要`);
    const chain = { id: fh.id, ground: !!fh.ground, tile: fh.tile || 'grass', segs: [] };
    let prev = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      if (!(x2 > x1)) throw new Error(`footholds ${fh.id}: 点は左から右へ（縦の線は未対応）`);
      const s = { id: `${fh.id}#${i}`, chain, x1, y1, x2, y2, prev, next: null,
        len: Math.hypot(x2 - x1, y2 - y1), cos: (x2 - x1) / Math.hypot(x2 - x1, y2 - y1) };
      if (prev) prev.next = s;
      chain.segs.push(s); segs.push(s);
      prev = s;
    }
    chains.push(chain);
  }
  const ropes = (data.ropes || []).map((r, i) => ({ id: i, ladder: !!r.ladder, x: r.x, top: r.top, bottom: r.bottom }));
  for (const r of ropes) if (!(r.bottom > r.top)) throw new Error(`ropes ${r.id}: bottom > top が必要`);
  return {
    ...data,
    segs, chains, ropes,
    portals: data.portals || [],
    background: data.background || [],
  };
}

export function segY(s, x) {
  const t = (x - s.x1) / (s.x2 - s.x1);
  return s.y1 + (s.y2 - s.y1) * t;
}

// x の真下（y より下、または同じ高さ）にある一番近い線分
export function segBelow(map, x, y, ignoreChain = null) {
  let best = null, by = Infinity;
  for (const s of map.segs) {
    if (s.chain === ignoreChain) continue;
    if (x < s.x1 || x > s.x2) continue;
    const sy = segY(s, x);
    if (sy >= y - 0.5 && sy < by) { by = sy; best = s; }
  }
  return best;
}

export function spawnPoint(map, name = null) {
  const p = map.portals.find((q) => (name ? q.name === name : q.type === 'spawn')) || map.portals[0];
  if (p) return { x: p.x, y: p.y };
  return { x: map.width / 2, y: 0 };
}
