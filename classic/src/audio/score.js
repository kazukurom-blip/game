// 楽譜のデータを「いつ・どの楽器で・どの高さを・どれだけ」鳴らすかの一覧に変える。
// DOM も Web Audio も使わない純粋な関数だけ（Node のテストからも読む）。
//
// 書き方（1 小節 = 1 つの文字列。音符は空白で区切る）
//   "F#5:q. A5:e D6:q C#6:e B5:e"
//   高さ: C4 = 60（中央のド）。# と b が使える。休符は r。
//   長さ: w=4 拍, h=2, q=1, e=0.5, s=0.25。後ろに . で付点（×1.5）、t で 3 連（×2/3）。
//   ~ を長さの後ろに付けると次の音符とつなぐ（同じ高さのとき）。
//   1 小節に和音を 2 つ書くときは "D/A A7" のように空白で区切る（小節を等分）。

export const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`音の名前が読めない: ${name}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiToName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function parseDur(s) {
  const m = /^([whqes])(\.?)(t?)(~?)$/.exec(s);
  if (!m) throw new Error(`長さが読めない: ${s}`);
  let b = DUR[m[1]];
  if (m[2]) b *= 1.5;
  if (m[3]) b *= 2 / 3;
  return { beats: b, tie: !!m[4] };
}

// 1 小節の文字列 → [{ pos, beats, midi|null, tie }]
export function parseBar(str) {
  const out = [];
  let pos = 0;
  for (const tok of str.trim().split(/\s+/).filter(Boolean)) {
    const [p, d] = tok.split(':');
    if (!d) throw new Error(`長さが無い: ${tok}`);
    const { beats, tie } = parseDur(d);
    out.push({ pos, beats, midi: p === 'r' ? null : noteToMidi(p), tie });
    pos += beats;
  }
  return out;
}
export const barBeats = (str) => parseBar(str).reduce((s, n) => s + n.beats, 0);

// ---------------------------------------------------------------- 和音
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14],
  dim: [0, 3, 6], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
};
export function parseChord(sym) {
  const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(sym);
  if (!m || !(m[3] in QUAL)) throw new Error(`和音が読めない: ${sym}`);
  const acc = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const root = (PC[m[1]] + acc(m[2]) + 12) % 12;
  const bass = m[4] ? (PC[m[4]] + acc(m[5]) + 12) % 12 : root;
  return { sym, root, bass, iv: QUAL[m[3]], pcs: QUAL[m[3]].map((i) => (root + i) % 12) };
}
// 小節の和音の並び → [{ pos, beats, chord }]
export function chordSpans(barStr, beatsPerBar) {
  const syms = barStr.trim().split(/\s+/);
  const len = beatsPerBar / syms.length;
  return syms.map((s, i) => ({ pos: i * len, beats: len, chord: parseChord(s) }));
}
// pc を lo 以上で一番低い高さに
const atLeast = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;
// 下から積んだ和音（lo 以上、ルートは省けるときは省く）
export function voicing(chord, lo, n = 4) {
  let pcs = chord.pcs.slice();
  if (pcs.length > n) pcs = pcs.filter((_, i) => i !== 0); // 4 和音以上は根音を省く（ベースが弾く）
  return pcs.map((pc) => atLeast(pc, lo)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------- 決まった乱数（毎回同じ「人の揺れ」）
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- 伴奏の型
// bass:   [拍の位置, 'R'|'5'|'3'|'8'|'>'(次の和音へ半音で近づく), 長さ(拍), 強さ]
// arp:    [拍の位置, 和音の何番目の音(0=一番下のベース音, 1..=上の音), 長さ, 強さ]
// chord:  [拍の位置, 長さ, 強さ] で和音をまとめて鳴らす
// hold:   和音を伸ばす（各和音の長さだけ）
function bassNote(kind, span, nextSpan, lo) {
  const r = atLeast(span.chord.bass, lo);
  if (kind === 'R') return r;
  if (kind === '8') return r + 12;
  if (kind === '5') { const f = atLeast((span.chord.root + 7) % 12, lo); return f; }
  if (kind === '3') return atLeast(span.chord.pcs[1], lo);
  if (kind === '>') { const n = atLeast((nextSpan || span).chord.bass, lo); return n - 1 >= lo ? n - 1 : n + 1; }
  throw new Error(`ベースの型が読めない: ${kind}`);
}

// 1 区間（セクション）の 1 パートを音符の一覧にする（拍で）
export function expandPart(song, sec, partName) {
  const bpb = song.beatsPerBar;
  const track = song.tracks[partName];
  const notes = [];
  const explicit = sec.parts?.[partName];
  if (explicit) {
    explicit.forEach((bar, bi) => {
      let prev = null;
      for (const n of parseBar(bar)) {
        if (n.midi == null) { prev = null; continue; }
        if (prev && prev.tie && prev.midi === n.midi) { prev.beats += n.beats; prev.tie = n.tie; continue; }
        prev = { beat: bi * bpb + n.pos, beats: n.beats, midi: n.midi, vel: 1, tie: n.tie };
        notes.push(prev);
      }
    });
    // 小節をまたぐ ~ をつなぐ
    for (let i = notes.length - 1; i > 0; i--) {
      const a = notes[i - 1], b = notes[i];
      if (a.tie && a.midi === b.midi && Math.abs(a.beat + a.beats - b.beat) < 1e-6) { a.beats += b.beats; notes.splice(i, 1); }
    }
    return notes;
  }
  const style = sec.gen?.[partName];
  if (!style) return notes;
  const pat = song.patterns[style];
  if (!pat) throw new Error(`伴奏の型が無い: ${style}`);
  const spans = [];
  sec.chords.forEach((c, bi) => chordSpans(c, bpb).forEach((s) => spans.push({ ...s, beat: bi * bpb + s.pos })));
  const spanAt = (beat) => { let k = 0; for (let i = 0; i < spans.length; i++) if (spans[i].beat <= beat + 1e-6) k = i; return k; };
  const lo = track.range[0];
  const vLo = track.voiceLo ?? lo;
  if (pat.kind === 'hold') {
    for (const s of spans) for (const m of voicing(s.chord, vLo, pat.voices || 4)) notes.push({ beat: s.beat, beats: s.beats, midi: m, vel: pat.vel ?? 1 });
    return notes;
  }
  for (let bi = 0; bi < sec.chords.length; bi++) {
    for (const [p, what, len, vel] of pat.steps) {
      const beat = bi * bpb + p;
      const k = spanAt(beat);
      const s = spans[k];
      let midi;
      if (pat.kind === 'chord') { // 和音をまとめて短く（裏拍の「ンチャ」）
        const end = Math.min(beat + what, s.beat + s.beats);
        for (const m of voicing(s.chord, vLo, pat.voices || 3)) notes.push({ beat, beats: Math.max(0.1, end - beat), midi: m, vel: len ?? 1 });
        continue;
      }
      if (pat.kind === 'bass') midi = bassNote(Math.abs(s.beat - beat) < 1e-6 && s.pos > 0 ? 'R' : what, s, spans[k + 1] || spans[0], lo);
      else if (pat.kind === 'arp') {
        const v = voicing(s.chord, vLo, 3);
        const bassM = atLeast(s.chord.bass, lo);
        const pool = [bassM, ...v, ...v.map((x) => x + 12)];
        midi = pool[Math.min(what, pool.length - 1)];
      } else throw new Error(`型の種類が読めない: ${pat.kind}`);
      // 和音の切れ目をまたがない長さに
      const end = Math.min(beat + len, s.beat + s.beats + (pat.kind === 'bass' ? 0 : 2));
      notes.push({ beat, beats: Math.max(0.1, end - beat), midi, vel: vel ?? 1 });
    }
  }
  return notes;
}

// 太鼓: sec.drums = { 楽器名: ['x...x...' (16 分 × 16) を小節ごと、または 1 つで全部] }
// x=強 o=弱 .=無し
export function expandDrums(song, sec) {
  const out = [];
  const bpb = song.beatsPerBar;
  const d = sec.drums ? song.drumPatterns[sec.drums] : null;
  if (!d) return out;
  const nb = sec.chords.length;
  for (const [inst, rows] of Object.entries(d)) {
    for (let bi = 0; bi < nb; bi++) {
      let row = Array.isArray(rows) ? rows[bi % rows.length] : rows;
      if (typeof row === 'function') row = row(bi, nb);
      const steps = row.replace(/\s/g, '');
      const per = bpb / steps.length;
      for (let i = 0; i < steps.length; i++) {
        const ch = steps[i];
        if (ch === '.') continue;
        out.push({ beat: bi * bpb + i * per, beats: per, inst, vel: ch === 'x' ? 1 : ch === 'X' ? 1.25 : 0.55 });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 曲全体
// 返り値: { bpm, secPerBeat, intro: {len, events}, loop: {len, events} }
// event = { t(秒), d(秒), track, inst, midi|null, vel }
export function compileSong(song) {
  const spb = 60 / song.bpm;
  const r = rng(song.seed ?? 1);
  const segment = (names) => {
    const events = [];
    let beat0 = 0;
    for (const name of names) {
      const sec = song.sections[name];
      if (!sec) throw new Error(`区間が無い: ${name}`);
      const nb = sec.chords.length;
      for (const tName of Object.keys(song.tracks)) {
        const tr = song.tracks[tName];
        if (tr.inst === 'drums') continue;
        const mix = (sec.mix?.[tName] ?? 1) * (tr.vol ?? 1);
        if (!mix) continue;
        for (const n of expandPart(song, sec, tName)) {
          const jitter = tr.human ? (r() - 0.5) * tr.human : 0;
          events.push({ t: (beat0 + n.beat) * spb + jitter, d: n.beats * spb * (tr.gate ?? 1), track: tName, inst: tr.inst, midi: n.midi + (tr.transpose || 0), vel: n.vel * mix * (1 + (r() - 0.5) * (tr.velHuman ?? 0.08)) });
        }
      }
      const dt = Object.entries(song.tracks).find(([, t]) => t.inst === 'drums');
      if (dt) {
        const mix = (sec.mix?.[dt[0]] ?? 1) * (dt[1].vol ?? 1);
        for (const h of expandDrums(song, sec)) {
          events.push({ t: (beat0 + h.beat) * spb + (r() - 0.5) * 0.006, d: h.beats * spb, track: dt[0], inst: h.inst, midi: null, vel: h.vel * mix * (1 + (r() - 0.5) * 0.12) });
        }
      }
      beat0 += nb * song.beatsPerBar;
    }
    events.sort((a, b) => a.t - b.t);
    for (const e of events) if (e.t < 0) e.t = 0;
    return { bars: beat0 / song.beatsPerBar, len: beat0 * spb, events };
  };
  return { bpm: song.bpm, secPerBeat: spb, intro: segment(song.order.intro), loop: segment(song.order.loop) };
}
