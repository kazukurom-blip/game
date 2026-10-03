// Playwright スモークテスト
// http-server でプロジェクトをサーブ → chromium headless でロード → 一通り操作 → tests/screenshots/ に保存
// console error / pageerror / game.lastError / UI ガード警告 を収集し、0 件であることを検証する。
// 実行: node tests/smoke.mjs   (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8137;
const URL = `http://127.0.0.1:${PORT}/index.html`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

// ---------- playwright の解決（ローカル → グローバル）
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules_global', '/usr/local/lib/node_modules', '/usr/lib/node_modules']
    .filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません (NODE_PATH を設定してください)');
}

// ---------- サーバー（http-server。無ければ組み込みの静的サーバー）
function findHttpServer() {
  for (const p of ['/opt/node22/bin/http-server', path.join(ROOT, 'node_modules/.bin/http-server')]) if (fs.existsSync(p)) return p;
  return null;
}
async function startServer() {
  const bin = findHttpServer();
  if (bin) {
    const proc = spawn(bin, [ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (await ping()) return { close: () => proc.kill() };
    }
    proc.kill();
  }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  return { close: () => srv.close() };
}
function ping() {
  return new Promise((r) => { http.get(URL, (res) => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)); });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 収集
const problems = [];
const steps = [];
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/];
function report(kind, text) {
  if (IGNORE.some((re) => re.test(text))) return;
  problems.push(`[${kind}] ${text}`);
  console.log(`  !! [${kind}] ${text}`);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') report('console.error', t + (m.location()?.url ? ` @${m.location().url}` : ''));
    else if (m.type() === 'warning' && /\[ui\].*failed/.test(t)) report('ui.guard', t);
  });
  page.on('pageerror', (e) => report('pageerror', e.stack || e.message));
  page.on('requestfailed', (r) => report('requestfailed', `${r.url()} ${r.failure()?.errorText}`));

  let shotN = 0;
  const shot = async (name, clip) => {
    const file = path.join(SHOTS, `${String(++shotN).padStart(2, '0')}_${name}.png`);
    await page.screenshot({ path: file, clip });
    return file;
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const press = async (key, hold = 60) => { await page.keyboard.down(key); await sleep(hold); await page.keyboard.up(key); await frames(2); };
  const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await frames(2); };
  const lastError = async (where) => {
    const e = await g(() => window.game?.lastError);
    if (e) { report('game.lastError', `${where}: ${e}`); await g(() => { window.game.lastError = null; }); }
  };
  const check = async (name, cond, detail = '') => {
    const ok = !!cond;
    steps.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) problems.push(`[check] ${name} ${detail}`);
    await lastError(name);
  };
  const teleport = (x, y) => g(([x, y]) => { const p = window.game.player; p.x = x; p.y = y ?? window.game.map.groundY; p.vx = 0; p.vy = 0; p.climbing = null; }, [x, y]);
  const playerScreenClip = async (pad = 90) => {
    const r = await g(() => { const { player: p, cam } = window.game; return { x: p.x - cam.x, y: p.y - cam.y }; });
    const x = Math.max(0, Math.min(1280 - pad * 2, Math.round(r.x - pad)));
    const y = Math.max(0, Math.min(720 - pad * 2, Math.round(r.y - pad * 1.6)));
    return { x, y, width: pad * 2, height: pad * 2 };
  };

  async function startHero(hero) {
    await page.goto(URL, { waitUntil: 'load' });
    await g(() => { try { localStorage.clear(); } catch { /* */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.scene === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.focus('#game');
    if (hero === 'luna') await shot('title');
    // ルナ = 既定選択(0) / ジン = → で選択
    if (hero === 'jin') await press('ArrowRight');
    await frames(3);
    if (hero === 'jin') await shot('title_select_jin');
    await press('Enter');
    await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 5000 });
    await page.waitForTimeout(600);
    const st = await g(() => ({ hero: window.game.state.heroId, map: window.game.map.id }));
    await check(`${hero}: ゲーム開始`, st.hero === hero && st.map === 'beach', JSON.stringify(st));
  }

  // ===================================================== LUNA
  console.log('--- LUNA');
  await startHero('luna');
  await shot('luna_start');

  // 移動
  const x0 = await g(() => window.game.player.x);
  await hold('ArrowRight', 700);
  const x1 = await g(() => window.game.player.x);
  await check('移動 →', x1 > x0 + 60, `${x0.toFixed(0)} → ${x1.toFixed(0)}`);
  await hold('ArrowLeft', 300);
  // ジャンプ
  await page.keyboard.down('Space'); await sleep(50);
  const vy = await g(() => window.game.player.vy); await page.keyboard.up('Space');
  await sleep(120);
  const air = await g(() => !window.game.player.onGround);
  await check('ジャンプ', vy < 0 || air, `vy=${vy.toFixed(0)}`);
  await page.waitForTimeout(700);
  // 攻撃: 目の前に敵を出して殴る
  await g(() => { const gm = window.game; gm.debug.run('spawn'); });
  await g(() => { const gm = window.game, p = gm.player; const e = gm.enemies[gm.enemies.length - 1]; e.x = p.x + 45 * p.facing; e.y = p.y; e.spawnT = 0; e.vx = 0; window.__target = e; window.__hp0 = e.hp; });
  await hold('KeyX', 250);
  await shot('luna_attack');
  const hit = await g(() => window.__target.hp < window.__hp0 || window.__target.dead);
  await check('通常攻撃が命中', hit);
  // スキル
  const mp0 = await g(() => window.game.state.mp);
  await press('KeyA', 40);
  await sleep(100);
  await shot('luna_skill');
  const mp1 = await g(() => window.game.state.mp);
  await check('スキル(A) 使用', mp1 < mp0, `MP ${mp0} → ${mp1}`);
  // インベントリ
  await press('KeyI');
  await page.waitForTimeout(300);
  await shot('luna_inventory');
  await check('インベントリ開く', await g(() => window.game.ui.isOpen('inventory')));
  await press('KeyI');
  await check('インベントリ閉じる', !(await g(() => window.game.ui.isOpen('inventory'))));
  // 他ウィンドウ
  for (const [k, n] of [['KeyK', 'skills'], ['KeyJ', 'missions'], ['KeyT', 'stats']]) {
    await press(k); await page.waitForTimeout(250);
    await shot(`luna_win_${n}`);
    await check(`${n} ウィンドウ`, await g((n) => window.game.ui.isOpen(n), n));
    await press('Escape');
  }
  // 会話 → ミッション受注
  const rico = await g(() => { const n = window.game.npcs.find((x) => x.id === 'rico'); return { x: n.x, y: n.y }; });
  await teleport(rico.x + 30, rico.y);
  await frames(5);
  await press('KeyE');
  await page.waitForTimeout(400);
  await check('会話 (E) で dialog', await g(() => window.game.ui.isOpen('dialog')));
  await shot('luna_dialog');
  // 各行: 1回目=タイプライター全表示, 2回目=次の行 → 依頼選択 → 受注する
  for (let i = 0; i < 30 && !(await g(() => window.game.state.missions.active.includes('m01_welcome'))); i++) {
    await press('Enter'); await page.waitForTimeout(200);
  }
  await check('会話からミッション受注 (m01)', await g(() => window.game.state.missions.active.includes('m01_welcome')));
  for (let i = 0; i < 6 && (await g(() => window.game.ui.isOpen('dialog'))); i++) { await press('Escape'); await page.waitForTimeout(150); }
  await check('dialog を閉じる', !(await g(() => window.game.ui.isOpen('dialog'))));
  await shot('luna_mission_tracker');
  // 車
  const car = await g(() => { const v = window.game.vehicles[0]; return v && { x: v.x, y: v.y }; });
  if (car) {
    await teleport(car.x, car.y); await frames(5);
    await press('KeyE');
    await check('乗車', await g(() => !!window.game.player.inVehicle));
    await hold('ArrowRight', 900);
    await shot('luna_drive');
    const sp = await g(() => Math.abs(window.game.player.inVehicle?.vx || 0));
    await check('車で走る', sp > 150, `vx=${sp.toFixed(0)}`);
    await press('KeyE');
    await check('降車', !(await g(() => window.game.player.inVehicle)));
  } else await check('beach に車がある', false);
  // ドロップ: 全敵撃破 → ドロップ出現 → 拾う
  await g(() => window.game.debug.run('killAll'));
  await page.waitForTimeout(900);
  const drops = await g(() => window.game.drops.length);
  await check('撃破でドロップ', drops > 0, `drops=${drops}`);
  const inv0 = await g(() => JSON.stringify(window.game.state.inventory) + window.game.state.money);
  await g(() => { const gm = window.game, d = gm.drops.find((x) => x.onGround) || gm.drops[0]; if (d) { gm.player.x = d.x; gm.player.y = d.y; } });
  await page.keyboard.down('KeyZ'); await page.waitForTimeout(500); await page.keyboard.up('KeyZ');
  const inv1 = await g(() => JSON.stringify(window.game.state.inventory) + window.game.state.money);
  await check('ドロップを拾う', inv0 !== inv1);
  // ポータル
  const portal = await g(() => { const p = window.game.map.portals[0]; return { x: p.x, y: p.y, to: p.to }; });
  await teleport(portal.x, portal.y); await frames(5);
  await press('ArrowUp');
  await page.waitForTimeout(500);
  await check('ポータル移動', (await g(() => window.game.map.id)) === portal.to, portal.to);
  await shot('luna_portal_' + portal.to);
  // デバッグパネル
  await press('F2');
  await check('デバッグパネル表示', await g(() => window.game.debug.enabled));
  await press('F3');
  await press('F7'); await press('F7');
  await page.waitForTimeout(300);
  await shot('luna_debug_hitbox');
  await check('F7 敵スポーン', (await g(() => window.game.enemies.filter((e) => !e.dead).length)) > 0);
  // パネルのボタンをクリック（お金+10000）
  const money0 = await g(() => window.game.state.money);
  const btn = await g(() => window.game.debug._btnRects.find((b) => b.id === 'money'));
  const box = await page.locator('#game').boundingBox();
  await page.mouse.click(box.x + (btn.x + btn.w / 2) * box.width / 1280, box.y + (btn.y + btn.h / 2) * box.height / 720);
  await frames(3);
  await check('パネルのボタンをクリック', (await g(() => window.game.state.money)) === money0 + 10000);
  await press('F8');
  await check('F8 全敵撃破', (await g(() => window.game.enemies.filter((e) => !e.dead).length)) === 0);
  await g(() => window.game.debug.run('wantedDown') && window.game.debug.run('wantedDown') && window.game.debug.run('wantedDown') && window.game.debug.run('wantedDown') && window.game.debug.run('wantedDown'));
  await page.keyboard.down('Shift'); await press('F5'); await press('F5'); await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  const wl = await g(() => [window.game.wanted, window.game.wantedHeat, window.game.debug.log.join(' | ')]);
  await check('手配度+1 x2', wl[0] === 2, JSON.stringify(wl));
  await page.waitForTimeout(3500);
  await shot('luna_wanted2');
  await check('手配度で警察が出現', (await g(() => window.game.enemies.some((e) => e.fromWanted) || window.game.vehicles.some((v) => v.policeSpawned))));
  await page.keyboard.down('Shift'); await press('F6'); await press('F6'); await page.keyboard.up('Shift');
  await press('F10');
  await check('F10 ミッション即完了', await g(() => window.game.state.missions.completed.includes('m01_welcome')));
  await press('F5');
  await check('F5 Lv+1', (await g(() => window.game.state.level)) >= 2);
  await press('F4');
  await check('F4 無敵', await g(() => window.game.debug.god));
  await press('F4');
  await press('F3');
  await press('F2');

  // 服破れ（ルナ）
  await g(() => { window.game.changeMap('beach'); window.game.debug.run('hpFull'); });
  await g(() => { window.game.enemies.length = 0; window.game.spawner.timers = window.game.spawner.timers.map(() => -1e9); });
  await page.waitForTimeout(800);
  const tearLv = [[0, 'hp100'], [3, 'hp70'], [6, 'hp40'], [9, 'hp10']];
  let done = 0;
  for (const [n, label] of tearLv) {
    for (; done < n; done++) await g(() => window.game.debug.run('hpDown'));
    await page.waitForTimeout(500);
    const dmg = await g(() => window.game.player.anim.damage);
    await shot(`luna_tear_${label}`, await playerScreenClip());
    steps.push(`INFO luna damage=${dmg.toFixed(2)} (${label})`);
  }
  await check('HP低下で anim.damage が上がる', (await g(() => window.game.player.anim.damage)) > 0.85);
  await g(() => window.game.debug.run('hpFull'));

  // つづきから（セーブ → リロード → ↓ + Enter）
  const saved = await g(() => { window.game.save(); return { lv: window.game.state.level, money: window.game.state.money }; });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.scene === 'title', null, { timeout: 15000 });
  await page.waitForTimeout(1300);
  await page.focus('#game');
  await press('ArrowDown');
  await frames(3);
  await shot('title_continue');
  await press('Enter');
  await page.waitForFunction(() => window.game.scene === 'play', null, { timeout: 5000 });
  const loaded = await g(() => ({ hero: window.game.state.heroId, lv: window.game.state.level, money: window.game.state.money }));
  await check('つづきから', loaded.hero === 'luna' && loaded.lv === saved.lv && loaded.money === saved.money, JSON.stringify(loaded));

  // ===================================================== JIN
  console.log('--- JIN');
  await startHero('jin');
  await shot('jin_start');
  await hold('ArrowRight', 500);
  await press('Space');
  await hold('KeyX', 300);
  await press('KeyA', 40);
  await page.waitForTimeout(300);
  await shot('jin_skill');
  await lastError('jin 操作');
  // 全マップワープ
  await press('F2');
  await g(() => { window.game.debug.god = true; });
  const order = await g(() => { const seen = [window.game.map.id]; return seen; });
  for (let i = 0; i < 6; i++) {
    await press('F9');
    await page.waitForTimeout(1200);
    const id = await g(() => window.game.map.id);
    order.push(id);
    await shot(`jin_map_${id}`);
    const n = await g(() => window.game.enemies.length);
    steps.push(`INFO map ${id}: enemies=${n}`);
    await check(`map ${id}: 敵がいる`, n > 0, `enemies=${n}`);
  }
  await check('全マップワープ', new Set(order).size === 6, order.join(' → '));
  // rooftop / casino でボスをスポーン（描画確認）
  for (const [mapId, boss] of [['beach', 'boss_king_slime'], ['swamp', 'boss_gator'], ['casino', 'boss_mecha'], ['rooftop', 'boss_don']]) {
    await g((m) => window.game.changeMap(m), mapId);
    await g((b) => window.game.debug.spawnEnemy(b), boss);
    await page.waitForTimeout(900);
    await shot(`boss_${boss}`);
  }
  await g(() => { window.game.debug.god = false; });
  await press('F2');
  // 服破れ（ジン）
  await g(() => { window.game.changeMap('downtown'); window.game.debug.run('hpFull'); window.game.enemies.length = 0; window.game.spawner.timers = window.game.spawner.timers.map(() => -1e9); });
  await page.waitForTimeout(800);
  done = 0;
  for (const [n, label] of tearLv) {
    for (; done < n; done++) await g(() => window.game.debug.run('hpDown'));
    await page.waitForTimeout(500);
    await shot(`jin_tear_${label}`, await playerScreenClip());
  }
  await shot('jin_tear_full_screen');
  // 死亡 → 復活
  await g(() => { window.game.player._invulnUntil = 0; window.game.player.invulnT = 0; });
  await g(() => import('./src/systems/combat.js').then((c) => c.damagePlayer(window.game, 1e9, 0)));
  await page.waitForTimeout(900);
  await shot('jin_death');
  await check('死亡ウィンドウ', await g(() => window.game.ui.isOpen('death')));
  await press('Enter');
  await page.waitForTimeout(500);
  await check('復活', await g(() => window.game.state.hp > 0 && !window.game.ui.isOpen('death') && !window.game.player.dead));

  // 服破れシート: drawCharacter を damage 0 / 0.3 / 0.6 / 0.8 / 0.95 で拡大描画（両ヒーロー・初期装備）
  const sheet = await g(async () => {
    const C = await import('./src/render/character.js');
    const I = await import('./src/systems/inventory.js');
    const P = await import('./src/systems/progression.js');
    const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 560;
    const c = cv.getContext('2d');
    c.fillStyle = '#3a2a5a'; c.fillRect(0, 0, cv.width, cv.height);
    const dmg = [0, 0.3, 0.6, 0.8, 0.95];
    ['luna', 'jin'].forEach((h, row) => {
      const eq = I.getEquipLooks(P.newState(h));
      dmg.forEach((d, i) => {
        c.save();
        C.drawCharacter(c, 100 + i * 200, 250 + row * 280, C.HERO_LOOKS[h], eq, { facing: 1, state: 'idle', t: 0.3, attackT: 0, damage: d, scale: 2.6 });
        c.restore();
        c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif'; c.fillText(`${h} dmg ${d}`, 50 + i * 200, 275 + row * 280);
      });
    });
    return cv.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(SHOTS, `${String(++shotN).padStart(2, '0')}_tear_sheet.png`), Buffer.from(sheet.split(',')[1], 'base64'));
  await lastError('tear sheet');

  // 最終: ゲームが動き続けているか
  const t0 = await g(() => window.game.time);
  await page.waitForTimeout(500);
  await check('ゲームループ継続', (await g(() => window.game.time)) > t0);
  const fps = await g(() => window.game.debug.fps);
  steps.push(`INFO fps≈${fps.toFixed(0)}`);
  await lastError('final');

  await browser.close();
  server.close();

  console.log('\n===== SMOKE RESULT =====');
  for (const s of steps) console.log(s);
  console.log(`screenshots: ${shotN} → ${path.relative(ROOT, SHOTS)}/`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  console.log('\nOK: 0 errors');
}

main().catch((e) => { console.error(e); process.exit(2); });
