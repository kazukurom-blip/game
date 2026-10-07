// 大ボス戦（時計塔の魔物・焔の巨像 など）の曲「時を喰らうもの」。オリジナル曲。
// 大きな敵、手に汗。重い大太鼓とティンパニ、合唱風のパッド、16 分で刻むストリングス、金管の旋律。
// 半音上の D の和音（ナポリの和音）をぶつけて不気味さを出す。
// C# 短調・4/4・160 BPM。イントロ 2 小節 → A 16 → B 8 → A' 16 → C 8 → D 8（→ A へ戻る）。ループ 56 小節 = 84 秒。

const A_CHORDS = ['C#m', 'D', 'C#m', 'B', 'A', 'F#m', 'G#7', 'G#7',
  'C#m', 'D', 'C#m', 'B', 'A', 'F#m', 'G#7', 'G#7'];
const R = 'r:w';
const A_MEL = [
  'C#5:h G#4:q C#5:q',
  'D5:h. F#5:q',
  'E5:q. D#5:e E5:q G#5:q',
  'F#5:h. D#5:q',
  'E5:q. C#5:e A4:q C#5:q',
  'F#5:q. E5:e C#5:q A5:q',
  'G#5:h. F#5:e E5:e',
  'D#5:h B#4:h',
  'C#5:h G#4:q C#5:q',
  'D5:h. A5:q',
  'G#5:q. F#5:e E5:q C#6:q',
  'B5:h. F#5:q',
  'A5:q. G#5:e E5:q C#5:q',
  'F#5:q. G#5:e A5:q C#6:q',
  'D#6:h. G#5:q',
  'G#5:w',
];

export default {
  id: 'boss_big',
  title: '時を喰らうもの',
  bpm: 160,
  beatsPerBar: 4,
  key: 'C# minor',
  seed: 9160,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [55, 88], vol: 1.0, pan: 0.0, rev: 0.25 },
    choir: { inst: 'choir', range: [52, 76], voiceLo: 56, vol: 0.75, pan: -0.15, rev: 0.5 },
    spicc: { inst: 'spicc', range: [49, 85], voiceLo: 61, vol: 0.75, pan: 0.3, rev: 0.2, human: 0.004 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.62, pan: 0.0, rev: 0.04 },
    drums: { inst: 'drums', vol: 0.65, pan: 0.0, rev: 0.2 },
  },
  patterns: {
    bass8: { kind: 'bass', steps: [[0, 'R', 0.4, 1], [0.5, 'R', 0.4, 0.55], [1, 'R', 0.4, 0.75], [1.5, 'R', 0.4, 0.55], [2, 'R', 0.4, 0.9], [2.5, 'R', 0.4, 0.55], [3, 'R', 0.4, 0.75], [3.5, '8', 0.4, 0.6]] },
    bassLong: { kind: 'bass', steps: [[0, 'R', 3.8, 1]] },
    spicc16: { kind: 'arp', steps: Array.from({ length: 16 }, (_, i) => [i * 0.25, [1, 2, 3, 2][i % 4] + (i >= 8 ? 1 : 0), 0.2, i % 4 === 0 ? 1 : 0.5]) },
    spicc8: { kind: 'arp', steps: [[0, 1, 0.4, 1], [0.5, 1, 0.4, 0.5], [1, 2, 0.4, 0.8], [1.5, 1, 0.4, 0.5], [2, 3, 0.4, 0.9], [2.5, 1, 0.4, 0.5], [3, 2, 0.4, 0.8], [3.5, 1, 0.4, 0.5]] },
    hold: { kind: 'hold', voices: 3, vel: 0.85 },
  },
  drumPatterns: {
    intro: { taiko: ['x.....x.....x...', 'x.....x...x.x.x.'], timp: ['................', '........x.x.xxxx'] },
    A: {
      taiko: 'x.....x.....x...',
      kick: 'x.......x.......',
      snare: '....x.......x...',
      hat: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi % 8 === 0 ? 'x...............' : '................'),
    },
    B: {
      taiko: 'x.......x.......',
      timp: 'x...x...x...x...',
      snare: '....x.......x...',
      hat: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
    A2: {
      taiko: 'x.....x.....x.x.',
      kick: 'x...x...x...x...',
      snare: '....x.......x..o',
      hat: 'x.o.x.o.x.o.x.o.',
      tomlo: (bi) => (bi % 4 === 3 ? '........o.o.o.o.' : '................'),
      crash: (bi) => (bi % 4 === 0 ? 'x...............' : '................'),
    },
    C: {
      timp: ['x...............', '................', 'x.......x.......', '................'],
      taiko: 'x...............',
      tri: '................',
    },
    D: {
      taiko: ['x.x...x.x...x...', 'x.x...x.x...x...', 'x.x...x.x...x...', 'x.x...x.x.x.x.x.'],
      kick: 'x...x...x...x...',
      snare: (bi) => (bi === 7 ? 'xxxxxxxxXXXXXXXX' : '....x.......x...'),
      hat: 'x.x.x.x.x.x.x.x.',
      crash: (bi) => (bi === 0 || bi === 4 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['C#m', 'G#7'],
      gen: { spicc: 'spicc16', bass: 'bassLong', choir: 'hold' },
      drums: 'intro',
      parts: {},
    },
    A: {
      chords: A_CHORDS,
      gen: { spicc: 'spicc16', bass: 'bass8', choir: 'hold' },
      drums: 'A',
      mix: { choir: 0.6, spicc: 0.85 },
      parts: { brass: A_MEL },
    },
    B: {
      chords: ['A', 'B', 'G#m', 'C#m', 'F#m', 'B', 'E', 'G#7'],
      gen: { spicc: 'spicc8', bass: 'bass8', choir: 'hold' },
      drums: 'B',
      parts: { brass: ['C#6:h. A5:q', 'B5:h. F#5:q', 'G#5:h. D#5:q', 'E5:h. G#5:q', 'A5:h C#6:h', 'D#6:h. B5:q', 'E6:h. B5:q', 'B#5:h G#5:h'] },
    },
    A2: {
      chords: A_CHORDS,
      gen: { spicc: 'spicc16', bass: 'bass8', choir: 'hold' },
      drums: 'A2',
      mix: { choir: 0.85 },
      parts: { brass: A_MEL },
    },
    C: {
      chords: ['C#m', 'A', 'D', 'G#7', 'C#m', 'A', 'D', 'G#7'],
      gen: { spicc: 'spicc8', bass: 'bassLong', choir: 'hold' },
      drums: 'C',
      mix: { choir: 1.25, spicc: 0.6 },
      parts: { brass: ['G#4:w', 'A4:w', 'A4:h F#4:h', 'G#4:w', 'C#5:w', 'C#5:h E5:h', 'D5:h F#5:h', 'G#5:h. r:q'] },
    },
    D: {
      chords: ['C#m', 'C#m', 'D', 'D', 'C#m', 'C#m', 'B', 'G#7'],
      gen: { spicc: 'spicc16', bass: 'bass8', choir: 'hold' },
      drums: 'D',
      mix: { choir: 0.8 },
      parts: {
        brass: [
          'C#5:e r:e E5:e r:e G#5:q r:q',
          'r:h G#5:e F#5:e E5:e D#5:e',
          'D5:e r:e F#5:e r:e A5:q r:q',
          'r:h A5:e G#5:e F#5:e E5:e',
          'C#5:e r:e E5:e r:e G#5:q C#6:q',
          'B5:e A5:e G#5:e E5:e C#5:h',
          'D#5:h F#5:h',
          'G#5:h. r:q',
        ],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'C', 'D'] },
};
