// 性能計測（npm test には含めない）: 4次職の大技を CT 無視で連発し、1フレームの処理時間と部位別の内訳を出す。
// 実行: node tests/perf.mjs [gun|dance|fight|race|net|drone] [--night] [--frames=1500]
//  - game.debug.profile = true で main.js が game.perf.phases（部位別 ms）を記録する
//  - 8ms を超えたフレームの内訳（0.8ms 以上の部位）を表示
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8139;
const URL = `http://127.0.0.1:${PORT}/index.html`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = process.argv.slice(2);
const line = arg.find((a) => !a.startsWith('--')) || 'gun';
const night = arg.includes('--night');
const N = Number((arg.find((a) => a.startsWith('--frames=')) || '').slice(9)) || 1500;
const LINES = {
  gun: ['luna', ['luna_gunner', 'luna_sharpshooter', 'luna_trigger_maestro', 'luna_galaxy_outlaw']],
  dance: ['luna', ['luna_dancer', 'luna_rave_star', 'luna_prism_idol', 'luna_cosmo_star']],
  fight: ['jin', ['jin_brawler', 'jin_knuckle_champ', 'jin_dragon_fist', 'jin_vice_legend']],
  race: ['jin', ['jin_racer', 'jin_drifter', 'jin_nitro_ace', 'jin_warp_rider']],
  net: ['hacker', ['hk_netrunner', 'hk_code_breaker', 'hk_ghost_protocol', 'hk_cyber_oracle']],
  drone: ['hacker', ['hk_drone_pilot', 'hk_swarm_commander', 'hk_mecha_architect', 'hk_orbital_master']],
};

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

const [cls, jobs] = LINES[line] || LINES.gun;
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
await page.waitForFunction(() => window.game && window.game.scene === 'title');
await page.evaluate((cls) => { window.game._titleQuick = { slot: 0, create: { classId: cls, name: 'Perf', gender: 'f' } }; }, cls);
await page.waitForFunction(() => window.game.scene === 'play');
await page.evaluate(async ([jobs, night]) => {
  const G = window.game, J = await import('./src/systems/jobs.js'), S = await import('./src/data/skills.js'), JD = await import('./src/data/jobs.js');
  G.debug.setLevel(100); G.debug.god = true;
  for (const j of jobs) J.advanceJob(G, j);
  const act = [];
  for (const j of jobs) for (const sid of JD.JOBS[j].skills) { G.state.skills[sid] = S.SKILLS[sid].maxLevel || 20; if (!['passive', 'move'].includes(S.SKILLS[sid].kind)) act.push(sid); }
  G.state.skillBar = act.slice(-8);
  G.debug.warp('space_f4'); G.debug.profile = true; if (night) G.debug.setClock(22);
  G.ui.closeAll();
}, [jobs, night]);
await sleep(1500);
await page.evaluate((N) => {
  const G = window.game; let k = 0; window.__ft = [];
  const f = async () => {
    window.__ft.push([G.perf.ms, G.effects.length, G.projectiles.length, G.enemies.length, { ...(G.perf.phases || {}) }]);
    if (window.__ft.length < N) requestAnimationFrame(f);
    if (k++ % 6 === 0) {
      const SK = await import('./src/systems/skills.js'); SK.resetCooldowns(); G.state.mp = 99999;
      if (G.enemies.filter((e) => !e.dead).length < 16) for (let i = 0; i < 8; i++) G.debug.spawnEnemy();
      const id = G.state.skillBar[(k / 6 | 0) % 8]; if (id) SK.useSkill(G, id);
    }
  };
  requestAnimationFrame(f);
}, N);
await page.waitForFunction((N) => window.__ft.length >= N, N, { timeout: 600000 });
const ft = await page.evaluate(() => window.__ft);
const ms = ft.map((r) => r[0]); const s = ms.slice().sort((a, b) => a - b);
const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
console.log(`${line}${night ? ' (night)' : ''}: frames=${ms.length} avg=${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2)}ms p90=${q(0.9)} p99=${q(0.99)} max=${s.at(-1).toFixed(1)} >8ms=${ms.filter((x) => x > 8).length} >16ms=${ms.filter((x) => x > 16).length}`);
const avgPh = {};
for (const r of ft) for (const [k, v] of Object.entries(r[4])) avgPh[k] = (avgPh[k] || 0) + v / ft.length;
console.log('平均の内訳(ms):', Object.entries(avgPh).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' / '));
for (const r of ft.filter((x) => x[0] > 8).slice(0, 15)) console.log(`  ${r[0].toFixed(1)}ms fx${r[1]} proj${r[2]} enemies${r[3]}`, Object.entries(r[4]).filter(([, v]) => v > 0.8).map(([k, v]) => `${k}:${v.toFixed(1)}`).join(' '));
if (errs.length) console.log('pageerror:', errs.slice(0, 5));
await browser.close(); server.kill();
