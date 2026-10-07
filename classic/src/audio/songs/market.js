// にぎわい市場（V090）の曲「にぎわい広場のポルカ」。オリジナル曲。
// にぎやかなポルカ。アコーディオンがはねる旋律、チューバ風の低い金管が「ブン」、和音が「チャ」。
// 中の段（B）はトランペット風の金管が歌い、C は手拍子で呼びかけ合う。
// B♭ 長調・4/4（2 拍子のポルカを 4/4 で書く）・132 BPM。イントロ 2 → A 16 → B 8（E♭ へ）→ C 8（G 短調）→ A' 16。
// ループ 48 小節 ≒ 87.3 秒。
import { K4 } from './_kit.js';

const A_CHORDS = ['Bb', 'Bb', 'F7', 'F7', 'F7', 'F7', 'Bb', 'Bb',
  'Bb', 'Bb7', 'Eb', 'Eb', 'Bb/F', 'F7', 'Bb', 'Bb F7'];
const R = 'r:w';
const A_MEL = [
  'F5:e G5:e F5:e D5:e Bb4:q D5:q',
  'F5:q Bb5:q A5:e Bb5:e C6:e Bb5:e',
  'A5:e Bb5:e A5:e F5:e C5:q Eb5:q',
  'G5:q F5:q Eb5:q C5:q',
  'Eb5:e F5:e Eb5:e C5:e A4:q C5:q',
  'Eb5:q A5:q G5:e A5:e Bb5:e A5:e',
  'Bb5:e F5:e D5:e F5:e Bb5:q D5:q',
  'F5:h r:q F5:q',
  'F5:e G5:e F5:e D5:e Bb4:q D5:q',
  'Ab5:q F5:q D5:e F5:e Ab5:e F5:e',
  'G5:e Bb5:e G5:e Eb5:e Bb4:q G5:q',
  'Bb5:q G5:q Eb5:q Bb4:q',
  'D5:e F5:e Bb5:e F5:e D5:q F5:q',
  'Eb5:e F5:e G5:e A5:e C6:q A5:q',
  'Bb5:q F5:q D5:q F5:q',
  'Bb5:q r:q C5:e D5:e Eb5:q',
];

export default {
  id: 'market',
  title: 'にぎわい広場のポルカ',
  bpm: 132,
  beatsPerBar: 4,
  key: 'Bb major',
  seed: 6202,
  tracks: {
    acc: { inst: 'accordion', melody: true, range: [55, 88], vol: 0.95, pan: 0.1, rev: 0.18 },
    trumpet: { inst: 'brass', range: [58, 90], vol: 0.85, pan: -0.15, rev: 0.22 },
    chords: { inst: 'accordion', range: [52, 77], voiceLo: 57, vol: 0.5, pan: -0.3, rev: 0.15 },
    tuba: { inst: 'brass', range: [34, 58], vol: 0.85, pan: 0.0, rev: 0.06, gate: 0.8 },
    glock: { inst: 'bell', range: [74, 100], voiceLo: 79, vol: 0.3, pan: 0.4, rev: 0.35 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.12 },
  },
  patterns: {
    ...K4,
    glockHit: { kind: 'arp', steps: [[3.5, 4, 0.5, 0.5]] },
  },
  drumPatterns: {
    intro: { kick: 'x.......x.......', tamb: '....o.......o...' },
    A: { kick: 'x.......x.......', snare: '....o.......o...', tamb: '..o...o...o...o.' },
    B: { kick: 'x.......x.......', tamb: '....o.......o...', tri: ['x...............', '................'] },
    C: { kick: 'x.......x.......', clap: (bi) => (bi % 2 ? '....x.x.x.......' : '....x.......x...'), tamb: '..o...o...o...o.' },
    A2: {
      kick: 'x.......x.......',
      snare: (bi) => (bi === 15 ? '....o...o.o.o.o.' : '....o.......o...'),
      tamb: '..o...o...o...o.',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
  },
  sections: {
    intro: {
      chords: ['Bb', 'F7'],
      gen: { tuba: 'bassPolka', chords: 'chuck' },
      drums: 'intro',
      parts: { acc: [R, 'r:h C5:e D5:e Eb5:q'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { tuba: 'bassPolka', chords: 'chuck' },
      drums: 'A',
      parts: { acc: A_MEL },
    },
    B: {
      chords: ['Eb', 'Eb', 'Bb7', 'Bb7', 'Bb7', 'Bb7', 'Eb', 'Eb'],
      gen: { tuba: 'bassPolka', chords: 'chuck8', glock: 'glockHit' },
      drums: 'B',
      mix: { chords: 0.75 },
      parts: {
        trumpet: [
          'G5:h. Eb5:q',
          'Bb5:h G5:h',
          'Ab5:h. F5:q',
          'D5:h Bb4:h',
          'F5:q. G5:e Ab5:q Bb5:q',
          'C6:q Bb5:q Ab5:q F5:q',
          'G5:q Bb5:q Eb6:q Bb5:q',
          'G5:h Eb5:q r:q',
        ],
      },
    },
    C: {
      chords: ['Gm', 'Gm', 'D7', 'Gm', 'Cm', 'F7', 'Bb', 'F7'],
      gen: { tuba: 'bassPolka', chords: 'chuck' },
      drums: 'C',
      parts: {
        acc: [
          'D5:e r:e D5:e r:e G5:q Bb5:q',
          'A5:e G5:e F#5:e G5:e D5:h',
          'C5:e r:e C5:e r:e F#5:q A5:q',
          'Bb5:e A5:e G5:e A5:e G5:h',
          'Eb5:e r:e Eb5:e r:e G5:q C6:q',
          'Bb5:e A5:e G5:e F5:e Eb5:q C5:q',
          'D5:e F5:e Bb5:e F5:e D5:q Bb4:q',
          'C5:q r:q C5:e D5:e Eb5:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { tuba: 'bassPolka', chords: 'chuck', glock: 'glockHit' },
      drums: 'A2',
      parts: {
        acc: A_MEL,
        trumpet: [R, R, R, R, R, R, 'r:h D5:q F5:q', 'Bb5:h r:h', R, R, R, R, R, 'r:h C5:q Eb5:q', 'D5:h r:h', R],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'C', 'A2'] },
};
