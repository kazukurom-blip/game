// 主人公のパーツ式（着せ替え人形 = リグ）: パーツシートの読み込み・切り出し・位置合わせ・色替え・合成
//  manifest.json:
//    "rig": { "enabled": true, "defaultWear": true,
//             "parts": ["body_f", "body_m", "top/hoodie_f", "weapon/knife", "tear/1_f", ...]       … ファイルは rig/<キー>.png
//             または "parts": { "top/hoodie_f": "rig/top/hoodie_f.png" | { "file": "...", "base": "#ff6fb5", "accent": "#ffffff",
//                                                                         "fit": true, "bgRemove": "auto", "recolor": true } } }
//  キー: body_<g> / <slot>/<style>_<g> / <slot>/<style>__<色hex>_<g>（色違いの専用の絵）/ <slot>/<style>（性別共通）/
//        weapon/<style> / weapon/<style>__<色hex> / tear/<1|2|3>_<g>
//  - 素体（body）が無い・読み込み中 → null（今まで通りの描画）。着ている装備の絵が読み込み中の間も null。
//  - 装備の絵が無い（manifest に無い / 読めない）→ その装備だけ「今のコード描画を休めの姿勢でパーツに分けたもの」で代用。武器はコードで直接描く。
//  - 絵の背景は透明か単色（自動で透明化）。枠の中の不透明部分を自動検出し、今のコード描画の同じパーツの範囲に合わせる（多少ずれてもよい）。
//  - 色: スタイルごとの基準色（rigLayout.js の RIG_BASE。manifest の base/accent で上書き）→ アイテムの色へ、色相回転＋彩度・明度補正（陰影は残す）。
// 仕様: docs/SPEC_SPRITES.md「リグ（パーツ式）」
import {
  RIG_PARTS, RIG_W, RIG_H, RIG_S, RIG_R, RIG_GROUP_PARTS, RIG_BASE, RIG_SKIN_BASE, RIG_DEFAULT_WEAR, RIG_SLOTS, RIG_ACC_PARTS,
  WPN_W, WPN_H, WPN_S, WPN_R, WPN_BOX,
} from './rigLayout.js';
import { renderRigCode, renderRigWeapon, itemColors } from './character.js';
import { getSpriteMode, bumpSpriteRev, removeBg } from './sprites.js';

let RM = null;                     // 正規化済みの rig 設定（null = リグ無し）
let BASE = 'assets/sprites/';
let RREV = 0;                      // リグの画像が読み込まれるたびに +1（キャッシュのキー）
const SHEETS = new Map();          // key → シートの記録
const STAT = { files: 0, requested: 0, loaded: 0, failed: 0, gen: 0, bakes: 0, recolors: 0, warnings: [] };
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
  STAT.files = STAT.requested = STAT.loaded = STAT.failed = 0;
  if (typeof base === 'string') BASE = base;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  const src = j.parts || j.files;
  const files = {};
  const add = (key, v) => {
    if (typeof key !== 'string' || !/^[\w/@-]+$/.test(key) || key.includes('..')) { warn('rig: 不正なキー ' + key); return; }
    let o = v === true || v == null ? {} : typeof v === 'string' ? { file: v } : v;
    if (!o || typeof o !== 'object') return;
    const file = o.file != null ? o.file : 'rig/' + key + '.png';
    if (!safePath(file)) { warn('rig: ' + key + ' の file は assets/sprites/ からの相対パスにしてください'); return; }
    const info = parseKey(key);
    if (!info) { warn('rig: キーの形が違います ' + key + '（例 body_f, top/hoodie_f, weapon/knife, tear/1_f）'); return; }
    files[key] = {
      key, file, ...info,
      base: HEX.test(o.base || '') ? o.base.toLowerCase() : null,
      accent: HEX.test(o.accent || '') ? o.accent.toLowerCase() : null,
      fit: o.fit !== false, recolor: o.recolor !== false,
      bgRemove: o.bgRemove === false ? false : o.bgRemove === true ? true : 'auto',
      st: 0, parts: null, wpn: null, rc: new Map(),
    };
    STAT.files++;
  };
  if (Array.isArray(src)) for (const k of src) add(k, null);
  else if (src && typeof src === 'object') for (const k of Object.keys(src)) add(k, src[k]);
  for (const k in files) SHEETS.set(k, files[k]);
  RM = { enabled: j.enabled !== false, defaultWear: j.defaultWear !== false, heroesOnly: j.heroesOnly !== false };
  return true;
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
  return { enabled: !!(RM && RM.enabled), ...STAT, warnings: STAT.warnings.slice(-5), plans: PLANS.size, gens: GEN.size, rev: RREV };
}
export function hasRig() { return !!(RM && RM.enabled && SHEETS.size); }
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
    im.onload = () => {
      let ok = false;
      try { ok = rec.kind === 'weapon' ? prepWeapon(rec, im) : prepSheet(rec, im); } catch (e) { warn('rig: 前処理に失敗 ' + rec.file + ' ' + e.message); }
      done(ok);
    };
    im.onerror = () => { warn('rig: 画像を読めません ' + rec.file); done(false); };
    im.src = BASE + rec.file;
  } catch (e) { warn('rig: 読み込みに失敗 ' + rec.file + ' ' + e.message); done(false); }
  return rec;
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
function partCanvas(name) {
  const b = RIG_PARTS[name];
  const w = Math.ceil((b.w + MARGIN * 2) * K2), h = Math.ceil((b.h + MARGIN * 2) * K2);
  const cv = newCanvas(w, h);
  if (cv) cv.getContext('2d', { willReadFrequently: true });
  return { cv, w, h, px: (b.px - b.x + MARGIN) * K2, py: (b.py - b.y + MARGIN) * K2, R: RIG_R, name };
}
function prepSheet(rec, im) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  if (!(w0 > 0 && h0 > 0)) return false;
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
  for (const name of names) {
    const b = RIG_PARTS[name];
    const bb = bboxOf(d, RIG_W, RIG_H, b.x - MARGIN, b.y - MARGIN, b.w + MARGIN * 2, b.h + MARGIN * 2, 64, 1);
    if (!bb) continue;
    found++;
    const P = partCanvas(name);
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
    const ox = b.x - MARGIN, oy = b.y - MARGIN;
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    const dx = ((bb[0] - ax) * s + rx - ox) * K2, dy = ((bb[1] - ay) * s + ry - oy) * K2;
    pg.drawImage(c, bb[0], bb[1], bw, bh, dx, dy, bw * s * K2, bh * s * K2);
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
  let s = (rbb[2] - rbb[0]) / (bb[2] - bb[0]);
  if (!rec.fit) s = 1;
  s = Math.min(1.6, Math.max(0.6, s));
  let ax, ay, rx, ry;
  if (mn >= 4) { ax = mx / mn; ay = my / mn; rx = WPN_BOX.px; ry = WPN_BOX.py; }
  else if (!rec.fit) { ax = rx = 0; ay = ry = 0; }
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
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
  let h = 0, s = 0;
  if (c > 1e-6) {
    s = c / (1 - Math.abs(2 * l - 1) + 1e-9);
    if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, Math.min(1, s), l, c];
}
function hslRgb(h, s, l, out, o) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = ((h % 360) + 360) % 360 / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  out[o] = (r + m) * 255; out[o + 1] = (g + m) * 255; out[o + 2] = (b + m) * 255;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function colorInfo(hex) { const [r, g, b] = hexRgb(hex); const [h, s, l, c] = rgbHsl(r, g, b); return { h, s, l, c, chroma: c > 0.09, hex, rgb: [r, g, b] }; }
const OUT = hexRgb('#2a1430');
/** その画素が基準色 B の「布」っぽさ（0..1）。線（濃い紫・黒）・白いハイライト・他の色は 0 に近い */
function weightOf(r, g, b, h, s, l, c, B) {
  if (l < 0.05) return 0;
  const dO = Math.abs(r - OUT[0]) + Math.abs(g - OUT[1]) + Math.abs(b - OUT[2]);
  if (dO < 30 && dO < 0.75 * (Math.abs(r - B.rgb[0]) + Math.abs(g - B.rgb[1]) + Math.abs(b - B.rgb[2]))) return 0;   // 輪郭線（基準色より線の色に近い）
  if (B.chroma) {
    let dh = Math.abs(h - B.h); if (dh > 180) dh = 360 - dh;
    return (1 - sstep(24, 44, dh)) * sstep(0.04, 0.1, c) * (1 - sstep(0.42, 0.6, Math.abs(l - B.l)));
  }
  return (1 - sstep(0.08, 0.16, c)) * (1 - sstep(0.4, 0.55, Math.abs(l - B.l)));
}
/** 明るさ: 基準の明るさ lb → 目標 lt。陰影の差はそのまま（はみ出す側だけ縮める） */
function mapL(l, lb, lt) {
  const d = l - lb;
  const k = d < 0 ? Math.min(1, lt / Math.max(0.02, lb)) : Math.min(1, (1 - lt) / Math.max(0.02, 1 - lb));
  return lt + d * k;
}
/** 実際に描かれた布の色の平均（基準色の近くの画素）→ 補正の元にする（AI が少し違う色で描いても合う） */
function effectiveBase(rec) {
  const [bm, ba] = baseColors(rec);
  const res = [null, null];
  [bm, ba].forEach((hex, idx) => {
    if (!hex) return;
    const B = colorInfo(hex);
    let n = 0, sx = 0, sy = 0, ss = 0, sl = 0;
    for (const name in rec.parts) {
      const p = rec.parts[name];
      let d;
      try { d = p.cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.w, p.h).data; } catch { return; }
      for (let i = 0; i < d.length; i += 8) {
        if (d[i + 3] < 200) continue;
        const [h, s, l, c] = rgbHsl(d[i], d[i + 1], d[i + 2]);
        const w = weightOf(d[i], d[i + 1], d[i + 2], h, s, l, c, B);
        if (w < 0.6) continue;
        n++; sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180); ss += s; sl += l;
      }
    }
    if (n < 40) { res[idx] = B; return; }
    const h = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
    // 平均は陰影で暗めに出るので、基準色の明るさと平均の中間を使う
    res[idx] = { h: B.chroma ? h : B.h, s: B.chroma ? ss / n : B.s, l: (sl / n + B.l) / 2, c: B.c, chroma: B.chroma, hex, rgb: B.rgb };
  });
  return res;
}
function sameColor(a, b) {
  if (!a || !b) return true;
  const x = hexRgb(a), y = hexRgb(b);
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 10;
}
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
  if (o) return o;
  const eff = rec.eff || [colorInfo(bm), ba ? colorInfo(ba) : null];
  const maps = [];
  if (doM) maps.push([eff[0] || colorInfo(bm), colorInfo(main)]);
  if (doA) maps.push([eff[1] || colorInfo(ba), colorInfo(acc)]);
  const cv = newCanvas(p.w, p.h);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(p.cv, 0, 0);
  const img = g.getImageData(0, 0, p.w, p.h), d = img.data;
  const tmp = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const [h, s, l, c] = rgbHsl(r, gg, b);
    let best = 0, bi = -1;
    for (let m = 0; m < maps.length; m++) { const w = weightOf(r, gg, b, h, s, l, c, maps[m][0]); if (w > best) { best = w; bi = m; } }
    if (bi < 0 || best < 0.02) continue;
    const [B, T] = maps[bi];
    const h2 = B.chroma ? h + (T.h - B.h) : T.h;
    const s2 = B.chroma ? Math.min(1, s * (T.s / Math.max(0.05, B.s))) : T.s * (T.chroma ? 1 : 0);
    const l2 = Math.min(1, Math.max(0, mapL(l, B.l, T.l)));
    hslRgb(h2, s2, l2, tmp, 0);
    d[i] = r + (tmp[0] - r) * best; d[i + 1] = gg + (tmp[1] - gg) * best; d[i + 2] = b + (tmp[2] - b) * best;
  }
  g.putImageData(img, 0, 0);
  STAT.recolors++;
  o = { cv, w: p.w, h: p.h, px: p.px, py: p.py, R: p.R, name };
  if (rec.rc.size > 40) rec.rc.delete(rec.rc.keys().next().value);
  rec.rc.set(key, o);
  return o;
}

// ================================================================ コード描画の代用パーツ（絵が無い装備）
const GEN = new Map();
const GEN_MAX = 60;
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
const PLAN_MAX = 48;
function find(keys) { for (const k of keys) { const r = SHEETS.get(k); if (r) return r; } return null; }
const hex6 = (c) => (typeof c === 'string' && HEX.test(c) ? c.slice(1).toLowerCase() : null);
/** 主人公の look・装備 → リグのプラン | null（リグ無し・素体が無い/読み込み中・必要な絵が読み込み中・spriteMode=procedural） */
export function rigPlanFor(look, equip) {
  if (!RM || !RM.enabled || !SHEETS.size || !HAS || getSpriteMode() !== 'auto') return null;
  if (!look || look.villain || (RM.heroesOnly && !look.classId)) return null;
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
  const key = sig + '|' + RREV;
  let plan = PLANS.get(key);
  if (plan) { PLANS.delete(key); PLANS.set(key, plan); return plan; }
  plan = makePlan(key, g, look, equip, body, use, tears);
  PLANS.set(key, plan);
  while (PLANS.size > PLAN_MAX) PLANS.delete(PLANS.keys().next().value);
  return plan;
}
const STAGE_DMG = [0, 0.3, 0.6, 0.8, 0.95];
const HAND_R = 2.9;                 // 手の丸（単位）。腕の長さ = BODY の upper+fore
const ARM_L = { f: 7.6 + 7.2, m: 8.0 + 7.6 };
function stageOf(d) { return d >= 0.9 ? 4 : d >= 0.75 ? 3 : d >= 0.5 ? 2 : d >= 0.25 ? 1 : 0; }
function makePlan(key, g, look, equip, body, use, tears) {
  const bakes = [];
  return {
    sig: 'r' + RREV,
    g, body: body.key,
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
  const B = (n) => recolored(body, n, skin, null);
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
