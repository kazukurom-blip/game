#!/usr/bin/env node
// スプライトのテンプレート書き出し（今のコード描画の絵を SPEC_SPRITES.md のコマ割りで PNG にする）
//   npm run export:sprites
//   node tools/export_sprites.mjs [--only=chars,presets,enemies,pets] [--out=assets/sprites_template] [--no-guides] [--gray-guides] [--jobs=4]
// 出力: <out>/enemies/<id>.png, bosses/<id>.png, pets/<style>.png, chars/...（レイヤー別）, presets/<class>_<gender>.png
//       各 PNG の _guide.png（セル枠・基準点・行名）、tint 対象は _gray.png（＋_gray_guide.png）、そのまま使える manifest.json
// しくみ: 組み込みの静的サーバーでプロジェクトを配信 → Playwright(chromium) で tools/export_sprites_page.js を読み込み → 描画 → base64 で受け取って保存
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(ROOT, arg('out', 'assets/sprites_template'));
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const GUIDES = !process.argv.includes('--no-guides');
const GRAY_GUIDES = process.argv.includes('--gray-guides');   // グレースケール版のガイド（レイアウトはカラー版と同じなので既定では出さない）
const CONC = Math.max(1, Number(arg('jobs', 4)) || 4);
const PORT = Number(process.env.EXPORT_PORT) || 8139;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules_global', '/usr/local/lib/node_modules', '/usr/lib/node_modules']
    .filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません (NODE_PATH を設定してください)');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const PAGE = '<!doctype html><meta charset="utf-8"><title>export</title><body><script type="module" src="/tools/export_sprites_page.js"></script></body>';
function startServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__export.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}

async function main() {
  const t0 = Date.now();
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const pages = [];
  for (let i = 0; i < CONC; i++) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.error('  !! pageerror', e.message));
    await p.goto(`http://127.0.0.1:${PORT}/__export.html`);
    await p.waitForFunction(() => window.EXPORT && window.EXPORT.ready, null, { timeout: 30000 });
    pages.push(p);
  }
  const jobs = await pages[0].evaluate((only) => window.EXPORT.jobs(only), ONLY);
  const meta = await pages[0].evaluate(() => ({ rows: window.EXPORT.CHAR_ROWS, fps: window.EXPORT.CHAR_FPS }));
  console.log(`書き出し: ${jobs.length} シート → ${path.relative(ROOT, OUT)}/  (並列 ${CONC})`);
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {
    version: 1,
    note: 'tools/export_sprites.mjs が書き出したテンプレート。assets/sprites/ にコピーすればそのまま使える（docs/SPEC_SPRITES.md）',
    defaults: { scale: 0.5, fps: 8 },
    enemies: {}, bosses: {}, pets: {},
    chars: { enabled: true, scale: 0.5, fps: meta.fps, rows: Object.fromEntries(meta.rows), layers: {} },
  };
  const stats = { sheets: 0, png: 0, bytes: 0, empty: 0, warn: 0, byKind: {} };
  const warns = [];
  let next = 0, done = 0;
  async function worker(page) {
    while (next < jobs.length) {
      const job = jobs[next++];
      let r;
      try { r = await page.evaluate(([j, o]) => window.EXPORT.run(j, o), [job, { guides: GUIDES, grayGuides: GRAY_GUIDES }]); } catch (e) {
        warns.push(`${job.key}: ${e.message.split('\n')[0]}`); continue;
      }
      done++;
      if (r.empty) { stats.empty++; } else {
        stats.sheets++;
        const kk = job.preset ? 'preset' : job.kind;
        stats.byKind[kk] = (stats.byKind[kk] || 0) + 1;
      }
      for (const f of r.files) {
        const p = path.join(OUT, f.path);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const buf = Buffer.from(f.b64, 'base64');
        fs.writeFileSync(p, buf);
        stats.png++; stats.bytes += buf.length;
      }
      if (r.warn && r.warn.length) { stats.warn += r.warn.length; for (const w of r.warn.slice(0, 3)) warns.push(`${job.key}: ${w}`); }
      if (r.entry && r.section) {
        if (r.section === 'chars') manifest.chars.layers[job.key] = r.entry;
        else manifest[r.section][job.key] = r.entry;
      }
      if (done % 25 === 0) console.log(`  ${done}/${jobs.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }
  await Promise.all(pages.map(worker));
  // chars の既定セル（代表: body_f）。各レイヤーは自分の cell/anchor を持つ
  const b = manifest.chars.layers.body_f;
  if (b) { manifest.chars.cell = b.cell; manifest.chars.anchor = b.anchor; }
  // 既定の rows と同じなら各レイヤーから省略
  const baseRows = JSON.stringify(manifest.chars.rows);
  for (const k of Object.keys(manifest.chars.layers)) {
    const L = manifest.chars.layers[k];
    if (JSON.stringify(L.rows) === baseRows) delete L.rows;
  }
  // キーを並べ替えて安定した出力に
  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  manifest.enemies = sortObj(manifest.enemies); manifest.bosses = sortObj(manifest.bosses); manifest.pets = sortObj(manifest.pets);
  manifest.chars.layers = sortObj(manifest.chars.layers);
  if (!Object.keys(manifest.chars.layers).length) delete manifest.chars;
  const mpath = path.join(OUT, 'manifest.json');
  // --only で一部だけ書き出したときは既存の manifest にマージ
  if (ONLY.length && fs.existsSync(mpath)) {
    try {
      const old = JSON.parse(fs.readFileSync(mpath, 'utf8'));
      for (const sec of ['enemies', 'bosses', 'pets']) manifest[sec] = { ...(old[sec] || {}), ...manifest[sec] };
      if (old.chars) manifest.chars = manifest.chars ? { ...old.chars, ...manifest.chars, layers: { ...(old.chars.layers || {}), ...manifest.chars.layers } } : old.chars;
    } catch { /* 上書き */ }
  }
  fs.writeFileSync(mpath, JSON.stringify(manifest, null, 1) + '\n');
  await browser.close();
  srv.close();
  const n = (o) => Object.keys(o || {}).length;
  console.log(`完了 ${((Date.now() - t0) / 1000).toFixed(1)}s: シート ${stats.sheets}（${JSON.stringify(stats.byKind)}）空 ${stats.empty} / PNG ${stats.png} 枚 ${(stats.bytes / 1e6).toFixed(1)}MB`);
  console.log(`manifest: enemies ${n(manifest.enemies)} / bosses ${n(manifest.bosses)} / pets ${n(manifest.pets)} / chars.layers ${n(manifest.chars?.layers)}`);
  if (warns.length) { console.log(`注意 ${stats.warn} 件（先頭のみ）:`); for (const w of warns.slice(0, 30)) console.log('  - ' + w); }
}
main().catch((e) => { console.error(e); process.exit(1); });
