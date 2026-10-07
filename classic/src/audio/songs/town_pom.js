// ポム丘（V200）の曲「風車の丘のワルツ」。オリジナル曲。
// のどかな丘と風車のワルツ。笛が歌い、アコーディオンが 2・3 拍目で「ンチャチャ」、ピチカートとベース。
// 終わりの段（C）はアコーディオンが旋律を受け取る。
// F 長調・3/4・104 BPM。イントロ 2 → A 16 → B 8（D 短調）→ A' 16 → C 8。ループ 48 小節 ≒ 83.1 秒。
import { K3 } from './_kit.js';

const A_CHORDS = ['F', 'Am', 'Bb', 'C7', 'F', 'Dm', 'G7', 'C7',
  'F', 'F7', 'Bb', 'Bbm6', 'F/C', 'D7', 'Gm7 C7', 'F'];
const R = 'r:h.';
const A_MEL = [
  'C5:q F5:q A5:q',
  'C6:h.',
  'Bb5:q A5:q G5:q',
  'E5:h C5:q',
  'F5:q A5:q C6:q',
  'D6:h A5:q',
  'B5:q A5:q G5:q',
  'G5:h.',
  'A5:q. G5:e F5:q',
  'Eb5:h C5:q',
  'D5:q F5:q Bb5:q',
  'Db6:h Bb5:q',
  'A5:q. G5:e F5:q',
  'F#5:h D5:q',
  'G5:q. E5:e C5:q',
  'F5:h.',
];

export default {
  id: 'town_pom',
  title: '風車の丘のワルツ',
  bpm: 104,
  beatsPerBar: 3,
  key: 'F major',
  meter: '3/4',
  seed: 6404,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 92], vol: 0.95, pan: 0.1, rev: 0.28 },
    acc: { inst: 'accordion', range: [53, 86], voiceLo: 57, vol: 0.55, pan: -0.25, rev: 0.2 },
    pizz: { inst: 'pizz', range: [48, 80], voiceLo: 55, vol: 0.6, pan: 0.3, rev: 0.2 },
    bell: { inst: 'bell', range: [74, 100], voiceLo: 77, vol: 0.28, pan: 0.4, rev: 0.4 },
    bass: { inst: 'bass', range: [29, 53], vol: 0.55, pan: 0.0, rev: 0.05 },
    drums: { inst: 'drums', vol: 0.42, pan: 0.0, rev: 0.15 },
  },
  patterns: {
    ...K3,
    bellW: { kind: 'arp', steps: [[2, 4, 1, 0.45]] },
  },
  // 1 小節 = 16 分 × 12
  drumPatterns: {
    intro: { kick: 'x...........', tri: ['x...........', '............'] },
    A: { kick: 'x...........', block: '....o...o...' },
    B: { kick: 'x...........', shaker: 'o.o.o.o.o.o.' },
    A2: { kick: 'x...........', block: '....o...o...', tamb: '....o...o...', crash: (bi) => (bi === 0 ? 'x...........' : '............') },
    C: { kick: 'x...........', tamb: '....o...o...', tri: ['x...........', '............', '............', '............'] },
  },
  sections: {
    intro: {
      chords: ['F', 'C7'],
      gen: { acc: 'oomPah', bass: 'bassW' },
      drums: 'intro',
      parts: { flute: [R, 'r:h C5:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { acc: 'oomPah', bass: 'bassW' },
      drums: 'A',
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Dm', 'A7', 'Dm', 'D7', 'Gm', 'C7', 'F', 'A7'],
      gen: { pizz: 'arpW', bass: 'bassW2', acc: 'hold' },
      drums: 'B',
      mix: { acc: 0.6 },
      parts: {
        flute: [
          'A5:q. G5:e F5:q',
          'E5:h C#5:q',
          'D5:q F5:q A5:q',
          'C6:h.',
          'Bb5:q. A5:e G5:q',
          'E5:h G5:q',
          'A5:q F5:q C5:q',
          'C#5:h E5:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { acc: 'oomPah', bass: 'bassW', pizz: 'arpW', bell: 'bellW' },
      drums: 'A2',
      mix: { pizz: 0.7 },
      parts: { flute: A_MEL },
    },
    C: {
      chords: ['Bb', 'F', 'C7', 'F', 'Bb', 'F', 'G7', 'C7'],
      gen: { pizz: 'arpW', bass: 'bassW' },
      drums: 'C',
      parts: {
        acc: [
          'D5:q F5:q Bb5:q',
          'A5:q F5:q C5:q',
          'E5:q G5:q Bb5:q',
          'A5:h.',
          'F5:q Bb5:q D6:q',
          'C6:q A5:q F5:q',
          'B4:q D5:q F5:q',
          'E5:h.',
        ],
        flute: [R, R, R, R, R, R, R, 'r:h C5:q'],
      },
      mix: { acc: 1.4 },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'C'] },
};
