// 納品画像の検査ツール（tools/check_art.mjs）の「キャラ以外」のテスト
//   node tests/art_env_check.mjs        （npm run test:artenv の後半。Playwright・zip を使う）
// 仮の画像（tests/art_env_fixtures.mjs の正しい絵と、わざと間違えた絵）を ZIP にしてツールを通し、
//  OK / 注意 / NG（継ぎ目・空・地面の線・マゼンタの印・透明・角・大きさ）が期待どおりか、
//  --install で manifest の bg / tiles / icons / vehicles / ui 節に書かれるか、プレビューのスクショが出るかを確かめる。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkArt, classify } from '../tools/check_art.mjs';
import { parseCatalog03, seamMetric } from '../tools/check_art_env.mjs';
import { goodImages, badImages, bgMid, vehicleBody, png } from './art_env_fixtures.mjs';
import { setArtManifest, artStats, hasArt, findMarkers, dominantColor, equipBase, itemIconKey } from '../src/render/artOverrides.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function check(name, ok, detail = '') { console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`); if (ok) pass++; else fail++; }

async function main() {
  // 依頼書の一覧（CODEX_BATCH_03.csv）
  const cat = parseCatalog03(fs.readFileSync(path.join(ROOT, 'docs', 'art_handoff', 'CODEX_BATCH_03.csv'), 'utf8'));
  const n = Object.keys(cat).length;
  check('依頼書 CODEX_BATCH_03 の一覧を読める（269 枚）', n === 269, `${n} 枚`);
  check('装備アイコンの基準色（catEars = #ff8ac8 / #ffe0f0）', cat['icons/equip/hat_catEars.png'] && cat['icons/equip/hat_catEars.png'].colors.join() === '#ff8ac8,#ffe0f0', JSON.stringify(cat['icons/equip/hat_catEars.png']));
  const kinds = {};
  for (const rel of Object.keys(cat)) { const k = classify(rel).kind; kinds[k] = (kinds[k] || 0) + 1; if (classify(rel).bad) kinds.bad = (kinds.bad || 0) + 1; }
  check('一覧の全部のファイル名を種類に分けられる（bg 42・tile 14・icon 204・vehicle 3・wheel 3・ui 3）', kinds.bg === 42 && kinds.tile === 14 && kinds.icon === 204 && kinds.vehicle === 3 && kinds.wheel === 3 && kinds.ui === 3 && !kinds.bad && !kinds.other, JSON.stringify(kinds));
  // 継ぎ目の数値（ずらすと継ぎ目ができる）
  const mid = bgMid();
  const s0 = seamMetric(mid);
  const shifted = { w: mid.w, h: mid.h, data: new Uint8Array(mid.data.length), hasAlpha: true };
  for (let y = 0; y < mid.h; y++) for (let x = 0; x < mid.w; x++) { const sx = Math.floor(x * 0.97); shifted.data.set(mid.data.subarray((y * mid.w + sx) * 4, (y * mid.w + sx) * 4 + 4), (y * mid.w + x) * 4); }
  const s1 = seamMetric(shifted);
  check('継ぎ目の検査: つながった絵は差 0・横に伸ばして右端を切った絵は継ぎ目あり', s0.seam === 0 && s1.score >= 0.6, `${JSON.stringify(s0)} / ${JSON.stringify(s1)}`);

  // artOverrides.js（Node で動く部分）
  const warn = console.warn; console.warn = () => {};
  setArtManifest({ bg: { ok: 'bg/ok.png', up: '../x.png', abs: '/etc/x.png', url: { file: 'http://x/y.png' }, num: 42 }, icons: { 'equip/hat_cap': { file: 'icons/equip/hat_cap.png', base: '#123456', parallax: 'x' } }, enemies: { a: 'enemies/a.png' } });
  console.warn = warn;
  check('manifest: 正しいパスだけ読む（.. / 絶対パス / URL / 数値は無視）', artStats().entries === 2 && hasArt('bg', 'ok') && !hasArt('bg', 'up') && !hasArt('bg', 'url') && hasArt('icons', 'equip/hat_cap'), JSON.stringify(artStats().errors));
  setArtManifest(null);
  const vb = vehicleBody();
  const mk = findMarkers(vb.data, vb.w, vb.h);
  check('乗り物の印を2つ見つける（(250,380)・(780,380)）', mk.length === 2 && Math.round(mk[0].x) === 250 && Math.round(mk[1].x) === 780 && Math.round(mk[0].y) === 380, JSON.stringify(mk));
  const dc = dominantColor(vb.data);
  check('車体の主な色（赤 #dc1e28 付近）', dc && parseInt(dc.slice(1, 3), 16) > 180 && parseInt(dc.slice(3, 5), 16) < 60, dc);
  check('装備アイコンの基準色・キー', equipBase('hat', 'catEars').join() === '#ff8ac8,#ffe0f0' && itemIconKey({ slot: 'hat', look: { style: 'catEars' } }) === 'equip/hat_catEars' && itemIconKey({ id: 'potion_red' }) === 'item/potion_red' && itemIconKey({ slot: 'pet', look: { style: 'catPet' } }) === null);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'art_env_check_'));
  try {
    const good = goodImages(), bad = badImages();
    const pkg = path.join(tmp, 'pkg');
    const all = { ...good, ...Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, v.img])) };
    for (const [rel, im] of Object.entries(all)) { const f = path.join(pkg, 'assets', 'sprites', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, png(im)); }
    const zip = path.join(tmp, 'batch03.zip');
    execFileSync('zip', ['-qr', zip, 'assets'], { cwd: pkg });
    // 入れる先: リポジトリの写し（manifest だけ。新しい節は外した「納品前」の形）
    const root = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(root, 'assets', 'sprites'), { recursive: true });
    const m0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'manifest.json'), 'utf8'));
    for (const k of ['bg', 'tiles', 'icons', 'vehicles', 'ui']) delete m0[k];
    fs.writeFileSync(path.join(root, 'assets', 'sprites', 'manifest.json'), JSON.stringify(m0, null, 2));
    const out = path.join(tmp, 'out');
    const t0 = Date.now();
    const r = await checkArt({ input: zip, out, install: true, video: true, root, quiet: true });
    console.log(`  （${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
    const by = Object.fromEntries(r.results.map((x) => [x.rel, x]));
    for (const rel of Object.keys(good).filter((k) => !bad[k])) { const g = by[rel]; check(`正しい絵 ${rel} → OK`, g && g.verdict === 'OK', g ? `${g.verdict}: ${g.items.map((i) => i.msg).join(' / ')}`.slice(0, 200) : '結果なし'); }
    for (const [rel, b] of Object.entries(bad)) { const g = by[rel]; check(`間違えた絵 ${rel}（${b.why}）→ ${b.expect}`, g && g.verdict === b.expect, g ? `${g.verdict}: ${g.items.filter((i) => i.level === g.verdict).map((i) => i.msg).join(' / ')}`.slice(0, 220) : '結果なし'); }
    check('数値: 地面の歩く面 y=40・足場 y=16・中景の足元', by['tiles/beach_ground.png'].metrics.surfaceY === 40 && by['tiles/beach_platform.png'].metrics.surfaceY === 16 && by['bg/beach_town_mid.png'].metrics.footCoverage > 90, `${by['tiles/beach_ground.png'].metrics.surfaceY} / ${by['tiles/beach_platform.png'].metrics.surfaceY} / ${by['bg/beach_town_mid.png'].metrics.footCoverage}`);
    check('数値: 乗り物の印の位置 (250,380)・(780,380)', JSON.stringify(by['vehicles/sports.png'].metrics.markers.map((m) => [m.x, m.y])) === '[[250,380],[780,380]]', JSON.stringify(by['vehicles/sports.png'].metrics.markers));
    const outFiles = fs.readdirSync(out);
    check('オーバーレイ（大きさが合う物すべて。タイトルの絵・地図は無し）', outFiles.filter((f) => f.startsWith('overlay_')).length === Object.keys(all).length - 3, String(outFiles.filter((f) => f.startsWith('overlay_')).length));
    check('プレビュー: 背景・アイコン・乗り物・UI のスクショ', ['preview_env_bg.png', 'preview_env_icons.png', 'preview_env_vehicles.png', 'preview_env_ui.png'].every((f) => outFiles.includes(f) && fs.statSync(path.join(out, f)).size > 5000) && !(r.envPreview.notes || []).some((x) => /ページのエラー/.test(x)), JSON.stringify(r.envPreview));
    const rep = fs.readFileSync(path.join(out, 'report.md'), 'utf8');
    check('report.md: 種類・継ぎ目の数値・直し方', /\| `bg\/downtown_town_mid.png` \| 背景 \| \*\*NG\*\*/.test(rep) && /左右の継ぎ目: 右端と左端の列の差/.test(rep) && /直し方:/.test(rep));
    // --install
    const spr = path.join(root, 'assets', 'sprites');
    const man = JSON.parse(fs.readFileSync(path.join(spr, 'manifest.json'), 'utf8'));
    check('--install: NG ではない画像だけコピー', fs.existsSync(path.join(spr, 'bg/beach_town_mid.png')) && fs.existsSync(path.join(spr, 'icons/equip/hat_catEars.png')) && !fs.existsSync(path.join(spr, 'bg/downtown_town_mid.png')) && !fs.existsSync(path.join(spr, 'vehicles/police.png')) && fs.existsSync(path.join(spr, 'vehicles/police_wheel.png')));
    check('--install: manifest の新しい節（bg / tiles / icons / vehicles / ui）', man.bg && man.bg.beach_town_mid === 'bg/beach_town_mid.png' && man.tiles.beach_ground === 'tiles/beach_ground.png' && man.icons['equip/hat_catEars'] === 'icons/equip/hat_catEars.png' && man.icons['skill/luna_neon_rush'] === 'icons/skill/luna_neon_rush.png' && man.vehicles.sports === 'vehicles/sports.png' && man.vehicles.sports_wheel === 'vehicles/sports_wheel.png' && man.ui.title_art === 'ui/title_art.png' && !man.bg.downtown_town_mid && !man.ui.logo, JSON.stringify({ bg: man.bg, ui: man.ui }).slice(0, 300));
    check('--install: 他の節（enemies・rig）は残る', man.enemies && Object.keys(man.enemies).length > 10 && man.rig);
  } finally {
    if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('残した: ' + tmp);
  }
  console.log(`\nart_env_check: ${pass} 件 OK、${fail} 件 失敗`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
