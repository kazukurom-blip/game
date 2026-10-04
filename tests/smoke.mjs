// Playwright スモークテスト（v2）
// http-server でプロジェクトをサーブ → chromium headless でロード → 一通り操作 → tests/screenshots/ に保存
// console error / pageerror / game.lastError / UI ガード警告 を収集し、0 件であることを検証する。
// 実行: node tests/smoke.mjs   (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
//   --only=luna,jin,maps,bosses,v1save,story  で一部だけ実行（既定は全部）
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
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

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
const perfRows = [];
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/];
function report(kind, text) {
  if (IGNORE.some((re) => re.test(text))) return;
  problems.push(`[${kind}] ${text}`);
  console.log(`  !! [${kind}] ${text}`);
}

// v1 形式のセーブ（pet スロット・visited・book・sns・clock 無し）
const V1_SAVE = {
  heroId: 'jin', level: 7, exp: 12, money: 1234, hp: 150, mp: 40, sp: 2, ap: 3,
  stats: { str: 8, dex: 5, int: 4, luk: 4 },
  inventory: [{ id: 'potion_red', qty: 5 }, { id: 'potion_blue', qty: 3 }, { id: 'bat_wood', qty: 1 }, { id: 'no_such_item', qty: 1 }],
  equipped: { hat: null, top: 'tshirt_white', bottom: null, shoes: null, weapon: null, accessory: null },
  skills: {}, skillBar: [null, null, null, null], potionBar: ['potion_red', 'potion_blue'],
  missions: { active: ['m02_jelly'], completed: ['m01_welcome'], progress: {} },
  mapId: 'beach', flags: {}, kills: 40, rareFound: [],
};

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (!ONLY.length) for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
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
    const file = path.join(SHOTS, `${String(++shotN).padStart(3, '0')}_${name}.png`);
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
  const info = (s) => { steps.push('INFO ' + s); console.log('  · ' + s); };
  const waitFor = async (fn, ms = 5000, arg) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await g(fn, arg)) return true; await sleep(100); }
    return false;
  };
  const teleport = (x, y) => g(([x, y]) => { const p = window.game.player; p.x = x; p.y = y ?? window.game.map.groundY; p.vx = 0; p.vy = 0; p.climbing = null; }, [x, y]);
  const warp = async (id, ms = 600) => { await g((id) => window.game.debug.warp(id), id); await frames(3); await page.waitForTimeout(ms); };
  const clickCanvas = async (x, y) => {
    const box = await page.locator('#game').boundingBox();
    await page.mouse.click(box.x + x * box.width / 1280, box.y + y * box.height / 720);
    await frames(3);
  };
  const toastHas = (re) => g((src) => (window.game.ui.toasts || []).some((t) => new RegExp(src).test(t.text)), re.source);
  const census = () => g(() => {
    const es = window.game.enemies.filter((e) => !e.dead && !e.remove);
    const civ = es.filter((e) => e.civilian || e.def?.civilian);
    const cop = es.filter((e) => e.isCop || e.def?.isCop);
    const mon = es.filter((e) => !(e.civilian || e.def?.civilian) && !(e.isCop || e.def?.isCop));
    return { civ: civ.length, cop: cop.length, mon: mon.length, police: window.game.vehicles.filter((v) => v.policeSpawned).length, types: [...new Set(mon.map((e) => e.defId))] };
  });
  const playerScreenClip = async (pad = 90) => {
    const r = await g(() => { const { player: p, cam } = window.game; return { x: p.x - cam.x, y: p.y - cam.y }; });
    const x = Math.max(0, Math.min(1280 - pad * 2, Math.round(r.x - pad)));
    const y = Math.max(0, Math.min(720 - pad * 2, Math.round(r.y - pad * 1.6)));
    return { x, y, width: pad * 2, height: pad * 2 };
  };
  const quiet = () => g(() => { const gm = window.game; gm.enemies.length = 0; gm.drops.length = 0; gm.spawner.timers = gm.spawner.timers.map(() => -1e9); });

  async function gotoTitle(clear = true) {
    await page.goto(URL, { waitUntil: 'load' });
    if (clear) {
      await g(() => { try { localStorage.clear(); } catch { /* */ } });
      await page.reload({ waitUntil: 'load' });
    }
    await page.waitForFunction(() => window.game && window.game.scene === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.focus('#game');
  }
  async function startHero(hero, shotTitle = false) {
    await gotoTitle(true);
    if (shotTitle) await shot('title');
    if (hero === 'jin') await press('ArrowRight');
    await frames(3);
    if (hero === 'jin' && shotTitle) await shot('title_select_jin');
    await press('Enter');
    await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 5000 });
    await page.waitForTimeout(600);
    const st = await g(() => ({ hero: window.game.state.heroId, map: window.game.map.id, town: window.game.map.town }));
    await check(`${hero}: ゲーム開始（ビーチの町）`, st.hero === hero && st.map === 'beach' && st.town === true, JSON.stringify(st));
  }

  // ===================================================== LUNA: 町・フィールド・v2 機能
  if (want('luna')) {
    console.log('--- LUNA');
    await startHero('luna', true);
    await shot('luna_start_beach_town');
    // 移動
    const x0 = await g(() => window.game.player.x);
    await hold('ArrowRight', 700);
    const x1 = await g(() => window.game.player.x);
    await check('移動 →', x1 > x0 + 60, `${x0.toFixed(0)} → ${x1.toFixed(0)}`);
    await hold('ArrowLeft', 300);
    await page.keyboard.down('Space'); await sleep(50);
    const vy = await g(() => window.game.player.vy); await page.keyboard.up('Space');
    await sleep(120);
    const air = await g(() => !window.game.player.onGround);
    await check('ジャンプ', vy < 0 || air, `vy=${vy.toFixed(0)}`);
    await page.waitForTimeout(700);

    // 町: モンスターなし・市民 6〜10 人
    let c = await census();
    await check('町: モンスターがいない', c.mon === 0, JSON.stringify(c));
    await check('町: 市民が歩いている (6〜10)', c.civ >= 6 && c.civ <= 10, `civ=${c.civ}`);
    await check('町: 警察は手配なしでは出ない', c.cop === 0 && c.police === 0, JSON.stringify(c));
    // 町: スキル不可
    const mp0 = await g(() => window.game.state.mp);
    await press('KeyA', 40);
    await sleep(100);
    const mp1 = await g(() => window.game.state.mp);
    await check('町: スキル(A) は使えない（MP消費なし）', mp1 === mp0, `MP ${mp0} → ${mp1}`);
    await check('町: 「町ではスキル」通知', await toastHas(/町/));
    await shot('luna_town_skill_blocked');
    // 町: 市民を通常攻撃 → 手配度 → 警察
    let hits = 0;
    for (let i = 0; i < 12 && (await g(() => window.game.wanted)) < 1; i++) {
      const ok = await g(() => {
        const gm = window.game, p = gm.player;
        const e = gm.enemies.find((x) => !x.dead && (x.civilian || x.def?.civilian));
        if (!e) return false;
        e.x = p.x + 40 * p.facing; e.y = p.y; e.vx = 0; window.__civ = e; window.__civHp = e.hp; return true;
      });
      if (!ok) { await sleep(500); continue; }
      await hold('KeyX', 120);
      await page.waitForTimeout(300);
      if (await g(() => window.__civ.hp < window.__civHp || window.__civ.dead)) hits++;
    }
    const wl = await g(() => [window.game.wanted, window.game.wantedHeat]);
    await check('町: 市民に通常攻撃が当たる', hits > 0, `hits=${hits}`);
    await check('町: 市民を殴ると手配度が上がる', wl[0] >= 1, JSON.stringify(wl));
    await check('町: 手配度で警察が出現', await waitFor(() => window.game.enemies.some((e) => e.fromWanted && (e.isCop || e.def?.isCop)), 6000));
    await shot('luna_town_police');
    await g(() => { window.game.debug.run('wantedDown'); window.game.debug.run('wantedDown'); window.game.debug.run('wantedDown'); window.game.debug.run('wantedDown'); window.game.debug.run('wantedDown'); window.game.enemies = window.game.enemies.filter((e) => !e.fromWanted); });

    // ウィンドウ（v1 + v2）
    for (const [k, n] of [['KeyI', 'inventory'], ['KeyK', 'skills'], ['KeyJ', 'missions'], ['KeyT', 'stats'], ['KeyM', 'worldmap'], ['KeyB', 'book'], ['KeyP', 'phone']]) {
      await press(k); await page.waitForTimeout(300);
      await shot(`luna_win_${n}`);
      await check(`${n} ウィンドウ (${k.slice(3)})`, await g((n) => window.game.ui.isOpen(n), n));
      await press(k === 'KeyM' ? 'KeyM' : 'Escape');
      await page.waitForTimeout(100);
      await check(`${n} ウィンドウを閉じる`, !(await g((n) => window.game.ui.isOpen(n), n)));
    }
    // 会話 → ミッション受注
    const rico = await g(() => { const n = window.game.npcs.find((x) => x.id === 'rico'); return n && { x: n.x, y: n.y }; });
    await check('beach にリコがいる', !!rico);
    if (rico) {
      await teleport(rico.x + 30, rico.y);
      await frames(5);
      await press('KeyE');
      await page.waitForTimeout(400);
      await check('会話 (E) で dialog', await g(() => window.game.ui.isOpen('dialog')));
      await shot('luna_dialog');
      for (let i = 0; i < 30 && !(await g(() => window.game.state.missions.active.includes('m01_welcome'))); i++) {
        await press('Enter'); await page.waitForTimeout(200);
      }
      await check('会話からミッション受注 (m01)', await g(() => window.game.state.missions.active.includes('m01_welcome')));
      for (let i = 0; i < 6 && (await g(() => window.game.ui.isOpen('dialog'))); i++) { await press('Escape'); await page.waitForTimeout(150); }
      await check('dialog を閉じる', !(await g(() => window.game.ui.isOpen('dialog'))));
    }
    // 車 + カーラジオ(R) + ミュート(N)
    const car = await g(() => { const v = window.game.vehicles.find((x) => !x.driverType); return v && { x: v.x, y: v.y }; });
    await check('beach に車がある', !!car);
    if (car) {
      await teleport(car.x, car.y); await frames(5);
      await press('KeyE');
      await check('乗車', await g(() => !!window.game.player.inVehicle));
      await hold('ArrowRight', 900);
      const sp = await g(() => Math.abs(window.game.player.inVehicle?.vx || 0));
      await check('車で走る', sp > 150, `vx=${sp.toFixed(0)}`);
      const r0 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.radioIndex));
      await press('KeyR'); await page.waitForTimeout(200);
      const r1 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.radioIndex));
      await press('KeyR'); await press('KeyR');
      await check('カーラジオ (R) で局切替', r1 !== r0, `${r0} → ${r1}`);
      await shot('luna_drive_radio');
      const m0 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.muted));
      await press('KeyN');
      const m1 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.muted));
      await press('KeyN');
      const m2 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.muted));
      await check('ミュート (N) 切替', m1 === !m0 && m2 === m0, `${m0} → ${m1} → ${m2}`);
      const ast = await g(() => import('./src/audio/audio.js').then((m) => m.audio.stats()));
      info(`audio ${JSON.stringify(ast)}`);
      await press('KeyE');
      await check('降車', !(await g(() => window.game.player.inVehicle)));
      await press('KeyR'); // 降車中の R（通知のみ・例外なし）
      await lastError('radio');
    }

    // フィールドへ（ポータル）
    const portal = await g(() => { const p = window.game.map.portals.find((q) => q.to === 'beach_f1'); return p && { x: p.x, y: p.y, to: p.to }; });
    await check('beach → beach_f1 のポータルがある', !!portal);
    await teleport(portal.x, portal.y); await frames(5);
    await press('ArrowUp');
    await page.waitForTimeout(800);
    await check('ポータル移動 → beach_f1', (await g(() => window.game.map.id)) === 'beach_f1');
    c = await census();
    await check('フィールド: モンスターが自動出現', c.mon > 0, JSON.stringify(c));
    await check('フィールド: 市民・警察がいない', c.civ === 0 && c.cop === 0 && c.police === 0, JSON.stringify(c));
    const habit = await g(() => import('./src/data/enemies.js').then((m) => window.game.enemies.filter((e) => !e.dead).every((e) => (m.ENEMIES[e.defId].habitats || []).includes('beach_f1'))));
    await check('フィールド: 出現敵はすべて habitats に beach_f1', habit, c.types.join(','));
    await shot('luna_field_beach_f1');
    // フィールド: 攻撃・スキル
    await g(() => { const gm = window.game; gm.debug.run('spawn'); const p = gm.player; const e = gm.enemies[gm.enemies.length - 1]; e.x = p.x + 45 * p.facing; e.y = p.y; e.spawnT = 0; e.vx = 0; window.__target = e; window.__hp0 = e.hp; });
    await hold('KeyX', 250);
    await shot('luna_attack');
    await check('フィールド: 通常攻撃が命中', await g(() => window.__target.hp < window.__hp0 || window.__target.dead));
    const fm0 = await g(() => window.game.state.mp);
    await press('KeyA', 40); await sleep(120);
    await shot('luna_skill_field');
    const fm1 = await g(() => window.game.state.mp);
    await check('フィールド: スキル(A) 使用', fm1 < fm0, `MP ${fm0} → ${fm1}`);
    // 経験値（序盤は少なめ）
    const expInfo = await g(() => import('./src/data/enemies.js').then((m) => ['slime_green', 'crab_sand', 'slime_pink'].map((id) => m.ENEMIES[id].exp)));
    await check('序盤の敵の経験値は少なめ (≤8)', expInfo.every((x) => x <= 8), expInfo.join(','));
    // フィールド: 手配度 → 警察は出ない・素早く減衰
    await g(() => { window.game.debug.run('wantedUp'); window.game.debug.run('wantedUp'); window.game.debug.run('wantedUp'); });
    const w0 = await g(() => window.game.wanted);
    await page.waitForTimeout(3000);
    c = await census();
    const w1 = await g(() => window.game.wanted);
    await check('フィールド: 手配★3 でも警察が出ない', c.cop === 0 && c.police === 0, JSON.stringify(c));
    await check('フィールド: 手配度が素早く減衰', w1 < w0, `★${w0} → ★${w1}`);
    // ドロップ（撃破→拾う Z）
    await g(() => window.game.debug.run('killAll'));
    await page.waitForTimeout(900);
    await check('撃破でドロップ', (await g(() => window.game.drops.length)) > 0);
    const inv0 = await g(() => JSON.stringify(window.game.state.inventory) + window.game.state.money);
    await g(() => { const gm = window.game, d = gm.drops.find((x) => x.onGround) || gm.drops[0]; if (d) { gm.player.x = d.x; gm.player.y = d.y; } });
    await page.keyboard.down('KeyZ'); await page.waitForTimeout(500); await page.keyboard.up('KeyZ');
    await check('ドロップを拾う (Z)', inv0 !== (await g(() => JSON.stringify(window.game.state.inventory) + window.game.state.money)));
    await check('図鑑に登録される', await g(() => Object.keys(window.game.state.book || {}).length > 0), await g(() => JSON.stringify(window.game.state.book)));
    // 敵の自動出現（全滅後に再出現）
    await quiet();
    await g(() => { window.game.spawner.timers = window.game.spawner.timers.map(() => 0); });
    await check('全滅後に敵が自動出現', await waitFor(() => window.game.enemies.some((e) => !e.dead), 12000));

    // PET: 付与→装備→追従→自動取得
    await g(() => { window.game.debug.god = true; window.game.debug.run('pet'); });
    await frames(5);
    const pet = await g(() => ({ eq: window.game.state.equipped.pet, has: !!window.game.pet, range: window.game.pet?.pickRange }));
    await check('PET 装備で追従ペットが出現', pet.eq && pet.has, JSON.stringify(pet));
    // 追従: 右へ走る → PET が付いてくる
    await teleport(800);
    await page.waitForTimeout(300);
    await hold('ArrowRight', 1200);
    await page.waitForTimeout(400);
    const pd = await g(() => Math.hypot(window.game.pet.x - window.game.player.x, window.game.pet.y - window.game.player.y));
    await check('PET がプレイヤーに追従', pd < 200, `dist=${pd.toFixed(0)}`);
    // 自動取得: プレイヤーの磁力(50px)外・PET範囲内にお金とアイテムを置く
    const picked = await g(async () => {
      const { Drop } = await import('./src/entities/drop.js');
      const gm = window.game, p = gm.player;
      gm.enemies.length = 0; gm.spawner.timers = gm.spawner.timers.map(() => -1e9);
      const money0 = gm.state.money;
      const list = [new Drop(gm, p.x + 120, p.y - 20, { money: 77 }), new Drop(gm, p.x - 130, p.y - 20, { id: 'potion_red' }), new Drop(gm, p.x + 140, p.y - 20, { money: 33 })];
      for (const d of list) gm.drops.push(d);
      window.__petDrops = list;
      return money0;
    });
    await shot('luna_pet_follow');
    const allPicked = await waitFor(() => window.__petDrops.every((d) => d.dead || d.remove), 8000);
    const byPet = await g(() => window.__petDrops.filter((d) => d.collector && d.collector === window.game.pet).length);
    const money1 = await g(() => window.game.state.money);
    await check('PET がアイテム/お金を自動取得', allPicked && byPet >= 2, `byPet=${byPet}/3 money ${picked} → ${money1}`);
    await shot('luna_pet_pickup');
    // レアドロップ / PET ドロップを拾った時の演出イベント
    const ev = await g(async () => {
      const { Drop } = await import('./src/entities/drop.js');
      const { ITEMS } = await import('./src/data/items.js');
      const gm = window.game, p = gm.player, got = [];
      const offs = ['rareDrop', 'petDrop'].map((n) => gm.events.on(n, (d) => got.push(`${n}:${d?.item?.id}`)));
      const rare = Object.values(ITEMS).find((it) => it.type === 'equip' && it.rarity === 'legendary' && it.slot !== 'pet');
      for (const id of [rare.id, 'pet_cat']) { const d = new Drop(gm, p.x, p.y - 10, { id }); d.t = 1; gm.drops.push(d); d.pickup(); }
      await new Promise((r) => setTimeout(r, 300));
      offs.forEach((o) => typeof o === 'function' && o());
      return got;
    });
    await check('レア装備を拾うと rareDrop / PET を拾うと petDrop', ev.some((x) => x.startsWith('rareDrop')) && ev.includes('petDrop:pet_cat'), ev.join(','));
    await shot('luna_pet_drop_banner');
    // PET 切替（全10種を一巡して描画）
    for (let i = 0; i < 10; i++) { await g(() => window.game.debug.run('pet')); await frames(3); }
    await check('PET 10種を付け替えても例外なし', await g(() => !!window.game.pet));
    await g(() => { window.game.debug.god = false; });

    // HUD は1フレームに1回だけ描く（main の drawHUD と ui.draw の二重描画防止）
    await check('HUD の二重描画なし', await g(() => { const u = window.game.ui; return u._hudExtFrame === u.frame - 1 && u._hudIntFrame !== u.frame; }));
    // 昼夜
    const ck0 = await g(() => window.game.clock);
    await page.waitForTimeout(1000);
    const ck1 = await g(() => window.game.clock);
    await check('時計が進む', ck1 !== ck0, `${ck0.toFixed(3)} → ${ck1.toFixed(3)}`);
    for (const k of ['morning', 'noon', 'evening', 'night']) {
      await g((k) => window.game.debug.run('clock_' + k), k);
      await page.waitForTimeout(400);
      await shot(`luna_clock_${k}`);
    }
    await check('夜 (22時) に設定', Math.floor(await g(() => window.game.clock)) === 22);
    const nx = await g(() => Promise.all([import('./src/systems/combat.js'), import('./src/data/enemies.js')]).then(([c, m]) => { const d = m.ENEMIES.boss_don; const n = c.killExp(window.game, d); window.game.debug.run('clock_noon'); const day = c.killExp(window.game, d); window.game.debug.run('clock_night'); return [n, day]; }));
    await check('夜は経験値+10%', nx[0] > nx[1], JSON.stringify(nx));
    await warp('downtown', 800);
    await shot('luna_night_downtown');

    // ワールドマップ & タクシー
    await warp('beach_f1');
    const vis = await g(() => import('./src/systems/travel.js').then((t) => ({
      beach: t.mapVisibility(window.game.state, 'beach'), f1: t.mapVisibility(window.game.state, 'beach_f1'),
      f2: t.mapVisibility(window.game.state, 'beach_f2'), f3: t.mapVisibility(window.game.state, 'beach_f3'),
      down: t.mapVisibility(window.game.state, 'downtown'), slums: t.mapVisibility(window.game.state, 'slums'),
    })));
    await check('ワールドマップ: 現在地/訪問済み/隣接(???)/非表示', vis.f1 === 'current' && vis.beach === 'visited' && vis.down === 'visited' && vis.f2 === 'adjacent' && vis.f3 === 'adjacent' && vis.slums === 'hidden', JSON.stringify(vis));
    await press('KeyM'); await page.waitForTimeout(400);
    await check('M でワールドマップ', await g(() => window.game.ui.isOpen('worldmap')));
    await check('ワールドマップ表示中はゲーム停止', await g(async () => { const t = window.game.player.t; await new Promise((r) => setTimeout(r, 200)); return window.game.player.t === t; }));
    await shot('luna_worldmap');
    const node = await g(() => window.game.ui.hits.find((h) => h.id === 'worldmap:node:downtown')?.r);
    await check('ワールドマップ: ダウンタウン(訪問済みの町)のノード', !!node);
    const money0 = await g(() => window.game.state.money);
    if (node) {
      await clickCanvas(node.x + node.w / 2, node.y + node.h / 2);
      await page.waitForTimeout(200);
      await check('町クリックでタクシー確認', await g(() => !!window.game.ui.wins.worldmap?.confirm));
      await shot('luna_taxi_confirm');
      await press('Enter');
      await page.waitForTimeout(500);
      const tx = await g(() => ({ map: window.game.map.id, money: window.game.state.money, open: window.game.ui.isOpen('worldmap') }));
      await check('タクシーでダウンタウンへ（料金支払い）', tx.map === 'downtown' && tx.money < money0 && !tx.open, `${JSON.stringify(tx)} money0=${money0}`);
    }
    // 未訪問の町・フィールドへはタクシー不可
    const ng = await g(() => import('./src/systems/travel.js').then((t) => [t.canTaxi(window.game, 'slums').ok, t.canTaxi(window.game, 'beach_f1').ok, t.canTaxi(window.game, 'beach').ok]));
    await check('タクシー: 未訪問の町×・フィールド×・訪問済みの町○', !ng[0] && !ng[1] && ng[2], JSON.stringify(ng));
    // 図鑑・スマホ（中身あり）
    await press('KeyB'); await page.waitForTimeout(300);
    await shot('luna_book_filled');
    await check('図鑑 (B)', await g(() => window.game.ui.isOpen('book')));
    await press('Escape');
    await g(() => window.game.debug.run('level'));
    await press('KeyP'); await page.waitForTimeout(300);
    await shot('luna_phone_filled');
    await check('スマホ (P)', await g(() => window.game.ui.isOpen('phone')));
    await check('SNS に自動投稿がある', await g(() => (window.game.state.sns?.posts || []).length > 0), await g(() => `posts=${window.game.state.sns?.posts?.length} followers=${window.game.state.sns?.followers}`));
    await press('Escape');

    // デバッグパネル
    await warp('beach_f2');
    await press('F2');
    await check('デバッグパネル表示', await g(() => window.game.debug.enabled));
    await press('F3');
    await press('F7'); await press('F7');
    await page.waitForTimeout(300);
    await shot('luna_debug_hitbox');
    const spawned = await g(() => import('./src/data/enemies.js').then((m) => window.game.enemies.filter((e) => !e.dead).every((e) => (m.ENEMIES[e.defId].habitats || []).includes('beach_f2'))));
    await check('F7 敵スポーン（そのマップの出現敵のみ）', spawned);
    const m0 = await g(() => window.game.state.money);
    const btn = await g(() => window.game.debug._btnRects.find((b) => b.id === 'money'));
    await clickCanvas(btn.x + btn.w / 2, btn.y + btn.h / 2);
    await check('パネルのボタンをクリック', (await g(() => window.game.state.money)) === m0 + 10000);
    const nb = await g(() => window.game.debug._btnRects.find((b) => b.id === 'clock_night'));
    await clickCanvas(nb.x + nb.w / 2, nb.y + nb.h / 2);
    await check('時刻ボタン（夜）', Math.floor(await g(() => window.game.clock)) === 22);
    const pr = await g(() => { const r = window.game.debug.rect; return r.y + r.h; });
    await check('デバッグパネルが画面内に収まる', pr <= 720, `bottom=${pr}`);
    await press('F8');
    await check('F8 全敵撃破', (await g(() => window.game.enemies.filter((e) => !e.dead).length)) === 0);
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
    await warp('beach');
    await g(() => window.game.debug.run('hpFull'));
    await quiet();
    await page.waitForTimeout(500);
    const tearLv = [[0, 'hp100'], [3, 'hp70'], [6, 'hp40'], [9, 'hp10']];
    let done = 0;
    for (const [n, label] of tearLv) {
      for (; done < n; done++) await g(() => window.game.debug.run('hpDown'));
      await page.waitForTimeout(500);
      await shot(`luna_tear_${label}`, await playerScreenClip());
    }
    await check('HP低下で anim.damage が上がる', (await g(() => window.game.player.anim.damage)) > 0.85);
    await g(() => window.game.debug.run('hpFull'));
    // 装備で見た目が変わる（全アイテム付与 → 帽子装備 → getEquipLooks に反映）
    const look = await g(() => import('./src/systems/inventory.js').then((I) => {
      const gm = window.game; gm.debug.run('items');
      const hat = gm.state.inventory.find((s) => s && (window.__ITEMS || {})[s.id]);
      return import('./src/data/items.js').then((D) => {
        const h = gm.state.inventory.map((s) => D.ITEMS[s.id]).find((it) => it && it.slot === 'hat' && (it.reqLevel || 0) <= gm.state.level);
        if (!h) return null;
        const before = JSON.stringify(I.getEquipLooks(gm.state).hat);
        I.equip(gm, h.id);
        return [before, JSON.stringify(I.getEquipLooks(gm.state).hat)];
      });
    }));
    await check('装備で見た目が変化 (hat)', look && look[0] !== look[1], JSON.stringify(look));
    await page.waitForTimeout(300);
    await shot('luna_equip_hat', await playerScreenClip());

    // つづきから
    const saved = await g(() => { window.game.save(); return { lv: window.game.state.level, money: window.game.state.money, pet: window.game.state.equipped.pet }; });
    await gotoTitle(false);
    await press('ArrowDown');
    await frames(3);
    await shot('title_continue');
    await press('Enter');
    await page.waitForFunction(() => window.game.scene === 'play', null, { timeout: 5000 });
    await page.waitForTimeout(400);
    const loaded = await g(() => ({ hero: window.game.state.heroId, lv: window.game.state.level, money: window.game.state.money, pet: window.game.state.equipped.pet, hasPet: !!window.game.pet }));
    await check('つづきから（PET 含む）', loaded.hero === 'luna' && loaded.lv === saved.lv && loaded.money === saved.money && loaded.pet === saved.pet && loaded.hasPet, JSON.stringify(loaded));
  }

  // ===================================================== JIN: 34 マップ全ワープ・FPS・ボス
  if (want('jin') || want('maps') || want('bosses')) {
    console.log('--- JIN');
    await startHero('jin', true);
    await shot('jin_start');
    await hold('ArrowRight', 500);
    await press('Space');
    await hold('KeyX', 300);
    await g(() => window.game.debug.warp('beach_f1'));
    await page.waitForTimeout(400);
    await press('KeyA', 40);
    await page.waitForTimeout(300);
    await shot('jin_skill');
    await lastError('jin 操作');
    await g(() => { window.game.debug.god = true; window.game.debug.setLevel(40); });
  }
  if (want('jin') || want('maps')) {
    const order = await g(() => import('./src/world/maps.js').then((m) => m.MAP_ORDER));
    await check('34 マップ（町7 + フィールド27）', await g(() => import('./src/world/maps.js').then((m) => Object.keys(m.MAPS).length === 34 && m.TOWN_IDS.every((id) => m.MAPS[id].town) && Object.values(m.MAPS).filter((x) => x.town).length === 7)));
    const bad = [];
    for (const id of order) {
      await warp(id, 900);
      await g(() => window.game.perf.reset());
      await page.waitForTimeout(1500);
      const r = await g(() => ({ id: window.game.map.id, town: !!window.game.map.town, region: window.game.map.region, variant: window.game.map.variant, fps: window.game.debug.fps, avg: window.game.perf.sum / Math.max(1, window.game.perf.n), max: window.game.perf.max, n: window.game.perf.n, ents: window.game.enemies.length + window.game.drops.length + window.game.effects.length }));
      const cs = await census();
      await shot(`map_${r.region}_${id}`);
      perfRows.push({ ...r, ...cs });
      if (r.id !== id) bad.push(`${id}: warp失敗`);
      if (r.town && (cs.mon > 0 || cs.civ < 3)) bad.push(`${id}: 町 mon=${cs.mon} civ=${cs.civ}`);
      if (!r.town && (cs.mon === 0 || cs.civ > 0 || cs.cop > 0)) bad.push(`${id}: フィールド mon=${cs.mon} civ=${cs.civ} cop=${cs.cop}`);
      // フィールドで手配★5 にしても警察が出ない（全フィールド）
      if (!r.town) {
        await g(() => import('./src/systems/combat.js').then((c) => c.setWantedLevel(window.game, 5)));
        await page.waitForTimeout(400);
        const c2 = await census();
        if (c2.cop || c2.police) bad.push(`${id}: フィールドに警察 ${JSON.stringify(c2)}`);
        await g(() => import('./src/systems/combat.js').then((c) => c.setWantedLevel(window.game, 0)));
      }
      info(`map ${id.padEnd(10)} ${r.town ? 'TOWN ' : 'field'} ${r.region}/${r.variant} mon=${cs.mon} civ=${cs.civ} frame avg ${r.avg.toFixed(1)}ms max ${r.max.toFixed(1)}ms fps≈${r.fps.toFixed(0)}`);
    }
    await check('34 マップ全ワープ（町=市民のみ / フィールド=モンスターのみ / フィールドに警察なし）', bad.length === 0, bad.join(' | '));
    const slow = perfRows.filter((r) => r.avg > 1000 / 45);
    await check('全マップで 1フレーム処理 < 22ms（>45fps 相当）', slow.length === 0, slow.map((r) => `${r.id}:${r.avg.toFixed(1)}ms`).join(', '));
    await check('ワールドマップ: 全マップ訪問で全て名前表示', await g(() => import('./src/systems/travel.js').then((t) => Object.keys(t.MAP_INFO).every((id) => ['visited', 'current'].includes(t.mapVisibility(window.game.state, id))))));
    await press('KeyM'); await page.waitForTimeout(400);
    await shot('jin_worldmap_all_visited');
    await press('KeyM');
    // 地域ごとの敵の統一（各フィールドの出現敵の region が地域と一致）
    const regionMismatch = await g(() => import('./src/data/enemies.js').then((m) => import('./src/world/maps.js').then((W) => import('./src/entities/spawner.js').then((S) => {
      const out = [];
      for (const map of Object.values(W.MAPS)) {
        if (map.town) continue;
        for (const a of S.resolveSpawns(map)) for (const t of a.types) if (m.ENEMIES[t].region !== map.region) out.push(`${map.id}:${t}(${m.ENEMIES[t].region})`);
      }
      return out;
    }))));
    await check('地域ごとに敵が統一（フィールドの出現敵の region = マップの region）', regionMismatch.length === 0, regionMismatch.join(', '));
  }
  if (want('jin') || want('bosses')) {
    // ボス 7 体
    const bosses = [['beach_f3', 'boss_king_slime'], ['down_f2', 'boss_rat_king'], ['slums_f3', 'boss_captain'], ['swamp_f3', 'boss_gator'], ['casino_f3', 'boss_mecha'], ['tower_f3', 'boss_don'], ['space_f4', 'boss_alien']];
    for (const [mapId, boss] of bosses) {
      await warp(mapId, 300);
      await quiet();
      const inTable = await g((b) => window.game.spawner.areas.some((a) => a.types.includes(b)), boss);
      await g((b) => window.game.debug.spawnEnemy(b), boss);
      await page.waitForTimeout(1200);
      await shot(`boss_${boss}`);
      await check(`ボス ${boss} (${mapId}) が出現表にあり描画できる`, inTable && (await g((b) => window.game.enemies.some((e) => e.defId === b && !e.dead), boss)));
    }
    await g(() => { window.game.debug.god = false; });
    // 服破れ（ジン）
    await warp('downtown');
    await g(() => window.game.debug.run('hpFull'));
    await quiet();
    await page.waitForTimeout(500);
    let done = 0;
    for (const [n, label] of [[0, 'hp100'], [3, 'hp70'], [6, 'hp40'], [9, 'hp10']]) {
      for (; done < n; done++) await g(() => window.game.debug.run('hpDown'));
      await page.waitForTimeout(500);
      await shot(`jin_tear_${label}`, await playerScreenClip());
    }
    await shot('jin_tear_full_screen');
    // 死亡 → 復活（地域の町で）
    await warp('slums_f1');
    await g(() => { window.game.state.visited.push('slums'); window.game.player._invulnUntil = 0; window.game.player.invulnT = 0; });
    await g(() => import('./src/systems/combat.js').then((c) => c.damagePlayer(window.game, 1e9, 0)));
    await page.waitForTimeout(900);
    await shot('jin_death');
    await check('死亡ウィンドウ', await g(() => window.game.ui.isOpen('death')));
    await press('Enter');
    await page.waitForTimeout(500);
    await check('復活（地域の町 slums）', await g(() => window.game.state.hp > 0 && !window.game.ui.isOpen('death') && !window.game.player.dead && window.game.map.id === 'slums'), await g(() => window.game.map.id));

    // 服破れシート
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
    fs.writeFileSync(path.join(SHOTS, `${String(++shotN).padStart(3, '0')}_tear_sheet.png`), Buffer.from(sheet.split(',')[1], 'base64'));
    await lastError('tear sheet');
  }

  // ===================================================== 旧 v1 セーブ → つづきから
  if (want('v1save')) {
    console.log('--- v1 save');
    await page.goto(URL, { waitUntil: 'load' });
    await g((s) => { localStorage.clear(); localStorage.setItem('nvs_save', JSON.stringify(s)); }, V1_SAVE);
    await gotoTitle(false);
    await press('ArrowDown');
    await frames(3);
    await press('Enter');
    const ok = await waitFor(() => window.game.scene === 'play' && !!window.game.player, 5000);
    await page.waitForTimeout(800);
    const st = await g(() => {
      const s = window.game.state;
      return { ok: true, hero: s.heroId, lv: s.level, money: s.money, map: window.game.map?.id, pet: s.equipped.pet, visited: s.visited, book: typeof s.book, sns: !!s.sns, clock: typeof s.clock, inv: s.inventory.map((x) => x.id), active: s.missions.active, version: s.version };
    });
    await check('旧v1セーブ「つづきから」で起動', ok && st.hero === 'jin' && st.lv === 7 && st.money === 1234 && st.map === 'beach', JSON.stringify(st));
    await check('旧v1セーブ: v2 フィールド補完 (pet/visited/book/sns/clock)', st.pet === null && st.visited.includes('beach') && st.book === 'object' && st.sns && st.clock === 'number', JSON.stringify(st));
    await check('旧v1セーブ: 不明アイテムを除去', !st.inv.includes('no_such_item'), st.inv.join(','));
    await shot('v1save_continue');
    for (const k of ['KeyI', 'KeyM', 'KeyB', 'KeyP', 'KeyJ']) { await press(k); await page.waitForTimeout(250); await press(k === 'KeyM' ? 'KeyM' : 'Escape'); }
    await hold('ArrowRight', 400);
    await hold('KeyX', 200);
    await lastError('v1 save play');
    await check('旧v1セーブ: 操作・ウィンドウで例外なし', true);
  }

  // ===================================================== ストーリー通し（メイン m01〜m15 + 宇宙港 sp01〜sp05）
  if (want('story')) {
    console.log('--- STORY');
    await startHero('luna');
    await g(() => { window.game.debug.god = true; });
    const story = await g(() => import('./src/data/missions.js').then((m) => {
      const main = Object.values(m.MISSIONS).filter((x) => x.category === 'main').map((x) => x.id);
      const sp = Object.values(m.MISSIONS).filter((x) => /^sp\d/.test(x.id)).map((x) => x.id);
      return [...main, ...sp];
    }));
    info(`story: ${story.join(' → ')}`);
    for (const id of story) {
      const r = await g(runMission, id);
      for (const n of r.notes) info(`${id}: ${n}`);
      await check(`ストーリー ${id} ${r.name}`, r.ok, r.err || `Lv${r.level} ${r.sec.toFixed(1)}s`);
      if (!r.ok) break;
    }
    await shot('story_final');
    await check('メインストーリー完了フラグ', await g(() => window.game.state.missions.completed.includes('m15_don')));
  }

  // 最終: ゲームが動き続けているか
  const t0 = await g(() => window.game.time);
  await page.waitForTimeout(500);
  await check('ゲームループ継続', (await g(() => window.game.time)) > t0);
  await lastError('final');

  await browser.close();
  server.close();

  console.log('\n===== SMOKE RESULT =====');
  for (const s of steps) console.log(s);
  if (perfRows.length) {
    const avg = perfRows.reduce((a, r) => a + r.avg, 0) / perfRows.length;
    const worst = perfRows.slice().sort((a, b) => b.avg - a.avg)[0];
    console.log(`perf: 平均 ${avg.toFixed(1)}ms/frame, 最も重い ${worst.id} ${worst.avg.toFixed(1)}ms (max ${worst.max.toFixed(1)}ms)`);
  }
  const nChecks = steps.filter((s) => /^(OK|FAIL)/.test(s)).length;
  console.log(`checks: ${steps.filter((s) => s.startsWith('OK')).length}/${nChecks} OK, screenshots: ${shotN} → ${path.relative(ROOT, SHOTS)}/`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  console.log('\nOK: 0 errors');
}

// ---------------------------------------------------------------- ページ内で1ミッションを通す
// 依頼NPC が依頼マップにいる → 受注 → 各目的（討伐対象はそのマップの出現表から実際に湧いたものを倒す /
// 収集はそのマップの敵のドロップを拾う / reach / talk は報告NPCに話しかける / wanted / drive は実際に乗車）
// → 報告NPC が報告マップにいる → 報告。Lv はデバッグで reqLevel まで上げる。
async function runMission(id) {
  const G = window.game;
  const t0 = performance.now();
  const notes = [];
  const M = await import('./src/data/missions.js');
  const E = (await import('./src/data/enemies.js')).ENEMIES;
  const W = await import('./src/world/maps.js');
  const C = await import('./src/systems/combat.js');
  const I = await import('./src/systems/inventory.js');
  const m = M.MISSIONS[id];
  const res = (ok, err) => ({ ok, err, name: m?.name || id, level: G.state.level, sec: (performance.now() - t0) / 1000, notes });
  const wait = (n = 1) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const npcMap = (npc) => M.MISSION_NPCS[npc]?.mapId;
  const go = async (mapId) => { if (G.map.id !== mapId) { G.debug.warp(mapId); await wait(3); } };
  const npcHere = (npc) => G.npcs.find((n) => n.id === npc);
  const talk = async (npc) => {
    const n = npcHere(npc);
    if (!n) return false;
    const p = G.player; p.x = n.x + 20; p.y = n.y; p.vx = 0; p.vy = 0; p.climbing = null;
    await wait(2);
    p.interact();
    await wait(2);
    const opened = G.ui.isOpen('dialog');
    G.ui.close('dialog');
    return opened;
  };
  const freeInv = () => {
    if (I.freeSlots(G.state) > 6) return;
    const need = new Set(G.state.missions.active.flatMap((a) => M.MISSIONS[a].objectives.filter((o) => o.type === 'collect').map((o) => o.target)));
    G.state.inventory = G.state.inventory.filter((s) => s && (need.has(s.id) || /^potion/.test(s.id)));
  };
  if (!m) return res(false, 'mission not found');
  G.debug.setLevel(m.reqLevel || 1);
  G.debug.run('hpFull');
  C.setWantedLevel(G, 0);
  // 依頼
  await go(npcMap(m.giver));
  if (!npcHere(m.giver)) return res(false, `依頼NPC ${m.giver} が ${G.map.id} にいない`);
  if (!G.missions.available(m.giver).some((x) => x.id === id)) return res(false, `${m.giver} が ${id} を提示しない (canAccept=${G.missions.canAccept(id)})`);
  if (!(await talk(m.giver))) return res(false, `${m.giver} と会話できない`);
  if (!G.missions.accept(id)) return res(false, 'accept 失敗');
  const turnNpc = M.turnInNpcOf(m);
  const val = (i) => G.missions.objectiveValues(id)[i];
  for (let i = 0; i < m.objectives.length; i++) {
    const o = m.objectives[i];
    if (val(i) >= o.count) continue;
    if (o.type === 'reach') { await go(o.target); await wait(3); }
    else if (o.type === 'talk') {
      await go(npcMap(o.target));
      if (o.target === turnNpc) continue; // 報告時に満たされる
      if (!(await talk(o.target))) return res(false, `talk: ${o.target} が ${G.map.id} にいない`);
    } else if (o.type === 'wanted') {
      await go(npcMap(m.giver));
      C.setWantedLevel(G, o.target);
      await wait(3);
      C.setWantedLevel(G, 0);
    } else if (o.type === 'drive') {
      const town = W.MAPS[npcMap(m.giver)].vehicles?.length ? npcMap(m.giver) : 'beach';
      await go(town);
      const v = G.vehicles.find((x) => !x.driverType);
      if (!v) return res(false, `drive: ${town} に車がない`);
      const p = G.player; p.x = v.x; p.y = v.y; await wait(2);
      p.interact(); await wait(2);
      if (!p.inVehicle) return res(false, 'drive: 乗車できない');
      let dir = 1;
      for (let k = 0; k < 600 && val(i) < o.count; k++) {
        const car = p.inVehicle;
        car.x += dir * 150;
        if (car.x > G.map.width - 200 || car.x < 200) dir = -dir;
        await wait(1);
      }
      p.inVehicle.exit?.(p); await wait(2);
      if (p.inVehicle) p.inVehicle = null;
    } else if (o.type === 'kill' || o.type === 'boss' || o.type === 'collect') {
      // 対象の決定: kill/boss → 敵ID、collect → その item を落とす敵
      const sources = o.type === 'collect'
        ? Object.values(E).filter((e) => (e.drops || []).some((d) => d.id === o.target)).map((e) => e.id)
        : [o.target];
      const cop = sources.some((s) => E[s]?.isCop);
      let mapId = o.mapId;
      if (!mapId) {
        if (cop) mapId = npcMap(m.giver);
        else mapId = Object.values(W.MAPS).find((mp) => !mp.town && sources.some((s) => (E[s].habitats || []).includes(mp.id)))?.id;
      }
      if (!mapId) return res(false, `${o.type}:${o.target} の出現マップがない`);
      await go(mapId);
      const areaIdx = G.spawner.areas.map((a, k) => (a.types.some((t) => sources.includes(t)) ? k : -1)).filter((k) => k >= 0);
      if (cop) {
        if (!G.map.town) return res(false, `警官 ${o.target} の目標なのに ${mapId} は町でない`);
      } else if (!areaIdx.length) return res(false, `${o.target} の対象 (${sources.join('/')}) が ${mapId} の出現表にない: ${G.spawner.areas.map((a) => a.types.join('/')).join(' | ')}`);
      const killed = new Set();
      let spawned = 0;
      for (let k = 0; k < 1500 && val(i) < o.count; k++) {
        freeInv();
        if (cop) {
          const lv = sources.includes('cop_patrol') ? 2 : 4;
          if (G.wanted < lv) C.setWantedLevel(G, lv);
          G.spawner.wantedT = 0;
        } else {
          for (const a of areaIdx) {
            const alive = G.enemies.filter((e) => e.spawnIdx === a && !e.dead && !e.remove).length;
            if (alive < (G.spawner.areas[a].max || 3)) { if (G.spawner.spawnInArea(a)) spawned++; }
          }
        }
        // 対象を倒す（対象外は枠を空けるため消す）
        for (const e of G.enemies) {
          if (e.dead || e.remove) continue;
          if (sources.includes(e.defId)) { killed.add(e.defId); C.damageEnemy(G, e, e.hp + 1, false, 0); }
          else if (!cop && e.spawnIdx != null && areaIdx.includes(e.spawnIdx)) e.remove = true;
          else if (cop && e.fromWanted && k % 60 === 59) e.remove = true; // 対象外の警察が枠を塞がないように
        }
        await wait(1);
        // 対象アイテムのドロップを拾う
        if (o.type === 'collect') for (const d of G.drops) if (d.id === o.target && !d.dead) { d.t = Math.max(d.t, d.pickDelay); d.pickup(); }
      }
      if (val(i) < o.count) return res(false, `${o.type}:${o.target} が ${mapId} で ${val(i)}/${o.count}（spawned ${spawned}, killed ${[...killed].join('/')}）`);
      notes.push(`${o.type}:${o.target} @${mapId} OK (倒した種類 ${[...killed].join('/')})`);
      if (cop) { C.setWantedLevel(G, 0); G.enemies = G.enemies.filter((e) => !e.fromWanted); }
    } else return res(false, `未対応の目的 ${o.type}`);
  }
  // 報告
  C.setWantedLevel(G, 0);
  await go(npcMap(turnNpc));
  if (!npcHere(turnNpc)) return res(false, `報告NPC ${turnNpc} が ${G.map.id} にいない`);
  await talk(turnNpc);
  if (!G.missions.completable(turnNpc).some((x) => x.id === id)) return res(false, `報告不可: ${JSON.stringify(G.missions.objectiveValues(id))}`);
  if (!G.missions.turnIn(id)) return res(false, 'turnIn 失敗');
  return res(true);
}

main().catch((e) => { console.error(e); process.exit(2); });
