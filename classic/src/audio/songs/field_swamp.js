// 沼・下水の狩場の曲「ぬかるみの行進」。オリジナル曲。
// じめじめした沼を、少しおどけて歩く。低いクラリネットが切れぎれに歌い、木琴とはねるベースが付いてくる。
// G 短調・4/4・100 BPM。イントロ 2 小節 → A 16 → B 8（A♭ へずれる）→ A' 16（→ A へ戻る）。ループ 40 小節 = 96 秒。

const A_CHORDS = ['Gm', 'Gm', 'Cm', 'D7', 'Gm', 'Eb', 'Am7b5 D7', 'Gm',
  'Cm', 'Gm', 'Eb', 'D7', 'Gm', 'Cm D7', 'Gm', 'D7'];
const R = 'r:w';
const A_MEL = [
  'G4:e r:e D5:e r:e Bb4:q A4:e Bb4:e',
  'G4:q. r:e D4:q r:q',
  'C5:e r:e Eb5:e r:e G5:q F5:e Eb5:e',
  'D5:q. C5:e A4:q F#4:q',
  'G4:e A4:e Bb4:e B4:e C5:q D5:q',
  'Eb5:q. D5:e Bb4:h',
  'C5:e Bb4:e A4:e G4:e F#4:q A4:q',
  'G4:h r:h',
  'Eb5:e r:e G5:e r:e C6:q Bb5:e G5:e',
  'Bb5:q. A5:e G5:q D5:q',
  'Eb5:e F5:e G5:e Bb5:e G5:q Eb5:q',
  'F#5:q. E5:e D5:q C5:q',
  'Bb4:e r:e D5:e r:e G5:q F#5:e G5:e',
  'Eb5:q C5:q A4:q F#4:q',
  'G4:q D4:q G4:q r:q',
  'r:h D4:e F#4:e A4:e C5:e',
];

export default {
  id: 'field_swamp',
  title: 'ぬかるみの行進',
  bpm: 100,
  beatsPerBar: 4,
  key: 'G minor',
  seed: 4404,
  tracks: {
    clarinet: { inst: 'clarinet', melody: true, range: [55, 86], vol: 0.95, pan: 0.05, rev: 0.22 },
    marimba: { inst: 'marimba', range: [55, 84], voiceLo: 60, vol: 0.7, pan: -0.32, rev: 0.2, human: 0.006 },
    bass: { inst: 'bass', range: [31, 52], vol: 0.62, pan: 0.0, rev: 0.04, gate: 0.6 },
    pad: { inst: 'pad', range: [50, 74], voiceLo: 53, vol: 0.35, pan: 0.2, rev: 0.45 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.12 },
  },
  patterns: {
    bassBounce: { kind: 'bass', steps: [[0, 'R', 0.45, 1], [1, '5', 0.45, 0.75], [2, 'R', 0.45, 0.9], [3, '5', 0.3, 0.7], [3.5, '>', 0.3, 0.6]] },
    bassSlow: { kind: 'bass', steps: [[0, 'R', 0.9, 0.9], [2, '5', 0.9, 0.7], [3.5, '>', 0.4, 0.55]] },
    marOff: { kind: 'arp', steps: [[0.5, 1, 0.3, 0.7], [1.5, 2, 0.3, 0.6], [2.5, 1, 0.3, 0.7], [3.5, 3, 0.3, 0.6]] },
    marRoll: { kind: 'arp', steps: [[0, 1, 0.3, 0.6], [0.5, 2, 0.3, 0.5], [1, 3, 0.3, 0.6], [1.5, 2, 0.3, 0.5], [2, 1, 0.3, 0.6], [2.5, 2, 0.3, 0.5], [3, 3, 0.3, 0.6], [3.5, 4, 0.3, 0.5]] },
    hold: { kind: 'hold', voices: 3, vel: 0.8 },
  },
  drumPatterns: {
    intro: { kick: 'x.......x.......', block: '....o.......o...' },
    A: { kick: 'x.......x.......', rim: '....x.......x...', block: '..o...o...o..oo.', shaker: 'o...o...o...o...' },
    B: { kick: 'x...........x...', block: '....o.o.....o...', shaker: 'o.o.o.o.o.o.o.o.' },
    A2: {
      kick: 'x.......x.x.....',
      snare: (bi) => (bi === 15 ? '....o...o.o.o.oo' : '....o.......o...'),
      block: '..o...o...o..oo.',
      shaker: 'o.o.o.o.o.o.o.o.',
    },
  },
  sections: {
    intro: {
      chords: ['Gm', 'D7'],
      gen: { marimba: 'marOff', bass: 'bassBounce' },
      drums: 'intro',
      parts: { clarinet: [R, 'r:h D4:e F#4:e A4:e C5:e'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { marimba: 'marOff', bass: 'bassBounce' },
      drums: 'A',
      parts: { clarinet: A_MEL },
    },
    B: {
      chords: ['Eb', 'Eb', 'Cm', 'Cm', 'Ab', 'Ab', 'D7', 'D7'],
      gen: { marimba: 'marRoll', bass: 'bassSlow', pad: 'hold' },
      drums: 'B',
      mix: { marimba: 0.6 },
      parts: {
        clarinet: [
          'G5:h. F5:e Eb5:e',
          'Bb4:h r:h',
          'C5:q. Eb5:e G5:q F5:q',
          'Eb5:h r:q D5:e C5:e',
          'C5:q. Eb5:e Ab5:q G5:q',
          'F5:q Eb5:q C5:h',
          'D5:e r:e F#5:e r:e A5:e r:e C6:e r:e',
          'A5:q F#5:q D5:q r:q',
        ],
      },
    },
    A2: {
      chords: A_CHORDS,
      gen: { marimba: 'marRoll', bass: 'bassBounce', pad: 'hold' },
      drums: 'A2',
      mix: { marimba: 0.55, pad: 0.7 },
      parts: { clarinet: A_MEL },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'B', 'A2'] },
};
