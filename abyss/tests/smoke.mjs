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
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('fonts.g')) errors.push(`http ${r.status()}: ${r.url()}`); });
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
  // ===== combat（戦闘・スキル担当）: 中身は下の smokeCombat =====
  if (want('combat')) await smokeCombat(page, check);
  // ===== /combat =====
  // ==================== audio（サウンド担当）: 音の確かめ ====================
  if (want('audio')) {
    const wav = (sec = 0.25, f = 660) => {
      const sr = 22050; const n = Math.floor(sr * sec); const b = Buffer.alloc(44 + n * 2);
      b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
      b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * f * i) / sr) * 12000 * Math.min(1, (n - i) / 400)), 44 + i * 2);
      return b;
    };
    // 1) クリックする前は AudioContext を作らない → クリックで作られる
    const ap = await ctx.newPage();
    ap.on('pageerror', (e) => errors.push(`audio pageerror: ${e.message}`));
    ap.on('console', (m) => { if (m.type() === 'error') errors.push(`audio console: ${m.text()}`); });
    // custom.json の "audio" に書いた音（フォルダの差し替え）も読めるか: 偽の custom.json を返す
    await ap.route('**/assets/custom/custom.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ audio: { 'sfx.gold': 'audio/test_gold.wav' } }) }));
    await ap.route('**/assets/custom/audio/test_gold.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav(0.2, 1320) }));
    await ap.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ap.waitForSelector('#title');
    const before = await ap.evaluate(() => window.__audio?.debug());
    check('音: クリックする前は AudioContext を作らない', before && before.ctx === 'none', JSON.stringify(before)?.slice(0, 80));
    await ap.mouse.click(5, 5);
    await ap.waitForTimeout(1500);
    const after = await ap.evaluate(() => window.__audio.debug());
    check('音: クリックで AudioContext が動き出す', after.ctx === 'running' && after.voices === 24, `${after.ctx} voices=${after.voices}`);
    check('音: タイトルの曲が流れる', after.music === 'title', after.music);
    // 機械が忙しいと Worker の作業が遅れるので、最大 8 秒待つ
    let rendered = after.rendered;
    for (let i = 0; i < 16 && !(rendered > 20); i++) { await ap.waitForTimeout(500); rendered = (await ap.evaluate(() => window.__audio.debug())).rendered; }
    check('音: 効果音を裏（Worker）で作っている', rendered > 20, `worker=${after.worker} rendered=${rendered}`);
    check('音: custom.json の "audio" の差し替えを読む', after.custom.includes('sfx.gold'), after.custom.join(','));
    await ap.close();
    // 2) 遊んでいる画面で: 戦闘の音・章の曲・ボスの曲
    await page.mouse.click(300, 300);
    await page.evaluate(() => { const g = window.__game; g.newGame('warrior', 'おと'); });
    await page.waitForTimeout(4000);
    let d = await page.evaluate(() => window.__audio.debug());
    check('音: 戦闘の効果音が鳴っている', d.stats.played > 5 && (d.stats.byCat.combat || 0) > 0, JSON.stringify(d.stats.byCat));
    check('音: 第一章の曲が流れる', d.music === 'act1', d.music);
    check('音: BGM の音符を予約している', d.music_stats.notes > 5, `notes=${d.music_stats.notes}`);
    await page.evaluate(() => { const g = window.__game; const w = g.state.world; w.maxStage[w.zone] = 10; w.stage = 10; g.sys.world.startStage(); });
    await page.waitForTimeout(2500);
    d = await page.evaluate(() => window.__audio.debug());
    check('音: ボスの面でボスの曲に変わる', /^boss/.test(d.music), d.music);
    await page.evaluate(() => { window.__audio.setMusic('act3'); });
    await page.waitForTimeout(1500);
    d = await page.evaluate(() => window.__audio.debug());
    check('音: 曲を選んで試聴できる（凍てつく峰）', d.music === 'act3', d.music);
    await page.evaluate(() => { window.__audio.setMusic('auto'); const g = window.__game; g.state.world.stage = 1; g.sys.world.startStage(); });
    // 3) 設定の「音」
    await page.click('.navbtn[data-id="settings"]');
    await page.waitForSelector('.snd');
    const ranges = await page.$$eval('.snd input.snd-range', (els) => els.length);
    check('音: 設定に音の区切り（音量 3 本）がある', ranges === 3, `ranges=${ranges}`);
    await page.evaluate(() => { const r = document.querySelectorAll('.snd input.snd-range')[2]; r.value = '10'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    const bgm = await page.evaluate(() => ({ s: window.__game.state.settings.bgm, g: window.__audio.engine.musicBus.gain.value }));
    check('音: BGM の音量を変えられる', Math.abs(bgm.s - 0.1) < 1e-6, JSON.stringify(bgm));
    await page.evaluate(() => { const r = document.querySelectorAll('.snd input.snd-range')[2]; r.value = '35'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.snd label.chk:has-text("すべての音を消す") input');
    await page.waitForTimeout(150);
    const muted = await page.evaluate(() => ({ m: window.__game.state.settings.audio.mute, st: window.__audio.engine.ctx.state }));
    check('音: 消音できる（AudioContext ごと止めて CPU を使わない）', muted.m === true && muted.st === 'suspended', JSON.stringify(muted));
    await page.click('.snd label.chk:has-text("すべての音を消す") input');
    await page.waitForTimeout(200);
    const unmuted = await page.evaluate(() => window.__audio.engine.ctx.state);
    check('音: 消音を戻すと鳴る', unmuted === 'running', unmuted);
    await page.screenshot({ path: path.join(SHOTS, 'audio_settings.png') });
    // 4) 音の差し替え（ボタンからファイルを入れる → 保存される → 戻す）
    await page.click('details.snd-custom > summary');
    await page.click('details.snd-custom .tab:has-text("画面の操作")');
    const row = page.locator('.snd-slot', { hasText: 'sfx.ui_click' });
    await row.locator('input[type=file]').setInputFiles({ name: 'sfx.ui_click.wav', mimeType: 'audio/wav', buffer: wav(0.15, 880) });
    await page.waitForFunction(() => window.__audio.engine.custom.has('sfx.ui_click'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const has = await page.evaluate(() => window.__audio.engine.custom.has('sfx.ui_click'));
    check('音: 差し替えの音を入れられる', has);
    await page.screenshot({ path: path.join(SHOTS, 'audio_custom.png') });
    const saved = await page.evaluate(async () => { const { idb } = await import('/src/engine/storage.js'); const r = await idb.get('kv', 'audio:sfx.ui_click'); return !!(r && r.bytes && r.bytes.byteLength > 100); });
    check('音: 差し替えはブラウザに保存される（IndexedDB）', saved);
    await page.locator('.snd-slot', { hasText: 'sfx.ui_click' }).locator('button:has-text("戻す")').click();
    await page.waitForTimeout(300);
    const gone = await page.evaluate(() => !window.__audio.engine.custom.has('sfx.ui_click'));
    check('音: 差し替えを元に戻せる', gone);
    // 5) 別のタブを見ている間は止める
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const hid = await page.evaluate(() => window.__audio.engine.ctx.state);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => window.__audio.engine.ctx.state);
    check('音: タブを離れると止まり、戻ると鳴る', hid === 'suspended' && back === 'running', `${hid} → ${back}`);
    // 6) すべての効果音を一度ずつ鳴らしてもエラーが出ない
    const n = await page.evaluate(async () => { const a = window.__audio; let k = 0; for (const s of a.custom ? Object.keys((await import('/src/audio/sfx.js')).SFX) : []) { a.preview(`sfx.${s}`); k++; await new Promise((r) => setTimeout(r, 15)); } return k; });
    await page.waitForTimeout(800);
    const fin = await page.evaluate(() => window.__audio.debug());
    check('音: すべての効果音が鳴らせる', n >= 40 && fin.stats.sources > n * 0.8, `n=${n} sources=${fin.stats.sources}`);
  }
  // ==================== /audio ====================
  // ==================== assets（アセット担当: 画像の差し替え）ここから ====================
  if (want('assets')) {
    const actx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const ap = await actx.newPage();
    ap.on('console', (m) => { if (m.type() === 'error') errors.push(`assets console: ${m.text()}`); });
    ap.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('fonts.g')) errors.push(`assets http ${r.status()}: ${r.url()}`); });
    ap.on('pageerror', (e) => errors.push(`assets pageerror: ${e.message}`));
    const shot = (name) => ap.screenshot({ path: path.join(SHOTS, `assets_${name}.png`) });
    const ev = (fn, arg) => ap.evaluate(fn, arg);
    // テスト用の画像をブラウザの canvas で作る（AI が出すような白・緑・黒の背景つき）
    await ap.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ap.waitForSelector('#title');
    const mk = (o) => ap.evaluate((o) => {
      const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
      const x = c.getContext('2d');
      if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, o.w, o.h); }
      const fr = o.frames || 1; const W = o.w / fr; const H = o.h;
      for (let f = 0; f < fr; f++) {
        x.save(); x.translate(f * W, 0);
        if (o.shape === 'hero') {
          x.fillStyle = '#3a2a22'; x.fillRect(W * 0.4, H * 0.62, W * 0.08, H * 0.3); x.fillRect(W * 0.52, H * 0.62, W * 0.08, H * 0.3);
          x.fillStyle = '#2a1a14'; x.fillRect(W * 0.38, H * 0.9, W * 0.12, H * 0.02); x.fillRect(W * 0.5, H * 0.9, W * 0.14, H * 0.02);
          const g = x.createLinearGradient(0, H * 0.25, 0, H * 0.65); g.addColorStop(0, '#c0392b'); g.addColorStop(1, '#6e1a12');
          x.fillStyle = g; x.beginPath(); x.ellipse(W * 0.5, H * 0.45, W * 0.16, H * 0.2, 0, 0, 7); x.fill();
          x.fillStyle = '#e8b890'; x.beginPath(); x.arc(W * 0.52, H * 0.17, W * 0.1, 0, 7); x.fill();
          x.fillStyle = '#ffffff'; x.fillRect(W * 0.56, H * 0.15, W * 0.03, H * 0.015); // 白い目（中の白は残るはず）
          x.fillStyle = '#e8b890'; x.beginPath(); x.arc(W * 0.66, H * 0.53, W * 0.04, 0, 7); x.fill(); // 前の手
        } else if (o.shape === 'sword') {
          x.fillStyle = '#d8dee8'; x.beginPath(); x.moveTo(W * 0.46, H * 0.72); x.lineTo(W * 0.5, H * 0.06); x.lineTo(W * 0.54, H * 0.72); x.fill();
          x.fillStyle = '#d9a83a'; x.fillRect(W * 0.3, H * 0.72, W * 0.4, H * 0.04);
          x.fillStyle = '#5a3820'; x.fillRect(W * 0.47, H * 0.76, W * 0.06, H * 0.16);
          x.fillStyle = '#ffd04a'; x.beginPath(); x.arc(W * 0.5, H * 0.94, W * 0.04, 0, 7); x.fill();
        } else if (o.shape === 'wolf' || o.shape === 'zombie') {
          const col = o.color || '#7a7a80';
          x.fillStyle = col;
          if (o.shape === 'wolf') {
            x.beginPath(); x.ellipse(W * 0.55, H * 0.6, W * 0.28, H * 0.14, 0, 0, 7); x.fill();
            x.beginPath(); x.arc(W * 0.25, H * 0.5, H * 0.1, 0, 7); x.fill();
            for (const lx of [0.35, 0.45, 0.65, 0.75]) x.fillRect(W * lx, H * 0.66, W * 0.05, H * 0.26);
            x.fillStyle = '#ff3a2a'; x.fillRect(W * 0.2, H * 0.47, W * 0.03, H * 0.02);
          } else {
            x.fillRect(W * 0.4, H * 0.6, W * 0.08, H * 0.32); x.fillRect(W * 0.52, H * 0.6, W * 0.08, H * 0.32);
            x.beginPath(); x.ellipse(W * 0.5, H * 0.45, W * 0.15, H * 0.19, 0, 0, 7); x.fill();
            x.beginPath(); x.arc(W * 0.46, H * 0.18, W * 0.1, 0, 7); x.fill();
            x.fillStyle = '#ffef7a'; x.fillRect(W * 0.38, H * 0.16, W * 0.03, H * 0.02);
          }
        } else if (o.shape === 'swing') {
          x.translate(W / 2, H / 2); x.rotate(-0.5 + f * 0.33);
          const g = x.createRadialGradient(0, 0, W * 0.2, 0, 0, W * 0.45); g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.7, '#ffcf6a'); g.addColorStop(1, 'rgba(255,120,30,0)');
          x.strokeStyle = g; x.lineWidth = W * 0.08; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, W * 0.34, -1.2, 1.0); x.stroke();
        } else if (o.shape === 'mid') {
          x.fillStyle = '#1e2234';
          for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * W / 8 - 40, H); x.lineTo(i * W / 8 + 40, H * (0.45 + (i % 3) * 0.08)); x.lineTo(i * W / 8 + 120, H); x.fill(); }
          x.fillRect(0, H * 0.82, W, H * 0.18);
        } else if (o.shape === 'title') {
          const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a0a10'); g.addColorStop(0.6, '#8a2a1a'); g.addColorStop(1, '#100406');
          x.fillStyle = g; x.fillRect(0, 0, W, H);
          const r = x.createRadialGradient(W / 2, H * 0.75, 10, W / 2, H * 0.75, W * 0.3); r.addColorStop(0, '#ffb060'); r.addColorStop(0.4, '#5a1a40'); r.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = r; x.fillRect(0, 0, W, H);
          x.fillStyle = '#0a0406'; x.fillRect(W * 0.62, H * 0.55, W * 0.02, H * 0.14);
        } else if (o.shape === 'logo') {
          x.font = `900 ${Math.round(H * 0.5)}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
          const g = x.createLinearGradient(0, H * 0.2, 0, H * 0.8); g.addColorStop(0, '#fff0b0'); g.addColorStop(1, '#b04a1a');
          x.lineWidth = H * 0.05; x.strokeStyle = '#2a0a06'; x.strokeText('ABYSS', W / 2, H / 2); x.fillStyle = g; x.fillText('ABYSS', W / 2, H / 2);
        } else if (o.shape === 'portrait') {
          const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a1a14'); g.addColorStop(1, '#0a0606'); x.fillStyle = g; x.fillRect(0, 0, W, H);
          x.fillStyle = '#c0392b'; x.beginPath(); x.ellipse(W * 0.5, H * 0.7, W * 0.3, H * 0.32, 0, 0, 7); x.fill();
          x.fillStyle = '#e8b890'; x.beginPath(); x.arc(W * 0.5, H * 0.3, W * 0.16, 0, 7); x.fill();
        } else if (o.shape === 'icon') {
          const g = x.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.45); g.addColorStop(0, '#fff4c0'); g.addColorStop(0.5, '#e07a2a'); g.addColorStop(1, '#2a1008');
          x.fillStyle = g; x.beginPath(); x.arc(W / 2, H / 2, W * 0.42, 0, 7); x.fill();
          x.strokeStyle = '#ffe8a0'; x.lineWidth = W * 0.05; x.beginPath(); x.moveTo(W * 0.3, H * 0.7); x.lineTo(W * 0.7, H * 0.3); x.stroke();
        }
        x.restore();
      }
      return c.toDataURL('image/png').split(',')[1];
    }, o).then((b64) => Buffer.from(b64, 'base64'));
    const png = async (name, o) => ({ name, mimeType: 'image/png', buffer: await mk(o) });
    const imgs = {
      hero: await png('hero.warrior.body.png', { w: 600, h: 900, bg: '#ffffff', shape: 'hero' }),
      sword: await png('gear.sword.png', { w: 400, h: 600, bg: '#00ff00', shape: 'sword' }),
      wolf: await png('monster.ash_wolf.png', { w: 700, h: 600, bg: '#ff00ff', shape: 'wolf', color: '#6a6a74' }),
      swing: await png('fx.w_slash.swing@4f12.png', { w: 1600, h: 400, bg: '#000000', shape: 'swing', frames: 4 }),
      mid: await png('bg.act1.mid.png', { w: 1536, h: 864, bg: '#00ff00', shape: 'mid' }),
      icon: await png('icon.skill.w_slash.png', { w: 256, h: 256, bg: '#1a1014', shape: 'icon' }),
      logo: await png('ui.logo.png', { w: 1536, h: 512, shape: 'logo' }),
      portrait: await png('hero.warrior.portrait.png', { w: 600, h: 840, shape: 'portrait' }),
      typo: await png('monstr.ash_wolf.png', { w: 200, h: 200, bg: '#ffffff', shape: 'wolf' }),
      zombie: await mk({ w: 500, h: 700, bg: '#ffffff', shape: 'zombie', color: '#6b8f5a' }),
      title: await mk({ w: 1536, h: 1024, shape: 'title' }),
    };
    // assets/custom（custom.json）の代わりを出す。audio の項目は画像として読まないこと
    const folder = { _format: 'abyss-drop-custom', 'ui.title': '__smoke/title.png', 'monster.rot_zombie': { file: '__smoke/zombie.png', opts: { bg: 'auto', trim: true } }, audio: { 'sfx.hit': 'audio/sfx.hit.ogg' } };
    await ap.route('**/assets/custom/custom.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(folder) }));
    // 音の項目は音の担当が読む。本物のファイルが無いので、短い無音の WAV を返す
    await ap.route('**/assets/custom/audio/**', (r) => { const n = 800; const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); r.fulfill({ contentType: 'audio/wav', body: b }); });
    await ap.route('**/assets/custom/__smoke/**', (r) => { const n = r.request().url().split('/').pop(); r.fulfill({ contentType: 'image/png', body: n === 'title.png' ? imgs.title : imgs.zombie }); });
    await ap.evaluate(() => localStorage.clear());
    await ap.reload();
    await ap.waitForSelector('#title');
    await ap.waitForTimeout(400);
    const fold = await ev(() => { const A = window.__assets; const z = A.custom.get('monster.rot_zombie'); const d = z.img.getContext('2d').getImageData(0, 0, 1, 1).data; return { title: A.custom.get('ui.title')?.source, zombie: z?.source, zw: z.img.width, zh: z.img.height, corner: d[3], audio: A.custom.has('audio') || A.folder.has('sfx.hit') }; });
    check('assets: custom.json の画像を読む（タイトル・敵）', fold.title === 'folder' && fold.zombie === 'folder', JSON.stringify(fold));
    check('assets: フォルダの画像の背景を抜いて小さくする', fold.corner === 0 && fold.zh <= 300 && !fold.audio, `${fold.zw}x${fold.zh} 角の透明度 ${fold.corner}`);
    await shot('title_custom');
    await ap.click('.slot.empty .btn');
    await ap.waitForSelector('.classcards');
    await ap.click('.title-box .btn-primary');
    await ap.waitForSelector('#scene');
    await ap.waitForTimeout(800);
    await ap.click('.navbtn[data-id="assets"]');
    await ap.waitForSelector('.panel-assets .as-card');
    await shot('panel');
    // 1) 調整の窓から入れる（白い背景 → 自動で抜く・足元を合わせる）→ 保存
    await ap.click('.as-card[data-id="hero.warrior.body"]');
    await ap.waitForSelector('.modal.studio');
    await ap.setInputFiles('.modal.studio input[type=file]', imgs.hero);
    await ap.waitForSelector('text=画像を入れる前に');
    await ap.click('.modal-foot .btn-primary >> text=わかった');
    await ap.waitForFunction(() => window.__assets.drafts.has('hero.warrior.body'));
    await ap.waitForTimeout(700);
    const dr = await ev(() => { const d = window.__assets.drafts.get('hero.warrior.body'); const c = d.img.getContext('2d'); const px = (x, y) => c.getImageData(x, y, 1, 1).data[3]; const W = d.img.width; const H = d.img.height; return { w: W, h: H, corner: px(0, 0), ay: d.opts.ay, eye: (() => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = c.getImageData(x, y, 1, 1).data; if (p[0] > 250 && p[1] > 250 && p[2] > 250 && p[3] > 250) return true; } return false; })() }; });
    check('assets: 白い背景を抜く（中の白い目は残る）・外側を切る・足元', dr.corner === 0 && dr.eye && dr.h <= 400 && dr.ay > 0.85, JSON.stringify(dr));
    await shot('editor_hero');
    await ap.click('.modal.studio .modal-foot .btn-primary');
    await ap.waitForFunction(() => window.__assets.studio.has('hero.warrior.body') && !document.querySelector('.modal.studio'));
    check('assets: 調整の窓から保存できる', true);
    // 2) カードの「入れる」（緑の背景の剣）→ 持ち物のアイコンも剣の画像になる
    await ap.click('.st-tabs .tab >> text=装備');
    await ap.waitForSelector('.as-card[data-id="gear.sword"]');
    await ap.setInputFiles('.as-card[data-id="gear.sword"] input[type=file]', imgs.sword);
    await ap.waitForFunction(() => window.__assets.studio.has('gear.sword'));
    const sw = await ev(() => ({ icon: window.__assets.sourceOf('icon.item.sword'), corner: window.__assets.custom.get('gear.sword').img.getContext('2d').getImageData(0, 0, 1, 1).data[3] }));
    check('assets: カードから入れる・アイコンは装備の絵を使う', sw.icon.source === 'studio' && sw.icon.from === 'gear.sword' && sw.corner === 0, JSON.stringify(sw));
    // 3) まとめて取り込む（ファイル名 = 枠 ID。@4f12 はコマ送り。間違った名前は案内）
    await ap.setInputFiles('.panel-assets .toolbar input[type=file]', [imgs.wolf, imgs.swing, imgs.mid, imgs.icon, imgs.logo, imgs.portrait, imgs.typo]);
    await ap.waitForSelector('text=まとめて取り込んだ結果');
    const rep = await ev(() => ({ text: document.querySelector('.st-report')?.textContent || '', wolf: window.__assets.studio.has('monster.ash_wolf'), swing: window.__assets.studio.get('fx.w_slash.swing')?.opts, mid: window.__assets.studio.has('bg.act1.mid') }));
    check('assets: まとめて取り込む（コマ送り・加算・背景）', rep.wolf && rep.mid && rep.swing?.frames === 4 && rep.swing?.fps === 12 && rep.swing?.blend === 'lighter', JSON.stringify(rep.swing));
    check('assets: 名前の間違いを案内する', rep.text.includes('monstr.ash_wolf.png') && rep.text.includes('monster.ash_wolf'), rep.text.slice(0, 120));
    await shot('bulk_report');
    await ap.click('.modal-foot .btn >> text=閉じる');
    // 4) ゲームの画面で使われる（戦闘・装備の絵・持ち物・ツールチップ）
    await ap.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 40; i++) g.tick(0.05); });
    await ap.waitForTimeout(900);
    await shot('battle');
    await ap.click('.navbtn[data-id="hero"]');
    await ap.waitForTimeout(400);
    await shot('doll');
    await ap.click('.navbtn[data-id="bag"]');
    await ap.waitForTimeout(300);
    const cellSel = await ev(() => { const g = window.__game; const it = g.state.inv.bag.find((x) => x.base.startsWith('sword')) || g.state.hero.equip.weapon; return it ? 'ok' : ''; });
    await ap.click('.navbtn[data-id="hero"]');
    const eqCell = await ap.$('.eq-weapon .cell');
    if (eqCell) { await eqCell.hover(); await ap.waitForTimeout(250); await shot('tooltip'); }
    check('assets: 装備の窓・ツールチップに出る', !!eqCell && cellSel === 'ok');
    // 5) 再読み込みしても残る（IndexedDB）
    await ap.reload();
    await ap.waitForSelector('#title');
    await ap.waitForTimeout(400);
    const kept = await ev(() => ['hero.warrior.body', 'gear.sword', 'monster.ash_wolf', 'fx.w_slash.swing', 'bg.act1.mid', 'icon.skill.w_slash', 'ui.logo', 'hero.warrior.portrait'].filter((id) => window.__assets.studio.has(id)).length);
    check('assets: 再読み込みしても残る', kept === 8, `${kept}/8`);
    await shot('title_logo');
    await ap.click('.slot.empty .btn');
    await ap.waitForSelector('.classcards');
    await ap.waitForTimeout(200);
    await shot('class_select');
    await ap.click('.title-box .btn >> text=もどる');
    await ap.click('.title-box .btn-primary');
    await ap.waitForSelector('#scene');
    await ap.waitForTimeout(600);
    // 6) 戦闘画面で見る（下書きのまま窓を隠す）・型紙
    await ap.click('.navbtn[data-id="assets"]');
    await ap.click('.st-tabs .tab >> text=敵・ボス');
    await ap.click('.as-card[data-id="monster.ash_wolf"]');
    await ap.waitForSelector('.modal.studio');
    await ap.waitForTimeout(500);
    await shot('editor_monster');
    await ap.click('.modal.studio button >> text=戦闘画面で見る');
    await ap.waitForSelector('.studio-back');
    await ap.waitForTimeout(1200);
    await shot('look_in_battle');
    await ap.click('.studio-back');
    const tpl = await ev(async () => { const m = await import('./src/render/template.js'); const c = m.renderTemplate('hero.warrior.body', { maxSide: 512 }); return [c.width, c.height]; });
    check('assets: 型紙を作れる', tpl[0] >= 384 && tpl[1] > 512, tpl.join('x'));
    await ap.click('.modal.studio .modal-foot .btn >> text=型紙を保存');
    await ap.waitForTimeout(300);
    await ap.click('.modal.studio .modal-foot .btn >> text=閉じる');
    await ap.waitForFunction(() => !document.querySelector('.modal.studio'));
    // 7) 演出の調整の窓（加算・コマ送りの試し表示）
    await ap.click('.st-tabs .tab >> text=スキルの演出');
    await ap.click('.as-card[data-id="fx.w_slash.swing"]');
    await ap.waitForSelector('.modal.studio');
    await ap.waitForTimeout(700);
    await shot('editor_fx');
    await ap.click('.modal.studio .modal-foot .btn >> text=閉じる');
    await ap.click('.st-tabs .tab >> text=主人公');
    await ap.click('.as-card[data-id="hero.warrior.body"]');
    await ap.waitForSelector('.modal.studio');
    const origInfo = await ev(() => document.querySelector('.modal.studio .ed-info')?.textContent || '');
    check('assets: 開き直すと元の画像から直せる', origInfo.includes('600×900'), origInfo.slice(0, 60));
    await ap.click('.modal.studio .modal-foot .btn >> text=閉じる');
    // 8) パックの書き出し（文字）→ すべて戻す → 読み込み
    await ap.click('.panel-assets .toolbar .btn >> text=パックを書き出す');
    await ap.click('.modal-foot .btn >> text=文字で表示');
    await ap.waitForFunction(() => (document.querySelector('.st-pack textarea')?.value || '').length > 1000);
    const packText = await ev(() => document.querySelector('.st-pack textarea').value);
    const pack = JSON.parse(packText);
    check('assets: パックを書き出せる', pack.format === 'abyss-drop-assetpack' && Object.keys(pack.assets).length === 8, `${Object.keys(pack.assets).length} 枚 ${Math.round(packText.length / 1024)}KB`);
    await ap.click('.modal-foot .btn >> text=閉じる');
    await ap.click('.panel-assets .toolbar .btn >> text=すべて元に戻す');
    await ap.click('.modal-foot .btn-primary >> text=すべて戻す');
    await ap.waitForFunction(() => window.__assets.studio.size === 0);
    const afterReset = await ev(() => ({ zombie: window.__assets.custom.get('monster.rot_zombie')?.source, hero: window.__assets.isCustom('hero.warrior.body') }));
    check('assets: すべて元に戻す（フォルダの画像は残る）', afterReset.zombie === 'folder' && !afterReset.hero, JSON.stringify(afterReset));
    await ap.click('.panel-assets .toolbar .btn >> text=パックを読み込む');
    await ap.fill('.st-pack textarea', packText);
    await ap.click('.modal-foot .btn-primary >> text=読み込む');
    await ap.waitForFunction(() => window.__assets.studio.size === 8, null, { timeout: 15000 });
    const reimp = await ev(() => window.__assets.studio.get('fx.w_slash.swing')?.opts?.frames);
    check('assets: パックを読み込める', reimp === 4, `frames=${reimp}`);
    // 9) 1 つだけ戻す（フォルダの画像に戻る）
    await ap.evaluate(async () => { await window.__assets.setCustom('monster.rot_zombie', await (await fetch('data:image/png;base64,' + btoa(String.fromCharCode(...new Uint8Array(await (await new Promise((r) => { const c = document.createElement('canvas'); c.width = 40; c.height = 60; c.getContext('2d').fillRect(5, 5, 30, 50); c.toBlob(r); })).arrayBuffer()))))).blob(), {}); });
    const pri = await ev(() => window.__assets.custom.get('monster.rot_zombie').source);
    await ev(() => window.__assets.removeCustom('monster.rot_zombie'));
    const back = await ev(() => window.__assets.custom.get('monster.rot_zombie')?.source);
    check('assets: ゲーム内の画像がフォルダより優先・戻すとフォルダの画像', pri === 'studio' && back === 'folder', `${pri} → ${back}`);
    await ap.waitForTimeout(300);
    await shot('panel_after');
    // 10) スマホの幅でも窓が使える
    await ap.setViewportSize({ width: 390, height: 844 });
    await ap.click('.navbtn[data-id="assets"]');
    await ap.click('.st-tabs .tab >> text=敵・ボス');
    await ap.click('.as-card[data-id="monster.ash_wolf"]');
    await ap.waitForSelector('.modal.studio');
    await ap.waitForTimeout(500);
    await shot('editor_mobile');
    const ov = await ev(() => document.querySelector('.modal.studio').getBoundingClientRect().width <= window.innerWidth + 1);
    check('assets: スマホの幅で調整の窓がはみ出さない', ov);
    await ap.click('.modal.studio .modal-foot .btn >> text=閉じる');
    await actx.close();
  }
  // ==================== assets ここまで ====================
  check('エラーが 0 件', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  srv.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });

// ===================== combat（戦闘・スキル担当）: スキルの窓・刻印・星座盤・パラゴン・奥義の演出 =====================
async function smokeCombat(page, check) {
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `combat_${name}.png`) });
  const panelOk = async (label) => { const bad = await page.$('.panel .bad'); const t = bad ? await bad.textContent() : ''; check(label, !t.startsWith('表示できませんでした'), t); };
  await page.evaluate(() => {
    const g = window.__game;
    g.newGame('warrior', '試し');
    const h = g.state.hero;
    h.level = 35; h.skillPoints = 12;
    g.sys.skills.learnUnlocked(true);
    for (const id of Object.keys(h.skills)) h.skills[id].lvl = 8;
    h.skills.w_cleave.rune = 'bleed';
    h.skills.w_cleave.mxp = 4000;
    for (const id of ['sup_area', 'sup_brutal', 'sup_bleed', 'sup_haste', 'sup_area']) g.sys.skills.addGlyph(g.sys.skills.makeGlyph({ id, level: 40 }), { quiet: true });
    const gl = g.state.inv.glyphs.find((x) => x.id === 'sup_brutal');
    g.sys.skills.socket('w_cleave', 0, gl.uid);
    h.tree.points = 30;
    g.combat.recalc(true);
    g.onSkillsChanged();
    window.__ui.openPanel('skills');
  });
  await page.waitForTimeout(400);
  check('スキルの窓に 12 個のスキル', (await page.$$('.sk2-card')).length === 12);
  await page.click('.sk2-card .sk2-top');
  await page.waitForTimeout(300);
  check('スキルを押すとルーン・刻印・条件が出る', !!(await page.$('.sk2-detail .sk2-rune')) && !!(await page.$('.sk2-detail .sk2-sock')));
  await shot('skills');
  await panelOk('スキルの窓（戦闘）が開ける');
  await page.click('.panel-skills .tabs .tab:nth-child(2)');
  await page.waitForTimeout(300);
  check('補助の刻印の一覧が出る', (await page.$$('.gl-row')).length >= 3);
  await shot('glyphs');
  // 星座盤
  const okAlloc = await page.evaluate(() => { const r = window.__game.sys.tree.allocate('warrior.b1.n'); window.__ui.openPanel('tree'); return r.ok; });
  await page.waitForTimeout(500);
  check('星座盤で要の点を振れる', okAlloc);
  const box = await (await page.$('.tr-canvas')).boundingBox();
  for (let i = 0; i < 6; i++) { await page.mouse.move(box.x + box.width / 2 + (i - 3) * 9, box.y + box.height / 2 - 30 - i * 12); await page.waitForTimeout(60); }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.42);
  await page.waitForTimeout(250);
  await shot('tree');
  // ドラッグとホイール
  await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 180, { steps: 5 }); await page.mouse.up();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
  await shot('tree_zoom');
  await panelOk('星座盤の窓が開ける');
  // パラゴン
  await page.evaluate(() => { const g = window.__game; g.state.hero.level = 100; g.state.hero.paragon.level = 120; g.sys.tree.autoParagon(); window.__ui.renderPanel(); });
  await page.click('.panel-tree .tabs .tab:nth-child(2)');
  await page.waitForTimeout(300);
  check('パラゴンの盤が 4 つ出る', (await page.$$('.pg-board')).length === 4);
  await shot('paragon');
  // 奥義の演出（各クラス）
  for (const cls of ['warrior', 'ranger', 'sorcerer', 'necromancer', 'assassin']) {
    const used = await page.evaluate((c) => {
      const g = window.__game;
      g.newGame(c, c);
      const h = g.state.hero; h.level = 55;
      g.sys.skills.learnUnlocked(true);
      for (const id of Object.keys(h.skills)) h.skills[id].lvl = 10;
      g.combat.recalc(true);
      g.sys.skills.autoArrange(true);
      g.onSkillsChanged();
      let ult = false;
      const hx = g.combat.hero.x;
      g.combat.spawnMonster('boss_butcher', { level: 30, rank: 'boss', x: hx + 260 });
      for (let i = 0; i < 6; i++) g.combat.spawnMonster('rot_zombie', { level: 30, x: hx + 300 + i * 40 });
      for (let i = 0; i < 20 * 8 && !ult; i++) { g.tick(0.05); ult = g.combat.fx.some((e) => e.t === 'ult'); }
      return ult;
    }, cls);
    await page.waitForTimeout(700);
    await shot(`ult_${cls}`);
    check(`${cls} が奥義を使う`, used);
  }
  // スマホの幅でスキルの窓と星座盤
  const browser = page.context().browser();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p2 = await m.newPage();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  p2.on('console', (msg) => { if (msg.type() === 'error') errs.push(msg.text()); });
  await p2.goto(page.url());
  await p2.waitForSelector('#title');
  await p2.evaluate(() => localStorage.clear());
  await p2.reload();
  await p2.waitForSelector('#title');
  await p2.click('.slot.empty .btn');
  await p2.click('.title-box .btn-primary');
  await p2.waitForSelector('#scene');
  await p2.evaluate(() => { const g = window.__game; g.state.hero.level = 20; g.sys.skills.learnUnlocked(true); g.state.hero.tree.points = 10; g.combat.recalc(true); g.onSkillsChanged(); window.__ui.openPanel('skills'); });
  await p2.waitForTimeout(400);
  await p2.evaluate(() => document.querySelector('#panel')?.scrollIntoView());
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: path.join(SHOTS, 'combat_mobile_skills.png') });
  const over1 = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.panel-skills .sk2-card, .panel-skills .sk2-bar')].some((e) => e.getBoundingClientRect().right > window.innerWidth + 1));
  await p2.evaluate(() => window.__ui.openPanel('tree'));
  await p2.waitForTimeout(500);
  await p2.evaluate(() => document.querySelector('.tr-canvas')?.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: path.join(SHOTS, 'combat_mobile_tree.png') });
  const over2 = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.panel-tree .tr-wrap, .panel-tree .tr-head')].some((e) => e.getBoundingClientRect().right > window.innerWidth + 1));
  check('スマホでスキル・星座盤が横にはみ出さない', !over1 && !over2);
  check('スマホでスキル・星座盤のエラーが 0 件', errs.length === 0, errs.slice(0, 3).join(' | '));
  await m.close();
}
