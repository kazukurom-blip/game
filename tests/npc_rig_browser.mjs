// NPC・人型の敵・市民のリグ＋顔・髪の絵（manifest の rig.npcs）のブラウザテスト（Playwright）
//   node tests/npc_rig_browser.mjs        （npm run test:npcrig）
//  ① 本物の manifest（rig.npcs 既定 true）: 町の NPC 全員・チンピラ/警官/SWAT/ドン・市民がリグのプランと重ね頭で描ける・顔の割り当て（決定論的・主人公の初期の顔を避ける）
//     表情（被弾 hurt・攻撃 shout・死亡 hurt）・主人公の描画が rig.npcs=false の時と画素まで同じ・性能（40人）・ゲーム中の町/フィールドのスクショ
//  ② rig.npcs=false: NPC・敵・市民はリグも顔の絵も使わない（今まで通り）
//  ③ 悪役・ドン・老人の顔がある時（本物の顔の絵を m_v01 などの名前で差し込む）: 敵の種類ごとの顔・ドンの顔と髪（m_slick・グレー）・老人の顔
// スクショ: tests/screenshots/npcrig_*.png（SHOTS_DIR で変更可）
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8157;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/, /\[sprites\]/, /\[rig\]/, /404 \(Not Found\)/];

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
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `npcrig_${name}.png`) });
const saveUrl = (name, url) => fs.writeFileSync(path.join(SHOTS, `npcrig_${name}.png`), Buffer.from(url.split(',')[1], 'base64'));

const REAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'manifest.json'), 'utf8'));
const realFace = (g, i) => { const ks = Object.keys(REAL.faces || {}).filter((k) => k.startsWith(g + '_')).sort(); return ks[i % ks.length]; };
// ③ 悪役・ドン・老人の顔（本物の顔の絵を別名で）・ドンの髪 m_slick（本物の m_short を別名で）
const FAKE_FACES = { m_v01: 'm', m_v02: 'm', m_v03: 'm', m_v04: 'm', m_v05: 'm', m_v06: 'm', f_v01: 'f', f_v02: 'f', m_don: 'm', m_o01: 'm', m_o02: 'm', f_o01: 'f' };
function manifestFor(mode) {
  const m = JSON.parse(JSON.stringify(REAL));
  if (mode === 'off') m.rig.npcs = false;
  if (mode === 'vil') {
    let i = 3;
    for (const [k, g] of Object.entries(FAKE_FACES)) {
      const src = REAL.faces[realFace(g, i++)];
      const file = typeof src === 'string' ? src : src.file;
      m.faces[k] = { file: `heads/face/${k}.png`, __src: file };
    }
    if (m.hairs.m_short) m.hairs.m_slick = { file: 'heads/hair/m_slick.png', back: 'heads/hair/m_slick_back.png', base: '#b07850' };
  }
  return m;
}
async function openGame(browser, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  const man = manifestFor(mode);
  const alias = {};
  for (const [k, v] of Object.entries(man.faces || {})) if (v && v.__src) { alias[`heads/face/${k}.png`] = v.__src; delete v.__src; }
  if (man.hairs && man.hairs.m_slick) { alias['heads/hair/m_slick.png'] = REAL.hairs.m_short.file; alias['heads/hair/m_slick_back.png'] = REAL.hairs.m_short.back; }
  await page.route('**/assets/sprites/**', async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.split('/assets/sprites/')[1] || '');
    if (rel === 'manifest.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(man) });
    if (alias[rel]) return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'assets', 'sprites', alias[rel])) });
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.game && window.game.sprites && window.game.scene === 'title', null, { timeout: 20000 });
  await page.evaluate(async () => { const R = await import('./src/render/rig.js'); await Promise.all([window.game.sprites.preloadSprites(), R.rigPreload()]); });
  await sleep(300);
  return { page, ctx, errs };
}
async function startPlay(page, classId = 'luna', gender = 'f') {
  await page.evaluate(([c, g]) => { window.game._titleQuick = { slot: 0, create: { classId: c, gender: g, name: 'テスト' } }; }, [classId, gender]);
  await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
  await page.evaluate(() => { const g = window.game; g.debug.god = true; g.ui.closeAll(); });
  await sleep(300);
}
/** NPC・敵・市民の look・装備・顔の割り当てを集める */
function collect(page) {
  return page.evaluate(async () => {
    const C = await import('./src/render/character.js');
    const { MAPS } = await import('./src/world/maps.js');
    const { NPC } = await import('./src/entities/npc.js');
    const { ENEMIES } = await import('./src/data/enemies.js');
    const EA = await import('./src/render/enemyArt.js');
    const M2 = await import('./src/render/monsters2.js');
    const R = await import('./src/render/rig.js');
    const G = window.game;
    const info = (look, equip, anim = {}, st = 'idle') => {
      const h = C.aiHeadOf(look, anim, st, 0.3, !!anim.villain);
      const plan = C.rigPlanOf(look, equip);
      return { plan: !!plan, uses: plan ? plan.uses : null, head: h ? { layered: !!h.layered, file: h.file, expr: h.expr } : null };
    };
    const faceOf = (h) => (h && /F:heads\/face\/([a-z]_[a-z0-9]+?)(_[a-z]+)?\.png/.exec(h.file) || [])[1] || null;
    const hairOf = (h) => (h && /\+([fm]_[a-z]+)/.exec(h.file) || [])[1] || null;
    const out = { npcs: [], enemies: [], civs: [], npcsFlag: R.rigStats().npcs };
    const seen = new Set();
    for (const m of Object.values(MAPS)) for (const d of m.npcs || []) {
      if (seen.has(d.id)) continue; seen.add(d.id);
      const n = new NPC(G, d);
      const i = info(n.look, n.equip);
      out.npcs.push({ id: d.id, g: n.look.body, hair: n.look.hair, ...i, face: faceOf(i.head), hairArt: hairOf(i.head) });
    }
    for (const id of ['thug_punk', 'thug_skater', 'thug_hitman', 'boss_captain', 'cop_patrol', 'cop_detective', 'swat_trooper', 'swat_heavy', 'boss_don']) {
      const d = ENEMIES[id]; if (!d) continue;
      const le = EA.humanEnemyLook(d);
      const i = info(le.look, le.equip, { villain: true, deadT: 0 });
      const hurt = C.aiHeadOf(le.look, { villain: true }, 'hurt', 0.1, true);
      const atk = C.aiHeadOf(le.look, { villain: true }, 'attack', 0, true);
      const dead = C.aiHeadOf(le.look, { villain: true }, 'dead', 0, true);
      out.enemies.push({ id, art: d.art, g: le.look.body, ...i, face: faceOf(i.head), hairArt: hairOf(i.head), hairColor: i.head && /\|[^|]*$/.exec(i.head.file)[0],
        hurt: hurt && hurt.expr, shout: atk && atk.expr, dead: dead && dead.expr, again: faceOf(C.aiHeadOf(le.look, {}, 'idle', 0.3, true)) });
    }
    for (let s = 1; s <= 40; s++) {
      const c = M2.civilianLook(s * 7919, s % 8 === 0 ? 'civilian_granny' : '');
      const i = info(c.look, c.equip);
      out.civs.push({ seed: s, g: c.look.body, ...i, face: faceOf(i.head) });
    }
    return out;
  });
}
/** 人型をいろいろな状態で並べた表（NPC・敵・市民 × 状態） */
function drawGrid(page, label, who) {
  return page.evaluate(async ([label, who]) => {
    const { drawCharacter } = await import('./src/render/character.js');
    const { MAPS } = await import('./src/world/maps.js');
    const { NPC } = await import('./src/entities/npc.js');
    const { ENEMIES } = await import('./src/data/enemies.js');
    const EA = await import('./src/render/enemyArt.js');
    const M2 = await import('./src/render/monsters2.js');
    const G = window.game;
    const npcDef = (id) => { for (const m of Object.values(MAPS)) for (const d of m.npcs || []) if (d.id === id) return d; return null; };
    const rows = who.map((w) => {
      if (w.startsWith('npc:')) { const n = new NPC(G, npcDef(w.slice(4))); return [w.slice(4), n.look, n.equip, false]; }
      if (w.startsWith('civ:')) { const c = M2.civilianLook(+w.slice(4), w.includes('g') ? 'granny' : ''); return ['市民 ' + w.slice(4), c.look, c.equip, false]; }
      const le = EA.humanEnemyLook(ENEMIES[w]); return [w, le.look, le.equip, true];
    });
    const states = [['idle', {}], ['left', { facing: -1 }], ['walk', { state: 'walk', t: 0.15 }], ['walk2', { state: 'walk', t: 0.45 }], ['attack', { state: 'attack', attackT: 0.5 }],
      ['hurt', { state: 'hurt', t: 0.1 }], ['flash', { state: 'hurt', t: 0.1, flash: true }], ['jump', { state: 'jump', t: 0.1 }], ['sit', { state: 'sit' }], ['drive', { state: 'drive' }],
      ['climb', { state: 'climb', t: 0.2 }], ['dead', { state: 'dead', t: 1, deadT: 1 }]];
    const c = document.createElement('canvas'); c.width = 1280; c.height = 120 + rows.length * 112;
    const x = c.getContext('2d');
    x.fillStyle = '#3a3150'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.fillText(label, 10, 18);
    states.forEach(([n], j) => { x.font = '11px sans-serif'; x.textAlign = 'center'; x.fillText(n, 150 + j * 94, 36); });
    rows.forEach(([name, look, equip, vil], i) => {
      const cy = 140 + i * 112;
      x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.fillText(name, 6, cy - 40);
      states.forEach(([, o], j) => {
        const a = { state: 'idle', t: 0.3, facing: 1, scale: 1.05, ...o };
        if (vil) a.deadT = o.deadT || 0;
        drawCharacter(x, 150 + j * 94, cy, look, equip, a);
      });
    });
    return c.toDataURL('image/png');
  }, [label, who]);
}
/** 主人公を全部の状態で描いた絵（rig.npcs の有無で変わらないことを確かめる） */
function heroSheet(page) {
  return page.evaluate(async () => {
    const { drawCharacter, clearCharacterCache } = await import('./src/render/character.js');
    const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
    const deps = await import('./src/ui/deps.js');
    clearCharacterCache();
    const c = document.createElement('canvas'); c.width = 1280; c.height = 400;
    const x = c.getContext('2d');
    x.fillStyle = '#3a3150'; x.fillRect(0, 0, 1280, 400);
    const eq = deps.equipLooks(window.game.state);
    const states = [{}, { facing: -1 }, { state: 'walk', t: 0.2 }, { state: 'attack', attackT: 0.5 }, { state: 'hurt', t: 0.1 }, { state: 'jump', t: 0.1 }, { state: 'climb', t: 0.2 }, { state: 'sit' }, { state: 'drive' }, { state: 'dead', t: 1 }, { state: 'idle', t: 3.9 }, { state: 'cheer', t: 0.3 }];
    [['luna', 'f'], ['jin', 'm']].forEach(([cls, g], r) => {
      const look = Object.assign({ ...DEFAULT_LOOKS[cls][g] }, {});
      Object.defineProperty(look, 'classId', { value: cls, enumerable: false }); Object.defineProperty(look, 'gender', { value: g, enumerable: false });
      states.forEach((o, i) => drawCharacter(x, 60 + i * 100, 170 + r * 190, look, eq, { state: 'idle', t: 0.3, facing: 1, scale: 1.3, ...o }));
    });
    return c.toDataURL('image/png');
  });
}
/** 40人（NPC・市民・敵）を毎フレーム描いた時間（キャッシュが温まってから） */
function perf(page) {
  return page.evaluate(async () => {
    const { drawCharacter } = await import('./src/render/character.js');
    const { MAPS } = await import('./src/world/maps.js');
    const { NPC } = await import('./src/entities/npc.js');
    const { ENEMIES } = await import('./src/data/enemies.js');
    const EA = await import('./src/render/enemyArt.js');
    const M2 = await import('./src/render/monsters2.js');
    const G = window.game;
    const L = [];
    for (const m of Object.values(MAPS)) for (const d of m.npcs || []) if (L.length < 16 && !L.some((q) => q.id === d.id)) { const n = new NPC(G, d); L.push({ id: d.id, look: n.look, equip: n.equip, a: { state: 'idle' } }); }
    for (let s = 0; s < 18; s++) { const c = M2.civilianLook(1000 + s * 31, ''); L.push({ look: c.look, equip: c.equip, a: { state: 'walk', deadT: 0 } }); }
    for (const id of ['thug_punk', 'thug_hitman', 'cop_patrol', 'swat_trooper', 'swat_heavy', 'boss_don']) { const le = EA.humanEnemyLook(ENEMIES[id]); L.push({ look: le.look, equip: le.equip, a: { state: 'walk', deadT: 0 } }); }
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const x = c.getContext('2d');
    const frame = (t) => { x.clearRect(0, 0, 1280, 720); L.forEach((p, i) => drawCharacter(x, 40 + (i % 20) * 62, 300 + Math.floor(i / 20) * 200, p.look, p.equip, { facing: i % 2 ? 1 : -1, t: t + i * 0.37, ...p.a, scale: 1 })); };
    for (let k = 0; k < 120; k++) frame(k / 60);   // 温める（2周）
    const ms = [];
    for (let k = 0; k < 120; k++) { const t0 = performance.now(); frame((k + 120) / 60); ms.push(performance.now() - t0); }
    ms.sort((a, b) => a - b);
    return { n: L.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p90: ms[Math.floor(ms.length * 0.9)], max: ms[ms.length - 1] };
  });
}
async function townShots(page, prefix) {
  for (const [map, x] of [['beach', null], ['downtown', null], ['casino', null], ['down_f1', 800]]) {
    await page.evaluate(([map, x]) => { const G = window.game; G.debug.warp(map); G.ui.closeAll(); if (x) { G.player.x = x; } }, [map, x]);
    await sleep(900);
    await page.evaluate(async (map) => {
      const G = window.game, p = G.player;
      const { Enemy } = await import('./src/entities/enemy.js');
      if (map === 'down_f1') {
        for (const [id, dx] of [['thug_punk', 150], ['thug_skater', 260], ['cop_patrol', -160], ['swat_trooper', -280], ['boss_don', 400]]) {
          const e = new Enemy(G, id, p.x + dx, p.y, {}); e.facing = dx > 0 ? -1 : 1; G.enemies.push(e);
        }
      } else {
        // 町の NPC が画面に入るように、プレイヤーを NPC の多い所へ
        const xs = G.npcs.filter((n) => !n.hidden).map((n) => n.x).sort((a, b) => a - b);
        if (xs.length) p.x = xs[Math.floor(xs.length / 2)];
        for (let i = 0; i < 6; i++) G.spawner && G.spawner.spawnCivilian && G.spawner.spawnCivilian(true);
        for (const e of G.enemies) if (e.civilian && Math.abs(e.x - p.x) > 600) e.x = p.x + (Math.random() - 0.5) * 1000;
      }
    }, map);
    await sleep(1200);
    await shot(page, `${prefix}_${map}`);
  }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  const WHO = ['npc:rico', 'npc:sunny', 'npc:old_boone', 'npc:vivi', 'npc:don_caiman', 'npc:officer_kai', 'civ:12', 'civ:8g', 'thug_punk', 'thug_skater', 'cop_patrol', 'swat_trooper', 'boss_don'];
  let heroOn = null, heroOff = null, perfOn = null, perfOff = null;

  // ================================================================ ① 本物の manifest（rig.npcs 既定 true）
  console.log('\n[on] 本物の manifest（rig.npcs 既定）');
  {
    const { page, ctx, errs } = await openGame(browser, 'on');
    await startPlay(page, 'luna', 'f');
    const D = await collect(page);
    check('on: rigStats().npcs = true（既定）', D.npcsFlag === true);
    const npcBad = D.npcs.filter((n) => !n.plan || !n.head || !n.head.layered);
    check(`on: 町の NPC 全員（${D.npcs.length}人）にリグのプランと重ね頭`, D.npcs.length >= 40 && npcBad.length === 0, npcBad.map((n) => n.id).join(','));
    const enBad = D.enemies.filter((e) => !e.plan || !e.head);
    check(`on: 人型の敵（${D.enemies.map((e) => e.id).join(',')}）にリグと重ね頭`, D.enemies.length >= 8 && enBad.length === 0, JSON.stringify(enBad));
    const civBad = D.civs.filter((c) => !c.plan || !c.head);
    check('on: 市民 40人にリグと重ね頭', civBad.length === 0, JSON.stringify(civBad.slice(0, 3)));
    const heroF = new Set(['f_01', 'f_02', 'f_03', 'm_01', 'm_02', 'm_03']);
    const others = Object.keys(REAL.faces).filter((k) => !heroF.has(k)).length;
    const usesHero = [...D.npcs, ...D.civs, ...D.enemies].filter((n) => heroF.has(n.face));
    check('on: NPC・市民・敵は主人公の初期の顔（f_01〜03 / m_01〜03）を使わない（他の顔がある時）', others === 0 || usesHero.length === 0, usesHero.map((n) => (n.id || n.seed) + ':' + n.face).join(','));
    const fs1 = new Set(D.npcs.map((n) => n.face)), fs2 = new Set(D.civs.map((n) => n.face));
    check('on: 顔がばらける（NPC 8種類以上・市民 6種類以上）', fs1.size >= Math.min(8, others) && fs2.size >= Math.min(6, others), `NPC ${fs1.size} / 市民 ${fs2.size}`);
    const sexOk = [...D.npcs, ...D.civs].every((n) => !n.face || n.face.startsWith(n.g + '_'));
    check('on: 顔の性別 = look.body', sexOk);
    const hairOk = D.npcs.every((n) => !n.hairArt || n.hairArt.startsWith(n.g + '_')) && D.npcs.filter((n) => REAL.hairs[n.g + '_' + n.hair] && n.id !== 'don_caiman').every((n) => n.hairArt === n.g + '_' + n.hair);
    check('on: 髪は look.hair の絵（あれば）・無ければ同じ性別の近い髪型', hairOk, JSON.stringify(D.npcs.filter((n) => n.hairArt !== n.g + '_' + n.hair).map((n) => n.id + ' ' + n.hair + '→' + n.hairArt).slice(0, 12)));
    const D2 = await collect(page);
    check('on: 割り当ては決定論的（2回目も同じ顔）', JSON.stringify(D2.npcs.map((n) => n.face)) === JSON.stringify(D.npcs.map((n) => n.face)) && D.enemies.every((e) => e.again === e.face));
    const ex = D.enemies.find((e) => e.id === 'thug_punk');
    check('on: 敵の表情（被弾 hurt・攻撃 shout・死亡 hurt）', ex && ex.hurt === 'hurt' && ex.shout === 'shout' && ex.dead === 'hurt', JSON.stringify(ex && { h: ex.hurt, s: ex.shout, d: ex.dead }));
    const don = D.enemies.find((e) => e.id === 'boss_don');
    check('on: ドンの髪は白髪交じりのグレー（#8e8f99）', don && /8e8f99/.test(don.head.file), don && don.head.file);
    const npcSuit = D.npcs.find((n) => n.id === 'don_caiman');
    check('on: 服の絵が無い装備（スーツ等）はコードの代用パーツ', npcSuit && npcSuit.uses && npcSuit.uses.top === 'code', JSON.stringify(npcSuit && npcSuit.uses));
    saveUrl('grid_on', await drawGrid(page, 'rig.npcs = true（本物の manifest）: NPC・市民・敵 × 状態', WHO));
    heroOn = await heroSheet(page);
    saveUrl('hero_on', heroOn);
    perfOn = await perf(page);
    await townShots(page, 'on');
    check('on: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ================================================================ ② rig.npcs = false（今まで通り）
  console.log('\n[off] rig.npcs = false');
  {
    const { page, ctx, errs } = await openGame(browser, 'off');
    await startPlay(page, 'luna', 'f');
    const D = await collect(page);
    check('off: rigStats().npcs = false', D.npcsFlag === false);
    const any = [...D.npcs, ...D.enemies, ...D.civs].filter((n) => n.plan || n.head);
    check('off: NPC・敵・市民はリグも顔の絵も使わない（今まで通りのコード描画）', any.length === 0, any.slice(0, 3).map((n) => n.id || n.seed).join(','));
    saveUrl('grid_off', await drawGrid(page, 'rig.npcs = false（今まで通り）', WHO));
    heroOff = await heroSheet(page);
    saveUrl('hero_off', heroOff);
    perfOff = await perf(page);
    await townShots(page, 'off');
    check('off: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // 主人公は rig.npcs の有無で画素まで同じ
  {
    const page = await (await browser.newContext()).newPage();
    const r = await page.evaluate(async ([a, b]) => {
      const load = (u) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = u; });
      const [A, B] = await Promise.all([load(a), load(b)]);
      const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const da = px(A), db = px(B);
      let n = 0, mx = 0;
      for (let i = 0; i < da.length; i++) { const d = Math.abs(da[i] - db[i]); if (d) { n++; mx = Math.max(mx, d); } }
      return { n, mx };
    }, [heroOn, heroOff]);
    check('主人公（ルナ♀・ジン♂ × 12状態）の描画は rig.npcs の有無で画素まで同じ', r.n === 0, JSON.stringify(r));
    await page.context().close();
  }
  console.log(`  性能（40人を毎フレーム。キャッシュが温まってから）: rig.npcs=true ${perfOn.avg.toFixed(2)}ms (p90 ${perfOn.p90.toFixed(2)}, max ${perfOn.max.toFixed(1)}) / false ${perfOff.avg.toFixed(2)}ms (p90 ${perfOff.p90.toFixed(2)}, max ${perfOff.max.toFixed(1)})`);
  check('性能: rig.npcs=true でも 40人の1フレームが今まで（false）の 1.3倍 + 1ms 以内', perfOn.avg <= perfOff.avg * 1.3 + 1, `${perfOn.avg.toFixed(2)} vs ${perfOff.avg.toFixed(2)}`);

  // ================================================================ ③ 悪役・ドン・老人の顔がある時
  console.log('\n[vil] 悪役・ドン・老人の顔あり（本物の顔の絵を別名で差し込み）');
  {
    const { page, ctx, errs } = await openGame(browser, 'vil');
    await startPlay(page, 'luna', 'm');
    const D = await collect(page);
    const E = Object.fromEntries(D.enemies.map((e) => [e.id, e]));
    const th = ['thug_punk', 'thug_hitman', 'thug_skater'].map((id) => E[id]);
    check('vil: チンピラ → ♂ m_v01〜m_v03・♀ f_v01', th.every((e) => (e.g === 'm' ? /^m_v0[123]$/ : /^f_v01$/).test(e.face)), th.map((e) => e.id + '(' + e.g + '):' + e.face).join(','));
    check('vil: 警官 → m_v04、SWAT → m_v05、船長（ボス）→ m_v06', E.cop_patrol.face === 'm_v04' && E.swat_trooper.face === 'm_v05' && E.swat_heavy.face === 'm_v05' && E.boss_captain.face === 'm_v06', ['cop_patrol', 'swat_trooper', 'swat_heavy', 'boss_captain'].map((id) => E[id].face).join(','));
    check('vil: ドン → m_don・髪 m_slick・グレー', E.boss_don.face === 'm_don' && E.boss_don.hairArt === 'm_slick' && /8e8f99/.test(E.boss_don.head.file), JSON.stringify({ f: E.boss_don.face, h: E.boss_don.hairArt }));
    const N = Object.fromEntries(D.npcs.map((n) => [n.id, n]));
    check('vil: NPC のドン・カイマンもドンの顔', N.don_caiman.face === 'm_don' && N.don_caiman.hairArt === 'm_slick', N.don_caiman.face + ' ' + N.don_caiman.hairArt);
    check('vil: 老人の NPC（ブーンじいさん）→ m_o01 / m_o02', /^m_o0[12]$/.test(N.old_boone.face), N.old_boone.face);
    const gran = D.civs.filter((c, i) => (i + 1) % 8 === 0);
    check('vil: おばあちゃんの市民 → f_o01', gran.length && gran.every((c) => c.face === 'f_o01'), gran.map((c) => c.face).join(','));
    const vilInNpc = D.npcs.filter((n) => n.id !== 'don_caiman' && n.id !== 'old_boone' && /_(v|o)\d|don/.test(n.face || ''));
    check('vil: 普通の NPC は悪役・老人の顔を使わない', vilInNpc.length === 0, vilInNpc.map((n) => n.id + ':' + n.face).join(','));
    saveUrl('grid_vil', await drawGrid(page, '悪役・ドン・老人の顔あり（仮: 本物の顔の絵を別名で）', WHO));
    check('vil: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(`\nnpcrig: ${pass} passed, ${fail} failed`);
  if (fail) { console.log(problems.map((p) => ' - ' + p).join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
