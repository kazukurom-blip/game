// BGM を鳴らす: 先読みの予約（lookahead scheduler）で数百ミリ秒先までの音符を WebAudio に予約する。
// 曲の切り替えは 2 つの曲を同時に鳴らして交差フェード。和音の伸ばし（パッド）と持続音は発振器を使い回す
// （和音が変わるたびに周波数をなめらかに動かすだけで、ノードは作り直さない）。
// 差し替えの曲（bgm.<id>）があれば、それをそのまま繰り返し再生する。

import { THEME } from './themes.js';
import { composeBar, themeInfo, themeNeeds } from './composer.js';
import { mtof } from './dsp.js';
import { rootFor } from './instruments.js';

const LAYER_CAP = { bass: 4, arp: 10, lead: 6, drums: 14, amb: 4 };
const LANES = [0.38, 0.58, 0.8, 1];
const needsCache = new Map();
const needsOf = (th) => { let n = needsCache.get(th.id); if (!n) { n = themeNeeds(th); needsCache.set(th.id, n); } return n; };

export class MusicSystem {
  constructor(engine) {
    this.e = engine;
    this.players = [];
    this.current = null;
    this.want = null;
    this.timer = null;
    this.hidden = false;
    this.lookahead = 0.25;
    this.stats = { switches: 0, notes: 0, dropped: 0, late: 0 };
  }

  get ctx() { return this.e.ctx; }
  get playing() { return this.current && !this.current.stopping ? this.current.id : null; }

  /** 曲を流す（同じ曲なら何もしない）。止めるのは stop() */
  play(id, { fade = 1.8 } = {}) {
    if (!THEME[id] && !this.e.custom.has(`bgm.${id}`)) return false;
    this.want = id;
    if (!this.e.running) return false;
    if (this.current && this.current.id === id && !this.current.stopping) return true;
    const p = new ThemePlayer(this, id);
    this.current = p;
    this.players.push(p);
    this.stats.switches++;
    p.prepare().then(() => {
      if (this.current !== p || !this.e.ctx) { p.dispose(); this.players = this.players.filter((x) => x !== p); return; }
      const t = this.ctx.currentTime + 0.06;
      for (const q of this.players) if (q !== p && !q.stopping) q.stop(t, fade);
      p.start(t, fade);
      this.tick();
    });
    this.ensureTimer();
    return true;
  }

  stop(fade = 1.2) {
    this.want = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    for (const q of this.players) if (!q.stopping) q.stop(t, fade);
    this.current = null;
  }

  /** 差し替えの曲が入った・消えた: 今の曲を作り直す */
  refresh() {
    const id = this.playing || this.want;
    if (!id || !this.e.ctx) return;
    if (this.current && this.current.custom === (this.e.custom.get(`bgm.${id}`) || null)) return; // 差し替えは変わっていない
    if (this.current) { this.current.stop(this.ctx.currentTime + 0.02, 0.6); this.current = null; }
    this.play(id, { fade: 0.6 });
  }

  ensureTimer() {
    if (this.timer || typeof setInterval === 'undefined') return;
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { console.error('[music]', e); } }, 50);
    this.timer?.unref?.(); // Node のテストで終われるように
  }

  setHidden(h) { this.hidden = !!h; }

  tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const until = now + (this.hidden ? 1.6 : this.lookahead);
    for (const p of this.players) if (p.started && !p.finished) p.schedule(until, now);
    // 終わった曲を片付ける
    const keep = [];
    for (const p of this.players) {
      if (p.stopping && now > p.stopAt + 0.3) p.dispose();
      else keep.push(p);
    }
    this.players = keep;
    if (!this.players.length && this.timer && !this.want) { clearInterval(this.timer); this.timer = null; }
  }
}

// ---------------------------------------------------------------- 1 曲ぶんの音の通り道
class ThemePlayer {
  constructor(ms, id) {
    this.ms = ms;
    this.e = ms.e;
    this.id = id;
    this.th = THEME[id] || null;
    this.custom = this.e.custom.get(`bgm.${id}`) || null;
    this.started = false;
    this.stopping = false;
    this.finished = false;
    this.nodes = [];
    this.oscs = [];
    this.layers = {};
    this.q = [];
    this.active = {};
  }

  get ctx() { return this.e.ctx; }

  node(n) { this.nodes.push(n); return n; }
  gain(v = 1) { const g = this.node(this.ctx.createGain()); g.gain.value = v; return g; }

  async prepare() {
    if (this.custom || !this.th) return;
    const needs = needsOf(this.th);
    const jobs = [
      ...needs.notes.map((n) => this.e.ensure({ kind: 'inst', id: n.inst, root: n.root }, 60)),
      ...needs.drums.map((d) => this.e.ensure({ kind: 'drum', id: d }, 60)),
    ];
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 2500))]);
  }

  start(t, fade) {
    const ctx = this.ctx;
    this.started = true;
    this.t0 = t;
    this.out = this.gain(0); this.out.connect(this.e.musicBus);
    this.wet = this.gain(0); this.wet.connect(this.e.verbIn);
    const level = this.custom ? 1 : (this.th?.gain ?? 1); // 曲ごとの大きさの差をそろえる
    const ramp = (g) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + Math.max(0.05, fade)); };
    ramp(this.out); ramp(this.wet);
    if (this.custom) {
      const src = this.node(ctx.createBufferSource());
      src.buffer = this.custom; src.loop = true;
      src.connect(this.out);
      src.start(t);
      this.oscs.push(src);
      return;
    }
    const th = this.th;
    this.inf = themeInfo(th);
    for (const name of ['bass', 'arp', 'lead', 'drums', 'amb']) {
      const spec = name === 'drums' ? th.drums : name === 'amb' ? (th.amb?.sprinkle) : th[name];
      if (!spec) continue;
      this.layers[name] = this.makeLayer(name, spec);
    }
    if (th.pad) this.pad = new PadVoices(this, th.pad, t);
    if (th.drone) this.makeDrone(th.drone, t);
    if (th.amb?.wind) this.makeWind(th.amb.wind, t);
    this.bar = 0;
    this.barT = t;
  }

  makeLayer(name, spec) {
    const ctx = this.ctx;
    const out = this.gain(spec.vol ?? 0.3);
    let pan = null;
    try { pan = this.node(ctx.createStereoPanner()); pan.pan.value = spec.pan || 0; out.connect(pan); } catch { pan = null; }
    const tail = pan || out;
    tail.connect(this.out);
    const wetAmt = spec.wet ?? (name === 'drums' ? 0.12 : name === 'bass' ? 0.05 : 0.3);
    if (wetAmt > 0) { const s = this.gain(wetAmt); tail.connect(s); s.connect(this.wet); }
    if (spec.echo) {
      const d = this.node(ctx.createDelay(2));
      d.delayTime.value = Math.min(1.9, this.inf.beatSec * 0.75);
      const fb = this.gain(0.32);
      const lp = this.node(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const eo = this.gain(0.32);
      out.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); d.connect(eo); eo.connect(tail);
    }
    const lanes = LANES.map((v) => { const g = this.gain(v); g.connect(out); return g; });
    return { out, lanes, cap: LAYER_CAP[name] || 8 };
  }

  makeDrone(spec, t) {
    const ctx = this.ctx;
    const g = this.gain(spec.vol ?? 0.2);
    const lp = this.node(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = spec.type === 'sine' ? 1200 : 520; lp.Q.value = 0.9;
    lp.connect(g); g.connect(this.out);
    const s = this.gain(0.35); g.connect(s); s.connect(this.wet);
    for (const iv of spec.iv || [0, 7]) {
      const o = this.node(ctx.createOscillator());
      o.type = spec.type === 'saw' ? 'sawtooth' : spec.type === 'organ' ? 'square' : 'sine';
      o.frequency.value = mtof(this.th.key - 12 + iv);
      const og = this.gain(spec.type === 'sine' ? 0.5 : 0.22);
      o.connect(og); og.connect(lp);
      o.start(t); this.oscs.push(o);
    }
    // ゆっくり揺れる
    const lfo = this.node(ctx.createOscillator()); lfo.frequency.value = 0.07;
    const lg = this.gain(spec.type === 'sine' ? 0 : 180); lfo.connect(lg); lg.connect(lp.frequency);
    lfo.start(t); this.oscs.push(lfo);
  }

  makeWind(vol, t) {
    const ctx = this.ctx;
    if (!this.e.noiseBuffer) return;
    const src = this.node(ctx.createBufferSource()); src.buffer = this.e.noiseBuffer; src.loop = true;
    const bp = this.node(ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.3;
    const g = this.gain(vol);
    src.connect(bp); bp.connect(g); g.connect(this.out);
    const s = this.gain(0.5); g.connect(s); s.connect(this.wet);
    const l1 = this.node(ctx.createOscillator()); l1.frequency.value = 0.055; const l1g = this.gain(330); l1.connect(l1g); l1g.connect(bp.frequency);
    const l2 = this.node(ctx.createOscillator()); l2.frequency.value = 0.13; const l2g = this.gain(vol * 0.55); l2.connect(l2g); l2g.connect(g.gain);
    src.start(t); l1.start(t); l2.start(t);
    this.oscs.push(src, l1, l2);
  }

  /** until までの音符を予約する */
  schedule(until, now) {
    if (this.custom || this.stopping || !this.th) return;
    const inf = this.inf;
    // 止まっていた（タブの切り替えなど）: 遅れた分は飛ばす
    if (this.barT + inf.barSec < now) {
      const skip = Math.ceil((now - this.barT) / inf.barSec);
      this.barT += skip * inf.barSec; this.bar += skip; this.q = [];
      this.ms.stats.late++;
    }
    while (this.barT < until + 0.05) {
      const bar = composeBar(this.th, this.bar);
      const bt = this.barT;
      if (bar.chordStart || this.bar === 0) this.q.push({ when: bt, kind: 'pad', notes: bar.pad });
      if (this.th.pad?.pump) for (let i = 0; i < this.th.meter; i++) this.q.push({ when: bt + i * inf.beatSec, kind: 'pump' });
      const evs = bar.events.slice().sort((a, b) => a.step - b.step);
      for (const e of evs) this.q.push({ ...e, when: bt + e.step * inf.stepSec });
      this.q.sort((a, b) => a.when - b.when);
      this.barT += inf.barSec;
      this.bar++;
    }
    while (this.q.length && this.q[0].when < until) {
      const ev = this.q.shift();
      if (ev.when < now - 0.05) { this.ms.stats.dropped++; continue; }
      this.fire(ev);
    }
  }

  fire(ev) {
    if (ev.kind === 'pad') { this.pad?.chord(ev.notes, ev.when); return; }
    if (ev.kind === 'pump') { this.pad?.pump(ev.when, this.inf.beatSec); return; }
    const L = this.layers[ev.layer];
    if (!L) return;
    let buf; let rate = ev.rate || 1;
    if (ev.kind === 'note') {
      const root = rootFor(ev.midi);
      buf = this.e.getBuffer({ kind: 'inst', id: ev.inst, root });
      rate *= 2 ** ((ev.midi - root) / 12);
    } else buf = this.e.getBuffer({ kind: 'drum', id: ev.inst });
    if (!buf) return;
    const ctx = this.ctx;
    const lane = L.lanes[Math.max(0, Math.min(3, Math.round((ev.vel ?? 0.7) * 4 - 1)))];
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    src.connect(lane);
    src.start(ev.when);
    const list = (this.active[ev.layer] ||= []);
    list.push({ src, end: ev.when + buf.duration / rate });
    src.onended = () => { try { src.disconnect(); } catch { /* ignore */ } };
    // 同時に鳴る数を抑える（一番古い音から止める）
    const now = ctx.currentTime;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < now) list.splice(i, 1);
    while (list.length > L.cap) { const o = list.shift(); try { o.src.stop(ev.when); } catch { /* ignore */ } }
    this.ms.stats.notes++;
    this.e.stats.notes++;
  }

  stop(t, fade) {
    if (this.stopping) return;
    this.stopping = true;
    this.stopAt = t + Math.max(0.05, fade);
    if (!this.started || !this.out) { this.finished = true; return; }
    for (const g of [this.out, this.wet]) {
      try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, this.stopAt); } catch { /* ignore */ }
    }
    for (const o of this.oscs) { try { o.stop(this.stopAt + 0.05); } catch { /* ignore */ } }
    for (const list of Object.values(this.active)) for (const a of list) { try { a.src.stop(this.stopAt + 0.05); } catch { /* ignore */ } }
    this.q = [];
  }

  dispose() {
    this.finished = true;
    if (!this.stopping) { try { this.stop(this.ctx?.currentTime || 0, 0.05); } catch { /* ignore */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
    this.nodes = []; this.oscs = []; this.active = {};
  }
}

// ---------------------------------------------------------------- 和音の伸ばし（発振器 4 声）
const PAD_TYPES = {
  strings: { osc: [['sawtooth', 1, -8, 0.5], ['sawtooth', 1, 8, 0.5]], filter: 1500, q: 0.7, lfo: [0.11, 380] },
  choir: { osc: [['sawtooth', 1, -10, 0.5], ['sawtooth', 1, 10, 0.5]], formant: [[700, 4, 1], [1150, 6, 0.5], [2600, 8, 0.18]], vib: 9 },
  organ: { osc: [['square', 1, 0, 0.35], ['sine', 2, 0, 0.45], ['sine', 0.5, 0, 0.3]], filter: 2200, q: 0.6, trem: [5.5, 0.12] },
  glass: { osc: [['sine', 1, 0, 0.6], ['triangle', 2, 4, 0.2]], filter: 4000, q: 0.5, trem: [4.2, 0.22] },
  dark: { osc: [['sawtooth', 1, -6, 0.45], ['square', 0.5, 6, 0.35]], filter: 600, q: 2.2, lfo: [0.09, 220] },
};

class PadVoices {
  constructor(tp, spec, t) {
    this.tp = tp;
    this.spec = spec;
    const ctx = tp.ctx;
    const T = PAD_TYPES[spec.type] || PAD_TYPES.strings;
    this.T = T;
    this.vol = spec.vol ?? 0.3;
    this.out = tp.gain(0);
    this.out.connect(tp.out);
    const send = tp.gain(spec.wet ?? 0.6); this.out.connect(send); send.connect(tp.wet);
    // 音色の通り道
    let input;
    if (T.formant) {
      input = tp.gain(1);
      for (const [f, q, g] of T.formant) {
        const bp = tp.node(ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const fg = tp.gain(g * 2.2); input.connect(bp); bp.connect(fg); fg.connect(this.out);
      }
    } else {
      const lp = tp.node(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = spec.cut || T.filter; lp.Q.value = T.q;
      lp.connect(this.out);
      input = lp;
      if (T.lfo) {
        const l = tp.node(ctx.createOscillator()); l.frequency.value = T.lfo[0];
        const lg = tp.gain(T.lfo[1]); l.connect(lg); lg.connect(lp.frequency); l.start(t); tp.oscs.push(l);
      }
    }
    // ふるえ（合唱の揺れ・毒の森のゆがみ）
    let vibGain = null;
    if (T.vib || spec.wobble) {
      const l = tp.node(ctx.createOscillator()); l.frequency.value = spec.wobble ? 0.35 : 5.1;
      vibGain = tp.gain(spec.wobble ? 18 : T.vib); l.connect(vibGain); l.start(t); tp.oscs.push(l);
    }
    this.voices = [];
    for (let i = 0; i < 4; i++) {
      const vg = tp.gain(0.11);
      vg.connect(input);
      const oscs = T.osc.map(([type, mul, det, amp]) => {
        const o = tp.node(ctx.createOscillator());
        o.type = type; o.detune.value = det + (i - 1.5) * 2;
        const og = tp.gain(amp); o.connect(og); og.connect(vg);
        if (vibGain) vibGain.connect(o.detune);
        o.start(t); tp.oscs.push(o);
        return { o, mul };
      });
      this.voices.push({ vg, oscs });
    }
    if (T.trem) {
      const l = tp.node(ctx.createOscillator()); l.frequency.value = T.trem[0];
      const lg = tp.gain(this.vol * T.trem[1]); l.connect(lg); lg.connect(this.out.gain); l.start(t); tp.oscs.push(l);
    }
    this.first = true;
  }

  chord(notes, t) {
    const glide = this.first ? 0 : 0.09;
    notes.forEach((m, i) => {
      const v = this.voices[i];
      if (!v) return;
      const f = mtof(m);
      for (const { o, mul } of v.oscs) {
        try {
          if (this.first) o.frequency.setValueAtTime(f * mul, t);
          else o.frequency.setTargetAtTime(f * mul, t, glide);
        } catch { /* ignore */ }
      }
    });
    const g = this.out.gain;
    try {
      if (this.first) { g.setValueAtTime(0, t); g.setTargetAtTime(this.vol, t, 0.6); }
      else if (!this.spec.pump) { g.setTargetAtTime(this.vol * 0.62, Math.max(this.tp.ctx.currentTime, t - 0.14), 0.05); g.setTargetAtTime(this.vol, t + 0.02, 0.4); }
    } catch { /* ignore */ }
    this.first = false;
  }

  /** 拍ごとに音量をへこませる（裂け目の脈打つ感じ） */
  pump(t, beat) {
    if (this.first) return;
    const g = this.out.gain;
    try { g.setValueAtTime(this.vol * 0.3, t); g.linearRampToValueAtTime(this.vol, t + beat * 0.7); } catch { /* ignore */ }
  }
}
