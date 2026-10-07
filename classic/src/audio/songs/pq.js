// 1 人用ダンジョン（PQ）の曲「試しの回廊」。オリジナル曲。
// 少し急かす、パズルを解く感じ。はじく弦（ピチカート）が 8 分で動き回り、木琴が 16 分で刻み、時計の音が後ろで鳴る。
// B 短調・4/4・126 BPM。イントロ 2 小節 → A 16 → B 8（D 長調寄りで一息）→ A' 16（→ A へ戻る）。ループ 40 小節 ≒ 76.2 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Bm', 'Bm', 'Gmaj7', 'A', 'Bm', 'Em7', 'F#sus4 F#7', 'Bm',
  'Bm', 'D', 'G', 'A', 'Em7', 'C#m7b5 F#7', 'Bm', 'F#7'];
const R = 'r:w';
const A_MEL = [
  'B4:e D5:e F#5:e D5:e B4:e r:e C#5:e D5:e',
  'E5:e D5:e C#5:e B4:e F#4:q r:q',
  'G4:e B4:e D5:e F#5:e E5:e D5:e B4:q',
  'C#5:e E5:e A5:e E5:e C#5:q r:q',
  'D5:e F#5:e B5:e A5:e F#5:e D5:e F#5:e B5:e',
  'A5:q. G5:e E5:q B4:q',
  'B4:e C#5:e E5:e C#5:e A#4:e C#5:e E5:e F#5:e',
  'D5:q B4:q r:h',
  'B4:e D5:e F#5:e D5:e B4:e r:e C#5:e D5:e',
  'F#5:e E5:e D5:e A4:e F#4:q r:q',
  'G4:e B4:e D5:e G5:e F#5:e E5:e D5:q',
  'E5:e A5:e C#6:e A5:e E5:q r:q',
  'G5:e F#5:e E5:e D5:e E5:e G5:e B5:q',
  'G5:q E5:q F#5:q A#4:q',
  'B4:e D5:e F#5:e B5:e A5:e F#5:e D5:q',
  'C#5:q F#5:q E5:e C#5:e A#4:q',
];

export default {
  id: 'pq',
  title: '試しの回廊',
  bpm: 126,
  beatsPerBar: 4,
  key: 'B minor',
  seed: 5101,
  tracks: {
    pluck: { inst: 'pizz', melody: true, range: [54, 88], vol: 1.15, pan: 0.1, rev: 0.2, human: 0.004 },
    mbox: { inst: 'musicbox', range: [62, 96], vol: 0.75, pan: 0.25, rev: 0.35 },
    mallet: { inst: 'marimba', range: [54, 86], voiceLo: 59, vol: 0.45, pan: -0.35, rev: 0.18, human: 0.004 },
    pad: { inst: 'strings', range: [50, 78], voiceLo: 54, vol: 0.3, pan: -0.1, rev: 0.4 },
    bass: { inst: 'bass', range: [31, 55], vol: 0.6, pan: 0.0, rev: 0.04, gate: 0.85 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.1 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { tick: 'x.x.x.x.x.x.x.x.', kick: 'x.......x.......' },
    A: { kick: 'x.....x...x.....', clap: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', tick: '..x...x...x...x.' },
    B: { kick: 'x.......x.......', shaker: 'o.o.o.o.o.o.o.o.', tick: 'x...x...x...x...' },
    A2: {
      kick: 'x.....x...x.x...',
      snare: (bi) => (bi === 15 ? '....x...o.o.x.xx' : '....x.......x...'),
      hat: 'o.o.o.o.o.o.o.o.',
      tick: '..x...x...x...x.',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Bm', 'F#7'],
      gen: { mallet: 'arp16', bass: 'bassLong' },
      drums: 'intro',
      parts: { pluck: [R, 'r:h F#4:e A#4:e C#5:e E5:e'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { mallet: 'arp16', bass: 'bassSync' },
      drums: 'A',
      mix: { mallet: 0.8 },
      parts: { pluck: A_MEL },
    },
    B: {
      chords: ['G', 'A', 'F#m7', 'Bm', 'G', 'A', 'Em7', 'F#7'],
      gen: { mallet: 'arpQ', bass: 'bass2', pad: 'hold' },
      drums: 'B',
      parts: {
        mbox: [
          'D6:q. E6:e D6:q B5:q',
          'C#6:h A5:h',
          'A5:q. B5:e C#6:q E6:q',
          'D6:h. r:q',
          'B6:q. A6:e G6:q D6:q',
          'E6:h C#6:q A5:q',
          'B5:q D6:q G6:q F#6:e E6:e',
          'F#6:h A#5:q C#6:q',
        ],
        pluck: [R, R, R, R, R, R, R, 'r:h F#4:e A#4:e C#5:e E5:e'],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { mallet: 'arp16', bass: 'bassOct', pad: 'hold' },
      drums: 'A2',
      mix: { mallet: 0.7, pad: 0.6 },
      parts: { pluck: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
