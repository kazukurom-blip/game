// 背景・地面/足場・アイコン・乗り物・UI の画像差し替え（仕様: docs/SPEC_SPRITES.md「背景・タイル・アイコン・乗り物・UI の画像差し替え」）
//  - manifest.json の節 bg / tiles / icons / vehicles / ui を読む（sprites.js の setSpriteManifest から setArtManifest が呼ばれる）。
//  - 画像は最初に必要になった時に読み込む（遅延）。読み込み中・失敗・spriteMode='procedural' の間は null を返し、呼び出し側は今のコードの絵を描く。
//  - 読み込み時の前処理: 乗り物はマゼンタ #FF00FF の印からタイヤの位置を読んで印を消す／タイヤは円の中心と半径／地面は下端の色。
//  - 装備アイコンはスタイルごとの1枚を、基準色（そのスタイルの最初のアイテムの色）→ アイテムの色へ recolor.js で塗り替える。
import { getSpriteMode } from './sprites.js';
import { colorInfo, effectiveColor, recolorData, HEX6, sameColor, rgbHsl } from './recolor.js';
import { ITEMS } from '../data/items.js';

export const ART_SECTIONS = ['bg', 'tiles', 'icons', 'vehicles', 'ui'];
const DEF_BASE = 'assets/sprites/';
let MAN = null;
let BASE = DEF_BASE;
let REV = 0;
const IMG = new Map();   // file → R { st: 1 読込中 / 2 完了 / 3 失敗, img, w, h, wait[], meta, scaled: Map }
const ST = { entries: 0, requested: 0, loaded: 0, failed: 0, errors: [], prepMs: 0, recolors: 0, evicted: 0 };
const ICON_CACHE = new Map();   // key → canvas（色替え・縮小済み）
const VEH_CACHE = new Map();    // key → canvas（縮小・色替え済みの車体）
const ICON_WORK = 128;          // アイコンの作業用の大きさ（256 → 128 に縮めてから色替え）

const hasDom = () => typeof Image !== 'undefined' && (typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined');
function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch { /* fallthrough */ } }
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function note(m) { ST.errors.push(m); if (ST.errors.length > 20) ST.errors.shift(); try { console.warn('[art] ' + m); } catch { /* ignore */ } }
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ================================================================ manifest
const FILE_RE = /^[A-Za-z0-9_\-./]+\.(png|webp|jpe?g)$/i;
export function validArtFile(f) { return typeof f === 'string' && FILE_RE.test(f) && !f.includes('..') && !f.startsWith('/') && !/^[a-z]+:/i.test(f); }
function normEntry(v) {
  if (typeof v === 'string') return validArtFile(v) ? { file: v } : null;
  if (v && typeof v === 'object' && !Array.isArray(v) && validArtFile(v.file)) {
    const o = { file: v.file };
    for (const k of ['parallax', 'groundY', 'surface', 'scale', 'wheelR', 'alpha']) if (typeof v[k] === 'number' && isFinite(v[k])) o[k] = v[k];
    for (const k of ['base', 'accent']) if (typeof v[k] === 'string' && HEX6.test(v[k])) o[k] = v[k].toLowerCase();
    if (v.recolor === false) o.recolor = false;
    return o;
  }
  return null;
}
/** manifest（JSON 全体）から bg / tiles / icons / vehicles / ui の節を読む。不正な項目は無視 */
export function setArtManifest(j, base = DEF_BASE) {
  MAN = null; BASE = base || DEF_BASE; IMG.clear(); ICON_CACHE.clear(); VEH_CACHE.clear(); BG_LRU.clear(); REV++;
  ST.entries = ST.requested = ST.loaded = ST.failed = 0; ST.prepMs = 0; ST.recolors = 0; ST.evicted = 0;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  const M = {};
  let n = 0;
  for (const sec of ART_SECTIONS) {
    M[sec] = {};
    const src = j[sec];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const k of Object.keys(src)) { const e = normEntry(src[k]); if (e) { M[sec][k] = e; n++; } else note(`${sec}.${k}: ファイル名が不正なので無視しました`); }
  }
  ST.entries = n;
  MAN = n ? M : null;
  return !!MAN;
}
export function artRev() { return REV; }
export function artStats() { return { ...ST, errors: ST.errors.slice(-5), files: IMG.size, iconCache: ICON_CACHE.size, vehicleCache: VEH_CACHE.size }; }
let ENABLED = true;
/** この仕組みだけを止める／戻す（計測・デバッグ用。キャラ・敵のスプライトは spriteMode のまま） */
export function setArtEnabled(v) { ENABLED = v !== false; REV++; return ENABLED; }
const on = () => ENABLED && !!MAN && getSpriteMode() === 'auto';
/** manifest にその項目があるか（読み込み状態は問わない） */
export function hasArt(sec, key) { return !!(MAN && MAN[sec] && MAN[sec][key]); }
function entry(sec, key) { return MAN && MAN[sec] ? MAN[sec][key] || null : null; }

// ================================================================ 読み込み
function load(E, kind) {
  let r = IMG.get(E.file);
  if (r) return r;
  r = { st: 3, img: null, w: 0, h: 0, wait: [], meta: null, kind };
  IMG.set(E.file, r);
  if (!hasDom()) return r;
  try {
    const im = new Image();
    r.st = 1; ST.requested++;
    const done = (ok) => {
      if (r.st !== 1) return;
      if (ok) {
        r.w = im.naturalWidth || im.width; r.h = im.naturalHeight || im.height;
        if (r.w > 0 && r.h > 0) {
          const t0 = now();
          try { r.img = prep(kind, im, r, E); } catch (e) { note('前処理に失敗: ' + E.file + ' ' + e.message); r.img = null; }
          ST.prepMs += now() - t0;
        }
      }
      if (r.img) { r.st = 2; ST.loaded++; } else { r.st = 3; ST.failed++; if (ok) note('画像を使えません: ' + E.file); }
      REV++;
      for (const f of r.wait.splice(0)) f();
    };
    im.onerror = () => { note('画像を読めません: ' + E.file); done(false); };
    im.onload = () => {
      // 大きい画像（背景・タイトル）は decode() を待ってから使う（最初の描画で止まらないように）
      if (typeof im.decode === 'function') im.decode().then(() => done(true), () => done(true));
      else done(true);
    };
    im.src = BASE + E.file;
  } catch (e) { r.st = 3; ST.failed++; note('画像の読み込みに失敗: ' + E.file + ' ' + e.message); }
  return r;
}
/** 読み込み済みなら R、まだなら読み込みを始めて null */
function ready(sec, key, kind) {
  if (!on()) return null;
  const E = entry(sec, key);
  if (!E) return null;
  const r = load(E, kind || sec);
  return r.st === 2 ? r : null;
}
/** その項目の状態: '' = manifest に無い / 'loading' / 'ready' / 'failed' */
export function artState(sec, key) {
  if (!on()) return '';
  const E = entry(sec, key);
  if (!E) return '';
  const r = load(E, sec);
  return r.st === 2 ? 'ready' : r.st === 1 ? 'loading' : 'failed';
}
/** 全画像（または節を絞って）を先読み。完了で解決（テスト・スクショ用） */
export function preloadArt(secs = ART_SECTIONS) {
  if (!MAN) return Promise.resolve(0);
  const all = [];
  for (const sec of secs) for (const k in MAN[sec] || {}) all.push(load(MAN[sec][k], kindOf(sec, k)));
  return Promise.all(all.map((r) => new Promise((res) => { if (r.st !== 1) res(); else r.wait.push(res); }))).then(() => ST.loaded);
}
const kindOf = (sec, k) => (sec === 'vehicles' ? (/_wheel$/.test(k) ? 'wheel' : 'vehicle') : sec === 'tiles' ? 'tile' : sec);

function pixels(im, w, h) {
  const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, w, h);
  return [c, g, g.getImageData(0, 0, w, h)];
}
function prep(kind, im, r, E) {
  if (kind === 'vehicle') return prepVehicle(im, r, E);
  if (kind === 'wheel') return prepWheel(im, r);
  if (kind === 'tile') return prepTile(im, r);
  return im;
}

// ================================================================ 乗り物（マゼンタの印 → タイヤの位置）
const isMagenta = (d, i) => d[i + 3] > 100 && d[i] > 190 && d[i + 2] > 190 && d[i + 1] < 90;
const isMagentaish = (d, i) => d[i + 3] > 20 && d[i] > 120 && d[i + 2] > 120 && d[i + 1] < 0.55 * Math.min(d[i], d[i + 2]) && Math.abs(d[i] - d[i + 2]) < 90;
/** RGBA 配列からマゼンタの印を2つ探す（左右に分ける）→ [{x, y, n, r}]（x の小さい順。見つからなければ空） */
export function findMarkers(d, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isMagenta(d, (y * w + x) * 4)) pts.push(x, y);
  if (pts.length < 4) return [];
  // x で並べて一番大きい隙間で2つに分ける
  const xs = []; for (let i = 0; i < pts.length; i += 2) xs.push(i);
  xs.sort((a, b) => pts[a] - pts[b]);
  let gap = 0, at = -1;
  for (let k = 1; k < xs.length; k++) { const g = pts[xs[k]] - pts[xs[k - 1]]; if (g > gap) { gap = g; at = k; } }
  const groups = gap > 8 && at > 0 ? [xs.slice(0, at), xs.slice(at)] : [xs];
  return groups.map((gp) => {
    let sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (const i of gp) { const x = pts[i], y = pts[i + 1]; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x: sx / gp.length, y: sy / gp.length, n: gp.length, r: Math.max(x1 - x0, y1 - y0) / 2 + 1 };
  }).sort((a, b) => a.x - b.x);
}
/** 車体の主な色（色の濃い画素の色相のヒストグラムの一番多い所の平均）。印・輪郭線は除く */
export function dominantColor(d) {
  const bins = new Float64Array(36), acc = Array.from({ length: 36 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 200 || isMagentaish(d, i)) continue;
    const [h, s, l] = rgbHsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.35 || l < 0.18 || l > 0.85) continue;
    const b = Math.min(35, (h / 10) | 0);
    bins[b]++; const a = acc[b]; a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; a[3]++;
  }
  let bi = -1, bn = 0;
  for (let b = 0; b < 36; b++) { const n = bins[b] + 0.5 * (bins[(b + 35) % 36] + bins[(b + 1) % 36]); if (n > bn) { bn = n; bi = b; } }
  if (bi < 0 || acc[bi][3] < 20) return null;
  const a = acc[bi];
  return '#' + [a[0], a[1], a[2]].map((v) => Math.round(v / a[3]).toString(16).padStart(2, '0')).join('');
}
function prepVehicle(im, r, E) {
  const [c, g, id] = pixels(im, r.w, r.h);
  const d = id.data;
  const mk = findMarkers(d, r.w, r.h);
  let wheels = null, guessed = false;
  if (mk.length >= 2) {
    const a = mk[0], b = mk[mk.length - 1];
    wheels = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    // 印を消す（印の周り 3 倍の範囲のマゼンタっぽい画素を透明に）
    for (const m of [a, b]) {
      const R = Math.max(6, m.r * 3);
      for (let y = Math.max(0, (m.y - R) | 0); y <= Math.min(r.h - 1, m.y + R); y++) for (let x = Math.max(0, (m.x - R) | 0); x <= Math.min(r.w - 1, m.x + R); x++) {
        const i = (y * r.w + x) * 4;
        if (isMagentaish(d, i)) d[i + 3] = 0;
      }
    }
    g.putImageData(id, 0, 0);
  } else {
    // 印が無い: 絵の範囲の下の方、左右 22% の所にタイヤがあるとみなす
    let x0 = r.w, x1 = -1, y1 = -1;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (d[(y * r.w + x) * 4 + 3] > 64) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const bw = x1 - x0, wy = y1 - bw * 0.07;
    wheels = [{ x: x0 + bw * 0.2, y: wy }, { x: x0 + bw * 0.8, y: wy }];
    guessed = true;
    note(`${E.file}: マゼンタ #FF00FF の印が見つからないので、タイヤの位置を推定しました`);
  }
  let top = 0;
  find: for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x += 2) if (d[(y * r.w + x) * 4 + 3] > 64) { top = y; break find; }
  r.meta = { top, wheels, guessed, markers: mk.length, base: E.base || (E.recolor === false ? null : dominantColor(d)) };
  return c;
}
function prepWheel(im, r) {
  const [c, , id] = pixels(im, r.w, r.h);
  const d = id.data;
  let x0 = r.w, x1 = -1, y0 = r.h, y1 = -1;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (d[(y * r.w + x) * 4 + 3] > 64) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  r.meta = { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, r: Math.max(x1 - x0 + 1, y1 - y0 + 1) / 2 };
  return c;
}
function prepTile(im, r) {
  // 下端 8 行の平均色（絵の下を塗りつぶす色）
  const [, , id] = pixels(im, r.w, r.h);
  const d = id.data;
  let n = 0, R = 0, G = 0, B = 0;
  for (let y = Math.max(0, r.h - 8); y < r.h; y++) for (let x = 0; x < r.w; x += 2) { const i = (y * r.w + x) * 4; if (d[i + 3] < 200) continue; R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  r.meta = { fill: n > r.w / 4 ? `rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})` : null };
  // 大きい画像は ImageBitmap にしておく（描画が速い）
  return im;
}

// 半分ずつ縮める（大きく縮めた時のギザギザを防ぐ）
function downscale(src, sw, sh, tw, th) {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  let cur = src, cw = sw, ch = sh;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const nw = Math.max(tw, Math.round(cw / 2)), nh = Math.max(th, Math.round(ch / 2));
    const c = canvas(nw, nh), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = c; cw = nw; ch = nh;
  }
  const c = canvas(tw, th), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, cw, ch, 0, 0, tw, th);
  return c;
}
function recolorCanvas(c, maps) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const id = g.getImageData(0, 0, c.width, c.height);
  const ms = maps.filter(([b, t]) => b && t && HEX6.test(b) && HEX6.test(t) && !sameColor(b, t));
  if (!ms.length) return c;
  const cm = ms.map(([b, t]) => [effectiveColor(colorInfo(b), [id.data]), colorInfo(t)]);
  recolorData(id.data, cm);
  g.putImageData(id, 0, 0);
  ST.recolors++;
  return c;
}
function cachePut(M, k, v, max) { if (M.size >= max) M.delete(M.keys().next().value); M.set(k, v); }

// ================================================================ 背景（bg）
// キー: <地域>_<town|field>_<far|mid|lights>。地域内のバリアント専用の絵は <地域>_<town|field>_v<0-3>_<層>（あれば優先）。
// 屋内のバリアント（トンネル・金庫など）は v 付きのキーがある時だけ画像にする。
export const BG_DEF = { far: { parallax: 0.1 }, mid: { parallax: 0.3 } };
function bgKey(sc, layer) {
  const kind = sc.town ? 'town' : 'field';
  const kv = `${sc.region}_${kind}_v${sc.v}_${layer}`;
  if (hasArt('bg', kv)) return kv;
  if (sc.indoor) return null;
  const k = `${sc.region}_${kind}_${layer}`;
  return hasArt('bg', k) ? k : null;
}
/**
 * シーン sc（background.js の sceneOf）の背景画像。中景（mid）が無い/読み込み中 → null（コードの背景）。
 * manifest にある遠景（far）が読み込み中なら待つ（null）。失敗した層は省く。
 * 戻り値: { far, mid, lights }（各 { img, w, h, parallax, groundY } または null）
 */
// 背景の画像は大きい（2560×720 = 展開後 約 7MB）ので、最近使った BG_KEEP 枚（3 シーン分）だけ持ち、古い物は手放す（また必要になれば読み直す）
const BG_KEEP = 9;
const BG_LRU = new Map();
function touchBg(file) {
  if (BG_LRU.has(file)) { if (BG_LRU.size > 1) { BG_LRU.delete(file); BG_LRU.set(file, 1); } return; }
  BG_LRU.set(file, 1);
  let guard = BG_LRU.size;
  while (BG_LRU.size > BG_KEEP && guard-- > 0) {
    const f = BG_LRU.keys().next().value;
    BG_LRU.delete(f);
    const r = IMG.get(f);
    if (r && r.st === 1) { BG_LRU.set(f, 1); continue; }   // 読み込み中は手放さない
    if (r) { IMG.delete(f); ST.evicted = (ST.evicted || 0) + 1; }
  }
}
export function bgArt(sc) {
  if (!on() || !sc || sc.special) return null;
  const km = bgKey(sc, 'mid');
  if (!km) return null;
  const out = { far: null, mid: null, lights: null };
  let wait = false;
  for (const layer of ['far', 'mid', 'lights']) {
    const k = layer === 'mid' ? km : bgKey(sc, layer);
    if (!k) continue;
    const E = entry('bg', k), r = load(E, 'bg');
    touchBg(E.file);
    if (r.st === 1 && layer !== 'lights') wait = true;
    if (r.st !== 2) continue;
    out[layer] = { img: r.img, w: r.w, h: r.h, key: k, parallax: E.parallax ?? (BG_DEF[layer] || BG_DEF.mid).parallax, groundY: E.groundY ?? 640, alpha: E.alpha ?? 1 };
  }
  return out.mid && !wait ? out : null;
}

// ================================================================ 地面・足場（tiles）
// キー: <地域>_ground（512×256、上から surface=40px が歩く面）/ <地域>_platform（512×96、surface=16px が乗る面）。
// 屋内のバリアントは <地域>_v<0-3>_ground 等がある時だけ。
function tileKey(sc, what) {
  const kv = `${sc.region}_v${sc.v}_${what}`;
  if (hasArt('tiles', kv)) return kv;
  if (sc.indoor) return null;
  const k = `${sc.region}_${what}`;
  return hasArt('tiles', k) ? k : null;
}
/** { img, w, h, surface, scale, fill } または null */
export function tileArt(sc, what) {
  if (!on() || !sc || sc.special) return null;
  const k = tileKey(sc, what);
  if (!k) return null;
  const E = entry('tiles', k), r = load(E, 'tile');
  if (r.st !== 2) return null;
  return { img: r.img, w: r.w, h: r.h, key: k, surface: E.surface ?? (what === 'ground' ? 40 : 16), scale: E.scale ?? 1, fill: r.meta && r.meta.fill };
}

// ================================================================ アイコン（icons）
// 装備: equip/<slot>_<style>（基準色 → アイテムの色へ塗り替え）/ 消耗品・素材: item/<id> / スキル: skill/<id>
let EQUIP_BASE = null;
/** そのスタイルの基準色 [主, アクセント]（CODEX_BATCH_03 の各行の色 = そのスタイルの最初のアイテムの色） */
export function equipBase(slot, style) {
  if (!EQUIP_BASE) {
    EQUIP_BASE = {};
    try { for (const it of Object.values(ITEMS)) if (it.type === 'equip' && it.slot !== 'pet' && it.look && it.look.style) { const k = it.slot + '_' + it.look.style; if (!EQUIP_BASE[k]) EQUIP_BASE[k] = [it.look.color, it.look.accent]; } } catch { /* ignore */ }
  }
  return EQUIP_BASE[slot + '_' + style] || null;
}
/** アイテムのアイコンのキー（manifest の icons の中）。無ければ null */
export function itemIconKey(item) {
  if (!item) return null;
  const look = item.look;
  if (look && look.style) {
    if (item.slot === 'pet' || /Pet$/.test(look.style)) return null;
    return `equip/${item.slot}_${look.style}`;
  }
  return item.id ? `item/${item.id}` : null;
}
/**
 * アイテムのアイコン（ICON_WORK 四方の canvas。装備は色替え済み）。無い/読み込み中 → null
 */
export function itemIconArt(item) {
  const k = itemIconKey(item);
  if (!k || !on() || !hasArt('icons', k)) return null;
  const r = ready('icons', k, 'icons');
  if (!r) return null;
  const E = entry('icons', k);
  const look = item.look;
  let maps = null;
  if (look && look.style && E.recolor !== false) {
    const b = equipBase(item.slot, look.style) || [];
    const base = E.base || b[0], acc = E.accent || b[1];
    maps = [[base, look.color], [acc, look.accent]];
  }
  const ck = k + '|' + (maps ? maps.map((m) => m.join('>')).join(',') : '');
  let c = ICON_CACHE.get(ck);
  if (!c) {
    c = downscale(r.img, r.w, r.h, ICON_WORK, ICON_WORK * r.h / r.w);
    if (maps) recolorCanvas(c, maps);
    cachePut(ICON_CACHE, ck, c, 300);
  }
  return c;
}
/** スキルのアイコン（ICON_WORK 四方の canvas）。無い/読み込み中 → null */
export function skillIconArt(skill) {
  if (!skill || !skill.id || !on()) return null;
  const k = 'skill/' + skill.id;
  if (!hasArt('icons', k)) return null;
  const r = ready('icons', k, 'icons');
  if (!r) return null;
  let c = ICON_CACHE.get(k);
  if (!c) { c = downscale(r.img, r.w, r.h, ICON_WORK, ICON_WORK * r.h / r.w); cachePut(ICON_CACHE, k, c, 300); }
  return c;
}

// ================================================================ 乗り物（vehicles）
// キー: <kind>（1024×512・右向き・タイヤなし・タイヤの中心にマゼンタの印）と <kind>_wheel（256×256）。
/**
 * 乗り物の絵。geo = { rear: [x, y], front: [x, y], wheelR }（ゲームの座標でのタイヤの中心と半径）。
 * color を渡すと車体の主な色をその色に塗り替える（police は塗り替えない。manifest で "recolor": false / "base" 指定可）。
 * 戻り値: { body: canvas, bx, by, bw, bh（ゲームの座標で置く位置）, wheel: canvas|null, wr（タイヤの半径）, guessed } または null
 */
export function vehicleArt(kind, geo, color, zoom = 2) {
  if (!on() || !hasArt('vehicles', kind)) return null;
  const r = ready('vehicles', kind, 'vehicle');
  if (!r) return null;
  const wk = kind + '_wheel';
  let wr = null;
  if (hasArt('vehicles', wk)) {
    const E2 = entry('vehicles', wk), r2 = load(E2, 'wheel');
    if (r2.st === 1) return null;             // タイヤの読み込みを待つ（車体だけ先に出さない）
    if (r2.st === 2) wr = r2;
  }
  const E = entry('vehicles', kind), m = r.meta;
  const [a, b] = m.wheels;
  const s = (geo.front[0] - geo.rear[0]) / Math.max(1, b.x - a.x);
  const bw = r.w * s, bh = r.h * s;
  const bx = geo.rear[0] - a.x * s, by = geo.rear[1] - ((a.y + b.y) / 2) * s;
  const tw = Math.max(1, Math.round(bw * zoom)), th = Math.max(1, Math.round(bh * zoom));
  const doColor = color && HEX6.test(color) && m.base && E.recolor !== false && kind !== 'police';
  const ck = kind + '|' + tw + '|' + (doColor ? color : '');
  let body = VEH_CACHE.get(ck);
  if (!body) {
    body = downscale(r.img, r.w, r.h, tw, th);
    if (doColor) recolorCanvas(body, [[m.base, color]]);
    cachePut(VEH_CACHE, ck, body, 40);
  }
  let wheel = null;
  const R = E.wheelR ?? geo.wheelR;
  if (wr) {
    const wk2 = wk + '|' + Math.round(R * zoom);
    wheel = VEH_CACHE.get(wk2);
    if (!wheel) {
      // タイヤの円がちょうど 2R になるように切り出して縮める
      const M = wr.meta, side = M.r * 2, sz = Math.max(2, Math.round(R * 2 * zoom));
      const crop = canvas(Math.ceil(side), Math.ceil(side));
      crop.getContext('2d').drawImage(wr.img, M.cx - M.r, M.cy - M.r, side, side, 0, 0, side, side);
      wheel = downscale(crop, crop.width, crop.height, sz, sz);
      cachePut(VEH_CACHE, wk2, wheel, 40);
    }
  }
  return { body, bx, by, bw, bh, top: by + m.top * s, wheel, wr: R, guessed: m.guessed };
}

// ================================================================ UI（ui）
// キー: title_art（1920×1080）/ logo（1600×600）/ world_map（2048×1152）
/** { img, w, h } または null */
export function uiArt(key) {
  const r = ready('ui', key, 'ui');
  return r ? { img: r.img, w: r.w, h: r.h } : null;
}

// テスト用
export function _artInternal() { return { MAN, IMG, ICON_CACHE, VEH_CACHE, BASE }; }
