// 曲のデータの検査（ブラウザ不要）。実行: node classic/tests/audio_unit.mjs
// - 小節ごとの拍の数が拍子と合う / パートの小節数が和音の小節数と合う
// - 音がパートの音域（range）に収まる / 楽器・太鼓の名前が音源にある
// - ループ 1 周が 60〜120 秒、イントロは 15 秒まで（ジングルは 1〜8 秒）
// - 効果音の一覧と、Core のお知らせ（GameEventType）→ 効果音・ジングルの対応表（events.js）に抜けや無い ID が無い
import { noteToMidi, parseDur, barBeats, parseChord, compileSong, midiToName, expandPart } from '../src/audio/score.js';
import { INSTRUMENTS, DRUMS } from '../src/audio/synth.js';
import { SONGS } from '../src/audio/songs/index.js';
import { SFX, SFX_INFO } from '../src/audio/sfx.js';
import { EVENT_SFX, EVENT_JINGLE, WEAPON_SFX, SKILL_SFX, STATUS_SFX, MOB_SIZE, CLIMB, MOB_MOTION } from '../src/audio/events.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  NG', msg); } };

// 部品
ok(noteToMidi('C4') === 60 && noteToMidi('A4') === 69 && noteToMidi('F#5') === 78 && noteToMidi('Bb5') === 82, '音の名前 → MIDI 番号');
ok(parseDur('q.').beats === 1.5 && parseDur('et').beats === 1 / 3 && parseDur('h~').tie, '長さの読み方');
ok(barBeats('F#5:q. A5:e D6:q C#6:e B5:e') === 4, '1 小節の拍');
ok(parseChord('D/A').bass === 9 && parseChord('Gm6').pcs.join() === '7,10,2,4', '和音の読み方');

for (const [id, song] of Object.entries(SONGS)) {
  console.log(`曲 ${id}「${song.title}」 ${song.bpm} BPM ${song.meter || `${song.beatsPerBar}/4`}`);
  const bpb = song.beatsPerBar;
  for (const [sn, sec] of Object.entries(song.sections)) {
    const nb = sec.chords.length;
    sec.chords.forEach((c, i) => { try { c.split(/\s+/).forEach(parseChord); ok(true); } catch (e) { ok(false, `${sn} ${i + 1} 小節目の和音: ${e.message}`); } });
    for (const [pn, bars] of Object.entries(sec.parts || {})) {
      ok(song.tracks[pn], `${sn}: パート ${pn} が tracks に無い`);
      ok(bars.length === nb, `${sn}.${pn}: 小節数 ${bars.length} ≠ 和音の小節数 ${nb}`);
      bars.forEach((b, i) => {
        let beats = NaN;
        try { beats = barBeats(b); } catch (e) { ok(false, `${sn}.${pn} ${i + 1} 小節目: ${e.message}`); return; }
        ok(Math.abs(beats - bpb) < 1e-6, `${sn}.${pn} ${i + 1} 小節目の拍が ${beats}（${bpb} のはず）: "${b}"`);
      });
    }
    for (const [pn, pat] of Object.entries(sec.gen || {})) ok(song.patterns[pat], `${sn}.${pn}: 伴奏の型 ${pat} が無い`);
    if (sec.drums) ok(song.drumPatterns[sec.drums], `${sn}: 太鼓の型 ${sec.drums} が無い`);
  }

  // 音域（区間ごと・パートごと）
  const span = {};
  for (const sn of [...song.order.intro, ...song.order.loop]) {
    const sec = song.sections[sn];
    for (const [pn, tr] of Object.entries(song.tracks)) {
      if (tr.inst === 'drums') continue;
      ok(INSTRUMENTS[tr.inst], `楽器 ${tr.inst} が音源に無い`);
      for (const n of expandPart(song, sec, pn)) {
        const m = n.midi + (tr.transpose || 0);
        ok(m >= tr.range[0] && m <= tr.range[1], `${sn}.${pn}: ${midiToName(m)} が音域 ${midiToName(tr.range[0])}〜${midiToName(tr.range[1])} の外`);
        span[pn] = span[pn] || [m, m]; span[pn][0] = Math.min(span[pn][0], m); span[pn][1] = Math.max(span[pn][1], m);
      }
    }
  }
  console.log('  音域: ' + Object.entries(span).map(([k, [a, b]]) => `${k} ${midiToName(a)}〜${midiToName(b)}`).join(' / '));

  // 曲全体
  const c = compileSong(song);
  console.log(`  イントロ ${c.intro.bars} 小節 ${c.intro.len.toFixed(2)} 秒 / ループ ${c.loop.bars} 小節 ${c.loop.len.toFixed(2)} 秒 / 音の数 ${c.intro.events.length + c.loop.events.length}`);
  if (song.jingle) {
    ok(c.loop.len >= 1 && c.loop.len <= 8, `ジングルが ${c.loop.len.toFixed(1)} 秒（1〜8 秒のはず）`);
    ok(c.intro.events.length === 0, 'ジングルにイントロがある');
  } else {
    ok(c.loop.len >= 60 && c.loop.len <= 120, `ループ 1 周が ${c.loop.len.toFixed(1)} 秒（60〜120 秒のはず）`);
    ok(c.intro.len <= 15, `イントロが ${c.intro.len.toFixed(1)} 秒（15 秒まで）`);
    ok(c.loop.bars % 4 === 0, `ループの小節数 ${c.loop.bars} が 4 の倍数でない`);
  }
  for (const seg of [c.intro, c.loop]) {
    for (const e of seg.events) {
      ok(Number.isFinite(e.t) && Number.isFinite(e.d) && Number.isFinite(e.vel) && e.d > 0 && e.vel > 0, `おかしな音: ${JSON.stringify(e)}`);
      ok(e.t < seg.len, `区間の外の音: t=${e.t}`);
      if (e.midi == null) ok(DRUMS[e.inst], `太鼓 ${e.inst} が音源に無い`);
    }
    for (let i = 1; i < seg.events.length; i++) ok(seg.events[i].t >= seg.events[i - 1].t, '音が時間順でない');
  }
  // メロディの歌いやすさ（1 オクターブを超える跳び・同じ高さが 6 回以上続く、が無いこと）
  const mel = Object.entries(song.tracks).find(([, t]) => t.melody) || Object.entries(song.tracks).find(([, t]) => t.inst === 'flute');
  if (mel) {
    const notes = c.loop.events.filter((e) => e.track === mel[0]);
    let maxLeap = 0, run = 1, maxRun = 1;
    for (let i = 1; i < notes.length; i++) {
      maxLeap = Math.max(maxLeap, Math.abs(notes[i].midi - notes[i - 1].midi));
      run = notes[i].midi === notes[i - 1].midi ? run + 1 : 1; maxRun = Math.max(maxRun, run);
    }
    console.log(`  メロディ(${mel[0]}): 一番大きい跳び ${maxLeap} 半音 / 同じ音の連続 最大 ${maxRun}`);
    ok(maxLeap <= 12, `メロディの跳びが ${maxLeap} 半音（12 まで）`);
    ok(maxRun < 6, `同じ音が ${maxRun} 回続く`);
  }
}

// ---------------------------------------------------------------- 効果音と Core のお知らせの対応表
console.log('効果音・お知らせの対応表');
ok(Object.keys(SFX).length === Object.keys(SFX_INFO).length && Object.keys(SFX).every((k) => SFX_INFO[k]), 'SFX と SFX_INFO の ID がそろっていない');
const UROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../classic-unity');
const read = (f) => { try { return fs.readFileSync(path.join(UROOT, f), 'utf8'); } catch { return null; } };
const sfxIds = new Set(Object.keys(SFX));
const jingleIds = new Set(Object.entries(SONGS).filter(([, s]) => s.jingle).map(([k]) => k));
// 決め方（文字・null・入れ子の byId/byValue/byText）の中の ID を全部集める
const idsIn = (v) => (v == null ? [] : typeof v === 'string' ? [v] : [...['byId', 'byValue', 'byText'].flatMap((k) => Object.values(v[k] || {}).flatMap(idsIn)), ...idsIn(v.default ?? null), ...idsIn(v.fixed ?? null)]);
for (const [ev, v] of Object.entries(EVENT_SFX)) for (const id of idsIn(v)) ok(sfxIds.has(id), `events.sfx.${ev}: 効果音 ${id} が無い`);
for (const [ev, v] of Object.entries(EVENT_JINGLE)) for (const id of idsIn(v)) ok(jingleIds.has(id), `events.jingle.${ev}: ジングル ${id} が無い`);
for (const t of [WEAPON_SFX, SKILL_SFX.element, SKILL_SFX.kind, SKILL_SFX.motion, SKILL_SFX.projectile, SKILL_SFX.weapon, STATUS_SFX, CLIMB, MOB_SIZE, MOB_MOTION]) {
  for (const [k, id] of Object.entries(t)) if (typeof id === 'string') ok(sfxIds.has(id), `対応表 ${k}: 効果音 ${id} が無い`);
}
ok(sfxIds.has(SKILL_SFX.default), 'skillSfx.default が無い');
const ge = read('Core/Game/GameEvents.cs');
if (ge) {
  const body = /enum GameEventType\s*\{([\s\S]*?)\n\s*\}/.exec(ge)[1].replace(/\/\/.*$/gm, '');
  const names = body.split(/[\s,]+/).filter((x) => /^[A-Z]\w*$/.test(x));
  ok(names.length > 50, `GameEventType が読めない（${names.length} 個）`);
  for (const n of names) ok(n in EVENT_SFX, `events.sfx に GameEventType.${n} が無い（鳴らさないなら null と書く）`);
  for (const k of Object.keys(EVENT_SFX)) ok(names.includes(k), `events.sfx の ${k} は GameEventType に無い`);
  console.log(`  GameEventType ${names.length} 個 → 効果音の対応 ${Object.values(EVENT_SFX).filter((v) => v != null).length} 個・ジングル ${Object.keys(EVENT_JINGLE).length} 個`);
}
const fm = read('Core/Combat/Formulas.cs');
if (fm) for (const [, w] of fm.matchAll(/Type = "([^"]+)"/g)) ok(WEAPON_SFX[w] && SKILL_SFX.weapon[w], `武器 ${w} の音が weaponSfx / skillSfx.weapon に無い`);
const sk = read('Data/skills.json');
if (sk) {
  for (const s of JSON.parse(sk).skills) {
    if (s.element) ok(SKILL_SFX.element[s.element], `スキル ${s.id} の属性 ${s.element} の音が無い`);
    if (s.motion) ok(SKILL_SFX.motion[s.motion], `スキル ${s.id} の動き ${s.motion} の音が無い`);
  }
}
for (const k of ['poison', 'stun', 'darkness', 'seal', 'curse', 'weak', 'freeze', 'sleep', 'slow', 'polymorph', 'confuse']) ok(STATUS_SFX[k], `状態異常 ${k} の音が無い`);
console.log(`  効果音 ${sfxIds.size} 個・ジングル ${jingleIds.size} 曲`);

console.log(`\n${checks} 件中 ${checks - fails} 件 OK${fails ? `、${fails} 件 NG` : ''}`);
process.exit(fails ? 1 : 0);
