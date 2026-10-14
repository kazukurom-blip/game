// 効果音の一覧と作り方（すべてコードで合成。音声ファイルは要らない）。
// 1 つの定義: { id, name（日本語）, cat, vol（鳴らすときの大きさ）, prio（同時に鳴る数が多いときの優先度）,
//              min（同じ音を続けて鳴らせる最短の間隔・秒）, variants（作り分ける数。連打が機械的にならない）, make(sr, v) }
// 差し替え: 枠 ID は `sfx.<id>`（設定の「音」から自分の音声ファイルを入れられる）。
//
// cat（設定で種類ごとに消せる）:
//   combat 攻撃・撃破 / skill スキル / loot ドロップ / ui 画面の操作 / craft 鍛冶・装備 / event 出来事（レベル・ボス・実績）

import { Snd, mtof, perc, adsr, swell, sweep, lin } from './dsp.js';

export const SFX_CATS = [
  { id: 'combat', name: '攻撃・撃破' },
  { id: 'skill', name: 'スキル' },
  { id: 'loot', name: 'ドロップ' },
  { id: 'ui', name: '画面の操作' },
  { id: 'craft', name: '鍛冶・装備' },
  { id: 'event', name: '出来事（レベル・ボス・実績）' },
];

const M = mtof;

// ---------------------------------------------------------------- 部品
function thump(s, { t0 = 0, f0 = 160, f1 = 45, dur = 0.25, amp = 1, k = 18, decay } = {}) {
  s.osc({ t0, dur, f: (t) => f1 + (f0 - f1) * Math.exp(-t * k), env: perc(0.001, decay ?? dur * 0.35), amp });
}
function click(s, { t0 = 0, amp = 0.5, f = 3000, len = 0.004 } = {}) {
  const l = s.layer(len * 8 + 0.01);
  l.noise({ dur: len * 8, env: perc(0.0002, len) });
  l.filter({ type: 'hp', f });
  s.add(l, t0, amp);
}
function whoosh(s, { t0 = 0, dur = 0.2, f0 = 400, f1 = 2400, q = 1.2, amp = 0.8, color = 'white', env } = {}) {
  const l = s.layer(dur + 0.02);
  l.noise({ dur, color, env: env || swell(dur * 0.45, 0, dur * 0.55) });
  l.filter({ type: 'bp', f: sweep(f0, f1, dur), q });
  s.add(l, t0, amp);
}
function noiseHit(s, { t0 = 0, dur = 0.1, type = 'bp', f = 1500, q = 1, amp = 0.6, color = 'white', a = 0.0005, d = 0.03 } = {}) {
  const l = s.layer(dur + 0.01);
  l.noise({ dur, color, env: perc(a, d) });
  l.filter({ type, f, q });
  s.add(l, t0, amp);
}
function bell(s, { t0 = 0, f, dur = 1.2, amp = 0.5, ratio = 3.5, index = 2.2, decay = 0.35, partial = 0.15 } = {}) {
  s.fm({ t0, dur, f, ratio, index: (t) => index * Math.exp(-t / (decay * 0.6)), env: perc(0.002, decay), amp });
  if (partial) s.osc({ t0, dur: dur * 0.6, f: f * 2.005, env: perc(0.001, decay * 0.3), amp: amp * partial });
}
function glass(s, { t0 = 0, f, dur = 0.8, amp = 0.4, decay = 0.25 } = {}) {
  s.fm({ t0, dur, f, ratio: 7.01, index: (t) => 0.9 * Math.exp(-t * 6), env: perc(0.001, decay), amp });
  s.osc({ t0, dur, f: f * 3.01, env: perc(0.001, decay * 0.4), amp: amp * 0.12 });
}
function sparkle(s, { t0 = 0, dur = 0.6, rate = 30, amp = 0.15, lo = 3000, hi = 8000, env } = {}) {
  s.grains({ t0, dur, rate, amp, f: [lo, hi], len: 0.018, env: env || ((t) => Math.max(0, 1 - t / dur)) });
}
function crackle(s, { t0 = 0, dur = 0.3, rate = 200, amp = 0.4, env, hp = 1200 } = {}) {
  const l = s.layer(dur + 0.02);
  l.grains({ dur, rate, amp, len: 0.0016, env: env || ((t) => Math.max(0, 1 - t / dur)) });
  l.filter({ type: 'hp', f: hp });
  s.add(l, t0, 1);
}
function brass(s, { t0 = 0, f, dur = 0.8, amp = 0.4, bright = 2400, att = 0.04, scoop = 0 } = {}) {
  const l = s.layer(dur + 0.1);
  const ff = scoop ? (t) => f * 2 ** ((-scoop * Math.exp(-t * 18)) / 12) : f;
  for (const d of [-0.09, 0, 0.08]) l.osc({ dur, f: typeof ff === 'function' ? (t) => ff(t) * 2 ** (d / 12) : ff * 2 ** (d / 12), type: 'saw', env: adsr(att, 0.15, 0.75, 0.14, dur - 0.14), amp: 0.33, vib: { rate: 5.2, depth: 0.06 } });
  l.filter({ type: 'lp', f: (t) => 250 + bright * Math.min(1, t / (att * 2.5)) * (0.55 + 0.45 * Math.exp(-t * 2)), q: 1.3 });
  s.add(l, t0, amp);
}
const VOWEL = { a: [[800, 7, 1], [1150, 9, 0.6], [2900, 12, 0.25]], o: [[450, 7, 1], [800, 9, 0.5], [2830, 12, 0.15]], u: [[325, 6, 1], [700, 9, 0.35], [2530, 12, 0.1]], e: [[400, 6, 1], [1700, 10, 0.5], [2600, 12, 0.3]] };
function choir(s, { t0 = 0, notes, dur = 1.5, amp = 0.4, vowel = 'a', att = 0.25 } = {}) {
  const src = s.layer(dur + 0.05);
  for (const m of notes) for (const d of [-0.12, 0.11]) src.osc({ dur, f: M(m) * 2 ** (d / 12), type: 'saw', vib: { rate: 4.6 + s.rng.next(), depth: 0.1 }, env: adsr(att, 0.2, 0.85, dur * 0.35, dur * 0.62), amp: 0.22 });
  const out = s.layer(dur + 0.05);
  for (const [ff, q, g] of VOWEL[vowel]) { const l = s.layer(dur + 0.05); l.add(src); l.filter({ type: 'bp', f: ff, q: q * 0.5 }); out.add(l, 0, 1.6 * g); }
  s.add(out, t0, amp);
}
function pad(s, { t0 = 0, notes, dur = 1.2, amp = 0.3, type = 'tri', att = 0.1, cut = 2000 } = {}) {
  const l = s.layer(dur + 0.05);
  for (const m of notes) for (const d of [-0.07, 0.07]) l.osc({ dur, f: M(m) * 2 ** (d / 12), type, env: adsr(att, 0.2, 0.8, dur * 0.4, dur * 0.55), amp: 0.3 });
  l.filter({ type: 'lp', f: cut, q: 0.8 });
  s.add(l, t0, amp);
}
function rumble(s, { t0 = 0, dur = 1, amp = 0.6, f = 140 } = {}) {
  const l = s.layer(dur + 0.02);
  l.noise({ dur, color: 'brown', env: swell(0.02, dur * 0.15, dur * 0.83) });
  l.filter({ type: 'lp', f, q: 0.9 });
  s.add(l, t0, amp);
}
function metal(s, { t0 = 0, f = 1200, dur = 0.5, amp = 0.5, decay = 0.12 } = {}) {
  [1, 2.76, 5.4, 8.93].forEach((r, i) => s.osc({ t0, dur, f: f * r, env: perc(0.0005, decay / (1 + i * 0.5)), amp: amp / (1 + i * 0.8) }));
  click(s, { t0, amp: amp * 0.4, f: 4000 });
}
function zap(s, { t0 = 0, dur = 0.2, amp = 0.5, lo = 300, hi = 2400, env } = {}) {
  const steps = Array.from({ length: Math.ceil(dur / 0.004) + 2 }, () => s.rng.range(lo, hi));
  const l = s.layer(dur + 0.02);
  l.osc({ dur, type: 'square', f: (t) => steps[Math.floor(t / 0.004)], env: env || perc(0.001, dur * 0.35), amp: 0.5 });
  l.filter({ type: 'hp', f: 500 });
  s.add(l, t0, amp);
}
function noteSeq(s, notes, { t0 = 0, step = 0.08, fn = bell, ...o } = {}) {
  notes.forEach((m, i) => fn(s, { ...o, t0: t0 + i * step, f: M(m) }));
}
function boom(s, { t0 = 0, dur = 1.2, amp = 1, f0 = 90, f1 = 28 } = {}) {
  thump(s, { t0, f0, f1, dur, k: 3, amp, decay: dur * 0.3 });
  const l = s.layer(dur + 0.05);
  l.noise({ dur, color: 'pink', env: perc(0.004, dur * 0.25) });
  l.filter({ type: 'lp', f: sweep(5000, 180, dur * 0.8) });
  s.add(l, t0, amp * 0.9);
}

const pmOf = (v) => [1, 0.94, 1.07, 0.89, 1.12][v % 5];

// ---------------------------------------------------------------- 一覧
const D = [];
const def = (id, name, cat, o, make) => D.push({ id, name, cat, vol: o.vol ?? 0.5, prio: o.prio ?? 30, min: o.min ?? 0.05, variants: o.variants || 1, dur: o.dur || 1, make });

// ---- 攻撃・撃破
def('hit_phys', '打撃（物理）', 'combat', { vol: 0.42, prio: 12, min: 0.035, variants: 3, dur: 0.22 }, (s, v) => {
  const p = pmOf(v);
  thump(s, { f0: 190 * p, f1: 62 * p, dur: 0.14, k: 32, amp: 0.9 });
  noiseHit(s, { f: 1400 * p, q: 0.9, amp: 0.8, d: 0.025 });
  click(s, { amp: 0.45, f: 2500 });
});
def('hit_fire', '打撃（火炎）', 'combat', { vol: 0.41, prio: 12, min: 0.035, variants: 3, dur: 0.3 }, (s, v) => {
  const p = pmOf(v);
  const l = s.layer(0.3); l.noise({ dur: 0.26, color: 'pink', env: perc(0.004, 0.08) }); l.filter({ type: 'lp', f: sweep(3600 * p, 420, 0.22), q: 1.6 }); s.add(l, 0, 1);
  crackle(s, { dur: 0.2, rate: 170, amp: 0.5, hp: 1800 });
  thump(s, { f0: 130 * p, f1: 48, dur: 0.16, k: 22, amp: 0.6 });
});
def('hit_cold', '打撃（冷気）', 'combat', { vol: 0.56, prio: 12, min: 0.035, variants: 3, dur: 0.3 }, (s, v) => {
  const p = pmOf(v);
  noiseHit(s, { type: 'hp', f: 5200, amp: 0.6, d: 0.018 });
  s.fm({ dur: 0.25, f: 1900 * p, ratio: 3.71, index: (t) => 1.6 * Math.exp(-t * 18), env: perc(0.0008, 0.07), amp: 0.55 });
  noiseHit(s, { t0: 0.004, f: 2600 * p, q: 3, amp: 0.5, d: 0.03 });
  thump(s, { f0: 150, f1: 70, dur: 0.08, k: 40, amp: 0.4 });
});
def('hit_lightning', '打撃（雷撃）', 'combat', { vol: 0.72, prio: 12, min: 0.035, variants: 3, dur: 0.18 }, (s, v) => {
  const p = pmOf(v);
  zap(s, { dur: 0.13, lo: 260 * p, hi: 2600 * p, amp: 0.8 });
  crackle(s, { dur: 0.12, rate: 320, amp: 0.6, hp: 2500 });
  thump(s, { f0: 160, f1: 60, dur: 0.07, k: 40, amp: 0.4 });
});
def('hit_poison', '打撃（毒）', 'combat', { vol: 0.41, prio: 12, min: 0.035, variants: 3, dur: 0.25 }, (s, v) => {
  const p = pmOf(v);
  const l = s.layer(0.22); l.noise({ dur: 0.2, env: perc(0.002, 0.05) }); l.filter({ type: 'bp', f: sweep(600 * p, 1700 * p, 0.12), q: 4 }); s.add(l, 0, 1.4);
  s.osc({ t0: 0.01, dur: 0.06, f: sweep(320 * p, 950 * p, 0.05), env: perc(0.002, 0.02), amp: 0.35 });
  s.osc({ t0: 0.07, dur: 0.06, f: sweep(420 * p, 1200 * p, 0.05), env: perc(0.002, 0.018), amp: 0.25 });
  thump(s, { f0: 120, f1: 55, dur: 0.1, k: 30, amp: 0.45 });
});
def('hit_void', '打撃（虚無）', 'combat', { vol: 0.36, prio: 12, min: 0.035, variants: 3, dur: 0.34 }, (s, v) => {
  const p = pmOf(v);
  s.fm({ dur: 0.3, f: (t) => 82 * p * (1 - t * 0.6), ratio: 1.51, index: (t) => 4 * Math.exp(-t * 9), env: perc(0.003, 0.09), amp: 0.7 });
  s.osc({ dur: 0.25, f: 220 * p, env: perc(0.002, 0.05), amp: 0.25 });
  s.osc({ dur: 0.25, f: 233 * p, env: perc(0.002, 0.05), amp: 0.25 });
  const l = s.layer(0.3); l.noise({ dur: 0.18, env: swell(0.03, 0, 0.15) }); l.filter({ type: 'bp', f: sweep(1800, 500, 0.18), q: 2.5 }); s.add(l, 0, 0.6);
});
def('crit', '会心の一撃', 'combat', { vol: 0.67, prio: 40, min: 0.07, variants: 2, dur: 0.45 }, (s, v) => {
  const p = pmOf(v);
  metal(s, { f: 2300 * p, decay: 0.14, amp: 0.45 });
  noiseHit(s, { f: 3200, q: 0.8, amp: 0.7, d: 0.03 });
  thump(s, { f0: 230, f1: 50, dur: 0.22, k: 22, amp: 1 });
  whoosh(s, { dur: 0.09, f0: 6000, f1: 2000, q: 0.7, amp: 0.35 });
});
def('kill', '撃破', 'combat', { vol: 0.5, prio: 20, min: 0.05, variants: 3, dur: 0.3 }, (s, v) => {
  const p = pmOf(v);
  thump(s, { f0: 240 * p, f1: 70, dur: 0.12, k: 26, amp: 0.8 });
  noiseHit(s, { type: 'lp', f: 900, amp: 0.8, d: 0.06, dur: 0.2, color: 'pink' });
  noiseHit(s, { t0: 0.06, type: 'lp', f: 400, amp: 0.5, d: 0.05, dur: 0.15, color: 'brown' });
  click(s, { amp: 0.3, f: 1500 });
});
def('kill_elite', 'エリート撃破', 'combat', { vol: 0.53, prio: 55, min: 0.12, dur: 0.9 }, (s) => {
  thump(s, { f0: 150, f1: 38, dur: 0.4, k: 9, amp: 1 });
  noiseHit(s, { type: 'lp', f: 1600, amp: 0.8, d: 0.08, dur: 0.3, color: 'pink' });
  bell(s, { t0: 0.06, f: M(79), amp: 0.3, decay: 0.25, ratio: 2, index: 1.4 });
  bell(s, { t0: 0.14, f: M(86), amp: 0.3, decay: 0.3, ratio: 2, index: 1.4 });
  sparkle(s, { t0: 0.1, dur: 0.4, rate: 25, amp: 0.12 });
});
def('kill_boss', 'ボス撃破', 'combat', { vol: 0.86, prio: 90, min: 1, dur: 2.8 }, (s) => {
  boom(s, { dur: 1.7, amp: 1 });
  s.fm({ dur: 2.4, f: 65, ratio: 1.41, index: (t) => 5 * Math.exp(-t * 1.5), env: perc(0.004, 0.9), amp: 0.45 });
  rumble(s, { dur: 2.2, amp: 0.6 });
  crackle(s, { t0: 0.05, dur: 0.8, rate: 90, amp: 0.4, hp: 900 });
  s.reverb({ mix: 0.25, size: 0.86, damp: 0.4 });
});
def('hero_hurt', '主人公の被弾', 'combat', { vol: 0.65, prio: 50, min: 0.25, variants: 2, dur: 0.3 }, (s, v) => {
  const p = pmOf(v);
  const src = s.layer(0.25); src.osc({ dur: 0.2, type: 'saw', f: (t) => (215 - 90 * t) * p, env: perc(0.006, 0.07), amp: 0.7 });
  const a = s.layer(0.25); a.add(src); a.filter({ type: 'bp', f: 720, q: 3 });
  const b = s.layer(0.25); b.add(src); b.filter({ type: 'bp', f: 1180, q: 4 });
  s.add(a, 0, 1.6).add(b, 0, 0.9);
  thump(s, { f0: 140, f1: 55, dur: 0.12, k: 30, amp: 0.7 });
  noiseHit(s, { f: 900, q: 0.8, amp: 0.4, d: 0.03 });
});
def('hero_death', '主人公が倒れる', 'combat', { vol: 0.74, prio: 85, min: 2, dur: 2.8 }, (s) => {
  const l = s.layer(2); l.osc({ dur: 1.6, type: 'saw', f: sweep(220, 98, 1.4), env: swell(0.05, 0.6, 0.9), amp: 0.5 }); l.filter({ type: 'lp', f: sweep(1600, 300, 1.4), q: 1.2 }); s.add(l, 0, 1);
  bell(s, { t0: 0.05, f: M(45), dur: 2.4, amp: 0.55, ratio: 2, index: 3, decay: 1.1, partial: 0.1 });
  choir(s, { t0: 0.25, notes: [45, 52, 57], dur: 2, amp: 0.4, vowel: 'u', att: 0.4 });
  s.reverb({ mix: 0.35, size: 0.88 });
});
def('revive', '復活', 'combat', { vol: 0.67, prio: 70, min: 1, dur: 2 }, (s) => {
  noteSeq(s, [60, 64, 67, 72, 76, 79, 84], { step: 0.07, amp: 0.3, decay: 0.4, ratio: 2, index: 1.2 });
  pad(s, { t0: 0.1, notes: [60, 64, 67, 72], dur: 1.3, amp: 0.35, att: 0.3 });
  sparkle(s, { t0: 0.3, dur: 1, rate: 30 });
  s.reverb({ mix: 0.3, size: 0.85 });
});
def('low_life', '心音（ライフが少ない）', 'combat', { vol: 0.4, prio: 45, min: 1.1, dur: 0.6 }, (s) => {
  for (const [t0, a] of [[0, 1], [0.2, 0.7]]) {
    s.osc({ t0, dur: 0.22, f: (t) => 48 + 30 * Math.exp(-t * 30), env: perc(0.004, 0.06), amp: a });
    s.osc({ t0, dur: 0.12, f: 96, type: 'tri', env: perc(0.003, 0.025), amp: a * 0.25 });
  }
  s.filter({ type: 'lp', f: 400 });
});
def('enemy_attack', '敵の攻撃', 'combat', { vol: 0.21, prio: 8, min: 0.08, variants: 2, dur: 0.22 }, (s, v) => {
  const p = pmOf(v);
  whoosh(s, { dur: 0.15, f0: 220 * p, f1: 800 * p, q: 1.4, amp: 0.9, color: 'pink' });
  thump(s, { t0: 0.1, f0: 120, f1: 50, dur: 0.1, k: 30, amp: 0.5 });
});
def('enemy_slam', '敵の地面への一撃', 'combat', { vol: 0.28, prio: 35, min: 0.15, dur: 0.6 }, (s) => {
  thump(s, { f0: 110, f1: 32, dur: 0.45, k: 10, amp: 1 });
  rumble(s, { dur: 0.5, amp: 0.7, f: 260 });
  crackle(s, { dur: 0.3, rate: 60, amp: 0.3, hp: 700 });
});
def('dodge', '回避', 'combat', { vol: 0.44, prio: 25, min: 0.12, dur: 0.15 }, (s) => {
  whoosh(s, { dur: 0.1, f0: 900, f1: 3400, q: 1, amp: 1 });
});
def('block', 'ブロック', 'combat', { vol: 0.57, prio: 25, min: 0.12, dur: 0.3 }, (s) => {
  metal(s, { f: 880, decay: 0.08, amp: 0.6 });
  thump(s, { f0: 180, f1: 80, dur: 0.08, k: 40, amp: 0.6 });
});
def('telegraph', '危険の予告', 'combat', { vol: 0.38, prio: 45, min: 0.5, dur: 0.6 }, (s) => {
  for (const t0 of [0, 0.22]) {
    s.osc({ t0, dur: 0.18, f: 330, type: 'tri', env: adsr(0.01, 0.05, 0.7, 0.06, 0.12), amp: 0.5 });
    s.osc({ t0, dur: 0.18, f: 165, type: 'saw', env: adsr(0.01, 0.05, 0.6, 0.06, 0.12), amp: 0.2 });
  }
  s.filter({ type: 'lp', f: 2200 });
});
def('boss_horn', 'ボスの角笛', 'event', { vol: 0.71, prio: 88, min: 2, dur: 2.6 }, (s) => {
  brass(s, { f: M(38), dur: 1.7, amp: 0.8, bright: 1400, att: 0.12, scoop: 2 });
  brass(s, { f: M(45), dur: 1.5, amp: 0.35, bright: 1200, att: 0.16, scoop: 2 });
  thump(s, { f0: 90, f1: 35, dur: 0.6, k: 7, amp: 0.8 });
  rumble(s, { dur: 1.4, amp: 0.4 });
  s.reverb({ mix: 0.3, size: 0.88, damp: 0.5 });
});
def('goblin', 'ため込み屋の笑い声', 'event', { vol: 0.75, prio: 70, min: 3, dur: 1.2 }, (s) => {
  let f = 560;
  for (let i = 0; i < 5; i++) {
    const t0 = i * 0.11;
    const src = s.layer(0.2); src.osc({ dur: 0.12, type: 'saw', f: (t) => f * (1 + 0.15 * Math.exp(-t * 30)), env: perc(0.008, 0.045), amp: 0.7 });
    const a = s.layer(0.2); a.add(src); a.filter({ type: 'bp', f: 820, q: 4 });
    const b = s.layer(0.2); b.add(src); b.filter({ type: 'bp', f: 1250, q: 5 });
    s.add(a, t0, 1.8).add(b, t0, 1.1);
    f *= 0.92;
  }
  for (let i = 0; i < 4; i++) metal(s, { t0: 0.6 + i * 0.06, f: 3200 + i * 300, decay: 0.05, amp: 0.25 });
});

// ---- スキル
def('swing', '剣を振る', 'skill', { vol: 0.34, prio: 10, min: 0.05, variants: 3, dur: 0.2 }, (s, v) => {
  const p = pmOf(v);
  whoosh(s, { dur: 0.13, f0: 500 * p, f1: 2600 * p, q: 1.5, amp: 1 });
});
def('swing_heavy', '大きく薙ぐ', 'skill', { vol: 0.51, prio: 12, min: 0.08, variants: 2, dur: 0.3 }, (s, v) => {
  const p = pmOf(v);
  whoosh(s, { dur: 0.24, f0: 260 * p, f1: 1500 * p, q: 1.1, amp: 1, color: 'pink' });
  whoosh(s, { t0: 0.04, dur: 0.16, f0: 1200 * p, f1: 3600 * p, q: 2, amp: 0.4 });
});
def('bow', '弓を射る', 'skill', { vol: 0.37, prio: 10, min: 0.05, variants: 3, dur: 0.3 }, (s, v) => {
  const p = pmOf(v);
  s.pluck({ f: 150 * p, dur: 0.25, bright: 0.85, decay: 0.985, amp: 0.8 });
  whoosh(s, { t0: 0.012, dur: 0.08, f0: 2400, f1: 5200, q: 1, amp: 0.5 });
  click(s, { amp: 0.4, f: 2000 });
});
def('throw', '刃を投げる', 'skill', { vol: 0.44, prio: 10, min: 0.05, variants: 3, dur: 0.18 }, (s, v) => {
  const p = pmOf(v);
  whoosh(s, { dur: 0.09, f0: 2600 * p, f1: 6000 * p, q: 1.4, amp: 0.9 });
  metal(s, { t0: 0.005, f: 3500 * p, decay: 0.025, amp: 0.25 });
});
def('cast_spell', '呪文を唱える', 'skill', { vol: 0.31, prio: 10, min: 0.06, variants: 2, dur: 0.4 }, (s, v) => {
  const p = pmOf(v);
  whoosh(s, { dur: 0.24, f0: 300 * p, f1: 3600 * p, q: 2.2, amp: 0.9 });
  s.osc({ dur: 0.25, type: 'tri', f: sweep(420 * p, 1250 * p, 0.2), env: swell(0.06, 0.04, 0.14), amp: 0.25 });
  sparkle(s, { t0: 0.08, dur: 0.25, rate: 40, amp: 0.12 });
});
def('cast_dark', '闇の詠唱', 'skill', { vol: 0.27, prio: 10, min: 0.08, variants: 2, dur: 0.5 }, (s, v) => {
  const p = pmOf(v);
  const l = s.layer(0.45); l.noise({ dur: 0.35, env: swell(0.25, 0, 0.1) }); l.filter({ type: 'bp', f: sweep(300 * p, 1300 * p, 0.3), q: 3 }); s.add(l, 0, 1);
  s.osc({ dur: 0.4, type: 'tri', f: 98 * p, env: swell(0.2, 0.05, 0.15), amp: 0.35 });
  s.osc({ dur: 0.4, type: 'tri', f: 116.5 * p, env: swell(0.2, 0.05, 0.15), amp: 0.3 });
  crackle(s, { t0: 0.15, dur: 0.2, rate: 40, amp: 0.3, hp: 1500 });
});
def('nova', '衝撃の波', 'skill', { vol: 0.39, prio: 20, min: 0.08, variants: 2, dur: 0.5 }, (s, v) => {
  const p = pmOf(v);
  thump(s, { f0: 130 * p, f1: 40, dur: 0.32, k: 12, amp: 0.9 });
  const l = s.layer(0.45); l.noise({ dur: 0.4, color: 'pink', env: perc(0.003, 0.12) }); l.filter({ type: 'lp', f: sweep(5200, 320, 0.35) }); s.add(l, 0, 0.9);
  whoosh(s, { dur: 0.3, f0: 2600, f1: 380, q: 1, amp: 0.5 });
});
def('chain', '連鎖の稲妻', 'skill', { vol: 0.59, prio: 18, min: 0.08, dur: 0.35 }, (s) => {
  for (let i = 0; i < 3; i++) zap(s, { t0: i * 0.055, dur: 0.09, lo: 400 + i * 200, hi: 3000 + i * 400, amp: 0.7 - i * 0.12 });
  crackle(s, { dur: 0.25, rate: 260, amp: 0.4, hp: 3000 });
});
def('explosion', '大爆発（隕石）', 'skill', { vol: 0.54, prio: 45, min: 0.12, dur: 1.6 }, (s) => {
  boom(s, { dur: 1, amp: 1, f0: 80, f1: 24 });
  crackle(s, { t0: 0.03, dur: 0.7, rate: 120, amp: 0.45, hp: 800 });
  rumble(s, { dur: 1.1, amp: 0.5 });
  s.reverb({ mix: 0.2, size: 0.8 });
});
def('beam', '光線', 'skill', { vol: 0.5, prio: 15, min: 0.25, dur: 0.7 }, (s) => {
  const l = s.layer(0.7);
  for (const [f, a] of [[110, 0.4], [111.4, 0.4], [220.6, 0.25], [331, 0.12]]) l.osc({ dur: 0.62, type: 'saw', f, env: swell(0.04, 0.38, 0.2), amp: a });
  l.filter({ type: 'lp', f: (t) => 1300 + 700 * Math.sin(t * 40), q: 3 });
  s.add(l, 0, 1);
  crackle(s, { dur: 0.6, rate: 80, amp: 0.25, hp: 2500, env: () => 1 });
});
def('dash', '駆け抜ける', 'skill', { vol: 0.43, prio: 15, min: 0.12, variants: 2, dur: 0.25 }, (s, v) => {
  const p = pmOf(v);
  whoosh(s, { dur: 0.13, f0: 800 * p, f1: 4200 * p, q: 0.8, amp: 1 });
  whoosh(s, { t0: 0.05, dur: 0.12, f0: 3000 * p, f1: 900 * p, q: 1.2, amp: 0.5 });
});
def('leap', '跳躍と着地', 'skill', { vol: 0.43, prio: 30, min: 0.3, dur: 0.9 }, (s) => {
  whoosh(s, { dur: 0.26, f0: 300, f1: 1900, q: 1.1, amp: 0.7 });
  thump(s, { t0: 0.28, f0: 130, f1: 34, dur: 0.45, k: 9, amp: 1 });
  noiseHit(s, { t0: 0.28, type: 'lp', f: 1200, amp: 0.7, d: 0.08, dur: 0.3, color: 'pink' });
  rumble(s, { t0: 0.28, dur: 0.5, amp: 0.45, f: 220 });
});
def('trap', '罠を仕掛ける', 'skill', { vol: 0.45, prio: 15, min: 0.15, dur: 0.35 }, (s) => {
  click(s, { amp: 0.7, f: 1500, len: 0.006 });
  s.osc({ t0: 0.02, dur: 0.18, f: (t) => 700 + 700 * Math.sin(t * 90) * Math.exp(-t * 14), env: perc(0.002, 0.06), amp: 0.3 });
  metal(s, { t0: 0.04, f: 1900, decay: 0.05, amp: 0.3 });
});
def('curse', '呪い', 'skill', { vol: 0.4, prio: 18, min: 0.2, dur: 1 }, (s) => {
  const l = s.layer(0.9); l.noise({ dur: 0.75, env: swell(0.25, 0.2, 0.3) }); l.filter({ type: 'bp', f: sweep(900, 1500, 0.6), q: 7 }); s.add(l, 0, 1.6);
  s.osc({ dur: 0.8, type: 'tri', f: 98, env: swell(0.3, 0.2, 0.3), amp: 0.35 });
  s.osc({ dur: 0.8, type: 'tri', f: 116.5, env: swell(0.3, 0.2, 0.3), amp: 0.3 });
  s.osc({ dur: 0.8, type: 'sine', f: 138.6, env: swell(0.35, 0.15, 0.3), amp: 0.2 });
});
def('shield', '障壁', 'skill', { vol: 0.36, prio: 25, min: 0.3, dur: 0.8 }, (s) => {
  const l = s.layer(0.7); l.osc({ dur: 0.6, type: 'saw', f: 220, env: swell(0.12, 0.2, 0.25), amp: 0.5 }); l.filter({ type: 'bp', f: sweep(400, 2200, 0.5), q: 8 }); s.add(l, 0, 1.6);
  glass(s, { t0: 0.12, f: 1760, amp: 0.3, decay: 0.3 });
  glass(s, { t0: 0.18, f: 2637, amp: 0.2, decay: 0.3 });
});
def('buff', '強化', 'skill', { vol: 0.39, prio: 25, min: 0.3, dur: 0.9 }, (s) => {
  pad(s, { notes: [67, 71, 74], dur: 0.7, amp: 0.4, att: 0.12, cut: 3500 });
  whoosh(s, { dur: 0.35, f0: 500, f1: 4000, q: 1.5, amp: 0.4 });
  sparkle(s, { t0: 0.1, dur: 0.6, rate: 35, amp: 0.13 });
});
def('summon', '召喚', 'skill', { vol: 0.59, prio: 25, min: 0.25, dur: 1 }, (s) => {
  const l = s.layer(0.6); l.noise({ dur: 0.5, env: swell(0.35, 0, 0.15) }); l.filter({ type: 'bp', f: sweep(200, 1300, 0.45), q: 3 }); s.add(l, 0, 1.1);
  const c = s.layer(0.9); for (const m of [43, 46, 50]) c.osc({ dur: 0.8, type: 'saw', f: M(m), env: swell(0.2, 0.25, 0.35), amp: 0.3 }); c.filter({ type: 'lp', f: 900 }); s.add(c, 0.1, 0.8);
  s.grains({ t0: 0.3, dur: 0.3, rate: 50, amp: 0.35, f: [1800, 4200], len: 0.006 });
});
def('ult', '奥義', 'skill', { vol: 0.92, prio: 80, min: 0.6, dur: 2.4 }, (s) => {
  const r = s.layer(0.6); r.noise({ dur: 0.52, env: (t) => (t / 0.52) ** 2.5 }); r.filter({ type: 'hp', f: sweep(300, 3000, 0.5) }); s.add(r, 0, 0.7);
  s.osc({ dur: 0.52, type: 'saw', f: sweep(110, 440, 0.5), env: (t) => (t / 0.52) ** 2, amp: 0.15 });
  boom(s, { t0: 0.5, dur: 1.2, amp: 1, f0: 85, f1: 26 });
  for (const m of [48, 55, 60, 63]) brass(s, { t0: 0.5, f: M(m), dur: 1.2, amp: 0.2, bright: 2200, att: 0.02 });
  sparkle(s, { t0: 0.55, dur: 1, rate: 40, amp: 0.15 });
  s.reverb({ mix: 0.25, size: 0.85 });
});
def('freeze', '凍結', 'skill', { vol: 0.38, prio: 30, min: 0.2, dur: 0.7 }, (s) => {
  crackle(s, { dur: 0.35, rate: 240, amp: 0.55, hp: 4000 });
  s.fm({ dur: 0.6, f: sweep(2600, 1700, 0.4), ratio: 3.1, index: (t) => 1.4 * Math.exp(-t * 5), env: perc(0.002, 0.22), amp: 0.45 });
  noiseHit(s, { f: 2000, q: 2, amp: 0.4, d: 0.04 });
});
def('shock', '感電', 'skill', { vol: 1, prio: 25, min: 0.2, dur: 0.45 }, (s) => {
  const l = s.layer(0.4);
  l.osc({ dur: 0.35, type: 'saw', f: 60, amp: 0.5 }); l.osc({ dur: 0.35, type: 'square', f: 121, amp: 0.3 });
  const gates = Array.from({ length: 40 }, () => (s.rng.next() < 0.55 ? 1 : 0.1));
  l.shape((t) => gates[Math.floor(t / 0.009) % 40] * Math.max(0, 1 - t / 0.35));
  l.filter({ type: 'hp', f: 300 });
  s.add(l, 0, 1);
  crackle(s, { dur: 0.3, rate: 200, amp: 0.4, hp: 2500 });
});
def('stun', '気絶', 'skill', { vol: 0.33, prio: 25, min: 0.3, dur: 0.6 }, (s) => {
  thump(s, { f0: 420, f1: 190, dur: 0.12, k: 25, amp: 0.7 });
  for (let i = 0; i < 3; i++) s.osc({ t0: 0.12 + i * 0.1, dur: 0.08, f: sweep(1800, 2500, 0.06), env: perc(0.004, 0.03), amp: 0.25 });
});

// ---- ドロップ（レア以上ほど高く・長く。L4・L5 は専用の音）
def('drop_common', 'ドロップ（ノーマル）', 'loot', { vol: 0.32, prio: 5, min: 0.1, dur: 0.1 }, (s) => {
  s.osc({ dur: 0.05, f: sweep(1500, 1150, 0.03), env: perc(0.001, 0.012), amp: 0.6 });
  click(s, { amp: 0.25, f: 4000 });
});
def('drop_magic', 'ドロップ（マジック）', 'loot', { vol: 0.2, prio: 10, min: 0.1, dur: 0.25 }, (s) => {
  noteSeq(s, [79, 84], { step: 0.05, amp: 0.35, decay: 0.06, ratio: 2, index: 0.6, partial: 0 });
});
def('drop_rare', 'ドロップ（レア）', 'loot', { vol: 0.32, prio: 20, min: 0.1, dur: 0.6 }, (s) => {
  noteSeq(s, [76, 79, 84], { step: 0.055, amp: 0.35, decay: 0.16, ratio: 2, index: 1.1 });
  s.reverb({ mix: 0.15, size: 0.7 });
});
def('drop_epic', 'ドロップ（エピック）', 'loot', { vol: 0.58, prio: 30, min: 0.1, dur: 1.1 }, (s) => {
  for (const [i, m] of [72, 76, 79, 83].entries()) {
    bell(s, { t0: i * 0.03, f: M(m), amp: 0.24, decay: 0.45, ratio: 3.5, index: 1.4 });
    bell(s, { t0: i * 0.03 + 0.004, f: M(m) * 1.004, amp: 0.12, decay: 0.45, ratio: 3.5, index: 1.4, partial: 0 });
  }
  sparkle(s, { t0: 0.05, dur: 0.6, rate: 30, amp: 0.12 });
  s.reverb({ mix: 0.3, size: 0.8 });
});
def('drop_legendary', 'ドロップ（レジェンダリー）', 'loot', { vol: 0.75, prio: 60, min: 0.1, dur: 2.2 }, (s) => {
  whoosh(s, { dur: 0.26, f0: 400, f1: 5000, q: 1.2, amp: 0.4 });
  bell(s, { t0: 0.22, f: M(60), dur: 1.8, amp: 0.4, ratio: 1.4, index: 3, decay: 0.9 });
  bell(s, { t0: 0.22, f: M(84), dur: 1.6, amp: 0.35, ratio: 3.5, index: 2, decay: 0.7 });
  bell(s, { t0: 0.3, f: M(91), dur: 1.6, amp: 0.3, ratio: 3.5, index: 2, decay: 0.7 });
  sparkle(s, { t0: 0.25, dur: 1.3, rate: 35, amp: 0.15 });
  s.reverb({ mix: 0.32, size: 0.88 });
});
def('drop_set', 'ドロップ（セット）', 'loot', { vol: 0.46, prio: 62, min: 0.1, dur: 1.8 }, (s) => {
  [67, 71, 74, 79, 83].forEach((m, i) => s.pluck({ t0: i * 0.06, f: M(m), dur: 1.2, bright: 0.45, decay: 0.997, amp: 0.4 }));
  bell(s, { t0: 0.32, f: M(86), dur: 1.2, amp: 0.3, ratio: 2, index: 1.5, decay: 0.6 });
  sparkle(s, { t0: 0.3, dur: 0.9, rate: 25, amp: 0.12, lo: 2500, hi: 6000 });
  s.reverb({ mix: 0.3, size: 0.85 });
});
def('drop_unique', 'ドロップ（ユニーク）', 'loot', { vol: 0.61, prio: 64, min: 0.1, dur: 2.2 }, (s) => {
  bell(s, { f: M(48), dur: 2, amp: 0.55, ratio: 2, index: 3.2, decay: 1, partial: 0.1 });
  choir(s, { t0: 0.05, notes: [60, 64, 67], dur: 1.4, amp: 0.45, vowel: 'o', att: 0.15 });
  bell(s, { t0: 0.12, f: M(79), dur: 1.2, amp: 0.25, ratio: 3.5, index: 1.6, decay: 0.6 });
  sparkle(s, { t0: 0.15, dur: 1, rate: 25, amp: 0.12 });
  s.reverb({ mix: 0.3, size: 0.88 });
});
def('drop_mythic', 'ドロップ（ミシック）', 'loot', { vol: 1, prio: 100, min: 0.1, dur: 3.4 }, (s) => {
  for (let i = 0; i < 10; i++) thump(s, { t0: i * 0.04, f0: 110, f1: 70, dur: 0.12, k: 20, amp: 0.15 + i * 0.05 });
  const sw = s.layer(1.4); sw.noise({ dur: 1.3, env: (t) => (t < 1.25 ? (t / 1.25) ** 3 : Math.exp(-(t - 1.25) * 3)) }); sw.filter({ type: 'hp', f: 3000 }); s.add(sw, 0, 0.35);
  const chords = [[0.45, [60, 64, 67], 0.26], [0.75, [65, 69, 72], 0.26], [1.05, [67, 71, 74], 0.22], [1.3, [72, 76, 79, 84], 1.5]];
  for (const [t0, notes, d] of chords) for (const m of notes) brass(s, { t0, f: M(m), dur: d, amp: 0.22, bright: 2600, att: 0.02 });
  choir(s, { t0: 1.3, notes: [60, 67, 72, 76], dur: 1.7, amp: 0.4, vowel: 'a', att: 0.08 });
  bell(s, { t0: 1.3, f: M(96), dur: 1.6, amp: 0.3, ratio: 3.5, index: 2, decay: 0.8 });
  boom(s, { t0: 1.3, dur: 1.2, amp: 0.6 });
  sparkle(s, { t0: 1.3, dur: 1.6, rate: 45, amp: 0.16 });
  s.reverb({ mix: 0.3, size: 0.88 });
});
def('drop_ancient', 'きらめき（覚醒）', 'loot', { vol: 0.44, prio: 40, min: 0.1, dur: 1 }, (s) => {
  noteSeq(s, [88, 91, 96, 100], { step: 0.05, fn: glass, amp: 0.35, decay: 0.3 });
  sparkle(s, { dur: 0.7, rate: 50, amp: 0.15, lo: 4000, hi: 9000 });
  s.reverb({ mix: 0.25, size: 0.8 });
});
def('drop_primal', 'きらめき（極致）', 'loot', { vol: 0.53, prio: 70, min: 0.1, dur: 1.6 }, (s) => {
  const r = s.layer(0.5); r.noise({ dur: 0.42, env: (t) => (t / 0.42) ** 2 }); r.filter({ type: 'bp', f: sweep(500, 4000, 0.42), q: 2 }); s.add(r, 0, 0.6);
  for (const m of [76, 83, 88]) bell(s, { t0: 0.42, f: M(m), dur: 1.1, amp: 0.25, ratio: 3.5, index: 2.2, decay: 0.55 });
  thump(s, { t0: 0.42, f0: 140, f1: 40, dur: 0.4, k: 9, amp: 0.7 });
  sparkle(s, { t0: 0.45, dur: 0.9, rate: 40, amp: 0.15 });
  s.reverb({ mix: 0.3, size: 0.86 });
});
def('gold', 'お金', 'loot', { vol: 0.32, prio: 8, min: 0.09, variants: 3, dur: 0.3 }, (s, v) => {
  const n = 2 + (v % 2);
  for (let i = 0; i < n; i++) metal(s, { t0: i * 0.045, f: 3000 + s.rng.range(0, 1200), decay: 0.05, amp: 0.4 });
});
def('salvage', '分解', 'craft', { vol: 0.46, prio: 30, min: 0.15, dur: 0.5 }, (s) => {
  noiseHit(s, { f: 1500, q: 0.7, amp: 0.8, d: 0.06, dur: 0.2 });
  crackle(s, { dur: 0.3, rate: 90, amp: 0.4, hp: 1200 });
  for (let i = 0; i < 3; i++) metal(s, { t0: 0.03 + i * 0.05, f: 1600 + i * 450, decay: 0.03, amp: 0.2 });
  thump(s, { f0: 160, f1: 60, dur: 0.15, k: 24, amp: 0.6 });
  const p = s.layer(0.4); p.noise({ dur: 0.35, env: swell(0.05, 0.05, 0.25) }); p.filter({ type: 'lp', f: 700 }); s.add(p, 0.05, 0.5);
});

// ---- 画面の操作
def('ui_click', 'ボタン', 'ui', { vol: 0.37, prio: 60, min: 0.03, dur: 0.06 }, (s) => {
  s.osc({ dur: 0.035, f: sweep(1150, 780, 0.025), env: perc(0.001, 0.01), amp: 0.7 });
  click(s, { amp: 0.25, f: 3000 });
});
def('ui_confirm', '決定', 'ui', { vol: 0.31, prio: 62, min: 0.05, dur: 0.2 }, (s) => {
  s.osc({ dur: 0.08, f: 880, type: 'tri', env: perc(0.002, 0.03), amp: 0.5 });
  s.osc({ t0: 0.045, dur: 0.12, f: 1320, type: 'tri', env: perc(0.002, 0.05), amp: 0.5 });
});
def('ui_open', '窓を開く', 'ui', { vol: 0.27, prio: 60, min: 0.06, dur: 0.18 }, (s) => {
  whoosh(s, { dur: 0.12, f0: 600, f1: 2800, q: 1, amp: 0.7 });
  s.osc({ t0: 0.08, dur: 0.05, f: 720, env: perc(0.001, 0.015), amp: 0.35 });
});
def('ui_close', '窓を閉じる', 'ui', { vol: 0.32, prio: 60, min: 0.06, dur: 0.15 }, (s) => {
  whoosh(s, { dur: 0.1, f0: 2600, f1: 480, q: 1, amp: 0.7 });
  click(s, { t0: 0.08, amp: 0.25, f: 1800 });
});
def('ui_tab', 'タブ', 'ui', { vol: 0.5, prio: 58, min: 0.04, dur: 0.06 }, (s) => {
  noiseHit(s, { type: 'hp', f: 2600, amp: 0.6, d: 0.007, dur: 0.04 });
  s.osc({ dur: 0.03, f: 1600, type: 'tri', env: perc(0.001, 0.008), amp: 0.4 });
});
def('ui_select', '選ぶ', 'ui', { vol: 0.33, prio: 55, min: 0.04, dur: 0.06 }, (s) => {
  s.osc({ dur: 0.04, f: 900, env: perc(0.001, 0.012), amp: 0.6 });
  s.osc({ dur: 0.02, f: 1820, type: 'tri', env: perc(0.0005, 0.005), amp: 0.3 });
});
def('ui_toggle', '切り替え', 'ui', { vol: 0.23, prio: 55, min: 0.04, dur: 0.1 }, (s) => {
  s.osc({ dur: 0.03, f: 1200, env: perc(0.001, 0.008), amp: 0.5 });
  s.osc({ t0: 0.03, dur: 0.04, f: 1500, env: perc(0.001, 0.01), amp: 0.5 });
});
def('ui_error', 'できない', 'ui', { vol: 0.22, prio: 60, min: 0.15, dur: 0.25 }, (s) => {
  const l = s.layer(0.25);
  l.osc({ dur: 0.07, f: 180, type: 'square', env: perc(0.002, 0.04), amp: 0.5 });
  l.osc({ t0: 0.1, dur: 0.09, f: 160, type: 'square', env: perc(0.002, 0.05), amp: 0.5 });
  l.filter({ type: 'lp', f: 1200 });
  s.add(l);
});

// ---- 鍛冶・装備
def('equip', '装備する', 'craft', { vol: 0.64, prio: 50, min: 0.12, dur: 0.4 }, (s) => {
  metal(s, { f: 700, decay: 0.07, amp: 0.45 });
  metal(s, { t0: 0.05, f: 1080, decay: 0.05, amp: 0.3 });
  const r = s.layer(0.2); r.noise({ dur: 0.14, env: swell(0.03, 0.02, 0.09) }); r.filter({ type: 'bp', f: 3000, q: 0.6 }); s.add(r, 0.02, 0.4);
  thump(s, { f0: 160, f1: 70, dur: 0.1, k: 30, amp: 0.6 });
});
def('enhance_ok', '強化 成功', 'craft', { vol: 0.73, prio: 70, min: 0.1, dur: 1 }, (s) => {
  metal(s, { f: 1000, decay: 0.18, amp: 0.5 });
  thump(s, { f0: 180, f1: 60, dur: 0.12, k: 30, amp: 0.6 });
  crackle(s, { dur: 0.25, rate: 120, amp: 0.35, hp: 3000 });
  bell(s, { t0: 0.13, f: M(79), amp: 0.3, decay: 0.3, ratio: 2, index: 1.2 });
  bell(s, { t0: 0.22, f: M(84), amp: 0.35, decay: 0.45, ratio: 2, index: 1.2 });
  s.reverb({ mix: 0.18, size: 0.75 });
});
def('enhance_fail', '強化 失敗', 'craft', { vol: 0.6, prio: 70, min: 0.1, dur: 1 }, (s) => {
  metal(s, { f: 690, decay: 0.09, amp: 0.45 });
  thump(s, { f0: 150, f1: 55, dur: 0.15, k: 25, amp: 0.6 });
  const l = s.layer(0.8); l.osc({ t0: 0.12, dur: 0.6, type: 'saw', f: sweep(240, 110, 0.5), env: perc(0.01, 0.25), amp: 0.4 }); l.filter({ type: 'lp', f: 900 }); s.add(l);
  crackle(s, { t0: 0.1, dur: 0.4, rate: 50, amp: 0.3, hp: 600 });
});
def('enhance_great', '強化 大成功', 'craft', { vol: 0.82, prio: 80, min: 0.1, dur: 2 }, (s) => {
  metal(s, { f: 1000, decay: 0.2, amp: 0.5 });
  thump(s, { f0: 200, f1: 50, dur: 0.25, k: 18, amp: 0.8 });
  noteSeq(s, [72, 76, 79, 84, 88, 91], { t0: 0.12, step: 0.05, amp: 0.28, decay: 0.4, ratio: 2, index: 1.3 });
  pad(s, { t0: 0.4, notes: [72, 76, 79, 84], dur: 1.1, amp: 0.3, att: 0.05, cut: 4000 });
  sparkle(s, { t0: 0.15, dur: 1.2, rate: 45, amp: 0.15 });
  s.reverb({ mix: 0.28, size: 0.85 });
});
def('gem_combine', '宝石の合成', 'craft', { vol: 0.59, prio: 65, min: 0.1, dur: 1.4 }, (s) => {
  [88, 91, 95].forEach((m, i) => glass(s, { t0: i * 0.09, f: M(m), amp: 0.35, decay: 0.2 }));
  whoosh(s, { t0: 0.2, dur: 0.2, f0: 800, f1: 4000, q: 1.5, amp: 0.35 });
  for (const m of [84, 88, 91, 96]) glass(s, { t0: 0.36, f: M(m), amp: 0.22, decay: 0.6 });
  sparkle(s, { t0: 0.36, dur: 0.8, rate: 40, amp: 0.13 });
  s.reverb({ mix: 0.25, size: 0.82 });
});
def('craft', '鍛造', 'craft', { vol: 0.57, prio: 65, min: 0.1, dur: 1 }, (s) => {
  whoosh(s, { dur: 0.28, f0: 300, f1: 2200, q: 1.6, amp: 0.6 });
  metal(s, { t0: 0.22, f: 1300, decay: 0.08, amp: 0.35 });
  bell(s, { t0: 0.24, f: M(76), amp: 0.35, decay: 0.45, ratio: 3.5, index: 1.6 });
  sparkle(s, { t0: 0.25, dur: 0.6, rate: 35, amp: 0.13 });
  s.reverb({ mix: 0.2, size: 0.8 });
});
def('socket', 'はめ込む', 'craft', { vol: 0.97, prio: 65, min: 0.1, dur: 0.6 }, (s) => {
  metal(s, { f: 2500, decay: 0.03, amp: 0.4 });
  thump(s, { f0: 260, f1: 110, dur: 0.06, k: 50, amp: 0.5 });
  glass(s, { t0: 0.045, f: M(96), amp: 0.35, decay: 0.3 });
});
def('reroll', '振り直し', 'craft', { vol: 0.38, prio: 65, min: 0.1, dur: 0.8 }, (s) => {
  for (let i = 0; i < 6; i++) click(s, { t0: i * 0.04 + s.rng.range(0, 0.01), amp: 0.5, f: 1200 + i * 200, len: 0.004 });
  whoosh(s, { t0: 0.05, dur: 0.25, f0: 800, f1: 3000, q: 2, amp: 0.4 });
  bell(s, { t0: 0.28, f: M(81), amp: 0.35, decay: 0.35, ratio: 2, index: 1.3 });
});
def('corrupt', '堕落', 'craft', { vol: 0.52, prio: 75, min: 0.1, dur: 1.6 }, (s) => {
  const r = s.layer(0.6); r.noise({ dur: 0.5, env: (t) => (t / 0.5) ** 2 }); r.filter({ type: 'bp', f: sweep(2000, 300, 0.5), q: 2 }); s.add(r, 0, 0.7);
  const c = s.layer(1.2); for (const m of [36, 42, 47]) c.osc({ t0: 0.45, dur: 0.9, type: 'saw', f: M(m), env: perc(0.01, 0.4), amp: 0.35 }); c.drive(3); c.filter({ type: 'lp', f: 1500 }); s.add(c, 0, 0.8);
  crackle(s, { t0: 0.45, dur: 0.6, rate: 120, amp: 0.4, hp: 1000 });
  s.reverb({ mix: 0.25, size: 0.85 });
});
def('buy', '買う', 'craft', { vol: 0.43, prio: 60, min: 0.1, dur: 0.7 }, (s) => {
  metal(s, { f: 3200, decay: 0.05, amp: 0.35 });
  metal(s, { t0: 0.05, f: 3900, decay: 0.05, amp: 0.3 });
  bell(s, { t0: 0.12, f: M(88), amp: 0.35, decay: 0.3, ratio: 2, index: 1 });
});

// ---- 出来事
def('level_up', 'レベルアップ', 'event', { vol: 0.74, prio: 75, min: 0.6, dur: 1.8 }, (s) => {
  noteSeq(s, [72, 76, 79, 84], { step: 0.08, amp: 0.32, decay: 0.3, ratio: 2, index: 1.4 });
  for (const m of [72, 76, 79]) brass(s, { t0: 0.3, f: M(m), dur: 0.7, amp: 0.15, bright: 3000, att: 0.02 });
  for (const m of [84, 88, 91]) bell(s, { t0: 0.32, f: M(m), dur: 1.2, amp: 0.2, decay: 0.6, ratio: 3.5, index: 1.5 });
  sparkle(s, { t0: 0.3, dur: 1, rate: 35, amp: 0.14 });
  s.reverb({ mix: 0.25, size: 0.84 });
});
def('paragon', 'アビスLv', 'event', { vol: 0.74, prio: 75, min: 0.6, dur: 2.3 }, (s) => {
  noteSeq(s, [60, 67, 72, 79, 84], { step: 0.09, amp: 0.3, decay: 0.4, ratio: 2, index: 1.6 });
  choir(s, { t0: 0.35, notes: [60, 64, 67, 72], dur: 1.6, amp: 0.38, vowel: 'a', att: 0.1 });
  bell(s, { t0: 0.45, f: M(96), dur: 1.4, amp: 0.22, decay: 0.7 });
  s.reverb({ mix: 0.3, size: 0.86 });
});
def('prestige', '転生', 'event', { vol: 0.9, prio: 95, min: 2, dur: 3.8 }, (s) => {
  const d = s.layer(2.4); for (const m of [36, 43, 48]) d.osc({ dur: 2.2, type: 'saw', f: M(m), env: (t) => (t < 2 ? (t / 2) ** 2 : Math.max(0, 1 - (t - 2) * 5)), amp: 0.3 }); d.filter({ type: 'lp', f: sweep(180, 3200, 2) }); s.add(d, 0, 0.9);
  choir(s, { t0: 0.9, notes: [48, 55, 60, 64, 67], dur: 2.6, amp: 0.4, vowel: 'a', att: 0.9 });
  boom(s, { t0: 2, dur: 1.4, amp: 0.8 });
  bell(s, { t0: 2, f: M(84), dur: 1.6, amp: 0.3, decay: 0.8 });
  sparkle(s, { t0: 2, dur: 1.5, rate: 40, amp: 0.15 });
  s.reverb({ mix: 0.32, size: 0.9 });
});
def('achievement', '実績の達成', 'event', { vol: 0.7, prio: 72, min: 0.5, dur: 1.6 }, (s) => {
  noteSeq(s, [72, 79], { step: 0.11, amp: 0.32, decay: 0.25, ratio: 2, index: 1.2 });
  for (const m of [76, 79, 84]) { bell(s, { t0: 0.24, f: M(m), dur: 1.1, amp: 0.22, decay: 0.55, ratio: 3.5, index: 1.4 }); brass(s, { t0: 0.24, f: M(m - 12), dur: 0.7, amp: 0.12, bright: 2400 }); }
  sparkle(s, { t0: 0.25, dur: 0.8, rate: 30, amp: 0.12 });
  s.reverb({ mix: 0.24, size: 0.82 });
});
def('rift_start', '裂け目が開く', 'event', { vol: 0.8, prio: 85, min: 1, dur: 2.6 }, (s) => {
  const l = s.layer(1.5); l.noise({ dur: 1.35, env: (t) => (t / 1.35) ** 1.5 }); l.filter({ type: 'bp', f: sweep(200, 3200, 1.3), q: 6 }); s.add(l, 0, 1.4);
  rumble(s, { dur: 1.8, amp: 0.6 });
  s.osc({ dur: 1.6, type: 'tri', f: 55, env: swell(1, 0.3, 0.3), amp: 0.4 });
  s.osc({ dur: 1.6, type: 'tri', f: 58.3, env: swell(1, 0.3, 0.3), amp: 0.35 });
  boom(s, { t0: 1.3, dur: 1, amp: 0.8 });
  for (const m of [61, 64, 70]) glass(s, { t0: 1.32, f: M(m + 12), amp: 0.2, decay: 0.6 });
  s.reverb({ mix: 0.3, size: 0.88 });
});
def('rift_complete', '裂け目を踏破', 'event', { vol: 0.95, prio: 90, min: 1, dur: 2.8 }, (s) => {
  for (const m of [62, 66, 69]) brass(s, { f: M(m), dur: 0.32, amp: 0.2, bright: 2600, att: 0.02 });
  for (const m of [67, 71, 74, 79]) brass(s, { t0: 0.36, f: M(m), dur: 1.4, amp: 0.2, bright: 2600, att: 0.02 });
  noteSeq(s, [79, 83, 86, 91], { t0: 0.36, step: 0.06, amp: 0.22, decay: 0.6 });
  boom(s, { t0: 0.36, dur: 1, amp: 0.6 });
  sparkle(s, { t0: 0.4, dur: 1.5, rate: 40, amp: 0.15 });
  s.reverb({ mix: 0.28, size: 0.87 });
});
def('zone_clear', '地域を踏破', 'event', { vol: 0.83, prio: 80, min: 1, dur: 2.2 }, (s) => {
  noteSeq(s, [67, 71, 74, 79], { step: 0.1, amp: 0.3, decay: 0.35, ratio: 2, index: 1.3 });
  for (const m of [55, 59, 62, 67]) brass(s, { t0: 0.4, f: M(m), dur: 1, amp: 0.16, bright: 2200, att: 0.03 });
  bell(s, { t0: 0.42, f: M(91), dur: 1.2, amp: 0.2, decay: 0.6 });
  s.reverb({ mix: 0.26, size: 0.85 });
});
def('boss_fail', 'ボスに敗れる', 'event', { vol: 0.46, prio: 80, min: 1, dur: 2 }, (s) => {
  [67, 63, 60].forEach((m, i) => brass(s, { t0: i * 0.26, f: M(m - 12), dur: i === 2 ? 1 : 0.3, amp: 0.3, bright: 1400, att: 0.03 }));
  thump(s, { t0: 0.52, f0: 100, f1: 35, dur: 0.6, k: 6, amp: 0.6 });
  s.reverb({ mix: 0.3, size: 0.85 });
});
def('bag_full', 'バッグがいっぱい', 'event', { vol: 0.38, prio: 50, min: 2, dur: 0.4 }, (s) => {
  thump(s, { f0: 210, f1: 120, dur: 0.1, k: 30, amp: 0.7 });
  thump(s, { t0: 0.14, f0: 190, f1: 100, dur: 0.12, k: 30, amp: 0.7 });
  const l = s.layer(0.35); l.osc({ t0: 0.14, dur: 0.12, f: 120, type: 'square', env: perc(0.002, 0.05), amp: 0.25 }); l.filter({ type: 'lp', f: 900 }); s.add(l);
});
def('set_bonus', 'セット効果がそろう', 'event', { vol: 0.58, prio: 70, min: 0.5, dur: 1.6 }, (s) => {
  [62, 66, 69, 74, 78, 81].forEach((m, i) => s.pluck({ t0: i * 0.035, f: M(m), dur: 1.1, bright: 0.5, decay: 0.997, amp: 0.3 }));
  for (const m of [74, 78, 81]) bell(s, { t0: 0.24, f: M(m + 12), dur: 1, amp: 0.18, decay: 0.5, ratio: 2, index: 1.2 });
  s.reverb({ mix: 0.28, size: 0.84 });
});
def('pet_hatch', '卵がかえる', 'event', { vol: 1, prio: 70, min: 0.5, dur: 1.1 }, (s) => {
  crackle(s, { dur: 0.15, rate: 120, amp: 0.6, hp: 1500 });
  click(s, { t0: 0.16, amp: 0.7, f: 1000, len: 0.008 });
  s.osc({ t0: 0.3, dur: 0.1, f: sweep(1500, 2600, 0.08), env: perc(0.005, 0.04), amp: 0.35 });
  s.osc({ t0: 0.43, dur: 0.12, f: sweep(1700, 3000, 0.1), env: perc(0.005, 0.05), amp: 0.35 });
  sparkle(s, { t0: 0.2, dur: 0.7, rate: 30, amp: 0.12 });
});
def('chest', '宝箱を開ける', 'event', { vol: 0.76, prio: 70, min: 0.5, dur: 1.5 }, (s) => {
  const c = s.layer(0.4); c.osc({ dur: 0.3, type: 'saw', f: (t) => 85 + 30 * Math.sin(t * 25), env: swell(0.05, 0.15, 0.1), amp: 0.5 }); c.filter({ type: 'bp', f: sweep(500, 900, 0.3), q: 4 }); s.add(c, 0, 1);
  thump(s, { t0: 0.3, f0: 180, f1: 70, dur: 0.12, k: 30, amp: 0.6 });
  for (let i = 0; i < 7; i++) metal(s, { t0: 0.34 + i * 0.05 + s.rng.range(0, 0.02), f: 2800 + s.rng.range(0, 1500), decay: 0.05, amp: 0.25 });
  bell(s, { t0: 0.36, f: M(84), amp: 0.3, decay: 0.5 });
  s.reverb({ mix: 0.2, size: 0.8 });
});
def('notify', '知らせ', 'event', { vol: 0.3, prio: 50, min: 0.5, dur: 1 }, (s) => {
  bell(s, { f: M(84), amp: 0.35, decay: 0.35, ratio: 2, index: 1 });
  bell(s, { t0: 0.09, f: M(91), amp: 0.35, decay: 0.45, ratio: 2, index: 1 });
  s.reverb({ mix: 0.2, size: 0.8 });
});
def('offline', 'おかえり', 'event', { vol: 0.57, prio: 70, min: 2, dur: 2 }, (s) => {
  noteSeq(s, [72, 76, 79, 84], { step: 0.14, amp: 0.3, decay: 0.5, ratio: 2, index: 1.1 });
  pad(s, { t0: 0.1, notes: [60, 64, 67], dur: 1.5, amp: 0.3, att: 0.4, cut: 2500 });
  s.reverb({ mix: 0.3, size: 0.86 });
});
def('unlock', '新しい機能の解放', 'event', { vol: 0.69, prio: 75, min: 0.5, dur: 1.5 }, (s) => {
  whoosh(s, { dur: 0.35, f0: 300, f1: 3600, q: 1.4, amp: 0.5 });
  for (const m of [74, 78, 81]) bell(s, { t0: 0.3, f: M(m), dur: 1.1, amp: 0.25, decay: 0.55, ratio: 3.5, index: 1.5 });
  sparkle(s, { t0: 0.3, dur: 0.8, rate: 30, amp: 0.12 });
  s.reverb({ mix: 0.25, size: 0.84 });
});

export const SFX_DEFS = D;
export const SFX = Object.fromEntries(D.map((d) => [d.id, d]));

/** 効果音を 1 つ作る（Float32Array・モノラル）。v は作り分けの番号 */
export function renderSfx(id, sr = 44100, v = 0) {
  const d = SFX[id];
  if (!d) return null;
  const s = new Snd(sr, d.dur + 0.05, 1000 + v * 7919 + id.length * 31);
  d.make(s, v);
  return s.done(0.9);
}

/** レアリティ → ドロップの音 */
export const LOOT_SFX = { common: 'drop_common', magic: 'drop_magic', rare: 'drop_rare', epic: 'drop_epic', legendary: 'drop_legendary', set: 'drop_set', unique: 'drop_unique', mythic: 'drop_mythic' };
export const LOOT_ORDER = ['common', 'magic', 'rare', 'epic', 'legendary', 'set', 'unique', 'mythic'];
