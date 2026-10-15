// 公開の形（claude.ai の Artifact）の確かめ。
//   1. tools/build_artifact.mjs で dist/artifact/ を作り、決まり（外側の無いページ・title・部品の一覧・読む先）を確かめる。
//   2. Chromium で、別の場所（origin）の親ページから <iframe sandbox="allow-scripts allow-same-origin"> に入れて通しで動かす
//      （allow-modals・allow-downloads・allow-popups は無し。公開のときに足される外側と、外のサイトを読めない決まり〔CSP〕もまねる）。
//        A: ふつう … タイトル → 新しく始める → 遊ぶ → すべての窓 → 保存 → 読み直し → 画像の差し替え（入れる・パックの書き出し〔コピー〕・読み込み・型紙）
//           → 設定のセーブの書き出し・読み込み
//        B: localStorage / IndexedDB が使えない（触ると例外）… 同じ流れで落ちない・「保存できない」ことを知らせる
//        C: srcdoc で入れる
//        D: 公開のときに downloads の力を付けたら、パック・型紙をファイルで保存できる（window.claude.use のまね）
//        L: タイトルに戻って始め直しても、前の画面がメモリに残らない
//      どれも console のエラー 0 件・confirm / alert / prompt / ダウンロード / window.open を使っていないこと。
// 実行: node tests/qa_publish.mjs   （PORT=8305 など。写真は tests/screenshots/publish_*.png）
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, verify, makeContentPage } from '../tools/build_artifact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8305;
// 確かめ用に作る場所（公開用の dist/artifact は触らない。同時に走らせても混ざらないよう PORT ごと）
const OUT = path.join(ROOT, 'dist', `qa-${PORT}`);
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

const results = [];
function check(name, ok, info = '') { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✔' : '✘'} ${name}${info ? `  (${info})` : ''}`); }

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  for (const r of ['/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}

// ---------------------------------------------------------------- 公開の外側と決まりのまね
const ART = `127.0.0.1:${PORT}`; // Artifact のページの場所
const HOST = `localhost:${PORT}`; // 親（claude.ai のまね）。場所が違う＝別の origin
/** 公開のときに足される外側（charset・viewport・小さなリセット） */
export function wrapSkeleton(content) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${content}\n</body></html>`;
}
/** 外のサイトを読めない決まり（自分のファイル・Google Fonts・data:/blob: の絵と音だけ。fetch は自分のファイルだけ） */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
].join('; ');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const SANDBOX = 'allow-scripts allow-same-origin';

function parentPage(mode) {
  const frame = mode === 'srcdoc'
    ? `<iframe id="art" sandbox="${SANDBOX}" srcdoc="${wrapSkeleton(fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`
    : `<iframe id="art" sandbox="${SANDBOX}" src="http://${ART}/index.html"></iframe>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>parent</title><style>html,body{margin:0;height:100%;background:#777}iframe{border:0;width:100%;height:100%;display:block}</style></head><body>${frame}</body></html>`;
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (u === '/__parent.html' || u === '/__parent_srcdoc.html') {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(parentPage(u.includes('srcdoc') ? 'srcdoc' : 'src'));
        return;
      }
      // srcdoc の iframe は親と同じ場所から部品を読む
      if (req.headers.host !== ART && req.headers.host !== HOST) { res.writeHead(404); res.end('nf'); return; }
      const f = path.join(OUT, u === '/' ? 'index.html' : u);
      const head = { 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP };
      if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, head); res.end('nf'); return; }
      if (u === '/' || u === '/index.html') {
        res.writeHead(200, { ...head, 'Content-Type': MIME['.html'] });
        res.end(wrapSkeleton(fs.readFileSync(f, 'utf8')));
        return;
      }
      res.writeHead(200, { ...head, 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

/** 埋め込み先で使えない物を使ったら記録する（どの枠の中でも） */
const RECORD_BLOCKED = `(() => {
  window.__blocked = [];
  for (const k of ['alert', 'confirm', 'prompt', 'print', 'open']) {
    const orig = window[k];
    window[k] = function (...a) { window.__blocked.push(k); return orig ? orig.apply(this, a) : undefined; };
  }
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download') || /^(blob|data):/.test(this.href)) window.__blocked.push('download'); return click.call(this); };
})();`;
/** localStorage / sessionStorage / IndexedDB に触ると例外（Artifact の枠の中だけ） */
const BREAK_STORAGE = `(() => {
  if (location.host !== '${ART}' && location.href !== 'about:srcdoc') return;
  for (const k of ['localStorage', 'sessionStorage', 'indexedDB']) {
    try { Object.defineProperty(window, k, { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); } catch {}
  }
})();`;

async function frameOf(page) {
  const el = await page.waitForSelector('iframe#art');
  const f = await el.contentFrame();
  await f.waitForSelector('#title', { timeout: 20000 });
  return f;
}

/** 窓を開く（まとまりのタブ → 窓のタブ） */
async function nav(f, id) {
  await f.evaluate((x) => { const ui = window.__ui; if (ui && !ui.canOpen(x)) ui.unlockAll(); }, id);
  const grp = await f.getAttribute(`.navbtn[data-id="${id}"]`, 'data-grp');
  if (grp && !(await f.isVisible(`.navbtn[data-id="${id}"]`))) await f.click(`.navgrp[data-g="${grp}"]`);
  await f.click(`.navbtn[data-id="${id}"]`);
}

/** 小さな PNG（色の付いた丸・白い背景）を作る */
async function samplePng(f) {
  const b64 = await f.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 96, 128);
    x.fillStyle = '#c33'; x.beginPath(); x.ellipse(48, 70, 30, 50, 0, 0, Math.PI * 2); x.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

function watch(page, errors, tag) {
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/fonts\.g/.test(t)) errors.push(`${tag} console: ${t}`);
    // sandbox が止めた操作（warning でも出る）
    if (/sandboxed|allow-modals|allow-downloads|allow-popups|Content Security Policy/i.test(t) && m.type() !== 'error') errors.push(`${tag} ${m.type()}: ${t}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const u = r.url(); if (!/fonts\.g/.test(u)) errors.push(`${tag} requestfailed: ${u} ${r.failure()?.errorText || ''}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g/.test(r.url())) errors.push(`${tag} http ${r.status()}: ${r.url()}`); });
  page.on('download', (d) => errors.push(`${tag} download: ${d.suggestedFilename()}`));
  page.on('popup', () => errors.push(`${tag} popup`));
  page.on('dialog', (d) => { errors.push(`${tag} dialog: ${d.type()}`); d.dismiss().catch(() => {}); });
}

async function startNew(f, cls = 1) {
  await f.click('.slot.empty .btn');
  await f.locator('.classcards').waitFor();
  await f.click(`.classcard:nth-child(${cls})`);
  await f.click('.title-box .btn-primary');
  await f.locator('#scene').waitFor();
}

async function blocked(f) { return f.evaluate(() => window.__blocked || ['(記録なし)']); }

async function closeModals(f) {
  for (let i = 0; i < 4; i++) {
    const x = await f.$('#modals .modal-wrap:last-child .modal-x');
    if (!x) break;
    await x.click();
    await f.waitForTimeout(80);
  }
}

// ---------------------------------------------------------------- A: ふつうの埋め込み
async function runNormal(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(RECORD_BLOCKED);
  const page = await ctx.newPage();
  watch(page, errors, 'A');
  await page.goto(`http://${HOST}/__parent.html`);
  let f = await frameOf(page);
  check('A: 別の origin の sandbox iframe でタイトルが出る', await f.$('#title'));
  const t = await f.evaluate(() => ({ title: document.title, fit: !!document.querySelector('meta[name="claude:viewport-fit-sides"]'), scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor }));
  check('A: ページの名前・viewport-fit-sides・暗い配色（外側の color-scheme:light に負けない）', t.title === 'ABYSS DROP' && t.fit && t.scheme === 'dark' && t.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(t));
  await page.screenshot({ path: path.join(SHOTS, 'publish_title.png') });
  const audio0 = await f.evaluate(() => window.__audio?.debug?.().ctx || '?');
  await startNew(f);
  check('A: 新しく始められる', await f.$('#scene'));
  await f.click('#scene', { position: { x: 300, y: 200 } }); // 音はクリックのあと
  await f.waitForTimeout(3500);
  const st = await f.evaluate(() => ({ kills: window.__game.state.meta.stats.kills, err: String(window.__lastError || ''), audio: window.__audio?.debug?.().ctx || '?' }));
  check('A: 戦っている（ループのエラーなし）', st.kills > 0 && !st.err, `kills=${st.kills} ${st.err}`);
  check('A: 音はクリックのあとで動き出す', audio0 === 'none' && st.audio === 'running', `${audio0} → ${st.audio}`);
  await f.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 150; i++) g.tick(0.05); });
  // すべての窓
  const ids = await f.evaluate(() => { window.__ui.unlockAll(); return [...document.querySelectorAll('.navbtn')].map((b) => b.dataset.id); });
  const bad = [];
  for (const id of ids) {
    await nav(f, id);
    await f.waitForTimeout(120);
    const b = await f.$('.panel .bad');
    const tx = b ? await b.textContent() : '';
    if (tx.startsWith('表示できませんでした')) bad.push(`${id}: ${tx}`);
    await closeModals(f);
  }
  check(`A: すべての窓が開ける（${ids.length} 個）`, ids.length >= 15 && !bad.length, bad.join(' / '));
  await page.screenshot({ path: path.join(SHOTS, 'publish_panels.png') });
  // 保存 → 読み直し → つづきから
  const before = await f.evaluate(() => ({ lvl: window.__game.state.hero.level, kills: window.__game.state.meta.stats.kills }));
  await f.click('.tb-save');
  await f.waitForTimeout(200);
  const saveToast = await f.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent).join('|'));
  check('A: 上の帯の「保存」で保存しましたと出る', saveToast.includes('保存しました'), saveToast);
  await page.reload();
  f = await frameOf(page);
  const cont = await f.$('#title .btn-primary.big');
  check('A: 読み直すと「つづきから」が出る', cont && (await cont.textContent()).includes('つづきから'));
  await cont.click();
  await f.waitForSelector('#scene');
  const after = await f.evaluate(() => ({ lvl: window.__game.state.hero.level, kills: window.__game.state.meta.stats.kills }));
  check('A: つづきから同じ進み具合で遊べる', after.lvl === before.lvl && after.kills >= before.kills, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  // 画像の差し替え
  await nav(f, 'assets');
  await f.waitForSelector('.as-card');
  const id0 = await f.getAttribute('.as-card', 'data-id');
  const png = await samplePng(f);
  await (await f.$('.as-card input[type=file]')).setInputFiles(png);
  await f.waitForSelector('.modal-wrap .btn-primary');
  await f.click('.modal-wrap .btn-primary'); // 権利の案内「わかった」
  await f.waitForFunction((id) => window.__assets.studio.has(id), id0, { timeout: 5000 });
  check('A: 画像を入れられる（IndexedDB）', await f.evaluate((id) => window.__assets.isCustom(id), id0), id0);
  // 型紙を保存 → 埋め込み先ではダウンロードせず、絵を出す
  await f.click(`.as-card[data-id="${id0}"]`);
  await f.waitForSelector('.modal.studio');
  const tplBtn = await f.$('.modal.studio .modal-foot button:has-text("型紙")');
  if (tplBtn) await tplBtn.click();
  await f.waitForTimeout(400);
  const tpl = await f.evaluate(() => ({ img: !!document.querySelector('.modal-wrap:last-child .modal-body img'), btn: [...document.querySelectorAll('.modal-wrap:last-child .modal-foot button')].map((b) => b.textContent) }));
  check('A: 型紙は絵で出す（ダウンロードしない・保存するボタンを出さない）', tpl.img && !tpl.btn.some((x) => /保存/.test(x)), JSON.stringify(tpl));
  await closeModals(f);
  for (let i = 0; i < 3 && (await f.$('.modal.studio')); i++) {
    const close = await f.$('.modal.studio .modal-foot button:has-text("閉じる")');
    await close?.click();
    await f.waitForTimeout(150);
    const yes = await f.$('.modal-wrap:last-child .modal-foot .btn-primary');
    if (yes && !(await f.$('.modal.studio:only-child'))) await yes.click().catch(() => {});
  }
  await closeModals(f);
  // パックを書き出す（ダウンロードできないので文字で出してコピー）
  await f.click('.panel-assets button:has-text("パックを書き出す")');
  await f.waitForSelector('.st-pack textarea');
  const exp = await f.evaluate(() => [...document.querySelectorAll('.modal-wrap:last-child .modal-foot button')].map((b) => b.textContent));
  check('A: パックの書き出しにダウンロードのボタンが無い（埋め込み先では動かない）', !exp.some((x) => /ダウンロード/.test(x)), exp.join(','));
  const copyBtn = await f.$('.modal-wrap:last-child .modal-foot button:has-text("コピー")');
  await copyBtn.click();
  await f.waitForFunction(() => document.querySelector('.st-pack textarea')?.value.length > 100, null, { timeout: 8000 });
  const packText = await f.$eval('.st-pack textarea', (t) => t.value);
  await f.waitForTimeout(300);
  const copyToast = await f.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent).join('|'));
  let pack = null; try { pack = JSON.parse(packText); } catch { /* 下で失敗 */ }
  check('A: パックを文字で出してコピーできる（だめなら選んでコピーの案内）', pack?.format === 'abyss-drop-assetpack' && Object.keys(pack.assets).length === 1 && /コピー/.test(copyToast), `${packText.length}B ${copyToast}`);
  await closeModals(f);
  // すべて元に戻す（ページの中の確認）→ パックを読み込む
  await f.click('.panel-assets button:has-text("すべて元に戻す")');
  await f.waitForSelector('.modal-wrap .modal-foot .btn-primary');
  await f.click('.modal-wrap .modal-foot .btn-primary');
  await f.waitForFunction(() => window.__assets.studio.size === 0, null, { timeout: 5000 });
  await f.click('.panel-assets button:has-text("パックを読み込む")');
  await f.waitForSelector('.st-pack textarea');
  await f.$eval('.st-pack textarea', (t, v) => { t.value = v; }, packText);
  await f.click('.modal-wrap:last-child .modal-foot .btn-primary');
  await f.waitForFunction((id) => window.__assets.studio.has(id), id0, { timeout: 8000 }).catch(() => {});
  check('A: パックを読み込める（data: を fetch しない）', await f.evaluate((id) => window.__assets.studio.has(id), id0));
  await closeModals(f);
  // 設定: セーブの書き出し → 読み込み（ページの中の確認）
  await nav(f, 'settings');
  await f.click('.panel-settings button:has-text("書き出す")');
  const save = await f.$eval('.panel-settings textarea.savebox', (t) => t.value);
  check('A: セーブを文字で書き出せる', save.startsWith('ABYSS1:'), `${save.length}B`);
  await f.evaluate(() => { window.__game.state.meta.gold = 12345; });
  await f.click('.panel-settings button:has-text("読み込む")');
  await f.waitForSelector('.modal-wrap .modal-foot .btn-primary');
  await f.click('.modal-wrap .modal-foot .btn-primary');
  await f.waitForTimeout(300);
  const gold = await f.evaluate(() => window.__game.state.meta.gold);
  check('A: 貼り付けたセーブを読み込める（確認はページの中）', gold !== 12345, `gold=${gold}`);
  await page.screenshot({ path: path.join(SHOTS, 'publish_settings.png') });
  // 埋め込み先で枠が隠される（display:none）と、タブはそのままなので visibilitychange が来ず、rAF だけ止まる。
  // 隠されていた間（ここでは 10 分たったことにする）も、放置の稼ぎとして渡す
  await page.evaluate(() => { document.getElementById('art').style.display = 'none'; });
  await page.waitForTimeout(800);
  await f.evaluate(() => { window.__rep = null; window.__game.events.on('offlineReport', (r) => { window.__rep = { reason: r.reason, seconds: Math.round(r.seconds) }; }); window.__game.state.lastTick -= 600000; });
  await page.evaluate(() => { document.getElementById('art').style.display = ''; });
  await page.waitForTimeout(1200);
  const rep = await f.evaluate(() => window.__rep);
  check('A: 枠が隠されていた間（10 分）も放置の稼ぎになる', rep && rep.seconds >= 590 && rep.seconds <= 620, JSON.stringify(rep));
  await closeModals(f);
  const bl = await blocked(f);
  check('A: confirm / alert / prompt / ダウンロード / window.open を使っていない', !bl.length, bl.join(','));
  check('A: エラーが 0 件', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- B: 保存の場所が使えない
async function runNoStorage(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(RECORD_BLOCKED);
  await ctx.addInitScript(BREAK_STORAGE);
  const page = await ctx.newPage();
  watch(page, errors, 'B');
  await page.goto(`http://${HOST}/__parent.html`);
  const f = await frameOf(page);
  const broken = await f.evaluate(() => { try { localStorage.length; return false; } catch { return true; } });
  check('B: （準備）localStorage に触ると例外になる', broken);
  const warn = await f.evaluate(() => document.querySelector('#title')?.textContent || '');
  check('B: タイトルに「このブラウザでは保存できない」と出る', /保存できません/.test(warn), warn.slice(0, 80));
  await page.screenshot({ path: path.join(SHOTS, 'publish_nostorage_title.png') });
  await startNew(f);
  await f.click('#scene', { position: { x: 300, y: 200 } });
  await f.waitForFunction(() => window.__game?.state?.meta?.stats?.kills > 0, null, { timeout: 15000 }).catch(() => {}); // 最初の 1 体まで（敵を硬くしてから 2〜4 秒）
  const st = await f.evaluate(() => ({ kills: window.__game.state.meta.stats.kills, err: String(window.__lastError || '') }));
  check('B: 保存できなくても遊べる', st.kills > 0 && !st.err, `kills=${st.kills} ${st.err}`);
  await f.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 60; i++) g.tick(0.05); });
  for (const id of ['hero', 'bag', 'skills', 'map', 'settings', 'assets']) { await nav(f, id); await f.waitForTimeout(80); }
  await nav(f, 'hero');
  await f.click('.tb-save');
  await f.waitForTimeout(200);
  const toast = await f.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent).join('|'));
  check('B: 「保存」を押すと、保存できないことと書き出しの案内が出る（保存しましたと言わない）', /保存できません/.test(toast) && !/保存しました/.test(toast), toast);
  await nav(f, 'assets');
  await f.waitForSelector('.as-card');
  const warnA = await f.evaluate(() => document.querySelector('.panel-assets .ed-warn')?.textContent || '');
  check('B: 画像の窓に「保存できない」の注意', /保存できません/.test(warnA), warnA.slice(0, 60));
  const id0 = await f.getAttribute('.as-card', 'data-id');
  await (await f.$('.as-card input[type=file]')).setInputFiles(await samplePng(f));
  await f.waitForSelector('.modal-wrap .btn-primary');
  await f.click('.modal-wrap .btn-primary');
  await f.waitForFunction((id) => window.__assets.studio.has(id), id0, { timeout: 5000 }).catch(() => {});
  check('B: 画像は入れられる（閉じるまで）', await f.evaluate((id) => window.__assets.isCustom(id), id0));
  await nav(f, 'settings');
  await f.click('.panel-settings button:has-text("書き出す")');
  const save = await f.$eval('.panel-settings textarea.savebox', (t) => t.value);
  check('B: セーブを文字で書き出せる', save.startsWith('ABYSS1:'));
  const warnS = await f.evaluate(() => document.querySelector('.panel-settings')?.textContent || '');
  check('B: 設定のセーブの所に「保存できない」の注意', /保存できません/.test(warnS));
  // タイトルへ戻って、もう一度始めても落ちない（メモリの中のセーブで続けられる）
  await f.click('.panel-settings button:has-text("タイトルへ")');
  await f.waitForSelector('#title');
  const cont = await f.$('#title .btn-primary.big');
  check('B: 閉じるまではメモリの中のセーブで「つづきから」', cont && (await cont.textContent()).includes('つづきから'));
  await cont?.click();
  await f.waitForSelector('#scene');
  await page.screenshot({ path: path.join(SHOTS, 'publish_nostorage.png') });
  const bl = await blocked(f);
  check('B: confirm / alert / prompt / ダウンロードを使っていない', !bl.length, bl.join(','));
  check('B: エラーが 0 件', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- C: srcdoc で入れる
async function runSrcdoc(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(RECORD_BLOCKED);
  const page = await ctx.newPage();
  watch(page, errors, 'C');
  await page.goto(`http://${HOST}/__parent_srcdoc.html`);
  const f = await frameOf(page);
  await startNew(f, 3);
  // 最初の 1 体を倒すまで待つ（敵を硬くしてから、最初の 1 体に 2〜4 秒かかる）
  await f.waitForFunction(() => window.__game?.state?.meta?.stats?.kills > 0, null, { timeout: 15000 }).catch(() => {});
  const st = await f.evaluate(() => ({ kills: window.__game.state.meta.stats.kills, wide: document.documentElement.scrollWidth > window.innerWidth + 1 }));
  check('C: srcdoc の iframe（スマホ横）でも始めて戦える・横にはみ出さない', st.kills > 0 && !st.wide, JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOTS, 'publish_srcdoc.png') });
  check('C: エラーが 0 件', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- D: 公開のときに downloads の力（capabilities: { downloads: true }）を付けた
/** claude.ai の見る画面が渡す window.claude のまね（use('downloads') は少し遅れて答える。save は見る人が「保存」を押したことにする） */
const FAKE_CLAUDE = `(() => {
  if (location.host !== '${ART}') return;
  window.__saved = [];
  const dl = Object.freeze({ save: async ({ filename, data }) => { window.__saved.push({ filename, size: data?.size ?? data?.length ?? 0 }); return { status: 'saved' }; } });
  window.claude = Object.freeze({ use: (n) => new Promise((r) => setTimeout(() => r(n === 'downloads' ? dl : null), 150)) });
})();`;

async function runDownloads(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(RECORD_BLOCKED);
  await ctx.addInitScript(FAKE_CLAUDE);
  const page = await ctx.newPage();
  watch(page, errors, 'D');
  await page.goto(`http://${HOST}/__parent.html`);
  const f = await frameOf(page);
  await startNew(f);
  await nav(f, 'assets');
  await f.locator('.as-card').first().waitFor();
  const id0 = await f.getAttribute('.as-card', 'data-id');
  await f.locator('.as-card input[type=file]').first().setInputFiles(await samplePng(f));
  await f.click('.modal-wrap .btn-primary');
  await f.waitForFunction((id) => window.__assets.studio.has(id), id0, { timeout: 5000 });
  await f.click('.panel-assets button:has-text("パックを書き出す")');
  await f.click('.modal-wrap:last-child .modal-foot button:has-text("ダウンロード")');
  await f.waitForFunction(() => window.__saved.length >= 1, null, { timeout: 8000 }).catch(() => {});
  const s1 = await f.evaluate(() => window.__saved.slice());
  check('D: downloads の力があれば、パックをファイルで保存できる（見る人が確かめる）', s1.length === 1 && /\.json$/.test(s1[0].filename) && s1[0].size > 100, JSON.stringify(s1));
  await closeModals(f);
  await f.click(`.as-card[data-id="${id0}"]`);
  await f.locator('.modal.studio').waitFor();
  await f.click('.modal.studio .modal-foot button:has-text("型紙を保存")');
  await f.waitForFunction(() => window.__saved.length >= 2, null, { timeout: 8000 }).catch(() => {});
  const s2 = await f.evaluate(() => window.__saved.slice());
  check('D: 型紙を PNG で保存できる', s2.length === 2 && /\.template\.png$/.test(s2[1].filename), JSON.stringify(s2[1] || null));
  const bl = await blocked(f);
  check('D: a[download] を使っていない', !bl.length, bl.join(','));
  check('D: エラーが 0 件', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- タイトルに戻って始め直しても、前の画面が残らない
async function runLeak(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(COUNT_WORK);
  const page = await ctx.newPage();
  watch(page, errors, 'L');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`http://${ART}/index.html`);
  await page.locator('#title').waitFor();
  await startNew(page);
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 * 120; i++) g.tick(0.05); window.__ui.unlockAll(); for (const id of ['bag', 'skills', 'map', 'hero']) window.__ui.openPanel(id); });
  const count = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    return page.evaluate((nodes) => ({ bus: [...window.__game.events.map.values()].reduce((a, x) => a + x.size, 0), assets: window.__assets.listeners.size, nodes }), m.Nodes);
  };
  const back = async () => {
    await page.evaluate(() => window.__ui.opts.onTitle());
    await page.locator('#title .btn-primary.big').click();
    await page.locator('#scene').waitFor();
    await page.waitForTimeout(200);
  };
  await back();
  const a = await count();
  await page.evaluate(() => { window.__oldUi = new WeakRef(window.__ui); window.__oldScene = new WeakRef(window.__ui.scene); });
  for (let k = 0; k < 4; k++) await back();
  await page.evaluate(() => window.__ui.openPanel('hero'));
  const b = await count();
  const gone = await page.evaluate(() => ({ ui: !window.__oldUi.deref(), scene: !window.__oldScene.deref() }));
  check('L: タイトルに戻って始め直しても、出来事の聞き手が増えない', b.bus === a.bus && b.assets === a.assets, `${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  check('L: 前の画面（UI・戦闘の画面）がメモリから消える', gone.ui && gone.scene, JSON.stringify(gone));
  check('L: DOM の数が増えない（4 回始め直す）', b.nodes < a.nodes + 300, `${a.nodes} → ${b.nodes}`);
  // 長く遊んで、すべての枠の絵（コードの絵）を一度は描いたことにする → 使い回しの絵が上限を超えて残らない
  const all = await page.evaluate(() => {
    const A = window.__assets;
    const ids = [...A.slots.keys()];
    for (const id of ids) A.sprite(id);
    const again = A.sprite(ids[0]); // 捨てた絵も、また描ける
    return { n: ids.length, cacheMB: Math.round(A.cacheBytes / 1048576), again: !!again?.img && again.img.width > 0 };
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const cv = await page.evaluate(() => window.__liveCanvases());
  check(`L: すべての枠（${all.n} 個）の絵を描いても、使い回しの絵は上限まで（${all.cacheMB}MB・生きているキャンバス ${cv.mb}MB）`, all.cacheMB <= 64 && cv.mb < 160 && all.again, JSON.stringify({ ...all, ...cv }));
  check('L: エラーが 0 件', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 長く遊んだときの重さ（--perf=分。ふだんは走らせない）
/** フレームの仕事の時間と、作ったキャンバスの数（生きている物だけ）を数える */
const COUNT_WORK = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__ft = [];
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); try { cb(t); } finally { const ft = window.__ft; ft.push(performance.now() - s); if (ft.length > 4000) ft.splice(0, 2000); } });
  const ce = Document.prototype.createElement;
  window.__canv = [];
  Document.prototype.createElement = function (tag, ...a) { const el = ce.call(this, tag, ...a); if (String(tag).toLowerCase() === 'canvas') window.__canv.push(new WeakRef(el)); return el; };
  window.__liveCanvases = () => { window.__canv = window.__canv.filter((w) => w.deref()); let px = 0; for (const w of window.__canv) { const c = w.deref(); if (c) px += c.width * c.height; } return { all: window.__canv.length, inDom: document.querySelectorAll('canvas').length, mb: Math.round((px * 4) / 1048576) }; };
})();`;

async function runPerf(browser, minutes) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(COUNT_WORK);
  const page = await ctx.newPage();
  watch(page, errors, 'perf');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`http://${ART}/index.html`);
  await page.locator('#title').waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#title').waitFor();
  await startNew(page);
  await page.mouse.click(400, 300);
  await page.evaluate(() => { const g = window.__game; g.state.meta.unlocks.speed = 2; g.state.settings.speed = 4; window.__ui.unlockAll(); });
  const ids = await page.evaluate(() => [...document.querySelectorAll('.navbtn')].map((b) => b.dataset.id));
  const sample = async (label) => {
    // 比べやすいように、毎回同じ軽い窓（設定）を開いてから数える
    await nav(page, 'settings').catch(() => {});
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const p = await page.evaluate(() => {
      const ft = window.__ft.splice(0); ft.sort((a, b) => a - b);
      const g = window.__game;
      return { canv: window.__liveCanvases(), ftAvg: ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length), ft95: ft[Math.floor(ft.length * 0.95)] || 0, frames: ft.length, lvl: g.state.hero.level, zone: g.state.world.zone, fx: window.__ui?.scene?.fx?.parts?.length ?? null, units: g.combat?.units?.length ?? null, toasts: document.querySelectorAll('#toasts .toast').length, modals: document.querySelectorAll('.modal-wrap').length, bus: [...g.events.map.values()].reduce((a, x) => a + x.size, 0), aCache: window.__assets.cache.size, aThumbs: window.__assets.thumbs.size, aSprites: window.__assets.sprites.size, aListeners: window.__assets.listeners.size };
    });
    const row = { t: label, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, ...p };
    console.log(`  ${JSON.stringify(row)}`);
    return row;
  };
  const rows = [];
  const t0 = Date.now();
  let lastSample = 0; let lastTitle = Date.now(); let i = 0;
  rows.push(await sample('0m'));
  while (Date.now() - t0 < minutes * 60000) {
    i++;
    const r = Math.random();
    try {
      // ElementHandle を持ち続けると、その DOM がメモリに残って測り間違えるので、locator だけを使う
      const first = (sel) => page.locator(sel).first();
      if (r < 0.45) { await nav(page, ids[i % ids.length]); }
      else if (r < 0.65) { const c = first('.panel .cell:not(.empty)'); if (await c.count()) { await c.hover({ timeout: 2000 }); await page.waitForTimeout(150); await page.mouse.move(300, 300); } }
      else if (r < 0.75) { const b = first('.panel-title .help'); if (await b.count()) { await b.click({ timeout: 2000 }); await page.waitForTimeout(100); await page.keyboard.press('Escape'); } }
      else if (r < 0.85) { await page.mouse.move(200 + Math.random() * 600, 150 + Math.random() * 300); }
      else { const b = first('.panel button.btn-small:not([disabled])'); if (await b.count() && !/消|分解|転生|捨|売|リセット|戻す|振り直/.test(await b.textContent())) { await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(80); } }
      await page.evaluate(() => { for (const x of document.querySelectorAll('#modals .modal-wrap')) x.querySelector('.modal-x')?.click(); });
      // ときどきタイトルへ戻って、つづきから（前の画面の後始末を確かめる）
      if (Date.now() - lastTitle > 120000) {
        lastTitle = Date.now();
        await page.evaluate(() => window.__ui.opts.onTitle());
        await first('#title .btn-primary.big').click();
        await page.locator('#scene').waitFor();
      }
    } catch (e) { if (!/not attached|detached|Timeout/i.test(e.message)) errors.push(`perf action: ${e.message.split('\n')[0]}`); }
    await page.waitForTimeout(1500);
    if (Date.now() - lastSample > 60000) { lastSample = Date.now(); rows.push(await sample(`${((Date.now() - t0) / 60000).toFixed(1)}m`)); }
  }
  rows.push(await sample('end'));
  const base = rows[Math.min(2, rows.length - 1)]; // 立ち上がりの後（2 分）を基準
  const end = rows[rows.length - 1];
  const grow = (k) => (end[k] - base[k]) / Math.max(1, base[k]);
  check(`perf: ${minutes} 分で JS のメモリが増え続けない（基準 ${base.heapMB}MB → ${end.heapMB}MB）`, end.heapMB < base.heapMB * 1.35 + 5, `${(grow('heapMB') * 100).toFixed(0)}%`);
  check(`perf: DOM の数が増え続けない（${base.nodes} → ${end.nodes}）`, end.nodes < base.nodes * 1.5 + 2000);
  check(`perf: イベントの聞き手が増え続けない（${base.listeners} → ${end.listeners}）`, end.listeners < base.listeners * 1.5 + 300);
  check(`perf: 生きているキャンバスが増え続けない（${base.canv.all} 枚 ${base.canv.mb}MB → ${end.canv.all} 枚 ${end.canv.mb}MB）`, end.canv.all < base.canv.all * 1.5 + 50 && end.canv.mb < 200, JSON.stringify(end.canv));
  const peak = Math.max(...rows.map((x) => x.canv.mb));
  check(`perf: キャンバスの絵の大きさが上限の中（最大 ${peak}MB。スマホの Safari は 224〜384MB で絵が出なくなる）`, peak < 200);
  check(`perf: 1 フレームの仕事が軽い（平均 ${end.ftAvg.toFixed(2)}ms・95% ${end.ft95.toFixed(2)}ms）`, end.ftAvg < 12 && end.ft95 < 25);
  check('perf: エラーが 0 件', !errors.length, errors.slice(0, 5).join(' | '));
  fs.writeFileSync(path.join(SHOTS, 'publish_perf.json'), JSON.stringify(rows, null, 1));
  await ctx.close();
}

const main = async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const perfMin = Number((process.argv.find((a) => a.startsWith('--perf=')) || '').slice(7)) || 0;
  if (perfMin) {
    build({ quiet: true, out: OUT });
    const srv = await serve();
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch();
    try { await runPerf(browser, perfMin); } catch (e) { check('perf: 途中で止まらない', false, e.stack?.split('\n').slice(0, 3).join(' ')); } finally { await browser.close(); srv.close(); }
    const fail = results.filter((x) => !x.ok);
    console.log(`\nqa_publish (perf): ${results.length - fail.length} 通過 / ${fail.length} 失敗`);
    process.exit(fail.length ? 1 : 0);
  }
  // 1. 作る・決まり
  const r = build({ quiet: true, out: OUT });
  check('作る: dist/artifact ができる・決まりを満たす', !r.problems.length, r.problems.slice(0, 5).join(' / '));
  const n = Object.keys(r.files).length;
  check('作る: 部品は 250 個まで・テスト／道具／説明／型紙を入れない', n > 100 && n <= 250 && !Object.keys(r.files).some((k) => /^(tests|tools|docs)\/|templates|screenshots/.test(k)), `${n} 個`);
  const page = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  check('作る: 先頭が <title>ABYSS DROP</title>', page.startsWith('<title>ABYSS DROP</title>'));
  check('作る: 外側（doctype・html・head・body）が無い', !/<!doctype|<html|<head|<body/i.test(page));
  const fake = makeContentPage('<!doctype html><html><head><meta charset="utf-8"><title>X</title><link rel="stylesheet" href="style.css"></head><body><div id="app"></div><script type="module" src="src/main.js"></script></body></html>', 'a{}');
  check('作る: 中身だけのページの作り方（style.css は <style> に入る）', fake.startsWith('<title>X</title>') && fake.includes('<style>\na{}\n</style>') && !fake.includes('charset'));
  // 読む先が無いと気付けるか（1 つ消した一覧で確かめる）
  const tmp = path.join(OUT, 'files.json');
  const saved = fs.readFileSync(tmp, 'utf8');
  const cut = JSON.parse(saved); delete cut['src/engine/rng.js'];
  fs.writeFileSync(tmp, JSON.stringify(cut));
  const miss = verify(OUT);
  fs.writeFileSync(tmp, saved);
  check('作る: 公開していないモジュールを読んでいたら気付く', miss.some((p) => p.includes('rng.js')), miss[0] || '');
  // 保存の場所（Node で localStorage のまね）: 満杯で書けなかったときに、古いセーブを読み戻さない
  {
    const data = new Map();
    let full = false;
    globalThis.localStorage = {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => { if (full) throw new DOMException('quota', 'QuotaExceededError'); data.set(k, String(v)); },
      removeItem: (k) => data.delete(k),
      key: (i) => [...data.keys()][i] ?? null,
      get length() { return data.size; },
    };
    const { saveSlot, loadSlot, canPersist } = await import('../src/engine/save.js');
    const ok1 = saveSlot(2, { hero: { level: 1 }, inv: {} });
    const can = canPersist?.();
    full = true;
    const ok2 = saveSlot(2, { hero: { level: 7 }, inv: {} });
    const lv = loadSlot(2)?.hero?.level;
    check('保存: 書けたら true・満杯で書けなかったら false（知らせられる）', ok1 === true && ok2 === false, `${ok1} ${ok2}`);
    check('保存: 書けなかったときも、開いている間は新しいほうを読む（古いセーブに戻らない）', lv === 7, `Lv ${lv}`);
    check('保存: localStorage が使えるか調べられる', can === true, String(can));
    delete globalThis.localStorage;
  }
  // 2. 埋め込みで動かす
  const srv = await serve();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch(); // 音の自動再生は許さない（クリックのあと）
  try {
    if (want('normal')) await runNormal(browser);
    if (want('nostorage')) await runNoStorage(browser);
    if (want('srcdoc')) await runSrcdoc(browser);
    if (want('downloads')) await runDownloads(browser);
    if (want('leak')) await runLeak(browser);
  } catch (e) {
    check('途中で止まらない', false, e.stack?.split('\n').slice(0, 3).join(' '));
  } finally {
    await browser.close();
    srv.close();
  }
  const fail = results.filter((x) => !x.ok);
  console.log(`\nqa_publish: ${results.length - fail.length} 通過 / ${fail.length} 失敗`);
  process.exit(fail.length ? 1 : 0);
};

main();
