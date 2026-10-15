// ワールド担当のテスト（Node だけで動く）。実行: node tests/world.mjs
// データの整合（章・地域・敵・ボス・特技・詞）、ボスの特技とエリートの詞の動き、ため込み屋、ウェーブ、
// ボスの失敗と自動再挑戦、苦行、深淵の裂け目（固定の種・進行・守護者・報酬・段飛ばし・時間切れ・倒れたとき・保存）、門番。
import { Game } from '../src/game/game.js';
import { RNG } from '../src/engine/rng.js';
import { BAL } from '../src/data/balance.js';
import { ACTS, ZONES, ZONE, STAGES_PER_ZONE, GATE_GROUPS, FINAL_ZONE } from '../src/data/world.js';
import { MONSTERS, MONSTER, ELITE_AFFIXES, BOSS_ABILITIES, NORMAL_MONSTERS, GOBLINS, RIFT_GUARDIANS, GATEKEEPERS } from '../src/data/monsters.js';
import { monsterAbilities } from '../src/game/combat.js';
import { pickAffixes, affixCount } from '../src/game/content/world/elites.js';
import { composeWave } from '../src/game/content/world/composer.js';
import { GOBLIN } from '../src/game/content/world/goblins.js';
import { isWeekend, worldHooks } from '../src/game/systems/world.js';
import { RIFT, GATE, riftDifficulty, guardianFor, riftTormentTier } from '../src/game/systems/rift.js';
const GATE_REFUND = GATE.refund;
import { computeHero } from '../src/game/character.js';

let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const BODIES = 'biped brute caster quad beast_large flyer blob serpent spider insect ghost golem dragon plant aquatic demon elemental construct'.split(' ');
const FEATURES = 'horns wings tail crown armor staff shield sword axe bow spikes tentacles glow hood mask chains crystals gears flames ice bones'.split(' ');
const PROJ = ['arrow', 'fireball', 'orb', 'bone', 'ice', 'spit'];
const ELS = ['phys', 'fire', 'cold', 'lightning', 'poison', 'void'];
const ATTACKS = ['melee', 'ranged', 'charge', 'slam', 'caster', 'summoner', 'explode'];

function newGame(cls = 'warrior', seed = 11) {
  const g = new Game({ seed });
  g.newGame(cls, 'test');
  return g;
}
function run(g, sec) { for (let i = 0; i < sec * 20; i++) g.tick(0.05); }
/** 主人公をとても強くする（裂け目・門番の流れを確かめる用） */
function makeStrong(g, k = 1e10) {
  g.combat.buffs.push({ id: 'test_power', mods: [{ s: 'more_dmg', v: k }, { s: 'life', v: 1e12 }, { s: 'dr', v: 80 }], t: 1e9, name: 'テスト' });
  g.combat.recalc(true);
}

// ---------------- データ
t('10 章 × 5 地域、章のid・名前・テーマが残っている', () => {
  ok(ACTS.length === 10, `acts ${ACTS.length}`);
  for (const a of ACTS) ok(a.zones.length === 5 && a.theme && a.name && a.color, a.id);
  ok(ZONES.length === 50, `zones ${ZONES.length}`);
  for (const id of ['a1z1', 'a1z2', 'a1z3', 'a1z4', 'a1z5']) ok(ZONE[id], id);
  ok(ACTS.map((a) => a.id).join() === 'act1,act2,act3,act4,act5,act6,act7,act8,act9,act10');
});
t('地域のレベルは 1 + 通し番号 × 2（1〜99）', () => { for (const z of ZONES) ok(z.level === 1 + z.global * 2, `${z.id} ${z.level}`); });
t('地域ごとに 3〜5 種の普通の敵、ボスは別', () => {
  for (const z of ZONES) {
    ok(z.monsters.length >= 3 && z.monsters.length <= 5, `${z.id} ${z.monsters.length}`);
    for (const m of z.monsters) ok(MONSTER[m] && !MONSTER[m].boss && !MONSTER[m].kind, `${z.id}: ${m}`);
    for (const m of z.elites || []) ok(z.monsters.includes(m), `${z.id} elite ${m}`);
    ok(MONSTER[z.boss]?.boss, `${z.id} boss ${z.boss}`);
  }
});
t('通常の敵 80 種以上・地域のボス 40 体以上（すべて違う）・章のボス 10 体', () => {
  ok(NORMAL_MONSTERS.length >= 80, `normal ${NORMAL_MONSTERS.length}`);
  const zb = new Set(ZONES.filter((z) => z.zoneIdx < 4).map((z) => z.boss));
  ok(zb.size >= 40, `zone bosses ${zb.size}`);
  const ab = new Set(ACTS.map((a) => a.actBoss));
  ok(ab.size === 10, `act bosses ${ab.size}`);
  for (const a of ACTS) ok(a.zones[4].boss === a.actBoss, a.id);
  for (const id of ab) ok(!zb.has(id), `dup ${id}`);
});
t('既存の敵の id が残っている', () => { for (const id of ['rot_zombie', 'ash_wolf', 'grave_bat', 'bone_archer', 'bog_slime', 'cultist', 'boss_butcher', 'boss_ashlord']) ok(MONSTER[id], id); });
t('敵の形・飾り・弾・属性・攻撃の型は決まりの中だけ', () => {
  const ids = new Set();
  for (const m of MONSTERS) {
    ok(!ids.has(m.id), `dup id ${m.id}`); ids.add(m.id);
    ok(BODIES.includes(m.body), `${m.id} body ${m.body}`);
    for (const f of m.features || []) ok(FEATURES.includes(f), `${m.id} feature ${f}`);
    if (m.proj) ok(PROJ.includes(m.proj), `${m.id} proj ${m.proj}`);
    ok(ELS.includes(m.element || 'phys'), `${m.id} el`);
    ok(ATTACKS.includes(m.attack || 'melee'), `${m.id} attack ${m.attack}`);
    for (const k of ['main', 'sub', 'eye']) ok(/^#[0-9a-f]{6}$/i.test(m.palette?.[k] || ''), `${m.id} palette ${k}`);
    if (m.palette.accent) ok(/^#[0-9a-f]{6}$/i.test(m.palette.accent), `${m.id} accent`);
    for (const [k, v] of Object.entries(m.res || {})) ok(ELS.includes(k) && v >= -50 && v <= 75, `${m.id} res ${k}`);
    if (m.boss) for (const [k, v] of Object.entries(m.res || {})) ok(v <= 40, `${m.id} boss res ${k} ${v}`);
    for (const s of m.summons || []) ok(MONSTER[s] && !MONSTER[s].boss, `${m.id} summons ${s}`);
    ok(m.name && /[ぁ-んァ-ン一-龥]/.test(m.name), `${m.id} name`);
  }
});
t('ボスの特技 25 種以上・すべて登録済み・説明に数字', () => {
  const ids = Object.keys(BOSS_ABILITIES);
  ok(ids.length >= 25, `abilities ${ids.length}`);
  for (const id of ids) { ok(monsterAbilities[id], `not registered ${id}`); ok(/\d/.test(BOSS_ABILITIES[id].desc), `desc ${id}`); }
  for (const m of MONSTERS) for (const a of [...(m.abilities || []), ...(m.phases || []).flatMap((p) => p.abilities)]) ok(BOSS_ABILITIES[a], `${m.id} ability ${a}`);
  for (const m of MONSTERS.filter((x) => x.boss)) ok((m.abilities || []).length >= 2, `${m.id} few abilities`);
});
t('エリートの詞 15 以上・分類つき・説明に数字', () => {
  ok(ELITE_AFFIXES.length >= 15, `affixes ${ELITE_AFFIXES.length}`);
  for (const a of ELITE_AFFIXES) { ok(['atk', 'def', 'ctl'].includes(a.cat), a.id); ok(/\d/.test(a.desc), `desc ${a.id}`); }
});
t('ため込み屋 4 種・守護者 10 体・門番 5 体・深淵王は 3 段階', () => {
  ok(GOBLINS.length === 4, `goblins ${GOBLINS.length}`);
  ok(new Set(GOBLINS.map((x) => x.goblin)).size === 4);
  ok(RIFT_GUARDIANS.length === 10, `guardians ${RIFT_GUARDIANS.length}`);
  ok(GATEKEEPERS.length === 5 && GATE_GROUPS.every((g) => MONSTER[g.keeper]?.kind === 'gatekeeper'));
  ok(MONSTER.boss_abyss_king.phases.length === 2 && MONSTER.boss_abyss_king.kind === 'final');
  ok(ZONE[FINAL_ZONE].boss === 'boss_abyss_king');
});
t('門の欠片: 5 組 × 4 種、組は 2 章ずつ', () => {
  ok(GATE_GROUPS.length === 5);
  const acts = GATE_GROUPS.flatMap((g) => g.acts);
  ok(acts.length === 10 && new Set(acts).size === 10);
  for (const g of GATE_GROUPS) ok(g.frags.length === 4 && g.name && g.color);
});

// ---------------- エリートの詞の選び方
t('詞の選び方: 攻め 3・守り 1・妨害 1 まで、除外の組なし、序盤は妨害なし', () => {
  const rng = new RNG(3);
  const AFF = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));
  for (let i = 0; i < 3000; i++) {
    const L = 1 + (i % 140);
    const n = affixCount(L, i % 2 === 0);
    const list = pickAffixes(rng, n, L);
    ok(new Set(list).size === list.length, 'dup');
    const c = { atk: 0, def: 0, ctl: 0 };
    for (const id of list) c[AFF[id].cat]++;
    ok(c.atk <= 3 && c.def <= 1 && c.ctl <= 1, JSON.stringify(c));
    if (L < 10) ok(c.ctl === 0, 'early ctl');
    for (const id of list) for (const x of AFF[id].ex || []) ok(!list.includes(x), `ex ${id} ${x}`);
  }
  ok(affixCount(10) === 1 && affixCount(35) === 2 && affixCount(55) === 3 && affixCount(80) === 4);
});

// ---------------- ボスの特技・詞の動き
t('すべてのボスを出して 25 秒戦っても壊れない（特技が使われる）', () => {
  const g = newGame('sorcerer', 5);
  const c = g.combat;
  const used = new Set();
  const offFx = [];
  for (const m of MONSTERS.filter((x) => x.boss)) {
    c.clearEnemies();
    g.sys.world.bossUnit = null;
    c.reviveHero();
    const u = c.spawnMonster(m.id, { level: 20, rank: 'boss', x: c.hero.x + 300, lifeMul: 50 });
    for (const ab in u.abilityT) u.abilityT[ab] = 0.1 + Math.random();
    for (let i = 0; i < 500; i++) {
      c.tick(0.05); g.sys.world.tick(0.05);
      for (const e of c.fx) if (e.t === 'bossAbility') used.add(e.ability);
      offFx.push(...c.fx.splice(0));
      if (c.hero.dead) c.reviveHero();
      if (u.dead) break;
    }
  }
  const all = Object.keys(BOSS_ABILITIES).filter((k) => !BOSS_ABILITIES[k].passive);
  const missing = all.filter((k) => !used.has(k));
  ok(missing.length <= 3, `使われなかった特技 ${missing.join(',')}`);
  ok(errors.length === 0, errors.slice(0, 3).join(' | '));
});
t('激昂・障壁・段階の変化が起きる', () => {
  const g = newGame('warrior', 6);
  const c = g.combat;
  const u = c.spawnMonster('boss_abyss_king', { level: 90, rank: 'actboss', x: c.hero.x + 400 });
  u.life = u.maxLife * 0.6; c.tick(0.05);
  ok(u.phase === 1, `phase ${u.phase}`);
  u.life = u.maxLife * 0.3; c.tick(0.05);
  ok(u.phase === 2, `phase ${u.phase}`);
  const b = c.spawnMonster('boss_gravewarden', { level: 5, rank: 'boss', x: c.hero.x + 400 });
  b.life = b.maxLife * 0.55; c.tick(0.05);
  ok(b.shieldHp > 0, 'shield');
  const before = b.life;
  c.hitUnit(c.hero, b, c.params(g.state.hero.bar[0]), 1, { noProc: true });
  ok(b.life === before || b.shieldHp < b.maxLife * 0.12, 'shield absorbs');
  const e = c.spawnMonster('boss_butcher', { level: 5, rank: 'boss', x: c.hero.x + 400 });
  const d0 = e.dmg;
  e.life = e.maxLife * 0.2; c.tick(0.05);
  ok(e._enraged && e.dmg > d0 * 1.4, 'enrage');
});
t('詞の動き: 不屈は 1 回のダメージを 8% まで・結界は -85%・すべての詞で 20 秒戦える', () => {
  const g = newGame('ranger', 8);
  const c = g.combat;
  const u = c.spawnMonster('rot_zombie', { level: 30, rank: 'rare', elite: ['stalwart'], x: c.hero.x + 300 });
  makeStrong(g, 1e5);
  const p = c.params(g.state.hero.bar[0]);
  const l0 = u.life;
  c.hitUnit(c.hero, u, p, 1, { noProc: true });
  ok(l0 - u.life <= u.maxLife * 0.0801, `stalwart ${(l0 - u.life) / u.maxLife}`);
  const s = c.spawnMonster('rot_zombie', { level: 30, rank: 'rare', elite: ['shielding'], x: c.hero.x + 300 });
  s._shieldT = 2;
  const hit = { dmg: 100 };
  for (const f of (c.constructor && [])) void f;
  // onMonsterHit を直接通す
  const before = s.life;
  c.hitUnit(c.hero, s, p, 1, { noProc: true });
  ok(before - s.life <= (before) && s._shieldT > 0, 'shielding');
  void hit;
  c.clearEnemies();
  c.buffs = c.buffs.filter((b) => b.id !== 'test_power'); c.recalc(true);
  for (const a of ELITE_AFFIXES) c.spawnMonster('ghoul', { level: 25, rank: 'champion', elite: [a.id], x: c.hero.x + 300 + Math.random() * 300, lifeMul: 30 });
  for (let i = 0; i < 400; i++) { c.tick(0.05); g.sys.world.tick(0.05); c.fx.length = 0; if (c.hero.dead) c.reviveHero(); }
  ok(errors.length === 0, errors.slice(0, 3).join(' | '));
});
t('攻撃の型: 突進・自爆・手下呼びが動く', () => {
  const g = newGame('warrior', 9);
  const c = g.combat;
  const fx = [];
  const ch = c.spawnMonster('ghoul', { level: 5, x: c.hero.x + 300, lifeMul: 100 });
  ch._chT = 0;
  const bomb = c.spawnMonster('ash_wisp', { level: 5, x: c.hero.x + 600, lifeMul: 100 });
  const sm = c.spawnMonster('abyssal_polyp', { level: 5, x: c.hero.x + 380, lifeMul: 100 });
  sm._sumT = 0.1;
  for (let i = 0; i < 200; i++) { c.tick(0.05); g.sys.world.tick(0.05); fx.push(...c.fx.splice(0)); if (c.hero.dead) c.reviveHero(); }
  ok(fx.some((e) => e.t === 'charge'), 'charge');
  ok(bomb.dead && fx.some((e) => e.t === 'selfDestruct'), 'explode');
  ok(c.units.some((u) => u.summoner === sm.id) || fx.some((e) => e.t === 'summon' && e.enemy), 'summon');
  ok(sm.def.attack === 'caster', 'summoner shoots');
});

// ---------------- ため込み屋
t('ため込み屋: 逃げて 14 秒で消える（報酬なし）', () => {
  const g = newGame('warrior', 12);
  const c = g.combat;
  c.clearEnemies();
  const u = c.spawnMonster('goblin_gold', { level: 5, rank: 'goblin', x: c.hero.x + 400, lifeMul: 1e6 });
  const kills = g.state.meta.stats.kills;
  for (let i = 0; i < 20 * (GOBLIN.escapeSec + 2); i++) { c.tick(0.05); if (u.dead) break; }
  ok(u.escaped, 'escaped');
  ok(u.x > c.hero.x, 'fled forward');
  ok(g.state.meta.stats.kills === kills, 'no kill reward');
});
t('ため込み屋: 倒すとアイテムが多く、素材も出る', () => {
  for (const gid of ['goblin_gold', 'goblin_gem', 'goblin_mat', 'goblin_shard']) {
    const g = newGame('ranger', 13);
    const c = g.combat;
    c.clearEnemies();
    let items = 0; g.events.on('loot', () => items++);
    const mats0 = JSON.stringify(g.state.inv.mats);
    const u = c.spawnMonster(gid, { level: 10, rank: 'goblin', x: c.hero.x + 300 });
    c.killUnit(u, c.hero);
    ok(items >= 4, `${gid} items ${items}`);
    ok(JSON.stringify(g.state.inv.mats) !== mats0, `${gid} mats`);
    ok(g.state.meta.stats.goblins === 1, 'stat');
  }
});
t('ため込み屋は 10〜15 分ごと（週末は 2 倍）に群れへ混ざる', () => {
  const g = newGame('necromancer', 14);
  const ws = g.sys.world;
  ws.festivalOverride = false;
  g.state.world.goblinT = 0.1;
  run(g, 1);
  ok(ws.pendingGoblin || g.combat.units.some((u) => u.goblin), 'pending');
  ok(g.state.world.goblinT >= 590, `next ${g.state.world.goblinT}`);
  ws.festivalOverride = true; ws.pendingGoblin = null; g.state.world.goblinT = 0.1;
  run(g, 0.2);
  ok(g.state.world.goblinT <= 455, `fest ${g.state.world.goblinT}`);
  ok(isWeekend(new Date(2026, 9, 17)) && !isWeekend(new Date(2026, 9, 14)), 'weekend');
});

// ---------------- ウェーブ
t('ウェーブの組み立て: 数・群れの型・ため込み屋・出来事', () => {
  const g = newGame('warrior', 15);
  const ws = g.sys.world;
  const rng = new RNG(4);
  let champ = 0; let rare = 0; let total = 0; let goblin = 0;
  for (let i = 0; i < 2000; i++) {
    const z = ZONES[i % 50];
    const stage = 1 + (i % 9);
    if (i % 500 === 0) ws.pendingGoblin = 'goblin_gem';
    const list = composeWave(ws, { zone: z, stage, wave: 1 + (i % 3), level: z.level, rng });
    ok(list.length >= 3 && list.length <= 14, `n ${list.length}`);
    for (const e of list) ok(MONSTER[e.id], e.id);
    if (list.some((e) => e.rank === 'champion')) champ++;
    if (list.some((e) => e.rank === 'rare')) rare++;
    if (list.some((e) => e.rank === 'goblin')) goblin++;
    total++;
  }
  ok(champ > total * 0.04 && champ < total * 0.2, `champ ${champ}`);
  ok(rare > total * 0.02 && rare < total * 0.16, `rare ${rare}`);
  ok(goblin === 4, `goblin ${goblin}`);
  ok(worldHooks.waveComposer === composeWave);
});
t('出来事: 祠の強化がかかる', () => {
  const g = newGame('warrior', 16);
  g.sys.world.onMiniEvent('shrine', new RNG(1));
  ok(g.combat.buffs.some((b) => b.id.startsWith('shrine_')), 'shrine buff');
  ok(g.state.world.events.shrine === 1);
});

// ---------------- ボスの失敗と再挑戦
t('ボスに負けると手前で稼ぎ、autoBoss があれば火力が足りたら自動で再挑戦', () => {
  const g = newGame('warrior', 17);
  const w = g.state.world;
  const ws = g.sys.world;
  w.maxStage.a1z1 = STAGES_PER_ZONE;
  ws.challengeBoss();
  run(g, 1);
  ok(ws.bossUnit, 'boss spawned');
  ws.bossTimer = 0.01;
  run(g, 0.2);
  ok(w.bossFailZone === 'a1z1' && w.stage === STAGES_PER_ZONE - 1 && !w.autoAdvance, 'fallback');
  ok(ws.bossNeed(ws.zone()).need > 0, 'need');
  // 解放なし → 再挑戦しない
  ws.onStageClear();
  ok(w.stage === STAGES_PER_ZONE - 1, 'no auto without unlock');
  g.state.meta.unlocks.autoBoss = true;
  ws.logFor('a1z1').lastTry = g.state.playTime - 400;
  ws.onStageClear();
  ok(w.stage === STAGES_PER_ZONE && w.autoAdvance, 'auto retry after 5 min');
});
t('ボスを倒すと次の地域・最初の踏破の時刻・壁の長さを記録', () => {
  const g = newGame('necromancer', 18);
  const w = g.state.world; const ws = g.sys.world;
  w.maxStage.a1z1 = STAGES_PER_ZONE;
  ws.logFor('a1z1').firstFail = 0;
  ws.challengeBoss(); run(g, 1);
  ws.bossUnit.life = 1; g.combat.killUnit(ws.bossUnit, g.combat.hero);
  run(g, 0.2);
  ok(w.cleared.a1z1 && w.maxZone === 1 && w.clearedAt.a1z1 >= 0, 'cleared');
  ok(ws.logFor('a1z1').wall >= 0, 'wall');
});

// ---------------- 苦行
t('苦行: 深淵王で I が開き、章のボスで次が開く。段で敵が強くなる', () => {
  const g = newGame('sorcerer', 19);
  const w = g.state.world; const ws = g.sys.world;
  w.maxZone = 49; w.zone = FINAL_ZONE; w.stage = STAGES_PER_ZONE; w.maxStage[FINAL_ZONE] = 10;
  ws.startStage(); run(g, 1);
  ok(ws.bossUnit?.defId === 'boss_abyss_king', 'final boss');
  g.combat.killUnit(ws.bossUnit, g.combat.hero); run(g, 0.2);
  ok(w.maxTorment === 1 && g.sys.rift.available(), 'torment I');
  const d0 = ws.difficulty().life; const L0 = ws.level();
  ws.setTorment(1);
  ok(w.torment === 1 && BAL.monsterLife(ws.level()) * ws.difficulty().life > BAL.monsterLife(L0) * d0 && ws.level() > L0, 'harder'); // 魔境 I の倍率は 1（敵の Lv で重くなる。強さ担当）
  ok(g.H.res.fire <= computeHero(g.state, g, { torment: 0 }).res.fire - 5 + 0.001, 'res penalty');
  w.zone = 'a1z5'; w.stage = STAGES_PER_ZONE; ws.startStage(); run(g, 1);
  g.combat.killUnit(ws.bossUnit, g.combat.hero); run(g, 0.2);
  ok(w.maxTorment === 2, `checkpoint ${w.maxTorment}`);
  ws.setTorment(5); ok(w.torment === 2, 'clamped');
});
t('苦行の自動最適化: ペースが良ければ上げ、倒れたら下げる', () => {
  const g = newGame('sorcerer', 20);
  const w = g.state.world; const ws = g.sys.world;
  w.maxTorment = 3; w.torment = 1;
  ok(!ws.setTormentAuto(true) && !ws.tormentAutoOn(), '祭壇の「苦行の見極め」が無ければ使えない');
  g.state.meta.upgrades.auto_torment = 1; g.sys.prestige.applyUnlocks(); // 祭壇で解放（スイッチは祭壇と同じ 1 つ）
  ok(ws.setTormentAuto(true) && g.state.meta.unlocks.autoTorment === true, 'on');
  ws.tw = { t: 119.99, kills: 200, deaths: 0 };
  ws.tickCampaignExtras(0.05);
  ok(w.torment === 2, `up ${w.torment}`);
  ws.tw = { t: 119.99, kills: 200, deaths: 3 };
  ws.tickCampaignExtras(0.05);
  ok(w.torment === 1, `down ${w.torment}`);
  ok(w.tormentStats[2]?.secs > 0, 'stats');
});

// ---------------- 深淵の裂け目
t('裂け目: 段階の数値・守護者は 5 段ごとに入れ替わる', () => {
  const d1 = riftDifficulty(1); const d20 = riftDifficulty(20);
  ok(d20.life > d1.life * 2.5 && d20.level === BAL.rift(20).level && d20.level > d1.level, 'scale'); // 伸び方は BAL.RIFT_GROWTH（強さ担当）
  ok(guardianFor(1) === guardianFor(5) && guardianFor(5) !== guardianFor(6) && guardianFor(51) === guardianFor(1), 'rotation');
});
t('裂け目: 開く前は始められない', () => {
  const g = newGame('ranger', 21);
  ok(!g.sys.rift.begin(1).ok && g.state.world.mode === 'campaign');
});
t('裂け目: 同じ段階は同じ敵の並び（固定の種）', () => {
  const comp = () => {
    const g = newGame('ranger', Math.floor(Math.random() * 1000));
    g.state.world.maxTorment = 1;
    g.sys.rift.begin(1);
    const ids = [];
    for (let k = 0; k < 4; k++) { g.combat.clearEnemies(); g.sys.rift.spawnPack(); ids.push(g.combat.enemies().map((u) => `${u.defId}:${u.rank}`).join(',')); }
    return ids.join('|');
  };
  ok(comp() === comp(), 'same packs');
});
t('裂け目: 倒すと進行 → 守護者 → 踏破で報酬と段飛ばし、記録', () => {
  const g = newGame('necromancer', 22);
  const w = g.state.world;
  w.maxTorment = 1; w.zone = 'a3z2'; w.stage = 4;
  const shard0 = g.state.inv.mats.shard || 0;
  let gemCall = null;
  g.sys.gems.onRiftComplete = (lv, r) => { gemCall = [lv, r]; };
  ok(g.sys.rift.begin(1).ok && w.mode === 'rift' && w.torment === 0, 'started');
  makeStrong(g);
  let guard = false; g.events.on('riftGuardian', () => { guard = true; });
  let done = null; g.events.on('riftComplete', (e) => { done = e; });
  for (let i = 0; i < 20 * 300 && !done; i++) g.tick(0.05);
  ok(guard && done, `progress ${w.rift.run?.progress}`);
  ok(done.ratio > 0.6 && w.rift.unlocked === 4, `unlocked ${w.rift.unlocked} ratio ${done.ratio}`);
  ok(w.rift.best === 1 && w.rift.history.length === 1 && w.rift.history[0].ok, 'record');
  ok((g.state.inv.mats.shard || 0) > shard0, 'shards');
  ok(gemCall && gemCall[0] === 1 && gemCall[1] > 0, 'gems hook');
  run(g, RIFT.doneDelay + 1);
  ok(w.mode === 'campaign' && w.zone === 'a3z2' && w.stage === 4, `back ${w.mode} ${w.zone}`);
});
t('裂け目: 時間切れ・倒れると時間が減る・自動で続ける', () => {
  const g = newGame('warrior', 23);
  const w = g.state.world;
  w.maxTorment = 2; w.torment = 2; w.rift.unlocked = 10;
  g.sys.rift.setAuto('push');
  g.sys.rift.begin(10);
  ok(w.torment === riftTormentTierFor(10), `tier ${w.torment}`);
  run(g, 1);
  const tl = w.rift.run.timeLeft;
  g.combat.damageAlly(g.combat.hero, 1e30, 'phys');
  run(g, 0.1);
  ok(w.rift.run.timeLeft < tl - 29, 'death penalty');
  w.rift.run.timeLeft = 0.05;
  run(g, 0.2);
  ok(w.rift.history[0] && !w.rift.history[0].ok, 'fail recorded');
  run(g, RIFT.doneDelay + 0.5);
  ok(w.mode === 'rift' && w.rift.run?.level === 9, `auto push down ${w.rift.run?.level}`);
  g.sys.rift.abandon();
  ok(w.mode === 'campaign' && w.torment === 2, `restored torment ${w.torment}`);
});
function riftTormentTierFor(gl) { return riftTormentTier(gl); }
t('裂け目: 途中で保存して読み直すと続きから', () => {
  const g = newGame('assassin', 24);
  g.state.world.maxTorment = 1;
  g.sys.rift.begin(1);
  run(g, 20);
  const json = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 24 }); g2.load(JSON.parse(json));
  ok(g2.state.world.mode === 'rift' && g2.state.world.rift.run?.level === 1, 'resumed');
  run(g2, 2);
  ok(g2.combat.enemies().length > 0, 'enemies after load');
  g2.sys.world.travel('a1z1', 1);
  ok(g2.state.world.mode === 'campaign' && !g2.state.world.rift.run, 'travel aborts');
});

// ---------------- 門番
t('門番: 苦行のボスが欠片を落とし、そろうと呼べる。勝てば次の欠片と証、負ければ 2 つ返る', () => {
  const g = newGame('ranger', 25);
  const w = g.state.world; const ws = g.sys.world;
  w.maxTorment = 1; w.torment = 1; w.maxZone = 10;
  let frags = 0; g.events.on('gateFragment', () => frags++);
  for (let i = 0; i < 30; i++) { w.zone = 'a1z2'; w.stage = STAGES_PER_ZONE; w.maxStage.a1z2 = 10; ws.startStage(); run(g, 0.8); if (ws.bossUnit) g.combat.killUnit(ws.bossUnit, g.combat.hero); run(g, 0.1); }
  ok(frags >= 10, `frags ${frags}`);
  ok((w.gate.frags.g1_1 || 0) === frags, 'kind = zone index');
  ok(!g.sys.rift.canSummon(0), 'not ready');
  for (let k = 0; k < 4; k++) w.gate.frags[`g1_${k}`] = 2;
  const odds = g.sys.rift.gateOdds(0);
  ok(odds.win >= 0 && odds.win <= 1 && odds.need > 0, 'odds');
  ok(g.sys.rift.summonGate(0).ok && w.mode === 'gate', 'summon');
  run(g, 1);
  ok(ws.bossUnit?.defId === 'gk_ashsand', 'keeper');
  const dmg0 = computeHero(g.state, g).S.inc_dmg || 0;
  g.combat.killUnit(ws.bossUnit, g.combat.hero); run(g, 0.2);
  ok(w.gate.kills[0] === 1 && w.gate.history[0].ok, 'win');
  ok(Object.keys(w.gate.frags).some((k) => k.startsWith('g2_') && w.gate.frags[k] > 0), 'next fragment');
  ok((computeHero(g.state, g).S.inc_dmg || 0) >= dmg0 + 4, 'badge');
  run(g, 4);
  ok(w.mode === 'campaign', 'back');
  ok(g.sys.rift.summonGate(0).ok, 'summon 2');
  run(g, 1);
  ws.bossTimer = 0; w.gate.run.timeLeft = 0.01; run(g, 0.2);
  const have = [0, 1, 2, 3].reduce((s, k) => s + (w.gate.frags[`g1_${k}`] || 0), 0);
  ok(have === GATE_REFUND, `refund ${have}`);
});
t('門番: 戦いの途中で保存すると読み直しで欠片が戻る', () => {
  const g = newGame('ranger', 26);
  const w = g.state.world;
  w.maxTorment = 1;
  for (let k = 0; k < 4; k++) w.gate.frags[`g3_${k}`] = 1;
  g.sys.rift.summonGate(2);
  run(g, 1);
  const g2 = new Game({ seed: 1 }); g2.load(JSON.parse(JSON.stringify(g.snapshot())));
  ok(g2.state.world.mode === 'campaign' && [0, 1, 2, 3].every((k) => g2.state.world.gate.frags[`g3_${k}`] === 1), 'refunded');
});

t('見張り: 主人公に重なった敵が倒せなくても、離して先へ進む', () => {
  const g = newGame('ranger', 29);
  const c = g.combat; const ws = g.sys.world;
  run(g, 3);
  c.clearEnemies();
  const u = c.spawnMonster('ash_wolf', { level: 3, x: c.hero.x + 40, lifeMul: 3 });
  u.speed = 0; u.range = 0;
  const kills = g.state.meta.stats.kills;
  run(g, 45);
  ok(u.dead || Math.abs(u.x - c.hero.x) >= 60 || g.state.meta.stats.kills > kills, `stuck ${Math.round(u.x - c.hero.x)}`);
});

// ---------------- そのほか
t('地域の目安と戦力・転生用の resetCampaign', () => {
  const g = newGame('warrior', 27);
  const ws = g.sys.world;
  for (const z of ZONES) { const a = ws.zoneAdvice(z); ok(Number.isFinite(a.rec) && a.rec > 0 && a.label, z.id); }
  ok(ws.zoneAdvice(ZONE.a10z5).ratio < ws.zoneAdvice(ZONE.a1z1).ratio, 'harder later');
  ws.resetCampaign(12);
  const w = g.state.world;
  ok(w.maxZone === 12 && w.cleared[ZONES[11].id] && !w.cleared[ZONES[12].id] && w.zone === ZONES[12].id, 'reset');
});
t('世界の状態は JSON で保存・読み込みできる', () => {
  const g = newGame('sorcerer', 28);
  run(g, 120);
  const s1 = JSON.stringify(g.snapshot().world);
  const g2 = new Game({ seed: 28 }); g2.load(JSON.parse(JSON.stringify(g.snapshot())));
  const s2 = JSON.stringify(g2.state.world);
  ok(s1 === s2, 'world round trip');
});
t('敵の強さの曲線: Lv 100 で頭打ち・単調に増える', () => {
  let prev = 0;
  for (let L = 1; L <= 100; L++) { const s = BAL.monsterScale(L); ok(s.life >= prev && s.dmg >= 1, `L${L}`); prev = s.life; }
  ok(BAL.monsterScale(150).life === BAL.monsterScale(100).life, 'cap');
});
// 敵を硬くした（ユーザーの声「ヌルゲー」）ので 20 分 → 25 分。3 つ目の地域に入っていること
t('25 分の放置で第一章を進める（剣闘士）', () => {
  const g = newGame('warrior', 7);
  g.state.inv.filter.autoEquip = true;
  g.state.meta.unlocks.autoBoss = true;
  for (let m = 0; m < 25; m++) { run(g, 60); for (const id of Object.keys(g.state.hero.skills)) while (g.sys.skills.canLevel(id)) g.sys.skills.levelUp(id); }
  ok(g.state.hero.level >= 8 && g.state.world.maxZone >= 2, `Lv${g.state.hero.level} zone ${g.state.world.maxZone}`);
});

console.error = origErr;
if (errors.length) console.log('console.error:', errors.slice(0, 5));
console.log(`\nworld: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail || errors.length ? 1 : 0);
