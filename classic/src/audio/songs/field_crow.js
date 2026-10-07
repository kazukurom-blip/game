// クロウ街の工事現場・地下鉄の曲「終電のない地下鉄」。オリジナル曲。
// 夜の工事現場と地下鉄。エレピ風の鍵盤が旋律、はねるベース、16 分のハイハット、ときどき金床の「かーん」。
// B はストリングスが G♭ 長調で少し遠くを見る。
// E♭ 短調・4/4・112 BPM。イントロ 2 → A 16 → B 8 → A' 16。ループ 40 小節 ≒ 85.7 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Ebm7', 'Ebm7', 'Bmaj7', 'Bb7', 'Ebm7', 'Abm7', 'Fm7b5 Bb7', 'Ebm7',
  'Ebm7', 'Db', 'Bmaj7', 'Bb7', 'Abm7', 'Bmaj7', 'Fm7b5 Bb7', 'Ebm7'];
const R = 'r:w';
const A_MEL = [
  'Bb4:e Db5:e Eb5:q r:e Gb5:e F5:e Db5:e',
  'Eb5:q. Bb4:e r:h',
  'Eb5:e Gb5:e Bb5:e Gb5:e Eb5:q B4:q',
  'D5:q. F5:e Ab5:q F5:q',
  'Gb5:e F5:e Eb5:e Db5:e Bb4:q Db5:q',
  'Eb5:q. Gb5:e B4:h',
  'Ab5:q F5:q D5:q Ab4:q',
  'Bb4:h. r:q',
  'Bb4:e Db5:e Eb5:q r:e Gb5:e F5:e Db5:e',
  'Ab4:e Db5:e F5:q r:e Ab5:e F5:e Db5:e',
  'Eb5:q. Gb5:e Bb5:q Gb5:q',
  'F5:q. D5:e Bb4:h',
  'B4:e Eb5:e Gb5:e Ab5:e Gb5:q Eb5:q',
  'Gb5:q. Eb5:e B4:h',
  'Ab4:q B4:q D5:q F5:q',
  'Eb5:h. r:q',
];

export default {
  id: 'field_crow',
  title: '終電のない地下鉄',
  bpm: 112,
  beatsPerBar: 4,
  key: 'Eb minor',
  seed: 7616,
  tracks: {
    ep: { inst: 'epiano', melody: true, range: [56, 88], vol: 1.1, pan: 0.1, rev: 0.25 },
    keys: { inst: 'epiano', range: [50, 76], voiceLo: 54, vol: 0.5, pan: -0.3, rev: 0.25, human: 0.006 },
    lead: { inst: 'strings', range: [60, 88], vol: 0.9, pan: -0.05, rev: 0.4 },
    pad: { inst: 'pad', range: [48, 74], voiceLo: 51, vol: 0.4, pan: 0.25, rev: 0.5 },
    bass: { inst: 'bass', range: [27, 51], vol: 0.75, pan: 0.0, rev: 0.03, gate: 0.8 },
    drums: { inst: 'drums', vol: 0.55, pan: 0.0, rev: 0.12 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { hat: 'x.o.x.o.x.o.x.o.', kick: ['x.........x.....', 'x.........x.x...'] },
    A: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', anvil: (bi) => (bi % 4 === 3 ? '..............o.' : '................') },
    B: { kick: 'x.......x.......', rim: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', shaker: 'o.o.o.o.o.o.o.o.' },
    A2: {
      kick: 'x.........x.x...',
      snare: (bi) => (bi === 15 ? '....x...x.x.x.xx' : '....x.......x...'),
      hat: 'xoxoxoxoxoxoxoxo',
      clap: '............x...',
      anvil: (bi) => (bi % 2 === 1 ? '..............o.' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Ebm7', 'Bb7'],
      gen: { bass: 'bassSync', keys: 'comp2' },
      drums: 'intro',
      parts: { ep: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { bass: 'bassSync', keys: 'comp2' },
      drums: 'A',
      parts: { ep: A_MEL },
    },
    B: {
      chords: ['Gbmaj7', 'Ab', 'Fm7', 'Bbm7', 'Gbmaj7', 'Ab', 'Bmaj7', 'Bb7'],
      gen: { bass: 'bass2w', keys: 'arpQ', pad: 'hold' },
      drums: 'B',
      parts: { lead: ['Bb5:h. F5:q', 'Eb5:h C5:h', 'Ab5:h. Eb5:q', 'F5:h Db5:h', 'Bb5:q. Ab5:e F5:q Db5:q', 'Eb5:h C5:h', 'Eb5:h F#5:h', 'F5:h D5:h'] },
    },
    A2: {
      chords: A_CHORDS,
      gen: { bass: 'bassSync', keys: 'comp2', pad: 'hold' },
      drums: 'A2',
      mix: { pad: 0.6 },
      parts: { ep: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
