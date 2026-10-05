#!/usr/bin/env node
// リグ（パーツ式の着せ替え）の配置図・下絵を書き出す（画像生成AIに添付する画像）
//   npm run export:rig
//   node tools/export_rig_templates.mjs [--out=docs/art_handoff/rig] [--fake=<dir>]
// 出力（--out の下）:
//   layout_f.png / layout_m.png          … ♀♂の配置図（枠・支点の十字・パーツ名・薄い参考シルエット）
//   layout_weapon.png                    … 武器の配置図（持ち手の十字）
//   layout_head.png                      … 頭の配置図（前の頭・後ろ髪 共通。頭の中心の支点・頭頂/目/顎の目安線）
//   templates/head/<cls>_<g>.png / <cls>_<g>_back.png … キャラ別の前の頭・後ろ髪の下絵（コードの頭）
//   layout.json                          … 各枠のピクセル座標・支点（指示書の表に使う）
//   templates/body/body_<g>.png          … 素体の下絵
//   templates/<slot>/<style>_<g>.png     … 各装備の下絵（その装備のコード描画を枠に分解して薄く）
//   templates/weapon/<style>.png         … 武器の下絵
//   templates/tear/<1|2|3>_<g>.png       … 服破れの重ねの下絵（任意）
//   parts.json                           … 各シートが使う枠の一覧（指示書の生成 tools/gen_rig_guide.mjs が読む）
// --fake=<dir>: 今のコード描画のパーツを不透明でそのまま書き出す（「AIが描いた」とみなせる仮の絵。<dir>/rig/...・<dir>/heads/... と manifest_rig.json）
// しくみ: 組み込みの静的サーバー → Playwright(chromium) で tools/rig_page.js を読み込み → 描画 → PNG を保存
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIG_BASE } from '../src/render/rigLayout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(ROOT, arg('out', 'docs/art_handoff/rig'));
const CLS = ['luna', 'jin', 'hacker'];
const FAKE = arg('fake', '') ? path.resolve(ROOT, arg('fake', '')) : null;
const PORT = Number(process.env.EXPORT_PORT) || 8141;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules_global', '/usr/local/lib/node_modules', '/usr/lib/node_modules']
    .filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright が見つかりません (NODE_PATH を設定してください)');
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const PAGE = '<!doctype html><meta charset="utf-8"><title>rig</title><body><script type="module" src="/tools/rig_page.js"></script></body>';
function startServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__rig.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}
const save = (file, url) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const b = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync(file, b); return b.length; };

async function main() {
  const t0 = Date.now();
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  !! pageerror', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/__rig.html`);
  await page.waitForFunction(() => window.RIGTOOL && window.RIGTOOL.ready, null, { timeout: 30000 });
  let n = 0, bytes = 0;
  const put = (rel, url) => { bytes += save(path.join(OUT, rel), url); n++; };
  for (const g of ['f', 'm']) put(`layout_${g}.png`, await page.evaluate((g) => window.RIGTOOL.layout(g), g));
  put('layout_weapon.png', await page.evaluate(() => window.RIGTOOL.weaponLayout()));
  put('layout_head.png', await page.evaluate(() => window.RIGTOOL.headLayout()));
  for (const cls of CLS) for (const g of ['f', 'm']) for (const part of ['front', 'back']) {
    put(`templates/head/${cls}_${g}${part === 'back' ? '_back' : ''}.png`, await page.evaluate(([c, g, p]) => window.RIGTOOL.headTemplate(c, g, p), [cls, g, part]));
  }
  fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(await page.evaluate(() => window.RIGTOOL.table()), null, 1));
  const parts = { body: {}, weapon: {} };
  for (const g of ['f', 'm']) {
    put(`templates/body/body_${g}.png`, await page.evaluate((g) => window.RIGTOOL.template('body', null, g), g));
    parts.body[g] = await page.evaluate((g) => window.RIGTOOL.used('body', null, g), g);
  }
  for (const slot of ['top', 'bottom', 'shoes', 'hat', 'accessory']) {
    parts[slot] = {};
    for (const style of Object.keys(RIG_BASE[slot])) {
      parts[slot][style] = {};
      for (const g of ['f', 'm']) {
        put(`templates/${slot}/${style}_${g}.png`, await page.evaluate(([s, st, g]) => window.RIGTOOL.template(s, st, g), [slot, style, g]));
        parts[slot][style][g] = await page.evaluate(([s, st, g]) => window.RIGTOOL.used(s, st, g), [slot, style, g]);
      }
    }
  }
  for (const n of [1, 2, 3]) for (const g of ['f', 'm']) put(`templates/tear/${n}_${g}.png`, await page.evaluate(([n, g]) => window.RIGTOOL.template('tear', String(n), g), [n, g]));
  for (const style of Object.keys(RIG_BASE.weapon)) put(`templates/weapon/${style}.png`, await page.evaluate((s) => window.RIGTOOL.weaponTemplate(s), style));
  fs.writeFileSync(path.join(OUT, 'parts.json'), JSON.stringify(parts, null, 1));
  console.log(`配置図・下絵: ${n} 枚 (${(bytes / 1e6).toFixed(1)}MB) → ${path.relative(ROOT, OUT)}/`);
  if (FAKE) {
    const keys = [];
    let fn = 0;
    const putF = (key, url) => { save(path.join(FAKE, 'rig', key + '.png'), url); keys.push(key); fn++; };
    for (const g of ['f', 'm']) {
      putF(`body_${g}`, await page.evaluate((g) => window.RIGTOOL.fake('body', null, g, {}), g));
      for (const slot of ['top', 'bottom', 'shoes', 'hat', 'accessory']) {
        for (const style of Object.keys(RIG_BASE[slot])) putF(`${slot}/${style}_${g}`, await page.evaluate(([s, st, g]) => window.RIGTOOL.fake(s, st, g, {}), [slot, style, g]));
      }
    }
    for (const style of Object.keys(RIG_BASE.weapon)) putF(`weapon/${style}`, await page.evaluate((s) => window.RIGTOOL.fake('weapon', s, null, { mark: true }), style));
    const heads = {};
    for (const cls of CLS) for (const g of ['f', 'm']) {
      for (const part of ['front', 'back']) save(path.join(FAKE, 'heads', `${cls}_${g}${part === 'back' ? '_back' : ''}.png`), await page.evaluate(([c, g, p]) => window.RIGTOOL.fakeHead(c, g, p, {}), [cls, g, part]));
      heads[`${cls}_${g}`] = { file: `heads/${cls}_${g}.png`, back: `heads/${cls}_${g}_back.png` };
    }
    fs.writeFileSync(path.join(FAKE, 'manifest_rig.json'), JSON.stringify({ version: 1, rig: { enabled: true, fit: false, parts: keys }, heads }, null, 1));
    console.log(`仮のAI画像: ${fn} 枚 → ${path.relative(ROOT, FAKE)}/rig/（manifest_rig.json の rig を assets/sprites/manifest.json に入れると使える）`);
  }
  await browser.close();
  srv.close();
  console.log(`完了 ${((Date.now() - t0) / 1000).toFixed(1)}秒`);
}
main().catch((e) => { console.error(e); process.exit(1); });
