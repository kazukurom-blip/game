// 画面写真（playwright）。classic/ を PORT=8701 で配り、ゲームを開いて写真を撮る。
// 実行: node classic/tests/shots.mjs   → classic/tests/screenshots/
//  - full_stand.png / full_walk.png / full_jump.png / full_rope.png / full_ladder.png  … 画面全体（800×600）
//  - zoom2_*.png      … 画面の主人公のまわりを 2 倍に（最近傍）
//  - sheet_frames_x1.png / _x2.png / _x4.png … 立ち・歩き・ジャンプ・縄・はしご・伏せのコマ並べ
// console のエラー・ページのエラーがあれば失敗にする。
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = Number(process.env.PORT) || 8701;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* 次へ */ }
  for (const r of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* 次へ */ }
  }
  throw new Error('playwright が見つかりません');
}

function startServer() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}

const problems = [];
const pw = await loadPlaywright();
const srv = await startServer();
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?test`);
  await page.waitForFunction(() => window.__classic && window.__classic.game);

  const save = async (name, dataUrl) => {
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('  写真:', name);
  };
  // 画面（内部の 800×600 そのまま）と、主人公のまわりの 2 倍
  const shoot = async (name) => {
    const r = await page.evaluate(() => {
      const g = window.__classic.game;
      g.render();
      const full = g.canvas.toDataURL('image/png');
      const p = g.player, cam = g.camera;
      const sx = Math.round(p.x - cam.x) - 100, sy = Math.round(p.y - cam.y) - 110;
      const z = document.createElement('canvas'); z.width = 400; z.height = 260;
      const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false;
      zc.drawImage(g.canvas, sx, sy, 200, 130, 0, 0, 400, 260);
      return { full, zoom: z.toDataURL('image/png'), state: p.state };
    });
    await save(`full_${name}.png`, r.full);
    await save(`zoom2_${name}.png`, r.zoom);
    return r.state;
  };
  const step = (n, keys = []) => page.evaluate(([n, keys]) => {
    const g = window.__classic.game;
    for (let i = 0; i < n; i++) { for (const k of keys) g.input.press(k); g.tick(); }
    g.input.releaseAll();
  }, [n, keys]);
  const place = (x, y, facing = 1) => page.evaluate(([x, y, facing]) => {
    const g = window.__classic.game, p = g.player;
    Object.assign(p, { x, y, vx: 0, vy: 0, state: 'air', seg: null, rope: null, facing });
    for (let i = 0; i < 40; i++) g.tick();
    g.camera.snap(p);
  }, [x, y, facing]);

  // 1. 立ち（出現の位置から少し右）
  await place(330, 600);
  await step(20);
  const s1 = await shoot('stand');
  if (s1 !== 'stand') problems.push(`立ちのはずが ${s1}`);
  // 2. 歩き
  await step(30, ['right']);
  await page.evaluate(() => { const g = window.__classic.game; g.input.press('right'); g.tick(); g.camera.snap(g.player); });
  const s2 = await shoot('walk');
  await page.evaluate(() => window.__classic.game.input.releaseAll());
  if (s2 !== 'walk') problems.push(`歩きのはずが ${s2}`);
  // 3. ジャンプ（上がりきる少し前）
  await place(260, 640);
  await step(1, ['jump']);
  await step(12);
  const s3 = await shoot('jump');
  if (s3 !== 'air') problems.push(`ジャンプのはずが ${s3}`);
  // 4. 縄（地面から ↑ でつかまって少し上る）
  await place(600, 640, -1);
  await step(40, ['up']);
  await page.evaluate(() => window.__classic.game.camera.snap(window.__classic.game.player));
  const s4 = await shoot('rope');
  if (s4 !== 'rope') problems.push(`縄のはずが ${s4}`);
  // 5. はしご
  await place(1000, 592);
  await step(50, ['up']);
  await page.evaluate(() => window.__classic.game.camera.snap(window.__classic.game.player));
  const s5 = await shoot('ladder');
  if (s5 !== 'ladder') problems.push(`はしごのはずが ${s5}`);

  // 6. コマ並べ
  const sheets = await page.evaluate(async () => {
    const A = await import('/src/render/avatar/avatar.js');
    const S = await import('/src/render/avatar/skeleton.js');
    const rows = [['stand1', '立ち'], ['walk1', '歩き'], ['jump', 'ジャンプ'], ['rope', '縄'], ['ladder', 'はしご'], ['prone', '伏せ']];
    const cols = Math.max(...rows.map(([a]) => S.ANIMS[a].frames.length));
    const out = {};
    for (const scale of [1, 2, 4]) {
      const cw = A.FRAME_W * scale, ch = A.FRAME_H * scale, label = 70;
      const c = document.createElement('canvas');
      c.width = label + cols * (cw + 4) + 4; c.height = rows.length * (ch + 4) + 4;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#20242c'; g.fillRect(0, 0, c.width, c.height);
      rows.forEach(([anim, name], r) => {
        g.fillStyle = '#ffffff'; g.font = '12px sans-serif';
        g.fillText(name, 6, 4 + r * (ch + 4) + ch / 2);
        g.fillText(anim, 6, 4 + r * (ch + 4) + ch / 2 + 14);
        S.ANIMS[anim].frames.forEach((_, i) => {
          const x = label + i * (cw + 4), y = 4 + r * (ch + 4);
          g.fillStyle = '#b8e0f8'; g.fillRect(x, y, cw, ch);
          g.fillStyle = '#9cc8e8'; g.fillRect(x, y + (A.ORIGIN_Y) * scale, cw, scale); // 足元の線
          g.drawImage(A.composeFrame(A.DEFAULT_LOOK, anim, i), x, y, cw, ch);
          g.fillStyle = '#20242c'; g.font = '10px sans-serif';
          g.fillText(`${anim}/${i}`, x + 3, y + 11);
        });
      });
      out[scale] = c.toDataURL('image/png');
    }
    return out;
  });
  for (const s of [1, 2, 4]) await save(`sheet_frames_x${s}.png`, sheets[s]);

  // 7. 画面全体を 2 倍（ブラウザの表示の拡大）で 1 枚
  await page.setViewportSize({ width: 1600, height: 1200 });
  await place(330, 600);
  await step(10);
  await page.evaluate(() => { window.__classic.game.render(); dispatchEvent(new Event('resize')); });
  await page.screenshot({ path: path.join(SHOTS, 'full_stand_x2_browser.png') });
  console.log('  写真: full_stand_x2_browser.png');

  const err = await page.evaluate(() => window.__classic.game.lastError);
  if (err) problems.push(`lastError: ${err}`);
} finally {
  await browser.close();
  srv.close();
}
if (problems.length) { console.log('問題:\n' + problems.join('\n')); process.exit(1); }
console.log('ok');
