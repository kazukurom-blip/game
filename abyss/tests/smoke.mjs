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
  // ==================== assets（アセット担当: 画像の差し替え）ここから ====================
  if (want('assets')) {
    const actx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const ap = await actx.newPage();
    ap.on('console', (m) => { if (m.type() === 'error') errors.push(`assets console: ${m.text()}`); });
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
