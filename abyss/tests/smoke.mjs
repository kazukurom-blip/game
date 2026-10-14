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
    check('音: 効果音を裏（Worker）で作っている', after.rendered > 20, `worker=${after.worker} rendered=${after.rendered}`);
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
  check('エラーが 0 件', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  srv.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
