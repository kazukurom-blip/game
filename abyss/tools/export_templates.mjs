#!/usr/bin/env node
// 型紙（どこに何を描けばよいかの PNG）を assets/templates/ に書き出す。Chromium（Playwright）でゲームを開いて描く。
//
// 使い方（abyss/ の中で）:
//   node tools/export_templates.mjs          … 種類ごとに 1 枚ずつ（合わせて 5 MB 未満）
//   node tools/export_templates.mjs --all    … すべての枠（とても多い。必要なときだけ）
//   node tools/export_templates.mjs --ids hero.warrior.body,monster.ash_wolf
//   オプション: --size 640（絵の部分の長い辺 px）, --port 8299, --out <フォルダ>
//
// 型紙の見方: 灰色の形 = コードの絵（位置と大きさの目安）、赤い十字 = 基準点（足元・握り）、色の丸 = アンカー（手・頭…）、
// 赤い点線 = 安全な範囲、黄色い線 = 地面。下の帯に枠 ID・推奨の大きさ・AI で作る大きさ・背景・向き。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', process.env.PORT || 8299));
const SIZE = Number(arg('--size', 400)); // 枠が 860 を超えて種類が増えたので、ひと揃いが 5 MB に収まる大きさ
const OUT = path.resolve(arg('--out', path.join(ROOT, 'assets', 'templates')));
const LIMIT = 5 * 1024 * 1024;

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* 次へ */ }
  for (const r of ['/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* 次へ */ }
  }
  throw new Error('playwright が見つかりません（npm i -D playwright）');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const main = async () => {
  const srv = await serve();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 差し替え画像の影響を受けないよう、custom.json は空にする
  await page.route('**/assets/custom/custom.json', (r) => r.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('#title', { timeout: 20000 });
  await page.waitForFunction(() => window.__assets?.ready);
  const wantAll = process.argv.includes('--all');
  const only = (arg('--ids') || '').split(',').filter(Boolean);
  const ids = await page.evaluate(async ({ wantAll, only }) => {
    const A = window.__assets;
    const { MONSTER } = await import('./src/data/monsters.js');
    const slots = [...A.slots.values()];
    if (only.length) return only;
    if (wantAll) return slots.map((s) => s.id);
    // 種類（kind）× 小さな違いごとに 1 枚
    const pick = new Map();
    const key = (s) => {
      const p = s.params || {};
      if (s.kind === 'gear.weapon') return `${s.kind}:${['bow', 'crossbow'].includes(p.kind) ? p.kind : ['staff', 'wand', 'rod', 'scythe'].includes(p.kind) ? 'staff' : 'blade'}`; // 弓・弩は真ん中が握り（別の型紙）
      if (s.kind === 'gear.offhand') return `${s.kind}:${p.kind === 'shield' ? 'shield' : 'other'}`;
      if (s.kind === 'monster') { const m = MONSTER[p.mon] || {}; return `monster:${m.boss ? 'boss' : m.body || ''}${m.flying ? ':fly' : ''}`; }
      if (s.kind === 'fx') return `fx:${p.part}`;
      if (s.kind === 'bg') return `bg:${p.layer}`;
      if (s.kind === 'icon.item') return `icon.item:${p.style ? 'armor' : p.kind === 'amulet' || p.kind === 'ring' ? 'jewel' : 'weapon'}`;
      return s.kind;
    };
    for (const s of slots) { const k = key(s); if (!pick.has(k)) pick.set(k, s.id); }
    return [...pick.values()];
  }, { wantAll, only });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png') && !only.length) fs.unlinkSync(path.join(OUT, f));
  const index = [];
  let total = 0;
  for (const id of ids) {
    const r = await page.evaluate(async ({ id, size }) => {
      const m = await import('./src/render/template.js');
      const c = m.renderTemplate(id, { maxSide: size });
      const spec = window.__assets.spec(id) || {};
      return { url: c.toDataURL('image/png'), label: spec.label || id, w: spec.w, h: spec.h, cat: spec.cat };
    }, { id, size: SIZE });
    const buf = Buffer.from(r.url.split(',')[1], 'base64');
    const file = `${id}.png`;
    fs.writeFileSync(path.join(OUT, file), buf);
    total += buf.length;
    index.push({ id, label: r.label, file, cat: r.cat, w: r.w, h: r.h });
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify({ _note: '型紙の一覧（node tools/export_templates.mjs で作る）', size: SIZE, templates: index }, null, 2)}\n`);
  await browser.close();
  srv.close();
  console.log(`型紙 ${index.length} 枚 → ${path.relative(process.cwd(), OUT) || OUT}（合計 ${(total / 1024 / 1024).toFixed(2)} MB）`);
  if (errors.length) console.log(`ページのエラー: ${errors.slice(0, 3).join(' | ')}`);
  if (!wantAll && !only.length && total > LIMIT) { console.log('⚠ 5 MB を超えました。--size を小さくしてください'); process.exit(1); }
  process.exit(errors.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
