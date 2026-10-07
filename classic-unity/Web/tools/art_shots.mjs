// 絵の見本の写真を撮る（classic-unity/Web/shots/art_*.png）。先に make_dist.mjs で dist/ を作る。
//   node classic-unity/Web/tools/art_shots.mjs              … 戦っている所・窓・HUD・敵と主人公のコマの一覧
//   node classic-unity/Web/tools/art_shots.mjs --tag before … 直す前の同じ場面（art_before_battle.png）だけ
// 島の狩り場（S005 キノコの林）に主人公を置き、描いた 5 体（M001・M003・M005・M006・M007）を dbgSpawn で横に並べる。
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(WEB, 'dist');
const SHOTS = path.join(WEB, 'shots');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const ti = process.argv.indexOf('--tag');
const TAG = ti > 0 ? process.argv[ti + 1] : '';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* */ }
  for (const r of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* */ }
  }
  throw new Error('playwright が見つからない');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.ogg': 'audio/ogg', '.png': 'image/png' };
const srv = await new Promise((res) => {
  const s = http.createServer((req, rsp) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const p = path.join(DIST, u === '/' ? 'index.html' : u);
    if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
    rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(rsp);
  }).listen(0, '127.0.0.1', () => res(s));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 820, height: 620 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const F = () => page.evaluate(() => window.game?.lastFrame);
const act = (cmd, a = '', b = '', n = 0) => page.evaluate(([c, a, b, n]) => window.game.act(c, a, b, n), [cmd, a, b, n]);
const shot = async (name, clip) => {
  const file = path.join(SHOTS, `art_${name}.png`);
  if (clip) await page.screenshot({ path: file, clip });
  else await page.locator('#stage').screenshot({ path: file });
  console.log('写真', file);
};

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForSelector('#start', { state: 'visible', timeout: 60000 });
  await page.evaluate(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('lumina')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } });
  await page.reload();
  await page.waitForSelector('#start', { state: 'visible', timeout: 60000 });
  await page.fill('#name', 'ルミナ');
  await page.click('#btnNew');
  await page.waitForFunction(() => window.game?.lastFrame, null, { timeout: 30000 });
  await sleep(800);
  await page.keyboard.press('h'); // キーの表を隠す
  for (let i = 0; i < 12; i++) await act('dbgExp', '', '', 400);
  for (let i = 0; i < 40; i++) await act('ap', 'str');
  await act('dbgItem', 'use.red_potion', '', 30); await act('dbgItem', 'use.blue_potion', '', 20);
  await act('quick', 'item', 'use.red_potion', 0); await act('quick', 'item', 'use.blue_potion', 1);
  await act('dbgClock', process.env.ART_CLOCK || '2026-07-15T03:00:00'); // 晴れの時刻（雨の粒が絵にかぶらないように）
  await act('dbgWarp', 'S005', 'sp'); await sleep(700);
  // 平らな高台の上へ（S005 の x=664〜1300, y=608）
  await act('dbgPos', '590', '', 900); await sleep(900);
  let f = await F();
  const [px, py] = f.p;
  // 今いる敵を遠くへ（写真に入らないように、この場所から離れた所で湧いた物だけ残る）
  const line = [['M001', -190], ['M003', -120], ['M007', 74], ['M005', 160], ['M006', 230]];
  for (const [id, dx] of line) await act('dbgSpawn', id, String(py - 4), Math.round(px + dx));
  await page.keyboard.press('ArrowRight'); await sleep(120);
  await sleep(500);
  if (TAG === 'before') { await shot('before_lineup'); }
  else await shot('lineup');
  // 戦う: 大コロ貝に向かって Ctrl を押しっぱなし
  await page.keyboard.down('Control'); await sleep(450);
  for (let i = 0; i < 60; i++) { f = await F(); if (f.p[5] && f.p[2] === 'swingO1' && f.p[3] >= 1) break; await sleep(20); }
  await shot(TAG === 'before' ? 'before_battle' : 'battle');
  await page.keyboard.up('Control');
  if (TAG !== 'before') {
    await sleep(300);
    // 窓を開く（持ち物・能力値）
    await page.keyboard.press('i'); await sleep(200); await page.keyboard.press('s'); await sleep(400);
    await shot('window');
    await page.keyboard.press('i'); await page.keyboard.press('s'); await sleep(200);
    // HUD（下の帯）を 2 倍で: 窓を広げると画面が整数倍（2 倍）になる
    await page.setViewportSize({ width: 1640, height: 1240 }); await sleep(500);
    const box = await page.locator('#stage').boundingBox();
    await page.keyboard.down('Control'); await sleep(900);
    await shot('hud', { x: box.x, y: box.y + box.height - 330, width: box.width, height: 330 });
    await page.keyboard.up('Control');
    await page.setViewportSize({ width: 820, height: 620 }); await sleep(300);
    // コマの一覧（js/art.js の preview があれば）
    const has = await page.evaluate(() => !!window.artPreview);
    if (has) {
      await page.evaluate(() => window.artPreview());
      await sleep(400);
      await shot('sheet');
    }
  }
  console.log('エラー', errors.length, errors.slice(0, 5));
} finally {
  await browser.close(); srv.close();
}
