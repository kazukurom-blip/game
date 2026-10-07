// 古の神殿の曲「止まった時の神殿」。オリジナル曲。
// 止まった時間、白い石。小さなパイプオルガンがゆっくり歌い、合唱風の声とストリングスが長く伸び、遠くで大太鼓。
// G# 短調・4/4・64 BPM。イントロ 2 → A 8 → B 8（E 長調の明るさが一瞬差す）→ 結び 4。ループ 20 小節 = 75 秒。
import { K4 } from './_kit.js';

const R = 'r:w';

export default {
  id: 'dungeon_temple',
  title: '止まった時の神殿',
  bpm: 64,
  beatsPerBar: 4,
  key: 'G# minor',
  seed: 8222,
  tracks: {
    organ: { inst: 'organ', melody: true, range: [54, 84], vol: 1.1, pan: 0.05, rev: 0.55 },
    choir: { inst: 'choir', range: [50, 76], voiceLo: 54, vol: 0.6, pan: -0.2, rev: 0.6 },
    strings: { inst: 'strings', range: [40, 68], voiceLo: 44, vol: 0.45, pan: 0.25, rev: 0.55 },
    bell: { inst: 'bell', range: [72, 100], voiceLo: 75, vol: 0.3, pan: 0.4, rev: 0.6 },
    bass: { inst: 'bass', range: [25, 49], vol: 0.45, pan: 0.0, rev: 0.1 },
    drums: { inst: 'drums', vol: 0.55, pan: 0.0, rev: 0.5 },
  },
  patterns: {
    ...K4,
    bellSlow: { kind: 'arp', steps: [[2, 5, 2, 0.4]] },
  },
  drumPatterns: {
    intro: { taiko: ['x...............', '................'], drip: ['..........o.....', '....o...........'] },
    A: { taiko: ['x...............', '................'], drip: ['......o.........', '................', '..........o.....', '................'], tri: ['................', '................', '................', 'x...............'] },
    B: { taiko: 'x.......x.......', timp: (bi) => (bi === 7 ? 'x...x...x.x.x.x.' : '................') },
    C: { taiko: ['x...............', '................'], drip: ['......o.........', '..o.............'] },
  },
  sections: {
    intro: {
      chords: ['G#m', 'D#'],
      gen: { choir: 'hold', strings: 'hold', bass: 'bassLong' },
      drums: 'intro',
      parts: { organ: [R, R] },
    },
    A: {
      chords: ['G#m', 'E', 'C#m', 'D#', 'G#m', 'B', 'F#', 'D#7'],
      gen: { choir: 'hold', bass: 'bassLong', bell: 'bellSlow' },
      drums: 'A',
      parts: { organ: ['D#5:h. B4:q', 'G#4:h B4:h', 'E5:h. C#5:q', 'A#4:w', 'B4:q. C#5:e D#5:h', 'F#5:h. D#5:q', 'C#5:q. D#5:e A#4:h', 'C#5:h A#4:h'] },
    },
    B: {
      chords: ['E', 'F#', 'D#m', 'G#m', 'C#m', 'D#', 'E', 'D#7'],
      gen: { choir: 'hold', strings: 'hold', bass: 'bass2' },
      drums: 'B',
      parts: { organ: ['G#5:h. E5:q', 'F#5:h C#5:h', 'D#5:h. F#5:q', 'B4:h D#5:h', 'E5:q. C#5:e G#4:q E5:q', 'A#4:h. D#5:q', 'B4:q E5:q G#5:q B5:q', 'A#5:h. r:q'] },
    },
    C: {
      chords: ['G#m', 'E', 'C#m', 'D#'],
      gen: { choir: 'hold', strings: 'hold', bass: 'bassLong', bell: 'bellSlow' },
      drums: 'C',
      parts: { organ: ['B4:w', 'G#4:h E4:h', 'C#5:w', 'A#4:w'] },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'C'] },
};
