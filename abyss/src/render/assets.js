// 画像の登録所（差し替えの仕組みの中心）。
//
// すべての絵には「枠 ID」がある（例: hero.warrior.body / gear.sword / monster.ash_wolf / fx.s_bolt.proj / bg.act1）。
// 絵を探す順番:
//   0. 調整中の下書き（画像の窓で調整している間だけ。保存していない）
//   1. 画像の差し替え（ゲーム内の「画像」の窓で入れた物。IndexedDB に保存）
//   2. assets/custom/ に置いた画像（assets/custom/custom.json に一覧。tools/scan_custom.mjs で作れる）
//   3. 予備の ID（spec.fallback、または 'gear.helm.plate' → 'gear.helm' のように末尾を削った ID）
//   4. コードで描いた絵（painters。差し替えが無くても必ず何か出る）
//
// 使い方（描く側）:
//   const spr = assets.sprite('monster.ash_wolf');  // { img, w, h, sw, sh, ax, ay, frames, fps, blend, custom, flip, ox, oy, rot, anchors }
//   assets.draw(ctx, 'monster.ash_wolf', x, y, { scale, rot, alpha, flip, t });
//   assets.drawFit(ctx, 'icon.item.sword', cx, cy, 40, 40)   … 縦横比を保って箱に収める（アイコン・ドロップの絵）
//   assets.drawCover(ctx, 'ui.title', 0, 0, 1280, 720)      … 箱いっぱいに広げる（はみ出た所は切る）
//   assets.isCustom('fx.s_bolt.proj')  … 差し替えがあるか（無ければ fx はコードの演出を使う）
// sprite() の戻り値は同じ ID なら同じ物を使い回す（毎フレーム呼んでも軽い）。中身を書き換えないこと。
//
// IndexedDB の 'assets' の入れ物は音の担当も 'audio:' で始まるキーで使う。画像の処理はそのキーを読まない・消さない。

import { idb } from '../engine/storage.js';

const DPR_FALLBACK = 2; // コードの絵は 2 倍で描いておく（拡大してもにじまない）
const MAX_SIDE = 2048; // 差し替え画像の 1 コマの長い辺の上限（大きすぎると重い）
const AUDIO_PREFIX = 'audio:';

class AssetRegistry {
  constructor() {
    this.slots = new Map(); // id → spec
    this.studio = new Map(); // id → { img, opts, source:'studio', blob, orig?, proc?, name?, at }
    this.folder = new Map(); // id → { img, opts, source:'folder', url, raw? }
    this.drafts = new Map(); // id → { img, opts, source:'draft' }
    this.custom = new Map(); // 実際に使う差し替え（studio が folder より優先）
    this.cache = new Map(); // id → コードの絵（canvas）
    this.sprites = new Map(); // id → sprite()（使い回し）
    this.thumbs = new Map(); // `${id}|${w}x${h}` → 小さな絵
    this.painters = []; // { prefix, fn(ctx, spec, w, h) }
    this.listeners = new Set();
    this.seen = new Map(); // 枠の一覧に無いのに使われた ID → 回数（画像の窓の「その他」）
    this.ready = false;
    this.baseUrl = '';
    this.version = 0;
    this.folderList = []; // custom.json の中身（normalizeCustomList）
  }

  // ---------- 枠
  define(spec) {
    const s = { w: 256, h: 256, ax: 0.5, ay: 1, frames: 1, fps: 10, blend: 'source-over', cat: 'misc', ...spec };
    this.slots.set(s.id, s);
    this.sprites.clear();
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
    this.sprites.clear();
    this.thumbs.clear();
  }
  painterFor(id) { return this.painters.find((p) => id === p.prefix || id.startsWith(`${p.prefix}.`) || id.startsWith(p.prefix)); }

  fallbackCanvas(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const spec = this.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5 };
    const c = makeCanvas(Math.ceil(spec.w * DPR_FALLBACK), Math.ceil(spec.h * DPR_FALLBACK));
    if (c) this.paintInto(c.getContext('2d'), id, spec, DPR_FALLBACK);
    this.cache.set(id, c);
    return c;
  }

  /** コードの絵を ctx に描く（scale 倍）。キャッシュしない */
  paintInto(ctx, id, spec = this.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5 }, scale = 1) {
    const pt = this.painterFor(id);
    ctx.save();
    ctx.scale(scale, scale);
    try {
      if (pt) pt.fn(ctx, { ...spec, id }, spec.w, spec.h);
      else drawMissing(ctx, spec.w, spec.h, id);
    } catch (e) { console.error('[painter]', id, e); drawMissing(ctx, spec.w, spec.h, id); }
    ctx.restore();
  }

  // ---------- 差し替え
  isCustom(id) { return this.findCustom(id) !== null; }
  /** 自分か予備の ID の差し替え（下書き → 差し替え → 予備 → 親の ID） */
  findCustom(id, depth = 0) {
    if (this.drafts.has(id) || this.custom.has(id)) return id;
    if (depth > 4) return null;
    const spec = this.slots.get(id);
    for (const f of spec?.fallback || []) { const r = this.findCustom(f, depth + 1); if (r) return r; }
    if (spec?.noInherit) return null; // 親の ID の画像は使わない枠
    let cur = id;
    while (cur.includes('.')) {
      cur = cur.slice(0, cur.lastIndexOf('.'));
      if (this.drafts.has(cur) || this.custom.has(cur)) return cur;
    }
    return null;
  }
  /** 差し替えの出どころ: 'draft' | 'studio' | 'folder' | null（予備の ID から来たときは from にその ID） */
  sourceOf(id) {
    const cid = this.findCustom(id);
    if (!cid) return { source: null, from: null };
    const c = this.drafts.get(cid) || this.custom.get(cid);
    return { source: c?.source || null, from: cid === id ? null : cid };
  }
  customEntry(id) { return this.drafts.get(id) || this.custom.get(id) || null; }

  /** 描くための情報。差し替えがあれば画像、無ければコードの絵（同じ ID なら使い回す） */
  sprite(id) {
    const hit = this.sprites.get(id);
    if (hit) return hit;
    if (!this.slots.has(id)) this.seen.set(id, (this.seen.get(id) || 0) + 1);
    const s = this.buildSprite(id);
    this.sprites.set(id, s);
    return s;
  }

  buildSprite(id) {
    const cid = this.findCustom(id);
    const spec = this.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5, frames: 1, fps: 10, blend: 'source-over' };
    if (cid) {
      const c = this.customEntry(cid);
      const o = c.opts || {};
      const frames = Math.max(1, o.frames || 1);
      const fw = c.img.width / frames;
      const fh = c.img.height;
      // 枠の大きさに合わせる（高さ基準。o.scale で調整）
      const fit = (spec.fit === 'width' ? spec.w / fw : spec.h / fh) * (o.scale || 1);
      return {
        img: c.img, w: fw, h: fh, sw: fw * fit, sh: fh * fit, ax: o.ax ?? spec.ax, ay: o.ay ?? spec.ay, frames, fps: o.fps || spec.fps || 10,
        blend: o.blend || spec.blend, custom: true, flip: !!o.flip, ox: o.ox || 0, oy: o.oy || 0, rot: ((o.rot || 0) * Math.PI) / 180, // flip は古い形だけ（今は加工で反転済み）
        anchors: { ...(spec.anchors || {}), ...(o.anchors || {}) }, id: cid, source: c.source,
      };
    }
    const img = this.fallbackCanvas(id);
    return { img, w: img ? img.width : spec.w, h: img ? img.height : spec.h, sw: spec.w, sh: spec.h, ax: spec.ax, ay: spec.ay, frames: 1, fps: 1, blend: spec.blend, custom: false, flip: false, ox: 0, oy: 0, rot: 0, anchors: spec.anchors || {}, id, source: null };
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
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.flip) ctx.scale(-1, 1);
    // 差し替え画像の補正（ずらし・回転）は絵の向きに合わせて一緒に回る
    if (s.ox || s.oy) ctx.translate((s.ox || 0) * scale, (s.oy || 0) * scale);
    if (s.rot) ctx.rotate(s.rot);
    if (s.flip) ctx.scale(-1, 1);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    const blend = o.blend || s.blend;
    if (blend && blend !== 'source-over') ctx.globalCompositeOperation = blend;
    const fw = s.img.width / s.frames;
    ctx.drawImage(s.img, frame * fw, 0, fw, s.img.height, -w * s.ax, -h * s.ay, w, h);
    ctx.restore();
    return s;
  }

  /** 縦横比を保って (cx, cy) を中心に w×h の箱へ収めて描く（アイコン・ドロップ・一覧の絵） */
  drawFit(ctx, id, cx, cy, w, h, o = {}) {
    const s = typeof id === 'string' ? this.sprite(id) : id;
    if (!s?.img) return s;
    const fw = s.img.width / (s.frames || 1); const fh = s.img.height;
    const k = Math.min(w / fw, h / fh) * (o.zoom ?? 1);
    let frame = o.frame ?? 0;
    if (s.frames > 1 && o.t !== undefined && o.frame === undefined) frame = Math.floor(o.t * s.fps) % s.frames;
    ctx.save();
    ctx.translate(cx, cy);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (o.blend) ctx.globalCompositeOperation = o.blend;
    if (s.flip && o.honorFlip !== false) ctx.scale(-1, 1);
    ctx.drawImage(s.img, frame * fw, 0, fw, fh, (-fw * k) / 2, (-fh * k) / 2, fw * k, fh * k);
    ctx.restore();
    return s;
  }

  /** 箱いっぱいに広げて描く（縦横比を保ち、はみ出た所は切る。タイトル画面など） */
  drawCover(ctx, id, x, y, w, h) {
    const s = typeof id === 'string' ? this.sprite(id) : id;
    if (!s?.img) return s;
    const fw = s.img.width / (s.frames || 1); const fh = s.img.height;
    const k = Math.max(w / fw, h / fh);
    const sw = w / k; const sh = h / k;
    ctx.drawImage(s.img, (fw - sw) / 2, (fh - sh) / 2, sw, sh, x, y, w, h);
    return s;
  }

  /** 一覧用の小さな絵（大きな背景も小さく描くだけなので軽い）。同じ大きさなら使い回す */
  thumb(id, w = 64, h = w) {
    const key = `${id}|${w}x${h}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    const c = makeCanvas(w, h);
    if (!c) return null;
    const ctx = c.getContext('2d');
    const cid = this.findCustom(id);
    if (cid) this.drawFit(ctx, id, w / 2, h / 2, w * 0.94, h * 0.94);
    else {
      const spec = this.spec(id) || { id, w: 128, h: 128 };
      const k = Math.min(w / spec.w, h / spec.h) * 0.94;
      ctx.save();
      ctx.translate((w - spec.w * k) / 2, (h - spec.h * k) / 2);
      this.paintInto(ctx, id, spec, k);
      ctx.restore();
    }
    if (this.thumbs.size > 600) this.thumbs.clear();
    this.thumbs.set(key, c);
    return c;
  }

  /** 枠の中の点（アンカー）を画面の座標で。name = 'hand' など */
  anchor(s, name, x, y, o = {}) {
    const a = s.anchors?.[name];
    if (!a) return null;
    const scale = o.scale ?? 1;
    const w = s.sw * scale; const h = s.sh * scale;
    let lx = (a[0] - s.ax) * w; let ly = (a[1] - s.ay) * h;
    if (s.flip) lx = -lx;
    if (s.rot) { const c = Math.cos(s.rot); const sn = Math.sin(s.rot); const rx = lx * c - ly * sn; ly = lx * sn + ly * c; lx = rx; }
    lx += (s.ox || 0) * scale; ly += (s.oy || 0) * scale;
    const f = o.flip ? -1 : 1;
    return { x: x + lx * f, y: y + ly };
  }

  // ---------- 読み込み
  async init({ baseUrl = '' } = {}) {
    this.baseUrl = baseUrl;
    await Promise.all([this.loadCustomFolder(), this.loadIdb()]);
    this.ready = true;
    this.changed();
  }

  /** assets/custom/custom.json の画像を読む（無ければ何もしない） */
  async loadCustomFolder() {
    let list = null;
    try {
      const res = await fetch(`${this.baseUrl}assets/custom/custom.json`, { cache: 'no-cache' });
      if (res.ok) list = await res.json();
    } catch { list = null; }
    this.folder.clear();
    this.folderList = normalizeCustomList(list);
    await Promise.all(this.folderList.map(async (e) => {
      try {
        const raw = await loadImage(`${this.baseUrl}assets/custom/${e.file}`);
        const proc = procFromOpts(e.opts);
        const spec = this.spec(e.id) || {};
        const { canvas } = processImage(raw, proc, spec, { frames: e.opts?.frames || 1, scale: e.opts?.scale });
        this.folder.set(e.id, { img: canvas || raw, opts: cleanOpts(e.opts), source: 'folder', url: e.file, raw });
      } catch (err) { console.warn('[assets] 読めない画像', e.file, err?.message || err); }
    }));
    this.rebuild();
  }

  async loadIdb() {
    const rows = await idb.all('assets');
    this.studio.clear();
    for (const [id, row] of rows) {
      if (typeof id !== 'string' || id.startsWith(AUDIO_PREFIX) || !row?.blob) continue;
      try {
        const img = await blobToImage(row.blob);
        this.studio.set(id, { img, opts: row.opts || {}, source: 'studio', blob: row.blob, orig: row.orig || null, proc: row.proc || null, name: row.name || '', at: row.at || 0 });
      } catch (e) { console.warn('[assets] 保存した画像が読めない', id, e); }
    }
    this.rebuild();
  }

  /** 使う差し替えの一覧を作り直す（studio が folder より優先） */
  rebuild() {
    this.custom = new Map(this.folder);
    for (const [id, c] of this.studio) this.custom.set(id, c);
  }

  /**
   * 差し替えを入れる（ゲーム内の画面から）。file は Blob/File（元の画像）。
   * opts: 描き方 { frames, fps, scale, ax, ay, flip, ox, oy, rot（度）, anchors, blend }
   * proc: 加工 { bg: 'none'|'auto'|'color'|'black', tol, color, contiguous, holes, feather, trim, crop:{l,t,r,b}（%）, seam（%）, crush }
   *   古い呼び方 opts.chroma / opts.trim も使える。
   * extra: { processed（加工済みの canvas。あれば加工し直さない）, keepOrig: true, name }
   */
  async setCustom(id, file, opts = {}, proc = null, extra = {}) {
    const o = { ...opts };
    const pr = proc ? { ...proc } : procFromOpts(o);
    if (o.flip && pr.flip === undefined) pr.flip = true; // 反転は画像に焼き込む（アンカーが見たままの位置になる）
    const saveOpts = cleanOpts(o);
    let img = extra.processed || null;
    if (!img) {
      const raw = await blobToImage(file);
      img = processImage(raw, pr, this.spec(id) || {}, { frames: saveOpts.frames || 1, scale: saveOpts.scale }).canvas || raw;
    }
    const blob = (await canvasToBlob(img)) || file;
    const row = { blob, opts: saveOpts, proc: pr, orig: extra.keepOrig === false ? null : file, name: extra.name || file?.name || '', at: Date.now() };
    await idb.put('assets', id, row);
    this.studio.set(id, { img, opts: saveOpts, source: 'studio', blob, orig: row.orig, proc: pr, name: row.name, at: row.at });
    this.drafts.delete(id);
    this.rebuild();
    this.changed();
    persistStorage();
    return true;
  }

  /** 数値の設定だけ変える（加工はそのまま） */
  async setCustomOpts(id, patch) {
    const c = this.studio.get(id) || this.folder.get(id);
    if (!c) return false;
    c.opts = cleanOpts({ ...c.opts, ...patch });
    if (c.source === 'studio') {
      const row = await idb.get('assets', id);
      if (row) { row.opts = c.opts; await idb.put('assets', id, row); }
    }
    this.changed();
    return true;
  }

  async removeCustom(id) {
    const had = this.studio.has(id);
    if (had) { await idb.del('assets', id); this.studio.delete(id); }
    this.drafts.delete(id);
    this.rebuild(); // フォルダの画像があればそれに戻る
    this.changed();
    return had;
  }

  /** ゲーム内で入れた画像をすべて消す（音の 'audio:' は残す） */
  async clearAllCustom() {
    const keys = (await idb.keys('assets')) || [];
    for (const k of keys) if (typeof k === 'string' && !k.startsWith(AUDIO_PREFIX)) await idb.del('assets', k);
    this.studio.clear();
    this.drafts.clear();
    this.rebuild();
    this.changed();
  }

  // ---------- 下書き（調整中の見た目。保存しないで戦闘の画面と試し表示に出す）
  setDraft(id, img, opts = {}) {
    if (!img) { this.clearDraft(id); return; }
    this.drafts.set(id, { img, opts: cleanOpts(opts), source: 'draft' });
    this.changed();
  }
  clearDraft(id) {
    if (!this.drafts.has(id)) return;
    this.drafts.delete(id);
    this.changed();
  }

  /** まとめて書き出し（JSON。画像は data URL）。includeOrig で元の画像も入れる（大きくなる） */
  async exportPack({ includeOrig = false, ids = null } = {}) {
    const out = { format: 'abyss-drop-assetpack', version: 2, at: new Date().toISOString(), assets: {} };
    for (const [id, c] of this.studio) {
      if (ids && !ids.includes(id)) continue;
      const v = { data: await blobToDataUrl(c.blob), opts: c.opts };
      if (c.proc) v.proc = c.proc;
      if (c.name) v.name = c.name;
      if (includeOrig && c.orig) v.orig = await blobToDataUrl(c.orig);
      out.assets[id] = v;
    }
    return out;
  }

  /** 画像パックを取り込む（version 1・2）。戻り値は取り込んだ数 */
  async importPack(pack) {
    const err = validatePack(pack);
    if (err) throw new Error(err);
    let n = 0;
    for (const [id, v] of Object.entries(pack.assets || {})) {
      try {
        const blob = await (await fetch(v.data)).blob();
        const orig = v.orig ? await (await fetch(v.orig)).blob() : null;
        const processed = await blobToImage(blob);
        await this.setCustom(id, orig || blob, v.opts || {}, v.proc || { bg: 'none', trim: false }, { processed, name: v.name || '' });
        n++;
      } catch (e) { console.warn('[assets] 取り込めない', id, e); }
    }
    return n;
  }

  /** 保存に使っている容量（ブラウザが教えてくれるときだけ） */
  async storageInfo() {
    try {
      const est = await navigator.storage?.estimate?.();
      let bytes = 0;
      for (const c of this.studio.values()) bytes += (c.blob?.size || 0) + (c.orig?.size || 0);
      return { usage: est?.usage ?? null, quota: est?.quota ?? null, images: bytes, count: this.studio.size };
    } catch { return { usage: null, quota: null, images: 0, count: this.studio.size }; }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() {
    this.version++;
    this.sprites.clear();
    this.thumbs.clear();
    for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } }
  }
}

export const assets = new AssetRegistry();

let persistAsked = false;
function persistStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* 使えない */ }
}

// ---------------------------------------------------------------- 設定の整理
/** 描き方の設定だけ残す（加工の項目は proc に入る） */
export function cleanOpts(o = {}) {
  const out = {};
  for (const k of ['frames', 'fps', 'scale', 'ax', 'ay', 'ox', 'oy', 'rot', 'anchors', 'blend']) {
    const v = o[k];
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
    if (k === 'frames' && v <= 1) continue;
    if ((k === 'ox' || k === 'oy' || k === 'rot') && v === 0) continue;
    if (k === 'scale' && v === 1) continue;
    if (k === 'anchors' && (typeof v !== 'object' || !Object.keys(v).length)) continue;
    out[k] = v;
  }
  return out;
}

/** 古い形（opts.chroma・opts.trim）とフォルダの設定から加工の設定を作る */
export function procFromOpts(o = {}) {
  const p = { bg: 'none', trim: false };
  if (o?.proc && typeof o.proc === 'object') Object.assign(p, o.proc);
  if (o?.chroma) { p.bg = o.chroma.color ? 'color' : 'auto'; p.tol = o.chroma.tol ?? 48; if (o.chroma.color) p.color = o.chroma.color; }
  if (o?.trim) p.trim = true;
  if (o?.crop) p.crop = o.crop;
  if (o?.seam) p.seam = o.seam;
  if (o?.bg && typeof o.bg === 'string') p.bg = o.bg;
  if (o?.flip) p.flip = true;
  for (const k of ['tol', 'color', 'holes', 'feather', 'contiguous', 'crush', 'pad']) if (o?.[k] !== undefined) p[k] = o[k];
  return p;
}

// ---------------------------------------------------------------- ファイル名・一覧・パック（Node でも使える）
const EXT_RE = /\.(png|jpe?g|webp|gif|avif)$/i;

/**
 * ファイル名から枠 ID を読む。例:
 *   'monster.ash_wolf.png' → { id: 'monster.ash_wolf' }
 *   'fx.s_bolt.proj@8f.png' → { id: 'fx.s_bolt.proj', frames: 8 }      （横に 8 コマ並べた画像）
 *   'fx.s_bolt.proj@6f12.webp' → { id, frames: 6, fps: 12 }
 *   'Hero.Warrior.Body (1).PNG' → { id: 'hero.warrior.body' }          （ダウンロードで付く「 (1)」は無視）
 */
export function parseAssetFileName(name) {
  let base = String(name || '').split(/[\\/]/).pop();
  const m = EXT_RE.exec(base);
  if (!m) return null;
  base = base.slice(0, m.index).trim();
  base = base.replace(/\s*\(\d+\)$/, '').replace(/\s*-\s*コピー$/, '').replace(/\s+copy$/i, '').trim();
  let frames; let fps;
  const fm = /@(\d+)f(\d+)?$/i.exec(base);
  if (fm) { frames = Number(fm[1]); if (fm[2]) fps = Number(fm[2]); base = base.slice(0, fm.index); }
  const id = base.toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(id)) return { id, ext: m[1].toLowerCase(), frames, fps, bad: true };
  return { id, ext: m[1].toLowerCase(), frames, fps };
}

/** custom.json の中身をそろえる → [{ id, file, opts }]。'_' で始まるキーと 'audio'（音の担当）は読まない */
export function normalizeCustomList(list) {
  if (!list || typeof list !== 'object') return [];
  const entries = Array.isArray(list) ? list : Object.entries(list).filter(([k]) => !k.startsWith('_') && !k.startsWith('$') && k !== 'audio').map(([id, v]) => (typeof v === 'string' ? { id, file: v } : { id, ...(v || {}) }));
  return entries.filter((e) => e && typeof e.id === 'string' && typeof e.file === 'string' && EXT_RE.test(e.file)).map((e) => ({ id: e.id, file: e.file, opts: e.opts && typeof e.opts === 'object' ? e.opts : {} }));
}

/** 画像パックの形を確かめる。問題があれば文（日本語）、無ければ null */
export function validatePack(pack) {
  if (!pack || typeof pack !== 'object') return '画像パックではありません（JSON を読めませんでした）';
  if (pack.format !== 'abyss-drop-assetpack') return '画像パックの形式が違います（format が abyss-drop-assetpack ではありません）';
  if (!pack.assets || typeof pack.assets !== 'object') return '画像パックに画像が入っていません';
  for (const [id, v] of Object.entries(pack.assets)) {
    if (!v || typeof v.data !== 'string' || !v.data.startsWith('data:image/')) return `「${id}」の画像が壊れています`;
  }
  return null;
}

/** 似ている枠 ID を探す（ファイル名の間違いの案内） */
export function suggestIds(id, all, n = 3) {
  const a = String(id || '').toLowerCase();
  const tok = new Set(a.split(/[._]/).filter(Boolean));
  const scored = [];
  for (const b of all) {
    const tb = b.split(/[._]/);
    let common = 0;
    for (const t of tb) if (tok.has(t)) common++;
    const d = editDistance(a, b, 12);
    scored.push({ id: b, s: common * 4 - d });
  }
  scored.sort((x, y) => y.s - x.s);
  return scored.slice(0, n).filter((x) => x.s > -6).map((x) => x.id);
}

function editDistance(a, b, cap = 99) {
  if (Math.abs(a.length - b.length) > cap) return cap;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap;
    prev = cur;
  }
  return prev[b.length];
}

// ---------------------------------------------------------------- 画素の計算（ImageData の data に直接。Node のテストでも動く）
/**
 * 四隅（n×n）の色の中央値から背景の色を決める。
 * 戻り値 { color:[r,g,b], corners:[[r,g,b]×4], agree: 4 隅がほぼ同じ色か, votes: 同じ色の隅の数 }
 */
export function cornerColor(d, w, h, n = 8) {
  const k = Math.max(1, Math.min(n, w >> 2, h >> 2));
  const at = (x0, y0) => {
    const rs = []; const gs = []; const bs = [];
    for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
    const med = (arr) => arr.sort((p, q) => p - q)[arr.length >> 1];
    return [med(rs), med(gs), med(bs)];
  };
  const corners = [at(0, 0), at(w - k, 0), at(0, h - k), at(w - k, h - k)];
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  let best = corners[0]; let votes = 0;
  for (const c of corners) {
    const v = corners.filter((o) => dist(o, c) < 30).length;
    if (v > votes) { votes = v; best = c; }
  }
  return { color: best, corners, agree: votes === 4, votes };
}

/** 透明度 250 未満の画素の割合（2% を超えれば「切り抜き済み」とみなす） */
export function transparencyRatio(d) {
  let n = 0;
  const total = d.length >> 2;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) n++;
  return total ? n / total : 0;
}

/**
 * 背景を透明にする（d を書き換える）。
 * opt: { tol: 色の近さ（RGB の距離。既定 48）, color: [r,g,b]（無ければ四隅から）, contiguous: true（外周からつながった所だけ）,
 *        holes: false（閉じた穴の同じ色も消す。64 画素以上の島だけ）, feather: 2（縁のなじませ幅 px）, despill: true }
 * 戻り値 { removed: 消した画素数, bg: [r,g,b] }
 */
export function keyOut(d, w, h, opt = {}) {
  const tol = Math.max(1, opt.tol ?? 48);
  const bg = opt.color || cornerColor(d, w, h).color;
  const N = w * h;
  const dist = new Float32Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    if (d[i + 3] < 8) { dist[p] = 0; continue; }
    const r = d[i] - bg[0]; const g = d[i + 1] - bg[1]; const b = d[i + 2] - bg[2];
    dist[p] = Math.sqrt(r * r + g * g + b * b);
  }
  const mask = new Uint8Array(N);
  if (opt.contiguous === false) {
    for (let p = 0; p < N; p++) if (dist[p] <= tol) mask[p] = 1;
  } else {
    const stack = new Int32Array(N); let sp = 0;
    const push = (p) => { if (!mask[p] && dist[p] <= tol) { mask[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp]; const x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < N - w) push(p + w);
    }
  }
  // 閉じた穴（腕と体のすきまなど）: きびしい条件で、大きな島だけ消す
  if (opt.holes) {
    const strict = tol * 0.6; const minIsland = opt.minHole ?? 64;
    const seen = new Uint8Array(N); const comp = new Int32Array(N); const stack = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (mask[s] || seen[s] || dist[s] > strict) continue;
      let sp = 0; let n = 0; stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const p = stack[--sp]; comp[n++] = p; const x = p % w;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < N - w ? p + w : -1];
        for (const q of nb) if (q >= 0 && !seen[q] && !mask[q] && dist[q] <= strict) { seen[q] = 1; stack[sp++] = q; }
      }
      if (n >= minIsland) for (let i = 0; i < n; i++) mask[comp[i]] = 1;
    }
  }
  // 縁: 消した所のとなり（feather px まで）を背景との近さで半透明にし、背景色のにじみを取る
  const band = Math.max(0, Math.min(4, opt.feather ?? 2));
  const level = new Uint8Array(N); // 1..band = 消した所からの距離
  let front = [];
  for (let p = 0; p < N; p++) {
    if (mask[p]) continue;
    const x = p % w;
    if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (p >= w && mask[p - w]) || (p < N - w && mask[p + w])) { level[p] = 1; front.push(p); }
  }
  for (let k = 2; k <= band; k++) {
    const next = [];
    for (const p of front) {
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < N - w ? p + w : -1]) if (q >= 0 && !mask[q] && !level[q]) { level[q] = k; next.push(q); }
    }
    front = next;
  }
  const greenBg = bg[1] > bg[0] + 40 && bg[1] > bg[2] + 40;
  const soft = tol * 1.5;
  let removed = 0;
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    if (mask[p]) { d[i + 3] = 0; removed++; continue; }
    if (!level[p] || band === 0) continue;
    const a = Math.max(0, Math.min(1, (dist[p] - tol) / soft));
    if (a < 1) {
      const inv = 1 - a; const aa = Math.max(a, 0.02);
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - inv * bg[c]) / aa));
      d[i + 3] = Math.round(d[i + 3] * a);
    }
    if (opt.despill !== false && greenBg) d[i + 1] = Math.min(d[i + 1], Math.max(d[i], d[i + 2]));
  }
  return { removed, bg };
}

/** 黒を透明にする（光の演出向け）。明るさを透明度に変え、色は明るく戻す */
export function blackToAlpha(d, crush = 16) {
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    if (m <= crush) { d[i + 3] = 0; continue; }
    const a = Math.min(1, (m - crush) / (255 - crush));
    const k = 255 / m;
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    d[i + 3] = Math.round(d[i + 3] * a);
  }
}

/** ほとんど黒（最大 < thr）を真っ黒に（加算で四角い箱が見えるのを防ぐ） */
export function crushBlack(d, thr = 16) {
  for (let i = 0; i < d.length; i += 4) if (d[i] < thr && d[i + 1] < thr && d[i + 2] < thr) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
}

/** 透明度 thr を超える画素の外枠 { x0, y0, x1, y1 }（無ければ null） */
export function alphaBBox(d, w, h, thr = 8, x0 = 0, x1 = w - 1) {
  let bx0 = Infinity; let by0 = Infinity; let bx1 = -1; let by1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = x0; x <= x1; x++) {
      if (d[(row + x) * 4 + 3] > thr) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    }
  }
  return bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}

/** 足元の基準点を探す（一番下の、不透明な画素が 3 つ以上ある行。x は下 4% の中央値）→ { ax, ay } */
export function findFeet(d, w, h, x0 = 0, x1 = w - 1) {
  let py = -1;
  for (let y = h - 1; y >= 0 && py < 0; y--) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 128 && ++n >= 3) { py = y; break; }
  }
  if (py < 0) return null;
  const bb = alphaBBox(d, w, h, 128, x0, x1);
  const band = Math.max(1, Math.round((bb.y1 - bb.y0 + 1) * 0.04));
  const xs = [];
  for (let y = Math.max(0, py - band + 1); y <= py; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 128) xs.push(x);
  xs.sort((a, b) => a - b);
  const fw = x1 - x0 + 1;
  return { ax: (xs[xs.length >> 1] - x0 + 0.5) / fw, ay: (py + 1) / h };
}

/** 右向きの体のアンカーを推定（手・副手・頭・背中・胸）。だいたいの位置なので、あとで画像の窓で直す */
export function guessAnchors(d, w, h, x0 = 0, x1 = w - 1) {
  const bb = alphaBBox(d, w, h, 128, x0, x1);
  if (!bb) return null;
  const fw = x1 - x0 + 1;
  const bw = bb.x1 - bb.x0 + 1; const bh = bb.y1 - bb.y0 + 1;
  const rowSpan = (y) => { let a = -1; let b = -1; for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 128) { if (a < 0) a = x; b = x; } return a < 0 ? null : [a, b]; };
  const yHand = Math.round(bb.y0 + bh * 0.55);
  const span = rowSpan(yHand) || [bb.x0, bb.x1];
  const headRow = Math.round(bb.y0 + bh * 0.08);
  const hs = rowSpan(headRow) || [bb.x0, bb.x1];
  const rel = (x, y) => [Math.round(((x - x0) / fw) * 1000) / 1000, Math.round((y / h) * 1000) / 1000];
  return {
    hand: rel(span[1] - bw * 0.06, yHand),
    offhand: rel(span[0] + (span[1] - span[0]) * 0.35, yHand),
    head: rel((hs[0] + hs[1]) / 2, bb.y0 + bh * 0.1),
    back: rel(bb.x0 + bw * 0.38, bb.y0 + bh * 0.38),
    chest: rel(bb.x0 + bw * 0.52, bb.y0 + bh * 0.42),
  };
}

/** 左右の端をなじませて横につながる絵にする（右端 ov px を左端に重ねて消していく）→ { data, width } */
export function seamBlend(d, w, h, ov) {
  ov = Math.max(1, Math.min(Math.floor(w / 3), Math.round(ov)));
  const W = w - ov;
  const out = new Uint8ClampedArray(W * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4; const s = (y * w + x) * 4;
      if (x < ov) {
        const t = x / ov; const s2 = (y * w + (w - ov + x)) * 4;
        for (let c = 0; c < 4; c++) out[o + c] = d[s2 + c] * (1 - t) + d[s + c] * t;
      } else for (let c = 0; c < 4; c++) out[o + c] = d[s + c];
    }
  }
  return { data: out, width: W };
}

// ---------------------------------------------------------------- 加工の流れ（ブラウザ: canvas）
/** 新しく入れた画像の加工の既定（枠の種類と、画像がもう透明かどうかで決める） */
export function autoProc(spec = {}, transparent = false, bgInfo = null) {
  const kind = spec.kind || '';
  const isFx = spec.cat === 'fx' && (spec.blend || 'lighter') === 'lighter';
  if (isFx) return { bg: 'none', trim: false, crush: true };
  if (kind === 'icon.skill' || kind === 'icon.support' || kind === 'hero.portrait' || kind === 'ui.title' || (kind === 'bg' && spec.params?.layer === 'far')) return { bg: 'none', trim: false };
  if (kind === 'bg') {
    // 中景・地面: 空が緑やマゼンタの単色なら抜く
    const c = bgInfo?.color;
    const chroma = c && ((c[1] > 180 && c[0] < 120 && c[2] < 120) || (c[0] > 180 && c[2] > 180 && c[1] < 100));
    return transparent || !chroma ? { bg: 'none', trim: false } : { bg: 'auto', tol: 60, trim: false, feather: 2 };
  }
  if (transparent) return { bg: 'none', trim: true };
  return { bg: 'auto', tol: 48, trim: true, feather: 2, contiguous: true };
}

/** ゲームで使う大きさ（縮めるだけ。広げない）。1 コマの { w?, h? } */
export function targetSize(spec = {}, scale = 1) {
  const s = Math.max(1, scale || 1);
  if (spec.fit === 'width') return { w: Math.min(2560, Math.round((spec.w || 1280) * 2)) };
  return { h: Math.min(MAX_SIDE, Math.max(32, Math.round((spec.h || 128) * 2 * s))) };
}

/**
 * 画像を加工する: 大きすぎれば縮める → 切り抜き → 背景を抜く／黒を透明に → 透明な外側を切る → 左右をつなげる → ゲームの大きさに縮める。
 * src: 画像か canvas。proc: setCustom の proc。o: { frames, scale, noResize }
 * 戻り値 { canvas, info: { srcW, srcH, removed, bg, transparent } }
 */
export function processImage(src, proc = {}, spec = {}, o = {}) {
  const frames = Math.max(1, o.frames || 1);
  const sw = src.naturalWidth || src.width; const sh = src.naturalHeight || src.height;
  const info = { srcW: sw, srcH: sh, removed: 0, bg: null, transparent: 0 };
  // 1. 大きすぎる画像は先に縮める（1 コマの長い辺 2048 まで）
  const k0 = Math.min(1, MAX_SIDE / Math.max(sw / frames, sh), 8192 / sw);
  let c = resizeCanvas(src, Math.max(frames, Math.round(sw * k0 / frames) * frames), Math.max(1, Math.round(sh * k0)));
  if (!c) return { canvas: null, info };
  // 2. 切り抜き（各コマの上下左右を %）
  const cr = proc.crop;
  if (cr && (cr.l || cr.t || cr.r || cr.b)) c = mapFrames(c, frames, (f) => cropCanvas(f, cr));
  // 3. 背景
  let ctx = c.getContext('2d', { willReadFrequently: true });
  let data = ctx.getImageData(0, 0, c.width, c.height);
  info.transparent = transparencyRatio(data.data);
  info.procW = c.width; info.procH = c.height;
  if (proc.bg === 'auto' || proc.bg === 'color') {
    const r = keyOut(data.data, c.width, c.height, { tol: proc.tol ?? 48, color: proc.bg === 'color' ? proc.color : null, contiguous: proc.contiguous !== false, holes: !!proc.holes, feather: proc.feather ?? 2, despill: proc.despill !== false });
    info.removed = r.removed; info.bg = r.bg;
    ctx.putImageData(data, 0, 0);
  } else if (proc.bg === 'black') {
    blackToAlpha(data.data, proc.crushLevel ?? 16);
    ctx.putImageData(data, 0, 0);
  } else if (proc.crush) {
    crushBlack(data.data, proc.crushLevel ?? 16);
    ctx.putImageData(data, 0, 0);
  }
  // 4. 透明な外側を切る（コマ送りは全コマ共通の外枠で）
  if (proc.trim) c = trimFrames(c, frames, proc.pad ?? 2) || c;
  // 5. 左右をつなげる（1 枚絵だけ）
  if (proc.seam && frames === 1) {
    ctx = c.getContext('2d', { willReadFrequently: true });
    data = ctx.getImageData(0, 0, c.width, c.height);
    const r = seamBlend(data.data, c.width, c.height, (c.width * proc.seam) / 100);
    const out = makeCanvas(r.width, c.height);
    const oc = out.getContext('2d');
    const id = oc.createImageData(r.width, c.height);
    id.data.set(r.data);
    oc.putImageData(id, 0, 0);
    c = out;
  }
  // 6. 左右反転（画像に焼き込む。アンカーは見たままの位置で決められる）
  if (proc.flip) c = flipCanvas(c, frames);
  // 7. ゲームの大きさへ（縮めるだけ）
  if (!o.noResize) {
    const t = targetSize(spec, o.scale);
    const fw = c.width / frames; const fh = c.height;
    const k = t.w ? Math.min(1, t.w / fw) : Math.min(1, t.h / fh);
    if (k < 0.999) c = resizeCanvas(c, Math.max(frames, Math.round((fw * k)) * frames), Math.max(1, Math.round(fh * k)));
  }
  return { canvas: c, info };
}

/** 左右反転（コマ送りはコマごとに） */
function flipCanvas(c, frames = 1) {
  return mapFrames(c, frames, (f) => {
    const out = makeCanvas(f.width, f.height);
    const ctx = out.getContext('2d');
    ctx.translate(f.width, 0); ctx.scale(-1, 1); ctx.drawImage(f, 0, 0);
    return out;
  });
}

/** コマごとに同じ処理をして並べ直す */
function mapFrames(c, frames, fn) {
  if (frames <= 1) return fn(c);
  const fw = Math.floor(c.width / frames);
  const parts = [];
  for (let i = 0; i < frames; i++) { const f = makeCanvas(fw, c.height); f.getContext('2d').drawImage(c, i * fw, 0, fw, c.height, 0, 0, fw, c.height); parts.push(fn(f)); }
  const out = makeCanvas(parts[0].width * frames, parts[0].height);
  const ctx = out.getContext('2d');
  parts.forEach((p, i) => ctx.drawImage(p, i * parts[0].width, 0));
  return out;
}

function cropCanvas(c, cr) {
  const l = Math.round((c.width * (cr.l || 0)) / 100); const r = Math.round((c.width * (cr.r || 0)) / 100);
  const t = Math.round((c.height * (cr.t || 0)) / 100); const b = Math.round((c.height * (cr.b || 0)) / 100);
  const w = Math.max(1, c.width - l - r); const h = Math.max(1, c.height - t - b);
  const out = makeCanvas(w, h);
  out.getContext('2d').drawImage(c, l, t, w, h, 0, 0, w, h);
  return out;
}

/** 透明な外側を切る。コマ送りなら全コマ共通の外枠で切ってそろえる */
function trimFrames(c, frames, pad = 2) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const fw = Math.floor(c.width / frames);
  let u = null;
  for (let i = 0; i < frames; i++) {
    const bb = alphaBBox(d, c.width, c.height, 8, i * fw, i * fw + fw - 1);
    if (!bb) continue;
    const r = { x0: bb.x0 - i * fw, y0: bb.y0, x1: bb.x1 - i * fw, y1: bb.y1 };
    u = u ? { x0: Math.min(u.x0, r.x0), y0: Math.min(u.y0, r.y0), x1: Math.max(u.x1, r.x1), y1: Math.max(u.y1, r.y1) } : r;
  }
  if (!u) return null;
  const x0 = Math.max(0, u.x0 - pad); const y0 = Math.max(0, u.y0 - pad); const x1 = Math.min(fw - 1, u.x1 + pad); const y1 = Math.min(c.height - 1, u.y1 + pad);
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  const out = makeCanvas(w * frames, h);
  const oc = out.getContext('2d');
  for (let i = 0; i < frames; i++) oc.drawImage(c, i * fw + x0, y0, w, h, i * w, 0, w, h);
  return out;
}

/** 大きさを変えた新しい canvas（半分ずつ縮めてきれいに。広げるときはそのまま 1 回） */
export function resizeCanvas(src, tw, th) {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  let cur = src; let w = src.naturalWidth || src.width; let h = src.naturalHeight || src.height; // 元の画像は書き換えない（いつも新しい canvas を返す）
  while (w / 2 >= tw && h / 2 >= th) {
    const nw = Math.max(tw, Math.floor(w / 2)); const nh = Math.max(th, Math.floor(h / 2));
    const c = makeCanvas(nw, nh);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, w, h, 0, 0, nw, nh);
    cur = c; w = nw; h = nh;
  }
  const out = makeCanvas(tw, th);
  if (!out) return null;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h, 0, 0, tw, th);
  return out;
}

/** 画像の情報（透明か・背景の色・大きさ）。重くないように縮めて調べる */
export function inspectImage(img) {
  const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
  const k = Math.min(1, 512 / Math.max(w, h));
  const c = resizeCanvas(img, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const tr = transparencyRatio(d);
  const bgc = cornerColor(d, c.width, c.height);
  return { w, h, transparent: tr > 0.02, ratio: tr, bg: bgc };
}

/** 加工した画像から足元・アンカーを探す（1 コマ目） */
export function detectAnchors(c, frames = 1) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const fw = Math.floor(c.width / Math.max(1, frames));
  return { feet: findFeet(d, c.width, c.height, 0, fw - 1), anchors: guessAnchors(d, c.width, c.height, 0, fw - 1) };
}

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
 * 背景を透明にする（前からある呼び方。中身は keyOut）。
 * opt: { tol: 0〜255（色の近さ。既定 48）, color?: [r,g,b]（消す色を指定）, feather: 2（縁をなめらかに） }
 */
export function removeBackground(img, opt = {}) {
  const w = img.width; const h = img.height;
  const c = makeCanvas(w, h);
  if (!c) return null;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  keyOut(data.data, w, h, { tol: opt.tol ?? 48, color: opt.color, feather: opt.feather ?? 2, contiguous: opt.contiguous !== false, holes: opt.holes });
  ctx.putImageData(data, 0, 0);
  return c;
}

/** 透明な外側を切り落とす */
export function trimTransparent(img, pad = 2) {
  const src = makeCanvas(img.width, img.height);
  src.getContext('2d').drawImage(img, 0, 0);
  return trimFrames(src, 1, pad);
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
