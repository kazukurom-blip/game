// ブラウザで通して動かす確かめ（Playwright + Chromium）。
// 実行: node tests/smoke.mjs  （--only=title,play,panels のように一部だけ）
// 写真は tests/screenshots/ に保存。console のエラー・ページのエラーが 0 件であることを確かめる。
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8191;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  for (const r of ['/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const results = [];
function check(name, ok, info = '') { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✔' : '✘'} ${name}${info ? `  (${info})` : ''}`); }

const main = async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.includes('fonts.g')) errors.push(`requestfailed: ${u}`); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('#title', { timeout: 15000 });
  if (want('title')) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'title.png') });
    check('タイトルが出る', await page.$('#title'));
  }
  // 新しく始める
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title');
  await page.click('.slot.empty .btn');
  await page.waitForSelector('.classcards');
  if (want('title')) await page.screenshot({ path: path.join(SHOTS, 'class_select.png') });
  const classes = ['warrior', 'ranger', 'sorcerer', 'necromancer', 'assassin'];
  await page.click('.classcard:nth-child(1)');
  await page.click('.title-box .btn-primary');
  await page.waitForSelector('#scene');
  check('ゲームが始まる', await page.$('#scene'));
  if (want('play')) {
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(SHOTS, 'play_warrior.png') });
    const st = await page.evaluate(() => ({ kills: window.__game.state.meta.stats.kills, lvl: window.__game.state.hero.level, err: String(window.__lastError || '') }));
    check('敵を倒している', st.kills > 0, `kills=${st.kills}`);
    check('ループのエラーが無い', !st.err, st.err);
    // 時間を早送りして装備を拾う
    await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 120; i++) g.tick(0.05); });
    await page.waitForTimeout(500);
  }
  if (want('panels')) {
    const ids = await page.evaluate(() => [...document.querySelectorAll('.navbtn')].map((b) => b.dataset.id));
    for (const id of ids) {
      await page.click(`.navbtn[data-id="${id}"]`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOTS, `panel_${id}.png`) });
      const bad = await page.$('.panel .bad');
      const t = bad ? await bad.textContent() : '';
      check(`窓「${id}」が開ける`, !t.startsWith('表示できませんでした'), t);
    }
    // アイテムのツールチップ
    await page.click('.navbtn[data-id="bag"]');
    const cell = await page.$('.grid .cell:not(.empty)');
    if (cell) { await cell.hover(); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'tooltip.png') }); check('アイテムの説明が出る', await page.$('#tooltip .itemcard')); }
  }
  if (want('classes')) {
    for (const cls of classes.slice(1)) {
      await page.evaluate((c) => { const g = window.__game; g.newGame(c, c); for (let i = 0; i < 20 * 30; i++) g.tick(0.05); }, cls);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, `play_${cls}.png`) });
      const k = await page.evaluate(() => window.__game.state.meta.stats.kills);
      check(`${cls} で戦える`, k > 0, `kills=${k}`);
    }
  }
  if (want('mobile')) {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p2 = await m.newPage();
    p2.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
    await p2.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p2.waitForSelector('#title');
    await p2.click('.slot.empty .btn');
    await p2.click('.title-box .btn-primary');
    await p2.waitForSelector('#scene');
    await p2.waitForTimeout(3000);
    await p2.screenshot({ path: path.join(SHOTS, 'mobile.png') });
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check('スマホで横にはみ出さない', !overflow);
    await m.close();
  }
  // ======== アート担当（art）: 戦闘の画面の絵と演出 ========
  if (want('art')) {
    const canvasShot = async (file) => {
      const url = await page.evaluate(() => document.getElementById('scene').toDataURL('image/jpeg', 0.82));
      fs.writeFileSync(path.join(SHOTS, file), Buffer.from(url.split(',')[1], 'base64'));
    };
    // 5 クラス
    for (const cls of classes) {
      await page.evaluate((c) => { const g = window.__game; g.newGame(c, c); for (let i = 0; i < 20 * 4; i++) g.tick(0.05); }, cls);
      await page.waitForTimeout(900);
      await canvasShot(`art_${cls}.jpg`);
    }
    // 章ごとの背景（無い章は仮の地域で見る）
    const acts = await page.evaluate(async () => {
      const W = await import('./src/data/world.js');
      const out = [];
      for (const a of W.ACTS) {
        let z = W.ZONES.find((x) => x.act === a.id);
        if (!z) { z = { id: `__art_${a.id}`, name: a.name, level: 3, monsters: ['rot_zombie', 'ash_wolf', 'cultist'], boss: 'boss_butcher', act: a.id, actIdx: 0, zoneIdx: 0, global: 0 }; W.ZONE[z.id] = z; }
        out.push([a.id, z.id]);
      }
      return out;
    });
    for (const [act, zid] of acts) {
      await page.evaluate((id) => { const g = window.__game; g.state.world.zone = id; g.sys.world.startStage(); for (let i = 0; i < 20 * 2; i++) g.tick(0.05); }, zid);
      await page.waitForTimeout(700);
      await canvasShot(`art_${act}.jpg`);
    }
    await page.evaluate(async () => { const W = await import('./src/data/world.js'); window.__game.sys.world.travel(W.ZONES[0].id, 1); for (const k of Object.keys(W.ZONE)) if (k.startsWith('__art_')) delete W.ZONE[k]; });
    // ボス・ドロップ・奥義・状態異常
    await page.evaluate(() => { const g = window.__game; g.state.world.stage = 10; g.sys.world.startStage(); for (let i = 0; i < 20 * 2; i++) g.tick(0.05); });
    await page.waitForTimeout(900);
    await canvasShot('art_boss.jpg');
    await page.evaluate(async () => {
      const { generateItem } = await import('./src/game/loot.js');
      const { RNG } = await import('./src/engine/rng.js');
      const g = window.__game; const h = g.combat.hero;
      ['rare', 'epic', 'legendary', 'unique', 'mythic'].forEach((r, i) => { const it = generateItem(new RNG(11 + i), { ilvl: 12, minRarity: r, cls: g.state.hero.cls }); if (it) { it.rarity = r; g.combat.emit({ t: 'loot', x: h.x + 100 + i * 60, y: 0, item: it, where: 'bag' }); } });
    });
    await page.waitForTimeout(700);
    await canvasShot('art_loot.jpg');
    await page.evaluate(() => { const g = window.__game; g.combat.emit({ t: 'ult', skill: g.state.hero.bar[1] || g.state.hero.bar[0], cls: g.state.hero.cls, unit: g.combat.hero }); });
    await page.waitForTimeout(300);
    await canvasShot('art_ult.jpg');
    const perf = await page.evaluate(async () => {
      const sc = window.__ui.scene; const g = window.__game;
      const ids = ['ignite', 'freeze', 'poison', 'shock', 'stun', 'vuln'];
      g.combat.enemies().forEach((u, i) => { const id = ids[i % ids.length]; if (id === 'poison') u.statuses.poison = { stacks: [{ t: 5, dps: 0 }] }; else u.statuses[id] = { t: 5, dps: 0 }; });
      const orig = sc.frame.bind(sc); let tot = 0; let n = 0;
      sc.frame = (dt) => { const t0 = performance.now(); orig(dt); tot += performance.now() - t0; n++; };
      g.state.settings.speed = 4;
      await new Promise((r) => setTimeout(r, 2500));
      sc.frame = orig; g.state.settings.speed = 1;
      return { avg: n ? tot / n : 0, n, err: String(window.__lastError || '') };
    });
    await canvasShot('art_status.jpg');
    check('アート: 演出のループでエラーが無い', !perf.err, perf.err);
    check('アート: 戦闘の画面の 1 フレームが軽い（×4 速）', perf.avg < 16, `${perf.avg.toFixed(2)}ms × ${perf.n}`);
  }
  // ======== ここまで（art） ========
  check('エラーが 0 件', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  srv.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
