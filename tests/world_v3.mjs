// v3 ワールド＆エンティティのテスト（tests/unit.mjs から register される）
// 移動スキル5種・V会話・NPCマーク・教官配置・夜NPC/夜の敵・タワー/アリーナ/ボス部屋・PET フィルタ・全マップシミュ
import assert from 'node:assert/strict';
import { MAPS, INSTANCE_IDS, INSTANCE_MAPS, TOWN_IDS, reachability, buildTowerFloor, bossMapId } from '../src/world/maps.js';
import { SKILLS } from '../src/data/skills.js';
import { ENEMIES } from '../src/data/enemies.js';
import { ITEMS } from '../src/data/items.js';
import { MISSION_NPCS, MISSIONS } from '../src/data/missions.js';
import { useSkill, moveParams, resetCooldowns } from '../src/systems/skills.js';
import { computeStats, setActiveBuffs } from '../src/systems/progression.js';
import { Enemy } from '../src/entities/enemy.js';
import { NPC, MARK_COLORS, missionKind } from '../src/entities/npc.js';
import { petWants } from '../src/entities/pet.js';
import { heroLookOf, TALK_RANGE } from '../src/entities/player.js';
import { bossMult, timeOk } from '../src/entities/spawner.js';
import { sysReady, sysFn, inHours } from '../src/world/sys.js';

const MOVE_SKILLS = {
  flashJump: 'lj_gun_recoil_jump', teleport: 'lj_dance_blink', rush: 'jj_fight_shoulder_rush',
  wheelDash: 'jj_race_wheel_dash', glide: 'hd_drone_lift',
};
const HERO_OF = { lj_gun_recoil_jump: 'luna', lj_dance_blink: 'luna', jj_fight_shoulder_rush: 'jin', jj_race_wheel_dash: 'jin', hd_drone_lift: 'hacker' };
// NPCS.md の教官配置
const INSTRUCTORS = {
  job_velvet: 'downtown', job_bull: 'downtown', job_zero: 'downtown', job_lily: 'slums', job_byte: 'slums', job_croc: 'swamp',
  job_diamond: 'casino', job_tiger: 'casino', job_cipher: 'rooftop', job_celes: 'spaceport', job_kaiser: 'spaceport', job_quasar: 'spaceport',
};

export default function register({ test, makeGame, step, fin }) {
  // 平らな試験場（足場・壁を自由に置ける）
  function flatGame(hero, extra = {}) {
    const g = makeGame(hero, 'beach_f1');
    g.debug.god = true;
    g.enemies.length = 0;
    g.map = { ...g.map, platforms: [], ropes: [], walls: [], portals: [], spawns: [], ...extra };
    g.spawner.reset(g.map); g.enemies.length = 0; g.spawner.areas = [];
    const p = g.player; p.x = 600; p.y = g.map.groundY; p.vx = 0; p.vy = 0; p.facing = 1;
    for (let i = 0; i < 5; i++) step(g);
    return g;
  }
  function learn(g, id, lv = 1) { g.state.skills[id] = lv; g.state.mp = 9999; resetCooldowns(); }

  test('v3 world: 移動スキル5種の挙動（flashJump/teleport/rush/glide/wheelDash）', () => {
    // --- flashJump: 地上では不可、空中で前方へ大きく跳ぶ（通常の空中移動より遠く） ---
    {
      const g = flatGame('luna'); const p = g.player; const id = MOVE_SKILLS.flashJump;
      learn(g, id);
      assert.equal(p.onGround, true);
      assert.equal(useSkill(g, id), false, '地上ではフラッシュジャンプ不可');
      g.input.tap('jump'); step(g); for (let i = 0; i < 8; i++) step(g);
      assert.ok(!p.onGround);
      const x0 = p.x, vy0 = p.vy;
      assert.ok(useSkill(g, id), '空中で発動');
      assert.ok(p.vx >= 600 && p.vy < Math.min(0, vy0), `前方+上方へ vx=${p.vx} vy=${p.vy}`);
      let n = 0; while (!p.onGround && n++ < 240) step(g);
      assert.ok(p.x - x0 > 250, `前方へ ${Math.round(p.x - x0)}px`);
      // 後方射撃（backShot）が後ろの敵に当たる
      const g2 = flatGame('luna'); learn(g2, id);
      const e = new Enemy(g2, 'slime_green', g2.player.x - 120, g2.map.groundY); g2.enemies.push(e);
      g2.input.tap('jump'); step(g2); for (let i = 0; i < 4; i++) step(g2);
      const hp0 = e.hp; useSkill(g2, id);
      assert.ok(e.hp < hp0, 'リコイルの反動弾が後方の敵に命中');
    }
    // --- teleport: 同期的に distance 移動・壁は抜けない・上下は足場に着地 ---
    {
      const g = flatGame('luna'); const p = g.player; const id = MOVE_SKILLS.teleport;
      learn(g, id);
      const mv = moveParams(g.state, id, 1);
      const x0 = p.x;
      assert.ok(useSkill(g, id));
      assert.equal(Math.round(p.x - x0), mv.distance, 'テレポートは即座に distance 移動');
      // 壁の手前で止まる
      const gw = flatGame('luna', { walls: [{ x: 700, y: 880, w: 60, h: 120 }] }); learn(gw, id);
      gw.player.x = 600; useSkill(gw, id);
      assert.ok(gw.player.x + gw.player.w / 2 <= 700, `壁抜けしない x=${gw.player.x}`);
      // 上: 足場の上に着地
      const plat = { x: 450, y: 870, w: 400 };
      const gu = flatGame('luna', { platforms: [plat] }); learn(gu, id);
      gu.player.x = 600; gu.input.hold('up'); useSkill(gu, id); gu.input.release('up');
      assert.equal(gu.player.y, plat.y, '上テレポートで足場に着地');
      assert.equal(gu.player.groundPlat, plat);
      for (let i = 0; i < 30; i++) step(gu);
      assert.equal(gu.player.y, plat.y, '足場の上に立ったまま');
      // 下: 足場から地面へ
      gu.input.hold('down'); resetCooldowns(); useSkill(gu, id); gu.input.release('down');
      assert.equal(gu.player.y, gu.map.groundY, '下テレポートで地面へ');
      // 3次強化: 移動先の小爆発（arrivalBlast）が当たる
      const gb = flatGame('luna'); learn(gb, id); gb.state.skills.lj_dance_prism_blink = 1;
      const e = new Enemy(gb, 'slime_green', gb.player.x + moveParams(gb.state, id, 1).distance, gb.map.groundY); gb.enemies.push(e);
      const hp0 = e.hp; useSkill(gb, id);
      assert.ok(e.hp < hp0, '移動先の小爆発');
    }
    // --- rush: 前方へ突進・接触ダメージ・押し出し ---
    {
      const g = flatGame('jin'); const p = g.player; const id = MOVE_SKILLS.rush;
      learn(g, id);
      const e = new Enemy(g, 'crab_sand', p.x + 150, g.map.groundY); g.enemies.push(e);
      const x0 = p.x, hp0 = e.hp, ex0 = e.x;
      assert.ok(useSkill(g, id));
      for (let i = 0; i < 20; i++) step(g);
      assert.ok(p.x - x0 > 200, `突進 ${Math.round(p.x - x0)}px`);
      assert.ok(e.hp < hp0 || e.dead, '突進が当たる');
      assert.ok(e.dead || e.x > ex0, '敵を押し出す');
      assert.equal(p.move, null, '突進は time 秒で終了');
    }
    // --- glide: 前方へ滑空・落下速度が遅い ---
    {
      const g = flatGame('hacker'); const p = g.player; const id = MOVE_SKILLS.glide;
      learn(g, id);
      p.y = g.map.groundY - 400; p.vy = 0; p.onGround = false;
      step(g);
      const x0 = p.x, y0 = p.y;
      assert.ok(useSkill(g, id));
      let maxVy = -Infinity;
      for (let i = 0; i < 30; i++) { step(g); maxVy = Math.max(maxVy, p.vy); }
      assert.ok(maxVy <= 141, `落下速度を抑える vy=${maxVy}`);
      assert.ok(p.x - x0 > 250, `滑空 ${Math.round(p.x - x0)}px`);
      assert.ok(p.y - y0 < 120, `ほとんど落ちない ${Math.round(p.y - y0)}px`);
      // 通常落下と比べて
      const g2 = flatGame('hacker'); const p2 = g2.player; p2.y = g2.map.groundY - 400; p2.vy = 0; p2.onGround = false;
      for (let i = 0; i < 30; i++) step(g2);
      assert.ok(p2.y - (g2.map.groundY - 400) > p.y - y0 + 100, '通常落下より遅い');
    }
    // --- wheelDash: 地上のみ・高速走行・接触ダメージ・ジャンプで勢いを保つ ---
    {
      const g = flatGame('jin', { width: 6000 }); const p = g.player; const id = MOVE_SKILLS.wheelDash;
      learn(g, id);
      p.x = 400;
      const e = new Enemy(g, 'crab_sand', 900, g.map.groundY); g.enemies.push(e);
      const x0 = p.x, hp0 = e.hp;
      assert.ok(useSkill(g, id));
      for (let i = 0; i < 40; i++) step(g);
      assert.ok(p.x - x0 > 420, `0.67秒で ${Math.round(p.x - x0)}px`);
      assert.ok(p.move?.type === 'wheelDash', '走行中');
      assert.ok(e.hp < hp0 || e.dead, '接触ダメージ');
      g.input.tap('jump'); step(g);
      assert.ok(p.vy < 0 && p.vx > 400, 'ジャンプで勢いを保つ');
      // 空中では不可
      resetCooldowns(); for (let i = 0; i < 3; i++) step(g);
      assert.equal(useSkill(g, id), false, '空中ではホイールダッシュ不可');
    }
    // --- 町でも移動スキル（住民は攻撃の対象外なので当たらない）---
    {
      const g = makeGame('jin', 'downtown'); const p = g.player; learn(g, MOVE_SKILLS.rush);
      g.enemies.length = 0; g.spawner.civT = 1e9;
      const e = new Enemy(g, 'civilian_tourist', p.x + 120, g.map.groundY, { civilian: true }); g.enemies.push(e);
      const hp0 = e.hp, x0 = p.x;
      assert.ok(useSkill(g, MOVE_SKILLS.rush), '町でも移動スキル');
      for (let i = 0; i < 20; i++) step(g);
      assert.ok(Math.abs(p.x - x0) > 100, '町で突進');
      assert.equal(e.hp, hp0, '住民には当たらない');
    }
  });

  test('v3 world: ストリートダッシュで移動速度アップ・スキルバー8枠・look/aura', () => {
    const g = flatGame('luna'); const p = g.player;
    setActiveBuffs([]);
    const sp0 = p.refreshStats().speed;
    g.state.skillBar[6] = 'street_dash'; g.state.skillBar[1] = null;
    g.input.tap('skill7'); step(g);
    assert.ok((g.buffs || []).some((b) => b.id === 'street_dash'), 'skill7 (G) でスキルバー[6]');
    for (let i = 0; i < 40; i++) step(g); // バフの詠唱モーション終了待ち
    const sp1 = p.refreshStats().speed;
    assert.ok(sp1 > sp0 * 1.15, `速度 ${sp0}→${sp1}`);
    // 実際の走行距離も伸びる
    const run = (gg) => { const q = gg.player; q.x = 600; const x0 = q.x; gg.input.hold('right'); for (let i = 0; i < 60; i++) step(gg); gg.input.release('right'); return q.x - x0; };
    const fast = run(g);
    setActiveBuffs([]); g.buffs = [];
    const slow = run(flatGame('luna'));
    assert.ok(fast > slow * 1.12, `走行距離 ${Math.round(slow)}→${Math.round(fast)}`);
    // look: state.look → defaultLook
    assert.equal(heroLookOf(g.state), g.state.look);
    const noLook = { ...g.state, look: undefined, heroId: 'hacker', gender: 'm' };
    assert.equal(heroLookOf(noLook).hair, 'spiky');
    // aura: 職の aura が anim.aura に
    g.state.job = { id: 'luna_gunner', tier: 1, history: ['beginner'] };
    step(g);
    assert.ok(p.anim.aura, 'anim.aura');
  });

  test('v3 world: V で会話・頭上マークの色分け', () => {
    const g = makeGame('luna', 'beach');
    const p = g.player, n = g.npcs.find((q) => q.id === 'rico');
    p.x = n.x + TALK_RANGE + 30; p.y = n.y; step(g);
    g.input.tap('talk'); step(g);
    assert.ok(!g.uiOpened.some((o) => o.name === 'dialog'), '遠いと話せない');
    p.x = n.x + 60; step(g);
    g.input.tap('talk'); step(g);
    assert.ok(g.uiOpened.some((o) => o.name === 'dialog' && o.data.npc === n), 'V で会話');
    assert.ok(g.emitted.includes('talkNpc'));
    assert.equal(p.nearestNpc(), n);
    // マーク色
    assert.equal(missionKind({ category: 'main' }), 'main');
    assert.equal(missionKind({ category: 'sub' }), 'sub');
    assert.equal(missionKind({ category: 'daily', daily: true }), 'daily');
    assert.equal(missionKind({ type: 'job' }), 'job');
    for (let i = 0; i < 40; i++) step(g);
    assert.equal(n.mark, 'available'); assert.equal(n.markKind, 'main', 'rico の m01 はメイン');
    assert.ok(MARK_COLORS.main && MARK_COLORS.sub && MARK_COLORS.daily && MARK_COLORS.job);
    const sunny = g.npcs.find((q) => q.id === 'sunny');
    if (sunny.mark) assert.ok(['sub', 'daily'].includes(sunny.markKind), 'sunny はサブ/デイリー');
    // 車の乗降は E のまま
    assert.ok(Object.values(MISSIONS).length > 0);
  });

  test('v3 world: 転職教官12人を NPCS.md どおりに配置', () => {
    const insts = Object.entries(MISSION_NPCS).filter(([, v]) => v.jobInstructor).map(([k]) => k);
    assert.equal(insts.length, 12);
    for (const id of insts) {
      const town = INSTRUCTORS[id];
      assert.equal(MISSION_NPCS[id].mapId, town, id);
      const n = MAPS[town].npcs.find((q) => q.id === id);
      assert.ok(n, `${id} が ${town} にいない`);
      assert.equal(n.name, MISSION_NPCS[id].name);
      assert.ok(n.dialog?.length && n.look?.hair && n.equip?.top, id);
      // 他の町にはいない
      for (const t of TOWN_IDS) if (t !== town) assert.ok(!MAPS[t].npcs.some((q) => q.id === id), `${id} が ${t} にも`);
    }
    // NPC 同士が重なって話しかけにくくならない
    for (const t of TOWN_IDS) {
      const xs = MAPS[t].npcs.map((q) => q.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 140, `${t}: NPC 間隔 ${xs[i - 1]}→${xs[i]}`);
    }
  });

  test('v3 world: 夜だけの NPC/店（hours）と夜限定の敵', () => {
    for (const t of TOWN_IDS) {
      const nights = MAPS[t].npcs.filter((q) => Array.isArray(q.hours));
      assert.ok(nights.length >= 1 && nights.length <= 2, `${t}: 夜NPC ${nights.length}`);
      for (const n of nights) for (const sid of n.shop || []) assert.ok(ITEMS[sid], `${t} ${n.id} shop ${sid}`);
    }
    assert.ok(inHours([20, 5], 23) && inHours([20, 5], 2) && !inHours([20, 5], 12) && inHours([8, 18], 12) && !inHours([8, 18], 19));
    const g = makeGame('luna', 'downtown');
    const p = g.player;
    g.clock = 12; g.map._clock = 12;
    for (let i = 0; i < 40; i++) step(g);
    const nn = g.npcs.find((q) => q.hours);
    assert.ok(nn.hidden, '昼は非表示');
    p.x = nn.x; p.y = nn.y; step(g);
    assert.notEqual(p.nearestNpc(), nn, '昼は話せない');
    g.clock = 23; g.map._clock = 23;
    for (let i = 0; i < 40; i++) step(g);
    assert.ok(!nn.hidden, '夜は表示');
    assert.equal(p.nearestNpc(), nn, '夜は話せる');
    // 夜限定の敵（def.night）は夜のみ出現
    assert.equal(timeOk({ night: true }, false), false); assert.equal(timeOk({ night: true }, true), true); assert.equal(timeOk({}, false), true);
    const types = [...new Set(g.spawner.areas.flatMap((a) => a.types))];
    const gf = makeGame('luna', 'beach_f1'); gf.state.level = 50;
    const ids = [...new Set(gf.spawner.areas.flatMap((a) => a.types))];
    const saved = ids.map((id) => [id, ENEMIES[id].night]);
    try {
      for (const id of ids) ENEMIES[id].night = true;
      gf.clock = 12; gf.map._clock = 12; gf.enemies.length = 0;
      for (let k = 0; k < 30; k++) gf.spawner.spawnInArea(k % gf.spawner.areas.length);
      assert.equal(gf.enemies.length, 0, '昼は夜限定の敵が出ない');
      gf.clock = 23; gf.map._clock = 23;
      for (let k = 0; k < 30; k++) gf.spawner.spawnInArea(k % gf.spawner.areas.length);
      assert.ok(gf.enemies.length > 0, '夜は出る');
    } finally { for (const [id, v] of saved) { if (v === undefined) delete ENEMIES[id].night; else ENEMIES[id].night = v; } }
    void types;
  });

  test('v3 world: タワー/アリーナ/ボス部屋（到達性・入口・進行）', async () => {
    await sysReady;
    // 列挙されない（既存の 34 マップ・接続表に影響しない）が MAPS[id] で引ける
    assert.equal(Object.keys(MAPS).length, 34);
    for (const id of INSTANCE_IDS) {
      const m = MAPS[id];
      assert.ok(m && m.id === id && ['tower', 'arena', 'boss'].includes(m.instance), id);
      assert.ok(m.world && fin(m.world.x) && fin(m.world.y), id + ' world 座標');
      const ex = m.portals.find((q) => q.exit);
      assert.ok(ex && MAPS[ex.to]?.town, id + ' 出口');
      assert.deepEqual(reachability(m).unreachable, [], id + ' 足場到達');
    }
    // 各町に入口（コンテンツ受付）
    for (const t of TOWN_IDS) assert.ok(MAPS[t].npcs.some((n) => n.service), t + ' 受付');
    // タワー: 1〜60 階の生成レイアウトが全て到達可能
    const tw = { ...MAPS.tower, portals: MAPS.tower.portals.map((q) => ({ ...q })) };
    for (let f = 1; f <= 60; f++) {
      buildTowerFloor(tw, f);
      assert.deepEqual(reachability(tw).unreachable, [], `tower ${f}F`);
      assert.ok(tw.platforms.every((q) => q.x >= 0 && q.x + q.w <= tw.width && q.y < tw.groundY));
    }
    // タワーの進行: 全滅 → 次の階ポータル → 次の階
    const g = makeGame('luna', 'downtown');
    g.state.level = 120; g.debug.god = true;
    let cleared = null; g.events.on('towerFloorCleared', (d) => { cleared = d; });
    g.towerFloor = 3; g.changeMap('tower');
    assert.equal(g.map.id, 'tower'); assert.equal(g.towerFloor, 3);
    const ex = g.map.portals.find((q) => q.exit);
    assert.equal(ex.to, 'downtown', '出口は入場前の町');
    for (let i = 0; i < 60; i++) step(g);
    const mobs = g.enemies.filter((e) => e.instance === 'tower');
    assert.ok(mobs.length >= 3, `タワーの敵 ${mobs.length}`);
    assert.ok(!g.map.portals.some((q) => q.towerNext), '全滅前は次の階ポータルなし');
    for (const e of mobs) e.hp = 1;
    const p = g.player;
    for (let k = 0; k < 400 && g.enemies.some((e) => e.instance && !e.dead); k++) {
      const e = g.enemies.find((q) => q.instance && !q.dead);
      p.x = e.x - 30; p.y = e.y; p.facing = 1; p.attackCd = 0; g.input.hold('attack'); step(g); g.input.release('attack');
      if (e.flying) { e.hp = 0; e.dead = true; }
    }
    for (let i = 0; i < 10; i++) step(g);
    assert.ok(cleared && cleared.floor === 3, 'フロアクリア');
    const next = g.map.portals.find((q) => q.towerNext);
    assert.ok(next, '次の階ポータル出現');
    p.x = next.x; p.y = next.y; step(g); g.input.tap('up'); step(g);
    assert.equal(g.map.id, 'tower'); assert.equal(g.towerFloor, 4, '4F へ');
    assert.ok(!g.map.portals.some((q) => q.towerNext), '新しい階は再び閉じる');
    // 10階ごとのボス
    g.towerFloor = 10; g.changeMap('tower'); for (let i = 0; i < 60; i++) step(g);
    assert.ok(g.enemies.some((e) => e.instance && e.boss), '10F ボス');
    // 出口で町へ
    const ex2 = g.map.portals.find((q) => q.exit);
    p.x = ex2.x; p.y = ex2.y; step(g); g.input.tap('up'); step(g);
    assert.equal(g.map.id, 'downtown', '出口から町へ');

    // アリーナ: ウェーブが進む
    const ga = makeGame('jin', 'slums'); ga.debug.god = true; ga.state.level = 30;
    ga.changeMap('arena');
    for (let i = 0; i < 120; i++) step(ga);
    assert.equal(ga.arenaWave, 1);
    const w1 = ga.enemies.filter((e) => e.instance === 'arena');
    assert.ok(w1.length >= 3, 'wave1 の敵');
    for (const e of w1) { e.hp = 0; e.dead = true; }
    for (let i = 0; i < 200; i++) step(ga);
    assert.equal(ga.arenaWave, 2, 'wave2');
    assert.equal(ga.map.portals.find((q) => q.exit).to, 'slums');

    // ボス部屋: 各ボス・難易度倍率
    for (const id of INSTANCE_IDS.filter((k) => MAPS[k].instance === 'boss')) {
      const gb = makeGame('luna', 'casino'); gb.debug.god = true; gb.state.level = 100;
      gb.bossMode = 'hard';
      gb.changeMap(id);
      for (let i = 0; i < 100; i++) step(gb);
      const b = gb.enemies.find((e) => e.instance === 'boss' && e.boss);
      assert.ok(b, id + ' ボス出現');
      const m = bossMult(sysFn('bossModeMult', gb, 'bosses'), 'hard');
      assert.equal(b.maxHp, Math.round(ENEMIES[MAPS[id].bossId].hp * m.hp), id + ' HP 倍率');
      assert.ok(m.hp > 1, 'ハードは HP 増');
      let done = null; gb.events.on('bossRoomCleared', (d) => { done = d; });
      b.hp = 0; b.dead = true; step(gb);
      assert.ok(done && done.mode === 'hard', id + ' 討伐記録');
    }
    assert.equal(bossMapId('boss_gator'), 'boss_gator'); assert.equal(bossMapId('gator'), 'boss_gator');
    assert.ok(MAPS.boss_boss_gator === MAPS.boss_gator, '別名');
    void INSTANCE_MAPS;
  });

  test('v3 world: PET の拾うフィルタ', () => {
    const st = { petFilter: { money: false, equip: false, minRarity: 'rare' } };
    assert.equal(petWants(st, { money: 10 }), false);
    assert.equal(petWants(st, { item: { type: 'equip', rarity: 'epic' } }), false);
    assert.equal(petWants(st, { item: { type: 'consumable', rarity: 'common' } }), false, 'レア未満');
    assert.equal(petWants(st, { item: { type: 'consumable', rarity: 'epic' } }), true);
    assert.equal(petWants({}, { item: { type: 'etc', rarity: 'common' } }), true, '既定は全部');
    assert.equal(petWants(st, { item: { type: 'equip', rarity: 'pet' } }), false, 'equip OFF');
  });

  test('v3 world: 全マップ（インスタンス含む）を移動スキル込みでシミュレーション（例外0）', async () => {
    await sysReady;
    const ids = [...Object.keys(MAPS), ...INSTANCE_IDS];
    const acts = ['left', 'right', 'up', 'down', 'jump', 'attack'];
    const heroes = ['luna', 'jin', 'hacker'];
    for (const [k, id] of ids.entries()) {
      const hero = heroes[k % 3];
      const g = makeGame(hero, id === 'beach' ? 'beach' : 'downtown');
      g.debug.god = true; g.state.level = 100; g.state.mp = 1e6;
      for (const sid of Object.values(MOVE_SKILLS)) if (SKILLS[sid].hero === hero) g.state.skills[sid] = 5;
      g.state.skillBar = [...Object.values(MOVE_SKILLS).filter((s) => HERO_OF[s] === hero), 'street_dash', null, null, null, null, null, null].slice(0, 8);
      g.towerFloor = 1 + (k % 15);
      g.bossMode = ['normal', 'hard', 'chaos'][k % 3];
      g.clock = k % 2 ? 23 : 12;
      g.changeMap(id);
      const p = g.player;
      for (let i = 0; i < 60 * 6; i++) {
        if (i % 12 === 0) { for (const a of acts) g.input.release(a); g.input.hold(acts[(i / 12 + k) % acts.length]); }
        if (i % 20 === 0) g.input.tap('jump');
        if (i % 25 === 5) g.input.tap('skill' + (1 + (i / 25 | 0) % 3));
        if (i % 90 === 45) g.input.tap('talk');
        if (g.uiOpened.length) g.uiOpened.length = 0;
        step(g, 1 / 60);
        assert.ok(fin(p.x) && fin(p.y) && fin(p.vx) && fin(p.vy), `${id}: プレイヤー NaN`);
        assert.ok(p.x >= 0 && p.x <= g.map.width && p.y <= g.map.groundY + 1, `${id}: マップ外 ${p.x},${p.y}`);
        for (const e of g.enemies) assert.ok(fin(e.x) && fin(e.y), `${id}: 敵 NaN ${e.defId}`);
      }
      for (const a of acts) g.input.release(a);
      assert.equal(g.lastError, null, id);
    }
  });
}
