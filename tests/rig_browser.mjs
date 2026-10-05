// 主人公のパーツ式（リグ）のブラウザテスト（Playwright）
//   node tests/rig_browser.mjs        （npm run test:rig）
// 仮のAI画像（今のコード描画のパーツを配置図に書き出したもの＝tools/rig_page.js の fake）を page.route で assets/sprites/rig/ に差し込み、
//  ① 全状態 × 装備 × ♀♂ × 色違い × 武器種 でリグ描画が破綻しないか（コード描画との差・例外なし・スクショ）
//  ② 位置合わせ（ずれ・拡大・透明背景）、持ち手の印、色替え（陰影を残す）、服破れ、白フラッシュ、半透明、左右反転
//  ③ ゲーム中の主人公・F2 の切替・NPC には使わない・AIの頭と一緒
//  ④ フォールバック（素体なし / 読み込み中 / 壊れた画像 / 一部の装備だけ）、性能（10人）
// スクショ: tests/screenshots/rig_*.png
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8151;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/, /assets\/sprites\//, /\[sprites\]/, /\[rig\]/, /404 \(Not Found\)/, /willReadFrequently/];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules_global', '/usr/local/lib/node_modules', '/usr/lib/node_modules']
    .filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright が見つかりません');
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const TOOL_PAGE = '<!doctype html><meta charset="utf-8"><body><script type="module" src="/tools/rig_page.js"></script></body>';
function startServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__rig.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(TOOL_PAGE); return; }
    const f = path.join(ROOT, u);
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
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `rig_${name}.png`) });

// ---------------------------------------------------------------- 仮のAI画像
const STYLES = {
  top: ['hoodie', 'leatherJacket', 'tshirt', 'tank', 'hawaiian', 'tracksuit', 'police', 'suit', 'idolDress', 'armorVest'],
  bottom: ['skirt', 'trackPants', 'jeans', 'shorts', 'cargo', 'suitPants', 'armorPants'],
  shoes: ['sneakers', 'boots', 'sandals', 'loafers', 'heels'],
  hat: ['catEars', 'headphones', 'cap', 'beanie', 'bandana', 'cowboy', 'helmet', 'crown'],
  accessory: ['sunglasses', 'scarf', 'goldChain', 'mask', 'wings', 'halo'],
};
const WEAPONS = ['knife', 'bat', 'staff', 'pistol', 'katana', 'smg', 'guitar', 'neonSword'];
async function genImages(browser) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  !! gen pageerror', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/__rig.html`);
  await page.waitForFunction(() => window.RIGTOOL && window.RIGTOOL.ready);
  const out = await page.evaluate(([STYLES, WEAPONS]) => {
    const T = window.RIGTOOL, f = {};
    let i = 0;
    for (const g of ['f', 'm']) {
      f[`body_${g}`] = T.fake('body', null, g, {});
      for (const slot of Object.keys(STYLES)) for (const st of STYLES[slot]) {
        // いろいろな「AIのずれ」: 一部は全体を少しずらす・枠ごとに少し大きく・透明背景・薄い灰色の背景
        const k = i++ % 4;
        const opts = k === 1 ? { shift: [7, -5] } : k === 2 ? { scale: 1.07 } : k === 3 ? { bg: null } : { bg: '#f4f4f0' };
        f[`${slot}/${st}_${g}`] = T.fake(slot, st, g, opts);
      }
      for (const n of [1, 2, 3]) f[`tear/${n}_${g}`] = T.fake('tear', String(n), g, { bg: null });
    }
    WEAPONS.forEach((w, j) => { f[`weapon/${w}`] = T.fake('weapon', w, null, j % 2 ? { mark: true, shift: [20, 6], scale: 1.1 } : {}); });
    // 色違い専用（目印に緑がかった色で描く）
    f['top/hoodie__1d2b24_f'] = T.fake('top', 'hoodie', 'f', { color: '#1d2b24', accent: '#3dff8a' });
    return f;
  }, [STYLES, WEAPONS]);
  await page.close();
  const map = {};
  for (const [k, v] of Object.entries(out)) map[`rig/${k}.png`] = Buffer.from(v.split(',')[1], 'base64');
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_body_f.png'), map['rig/body_f.png']);
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_hoodie_f.png'), map['rig/top/hoodie_f.png']);
  return map;
}
function headImage() {
  // 簡単な頭の絵（白背景に丸い顔＋髪）
  return null;
}
void headImage;
function manifestFor(IMGS, mode) {
  const keys = Object.keys(IMGS).filter((k) => k.startsWith('rig/')).map((k) => k.slice(4, -4));
  let parts = keys;
  if (mode === 'nobody') parts = keys.filter((k) => !k.startsWith('body'));
  if (mode === 'partial') parts = ['body_f', 'body_m', 'top/hoodie_f', 'weapon/knife', 'top/missing_f'];
  return { version: 1, rig: { enabled: true, parts } };
}

/** mode: 'ok' | 'none' | 'nobody' | 'broken' | 'slow' | 'partial' */
async function openGame(browser, mode, IMGS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  await page.route('**/assets/sprites/**', async (route) => {
    const u = new URL(route.request().url());
    const rel = decodeURIComponent(u.pathname.split('/assets/sprites/')[1] || '');
    if (rel === 'manifest.json') {
      const m = mode === 'none' ? { version: 1 } : manifestFor(IMGS, mode);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) });
    }
    if (mode === 'broken' && rel.startsWith('rig/body')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('not a png') });
    if (mode === 'broken' && rel.startsWith('rig/top')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('broken') });
    if (mode === 'slow' && rel.startsWith('rig/')) await sleep(2500);
    const b = IMGS[rel];
    if (!b) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: b });
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.game && window.game.sprites && window.__titleT, null, { timeout: 20000 });
  await sleep(300);
  return { page, ctx, errs };
}
async function startPlay(page, classId = 'luna', gender = 'f') {
  await page.evaluate(([c, g]) => { window.game._titleQuick = { slot: 0, create: { classId: c, gender: g, name: 'テスト' } }; }, [classId, gender]);
  await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
  await page.evaluate(() => { const g = window.game; g.debug.god = true; g.enemies.length = 0; if (g.spawner) g.spawner.timers = g.spawner.timers.map(() => -1e9); });
  await sleep(400);
}
const preload = (page) => page.evaluate(() => window.game.sprites.preloadSprites());

// ページ内: オーバーレイ canvas を作って表を描く（戻り値: dataURL, 差の統計）
const GRID_FN = `
window.__rigGrid = async function (cases, opts) {
  const { drawCharacter, clearCharacterCache } = await import('./src/render/character.js');
  const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
  const W = opts.w || 1280, H = opts.h || 720;
  let cv = document.getElementById('__rigcv');
  if (!cv) { cv = document.createElement('canvas'); cv.id = '__rigcv'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#3a3550'; document.body.appendChild(cv); }
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.fillStyle = opts.bg || '#3a3550'; x.fillRect(0, 0, W, H);
  x.font = '10px sans-serif';
  const cols = opts.cols || 10, cw = W / cols, rh = opts.rh || 150, sc = opts.scale || 1.5;
  const diffs = [];
  const look = (c) => ({ ...DEFAULT_LOOKS[c.cls || 'luna'][c.g || 'f'], ...(c.look || {}), classId: c.cls || 'luna', gender: c.g || 'f' });
  // 差の計算用の作業 canvas
  const A = document.createElement('canvas'), B = document.createElement('canvas');
  A.width = B.width = 200; A.height = B.height = 220;
  const ax = A.getContext('2d', { willReadFrequently: true }), bx = B.getContext('2d', { willReadFrequently: true });
  cases.forEach((c, i) => {
    const X = (i % cols) * cw + cw / 2, Y = Math.floor(i / cols) * rh + rh - 22;
    const an = { state: c.state || 'idle', t: c.t || 0, attackT: c.at || 0, scale: c.scale || sc, facing: c.facing || 1, damage: c.dmg || 0, flash: c.flash, alpha: c.alpha, aura: c.aura, auraTier: c.auraTier, deadT: c.state === 'dead' ? 1 : undefined, fallT: c.state === 'dead' ? (c.fall ?? 1) : undefined, noRig: c.noRig };
    drawCharacter(x, X, Y, look(c), c.eq || {}, an);
    x.fillStyle = '#fff'; x.fillText((c.label || c.state || '') .slice(0, 22), X - cw / 2 + 3, Y + 16);
    if (opts.diff && !c.flash && !(c.alpha < 1)) {
      ax.setTransform(1, 0, 0, 1, 0, 0); bx.setTransform(1, 0, 0, 1, 0, 0); ax.clearRect(0, 0, 200, 220); bx.clearRect(0, 0, 200, 220);
      const a1 = { ...an, scale: 1.5, facing: 1, noCache: true, aura: null };
      drawCharacter(ax, 100, 190, look(c), c.eq || {}, a1);
      drawCharacter(bx, 100, 190, look(c), c.eq || {}, { ...a1, noRig: true });
      const d1 = ax.getImageData(0, 0, 200, 220).data, d2 = bx.getImageData(0, 0, 200, 220).data;
      let un = 0, bad = 0, hole = 0;
      for (let p = 0; p < d1.length; p += 4) {
        const o1 = d1[p + 3] > 100, o2 = d2[p + 3] > 100;
        if (!o1 && !o2) continue;
        un++;
        if (o1 !== o2) { bad++; if (o2 && !o1) hole++; continue; }
        if (Math.abs(d1[p] - d2[p]) + Math.abs(d1[p + 1] - d2[p + 1]) + Math.abs(d1[p + 2] - d2[p + 2]) > 160) bad++;
      }
      diffs.push({ label: c.label || c.state, diff: un ? bad / un : 0, hole: un ? hole / un : 0 });
    }
  });
  return { url: opts.url ? cv.toDataURL('image/png') : null, diffs };
};
window.__rigClear = function () { const c = document.getElementById('__rigcv'); if (c) c.remove(); };
`;

const EQ = {
  luna_f: { hat: { style: 'catEars', color: '#ff8ac8', accent: '#ffe0f0' }, top: { style: 'hoodie', color: '#ff6fb5', accent: '#ffffff' }, bottom: { style: 'skirt', color: '#ff8ac8', accent: '#ffffff' }, shoes: { style: 'sneakers', color: '#f4f4f4', accent: '#ff6fb5' }, weapon: { style: 'knife', color: '#c9ccd6', accent: '#ff6fb5' } },
  jin_m: { top: { style: 'leatherJacket', color: '#1d1d24', accent: '#c0c0c8' }, bottom: { style: 'jeans', color: '#3a5a8c', accent: '#c9d6ea' }, shoes: { style: 'boots', color: '#2a2018', accent: '#8a8a8a' }, weapon: { style: 'bat', color: '#b98a52', accent: '#5a3a22' } },
  hacker_f: { hat: { style: 'headphones', color: '#2b2b38', accent: '#3dff8a' }, top: { style: 'hoodie', color: '#1d2b24', accent: '#3dff8a' }, bottom: { style: 'trackPants', color: '#2a2f38', accent: '#3dff8a' }, shoes: { style: 'sneakers', color: '#f4f4f4', accent: '#ff6fb5' }, weapon: { style: 'staff', color: '#3dff8a', accent: '#1d1d24' } },
  gun_m: { hat: { style: 'cap', color: '#2b2b38', accent: '#ff3d7f' }, top: { style: 'police', color: '#20335c', accent: '#ffd23f' }, bottom: { style: 'cargo', color: '#8a7a52', accent: '#4a4232' }, shoes: { style: 'loafers', color: '#5a3a22', accent: '#c9a26a' }, accessory: { style: 'goldChain', color: '#ffd23f', accent: '#fff4b0' }, weapon: { style: 'pistol', color: '#2a2a30', accent: '#8a8a8a' } },
};
const STATES = [
  { state: 'idle', t: 0.3 }, { state: 'idle', t: 3.9, label: 'idle(blink)' }, { state: 'walk', t: 0.1 }, { state: 'walk', t: 0.3 }, { state: 'jump', t: 0.2 },
  { state: 'climb', t: 0.2 }, { state: 'attack', at: 0.1 }, { state: 'attack', at: 0.35 }, { state: 'attack', at: 0.7 }, { state: 'shoot', at: 0.1 },
  { state: 'hurt', t: 0.12 }, { state: 'dead' }, { state: 'sit' }, { state: 'drive' }, { state: 'cheer', t: 0.3 },
];

async function main() {
  const { chromium } = await loadPlaywright();
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    console.log('仮のAI画像を作成…');
    const IMGS = await genImages(browser);
    console.log(`  ${Object.keys(IMGS).length} 枚`);

    // ================================================================ ① 全状態 × 装備
    console.log('\n① 全状態 × 装備 × ♀♂（リグ / コード描画との差）');
    {
      const { page, ctx, errs } = await openGame(browser, 'ok', IMGS);
      await page.evaluate(GRID_FN);
      const loaded = await preload(page);
      const rs = await page.evaluate(() => window.game.sprites.spriteStats().rig);
      check('リグの画像が全部読み込める', rs.loaded === rs.files && rs.failed === 0, `${rs.loaded}/${rs.files} 失敗 ${rs.failed} ${JSON.stringify(rs.warnings)}`);
      void loaded;
      const planOk = await page.evaluate(async () => {
        const { rigPlanOf } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const hero = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
        return { hero: !!rigPlanOf(hero, {}), npc: !!rigPlanOf({ ...DEFAULT_LOOKS.luna.f }, {}), vil: !!rigPlanOf({ ...hero, villain: true }, {}) };
      });
      check('主人公だけにリグ（NPC・悪役には使わない）', planOk.hero && !planOk.npc && !planOk.vil, JSON.stringify(planOk));
      const allDiffs = [];
      for (const [key, eq] of Object.entries(EQ)) {
        const [cls, g] = key.split('_');
        const cases = [];
        for (const s of STATES) cases.push({ ...s, cls: cls === 'gun' ? 'jin' : cls, g, eq, facing: cases.length % 3 === 2 ? -1 : 1 });
        for (const s of STATES.slice(0, 5)) cases.push({ ...s, cls: cls === 'gun' ? 'jin' : cls, g, eq, noRig: true, label: 'code ' + (s.label || s.state) });
        const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 10, rh: 230, scale: 1.9, diff: true }), [cases]);
        await shot(page, `states_${key}`);
        allDiffs.push(...r.diffs.filter((d) => !d.label.startsWith('code')).map((d) => ({ ...d, key })));
      }
      const worst = allDiffs.slice().sort((a, b) => b.diff - a.diff).slice(0, 4);
      const avg = allDiffs.reduce((s, d) => s + d.diff, 0) / allDiffs.length;
      check('リグ（仮のAI画像）とコード描画の差が小さい（平均 < 6%・最大 < 18%）', avg < 0.06 && worst[0].diff < 0.18, `平均 ${(avg * 100).toFixed(1)}% 最大 ${worst.map((d) => `${d.key}:${d.label} ${(d.diff * 100).toFixed(1)}%`).join(', ')}`);
      const holes = allDiffs.slice().sort((a, b) => b.hole - a.hole)[0];
      check('関節の隙間（コードにあってリグに無い画素）が小さい（< 6%）', holes.hole < 0.06, `${holes.key}:${holes.label} ${(holes.hole * 100).toFixed(1)}%`);

      // 全装備スタイル × ♀♂
      for (const g of ['f', 'm']) {
        const cases = [];
        const n = Math.max(...Object.values(STYLES).map((a) => a.length));
        for (let i = 0; i < n; i++) {
          const eq = {};
          for (const slot of Object.keys(STYLES)) { const st = STYLES[slot][i % STYLES[slot].length]; eq[slot] = { style: st }; }
          eq.weapon = { style: WEAPONS[i % WEAPONS.length] };
          cases.push({ cls: 'luna', g, eq, state: 'idle', t: 0.4, label: `${eq.top.style}/${eq.bottom.style}` });
          cases.push({ cls: 'luna', g, eq, state: 'walk', t: 0.2, label: `${eq.hat.style}/${eq.accessory.style}` });
        }
        const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 10, rh: 220, scale: 1.8, diff: true }), [cases]);
        await shot(page, `styles_${g}`);
        const w = r.diffs.slice().sort((a, b) => b.diff - a.diff)[0];
        check(`全スタイル（${g === 'f' ? '♀' : '♂'}）でコード描画との差が小さい（< 18%）`, w.diff < 0.18, `最大 ${w.label} ${(w.diff * 100).toFixed(1)}%`);
      }
      // 武器種 × 攻撃
      {
        const cases = [];
        for (const ws of WEAPONS) for (const at of [0, 0.15, 0.45, 0.75]) cases.push({ cls: 'jin', g: 'm', eq: { ...EQ.jin_m, weapon: { style: ws } }, state: 'attack', at, label: `${ws} ${at}` });
        const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 8, rh: 175, scale: 1.4, diff: true }), [cases]);
        await shot(page, 'weapons');
        const w = r.diffs.slice().sort((a, b) => b.diff - a.diff)[0];
        check('武器種 × 攻撃の進み（持ち手の位置・角度）がコード描画と合う（< 18%）', w.diff < 0.18, `最大 ${w.label} ${(w.diff * 100).toFixed(1)}%`);
      }
      // 色違い・破れ・フラッシュ・半透明・拡大・オーラ・AIでない頭
      {
        const cols = ['#ff6fb5', '#1d2b24', '#19f0ff', '#ffd23f', '#7a3dff', '#ffffff', '#16161e', '#d8283c'];
        const cases = cols.map((c) => ({ cls: 'luna', g: 'f', eq: { top: { style: 'hoodie', color: c, accent: '#3dff8a' }, bottom: { style: 'jeans', color: c }, shoes: { style: 'sneakers', color: c, accent: '#ff3dd2' }, weapon: { style: 'katana', color: c } }, state: 'idle', t: 0.4, label: 'color ' + c }));
        cases.push(...cols.slice(0, 2).map((c) => ({ cls: 'luna', g: 'f', eq: { top: { style: 'hoodie', color: c, accent: '#3dff8a' } }, state: 'idle', t: 0.4, noRig: true, label: 'code ' + c })));
        for (const d of [0, 0.3, 0.6, 0.8, 0.95]) cases.push({ cls: 'jin', g: 'm', eq: EQ.jin_m, state: 'walk', t: 0.15, dmg: d, label: 'dmg ' + d });
        for (const d of [0.6, 0.95]) cases.push({ cls: 'jin', g: 'm', eq: EQ.jin_m, state: 'walk', t: 0.15, dmg: d, noRig: true, label: 'code dmg ' + d });
        cases.push({ cls: 'luna', g: 'f', eq: EQ.luna_f, state: 'hurt', t: 0.05, flash: true, label: 'flash' });
        cases.push({ cls: 'luna', g: 'f', eq: EQ.luna_f, state: 'idle', alpha: 0.5, label: 'alpha 0.5' });
        cases.push({ cls: 'luna', g: 'f', eq: EQ.luna_f, state: 'idle', aura: '#ff3dd2', auraTier: 4, label: 'aura' });
        cases.push({ cls: 'luna', g: 'f', eq: { top: { style: 'tshirt', color: '#f4f4f4' } }, state: 'idle', look: { skin: '#8a5a40' }, label: 'skin dark' });
        cases.push({ cls: 'luna', g: 'f', eq: {}, state: 'idle', label: 'no equip' });
        const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 10, rh: 230, scale: 1.9, url: false }), [cases]);
        void r;
        await shot(page, 'colors_damage');
        const st = await page.evaluate(() => window.game.sprites.spriteStats().rig);
        check('色替えのキャッシュが働く（色ごとに作る）', st.recolors > 5 && st.recolors < 400, `recolors ${st.recolors} bakes ${st.bakes}`);
        // 色替えの検証: 基準色と同じ色は元の絵、違う色は色相が目標に近い
        const hue = await page.evaluate(async () => {
          const R = await import('./src/render/rig.js');
          const { renderRigCode } = await import('./src/render/character.js');
          const { RIG_PARTS, RIG_R, RIG_S } = await import('./src/render/rigLayout.js');
          const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
          const look = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
          // 胴の中央付近の画素の平均色（px,py = 支点, R = 1単位の px）
          const avg = (d, w, px, py, R) => {
            let r = 0, g = 0, b = 0, n = 0;
            for (let y = Math.floor(py - 16 * R); y < py - 4 * R; y++) for (let x = Math.floor(px - 5 * R); x < px - 1 * R; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
            return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
          };
          const res = {};
          for (const c of ['#ff6fb5', '#19f0ff', '#ffd23f', '#16161e', '#ffffff']) {
            const eq = { top: { style: 'hoodie', color: c, accent: '#ffffff' } };
            const p = R.rigPlanFor(look, eq).parts(0).torso;
            const rig = avg(p.cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.w, p.h).data, p.w, p.px, p.py, p.R);
            const cv = document.createElement('canvas'); cv.width = cv.height = 1024 * RIG_R / RIG_S;
            const x = cv.getContext('2d', { willReadFrequently: true });
            renderRigCode(x, 'f', look, eq, 'top', { scale: RIG_R });
            const k = RIG_R / RIG_S, T = RIG_PARTS.torso;
            const code = avg(x.getImageData(0, 0, cv.width, cv.height).data, cv.width, T.px * k, T.py * k, RIG_R);
            res[c] = { rig, code };
          }
          return res;
        });
        const dist = (a, b) => (a && b ? Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) : 999);
        const worstC = Object.entries(hue).map(([c, v]) => [c, dist(v.rig, v.code)]).sort((a, b) => b[1] - a[1]);
        check('色替え: 胴の平均色が、その色のコード描画の平均色に近い（差の合計 < 90）', worstC[0][1] < 90, worstC.map(([c, d]) => `${c}:${d} rig${JSON.stringify(hue[c].rig)} code${JSON.stringify(hue[c].code)}`).join(' '));
        const dedicated = await page.evaluate(async () => {
          const R = await import('./src/render/rig.js');
          const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
          const look = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
          return R.rigPlanFor(look, { top: { style: 'hoodie', color: '#1d2b24', accent: '#3dff8a' } }).uses.top;
        });
        check('色違い専用の絵（hoodie__1d2b24_f）が優先される', dedicated === 'top/hoodie__1d2b24_f', dedicated);
      }
      // ゲーム中（主人公がリグで描かれる・F2 で切替）
      await page.evaluate(() => window.__rigClear());
      await startPlay(page, 'luna', 'f');
      await sleep(500);
      const inGame = await page.evaluate(async () => {
        const { rigPlanOf, lastDrawnArgs } = await import('./src/render/character.js');
        const p = window.game.player;
        const d = lastDrawnArgs(p.anim);
        return { plan: !!(d && rigPlanOf(d.look, d.equip)), look: !!(d && d.look && d.look.classId), uses: d && rigPlanOf(d.look, d.equip) ? rigPlanOf(d.look, d.equip).uses : null };
      });
      check('ゲーム中の主人公の look に classId があり、リグのプランが作れる', inGame.look && inGame.plan, JSON.stringify(inGame));
      await shot(page, 'ingame_luna');
      const toggled = await page.evaluate(async () => {
        const S = window.game.sprites;
        const { rigPlanOf } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const look = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
        S.setSpriteMode('procedural'); const off = !!rigPlanOf(look, {});
        S.setSpriteMode('auto'); const on = !!rigPlanOf(look, {});
        return { off, on };
      });
      check('F2 の「コード描画」でリグを使わない・戻すと使う', !toggled.off && toggled.on, JSON.stringify(toggled));
      // 歩いて・ジャンプして数フレーム（例外なし）
      await page.keyboard.down('ArrowRight'); await sleep(500); await page.keyboard.press('Space'); await sleep(400); await page.keyboard.up('ArrowRight');
      await page.keyboard.press('KeyZ'); await sleep(300);
      await shot(page, 'ingame_luna_move');
      // 性能: 10人（リグ）とコード描画
      const perf = await page.evaluate(async () => {
        const { drawCharacter } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const x = cv.getContext('2d');
        const looks = ['luna', 'jin', 'hacker'].flatMap((c) => ['f', 'm'].map((g) => ({ ...DEFAULT_LOOKS[c][g], classId: c, gender: g })));
        const eqs = [{ top: { style: 'hoodie', color: '#ff6fb5' }, weapon: { style: 'knife' } }, { top: { style: 'leatherJacket', color: '#1d1d24' }, bottom: { style: 'jeans', color: '#3a5a8c' }, weapon: { style: 'bat' } }];
        const run = (noRig, frames) => {
          const t0 = performance.now();
          for (let f = 0; f < frames; f++) {
            x.clearRect(0, 0, 1280, 720);
            for (let i = 0; i < 10; i++) {
              const st = ['idle', 'walk', 'attack', 'jump', 'hurt'][i % 5];
              drawCharacter(x, 80 + i * 120, 300, looks[i % looks.length], eqs[i % 2], { state: st, t: f / 60 + i * 0.1, attackT: (f % 30) / 30, facing: i % 2 ? -1 : 1, noRig, damage: i === 3 ? 0.6 : 0 });
            }
          }
          return (performance.now() - t0) / frames;
        };
        run(false, 60); run(true, 60);   // 暖機（キャッシュ）
        return { rig: run(false, 240), code: run(true, 240) };
      });
      check('性能: 10人で 1フレーム < 8ms（リグ）', perf.rig < 8, `リグ ${perf.rig.toFixed(2)}ms / コード描画 ${perf.code.toFixed(2)}ms`);
      check('例外・コンソールエラーなし（通常）', errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ================================================================ ② ♂主人公・AIの頭と一緒
    console.log('\n② ♂主人公（ジン）のゲーム中・AIの頭と一緒');
    {
      const head = await (async () => {
        const p = await browser.newPage();
        const u = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 420); g.lineWidth = 8; g.strokeStyle = '#2a1430'; g.fillStyle = '#dde3ee'; g.beginPath(); g.ellipse(200, 200, 170, 175, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#f6d5be'; g.beginPath(); g.ellipse(210, 250, 130, 120, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#33c7e6'; g.beginPath(); g.ellipse(160, 250, 18, 30, 0, 0, 7); g.ellipse(260, 250, 18, 30, 0, 0, 7); g.fill(); return c.toDataURL('image/png'); });
        await p.close();
        return Buffer.from(u.split(',')[1], 'base64');
      })();
      const IM2 = { ...IMGS, 'heads/jin_m.png': head };
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push(m.text()); });
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      await page.route('**/assets/sprites/**', async (route) => {
        const rel = decodeURIComponent(new URL(route.request().url()).pathname.split('/assets/sprites/')[1] || '');
        if (rel === 'manifest.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...manifestFor(IMGS, 'ok'), heads: { jin_m: 'heads/jin_m.png' } }) });
        const b = IM2[rel];
        return b ? route.fulfill({ status: 200, contentType: 'image/png', body: b }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForFunction(() => window.game && window.game.sprites && window.__titleT, null, { timeout: 20000 });
      await preload(page);
      await page.evaluate(GRID_FN);
      const cases = STATES.map((s) => ({ ...s, cls: 'jin', g: 'm', eq: { ...EQ.jin_m, hat: { style: 'cap', color: '#2b2b38', accent: '#ff3d7f' }, accessory: { style: 'sunglasses' } } }));
      await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 8, rh: 330, scale: 2.4 }), [cases]);
      await shot(page, 'aihead_jin');
      await page.evaluate(() => window.__rigClear());
      await startPlay(page, 'jin', 'm');
      await sleep(400);
      await shot(page, 'ingame_jin');
      check('AIの頭＋リグ・ゲーム中（ジン）で例外なし', errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ================================================================ ③ フォールバック
    console.log('\n③ フォールバック');
    for (const mode of ['none', 'nobody', 'broken', 'slow', 'partial']) {
      const { page, ctx, errs } = await openGame(browser, mode, IMGS);
      await page.evaluate(GRID_FN);
      const probe = () => page.evaluate(async () => {
        const { rigPlanOf } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const look = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
        const p = rigPlanOf(look, { top: { style: 'hoodie', color: '#ff6fb5' }, bottom: { style: 'skirt', color: '#ff8ac8' }, weapon: { style: 'knife' } });
        return { plan: !!p, uses: p ? p.uses : null, st: window.game.sprites.spriteStats().rig };
      });
      const p0 = await probe();
      if (mode === 'slow') {
        check('slow: 読み込み中はコード描画（プラン無し）', !p0.plan, JSON.stringify(p0.st));
        await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 6, rh: 300, scale: 2.2 }), [STATES.slice(0, 6).map((s) => ({ ...s, cls: 'luna', g: 'f', eq: EQ.luna_f }))]);
        await sleep(3500);
      }
      await preload(page);
      const p1 = await probe();
      await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 6, rh: 300, scale: 2.2 }), [STATES.slice(0, 6).map((s) => ({ ...s, cls: 'luna', g: 'f', eq: EQ.luna_f }))]);
      await shot(page, 'fallback_' + mode);
      if (mode === 'none') check('none: manifest に rig が無い → コード描画', !p1.plan);
      if (mode === 'nobody') check('nobody: 素体が無い → コード描画', !p1.plan);
      if (mode === 'broken') check('broken: 素体が壊れている → コード描画（失敗を数える）', !p1.plan && p1.st.failed > 0, JSON.stringify(p1.st));
      if (mode === 'slow') check('slow: 読み込み完了でリグに切り替わる', p1.plan, JSON.stringify(p1.st));
      if (mode === 'partial') check('partial: 絵の無い装備（スカート）はコード描画の代用・ある物は絵', p1.plan && p1.uses.bottom === 'code' && p1.uses.top === 'top/hoodie_f' && p1.uses.weapon === 'weapon/knife', JSON.stringify(p1.uses));
      check(`${mode}: 例外・コンソールエラーなし`, errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\nrig: ${pass} passed, ${fail} failed`);
  if (fail) { for (const p of problems) console.log('  ✗ ' + p); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
