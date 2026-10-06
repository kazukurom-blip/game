// v5: ネオン・コア（第2ワールドの強化）のテスト（tests/unit.mjs から register される）
// 費用・能力ポイント・forceMods の表の点・古いセーブ・ドロップ（受注前は 0）・combat の倍率・クエストの通し・追加スキル
import assert from 'node:assert/strict';
import { ITEMS } from '../src/data/items.js';
import { SKILLS, skillsForHero } from '../src/data/skills.js';
import { ENEMIES } from '../src/data/enemies.js';
import { MISSIONS, MISSION_NPCS, turnInNpcOf } from '../src/data/missions.js';
import { MAPS } from '../src/world/maps.js';
import { skillMotionOf } from '../src/data/skillMotions.js';
import { JOB_BRANCHES } from '../src/data/jobs.js';
import { expToNext } from '../src/data/balance.js';
import {
  CORE_COST, CORE_MAX, NEON_STATS, NEON_SKILL_LIST, NEON_REGIONS, BOSS_FRAGMENTS, FRAGMENT_ID, coreFlag, NEON_UNLOCK_FLAG, resetCost, neonSkillCost,
} from '../src/data/neonCore.js';
import { FORCE_REQ } from '../src/data/forceReq.js';
import {
  newNeonCore, ensureNeonCore, neonUnlocked, fragmentsDropping, coreUnlocked, upgradeCore, coreCostTotal, neonPoints, addNeonStat, resetNeonStats,
  neonForceOf, forceMods, forceModsFor, neonFragmentDrops, neonBonusOf, learnNeonSkill, neonSkillInfo, neonSkillsFor, mapForceReq,
} from '../src/systems/neonCore.js';
import { migrateState, computeStats, newState } from '../src/systems/progression.js';
import { addItemToState, countItem } from '../src/systems/inventory.js';
import { playerHitDamage, damagePlayer, damageEnemy, playerAttackArea } from '../src/systems/combat.js';
import { learnSkill, useSkill, resetCooldowns } from '../src/systems/skills.js';
import { Enemy } from '../src/entities/enemy.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
/** Math.random を固定して fn を呼ぶ */
function withRandom(v, fn) { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } }
/** FORCE_REQ を一時的に書き換える（強さ担当の値に依らずに試す） */
function withReq(map, req, fn) {
  const had = Object.prototype.hasOwnProperty.call(FORCE_REQ, map), old = FORCE_REQ[map];
  FORCE_REQ[map] = req;
  try { return fn(); } finally { if (had) FORCE_REQ[map] = old; else delete FORCE_REQ[map]; }
}
function giveFrag(st, n) { addItemToState(st, FRAGMENT_ID, n); }
function unlockAll(st) { st.flags[NEON_UNLOCK_FLAG] = true; for (const r of NEON_REGIONS) st.flags[coreFlag(r)] = true; }

export default function register({ test, makeGame, step }) {
  test('neon core: データ（費用の表・能力の表・アイテム）', () => {
    assert.equal(CORE_COST.length, CORE_MAX);
    for (let i = 1; i < CORE_COST.length; i++) assert.ok(CORE_COST[i] > CORE_COST[i - 1], '費用は Lv が上がるほど増える ' + i);
    assert.equal(CORE_COST[1], 10, '1→2 で 10 個');
    assert.equal(CORE_COST[19], 150, '19→20 で 150 個');
    const total = coreCostTotal();
    assert.ok(total >= 1000 && total <= 1500, '1 地域の合計 ' + total);
    // 能力: 上限まで振ると 攻撃力 +30%・ボスダメージ +40%・防御無視 +20%。上限の合計 > 能力ポイントの合計 80
    const at = (k) => { const s = NEON_STATS.find((x) => x.key === k); return Math.round(s.per * s.max * 100); };
    assert.equal(at('atkPct'), 30); assert.equal(at('bossDmg'), 40); assert.equal(at('ignoreDef'), 20);
    assert.deepEqual(NEON_STATS.map((s) => s.key), ['atkPct', 'maxHpPct', 'defPct', 'critDmg', 'bossDmg', 'ignoreDef', 'expRate', 'dropRate']);
    assert.ok(NEON_STATS.reduce((a, s) => a + s.max, 0) > CORE_MAX * NEON_REGIONS.length, '全部は上げきれない');
    const it = ITEMS[FRAGMENT_ID];
    assert.ok(it && it.type === 'etc' && it.name === 'ネオン・フラグメント' && it.stack > 1 && it.world === 2);
    assert.ok(resetCost(10) > resetCost(0));
    // ボスの数（地域 5〜10・ラスボス 20）
    for (const [id, n] of Object.entries(BOSS_FRAGMENTS)) { assert.ok(ENEMIES[id]?.boss && ENEMIES[id].world === 2, id); assert.ok(id === 'boss_zenith_true' ? n === 20 : n >= 5 && n <= 10, id + ' ' + n); }
  });

  test('neon core: 追加スキル（6 系統 × 2 ＋ 共通 3・種類を混ぜる・モーション・色・SP では上げない）', () => {
    assert.equal(NEON_SKILL_LIST.length, 15);
    assert.equal(NEON_SKILL_LIST.filter((s) => !s.branch).length, 3);
    for (const b of Object.keys(JOB_BRANCHES)) assert.equal(NEON_SKILL_LIST.filter((s) => s.branch === b).length, 2, b);
    const kinds = new Set(NEON_SKILL_LIST.map((s) => s.kind));
    for (const k of ['passive', 'buff']) assert.ok(kinds.has(k), k);
    assert.ok(['melee', 'projectile', 'aoe', 'dash', 'summon'].filter((k) => kinds.has(k)).length >= 3, '攻撃の種類');
    const others = new Set(Object.values(SKILLS).filter((s) => !s.neon).map((s) => String(s.color).toLowerCase()));
    const mine = new Set();
    for (const s of NEON_SKILL_LIST) {
      assert.equal(SKILLS[s.id], s, s.id + ' が SKILLS にある');
      assert.ok(s.neon && s.neonUnlock > 0 && s.maxLevel === 10, s.id);
      assert.ok(!others.has(s.color.toLowerCase()) && !mine.has(s.color.toLowerCase()), s.id + ' の色はほかのスキルと重ならない（演出の逆引き）');
      mine.add(s.color.toLowerCase());
      if (s.kind !== 'passive') for (const h of s.hero === 'both' ? ['luna', 'jin', 'hacker'] : [s.hero]) assert.ok(skillMotionOf(s, h), s.id + ' のモーション ' + h);
    }
    for (const h of ['luna', 'jin', 'hacker']) {
      assert.ok(!skillsForHero(h).some((s) => s.neon), '基本の一覧には出ない');
      assert.ok(skillsForHero(h, null, { neon: 'only', allJobs: true }).every((s) => s.neon));
    }
    // 解放の段（5・15・30・50・70）
    assert.deepEqual([...new Set(NEON_SKILL_LIST.map((s) => s.neonUnlock))].sort((a, b) => a - b), [5, 15, 30, 50, 70]);
    const g = makeGame('luna', 'w2_arkcity');
    g.state.sp = 5; g.state.level = 150;
    assert.equal(learnSkill(g, 'nc_sync'), false, 'SP では上げられない');
  });

  test('neon core: 古いセーブ・壊れた値・newState', () => {
    const s0 = newState('jin');
    assert.deepEqual(s0.neonCore, newNeonCore());
    const old = migrateState({ heroId: 'luna', level: 150, skills: { luna_neon_rush: 3, nc_sync: 5 }, skillBar: ['luna_neon_rush', 'nc_overclock'] });
    assert.deepEqual(old.neonCore, newNeonCore(), '古いセーブは空の値');
    assert.ok(!old.skills.nc_sync, 'neonCore に無い追加スキルは state.skills から消す');
    assert.ok(!old.skillBar.includes('nc_overclock'), '覚えていない追加スキルはバーから外す');
    const bad = migrateState({ heroId: 'luna', level: 150, neonCore: { cores: { arkcity: 99, cyberwild: -3, abyss: 'x' }, stats: { atkPct: 50, bossDmg: 2 }, skills: { nc_sync: 99, nope: 3 } } });
    assert.equal(bad.neonCore.cores.arkcity, CORE_MAX); assert.equal(bad.neonCore.cores.cyberwild, 0); assert.equal(bad.neonCore.cores.abyss, 0); assert.equal(bad.neonCore.cores.zenith, 0);
    assert.equal(bad.neonCore.stats.atkPct, 15, '上限で止める'); assert.equal(bad.neonCore.stats.bossDmg, 2);
    assert.equal(bad.neonCore.skills.nc_sync, 10); assert.ok(!('nope' in bad.neonCore.skills));
    assert.equal(bad.skills.nc_sync, 10, 'state.skills に写す');
    // ポイントより多く振ってある → 全部戻す
    const over = migrateState({ heroId: 'luna', level: 150, neonCore: { cores: { arkcity: 2 }, stats: { atkPct: 5 } } });
    assert.equal(neonPoints(over).used, 0);
    // 2 回読んでも同じ
    const again = migrateState(JSON.parse(JSON.stringify(bad)));
    assert.deepEqual(again.neonCore, bad.neonCore);
  });

  test('neon core: コアの強化・能力ポイント・振り直し・computeStats', () => {
    const st = newState('luna'); st.level = 150; st.money = 1e8;
    assert.equal(neonUnlocked(st), false);
    giveFrag(st, 2000);
    assert.equal(upgradeCore(st, 'arkcity').ok, false, '窓が開く前は上げられない');
    st.flags[NEON_UNLOCK_FLAG] = true;
    assert.equal(upgradeCore(st, 'cyberwild').ok, false, '地域のクエストの前は上げられない');
    st.flags[coreFlag('arkcity')] = true;
    const before = countItem(st, FRAGMENT_ID);
    const r1 = upgradeCore(st, 'arkcity');
    assert.ok(r1.ok && r1.cost === CORE_COST[0]); assert.equal(countItem(st, FRAGMENT_ID), before - CORE_COST[0]);
    assert.equal(st.neonCore.cores.arkcity, 1);
    for (let i = 1; i < CORE_MAX; i++) assert.ok(upgradeCore(st, 'arkcity').ok, 'Lv' + i);
    assert.equal(upgradeCore(st, 'arkcity').ok, false, '最大 Lv');
    assert.equal(countItem(st, FRAGMENT_ID), 2000 - coreCostTotal());
    assert.equal(neonForceOf(st), 200, 'Lv20 × 10');
    assert.deepEqual(neonPoints(st), { total: 20, used: 0, free: 20 });
    // フラグメントが足りない
    st.flags[coreFlag('cyberwild')] = true;
    st.inventory = st.inventory.filter((s) => s.id !== FRAGMENT_ID);
    const nf = upgradeCore(st, 'cyberwild');
    assert.ok(!nf.ok && /足りない/.test(nf.msg));
    // 能力: 攻撃力 % が computeStats に入る
    const a0 = computeStats(st, []);
    for (let i = 0; i < 15; i++) assert.ok(addNeonStat(st, 'atkPct').ok);
    assert.equal(addNeonStat(st, 'atkPct').ok, false, '上限');
    for (let i = 0; i < 5; i++) assert.ok(addNeonStat(st, 'bossDmg').ok);
    assert.equal(addNeonStat(st, 'ignoreDef').ok, false, 'ポイントが無い');
    const a1 = computeStats(st, []);
    assert.ok(a1.atk > a0.atk * 1.2, `攻撃力 ${a0.atk} → ${a1.atk}`);
    assert.ok(near(a1.bossDmg - a0.bossDmg, 0.1, 1e-9));
    assert.ok(near(neonBonusOf(st).atkPct, 0.3));
    // 主のステータス（ルナ = DEX）: コア 20 Lv × 5
    assert.equal(neonBonusOf(st).mainStat, 100);
    // 振り直し
    const m0 = st.money;
    const rs = resetNeonStats(st);
    assert.ok(rs.ok && st.money === m0 - resetCost(20));
    assert.equal(neonPoints(st).used, 0);
    assert.equal(resetNeonStats(st).ok, false, '振っていない');
    // 最大HP・防御・会心・防御無視・経験値・ドロップ
    for (const [k, n] of [['maxHpPct', 5], ['defPct', 5], ['critDmg', 3], ['ignoreDef', 3], ['expRate', 2], ['dropRate', 2]]) for (let i = 0; i < n; i++) assert.ok(addNeonStat(st, k).ok, k);
    const a2 = computeStats(st, []), a3 = computeStats({ ...st, neonCore: newNeonCore() }, []);
    assert.ok(a2.maxHp > a3.maxHp && a2.def > a3.def && a2.critDmg > a3.critDmg);
    assert.ok(near(a2.ignoreDef, 0.06) && near(a2.expRate - a3.expRate, 0.04) && near(a2.dropRate - a3.dropRate, 0.04));
  });

  test('neon core: forceMods の表（点・点の間は直線・R=0）と neonForceOf', () => {
    assert.deepEqual(forceMods(0, 0), { dealt: 1, taken: 1 });
    assert.deepEqual(forceMods(500, 0), { dealt: 1, taken: 1 });
    const pt = (F, R, d, t) => { const m = forceMods(F, R); assert.ok(near(m.dealt, d, 1e-4) && near(m.taken, t, 1e-4), `${F}/${R} → ${JSON.stringify(m)}`); };
    pt(0, 100, 0.1, 3); pt(50, 100, 0.4, 2); pt(100, 100, 1, 1); pt(150, 100, 1.5, 0.7); pt(400, 100, 1.5, 0.7);
    pt(25, 100, 0.25, 2.5); pt(75, 100, 0.7, 1.5); pt(125, 100, 1.25, 0.85); // 点の間
    // 単調
    let prev = forceMods(0, 120);
    for (let F = 5; F <= 200; F += 5) { const m = forceMods(F, 120); assert.ok(m.dealt >= prev.dealt && m.taken <= prev.taken, 'F=' + F); prev = m; }
    const st = newState('hacker');
    assert.equal(neonForceOf(st), 0);
    st.neonCore.cores.arkcity = 3; st.neonCore.cores.abyss = 2;
    assert.equal(neonForceOf(st), 50);
    st.neonCore.skills.nc_sync = 4;
    assert.equal(neonForceOf(st), 58, 'ネオン・シンクロ 1 Lv ごとに +2');
    assert.equal(mapForceReq(MAPS.beach), 0);
    withReq('w2_arkcity_f3', 60, () => { assert.equal(mapForceReq(MAPS.w2_arkcity_f3), 60); assert.equal(mapForceReq('w2_arkcity_f3'), 60); });
  });

  test('neon core: フラグメントのドロップ（受注前は 0・通常 1%・ボス確実・第1ワールドは無し）', () => {
    const st = newState('luna');
    const w2 = ENEMIES.ark_robot_guard, boss = ENEMIES.boss_ark_titan, w1 = ENEMIES.slime_green;
    assert.equal(fragmentsDropping(st), false);
    assert.equal(neonFragmentDrops(st, w2, () => 0), 0, '受注前は落ちない');
    assert.equal(neonFragmentDrops(st, boss, () => 0), 0, '受注前はボスも落とさない');
    st.missions.active.push('nc_01_awaken');
    assert.equal(fragmentsDropping(st), true, '受けたあとから落ちる');
    assert.equal(neonFragmentDrops(st, w2, () => 0.0099), 1);
    assert.equal(neonFragmentDrops(st, w2, () => 0.01), 0);
    assert.equal(neonFragmentDrops(st, boss, () => 0.99), BOSS_FRAGMENTS.boss_ark_titan);
    assert.equal(neonFragmentDrops(st, ENEMIES.boss_zenith_true, () => 0.99), 20);
    assert.equal(neonFragmentDrops(st, w1, () => 0), 0, '第1ワールドの敵は落とさない');
    // 確率（1万回で 1% 前後）
    let n = 0; for (let i = 0; i < 20000; i++) n += neonFragmentDrops(st, w2);
    assert.ok(n > 120 && n < 290, '1% ' + n);
    // 実際に倒した時のドロップ（combat.killEnemy）
    const g = makeGame('luna', 'w2_arkcity_f2');
    g.debug.god = true; g.enemies.length = 0;
    const kill = () => { const e = new Enemy(g, 'boss_ark_titan', 900, g.map.groundY); g.enemies.push(e); g.drops.length = 0; damageEnemy(g, e, e.hp + 10, false, 1); return g.drops.filter((d) => d.id === FRAGMENT_ID).reduce((a, d) => a + d.qty, 0); };
    assert.equal(kill(), 0, '受注前');
    g.state.missions.active.push('nc_01_awaken');
    assert.equal(kill(), BOSS_FRAGMENTS.boss_ark_titan, '受注後');
  });

  test('neon core: combat の倍率（第2ワールドで dealt / taken・防御無視・ボスダメージ）', () => {
    const g = makeGame('jin', 'w2_arkcity_f3');
    g.debug.god = false;
    const st = g.state; st.level = 150;
    const e = new Enemy(g, 'ark_golem_steel', 900, g.map.groundY);
    const dmgOf = () => withRandom(0.5, () => playerHitDamage(g, e, 1000, 1, 0, 1.5).dmg);
    const base = withReq('w2_arkcity_f3', 0, dmgOf);
    const low = withReq('w2_arkcity_f3', 100, dmgOf);
    assert.ok(near(low / base, 0.1, 0.01), `適性 0 / 100 → 0.1 倍（${base} → ${low}）`);
    st.neonCore.cores.arkcity = 15;
    const high = withReq('w2_arkcity_f3', 100, dmgOf);
    assert.ok(near(high / base, 1.5, 0.01), `適性 150 / 100 → 1.5 倍（${high}）`);
    st.neonCore.cores.arkcity = 0;
    assert.equal(withReq('w2_arkcity_f3', 0, () => forceModsFor(g).dealt), 1);
    // 第1ワールドでは FORCE_REQ があっても効かない
    g.changeMap('beach');
    assert.deepEqual(withReq('beach', 100, () => forceModsFor(g)), { dealt: 1, taken: 1, F: 0, R: 0 });
    g.changeMap('w2_arkcity_f3');
    // 受けるダメージ ×3（適性 0 / 100）
    const hit = (req) => withReq('w2_arkcity_f3', req, () => withRandom(0.5, () => { st.hp = 1e7; g.player._invulnUntil = 0; g.player.invulnT = 0; return damagePlayer(g, 500, g.player.x - 10); }));
    const t0 = hit(0), t1 = hit(100);
    assert.ok(near(t1 / t0, 3, 0.02), `被ダメ ${t0} → ${t1}`);
    // 防御無視（防御の高い敵ほど効く）・ボスダメージ
    const stats0 = computeStats(st);
    const ig = withRandom(0.5, () => playerHitDamage(g, { def: { def: 400 } }, 1000, 1, 0, 1.5, { ...stats0, ignoreDef: 0.2 }).dmg);
    const ig0 = withRandom(0.5, () => playerHitDamage(g, { def: { def: 400 } }, 1000, 1, 0, 1.5, { ...stats0, ignoreDef: 0 }).dmg);
    assert.ok(ig > ig0, `防御無視 ${ig0} → ${ig}`);
    const bd = withReq('w2_arkcity_f3', 0, () => withRandom(0.5, () => playerHitDamage(g, { def: { def: 0, boss: true } }, 1000, 1, 0, 1.5, { ...stats0, bossDmg: 0.4 }).dmg));
    assert.equal(bd, 1400);
    // 実際の攻撃（playerAttackArea）にも倍率が入る
    const area = (req) => withReq('w2_arkcity_f3', req, () => withRandom(0.5, () => {
      g.enemies.length = 0;
      const t = new Enemy(g, 'ark_golem_steel', g.player.x + 40, g.map.groundY); t.hp = t.maxHp = 1e9; t.spawnT = 0; g.enemies.push(t);
      const r = { x: g.player.x - 200, y: g.player.y - 300, w: 400, h: 400 };
      playerAttackArea(g, r, 1, { hits: 1 });
      return 1e9 - t.hp;
    }));
    const a0 = area(0), a1 = area(100);
    assert.ok(a0 > 0 && near(a1 / a0, 0.1, 0.02), `playerAttackArea ${a0} → ${a1}`);
    void step;
  });

  test('neon core: 追加スキル（解放・覚える・上げる・使う・パッシブ）', () => {
    const g = makeGame('luna', 'w2_arkcity');
    const st = g.state; st.level = 150; st.mp = 1e6;
    st.job = { id: 'luna_gunner', tier: 1, history: [] };
    const mine = neonSkillsFor(st).map((s) => s.id).sort();
    assert.deepEqual(mine, ['nc_gun_dead_eye', 'nc_gun_photon_rain', 'nc_neon_burst', 'nc_overclock', 'nc_sync']);
    assert.equal(neonSkillInfo(st, 'nc_sync').can, false);
    assert.equal(learnNeonSkill(st, 'nc_sync').ok, false, '窓が開く前');
    unlockAll(st);
    giveFrag(st, 5000);
    assert.ok(/合計 Lv5/.test(neonSkillInfo(st, 'nc_sync').reason));
    st.neonCore.cores.arkcity = 5;
    const f0 = countItem(st, FRAGMENT_ID);
    const r = learnNeonSkill(st, 'nc_sync');
    assert.ok(r.ok && st.neonCore.skills.nc_sync === 1 && st.skills.nc_sync === 1);
    assert.equal(countItem(st, FRAGMENT_ID), f0 - neonSkillCost(0));
    assert.equal(neonForceOf(st), 52);
    const hp0 = computeStats(st, []).maxHp;
    for (let i = 1; i < 10; i++) assert.ok(learnNeonSkill(st, 'nc_sync').ok);
    assert.equal(learnNeonSkill(st, 'nc_sync').ok, false, '最大 Lv');
    assert.ok(computeStats(st, []).maxHp > hp0, 'パッシブが効く');
    assert.equal(learnNeonSkill(st, 'nc_dance_laser_waltz').ok, false, 'ほかの系統は覚えられない');
    assert.equal(learnNeonSkill(st, 'nc_gun_photon_rain').ok, false, '合計 Lv15 まで');
    st.neonCore.cores.cyberwild = 10;
    assert.ok(learnNeonSkill(st, 'nc_gun_photon_rain').ok);
    assert.ok(st.skillBar.includes('nc_gun_photon_rain'), '最初に覚えるとスキルバーへ');
    resetCooldowns();
    g.time += 10;
    assert.ok(useSkill(g, 'nc_gun_photon_rain'), '使える');
    // 共通の攻撃スキル（ジン・ハッカーでも使える）
    for (const hero of ['jin', 'hacker']) {
      const g2 = makeGame(hero, 'w2_arkcity_f1');
      const s2 = g2.state; s2.level = 150; s2.mp = 1e6; unlockAll(s2); giveFrag(s2, 1000);
      s2.neonCore.cores.arkcity = 20; s2.neonCore.cores.cyberwild = 20; s2.neonCore.cores.abyss = 20; s2.neonCore.cores.zenith = 10;
      for (const id of ['nc_overclock', 'nc_neon_burst']) assert.ok(learnNeonSkill(s2, id).ok, hero + ' ' + id);
      resetCooldowns(); g2.time += 10;
      assert.ok(useSkill(g2, 'nc_neon_burst'), hero + ' ネオン・バースト');
      assert.ok(useSkill(g2, 'nc_overclock'), hero + ' オーバークロック');
      for (let i = 0; i < 40; i++) step(g2);
    }
    // セーブ・ロードで残る
    const back = migrateState(JSON.parse(JSON.stringify(st)));
    assert.equal(back.neonCore.skills.nc_sync, 10); assert.equal(back.skills.nc_gun_photon_rain, 1);
  });

  test('neon core: クエストの通し（nc_01 で落ちる → 窓が開く → 地域のコアの解放）', () => {
    const ids = ['nc_01_awaken', 'nc_cyberwild', 'nc_abyss', 'nc_zenith'];
    for (const id of ids) {
      const m = MISSIONS[id];
      assert.ok(m && m.world === 2 && m.questKind === 'neon', id);
      const npcMap = MISSION_NPCS[m.giver].mapId;
      assert.ok(MAPS[npcMap].worldId === 2 && MAPS[npcMap].npcs.some((n) => n.id === m.giver), id + ' の NPC は第2ワールドの町にいる');
      assert.ok(m.dialog.offer.some((l) => /#[dgbr]/.test(l)), id + ' 強調の印');
      const need = expToNext(Math.min(199, m.reqLevel + 2));
      assert.ok(m.reward.exp >= need * 0.2 && m.reward.exp <= need * 0.7 && m.reward.expFixed, id + ' exp');
      for (const o of m.objectives) if (o.type === 'kill') { assert.equal(ENEMIES[o.target].world, 2); assert.ok(ENEMIES[o.target].habitats.includes(o.mapId), id + ' ' + o.target); }
    }
    assert.ok(MISSIONS.nc_01_awaken.prereq.some((p) => p.startsWith('m2_')), 'メインの話の後');
    const g = makeGame('luna', 'w2_arkcity');
    const st = g.state; st.level = 180; st.debug = true;
    const mm = g.missions;
    assert.equal(mm.canAccept('nc_01_awaken'), false, 'メインの話の前は受けられない');
    st.missions.completed.push('m2_09_arrival', 'm2_10_blackout', 'm2_14_wild', 'm2_18_deep', 'm2_22_ascend');
    assert.ok(mm.canAccept('nc_01_awaken'));
    assert.equal(mm.canAccept('nc_cyberwild'), false, 'nc_01 の後');
    const run = (id) => {
      const m = MISSIONS[id];
      g.changeMap(MISSION_NPCS[m.giver].mapId);
      assert.ok(mm.accept(id), 'accept ' + id);
      for (const o of m.objectives) {
        if (o.type === 'kill') for (let i = 0; i < o.count; i++) g.events.emit('enemyKilled', { enemy: { def: ENEMIES[o.target] } });
        if (o.type === 'reach') g.changeMap(o.target);
      }
      mm.update(1 / 60);
      assert.ok(mm.isComplete(id), 'complete ' + id);
      g.changeMap(MISSION_NPCS[turnInNpcOf(m)].mapId);
      assert.ok(mm.turnIn(id), 'turnIn ' + id);
    };
    const accepted = () => { assert.equal(fragmentsDropping(st), true); assert.equal(neonUnlocked(st), false, '受けただけでは窓は開かない'); };
    g.changeMap('w2_arkcity');
    assert.ok(mm.accept('nc_01_awaken')); accepted(); mm.abandon('nc_01_awaken');
    run('nc_01_awaken');
    assert.ok(neonUnlocked(st) && coreUnlocked(st, 'arkcity') && !coreUnlocked(st, 'cyberwild'));
    assert.equal(countItem(st, FRAGMENT_ID), 15, '報酬のフラグメント（コアを Lv2 まで）');
    assert.ok(upgradeCore(st, 'arkcity').ok && upgradeCore(st, 'arkcity').ok, '報酬の分で 2 Lv 上がる');
    for (const [id, rg] of [['nc_cyberwild', 'cyberwild'], ['nc_abyss', 'abyss'], ['nc_zenith', 'zenith']]) {
      run(id);
      assert.ok(coreUnlocked(st, rg), rg + ' のコアが開く');
    }
    assert.ok(countItem(st, FRAGMENT_ID) > 0);
  });

  test('neon core: マップに入ったときの注意（適性が足りない）', async () => {
    const { attachNeonCore } = await import('../src/systems/neonCore.js');
    const g = makeGame('luna', 'w2_arkcity');
    attachNeonCore(g);
    g.notes.length = 0;
    withReq('w2_arkcity_f2', 40, () => g.changeMap('w2_arkcity_f2'));
    assert.ok(g.notes.some((t) => /ネオン適性が足りない/.test(t) && /0 \/ 40/.test(t)), JSON.stringify(g.notes));
    g.notes.length = 0;
    g.state.neonCore.cores.arkcity = 4;
    withReq('w2_arkcity_f2', 40, () => g.changeMap('w2_arkcity_f2'));
    assert.ok(!g.notes.some((t) => /ネオン適性/.test(t)), '足りていれば出ない');
    g._neonUnsub?.();
  });

  // 第1ワールドの強さは変わらない（ネオン・コアが空なら computeStats は v4 と同じ）
  test('neon core: 空のコアは強さを変えない', () => {
    const st = newState('jin'); st.level = 120;
    const a = computeStats(st, []);
    const b = computeStats({ ...st, neonCore: undefined }, []);
    for (const k of ['atk', 'def', 'maxHp', 'crit', 'critDmg', 'bossDmg', 'dropRate', 'expRate']) assert.equal(a[k], b[k], k);
    assert.equal(a.ignoreDef, 0);
    ensureNeonCore(st);
  });
}
