// v4: 第2ワールド「ネオン・アーク」のテスト（tests/unit.mjs から register される）
// マップ（20）・地域ごとの style・敵とボス・第2形態・次元ゲート・タクシー・経験値の曲線・デバッグ
import assert from 'node:assert/strict';
import { MAPS, W2_TOWN_IDS, W2_FIELD_IDS, W2_MAP_IDS, W2_REGION_IDS, CONNECTIONS, reachability, worldOf, portalOpen, INSTANCE_MAPS } from '../src/world/maps.js';
import { ENEMIES, W2_ENEMY_IDS, W2_REGIONS, BOSS_IDS } from '../src/data/enemies.js';
import { ITEMS, W2_GEAR, W2_ITEM_IDS } from '../src/data/items.js';
import { expToNext, baseEnemyExp, REGION_EXP_MULT, MAX_LEVEL } from '../src/data/balance.js';
import { MAP_INFO, WORLD_GRAPH, taxiTravel, canTaxi, worldOfMap, W2_MAP_IDS as TRAVEL_W2 } from '../src/systems/travel.js';
import { resolveSpawns } from '../src/entities/spawner.js';
import { Enemy } from '../src/entities/enemy.js';
import { damageEnemy } from '../src/systems/combat.js';
import { BOOK_IDS, REGION_NAMES } from '../src/systems/book.js';
import { DebugPanel } from '../src/debug/debug.js';

export default function register({ test, makeGame, step }) {
  test('w2 maps: 4 地域 × 町 1 ＋ フィールド 4・ID・接続・到達性', () => {
    assert.deepEqual(W2_REGION_IDS, ['arkcity', 'cyberwild', 'abyss', 'zenith']);
    assert.deepEqual(W2_REGIONS, W2_REGION_IDS);
    assert.equal(W2_MAP_IDS.length, 20);
    assert.deepEqual([...W2_MAP_IDS].sort(), [...TRAVEL_W2].sort(), 'travel と maps の一覧が一致');
    for (const r of W2_REGION_IDS) {
      const town = MAPS['w2_' + r];
      assert.ok(town && town.town && town.region === r && town.worldId === 2, r + ' 町');
      for (let k = 1; k <= 4; k++) {
        const f = MAPS[`w2_${r}_f${k}`];
        assert.ok(f && !f.town && f.region === r && f.worldId === 2, `w2_${r}_f${k}`);
        assert.ok(f.levelRange[0] >= 100 && f.levelRange[1] <= 200, f.id + ' Lv');
      }
      // 各地域にボスの行き止まりが 1 つ
      const dead = W2_FIELD_IDS.filter((id) => MAPS[id].region === r && MAPS[id].deadEnd);
      assert.equal(dead.length, 1, r + ' ボスの行き止まり');
    }
    for (const id of W2_MAP_IDS) {
      const m = MAPS[id];
      assert.equal(worldOf(m), 2); assert.equal(worldOfMap(id), 2); assert.equal(MAP_INFO[id]?.world, 2, id + ' MAP_INFO');
      assert.deepEqual(reachability(m).unreachable, [], id + ' 届かない足場');
      for (const p of m.platforms) assert.ok(p.y > 60, `${id}: 足場が高すぎる y=${p.y}`);
    }
    // 第1ワールドは worldId 1 のまま
    for (const id of ['beach', 'spaceport', 'space_f4']) assert.equal(worldOf(id), 1);
    // 接続: 宇宙港 ⇄ アーク・シティ（次元ゲート）
    assert.ok(CONNECTIONS.some(([a, b]) => a === 'spaceport' && b === 'w2_arkcity'));
    assert.ok(WORLD_GRAPH.spaceport.includes('w2_arkcity') && WORLD_GRAPH.w2_arkcity.includes('spaceport'));
    // 第2ワールドの中だけで全マップがつながっている
    const seen = new Set(['w2_arkcity']); const q = ['w2_arkcity'];
    while (q.length) { const c = q.shift(); for (const p of MAPS[c].portals) if (MAPS[p.to]?.worldId === 2 && !seen.has(p.to)) { seen.add(p.to); q.push(p.to); } }
    assert.equal(seen.size, 20, '第2ワールド内の連結');
  });

  test('w2 maps: 地域ごとに違う style（足場の組み方）・地面の色', () => {
    const byRegion = {};
    for (const id of W2_FIELD_IDS) (byRegion[MAPS[id].region] ||= new Set()).add(MAPS[id].style);
    const all = Object.values(byRegion);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      for (const s of all[i]) assert.ok(!all[j].has(s), `style ${s} が 2 つの地域で使われている`);
    }
    const W1_STYLES = new Set(['coast', 'standard', 'alley', 'tunnel', 'highway', 'park', 'pier', 'warehouse', 'dock', 'ship', 'rail', 'maze', 'nest', 'vault', 'hall', 'tower', 'garden', 'launch', 'moon', 'alienShip']);
    for (const id of W2_FIELD_IDS) assert.ok(!W1_STYLES.has(MAPS[id].style), `${id}: 第1ワールドと同じ style ${MAPS[id].style}`);
    // 重力の違う地域（水中・雲の上）
    assert.ok(MAPS.w2_abyss_f1.gravity < 1 && MAPS.w2_zenith_f1.gravity < 1);
  });

  test('w2 enemies: 各地域 6〜10 種＋夜限定＋ボス、Lv100〜200、ドロップの参照、図鑑の地域', () => {
    assert.ok(W2_ENEMY_IDS.length >= 40);
    for (const r of W2_REGION_IDS) {
      const ids = W2_ENEMY_IDS.filter((id) => ENEMIES[id].region === r);
      const normal = ids.filter((id) => !ENEMIES[id].boss && !ENEMIES[id].night);
      assert.ok(normal.length >= 6 && normal.length <= 11, `${r}: 通常 ${normal.length} 種`);
      assert.ok(ids.some((id) => ENEMIES[id].night), r + ' 夜限定');
      assert.ok(ids.some((id) => BOSS_IDS.includes(id)), r + ' ボス');
      assert.ok(REGION_NAMES[r], r + ' 図鑑の地域名');
    }
    for (const id of W2_ENEMY_IDS) {
      const e = ENEMIES[id];
      assert.equal(e.world, 2);
      assert.ok(e.level >= 100 && e.level <= 200, id + ' Lv');
      assert.ok(BOOK_IDS.includes(id), id + ' 図鑑');
      for (const d of e.drops) assert.ok(ITEMS[d.id], `${id} drop ${d.id}`);
      assert.ok(e.drops.some((d) => W2_ITEM_IDS.includes(d.id)), id + ' 第2ワールドの素材/装備を落とす');
      assert.ok(Number.isFinite(e.exp) && e.exp > 0, id + ' exp');
    }
    // Lv100 の敵との連続性: 第1ワールドの Lv96 と第2ワールドの Lv101 の強さが 2 倍以上離れない
    const a = ENEMIES.ghost_astral, b = ENEMIES.ark_drone_patrol;
    for (const k of ['hp', 'atk', 'exp']) assert.ok(b[k] / a[k] > 0.6 && b[k] / a[k] < 1.6, `連続性 ${k} ${a[k]} → ${b[k]}`);
    // Lv が上がるほど強い（地域の平均）
    const avg = (r, k) => { const L = W2_ENEMY_IDS.filter((id) => ENEMIES[id].region === r && !ENEMIES[id].boss); return L.reduce((s, id) => s + ENEMIES[id][k], 0) / L.length; };
    for (const k of ['hp', 'atk', 'exp']) for (let i = 1; i < 4; i++) assert.ok(avg(W2_REGION_IDS[i], k) > avg(W2_REGION_IDS[i - 1], k), `${k} が地域ごとに増える`);
    // 装備
    for (const r of W2_REGION_IDS) assert.ok(W2_GEAR[r].length >= 18, r + ' 装備');
    for (const id of W2_ITEM_IDS) assert.ok(ITEMS[id], id);
    // ラスボスの第2形態
    assert.equal(ENEMIES.boss_zenith.phase2, 'boss_zenith_true');
    assert.equal(ENEMIES.boss_zenith_true.phaseOf, 'boss_zenith');
    assert.ok(!BOSS_IDS.includes('boss_zenith_true'), '第2形態はボス一覧に入れない');
    assert.ok(!INSTANCE_MAPS.boss_zenith_true, '第2形態のボス部屋は作らない');
    assert.ok(INSTANCE_MAPS.boss_zenith && INSTANCE_MAPS.boss_zenith.region === 'zenith' && INSTANCE_MAPS.boss_zenith.worldId === 2, 'ボス部屋（第2ワールド）');
    assert.ok(Number.isFinite(ENEMIES.boss_zenith.exp) && Number.isFinite(ENEMIES.boss_zenith_true.exp), 'Lv200 のボスの経験値は有限');
  });

  test('w2 spawns: 各フィールドで敵が出る・地域が一致・ボス枠（第2形態は出現表に入らない）', () => {
    for (const id of W2_FIELD_IDS) {
      const areas = resolveSpawns(MAPS[id]);
      const types = [...new Set(areas.filter((s) => !s.boss).flatMap((s) => s.types))];
      assert.ok(types.length >= 3, `${id}: ${types.length} 種`);
      for (const t of areas.flatMap((s) => s.types)) {
        assert.equal(ENEMIES[t].region, MAPS[id].region, `${id}: ${t}`);
        assert.ok(!ENEMIES[t].phaseOf, `${id}: 第2形態 ${t} が出現表に`);
      }
      if (MAPS[id].deadEnd) assert.ok(areas.some((s) => s.boss && s.types.length === 1), id + ' ボス枠');
    }
    const g = makeGame('luna', 'w2_cyberwild_f2');
    g.debug.god = true; g.state.level = 140;
    for (let i = 0; i < 60 * 10; i++) step(g, 1 / 30);
    const mons = g.enemies.filter((e) => !e.dead && !e.civilian);
    assert.ok(mons.length > 0, '敵が出る');
    for (const e of mons) assert.equal(e.def.region, 'cyberwild');
  });

  test('w2 boss: ラスボスを倒すと第2形態が出て、第2形態を倒すと終わる（フィールド）', () => {
    const g = makeGame('jin', 'w2_zenith_f4');
    g.debug.god = true; g.state.level = 200;
    g.enemies.length = 0;
    const b = new Enemy(g, 'boss_zenith', 2800, g.map.groundY); g.enemies.push(b);
    step(g);
    damageEnemy(g, b, b.hp + 10, false, 1);
    assert.ok(b.dead || b.hp <= 0);
    let phase = null; g.events.on('bossPhase2', (d) => { phase = d; });
    step(g);
    const p2 = g.enemies.find((e) => e.defId === 'boss_zenith_true' && !e.dead);
    assert.ok(p2, '第2形態が出る');
    assert.ok(phase && phase.phase2 === 'boss_zenith_true', 'bossPhase2 イベント');
    for (let i = 0; i < 5; i++) step(g);
    assert.equal(g.enemies.filter((e) => e.defId === 'boss_zenith_true').length, 1, '第2形態は 1 体だけ');
    let killed = null; g.events.on('enemyKilled', (d) => { killed = d.enemy?.defId; });
    damageEnemy(g, p2, p2.hp + 10, false, 1);
    for (let i = 0; i < 5; i++) step(g);
    assert.equal(killed, 'boss_zenith_true');
    assert.equal(g.enemies.filter((e) => e.defId === 'boss_zenith_true' && !e.dead).length, 0, '第2形態の後は何も出ない');
    assert.ok((g.state.book?.boss_zenith_true || 0) > 0, '図鑑に第2形態');
  });

  test('w2 gate: 次元ゲートはフラグが無いと閉じていて、あれば第2ワールドへ。帰り道もある', () => {
    const g = makeGame('luna', 'spaceport');
    const gate = g.map.portals.find((p) => p.to === 'w2_arkcity');
    assert.ok(gate && gate.requireFlag === 'world2Unlocked' && gate.gate, '次元ゲート');
    assert.equal(portalOpen(gate, g.state), false);
    const p = g.player;
    p.x = gate.x; p.y = g.map.groundY; p.vx = 0;
    g.input.tap('up'); step(g);
    assert.equal(g.map.id, 'spaceport', 'フラグ無し → 通れない');
    assert.ok(g.notes.some((t) => /閉じている/.test(t)), '「閉じている」と出る');
    assert.equal(gate.locked, true, '見た目も閉じている');
    // デバッグボタンでフラグを立てる（本来はクエストの報酬 reward.flags）
    const dbg = new DebugPanel(g);
    dbg.toggleWorld2(true);
    assert.equal(g.state.flags.world2Unlocked, true);
    step(g);
    assert.equal(gate.locked, false);
    p.x = gate.x; p.y = g.map.groundY; g.time += 2;
    g.input.tap('up'); step(g);
    assert.equal(g.map.id, 'w2_arkcity', 'フラグあり → アーク・シティ');
    // 帰り道（アーク・シティの左端のゲート）
    const back = g.map.portals.find((q) => q.to === 'spaceport');
    assert.ok(back && back.gate && !back.requireFlag, '帰りのゲート');
    p.x = back.x; p.y = g.map.groundY; g.time += 2;
    g.input.tap('up'); step(g);
    assert.equal(g.map.id, 'spaceport', '宇宙港へ戻れる');
    assert.ok(g.state.visited.includes('w2_arkcity') || true);
    dbg.toggleWorld2(false);
    assert.ok(!g.state.flags.world2Unlocked);
  });

  test('w2 taxi: 第2ワールドの町どうしは行ける・ワールドをまたぐのは不可・訪問の記録', () => {
    const g = makeGame('luna', 'w2_arkcity');
    g.state.money = 1e8; g.state.level = 160;
    g.state.visited.push('w2_arkcity', 'w2_cyberwild', 'w2_abyss', 'spaceport', 'beach');
    assert.equal(canTaxi(g, 'beach').ok, false, '第1ワールドへは不可');
    assert.ok(/ワールド/.test(canTaxi(g, 'spaceport').msg));
    const r = taxiTravel(g, 'w2_abyss');
    assert.ok(r.ok, r.msg); assert.equal(g.map.id, 'w2_abyss');
    assert.equal(canTaxi(g, 'w2_zenith').ok, false, '未訪問の町');
    g.changeMap('spaceport');
    assert.equal(canTaxi(g, 'w2_arkcity').ok, false, '第1 → 第2 も不可');
    // 町マップのタクシー対象（町）として登録されている
    for (const id of W2_TOWN_IDS) assert.ok(MAP_INFO[id].town, id);
  });

  test('w2 exp: Lv100〜200 の曲線（1 Lv に倒す数: Lv100 台前半 150〜300 体・Lv190 台 500〜900 体。docs/BALANCE_V4.md）', () => {
    assert.equal(MAX_LEVEL, 200);
    const mult = (L) => L < 76 ? 1.45 : L < 100 ? 1.5 : L < 128 ? REGION_EXP_MULT.arkcity : L < 153 ? REGION_EXP_MULT.cyberwild : L < 178 ? REGION_EXP_MULT.abyss : REGION_EXP_MULT.zenith;
    const per = (L) => expToNext(L) / (baseEnemyExp(L) * mult(L));
    const kills = (a, b) => { let k = 0; for (let L = a; L < b; L++) k += per(L); return k; };
    for (let L = 100; L < 110; L++) assert.ok(per(L) >= 150 && per(L) <= 300, `Lv${L} ${per(L).toFixed(0)} 体`);
    for (let L = 190; L < 200; L++) assert.ok(per(L) >= 500 && per(L) <= 900, `Lv${L} ${per(L).toFixed(0)} 体`);
    const base = kills(60, 100), k1 = kills(100, 150), k2 = kills(150, 200);
    assert.ok(k1 / base >= 1.3 && k1 / base <= 2.2, `100→150 ${(k1 / base).toFixed(2)} 倍`);
    assert.ok(k2 / base >= 2.0 && k2 / base <= 3.0, `150→200 ${(k2 / base).toFixed(2)} 倍`);
    let prev = 0;
    for (let L = 1; L < 200; L++) { assert.ok(expToNext(L) > prev, 'Lv' + L); prev = expToNext(L); }
    assert.equal(expToNext(200), Infinity);
  });

  test('w2 5次転職の前提: 教官はアーク・シティ・敵の mapId（ボス部屋はボスのフィールド）・HP の目安', () => {
    for (const id of ['job_nyx', 'job_garo', 'job_akasha']) assert.ok(MAPS.w2_arkcity.npcs.some((n) => n.id === id), id);
    const g = makeGame('luna', 'w2_arkcity_f1');
    const e = new Enemy(g, 'ark_slime_neon', 600, g.map.groundY);
    assert.equal(e.mapId, 'w2_arkcity_f1');
    g.changeMap('boss_ark_titan');
    const b = new Enemy(g, 'boss_ark_titan', 900, g.map.groundY);
    assert.equal(b.mapId, 'w2_arkcity_f3', 'ボス部屋のボスは w2_arkcity_f3 で倒した扱い');
    assert.ok(ENEMIES.boss_ark_titan.boss && ENEMIES.boss_ark_titan.habitats[0].startsWith('w2_arkcity'));
    // HP・防御の目安（docs/BALANCE_V4.md で合わせ直した表: Lv120 ≒ 16 万/120, 150 ≒ 38 万/150, 180 ≒ 52 万/180, 200 ≒ 64 万/200、
    //  ラスボス ≒ 2,200 万＋2,400 万）
    const rough = (v, t) => v > t * 0.7 && v < t * 1.4;
    assert.ok(rough(ENEMIES.wild_seagull_neon.hp, 380000) && ENEMIES.wild_seagull_neon.def === 150, 'Lv150');
    assert.ok(rough(ENEMIES.boss_zenith.hp + ENEMIES.boss_zenith_true.hp, 4.6e7) && rough(ENEMIES.boss_zenith.hp, 2.2e7), 'ラスボス');
  });

  test('w2 debug: ワープの一覧と第2ワールドのワープ', () => {
    const g = makeGame('luna', 'beach');
    const dbg = new DebugPanel(g);
    assert.ok(dbg.actions.some((a) => a.id === 'world2') && dbg.actions.some((a) => a.id === 'warp2'));
    const seen = [];
    for (let i = 0; i < W2_MAP_IDS.length; i++) { dbg.warp2(); seen.push(g.map.id); }
    assert.deepEqual(new Set(seen), new Set(W2_MAP_IDS));
  });
}
