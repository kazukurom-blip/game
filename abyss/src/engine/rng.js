// 乱数（シード付き）。ゲーム中はすべてこの RNG を通す。テストではシードを固定して再現できる。
// sfc32 ベース。state は 4 つの 32bit 整数。

export class RNG {
  constructor(seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) {
    this.setSeed(seed);
  }
  setSeed(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    const sm = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    for (let i = 0; i < 12; i++) this.next();
  }
  getState() { return [this.a, this.b, this.c, this.d]; }
  setState(st) { [this.a, this.b, this.c, this.d] = st.map((v) => v >>> 0); }
  /** 0 以上 1 未満 */
  next() {
    let { a, b, c, d } = this;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t / 4294967296;
  }
  /** [min, max) の実数 */
  range(min, max) { return min + (max - min) * this.next(); }
  /** [min, max] の整数 */
  int(min, max) { return Math.floor(min + (max - min + 1) * this.next()); }
  /** 確率 p (0..1) で true */
  chance(p) { return this.next() < p; }
  pick(arr) { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }
  /** weightFn(item) の重みで 1 つ選ぶ。重み 0 以下は除外 */
  weighted(arr, weightFn = (x) => x.weight ?? 1) {
    let total = 0;
    for (const x of arr) { const w = weightFn(x); if (w > 0) total += w; }
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const x of arr) {
      const w = weightFn(x);
      if (w <= 0) continue;
      if ((r -= w) < 0) return x;
    }
    return arr[arr.length - 1];
  }
  /** 重複なしで n 個選ぶ（重み付き） */
  weightedN(arr, n, weightFn = (x) => x.weight ?? 1) {
    const pool = arr.slice();
    const out = [];
    while (out.length < n && pool.length) {
      const x = this.weighted(pool, weightFn);
      if (x === undefined) break;
      out.push(x);
      pool.splice(pool.indexOf(x), 1);
    }
    return out;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  /** 平均 mean のポアソン乱数（小さい mean 向け） */
  poisson(mean) {
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.gauss()));
    const L = Math.exp(-mean); let k = 0; let p = 1;
    do { k++; p *= this.next(); } while (p > L);
    return k - 1;
  }
  gauss() {
    let u = 0; let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** 文字列から 32bit のハッシュ（決定的な乱数の種などに） */
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const rng = new RNG();
