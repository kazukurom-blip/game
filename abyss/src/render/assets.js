// 画像の登録所（差し替えの仕組みの中心）。
//
// すべての絵には「枠 ID」がある（例: hero.warrior.body / gear.sword / monster.ash_wolf / fx.s_bolt.proj / bg.act1）。
// 絵を探す順番:
//   1. 画像の差し替え（ゲーム内の「画像の差し替え」画面で入れた物。IndexedDB に保存）
//   2. assets/custom/ に置いた画像（assets/custom/custom.json に一覧。tools/scan_custom.mjs で作れる）
//   3. 予備の ID（'gear.helm.plate' → 'gear.helm' のように末尾を削った ID、spec.fallback）
//   4. コードで描いた絵（painters。差し替えが無くても必ず何か出る）
//
// 使い方（描く側）:
//   const spr = assets.sprite('monster.ash_wolf');  // { img, w, h, ax, ay, frames, fps, blend, custom, scale }
//   assets.draw(ctx, 'monster.ash_wolf', x, y, { scale, rot, alpha, flip, t });
//   assets.isCustom('fx.s_bolt.proj')  … 差し替えがあるか（無ければ fx はコードの演出を使う）

import { idb } from '../engine/storage.js';

const DPR_FALLBACK = 2; // コードの絵は 2 倍で描いておく（拡大してもにじまない）

class AssetRegistry {
  constructor() {
    this.slots = new Map(); // id → spec
    this.custom = new Map(); // id → { img, opts, source, url }
    this.cache = new Map(); // id → コードの絵（canvas）
    this.painters = []; // { prefix, fn(ctx, spec, w, h) }
    this.listeners = new Set();
    this.ready = false;
    this.baseUrl = '';
    this.version = 0;
  }

  // ---------- 枠
  define(spec) {
    const s = { w: 256, h: 256, ax: 0.5, ay: 1, frames: 1, fps: 10, blend: 'source-over', cat: 'misc', ...spec };
    this.slots.set(s.id, s);
    return s;
  }
  defineMany(list) { for (const s of list) this.define(s); }
  spec(id) {
    if (this.slots.has(id)) return this.slots.get(id);
    // 末尾を削って探す
    let cur = id;
    while (cur.includes('.')) {
      cur = cur.slice(0, cur.lastIndexOf('.'));
      if (this.slots.has(cur)) return this.slots.get(cur);
    }
    return null;
  }

  // ---------- コードの絵
  /** prefix で始まる枠をコードで描く関数を登録。長い prefix が優先 */
  addPainter(prefix, fn) {
    this.painters.push({ prefix, fn });
    this.painters.sort((a, b) => b.prefix.length - a.prefix.length);
    this.cache.clear();
  }
  painterFor(id) { return this.painters.find((p) => id === p.prefix || id.startsWith(`${p.prefix}.`) || id.startsWith(p.prefix)); }

  fallbackCanvas(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const spec = this.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5 };
    const pt = this.painterFor(id);
    const c = makeCanvas(Math.ceil(spec.w * DPR_FALLBACK), Math.ceil(spec.h * DPR_FALLBACK));
    if (c) {
      const ctx = c.getContext('2d');
      ctx.scale(DPR_FALLBACK, DPR_FALLBACK);
      try {
        if (pt) pt.fn(ctx, { ...spec, id }, spec.w, spec.h);
        else drawMissing(ctx, spec.w, spec.h, id);
      } catch (e) { console.error('[painter]', id, e); drawMissing(ctx, spec.w, spec.h, id); }
    }
    this.cache.set(id, c);
    return c;
  }

  // ---------- 差し替え
  isCustom(id) { return this.findCustom(id) !== null; }
  /** 自分か予備の ID の差し替え */
  findCustom(id) {
    if (this.custom.has(id)) return id;
    const spec = this.slots.get(id);
    for (const f of spec?.fallback || []) if (this.custom.has(f)) return f;
    if (spec?.noInherit) return null; // 親の ID の画像は使わない枠
    let cur = id;
    while (cur.includes('.')) {
      cur = cur.slice(0, cur.lastIndexOf('.'));
      if (this.custom.has(cur)) return cur;
    }
    return null;
  }

  /** 描くための情報。差し替えがあれば画像、無ければコードの絵 */
  sprite(id) {
    const cid = this.findCustom(id);
    const spec = this.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5, frames: 1, fps: 10, blend: 'source-over' };
    if (cid) {
      const c = this.custom.get(cid);
      const o = c.opts || {};
      const frames = Math.max(1, o.frames || 1);
      const fw = c.img.width / frames;
      const fh = c.img.height;
      // 枠の大きさに合わせる（高さ基準。o.scale で調整）
      const fit = (spec.fit === 'width' ? spec.w / fw : spec.h / fh) * (o.scale || 1);
      return {
        img: c.img, w: fw, h: fh, sw: fw * fit, sh: fh * fit, ax: o.ax ?? spec.ax, ay: o.ay ?? spec.ay, frames, fps: o.fps || spec.fps || 10,
        blend: o.blend || spec.blend, custom: true, flip: !!o.flip, ox: o.ox || 0, oy: o.oy || 0, anchors: { ...(spec.anchors || {}), ...(o.anchors || {}) }, id: cid,
      };
    }
    const img = this.fallbackCanvas(id);
    return { img, w: img ? img.width : spec.w, h: img ? img.height : spec.h, sw: spec.w, sh: spec.h, ax: spec.ax, ay: spec.ay, frames: 1, fps: 1, blend: spec.blend, custom: false, flip: false, ox: 0, oy: 0, anchors: spec.anchors || {}, id };
  }

  /**
   * 描く。(x, y) が枠の基準点（ax, ay）になる。
   * o: { scale, sx, sy, rot, alpha, flip, t（コマ送りの時間）, frame, blend, w, h（大きさを直接） }
   */
  draw(ctx, id, x, y, o = {}) {
    const s = typeof id === 'string' ? this.sprite(id) : id;
    if (!s?.img) return s;
    const scale = o.scale ?? 1;
    const w = (o.w ?? s.sw) * scale * (o.sx ?? 1);
    const h = (o.h ?? s.sh) * scale * (o.sy ?? 1);
    let frame = o.frame ?? 0;
    if (s.frames > 1 && o.t !== undefined && o.frame === undefined) frame = Math.floor(o.t * s.fps) % s.frames;
    ctx.save();
    ctx.translate(x + s.ox * scale, y + s.oy * scale);
    if (o.rot) ctx.rotate(o.rot);
    const flip = (o.flip ? -1 : 1) * (s.flip ? -1 : 1);
    if (flip < 0) ctx.scale(-1, 1);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    const blend = o.blend || s.blend;
    if (blend && blend !== 'source-over') ctx.globalCompositeOperation = blend;
    const fw = s.img.width / s.frames;
    ctx.drawImage(s.img, frame * fw, 0, fw, s.img.height, -w * s.ax, -h * s.ay, w, h);
    ctx.restore();
    return s;
  }

  /** 枠の中の点（アンカー）を画面の座標で。name = 'hand' など */
  anchor(s, name, x, y, o = {}) {
    const a = s.anchors?.[name];
    if (!a) return null;
    const scale = o.scale ?? 1;
    const w = s.sw * scale; const h = s.sh * scale;
    const flip = (o.flip ? -1 : 1) * (s.flip ? -1 : 1);
    return { x: x + (a[0] - s.ax) * w * flip, y: y + (a[1] - s.ay) * h };
  }

  // ---------- 読み込み
  async init({ baseUrl = '' } = {}) {
    this.baseUrl = baseUrl;
    await Promise.all([this.loadCustomFolder(), this.loadIdb()]);
    this.ready = true;
    this.changed();
  }

  async loadCustomFolder() {
    let list = null;
    try {
      const res = await fetch(`${this.baseUrl}assets/custom/custom.json`, { cache: 'no-cache' });
      if (res.ok) list = await res.json();
    } catch { list = null; }
    if (!list) return;
    const entries = Array.isArray(list) ? list : Object.entries(list).map(([id, v]) => (typeof v === 'string' ? { id, file: v } : { id, ...v }));
    await Promise.all(entries.map(async (e) => {
      if (!e?.id || !e.file) return;
      if (this.custom.has(e.id) && this.custom.get(e.id).source === 'studio') return;
      try {
        const img = await loadImage(`${this.baseUrl}assets/custom/${e.file}`);
        let out = img;
        if (e.opts?.chroma) out = removeBackground(img, e.opts.chroma) || img;
        this.custom.set(e.id, { img: out, opts: e.opts || {}, source: 'folder', url: e.file });
      } catch (err) { console.warn('[assets] 読めない画像', e.file, err?.message || err); }
    }));
  }

  async loadIdb() {
    const rows = await idb.all('assets');
    for (const [id, row] of rows) {
      try {
        const img = await blobToImage(row.blob);
        this.custom.set(id, { img, opts: row.opts || {}, source: 'studio', blob: row.blob });
      } catch (e) { console.warn('[assets] 保存した画像が読めない', id, e); }
    }
  }

  /**
   * 差し替えを入れる（ゲーム内の画面から）。file は Blob/File。
   * opts: { chroma: { tol }（背景を透明に）, trim: true（透明な外側を切る）, frames, fps, scale, ax, ay, flip, ox, oy, anchors, blend }
   */
  async setCustom(id, file, opts = {}) {
    let img = await blobToImage(file);
    if (opts.chroma) img = removeBackground(img, opts.chroma) || img;
    if (opts.trim) img = trimTransparent(img) || img;
    const blob = await canvasToBlob(img);
    const saveOpts = { ...opts };
    delete saveOpts.chroma; delete saveOpts.trim; // 加工は済んでいる
    await idb.put('assets', id, { blob: blob || file, opts: saveOpts, at: Date.now() });
    this.custom.set(id, { img, opts: saveOpts, source: 'studio', blob: blob || file });
    this.changed();
    return true;
  }

  /** 数値の設定だけ変える */
  async setCustomOpts(id, patch) {
    const c = this.custom.get(id);
    if (!c) return false;
    c.opts = { ...c.opts, ...patch };
    if (c.source === 'studio') {
      const row = await idb.get('assets', id);
      if (row) { row.opts = c.opts; await idb.put('assets', id, row); }
    }
    this.changed();
    return true;
  }

  async removeCustom(id) {
    const c = this.custom.get(id);
    if (!c) return;
    if (c.source === 'studio') await idb.del('assets', id);
    this.custom.delete(id);
    // フォルダの画像があれば戻す
    if (c.source === 'studio') await this.loadCustomFolder();
    this.changed();
  }

  async clearAllCustom() {
    await idb.clear('assets');
    this.custom.clear();
    await this.loadCustomFolder();
    this.changed();
  }

  /** まとめて書き出し（JSON。画像は data URL） */
  async exportPack() {
    const out = { format: 'abyss-drop-assetpack', version: 1, at: new Date().toISOString(), assets: {} };
    for (const [id, c] of this.custom) {
      if (c.source !== 'studio') continue;
      const url = await blobToDataUrl(c.blob);
      out.assets[id] = { data: url, opts: c.opts };
    }
    return out;
  }

  async importPack(pack) {
    if (!pack || pack.format !== 'abyss-drop-assetpack') throw new Error('画像パックの形式が違います');
    let n = 0;
    for (const [id, v] of Object.entries(pack.assets || {})) {
      try {
        const blob = await (await fetch(v.data)).blob();
        await this.setCustom(id, blob, v.opts || {});
        n++;
      } catch (e) { console.warn('[assets] 取り込めない', id, e); }
    }
    return n;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { this.version++; for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } }
}

export const assets = new AssetRegistry();

// ---------------- 画像の道具
export function makeCanvas(w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load failed: ${url}`));
    img.src = url;
  });
}

export async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  try { const img = await loadImage(url); return toCanvas(img); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function toCanvas(img) {
  const c = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

export function canvasToBlob(c) {
  return new Promise((resolve) => {
    try {
      if (c.toBlob) c.toBlob((b) => resolve(b), 'image/png');
      else if (c.convertToBlob) c.convertToBlob({ type: 'image/png' }).then(resolve, () => resolve(null));
      else resolve(null);
    } catch { resolve(null); }
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * 背景を透明にする。四隅から同じような色を塗りつぶしで消す（AI が出す白・単色の背景向け）。
 * opt: { tol: 0〜255（色の近さ。既定 40）, color?: [r,g,b]（消す色を指定）, feather: 1（縁をなめらかに） }
 */
export function removeBackground(img, opt = {}) {
  const w = img.width; const h = img.height;
  const c = makeCanvas(w, h);
  if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const tol = opt.tol ?? 40;
  const tol2 = tol * tol * 3;
  const seeds = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [0, h >> 1], [w - 1, h >> 1], [w >> 1, h - 1]];
  const bg = opt.color || (() => { const i = 0; return [d[i], d[i + 1], d[i + 2]]; })();
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (const [sx, sy] of seeds) {
    const i = (sy * w + sx) * 4;
    const ref = opt.color || [d[i], d[i + 1], d[i + 2]];
    if (colorDist2(d, i, ref) <= tol2 || colorDist2(d, i, bg) <= tol2) stack.push(sy * w + sx);
  }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (d[i + 3] === 0 || colorDist2(d, i, bg) <= tol2) {
      d[i + 3] = 0;
      const x = p % w; const y = (p / w) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y < h - 1) stack.push(p + w);
    }
  }
  // 縁をなめらかに（消した所の隣は半分の透明度）
  if (opt.feather !== 0) {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (seen[p]) continue;
      if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) { const i = p * 4; d[i + 3] = Math.min(d[i + 3], 150); }
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function colorDist2(d, i, ref) {
  const r = d[i] - ref[0]; const g = d[i + 1] - ref[1]; const b = d[i + 2] - ref[2];
  return r * r + g * g + b * b;
}

/** 透明な外側を切り落とす */
export function trimTransparent(img, pad = 2) {
  const w = img.width; const h = img.height;
  const src = makeCanvas(w, h);
  const sctx = src.getContext('2d');
  sctx.drawImage(img, 0, 0);
  const d = sctx.getImageData(0, 0, w, h).data;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const c = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  c.getContext('2d').drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, x1 - x0 + 1, y1 - y0 + 1);
  return c;
}

function drawMissing(ctx, w, h, id) {
  ctx.fillStyle = 'rgba(255,0,255,0.25)';
  ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
  ctx.strokeStyle = '#ff00ff';
  ctx.strokeRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.fillText(String(id).slice(0, 18), w * 0.22, h * 0.5);
}
