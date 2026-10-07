// 音の書き出し道具（render_bgm.mjs / render_sfx.mjs）の共通部分。
// - 小さな静的サーバー（PORT=8711）と playwright の chromium でブラウザの OfflineAudioContext を動かす
// - ブラウザから届いた Float32 の音（L R を交互）を受け取る
// - WAV（16bit、ループ位置つき）を書く・ffmpeg で圧縮する・ffmpeg で読み戻す

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const PORT = 8711;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* 次へ */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* 次へ */ } }
  throw new Error('playwright が見つかりません');
}

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const PAGE = '<!doctype html><meta charset="utf-8"><title>render</title><body>render</body>';

// ブラウザを開いて fn(page, takeUpload) を動かす。takeUpload() は最後に届いた音（Buffer）を返す
export async function withBrowser(fn) {
  let upload = null;
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
  await new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, '127.0.0.1', r); });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/__render.html`);
    return await fn(page, () => { const u = upload; upload = null; if (!u) throw new Error('音が届かなかった'); return u; });
  } finally {
    await browser.close();
    srv.close();
  }
}

// Float32（L R 交互）→ [Float32Array L, Float32Array R]
export function splitStereo(buf) {
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = f.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[i * 2]; R[i] = f[i * 2 + 1]; }
  return [L, R];
}

export const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
export const undb = (d) => Math.pow(10, d / 20);
export function peakOf(chs) { let p = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; } return p; }
export function rmsOf(chs) { let s = 0, n = 0; for (const c of chs) { for (let i = 0; i < c.length; i++) s += c[i] * c[i]; n += c.length; } return Math.sqrt(s / Math.max(1, n)); }

// 16bit の WAV。loop を渡すと smpl チャンクにループ位置を書く
export function wavFile(chs, sr, loop = null) {
  const nch = chs.length, n = chs[0].length;
  const pcm = Buffer.alloc(n * nch * 2);
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chs[c][i] * 32767))), (i * nch + c) * 2);
  let smpl = Buffer.alloc(0);
  if (loop) {
    smpl = Buffer.alloc(8 + 36 + 24);
    smpl.write('smpl', 0); smpl.writeUInt32LE(36 + 24, 4);
    smpl.writeUInt32LE(Math.round(1e9 / sr), 8 + 8);
    smpl.writeUInt32LE(60, 8 + 12);
    smpl.writeUInt32LE(1, 8 + 28);
    smpl.writeUInt32LE(0, 8 + 36 + 4);
    smpl.writeUInt32LE(loop[0], 8 + 36 + 8);
    smpl.writeUInt32LE(loop[1], 8 + 36 + 12);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length + smpl.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(nch, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * nch * 2, 28); h.writeUInt16LE(nch * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm, smpl]);
}

export function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 30 });
  if (r.error) throw new Error('ffmpeg が無い: ' + r.error.message);
  if (r.status !== 0) throw new Error('ffmpeg が失敗: ' + args.join(' '));
  return r.stdout;
}

// ---------------------------------------------------------------- つなぎ目の検査（書き出しとテストで同じものを使う）
const rmsRange = (c, a, b) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const d2max = (c, a, b) => { let m = 0; for (let i = Math.max(2, a); i < b; i++) m = Math.max(m, Math.abs(c[i] - 2 * c[i - 1] + c[i - 2])); return m; };
// a の終わりのあとに b の頭が続くときのつなぎ目の様子
//   err: つなぎ目での 2 階差分（直前 2 つの音から予想した値とのずれ）
//   ref: つなぎ目の前後 20ms の中の 2 階差分の最大（ふつうの揺れ）。プチ音なら err がこれを大きく超える
//   lo:  つなぎ目の前後 20ms の大きさ（曲全体の RMS との差, dB）。途切れるとここが下がる
export function seam(a, b, sr, wholeDb) {
  let err = 0, ref = 0, lo = 0;
  const w = Math.round(sr * 0.02);
  for (let k = 0; k < a.length; k++) {
    const A = a[k], B = b[k], n = A.length;
    err = Math.max(err, Math.abs(B[0] - 2 * A[n - 1] + A[n - 2]), Math.abs(B[1] - 2 * B[0] + A[n - 1]));
    ref = Math.max(ref, d2max(A, n - w, n), d2max(B, 2, w));
    lo = Math.min(lo, db(rmsRange(A, n - w, n) + 1e-6) - wholeDb, db(rmsRange(B, 0, w) + 1e-6) - wholeDb);
  }
  return { err: +err.toFixed(5), ref: +ref.toFixed(5), lo: +lo.toFixed(1) };
}
// 圧縮前の音: ずれが前後のふつうの揺れの 1.5 倍まで
export const seamOkPcm = (s) => s.err <= Math.max(1.5 * s.ref, 0.002);
// 圧縮後の音: Vorbis はファイルの頭と終わりで少しずれる（外を無音として圧縮するため）ので 0.02（-34dBFS）までは許す
export const seamOkCodec = (s) => s.err <= Math.max(1.5 * s.ref, 0.02);

// 圧縮した音を読み戻す（32bit float、元のチャンネル数）→ { chs, sr }
export function decode(file) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels,sample_rate', '-of', 'json', file], { encoding: 'utf8' });
  const st = JSON.parse(probe.stdout).streams[0];
  const nch = Number(st.channels), sr = Number(st.sample_rate);
  const raw = ffmpeg(['-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-']);
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = f.length / nch;
  const chs = Array.from({ length: nch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) chs[c][i] = f[i * nch + c];
  return { chs, sr };
}

export const rel = (p) => path.relative(ROOT, p);
export const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(2);
