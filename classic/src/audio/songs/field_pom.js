// ポム丘の丘・花畑の曲「花畑のピクニック」。オリジナル曲。
// 花畑でピクニック。シャッフル（はねる 8 分）で、笛が楽しく歌い、ギターの分散和音とアコーディオンの「ンチャ」。
// B ではアコーディオンが C 長調で旋律を受け取る。
// G 長調・4/4・116 BPM（シャッフル）。イントロ 2 → A 16 → B 8 → A' 16。ループ 40 小節 ≒ 82.8 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['G', 'Em7', 'Am7', 'D7', 'G', 'C', 'A7', 'D7',
  'G', 'G7', 'C', 'Cm6', 'G/D', 'E7', 'Am7 D7', 'G'];
const R = 'r:w';
const A_MEL = [
  'D5:e G5:e B5:e G5:e A5:q G5:q',
  'E5:q. D5:e B4:h',
  'C5:e E5:e A5:e E5:e G5:q E5:q',
  'F#5:h. r:q',
  'D5:e G5:e B5:e D6:e B5:q G5:q',
  'A5:q. G5:e E5:h',
  'C#5:e E5:e G5:e A5:e G5:q E5:q',
  'D5:h. r:q',
  'D5:e G5:e B5:e G5:e A5:q G5:q',
  'F5:q. D5:e B4:h',
  'E5:e G5:e C6:e G5:e E5:q C5:q',
  'Eb5:q. D5:e C5:h',
  'B4:e D5:e G5:e B5:e A5:q G5:q',
  'G#5:q. F#5:e E5:h',
  'A5:q C6:q F#5:q A5:q',
  'G5:h. r:q',
];

export default {
  id: 'field_pom',
  title: '花畑のピクニック',
  bpm: 116,
  swing: 0.14,
  beatsPerBar: 4,
  key: 'G major',
  seed: 7414,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 92], vol: 0.95, pan: 0.1, rev: 0.25 },
    accLead: { inst: 'accordion', range: [60, 86], vol: 0.85, pan: -0.05, rev: 0.22 },
    acc: { inst: 'accordion', range: [52, 77], voiceLo: 55, vol: 0.45, pan: 0.3, rev: 0.18 },
    guitar: { inst: 'guitar', range: [40, 76], voiceLo: 52, vol: 0.65, pan: -0.3, rev: 0.15, human: 0.006 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.55, pan: 0.0, rev: 0.04 },
    drums: { inst: 'drums', vol: 0.45, pan: 0.0, rev: 0.12 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { kick: 'x.......x.......', shaker: 'o.o.o.o.o.o.o.o.' },
    A: { kick: 'x.......x.......', brush: '....o.......o...', shaker: 'o.o.o.o.o.o.o.o.', block: '......o.......o.' },
    B: { kick: 'x.......x.......', shaker: 'o.o.o.o.o.o.o.o.', clap: '....o.......o...' },
    A2: {
      kick: 'x.......x.x.....',
      snare: '....o.......o...',
      shaker: 'o.o.o.o.o.o.o.o.',
      tamb: '..o...o...o...o.',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['C', 'D7'],
      gen: { guitar: 'arp8', bass: 'bass2' },
      drums: 'intro',
      parts: { flute: [R, 'r:h. C5:e C#5:e'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { guitar: 'arp8', bass: 'bass2w', acc: 'chuck' },
      drums: 'A',
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['C', 'D', 'Bm7', 'Em', 'Am7', 'D', 'G', 'D7'],
      gen: { guitar: 'arp8', bass: 'bassWalk' },
      drums: 'B',
      parts: {
        accLead: ['E5:q. G5:e C6:q B5:q', 'A5:h F#5:h', 'D5:q F#5:q A5:q. G5:e', 'G5:h E5:h', 'C5:q E5:q A5:q G5:q', 'F#5:h. D5:q', 'B4:q D5:q G5:q B5:q', 'A5:h. r:q'],
        flute: [R, R, R, R, R, R, R, 'r:h. C5:e C#5:e'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { guitar: 'arp8', bass: 'bass2w', acc: 'chuck8' },
      drums: 'A2',
      mix: { acc: 0.8 },
      parts: { flute: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
