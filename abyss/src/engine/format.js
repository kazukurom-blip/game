// 数値・時間の表示。設定で「日本式（万・億・兆…）」「英語式（K・M・B…）」「指数（1.23e45）」を切り替える。

const JP_UNITS = ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極', '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];
const EN_UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];

let mode = 'jp';
export function setNumberMode(m) { mode = m === 'en' || m === 'sci' ? m : 'jp'; }
export function getNumberMode() { return mode; }

function trimNum(x, sig = 4) {
  // 有効数字 sig 桁。末尾の 0 は消す
  if (x === 0) return '0';
  const digits = Math.floor(Math.log10(Math.abs(x))) + 1;
  const dec = Math.max(0, sig - digits);
  let s = x.toFixed(dec);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

function sci(n) {
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = n / 10 ** e;
  return `${m.toFixed(2)}e${e}`;
}

/** 大きな数を短く。整数で 1 万未満はカンマ区切り */
export function fmt(n, opts = {}) {
  if (n === undefined || n === null || Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const neg = n < 0; const a = Math.abs(n);
  let s;
  if (a < 10000) {
    s = opts.dec !== undefined ? a.toFixed(opts.dec).replace(/\.0+$/, '') : (a < 100 && !Number.isInteger(a) && !opts.int ? trimNum(a, 3) : Math.floor(a).toLocaleString('en-US'));
  } else if (mode === 'sci') {
    s = sci(a);
  } else if (mode === 'en') {
    const idx = Math.floor(Math.log10(a) / 3);
    if (idx >= EN_UNITS.length) s = sci(a);
    else s = trimNum(a / 1000 ** idx, 4) + EN_UNITS[idx];
  } else {
    const idx = Math.floor(Math.log10(a) / 4);
    if (idx >= JP_UNITS.length) s = sci(a);
    else s = trimNum(a / 10000 ** idx, 4) + JP_UNITS[idx];
  }
  return neg ? `-${s}` : s;
}

/** 整数として表示（小数を出さない） */
export function fmtInt(n) { return fmt(Math.floor(n || 0), { int: true }); }

/** パーセント。v=12.5 → "12.5%" */
export function fmtPct(v, dec = 1) {
  if (!Number.isFinite(v)) return '0%';
  const a = Math.abs(v);
  if (a >= 10000) return `${fmt(v)}%`;
  const d = a >= 100 ? 0 : dec;
  return `${Number(v.toFixed(d))}%`;
}

/** 秒 → 「1時間23分」「4分05秒」「12.3秒」 */
export function fmtTime(sec, short = false) {
  sec = Math.max(0, sec || 0);
  if (sec < 60) return sec < 10 && !Number.isInteger(sec) ? `${sec.toFixed(1)}秒` : `${Math.floor(sec)}秒`;
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  // 短い形はちょうどのとき 0 を出さない（「6時間0分」→「6時間」・「1日0時間」→「1日」）
  if (d > 0) return short ? `${d}日${h ? `${h}時間` : ''}` : `${d}日${h}時間${m}分`;
  if (h > 0) return short ? `${h}時間${m ? `${m}分` : ''}` : `${h}時間${m}分${String(s).padStart(2, '0')}秒`;
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

/** 「mm:ss」 */
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** ローマ数字（苦行の段階など） */
export function roman(n) {
  if (n <= 0) return '0';
  const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}
