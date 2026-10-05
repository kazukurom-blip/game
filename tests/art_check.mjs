// 納品画像の検査ツール（tools/check_art.mjs）のテスト
//   node tests/art_check.mjs        （npm run test:art。約20秒。Playwright・ffmpeg・zip を使う）
// テストの中で仮の画像を作り（正しい絵と、わざと間違えた絵）、ZIP にしてツールを通し、OK / 注意 / NG が期待どおりか確かめる。
//  正しい絵: 素体の形に沿ったシャツ・木剣（持ち手の印つき）・顔 f_01 と表情・前髪・後ろ髪
//  間違い: 枠はみ出し（パーカーの腕を枠の外へ）、関節で太さが急変（ズボンの膝）、色違い（靴）、持ち手の印なし（ナイフ）、
//          表情の輪郭ずれ（f_01_hurt）、顔に髪（f_02）、依頼書に無い名前（beanie）
// あわせて、--install（一時フォルダのリポジトリの写しへ）と動画の出力、依頼書の一覧の読み取り（158枚）も確かめる。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPng, writePng, newImage } from '../tools/png_rgba.mjs';
import { checkArt, parseCatalog, classify } from '../tools/check_art.mjs';
import { RIG_PARTS } from '../src/render/rigLayout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function check(name, ok, detail = '') { console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`); if (ok) pass++; else fail++; }

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const OUT = hex('#2a1430');
function put(im, x, y, c, a = 255) { if (x < 0 || y < 0 || x >= im.w || y >= im.h) return; const o = (y * im.w + x) * 4; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = a; }
/** マスク → 色を塗った絵（縁 3px は輪郭線、下の方は少し暗い陰、accent の帯） */
function paint(w, h, m, main, accent, band) {
  const im = newImage(w, h), M = hex(main), Ac = accent ? hex(accent) : null;
  const edge = (x, y) => { for (let d = 1; d <= 3; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !m[Y * w + X]) return true; } return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    let c = M;
    if (Ac && band && band(x, y)) c = Ac;
    else if ((x + y) % 7 === 0) c = M.map((v) => v * 0.86);
    put(im, x, y, edge(x, y) ? OUT : c);
  }
  return im;
}
function dilate(m, w, h, r) {
  const o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; }
  }
  return o;
}
const inBox = (k, x, y) => { const p = RIG_PARTS[k]; return x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h; };

function genImages() {
  const body = readPng(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'rig', 'body_f.png')));
  const W = 1024, H = 1024;
  const bm = new Uint8Array(W * H);
  for (let i = 0; i < bm.length; i++) bm[i] = body.data[i * 4 + 3] >= 64 ? 1 : 0;
  const sel = (f) => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bm[y * W + x] && f(x, y)) m[y * W + x] = 1; return m; };
  const files = {};
  // 正しいシャツ: 胴（y ≤ 700）と腕（支点から 40px 下まで）を素体の形＋3px
  const armTop = (x, y) => (inBox('armB', x, y) || inBox('armF', x, y)) && y <= RIG_PARTS.armF.py + 40;
  const shirtM = dilate(sel((x, y) => (inBox('torso', x, y) && y <= 700) || armTop(x, y)), W, H, 3);
  const clip = (m, f) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x] && !f(x, y)) m[y * W + x] = 0; return m; };
  clip(shirtM, (x, y) => inBox('torso', x, y) || inBox('armB', x, y) || inBox('armF', x, y));
  files['rig/top/plainShirt_f.png'] = paint(W, H, shirtM, '#a89a84', '#6e6252', (x, y) => y > 690 && y <= 700);
  // パーカー（枠はみ出し）: シャツと同じ形＋背中にフード、手前の腕だけ 420px 下へ（どの枠の外）
  const hoodM = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shirtM[y * W + x]) { if (inBox('armF', x, y)) hoodM[(y + 420) * W + x] = 1; else hoodM[y * W + x] = 1; }
  for (let y = 200; y < 330; y++) for (let x = 700; x < 860; x++) if (((x - 780) / 80) ** 2 + ((y - 265) / 65) ** 2 < 1) hoodM[y * W + x] = 1;
  files['rig/top/hoodie_f.png'] = paint(W, H, hoodM, '#ff6fb5', '#ffffff', (x, y) => y > 690 && y <= 700);
  // ズボン（関節で太さが急変）: 腰〜脚（ひざ下まで）、膝 y=612 から下を片側 14px 太く
  const legs = (x, y) => inBox('legB', x, y) || inBox('legF', x, y);
  const pantsM = dilate(sel((x, y) => (inBox('torso', x, y) && y > 690) || (legs(x, y) && y <= 690)), W, H, 3);
  clip(pantsM, (x, y) => inBox('torso', x, y) || legs(x, y));
  for (const k of ['legB', 'legF']) {
    const p = RIG_PARTS[k];
    for (let y = p.py + 72; y <= p.py + 110; y++) {
      let a = -1, b = -1;
      for (let x = p.x; x < p.x + p.w; x++) if (pantsM[y * W + x]) { if (a < 0) a = x; b = x; }
      if (a >= 0) for (let x = Math.max(p.x, a - 14); x <= Math.min(p.x + p.w - 1, b + 14); x++) pantsM[y * W + x] = 1;
    }
  }
  files['rig/bottom/plainPants_f.png'] = paint(W, H, pantsM, '#5a5a62', '#3e3e44', (x, y) => y > 760);
  // 靴（色違い）: 素体の足＋2px を緑で
  const shoeM = dilate(sel((x, y) => inBox('footB', x, y) || inBox('footF', x, y)), W, H, 2);
  files['rig/shoes/oldShoes_f.png'] = paint(W, H, shoeM, '#30e040', '#106020', (x, y) => y > 860);
  // 依頼書に無い名前（ニット帽。頭の物の枠に丸）
  const hatM = new Uint8Array(W * H);
  for (let y = 120; y < 230; y++) for (let x = 170; x < 380; x++) if (((x - 275) / 105) ** 2 + ((y - 230) / 100) ** 2 < 1) hatM[y * W + x] = 1;
  files['rig/hat/beanie_f.png'] = paint(W, H, hatM, '#7a7f8c', '#c9ccd6', (x, y) => y > 210);
  // 武器
  const wpn = (mark) => {
    const m = new Uint8Array(1024 * 512);
    for (let y = 244; y < 268; y++) for (let x = 200; x < 820; x++) m[y * 1024 + x] = 1;
    const im = paint(1024, 512, m, '#b98a52', '#6a4a2a', (x) => x < 275);
    if (mark) for (let y = 250; y <= 262; y++) for (let x = 234; x <= 246; x++) if ((x - 240) ** 2 + (y - 256) ** 2 <= 36) put(im, x, y, [255, 0, 255]);
    return im;
  };
  files['rig/weapon/woodSword.png'] = wpn(true);
  const kn = wpn(false);
  for (let i = 0; i < kn.data.length; i += 4) if (kn.data[i + 3] && !(kn.data[i] === OUT[0] && kn.data[i + 1] === OUT[1])) { const c = (i >> 2) % 1024 < 275 ? hex('#ff6fb5') : hex('#c9ccd6'); kn.data[i] = c[0]; kn.data[i + 1] = c[1]; kn.data[i + 2] = c[2]; }
  files['rig/weapon/knife.png'] = kn;
  // 顔（頭の配置図: 頭頂 220・顎 560・中心 x 512）
  const face = (opt = {}) => {
    const im = newImage(1024, 1024), sk = hex('#ffe3d3'), dx = opt.dx || 0;
    for (let y = 200; y < 580; y++) for (let x = 320; x < 720; x++) {
      const e = ((x - 512 - dx) / 170) ** 2 + ((y - 390) / 170) ** 2;
      if (e < 1) put(im, x, y, e > 0.955 ? OUT : opt.hairTop && y < 300 ? hex('#b07850') : (x + y) % 9 === 0 ? sk.map((v) => v * 0.93) : sk);
    }
    for (const ex of [450, 590]) for (let y = 430; y < 480; y++) for (let x = ex - 18; x < ex + 18; x++) {
      if (((x - ex) / 18) ** 2 + ((y - 455) / 25) ** 2 >= 1) continue;
      if (opt.blink) { if (Math.abs(y - 456) < 3) put(im, x + dx, y, OUT); } else put(im, x + dx, y, hex('#6a5cff'));
    }
    for (let x = 500; x < 530; x++) for (let y = 515; y < 522; y++) put(im, x + dx, y, hex('#d04060'));
    return im;
  };
  files['heads/face/f_01.png'] = face();
  files['heads/face/f_01_blink.png'] = face({ blink: true });
  files['heads/face/f_01_hurt.png'] = face({ blink: true, dx: 6 });
  files['heads/face/f_02.png'] = face({ hairTop: true });
  // 前髪（頭頂〜y=335、顔より少し大きい）と後ろ髪
  const hf = new Uint8Array(1024 * 1024), hb = new Uint8Array(1024 * 1024);
  for (let y = 190; y < 336; y++) for (let x = 300; x < 730; x++) if (((x - 512) / 186) ** 2 + ((y - 390) / 192) ** 2 < 1) hf[y * 1024 + x] = 1;
  for (let y = 210; y < 760; y++) for (let x = 290; x < 740; x++) if (((x - 515) / 210) ** 2 + ((y - 420) / 200) ** 2 < 1 || (y > 400 && Math.abs(x - 515) < 200 && Math.abs(x - 515) > 120)) hb[y * 1024 + x] = 1;
  files['heads/hair/f_twin.png'] = paint(1024, 1024, hf, '#b07850', null);
  files['heads/hair/f_twin_back.png'] = paint(1024, 1024, hb, '#b07850', null);
  return files;
}
const EXPECT = {
  'rig/top/plainShirt_f.png': 'OK', 'rig/weapon/woodSword.png': 'OK', 'heads/face/f_01.png': 'OK', 'heads/face/f_01_blink.png': 'OK',
  'heads/hair/f_twin.png': 'OK', 'heads/hair/f_twin_back.png': 'OK',
  'rig/top/hoodie_f.png': 'NG', 'rig/bottom/plainPants_f.png': 'NG', 'rig/shoes/oldShoes_f.png': 'NG', 'rig/weapon/knife.png': 'NG',
  'heads/face/f_01_hurt.png': 'NG', 'heads/face/f_02.png': 'NG', 'rig/hat/beanie_f.png': '注意',
};
const REASON = {
  'rig/top/hoodie_f.png': /枠（＋余白12px）の外/, 'rig/bottom/plainPants_f.png': /関節.*太さが急に変わる/, 'rig/shoes/oldShoes_f.png': /色が基準色/,
  'rig/weapon/knife.png': /持ち手の印がありません/, 'heads/face/f_01_hurt.png': /輪郭が基本の顔とずれ/, 'heads/face/f_02.png': /髪の色の画素/, 'rig/hat/beanie_f.png': /依頼書.*一覧にありません/,
};

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'art_check_test_'));
  try {
    console.log('依頼書の一覧・種類の判定');
    const cat = parseCatalog(fs.readFileSync(path.join(ROOT, 'docs', 'art_handoff', 'CODEX_BATCH_01.md'), 'utf8'));
    const n = Object.keys(cat).length;
    check('依頼書（CODEX_BATCH_01.md）の一覧が 158 枚', n === 158, `${n} 枚`);
    check('一覧: 基準色と描く枠', cat['rig/top/plainShirt_f.png'] && cat['rig/top/plainShirt_f.png'].colors[0] === '#a89a84' && cat['rig/top/plainShirt_f.png'].parts.join() === 'torso,armB,armF', JSON.stringify(cat['rig/top/plainShirt_f.png']));
    check('一覧: 「⓪と同じ」の♂、表情の省略形、範囲（〜）', cat['rig/shoes/oldShoes_m.png'] && cat['rig/shoes/oldShoes_m.png'].colors[0] === '#6a5848' && !!cat['heads/face/f_01_shout.png'] && !!cat['heads/face/f_10_happy.png'] && !!cat['heads/hair/m_sidepart_back.png']);
    check('種類の判定', classify('rig/top/hoodie__1d2b24_f.png').variant === '#1d2b24' && classify('heads/face/f_01_blink.png').expr === 'blink' && classify('heads/hair/f_twin_back.png').back && classify('rig/weapon/knife.png').kind === 'weapon' && classify('foo/bar.png').kind === 'other');
    {
      const im = newImage(3, 2, [10, 20, 30, 128]);
      const rt = readPng(writePng(im));
      check('PNG の読み書き（往復で同じ）', rt.w === 3 && rt.h === 2 && rt.data.every((v, i) => v === im.data[i]));
    }

    console.log('\n仮の画像（正しい絵・わざと間違えた絵）');
    const imgs = genImages();
    const pkg = path.join(tmp, 'pkg');
    for (const [rel, im] of Object.entries(imgs)) { const f = path.join(pkg, 'assets', 'sprites', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, writePng(im)); }
    const zip = path.join(tmp, 'test_batch.zip');
    execFileSync('zip', ['-qr', zip, 'assets'], { cwd: pkg });
    // 入れる先: リポジトリの写し（manifest・素体・rig_manifest.mjs だけ）
    const root = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(root, 'assets', 'sprites', 'rig'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'assets', 'sprites', 'manifest.json'), path.join(root, 'assets', 'sprites', 'manifest.json'));
    fs.copyFileSync(path.join(ROOT, 'assets', 'sprites', 'rig', 'body_f.png'), path.join(root, 'assets', 'sprites', 'rig', 'body_f.png'));
    fs.copyFileSync(path.join(ROOT, 'tools', 'rig_manifest.mjs'), path.join(root, 'tools', 'rig_manifest.mjs'));
    const out = path.join(tmp, 'out');
    const t0 = Date.now();
    const r = await checkArt({ input: zip, out, install: true, video: true, root, quiet: true });
    console.log(`  （${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
    const by = Object.fromEntries(r.results.map((x) => [x.rel, x]));
    for (const [rel, want] of Object.entries(EXPECT)) {
      const got = by[rel];
      const why = got ? got.items.filter((i) => i.level === got.verdict).map((i) => i.msg).join(' / ') : '結果なし';
      const reasonOk = !REASON[rel] || (got && got.items.some((i) => i.level === want && REASON[rel].test(i.msg)));
      check(`${rel} → ${want}`, got && got.verdict === want && reasonOk, `${got ? got.verdict : '-'}: ${why}`.slice(0, 220));
    }
    check('関節の幅: 正しいシャツは急変なし・ズボンの膝は 30% 以上', by['rig/top/plainShirt_f.png'].metrics.joints.armF.worstStep < 15 && by['rig/bottom/plainPants_f.png'].metrics.joints.legF.worstStep >= 30, `${by['rig/top/plainShirt_f.png'].metrics.joints.armF.worstStep}% / ${by['rig/bottom/plainPants_f.png'].metrics.joints.legF.worstStep}%`);
    check('素体との重なりの数値がある（シャツ）', !!by['rig/top/plainShirt_f.png'].metrics.overlap.armF, JSON.stringify(by['rig/top/plainShirt_f.png'].metrics.overlap.armF));
    check('表情: blink の IoU 100%・hurt はずれ', by['heads/face/f_01_blink.png'].metrics.exprIoU === 100 && by['heads/face/f_01_hurt.png'].metrics.exprIoU < 98.5, `${by['heads/face/f_01_blink.png'].metrics.exprIoU} / ${by['heads/face/f_01_hurt.png'].metrics.exprIoU}`);
    check('持ち手の印の位置 (240,256)', by['rig/weapon/woodSword.png'].metrics.grip && by['rig/weapon/woodSword.png'].metrics.grip.dist <= 2, JSON.stringify(by['rig/weapon/woodSword.png'].metrics.grip));
    check('前髪と顔: 頭頂の肌が出ていない', by['heads/hair/f_twin.png'].metrics.onFaces.length >= 1 && by['heads/hair/f_twin.png'].metrics.onFaces[0].crownUncovered < 8, JSON.stringify(by['heads/hair/f_twin.png'].metrics.onFaces));
    check('NG があるので件数どおり', r.counts.NG === 6 && r.counts['注意'] === 1, JSON.stringify(r.counts));
    const outFiles = fs.readdirSync(out);
    check('report.md・result.json・overlay が出る', outFiles.includes('report.md') && outFiles.includes('result.json') && outFiles.filter((f) => f.startsWith('overlay_')).length === Object.keys(imgs).length, outFiles.join(','));
    const rep = fs.readFileSync(path.join(out, 'report.md'), 'utf8');
    check('report.md に結果の表と直し方', /\| `rig\/weapon\/knife.png` \| 武器 \| \*\*NG\*\*/.test(rep) && /直し方:/.test(rep));
    check('動画（mp4）とコマ並べ', r.video && r.video.mp4 && fs.statSync(path.join(out, 'preview.mp4')).size > 10000 && fs.existsSync(path.join(out, 'preview_frames.png')), JSON.stringify(r.video && { frames: r.video.frames, cases: r.video.cases, notes: r.video.notes, err: r.video.error }));
    check('動画: リグで描けている（素体の絵で）', r.video && !(r.video.notes || []).some((x) => /リグ（パーツの絵）で描けていません|ページのエラー/.test(x)), JSON.stringify(r.video && r.video.notes));
    // --install
    const spr = path.join(root, 'assets', 'sprites');
    const man = JSON.parse(fs.readFileSync(path.join(spr, 'manifest.json'), 'utf8'));
    check('--install: NG ではない画像だけコピー', fs.existsSync(path.join(spr, 'rig/top/plainShirt_f.png')) && !fs.existsSync(path.join(spr, 'rig/weapon/knife.png')) && fs.existsSync(path.join(spr, 'heads/face/f_01_blink.png')) && !fs.existsSync(path.join(spr, 'heads/face/f_02.png')), r.installed.copied.join(','));
    check('--install: rig 節（rig_manifest.mjs）と基準色', man.rig.parts['top/plainShirt_f'] && man.rig.parts['top/plainShirt_f'].base === '#a89a84' && man.rig.parts['weapon/woodSword'] && man.rig.parts.body_f && man.rig.profile && !man.rig.parts['weapon/knife'], JSON.stringify(man.rig.parts));
    check('--install: faces / hairs 節（FACE_HAIR_SPEC の形）', man.faces && man.faces.f_01 && man.faces.f_01.file === 'heads/face/f_01.png' && man.faces.f_01.expr.blink === 'heads/face/f_01_blink.png' && !man.faces.f_01.expr.hurt && man.hairs.f_twin.back === 'heads/hair/f_twin_back.png' && man.hairs.f_twin.base === '#b07850' && man.faceBase, JSON.stringify({ faces: man.faces, hairs: man.hairs }));
    check('--install: 他の節（enemies・heads）は残る', man.enemies && Object.keys(man.enemies).length > 10 && man.heads && man.heads.luna_f);
  } finally {
    if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('残した: ' + tmp);
  }
  console.log(`\n${pass} 件 OK、${fail} 件 失敗`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
