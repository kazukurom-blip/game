// シード付き乱数（強化・潜在の再現性とテスト用）。mulberry32。
// state.rngSeed を持つキャラは stateRng(state) で毎回シードを進める（セーブ/ロードしても続きから）。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** makeRng(seed) → () => [0,1)（seed は数値か文字列） */
export function makeRng(seed) {
  return mulberry32(typeof seed === 'number' ? seed : hashSeed(seed));
}

/** state.rngSeed を使って1回分の乱数を引き、シードを進める */
export function stateRng(state) {
  if (!state) return Math.random;
  if (!Number.isInteger(state.rngSeed)) state.rngSeed = (Math.random() * 2 ** 32) >>> 0;
  return () => {
    const r = mulberry32(state.rngSeed)();
    state.rngSeed = (state.rngSeed + 0x9e3779b9) >>> 0;
    return r;
  };
}

/** 重み付き抽選: pairs = [[value, weight], ...] */
export function weighted(pairs, rng = Math.random) {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[pairs.length - 1][0];
}
