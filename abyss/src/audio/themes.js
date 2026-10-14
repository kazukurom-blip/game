// BGM の曲の設計図（データだけ）。composer.js がこれを小節ごとの音符に変え、music.js が鳴らす。
// 曲は「前奏（intro 小節）→ 輪（form の順に A/B の進行を回す）」で、輪は継ぎ目なく繰り返す。
// 差し替え: 枠 ID は `bgm.<id>`（設定の「音」から自分の曲を入れられる。入れた曲はそのまま繰り返し再生する）。
//
// 形:
// { id, name, desc, bpm, meter（1 小節の拍）, steps（1 小節の刻み。16 か 12）, key（主音の MIDI 番号）, scale,
//   A: [度数...]（0 始まりの音階の度数。1 つが chordBars 小節）, B?, form: 'AABA' など, chordBars, intro,
//   pad: { type: strings|choir|organ|glass|dark, vol, oct, seventh?, cut?, pump? }  … 和音を伸ばす（発振器）
//   drone: { type: sine|saw|organ, vol, iv: [半音...] }                       … 主音の持続音
//   bass: { inst, pattern: root|rootFifth|pulse8|ostinato|walk, vol, oct }
//   arp:  { inst, pattern: up|down|updown|broken|random, rate（1 拍の音数）, oct, vol, density, echo?, pan?, wet? }
//   lead: { inst, vol, oct, density（0〜1）, from（輪の何小節目から）, wet?, pan? }
//   drums: { pattern（DRUM_PATTERNS の名前）, vol, fill?: 'tom'|'snare'|'dum'|'taiko', accent?: 'gong'|'crash'|'timpani' }
//   amb: { wind?: 音量, sprinkle?: { inst（DRUMS の環境音）, rate（1 小節あたりの数）, vol } }

export const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  octatonic: [0, 2, 3, 5, 6, 8, 9, 11],
};

// 打楽器の型。'X' 強い / 'x' ふつう / 'o' 弱い / '.' 休み。every: N なら N 小節に 1 回だけ
export const DRUM_PATTERNS = {
  sparse: { kick: 'X.......x.......', tek: '........o.....o.', shaker: '....o.......o...' },
  title: { taiko: { p: 'X.......x.......', every: 2 }, timpani: { p: '........o.......', every: 4 } },
  doumbek: { dum: 'X.......x.......', tek: '..x...x.....x...', shaker: 'o.oo.oo.oo.oo.oo', rim: '....o.......o...' },
  ice: { timpani: { p: 'x...........', every: 2 }, shaker: '......o.....' },
  deep: { kick: 'x.....x.........', rim: '........x.......', shaker: '....o.......o..o' },
  forge: { taiko: 'X..x..x...x.x...', anvil: '....X.......X...', hat: 'o.o.o.o.o.o.o.o.' },
  six8: { dum: 'X.....x.....', tek: '...x.....xx.', shaker: 'o.oo.oo.oo.o' },
  march: { timpani: 'X.......x.......', snare: '....x.......x.oo', hat: 'o.o.o.o.o.o.o.o.' },
  mech: { kick: 'X.......x.......', tick: 'xoxoxoxoxoxoxoxo', anvil: '............x...', rim: '....x.......x...' },
  void: { kick: { p: 'x...............', every: 2 }, rim: { p: '..........o.....', every: 2 } },
  doom: { taiko: 'X.....x...x.....', snare: '....X.......X...', hat: '..o...o...o...o.' },
  boss: { kick: 'X.x.x.x.X.x.x.xx', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............o.' },
  taiko: { taiko: 'X..x..x.X..x..x.', tom: '....x.......x.xx', snare: '....X.......X...', shaker: 'oooooooooooooooo' },
  rift: { kick: 'X...x...X...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'oooooooooooooooo' },
};

export const THEMES = [
  {
    id: 'title', gain: 0.71, name: '深淵の呼び声', desc: 'タイトル。暗い合唱と鐘、遠い太鼓',
    bpm: 66, meter: 4, steps: 16, key: 50, scale: 'aeolian', A: [0, 5, 3, 4], B: [0, 6, 5, 4], form: 'AB', chordBars: 2, intro: 2,
    pad: { type: 'choir', vol: 0.5, oct: 0 }, drone: { type: 'sine', vol: 0.32, iv: [0, 7] },
    bass: { inst: 'sub', pattern: 'root', vol: 0.4, oct: -2 },
    arp: { inst: 'musicbox', pattern: 'up', rate: 2, oct: 1, vol: 0.2, density: 0.7, wet: 0.7, pan: 0.25 },
    lead: { inst: 'bell', vol: 0.26, oct: 1, density: 0.35, from: 4, wet: 0.7, pan: -0.15 },
    drums: { pattern: 'title', vol: 0.45, accent: 'gong' },
    amb: { wind: 0.06 },
  },
  {
    id: 'act1', gain: 2.34, name: '灰降る村', desc: '第一章。枯れた弦と寂しい笛、灰の風',
    bpm: 74, meter: 4, steps: 16, key: 50, scale: 'aeolian', A: [0, 5, 2, 6], B: [3, 0, 4, 0], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'strings', vol: 0.36, oct: 0 },
    bass: { inst: 'bassPluck', pattern: 'rootFifth', vol: 0.42, oct: -2 },
    arp: { inst: 'pluck', pattern: 'broken', rate: 2, oct: 0, vol: 0.34, density: 0.9, wet: 0.35, pan: -0.2 },
    lead: { inst: 'flute', vol: 0.28, oct: 1, density: 0.5, from: 4, wet: 0.5, pan: 0.15 },
    drums: { pattern: 'sparse', vol: 0.38, fill: 'tom' },
    amb: { wind: 0.1 },
  },
  {
    id: 'act2', gain: 1.8, name: '砂塵の墓所', desc: '第二章。異国の音階、砂の弦と手太鼓',
    bpm: 96, meter: 4, steps: 16, key: 52, scale: 'hijaz', A: [0, 1, 0, 6], B: [3, 1, 0, 0], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'dark', vol: 0.2, oct: 0 }, drone: { type: 'saw', vol: 0.18, iv: [0, 7] },
    bass: { inst: 'sub', pattern: 'root', vol: 0.36, oct: -2 },
    arp: { inst: 'oud', pattern: 'random', rate: 4, oct: 0, vol: 0.3, density: 0.55, wet: 0.3, pan: -0.25 },
    lead: { inst: 'flute', vol: 0.27, oct: 1, density: 0.55, from: 4, wet: 0.45, pan: 0.2 },
    drums: { pattern: 'doumbek', vol: 0.5, fill: 'dum' },
    amb: { wind: 0.12 },
  },
  {
    id: 'act3', gain: 1.62, name: '凍てつく峰', desc: '第三章。玻璃の和音と三連の煌めき、吹雪',
    bpm: 62, meter: 4, steps: 12, key: 54, scale: 'lydian', A: [0, 1, 0, 1], B: [5, 4, 1, 0], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'glass', vol: 0.42, oct: 0, cut: 3000 },
    bass: { inst: 'sub', pattern: 'root', vol: 0.3, oct: -2 },
    arp: { inst: 'glass', pattern: 'updown', rate: 3, oct: 1, vol: 0.2, density: 0.85, wet: 0.75, echo: true, pan: 0.3 },
    lead: { inst: 'bell', vol: 0.22, oct: 1, density: 0.3, from: 4, wet: 0.75, pan: -0.2 },
    drums: { pattern: 'ice', vol: 0.4 },
    amb: { wind: 0.16 },
  },
  {
    id: 'act4', gain: 1.6, name: '沈んだ都', desc: '第四章。水底の鍵盤、ゆれる和音、泡',
    bpm: 78, meter: 4, steps: 16, key: 48, scale: 'dorian', A: [0, 3, 0, 3], B: [2, 6, 3, 0], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'strings', vol: 0.32, oct: 0, cut: 1100 },
    bass: { inst: 'sub', pattern: 'rootFifth', vol: 0.36, oct: -2 },
    arp: { inst: 'epiano', pattern: 'up', rate: 2, oct: 1, vol: 0.28, density: 0.8, wet: 0.5, echo: true, pan: -0.2 },
    lead: { inst: 'glass', vol: 0.22, oct: 1, density: 0.3, from: 8, wet: 0.7, pan: 0.2 },
    drums: { pattern: 'deep', vol: 0.34 },
    amb: { sprinkle: { inst: 'bubble', rate: 3, vol: 0.18 } },
  },
  {
    id: 'act5', gain: 0.78, name: '紅蓮の溶鉱炉', desc: '第五章。大太鼓と金床、歪んだ低音',
    bpm: 118, meter: 4, steps: 16, key: 45, scale: 'harmonic', A: [0, 0, 5, 4], B: [3, 0, 5, 4], form: 'AABA', chordBars: 2, intro: 0,
    pad: { type: 'dark', vol: 0.26, oct: 0 },
    bass: { inst: 'bassSaw', pattern: 'ostinato', vol: 0.4, oct: -2 },
    arp: { inst: 'metal', pattern: 'broken', rate: 2, oct: 0, vol: 0.14, density: 0.45, wet: 0.3, pan: 0.25 },
    lead: { inst: 'brass', vol: 0.26, oct: 1, density: 0.45, from: 8, wet: 0.35, pan: -0.1 },
    drums: { pattern: 'forge', vol: 0.58, fill: 'taiko', accent: 'crash' },
    amb: { sprinkle: { inst: 'ember', rate: 2, vol: 0.16 } },
  },
  {
    id: 'act6', gain: 1.93, name: '毒霧の森沼', desc: '第六章。八分の六拍子の木の鍵、ゆがんだ和音、しずく',
    bpm: 84, meter: 4, steps: 12, key: 49, scale: 'phrygian', A: [0, 1, 0, 6], B: [3, 1, 4, 0], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'dark', vol: 0.28, oct: 0, wobble: true },
    bass: { inst: 'sub', pattern: 'root', vol: 0.34, oct: -2 },
    arp: { inst: 'marimba', pattern: 'broken', rate: 3, oct: 0, vol: 0.3, density: 0.7, wet: 0.3, pan: -0.2 },
    lead: { inst: 'glass', vol: 0.2, oct: 1, density: 0.3, from: 4, wet: 0.6, pan: 0.25 },
    drums: { pattern: 'six8', vol: 0.42, fill: 'dum' },
    amb: { sprinkle: { inst: 'drip', rate: 2, vol: 0.16 } },
  },
  {
    id: 'act7', gain: 1.64, name: '天穹の廃城', desc: '第七章。合唱と竪琴、雲上の行進',
    bpm: 88, meter: 4, steps: 16, key: 53, scale: 'major', A: [0, 4, 5, 3], B: [5, 3, 0, 4], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'choir', vol: 0.42, oct: 0 },
    bass: { inst: 'bassPluck', pattern: 'rootFifth', vol: 0.36, oct: -2 },
    arp: { inst: 'harp', pattern: 'up', rate: 2, oct: 1, vol: 0.28, density: 0.9, wet: 0.5, pan: 0.25 },
    lead: { inst: 'brass', vol: 0.24, oct: 0, density: 0.45, from: 4, wet: 0.5, pan: -0.1 },
    drums: { pattern: 'march', vol: 0.45, fill: 'snare', accent: 'crash' },
    amb: { wind: 0.06 },
  },
  {
    id: 'act8', gain: 1.36, name: '機巧の迷宮', desc: '第八章。刻む時計とオルゴール、蒸気',
    bpm: 108, meter: 4, steps: 16, key: 50, scale: 'aeolian', A: [0, 0, 5, 6], B: [3, 4, 0, 0], form: 'AABA', chordBars: 2, intro: 1,
    pad: { type: 'organ', vol: 0.18, oct: 0 },
    bass: { inst: 'bassPluck', pattern: 'pulse8', vol: 0.4, oct: -2 },
    arp: { inst: 'musicbox', pattern: 'up', rate: 4, oct: 1, vol: 0.2, density: 1, wet: 0.3, pan: 0.2 },
    lead: { inst: 'metal', vol: 0.2, oct: 1, density: 0.3, from: 8, wet: 0.45, pan: -0.25 },
    drums: { pattern: 'mech', vol: 0.5, fill: 'tom' },
    amb: { sprinkle: { inst: 'steam', rate: 1, vol: 0.14 } },
  },
  {
    id: 'act9', gain: 0.79, name: '虚無の境界', desc: '第九章。八音の音階、ほどける和音、星屑',
    bpm: 60, meter: 4, steps: 16, key: 47, scale: 'octatonic', A: [0, 3, 0, 5], B: [2, 6, 4, 0], form: 'AABA', chordBars: 2, intro: 2,
    pad: { type: 'glass', vol: 0.4, oct: 0, cut: 2400 }, drone: { type: 'sine', vol: 0.3, iv: [0, 12] },
    bass: { inst: 'sub', pattern: 'root', vol: 0.32, oct: -2 },
    arp: { inst: 'glass', pattern: 'random', rate: 2, oct: 1, vol: 0.18, density: 0.45, wet: 0.8, echo: true, pan: 0.3 },
    lead: { inst: 'bell', vol: 0.2, oct: 1, density: 0.25, from: 4, wet: 0.8, pan: -0.3 },
    drums: { pattern: 'void', vol: 0.36 },
    amb: { sprinkle: { inst: 'shimmer', rate: 1, vol: 0.12 } },
  },
  {
    id: 'act10', gain: 0.95, name: '深淵の玉座', desc: '第十章。聖堂の鍵盤と弔いの鐘、地鳴りの太鼓',
    bpm: 100, meter: 4, steps: 16, key: 48, scale: 'phrygian', A: [0, 1, 0, 6], B: [5, 6, 1, 0], form: 'AABA', chordBars: 2, intro: 1,
    pad: { type: 'choir', vol: 0.36, oct: 0 }, drone: { type: 'organ', vol: 0.2, iv: [0, 7] },
    bass: { inst: 'bassSaw', pattern: 'pulse8', vol: 0.38, oct: -2 },
    arp: { inst: 'bell', pattern: 'broken', rate: 1, oct: 0, vol: 0.22, density: 0.6, wet: 0.6, pan: 0.2 },
    lead: { inst: 'organ', vol: 0.22, oct: 1, density: 0.45, from: 8, wet: 0.5, pan: -0.15 },
    drums: { pattern: 'doom', vol: 0.52, fill: 'taiko', accent: 'gong' },
    amb: { sprinkle: { inst: 'ember', rate: 1, vol: 0.12 } },
  },
  {
    id: 'boss', gain: 0.8, name: 'ボス戦', desc: '地域のボス。速い刻みと角笛',
    bpm: 140, meter: 4, steps: 16, key: 52, scale: 'harmonic', A: [0, 0, 5, 4], B: [3, 3, 5, 4], form: 'AABA', chordBars: 1, intro: 0,
    pad: { type: 'strings', vol: 0.28, oct: 0 },
    bass: { inst: 'bassSaw', pattern: 'ostinato', vol: 0.42, oct: -2 },
    arp: { inst: 'pluck', pattern: 'up', rate: 4, oct: 1, vol: 0.2, density: 0.9, wet: 0.25, pan: 0.25 },
    lead: { inst: 'brass', vol: 0.28, oct: 0, density: 0.5, from: 4, wet: 0.35, pan: -0.1 },
    drums: { pattern: 'boss', vol: 0.58, fill: 'tom', accent: 'crash' },
  },
  {
    id: 'boss_act', gain: 0.8, name: '章のボス', desc: '章の終わりのボス。大太鼓と合唱',
    bpm: 128, meter: 4, steps: 16, key: 50, scale: 'phrygian', A: [0, 1, 0, 1], B: [5, 6, 1, 0], form: 'AABA', chordBars: 1, intro: 0,
    pad: { type: 'choir', vol: 0.36, oct: 0 },
    bass: { inst: 'bassSaw', pattern: 'pulse8', vol: 0.42, oct: -2 },
    arp: { inst: 'metal', pattern: 'broken', rate: 2, oct: 0, vol: 0.12, density: 0.6, wet: 0.3, pan: 0.2 },
    lead: { inst: 'brass', vol: 0.3, oct: 0, density: 0.5, from: 2, wet: 0.4, pan: -0.1 },
    drums: { pattern: 'taiko', vol: 0.62, fill: 'taiko', accent: 'gong' },
  },
  {
    id: 'boss_final', gain: 0.75, name: '深淵王', desc: '最後の戦い。聖堂の鍵盤と鐘、嵐の太鼓',
    bpm: 150, meter: 4, steps: 16, key: 48, scale: 'harmonic', A: [0, 1, 0, 4], B: [5, 2, 6, 4], form: 'AABA', chordBars: 1, intro: 0,
    pad: { type: 'organ', vol: 0.3, oct: 0, seventh: true }, drone: { type: 'saw', vol: 0.14, iv: [0, 7] },
    bass: { inst: 'bassSaw', pattern: 'ostinato', vol: 0.42, oct: -2 },
    arp: { inst: 'bell', pattern: 'down', rate: 2, oct: 1, vol: 0.18, density: 0.8, wet: 0.4, pan: 0.25 },
    lead: { inst: 'organ', vol: 0.26, oct: 1, density: 0.55, from: 4, wet: 0.4, pan: -0.15 },
    drums: { pattern: 'boss', vol: 0.6, fill: 'taiko', accent: 'gong' },
  },
  {
    id: 'rift', gain: 0.89, name: '深淵の裂け目', desc: '時間との勝負。脈打つ和音と刻む弦',
    bpm: 124, meter: 4, steps: 16, key: 47, scale: 'aeolian', A: [0, 5, 6, 4], B: [3, 5, 6, 6], form: 'AABA', chordBars: 2, intro: 0,
    pad: { type: 'glass', vol: 0.34, oct: 0, pump: true, cut: 2600 },
    bass: { inst: 'sub', pattern: 'pulse8', vol: 0.4, oct: -2 },
    arp: { inst: 'pluck', pattern: 'updown', rate: 4, oct: 1, vol: 0.22, density: 1, wet: 0.3, echo: true, pan: 0.25 },
    lead: { inst: 'glass', vol: 0.22, oct: 1, density: 0.4, from: 8, wet: 0.6, pan: -0.2 },
    drums: { pattern: 'rift', vol: 0.55, fill: 'tom', accent: 'crash' },
    amb: { sprinkle: { inst: 'revswell', rate: 0.25, vol: 0.12 } },
  },
];

export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t]));
