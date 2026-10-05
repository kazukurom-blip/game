// 主人公のパーツ式（リグ）の Node 単体テスト（ブラウザ無し）
//  manifest の rig の解釈（不正なキー・パス）、canvas の無い環境でコード描画にフォールバック、配置図の整合性、
//  基準色が全装備スタイルを網羅、初期装備が優先度 S、コード部品の描画が例外にならない
// 実行: node tests/rig_unit.mjs（npm run test:unit に含まれる）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pending = [];
globalThis.Image = class { set src(v) { this._src = v; pending.push(this); } get src() { return this._src; } };
function fakeCtx() {
  const calls = [];
  return new Proxy({ calls, globalAlpha: 1, globalCompositeOperation: 'source-over' }, {
    get(t, p) { if (p in t) return t[p]; if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); return (...a) => { calls.push(p); return p === 'createLinearGradient' || p === 'createRadialGradient' ? { addColorStop() {} } : p === 'getImageData' ? { data: new Uint8ClampedArray(4) } : p === 'measureText' ? { width: 10 } : undefined; }; },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const warn = console.warn; console.warn = () => {};
const S = await import('../src/render/sprites.js');
const R = await import('../src/render/rig.js');
const C = await import('../src/render/character.js');
const L = await import('../src/render/rigLayout.js');
const { ITEMS, starterEquipFor } = await import('../src/data/items.js');
const { CLASSES, DEFAULT_LOOKS } = await import('../src/data/classes.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const hero = (c = 'luna', g = 'f') => ({ ...DEFAULT_LOOKS[c][g], classId: c, gender: g });

test('manifest の rig: 正しいキーは受け付け、不正なキー・パスは無視', () => {
  S.setSpriteManifest({ version: 1, rig: { enabled: true, parts: {
    body_f: true, 'top/hoodie_f': 'rig/top/hoodie_f.png', 'top/hoodie__1d2b24_f': {}, 'weapon/knife': { base: '#c9ccd6' }, 'tear/2_m': null,
    '../evil': true, 'top/x_y_z': true, 'weapon/bat': 'http://evil/x.png', 'hat/cap_m': { file: '../../x.png' }, 'bottom/jeans_q': true,
  } } });
  const st = R.rigStats();
  assert.equal(st.files, 5, JSON.stringify(st));
  assert.equal(st.enabled, true);
  assert.ok(R.hasRig());
});
test('manifest の rig: fit / layout の既定（無ければ旧い配置図＋自動フィット、fit:false で v2、各パーツで上書き）', () => {
  S.setSpriteManifest({ version: 1, rig: { parts: ['body_f'] } });
  let st = R.rigStats();
  assert.equal(st.layout, 1); assert.equal(st.fit, true);
  S.setSpriteManifest({ version: 1, rig: { fit: false, parts: { body_f: true, 'top/hoodie_f': { fit: true }, 'top/tshirt_f': { layout: 1, fit: false } } } });
  st = R.rigStats();
  assert.equal(st.layout, 2); assert.equal(st.fit, false); assert.equal(st.files, 3);
  S.setSpriteManifest({ version: 1, rig: { layout: 2, parts: ['body_f'] } });
  st = R.rigStats();
  assert.equal(st.layout, 2); assert.equal(st.fit, true);
});
test('骨格 v2: 寸法の整合（頭 40%・腕脚の長さ・配置図の目安線が枠の中）', () => {
  const PR = L.RIG_PROFILE, Y = L.RIG_Y;
  assert.equal(PR.top, PR.H);
  assert.ok(Math.abs((PR.top - PR.chin) / PR.H - 0.40) < 0.02, '頭 約40%');
  assert.equal(Y.hip, -PR.crotch); assert.equal(Y.shoulder, PR.crotch - PR.shoulder); assert.equal(Y.head, PR.crotch - PR.head);
  for (const g of ['f', 'm']) {
    const M = L.RIG_LIMBS[g];
    assert.equal(M.thigh + M.shin, PR.crotch - PR.ankle, '脚の長さ = 股〜足首');
    assert.equal(PR.crotch - M.thigh, PR.knee, '膝の高さ');
  }
  const P = L.RIG_PARTS;
  for (const n of ['armB', 'armF']) assert.ok(P[n].ext[3] >= L.RIG_LIMBS.f.upper + L.RIG_LIMBS.f.fore + 3, n + ' に手が入る');
  for (const n of ['legB', 'legF']) assert.ok(P[n].ext[3] >= L.RIG_LIMBS.f.thigh + L.RIG_LIMBS.f.shin, n + ' に足首まで入る');
  for (const n of ['footB', 'footF']) assert.ok(P[n].ext[3] > PR.ankle, n + ' に靴底が入る');
  assert.ok(P.torso.ext[1] < Y.chin && P.torso.ext[1] < Y.shoulder, '胴の枠に肩・顎の線');
  assert.ok(P.head.ext[1] < L.HEAD_GUIDE.top && P.head.ext[3] > L.HEAD_GUIDE.chin, '頭の物の枠に頭頂・顎');
  // 頭の配置図: 支点・目安線が 1024 の中、腰の線（ツインテールの先）まで入る
  const hy = (v) => L.HEAD_PY + v * L.HEAD_S;
  for (const v of Object.values(L.HEAD_GUIDE)) assert.ok(hy(v) > 0 && hy(v) < L.HEAD_H, '頭の目安線が画像の中');
  assert.equal(L.HEAD_GUIDE.waist, PR.head - PR.waist);
  // コードの頭 → v2 の頭: 顎 15.5 → +16、髪の上端 -25 → 頭頂 -18 付近
  const CH = L.RIG_CODE_HEAD;
  assert.ok(Math.abs(CH.dy + CH.s * 15.5 - L.HEAD_GUIDE.chin) < 0.5);
  assert.ok(Math.abs(CH.dy + CH.s * -25 - L.HEAD_GUIDE.top) < 2.5);
  // 旧い配置図（layout 1）も全部の枠がある
  for (const n of Object.keys(P)) assert.ok(L.RIG_PARTS_V1[n], n + ' の旧い枠');
});
test('heads: 配置図方式（fit:false 既定）・fit:true（旧方式）・後ろ髪（back）の解釈', () => {
  S.setSpriteManifest({ version: 1, heads: {
    luna_f: { file: 'heads/luna_f.png', back: 'heads/luna_f_back.png' },
    jin_m: { file: 'heads/jin_m.png', fit: true, back: 'heads/jin_m_back.png' },
    hacker_f: 'heads/hacker_f.png',
  } });
  assert.ok(S.hasHeroArt('heads', 'luna', 'f') && S.hasHeroArt('heads', 'jin', 'm') && S.hasHeroArt('heads', 'hacker', 'f'));
  // Image が読み込まれない環境: headFor は null（コード描画）、paintAiHead / paintAiHeadBack は h が無くても例外なし
  assert.equal(S.headFor('luna', 'f'), null);
  const ctx = fakeCtx();
  C.paintAiHead(ctx, null, 'cap', false, false, 'rig');
  C.paintAiHeadBack(ctx, null, 'cap', null, false, 'rig');
  C.paintAiHeadBack(ctx, { back: null }, null, { hairSway: 1 }, false, 'code');
  // 置き場所の付いた頭（配置図方式）を直接描ける
  const cv = { width: 100, height: 100 };
  const h = { canvas: cv, w: 100, h: 100, fit: false, place: [-20, -25, 40, 45], offset: [0, 0], scale: 1, back: { canvas: cv, w: 100, h: 100, place: [-30, -20, 60, 70] } };
  C.paintAiHead(ctx, h, 'beanie', false, true, 'rig');
  C.paintAiHeadBack(ctx, h, 'beanie', { hairSway: 0.8, hairLift: 1 }, false, 'code', true);
  assert.ok(ctx.calls.includes('drawImage') && ctx.calls.includes('clip'));
  S.setSpriteManifest({ version: 1 });
});
test('配列の parts も可・enabled:false は無効', () => {
  S.setSpriteManifest({ version: 1, rig: { parts: ['body_f', 'body_m', 'shoes/boots_m'] } });
  assert.equal(R.rigStats().files, 3);
  S.setSpriteManifest({ version: 1, rig: { enabled: false, parts: ['body_f'] } });
  assert.equal(R.rigStats().enabled, false);
  assert.equal(R.rigPlanFor(hero(), {}), null);
});
test('rig が無い / manifest が壊れている → 無効', () => {
  S.setSpriteManifest({ version: 1 });
  assert.equal(R.rigStats().files, 0);
  assert.equal(R.hasRig(), false);
  S.setSpriteManifest('broken');
  assert.equal(R.rigStats().files, 0);
  S.setSpriteManifest({ version: 1, rig: 'nope' });
  assert.equal(R.hasRig(), false);
});
test('canvas の無い環境: プランは null・drawCharacter は例外なし（コード描画）', () => {
  S.setSpriteManifest({ version: 1, rig: { parts: ['body_f', 'body_m', 'top/hoodie_f', 'weapon/knife'] } });
  assert.equal(R.rigPlanFor(hero(), { top: { style: 'hoodie' } }), null);
  const ctx = fakeCtx();
  for (const st of ['idle', 'walk', 'jump', 'climb', 'attack', 'shoot', 'hurt', 'dead', 'sit', 'drive']) {
    C.drawCharacter(ctx, 0, 0, hero(), { top: { style: 'hoodie' }, weapon: { style: 'knife' } }, { state: st, t: 0.2, attackT: 0.4, damage: 0.6, flash: st === 'hurt', noCache: true });
  }
  assert.ok(ctx.calls.length > 100);
});
test('NPC・悪役の look（classId なし / villain）にはリグを使わない', () => {
  assert.equal(R.rigPlanFor({ ...DEFAULT_LOOKS.luna.f }, {}), null);
  assert.equal(R.rigPlanFor({ ...hero(), villain: true }, {}), null);
});
test('配置図: 枠は 1024×1024 の中・重ならない・支点は枠の中', () => {
  const P = L.RIG_PARTS;
  const names = Object.keys(P);
  for (const n of names) {
    const b = P[n];
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= L.RIG_W && b.y + b.h <= L.RIG_H, n + ' が配置図の外');
    assert.ok(b.px > b.x && b.px < b.x + b.w && b.py > b.y && b.py < b.y + b.h, n + ' の支点が枠の外');
  }
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = P[names[i]], b = P[names[j]], gap = 20;
    const sep = a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
    assert.ok(sep, `${names[i]} と ${names[j]} の間が 20px 未満`);
  }
  const W = L.WPN_BOX;
  assert.ok(W.x + W.w <= L.WPN_W && W.y + W.h <= L.WPN_H && W.px > W.x && W.py > W.y);
});
test('基準色: items.js の全装備スタイルに基準色がある', () => {
  for (const it of Object.values(ITEMS)) {
    if (!it || !it.look || !it.slot || it.slot === 'pet' || typeof it.look !== 'object') continue;
    const tb = L.RIG_BASE[it.slot];
    assert.ok(tb && tb[it.look.style], `${it.id}: ${it.slot}/${it.look.style} の基準色が無い`);
  }
});
test('基準色は初期装備の色（初期装備は色替えしない）', () => {
  for (const c of Object.keys(CLASSES)) for (const g of ['f', 'm']) {
    for (const [slot, id] of Object.entries(starterEquipFor(c, g))) {
      if (!id || slot === 'pet') continue;
      const lk = ITEMS[id].look;
      const base = L.RIG_BASE[slot][lk.style][0];
      // 例外: ハッカーのサイバーパーカーは色違い専用の絵（hoodie__1d2b24）
      if (id === 'hoodie_cyber') continue;
      assert.equal(base.toLowerCase(), lk.color.toLowerCase(), `${c}_${g} ${id}`);
    }
  }
});
test('指示書の一覧（HERO_PARTS_LIST.csv）: 初期装備は全部 優先度 S、総枚数が書いてある', () => {
  const csv = fs.readFileSync(path.join(ROOT, 'docs/art_handoff/HERO_PARTS_LIST.csv'), 'utf8');
  const rows = csv.split(/\r\n/).slice(1).filter(Boolean).map((l) => l.split(','));
  const S_files = new Set(rows.filter((r) => r[0] === 'S').map((r) => r[1]));
  for (const c of Object.keys(CLASSES)) for (const g of ['f', 'm']) {
    for (const [slot, id] of Object.entries(starterEquipFor(c, g))) {
      if (!id || slot === 'pet') continue;
      const lk = ITEMS[id].look;
      const k1 = slot === 'weapon' ? `assets/sprites/rig/weapon/${lk.style}.png` : `assets/sprites/rig/${slot}/${lk.style}_${g}.png`;
      const k2 = `assets/sprites/rig/${slot}/${lk.style}__${lk.color.slice(1).toLowerCase()}_${g}.png`;
      assert.ok(S_files.has(k1) || S_files.has(k2), `${c}_${g} の ${id} が S に無い`);
    }
    assert.ok(S_files.has(`assets/sprites/rig/body_${g}.png`));
  }
  const md = fs.readFileSync(path.join(ROOT, 'docs/art_handoff/HERO_PARTS_GUIDE.md'), 'utf8');
  assert.ok(md.includes(`全 ${rows.length} 枚`), '指示書に総枚数');
  for (const img of ['rig/layout_f.png', 'rig/layout_m.png', 'rig/layout_weapon.png', 'rig/layout_head.png', 'style/luna_f_reference.png']) {
    assert.ok(md.includes(img), img + ' が指示書に無い');
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/art_handoff', img)), img + ' が無い（npm run export:rig）');
  }
});
test('コード部品の描画（renderRigCode / renderRigWeapon）が全グループ・全スタイルで例外なし', () => {
  const ctx = fakeCtx();
  for (const g of ['f', 'm']) {
    C.renderRigCode(ctx, g, null, {}, 'body', {});
    C.renderRigCode(ctx, g, null, {}, 'head', { clip: true });
    C.renderRigCode(ctx, g, null, {}, 'headFront', { scale: L.HEAD_S, frame: 'head', px: L.HEAD_PX, py: L.HEAD_PY });
    C.renderRigCode(ctx, g, null, {}, 'headBack', { scale: L.HEAD_S, frame: 'head', px: L.HEAD_PX, py: L.HEAD_PY });
    for (const slot of L.RIG_SLOTS) for (const st of Object.keys(L.RIG_BASE[slot])) C.renderRigCode(ctx, g, null, { [slot]: { style: st } }, slot, { dmg: 0.6 });
    C.renderRigCode(ctx, g, null, { top: { style: 'tshirt' }, bottom: { style: 'jeans' } }, 'tear', { dmg: 0.8 });
  }
  for (const w of Object.keys(L.RIG_BASE.weapon)) C.renderRigWeapon(ctx, w, null, null);
  // 描画の状態（レイヤー別・フラグ）が元に戻る: 通常の描画に影響しない
  const c2 = fakeCtx();
  C.drawCharacter(c2, 0, 0, hero(), { hat: { style: 'cap' } }, { state: 'idle', noCache: true });
  assert.ok(c2.calls.includes('fill'));
});

let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log('✓ rig: ' + t.name); } catch (e) { fail++; console.log('✗ rig: ' + t.name + '\n   ' + (e && e.message)); }
}
console.warn = warn;
console.log(`\nrig: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
