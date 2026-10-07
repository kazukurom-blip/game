// 効果音（今は UI と基本の数個だけ。全部の一覧は docs/SOUND.md、作るのは次の段階）
import { engineFor, INSTRUMENTS, DRUMS } from './synth.js';

const bell = INSTRUMENTS.bell, marimba = INSTRUMENTS.marimba;

export const SFX = {
  ui_click(S, d, t) { marimba(S, d, t, 84, 0.05, 0.5); },
  ui_open(S, d, t) { marimba(S, d, t, 79, 0.05, 0.45); marimba(S, d, t + 0.05, 86, 0.05, 0.4); },
  ui_close(S, d, t) { marimba(S, d, t, 86, 0.05, 0.4); marimba(S, d, t + 0.05, 79, 0.05, 0.35); },
  jump(S, d, t) {
    const o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.09);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.14);
  },
  pickup(S, d, t) { bell(S, d, t, 88, 0.1, 0.7); bell(S, d, t + 0.06, 95, 0.1, 0.6); },
  coin(S, d, t) { bell(S, d, t, 93, 0.05, 0.6); bell(S, d, t + 0.07, 100, 0.2, 0.7); },
  hit(S, d, t) { DRUMS.snare(S, d, t, 0.6); DRUMS.kick(S, d, t, 0.5); },
};

export function playSfxOn(ctx, dest, id) {
  const fn = SFX[id];
  if (!fn) return false;
  fn(engineFor(ctx), dest, ctx.currentTime + 0.005);
  return true;
}
