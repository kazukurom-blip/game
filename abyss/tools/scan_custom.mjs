#!/usr/bin/env node
// assets/custom/ の画像を調べて assets/custom/custom.json を作り直す（ゲームはこの一覧の画像を使う）。
//
// 使い方（abyss/ の中で）:
//   node tools/scan_custom.mjs                 … assets/custom/ を調べて custom.json を書く
//   node tools/scan_custom.mjs --check         … 書かずに、間違い（知らない枠 ID・重なり）だけ表示
//   node tools/scan_custom.mjs --dir <フォルダ> --out <ファイル>
//
// 決まり:
//   - 画像（png / jpg / jpeg / webp / gif / avif）。フォルダの中にフォルダを作ってもよい（例: monster/act1/monster.ash_wolf.png）
//   - ファイル名 = 枠 ID（例: hero.warrior.body.png）。横に並べたコマ送りは「@コマ数f」（例: fx.s_bolt.proj@8f.png、@6f12 = 6 コマ 12 コマ/秒）
//   - 同じ名前の .json（例: hero.warrior.body.json）があれば、その中身を設定（opts）として使う:
//       { "ax": 0.5, "ay": 0.98, "scale": 1.1, "ox": 0, "oy": 0, "rot": -45, "frames": 4, "fps": 12, "blend": "lighter",
//         "anchors": { "hand": [0.7, 0.55] }, "bg": "auto", "tol": 48, "trim": true, "flip": true, "crop": { "t": 0, "b": 10 }, "seam": 8 }
//     （"bg": "auto" は四隅の色で背景を抜く、"black" は黒を透明に。"chroma": { "tol": 40 } の古い書き方も使える）
//   - assets/custom/audio/ の音（ogg / mp3 / wav / m4a）は "audio" の項目にまとめる（音の担当が読む）。ファイル名 = 音の ID（例: sfx.hit.ogg）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_RE = /\.(png|jpe?g|webp|gif|avif)$/i;
const AUDIO_RE = /\.(ogg|mp3|wav|m4a)$/i;

export async function scanCustom({ dir = path.join(ROOT, 'assets', 'custom'), out = null, check = false, quiet = false } = {}) {
  const { parseAssetFileName, suggestIds } = await import('../src/render/assets.js');
  const { buildManifest, loadOptionalSlots } = await import('../src/render/manifest.js');
  const { assets } = await import('../src/render/assets.js');
  await loadOptionalSlots();
  const slots = buildManifest();
  assets.defineMany(slots);
  const ids = slots.map((s) => s.id);
  const known = (id) => !!assets.spec(id);
  const log = (...a) => { if (!quiet) console.log(...a); };
  const warnings = [];
  const result = { _format: 'abyss-drop-custom', _version: 1, _generated: new Date().toISOString() };
  const audio = {};
  const files = walk(dir);
  const seen = new Map();
  let images = 0;
  for (const f of files) {
    const rel = path.relative(dir, f).split(path.sep).join('/');
    if (rel === 'custom.json' || rel.toLowerCase() === 'readme.md' || rel.startsWith('_')) continue;
    if (AUDIO_RE.test(f)) {
      if (!rel.startsWith('audio/')) { warnings.push(`音のファイルは audio/ フォルダに入れてください: ${rel}`); continue; }
      const id = path.basename(f).replace(AUDIO_RE, '');
      if (audio[id]) warnings.push(`同じ音の ID が 2 つあります: ${id}（${audio[id]} と ${rel}）。先の物を使います`);
      else audio[id] = rel;
      continue;
    }
    if (!IMG_RE.test(f)) continue;
    const p = parseAssetFileName(path.basename(f));
    if (!p || p.bad) { warnings.push(`ファイル名が枠 ID の形ではありません: ${rel}（例: monster.ash_wolf.png）`); continue; }
    if (!known(p.id)) { const sg = suggestIds(p.id, ids, 3); warnings.push(`知らない枠 ID: ${p.id}（${rel}）${sg.length ? `　もしかして ${sg.join(' / ')}` : ''}`); }
    if (seen.has(p.id)) { warnings.push(`同じ枠 ID の画像が 2 つあります: ${p.id}（${seen.get(p.id)} と ${rel}）。先の物を使います`); continue; }
    seen.set(p.id, rel);
    let opts = {};
    const side = [f.replace(IMG_RE, '.json'), path.join(path.dirname(f), `${p.id}.json`)].find((x) => fs.existsSync(x));
    if (side) {
      try { opts = JSON.parse(fs.readFileSync(side, 'utf8')); } catch (e) { warnings.push(`設定の JSON が読めません: ${path.relative(dir, side)}（${e.message}）`); }
    }
    if (p.frames && opts.frames === undefined) opts.frames = p.frames;
    if (p.fps && opts.fps === undefined) opts.fps = p.fps;
    result[p.id] = Object.keys(opts).length ? { file: rel, opts } : rel;
    images++;
  }
  if (Object.keys(audio).length) result.audio = audio;
  const target = out || path.join(dir, 'custom.json');
  if (!check) fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
  log(`画像 ${images} 枚${Object.keys(audio).length ? `・音 ${Object.keys(audio).length} 個` : ''}${check ? '（確かめただけ。書いていません）' : ` → ${path.relative(process.cwd(), target) || target}`}`);
  for (const w of warnings) log(`  ⚠ ${w}`);
  return { result, warnings, images, audio: Object.keys(audio).length };
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const dir = arg('--dir') ? path.resolve(arg('--dir')) : undefined;
  const out = arg('--out') ? path.resolve(arg('--out')) : null;
  scanCustom({ dir, out, check: process.argv.includes('--check') }).then((r) => {
    process.exit(process.argv.includes('--strict') && r.warnings.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
