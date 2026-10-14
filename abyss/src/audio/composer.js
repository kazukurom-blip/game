// 曲の設計図（themes.js）→ 小節ごとの音符。WebAudio を使わない純粋な計算なので Node でも試せる。
// 同じ曲・同じ小節番号なら必ず同じ音符になる（輪の長さごとにまったく同じ → 継ぎ目なく繰り返す）。
// どの小節からでも単独で計算できる（前の小節の状態に頼らない）。

import { THEME, SCALES, DRUM_PATTERNS } from './themes.js';
import { Rand, hash32 } from './dsp.js';
import { ZONE } from '../data/world.js';
import { rootFor } from './instruments.js';

const infoCache = new Map();

/** 曲の長さの情報 */
export function themeInfo(th) {
  let inf = infoCache.get(th);
  if (inf) return inf;
  const sections = (th.form || 'A').split('');
  const passBars = (sec) => (th[sec] || th.A).length * (th.chordBars || 1);
  const loopBars = sections.reduce((n, s) => n + passBars(s), 0);
  const beatSec = 60 / th.bpm;
  const barSec = beatSec * th.meter;
  inf = { loopBars, barSec, beatSec, stepSec: barSec / th.steps, intro: th.intro ?? 1, sections, passBars, loopSec: loopBars * barSec };
  infoCache.set(th, inf);
  return inf;
}

/** 通し番号 b の小節が、輪のどこにあたるか */
export function barPos(th, b) {
  const inf = themeInfo(th);
  const cb = th.chordBars || 1;
  if (b < inf.intro) return { intro: true, lb: -1, sec: 'A', occ: 0, passIdx: -1, barInPass: 0, chordIdx: 0, degree: th.A[0], chordStart: b === 0, lastOfPass: false, passLen: inf.passBars('A') };
  const lb = (b - inf.intro) % inf.loopBars;
  let acc = 0; const seen = {};
  for (let i = 0; i < inf.sections.length; i++) {
    const sec = inf.sections[i];
    const len = inf.passBars(sec);
    seen[sec] = (seen[sec] || 0) + 1;
    if (lb < acc + len) {
      const barInPass = lb - acc;
      const prog = th[sec] || th.A;
      const chordIdx = Math.floor(barInPass / cb);
      return { intro: false, lb, sec, occ: seen[sec] - 1, passIdx: i, barInPass, chordIdx, degree: prog[chordIdx], chordStart: barInPass % cb === 0, lastOfPass: barInPass === len - 1, passLen: len };
    }
    acc += len;
  }
  return null;
}

// ---------------------------------------------------------------- 音階と和音
export function scaleNote(th, deg) {
  const sc = SCALES[th.scale] || SCALES.aeolian;
  const L = sc.length;
  const o = Math.floor(deg / L);
  const i = ((deg % L) + L) % L;
  return th.key + sc[i] + 12 * o;
}
const degLen = (th) => (SCALES[th.scale] || SCALES.aeolian).length;
const chordDegs = (th, d, seventh = false) => (seventh ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4]);
/** 和音の音（ピッチクラスとしての MIDI） */
export function chordNotes(th, d, seventh = false) { return chordDegs(th, d, seventh).map((x) => scaleNote(th, x)); }

/** n を center に一番近いオクターブに置く */
const near = (n, center) => n + 12 * Math.round((center - n) / 12);

/** 伸ばしの和音（4 声）。中心の高さ: key + 12 + 12×oct */
export function padVoicing(th, d) {
  const center = th.key + 12 + 12 * (th.pad?.oct || 0) + 4;
  const notes = chordNotes(th, d, !!th.pad?.seventh).map((n) => near(n, center));
  notes.sort((a, b) => a - b);
  if (notes.length < 4) notes.unshift(near(scaleNote(th, d), center - 12));
  return notes;
}

export function bassRoot(th, d) {
  const center = th.key + 12 + 12 * (th.bass?.oct ?? -2);
  return near(scaleNote(th, d), center);
}

// ---------------------------------------------------------------- リズムの型
const RHYTHMS = {
  16: [
    [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
    [[0, 6], [6, 2], [8, 4], [12, 4]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[0, 8], [8, 8]],
    [[2, 2], [4, 2], [6, 2], [8, 8]],
    [[0, 3], [3, 3], [6, 2], [8, 8]],
    [[0, 4], [4, 4], [8, 4], [12, 4]],
    [[0, 6], [6, 6], [12, 4]],
  ],
  12: [
    [[0, 3], [3, 3], [6, 6]],
    [[0, 2], [2, 1], [3, 3], [6, 3], [9, 3]],
    [[0, 6], [6, 6]],
    [[0, 3], [3, 2], [5, 1], [6, 6]],
    [[0, 1], [1, 1], [2, 1], [3, 3], [6, 6]],
    [[0, 4], [4, 2], [6, 6]],
  ],
};
const CADENCES = {
  16: [[[0, 4], [4, 12]], [[0, 16]], [[0, 6], [6, 2], [8, 8]], [[0, 8], [8, 8]]],
  12: [[[0, 12]], [[0, 6], [6, 6]], [[0, 3], [3, 9]]],
};
const longRhythm = (r) => r.length <= 3;

/** 1 フレーズ（2 小節）の旋律。phrase = パスの中の何番目のフレーズか */
function phraseNotes(th, pos0, pos1, base) {
  const L = th.lead;
  const steps = th.steps;
  const RH = RHYTHMS[steps] || RHYTHMS[16];
  const CA = CADENCES[steps] || CADENCES[16];
  const phraseIdx = Math.floor(pos0.barInPass / 2);
  const phrasesInPass = Math.ceil(pos0.passLen / 2);
  const isLast = phraseIdx === phrasesInPass - 1;
  // フレーズ 0 と 2 は同じ動機（くり返し）、1 と 3 は別の動機
  const motifKey = `${th.id}:${pos0.sec}:${phraseIdx % 2}`;
  const mr = new Rand(hash32(motifKey));
  const pr = new Rand(hash32(`${motifKey}:${phraseIdx}:${pos0.occ}`));
  const dens = L.density ?? 0.5;
  // 休むフレーズ（呼びかけと応答）
  if (!isLast && pr.next() < (1 - dens) * 0.45) return [];
  const pickRhythm = (r) => {
    const pool = dens < 0.4 ? RH.filter(longRhythm) : dens > 0.6 ? RH.filter((x) => !longRhythm(x)) : RH;
    return (pool.length ? pool : RH)[Math.floor(r.next() * (pool.length || RH.length))];
  };
  const r1 = pickRhythm(mr);
  const r2 = isLast ? CA[Math.floor(pr.next() * CA.length)] : pickRhythm(mr);
  const contour = Array.from({ length: 16 }, () => mr.pick([-2, -1, -1, -1, 0, 1, 1, 1, 2, 3, -3]));
  const N = degLen(th);
  const out = [];
  let deg = base + mr.pick([0, 2, 4, 4]);
  let k = 0;
  const bars = [[pos0, r1], [pos1, r2]];
  bars.forEach(([pos, rh], bi) => {
    if (!pos) return;
    const chord = chordDegs(th, pos.degree);
    for (const [s, len] of rh) {
      let d = deg + contour[k++ % contour.length];
      const strong = s === 0 || s === steps / 2;
      if (strong || (bi === 1 && isLast)) {
        // 拍の頭は和音の音へ
        let best = d; let bd = 99;
        const o0 = Math.floor(base / N);
        for (let o = o0 - 1; o <= o0 + 2; o++) for (const c of chord) { const cd = (((c % N) + N) % N) + o * N; const dist = Math.abs(cd - d); if (dist < bd) { bd = dist; best = cd; } }
        d = best;
      }
      if (d > base + N + 1) d -= N;
      if (d < base - 3) d += N;
      deg = d;
      out.push({ bar: bi, step: s, len, deg: d });
    }
  });
  // 最後のフレーズは主音（和音の根音）で終える
  if (isLast && out.length) { const lastN = out[out.length - 1]; const r0 = (((pos1 || pos0).degree % N) + N) % N; let best = lastN.deg; let bd = 99; for (let o = Math.floor(base / N) - 1; o <= Math.floor(base / N) + 2; o++) { const c = r0 + o * N; if (Math.abs(c - lastN.deg) < bd) { bd = Math.abs(c - lastN.deg); best = c; } } lastN.deg = best; }
  return out;
}

// ---------------------------------------------------------------- 1 小節の音符
const VEL = { X: 1, x: 0.75, o: 0.4 };

/**
 * b 小節目の音符。戻り値: { pos, pad: [MIDI...], chordStart, events: [{ step, kind: 'note'|'drum', layer, inst, midi?, vel, rate? }] }
 */
export function composeBar(th, b) {
  const pos = barPos(th, b);
  const inf = themeInfo(th);
  const steps = th.steps;
  const spb = steps / th.meter; // 1 拍の刻み
  const rng = new Rand(hash32(`${th.id}:bar:${pos.intro ? `i${b}` : pos.lb}`));
  const ev = [];
  const chord = chordNotes(th, pos.degree);
  // ---- 低音
  if (th.bass && !pos.intro) {
    const r = bassRoot(th, pos.degree);
    const fifth = r + (scaleNote(th, pos.degree + 4) - scaleNote(th, pos.degree));
    const third = r + (scaleNote(th, pos.degree + 2) - scaleNote(th, pos.degree));
    const add = (step, midi, vel) => ev.push({ step, kind: 'note', layer: 'bass', inst: th.bass.inst, midi, vel });
    switch (th.bass.pattern) {
      case 'root': if (pos.chordStart) add(0, r, 0.9); else add(0, r, 0.6); break;
      case 'rootFifth': add(0, r, 0.9); add(steps / 2, rng.chance(0.3) ? r + 12 : fifth, 0.7); break;
      case 'pulse8': for (let s = 0; s < steps; s += spb / 2) add(s, (s === spb * 1.5 || s === spb * 3.5) && rng.chance(0.5) ? r + 12 : r, s % spb === 0 ? 0.85 : 0.55); break;
      case 'ostinato': {
        const seq = [r, r, r + 12, r, fifth, r, third + 12, fifth];
        for (let i = 0; i < 8; i++) { const s = Math.round((i * steps) / 8); add(s, seq[i], i % 2 ? 0.55 : 0.85); }
        break;
      }
      case 'walk': [r, third, fifth, r + (rng.chance(0.5) ? 10 : 11)].forEach((m, i) => add(i * spb, m, i ? 0.6 : 0.85)); break;
      default: add(0, r, 0.8);
    }
  }
  // ---- 分散和音
  if (th.arp) {
    const A = th.arp;
    const center = th.key + 12 + 12 * (A.oct || 0);
    const pool = [];
    for (const n of chord) { const x = near(n, center + 3); pool.push(x, x + 12); }
    pool.sort((a, b2) => a - b2);
    const every = Math.max(1, Math.round(spb / (A.rate || 2)));
    const dens = (A.density ?? 0.8) * (pos.intro ? 0.5 : 1);
    let k = 0;
    for (let s = 0; s < steps; s += every, k++) {
      if (rng.next() > dens) continue;
      let idx;
      const L = pool.length;
      switch (A.pattern) {
        case 'down': idx = L - 1 - (k % L); break;
        case 'updown': { const p = k % (2 * L - 2); idx = p < L ? p : 2 * L - 2 - p; break; }
        case 'broken': idx = [0, 2, 1, 3, 2, 4, 3, 5][k % 8] % L; break;
        case 'random': idx = Math.floor(rng.next() * L); break;
        default: idx = k % L;
      }
      ev.push({ step: s, kind: 'note', layer: 'arp', inst: A.inst, midi: pool[idx], vel: (s % spb === 0 ? 0.8 : 0.55) * (0.9 + rng.next() * 0.2) });
    }
  }
  // ---- 旋律
  if (th.lead && !pos.intro && pos.barInPass >= 0 && pos.lb >= (th.lead.from || 0)) {
    const first = pos.barInPass % 2 === 0;
    const pos0 = first ? pos : barPos(th, b - 1);
    const pos1 = first ? (pos.barInPass + 1 < pos.passLen ? barPos(th, b + 1) : null) : pos;
    if (pos0 && !pos0.intro) {
      const baseDeg = degLen(th) * (1 + (th.lead.oct ?? 1)) - 2; // 中心より少し下から
      const notes = phraseNotes(th, pos0, pos1, baseDeg);
      for (const n of notes) {
        if (n.bar !== (first ? 0 : 1)) continue;
        ev.push({ step: n.step, kind: 'note', layer: 'lead', inst: th.lead.inst, midi: scaleNote(th, n.deg), vel: (n.step === 0 ? 0.85 : 0.7) * (0.9 + rng.next() * 0.15), len: n.len });
      }
    }
  }
  // ---- 打楽器
  if (th.drums && !pos.intro) {
    const pat = DRUM_PATTERNS[th.drums.pattern] || {};
    const fillBar = th.drums.fill && pos.lb % 4 === 3;
    const fillFrom = Math.floor(steps * 0.75);
    for (const [inst, spec] of Object.entries(pat)) {
      const p = typeof spec === 'string' ? spec : spec.p;
      const every = typeof spec === 'string' ? 1 : (spec.every || 1);
      if (pos.lb % every !== 0) continue;
      for (let s = 0; s < steps; s++) {
        const c = p[s % p.length];
        const v = VEL[c];
        if (!v) continue;
        if (fillBar && s >= fillFrom && inst !== 'kick' && inst !== 'shaker') continue;
        ev.push({ step: s, kind: 'drum', layer: 'drums', inst, vel: v * (0.92 + rng.next() * 0.12) });
      }
    }
    if (fillBar) {
      const step = steps === 12 ? 1 : (pos.lb % 8 === 7 ? 1 : 2);
      for (let s = fillFrom, i = 0; s < steps; s += step, i++) ev.push({ step: s, kind: 'drum', layer: 'drums', inst: th.drums.fill, vel: 0.5 + 0.12 * i, rate: 1 + (th.drums.fill === 'tom' ? i * 0.06 : 0) });
    }
    if (th.drums.accent && pos.lb === 0) ev.push({ step: 0, kind: 'drum', layer: 'drums', inst: th.drums.accent, vel: 0.8 });
  }
  // ---- 環境音
  const sp = th.amb?.sprinkle;
  if (sp) {
    const n = Math.floor(sp.rate) + (rng.next() < sp.rate % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) ev.push({ step: Math.floor(rng.next() * steps), kind: 'drum', layer: 'amb', inst: sp.inst, vel: 0.5 + rng.next() * 0.5, rate: 0.8 + rng.next() * 0.45 });
  }
  return { pos, pad: padVoicing(th, pos.degree), chordStart: pos.chordStart, events: ev, info: inf };
}

/** その曲で使う楽器の音（前もって作っておく物）の一覧 */
export function themeNeeds(th) {
  const inf = themeInfo(th);
  const notes = new Set(); const drums = new Set();
  for (let b = 0; b < inf.intro + inf.loopBars; b++) {
    for (const e of composeBar(th, b).events) {
      if (e.kind === 'note') notes.add(`${e.inst}@${rootFor(e.midi)}`);
      else drums.add(e.inst);
    }
  }
  return { notes: [...notes].map((k) => { const [inst, r] = k.split('@'); return { inst, root: Number(r) }; }), drums: [...drums] };
}

// ---------------------------------------------------------------- 今の場面に合う曲
const FINAL_ZONE = 'a10z5';

/** 地域 ID → 章の曲（地域がまだ無い章は ID の数字から推測） */
export function actThemeForZone(zoneId) {
  const z = ZONE[zoneId];
  let act = z?.act;
  if (!act) { const m = /^a(\d+)z/.exec(String(zoneId || '')); if (m) act = `act${m[1]}`; }
  return THEME[act] ? act : 'act1';
}

/** 戦っているボスに合う曲 */
export function bossThemeFor(u, zoneId) {
  if (!u) return 'boss';
  if (u.final || u.defId === 'boss_abyss_king' || (zoneId === FINAL_ZONE && (u.rank === 'actboss' || u.actBoss))) return 'boss_final';
  if (u.rank === 'actboss' || u.actBoss || u.uber || u.gatekeeper) return 'boss_act';
  return 'boss';
}

/** ゲームの状態から、今流すべき曲 */
export function themeForState(game) {
  const st = game?.state;
  if (!st || !game.started) return 'title';
  const w = st.world || {};
  const units = game.combat?.units || [];
  let boss = null;
  for (const u of units) if (u.boss && !u.dead && u.team !== 'hero') { boss = u; break; }
  if (!boss && game.sys?.world?.isBossStage?.() && game.sys.world.bossUnit === null && game.sys.world.wave === 0) {
    // ボスの面が始まった直後（まだ出ていない）
    const z = ZONE[w.zone];
    return z && z.zoneIdx === 4 ? (w.zone === FINAL_ZONE ? 'boss_final' : 'boss_act') : 'boss';
  }
  if (boss) return bossThemeFor(boss, w.zone);
  if (w.mode === 'rift') return 'rift';
  if (w.mode && w.mode !== 'campaign' && THEME[w.mode]) return w.mode;
  return actThemeForZone(w.zone);
}
