// ガルド岩台（V400）の曲「岩台の太鼓」。オリジナル曲。
// 乾いた風、勇ましい。低い太鼓とタムが大きく刻み、笛が低めの所でドリア（B の明るい 6 度）の旋律を吹く。
// B ではストリングスが歌い、A' でホルン風の金管が厚みを足す。
// D ドリア・4/4・92 BPM。イントロ 2 → A 16 → B 8（A 短調寄り）→ A' 8。ループ 32 小節 ≒ 83.5 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Dm', 'C/D', 'Dm', 'G/D', 'Dm', 'F', 'C', 'Dm',
  'Bb', 'C', 'Dm', 'G', 'Bb', 'C', 'Dm', 'Dm'];
const R = 'r:w';
const A_MEL = [
  'D5:q. E5:e F5:q A5:q',
  'G5:h E5:q C5:q',
  'D5:q. E5:e F5:q D5:q',
  'B4:h. r:q',
  'A5:q. G5:e F5:q A5:q',
  'C6:h A5:q F5:q',
  'G5:q E5:q C5:q E5:q',
  'D5:h. r:q',
  'F5:q. G5:e F5:q D5:q',
  'E5:q. F5:e G5:q C5:q',
  'A5:q. Bb5:e A5:q F5:q',
  'B5:h G5:q D5:q',
  'D6:q. C6:e Bb5:q F5:q',
  'G5:q. A5:e G5:q E5:q',
  'F5:q E5:q D5:q A4:q',
  'D5:h. r:q',
];

export default {
  id: 'town_gard',
  title: '岩台の太鼓',
  bpm: 92,
  beatsPerBar: 4,
  key: 'D dorian',
  seed: 6606,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [57, 90], vol: 1.0, pan: 0.1, rev: 0.3 },
    lead: { inst: 'strings', range: [57, 86], vol: 0.9, pan: -0.05, rev: 0.35 },
    horn: { inst: 'brass', range: [48, 72], voiceLo: 50, vol: 0.45, pan: 0.25, rev: 0.35 },
    strings: { inst: 'strings', range: [45, 74], voiceLo: 50, vol: 0.4, pan: -0.25, rev: 0.4 },
    pizz: { inst: 'pizz', range: [45, 76], voiceLo: 50, vol: 0.5, pan: 0.3, rev: 0.2 },
    bass: { inst: 'bass', range: [26, 50], vol: 0.6, pan: 0.0, rev: 0.05 },
    drums: { inst: 'drums', vol: 0.6, pan: 0.0, rev: 0.2 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { taiko: ['x.......x.......', 'x.......x...x.x.'] },
    A: { taiko: 'x.......x.......', tom: '......x.......x.', tomlo: '..........x.....', shaker: 'o.o.o.o.o.o.o.o.' },
    B: { taiko: 'x...............', timp: (bi) => (bi === 7 ? 'x.x.x.x.x.x.x.x.' : '........x.......'), shaker: 'o...o...o...o...' },
    A2: {
      taiko: 'x.......x.......',
      tom: '......x...x...x.',
      tomlo: '..x.......x.....',
      snare: '....o.......o...',
      shaker: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Dm', 'C/D'],
      gen: { bass: 'bassLong', strings: 'hold' },
      drums: 'intro',
      parts: { flute: [R, 'r:h. A4:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { pizz: 'arpQ', bass: 'bass2w', strings: 'hold' },
      drums: 'A',
      mix: { strings: 0.7 },
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Am', 'G', 'F', 'G', 'Am', 'G', 'Bbmaj7', 'A'],
      gen: { pizz: 'arp8', bass: 'bass2', horn: 'hold' },
      drums: 'B',
      parts: {
        lead: ['E5:h. A5:q', 'G5:h D5:h', 'F5:h. C5:q', 'D5:h B4:h', 'C5:q E5:q A5:q C6:q', 'B5:h G5:h', 'A5:q F5:q D5:q F5:q', 'E5:h C#5:h'],
        flute: [R, R, R, R, R, R, R, 'r:h. A4:q'],
      },
    },
    A2: {
      chords: A_CHORDS.slice(0, 8),
      gen: { pizz: 'arpQ', bass: 'bass2w', strings: 'hold', horn: 'hold' },
      drums: 'A2',
      parts: { flute: A_MEL.slice(0, 8) },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
