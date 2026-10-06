// 背景・地面/足場・アイコン・乗り物・UI の画像差し替えのブラウザテスト（Playwright）
//   node tests/art_env_browser.mjs        （npm run test:artenv）
// テストの中で仮の画像（tests/art_env_fixtures.mjs）を作って配信し（リポジトリにはコピーしない）、
//  1) 背景: 中景の足元の線（y=640）が地面の線に重なる・パララックス（中景 0.3）・横ループ・夜のあかり・昼夜の色かぶせ
//  2) 地面・足場: 歩く面・乗る面の線が地面・足場の y に重なる・足場の幅で切る
//  3) アイコン: 装備は基準色 → アイテムの色に塗り替え・消耗品・スキル（枠つき）
//  4) 乗り物: マゼンタの印の位置にタイヤ・印が残らない・色替え・左向きは左右反転
//  5) タイトル・ロゴ・ワールドマップ（ゲーム本体 index.html で）
//  6) 無い時・読み込みに失敗した時は今のコードの絵と1画素も違わない／spriteMode=procedural でも同じ
//  7) 性能: 背景＋地面を描く1フレームの時間（コードの絵と比べる）・読み込みと前処理の時間
// スクショ: tests/screenshots/art_env_*.png
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goodImages, COLORS, png } from './art_env_fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8147;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_CERT_AUTHORITY_INVALID/, /ERR_NAME_NOT_RESOLVED/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_PROXY/, /favicon\.ico/, /404 \(Not Found\)/, /\[art\]/, /\[sprites\]/];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright が見つかりません');
}
let pass = 0, fail = 0;
const problems = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) pass++; else { fail++; problems.push(name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 配信（/__good/ /__none/ /__fail/ の下に manifest と仮の画像）
const IMGS = Object.fromEntries(Object.entries(goodImages()).map(([k, v]) => [k, png(v)]));
// 背景の画像を手放す（LRU）確認用: 他の地域のフィールドの中景にも同じ絵（別のファイル名）
for (const r of ['swamp', 'casino', 'rooftop', 'spaceport']) IMGS[`bg/${r}_field_mid.png`] = IMGS['bg/beach_field_mid.png'];
// 本物の manifest から、背景・タイル・アイコン・乗り物・UI の節を外したもの（本物の画像が入った後も「画像が無い時」を試す）
const REAL = (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'manifest.json'), 'utf8')); for (const k of ['bg', 'tiles', 'icons', 'vehicles', 'ui']) delete j[k]; return j; })();
function envManifest() {
  const m = JSON.parse(JSON.stringify(REAL));
  for (const rel of Object.keys(IMGS)) {
    const mm = /^(bg|tiles|icons|vehicles|ui)\/(.+)\.png$/.exec(rel);
    (m[mm[1]] = m[mm[1]] || {})[mm[2]] = rel;
  }
  return m;
}
const MAN = { good: envManifest(), none: REAL, fail: envManifest() };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function serveSprites(kind, rel, res) {
  if (rel === 'webp.json') { res.writeHead(404); res.end(); return; } // 仮の画像（PNG）で試すので、WebP の対応表は渡さない
  if (rel === 'manifest.json') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify(MAN[kind])); return; }
  if (IMGS[rel]) {
    if (kind === 'fail') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(IMGS[rel]); return;
  }
  const f = path.join(ROOT, 'assets', 'sprites', rel);
  if (!f.startsWith(path.join(ROOT, 'assets', 'sprites')) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}
function startServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const m = /^\/__(good|none|fail)\/assets\/sprites\/(.+)$/.exec(u);
    if (m) return serveSprites(m[1], m[2], res);
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}

// ---------------------------------------------------------------- 色の小道具
const near = (p, c, tol = 40) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) <= tol * 3;
function hue([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return -1;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const fmt = (p) => `rgba(${p.join(',')})`;

async function openPreview(browser, kind) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  await page.goto(`http://127.0.0.1:${PORT}/tests/art_env_preview.html`);
  await page.waitForFunction(() => window.ARTENV && window.ARTENV.ready, null, { timeout: 20000 });
  const t0 = Date.now();
  const st = await page.evaluate((u) => window.ARTENV.setup(u), `/__${kind}/assets/sprites/manifest.json`);
  return { page, errs, stats: st.stats, loadMs: Date.now() - t0 };
}
const shot = (page, url, name) => fs.writeFileSync(path.join(SHOTS, name), Buffer.from(url.split(',')[1], 'base64'));

// ================================================================ 本体
fs.mkdirSync(SHOTS, { recursive: true });
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
  // ---------------------------------------------------------------- 1〜4: 仮の画像あり
  const G = await openPreview(browser, 'good');
  const P = G.page;
  const nImg = Object.keys(IMGS).length;
  check('読み込み: 仮の画像を全部読めた', G.stats.loaded === nImg && G.stats.failed === 0, `loaded ${G.stats.loaded}/${nImg}・failed ${G.stats.failed}・前処理 ${G.stats.prepMs.toFixed(0)}ms・全体 ${G.loadMs}ms`);
  // 背景: カメラ y = 地面 1000 + 160 − 720 = 440 → 地面の線 gS = 560。中景の y=630〜639（黄の帯）→ 画面 550〜559
  const day = { region: 'beach', town: true, clock: 12, camX: 0 };
  const px = await P.evaluate((o) => window.ARTENV.pixels(o, [[300, 555], [300, 545], [300, 565], [300, 600], [104, 400], [74, 400], [400, 430], [298, 430], [300, 200]]), day);
  check('背景: 中景の足元の帯（画像 y=630〜639）が地面の線のすぐ上（画面 y=550〜559）', px[0][0] > 170 && px[0][1] > 150 && px[0][2] < 120, fmt(px[0]));
  check('背景: 帯の上は建物（黄ではない）', !(px[1][0] > 170 && px[1][1] > 150 && px[1][2] < 120), fmt(px[1]));
  check('地面: 歩く面の線（画像 y=40）が地面の線 y=560 に（下は地面の色）', px[2][0] > px[2][2] + 40 && px[3][0] > px[3][2] + 40, `${fmt(px[2])} / ${fmt(px[3])}`);
  check('背景: パララックス（中景の青い縦線 x=100 → カメラ x=0 で画面 x=104 が青）', px[4][2] > px[4][0] + 80 && px[4][2] > px[4][1] + 80, fmt(px[4]));
  const px2 = await P.evaluate((o) => window.ARTENV.pixels(o, [[104, 400], [74, 400]]), { ...day, camX: 100 });
  check('背景: パララックス（カメラ x=100 → 中景は 30px だけ左へ: x=74 が青、x=104 は青でない）', px2[1][2] > px2[1][0] + 80 && !(px2[0][2] > px2[0][0] + 80), `${fmt(px2[1])} / ${fmt(px2[0])}`);
  check('足場: 乗る面の線（画像 y=16）が足場の上面 y=860（画面 420）に・下は足場の色', px[6][0] > px[6][2] + 30 && px[6][0] < 200, fmt(px[6]));
  check('足場: 足場の幅の外（x=298）には描かない', !near(px[7], px[6], 12), `${fmt(px[7])} vs ${fmt(px[6])}`);
  check('背景: 空は今のコードの空（画像の空は透明）', px[8][2] > 120, fmt(px[8]));
  // 横ループ: 中景 2560px・0.3 → カメラ x=5000 で画面 x=1060 が継ぎ目（建物の真ん中）。継ぎ目の左右が同じ色で、空いていない
  const loop = await P.evaluate((o) => window.ARTENV.pixels(o, [[1058, 500], [1060, 500], [1062, 500]]), { ...day, camX: 5000 });
  check('背景: 横に繰り返す（継ぎ目の所も絵がつながっている）', near(loop[0], loop[1], 6) && near(loop[1], loop[2], 6) && loop[1][1] > loop[1][0] + 40, loop.map(fmt).join(' '));
  // 夜: あかり（窓の点 x=20〜31, y=460〜475 → 画面 y=380〜395）を加算
  const night = await P.evaluate((o) => window.ARTENV.pixels(o, [[25, 388], [45, 388]]), { ...day, clock: 22 });
  const dayW = await P.evaluate((o) => window.ARTENV.pixels(o, [[25, 388]]), { ...day, clock: 12 });
  check('夜: あかりが光る（窓の所が明るく、窓の横は暗い）', night[0][0] > 200 && night[0][1] > 180 && night[1][1] < 160, `${fmt(night[0])} / 横 ${fmt(night[1])}`);
  check('昼夜の色かぶせが画像にも掛かる（夜の建物は昼より暗い）', night[1][1] < dayW[0][1] - 40 || night[1][1] < 120, `夜 ${fmt(night[1])}・昼の窓 ${fmt(dayW[0])}`);
  shot(P, await P.evaluate((o) => window.ARTENV.scene(o), { ...day, clock: 17, camX: 200 }), 'art_env_scene_dusk.png');
  shot(P, await P.evaluate((o) => window.ARTENV.scene(o), { ...day, clock: 22, camX: 200 }), 'art_env_scene_night.png');
  shot(P, await P.evaluate(() => window.ARTENV.sheet('bg')), 'art_env_bg.png');
  // 画像の無い地域（downtown）は今のコードの背景のまま → 後で「manifest に画像なし」と比べる
  const downGood = await P.evaluate(() => window.ARTENV.scene({ region: 'downtown', town: true, clock: 17, camX: 300 }));

  // アイコン
  const neon = await P.evaluate(() => window.ARTENV.iconPixels('item', 'cat_ears_neon', 64, [[32, 33]]));
  const pink = await P.evaluate(() => window.ARTENV.iconPixels('item', 'cat_ears_pink', 64, [[32, 33]]));
  check('装備アイコン: 基準色のアイテム（ピンクのネコミミ）は絵の色のまま', hueDiff(hue(pink[0]), hue([255, 138, 200])) < 12, fmt(pink[0]));
  check('装備アイコン: 色違い（サイバーネコミミ #b04dff）に塗り替え', hueDiff(hue(neon[0]), hue([176, 77, 255])) < 16, fmt(neon[0]));
  const pot = await P.evaluate(() => window.ARTENV.iconPixels('item', 'potion_red', 64, [[32, 36], [2, 2]]));
  check('消耗品アイコン: item/potion_red の絵（中は赤・角は透明）', near(pot[0], [230, 40, 60], 20) && pot[1][3] === 0, `${fmt(pot[0])} / 角 ${fmt(pot[1])}`);
  const sk = await P.evaluate(() => window.ARTENV.iconPixels('skill', 'luna_neon_rush', 64, [[32, 32], [14, 30], [3, 32]]));
  check('スキルアイコン: skill/luna_neon_rush の絵＋ゲームの枠', near(sk[0], [255, 255, 255], 12) && near(sk[1], [COLORS.skill[0] + 7, COLORS.skill[1], COLORS.skill[2]], 30) && sk[2][0] < 90 && sk[2][3] > 200, `中 ${fmt(sk[0])}・絵 ${fmt(sk[1])}・枠 ${fmt(sk[2])}`);
  shot(P, await P.evaluate(() => window.ARTENV.sheet('icons')), 'art_env_icons.png');

  // 乗り物（sports: タイヤの中心 (−46,−12)/(48,−12) → (154,138)/(248,138)。半径 13）
  const vd = await P.evaluate(() => window.ARTENV.vehicleData({ kind: 'sports', color: '#19d3c5' }));
  const at = (d, x, y) => d.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 4);
  let magenta = 0;
  for (let i = 0; i < vd.length; i += 4) if (vd[i + 3] > 100 && vd[i] > 190 && vd[i + 2] > 190 && vd[i + 1] < 90) magenta++;
  check('乗り物: マゼンタの印は消えている', magenta === 0, `${magenta}px`);
  const wl = [at(vd, 154 + 4, 138), at(vd, 248 + 4, 138), at(vd, 154, 138 + 11)];
  check('乗り物: 印の位置にタイヤ（ホイールの明るい色・外側は濃い色）', near(wl[0], COLORS.rim, 30) && near(wl[1], COLORS.rim, 30) && near(wl[2], COLORS.wheel, 30), wl.map(fmt).join(' '));
  const bodyPx = at(vd, 200, 128);
  check('乗り物: 車体の色を車の色（#19d3c5）に塗り替え', hueDiff(hue(bodyPx), hue([25, 211, 197])) < 18, fmt(bodyPx));
  const vl = await P.evaluate(() => window.ARTENV.vehicleData({ kind: 'sports', color: '#19d3c5', facing: -1 }));
  let diff = 0, cnt = 0;
  for (let y = 60; y < 170; y++) for (let x = 100; x < 300; x++) { const a = (y * 400 + x) * 4, b = (y * 400 + (399 - x)) * 4; if (vd[a + 3] > 200 || vl[b + 3] > 200) { cnt++; if (Math.abs(vd[a] - vl[b]) + Math.abs(vd[a + 1] - vl[b + 1]) + Math.abs(vd[a + 2] - vl[b + 2]) > 60) diff++; } }
  check('乗り物: 左向きは左右反転', cnt > 1000 && diff / cnt < 0.03, `違う画素 ${diff}/${cnt}`);
  shot(P, await P.evaluate(() => window.ARTENV.sheet('vehicles')), 'art_env_vehicles.png');
  shot(P, await P.evaluate(() => window.ARTENV.sheet('ui')), 'art_env_ui.png');

  // spriteMode=procedural → コードの絵（画像なしの時と同じ）
  await P.evaluate(() => window.ARTENV.setMode('procedural'));
  const procBeach = await P.evaluate(() => window.ARTENV.scene({ region: 'beach', town: true, clock: 17, camX: 300 }));
  const procIcon = await P.evaluate(() => window.ARTENV.iconPixels('item', 'cat_ears_neon', 64, [[32, 33]]));
  await P.evaluate(() => window.ARTENV.setMode('auto'));

  // 性能（背景＋地面の1回あたり）
  const tArt = [];
  for (const town of [true, false]) {
    // 画像が読み込み済みになるまで待ってから（一覧を描いた時に古い画像は手放しているので）
    for (let i = 0; i < 20; i++) { const p = await P.evaluate((o) => window.ARTENV.pixels(o, [[300, 555]]), { ...day, town }); if (p[0][0] > 170 && p[0][2] < 120) break; await sleep(100); }
    tArt.push(await P.evaluate((o) => window.ARTENV.time(o, 120), { region: 'beach', town, clock: 22 }));
  }
  // 背景の画像は最近の 3 シーン分（9 枚）だけ持つ。古い物は手放し、また来たら読み直す
  for (const region of ['swamp', 'casino', 'rooftop', 'spaceport']) await P.evaluate((r) => window.ARTENV.scene({ region: r, town: false, clock: 12 }), region);
  const ev = await P.evaluate(() => window.ARTENV.stats());
  let back = null;
  for (let i = 0; i < 20; i++) { back = await P.evaluate((o) => window.ARTENV.pixels(o, [[300, 555]]), day); if (back[0][0] > 170 && back[0][2] < 120) break; await sleep(100); }
  check('背景: 古い画像を手放し（LRU）、また来た時に読み直して描く', ev.evicted >= 1 && back[0][0] > 170 && back[0][1] > 150 && back[0][2] < 120, `手放した ${ev.evicted} 枚・持っている ${ev.files} 枚・戻った時 ${fmt(back[0])}`);

  if (G.errs.length) check('仮の画像あり: エラーなし', false, G.errs.slice(0, 3).join(' / '));
  else check('仮の画像あり: エラーなし', true);
  await P.close();

  // ---------------------------------------------------------------- 6: 画像なし・読み込み失敗
  const N = await openPreview(browser, 'none');
  const noneBeach = await N.page.evaluate(() => window.ARTENV.scene({ region: 'beach', town: true, clock: 17, camX: 300 }));
  const noneDown = await N.page.evaluate(() => window.ARTENV.scene({ region: 'downtown', town: true, clock: 17, camX: 300 }));
  const noneIcon = await N.page.evaluate(() => window.ARTENV.iconPixels('item', 'cat_ears_neon', 64, [[32, 33]]));
  const noneVeh = await N.page.evaluate(() => window.ARTENV.vehicleData({ kind: 'sports', color: '#19d3c5' }));
  const tCode = [];
  for (const town of [true, false]) tCode.push(await N.page.evaluate((o) => window.ARTENV.time(o, 120), { region: 'beach', town, clock: 22 }));
  check('画像なし: manifest の新しい節が無くてもエラーなし', N.errs.length === 0 && N.stats.entries === 0, N.errs.slice(0, 2).join(' / '));
  check('画像の無い地域（downtown）は今のコードの背景と同じ', downGood === noneDown);
  check('spriteMode=procedural は画像なしの時と同じ背景', procBeach === noneBeach);
  check('spriteMode=procedural はコードのアイコン', JSON.stringify(procIcon) === JSON.stringify(noneIcon), `${fmt(procIcon[0])} / ${fmt(noneIcon[0])}`);
  await N.page.close();
  const F = await openPreview(browser, 'fail');
  const failBeach = await F.page.evaluate(() => window.ARTENV.scene({ region: 'beach', town: true, clock: 17, camX: 300 }));
  const failIcon = await F.page.evaluate(() => window.ARTENV.iconPixels('item', 'cat_ears_neon', 64, [[32, 33]]));
  const failVeh = await F.page.evaluate(() => window.ARTENV.vehicleData({ kind: 'sports', color: '#19d3c5' }));
  check('読み込み失敗（404）: 例外なし・失敗数を数える', F.errs.length === 0 && F.stats.failed === nImg, `failed ${F.stats.failed}・${F.errs.slice(0, 2).join(' / ')}`);
  check('読み込み失敗: 背景・地面は今のコードの絵と同じ', failBeach === noneBeach);
  check('読み込み失敗: アイコン・乗り物は今のコードの絵と同じ', JSON.stringify(failIcon) === JSON.stringify(noneIcon) && JSON.stringify(failVeh) === JSON.stringify(noneVeh));
  await F.page.close();

  // ---------------------------------------------------------------- 7: 性能
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`  性能: 背景＋地面 1回 = 画像 ${tArt.map((x) => x.toFixed(2)).join('/')}ms（町/フィールド・夜）・コードの絵 ${tCode.map((x) => x.toFixed(2)).join('/')}ms`);
  check('性能: 画像の背景＋地面がコードの絵より大きく重くない（1.5 倍＋1ms 以内）', avg(tArt) <= avg(tCode) * 1.5 + 1, `${avg(tArt).toFixed(2)}ms / ${avg(tCode).toFixed(2)}ms`);

  // ---------------------------------------------------------------- 5: ゲーム本体（タイトル・ロゴ・ワールドマップ・町の背景）
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.stack || e.message)));
  await page.route('**/assets/sprites/**', async (route) => {
    if (/webp\.json$/.test(route.request().url())) return route.fulfill({ status: 404, body: '' }); // 偽の manifest の時は WebP を使わない（PNG を差し替えて試すため）
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/__')) return route.continue();
    const rel = decodeURIComponent(u.pathname.split('/assets/sprites/')[1] || '');
    if (rel === 'manifest.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MAN.good) });
    if (IMGS[rel]) return route.fulfill({ status: 200, contentType: 'image/png', body: IMGS[rel] });
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.game && window.game.sprites, null, { timeout: 20000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => { const A = await import('./src/render/artOverrides.js'); await A.preloadArt(['ui']); });
  await sleep(400);
  const tp = await page.evaluate(() => { const g = document.getElementById('game').getContext('2d'); return [[20, 400], [640, 140]].map(([x, y]) => [...g.getImageData(x, y, 1, 1).data]); });
  check('タイトル: 背景に ui/title_art', near(tp[0], COLORS.title, 30), fmt(tp[0]));
  check('タイトル: ロゴに ui/logo', near(tp[1], COLORS.logo, 30), fmt(tp[1]));
  await page.screenshot({ path: path.join(SHOTS, 'art_env_title.png') });
  await page.evaluate(() => { window.game._titleQuick = { slot: 0, create: { classId: 'luna', gender: 'f', name: 'テスト' } }; });
  await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 20000 });
  await page.evaluate(async () => { const A = await import('./src/render/artOverrides.js'); await A.preloadArt(); });
  await sleep(500);
  const mapInfo = await page.evaluate(() => ({ id: window.game.map.id, region: window.game.map.region, town: !!window.game.map.town }));
  await page.screenshot({ path: path.join(SHOTS, 'art_env_game.png') });
  // ゲームの1フレームの時間（町・夜 22時。画像あり → spriteMode=procedural で今のコードの絵）
  const frameMs = async () => page.evaluate(async () => {
    const G = window.game; G.debug.setClock?.(22); G.debug.profile = true;
    await new Promise((r) => setTimeout(r, 300));
    const ms = [], ph = {};
    await new Promise((res) => { const f = () => { ms.push(G.perf.ms); for (const [k, v] of Object.entries(G.perf.phases || {})) ph[k] = (ph[k] || 0) + v; if (ms.length < 180) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    G.debug.profile = false;
    ms.sort((a, b) => a - b);
    return { avg: ms.reduce((a, b) => a + b, 0) / ms.length, p90: ms[Math.floor(ms.length * 0.9)], bg: (ph.bg || 0) / ms.length, tiles: (ph.tiles || 0) / ms.length };
  });
  // 交互に 3 回ずつ測って小さい方（たまたまの揺れを除く）
  const setArt = (v) => page.evaluate(async (v) => (await import('./src/render/artOverrides.js')).setArtEnabled(v), v);
  let fArt = null, fCode = null;
  for (let i = 0; i < 3; i++) {
    await setArt(false); const c = await frameMs(); if (!fCode || c.avg < fCode.avg) fCode = c;
    await setArt(true); const a = await frameMs(); if (!fArt || a.avg < fArt.avg) fArt = a;
    if (process.env.PERF_LOG) console.log('   ', a.avg.toFixed(2), c.avg.toFixed(2));
  }
  console.log(`  性能（ゲームの1フレーム・${mapInfo.id} 夜）: 画像 平均 ${fArt.avg.toFixed(2)}ms・p90 ${fArt.p90.toFixed(2)}ms（背景 ${fArt.bg.toFixed(2)}・地面 ${fArt.tiles.toFixed(2)}）/ コードの絵 平均 ${fCode.avg.toFixed(2)}ms・p90 ${fCode.p90.toFixed(2)}ms（背景 ${fCode.bg.toFixed(2)}・地面 ${fCode.tiles.toFixed(2)}）`);
  check('性能: ゲームの1フレームが前より大きく重くない（1.3 倍＋1ms 以内）', fArt.avg <= fCode.avg * 1.3 + 1, `${fArt.avg.toFixed(2)} / ${fCode.avg.toFixed(2)}ms`);
  await page.evaluate(() => window.game.ui.open('worldmap'));
  await sleep(400);
  const wm = await page.evaluate(() => {
    const g = document.getElementById('game').getContext('2d');
    const out = [];
    for (let i = 0; i < 24; i++) out.push([...g.getImageData(80 + (i % 6) * 210, 110 + Math.floor(i / 6) * 130, 1, 1).data]);
    return out;
  });
  const teal = wm.filter((p) => p[1] > 85 && p[0] < 70 && p[1] > p[0] + 50).length;
  check('ワールドマップ: 下絵に ui/world_map（地名・印は上に描く）', teal >= 12, `下絵の色の点 ${teal}/24`);
  await page.screenshot({ path: path.join(SHOTS, 'art_env_worldmap.png') });
  check('ゲーム本体: エラーなし', errs.length === 0, errs.slice(0, 3).join(' / ') + ` map=${mapInfo.id}`);
  await ctx.close();
} catch (e) {
  check('テストの実行', false, e.stack || e.message);
} finally {
  await browser.close();
  server.close();
}
console.log(`\nart_env: ${pass} passed, ${fail} failed`);
if (problems.length) console.log('問題:\n' + problems.map((p) => '  - ' + p).join('\n'));
process.exit(fail ? 1 : 0);
