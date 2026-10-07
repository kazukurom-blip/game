// 効果音を書き出す道具。
// 実行: node classic/tools/render_sfx.mjs [--sfx=jump,coin|all]   （既定は all）
// しくみ: playwright の chromium で classic/src/audio/sfx.js の SFX[id] を OfflineAudioContext で鳴らし、
//   後ろの無音を切って（-50dB まで下がったところ、または SFX_INFO の len 秒まで）最後をなめらかに消し、モノラルにする。
//   大きさは SFX_INFO[id].peak（dBFS）にそろえる（UI は小さく、ボス登場は大きく）。
// 出力: classic-unity/Audio/SFX/<id>.ogg（モノラル 44.1kHz）と audio_manifest.json の sfx の欄

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, withBrowser, splitStereo, peakOf, db, undb, wavFile, ffmpeg, rel } from './lib/audio_render.mjs';
import { SFX_INFO } from '../src/audio/sfx.js';
import { updateManifest } from './lib/audio_manifest.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const WANT = arg('sfx', 'all');
const IDS = WANT === 'all' ? Object.keys(SFX_INFO) : WANT.split(',');
const OUT = path.join(ROOT, 'classic-unity/Audio/SFX');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-'));
const SR = 44100, MAX_SEC = 4;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const results = {};
  await withBrowser(async (page, takeUpload) => {
    for (const id of IDS) {
      const info = SFX_INFO[id];
      if (!info) throw new Error(`効果音が無い: ${id}`);
      await page.evaluate(async ({ sid, sr, sec }) => {
        const { SFX } = await import('/classic/src/audio/sfx.js');
        const { engineFor, makeReverb } = await import('/classic/src/audio/synth.js');
        const ctx = new OfflineAudioContext(2, Math.ceil(sr * sec), sr);
        const S = engineFor(ctx);
        const bus = ctx.createGain();
        const rev = makeReverb(S, 0.9, 3.5), send = ctx.createGain(); send.gain.value = 0.12; // 少しだけ響き
        bus.connect(ctx.destination); bus.connect(send); send.connect(rev); rev.connect(ctx.destination);
        SFX[sid](S, bus, 0.01);
        const buf = await ctx.startRendering();
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        const f = new Float32Array(L.length * 2);
        for (let i = 0; i < L.length; i++) { f[i * 2] = L[i]; f[i * 2 + 1] = R[i]; }
        await fetch('/__upload', { method: 'POST', body: f.buffer });
      }, { sid: id, sr: SR, sec: MAX_SEC });
      const [L, R] = splitStereo(takeUpload());
      const mono = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) mono[i] = 0.5 * (L[i] + R[i]);
      const pk = peakOf([mono]);
      if (pk < 1e-4) throw new Error(`${id}: 音が出ていない`);
      // 後ろの無音を切る（-50dB まで下がったところ、または len 秒まで）。最後の 2 割（最大 0.3 秒）はなめらかに消す
      const th = pk * undb(-50);
      let end = mono.length - 1;
      while (end > 0 && Math.abs(mono[end]) < th) end--;
      end = Math.min(mono.length, end + Math.round(SR * 0.02), Math.round(SR * (info.len || MAX_SEC)));
      const d = mono.slice(0, end);
      const fo = Math.min(Math.round(d.length * 0.2), Math.round(SR * 0.3));
      for (let j = 0; j < fo; j++) { const x = 1 - (j + 1) / fo; d[d.length - fo + j] *= x * x; }
      d[0] = 0;
      const g = undb(info.peak) / peakOf([d]);
      for (let i = 0; i < d.length; i++) d[i] *= g;
      const wav = path.join(TMP, `${id}.wav`);
      fs.writeFileSync(wav, wavFile([d], SR));
      const ogg = path.join(OUT, `${id}.ogg`);
      ffmpeg(['-i', wav, '-c:a', 'libvorbis', '-q:a', '5', '-metadata', `title=${id}`, ogg]);
      results[id] = { file: `SFX/${id}.ogg`, desc: info.desc, seconds: +(d.length / SR).toFixed(3), peakDb: info.peak, bytes: fs.statSync(ogg).size };
      console.log(`${id.padEnd(14)} ${(d.length / SR).toFixed(2)} 秒 最大 ${db(peakOf([d])).toFixed(1)} dBFS → ${rel(ogg)} (${(fs.statSync(ogg).size / 1e3).toFixed(1)} KB)  ${info.desc}`);
    }
  });
  updateManifest({ sfx: results });
  fs.rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
