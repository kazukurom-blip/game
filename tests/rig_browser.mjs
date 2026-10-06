// 主人公のパーツ式（リグ）のブラウザテスト（Playwright）
//   node tests/rig_browser.mjs        （npm run test:rig）
// 仮のAI画像（骨格 v2 の下絵そのもの＝tools/rig_page.js の fake）を page.route で assets/sprites/rig/ に差し込み、
//  ① 全状態 × 装備 × ♀♂ × 色違い × 武器種 で、fit:false（配置図のまま）で組んだリグが「全部コードの代用パーツで組んだリグ（anim.rigCode）」と
//     画素で一致するか（つなぎ目・重なり順）。一部はわざとずらして fit:true（各パーツの上書き）で自動フィット
//  ② 持ち手の印（fit:false は必須・無ければ警告＋自動フィット）、色替え（陰影を残す）、服破れ、白フラッシュ、半透明、左右反転
//  ③ ゲーム中の主人公・F2 の切替・NPC には使わない・AIの頭（配置図方式の前の頭＋後ろ髪の揺れ・重なり順 / 旧方式 fit:true）
//  ④ 旧い配置図（layout 1）の古い絵の互換、フォールバック（素体なし / 読み込み中 / 壊れた画像 / 一部の装備だけ）、性能（10人）
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
    const fitTrue = [];
    for (const g of ['f', 'm']) {
      f[`body_${g}`] = T.fake('body', null, g, {});
      for (const slot of Object.keys(STYLES)) for (const st of STYLES[slot]) {
        // いろいろな「AIのずれ」: 一部は全体を少しずらす・枠ごとに少し大きく（→ そのパーツだけ fit:true）・透明背景・薄い灰色の背景
        const k = i++ % 5;
        const opts = k === 1 ? { shift: [26, -18] } : k === 2 ? { scale: 1.1, shift: [-10, 8] } : k === 3 ? { bg: null } : { bg: '#f4f4f0' };
        f[`${slot}/${st}_${g}`] = T.fake(slot, st, g, opts);
        if (k === 1 || k === 2) fitTrue.push(`${slot}/${st}_${g}`);
      }
      for (const n of [1, 2, 3]) f[`tear/${n}_${g}`] = T.fake('tear', String(n), g, { bg: null });
    }
    // 武器: 0 = 印あり（fit:false で正確）、1 = 印あり＋ずれ・拡大（fit:true）、2 = 印なし（fit:false → 警告＋自動フィット）
    WEAPONS.forEach((w, j) => {
      const m = j % 3;
      f[`weapon/${w}`] = T.fake('weapon', w, null, m === 0 ? { mark: true } : m === 1 ? { mark: true, shift: [20, 6], scale: 1.1 } : {});
      if (m === 1) fitTrue.push(`weapon/${w}`);
    });
    // 色違い専用（目印に緑がかった色で描く）
    f['top/hoodie__1d2b24_f'] = T.fake('top', 'hoodie', 'f', { color: '#1d2b24', accent: '#3dff8a' });
    // 頭（前の頭・後ろ髪）: 頭の配置図方式（コードの頭をそのまま）
    for (const [c, g] of [['luna', 'f'], ['jin', 'm'], ['hacker', 'f']]) {
      f[`heads/${c}_${g}`] = T.fakeHead(c, g, 'front', {});
      f[`heads/${c}_${g}_back`] = T.fakeHead(c, g, 'back', {});
    }
    // 重なり順の確認用: 一面の緑の後ろ髪
    { const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const x = cv.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 1024); x.fillStyle = '#00e040'; x.fillRect(112, 160, 800, 760); f['heads/green_back'] = cv.toDataURL('image/png'); }
    f.__fitTrue = JSON.stringify(fitTrue);
    return f;
  }, [STYLES, WEAPONS]);
  const old = await page.evaluate(async () => {
    const T = window.RIGTOOL, o = {};
    for (const g of ['f', 'm']) {
      o[`body_${g}`] = await T.fakeOld('body', null, g, {});
      o[`top/hoodie_${g}`] = await T.fakeOld('top', 'hoodie', g, {});
      o[`bottom/jeans_${g}`] = await T.fakeOld('bottom', 'jeans', g, {});
      o[`shoes/boots_${g}`] = await T.fakeOld('shoes', 'boots', g, {});
    }
    return o;
  });
  await page.close();
  const map = {};
  FIT_TRUE = JSON.parse(out.__fitTrue); delete out.__fitTrue;
  for (const [k, v] of Object.entries(out)) map[k.startsWith('heads/') ? `${k}.png` : `rig/${k}.png`] = Buffer.from(v.split(',')[1], 'base64');
  for (const [k, v] of Object.entries(old)) map[`rigold/${k}.png`] = Buffer.from(v.split(',')[1], 'base64');
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_body_f.png'), map['rig/body_f.png']);
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_hoodie_f.png'), map['rig/top/hoodie_f.png']);
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_old_body_f.png'), map['rigold/body_f.png']);
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_head_luna_f.png'), map['heads/luna_f.png']);
  fs.writeFileSync(path.join(SHOTS, 'rig_fake_head_luna_f_back.png'), map['heads/luna_f_back.png']);
  return map;
}
let FIT_TRUE = [];
function headImage() {
  // 簡単な頭の絵（白背景に丸い顔＋髪）
  return null;
}
void headImage;
function manifestFor(IMGS, mode) {
  const keys = Object.keys(IMGS).filter((k) => k.startsWith('rig/')).map((k) => k.slice(4, -4));
  if (mode === 'old') {
    // 旧い配置図の古い絵（fit も layout も書かない＝前からある manifest の形）
    const ok = Object.keys(IMGS).filter((k) => k.startsWith('rigold/')).map((k) => k.slice(7, -4));
    return { version: 1, rig: { enabled: true, parts: Object.fromEntries(ok.map((k) => [k, `rigold/${k}.png`])) } };
  }
  let list = keys;
  if (mode === 'nobody') list = keys.filter((k) => !k.startsWith('body'));
  if (mode === 'partial') list = ['body_f', 'body_m', 'top/hoodie_f', 'weapon/knife', 'top/missing_f'];
  const parts = {};
  for (const k of list) parts[k] = FIT_TRUE.includes(k) ? { fit: true } : true;
  return { version: 1, rig: { enabled: true, fit: false, parts } };
}

/** mode: 'ok' | 'none' | 'nobody' | 'broken' | 'slow' | 'partial' */
async function openGame(browser, mode, IMGS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  await page.route('**/assets/sprites/**', async (route) => {
    if (/webp\.json$/.test(route.request().url())) return route.fulfill({ status: 404, body: '' }); // 偽の manifest の時は WebP を使わない（PNG を差し替えて試すため）
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
    const an = { state: c.state || 'idle', t: c.t || 0, attackT: c.at || 0, scale: c.scale || sc, facing: c.facing || 1, damage: c.dmg || 0, flash: c.flash, alpha: c.alpha, aura: c.aura, auraTier: c.auraTier, deadT: c.state === 'dead' ? 1 : undefined, fallT: c.state === 'dead' ? (c.fall ?? 1) : undefined, noRig: c.noRig, rigCode: c.rigCode };
    drawCharacter(x, X, Y, look(c), c.eq || {}, an);
    x.fillStyle = '#fff'; x.fillText((c.label || c.state || '') .slice(0, 22), X - cw / 2 + 3, Y + 16);
    if (opts.diff && !c.flash && !(c.alpha < 1)) {
      ax.setTransform(1, 0, 0, 1, 0, 0); bx.setTransform(1, 0, 0, 1, 0, 0); ax.clearRect(0, 0, 200, 220); bx.clearRect(0, 0, 200, 220);
      const a1 = { ...an, scale: 1.5, facing: 1, noCache: true, aura: null };
      drawCharacter(ax, 100, 190, look(c), c.eq || {}, a1);
      // 基準: 絵を使わず全部コードの代用パーツで組んだリグ（同じ骨格 v2）
      drawCharacter(bx, 100, 190, look(c), c.eq || {}, { ...a1, noRig: false, rigCode: true });
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
      check('読み込み時の前処理: 1枚あたり平均 < 150ms', rs.prepMs / rs.loaded < 150, `平均 ${(rs.prepMs / rs.loaded).toFixed(0)}ms 最大 ${rs.prepMax.toFixed(0)}ms`);
      void loaded;
      const planOk = await page.evaluate(async () => {
        const { rigPlanOf } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const hero = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
        return { hero: !!rigPlanOf(hero, {}), npc: !!rigPlanOf({ ...DEFAULT_LOOKS.luna.f }, {}), vil: !!rigPlanOf({ ...hero, villain: true }, {}) };
      });
      check('主人公・NPC・悪役にリグ（rig.npcs 既定 true。false で主人公だけ = tests/npc_rig_browser.mjs）', planOk.hero && planOk.npc && planOk.vil, JSON.stringify(planOk));
      const allDiffs = [];
      for (const [key, eq] of Object.entries(EQ)) {
        const [cls, g] = key.split('_');
        const cases = [];
        for (const s of STATES) cases.push({ ...s, cls: cls === 'gun' ? 'jin' : cls, g, eq, facing: cases.length % 3 === 2 ? -1 : 1 });
        for (const s of STATES.slice(0, 5)) cases.push({ ...s, cls: cls === 'gun' ? 'jin' : cls, g, eq, rigCode: true, label: 'code ' + (s.label || s.state) });
        const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 10, rh: 230, scale: 1.9, diff: true }), [cases]);
        await shot(page, `states_${key}`);
        allDiffs.push(...r.diffs.filter((d) => !d.label.startsWith('code')).map((d) => ({ ...d, key })));
      }
      const worst = allDiffs.slice().sort((a, b) => b.diff - a.diff).slice(0, 4);
      const avg = allDiffs.reduce((s, d) => s + d.diff, 0) / allDiffs.length;
      check('fit:false のリグ（仮のAI画像）と、コードの代用パーツで組んだリグの差が小さい（平均 < 6%・最大 < 18%）', avg < 0.06 && worst[0].diff < 0.18, `平均 ${(avg * 100).toFixed(1)}% 最大 ${worst.map((d) => `${d.key}:${d.label} ${(d.diff * 100).toFixed(1)}%`).join(', ')}`);
      const holes = allDiffs.slice().sort((a, b) => b.hole - a.hole)[0];
      check('関節の隙間（代用パーツにあって絵のリグに無い画素）が小さい（< 6%）', holes.hole < 0.06, `${holes.key}:${holes.label} ${(holes.hole * 100).toFixed(1)}%`);

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
        check('武器種 × 攻撃の進み（持ち手の位置・角度）がコードの代用と合う（< 18%）', w.diff < 0.18, `最大 ${w.label} ${(w.diff * 100).toFixed(1)}%`);
        const fb = await page.evaluate(() => window.game.sprites.spriteStats().rig.fitFallback);
        const noMark = WEAPONS.filter((_, j) => j % 3 === 2).map((x) => 'weapon/' + x);
        check('武器: fit:false で持ち手の印が無い絵だけ警告＋自動フィット（印がある絵はそのまま）', noMark.every((k) => fb.includes(k)) && fb.every((k) => noMark.includes(k)), JSON.stringify(fb));
      }
      // fit:false（ずらしていない絵だけ）: ほぼ完全に一致（支点に関節が来る）
      {
        const exact = (slot, g) => STYLES[slot].filter((st) => !FIT_TRUE.includes(`${slot}/${st}_${g}`));
        const cases = [];
        for (const g of ['f', 'm']) {
          const W = WEAPONS.filter((w, j) => j % 3 === 0);
          for (let i = 0; i < 6; i++) {
            const eq = {};
            for (const slot of Object.keys(STYLES)) { const L = exact(slot, g); if (L.length) eq[slot] = { style: L[i % L.length] }; }
            eq.weapon = { style: W[i % W.length] };
            const s = STATES[(i * 3 + (g === 'm' ? 1 : 0)) % STATES.length];
            cases.push({ ...s, cls: g === 'f' ? 'luna' : 'jin', g, eq, label: `exact ${g} ${s.label || s.state}` });
          }
        }
        const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 6, rh: 330, scale: 2.2, diff: true }), [cases]);
        await shot(page, 'exact_fitfalse');
        const avg = r.diffs.reduce((a, d) => a + d.diff, 0) / r.diffs.length, w = r.diffs.slice().sort((a, b) => b.diff - a.diff)[0];
        check('fit:false の絵はコードの代用とほぼ同じ（平均 < 2%・最大 < 5%）', avg < 0.02 && w.diff < 0.05, `平均 ${(avg * 100).toFixed(2)}% 最大 ${w.label} ${(w.diff * 100).toFixed(2)}%`);
      }
      // 色違い・破れ・フラッシュ・半透明・拡大・オーラ・AIでない頭
      {
        const cols = ['#ff6fb5', '#1d2b24', '#19f0ff', '#ffd23f', '#7a3dff', '#ffffff', '#16161e', '#d8283c'];
        const cases = cols.map((c) => ({ cls: 'luna', g: 'f', eq: { top: { style: 'hoodie', color: c, accent: '#3dff8a' }, bottom: { style: 'jeans', color: c }, shoes: { style: 'sneakers', color: c, accent: '#ff3dd2' }, weapon: { style: 'katana', color: c } }, state: 'idle', t: 0.4, label: 'color ' + c }));
        cases.push(...cols.slice(0, 2).map((c) => ({ cls: 'luna', g: 'f', eq: { top: { style: 'hoodie', color: c, accent: '#3dff8a' } }, state: 'idle', t: 0.4, rigCode: true, label: 'code ' + c })));
        for (const d of [0, 0.3, 0.6, 0.8, 0.95]) cases.push({ cls: 'jin', g: 'm', eq: EQ.jin_m, state: 'walk', t: 0.15, dmg: d, label: 'dmg ' + d });
        for (const d of [0.6, 0.95]) cases.push({ cls: 'jin', g: 'm', eq: EQ.jin_m, state: 'walk', t: 0.15, dmg: d, rigCode: true, label: 'code dmg ' + d });
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

    // ================================================================ ② AIの頭（配置図方式＋後ろ髪 / 旧方式 fit:true）と一緒
    console.log('\n② AIの頭（配置図方式の前の頭＋後ろ髪・旧方式）＋リグ');
    {
      const head = await (async () => {
        const p = await browser.newPage();
        const u = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 420); g.lineWidth = 8; g.strokeStyle = '#2a1430'; g.fillStyle = '#dde3ee'; g.beginPath(); g.ellipse(200, 200, 170, 175, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#f6d5be'; g.beginPath(); g.ellipse(210, 250, 130, 120, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#33c7e6'; g.beginPath(); g.ellipse(160, 250, 18, 30, 0, 0, 7); g.ellipse(260, 250, 18, 30, 0, 0, 7); g.fill(); return c.toDataURL('image/png'); });
        await p.close();
        return Buffer.from(u.split(',')[1], 'base64');
      })();
      const IM2 = { ...IMGS, 'heads/old_m.png': head };
      const HEADS = {
        luna_f: { file: 'heads/luna_f.png', back: 'heads/luna_f_back.png' },
        jin_m: { file: 'heads/jin_m.png', back: 'heads/jin_m_back.png' },
        hacker_f: { file: 'heads/hacker_f.png', back: 'heads/green_back.png' },       // 重なり順の確認用（一面の緑の後ろ髪）
        jin_f: { file: 'heads/old_m.png', fit: true },                                 // 旧方式（範囲に収める）
        hacker_m: { file: 'heads/old_m.png' },                                          // 正方形でない絵 → 警告して旧方式
      };
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push(m.text()); });
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      await page.route('**/assets/sprites/**', async (route) => {
    if (/webp\.json$/.test(route.request().url())) return route.fulfill({ status: 404, body: '' }); // 偽の manifest の時は WebP を使わない（PNG を差し替えて試すため）
        const rel = decodeURIComponent(new URL(route.request().url()).pathname.split('/assets/sprites/')[1] || '');
        if (rel === 'manifest.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...manifestFor(IMGS, 'ok'), heads: HEADS }) });
        const b = IM2[rel];
        return b ? route.fulfill({ status: 200, contentType: 'image/png', body: b }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForFunction(() => window.game && window.game.sprites && window.__titleT, null, { timeout: 20000 });
      await preload(page);
      await page.evaluate(GRID_FN);
      const hi = await page.evaluate(() => {
        const S = window.game.sprites;
        const f = (c, g) => { const h = S.headFor(c, g); return h ? { fit: h.fit, place: h.place && h.place.map((v) => +v.toFixed(1)), back: !!h.back, bplace: h.back && h.back.place.map((v) => +v.toFixed(1)) } : null; };
        return { luna_f: f('luna', 'f'), jin_m: f('jin', 'm'), jin_f: f('jin', 'f'), hacker_m: f('hacker', 'm') };
      });
      check('頭: 配置図方式（fit:false 既定）で置き場所が決まり、後ろ髪も読める', hi.luna_f && hi.luna_f.fit === false && hi.luna_f.back && Math.abs(hi.luna_f.place[0] + hi.luna_f.place[2] / 2) < 6 && hi.jin_m && hi.jin_m.back, JSON.stringify(hi));
      check('頭: 旧方式（fit:true）・正方形でない絵（警告して旧方式）も読める', hi.jin_f && hi.jin_f.fit === true && !hi.jin_f.back && hi.hacker_m && hi.hacker_m.fit === true, JSON.stringify({ jin_f: hi.jin_f, hacker_m: hi.hacker_m }));
      // AIの頭（中身はコードの頭そのもの）と、コードの頭（aiHead:false）の差: 待機は一致するはず
      const hd = await page.evaluate(async () => {
        const { drawCharacter } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const res = {};
        for (const [c, g, eq] of [['luna', 'f', { top: { style: 'hoodie', color: '#ff6fb5' } }], ['jin', 'm', { top: { style: 'leatherJacket', color: '#1d1d24' } }]]) {
          const look = { ...DEFAULT_LOOKS[c][g], classId: c, gender: g };
          for (const st of [['idle', 0.3], ['walk', 0.15], ['jump', 0.2]]) {
            const cv = [0, 1].map(() => { const k = document.createElement('canvas'); k.width = 260; k.height = 300; return k; });
            const an = { state: st[0], t: st[1], scale: 2.6, noCache: true, aiHeadPlain: true };   // 画像の頭の首の振り（enterAiNeck）を止めて、置き場所だけを比べる
            drawCharacter(cv[0].getContext('2d'), 130, 280, look, eq, an);
            drawCharacter(cv[1].getContext('2d'), 130, 280, { ...look, aiHead: false }, eq, an);
            const d1 = cv[0].getContext('2d').getImageData(0, 0, 260, 300).data, d2 = cv[1].getContext('2d').getImageData(0, 0, 260, 300).data;
            let un = 0, bad = 0;
            for (let p = 0; p < d1.length; p += 4) {
              const o1 = d1[p + 3] > 100, o2 = d2[p + 3] > 100;
              if (!o1 && !o2) continue;
              un++;
              if (o1 !== o2 || Math.abs(d1[p] - d2[p]) + Math.abs(d1[p + 1] - d2[p + 1]) + Math.abs(d1[p + 2] - d2[p + 2]) > 160) bad++;
            }
            res[`${c}_${g} ${st[0]}`] = +(bad / un * 100).toFixed(1);
          }
        }
        return res;
      });
      // 待機はほぼ一致。歩き・ジャンプはコードの髪（毛束が曲がる）と後ろ髪の絵（結び目を中心に回る）で揺れ方が違う分だけ差が出る
      check('頭の配置図方式: コードの頭を描いた仮の頭＋後ろ髪が、コードの頭と同じ位置・大きさ（待機 < 6%・歩き/ジャンプ < 18%）',
        Object.entries(hd).every(([k, v]) => v < (k.endsWith('idle') ? 6 : 18)), JSON.stringify(hd));
      // 後ろ髪の二次運動（揺れ・ジャンプでふわっと）と重なり順（体の後ろ・顔の後ろ）
      const bh = await page.evaluate(async () => {
        const { paintAiHeadBack, drawCharacter } = await import('./src/render/character.js');
        const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
        const S = window.game.sprites;
        const h = S.headFor('luna', 'f');
        const draw = (P) => { const k = document.createElement('canvas'); k.width = k.height = 300; const x = k.getContext('2d'); x.translate(150, 120); x.scale(3, 3); paintAiHeadBack(x, h, null, P, false, 'rig'); return x.getImageData(0, 0, 300, 300).data; };
        const dif = (a, b) => { let n = 0; for (let i = 3; i < a.length; i += 4) if ((a[i] > 100) !== (b[i] > 100)) n++; return n; };
        const base = draw({ hairSway: 0, hairLift: 0 });
        const r = { sway: dif(base, draw({ hairSway: 0.9, hairLift: 0 })), lift: dif(base, draw({ hairSway: 0, hairLift: 1 })), same: dif(base, draw({ hairSway: 0, hairLift: 0 })) };
        // 重なり順: 一面の緑の後ろ髪（hacker_f）
        const k = document.createElement('canvas'); k.width = 300; k.height = 320; const x = k.getContext('2d');
        const s = 3, X = 150, Y = 300;
        drawCharacter(x, X, Y, { ...DEFAULT_LOOKS.hacker.f, classId: 'hacker', gender: 'f' }, { top: { style: 'tshirt', color: '#f4f4f4' } }, { state: 'idle', t: 0.3, scale: s, noCache: true });
        const px = (u, v) => { const d = x.getImageData(Math.round(X + u * s), Math.round(Y - v * s), 1, 1).data; return d[1] > 180 && d[0] < 80 && d[2] < 120 ? 'green' : 'other'; };
        r.order = { side: px(34, 44), torso: px(0, 36), face: px(1, 62), leg: px(3, 10) };
        return r;
      });
      check('後ろ髪の二次運動: 揺れ（hairSway）・ジャンプ（hairLift）で動く', bh.sway > 200 && bh.lift > 200 && bh.same === 0, JSON.stringify({ sway: bh.sway, lift: bh.lift, same: bh.same }));
      check('後ろ髪の重なり順: 体・顔の後ろ（横は見える）', bh.order.side === 'green' && bh.order.torso === 'other' && bh.order.face === 'other', JSON.stringify(bh.order));
      // 全状態 × 帽子（AIの頭＋後ろ髪 × 帽子の clip）
      const HATS = ['catEars', 'cap', 'beanie', 'helmet', 'cowboy', 'crown', 'headphones', 'bandana'];
      const cases = [];
      STATES.forEach((s, i) => cases.push({ ...s, cls: 'luna', g: 'f', eq: { ...EQ.luna_f, hat: { style: HATS[i % HATS.length] } }, label: `${s.label || s.state} ${HATS[i % HATS.length]}` }));
      STATES.slice(0, 9).forEach((s, i) => cases.push({ ...s, cls: 'jin', g: 'm', eq: { ...EQ.jin_m, hat: { style: HATS[(i + 3) % HATS.length] }, accessory: i % 2 ? { style: 'sunglasses' } : { style: 'mask' } }, label: `${s.label || s.state} ${HATS[(i + 3) % HATS.length]}` }));
      await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 8, rh: 240, scale: 2.0 }), [cases]);
      await shot(page, 'aihead_layout');
      const cases2 = STATES.slice(0, 8).map((s) => ({ ...s, cls: 'jin', g: 'f', eq: { ...EQ.jin_m, hat: { style: 'cap' } }, label: 'old fit:true ' + (s.label || s.state) }))
        .concat(STATES.slice(0, 8).map((s) => ({ ...s, cls: 'hacker', g: 'm', eq: EQ.hacker_f, label: 'non-square ' + (s.label || s.state) })));
      await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 8, rh: 300, scale: 2.2 }), [cases2]);
      await shot(page, 'aihead_old');
      await page.evaluate(() => window.__rigClear());
      await startPlay(page, 'jin', 'm');
      await sleep(400);
      await shot(page, 'ingame_jin');
      check('AIの頭＋リグ・ゲーム中（ジン）で例外なし', errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ================================================================ ③ 旧い配置図（layout 1）の古い絵
    console.log('\n③ 旧い配置図の古い絵（fit も layout も書かない manifest）');
    {
      const { page, ctx, errs } = await openGame(browser, 'old', IMGS);
      await page.evaluate(GRID_FN);
      await preload(page);
      const st = await page.evaluate(() => window.game.sprites.spriteStats().rig);
      check('旧形式: layout 1・自動フィットで全部読める', st.layout === 1 && st.fit === true && st.loaded === st.files && st.failed === 0, JSON.stringify({ layout: st.layout, fit: st.fit, loaded: st.loaded, files: st.files, w: st.warnings }));
      const cases = [];
      for (const g of ['f', 'm']) {
        const eq = { top: { style: 'hoodie', color: '#ff6fb5', accent: '#ffffff' }, bottom: { style: 'jeans', color: '#3a5a8c', accent: '#c9d6ea' }, shoes: { style: 'boots', color: '#2a2018', accent: '#8a8a8a' } };
        for (const s of STATES.slice(0, 11)) cases.push({ ...s, cls: g === 'f' ? 'luna' : 'jin', g, eq, label: 'old ' + (s.label || s.state) });
      }
      const r = await page.evaluate(([cases]) => window.__rigGrid(cases, { cols: 11, rh: 330, scale: 2.0, diff: true }), [cases]);
      await shot(page, 'old_layout');
      const avg = r.diffs.reduce((a, d) => a + d.diff, 0) / r.diffs.length, w = r.diffs.slice().sort((a, b) => b.diff - a.diff)[0];
      check('旧形式: 自動フィットで骨格 v2 に組める（コードの代用パーツとの差 平均 < 12%・最大 < 25%）', avg < 0.12 && w.diff < 0.25, `平均 ${(avg * 100).toFixed(1)}% 最大 ${w.label} ${(w.diff * 100).toFixed(1)}%`);
      check('旧形式: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ================================================================ ④ フォールバック
    console.log('\n④ フォールバック');
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
