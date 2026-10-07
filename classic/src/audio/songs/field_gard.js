// ガルドの岩山の曲「岩山を登る」。オリジナル曲。
// 岩山を登る、緊張と勇気。短いストリングス（スピッカート）が 8 分で刻み、金管が勇ましく歌い、タムが大きく鳴る。
// B ではストリングスが F・G を通って明るく持ち上げ、最後に B♭ で少し陰る。
// A 短調・4/4・132 BPM。イントロ 2 → A 16 → B 8 → A' 16。ループ 40 小節 ≒ 72.7 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'E',
  'Am', 'C', 'F', 'G', 'Dm', 'E', 'Am', 'E7'];
const R = 'r:w';
const A_MEL = [
  'A4:q. E5:e A5:h',
  'G5:e F5:e E5:e D5:e E5:h',
  'F5:q. A5:e C6:q A5:q',
  'B5:h G5:h',
  'A5:q. B5:e C6:q E6:q',
  'D6:e C6:e B5:e A5:e B5:h',
  'A5:q. F5:e D5:q F5:q',
  'E5:h. r:q',
  'A4:q. E5:e A5:h',
  'G5:e A5:e G5:e E5:e C5:h',
  'C5:q. F5:e A5:q C6:q',
  'D6:q. C6:e B5:q G5:q',
  'F5:q A5:q D6:q C6:q',
  'B5:q. A5:e G#5:h',
  'A5:h. r:q',
  'r:h G#5:q E5:q',
];

export default {
  id: 'field_gard',
  title: '岩山を登る',
  bpm: 132,
  beatsPerBar: 4,
  key: 'A minor',
  seed: 7515,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [56, 90], vol: 0.95, pan: 0.05, rev: 0.25 },
    lead: { inst: 'strings', range: [60, 92], vol: 0.95, pan: -0.05, rev: 0.3 },
    spicc: { inst: 'spicc', range: [45, 74], voiceLo: 52, vol: 0.6, pan: -0.3, rev: 0.2 },
    strings: { inst: 'strings', range: [45, 76], voiceLo: 50, vol: 0.35, pan: 0.25, rev: 0.35 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.6, pan: 0.0, rev: 0.04 },
    drums: { inst: 'drums', vol: 0.6, pan: 0.0, rev: 0.18 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { tom: ['x.x.x.x.........', 'x.x.x.x.x.x.x.x.'], tomlo: ['x.......x.......', 'x...x...x...x...'] },
    A: { kick: 'x...x...x...x...', snare: '....x.......x...', tom: '..x...x.....x.x.', hat: 'o.o.o.o.o.o.o.o.' },
    B: { kick: 'x.......x.......', timp: (bi) => (bi === 7 ? 'x.x.x.x.x.x.x.x.' : 'x...............'), hat: 'o.o.o.o.o.o.o.o.', snare: '........x.......' },
    A2: {
      kick: 'x...x...x...x...',
      snare: (bi) => (bi === 15 ? '....x...x.x.xxxx' : '....x.......x...'),
      tom: '..x...x.....x.x.',
      tomlo: 'x.........x.....',
      hat: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Am', 'E'],
      gen: { spicc: 'pulse8', bass: 'bassOct' },
      drums: 'intro',
      parts: { brass: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { spicc: 'pulse8', bass: 'bassOct' },
      drums: 'A',
      parts: { brass: A_MEL },
    },
    B: {
      chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Bb', 'E'],
      gen: { spicc: 'pulse8', bass: 'bass2', strings: 'hold' },
      drums: 'B',
      mix: { spicc: 0.7 },
      parts: { lead: ['A5:h. C6:q', 'B5:h G5:h', 'G5:q. A5:e B5:q E5:q', 'C6:h A5:h', 'F5:q A5:q C6:q F6:q', 'D6:h B5:h', 'D6:q. C6:e Bb5:q F5:q', 'G#5:h B5:h'] },
    },
    A2: {
      chords: A_CHORDS,
      gen: { spicc: 'pulse8', bass: 'bassOct', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.7 },
      parts: { brass: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
