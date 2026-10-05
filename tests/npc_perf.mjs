// 性能計測（npm test には含めない）: 町に NPC・市民・人型の敵をたくさん並べて、1フレームの処理時間を測る。
// 実行: node tests/npc_perf.mjs [--map=downtown] [--frames=600] [--civ=30] [--noNpcRig]（rig.npcs=false にして比べる）
//  - 画面内に NPC（町の全員を寄せる）・市民 --civ 人・チンピラ/警官/SWAT/ドン を置き、game.debug.profile で部位別の時間を集計
//  - --warm=<ms>（既定 1500）: 並べてから計測までの待ち（絵の読み込み・前処理が終わるまで）
//  - 敵は動かない（update を止める）。市民・NPC は歩く/待機のアニメのまま
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8159;
const URL = `http://127.0.0.1:${PORT}/index.html`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = process.argv.slice(2);
const opt = (k, d) => { const a = arg.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const MAP = opt('map', 'downtown');
const N = Number(opt('frames', 600));
const CIV = Number(opt('civ', 30));
const NO_NPC_RIG = arg.includes('--noNpcRig');
const SHOT = opt('shot', '');
const WARM = Number(opt('warm', 1500));

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  for (const r of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}
function ping() { return new Promise((r) => { http.get(URL, (res) => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)); }); }
async function startServer() {
  const bin = ['/opt/node22/bin/http-server', path.join(ROOT, 'node_modules/.bin/http-server')].find((p) => fs.existsSync(p));
  if (!bin) throw new Error('http-server が見つかりません');
  const proc = spawn(bin, [ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { await sleep(100); if (await ping()) return proc; }
  proc.kill(); throw new Error('server start failed');
}

const server = await startServer();
let browser;
try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  if (NO_NPC_RIG) {
    await page.route('**/assets/sprites/manifest.json', async (route) => {
      const res = await route.fetch(); const j = await res.json();
      if (j.rig) j.rig.npcs = false;
      await route.fulfill({ response: res, json: j });
    });
  }
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.game && window.game.scene === 'title');
  await page.evaluate(() => { window.game._titleQuick = { slot: 0, create: { classId: 'luna', name: 'Perf', gender: 'f' } }; });
  await page.waitForFunction(() => window.game.scene === 'play');
  await page.evaluate(async ([map, civ]) => {
    const G = window.game;
    const { Enemy } = await import('./src/entities/enemy.js');
    const { NPC } = await import('./src/entities/npc.js');
    const { MAPS } = await import('./src/world/maps.js');
    G.debug.god = true; G.debug.warp(map); G.ui.closeAll();
    await new Promise((r) => setTimeout(r, 300));
    const p = G.player;
    p.x = Math.min(G.map.width - 700, Math.max(700, p.x)); p.y = G.map.groundY;
    // 町の NPC をすべて画面内へ（他の町の NPC も足して 24 人に）
    const npcs = [];
    for (const m of Object.values(MAPS)) for (const n of m.npcs || []) if (!npcs.some((q) => q.id === n.id)) npcs.push(n);
    G.npcs = npcs.slice(0, 24).map((n, i) => { const o = new NPC(G, { ...n, x: p.x - 600 + (i % 12) * 100, y: G.map.groundY, hours: null }); return o; });
    // 市民・人型の敵（画面内）
    G.enemies.length = 0;
    const civs = ['civilian_tourist', 'civilian_business', 'civilian_skater', 'civilian_granny', 'civilian_dancer'];
    for (let i = 0; i < civ; i++) {
      const e = new Enemy(G, civs[i % civs.length], p.x - 620 + (i * 1240 / civ), G.map.groundY, { civilian: true, x1: p.x - 650, x2: p.x + 650 });
      G.enemies.push(e);
    }
    for (const [id, dx] of [['thug_punk', -300], ['thug_skater', -200], ['thug_hitman', -100], ['cop_patrol', 100], ['cop_detective', 200], ['swat_trooper', 300], ['swat_heavy', 400], ['boss_don', 500]]) {
      const e = new Enemy(G, id, p.x + dx, G.map.groundY, {});
      e.update = function (dt) { this.t += dt; };
      e.onGround = true;
      G.enemies.push(e);
    }
    G.spawner && (G.spawner.update = () => {});
    G.debug.profile = true;
  }, [MAP, CIV]);
  await sleep(WARM);
  let cdp = null;
  if (arg.includes('--profile')) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const res = await page.evaluate(async (N) => {
    const G = window.game, C = await import('./src/render/character.js'), R = await import('./src/render/rig.js');
    const S = await import('./src/render/sprites.js');
    const c0 = C.characterCacheStats(), r0 = R.rigStats(), s0 = S.spriteStats();
    const ft = [];
    await new Promise((done) => {
      const f = () => { ft.push([G.perf.ms, (G.perf.phases || {}).ents || 0]); if (ft.length < N) requestAnimationFrame(f); else done(); };
      requestAnimationFrame(f);
    });
    const c1 = C.characterCacheStats();
    const rs = R.rigStats(), s1 = S.spriteStats();
    return { ft, cache: { entries: c1.entries, px: c1.px, hit: c1.hit - c0.hit, build: c1.build - c0.build, direct: c1.direct - c0.direct },
      rig: { plans: rs.plans, gens: rs.gens, bakes: rs.bakes - r0.bakes, gen: rs.gen - r0.gen, recolors: rs.recolors - r0.recolors, loaded: rs.loaded - r0.loaded },
      face: { recolors: s1.faceRecolors - s0.faceRecolors, cached: s1.faceRecolor, preps: (s1.preps || 0) - (s0.preps || 0), prepMs: Math.round((s1.prepMs || 0) - (s0.prepMs || 0)), prepMax: Math.round(s1.prepMax || 0) }, ents: G.enemies.length, npcs: G.npcs.length };
  }, N);
  if (process.env.DBG) console.log(await page.evaluate(() => { const k = [...globalThis.__PLANS.keys()]; const r = {}; for (const x of k) { const v = x.split('|').pop(); r[v] = (r[v] || 0) + 1; } const ws = {}; for (const x of k) { const w = x.split('|').slice(-2, -1)[0].split(',').slice(-1)[0]; ws[w] = (ws[w] || 0) + 1; } return JSON.stringify(r) + JSON.stringify(ws); }));
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; const cnt = new Map();
    profile.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
    for (const [id, us] of cnt) { const n = byId.get(id); const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + us); }
    const tot = [...self.values()].reduce((a, b) => a + b, 0);
    console.log('CPU（自己時間の上位）:'); for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(us / 1000).toFixed(0).padStart(6)}ms ${(us / tot * 100).toFixed(1).padStart(5)}% ${k}`);
  }
  if (SHOT) await page.screenshot({ path: SHOT });
  const ms = res.ft.map((r) => r[0]), en = res.ft.map((r) => r[1]);
  const st = (a) => { const s = a.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]; return `avg=${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)} p50=${q(0.5).toFixed(2)} p90=${q(0.9).toFixed(2)} p99=${q(0.99).toFixed(2)} max=${s.at(-1).toFixed(1)}`; };
  console.log(`map=${MAP} civ=${CIV} npcs=${res.npcs} enemies=${res.ents} frames=${ms.length}${NO_NPC_RIG ? ' (rig.npcs=false)' : ''}`);
  console.log('frame(ms):', st(ms));
  console.log('ents(ms): ', st(en));
  console.log('重いフレーム: >33ms', ms.filter((x) => x > 33).length, '/ >50ms', ms.filter((x) => x > 50).length, '/ 合計 >33ms の超過', ms.filter((x) => x > 33).reduce((a, b) => a + b - 16.7, 0).toFixed(0) + 'ms');
  console.log('cache:', JSON.stringify(res.cache), '\nrig（計測中の増分）:', JSON.stringify(res.rig), 'face:', JSON.stringify(res.face));
  if (errs.length) console.log('pageerror:', errs.slice(0, 5));
} finally {
  if (browser) await browser.close();
  server.kill();
}
