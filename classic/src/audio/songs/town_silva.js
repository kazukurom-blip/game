// シルワ森都（V300）の曲「ランタンの森都」。オリジナル曲。
// 夕暮れの森とランタン、少し不思議。3 拍子でハープが流れ、笛がドリア（C# の明るい 6 度）で歌う。ストリングスとベル。
// E ドリア・3/4・84 BPM。イントロ 2 → A 16 → B 8（G 寄りで少し明るく）→ A' 16。ループ 40 小節 ≒ 85.7 秒。
import { K3 } from './_kit.js';

const A_CHORDS = ['Em7', 'A', 'Em7', 'A', 'Cmaj7', 'D', 'Bm7', 'Em7',
  'Em7', 'A', 'Gmaj7', 'D', 'Cmaj7', 'Bm7', 'Em7', 'A'];
const R = 'r:h.';
const A_MEL = [
  'E5:h B4:q',
  'C#5:q D5:q E5:q',
  'G5:h F#5:q',
  'E5:h.',
  'G5:q. A5:e B5:q',
  'A5:h F#5:q',
  'D5:q F#5:q A5:q',
  'G5:h.',
  'B5:h G5:q',
  'A5:q. G5:e E5:q',
  'F#5:h D5:q',
  'A4:q D5:q F#5:q',
  'E5:h B4:q',
  'D5:q C#5:q B4:q',
  'E5:h.',
  'r:q C#5:q D5:q',
];

export default {
  id: 'town_silva',
  title: 'ランタンの森都',
  bpm: 84,
  beatsPerBar: 3,
  key: 'E dorian',
  meter: '3/4',
  seed: 6505,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 90], vol: 0.9, pan: 0.12, rev: 0.4 },
    harp: { inst: 'harp', range: [40, 84], voiceLo: 52, vol: 0.8, pan: -0.3, rev: 0.4 },
    strings: { inst: 'strings', range: [50, 79], voiceLo: 55, vol: 0.38, pan: 0.15, rev: 0.45 },
    bell: { inst: 'bell', range: [74, 100], voiceLo: 76, vol: 0.28, pan: 0.45, rev: 0.55 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.45, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.35, pan: 0.0, rev: 0.25 },
  },
  patterns: {
    ...K3,
    bellW: { kind: 'arp', steps: [[1.5, 5, 1, 0.4]] },
  },
  drumPatterns: {
    intro: { tri: ['x...........', '............'] },
    A: { shaker: '....o...o...', tri: ['x...........', '............', '............', '............'] },
    B: { shaker: 'o...o...o...', drip: ['............', '......o.....'] },
    A2: { shaker: '....o...o...', kick: 'x...........', tri: ['x...........', '............'] },
  },
  sections: {
    intro: {
      chords: ['Em7', 'A'],
      gen: { harp: 'arpW6', strings: 'hold' },
      drums: 'intro',
      parts: { flute: [R, 'r:h B4:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'arpW6', bass: 'bassW2' },
      drums: 'A',
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Cmaj7', 'D', 'Bm7', 'Em7', 'Am7', 'D', 'F#m7b5', 'B7'],
      gen: { harp: 'arpW', bass: 'bassW2', strings: 'hold', bell: 'bellW' },
      drums: 'B',
      parts: {
        flute: [
          'G5:q. A5:e B5:q',
          'A5:h F#5:q',
          'D5:q F#5:q B5:q',
          'G5:h E5:q',
          'C6:q. B5:e A5:q',
          'F#5:h A5:q',
          'C6:h A5:q',
          'D#5:h B4:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { harp: 'arpW6', bass: 'bassW2', strings: 'hold', bell: 'bellW' },
      drums: 'A2',
      mix: { strings: 0.8 },
      parts: { flute: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
