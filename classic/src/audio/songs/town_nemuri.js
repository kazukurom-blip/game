// ねむり谷（V600）の曲「湯けむりの谷」。オリジナル曲。
// 薄暗い森の底の静けさと湯気。木琴がぽつぽつ歌い、B ではハープが受け取る。パッドが湯気のように包む。
// F# 短調・4/4・76 BPM。イントロ 2 → A 8 → B 8（D 長調寄り）→ A' 8。ループ 24 小節 ≒ 75.8 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['F#m', 'Dmaj7', 'Bm7', 'C#7sus4 C#7', 'F#m', 'Amaj7', 'Bm7 E', 'F#m'];
const A_MEL = [
  'C#5:q. A4:e F#4:q A4:q',
  'C#5:e D5:e E5:q F#5:h',
  'D5:q. C#5:e B4:q F#4:q',
  'B4:h G#4:q E#4:q',
  'A4:q C#5:q F#5:q E5:e C#5:e',
  'E5:q. G#5:e E5:q C#5:q',
  'D5:q B4:q G#4:q E5:q',
  'F#4:h. r:q',
];
const R = 'r:w';

export default {
  id: 'town_nemuri',
  title: '湯けむりの谷',
  bpm: 76,
  beatsPerBar: 4,
  key: 'F# minor',
  seed: 6808,
  tracks: {
    marimba: { inst: 'marimba', melody: true, range: [60, 86], vol: 1.35, pan: 0.1, rev: 0.4, human: 0.006 },
    harp: { inst: 'harp', range: [40, 84], voiceLo: 52, vol: 0.7, pan: -0.25, rev: 0.45 },
    pad: { inst: 'pad', range: [48, 74], voiceLo: 52, vol: 0.55, pan: 0.15, rev: 0.55 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.45, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.35, pan: 0.0, rev: 0.4 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { drip: ['....o...........', '..........o.....'] },
    A: { drip: ['....o...........', '..........o.....', '................', '......o.......o.'], shaker: '........o.......', block: ['................', '................', '................', '............o...'] },
    B: { drip: ['..o.............', '..........o.....'], tri: ['x...............', '................', '................', '................'] },
  },
  sections: {
    intro: {
      chords: ['F#m', 'C#7'],
      gen: { pad: 'hold', harp: 'arpSlow' },
      drums: 'intro',
      parts: { marimba: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { pad: 'hold', harp: 'arpSlow', bass: 'bass2' },
      drums: 'A',
      parts: { marimba: A_MEL },
    },
    B: {
      chords: ['Dmaj7', 'E', 'C#m7', 'F#m7', 'Bm7', 'E', 'Amaj7', 'C#7'],
      gen: { pad: 'hold', bass: 'bassLong' },
      drums: 'B',
      parts: {
        harp: [
          'A4:q. B4:e C#5:h',
          'B4:q. G#4:e E4:h',
          'G#4:q B4:q E5:h',
          'C#5:h. r:q',
          'D5:q. C#5:e B4:q A4:q',
          'G#4:h B4:h',
          'C#5:q. E5:e A5:h',
          'G#5:h E#5:h',
        ],
      },
      mix: { harp: 1.5 },
    },
    A2: {
      chords: A_CHORDS,
      gen: { pad: 'hold', harp: 'arpQ', bass: 'bass2' },
      drums: 'A',
      mix: { harp: 0.8 },
      parts: { marimba: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
