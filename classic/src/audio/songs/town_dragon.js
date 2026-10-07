// 竜の背の村（D100）の曲「竜の背の村」。オリジナル曲。
// 大きな空と骨の村、雄大。大太鼓とティンパニがゆっくり鳴り、笛が低めの所で長い音を吹く。
// B ではストリングスが G♭（半音上の明るい和音）を通って大きく歌う。低いピチカートが分散和音。
// F 短調・4/4・86 BPM。イントロ 2 → A 16 → B 8（A♭ 長調寄り）→ A' 8。ループ 32 小節 ≒ 89.3 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Fm', 'Fm', 'Db', 'Eb', 'Fm', 'Ab', 'Bbm', 'C',
  'Fm', 'Eb', 'Db', 'C', 'Bbm', 'Db', 'C7sus4 C7', 'Fm'];
const R = 'r:w';
const A_MEL = [
  'C5:h. Eb5:q',
  'F5:q. Eb5:e C5:h',
  'Ab4:q. Bb4:e C5:q F5:q',
  'Eb5:h. r:q',
  'F5:q. G5:e Ab5:q C6:q',
  'Bb5:h Ab5:q Eb5:q',
  'F5:q. Db5:e Bb4:q Db5:q',
  'C5:w',
  'C5:h. Eb5:q',
  'G5:q. F5:e Eb5:h',
  'F5:q. Ab5:e Db6:q C6:q',
  'Bb5:h G5:h',
  'Db6:q. C6:e Bb5:q F5:q',
  'Ab5:h F5:q Db5:q',
  'F5:h E5:h',
  'F5:h. r:q',
];

export default {
  id: 'town_dragon',
  title: '竜の背の村',
  bpm: 86,
  beatsPerBar: 4,
  key: 'F minor',
  seed: 7212,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [55, 88], vol: 1.0, pan: 0.1, rev: 0.4 },
    lead: { inst: 'strings', range: [58, 88], vol: 0.95, pan: -0.05, rev: 0.4 },
    strings: { inst: 'strings', range: [43, 72], voiceLo: 48, vol: 0.42, pan: -0.25, rev: 0.45 },
    horn: { inst: 'brass', range: [48, 72], voiceLo: 51, vol: 0.4, pan: 0.25, rev: 0.4 },
    pizz: { inst: 'pizz', range: [41, 74], voiceLo: 48, vol: 0.55, pan: 0.3, rev: 0.25 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.55, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.6, pan: 0.0, rev: 0.3 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { taiko: ['x...............', 'x.......x.....x.'], timp: ['........x.......', '................'] },
    A: { taiko: 'x.............x.', tomlo: '........x.......', shaker: '....o.......o...' },
    B: { taiko: 'x.......x.......', timp: (bi) => (bi === 7 ? 'x.x.x.x.x.x.x.x.' : '....x.......x...'), crash: (bi) => (bi === 0 ? 'x...............' : '................') },
    A2: { taiko: 'x.....x.......x.', tomlo: '........x...x...', tom: '..........x.....', shaker: 'o...o...o...o...' },
  },
  sections: {
    intro: {
      chords: ['Fm', 'C7sus4'],
      gen: { strings: 'hold', bass: 'bassLong' },
      drums: 'intro',
      parts: { flute: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { strings: 'hold', pizz: 'arpQ', bass: 'bass2' },
      drums: 'A',
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Db', 'Eb', 'Cm', 'Fm', 'Db', 'Eb', 'Gb', 'C'],
      gen: { strings: 'hold', horn: 'hold', pizz: 'arp8', bass: 'bass2w' },
      drums: 'B',
      parts: { lead: ['Ab5:h. F5:q', 'G5:h Bb5:h', 'G5:h. Eb5:q', 'F5:h C5:h', 'Db5:q F5:q Ab5:q Db6:q', 'Bb5:h G5:h', 'Bb5:h. Db6:q', 'C6:h E5:h'] },
    },
    A2: {
      chords: A_CHORDS.slice(0, 8),
      gen: { strings: 'hold', horn: 'hold', pizz: 'arpQ', bass: 'bass2w' },
      drums: 'A2',
      mix: { horn: 0.7 },
      parts: { flute: A_MEL.slice(0, 8) },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
