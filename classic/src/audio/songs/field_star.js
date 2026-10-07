// 星の果ての曲「星の果ての旅路」。オリジナル曲。
// 静かで大きい、旅の終わり。ホルン風の金管がゆっくり歌い、ハープが上へ流れ、ストリングスとパッドが広がる。
// B は B♭ 短調でストリングスが少し切なく歌う。ティンパニがときどき遠くで鳴る。
// D♭ 長調・4/4・80 BPM。イントロ 2 → A 16 → B 8 → A' 8。ループ 32 小節 = 96 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Db', 'Ab/C', 'Bbm7', 'Gbmaj7', 'Db/F', 'Gb', 'Ebm7', 'Ab',
  'Db', 'Ab/C', 'Bbm7', 'Fm7', 'Gbmaj7', 'Ebm7', 'Ab7sus4 Ab7', 'Db'];
const R = 'r:w';
const A_MEL = [
  'Ab4:h Db5:q. Eb5:e',
  'F5:h Eb5:h',
  'Db5:q. F5:e Ab5:h',
  'F5:w',
  'Ab5:q. Gb5:e F5:q Db5:q',
  'Bb4:h. Db5:q',
  'Gb5:q. F5:e Eb5:q Db5:q',
  'Eb5:w',
  'Ab4:h Db5:q. Eb5:e',
  'F5:h Ab5:h',
  'Db6:q. C6:e Bb5:q F5:q',
  'Ab5:h. Eb5:q',
  'F5:q. Gb5:e Bb5:q Db6:q',
  'Bb5:h Gb5:h',
  'Db5:h C5:h',
  'Db5:w',
];

export default {
  id: 'field_star',
  title: '星の果ての旅路',
  bpm: 80,
  beatsPerBar: 4,
  key: 'Db major',
  seed: 8121,
  tracks: {
    horn: { inst: 'brass', melody: true, range: [56, 88], vol: 0.8, pan: 0.05, rev: 0.45 },
    lead: { inst: 'strings', range: [60, 88], vol: 1.0, pan: -0.05, rev: 0.45 },
    strings: { inst: 'strings', range: [44, 76], voiceLo: 49, vol: 0.42, pan: -0.25, rev: 0.5 },
    pad: { inst: 'pad', range: [48, 74], voiceLo: 53, vol: 0.4, pan: 0.25, rev: 0.6 },
    harp: { inst: 'harp', range: [41, 86], voiceLo: 53, vol: 0.6, pan: 0.3, rev: 0.45 },
    bell: { inst: 'bell', range: [77, 102], voiceLo: 80, vol: 0.3, pan: 0.45, rev: 0.6 },
    bass: { inst: 'bass', range: [25, 49], vol: 0.5, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.45 },
  },
  patterns: {
    ...K4,
    star: { kind: 'arp', steps: [[0.5, 5, 1, 0.4], [2, 6, 1, 0.35]] },
  },
  drumPatterns: {
    intro: { timp: ['x...............', '........x.......'], tri: ['................', 'x...............'] },
    A: { timp: ['x...............', '................', '................', '................'], tri: ['................', '................', 'x...............', '................'] },
    B: { timp: (bi) => (bi === 7 ? 'x...x...x.x.x.x.' : bi % 2 ? '................' : 'x...............'), shaker: '....o.......o...' },
    A2: { timp: ['x...............', '................'], tri: ['x...............', '................'], crash: (bi) => (bi === 0 ? 'x...............' : '................') },
  },
  sections: {
    intro: {
      chords: ['Gbmaj7', 'Ab7sus4'],
      gen: { harp: 'arpUp', pad: 'hold', bell: 'star' },
      drums: 'intro',
      parts: { horn: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'arpUp', strings: 'hold', bass: 'bassLong', bell: 'star' },
      drums: 'A',
      mix: { bell: 0.7 },
      parts: { horn: A_MEL },
    },
    B: {
      chords: ['Bbm', 'Gbmaj7', 'Db', 'Ab', 'Bbm', 'Gbmaj7', 'Ebm7', 'Ab7'],
      gen: { harp: 'arp8', pad: 'hold', bass: 'bass2' },
      drums: 'B',
      parts: { lead: ['F5:h. Db5:q', 'Bb5:h. Ab5:q', 'F5:h Ab5:h', 'Eb5:h. C5:q', 'Db5:q F5:q Bb5:q Db6:q', 'C6:h Bb5:h', 'Gb5:h. Bb5:q', 'Ab5:h Gb5:h'] },
    },
    A2: {
      chords: A_CHORDS.slice(0, 8),
      gen: { harp: 'arpUp', strings: 'hold', pad: 'hold', bass: 'bassLong', bell: 'star' },
      drums: 'A2',
      mix: { pad: 0.7 },
      parts: { horn: A_MEL.slice(0, 8) },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
