// ティンクル（T100）の曲「ブリキのマーチ」。オリジナル曲。
// おもちゃのマーチ。グロッケンとオルゴールが付点のはずむ旋律、ファゴット風の低い木管が「ブン・ブン」、おもちゃの小太鼓。
// 中の段（B）はおもちゃのラッパ（小さな金管）が F 長調で歌う。
// C 長調・4/4・132 BPM。イントロ 2 → A 16 → B 8 → A' 16。ループ 40 小節 ≒ 72.7 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['C', 'C', 'G7', 'C', 'F', 'C', 'D7', 'G7',
  'C', 'C', 'F', 'Fm', 'C/G', 'G7', 'C', 'G7'];
const R = 'r:w';
const A_MEL = [
  'C5:q. E5:e G5:q C6:q',
  'B5:e. A5:s G5:q E5:h',
  'F5:q. D5:e B4:q D5:q',
  'E5:q G5:q C5:h',
  'A5:q. F5:e C5:q F5:q',
  'G5:e. E5:s C5:q G4:h',
  'F#5:q. A5:e D6:q C6:q',
  'B5:h. r:q',
  'C5:q. E5:e G5:q C6:q',
  'D6:e. C6:s B5:q A5:q G5:q',
  'A5:q. C6:e A5:q F5:q',
  'Ab5:q. G5:e F5:q C5:q',
  'E5:q G5:q C6:q E5:q',
  'D5:e. E5:s F5:q G5:q B4:q',
  'C5:h. r:q',
  'G4:e. A4:s B4:q D5:q F5:q',
];

export default {
  id: 'town_tinkle',
  title: 'ブリキのマーチ',
  bpm: 132,
  beatsPerBar: 4,
  key: 'C major',
  seed: 7010,
  tracks: {
    glock: { inst: 'bell', melody: true, range: [64, 100], vol: 0.95, pan: 0.15, rev: 0.25 },
    mbox: { inst: 'musicbox', range: [55, 90], voiceLo: 64, vol: 0.6, pan: -0.25, rev: 0.25 },
    trumpet: { inst: 'brass', range: [58, 88], vol: 0.6, pan: 0.05, rev: 0.25 },
    bassoon: { inst: 'clarinet', range: [40, 64], vol: 0.6, pan: 0.0, rev: 0.1, gate: 0.55 },
    pizz: { inst: 'pizz', range: [48, 80], voiceLo: 55, vol: 0.45, pan: 0.35, rev: 0.15 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.12 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { snare: ['x..ox..ox..ox.o.', 'x..ox..ox.oox...'], kick: 'x.......x.......' },
    A: { snare: 'x..o....x..o..o.', kick: 'x.......x.......', block: '....o.......o...' },
    B: { snare: 'o.......o.......', kick: 'x.......x.......', tri: ['x...............', '................'] },
    A2: {
      snare: (bi) => (bi === 15 ? 'x..ox..ox.oox.xx' : 'x..o....x..o..o.'),
      kick: 'x.......x.......',
      block: '....o.......o...',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['C', 'G7'],
      gen: { bassoon: 'bassPolka', mbox: 'chuck' },
      drums: 'intro',
      parts: { glock: [R, 'r:h r:q G4:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { bassoon: 'bassPolka', mbox: 'chuck8' },
      drums: 'A',
      parts: { glock: A_MEL },
    },
    B: {
      chords: ['F', 'F', 'C7', 'F', 'Bb', 'F', 'G7', 'C7'],
      gen: { bassoon: 'bass2', pizz: 'arpQ', mbox: 'chuck' },
      drums: 'B',
      parts: {
        trumpet: ['C5:h A4:q C5:q', 'F5:h. r:q', 'E5:q. F5:e G5:q Bb5:q', 'A5:h F5:h', 'D5:q. F5:e Bb5:q D6:q', 'C6:q. A5:e F5:q C5:q', 'D5:q G5:q B5:q A5:q', 'G5:h. r:q'],
        glock: [R, R, R, R, R, R, R, 'r:h r:q G4:q'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { bassoon: 'bassPolka', mbox: 'chuck8', pizz: 'arp8', trumpet: 'chuck' },
      drums: 'A2',
      mix: { trumpet: 0.45, pizz: 0.7 },
      parts: { glock: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
