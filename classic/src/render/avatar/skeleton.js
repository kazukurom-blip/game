// 型紙（体の各コマの印）。足元の中央が (0,0)、上がマイナス、右向き（+x が前）。
// 部品（体・服・髪…）はこの印に合わせて描く。本物の絵に差し替える時も、この印に部品の基準点を貼る。
//
// 印:
//   view  : 'side'（右向き 3/4）| 'back'（背中。縄・はしご）
//   head  : 頭の基準点（あごの下の中央）
//   neck, hip : 胴の上と下
//   armB/armF : 奥の腕・手前の腕 { s: 肩, h: 手 }
//   legB/legF : 奥の脚・手前の脚 { h: 腰, f: 足首 }, lift: つま先を上げる
//
// コマの名前は「動き/番号」（例: walk1/2）。動きの一覧は ANIMS。

const P = (x, y) => ({ x, y });

function base(o = {}) {
  const dy = o.dy || 0; // 体全体の上下（息・歩きの上下）
  return {
    view: 'side',
    head: P(0 + (o.hx || 0), -27 + dy + (o.hy || 0)),
    neck: P(0, -28 + dy),
    hip: P(0, -17 + dy),
    armB: { s: P(-1, -25 + dy), h: P(-4, -17 + dy) },
    armF: { s: P(1, -25 + dy), h: P(4, -17 + dy) },
    legB: { h: P(-2, -15 + dy), f: P(-3, -4) },
    legF: { h: P(2, -15 + dy), f: P(3, -4) },
  };
}

function with_(f, patch) {
  const o = structuredClone(f);
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !('x' in v) && o[k] && typeof o[k] === 'object') Object.assign(o[k], v);
    else o[k] = v;
  }
  return o;
}

// --- 立ち（3 コマ・0.5 秒）: 息で上下 1 ドット
const stand = [
  base(),
  with_(base({ dy: 1 }), { armB: { h: P(-4, -16) }, armF: { h: P(4, -16) } }),
  with_(base(), { armB: { h: P(-5, -17) }, armF: { h: P(5, -17) } }),
];

// --- 歩き（4 コマ・0.18 秒）: 足を前後に、腕は反対に振る。2・4 コマ目は 1 ドット上
const walk = [
  with_(base({ dy: 1 }), {
    legF: { f: P(6, -4), lift: true }, legB: { f: P(-6, -4) },
    armF: { h: P(-1, -17) }, armB: { h: P(4, -17) },
  }),
  with_(base({ dy: 0 }), {
    legF: { f: P(2, -4) }, legB: { f: P(-2, -6) },
    armF: { h: P(2, -17) }, armB: { h: P(-1, -17) },
  }),
  with_(base({ dy: 1 }), {
    legF: { f: P(-5, -4) }, legB: { f: P(6, -4), lift: true },
    armF: { h: P(6, -18) }, armB: { h: P(-5, -17) },
  }),
  with_(base({ dy: 0 }), {
    legF: { f: P(-1, -6) }, legB: { f: P(2, -4) },
    armF: { h: P(3, -17) }, armB: { h: P(-2, -17) },
  }),
];

// --- ジャンプ（1 コマ）: 手前のひざを上げ、奥の脚は後ろへ。腕は前と後ろへ
const jump = [
  with_(base({ dy: -1 }), {
    legF: { f: P(6, -10), lift: true }, legB: { f: P(-5, -5) },
    armF: { h: P(8, -24) }, armB: { h: P(-7, -22) },
  }),
];

// --- 伏せ（1 コマ）: 腹ばいで頭を上げる
const prone = [
  {
    view: 'side',
    head: P(10, -5),
    neck: P(5, -6), hip: P(-6, -6),
    armB: { s: P(4, -7), h: P(11, -2) },
    armF: { s: P(6, -6), h: P(14, -2) },
    legB: { h: P(-6, -5), f: P(-17, -3) },
    legF: { h: P(-5, -5), f: P(-18, -2) },
    prone: true,
  },
];

// --- 縄（背中・2 コマ・0.25 秒）: 両手で頭の上の縄をつかみ、手と足を交互に
const backBase = () => ({ view: 'back', head: P(0, -27), neck: P(0, -28), hip: P(0, -17) });
const ropeA = {
  ...backBase(),
  armB: { s: P(-4, -25), e: P(-10, -36), h: P(-2, -54) },   // 背中から見て左の腕（高い）
  armF: { s: P(4, -25), e: P(10, -32), h: P(2, -49) },      // 右の腕（低い）
  legB: { h: P(-2, -15), f: P(-2, -9), lift: true },
  legF: { h: P(2, -15), f: P(2, -4) },
};
const rope = [
  ropeA,
  with_(ropeA, {
    armB: { e: P(-10, -32), h: P(-2, -49) }, armF: { e: P(10, -36), h: P(2, -54) },
    legB: { f: P(-2, -4), lift: false }, legF: { f: P(2, -9), lift: true },
  }),
];

// --- はしご（背中・2 コマ・0.25 秒）: 手は左右の柱の近く、足は段に
const ladderA = {
  ...backBase(),
  armB: { s: P(-4, -25), e: P(-11, -35), h: P(-6, -53) },
  armF: { s: P(4, -25), e: P(11, -31), h: P(6, -47) },
  legB: { h: P(-2, -15), f: P(-3, -10), lift: true },
  legF: { h: P(2, -15), f: P(3, -4) },
};
const ladder = [
  ladderA,
  with_(ladderA, {
    armB: { e: P(-11, -31), h: P(-6, -47) }, armF: { e: P(11, -35), h: P(6, -53) },
    legB: { f: P(-3, -4), lift: false }, legF: { f: P(3, -10), lift: true },
  }),
];

// 脚の長さの調整: 足首より上をまとめて LEG_EXTRA だけ上げる（全体の高さ 約 51 px・頭身 約 2.3）
const LEG_EXTRA = 2;
function stretch(frames) {
  for (const f of frames) {
    if (f.prone) continue;
    const up = (q) => { if (q) q.y -= LEG_EXTRA; };
    up(f.head); up(f.neck); up(f.hip);
    for (const a of [f.armB, f.armF]) { up(a.s); up(a.e); up(a.h); }
    for (const l of [f.legB, f.legF]) up(l.h);
  }
  return frames;
}
[stand, walk, jump, rope, ladder].forEach(stretch);

export const ANIMS = {
  stand1: { frames: stand, delay: [0.5, 0.5, 0.5], loop: 'pingpong' },
  walk1: { frames: walk, delay: [0.18, 0.18, 0.18, 0.18], loop: 'loop' },
  jump: { frames: jump, delay: [0], loop: 'none' },
  prone: { frames: prone, delay: [0], loop: 'none' },
  rope: { frames: rope, delay: [0.25, 0.25], loop: 'loop' },
  ladder: { frames: ladder, delay: [0.25, 0.25], loop: 'loop' },
};

export function getFrame(anim, i) {
  const a = ANIMS[anim];
  if (!a) throw new Error(`動きが無い: ${anim}`);
  return a.frames[((i % a.frames.length) + a.frames.length) % a.frames.length];
}

// 経過時間 → コマの番号（立ちは 0,1,2,1,0… の往復）
export function frameIndexAt(anim, t) {
  const a = ANIMS[anim];
  const n = a.frames.length;
  if (n === 1) return 0;
  const d = a.delay[0];
  const k = Math.floor(t / d);
  if (a.loop === 'pingpong') { const m = 2 * n - 2; const q = k % m; return q < n ? q : m - q; }
  return k % n;
}
