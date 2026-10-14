// 音の差し替え。枠 ID は効果音 `sfx.<id>`・BGM `bgm.<id>`。
// 探す順: ゲーム内で入れた音（IndexedDB の 'kv' に 'audio:<枠ID>' で保存）→ assets/custom/custom.json の "audio"
//         → コードで作った音。
// custom.json の書き方（どちらでもよい。ファイルの場所は assets/custom/ から。名前だけなら audio/ の中）:
//   { "audio": { "sfx.hit_phys": "audio/sfx.hit_phys.ogg", "bgm.act1": "audio/bgm.act1.mp3" } }
//   { "audio": [ { "id": "sfx.kill", "file": "audio/kill.wav", "vol": 0.8 } ] }

import { idb } from '../engine/storage.js';
import { SFX_DEFS } from './sfx.js';
import { THEMES } from './themes.js';

const PREFIX = 'audio:';
export const AUDIO_EXT = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'flac'];
export const MAX_FILE = 20 * 1024 * 1024;

/** 差し替えできる枠の一覧 */
export function audioSlots() {
  return [
    ...THEMES.map((t) => ({ id: `bgm.${t.id}`, kind: 'bgm', name: `曲「${t.name}」`, desc: t.desc, cat: 'bgm' })),
    ...SFX_DEFS.map((d) => ({ id: `sfx.${d.id}`, kind: 'sfx', name: d.name, cat: d.cat })),
  ];
}
export const isAudioSlot = (id) => audioSlots().some((s) => s.id === id);

export class CustomSounds {
  constructor(engine) {
    this.e = engine;
    this.rows = new Map(); // id → { source: 'studio'|'folder', name, size, bytes?: ArrayBuffer, url? }
    this.loaded = false;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) { try { f(); } catch (e) { console.error(e); } } }

  has(id) { return this.rows.has(id); }
  info(id) { return this.rows.get(id) || null; }
  list() { return [...this.rows.entries()].map(([id, r]) => ({ id, source: r.source, name: r.name, size: r.size, ok: this.e.custom.has(id), error: r.error })); }

  /** 保存してある差し替えを読む（AudioContext がまだ無くても読める。音にするのは decodeAll） */
  async load(baseUrl = '') {
    await Promise.all([this.loadFolder(baseUrl), this.loadIdb()]);
    this.loaded = true;
    await this.decodeAll();
    this.changed();
  }

  async loadIdb() {
    let keys = [];
    try { keys = (await idb.keys('kv')) || []; } catch { keys = []; }
    for (const k of keys) {
      if (typeof k !== 'string' || !k.startsWith(PREFIX)) continue;
      try {
        const row = await idb.get('kv', k);
        if (!row) continue;
        const bytes = row.bytes || (row.blob?.arrayBuffer ? await row.blob.arrayBuffer() : null);
        if (!bytes) continue;
        this.rows.set(k.slice(PREFIX.length), { source: 'studio', name: row.name || '', size: bytes.byteLength, bytes, vol: row.vol });
      } catch (e) { console.warn('[audio] 保存した音が読めない', k, e); }
    }
  }

  async loadFolder(baseUrl = '') {
    if (typeof fetch === 'undefined') return;
    let list = null;
    try {
      const res = await fetch(`${baseUrl}assets/custom/custom.json`, { cache: 'no-cache' });
      if (res.ok) list = await res.json();
    } catch { list = null; }
    const a = list?.audio;
    if (!a) return;
    const entries = Array.isArray(a) ? a : Object.entries(a).map(([id, v]) => (typeof v === 'string' ? { id, file: v } : { id, ...v }));
    await Promise.all(entries.map(async (e) => {
      if (!e?.id || !e.file) return;
      if (this.rows.get(e.id)?.source === 'studio') return;
      const file = String(e.file).includes('/') ? e.file : `audio/${e.file}`;
      try {
        const res = await fetch(`${baseUrl}assets/custom/${file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        this.rows.set(e.id, { source: 'folder', name: file, size: bytes.byteLength, bytes, url: file, vol: e.vol });
      } catch (err) { console.warn('[audio] 差し替えの音が読めない', file, err?.message || err); }
    }));
  }

  /** 読み込んだ音を AudioBuffer にする（AudioContext ができてから） */
  async decodeAll() {
    if (!this.e.ctx) return;
    for (const [id, r] of this.rows) await this.decodeOne(id, r);
  }

  async decodeOne(id, r) {
    if (!this.e.ctx || !r?.bytes) return false;
    const buf = await this.e.decode(r.bytes);
    if (buf) { this.e.custom.set(id, buf); r.error = null; return true; }
    r.error = '音声として読めませんでした';
    this.e.custom.delete(id);
    return false;
  }

  /** ゲームの中から差し替える。file は File/Blob/ArrayBuffer */
  async set(id, file, name = '') {
    if (!isAudioSlot(id)) throw new Error(`知らない枠です: ${id}`);
    const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    if (bytes.byteLength > MAX_FILE) throw new Error('ファイルが大きすぎます（20MB まで）');
    const row = { source: 'studio', name: name || file.name || '', size: bytes.byteLength, bytes };
    if (this.e.ctx) {
      const buf = await this.e.decode(bytes);
      if (!buf) throw new Error('音声として読めませんでした（ogg・mp3・wav を使ってください）');
      this.e.custom.set(id, buf);
    }
    this.rows.set(id, row);
    try { await idb.put('kv', PREFIX + id, { bytes, name: row.name, at: Date.now() }); } catch { /* 保存できなくても今回は使える */ }
    this.changed();
    return true;
  }

  async remove(id) {
    const r = this.rows.get(id);
    if (!r) return false;
    if (r.source === 'studio') { try { await idb.del('kv', PREFIX + id); } catch { /* ignore */ } }
    this.rows.delete(id);
    this.e.custom.delete(id);
    if (r.source === 'studio') {
      // フォルダの音があれば戻す
      await this.loadFolder(this.baseUrl || '');
      const f = this.rows.get(id);
      if (f) await this.decodeOne(id, f);
    }
    this.changed();
    return true;
  }

  async clearAll() {
    for (const [id, r] of [...this.rows]) if (r.source === 'studio') { try { await idb.del('kv', PREFIX + id); } catch { /* ignore */ } this.rows.delete(id); this.e.custom.delete(id); }
    await this.loadFolder(this.baseUrl || '');
    await this.decodeAll();
    this.changed();
  }
}
