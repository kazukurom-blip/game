// 効果音。すべて合成（サンプルは使わない）。一覧は docs/SOUND.md 3 章。
// SFX[id](S, dest, t) で鳴らす。SFX_INFO[id] = { desc: 説明, peak: 書き出すときの最大の大きさ(dBFS), len: 書き出す長さの上限(秒) }。
// 書き出し: node classic/tools/render_sfx.mjs → classic-unity/Audio/SFX/<id>.ogg
import { engineFor, INSTRUMENTS, DRUMS, PARTS } from './synth.js';

const { bell, marimba, brass, piano, choir, pad, musicbox } = INSTRUMENTS;
const { noiseHit, toneHit, noiseBuf } = PARTS;

// 高さが動く 1 音（f0 → f1）
function sweep(S, d, t, { type = 'sine', f0, f1, dur, vol, a = 0.005, curve = 'exp' }) {
  const o = S.ctx.createOscillator(), g = S.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(f1, t + dur); else o.frequency.linearRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setTargetAtTime(0, t + a, Math.max(0.005, (dur - a) / 3));
  o.connect(g); g.connect(d); o.start(t); o.stop(t + dur * 1.6 + 0.05);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}
// 帯域が動くノイズ（風切り・風・泡の元）
function whoosh(S, d, t, { f0, f1, dur, vol, q = 1.2, a = 0.3 }) {
  const n = S.ctx.createBufferSource(); n.buffer = noiseBuf(S); n.loop = true;
  const bp = S.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = S.ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * a);
  g.gain.linearRampToValueAtTime(0, t + dur);
  n.connect(bp); bp.connect(g); g.connect(d);
  n.start(t, (f0 % 997) / 997); n.stop(t + dur + 0.02);
  n.onended = () => { n.disconnect(); bp.disconnect(); g.disconnect(); };
}
// 金属の「きん」（整数倍でない倍音）
function metal(S, d, t, f, dur, vol) {
  for (const [r, a] of [[1, 1], [2.76, 0.45], [5.4, 0.2]]) if (f * r < 18000) toneHit(S, d, t, { f: f * r, dur: dur / (r > 1 ? 1.5 : 1), vol: vol * a });
}
// ガラス・氷が割れる（高いかけらの音をばらばらに）
function glass(S, d, t, vol, n) {
  noiseHit(S, d, t, { dur: 0.3, vol: 0.2 * vol, type: 'highpass', f: 4000, off: 0.35 });
  for (let i = 0; i < n; i++) {
    const f = 2500 + ((i * 7919) % 13) * 420;
    toneHit(S, d, t + i * 0.018 + (i % 3) * 0.007, { f, dur: 0.08 + (i % 4) * 0.04, vol: 0.06 * vol });
  }
}
const MIDI = (name) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name[0]] + (name[1] === '#' ? 1 : 0) + 12 * (Number(name.at(-1)) + 1));

export const SFX = {
  // ---- UI
  ui_click(S, d, t) { marimba(S, d, t, 84, 0.05, 0.5); },
  ui_open(S, d, t) { marimba(S, d, t, 79, 0.05, 0.45); marimba(S, d, t + 0.05, 86, 0.05, 0.4); },
  ui_close(S, d, t) { marimba(S, d, t, 86, 0.05, 0.4); marimba(S, d, t + 0.05, 79, 0.05, 0.35); },
  ui_ok(S, d, t) { marimba(S, d, t, 81, 0.05, 0.55); marimba(S, d, t + 0.06, 88, 0.05, 0.5); bell(S, d, t + 0.06, 100, 0.1, 0.18); },
  ui_cancel(S, d, t) { marimba(S, d, t, 79, 0.05, 0.5); marimba(S, d, t + 0.07, 72, 0.06, 0.45); },
  ui_error(S, d, t) {
    for (const k of [0, 1]) sweep(S, d, t + k * 0.11, { type: 'square', f0: 196, f1: 185, dur: 0.08, vol: 0.06, a: 0.003 });
  },

  // ---- 動き
  jump(S, d, t) {
    sweep(S, d, t, { type: 'triangle', f0: 330, f1: 680, dur: 0.11, vol: 0.2 });
    whoosh(S, d, t, { f0: 900, f1: 2400, dur: 0.12, vol: 0.05, q: 0.8 });
  },
  ladder(S, d, t) { // はしご・縄を 1 段（上り下りの間に何度も鳴らす）
    toneHit(S, d, t, { f: 520, f1: 470, dur: 0.05, vol: 0.18, type: 'triangle' });
    noiseHit(S, d, t, { dur: 0.04, vol: 0.06, type: 'bandpass', f: 2200, q: 1.5, off: 0.3 });
  },
  land(S, d, t) { noiseHit(S, d, t, { dur: 0.1, vol: 0.25, type: 'lowpass', f: 500, off: 0.5 }); toneHit(S, d, t, { f: 110, f1: 60, dur: 0.1, vol: 0.3 }); },
  portal(S, d, t) {
    sweep(S, d, t, { type: 'sine', f0: 300, f1: 1300, dur: 0.7, vol: 0.12, a: 0.2 });
    sweep(S, d, t + 0.02, { type: 'triangle', f0: 450, f1: 1950, dur: 0.7, vol: 0.05, a: 0.2 });
    whoosh(S, d, t, { f0: 400, f1: 3500, dur: 0.8, vol: 0.12, q: 0.9, a: 0.6 });
    [84, 88, 91, 96, 100].forEach((m, i) => bell(S, d, t + 0.25 + i * 0.07, m, 0.1, 0.35));
  },

  // ---- 戦い
  atk_sword1(S, d, t) { // 片手武器を振る
    whoosh(S, d, t, { f0: 2800, f1: 700, dur: 0.17, vol: 0.32, q: 1.4, a: 0.35 });
    whoosh(S, d, t + 0.01, { f0: 5000, f1: 1800, dur: 0.12, vol: 0.08, q: 2, a: 0.3 });
  },
  atk_sword2(S, d, t) { // 両手・重い武器を振る
    whoosh(S, d, t, { f0: 1600, f1: 300, dur: 0.26, vol: 0.4, q: 1.1, a: 0.4 });
    whoosh(S, d, t + 0.02, { f0: 3200, f1: 900, dur: 0.2, vol: 0.08, q: 2, a: 0.35 });
  },
  hit(S, d, t) { DRUMS.snare(S, d, t, 0.6); DRUMS.kick(S, d, t, 0.5); noiseHit(S, d, t, { dur: 0.02, vol: 0.12, type: 'highpass', f: 4000, off: 0.1 }); },
  crit(S, d, t) {
    SFX.hit(S, d, t);
    for (const [f, a] of [[1870, 1], [2640, 0.6], [4210, 0.35]]) toneHit(S, d, t + 0.005, { f, dur: 0.35, vol: 0.07 * a, type: 'triangle' });
  },
  hurt(S, d, t) { DRUMS.kick(S, d, t, 0.6); sweep(S, d, t, { type: 'square', f0: 330, f1: 150, dur: 0.16, vol: 0.06 }); },
  mob_die_s(S, d, t) { noiseHit(S, d, t, { dur: 0.2, vol: 0.2, type: 'lowpass', f: 1200, f1: 200, off: 0.6 }); sweep(S, d, t, { f0: 420, f1: 140, dur: 0.18, vol: 0.18 }); },
  mag_cast(S, d, t) { // 魔法の詠唱（光が集まる）
    whoosh(S, d, t, { f0: 600, f1: 4000, dur: 0.6, vol: 0.08, q: 2, a: 0.8 });
    choir(S, d, t, 72, 0.45, 0.9); choir(S, d, t, 79, 0.45, 0.7);
    sweep(S, d, t, { f0: 500, f1: 1500, dur: 0.6, vol: 0.06, a: 0.3 });
    [91, 95, 98, 103].forEach((m, i) => bell(S, d, t + 0.12 + i * 0.09, m, 0.1, 0.22));
  },
  boss_appear(S, d, t) { // ボスが出てくる
    DRUMS.taiko(S, d, t, 1); DRUMS.timp(S, d, t, 0.9);
    for (const m of [37, 44, 49, 50]) brass(S, d, t + 0.02, m + 12, 1.3, 0.6);
    for (const m of [49, 56, 62]) choir(S, d, t + 0.05, m + 12, 1.4, 0.7);
    for (let i = 0; i < 8; i++) DRUMS.timp(S, d, t + 1.2 + i * 0.07, 0.25 + i * 0.06);
    DRUMS.taiko(S, d, t + 1.8, 1); DRUMS.crash(S, d, t + 1.8, 0.8);
    sweep(S, d, t + 1.8, { type: 'sawtooth', f0: 110, f1: 55, dur: 0.9, vol: 0.05 });
  },

  // ---- 拾う・お金・成長
  pickup(S, d, t) { bell(S, d, t, 88, 0.1, 0.7); bell(S, d, t + 0.06, 95, 0.1, 0.6); },
  coin(S, d, t) { bell(S, d, t, 93, 0.05, 0.6); bell(S, d, t + 0.07, 100, 0.2, 0.7); },
  potion(S, d, t) { for (let i = 0; i < 4; i++) sweep(S, d, t + i * 0.06, { f0: 500 + i * 120, f1: 1100 + i * 200, dur: 0.05, vol: 0.12 }); },
  levelup(S, d, t) {
    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => bell(S, d, t + i * 0.055, MIDI(n) + 12, 0.1, 0.55));
    for (const n of ['C4', 'E4', 'G4', 'C5']) brass(S, d, t + 0.33, MIDI(n), 0.65, 0.55);
    whoosh(S, d, t + 0.3, { f0: 3000, f1: 9000, dur: 0.9, vol: 0.05, q: 0.7, a: 0.2 });
    [96, 100, 103].forEach((m, i) => bell(S, d, t + 0.55 + i * 0.12, m, 0.1, 0.3));
  },
  quest_accept(S, d, t) { bell(S, d, t, MIDI('G5') + 12, 0.1, 0.45); bell(S, d, t + 0.1, MIDI('D6') + 12, 0.2, 0.5); },
  quest_done(S, d, t) {
    ['G5', 'C6', 'E6'].forEach((n, i) => bell(S, d, t + i * 0.09, MIDI(n) + 12, 0.1, 0.5));
    for (const n of ['C4', 'G4', 'E5', 'G5']) piano(S, d, t + 0.27, MIDI(n), 1.0, 0.55);
    bell(S, d, t + 0.27, MIDI('C7'), 0.4, 0.55);
    musicbox(S, d, t + 0.45, MIDI('G6'), 0.3, 0.35);
    pad(S, d, t + 0.27, MIDI('C5'), 0.6, 0.6);
  },
  // ======== 2 回目に足した効果音 ========
  // ---- UI・町の仕組み
  ui_equip(S, d, t) { // 装備する・外す（布と金具）
    noiseHit(S, d, t, { dur: 0.07, vol: 0.18, type: 'bandpass', f: 2400, q: 0.9, a: 0.01, off: 0.2 });
    metal(S, d, t + 0.05, 2600, 0.12, 0.07);
  },
  shop_buy(S, d, t) { // 店で買う（お金を払ってレジの「チャリン」）
    bell(S, d, t, 93, 0.05, 0.5); bell(S, d, t + 0.06, 98, 0.05, 0.5);
    noiseHit(S, d, t + 0.12, { dur: 0.06, vol: 0.12, type: 'highpass', f: 6000, off: 0.4 });
    bell(S, d, t + 0.13, 105, 0.3, 0.6);
  },
  shop_sell(S, d, t) { // 店で売る（お金が手元に来る）
    [100, 96, 93].forEach((m, i) => bell(S, d, t + i * 0.055, m, 0.05, 0.5 - i * 0.08));
    marimba(S, d, t + 0.2, 72, 0.1, 0.45);
  },
  storage(S, d, t) { // 倉庫に預ける・出す（木の箱とふたの金具）
    toneHit(S, d, t, { f: 180, f1: 120, dur: 0.14, vol: 0.4, type: 'triangle' });
    noiseHit(S, d, t, { dur: 0.08, vol: 0.18, type: 'lowpass', f: 900, off: 0.6 });
    toneHit(S, d, t + 0.16, { f: 2300, dur: 0.02, vol: 0.12, type: 'square' });
    metal(S, d, t + 0.17, 3100, 0.1, 0.04);
  },
  craft(S, d, t) { // 製作・精錬（かなづちで 3 回、できたらきらり）
    [0, 0.16, 0.32].forEach((k, i) => DRUMS.anvil(S, d, t + k, 0.6 + i * 0.15));
    [91, 95, 98, 103].forEach((m, i) => bell(S, d, t + 0.5 + i * 0.06, m, 0.1, 0.35));
  },
  chest_open(S, d, t) { // 宝箱を開ける（きしむふた → きらきら）
    sweep(S, d, t, { type: 'sawtooth', f0: 160, f1: 240, dur: 0.3, vol: 0.025, a: 0.05, curve: 'lin' });
    noiseHit(S, d, t, { dur: 0.3, vol: 0.06, type: 'bandpass', f: 900, q: 3, a: 0.05, off: 0.9 });
    whoosh(S, d, t + 0.2, { f0: 1500, f1: 6000, dur: 0.5, vol: 0.06, q: 0.8, a: 0.3 });
    [86, 91, 95, 98, 103].forEach((m, i) => bell(S, d, t + 0.28 + i * 0.07, m, 0.1, 0.4));
  },
  scroll_ok(S, d, t) { // 書（強化）の成功
    whoosh(S, d, t, { f0: 800, f1: 5000, dur: 0.5, vol: 0.06, q: 1, a: 0.7 });
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => bell(S, d, t + 0.25 + i * 0.06, MIDI(n) + 12, 0.1, 0.5));
    for (const n of ['C4', 'E4', 'G4', 'C5']) choir(S, d, t + 0.25, MIDI(n), 0.6, 0.55);
  },
  scroll_fail(S, d, t) { // 書の失敗（何も起きない）
    marimba(S, d, t, 76, 0.1, 0.55); marimba(S, d, t + 0.12, 71, 0.1, 0.5); marimba(S, d, t + 0.24, 68, 0.2, 0.5);
    toneHit(S, d, t + 0.24, { f: 110, f1: 80, dur: 0.15, vol: 0.2 });
  },
  scroll_break(S, d, t) { // 書の失敗で装備が壊れる（割れる音）
    glass(S, d, t, 1, 14);
    toneHit(S, d, t, { f: 140, f1: 60, dur: 0.3, vol: 0.4 });
    sweep(S, d, t + 0.1, { type: 'triangle', f0: 440, f1: 110, dur: 0.6, vol: 0.12 });
  },
  jobup(S, d, t) { // 転職（ジングルと一緒）: 合唱の和音が上がって光
    whoosh(S, d, t, { f0: 300, f1: 6000, dur: 1.0, vol: 0.08, q: 0.8, a: 0.8 });
    for (const n of ['Eb4', 'G4', 'Bb4']) choir(S, d, t + 0.1, MIDI(n), 1.1, 0.6);
    for (const n of ['Eb5', 'G5', 'Bb5', 'Eb6']) choir(S, d, t + 0.55, MIDI(n), 0.9, 0.45);
    [87, 91, 94, 99, 103, 106].forEach((m, i) => bell(S, d, t + 0.5 + i * 0.07, m, 0.1, 0.35));
  },
  death(S, d, t) { // 自分が倒れた（低い下降）
    sweep(S, d, t, { type: 'triangle', f0: 440, f1: 110, dur: 0.9, vol: 0.22, a: 0.02 });
    for (const m of [45, 48, 52]) pad(S, d, t + 0.05, m, 0.8, 0.8);
    toneHit(S, d, t, { f: 100, f1: 50, dur: 0.4, vol: 0.35 });
  },
  revive(S, d, t) { // 生き返る（上がる光）
    whoosh(S, d, t, { f0: 400, f1: 4000, dur: 0.7, vol: 0.07, q: 0.9, a: 0.7 });
    [79, 84, 88, 91, 96].forEach((m, i) => bell(S, d, t + 0.1 + i * 0.08, m, 0.1, 0.4));
    for (const n of ['G4', 'B4', 'D5']) choir(S, d, t + 0.4, MIDI(n), 0.7, 0.5);
  },
  quest_fail(S, d, t) { piano(S, d, t, 67, 0.25, 0.5); piano(S, d, t + 0.2, 63, 0.6, 0.5); piano(S, d, t + 0.2, 55, 0.6, 0.4); },
  sit(S, d, t) { // 椅子に座る
    toneHit(S, d, t, { f: 160, f1: 110, dur: 0.1, vol: 0.3, type: 'triangle' });
    noiseHit(S, d, t, { dur: 0.06, vol: 0.1, type: 'lowpass', f: 1200, off: 0.3 });
  },
  quiz_ok(S, d, t) { bell(S, d, t, 88, 0.1, 0.5); bell(S, d, t + 0.1, 92, 0.1, 0.5); bell(S, d, t + 0.2, 95, 0.3, 0.6); },
  quiz_ng(S, d, t) { for (const k of [0, 1]) sweep(S, d, t + k * 0.18, { type: 'square', f0: 165, f1: 150, dur: 0.15, vol: 0.07, a: 0.004 }); },
  room_enter(S, d, t) { // ボスの間・ダンジョン・試験の部屋に入る（遠くの銅鑼）
    toneHit(S, d, t, { f: 98, f1: 94, dur: 1.6, vol: 0.4 });
    for (const [f, a] of [[196, 0.35], [302, 0.25], [427, 0.15], [611, 0.08]]) toneHit(S, d, t + 0.01, { f, dur: 1.2, vol: 0.15 * a });
    noiseHit(S, d, t, { dur: 0.08, vol: 0.12, type: 'lowpass', f: 1500, off: 0.5 });
    whoosh(S, d, t, { f0: 300, f1: 1200, dur: 1.0, vol: 0.05, q: 0.8, a: 0.5 });
  },
  room_timeup(S, d, t) { // 制限時間が切れた（目覚ましのベル）
    for (let i = 0; i < 8; i++) bell(S, d, t + i * 0.075, i % 2 ? 93 : 96, 0.05, 0.45);
    sweep(S, d, t + 0.6, { type: 'triangle', f0: 600, f1: 300, dur: 0.4, vol: 0.12 });
  },
  mech_glass(S, d, t) { // 時の裂け目・かけら（澄んだ鈴とかけら）
    [96, 101, 103, 108].forEach((m, i) => bell(S, d, t + i * 0.04, m, 0.1, 0.35));
    glass(S, d, t + 0.05, 0.4, 6);
  },
  mech_rock(S, d, t) { // 岩が砕ける
    noiseHit(S, d, t, { dur: 0.4, vol: 0.5, type: 'lowpass', f: 700, f1: 200, off: 0.8 });
    toneHit(S, d, t, { f: 120, f1: 50, dur: 0.3, vol: 0.5 });
    for (let i = 0; i < 6; i++) noiseHit(S, d, t + 0.08 + i * 0.05 + (i % 3) * 0.013, { dur: 0.04, vol: 0.12 - i * 0.012, type: 'bandpass', f: 900 + i * 230, q: 2, off: 0.1 * i });
  },
  mech_door(S, d, t) { // 石の扉・秘術の扉が開く（ごろごろ → どん）
    whoosh(S, d, t, { f0: 180, f1: 360, dur: 0.9, vol: 0.25, q: 1.5, a: 0.4 });
    noiseHit(S, d, t, { dur: 0.9, vol: 0.12, type: 'lowpass', f: 400, a: 0.3, off: 0.4 });
    toneHit(S, d, t + 0.9, { f: 110, f1: 55, dur: 0.3, vol: 0.45 });
  },
  mech_splash(S, d, t) { // 水にもぐる・出る（ざぶん）
    whoosh(S, d, t, { f0: 2500, f1: 500, dur: 0.45, vol: 0.35, q: 0.7, a: 0.15 });
    for (let i = 0; i < 4; i++) DRUMS.bubble(S, d, t + 0.25 + i * 0.07, 0.8 - i * 0.15);
  },
  ship_horn(S, d, t) { // 船の汽笛（低い和音が少し上がって伸びる）
    for (const m of [43, 47, 50]) brass(S, d, t, m, 1.4, 0.75);
    sweep(S, d, t, { type: 'sawtooth', f0: 92, f1: 98, dur: 0.2, vol: 0.03, curve: 'lin' });
  },
  buff_end(S, d, t) { [96, 91, 88].forEach((m, i) => bell(S, d, t + i * 0.07, m, 0.05, 0.3 - i * 0.05)); },

  // ---- 動き・拾う
  rope(S, d, t) { // 縄を 1 段（擦れる音。上り下りで一定間隔に鳴らす）
    noiseHit(S, d, t, { dur: 0.08, vol: 0.14, type: 'bandpass', f: 1300, q: 2, a: 0.015, off: 0.25 });
    noiseHit(S, d, t + 0.04, { dur: 0.06, vol: 0.08, type: 'bandpass', f: 2100, q: 2, a: 0.01, off: 0.55 });
  },
  grab(S, d, t) { // はしご・縄につかまる
    noiseHit(S, d, t, { dur: 0.05, vol: 0.14, type: 'bandpass', f: 1800, q: 1.5, off: 0.3 });
    toneHit(S, d, t, { f: 320, f1: 250, dur: 0.06, vol: 0.15, type: 'triangle' });
  },
  jump_down(S, d, t) { whoosh(S, d, t, { f0: 2200, f1: 600, dur: 0.16, vol: 0.12, q: 0.9, a: 0.3 }); },
  drop(S, d, t) { // アイテムが落ちる（ころん、ころ）
    toneHit(S, d, t, { f: 1250, dur: 0.07, vol: 0.18, type: 'triangle' });
    toneHit(S, d, t + 0.1, { f: 1330, dur: 0.05, vol: 0.09, type: 'triangle' });
    toneHit(S, d, t + 0.16, { f: 1400, dur: 0.04, vol: 0.04, type: 'triangle' });
  },
  drop_meso(S, d, t) { // お金が落ちる（ちゃりちゃり）
    [0, 0.05, 0.09, 0.12].forEach((k, i) => metal(S, d, t + k, [3300, 4100, 3700, 4500][i], 0.08, 0.1 - i * 0.02));
  },

  // ---- 武器の通常攻撃
  atk_dagger(S, d, t) { whoosh(S, d, t, { f0: 4200, f1: 1500, dur: 0.11, vol: 0.32, q: 1.6, a: 0.3 }); },
  atk_axe(S, d, t) {
    whoosh(S, d, t, { f0: 1300, f1: 250, dur: 0.3, vol: 0.45, q: 1.0, a: 0.45 });
    whoosh(S, d, t + 0.03, { f0: 2600, f1: 700, dur: 0.22, vol: 0.06, q: 2, a: 0.4 });
  },
  atk_blunt(S, d, t) {
    whoosh(S, d, t, { f0: 900, f1: 180, dur: 0.32, vol: 0.5, q: 0.9, a: 0.5 });
    toneHit(S, d, t + 0.05, { f: 110, f1: 70, dur: 0.25, vol: 0.12 });
  },
  atk_spear(S, d, t) { // 槍・矛の突き
    whoosh(S, d, t, { f0: 700, f1: 3200, dur: 0.14, vol: 0.38, q: 1.3, a: 0.7 });
    metal(S, d, t + 0.1, 3200, 0.15, 0.05);
  },
  atk_claw(S, d, t) { // 手裏剣を投げる（回る金属）
    for (let i = 0; i < 4; i++) whoosh(S, d, t + i * 0.04, { f0: 3400, f1: 2600, dur: 0.05, vol: 0.18 - i * 0.03, q: 2, a: 0.4 });
    metal(S, d, t, 2700, 0.1, 0.05);
  },
  atk_bow(S, d, t) { // 弓（弦 → 矢の風切り）
    INSTRUMENTS.guitar(S, d, t, 47, 0.25, 0.9);
    toneHit(S, d, t, { f: 240, f1: 200, dur: 0.12, vol: 0.12, type: 'triangle' });
    whoosh(S, d, t + 0.03, { f0: 2800, f1: 5200, dur: 0.2, vol: 0.18, q: 1.8, a: 0.3 });
  },
  atk_xbow(S, d, t) { // 弩（カチッ → どん → 風切り）
    toneHit(S, d, t, { f: 1900, dur: 0.015, vol: 0.12, type: 'square' });
    toneHit(S, d, t + 0.015, { f: 170, f1: 90, dur: 0.08, vol: 0.35 });
    whoosh(S, d, t + 0.03, { f0: 4000, f1: 2000, dur: 0.18, vol: 0.2, q: 1.8, a: 0.2 });
  },
  atk_wand(S, d, t) { bell(S, d, t, 91, 0.1, 0.4); sweep(S, d, t, { f0: 800, f1: 1700, dur: 0.15, vol: 0.08 }); whoosh(S, d, t, { f0: 1500, f1: 3000, dur: 0.2, vol: 0.06, q: 1.2, a: 0.4 }); },
  atk_knuckle(S, d, t) { // ナックル（殴る）
    whoosh(S, d, t, { f0: 2500, f1: 800, dur: 0.09, vol: 0.28, q: 1.3, a: 0.3 });
    toneHit(S, d, t + 0.06, { f: 150, f1: 60, dur: 0.1, vol: 0.5 });
    noiseHit(S, d, t + 0.06, { dur: 0.04, vol: 0.15, type: 'lowpass', f: 2000, off: 0.2 });
  },
  atk_gun(S, d, t) { // 銃（軽い発砲）
    noiseHit(S, d, t, { dur: 0.05, vol: 0.6, type: 'lowpass', f: 3500, off: 0.7 });
    toneHit(S, d, t, { f: 320, f1: 80, dur: 0.08, vol: 0.45 });
    noiseHit(S, d, t + 0.02, { dur: 0.25, vol: 0.06, type: 'highpass', f: 3000, off: 1.1 });
  },

  // ---- スキル（動きの種類）
  skill_swing(S, d, t) { // 斬る技
    SFX.atk_sword2(S, d, t);
    whoosh(S, d, t + 0.02, { f0: 1500, f1: 5000, dur: 0.3, vol: 0.1, q: 1.2, a: 0.4 });
    metal(S, d, t + 0.15, 2900, 0.35, 0.07);
  },
  skill_stab(S, d, t) { // 突く技
    whoosh(S, d, t, { f0: 600, f1: 4000, dur: 0.18, vol: 0.45, q: 1.2, a: 0.75 });
    metal(S, d, t + 0.14, 3400, 0.3, 0.08); metal(S, d, t + 0.14, 5100, 0.2, 0.04);
    toneHit(S, d, t + 0.14, { f: 200, f1: 90, dur: 0.12, vol: 0.3 });
  },
  skill_shoot(S, d, t) { // 撃つ技（矢・弾をまとめて）
    INSTRUMENTS.guitar(S, d, t, 47, 0.25, 0.9);
    for (let i = 0; i < 3; i++) whoosh(S, d, t + 0.03 + i * 0.06, { f0: 3000 + i * 300, f1: 5500, dur: 0.2, vol: 0.18, q: 1.8, a: 0.3 });
    sweep(S, d, t, { type: 'triangle', f0: 600, f1: 1500, dur: 0.2, vol: 0.08 });
  },
  skill_throw(S, d, t) { for (let i = 0; i < 3; i++) SFX.atk_claw(S, d, t + i * 0.07); sweep(S, d, t, { f0: 900, f1: 2000, dur: 0.25, vol: 0.06 }); },
  skill_punch(S, d, t) { // 殴る技（気の拳）
    whoosh(S, d, t, { f0: 600, f1: 2500, dur: 0.12, vol: 0.25, q: 1, a: 0.8 });
    DRUMS.taiko(S, d, t + 0.1, 0.8);
    noiseHit(S, d, t + 0.1, { dur: 0.12, vol: 0.25, type: 'lowpass', f: 2500, off: 0.3 });
    sweep(S, d, t + 0.1, { type: 'sawtooth', f0: 180, f1: 60, dur: 0.25, vol: 0.05 });
  },

  // ---- 魔法（属性ごと）
  mag_fire(S, d, t) { // 火: ごうっと燃え上がる、ぱちぱち
    noiseHit(S, d, t, { dur: 0.7, vol: 0.4, type: 'lowpass', f: 300, f1: 2400, a: 0.12, off: 0.3 });
    whoosh(S, d, t, { f0: 400, f1: 1800, dur: 0.6, vol: 0.25, q: 0.7, a: 0.4 });
    for (let i = 0; i < 7; i++) noiseHit(S, d, t + 0.1 + i * 0.07 + (i % 2) * 0.02, { dur: 0.015, vol: 0.12, type: 'highpass', f: 3500, off: 0.13 * i });
    sweep(S, d, t, { type: 'sawtooth', f0: 70, f1: 140, dur: 0.6, vol: 0.04 });
  },
  mag_ice(S, d, t) { // 氷: 高い鈴と凍りつくきらめき、ぴしっ
    sweep(S, d, t, { f0: 2000, f1: 6000, dur: 0.35, vol: 0.06 });
    [96, 100, 103, 107, 103].forEach((m, i) => bell(S, d, t + i * 0.05, m, 0.1, 0.4));
    noiseHit(S, d, t + 0.3, { dur: 0.06, vol: 0.3, type: 'highpass', f: 5000, off: 0.9 });
    glass(S, d, t + 0.3, 0.3, 5);
  },
  mag_thunder(S, d, t) { // 雷: ばりっ → ごろごろ
    noiseHit(S, d, t, { dur: 0.05, vol: 0.7, type: 'highpass', f: 1500, off: 0.4 });
    for (let i = 0; i < 5; i++) sweep(S, d, t + i * 0.035, { type: 'sawtooth', f0: 1800 - i * 250, f1: 300, dur: 0.05, vol: 0.06 });
    noiseHit(S, d, t + 0.04, { dur: 1.0, vol: 0.45, type: 'lowpass', f: 400, f1: 120, a: 0.03, off: 1.2 });
    toneHit(S, d, t + 0.04, { f: 70, f1: 40, dur: 0.6, vol: 0.4 });
  },
  mag_poison(S, d, t) { // 毒: ぶくぶくの泡
    for (let i = 0; i < 7; i++) DRUMS.bubble(S, d, t + i * 0.06 + (i % 3) * 0.015, 1 - i * 0.08);
    sweep(S, d, t, { type: 'triangle', f0: 180, f1: 120, dur: 0.5, vol: 0.12 });
    whoosh(S, d, t, { f0: 600, f1: 300, dur: 0.5, vol: 0.08, q: 1.5, a: 0.3 });
  },
  mag_holy(S, d, t) { // 聖: 合唱の和音と光
    for (const n of ['D5', 'F#5', 'A5', 'D6']) choir(S, d, t, MIDI(n), 0.7, 0.55);
    [93, 98, 102, 105, 110].forEach((m, i) => bell(S, d, t + 0.05 + i * 0.06, m, 0.1, 0.35));
    whoosh(S, d, t, { f0: 3000, f1: 9000, dur: 0.8, vol: 0.05, q: 0.7, a: 0.3 });
  },
  mag_dark(S, d, t) { // 闇: 低いうなり
    sweep(S, d, t, { type: 'sawtooth', f0: 90, f1: 60, dur: 0.8, vol: 0.08, a: 0.1 });
    for (const m of [45, 46, 52]) choir(S, d, t, m, 0.7, 0.6);
    whoosh(S, d, t, { f0: 1500, f1: 200, dur: 0.7, vol: 0.15, q: 1, a: 0.5 });
  },
  heal(S, d, t) { // 回復
    ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => INSTRUMENTS.harp(S, d, t + i * 0.06, MIDI(n), 0.5, 0.9));
    for (const n of ['C5', 'E5', 'G5']) pad(S, d, t + 0.1, MIDI(n), 0.6, 0.6);
    [96, 100].forEach((m, i) => bell(S, d, t + 0.32 + i * 0.08, m, 0.1, 0.3));
  },
  buff(S, d, t) { // 強化がかかる
    sweep(S, d, t, { type: 'triangle', f0: 300, f1: 900, dur: 0.3, vol: 0.14 });
    for (const n of ['G4', 'B4', 'D5']) brass(S, d, t + 0.18, MIDI(n), 0.4, 0.45);
    [91, 95, 98].forEach((m, i) => bell(S, d, t + 0.2 + i * 0.06, m, 0.1, 0.35));
  },
  summon(S, d, t) { // 召喚（集まって ぽん と出る）
    whoosh(S, d, t, { f0: 4000, f1: 600, dur: 0.4, vol: 0.15, q: 1, a: 0.6 });
    sweep(S, d, t + 0.38, { f0: 200, f1: 700, dur: 0.1, vol: 0.25 });
    [88, 93, 96].forEach((m, i) => bell(S, d, t + 0.42 + i * 0.05, m, 0.1, 0.35));
  },
  dash(S, d, t) { whoosh(S, d, t, { f0: 600, f1: 3200, dur: 0.22, vol: 0.4, q: 0.9, a: 0.3 }); sweep(S, d, t, { f0: 400, f1: 900, dur: 0.15, vol: 0.06 }); },

  // ---- 敵
  mob_attack(S, d, t) { // 敵の攻撃（振り）
    whoosh(S, d, t, { f0: 1500, f1: 400, dur: 0.2, vol: 0.32, q: 1.1, a: 0.4 });
    sweep(S, d, t, { type: 'square', f0: 150, f1: 105, dur: 0.15, vol: 0.05 });
  },
  mob_cast(S, d, t) { // 敵の技の構え・予兆（不穏に上がる＋警告）
    sweep(S, d, t, { type: 'sawtooth', f0: 110, f1: 220, dur: 0.8, vol: 0.06, a: 0.3 });
    for (const m of [57, 58, 63]) choir(S, d, t, m, 0.7, 0.5);
    bell(S, d, t + 0.05, 89, 0.1, 0.35); bell(S, d, t + 0.35, 89, 0.1, 0.35);
    whoosh(S, d, t, { f0: 400, f1: 2000, dur: 0.8, vol: 0.06, q: 1.4, a: 0.9 });
  },
  mob_skill_hit(S, d, t) { // 敵の技が当たる（自分の hurt より重い）
    DRUMS.kick(S, d, t, 0.9); DRUMS.snare(S, d, t, 0.5);
    sweep(S, d, t, { type: 'square', f0: 400, f1: 120, dur: 0.25, vol: 0.07 });
    noiseHit(S, d, t, { dur: 0.25, vol: 0.2, type: 'lowpass', f: 1800, f1: 400, off: 0.4 });
  },
  mob_summon(S, d, t) { // 敵が手下を呼ぶ
    whoosh(S, d, t, { f0: 300, f1: 900, dur: 0.4, vol: 0.18, q: 1.2, a: 0.6 });
    for (let i = 0; i < 3; i++) sweep(S, d, t + 0.3 + i * 0.09, { f0: 180, f1: 520, dur: 0.07, vol: 0.2 });
  },
  mob_buff(S, d, t) { // 敵の強化（うなって力がみなぎる）
    sweep(S, d, t, { type: 'sawtooth', f0: 85, f1: 140, dur: 0.6, vol: 0.07, a: 0.2 });
    whoosh(S, d, t, { f0: 300, f1: 2000, dur: 0.6, vol: 0.12, q: 1, a: 0.8 });
    for (const m of [40, 47]) brass(S, d, t + 0.3, m, 0.4, 0.6);
  },
  dispel(S, d, t) { glass(S, d, t, 0.6, 8); sweep(S, d, t, { type: 'triangle', f0: 1400, f1: 300, dur: 0.35, vol: 0.12 }); },
  mob_spawn(S, d, t) { sweep(S, d, t, { f0: 200, f1: 600, dur: 0.09, vol: 0.18 }); noiseHit(S, d, t, { dur: 0.05, vol: 0.05, type: 'bandpass', f: 1500, off: 0.2 }); },
  mob_die_m(S, d, t) { // 中くらいの敵が倒れる
    noiseHit(S, d, t, { dur: 0.35, vol: 0.3, type: 'lowpass', f: 1000, f1: 150, off: 0.7 });
    sweep(S, d, t, { f0: 330, f1: 80, dur: 0.32, vol: 0.22 });
    toneHit(S, d, t + 0.2, { f: 120, f1: 60, dur: 0.15, vol: 0.3 });
  },
  mob_die_l(S, d, t) { // 大きな敵が倒れる（どすん、くずれる）
    DRUMS.taiko(S, d, t, 1);
    noiseHit(S, d, t, { dur: 0.9, vol: 0.35, type: 'lowpass', f: 800, f1: 120, a: 0.02, off: 1.4 });
    sweep(S, d, t, { type: 'sawtooth', f0: 120, f1: 40, dur: 0.9, vol: 0.05 });
    DRUMS.taiko(S, d, t + 0.45, 0.7);
  },
  boss_phase(S, d, t) { // ボスの段階が変わる（力をため直す）
    for (let i = 0; i < 10; i++) DRUMS.timp(S, d, t + i * 0.06, 0.2 + i * 0.06);
    whoosh(S, d, t, { f0: 200, f1: 1600, dur: 0.7, vol: 0.12, q: 1, a: 0.9 });
    DRUMS.taiko(S, d, t + 0.65, 1); DRUMS.crash(S, d, t + 0.65, 0.7);
    for (const m of [38, 44, 49]) brass(S, d, t + 0.66, m + 12, 0.9, 0.6);
    for (const m of [61, 62, 68]) choir(S, d, t + 0.66, m, 1.0, 0.55);
  },

  // ---- 状態異常
  st_poison(S, d, t) { for (let i = 0; i < 3; i++) DRUMS.bubble(S, d, t + i * 0.08, 0.9); sweep(S, d, t + 0.1, { type: 'triangle', f0: 520, f1: 260, dur: 0.4, vol: 0.12 }); },
  st_stun(S, d, t) { // 気絶（星がくるくる）
    toneHit(S, d, t, { f: 140, f1: 70, dur: 0.12, vol: 0.4 });
    [100, 96, 100, 96, 100].forEach((m, i) => bell(S, d, t + 0.08 + i * 0.08, m, 0.05, 0.3));
  },
  st_freeze(S, d, t) { noiseHit(S, d, t, { dur: 0.12, vol: 0.3, type: 'highpass', f: 4500, off: 0.5 }); glass(S, d, t, 0.35, 5); sweep(S, d, t, { f0: 3000, f1: 1400, dur: 0.4, vol: 0.06 }); },
  st_sleep(S, d, t) { [76, 72, 69].forEach((m, i) => marimba(S, d, t + i * 0.18, m, 0.2, 0.45)); pad(S, d, t, 57, 0.6, 0.5); },
  st_curse(S, d, t) { // 暗闇・封印・呪い・弱体・鈍足・混乱・変身（悪い状態）
    for (const m of [50, 51]) choir(S, d, t, m, 0.6, 0.6);
    sweep(S, d, t, { type: 'sawtooth', f0: 300, f1: 120, dur: 0.5, vol: 0.06 });
    whoosh(S, d, t, { f0: 2000, f1: 400, dur: 0.5, vol: 0.08, q: 1.2, a: 0.3 });
  },
  status_end(S, d, t) { bell(S, d, t, 84, 0.05, 0.3); bell(S, d, t + 0.08, 91, 0.1, 0.3); },
  status_cure(S, d, t) { whoosh(S, d, t, { f0: 1500, f1: 6000, dur: 0.35, vol: 0.06, q: 0.8, a: 0.6 }); [88, 91, 96].forEach((m, i) => bell(S, d, t + 0.1 + i * 0.06, m, 0.1, 0.4)); },
  status_resist(S, d, t) { metal(S, d, t, 1800, 0.35, 0.12); metal(S, d, t, 2710, 0.25, 0.06); noiseHit(S, d, t, { dur: 0.03, vol: 0.1, type: 'highpass', f: 3000 }); },

  // ---- ペット
  pet_adopt(S, d, t) { ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => musicbox(S, d, t + i * 0.09, MIDI(n), 0.2, 0.6)); SFX.pet_happy(S, d, t + 0.4); },
  pet_feed(S, d, t) { for (let i = 0; i < 3; i++) noiseHit(S, d, t + i * 0.12, { dur: 0.06, vol: 0.2, type: 'bandpass', f: 900 + i * 100, q: 1.2, off: 0.3 + i * 0.2 }); },
  pet_happy(S, d, t) { sweep(S, d, t, { f0: 1100, f1: 1900, dur: 0.08, vol: 0.12 }); sweep(S, d, t + 0.1, { f0: 1200, f1: 2100, dur: 0.08, vol: 0.12 }); bell(S, d, t + 0.18, 96, 0.1, 0.3); },
  pet_sulk(S, d, t) { sweep(S, d, t, { type: 'triangle', f0: 620, f1: 420, dur: 0.22, vol: 0.14 }); sweep(S, d, t + 0.26, { type: 'triangle', f0: 520, f1: 360, dur: 0.3, vol: 0.12 }); },
};

export const SFX_INFO = {
  ui_click: { desc: 'ボタン・一覧を選ぶ', peak: -12, len: 0.4 },
  ui_open: { desc: 'ウィンドウを開く', peak: -12, len: 0.4 },
  ui_close: { desc: 'ウィンドウを閉じる', peak: -12, len: 0.4 },
  ui_ok: { desc: '決定', peak: -10, len: 0.6 },
  ui_cancel: { desc: '取り消し', peak: -11, len: 0.45 },
  ui_error: { desc: 'できない操作', peak: -12 },
  jump: { desc: 'ジャンプ', peak: -8 },
  ladder: { desc: 'はしご・縄の 1 段（上り下りで一定間隔に鳴らす）', peak: -12 },
  land: { desc: '高い所から着地', peak: -9 },
  portal: { desc: 'ポータルを通る', peak: -6, len: 1.6 },
  atk_sword1: { desc: '片手武器の振り', peak: -6 },
  atk_sword2: { desc: '両手・重い武器の振り', peak: -5 },
  hit: { desc: '敵に当たる', peak: -4 },
  crit: { desc: 'クリティカル', peak: -3 },
  hurt: { desc: '自分が殴られる', peak: -5 },
  mob_die_s: { desc: '小さな敵が倒れる', peak: -7 },
  mag_cast: { desc: '魔法の詠唱', peak: -6, len: 1.5 },
  boss_appear: { desc: 'ボスの登場', peak: -2, len: 3.6 },
  pickup: { desc: 'アイテムを拾う', peak: -8, len: 0.7 },
  coin: { desc: 'お金を拾う', peak: -8, len: 0.8 },
  potion: { desc: '薬を飲む', peak: -9 },
  levelup: { desc: 'Lv アップ', peak: -3, len: 2.6 },
  quest_accept: { desc: 'クエストを受ける', peak: -7, len: 1.0 },
  quest_done: { desc: 'クエスト完了', peak: -4, len: 2.4 },
  // 2 回目に足した物
  ui_equip: { desc: '装備する・外す', peak: -11, len: 0.5 },
  shop_buy: { desc: '店で買う', peak: -8, len: 1.0 },
  shop_sell: { desc: '店で売る', peak: -8, len: 0.9 },
  storage: { desc: '倉庫に預ける・出す', peak: -9, len: 0.7 },
  craft: { desc: '製作・精錬', peak: -7, len: 1.4 },
  chest_open: { desc: '宝箱を開ける', peak: -7, len: 1.4 },
  scroll_ok: { desc: '書（強化）の成功', peak: -5, len: 1.6 },
  scroll_fail: { desc: '書の失敗', peak: -7, len: 1.0 },
  scroll_break: { desc: '書の失敗で装備が壊れる', peak: -4, len: 1.4 },
  jobup: { desc: '転職（ジングルと一緒）', peak: -4, len: 2.4 },
  death: { desc: '自分が倒れた', peak: -5, len: 2.0 },
  revive: { desc: '生き返る', peak: -6, len: 1.8 },
  quest_fail: { desc: 'クエスト失敗', peak: -8, len: 1.4 },
  sit: { desc: '椅子に座る', peak: -11, len: 0.4 },
  quiz_ok: { desc: 'クイズ正解', peak: -8, len: 1.0 },
  quiz_ng: { desc: 'クイズ不正解', peak: -10, len: 0.6 },
  room_enter: { desc: 'ボスの間・ダンジョン・試験の部屋に入る', peak: -5, len: 2.5 },
  room_timeup: { desc: '制限時間が切れた', peak: -6, len: 1.4 },
  mech_glass: { desc: '仕掛け: 時の裂け目・かけら', peak: -7, len: 1.0 },
  mech_rock: { desc: '仕掛け: 岩が砕ける', peak: -4, len: 1.0 },
  mech_door: { desc: '仕掛け: 扉が開く', peak: -5, len: 1.6 },
  mech_splash: { desc: '仕掛け: 水にもぐる・出る', peak: -6, len: 1.0 },
  ship_horn: { desc: '船の汽笛', peak: -4, len: 2.4 },
  buff_end: { desc: '強化が切れる', peak: -11, len: 0.6 },
  rope: { desc: '縄の 1 段（上り下りで一定間隔に鳴らす）', peak: -13 },
  grab: { desc: 'はしご・縄につかまる', peak: -11 },
  jump_down: { desc: '下へ飛び降りる', peak: -12 },
  drop: { desc: 'アイテムが落ちる', peak: -11, len: 0.5 },
  drop_meso: { desc: 'お金が落ちる', peak: -12, len: 0.5 },
  atk_dagger: { desc: '短剣の振り', peak: -7 },
  atk_axe: { desc: '斧の振り', peak: -5 },
  atk_blunt: { desc: '鈍器の振り', peak: -5 },
  atk_spear: { desc: '槍・矛の突き', peak: -6 },
  atk_claw: { desc: '手裏剣を投げる', peak: -7 },
  atk_bow: { desc: '弓を射る', peak: -6, len: 0.6 },
  atk_xbow: { desc: '弩を射る', peak: -6 },
  atk_wand: { desc: '杖・ワンドの通常攻撃', peak: -8, len: 0.7 },
  atk_knuckle: { desc: 'ナックル（殴る）', peak: -5 },
  atk_gun: { desc: '銃（撃つ）', peak: -5 },
  skill_swing: { desc: 'スキル: 斬る', peak: -4, len: 0.8 },
  skill_stab: { desc: 'スキル: 突く', peak: -4, len: 0.8 },
  skill_shoot: { desc: 'スキル: 撃つ・射る', peak: -4, len: 0.8 },
  skill_throw: { desc: 'スキル: 投げる', peak: -5, len: 0.7 },
  skill_punch: { desc: 'スキル: 殴る', peak: -4, len: 0.9 },
  mag_fire: { desc: '魔法: 火', peak: -4, len: 1.4 },
  mag_ice: { desc: '魔法: 氷', peak: -5, len: 1.4 },
  mag_thunder: { desc: '魔法: 雷', peak: -3, len: 1.8 },
  mag_poison: { desc: '魔法: 毒', peak: -6, len: 1.1 },
  mag_holy: { desc: '魔法: 聖', peak: -5, len: 1.6 },
  mag_dark: { desc: '魔法: 闇', peak: -5, len: 1.5 },
  heal: { desc: '回復', peak: -6, len: 1.4 },
  buff: { desc: '強化がかかる', peak: -6, len: 1.2 },
  summon: { desc: '召喚', peak: -6, len: 1.2 },
  dash: { desc: '移動スキル（突進・瞬間移動）', peak: -7 },
  mob_attack: { desc: '敵の攻撃', peak: -7 },
  mob_cast: { desc: '敵の技の構え・予兆', peak: -5, len: 1.4 },
  mob_skill_hit: { desc: '敵の技が当たる', peak: -4, len: 0.8 },
  mob_summon: { desc: '敵が手下を呼ぶ', peak: -7, len: 0.9 },
  mob_buff: { desc: '敵の強化', peak: -6, len: 1.2 },
  dispel: { desc: '強化を崩す・消す', peak: -7, len: 0.8 },
  mob_spawn: { desc: '敵が出てくる', peak: -14 },
  mob_die_m: { desc: '中くらいの敵が倒れる', peak: -6, len: 0.9 },
  mob_die_l: { desc: '大きな敵が倒れる', peak: -3, len: 1.8 },
  boss_phase: { desc: 'ボスの段階が変わる', peak: -2, len: 2.4 },
  st_poison: { desc: '状態異常: 毒', peak: -8, len: 0.9 },
  st_stun: { desc: '状態異常: 気絶', peak: -7, len: 0.9 },
  st_freeze: { desc: '状態異常: 凍結', peak: -7, len: 0.9 },
  st_sleep: { desc: '状態異常: 睡眠', peak: -8, len: 1.2 },
  st_curse: { desc: '状態異常: 暗闇・封印・呪い・弱体・鈍足・混乱・変身', peak: -7, len: 1.2 },
  status_end: { desc: '状態異常が時間で切れる', peak: -12, len: 0.6 },
  status_cure: { desc: '状態異常が治る', peak: -8, len: 0.9 },
  status_resist: { desc: '状態異常を防いだ', peak: -9, len: 0.8 },
  pet_adopt: { desc: 'ペットを迎える', peak: -7, len: 1.4 },
  pet_feed: { desc: 'ペットにえさ', peak: -10, len: 0.6 },
  pet_happy: { desc: 'ペットが喜ぶ（親密度アップ・芸の成功）', peak: -9, len: 0.7 },
  pet_sulk: { desc: 'ペットがすねる（空腹・芸の失敗）', peak: -10, len: 0.8 },
};

export function playSfxOn(ctx, dest, id) {
  const fn = SFX[id];
  if (!fn) return false;
  fn(engineFor(ctx), dest, ctx.currentTime + 0.005);
  return true;
}
