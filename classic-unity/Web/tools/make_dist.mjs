// 試遊版の公開用の一式を classic-unity/Web/dist/ に作る。
//   node classic-unity/Web/tools/make_dist.mjs            … dotnet publish（Release）→ dist/
//   node classic-unity/Web/tools/make_dist.mjs --no-publish … publish し直さず、前の publish の結果から作る
// dist/ の中身:
//   index.html・main.js・style.css・js/ … 画面（wwwroot/ のまま）
//   framework/（publish の _framework） … .NET の WebAssembly（dotnet publish の出力。Core のコードは Lumina.Web.wasm）
//   data.json   … classic-unity/Data/*.json と maps/*.json を 1 つにまとめた物（{ "items.json": "…", "maps/S001.json": "…" }）
//   sfx.json    … 効果音（Audio/SFX/*.ogg）を base64 で 1 つにまとめた物（ファイルの数を減らす）
//   audio/      … audio_manifest.json と BGM/*.ogg（イントロとループ・ジングル）
// 決まり（公開先の上限）: 1 ファイル 15MB 以下・合計 200MB 以下・ファイル数 250 以下。超えたら止まる。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CU = path.resolve(WEB, '..');
const PUB = path.join(CU, '.build', 'publish', 'Lumina.Web');
const DIST = path.join(WEB, 'dist');
const LIMIT_FILE = 15 * 1024 * 1024, LIMIT_TOTAL = 200 * 1024 * 1024, LIMIT_COUNT = 250;

if (!process.argv.includes('--no-publish')) {
  console.log('dotnet publish -c Release …');
  execFileSync('dotnet', ['publish', path.join(WEB, 'Lumina.Web.csproj'), '-c', 'Release', '-o', PUB], { stdio: 'inherit' });
}
const wwwroot = path.join(PUB, 'wwwroot');
if (!fs.existsSync(path.join(wwwroot, '_framework'))) throw new Error('publish の結果が無い: ' + wwwroot);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1) 画面と _framework
const SKIP = new Set(['web.config']);
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.endsWith('.gz') || e.name.endsWith('.br')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(wwwroot, '_framework'), path.join(DIST, 'framework')); // 公開先は「_」で始まる名前を使えないので framework に
copyDir(path.join(WEB, 'wwwroot'), DIST); // 画面の JS・CSS は手元の wwwroot/ から（--no-publish でも新しい物）

// 2) データを 1 つに
const data = {};
const DATA = path.join(CU, 'Data');
for (const f of fs.readdirSync(DATA)) if (f.endsWith('.json')) data[f] = fs.readFileSync(path.join(DATA, f), 'utf8');
for (const f of fs.readdirSync(path.join(DATA, 'maps'))) if (f.endsWith('.json')) data['maps/' + f] = fs.readFileSync(path.join(DATA, 'maps', f), 'utf8');
fs.writeFileSync(path.join(DIST, 'data.json'), JSON.stringify(data));

// 3) 音
const AUD = path.join(CU, 'Audio');
const manifest = JSON.parse(fs.readFileSync(path.join(AUD, 'audio_manifest.json'), 'utf8'));
const sfx = {};
for (const [id, e] of Object.entries(manifest.sfx)) {
  const p = path.join(AUD, e.file);
  if (fs.existsSync(p)) sfx[id] = fs.readFileSync(p).toString('base64');
}
fs.writeFileSync(path.join(DIST, 'sfx.json'), JSON.stringify(sfx));
fs.mkdirSync(path.join(DIST, 'audio', 'BGM'), { recursive: true });
fs.copyFileSync(path.join(AUD, 'audio_manifest.json'), path.join(DIST, 'audio', 'audio_manifest.json'));
const bgmFiles = new Set();
for (const e of [...Object.values(manifest.bgm), ...Object.values(manifest.jingle)]) { if (e.file) bgmFiles.add(e.file); if (e.intro) bgmFiles.add(e.intro); }
for (const f of bgmFiles) {
  const p = path.join(AUD, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, 'audio', f));
}

// 4) 上限を確かめて一覧を出す
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push({ path: path.relative(DIST, p).split(path.sep).join('/'), size: fs.statSync(p).size });
  }
})(DIST);
const total = files.reduce((a, f) => a + f.size, 0);
const big = files.filter((f) => f.size > LIMIT_FILE);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
const groups = {};
for (const f of files) { const g = f.path.includes('/') ? f.path.split('/').slice(0, f.path.startsWith('audio/') ? 2 : 1).join('/') + '/' : f.path; (groups[g] ||= { n: 0, size: 0 }).n++; groups[g].size += f.size; }
console.log('\ndist/ の中身');
for (const [g, v] of Object.entries(groups).sort()) console.log(`  ${g.padEnd(22)} ${String(v.n).padStart(4)} 個  ${mb(v.size)}`);
console.log(`合計 ${files.length} 個・${mb(total)}（一番大きいファイル: ${files.sort((a, b) => b.size - a.size)[0].path} ${mb(files[0].size)}）`);
if (big.length || total > LIMIT_TOTAL || files.length > LIMIT_COUNT) {
  console.error('上限を超えた:', { big: big.map((f) => f.path), total: mb(total), count: files.length });
  process.exit(1);
}
console.log('上限の中（1 ファイル 15MB・合計 200MB・250 個）: OK');
