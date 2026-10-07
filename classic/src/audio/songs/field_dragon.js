// 竜の谷の曲「竜の谷を往く」。オリジナル曲。
// 力強い、大きな生き物の気配。ホルン風の金管が太く歌い、ストリングスが 4 分で分散和音、合唱風の声が後ろで伸び、
// 大太鼓がどっしり鳴る。B は A♭・B♭ を通って空へ飛ぶようにストリングスが歌い、D♭ で少しよそへ行く。
// C 短調・4/4・120 BPM。イントロ 2 → A 16 → B 8 → A' 16。ループ 40 小節 = 80 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Fm', 'G', 'G',
  'Cm', 'Eb', 'Ab', 'Bb', 'Fm', 'Ab', 'G7', 'Cm'];
const R = 'r:w';
const A_MEL = [
  'C5:q G4:q C5:q. D5:e',
  'Eb5:h. D5:e C5:e',
  'Ab4:q C5:q Eb5:q. F5:e',
  'D5:h. Bb4:q',
  'G5:q. F5:e Eb5:q G5:q',
  'Ab5:h C6:h',
  'B5:q. Ab5:e G5:q D5:q',
  'G5:w',
  'C6:q G5:q Eb5:q. D5:e',
  'Eb5:q. F5:e G5:h',
  'Ab5:q. G5:e F5:q Eb5:q',
  'F5:h. D5:q',
  'C5:q F5:q Ab5:q C6:q',
  'Eb6:h C6:h',
  'B5:q. G5:e D5:q F5:q',
  'Eb5:h C5:h',
];

export default {
  id: 'field_dragon',
  title: '竜の谷を往く',
  bpm: 120,
  beatsPerBar: 4,
  key: 'C minor',
  seed: 7919,
  tracks: {
    horn: { inst: 'brass', melody: true, range: [55, 90], vol: 1.0, pan: 0.05, rev: 0.3 },
    lead: { inst: 'strings', range: [62, 92], vol: 0.95, pan: -0.05, rev: 0.35 },
    strings: { inst: 'strings', range: [43, 74], voiceLo: 48, vol: 0.45, pan: -0.3, rev: 0.35 },
    choir: { inst: 'choir', range: [48, 74], voiceLo: 55, vol: 0.5, pan: 0.25, rev: 0.5 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.6, pan: 0.0, rev: 0.04 },
    drums: { inst: 'drums', vol: 0.65, pan: 0.0, rev: 0.25 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { taiko: ['x.......x.......', 'x...x...x.x.x.x.'], crash: ['................', '................'] },
    A: { taiko: 'x.....x...x.....', snare: '....x.......x...', hat: '..o...o...o...o.' },
    B: { taiko: 'x.......x.......', timp: (bi) => (bi === 7 ? 'x.x.x.x.x.x.x.x.' : '........x.......'), hat: 'o.o.o.o.o.o.o.o.', crash: (bi) => (bi === 0 ? 'x...............' : '................') },
    A2: {
      taiko: 'x.....x...x.....',
      snare: (bi) => (bi === 15 ? '....x...x.x.x.xx' : '....x.......x...'),
      tomlo: '..........x...x.',
      hat: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Cm', 'G'],
      gen: { strings: 'arpQ', choir: 'hold', bass: 'bassLong' },
      drums: 'intro',
      parts: { horn: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { strings: 'arpQ', bass: 'bass2' },
      drums: 'A',
      parts: { horn: A_MEL },
    },
    B: {
      chords: ['Ab', 'Bb', 'Gm', 'Cm', 'Ab', 'Bb', 'Db', 'G'],
      gen: { strings: 'arp8', choir: 'hold', bass: 'bassOct' },
      drums: 'B',
      parts: { lead: ['C6:h. Eb6:q', 'D6:h Bb5:h', 'D6:q. Bb5:e G5:h', 'G5:h Eb5:h', 'Ab5:q C6:q Eb6:q. D6:e', 'D6:h F5:h', 'F5:q Ab5:q Db6:q F6:q', 'D6:h B5:h'] },
    },
    A2: {
      chords: A_CHORDS,
      gen: { strings: 'arpQ', choir: 'hold', bass: 'bassOct' },
      drums: 'A2',
      mix: { choir: 0.8 },
      parts: { horn: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
