// 芽吹き村（S003・初心者の島の町）の曲「芽吹き村の朝」。オリジナル曲。
// のどかな漁村の朝。笛が歌い、ギターが 8 分で揺れ、アコーディオンが裏拍で「ンチャ」と刻む。
// D 長調・4/4・108 BPM。イントロ 4 小節（最初の 1 回だけ）→ A 16 → B 8 → A' 16 → つなぎ 4（→ A へ戻る）。
// ループ 1 周 = 44 小節 = 約 97.8 秒。

const A_CHORDS = ['D', 'Gmaj7', 'F#m7', 'Bm7', 'Em7', 'A7', 'D', 'A7sus4 A7',
  'D', 'Gmaj7', 'F#m7', 'B7', 'Em7', 'Gm6', 'D/A A7', 'D'];
const R = 'r:w';

export default {
  id: 'town_beginner',
  title: '芽吹き村の朝',
  bpm: 108,
  beatsPerBar: 4,
  key: 'D major',
  seed: 3003,
  // range = 鳴らしてよい音域（MIDI 番号）。テストで確かめる。
  tracks: {
    flute: { inst: 'flute', range: [62, 96], vol: 0.85, pan: 0.0, rev: 0.26 },
    bell: { inst: 'bell', range: [72, 103], vol: 0.3, pan: 0.35, rev: 0.32 },
    guitar: { inst: 'guitar', range: [38, 79], voiceLo: 55, vol: 0.65, pan: -0.32, rev: 0.18, human: 0.012 },
    accordion: { inst: 'accordion', range: [50, 76], voiceLo: 57, vol: 0.6, pan: 0.28, rev: 0.22, human: 0.008 },
    strings: { inst: 'strings', range: [55, 84], voiceLo: 62, vol: 0.38, pan: -0.12, rev: 0.4 },
    bass: { inst: 'bass', range: [36, 55], vol: 0.52, pan: 0.0, rev: 0.04, human: 0.006 },
    drums: { inst: 'drums', vol: 0.5, pan: 0.0, rev: 0.14 },
  },

  // 伴奏の型（拍の位置は 0 から）
  patterns: {
    bassIntro: { kind: 'bass', steps: [[0, 'R', 2, 0.85], [2, '5', 2, 0.65]] },
    bassTwo: { kind: 'bass', steps: [[0, 'R', 1.4, 1], [1.5, '5', 0.4, 0.5], [2, '5', 0.9, 0.85], [3, 'R', 0.45, 0.7], [3.5, '>', 0.45, 0.6]] },
    bassB: { kind: 'bass', steps: [[0, 'R', 1.4, 0.95], [1.5, 'R', 0.45, 0.5], [2, '5', 1.9, 0.8]] },
    arpIntro: { kind: 'arp', steps: [[0, 0, 3, 0.9], [1, 2, 2.5, 0.65], [2, 3, 2, 0.7], [3, 4, 1.5, 0.6]] },
    arp8: { kind: 'arp', steps: [[0, 0, 1.5, 0.95], [0.5, 2, 1, 0.55], [1, 3, 1, 0.7], [1.5, 2, 1, 0.5], [2, 1, 1.5, 0.8], [2.5, 2, 1, 0.55], [3, 3, 1, 0.7], [3.5, 4, 0.8, 0.55]] },
    arpQuarter: { kind: 'arp', steps: [[0, 0, 2, 0.85], [1, 3, 1.5, 0.6], [2, 1, 1.5, 0.7], [3, 3, 1, 0.6]] },
    offbeat: { kind: 'chord', voices: 3, steps: [[1, 0.42, 0.85], [3, 0.42, 0.85]] },
    hold: { kind: 'hold', voices: 4, vel: 0.8 },
  },

  // 太鼓（16 分 × 16 で 1 小節。x=強 o=弱 X=とても強い）
  drumPatterns: {
    intro: {
      shaker: '....o.o.....o.o.',
      tri: ['x...............', '................', 'o...............', '................'],
    },
    A: {
      kick: 'x.......o.......',
      block: '....o.......o...',
      shaker: 'o.x.o.x.o.x.o.x.',
    },
    B: {
      kick: 'x.........o.....',
      shaker: 'o.o.o.o.o.o.o.o.',
      tamb: '....o.......o...',
      tri: ['x...............', '................'],
    },
    A2: {
      kick: 'x.......o.o.....',
      snare: '....o.......o...',
      shaker: 'o.x.o.x.o.x.o.x.',
      tamb: '............o...',
      crash: (bi) => (bi === 0 ? 'x...............' : '................'),
    },
    tag: {
      kick: ['x.......o.......', 'x.......o.......', 'x.......o.......', 'x.....o.x.o.o.o.'],
      snare: ['....o.......o...', '....o.......o...', '....o.......o...', '....o...o.o.oxox'],
      shaker: 'o.x.o.x.o.x.o.x.',
    },
  },

  sections: {
    intro: {
      chords: ['D', 'Bm7', 'Gmaj7', 'A7sus4 A7'],
      gen: { guitar: 'arpIntro', bass: 'bassIntro' },
      drums: 'intro',
      mix: { bass: 0.75, guitar: 0.85 },
      parts: {
        bell: [
          'A5:e D6:e F#6:e A6:e F#6:q D6:q',
          'F#5:e B5:e D6:e F#6:e D6:q B5:q',
          'G5:e B5:e D6:e F#6:e D6:q B5:q',
          'E6:h r:h',
        ],
        flute: [R, R, R, 'r:h A5:e G5:e E5:q'],
      },
    },

    A: {
      chords: A_CHORDS,
      gen: { guitar: 'arp8', bass: 'bassTwo', accordion: 'offbeat' },
      drums: 'A',
      mix: { bell: 0.8 },
      parts: {
        flute: [
          'F#5:q. A5:e D6:q C#6:e B5:e',
          'A5:q. G5:e F#5:e G5:e A5:q',
          'E5:e F#5:e A5:e C#6:e E6:q C#6:q',
          'D6:q. C#6:e B5:h',
          'G5:q. B5:e E6:q D6:e B5:e',
          'C#6:e D6:e E6:e C#6:e A5:h',
          'F#6:q. E6:e D6:q A5:q',
          'B5:q A5:q G5:e F#5:e E5:q',
          'F#5:q. A5:e D6:q C#6:e B5:e',
          'A5:q. G5:e F#5:e G5:e A5:q',
          'A5:e C#6:e E6:e F#6:e E6:q C#6:q',
          'D#6:q. C#6:e B5:q A5:q',
          'G5:q B5:q E6:q. D6:e',
          'D6:q. Bb5:e G5:q E5:q',
          'F#5:q A5:q E5:q G5:q',
          'F#5:e E5:e D5:h.',
        ],
        bell: [R, R, R, R, R, R, R, 'r:h. C#6:q', R, R, R, R, R, R, R, 'r:q F#6:e D6:e A5:h'],
      },
    },

    B: {
      chords: ['Gmaj7', 'A6', 'F#m7', 'Bm7', 'Gmaj7', 'A', 'Bbmaj7', 'A7sus4 A7'],
      gen: { guitar: 'arpQuarter', bass: 'bassB', accordion: 'hold', strings: 'hold' },
      drums: 'B',
      mix: { guitar: 0.75, accordion: 0.6, strings: 0.9, bell: 0.9 },
      parts: {
        flute: [
          'B5:h A5:q G5:q',
          'F#5:h. E5:q',
          'A5:h C#6:q A5:q',
          'B5:h. D6:q',
          'D6:h C#6:q B5:q',
          'C#6:h. E6:q',
          'D6:h F6:q D6:q',
          'E6:h C#6:e B5:e A5:e G5:e',
        ],
        bell: [R, 'r:h F#6:e E6:e C#6:q', R, 'r:h F#6:e D6:e B5:q', R, 'r:h A6:e E6:e C#6:q', R, R],
      },
    },

    A2: {
      chords: A_CHORDS,
      gen: { guitar: 'arp8', bass: 'bassTwo', accordion: 'offbeat', strings: 'hold' },
      drums: 'A2',
      mix: { strings: 0.6 },
      parts: {
        flute: [
          'F#5:q. A5:e D6:q C#6:e B5:e',
          'A5:q. G5:e F#5:e G5:e A5:q',
          'E5:e F#5:e A5:e C#6:e E6:q C#6:q',
          'D6:e C#6:e B5:e C#6:e D6:q F#6:q',
          'G5:q. B5:e E6:q D6:e B5:e',
          'C#6:e D6:e E6:e C#6:e A5:h',
          'F#6:q. E6:e D6:q A5:q',
          'B5:q A5:q G5:e A5:e B5:e C#6:e',
          'D6:q. F#6:e A6:q G6:e F#6:e',
          'E6:q. D6:e B5:e D6:e E6:q',
          'A5:e C#6:e E6:e F#6:e A6:q F#6:q',
          'F#6:q. D#6:e B5:q A5:q',
          'G5:q B5:q E6:q. G6:e',
          'E6:q. D6:e Bb5:q G5:q',
          'F#5:q A5:q G5:e A5:e C#6:q',
          'D6:h. r:q',
        ],
        bell: [
          R, 'r:h D6:q F#6:q', R, R, R, 'r:h E6:q G6:q', R, R,
          'A5:e D6:e F#6:e A6:e r:h', R, R, R, R, 'r:h Bb6:q G6:q', R, 'r:q A6:e F#6:e D6:q A5:q',
        ],
      },
    },

    tag: {
      chords: ['Gmaj7', 'F#m7', 'Em7', 'A7'],
      gen: { guitar: 'arp8', bass: 'bassTwo', accordion: 'offbeat' },
      drums: 'tag',
      parts: {
        flute: [
          'r:h D6:e C#6:e B5:e A5:e',
          'C#6:h r:h',
          'B5:e A5:e G5:e F#5:e E5:e F#5:e G5:e B5:e',
          'C#6:h A5:e G5:e E5:q',
        ],
        bell: [R, 'r:h E6:e F#6:e A6:q', R, R],
      },
    },
  },

  // intro は最初の 1 回だけ。そのあとは loop をくり返す。
  order: { intro: ['intro'], loop: ['A', 'B', 'A2', 'tag'] },
};
