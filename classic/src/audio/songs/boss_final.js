// 三つ首の黒竜・最後の敵の曲「三つ首の黒竜」。オリジナル曲。
// 最後の戦い。オーケストラ風すべて: 金管の旋律、16 分で刻むストリングス、合唱風の声、ティンパニと大太鼓。
// B は D♭ 長調で悲しく大きく、C は 3 連の 8 分（6/8 のように聞こえる）でうねる。
// F 短調・4/4・144 BPM。イントロ 2 → A 16 → B 8 → C 8（3 連のはね）→ A' 16。ループ 48 小節 = 80 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Fm', 'Fm', 'Db', 'Eb', 'Fm', 'Bbm', 'C', 'C',
  'Fm', 'Ab', 'Db', 'Eb', 'Bbm', 'Gb', 'C7', 'Fm'];
const R = 'r:w';
const A_MEL = [
  'F4:q C5:q. Ab4:e F4:q',
  'G4:e Ab4:e Bb4:e C5:e Db5:q C5:q',
  'F5:q. Eb5:e Db5:q Ab4:q',
  'Bb4:h. G4:q',
  'C5:q F5:q. Eb5:e C5:q',
  'F5:e Gb5:e F5:e Db5:e Bb4:h',
  'E5:q. F5:e G5:q C6:q',
  'Bb5:h. G5:q',
  'Ab5:q. G5:e F5:q C5:q',
  'Eb5:q. F5:e Ab5:h',
  'F5:q. Ab5:e Db6:q C6:q',
  'Bb5:h G5:h',
  'Db6:q. C6:e Bb5:q F5:q',
  'Gb5:q Bb5:q Db6:q. Bb5:e',
  'C6:q Bb5:q G5:q E5:q',
  'F5:h. r:q',
];

export default {
  id: 'boss_final',
  title: '三つ首の黒竜',
  bpm: 144,
  beatsPerBar: 4,
  key: 'F minor',
  seed: 8323,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [53, 92], vol: 1.0, pan: 0.05, rev: 0.25 },
    lead: { inst: 'strings', range: [62, 96], vol: 0.95, pan: -0.05, rev: 0.35 },
    spicc: { inst: 'spicc', range: [41, 77], voiceLo: 48, vol: 0.6, pan: -0.3, rev: 0.2 },
    choir: { inst: 'choir', range: [48, 76], voiceLo: 53, vol: 0.55, pan: 0.25, rev: 0.45 },
    bass: { inst: 'bass', range: [25, 50], vol: 0.65, pan: 0.0, rev: 0.03 },
    drums: { inst: 'drums', vol: 0.65, pan: 0.0, rev: 0.2 },
  },
  patterns: {
    ...K4,
    trip: { kind: 'arp', steps: Array.from({ length: 12 }, (_, i) => [i / 3, [1, 2, 3][i % 3], 0.3, i % 3 ? 0.5 : 0.85]) },
  },
  drumPatterns: {
    intro: { timp: ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx'], crash: ['................', '................'] },
    A: { kick: 'x.....x.x.......', snare: '....x.......x...', taiko: 'x.......x.......', hat: 'o.o.o.o.o.o.o.o.', crash: (bi) => (bi === 0 ? 'x...............' : '................') },
    B: { taiko: 'x.......x.......', timp: (bi) => (bi === 7 ? 'x.x.x.x.x.x.x.x.' : 'x...............'), hat: 'o...o...o...o...' },
    // 3 連の 8 分（1 小節 12 個）
    C: { kick: 'x.....x.....', snare: '...x.....x..', taiko: 'x...........', hat: 'o.oo.oo.oo.o' },
    A2: {
      kick: 'x.....x.x.x.....',
      snare: (bi) => (bi === 15 ? '....x...x.x.xxxx' : '....x.......x...'),
      taiko: 'x.......x.......',
      hat: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Fm', 'C'],
      gen: { spicc: 'arp16', choir: 'hold', bass: 'bassOct' },
      drums: 'intro',
      parts: { brass: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { spicc: 'arp16', bass: 'bassOct', choir: 'hold' },
      drums: 'A',
      mix: { choir: 0.6 },
      parts: { brass: A_MEL },
    },
    B: {
      chords: ['Dbmaj7', 'Eb', 'Cm7', 'Fm', 'Bbm7', 'Eb', 'Ab', 'C'],
      gen: { spicc: 'arp8', choir: 'hold', bass: 'bass2' },
      drums: 'B',
      parts: { lead: ['Ab5:h. F5:q', 'G5:h Bb5:h', 'Eb6:h. C6:q', 'Ab5:h F5:h', 'Db6:q. C6:e Bb5:q F5:q', 'G5:h. Eb5:q', 'Ab5:q C6:q Eb6:q Ab6:q', 'G6:h E6:h'] },
    },
    C: {
      chords: ['Fm', 'Db', 'Bbm', 'C', 'Fm', 'Db', 'Gb', 'C7'],
      gen: { spicc: 'trip', bass: 'bass2w', choir: 'hold' },
      drums: 'C',
      parts: {
        brass: [
          'F5:et Eb5:et C5:et F5:h Ab5:et G5:et F5:et',
          'Ab5:h. F5:et Db5:et Ab4:et',
          'Bb4:et Db5:et F5:et Bb5:h F5:et Db5:et Bb4:et',
          'C5:h. E5:et G5:et Bb5:et',
          'C6:et Bb5:et Ab5:et F5:h C5:et Db5:et Eb5:et',
          'F5:h. Ab5:et F5:et Db5:et',
          'Gb5:et Bb5:et Db6:et Bb5:h Gb5:et Db5:et Bb4:et',
          'C5:h E5:et G5:et E5:et C5:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { spicc: 'arp16', bass: 'bassOct', choir: 'hold' },
      drums: 'A2',
      parts: { brass: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'C', 'A2'] },
};
