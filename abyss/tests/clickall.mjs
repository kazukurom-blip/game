// すべての窓のすべてのボタン（押せる物）を 1 回ずつ押す確かめ（Playwright + Chromium）。統合担当。
// 終盤のセーブ（Lv100・パラゴン・転生・苦行・裂け目・ペット・宝石・刻印・極意・図鑑）を作ってから、窓ごとに
// ボタン・タブ・マス・チェック・選択を順に押し（開いた確認の窓は最初の操作を押してから閉じる）、console のエラー・ページのエラーが 0 件かを見る。
// マウスを乗せる（ツールチップ）、スマホの幅（390px）でも窓を開く。最後に「枠の一覧に無い絵の ID」が使われていないかも見る。
// 実行: PORT=8213 node tests/clickall.mjs [--only=hero,bag] [--max=140]（窓ごとに押す数の上限）。CK_DEBUG=1 で窓ごとの内訳
// 最後に ×4 速・召喚物 30・敵 50 の 1 フレームの重さ（ゲームの進み + 描画が 16ms 未満）も見る。
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8193;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const ONLY = arg('only').split(',').filter(Boolean);
const MAX = Number(arg('max')) || 140;

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
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

// 押さない物（遊びの外へ出る・ファイルを選ぶ・セーブを消す）
const SKIP_TEXT = /タイトル|削除|消す|初期化|すべてリセット|ファイル|フォルダ|読み込む|取りこむ|取り込む|書き出す|ダウンロード|コピー/;

/** ページの中で: 終盤のセーブを作る */
async function populate(page) {
  return page.evaluate(async () => {
    const g = window.__game;
    const { generateItem } = await import('./src/game/loot.js');
    const { RNG } = await import('./src/engine/rng.js');
    const { ZONES, STAGES_PER_ZONE } = await import('./src/data/world.js');
    const { MATERIALS } = await import('./src/data/materials.js');
    const { SUPPORTS } = await import('./src/data/supports.js');
    const { GEMS, RUNES } = await import('./src/data/gems.js');
    const { PETS } = await import('./src/data/pets.js');
    const { ALTAR } = await import('./src/data/prestige.js');
    g.newGame('necromancer', '終盤の試し');
    const st = g.state; const h = st.hero;
    h.level = 100; h.paragon.level = 120; h.skillPoints = 20; h.tree.points = 40;
    g.sys.skills.learnUnlocked(true);
    for (const id of Object.keys(h.skills)) h.skills[id].lvl = 15;
    const rng = new RNG(7);
    for (const slot of ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'amulet', 'ring1', 'ring2']) {
      const it = generateItem(rng, { ilvl: 100, minRarity: slot === 'weapon' ? 'mythic' : slot.startsWith('ring') ? 'set' : 'legendary', slot: slot.replace(/\d$/, ''), cls: 'necromancer' });
      if (it) { it.sockets = it.sockets || [null]; h.equip[slot] = it; }
    }
    const rar = ['common', 'magic', 'rare', 'epic', 'legendary', 'set', 'unique', 'mythic'];
    for (let i = 0; i < 40; i++) { const it = generateItem(rng, { ilvl: 60 + i, minRarity: rar[i % rar.length], cls: 'necromancer' }); if (it) { if (i % 5 === 0) it.q = 1; if (i % 11 === 0) it.q = 2; st.inv.bag.push(it); } }
    for (let i = 0; i < 12; i++) { const it = generateItem(rng, { ilvl: 80, minRarity: 'rare' }); if (it) st.inv.stash[0].push(it); }
    for (const m of MATERIALS) st.inv.mats[m.id] = 5000;
    st.meta.gold = 1e10;
    for (const gm of GEMS) for (let t = 1; t <= 6; t++) st.inv.gems[`${gm.id}_${t}`] = 4;
    for (const r of RUNES) st.inv.runes[r.id] = 3;
    for (let i = 0; i < 4; i++) g.sys.gems.grantLegendaryGem();
    for (const s of SUPPORTS.slice(0, 10)) g.sys.skills.addGlyph(g.sys.skills.makeGlyph({ id: s.id, level: 12 }), { quiet: true });
    // 物語クリア・苦行・裂け目・門番
    const w = st.world;
    w.maxZone = ZONES.length - 1; w.maxTorment = 4;
    for (const z of ZONES) { w.cleared[z.id] = true; w.maxStage[z.id] = STAGES_PER_ZONE; }
    w.rift.unlocked = 25; w.rift.best = 24;
    for (let k = 0; k < 4; k++) w.gate.frags[`g1_${k}`] = 2;
    // 転生・祭壇
    st.meta.prestige.unlocked = true; st.meta.rebirths = 3; st.meta.souls = 800; st.meta.totalSouls = 1500;
    for (const u of ALTAR.slice(0, 20)) g.sys.prestige.buy(u.id, 3);
    g.sys.prestige.applyUnlocks();
    // ペット
    for (const p of PETS.slice(0, 6)) st.meta.pets.owned[p.id] = { lvl: 10, xp: 0, stars: 1, at: Date.now() };
    st.meta.pets.active = PETS[0].id;
    g.sys.pets.addEgg('egg_ash', 3); g.sys.pets.addEgg('egg_ember', 2);
    // 極意: レジェンダリーを 2 つ抽出
    for (const it of st.inv.bag.filter((x) => x.power).slice(0, 2)) g.sys.codex.extract(it.uid);
    g.onGearChanged();
    for (let i = 0; i < 20 * 20; i++) g.tick(0.05);
    g.sys.achievements.check({ slow: true });
    window.__ui.renderPanel();
    return { bag: st.inv.bag.length, lvl: h.level, ach: Object.keys(st.meta.achievements).length };
  });
}

/** ページの中で: 窓を開き、押せる物の一覧（名前つき）を返す */
async function listClickables(page, id) {
  return page.evaluate((pid) => {
    window.__ui.openPanel(pid);
    const root = document.getElementById('panelbody');
    const els = [...root.querySelectorAll('*')].filter((e) => e.onclick || e.__ck || e.matches('button, input, select, .tab, a[href]'));
    const seen = {};
    return els.map((e) => {
      const text = (e.textContent || e.value || e.title || '').trim().replace(/[0-9０-９.,%▲▼+\-/×]+/g, '').replace(/\s+/g, ' ').slice(0, 20);
      const base = `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ''}.${[...e.classList].slice(0, 2).join('.')}|${text}`;
      seen[base] = (seen[base] || 0) + 1;
      return `${base}#${seen[base]}`;
    });
  }, id);
}

/** ページの中で: 名前の物を探して押す（開いた確認の窓は最初の操作を押してから閉じる） */
async function clickOne(page, id, sig, skipRe) {
  return page.evaluate(async ([pid, s, skip]) => {
    const ui = window.__ui;
    if (ui.current?.id !== pid) ui.openPanel(pid);
    const root = document.getElementById('panelbody');
    let seen = {};
    const find = () => {
      const els = [...root.querySelectorAll('*')].filter((e) => e.onclick || e.__ck || e.matches('button, input, select, .tab, a[href]'));
      seen = {};
      for (const e of els) {
        const text = (e.textContent || e.value || e.title || '').trim().replace(/[0-9０-９.,%▲▼+\-/×]+/g, '').replace(/\s+/g, ' ').slice(0, 20);
        const base = `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ''}.${[...e.classList].slice(0, 2).join('.')}|${text}`;
        seen[base] = (seen[base] || 0) + 1;
        if (`${base}#${seen[base]}` === s) return e;
      }
      return null;
    };
    let el = find();
    // 別のタブの中にある物: タブを順に押して探す
    if (!el) {
      const tabs = [...root.querySelectorAll('.tab')].length;
      for (let i = 0; i < tabs && !el; i++) { const tb = root.querySelectorAll('.tab')[i]; if (!tb || tb.classList.contains('on')) continue; tb.click(); await new Promise((r) => setTimeout(r, 5)); el = find(); }
    }
    if (!el) return `gone||${Object.keys(seen).slice(0, 4).join(' ; ')}`;
    const label = (el.textContent || el.value || '').trim();
    if (new RegExp(skip).test(label) || el.type === 'file' || (el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('href').startsWith('#'))) return 'skip';
    if (el.disabled) return 'disabled';
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    if (el.tagName === 'SELECT') {
      const opts = [...el.options]; if (opts.length > 1) { el.value = opts[(el.selectedIndex + 1) % opts.length].value; el.dispatchEvent(new Event('change', { bubbles: true })); }
    } else if (el.tagName === 'INPUT' && (el.type === 'range' || el.type === 'number')) {
      el.value = String(Number(el.max || 1) * 0.5 || 1); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || el.type === '')) {
      el.value = 'テスト'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    } else el.click();
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    await new Promise((r) => setTimeout(r, 15));
    // 開いた窓: 本文・下の最初の操作を 1 つ押してから全部閉じる
    for (let k = 0; k < 3; k++) {
      const wrap = [...document.querySelectorAll('#modals .modal-wrap')].pop();
      if (!wrap) break;
      if (k === 0) {
        const act = [...wrap.querySelectorAll('.modal-body button, .modal-foot button')].find((b) => !b.disabled && !/閉じる|やめる|いいえ|キャンセル/.test(b.textContent) && !new RegExp(skip).test(b.textContent));
        if (act) { act.click(); await new Promise((r) => setTimeout(r, 15)); }
      }
      for (const x of document.querySelectorAll('#modals .modal-x')) x.click();
      document.querySelectorAll('#modals .modal-wrap').forEach((m) => m.remove());
    }
    if (ui.current?.id !== pid) ui.openPanel(pid);
    return 'ok';
  }, [id, sig, skipRe]);
}

const main = async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  let where = 'start';
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${where}] console: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[${where}] pageerror: ${e.message}`));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('fonts.g')) errors.push(`[${where}] http ${r.status()}: ${r.url()}`); });
  // 押せる物を見つけるため、click / change / input を聞いている要素に印をつける（dom.js の h は addEventListener を使う）
  await page.addInitScript(() => {
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, o) {
      if ((type === 'click' || type === 'change' || type === 'input' || type === 'pointerdown' || type === 'mousedown') && this instanceof Element) this.__ck = true;
      return orig.call(this, type, fn, o);
    };
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('#title', { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title');
  await page.click('.slot.empty .btn');
  await page.waitForSelector('.classcards');
  await page.click('.classcard:nth-child(4)');
  await page.click('.title-box .btn-primary');
  await page.waitForSelector('#scene');
  where = 'populate';
  const info = await populate(page);
  console.log('終盤のセーブ', JSON.stringify(info));
  const panels = await page.evaluate(async () => (await import('./src/ui/panels/index.js')).PANELS.map((p) => p.id));
  let clicks = 0; const per = {}; const stat = {};
  for (const id of panels) {
    if (ONLY.length && !ONLY.includes(id)) continue;
    where = `${id}:open`;
    const sigs = await listClickables(page, id);
    const done = new Set();
    let n = 0;
    for (const sig of sigs) {
      if (n >= MAX) break;
      if (done.has(sig)) continue;
      done.add(sig);
      where = `${id}:${sig}`;
      const before = errors.length;
      const rr = await clickOne(page, id, sig, SKIP_TEXT.source); const r = rr.split('||')[0];
      if (process.env.CK_DEBUG && r === 'gone' && stat.gone < 3) console.log('gone', sig, '→', rr.split('||')[1]);
      if (r === 'ok') { n++; clicks++; }
      stat[r] = (stat[r] || 0) + 1;
      if (errors.length > before) console.log(`✘ ${where}\n   ${errors.slice(before).join('\n   ')}`);
      // 押したあとに増えた物（開いた詳細・次の段）も少し押す
      if (r === 'ok') for (const s2 of await listClickables(page, id)) if (!done.has(s2) && !sigs.includes(s2)) sigs.push(s2);
    }
    per[id] = n;
    if (process.env.CK_DEBUG) console.log(id, sigs.length, JSON.stringify(stat), sigs.slice(0, 12).join(' ; '));
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(SHOTS, `clickall_${id}.png`) });
  }
  // スマホの幅で全部の窓を開く
  where = 'mobile';
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of panels) { where = `mobile:${id}`; await page.evaluate((pid) => window.__ui.openPanel(pid), id); await page.waitForTimeout(60); }
  await page.setViewportSize({ width: 1600, height: 900 });
  // 戦闘を少し回す（押したあとの状態で）
  where = 'play';
  const err = await page.evaluate(async () => { const g = window.__game; for (let i = 0; i < 20 * 30; i++) g.tick(0.05); await new Promise((r) => setTimeout(r, 600)); return String(window.__lastError || ''); });
  if (err) errors.push(`[play] loop: ${err}`);
  // 重さ: 召喚物 30・敵 50 を ×4 速で（1 フレームのゲームの進み + 描画）
  where = 'perf';
  const perf = await page.evaluate(async () => {
    const g = window.__game; const ui = window.__ui; const sc = ui.scene; const c = g.combat; const h = c.hero;
    c.H.life *= 1e4; c.recalc();
    const p = c.params('n_skeleton') || c.params(g.state.hero.bar.find(Boolean));
    for (let i = 0; i < 30; i++) c.spawnMinion('skeleton', p, { x: h.x + (i % 10) * 20 });
    for (let i = 0; i < 50; i++) c.spawnMonster(['rot_zombie', 'ash_wolf', 'cultist', 'bog_slime'][i % 4], { level: 90, lifeMul: 1e4, x: h.x + 120 + (i % 20) * 30, y: (i % 7) * 10 - 30 });
    const ou = g.update.bind(g); const of = sc.frame.bind(sc);
    let tu = 0; let tf = 0; let n = 0; let worst = 0;
    g.update = (dt) => { const t0 = performance.now(); ou(dt); const d = performance.now() - t0; tu += d; if (d > worst) worst = d; };
    sc.frame = (dt) => { const t0 = performance.now(); of(dt); tf += performance.now() - t0; n++; };
    g.state.settings.speed = 4;
    await new Promise((r) => setTimeout(r, 3000));
    g.update = ou; sc.frame = of; g.state.settings.speed = 1;
    return { update: tu / Math.max(1, n), frame: tf / Math.max(1, n), worst, n, units: c.units.length };
  });
  const perfOk = perf.update + perf.frame < 16;
  console.log(`${perfOk ? '✔' : '✘'} ×4 速・召喚物 30・敵 50: 1 フレーム ゲーム ${perf.update.toFixed(2)}ms + 描画 ${perf.frame.toFixed(2)}ms（いちばん重いゲームの進み ${perf.worst.toFixed(1)}ms・${perf.n} フレーム・${perf.units} 体）`);
  // 枠の一覧に無い絵の ID
  const unknown = await page.evaluate(async () => { const { assets } = await import('./src/render/assets.js'); return [...assets.seen.keys()]; });
  console.log(`押した数 ${clicks}（${Object.entries(per).map(([k, v]) => `${k} ${v}`).join('・')}）`);
  const okErr = errors.length === 0; const okIds = unknown.length === 0;
  console.log(`${okErr ? '✔' : '✘'} console のエラー・ページのエラー ${errors.length} 件${okErr ? '' : `\n   ${errors.slice(0, 12).join('\n   ')}`}`);
  console.log(`${okIds ? '✔' : '✘'} 枠の一覧に無い絵の ID ${unknown.length} 個${okIds ? '' : `: ${unknown.slice(0, 20).join(', ')}`}`);
  await browser.close();
  srv.close();
  process.exit(okErr && okIds && perfOk && (ONLY.length || clicks > 200) ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
