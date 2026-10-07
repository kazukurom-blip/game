// 船の旅（島 → 港）の曲「波間の航路」。オリジナル曲。
// 波に揺られて、わくわく。笛がゆったり 6/8 で歌い、ギターの分散和音とアコーディオンが波のように付いてくる。
// G 長調・6/8・付点 4 分 = 66。8 分音符を 1 拍として書く（beatsPerBar 6・bpm 198）。
//   → 長さの文字は q = 8 分、h = 4 分、h. = 付点 4 分、w. = 1 小節。
// イントロ 2 小節 → A 16 → B 8（E 短調。アコーディオンが歌う）→ A' 16。ループ 40 小節 ≒ 72.7 秒。
import { K6 } from './_kit.js';

const A_CHORDS = ['G', 'G', 'C', 'D', 'Em', 'C', 'A7', 'D',
  'G', 'Bm', 'Cmaj7', 'G/B', 'Am7', 'D7', 'G', 'D7'];
const R = 'r:w.';
const A_MEL = [
  'D5:h B4:q G4:h.',
  'A4:q B4:q D5:q G5:h.',
  'E5:h. G5:h E5:q',
  'F#5:h. D5:h.',
  'B4:h E5:q G5:h F#5:q',
  'E5:h C5:q G4:h.',
  'A4:q C#5:q E5:q G5:h E5:q',
  'F#5:w.',
  'D5:h B4:q G4:h.',
  'F#4:q A4:q B4:q D5:h.',
  'E5:h. B5:h G5:q',
  'A5:h G5:q D5:h.',
  'C5:h E5:q A5:h G5:q',
  'F#5:h. C5:h A4:q',
  'B4:h D5:q G5:h.',
  'r:h. D5:q E5:q F#5:q',
];

export default {
  id: 'ship',
  title: '波間の航路',
  bpm: 198,
  beatsPerBar: 6,
  key: 'G major',
  meter: '6/8',
  seed: 6101,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 92], vol: 0.95, pan: 0.1, rev: 0.3 },
    acc: { inst: 'accordion', range: [52, 84], voiceLo: 55, vol: 0.55, pan: 0.3, rev: 0.25 },
    guitar: { inst: 'guitar', range: [40, 76], voiceLo: 52, vol: 0.7, pan: -0.3, rev: 0.2, human: 0.008 },
    bell: { inst: 'bell', range: [72, 100], voiceLo: 79, vol: 0.3, pan: 0.4, rev: 0.45 },
    bass: { inst: 'bass', range: [31, 55], vol: 0.55, pan: 0.0, rev: 0.05 },
    drums: { inst: 'drums', vol: 0.45, pan: 0.0, rev: 0.15 },
  },
  patterns: {
    ...K6,
    bellWave: { kind: 'arp', steps: [[3, 4, 2, 0.5], [5, 5, 1, 0.4]] },
  },
  // 1 小節 = 16 分 × 12
  drumPatterns: {
    intro: { shaker: 'o...o...o...', tri: ['x...........', '............'] },
    A: { kick: 'x.....x.....', shaker: 'o.o.o.o.o.o.', block: '....o.....o.' },
    B: { kick: 'x...........', shaker: 'o...o...o...', tri: ['x...........', '............', '............', '............'] },
    A2: {
      kick: 'x.....x.....',
      shaker: 'o.o.o.o.o.o.',
      tamb: '......o.....',
      crash: (bi) => (bi === 0 ? 'x...........' : '............'),
    },
  },
  sections: {
    intro: {
      chords: ['G', 'D7'],
      gen: { guitar: 'arp68', bass: 'bass68' },
      drums: 'intro',
      parts: { bell: ['D6:h. B5:h.', 'A5:h. F#5:h.'], flute: [R, 'r:h. D5:q E5:q F#5:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { guitar: 'arp68', bass: 'bass68', acc: 'chuck68' },
      drums: 'A',
      mix: { acc: 0.7 },
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Em', 'Em', 'Am', 'Am', 'C', 'D', 'Bm7', 'B7'],
      gen: { guitar: 'arp68', bass: 'bass68w', bell: 'bellWave' },
      drums: 'B',
      parts: {
        acc: [
          'G4:h. B4:h.',
          'E5:h. D5:h B4:q',
          'C5:h. E5:h.',
          'A5:h. G5:h E5:q',
          'G5:h. E5:h C5:q',
          'F#5:h. A5:h F#5:q',
          'D5:h B4:q F#5:h D5:q',
          'D#5:h. r:h.',
        ],
        flute: [R, R, R, R, R, R, R, 'r:h. D5:q E5:q F#5:q'],
      },
      mix: { acc: 1.5 },
    },
    A2: {
      chords: A_CHORDS,
      gen: { guitar: 'arp68', bass: 'bass68w', acc: 'chuck68', bell: 'bellWave' },
      drums: 'A2',
      mix: { acc: 0.75 },
      parts: { flute: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
