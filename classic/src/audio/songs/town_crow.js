// クロウ街（V500）の曲「霧の路地のジャズ」。オリジナル曲。
// 夜の街、霧、少し怪しいジャズ。口笛風の笛がブルージーに歌い、ウォーキングベース、ピアノの和音、ブラシとライド。
// スイング（裏の 8 分を後ろへ）。
// C 短調・4/4・96 BPM（スイング）。イントロ 2 → A 8 → A' 8 → B 8（サビ。E♭ 寄り）→ A 8。ループ 32 小節 = 80 秒。
import { K4 } from './_kit.js';

const A1_CHORDS = ['Cm7', 'Cm7', 'Fm7', 'Fm7', 'Dm7b5', 'G7', 'Cm7', 'Ab7 G7'];
const A1_MEL = [
  'G4:e Bb4:e C5:e Eb5:e G5:q. Eb5:e',
  'F5:e Eb5:e C5:q r:h',
  'Ab4:e C5:e Eb5:e F5:e Ab5:q. F5:e',
  'G5:e F5:e Eb5:q r:h',
  'Ab5:q. G5:e F5:q D5:q',
  'B4:e D5:e F5:e Ab5:e G5:h',
  'Eb5:q C5:q G4:e Bb4:e C5:q',
  'Eb5:q C5:q B4:q r:q',
];
const R = 'r:w';

export default {
  id: 'town_crow',
  title: '霧の路地のジャズ',
  bpm: 96,
  swing: 0.16,
  beatsPerBar: 4,
  key: 'C minor',
  seed: 6707,
  tracks: {
    whistle: { inst: 'whistle', melody: true, range: [53, 86], vol: 1.0, pan: 0.12, rev: 0.32 },
    piano: { inst: 'piano', range: [48, 76], voiceLo: 53, vol: 0.62, pan: -0.25, rev: 0.25, human: 0.01 },
    pad: { inst: 'pad', range: [48, 74], voiceLo: 53, vol: 0.35, pan: 0.2, rev: 0.5 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.75, pan: 0.0, rev: 0.05, human: 0.006, gate: 0.9 },
    drums: { inst: 'drums', vol: 0.55, pan: 0.0, rev: 0.15 },
  },
  patterns: {
    ...K4,
    compJ: { kind: 'chord', voices: 4, steps: [[0, 0.4, 0.55], [1.5, 0.6, 0.7], [3, 0.3, 0.45], [3.5, 0.4, 0.6]] },
  },
  drumPatterns: {
    intro: { ride: 'x...x.x.x...x.x.', hat: '....x.......x...' },
    A: { ride: 'x...x.x.x...x.x.', hat: '....x.......x...', brush: 'o.o.o.o.o.o.o.o.', kick: 'x.........o.....' },
    B: { ride: 'x...x.x.x...x.x.', hat: '....x.......x...', brush: 'o.o.o.o.o.o.o.o.', kick: 'x.....o...o.....', rim: (bi) => (bi === 7 ? '....x...x.x.x...' : '......o.........') },
    A3: { ride: 'x...x.x.x...x.x.', hat: '....x.......x...', brush: 'o.o.o.o.o.o.o.o.', kick: 'x.........o.....', snare: (bi) => (bi === 7 ? '....o...o.o.o.oo' : '................') },
  },
  sections: {
    intro: {
      chords: ['Ab7', 'G7'],
      gen: { bass: 'bassWalk', piano: 'compJ' },
      drums: 'intro',
      parts: { whistle: [R, 'r:h r:e B4:e D5:e F5:e'] },
    },
    A: {
      chords: A1_CHORDS,
      gen: { bass: 'bassWalk', piano: 'compJ' },
      drums: 'A',
      parts: { whistle: A1_MEL },
    },
    A2: {
      chords: ['Cm7', 'Bbm7 Eb7', 'Abmaj7', 'Abm7', 'Dm7b5', 'G7', 'Cm7', 'G7'],
      gen: { bass: 'bassWalk', piano: 'compJ' },
      drums: 'A',
      parts: {
        whistle: [
          'G4:e Bb4:e C5:e Eb5:e G5:q. Eb5:e',
          'Db5:e C5:e Bb4:q G4:e Bb4:e Db5:q',
          'C5:q. Eb5:e G5:q Ab5:q',
          'Gb5:q. F5:e Eb5:h',
          'D5:e F5:e Ab5:e C6:e Bb5:q Ab5:q',
          'G5:q. F5:e D5:q B4:q',
          'C5:h. r:q',
          'r:h D5:e F5:e Ab5:e B4:e',
        ],
      },
    },
    B: {
      chords: ['Fm7', 'Bb7', 'Ebmaj7', 'Abmaj7', 'Dm7b5', 'G7', 'Cm7', 'G7'],
      gen: { bass: 'bassWalk', piano: 'compJ', pad: 'hold' },
      drums: 'B',
      parts: {
        whistle: [
          'C5:q. Ab4:e F4:q Ab4:q',
          'D5:q F5:q Ab5:q. G5:e',
          'G5:h Bb4:q D5:q',
          'C5:h. r:q',
          'F5:q. Ab5:e C6:q Ab5:q',
          'B5:q G5:q F5:q D5:q',
          'Eb5:q. D5:e C5:q G4:q',
          'F4:e Ab4:e B4:e D5:e F5:q G4:q',
        ],
      },
    },
    A3: {
      chords: A1_CHORDS,
      gen: { bass: 'bassWalk', piano: 'compJ' },
      drums: 'A3',
      parts: { whistle: A1_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'A2', 'B', 'A3'] },
};
