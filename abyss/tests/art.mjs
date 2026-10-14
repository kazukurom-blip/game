// アート担当の確かめ（Node だけで動く。ブラウザの代わりに「何もしないキャンバス」を使う）。
// 実行: node tests/art.mjs
//  ・すべての枠に painter があり、描いても例外が出ない（体の形 18 × 飾り 21、知らない ID も）
//  ・演出（fx）がすべての出来事・知らない出来事で例外を出さない。ダメージの数字の合算と上限 30
//  ・主人公の動き（クラス × 武器 × 動き）が有限の値になる。IK が届く
//  ・背景の波が横につながる。粒の上限。戦闘の画面を何百フレーム回しても壊れず、軽い

// ---------- 何もしないキャンバス
const NOOP = () => {};
function fakeCtx(canvas) {
  const st = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif' };
  const special = {
    createLinearGradient: () => ({ addColorStop: NOOP }),
    createRadialGradient: () => ({ addColorStop: NOOP }),
    createPattern: () => ({}),
    measureText: (t) => ({ width: String(t).length * 10 }),
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: NOOP,
    isPointInPath: () => false,
  };
  let calls = 0;
  return new Proxy(st, {
    get(t, k) { if (k === '__calls') return calls; if (k in special) return special[k]; if (k in t) return t[k]; calls++; return NOOP; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
class FakeCanvas {
  constructor() { this.width = 300; this.height = 150; this.style = {}; this._ctx = null; }
  getContext() { if (!this._ctx) this._ctx = fakeCtx(this); return this._ctx; }
  getBoundingClientRect() { return { width: 1280, height: 720, left: 0, top: 0 }; }
  toBlob(cb) { cb(null); }
  toDataURL() { return 'data:,'; }
}
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : { style: {}, append: NOOP, appendChild: NOOP, setAttribute: NOOP, addEventListener: NOOP, classList: { add: NOOP, remove: NOOP, toggle: NOOP } }), getElementById: () => null, head: { appendChild: NOOP } };

// ---------- 試す
let pass = 0; let fail = 0;
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
async function t(name, fn) {
  const before = errors.length;
  try {
    if (process.env.ART_DEBUG) { const r0 = await fn(); return r0; }
    const r = await fn();
    if (r === false) throw new Error('false');
    if (errors.length > before) throw new Error(`console.error: ${errors.slice(before, before + 3).join(' | ')}`);
    pass++;
  } catch (e) { fail++; origErr(`✘ ${name}: ${e.message}`); if (process.env.ART_DEBUG) origErr(e.stack); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

const { assets } = await import('../src/render/assets.js');
const { installManifest, buildManifest } = await import('../src/render/manifest.js');
const { installPainters } = await import('../src/render/painters/index.js');
const { drawCreature, BODY_PLANS, FEATURES, minionDef, monsterParts } = await import('../src/render/painters/monsters.js');
const { heroRig, drawRig, ik, REST_POSE, LOOKS } = await import('../src/render/painters/heroes.js');
const { waveTable } = await import('../src/render/painters/util.js');
const { materialKind } = await import('../src/render/painters/icons.js');
const { heroPose, drawHero } = await import('../src/render/paperdoll.js');
const { FxSystem, FX_HANDLERS } = await import('../src/render/fx.js');
const { CLASSES } = await import('../src/data/classes.js');
const { MONSTER } = await import('../src/data/monsters.js');
installManifest();
installPainters();

await t('すべての枠に painter がある', () => {
  const miss = buildManifest().filter((s) => !assets.painterFor(s.id)).map((s) => s.id);
  ok(!miss.length, `painter が無い: ${miss.slice(0, 5).join(', ')}`);
});
await t('すべての枠を描いても例外が出ない', () => {
  let n = 0;
  for (const s of buildManifest()) { assets.cache.delete(s.id); assets.fallbackCanvas(s.id); n++; }
  ok(n > 100, `枠が少ない ${n}`);
});
await t('知らない ID でも描ける（宝石・ルーン・素材・召喚物・ユニーク・アイコン）', () => {
  for (const id of ['icon.gem.ruby_7', 'icon.gem.abyss_heart', 'icon.gem.x', 'icon.rune.el', 'icon.rune.zod', 'icon.mat.reagent_fire', 'icon.mat.unknown_stuff', 'icon.foo.bar', 'icon.skill.unknown_skill', 'minion.bone_golem', 'minion.shadow_clone', 'minion.whatever', 'pet.unknown', 'gear.u.nothing', 'fx.unknown.proj', 'fx.enemy.weird', 'monster.unknown']) {
    ok(assets.painterFor(id), `painter が無い ${id}`);
    assets.cache.delete(id); assets.fallbackCanvas(id);
  }
});
await t('体の形 18 種 × 飾り 21 種をすべて描ける', () => {
  ok(BODY_PLANS.length === 18 && FEATURES.length === 21, `${BODY_PLANS.length} / ${FEATURES.length}`);
  const c = new FakeCanvas().getContext('2d');
  for (const body of BODY_PLANS) {
    for (const f of FEATURES) for (const boss of [false, true]) for (const flying of [false, true]) drawCreature(c, { id: `t_${body}_${f}`, body, features: [f], palette: { main: '#8a6a4a', sub: '#3a2a1a', eye: '#ff3a3a' }, boss, flying }, 150, 150, flying ? 0.6 : 0.97, {});
    drawCreature(c, { id: `all_${body}`, body, features: FEATURES, palette: {}, boss: true }, 240, 240, 0.97, { cute: true, flip: true });
    for (const parts of ['body', 'wingsFar', 'wingsNear']) drawCreature(c, { id: `w_${body}`, body, features: ['wings'], palette: {} }, 150, 150, 0.97, { parts });
  }
});
await t('data/monsters.js の体の形と飾りは描ける物だけ', () => {
  for (const m of Object.values(MONSTER)) {
    ok(BODY_PLANS.includes(m.body), `${m.id}: 体の形 ${m.body}`);
    for (const f of m.features || []) ok(FEATURES.includes(f), `${m.id}: 飾り ${f}`);
  }
});
await t('羽ばたきの部品（翼がある敵だけ）', () => {
  MONSTER.__wingtest = { id: '__wingtest', name: 't', body: 'flyer', palette: {}, flying: true };
  const p = monsterParts('__wingtest');
  ok(p && p.body && p.far && p.near && p.root.every(Number.isFinite), '部品がない');
  ok(monsterParts('rot_zombie') === null, '翼の無い敵に部品がある');
  delete MONSTER.__wingtest;
});
await t('召喚物の名前から形が決まる', () => {
  ok(minionDef('skeleton').body === 'biped' && minionDef('skelmage').body === 'caster' && minionDef('bone_golem').body === 'golem' && minionDef('wolf_companion').body === 'quad');
  ok(minionDef('zzz').body, '知らない名前');
});
await t('素材の種類を名前から推し量る', () => {
  ok(materialKind('core', '原初の核') === 'core', 'core'); ok(materialKind('scrap', '鉄屑') === 'ingot', 'scrap'); ok(materialKind('x_vial', '炎の試薬') === 'vial', 'vial'); ok(materialKind('zz', '', 3) === 'echo', 'tier');
});
await t('主人公の動き（5 クラス × 武器 × 動き）が有限の値', () => {
  const kinds = ['sword', 'axe', 'mace', 'greatsword', 'bow', 'crossbow', 'staff', 'wand', 'scythe', 'rod', 'dagger', 'claw', 'fist'];
  const anims = [{ s: 'idle', t: 0 }, { s: 'walk', t: 0.3 }, { s: 'attack', t: 0.2, dur: 0.6 }, { s: 'attack', t: 0.35, dur: 0.6, skill: 'w_cleave' }, { s: 'cast', t: 0.3, dur: 0.6, skill: 's_bolt' }, { s: 'die', t: 0.4 }, { s: 'leap', t: 0.2, dur: 0.6 }, { s: 'dash', t: 0.1, dur: 0.3 }, { s: 'whirl', t: 0.4, dur: 1 }, { s: 'attack', t: 0.3, dur: 0.5, skill: 'n_skeleton' }, { s: 'weird_new_anim', t: 0.2, dur: 0.4 }];
  const c = new FakeCanvas().getContext('2d');
  for (const cls of CLASSES.map((x) => x.id)) for (const k of kinds) for (const a of anims) {
    const look = { cls, style: 'plate', body: `hero.${cls}.outfit.plate`, weapon: k === 'fist' ? null : `gear.${k}`, weaponKind: k, twoHanded: ['greatsword', 'bow', 'crossbow', 'staff', 'scythe'].includes(k), offhand: 'gear.shield', offhandKind: 'shield', helm: 'gear.helm.plate', overlays: [] };
    const p = heroPose(look, a, 1.2, { at: a.t, n: 1, recoil: 0.5 }, { id: 1 });
    const vals = [p.wRot, p.dx, p.dy, p.lean, p.sx, p.sy, ...p.pose.handF, ...p.pose.handB, ...p.pose.legF, ...p.pose.legB];
    ok(vals.every(Number.isFinite), `${cls}/${k}/${a.s}: ${vals}`);
    drawHero(c, { anim: a, face: 1, hitFlash: 0.05, id: 1 }, 400, 560, { look, t: 1, vis: { at: a.t, n: 2, recoil: 0.3, flash: 0.03 }, whiteOf: (x) => x });
  }
});
await t('IK: 手が届く（届かないときは伸ばしきる）', () => {
  const r = ik([0, 0], [30, 30], 26, 25);
  ok(Math.abs(Math.hypot(r.h[0], r.h[1]) - Math.hypot(30, 30)) < 0.5, 'reach');
  const far = ik([0, 0], [300, 0], 26, 25);
  ok(Math.hypot(far.h[0], far.h[1]) <= 51.1, 'clamp');
  for (const cls of Object.keys(LOOKS)) for (const st of [null, 'cloth', 'leather', 'mail', 'plate']) { const rig = heroRig(cls, st); ok(rig.torso && rig.thigh && rig.foreF, `${cls} ${st}`); drawRig(new FakeCanvas().getContext('2d'), rig, REST_POSE); }
});
await t('背景の波は横につながる', () => {
  for (const seed of ['a', 'b', 'act3']) { const f = waveTable(1280, seed, 5, 2, 4); ok(Math.abs(f(0) - f(1280)) < 1e-6 && Math.abs(f(-10) - f(1270)) < 1e-6, seed); }
});

// ---------- 演出
function fakeScene() {
  const hero = { id: 1, kind: 'hero', team: 'hero', x: 0, y: 0, z: 0, life: 100, maxLife: 100, face: 1, anim: { s: 'idle', t: 0 }, statuses: {}, size: 1 };
  const mon = { id: 2, kind: 'monster', team: 'enemy', x: 300, y: 0, z: 0, life: 50, maxLife: 100, face: -1, anim: { s: 'walk', t: 0 }, statuses: {}, size: 1, rank: 'champion', boss: false, def: MONSTER.rot_zombie, name: '腐れ屍' };
  const sc = { settings: { fx: 'high', dmgNumbers: true, lootBeams: true }, camX: 0, game: { combat: { hero, areas: [], buffs: [] }, state: { hero: { cls: 'warrior' } } }, stop: 0, slow: 0, trauma: 0,
    hitstop(v) { this.stop = v; }, slowmo(v) { this.slow = v; }, addTrauma(v) { this.trauma += v; }, vx: (u) => u.x, visOf: () => ({}) };
  return { sc, hero, mon };
}
await t('すべての出来事・知らない出来事で例外が出ない', async () => {
  const { sc, hero, mon } = fakeScene();
  const fx = new FxSystem(sc);
  const { generateItem } = await import('../src/game/loot.js');
  const { RNG } = await import('../src/engine/rng.js');
  const rng = new RNG(3);
  const items = ['common', 'magic', 'rare', 'epic', 'legendary', 'set', 'unique', 'mythic'].map((r) => { const it = generateItem(rng, { ilvl: 20, minRarity: r }); if (it) it.rarity = r; return it; }).filter(Boolean);
  const events = [
    { t: 'dmg', x: 300, y: 0, z: 70, v: 123, crit: true, el: 'fire', team: 'enemy' }, { t: 'dmg', x: 0, y: 0, z: 80, v: 30, el: 'phys', team: 'hero', hero: true },
    { t: 'text', x: 1, y: 0, text: '凍結', color: '#9ae8ff' }, { t: 'hit', x: 300, y: 0, z: 50, el: 'cold', skill: 's_bolt' },
    { t: 'swing', x: 300, y: 0, r: 70, el: 'phys', skill: 'w_slash', src: hero }, { t: 'swing', x: 0, y: 0, el: 'phys', enemy: true, src: mon }, { t: 'swing', x: 300, y: 0, skill: 'a_stab', src: hero },
    { t: 'nova', x: 0, y: 0, r: 200, el: 'cold', skill: 's_nova' }, { t: 'nova', x: 0, y: 0, r: 170, el: 'phys', skill: 'w_cleave' }, { t: 'nova', x: 0, y: 0, r: 160, el: 'void', skill: 'a_fan' }, { t: 'nova', x: 0, y: 0, r: 160, el: 'lightning' }, { t: 'nova', x: 0, y: 0, r: 160, el: 'poison', small: true }, { t: 'nova', x: 0, y: 0, r: 160, el: 'fire' },
    { t: 'pulse', x: 1, y: 0, r: 90, el: 'fire', team: 'hero' }, { t: 'pulse', x: 2, y: 0, r: 110, team: 'enemy', art: 'fx.enemy.slam' }, { t: 'pulse', x: 2, y: 0, r: 70, team: 'enemy', art: 'fx.enemy.zap', el: 'lightning' }, { t: 'pulse', x: 2, y: 0, r: 120, team: 'enemy', art: 'fx.enemy.blast', el: 'fire' },
    { t: 'chain', pts: [{ x: 0, y: 0, z: 60 }, { x: 200, y: 10, z: 50 }, { x: 300, y: -10, z: 50 }], el: 'lightning' },
    { t: 'death', unit: mon }, { t: 'death', unit: { ...mon, boss: true, rank: 'boss' } }, { t: 'shake', power: 6 }, { t: 'gold', x: 300, y: 0, v: 1234 },
    ...items.map((it) => ({ t: 'loot', x: 300, y: 0, item: it, where: 'bag' })), { t: 'loot', x: 300, y: 0, item: items[2], where: 'salvaged' }, { t: 'loot', x: 300, y: 0, item: { ...items[4], q: 2 }, where: 'equipped' },
    { t: 'levelup', level: 5 }, { t: 'levelup', paragon: 3 }, { t: 'summon', x: 0, y: 0, unit: { ...mon, kind: 'minion', skill: 'n_skeleton' } }, { t: 'buff', unit: hero, el: 'fire', skill: 'w_slash' },
    { t: 'boss', unit: { ...mon, boss: true, rank: 'actboss', name: 'ボス' } }, { t: 'cast', unit: hero, skill: 's_nova', el: 'cold', behavior: 'nova', dur: 0.6 }, { t: 'heroDeath', unit: hero }, { t: 'revive', unit: hero },
    // 戦闘担当が足す予定の物（値の名前が違っても動くこと）
    { t: 'beam', x: 0, y: 0, x2: 500, y2: 0, el: 'fire', unit: hero }, { t: 'beam', unit: hero, target: mon, el: 'void' }, { t: 'leap', x: 0, y: 0, tx: 300, ty: 0 }, { t: 'land', x: 300, y: 0, r: 150 }, { t: 'dash', x: 0, y: 0, x2: 200 }, { t: 'ult', skill: 'w_cleave', cls: 'warrior', unit: hero },
    { t: 'crit', x: 300, y: 0 }, { t: 'whirl', unit: hero, r: 150 }, { t: 'aura', unit: hero, r: 180, el: 'holy' }, { t: 'trap', x: 200, y: 0 }, { t: 'totem', x: 100, y: 0 }, { t: 'meteor', x: 300, y: 0, r: 160 }, { t: 'orbit', unit: hero, count: 4 },
    { t: 'wall', x: 0, y: 0, dir: 1 }, { t: 'wave', x: 0, y: 0, tx: 500 }, { t: 'curse', x: 300, y: 0, r: 100 }, { t: 'barrier', unit: hero, dur: 2 }, { t: 'shield', unit: hero }, { t: 'teleport', x: 0, y: 0, x2: 100 }, { t: 'telegraph', x: 300, y: 0, r: 120, dur: 1 },
    { t: 'explode', x: 300, y: 0, r: 120, el: 'poison' }, { t: 'heal', unit: hero, v: 50 }, { t: 'spawn', unit: mon }, { t: 'enrage', unit: mon },
    { t: 'totally_unknown_event' }, { t: 'unknown2', x: 10, y: 0 }, { t: 'unknown3', unit: hero }, { t: 'unknown4', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, { t: 'unknown5', x: 0, y: 0, x2: 100 }, { t: 'unknown6', x: 0, y: 0, r: 100 },
  ];
  for (const e of events) fx.handle(e);
  ok(Object.keys(FX_HANDLERS).length >= 40, `出来事の種類が少ない ${Object.keys(FX_HANDLERS).length}`);
  const c = new FakeCanvas().getContext('2d');
  for (let i = 0; i < 120; i++) { fx.update(1 / 60, 1 / 60); fx.drawUnder(c); fx.drawOver(c); fx.drawDrops(c); fx.drawNumbers(c); fx.drawOverlay(c, 1280, 720); }
  ok(sc.trauma > 0 && sc.slow > 0 && sc.stop > 0, '揺れ・スロー・止まりが起きない');
  // 弾と地面
  for (const p of [{ p: { id: 'r_shot' }, el: 'phys' }, { p: { id: 'n_bonespear' }, el: 'phys' }, { p: { id: 'a_stab' }, el: 'phys' }, { p: { id: 's_bolt' }, el: 'lightning' }, { p: { id: 's_bolt' }, el: 'fire' }, { p: { id: 's_bolt' }, el: 'cold' }, { p: { id: 's_bolt' }, el: 'poison' }, { p: { id: 's_bolt' }, el: 'void' }, { team: 'enemy', art: 'fx.enemy.arrow', el: 'phys' }, { team: 'enemy', art: 'fx.enemy.fireball', el: 'fire' }, { team: 'enemy', art: 'fx.enemy.orb', el: 'phys' }, { team: 'enemy', art: 'fx.enemy.bone', el: 'phys' }, { team: 'enemy', art: 'fx.enemy.ice', el: 'cold' }, { team: 'enemy', art: 'fx.enemy.spit', el: 'poison' }]) {
    const pr = { team: 'hero', x: 100, y: 0, z: 50, vx: 900, vy: 0, t: 0.1, size: 1, art: `fx.${p.p?.id}.proj`, ...p };
    for (let i = 0; i < 20; i++) fx.drawProjectile(c, pr, 100 + i * 10, 500);
  }
  for (const a of [{ team: 'enemy', r: 100, delay: 1, t: 0.5, fired: false, art: 'fx.enemy.zap', el: 'lightning' }, { team: 'hero', r: 100, delay: 0.5, t: 0.4, fired: false, p: { id: 'r_multishot' }, el: 'phys' }, ...['fire', 'cold', 'poison', 'lightning', 'void', 'phys'].map((el) => ({ team: 'hero', r: 100, delay: 0, dur: 3, t: 1, fired: true, el, id: 5, x: 0, y: 0 })), { team: 'hero', r: 120, dur: 5, t: 1, fired: true, follow: hero, el: 'holy' }]) fx.drawArea(c, a, 300, 500);
});
await t('ダメージの数字: 100ms で合算・同時 30 個まで・設定で消せる', () => {
  const { sc } = fakeScene();
  const fx = new FxSystem(sc);
  fx.addNumber({ x: 300, y: 0, v: 10, unit: { id: 7 }, team: 'enemy' });
  fx.addNumber({ x: 305, y: 0, v: 15, unit: { id: 7 }, team: 'enemy' });
  ok(fx.nums.length === 1 && fx.nums[0].v === 25, `合算されない ${fx.nums.length} ${fx.nums[0]?.v}`);
  fx.addNumber({ x: 900, y: 0, v: 5, crit: true, team: 'enemy' });
  fx.addNumber({ x: 902, y: 0, v: 5, team: 'enemy' });
  ok(fx.nums.length === 2 && fx.nums[1].crit, '会心の合算');
  fx.update(0.15, 0.15);
  fx.addNumber({ x: 300, y: 0, v: 5, unit: { id: 7 }, team: 'enemy' });
  ok(fx.nums.length === 3, '100ms を過ぎたら別の数字');
  for (let i = 0; i < 100; i++) fx.addNumber({ x: i * 50, y: 0, v: i, unit: { id: 100 + i }, team: 'enemy' });
  ok(fx.nums.length <= 30, `上限を超える ${fx.nums.length}`);
  sc.settings.fxDmgMode = 'crit'; const n0 = fx.nums.length;
  fx.addNumber({ x: 9999, y: 0, v: 1, unit: { id: 9999 }, team: 'enemy' });
  ok(fx.nums.length === n0, '会心だけの設定');
  sc.settings.dmgNumbers = false; fx.addNumber({ x: 9999, y: 0, v: 1, crit: true, unit: { id: 9998 }, team: 'enemy' });
  ok(fx.nums.length === n0, '数字を出さない設定');
});
await t('粒は上限を超えない', () => {
  const { sc } = fakeScene();
  const fx = new FxSystem(sc);
  for (let i = 0; i < 400; i++) fx.burst(0, 0, '#fff', 20, 100, { kind: 'spark' });
  fx.update(0.01, 0.01);
  ok(fx.parts.list.length <= fx.parts.max, `${fx.parts.list.length} > ${fx.parts.max}`);
  sc.settings.fx = 'low'; fx.update(0.01, 0.01); ok(fx.parts.max < 400, 'low で減らない');
});

// ---------- 戦闘の画面を回す
await t('戦闘の画面を 600 フレーム回しても壊れず軽い（JS の負担）', async () => {
  const { Game } = await import('../src/game/game.js');
  const { Scene } = await import('../src/render/scene.js');
  const results = [];
  for (const cls of CLASSES.map((c) => c.id)) {
    const g = new Game();
    g.newGame(cls, 'テスト');
    const sc = new Scene(new FakeCanvas(), g);
    let ms = 0;
    for (let i = 0; i < 120; i++) {
      for (let k = 0; k < 3; k++) g.tick(0.05);
      const t0 = performance.now(); sc.frame(1 / 60); ms += performance.now() - t0;
    }
    // ボス
    g.state.world.stage = 10; g.sys.world.startStage();
    for (let i = 0; i < 60; i++) { g.tick(0.05); sc.frame(1 / 60); }
    results.push(ms / 120);
  }
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  ok(avg < 6, `1 フレームが重い ${avg.toFixed(2)}ms`);
  console.log(`  戦闘の画面: 1 フレーム平均 ${avg.toFixed(2)}ms（Node・描画なし）`);
});

console.error = origErr;
console.log(`art: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
