// WebAudio の中心: 音の通り道（マスター・効果音・BGM・残響・ダッキング）、効果音の声（ボイス）の使い回し、間引き。
//
// 通り道:
//   効果音のボイス ×24（gain → pan）→ sfxBus ─┐
//   BGM の各曲 → musicBus → duck ───────────────┼→ master → 圧縮（音割れ防止）→ スピーカー
//   BGM の残響の送り → verbIn → 畳み込み → musicBus
//
// AudioContext はユーザーが画面に触れたとき（unlock）に初めて作る。無い環境（Node・古いブラウザ）では何もしない。

import { SFX } from './sfx.js';
import { Renderer, jobKey } from './render.js';
import { renderImpulse } from './instruments.js';

const VOICES = 24;
const DENSE_CATS = { combat: 1, skill: 1 };

export const volCurve = (v) => { const x = Math.max(0, Math.min(1, Number(v) || 0)); return x * x; };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.failed = false;
    this.buffers = new Map(); // jobKey → AudioBuffer
    this.custom = new Map(); // 'sfx.<id>' | 'bgm.<id>' → AudioBuffer（差し替え）
    this.renderer = null;
    this.voices = [];
    this.lastPlay = {};
    this.vc = {};
    this.dense = []; // 戦闘の音の直近の時刻
    this.cats = {};
    this.vol = { master: 0.8, sfx: 0.6, bgm: 0.35, mute: false };
    this.stats = { played: 0, throttled: 0, dropped: 0, late: 0, stolen: 0, sources: 0, notes: 0, byCat: {} };
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  get time() { return this.ctx ? this.ctx.currentTime : 0; }

  /** AudioContext を作って通り道を組む。Ctor を渡すとそれを使う（テスト用） */
  start(Ctor, { worker = true } = {}) {
    if (this.ctx) return true;
    if (this.failed) return false;
    const C = Ctor || globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) { this.failed = true; return false; }
    try { this.ctx = new C({ latencyHint: 'interactive' }); } catch {
      try { this.ctx = new C(); } catch { this.failed = true; return false; }
    }
    const ctx = this.ctx;
    try {
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
      this.comp.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.connect(this.comp);
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
      this.duckGain = ctx.createGain(); this.duckGain.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.duckGain);
      this.verbIn = ctx.createGain();
      try {
        this.verb = ctx.createConvolver();
        const ir = renderImpulse(Math.min(32000, ctx.sampleRate || 32000));
        const b = ctx.createBuffer(2, ir.channels[0].length, ir.sr);
        b.copyToChannel ? (b.copyToChannel(ir.channels[0], 0), b.copyToChannel(ir.channels[1], 1)) : (b.getChannelData(0).set(ir.channels[0]), b.getChannelData(1).set(ir.channels[1]));
        this.verb.buffer = b;
        this.verbIn.connect(this.verb); this.verb.connect(this.musicBus);
      } catch { this.verbIn.connect(this.musicBus); }
      for (let i = 0; i < VOICES; i++) {
        const g = ctx.createGain(); g.gain.value = 0;
        let pan = null;
        try { pan = ctx.createStereoPanner(); g.connect(pan); pan.connect(this.sfxBus); } catch { g.connect(this.sfxBus); pan = null; }
        this.voices.push({ gain: g, pan, src: null, start: 0, end: 0, prio: 0, id: '' });
      }
      // 風の音などに使う雑音（2 秒・繰り返し用）
      const nb = ctx.createBuffer(1, 2 * 22050, 22050);
      const nd = nb.getChannelData(0);
      let s = 9876;
      for (let i = 0; i < nd.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; nd[i] = (s / 0x7fffffff) * 2 - 1; }
      this.noiseBuffer = nb;
    } catch (e) {
      console.warn('[audio] 音の通り道を作れない', e);
      try { ctx.close?.(); } catch { /* ignore */ }
      this.ctx = null; this.failed = true; return false;
    }
    this.renderer = new Renderer({ worker });
    this.applyVolumes(true);
    return true;
  }

  resume() { try { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') return this.ctx.resume(); } catch { /* ignore */ } return Promise.resolve(); }
  suspend() { try { if (this.ctx && this.ctx.state === 'running') return this.ctx.suspend(); } catch { /* ignore */ } return Promise.resolve(); }

  // ---------------------------------------------------------------- 音量
  setVolumes(v = {}) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes(instant = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p, val) => { try { if (instant) p.setValueAtTime(val, t); else { p.cancelScheduledValues?.(t); p.setTargetAtTime(val, t, 0.05); } } catch { p.value = val; } };
    set(this.master.gain, this.vol.mute ? 0 : volCurve(this.vol.master));
    // 既定（効果音 60%・BGM 35%）で、BGM の平均が打撃音より 2〜3dB 下になるように合わせてある
    set(this.sfxBus.gain, volCurve(this.vol.sfx) * 2.5);
    set(this.musicBus.gain, volCurve(this.vol.bgm) * 2.4);
  }

  /** BGM を少しの間小さくする（レジェンダリー以上・ボスの登場） */
  duck(depth = 0.35, hold = 1.2, release = 0.9) {
    if (!this.running) return;
    const g = this.duckGain.gain; const t = this.ctx.currentTime;
    if (this.duckUntil && t < this.duckUntil && depth >= this.duckDepth) { // もっと深いのが効いている
      hold = Math.max(0, this.duckUntil - t - 0.06);
      depth = this.duckDepth;
    }
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(depth, t + 0.06);
      g.setValueAtTime(depth, t + 0.06 + hold);
      g.linearRampToValueAtTime(1, t + 0.06 + hold + release);
    } catch { /* ignore */ }
    this.duckUntil = t + 0.06 + hold; this.duckDepth = depth;
  }

  // ---------------------------------------------------------------- 音の素材
  toAudioBuffer(res) {
    if (!res || !res.data || !this.ctx) return null;
    try {
      const b = this.ctx.createBuffer(1, res.data.length, res.sr);
      if (b.copyToChannel) b.copyToChannel(res.data, 0); else b.getChannelData(0).set(res.data);
      return b;
    } catch (e) { console.warn('[audio] AudioBuffer を作れない', e); return null; }
  }

  /** できていれば AudioBuffer、まだなら null */
  getBuffer(job) {
    const key = jobKey(job);
    let b = this.buffers.get(key);
    if (b) return b;
    if (!this.renderer?.has(job)) return null;
    b = this.toAudioBuffer(this.renderer.get(job));
    if (b) this.buffers.set(key, b);
    return b;
  }

  /** 作ってもらって AudioBuffer を返す */
  ensure(job, prio = 0) {
    const b = this.getBuffer(job);
    if (b || !this.renderer) return Promise.resolve(b);
    return this.renderer.request(job, prio).then(() => this.getBuffer(job));
  }

  /** 前もって全部の効果音を作っておく（よく鳴る物から） */
  prewarm() {
    if (!this.renderer) return;
    const order = { combat: 50, ui: 45, skill: 40, loot: 35, craft: 20, event: 25 };
    for (const d of Object.values(SFX)) for (let v = 0; v < d.variants; v++) this.renderer.request({ kind: 'sfx', id: d.id, v }, (order[d.cat] || 10) - v);
  }

  // ---------------------------------------------------------------- 再生
  alloc(prio) {
    const now = this.ctx.currentTime;
    let best = null;
    for (const v of this.voices) {
      if (!v.src || v.end <= now) return v;
      if (v.prio <= prio && (!best || v.prio < best.prio || (v.prio === best.prio && v.start < best.start))) best = v;
    }
    return best;
  }

  playBuffer(buf, { vol = 0.5, pan = 0, rate = 1, prio = 30, id = '', when = 0 } = {}) {
    if (!this.running || !buf) return false;
    const ctx = this.ctx;
    const v = this.alloc(prio);
    if (!v) { this.stats.dropped++; return false; }
    const now = ctx.currentTime;
    let t = Math.max(now + 0.004, when || 0);
    const g = v.gain.gain;
    try {
      if (v.src && v.end > now) {
        this.stats.stolen++;
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.008);
        try { v.src.stop(now + 0.01); } catch { /* ignore */ }
        t = Math.max(t, now + 0.012);
      } else g.cancelScheduledValues(now);
      g.setValueAtTime(vol, t);
      if (v.pan) v.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(v.gain);
      src.start(t);
      src.onended = () => { try { src.disconnect(); } catch { /* ignore */ } if (v.src === src) v.src = null; };
      v.src = src; v.start = t; v.end = t + buf.duration / rate + 0.02; v.prio = prio; v.id = id;
      this.stats.sources++;
      return true;
    } catch (e) { console.warn('[audio] 再生できない', e); return false; }
  }

  /**
   * 効果音を鳴らす。o: { vol, pan, rate, prio, min（間隔の上書き）, force（種類の消音を無視）, late（作りかけのとき待てる秒） }
   * 戻り値: 鳴らした（または作り終わり次第鳴らす）なら true
   */
  play(id, o = {}) {
    if (!this.running) return false;
    const d = SFX[id];
    const cust = this.custom.get(`sfx.${id}`);
    if (!d && !cust) return false;
    const cat = d?.cat || 'event';
    if (this.cats[cat] === false && !o.force) return false;
    const now = this.ctx.currentTime;
    const min = o.min ?? d?.min ?? 0.05;
    if (now - (this.lastPlay[id] ?? -99) < min) { this.stats.throttled++; return false; }
    if (DENSE_CATS[cat] && !o.force) {
      // 戦闘の音は 0.1 秒に 5 つまで（大勢を巻き込んでもうるさくならない）
      while (this.dense.length && now - this.dense[0] > 0.1) this.dense.shift();
      if (this.dense.length >= 5 && (o.prio ?? d?.prio ?? 0) < 40) { this.stats.throttled++; return false; }
      this.dense.push(now);
    }
    this.lastPlay[id] = now;
    this.stats.played++;
    this.stats.byCat[cat] = (this.stats.byCat[cat] || 0) + 1;
    const opts = { vol: (d?.vol ?? 0.5) * (o.vol ?? 1), pan: o.pan || 0, prio: o.prio ?? d?.prio ?? 30, id };
    if (cust) return this.playBuffer(cust, { ...opts, rate: o.rate || 1 });
    let v = 0;
    if (d.variants > 1) { const prev = this.vc[id] ?? 0; v = (prev + 1 + Math.floor(Math.random() * (d.variants - 1))) % d.variants; this.vc[id] = v; }
    const rate = (o.rate || 1) * (d.variants > 1 || DENSE_CATS[cat] ? 1 + (Math.random() - 0.5) * 0.05 : 1);
    const vol = opts.vol * (DENSE_CATS[cat] ? 0.9 + Math.random() * 0.1 : 1);
    const job = { kind: 'sfx', id, v };
    const buf = this.getBuffer(job);
    if (buf) return this.playBuffer(buf, { ...opts, vol, rate });
    // まだ作っていない: 作り終わったら（遅すぎなければ）鳴らす
    const late = o.late ?? (DENSE_CATS[cat] ? 0.12 : 0.8);
    this.ensure(job, 100).then((b) => {
      if (!b) return;
      if (this.ctx.currentTime - now <= late) this.playBuffer(b, { ...opts, vol, rate });
      else this.stats.late++;
    });
    return true;
  }

  /** 差し替えの音を AudioBuffer に（失敗したら null） */
  async decode(arrayBuffer) {
    if (!this.ctx || !arrayBuffer) return null;
    try {
      const copy = arrayBuffer.slice(0);
      return await new Promise((resolve, reject) => {
        const p = this.ctx.decodeAudioData(copy, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
    } catch { return null; }
  }
}
