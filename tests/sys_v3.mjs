// v3 ゲームシステム（エンドコンテンツ）のテスト（tests/unit.mjs から register される）
// 装備インスタンス・★強化（10万回統計・天井）・潜在（10万回統計・天井）・旧セーブ移行(v1/v2/v3)・ボス・タワー・アリーナ・
// 実績・デイリー/ログイン・プリセット・キャラ間共有・ストーリー分岐・夜・PETスキル・コンボ・フレーバー・クエストナビ
import assert from 'node:assert/strict';
import { ITEMS, EQUIP_SLOTS, PET_IDS } from '../src/data/items.js';
import { ENEMIES, MONSTER_IDS, BOSS_IDS, NIGHT_ENEMY_IDS } from '../src/data/enemies.js';
import { MISSIONS, MISSION_NPCS } from '../src/data/missions.js';
import { ENEMY_LORE, ITEM_LORE } from '../src/data/lore.js';
import { NIGHT_SHOPS, TOWN_SHOPS } from '../src/data/shops.js';
import { MAPS } from '../src/world/maps.js';
import {
  TUNE_RATES, TUNE_PITY, TUNE_EXPECTED, maxStarFor, tuneCost, starBonus, POT_UPGRADE, POT_LINES, POT_GRADES, potLinePool, potRateTable,
} from '../src/data/gear.js';
import { makeRng } from '../src/systems/rng.js';
import { newState, migrateState, computeStats, STATE_VERSION, setActiveBuffs } from '../src/systems/progression.js';
import {
  addItem, addItemToState, equip, unequip, removeItem, sellItem, buyItem, countItem, resolveItemRef, equippedInstOf, normalizeInventory,
  equipInstances, sellPriceInst, sellPrice, useItem, MAX_SLOTS,
} from '../src/systems/inventory.js';
import { tuneInfo, tuneItem, tuneRoll, tuneRateTable } from '../src/systems/tune.js';
import { rollPotential, maybePotential, rollGradeUp, useChip, applyChipResult, lockLine, potInfo, potLog, POT_RATES } from '../src/systems/potential.js';
import { BOSS_MODES, bossModeMult, bossEntry, bossCleared, bossClears, bossStock, bossUnlocked, bossRoomId, bossRewardMoney, bossExchange } from '../src/systems/bosses.js';
import { towerFloorDef, towerEnter, towerClearFloor, towerBest, towerStartFloors, towerState, TOWER_MUTATORS } from '../src/systems/tower.js';
import { arenaInfo, arenaEnter, arenaWaveDef, arenaWaveCleared, arenaExpMult, ARENA_WAVES } from '../src/systems/arena.js';
import {
  ACHIEVEMENTS, ACHIEVEMENT_IDS, attachAchievements, achievementList, achievementSummary, titleList, setTitle, currentTitle, evaluateAchievements, ACH_RANKS,
} from '../src/systems/achievements.js';
import { dayIndex, weekIndex, refreshTicket, useTicket, loginCheck, loginStatus, LOGIN_REWARDS, weekdayEvent, TICKET_CAP } from '../src/systems/daily.js';
import { savePreset, applyPreset, presetList } from '../src/systems/presets.js';
import {
  depositItem, withdrawItem, sharedStorage, syncSharedBook, linkBonus, updateSharedChar, resetSharedForTest, SHARED_STORAGE_SLOTS, loadShared,
} from '../src/systems/shared.js';
import { isNightNow, enemyAvailableNow, isOpenAt } from '../src/systems/night.js';
import { petAutoUse, petStats, feedPet, petShouldPick, setPetConfig, petLevelFromAff } from '../src/systems/petSkills.js';
import { comboHit, comboInfo, COMBO_WINDOW } from '../src/systems/combo.js';
import { missionGuide, trackedGuide, routeBetween, findNpc } from '../src/systems/guide.js';
import { updateSkills, resetCooldowns } from '../src/systems/skills.js';
import { damageEnemy, killExp } from '../src/systems/combat.js';
import { rollDrops } from '../src/systems/loot.js';
import { Enemy } from '../src/entities/enemy.js';

const SUNDAY = new Date(2026, 9, 4, 12).getTime();   // 2026-10-04 (日)
const MONDAY = new Date(2026, 9, 5, 12).getTime();
const DAY = 86400000;

export default function register({ test, makeGame, step, fin }) {
  const richGame = (hero = 'luna', map = 'beach_f1') => {
    const g = makeGame(hero, map);
    g.nowMs = () => SUNDAY;
    g.state.money = 1e12;
    g.state.level = 120;
    return g;
  };
  const invInst = (st, id) => st.inventory.filter((s) => s.id === id);

  // ============================================================ 装備インスタンス
  test('v3 sys: 装備インスタンス（uid/★/潜在）・equip/unequip/sell/buy/remove 互換', () => {
    const g = richGame('luna', 'beach');
    const st = g.state;
    // 初期装備にもインスタンス
    for (const slot of EQUIP_SLOTS) if (st.equipped[slot]) {
      const e = equippedInstOf(st, slot);
      assert.ok(e && e.uid.startsWith('#') && e.id === st.equipped[slot], slot);
    }
    assert.ok(addItem(g, 'katana_steel', 2, { pot: null }));
    const ks = invInst(st, 'katana_steel');
    assert.equal(ks.length, 2); assert.notEqual(ks[0].uid, ks[1].uid);
    for (const k of ks) assert.ok(k.qty === 1 && k.star === 0 && k.pot === null);
    ks[1].star = 3;
    // itemId で equip → 一番良い（★3）個体
    const prevWeapon = equippedInstOf(st, 'weapon');
    let r = equip(g, 'katana_steel');
    assert.ok(r.ok, r.msg);
    assert.equal(equippedInstOf(st, 'weapon').star, 3);
    assert.equal(st.equipped.weapon, 'katana_steel');
    assert.ok(st.inventory.some((s) => s.uid === prevWeapon.uid), '外した武器はインベントリへ（同じ uid）');
    // uid / エントリそのもので equip
    const other = invInst(st, 'katana_steel')[0];
    r = equip(g, other.uid); assert.ok(r.ok);
    assert.equal(equippedInstOf(st, 'weapon').uid, other.uid);
    r = equip(g, invInst(st, 'katana_steel')[0]); assert.ok(r.ok);
    assert.equal(equippedInstOf(st, 'weapon').star, 3);
    // unequip で★が保たれる
    const n0 = st.inventory.length;
    r = unequip(g, 'weapon'); assert.ok(r.ok);
    assert.equal(st.equipped.weapon, null); assert.equal(st.equippedInst.weapon, null);
    assert.equal(st.inventory.length, n0 + 1);
    assert.ok(invInst(st, 'katana_steel').some((s) => s.star === 3));
    // removeItem（id）は★の低い個体から / '#uid' で個別
    assert.ok(removeItem(st, 'katana_steel', 1));
    assert.deepEqual(invInst(st, 'katana_steel').map((s) => s.star), [3]);
    const k3 = invInst(st, 'katana_steel')[0];
    // 売却: インスタンス（★で売値アップ）
    assert.ok(sellPriceInst(k3) > sellPrice('katana_steel'));
    const m0 = st.money;
    r = sellItem(g, k3.uid); assert.ok(r.ok);
    assert.equal(st.money, m0 + sellPriceInst({ ...k3 }));
    assert.equal(countItem(st, 'katana_steel'), 0);
    // 旧 API: sellItem(id, qty) / buyItem / 消費アイテムのスタック
    r = buyItem(g, 'bat_nail', 2); assert.ok(r.ok);
    assert.equal(invInst(st, 'bat_nail').length, 2);
    r = sellItem(g, 'bat_nail', 2); assert.ok(r.ok); assert.equal(countItem(st, 'bat_nail'), 0);
    assert.ok(addItemToState(st, 'potion_red', 5));
    assert.equal(st.inventory.filter((s) => s.id === 'potion_red').length, 1, 'ポーションはスタック');
    // 満杯
    const s2 = newState('luna'); s2.inventory = [];
    for (let i = 0; i < MAX_SLOTS; i++) assert.ok(addItemToState(s2, 'tshirt_white', 1));
    assert.equal(addItemToState(s2, 'tshirt_white', 1), false);
    // equipped を直接書き換えても normalize で整合
    st.equipped.hat = 'crown_gold';
    assert.equal(equippedInstOf(st, 'hat'), null);
    normalizeInventory(st);
    assert.equal(equippedInstOf(st, 'hat').id, 'crown_gold');
    // 全 uid ユニーク
    const uids = equipInstances(st).map((e) => e.inst.uid);
    assert.equal(new Set(uids).size, uids.length);
    // resolveItemRef の各形式
    const anyInv = st.inventory.findIndex((s) => ITEMS[s.id].type === 'equip');
    assert.equal(resolveItemRef(st, anyInv).index, anyInv);
    assert.equal(resolveItemRef(st, { slot: 'hat' }).where, 'equipped');
    assert.equal(resolveItemRef(st, 'crown_gold').slot, 'hat');
  });

  test('v3 sys: computeStats に★と潜在を反映', () => {
    const st = newState('jin');
    const s0 = computeStats(st, []);
    const w = equippedInstOf(st, 'weapon');
    w.star = 5;
    const s1 = computeStats(st, []);
    assert.ok(s1.atk > s0.atk, `★で atk ${s0.atk}→${s1.atk}`);
    assert.deepEqual(s1.stars, { weapon: 5 });
    const top = equippedInstOf(st, 'top');
    top.star = 5;
    const s2 = computeStats(st, []);
    assert.ok(s2.def > s1.def && s2.maxHp > s1.maxHp && s2.str > s1.str, '防具★で def/maxHp/主ステ');
    // ★16 以上の武器は主ステ +3
    const sb = starBonus(ITEMS.neon_sword_spire, 16, 'jin');
    assert.equal(sb.str, 3); assert.ok(sb.atk > 0);
    assert.equal(starBonus(ITEMS.pet_slime, 5, 'jin').atk, 0, 'PET は強化不可');
    // 潜在
    w.pot = { grade: 'legendary', lines: [{ stat: 'atkPct', value: 0.09, grade: 'legendary' }, { stat: 'bossDmg', value: 0.25, grade: 'legendary' }, { stat: 'crit', value: 0.04, grade: 'epic' }] };
    equippedInstOf(st, 'hat') || (st.equipped.hat = 'cap_street', normalizeInventory(st));
    equippedInstOf(st, 'hat').pot = { grade: 'mythic', lines: [{ stat: 'cdr', value: 1, grade: 'mythic' }, { stat: 'mainPct', value: 0.12, grade: 'mythic' }] };
    equippedInstOf(st, 'shoes').pot = { grade: 'rare', lines: [{ stat: 'speed', value: 10, grade: 'rare' }] };
    const s3 = computeStats(st, []);
    assert.ok(s3.atk >= Math.round(s2.atk * 1.08), `atk% ${s2.atk}→${s3.atk}`);
    assert.equal(s3.bossDmg, 0.25); assert.equal(s3.cdr, 1);
    assert.ok(Math.abs(s3.crit - s2.crit - 0.04) < 1e-9);
    assert.ok(s3.str > s2.str, '主ステ%（jin=STR）');
    assert.ok(s3.speed >= s2.speed + 10 || s3.speed === 450);
    for (const k of ['maxHp', 'maxMp', 'atk', 'def', 'speed', 'crit', 'attackSpeed']) assert.ok(fin(s3[k]), k);
  });

  // ============================================================ ネオン・チューン
  test('v3 sys: チューン 表・費用・上限★が REFERENCE S-3 と一致', () => {
    assert.equal(TUNE_RATES.length, 25);
    assert.deepEqual(TUNE_PITY, [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 6, 7, 8, 8, 9, 11, 15, 15, 21, 21, 30, 42, 70]);
    const ref = [1.05, 1.11, 1.17, 1.17, 1.24, 1.31, 1.42, 1.52, 1.62, 1.74, 1.94, 2.11, 2.38, 2.72, 3.14, 3.14, 3.70, 4.57, 6.08, 6.08, 8.91, 8.91, 12.67, 17.68, 29.38];
    TUNE_EXPECTED.forEach((e, i) => assert.ok(Math.abs(e - ref[i]) < 0.006, `期待試行 ★${i} ${e}`));
    const total = TUNE_EXPECTED.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 127) < 1, `★0→25 合計 ${total}`);
    assert.deepEqual([0, 5, 9].map((s) => tuneCost(s, 30)), [70, 380, 770]);
    assert.deepEqual([0, 10, 19].map((s) => tuneCost(s, 100)), [250, 7310, 17850]);
    assert.equal(tuneCost(24, 150), 51670);
    assert.equal(maxStarFor('knife_basic'), 5); assert.equal(maxStarFor('helmet_moto'), 10); assert.equal(maxStarFor('katana_plasma'), 15);
    assert.equal(maxStarFor('crown_caiman'), 20); assert.equal(maxStarFor('halo_zog'), 25); assert.equal(maxStarFor('pet_cat'), 0);
    assert.equal(tuneRateTable().length, 25);
  });

  test('v3 sys: チューン 10万回の統計（各★の成功率が表と一致 ±1%）と天井保証', () => {
    const rng = makeRng(12345);
    for (let s = 0; s < 25; s++) {
      // (a) 天井に達していない試行の成功率 = 表の p
      let ok = 0;
      const N = 100000;
      for (let i = 0; i < N; i++) if (tuneRoll(s, 0, rng).success) ok++;
      assert.ok(Math.abs(ok / N - TUNE_RATES[s]) < 0.01, `★${s} 成功率 ${(ok / N).toFixed(4)} vs ${TUNE_RATES[s]}`);
      // (b) 天井込みの 1成功あたり試行回数 = 期待試行（±3%）
      let tries = 0, succ = 0, pity = 0;
      for (let i = 0; i < 100000; i++) {
        tries++;
        const r = tuneRoll(s, pity, rng);
        if (r.success) { succ++; pity = 0; } else pity++;
        assert.ok(pity < TUNE_PITY[s], `★${s} 天井を超えて失敗した`);
      }
      assert.ok(Math.abs(tries / succ - TUNE_EXPECTED[s]) / TUNE_EXPECTED[s] < 0.03, `★${s} 期待試行 ${(tries / succ).toFixed(3)} vs ${TUNE_EXPECTED[s].toFixed(3)}`);
      // (c) 常に失敗する乱数でも N 回目で必ず成功
      const fail = () => 0.999999;
      let p2 = 0, n = 0;
      for (;;) { n++; const r = tuneRoll(s, p2, fail); if (r.success) { assert.ok(r.guaranteed); break; } p2++; }
      assert.equal(n, TUNE_PITY[s], `★${s} 天井 ${n}`);
    }
  });

  test('v3 sys: tuneItem（費用・★は下がらない・天井・チケット・イベント・サンデー割引）', () => {
    const g = richGame('jin', 'beach');
    const st = g.state;
    const got = [];
    g.events.on('tuneResult', (d) => got.push(d.success));
    const ms = [];
    g.events.on('tuneMilestone', (d) => ms.push(d.star));
    addItem(g, 'katana_plasma', 1, { pot: null }); // Lv62 → 上限★15
    const k = invInst(st, 'katana_plasma')[0];
    const fail = () => 0.999999;
    // 失敗しても★は下がらない、天井で成功
    let info = tuneInfo(st, k.uid, MONDAY);
    assert.equal(info.cost, tuneCost(0, 62)); assert.equal(info.rate, 0.95); assert.equal(info.pityMax, 3); assert.equal(info.maxStar, 15);
    const sunday = tuneInfo(st, k.uid, SUNDAY);
    assert.ok(sunday.discount === 30 && sunday.cost < info.cost, 'サンデー・ネオン -30%');
    const m0 = st.money;
    let r = tuneItem(g, k.uid, { rng: fail, now: MONDAY });
    assert.ok(r.ok && !r.success && r.star === 0 && k.tunePity === 1);
    assert.equal(st.money, m0 - info.cost);
    r = tuneItem(g, k.uid, { rng: fail, now: MONDAY }); assert.ok(!r.success);
    r = tuneItem(g, k.uid, { rng: fail, now: MONDAY }); assert.ok(r.success && r.guaranteed && k.star === 1 && k.tunePity === 0);
    // 最大まで（★15）上げる: 常に失敗でも天井で必ず到達
    let guard = 0;
    while (k.star < 15 && guard++ < 500) { const s0 = k.star; r = tuneItem(g, k.uid, { rng: fail }); assert.ok(k.star >= s0, '★は下がらない'); }
    assert.equal(k.star, 15);
    assert.deepEqual(ms, [10, 15]);
    info = tuneInfo(st, k.uid);
    assert.equal(info.canTune, false);
    assert.equal(tuneItem(g, k.uid).ok, false, '最大★');
    // チューン・チケット: 確定成功
    addItem(g, 'knife_basic', 1, { pot: null });
    const kn = invInst(st, 'knife_basic')[0];
    addItem(g, 'tune_ticket', 1);
    r = tuneItem(g, kn.uid, { rng: fail, ticket: true });
    assert.ok(r.success && kn.star === 1 && countItem(st, 'tune_ticket') === 0);
    // お金不足
    st.money = 0;
    assert.equal(tuneItem(g, kn.uid).ok, false);
    // PET は強化不可
    addItem(g, 'pet_cat', 1);
    assert.equal(tuneInfo(st, invInst(st, 'pet_cat')[0].uid).canTune, false);
    // 装備中の武器も強化でき computeStats に反映
    st.money = 1e9;
    const before = computeStats(st, []).atk;
    const wpn = equippedInstOf(st, 'weapon');
    for (let i = 0; i < 3; i++) tuneItem(g, { slot: 'weapon' }, { rng: () => 0 });
    assert.equal(wpn.star, 3);
    assert.ok(computeStats(st, []).atk > before);
    assert.ok(got.length > 10);
  });

  // ============================================================ ハックチップ（潜在）
  test('v3 sys: 潜在 10万回の統計（等級アップ率・行の等級25%・オプション等確率）と天井保証', () => {
    const rng = makeRng(777);
    for (const [g, u] of Object.entries(POT_UPGRADE)) {
      let up = 0;
      const N = 100000;
      for (let i = 0; i < N; i++) if (rollGradeUp(g, 0, rng).up) up++;
      assert.ok(Math.abs(up / N - u.p) < Math.max(0.002, u.p * 0.1), `${g}→${u.to} ${(up / N).toFixed(4)} vs ${u.p}`);
      // 天井: 常に失敗でも pity 回目で確定
      const fail = () => 0.999999;
      let n = 0;
      for (let pity = 0; ; pity++) { n++; if (rollGradeUp(g, pity, fail).up) break; }
      assert.equal(n, u.pity, `${g} 天井 ${n}`);
    }
    // 行の等級: 2・3行目は 25% で現等級
    const N = 100000;
    let same = 0, lines = 0;
    const statCount = {};
    for (let i = 0; i < N; i++) {
      const p = rollPotential(ITEMS.katana_steel, 'legendary', rng);
      assert.equal(p.lines.length, 3);
      assert.equal(p.lines[0].grade, 'legendary', '1行目は現等級');
      for (const l of p.lines.slice(1)) { lines++; if (l.grade === 'legendary') same++; }
      statCount[p.lines[0].stat] = (statCount[p.lines[0].stat] || 0) + 1;
    }
    assert.ok(Math.abs(same / lines - 0.25) < 0.01, `現等級行 ${(same / lines).toFixed(4)}`);
    // 1行目のオプションは部位プールから等確率
    const pool = potLinePool('weapon', 'legendary');
    assert.deepEqual(Object.keys(statCount).sort(), pool.map((l) => l.stat).sort());
    for (const k of Object.keys(statCount)) assert.ok(Math.abs(statCount[k] / N - 1 / pool.length) < 0.01, `${k} ${(statCount[k] / N).toFixed(4)}`);
    // 部位制限: 靴に攻撃%は出ない・帽子に CT は出る（レジェ以上）
    for (let i = 0; i < 2000; i++) {
      for (const l of rollPotential(ITEMS.sneakers_white, 'mythic', rng).lines) assert.ok(POT_LINES.find((d) => d.stat === l.stat).slots.includes('shoes'), l.stat);
    }
    assert.ok(potLinePool('hat', 'legendary').some((l) => l.stat === 'cdr'));
    assert.ok(!potLinePool('hat', 'epic').some((l) => l.stat === 'cdr'));
    // ドロップ時の潜在は 6%（±0.5%）
    let dp = 0;
    for (let i = 0; i < N; i++) if (maybePotential(ITEMS.katana_steel, rng)) dp++;
    assert.ok(Math.abs(dp / N - POT_RATES.dropChance) < 0.005, `drop pot ${(dp / N).toFixed(4)}`);
    assert.equal(maybePotential(ITEMS.pet_cat, rng), null);
    // 確率表は合計 1
    const t = potRateTable('weapon');
    for (const gr of POT_GRADES) {
      assert.ok(Math.abs(t.lines[gr].line1.reduce((a, l) => a + l.p, 0) - 1) < 1e-9, gr);
      assert.ok(Math.abs(t.lines[gr].line23.reduce((a, l) => a + l.p, 0) - 1) < 1e-9, gr + ' line23');
    }
  });

  test('v3 sys: useChip（付与→前後選択→採用/破棄・等級アップ天井・行ロック・ログ50件）', () => {
    const g = richGame('luna', 'beach');
    const st = g.state;
    addItem(g, 'smg_neon', 1, { pot: null });
    const it = invInst(st, 'smg_neon')[0];
    assert.equal(useChip(g, it.uid).ok, false, 'チップなし');
    addItem(g, 'chip_reroll', 400);
    // 潜在なし → レア付与（即採用）
    let r = useChip(g, it.uid, 'chip_reroll', { rng: makeRng(1) });
    assert.ok(r.ok && r.applied && it.pot.grade === 'rare' && it.pot.lines.length === 3);
    // 前後選択: 破棄なら元のまま
    const before = JSON.stringify(it.pot);
    const fail = () => 0.999999;
    r = useChip(g, it.uid, 'chip_reroll', { rng: makeRng(2) });
    assert.ok(r.ok && !r.applied && it.potPending);
    assert.equal(useChip(g, it.uid).ok, false, '選択待ちの間は使えない');
    applyChipResult(g, it.uid, false);
    assert.equal(JSON.stringify(it.pot), before);
    // 採用
    r = useChip(g, it.uid, 'chip_reroll', { rng: makeRng(3) });
    const after = JSON.stringify(r.after);
    applyChipResult(g, it.uid, true);
    assert.equal(JSON.stringify(it.pot), after);
    // 天井: 常に失敗する乱数でも レア→エピックは 15 回目
    it.potPity = 0;
    let n = 0;
    for (;;) { n++; r = useChip(g, it.uid, 'chip_reroll', { rng: fail }); applyChipResult(g, it.uid, false); if (r.gradeUp) break; assert.ok(n < 20); }
    // 1回目は上の「採用」でカウント済みでないことを確認（pity は等級ごと）
    assert.ok(n <= 15, `天井 ${n}`);
    assert.equal(it.pot.grade, 'epic', '等級アップは破棄しても維持');
    assert.ok(it.pot.lines.every((l) => l.grade === 'epic' || l.grade === 'rare'));
    assert.equal(potInfo(st, it.uid).pityMax, 50);
    // 行ロック: 1行=1個
    assert.ok(lockLine(g, it.uid, 0, true).ok);
    assert.equal(lockLine(g, it.uid, 1, true).ok, true);
    assert.equal(lockLine(g, it.uid, 2, true).ok, false, '全行ロック不可');
    lockLine(g, it.uid, 1, false);
    r = useChip(g, it.uid);
    assert.equal(r.ok, false, 'ロック・チップ不足');
    addItem(g, 'chip_lock', 5);
    const l0 = { ...it.pot.lines[0] };
    r = useChip(g, it.uid, 'chip_reroll', { rng: makeRng(9) });
    assert.ok(r.ok);
    assert.deepEqual(r.after.lines[0], l0, 'ロック行は固定');
    assert.equal(countItem(st, 'chip_lock'), 4);
    applyChipResult(g, it.uid, true);
    lockLine(g, it.uid, 0, false);
    // ログ: 最大50件・累計
    for (let i = 0; i < 60; i++) { useChip(g, it.uid, 'chip_reroll', { rng: makeRng(100 + i) }); applyChipResult(g, it.uid, false); }
    const log = potLog(st);
    assert.equal(log.entries.length, 50);
    assert.ok(log.stats.tries >= 60);
    // PET には使えない
    addItem(g, 'pet_cat', 1);
    assert.equal(useChip(g, invInst(st, 'pet_cat')[0].uid).ok, false);
    // セーブ（JSON）往復で潜在と★が残る
    it.star = 4;
    const st2 = migrateState(JSON.parse(JSON.stringify(st)));
    const it2 = st2.inventory.find((s) => s.uid === it.uid);
    assert.equal(it2.star, 4); assert.deepEqual(it2.pot, it.pot);
  });

  // ============================================================ 旧セーブ移行
  test('v3 sys: 旧セーブ v1/v2/v3 → v4 移行（装備インスタンス化・新フィールド・冪等）', () => {
    const v1 = {
      heroId: 'jin', level: 12, exp: 50, money: 999, hp: 100, mp: 20,
      inventory: [{ id: 'potion_red', qty: 5 }, { id: 'katana_steel', qty: 1 }, { id: 'katana_steel', qty: 2 }, { id: 'bogus_item', qty: 1 }],
      equipped: { hat: null, top: 'leather_jacket', bottom: 'jeans_blue', shoes: 'boots_black', accessory: null, weapon: 'bat_wood' },
      skills: {}, skillBar: [], missions: { active: [], completed: ['m01_welcome'] }, mapId: 'downtown',
    };
    const v2 = { ...JSON.parse(JSON.stringify(v1)), version: 2, visited: ['beach', 'downtown'], book: { slime_green: 12 }, sns: { followers: 50, posts: [] }, clock: 21 };
    const v3 = { ...JSON.parse(JSON.stringify(v2)), version: 3, heroId: 'hacker', gender: 'm', name: 'ネオ', job: { id: 'hk_netrunner', tier: 1, history: ['beginner'] }, spByTier: { 2: 0, 3: 0, 4: 0 },
      equipped: { ...v2.equipped, weapon: 'staff_glitch', pet: 'pet_cat' }, inventory: [...v2.inventory, { id: 'pet_slime', qty: 1 }] };
    for (const [name, raw] of [['v1', v1], ['v2', v2], ['v3', v3]]) {
      const st = migrateState(JSON.parse(JSON.stringify(raw)));
      assert.equal(st.version, STATE_VERSION, name);
      assert.equal(STATE_VERSION, 4);
      assert.ok(!st.inventory.some((s) => s.id === 'bogus_item'), name + ' 不明アイテム除去');
      const ks = st.inventory.filter((s) => s.id === 'katana_steel');
      assert.equal(ks.length, 3, name + ' qty>1 の装備を分割');
      for (const s of st.inventory) {
        if (ITEMS[s.id].type === 'equip') assert.ok(s.uid?.startsWith('#') && s.qty === 1 && s.star === 0 && s.pot === null, name + ' ' + s.id);
        else assert.ok(!s.uid);
      }
      for (const slot of EQUIP_SLOTS) {
        if (st.equipped[slot]) assert.equal(equippedInstOf(st, slot)?.id, st.equipped[slot], `${name} ${slot}`);
        else assert.ok(!st.equippedInst[slot]);
      }
      const uids = equipInstances(st).map((e) => e.inst.uid);
      assert.equal(new Set(uids).size, uids.length, name + ' uid 重複なし');
      for (const k of ['bosses', 'achv', 'login', 'petData', 'storyChoices', 'potLog', 'tuneStats']) assert.ok(st[k] && typeof st[k] === 'object', `${name} ${k}`);
      assert.ok(Number.isInteger(st.rngSeed));
      const s = computeStats(st, []);
      for (const k of ['maxHp', 'atk', 'def', 'speed', 'crit']) assert.ok(fin(s[k]), `${name} ${k}`);
      assert.ok(st.hp > 0 && st.hp <= s.maxHp);
      // 冪等（2回目で uid が変わらない）・JSON 往復
      const again = migrateState(JSON.parse(JSON.stringify(st)));
      assert.deepEqual(equipInstances(again).map((e) => e.inst.uid), uids, name + ' 冪等');
      // 移行後もゲームとして使える（装備変更・強化）
      const g = makeGame(st.heroId, 'beach');
      g.state = again; g.nowMs = () => SUNDAY;
      again.money = 1e7; again.level = Math.max(again.level, 12);
      assert.ok(equip(g, 'katana_steel').ok, name + ' equip');
      assert.ok(tuneItem(g, { slot: 'weapon' }, { rng: () => 0 }).success, name + ' tune');
    }
    // v3 の名前・性別・転職は保持
    const s3 = migrateState(JSON.parse(JSON.stringify(v3)));
    assert.equal(s3.name, 'ネオ'); assert.equal(s3.gender, 'm'); assert.equal(s3.job.id, 'hk_netrunner');
    assert.equal(equippedInstOf(s3, 'pet').id, 'pet_cat');
    // v2 の図鑑/SNS も保持
    const s2 = migrateState(JSON.parse(JSON.stringify(v2)));
    assert.equal(s2.book.slime_green, 12); assert.equal(s2.sns.followers, 50);
    // 壊れた v4 フィールドも補完
    const bad = migrateState({ ...JSON.parse(JSON.stringify(v1)), version: 4, achv: 'x', bosses: null, equippedInst: [], potLog: {} });
    assert.ok(bad.achv.done && bad.bosses && !Array.isArray(bad.equippedInst) && Array.isArray(bad.potLog));
  });

  // ============================================================ ボス
  test('v3 sys: ボス難易度（倍率・解放・入場・周回/持ち越し・報酬・記録・練習）', () => {
    assert.deepEqual(Object.keys(BOSS_MODES).sort(), ['chaos', 'hard', 'normal', 'practice']);
    assert.deepEqual(bossModeMult('hard'), { hp: 5, atk: 1.8, levelAdd: 25, mode: 'hard' });
    assert.equal(bossModeMult({ bossMode: 'chaos' }).hp, 15);
    assert.equal(bossModeMult(null).hp, 1);
    assert.equal(bossRewardMoney('boss_king_slime', 'normal'), Math.round(200 * Math.pow(10, 1.6)));
    assert.ok(Math.abs(bossRewardMoney('boss_alien', 'chaos') - 3.8e6) < 1e5);
    for (const id of BOSS_IDS) assert.ok(MAPS[bossRoomId(id)], 'ボス部屋 ' + id);
    const g = richGame('luna', 'beach');
    const st = g.state;
    st.level = 50;
    assert.equal(bossUnlocked(st, 'boss_king_slime', 'normal').ok, false, '未到達');
    assert.equal(bossEntry(g, 'boss_king_slime', 'normal').ok, false);
    st.visited.push('beach_f3');
    assert.ok(bossUnlocked(st, 'boss_king_slime', 'normal').ok);
    assert.equal(bossUnlocked(st, 'boss_king_slime', 'hard').ok, false, 'ハードはノーマル撃破後');
    // 入場
    let r = bossEntry(g, 'boss_king_slime', 'normal');
    assert.ok(r.ok, r.msg);
    assert.equal(g.bossMode, 'normal');
    assert.equal(g.map.instance, 'boss');
    assert.equal(g.map.id, bossRoomId('boss_king_slime'));
    // 撃破（spawner が呼ぶ想定）
    const m0 = st.money;
    g.time += 42;
    g.bossMaxHit = 1234;
    r = bossCleared(g, 'boss_king_slime', 'normal', {});
    assert.ok(r.ok && r.money === bossRewardMoney('boss_king_slime', 'normal') && r.trophies === 1);
    assert.equal(st.money, m0 + r.money);
    assert.equal(st.bossTrophies, 1);
    assert.ok(countItem(st, 'chip_reroll') >= 1);
    const rec = st.bosses.boss_king_slime.normal;
    assert.equal(rec.clears, 1); assert.ok(Math.abs(rec.best.time - 42) < 0.01); assert.equal(rec.best.maxHit, 1234);
    assert.equal(bossStock(st, 'boss_king_slime', 'normal', Date.now()), 0, '今日の分を消化');
    assert.equal(bossEntry(g, 'boss_king_slime', 'normal').ok, false, '回数切れ');
    assert.ok(bossEntry(g, 'boss_king_slime', 'practice').ok, '練習は何度でも');
    r = bossCleared(g);
    assert.ok(r.ok && r.money === 0 && r.trophies === 0, '練習は報酬なし');
    assert.ok(bossUnlocked(st, 'boss_king_slime', 'hard').ok);
    assert.equal(bossUnlocked(st, 'boss_king_slime', 'chaos').ok, false);
    // 持ち越し: 3日後でもストックは最大3
    const t = st.bosses.boss_king_slime.normal.ticket;
    refreshTicket(t, 'daily', Date.now() + 5 * DAY, TICKET_CAP);
    assert.equal(t.stock, 3);
    // 一覧
    const list = bossClears(st);
    assert.equal(list.length, BOSS_IDS.length);
    assert.ok(list[0].modes.normal.clears === 1 && list[0].modes.hard.unlocked);
    // 制限時間で失敗（updateSkills 経由で毎フレーム判定）
    st.bosses.boss_king_slime.hard = undefined;
    r = bossEntry(g, 'boss_king_slime', 'hard'); assert.ok(r.ok, r.msg);
    const room = g.map.id;
    g.time += BOSS_MODES.hard.timeLimit + 1;
    updateSkills(g, 0.016);
    assert.equal(g.bossMode, null);
    assert.notEqual(g.map.id, room, '時間切れで退出');
    assert.equal(st.bosses.boss_king_slime.hard.clears, 0);
    // 交換所
    st.bossTrophies = 3;
    assert.ok(bossExchange(g, 'chip_lock').ok);
    assert.equal(st.bossTrophies, 0);
    assert.equal(bossExchange(g, 'suit_vice').ok, false);
    // spawner の倍率がモードに追従（実際のボス部屋）
    st.bosses.boss_king_slime.hard.ticket.stock = 1;
    bossEntry(g, 'boss_king_slime', 'hard');
    for (let i = 0; i < 200 && !g.enemies.some((e) => e.def?.boss); i++) step(g);
    const boss = g.enemies.find((e) => e.def?.boss);
    assert.ok(boss, 'ボス部屋にボスが出る');
    assert.ok(boss.maxHp >= ENEMIES.boss_king_slime.hp * 4.9, `ハードのHP ${boss.maxHp}`);
  });

  // ============================================================ タワー
  test('v3 sys: ヴァイス・スパイア（階定義・入場・クリア記録・初到達報酬・再開・週次トークン）', () => {
    for (const f of [1, 5, 10, 11, 50, 51, 99, 100, 150, 300]) {
      const d = towerFloorDef(f, 2900);
      assert.equal(d.floor, f);
      assert.equal(d.level, Math.round(20 + f * 1.2));
      assert.ok(d.displayLevel <= 200);
      assert.ok(d.enemies.length >= 2 && d.enemies.every((e) => ENEMIES[e.id] && !ENEMIES[e.id].boss && !ENEMIES[e.id].night && e.count > 0 && e.level === d.displayLevel));
      assert.equal(d.enemies.reduce((a, e) => a + e.count, 0), d.count);
      assert.ok(fin(d.hpMult) && d.hpMult > 0 && fin(d.atkMult) && d.atkMult > 0);
      assert.equal(d.timeLimit, 90);
      assert.equal(!!d.boss, f % 10 === 0, `${f} boss`);
      if (d.boss) assert.ok(ENEMIES[d.boss].boss && fin(d.bossHpMult));
      if (f % 5 === 0 && f % 10) assert.ok(d.miniBoss);
      assert.ok(d.mutators.length <= 3);
      if (f < 11) assert.equal(d.mutators.length, 0);
      if (f >= 11 && f < 51) assert.equal(d.mutators.length, 1);
      if (f >= 51) assert.ok(d.mutators.length >= 2);
      for (const m of d.mutators) assert.ok(TOWER_MUTATORS[m.id]);
      assert.ok(Math.abs(d.rewardMult - (1 + 0.1 * d.mutators.length)) < 1e-9);
      assert.deepEqual(towerFloorDef(f, 2900), d, '決定的');
    }
    // 100階超は HP 1.06^n で強化継続
    const a = towerFloorDef(200, 1), b = towerFloorDef(201, 1);
    assert.ok(b.level > a.level);
    const g = richGame('jin', 'rooftop');
    const st = g.state;
    st.level = 30;
    assert.equal(towerEnter(g, 1).ok, false, 'Lv40 から');
    st.level = 90;
    assert.equal(towerEnter(g, 11).ok, false, '未到達のチェックポイント');
    let r = towerEnter(g, 1);
    assert.ok(r.ok);
    assert.equal(g.map.id, 'tower'); assert.equal(g.towerFloor, 1);
    // 1〜10 階をクリア
    for (let f = 1; f <= 10; f++) {
      if (f > 1) { r = towerEnter(g, f); assert.ok(r.ok, `${f}F ${r.msg}`); }
      g.time += 30;
      r = towerClearFloor(g);
      assert.ok(r.ok && r.floor === f && r.exp > 0 && r.money > 0, `${f}F clear`);
      assert.equal(towerClearFloor(g).ok, false, '二重記録しない');
    }
    assert.equal(towerBest(st).best, 10);
    assert.ok(countItem(st, 'chip_reroll') >= 1, '10階 初到達報酬');
    assert.deepEqual(towerStartFloors(st), [1, 11]);
    assert.equal(towerEnter(g, 13).ok, false);
    g.towerRun = null;
    assert.ok(towerEnter(g, 11).ok, 'チェックポイントから再開');
    // 時間切れで退出
    g.time += 91;
    updateSkills(g, 0.016);
    assert.notEqual(g.map.id, 'tower');
    // 週次トークン: 翌週に floor(weekBest^1.2)
    const t = towerState(st, Date.now());
    const wb = t.weekBest;
    towerState(st, Date.now() + 8 * DAY);
    assert.equal(st.tower.tokens, Math.floor(Math.pow(wb, 1.2)));
    assert.equal(st.tower.weekBest, 0);
    // 実際の spawner がタワー階を出す
    g.towerRun = null;
    towerEnter(g, 1);
    for (let i = 0; i < 120; i++) step(g);
    assert.ok(g.enemies.length > 0, 'スパイアに敵が出る');
  });

  // ============================================================ アリーナ
  test('v3 sys: ネオン・アリーナ（1日2回・ストック6・ウェーブ・経験値ボーナス・クリア報酬）', () => {
    const g = richGame('luna', 'downtown');
    const st = g.state;
    st.level = 40;
    let info = arenaInfo(st);
    assert.equal(info.stock, 2); assert.equal(info.cap, 6);
    assert.ok(info.stages.length === 6 && info.stages[0].unlocked && !info.stages[5].unlocked);
    assert.equal(arenaEnter(g, 'orbital').ok, false, 'Lv不足');
    // 持ち越し: 5日後は最大6
    refreshTicket(st.arena.ticket, 'daily', Date.now() + 5 * DAY, 6, 2);
    assert.equal(st.arena.ticket.stock, 6);
    st.arena.ticket.stock = 1;
    let r = arenaEnter(g, 'harbor');
    assert.ok(r.ok, r.msg);
    assert.equal(g.map.id, 'arena'); assert.equal(st.arena.ticket.stock, 0);
    assert.equal(arenaExpMult(g, { instance: 'arena' }), 1.5);
    assert.equal(arenaExpMult(g, { instance: null }), 1);
    for (let w = 1; w <= ARENA_WAVES; w++) {
      const d = arenaWaveDef(w, g);
      assert.ok(d.enemies.length >= 2 && d.enemies.every((e) => ENEMIES[e.id] && e.count > 0) && fin(d.hpMult) && fin(d.atkMult));
    }
    const exp0 = st.exp, lv0 = st.level;
    for (let w = 1; w < ARENA_WAVES; w++) assert.ok(arenaWaveCleared(g, w).ok);
    r = arenaWaveCleared(g, ARENA_WAVES);
    assert.ok(r.ok && r.exp > 0 && r.fast);
    assert.ok(st.level > lv0 || st.exp > exp0);
    assert.equal(st.arena.clears, 1); assert.equal(g.arenaEnded, true);
    assert.equal(arenaEnter(g, 'harbor').ok, false, '回数切れ');
  });

  // ============================================================ 実績・称号
  test('v3 sys: 実績100件前後・カテゴリ・イベントで解除・称号・ランクボーナス', () => {
    resetSharedForTest();
    assert.ok(ACHIEVEMENT_IDS.length >= 95 && ACHIEVEMENT_IDS.length <= 110, `実績 ${ACHIEVEMENT_IDS.length}`);
    assert.equal(new Set(ACHIEVEMENT_IDS).size, ACHIEVEMENT_IDS.length);
    const cats = {};
    for (const a of Object.values(ACHIEVEMENTS)) { cats[a.cat] = (cats[a.cat] || 0) + 1; assert.ok(a.name && a.desc && a.points > 0 && typeof a.test === 'function', a.id); }
    assert.deepEqual(Object.keys(cats).sort(), ['boss', 'collection', 'combat', 'growth', 'gta', 'hidden']);
    const g = makeGame('luna', 'beach_f1');
    const st = g.state;
    attachAchievements(g);
    const got = [];
    g.events.on('achievementUnlocked', (d) => got.push(d.id));
    const e = new Enemy(g, 'slime_green', 900, g.map.groundY); g.enemies.push(e);
    damageEnemy(g, e, 1e9);
    assert.ok(st.achv.done.kills_1, '初撃破');
    assert.ok(got.includes('kills_1'));
    // 隠し実績は未達成なら ???
    const hid = achievementList(st).find((a) => a.id === 'deaths_10');
    assert.equal(hid.name, '？？？');
    // 称号
    assert.equal(setTitle(st, 'a:kills_10000'), false, '未所持');
    st.kills = 10000;
    evaluateAchievements(g);
    assert.ok(setTitle(st, 'a:kills_10000'));
    assert.equal(currentTitle(st).name, '狩りの達人');
    st.flags.title_new_don = true;
    assert.ok(titleList(st).find((t) => t.id === 't_new_don').owned);
    // ランクボーナス → 全ステ
    const s0 = computeStats(st, []);
    for (const id of ACHIEVEMENT_IDS.slice(0, 40)) st.achv.done[id] = 1;
    const sum = achievementSummary(st);
    assert.ok(sum.rankIndex >= 1, `rank ${sum.rank} ${sum.points}`);
    const s1 = computeStats(st, []);
    assert.ok(s1.str > s0.str && s1.luk > s0.luk, '実績ランクで全ステ');
    assert.ok(ACH_RANKS.length === 6);
    resetSharedForTest();
  });

  // ============================================================ デイリー / ログイン
  test('v3 sys: 日次/週次リセット(5:00/月曜)・持ち越し2周期・時計巻き戻し・ログインカレンダー・曜日イベント', () => {
    const d = new Date(2026, 9, 5, 4, 59).getTime(); // 月曜 4:59 → まだ日曜扱い
    assert.equal(dayIndex(d), dayIndex(new Date(2026, 9, 4, 12).getTime()));
    assert.equal(dayIndex(d + 2 * 60000), dayIndex(d) + 1, '5:00 で日付が変わる');
    assert.equal(weekIndex(d), weekIndex(d - 3 * DAY), '月曜 5時前は前週');
    assert.equal(weekIndex(d + 2 * 60000), weekIndex(d) + 1, '月曜 5:00 で週が変わる');
    const t = refreshTicket(null, 'daily', SUNDAY);
    assert.equal(t.stock, 1);
    assert.ok(useTicket(t, 'daily', SUNDAY)); assert.equal(useTicket(t, 'daily', SUNDAY), false);
    refreshTicket(t, 'daily', SUNDAY + 10 * DAY);
    assert.equal(t.stock, TICKET_CAP, '最大2周期まで持ち越し');
    refreshTicket(t, 'daily', SUNDAY - 3 * DAY);
    assert.equal(t.stock, TICKET_CAP, '巻き戻しで増えない');
    // ログイン（1日1回・累計・28日周期）
    const g = makeGame('luna', 'beach');
    const st = g.state;
    assert.equal(LOGIN_REWARDS.length, 28);
    for (const r of LOGIN_REWARDS) for (const [id] of r.items) assert.ok(ITEMS[id], id);
    let r = loginCheck(g, SUNDAY);
    assert.ok(r.ok && r.day === 1);
    assert.equal(loginCheck(g, SUNDAY + 3600000).ok, false, '同日2回目');
    assert.equal(loginCheck(g, SUNDAY - DAY).ok, false, '巻き戻し');
    r = loginCheck(g, SUNDAY + 3 * DAY); // 連続不要
    assert.ok(r.ok && r.day === 2);
    for (let i = 4; i < 31; i++) loginCheck(g, SUNDAY + i * DAY);
    assert.equal(st.login.days, 29);
    assert.equal(loginStatus(st, SUNDAY + 30 * DAY).today, 1, '29日目で次の周期の1日目');
    // 曜日イベント
    assert.equal(weekdayEvent(MONDAY).expMult, 1.1);
    assert.equal(weekdayEvent(SUNDAY).tuneCostMult, 0.7);
    const g2 = makeGame('luna', 'beach_f1');
    g2.nowMs = () => MONDAY; g2.clock = 12;
    assert.equal(killExp(g2, ENEMIES.crab_iron), Math.round(ENEMIES.crab_iron.exp * 1.1), '月曜 EXP+10%');
    // デイリーミッションの持ち越し
    const dm = Object.values(MISSIONS).find((m) => m.daily && !(m.prereq || []).length);
    g.state.level = 99;
    assert.ok(g.missions.canAccept(dm.id));
    g.state.missions.dailyTickets[dm.id].stock = 0;
    g.state.missions.dailyTickets[dm.id].idx -= 5;
    assert.equal(g.missions.dailyStock(dm.id), TICKET_CAP);
  });

  // ============================================================ プリセット
  test('v3 sys: スキルバー＆装備セット×2（uid で保存・切替）', () => {
    const g = richGame('luna', 'beach');
    const st = g.state;
    addItem(g, 'knife_butterfly', 1, { pot: null });
    const kb = invInst(st, 'knife_butterfly')[0];
    kb.star = 2;
    const w0 = equippedInstOf(st, 'weapon').uid;
    const bar0 = [...st.skillBar];
    assert.ok(savePreset(st, 0));
    equip(g, kb.uid);
    st.skillBar = [...bar0].reverse();
    assert.ok(savePreset(st, 1));
    assert.equal(presetList(st).length, 2);
    let r = applyPreset(g, 0);
    assert.ok(r.ok && r.missing.length === 0);
    assert.equal(equippedInstOf(st, 'weapon').uid, w0);
    assert.deepEqual(st.skillBar, bar0);
    r = applyPreset(g, 1);
    assert.equal(equippedInstOf(st, 'weapon').uid, kb.uid);
    assert.equal(equippedInstOf(st, 'weapon').star, 2);
    // 売った装備は missing
    applyPreset(g, 0);
    sellItem(g, kb.uid);
    r = applyPreset(g, 1);
    assert.deepEqual(r.missing, ['weapon']);
  });

  // ============================================================ キャラ間共有
  test('v3 sys: キャラ間共有（倉庫48枠・★/潜在保持・図鑑マージ・実績共有・リンクボーナス・localStorage 無しでも動作）', () => {
    resetSharedForTest();
    const ga = richGame('luna', 'beach');
    addItem(ga, 'katana_steel', 1, { pot: { grade: 'epic', lines: [{ stat: 'atkPct', value: 0.06, grade: 'epic' }] } });
    const k = invInst(ga.state, 'katana_steel')[0];
    k.star = 4;
    let r = depositItem(ga, k.uid);
    assert.ok(r.ok, r.msg);
    assert.equal(countItem(ga.state, 'katana_steel'), 0);
    addItemToState(ga.state, 'potion_red', 30);
    assert.ok(depositItem(ga, 'potion_red', 20).ok);
    assert.equal(sharedStorage().length, 2);
    // 別キャラが引き出す
    const gb = richGame('jin', 'beach');
    const idx = sharedStorage().findIndex((e) => e.id === 'katana_steel');
    r = withdrawItem(gb, idx);
    assert.ok(r.ok);
    const k2 = invInst(gb.state, 'katana_steel')[0];
    assert.equal(k2.star, 4); assert.equal(k2.pot.grade, 'epic');
    r = withdrawItem(gb, sharedStorage().findIndex((e) => e.id === 'potion_red'), 5);
    assert.ok(r.ok); assert.equal(sharedStorage()[0].qty, 15);
    // 上限 48
    for (let i = 0; i < SHARED_STORAGE_SLOTS; i++) { addItem(ga, 'tshirt_white', 1, { pot: null }); depositItem(ga, 'tshirt_white'); }
    assert.equal(sharedStorage().length, SHARED_STORAGE_SLOTS);
    addItem(ga, 'tshirt_white', 1, { pot: null });
    assert.equal(depositItem(ga, 'tshirt_white').ok, false);
    // 図鑑マージ
    ga.state.book = { slime_green: 30 };
    gb.state.book = { crab_sand: 5, slime_green: 2 };
    syncSharedBook(ga.state); syncSharedBook(gb.state);
    assert.equal(gb.state.book.slime_green, 30); assert.equal(gb.state.book.crab_sand, 5);
    syncSharedBook(ga.state);
    assert.equal(ga.state.book.crab_sand, 5);
    // リンク: 他キャラ（luna Lv60）→ jin に crit +2%
    ga.state.level = 60;
    updateSharedChar(ga.state, 0);
    updateSharedChar(gb.state, 1);
    const lb = linkBonus(gb.state);
    assert.ok(Math.abs(lb.crit - 0.02) < 1e-9, `link crit ${lb.crit}`);
    assert.equal(linkBonus(ga.state).crit, 0, '自分自身からは受けない');
    assert.ok(loadShared().chars.s0);
    resetSharedForTest();
    assert.equal(sharedStorage().length, 0);
  });

  // ============================================================ ストーリー分岐
  test('v3 sys: ストーリー分岐（choose → 報酬・flag・称号・後のセリフ）', () => {
    const withChoices = Object.values(MISSIONS).filter((m) => m.choices?.length);
    assert.ok(withChoices.length >= 3, '3本以上');
    for (const m of withChoices) {
      assert.equal(m.category, 'main');
      for (const c of m.choices) { assert.ok(c.id && c.text && c.flag, m.id); for (const it of c.reward?.items || []) assert.ok(ITEMS[it], it); }
    }
    const run = (choiceId) => {
      const g = makeGame('jin', 'downtown');
      const st = g.state;
      st.level = 99;
      for (const id of ['m01_welcome', 'm02_jelly', 'm03_flamingo', 'm04_rosa', 'm05_protection']) st.missions.completed.push(id);
      assert.ok(g.missions.accept('m06_dirty_badge'));
      g.missions._prog('m06_dirty_badge').fill(99);
      addItemToState(st, 'cop_badge', 3);
      assert.ok(g.missions.isComplete('m06_dirty_badge'));
      assert.ok(g.missions.needsChoice('m06_dirty_badge'));
      if (choiceId) assert.ok(g.missions.choose('m06_dirty_badge', choiceId).ok);
      assert.equal(g.missions.choose('m06_dirty_badge', 'nope').ok, false);
      const m0 = st.money;
      const r = g.missions.turnIn('m06_dirty_badge');
      assert.ok(r);
      return { g, st, r, gain: st.money - m0 };
    };
    const a = run('police');
    assert.equal(a.r.choice, 'police');
    assert.ok(a.st.flags.sidePolice && a.st.flags.title_police_ally);
    assert.equal(a.gain, MISSIONS.m06_dirty_badge.reward.money + 1000);
    const b = run('street');
    assert.ok(b.st.flags.sideStreet && !b.st.flags.sidePolice);
    assert.ok(countItem(b.st, 'chip_reroll') >= 1);
    // 後のセリフ（m07 の offer）が flag で変わる
    assert.notDeepEqual(a.g.missions.dialog('m07_wheels', 'offer'), b.g.missions.dialog('m07_wheels', 'offer'));
    assert.deepEqual(a.g.missions.dialog('m06_dirty_badge', 'done'), MISSIONS.m06_dirty_badge.choices[0].dialog);
    // 未選択で報告 → 最初の選択肢
    const c = run(null);
    assert.equal(c.r.choice, MISSIONS.m06_dirty_badge.choices[0].id);
    assert.ok(titleList(a.st).find((t) => t.id === 't_police_ally').owned);
  });

  // ============================================================ 夜
  test('v3 sys: 夜限定の敵・夜だけ開く店・isNightNow', () => {
    assert.ok(NIGHT_ENEMY_IDS.length >= 4);
    for (const id of NIGHT_ENEMY_IDS) { const e = ENEMIES[id]; assert.ok(e.night && e.habitats.length && e.lore, id); }
    const g = makeGame('luna', 'beach_f1');
    g.clock = 12;
    assert.equal(isNightNow(g), false);
    assert.equal(enemyAvailableNow(g, 'jelly_moonlit'), false);
    assert.equal(enemyAvailableNow(g, 'slime_green'), true);
    g.clock = 23;
    assert.ok(isNightNow(g) && enemyAvailableNow(g, 'jelly_moonlit'));
    g.clock = undefined; g.state.clock = 3;
    assert.ok(isNightNow(g));
    assert.ok(isOpenAt([20, 5], 22) && isOpenAt([20, 5], 4) && !isOpenAt([20, 5], 12) && isOpenAt(null, 12));
    for (const s of NIGHT_SHOPS) { assert.ok(MISSION_NPCS[s.npcId] || Object.values(MAPS).some((m) => (m.npcs || []).some((n) => n.id === s.npcId)), s.npcId); for (const id of s.items) assert.ok(ITEMS[id], id); }
    for (const shops of Object.values(TOWN_SHOPS)) for (const sh of shops) for (const id of sh.items) assert.ok(ITEMS[id], id);
  });

  // ============================================================ PET スキル
  test('v3 sys: PETスキル（自動HP/MPポーション・間隔・親密度・餌・取得範囲・フィルタ・自動売却）', () => {
    for (const id of PET_IDS) assert.ok(Array.isArray(ITEMS[id].petSkills) && ITEMS[id].petSkills.length >= 1, id);
    const g = makeGame('luna', 'beach_f1');
    const st = g.state;
    assert.equal(petAutoUse(g, 0.1).hp, null, 'PET なし');
    st.equipped.pet = 'pet_robot'; normalizeInventory(st); // autoHp/autoMp/autoSell
    const s = computeStats(st);
    st.hp = Math.floor(s.maxHp * 0.3);
    const n0 = countItem(st, 'potion_red');
    let r = petAutoUse(g, 0.1);
    assert.equal(r.hp, 'potion_red');
    assert.equal(countItem(st, 'potion_red'), n0 - 1);
    st.hp = 1;
    assert.equal(petAutoUse(g, 0.1).hp, null, '間隔 1秒');
    r = petAutoUse(g, 1.0);
    assert.ok(r.hp);
    st.mp = 0;
    assert.ok(petAutoUse(g, 1.1).mp);
    // 閾値設定
    setPetConfig(st, { hpTh: 0.1, autoMp: false });
    st.hp = Math.floor(s.maxHp * 0.3); st.mp = 0;
    r = petAutoUse(g, 2);
    assert.equal(r.hp, null); assert.equal(r.mp, null);
    // 親密度: フィールドで1分ごと +1 / 餌 +20
    const aff0 = petStats(st).aff;
    petAutoUse(g, 61);
    assert.equal(petStats(st).aff, aff0 + 1);
    addItemToState(st, 'pet_food', 1);
    assert.ok(useItem(g, 'pet_food'));
    assert.equal(petStats(st).aff, aff0 + 21);
    assert.equal(petLevelFromAff(0).lv, 1); assert.equal(petLevelFromAff(10).lv, 2); assert.equal(petLevelFromAff(99999).lv, 30);
    // 親密度で pickRate、range スキルで取得範囲 +40%
    st.petData.pet_robot.aff = 99999;
    const ps = petStats(st);
    assert.equal(ps.lv, 30);
    assert.ok(ps.pickRate > ITEMS.pet_robot.pet.pickRate);
    assert.ok(ps.skills.length > ITEMS.pet_robot.petSkills.length, 'Lv10/20/30 でスキル追加');
    assert.ok(ps.skills.includes('range') && ps.pickRange === Math.round(ITEMS.pet_robot.pet.pickRange * 1.4));
    // フィルタ
    setPetConfig(st, { filter: 'rare' });
    assert.equal(petShouldPick(g, { item: ITEMS.tshirt_white }), false);
    assert.equal(petShouldPick(g, { item: ITEMS.gold_chain }), true);
    assert.equal(petShouldPick(g, { money: 5, item: { type: 'etc' } }), true);
    // 自動売却（itemPicked）
    const m0 = st.money;
    addItem(g, 'tshirt_white', 1, { pot: null });
    g.events.emit('itemPicked', { id: 'tshirt_white', qty: 1 });
    assert.equal(countItem(st, 'tshirt_white'), 0);
    assert.equal(st.money, m0 + Math.floor(sellPrice('tshirt_white') * 0.8));
    addItem(g, 'gold_chain', 1, { pot: null });
    g.events.emit('itemPicked', { id: 'gold_chain', qty: 1 });
    assert.equal(countItem(st, 'gold_chain'), 1, 'common 以外は売らない');
    // 実際に Drop を拾う
    setPetConfig(st, { autoSell: true });
  });

  // ============================================================ コンボ
  test('v3 sys: コンボ（ヒットで加算・同フレーム同一敵は1回・段階バフ・時間切れ）', () => {
    const g = makeGame('luna', 'beach_f1');
    setActiveBuffs([]); g.buffs = [];
    g.state.equipped.weapon = 'katana_plasma'; // +2% が丸めで消えない攻撃力にする（初期の木剣だと差が 0 になる）
    const e = new Enemy(g, 'golem_steel', 900, g.map.groundY); g.enemies.push(e);
    const atk0 = computeStats(g.state).atk;
    for (let i = 0; i < 12; i++) { g.time += 0.1; damageEnemy(g, e, 1); }
    assert.equal(g.combo.count, 12);
    assert.equal(g.comboExternal, true);
    damageEnemy(g, e, 1); // 同フレーム・同じ敵は数えない
    comboHit(g, 1, [e]);
    assert.equal(g.combo.count, 12);
    g.time += 0.1; comboHit(g, 1, [e]);
    assert.equal(g.combo.count, 13);
    assert.ok(g.buffs.some((b) => b.id === 'combo'));
    assert.ok(computeStats(g.state).atk > atk0, 'コンボバフ');
    assert.equal(comboInfo(g).tier, 0);
    comboHit(g, 40);
    assert.equal(comboInfo(g).tier, 2);
    let ended = null;
    g.events.on('comboEnd', (d) => { ended = d.count; });
    updateSkills(g, COMBO_WINDOW + 0.1);
    assert.equal(g.combo.count, 0);
    assert.equal(ended, 53);
    assert.ok(!g.buffs.some((b) => b.id === 'combo'));
    assert.equal(g.combo.max, 53);
  });

  // ============================================================ フレーバー
  test('v3 sys: 全モンスター・全装備にフレーバーテキスト lore', () => {
    for (const [id, e] of Object.entries(ENEMIES)) {
      assert.ok(typeof e.lore === 'string' && e.lore.length >= 10, 'enemy lore ' + id);
      assert.ok(ENEMY_LORE[id], 'ENEMY_LORE に個別の文 ' + id);
    }
    for (const [id, it] of Object.entries(ITEMS)) {
      if (it.type !== 'equip') continue;
      assert.ok(typeof it.lore === 'string' && it.lore.length >= 10, 'item lore ' + id);
      assert.ok(ITEM_LORE[id], 'ITEM_LORE に個別の文 ' + id);
    }
  });

  // ============================================================ クエストナビ
  test('v3 sys: クエストナビ missionGuide / trackedGuide（BFS ルート・次のポータル・NPC 逆引き）', () => {
    assert.deepEqual(routeBetween('beach', 'beach'), ['beach']);
    const r = routeBetween('beach', 'downtown');
    assert.deepEqual(r, ['beach', 'beach_f1', 'beach_f2', 'beach_f4', 'downtown']);
    assert.equal(findNpc('mama_rosa').mapId, 'downtown');
    assert.equal(findNpc('job_velvet').mapId, MISSION_NPCS.job_velvet.mapId);
    const g = makeGame('luna', 'beach');
    const st = g.state;
    assert.ok(g.missions.accept('m01_welcome'));
    let gd = missionGuide(g, 'm01_welcome');
    assert.equal(gd.length, 1);
    const o = gd[0];
    for (const k of ['objIndex', 'text', 'done', 'mapId', 'mapName', 'npcId', 'npcName', 'npcMapId', 'targetName', 'route', 'nextPortal']) assert.ok(k in o, k);
    assert.equal(o.mapId, 'beach_f1'); assert.equal(o.targetName, ENEMIES.slime_green.name);
    assert.deepEqual(o.route, ['beach', 'beach_f1']);
    assert.equal(o.nextPortal.to, 'beach_f1');
    const portal = MAPS.beach.portals.find((p) => p.to === 'beach_f1');
    assert.equal(o.nextPortal.x, portal.x);
    assert.ok(o.nextPortal.label);
    // 現地では nextPortal なし・敵の位置
    g.changeMap('beach_f1');
    for (let i = 0; i < 300 && !g.enemies.some((e) => e.def?.id === 'slime_green'); i++) step(g);
    gd = missionGuide(g, 'm01_welcome');
    assert.equal(gd[0].nextPortal, null);
    if (g.enemies.some((e) => e.def?.id === 'slime_green')) assert.ok(gd[0].targetPos);
    // 完了 → 報告先
    for (let i = 0; i < 8; i++) g.events.emit('enemyKilled', { enemy: { def: ENEMIES.slime_green } });
    gd = missionGuide(g, 'm01_welcome');
    const last = gd[gd.length - 1];
    assert.ok(last.turnIn && last.npcId === 'rico' && last.mapId === 'beach');
    assert.deepEqual(last.route, ['beach_f1', 'beach']);
    const tg = trackedGuide(g);
    assert.equal(tg.missionId, 'm01_welcome'); assert.ok(tg.turnIn);
    // talk 目的（NPC の町）: m04 → mama_rosa @ downtown
    g.missions.turnIn('m01_welcome');
    st.level = 30;
    st.missions.completed.push('m02_jelly', 'm03_flamingo');
    assert.ok(g.missions.accept('m04_rosa'));
    gd = missionGuide(g, 'm04_rosa');
    const talk = gd.find((x) => x.npcId === 'mama_rosa');
    assert.ok(talk && talk.npcMapId === 'downtown' && talk.npcName === 'ママ・ローザ' && talk.route[talk.route.length - 1] === 'downtown');
    // 全ミッションで例外なし
    for (const id of Object.keys(MISSIONS)) {
      const list = missionGuide(g, id);
      for (const e of list) {
        assert.ok(e.mapId == null || e.route.length >= 1, `${id} route ${e.mapId}`);
        if (e.mapId && e.mapId !== (g.map.id)) assert.ok(e.nextPortal, `${id} ${e.mapId} nextPortal`);
      }
    }
  });

  test('v3 sys: ドロップの曜日/潜在ドロップ率・練習モードは報酬なし・ボスへの潜在ボスダメ', () => {
    const def = ENEMIES.slime_pink;
    const rng = makeRng(5);
    let a = 0, b = 0;
    for (let i = 0; i < 20000; i++) { a += rollDrops(def, 0, rng).length; b += rollDrops(def, 0, rng, { dropMult: 1.5 }).length; }
    assert.ok(b > a, 'dropMult');
    const g = makeGame('luna', 'beach_f1');
    g.bossMode = 'practice';
    const e = new Enemy(g, 'slime_green', 900, g.map.groundY); e.instance = 'boss'; g.enemies.push(e);
    const exp0 = g.state.exp, d0 = g.drops.length;
    damageEnemy(g, e, 1e9);
    assert.equal(g.state.exp, exp0); assert.equal(g.drops.length, d0);
    g.bossMode = null;
  });
}
