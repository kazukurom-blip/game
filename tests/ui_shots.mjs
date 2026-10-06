// UI の見た目確認用スクショ（能力画面のダメージ幅・右上のバフ/召喚獣・売却画面・持ち物の比較）
// 実行: node tests/ui_shots.mjs   (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)  → tests/screenshots/ui_*.png
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8591; // 他のテストと被らないポート
const URL = `http://127.0.0.1:${PORT}/index.html`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  for (const r of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean).flatMap((p) => p.split(':'))) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}
function ping() { return new Promise((r) => { http.get(URL, (res) => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)); }); }
async function startServer() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  return { close: () => srv.close() };
}
void spawn;

const problems = [];
const { chromium } = await loadPlaywright();
fs.mkdirSync(SHOTS, { recursive: true });
const server = await startServer();
if (!(await ping())) throw new Error('server');
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|favicon|ERR_/.test(m.text())) problems.push('console ' + m.text()); });
const g = (fn, arg) => page.evaluate(fn, arg);
const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const move = async (x, y) => { const b = await page.locator('#game').boundingBox(); await page.mouse.move(b.x + x * b.width / 1280, b.y + y * b.height / 720); await frames(4); };
const click = async (x, y) => { const b = await page.locator('#game').boundingBox(); await page.mouse.click(b.x + x * b.width / 1280, b.y + y * b.height / 720); await frames(4); };
const hitRect = (id) => g((id) => window.game.ui.hits.find((h) => h.id === id)?.r || null, id);
const clickHit = async (id) => { const r = await hitRect(id); if (!r) { problems.push('hit なし ' + id); return false; } await click(r.x + r.w / 2, r.y + r.h / 2); return true; };
const shot = async (name) => { const f = path.join(SHOTS, `ui_${name}.png`); await page.screenshot({ path: f }); console.log('  shot', f); return f; };

await page.goto(URL);
await page.waitForFunction(() => window.game && window.game.scene, null, { timeout: 15000 });
await g(() => { window.game._titleQuick = { slot: 0, create: { classId: 'jin', name: 'テスト', gender: 'm' } }; });
await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 10000 });
await sleep(400);
// 準備: Lv30・AP・お金・いくつかの武器（★・潜在つき含む）と消耗品
await g(async () => {
  const G = window.game, st = G.state;
  const { ITEMS } = await import('./src/data/items.js');
  const inv = await import('./src/systems/inventory.js');
  st.level = 30; st.ap = 12; st.money = 123456;
  const ws = Object.values(ITEMS).filter((it) => it.slot === 'weapon' && it.weaponType === 'melee' && (it.reqLevel || 0) <= 30).sort((a, b) => (b.stats?.atk || 0) - (a.stats?.atk || 0));
  for (const it of ws.slice(0, 4)) inv.addItem(G, it.id, 1, { silent: true });
  const hat = Object.values(ITEMS).find((it) => it.slot === 'hat' && (it.reqLevel || 0) <= 30);
  if (hat) inv.addItem(G, hat.id, 1, { silent: true });
  inv.addItem(G, 'potion_red', 37, { silent: true });
  inv.addItem(G, 'drink_energy', 3, { silent: true });
  // 1本目に★と潜在
  const e = st.inventory.find((s) => s && s.id === ws[0].id);
  if (e) { e.star = 7; e.pot = { grade: 'epic', lines: [{ stat: 'atkPct', value: 0.06 }] }; }
  G.enemies.length = 0;
});
await frames(6);

// 1) 能力画面
await g(() => { window.game.ui.closeAll(); window.game.ui.open('stats'); });
await frames(10);
await shot('stats');
// ＋ボタンに乗せる → 予告。押す → 差分
const ap = await hitRect('stats:ap:str');
if (ap) { await move(ap.x + ap.w / 2, ap.y + ap.h / 2); await shot('stats_hover_plus'); await click(ap.x + ap.w / 2, ap.y + ap.h / 2); await click(ap.x + ap.w / 2, ap.y + ap.h / 2); await move(20, 700); await shot('stats_after_ap'); }
const statInfo = await g(async () => {
  const D = await import('./src/ui/deps.js');
  const cs = D.computeStatsRaw(window.game.state);
  return { atk: cs.atk, critDmg: cs.critDmg, r: D.dmgRange(cs) };
});
console.log('  stats', JSON.stringify(statInfo));

// 2) 持ち物の比較
await g(() => { window.game.ui.closeAll(); window.game.ui.open('inventory'); });
await frames(8);
const it0 = await hitRect('inventory:it:0');
if (it0) { await move(it0.x + it0.w / 2, it0.y + it0.h / 2); await frames(4); await shot('inventory_compare'); }
const it1 = await hitRect('inventory:it:2');
if (it1) { await move(it1.x + it1.w / 2, it1.y + it1.h / 2); await frames(4); await shot('inventory_compare2'); }
await move(20, 700);

// 3) バフ中の右上
await g(async () => {
  const P = await import('./src/systems/progression.js');
  const { SKILLS } = await import('./src/data/skills.js');
  const G = window.game; G.ui.closeAll();
  const bs = Object.values(SKILLS).filter((s) => s.kind === 'buff').slice(0, 2);
  for (const s of bs) P.addBuff(G, { id: s.id, name: s.name, color: s.color, duration: 90, ...s.buff(5) });
  P.addBuff(G, { id: 'drink_energy', name: 'エナジー', duration: 120, atkPct: 0.15, speedPct: 0.1, color: '#19f0ff' });
  P.addBuff(G, { id: 'drink_lucky', name: 'ラッキー', duration: 4.5, luckAdd: 100, critAdd: 0.05, color: '#ff3dd2' });
  G.state.money += 500; // お金のトーストも確認
});
await frames(20);
await shot('hud_buffs');
const bx = 1280 - 14 - 17;
await move(bx, 12 + 17); await frames(4);
await shot('hud_buffs_hover');

// 4) 召喚獣ありの右上
await g(async () => {
  const { SKILLS } = await import('./src/data/skills.js');
  const sk = Object.values(SKILLS).filter((s) => s.kind !== 'passive' && s.kind !== 'buff').slice(0, 2);
  window.game.summons = [
    { id: 1, skillId: sk[0]?.id, name: 'ネオン・ドラゴン', color: '#ff5fa2', left: 42, dur: 60 },
    { id: 2, skillId: sk[1]?.id, name: 'ジャンク・ゴーレム', color: '#ffd447', left: 3.2, dur: 30 },
  ];
});
await frames(10);
await shot('hud_summons');
const n = await g(async () => (await import('./src/ui/hud.js')).buffBarItems(window.game).length);
const sx = 1280 - 14 - 34 - (n - 1) * 39 + 17;
await move(sx, 29); await frames(4);
await shot('hud_summons_hover');
await move(640, 400);
await g(() => { window.game.summons = []; });
await frames(4);
const n2 = await g(async () => (await import('./src/ui/hud.js')).buffBarItems(window.game).filter((e) => e.kind === 'summon').length);
if (n2 !== 0) problems.push('summons=[] なのに召喚獣が出る');
await g(() => { delete window.game.summons; });
await frames(4);

// 5) 売却画面
await g(() => {
  const G = window.game; G.ui.closeAll();
  G.ui.open('shop', { npc: { name: 'テスト商店', shop: ['potion_red', 'potion_blue'] } });
});
await frames(8);
await clickHit('shop:tab1');
await frames(4);
await shot('shop_sell_empty');
await clickHit('shop:sell:7');
await shot('shop_sell_equip');
const s1 = await hitRect('shop:sell:7');
if (s1) { await move(s1.x + s1.w / 2, s1.y + s1.h / 2); await shot('shop_sell_tip'); await move(640, 700); }
await clickHit('shop:sell:0');
await shot('shop_sell_equipped');
await clickHit('shop:cat1');
await clickHit('shop:sell:0');
await clickHit('shop:q+'); await clickHit('shop:q+');
await shot('shop_sell_stack');
const before = await g(() => ({ m: window.game.state.money, n: window.game.state.inventory.filter((s) => s && s.id === 'potion_red').reduce((a, s) => a + s.qty, 0) }));
await clickHit('shop:deal');
const after = await g(() => ({ m: window.game.state.money, n: window.game.state.inventory.filter((s) => s && s.id === 'potion_red').reduce((a, s) => a + s.qty, 0) }));
console.log('  sell', JSON.stringify({ before, after }));
if (after.n !== before.n - 3 || !(after.m > before.m)) problems.push('まとめ売りが効かない ' + JSON.stringify({ before, after }));
// 装備（★つき）を売る → その1本が消える
await clickHit('shop:cat0');
const eqBefore = await g(() => window.game.state.inventory.filter((s) => s && s.star === 7).length);
// ★7 のマスを探して選ぶ
const k7 = await g(() => {
  const st = window.game.state; let k = 0;
  for (const slot of ['weapon', 'hat', 'top', 'bottom', 'shoes', 'accessory', 'pet']) if (st.equipped?.[slot]) k++;
  const inv = st.inventory.filter((s) => s && s.uid); // 装備タブ（簡易）
  const i = inv.findIndex((s) => s.star === 7);
  return i < 0 ? -1 : k + i;
});
if (k7 >= 0) {
  await clickHit('shop:sell:' + k7);
  await shot('shop_sell_star');
  await clickHit('shop:deal');
  const eqAfter = await g(() => window.game.state.inventory.filter((s) => s && s.star === 7).length);
  if (eqAfter !== eqBefore - 1) problems.push('★つき装備の売却で別の個体が消えた');
}
await shot('shop_sell_after');

console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'OK (問題なし)');
await browser.close();
server.close();
process.exit(problems.length ? 1 : 0);
