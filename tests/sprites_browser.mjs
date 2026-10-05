// 差し替えスプライトのブラウザテスト（Playwright）
//   node tests/sprites_browser.mjs        （npm run test:sprites）
// 1) manifest 無し / 壊れた manifest / 画像の一部欠け（＋不正な項目） → 例外・コンソールエラーなし、コード描画にフォールバック
// 2) テンプレート（assets/sprites_template/）を assets/sprites/ として配信（ネットワーク層で差し替え。ファイルはコピーしない）
//    → 全種をスプライトで描いて例外なし、コード描画との見比べスクショと差分、敵30体の描画時間
// スクショ: tests/screenshots/sprites_*.png
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const TPL = path.join(ROOT, 'assets', 'sprites_template');
const PORT = Number(process.env.PORT) || 8141;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/, /assets\/sprites\//, /\[sprites\]/, /404 \(Not Found\)/];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules_global', '/usr/local/lib/node_modules', '/usr/lib/node_modules']
    .filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright が見つかりません');
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function startServer() {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const problems = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) pass++; else { fail++; problems.push(name + (detail ? ' — ' + detail : '')); }
}

/** mode: 'none' | 'broken' | 'partial' | 'template' */
async function openGame(browser, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  await page.route('**/assets/sprites/**', async (route) => {
    const u = new URL(route.request().url());
    const rel = decodeURIComponent(u.pathname.split('/assets/sprites/')[1] || '');
    if (mode === 'none') return route.fulfill({ status: 404, body: '' });
    if (rel === 'manifest.json') {
      if (mode === 'broken') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":1, "enemies": {"slime_green": {"file": ' });
      const m = JSON.parse(fs.readFileSync(path.join(TPL, 'manifest.json'), 'utf8'));
      if (mode === 'partial') {
        // 不正な項目を混ぜる
        m.enemies.__bad1 = { file: 42 }; m.enemies.__bad2 = { file: '../../etc/passwd' }; m.enemies.__bad3 = 'x';
        m.pets.catPet = { ...m.pets.catPet, cell: [0, -5] };
        m.bosses.boss_king_slime = { ...m.bosses.boss_king_slime, rows: { idle: 'abc', walk: null } };
        m.chars.layers['hair:twin_front_f'] = { ...m.chars.layers['hair:twin_front_f'], file: 'chars/hair/__missing__.png' };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) });
    }
    const f = path.join(TPL, rel);
    // partial: 画像の約半分を欠けさせる（ファイル名のハッシュで決定的に）
    if (mode === 'partial') { let h = 0; for (const c of rel) h = (h * 31 + c.charCodeAt(0)) | 0; if (h & 1) return route.fulfill({ status: 404, body: '' }); }
    if (!f.startsWith(TPL) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(f) });
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.game && window.game.sprites, null, { timeout: 20000 });
  await sleep(300);
  // ゲーム開始（タイトルのテスト用フック）
  await page.evaluate(() => { localStorage.clear(); window.game._titleQuick = { slot: 0, create: { classId: 'luna', gender: 'f', name: 'テスト' } }; });
  await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
  await sleep(500);
  return { page, ctx, errs };
}

/** 敵・ボス・PET・人型を画面に並べて数フレーム回す */
async function populate(page) {
  return page.evaluate(async () => {
    const g = window.game;
    const { Enemy } = await import('./src/entities/enemy.js');
    const { ENEMIES, BOSS_IDS } = await import('./src/data/enemies.js');
    const { syncPet } = await import('./src/entities/pet.js').catch(() => ({}));
    g.debug.god = true;
    g.enemies.length = 0;
    g.spawner.timers = g.spawner.timers.map(() => -1e9);
    const p = g.player;
    const ids = Object.keys(ENEMIES).filter((id) => !BOSS_IDS.includes(id)).slice(0, 18);
    ids.forEach((id, i) => { const e = new Enemy(g, id, p.x - 560 + i * 62, g.map.groundY); e.aggro = false; e.speed = 0; g.enemies.push(e); });
    const b = new Enemy(g, 'boss_king_slime', p.x + 300, g.map.groundY); b.speed = 0; g.enemies.push(b);
    g.state.equipped.pet = 'pet_cat' in (await import('./src/data/items.js')).ITEMS ? 'pet_cat' : Object.keys((await import('./src/data/items.js')).ITEMS).find((k) => k.startsWith('pet_'));
    if (syncPet) syncPet(g);
    return g.enemies.length;
  });
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (!fs.existsSync(path.join(TPL, 'manifest.json'))) { console.error('assets/sprites_template/manifest.json がありません。先に npm run export:sprites'); process.exit(1); }
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });

  // ---------------------------------------------------------------- 1) フォールバック
  for (const mode of ['none', 'broken', 'partial']) {
    console.log(`\n[${mode}]`);
    const { page, ctx, errs } = await openGame(browser, mode);
    await populate(page);
    if (mode === 'partial') await page.evaluate(() => window.game.sprites.preloadSprites());
    // 各種状態・半透明・フラッシュ・反転も回す
    await page.evaluate(() => {
      const g = window.game;
      g.enemies.forEach((e, i) => { e.facing = i % 2 ? -1 : 1; if (i % 3 === 0) e.hurtT = 0.3; if (i % 5 === 0) e.state = 'attack'; });
      g.state.hp = Math.round(g.state.hp * 0.3);
    });
    await frames(page, 30);
    const st = await page.evaluate(() => ({ s: window.game.sprites.spriteStats(), err: window.game.lastError }));
    check(`${mode}: 例外・コンソールエラーなし`, errs.length === 0 && !st.err, errs.slice(0, 3).join(' | ') || st.err || '');
    if (mode === 'none') check('none: manifest 無し → 全部コード描画', st.s.manifest === 'none' && st.s.entries === 0, JSON.stringify({ m: st.s.manifest, n: st.s.entries }));
    if (mode === 'broken') check('broken: 壊れた manifest → 全部コード描画', st.s.manifest === 'broken' && st.s.entries === 0, st.s.manifest);
    if (mode === 'partial') check('partial: 一部欠けでも残りは読み込み・欠けは失敗として数える', st.s.loaded > 0 && st.s.failed > 0, `loaded ${st.s.loaded} failed ${st.s.failed} entries ${st.s.entries}`);
    // F2 パネルの切替ボタン
    const tg = await page.evaluate(() => { const d = window.game.debug; d.enabled = true; const a = d.run('sprites'); const m1 = window.game.sprites.getSpriteMode(); d.run('sprites'); return { a, m1, m2: window.game.sprites.getSpriteMode() }; });
    check(`${mode}: デバッグの「見た目」切替`, tg.m1 === 'procedural' && tg.m2 === 'auto', JSON.stringify(tg));
    await frames(page, 3);
    await page.screenshot({ path: path.join(SHOTS, `sprites_${mode}.png`) });
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2) テンプレートをスプライトとして使う
  console.log('\n[template]');
  const { page, ctx, errs } = await openGame(browser, 'template');
  const n = await page.evaluate(() => window.game.sprites.preloadSprites());
  const st0 = await page.evaluate(() => window.game.sprites.spriteStats());
  check('template: manifest 読込・全画像ロード', st0.manifest === 'ok' && st0.failed === 0 && st0.loaded >= st0.entries, `${st0.loaded}/${st0.entries} failed ${st0.failed}`);

  // 2a) 並べて描く（左=コード描画 / 右=スプライト）。全種
  const cmp = await page.evaluate(async () => {
    const S = window.game.sprites;
    const { drawCharacter } = await import('./src/render/character.js');
    const { drawEnemy } = await import('./src/render/enemyArt.js');
    const { drawPet, PET_STYLES } = await import('./src/render/pets.js');
    const { ENEMIES, BOSS_IDS } = await import('./src/data/enemies.js');
    const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
    const { starterEquipFor, looksFromIds, ITEMS } = await import('./src/data/items.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#2a2340'; document.body.appendChild(c); return c; };
    const out = {};
    const drawBoth = (name, w, h, fn) => {
      const c = mk(w * 2 + 10, h);
      const g = c.getContext('2d');
      g.fillStyle = '#3a3150'; g.fillRect(0, 0, c.width, h);
      S.setSpriteMode('procedural'); g.save(); fn(g, 0); g.restore();
      S.setSpriteMode('auto'); g.save(); g.translate(w + 10, 0); fn(g, 1); g.restore();
      // 差分（左右の平均絶対差 0..255）
      const a = g.getImageData(0, 0, w, h).data, b = g.getImageData(w + 10, 0, w, h).data;
      let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      out[name] = { diff: +(d / (a.length / 4) / 3).toFixed(2), url: c.toDataURL('image/png') };
      c.remove();
    };
    // 人型: 6 プリセット × いくつかの状態
    const states = [['idle', { t: 0.3 }], ['walk', { t: 0.2 }], ['jump', { t: 0.1 }], ['attack', { attackT: 0.45 }], ['hurt', { t: 0.08 }], ['climb', { t: 0.2 }], ['dead', { fallT: 1 }], ['idle', { t: 0.3, damage: 0.8 }], ['idle', { t: 0.3, flash: true }], ['walk', { t: 0.2, alpha: 0.5, facing: -1 }]];
    const heroes = [];
    for (const cls of ['luna', 'jin', 'hacker']) for (const gd of ['f', 'm']) heroes.push([DEFAULT_LOOKS[cls][gd], looksFromIds(starterEquipFor(cls, gd))]);
    drawBoth('chars', 1000, 6 * 110, (g) => {
      heroes.forEach(([look, eq], r) => states.forEach(([st, o], i) => drawCharacter(g, 50 + i * 95, 95 + r * 110, look, eq, { state: st, facing: 1, scale: 1, noCache: true, ...o })));
    });
    // 装備いろいろ（色違い・tint の確認）
    const items = Object.values(ITEMS).filter((it) => it.look && ['top', 'bottom', 'hat', 'accessory', 'weapon', 'shoes'].includes(it.slot));
    drawBoth('equip', 1000, 4 * 110, (g) => {
      for (let i = 0; i < 40; i++) {
        const it = items[(i * 7) % items.length];
        const look = i % 2 ? DEFAULT_LOOKS.jin.m : DEFAULT_LOOKS.luna.f;
        drawCharacter(g, 40 + (i % 10) * 96, 95 + Math.floor(i / 10) * 110, look, { [it.slot]: it.look }, { state: 'idle', t: 0.3, facing: 1, scale: 1 });
      }
    });
    const ids = Object.keys(ENEMIES).filter((id) => !BOSS_IDS.includes(id) && !ENEMIES[id].civilian);
    const cols = 12, rows = Math.ceil(ids.length / cols);
    drawBoth('enemies', 1100, rows * 120, (g) => {
      ids.forEach((id, i) => {
        const def = ENEMIES[id];
        const e = { def, defId: id, x: 45 + (i % cols) * 90, y: 100 + Math.floor(i / cols) * 120, w: def.w || 40, h: def.h || 40, state: i % 4 === 1 ? 'walk' : 'idle', t: 0.3, hurtT: 0, deadT: 0, facing: i % 2 ? -1 : 1, hp: 10, maxHp: 10, onGround: true, flying: def.ai === 'flyer', alpha: 1, seed: 99 };
        g.save(); g.scale(0.85, 0.85); drawEnemy(g, e); g.restore();
      });
    });
    drawBoth('bosses', 1300, 2 * 330, (g) => {
      BOSS_IDS.forEach((id, i) => {
        const def = ENEMIES[id];
        const e = { def, defId: id, x: 160 + (i % 4) * 320, y: 300 + Math.floor(i / 4) * 330, w: def.w || 40, h: def.h || 40, state: 'idle', t: 0.3, hurtT: 0, deadT: 0, facing: 1, hp: i % 2 ? 3 : 10, maxHp: 10, onGround: true, boss: true, alpha: 1 };
        g.save(); g.scale(0.5, 0.5); drawEnemy(g, e); g.restore();
      });
    });
    drawBoth('pets', 700, 2 * 90, (g) => {
      PET_STYLES.forEach((s, i) => drawPet(g, 40 + (i % 5) * 130, 75 + Math.floor(i / 5) * 90, { style: s }, { t: 0.3, state: i % 3 === 1 ? 'walk' : 'idle', facing: 1, scale: 1.4 }));
    });
    return out;
  });
  for (const [k, v] of Object.entries(cmp)) {
    fs.writeFileSync(path.join(SHOTS, `sprites_cmp_${k}.png`), Buffer.from(v.url.split(',')[1], 'base64'));
    check(`template: ${k} コード描画との差（平均）が小さい`, v.diff < 12, `diff ${v.diff}`);
  }

  // 2b) ゲーム画面
  await populate(page);
  await page.evaluate(() => window.game.sprites.preloadSprites());
  await page.evaluate(() => { const g = window.game; g.enemies.forEach((e, i) => { e.facing = i % 2 ? -1 : 1; }); });
  await frames(page, 20);
  await page.screenshot({ path: path.join(SHOTS, 'sprites_game_sprite.png') });
  await page.evaluate(() => window.game.sprites.setSpriteMode('procedural'));
  await frames(page, 5);
  await page.screenshot({ path: path.join(SHOTS, 'sprites_game_code.png') });
  await page.evaluate(() => window.game.sprites.setSpriteMode('auto'));

  // 2c) 性能: 敵30体（drawEnemy のみ）を 200 回
  const perf = await page.evaluate(async () => {
    const g = window.game, S = g.sprites;
    const { Enemy } = await import('./src/entities/enemy.js');
    const { MONSTER_IDS, BOSS_IDS } = await import('./src/data/enemies.js');
    const { drawEnemy } = await import('./src/render/enemyArt.js');
    const ids = MONSTER_IDS.filter((id) => !BOSS_IDS.includes(id));
    const es = [];
    for (let i = 0; i < 30; i++) { const e = new Enemy(g, ids[i % ids.length], 40 + (i % 15) * 80, 300 + Math.floor(i / 15) * 150); e.state = i % 2 ? 'walk' : 'idle'; es.push(e); }
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const ctx = c.getContext('2d');
    const run = (mode) => {
      S.setSpriteMode(mode);
      for (let k = 0; k < 20; k++) for (const e of es) { e.t += 0.016; drawEnemy(ctx, e); }   // ウォームアップ
      const t0 = performance.now();
      for (let k = 0; k < 200; k++) { ctx.clearRect(0, 0, 1280, 720); for (const e of es) { e.t += 0.016; if (k % 7 === 0) e.hurtT = 0.1; else e.hurtT = 0; drawEnemy(ctx, e); } }
      return (performance.now() - t0) / 200;
    };
    const sp = run('auto'), cd = run('procedural');
    S.setSpriteMode('auto');
    // 人型 10 人（レイヤー合成）
    const { drawCharacter } = await import('./src/render/character.js');
    const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
    const { starterEquipFor, looksFromIds } = await import('./src/data/items.js');
    const hs = []; for (const cls of ['luna', 'jin', 'hacker']) for (const gd of ['f', 'm']) hs.push([DEFAULT_LOOKS[cls][gd], looksFromIds(starterEquipFor(cls, gd))]);
    const runC = (mode) => {
      S.setSpriteMode(mode);
      const t0 = performance.now();
      for (let k = 0; k < 100; k++) { ctx.clearRect(0, 0, 1280, 720); for (let i = 0; i < 10; i++) { const [l, q] = hs[i % 6]; drawCharacter(ctx, 60 + i * 110, 400, l, q, { state: i % 2 ? 'walk' : 'attack', t: k * 0.016, attackT: (k % 20) / 20, facing: 1, scale: 1 }); } }
      return (performance.now() - t0) / 100;
    };
    runC('auto');                                  // ウォームアップ（着色キャッシュを作る）
    const csp = runC('auto'), ccd = runC('procedural');
    S.setSpriteMode('auto');
    return { enemySprite: +sp.toFixed(3), enemyCode: +cd.toFixed(3), charSprite: +csp.toFixed(3), charCode: +ccd.toFixed(3) };
  });
  console.log('  · 性能(ms/フレーム): ' + JSON.stringify(perf));
  check('template: 敵30体のスプライト描画が 4ms/フレーム未満', perf.enemySprite < 4, `${perf.enemySprite}ms（コード描画 ${perf.enemyCode}ms）`);
  const st1 = await page.evaluate(() => ({ s: window.game.sprites.spriteStats(), err: window.game.lastError }));
  check('template: 例外・コンソールエラーなし', errs.length === 0 && !st1.err && !st1.s.errors.length, errs.slice(0, 3).join(' | ') || st1.err || st1.s.errors.join(' | '));
  fs.writeFileSync(path.join(SHOTS, 'sprites_perf.json'), JSON.stringify(perf, null, 1));
  await ctx.close();
  await browser.close();
  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { for (const p of problems) console.log('  - ' + p); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
