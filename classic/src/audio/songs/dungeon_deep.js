// ねむり谷の地下ダンジョン（洞くつ）の曲「青い地底湖」。オリジナル曲。
// 暗い地下と青い光。低いストリングスとパッドが長く鳴り、ベルがぽつりぽつりと旋律を置く。水の滴る音。
// D 短調・4/4・70 BPM。イントロ 2 小節 → A 8 → B 8 → A' 8（→ A へ戻る）。ループ 24 小節 ≒ 82.3 秒。

const A_CHORDS = ['Dm', 'Dm', 'Bbmaj7', 'Bbmaj7', 'Gm', 'Gm', 'A7sus4', 'A'];
const R = 'r:w';

export default {
  id: 'dungeon_deep',
  title: '青い地底湖',
  bpm: 70,
  beatsPerBar: 4,
  key: 'D minor',
  seed: 6006,
  tracks: {
    bell: { inst: 'bell', melody: true, range: [69, 96], vol: 0.55, pan: 0.15, rev: 0.6 },
    harp: { inst: 'harp', range: [45, 81], voiceLo: 57, vol: 0.55, pan: -0.35, rev: 0.5 },
    strings: { inst: 'strings', range: [38, 72], voiceLo: 50, vol: 0.55, pan: -0.1, rev: 0.45 },
    pad: { inst: 'pad', range: [45, 76], voiceLo: 57, vol: 0.55, pan: 0.1, rev: 0.6 },
    bass: { inst: 'bass', range: [26, 45], vol: 0.45, pan: 0.0, rev: 0.1 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.6 },
  },
  patterns: {
    bassLong: { kind: 'bass', steps: [[0, 'R', 3.9, 0.85]] },
    harpUp: { kind: 'arp', steps: [[0, 1, 2, 0.6], [0.5, 2, 2, 0.45], [1, 3, 2, 0.5], [1.5, 4, 2, 0.45]] },
    hold: { kind: 'hold', voices: 3, vel: 0.85 },
    hold4: { kind: 'hold', voices: 4, vel: 0.7 },
  },
  drumPatterns: {
    intro: { drip: ['......o.........', '..........o.....'] },
    A: {
      drip: ['..o.........o...', '.......o........', '....o.......o...', '..........o.....', '.o......o.......', '.........o......', '...o.........o..', '.......o........'],
      timp: (bi) => (bi % 4 === 0 ? 'o...............' : '................'),
    },
    B: {
      drip: ['......o.........', '..o.......o.....', '.......o........', '....o.....o.....'],
      timp: (bi) => (bi % 2 === 0 ? 'o...............' : '................'),
      tri: (bi) => (bi === 4 ? 'o...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Dm', 'A7sus4'],
      gen: { pad: 'hold', bass: 'bassLong' },
      drums: 'intro',
      parts: { bell: [R, 'r:h. A5:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { strings: 'hold', pad: 'hold', bass: 'bassLong' },
      drums: 'A',
      mix: { strings: 0.8 },
      parts: {
        bell: [
          'r:h D6:q. E6:e',
          'F6:h. r:q',
          'r:q D6:q F6:q A6:q',
          'G6:w',
          'r:h Bb5:q C6:q',
          'D6:h. r:q',
          'r:q E6:q D6:q A5:q',
          'C#6:w',
        ],
      },
    },
    B: {
      chords: ['Dm', 'C', 'Bb', 'A', 'Gm', 'Bbmaj7', 'Em7b5', 'A7'],
      gen: { strings: 'hold4', pad: 'hold', bass: 'bassLong', harp: 'harpUp' },
      drums: 'B',
      parts: {
        bell: [
          'F6:q. E6:e D6:h',
          'E6:q. D6:e C6:h',
          'D6:q. C6:e Bb5:h',
          'A5:h. r:q',
          'G5:q Bb5:q D6:q G6:q',
          'F6:h. A5:q',
          'Bb5:h. E6:q',
          'C#6:h. r:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { strings: 'hold4', pad: 'hold', bass: 'bassLong', harp: 'harpUp' },
      drums: 'A',
      mix: { harp: 0.7 },
      parts: {
        bell: [
          'A5:q. D6:e F6:q A6:q',
          'G6:h F6:h',
          'D6:h. F6:q',
          'E6:h. r:q',
          'D6:q. C6:e Bb5:q D6:q',
          'G5:h. r:q',
          'r:q A5:q D6:q E6:q',
          'C#6:h. r:q',
        ],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
