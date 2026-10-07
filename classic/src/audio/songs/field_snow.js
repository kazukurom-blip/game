// 雪原・雪の頂の曲「白い風の雪原」。オリジナル曲。
// 冷たい風と白い世界。ストリングスが長い音で歌い、ハープとパッドが雪のように包む。
// B は G 長調で少し日が差し、ベルが高い所で歌う。
// E 短調・4/4・104 BPM。イントロ 2 → A 16 → B 8 → A' 8。ループ 32 小節 ≒ 73.8 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Em', 'Cmaj7', 'Am7', 'B7', 'Em', 'G', 'Am', 'B',
  'C', 'D', 'Bm7', 'Em', 'Am7', 'D', 'B7sus4', 'B7'];
const R = 'r:w';
const A_MEL = [
  'B4:h E5:q. F#5:e',
  'G5:h. E5:q',
  'C6:h B5:q. A5:e',
  'F#5:w',
  'G5:q. F#5:e E5:q B4:q',
  'D5:h. B4:q',
  'C5:q. D5:e E5:q A5:q',
  'F#5:h. D#5:q',
  'E5:q. G5:e C6:h',
  'A5:q. F#5:e D5:h',
  'F#5:q. A5:e D6:q B5:q',
  'G5:w',
  'A5:q. G5:e E5:q C5:q',
  'D5:q. E5:e F#5:q A5:q',
  'E5:w',
  'D#5:h. r:q',
];

export default {
  id: 'field_snow',
  title: '白い風の雪原',
  bpm: 104,
  beatsPerBar: 4,
  key: 'E minor',
  seed: 7717,
  tracks: {
    violin: { inst: 'strings', melody: true, range: [59, 88], vol: 1.15, pan: 0.05, rev: 0.4 },
    bell: { inst: 'bell', range: [74, 100], vol: 0.5, pan: 0.35, rev: 0.5 },
    harp: { inst: 'harp', range: [40, 84], voiceLo: 52, vol: 0.7, pan: -0.3, rev: 0.45 },
    pad: { inst: 'pad', range: [47, 74], voiceLo: 52, vol: 0.5, pan: 0.2, rev: 0.55 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.5, pan: 0.0, rev: 0.05 },
    drums: { inst: 'drums', vol: 0.4, pan: 0.0, rev: 0.35 },
  },
  patterns: {
    ...K4,
    bellIce: { kind: 'arp', steps: [[1.5, 5, 1, 0.4], [3.5, 6, 0.5, 0.35]] },
  },
  drumPatterns: {
    intro: { tri: ['x...............', '................'], shaker: '..o.......o.....' },
    A: { kick: 'x.......x.......', shaker: '..o...o...o...o.', tri: ['x...............', '................', '................', '................'] },
    B: { kick: 'x...............', shaker: 'o.o.o.o.o.o.o.o.', timp: (bi) => (bi === 7 ? 'x...x...x.x.x.x.' : '................') },
    A2: { kick: 'x.......x.......', snare: '........o.......', shaker: '..o...o...o...o.', crash: (bi) => (bi === 0 ? 'x...............' : '................') },
  },
  sections: {
    intro: {
      chords: ['Em', 'B7sus4'],
      gen: { harp: 'arpUp', pad: 'hold' },
      drums: 'intro',
      parts: { violin: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'arpUp', pad: 'hold', bass: 'bass2', bell: 'bellIce' },
      drums: 'A',
      mix: { bell: 0.6 },
      parts: { violin: A_MEL },
    },
    B: {
      chords: ['G', 'D/F#', 'Em', 'C', 'G', 'D', 'C', 'B7'],
      gen: { harp: 'arp8', pad: 'hold', bass: 'bass2w' },
      drums: 'B',
      parts: { bell: ['B5:q. D6:e G6:h', 'F#6:q. E6:e D6:h', 'E6:q. B5:e G5:h', 'E6:q. D6:e C6:h', 'B5:q. D6:e G6:h', 'A6:q. F#6:e D6:h', 'E6:h C6:h', 'D#6:h. B5:q'] },
      mix: { bell: 1.2 },
    },
    A2: {
      chords: A_CHORDS.slice(0, 8),
      gen: { harp: 'arp8', pad: 'hold', bass: 'bass2w', bell: 'bellIce' },
      drums: 'A2',
      mix: { bell: 0.6 },
      parts: { violin: A_MEL.slice(0, 8) },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
