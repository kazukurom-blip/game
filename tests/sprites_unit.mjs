// 差し替えスプライト（src/render/sprites.js）の Node 単体テスト。ブラウザ無しで
//  manifest 無し / 壊れた manifest / 不正な項目 / 画像の一部欠け / 読み込み中 で例外にならず、コード描画にフォールバックすることを確かめる。
// 実行: node tests/sprites_unit.mjs（npm run test:unit に含まれる）
import assert from 'node:assert/strict';

// ---- 偽の Image（src に 'missing' を含むと失敗、それ以外は 320x320 で成功。非同期）
const pending = [];
globalThis.Image = class {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) { this._src = v; pending.push(this); }
  get src() { return this._src; }
};
const flush = () => { while (pending.length) { const im = pending.shift(); if (/missing/.test(im._src)) im.onerror?.(); else { im.naturalWidth = 320; im.naturalHeight = 320; im.onload?.(); } } };
// ---- 偽の ctx（呼び出しを記録）
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({ calls, globalAlpha: 1, globalCompositeOperation: 'source-over' }, {
    get(t, p) { if (p in t) return t[p]; if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); return (...a) => { calls.push(p); return p === 'createLinearGradient' || p === 'createRadialGradient' ? { addColorStop() {} } : p === 'getImageData' ? { data: new Uint8ClampedArray(4) } : p === 'measureText' ? { width: 10 } : undefined; }; },
    set(t, p, v) { t[p] = v; return true; },
  });
  return ctx;
}
let fetchImpl = null;
globalThis.fetch = (...a) => fetchImpl(...a);

const S = await import('../src/render/sprites.js');
const { drawEnemy } = await import('../src/render/enemyArt.js');
const { drawPet } = await import('../src/render/pets.js');
const { drawCharacter } = await import('../src/render/character.js');
const { ENEMIES, BOSS_IDS } = await import('../src/data/enemies.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const enemy = (id, o = {}) => { const def = ENEMIES[id]; return { def, defId: id, x: 100, y: 200, w: def.w || 40, h: def.h || 40, state: 'idle', t: 0.3, hurtT: 0, deadT: 0, facing: 1, hp: 10, maxHp: 10, onGround: true, alpha: 1, ...o }; };
const anyEnemy = Object.keys(ENEMIES).find((id) => !ENEMIES[id].boss && ENEMIES[id].art === 'slime');
const boss = BOSS_IDS[0];
// 全部の入口を一通り呼ぶ（例外が出ないこと）
function drawAll() {
  const ctx = fakeCtx();
  for (const st of ['idle', 'walk', 'attack', 'hurt', 'dead']) {
    drawEnemy(ctx, enemy(anyEnemy, { state: st, dead: st === 'dead', hurtT: st === 'hurt' ? 0.2 : 0 }));
    drawEnemy(ctx, enemy(boss, { state: st, boss: true, hp: 3 }));
    drawEnemy(ctx, enemy('thug_street' in ENEMIES ? 'thug_street' : Object.keys(ENEMIES).find((k) => ENEMIES[k].art === 'thug'), { state: st }));
    drawPet(ctx, 0, 0, { style: 'catPet' }, { state: st === 'walk' ? 'walk' : 'idle', t: 0.4 });
    drawCharacter(ctx, 0, 0, null, { weapon: { style: 'katana' }, top: { style: 'hoodie', color: '#ff0000' } }, { state: st, t: 0.2, attackT: 0.5, damage: 0.6, flash: st === 'hurt', alpha: st === 'walk' ? 0.5 : 1, noCache: true });
  }
  return ctx;
}
const MANIFEST = {
  version: 1,
  enemies: { [anyEnemy]: { file: `enemies/${anyEnemy}.png`, cell: [80, 80], anchor: [40, 72], rows: { idle: 4, walk: 4 } } },
  bosses: { [boss]: { file: `bosses/missing_${boss}.png`, cell: [80, 80], rows: { idle: 4 } } },
  pets: { catPet: { file: 'pets/catPet.png', cell: [80, 80], rows: { idle: 4, walk: 4 } } },
  chars: { enabled: true, cell: [80, 80], anchor: [40, 72], rows: { idle: 4, walk: 4 }, layers: {
    body_f: { file: 'chars/body_f.png', tint: 'skin' }, 'hair:twin_front_f': { file: 'chars/hair/missing.png' },
    'top:hoodie_f': { file: 'chars/top.png', tint: 'color' }, face_f: { file: 'chars/face_f.png', cell: [40, 40], anchor: [20, 20], rows: { neutral: 1 } },
  } },
};

test('manifest 無し（fetch 404）→ false・全部コード描画', async () => {
  fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
  assert.equal(await S.loadSpriteManifest(), false);
  assert.equal(S.hasSpriteManifest(), false);
  assert.equal(S.spriteStats().entries, 0);
  assert.equal(S.drawSpriteEnemy(fakeCtx(), enemy(anyEnemy)), false);
  assert.equal(S.drawSpritePet(fakeCtx(), 0, 0, { style: 'catPet' }, {}), false);
  assert.equal(S.drawSpriteCharacter(fakeCtx(), 0, 0, { body: 'f' }, {}, {}), false);
  drawAll();
});
test('fetch 自体が例外（オフライン/file://）→ false', async () => {
  fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await S.loadSpriteManifest(), false);
  drawAll();
});
test('壊れた manifest（JSON 不正）→ broken・全部コード描画', async () => {
  fetchImpl = async () => ({ ok: true, status: 200, text: async () => '{"version":1, "enemies": {' });
  assert.equal(await S.loadSpriteManifest(), false);
  assert.equal(S.spriteStats().manifest, 'broken');
  drawAll();
});
test('manifest の形が変（配列・null・不正な項目）でも例外にならない', async () => {
  for (const body of ['[]', 'null', '"str"', '{"enemies":[1,2],"pets":null,"chars":{"layers":5}}',
    JSON.stringify({ enemies: { a: { file: 3 }, b: { file: '../x.png' }, c: { file: 'http://evil/x.png' }, d: { file: 'ok.png', cell: [0, 0] }, e: { file: 'ok.png', rows: { idle: 'x', walk: -3 } } } })]) {
    fetchImpl = async () => ({ ok: true, status: 200, text: async () => body });
    await S.loadSpriteManifest();
    flush();
    drawAll();
  }
  const st = S.spriteStats();
  assert.ok(st.entries <= 1, '不正な項目は数えない: ' + st.entries);
});
test('画像の一部欠け・読み込み中 → 欠けた物/読み込み中はコード描画、読めた物はスプライト', async () => {
  fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(MANIFEST) });
  assert.equal(await S.loadSpriteManifest(), true);
  assert.equal(S.spriteStats().entries, 7);
  // 読み込み前: すべて false（コード描画）
  assert.equal(S.drawSpriteEnemy(fakeCtx(), enemy(anyEnemy)), false);
  assert.equal(S.drawSpriteCharacter(fakeCtx(), 0, 0, { body: 'f', hair: 'twin' }, {}, {}), false);
  drawAll();
  flush();
  const ctx = fakeCtx();
  assert.equal(S.drawSpriteEnemy(ctx, enemy(anyEnemy)), true);
  assert.ok(ctx.calls.includes('drawImage'));
  assert.equal(S.drawSpriteEnemy(fakeCtx(), enemy(boss, { boss: true })), false, '欠けたボス画像はコード描画');
  assert.equal(S.drawSpritePet(fakeCtx(), 0, 0, { style: 'catPet' }, { state: 'walk', t: 1 }), true);
  assert.equal(S.drawSpritePet(fakeCtx(), 0, 0, { style: 'dragonPet' }, {}), false, 'manifest に無い PET');
  // 人型: 髪（欠け）は描かずに残りで描く。行が無い状態（attack/dead）は idle にフォールバック
  for (const st of ['idle', 'walk', 'attack', 'dead', 'climb']) assert.equal(S.drawSpriteCharacter(fakeCtx(), 0, 0, { body: 'f', hair: 'twin' }, { top: { style: 'hoodie' } }, { state: st, t: 0.3 }), true, st);
  assert.equal(S.drawSpriteCharacter(fakeCtx(), 0, 0, { body: 'm' }, {}, {}), false, 'body_m が無い → コード描画');
  // 行がシートの高さを超える（画像 320px / セル 80px = 4 行）: 範囲外の行は使わない
  drawAll();
  const st = S.spriteStats();
  assert.ok(st.loaded >= 4 && st.failed >= 2, JSON.stringify(st));
});
test('spriteMode=procedural で常にコード描画・切替でアイコン用 rev が変わる', () => {
  const r0 = S.spriteRev();
  S.setSpriteMode('procedural');
  assert.equal(S.getSpriteMode(), 'procedural');
  assert.equal(S.drawSpriteEnemy(fakeCtx(), enemy(anyEnemy)), false);
  assert.equal(S.drawSpritePet(fakeCtx(), 0, 0, { style: 'catPet' }, {}), false);
  assert.ok(S.spriteRev() > r0);
  assert.equal(S.toggleSpriteMode(), 'auto');
  assert.equal(S.drawSpriteEnemy(fakeCtx(), enemy(anyEnemy)), true);
});
test('onlyLayers（テンプレート書き出し）でも例外にならない', () => {
  const ctx = fakeCtx();
  for (const L of [['body'], ['body_main'], ['arm'], ['hair_back'], ['hair_front'], ['face'], ['top'], ['sleeve'], ['bottom'], ['shoes'], ['hat'], ['accessory'], ['weapon'], ['tear'], ['hair', 'face']]) {
    for (const st of ['idle', 'walk', 'climb', 'attack', 'hurt', 'dead', 'drive']) {
      drawCharacter(ctx, 0, 0, { body: 'f', hair: 'twin' }, { hat: { style: 'cap' }, accessory: { style: 'wings' }, weapon: { style: 'katana' }, top: { style: 'hoodie' }, bottom: { style: 'skirt' } }, { state: st, t: 0.3, attackT: 0.4, damage: 0.8, onlyLayers: L, noCache: true });
    }
  }
});

test('主人公の立ち絵・頭（portraits/heads）: 読み込み・不正な項目・NPC には適用しない・Image 前処理不可でもコード描画', async () => {
  const C = await import('../src/render/character.js');
  const { DEFAULT_LOOKS } = await import('../src/data/classes.js');
  const ok = S.setSpriteManifest({ version: 1,
    portraits: { luna_f: 'portraits/luna_f.png', jin_m: { file: 'portraits/jin_m.png', expr: { smile: 'portraits/jin_m_smile.png', bad: '../x.png', n: 5 } }, bad1: { file: 3 }, bad2: '../../etc/passwd' },
    heads: { luna_f: { file: 'heads/luna_f.png', expr: { blink: 'heads/luna_f_blink.png', hurt: 'heads/luna_f_hurt.png' }, scale: 1.2, offset: [1, -2], facesLeft: true }, x: null },
    enemies: [] });
  assert.equal(ok, true);
  assert.equal(S.spriteStats().entries, 6, '立ち絵2+表情1+頭1+表情2（不正なパス・値は除外）');
  assert.equal(S.hasHeroArt('portraits', 'luna', 'f'), true);
  assert.equal(S.hasHeroArt('portraits', 'luna_f'), true);
  assert.equal(S.hasHeroArt('heads', 'jin', 'm'), false);
  assert.equal(S.hasHeroArt('portraits', 'bad1'), false);
  assert.equal(S.hasHeroArt('heads', { classId: 'luna', gender: 'f' }), true, 'look でも引ける');
  // 読み込み前
  assert.equal(S.headFor('luna', 'f'), null);
  assert.equal(S.heroArtState('heads', 'luna', 'f'), 1, '読み込み中');
  flush();
  // Node には canvas が無いので前処理（背景除去）できず失敗扱い → null（コード描画）
  assert.equal(S.portraitFor('luna', 'f', 'smile'), null);
  assert.equal(S.drawPortrait(fakeCtx(), 'jin_m', 'smile', 0, 0, 100), null);
  assert.equal(S.heroArtState('heads', 'luna', 'f'), 3);
  // 表情の選び方
  assert.equal(C.aiHeadExpr('attack', 0), 'shout');
  assert.equal(C.aiHeadExpr('shoot', 0), 'shout');
  assert.equal(C.aiHeadExpr('hurt', 0), 'hurt');
  assert.equal(C.aiHeadExpr('dead', 0), 'hurt');
  assert.equal(C.aiHeadExpr('idle', 3.9), 'blink');
  assert.equal(C.aiHeadExpr('idle', 1.0), null);
  assert.equal(C.aiHeadExpr('idle', 1.0, { headExpr: 'happy' }), 'happy');
  assert.equal(C.aiHeadExpr('idle', 1.0, { face: 'happy' }), 'happy');
  assert.equal(C.aiHeadExpr('cheer', 1.0), 'happy');
  // NPC（classId/gender なし）・aiHead:false・悪役 → 使わない
  assert.equal(C.aiHeadOf(DEFAULT_LOOKS.luna.f, {}, 'idle', 0), null);
  assert.equal(C.aiHeadOf({ ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f', aiHead: false }, {}, 'idle', 0), null);
  // 描画は例外なし（コード描画にフォールバック）
  const look = { ...DEFAULT_LOOKS.luna.f, classId: 'luna', gender: 'f' };
  for (const st of ['idle', 'walk', 'attack', 'hurt', 'climb', 'dead']) assert.doesNotThrow(() => drawCharacter(fakeCtx(), 0, 0, look, { hat: { style: 'cap' } }, { state: st, t: 0.2, noCache: true }));
  S.setSpriteManifest(null);
  assert.equal(S.hasHeroArt('heads', 'luna', 'f'), false);
});
test('progression: look に classId・gender が付く（列挙されない＝セーブ・比較に出ない）', async () => {
  const P = await import('../src/systems/progression.js');
  const st = P.newState('jin', { gender: 'f' });
  assert.equal(st.look.classId, 'jin'); assert.equal(st.look.gender, 'f');
  assert.equal(Object.keys(st.look).includes('classId'), false);
  const back = JSON.parse(JSON.stringify(st));
  assert.equal(back.look.classId, undefined);
});

let pass = 0, fail = 0;
test('1枚絵モード: 文字列だけ・single:true の項目を受け付け、Image が無い環境でも例外にならない', () => {
  const ok = S.setSpriteManifest({ version: 1,
    enemies: { slime_green: 'enemies/slime_green.png', bad: '../x.png' },
    bosses: { boss_king_slime: { file: 'bosses/k.png', single: true, height: 150, file2: 'bosses/k2.png' } },
    pets: { catPet: 'pets/cat.png' } });
  assert.equal(ok, true);
  assert.equal(S.spriteStats().entries, 3, '不正なパスは除外');
  const e = { def: ENEMIES.slime_green, x: 0, y: 0, facing: 1, t: 0, state: 'idle', hurtT: 0, hp: 1, maxHp: 1 };
  assert.equal(S.drawSpriteEnemy(fakeCtx(), e, {}), false, '未読込はコード描画');
  assert.doesNotThrow(() => drawEnemy(fakeCtx(), e));
  S.setSpriteManifest(null);
});

for (const t of tests) {
  try { await t.fn(); pass++; console.log('✓ sprites: ' + t.name); } catch (e) { fail++; console.log('✗ sprites: ' + t.name + '\n   ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n   ')); }
}
console.log(`\nsprites: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
