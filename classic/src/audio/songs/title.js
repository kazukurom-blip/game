// タイトル画面の曲「ルミナリアの空へ」。オリジナル曲。
// 広がりのある、これから冒険が始まる期待。ストリングスとホルン風のブラスが歌い、ピアノの分散和音、ベル、ティンパニ。
// C 長調・4/4・92 BPM。イントロ 4 小節 → A 16 → B 8 → A' 8 → つなぎ 4（→ A へ戻る）。ループ 36 小節 ≒ 93.9 秒。

const A_CHORDS = ['C', 'Em7', 'Fmaj7', 'G', 'Am7', 'Fmaj7', 'Dm7', 'G7sus4 G7',
  'C', 'E7', 'Am7', 'C7', 'Fmaj7', 'Fm6', 'C/G G7', 'C'];
const R = 'r:w';
const A_MEL = [
  'G5:h. C6:q',
  'B5:h. G5:q',
  'A5:q. C6:e F6:q E6:q',
  'D6:h. r:q',
  'C6:h. E6:q',
  'A6:h. G6:e F6:e',
  'F6:q. E6:e D6:q A5:q',
  'C6:h B5:h',
  'G5:h. C6:q',
  'B5:h. G#5:q',
  'A5:q. B5:e C6:q E6:q',
  'G6:h. Bb5:q',
  'A5:q. C6:e F6:q E6:q',
  'Ab5:h. F5:q',
  'G5:h D6:h',
  'C6:h. r:q',
];

export default {
  id: 'title',
  title: 'ルミナリアの空へ',
  bpm: 92,
  beatsPerBar: 4,
  key: 'C major',
  seed: 100,
  tracks: {
    lead: { inst: 'strings', melody: true, range: [64, 94], vol: 1.3, pan: 0.0, rev: 0.42 },
    horn: { inst: 'brass', range: [53, 79], vol: 0.55, pan: 0.2, rev: 0.35 },
    bell: { inst: 'bell', range: [72, 103], vol: 0.33, pan: 0.38, rev: 0.45 },
    piano: { inst: 'piano', range: [43, 84], voiceLo: 55, vol: 0.6, pan: -0.3, rev: 0.3, human: 0.006 },
    pad: { inst: 'pad', range: [48, 76], voiceLo: 52, vol: 0.45, pan: -0.05, rev: 0.5 },
    bass: { inst: 'bass', range: [28, 50], vol: 0.5, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.55, pan: 0.0, rev: 0.35 },
  },
  patterns: {
    pianoArp: { kind: 'arp', steps: [[0, 0, 2, 0.85], [0.5, 1, 1.5, 0.5], [1, 2, 1.5, 0.6], [1.5, 3, 1, 0.5], [2, 4, 1.5, 0.7], [2.5, 3, 1, 0.5], [3, 2, 1, 0.6], [3.5, 1, 0.8, 0.5]] },
    pianoSlow: { kind: 'arp', steps: [[0, 0, 3, 0.8], [1, 2, 2, 0.55], [2, 3, 2, 0.6], [3, 4, 1, 0.5]] },
    bassHalf: { kind: 'bass', steps: [[0, 'R', 1.9, 0.9], [2, '5', 1.9, 0.65]] },
    bassMarch: { kind: 'bass', steps: [[0, 'R', 1.4, 1], [1.5, 'R', 0.4, 0.6], [2, '5', 0.9, 0.8], [3, 'R', 0.9, 0.7]] },
    hold: { kind: 'hold', voices: 3, vel: 0.8 },
    hornHold: { kind: 'hold', voices: 3, vel: 0.6 },
  },
  drumPatterns: {
    intro: {
      timp: ['x...............', '................', 'x...............', 'x...x...x.x.xxxx'],
      tri: ['x...............', '................', '................', '................'],
      crash: ['o...............', '................', '................', '................'],
    },
    A: {
      timp: (bi) => (bi % 4 === 0 ? 'x...............' : bi % 4 === 3 ? '........o...o...' : '................'),
      shaker: '..o...o...o...o.',
      tri: (bi) => (bi % 8 === 0 ? 'o...............' : '................'),
    },
    B: {
      timp: 'x.......o.......',
      snare: '....o.......o...',
      kick: 'x.......x.......',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
    A2: {
      timp: (bi) => (bi % 2 === 0 ? 'x.......x.......' : 'x...............'),
      snare: (bi) => (bi === 7 ? '....o...o.o.oooo' : '....o.......o...'),
      kick: 'x.......x.x.....',
      crash: (bi) => (bi === 0 ? 'X...............' : '................'),
    },
    tag: { timp: ['x...............', '................', 'x...............', 'x...x...x.x.x.x.'], tri: ['x...............', '................', '................', '................'] },
  },
  sections: {
    intro: {
      chords: ['C', 'Am7', 'Fmaj7', 'G7sus4 G7'],
      gen: { piano: 'pianoSlow', pad: 'hold', bass: 'bassHalf' },
      drums: 'intro',
      parts: {
        bell: ['G6:e C7:e E7:e G7:e E7:h', 'A6:e C7:e E7:e A6:e C7:h', 'F6:e A6:e C7:e E7:e C7:h', 'D7:h B6:h'],
        horn: ['G4:w', 'A4:w', 'A4:w', 'C5:h B4:h'],
      },
    },
    A: {
      chords: A_CHORDS,
      gen: { piano: 'pianoArp', pad: 'hold', bass: 'bassHalf' },
      drums: 'A',
      mix: { pad: 0.75 },
      parts: {
        lead: A_MEL,
        bell: [R, R, R, 'r:h G6:q B6:q', R, R, R, 'r:h. D7:q', R, R, R, 'r:h E7:q G7:q', R, R, R, 'r:q G6:e C7:e E7:h'],
      },
    },
    B: {
      chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Bb', 'G7sus4 G7'],
      gen: { piano: 'pianoArp', pad: 'hold', bass: 'bassMarch', horn: 'hornHold' },
      drums: 'B',
      parts: {
        lead: [
          'E6:h. C6:q',
          'F6:h. A5:q',
          'G5:q. C6:e E6:q G6:q',
          'G6:h D6:h',
          'E6:q. D6:e C6:q A5:q',
          'C6:q. A5:e F5:q C6:q',
          'D6:q. F6:e Bb6:h',
          'F6:h. G6:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS.slice(8),
      gen: { piano: 'pianoArp', pad: 'hold', bass: 'bassMarch', horn: 'hornHold' },
      drums: 'A2',
      mix: { horn: 1.2 },
      parts: {
        lead: A_MEL.slice(8),
        bell: ['G6:e C7:e E7:e G7:e r:h', R, 'A6:e C7:e E7:e A6:e r:h', R, 'F6:e A6:e C7:e F7:e r:h', R, R, 'C7:h. r:q'],
      },
    },
    tag: {
      chords: ['Fmaj7', 'Em7', 'Dm7', 'G7sus4 G7'],
      gen: { piano: 'pianoSlow', pad: 'hold', bass: 'bassHalf' },
      drums: 'tag',
      parts: {
        lead: ['A5:h. C6:q', 'B5:h. G5:q', 'F5:q A5:q D6:q F6:q', 'E6:h D6:h'],
        horn: ['F4:w', 'G4:w', 'A4:w', 'B4:h. r:q'],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'tag'] },
};
