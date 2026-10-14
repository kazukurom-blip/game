#!/usr/bin/env node
// claude.ai の Artifact（埋め込みのページ）として公開するための形を作る。
//
// 使い方（abyss/ の中で）:
//   node tools/build_artifact.mjs            … dist/artifact/ を作り直す
//   node tools/build_artifact.mjs --check    … 作ったあと、決まりを満たしているかだけ確かめる（満たさなければ終了コード 1）
//
// できる物（dist/artifact/）:
//   index.html   … ページの中身だけ（<!doctype>・<html>・<head>・<body> は書かない。公開するときに外側が足される）
//                  先頭に <title> と <meta name="claude:viewport-fit-sides">、Google Fonts、style.css をそのまま <style> で、
//                  <div id="app">、<script type="module" src="src/main.js">。
//   src/…, assets/custom/…  … 公開する部品の写し（ゲームのコードと、assets/custom の差し替え画像・音）
//   files.json   … Artifact の files に渡す一覧 { "公開する場所": "元のファイル（リポジトリの一番上から）" }
//   removed.json … 前に作った一覧にあって今回は無い場所（公開し直すときに files で null を渡して消す）
//
// 公開の仕方（Artifact の道具）: file_path = abyss/dist/artifact/index.html、files = files.json の中身。
//   2 回目からは同じ URL に出し直す（url を渡す）。removed.json の場所は files で null にする。
//   capabilities: { downloads: true } を付けると、画像のパック（.json）・型紙（.png）をファイルで保存できる
//   （付けなくても、文字のコピー・画像の表示で同じことができる）。公開する前に必ず作り直す（写しが古くならないように）。
//
// 決まり（埋め込み先の制限）: 外から読むのは Google Fonts だけ。window.confirm / alert / prompt・ダウンロード・
// window.open・印刷は使えない。localStorage / IndexedDB は使えないことがある。音はクリックのあと。Worker は自分のファイルから。
// 確かめ: node tests/qa_publish.mjs（Chromium で、sandbox の iframe に入れて通しで動かす）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'dist', 'artifact');
export const LIMITS = { files: 250, textBytes: 16 * 1024 * 1024, binaryBytes: 15 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, titleScan: 8 * 1024 };

/** 公開してよい種類（拡張子 → 種類） */
export const MEDIA = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.webm': 'audio/webm', '.flac': 'audio/flac',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.json', '.svg']);
/** 公開しない物（テスト・道具・説明・型紙・写真） */
const EXCLUDE = [/^tests\//, /^tools\//, /^docs\//, /^dist\//, /^node_modules\//, /^assets\/templates\//, /^assets\/sprites_template\//, /screenshots\//, /(^|\/)README(\.[a-z]+)?$/i, /(^|\/)CLAUDE\.md$/, /(^|\/)\.[^/]+$/];

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const excluded = (r) => EXCLUDE.some((re) => re.test(r));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (e.isFile()) out.push(f);
  }
  return out.sort();
}

/** 公開する部品（index.html と style.css は index.html の中に入れるので含めない） */
export function collectFiles() {
  const list = [];
  for (const f of walk(path.join(ROOT, 'src'))) if (/\.m?js$/.test(f)) list.push(rel(f));
  // assets/custom … ゲームと一緒に配る差し替えの絵・音（custom.json が一覧。無いと 404 になるので必ず入れる）
  for (const f of walk(path.join(ROOT, 'assets', 'custom'))) {
    const r = rel(f);
    if (MEDIA[path.extname(f).toLowerCase()] && !/\.md$/i.test(f)) list.push(r);
  }
  return list.filter((r) => !excluded(r));
}

/** index.html（ふつうの HTML）から、外側（doctype・html・head・body）を外した中身を作る */
export function makeContentPage(srcHtml, css) {
  const head = (srcHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
  const body = (srcHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [])[1] || '';
  const title = (head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || 'ABYSS DROP';
  const keep = [];
  for (const m of head.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const tag = m[0];
    if (/charset=/i.test(tag) || /name="viewport"/i.test(tag)) continue; // 外側にある
    if (/rel="stylesheet"/i.test(tag) && /href="style\.css"/i.test(tag)) continue; // 下で <style> に入れる
    keep.push(tag);
  }
  if (css.includes('</style')) throw new Error('style.css に </style が入っていると埋め込めません');
  return [
    `<title>${title}</title>`,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    ...keep,
    `<style>\n${css.trim()}\n</style>`,
    ...body.split('\n').map((l) => l.trim()).filter(Boolean),
    '',
  ].join('\n');
}

/** 決まりを満たしているか。問題の一覧（空なら OK） */
export function verify(outDir = OUT) {
  const problems = [];
  const page = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  if (/<!doctype|<html[\s>]|<\/?head[\s>]|<\/?body[\s>]/i.test(page)) problems.push('index.html に doctype / html / head / body がある');
  const t = page.slice(0, LIMITS.titleScan).match(/<title>([^<]+)<\/title>/);
  if (!t || t[1].trim() !== 'ABYSS DROP') problems.push('先頭 8KB に <title>ABYSS DROP</title> が無い');
  if (!page.includes('<meta name="claude:viewport-fit-sides" content="cover">')) problems.push('viewport-fit-sides の meta が無い');
  if (!/<div id="app">/.test(page)) problems.push('<div id="app"> が無い');
  if (!/<script type="module" src="src\/main\.js"><\/script>/.test(page)) problems.push('src/main.js を読む module script が無い');
  for (const m of page.matchAll(/\b(?:src|href)="(https?:)?\/\/([^/"]+)/g)) {
    if (!/^fonts\.(googleapis|gstatic)\.com$/.test(m[2])) problems.push(`外のサイトを読んでいる: ${m[2]}`);
  }
  if (Buffer.byteLength(page) > LIMITS.textBytes) problems.push('index.html が 16MB を超える');
  const files = JSON.parse(fs.readFileSync(path.join(outDir, 'files.json'), 'utf8'));
  const keys = Object.keys(files);
  if (keys.length > LIMITS.files) problems.push(`部品が ${keys.length} 個（${LIMITS.files} 個まで）`);
  let total = Buffer.byteLength(page);
  const repo = path.resolve(ROOT, '..');
  for (const [pub, src] of Object.entries(files)) {
    if (pub.startsWith('/') || pub.includes('..') || pub === 'index.html') problems.push(`公開の場所がおかしい: ${pub}`);
    if (excluded(pub)) problems.push(`公開しない物が入っている: ${pub}`);
    const ext = path.extname(pub).toLowerCase();
    if (!MEDIA[ext]) problems.push(`公開できない種類: ${pub}`);
    const abs = path.resolve(repo, src);
    if (!fs.existsSync(abs)) { problems.push(`元のファイルが無い: ${src}`); continue; }
    const size = fs.statSync(abs).size;
    total += size;
    if (size > (TEXT_EXT.has(ext) ? LIMITS.textBytes : LIMITS.binaryBytes)) problems.push(`大きすぎる: ${pub}`);
  }
  if (total > LIMITS.totalBytes) problems.push(`合計 ${(total / 1048576).toFixed(1)}MB（64MB まで）`);
  // コードが読むファイル（import・new URL(…, import.meta.url)）がすべて公開されているか
  const have = new Set(keys);
  for (const pub of keys.filter((k) => /\.m?js$/.test(k))) {
    const code = fs.readFileSync(path.resolve(repo, files[pub]), 'utf8');
    const refs = [
      ...[...code.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
      ...[...code.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)].map((m) => m[1]),
    ];
    for (const r of refs) {
      if (!r.startsWith('.')) { if (!/^node:/.test(r)) problems.push(`${pub}: 外のモジュール ${r}`); continue; }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(pub), r));
      if (!have.has(target)) problems.push(`${pub}: 読む先が公開されていない ${r}`);
    }
  }
  return problems;
}

export function build({ quiet = false, out = OUT } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const repo = path.resolve(ROOT, '..');
  // 前回の一覧（公開し直すときに消す場所を知らせる）
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(path.join(out, 'files.json'), 'utf8')); } catch { prev = {}; }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const srcHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  fs.writeFileSync(path.join(out, 'index.html'), makeContentPage(srcHtml, css));
  const files = {};
  for (const r of collectFiles()) {
    const dst = path.join(out, r);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, r), dst);
    files[r] = path.relative(repo, dst).split(path.sep).join('/');
  }
  fs.writeFileSync(path.join(out, 'files.json'), `${JSON.stringify(files, null, 1)}\n`);
  const removed = Object.keys(prev).filter((k) => !(k in files));
  fs.writeFileSync(path.join(out, 'removed.json'), `${JSON.stringify(removed, null, 1)}\n`);
  const problems = verify(out);
  log(`${path.relative(ROOT, out)}: index.html ${(fs.statSync(path.join(out, 'index.html')).size / 1024).toFixed(1)}KB ＋ 部品 ${Object.keys(files).length} 個${removed.length ? `（前回から消えた ${removed.length} 個 → removed.json）` : ''}`);
  if (problems.length) { log('問題:'); for (const p of problems) log(`  - ${p}`); } else log('決まりを満たしています（node tests/qa_publish.mjs で埋め込みの確かめ）');
  return { out, files, removed, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build();
  if (process.argv.includes('--check') && r.problems.length) process.exit(1);
}
