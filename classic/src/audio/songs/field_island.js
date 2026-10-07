// 芽吹きの島の狩場・小道（S000〜S009）の曲「はじまりの草原」。オリジナル曲。
// 冒険の始まり。笛がはずむ旋律、ピチカートが 8 分で刻み、グロッケンが合いの手。
// G 長調・4/4・120 BPM。イントロ 2 小節 → A 16 → B 8 → C 8（E♭・F へ寄り道）→ A' 16（→ A へ戻る）。
// ループ 1 周 = 48 小節 = 96 秒。

const A_CHORDS = ['G', 'Cmaj7', 'Am7', 'D7', 'G', 'Em7', 'C', 'D',
  'Bm7', 'Em7', 'Am7', 'D7', 'C', 'D', 'G', 'D7sus4 D7'];
const R = 'r:w';
const A_MEL = [
  'D5:e G5:e B5:q. A5:e G5:q',
  'E5:q G5:e B5:e~ B5:h',
  'C6:q. B5:e A5:q G5:q',
  'F#5:e G5:e A5:e F#5:e D5:h',
  'D5:e G5:e B5:q. C6:e D6:q',
  'E6:q. D6:e B5:q G5:q',
  'A5:e B5:e C6:e A5:e E6:q. D6:e',
  'D6:h. r:q',
  'F#5:q. A5:e D6:q F#6:q',
  'E6:e D6:e B5:e G5:e E5:h',
  'C6:q. B5:e A5:q E6:q',
  'D6:e C6:e A5:e F#5:e A5:h',
  'G5:q E6:q. D6:e C6:q',
  'B5:q A5:q. G5:e F#5:q',
  'G5:h. r:q',
  'r:h D5:e E5:e F#5:e A5:e',
];

export default {
  id: 'field_island',
  title: 'はじまりの草原',
  bpm: 120,
  beatsPerBar: 4,
  key: 'G major',
  seed: 1001,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 93], vol: 0.85, pan: 0.0, rev: 0.24 },
    bell: { inst: 'bell', range: [72, 103], vol: 0.32, pan: 0.38, rev: 0.3 },
    pizz: { inst: 'pizz', range: [43, 79], voiceLo: 55, vol: 0.75, pan: -0.3, rev: 0.16, human: 0.008 },
    strings: { inst: 'strings', range: [55, 84], voiceLo: 60, vol: 0.34, pan: 0.15, rev: 0.4 },
    bass: { inst: 'bass', range: [36, 55], vol: 0.5, pan: 0.0, rev: 0.04, human: 0.005 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.12 },
  },
  patterns: {
    bassTwo: { kind: 'bass', steps: [[0, 'R', 0.9, 1], [1, '5', 0.45, 0.6], [2, 'R', 0.9, 0.85], [3, '5', 0.45, 0.6], [3.5, '>', 0.45, 0.55]] },
    bassHalf: { kind: 'bass', steps: [[0, 'R', 1.9, 0.9], [2, '5', 1.9, 0.7]] },
    pizz8: { kind: 'arp', steps: [[0, 1, 0.4, 0.9], [0.5, 2, 0.4, 0.55], [1, 3, 0.4, 0.75], [1.5, 2, 0.4, 0.55], [2, 1, 0.4, 0.85], [2.5, 2, 0.4, 0.55], [3, 3, 0.4, 0.75], [3.5, 4, 0.4, 0.6]] },
    pizz4: { kind: 'arp', steps: [[0, 1, 0.8, 0.85], [1, 3, 0.8, 0.6], [2, 2, 0.8, 0.7], [3, 4, 0.8, 0.6]] },
    hold: { kind: 'hold', voices: 4, vel: 0.8 },
  },
  drumPatterns: {
    intro: { shaker: 'o.o.o.o.o.o.o.o.', tri: ['x...............', '........x.......'] },
    A: {
      kick: 'x.......x.......',
      snare: '....o.......o...',
      shaker: 'o.x.o.x.o.x.o.x.',
      tamb: (bi) => (bi % 4 === 3 ? '....o.......o.o.' : '................'),
    },
    B: { kick: 'x.........x.....', shaker: 'o.o.o.o.o.o.o.o.', tri: ['x...............', '................'] },
    C: { kick: 'x.......x.......', block: '..o...o...o...o.', shaker: 'o.o.o.o.o.o.o.o.', tamb: '....o.......o...' },
    A2: {
      kick: 'x.......x.x.....',
      snare: (bi) => (bi === 15 ? '....o...o.o.oxox' : '....o.......o...'),
      shaker: 'o.x.o.x.o.x.o.x.',
      tamb: '....o.......o...',
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['G', 'D7sus4 D7'],
      gen: { pizz: 'pizz4', bass: 'bassHalf' },
      drums: 'intro',
      parts: {
        bell: ['D6:e G6:e B6:e G6:e D6:e G6:e B6:e D7:e', 'C7:q A6:q r:h'],
        flute: [R, 'r:h D5:e E5:e F#5:e A5:e'],
      },
    },
    A: {
      chords: A_CHORDS,
      gen: { pizz: 'pizz8', bass: 'bassTwo' },
      drums: 'A',
      parts: {
        flute: A_MEL,
        bell: [R, R, R, 'r:h. A6:q', R, R, R, 'r:q F#6:e A6:e D7:h', R, R, R, R, R, R, 'r:q B6:e G6:e D6:h', R],
      },
    },
    B: {
      chords: ['Em7', 'Cmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D', 'Em7', 'D7'],
      gen: { pizz: 'pizz4', bass: 'bassHalf', strings: 'hold' },
      drums: 'B',
      mix: { strings: 1.1 },
      parts: {
        flute: [
          'B5:h. G5:q',
          'E6:h D6:q B5:q',
          'C6:h. A5:q',
          'D6:h F#5:q A5:q',
          'G5:q. B5:e E6:h',
          'F#6:q. E6:e D6:h',
          'G6:q. F#6:e E6:q B5:q',
          'C6:h A5:e B5:e C6:e A5:e',
        ],
        bell: ['r:h G6:e B6:e E7:q', R, 'r:h A6:e C7:e E7:q', R, R, 'r:h A6:e D7:e F#7:q', R, R],
      },
    },
    C: {
      chords: ['Ebmaj7', 'F', 'G', 'G', 'Ebmaj7', 'F', 'Am7', 'D7'],
      gen: { pizz: 'pizz8', bass: 'bassTwo', strings: 'hold' },
      drums: 'C',
      mix: { strings: 0.8 },
      parts: {
        flute: [
          'G5:q Bb5:q D6:h',
          'C6:q. A5:e F5:h',
          'G5:e A5:e B5:e D6:e G6:h',
          'F#6:q D6:q B5:q D6:q',
          'G6:q. F6:e Eb6:q D6:q',
          'C6:q. D6:e F6:h',
          'E6:q C6:q A5:q E6:q',
          'D6:h. r:e D5:e',
        ],
        bell: [R, R, 'G6:e B6:e D7:e G7:e r:h', R, R, R, R, 'r:h F#6:e A6:e C7:q'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { pizz: 'pizz8', bass: 'bassTwo', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.6 },
      parts: {
        flute: [
          ...A_MEL.slice(0, 12),
          'G6:q E6:q. D6:e C6:q',
          'B5:q D6:q. C6:e A5:q',
          'G5:h. r:q',
          A_MEL[15],
        ],
        bell: [
          'B6:h. G6:q', R, 'C7:h. A6:q', R, 'B6:h. D7:q', R, 'C7:h. E7:q', R,
          'A6:h. F#6:q', R, 'C7:h. A6:q', R, 'E7:h. C7:q', 'D7:h. A6:q', 'G6:e B6:e D7:e G7:e r:h', R,
        ],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'C', 'A2'] },
};
