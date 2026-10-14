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
  // ======== ワールド担当（world）: 地図・苦行・裂け目・門番・ため込み屋・ボスの特技 ========
  if (want('world')) {
    await page.evaluate(() => { const g = window.__game; g.newGame('sorcerer', 'world'); for (let i = 0; i < 20 * 60; i++) g.tick(0.05); });
    await page.click('.navbtn[data-id="map"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'world_map.png') });
    check('地図: 章のカードが出る', (await page.$$('.wm-act')).length === 10);
    // 終盤まで進めた状態にする
    await page.evaluate(() => {
      const g = window.__game; const w = g.state.world;
      w.maxZone = 49; for (let i = 0; i < 49; i++) { const id = `a${Math.floor(i / 5) + 1}z${(i % 5) + 1}`; w.cleared[id] = true; w.maxStage[id] = 10; }
      w.maxStage.a10z5 = 10; w.maxTorment = 4; w.rift.unlocked = 12; w.rift.best = 9;
      for (const k of ['g1_0', 'g1_1', 'g1_2', 'g1_3', 'g2_1', 'g2_3']) w.gate.frags[k] = 1;
      g.state.hero.level = 70; g.combat.recalc(true);
      g.sys.world.setTorment(2);
    });
    await page.click('.navbtn[data-id="rift"]');
    await page.click('.navbtn[data-id="map"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'world_map_torment.png') });
    check('地図: 苦行の段を選べる', (await page.$$('.tm-btn:not([disabled])')).length >= 5);
    // 地域のボス戦（特技の予告）。写真のために主人公を硬くする
    await page.evaluate(() => {
      const g = window.__game; const c = g.combat;
      g.sys.world.setTorment(0);
      c.buffs.push({ id: 'smoke_guard', mods: [{ s: 'life', v: 1e9 }, { s: 'dr', v: 60 }], t: 1e6, name: '写真用の守り' }); c.recalc(true);
      g.sys.world.travel('a2z5', 9); g.sys.world.challengeBoss();
      for (let i = 0; i < 20 * 2; i++) g.tick(0.05);
      const b = g.sys.world.bossUnit; if (b) { b.x = c.hero.x + 330; for (const k in b.abilityT) b.abilityT[k] = 0.05; }
      for (let i = 0; i < 10; i++) g.tick(0.05);
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, 'world_boss.png') });
    check('ボス戦: 必要 DPS の目安が出る', await page.$('.hud-line.wl.boss'));
    // 裂け目
    await page.click('.navbtn[data-id="rift"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'world_rift_select.png') });
    await page.click('.panel-rift .btn-primary');
    await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 4; i++) g.tick(0.05); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'world_rift_run.png') });
    const rs = await page.evaluate(() => ({ mode: window.__game.state.world.mode, hud: !!document.querySelector('.hud-line.wl.rift'), en: window.__game.combat.enemies().length }));
    check('裂け目: 始められて HUD に残り時間と進行', rs.mode === 'rift' && rs.hud && rs.en > 0, JSON.stringify(rs));
    await page.evaluate(() => { const g = window.__game; const r = g.state.world.rift.run; r.progress = r.need - 0.5; const u = g.combat.enemies()[0]; if (u) g.combat.killUnit(u, g.combat.hero); for (let i = 0; i < 20 * 2; i++) g.tick(0.05); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, 'world_rift_guardian.png') });
    check('裂け目: 守護者が出る', await page.evaluate(() => window.__game.state.world.rift.run?.phase === 'guardian'));
    await page.evaluate(() => { const g = window.__game; g.sys.rift.abandon(); g.combat.buffs = g.combat.buffs.filter((b) => b.id !== 'smoke_guard'); g.combat.recalc(true); });
    // 門番
    await page.click('.panel-rift .tab:nth-child(3)');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'world_gate.png') });
    check('門番: 組のカードと推定勝率', (await page.$$('.gk-card')).length === 5 && await page.$('.gk-odds'));
    await page.click('.panel-rift .tab:nth-child(4)');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'world_rift_log.png') });
    // ため込み屋
    await page.evaluate(() => { const g = window.__game; g.sys.world.travel('a3z2', 3); for (let i = 0; i < 20; i++) g.tick(0.05); const c = g.combat; c.spawnMonster('goblin_gem', { level: 60, rank: 'goblin', x: c.hero.x + 380, lifeMul: 50 }); for (let i = 0; i < 20 * 1.5; i++) g.tick(0.05); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'world_goblin.png') });
    check('ため込み屋: HUD に逃げる時間', await page.$('.hud-line.wl.gob'));
  }
  // ======== ワールド担当ここまで ========
  check('エラーが 0 件', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  srv.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
