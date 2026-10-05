// 顔・髪の分割方式（manifest faces / hairs / faceBase。顔 + 前髪 + 後ろ髪の3枚重ね）のブラウザテスト（Playwright）
//   node tests/face_hair_browser.mjs        （npm run test:facehair）
// 仮の絵（頭の配置図 1024×1024・支点 (512,400)・基準色で塗った顔・前髪・後ろ髪）をブラウザの canvas で作り、
// page.route で assets/sprites/heads/face/・heads/hair/ に差し込む（assets/ には置かない）。manifest は本物に faces/hairs を足す。
//  ① 絵が無い（今の manifest）: 今まで通り（heads の1枚の頭 / コードの頭）・キャラ作成に「顔」行が出ない
//  ② 絵あり: 重ね頭になる・色替え（髪・肌・瞳。線の色は残る）・絵の無い髪型は今まで通り・キャッシュのキー・キャラ作成の「顔」行
//  ③ 読み込み中は今まで通り → 読み込み完了で重ね頭
// スクショ: tests/screenshots/facehair_*.png（SHOTS_DIR で変更可）
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8149;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/, /assets\/sprites\//, /\[sprites\]/, /\[rig\]/, /404 \(Not Found\)/];

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
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `facehair_${name}.png`) });
const saveUrl = (name, url) => fs.writeFileSync(path.join(SHOTS, `facehair_${name}.png`), Buffer.from(url.split(',')[1], 'base64'));

const FACES = { f: ['f_01', 'f_02', 'f_03'], m: ['m_01', 'm_02', 'm_03'] };
const HAIRS = { f: ['twin', 'ponytail', 'bob'], m: ['short', 'wolf', 'spiky'] };
const EXPRS = ['blink', 'hurt', 'shout', 'happy'];

// ---------------------------------------------------------------- 仮の絵（頭の配置図・基準色）
async function genImages(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const out = await page.evaluate(([FACES, HAIRS, EXPRS]) => {
    const OL = '#2a1430', SKIN = { f: '#ffe3d3', m: '#f6d5be' }, SKIN_SH = { f: '#f2c4b0', m: '#e6b89c' }, EYE = '#6a5cff', HAIR = '#b07850', HAIR_SH = '#8a5532', HAIR_HI = '#d49c70';
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 8; g.strokeStyle = OL; return [c, g]; };
    // 共通の頭の形（右向き斜め前）: 頭頂 y=220・顎 y=560・目 y≈450・支点 (512,400)
    function skull(g) {
      g.beginPath();
      g.moveTo(352, 400);
      g.bezierCurveTo(345, 260, 440, 218, 520, 220);
      g.bezierCurveTo(620, 222, 680, 290, 676, 400);
      g.bezierCurveTo(672, 480, 630, 540, 560, 560);
      g.bezierCurveTo(500, 572, 420, 540, 380, 500);
      g.bezierCurveTo(360, 470, 352, 440, 352, 400);
      g.closePath();
    }
    function face(gender, n, expr) {
      const [c, g] = mk();
      // 耳（奥側＝画面の左）
      g.fillStyle = SKIN[gender]; g.beginPath(); g.ellipse(360, 450, 30, 44, -0.2, 0, 7); g.fill(); g.stroke();
      skull(g); g.fillStyle = SKIN[gender]; g.fill(); g.stroke();
      // 頬の陰（肌の濃淡）
      g.fillStyle = SKIN_SH[gender]; g.beginPath(); g.ellipse(420, 500, 40, 30, 0, 0, 7); g.fill();
      // 頬の赤み
      g.fillStyle = 'rgba(255,120,150,0.45)'; g.beginPath(); g.ellipse(470, 505, 30, 14, 0, 0, 7); g.ellipse(630, 505, 24, 12, 0, 0, 7); g.fill();
      const r = 26 + n * 6;
      for (const [x, k] of [[475, 0.85], [600, 1]]) {
        const ex = x, ey = 450, rr = r * k;
        g.lineWidth = 7;
        if (expr === 'blink' || expr === 'happy') {
          g.beginPath();
          if (expr === 'blink') { g.moveTo(ex - rr, ey); g.quadraticCurveTo(ex, ey + rr * 0.5, ex + rr, ey); } else { g.moveTo(ex - rr, ey + rr * 0.2); g.quadraticCurveTo(ex, ey - rr * 0.9, ex + rr, ey + rr * 0.2); }
          g.stroke();
        } else if (expr === 'hurt') {
          g.beginPath(); g.moveTo(ex - rr, ey - rr * 0.6); g.lineTo(ex + rr * 0.6, ey); g.lineTo(ex - rr, ey + rr * 0.6); g.stroke();
        } else {
          g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ex, ey, rr * 0.8, rr * 1.1, 0, 0, 7); g.fill(); g.stroke();
          g.fillStyle = EYE; g.beginPath(); g.ellipse(ex, ey + rr * 0.1, rr * 0.6, rr * 0.85, 0, 0, 7); g.fill();
          g.fillStyle = '#4a3cc8'; g.beginPath(); g.ellipse(ex, ey + rr * 0.1, rr * 0.25, rr * 0.35, 0, 0, 7); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - rr * 0.2, ey - rr * 0.3, rr * 0.18, 0, 7); g.fill();
        }
        // 眉（顔ごとに角度を変える）
        g.lineWidth = 8; g.beginPath(); g.moveTo(ex - rr, ey - rr * 1.5 + n * 6); g.lineTo(ex + rr, ey - rr * 1.6 - n * 4); g.stroke();
      }
      // 口
      g.lineWidth = 7; g.beginPath();
      if (expr === 'shout') { g.fillStyle = '#b02a4a'; g.ellipse(560, 525, 26, 20, 0, 0, 7); g.fill(); g.stroke(); }
      else if (expr === 'happy') { g.fillStyle = '#e04a6a'; g.moveTo(535, 515); g.quadraticCurveTo(560, 548, 585, 515); g.closePath(); g.fill(); g.stroke(); }
      else if (expr === 'hurt') { g.moveTo(535, 525); g.lineTo(548, 518); g.lineTo(560, 528); g.lineTo(572, 518); g.lineTo(585, 525); g.stroke(); }
      else { g.moveTo(540, 522); g.quadraticCurveTo(560, 532 + n * 3, 580, 520); g.stroke(); }
      // 番号（確認用）
      g.fillStyle = OL; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText(String(n), 560, 330);
      return c.toDataURL('image/png');
    }
    function shade(g) {   // 髪の陰と光（基準色の濃淡）
      g.save(); g.clip();
      g.fillStyle = HAIR_SH; g.fillRect(0, 360, 1024, 80);
      g.strokeStyle = HAIR_HI; g.lineWidth = 16; g.beginPath(); g.arc(500, 360, 110, -2.6, -1.7); g.stroke();
      g.restore();
    }
    function front(gender, id) {
      const [c, g] = mk();
      g.fillStyle = HAIR;
      g.beginPath();
      g.moveTo(340, 470);
      g.bezierCurveTo(320, 250, 430, 196, 520, 198);
      g.bezierCurveTo(640, 200, 700, 280, 690, 420);
      // 前髪のギザギザ（髪型ごとに数を変える）
      const k = id.length % 3 + 4;
      for (let i = 0; i < k; i++) { const x1 = 690 - (i + 0.5) * (300 / k), x2 = 690 - (i + 1) * (300 / k); g.lineTo(x1, 395 + (i % 2) * 18); g.lineTo(x2, 330); }
      g.lineTo(390, 380); g.lineTo(385, 470); g.closePath();
      g.fill(); g.stroke(); shade(g);
      g.fillStyle = OL; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillText(id, 520, 270);
      return c.toDataURL('image/png');
    }
    function back(gender, id) {
      const [c, g] = mk();
      g.fillStyle = HAIR;
      const blob = (fn) => { g.beginPath(); fn(); g.fill(); g.stroke(); shade(g); };
      if (id === 'twin') for (const x of [300, 735]) blob(() => g.ellipse(x, 620, 70, 230, x < 512 ? 0.18 : -0.18, 0, 7));
      if (id === 'ponytail') blob(() => g.ellipse(330, 640, 80, 250, 0.35, 0, 7));
      if (id === 'wolf') blob(() => { g.moveTo(350, 400); g.lineTo(330, 640); g.lineTo(380, 590); g.lineTo(400, 660); g.lineTo(450, 560); g.lineTo(450, 400); g.closePath(); });
      blob(() => g.ellipse(505, 395, id === 'bob' ? 205 : 182, id === 'bob' ? 210 : 180, 0, 0, 7));
      if (id === 'spiky') blob(() => { g.moveTo(330, 300); g.lineTo(250, 230); g.lineTo(360, 250); g.lineTo(330, 160); g.lineTo(430, 220); g.lineTo(480, 120); g.lineTo(530, 215); g.closePath(); });
      return c.toDataURL('image/png');
    }
    const f = {};
    for (const gender of ['f', 'm']) {
      FACES[gender].forEach((id, i) => {
        f[`heads/face/${id}.png`] = face(gender, i + 1, null);
        if (i === 0) for (const e of EXPRS) f[`heads/face/${id}_${e}.png`] = face(gender, i + 1, e);
      });
      for (const id of HAIRS[gender]) { f[`heads/hair/${gender}_${id}.png`] = front(gender, id); f[`heads/hair/${gender}_${id}_back.png`] = back(gender, id); }
    }
    return f;
  }, [FACES, HAIRS, EXPRS]);
  await ctx.close();
  const map = {};
  for (const [k, v] of Object.entries(out)) map[k] = Buffer.from(v.split(',')[1], 'base64');
  fs.writeFileSync(path.join(SHOTS, 'facehair_fake_face_f_01.png'), map['heads/face/f_01.png']);
  fs.writeFileSync(path.join(SHOTS, 'facehair_fake_hair_f_twin.png'), map['heads/hair/f_twin.png']);
  fs.writeFileSync(path.join(SHOTS, 'facehair_fake_hair_f_twin_back.png'), map['heads/hair/f_twin_back.png']);
  return map;
}
const REAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'manifest.json'), 'utf8'));
const NOFACE = (() => { const j = { ...REAL }; delete j.faces; delete j.hairs; delete j.faceBase; return j; })();   // 本物の顔・髪の絵が入った後も「絵が無い時」を試す
function manifestFor() {
  const m = JSON.parse(JSON.stringify(REAL));
  m.faces = {}; m.hairs = {};
  for (const g of ['f', 'm']) {
    FACES[g].forEach((id, i) => {
      m.faces[id] = i === 0 ? { file: `heads/face/${id}.png`, expr: Object.fromEntries(EXPRS.map((e) => [e, `heads/face/${id}_${e}.png`])) } : { file: `heads/face/${id}.png` };
    });
    for (const id of HAIRS[g]) m.hairs[`${g}_${id}`] = { file: `heads/hair/${g}_${id}.png`, back: `heads/hair/${g}_${id}_back.png`, base: '#b07850' };
  }
  m.faceBase = { skin: { f: '#ffe3d3', m: '#f6d5be' }, eye: '#6a5cff' };
  return m;
}

/** mode: 'none'（今の manifest から顔・髪の節を外したもの = 顔・髪の絵が無い時）| 'ok' | 'slow'（顔・髪の絵の読み込みが遅い） */
async function openGame(browser, mode, IMGS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  await page.route('**/assets/sprites/**', async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.split('/assets/sprites/')[1] || '');
    if (rel === 'manifest.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'none' ? NOFACE : manifestFor()) });
    const b = IMGS[rel];
    if (!b) return route.continue();
    if (mode === 'slow') await sleep(2500);
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
/** 頭の情報（aiHeadOf の結果の要約） */
function headInfo(page, over) {
  return page.evaluate(async (over) => {
    const C = await import('./src/render/character.js');
    const st = window.game.state;
    const l = { ...st.look, ...(over || {}), classId: st.look.classId, gender: st.look.gender };
    const h = C.aiHeadOf(l, {}, 'idle', 0.3);
    return h ? { layered: !!h.layered, file: h.file, front: !!h.front, back: !!h.back, expr: h.expr } : null;
  }, over || null);
}
/** look で描いた頭まわりの画素の平均色（キャッシュ経路） */
function headSig(page, over) {
  return page.evaluate(async (over) => {
    const { drawCharacter } = await import('./src/render/character.js');
    const st = window.game.state;
    const look = over ? { ...st.look, ...over, classId: st.look.classId, gender: st.look.gender } : st.look;
    const c = document.createElement('canvas'); c.width = 120; c.height = 120;
    const x = c.getContext('2d');
    drawCharacter(x, 60, 115, look, {}, { state: 'idle', t: 0.3, facing: 1, scale: 1 });
    const d = x.getImageData(30, 10, 60, 45).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n), n] : [0, 0, 0, 0];
  }, over || null);
}
const sigDiff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) / 10;

/** 主人公をいろいろな状態・帽子・色で並べた表 */
async function drawGrid(page, label) {
  return page.evaluate(async (label) => {
    const { drawCharacter } = await import('./src/render/character.js');
    const g = window.game, st = g.state;
    const look = st.look;
    const base = (await import('./src/ui/deps.js')).equipLooks(st);
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const x = c.getContext('2d');
    x.fillStyle = '#3a3150'; x.fillRect(0, 0, 1280, 720);
    x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.fillText(label, 10, 18);
    const L = (o) => Object.assign({ ...look, ...o }, { classId: look.classId, gender: look.gender });
    const items = [
      ['idle', {}, {}, {}], ['blink', {}, {}, { t: 3.9 }], ['walk', {}, {}, { state: 'walk', t: 0.2 }], ['walk2', {}, {}, { state: 'walk', t: 0.5 }],
      ['attack', {}, {}, { state: 'attack', attackT: 0.5 }], ['hurt', {}, {}, { state: 'hurt', t: 0.1 }], ['left', {}, {}, { facing: -1 }], ['jump', {}, {}, { state: 'jump', t: 0.1 }],
      ['climb', {}, {}, { state: 'climb', t: 0.2 }], ['flash', {}, {}, { flash: true }], ['catEars', {}, { hat: { style: 'catEars' } }, {}], ['cap', {}, { hat: { style: 'cap' } }, {}],
      ['pink', { hairColor: '#ff6fb5' }, {}, {}], ['white', { hairColor: '#ffffff' }, {}, {}], ['black', { hairColor: '#3a2a2a' }, {}, {}], ['green', { hairColor: '#3dff8a' }, {}, {}],
      ['skin light', { skin: '#ffe9dc' }, {}, {}], ['skin dark', { skin: '#5e3a2a' }, {}, {}], ['eye green', { eyeColor: '#3dff8a' }, {}, {}], ['beanie', {}, { hat: { style: 'beanie' } }, {}],
      ['cap left', {}, { hat: { style: 'cap' } }, { facing: -1 }], ['shades', {}, { accessory: { style: 'sunglasses' } }, {}], ['dead', {}, {}, { state: 'dead', fallT: 1, deadT: 1 }], ['aiHead:false', { aiHead: false }, {}, {}],
    ];
    items.forEach(([name, lo, eq, o], i) => {
      const cx = 60 + (i % 12) * 102, cy = 160 + Math.floor(i / 12) * 160;
      drawCharacter(x, cx, cy, L(lo), { ...base, ...eq }, { state: 'idle', t: 0.3, facing: 1, scale: 1.3, ...o });
      x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.textAlign = 'center'; x.fillText(name, cx, cy + 20);
    });
    // 拡大
    const big = [['idle', {}, {}, {}], ['walk', {}, {}, { state: 'walk', t: 0.3 }], ['attack', {}, {}, { state: 'attack', attackT: 0.4 }], ['catEars', {}, { hat: { style: 'catEars' } }, {}], ['cap 白髪・暗い肌', { hairColor: '#ffffff', skin: '#5e3a2a' }, { hat: { style: 'cap' } }, { facing: -1 }]];
    big.forEach(([name, lo, eq, o], i) => {
      const cx = 130 + i * 250;
      drawCharacter(x, cx, 690, L(lo), { ...base, ...eq }, { state: 'idle', t: 0.3, facing: 1, scale: 3.2, ...o });
      x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.textAlign = 'center'; x.fillText(name, cx, 710);
    });
    return c.toDataURL('image/png');
  }, label);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  const IMGS = await genImages(browser);
  console.log(`仮の顔・髪の絵 ${Object.keys(IMGS).length} 枚`);

  // ================================================================ ① 絵が無い（今の manifest）
  console.log('\n[none] 顔・髪の絵が無い');
  {
    const { page, ctx, errs } = await openGame(browser, 'none', IMGS);
    const fl = await page.evaluate(() => [window.game.sprites.faceList('f').length, window.game.sprites.faceList('m').length, window.game.sprites.hairArtList('f').length]);
    check('none: 顔・髪の一覧は空', fl.every((n) => n === 0), JSON.stringify(fl));
    await page.keyboard.press('Enter'); await sleep(500);
    await page.keyboard.press('Enter'); await sleep(400);
    await page.keyboard.press('Enter'); await sleep(450); await frames(page, 4);
    const rows = await page.evaluate(() => { const T = window.__titleT(); return { step: T.c.step, face: T.c.look.face, hair: T.c.look.hair }; });
    await shot(page, 'none_create_look');
    check('none: キャラ作成の見た目に進める（look.face は初期の顔 f_01・髪型は今まで通り）', rows.step === 2 && rows.face === 'f_01' && rows.hair === 'twin', JSON.stringify(rows));
    await startPlay(page, 'luna', 'f');
    const hi = await headInfo(page);
    const hasHeads = !!(REAL.heads && REAL.heads.luna_f);
    check('none: ルナ♀は今まで通り（heads の1枚の頭、または コードの頭）', hasHeads ? !!hi && !hi.layered : hi === null, JSON.stringify(hi));
    const lk = await page.evaluate(() => window.game.state.look.face);
    check('none: state.look.face = f_01（初期の顔）', lk === 'f_01', String(lk));
    const old = await page.evaluate(async () => {
      const P = await import('./src/systems/progression.js');
      const s = P.newState('jin', { gender: 'm' });
      delete s.look.face;
      const raw = JSON.parse(JSON.stringify(s));
      const m = P.migrateState ? P.migrateState(raw) : null;
      return m ? m.look.face : '(migrateState なし)';
    });
    check('none: 顔の無い古いセーブ → 移行でクラス×性別の初期の顔（jin♂ = m_02）', old === 'm_02', String(old));
    const grid = await drawGrid(page, '顔・髪の絵が無い（今まで通り）');
    saveUrl('grid_none_luna_f', grid);
    check('none: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ================================================================ ② 絵あり
  console.log('\n[ok] 仮の顔・髪の絵あり');
  {
    const { page, ctx, errs } = await openGame(browser, 'ok', IMGS);
    await page.evaluate(() => window.game.sprites.preloadSprites());
    const st0 = await page.evaluate(() => window.game.sprites.spriteStats());
    check('ok: 顔・髪の絵を読み込み（失敗なし）', st0.manifest === 'ok' && st0.failed === 0, `${st0.loaded}/${st0.entries} failed ${st0.failed} ${JSON.stringify(st0.errors)}`);
    const fl = await page.evaluate(() => ({ f: window.game.sprites.faceList('f'), m: window.game.sprites.faceList('m'), hf: window.game.sprites.hairArtList('f'), hm: window.game.sprites.hairArtList('m') }));
    check('ok: faceList / hairArtList', fl.f.join() === 'f_01,f_02,f_03' && fl.m.join() === 'm_01,m_02,m_03' && fl.hf.join() === 'twin,ponytail,bob' && fl.hm.join() === 'short,wolf,spiky', JSON.stringify(fl));

    // ---- キャラ作成
    await page.keyboard.press('Enter'); await sleep(500);
    await page.keyboard.press('Enter'); await sleep(400);
    await page.keyboard.press('Enter'); await sleep(450); await frames(page, 6);
    const T0 = await page.evaluate(() => { const T = window.__titleT(); return { step: T.c.step, row: T.c.row, face: T.c.look.face, hair: T.c.look.hair, ai: T.c.look.aiHead }; });
    await shot(page, 'create_look');
    check('作成: 見た目の最初は「AIの顔」行・顔 f_01・髪型 twin', T0.step === 2 && T0.row === 0 && T0.face === 'f_01' && T0.hair === 'twin' && T0.ai !== false, JSON.stringify(T0));
    await page.keyboard.press('ArrowDown'); await frames(page, 2);
    await page.keyboard.press('ArrowRight'); await frames(page, 2);
    const T1 = await page.evaluate(() => { const T = window.__titleT(); return { row: T.c.row, face: T.c.look.face }; });
    await page.keyboard.press('ArrowRight'); await frames(page, 2);
    await page.keyboard.press('ArrowRight'); await frames(page, 2);
    const T2 = await page.evaluate(() => window.__titleT().c.look.face);
    await page.keyboard.press('ArrowLeft'); await frames(page, 4);
    await shot(page, 'create_face_f03');
    check('作成: 「顔」行（2行目）で →→→ が f_02 → f_03 → f_01（一周）', T1.row === 1 && T1.face === 'f_02' && T2 === 'f_01', JSON.stringify({ T1, T2 }));
    await page.keyboard.press('ArrowDown'); await frames(page, 2);
    const hairs = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await frames(page, 2); hairs.push(await page.evaluate(() => window.__titleT().c.look.hair)); }
    check('作成: 顔を使う時、髪型は絵のある物だけ（ponytail → bob → twin などの順）', hairs.every((h) => ['twin', 'ponytail', 'bob'].includes(h)) && new Set(hairs).size === 3, JSON.stringify(hairs));
    // 髪の色の行: 色を変えると塗り替え
    await page.keyboard.press('ArrowDown'); await frames(page, 2);
    await page.keyboard.press('ArrowRight'); await frames(page, 6);
    const hc = await page.evaluate(() => { const T = window.__titleT(); return { row: T.c.row, hc: T.c.look.hairColor }; });
    await shot(page, 'create_haircolor');
    check('作成: 髪の色の行は選べる（無効ではない）', hc.row === 3 && hc.hc !== '#ff6fb5', JSON.stringify(hc));
    // AIの顔 OFF → 顔の行は無効・髪型は全部
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await frames(page, 2);
    await page.keyboard.press('ArrowRight'); await sleep(300); await frames(page, 4);
    const off = await page.evaluate(() => { const T = window.__titleT(); return { row: T.c.row, ai: T.c.look.aiHead }; });
    await page.keyboard.press('ArrowDown'); await frames(page, 2);
    const offRow = await page.evaluate(() => window.__titleT().c.row);
    await shot(page, 'create_ai_off');
    check('作成: AIの顔 OFF → 顔の行は飛ばす（↓で髪型へ）', off.row === 0 && off.ai === false && offRow === 2, JSON.stringify({ off, offRow }));
    await page.keyboard.press('ArrowUp'); await frames(page, 2);
    await page.keyboard.press('ArrowRight'); await sleep(300); await frames(page, 2);   // ON に戻す
    // ランダム（顔も変わる・絵のある髪型）。ランダムの行（7行目）で Enter
    await page.evaluate(() => { window.__titleT().c.row = 6; });
    const rs = [];
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Enter'); await frames(page, 1); rs.push(await page.evaluate(() => { const l = window.__titleT().c.look; return l.face + ':' + l.hair; })); }
    const rFaces = new Set(rs.map((s) => s.split(':')[0])), rHairs = rs.map((s) => s.split(':')[1]);
    const stepR = await page.evaluate(() => window.__titleT().c.step);
    check('作成: ランダム（Enter）で顔も変わり、髪型は絵のある物だけ・次へ進まない', rFaces.size >= 2 && rHairs.every((h) => ['twin', 'ponytail', 'bob'].includes(h)) && stepR === 2, JSON.stringify({ rs, stepR }));
    // 顔の行で Enter → 次へ
    await page.evaluate(() => { window.__titleT().c.row = 1; });
    await page.keyboard.press('Enter'); await sleep(400);
    const step3 = await page.evaluate(() => window.__titleT().c.step);
    check('作成: 顔の行で Enter は次へ（名前）', step3 === 3, String(step3));
    const chosen = await page.evaluate(() => { const l = window.__titleT().c.look; return { face: l.face, hair: l.hair }; });
    await page.evaluate(() => { window.__titleT()._finish = true; });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
    await sleep(500);
    const saved = await page.evaluate(() => { const l = window.game.state.look; return { face: l.face, hair: l.hair, ai: l.aiHead }; });
    check('作成: state.look に face・髪型・aiHead を保存', saved.face === chosen.face && saved.hair === chosen.hair && saved.ai === true, JSON.stringify({ saved, chosen }));

    // ---- ゲーム中（ルナ♀・リグ）
    await page.evaluate(() => { const st = window.game.state; Object.assign(st.look, { face: 'f_01', hair: 'twin', hairColor: '#ff6fb5', skin: '#ffe3d3', eyeColor: '#ff3d8b' }); });
    const hi = await headInfo(page);
    check('ok: 重ね頭（顔 + 前髪 + 後ろ髪）', hi && hi.layered && hi.front && hi.back, JSON.stringify(hi));
    const ex = await page.evaluate(async () => {
      const C = await import('./src/render/character.js');
      const st = window.game.state, l = Object.assign({ ...st.look }, { classId: st.look.classId, gender: st.look.gender });
      const f = (s, t, a) => C.aiHeadOf(l, a || {}, s, t)?.expr ?? null;
      const l2 = Object.assign({ ...l, face: 'f_02' }, { classId: l.classId, gender: l.gender });
      return { idle: f('idle', 0.3), blink: f('idle', 3.9), attack: f('attack', 0), hurt: f('hurt', 0.1), happy: f('idle', 0.3, { headExpr: 'happy' }), f02blink: (() => { const h = C.aiHeadOf(l2, {}, 'idle', 3.9); return h ? (h.layered ? h.expr : 'not layered') : 'no head'; })() };
    });
    check('ok: 表情（まばたき・攻撃=shout・被弾=hurt・happy）。表情の絵が無い顔は基本の顔', ex.idle === null && ex.blink === 'blink' && ex.attack === 'shout' && ex.hurt === 'hurt' && ex.happy === 'happy' && ex.f02blink === null, JSON.stringify(ex));
    const miss = await headInfo(page, { hair: 'long' });
    check('ok: 髪の絵が無い髪型（long）→ 今まで通り（heads の1枚の頭 / コードの頭）', !miss || !miss.layered, JSON.stringify(miss));
    const offH = await headInfo(page, { aiHead: false });
    check('ok: aiHead:false → コードの頭', offH === null, JSON.stringify(offH));
    const noFace = await headInfo(page, { face: 'f_99' });
    check('ok: manifest に無い顔 → 今まで通り', !noFace || !noFace.layered, JSON.stringify(noFace));
    const npc = await page.evaluate(async () => { const C = await import('./src/render/character.js'); const l = { ...window.game.state.look }; return C.aiHeadOf(l, {}, 'idle', 0.3); });
    check('ok: NPC（classId なし）も rig.npcs（既定 true）なら重ね頭（look.face の顔）', !!npc && npc.layered && /f_01/.test(npc.file), JSON.stringify(npc && npc.file));
    const npcOff = await page.evaluate(async () => {
      const C = await import('./src/render/character.js'), S = await import('./src/render/sprites.js');
      const j = await (await fetch('./assets/sprites/manifest.json')).json();
      S.setSpriteManifest({ ...j, rig: { ...j.rig, npcs: false } });
      const r = C.aiHeadOf({ ...window.game.state.look }, {}, 'idle', 0.3);
      S.setSpriteManifest(j); await S.preloadSprites();
      return r;
    });
    check('ok: rig.npcs=false なら NPC には出ない（今まで通り）', npcOff === null);

    // ---- 色替え
    const rc = await page.evaluate(async () => {
      const S = await import('./src/render/sprites.js');
      const { rgbHsl } = await import('./src/render/recolor.js');
      const st = window.game.state;
      const L = (o) => Object.assign({ ...st.look, face: 'f_01', hair: 'twin', ...o }, { classId: 'luna', gender: 'f' });
      const stats = (cv, sel) => {
        const g = cv.getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0, sx = 0, sy = 0, ss = 0, sl = 0, line = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 250) continue;
          if (Math.abs(d[i] - 0x2a) + Math.abs(d[i + 1] - 0x14) + Math.abs(d[i + 2] - 0x30) < 24) { line++; continue; }
          const [h, s, l] = rgbHsl(d[i], d[i + 1], d[i + 2]);
          if (sel && !sel(h, s, l)) continue;
          n++; sx += Math.cos(h * Math.PI / 180) * s; sy += Math.sin(h * Math.PI / 180) * s; ss += s; sl += l;
        }
        return { h: Math.round((Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360), s: +(ss / n).toFixed(2), l: +(sl / n).toFixed(2), line, n };
      };
      const out = {};
      const base = S.faceHeadFor(L({ hairColor: '#b07850', skin: '#ffe3d3', eyeColor: '#6a5cff' }), null);
      out.sameAsBase = base.front.canvas.width > 0;
      out.base = stats(base.front.canvas);
      for (const [k, c] of [['pink', '#ff6fb5'], ['white', '#ffffff'], ['black', '#3a2a2a'], ['green', '#3dff8a']]) out[k] = stats(S.faceHeadFor(L({ hairColor: c }), null).front.canvas);
      out.backPink = stats(S.faceHeadFor(L({ hairColor: '#ff6fb5' }), null).back.canvas);
      // 肌（顔の絵の肌色っぽい所: 明るい・彩度あり）
      const skinSel = (h, s, l) => l > 0.12 && !(h > 200 && h < 300);
      out.skinBase = stats(base.canvas, skinSel);
      out.skinLight = stats(S.faceHeadFor(L({ skin: '#ffe9dc' }), null).canvas, skinSel);
      out.skinDark = stats(S.faceHeadFor(L({ skin: '#5e3a2a' }), null).canvas, skinSel);
      // 瞳（青紫の画素の数が、目の色を変えると減る）
      const blue = (cv) => stats(cv, (h, s) => h > 225 && h < 275 && s > 0.4).n;
      out.eyeBase = blue(base.canvas);
      out.eyeGreen = blue(S.faceHeadFor(L({ eyeColor: '#3dff8a' }), null).canvas);
      out.eyeGreenHue = stats(S.faceHeadFor(L({ eyeColor: '#3dff8a' }), null).canvas, (h, s, l) => h > 100 && h < 180 && s > 0.4 && l < 0.85).n;
      out.cacheSame = S.faceHeadFor(L({ hairColor: '#ff6fb5' }), null) === S.faceHeadFor(L({ hairColor: '#ff6fb5' }), null);
      out.stats = S.spriteStats().faceRecolor;
      return out;
    });
    const hueD = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    check('色替え: 髪 ピンク（色相が目標の近く）', hueD(rc.pink.h, 330) < 22, JSON.stringify(rc.pink));
    check('色替え: 髪 緑', hueD(rc.green.h, 145) < 22, JSON.stringify(rc.green));
    check('色替え: 髪 白（明るく・彩度ほぼ無し）', rc.white.l > 0.8 && rc.white.s < 0.15, JSON.stringify(rc.white));
    check('色替え: 髪 黒（暗く・彩度低め）', rc.black.l < 0.35 && rc.black.s < 0.35, JSON.stringify(rc.black));
    check('色替え: 後ろ髪も同じ色', hueD(rc.backPink.h, 330) < 22, JSON.stringify(rc.backPink));
    check('色替え: 線の色 #2A1430 は変えない（線の画素数が同じ）', [rc.pink, rc.white, rc.black, rc.green].every((s) => Math.abs(s.line - rc.base.line) <= rc.base.line * 0.02 + 5), JSON.stringify([rc.base.line, rc.pink.line, rc.white.line, rc.black.line, rc.green.line]));
    check('色替え: 肌 明るい > 基準 > 暗い', rc.skinLight.l >= rc.skinBase.l - 0.01 && rc.skinDark.l < rc.skinBase.l - 0.3, JSON.stringify({ b: rc.skinBase, li: rc.skinLight, d: rc.skinDark }));
    check('色替え: 瞳（青紫 → 緑）', rc.eyeBase > 200 && rc.eyeGreen < rc.eyeBase * 0.1 && rc.eyeGreenHue > rc.eyeBase * 0.6, JSON.stringify({ b: rc.eyeBase, g: rc.eyeGreen, gh: rc.eyeGreenHue }));
    check('色替え: 結果はキャッシュ（同じ look は同じ物）・上限あり', rc.cacheSame && rc.stats <= 48, JSON.stringify({ c: rc.cacheSame, n: rc.stats }));

    // ---- 描画（キャッシュのキーに顔・色が入る）
    const sA = await headSig(page), sB = await headSig(page, { hairColor: '#3dff8a' }), sC = await headSig(page, { face: 'f_02' }), sOff = await headSig(page, { aiHead: false });
    check('描画: 髪の色を変えると頭の見た目が変わる（キャッシュ経路）', sigDiff(sA, sB) > 15, JSON.stringify({ sA, sB }));
    check('描画: 顔を変えると見た目が変わる', sigDiff(sA, sC) > 1, JSON.stringify({ sA, sC }));
    check('描画: AIの顔 OFF と違う', sigDiff(sA, sOff) > 15, JSON.stringify({ sA, sOff }));
    const perf = await page.evaluate(async () => {
      const C = await import('./src/render/character.js');
      const st = window.game.state, l = st.look;
      const t0 = performance.now(); for (let i = 0; i < 10000; i++) C.aiHeadOf(l, {}, 'idle', i * 0.01); return +((performance.now() - t0) / 10000 * 1000).toFixed(2);
    });
    check('性能: aiHeadOf（重ね頭）1回 < 20µs', perf < 20, perf + 'µs');
    await frames(page, 10);
    await shot(page, 'play_luna_f');
    saveUrl('grid_luna_f', await drawGrid(page, '重ね頭: ルナ♀（リグ）'));
    // 髪型ごと
    for (const h of ['ponytail', 'bob']) { await page.evaluate((h) => { window.game.state.look.hair = h; }, h); saveUrl('grid_luna_f_' + h, await drawGrid(page, '重ね頭: ♀ ' + h)); }
    check('ok: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---- ♂（ルカ・ジン）
  {
    const { page, ctx, errs } = await openGame(browser, 'ok', IMGS);
    await page.evaluate(() => window.game.sprites.preloadSprites());
    await startPlay(page, 'luna', 'm');
    const hi = await headInfo(page);
    check('ok ♂: ルカ（m_01 + m_short）も重ね頭', hi && hi.layered && /m_01/.test(hi.file) && /m_short/.test(hi.file), JSON.stringify(hi));
    saveUrl('grid_luna_m', await drawGrid(page, '重ね頭: ルカ♂'));
    await page.evaluate(() => { window.game.state.look.hair = 'wolf'; window.game.state.look.face = 'm_02'; });
    saveUrl('grid_luna_m_wolf', await drawGrid(page, '重ね頭: ♂ m_02 + wolf'));
    check('ok ♂: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ================================================================ ③ 読み込み中 → 完了
  console.log('\n[slow] 顔・髪の読み込み中');
  {
    const { page, ctx, errs } = await openGame(browser, 'slow', IMGS);
    await startPlay(page, 'luna', 'f');
    const h0 = await headInfo(page);
    const s0 = await headSig(page);
    for (let i = 0; i < 100; i++) { const h = await headInfo(page); if (h && h.layered) break; await sleep(200); }
    await frames(page, 4);
    const s1 = await headSig(page);
    check('slow: 読み込み中は今まで通り（重ね頭ではない）', !h0 || !h0.layered, JSON.stringify(h0));
    check('slow: 読み込み完了で重ね頭に切り替わる（キャッシュも）', sigDiff(s0, s1) > 10, JSON.stringify({ s0, s1 }));
    check('slow: 例外・コンソールエラーなし', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(`\nfacehair: ${pass} passed, ${fail} failed`);
  if (fail) { console.log(problems.map((p) => ' - ' + p).join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
