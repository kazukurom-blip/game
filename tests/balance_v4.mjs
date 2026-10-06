// v4: 5次転職・Lv100〜200 の強さの釣り合い（tools/sim_balance.mjs のシミュレーションの要点。docs/BALANCE_V4.md）
// 数値を変えて釣り合いが崩れたら、ここが落ちる。表は node tools/sim_balance.mjs で見られる。
import assert from 'node:assert/strict';
import { SKILLS } from '../src/data/skills.js';
import { JOBS } from '../src/data/jobs.js';
import { ENEMIES } from '../src/data/enemies.js';
import { Enemy } from '../src/entities/enemy.js';
import { useSkill, onBasicAttack, resetCooldowns, flushSkillHits } from '../src/systems/skills.js';
import {
  BRANCHES, makeChar, dpsOf, normalEnemy, mainSkillOf, useDamage, takenOf, killsPerLevelAt, forceReqAtLevel,
} from '../tools/sim_balance.mjs';

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return (b[(b.length - 1) >> 1] + b[b.length >> 1]) / 2; };

export default function register({ test }) {
  // キャラは作るのに少し時間がかかるので、使い回す
  const cache = new Map();
  const ch = (b, L) => { const k = b + L; if (!cache.has(k)) cache.set(k, makeChar(b, L)); return cache.get(k); };
  // v5: 雑魚の発数・画面全体攻撃は、育ち方「ふつう」（★5・レアの潜在・その場の適性。docs/BALANCE_V5.md）で見る
  const chN = (b, L) => { const k = 'n' + b + L; if (!cache.has(k)) cache.set(k, makeChar(b, L, { tier: 'normal', R: forceReqAtLevel(L) })); return cache.get(k); };

  test('balance v4: 6 系統の火力の差は ±20% 以内（Lv120〜200 のふつうの敵・Lv125〜200 のボス。召喚獣込み）', () => {
    for (const L of [120, 125, 150, 180, 200]) {
      const e = normalEnemy(L);
      const v = BRANCHES.map((b) => dpsOf(ch(b, L), e).dps);
      const a = avg(v);
      for (let i = 0; i < v.length; i++) assert.ok(v[i] / a >= 0.8 && v[i] / a <= 1.2, `Lv${L} ${BRANCHES[i]} ${(v[i] / a).toFixed(2)}`);
      if (L < 125) continue;
      const boss = { hp: 1e9, def: Math.round(e.def * 1.5) };
      const w = BRANCHES.map((b) => dpsOf(ch(b, L), boss, { boss: true, mode: 'avg', ult: true }).dps);
      const aw = avg(w);
      for (let i = 0; i < w.length; i++) assert.ok(w[i] / aw >= 0.8 && w[i] / aw <= 1.2, `ボス Lv${L} ${BRANCHES[i]} ${(w[i] / aw).toFixed(2)}`);
    }
  });

  // v5 で目安が変わった（4次転職より後は難しく）: 2〜4 発 → 育ち方「ふつう」で 3〜6 発（tests/balance_v5.mjs も見る）
  test('balance v4→v5: ふつうの敵は 5次の主力スキル 3〜6 発（育ち方「ふつう」・系統の平均）・どの系統も 2.5〜7 発', () => {
    for (const L of [120, 135, 150, 165, 180, 200]) {
      const e = normalEnemy(L);
      const hits = BRANCHES.map((b) => e.hp / useDamage(chN(b, L), mainSkillOf(chN(b, L)), e));
      const a = avg(hits);
      assert.ok(a >= 3 && a <= 6, `Lv${L} 平均 ${a.toFixed(2)} 発`);
      for (let i = 0; i < hits.length; i++) assert.ok(hits[i] >= 2.5 && hits[i] <= 7, `Lv${L} ${BRANCHES[i]} ${hits[i].toFixed(2)} 発`);
      for (const b of BRANCHES) assert.equal(mainSkillOf(ch(b, L)).reqJob, ch(b, L).job.id, `Lv${L} ${b}: 主力は 5次のスキル`);
    }
  });

  // v5 で敵が固くなった分、一掃の倍率の目安を下げた（ふつうの敵 2 倍 → 1.5 倍、強い敵 1 倍 → 0.75 倍。育ち方「ふつう」）
  test('balance v4→v5: 画面全体攻撃は ふつうの敵を一掃でき（強い敵もほぼ）、1 体への威力は ふだんの火力の 6〜10 秒分', () => {
    for (const L of [160, 180, 200]) {
      for (const b of BRANCHES) {
        const c = chN(b, L);
        const e = normalEnemy(L), el = normalEnemy(L, 2, true);
        const ult = c.job.skills.map((id) => SKILLS[id]).find((s) => s.screen);
        assert.equal(c.state.skills[ult.id], ult.maxLevel, `${b} Lv${L} 画面全体攻撃は最大 Lv`);
        const d = useDamage(c, ult, e);
        assert.ok(d >= e.hp * 1.5, `${b} Lv${L}: ふつうの敵 ${(d / e.hp).toFixed(2)} 倍`);
        assert.ok(useDamage(c, ult, el) >= el.hp * 0.75, `${b} Lv${L}: 強い敵 ${(useDamage(c, ult, el) / el.hp).toFixed(2)} 倍`);
        const sec = d / dpsOf(c, e).dps;
        assert.ok(sec >= 6 && sec <= 10, `${b} Lv${L}: ${sec.toFixed(1)} 秒分`);
      }
    }
  });

  test('balance v4: 5次の主力スキルは 4次までのどのスキルより 1 秒あたりの威力が大きい（Lv150〜）', () => {
    for (const L of [150, 200]) {
      for (const b of BRANCHES) {
        const c = ch(b, L);
        const d = dpsOf(c, normalEnemy(L));
        const main = mainSkillOf(c);
        const mine = d.opt.find((o) => o.id === main.id);
        for (const o of d.opt) if (SKILLS[o.id].reqJob !== c.job.id) assert.ok(mine.rate > o.rate, `${b} Lv${L}: ${main.id} ${mine.rate.toFixed(0)} > ${o.id} ${o.rate.toFixed(0)}`);
      }
    }
  });

  test('balance v4: 適正 Lv の敵の体当たりは 打たれ弱い系統で最大HPの 8〜16%・6 系統のまん中で 3% 以上', () => {
    for (const L of [120, 150, 180, 200]) {
      const e = normalEnemy(L);
      const p = BRANCHES.map((b) => takenOf(ch(b, L), e.atk).pct);
      const mx = Math.max(...p);
      assert.ok(mx >= 0.08 && mx <= 0.16, `Lv${L} 最大 ${(mx * 100).toFixed(1)}%`);
      assert.ok(median(p) >= 0.03, `Lv${L} まん中 ${(median(p) * 100).toFixed(1)}%`);
    }
  });

  // ボスにかかる時間（v4: 1〜3 分）は v5 で目安が変わった（ふつう 約60分・しっかり 30〜40分・強化しまくり 約20分）→ tests/balance_v5.mjs

  test('balance v4: 1 Lv に倒す数（Lv100〜109: 150〜300 体・Lv190〜199: 500〜900 体）', () => {
    for (let L = 100; L < 110; L++) { const k = killsPerLevelAt(L); assert.ok(k >= 150 && k <= 300, `Lv${L} ${k.toFixed(0)}`); }
    for (let L = 190; L < 200; L++) { const k = killsPerLevelAt(L); assert.ok(k >= 500 && k <= 900, `Lv${L} ${k.toFixed(0)}`); }
  });

  test('balance v4: 5次のスキルの SP の上限（Lv155 ごろに使い切る）', () => {
    for (const j of Object.values(JOBS).filter((x) => x.tier === 5)) {
      const total = j.skills.reduce((s, id) => s + SKILLS[id].maxLevel, 0);
      assert.ok(total >= 100 && total <= 130, `${j.id} 合計 ${total}`);
      const ult = j.skills.map((id) => SKILLS[id]).find((s) => s.screen);
      assert.ok(ult.cooldown(ult.maxLevel) >= 60, ult.id + ' 最大 Lv でも CT 60 秒以上');
    }
  });
}

/** エンジン側の確認（makeGame が要るもの） */
export function registerEngine({ test, makeGame }) {
  test('balance v4: 1 ヒットの弾（レールスナイプ）も当たった時に計算する（敵の防御が効く）', () => {
    const g = makeGame('luna', 'space_f4');
    resetCooldowns(); g.enemies.length = 0; g.projectiles.length = 0;
    const st = g.state; st.mp = 1e6;
    st.level = 30; st.job = { id: 'luna_sharpshooter', tier: 2, history: [] };
    st.skills.lj_gun_rail_snipe = 1;
    assert.ok(useSkill(g, 'lj_gun_rail_snipe'));
    flushSkillHits();
    const pr = g.projectiles.find((x) => x.owner === 'player');
    assert.ok(pr, '弾が出る');
    assert.equal(pr.dmg, null, 'ダメージは先に決めない');
    assert.ok(pr.atk > 0 && pr.mult > 0);
    const rnd = Math.random;
    try {
      Math.random = () => 0.99; // 会心なし・乱数幅は固定
      const hit = (def) => {
        const e = new Enemy(g, 'robot_xeno', pr.x, pr.y); e.spawnT = 0; e.hp = e.maxHp = 1e9;
        e.def = { ...e.def, def };
        e.y = pr.y + (e.h || 40) / 2;
        g.enemies.length = 0; g.enemies.push(e);
        pr.hits = new Set(); pr.pierce = 99; pr.dead = false; pr.remove = false;
        pr.update(0.0001);
        return 1e9 - e.hp;
      };
      const d0 = hit(0), d200 = hit(200);
      assert.ok(d0 > 0, '当たる');
      assert.ok(Math.abs(d200 / d0 - 100 / 400) < 0.02, `防御 200 で 1/4（${(d200 / d0).toFixed(3)}）`);
    } finally { Math.random = rnd; }
  });

  test('balance v4: 通常攻撃強化の追撃は interval 秒に 1 回まで', () => {
    const g = makeGame('luna', 'space_f4');
    resetCooldowns(); g.enemies.length = 0;
    const st = g.state; st.mp = 1e6;
    st.level = 120; st.job = { id: 'luna_dimension_desperado', tier: 5, history: [] };
    st.skills.lj_gun_desperado_mode = 1;
    const p = g.player; p.facing = 1;
    const e = new Enemy(g, 'robot_xeno', p.x + 200, p.y); e.spawnT = 0; e.hp = e.maxHp = 1e9; g.enemies.push(e);
    assert.ok(useSkill(g, 'lj_gun_desperado_mode'));
    const em = SKILLS.lj_gun_desperado_mode.buff(1).empower;
    assert.ok(em.interval > 0);
    g.time = 10;
    assert.equal(onBasicAttack(g), true, '1 回目は出る');
    g.time = 10 + em.interval * 0.5;
    assert.equal(onBasicAttack(g), false, 'interval の間は出ない');
    g.time = 10 + em.interval + 0.01;
    assert.equal(onBasicAttack(g), true, 'interval の後は出る');
  });
}
