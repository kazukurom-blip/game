// BGM の楽器の音（1 音ずつ作って AudioBuffer にし、再生の速さで音の高さを変える）。
// 音域の端で音色が崩れないよう、6 半音ごとの「基準の音」で作り分ける（最大 ±3 半音しかずらさない）。
// 打楽器・環境音は 1 種類につき 1 つだけ作る。
// 和音の伸ばし（パッド）と低い持続音（ドローン）は music.js が WebAudio の発振器で鳴らす（長さが自由に変えられるため）。

import { Snd, mtof, perc, adsr, swell, sweep } from './dsp.js';

const R = 32000; // 楽器の標本化の速さ（BGM は 32kHz で十分。軽くするため）

/** 旋律・伴奏の楽器 */
export const INSTRUMENTS = {
  pluck: { name: 'リュート', len: 1.5, sr: R, make(s, f) {
    s.pluck({ f, dur: 1.5, bright: 0.5, decay: 0.9965, amp: 0.9 });
    s.osc({ dur: 0.4, f, env: perc(0.002, 0.12), amp: 0.12 });
    s.filter({ type: 'lp', f: 5200 }).filter({ type: 'peak', f: 280, q: 1.2, gain: 3 });
  } },
  harp: { name: '竪琴', len: 2.2, sr: R, make(s, f) {
    s.pluck({ f, dur: 2.2, bright: 0.3, decay: 0.998, amp: 0.8 });
    s.osc({ dur: 2, f, env: perc(0.004, 0.6), amp: 0.25 });
    s.filter({ type: 'lp', f: 4200 });
  } },
  oud: { name: '砂の弦', len: 1.3, sr: R, make(s, f) {
    s.pluck({ f, dur: 1.3, bright: 0.78, decay: 0.993, amp: 0.9 });
    s.pluck({ f: f * 1.003, dur: 1.3, bright: 0.7, decay: 0.993, amp: 0.5 });
    s.drive(1.6, 0.5);
    s.filter({ type: 'peak', f: 320, q: 1.5, gain: 5 }).filter({ type: 'lp', f: 6000 });
  } },
  bell: { name: '鐘', len: 2.6, sr: R, make(s, f) {
    s.fm({ dur: 2.6, f, ratio: 3.5, index: (t) => 2 * Math.exp(-t * 3), env: perc(0.002, 0.9), amp: 0.6 });
    s.fm({ dur: 2.6, f: f * 0.5, ratio: 1.41, index: (t) => 1.2 * Math.exp(-t * 2), env: perc(0.002, 1.1), amp: 0.25 });
    s.osc({ dur: 1, f: f * 2.01, env: perc(0.001, 0.25), amp: 0.1 });
  } },
  glass: { name: '玻璃', len: 2.4, sr: R, make(s, f) {
    s.fm({ dur: 2.4, f, ratio: 7.01, index: (t) => 0.8 * Math.exp(-t * 4), env: perc(0.003, 0.8), amp: 0.5 });
    s.osc({ dur: 2.4, f, env: perc(0.004, 0.9), amp: 0.35 });
    s.osc({ dur: 1.5, f: f * 3.002, env: perc(0.002, 0.35), amp: 0.08 });
  } },
  musicbox: { name: 'オルゴール', len: 1.6, sr: R, make(s, f) {
    s.osc({ dur: 1.6, f, env: perc(0.001, 0.5), amp: 0.6 });
    s.osc({ dur: 1, f: f * 4.03, env: perc(0.001, 0.12), amp: 0.18 });
    s.osc({ dur: 0.5, f: f * 9.1, env: perc(0.0005, 0.03), amp: 0.06 });
  } },
  epiano: { name: '水の鍵盤', len: 2, sr: R, make(s, f) {
    s.fm({ dur: 2, f, ratio: 1, index: (t) => 1.6 * Math.exp(-t * 5) + 0.2, env: perc(0.003, 0.7), amp: 0.55 });
    s.fm({ dur: 0.5, f, ratio: 14, index: (t) => 0.7 * Math.exp(-t * 30), env: perc(0.001, 0.05), amp: 0.12 });
  } },
  marimba: { name: '木の鍵', len: 1, sr: R, make(s, f) {
    s.osc({ dur: 1, f, env: perc(0.001, 0.28), amp: 0.7 });
    s.osc({ dur: 0.4, f: f * 3.93, env: perc(0.0008, 0.05), amp: 0.25 });
    s.osc({ dur: 0.1, f: f * 9.4, env: perc(0.0005, 0.01), amp: 0.08 });
  } },
  flute: { name: '笛', len: 1.3, sr: R, make(s, f) {
    const e = adsr(0.06, 0.1, 0.8, 0.35, 0.8);
    s.osc({ dur: 1.3, f, env: e, amp: 0.6, vib: { rate: 5.2, depth: 0.12 } });
    s.osc({ dur: 1.3, f: f * 2, env: e, amp: 0.1 });
    s.osc({ dur: 1.3, f: f * 3, type: 'tri', env: e, amp: 0.04 });
    const b = s.layer(); b.noise({ dur: 1.2, env: (t) => e(t) * (0.5 + 0.5 * Math.exp(-t * 8)) }); b.filter({ type: 'bp', f: f * 2, q: 2 }); s.add(b, 0, 0.12);
  } },
  brass: { name: '角笛', len: 1, sr: R, make(s, f) {
    const l = s.layer();
    for (const d of [-0.08, 0, 0.07]) l.osc({ dur: 0.95, f: f * 2 ** (d / 12), type: 'saw', env: adsr(0.035, 0.15, 0.7, 0.25, 0.65), amp: 0.33 });
    l.filter({ type: 'lp', f: (t) => 400 + 2200 * Math.min(1, t / 0.08) * (0.5 + 0.5 * Math.exp(-t * 3)), q: 1.2 });
    s.add(l);
  } },
  organ: { name: '聖堂の鍵盤', len: 1.3, sr: R, make(s, f) {
    const e = adsr(0.025, 0.1, 0.9, 0.3, 0.95);
    [[1, 0.5], [2, 0.3], [3, 0.12], [4, 0.14], [6, 0.05], [8, 0.06]].forEach(([k, a]) => s.osc({ dur: 1.3, f: f * k, env: e, amp: a }));
  } },
  metal: { name: '時計の鐘', len: 1.6, sr: R, make(s, f) {
    [1, 2.76, 5.4, 8.93].forEach((r, i) => s.osc({ dur: 1.6, f: f * r, env: perc(0.001, 0.5 / (1 + i * 0.7)), amp: 0.5 / (1 + i * 0.8) }));
  } },
  bassPluck: { name: '低い弦', len: 0.9, sr: 22050, make(s, f) {
    const l = s.layer();
    l.osc({ dur: 0.9, f, type: 'saw', env: perc(0.004, 0.3), amp: 0.5 });
    l.osc({ dur: 0.9, f: f * 0.5, type: 'sine', env: perc(0.004, 0.35), amp: 0.4 });
    l.filter({ type: 'lp', f: (t) => 220 + 900 * Math.exp(-t * 9), q: 1.1 });
    s.add(l);
  } },
  sub: { name: '地の響き', len: 1.1, sr: 22050, make(s, f) {
    s.osc({ dur: 1.1, f, env: adsr(0.01, 0.2, 0.6, 0.4, 0.6), amp: 0.7 });
    s.osc({ dur: 1.1, f: f * 2, type: 'tri', env: perc(0.005, 0.15), amp: 0.12 });
  } },
  bassSaw: { name: '歪んだ低音', len: 0.8, sr: 22050, make(s, f) {
    const l = s.layer();
    l.osc({ dur: 0.8, f, type: 'saw', env: adsr(0.003, 0.1, 0.7, 0.2, 0.5), amp: 0.5 });
    l.osc({ dur: 0.8, f: f * 1.005, type: 'square', env: adsr(0.003, 0.1, 0.7, 0.2, 0.5), amp: 0.3 });
    l.drive(2.5);
    l.filter({ type: 'lp', f: (t) => 300 + 1200 * Math.exp(-t * 7), q: 1.6 });
    s.add(l);
  } },
};

/** 打楽器と環境音（音の高さは変えない） */
export const DRUMS = {
  kick: { len: 0.5, sr: 44100, make(s) {
    s.osc({ dur: 0.5, f: (t) => 45 + 110 * Math.exp(-t * 28), env: perc(0.001, 0.16), amp: 1 });
    const c = s.layer(0.02); c.noise({ dur: 0.01, env: perc(0.0002, 0.002) }); c.filter({ type: 'hp', f: 2000 }); s.add(c, 0, 0.3);
  } },
  snare: { len: 0.35, sr: 44100, make(s) {
    s.osc({ dur: 0.2, f: (t) => 185 + 60 * Math.exp(-t * 40), env: perc(0.001, 0.05), amp: 0.5 });
    const n = s.layer(); n.noise({ dur: 0.3, env: perc(0.001, 0.07) }); n.filter({ type: 'bp', f: 2200, q: 0.7 }); s.add(n, 0, 0.9);
  } },
  hat: { len: 0.09, sr: 44100, make(s) {
    const n = s.layer(); n.noise({ dur: 0.08, env: perc(0.0005, 0.018) }); n.filter({ type: 'hp', f: 7500 }); s.add(n);
  } },
  ohat: { len: 0.4, sr: 44100, make(s) {
    const n = s.layer(); n.noise({ dur: 0.38, env: perc(0.001, 0.12) }); n.filter({ type: 'hp', f: 6500 }); s.add(n);
  } },
  clap: { len: 0.35, sr: 44100, make(s) {
    const n = s.layer();
    for (const t0 of [0, 0.011, 0.022]) n.noise({ t0, dur: 0.25, env: perc(0.0005, t0 === 0.022 ? 0.06 : 0.008) });
    n.filter({ type: 'bp', f: 1300, q: 1.1 }); s.add(n);
  } },
  shaker: { len: 0.12, sr: 44100, make(s) {
    const n = s.layer(); n.noise({ dur: 0.1, env: swell(0.025, 0.01, 0.06) }); n.filter({ type: 'hp', f: 5200 }); s.add(n);
  } },
  taiko: { len: 1, sr: 32000, make(s) {
    s.osc({ dur: 1, f: (t) => 58 + 50 * Math.exp(-t * 14), env: perc(0.002, 0.32), amp: 1 });
    const n = s.layer(); n.noise({ dur: 0.3, color: 'pink', env: perc(0.001, 0.05) }); n.filter({ type: 'lp', f: 600 }); s.add(n, 0, 0.6);
  } },
  tom: { len: 0.6, sr: 32000, make(s) {
    s.osc({ dur: 0.6, f: (t) => 95 + 80 * Math.exp(-t * 18), env: perc(0.002, 0.18), amp: 0.9 });
    const n = s.layer(); n.noise({ dur: 0.15, env: perc(0.001, 0.03) }); n.filter({ type: 'bp', f: 900, q: 1 }); s.add(n, 0, 0.3);
  } },
  dum: { len: 0.6, sr: 32000, make(s) {
    s.osc({ dur: 0.6, f: (t) => 72 + 40 * Math.exp(-t * 20), env: perc(0.002, 0.2), amp: 0.9 });
    const n = s.layer(); n.noise({ dur: 0.2, env: perc(0.001, 0.04) }); n.filter({ type: 'bp', f: 320, q: 1.5 }); s.add(n, 0, 0.5);
  } },
  tek: { len: 0.15, sr: 44100, make(s) {
    const n = s.layer(); n.noise({ dur: 0.12, env: perc(0.0005, 0.025) }); n.filter({ type: 'bp', f: 2600, q: 2.2 }); s.add(n, 0, 1);
    s.osc({ dur: 0.05, f: 780, env: perc(0.0005, 0.012), amp: 0.3 });
  } },
  rim: { len: 0.1, sr: 44100, make(s) {
    s.osc({ dur: 0.05, f: 820, type: 'tri', env: perc(0.0005, 0.01), amp: 0.6 });
    const n = s.layer(); n.noise({ dur: 0.04, env: perc(0.0003, 0.006) }); n.filter({ type: 'bp', f: 1900, q: 3 }); s.add(n, 0, 0.8);
  } },
  tick: { len: 0.06, sr: 44100, make(s) {
    s.osc({ dur: 0.04, f: 3100, env: perc(0.0003, 0.006), amp: 0.5 });
    const n = s.layer(); n.noise({ dur: 0.02, env: perc(0.0002, 0.003) }); n.filter({ type: 'hp', f: 4000 }); s.add(n, 0, 0.5);
  } },
  anvil: { len: 0.8, sr: 44100, make(s) {
    [1, 2.76, 5.4, 8.93].forEach((r, i) => s.osc({ dur: 0.8, f: 1250 * r, env: perc(0.0005, 0.25 / (1 + i * 0.6)), amp: 0.5 / (1 + i) }));
    s.osc({ dur: 0.2, f: (t) => 160 + 80 * Math.exp(-t * 40), env: perc(0.001, 0.04), amp: 0.4 });
  } },
  gong: { len: 4, sr: 32000, make(s) {
    s.fm({ dur: 4, f: 82, ratio: 1.41, index: (t) => 3 * Math.exp(-t * 0.9) + 0.4, env: perc(0.01, 1.6), amp: 0.6 });
    s.fm({ dur: 4, f: 131, ratio: 2.31, index: (t) => 1.5 * Math.exp(-t * 1.2), env: perc(0.02, 1.2), amp: 0.25 });
  } },
  timpani: { len: 1.4, sr: 32000, make(s) {
    s.osc({ dur: 1.4, f: (t) => 92 + 12 * Math.exp(-t * 10), env: perc(0.003, 0.5), amp: 0.9 });
    s.osc({ dur: 1, f: 92 * 1.5, env: perc(0.003, 0.3), amp: 0.2 });
    const n = s.layer(); n.noise({ dur: 0.3, color: 'pink', env: perc(0.002, 0.05) }); n.filter({ type: 'lp', f: 900 }); s.add(n, 0, 0.4);
  } },
  crash: { len: 2, sr: 44100, make(s) {
    const n = s.layer(); n.noise({ dur: 2, env: perc(0.002, 0.6) }); n.filter({ type: 'hp', f: 3500 }); s.add(n, 0, 0.8);
    [1, 1.47, 2.09, 2.9].forEach((r, i) => s.osc({ dur: 1.5, f: 420 * r * 3, env: perc(0.002, 0.4), amp: 0.06 / (1 + i) }));
  } },
  // 環境音
  bubble: { len: 0.14, sr: 32000, make(s) { s.osc({ dur: 0.12, f: sweep(380, 1300, 0.08), env: perc(0.004, 0.035), amp: 0.6 }); } },
  drip: { len: 0.3, sr: 32000, make(s) { s.osc({ dur: 0.25, f: sweep(1500, 700, 0.05), env: perc(0.001, 0.05), amp: 0.5 }); s.reverb({ mix: 0.4, size: 0.7 }); } },
  ember: { len: 0.4, sr: 44100, make(s) { const n = s.layer(); n.grains({ dur: 0.35, rate: 60, amp: 0.6, len: 0.0015 }); n.filter({ type: 'hp', f: 1500 }); s.add(n); } },
  steam: { len: 0.7, sr: 32000, make(s) { const n = s.layer(); n.noise({ dur: 0.65, env: swell(0.06, 0.15, 0.4) }); n.filter({ type: 'hp', f: 2500 }); n.filter({ type: 'lp', f: 9000 }); s.add(n); } },
  shimmer: { len: 1.4, sr: 32000, make(s) { s.grains({ dur: 1.2, rate: 22, amp: 0.4, f: [2500, 7000], len: 0.05, env: (t) => Math.sin(Math.PI * Math.min(1, t / 1.2)) }); } },
  revswell: { len: 1.2, sr: 32000, make(s) { const n = s.layer(); n.noise({ dur: 1.1, env: (t) => (t < 1 ? (t / 1) ** 3 : Math.max(0, 1 - (t - 1) * 10)) }); n.filter({ type: 'bp', f: sweep(300, 3000, 1), q: 1.5 }); s.add(n); } },
};

/** 楽器の基準の音（6 半音ごと） */
export const rootFor = (midi) => Math.round(midi / 6) * 6;

export function renderInstrument(id, root) {
  const d = INSTRUMENTS[id];
  if (!d) return null;
  const s = new Snd(d.sr, d.len, 77 + root * 13 + id.length);
  d.make(s, mtof(root));
  return { data: s.done(0.85, { trim: true }), sr: d.sr };
}

export function renderDrum(id) {
  const d = DRUMS[id];
  if (!d) return null;
  const s = new Snd(d.sr, d.len, 91 + id.length * 17);
  d.make(s);
  return { data: s.done(0.85), sr: d.sr };
}

/** 残響（畳み込み）の響き方。ステレオ 2 本の減衰する雑音 */
export function renderImpulse(sr = 32000, sec = 2.2, decay = 2.6) {
  const n = Math.floor(sr * sec);
  const out = [new Float32Array(n), new Float32Array(n)];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
  for (let c = 0; c < 2; c++) {
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const e = Math.exp(-t * decay) * Math.min(1, t / 0.012);
      lp += (rnd() - lp) * (0.55 - 0.4 * Math.min(1, t / sec)); // 後ろほどこもる
      out[c][i] = lp * e * 0.5;
    }
  }
  return { channels: out, sr };
}
