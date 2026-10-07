// 神殿前・焔の門前・星見の塔の野営地の曲「焚き火のそばで」。オリジナル曲。
// 一息つく、短めのループ。ハープがゆっくり歌い、パッドとベルが包む。焚き火のはぜる音（シェイカーを小さく）。
// E 長調・4/4・70 BPM。イントロ 2 小節 → A 8 → B 8 → 結び 4（Am6 を通って戻る）。ループ 20 小節 ≒ 68.6 秒。
import { K4 } from './_kit.js';

const R = 'r:w';

export default {
  id: 'camp',
  title: '焚き火のそばで',
  bpm: 70,
  beatsPerBar: 4,
  key: 'E major',
  seed: 6303,
  tracks: {
    harp: { inst: 'harp', melody: true, range: [55, 86], vol: 1.25, pan: 0.1, rev: 0.35 },
    harpArp: { inst: 'harp', range: [40, 80], voiceLo: 52, vol: 0.55, pan: -0.3, rev: 0.35 },
    pad: { inst: 'pad', range: [50, 76], voiceLo: 54, vol: 0.5, pan: 0.15, rev: 0.5 },
    bell: { inst: 'bell', range: [74, 100], voiceLo: 76, vol: 0.25, pan: 0.4, rev: 0.5 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.45, pan: 0.0, rev: 0.06 },
    drums: { inst: 'drums', vol: 0.4, pan: 0.0, rev: 0.2 },
  },
  patterns: {
    ...K4,
    bellOne: { kind: 'arp', steps: [[2.5, 5, 1.5, 0.45]] },
  },
  drumPatterns: {
    intro: { shaker: ['..o.......o.....', '......o.........'] },
    A: { shaker: ['..o.......o..o..', '......o.....o...', 'o.......o.......', '....o.......o...'], tri: ['x...............', '................', '................', '................'] },
    B: { shaker: ['..o.......o..o..', '......o.....o...'], kick: ['x...............', '................'] },
    tag: { shaker: '..o.......o.....', tri: ['................', '................', 'x...............', '................'] },
  },
  sections: {
    intro: {
      chords: ['Amaj7', 'B7sus4'],
      gen: { harpArp: 'arpSlow', pad: 'hold' },
      drums: 'intro',
      parts: { harp: [R, R] },
    },
    A: {
      chords: ['E', 'C#m7', 'Amaj7', 'B7sus4 B7', 'E', 'G#m7', 'Amaj7', 'B7sus4'],
      gen: { harpArp: 'arpQ', pad: 'hold', bass: 'bass2' },
      drums: 'A',
      parts: {
        harp: [
          'B4:q. G#4:e E5:h',
          'D#5:q C#5:q B4:h',
          'C#5:q. E5:e G#5:q F#5:q',
          'E5:h D#5:h',
          'B4:q. G#4:e E5:q F#5:q',
          'G#5:h. F#5:q',
          'E5:q C#5:q B4:q A4:q',
          'B4:w',
        ],
      },
    },
    B: {
      chords: ['Amaj7', 'B', 'G#m7', 'C#m7', 'F#m7', 'B7', 'Emaj7', 'E7'],
      gen: { harpArp: 'arpQ', pad: 'hold', bass: 'bass2', bell: 'bellOne' },
      drums: 'B',
      parts: {
        harp: [
          'C#5:h E5:q G#5:q',
          'F#5:h. D#5:q',
          'B4:h D#5:q F#5:q',
          'E5:h. C#5:q',
          'A4:q C#5:q E5:q F#5:q',
          'D#5:h. B4:q',
          'G#4:h B4:q E5:q',
          'D5:h. r:q',
        ],
      },
    },
    tag: {
      chords: ['Amaj7', 'Am6', 'E/B', 'B7sus4'],
      gen: { harpArp: 'arpSlow', pad: 'hold', bass: 'bassLong' },
      drums: 'tag',
      parts: { harp: ['C#5:h. B4:q', 'C5:h. A4:q', 'G#4:h B4:h', R] },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'tag'] },
};
