// ヒョウガ村（F100）の曲「暖炉の灯る雪村」。オリジナル曲。
// 雪と暖炉の温かさ。ピアノがやさしいワルツを弾き、ストリングスが包む。B は雪が降るようにベルが歌う。
// A 長調・3/4・84 BPM。イントロ 2 → A 16 → B 8（F# 短調）→ A' 16。ループ 40 小節 ≒ 85.7 秒。
import { K3 } from './_kit.js';

const A_CHORDS = ['A', 'Dmaj7', 'A', 'E', 'F#m', 'D', 'Bm7', 'E7sus4',
  'A', 'Dmaj7', 'C#m7', 'F#m', 'Bm7', 'E7', 'A', 'A'];
const R = 'r:h.';
const A_MEL = [
  'E5:q A5:q C#6:q',
  'B5:h A5:q',
  'C#5:q E5:q A5:q',
  'G#5:h.',
  'A5:q. B5:e C#6:q',
  'D6:h F#5:q',
  'A5:q F#5:q D5:q',
  'E5:h.',
  'E5:q A5:q C#6:q',
  'E6:h D6:q',
  'C#6:q. B5:e G#5:q',
  'A5:h F#5:q',
  'D5:q F#5:q B5:q',
  'G#5:h D5:q',
  'C#5:h.',
  'r:h E5:q',
];

export default {
  id: 'town_hyoga',
  title: '暖炉の灯る雪村',
  bpm: 84,
  beatsPerBar: 3,
  key: 'A major',
  meter: '3/4',
  seed: 6909,
  tracks: {
    piano: { inst: 'piano', melody: true, range: [60, 90], vol: 1.1, pan: 0.05, rev: 0.35, human: 0.006 },
    lh: { inst: 'piano', range: [40, 72], voiceLo: 52, vol: 0.55, pan: -0.15, rev: 0.3, human: 0.006 },
    bell: { inst: 'bell', range: [76, 100], voiceLo: 79, vol: 0.45, pan: 0.35, rev: 0.5 },
    strings: { inst: 'strings', range: [50, 79], voiceLo: 55, vol: 0.4, pan: -0.2, rev: 0.45 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.42, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.32, pan: 0.0, rev: 0.25 },
  },
  patterns: { ...K3 },
  drumPatterns: {
    intro: { tri: ['x...........', '............'] },
    A: { tamb: '....o...o...' },
    B: { tri: ['x...........', '............'], shaker: 'o...o...o...' },
    A2: { tamb: '....o...o...', kick: 'x...........' },
  },
  sections: {
    intro: {
      chords: ['Dmaj7', 'E7sus4'],
      gen: { lh: 'arpW6', strings: 'hold' },
      drums: 'intro',
      parts: { bell: ['F#6:h. ', 'E6:h B5:q'], piano: [R, 'r:h E5:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { lh: 'arpW', bass: 'bassW' },
      drums: 'A',
      parts: { piano: A_MEL },
    },
    B: {
      chords: ['F#m', 'C#m', 'D', 'A', 'Bm', 'C#7', 'F#m', 'E7'],
      gen: { lh: 'arpW6', bass: 'bassW2', strings: 'hold' },
      drums: 'B',
      parts: {
        bell: ['C#6:h.', 'G#5:q. B5:e E6:q', 'F#6:h D6:q', 'E6:h C#6:q', 'D6:q. C#6:e B5:q', 'E#5:h G#5:q', 'A5:q. G#5:e F#5:q', 'G#5:h B5:q'],
        piano: [R, R, R, R, R, R, R, 'r:h E5:q'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { lh: 'arpW6', bass: 'bassW', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.75 },
      parts: { piano: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
