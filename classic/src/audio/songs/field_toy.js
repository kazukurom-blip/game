// 時の塔・おもちゃの工場の曲「ぜんまい仕掛けの塔」。オリジナル曲。
// 機械じかけで、ちょっと不気味。オルゴールが半音でゆれる旋律を弾き、ピチカートと
// ファゴット風の低い木管（クラリネットの低い所）が付いてくる。時計のカチカチと歯車のジジ。
// B♭ 短調・4/4・112 BPM。イントロ 2 小節 → A 16 → B 8（D♭ 長調へ。少しかわいく）→ A' 16。ループ 40 小節 ≒ 85.7 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Bbm', 'Bbm', 'Gb', 'F7', 'Bbm', 'Ebm', 'Cm7b5 F7', 'Bbm',
  'Bbm', 'Bbm/Ab', 'Gbmaj7', 'F7', 'Ebm', 'Gb F7', 'Bbm', 'F7'];
const R = 'r:w';
const A_MEL = [
  'F5:e Bb4:e Db5:e F5:e E5:e F5:e Db5:q',
  'C5:e Db5:e Bb4:e F4:e Bb4:h',
  'Bb4:e Db5:e Gb5:e F5:e Eb5:e Db5:e Bb4:q',
  'A4:e C5:e Eb5:e C5:e A4:q F4:q',
  'F5:e Bb4:e Db5:e F5:e Bb5:q Ab5:e F5:e',
  'Gb5:q. F5:e Eb5:q Bb4:q',
  'Eb5:e Db5:e C5:e Bb4:e A4:e C5:e Eb5:e F5:e',
  'Db5:q Bb4:q r:h',
  'F5:e Bb4:e Db5:e F5:e E5:e F5:e Db5:q',
  'C5:e Db5:e F5:e Ab5:e F5:h',
  'Bb5:e Ab5:e F5:e Db5:e Bb4:q Db5:q',
  'C5:e Eb5:e A5:e Eb5:e C5:q A4:q',
  'Gb5:e F5:e Eb5:e Db5:e Bb4:e Db5:e Eb5:q',
  'Db5:q Bb4:q C5:q A4:q',
  'Bb4:e Db5:e F5:e Bb5:e A5:e Bb5:e F5:q',
  'Eb5:q C5:q A4:q F4:q',
];

export default {
  id: 'field_toy',
  title: 'ぜんまい仕掛けの塔',
  bpm: 112,
  beatsPerBar: 4,
  key: 'Bb minor',
  seed: 5202,
  tracks: {
    mbox: { inst: 'musicbox', melody: true, range: [62, 92], vol: 1.2, pan: 0.12, rev: 0.32 },
    pizz: { inst: 'pizz', range: [46, 82], voiceLo: 58, vol: 0.75, pan: -0.3, rev: 0.2, human: 0.005 },
    bassoon: { inst: 'clarinet', range: [41, 64], vol: 0.55, pan: 0.15, rev: 0.15, gate: 0.7 },
    bell: { inst: 'bell', range: [70, 100], voiceLo: 77, vol: 0.32, pan: 0.4, rev: 0.45 },
    pad: { inst: 'strings', range: [53, 80], voiceLo: 58, vol: 0.28, pan: -0.1, rev: 0.45 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.15 },
  },
  patterns: {
    ...K4,
    bellDot: { kind: 'arp', steps: [[1.5, 4, 1, 0.5], [3.5, 5, 1, 0.45]] },
  },
  drumPatterns: {
    intro: { tick: 'x...x...x...x...', ratchet: ['................', '............x...'] },
    A: { tick: 'x.o.x.o.x.o.x.o.', kick: 'x.......x.......', block: '....x.......x...', ratchet: (bi) => (bi % 4 === 3 ? '............x...' : '................') },
    B: { tick: 'x...x...x...x...', tri: ['x...............', '................'], kick: 'x...............' },
    A2: {
      tick: 'x.o.x.o.x.o.x.o.',
      kick: 'x.......x.x.....',
      snare: (bi) => (bi === 15 ? '....o...o.o.oooo' : '....o.......o...'),
      block: '..o...o...o...o.',
      ratchet: (bi) => (bi % 2 === 1 ? '............x...' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Bbm', 'F7'],
      gen: { pizz: 'arp8', bassoon: 'bass2' },
      drums: 'intro',
      parts: { mbox: [R, 'r:h C5:e Eb5:e F5:e A4:e'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { pizz: 'arp8', bassoon: 'bass2w' },
      drums: 'A',
      parts: { mbox: A_MEL },
    },
    B: {
      chords: ['Dbmaj7', 'Ab', 'Gbmaj7', 'Db', 'Bbm', 'Gm7b5', 'C7', 'F7'],
      gen: { pizz: 'arpQ', bassoon: 'bassLong', pad: 'hold' },
      drums: 'B',
      parts: {
        mbox: [
          'F5:h. Ab5:q',
          'Eb5:h C5:h',
          'Db5:q. Eb5:e F5:q Bb5:q',
          'Ab5:h F5:h',
          'Db5:q. C5:e Db5:q F5:q',
          'Db5:h Bb4:q G4:q',
          'C5:q E5:q G5:q Bb5:q',
          'A5:h F5:q Eb5:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { pizz: 'arp8', bassoon: 'bassWalk', bell: 'bellDot', pad: 'hold' },
      drums: 'A2',
      mix: { pad: 0.5, pizz: 0.85 },
      parts: { mbox: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
