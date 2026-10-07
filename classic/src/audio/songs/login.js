// キャラ選び・作成画面の曲「はじまりの灯」。オリジナル曲。
// 静かで温かい。何度聞いても疲れない。オルゴールが旋律、ピアノのゆっくりした分散和音、パッド。
// F 長調・4/4・84 BPM。イントロ 2 小節 → A 8 → A' 8 → B 8 → A 8（→ A へ戻る）。ループ 32 小節 ≒ 91.4 秒。

const A_CHORDS = ['F', 'Am7', 'Bbmaj7', 'C7sus4 C7', 'Dm7', 'Gm7', 'Bbmaj7', 'C7'];
const R = 'r:w';
const A_MEL = [
  'A5:q. C6:e F6:q E6:q',
  'E6:q C6:q A5:h',
  'D6:q. C6:e Bb5:q A5:q',
  'G5:h. r:q',
  'F5:q. A5:e D6:q C6:q',
  'Bb5:q. A5:e G5:q D6:q',
  'C6:q. D6:e F6:q A5:q',
  'G5:h. r:q',
];

export default {
  id: 'login',
  title: 'はじまりの灯',
  bpm: 84,
  beatsPerBar: 4,
  key: 'F major',
  seed: 200,
  tracks: {
    box: { inst: 'musicbox', melody: true, range: [65, 96], vol: 0.95, pan: 0.1, rev: 0.4 },
    piano: { inst: 'piano', range: [41, 81], voiceLo: 53, vol: 0.62, pan: -0.25, rev: 0.32, human: 0.008 },
    pad: { inst: 'pad', range: [48, 74], voiceLo: 53, vol: 0.5, pan: 0.0, rev: 0.55 },
    bell: { inst: 'bell', range: [77, 103], vol: 0.22, pan: 0.4, rev: 0.5 },
    bass: { inst: 'bass', range: [29, 48], vol: 0.36, pan: 0.0, rev: 0.08 },
    drums: { inst: 'drums', vol: 0.35, pan: 0.0, rev: 0.4 },
  },
  patterns: {
    pianoArp: { kind: 'arp', steps: [[0, 0, 2.5, 0.8], [0.5, 2, 2, 0.45], [1, 3, 2, 0.5], [1.5, 4, 1.5, 0.45], [2, 1, 2, 0.6], [2.5, 3, 1.5, 0.45], [3, 4, 1, 0.5], [3.5, 3, 0.8, 0.4]] },
    pianoSlow: { kind: 'arp', steps: [[0, 0, 3, 0.75], [1, 2, 2, 0.5], [2, 3, 2, 0.55], [3, 4, 1, 0.45]] },
    bassHalf: { kind: 'bass', steps: [[0, 'R', 1.9, 0.85], [2, '5', 1.9, 0.6]] },
    hold: { kind: 'hold', voices: 3, vel: 0.75 },
  },
  drumPatterns: {
    intro: { tri: ['x...............', '................'] },
    A: { tri: (bi) => (bi % 4 === 0 ? 'o...............' : '................') },
    B: { shaker: '..o...o...o...o.', tri: (bi) => (bi % 4 === 0 ? 'o...............' : '................') },
  },
  sections: {
    intro: {
      chords: ['Bbmaj7', 'C7sus4 C7'],
      gen: { piano: 'pianoSlow', pad: 'hold' },
      drums: 'intro',
      parts: { bell: ['D6:e F6:e A6:e D7:e r:h', 'C6:e F6:e G6:e Bb6:e r:h'] },
    },
    A: {
      chords: A_CHORDS,
      gen: { piano: 'pianoSlow', pad: 'hold', bass: 'bassHalf' },
      drums: 'A',
      parts: { box: A_MEL },
    },
    A2: {
      chords: A_CHORDS,
      gen: { piano: 'pianoArp', pad: 'hold', bass: 'bassHalf' },
      drums: 'A',
      parts: {
        box: [
          'A5:q. C6:e F6:q G6:q',
          'E6:q. D6:e C6:h',
          'D6:q. F6:e Bb6:q A6:q',
          'G6:h E6:h',
          'F6:q. E6:e D6:q A5:q',
          'Bb5:q. D6:e G6:q F6:q',
          'D6:q. C6:e Bb5:q D6:q',
          'C6:h. r:q',
        ],
        bell: [R, R, R, 'r:h. C7:q', R, R, R, 'r:h E7:q G7:q'],
      },
    },
    B: {
      chords: ['Bbmaj7', 'Am7', 'Gm7', 'Fmaj7', 'Bbmaj7', 'Am7', 'Gm7', 'C7sus4 C7'],
      gen: { piano: 'pianoArp', pad: 'hold', bass: 'bassHalf' },
      drums: 'B',
      mix: { pad: 1.15 },
      parts: {
        box: [
          'D6:h F6:h',
          'E6:h. C6:q',
          'D6:q. Bb5:e G5:h',
          'A5:h. C6:q',
          'F6:h. D6:q',
          'C6:h. E6:q',
          'D6:q. F6:e Bb5:q D6:q',
          'C6:h. r:q',
        ],
      },
    },
  },
  order: { intro: ['intro'], loop: ['A', 'A2', 'B', 'A'] },
};
