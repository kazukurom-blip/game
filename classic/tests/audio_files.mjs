// 書き出した音のファイルの検査（ffmpeg で読み戻して確かめる）。実行: node classic/tests/audio_files.mjs
// - 一覧 classic-unity/Audio/audio_manifest.json のファイルがすべてある・大きすぎない（BGM 1 曲 2MB まで、どれも 5MB まで）
// - 音が割れていない: 最大が -1dBFS 以下（BGM・イントロ・効果音・試聴 mp3）
// - BGM のループが 60〜120 秒で、長さが一覧の数と合う
// - ループのつなぎ目（末尾 → 頭）とイントロ → ループの境目にプチ音が無い:
//     つなぎ目の「予測からのずれ」（2 階差分）が、つなぎ目の前後 20ms の中のふつうの揺れの 1.5 倍を超えない
//       （圧縮前の音＝書き出しのときに一覧へ書いた値で確かめる。読み戻した ogg は Vorbis の頭と終わりの
//        わずかなずれがあるので、0.02（-34dBFS）までは許す）
//     つなぎ目の前後 20ms が曲全体の大きさより 24dB 以上小さくならない（音が途切れない）
// - 効果音は 4 秒以内、頭と終わりがほぼ無音（鳴らし始め・終わりにプチ音が出ない）
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, decode, peakOf, db, seam, seamOkPcm, seamOkCodec } from '../tools/lib/audio_render.mjs';
import { MANIFEST } from '../tools/lib/audio_manifest.mjs';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  NG', msg); } return cond; };
const PEAK_MAX = -1;

if (!fs.existsSync(MANIFEST)) { console.log('一覧が無い:', MANIFEST); process.exit(1); }
const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const base = path.dirname(MANIFEST);

const rms = (c, a, b) => { let t = 0; for (let i = a; i < b; i++) t += c[i] * c[i]; return Math.sqrt(t / Math.max(1, b - a)); };

console.log('BGM');
let total = 0;
for (const [id, e] of Object.entries(man.bgm || {})) {
  const f = path.join(base, e.file);
  if (!ok(fs.existsSync(f), `${id}: ${e.file} が無い`)) continue;
  const size = fs.statSync(f).size + (e.intro && fs.existsSync(path.join(base, e.intro)) ? fs.statSync(path.join(base, e.intro)).size : 0);
  total += size;
  ok(size <= 2e6, `${id}: ${(size / 1e6).toFixed(2)} MB（2MB まで）`);
  const { chs, sr } = decode(f);
  const n = chs[0].length, sec = n / sr;
  ok(sec >= 60 && sec <= 120, `${id}: ループ ${sec.toFixed(1)} 秒（60〜120 秒）`);
  ok(Math.abs(n - e.loopSamples) <= 1, `${id}: 読み戻した長さ ${n} ≠ 一覧の ${e.loopSamples}`);
  const pk = db(peakOf(chs));
  ok(pk <= PEAK_MAX, `${id}: 最大 ${pk.toFixed(2)} dBFS（${PEAK_MAX} 以下のはず）`);
  const whole = db(Math.sqrt(chs.reduce((t, c) => t + rms(c, 0, c.length) ** 2, 0) / chs.length));
  const s = seam(chs, chs, sr, whole);
  ok(seamOkCodec(s), `${id}: ループのつなぎ目のずれ ${s.err.toFixed(4)}（前後のふつうの揺れは ${s.ref.toFixed(4)} まで）`);
  ok(s.lo >= -24, `${id}: ループのつなぎ目で音が途切れる（前後 20ms が曲全体より ${(-s.lo).toFixed(1)} dB 小さい）`);
  let line = `  ${id.padEnd(14)} ループ ${sec.toFixed(2)} 秒 最大 ${pk.toFixed(2)} dBFS つなぎ目 ずれ ${s.err.toFixed(4)}/前後 ${s.ref.toFixed(4)} 大きさ ${s.lo.toFixed(1)}dB`;
  if (e.intro) {
    const fi = path.join(base, e.intro);
    if (ok(fs.existsSync(fi), `${id}: ${e.intro} が無い`)) {
      const I = decode(fi);
      ok(Math.abs(I.chs[0].length - e.introSamples) <= 1, `${id}: イントロの長さ ${I.chs[0].length} ≠ ${e.introSamples}`);
      const pi = db(peakOf(I.chs));
      ok(pi <= PEAK_MAX, `${id}: イントロの最大 ${pi.toFixed(2)} dBFS`);
      const si = seam(I.chs, chs, sr, whole);
      ok(seamOkCodec(si), `${id}: イントロ → ループの境目のずれ ${si.err.toFixed(4)}（前後 ${si.ref.toFixed(4)} まで）`);
      ok(si.lo >= -24, `${id}: イントロ → ループの境目で音が途切れる（${si.lo.toFixed(1)} dB）`);
      line += ` / イントロ→ループ ずれ ${si.err.toFixed(4)}/前後 ${si.ref.toFixed(4)} 大きさ ${si.lo.toFixed(1)}dB`;
    }
  }
  // 圧縮前の音のつなぎ目（書き出しのときに測って一覧に書いた値）は、もっときびしく
  const sp = e.seamPcm || {};
  ok(sp.loop && seamOkPcm(sp.loop) && sp.loop.lo >= -24, `${id}: 圧縮前のループのつなぎ目 ${JSON.stringify(sp.loop)}`);
  if (e.intro) ok(sp.intro && seamOkPcm(sp.intro) && sp.intro.lo >= -24, `${id}: 圧縮前のイントロ → ループ ${JSON.stringify(sp.intro)}`);
  line += `\n                 圧縮前: ループ ずれ ${sp.loop?.err}/前後 ${sp.loop?.ref}${sp.intro ? ` / イントロ→ループ ずれ ${sp.intro.err}/前後 ${sp.intro.ref}` : ''}`;
  console.log(line);
  const prev = path.join(ROOT, 'classic/assets/audio/preview', `${id}.mp3`);
  if (ok(fs.existsSync(prev), `${id}: 試聴 mp3 が無い`)) {
    const P = decode(prev);
    const pp = db(peakOf(P.chs));
    ok(pp <= PEAK_MAX, `${id}: 試聴 mp3 の最大 ${pp.toFixed(2)} dBFS`);
    ok(Math.abs(P.chs[0].length / P.sr - 30) < 1, `${id}: 試聴 mp3 が ${(P.chs[0].length / P.sr).toFixed(1)} 秒（30 秒のはず）`);
  }
}

console.log('効果音');
for (const [id, e] of Object.entries(man.sfx || {})) {
  const f = path.join(base, e.file);
  if (!ok(fs.existsSync(f), `${id}: ${e.file} が無い`)) continue;
  total += fs.statSync(f).size;
  const { chs, sr } = decode(f);
  const n = chs[0].length;
  const pk = db(peakOf(chs));
  ok(pk <= PEAK_MAX, `${id}: 最大 ${pk.toFixed(2)} dBFS`);
  ok(n / sr <= 4, `${id}: ${(n / sr).toFixed(2)} 秒（4 秒まで）`);
  const head = Math.max(...chs.map((c) => Math.abs(c[0]))), tail = Math.max(...chs.map((c) => Math.abs(c[n - 1])));
  ok(head < 0.01 && tail < 0.01, `${id}: 頭 ${head.toFixed(4)} / 終わり ${tail.toFixed(4)} が無音でない`);
  console.log(`  ${id.padEnd(14)} ${(n / sr).toFixed(2)} 秒 最大 ${pk.toFixed(2)} dBFS`);
}
for (const f of [MANIFEST, ...fs.readdirSync(path.join(base, 'BGM')).map((x) => path.join(base, 'BGM', x)), ...(fs.existsSync(path.join(base, 'SFX')) ? fs.readdirSync(path.join(base, 'SFX')).map((x) => path.join(base, 'SFX', x)) : [])]) {
  ok(fs.statSync(f).size <= 5e6, `${path.relative(ROOT, f)} が 5MB を超える`);
}
for (const [id, fb] of Object.entries(man.bgmFallback || {})) ok(man.bgm[fb], `代わりの曲 ${id} → ${fb} が無い`);

console.log(`\n合計 ${(total / 1e6).toFixed(2)} MB`);
console.log(`${checks} 件中 ${checks - fails} 件 OK${fails ? `、${fails} 件 NG` : ''}`);
process.exit(fails ? 1 : 0);
