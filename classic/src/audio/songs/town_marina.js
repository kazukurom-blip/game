// マリナ（M100）の曲「泡の灯の都」。オリジナル曲。
// 海の底、泡の光、ゆったり。カリンバ（親指ピアノ）が 6/8 でゆれる旋律、ハープの分散和音、柔らかいパッド、泡の音。
// B ではハープが旋律を受け取る。
// A♭ 長調・6/8・付点 4 分 = 60。8 分音符を 1 拍として書く（beatsPerBar 6・bpm 180）。
//   → 長さの文字は q = 8 分、h = 4 分、h. = 付点 4 分、w. = 1 小節。
// イントロ 2 → A 16 → B 8（F 短調）→ A' 16。ループ 40 小節 = 80 秒。
import { K6 } from './_kit.js';

const A_CHORDS = ['Ab', 'Fm7', 'Dbmaj7', 'Eb', 'Cm7', 'Fm7', 'Bbm7', 'Eb7',
  'Ab', 'Ab/C', 'Dbmaj7', 'Dbm6', 'Ab/Eb', 'Fm7', 'Bbm7 Eb7', 'Ab'];
const R = 'r:w.';
const A_MEL = [
  'Eb5:h. C5:q Eb5:q Ab5:q',
  'G5:h F5:q C5:h.',
  'F5:h. Ab5:q C6:q Ab5:q',
  'G5:w.',
  'Eb5:h G5:q Bb5:h G5:q',
  'Ab5:h. Eb5:h.',
  'Db5:h F5:q Ab5:h F5:q',
  'G5:h. r:h.',
  'Eb5:h. C5:q Eb5:q Ab5:q',
  'C6:h Bb5:q Ab5:h.',
  'F5:h. Ab5:h C6:q',
  'Bb5:h. Ab5:h Fb5:q',
  'Eb5:h. Ab5:h.',
  'C6:h Ab5:q F5:h.',
  'Db5:h F5:q G5:h Bb5:q',
  'Ab5:w.',
];

export default {
  id: 'town_marina',
  title: '泡の灯の都',
  bpm: 180,
  beatsPerBar: 6,
  key: 'Ab major',
  meter: '6/8',
  seed: 7111,
  tracks: {
    kalimba: { inst: 'kalimba', melody: true, range: [60, 88], vol: 1.3, pan: 0.1, rev: 0.45 },
    harp: { inst: 'harp', range: [40, 84], voiceLo: 51, vol: 0.65, pan: -0.3, rev: 0.45 },
    pad: { inst: 'pad', range: [48, 75], voiceLo: 51, vol: 0.55, pan: 0.2, rev: 0.55 },
    bell: { inst: 'bell', range: [75, 100], voiceLo: 79, vol: 0.25, pan: 0.4, rev: 0.55 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.45, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.4, pan: 0.0, rev: 0.35 },
  },
  patterns: {
    ...K6,
    bellBub: { kind: 'arp', steps: [[4, 5, 2, 0.4]] },
  },
  // 1 小節 = 16 分 × 12
  drumPatterns: {
    intro: { bubble: ['....o.......', '........o...'] },
    A: { bubble: ['....o.......', '..........o.', '......o.....', '............'], shaker: 'o.....o.....', tri: ['x...........', '............', '............', '............'] },
    B: { bubble: ['..o.....o...', '......o.....'], shaker: 'o...o...o...' },
    A2: { bubble: ['....o.......', '..........o.'], shaker: 'o.....o.....', kick: 'x...........' },
  },
  sections: {
    intro: {
      chords: ['Dbmaj7', 'Eb7'],
      gen: { harp: 'arp68', pad: 'hold' },
      drums: 'intro',
      parts: { kalimba: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'arp68', pad: 'hold', bass: 'bass68' },
      drums: 'A',
      mix: { pad: 0.8 },
      parts: { kalimba: A_MEL },
    },
    B: {
      chords: ['Fm', 'Db', 'Bbm', 'C7', 'Fm', 'Db', 'Bbm7', 'Eb7'],
      gen: { pad: 'hold', bass: 'bass68', bell: 'bellBub' },
      drums: 'B',
      parts: {
        harp: ['C5:h. F5:h.', 'Ab5:h. F5:h Db5:q', 'Bb4:h Db5:q F5:h.', 'E5:h. G5:h.', 'Ab5:h G5:q F5:h C5:q', 'Db5:h. F5:h.', 'Bb5:h. Ab5:h F5:q', 'G5:h. Eb5:h.'],
      },
      mix: { harp: 1.6 },
    },
    A2: {
      chords: A_CHORDS,
      gen: { harp: 'arp68', pad: 'hold', bass: 'bass68', bell: 'bellBub' },
      drums: 'A2',
      mix: { harp: 0.85 },
      parts: { kalimba: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
