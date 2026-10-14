// 音（効果音・BGM）の入口。すべて WebAudio でその場で作る（音声ファイルは要らない）。
//
// 使い方（main.js から）:
//   audio.init(game)       … 出来事を聞き始める（AudioContext はまだ作らない）
//   audio.unlock()         … 画面に触れたとき。ここで初めて AudioContext を作る（ブラウザの決まり）
//   audio.music(id)        … 'title' / 'act3' / 'boss' / 'rift' など曲の ID、または地域の ID（'a1z1'）や 'auto' で場面に合わせる
//   audio.play(id, opts)   … 効果音（ID は sfx.js）。opts: { vol, pan(-1〜1), rate, force }
//   audio.setVolumes(sfx, bgm) … 0〜1
// ほかの担当は import しなくても game.events.emit('sfx', { id }) で鳴らせる（hooks.js の先頭に出来事の一覧）。
// 差し替え: 枠 ID sfx.<id> / bgm.<id>。設定の「音」から入れるか、assets/custom/custom.json の "audio" に書く。

import { AudioEngine } from './engine.js';
import { MusicSystem } from './music.js';
import { CustomSounds } from './custom.js';
import { makeFxHandler, makeEventHandler, uiClickSound } from './hooks.js';
import { ensureAudioSettings, currentPrefs, writeMirror } from './settings.js';
import { themeForState, actThemeForZone } from './composer.js';
import { THEME } from './themes.js';
import { LOOT_SFX, LOOT_ORDER, SFX } from './sfx.js';
import { sceneHooks } from '../render/scene.js';
import { installAudioUi } from './panel.js';

const LOOT_GATE = 0.4; // ドロップの音は 0.4 秒に 1 回まで（一番珍しい物を優先）

export const audio = {
  ctx: null,
  game: null,
  engine: new AudioEngine(),
  music: null, // 下で関数に差し替える（互換のため名前は music）
  musicSys: null,
  custom: null,
  inited: false,
  unlocked: false,
  auto: true,
  manual: null,
  wantTheme: 'title',
  startedAt: 0,
  lootGate: 0,
  pendingLoot: null,
  lootTimer: null,
  opts: {},

  /** 出来事を聞き始める。opts: { AudioContext（テスト用の偽物）, worker: false, baseUrl, dom: false } */
  init(game, opts = {}) {
    if (this.inited) { this.game = game; return this; }
    this.inited = true;
    this.game = game;
    this.opts = opts;
    this.musicSys = new MusicSystem(this.engine);
    this.custom = new CustomSounds(this.engine);
    this.custom.baseUrl = opts.baseUrl || '';
    this.custom.onChange(() => this.musicSys.refresh());
    sceneHooks.onFx.push(makeFxHandler(this));
    if (game?.events) {
      game.events.on('*', makeEventHandler(this));
    }
    // 保存してある差し替えを読む（AudioContext ができたら音にする）
    this.custom.load(this.custom.baseUrl).catch((e) => console.warn('[audio] 差し替えの読み込み', e));
    const hasDom = opts.dom !== false && typeof document !== 'undefined' && typeof window !== 'undefined';
    if (hasDom) {
      document.addEventListener('visibilitychange', () => this.onVisibility());
      document.addEventListener('click', (e) => { const id = uiClickSound(e.target); if (id) this.uiSound(id); }, true);
      window.addEventListener('keydown', () => this.unlock(), { capture: true });
      window.addEventListener('touchend', () => this.unlock(), { capture: true });
      installAudioUi(this);
      globalThis.__audio = this; // 調べもの・テスト用
    }
    this.housekeeping = setInterval(() => { try { this.tick(); } catch (e) { console.error('[audio]', e); } }, 400);
    this.housekeeping?.unref?.();
    this.applyPrefs();
    return this;
  },

  get prefs() { return currentPrefs(this.game?.started ? this.game.state : null); },

  /** 画面に触れた: AudioContext を作る・再開する */
  unlock() {
    if (!this.inited) return false;
    const e = this.engine;
    if (!e.ctx) {
      if (!e.start(this.opts.AudioContext, { worker: this.opts.worker !== false })) return false;
      this.ctx = e.ctx;
      try { e.ctx.onstatechange = () => { if (e.running) this.afterResume(); }; } catch { /* ignore */ }
      this.applyPrefs();
      e.prewarm();
      this.custom.decodeAll().then(() => this.musicSys.refresh()).catch(() => {});
    }
    this.updateRunState();
    return true;
  },

  /** 鳴らすか止めるか（消音中・別のタブを見ている間は AudioContext ごと止めて CPU を使わない） */
  updateRunState() {
    const e = this.engine;
    if (!e.ctx) return;
    const p = this.prefs;
    const run = !p.mute && !(document_hidden() && p.muteHidden);
    if (!run) { e.suspend(); return; }
    const pr = e.resume();
    if (e.running) this.afterResume();
    else pr?.then?.(() => { if (e.running) this.afterResume(); });
  },

  afterResume() {
    this.unlocked = true;
    if (!this.musicSys.playing) this.pickMusic(true);
  },

  /** 効果音 */
  play(id, o = {}) {
    if (!this.inited || !this.engine.running) return false;
    return this.engine.play(id, o);
  },

  /** 設定の「▶」: 効果音は消音の種類も無視して 1 回、BGM はその曲に切り替える */
  preview(slotId) {
    const id = String(slotId || '');
    if (id.startsWith('bgm.')) { this.setMusic(id.slice(4)); return true; }
    return this.play(id.replace(/^sfx\./, ''), { force: true, min: 0 });
  },

  /** 画面の操作の音（始まった直後の自動の窓は鳴らさない） */
  uiSound(id) {
    if (this.sinceStart() < 0.6 && id === 'ui_open') return false;
    return this.play(id);
  },

  sinceStart() { return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 99; },

  duck(depth, hold) {
    if (!this.prefs.duck) return;
    this.engine.duck(depth, hold);
  },

  // ---------------------------------------------------------------- ドロップの音（0.4 秒に 1 回・一番珍しい物を優先）
  loot(e) {
    const it = e?.item;
    if (!it || !this.engine.running) return;
    if (e.where === 'salvaged') return; // 自動で分解された物は鳴らさない
    const p = this.prefs;
    if (p.cats.loot === false || p.loot[it.rarity] === false) return;
    const rank = LOOT_ORDER.indexOf(it.rarity) * 10 + (it.q || 0) * 3;
    const now = this.engine.time;
    if (now >= this.lootGate) { this.playLoot(it); return; }
    if (!this.pendingLoot || rank > this.pendingLoot.rank) this.pendingLoot = { it, rank };
    if (!this.lootTimer) {
      this.lootTimer = setTimeout(() => {
        this.lootTimer = null;
        const pl = this.pendingLoot; this.pendingLoot = null;
        if (pl) this.playLoot(pl.it);
      }, Math.max(10, (this.lootGate - now) * 1000 + 5));
    }
  },

  playLoot(it) {
    this.lootGate = this.engine.time + LOOT_GATE;
    const id = LOOT_SFX[it.rarity] || 'drop_common';
    this.play(id, { min: 0 });
    const p = this.prefs;
    if (it.q >= 1 && p.loot.quality !== false) setTimeout(() => this.play(it.q >= 2 ? 'drop_primal' : 'drop_ancient', { min: 0, vol: 0.8 }), 90);
    const idx = LOOT_ORDER.indexOf(it.rarity);
    if (idx >= 7) this.duck(0.25, 2.6);
    else if (idx >= 4) this.duck(0.45, 1.1);
  },

  // ---------------------------------------------------------------- BGM
  /** 曲を選ぶ。'auto' か地域 ID なら場面に合わせる */
  setMusic(id = 'auto') {
    if (!id || id === 'auto' || (!THEME[id] && !String(id).startsWith('bgm.'))) {
      this.auto = true; this.manual = null;
      if (id && id !== 'auto' && !THEME[id]) this.wantTheme = actThemeForZone(id);
      this.pickMusic(true);
      return;
    }
    const tid = String(id).replace(/^bgm\./, '');
    this.auto = false; this.manual = tid;
    this.wantTheme = tid;
    this.musicSys.play(tid);
  },

  /** 場面に合う曲にする（force でなければ変わったときだけ） */
  pickMusic(force = false) {
    if (!this.inited) return;
    const id = this.auto ? (this.game?.started ? themeForState(this.game) : this.wantTheme || 'title') : this.manual;
    if (!id) return;
    this.wantTheme = id;
    if (force || this.musicSys.playing !== id) this.musicSys.play(id);
  },

  onWorldEvent(type, payload) {
    if (type === 'started') {
      this.startedAt = Date.now();
      if (this.game?.state) ensureAudioSettings(this.game.state.settings);
      this.applyPrefs();
      this.auto = true; this.manual = null;
    }
    if (!this.auto) return;
    if (type === 'stageStart' && payload?.boss) {
      const z = payload.zone;
      this.musicSys.play(z?.zoneIdx === 4 ? (z.id === 'a10z5' ? 'boss_final' : 'boss_act') : 'boss');
      return;
    }
    // 少し後に状態から選び直す（モードの切り替えなどを待つ）
    setTimeout(() => this.pickMusic(), 30);
  },

  // ---------------------------------------------------------------- 設定
  applyPrefs() {
    const p = this.prefs;
    this.engine.cats = { ...p.cats };
    this.engine.setVolumes({ master: p.master, sfx: p.sfx, bgm: p.bgm, mute: p.mute });
    writeMirror(p);
    this.updateRunState(); // AudioContext は画面に触れたときにしか作らないので、ここで再開しても決まりに反しない
  },

  /** 互換: setVolumes(sfx, bgm) */
  setVolumes(sfx, bgm) {
    const s = this.game?.state?.settings;
    if (s) { if (typeof sfx === 'number') s.sfx = sfx; if (typeof bgm === 'number') s.bgm = bgm; }
    this.applyPrefs();
  },

  setMuted(m) {
    const s = this.game?.state?.settings;
    if (s) ensureAudioSettings(s).mute = !!m;
    this.applyPrefs();
  },

  onVisibility() {
    this.musicSys.setHidden(document_hidden());
    this.updateRunState();
  },

  tick() {
    if (!this.engine.running) return;
    if (this.auto && this.game?.started) this.pickMusic();
  },

  /** 調べもの用の数字 */
  debug() {
    const e = this.engine;
    return {
      ctx: e.ctx ? e.ctx.state : 'none', unlocked: this.unlocked, music: this.musicSys?.playing || null, want: this.wantTheme, auto: this.auto,
      players: this.musicSys?.players.length || 0, voices: e.voices.length, busy: e.voices.filter((v) => v.src && v.end > e.time).length,
      buffers: e.buffers.size, worker: !!e.renderer?.usingWorker, rendered: e.renderer?.done.size || 0,
      stats: { ...e.stats, byCat: { ...e.stats.byCat } }, music_stats: { ...(this.musicSys?.stats || {}) }, custom: [...e.custom.keys()],
      sfxCount: Object.keys(SFX).length, themes: Object.keys(THEME).length,
    };
  },
};

// 互換: audio.music(id) を関数として使えるように（MusicSystem は audio.musicSys）
audio.music = function music(id) { return audio.setMusic(id); };

function document_hidden() { return typeof document !== 'undefined' && !!document.hidden; }
