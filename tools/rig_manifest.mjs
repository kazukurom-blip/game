#!/usr/bin/env node
// assets/sprites/rig/ に置いたパーツシート（PNG）を見て、assets/sprites/manifest.json の "rig" を書き直す
//   npm run rig:manifest            （書き込む）
//   node tools/rig_manifest.mjs --dry   （書き込まずに表示だけ）
// 既にある "rig" の設定（enabled / defaultWear / fit / layout / profile / view など全部 / 各パーツの base・accent・fit 等の指定）は残す。無くなったファイルの行は消す。
// rig が無い manifest に新しく作る時は "fit": false（配置図 v2 のまま正確に組む）。
// 名前の決まり（docs/art_handoff/HERO_PARTS_GUIDE.md）: body_f.png / top/hoodie_f.png / top/hoodie__1d2b24_f.png / weapon/knife.png / tear/1_f.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPR = path.join(ROOT, 'assets', 'sprites');
const DIR = path.join(SPR, 'rig');
const MAN = path.join(SPR, 'manifest.json');
const DRY = process.argv.includes('--dry');
const OK = [/^body_[fm]$/, /^tear\/[123]_[fm]$/, /^weapon\/[A-Za-z0-9]+(__[0-9a-f]{6})?$/, /^(top|bottom|shoes|hat|accessory)\/[A-Za-z0-9]+(__[0-9a-f]{6})?_[fm]$/];

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    if (fs.statSync(f).isDirectory()) walk(f, out); else if (/\.png$/i.test(n)) out.push(f);
  }
  return out;
}
const keys = [];
const bad = [];
for (const f of walk(DIR)) {
  const k = path.relative(DIR, f).replace(/\\/g, '/').replace(/\.png$/i, '');
  if (OK.some((re) => re.test(k))) keys.push(k); else bad.push(k);
}
keys.sort();
let man = { version: 1 };
if (fs.existsSync(MAN)) {
  try { man = JSON.parse(fs.readFileSync(MAN, 'utf8')); } catch (e) { console.error('manifest.json が壊れています: ' + e.message); process.exit(1); }
}
const old = man.rig && typeof man.rig === 'object' ? man.rig : {};
const oldParts = old.parts && !Array.isArray(old.parts) && typeof old.parts === 'object' ? old.parts : {};
const parts = {};
for (const k of keys) {
  const o = oldParts[k];
  parts[k] = o && typeof o === 'object' ? { ...o, file: `rig/${k}.png` } : `rig/${k}.png`;
}
// fit / layout: 既にある指定は残す。新しく rig を作る時は配置図 v2 のまま正確に組む（"fit": false）
const isNew = !man.rig || typeof man.rig !== 'object';
// その他の設定（profile / view など）もそのまま残す
const { parts: _p, files: _f, ...rest } = old;
man.rig = { ...rest, enabled: old.enabled !== false, defaultWear: old.defaultWear !== false };
if (old.fit === undefined && isNew) man.rig.fit = false;
man.rig.parts = parts;
if (!isNew && old.fit === undefined && old.layout === undefined) console.log('注意: rig に "fit" も "layout" も無いので、旧い配置図（layout 1・自動フィット）として読まれます。新しい配置図で描いた絵なら "fit": false を足してください');
console.log(`rig: ${keys.length} 枚${keys.includes('body_f') || keys.includes('body_m') ? '' : '（素体 body_f / body_m が無いのでリグは使われません）'}`);
for (const k of keys) console.log('  ' + k);
if (bad.length) { console.log('名前の決まりに合わないファイル（無視）:'); for (const k of bad) console.log('  ' + k + '.png'); }
if (DRY) console.log('（--dry: 書き込みません）');
else { fs.writeFileSync(MAN, JSON.stringify(man, null, 2) + '\n'); console.log('書き込みました: ' + path.relative(ROOT, MAN)); }
