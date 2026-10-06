// Playwright スモークテスト（v3）
// http-server でプロジェクトをサーブ → chromium headless でロード → 一通り操作 → tests/screenshots/ に保存
// console error / pageerror / game.lastError / UI ガード警告 を収集し、0 件であることを検証する。
// 実行: node tests/smoke.mjs   (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
//   --only=luna,jin,maps,bosses,v1save,story,chars,jobs,v3,oldsaves  で一部だけ実行（既定は全部）
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
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
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
  page.on('requestfailed', (r) => {
    // ページの読み直し・移動で読み込み中のファイルが打ち切られるのは正常（ERR_ABORTED）。それ以外の失敗（404 など）は問題として数える
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
    report('requestfailed', `${r.url()} ${r.failure()?.errorText}`);
  });

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
    return { civ: civ.length, cop: cop.length, mon: mon.length, police: window.game.vehicles.filter((v) => v.policeSpawned).length, cars: window.game.vehicles.length, types: [...new Set(mon.map((e) => e.defId))] };
  });
  const playerScreenClip = async (pad = 90) => {
    const r = await g(() => { const { player: p, cam } = window.game; return { x: p.x - cam.x, y: p.y - cam.y }; });
    const x = Math.max(0, Math.min(1280 - pad * 2, Math.round(r.x - pad)));
    const y = Math.max(0, Math.min(720 - pad * 2, Math.round(r.y - pad * 1.6)));
    return { x, y, width: pad * 2, height: pad * 2 };
  };
  const quiet = () => g(() => { const gm = window.game; gm.enemies.length = 0; gm.drops.length = 0; gm.spawner.timers = gm.spawner.timers.map(() => -1e9); });


  // ---------- v3 ヘルパー
  const hitRect = (id) => g((id) => window.game.ui.hits.find((h) => h.id === id)?.r || null, id);
  const hasHit = async (id) => !!(await hitRect(id));
  const clickHit = async (id, wait = 3) => {
    let r = await hitRect(id);
    for (let i = 0; i < 5 && !r; i++) { await frames(2); r = await hitRect(id); }
    if (!r) return false;
    await clickCanvas(r.x + r.w / 2, r.y + r.h / 2);
    await frames(wait);
    return true;
  };
  const titleState = () => g(async () => {
    const t = (await import('./src/ui/title.js'))._titleState();
    return { screen: t.screen, sel: t.sel, del: t.del, c: t.c && { step: t.c.step, cls: t.c.cls, gender: t.c.gender, slot: t.c.slot } };
  });
  const titleBtn = (id) => g(async (id) => (await import('./src/ui/title.js'))._titleState().btns.find((b) => b.id === id)?.r || null, id);
  const clickTitleBtn = async (id) => { const r = await titleBtn(id); if (!r) return false; await clickCanvas(r.x + r.w / 2, r.y + r.h / 2); await frames(3); return true; };
  const slotsInfo = () => g(async () => (await import('./src/core/save.js')).listSlots().map((s) => s && { heroId: s.heroId, gender: s.gender, name: s.name, level: s.level, job: s.job }));
  /** タイトル/キャラ選択からキャラ作成画面を通って新規作成（クラス → 性別 → 見た目 → 名前）→ プレイ開始 */
  async function createViaUI(cls, gender, name, shotPrefix = null) {
    let s = await titleState();
    if (s.screen === 'title') { await press('Enter'); await frames(3); s = await titleState(); }
    if (s.screen === 'select') {
      const empty = await g(async () => (await import('./src/core/save.js')).firstEmptySlot());
      if (empty < 0) return { ok: false, err: '空きスロットなし' };
      for (let i = 0; i < 8 && (await titleState()).sel !== empty; i++) await press('ArrowRight');
      if (shotPrefix) await shot(`${shotPrefix}_select`);
      await press('Enter');
      s = await titleState();
    }
    if (s.screen !== 'create') return { ok: false, err: `作成画面にならない: ${JSON.stringify(s)}` };
    const slot = s.c.slot;
    for (let i = 0; i < 4 && (await titleState()).c.cls !== cls; i++) await press('ArrowRight');
    if (shotPrefix) await shot(`${shotPrefix}_class`);
    await press('Enter');
    if ((await titleState()).c.gender !== gender) await press('ArrowRight');
    if (shotPrefix) await shot(`${shotPrefix}_gender`);
    const s2 = await titleState();
    await press('Enter');
    await press('ArrowRight'); // 髪型を変える
    if (shotPrefix) await shot(`${shotPrefix}_look`);
    await press('Enter');
    await page.waitForTimeout(300);
    const inp = page.locator('#nvs-name-input');
    if (!(await inp.isVisible())) return { ok: false, err: '名前入力が出ない' };
    await inp.fill(name);
    if (shotPrefix) await shot(`${shotPrefix}_name`);
    await inp.press('Enter');
    const ok = await waitFor(() => window.game.scene === 'play' && !!window.game.player, 5000);
    await page.waitForTimeout(400);
    const st = await g(() => ({ hero: window.game.state.heroId, gender: window.game.state.gender, name: window.game.state.name, map: window.game.map.id }));
    return { ok: ok && st.hero === cls && st.gender === gender && st.name === name && s2.c.cls === cls, slot, st };
  }
  /** Esc メニュー →「キャラクター選択へ」→ 確認 → タイトル（キャラ選択） */
  async function backToSelect() {
    await g(() => window.game.ui.closeAll());
    await frames(2);
    await press('Escape');
    await page.waitForTimeout(150);
    if (!(await g(() => window.game.ui.isOpen('menu')))) return false;
    await clickHit('menu:mi5');
    await clickHit('menu:mYes');
    return waitFor(() => window.game.scene === 'title', 3000);
  }
  /** クイック作成（テスト用 _titleQuick） */
  async function quickChar(cls, gender = 'f', slot = 0) {
    await gotoTitle(true);
    await g(([cls, gender, slot]) => { window.game._titleQuick = { slot, create: { classId: cls, name: 'T' + cls, gender } }; }, [cls, gender, slot]);
    await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 5000 });
    await page.waitForTimeout(300);
  }
  /** 会話窓（V）で報告する。choiceText があれば分岐でそれを選ぶ */
  async function reportViaDialog(npcId, missionId, choiceText = null) {
    const n = await g((id) => { const n = window.game.npcs.find((x) => x.id === id); return n && { x: n.x, y: n.y }; }, npcId);
    if (!n) return `NPC ${npcId} がいない`;
    await g(() => window.game.ui.closeAll());
    await teleport(n.x + 30, n.y); await frames(4);
    await press('KeyV'); await page.waitForTimeout(250);
    if (!(await g(() => window.game.ui.isOpen('dialog')))) return 'V で会話窓が開かない';
    let chose = !choiceText;
    for (let i = 0; i < 80; i++) {
      const d = await g(() => {
        const w = window.game.ui.wins.dialog;
        if (!w) return { closed: true };
        const line = w.lines?.[w.li] || '';
        const done = w.chars >= line.length && w.li >= (w.lines?.length || 1) - 1;
        return { opts: w.opts && done ? w.opts.map((o) => o.label) : null, t: w.t };
      });
      const doneM = await g((id) => window.game.state.missions.completed.includes(id), missionId);
      if (d.closed || (doneM && chose && d.opts && d.opts.includes('OK'))) break;
      if (d.opts) {
        let idx = -1;
        if (choiceText && !chose) { idx = d.opts.indexOf(choiceText); if (idx >= 0) chose = true; }
        if (idx < 0) idx = d.opts.findIndex((l) => l.startsWith('？ 報告'));
        if (idx < 0) idx = d.opts.indexOf('OK');
        if (idx < 0) break;
        await g((i) => { window.game.ui.wins.dialog.optSel = i; }, idx);
      }
      await press('Enter');
      await page.waitForTimeout(90);
    }
    await g(() => window.game.ui.close('dialog'));
    return (await g((id) => window.game.state.missions.completed.includes(id), missionId)) ? null : `報告できない（opts 操作後も未完了）`;
  }
  /** 転職: Lv を上げる → 頭上の吹き出しをクリック → jobOffer → 受注 → 試練（runMission）→ 教官に V で報告 → 転職 */
  async function jobViaUI(jobId, shotName = null) {
    const J = await g((id) => import('./src/data/jobs.js').then((m) => { const j = m.JOBS[id]; return { tier: j.tier, reqLevel: j.reqLevel, skills: j.skills, aura: j.aura, name: j.name }; }), jobId);
    await g(() => { window.game.ui.closeAll(); window.game.debug.god = true; });
    await g((lv) => { const G = window.game; if (G.state.level < lv) G.debug.setLevel(lv - 1); }, J.reqLevel);
    await frames(4);
    const before = await hasHit('hud:jobBubble');
    await g((lv) => window.game.debug.setLevel(lv), J.reqLevel);
    await g(() => window.game.ui.closeAll());
    await page.waitForTimeout(300);
    const bubble = await hasHit('hud:jobBubble');
    if (shotName) await shot(`${shotName}_bubble`);
    const okBubble = (J.tier === 1 ? !before : true) && bubble;
    await clickHit('hud:jobBubble');
    await page.waitForTimeout(200);
    const opened = await g(() => window.game.ui.isOpen('jobOffer'));
    if (shotName) await shot(`${shotName}_offer`);
    await clickHit('jobOffer:accept:' + jobId);
    const mid = 'job_' + jobId;
    const accepted = await g((mid) => window.game.state.missions.active.includes(mid), mid);
    const noBubble = !(await hasHit('hud:jobBubble'));
    if (!okBubble || !opened || !accepted) return { ok: false, err: `bubble(前${before}/後${bubble}) open=${opened} accepted=${accepted}` };
    const r = await g(runMission, { id: mid, skipAccept: true, stopBeforeReport: true });
    if (!r.ok) return { ok: false, err: `試練: ${r.err}` };
    const er = await reportViaDialog(r.turnNpc, mid);
    if (er) return { ok: false, err: `報告: ${er}` };
    await page.waitForTimeout(300);
    if (shotName) await shot(`${shotName}_done`);
    const st = await g((skills) => ({ job: window.game.state.job.id, learned: skills.every((s) => window.game.state.skills[s] > 0), aura: window.game.player.anim.aura }), J.skills);
    return { ok: st.job === jobId && st.learned && st.aura === J.aura && noBubble, err: JSON.stringify(st), sec: r.sec };
  }
  /** 移動スキルを H に置いて使う → 位置の変化を測る */
  async function useMoveSkill(skillId) {
    await warp('beach_f2', 400);
    await quiet();
    await g((id) => {
      const G = window.game, p = G.player;
      G.state.skillBar[7] = id; p.x = G.map.width / 2; p.y = G.map.groundY; p.vx = p.vy = 0; p.climbing = null; p.facing = 1;
      p.regenT = -1e9; // 自然回復を止めて MP 消費を正確に測る
    }, skillId);
    await g(() => import('./src/systems/progression.js').then((P) => { window.game.state.mp = P.computeStats(window.game.state).maxMp; }));
    await g(() => import('./src/systems/skills.js').then((m) => m.resetCooldowns()));
    await frames(3);
    const type = await g((id) => import('./src/data/skills.js').then((m) => m.SKILLS[id]?.move?.type), skillId);
    const x0 = await g(() => window.game.player.x);
    const mp0 = await g(() => window.game.state.mp);
    if (type === 'flashJump') { await page.keyboard.down('Space'); await sleep(60); await page.keyboard.up('Space'); await sleep(140); }
    const air = await g(() => !window.game.player.onGround);
    await press('KeyH', 50);
    let moveSeen = await g(() => window.game.player.move?.type || null);
    await sleep(type === 'wheelDash' ? 700 : 350);
    moveSeen ||= await g(() => window.game.player.move?.type || null);
    await frames(2);
    const r = await g(() => ({ x: window.game.player.x, mp: window.game.state.mp }));
    await g(() => { window.game.player.regenT = 0; });
    return { type, dx: r.x - x0, mpUsed: mp0 - r.mp, air, moveSeen };
  }

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
    // v3: タイトル → （セーブ無し）キャラ作成: クラス → 性別 → 見た目 → 名前（DOM input で Enter）
    await press('Enter');
    await frames(3);
    if (hero === 'jin') await press('ArrowRight');
    if (hero === 'hacker') { await press('ArrowRight'); await press('ArrowRight'); }
    await frames(3);
    if (shotTitle) await shot(`create_class_${hero}`);
    await press('Enter'); // → 性別
    await press('Enter'); // → 見た目
    await press('Enter'); // → 名前
    await page.waitForTimeout(250);
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
    await check('町: 警察・パトカーがいない', c.cop === 0 && c.police === 0, JSON.stringify(c));
    // 町: スキルが使える（攻撃は空振り）
    const mp0 = await g(() => window.game.state.mp);
    await press('KeyA', 40);
    await sleep(150);
    const mp1 = await g(() => window.game.state.mp);
    await check('町: スキル(A) が使える（MP を消費）', mp1 < mp0, `MP ${mp0} → ${mp1}`);
    await check('町: 「町ではスキル」通知が出ない', !(await toastHas(/町ではスキル/)));
    await shot('luna_town_skill');
    // 町: 住民は通常攻撃・スキルの対象外（ダメージなし・手配度なし・警察なし）
    let civTries = 0, civHurt = 0;
    for (let i = 0; i < 6; i++) {
      const ok = await g(() => {
        const gm = window.game, p = gm.player;
        const e = gm.enemies.find((x) => !x.dead && (x.civilian || x.def?.civilian));
        if (!e) return false;
        e.x = p.x + 40 * p.facing; e.y = p.y; e.vx = 0; window.__civ = e; window.__civHp = e.hp; return true;
      });
      if (!ok) { await sleep(500); continue; }
      civTries++;
      await hold('KeyX', 120);
      await g(() => import('./src/systems/skills.js').then((m) => m.resetCooldowns()));
      await press('KeyA', 40);
      await page.waitForTimeout(300);
      if (await g(() => window.__civ.hp < window.__civHp || window.__civ.dead)) civHurt++;
    }
    const wl = await g(() => [window.game.wanted, window.game.wantedHeat]);
    await check('町: 住民に攻撃が当たらない', civTries > 0 && civHurt === 0, `tries=${civTries} hurt=${civHurt}`);
    await check('町: 手配度は上がらない', wl[0] === 0 && wl[1] === 0, JSON.stringify(wl));
    await page.waitForTimeout(1500);
    c = await census();
    await check('町: 住民を叩いても警察が来ない', c.cop === 0 && c.police === 0 && !(await g(() => window.game.enemies.some((e) => e.fromWanted))), JSON.stringify(c));
    await shot('luna_town_no_police');

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
    // 乗り物は廃止（町に車がない・E で乗れない）+ ミュート(N)
    await check('beach に車がない', await g(() => window.game.vehicles.length === 0 && !(window.game.map.vehicles || []).length));
    await teleport(1000, await g(() => window.game.map.groundY)); await frames(5);
    await press('KeyE');
    await check('E で乗車しない', !(await g(() => window.game.player.inVehicle)));
    {
      const m0 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.muted));
      await press('KeyN');
      const m1 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.muted));
      await press('KeyN');
      const m2 = await g(() => import('./src/audio/audio.js').then((m) => m.audio.muted));
      await check('ミュート (N) 切替', m1 === !m0 && m2 === m0, `${m0} → ${m1} → ${m2}`);
      const ast = await g(() => import('./src/audio/audio.js').then((m) => m.audio.stats()));
      info(`audio ${JSON.stringify(ast)}`);
      await press('KeyR'); // R（ラジオは乗車中のみ。今は何も起きない・例外なし）
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
    // フィールド: 警察は出ない・手配度は 0 のまま
    await page.waitForTimeout(1500);
    c = await census();
    await check('フィールド: 警察が出ない', c.cop === 0 && c.police === 0, JSON.stringify(c));
    await check('フィールド: 手配度 0', (await g(() => window.game.wanted)) === 0);
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
      for (const d of list) { d.vx = 0; gm.drops.push(d); }
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
    await check('HUD は main から1フレーム1回描画（二重描画なし）', await g(() => { const u = window.game.ui; return u._hudFrame === window.game.frameNo && u._hudByUi === false; }));
    // メイプル風 HUD: 右下のクイックスロット・取得ログ・メニューボタン
    const qs = await g(async () => (await import('./src/ui/hud.js')).hudSlots().map((s) => ({ kind: s.kind, x: s.x, y: s.y })));
    await check('クイックスロット: スキル8＋消耗品2 が右下に', qs.filter((s) => s.kind === 'skill').length === 8 && qs.filter((s) => s.kind === 'potion').length === 2 && qs.every((s) => s.x > 900 && s.y > 600), JSON.stringify(qs.slice(0, 2)));
    await g(() => { const G = window.game; G.state.money += 25; G.events.emit('moneyPicked', { amount: 25 }); G.events.emit('itemPicked', { id: 'potion_red', qty: 1 }); });
    await frames(3);
    const logs = await g(async () => (await import('./src/ui/hudMaple.js')).hudLogLines(window.game));
    await check('取得ログ: お金・アイテムをメイプルの文の形で出す', logs.includes('ドルを 25 獲得しました。') && logs.some((l) => /^アイテムを獲得しました（.+）$/.test(l)), JSON.stringify(logs.slice(-3)));
    await g(() => window.game.ui.closeAll());
    await frames(3);
    await clickHit('hud:menu:inventory');
    await check('右下のメニューボタンで持ち物が開く', await g(() => window.game.ui.isOpen('inventory')));
    await g(() => window.game.ui.closeAll());
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
    await g(() => { window.__before = window.game.enemies.filter((e) => !e.dead); });
    await press('F8');
    const f8 = await g(() => ({ n: window.__before.length, alive: window.__before.filter((e) => !e.dead && !e.remove).map((e) => `${e.defId}:${e.hp}`), log: window.game.debug.log.at(-1) }));
    await check('F8 全敵撃破', f8.n > 0 && f8.alive.length === 0, JSON.stringify(f8));
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
    await press('Enter'); // タイトル → キャラ選択（アクティブスロットが選択済み）
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
      if (!r.town && (cs.mon === 0 || cs.civ > 0)) bad.push(`${id}: フィールド mon=${cs.mon} civ=${cs.civ}`);
      // 警察・パトカー・乗り物はどのマップにも出ない
      if (cs.cop || cs.police || cs.cars) bad.push(`${id}: 警察/乗り物 ${JSON.stringify(cs)}`);
      info(`map ${id.padEnd(10)} ${r.town ? 'TOWN ' : 'field'} ${r.region}/${r.variant} mon=${cs.mon} civ=${cs.civ} frame avg ${r.avg.toFixed(1)}ms max ${r.max.toFixed(1)}ms fps≈${r.fps.toFixed(0)}`);
    }
    await check('34 マップ全ワープ（町=住民のみ / フィールド=モンスターのみ / 警察・乗り物なし）', bad.length === 0, bad.join(' | '));
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
    await press('Enter'); // タイトル → キャラ選択
    await frames(3);
    await press('Enter');
    const ok = await waitFor(() => window.game.scene === 'play' && !!window.game.player, 5000);
    await page.waitForTimeout(800);
    const st = await g(() => {
      const s = window.game.state;
      return { ok: true, hero: s.heroId, lv: s.level, money: s.money, map: window.game.map?.id, pet: s.equipped.pet, visited: s.visited, book: typeof s.book, sns: !!s.sns, clock: typeof s.clock, inv: s.inventory.map((x) => x.id), active: s.missions.active, version: s.version };
    });
    await check('旧v1セーブ「つづきから」で起動', ok && st.hero === 'jin' && st.lv === 7 && st.money >= 1234 && st.map === 'beach', JSON.stringify(st));
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
    const choiceOf = await g(() => import('./src/data/missions.js').then((m) => Object.fromEntries(Object.values(m.MISSIONS).filter((x) => x.choices?.length).map((x) => [x.id, x.choices.at(-1)]))));
    for (const id of story) {
      const ch = choiceOf[id];
      // 分岐のあるミッションは会話窓（V）で報告し、最後の選択肢（既定でない方）を選ぶ
      const r = await g(runMission, ch ? { id, stopBeforeReport: true } : id);
      if (r.ok && r.pending) {
        const er = await reportViaDialog(r.turnNpc, id, ch.text);
        if (er) { r.ok = false; r.err = er; }
        const cs = await g(([id, flag]) => ({ choice: window.game.state.storyChoices?.[id], flag: !!window.game.state.flags?.[flag] }), [id, ch.flag]);
        await check(`ストーリー分岐 ${id}: 「${ch.text}」を選択（flag ${ch.flag}）`, !er && cs.choice === ch.id && cs.flag, JSON.stringify(cs));
        if (id === 'm06_dirty_badge') await shot('story_choice_done');
      }
      for (const n of r.notes) info(`${id}: ${n}`);
      await check(`ストーリー ${id} ${r.name}`, r.ok, r.err || `Lv${r.level} ${r.sec.toFixed(1)}s`);
      if (!r.ok) break;
    }
    // 分岐の結果で後のセリフが変わる（dialogByFlag）
    const later = await g(() => import('./src/data/missions.js').then((m) => {
      const x = Object.values(m.MISSIONS).find((q) => q.dialogByFlag?.sideStreet?.offer);
      if (!x) return null;
      const d = window.game.missions.dialog?.(x.id, 'offer') || [];
      return { id: x.id, ok: JSON.stringify(d) === JSON.stringify(x.dialogByFlag.sideStreet.offer) && JSON.stringify(d) !== JSON.stringify(x.dialog?.offer || []) };
    }));
    if (later) await check('分岐の flag（sideStreet）で後のセリフが変わる', later.ok, JSON.stringify(later));
    await shot('story_final');
    await check('メインストーリー完了フラグ', await g(() => window.game.state.missions.completed.includes('m15_don')));
  }


  // ===================================================== v3: キャラ作成（3クラス×♂♀）・6スロット・切替・削除
  if (want('chars')) {
    console.log('--- CHARS (v3)');
    await gotoTitle(true);
    const combos = [['luna', 'f', 'ミラ'], ['luna', 'm', 'カイ'], ['jin', 'm', 'レオ'], ['jin', 'f', 'サクラ'], ['hacker', 'f', 'ノヴァ'], ['hacker', 'm', 'ゼン']];
    for (let i = 0; i < combos.length; i++) {
      const [cls, gender, name] = combos[i];
      const r = await createViaUI(cls, gender, name, `char_${cls}_${gender}`);
      await check(`キャラ作成 ${cls}♂♀=${gender}「${name}」（クラス→性別→見た目→名前）`, r.ok && r.slot === i, JSON.stringify(r));
      if (i === 0) {
        // 1人目はプレイして少し進める（Lv とお金を変えてから戻る → 保存されている）
        await g(() => { window.game.debug.setLevel(5); window.game.state.money += 777; });
      }
      await shot(`char_${cls}_${gender}_play`, await playerScreenClip(100));
      await check(`キャラ選択へ戻る（${name}）`, await backToSelect(), JSON.stringify(await titleState()));
    }
    const sl = await slotsInfo();
    await check('6スロットすべて保存（クラス・性別・名前）', sl.every((s, i) => s && s.heroId === combos[i][0] && s.gender === combos[i][1] && s.name === combos[i][2]), JSON.stringify(sl));
    await check('スロット0 は Lv5 で保存されている', sl[0]?.level === 5, JSON.stringify(sl[0]));
    await shot('char_select_6slots');
    // 満員: 空きなし
    await check('6スロット満員（firstEmptySlot = -1）', (await g(async () => (await import('./src/core/save.js')).firstEmptySlot())) === -1);
    // 別スロット（3 = ジン♀ サクラ）で開始
    for (let i = 0; i < 8 && (await titleState()).sel !== 3; i++) await press('ArrowRight');
    await press('Enter');
    await waitFor(() => window.game.scene === 'play', 5000);
    await page.waitForTimeout(300);
    const s3 = await g(() => ({ hero: window.game.state.heroId, gender: window.game.state.gender, name: window.game.state.name }));
    await check('別スロット（3: サクラ）で開始', s3.hero === 'jin' && s3.gender === 'f' && s3.name === 'サクラ', JSON.stringify(s3));
    await backToSelect();
    // スロット0 を選んで再開 → Lv5・お金が残っている
    for (let i = 0; i < 8 && (await titleState()).sel !== 0; i++) await press('ArrowRight');
    await press('Enter');
    await waitFor(() => window.game.scene === 'play', 5000);
    const s0 = await g(() => ({ name: window.game.state.name, lv: window.game.state.level, money: window.game.state.money }));
    await check('スロット0（ミラ）を再開: Lv5・所持金が残る', s0.name === 'ミラ' && s0.lv === 5 && s0.money >= 1777, JSON.stringify(s0));
    await backToSelect();
    // 削除（スロット5 = ゼン）: 削除ボタン → 確認 → Enter
    for (let i = 0; i < 8 && (await titleState()).sel !== 5; i++) await press('ArrowRight');
    await clickTitleBtn('del');
    await check('削除の確認が出る', (await titleState()).del === 5);
    await shot('char_delete_confirm');
    await press('Enter');
    await frames(3);
    const after = await slotsInfo();
    await check('スロット5 を削除（他は残る）', !after[5] && after.slice(0, 5).every(Boolean), JSON.stringify(after.map((s) => s && s.name)));
    // 削除キャンセル（Esc）は消えない
    for (let i = 0; i < 8 && (await titleState()).sel !== 4; i++) await press('ArrowRight');
    await clickTitleBtn('del');
    await press('Escape');
    await check('削除をやめる（Esc）と残る', !!(await slotsInfo())[4]);
    // 空いたスロットに新規作成
    const rn = await createViaUI('hacker', 'm', 'ヴァイス');
    await check('空いたスロットに新規作成', rn.ok && rn.slot === 5, JSON.stringify(rn));
    await shot('char_new_after_delete');
  }

  // ===================================================== v3: 転職（吹き出し → 受注 → 試練 → 報告 → 転職）＋移動スキル
  if (want('jobs')) {
    console.log('--- JOBS (v3)');
    const LINES = [
      ['luna', 'f', ['luna_gunner', 'luna_sharpshooter'], 'lj_gun_recoil_jump'],
      ['luna', 'm', ['luna_dancer', 'luna_rave_star'], 'lj_dance_blink'],
      ['jin', 'm', ['jin_brawler', 'jin_knuckle_champ'], 'jj_fight_shoulder_rush'],
      ['jin', 'f', ['jin_racer', 'jin_drifter'], 'jj_race_wheel_dash'],
      ['hacker', 'm', ['hk_netrunner'], null],
      ['hacker', 'f', ['hk_drone_pilot', 'hk_swarm_commander', 'hk_mecha_architect', 'hk_orbital_master'], 'hd_drone_lift'],
    ];
    for (const [cls, gender, jobs, moveId] of LINES) {
      await quickChar(cls, gender);
      // Lv1 共通の移動スキル: ストリートダッシュ（S・低MP・移動速度アップのみ）
      if (cls === 'luna' && gender === 'f') {
        await warp('beach_f1', 400);
        await quiet();
        const sd = await g(async () => {
          const G = window.game, P = await import('./src/systems/progression.js'), S = await import('./src/data/skills.js');
          return { bar1: G.state.skillBar[1], lv: G.state.skills.street_dash, speed: P.computeStats(G.state).speed, mp: G.state.mp, cost: S.SKILLS.street_dash };
        });
        await press('KeyS', 40); await frames(4);
        const sd2 = await g(async () => ({ speed: (await import('./src/systems/progression.js')).computeStats(window.game.state).speed, mp: window.game.state.mp }));
        await check('Lv1 ストリートダッシュ（S）: 移動速度アップ・低MP', sd.bar1 === 'street_dash' && sd.lv >= 1 && sd2.speed > sd.speed && sd.mp - sd2.mp > 0 && sd.mp - sd2.mp <= 6, `speed ${sd.speed}→${sd2.speed} MP ${sd.mp}→${sd2.mp}`);
        await shot('move_street_dash', await playerScreenClip(120));
      }
      for (let k = 0; k < jobs.length; k++) {
        const jid = jobs[k];
        const first = k === 0 && (cls === 'hacker' && gender === 'f');
        const r = await jobViaUI(jid, first || k === 3 || (cls === 'luna' && gender === 'f' && k === 0) ? `job_${jid}` : null);
        await check(`転職 ${cls}: ${jid}（${k + 1}次）吹き出し→受注→試練→報告`, r.ok, r.err + (r.sec ? ` ${r.sec.toFixed(1)}s` : ''));
        if (!r.ok) break;
        if (k === 1 && moveId) {
          const mv = await useMoveSkill(moveId);
          await shot(`move_${mv.type}`, await playerScreenClip(160));
          await check(`2次の移動スキル ${moveId}（${mv.type}）で移動`, Math.abs(mv.dx) > 100 && mv.mpUsed > 0, JSON.stringify(mv));
        }
        if (k === 2 && moveId) {
          // 3次: 移動スキル強化（enhances）→ moveParams に反映
          const en = await g(async (id) => {
            const SK = await import('./src/systems/skills.js');
            const p = SK.moveParams(window.game.state, id, window.game.state.skills[id] || 1);
            return { enhancedBy: p.enhancedBy, distance: p.distance };
          }, moveId);
          await check(`3次: 移動スキル強化が ${moveId} に反映`, (en.enhancedBy || []).length > 0, JSON.stringify(en));
          const mv = await useMoveSkill(moveId);
          await check(`3次: 強化後の ${moveId} を使用`, Math.abs(mv.dx) > 100, JSON.stringify(mv));
        }
      }
      if (cls === 'hacker' && gender === 'f') {
        // 4次: 職のオーラ・最終奥義（カットイン）・HUD の職名
        const jf = await g(() => ({ tier: window.game.state.job.tier, title: window.game.state.job.id }));
        await check('4次転職まで到達（ドローンマスター系）', jf.tier === 4, JSON.stringify(jf));
        await warp('space_f1', 500);
        await quiet();
        await g(() => { const G = window.game; G.state.skillBar[0] = 'hd_orbital_laser'; G.state.mp = 99999; G.cutins = []; for (let i = 0; i < 4; i++) G.debug.spawnEnemy(); });
        await g(() => import('./src/systems/skills.js').then((m) => m.resetCooldowns()));
        await press('KeyA', 40);
        await page.waitForTimeout(250);
        await shot('job4_ultimate_cutin');
        await check('4次奥義でカットイン・ヒットストップ演出', await g(() => (window.game.cutins || []).length > 0 || window.game.hitstop > 0 || window.game.camZoom > 1));
        await page.waitForTimeout(900);
        await shot('job4_aura', await playerScreenClip(130));
        await check('4次: 次の転職の吹き出しは出ない', !(await hasHit('hud:jobBubble')));
      }
    }
  }

  // ===================================================== v3: やり込み・UI（ナビ / V会話 / 強化 / 潜在 / タワー / アリーナ / ボス / 実績 / ログボ / プリセット / 共有倉庫 / 設定）
  if (want('v3')) {
    console.log('--- V3 CONTENT');
    await quickChar('hacker', 'f');
    // V で会話（頭上に「V で話す」）
    const rico = await g(() => { const n = window.game.npcs.find((x) => x.id === 'rico'); return n && { x: n.x, y: n.y }; });
    await teleport(rico.x + 40, rico.y); await frames(6);
    await shot('v3_talk_prompt', await playerScreenClip(150));
    await check('NPC に近づくと会話対象（nearestNpc）', await g(() => window.game.player.nearestNpc()?.id === 'rico'));
    await press('KeyV'); await page.waitForTimeout(250);
    await check('V で会話窓が開く', await g(() => window.game.ui.isOpen('dialog')));
    await g(() => window.game.ui.close('dialog'));
    // 乗り物は廃止: 町に車がなく、E でも乗車しない
    await check('町に車がない（E は会話だけ）', await g(() => window.game.vehicles.length === 0 && !window.game.player.inVehicle));
    // クエスト詳細・ナビ
    await g(() => window.game.missions.accept('m01_welcome'));
    await g(() => window.game.ui.closeAll());
    await page.waitForTimeout(400);
    // 重い通し実行ではフレームが遅れることがあるので、少し待って確かめる
    await waitFor(() => (window.game.ui.hits || []).some((h) => h.id === 'hud:nav'), 3000);
    await check('ナビ矢印（画面端）が出る（別マップの目的地 → ポータル方向）', await hasHit('hud:nav'));
    await shot('v3_nav_arrow');
    await clickHit('hud:track:m01_welcome');
    await page.waitForTimeout(200);
    await check('トラッカーのクリックでクエスト詳細', await g(() => window.game.ui.isOpen('missions') && window.game.ui.wins.missions.sel === 'm01_welcome'));
    const gd = await g(() => import('./src/systems/guide.js').then((m) => m.missionGuide(window.game, 'm01_welcome')));
    await check('クエスト詳細: 対象マップ・ルート・次のポータル', gd[0]?.mapId === 'beach_f1' && gd[0]?.route?.length >= 2 && gd[0]?.nextPortal?.to === 'beach_f1', JSON.stringify(gd[0]));
    await shot('v3_quest_detail');
    await clickHit('missions:wmShow');
    await page.waitForTimeout(300);
    await check('「ワールドマップで表示」→ ワールドマップ', await g(() => window.game.ui.isOpen('worldmap')));
    await shot('v3_quest_worldmap');
    await g(() => window.game.ui.closeAll());
    // 現地では敵の方向・報告は NPC の方向
    await warp('beach_f1', 600);
    await page.waitForTimeout(400);
    await shot('v3_nav_field');
    await g(() => { const G = window.game; for (let i = 0; i < 8; i++) G.events.emit('enemyKilled', { enemy: { def: { id: 'slime_green' }, defId: 'slime_green' } }); });
    // ★強化（ネオン・チューン）: 確率・天井を表示、壊れない、★は下がらない
    await warp('beach', 400);
    await g(() => { const G = window.game; G.debug.setLevel(60); G.state.money += 5e7; });
    await g(() => window.game.ui.open('tune'));
    await page.waitForTimeout(200);
    const tw = await g(() => import('./src/systems/tune.js').then((m) => { const G = window.game; const ref = G.ui.wins.tune.data.ref; return { ref, info: ref ? m.tuneInfo(G.state, ref) : null }; }));
    await check('強化窓: 装備を選択・成功率/天井/費用を表示', tw.info && tw.info.rate > 0 && tw.info.pityMax > 0 && tw.info.cost > 0, JSON.stringify(tw.info && { star: tw.info.star, rate: tw.info.rate, pity: tw.info.pity, pityMax: tw.info.pityMax, cost: tw.info.cost }));
    let lastStar = tw.info?.star || 0, down = false, clicks = 0, tries0 = await g(() => window.game.state.tuneStats?.tries || 0);
    for (let i = 0; i < 12 && lastStar < tw.info.maxStar; i++) {
      if (await clickHit('tune:doTune', 2)) clicks++;
      const st = await g((ref) => import('./src/systems/tune.js').then((m) => m.tuneInfo(window.game.state, ref).star), tw.ref);
      if (st < lastStar) down = true;
      lastStar = st;
    }
    const tries1 = await g(() => window.game.state.tuneStats?.tries || 0);
    await shot('v3_tune');
    await check('強化: クリックごとに試行が記録され★は下がらない（装備は壊れない）', clicks > 0 && tries1 - tries0 === clicks && !down && lastStar >= 1, `clicks=${clicks} tries ${tries0}→${tries1} star=${lastStar}/${tw.info.maxStar}`);
    await check('強化後も装備が残る', await g((ref) => import('./src/systems/inventory.js').then((I) => !!I.resolveItemRef(window.game.state, ref)), tw.ref));
    await g(() => window.game.ui.close('tune'));
    // 潜在（ハックチップ）: チップ使用 → 前後比較 → 採用
    await g(async () => { const I = await import('./src/systems/inventory.js'); I.addItem(window.game, 'chip_reroll', 5, { silent: true }); });
    await g(() => window.game.ui.open('potential'));
    await page.waitForTimeout(200);
    const pc0 = await g(() => window.game.state.inventory.filter((s) => s.id === 'chip_reroll').reduce((a, s) => a + s.qty, 0));
    const potNow = () => g(() => import('./src/systems/potential.js').then((m) => { const G = window.game; const ref = G.ui.wins.potential?.data?.ref; const i = ref ? m.potInfo(G.state, ref) : null; return i && { grade: i.grade, lines: (i.lines || []).map((l) => `${l.stat}:${l.value}`).join(',') }; }));
    // 1回目: 潜在の無い装備 → レア潜在を付与
    await clickHit('potential:useChip');
    await page.waitForTimeout(200);
    const potA = await potNow();
    // 2回目: 再設定 → 前後比較（元のまま / 採用）→ 採用
    await clickHit('potential:useChip');
    await page.waitForTimeout(200);
    await shot('v3_potential_compare');
    const hasApply = await hasHit('potential:apply');
    await clickHit('potential:apply');
    await page.waitForTimeout(200);
    const pc1 = await g(() => window.game.state.inventory.filter((s) => s.id === 'chip_reroll').reduce((a, s) => a + s.qty, 0));
    const pot = await potNow();
    await check('潜在: チップで付与 → 再設定で前後比較 → 採用', potA?.grade && hasApply && pc1 === pc0 - 2 && pot?.grade, `chips ${pc0}→${pc1} 1回目=${JSON.stringify(potA)} 採用後=${JSON.stringify(pot)}`);
    await shot('v3_potential');
    await g(() => window.game.ui.close('potential'));
    // コンテンツ窓（U）: タワー
    await g(() => window.game.debug.setLevel(60));
    await press('KeyU'); await page.waitForTimeout(250);
    await check('コンテンツ窓（U）', await g(() => window.game.ui.isOpen('content')));
    await clickHit('content:tab0');
    await shot('v3_content_tower');
    await clickHit('content:towerGo');
    await page.waitForTimeout(500);
    const tw1 = await g(() => ({ map: window.game.map.id, inst: window.game.map.instance, floor: window.game.towerFloor }));
    await check('タワー入場（1F）', tw1.inst === 'tower' && tw1.floor === 1, JSON.stringify(tw1));
    await waitFor(() => window.game.spawner.inst?.started, 4000);
    await page.waitForTimeout(300);
    await shot('v3_tower_1f');
    await g(() => { window.game.debug.god = true; });
    for (let i = 0; i < 20 && !(await g(() => window.game.spawner.inst?.cleared)); i++) { await g(() => window.game.debug.run('killAll')); await page.waitForTimeout(250); }
    await check('タワー 1F クリア', await g(() => window.game.spawner.inst?.cleared));
    const door = await g(() => { const p = window.game.map.portals.find((q) => q.towerNext && !q.hidden); return p && { x: p.x, y: p.y }; });
    await check('次の階の扉が開く', !!door);
    if (door) {
      await teleport(door.x, door.y); await frames(4);
      await press('ArrowUp'); await page.waitForTimeout(700);
      await check('タワー 2F へ', await g(() => window.game.map.instance === 'tower' && window.game.towerFloor === 2), await g(() => `${window.game.map.id} ${window.game.towerFloor}`));
      await shot('v3_tower_2f');
    }
    await check('タワー最高到達階の記録', await g(() => import('./src/systems/tower.js').then((m) => (m.towerBest(window.game.state).best || 0) >= 1)));
    // アリーナ（1ウェーブ）
    await warp('beach', 400);
    await g(() => { window.game.ui.closeAll(); window.game.ui.open('content'); window.game.ui.wins.content.tab = 1; });
    await page.waitForTimeout(200);
    await clickHit('content:ar:rookie');
    await shot('v3_content_arena');
    await clickHit('content:arenaGo');
    await page.waitForTimeout(500);
    await check('アリーナ入場', await g(() => window.game.map.instance === 'arena'), await g(() => window.game.map.id));
    await waitFor(() => (window.game.arenaWave || 0) >= 1, 5000);
    await shot('v3_arena_wave1');
    for (let i = 0; i < 20 && (await g(() => (window.game.arenaWave || 0) < 2)); i++) { await g(() => window.game.debug.run('killAll')); await page.waitForTimeout(400); }
    await check('アリーナ: WAVE1 クリア → WAVE2', await g(() => (window.game.arenaWave || 0) >= 2), await g(() => `wave=${window.game.arenaWave}`));
    // ボス難易度（ノーマル）: ピア桟橋に到達済みにして解放 → 挑戦
    await warp('beach_f3', 300);
    await warp('beach', 300);
    await g(() => { window.game.ui.closeAll(); window.game.ui.open('content'); window.game.ui.wins.content.tab = 2; });
    await page.waitForTimeout(200);
    await clickHit('content:boss:boss_king_slime');
    await shot('v3_content_boss');
    const goIds = await g(() => window.game.ui.hits.map((h) => h.id).filter((i) => i.startsWith('content:bossGo:')));
    await check('ボス難易度の挑戦ボタン（解放済み）', goIds.length >= 1, goIds.join(','));
    if (goIds.length) {
      await clickHit(goIds.find((i) => i.endsWith('hard')) || goIds[0]);
      await page.waitForTimeout(400);
      await waitFor(() => window.game.spawner.inst?.boss, 5000);
      const bs = await g(() => { const b = window.game.spawner.inst?.boss; return { inst: window.game.map.instance, mode: window.game.spawner.inst?.mode, hp: b?.maxHp || b?.hp, id: b?.defId }; });
      await shot('v3_boss_room');
      await check('ボス部屋に入場（難易度つき）', bs.inst === 'boss' && bs.id === 'boss_king_slime', JSON.stringify(bs));
      await g(() => window.game.debug.run('killAll'));
      await page.waitForTimeout(600);
      await check('ボス撃破で記録', await g(() => !!window.game.spawner.inst?.cleared));
    }
    await warp('beach', 300);
    // 実績（O）
    await g(() => window.game.ui.closeAll());
    await press('KeyO'); await page.waitForTimeout(250);
    await check('実績窓（O）', await g(() => window.game.ui.isOpen('achieve')));
    await check('実績が解除されている', await g(() => import('./src/systems/achievements.js').then((m) => m.achievementSummary(window.game.state).done > 0)));
    await shot('v3_achievements');
    await g(() => window.game.ui.closeAll());
    // ログインボーナス（前日に受け取った扱い → 今日分を受け取る）
    await g(() => import('./src/systems/daily.js').then((m) => { const l = window.game.state.login; l.lastDay = m.dayIndex() - 1; }));
    await g(() => { window.game.ui.open('content'); window.game.ui.wins.content.tab = 3; });
    await page.waitForTimeout(200);
    const lb0 = await g(() => ({ days: window.game.state.login.days, money: window.game.state.money }));
    await shot('v3_login_before');
    await clickHit('content:loginGet');
    const lb1 = await g(() => ({ days: window.game.state.login.days, money: window.game.state.money }));
    await check('ログインボーナス受け取り', lb1.days === lb0.days + 1, `${JSON.stringify(lb0)} → ${JSON.stringify(lb1)}`);
    // プリセット: 保存 → 変更 → 切替で戻る
    await g(() => { window.game.ui.wins.content.tab = 4; });
    await page.waitForTimeout(150);
    const bar0 = await g(() => JSON.stringify(window.game.state.skillBar));
    await clickHit('content:psave0');
    await g(() => { const b = window.game.state.skillBar; b.reverse(); });
    const barX = await g(() => JSON.stringify(window.game.state.skillBar));
    await clickHit('content:psave1');
    await clickHit('content:pload0');
    const bar1 = await g(() => JSON.stringify(window.game.state.skillBar));
    await clickHit('content:pload1');
    const bar2 = await g(() => JSON.stringify(window.game.state.skillBar));
    await shot('v3_presets');
    await check('プリセット: 2つ保存して切替', bar1 === bar0 && bar2 === barX && bar0 !== barX, `${bar0} / ${barX} / ${bar1} / ${bar2}`);
    await clickHit('content:pload0');
    // 共有倉庫: 預ける → 引き出す
    await g(() => { window.game.ui.wins.content.tab = 5; });
    await page.waitForTimeout(150);
    const sh0 = await g(() => import('./src/systems/shared.js').then((m) => ({ st: m.sharedStorage().length, inv: window.game.state.inventory.length })));
    await clickHit('content:inv0');
    const sh1 = await g(() => import('./src/systems/shared.js').then((m) => ({ st: m.sharedStorage().length, inv: window.game.state.inventory.length })));
    await shot('v3_shared_storage');
    await clickHit('content:sto0');
    const sh2 = await g(() => import('./src/systems/shared.js').then((m) => ({ st: m.sharedStorage().length, inv: window.game.state.inventory.length })));
    await check('共有倉庫: 預ける → 引き出す', sh1.st === sh0.st + 1 && sh2.st === sh0.st, `${JSON.stringify(sh0)} → ${JSON.stringify(sh1)} → ${JSON.stringify(sh2)}`);
    await g(() => window.game.ui.closeAll());
    // 設定: エフェクト濃さ 100/50/最小・ダメージ数字まとめ（dmgCompact）
    await g(() => window.game.ui.open('settings'));
    await page.waitForTimeout(150);
    await clickHit('settings:fx2');
    const fxMin = await g(() => window.game.settings.fx);
    await clickHit('settings:fx1');
    const fxHalf = await g(() => window.game.settings.fx);
    await clickHit('settings:dmgCompact');
    const dc = await g(() => ({ dmgCompact: window.game.settings.dmgCompact, saved: JSON.parse(localStorage.getItem('nvs_settings') || '{}').dmgCompact }));
    await shot('v3_settings');
    await check('設定: エフェクト濃さ（最小/50%）・ダメージまとめ（dmgCompact）が保存', fxMin === 0 && fxHalf === 0.5 && dc.dmgCompact === true && dc.saved === true, JSON.stringify({ fxMin, fxHalf, ...dc }));
    // 濃さ最小でスキルの演出が薄くなる
    await g(() => window.game.ui.closeAll());
    await warp('beach_f1', 400);
    await quiet();
    const fxA = await g(async () => {
      const G = window.game, SK = await import('./src/systems/skills.js');
      const out = {};
      for (const v of [1, 0]) {
        G.settings.fx = v; SK.resetCooldowns(); G.state.mp = 9999; G.effects.length = 0;
        SK.useSkill(G, G.state.skillBar.find((s) => s && s !== 'street_dash')); SK.flushSkillHits?.(); // 効果はモーションの当たる瞬間に出るので、待たずに出させる
        out[v] = G.effects.length ? Math.max(...G.effects.map((e) => e.fx ?? 1)) : null;
      }
      G.settings.fx = 1;
      return out;
    });
    await check('エフェクト濃さ最小でエフェクトが弱まる', fxA[0] != null && fxA[1] != null && fxA[0] < fxA[1], JSON.stringify(fxA));
    await g(() => { window.game.settings.dmgCompact = false; window.game.saveSettings(); });
    // 夜限定の敵（昼は出現表にいても出ない）
    const nightCheck = await g(async () => {
      const G = window.game, E = (await import('./src/data/enemies.js')).ENEMIES, W = await import('./src/world/maps.js'), S = await import('./src/entities/spawner.js');
      const mapOf = Object.values(W.MAPS).find((m) => !m.town && !m.instance && S.resolveSpawns(m).some((a) => a.types.some((t) => E[t].night)));
      if (!mapOf) return { none: true };
      G.debug.warp(mapOf.id);
      const count = (night) => {
        G.debug.setClock(night ? 23 : 12);
        let n = 0;
        for (let k = 0; k < 60; k++) for (let i = 0; i < G.spawner.areas.length; i++) { const e = G.spawner.spawnInArea(i); if (e && E[e.defId].night) n++; if (e) e.remove = true; }
        G.enemies = G.enemies.filter((e) => !e.remove);
        return n;
      };
      const day = count(false), night = count(true);
      G.debug.setClock(12);
      return { map: mapOf.id, day, night };
    });
    await check('夜限定の敵: 昼は出ない・夜は出る', nightCheck.day === 0 && nightCheck.night > 0, JSON.stringify(nightCheck));
    // コンボ・PET スキル
    await warp('beach_f2', 400);
    await quiet();
    const combo = await g(async () => {
      const G = window.game, C = await import('./src/systems/combat.js');
      for (let i = 0; i < 6; i++) G.debug.spawnEnemy();
      for (const e of G.enemies) if (!e.dead) C.damageEnemy(G, e, 1, false, 0);
      return (await import('./src/systems/combo.js')).comboInfo(G);
    });
    await check('コンボ: ヒットで加算', combo && combo.count >= 6, JSON.stringify(combo));
    await page.waitForTimeout(200);
    await shot('v3_combo');
    const petSk = await g(async () => {
      const G = window.game; G.debug.givePet();
      const PS = await import('./src/systems/petSkills.js');
      const st = PS.petStats(G.state);
      G.state.hp = 1; G.player._invulnUntil = 0;
      if (G._petAuto) G._petAuto.cdHp = 0;
      await new Promise((r) => setTimeout(r, 1500));
      return { skills: st?.skills, range: st?.pickRange, petRange: G.pet?.pickRange, hp: G.state.hp };
    });
    await check('PET: 取得範囲は petStats を使う・自動HPポーション', petSk.range === petSk.petRange && (!(petSk.skills || []).includes('autoHp') || petSk.hp > 1), JSON.stringify(petSk));
    // 手配度は廃止: 旧 API で★4 にしようとしても手配度・BGM の緊迫度は 0 のまま、警察も来ない
    await warp('downtown', 300);
    await g(() => import('./src/systems/combat.js').then((c) => c.setWantedLevel(window.game, 4)));
    await page.waitForTimeout(1200);
    const tension = await g(() => import('./src/audio/audio.js').then((m) => m.audio.stats().tension));
    const wanted4 = await g(() => window.game.wanted);
    await check('手配度は上がらず BGM も緊迫しない（警察なし）', !tension && wanted4 === 0 && !(await g(() => window.game.enemies.some((e) => e.fromWanted || e.def?.isCop))), `tension=${tension} wanted=${wanted4}`);
    await g(() => { window.game.debug.god = false; });
  }

  // ===================================================== 旧セーブ v2 / v3 形式（スロット）から起動
  if (want('oldsaves')) {
    console.log('--- OLD SAVES v2/v3');
    const V1b = { heroId: 'jin', level: 12, exp: 50, money: 999, hp: 100, mp: 20, inventory: [{ id: 'potion_red', qty: 5 }, { id: 'katana_steel', qty: 2 }, { id: 'bogus_item', qty: 1 }], equipped: { hat: null, top: 'leather_jacket', bottom: 'jeans_blue', shoes: 'boots_black', accessory: null, weapon: 'bat_wood' }, skills: {}, skillBar: [], missions: { active: [], completed: ['m01_welcome'] }, mapId: 'downtown' };
    const V2 = { ...JSON.parse(JSON.stringify(V1b)), version: 2, visited: ['beach', 'downtown'], book: { slime_green: 12 }, sns: { followers: 50, posts: [] }, clock: 21 };
    const V3 = { ...JSON.parse(JSON.stringify(V2)), version: 3, heroId: 'hacker', gender: 'm', name: 'ネオ', level: 31, job: { id: 'hk_netrunner', tier: 1, history: ['beginner'] }, spByTier: { 2: 0, 3: 0, 4: 0 }, equipped: { ...V2.equipped, weapon: 'staff_glitch', pet: 'pet_cat' }, inventory: [...V2.inventory, { id: 'pet_slime', qty: 1 }], mapId: 'tower' };
    await page.goto(URL, { waitUntil: 'load' });
    await g(([a, b, c]) => { localStorage.clear(); localStorage.setItem('nvs_save', JSON.stringify(a)); localStorage.setItem('nvs_slot_1', JSON.stringify(b)); localStorage.setItem('nvs_slot_2', JSON.stringify(c)); }, [V1_SAVE, V2, V3]);
    await gotoTitle(false);
    await press('Enter'); await frames(3);
    const sl = await slotsInfo();
    await check('旧セーブ: v1(単一キー)→スロット0、v2/v3 はスロット1/2 に表示', sl[0]?.heroId === 'jin' && sl[1]?.heroId === 'jin' && sl[2]?.heroId === 'hacker' && sl[2]?.name === 'ネオ', JSON.stringify(sl.map((s) => s && `${s.heroId}:${s.name}:${s.level}`)));
    await shot('oldsave_select');
    for (const [slot, want, label] of [[1, { hero: 'jin', lv: 12, map: 'downtown' }, 'v2'], [2, { hero: 'hacker', lv: 31, map: 'beach' }, 'v3']]) {
      const s = await titleState();
      if (s.screen !== 'select') { await gotoTitle(false); await press('Enter'); await frames(3); }
      for (let i = 0; i < 8 && (await titleState()).sel !== slot; i++) await press('ArrowRight');
      await press('Enter');
      const ok = await waitFor(() => window.game.scene === 'play' && !!window.game.player, 5000);
      await page.waitForTimeout(500);
      const st = await g(() => { const s = window.game.state; return { hero: s.heroId, lv: s.level, map: window.game.map.id, version: s.version, job: s.job?.id, pet: s.equipped.pet, hasPet: !!window.game.pet, inv: s.inventory.map((x) => x.id), bar: s.skillBar.length, uids: s.inventory.filter((x) => x.uid).length }; });
      const mapOk = label === 'v3' ? !(await g(() => !!window.game.map.instance)) : st.map === want.map;
      await check(`旧${label}セーブから起動（v4 に移行・装備インスタンス化・スキルバー8枠）`, ok && st.hero === want.hero && st.lv === want.lv && mapOk && st.version === 4 && st.bar === 8 && !st.inv.includes('bogus_item') && st.uids > 0, JSON.stringify(st));
      if (label === 'v3') {
        await check('旧v3セーブ: 職と PET が復元・タワーで中断していたら町から再開', st.job === 'hk_netrunner' && st.pet === 'pet_cat' && st.hasPet && mapOk, JSON.stringify(st));
        await check('旧v3セーブ（Lv31・1次）で2次転職の吹き出し', await waitFor(() => window.game.ui.hits.some((h) => h.id === 'hud:jobBubble'), 3000));
      }
      await shot(`oldsave_${label}_play`);
      for (const k of ['KeyI', 'KeyK', 'KeyJ', 'KeyU', 'KeyO']) { await press(k); await page.waitForTimeout(200); await press('Escape'); }
      await hold('ArrowRight', 300); await hold('KeyX', 200);
      await lastError(`old ${label} play`);
      await backToSelect();
    }
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
// 収集はそのマップの敵のドロップを拾う / reach / talk は報告NPCに話しかける。旧 wanted / drive は廃止）
// → 報告NPC が報告マップにいる → 報告。Lv はデバッグで reqLevel まで上げる。
async function runMission(arg) {
  // arg: missionId | {id, skipAccept（UI で受注済み）, stopBeforeReport（報告NPCの前で止める＝UIで報告する）}
  const opt = typeof arg === 'string' ? { id: arg } : arg;
  const id = opt.id;
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
  if ((G.state.level || 1) < (m.reqLevel || 1)) G.debug.setLevel(m.reqLevel || 1);
  G.debug.run('hpFull');
  // 依頼
  if (!opt.skipAccept) {
    await go(npcMap(m.giver));
    if (!npcHere(m.giver)) return res(false, `依頼NPC ${m.giver} が ${G.map.id} にいない`);
    if (!G.missions.available(m.giver).some((x) => x.id === id)) return res(false, `${m.giver} が ${id} を提示しない (canAccept=${G.missions.canAccept(id)})`);
    if (!(await talk(m.giver))) return res(false, `${m.giver} と会話できない`);
    if (!G.missions.accept(id)) return res(false, 'accept 失敗');
  } else if (!G.state.missions.active.includes(id)) return res(false, `${id} が受注されていない`);
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
    } else if (o.type === 'kill' || o.type === 'boss' || o.type === 'collect') {
      // 対象の決定: kill/boss → 敵ID、collect → その item を落とす敵
      const sources = o.type === 'collect'
        ? Object.values(E).filter((e) => !e.isCop && (e.drops || []).some((d) => d.id === o.target)).map((e) => e.id) // 警察ユニット（廃止）は出ない
        : [o.target];
      if (sources.some((s) => E[s]?.isCop)) return res(false, `${o.type}:${o.target} は廃止した警察ユニットが対象`);
      let mapId = o.mapId;
      if (!mapId) mapId = Object.values(W.MAPS).find((mp) => !mp.town && sources.some((s) => (E[s].habitats || []).includes(mp.id)))?.id;
      if (!mapId) return res(false, `${o.type}:${o.target} の出現マップがない`);
      await go(mapId);
      const areaIdx = G.spawner.areas.map((a, k) => (a.types.some((t) => sources.includes(t)) ? k : -1)).filter((k) => k >= 0);
      if (!areaIdx.length) return res(false, `${o.target} の対象 (${sources.join('/')}) が ${mapId} の出現表にない: ${G.spawner.areas.map((a) => a.types.join('/')).join(' | ')}`);
      const killed = new Set();
      let spawned = 0;
      for (let k = 0; k < 1500 && val(i) < o.count; k++) {
        freeInv();
        for (const a of areaIdx) {
          const alive = G.enemies.filter((e) => e.spawnIdx === a && !e.dead && !e.remove).length;
          if (alive < (G.spawner.areas[a].max || 3)) { if (G.spawner.spawnInArea(a)) spawned++; }
        }
        // 対象を倒す（対象外は枠を空けるため消す）
        for (const e of G.enemies) {
          if (e.dead || e.remove) continue;
          if (sources.includes(e.defId)) { killed.add(e.defId); C.damageEnemy(G, e, e.hp + 1, false, 0); }
          else if (e.spawnIdx != null && areaIdx.includes(e.spawnIdx)) e.remove = true;
        }
        await wait(1);
        // 対象アイテムのドロップを拾う
        if (o.type === 'collect') for (const d of G.drops) if (d.id === o.target && !d.dead) { d.t = Math.max(d.t, d.pickDelay); d.pickup(); }
      }
      if (val(i) < o.count) return res(false, `${o.type}:${o.target} が ${mapId} で ${val(i)}/${o.count}（spawned ${spawned}, killed ${[...killed].join('/')}）`);
      notes.push(`${o.type}:${o.target} @${mapId} OK (倒した種類 ${[...killed].join('/')})`);
    } else return res(false, `未対応の目的 ${o.type}`);
  }
  // 報告
  await go(npcMap(turnNpc));
  if (!npcHere(turnNpc)) return res(false, `報告NPC ${turnNpc} が ${G.map.id} にいない`);
  if (opt.stopBeforeReport) {
    if (!G.missions.completable(turnNpc).some((x) => x.id === id)) return res(false, `報告不可: ${JSON.stringify(G.missions.objectiveValues(id))}`);
    const r = res(true); r.turnNpc = turnNpc; r.pending = true; return r;
  }
  await talk(turnNpc);
  if (!G.missions.completable(turnNpc).some((x) => x.id === id)) return res(false, `報告不可: ${JSON.stringify(G.missions.objectiveValues(id))}`);
  if (!G.missions.turnIn(id)) return res(false, 'turnIn 失敗');
  return res(true);
}

main().catch((e) => { console.error(e); process.exit(2); });
