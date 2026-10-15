// 仕組みをまたぐ確かめ（統合担当）。Node だけで動く。実行: node tests/integrate.mjs [--quick]
// 弾のすり抜け・担当どうしの API・転生と苦行・解放の旗・ボスの大きさ・枠・音の出来事・セーブの丈夫さ・重さ。
import { Game } from '../src/game/game.js';
import { sweepHit } from '../src/game/combat.js';
import { GEMS, GEM_TIERS } from '../src/data/gems.js';
import { TREE_NODE, TREE_START } from '../src/data/tree.js';
import { heroPower } from '../src/game/character.js';
import { ZONES, ZONE, STAGES_PER_ZONE, FINAL_ZONE } from '../src/data/world.js';

const QUICK = process.argv.includes('--quick');
let pass = 0; let fail = 0;
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map((x) => x?.stack || String(x)).join(' ')); };
async function t(name, fn) {
  const before = errors.length;
  const t0 = Date.now();
  try {
    const r = await fn();
    if (r === false) throw new Error('false');
    if (errors.length > before) throw new Error(`console.error: ${errors.slice(before, before + 2).join(' | ').slice(0, 600)}`);
    pass++;
    if (process.env.VERBOSE) console.log(`✔ ${name} (${Date.now() - t0}ms)`);
  } catch (e) { fail++; console.log(`✘ ${name}: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}`); }
}
const ok = (c, m = '') => { if (!c) throw new Error(m || 'not ok'); };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const near = (a, b, eps = 1e-6, m = '') => { if (Math.abs(a - b) > eps) throw new Error(`${m} ${a} ≉ ${b}`); };

function fresh(cls = 'warrior', seed = 11, level = 1) {
  const g = new Game({ seed });
  g.newGame(cls, 'テスト');
  if (level > 1) { g.state.hero.level = level; g.sys.skills.learnUnlocked(true); g.combat.recalc(true); g.combat.hero.life = g.combat.hero.maxLife; }
  return g;
}
const run = (g, sec) => { for (let i = 0; i < sec * 20; i++) g.tick(0.05); };
/** 戦闘だけを止めずに、ウェーブの敵を消して静かにする（弾の確かめ用） */
function quiet(g) {
  const ws = g.sys.world;
  g.combat.clearEnemies();
  ws.spawnQueue = []; ws.wave = 99;
  g.combat.projs = []; g.combat.areas = [];
}

// ======================================================================= 1. 弾のすり抜け
await t('sweepHit: 線分と円の当たり（通り抜け・始点が中・届かない・後ろ・離れる）', () => {
  near(sweepHit(0, 0, 100, 0, 50, 0, 10), 0.4, 1e-9, 'through');
  eq(sweepHit(0, 0, 100, 0, 3, 0, 10), 0, 'inside');
  eq(sweepHit(0, 0, 30, 0, 50, 0, 10), -1, 'short');
  eq(sweepHit(0, 0, 100, 0, -50, 0, 10), -1, 'behind');
  eq(sweepHit(0, 0, 100, 0, 50, 30, 10), -1, 'above');
  ok(sweepHit(0, 0, 100, 0, 50, 8.5, 10) > 0, 'y は 0.9 倍の楕円（縦 9 まで当たる）');
  eq(sweepHit(0, 0, 100, 0, 50, 9.5, 10), -1, 'y 9.5 は外れ');
});

await t('速い弾が 30〜50px の近さの敵をすり抜けない（出た位置に重なった敵にも当たる）', () => {
  const g = fresh('ranger', 3, 30);
  quiet(g);
  const c = g.combat; const h = c.hero;
  for (const dx of [0, 30, 40, 50, 70, 130]) {
    quiet(g);
    const u = c.spawnMonster('rot_zombie', { level: 30, lifeMul: 1e6, x: h.x + dx, y: h.y });
    const pr = c.spawnProj({ src: h, team: 'hero', x: h.x + 30 * h.face, y: h.y, z: 55, angle: 0, speed: 1300, p: c.params('r_shot'), range: 900, art: 'fx.r_shot.proj' });
    const life0 = u.life;
    for (let i = 0; i < 6 && !pr.dead; i++) c.tickProjectiles(0.05);
    ok(pr.hit.has(u.id), `dx=${dx} で当たらなかった`);
    ok(pr.dead, `dx=${dx} 貫通 0 なのに消えない`);
    ok(Math.abs(pr.x - u.x) <= 60, `dx=${dx} 当たった位置 ${Math.round(pr.x - u.x)}`);
    ok(u.life < life0, `dx=${dx} ダメージが入らない`);
  }
});

await t('貫通しない弾は近い敵から当たる・道から外れた敵には当たらない', () => {
  const g = fresh('ranger', 4, 30);
  quiet(g);
  const c = g.combat; const h = c.hero;
  const far = c.spawnMonster('rot_zombie', { level: 30, lifeMul: 1e6, x: h.x + 60, y: h.y });
  const near0 = c.spawnMonster('rot_zombie', { level: 30, lifeMul: 1e6, x: h.x + 45, y: h.y });
  const off = c.spawnMonster('rot_zombie', { level: 30, lifeMul: 1e6, x: h.x + 90, y: h.y + 120 });
  const pr = c.spawnProj({ src: h, team: 'hero', x: h.x + 30, y: h.y, angle: 0, speed: 1300, range: 900, pierce: 0 });
  for (let i = 0; i < 20 && !pr.dead; i++) c.tickProjectiles(0.05);
  ok(pr.hit.has(near0.id) && !pr.hit.has(far.id), '近い方に当たる');
  const pr2 = c.spawnProj({ src: h, team: 'hero', x: h.x + 30, y: h.y, angle: 0, speed: 1300, range: 900, pierce: 5 });
  for (let i = 0; i < 20 && !pr2.dead; i++) c.tickProjectiles(0.05);
  ok(pr2.hit.has(near0.id) && pr2.hit.has(far.id) && !pr2.hit.has(off.id), '貫通は道の上の敵だけ');
});

await t('狩人・魔導士が目の前の敵（40px）に詰められても、離れた敵と同じくらい削れる', () => {
  const dealt = (cls, dx) => {
    const g = fresh(cls, 5, 20);
    quiet(g);
    const c = g.combat; const h = c.hero;
    const u = c.spawnMonster('rot_zombie', { level: 20, lifeMul: 1e4, dmgMul: 0, x: h.x + dx, y: h.y });
    u.speed = 0; // 動かない（ずっと同じ距離にいる）
    const life0 = u.life;
    for (let i = 0; i < 20 * 8; i++) c.tick(0.05);
    return life0 - u.life;
  };
  for (const cls of ['ranger', 'sorcerer']) {
    const nearD = dealt(cls, 40); const farD = dealt(cls, 260);
    ok(nearD > 0 && nearD >= farD * 0.5, `${cls}: 近く ${Math.round(nearD)} / 離れて ${Math.round(farD)}`);
  }
});

await t('突進は体の大きさぶん手前で止まる（72px の回避は不要になった）', () => {
  const g = fresh('ranger', 6, 20);
  quiet(g);
  const c = g.combat; const h = c.hero;
  const u = c.spawnMonster('ash_wolf', { level: 20, lifeMul: 100, x: h.x + 300, y: h.y });
  u.def = { ...u.def, attack: 'charge' }; u._chT = 0;
  const fx = [];
  for (let i = 0; i < 20 * 3; i++) { c.tick(0.05); fx.push(...c.fx.splice(0)); }
  const ch = fx.find((e) => e.t === 'charge' && e.unit === u);
  if (ch) ok(Math.abs(ch.tx - h.x) < 72, `止まる位置 ${Math.round(Math.abs(ch.tx - h.x))}`);
});

// ======================================================================= 2. 担当どうしの API
await t('gems.grantRandom(段階) → { id, name }・持ち物に入る・段階は 1〜10 に収まる', () => {
  const g = fresh('warrior', 7);
  const r = g.sys.gems.grantRandom(3);
  ok(r && typeof r.id === 'string' && typeof r.name === 'string' && r.name.length > 0, JSON.stringify(r));
  eq(r.tier, 3); eq(g.state.inv.gems[r.id], 1);
  ok(GEMS.some((x) => x.id === r.type));
  eq(g.sys.gems.grantRandom(99).tier, GEM_TIERS); eq(g.sys.gems.grantRandom(-5).tier, 1);
  eq(g.sys.gems.grantRandom(2, 'ember').id, 'ember_2');
});

await t('日課の宝箱の宝石は本物の宝石になる（欠片に置きかわらない）', () => {
  const g = fresh('warrior', 8);
  const shard0 = g.state.inv.mats.shard || 0;
  const got = g.sys.bounties.grant({ gold: 10, gem: 4 });
  eq(got.gems.length, 1); ok(got.gems[0].name && got.gems[0].id.endsWith('_4'), JSON.stringify(got.gems));
  eq(g.state.inv.gems[got.gems[0].id], 1);
  eq(g.state.inv.mats.shard || 0, shard0, '欠片は増えない');
});

await t('tree.autoAllocate: 残りの点を全部、つながる形で振る（要石は振らない・戦力が上がる）', () => {
  for (const cls of ['warrior', 'sorcerer', 'necromancer']) {
    const g = fresh(cls, 9, 40);
    const tr = g.sys.tree; const t0 = g.state.hero.tree;
    t0.points = 25;
    const p0 = heroPower(g.H, g.state);
    const n = tr.autoAllocate();
    eq(n, 25, `${cls} 振った数`); eq(t0.points, 0);
    eq(tr.connected(t0.alloc).size, t0.alloc.length, `${cls} つながっていない点`);
    ok(t0.alloc[0] === TREE_START[cls] || t0.alloc.includes(TREE_START[cls]));
    ok(!t0.alloc.some((id) => TREE_NODE[id].type === 'keystone'), '要石');
    ok(heroPower(g.H, g.state) > p0, `${cls} 戦力 ${p0} → ${heroPower(g.H, g.state)}`);
    eq(tr.autoAllocate(), 0, '点が無ければ 0');
  }
});

await t('tree.autoAllocate(max) は 1 回の上限を守る・名前は両方の担当で一致（autoAllocate / autoParagon）', () => {
  const g = fresh('ranger', 10, 30);
  g.state.hero.tree.points = 10;
  eq(g.sys.tree.autoAllocate(4), 4); eq(g.state.hero.tree.points, 6);
  ok(typeof g.sys.tree.autoParagon === 'function');
});

await t('祭壇「自動の修練」: スキルポイントが 0 でも星座盤・パラゴンの点を振る', () => {
  const g = fresh('sorcerer', 12, 100);
  const st = g.state;
  st.meta.upgrades.auto_skill = 1; g.sys.prestige.applyUnlocks();
  ok(st.meta.unlocks.autoSkill);
  st.hero.skillPoints = 0; st.hero.tree.points = 6; st.hero.paragon.level = 20;
  ok(g.sys.tree.paragonFree() > 0);
  run(g, 2.2);
  eq(st.hero.tree.points, 0, '星座盤'); eq(g.sys.tree.paragonFree(), 0, 'パラゴン');
});

// ======================================================================= 3. 転生と苦行
function storyClear(g) {
  const w = g.state.world; const ws = g.sys.world;
  w.maxZone = ZONES.length - 1; w.zone = FINAL_ZONE; w.stage = STAGES_PER_ZONE; w.maxStage[FINAL_ZONE] = STAGES_PER_ZONE;
  for (const z of ZONES) if (z.id !== FINAL_ZONE) { w.cleared[z.id] = true; w.maxStage[z.id] = STAGES_PER_ZONE; }
  g.state.meta.prestige.unlocked = true; // 第五章のボスを倒した扱い（ここでは章のボスを飛ばしている）
  ws.startStage(); run(g, 1);
  ok(ws.bossUnit?.defId === 'boss_abyss_king', 'final boss');
  g.combat.killUnit(ws.bossUnit, g.combat.hero); run(g, 0.3);
  eq(w.maxTorment, 1, 'story clear → torment I');
}

await t('転生のあとも苦行・裂け目・門番は開いたまま（maxTorment で判定）', () => {
  const g = fresh('sorcerer', 13, 70);
  storyClear(g);
  const w = g.state.world; const ws = g.sys.world; const ps = g.sys.prestige; const rift = g.sys.rift;
  ws.setTorment(1); eq(w.torment, 1);
  // 裂け目の中では転生できない
  ok(rift.begin(1).ok); eq(w.mode, 'rift');
  ok(!ps.canRebirth().ok, '裂け目の中');
  rift.abandon(); run(g, 0.2); eq(w.mode, 'campaign');
  w.bossFailZone = 'a9z3';
  g.state.meta.prestige.life.maxLevel = 90;
  const r = ps.rebirth();
  ok(r.ok, r.msg);
  ok(!w.cleared[FINAL_ZONE], '物語は戻る'); eq(w.torment, 0); eq(w.maxTorment, 1, '苦行の解放は残る');
  eq(w.bossFailZone, null, '負けた印は持ち越さない');
  ok(rift.available(), '裂け目');
  ok(ws.setTorment(1) && w.torment === 1, '苦行 I を選べる');
  ok(ws.level() >= 60, `苦行の敵のレベル ${ws.level()}`);
  // 門番: 欠片がそろえば呼べる
  for (let k = 0; k < 4; k++) w.gate.frags[`g1_${k}`] = 1;
  ok(rift.canSummon(0), '門番');
  // 裂け目に入って戻ると、転生後の地域・苦行の段に戻る
  const zone = w.zone;
  ok(rift.begin(1).ok); run(g, 0.5); rift.abandon(); run(g, 0.2);
  eq(w.mode, 'campaign'); eq(w.zone, zone, '戻る地域'); eq(w.torment, 1, '戻る段');
  ok(w.torment <= w.maxTorment);
  run(g, 5);
});

await t('転生 → セーブ → 読み込みでも苦行は開いたまま', () => {
  const g = fresh('warrior', 14, 70);
  storyClear(g);
  g.state.meta.prestige.life.maxLevel = 90;
  ok(g.sys.prestige.rebirth().ok);
  const g2 = new Game({ seed: 2 });
  g2.load(JSON.parse(JSON.stringify(g.state)));
  eq(g2.state.world.maxTorment, 1); ok(g2.sys.rift.available()); ok(g2.sys.world.setTorment(1));
});

// ======================================================================= 4. 解放の旗
await t('autoBoss: ワールドは meta.unlocks.autoBoss を読む（祭壇の ON/OFF で切り替わる）', () => {
  const g = fresh('warrior', 15, 10);
  const w = g.state.world; const ws = g.sys.world; const ps = g.sys.prestige;
  const z = ws.zone();
  w.bossFailZone = z.id; w.stage = 5; ws.logFor(z.id).lastTry = -1e9;
  g.state.meta.upgrades.auto_boss = 1; ps.applyUnlocks();
  ok(g.state.meta.unlocks.autoBoss === true && ws.shouldAutoRetry(), 'on');
  ps.setToggle('autoBoss', false);
  ok(g.state.meta.unlocks.autoBoss === false && !ws.shouldAutoRetry(), 'off');
});

await t('autoTorment: スイッチは 1 つ（地図の切り替え = 祭壇の ON/OFF）・祭壇が無ければ動かない', () => {
  const g = fresh('sorcerer', 16, 70);
  const w = g.state.world; const ws = g.sys.world; const ps = g.sys.prestige;
  w.maxTorment = 3; ws.setTorment(1);
  ok(!ws.canTormentAuto() && !ws.setTormentAuto(true) && !ws.tormentAutoOn(), '未解放');
  ws.tw = { t: 119.99, kills: 500, deaths: 0 }; ws.tickCampaignExtras(0.05);
  eq(w.torment, 1, '未解放なら段を変えない');
  g.state.meta.upgrades.auto_torment = 1; ps.applyUnlocks();
  ok(ws.tormentAutoOn(), '買うと ON');
  ok(ws.setTormentAuto(false) && g.state.meta.unlocks.autoTorment === false && g.state.meta.prestige.toggles.autoTorment === false, '地図で OFF → 祭壇も OFF');
  ws.tw = { t: 119.99, kills: 500, deaths: 0 }; ws.tickCampaignExtras(0.05);
  eq(w.torment, 1, 'OFF なら変えない');
  ps.setToggle('autoTorment', true);
  ok(ws.tormentAutoOn(), '祭壇で ON → 地図も ON');
  ws.tw = { t: 119.99, kills: 500, deaths: 0 }; ws.tickCampaignExtras(0.05);
  eq(w.torment, 2, 'ON なら上げる');
});

await t('古いセーブの world.tormentAuto は捨てる（祭壇のスイッチに一本化）', () => {
  const g = fresh('warrior', 17);
  const raw = JSON.parse(JSON.stringify(g.state));
  raw.world.tormentAuto = true;
  const g2 = new Game({ seed: 1 }); g2.load(raw);
  ok(!('tormentAuto' in g2.state.world)); ok(!g2.sys.world.tormentAutoOn());
});

await t('祭壇の自動化の旗は全部どこかで読まれる（autoSkill・autoBoss・autoSalvage・autoHatch・autoBounty・autoTorment・autoRebirth）', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ALTAR } = await import('../src/data/prestige.js');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(root);
  const code = files.filter((f) => !f.endsWith(path.join('data', 'prestige.js'))).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const u of ALTAR) if (u.unlock) ok(new RegExp(`unlocks(\\?)?\\.${u.unlock}\\b`).test(code), `unlocks.${u.unlock} を読む所が無い`);
});

// ======================================================================= 5〜7. 絵の枠（ボスの大きさ・握り・dpr・使われる ID）
const { assets, fallbackDpr } = await import('../src/render/assets.js');
const manifest = await import('../src/render/manifest.js');
await manifest.installManifest();
const { MONSTERS, MONSTER } = await import('../src/data/monsters.js');
const { SKILLS, skillsOf } = await import('../src/data/skills.js');
const { CLASSES } = await import('../src/data/classes.js');

await t('ボスの見た目は詰めた大きさ（枠 1.6 倍 × 1.4〜1.85）・当たりの大きさは変えない', () => {
  // 画面の上の高さ（枠の 150px 基準）。ボスの絵は枠を約 95%、普通の敵は約 84% 埋めるので、実際の絵の高さの比は約 1.13 倍になる（smoke で実測）
  const ratios = [];
  for (const m of MONSTERS) {
    if (!m.boss) continue;
    for (const mul of [1, 1.3]) { // 「巨体」の詞で 1.3 倍
      const u = { kind: 'monster', def: m, size: (m.size || 1) * mul };
      const s = manifest.unitDrawScale(u);
      ok(s.size >= 1.4 && s.size <= 1.85, `${m.id} ×${mul} 見た目 ${s.size.toFixed(2)}`);
      near(assets.spec(`monster.${m.id}`).h * s.art / 150, s.size, 1e-9, `${m.id} 枠と倍率`);
      if (mul === 1) ratios.push(s.size);
    }
  }
  const avg = ratios.reduce((x, y) => x + y, 0) / ratios.length;
  ok(avg * 1.13 >= 1.6 && avg * 1.13 <= 1.9, `平均 ${avg.toFixed(2)}（絵の高さの比 ${(avg * 1.13).toFixed(2)}）`);
  // 普通の敵・召喚物はこれまでどおり（大きさをそのまま掛ける）
  const z = MONSTER.rot_zombie;
  eq(manifest.unitDrawScale({ kind: 'monster', def: z, size: 1.15 }).art, 1.15);
  eq(manifest.unitDrawScale({ kind: 'minion', size: 1.3 }).art, 1.3);
  // 戦いの当たり（u.size）はデータのまま
  const g = fresh('warrior', 21, 10);
  const b = g.combat.spawnMonster('boss_butcher', { level: 10, rank: 'boss' });
  eq(b.size, MONSTER.boss_butcher.size);
});

await t('弓・弩の握りは枠の真ん中（ay 0.5）・ほかの武器は 0.82・ユニークの弓も同じ', async () => {
  const { BASES } = await import('../src/data/items.js');
  const { UNIQUES } = await import('../src/data/uniques.js');
  eq(assets.spec('gear.bow').ay, 0.5); eq(assets.spec('gear.crossbow').ay, 0.5); eq(assets.spec('gear.sword').ay, 0.82);
  const bowU = UNIQUES.find((u) => /^bow|crossbow/.test(u.base || '') || BASES.find((b) => b.id === u.base)?.kind === 'bow');
  if (bowU) eq(assets.spec(`gear.u.${bowU.id}`).ay, 0.5, bowU.id);
});

await t('コードの絵の細かさ: 背景・タイトルは 1 倍（記憶を節約）・小さな絵は 2 倍', () => {
  eq(fallbackDpr(assets.spec('bg.act1')), 1); eq(fallbackDpr(assets.spec('bg.act1.ground')), 1); eq(fallbackDpr(assets.spec('ui.title')), 1);
  eq(fallbackDpr(assets.spec('monster.rot_zombie')), 2); eq(fallbackDpr(assets.spec('icon.item.sword')), 2); eq(fallbackDpr(assets.spec('ui.logo')), 2);
  eq(fallbackDpr({ w: 100, h: 100, dpr: 3 }), 3);
});

await t('戦いで使われる絵の ID はすべて枠がある（全クラスの全スキル・ルーン・ボスの特技・エリートの詞・ペット）', async () => {
  const { ELITE_AFFIXES } = await import('../src/data/monsters.js');
  const used = new Map(); // id → どこで
  const note = (id, where) => { if (id && typeof id === 'string' && !used.has(id)) used.set(id, where); };
  const PART = { hit: 'hit', swing: 'swing', nova: 'area', pulse: 'area' };
  const collect = (g, where) => {
    const c = g.combat;
    for (const u of c.units) if (u.kind !== 'hero') note(u.art, `${where} unit ${u.kind}`); // 主人公は着せ替え（u.art は使わない）
    for (const p of c.projs) note(p.art, `${where} proj`);
    for (const a of c.areas) note(a.art, `${where} area`);
    for (const e of c.fx) { if (e.skill && PART[e.t]) note(`fx.${e.skill}.${PART[e.t]}`, `${where} fx ${e.t}`); if (e.art) note(e.art, `${where} fx.art ${e.t}`); }
    c.fx.length = 0;
  };
  for (const cl of CLASSES) {
    const g = fresh(cl.id, 22, 60);
    const st = g.state; st.hero.autoBar = false;
    for (const id of Object.keys(st.hero.skills)) st.hero.skills[id].lvl = 10;
    const basic = skillsOf(cl.id).find((s) => s.basic).id;
    for (const s of skillsOf(cl.id)) {
      for (const rune of [null, ...s.runes.map((r) => r.id)]) {
        st.hero.skills[s.id].rune = rune;
        st.hero.bar = s.basic ? [s.id] : [basic, s.id];
        g.combat.recalc(); g.combat.hero.cds = {}; g.combat.hero.resource = g.H.resourceMax;
        if (s.behavior === 'corpse') g.combat.corpses.push({ x: g.combat.hero.x + 90, y: 0, maxLife: 1000, t: 10, id: -1 });
        g.combat.spawnMonster(s.kind === 'ult' ? 'boss_butcher' : 'bog_slime', { level: 60, lifeMul: 40, rank: s.kind === 'ult' ? 'boss' : 'normal', x: g.combat.hero.x + 120 });
        for (let i = 0; i < 20 * (QUICK ? 1.5 : 3); i++) { g.tick(0.05); collect(g, `${s.id}${rune ? `.${rune}` : ''}`); g.combat.hero.resource = g.H.resourceMax; }
        if (g.combat.hero.dead) g.combat.reviveHero();
      }
    }
  }
  // ボスの特技・エリートの詞
  const g = fresh('warrior', 23, 60);
  g.combat.H.life *= 1e6; // 倒れない
  for (const m of MONSTERS.filter((x) => x.abilities?.length || x.attack)) {
    g.combat.clearEnemies();
    const u = g.combat.spawnMonster(m.id, { level: 60, rank: m.boss ? 'boss' : 'normal', lifeMul: 1e4, x: g.combat.hero.x + 260 });
    for (const ab in u.abilityT) u.abilityT[ab] = 0.05;
    for (let i = 0; i < 20 * 4; i++) { g.tick(0.05); collect(g, `monster ${m.id}`); g.combat.hero.life = g.combat.hero.maxLife; if (g.combat.hero.dead) g.combat.reviveHero(); }
  }
  for (const a of ELITE_AFFIXES) {
    g.combat.clearEnemies();
    g.combat.spawnMonster('rot_zombie', { level: 60, rank: 'rare', elite: [a.id], lifeMul: 1e4, x: g.combat.hero.x + 300 });
    for (let i = 0; i < 20 * 5; i++) { g.tick(0.05); collect(g, `elite ${a.id}`); g.combat.hero.life = g.combat.hero.maxLife; if (g.combat.hero.dead) g.combat.reviveHero(); }
  }
  const missing = [...used].filter(([id]) => !assets.slots.has(id));
  ok(!missing.length, `${missing.length} 個: ${missing.slice(0, 60).map(([id, w]) => `${id}（${w}）`).join(' / ')}`);
  ok(used.size > 150, `集めた ID ${used.size}`);
});

// ======================================================================= 9. 出来事の名前と音
const { EVENT_SFX, makeEventHandler } = await import('../src/audio/hooks.js');
const { SFX } = await import('../src/audio/sfx.js');

/** src の中で実際に emit されている game.events の名前 */
async function emittedEvents() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
  const out = new Set();
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/events\.emit\('([A-Za-z]+)'/g)) out.add(m[1]); } };
  walk(root);
  return out;
}

await t('大事な出来事は実際に出ている名前で音に結びつく（鍛冶・裂け目・ため込み屋・実績・転生・ペット・卵・刻印・熟練・門番・苦行…）', async () => {
  const names = await emittedEvents();
  const cases = [
    ['crafted', { kind: 'enhance', success: true }, 'enhance_ok'], ['crafted', { kind: 'enhance', success: true, great: true }, 'enhance_great'], ['enhance', { ok: false }, 'enhance_fail'],
    ['crafted', { kind: 'reroll' }, 'reroll'], ['crafted', { kind: 'chaos' }, 'reroll'], ['crafted', { kind: 'corrupt' }, 'corrupt'], ['crafted', { kind: 'drill' }, 'socket'], ['crafted', { kind: 'tierUp', crit: true }, 'enhance_great'], ['crafted', { kind: 'ascend' }, 'craft'],
    ['riftStart', {}, 'rift_start'], ['riftComplete', {}, 'rift_complete'], ['riftFail', {}, 'boss_fail'], ['goblinSpawn', {}, 'goblin'], ['goblinKill', {}, 'chest'], ['goblinEscape', {}, 'boss_fail'],
    ['achievement', { def: {} }, 'achievement'], ['titleUnlocked', {}, 'achievement'], ['rebirth', {}, 'prestige'], ['transcend', {}, 'prestige'],
    ['petHatched', { id: 'x' }, 'pet_hatch'], ['eggFound', {}, 'drop_epic'], ['glyphFound', { glyph: {} }, 'drop_rare'], ['masteryUp', {}, 'notify'],
    ['gateResult', { ok: true }, 'rift_complete'], ['gateResult', { ok: false }, 'boss_fail'], ['tormentUnlock', { tier: 2 }, 'unlock'],
    ['lgemFound', {}, 'drop_legendary'], ['lgemUpgrade', { from: 3, to: 4 }, 'gem_combine'], ['runeword', {}, 'set_bonus'], ['loginClaim', {}, 'chest'], ['bountyClaim', {}, 'chest'], ['bountyDone', {}, 'notify'],
    ['automationUnlocked', {}, 'unlock'], ['prestigeUnlocked', {}, 'unlock'], ['zoneClear', { first: true }, 'zone_clear'], ['bossFail', {}, 'boss_fail'], ['bagFull', {}, 'bag_full'],
    ['chestOpen', {}, 'chest'], ['autoEquip', {}, 'equip'], ['offlineReport', {}, 'offline'], ['skillLearned', { id: 'x' }, 'unlock'], ['altarBuy', {}, 'buy'],
  ];
  for (const [name, p, want] of cases) {
    ok(names.has(name), `「${name}」はどこからも emit されていない（名前のずれ）`);
    const m = EVENT_SFX[name];
    ok(m, `${name} に音が無い`);
    const id = typeof m === 'function' ? m(p) : m;
    eq(id, want, name);
    ok(SFX[id], `${name} → ${id} は無い効果音`);
  }
  // 静かな出来事（大量に出る・ほかの音と重なる）は鳴らさない
  for (const [name, p] of [['skillLearned', { quiet: true }], ['glyphFound', { quiet: true }], ['lgemUpgrade', { from: 3, to: 3 }], ['zoneClear', { first: false }]]) { const m = EVENT_SFX[name]; eq(typeof m === 'function' ? m(p) : m, null, name); }
});

await t('実際の鍛冶で音が鳴る（強化の成功・失敗）', async () => {
  const g = fresh('warrior', 24, 30);
  const played = [];
  const A = { engine: { running: true }, play: (id) => { played.push(id); return true; }, duck() {}, music() {}, onWorldEvent() {}, uiSound() {}, sinceStart: () => 99 };
  g.events.on('*', makeEventHandler(A));
  const item = g.state.hero.equip.weapon;
  g.state.meta.gold = 1e12;
  for (const k of Object.keys(g.state.inv.mats)) g.state.inv.mats[k] = 1e6;
  const { MATERIALS } = await import('../src/data/materials.js');
  for (const m of MATERIALS) g.state.inv.mats[m.id] = 1e6;
  for (let i = 0; i < 80 && !(played.includes('enhance_ok') && played.includes('enhance_fail')); i++) g.sys.crafting.enhance(item.uid);
  ok(played.includes('enhance_ok'), `成功 ${played.slice(0, 8)}`);
  ok(played.includes('enhance_fail'), `失敗 ${played.slice(0, 8)}`);
});

// ======================================================================= 10. セーブの丈夫さ
const { exportString, importString } = await import('../src/engine/save.js');
const { RNG } = await import('../src/engine/rng.js');
const { generateItem } = await import('../src/game/loot.js');

/** すべての仕組みを動かした終盤のセーブ（転生・苦行・裂け目の途中・ペット・刻印・宝石・極意・図鑑） */
function richGame(seed = 31) {
  const g = fresh('necromancer', seed, 70);
  const st = g.state;
  st.inv.filter.autoEquip = true;
  for (const id of ['auto_skill', 'auto_boss', 'auto_salvage', 'auto_hatch', 'auto_bounty', 'auto_torment']) st.meta.upgrades[id] = 1;
  g.sys.prestige.applyUnlocks();
  run(g, 120);
  storyClear(g);
  st.meta.prestige.life.maxLevel = 90;
  ok(g.sys.prestige.rebirth().ok, 'rebirth');
  run(g, 60);
  // 宝石・ルーン・深淵の宝石・刻印・ペット・極意
  g.sys.gems.grantRandom(4); g.sys.gems.grantRandom(2); g.sys.gems.grantLegendaryGem();
  const ring = generateItem(new RNG(5), { ilvl: 70, minRarity: 'legendary', slot: 'ring' });
  if (ring) { ring.sockets = [null]; g.sys.inv.receive(ring, { quiet: true }); }
  for (const id of ['sup_area', 'sup_brutal']) g.sys.skills.addGlyph(g.sys.skills.makeGlyph({ id, level: 10 }), { quiet: true });
  g.sys.pets.addEgg('egg_ash', 3);
  run(g, 30);
  g.state.meta.codex ||= {};
  // 苦行 I で少し → 裂け目の途中
  g.sys.world.setTorment(1); run(g, 20);
  ok(g.sys.rift.begin(1).ok, 'rift');
  run(g, 15);
  eq(st.world.mode, 'rift', '裂け目の途中');
  g.sys.achievements?.check?.({ silent: true }); // 実績は 2.5 秒ごとに調べるので、読み込みで調べた分と比べられるように先に済ませる
  return g;
}

/** 2 つの JSON の違う場所（最初のいくつか） */
function diffPaths(a, b, p = '', out = []) {
  if (out.length > 8) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(p); return out; }
  if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], `${p}.${k}`, out); return out; }
  if (a !== b) out.push(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  return out;
}

let RICH = null;
await t('終盤のセーブ（転生・裂け目の途中・ペット・刻印・宝石）を保存 → 読み込みで同じ中身になり、続きを遊べる', () => {
  const g = richGame();
  RICH = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 99 });
  g2.load(JSON.parse(RICH));
  const back = JSON.parse(JSON.stringify(g2.state));
  const d = diffPaths(JSON.parse(RICH), back);
  ok(!d.length, `違い: ${d.join(' / ')}`);
  eq(g2.state.world.mode, 'rift', '裂け目の続き');
  run(g2, 10);
  ok(g2.state.meta.stats.kills >= JSON.parse(RICH).meta.stats.kills, '続きを遊べる');
});

await t('文字列の書き出し → 読み込み（日本語の名前・壊れた文字列は分かりやすく断る）', () => {
  const st = JSON.parse(RICH);
  st.hero.name = '灰の旅人・壱';
  const s = exportString(st);
  ok(s.startsWith('ABYSS1:'));
  const back = importString(s);
  eq(JSON.stringify(back), JSON.stringify(st));
  const g = new Game({ seed: 1 }); g.load(back); eq(g.state.hero.name, '灰の旅人・壱');
  let msg = '';
  try { importString(`${s.slice(0, -12)}AAAA`); } catch (e) { msg = e.message; }
  ok(/壊れて|形が違い/.test(msg), `壊れた文字列: ${msg}`);
  try { importString('ほげ'); msg = ''; } catch (e) { msg = e.message; }
  ok(msg.includes('形が違い'), msg);
});

await t('壊れたセーブ（値を消す・null・形の違う値・名前空間ごと壊す）でも落ちずに読めて遊べる', () => {
  const N = Number(process.env.FUZZ_N) || (QUICK ? 120 : 400);
  const rng = new RNG(Number(process.env.FUZZ_SEED) || 2024);
  const VALUES = [null, -1, 0, 1e308, 'abc', '', true, false, [], {}, [1, 'x', null], { x: 1 }];
  const paths = (o, pre = [], out = [], depth = 0) => { if (depth > 7 || o === null || typeof o !== 'object') return out; for (const k of Object.keys(o)) { out.push([...pre, k]); paths(o[k], [...pre, k], out, depth + 1); } return out; };
  const src = JSON.parse(RICH);
  const all = paths(src);
  const bad = [];
  for (let n = 0; n < N; n++) {
    const st = JSON.parse(RICH);
    const did = [];
    for (let j = 0, k = 1 + rng.int(0, 6); j < k; j++) {
      const p = rng.pick(all); let o = st;
      for (let i = 0; i < p.length - 1 && o && typeof o === 'object'; i++) o = o[p[i]];
      if (!o || typeof o !== 'object') continue;
      const key = p[p.length - 1]; const r = rng.next();
      if (r < 0.25) delete o[key]; else if (Array.isArray(o[key]) && r < 0.4) o[key].length = Math.floor(o[key].length / 2); else o[key] = JSON.parse(JSON.stringify(rng.pick(VALUES)));
      did.push(`${p.join('.')}=${r < 0.25 ? 'del' : JSON.stringify(o[key])?.slice(0, 20)}`);
    }
    if (process.env.FUZZ_DEBUG) console.log(n, did.join(' '));
    if (rng.chance(0.08)) st[rng.pick(['hero', 'inv', 'world', 'meta', 'settings'])] = rng.pick([null, 'x', [], 5]);
    const before = errors.length;
    try {
      const g = new Game({ seed: n });
      g.load(st);
      for (let i = 0; i < 20 * 2; i++) g.tick(0.05);
      JSON.stringify(g.snapshot());
    } catch (e) { bad.push(`#${n} ${e.message}`); }
    if (errors.length > before) { bad.push(`#${n} ${errors[before].slice(0, 200)}`); errors.length = before; }
  }
  ok(!bad.length, `${bad.length}/${N}: ${bad.slice(0, 3).join(' | ')}`);
});

await t('半分だけのセーブ・中身の無いセーブ・セーブでない物も新しい冒険として読める', () => {
  for (const raw of [{ hero: { cls: 'ranger', level: 30, name: '途中' } }, {}, null, 5, 'x', [], { hero: 'x', inv: [], world: 3 }, { hero: { cls: 'nope', level: 'abc', equip: { weapon: { base: 'nope' }, ring1: { base: 'sword_1' } } } }]) {
    const g = new Game({ seed: 3 });
    g.load(raw);
    run(g, 2);
    ok(g.state.hero && Array.isArray(g.state.inv.bag) && g.state.world.zone, JSON.stringify(raw));
    if (raw?.hero?.cls === 'ranger') { eq(g.state.hero.cls, 'ranger'); eq(g.state.hero.level, 30); }
    ok(!g.state.hero.equip.ring1, '指輪の枠に剣は着けない');
  }
});

await t('アイテムの uid が重なる・無いセーブは振り直す（同じ uid が 2 つにならない）', () => {
  const st = JSON.parse(RICH);
  const items = [...st.inv.bag, ...Object.values(st.hero.equip)];
  ok(items.length >= 3);
  items[0].uid = 5; items[1].uid = 5; delete items[2].uid;
  const g = new Game({ seed: 4 }); g.load(st);
  const all = [...g.state.inv.bag, ...g.state.inv.stash.flat(), ...Object.values(g.state.hero.equip)].map((x) => x.uid);
  eq(new Set(all).size, all.length, '重なり');
  ok(all.every((u) => u > 0));
});

await t('バッグも倉庫も満杯で自動装備しても、外した装備で倉庫が上限を超えない', () => {
  const g = fresh('warrior', 41, 40);
  const inv = g.state.inv;
  inv.filter.autoEquip = true;
  const rng = new RNG(8);
  const junk = () => generateItem(rng, { ilvl: 1, rarity: 'common', slot: 'belt' });
  while (inv.bag.length < inv.bagSize) inv.bag.push(junk());
  for (const tab of inv.stash) while (tab.length < inv.stashTabSize) tab.push(junk());
  for (let i = 0; i < 30; i++) {
    const it = generateItem(rng, { ilvl: 40 + i, minRarity: 'legendary', slot: 'weapon', cls: 'warrior' });
    g.sys.inv.receive(it, { quiet: true });
  }
  for (const tab of inv.stash) ok(tab.length <= inv.stashTabSize, `倉庫 ${tab.length}/${inv.stashTabSize}`);
  ok(inv.bag.length <= inv.bagSize, `バッグ ${inv.bag.length}`);
});

await t('セーブの大きさ: 遊ぶほど増え続ける所が無い（2 時間ぶんの伸びから 50 時間を見積もって 1 MB 未満）', () => {
  const g = fresh('ranger', 51);
  const st = g.state;
  st.inv.filter.autoEquip = true;
  for (const id of ['auto_skill', 'auto_boss', 'auto_salvage', 'auto_hatch', 'auto_bounty']) st.meta.upgrades[id] = 1;
  g.sys.prestige.applyUnlocks();
  const H = QUICK ? 1 : 2;
  // バッグと倉庫は上限まで埋まると止まる（ドロップが少ないと 30 分ではまだ埋まりきらず、伸びを大きく見積もってしまう）ので別に調べる
  const size = () => { const snap = g.snapshot(); return JSON.stringify({ ...snap, inv: { ...snap.inv, bag: [], stash: [] } }).length; };
  run(g, 1800);
  const s0 = size();
  for (let h = 0; h < H; h++) { run(g, 3600 - (h === 0 ? 1800 : 0)); g.sys.offline.grant(8 * 3600); }
  const s1 = size();
  ok(st.inv.bag.length <= st.inv.bagSize && st.inv.stash.every((tab) => tab.length <= st.inv.stashTabSize), `バッグ ${st.inv.bag.length}/${st.inv.bagSize}`);
  const full = JSON.stringify({ inv: { bag: Array.from({ length: st.inv.bagSize }, () => st.inv.bag[0] || null), stash: st.inv.stash.map(() => Array.from({ length: st.inv.stashTabSize }, () => st.inv.bag[0] || null)) } }).length;
  const perHour = Math.max(0, (s1 - s0) / (H - 0.5));
  const est50 = s1 + perHour * 50 + full; // バッグと倉庫は満杯の大きさで足す
  ok(est50 < 1024 * 1024, `30 分 ${Math.round(s0 / 1024)}KB → ${H} 時間 ${Math.round(s1 / 1024)}KB（バッグと倉庫を除く）、満杯のバッグと倉庫 ${Math.round(full / 1024)}KB、50 時間の見積もり ${Math.round(est50 / 1024)}KB`);
  // 上限のある記録
  ok((st.world.rift.history || []).length <= 30 && (st.meta.prestige.history || []).length <= 50 && (st.meta.ach?.unseen || []).length <= 300);
});

// ======================================================================= 11. 重さ
await t('大勢（敵 80・召喚物 30）でも戦闘の 1 ティックが軽い（×4 速で 1 フレーム 8ms 未満）', () => {
  const g = fresh('necromancer', 61, 80);
  const c = g.combat; const h = c.hero;
  c.H.life *= 1e4;
  quiet(g);
  const p = c.params('n_skeleton');
  for (let i = 0; i < 30; i++) c.spawnMinion('skeleton', p, { x: h.x + (i % 10) * 20 });
  for (let i = 0; i < 80; i++) { const u = c.spawnMonster(['rot_zombie', 'ash_wolf', 'cultist', 'bog_slime'][i % 4], { level: 80, lifeMul: 1e5, x: h.x + 100 + (i % 20) * 30, y: (i % 7) * 10 - 30 }); u.dmg = 0; }
  for (let i = 0; i < 40; i++) { c.tick(0.05); c.fx.length = 0; }
  const N = 300; const t0 = performance.now();
  for (let i = 0; i < N; i++) { c.tick(0.05); c.fx.length = 0; }
  const ms = (performance.now() - t0) / N;
  ok(ms * 4 < 8, `1 ティック ${ms.toFixed(3)}ms（×4 速 ${(ms * 4).toFixed(2)}ms）`);
});

await t('敵の狙い（主人公側の一覧の使い回し）: 出てきた召喚物を狙い、倒れた召喚物は狙わない', () => {
  const g = fresh('necromancer', 62, 30);
  const c = g.combat; const h = c.hero;
  quiet(g);
  const u = c.spawnMonster('rot_zombie', { level: 30, lifeMul: 100, x: h.x + 300 });
  eq(c.targetFor(u), h, 'はじめは主人公');
  const m = c.spawnMinion('skeleton', c.params('n_skeleton'), { x: h.x + 250 });
  eq(c.targetFor(u), m, '近い召喚物');
  m.dead = true;
  eq(c.targetFor(u), h, '倒れた召喚物は狙わない');
  c.tick(0.05); c.tick(0.05);
  eq(c.targetFor(u), h);
});

await t('終盤の裂け目（すべての仕組みを動かす）で 1 ティックの平均が軽い', () => {
  const g = fresh('necromancer', 63, 95);
  const st = g.state;
  st.inv.filter.autoEquip = true;
  for (const id of ['auto_skill', 'auto_boss', 'auto_salvage', 'auto_hatch', 'auto_bounty', 'auto_torment']) st.meta.upgrades[id] = 1;
  g.sys.prestige.applyUnlocks();
  storyClear(g);
  st.world.rift.unlocked = 20; st.world.rift.auto = 'same';
  ok(g.sys.rift.begin(20).ok);
  run(g, 20);
  const N = 20 * (QUICK ? 30 : 90); const t0 = performance.now();
  for (let i = 0; i < N; i++) { g.tick(0.05); g.combat.fx.length = 0; if (g.combat.hero.dead) g.combat.reviveHero(); }
  const ms = (performance.now() - t0) / N;
  ok(ms < 1.5, `平均 ${ms.toFixed(3)}ms`);
});

// ======================================================================= ここまで
console.error = origErr;
console.log(`integrate: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
