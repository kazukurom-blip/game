// 主人公の立ち絵・頭の差し替え（manifest portraits / heads）のブラウザテスト（Playwright）
//   node tests/hero_art_browser.mjs        （npm run test:heroart）
// 仮のAI画像（ブラウザの canvas で白背景に顔・立ち絵を描いて PNG 化）を page.route で assets/sprites/ に差し替えて、
//  ① 立ち絵: 会話窓（顔欄・主人公の行）/ キャラ選択 / キャラ作成 / カットイン / 転職の祝福演出
//  ② 頭: ゲーム中の主人公（各状態・表情・帽子・アクセサリ・背面・フラッシュ・半透明・拡大）、NPC には出ない
//  画像が無い / 読み込み中 / 壊れている → 今まで通り（例外・コンソールエラーなし）、読み込み完了で再描画、性能
// スクショ: tests/screenshots/heroart_*.png
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8147;
const TPL = path.join(ROOT, 'assets', 'sprites_template');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/, /assets\/sprites\//, /\[sprites\]/, /404 \(Not Found\)/];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules_global', '/usr/local/lib/node_modules', '/usr/lib/node_modules']
    .filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright が見つかりません');
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
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
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `heroart_${name}.png`) });

// ---------------------------------------------------------------- 仮のAI画像（白背景）
async function genImages(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const out = await page.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.lineJoin = 'round'; g.lineCap = 'round'; return [c, g]; };
    const OL = '#2a1430';
    function eye(g, x, y, r, expr, iris) {
      g.lineWidth = r * 0.22; g.strokeStyle = OL;
      if (expr === 'blink' || expr === 'happy' || expr === 'smile') {
        g.beginPath();
        if (expr === 'blink') { g.moveTo(x - r, y); g.quadraticCurveTo(x, y + r * 0.5, x + r, y); } else { g.moveTo(x - r, y + r * 0.2); g.quadraticCurveTo(x, y - r * 0.9, x + r, y + r * 0.2); }
        g.stroke(); return;
      }
      if (expr === 'hurt') { g.beginPath(); g.moveTo(x - r, y - r * 0.6); g.lineTo(x + r * 0.6, y); g.lineTo(x - r, y + r * 0.6); g.stroke(); return; }
      const ry = expr === 'surprised' ? r * 1.3 : r * 1.15;
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, r * 0.85, ry, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = iris; g.beginPath(); g.ellipse(x, y + r * 0.15, r * 0.6, ry * 0.75, 0, 0, 7); g.fill();
      g.fillStyle = OL; g.beginPath(); g.ellipse(x, y + r * 0.2, r * 0.28, ry * 0.38, 0, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.35, r * 0.22, 0, 7); g.fill();
      if (expr === 'angry' || expr === 'shout') { g.lineWidth = r * 0.3; g.beginPath(); g.moveTo(x - r, y - ry - r * 0.6); g.lineTo(x + r, y - ry - r * 0.1); g.stroke(); }
      if (expr === 'sad') { g.lineWidth = r * 0.25; g.beginPath(); g.moveTo(x - r, y - ry - r * 0.1); g.lineTo(x + r, y - ry - r * 0.6); g.stroke(); }
    }
    function mouth(g, x, y, r, expr) {
      g.strokeStyle = OL; g.lineWidth = r * 0.12;
      g.beginPath();
      if (expr === 'shout' || expr === 'surprised') { g.fillStyle = '#b02a4a'; g.ellipse(x, y, r * (expr === 'shout' ? 0.75 : 0.4), r * (expr === 'shout' ? 0.6 : 0.45), 0, 0, 7); g.fill(); g.stroke(); return; }
      if (expr === 'hurt') { g.moveTo(x - r * 0.6, y); for (let i = 1; i <= 4; i++) g.lineTo(x - r * 0.6 + i * r * 0.3, y + (i % 2 ? -r * 0.15 : r * 0.15)); g.stroke(); return; }
      if (expr === 'happy' || expr === 'smile') { g.fillStyle = '#e04a6a'; g.moveTo(x - r * 0.6, y - r * 0.1); g.quadraticCurveTo(x, y + r * 0.9, x + r * 0.6, y - r * 0.1); g.closePath(); g.fill(); g.stroke(); return; }
      if (expr === 'sad') { g.moveTo(x - r * 0.45, y + r * 0.2); g.quadraticCurveTo(x, y - r * 0.25, x + r * 0.45, y + r * 0.2); g.stroke(); return; }
      g.moveTo(x - r * 0.4, y); g.quadraticCurveTo(x, y + r * 0.25, x + r * 0.4, y); g.stroke();
    }
    // 頭（首から上・右向き斜め前）。cx,cy=顔の中心
    function head(g, cx, cy, R, o, expr) {
      g.lineWidth = R * 0.04; g.strokeStyle = OL;
      // 後ろ髪（ツインテール/ウルフ）
      g.fillStyle = o.hair;
      if (o.twin) for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * R * 1.05, cy + R * 0.55, R * 0.32, R * 0.85, s * 0.25, 0, 7); g.fill(); g.stroke(); }
      g.beginPath(); g.ellipse(cx, cy - R * 0.1, R * 1.1, R * 1.08, 0, 0, 7); g.fill(); g.stroke();
      // 首
      g.fillStyle = o.skin; g.beginPath(); g.rect(cx - R * 0.22, cy + R * 0.8, R * 0.44, R * 0.4); g.fill(); g.stroke();
      // 顔
      g.beginPath(); g.moveTo(cx - R * 0.85, cy - R * 0.1); g.bezierCurveTo(cx - R * 0.85, cy + R * 0.6, cx - R * 0.2, cy + R * 0.98, cx + R * 0.1, cy + R * 0.98);
      g.bezierCurveTo(cx + R * 0.5, cy + R * 0.95, cx + R * 0.88, cy + R * 0.5, cx + R * 0.86, cy - R * 0.1); g.closePath();
      g.fillStyle = o.skin; g.fill(); g.stroke();
      // 頬
      g.fillStyle = 'rgba(255,110,150,0.35)'; g.beginPath(); g.ellipse(cx - R * 0.5, cy + R * 0.45, R * 0.18, R * 0.1, 0, 0, 7); g.ellipse(cx + R * 0.6, cy + R * 0.45, R * 0.15, R * 0.09, 0, 0, 7); g.fill();
      eye(g, cx - R * 0.32, cy + R * 0.12, R * 0.2, expr, o.eye);
      eye(g, cx + R * 0.4, cy + R * 0.12, R * 0.2, expr, o.eye);
      mouth(g, cx + R * 0.08, cy + R * 0.62, R * 0.3, expr);
      // 前髪
      g.fillStyle = o.hair; g.beginPath();
      g.moveTo(cx - R * 1.0, cy + R * 0.1); g.quadraticCurveTo(cx - R * 1.05, cy - R * 1.15, cx, cy - R * 1.12); g.quadraticCurveTo(cx + R * 1.05, cy - R * 1.1, cx + R * 0.98, cy + R * 0.05);
      for (let i = 0; i < 5; i++) { const x1 = cx + R * 0.98 - (i + 0.5) * R * 0.4, x2 = cx + R * 0.98 - (i + 1) * R * 0.4; g.lineTo(x1, cy - R * (i % 2 ? 0.25 : 0.42)); g.lineTo(x2, cy - R * 0.62); }
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = R * 0.06; g.beginPath(); g.arc(cx - R * 0.2, cy - R * 0.6, R * 0.5, -2.6, -1.9); g.stroke();
      if (o.label) { g.fillStyle = OL; g.font = `bold ${R * 0.22}px sans-serif`; g.textAlign = 'center'; g.fillText(o.label, cx, cy - R * 0.82); }
    }
    function portrait(o, expr) {
      const [c, g] = mk(560, 900);
      const cx = 280;
      g.lineWidth = 6; g.strokeStyle = OL;
      // 脚
      g.fillStyle = o.pants; for (const s of [-1, 1]) { g.beginPath(); g.rect(cx + s * 50 - 34, 560, 68, 300); g.fill(); g.stroke(); }
      g.fillStyle = '#ffffff'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 50, 865, 52, 24, 0, 0, 7); g.fill(); g.stroke(); }
      // 胴・腕
      g.fillStyle = o.top; g.beginPath(); g.moveTo(cx - 120, 330); g.lineTo(cx + 120, 330); g.lineTo(cx + 95, 600); g.lineTo(cx - 95, 600); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - 120, 335); g.lineTo(cx - 175, 560); g.lineTo(cx - 130, 570); g.lineTo(cx - 95, 400); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx + 120, 335); g.lineTo(cx + 190, 480); g.lineTo(cx + 150, 500); g.lineTo(cx + 95, 400); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = o.skin; g.beginPath(); g.arc(cx - 152, 575, 26, 0, 7); g.arc(cx + 178, 500, 26, 0, 7); g.fill();
      g.fillStyle = o.accent; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('★', cx, 470);
      head(g, cx, 200, 135, o, expr);
      g.fillStyle = OL; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(expr || 'base', cx, 660);
      return c.toDataURL('image/png');
    }
    function headImg(o, expr) {
      const [c, g] = mk(420, 440);
      head(g, 210, 225, 150, { ...o, label: expr || '' }, expr);
      return c.toDataURL('image/png');
    }
    const CH = {
      luna_f: { hair: '#ff6fb5', skin: '#ffe3d3', eye: '#ff3d8b', twin: true, top: '#7b2ff7', pants: '#3a2f6b', accent: '#ffd23f' },
      jin_m: { hair: '#cfd6e4', skin: '#f6d5be', eye: '#33c7e6', twin: false, top: '#2a2230', pants: '#3e5f9e', accent: '#19d3c5' },
    };
    const files = {};
    for (const [k, o] of Object.entries(CH)) {
      files[`portraits/${k}.png`] = portrait(o, null);
      for (const e of ['smile', 'angry', 'surprised', 'sad', 'shout']) files[`portraits/${k}_${e}.png`] = portrait(o, e);
      files[`heads/${k}.png`] = headImg(o, null);
      for (const e of ['blink', 'hurt', 'shout', 'happy']) files[`heads/${k}_${e}.png`] = headImg(o, e);
    }
    return files;
  });
  await ctx.close();
  const map = {};
  for (const [k, v] of Object.entries(out)) map[k] = Buffer.from(v.split(',')[1], 'base64');
  fs.writeFileSync(path.join(SHOTS, 'heroart_fake_head.png'), map['heads/luna_f.png']);
  fs.writeFileSync(path.join(SHOTS, 'heroart_fake_portrait.png'), map['portraits/luna_f.png']);
  return map;
}
function manifestFor() {
  const m = { version: 1, portraits: {}, heads: {} };
  for (const k of ['luna_f', 'jin_m']) {
    m.portraits[k] = { file: `portraits/${k}.png`, expr: Object.fromEntries(['smile', 'angry', 'surprised', 'sad', 'shout'].map((e) => [e, `portraits/${k}_${e}.png`])) };
    // この仮の頭は旧方式（首から上を画像いっぱいに描いた絵）→ fit:true（範囲に収める）。配置図方式（fit:false 既定）は tests/rig_browser.mjs ②
    m.heads[k] = { file: `heads/${k}.png`, expr: Object.fromEntries(['blink', 'hurt', 'shout', 'happy'].map((e) => [e, `heads/${k}_${e}.png`])), scale: 1, offset: [0, 0], fit: true };
  }
  return m;
}

/** mode: 'ok' | 'none' | 'broken' | 'slow' */
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
      let m = mode === 'none' ? { version: 1 } : manifestFor();
      if (mode === 'layers') m = { ...JSON.parse(fs.readFileSync(path.join(TPL, 'manifest.json'), 'utf8')), heads: manifestFor().heads };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) });
    }
    if (mode === 'layers' && !IMGS[rel]) {
      const f = path.join(TPL, rel);
      if (!f.startsWith(TPL) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(f) });
    }
    if (mode === 'broken') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('not a png at all') });
    if (mode === 'slow') await sleep(2500);
    const b = IMGS[rel];
    if (!b) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: b });
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.game && window.game.sprites && window.__titleT, null, { timeout: 20000 });
  await sleep(300);
  return { page, ctx, errs };
}
async function startPlay(page, classId = 'luna', gender = 'f', look) {
  await page.evaluate(([c, g, l]) => { window.game._titleQuick = { slot: 0, create: { classId: c, gender: g, name: 'テスト', look: l || undefined } }; }, [classId, gender, look || null]);
  await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
  await page.evaluate(() => { const g = window.game; g.debug.god = true; g.enemies.length = 0; if (g.spawner) g.spawner.timers = g.spawner.timers.map(() => -1e9); });
  await sleep(400);
}

/** 主人公をいろいろな状態で並べた表（オーバーレイの canvas）を描いて dataURL と頭まわりの画素指紋を返す */
async function drawGrid(page, label) {
  return page.evaluate(async (label) => {
    const { drawCharacter } = await import('./src/render/character.js');
    const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
    const g = window.game, st = g.state;
    const look = st.look;
    const base = (await import('./src/ui/deps.js')).equipLooks(st);
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#2a2340';
    document.body.appendChild(c);
    const x = c.getContext('2d');
    x.fillStyle = '#3a3150'; x.fillRect(0, 0, 1280, 720);
    x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.fillText(label, 10, 18);
    const items = [
      ['idle', {}, { t: 0.3 }], ['blink', {}, { state: 'idle', t: 3.9 }], ['walk', {}, { state: 'walk', t: 0.2 }], ['jump', {}, { state: 'jump', t: 0.1 }],
      ['attack', {}, { state: 'attack', attackT: 0.5 }], ['hurt', {}, { state: 'hurt', t: 0.1 }], ['climb', {}, { state: 'climb', t: 0.2 }], ['dead', {}, { state: 'dead', fallT: 1, deadT: 1 }],
      ['happy', {}, { headExpr: 'happy', t: 0.3 }], ['flash', {}, { flash: true, t: 0.3 }], ['alpha', {}, { alpha: 0.5, t: 0.3 }], ['left', {}, { facing: -1, t: 0.3 }],
      ['cap', { hat: { style: 'cap' } }, {}], ['beanie', { hat: { style: 'beanie' } }, {}], ['helmet', { hat: { style: 'helmet' } }, {}], ['cowboy', { hat: { style: 'cowboy' } }, {}],
      ['crown', { hat: { style: 'crown' } }, {}], ['catEars', { hat: { style: 'catEars' } }, {}], ['shades', { accessory: { style: 'sunglasses' } }, {}], ['mask', { accessory: { style: 'mask' } }, {}],
      ['halo', { accessory: { style: 'halo' } }, {}], ['wings', { accessory: { style: 'wings' } }, {}], ['dmg80', {}, { damage: 0.8 }], ['aiHead:false', {}, { off: true }],
    ];
    items.forEach(([name, eq, o], i) => {
      const cx = 60 + (i % 12) * 102, cy = 150 + Math.floor(i / 12) * 150;
      const lk = o.off ? { ...look, aiHead: false, classId: look.classId, gender: look.gender } : look;
      drawCharacter(x, cx, cy, lk, { ...base, ...eq }, { state: 'idle', t: 0.3, facing: 1, scale: 1.25, ...o });
      x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.textAlign = 'center'; x.fillText(name, cx, cy + 20);
    });
    // 拡大（キャッシュ外のベクター描画）・NPC（同じ見た目・classId なし）
    drawCharacter(x, 200, 690, look, base, { state: 'idle', t: 0.3, facing: 1, scale: 3.4 });
    x.fillStyle = '#fff'; x.fillText('scale 3.4', 200, 710);
    drawCharacter(x, 470, 690, look, base, { state: 'attack', attackT: 0.4, facing: 1, scale: 3.4 });
    const npcLook = { ...DEFAULT_LOOKS[st.heroId][st.gender] };   // classId なし = NPC 扱い
    drawCharacter(x, 760, 690, npcLook, base, { state: 'idle', t: 0.3, facing: 1, scale: 3.4 });
    x.fillStyle = '#fff'; x.fillText('NPC（同じ見た目・classId なし）→ コード描画', 760, 710);
    drawCharacter(x, 1060, 690, look, { ...base, hat: { style: 'cap' }, accessory: { style: 'sunglasses' } }, { state: 'idle', t: 0.3, facing: -1, scale: 3.4 });
    const url = c.toDataURL('image/png');
    c.remove();
    return url;
  }, label);
}
/** look で描いた頭まわりの画素の平均色（読み込み前後・ON/OFF の比較用） */
function headSig(page, lookOverride) {
  return page.evaluate(async (lo) => {
    const { drawCharacter } = await import('./src/render/character.js');
    const st = window.game.state;
    const look = lo ? { ...st.look, ...lo, classId: st.look.classId, gender: st.look.gender } : st.look;
    const c = document.createElement('canvas'); c.width = 120; c.height = 120;
    const x = c.getContext('2d');
    drawCharacter(x, 60, 115, look, {}, { state: 'idle', t: 0.3, facing: 1, scale: 1 });   // キャッシュ経路
    const d = x.getImageData(30, 20, 60, 40).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n), n] : [0, 0, 0, 0];
  }, lookOverride || null);
}
const sigDiff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) / 10;

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  const IMGS = await genImages(browser);
  console.log(`仮のAI画像 ${Object.keys(IMGS).length} 枚`);

  // ================================================================ 画像あり
  console.log('\n[ok]');
  {
    const { page, ctx, errs } = await openGame(browser, 'ok', IMGS);
    await page.evaluate(() => window.game.sprites.preloadSprites());
    const st0 = await page.evaluate(() => window.game.sprites.spriteStats());
    check('ok: manifest の立ち絵・頭を全部読み込み（背景除去・トリミング）', st0.manifest === 'ok' && st0.failed === 0 && st0.loaded === st0.entries && st0.entries === 22, `${st0.loaded}/${st0.entries} failed ${st0.failed}`);
    const info = await page.evaluate(() => { const S = window.game.sprites; const h = S.headFor('luna', 'f'), p = S.portraitFor('luna_f', undefined, 'smile'), p2 = S.portraitFor('luna', 'f', 'nope'); return { h: h && [h.w, h.h, h.expr], p: p && [p.w, p.h, p.expr], p2: p2 && p2.expr, none: S.portraitFor('hacker', 'f'), blink: S.headFor('luna', 'f', 'blink')?.expr, alias: S.headFor('jin', 'm', 'smile')?.expr }; });
    check('ok: portraitFor/headFor（表情・別名・無い表情は基本の絵・無いキャラは null）', info.h && info.h[1] <= 320 && info.p && info.p[2] === 'smile' && info.p2 === null && info.none === null && info.blink === 'blink' && info.alias === 'happy', JSON.stringify(info));
    // トリミングで白背景が消えている（四隅が透明）
    const corner = await page.evaluate(() => { const h = window.game.sprites.headFor('luna', 'f'); const d = h.canvas.getContext('2d').getImageData(0, 0, 1, 1).data; return d[3]; });
    check('ok: 白背景が透明になっている', corner === 0, 'alpha ' + corner);

    // ---- タイトル: キャラ作成（新規）
    await page.keyboard.press('Enter');          // タイトル → （スロット無し）作成
    await sleep(500);
    await frames(page, 5);
    await shot(page, 'create_class');
    await page.keyboard.press('Enter'); await sleep(400); await frames(page, 5);
    await shot(page, 'create_gender');
    await page.keyboard.press('Enter'); await sleep(450); await frames(page, 5);
    const tc = await page.evaluate(() => { const T = window.__titleT(); return { step: T.c.step, row: T.c.row, ai: T.c.look.aiHead }; });
    await shot(page, 'create_look_ai_on');
    const hairBefore = await page.evaluate(() => window.__titleT().c.look.hair);
    await page.keyboard.press('ArrowDown'); await frames(page, 3);
    const rowAfterDown = await page.evaluate(() => window.__titleT().c.row);
    await page.keyboard.press('ArrowRight'); await frames(page, 3);   // 瞳の色の行（髪型・髪色は無効で飛ばす）
    const hairAfter = await page.evaluate(() => window.__titleT().c.look.hair);
    check('作成: 頭の画像があると「AIの顔」行（既定ON）・髪型/髪色は無効で飛ばす', tc.step === 2 && tc.row === 0 && tc.ai !== false && rowAfterDown === 3 && hairBefore === hairAfter, JSON.stringify({ tc, rowAfterDown, hairBefore, hairAfter }));
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); await sleep(600); await frames(page, 5);  // AIの顔 → OFF
    const off = await page.evaluate(() => window.__titleT().c.look.aiHead);
    await shot(page, 'create_look_ai_off');
    check('作成: 「AIの顔を使う」を OFF に切替', off === false, String(off));
    await page.keyboard.press('ArrowRight'); await sleep(600); await frames(page, 3);   // ON に戻す
    await page.keyboard.press('ArrowDown'); await frames(page, 2);                        // （AIの顔の行で Enter は切替なので）瞳の色へ
    await page.keyboard.press('Enter'); await sleep(400); await frames(page, 5);
    await shot(page, 'create_name');
    // 作成完了 → state.look.aiHead
    await page.evaluate(() => { const T = window.__titleT(); T._finish = true; });
    await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
    await page.evaluate(() => { const g = window.game; g.debug.god = true; g.enemies.length = 0; if (g.spawner) g.spawner.timers = g.spawner.timers.map(() => -1e9); });
    await sleep(500);
    const lk = await page.evaluate(() => { const l = window.game.state.look; return { ai: l.aiHead, c: l.classId, g: l.gender, keys: Object.keys(l).includes('classId') }; });
    check('作成: state.look.aiHead=true を保存・look.classId/gender（列挙されない）', lk.ai === true && lk.c === 'luna' && lk.g === 'f' && !lk.keys, JSON.stringify(lk));

    // ---- ゲーム中
    await frames(page, 10);
    await shot(page, 'play');
    const gridUrl = await drawGrid(page, 'luna ♀ — AIの頭（各状態・表情・帽子・アクセサリ・背面・フラッシュ・半透明・拡大）');
    fs.writeFileSync(path.join(SHOTS, 'heroart_head_grid_luna.png'), Buffer.from(gridUrl.split(',')[1], 'base64'));
    const sOn = await headSig(page), sOff = await headSig(page, { aiHead: false });
    check('頭: aiHead ON と OFF で頭の見た目が違う（OFF はコード描画）', sigDiff(sOn, sOff) > 20, JSON.stringify({ sOn, sOff }));
    const npcSame = await page.evaluate(async () => {
      const { drawCharacter } = await import('./src/render/character.js');
      const { DEFAULT_LOOKS } = await import('./src/data/classes.js');
      const S = window.game.sprites;
      const draw = () => { const c = document.createElement('canvas'); c.width = 100; c.height = 110; drawCharacter(c.getContext('2d'), 50, 105, { ...DEFAULT_LOOKS.luna.f }, {}, { state: 'idle', t: 0.3, scale: 1, noCache: true }); return c.toDataURL(); };
      const a = draw(); S.setSpriteMode('procedural'); const b = draw(); S.setSpriteMode('auto');
      return a === b;
    });
    check('頭: NPC（classId なし）には適用しない（コード描画と同じ画素）', npcSame);
    // 表情: 被弾・攻撃・まばたき・レベルアップ
    const ex = await page.evaluate(async () => {
      const C = await import('./src/render/character.js');
      const l = window.game.state.look;
      const f = (st, t, a) => C.aiHeadOf(l, a || {}, st, t)?.expr ?? null;
      const p = window.game.player;
      window.game.events.emit('levelUp', { level: 2 });
      p.updateAnim(0.016);
      return { idle: f('idle', 0.3), blink: f('idle', 3.9), hurt: f('hurt', 0.1), atk: f('attack', 0), shoot: f('shoot', 0), happy: f('idle', 0.3, { headExpr: 'happy' }), lvl: p.anim.headExpr };
    });
    check('頭の表情: 基本/blink/hurt/shout/happy・レベルアップで happy', ex.idle === null && ex.blink === 'blink' && ex.hurt === 'hurt' && ex.atk === 'shout' && ex.shoot === 'shout' && ex.happy === 'happy' && ex.lvl === 'happy', JSON.stringify(ex));
    // 実際のゲーム画面で各状態
    for (const [nm, fn] of [['play_attack', (p) => { p.attackLeft = 0.3; p.attackDur = 0.4; p.attackT = 0.4; }], ['play_hurt', (p) => { p.hurtT = 0.3; }]]) {
      await page.evaluate(`(${fn.toString()})(window.game.player)`);
      await frames(page, 2);
      await page.screenshot({ path: path.join(SHOTS, `heroart_${nm}.png`), clip: { x: 340, y: 220, width: 600, height: 400 } });
    }
    // 性能: キャッシュ経路で 400 体（AIの頭 あり / なし）
    const perf = await page.evaluate(async () => {
      const { drawCharacter } = await import('./src/render/character.js');
      const st = window.game.state, l = st.look, lOff = { ...l, aiHead: false };
      const eq = (await import('./src/ui/deps.js')).equipLooks(st);
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const x = c.getContext('2d');
      const run = (lk) => { const t0 = performance.now(); for (let k = 0; k < 4; k++) for (let i = 0; i < 100; i++) drawCharacter(x, (i % 20) * 60 + 30, 100 + Math.floor(i / 20) * 120, lk, eq, { state: i % 2 ? 'walk' : 'idle', t: (i * 0.05) % 4.8, scale: 1, facing: i % 3 ? 1 : -1 }); return performance.now() - t0; };
      const { characterCacheStats, aiHeadOf } = await import('./src/render/character.js');
      for (let k = 0; k < 6; k++) { run(l); run(lOff); }   // キャッシュを温める（1フレームの新規作成数に上限があるので数回）
      const c0 = { ...characterCacheStats() };
      const on = Math.min(run(l), run(l), run(l)), off = Math.min(run(lOff), run(lOff), run(lOff));
      const c1 = characterCacheStats();
      const t0 = performance.now(); for (let i = 0; i < 10000; i++) aiHeadOf(l, {}, 'idle', i * 0.01); const per = (performance.now() - t0) / 10000 * 1000;
      return { on: +on.toFixed(2), off: +off.toFixed(2), builds: c1.build - c0.build, direct: c1.direct - c0.direct, aiHeadOfUs: +per.toFixed(2) };
    });
    check('性能: 400体の描画（キャッシュ経路）で AIの頭 ありが なしの 1.5倍以内', perf.on <= perf.off * 1.5 + 2, JSON.stringify(perf));

    // ---- 会話窓（主人公の顔欄・主人公の行）
    await page.evaluate(() => {
      const g = window.game;
      const npc = (g.npcs || []).find((n) => n.data?.dialog?.length || n.dialog?.length) || g.npcs?.[0];
      // 会話の窓は、クエスト・ショップのある NPC だと最初に項目の一覧を出すので、セリフだけの NPC にする（id・shop は付けない）
      const data = { title: npc?.title || npc?.data?.title, equip: npc?.equip || npc?.data?.equip, name: npc?.name || npc?.data?.name || 'テストNPC', look: npc?.look || npc?.data?.look, dialog: ['よう、調子はどうだ？', '@me: ばっちり！ ありがとう♪', '@me：えっ、本当に！？'] };
      g.ui.open('dialog', { npc: data });
    });
    await sleep(500); await frames(page, 20);
    await page.evaluate(() => { const w = window.game.ui.wins.dialog; w.chars = 999; });
    await frames(page, 3);
    await shot(page, 'dialog_npc_line');
    await page.evaluate(() => { const w = window.game.ui.wins.dialog; w.li = 1; w.chars = 999; });
    await frames(page, 3);
    const who = await page.evaluate(() => { const w = window.game.ui.wins.dialog; return { who: w.who, line: w.lines[1] }; });
    check('会話: "@me:" の行は主人公の行（プレフィクスは表示しない）', who.who?.[1] === 'me' && who.who?.[0] === null && who.line === 'ばっちり！ ありがとう♪', JSON.stringify(who));
    await shot(page, 'dialog_hero_line');
    await page.evaluate(() => { const w = window.game.ui.wins.dialog; w.li = 2; w.chars = 999; });
    await frames(page, 3);
    await shot(page, 'dialog_hero_surprised');
    await page.evaluate(() => { const w = window.game.ui.wins.dialog; w.li = w.lines.length - 1; w.chars = 999; window.game.ui.close('dialog'); });
    await frames(page, 3);

    // ---- カットイン（奥義=shout）・転職の祝福演出（smile）
    await page.evaluate(async () => { const { pushCutin } = await import('./src/render/cutin.js'); pushCutin(window.game, { name: 'ギャラクシー・ショット', line: 'いっけぇー！' }); });
    await sleep(380);
    await shot(page, 'cutin_skill');
    await sleep(900);
    await page.evaluate(async () => { const { pushCutin } = await import('./src/render/cutin.js'); pushCutin(window.game, { name: 'ネオン・ガンナー', expr: 'smile', line: '「ガンナー」の名にかけて！' }); });
    await sleep(380);
    await shot(page, 'cutin_job');
    await sleep(900);
    await page.evaluate(async () => { const { JOBS } = await import('./src/data/jobs.js'); window.game.ui.jobFx = { t: 1.2, life: 6, job: JOBS.luna_gunner, tier: 1 }; });
    await sleep(200); await frames(page, 4);
    await shot(page, 'jobfx');
    await page.evaluate(() => { window.game.ui.jobFx = null; });

    // ---- キャラ選択（スロットのプレビュー）
    await page.evaluate(() => window.game.returnToTitle());
    await sleep(600); await frames(page, 8);
    await shot(page, 'select');

    // ---- ♂ jin（2スロット目）: 作成 → ゲーム中の表
    await page.evaluate(() => { localStorage.clear(); });
    await page.evaluate(() => { window.game._titleQuick = { slot: 1, create: { classId: 'jin', gender: 'm', name: 'ジンテスト' } }; });
    await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
    await sleep(500);
    const jl = await page.evaluate(() => ({ ai: window.game.state.look.aiHead, c: window.game.state.look.classId }));
    check('jin ♂: _titleQuick（aiHead 未指定）でも既定で AIの頭', jl.c === 'jin' && jl.ai !== false, JSON.stringify(jl));
    const gridJ = await drawGrid(page, 'jin ♂ — AIの頭');
    fs.writeFileSync(path.join(SHOTS, 'heroart_head_grid_jin.png'), Buffer.from(gridJ.split(',')[1], 'base64'));
    await frames(page, 5);
    await shot(page, 'play_jin');
    check('ok: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ================================================================ 画像なし / 壊れている
  for (const mode of ['none', 'broken']) {
    console.log(`\n[${mode}]`);
    const { page, ctx, errs } = await openGame(browser, mode, IMGS);
    await page.evaluate(() => window.game.sprites.preloadSprites());
    await startPlay(page);
    await page.evaluate(() => window.game.sprites.preloadSprites());
    const r = await page.evaluate(() => { const S = window.game.sprites; return { h: S.headFor('luna', 'f'), p: S.portraitFor('luna', 'f'), st: S.heroArtState('heads', 'luna', 'f') }; });
    check(`${mode}: 頭・立ち絵は null（状態 ${mode === 'none' ? 0 : 3}）`, r.h === null && r.p === null && r.st === (mode === 'none' ? 0 : 3), JSON.stringify(r));
    const same = await page.evaluate(async () => {
      const { drawCharacter } = await import('./src/render/character.js');
      const S = window.game.sprites, l = window.game.state.look;
      const draw = () => { const c = document.createElement('canvas'); c.width = 100; c.height = 110; drawCharacter(c.getContext('2d'), 50, 105, l, {}, { state: 'idle', t: 0.3, scale: 1, noCache: true }); return c.toDataURL(); };
      const a = draw(); S.setSpriteMode('procedural'); const b = draw(); S.setSpriteMode('auto');
      return a === b;
    });
    check(`${mode}: 主人公は今まで通りコード描画（画素一致）`, same);
    const grid = await drawGrid(page, `画像 ${mode} → 今まで通り`);
    fs.writeFileSync(path.join(SHOTS, `heroart_head_grid_${mode}.png`), Buffer.from(grid.split(',')[1], 'base64'));
    await page.evaluate(() => window.game.ui.open('dialog', { npc: { name: 'テストNPC', dialog: ['やあ', '@me: こんにちは'] } }));
    await sleep(400); await frames(page, 5);
    await page.evaluate(() => { const w = window.game.ui.wins.dialog; w.li = 1; w.chars = 999; });
    await frames(page, 3);
    await shot(page, `dialog_${mode}`);
    await page.evaluate(() => window.game.ui.close('dialog'));
    await page.evaluate(() => window.game.returnToTitle());
    await sleep(500); await frames(page, 5);
    await shot(page, `select_${mode}`);
    check(`${mode}: 例外・コンソールエラーなし`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ================================================================ 読み込み中 → 完了で再描画
  console.log('\n[slow]');
  {
    const { page, ctx, errs } = await openGame(browser, 'slow', IMGS);
    await startPlay(page);
    const s0 = await page.evaluate(() => window.game.sprites.heroArtState('heads', 'luna', 'f'));
    const sigLoading = await headSig(page);
    const sigOff = await headSig(page, { aiHead: false });
    await shot(page, 'slow_loading');
    await page.waitForFunction(() => window.game.sprites.heroArtState('heads', 'luna', 'f') === 2, null, { timeout: 15000 });
    await sleep(300); await frames(page, 5);
    const sigLoaded = await headSig(page);
    await shot(page, 'slow_loaded');
    check('slow: 読み込み中はコード描画（OFF と同じ）', s0 === 1 && sigDiff(sigLoading, sigOff) < 1, JSON.stringify({ s0, sigLoading, sigOff }));
    check('slow: 読み込み完了で（2xキャッシュも）AIの頭に切り替わる', sigDiff(sigLoaded, sigLoading) > 20, JSON.stringify({ sigLoaded }));
    check('slow: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ================================================================ 人型レイヤーのスプライト（テンプレート）＋頭の絵
  if (fs.existsSync(path.join(TPL, 'manifest.json'))) {
    console.log('\n[layers]');
    const { page, ctx, errs } = await openGame(browser, 'layers', IMGS);
    await startPlay(page);
    await page.evaluate(() => window.game.sprites.preloadSprites());
    await frames(page, 5);
    const sOn = await headSig(page), sOff = await headSig(page, { aiHead: false });
    check('layers: 人型スプライトでも頭の絵に置き換わる（OFF はスプライトの髪・顔）', sigDiff(sOn, sOff) > 20, JSON.stringify({ sOn, sOff }));
    const grid = await drawGrid(page, '人型レイヤーのスプライト（テンプレート）＋AIの頭');
    fs.writeFileSync(path.join(SHOTS, 'heroart_head_grid_layers.png'), Buffer.from(grid.split(',')[1], 'base64'));
    check('layers: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  } else console.log('\n[layers] assets/sprites_template が無いので省略');

  await browser.close();
  srv.close();
  console.log(`\nheroart: ${pass} passed, ${fail} failed`);
  if (fail) { console.log(problems.map((p) => ' - ' + p).join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
