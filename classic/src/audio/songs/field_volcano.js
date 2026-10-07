// 焔の坑道の曲「焔の坑道」。オリジナル曲。
// 熱い、重い。低いタムと大太鼓が打ち続け、金管が E フリギア（半音上の F）の短い句で迫る。
// 低いストリングスが 8 分で刻み、ところどころで金床が鳴る。B は溶岩がうねるように長い音、C は太鼓と合唱だけの間。
// E フリギア・4/4・140 BPM。イントロ 2 → A 16 → B 8 → A' 16 → C 8。ループ 48 小節 ≒ 82.3 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Em', 'F', 'Em', 'F', 'Em', 'Dm', 'C', 'F',
  'Em', 'F', 'G', 'F', 'Em', 'Dm', 'F', 'Em'];
const R = 'r:w';
const A_MEL = [
  'E4:e E4:e G4:e B4:e E5:q D5:e B4:e',
  'C5:q. A4:e F4:h',
  'E4:e G4:e B4:e E5:e G5:q F5:e E5:e',
  'F5:h. r:q',
  'B4:e E5:e G5:e B5:e A5:q G5:q',
  'F5:q. E5:e D5:q A4:q',
  'C5:e E5:e G5:e C6:e B5:q G5:q',
  'A5:h F5:h',
  'E5:e E5:e G5:e B5:e E6:q D6:e B5:e',
  'C6:q. A5:e F5:h',
  'D6:q. B5:e G5:q D5:q',
  'C6:h A5:h',
  'G5:e F5:e E5:e D5:e E5:q B4:q',
  'D5:e E5:e F5:e A5:e D6:h',
  'C6:q A5:q F5:q C5:q',
  'E5:h. r:q',
];

export default {
  id: 'field_volcano',
  title: '焔の坑道',
  bpm: 140,
  beatsPerBar: 4,
  key: 'E phrygian',
  seed: 8020,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [52, 90], vol: 1.0, pan: 0.05, rev: 0.22 },
    low: { inst: 'spicc', range: [38, 64], voiceLo: 40, vol: 0.7, pan: -0.25, rev: 0.15 },
    choir: { inst: 'choir', range: [48, 74], voiceLo: 52, vol: 0.5, pan: 0.25, rev: 0.45 },
    bass: { inst: 'bass', range: [26, 50], vol: 0.7, pan: 0.0, rev: 0.03 },
    drums: { inst: 'drums', vol: 0.65, pan: 0.0, rev: 0.18 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { tomlo: ['x..x..x.x..x..x.', 'x..x..x.x.x.x.x.'], anvil: ['x...............', '................'] },
    A: { kick: 'x.x...x.x.x...x.', snare: '....x.......x...', tomlo: 'x..x..x.........', hat: 'o.o.o.o.o.o.o.o.' },
    B: { taiko: 'x.......x.......', tomlo: '......x.......x.', anvil: ['x...............', '................', '................', '................'] },
    A2: {
      kick: 'x.x...x.x.x...x.',
      snare: (bi) => (bi === 15 ? '....x...x.x.xxxx' : '....x.......x...'),
      tomlo: 'x..x..x.........',
      tom: '..........x...x.',
      hat: 'o.o.o.o.o.o.o.o.',
      anvil: (bi) => (bi % 4 === 0 ? '..x.............' : '................'),
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
    C: { taiko: 'x.....x...x.....', tomlo: 'x..x..x.x..x..x.', tom: (bi) => (bi === 7 ? '....x.x.x.x.x.x.' : '..........x.....'), anvil: '........x.......' },
  },
  sections: {
    intro: {
      chords: ['Em', 'F'],
      gen: { low: 'pulse8', bass: 'bassOct' },
      drums: 'intro',
      parts: { brass: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { low: 'pulse8', bass: 'bassOct' },
      drums: 'A',
      parts: { brass: A_MEL },
    },
    B: {
      chords: ['Am', 'Am', 'F', 'F', 'Dm', 'Dm', 'E', 'E'],
      gen: { low: 'pulse8', choir: 'hold', bass: 'bassLong' },
      drums: 'B',
      mix: { low: 0.6 },
      parts: { brass: ['A4:w', 'C5:h B4:h', 'A4:h. F4:q', 'C5:w', 'D5:h. F5:q', 'A5:h F5:h', 'G#5:h. E5:q', 'B4:w'] },
    },
    A2: {
      chords: A_CHORDS,
      gen: { low: 'pulse8', choir: 'hold', bass: 'bassOct' },
      drums: 'A2',
      mix: { choir: 0.6 },
      parts: { brass: A_MEL },
    },
    C: {
      chords: ['Em', 'Em', 'F', 'F', 'Em', 'Em', 'F', 'B7'],
      gen: { choir: 'hold', bass: 'bassOct' },
      drums: 'C',
      mix: { choir: 1.3 },
      parts: { brass: [R, R, R, R, R, R, R, 'r:h B4:q D#5:q'] },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'C'] },
};
