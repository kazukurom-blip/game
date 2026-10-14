// 画像の差し替えの仕組みの確かめ（Node だけで動く）。実行: node tests/assets.mjs
// 枠の一覧がデータと合っているか・指示文・ファイル名の読み方・custom.json・画像パック・画素の計算（背景の抜き方・外枠・足元・左右つなぎ）・
// 差し替えの探す順番（下書き → ゲーム内 → フォルダ → 予備 → 親）・tools の 2 本（scan_custom・gen_prompts）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assets, parseAssetFileName, normalizeCustomList, validatePack, suggestIds, keyOut, cornerColor, transparencyRatio, alphaBBox, findFeet, guessAnchors, seamBlend, blackToAlpha, crushBlack, cleanOpts, procFromOpts, autoProc, targetSize } from '../src/render/assets.js';
import { buildManifest, installManifest, slotPrompt, fxPartsOf, itemIconId, describeUnknown, CATEGORIES, GROUPS, addSlots, HERO_ANCHORS } from '../src/render/manifest.js';
import { colorName, idWords, buildPrompt } from '../src/render/prompts.js';
import { CLASSES } from '../src/data/classes.js';
import { SKILLS } from '../src/data/skills.js';
import { MONSTERS } from '../src/data/monsters.js';
import { PETS } from '../src/data/pets.js';
import { MATERIALS } from '../src/data/materials.js';
import { ACTS } from '../src/data/world.js';
import { BASES, WEAPON_KINDS, OFFHAND_KINDS, ARMOR_STYLES } from '../src/data/items.js';
import { UNIQUES, SETS, MYTHICS } from '../src/data/uniques.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

await installManifest();
const S = buildManifest();
const ID = new Map(S.map((s) => [s.id, s]));
const has = (id) => ID.has(id);

// ---------------------------------------------------------------- 枠の一覧
await t('枠 ID は重ならない', () => eq(new Set(S.map((s) => s.id)).size, S.length));
await t('すべての分類に枠がある', () => { for (const c of CATEGORIES) ok(S.some((s) => s.cat === c.id), c.id); });
await t('主人公: 各クラスの体・4 つの鎧の姿・立ち絵', () => { for (const c of CLASSES) { ok(has(`hero.${c.id}.body`), c.id); ok(has(`hero.${c.id}.portrait`), c.id); for (const st of ARMOR_STYLES) ok(has(`hero.${c.id}.outfit.${st}`), `${c.id} ${st}`); } });
await t('主人公の体にアンカー（手・副手・頭・背中）', () => { for (const c of CLASSES) { const s = ID.get(`hero.${c.id}.body`); for (const k of ['hand', 'offhand', 'head', 'back']) ok(Array.isArray(s.anchors?.[k]), `${c.id} ${k}`); } });
await t('鎧の姿は無ければ体を使い、親の画像は使わない', () => { const s = ID.get('hero.warrior.outfit.plate'); ok(s.fallback?.[0] === 'hero.warrior.body' && s.noInherit, JSON.stringify(s)); });
await t('装備: 武器・副手・兜・鎧の部品・ベースの絵と持ち物の絵', () => {
  for (const k of [...WEAPON_KINDS, ...OFFHAND_KINDS]) { ok(has(`gear.${k}`), k); ok(has(`icon.item.${k}`), k); }
  for (const b of BASES) { ok(assets.spec(b.art) || b.slot === 'amulet' || b.slot === 'ring', `art ${b.art}`); ok(has(b.icon), `icon ${b.icon}`); }
});
await t('アイコンは装備の絵を予備に使う', () => { eq(ID.get('icon.item.sword').fallback[0], 'gear.sword'); eq(ID.get('icon.item.helm.plate').fallback[0], 'gear.helm.plate'); });
await t('敵・ボス: すべての敵に枠（ボスは大きい・左向き）', () => { for (const m of MONSTERS) { const s = ID.get(`monster.${m.id}`); ok(s, m.id); eq(s.facing, 'left', m.id); if (m.boss) ok(s.h > 150, `boss size ${m.id}`); if (m.flying) ok(s.ay < 0.8, `flyer ${m.id}`); } });
await t('敵は章ごとの小分類', () => { const z = ID.get('monster.rot_zombie'); eq(z.group, 'act1'); ok(GROUPS.monster.some((g) => g.id === 'act1')); });
await t('召喚物: スキルの召喚の種類すべて（ルーンの変化も）', () => {
  for (const s of SKILLS) for (const u of [s.summon?.unit, ...(s.runes || []).map((r) => r.mod?.summon?.unit)].filter(Boolean)) ok(has(`minion.${u}`), u);
});
await t('ペット・素材・背景 3 枚・ロゴ・タイトル', () => {
  for (const p of PETS) ok(has(`pet.${p.id}`), p.id);
  for (const m of MATERIALS) ok(has(`icon.mat.${m.id}`), m.id);
  for (const a of ACTS) for (const id of [`bg.${a.id}`, `bg.${a.id}.mid`, `bg.${a.id}.ground`]) ok(has(id), id);
  ok(has('ui.logo') && has('ui.title'));
});
await t('ユニーク・セット・ミシックにアイコン（武器・副手・兜は着た姿も）', () => {
  for (const u of [...UNIQUES, ...MYTHICS, ...SETS.flatMap((s) => s.pieces || [])]) { ok(has(`icon.u.${u.id}`), u.id); }
});
await t('スキル: アイコンと、動きに合った演出の部品', () => {
  for (const s of SKILLS) {
    ok(has(`icon.skill.${s.id}`), s.id);
    const parts = fxPartsOf(s);
    ok(parts.length, s.id);
    for (const p of parts) ok(has(`fx.${s.id}.${p}`), `${s.id}.${p}`);
    // combat.js が使う ID（弾は proj、範囲は area、近接の振りは swing）
    if (s.behavior === 'projectile') ok(has(`fx.${s.id}.proj`), s.id);
    if (s.behavior === 'nova') ok(has(`fx.${s.id}.area`), s.id);
    if (s.behavior === 'melee') ok(has(`fx.${s.id}.swing`), s.id);
  }
});
await t('知らない動きのスキルは 4 つの部品を全部作る', () => { const p = fxPartsOf({ id: 'x', behavior: 'mystery' }); for (const k of ['proj', 'hit', 'area', 'swing']) ok(p.includes(k), k); });
await t('奥義（ult）はカットインの枠がある', () => ok(fxPartsOf({ id: 'u', behavior: 'nova', tags: ['ultimate'] }).includes('cut')));
await t('敵の弾は敵のデータの proj の種類すべて', () => { for (const m of MONSTERS) if (m.proj) ok(has(`fx.enemy.${m.proj}`), m.proj); });
await t('ソースの中の枠 ID の文字はすべて枠がある（親の枠を含む）', () => {
  // 画像の窓・manifest・型紙の中の「種類の名前」（'hero.body' など）と、コードの絵の登録（addPainter の prefix）は数えない
  const mine = ['render/manifest.js', 'render/prompts.js', 'render/assets.js', 'render/template.js', 'ui/panels/assets.js', 'ui/panels/assets_editor.js', 'ui/panels/assets_preview.js', 'ui/panels/assets_util.js'].map((x) => path.join(ROOT, 'src', ...x.split('/')));
  const files = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js') && !mine.includes(f) && !f.includes(`${path.sep}painters${path.sep}`));
  const IGNORE = new Set(['gear.amulet', 'gear.ring']); // 首飾り・指輪は着た姿を描かない（アイコンだけ）
  const re = /(['"`])((?:fx|monster|minion|pet|hero|gear|icon|bg|ui)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)\1/g;
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const m of src.matchAll(re)) if (!assets.spec(m[2]) && !IGNORE.has(m[2])) missing.push(`${m[2]}（${path.relative(ROOT, f)}）`);
  }
  ok(!missing.length, `枠の無い ID: ${[...new Set(missing)].join(', ')}　→ manifest.js か addSlots で枠を足す`);
});
await t('すべての枠に日本語の名前・大きさ・基準点・向き', () => {
  for (const s of S) {
    ok(/[ぁ-んァ-ヶ一-龠]/.test(s.label), `label ${s.id}`);
    ok(s.w > 0 && s.h > 0, `size ${s.id}`);
    ok(s.ax >= 0 && s.ax <= 1 && s.ay >= 0 && s.ay <= 1, `anchor ${s.id}`);
    ok(['right', 'left', 'up', 'front', 'none'].includes(s.facing), `facing ${s.id} ${s.facing}`);
    ok(s.group && (GROUPS[s.cat] || []).some((g) => g.id === s.group), `group ${s.id} ${s.group}`);
  }
});
await t('すべての枠に指示文（英語・日本語・Midjourney・否定・大きさ）', () => {
  for (const s of S) {
    const p = slotPrompt(s);
    ok(p.en.length > 120 && p.ja.length > 60 && p.mj.length > 40 && p.neg.length > 20, `prompt ${s.id}`);
    ok(p.sizes.gpt && p.sizes.sdxl && p.sizes.mj.startsWith('--ar'), `sizes ${s.id}`);
    ok(!/undefined|null|NaN|\[object/.test(p.en + p.ja + p.mj), `bad text ${s.id}: ${p.en.slice(0, 80)}`);
    ok(p.en.includes('Style:') && p.ja.includes('画風'), `style ${s.id}`);
    if (s.id !== 'ui.logo') ok(/no text/i.test(p.en) || ['scene', 'layer'].includes(p.bg), `no text ${s.id}`);
  }
});
await t('指示文: 主人公は右向き・敵は左向き・演出は黒い背景・アイコンは正方形', () => {
  ok(slotPrompt(ID.get('hero.warrior.body')).en.includes('facing RIGHT'));
  ok(slotPrompt(ID.get('monster.ash_wolf')).en.includes('facing LEFT'));
  ok(slotPrompt(ID.get('monster.ash_wolf')).ja.includes('左を向く'));
  const fx = slotPrompt(ID.get('fx.s_bolt.proj'));
  eq(fx.bg, 'black'); ok(fx.en.includes('#000000'));
  eq(slotPrompt(ID.get('icon.skill.s_bolt')).aspect, '1:1');
  eq(slotPrompt(ID.get('bg.act1')).bg, 'scene');
  ok(slotPrompt(ID.get('bg.act1.mid')).en.includes('seamlessly'));
  ok(slotPrompt(ID.get('ui.logo')).en.includes('"ABYSS DROP"'));
});
await t('指示文: 体が緑の敵はマゼンタの背景を案内', () => eq(slotPrompt(ID.get('monster.bog_slime')).bg, 'magenta'));
await t('指示文に既存の作品名は入っていない', () => {
  const ng = /diablo|path of exile|blizzard|final fantasy|dragon quest|pokemon|zelda|ghibli|studio|in the style of/i;
  for (const s of S) { const p = slotPrompt(s); ok(!ng.test(p.en) && !ng.test(p.mj), s.id); }
});
await t('色の名前', () => { eq(colorName('#ff0000').en, 'red'); eq(colorName('#888888').en, 'gray'); eq(colorName('#4a2a20').ja, 'こげ茶'); eq(colorName('#7acf5a').en, 'green'); eq(colorName('').en, ''); });
await t('ID の単語', () => { eq(idWords('boss_ash_wolf'), 'ash wolf'); eq(idWords('s_bolt'), 'bolt'); eq(idWords('rot_zombie'), 'rot zombie'); });
await t('知らない枠の説明', () => { ok(describeUnknown('fx.s_bolt.cast').includes('魔弾')); ok(describeUnknown('fx.enemy.meteor').includes('敵')); ok(describeUnknown('foo.bar').length > 3); });
await t('親の枠: 専用の画像が無い敵の攻撃・召喚物はまとめて差し替えられる', () => { ok(has('fx.enemy') && has('minion')); eq(assets.spec('fx.enemy.meteor_rain').id, 'fx.enemy'); eq(assets.spec('minion.clone').id, has('minion.clone') ? 'minion.clone' : 'minion'); });
await t('担当が後から足した枠も登録される', () => { addSlots([{ id: 'icon.test_extra', cat: 'icon', label: 'テストの枠', w: 64, h: 64, ax: 0.5, ay: 0.5 }]); ok(assets.slots.has('icon.test_extra')); eq(assets.slots.get('icon.test_extra').group, 'other'); assets.slots.delete('icon.test_extra'); });
await t('buildPrompt は知らない種類でも文を返す', () => { const p = buildPrompt({ id: 'misc.thing', w: 64, h: 64, kind: 'misc' }); ok(p.en.length > 50 && p.ja.length > 20); });

// ---------------------------------------------------------------- ファイル名・一覧・パック
await t('ファイル名 → 枠 ID', () => {
  eq(parseAssetFileName('monster.ash_wolf.png').id, 'monster.ash_wolf');
  const a = parseAssetFileName('fx.s_bolt.proj@8f.png'); eq(a.id, 'fx.s_bolt.proj'); eq(a.frames, 8); eq(a.fps, undefined);
  const b = parseAssetFileName('fx.s_bolt.proj@6f12.webp'); eq(b.frames, 6); eq(b.fps, 12); eq(b.ext, 'webp');
  eq(parseAssetFileName('Hero.Warrior.Body (1).PNG').id, 'hero.warrior.body');
  eq(parseAssetFileName('some/folder/bg.act1.mid.jpg').id, 'bg.act1.mid');
  eq(parseAssetFileName('readme.txt'), null);
  ok(parseAssetFileName('写真.png').bad);
  ok(parseAssetFileName('nodots.png').bad);
});
await t('custom.json の形（オブジェクト・配列・音と _ は読まない）', () => {
  const l = normalizeCustomList({ _format: 'x', 'hero.warrior.body': 'h.png', 'monster.ash_wolf': { file: 'm/w.webp', opts: { scale: 1.2 } }, audio: { 'sfx.hit': 'audio/hit.ogg' }, bad: { file: 'x.txt' } });
  eq(l.length, 2); eq(l[1].opts.scale, 1.2);
  eq(normalizeCustomList([{ id: 'a.b', file: 'a.png' }, { id: 'x' }]).length, 1);
  eq(normalizeCustomList(null).length, 0);
});
await t('画像パックの確かめ', () => {
  eq(validatePack({ format: 'abyss-drop-assetpack', assets: { 'a.b': { data: 'data:image/png;base64,AAA' } } }), null);
  ok(validatePack({ format: 'other' }).includes('形式'));
  ok(validatePack(null));
  ok(validatePack({ format: 'abyss-drop-assetpack', assets: { 'a.b': { data: 'http://x' } } }).includes('a.b'));
});
await t('似た枠 ID の案内', () => { const ids = S.map((s) => s.id); eq(suggestIds('monstr.ash_wolf', ids)[0], 'monster.ash_wolf'); eq(suggestIds('hero.warior.body', ids)[0], 'hero.warrior.body'); });
await t('設定の整理（加工の項目は proc へ）', () => {
  const o = cleanOpts({ frames: 1, scale: 1, ax: 0.5, flip: true, chroma: { tol: 3 }, rot: 0, anchors: {}, blend: 'lighter', fps: 12 });
  eq(JSON.stringify(o), JSON.stringify({ fps: 12, ax: 0.5, blend: 'lighter' }));
  const p = procFromOpts({ chroma: { tol: 30 }, trim: true, flip: true, crop: { b: 10 }, seam: 5 });
  eq(p.bg, 'auto'); eq(p.tol, 30); ok(p.trim && p.flip); eq(p.crop.b, 10); eq(p.seam, 5);
  eq(procFromOpts({ bg: 'black' }).bg, 'black');
});
await t('新しく入れた画像の加工の既定', () => {
  eq(autoProc(ID.get('hero.warrior.body'), false).bg, 'auto');
  eq(autoProc(ID.get('hero.warrior.body'), true).bg, 'none');
  ok(autoProc(ID.get('hero.warrior.body'), true).trim);
  const f = autoProc(ID.get('fx.s_bolt.proj'), false); eq(f.bg, 'none'); ok(f.crush);
  eq(autoProc(ID.get('bg.act1'), false).bg, 'none');
  eq(autoProc(ID.get('bg.act1.mid'), false, { color: [0, 255, 0] }).bg, 'auto');
  eq(autoProc(ID.get('bg.act1.mid'), false, { color: [80, 60, 50] }).bg, 'none');
  eq(autoProc(ID.get('icon.skill.s_bolt'), false).bg, 'none');
});
await t('ゲームで使う大きさ（縮めるだけ）', () => { eq(targetSize(ID.get('hero.warrior.body')).h, 400); eq(targetSize(ID.get('bg.act1')).w, 2560); eq(targetSize(ID.get('hero.warrior.body'), 2).h, 800); });

// ---------------------------------------------------------------- 画素の計算
function img(w, h, bg, draw) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = bg[3] ?? 255; }
  const set = (x, y, c) => { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] ?? 255; };
  draw?.(set);
  return d;
}
const A = (d, w, x, y) => d[(y * w + x) * 4 + 3];
await t('背景の色は四隅から', () => { const d = img(40, 40, [250, 250, 250]); const c = cornerColor(d, 40, 40); ok(c.agree); eq(c.color[0], 250); });
await t('四隅の色がそろわないと知らせる', () => { const d = img(40, 40, [0, 255, 0], (set) => { for (let y = 30; y < 40; y++) for (let x = 0; x < 40; x++) set(x, y, [90, 60, 40]); }); const c = cornerColor(d, 40, 40); ok(!c.agree); eq(c.votes, 2); eq(c.color[1], 255); });
await t('背景を抜く: 外側だけ消え、中の同じ色（白い目）は残る', () => {
  const W = 60; const H = 60;
  const d = img(W, H, [255, 255, 255], (set) => {
    for (let y = 10; y < 50; y++) for (let x = 15; x < 45; x++) set(x, y, [180, 40, 30]);
    for (let y = 20; y < 24; y++) for (let x = 30; x < 34; x++) set(x, y, [255, 255, 255]); // 目
  });
  const r = keyOut(d, W, H, { tol: 40 });
  eq(A(d, W, 0, 0), 0); eq(A(d, W, 59, 59), 0);
  eq(A(d, W, 31, 21), 255, '目');
  eq(A(d, W, 25, 30), 255, '体');
  ok(r.removed > 2000 && r.removed < 3600 - 1200 + 1, `removed ${r.removed}`);
});
await t('背景を抜く: つながっていない所も消す設定・閉じた穴', () => {
  const W = 60; const H = 60;
  const mk = () => img(W, H, [0, 255, 0], (set) => { for (let y = 5; y < 55; y++) for (let x = 5; x < 55; x++) set(x, y, [120, 60, 200]); for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) set(x, y, [0, 255, 0]); });
  const a = mk(); keyOut(a, W, H, { tol: 40 }); eq(A(a, W, 30, 30), 255, 'つながった所だけ');
  const b = mk(); keyOut(b, W, H, { tol: 40, contiguous: false }); eq(A(b, W, 30, 30), 0, '全部');
  const c = mk(); keyOut(c, W, H, { tol: 40, holes: true }); eq(A(c, W, 30, 30), 0, '閉じた穴（400 画素）');
});
await t('背景を抜く: 縁は半透明になじむ・緑のにじみを取る', () => {
  const W = 40; const H = 40;
  const d = img(W, H, [0, 255, 0], (set) => { for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) set(x, y, [200, 40, 40]); for (let y = 10; y < 30; y++) set(10, y, [60, 220, 30]); });
  keyOut(d, W, H, { tol: 48, feather: 2 });
  const a = A(d, W, 10, 20); ok(a > 0 && a < 255, `縁の透明度 ${a}`);
  const g = d[(20 * W + 10) * 4 + 1]; ok(g <= Math.max(d[(20 * W + 10) * 4], d[(20 * W + 10) * 4 + 2]), `緑 ${g}`);
  eq(A(d, W, 20, 20), 255);
});
await t('透明な割合', () => { eq(transparencyRatio(img(10, 10, [0, 0, 0, 255])), 0); eq(transparencyRatio(img(10, 10, [0, 0, 0, 0])), 1); });
await t('外枠（透明な外側を切る）', () => { const d = img(30, 20, [0, 0, 0, 0], (set) => { set(5, 3, [255, 0, 0]); set(20, 15, [255, 0, 0]); }); const b = alphaBBox(d, 30, 20); eq(JSON.stringify(b), JSON.stringify({ x0: 5, y0: 3, x1: 20, y1: 15 })); eq(alphaBBox(img(4, 4, [0, 0, 0, 0]), 4, 4), null); });
await t('足元を探す', () => {
  const W = 50; const H = 100;
  const d = img(W, H, [0, 0, 0, 0], (set) => { for (let y = 10; y < 90; y++) for (let x = 20; x < 30; x++) set(x, y, [200, 200, 200]); for (let x = 16; x < 34; x++) set(x, 90, [50, 50, 50]); });
  const f = findFeet(d, W, H); ok(Math.abs(f.ay - 0.91) < 0.001, `ay ${f.ay}`); ok(Math.abs(f.ax - 0.5) < 0.05, `ax ${f.ax}`);
});
await t('アンカーの推定（右向きの体）', () => {
  const W = 50; const H = 100;
  const d = img(W, H, [0, 0, 0, 0], (set) => { for (let y = 5; y < 95; y++) for (let x = 15; x < 35; x++) set(x, y, [200, 100, 100]); });
  const a = guessAnchors(d, W, H); ok(a.hand[0] > a.offhand[0], 'hand は前（右）'); ok(a.head[1] < a.back[1] && a.back[1] < a.hand[1], '上から 頭 → 背中 → 手');
});
await t('左右をつなげる（端が続く）', () => {
  const W = 20; const H = 2;
  const d = img(W, H, [0, 0, 0], (set) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) set(x, y, [x * 10, 0, 0]); });
  const r = seamBlend(d, W, H, 4);
  eq(r.width, 16); eq(r.data[0], 160, '左端 = 元の右端の手前'); eq(r.data[(15) * 4], 150, '右端');
});
await t('黒を透明に・ほぼ黒を真っ黒に', () => { const d = new Uint8ClampedArray([0, 0, 0, 255, 255, 128, 0, 255, 8, 8, 8, 255]); blackToAlpha(d); eq(d[3], 0); eq(d[7], 255); eq(d[11], 0); const e = new Uint8ClampedArray([10, 12, 9, 255]); crushBlack(e); eq(e[0] + e[1] + e[2], 0); });

// ---------------------------------------------------------------- 探す順番（Node の中の作り物の画像で）
const fake = (w, h) => ({ width: w, height: h });
await t('差し替えの探す順番: 予備の枠・親の枠・親を使わない枠', () => {
  assets.custom.set('gear.sword', { img: fake(100, 300), opts: {}, source: 'studio' }); assets.changed();
  const s = assets.sprite('icon.item.sword'); ok(s.custom); eq(s.id, 'gear.sword');
  eq(assets.sourceOf('icon.item.sword').from, 'gear.sword');
  assets.custom.set('hero.warrior.body', { img: fake(120, 400), opts: { ay: 0.99 }, source: 'folder' }); assets.changed();
  eq(assets.sprite('hero.warrior.outfit.plate').id, 'hero.warrior.body', '鎧の姿 → 体');
  eq(assets.sprite('hero.warrior.outfit.plate').ay, 0.99);
  assets.custom.set('bg.act1', { img: fake(1280, 720), opts: {}, source: 'studio' }); assets.changed();
  ok(!assets.isCustom('bg.act1.mid'), '中景は奥の画像を使わない');
  assets.custom.set('fx.enemy', { img: fake(64, 64), opts: {}, source: 'studio' }); assets.changed();
  eq(assets.sprite('fx.enemy.meteor').id, 'fx.enemy', '親の枠');
  assets.custom.clear(); assets.changed();
});
await t('下書きが一番先・sprite は使い回し・変更で作り直す', () => {
  assets.custom.set('monster.ash_wolf', { img: fake(300, 200), opts: {}, source: 'studio' }); assets.changed();
  const a = assets.sprite('monster.ash_wolf'); eq(assets.sprite('monster.ash_wolf'), a, '同じ物');
  assets.setDraft('monster.ash_wolf', fake(150, 150), { scale: 2 });
  const b = assets.sprite('monster.ash_wolf'); ok(b !== a); eq(b.source, 'draft'); eq(b.sh, 300, '高さ 150 × 2');
  assets.clearDraft('monster.ash_wolf'); eq(assets.sprite('monster.ash_wolf').source, 'studio');
  assets.custom.clear(); assets.changed();
});
await t('差し替え画像は枠の高さ（背景は幅）に合わせる', () => {
  assets.custom.set('monster.ash_wolf', { img: fake(600, 300), opts: {}, source: 'studio' });
  assets.custom.set('bg.act2', { img: fake(2560, 1440), opts: {}, source: 'studio' }); assets.changed();
  const m = assets.sprite('monster.ash_wolf'); eq(m.sh, 150); eq(m.sw, 300);
  const b = assets.sprite('bg.act2'); eq(b.sw, 1280); eq(b.sh, 720);
  assets.custom.clear(); assets.changed();
});
await t('アンカーの位置（回転・ずらし・向き）', () => {
  const s = { sw: 100, sh: 200, ax: 0.5, ay: 1, anchors: { hand: [0.7, 0.5] }, rot: 0, ox: 0, oy: 0 };
  let p = assets.anchor(s, 'hand', 0, 0); ok(Math.abs(p.x - 20) < 1e-9 && Math.abs(p.y + 100) < 1e-9, JSON.stringify(p));
  p = assets.anchor(s, 'hand', 0, 0, { flip: true }); ok(Math.abs(p.x + 20) < 1e-9);
  p = assets.anchor({ ...s, ox: 10 }, 'hand', 0, 0, { scale: 2 }); ok(Math.abs(p.x - 60) < 1e-9, JSON.stringify(p));
  p = assets.anchor({ ...s, rot: Math.PI / 2 }, 'hand', 0, 0); ok(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 20) < 1e-9, JSON.stringify(p));
  eq(assets.anchor(s, 'nothing', 0, 0), null);
});
await t('一覧に無い ID が使われたら覚える（画像の窓の「その他」）', () => { assets.sprite('fx.s_bolt.cast_test'); ok(assets.seen.has('fx.s_bolt.cast_test')); assets.seen.delete('fx.s_bolt.cast_test'); });
await t('持ち物のアイコン: ユニークは専用の絵があればそれ', () => {
  eq(itemIconId({ base: 'sword_1' }), 'icon.item.sword');
  assets.slots.set('icon.u.test_blade', { id: 'icon.u.test_blade', w: 96, h: 96, ax: 0.5, ay: 0.5, fallback: ['gear.u.test_blade'] });
  eq(itemIconId({ base: 'sword_1', uniqueId: 'test_blade' }), 'icon.item.sword', '画像が無いとき');
  assets.custom.set('gear.u.test_blade', { img: fake(50, 150), opts: {}, source: 'studio' }); assets.changed();
  eq(itemIconId({ base: 'sword_1', uniqueId: 'test_blade' }), 'icon.u.test_blade');
  assets.custom.clear(); assets.slots.delete('icon.u.test_blade'); assets.changed();
});
await t('HERO_ANCHORS は 0〜1', () => { for (const v of Object.values(HERO_ANCHORS)) ok(v[0] >= 0 && v[0] <= 1 && v[1] >= 0 && v[1] <= 1); });

// ---------------------------------------------------------------- tools
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-assets-'));
await t('tools/scan_custom.mjs: フォルダを調べて custom.json を作る', async () => {
  const dir = path.join(tmp, 'custom');
  fs.mkdirSync(path.join(dir, 'monster', 'act1'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hero.warrior.body.png'), 'x');
  fs.writeFileSync(path.join(dir, 'hero.warrior.body.json'), JSON.stringify({ ay: 0.98, anchors: { hand: [0.7, 0.55] }, bg: 'auto' }));
  fs.writeFileSync(path.join(dir, 'monster', 'act1', 'monster.ash_wolf.webp'), 'x');
  fs.writeFileSync(path.join(dir, 'fx.s_bolt.proj@8f12.png'), 'x');
  fs.writeFileSync(path.join(dir, 'monstr.ash_wolf.png'), 'x');
  fs.writeFileSync(path.join(dir, 'monster', 'monster.ash_wolf.png'), 'x');
  fs.writeFileSync(path.join(dir, 'audio', 'sfx.hit.ogg'), 'x');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x');
  const { scanCustom } = await import('../tools/scan_custom.mjs');
  const r = await scanCustom({ dir, quiet: true });
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'custom.json'), 'utf8'));
  eq(j['hero.warrior.body'].opts.ay, 0.98);
  eq(j['hero.warrior.body'].file, 'hero.warrior.body.png');
  ok(['monster/act1/monster.ash_wolf.webp', 'monster/monster.ash_wolf.png'].includes(j['monster.ash_wolf']), j['monster.ash_wolf']);
  eq(j['fx.s_bolt.proj'].opts.frames, 8); eq(j['fx.s_bolt.proj'].opts.fps, 12);
  eq(j.audio['sfx.hit'], 'audio/sfx.hit.ogg');
  ok(r.warnings.some((w) => w.includes('monstr.ash_wolf') && w.includes('monster.ash_wolf')), 'typo warning');
  ok(r.warnings.some((w) => w.includes('2 つ')), 'duplicate warning');
  eq(normalizeCustomList(j).length, 4, 'ゲームが読む数（知らない ID も書く。画像の窓の「その他」に出る）');
});
await t('tools/gen_prompts.mjs: 指示文の一覧（md・csv）', async () => {
  const { genPrompts } = await import('../tools/gen_prompts.mjs');
  const r = await genPrompts({ outDir: tmp, quiet: true });
  const md = fs.readFileSync(r.mdPath, 'utf8'); const csv = fs.readFileSync(r.csvPath, 'utf8');
  eq(r.rows, assets.slots.size, '全部の枠');
  ok(md.includes('hero.warrior.body') && md.includes('facing RIGHT') && md.includes('画風'), 'md');
  ok(csv.charCodeAt(0) === 0xfeff && csv.split('\r\n')[0].startsWith('﻿id,category'), 'csv header');
});
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\nassets: ${pass} 通過 / ${fail} 失敗（枠 ${S.length} 個）`);
process.exit(fail ? 1 : 0);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p); }
  return out;
}
