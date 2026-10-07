// セレスのまわり・雲の塔の曲「風の階段」。オリジナル曲。
// 空を飛ぶような、明るく伸びやかな曲。笛が長い音で歌い、ハープが上へ駆け上がる分散和音、ストリングス、ベル。
// B♭ 長調・4/4・120 BPM。イントロ 2 小節 → A 16 → B 8（G 短調）→ C 8（ストリングスが歌う）→ A' 16。ループ 48 小節 = 96 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Bb', 'F/A', 'Gm7', 'Ebmaj7', 'Bb/D', 'Eb', 'Cm7', 'F',
  'Bb', 'F/A', 'Gm7', 'Dm7', 'Ebmaj7', 'Ebm6', 'Bb/F F7', 'Bb'];
const R = 'r:w';
const A_MEL = [
  'F5:q. Bb5:e D6:h',
  'C6:q A5:q F5:h',
  'G5:q. Bb5:e D6:q F6:q',
  'Eb6:h. D6:q',
  'D6:q. C6:e Bb5:q F5:q',
  'G5:q Bb5:q Eb6:q D6:q',
  'C6:q. Bb5:e G5:q Eb5:q',
  'F5:h. r:q',
  'F5:q. Bb5:e D6:h',
  'C6:q A5:q F5:q C6:q',
  'Bb5:q. A5:e G5:q D5:q',
  'F5:q. E5:e F5:q A5:q',
  'G5:h Bb5:q D6:q',
  'Gb5:h. F5:q',
  'F5:q D5:q Eb5:q A4:q',
  'Bb4:h. r:q',
];

export default {
  id: 'field_sky',
  title: '風の階段',
  bpm: 120,
  beatsPerBar: 4,
  key: 'Bb major',
  seed: 5303,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 92], vol: 1.0, pan: 0.1, rev: 0.3 },
    lead: { inst: 'strings', range: [62, 88], vol: 0.85, pan: -0.05, rev: 0.35 },
    harp: { inst: 'harp', range: [43, 86], voiceLo: 55, vol: 0.75, pan: -0.3, rev: 0.35 },
    strings: { inst: 'strings', range: [50, 80], voiceLo: 55, vol: 0.4, pan: 0.2, rev: 0.4 },
    bell: { inst: 'bell', range: [72, 102], voiceLo: 77, vol: 0.35, pan: 0.4, rev: 0.45 },
    bass: { inst: 'bass', range: [31, 55], vol: 0.55, pan: 0.0, rev: 0.04 },
    drums: { inst: 'drums', vol: 0.45, pan: 0.0, rev: 0.18 },
  },
  patterns: {
    ...K4,
    bellSp: { kind: 'arp', steps: [[0.5, 4, 1, 0.5], [2.5, 5, 1, 0.45], [3.5, 4, 0.5, 0.35]] },
  },
  drumPatterns: {
    intro: { tri: ['x...............', '................'] },
    A: { kick: 'x.......x.......', shaker: 'o.o.o.o.o.o.o.o.', tamb: '....o.......o...' },
    B: { kick: 'x.....x.........', shaker: 'o.o.o.o.o.o.o.o.', tom: (bi) => (bi === 7 ? '........x.x.x.x.' : '................') },
    C: { timp: ['x...............', '................'], tri: ['x...............', '................'] },
    A2: {
      kick: 'x.......x.x.....',
      snare: '....o.......o...',
      shaker: 'o.o.o.o.o.o.o.o.',
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Ebmaj7', 'F'],
      gen: { harp: 'arpUp', strings: 'hold' },
      drums: 'intro',
      parts: { bell: ['G6:q. Bb6:e D7:h', 'C7:h. A6:q'], flute: [R, 'r:h. C5:e E5:e'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'arpUp', bass: 'bass2', strings: 'hold' },
      drums: 'A',
      mix: { strings: 0.7 },
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Gm', 'Eb', 'Bb', 'F', 'Gm', 'Cm7', 'D7sus4', 'D7'],
      gen: { harp: 'arp8', bass: 'bass2w', strings: 'hold', bell: 'bellSp' },
      drums: 'B',
      parts: {
        flute: [
          'D5:q G5:q Bb5:q. A5:e',
          'G5:h Eb5:h',
          'F5:q Bb5:q D6:q. C6:e',
          'C6:h A5:h',
          'Bb5:q. A5:e G5:q D6:q',
          'Eb6:q D6:q C6:q Bb5:q',
          'A5:h. G5:q',
          'F#5:h. r:q',
        ],
      },
    },
    C: {
      chords: ['Ebmaj7', 'F', 'Dm7', 'Gm7', 'Cm7', 'F', 'Bb', 'F7'],
      gen: { harp: 'arpUp', bass: 'bassLong', bell: 'bellSp' },
      drums: 'C',
      parts: {
        lead: ['G5:h. F5:q', 'A5:h. C6:q', 'A5:h F5:h', 'D6:h. C6:q', 'Bb5:h G5:h', 'A5:h C6:h', 'D6:w', 'C6:h A5:q F5:q'],
        flute: [R, R, R, R, R, R, R, 'r:h C5:q D5:q'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { harp: 'arpUp', bass: 'bass2w', strings: 'hold', bell: 'bellSp' },
      drums: 'A2',
      mix: { bell: 0.8 },
      parts: { flute: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'C', 'A2'] },
};
