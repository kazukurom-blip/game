// デバッグ担当 v3: 通し検証で見つけて直したバグの回帰テスト
//  - （乗り物の廃止後）E（interact）は会話だけ。町に車は置かれない
//  - PET の取得範囲・速度は petStats（親密度・range スキル込み）を使う
//  - 図鑑ボーナスのキャッシュ（JSON.stringify をやめた）が正しく更新される
//  - 実績の判定まとめ（高頻度イベント）でも取りこぼさない
//  - 夜限定の敵は昼に通常出現しない
//  - （見た目QA）プレイヤーのオーラは職の段階（auraTier=1〜4次）で強くなる
import assert from 'node:assert/strict';
import { ENEMIES } from '../src/data/enemies.js';
import { MAPS } from '../src/world/maps.js';
import { resolveSpawns } from '../src/entities/spawner.js';
import { petStats, petData } from '../src/systems/petSkills.js';
import { bookBonus } from '../src/systems/book.js';
import { attachAchievements, achievementList } from '../src/systems/achievements.js';
import { syncPet } from '../src/entities/pet.js';
import { sysReady } from '../src/world/sys.js';
import { advanceJob } from '../src/systems/jobs.js';
import { JOBS } from '../src/data/jobs.js';

export default function register({ test, makeGame, step }) {
  test('debug v3: 乗り物は廃止 — 町に車がなく、E（interact）と V（talk）はどちらも会話', () => {
    const g = makeGame('jin', 'beach');
    assert.equal(g.vehicles.length, 0, 'beach に車がある');
    const p = g.player;
    const npc = g.npcs[0];
    p.x = npc.x - 5; p.y = npc.y; p.vx = 0; p.vy = 0;
    g.uiOpened.length = 0;
    p.interact();
    assert.ok(!p.inVehicle);
    assert.ok(g.uiOpened.some((o) => o.name === 'dialog' || o.name === 'content'), 'E で会話窓');
    g.uiOpened.length = 0;
    assert.ok(p.talk(), 'V は会話');
    assert.ok(g.uiOpened.some((o) => o.name === 'dialog' || o.name === 'content'), 'V で会話窓');
    assert.ok(!p.inVehicle);
  });

  test('debug v3: PET の取得範囲・速度は petStats を使う（親密度 Lv・range スキル）', async () => {
    await sysReady;
    const g = makeGame('luna', 'beach_f1');
    g.state.equipped.pet = 'pet_cat';
    const d = petData(g.state, 'pet_cat');
    d.aff = 99999; // Lv30（スキル枠が増えて range が付く）
    const ps = petStats(g.state, 'pet_cat');
    const pet = syncPet(g);
    for (let i = 0; i < 40; i++) step(g);
    assert.ok(pet && g.pet === pet);
    assert.equal(pet.pickRange, ps.pickRange, 'pickRange = petStats');
    assert.ok(Math.abs(pet.pickRate - ps.pickRate) < 1e-9, 'pickRate = petStats');
    assert.ok(ps.pickRate > 1, '親密度で速度アップ');
  });

  test('debug v3: 図鑑ボーナスのキャッシュが登録・ランク変化で更新される', () => {
    const st = { book: {} };
    const ids = Object.keys(ENEMIES).filter((id) => !ENEMIES[id].civilian && !ENEMIES[id].isCop).slice(0, 8);
    const b0 = bookBonus(st);
    st.book[ids[0]] = 1;
    const b1 = bookBonus(st);
    assert.equal(b1.registered, b0.registered + 1);
    assert.equal(b1.maxHp, b0.maxHp + 3);
    assert.strictEqual(bookBonus(st), b1, '変化なしならキャッシュ');
    st.book[ids[0]] = 100; // ランクアップ → crit が変わる
    const b2 = bookBonus(st);
    assert.ok(b2.crit > b1.crit);
    // 別キャラ（別の book オブジェクト）は混ざらない
    const other = { book: { [ids[1]]: 1, [ids[2]]: 1 } };
    assert.equal(bookBonus(other).registered, 2);
    assert.equal(bookBonus(st).registered, 1);
  });

  test('debug v3: 撃破イベントの実績判定をまとめても取りこぼさない', async () => {
    const g = makeGame('luna', 'beach_f1');
    g._achvUnsub?.();
    const off = attachAchievements(g);
    const killAch = () => achievementList(g.state).filter((a) => a.done).map((a) => a.id);
    const before = killAch().length;
    g.state.kills = 0;
    for (let i = 0; i < 30; i++) { g.state.kills = (g.state.kills || 0) + 1; g.events.emit('enemyKilled', { enemy: { def: ENEMIES.slime_green, defId: 'slime_green' } }); }
    await new Promise((r) => setTimeout(r, 320));
    const after = killAch().length;
    off();
    assert.ok(after > before, `撃破系の実績が解除される (${before} → ${after})`);
  });

  test('debug v3: 夜限定の敵は昼に通常出現しない（spawnInArea）', async () => {
    await sysReady;
    const map = Object.values(MAPS).find((m) => !m.town && !m.instance && resolveSpawns(m).some((a) => a.types.some((t) => ENEMIES[t].night)));
    assert.ok(map, '夜限定の敵がいるフィールド');
    const g = makeGame('luna', map.id);
    const count = (clock) => {
      g.clock = clock; g.state.clock = clock; g.map._clock = clock;
      let n = 0;
      for (let k = 0; k < 80; k++) for (let i = 0; i < g.spawner.areas.length; i++) {
        const e = g.spawner.spawnInArea(i);
        if (e) { if (ENEMIES[e.defId].night) n++; e.remove = true; }
      }
      g.enemies = g.enemies.filter((e) => !e.remove);
      return n;
    };
    assert.equal(count(12), 0, '昼は出ない');
    assert.ok(count(23) > 0, '夜は出る');
  });
  test('debug 見た目QA: プレイヤーの anim.auraTier = 職の段階（1〜4次）', () => {
    const g = makeGame('luna', 'beach');
    g.player.updateAnim(0.016);
    assert.equal(g.player.anim.aura, null, '見習いはオーラなし');
    const line = ['luna_gunner', 'luna_sharpshooter', 'luna_trigger_maestro', 'luna_galaxy_outlaw'];
    for (const j of line) {
      g.state.level = Math.max(g.state.level, JOBS[j].reqLevel);
      const r = advanceJob(g, j);
      assert.ok(r.ok, j + ' に転職: ' + r.msg);
      g.player.updateAnim(0.016);
      assert.equal(g.player.anim.aura, JOBS[j].aura, j + ' のオーラ色');
      assert.equal(g.player.anim.auraTier, JOBS[j].tier, j + ' のオーラ段階');
    }
  });
}
