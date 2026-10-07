// 港のまわり・海岸（V101〜）の曲「海辺を駆けて」。オリジナル曲。
// 海辺を駆ける。トランペット風の金管が元気に歌い、ギターが 8 分で和音を刻み、太鼓がはっきり 2・4 拍。
// B はストリングスが C# 短調で走る。
// E 長調・4/4・126 BPM。イントロ 2 → A 16 → B 8 → A' 16。ループ 40 小節 ≒ 76.2 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['E', 'B/D#', 'C#m7', 'A', 'E/G#', 'A', 'F#m7', 'B',
  'E', 'B/D#', 'C#m7', 'G#m7', 'Amaj7', 'B', 'C#m7 F#7', 'B7'];
const R = 'r:w';
const A_MEL = [
  'B4:q E5:q. F#5:e G#5:q',
  'F#5:h. D#5:q',
  'E5:q G#5:q. F#5:e E5:q',
  'C#5:h. r:q',
  'B4:q. C#5:e E5:q G#5:q',
  'A5:q. G#5:e F#5:q C#5:q',
  'E5:q F#5:q A5:q C#6:q',
  'B5:h. r:q',
  'B4:q E5:q. F#5:e G#5:q',
  'B5:h. F#5:q',
  'G#5:q. E5:e C#5:q E5:q',
  'D#5:h B4:h',
  'C#5:q. E5:e G#5:q B5:q',
  'A5:q. G#5:e F#5:q D#5:q',
  'E5:q G#5:q A#5:q C#6:q',
  'B5:h A5:h',
];

export default {
  id: 'field_port',
  title: '海辺を駆けて',
  bpm: 126,
  beatsPerBar: 4,
  key: 'E major',
  seed: 7313,
  tracks: {
    trumpet: { inst: 'brass', melody: true, range: [58, 88], vol: 0.95, pan: 0.08, rev: 0.25 },
    lead: { inst: 'strings', range: [60, 92], vol: 0.95, pan: -0.05, rev: 0.3 },
    guitar: { inst: 'guitar', range: [40, 76], voiceLo: 52, vol: 0.55, pan: -0.3, rev: 0.15, human: 0.006 },
    strings: { inst: 'strings', range: [50, 80], voiceLo: 56, vol: 0.35, pan: 0.25, rev: 0.35 },
    bass: { inst: 'bass', range: [28, 52], vol: 0.6, pan: 0.0, rev: 0.04, gate: 0.85 },
    drums: { inst: 'drums', vol: 0.55, pan: 0.0, rev: 0.12 },
  },
  patterns: { ...K4 },
  drumPatterns: {
    intro: { kick: 'x.......x.......', hat: 'o.o.o.o.o.o.o.o.', snare: ['................', '....x...x.x.x.xx'] },
    A: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', tamb: '....o.......o...' },
    B: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', tom: (bi) => (bi === 7 ? '........x.x.x.x.' : '................') },
    A2: {
      kick: 'x.....x.x.......',
      snare: (bi) => (bi === 15 ? '....x...x.x.x.xx' : '....x.......x...'),
      hat: 'o.o.o.o.o.o.o.o.',
      tamb: '..o...o...o...o.',
      crash: (bi) => (bi === 0 || bi === 8 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['A', 'B'],
      gen: { guitar: 'pulse8', bass: 'bassPump' },
      drums: 'intro',
      parts: { trumpet: [R, R] },
    },
    A: {
      chords: A_CHORDS,
      gen: { guitar: 'pulse8', bass: 'bassPump' },
      drums: 'A',
      parts: { trumpet: A_MEL },
    },
    B: {
      chords: ['A', 'B', 'G#m', 'C#m', 'A', 'B', 'C#m', 'B'],
      gen: { guitar: 'arp8', bass: 'bassOct', strings: 'hold' },
      drums: 'B',
      parts: { lead: ['C#5:q E5:q A5:h', 'F#5:q D#5:q B4:h', 'D#5:q. E5:e F#5:q B5:q', 'G#5:h. E5:q', 'A5:q. B5:e C#6:q A5:q', 'B5:q. A5:e F#5:q D#5:q', 'E5:q G#5:q C#6:q E6:q', 'D#6:h B5:h'] },
    },
    A2: {
      chords: A_CHORDS,
      gen: { guitar: 'pulse8', bass: 'bassPump', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.7 },
      parts: { trumpet: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
