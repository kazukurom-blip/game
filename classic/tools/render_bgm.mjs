// BGM を書き出す道具。
// 実行: node classic/tools/render_bgm.mjs [--song=town_beginner|all]   （既定は all）
//   PORT=8711 専用（他の道具とぶつからないように）。PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
// しくみ: playwright の chromium で classic/src/audio/bgm.js の renderSong を OfflineAudioContext で動かし、
//   イントロ → ループ → ループ を続けて鳴らした音を受け取る。2 周目のループをループ部分に使う
//   （頭に 1 周目の残響が入っているので、くり返してもつなぎ目が切れない）。
//   ループの最後の 50ms とイントロの最後の 50ms は、どちらも 1 周目の終わり（そのまま 2 周目の頭へ続く音）へ
//   なめらかに移す。これでループの末尾 → 頭、イントロ → ループの境目がサンプル単位でつながる。
//   曲ごとに大きさをそろえる（ループの RMS を -16dBFS に、ただし最大は -2dBFS まで）。
// 出力:
//   classic-unity/Audio/BGM/<id>.ogg         ループ部分だけ（Unity の AudioSource.loop でそのままくり返せる）
//   classic-unity/Audio/BGM/<id>_intro.ogg   イントロ（あれば。鳴らし終わりにループを PlayScheduled でつなぐ）
//   classic/assets/audio/preview/<id>.mp3     試聴用 30 秒（イントロから、最後 2 秒で消える）
//   classic/assets/audio/preview/<id>.wav     イントロ＋ループ 1 周（ループ位置の smpl つき。git には入れない）
//   classic-unity/Audio/audio_manifest.json  の bgm の欄（render_sfx.mjs と同じファイルを更新する）

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, withBrowser, splitStereo, peakOf, rmsOf, db, undb, wavFile, ffmpeg, rel, mb, seam, seamOkPcm } from './lib/audio_render.mjs';
import { SONGS } from '../src/audio/songs/index.js';
import { updateManifest, mapsUsingBgm } from './lib/audio_manifest.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const WANT = arg('song', 'all');
const IDS = WANT === 'all' ? Object.keys(SONGS) : WANT.split(',');
const UNITY_DIR = path.join(ROOT, 'classic-unity/Audio/BGM');
const PREVIEW_DIR = path.join(ROOT, 'classic/assets/audio/preview');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bgm-'));
const PEAK_DB = -2, RMS_DB = -16, XF = 0.05, PREVIEW_SEC = 30, MAX_BYTES = 2e6;

// ogg にする。大きすぎたら質を下げる
function encodeOgg(chs, sr, out, tags) {
  const wav = path.join(TMP, 'x.wav');
  fs.writeFileSync(wav, wavFile(chs, sr));
  for (const q of [4, 3, 2, 1]) {
    ffmpeg(['-i', wav, '-c:a', 'libvorbis', '-q:a', String(q), ...tags, out]);
    if (fs.statSync(out).size <= MAX_BYTES) return q;
  }
  return 1;
}

async function main() {
  fs.mkdirSync(UNITY_DIR, { recursive: true });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const results = {};
  await withBrowser(async (page, takeUpload) => {
    for (const id of IDS) {
      const song = SONGS[id];
      if (!song) throw new Error(`曲が無い: ${id}`);
      const t0 = Date.now();
      const info = await page.evaluate(async (sid) => {
        const { renderSong } = await import('/classic/src/audio/bgm.js');
        const { SONGS: all } = await import('/classic/src/audio/songs/index.js');
        const r = await renderSong(all[sid]);
        const f = new Float32Array(r.length * 2);
        for (let i = 0; i < r.length; i++) { f[i * 2] = r.left[i]; f[i * 2 + 1] = r.right[i]; }
        await fetch('/__upload', { method: 'POST', body: f.buffer });
        return { sr: r.sampleRate, introLen: r.introLen, loopLen: r.loopLen };
      }, id);
      const [FL, FR] = splitStereo(takeUpload());
      const sr = info.sr;
      const nI = Math.round(info.introLen * sr), nL = Math.round(info.loopLen * sr);
      const ls = Math.round((info.introLen + info.loopLen) * sr);
      // ループの最後の 50ms は 1 周目の終わり（＝そのまま 2 周目の頭へ続く音）へなめらかに移す。
      // 1 周目と 2 周目は同じ楽譜だが、Chrome では音の始まりが数サンプルずれることがあり、そのままだと末尾 → 頭でプチ音が出る
      const xfL = Math.round(XF * sr);
      const loop = [FL, FR].map((c) => {
        const d = c.slice(ls, ls + nL);
        for (let j = 0; j < xfL; j++) { const w = (j + 1) / xfL; d[nL - xfL + j] = (1 - w) * c[ls + nL - xfL + j] + w * c[ls - xfL + j]; }
        return d;
      });
      let intro = null;
      if (nI > 0) {
        const xf = Math.min(nI, Math.round(XF * sr));
        intro = [FL, FR].map((c) => {
          const d = c.slice(0, nI);
          for (let j = 0; j < xf; j++) { const w = (j + 1) / xf; d[nI - xf + j] = (1 - w) * c[nI - xf + j] + w * c[ls - xf + j]; }
          return d;
        });
      }
      // 大きさをそろえる
      const both = intro ? [...intro, ...loop] : loop;
      const g = Math.min(undb(PEAK_DB) / peakOf(both), undb(RMS_DB) / rmsOf(loop));
      for (const c of both) for (let i = 0; i < c.length; i++) c[i] *= g;
      // つなぎ目の検査（圧縮前）。通らなければ止める
      const wholeDb = db(rmsOf(loop));
      const seamLoop = seam(loop, loop, sr, wholeDb), seamIntro = intro ? seam(intro, loop, sr, wholeDb) : null;
      for (const [name, sm] of [['ループの末尾 → 頭', seamLoop], ['イントロ → ループ', seamIntro]]) {
        if (sm && (!seamOkPcm(sm) || sm.lo < -24)) throw new Error(`${id}: ${name} のつなぎ目がなめらかでない ${JSON.stringify(sm)}`);
      }
      const combined = intro ? [0, 1].map((k) => { const d = new Float32Array(nI + nL); d.set(intro[k], 0); d.set(loop[k], nI); return d; }) : loop;
      const tags = ['-metadata', `title=${song.title}`];

      const loopOgg = path.join(UNITY_DIR, `${id}.ogg`);
      const q = encodeOgg(loop, sr, loopOgg, tags);
      const introOgg = path.join(UNITY_DIR, `${id}_intro.ogg`);
      if (intro) encodeOgg(intro, sr, introOgg, tags); else if (fs.existsSync(introOgg)) fs.rmSync(introOgg);
      const wav = path.join(PREVIEW_DIR, `${id}.wav`);
      fs.writeFileSync(wav, wavFile(combined, sr, [nI, nI + nL - 1]));
      const mp3 = path.join(PREVIEW_DIR, `${id}.mp3`);
      const pl = Math.min(PREVIEW_SEC, (nI + nL) / sr);
      ffmpeg(['-i', wav, '-t', String(pl), '-af', `afade=t=out:st=${pl - 2}:d=2`, '-c:a', 'libmp3lame', '-b:a', '128k', ...tags, mp3]);
      const oldOgg = path.join(PREVIEW_DIR, `${id}.ogg`); // 前の版の試聴 ogg（Unity 側へ移した）
      if (fs.existsSync(oldOgg)) fs.rmSync(oldOgg);

      results[id] = {
        title: song.title, file: `BGM/${id}.ogg`, intro: intro ? `BGM/${id}_intro.ogg` : null,
        bpm: song.meter === '6/8' ? `${Math.round(song.bpm / 3)} (付点4分)` : song.bpm, meter: song.meter || `${song.beatsPerBar}/4`, key: song.key,
        introSeconds: +(nI / sr).toFixed(3), loopSeconds: +(nL / sr).toFixed(3), introSamples: nI, loopSamples: nL, sampleRate: sr,
        seamPcm: { loop: seamLoop, intro: seamIntro },
        bytes: fs.statSync(loopOgg).size + (intro ? fs.statSync(introOgg).size : 0),
        maps: mapsUsingBgm(id),
      };
      console.log(`${id}「${song.title}」 ${((Date.now() - t0) / 1000).toFixed(1)} 秒で書き出し / イントロ ${(nI / sr).toFixed(2)} 秒 + ループ ${(nL / sr).toFixed(2)} 秒`);
      console.log(`  つなぎ目（圧縮前） ループ ずれ ${seamLoop.err}/前後 ${seamLoop.ref}${seamIntro ? ` / イントロ→ループ ずれ ${seamIntro.err}/前後 ${seamIntro.ref}` : ''}`);
      console.log(`  大きさ ×${g.toFixed(2)} → 最大 ${db(peakOf(both)).toFixed(2)} dBFS, ループ RMS ${db(rmsOf(loop)).toFixed(1)} dBFS / ogg q${q}`);
      console.log(`  → ${rel(loopOgg)} (${mb(loopOgg)} MB)${intro ? `, ${rel(introOgg)} (${mb(introOgg)} MB)` : ''}, ${rel(mp3)} (${mb(mp3)} MB)`);
    }
  });
  updateManifest({ bgm: results });
  fs.rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
