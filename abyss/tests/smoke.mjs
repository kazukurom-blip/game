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
  // ==================== メタ担当（転生・実績・図鑑・日課・ペット・記録・おかえり） ====================
  if (want('meta')) {
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `meta_${n}.png`) });
    const openTab = async (panel, tab) => {
      await page.click(`.navbtn[data-id="${panel}"]`);
      await page.waitForTimeout(150);
      if (tab) { await page.click(`.panel .tabs .tab:has-text("${tab}")`); await page.waitForTimeout(200); }
    };
    // 遊びが進んだ状態を作る
    await page.evaluate(() => {
      const g = window.__game;
      document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
      g.newGame('sorcerer', '灰の魔導士');
      const st = g.state;
      for (let i = 0; i < 20 * 240; i++) g.tick(0.05);
      st.hero.level = Math.max(st.hero.level, 32);
      st.meta.prestige.unlocked = true;
      st.meta.prestige.life.maxLevel = 58;
      st.meta.souls = 420; st.meta.totalSouls = 980; st.meta.rebirths = 2;
      for (const [id, n] of [['soul_blade', 4], ['soul_fury', 8], ['soul_life', 5], ['soul_gold', 6], ['idle_cap', 2], ['auto_boss', 1], ['auto_skill', 1]]) g.sys.prestige.buy(id, n);
      st.meta.souls = 420;
      st.meta.stats.kills += 25000; st.meta.stats.elites += 900; st.meta.stats.bosses += 60;
      for (const m of ['rot_zombie', 'ash_wolf', 'grave_bat', 'bone_archer', 'bog_slime']) st.meta.bestiary[m] = (st.meta.bestiary[m] || 0) + [1200, 450, 12000, 90, 300][['rot_zombie', 'ash_wolf', 'grave_bat', 'bone_archer', 'bog_slime'].indexOf(m)];
      g.sys.bestiary.ver++;
      for (const id of ['emberfox', 'mossling', 'stormferret', 'cinderdrake', 'voidwisp']) g.sys.pets.givePet(id);
      g.sys.pets.givePet('cinderdrake'); g.sys.pets.givePet('cinderdrake');
      st.meta.gold = 5e6; g.sys.pets.feed('cinderdrake', 25);
      g.sys.pets.setActive('cinderdrake');
      g.sys.pets.addEgg('egg_ash', 2); g.sys.pets.addEgg('egg_abyss', 1); g.sys.pets.incubate('egg_ash');
      st.meta.pets.incubator[0].prog = 120; st.meta.pets.pity = 230;
      g.sys.achievements.check();
      g.onStatsChanged();
      window.__ui.renderPanel();
    });
    await page.waitForTimeout(300);
    // 戦闘中のペット
    await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 20; i++) g.tick(0.05); });
    await page.waitForTimeout(1200);
    await shot('pet_battle');
    const petUnit = await page.evaluate(() => window.__game.combat.units.some((u) => u.kind === 'pet' && !u.dead));
    check('ペットが戦闘についてくる', petUnit);
    await openTab('prestige', '転生'); await shot('prestige');
    check('転生の見込みが出る', (await page.textContent('.pr-gain'))?.includes('+'));
    await openTab('prestige', '魂の祭壇'); await shot('altar');
    check('魂の祭壇に強化が並ぶ', (await page.$$('.pr-upg')).length >= 10);
    await openTab('prestige', '自動化'); await shot('auto');
    await openTab('prestige', '超越'); await shot('transcend');
    await openTab('achievements'); await shot('achievements');
    check('実績の一覧が出る', (await page.$$('.ac-row')).length >= 10);
    await openTab('achievements', '称号'); await shot('titles');
    await openTab('bestiary'); await shot('bestiary');
    check('魔物図鑑のマスが出る', (await page.$$('.bs-mon')).length >= 5);
    await page.click('.bs-mon:not(.unknown)'); await page.waitForTimeout(250); await shot('bestiary_detail');
    await page.click('.modal-foot .btn'); await page.waitForTimeout(100);
    await openTab('bestiary', '宝物図鑑'); await shot('treasure');
    await openTab('bestiary', '落とし物の表'); await shot('drops');
    check('落とし物の表が出る', (await page.$$('table.bs-odds tr')).length >= 9);
    await openTab('bounties'); await shot('bounties');
    check('日課が 3 つ以上', (await page.$$('.bt-row')).length >= 4);
    await page.click('.bt-foot .btn-primary'); await page.waitForTimeout(250);
    check('ログインの贈り物を受け取れる', await page.evaluate(() => !window.__game.sys.bounties.canClaimLogin()));
    await openTab('pets'); await shot('pets');
    await openTab('pets', '一覧'); await shot('petlist');
    await openTab('pets', '卵と孵卵器'); await shot('eggs');
    await page.evaluate(() => { const g = window.__game; g.state.meta.pets.incubator[0].prog = 9999; window.__ui.renderPanel(); });
    await page.waitForTimeout(150);
    await page.click('.pt-inc.ready .btn-primary'); await page.waitForTimeout(700); await shot('hatch');
    check('卵が孵る', await page.evaluate(() => window.__game.state.meta.record.hatched >= 1));
    await page.click('.modal-foot .btn'); await page.waitForTimeout(100);
    await openTab('stats'); await shot('stats');
    await openTab('stats', '能力の内訳'); await shot('sheet');
    check('能力の内訳に出どころ', (await page.$$('.st-src')).length >= 10);
    await openTab('stats', 'スキル別'); await page.waitForTimeout(1100); await shot('skills');
    check('スキル別のダメージが出る', (await page.$$('.st-sk')).length >= 2);
    // おかえりの報告
    await page.evaluate(() => { window.__game.sys.offline.grant(9.5 * 3600, { reason: 'offline' }); });
    await page.waitForTimeout(450); await shot('offline_reveal');
    await page.waitForTimeout(3200); await shot('offline');
    check('おかえりの報告が出る', await page.$('.ofr'));
    await page.click('.modal-foot .btn:has-text("すべて見る")'); await page.waitForTimeout(150);
    check('演出を飛ばせる', await page.$('.ofr.skip'));
    const eqBtn = await page.$('.ofr-ba .btn');
    if (eqBtn) { await eqBtn.click(); await page.waitForTimeout(150); }
    await page.click('.modal-foot .btn-primary'); await page.waitForTimeout(150);
    // 転生する
    await page.evaluate(() => { const st = window.__game.state; st.meta.prestige.life.start = st.playTime - 99999; });
    await openTab('prestige', '転生');
    await page.click('.pr-btn .btn-primary'); await page.waitForTimeout(150);
    await page.click('.modal-foot .btn-primary'); await page.waitForTimeout(400);
    check('転生できる', await page.evaluate(() => window.__game.state.meta.rebirths === 3));
    await shot('after_rebirth');
    // スマホ（見えている幅 visualViewport で確かめる）
    const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mp = await mc.newPage();
    mp.on('pageerror', (e) => errors.push(`meta mobile pageerror: ${e.message}`));
    await mp.goto(`http://127.0.0.1:${PORT}/index.html`);
    await mp.waitForSelector('#title');
    await mp.click('.slot.empty .btn'); await mp.click('.title-box .btn-primary'); await mp.waitForSelector('#scene');
    await mp.waitForTimeout(500);
    let wide = '';
    for (const id of ['prestige', 'achievements', 'bestiary', 'bounties', 'pets', 'stats']) {
      await mp.evaluate((x) => window.__ui.openPanel(x), id);
      await mp.waitForTimeout(200);
      const w = await mp.evaluate(() => ({ doc: document.documentElement.scrollWidth, vv: Math.round(window.visualViewport?.width || window.innerWidth) }));
      if (w.doc > w.vv + 1) wide += `${id}:${w.doc}>${w.vv} `;
    }
    await mp.screenshot({ path: path.join(SHOTS, 'meta_mobile_stats.png') });
    await mp.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 60; i++) g.tick(0.05); g.sys.offline.grant(6 * 3600, { reason: 'offline' }); });
    await mp.waitForTimeout(3300);
    await mp.screenshot({ path: path.join(SHOTS, 'meta_mobile_offline.png') });
    const mw = await mp.evaluate(() => { const r = document.querySelector('.modal')?.getBoundingClientRect(); return r ? r.right <= (window.visualViewport?.width || window.innerWidth) + 1 : false; });
    check('スマホ: メタの窓が横にはみ出さない', !wide, wide);
    check('スマホ: おかえりの報告が画面に収まる', mw);
    await mc.close();
  }
  // ==================== ここまでメタ担当 ====================
  check('エラーが 0 件', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  srv.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
