// 実際のブラウザで遊んでみる確かめ（PC とスマホの大きさ）。写真は tests/shots/ に。
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw.default || pw;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(f);
  if (p === '/index.html') body = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + body + '</body></html>';
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(body);
}).listen(0);
const port = srv.address().port;
fs.mkdirSync(path.join(ROOT, 'tests/shots'), { recursive: true });
const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) fails++; };
for (const vp of [{ name: 'pc', width: 1280, height: 720 }, { name: 'phone', width: 390, height: 844, mobile: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_title.png`) });
  await page.click('#title');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_start.png`) });
  const box = await page.locator('#cv').boundingBox();
  for (let i = 0; i < 40; i++) { await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5); await page.waitForTimeout(25); }
  let S = await page.evaluate(() => ({ gold: __wc.S.gold, taps: __wc.S.stats.taps, stage: __wc.S.stage }));
  ok(S.taps >= 20 && S.gold > 0, `${vp.name}: タップで金貨 ${S.gold.toFixed(0)} タップ ${S.taps} ステージ ${S.stage}`);
  // 強化を押す
  for (let i = 0; i < 6; i++) { await page.click('#body .buy >> nth=0'); await page.waitForTimeout(30); }
  S = await page.evaluate(() => __wc.S.upg.power);
  ok(S > 0, `${vp.name}: パンチ力を買えた Lv.${S}`);
  // 強いところまで進める
  await page.evaluate(() => { const s = __wc.S; s.upg.auto = 60; s.upg.power = 60; s.upg.speed = 10; s.upg.multi = 2; s.upg.crit = 20; __wc.refresh(); });
  await page.waitForTimeout(4000);
  S = await page.evaluate(() => __wc.S.stage);
  ok(S > 5, `${vp.name}: 自動で進む ステージ ${S}`);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_play.png`) });
  // 壁の途中の見た目（2 つ目の地域）
  await page.evaluate(() => { const s = __wc.S; s.upg.auto = 40; s.upg.power = 40; s.upg.multi = 1; s.stage = 14; s.advance = true; window.WC.startWall(s); s.wallHp = s.wallMax * 0.55; s.wallT = 12; __wc.refresh(); __wc.step(0.1); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_wall.png`) });
  // 押し返される
  await page.evaluate(() => { const s = __wc.S; s.upg.auto = 1; s.upg.power = 1; s.upg.multi = 0; s.stage = 30; s.runMax = 30; window.WC.startWall(s); __wc.refresh(); __wc.step(36); });
  S = await page.evaluate(() => ({ adv: __wc.S.advance, stage: __wc.S.stage, retry: __wc.S.retry }));
  ok(!S.adv && S.stage === S.retry - 1, `${vp.name}: 時間切れで押し返される（ステージ ${S.stage}）`);
  await page.waitForTimeout(300);
  ok(await page.isVisible('#retryBtn'), `${vp.name}: 再挑戦のボタンが出る`);
  ok(await page.isVisible('#rebirthQuick'), `${vp.name}: 転生のボタンが出る`);
  // 転生
  await page.click('#rebirthQuick', { force: true });
  await page.waitForTimeout(200);
  await page.click('#modal .soulb');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_cards.png`) });
  const n = await page.locator('#modal .card').count();
  ok(n === 3, `${vp.name}: アビリティの札が ${n} 枚`);
  await page.click('#modal .card >> nth=0');
  await page.waitForTimeout(300);
  S = await page.evaluate(() => ({ r: __wc.S.resets, sh: __wc.S.shards, st: __wc.S.stage, ab: Object.entries(__wc.S.abil).filter(([, v]) => v) }));
  ok(S.r === 1 && S.sh > 0 && S.ab.length === 1, `${vp.name}: 転生 → 魂 ${S.sh}・能力 ${JSON.stringify(S.ab)}・ステージ ${S.st}`);
  // 全アビリティを付けて見た目と重さ
  await page.evaluate(() => { const s = __wc.S; for (const a of window.WC.ABIL) s.abil[a.id] = 3; s.upg.auto = 80; s.upg.power = 80; s.upg.multi = 4; s.fever = 100; __wc.refresh(); });
  await page.click('#feverBtn');
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  ok(fps > 30, `${vp.name}: 全部入りで ${fps.toFixed(0)} fps`);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_full.png`) });
  for (const t of ['ab', 'rb', 'ac', 'op']) { await page.click(`#tabs button[data-t="${t}"]`); await page.waitForTimeout(100); }
  await page.click(`#tabs button[data-t="rb"]`);
  await page.screenshot({ path: path.join(ROOT, `tests/shots/${vp.name}_rebirth_tab.png`) });
  // 横にはみ出さない
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!ov, `${vp.name}: 横にはみ出していない`);
  // セーブして読み直し
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await page.reload(); await page.waitForTimeout(500);
  S = await page.evaluate(() => __wc.S.resets);
  ok(S === 1, `${vp.name}: 読み直しても転生回数が残る`);
  ok(errs.length === 0, `${vp.name}: エラーなし ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close(); srv.close();
console.log(fails ? `NG ${fails} 件` : 'すべて通過');
process.exit(fails ? 1 : 0);
