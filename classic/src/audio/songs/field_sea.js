// 海の中の曲「ゆらめく海の道」。オリジナル曲。
// ゆらゆら、広い海。合唱風の声（「あー」）がゆっくり歌い、ハープの 8 分の分散和音が水のように流れ、パッドと泡の音。
// B は D 短調で少し深く潜り、ベルが歌う。
// F 長調・4/4・88 BPM。イントロ 2 → A 16 → B 8 → A' 8。ループ 32 小節 ≒ 87.3 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Fmaj7', 'Gm7', 'Am7', 'Bbmaj7', 'Fmaj7', 'Dm7', 'Gm7', 'C7sus4',
  'Fmaj7', 'Am7', 'Bbmaj7', 'Bbm6', 'Am7', 'Dm7', 'Gm7', 'C7sus4'];
const R = 'r:w';
const A_MEL = [
  'A4:h. C5:q',
  'D5:h Bb4:h',
  'C5:h. E5:q',
  'D5:w',
  'C5:q. A4:e F4:q A4:q',
  'F5:h. D5:q',
  'Bb4:q. D5:e F5:q A5:q',
  'G5:w',
  'A5:h. G5:q',
  'E5:h C5:h',
  'D5:q. F5:e A5:q F5:q',
  'Db5:h. C5:q',
  'C5:q. E5:e A5:q G5:q',
  'F5:h. C5:q',
  'D5:q. F5:e Bb5:q A5:q',
  'G5:h F5:h',
];

export default {
  id: 'field_sea',
  title: 'ゆらめく海の道',
  bpm: 88,
  beatsPerBar: 4,
  key: 'F major',
  seed: 7818,
  tracks: {
    voice: { inst: 'choir', melody: true, range: [60, 84], vol: 1.6, pan: 0.05, rev: 0.5 },
    bell: { inst: 'bell', range: [76, 100], vol: 0.5, pan: 0.35, rev: 0.55 },
    harp: { inst: 'harp', range: [41, 84], voiceLo: 53, vol: 0.65, pan: -0.3, rev: 0.45 },
    pad: { inst: 'pad', range: [48, 74], voiceLo: 53, vol: 0.45, pan: 0.2, rev: 0.55 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.5, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.4, pan: 0.0, rev: 0.4 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { bubble: ['......o.........', '..o.......o.....'] },
    A: { bubble: ['......o.........', '..o.......o.....', '................', '....o.....o.....'], shaker: '....o.......o...', kick: 'x...............' },
    B: { bubble: ['..o...o.........', '..........o.o...'], tri: ['x...............', '................'], kick: 'x.......x.......' },
  },
  sections: {
    intro: {
      chords: ['Bbmaj7', 'C7sus4'],
      gen: { harp: 'arp8', pad: 'hold' },
      drums: 'intro',
      parts: { voice: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'arp8', pad: 'hold', bass: 'bass2' },
      drums: 'A',
      parts: { voice: A_MEL },
    },
    B: {
      chords: ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Gm7', 'Bbmaj7', 'C7'],
      gen: { harp: 'arpUp', pad: 'hold', bass: 'bassLong' },
      drums: 'B',
      parts: { bell: ['A5:h. D6:q', 'F6:h D6:h', 'E6:h. G6:q', 'E6:h C6:h', 'D6:q. E6:e F6:q A6:q', 'G6:h D6:h', 'F6:q. E6:e D6:q A5:q', 'C6:h E6:h'] },
    },
    A2: {
      chords: A_CHORDS.slice(0, 8),
      gen: { harp: 'arp8', pad: 'hold', bass: 'bass2' },
      drums: 'A',
      parts: { voice: A_MEL.slice(0, 8) },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
