// ファンファーレ・ジングル（くり返さない短い曲）。オリジナル。
// どれも jingle: true（ループしない。書き出しは「1 回＋残響」）。order.loop の区間を 1 回だけ鳴らす。
// 一覧と使う所は docs/SOUND.md 1-5。

const base = (o) => ({ beatsPerBar: 4, jingle: true, patterns: { hold: { kind: 'hold', voices: 3, vel: 0.8 }, hold4: { kind: 'hold', voices: 4, vel: 0.8 } }, order: { intro: [], loop: ['main'] }, ...o });

// Lv アップ（約 2 秒）: 3 連で駆け上がる金管とベル、ストリングスの和音
export const jingle_levelup = base({
  id: 'jingle_levelup', title: 'レベルアップ', bpm: 120, key: 'D major', seed: 9101,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [60, 90], vol: 0.9, pan: 0.0, rev: 0.3 },
    bell: { inst: 'bell', range: [72, 100], vol: 0.6, pan: 0.35, rev: 0.4 },
    strings: { inst: 'strings', range: [50, 80], voiceLo: 62, vol: 0.55, pan: -0.25, rev: 0.4 },
    drums: { inst: 'drums', vol: 0.55, pan: 0.0, rev: 0.3 },
  },
  drumPatterns: { main: { timp: 'x...x...........', crash: '....x...........' } },
  sections: {
    main: {
      chords: ['D'],
      gen: { strings: 'hold' },
      drums: 'main',
      parts: { brass: ['D5:et F#5:et A5:et D6:h.'], bell: ['D6:et F#6:et A6:et D7:h.'] },
    },
  },
});

// 転職（約 5.5 秒）: 晴れやかで少し荘厳。3 連の呼びかけ → 上がって E♭ の和音、ティンパニのロールとシンバル
export const jingle_jobup = base({
  id: 'jingle_jobup', title: '転職', bpm: 132, key: 'Eb major', seed: 9202,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [58, 90], vol: 0.95, pan: 0.0, rev: 0.3 },
    horn: { inst: 'brass', range: [46, 70], voiceLo: 51, vol: 0.5, pan: 0.25, rev: 0.35 },
    strings: { inst: 'strings', range: [50, 84], voiceLo: 58, vol: 0.55, pan: -0.25, rev: 0.4 },
    bell: { inst: 'bell', range: [74, 100], voiceLo: 79, vol: 0.4, pan: 0.4, rev: 0.45 },
    bass: { inst: 'bass', range: [27, 51], vol: 0.55, pan: 0.0, rev: 0.05 },
    drums: { inst: 'drums', vol: 0.6, pan: 0.0, rev: 0.3 },
  },
  patterns: {
    hold: { kind: 'hold', voices: 3, vel: 0.8 },
    bassL: { kind: 'bass', steps: [[0, 'R', 1.9, 1], [2, 'R', 1.9, 0.9]] },
    bellUp: { kind: 'arp', steps: [[0, 1, 1, 0.5], [0.5, 2, 1, 0.5], [1, 3, 1, 0.5], [1.5, 4, 1, 0.55], [2, 5, 2, 0.6]] },
  },
  drumPatterns: {
    main: {
      timp: ['x.......x.......', 'x.......x.......', 'xxxxxxxxx.......'],
      crash: ['................', '................', 'x.......x.......'],
      snare: ['....o.o.....o.o.', '....o.o.....o.o.', '................'],
    },
  },
  sections: {
    main: {
      chords: ['Eb', 'Ab Bb', 'Eb'],
      gen: { horn: 'hold', strings: 'hold', bass: 'bassL', bell: 'bellUp' },
      drums: 'main',
      parts: { brass: ['Bb4:et Bb4:et Bb4:et Eb5:q G5:q Bb5:q', 'C6:q. Ab5:e Bb5:q. D6:e', 'Eb6:w'] },
    },
  },
});

// クエスト完了（約 2 秒）: ピアノとベルの「できた！」
export const jingle_quest = base({
  id: 'jingle_quest', title: 'クエスト完了', bpm: 132, key: 'F major', seed: 9303,
  tracks: {
    piano: { inst: 'piano', melody: true, range: [60, 92], vol: 1.0, pan: 0.0, rev: 0.3 },
    lh: { inst: 'piano', range: [48, 72], voiceLo: 53, vol: 0.55, pan: -0.15, rev: 0.3 },
    bell: { inst: 'bell', range: [76, 100], vol: 0.6, pan: 0.35, rev: 0.4 },
    drums: { inst: 'drums', vol: 0.45, pan: 0.0, rev: 0.3 },
  },
  drumPatterns: { main: { tri: '........x.......' } },
  sections: {
    main: {
      chords: ['F'],
      gen: { lh: 'hold' },
      drums: 'main',
      parts: { piano: ['C5:e F5:e A5:e C6:e F6:h'], bell: ['r:h A6:h'] },
    },
  },
});

// ボスを倒した（約 4 秒）: 金管の勝利のファンファーレ、ティンパニ、最後にシンバル
export const jingle_boss_clear = base({
  id: 'jingle_boss_clear', title: 'ボス撃破', bpm: 120, key: 'C major', seed: 9404,
  tracks: {
    brass: { inst: 'brass', melody: true, range: [55, 88], vol: 0.95, pan: 0.0, rev: 0.3 },
    horn: { inst: 'brass', range: [43, 67], voiceLo: 48, vol: 0.5, pan: 0.25, rev: 0.35 },
    strings: { inst: 'strings', range: [48, 84], voiceLo: 55, vol: 0.5, pan: -0.25, rev: 0.4 },
    bass: { inst: 'bass', range: [24, 48], vol: 0.6, pan: 0.0, rev: 0.05 },
    drums: { inst: 'drums', vol: 0.6, pan: 0.0, rev: 0.3 },
  },
  patterns: { hold: { kind: 'hold', voices: 3, vel: 0.8 }, bassL: { kind: 'bass', steps: [[0, 'R', 1.9, 1], [2, 'R', 1.9, 1]] } },
  drumPatterns: {
    main: {
      timp: ['x...........x...', 'x...x...xxxx....'],
      taiko: ['x...............', '........x.......'],
      crash: ['x...............', '........x.......'],
    },
  },
  sections: {
    main: {
      chords: ['C', 'F C'],
      gen: { horn: 'hold', strings: 'hold', bass: 'bassL' },
      drums: 'main',
      parts: { brass: ['G4:et C5:et E5:et G5:q. E5:e G5:q', 'A5:et G5:et F5:et G5:et A5:et B5:et C6:h'] },
    },
  },
});

// 自分が倒れた（約 3 秒）: ピアノの静かな下降とパッド
export const jingle_death = base({
  id: 'jingle_death', title: '倒れた', bpm: 72, key: 'A minor', seed: 9505,
  tracks: {
    piano: { inst: 'piano', melody: true, range: [55, 84], vol: 1.0, pan: 0.0, rev: 0.45 },
    pad: { inst: 'pad', range: [45, 72], voiceLo: 50, vol: 0.6, pan: 0.2, rev: 0.5 },
    drums: { inst: 'drums', vol: 0.3, pan: 0.0, rev: 0.4 },
  },
  drumPatterns: { main: { drip: '..........o.....' } },
  sections: {
    main: {
      chords: ['Dm Am'],
      gen: { pad: 'hold' },
      drums: 'main',
      parts: { piano: ['E5:e D5:e C5:e B4:e A4:h'] },
    },
  },
});

// 船が出る・着く（約 3 秒）: 汽笛風の低い金管の和音とベル
export const jingle_ship = base({
  id: 'jingle_ship', title: '出航', bpm: 90, key: 'C major', seed: 9606,
  tracks: {
    bell: { inst: 'bell', melody: true, range: [72, 100], vol: 0.7, pan: 0.3, rev: 0.4 },
    horn: { inst: 'brass', range: [43, 67], voiceLo: 48, vol: 0.65, pan: -0.1, rev: 0.45 },
    drums: { inst: 'drums', vol: 0.4, pan: 0.0, rev: 0.35 },
  },
  patterns: { blow: { kind: 'chord', voices: 3, steps: [[0, 1.6, 0.9], [2, 1.9, 0.8]] } },
  drumPatterns: { main: { tri: 'x.......x.......' } },
  sections: {
    main: {
      chords: ['C'],
      gen: { horn: 'blow' },
      drums: 'main',
      parts: { bell: ['G5:e C6:e E6:q G6:h'] },
    },
  },
});

export const JINGLES = { jingle_levelup, jingle_jobup, jingle_quest, jingle_boss_clear, jingle_death, jingle_ship };
