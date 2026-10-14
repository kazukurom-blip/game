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
  // ===================== アイテム担当（鍛冶・宝石・極意・商人・持ち物）ここから =====================
  if (want('items')) {
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `items_${n}.png`) });
    const openP = async (id) => { await page.click(`.navbtn[data-id="${id}"]`); await page.waitForTimeout(200); };
    const clickTab = async (name) => { await page.evaluate((nm) => { const b = [...document.querySelectorAll('#panelbody .tabs .tab')].find((x) => x.textContent.startsWith(nm)); b?.click(); }, name); await page.waitForTimeout(150); };
    const clickBtn = async (txt) => page.evaluate((t) => { const b = [...document.querySelectorAll('#panelbody button.btn')].find((x) => x.textContent.startsWith(t) && !x.disabled); if (b) { b.click(); return true; } return false; }, txt);
    // 豊かな状態を作る（装備・素材・宝石・ルーン・深淵の宝石・極意）
    const setup = await page.evaluate(async () => {
      const g = window.__game;
      const { generateItem } = await import('/src/game/loot.js');
      const kit = await import('/src/ui/panels/itemkit.js');
      g.newGame('sorcerer', '検証');
      g.state.hero.level = 70; g.combat.recalc();
      g.state.meta.gold = 5e9;
      for (const id of ['scrap', 'dust', 'crystal', 'echo', 'core', 'shard', 'chaos', 'ascend', 'bless', 'drill', 'abyssdrop']) g.state.inv.mats[id] = 500;
      const mk = (o) => { const it = generateItem(g.rng, { ilvl: 70, cls: 'sorcerer', ...o }); g.state.inv.bag.push(it); return it; };
      const w = mk({ rarity: 'rare', slot: 'weapon' });
      mk({ rarity: 'unique', def: 'u_frostheart', slot: 'weapon' });
      mk({ rarity: 'set', piece: 'set_sevenstar_chest' });
      mk({ rarity: 'mythic', def: 'm_genesis', anyReq: true });
      for (let i = 0; i < 4; i++) mk({ rarity: 'legendary' });
      const ring = mk({ rarity: 'rare', slot: 'ring', noSockets: true }); ring.sockets = [null];
      const white = mk({ rarity: 'common', slot: 'helm', noSockets: true }); white.sockets = [null, null];
      for (let i = 0; i < 12; i++) mk({});
      g.state.inv.gems = { ember_1: 7, frost_3: 4, star_5: 3, abyss_2: 2, blood_6: 1 };
      g.state.inv.runes = { kiri: 1, hikari: 1, hai: 5, rin: 2, kaze: 1 };
      g.sys.gems.onRiftComplete(25, 0.8); g.sys.gems.grantLegendaryGem('bane');
      g.state.meta.codex.powers = { pw_crowdbreak: 0.6, pw_d_barrier: 0.9, pw_u_treasure: 0.4, pw_s_orb: 1 };
      g.sys.codex.equip(0, 'pw_s_orb'); g.sys.codex.equip(1, 'pw_d_barrier');
      g.state.inv.luck.leg = 310; g.state.inv.luck.myth = 4200;
      kit.selectItem('craft', w.uid); kit.selectItem('gems', white.uid);
      g.events.emit('invChanged', {});
      return { w: w.uid, white: white.uid, ring: ring.uid, bag: g.state.inv.bag.length };
    });
    check('アイテム: 検証用の状態を作れる', setup.bag > 20, `bag=${setup.bag}`);
    // 鍛冶
    await openP('craft');
    await shot('craft_enhance');
    for (let i = 0; i < 6; i++) await clickBtn('強化する');
    const enh = await page.evaluate((uid) => window.__game.sys.inv.findItem(uid).item.enh || 0, setup.w);
    check('鍛冶: 強化のボタンで +値が上がる', enh >= 5, `+${enh}`);
    await clickTab('段上げ'); await shot('craft_tier');
    await clickTab('付け替え'); await clickBtn('候補を出す'); await page.waitForTimeout(150); await shot('craft_reroll');
    const pend = await page.evaluate((uid) => !!window.__game.sys.inv.findItem(uid).item.rrPending, setup.w);
    check('鍛冶: 付け替えの候補が出る', pend);
    await clickBtn('これにする');
    await clickTab('昇格'); await shot('craft_ascend');
    await clickTab('堕落'); await shot('craft_corrupt');
    // 宝石
    await openP('gems');
    await clickTab('宝石'); await shot('gems_table');
    await clickTab('ソケット');
    await page.evaluate(() => { const c = [...document.querySelectorAll('#panelbody .ik-chip')].find((x) => x.textContent.includes('霧')); c?.click(); });
    await page.waitForTimeout(100);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#panelbody .ik-chip')].find((x) => x.textContent.includes('光')); c?.click(); });
    await page.waitForTimeout(200);
    const rw = await page.evaluate((uid) => window.__game.sys.inv.findItem(uid).item.rw || '', setup.white);
    check('宝石: ルーンを順にはめるとルーン語になる', rw === 'rw_insight', rw);
    await shot('gems_socket');
    await clickTab('ルーン語'); await shot('gems_words');
    await clickTab('深淵の宝石'); await shot('gems_lgems');
    // 極意
    await openP('codex'); await shot('codex');
    // 商人
    await openP('merchant');
    const b0 = await page.evaluate(() => window.__game.state.inv.bag.length);
    await clickBtn('指輪');
    const b1 = await page.evaluate(() => window.__game.state.inv.bag.length);
    check('商人: 目利きで品物が増える', b1 === b0 + 1, `${b0}→${b1}`);
    await shot('merchant_gamble');
    await clickTab('ミシック交換'); await shot('merchant_mythic');
    await clickTab('素材'); await shot('merchant_mats');
    // 持ち物
    await openP('bag');
    await clickTab('バッグ');
    await clickBtn('選んで分解');
    await page.evaluate(() => { [...document.querySelectorAll('#panelbody .grid .cell:not(.empty)')].slice(0, 3).forEach((c) => c.click()); });
    await page.waitForTimeout(150);
    await shot('bag_multi');
    const picked = await page.evaluate(() => document.querySelectorAll('#panelbody .cell.ik-pick').length);
    check('持ち物: まとめて選べる', picked >= 1, `${picked}`);
    await clickBtn('やめる');
    await clickTab('自動の振り分け'); await clickBtn('L3'); await shot('bag_filter');
    const preset = await page.evaluate(() => window.__game.state.inv.filter.autoSalvage.rare === true);
    check('持ち物: プリセットで振り分けが変わる', preset);
    // ツールチップ（ユニーク・セット）
    await clickTab('バッグ');
    for (const r of ['unique', 'set', 'mythic']) {
      const cell = await page.$(`#panelbody .grid .cell.r-${r}`);
      if (cell) { await cell.hover(); await page.waitForTimeout(200); await shot(`tooltip_${r}`); }
    }
    const tipOk = await page.$('#tooltip .ik-flavor, #tooltip .ik-setbox');
    check('ツールチップ: 言い伝え・セット効果が出る', !!tipOk);
    await page.mouse.move(5, 5);
    // スマホの幅でアイテムの窓がはみ出さない
    const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mp = await mc.newPage();
    mp.on('pageerror', (e) => errors.push(`items mobile pageerror: ${e.message}`));
    mp.on('console', (m) => { if (m.type() === 'error') errors.push(`items mobile console: ${m.text()}`); });
    await mp.goto(`http://127.0.0.1:${PORT}/index.html`);
    await mp.waitForSelector('#title');
    await mp.evaluate(() => localStorage.clear());
    await mp.reload(); await mp.waitForSelector('#title');
    await mp.click('.slot.empty .btn'); await mp.click('.title-box .btn-primary'); await mp.waitForSelector('#scene');
    await mp.evaluate(async () => { const g = window.__game; const { generateItem } = await import('/src/game/loot.js'); g.state.hero.level = 40; for (let i = 0; i < 8; i++) g.state.inv.bag.push(generateItem(g.rng, { ilvl: 40, rarity: i % 2 ? 'legendary' : 'unique', cls: g.state.hero.cls })); g.state.inv.gems = { ember_2: 5, star_1: 3 }; g.state.inv.mats.shard = 200; });
    let wide = [];
    for (const id of ['craft', 'gems', 'codex', 'merchant', 'bag']) {
      await mp.evaluate((pid) => window.__ui.openPanel(pid), id);
      await mp.waitForTimeout(150);
      if (await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) wide.push(id);
      if (id === 'craft' || id === 'gems') { await mp.evaluate(() => document.querySelector('#panel')?.scrollIntoView()); await mp.screenshot({ path: path.join(SHOTS, `items_mobile_${id}.png`) }); }
    }
    check('アイテムの窓: スマホで横にはみ出さない', !wide.length, wide.join(','));
    await mc.close();
  }
  // ===================== アイテム担当ここまで =====================
  check('エラーが 0 件', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  srv.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
