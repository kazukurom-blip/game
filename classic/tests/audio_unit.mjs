// 曲のデータの検査（ブラウザ不要）。実行: node classic/tests/audio_unit.mjs
// - 小節ごとの拍の数が拍子と合う / パートの小節数が和音の小節数と合う
// - 音がパートの音域（range）に収まる / 楽器・太鼓の名前が音源にある
// - ループ 1 周が 60〜120 秒、イントロは 15 秒まで
import { noteToMidi, parseDur, barBeats, parseChord, compileSong, midiToName, expandPart } from '../src/audio/score.js';
import { INSTRUMENTS, DRUMS } from '../src/audio/synth.js';
import { SONGS } from '../src/audio/songs/index.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  NG', msg); } };

// 部品
ok(noteToMidi('C4') === 60 && noteToMidi('A4') === 69 && noteToMidi('F#5') === 78 && noteToMidi('Bb5') === 82, '音の名前 → MIDI 番号');
ok(parseDur('q.').beats === 1.5 && parseDur('et').beats === 1 / 3 && parseDur('h~').tie, '長さの読み方');
ok(barBeats('F#5:q. A5:e D6:q C#6:e B5:e') === 4, '1 小節の拍');
ok(parseChord('D/A').bass === 9 && parseChord('Gm6').pcs.join() === '7,10,2,4', '和音の読み方');

for (const [id, song] of Object.entries(SONGS)) {
  console.log(`曲 ${id}「${song.title}」 ${song.bpm} BPM ${song.beatsPerBar}/4`);
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
  ok(c.loop.len >= 60 && c.loop.len <= 120, `ループ 1 周が ${c.loop.len.toFixed(1)} 秒（60〜120 秒のはず）`);
  ok(c.intro.len <= 15, `イントロが ${c.intro.len.toFixed(1)} 秒（15 秒まで）`);
  ok(c.loop.bars % 4 === 0, `ループの小節数 ${c.loop.bars} が 4 の倍数でない`);
  for (const seg of [c.intro, c.loop]) {
    for (const e of seg.events) {
      ok(Number.isFinite(e.t) && Number.isFinite(e.d) && Number.isFinite(e.vel) && e.d > 0 && e.vel > 0, `おかしな音: ${JSON.stringify(e)}`);
      ok(e.t < seg.len, `区間の外の音: t=${e.t}`);
      if (e.midi == null) ok(DRUMS[e.inst], `太鼓 ${e.inst} が音源に無い`);
    }
    for (let i = 1; i < seg.events.length; i++) ok(seg.events[i].t >= seg.events[i - 1].t, '音が時間順でない');
  }
  // メロディの歌いやすさ（1 オクターブを超える跳び・同じ高さが 6 回以上続く、が無いこと）
  const mel = Object.entries(song.tracks).find(([, t]) => t.melody || t.inst === 'flute');
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

console.log(`\n${checks} 件中 ${checks - fails} 件 OK${fails ? `、${fails} 件 NG` : ''}`);
process.exit(fails ? 1 : 0);
