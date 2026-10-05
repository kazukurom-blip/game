// 主人公のパーツ式（着せ替え人形 = リグ）: パーツシートの読み込み・切り出し・位置合わせ・色替え・合成
//  manifest.json:
//    "rig": { "enabled": true, "defaultWear": true, "fit": false,
//             "parts": ["body_f", "body_m", "top/hoodie_f", "weapon/knife", "tear/1_f", ...]       … ファイルは rig/<キー>.png
//             または "parts": { "top/hoodie_f": "rig/top/hoodie_f.png" | { "file": "...", "base": "#ff6fb5", "accent": "#ffffff",
//                                                                         "fit": true, "layout": 2, "bgRemove": "auto", "recolor": true } } }
//  fit（全体の既定。各パーツの fit で上書き）: false = 配置図 v2 の枠・支点の位置のまま正確に組む（新しい配置図で描いた絵）/
//      true = 枠の中の絵の範囲を、同じ物のコード描画の範囲に自動で合わせる（多少ずれた絵）。
//  layout（全体の既定。各パーツで上書き）: 2 = 今の配置図（骨格 v2）、1 = 旧い配置図（旧い頭身。必ず自動フィット）。
//      既定: rig 節に fit も layout も無ければ 1（前からある manifest の互換）、どちらかがあれば 2。
//  キー: body_<g> / <slot>/<style>_<g> / <slot>/<style>__<色hex>_<g>（色違いの専用の絵）/ <slot>/<style>（性別共通）/
//        weapon/<style> / weapon/<style>__<色hex> / tear/<1|2|3>_<g>
//  - 素体（body）が無い・読み込み中 → null（今まで通りの描画）。着ている装備の絵が読み込み中の間も null。
//  - 装備の絵が無い（manifest に無い / 読めない）→ その装備だけ「今のコード描画を休めの姿勢でパーツに分けたもの」で代用。武器はコードで直接描く。
//  - 絵の背景は透明か単色（自動で透明化）。枠の中の不透明部分を自動検出し、今のコード描画の同じパーツの範囲に合わせる（多少ずれてもよい）。
//  - 色: スタイルごとの基準色（rigLayout.js の RIG_BASE。manifest の base/accent で上書き）→ アイテムの色へ、色相回転＋彩度・明度補正（陰影は残す）。
// 仕様: docs/SPEC_SPRITES.md「リグ（パーツ式）」
import {
  RIG_PARTS, RIG_W, RIG_H, RIG_S, RIG_R, RIG_GROUP_PARTS, RIG_BASE, RIG_SKIN_BASE, RIG_DEFAULT_WEAR, RIG_SLOTS, RIG_ACC_PARTS,
  WPN_W, WPN_H, WPN_S, WPN_R, WPN_BOX, RIG_PARTS_V1, RIG_LIMBS,
} from './rigLayout.js';
import { renderRigCode, renderRigWeapon, itemColors, setRigProfile } from './character.js';
import { getSpriteMode, bumpSpriteRev, removeBg } from './sprites.js';
import { hexRgb, colorInfo, effectiveColor, recolorData, sameColor } from './recolor.js';
const OUT = hexRgb('#2a1430');

let RM = null;                     // 正規化済みの rig 設定（null = リグ無し）
let BASE = 'assets/sprites/';
let RREV = 0;                      // リグの画像が読み込まれるたびに +1（キャッシュのキー）
const SHEETS = new Map();          // key → シートの記録
const STAT = { files: 0, requested: 0, loaded: 0, failed: 0, gen: 0, bakes: 0, recolors: 0, prepMs: 0, prepMax: 0, warnings: [], fitFallback: [] };
const HAS = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
const K2 = RIG_R / RIG_S;          // 配置図の px → 保持する px
const MARGIN = 12;                 // 枠の外側にはみ出した絵も拾う幅（配置図の px）

function warn(m) { STAT.warnings.push(m); if (STAT.warnings.length > 20) STAT.warnings.shift(); if (typeof console !== 'undefined') console.warn('[rig]', m); }
function newCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  } catch { /* ignore */ }
  return null;
}
const safePath = (f) => typeof f === 'string' && f && !f.includes('..') && !/^(?:[a-z]+:)?\/\//i.test(f);
const HEX = /^#[0-9a-f]{6}$/i;

// ================================================================ manifest
/** manifest の rig 節を設定（null で無効）。sprites.js の setSpriteManifest から呼ばれる */
export function setRigManifest(j, base) {
  RM = null; SHEETS.clear(); PLANS.clear(); GEN.clear(); RREV++;
  STAT.files = STAT.requested = STAT.loaded = STAT.failed = 0; STAT.prepMs = STAT.prepMax = 0; STAT.fitFallback = [];
  if (typeof base === 'string') BASE = base;
  setRigProfile(null);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  if (j.profile && typeof j.profile === 'object') setRigProfile(j.profile);
  const src = j.parts || j.files;
  const files = {};
  // 全体の既定: fit / layout（rig 節に fit も layout も無い = 前からある manifest → 旧い配置図＋自動フィット）
  const gLayout = j.layout === 1 || j.layout === 2 ? j.layout : j.fit !== undefined ? 2 : 1;
  const gFit = typeof j.fit === 'boolean' ? j.fit : true;
  const add = (key, v) => {
    if (typeof key !== 'string' || !/^[\w/@-]+$/.test(key) || key.includes('..')) { warn('rig: 不正なキー ' + key); return; }
    let o = v === true || v == null ? {} : typeof v === 'string' ? { file: v } : v;
    if (!o || typeof o !== 'object') return;
    const file = o.file != null ? o.file : 'rig/' + key + '.png';
    if (!safePath(file)) { warn('rig: ' + key + ' の file は assets/sprites/ からの相対パスにしてください'); return; }
    const info = parseKey(key);
    if (!info) { warn('rig: キーの形が違います ' + key + '（例 body_f, top/hoodie_f, weapon/knife, tear/1_f）'); return; }
    const layout = o.layout === 1 || o.layout === 2 ? o.layout : gLayout;
    files[key] = {
      key, file, ...info, layout,
      base: HEX.test(o.base || '') ? o.base.toLowerCase() : null,
      accent: HEX.test(o.accent || '') ? o.accent.toLowerCase() : null,
      fit: layout === 1 ? true : typeof o.fit === 'boolean' ? o.fit : gFit, recolor: o.recolor !== false,
      adjust: parseAdjust(o.adjust),
      bgRemove: o.bgRemove === false ? false : o.bgRemove === true ? true : 'auto',
      st: 0, parts: null, wpn: null, rc: new Map(),
    };
    STAT.files++;
  };
  if (Array.isArray(src)) for (const k of src) add(k, null);
  else if (src && typeof src === 'object') for (const k of Object.keys(src)) add(k, src[k]);
  for (const k in files) SHEETS.set(k, files[k]);
  // view: '3q' = 右向き斜め前（手前 = 画面の左側の腕・脚を胴の前に）/ 'front' = 正面（旧い重ね方: 顔の向きの側の腕を前に）
  const view = j.view === 'front' || j.view === '3q' ? j.view : gLayout === 2 ? '3q' : 'front';
  // npcs（既定 true）: NPC・人型の敵・市民（look に classId が無い / 悪役）にもリグと顔・髪の絵を使う。false = 主人公だけ（前の動き）。
  //  旧い指定 heroesOnly: true は npcs: false と同じ
  const npcs = j.npcs === false || j.heroesOnly === true ? false : true;
  RM = { enabled: j.enabled !== false, defaultWear: j.defaultWear !== false, npcs, fit: gFit, layout: gLayout, view };
  return true;
}
/** パーツごとの微調整 { torso: { sx, sy, dx, dy } }（sx/sy = 支点まわりの拡大、dx/dy = ずらし。単位はリグの座標） */
function parseAdjust(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  const n = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  for (const k of Object.keys(a)) {
    if (!RIG_PARTS[k] || !a[k] || typeof a[k] !== 'object') continue;
    const v = a[k];
    out[k] = { sx: n(v.sx ?? v.s, 1, 0.5, 2), sy: n(v.sy ?? v.s, 1, 0.5, 2), dx: n(v.dx, 0, -20, 20), dy: n(v.dy, 0, -20, 20) };
  }
  return Object.keys(out).length ? out : null;
}
/** キー → { kind, slot, style, g, variant } */
function parseKey(key) {
  let m = /^body(?:_([fm]))?$/.exec(key);
  if (m) return { kind: 'body', slot: 'body', style: 'body', g: m[1] || null, variant: null };
  m = /^tear\/([123])(?:_([fm]))?$/.exec(key);
  if (m) return { kind: 'tear', slot: 'tear', style: m[1], g: m[2] || null, variant: null };
  m = /^weapon\/([A-Za-z0-9]+)(?:__([0-9a-fA-F]{6}))?$/.exec(key);
  if (m) return { kind: 'weapon', slot: 'weapon', style: m[1], g: null, variant: m[2] ? '#' + m[2].toLowerCase() : null };
  m = /^(top|bottom|shoes|hat|accessory)\/([A-Za-z0-9]+)(?:__([0-9a-fA-F]{6}))?(?:_([fm]))?$/.exec(key);
  if (m) return { kind: 'slot', slot: m[1], style: m[2], g: m[4] || null, variant: m[3] ? '#' + m[3].toLowerCase() : null };
  return null;
}
export function rigStats() {
  return { enabled: !!(RM && RM.enabled), npcs: !!(RM && RM.npcs), fit: RM ? RM.fit : null, layout: RM ? RM.layout : null, view: RM ? RM.view : null, ...STAT, warnings: STAT.warnings.slice(-5), fitFallback: STAT.fitFallback.slice(), plans: PLANS.size, gens: GEN.size, rev: RREV };
}
/** リグの見え方（'3q' | 'front'） */
export function rigView() { return RM ? RM.view : 'front'; }
export function hasRig() { return !!(RM && RM.enabled && SHEETS.size); }
/** NPC・人型の敵・市民にもリグ・顔/髪の絵を使うか（manifest の rig.npcs。rig 節が無ければ false = 今まで通り） */
export function rigNpcs() { return !!(RM && RM.npcs); }
/** 全部のリグ画像を読み込む（テスト用）。完了で解決 */
export function rigPreload() {
  if (!RM) return Promise.resolve(0);
  return Promise.all([...SHEETS.values()].map((r) => new Promise((res) => { load(r); if (r.st !== 1) res(); else r.wait.push(res); }))).then(() => STAT.loaded);
}

// ================================================================ 読み込み・切り出し
function load(rec) {
  if (rec.st) return rec;
  rec.wait = rec.wait || [];
  if (typeof Image === 'undefined' || !HAS) { rec.st = 3; return rec; }
  rec.st = 1; STAT.requested++;
  const done = (ok) => {
    rec.st = ok ? 2 : 3;
    if (ok) STAT.loaded++; else STAT.failed++;
    RREV++; bumpSpriteRev();
    for (const f of rec.wait.splice(0)) f();
  };
  try {
    const im = new Image();
    im.onload = () => queuePrep(() => {
      let ok = false;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      try { ok = rec.kind === 'weapon' ? prepWeapon(rec, im) : prepSheet(rec, im); } catch (e) { warn('rig: 前処理に失敗 ' + rec.file + ' ' + e.message); }
      if (typeof performance !== 'undefined') { const ms = performance.now() - t0; STAT.prepMs += ms; STAT.prepMax = Math.max(STAT.prepMax, ms); }
      done(ok);
    });
    im.onerror = () => { warn('rig: 画像を読めません ' + rec.file); done(false); };
    im.src = BASE + rec.file;
  } catch (e) { warn('rig: 読み込みに失敗 ' + rec.file + ' ' + e.message); done(false); }
  return rec;
}
// 前処理（背景除去・切り出し・位置合わせ。1枚 約0.1秒）は1回に1枚ずつ（画面が止まらないように間をあける）
const PREPQ = [];
let prepBusy = false;
function queuePrep(fn) {
  PREPQ.push(fn);
  if (!prepBusy) { prepBusy = true; setTimeout(pumpPrep, 0); }
}
function pumpPrep() {
  const fn = PREPQ.shift();
  if (fn) { try { fn(); } catch (e) { warn('rig: ' + e.message); } }
  if (PREPQ.length) setTimeout(pumpPrep, 16); else prepBusy = false;
}
/** シートの基準色 [主色, アクセント] */
function baseColors(rec) {
  if (rec.kind === 'body') return [rec.base || RIG_SKIN_BASE[rec.g || 'f'], null];
  if (rec.kind === 'tear') return [null, null];
  const d = (RIG_BASE[rec.slot] && RIG_BASE[rec.slot][rec.style]) || ['#cccccc', '#ffffff'];
  return [rec.base || rec.variant || d[0], rec.accent || d[1]];
}
/** そのシートと同じ物のコード描画（基準色）を描いた配置図（縮小）→ パーツごとの不透明範囲（配置図の px） */
function refBoxes(rec, g) {
  const k = 0.5;
  const c = newCanvas(RIG_W * k, RIG_H * k);
  const x = c.getContext('2d', { willReadFrequently: true });
  const [bc, ba] = baseColors(rec);
  const eq = {};
  let group = rec.slot;
  if (rec.kind === 'body') group = 'body';
  else if (rec.kind === 'tear') { group = 'tear'; eq.top = { style: 'tshirt' }; eq.bottom = { style: 'jeans' }; }
  else eq[rec.slot] = { style: rec.style, color: bc, accent: ba };
  const look = rec.kind === 'body' ? { body: g, skin: bc } : null;
  renderRigCode(x, g, look, eq, group, { scale: RIG_S * k, dmg: rec.kind === 'tear' ? [0, 0.3, 0.6, 0.8][+rec.style] : 0 });
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const out = {};
  for (const name of RIG_GROUP_PARTS[group]) {
    const b = RIG_PARTS[name];
    const bb = bboxOf(d, c.width, c.height, (b.x - MARGIN) * k, (b.y - MARGIN) * k, (b.w + MARGIN * 2) * k, (b.h + MARGIN * 2) * k, 40, 1);
    if (bb) out[name] = bb.map((v) => v / k);
  }
  return out;
}
/** 画素配列の矩形 [x,y,w,h] 内の不透明部分の範囲 [x0,y0,x1,y1]（端の点のゴミは無視）。無ければ null */
function bboxOf(d, W, H, rx, ry, rw, rh, thr, minCnt) {
  rx = Math.max(0, Math.floor(rx)); ry = Math.max(0, Math.floor(ry));
  const ex = Math.min(W, Math.ceil(rx + rw)), ey = Math.min(H, Math.ceil(ry + rh));
  if (ex <= rx || ey <= ry) return null;
  const cols = new Uint32Array(ex - rx), rows = new Uint32Array(ey - ry);
  let n = 0;
  for (let y = ry; y < ey; y++) {
    let i = (y * W + rx) * 4 + 3;
    for (let x = rx; x < ex; x++, i += 4) if (d[i] > thr) { cols[x - rx]++; rows[y - ry]++; n++; }
  }
  if (n < 12 * minCnt) return null;
  let x0 = 0, x1 = cols.length - 1, y0 = 0, y1 = rows.length - 1;
  while (x0 < x1 && cols[x0] < minCnt * 2) x0++;
  while (x1 > x0 && cols[x1] < minCnt * 2) x1--;
  while (y0 < y1 && rows[y0] < minCnt * 2) y0++;
  while (y1 > y0 && rows[y1] < minCnt * 2) y1--;
  if (x1 <= x0 || y1 <= y0) return null;
  return [rx + x0, ry + y0, rx + x1 + 1, ry + y1 + 1];
}
/**
 * 縁のにじみ取り: 背景を消した後、透明に接する画素が「背景色と輪郭線の色の中間」なら、輪郭線の色＋半透明にする
 * （白背景で描いた絵の縁が白っぽく光るのを防ぐ。濃い輪郭線の絵柄が前提。明るい色の縁はそのまま）
 */
function defringe(d, W, H, bg) {
  const Lb = 0.3 * bg[0] + 0.59 * bg[1] + 0.11 * bg[2], Lo = 0.3 * OUT[0] + 0.59 * OUT[1] + 0.11 * OUT[2];
  if (Lb - Lo < 60) return;
  for (let pass = 0; pass < 2; pass++) {
    const mark = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] === 0) continue;
        if (d[i - 1] !== 0 && d[i + 7] !== 0 && d[i - W * 4 + 3] !== 0 && d[i + W * 4 + 3] !== 0) continue;
        const L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        const sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
        if (L <= Lo + 8 || sat > 70) continue;          // もう線の色 / はっきりした色（明るい部品の縁）はそのまま
        const a = Math.min(1, Math.max(0, (Lb - L) / (Lb - Lo)));
        mark.push(i, Math.round(d[i + 3] * a));
      }
    }
    for (let k = 0; k < mark.length; k += 2) { const i = mark[k]; d[i] = OUT[0]; d[i + 1] = OUT[1]; d[i + 2] = OUT[2]; d[i + 3] = mark[k + 1]; }
  }
}
// ---- 絵の塊（連結成分）を枠に割り当てる（AI が枠から少しはみ出して・ずらして描いても拾う。小さなゴミ・写った枠線は捨てる）
const BLK = 4;                       // 4×4px のブロック単位で調べる
const REACH = 44;                    // 枠からこの px 以内にある塊はその枠の候補
let BLAB = null;
/** 枠ごとの { bb: [x0,y0,x1,y1]（px）, lab: ラベルの配列, set: その枠の塊のラベル } */
function blobsByPart(d, W, H, names, BOX = RIG_PARTS) {
  const bw = Math.ceil(W / BLK), bh = Math.ceil(H / BLK);
  const lab = BLAB && BLAB.length === bw * bh ? BLAB.fill(0) : (BLAB = new Int32Array(bw * bh));
  const on = new Uint8Array(bw * bh);
  for (let y = 0; y < H; y++) {
    const row = (y / BLK | 0) * bw;
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 64) on[row + (x / BLK | 0)]++;
  }
  const comps = [null];
  const st = [];
  for (let i = 0; i < on.length; i++) {
    if (on[i] < 2 || lab[i]) continue;
    const id = comps.length;
    const c = { id, n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
    lab[i] = id; st.push(i);
    while (st.length) {
      const p = st.pop();
      const x = p % bw, y = (p / bw) | 0;
      c.n++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const q = ny * bw + nx;
        if (on[q] >= 2 && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    comps.push(c);
  }
  // 塊 → 一番重なる枠（REACH まで広げた枠）
  const per = {};
  for (let k = 1; k < comps.length; k++) {
    const c = comps[k];
    const X0 = c.x0 * BLK, Y0 = c.y0 * BLK, X1 = (c.x1 + 1) * BLK, Y1 = (c.y1 + 1) * BLK;
    let best = null, bo = 0, inside = 0;
    for (const name of names) {
      const b = BOX[name];
      const ov = Math.max(0, Math.min(X1, b.x + b.w + REACH) - Math.max(X0, b.x - REACH)) * Math.max(0, Math.min(Y1, b.y + b.h + REACH) - Math.max(Y0, b.y - REACH));
      if (ov > bo) { bo = ov; best = name; inside = Math.max(0, Math.min(X1, b.x + b.w) - Math.max(X0, b.x)) * Math.max(0, Math.min(Y1, b.y + b.h) - Math.max(Y0, b.y)) / ((X1 - X0) * (Y1 - Y0)); }
    }
    if (!best) continue;
    c.inside = inside;
    (per[best] = per[best] || []).push(c);
  }
  const out = {};
  for (const name of Object.keys(per)) {
    const L = per[name];
    const big = Math.max(...L.map((c) => c.n));
    const keep = L.filter((c) => c.n >= Math.max(3, big * 0.02) && !(c.n < big * 0.08 && c.inside < 0.3));   // 小さなゴミ・枠の外の小さな物（写った文字など）は捨てる
    if (!keep.length || big < 6) continue;
    const set = new Set(keep.map((c) => c.id));
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const c of keep) { x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); }
    // ブロックの範囲 → 画素の範囲（その塊の画素だけで詰める）
    const r = [x0 * BLK, y0 * BLK, Math.min(W, (x1 + 1) * BLK), Math.min(H, (y1 + 1) * BLK)];
    let px0 = 1e9, py0 = 1e9, px1 = -1, py1 = -1;
    for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) {
      if (d[(y * W + x) * 4 + 3] <= 64 || !set.has(lab[(y / BLK | 0) * bw + (x / BLK | 0)])) continue;
      if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y;
    }
    if (px1 < 0) continue;
    out[name] = { bb: [Math.max(0, px0 - 1), Math.max(0, py0 - 1), Math.min(W, px1 + 2), Math.min(H, py1 + 2)], set, bw, lab };
  }
  return out;
}
/** その枠の塊の画素だけを切り出した canvas（bb の大きさ） */
function blobCanvas(d, W, bb, B0) {
  const w = bb[2] - bb[0], h = bb[3] - bb[1];
  const cv = newCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h), o = img.data;
  for (let y = 0; y < h; y++) {
    const sy = y + bb[1];
    for (let x = 0; x < w; x++) {
      const sx = x + bb[0];
      const i = (sy * W + sx) * 4;
      if (d[i + 3] === 0) continue;
      // 塊の境目のブロックは隣も見る（縁の半透明の画素を落とさない）
      const bx = sx / BLK | 0, by = sy / BLK | 0;
      let ok = B0.set.has(B0.lab[by * B0.bw + bx]);
      if (!ok) for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) { const q = (by + dy) * B0.bw + bx + dx; if (q >= 0 && q < B0.lab.length && B0.set.has(B0.lab[q])) ok = true; }
      if (!ok) continue;
      const j = (y * w + x) * 4;
      o[j] = d[i]; o[j + 1] = d[i + 1]; o[j + 2] = d[i + 2]; o[j + 3] = d[i + 3];
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
// パーツごとの位置合わせのしかた: 拡大率をどの辺で決めるか・どの点を合わせるか
const FIT = {
  head: ['area', 'c', 'c'], back: ['area', 'c', 'c'], torso: ['h', 'c', 'c'],
  armB: ['h', 'c', 't'], armF: ['h', 'c', 't'], legB: ['h', 'c', 't'], legF: ['h', 'c', 't'],
  footB: ['w', 'c', 'b'], footF: ['w', 'c', 'b'],
};
function anchorOf(bb, ax, ay) {
  return [ax === 'l' ? bb[0] : ax === 'r' ? bb[2] : (bb[0] + bb[2]) / 2, ay === 't' ? bb[1] : ay === 'b' ? bb[3] : (bb[1] + bb[3]) / 2];
}
/** パーツの入れ物（枠＋はみ出し分、RIG_R の解像度）。支点 px,py */
function partCanvas(name, M = MARGIN) {
  const b = RIG_PARTS[name];
  const w = Math.ceil((b.w + M * 2) * K2), h = Math.ceil((b.h + M * 2) * K2);
  const cv = newCanvas(w, h);
  if (cv) cv.getContext('2d', { willReadFrequently: true });
  return { cv, w, h, px: (b.px - b.x + M) * K2, py: (b.py - b.y + M) * K2, R: RIG_R, name, M };
}
function prepSheet(rec, im) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  if (!(w0 > 0 && h0 > 0)) return false;
  if (Math.abs(w0 / h0 - 1) > 0.03) warn(`rig: ${rec.key} は正方形ではありません（${w0}×${h0}）。配置図と同じ 1024×1024 で描いてください`);
  const c = newCanvas(RIG_W, RIG_H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
  g.drawImage(im, 0, 0, w0, h0, 0, 0, RIG_W, RIG_H);
  const data = g.getImageData(0, 0, RIG_W, RIG_H);
  const bg = removeBg(data.data, RIG_W, RIG_H, rec.bgRemove);
  if (bg) { defringe(data.data, RIG_W, RIG_H, bg); g.putImageData(data, 0, 0); }
  const d = data.data;
  const gs = rec.g ? [rec.g] : ['f'];
  const ref = rec.fit && rec.kind !== 'tear' ? refBoxes(rec, gs[0]) : {};
  const group = rec.kind === 'body' ? 'body' : rec.kind === 'tear' ? 'tear' : rec.slot;
  const names = rec.kind === 'slot' && rec.slot === 'accessory' && RIG_ACC_PARTS[rec.style] ? RIG_ACC_PARTS[rec.style] : RIG_GROUP_PARTS[group];
  rec.parts = {};
  let found = 0;
  const blobs = blobsByPart(d, RIG_W, RIG_H, names, rec.layout === 1 ? RIG_PARTS_V1 : RIG_PARTS);
  for (const name of names) {
    const b = RIG_PARTS[name];
    const B0 = blobs[name];
    if (!B0) continue;
    const bb = B0.bb;
    found++;
    const A = rec.adjust && rec.adjust[name];
    // 微調整で大きくする・ずらす時は、はみ出し分の余白も広げる
    const P = partCanvas(name, A ? MARGIN + Math.ceil(Math.max(A.sx, A.sy, 1) * Math.max(b.w, b.h) * 0.5 - Math.max(b.w, b.h) * 0.5 + Math.max(Math.abs(A.dx), Math.abs(A.dy)) * RIG_S) : MARGIN);
    if (!P.cv) return false;
    const r = ref[name];
    let s = 1, ax = 0, ay = 0, rx = 0, ry = 0;
    if (r) {
      const [how, hx, hy] = FIT[name];
      const aw = bb[2] - bb[0], ah = bb[3] - bb[1], rw = r[2] - r[0], rh = r[3] - r[1];
      s = how === 'w' ? rw / aw : how === 'h' ? rh / ah : Math.sqrt((rw * rh) / (aw * ah));
      s = Math.min(1.25, Math.max(0.8, s));
      if (Math.abs(s - 1) < 0.03) s = 1;
      [ax, ay] = anchorOf(bb, hx, hy); [rx, ry] = anchorOf(r, hx, hy);
      // ずれの上限（枠の大きさの 15%）
      const lim = 0.15 * Math.max(b.w, b.h);
      if (Math.abs(rx - ax) > lim || Math.abs(ry - ay) > lim) { warn(`rig: ${rec.key} の ${name} が下絵の位置から大きくずれています`); }
    }
    const pg = P.cv.getContext('2d');
    pg.imageSmoothingEnabled = true; try { pg.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
    const ox = b.x - P.M, oy = b.y - P.M;
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    // 配置図の座標での左上（自動フィット後）→ 微調整（支点まわりに拡大＋ずらし）
    let x0 = (bb[0] - ax) * s + rx, y0 = (bb[1] - ay) * s + ry, kx = 1, ky = 1;
    if (A) {
      kx = A.sx; ky = A.sy;
      x0 = b.px + (x0 - b.px) * kx + A.dx * RIG_S; y0 = b.py + (y0 - b.py) * ky + A.dy * RIG_S;
    }
    const dx = (x0 - ox) * K2, dy = (y0 - oy) * K2;
    pg.drawImage(blobCanvas(d, RIG_W, bb, B0), 0, 0, bw, bh, dx, dy, bw * s * kx * K2, bh * s * ky * K2);
    rec.parts[name] = P;
  }
  c.width = c.height = 1;
  if (!found) { warn('rig: ' + rec.key + ' に絵が見つかりません（枠の中に描いてください）'); return false; }
  rec.eff = effectiveBase(rec);
  return true;
}
function prepWeapon(rec, im) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  if (!(w0 > 0 && h0 > 0)) return false;
  const c = newCanvas(WPN_W, WPN_H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
  g.drawImage(im, 0, 0, w0, h0, 0, 0, WPN_W, WPN_H);
  const data = g.getImageData(0, 0, WPN_W, WPN_H);
  const d = data.data;
  const bg = removeBg(d, WPN_W, WPN_H, rec.bgRemove);
  if (bg) defringe(d, WPN_W, WPN_H, bg);
  // 持ち手の印（マゼンタ）
  let mx = 0, my = 0, mn = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 128 && d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 200 && d[i] - d[i + 1] > 140) {
      const p = i >> 2; mx += p % WPN_W; my += (p / WPN_W) | 0; mn++; d[i + 3] = 0;
    }
  }
  g.putImageData(data, 0, 0);
  const bb = bboxOf(d, WPN_W, WPN_H, 0, 0, WPN_W, WPN_H, 64, 1);
  if (!bb) { warn('rig: ' + rec.key + ' に絵が見つかりません'); return false; }
  // コードの武器の範囲（基準色）
  const k = 0.5;
  const rc = newCanvas(WPN_W * k, WPN_H * k);
  const rg = rc.getContext('2d', { willReadFrequently: true });
  const [bc, ba] = baseColors(rec);
  renderRigWeapon(rg, rec.style, bc, ba, WPN_S * k);
  const rbb0 = bboxOf(rg.getImageData(0, 0, rc.width, rc.height).data, rc.width, rc.height, 0, 0, rc.width, rc.height, 40, 1);
  const rbb = rbb0 ? rbb0.map((v) => v / k) : [WPN_BOX.px, WPN_BOX.py - 32, WPN_BOX.px + 320, WPN_BOX.py + 32];
  // fit:false は持ち手の印が必須（印の位置 = 持ち手、大きさは描いたまま）。印が無ければ警告して自動フィット
  let fit = rec.fit;
  if (!fit && mn < 4) { STAT.fitFallback.push(rec.key); warn(`rig: ${rec.key} に持ち手の印（マゼンタ #FF00FF の丸）がありません。fit:false では必須 → 自動フィットで読み込みます`); fit = true; }
  rec.fitUsed = fit;
  let s = fit ? (rbb[2] - rbb[0]) / (bb[2] - bb[0]) : 1;
  s = Math.min(1.6, Math.max(0.6, s));
  let ax, ay, rx, ry;
  if (mn >= 4) { ax = mx / mn; ay = my / mn; rx = WPN_BOX.px; ry = WPN_BOX.py; }
  else { ax = bb[0]; ay = (bb[1] + bb[3]) / 2; rx = rbb[0]; ry = (rbb[1] + rbb[3]) / 2; }
  // 合わせた後の範囲で切り抜く
  const f0 = (bb[0] - ax) * s + rx, f1 = (bb[1] - ay) * s + ry, f2 = (bb[2] - ax) * s + rx, f3 = (bb[3] - ay) * s + ry;
  const kk = WPN_R / WPN_S, pad = 6;
  const W = Math.ceil((f2 - f0 + pad * 2) * kk), H = Math.ceil((f3 - f1 + pad * 2) * kk);
  const cv = newCanvas(W, H);
  const pg = cv.getContext('2d', { willReadFrequently: true });
  pg.imageSmoothingEnabled = true; try { pg.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
  pg.drawImage(c, bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], pad * kk, pad * kk, (f2 - f0) * kk, (f3 - f1) * kk);
  c.width = c.height = 1;
  rec.wpn = { cv, w: W, h: H, px: (WPN_BOX.px - f0 + pad) * kk, py: (WPN_BOX.py - f1 + pad) * kk, R: WPN_R, name: 'weapon' };
  rec.parts = { weapon: rec.wpn };
  rec.eff = effectiveBase(rec);
  return true;
}

// ================================================================ 色替え（色相回転＋彩度・明度補正。陰影・線・他の色は残す）
// （色の計算は recolor.js と共通）
/** 実際に描かれた布の色の平均（基準色の近くの画素）→ 補正の元にする（AI が少し違う色で描いても合う） */
function effectiveBase(rec) {
  const [bm, ba] = baseColors(rec);
  const datas = [];
  for (const name in rec.parts) {
    const p = rec.parts[name];
    try { datas.push(p.cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.w, p.h).data); } catch { return [bm ? colorInfo(bm) : null, ba ? colorInfo(ba) : null]; }
  }
  return [bm, ba].map((hex) => (hex ? effectiveColor(colorInfo(hex), datas) : null));
}
// シート×枠×色ごとの色替えの上限（LRU）。NPC・市民の肌・服の色が多いので大きめ（素体は 7 枠 × 肌の色 約20）
const RC_MAX = 160;
/** パーツを目標の色に（主色・アクセント）。同じ色なら元のまま。シート×色ごとにキャッシュ */
function recolored(rec, name, main, acc) {
  const p = rec.parts && rec.parts[name];
  if (!p) return null;
  if (!rec.recolor) return p;
  const [bm, ba] = baseColors(rec);
  const doM = main && bm && !sameColor(main.toLowerCase(), bm);
  const doA = acc && ba && !sameColor(acc.toLowerCase(), ba) && colorInfo(ba).c > 0.15;
  if (!doM && !doA) return p;
  const key = name + '|' + (doM ? main : '') + '|' + (doA ? acc : '');
  let o = rec.rc.get(key);
  if (o) { rec.rc.delete(key); rec.rc.set(key, o); return o; }
  const eff = rec.eff || [colorInfo(bm), ba ? colorInfo(ba) : null];
  const maps = [];
  if (doM) maps.push([eff[0] || colorInfo(bm), colorInfo(main)]);
  if (doA) maps.push([eff[1] || colorInfo(ba), colorInfo(acc)]);
  const cv = newCanvas(p.w, p.h);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(p.cv, 0, 0);
  const img = g.getImageData(0, 0, p.w, p.h), d = img.data;
  recolorData(d, maps);
  g.putImageData(img, 0, 0);
  STAT.recolors++;
  o = { cv, w: p.w, h: p.h, px: p.px, py: p.py, R: p.R, name };
  if (rec.rc.size >= RC_MAX) rec.rc.delete(rec.rc.keys().next().value);
  rec.rc.set(key, o);
  return o;
}

// ================================================================ コード描画の代用パーツ（絵が無い装備）
const GEN = new Map();
const GEN_MAX = 160;               // NPC・敵の絵の無い服（スーツ・制服など）の代用パーツが多いので大きめ
let GSC = null;
function genParts(group, g, look, equip, dmg, names, sig) {
  const key = group + '|' + g + '|' + sig + '|' + dmg;
  let o = GEN.get(key);
  if (o) { GEN.delete(key); GEN.set(key, o); return o; }
  const W = RIG_W * K2, H = RIG_H * K2;
  if (!GSC) GSC = newCanvas(W, H);
  if (!GSC) return {};
  const x = GSC.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
  renderRigCode(x, g, look, equip, group, { scale: RIG_R, dmg, parts: names });
  o = {};
  for (const name of names) {
    const P = partCanvas(name);
    const b = RIG_PARTS[name];
    P.cv.getContext('2d').drawImage(GSC, (b.x - MARGIN) * K2, (b.y - MARGIN) * K2, P.w, P.h, 0, 0, P.w, P.h);
    o[name] = P;
  }
  STAT.gen++;
  GEN.set(key, o);
  while (GEN.size > GEN_MAX) GEN.delete(GEN.keys().next().value);
  return o;
}
const itSig = (it) => it ? (it.style || '') + (it.color || '') + (it.accent || '') + (it.rarity != null ? it.rarity : '') : '-';

// ================================================================ プラン（その人の見た目に使う絵の組み合わせ）
const PLANS = new Map();
const PLAN_MAX = 160;              // 画面の人型（主人公＋NPC・市民・敵 数十人）の見た目の数より多く
function find(keys) { for (const k of keys) { const r = SHEETS.get(k); if (r) return r; } return null; }
const hex6 = (c) => (typeof c === 'string' && HEX.test(c) ? c.slice(1).toLowerCase() : null);
/** 主人公（rig.npcs なら NPC・敵・市民も）の look・装備 → リグのプラン | null（リグ無し・素体が無い/読み込み中・必要な絵が読み込み中・spriteMode=procedural） */
export function rigPlanFor(look, equip) {
  if (!RM || !RM.enabled || !SHEETS.size || !HAS || getSpriteMode() !== 'auto') return null;
  if (!look || ((look.villain || !look.classId) && !RM.npcs)) return null;
  equip = equip || {};
  const g = look.body === 'm' ? 'm' : 'f';
  const body = find(['body_' + g, 'body']);
  if (!body) return null;
  load(body);
  if (body.st !== 2) return null;
  let sig = g + '|' + (look.skin || '') + '|';
  const use = {};
  for (const slot of RIG_SLOTS) {
    let it = equip[slot];
    if (!it && RM.defaultWear && RIG_DEFAULT_WEAR[slot]) it = RIG_DEFAULT_WEAR[slot](g);
    if (!it || !it.style) { sig += ','; continue; }
    const h = hex6(it.color);
    const rec = find([h && `${slot}/${it.style}__${h}_${g}`, h && `${slot}/${it.style}__${h}`, `${slot}/${it.style}_${g}`, `${slot}/${it.style}`].filter(Boolean));
    if (rec) { load(rec); if (rec.st === 1) return null; }
    use[slot] = { it, rec: rec && rec.st === 2 ? rec : null };
    sig += itSig(it) + (use[slot].rec ? '@' + use[slot].rec.key : '') + ',';
  }
  const wi = equip.weapon;
  if (wi && wi.style) {
    const h = hex6(wi.color);
    const rec = find([h && `weapon/${wi.style}__${h}`, `weapon/${wi.style}`].filter(Boolean));
    if (rec) { load(rec); if (rec.st === 1) return null; }
    use.weapon = { it: wi, rec: rec && rec.st === 2 ? rec : null };
    sig += itSig(wi) + (use.weapon.rec ? '@' : '');
  }
  const tears = [1, 2, 3].map((n) => { const r = find([`tear/${n}_${g}`, `tear/${n}`]); if (r) load(r); return r && r.st === 2 ? r : null; });
  // キーは「使う絵（読み込み済みの物）」で決まる（全体の読み込み番号 RREV は入れない: 関係の無い絵の読み込みで全員のプランと 2x キャッシュを作り直さないように）
  const key = sig + '|' + body.key + '|' + tears.map((r) => (r ? 1 : 0)).join('');
  let plan = PLANS.get(key);
  if (plan) { PLANS.delete(key); PLANS.set(key, plan); return plan; }
  plan = makePlan(key, g, look, equip, body, use, tears);
  PLANS.set(key, plan);
  while (PLANS.size > PLAN_MAX) PLANS.delete(PLANS.keys().next().value);
  return plan;
}
/**
 * テスト・見比べ用: 絵を1枚も使わず、全部コード描画の代用パーツ（骨格 v2）で組んだプラン。
 * 仮のAI画像（下絵そのもの）を fit:false で差し込んだリグと画素で比べる基準になる。canvas が無ければ null
 */
export function rigCodePlanFor(look, equip) {
  if (!HAS || !look) return null;
  equip = equip || {};
  const g = look.body === 'm' ? 'm' : 'f';
  const dw = !RM || RM.defaultWear;
  let sig = 'code|' + g + '|' + (look.skin || '') + '|';
  const use = {};
  for (const slot of RIG_SLOTS) {
    let it = equip[slot];
    if (!it && dw && RIG_DEFAULT_WEAR[slot]) it = RIG_DEFAULT_WEAR[slot](g);
    if (!it || !it.style) { sig += ','; continue; }
    use[slot] = { it, rec: null };
    sig += itSig(it) + ',';
  }
  if (equip.weapon && equip.weapon.style) { use.weapon = { it: equip.weapon, rec: null }; sig += itSig(equip.weapon); }
  const key = sig + '|' + RREV;
  let plan = PLANS.get(key);
  if (plan) return plan;
  plan = makePlan(key, g, look, equip, null, use, [null, null, null]);
  plan.sig = 'c' + RREV + '|' + sig;
  PLANS.set(key, plan);
  while (PLANS.size > PLAN_MAX) PLANS.delete(PLANS.keys().next().value);
  return plan;
}
const STAGE_DMG = [0, 0.3, 0.6, 0.8, 0.95];
const HAND_R = 2.9;                 // 手の丸（単位）。腕の長さ = BODY の upper+fore
const ARM_L = { f: RIG_LIMBS.f.upper + RIG_LIMBS.f.fore, m: RIG_LIMBS.m.upper + RIG_LIMBS.m.fore };   // 骨格 v2 の腕の長さ（肩〜手の中心）
function stageOf(d) { return d >= 0.9 ? 4 : d >= 0.75 ? 3 : d >= 0.5 ? 2 : d >= 0.25 ? 1 : 0; }
let PLAN_ID = 0;
function makePlan(key, g, look, equip, body, use, tears) {
  const bakes = [];
  return {
    sig: 'r' + (++PLAN_ID),
    g, body: body ? body.key : 'code',
    uses: Object.fromEntries(Object.entries(use).map(([k, v]) => [k, v.rec ? v.rec.key : 'code'])),
    parts(dmg) {
      const st = stageOf(dmg || 0);
      if (!bakes[st]) { bakes[st] = bake(g, look, equip, body, use, tears, st); STAT.bakes++; }
      return bakes[st];
    },
  };
}
/** 1パーツ分の合成（同じ大きさ・同じ支点の絵を順に重ねる。tear は服の上だけ）。hand: 手（支点から下へ hand 単位の丸）を最後にもう一度＝袖の上 */
function compose(base, clothes, tear, hand) {
  const L = [base, ...clothes].filter(Boolean);
  if (!L.length && !tear) return null;
  if (L.length === 1 && !tear) return L[0];
  const ref = L[0] || tear;
  const cv = newCanvas(ref.w, ref.h);
  const g = cv.getContext('2d');
  if (base) g.drawImage(base.cv, 0, 0);
  const cl = clothes.filter(Boolean);
  if (cl.length) {
    if (tear) {
      const t2 = newCanvas(ref.w, ref.h), tg = t2.getContext('2d');
      for (const c of cl) tg.drawImage(c.cv, 0, 0);
      tg.globalCompositeOperation = 'source-atop'; tg.drawImage(tear.cv, 0, 0);
      g.drawImage(t2, 0, 0);
      t2.width = t2.height = 1;
    } else for (const c of cl) g.drawImage(c.cv, 0, 0);
    if (hand && base) {
      g.save(); g.beginPath(); g.arc(base.px, base.py + hand * base.R, HAND_R * base.R, 0, Math.PI * 2); g.clip();
      g.drawImage(base.cv, 0, 0); g.restore();
    }
  }
  return { cv, w: ref.w, h: ref.h, px: ref.px, py: ref.py, R: ref.R, name: ref.name };
}
function bake(g, look, equip, body, use, tears, st) {
  const dmg = STAGE_DMG[st];
  const skin = look.skin || RIG_SKIN_BASE[g];
  let BP = null;
  if (!body) BP = genParts('body', g, Object.assign({}, look, { skin }), {}, 0, RIG_GROUP_PARTS.body, 'skin' + skin);
  const B = (n) => (body ? recolored(body, n, skin, null) : BP[n] || null);
  // 各スロットのパーツ（絵 → 色替え / 無ければコード描画の代用）
  const L = {};
  for (const slot of RIG_SLOTS) {
    const u = use[slot];
    if (!u) continue;
    const [c, a] = itemColors(u.it);
    if (u.rec) { L[slot] = {}; for (const n of RIG_GROUP_PARTS[slot]) L[slot][n] = recolored(u.rec, n, c, a); }
    else {
      const names = slot === 'accessory' ? (RIG_ACC_PARTS[u.it.style] || []) : slot === 'top' && u.it.style !== 'hoodie' ? RIG_GROUP_PARTS.top.filter((n) => n !== 'back') : RIG_GROUP_PARTS[slot];
      L[slot] = genParts(slot, g, look, { [slot]: u.it }, dmg, names, itSig(u.it));
    }
  }
  // 破れ（HP 75/50/25% 以下）。絵が無ければコード描画の破れ
  let T = null;
  if (st > 0) {
    const tr = tears[Math.min(3, st) - 1];
    if (tr) T = tr.parts;
    else {
      const eq = { top: use.top ? use.top.it : null, bottom: use.bottom ? use.bottom.it : null };
      T = genParts('tear', g, look, eq, dmg, RIG_GROUP_PARTS.tear, itSig(eq.top) + itSig(eq.bottom));
    }
  }
  const get = (slot, n) => (L[slot] && L[slot][n]) || null;
  const tearOf = (n) => (T && T[n]) || null;
  const out = {
    backA: get('accessory', 'back'),
    backT: get('top', 'back'),
    torso: compose(B('torso'), [get('bottom', 'torso'), get('top', 'torso'), get('accessory', 'torso')], tearOf('torso')),
    armB: compose(B('armB'), [get('top', 'armB')], tearOf('armB'), ARM_L[g]),
    armF: compose(B('armF'), [get('top', 'armF')], tearOf('armF'), ARM_L[g]),
    legB: compose(B('legB'), [get('bottom', 'legB')], tearOf('legB')),
    legF: compose(B('legF'), [get('bottom', 'legF')], tearOf('legF')),
    footB: get('shoes', 'footB') || B('footB'),
    footF: get('shoes', 'footF') || B('footF'),
    head: compose(null, [get('accessory', 'head'), get('hat', 'head')], null),
    weapon: null,
  };
  const wu = use.weapon;
  if (wu && wu.rec) { const [c, a] = itemColors(wu.it); out.weapon = recolored(wu.rec, 'weapon', c, a); }
  return out;
}
