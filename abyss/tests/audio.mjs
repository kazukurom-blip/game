// 音（効果音・BGM）の確かめ（Node だけで動く。WebAudio は偽物の AudioContext で代用）。実行: node tests/audio.mjs
import { SFX_DEFS, SFX, SFX_CATS, renderSfx, LOOT_SFX, LOOT_ORDER } from '../src/audio/sfx.js';
import { INSTRUMENTS, DRUMS, renderInstrument, renderDrum, rootFor, renderImpulse } from '../src/audio/instruments.js';
import { THEMES, THEME, SCALES, DRUM_PATTERNS } from '../src/audio/themes.js';
import { composeBar, themeInfo, themeNeeds, themeForState, actThemeForZone, barPos, padVoicing } from '../src/audio/composer.js';
import { AudioEngine, volCurve } from '../src/audio/engine.js';
import { MusicSystem } from '../src/audio/music.js';
import { CustomSounds, audioSlots } from '../src/audio/custom.js';
import { makeFxHandler, makeEventHandler, EVENT_SFX } from '../src/audio/hooks.js';
import { ensureAudioSettings, AUDIO_DEFAULTS, currentPrefs } from '../src/audio/settings.js';
import { slotFromFileName } from '../src/audio/panel.js';
import { peak, rms, Snd, mtof } from '../src/audio/dsp.js';
import { audio } from '../src/audio/audio.js';
import { ACTS } from '../src/data/world.js';
import { RARITIES } from '../src/data/rarity.js';
import { Game } from '../src/game/game.js';
import { newState } from '../src/game/state.js';

let pass = 0; let fail = 0;
const fails = [];
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; fails.push(name); console.log(`✘ ${name}: ${e.message}`); }
}
const ok = (c, m = '') => { if (!c) throw new Error(m || 'assert'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 偽物の WebAudio
class P { constructor(v = 0) { this.value = v; this.n = 0; } setValueAtTime(v) { this.value = v; this.n++; return this; } linearRampToValueAtTime(v) { this.value = v; this.n++; return this; } exponentialRampToValueAtTime(v) { this.value = v; this.n++; return this; } setTargetAtTime(v) { this.value = v; this.n++; return this; } cancelScheduledValues() { return this; } }
class N {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outs = new Set(); ctx.created[kind] = (ctx.created[kind] || 0) + 1; }
  connect(n) { if (!n) throw new Error('connect to nothing'); this.outs.add(n); return n; }
  disconnect() { this.outs.clear(); }
}
class Src extends N {
  constructor(ctx) { super(ctx, 'src'); this.playbackRate = new P(1); this.buffer = null; this.loop = false; this.onended = null; }
  start(t = 0) { if (this.started !== undefined) throw new Error('start twice'); this.started = t; this.ctx.live.add(this); }
  stop(t = 0) { this.stopped = t; }
}
class Osc extends N { constructor(ctx) { super(ctx, 'osc'); this.frequency = new P(440); this.detune = new P(0); this.type = 'sine'; } start(t = 0) { this.started = t; } stop(t = 0) { this.stopped = t; } }
class Buf { constructor(ch, len, sr) { if (!(len > 0) || !(sr >= 3000)) throw new Error(`bad buffer ${len} ${sr}`); this.numberOfChannels = ch; this.length = len; this.sampleRate = sr; this.duration = len / sr; this.d = Array.from({ length: ch }, () => new Float32Array(len)); } getChannelData(i) { return this.d[i]; } copyToChannel(src, i) { this.d[i].set(src); } }
class MockCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'suspended'; this.created = {}; this.live = new Set(); this.destination = new N(this, 'dest'); MockCtx.last = this; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; }
  createGain() { const n = new N(this, 'gain'); n.gain = new P(1); return n; }
  createStereoPanner() { const n = new N(this, 'pan'); n.pan = new P(0); return n; }
  createDynamicsCompressor() { const n = new N(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new P(0); return n; }
  createConvolver() { const n = new N(this, 'conv'); n.buffer = null; return n; }
  createBiquadFilter() { const n = new N(this, 'biquad'); n.type = 'lowpass'; n.frequency = new P(350); n.Q = new P(1); n.gain = new P(0); return n; }
  createDelay() { const n = new N(this, 'delay'); n.delayTime = new P(0); return n; }
  createOscillator() { return new Osc(this); }
  createBufferSource() { return new Src(this); }
  createBuffer(ch, len, sr) { return new Buf(ch, len, sr); }
  decodeAudioData(ab, okf, errf) {
    const u = new Uint8Array(ab);
    if (u.length < 4 || u[0] !== 82) { const e = new Error('decode'); errf?.(e); return Promise.reject(e); }
    const b = new Buf(1, 800, 8000); okf?.(b); return Promise.resolve(b);
  }
  /** 時間を進める（終わった音の onended を呼ぶ） */
  advance(dt) {
    this.currentTime += dt;
    for (const s of [...this.live]) {
      const end = (s.stopped ?? Infinity) < (s.started + (s.buffer ? s.buffer.duration / (s.playbackRate.value || 1) : 0)) ? s.stopped : s.started + (s.buffer ? s.buffer.duration / (s.playbackRate.value || 1) : 0);
      if (!s.loop && end <= this.currentTime) { this.live.delete(s); s.onended?.(); }
    }
  }
}
const fakeWav = () => { const b = new Uint8Array(64); b[0] = 82; return b.buffer; }; // 'R'（RIFF の頭）

async function newEngine() {
  const e = new AudioEngine();
  ok(e.start(MockCtx, { worker: false }), 'start');
  await e.resume();
  return e;
}
/** 本体で作る待ち行列が空になるまで待つ */
async function drain(e, max = 400) { for (let i = 0; i < max && (e.renderer.queue.length || e.renderer.waiting.size); i++) await sleep(5); }

// ---------------------------------------------------------------- 効果音
await t('効果音が 40 種類以上・ID が重ならない・日本語の名前', () => {
  ok(SFX_DEFS.length >= 40, `count ${SFX_DEFS.length}`);
  ok(new Set(SFX_DEFS.map((d) => d.id)).size === SFX_DEFS.length, 'dup');
  const cats = new Set(SFX_CATS.map((c) => c.id));
  for (const d of SFX_DEFS) { ok(/[^\x00-\x7f]/.test(d.name), `name ${d.id}`); ok(cats.has(d.cat), `cat ${d.id}`); ok(d.vol > 0 && d.vol <= 1, `vol ${d.id}`); }
});
await t('求められた効果音がそろっている', () => {
  const need = ['hit_phys', 'hit_fire', 'hit_cold', 'hit_lightning', 'hit_poison', 'hit_void', 'crit', 'kill', 'kill_elite', 'kill_boss', 'hero_hurt', 'hero_death', 'revive', 'level_up', 'paragon',
    'drop_common', 'drop_magic', 'drop_rare', 'drop_epic', 'drop_legendary', 'drop_set', 'drop_unique', 'drop_mythic', 'gold', 'salvage', 'ui_click', 'ui_open', 'ui_close', 'ui_tab', 'equip',
    'enhance_ok', 'enhance_fail', 'enhance_great', 'gem_combine', 'craft', 'socket', 'prestige', 'achievement', 'rift_start', 'rift_complete', 'boss_horn', 'ult', 'summon', 'buff', 'freeze', 'shock'];
  for (const id of need) ok(SFX[id], id);
});
const rendered = {};
await t('すべての効果音が作れる（NaN なし・音割れなし・短い・端が 0）', () => {
  for (const d of SFX_DEFS) {
    for (let v = 0; v < d.variants; v++) {
      const b = renderSfx(d.id, 44100, v);
      ok(b && b.length > 100, `${d.id} empty`);
      for (let i = 0; i < b.length; i++) if (!Number.isFinite(b[i])) throw new Error(`${d.id} NaN`);
      const p = peak(b);
      ok(p > 0.5 && p <= 0.91, `${d.id} peak ${p}`);
      ok(b.length / 44100 <= 4, `${d.id} too long`);
      ok(Math.abs(b[0]) < 0.02 && Math.abs(b[b.length - 1]) < 0.002, `${d.id} edge click`);
      if (v === 0) rendered[d.id] = b;
    }
  }
});
await t('作り分け（variants）は少しずつ違う音になる', () => {
  for (const d of SFX_DEFS.filter((x) => x.variants > 1)) {
    const a = renderSfx(d.id, 44100, 0); const b = renderSfx(d.id, 44100, 1);
    let diff = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]);
    ok(diff / n > 0.005 || a.length !== b.length, `${d.id} same`);
  }
});
await t('同じ音は作り直しても同じ（再現できる）', () => { const a = renderSfx('kill_boss'); const b = renderSfx('kill_boss'); ok(a.length === b.length && a.every((x, i) => x === b[i])); });
await t('効果音どうしが似すぎていない（長さ・音量の形・明るさで比べる）', () => {
  const feat = (b) => {
    const env = []; const K = 8; const n = b.length;
    for (let k = 0; k < K; k++) env.push(rms(b, Math.floor((k * n) / K), Math.floor(((k + 1) * n) / K)));
    const m = Math.max(...env) || 1;
    let zc = 0; for (let i = 1; i < n; i++) if ((b[i - 1] < 0) !== (b[i] < 0)) zc++;
    return [Math.log2(n / 44100 + 0.02), ...env.map((x) => (x / m) * 0.6), (zc / n) * 20];
  };
  const F = Object.fromEntries(Object.entries(rendered).map(([id, b]) => [id, feat(b)]));
  const ids = Object.keys(F);
  let worst = [9, '', ''];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = F[ids[i]]; const b = F[ids[j]];
    const d = Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0));
    if (d < worst[0]) worst = [d, ids[i], ids[j]];
  }
  ok(worst[0] > 0.03, `too similar: ${worst[1]} / ${worst[2]} (${worst[0].toFixed(3)})`);
});
await t('ドロップの音: すべてのレアリティにあり、珍しいほど長く華やか', () => {
  for (const r of RARITIES) ok(SFX[LOOT_SFX[r.id]], r.id);
  ok(LOOT_ORDER.length === RARITIES.length);
  const len = (r) => rendered[LOOT_SFX[r]].length;
  ok(len('common') < len('magic') && len('magic') < len('rare') && len('rare') < len('epic') && len('epic') < len('legendary'), 'length order');
  ok(len('mythic') >= Math.max(len('legendary'), len('set'), len('unique')), 'mythic longest');
  ok(SFX.drop_mythic.prio > SFX.drop_legendary.prio && SFX.drop_legendary.prio > SFX.drop_rare.prio, 'prio');
});

// ---------------------------------------------------------------- 楽器
await t('楽器と打楽器の音が作れる', () => {
  for (const id of Object.keys(INSTRUMENTS)) for (const root of [36, 48, 60, 72]) {
    const r = renderInstrument(id, root);
    ok(r && r.data.length > 100 && peak(r.data) <= 0.86 && peak(r.data) > 0.3, `${id}@${root}`);
    for (const x of r.data) if (!Number.isFinite(x)) throw new Error(`${id} NaN`);
  }
  for (const id of Object.keys(DRUMS)) { const r = renderDrum(id); ok(r && r.data.length > 50 && peak(r.data) <= 0.86, id); }
});
await t('弦をはじく音の高さが正しい（±3%）', () => {
  for (const m of [45, 57, 69]) {
    const f = mtof(m); const s = new Snd(32000, 0.6); s.pluck({ f, dur: 0.6, bright: 0.5 });
    const b = s.buf; const lo = Math.floor(32000 / (f * 1.2)); const hi = Math.ceil(32000 / (f * 0.8));
    let best = 0; let bl = 0;
    for (let lag = lo; lag <= hi; lag++) { let c = 0; for (let i = 2000; i < 12000; i++) c += b[i] * b[i + lag]; if (c > best) { best = c; bl = lag; } }
    const est = 32000 / bl;
    ok(Math.abs(est / f - 1) < 0.03, `midi ${m}: ${est.toFixed(1)} vs ${f.toFixed(1)}`);
  }
});
await t('基準の音は 6 半音ごと（ずらすのは ±3 半音まで）', () => { for (let m = 24; m < 100; m++) ok(Math.abs(m - rootFor(m)) <= 3, m); });
await t('残響の響きが作れる', () => { const ir = renderImpulse(32000); ok(ir.channels.length === 2 && ir.channels[0].length > 30000 && peak(ir.channels[0]) > 0.01); });

// ---------------------------------------------------------------- BGM
await t('BGM: タイトル・10 章・ボス・裂け目の曲がある', () => {
  for (const id of ['title', 'boss', 'boss_act', 'boss_final', 'rift']) ok(THEME[id], id);
  for (const a of ACTS) ok(THEME[a.id], a.id);
  ok(THEMES.length >= 14);
});
await t('BGM: 設計図の中身が正しい（音階・楽器・打楽器の型・刻み）', () => {
  for (const th of THEMES) {
    ok(SCALES[th.scale], `${th.id} scale`);
    ok(th.bpm >= 50 && th.bpm <= 170 && [12, 16].includes(th.steps) && th.meter > 0, `${th.id} tempo`);
    ok(Number.isInteger(th.steps / th.meter), `${th.id} steps/meter`);
    for (const k of ['bass', 'arp', 'lead']) if (th[k]) ok(INSTRUMENTS[th[k].inst], `${th.id} ${k} inst ${th[k].inst}`);
    if (th.arp) ok(Number.isInteger((th.steps / th.meter) / th.arp.rate) || (th.steps / th.meter) / th.arp.rate >= 1, `${th.id} arp rate`);
    if (th.drums) {
      const pat = DRUM_PATTERNS[th.drums.pattern];
      ok(pat, `${th.id} drum pattern`);
      for (const [inst, spec] of Object.entries(pat)) { ok(DRUMS[inst], `${th.id} drum ${inst}`); const p = typeof spec === 'string' ? spec : spec.p; ok(p.length === th.steps, `${th.id} ${inst} length ${p.length}`); }
      if (th.drums.fill) ok(DRUMS[th.drums.fill], `${th.id} fill`);
      if (th.drums.accent) ok(DRUMS[th.drums.accent], `${th.id} accent`);
    }
    if (th.amb?.sprinkle) ok(DRUMS[th.amb.sprinkle.inst], `${th.id} amb`);
    ok(th.gain > 0.3 && th.gain < 3, `${th.id} gain`);
    ok(/[^\x00-\x7f]/.test(th.name), `${th.id} name`);
  }
});
await t('BGM: 章ごとに違う曲（音階・調・速さがばらける）', () => {
  const acts = THEMES.filter((x) => /^act/.test(x.id));
  ok(new Set(acts.map((x) => `${x.scale}:${x.key % 12}`)).size >= 8, 'scale/key');
  ok(new Set(acts.map((x) => x.bpm)).size >= 8, 'bpm');
  ok(new Set(acts.map((x) => x.arp?.inst)).size >= 7, 'arp instruments');
  ok(THEME.act2.scale === 'hijaz' && THEME.act3.pad.type === 'glass', '砂漠の音階・氷の和音');
});
await t('BGM: 小節の音符は決まっていて、輪の長さごとにまったく同じ（継ぎ目なく繰り返す）', () => {
  for (const th of THEMES) {
    const inf = themeInfo(th);
    for (let b = inf.intro; b < inf.intro + inf.loopBars; b += 3) {
      const a = JSON.stringify(composeBar(th, b).events); const c = JSON.stringify(composeBar(th, b + inf.loopBars).events); const d = JSON.stringify(composeBar(th, b + inf.loopBars * 5).events);
      ok(a === c && a === d, `${th.id} bar ${b}`);
    }
    ok(inf.loopSec >= 20 && inf.loopSec <= 200, `${th.id} loop ${inf.loopSec}`);
  }
});
await t('BGM: 音符の位置と高さがおかしくない', () => {
  for (const th of THEMES) {
    const inf = themeInfo(th);
    let notes = 0; let lead = 0; let drums = 0;
    for (let b = 0; b < inf.intro + inf.loopBars; b++) {
      const bar = composeBar(th, b);
      ok(bar.pad.length === 4 && bar.pad.every((m) => m >= 36 && m <= 84), `${th.id} pad ${bar.pad}`);
      for (const e of bar.events) {
        ok(Number.isInteger(e.step) && e.step >= 0 && e.step < th.steps, `${th.id} step ${e.step}`);
        ok(e.vel > 0 && e.vel <= 1.3, `${th.id} vel`);
        if (e.kind === 'note') {
          notes++;
          ok(Number.isFinite(e.midi) && e.midi >= 24 && e.midi <= 100, `${th.id} midi ${e.midi} ${e.layer}`);
          if (e.layer === 'bass') ok(e.midi <= 64, `${th.id} bass high ${e.midi}`);
          if (e.layer === 'lead') { lead++; ok(e.midi >= 52 && e.midi <= 96, `${th.id} lead ${e.midi}`); }
        } else { drums++; ok(DRUMS[e.inst], `${th.id} drum ${e.inst}`); }
      }
    }
    ok(notes > inf.loopBars, `${th.id} notes ${notes}`);
    if (th.lead) ok(lead > 4, `${th.id} lead ${lead}`);
    if (th.drums) ok(drums > 4, `${th.id} drums ${drums}`);
  }
});
await t('BGM: 旋律の拍の頭は和音の音', () => {
  const th = THEME.act1; const inf = themeInfo(th);
  let strong = 0; let inChord = 0;
  for (let b = inf.intro; b < inf.intro + inf.loopBars; b++) {
    const bar = composeBar(th, b);
    const pcs = new Set(bar.pad.map((m) => m % 12));
    for (const e of bar.events) if (e.layer === 'lead' && (e.step === 0 || e.step === th.steps / 2)) { strong++; if (pcs.has(e.midi % 12)) inChord++; }
  }
  ok(strong > 4 && inChord / strong > 0.9, `${inChord}/${strong}`);
});
await t('BGM: 前もって作る楽器の一覧が出る', () => { for (const th of THEMES) { const n = themeNeeds(th); ok(n.notes.length >= 3 && n.notes.every((x) => INSTRUMENTS[x.inst]), th.id); } });
await t('BGM: 1000 小節ぶんの計算が軽い（200ms 未満）', () => { const t0 = performance.now(); for (let i = 0; i < 1000; i++) composeBar(THEMES[i % THEMES.length], i); ok(performance.now() - t0 < 200, `${(performance.now() - t0).toFixed(0)}ms`); });

// ---------------------------------------------------------------- 場面に合う曲
await t('場面に合う曲: タイトル・章・ボス・章のボス・最後のボス・裂け目', () => {
  ok(themeForState(null) === 'title');
  const g = new Game({ seed: 1 });
  ok(themeForState(g) === 'title', 'before start');
  g.newGame('warrior', 'x');
  for (let i = 0; i < 40; i++) g.tick(0.05);
  ok(themeForState(g) === 'act1', `act1 ${themeForState(g)}`);
  ok(actThemeForZone('a3z2') === 'act3' && actThemeForZone('a10z1') === 'act10' && actThemeForZone('zzz') === 'act1', 'zone parse');
  g.state.world.zone = 'a4z1';
  ok(themeForState(g) === 'act4', 'act4 by id');
  const fake = { boss: true, dead: false, team: 'enemy', rank: 'boss' };
  g.combat.units.push(fake);
  ok(themeForState(g) === 'boss', 'boss');
  fake.rank = 'actboss';
  ok(themeForState(g) === 'boss_act', 'act boss');
  g.state.world.zone = 'a10z5';
  ok(themeForState(g) === 'boss_final', 'final');
  fake.dead = true;
  g.state.world.mode = 'rift';
  ok(themeForState(g) === 'rift', 'rift');
});

// ---------------------------------------------------------------- 音の通り道（偽物の AudioContext）
await t('AudioContext が無くても落ちない（Node・古いブラウザ）', async () => {
  const e = new AudioEngine();
  ok(e.start(undefined) === false && !e.running);
  ok(e.play('kill') === false);
  e.duck(); e.setVolumes({ sfx: 0.5 });
  const m = new MusicSystem(e);
  ok(m.play('act1') === false);
  m.tick(); m.stop();
});
await t('通り道: マスター・効果音・BGM・残響・24 ボイス', async () => {
  const e = await newEngine();
  ok(e.running && e.voices.length === 24 && e.master && e.sfxBus && e.musicBus && e.verb && e.duckGain);
  e.setVolumes({ master: 1, sfx: 0.5, bgm: 0.5, mute: false });
  ok(Math.abs(e.master.gain.value - 1) < 1e-6 && e.sfxBus.gain.value > 0 && e.musicBus.gain.value > 0);
  e.setVolumes({ mute: true });
  ok(e.master.gain.value === 0, 'mute');
  ok(volCurve(0.5) === 0.25 && volCurve(2) === 1 && volCurve(-1) === 0);
});
await t('効果音を鳴らす: 作ってから鳴る・同じ音の連打は間引く・種類で消せる', async () => {
  const e = await newEngine();
  const ctx = MockCtx.last;
  for (const d of SFX_DEFS) ok(e.play(d.id, { force: true }) === true, d.id);
  await drain(e);
  await sleep(20);
  e.prewarm(); // 作り分けも全部作っておく
  await drain(e);
  ok(e.stats.sources >= 30, `sources ${e.stats.sources}`);
  ctx.advance(1);
  const before = e.stats.sources;
  for (let i = 0; i < 50; i++) e.play('hit_phys');
  ok(e.stats.sources - before === 1, `throttle ${e.stats.sources - before}`);
  ctx.advance(1);
  // 戦闘の音は 0.1 秒に 5 つまで
  const b2 = e.stats.sources;
  for (const id of ['hit_phys', 'hit_fire', 'hit_cold', 'hit_lightning', 'hit_poison', 'hit_void', 'kill', 'swing', 'bow']) e.play(id);
  ok(e.stats.sources - b2 <= 5, `dense ${e.stats.sources - b2}`);
  ctx.advance(1);
  e.cats = { combat: false };
  ok(e.play('kill') === false && e.play('ui_click') === true, 'cats');
});
await t('ボイスは 24 まで（優先度の低い音から譲る）', async () => {
  const e = await newEngine();
  const ctx = MockCtx.last;
  await Promise.all(SFX_DEFS.map((d) => e.ensure({ kind: 'sfx', id: d.id, v: 0 })));
  for (let i = 0; i < 60; i++) { e.play(SFX_DEFS[i % SFX_DEFS.length].id, { force: true, min: 0 }); ctx.currentTime += 0.001; }
  const busy = e.voices.filter((v) => v.src && v.end > ctx.currentTime).length;
  ok(busy <= 24, `busy ${busy}`);
  ok(e.stats.stolen + e.stats.dropped > 0, 'steal/drop');
  // ミシックは必ず鳴る（優先度が一番高い）
  const s0 = e.stats.sources;
  ok(e.play('drop_mythic', { min: 0 }) && e.stats.sources === s0 + 1, 'mythic');
});
await t('ダッキング: BGM を下げて戻す', async () => {
  const e = await newEngine();
  e.duck(0.3, 1);
  ok(e.duckGain.gain.value === 1 && e.duckGain.gain.n >= 4, 'automation');
});

// ---------------------------------------------------------------- BGM の再生（偽物）
await t('BGM: 先読みで音符を予約し、和音の発振器は作り直さない', async () => {
  const e = await newEngine();
  const ctx = MockCtx.last;
  const m = new MusicSystem(e);
  ok(m.play('act1', { fade: 0.5 }));
  for (let i = 0; i < 300 && !m.current?.started; i++) await sleep(5);
  ok(m.current?.started, 'started');
  const osc0 = ctx.created.osc;
  const src0 = ctx.created.src || 0;
  for (let i = 0; i < 1200; i++) { ctx.advance(0.05); m.tick(); } // 60 秒
  ok(ctx.created.osc === osc0, `osc grew ${osc0} → ${ctx.created.osc}`);
  ok((ctx.created.src || 0) - src0 > 60, `notes ${(ctx.created.src || 0) - src0}`);
  ok(m.stats.dropped === 0, `dropped ${m.stats.dropped}`);
  for (const [layer, list] of Object.entries(m.current.active)) ok(list.length <= (layer === 'arp' ? 10 : 14), `poly ${layer} ${list.length}`);
  // 予約は数百ミリ秒先まで
  const far = m.current.q.filter((x) => x.when < ctx.currentTime + 0.25).length;
  ok(far === 0, 'lookahead');
  m.stop(); clearInterval(m.timer); m.timer = null;
});
await t('BGM: 曲を切り替えると交差フェードして古い曲を片付ける', async () => {
  const e = await newEngine();
  const ctx = MockCtx.last;
  const m = new MusicSystem(e);
  m.play('act2', { fade: 0.4 });
  for (let i = 0; i < 300 && !m.current?.started; i++) await sleep(5);
  for (let i = 0; i < 40; i++) { ctx.advance(0.05); m.tick(); }
  const old = m.current;
  m.play('boss', { fade: 0.4 });
  for (let i = 0; i < 300 && !m.current?.started; i++) await sleep(5);
  ok(m.current !== old && m.current.id === 'boss' && old.stopping, 'switch');
  ok(m.players.length === 2, `both ${m.players.length}`);
  for (let i = 0; i < 40; i++) { ctx.advance(0.05); m.tick(); }
  ok(m.players.length === 1 && m.players[0].id === 'boss', 'cleaned');
  ok(m.play('boss') === true && m.stats.switches === 2, 'same theme no restart');
  m.stop(); clearInterval(m.timer); m.timer = null;
});
await t('BGM: 15 曲すべてが鳴らせる', async () => {
  const e = await newEngine();
  const ctx = MockCtx.last;
  const m = new MusicSystem(e);
  for (const th of THEMES) {
    m.play(th.id, { fade: 0.1 });
    for (let i = 0; i < 400 && !(m.current?.started && m.current.id === th.id); i++) await sleep(5);
    const n0 = m.stats.notes;
    for (let i = 0; i < 160; i++) { ctx.advance(0.05); m.tick(); }
    ok(m.stats.notes > n0, `${th.id} silent`);
  }
  m.stop(); clearInterval(m.timer); m.timer = null;
});

// ---------------------------------------------------------------- 差し替え
await t('差し替え: 枠の一覧・入れる・鳴る・戻す・知らない枠は断る', async () => {
  const e = await newEngine();
  const c = new CustomSounds(e);
  const slots = audioSlots();
  ok(slots.length === SFX_DEFS.length + THEMES.length && slots.every((s) => /^(sfx|bgm)\./.test(s.id)));
  await c.set('sfx.kill', fakeWav(), 'kill.wav');
  ok(e.custom.has('sfx.kill') && c.has('sfx.kill'));
  await e.play('kill', { force: true });
  const v = e.voices.find((x) => x.id === 'kill');
  ok(v && v.src.buffer === e.custom.get('sfx.kill'), 'custom buffer used');
  let threw = false; try { await c.set('sfx.nope', fakeWav()); } catch { threw = true; }
  ok(threw, 'unknown slot');
  threw = false; try { await c.set('sfx.gold', new ArrayBuffer(2)); } catch { threw = true; }
  ok(threw, 'bad audio');
  await c.remove('sfx.kill');
  ok(!e.custom.has('sfx.kill') && !c.has('sfx.kill'));
});
await t('差し替え: BGM を入れるとその曲を繰り返し流す', async () => {
  const e = await newEngine();
  const m = new MusicSystem(e);
  const c = new CustomSounds(e);
  await c.set('bgm.act3', fakeWav(), 'act3.wav');
  m.play('act3', { fade: 0.1 });
  for (let i = 0; i < 200 && !m.current?.started; i++) await sleep(5);
  ok(m.current.custom && m.current.oscs.some((s) => s.loop === true), 'loop');
  m.stop(); clearInterval(m.timer); m.timer = null;
});
await t('ファイル名 → 枠 ID', () => {
  ok(slotFromFileName('sfx.kill.ogg') === 'sfx.kill');
  ok(slotFromFileName('C:\\x\\bgm.act1.mp3') === 'bgm.act1');
  ok(slotFromFileName('hit_fire.wav') === 'sfx.hit_fire');
  ok(slotFromFileName('rift.mp3') === 'bgm.rift');
  ok(slotFromFileName('nothing.wav') === null && slotFromFileName('sfx.nothing.ogg') === null);
});

// ---------------------------------------------------------------- 設定
await t('設定: 足りない項目を安全な既定で埋める・範囲外を直す', () => {
  const s = newState().settings;
  ok(s.audio === undefined);
  const a = ensureAudioSettings(s, null);
  ok(a.master === AUDIO_DEFAULTS.master && a.mute === false && a.muteHidden === true && a.cats.combat && a.loot.mythic);
  s.sfx = 7; s.bgm = undefined; a.master = -3; a.cats = null; a.loot = { common: false };
  ensureAudioSettings(s, null);
  ok(s.sfx === 1 && s.bgm === 0.35 && a.master === 0 && a.cats.ui === true && a.loot.common === false && a.loot.rare === true);
  const p = currentPrefs({ settings: s });
  ok(p.sfx === 1 && p.loot.common === false);
});
await t('設定: セーブして読み込んでも残る（JSON）', () => {
  const g = new Game({ seed: 2 }); g.newGame('ranger', 'x');
  const a = ensureAudioSettings(g.state.settings);
  a.mute = true; a.loot.magic = false; g.state.settings.bgm = 0.12;
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  const g2 = new Game({ seed: 3 }); g2.load(raw);
  const a2 = ensureAudioSettings(g2.state.settings);
  ok(a2.mute === true && a2.loot.magic === false && g2.state.settings.bgm === 0.12);
});

// ---------------------------------------------------------------- 出来事 → 音（本物のゲームを回す）
await t('出来事 → 音: ゲームを 2 分回しても落ちず、戦闘・スキル・ドロップの音が出る', async () => {
  const g = new Game({ seed: 11 });
  g.newGame('sorcerer', 'x');
  audio.init(g, { AudioContext: MockCtx, worker: false, dom: false });
  audio.unlock();
  await sleep(10);
  ok(audio.engine.running, 'running');
  const scene = { camX: 0, game: g };
  const fxh = makeFxHandler(audio);
  const ctx = audio.engine.ctx;
  const errs = [];
  const orig = console.error; console.error = (...x) => { errs.push(x.join(' ')); };
  try {
    for (let f = 0; f < 60 * 120 / 4; f++) { // 4 ティックごとに 1 フレーム
      for (let k = 0; k < 4; k++) g.tick(0.05);
      const fx = g.combat.fx; g.combat.fx = [];
      scene.camX = (g.combat.hero?.x || 0) - 380;
      for (const e of fx) fxh(scene, e);
      ctx.advance(0.2);
      if (f % 50 === 0) await sleep(0);
    }
  } finally { console.error = orig; }
  await drain(audio.engine);
  ok(!errs.length, errs[0]);
  const st = audio.engine.stats;
  ok(st.byCat.combat > 20 && st.byCat.skill > 10, JSON.stringify(st.byCat));
  ok(st.played > 50, `played ${st.played}`);
});
await t('出来事 → 音: game.events の名前で鳴る（鍛冶・実績・裂け目・sfx）', async () => {
  const played = [];
  const A = { engine: { running: true }, play: (id) => { played.push(id); return true; }, duck() {}, music() {}, onWorldEvent() {}, uiSound: (id) => played.push(id), sinceStart: () => 99 };
  const h = makeEventHandler(A);
  h({ type: 'enhance', payload: { ok: true } });
  h({ type: 'enhance', payload: { ok: false } });
  h({ type: 'enhanceResult', payload: { great: true } });
  h({ type: 'craft', payload: { kind: 'reroll' } });
  h({ type: 'gemCombine', payload: {} });
  h({ type: 'achievement', payload: { id: 'x' } });
  h({ type: 'riftStart', payload: {} });
  h({ type: 'riftEnd', payload: { success: false } });
  h({ type: 'invChanged', payload: { salvaged: 3 } });
  h({ type: 'invChanged', payload: {} });
  h({ type: 'sfx', payload: { id: 'sfx.socket' } });
  h({ type: 'whatever', payload: {} });
  h({ type: 'zoneClear', payload: { first: false } });
  ok(played.join(',') === 'enhance_ok,enhance_fail,enhance_great,reroll,gem_combine,achievement,rift_start,boss_fail,salvage,socket', played.join(','));
  for (const [k, v] of Object.entries(EVENT_SFX)) { const id = typeof v === 'function' ? v({}) : v; if (id) ok(SFX[id], `${k} → ${id}`); }
});
await t('出来事 → 音: 戦闘の画面の出来事（fx）を音に変える', () => {
  const played = [];
  const A = { engine: { running: true }, play: (id, o) => { played.push(id); return true; }, duck() {}, loot: (e) => played.push(`loot:${e.item.rarity}`) };
  const h = makeFxHandler(A);
  const scene = { camX: 0, game: { state: { hero: { cls: 'ranger' } }, combat: { hero: { maxLife: 100 } } } };
  const evs = [
    { t: 'dmg', x: 600, el: 'fire', team: 'enemy' }, { t: 'dmg', x: 600, crit: true, team: 'enemy' }, { t: 'dmg', team: 'enemy', dot: true },
    { t: 'dmg', team: 'hero', hero: true, v: 30 }, { t: 'cast', behavior: 'projectile', el: 'phys' }, { t: 'cast', behavior: 'melee' },
    { t: 'death', unit: { rank: 'rare' } }, { t: 'death', unit: { boss: true } }, { t: 'loot', item: { rarity: 'epic' } }, { t: 'levelup', paragon: 3 },
    { t: 'boss' }, { t: 'text', text: '凍結' }, { t: 'ult', skill: 'x' }, { t: 'leap' }, { t: 'mystery_new_fx' }, { t: 'meteor', sfx: 'explosion' },
  ];
  for (const e of evs) h(scene, e);
  ok(played.join(',') === 'hit_fire,crit,hero_hurt,bow,kill_elite,kill_boss,loot:epic,paragon,boss_horn,freeze,ult,leap,explosion', played.join(','));
});
await t('ドロップの音は 0.4 秒に 1 回で、待っている間は一番珍しい物を残す', async () => {
  ok(audio.engine.running);
  const ctx = audio.engine.ctx;
  ctx.advance(2);
  const seen = [];
  const orig = audio.engine.play.bind(audio.engine);
  audio.engine.play = (id, o) => { if (/^drop_/.test(id)) seen.push(id); return orig(id, o); };
  try {
    const it = (rarity, q = 0) => ({ item: { rarity, q }, where: 'bag' });
    audio.loot(it('rare'));
    audio.loot(it('magic'));
    audio.loot(it('mythic'));
    audio.loot(it('epic'));
    audio.loot({ item: { rarity: 'legendary' }, where: 'salvaged' }); // 自動分解は鳴らさない
    ok(seen.join(',') === 'drop_rare', `first ${seen}`);
    ctx.advance(0.45);
    await sleep(450);
    ok(seen.join(',') === 'drop_rare,drop_mythic', `queued ${seen}`);
    ctx.advance(1);
    audio.loot(it('legendary', 2)); // 原初はきらめきも足す
    await sleep(130);
    ok(seen.includes('drop_primal'), `primal ${seen}`);
    ensureAudioSettings(audio.game.state.settings).loot.rare = false;
    ctx.advance(1);
    const n = seen.length;
    audio.loot(it('rare'));
    ok(seen.length === n, 'rare muted by setting');
  } finally { audio.engine.play = orig; }
});
await t('audio の入口: 曲の選び方・音量・消音・調べもの', async () => {
  audio.setMusic('boss');
  ok(!audio.auto && audio.manual === 'boss');
  audio.setMusic('auto');
  ok(audio.auto);
  audio.setMusic('a2z1');
  ok(audio.auto, 'zone id → auto');
  audio.setVolumes(0.5, 0.2);
  ok(audio.game.state.settings.sfx === 0.5 && audio.game.state.settings.bgm === 0.2);
  audio.setMuted(true);
  ok(audio.engine.master.gain.value === 0, 'muted');
  audio.setMuted(false);
  ok(audio.engine.master.gain.value > 0, 'unmuted');
  const d = audio.debug();
  ok(d.sfxCount >= 40 && d.themes >= 14 && d.ctx === 'running', JSON.stringify(d).slice(0, 200));
  ok(audio.preview('sfx.ui_click') !== undefined);
  audio.musicSys.stop(); clearInterval(audio.musicSys.timer); audio.musicSys.timer = null;
  clearInterval(audio.housekeeping);
});

console.log(`\n音のテスト: ${pass} 通過 / ${fail} 失敗`);
if (fail) console.log('失敗:', fails.join(' / '));
process.exit(fail ? 1 : 0);
