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

/** 窓を開く: まとまりのタブ → 窓のタブの順に押す（まだ開いていない機能は、テストのために全部開く） */
async function nav(p, id) {
  await p.evaluate((x) => { const ui = window.__ui; if (ui && !ui.canOpen(x)) ui.unlockAll(); }, id);
  const grp = await p.getAttribute(`.navbtn[data-id="${id}"]`, 'data-grp');
  if (grp && !(await p.isVisible(`.navbtn[data-id="${id}"]`))) await p.click(`.navgrp[data-g="${grp}"]`);
  await p.click(`.navbtn[data-id="${id}"]`);
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
      await nav(page, id);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOTS, `panel_${id}.png`) });
      const bad = await page.$('.panel .bad');
      const t = bad ? await bad.textContent() : '';
      check(`窓「${id}」が開ける`, !t.startsWith('表示できませんでした'), t);
    }
    // アイテムのツールチップ
    await nav(page, 'bag');
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
    const openP = async (id) => { await nav(page, id); await page.waitForTimeout(200); };
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
    await nav(page, 'settings');
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
    await nav(ap, 'assets');
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
    await nav(ap, 'hero');
    await ap.waitForTimeout(400);
    await shot('doll');
    await nav(ap, 'bag');
    await ap.waitForTimeout(300);
    const cellSel = await ev(() => { const g = window.__game; const it = g.state.inv.bag.find((x) => x.base.startsWith('sword')) || g.state.hero.equip.weapon; return it ? 'ok' : ''; });
    await nav(ap, 'hero');
    // 窓が描き直されると要素が入れ替わるので、見つけ直しながら乗せる
    let eqCell = null;
    for (let i = 0; i < 5 && !eqCell; i++) { try { await ap.hover('.eq-weapon .cell', { timeout: 2000 }); eqCell = await ap.$('.eq-weapon .cell'); } catch { await ap.waitForTimeout(200); } }
    if (eqCell) { await ap.waitForTimeout(250); await shot('tooltip'); }
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
    await nav(ap, 'assets');
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
    await nav(ap, 'assets');
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
  // ======== ワールド担当（world）: 地図・苦行・裂け目・門番・ため込み屋・ボスの特技 ========
  if (want('world')) {
    await page.evaluate(() => { const g = window.__game; g.newGame('sorcerer', 'world'); for (let i = 0; i < 20 * 60; i++) g.tick(0.05); });
    await nav(page, 'map');
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
    await nav(page, 'rift');
    await nav(page, 'map');
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
    await nav(page, 'rift');
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
  // ==================== メタ担当（転生・実績・図鑑・日課・ペット・記録・おかえり） ====================
  if (want('meta')) {
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `meta_${n}.png`) });
    const openTab = async (panel, tab) => {
      await nav(page, panel);
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
    const petUnit = await page.evaluate(() => !!window.__game.sys.pets.unit && Math.abs(window.__game.sys.pets.unit.x - window.__game.combat.hero.x) < 700);
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
  if (want('ui')) await smokeUi(browser, check, errors);
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

// ===================== ui（UI 担当）: タイトル・まとまりのタブ・少しずつ開く・案内・キー操作・下の欄・スマホ =====================
async function smokeUi(browser, check, errors) {
  const url = `http://127.0.0.1:${PORT}/index.html`;
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`ui ${tag} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`ui ${tag} console: ${m.text()}`); });
    p.on('dialog', (d) => { errors.push(`ui ${tag}: ブラウザの確認の窓が出た（${d.message()}）`); d.dismiss(); });
  };
  const fresh = async (p) => {
    await p.goto(url); await p.waitForSelector('#title');
    await p.evaluate(() => localStorage.clear());
    await p.reload(); await p.waitForSelector('#title');
  };
  const start = async (p) => { await p.click('.slot.empty .btn'); await p.waitForSelector('.classcards'); await p.click('.title-box .btn-primary'); await p.waitForSelector('#scene'); await p.waitForTimeout(400); };
  const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, `ui_${name}.png`) });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'pc');
  await fresh(page);
  // ---- タイトル
  const tt = await page.textContent('#title');
  check('UI: タイトルに 無課金・広告なし・スタミナなし と版', ['無課金', '広告なし', 'スタミナなし', 'v0.'].every((s) => tt.includes(s)) && tt.includes('コードで生成'));
  await page.click('.slot.empty .btn'); await page.waitForSelector('.classcard');
  const cards = await page.$$eval('.classcard', (els) => els.map((e) => e.querySelector('.cc-role')?.textContent || ''));
  check('UI: クラスのカードに役割（近接・遠距離・召喚）', cards.length === 5 && cards.some((c) => c.includes('召喚')) && cards.some((c) => c.includes('遠距離')), cards.join('/'));
  await shot(page, 'class');
  await page.click('.title-box .btn-primary'); await page.waitForSelector('#scene'); await page.waitForTimeout(500);
  // ---- 枠を消す確認（ページの中で）
  await page.evaluate(() => window.__ui.opts.onTitle());
  await page.waitForSelector('#title .slot-del');
  await page.click('#title .slot-del');
  const conf = await page.$('#title .slot.confirming');
  await page.click('#title .slot.confirming .btn >> text=やめる');
  const kept = !!(await page.$('#title .slot-del'));
  await page.click('#title .slot-del'); await page.click('#title .slot-del-ok');
  const gone = (await page.$$('#title .slot.empty')).length === 3;
  check('UI: 枠を消す確認がページの中に出る（やめる・消す）', !!conf && kept && gone);
  // ---- 新しく始める: 最初は少しだけ
  await start(page);
  const vis = async () => page.evaluate(() => ({
    grp: [...document.querySelectorAll('.navgrp')].filter((b) => !b.hidden).map((b) => b.dataset.g),
    sub: [...document.querySelectorAll('.navbtn')].filter((b) => !b.hidden).map((b) => b.dataset.id),
  }));
  const v0 = await vis();
  check('UI: 最初はまとまり 3 つ（キャラ・冒険・その他）', v0.grp.join(',') === 'chara,adv,other', v0.grp.join(','));
  check('UI: キャラの中は 装備・持ち物・スキル', v0.sub.join(',') === 'hero,bag,skills', v0.sub.join(','));
  const dockH = await page.evaluate(() => { const r = document.querySelector('#dock').getBoundingClientRect(); const s = document.querySelector('#scene').getBoundingClientRect(); return { dock: r.height, ratio: s.width / s.height, bottom: r.bottom }; });
  check('UI: 戦闘の画面（16:9）の下に下の欄', dockH.dock >= 140 && Math.abs(dockH.ratio - 16 / 9) < 0.02 && dockH.bottom <= 901, JSON.stringify(dockH));
  // ---- 少しずつ開く: Lv 5 で鍛冶
  await page.evaluate(() => { const g = window.__game; g.addXp(1e6); });
  await page.waitForTimeout(1400);
  const v1 = await vis();
  const ftoast = await page.$('.toast.feature');
  check('UI: レベルが上がると「新しい機能」の知らせと 鍛える のまとまり', !!ftoast && v1.grp.includes('forge') && v1.sub.includes('tree'), v1.grp.join(','));
  const newBadge = await page.textContent('.navgrp[data-g="forge"] .nav-badge');
  check('UI: まとまりのタブに NEW', newBadge === 'NEW', newBadge);
  await page.click('.navgrp[data-g="forge"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__ui.renderPanel()); // 描き直しても、読むまでは残る
  const intro = await page.$('.feature-intro');
  await shot(page, 'feature_intro');
  if (intro) await page.click('.feature-intro .btn >> text=わかった');
  const seen = await page.evaluate(() => !!window.__game.state.meta.tutorial.seen.craft && !document.querySelector('.feature-intro'));
  check('UI: 初めて開くと短い説明（わかった で消える・見た印が残る）', !!intro && seen);
  const nb = await page.evaluate(() => document.querySelector('.navbtn[data-id="craft"] .nav-badge').textContent);
  check('UI: 見たら NEW が消える', nb !== 'NEW', nb);
  // ---- 案内（3〜6 歩・飛ばせる）
  await page.evaluate(() => window.__ui.guide.start());
  await page.waitForSelector('.guide-bubble');
  const steps = await page.textContent('.gb-step');
  const ringOk = await page.evaluate(() => { const r = document.querySelector('.guide-ring').getBoundingClientRect(); const t = document.querySelector('#hud .hud-auto').getBoundingClientRect(); return Math.abs(r.left + 6 - t.left) < 3 && r.width > t.width; });
  await shot(page, 'guide');
  let n = 0;
  while (await page.$('.guide .gb-next') && n < 10) { await page.click('.guide .gb-next'); await page.waitForTimeout(80); n++; }
  const gdone = await page.evaluate(() => window.__game.state.meta.tutorial.guide);
  check('UI: 案内が 6 歩で、目印が HUD を指し、最後まで進める', steps.endsWith('/ 6') && ringOk && n === 6 && gdone === 'done', `${steps} ring=${ringOk} n=${n} ${gdone}`);
  await page.evaluate(() => window.__ui.guide.start());
  await page.click('.guide .gb-skip');
  check('UI: 案内は飛ばせる', !(await page.$('.guide')) && (await page.evaluate(() => window.__game.state.meta.tutorial.guide)) === 'skip');
  // ---- キー操作
  await page.mouse.click(300, 300);
  const keyRes = [];
  for (const [k, id] of [['b', 'bag'], ['k', 'skills'], ['p', 'tree'], ['m', 'map'], ['i', 'hero']]) { await page.keyboard.press(k); await page.waitForTimeout(80); keyRes.push((await page.evaluate(() => window.__ui.current.id)) === id); }
  const a0 = await page.evaluate(() => window.__game.state.world.autoAdvance);
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  const a1 = await page.evaluate(() => window.__game.state.world.autoAdvance);
  await page.keyboard.press('Space');
  await page.keyboard.press('2'); await page.waitForTimeout(60);
  const sp = await page.evaluate(() => window.__game.state.settings.speed);
  await page.keyboard.press('1');
  await page.click('.panel-title .help'); await page.waitForSelector('.modal-wrap');
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  const closed = !(await page.$('.modal-wrap'));
  check('UI: キー操作（I・B・K・P・M・Space・数字・Esc）', keyRes.every(Boolean) && a0 !== a1 && sp === 2 && closed, `${keyRes} auto ${a0}→${a1} speed=${sp} esc=${closed}`);
  await page.click('.navgrp[data-g="other"]'); await nav(page, 'settings');
  const howto = await page.textContent('.panel-settings');
  check('UI: 設定に 遊び方 とキーの一覧', howto.includes('遊び方') && howto.includes('Space') && howto.includes('Esc'));
  // ---- 戦力・下の欄・レアリティの印
  // 自動装備は最初からオンで、ドロップも少ないので、ここだけオフにしてバッグに何か入るまで進める
  await page.evaluate(() => { const g = window.__game; g.state.inv.filter.autoEquip = false; for (let i = 0; i < 20 * 600 && (i < 20 * 90 || g.state.inv.bag.length < 3); i++) g.tick(0.05); });
  await page.waitForTimeout(300);
  await nav(page, 'bag');
  const marks = await page.$$eval('#panelbody .grid .cell .rmark', (els) => els.map((e) => e.textContent));
  check('UI: マスにレアリティの文字（色だけに頼らない）', marks.length > 0 && marks.every((m) => /^[並魔稀秀伝組唯神][★✦]?$/.test(m)), marks.slice(0, 6).join(''));
  const pw = await page.evaluate(async () => {
    const g = window.__game;
    const it = g.state.inv.bag.find((x) => !g.sys.inv.equipProblem(x, x.slot === 'ring' ? 'ring1' : x.slot) && g.sys.inv.isUpgrade(x));
    if (!it) return { skip: true };
    g.sys.inv.equip(it.uid);
    await new Promise((r) => setTimeout(r, 400));
    return { v: document.querySelector('.tb-power .v').textContent, d: document.querySelector('.tb-power .d').textContent };
  });
  check('UI: 上の帯の戦力が ▲▼ で変わる', pw.skip || /[▲▼]/.test(pw.d), JSON.stringify(pw));
  await page.click('#dock .dock-tab[data-t="loot"]');
  await page.click('#dock .chipbtn >> text=すべて');
  await page.waitForTimeout(100);
  const rows = (await page.$$('#dock .dl-row')).length;
  if (rows) { await page.click('#dock .dl-row'); await page.waitForTimeout(150); }
  const opened = await page.evaluate(() => !!document.querySelector('.modal-wrap') || [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('手元') || t.textContent.includes('倉庫')));
  await shot(page, 'dock_loot');
  check('UI: 直近のドロップ（押すとアイテムの窓）', rows > 0 && opened, `rows=${rows}`);
  await page.keyboard.press('Escape');
  for (const t of ['pace', 'log', 'goal']) { await page.click(`#dock .dock-tab[data-t="${t}"]`); await page.waitForTimeout(60); }
  const goal = await page.textContent('#dock .dock-body');
  check('UI: 次の目標（ボス・必要 DPS・手段）', goal.includes('次の目標') && (goal.includes('必要') || goal.includes('魔境')), goal.slice(0, 60));
  // ---- 操作の直後はマウスが乗っていても描き直す
  await nav(page, 'hero');
  await page.mouse.move(1400, 600); await page.mouse.move(1402, 602);
  const rr = await page.evaluate(async () => {
    const mark = () => { document.querySelector('.panel-hero').dataset.mark = '1'; };
    mark();
    window.__game.events.emit('gearChanged', {});
    await new Promise((r) => setTimeout(r, 400));
    const deferred = document.querySelector('.panel-hero')?.dataset.mark === '1';
    return { deferred };
  });
  await page.click('.panel-hero .dollwrap', { position: { x: 5, y: 5 } });
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => document.querySelector('.panel-hero')?.dataset.mark !== '1');
  check('UI: マウスが乗っている間は待ち、押した直後に描き直す', rr.deferred && after, JSON.stringify({ ...rr, after }));
  // ---- ボスの残り時間 m:ss・魔境のローマ数字
  const hud = await page.evaluate(async () => {
    const g = window.__game; const w = g.state.world;
    w.maxStage[w.zone] = 10; g.sys.world.challengeBoss();
    for (let i = 0; i < 400 && !(g.sys.world.bossTimer > 0); i++) g.tick(0.05);
    window.__ui.hud.update(1);
    const boss = document.querySelector('#hud .hud-stage').textContent;
    w.maxTorment = 3; w.torment = 3;
    window.__ui.hud.update(1);
    const tor = document.querySelector('#hud .hud-zone').textContent;
    w.torment = 0; w.maxTorment = 0;
    return { boss, tor };
  });
  check('UI: ボスの残り時間は m:ss、魔境はローマ数字', /残り \d+:\d\d/.test(hud.boss) && hud.tor.includes('魔境 III'), JSON.stringify(hud));
  // ---- 画面の大きさ（1280×720・1920×1080）
  for (const [w, hh] of [[1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: hh });
    await page.waitForTimeout(250);
    const lay = await page.evaluate(() => { const d = document.querySelector('#dock').getBoundingClientRect(); const s = document.querySelector('#scene').getBoundingClientRect(); return { dock: Math.round(d.height), r: s.width / s.height, over: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 }; });
    await shot(page, `pc_${w}`);
    check(`UI: ${w}×${hh} で 16:9 の画面と下の欄が収まる`, lay.dock >= 140 && Math.abs(lay.r - 16 / 9) < 0.02 && !lay.over, JSON.stringify(lay));
  }
  await ctx.close();
  // ---- スマホ: 下のタブ・横に流せる窓のタブ・はみ出し 0（visualViewport で確かめる）
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  watch(mp, 'mobile');
  await fresh(mp);
  await start(mp);
  const bar = await mp.evaluate(() => { const r = document.querySelector('.nav-groups').getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height), vh: Math.round(window.visualViewport?.height || innerHeight), fixed: getComputedStyle(document.querySelector('.nav-groups')).position }; });
  check('UI: スマホでまとまりのタブが画面の下', bar.fixed === 'fixed' && Math.abs(bar.bottom - bar.vh) <= 1 && bar.h >= 44, JSON.stringify(bar));
  await mp.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 60; i++) g.tick(0.05); window.__ui.unlockAll(); });
  let wide = '';
  for (const id of await mp.evaluate(() => [...document.querySelectorAll('.navbtn')].map((b) => b.dataset.id))) {
    await mp.evaluate((x) => window.__ui.openPanel(x), id);
    await mp.waitForTimeout(120);
    const o = await mp.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vv: Math.round(window.visualViewport?.width || innerWidth), panel: Math.round(document.querySelector('#panel').getBoundingClientRect().width) }));
    if (o.doc > o.vv + 1 || o.body > o.vv + 1 || o.panel > o.vv + 1) wide += `${id}:${o.doc}/${o.panel}>${o.vv} `;
  }
  check('UI: スマホで どの窓も横にはみ出さない（visualViewport）', !wide, wide);
  const subs = await mp.evaluate(() => { const s = document.querySelector('.nav-subs'); return { ox: getComputedStyle(s).overflowX, w: s.getBoundingClientRect().width, vv: window.visualViewport?.width || innerWidth }; });
  check('UI: スマホの窓のタブは横に流せる', subs.ox === 'auto' && subs.w <= subs.vv + 1, JSON.stringify(subs));
  await mp.tap('.dock-strip');
  await mp.waitForTimeout(150);
  const dopen = await mp.evaluate(() => document.querySelector('#dock').classList.contains('open') && document.querySelector('#dock .dock-body').getBoundingClientRect().height > 40);
  await shot(mp, 'mobile_dock');
  check('UI: スマホで 次の目標の帯を押すと開く', dopen);
  await mp.tap('.dock-strip');
  await mp.tap('.navgrp[data-g="collect"]');
  await mp.waitForTimeout(150);
  await shot(mp, 'mobile_collect');
  const grpOk = await mp.evaluate(() => window.__ui.current && ['pets', 'bounties', 'achievements', 'bestiary', 'stats'].includes(window.__ui.current.id));
  check('UI: スマホで 下のタブから窓を開ける', grpOk);
  await m.close();
}
