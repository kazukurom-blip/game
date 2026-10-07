// BGM を WAV（と MP3・OGG）に書き出す道具。
// 実行: node classic/tools/render_bgm.mjs [--song=town_beginner] [--no-compress]
//   PORT=8711 専用（他の道具とぶつからないように）。PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
// しくみ: 小さな静的サーバー → playwright の chromium で classic/src/audio/bgm.js の renderSong を
// OfflineAudioContext で動かす → 16bit の音をサーバーへ送る → WAV（ループ位置つき）に書く → ffmpeg で MP3/OGG。
// 出力: classic/assets/audio/preview/<曲>.wav（イントロ＋ループ 1 周。ループは loopStart〜末尾）

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'classic/assets/audio/preview');
const PORT = 8711;
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const SONG = arg('song', 'town_beginner');
const COMPRESS = !process.argv.includes('--no-compress');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* 次へ */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* 次へ */ } }
  throw new Error('playwright が見つかりません');
}

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
let upload = null;
const PAGE = '<!doctype html><meta charset="utf-8"><title>render</title><body>render</body>';

function startServer() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (u.pathname === '/__render.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
    if (u.pathname === '/__upload' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { upload = Buffer.concat(chunks); res.writeHead(200); res.end('ok'); });
      return;
    }
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, '127.0.0.1', () => r(srv)); });
}

// 16bit ステレオの WAV。smpl チャンクにループ位置を書く（ゲーム機の音源・多くの再生ソフトが読む）
function wavFile(pcm, sr, loopStart, loopEnd) {
  const data = pcm.length;
  const smpl = Buffer.alloc(8 + 36 + 24);
  smpl.write('smpl', 0); smpl.writeUInt32LE(36 + 24, 4);
  smpl.writeUInt32LE(Math.round(1e9 / sr), 8 + 8); // サンプルの長さ(ns)
  smpl.writeUInt32LE(60, 8 + 12);
  smpl.writeUInt32LE(1, 8 + 28); // ループ 1 つ
  smpl.writeUInt32LE(0, 8 + 36 + 4); // 前向き
  smpl.writeUInt32LE(loopStart, 8 + 36 + 8);
  smpl.writeUInt32LE(loopEnd, 8 + 36 + 12);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data + smpl.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data, 40);
  return Buffer.concat([h, pcm, smpl]);
}

async function main() {
  const srv = await startServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/__render.html`);
    const t0 = Date.now();
    const info = await page.evaluate(async (id) => {
      const { renderSong } = await import('/classic/src/audio/bgm.js');
      const { SONGS } = await import('/classic/src/audio/songs/index.js');
      const song = SONGS[id];
      if (!song) throw new Error(`曲が無い: ${id}`);
      const r = await renderSong(song);
      const n = r.length, L = r.left, R = r.right;
      let peak = 0, clip = 0;
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) {
        for (const [k, v] of [[0, L[i]], [1, R[i]]]) {
          const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clip++;
          pcm[i * 2 + k] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
        }
      }
      // 区間ごとの大きさ（RMS, dB）
      const secs = [];
      const step = Math.round(r.sampleRate * 10);
      for (let s = 0; s < n; s += step) {
        let sum = 0; const e = Math.min(n, s + step);
        for (let i = s; i < e; i++) sum += L[i] * L[i] + R[i] * R[i];
        secs.push(+(10 * Math.log10(sum / (2 * (e - s)) + 1e-12)).toFixed(1));
      }
      // つなぎ目（末尾→ループの頭）の段差
      const jump = Math.max(Math.abs(L[n - 1] - L[r.loopStart]), Math.abs(R[n - 1] - R[r.loopStart]));
      await fetch('/__upload', { method: 'POST', body: pcm.buffer });
      return { sr: r.sampleRate, n, loopStart: r.loopStart, introLen: r.introLen, loopLen: r.loopLen, peak, clip, secs, jump, title: song.title };
    }, SONG);
    if (!upload) throw new Error('音が届かなかった');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const wav = path.join(OUT_DIR, `${SONG}.wav`);
    fs.writeFileSync(wav, wavFile(upload, info.sr, info.loopStart, info.n - 1));
    const total = info.n / info.sr;
    console.log(`曲: ${SONG}「${info.title}」  書き出しにかかった時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
    console.log(`長さ ${total.toFixed(2)} 秒（イントロ ${info.introLen.toFixed(2)} 秒 + ループ ${info.loopLen.toFixed(2)} 秒）  ループ開始 ${info.loopStart} サンプル目`);
    console.log(`最大 ${(20 * Math.log10(info.peak)).toFixed(2)} dBFS  音割れ ${info.clip} サンプル  つなぎ目の段差 ${info.jump.toFixed(4)}`);
    console.log(`10 秒ごとの大きさ(dB): ${info.secs.join(' ')}`);
    console.log(`→ ${path.relative(ROOT, wav)} (${(fs.statSync(wav).size / 1e6).toFixed(1)} MB)`);
    if (COMPRESS) {
      const tags = ['-metadata', `title=${info.title}`, '-metadata', `LOOPSTART=${info.loopStart}`, '-metadata', `LOOPLENGTH=${info.n - info.loopStart}`];
      for (const [ext, codec] of [['mp3', ['-c:a', 'libmp3lame', '-b:a', '192k']], ['ogg', ['-c:a', 'libvorbis', '-q:a', '5']]]) {
        const out = path.join(OUT_DIR, `${SONG}.${ext}`);
        const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, ...codec, ...tags, out], { stdio: 'inherit' });
        if (r.status === 0) console.log(`→ ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
        else console.log(`(${ext} は作れなかった: ffmpeg が無い？)`);
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
