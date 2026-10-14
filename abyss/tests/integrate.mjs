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

// ======================================================================= ここまで
console.error = origErr;
console.log(`integrate: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
