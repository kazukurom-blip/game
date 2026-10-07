// ブリーズ港（V100）の曲「潮風の港」。オリジナル曲。
// 港の活気と潮風、旅立ち。アコーディオンが 6/8 で揺れる旋律を弾き、港の鐘（ベル）とギター、タンバリン。
// A 長調・6/8・付点 4 分 = 76。ここでは 8 分音符を 1 拍として書く（beatsPerBar 6・bpm 228）。
//   → 長さの文字は q = 8 分、h = 4 分、h. = 付点 4 分、w. = 1 小節、e = 16 分。
// イントロ 4 小節 → A 16 → B 8 → A' 16 → C 8（→ A へ戻る）。ループ 48 小節 ≒ 75.8 秒。

const A_CHORDS = ['A', 'A', 'D', 'E', 'F#m', 'D', 'B7', 'E',
  'A', 'C#m', 'D', 'B7', 'A/E F#m', 'D E', 'A', 'E7'];
const R = 'r:w.';
const A_MEL = [
  'E5:h C#5:q A4:h C#5:q',
  'E5:h. A5:h.',
  'F#5:h E5:q D5:h F#5:q',
  'B4:h. G#4:h B4:q',
  'C#5:h A4:q C#5:h F#5:q',
  'A5:h F#5:q D5:h.',
  'D#5:h F#5:q A5:h F#5:q',
  'G#5:h. E5:h.',
  'E5:h C#5:q A4:h C#5:q',
  'E5:h G#5:q C#6:h.',
  'B5:h A5:q F#5:h D5:q',
  'D#5:h. F#5:h.',
  'E5:h A5:q F#5:h C#5:q',
  'D5:h F#5:q E5:h G#5:q',
  'A5:w.',
  'r:h. E5:q F#5:q G#5:q',
];

export default {
  id: 'town_port',
  title: '潮風の港',
  bpm: 228,
  beatsPerBar: 6,
  key: 'A major',
  meter: '6/8',
  seed: 1100,
  tracks: {
    acc: { inst: 'accordion', melody: true, range: [55, 86], vol: 0.9, pan: 0.08, rev: 0.22 },
    bell: { inst: 'bell', range: [69, 100], vol: 0.4, pan: 0.4, rev: 0.4 },
    guitar: { inst: 'guitar', range: [40, 76], voiceLo: 55, vol: 0.68, pan: -0.32, rev: 0.18, human: 0.01 },
    strings: { inst: 'strings', range: [55, 81], voiceLo: 61, vol: 0.32, pan: -0.1, rev: 0.4 },
    bass: { inst: 'bass', range: [33, 52], vol: 0.55, pan: 0.0, rev: 0.04, human: 0.006 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.14 },
  },
  patterns: {
    bass68: { kind: 'bass', steps: [[0, 'R', 2.6, 1], [3, '5', 1.8, 0.75], [5, '>', 0.9, 0.5]] },
    bassDot: { kind: 'bass', steps: [[0, 'R', 2.8, 0.95], [3, '5', 2.8, 0.75]] },
    arp68: { kind: 'arp', steps: [[0, 0, 1.6, 0.9], [1, 2, 1, 0.55], [2, 3, 1, 0.6], [3, 1, 1.6, 0.8], [4, 2, 1, 0.55], [5, 3, 1, 0.6]] },
    arpDot: { kind: 'arp', steps: [[0, 1, 3, 0.8], [3, 3, 3, 0.65]] },
    hold: { kind: 'hold', voices: 3, vel: 0.85 },
  },
  // 1 小節 = 16 分 × 12
  drumPatterns: {
    intro: { shaker: 'o.o.o.o.o.o.', tri: ['x...........', '............', 'o...........', '............'] },
    A: { kick: 'x.....x.....', tamb: '..o.o...o.o.', shaker: 'o.o.o.o.o.o.' },
    B: { kick: 'x...........', shaker: 'o.o.o.o.o.o.', tri: ['x...........', '............'] },
    A2: {
      kick: 'x.....x...o.',
      tamb: '..o.o...o.o.',
      shaker: 'o.o.o.o.o.o.',
      snare: '......o.....',
      crash: (bi) => (bi === 0 ? 'x...........' : '............'),
    },
    C: {
      kick: 'x.....x.....',
      tamb: (bi) => (bi === 7 ? '..o.o.o.o.oo' : '......o.....'),
      shaker: 'o.o.o.o.o.o.',
    },
  },
  sections: {
    intro: {
      chords: ['A', 'D', 'A/E', 'E7'],
      gen: { guitar: 'arpDot', bass: 'bassDot' },
      drums: 'intro',
      parts: {
        bell: ['E6:h. A6:h.', 'F#6:h. D6:h.', 'C#6:h. E6:h.', 'D6:h. B5:h.'],
        acc: [R, R, R, 'r:h. E5:q F#5:q G#5:q'],
      },
    },
    A: {
      chords: A_CHORDS,
      gen: { guitar: 'arp68', bass: 'bass68' },
      drums: 'A',
      parts: { acc: A_MEL, bell: [R, R, R, R, R, R, R, 'r:h. B5:h E6:q', R, R, R, R, R, R, 'r:h. E6:q C#6:q A5:q', R] },
    },
    B: {
      chords: ['D', 'D', 'A', 'A', 'Bm7', 'E', 'C#m7 F#m', 'B7 E7'],
      gen: { guitar: 'arpDot', bass: 'bassDot', strings: 'hold' },
      drums: 'B',
      parts: {
        acc: [
          'F#5:h. A5:h.',
          'B5:h A5:q F#5:h.',
          'E5:h. C#5:h.',
          'A4:w.',
          'D5:h F#5:q A5:h B5:q',
          'G#5:h. E5:h.',
          'E5:h G#5:q A5:h C#6:q',
          'B5:h A5:q G#5:h E5:q',
        ],
        bell: ['r:h. D6:h F#6:q', 'A6:h. r:h.', 'r:h. C#6:h E6:q', 'A6:h. r:h.', 'r:h. D6:h F#6:q', 'B6:h. r:h.', R, R],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { guitar: 'arp68', bass: 'bass68', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.7 },
      parts: {
        acc: A_MEL,
        bell: ['A6:h. r:h.', R, 'F#6:h. r:h.', R, 'C#6:h. r:h.', R, 'D#6:h. r:h.', R, 'A6:h. r:h.', R, 'F#6:h. r:h.', R, R, R, 'A6:h. E6:h.', R],
      },
    },
    C: {
      chords: ['F#m', 'D', 'A', 'E', 'F#m', 'D', 'E', 'E7'],
      gen: { guitar: 'arp68', bass: 'bass68', strings: 'hold' },
      drums: 'C',
      parts: {
        acc: [
          'C#6:h. A5:h.',
          'F#5:h A5:q D6:h.',
          'C#6:h B5:q A5:h.',
          'G#5:h. B5:h.',
          'A5:h F#5:q C#5:h F#5:q',
          'A5:h. F#5:h D5:q',
          'E5:h. G#5:h.',
          'B5:h. r:h.',
        ],
        bell: [R, R, R, 'r:h. E6:h B5:q', R, R, R, 'r:h. E6:q C#6:q B5:q'],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'C'] },
};
