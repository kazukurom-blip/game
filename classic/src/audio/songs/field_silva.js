// シルワの森の狩場の曲「木漏れ日の小径」。オリジナル曲。
// 深い森と木漏れ日。ハープが絶えず分散和音をこぼし、笛が少し不思議な旋律（D の和音でドリアの色）を歌う。
// A 短調・4/4・96 BPM。イントロ 2 小節 → A 16 → B 8 → A' 16（→ A へ戻る）。ループ 40 小節 = 100 秒。

const A_CHORDS = ['Am', 'Fmaj7', 'G', 'Em7', 'Am', 'Fmaj7', 'Dm7', 'E7sus4 E7',
  'Am', 'D', 'Fmaj7', 'G', 'Am', 'Dm7', 'E7sus4 E7', 'Am'];
const R = 'r:w';
const A_MEL = [
  'E5:q. A5:e C6:q B5:q',
  'A5:h E5:h',
  'D5:e E5:e G5:e B5:e D6:q. C6:e',
  'B5:h. r:q',
  'E5:q. A5:e C6:q E6:q',
  'E6:e D6:e C6:e A5:e F5:h',
  'F5:q A5:q D6:q. C6:e',
  'B5:h G#5:h',
  'A5:q. B5:e C6:q E6:q',
  'F#6:q. E6:e D6:q A5:q',
  'C6:q. A5:e F5:q A5:q',
  'B5:h. D6:q',
  'E6:q. D6:e C6:q B5:q',
  'A5:q. C6:e F5:q A5:q',
  'B5:q. A5:e G#5:h',
  'A5:h. r:q',
];

export default {
  id: 'field_silva',
  title: '木漏れ日の小径',
  bpm: 96,
  beatsPerBar: 4,
  key: 'A minor',
  seed: 3301,
  tracks: {
    flute: { inst: 'flute', melody: true, range: [62, 93], vol: 0.8, pan: 0.05, rev: 0.36 },
    harp: { inst: 'harp', range: [45, 88], voiceLo: 57, vol: 0.9, pan: -0.3, rev: 0.34, human: 0.01 },
    marimba: { inst: 'marimba', range: [57, 88], voiceLo: 64, vol: 0.45, pan: 0.35, rev: 0.28, human: 0.006 },
    pad: { inst: 'pad', range: [50, 79], voiceLo: 55, vol: 0.5, pan: 0.0, rev: 0.5 },
    bass: { inst: 'bass', range: [33, 52], vol: 0.45, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.42, pan: 0.0, rev: 0.25 },
  },
  patterns: {
    harp8: { kind: 'arp', steps: [[0, 0, 1.5, 0.9], [0.5, 1, 1, 0.55], [1, 2, 1, 0.65], [1.5, 3, 1, 0.55], [2, 4, 1, 0.7], [2.5, 3, 1, 0.5], [3, 2, 1, 0.6], [3.5, 1, 0.8, 0.5]] },
    harpSlow: { kind: 'arp', steps: [[0, 0, 2, 0.85], [1, 2, 1.5, 0.6], [2, 3, 1.5, 0.65], [3, 4, 1, 0.55]] },
    marOff: { kind: 'arp', steps: [[0.5, 3, 0.4, 0.6], [1.5, 2, 0.4, 0.45], [2.5, 4, 0.4, 0.6], [3.5, 2, 0.4, 0.45]] },
    bassHalf: { kind: 'bass', steps: [[0, 'R', 1.9, 0.9], [2, '5', 1.9, 0.65]] },
    bassLong: { kind: 'bass', steps: [[0, 'R', 3.8, 0.85]] },
    hold: { kind: 'hold', voices: 3, vel: 0.85 },
  },
  drumPatterns: {
    intro: { tri: ['x...............', '................'] },
    A: { shaker: '..o...o...o...o.', block: (bi) => (bi % 2 ? '......o.....o...' : '........o.......'), kick: 'x...............' },
    B: { shaker: 'o.o.o.o.o.o.o.o.', kick: 'x.......o.......', tri: ['x...............', '................', '................', '................'] },
    A2: { shaker: '..o...o...o...o.', block: '....o.....o.o...', kick: 'x.......o.......', tamb: (bi) => (bi % 4 === 3 ? '............o...' : '................') },
  },
  sections: {
    intro: {
      chords: ['Am', 'E7sus4 E7'],
      gen: { harp: 'harpSlow', pad: 'hold', bass: 'bassLong' },
      drums: 'intro',
      parts: { flute: [R, 'r:h. E5:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { harp: 'harp8', pad: 'hold', bass: 'bassHalf' },
      drums: 'A',
      mix: { pad: 0.8 },
      parts: { flute: A_MEL },
    },
    B: {
      chords: ['Fmaj7', 'G', 'Em7', 'Am', 'Dm7', 'G', 'Cmaj7', 'E7sus4 E7'],
      gen: { harp: 'harpSlow', marimba: 'marOff', pad: 'hold', bass: 'bassLong' },
      drums: 'B',
      parts: {
        flute: [
          'C6:h. A5:q',
          'B5:h D6:h',
          'E6:h. B5:q',
          'C6:q B5:q A5:h',
          'F5:q A5:q C6:q F6:q',
          'E6:q. D6:e B5:h',
          'C6:q. D6:e E6:q G6:q',
          'G#6:h E6:h',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { harp: 'harp8', marimba: 'marOff', pad: 'hold', bass: 'bassHalf' },
      drums: 'A2',
      mix: { pad: 0.6, harp: 0.85 },
      parts: { flute: [...A_MEL.slice(0, 15), 'A5:h. E5:q'] },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
