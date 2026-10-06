// v5: 4次転職より後の難しさ・第2ワールドの壁（ネオン適性）・ボスの大当たり装備（docs/SPEC_V5.md・docs/BALANCE_V5.md）
// 表は node tools/sim_balance.mjs --v5 で見られる。数値を変えて目安から外れたら、ここが落ちる。
import assert from 'node:assert/strict';
import { ENEMIES } from '../src/data/enemies.js';
import { V5_BOSS_HP, V5_DROP_CHANCE, V5_BOSS_TIME_X } from '../src/data/enemies.js';
import { ITEMS, V5_BOSS_GEAR, V5_GEAR_IDS } from '../src/data/items.js';
import { FORCE_REQ, forceReqOf } from '../src/data/forceReq.js';
import { rollDrops } from '../src/systems/loot.js';
import { bossTimeLimit } from '../src/systems/bosses.js';
import { MAPS } from '../src/world/maps.js';
import {
  BRANCHES, TIER_IDS, V5_BOSS_IDS, V5_BOSS_TIME, W2_FIELDS, forceMods, neonCoreCost, coreCostFull, bossRowTier, mobRowsTier,
  regionProgress, bossForceReq,
} from '../tools/sim_balance.mjs';

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

export default function register({ test }) {
  test('balance v5: forceMods（SPEC_V5 の表・間は直線）とコアの費用（Lv1 ≒ 10 個・1 地域 Lv20 まで 1,000〜1,500 個）', () => {
    assert.deepEqual(forceMods(0, 0), { dealt: 1, taken: 1 });
    assert.deepEqual(forceMods(500, 0), { dealt: 1, taken: 1 });
    for (const [r, d, t] of [[0, 0.1, 3], [0.5, 0.4, 2], [1, 1, 1], [1.5, 1.5, 0.7], [3, 1.5, 0.7]]) {
      const m = forceMods(r * 100, 100);
      assert.ok(near(m.dealt, d) && near(m.taken, t), `r=${r}: ${JSON.stringify(m)}`);
    }
    const m = forceMods(75, 100);
    assert.ok(near(m.dealt, 0.7) && near(m.taken, 1.5), 'r=0.75 は 0.5 と 1 の間');
    assert.ok(neonCoreCost(1) >= 8 && neonCoreCost(1) <= 12, `Lv1 ${neonCoreCost(1)}`);
    for (let n = 2; n <= 20; n++) assert.ok(neonCoreCost(n) > neonCoreCost(n - 1), 'Lv が上がるほど高い');
    assert.ok(coreCostFull() >= 1000 && coreCostFull() <= 1500, `Lv20 まで ${coreCostFull()}`);
  });

  test('balance v5: FORCE_REQ の段々（最初の 2 マップ 0・アーク奥 30〜60・ワイルド 60〜120・アビス 120〜180・ゼニス 180〜240・町 0）', () => {
    for (const id of W2_FIELDS) assert.ok(id in FORCE_REQ && MAPS[id], id + ' がある');
    assert.equal(FORCE_REQ.w2_arkcity_f1, 0);
    assert.equal(FORCE_REQ.w2_arkcity_f2, 0);
    for (const t of ['w2_arkcity', 'w2_cyberwild', 'w2_abyss', 'w2_zenith']) assert.equal(forceReqOf(t), 0, t + ' 町は 0');
    const range = { arkcity: [30, 60], cyberwild: [60, 120], abyss: [120, 180], zenith: [180, 240] };
    let prev = 0;
    for (const id of W2_FIELDS) {
      const R = FORCE_REQ[id];
      assert.ok(R >= prev, `${id}: 進む順に上がる（${prev} → ${R}）`);
      prev = R;
      if (/_f[12]$/.test(id) && id.includes('arkcity')) continue;
      const [lo, hi] = range[id.split('_')[1]];
      assert.ok(R >= lo && R <= hi, `${id}: ${R}（${lo}〜${hi}）`);
    }
    // ボス部屋は、ボスのいるフィールドと同じ
    for (const id of V5_BOSS_IDS.filter((b) => ENEMIES[b].world === 2)) {
      const room = 'boss_' + id.replace(/^boss_/, '');
      assert.ok(MAPS[room]?.instance === 'boss', room);
      assert.equal(FORCE_REQ[room], FORCE_REQ[ENEMIES[id].habitats[0]], room);
    }
    // 第1ワールド・塔・闘技場は 0
    for (const id of ['space_f4', 'tower', 'arena', 'beach']) assert.equal(forceReqOf(id), 0, id);
  });

  test('balance v5: 4次転職より後のボスにかかる時間（ふつう 約60分・しっかり 30〜40分・強化しまくり 約20分）・攻撃は 1 発で倒されない', () => {
    const loose = { normal: [45 * 60, 75 * 60], solid: [25 * 60, 45 * 60], max: [12 * 60, 30 * 60] };
    for (const id of V5_BOSS_IDS) {
      for (const t of TIER_IDS) {
        const rs = BRANCHES.map((b) => bossRowTier(ENEMIES[id], b, t));
        const a = avg(rs.map((r) => r.sec));
        const [lo, hi] = V5_BOSS_TIME[t];
        assert.ok(a >= lo && a <= hi, `${id} ${t}: 平均 ${(a / 60).toFixed(1)} 分`);
        for (const r of rs) assert.ok(r.sec >= loose[t][0] && r.sec <= loose[t][1], `${id} ${t} ${r.branch}: ${(r.sec / 60).toFixed(1)} 分`);
        if (t === 'normal') for (const r of rs) {
          assert.ok(r.taken.pct <= 0.35 && r.taken.hitsToDie >= 3, `${id} ${r.branch}: 体当たり ${(r.taken.pct * 100).toFixed(1)}%`);
          if (r.shot) assert.ok(r.shot.pct <= 0.35, `${id} ${r.branch}: 弾 ${(r.shot.pct * 100).toFixed(1)}%`);
        }
      }
      // ボス部屋の制限時間は、ふつうの時間より長い
      assert.ok(bossTimeLimit(id, 'normal') >= 80 * 60, `${id} 制限 ${bossTimeLimit(id, 'normal')} 秒`);
      assert.equal(ENEMIES[id].bossTimeX, V5_BOSS_TIME_X);
    }
    // 第2ワールドのボスは、適性が足りないと（F = 0）倒せない（ふつうの 5 倍以上かかる）
    for (const id of V5_BOSS_IDS.filter((b) => bossForceReq(ENEMIES[b]) > 0)) {
      const a0 = avg(BRANCHES.map((b) => bossRowTier(ENEMIES[id], b, 'normal', { F: 0 }).sec));
      const a1 = avg(BRANCHES.map((b) => bossRowTier(ENEMIES[id], b, 'normal').sec));
      assert.ok(a0 >= a1 * 5, `${id}: 適性 0 で ${(a0 / 60).toFixed(0)} 分（ふつう ${(a1 / 60).toFixed(0)} 分）`);
    }
    // 第1ワールドの Lv100 未満のボスは今のまま
    assert.equal(ENEMIES.boss_mecha.hp, 31800);
    assert.equal(ENEMIES.boss_don.hp, 55600);
    assert.ok(!ENEMIES.boss_don.bossTimeX && bossTimeLimit('boss_don', 'normal') === 600);
    for (const [id, hp] of Object.entries(V5_BOSS_HP)) assert.equal(ENEMIES[id].hp, hp, id);
  });

  test('balance v5: 第2ワールドの雑魚は ふつうでも主力スキル 3〜6 発（適性が足りていれば）・足りないと倒せない', () => {
    for (const map of W2_FIELDS) {
      const rows = mobRowsTier(map, 'normal');
      assert.ok(rows.length, map + ' に雑魚');
      for (const m of rows.filter((x) => !x.strong)) {
        assert.ok(m.hitsAvg >= 3 && m.hitsAvg <= 6, `${map} ${m.id}: 平均 ${m.hitsAvg.toFixed(2)} 発`);
        assert.ok(m.hitsMin >= 2.5 && m.hitsMax <= 8, `${map} ${m.id}: ${m.hitsMin.toFixed(1)}〜${m.hitsMax.toFixed(1)} 発`);
      }
      for (const m of rows.filter((x) => x.strong)) assert.ok(m.hitsAvg <= 12, `${map} ${m.id}（強い）: ${m.hitsAvg.toFixed(1)} 発`);
      if ((FORCE_REQ[map] || 0) > 0) {
        for (const m of mobRowsTier(map, 'normal', { F: 0 })) assert.ok(m.hitsAvg >= 25, `${map} ${m.id}: 適性 0 で ${m.hitsAvg.toFixed(1)} 発（倒せない）`);
      }
    }
  });

  test('balance v5: フラグメントでコアを育てる速さ（1 地域を数時間〜10 時間・Lv を上げながら落ちる数と要る数が近い）', () => {
    for (const r of regionProgress('normal')) {
      assert.ok(r.needHours >= 2 && r.needHours <= 12, `${r.region}: 要る数を集める ${r.needHours.toFixed(1)} 時間`);
      assert.ok(r.gained >= r.need * 0.6 && r.gained <= r.need * 2, `${r.region}: 落ちる ${Math.round(r.gained)} / 要る ${r.need}`);
    }
  });

  test('balance v5: ボスの大当たり（mythic 3%）・当たり（legendary 10%）の装備と抽選', () => {
    const v5Bosses = ['boss_alien', 'boss_ark_titan', 'boss_wild_kernel', 'boss_abyss_queen', 'boss_zenith_true'];
    assert.deepEqual(Object.keys(V5_BOSS_GEAR).sort(), [...v5Bosses].sort());
    assert.equal(V5_DROP_CHANCE.jackpot, 0.03);
    assert.equal(V5_DROP_CHANCE.hit, 0.1);
    for (const id of V5_GEAR_IDS) {
      const it = ITEMS[id];
      assert.ok(it && it.type === 'equip' && it.bossV5 && it.lore, id);
      assert.ok(!it.questSet && !it.cosmetic, id);
    }
    for (const bid of v5Bosses) {
      const g = V5_BOSS_GEAR[bid];
      const e = ENEMIES[bid];
      for (const [tier, rarity] of [['jackpot', 'mythic'], ['hit', 'legendary']]) {
        const ids = g[tier];
        assert.equal(ids.length, 11, `${bid} ${tier}: 防具 5 ＋ 武器 6`);
        const its = ids.map((x) => ITEMS[x]);
        for (const it of its) assert.ok(it.rarity === rarity && it.reqLevel === g.lv && it.bossOf === bid, it.id);
        assert.deepEqual([...new Set(its.filter((x) => x.slot !== 'weapon').map((x) => x.slot))].sort(), ['accessory', 'bottom', 'hat', 'shoes', 'top']);
        const w = its.filter((x) => x.slot === 'weapon');
        assert.equal(w.length, 6, '6 系統の武器');
        assert.deepEqual([...new Set(w.map((x) => x.weaponType))].sort(), ['gun', 'magic', 'melee']);
        const d = e.drops.filter((x) => x.pool && x.v5 === tier);
        assert.equal(d.length, 1, `${bid} の ${tier} の抽選は 1 回`);
        assert.deepEqual(d[0].pool, ids);
        assert.ok(ITEMS[d[0].id], '代表の ID は図鑑に出せる物');
        assert.equal(d[0].chance, V5_DROP_CHANCE[tier]);
      }
      // 強さ: 大当たりは同じ帯（必要Lv ≦ ボスの Lv、同じ部位・武器種）で一番強い。当たりは qset・神話級以外の一番強い物以上
      for (const id of g.jackpot) {
        const it = ITEMS[id];
        const k = it.slot === 'weapon' ? 'atk' : 'def';
        const pool = Object.values(ITEMS).filter((x) => x.type === 'equip' && x.slot === it.slot && !x.cosmetic && !x.bossV5 &&
          x.reqLevel <= it.reqLevel && (it.slot !== 'weapon' || x.weaponType === it.weaponType));
        const best = Math.max(0, ...pool.map((x) => x.stats[k]));
        assert.ok(it.stats[k] >= best, `${id}: ${k} ${it.stats[k]} ≧ 同じ帯で一番強い ${best}`);
        const hit = ITEMS[id.replace('_jackpot_', '_hit_')];
        assert.ok(it.stats[k] > hit.stats[k], `${id} は当たりより強い`);
      }
      for (const id of g.hit) {
        const it = ITEMS[id];
        const k = it.slot === 'weapon' ? 'atk' : 'def';
        const pool = Object.values(ITEMS).filter((x) => x.type === 'equip' && x.slot === it.slot && !x.cosmetic && !x.bossV5 && !x.questSet && x.rarity !== 'mythic' &&
          x.reqLevel <= it.reqLevel && (it.slot !== 'weapon' || x.weaponType === it.weaponType));
        const best = Math.max(0, ...pool.map((x) => x.stats[k]));
        assert.ok(it.stats[k] >= best * 0.95, `${id}: ${k} ${it.stats[k]} ≒ 店・雑魚の一番強い物 ${best} 以上`);
      }
    }
    // 第1ワールドの Lv100 未満のボスには付けない
    for (const id of ['boss_king_slime', 'boss_mecha', 'boss_don']) assert.ok(!ENEMIES[id].drops.some((d) => d.pool), id);
    // 抽選: 1 回倒すごとに大当たり・当たりをそれぞれ 1 回（LUK の補正なし）。乱数を固定して数える
    let seed = 12345;
    const rng = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
    const N = 20000;
    const cnt = { jackpot: 0, hit: 0 };
    const jp = new Set(V5_BOSS_GEAR.boss_ark_titan.jackpot), ht = new Set(V5_BOSS_GEAR.boss_ark_titan.hit);
    const seen = new Set();
    for (let i = 0; i < N; i++) {
      const out = rollDrops(ENEMIES.boss_ark_titan, 999, rng);
      const j = out.filter((o) => jp.has(o.id)), h = out.filter((o) => ht.has(o.id));
      assert.ok(j.length <= 1 && h.length <= 1, '1 回の撃破で、それぞれ多くても 1 つ');
      cnt.jackpot += j.length; cnt.hit += h.length;
      for (const o of j) seen.add(o.id);
    }
    assert.ok(Math.abs(cnt.jackpot / N - 0.03) < 0.006, `大当たり ${(cnt.jackpot / N * 100).toFixed(2)}%`);
    assert.ok(Math.abs(cnt.hit / N - 0.1) < 0.01, `当たり ${(cnt.hit / N * 100).toFixed(2)}%`);
    assert.equal(seen.size, 11, '部位・武器種はランダム（全部出る）');
  });
}
