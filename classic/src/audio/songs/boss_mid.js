// 中ボス戦（キノコの女王・大ワニ など）の曲「立ちはだかる影」。オリジナル曲。
// 緊張するが怖すぎない。ストリングスが 8 分で刻み、ブラスが旋律、ティンパニと太鼓が押す。
// D 短調・4/4・150 BPM。イントロ 2 小節 → A 16 → B 8 → A' 16 → C 8（→ A へ戻る）。ループ 48 小節 = 76.8 秒。

const A_CHORDS = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A7',
  'Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A7'];
const R = 'r:w';
const A_MEL = [
  'D5:q. A4:e D5:e E5:e F5:q',
  'E5:q. D5:e A4:h',
  'Bb4:q. D5:e F5:q Bb5:q',
  'A5:q. G5:e E5:h',
  'D5:q. A4:e D5:e E5:e F5:q',
  'G5:q. F5:e E5:e D5:e A5:q',
  'Bb5:q. A5:e G5:q D5:q',
  'C#5:h. r:q',
  'D5:q. A4:e D5:e E5:e F5:q',
  'A5:q. G5:e F5:e E5:e D5:q',
  'D6:q. C6:e Bb5:q F5:q',
  'G5:q. A5:e E5:h',
  'F5:q. E5:e D5:q A5:q',
  'D6:h. C6:e Bb5:e',
  'Bb5:q. A5:e G5:q Bb5:q',
  'A5:h. r:q',
];

export default {
  id: 'boss_mid',
  title: '立ちはだかる影',
  bpm: 150,
  beatsPerBar: 4,
  key: 'D minor',
  seed: 9150,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [55, 86], vol: 0.95, pan: 0.05, rev: 0.22 },
    spicc: { inst: 'spicc', range: [50, 84], voiceLo: 62, vol: 0.8, pan: -0.3, rev: 0.2, human: 0.004 },
    strings: { inst: 'strings', range: [50, 81], voiceLo: 57, vol: 0.45, pan: 0.25, rev: 0.35 },
    bass: { inst: 'bass', range: [33, 55], vol: 0.6, pan: 0.0, rev: 0.04 },
    drums: { inst: 'drums', vol: 0.62, pan: 0.0, rev: 0.16 },
  },
  patterns: {
    bass8: { kind: 'bass', steps: [[0, 'R', 0.4, 1], [0.5, 'R', 0.4, 0.6], [1, 'R', 0.4, 0.8], [1.5, 'R', 0.4, 0.6], [2, 'R', 0.4, 0.9], [2.5, 'R', 0.4, 0.6], [3, '5', 0.4, 0.8], [3.5, '8', 0.4, 0.6]] },
    bassHit: { kind: 'bass', steps: [[0, 'R', 1.4, 1], [1.5, 'R', 0.4, 0.7], [2.5, 'R', 0.4, 0.7], [3, '5', 0.9, 0.8]] },
    spicc8: { kind: 'arp', steps: [[0, 1, 0.4, 1], [0.5, 2, 0.4, 0.6], [1, 3, 0.4, 0.8], [1.5, 2, 0.4, 0.6], [2, 1, 0.4, 0.9], [2.5, 2, 0.4, 0.6], [3, 3, 0.4, 0.8], [3.5, 4, 0.4, 0.65]] },
    spicc16: { kind: 'arp', steps: Array.from({ length: 16 }, (_, i) => [i * 0.25, [1, 1, 2, 1, 3, 1, 2, 1][i % 8], 0.2, i % 4 === 0 ? 1 : 0.55]) },
    hold: { kind: 'hold', voices: 3, vel: 0.8 },
  },
  drumPatterns: {
    intro: { timp: ['x.......x.x.x.x.', 'x...x...x.x.x.oo'], hat: 'o.o.o.o.o.o.o.o.' },
    A: {
      kick: 'x.....x...x.....',
      snare: '....x.......x...',
      hat: 'o.o.o.o.o.o.o.o.',
      timp: (bi) => (bi % 4 === 0 ? 'x...............' : '................'),
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
    B: {
      kick: 'x.......x.......',
      snare: '....x.......x...',
      hat: 'o.o.o.o.o.o.o.o.',
      timp: 'x.......x.......',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
    A2: {
      kick: 'x.....x...x...x.',
      snare: (bi) => (bi === 15 ? '....x...x.x.xxxx' : '....x.......x...'),
      hat: 'x.o.x.o.x.o.x.o.',
      tom: (bi) => (bi % 4 === 3 ? '..........o.o...' : '................'),
      crash: (bi) => (bi % 8 === 0 ? 'x...............' : '................'),
    },
    C: {
      timp: ['x...............', 'x.......x.......', 'x...............', 'x...x...x...x...'],
      kick: 'x...............',
      hat: '..o...o...o...o.',
      snare: (bi) => (bi === 7 ? 'x.x.x.x.xxxxXXXX' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Dm', 'A7'],
      gen: { spicc: 'spicc16', bass: 'bassHit' },
      drums: 'intro',
      parts: {},
    },
    A: {
      chords: A_CHORDS,
      gen: { spicc: 'spicc8', bass: 'bass8' },
      drums: 'A',
      parts: { brass: A_MEL },
    },
    B: {
      chords: ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'E7', 'A7'],
      gen: { spicc: 'spicc8', bass: 'bassHit', strings: 'hold' },
      drums: 'B',
      parts: {
        brass: ['F5:h. D5:q', 'E5:h. G5:q', 'A5:h. C6:q', 'D6:h. A5:q', 'Bb5:h. F5:q', 'G5:h. C6:q', 'B5:h G#5:h', 'A5:h. r:q'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { spicc: 'spicc16', bass: 'bass8', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.7, spicc: 0.75 },
      parts: { brass: A_MEL },
    },
    C: {
      chords: ['Gm', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Bb', 'A7'],
      gen: { spicc: 'spicc16', strings: 'hold', bass: 'bassHit' },
      drums: 'C',
      mix: { strings: 1.2 },
      parts: {
        brass: ['Bb5:h. G5:q', 'A5:h. E5:q', 'F5:h. D5:q', 'D5:h. F5:q', 'G5:h. Bb5:q', 'A5:h. C#6:q', 'D6:h F5:h', 'E5:q C#5:q A4:h'],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'C'] },
};
