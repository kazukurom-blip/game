// 空の上の都セレス（C100）の曲「白い雲の都」。オリジナル曲。
// 雲の上の白い都と金色の光。ストリングスがゆったり歌い、ハープの分散和音、ベル、合唱風のパッド。
// E♭ 長調・4/4・96 BPM。イントロ 2 小節 → A 16 → B 8 → A' 16（→ A へ戻る）。ループ 40 小節 = 100 秒。

const A_CHORDS = ['Eb', 'Bb/D', 'Cm7', 'Abmaj7', 'Eb/G', 'Fm7', 'Bb7sus4', 'Bb7',
  'Eb', 'Gm7', 'Abmaj7', 'Fm7', 'Cm7', 'Ab Bb', 'Eb', 'Bb7sus4 Bb7'];
const R = 'r:w';
const A_MEL = [
  'G5:h. Bb5:q',
  'F5:h. D5:q',
  'Eb5:q. F5:e G5:q C6:q',
  'C6:h. Bb5:q',
  'Bb5:h. G5:q',
  'Ab5:h. F5:q',
  'Eb5:q F5:q Ab5:q F5:q',
  'D5:h. r:q',
  'G5:h. Bb5:q',
  'D6:h. Bb5:q',
  'C6:q. Bb5:e Ab5:q Eb6:q',
  'F6:h. Eb6:q',
  'Eb6:h. D6:e C6:e',
  'C6:h D6:h',
  'Eb6:w',
  'r:h Bb5:q D6:q',
];

export default {
  id: 'town_ceres',
  title: '白い雲の都',
  bpm: 96,
  beatsPerBar: 4,
  key: 'Eb major',
  seed: 7100,
  tracks: {
    lead: { inst: 'strings', melody: true, range: [62, 91], vol: 1.25, pan: 0.05, rev: 0.4 },
    flute: { inst: 'flute', range: [62, 91], vol: 0.45, pan: 0.25, rev: 0.4 },
    bell: { inst: 'bell', range: [74, 101], vol: 0.36, pan: 0.38, rev: 0.45 },
    harp: { inst: 'harp', range: [43, 86], voiceLo: 55, vol: 0.85, pan: -0.32, rev: 0.36, human: 0.008 },
    choir: { inst: 'choir', range: [53, 77], voiceLo: 55, vol: 0.55, pan: -0.05, rev: 0.55 },
    bass: { inst: 'bass', range: [31, 51], vol: 0.45, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.42, pan: 0.0, rev: 0.3 },
  },
  patterns: {
    harp8: { kind: 'arp', steps: [[0, 0, 1.5, 0.9], [0.5, 1, 1, 0.5], [1, 2, 1, 0.6], [1.5, 3, 1, 0.5], [2, 4, 1, 0.7], [2.5, 5, 1, 0.5], [3, 4, 1, 0.6], [3.5, 3, 0.8, 0.5]] },
    harpSlow: { kind: 'arp', steps: [[0, 0, 2, 0.85], [1, 2, 1.5, 0.6], [2, 3, 1.5, 0.65], [3, 5, 1, 0.55]] },
    bassHalf: { kind: 'bass', steps: [[0, 'R', 1.9, 0.9], [2, '5', 1.9, 0.6]] },
    hold: { kind: 'hold', voices: 3, vel: 0.8 },
  },
  drumPatterns: {
    intro: { tri: ['x...............', '................'] },
    A: { shaker: '..o...o...o...o.', tri: (bi) => (bi % 4 === 0 ? 'o...............' : '................') },
    B: { kick: 'x.......o.......', shaker: 'o.o.o.o.o.o.o.o.', timp: (bi) => (bi % 4 === 0 ? 'o...............' : '................') },
    A2: {
      kick: 'x.......o.......',
      shaker: 'o.o.o.o.o.o.o.o.',
      tamb: '....o.......o...',
      crash: (bi) => (bi === 0 ? 'o...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Ab', 'Bb7sus4 Bb7'],
      gen: { harp: 'harpSlow', choir: 'hold', bass: 'bassHalf' },
      drums: 'intro',
      parts: { bell: ['Eb6:e Ab6:e C7:e Eb7:e r:h', 'D6:e F6:e Bb6:e D7:e r:h'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'harp8', choir: 'hold', bass: 'bassHalf' },
      drums: 'A',
      mix: { choir: 0.7 },
      parts: {
        lead: A_MEL,
        bell: [R, R, R, 'r:h Eb7:q C7:q', R, R, R, 'r:h F6:q Bb6:q', R, R, R, 'r:h Ab6:q C7:q', R, R, 'r:h Bb6:e G6:e Eb6:q', R],
      },
    },
    B: {
      chords: ['Abmaj7', 'Bb', 'Gm7', 'Cm7', 'Fm7', 'Gm7', 'Abmaj7', 'Bb7sus4 Bb7'],
      gen: { harp: 'harpSlow', choir: 'hold', bass: 'bassHalf' },
      drums: 'B',
      parts: {
        lead: [
          'Eb6:h C6:q Ab5:q',
          'Bb5:h. F5:q',
          'G5:q. Bb5:e D6:h',
          'Eb6:h. G5:q',
          'Ab5:q C6:q F6:q Eb6:q',
          'D6:h. Bb5:q',
          'C6:q. Eb6:e G6:q F6:q',
          'F6:h D6:h',
        ],
        bell: ['C7:h. r:q', 'D7:h. r:q', 'Bb6:h. r:q', 'G6:h. r:q', 'Ab6:h. r:q', 'Bb6:h. r:q', 'Eb7:h. r:q', R],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { harp: 'harp8', choir: 'hold', bass: 'bassHalf' },
      drums: 'A2',
      parts: {
        lead: A_MEL,
        flute: [
          R, R, 'r:h G5:e Ab5:e Bb5:q', 'Eb6:h. r:q', R, R, 'r:h Ab5:e Bb5:e C6:q', 'Bb5:h. r:q',
          R, R, 'r:h C6:e Bb5:e Ab5:q', 'C6:h. r:q', R, R, 'r:h G5:e Ab5:e Bb5:q', 'r:w',
        ],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
