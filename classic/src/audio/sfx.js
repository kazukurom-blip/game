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
};

export function playSfxOn(ctx, dest, id) {
  const fn = SFX[id];
  if (!fn) return false;
  fn(engineFor(ctx), dest, ctx.currentTime + 0.005);
  return true;
}
