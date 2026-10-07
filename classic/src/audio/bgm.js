// 曲を鳴らす仕組み。
// - makeSongBus: 曲 1 つ分のミキサー（パートごとに音量・左右・リバーブの量）
// - BgmPlayer: 少し先までずつ予約して鳴らし、イントロのあとループ部分をくり返す
// - renderSong: OfflineAudioContext で 1 周分を書き出す（試聴ファイル用）

import { compileSong } from './score.js';
import { engineFor, makeReverb, playNote } from './synth.js';

const LOOKAHEAD = 0.35; // 秒先まで予約
const TICK_MS = 50;

export function makeSongBus(ctx, song, out) {
  const S = engineFor(ctx);
  const bus = ctx.createGain(); bus.gain.value = 1;
  const rev = makeReverb(S, 1.9, 3.0);
  const revIn = ctx.createGain(); revIn.gain.value = 1;
  const revOut = ctx.createGain(); revOut.gain.value = 0.55;
  revIn.connect(rev); rev.connect(revOut); revOut.connect(bus);
  const tracks = {};
  for (const [name, tr] of Object.entries(song.tracks)) {
    const g = ctx.createGain(); g.gain.value = 1;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = tr.pan || 0; g.connect(pan); pan.connect(bus); } else g.connect(bus);
    const send = ctx.createGain(); send.gain.value = tr.rev ?? 0.2;
    g.connect(send); send.connect(revIn);
    tracks[name] = g;
  }
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32; hp.Q.value = 0.6; // 聞こえない低すぎる音を切る
  bus.connect(hp); hp.connect(out);
  return { S, bus, tracks, nodes: [bus, hp, rev, revIn, revOut, ...Object.values(tracks)] };
}

function scheduleRange(B, events, base, from, to) {
  // events は t の昇順。[from, to) に入る物だけ予約。i を返す
  let i = from;
  while (i < events.length && base + events[i].t < to) {
    const ev = events[i];
    const dest = B.tracks[ev.track];
    if (dest) playNote(B.S, dest, ev, Math.max(base + ev.t, B.S.ctx.currentTime));
    i++;
  }
  return i;
}

export class BgmPlayer {
  constructor(ctx, out) { this.ctx = ctx; this.out = out; this.cur = null; }

  play(song, { fadeIn = 0.05, skipIntro = false } = {}) {
    const ctx = this.ctx;
    const comp = song._compiled || (song._compiled = compileSong(song));
    const B = makeSongBus(ctx, song, this.out);
    const t0 = ctx.currentTime + 0.08;
    B.bus.gain.setValueAtTime(0, ctx.currentTime);
    B.bus.gain.linearRampToValueAtTime(1, t0 + fadeIn);
    const st = { song, comp, B, seg: skipIntro || !comp.intro.events.length ? comp.loop : comp.intro, base: t0, i: 0, timer: null };
    const tick = () => {
      const to = ctx.currentTime + LOOKAHEAD;
      for (let guard = 0; guard < 4; guard++) {
        st.i = scheduleRange(B, st.seg.events, st.base, st.i, to);
        if (st.i < st.seg.events.length) break;
        if (st.base + st.seg.len > to) break;
        st.base += st.seg.len; st.seg = comp.loop; st.i = 0; // 次はループ部分
      }
    };
    tick();
    st.timer = setInterval(tick, TICK_MS);
    this.cur = st;
    return st;
  }

  stop(fade = 0.6) {
    const st = this.cur;
    if (!st) return;
    this.cur = null;
    clearInterval(st.timer);
    const ctx = this.ctx, g = st.B.bus.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + fade);
    setTimeout(() => { for (const n of st.B.nodes) { try { n.disconnect(); } catch { /* 何もしない */ } } }, (fade + 3) * 1000);
  }
}

// ---------------------------------------------------------------- 書き出し（ブラウザで動かす）
// イントロ → ループ → ループ と続けて鳴らした音をそのまま返す（Float32Array）。
// 返り値: { sampleRate, introLen, loopLen, length, left, right }
// 書き出す側（tools/render_bgm.mjs）で 2 周目のループ [introLen+loopLen, introLen+2*loopLen) を
// ループ部分に使う。2 周目の頭には 1 周目の最後の残響が入っているので、そこをくり返してもつなぎ目が出ない。
export async function renderSong(song, { sampleRate = 44100, level = 0.9 } = {}) {
  const comp = compileSong(song);
  // イントロとループの長さをサンプルの整数倍にそろえる（1 サンプル未満のずれ。書き出しで切る位置をはっきりさせる）。
  // なお Chrome では 1 周目と 2 周目で音の始まりが数サンプルずれることがあるので、書き出す側でつなぎ目をなめらかにする
  const I = Math.round(comp.intro.len * sampleRate) / sampleRate, L = Math.round(comp.loop.len * sampleRate) / sampleRate;
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil((I + 2 * L) * sampleRate) + 16, sampleRate);
  const master = ctx.createGain(); master.gain.value = level;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 4; lim.attack.value = 0.005; lim.release.value = 0.2;
  master.connect(lim); lim.connect(ctx.destination);
  const B = makeSongBus(ctx, song, master);
  const all = [...comp.intro.events.map((ev) => [ev.t, ev])];
  for (const k of [0, 1]) for (const ev of comp.loop.events) all.push([I + k * L + ev.t, ev]);
  all.sort((a, b) => a[0] - b[0]);
  // 全部を先に予約すると音の部品が多すぎて遅くなるので、CHUNK 秒ごとに止めて次の分を予約する
  const CHUNK = 2;
  let i = 0;
  const upTo = (t) => { while (i < all.length && all[i][0] < t) { const [at, ev] = all[i++]; playNote(B.S, B.tracks[ev.track], ev, at); } };
  upTo(2 * CHUNK);
  const end = ctx.length / sampleRate;
  for (let k = 1; k * CHUNK < end; k++) {
    ctx.suspend(k * CHUNK).then(() => { upTo((k + 2) * CHUNK); ctx.resume(); });
  }
  const buf = await ctx.startRendering();
  return { sampleRate, introLen: I, loopLen: L, length: buf.length, left: buf.getChannelData(0), right: buf.getChannelData(1) };
}
