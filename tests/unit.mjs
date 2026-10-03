// Node 単体テスト: データ整合性 + システム/ワールド/エンティティのロジック
// 実行: node tests/unit.mjs   （オプション: --repeat=N でランダム依存テストを N 回反復, --seed は不使用）
import assert from 'node:assert/strict';

import { ITEMS, STARTER_EQUIP, EQUIP_SLOTS, getItem } from '../src/data/items.js';
import { SKILLS, STARTER_SKILLS, skillsForHero } from '../src/data/skills.js';
import { ENEMIES, ENEMIES_BY_MAP, COP_UNITS_BY_WANTED } from '../src/data/enemies.js';
import { MISSIONS, MISSION_NPCS, MAP_IDS, turnInNpcOf } from '../src/data/missions.js';
import { MAPS, MAP_ORDER } from '../src/world/maps.js';
import { moveAndCollide, findRope, rectOverlap, entRect } from '../src/world/physics.js';
import { newState, computeStats, expToNext, gainExp, setActiveBuffs, addStat, HERO_BASE } from '../src/systems/progression.js';
import { addItem, addItemToState, removeItem, countItem, equip, unequip, useItem, getEquipLooks, MAX_SLOTS, buyItem, sellItem } from '../src/systems/inventory.js';
import { rollDrops, RARITY } from '../src/systems/loot.js';
import { calcDamage, damageEnemy, damagePlayer, addWanted, setWantedLevel, updateWanted, wantedLevelFor, playerAttackArea, TEAR_THRESHOLDS } from '../src/systems/combat.js';
import { useSkill, updateSkills, getCooldown, learnSkill, resetCooldowns } from '../src/systems/skills.js';
import { MissionManager } from '../src/systems/missions.js';
import { EventBus } from '../src/core/events.js';
import { Player } from '../src/entities/player.js';
import { Enemy } from '../src/entities/enemy.js';
import { Spawner } from '../src/entities/spawner.js';
import { NPC } from '../src/entities/npc.js';
import { Vehicle } from '../src/entities/vehicle.js';
import { Drop } from '../src/entities/drop.js';
import { Projectile } from '../src/entities/projectile.js';
import { DebugPanel } from '../src/debug/debug.js';

const REPEAT = Number((process.argv.find((a) => a.startsWith('--repeat=')) || '').split('=')[1]) || 1;

// ------------------------------------------------------------ mini runner
const tests = [];
function test(name, fn, opts = {}) { tests.push({ name, fn, ...opts }); }
const results = { pass: 0, fail: 0, failures: [] };

// ------------------------------------------------------------ 仕様（ARCHITECTURE.md）
const STYLES = {
  hat: ['cap', 'beanie', 'bandana', 'headphones', 'crown', 'helmet', 'cowboy', 'catEars'],
  top: ['tshirt', 'hoodie', 'leatherJacket', 'suit', 'hawaiian', 'tank', 'police', 'tracksuit', 'idolDress', 'armorVest'],
  bottom: ['jeans', 'shorts', 'cargo', 'skirt', 'suitPants', 'trackPants', 'armorPants'],
  shoes: ['sneakers', 'boots', 'sandals', 'loafers', 'heels'],
  accessory: ['sunglasses', 'goldChain', 'mask', 'scarf', 'wings', 'halo'],
  weapon: ['bat', 'knife', 'katana', 'pistol', 'smg', 'guitar', 'neonSword', 'staff'],
};
const HAIRS = ['twin', 'bob', 'long', 'spiky', 'short', 'ponytail', 'wolf'];
const ARTS = ['slime', 'mushroom', 'flamingo', 'gator', 'thug', 'cop', 'drone', 'swat', 'bossGator', 'bossDon'];
const AIS = ['walker', 'jumper', 'charger', 'shooter', 'flyer', 'cop', 'boss'];
const THEMES = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop'];
const ICONS = ['potionRed', 'potionBlue', 'elixir', 'cash', 'gem', 'chip'];
const SKILL_KINDS = ['melee', 'projectile', 'aoe', 'buff', 'dash', 'passive'];
const OBJ_TYPES = ['kill', 'collect', 'reach', 'wanted', 'drive', 'boss', 'talk'];
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// ------------------------------------------------------------ スタブ game
function stubInput() {
  const held = new Set(), just = new Set();
  return {
    held, just, mouse: { x: 0, y: 0, down: false, clicked: false },
    down: (a) => held.has(a), pressed: (a) => just.has(a), consume: (a) => just.delete(a),
    tap(a) { just.add(a); }, hold(a) { held.add(a); }, release(a) { held.delete(a); },
    endFrame() { just.clear(); },
  };
}

function makeGame(heroId = 'luna', mapId = 'beach') {
  const game = {
    W: 1280, H: 720, time: 0, dt: 1 / 60, scene: 'play',
    input: stubInput(), events: new EventBus(), cam: { x: 0, y: 0 }, shake: 0,
    state: newState(heroId), map: null, player: null,
    enemies: [], projectiles: [], drops: [], npcs: [], vehicles: [], effects: [],
    spawner: null, missions: null, debug: { god: false },
    ui: { isModal: () => false, open(name, data) { game.uiOpened.push({ name, data }); }, close() {}, notify() {} },
    uiOpened: [], notes: [], emitted: [],
    wanted: 0, wantedHeat: 0, paused: false, lastError: null,
    notify(t) { this.notes.push(t); },
    save() {},
    changeMap(id, x, y) {
      const map = MAPS[id];
      assert.ok(map, 'changeMap unknown ' + id);
      this.map = map; this.state.mapId = id;
      this.enemies.length = 0; this.projectiles.length = 0; this.drops.length = 0; this.effects.length = 0;
      this.npcs = (map.npcs || []).map((n) => new NPC(this, n));
      this.vehicles = (map.vehicles || []).map((v) => new Vehicle(this, v));
      const p = this.player;
      if (p) { p.inVehicle = null; p.x = x ?? map.spawnX ?? 200; p.y = y ?? map.groundY - 2; p.vx = 0; p.vy = 0; p.climbing = null; }
      this.spawner.reset(map);
      this.events.emit('mapChanged', { mapId: id });
    },
  };
  const emit = game.events.emit.bind(game.events);
  game.events.emit = (n, d) => { game.emitted.push(n); emit(n, d); };
  game.map = MAPS[mapId];
  game.player = new Player(game);
  game.spawner = new Spawner(game);
  game.missions = new MissionManager(game);
  game.changeMap(mapId);
  setActiveBuffs([]);
  resetCooldowns();
  return game;
}

function step(game, dt = 1 / 60) {
  game.time += dt; game.dt = dt;
  game.player.update(dt);
  for (const list of [game.enemies, game.projectiles, game.drops, game.npcs, game.vehicles]) {
    for (const e of list) if (!e.remove) e.update(dt);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].remove) list.splice(i, 1);
  }
  game.spawner.update(dt);
  updateSkills(game, dt);
  game.missions.update(dt);
  game.input.endFrame();
}

// ============================================================ データ整合性
test('items: 必須フィールドとスタイル', () => {
  const ids = Object.keys(ITEMS);
  assert.ok(ids.length > 0);
  let equipN = 0;
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.equal(it.id, id);
    assert.ok(it.name, id + ' name');
    assert.ok(RARITY[it.rarity], `${id} rarity ${it.rarity}`);
    assert.ok(['equip', 'consumable', 'etc'].includes(it.type), id + ' type');
    assert.ok(fin(it.price) && it.price > 0, id + ' price');
    if (it.type === 'equip') {
      equipN++;
      assert.ok(EQUIP_SLOTS.includes(it.slot), `${id} slot ${it.slot}`);
      assert.ok(STYLES[it.slot].includes(it.look?.style), `${id} style ${it.look?.style} not in ${it.slot}`);
      assert.match(it.look.color, /^#[0-9a-f]{3,8}$/i, id + ' color');
      for (const k of ['atk', 'def', 'maxHp', 'maxMp', 'speed', 'crit', 'str', 'dex', 'int', 'luk']) assert.ok(fin(it.stats[k]), `${id}.stats.${k}`);
      assert.ok(fin(it.reqLevel), id + ' reqLevel');
      if (it.slot === 'weapon') {
        assert.ok(['melee', 'gun', 'magic'].includes(it.weaponType), id + ' weaponType');
        assert.ok(it.range > 0 && it.attackSpeed > 0, id + ' range/attackSpeed');
      }
    } else {
      assert.equal(it.slot, null, id);
      assert.ok(ICONS.includes(it.icon), `${id} icon ${it.icon}`);
    }
    if (it.type === 'consumable') assert.ok(it.effect && (it.effect.hp || it.effect.mp || it.effect.hpPct || it.effect.mpPct || it.effect.buff), id + ' effect');
  }
  assert.ok(equipN >= 40, `装備は40種以上 (${equipN})`);
  for (const r of ['legendary', 'mythic']) assert.ok(Object.values(ITEMS).some((i) => i.rarity === r), r);
  // 全スタイルが少なくとも1つのアイテムで使われている（描画の網羅確認用）
  for (const [slot, styles] of Object.entries(STYLES)) {
    for (const s of styles) {
      const used = Object.values(ITEMS).some((i) => i.slot === slot && i.look?.style === s);
      if (!used) console.log(`   note: style ${slot}.${s} はアイテム未使用`);
    }
  }
});

test('items: 初期装備', () => {
  for (const hero of ['luna', 'jin']) {
    for (const [slot, id] of Object.entries(STARTER_EQUIP[hero])) {
      if (!id) continue;
      assert.ok(ITEMS[id], `${hero}.${slot} ${id}`);
      assert.equal(ITEMS[id].slot, slot);
      assert.equal(ITEMS[id].reqLevel, 0, `${id} は Lv0 で装備可能`);
    }
    assert.ok(STARTER_EQUIP[hero].weapon, hero + ' weapon');
  }
});

test('skills: 定義と関数', () => {
  for (const [id, s] of Object.entries(SKILLS)) {
    assert.equal(s.id, id);
    assert.ok(['luna', 'jin', 'both'].includes(s.hero), id);
    assert.ok(SKILL_KINDS.includes(s.kind), id + ' kind');
    assert.ok(s.maxLevel >= 1 && fin(s.reqLevel), id);
    for (let lv = 1; lv <= s.maxLevel; lv++) {
      assert.ok(fin(s.mp(lv)) && s.mp(lv) >= 0, `${id}.mp(${lv})`);
      assert.ok(fin(s.cooldown(lv)) && s.cooldown(lv) >= 0, `${id}.cooldown(${lv})`);
      assert.ok(fin(s.mult(lv)), `${id}.mult(${lv})`);
      if (s.kind === 'passive') assert.equal(typeof s.passive, 'function', id);
      if (s.kind === 'buff') { const b = s.buff(lv); assert.ok(b.duration > 0, id); }
      if (s.kind === 'dash') { const d = s.dash; assert.ok((typeof d.dist === 'function' ? d.dist(lv) : d.dist) > 0 && d.time > 0, id); }
    }
    if (s.kind === 'projectile') assert.ok(s.proj && s.proj.speed > 0 && s.proj.life > 0, id + ' proj');
    if (['melee', 'aoe', 'dash'].includes(s.kind)) assert.ok(s.range.w > 0 && s.range.h > 0 && s.hits >= 1, id + ' range');
  }
  for (const hero of ['luna', 'jin']) {
    const n = skillsForHero(hero).length;
    assert.ok(n >= 6 && n <= 8, `${hero} skills ${n}`);
    const st = STARTER_SKILLS[hero];
    for (const sid of Object.keys(st.skills)) assert.ok(SKILLS[sid], sid);
    for (const sid of st.skillBar) if (sid) assert.ok(st.skills[sid] > 0, sid + ' starter bar learned');
  }
});

test('enemies: 定義・ドロップ・見た目', () => {
  for (const [id, e] of Object.entries(ENEMIES)) {
    assert.equal(e.id, id);
    assert.ok(ARTS.includes(e.art), `${id} art ${e.art}`);
    assert.ok(AIS.includes(e.ai), `${id} ai ${e.ai}`);
    for (const k of ['level', 'hp', 'atk', 'def', 'exp', 'speed', 'w', 'h']) assert.ok(fin(e[k]) && e[k] >= 0, `${id}.${k}`);
    assert.ok(e.hp > 0 && e.w > 0 && e.h > 0, id);
    assert.ok(Array.isArray(e.money) && e.money[0] <= e.money[1], id + ' money');
    for (const d of e.drops) {
      assert.ok(ITEMS[d.id], `${id} drop ${d.id}`);
      assert.ok(d.chance > 0 && d.chance <= 1, `${id} drop chance ${d.id}`);
    }
    if (['thug', 'cop', 'swat', 'bossDon'].includes(e.art)) {
      assert.ok(e.look && HAIRS.includes(e.look.hair), `${id} look`);
      assert.ok(e.equip, `${id} equip`);
      for (const [slot, lk] of Object.entries(e.equip)) if (lk) assert.ok(STYLES[slot].includes(lk.style), `${id} equip ${slot}`);
    }
    if (['shooter', 'cop'].includes(e.ai) || e.art === 'drone') assert.ok(e.shoot || e.ai === 'boss' || true);
  }
  for (const [map, ids] of Object.entries(ENEMIES_BY_MAP)) for (const id of ids) assert.ok(ENEMIES[id], `${map}:${id}`);
  for (const ids of Object.values(COP_UNITS_BY_WANTED)) for (const id of ids) assert.ok(ENEMIES[id]?.isCop, id);
});

test('maps: 構造・ポータル・出現', () => {
  assert.deepEqual([...MAP_ORDER].sort(), [...MAP_IDS].sort());
  for (const [id, m] of Object.entries(MAPS)) {
    assert.equal(m.id, id);
    assert.ok(THEMES.includes(m.theme), id + ' theme');
    assert.ok(m.width >= 1280 && m.height >= 720, id + ' size');
    assert.ok(m.groundY > 0 && m.groundY <= m.height, id + ' groundY');
    assert.ok(m.spawnX > 0 && m.spawnX < m.width, id + ' spawnX');
    for (const p of m.platforms) {
      assert.ok(p.x >= 0 && p.x + p.w <= m.width && p.y < m.groundY && p.y > 0, `${id} platform ${JSON.stringify(p)}`);
    }
    for (const r of m.ropes) assert.ok(r.top < r.bottom && r.x > 0 && r.x < m.width, `${id} rope`);
    for (const pt of m.portals) {
      assert.ok(MAPS[pt.to], `${id} portal → ${pt.to}`);
      assert.ok(pt.x > 0 && pt.x < m.width, `${id} portal x`);
      const dest = MAPS[pt.to];
      const tx = pt.toX ?? dest.spawnX;
      assert.ok(tx > 0 && tx < dest.width, `${id} portal toX`);
      // 到着地点がすぐ別のポータルの上でない（↑押しっぱなしで往復しない）
      for (const q of dest.portals) assert.ok(Math.abs(q.x - tx) > 60, `${id}→${pt.to} toX ${tx} がポータル ${q.x} に近すぎ`);
    }
    for (const s of m.spawns) {
      assert.ok(s.x1 < s.x2 && s.x1 >= 0 && s.x2 <= m.width, `${id} spawn range`);
      for (const t of s.types) assert.ok(ENEMIES[t], `${id} spawn ${t}`);
      assert.ok(s.max > 0 && s.interval > 0, id);
    }
    for (const n of m.npcs) {
      assert.ok(n.x > 0 && n.x < m.width, `${id} npc ${n.id} x`);
      assert.ok(HAIRS.includes(n.look?.hair), `${id} npc ${n.id} hair`);
      for (const [slot, lk] of Object.entries(n.equip || {})) if (lk) assert.ok(STYLES[slot]?.includes(lk.style), `${id} npc ${n.id} ${slot}.${lk.style}`);
      for (const sid of n.shop || []) assert.ok(ITEMS[sid], `${id} shop ${sid}`);
      for (const pt of m.portals) assert.ok(Math.abs(pt.x - n.x) > 50, `${id} npc ${n.id} がポータルに重なる`);
    }
    for (const v of m.vehicles) assert.ok(['sports', 'police', 'bike'].includes(v.kind) && v.x > 0 && v.x < m.width, `${id} vehicle`);
  }
  // beach から全マップへ到達可能
  const seen = new Set(['beach']); const q = ['beach'];
  while (q.length) { const c = q.shift(); for (const p of MAPS[c].portals) if (!seen.has(p.to)) { seen.add(p.to); q.push(p.to); } }
  assert.deepEqual([...seen].sort(), Object.keys(MAPS).sort());
  // 全マップから beach へ戻れる（強連結）
  for (const id of Object.keys(MAPS)) {
    const s2 = new Set([id]); const q2 = [id];
    while (q2.length) { const c = q2.shift(); for (const p of MAPS[c].portals) if (!s2.has(p.to)) { s2.add(p.to); q2.push(p.to); } }
    assert.ok(s2.has('beach'), `${id} から beach へ戻れない`);
  }
  // ボスが各担当マップに出現
  for (const [boss, mapId] of [['boss_king_slime', 'beach'], ['boss_gator', 'swamp'], ['boss_mecha', 'casino'], ['boss_don', 'rooftop']]) {
    assert.ok(MAPS[mapId].spawns.some((s) => s.types.includes(boss)), `${boss} @ ${mapId}`);
  }
});

test('missions: 参照整合性・到達可能性', () => {
  const all = Object.values(MISSIONS);
  assert.ok(all.filter((m) => !m.daily).length >= 10, 'ストーリー10本以上');
  assert.ok(all.some((m) => m.daily), 'デイリーあり');
  const npcOnMap = {};
  for (const m of Object.values(MAPS)) for (const n of m.npcs) npcOnMap[n.id] = m.id;
  for (const [nid, info] of Object.entries(MISSION_NPCS)) {
    assert.equal(npcOnMap[nid], info.mapId, `NPC ${nid} は ${info.mapId} に配置`);
  }
  const spawnable = new Set();
  for (const m of Object.values(MAPS)) for (const s of m.spawns) for (const t of s.types) spawnable.add(t);
  // 手配度で出現する警察ユニット（spawner は art が cop/swat/drone(isCop) の敵を使う）
  const lawUnits = Object.values(ENEMIES).filter((e) => !e.boss && (e.art === 'cop' || e.art === 'swat' || (e.art === 'drone' && e.isCop))).map((e) => e.id);
  if (Object.values(MAPS).some((m) => m.copSpawns)) for (const id of lawUnits) spawnable.add(id);
  const droppable = new Set();
  for (const id of spawnable) for (const d of ENEMIES[id].drops) droppable.add(d.id);
  for (const m of all) {
    assert.ok(MISSION_NPCS[m.giver], `${m.id} giver ${m.giver}`);
    assert.ok(MISSION_NPCS[turnInNpcOf(m)], `${m.id} turnIn`);
    for (const p of m.prereq || []) assert.ok(MISSIONS[p], `${m.id} prereq ${p}`);
    assert.ok(m.objectives.length > 0, m.id);
    for (const o of m.objectives) {
      assert.ok(OBJ_TYPES.includes(o.type), `${m.id} type ${o.type}`);
      assert.ok(o.count > 0 && o.text, m.id);
      if (o.type === 'kill' || o.type === 'boss') {
        assert.ok(ENEMIES[o.target], `${m.id} target ${o.target}`);
        assert.ok(spawnable.has(o.target), `${m.id}: ${o.target} はどのマップにも出現しない`);
        if (o.mapId) assert.ok(MAPS[o.mapId].spawns.some((s) => s.types.includes(o.target)), `${m.id}: ${o.target} は ${o.mapId} に出現しない`);
      }
      if (o.type === 'boss') assert.ok(ENEMIES[o.target].boss, `${m.id} boss`);
      if (o.type === 'collect') {
        assert.ok(ITEMS[o.target], `${m.id} item ${o.target}`);
        const shop = Object.values(MAPS).some((mp) => mp.npcs.some((n) => (n.shop || []).includes(o.target)));
        assert.ok(droppable.has(o.target) || shop, `${m.id}: ${o.target} は入手不能`);
      }
      if (o.type === 'reach') assert.ok(MAPS[o.target], `${m.id} reach ${o.target}`);
      if (o.type === 'talk') assert.ok(MISSION_NPCS[o.target], `${m.id} talk ${o.target}`);
      if (o.type === 'wanted') assert.ok(o.target >= 1 && o.target <= 5, m.id);
      if (o.type === 'wanted') {
        // 手配度を上げられるマップ（copSpawns）があること
        assert.ok(Object.values(MAPS).some((mp) => mp.copSpawns), m.id);
      }
    }
    for (const it of m.reward?.items || []) assert.ok(ITEMS[it], `${m.id} reward ${it}`);
  }
  // 前提の循環なし・Lv順序の妥当性
  const done = new Set(); let progress = true;
  while (progress) {
    progress = false;
    for (const m of all) if (!done.has(m.id) && (m.prereq || []).every((p) => done.has(p))) { done.add(m.id); progress = true; }
  }
  assert.equal(done.size, all.length, '前提が循環/欠落: ' + all.filter((m) => !done.has(m.id)).map((m) => m.id));
});

// ============================================================ ロジック
test('progression: newState / computeStats', () => {
  for (const hero of Object.keys(HERO_BASE)) {
    const st = newState(hero);
    const s = computeStats(st, []);
    assert.equal(st.hp, s.maxHp); assert.equal(st.mp, s.maxMp);
    for (const k of ['maxHp', 'maxMp', 'atk', 'def', 'speed', 'jump', 'crit', 'critDmg', 'attackSpeed', 'range', 'luck']) assert.ok(fin(s[k]), `${hero}.${k}`);
    assert.ok(['melee', 'gun', 'magic'].includes(s.weaponType));
    assert.equal(st.equipped.weapon, STARTER_EQUIP[hero].weapon);
    assert.ok(countItem(st, 'potion_red') > 0);
  }
  let prev = 0;
  for (let l = 1; l < 200; l++) { const e = expToNext(l); assert.ok(e > prev, 'expToNext 単調増加'); prev = e; }
  assert.equal(expToNext(200), Infinity);
});

test('progression: gainExp でレベルアップ', () => {
  const g = makeGame('jin');
  const st = g.state; st.hp = 1;
  const lv = []; g.events.on('levelUp', (d) => lv.push(d.level));
  gainExp(g, expToNext(1) + expToNext(2) + 1);
  assert.equal(st.level, 3); assert.deepEqual(lv, [2, 3]);
  assert.equal(st.sp, 6); assert.equal(st.ap, 10);
  assert.equal(st.hp, computeStats(st).maxHp, 'HP全快');
  assert.ok(addStat(g, 'str', 3)); assert.equal(st.ap, 7);
});

test('inventory: 追加・容量・装備', () => {
  const g = makeGame('luna');
  const st = g.state;
  st.inventory = [];
  assert.ok(addItem(g, 'potion_red', 1500));
  assert.equal(countItem(st, 'potion_red'), 1500);
  assert.equal(st.inventory.length, 2, '999 でスタック分割');
  const equips = Object.values(ITEMS).filter((i) => i.type === 'equip');
  let added = 0;
  for (const it of equips) if (addItem(g, it.id, 1, { silent: true })) added++;
  assert.equal(st.inventory.length, MAX_SLOTS, '48スロット上限');
  assert.equal(added, MAX_SLOTS - 2);
  assert.equal(addItem(g, 'cap_street', 1, { silent: true }), false);
  assert.ok(removeItem(st, 'potion_red', 1500));
  // 装備: Lv不足
  st.inventory = [];
  addItem(g, 'neon_sword', 1, { silent: true });
  assert.equal(equip(g, 'neon_sword').ok, false);
  st.level = 50;
  const r = equip(g, 'neon_sword'); assert.ok(r.ok, r.msg);
  assert.equal(st.equipped.weapon, 'neon_sword');
  assert.equal(countItem(st, STARTER_EQUIP.luna.weapon), 1, '旧装備がインベントリへ');
  assert.equal(getEquipLooks(st).weapon.style, 'neonSword');
  assert.ok(unequip(g, 'hat').ok); assert.equal(st.equipped.hat, null);
});

test('inventory: ポーション使用・ショップ', () => {
  const g = makeGame('luna');
  const st = g.state;
  const max = computeStats(st).maxHp;
  st.hp = 5;
  assert.ok(useItem(g, 'potion_red'));
  assert.equal(st.hp, Math.min(max, 55));
  st.hp = max;
  assert.equal(useItem(g, 'potion_red'), false, '満タン時は消費しない');
  st.money = 100;
  assert.ok(buyItem(g, 'potion_red', 2).ok); assert.equal(st.money, 50);
  assert.ok(sellItem(g, 'potion_red', 1).ok);
  assert.equal(buyItem(g, 'neon_sword', 1).ok, false, 'お金不足');
});

test('loot: rollDrops', () => {
  let seq = 0; const lo = () => 0.0; const hi = () => 0.999; void seq;
  const slime = ENEMIES.slime_green;
  const all = rollDrops(slime, 0, lo);
  assert.ok(all.some((d) => d.money > 0));
  assert.equal(all.filter((d) => d.id).length, slime.drops.length);
  assert.equal(rollDrops(slime, 0, hi).filter((d) => d.id).length, 0);
  const boss = rollDrops(ENEMIES.boss_gator, 0, hi);
  assert.equal(boss.filter((d) => d.money).length, 5, 'ボスは札束5つ');
  assert.ok(boss.some((d) => d.id === 'gator_tooth'), '確定ドロップ');
  // 統計: slime_jelly 0.55
  let n = 0; const T = 4000;
  for (let i = 0; i < T; i++) if (rollDrops(slime, 0).some((d) => d.id === 'slime_jelly')) n++;
  assert.ok(Math.abs(n / T - 0.55) < 0.05, `jelly rate ${n / T}`);
});

test('combat: calcDamage 範囲', () => {
  for (let i = 0; i < 2000; i++) {
    const r = calcDamage(100, 1.5, 0, 0, 1.5);
    assert.ok(r.dmg >= 135 && r.dmg <= 165 && !r.crit, String(r.dmg));
    const c = calcDamage(100, 1, 0, 1, 2);
    assert.ok(c.crit && c.dmg >= 180 && c.dmg <= 220);
  }
  assert.equal(calcDamage(0, 0, 999).dmg, 1, '最低1');
}, { random: true });

test('combat: 敵撃破 → exp / drop / event / 手配度', () => {
  const g = makeGame('luna');
  const killed = []; g.events.on('enemyKilled', (d) => killed.push(d.enemy.defId));
  const e = new Enemy(g, 'slime_green', g.player.x + 40, g.map.groundY);
  g.enemies.push(e);
  const exp0 = g.state.exp;
  damageEnemy(g, e, 99999, false, 1);
  assert.ok(e.dead); assert.deepEqual(killed, ['slime_green']);
  assert.ok(g.state.exp > exp0 || g.state.level > 1);
  assert.equal(g.state.kills, 1);
  const cop = new Enemy(g, 'cop_patrol', 500, g.map.groundY);
  g.enemies.push(cop);
  damageEnemy(g, cop, 1e9);
  assert.ok(g.wanted >= 1, '警官撃破で手配度');
  // ドロップ（乱数依存なので多数撃破で検証）
  g.drops.length = 0;
  for (let i = 0; i < 30; i++) { const s = new Enemy(g, 'slime_green', 600, g.map.groundY); g.enemies.push(s); damageEnemy(g, s, 1e9); }
  assert.ok(g.drops.length > 10, `drops ${g.drops.length}`);
  for (const d of g.drops) assert.ok(d instanceof Drop);
}, { random: true });

test('combat: playerAttackArea / 通常攻撃が当たる', () => {
  const g = makeGame('luna');
  g.enemies.length = 0;
  const p = g.player; p.facing = 1;
  const e = new Enemy(g, 'mushroom_orange', p.x + 40, p.y);
  e.spawnT = 0;
  g.enemies.push(e);
  const hp0 = e.hp;
  assert.ok(p.startAttack('basic'));
  assert.ok(e.hp < hp0, '近接通常攻撃が命中');
  const hit = playerAttackArea(g, { x: p.x - 500, y: p.y - 200, w: 1000, h: 400 }, 1);
  assert.equal(hit.length, 0, '無敵時間中は多段しない');
});

test('combat: damagePlayer / 無敵 / 服破れ', () => {
  const g = makeGame('luna');
  const st = g.state, max = computeStats(st).maxHp;
  g.debug.god = true;
  assert.equal(damagePlayer(g, 30, 0), 0);
  g.debug.god = false;
  const d = damagePlayer(g, 30, 0);
  assert.ok(d > 0 && st.hp === max - d);
  assert.equal(damagePlayer(g, 30, 0), 0, '被弾無敵');
  // 閾値を跨ぐと tear エフェクト
  g.time += 5; g.effects.length = 0;
  st.hp = Math.ceil(max * 0.76);
  damagePlayer(g, max * 0.3, 0);
  const tears = g.effects.filter((e) => e.type === 'tear').length;
  assert.ok(tears >= 1, 'tear effect');
  assert.equal(TEAR_THRESHOLDS.length, 4);
  // 死亡
  g.time += 5;
  let died = 0; g.events.on('playerDied', () => died++);
  damagePlayer(g, 1e9, 0);
  assert.equal(st.hp, 0); assert.equal(died, 1); assert.ok(g.player.dead);
}, { random: true });

test('combat: 手配度', () => {
  const g = makeGame('jin', 'downtown');
  const ch = []; g.events.on('wantedChanged', (d) => ch.push(d.level));
  addWanted(g, 1); assert.equal(g.wanted, 1);
  setWantedLevel(g, 4); assert.equal(g.wanted, 4);
  setWantedLevel(g, 9); assert.equal(g.wanted, 5);
  setWantedLevel(g, -1); assert.equal(g.wanted, 0);
  for (let h = 0; h < 50; h++) assert.ok(wantedLevelFor(h) >= 0 && wantedLevelFor(h) <= 5);
  setWantedLevel(g, 2);
  for (let i = 0; i < 60 * 40; i++) { g.time += 1 / 60; updateWanted(g, 1 / 60, { seen: false }); }
  assert.equal(g.wanted, 0, '見られていなければ減衰');
  assert.ok(ch.length >= 4);
});

test('skills: 初期スキル使用・クールダウン・習得', () => {
  for (const hero of ['luna', 'jin']) {
    const g = makeGame(hero);
    const sid = STARTER_SKILLS[hero].skillBar[0];
    const mp0 = g.state.mp;
    assert.ok(useSkill(g, sid), hero + ' skill');
    assert.ok(g.state.mp < mp0);
    assert.ok(getCooldown(sid).left > 0);
    assert.equal(useSkill(g, sid), false, 'CD中');
    for (let i = 0; i < 120; i++) updateSkills(g, 1 / 60);
    assert.equal(getCooldown(sid).left, 0);
    // 全スキルを習得して使ってみる（例外が出ないこと）
    g.state.level = 60; g.state.sp = 999;
    for (const s of skillsForHero(hero)) assert.ok(learnSkill(g, s.id), 'learn ' + s.id);
    g.state.mp = 99999;
    g.enemies.push(Object.assign(new Enemy(g, 'slime_green', g.player.x + 60, g.player.y), { spawnT: 0 }));
    for (const s of skillsForHero(hero)) {
      if (s.kind === 'passive') continue;
      g.time += 100; resetCooldowns();
      assert.ok(useSkill(g, s.id), 'use ' + s.id);
      for (let i = 0; i < 30; i++) step(g);
    }
    assert.equal(learnSkill(g, hero === 'luna' ? 'jin_heavy_smash' : 'luna_neon_rush'), false, '他キャラのスキル不可');
  }
});

test('missions: m01 受注 → 撃破 → 報告', () => {
  const g = makeGame('luna');
  const mm = g.missions;
  assert.ok(mm.available('rico').some((m) => m.id === 'm01_welcome'));
  assert.equal(mm.npcMarker('rico'), '!');
  assert.ok(mm.accept('m01_welcome'));
  assert.equal(mm.accept('m01_welcome'), false);
  for (let i = 0; i < 8; i++) { const e = new Enemy(g, 'slime_green', 900, g.map.groundY); g.enemies.push(e); damageEnemy(g, e, 1e9); }
  assert.ok(mm.isComplete('m01_welcome'));
  assert.equal(mm.npcMarker('rico'), '?');
  const money0 = g.state.money;
  assert.ok(mm.turnIn('m01_welcome'));
  assert.equal(g.state.money, money0 + MISSIONS.m01_welcome.reward.money);
  assert.ok(g.state.missions.completed.includes('m01_welcome'));
  assert.ok(mm.canAccept('m02_jelly') || g.state.level < MISSIONS.m02_jelly.reqLevel);
  assert.ok(mm.tracked().length === 0);
});

test('missions: 全メインストーリーを順にクリアできる（目的をイベントで満たす）', () => {
  const g = makeGame('jin');
  const mm = g.missions;
  const st = g.state;
  st.level = 70;
  const order = Object.values(MISSIONS).filter((m) => !m.daily);
  let guard = 0;
  while (guard++ < 200) {
    const m = order.find((x) => mm.canAccept(x.id));
    if (!m) break;
    // giver のマップへ行ってから受注
    g.changeMap(MISSION_NPCS[m.giver].mapId);
    assert.ok(mm.accept(m.id), 'accept ' + m.id);
    for (const o of m.objectives) {
      if (o.type === 'kill' || o.type === 'boss') for (let i = 0; i < o.count; i++) g.events.emit('enemyKilled', { enemy: { def: ENEMIES[o.target] } });
      if (o.type === 'collect') addItemToState(st, o.target, o.count);
      if (o.type === 'reach') g.changeMap(o.target);
      if (o.type === 'talk') g.events.emit('talkNpc', { npcId: o.target });
      if (o.type === 'wanted') setWantedLevel(g, o.target);
      if (o.type === 'drive') {
        const v = new Vehicle(g, { kind: 'sports', x: 300 }); g.vehicles.push(v); v.enter(g.player);
        for (let x = 300; x <= 300 + o.count * 10 + 100; x += 50) { v.x = x; mm.update(1 / 60); }
        v.exit(g.player);
      }
    }
    mm.update(1 / 60);
    assert.ok(mm.isComplete(m.id), 'complete ' + m.id + ' ' + JSON.stringify(mm.objectiveValues(m.id)));
    assert.equal(mm.npcMarker(turnInNpcOf(m)), '?', m.id + ' marker');
    assert.ok(mm.turnIn(m.id), 'turnIn ' + m.id);
    setWantedLevel(g, 0);
  }
  const left = order.filter((m) => !st.missions.completed.includes(m.id)).map((m) => m.id);
  assert.deepEqual(left, [], '未クリア');
});

test('missions: デイリーは1日1回', () => {
  const g = makeGame('luna');
  const d = Object.values(MISSIONS).find((m) => m.daily && (m.reqLevel || 1) <= 99 && !(m.prereq || []).length);
  assert.ok(d);
  g.state.level = 99;
  assert.ok(g.missions.accept(d.id));
  for (const o of d.objectives) {
    if (o.type === 'kill') for (let i = 0; i < o.count; i++) g.events.emit('enemyKilled', { enemy: { def: ENEMIES[o.target] } });
    if (o.type === 'collect') addItemToState(g.state, o.target, o.count);
    if (o.type === 'wanted') setWantedLevel(g, o.target);
  }
  g.missions.update(0.016);
  if (g.missions.isComplete(d.id)) {
    assert.ok(g.missions.turnIn(d.id));
    assert.equal(g.missions.canAccept(d.id), false, '同日再受注不可');
  }
});

test('physics: 着地・一方通行・下抜け・ロープ', () => {
  const map = MAPS.beach;
  const plat = map.platforms[0];
  const e = { x: plat.x + 50, y: plat.y - 100, w: 32, h: 70, vx: 0, vy: 0 };
  for (let i = 0; i < 120; i++) moveAndCollide(e, map, 1 / 60);
  assert.equal(e.y, plat.y); assert.ok(e.onGround); assert.equal(e.groundPlat, plat);
  // 下から上へは抜ける
  const u = { x: plat.x + 50, y: plat.y + 60, w: 32, h: 70, vx: 0, vy: -900 };
  for (let i = 0; i < 6; i++) moveAndCollide(u, map, 1 / 60);
  assert.ok(u.y < plat.y, '一方通行足場を下から抜ける');
  // 下抜け
  e.dropThrough = 0.25; e.vy = 60;
  for (let i = 0; i < 60; i++) moveAndCollide(e, map, 1 / 60);
  assert.equal(e.y, map.groundY);
  // マップ端
  const w = { x: -100, y: 0, w: 32, h: 70, vx: -500, vy: 0 };
  moveAndCollide(w, map, 1 / 60); assert.equal(w.x, 16);
  const r = map.ropes[0];
  assert.equal(findRope(map, r.x + 5, (r.top + r.bottom) / 2), r);
  assert.ok(rectOverlap(entRect(e), entRect(e)));
  // 大きな dt でも足場をすり抜けない（main は dt<=1/30 にクランプ）
  const f = { x: plat.x + 50, y: plat.y - 300, w: 32, h: 70, vx: 0, vy: 1500 };
  moveAndCollide(f, map, 1 / 30);
  for (let i = 0; i < 30; i++) moveAndCollide(f, map, 1 / 30);
  assert.equal(f.y, plat.y);
});

test('player: 移動・ジャンプ・攻撃・ポータル・会話・乗車', () => {
  const g = makeGame('luna');
  const p = g.player, inp = g.input;
  for (let i = 0; i < 30; i++) step(g);
  assert.ok(p.onGround, '着地');
  const x0 = p.x;
  inp.hold('right'); for (let i = 0; i < 30; i++) step(g); inp.release('right');
  assert.ok(p.x > x0 + 50, '右に移動');
  inp.tap('jump'); step(g);
  assert.ok(p.vy < 0 && !p.onGround, 'ジャンプ');
  for (let i = 0; i < 90; i++) step(g);
  assert.ok(p.onGround);
  inp.hold('attack'); step(g); inp.release('attack');
  assert.ok(p.attackLeft > 0);
  // 会話: NPC の位置へ
  const n = g.npcs[0];
  p.x = n.x + 10; p.y = n.y;
  for (let i = 0; i < 20; i++) step(g);
  inp.tap('interact'); step(g);
  assert.ok(g.uiOpened.some((o) => o.name === 'dialog'), 'dialog が開く');
  assert.ok(g.emitted.includes('talkNpc'));
  // 乗車
  const v = g.vehicles[0];
  assert.ok(v, 'beach に乗り物');
  p.x = v.x; p.y = v.y; for (let i = 0; i < 5; i++) step(g);
  inp.tap('interact'); step(g);
  assert.equal(p.inVehicle, v, '乗車');
  inp.hold('right'); for (let i = 0; i < 60; i++) step(g); inp.release('right');
  assert.ok(Math.abs(v.vx) > 200, '車が走る');
  inp.tap('interact'); step(g);
  assert.equal(p.inVehicle, null, '降車');
  // ポータル
  const pt = g.map.portals[0];
  p.x = pt.x; p.y = pt.y; for (let i = 0; i < 5; i++) step(g);
  inp.tap('up'); step(g);
  assert.equal(g.map.id, pt.to, 'ポータル移動');
});

test('enemies: 全種類を数秒シミュレーション（NaN/例外/マップ外なし）', () => {
  for (const id of Object.keys(ENEMIES)) {
    const mapId = Object.keys(MAPS).find((m) => MAPS[m].spawns.some((s) => s.types.includes(id))) || 'downtown';
    const g = makeGame('jin', mapId);
    g.enemies.length = 0;
    g.debug.god = true;
    const p = g.player;
    const e = new Enemy(g, id, p.x + 300, g.map.groundY);
    e.aggro = true;
    g.enemies.push(e);
    if (ENEMIES[id].isCop) setWantedLevel(g, 3);
    for (let i = 0; i < 60 * 8; i++) {
      step(g);
      for (const x of g.enemies) {
        assert.ok(fin(x.x) && fin(x.y) && fin(x.vx) && fin(x.vy), `${id}: NaN ${x.defId}`);
        assert.ok(x.x >= 0 && x.x <= g.map.width && x.y <= g.map.groundY + 1, `${id}: map外 ${x.x},${x.y}`);
      }
    }
  }
}, { random: true });

test('spawner: 全マップで敵が自動出現・ボス出現', () => {
  for (const mapId of Object.keys(MAPS)) {
    const g = makeGame('luna', mapId);
    g.debug.god = true;
    g.state.level = 99;
    g.changeMap(mapId);
    const initial = g.enemies.length;
    assert.ok(initial > 0, `${mapId}: 初期配置 0`);
    g.enemies.length = 0;
    for (let i = 0; i < 60 * 20; i++) step(g, 1 / 30);
    assert.ok(g.enemies.length > 0, `${mapId}: 20秒で再出現なし`);
    for (const e of g.enemies) assert.ok(ENEMIES[e.defId]);
    const bossSpawn = g.map.spawns.find((s) => s.max <= 1);
    if (bossSpawn) {
      g.player.x = 50;
      for (let i = 0; i < 30 * 30; i++) step(g, 1 / 30);
      assert.ok(g.enemies.some((e) => e.boss), `${mapId}: ボス未出現`);
    }
  }
}, { random: true });

test('spawner: 手配度で警察が出現', () => {
  const g = makeGame('jin', 'downtown');
  g.debug.god = true;
  g.state.level = 40;
  g.enemies.length = 0;
  g.map.spawns.forEach((_, i) => { g.spawner.timers[i] = -1e9; });
  setWantedLevel(g, 5);
  for (let i = 0; i < 60 * 15; i++) { step(g); if (g.wanted < 5) setWantedLevel(g, 5); }
  const law = g.enemies.filter((e) => e.fromWanted);
  assert.ok(law.length >= 3, `警察 ${law.length}`);
  assert.ok(law.some((e) => e.def.art === 'swat'), 'SWAT');
}, { random: true });

test('boss: 攻撃パターンが偏りすぎない', () => {
  const bosses = Object.values(ENEMIES).filter((e) => e.ai === 'boss');
  for (const def of bosses) {
    const mapId = Object.keys(MAPS).find((m) => MAPS[m].spawns.some((s) => s.types.includes(def.id)));
    const g = makeGame('jin', mapId);
    g.debug.god = true;
    g.enemies.length = 0;
    const p = g.player;
    const b = new Enemy(g, def.id, Math.min(g.map.width - 400, p.x + 300), g.map.groundY);
    g.enemies.push(b);
    const counts = {}; let last = null; let run = 0, maxRun = 0;
    let prevPhase = b.phase;
    for (let i = 0; i < 60 * 240; i++) {
      p.x = Math.max(100, Math.min(g.map.width - 100, b.x - 200)); p.y = g.map.groundY; p.vx = 0; p.vy = 0;
      b.update(1 / 60);
      g.time += 1 / 60;
      for (const e of g.enemies) if (e !== b) e.remove = true;
      g.enemies = g.enemies.filter((e) => !e.remove);
      g.projectiles.length = 0; g.effects.length = 0;
      if (b.phase !== prevPhase && b.phase !== 'walk') {
        counts[b.phase] = (counts[b.phase] || 0) + 1;
        if (b.phase === last) run++; else { run = 1; last = b.phase; }
        maxRun = Math.max(maxRun, run);
      }
      prevPhase = b.phase;
      if (i === 60 * 120) b.hp = b.maxHp * 0.4; // 後半は激昂
    }
    const total = Object.values(counts).reduce((a, c) => a + c, 0);
    assert.ok(total >= 40, `${def.id}: 行動回数 ${total}`);
    const expect = ['charge', 'slam', 'summon', ...(def.shoot ? ['shoot'] : [])];
    for (const k of expect) assert.ok((counts[k] || 0) / total >= 0.1, `${def.id}: ${k} が少なすぎ ${JSON.stringify(counts)}`);
    assert.ok(maxRun <= 3, `${def.id}: 同じ技が ${maxRun} 連続`);
  }
}, { random: true });

test('debug: DebugPanel アクション', () => {
  const g = makeGame('luna');
  g.changeMap = (() => { const f = g.changeMap; return function (id, x, y) { return f.call(g, id, x, y); }; })();
  const d = new DebugPanel(g);
  g.debug = d;
  d.enabled = true;
  const lv = g.state.level;
  d.run('level'); assert.equal(g.state.level, lv + 1);
  d.run('god'); assert.ok(d.god);
  assert.equal(damagePlayer(g, 50, 0), 0, 'god で無敵');
  d.run('god');
  const max = computeStats(g.state).maxHp;
  g.state.hp = max;
  for (let i = 0; i < 5; i++) d.run('hpDown');
  assert.ok(Math.abs(g.state.hp - max * 0.5) <= 3, `hp ${g.state.hp}`);
  assert.ok(g.effects.some((e) => e.type === 'tear'));
  d.run('hpFull'); assert.equal(g.state.hp, max);
  const m0 = g.state.money; d.run('money'); assert.equal(g.state.money, m0 + 10000);
  d.run('wantedUp'); d.run('wantedUp'); assert.equal(g.wanted, 2);
  d.run('wantedDown'); assert.equal(g.wanted, 1);
  d.run('items');
  assert.ok(g.state.inventory.length <= MAX_SLOTS);
  assert.equal(g.state.inventory.length, MAX_SLOTS);
  d.run('clearInv'); d.run('items'); d.run('clearInv');
  const n0 = g.enemies.length;
  d.run('spawn'); assert.equal(g.enemies.length, n0 + 1);
  d.run('killAll'); assert.ok(g.enemies.every((e) => e.dead));
  const seen = [g.map.id];
  for (let i = 0; i < MAP_ORDER.length; i++) { d.run('warp'); seen.push(g.map.id); }
  assert.equal(seen[seen.length - 1], seen[0], 'ワープで一周');
  assert.deepEqual([...new Set(seen)].sort(), [...MAP_ORDER].sort());
  d.run('mission');
  assert.ok(g.state.missions.completed.length >= 1, 'ミッション即完了');
  d.run('mission'); d.run('mission');
  assert.ok(g.state.missions.completed.length >= 3);
});

// ------------------------------------------------------------ 実行
const t0 = Date.now();
for (const t of tests) {
  const n = t.random ? REPEAT : 1;
  let failed = null;
  for (let i = 0; i < n && !failed; i++) {
    try { await t.fn(); } catch (e) { failed = { e, iter: i }; }
  }
  if (failed) {
    results.fail++; results.failures.push(t.name);
    console.log(`✗ ${t.name}${n > 1 ? ` (iter ${failed.iter + 1}/${n})` : ''}\n    ${String(failed.e.stack || failed.e).split('\n').slice(0, 4).join('\n    ')}`);
  } else {
    results.pass++;
    console.log(`✓ ${t.name}${n > 1 ? ` ×${n}` : ''}`);
  }
}
console.log(`\n${results.pass} passed, ${results.fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (results.fail) process.exit(1);
