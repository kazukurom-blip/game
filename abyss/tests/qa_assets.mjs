// 画像の差し替えの QA（wave 3）: ほかの AI で作ったような画像（白・緑の背景・ずれた位置・違う縦横比・大きな画像・コマ送り）で
// 「入れたら正しく使えるか」を確かめる。Node だけの確かめ（画素の計算・設定の読み方・パック・手引きの正しさ）と、Chromium の確かめ（実際の加工・戦闘の描画）。
// 実行: node tests/qa_assets.mjs（PORT=8306 などで Chromium の待ち受けの番号。--node だけなら Chromium を使わない）
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as AS from '../src/render/assets.js';
import { buildManifest, installManifest, CATEGORIES } from '../src/render/manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8316;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const NODE_ONLY = process.argv.includes('--node');
const { findFeet, autoProc, procFromOpts, validatePack } = AS;
const procOverrides = AS.procOverrides || (() => { throw new Error('procOverrides が無い'); });
const FEET_KINDS = AS.FEET_KINDS || new Set(); const BOX_KINDS = AS.BOX_KINDS || new Set();

let pass = 0; let fail = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; console.log(`✔ ${name}`); } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const near = (a, b, d, m = '') => { if (!(Math.abs(a - b) <= d)) throw new Error(`${m} ${a} と ${b} の差が ${d} より大きい`); };

await installManifest();
const S = buildManifest();

// ================================================================ Node だけ
// 四つ足の獣: 足が 4 本（同じ太さ）。足元の基準点は前足と後ろ足の真ん中で、左右反転しても同じ所（鏡写し）
await t('足元の基準点: 四つ足は足の真ん中・左右反転しても鏡写しの位置', () => {
  const W = 200; const H = 100;
  const mk = (legs) => { const d = new Uint8ClampedArray(W * H * 4); for (const lx of legs) for (let y = 40; y < 90; y++) for (let x = lx; x < lx + 10; x++) d[(y * W + x) * 4 + 3] = 255; return d; };
  const legs = [30, 60, 120, 150];
  const a = findFeet(mk(legs), W, H);
  const b = findFeet(mk(legs.map((x) => W - 10 - x)), W, H);
  near(a.ax + b.ax, 1, 0.006, '鏡写し');
  near(a.ax, (60 + 9 + 120) / 2 / W + 0.5 / W, 0.01, '2 本目と 3 本目の足の間');
});
await t('地面の帯は上の透明な所だけ切る（キャラが宙に浮かない）・中景と奥は切らない', () => {
  const g = S.find((s) => s.id === 'bg.act1.ground');
  eq(autoProc(g, false, { color: [0, 255, 0] }).trim, 'top', '緑の空');
  eq(autoProc(g, true).trim, 'top', '透明な PNG');
  eq(autoProc(S.find((s) => s.id === 'bg.act1.mid'), false, { color: [0, 255, 0] }).trim, false);
  eq(autoProc(S.find((s) => s.id === 'bg.act1'), false).trim, false);
});
await t('設定の .json の加工の項目は書いた物だけ（書いていない項目は自動のまま）', () => {
  eq(JSON.stringify(procOverrides({ ax: 0.5, frames: 4 })), '{}');
  const p = procOverrides({ bg: 'none', trim: false, flip: true, crop: { b: 10 }, tol: 30 });
  eq(p.bg, 'none'); eq(p.trim, false); eq(p.flip, true); eq(p.crop.b, 10); eq(p.tol, 30);
  eq(procOverrides({ trim: 'top' }).trim, 'top');
  eq(procOverrides({ chroma: { tol: 20 } }).bg, 'auto');
  eq(procOverrides({ proc: { bg: 'black' } }).bg, 'black');
  const old = procFromOpts({}); eq(old.bg, 'none'); eq(old.trim, false); // 前からの呼び方（書いていなければ「しない」）
});
await t('画像パック: 元の画像（orig）も data URL だけ（外の URL を読みに行かない）', () => {
  const d = 'data:image/png;base64,AAAA';
  eq(validatePack({ format: 'abyss-drop-assetpack', assets: { 'a.b': { data: d, orig: d } } }), null);
  ok(validatePack({ format: 'abyss-drop-assetpack', assets: { 'a.b': { data: d, orig: 'https://example.com/x.png' } } }), '外の URL を通した');
});
await t('足元・置き直しの種類は枠の種類と合う', () => { ok(FEET_KINDS.size && BOX_KINDS.size, '種類の一覧が無い'); for (const k of FEET_KINDS) ok(S.some((s) => s.kind === k), k); for (const k of BOX_KINDS) ok(S.some((s) => s.kind === k), k); });
await t('docs/AI_PROMPTS.md と .csv が枠の一覧と同じ（違うなら node tools/gen_prompts.mjs を実行）', async () => {
  const { genPrompts } = await import('../tools/gen_prompts.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-qa-prompts-'));
  try {
    const r = await genPrompts({ outDir: tmp, quiet: true });
    eq(fs.readFileSync(r.mdPath, 'utf8') === fs.readFileSync(path.join(ROOT, 'docs', 'AI_PROMPTS.md'), 'utf8'), true, 'AI_PROMPTS.md が古い');
    eq(fs.readFileSync(r.csvPath, 'utf8') === fs.readFileSync(path.join(ROOT, 'docs', 'AI_PROMPTS.csv'), 'utf8'), true, 'AI_PROMPTS.csv が古い');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
await t('docs/ASSETS.md の枠の数（分類ごと）が枠の一覧と同じ', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'ASSETS.md'), 'utf8');
  const m = /絵 (\d+)\*\*（(.+?)）＋/.exec(md);
  ok(m, '枠の数の行が無い');
  eq(Number(m[1]), S.length, '合計');
  // 分類の順（CATEGORIES）に「名前 数」が並ぶ
  const nums = [...m[2].matchAll(/ (\d+)(?:・|$)/g)].map((x) => Number(x[1]));
  eq(JSON.stringify(nums), JSON.stringify(CATEGORIES.map((c) => S.filter((s) => s.cat === c.id).length)), '分類ごとの数');
});
await t('docs/ASSETS.md に書いたボタン・項目の名前が画像の窓に本当にある', () => {
  const src = ['assets.js', 'assets_editor.js', 'assets_preview.js', 'assets_util.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src', 'ui', 'panels', f), 'utf8')).join('\n') + fs.readFileSync(path.join(ROOT, 'src', 'ui', 'nav.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src', 'render', 'manifest.js'), 'utf8');
  const labels = ['まとめて取り込む', 'パックを書き出す', 'パックを読み込む', 'すべて元に戻す', '戦闘画面で見る', '◀ 調整に戻る', '保存して使う', '入れた画像を消す', '型紙を保存', '型紙を見る', '足元を自動で', 'アンカーを推定',
    '左右反転', '上の透明な所を切る', '透明な外側を切る', '文字で表示', 'コピー', '許容値', '縁のなじませ', 'つながった所だけ', '閉じた穴も消す', 'ほぼ黒を真っ黒に', '四隅の色を自動で抜く', '色を選んで抜く（スポイト）',
    '黒を透明に', '下を切る', '左右をつなげる', 'コマ送り', '大きさ', '回転', '重ね方', '差し替えた物だけ', 'まだの物だけ', '手（武器）', 'その他', '画像'];
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'ASSETS.md'), 'utf8');
  for (const l of labels) { ok(md.includes(l), `手引きに無い: ${l}`); ok(src.includes(l), `画像の窓に無い: ${l}`); }
  ok(md.includes('「⚙ その他」→「🖼 画像」'), '画像の窓の開き方（その他のまとまりの中）');
});

// ================================================================ Chromium
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  for (const r of ['/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  return null;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const pw = NODE_ONLY ? null : await loadPlaywright();
if (!NODE_ONLY && !pw) { fail++; console.log('✘ playwright が見つかりません'); }
if (pw) {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('fonts.g') && !r.url().includes('__qa_missing')) errors.push(`http ${r.status()}: ${r.url()}`); });
  // assets/custom の代わり: 設定の .json が無い緑の背景の狼・白い背景のゾンビ（bg は none と書いた物）
  await page.route('**/assets/custom/custom.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ 'monster.ash_wolf': '__qa/wolf.png', 'monster.rot_zombie': { file: '__qa/zombie.png', opts: { bg: 'none' } } }) }));
  const imgs = {};
  await page.route('**/assets/custom/__qa/**', (r) => { const n = r.request().url().split('/').pop(); r.fulfill({ contentType: 'image/png', body: imgs[n] }); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('#title');

  // ---- テスト用の画像（ブラウザの canvas で作る。AI の出力のような単色の背景・ずれた位置・違う縦横比）
  const installImg = () => page.evaluate(() => {
    window.__qaImg = (o) => {
      const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
      const x = c.getContext('2d');
      if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, o.w, o.h); }
      const fr = o.frames || 1; const W = o.w / fr; const H = o.h;
      for (let f = 0; f < fr; f++) {
        x.save(); x.translate(f * W + (o.dx || 0) * W, 0);
        x.fillStyle = o.color || '#6a6a74';
        if (o.shape === 'beast') { // 右向きの獣（足 4 本・頭が右）
          x.beginPath(); x.ellipse(W * 0.45, H * 0.6, W * 0.25, H * 0.13, 0, 0, 7); x.fill();
          x.beginPath(); x.arc(W * 0.75, H * 0.5, H * 0.09, 0, 7); x.fill();
          for (const lx of [0.25, 0.33, 0.55, 0.62]) x.fillRect(W * lx, H * 0.66, W * 0.04, H * 0.22);
        } else if (o.shape === 'dagger') { // 縦長の短剣（先が上）
          x.fillStyle = '#d8dee8'; x.beginPath(); x.moveTo(W * 0.45, H * 0.6); x.lineTo(W * 0.5, H * 0.1); x.lineTo(W * 0.55, H * 0.6); x.fill();
          x.fillStyle = '#d9a83a'; x.fillRect(W * 0.35, H * 0.6, W * 0.3, H * 0.04); x.fillStyle = '#5a3820'; x.fillRect(W * 0.47, H * 0.64, W * 0.06, H * 0.26);
        } else if (o.shape === 'hero') { // 右向きの人（前の腕を少し前へ）
          x.fillStyle = '#3a2a22'; x.fillRect(W * 0.42, H * 0.6, W * 0.07, H * 0.3); x.fillRect(W * 0.52, H * 0.6, W * 0.07, H * 0.3);
          x.fillStyle = '#3060c0'; x.beginPath(); x.ellipse(W * 0.5, H * 0.43, W * 0.13, H * 0.19, 0, 0, 7); x.fill();
          x.fillStyle = '#e8b890'; x.beginPath(); x.arc(W * 0.52, H * 0.17, W * 0.08, 0, 7); x.fill();
          x.fillStyle = '#3060c0'; x.fillRect(W * 0.55, H * 0.42, W * 0.12, W * 0.05); x.fillStyle = '#e8b890'; x.beginPath(); x.arc(W * 0.68, H * 0.45, W * 0.03, 0, 7); x.fill();
        } else if (o.shape === 'ground') { // 地面の帯（上 35% は空 = 緑）
          x.fillStyle = '#4a3a2a'; x.fillRect(0, H * 0.35, W, H * 0.65);
        } else if (o.shape === 'glow') {
          const g = x.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, Math.min(W, H) * 0.4); g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#60a0ff'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        } else if (o.shape === 'arrow') { // 左向きの矢（先が左）
          x.fillStyle = '#c0c4cc'; x.beginPath(); x.moveTo(W * 0.1, H * 0.5); x.lineTo(W * 0.25, H * 0.4); x.lineTo(W * 0.25, H * 0.6); x.fill(); x.fillStyle = '#7a5232'; x.fillRect(W * 0.25, H * 0.47, W * 0.6, H * 0.06);
        }
        x.restore();
      }
      return new Promise((res) => c.toBlob((b) => res(new File([b], o.name, { type: 'image/png' })), 'image/png'));
    };
  });
  await installImg();
  const png = async (o) => Buffer.from(await page.evaluate(async (o) => { const f = await window.__qaImg(o); return [...new Uint8Array(await f.arrayBuffer())]; }, o));
  imgs['wolf.png'] = await png({ name: 'wolf.png', w: 1024, h: 1024, bg: '#00ff00', shape: 'beast' });
  imgs['zombie.png'] = await png({ name: 'zombie.png', w: 600, h: 900, bg: '#ffffff', shape: 'hero' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('abyss.assets.rights', '1'); });
  await page.reload();
  await page.waitForSelector('#title');
  await page.waitForFunction(() => window.__assets?.ready);
  await installImg();
  await page.click('.slot.empty .btn');
  await page.waitForSelector('.classcards');
  await page.click('.title-box .btn-primary');
  await page.waitForSelector('#scene');
  await page.waitForTimeout(300);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // ページの中で: 画像を作って quickImport で入れる（カードの「入れる」と同じ）
  await ev(() => {
    window.__qaPut = async (id, o, extra) => { const { quickImport } = await import('./src/ui/panels/assets.js'); return quickImport(window.__ui, id, await window.__qaImg(o), false, extra || {}); };
    // 絵のある範囲（透明度 40 より上）の高さ・幅（枠の高さを 1 として。差し替え画像は sprite の大きさで、コードの絵は枠で）
    window.__qaFill = async (id) => {
      const { alphaBBox } = await import('./src/render/assets.js');
      const A = window.__assets; const s = A.sprite(id);
      const fw = s.img.width / (s.frames || 1);
      const c = document.createElement('canvas'); c.width = fw; c.height = s.img.height;
      c.getContext('2d').drawImage(s.img, 0, 0, fw, s.img.height, 0, 0, fw, s.img.height);
      const bb = alphaBBox(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height, 40);
      const k = s.sh / s.img.height; // 画面の px への倍率
      return { h: (bb.y1 - bb.y0 + 1) * k, w: (bb.x1 - bb.x0 + 1) * k, x0: bb.x0 / fw, x1: (bb.x1 + 1) / fw, y0: bb.y0 / s.img.height, y1: (bb.y1 + 1) / s.img.height, s };
    };
    // 絵のある範囲の左上の角の画素（背景を抜かなかったら背景の色が残っている）
    window.__qaCorner = (e) => {
      const { img } = e; const c = img.getContext('2d'); const d = c.getImageData(0, 0, img.width, img.height).data;
      let x0 = img.width; let y0 = img.height;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; }
      const p = c.getImageData(Math.min(img.width - 1, x0 + 3), Math.min(img.height - 1, y0 + 3), 1, 1).data;
      return { r: p[0], g: p[1], b: p[2], a: p[3], bg: e.proc?.bg };
    };
    // コードの絵の絵のある範囲（枠の大きさの px と、枠の中の割合）
    window.__qaCodeFill = async (id) => {
      const { alphaBBox } = await import('./src/render/assets.js');
      const A = window.__assets; const sp = A.spec(id); const c = A.fallbackCanvas(id);
      const bb = alphaBBox(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height, 40);
      return { h: ((bb.y1 - bb.y0 + 1) / c.height) * sp.h, w: ((bb.x1 - bb.x0 + 1) / c.width) * sp.w, y0: bb.y0 / c.height, y1: (bb.y1 + 1) / c.height };
    };
  });

  await t('フォルダの画像（設定の .json なし）も自動で背景を抜き・外側を切り・足元を合わせる', async () => {
    const r = await ev(() => { const A = window.__assets; const z = A.folder.get('monster.ash_wolf'); const d = z.img.getContext('2d').getImageData(0, 0, 1, 1).data; return { src: A.custom.get('monster.ash_wolf')?.source, corner: d[3], w: z.img.width, h: z.img.height, ay: z.opts.ay, ax: z.opts.ax, bg: z.proc?.bg }; });
    eq(r.src, 'folder'); eq(r.corner, 0, '緑の背景が残った'); eq(r.bg, 'auto');
    ok(r.ay > 0.9 && r.ay <= 1, `足元 ay=${r.ay}`); ok(r.h <= 300, `大きさ ${r.w}x${r.h}`);
  });
  await t('フォルダの画像: 設定の .json に書いた項目（bg: none）はそちらを使う', async () => {
    const r = await ev(() => window.__qaCorner(window.__assets.folder.get('monster.rot_zombie')));
    eq(r.bg, 'none'); eq(r.a, 255, '書いた通り背景は抜かない（白い背景が残る）'); ok(r.r > 240 && r.g > 240, `白 ${r.r},${r.g}`);
  });
  await t('外側を切った画像はコードの絵と同じ大きさになる（短剣が両手剣ほどに・狼が 1.4 倍にならない）', async () => {
    await ev(() => window.__qaPut('gear.dagger', { name: 'gear.dagger.png', w: 1024, h: 1024, bg: '#00ff00', shape: 'dagger' }));
    await ev(() => window.__qaPut('pet.emberfox', { name: 'pet.emberfox.png', w: 1536, h: 1024, bg: '#ffffff', shape: 'beast', color: '#ff8a3a', dx: -0.2 }));
    for (const id of ['gear.dagger', 'pet.emberfox', 'monster.ash_wolf']) {
      const r = await ev(async (id) => { const a = await window.__qaFill(id); const b = await window.__qaCodeFill(id); return { a: a.h, b: b.h }; }, id);
      near(r.a / r.b, 1, 0.12, `${id} 差し替え ${r.a.toFixed(1)}px / コードの絵 ${r.b.toFixed(1)}px`);
    }
  });
  await t('主人公の体: 外側を切ってもコードの体と同じ高さに置かれ、既定のアンカー（頭・手）が体の同じ所に来る', async () => {
    await ev(() => window.__qaPut('hero.warrior.body', { name: 'hero.warrior.body.png', w: 1024, h: 1536, bg: '#ffffff', shape: 'hero', dx: -0.15 }));
    const r = await ev(async () => { const a = await window.__qaFill('hero.warrior.body'); const b = await window.__qaCodeFill('hero.warrior.body'); return { x0: a.x0, x1: a.x1, y0: a.y0, y1: a.y1, cy0: b.y0, cy1: b.y1, hand: a.s.anchors.hand, head: a.s.anchors.head, ay: a.s.ay }; });
    near(r.y0, r.cy0, 0.03, '頭のてっぺん（コードの体と同じ高さ）');
    near(r.y1, r.cy1, 0.03, '足の裏');
    ok(r.head[1] > r.y0 && r.head[1] < r.y0 + (r.y1 - r.y0) * 0.25, `頭のアンカーが頭の所に無い（${r.head[1]}・体 ${r.y0.toFixed(2)}〜${r.y1.toFixed(2)}）`);
    const rel = (r.hand[0] - r.x0) / (r.x1 - r.x0);
    ok(rel > 0.55 && rel < 1.05, `手は体の横幅の ${(rel * 100).toFixed(0)}% の所（体 ${r.x0.toFixed(2)}〜${r.x1.toFixed(2)}・手 ${r.hand[0]}）`);
    near(r.ay, r.y1, 0.02, '足元');
  });
  await t('地面の帯: 上の緑（空）を抜いて切り、歩く面が帯の上の端に来る', async () => {
    await ev(() => window.__qaPut('bg.act1.ground', { name: 'bg.act1.ground.png', w: 1536, h: 512, bg: '#00ff00', shape: 'ground' }));
    const r = await ev(() => { const A = window.__assets; const s = A.sprite('bg.act1.ground'); const c = s.img.getContext('2d'); const row = (y) => { const d = c.getImageData(0, y, s.img.width, 1).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n / s.img.width; }; return { top: row(4), w: s.img.width, h: s.img.height, sw: s.sw, sh: s.sh }; });
    ok(r.top > 0.9, `帯の上の端に地面が無い（${(r.top * 100).toFixed(0)}%）`);
    eq(Math.round(r.sw), 1280); ok(r.sh < 300, `帯の高さ ${r.sh}`);
  });
  await t('調整の窓: 地面の帯（上が緑の空・下が地面）で「四隅の色がそろっていません」と間違って注意しない', async () => {
    const r = await ev(async () => {
      const { openEditor } = await import('./src/ui/panels/assets_editor.js');
      const md = await openEditor(window.__ui, 'bg.act2.ground', { file: await window.__qaImg({ name: 'bg.act2.ground.png', w: 1536, h: 512, bg: '#00ff00', shape: 'ground' }) });
      await new Promise((res) => setTimeout(res, 400));
      const warn = document.querySelector('.modal.studio')?.textContent || '';
      const label = [...document.querySelectorAll('.modal.studio label')].map((l) => l.textContent).join('|');
      md.close();
      return { corners: warn.includes('四隅の色がそろっていません'), label };
    });
    eq(r.corners, false, '地面で四隅の注意が出た');
    ok(r.label.includes('上の透明な所を切る'), `地面の「形」の項目 ${r.label}`);
  });
  await t('調整の窓: 左右反転すると基準点（足元）も鏡写しになり、足元を探し直した位置と同じ', async () => {
    const r = await ev(async () => {
      const { openEditor } = await import('./src/ui/panels/assets_editor.js');
      const { detectAnchors } = await import('./src/render/assets.js');
      const A = window.__assets; const id = 'monster.ash_wolf';
      A.studio.delete(id); A.rebuild();
      const md = await openEditor(window.__ui, id, { file: await window.__qaImg({ name: 'monster.ash_wolf.png', w: 1024, h: 1024, bg: '#ff00ff', shape: 'beast', dx: -0.18 }) });
      await new Promise((res) => setTimeout(res, 400));
      const before = A.drafts.get(id).opts.ax;
      const box = [...document.querySelectorAll('.modal.studio label')].find((l) => l.textContent.includes('左右反転')).querySelector('input');
      box.click();
      await new Promise((res) => setTimeout(res, 300));
      const d = A.drafts.get(id);
      const det = detectAnchors(d.img, 1).feet.ax;
      md.close();
      return { before, after: d.opts.ax, det };
    });
    near(r.before + r.after, 1, 0.002, '鏡写し');
    near(r.after, r.det, 0.02, '探し直した足元');
  });
  await t('まとめて取り込む: 設定の .json（@4f の名前も）の加工の項目（flip・bg）を使う', async () => {
    const r = await ev(async () => {
      const { bulkImport } = await import('./src/ui/panels/assets.js');
      const img = await window.__qaImg({ name: 'fx.s_bolt.proj@4f.png', w: 1024, h: 256, bg: '#000000', shape: 'glow', frames: 4 });
      const side = new File([JSON.stringify({ flip: true, bg: 'black', fps: 14 })], 'fx.s_bolt.proj@4f.json', { type: 'application/json' });
      const wolf = await window.__qaImg({ name: 'monster.ash_wolf.png', w: 800, h: 800, bg: '#00ff00', shape: 'beast' });
      const wside = new File([JSON.stringify({ bg: 'none' })], 'monster.ash_wolf.json', { type: 'application/json' });
      await bulkImport(window.__ui, [img, side, wolf, wside]);
      document.querySelector('.modal-foot .btn-primary')?.click();
      const A = window.__assets; const s = A.studio.get('fx.s_bolt.proj'); const w = A.studio.get('monster.ash_wolf');
      return { flip: s?.proc?.flip, bg: s?.proc?.bg, frames: s?.opts?.frames, fps: s?.opts?.fps, wbg: w?.proc?.bg, w: window.__qaCorner(w) };
    });
    eq(r.flip, true, 'flip'); eq(r.bg, 'black', 'bg'); eq(r.frames, 4); eq(r.fps, 14);
    eq(r.wbg, 'none'); eq(r.w.a, 255, '緑の背景が残る'); ok(r.w.g > 240 && r.w.r < 30, `緑 ${r.w.r},${r.w.g}`);
  });

  // ---- 戦闘の描画: assets.draw の呼び出しを記録する
  const drawLog = (fn) => ev(async (src) => {
    const A = window.__assets; const g = window.__game; const scene = window.__ui.scene; const c = g.combat;
    const log = [];
    const orig = A.draw.bind(A);
    A.draw = (ctx, id, x, y, o = {}) => { const s = typeof id === 'string' ? id : id?.id; log.push({ id: s, rot: o.rot ?? 0 }); return orig(ctx, id, x, y, o); };
    try {
      // eslint-disable-next-line no-new-func
      await new Function('A', 'g', 'scene', 'c', `return (async () => { ${src} })()`)(A, g, scene, c);
      for (let i = 0; i < 24; i++) { g.tick(0.05); scene.frame(0.05); }
    } finally { A.draw = orig; }
    const by = {};
    for (const l of log) { if (!l.id) continue; (by[l.id] ||= []).push(l.rot); }
    return by;
  }, fn);
  // 小さな差し替え画像（光の演出の枠に入れる）
  await ev(() => {
    const c0 = document.createElement('canvas'); c0.width = 64; c0.height = 32; const x = c0.getContext('2d'); x.fillStyle = '#ff8040'; x.fillRect(4, 4, 56, 24);
    window.__qaSet = (ids) => { const A = window.__assets; for (const id of ids) A.custom.set(id, { img: c0, opts: { blend: 'lighter' }, source: 'studio' }); A.changed(); };
    window.__qaClear = (ids) => { const A = window.__assets; for (const id of ids) A.custom.delete(id); A.rebuild(); for (const [id, v] of A.studio) A.custom.set(id, v); A.changed(); };
  });

  await t('敵の弾の差し替え画像（左向き）は、左へ飛ぶとき回さない（後ろ向き・逆さまにならない）', async () => {
    await ev(() => window.__qaPut('fx.enemy.arrow', { name: 'fx.enemy.arrow.png', w: 1536, h: 1024, bg: '#000000', shape: 'arrow' }));
    const by = await drawLog("const h = c.hero; c.spawnProj({ src: h, team: 'enemy', x: h.x + 500, y: h.y, z: 50, tx: h.x - 400, ty: h.y, speed: 250, dmg: 0, el: 'phys', range: 1200, art: 'fx.enemy.arrow' });");
    ok(by['fx.enemy.arrow']?.length, '描かれていない');
    for (const r of by['fx.enemy.arrow']) near(Math.abs(Math.atan2(Math.sin(r), Math.cos(r))), 0, 0.15, '回転');
  });
  await t('敵の攻撃の範囲（叩きつけ・隕石）とペットの回復の光の差し替え画像が戦闘で出る', async () => {
    await ev(() => window.__qaSet(['fx.enemy.slam', 'fx.enemy.meteor', 'fx.pet.heal']));
    const by = await drawLog("const h = c.hero; c.spawnArea({ team: 'enemy', x: h.x + 60, y: h.y, r: 100, delay: 0.01, dmg: 0, el: 'phys', src: h, art: 'fx.enemy.slam' }); c.spawnArea({ team: 'enemy', x: h.x + 90, y: h.y, r: 90, delay: 0.2, dmg: 0, el: 'fire', src: h, art: 'fx.enemy.meteor' }); c.emit({ t: 'pulse', x: h.x, y: h.y, r: 70, el: 'poison', team: 'hero', art: 'fx.pet.heal' });");
    for (const id of ['fx.enemy.slam', 'fx.enemy.meteor', 'fx.pet.heal']) ok(by[id]?.length, `${id} が描かれていない`);
    await ev(() => window.__qaClear(['fx.enemy.slam', 'fx.enemy.meteor', 'fx.pet.heal']));
  });
  await t('スキルの演出の部品（強化・障壁・召喚・罠・連鎖・光線・呪い・オーラ・残像・回る刃・隕石・当たった瞬間）の差し替え画像が戦闘で出る', async () => {
    const parts = ['fx.w_shout.buff', 'fx.s_armor.buff', 'fx.n_skeleton.summon', 'fx.r_trap.trap', 'fx.s_chain.chain', 'fx.s_chain.hit', 'fx.s_beam.beam', 'fx.n_curse.curse', 'fx.n_curse.area', 'fx.w_charge.trail', 'fx.w_axes.proj', 'fx.s_meteor.proj', 'fx.w_slash.hit', 'fx.w_cleave.hit', 'fx.w_whirl.swing'];
    const have = await ev((ids) => ids.filter((id) => window.__assets.slots.has(id)), parts);
    eq(have.length, parts.length, `枠が無い: ${parts.filter((p) => !have.includes(p)).join(', ')}`);
    await ev((ids) => window.__qaSet(ids), parts);
    const by = await drawLog(`
      const h = c.hero; const H = (t, o) => c.emit({ t, ...o });
      // 敵を 1 体、主人公の前に置く（範囲の技の「当たった瞬間」用）
      let m = c.units.find((u) => u.team !== 'hero' && !u.dead);
      if (!m) { c.spawnMonster?.('rot_zombie', { x: h.x + 120 }); m = c.units.find((u) => u.team !== 'hero' && !u.dead); }
      if (m) { m.x = h.x + 120; m.y = h.y; }
      H('buff', { unit: h, el: 'phys', skill: 'w_shout', dur: 3 });
      H('shield', { unit: h, v: 10, max: 10, dur: 1, skill: 's_armor', el: 'cold' });
      H('summon', { x: h.x + 60, y: h.y, unit: h, skill: 'n_skeleton', kind: 'skeleton' });
      c.spawnArea({ team: 'hero', kind: 'trap', x: h.x + 200, y: h.y, r: 130, delay: 0.1, life: 10, trigger: 1, p: { id: 'r_trap', element: 'phys' }, src: h, el: 'phys' });
      H('chain', { pts: [{ x: h.x, y: h.y, z: 70 }, { x: h.x + 200, y: h.y, z: 50 }, { x: h.x + 320, y: h.y + 20, z: 50 }], el: 'lightning', skill: 's_chain' });
      H('beam', { unit: h, x1: h.x + 30, y1: h.y, x2: h.x + 500, y2: h.y, w: 40, dur: 0.5, skill: 's_beam', el: 'fire' });
      H('curse', { x: h.x + 150, y: h.y, r: 120, skill: 'n_curse', el: 'void', curse: {} });
      H('dash', { unit: h, x0: h.x - 200, y0: h.y, x1: h.x, y1: h.y, dur: 0.2, skill: 'w_charge', el: 'phys' });
      H('orbit', { unit: h, n: 3, r: 80, dur: 1, speed: 3.4, skill: 'w_axes', el: 'phys' });
      H('meteor', { x: h.x + 200, y: h.y, r: 120, delay: 0.5, skill: 's_meteor', el: 'fire' });
      H('swing', { x: h.x + 60, y: h.y, r: 80, el: 'phys', skill: 'w_slash', src: h });
      if (m) H('nova', { x: m.x, y: m.y, r: 200, el: 'phys', skill: 'w_cleave' });
      H('whirl', { unit: h, r: 140, dur: 0.5, skill: 'w_whirl', el: 'phys' });
    `);
    const missing = parts.filter((id) => !by[id]?.length);
    ok(!missing.length, `戦闘で描かれていない: ${missing.join(', ')}`);
    await ev((ids) => window.__qaClear(ids), parts);
  });
  await t('戦闘の敵の絵にも、画像の窓の「回転」が効く（試し表示と同じ）', async () => {
    const r = await ev(async () => {
      const A = window.__assets; const g = window.__game; const scene = window.__ui.scene;
      const m = g.combat.units.find((u) => u.team !== 'hero' && !u.dead && u.art);
      if (!m) return { none: true };
      const c0 = document.createElement('canvas'); c0.width = 80; c0.height = 120; c0.getContext('2d').fillRect(10, 10, 60, 100);
      A.custom.set(m.art, { img: c0, opts: { rot: 30 }, source: 'studio' }); A.changed();
      const rots = [];
      const proto = CanvasRenderingContext2D.prototype; const o = proto.rotate;
      proto.rotate = function (a) { rots.push(a); return o.call(this, a); };
      try { scene.frame(0.016); } finally { proto.rotate = o; }
      A.custom.delete(m.art); A.rebuild(); for (const [id, v] of A.studio) A.custom.set(id, v); A.changed();
      return { rots: rots.filter((a) => Math.abs(a - Math.PI / 6) < 0.01).length };
    });
    ok(r.none || r.rots > 0, '回転が使われていない');
  });
  await t('パックの読み込みは画像を PNG に作り直さない（1 枚 1 秒かかることがあり、100 枚で何分も待つ）', async () => {
    const r = await ev(async () => {
      const A = window.__assets;
      const pack = await A.exportPack({});
      const n0 = Object.keys(pack.assets).length;
      const proto = HTMLCanvasElement.prototype; const o = proto.toBlob; let calls = 0;
      proto.toBlob = function (...a) { calls++; return o.apply(this, a); };
      let n = 0;
      try { n = await A.importPack(pack); } finally { proto.toBlob = o; }
      return { n0, n, calls };
    });
    ok(r.n0 >= 3, `パックの画像 ${r.n0}`); eq(r.n, r.n0); eq(r.calls, 0, 'toBlob を呼んだ回数');
  });
  await t('保存できなかった（容量がいっぱい）ときは知らせる', async () => {
    const r = await ev(async () => {
      const proto = IDBObjectStore.prototype; const o = proto.put;
      proto.put = function () { throw new DOMException('quota', 'QuotaExceededError'); };
      try { await window.__qaPut('icon.mat.echo', { name: 'icon.mat.echo.png', w: 256, h: 256, bg: '#00ff00', shape: 'glow' }); } finally { proto.put = o; }
      return [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' / ');
    });
    ok(r.includes('保存できませんでした'), r);
  });
  await t('エラーが 0 件', () => { ok(!errors.length, errors.slice(0, 5).join(' | ')); });
  await browser.close();
  srv.close();
}

console.log(`\nqa_assets: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
