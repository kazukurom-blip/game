// 自動出現 + 手配度（GTA風）による警官 / SWAT / ドローン / パトカー出現
import { ENEMIES, COP_UNITS_BY_WANTED } from '../data/enemies.js';
import * as combat from '../systems/combat.js';
import { spawnEffect } from '../render/effects.js';
import { Enemy } from './enemy.js';
import { Vehicle } from './vehicle.js';
import { MAPS, buildTowerFloor, openTowerExit } from '../world/maps.js';
import { sysFn, nightNow } from '../world/sys.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 手配度ごとの出現上限 {cop, swat, drone, car}
const WANTED_TABLE = [
  { cop: 0, swat: 0, drone: 0, car: 0 },
  { cop: 1, swat: 0, drone: 0, car: 0 },
  { cop: 3, swat: 0, drone: 0, car: 1 },
  { cop: 3, swat: 2, drone: 0, car: 1 },
  { cop: 3, swat: 3, drone: 2, car: 2 },
  { cop: 5, swat: 5, drone: 4, car: 2 },
];

function findByArt(art) {
  const list = Object.values(ENEMIES || {}).filter((e) => e.art === art && !e.boss);
  list.sort((a, b) => (a.level || 0) - (b.level || 0));
  return list;
}

// ---------------------------------------------------------------- 出現テーブル
const isMonster = (e) => e && !e.isCop && !e.civilian && e.ai !== 'civilian' && e.ai !== 'cop';
const isBossDef = (e) => !!(e && (e.boss || e.ai === 'boss'));

/** フィールドの通常敵候補（habitats に mapId を含む非ボス・非警官・非市民）。無ければ Lv 帯で代替 */
export function habitatTypes(map) {
  const all = Object.values(ENEMIES || {});
  let list = all.filter((e) => isMonster(e) && !isBossDef(e) && (e.habitats || []).includes(map.id));
  if (!list.length && map.levelRange) {
    const [a, b] = map.levelRange;
    list = all.filter((e) => isMonster(e) && !isBossDef(e) && (e.level || 1) >= a - 3 && (e.level || 1) <= b + 3);
    if (!list.length) {
      list = all.filter((e) => isMonster(e) && !isBossDef(e))
        .sort((x, y) => Math.abs((x.level || 1) - (a + b) / 2) - Math.abs((y.level || 1) - (a + b) / 2)).slice(0, 3);
    }
  }
  return list.sort((x, y) => (x.level || 0) - (y.level || 0)).map((e) => e.id);
}

/** ボス候補（boss:true かつ habitats に mapId）。無ければ Lv が最も近いボスで代替（行き止まりマップのみ） */
export function habitatBosses(map) {
  const all = Object.values(ENEMIES || {}).filter((e) => isBossDef(e) && !e.isCop && !e.civilian);
  const list = all.filter((e) => (e.habitats || []).includes(map.id));
  if (list.length) return list.map((e) => e.id);
  if (!map.levelRange || all.length === 0) return [];
  const mid = (map.levelRange[0] + map.levelRange[1]) / 2;
  return [all.sort((x, y) => Math.abs((x.level || 1) - mid) - Math.abs((y.level || 1) - mid))[0].id];
}

/** 夜限定の敵（def.night）は夜のみ */
export function timeOk(def, night) { return !def?.night || !!night; }

export function civilianTypes() {
  return Object.values(ENEMIES || {}).filter((e) => e.civilian || e.ai === 'civilian').map((e) => e.id);
}

/**
 * マップの出現エリア表を解決する（types 省略時は habitats から自動、ボス枠は boss:true）。
 * 町ではモンスター枠を作らない（市民は Spawner が別管理）。フィールドでは警官・市民を除外。
 */
export function resolveSpawns(map) {
  if (!map) return [];
  const out = [];
  const auto = habitatTypes(map);
  const raw = map.spawns || [];
  const normal = raw.filter((s) => !s.boss && !(s.types || []).some((t) => isBossDef(ENEMIES[t])));
  raw.forEach((s) => {
    let types = (s.types || []).filter((t) => ENEMIES[t]);
    let boss = !!s.boss || types.some((t) => isBossDef(ENEMIES[t]));
    if (!s.types || !s.types.length) types = boss ? habitatBosses(map) : auto;
    if (map.town) types = types.filter((t) => ENEMIES[t].civilian || ENEMIES[t].ai === 'civilian');
    else types = types.filter((t) => isMonster(ENEMIES[t]));
    if (!types.length) return;
    // 自動選択の通常枠: エリアごとにレベル順の窓をずらして個性を出す
    if (!boss && (!s.types || !s.types.length) && types.length >= 4 && normal.length > 1) {
      const i = normal.indexOf(s), n = normal.length;
      const win = Math.max(3, Math.ceil(types.length * 0.6));
      const st = Math.round((types.length - win) * (i / (n - 1)));
      types = types.slice(st, st + win);
    }
    let minLevel = s.minLevel;
    if (boss && minLevel == null) {
      const lv = Math.min(...types.map((t) => ENEMIES[t].minLevel ?? Math.max(1, (ENEMIES[t].level || 1) - 3)));
      minLevel = Math.min(lv, map.levelRange ? map.levelRange[1] : lv);
    }
    out.push({ ...s, types, boss, max: boss ? 1 : s.max, minLevel });
  });
  return out;
}

export class Spawner {
  constructor(game) {
    this.game = game;
    this.map = null;
    this.areas = [];
    this.timers = [];
    this.wantedT = 0;
    this.decayHold = 0;
    this._ids = null;
    this.civT = 0;
    this.civTarget = 8;
  }

  // 警察系の敵ID（ENEMIES から art/isCop で解決）
  get ids() {
    if (this._ids) return this._ids;
    const cops = findByArt('cop').filter((e) => !e.civilian);
    const fallbackCop = Object.values(ENEMIES || {}).filter((e) => e.isCop && e.art !== 'swat' && e.art !== 'drone');
    this._ids = {
      cop: (cops.length ? cops : fallbackCop).map((e) => e.id),
      swat: findByArt('swat').map((e) => e.id),
      drone: findByArt('drone').filter((e) => e.isCop || /police|cop|swat/i.test(e.id)).map((e) => e.id),
    };
    if (!this._ids.drone.length) this._ids.drone = findByArt('drone').filter((e) => e.isCop).map((e) => e.id);
    return this._ids;
  }

  reset(map) {
    this.map = map;
    this.inst = null;
    const g0 = this.game;
    if (map && map.town && !map.instance) g0.lastTownId = map.id;
    if (map && map.instance) {
      this.areas = []; this.timers = [];
      this.wantedT = 1.5; this.civT = 0;
      this.resetInstance(map);
      return;
    }
    this.areas = resolveSpawns(map);
    // ボス枠（max<=1）は入場 ~15 秒後に初回出現。他はランダム位相
    this.timers = this.areas.map((s) => (s.max <= 1 ? Math.max(0, (s.interval || 5) - 15) : rand(0, s.interval || 5)));
    this.wantedT = 1.5;
    this.civT = 0;
    this.civTarget = 6 + Math.floor(Math.random() * 5);
    const g = this.game;
    // 初期配置: 各エリアを上限の 6〜7 割まで埋める（ボスは除く）
    this.areas.forEach((s, i) => {
      const n = s.max <= 1 || (s.minLevel && (g.state?.level || 1) < s.minLevel) ? 0 : Math.ceil((s.max || 3) * 0.65);
      for (let k = 0; k < n; k++) this.spawnInArea(i, true);
    });
    if (map.town) for (let k = 0; k < this.civTarget; k++) this.spawnCivilian(true);
  }

  // エリア内の出現候補点（地面 + エリアと重なる足場）
  candidates(s) {
    const map = this.map;
    const pts = [];
    const x1 = Math.max(40, s.x1), x2 = Math.min(map.width - 40, s.x2);
    for (let i = 0; i < 4; i++) pts.push({ x: rand(x1, x2), y: map.groundY });
    for (const p of map.platforms || []) {
      if (p.ceiling) continue;
      const a = Math.max(x1, p.x + 20), b = Math.min(x2, p.x + p.w - 20);
      if (b > a) pts.push({ x: rand(a, b), y: p.y, plat: p });
    }
    return pts;
  }

  isOnScreen(x, y, margin = 80) {
    const { cam, W, H } = this.game;
    return x > cam.x - margin && x < cam.x + W + margin && y > cam.y - margin && y < cam.y + H + margin;
  }

  spawnInArea(i, initial = false) {
    const g = this.game, s = this.areas[i];
    if (!s) return null;
    const types = (s.types || []).filter((t) => ENEMIES[t]);
    if (!types.length) return null;
    // 昼夜: systems/night.js の enemyAvailableNow（night/day 指定）があれば使う
    const night = nightNow(g);
    const avail = sysFn('enemyAvailableNow', g, 'night');
    const okTypes = types.filter((t) => { if (avail) { try { return !!avail(g, ENEMIES[t]); } catch (e) { /* fallthrough */ } } return timeOk(ENEMIES[t], night); });
    if (!okTypes.length) return null;
    const type = pick(okTypes);
    const def = ENEMIES[type];
    // 安全装置: 町にモンスター、フィールドに警官/市民は出さない
    if (this.map.town ? !(def.civilian || def.ai === 'civilian') : !isMonster(def)) return null;
    const p = g.player;
    let pts = this.candidates(s);
    // ボスは地面に
    if (isBossDef(def)) pts = pts.filter((q) => !q.plat);
    pts.sort(() => Math.random() - 0.5);
    const far = (q) => !p || Math.abs(q.x - p.x) > 260 || Math.abs(q.y - p.y) > 200;
    let pt = pts.find((q) => far(q) && !this.isOnScreen(q.x, q.y)) || pts.find(far);
    if (!pt) return null;
    const e = new Enemy(g, type, pt.x, pt.y, { spawnIdx: i, x1: pt.plat ? pt.plat.x : s.x1, x2: pt.plat ? pt.plat.x + pt.plat.w : s.x2 });
    if (pt.plat) { e.groundPlat = pt.plat; e.onGround = true; }
    g.enemies.push(e);
    if (!initial && this.isOnScreen(pt.x, pt.y, 0)) spawnEffect(g, 'smoke', pt.x, pt.y - 20);
    if (isBossDef(def) && !initial) g.notify(`⚠ ${def.name} が現れた！`, '#ff4d6d');
    return e;
  }

  // 町の市民（左右に歩く・殴られると逃げる）。画面外の地面/足場に出現
  spawnCivilian(initial = false) {
    const g = this.game, map = this.map, p = g.player;
    const types = civilianTypes();
    if (!types.length) return null;
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push({ x: rand(120, map.width - 120), y: map.groundY });
    for (const pl of map.platforms || []) if (!pl.ceiling && pl.w > 120 && Math.random() < 0.3) pts.push({ x: rand(pl.x + 30, pl.x + pl.w - 30), y: pl.y, plat: pl });
    const nearPortal = (q) => (map.portals || []).some((pt) => Math.abs(pt.x - q.x) < 60);
    const ok = (q) => !nearPortal(q) && (!p || Math.abs(q.x - p.x) > 200) && (initial || !this.isOnScreen(q.x, q.y));
    const pt = pts.find(ok) || pts.find((q) => !nearPortal(q));
    if (!pt) return null;
    const e = new Enemy(g, pick(types), pt.x, pt.y, { civilian: true, x1: pt.plat ? pt.plat.x : 60, x2: pt.plat ? pt.plat.x + pt.plat.w : map.width - 60 });
    if (pt.plat) { e.groundPlat = pt.plat; e.onGround = true; }
    g.enemies.push(e);
    return e;
  }

  update(dt) {
    const g = this.game, map = this.map;
    if (!map || !g.player) return;
    if (map.instance) { this.updateInstance(dt); return; }
    // 昼になったら夜限定の敵は画面外で静かに退場
    this.nightT = (this.nightT || 0) - dt;
    if (this.nightT <= 0) {
      this.nightT = 2;
      if (!nightNow(g)) for (const e of g.enemies) if (e.def?.night && !e.dead && !e.aggro && !this.isOnScreen(e.x, e.y)) e.remove = true;
    }
    // --- 通常出現 ---
    this.areas.forEach((s, i) => {
      if (s.minLevel && (g.state?.level || 1) < s.minLevel) return;
      this.timers[i] = (this.timers[i] || 0) + dt;
      if (this.timers[i] < (s.interval || 5)) return;
      const alive = g.enemies.filter((e) => e.spawnIdx === i && !e.dead && !e.remove).length;
      if (alive < (s.max || 3)) {
        this.timers[i] = 0;
        this.spawnInArea(i);
      } else this.timers[i] = (s.interval || 5) * 0.5;
    });
    // --- 市民（町のみ, 常時 6〜10 人） ---
    if (map.town) {
      this.civT -= dt;
      if (this.civT <= 0) {
        const alive = g.enemies.filter((e) => e.civilian && !e.dead && !e.remove).length;
        this.civT = alive < 6 ? 0.8 : 2.5;
        if (alive < this.civTarget) this.spawnCivilian();
        if (Math.random() < 0.05) this.civTarget = 6 + Math.floor(Math.random() * 5);
      }
    }
    this.updateWanted(dt);
  }

  // ---------------- v3: インスタンス（タワー / アリーナ / ボス部屋） ----------------
  resetInstance(map) {
    const g = this.game;
    // 出口ポータルは入場前の町へ（コンシェルジュの前に出る）
    const home = g.lastTownId && MAPS[g.lastTownId]?.town ? g.lastTownId : null;
    for (const p of map.portals) {
      if (!p.exit) continue;
      if (home) p.to = home;
      const dest = MAPS[p.to];
      const cg = dest?.npcs?.find((n) => n.service);
      p.toX = Math.round(cg ? Math.max(60, Math.min(dest.width - 60, cg.x - 120)) : dest?.spawnX ?? 260);
      if (dest && dest.portals.some((q) => Math.abs(q.x - p.toX) < 80)) p.toX = dest.spawnX;
      p.label = `${dest?.name || '町'}へ戻る`;
    }
    const inst = this.inst = { type: map.instance, t: 0, spawned: [], cleared: false, startT: g.time || 0 };
    if (map.instance === 'tower') {
      const floor = Math.max(1, Math.floor(g.towerFloor || 1));
      g.towerFloor = floor;
      const raw = callSafe(sysFn('towerFloorDef', g, 'tower'), floor, g);
      inst.def = normalizeFloorDef(raw, floor, g);
      inst.floor = floor;
      buildTowerFloor(map, floor, { boss: !!inst.def.boss, level: inst.def.level, name: inst.def.name });
      inst.delay = 0.8;
    } else if (map.instance === 'arena') {
      inst.wave = 0; inst.delay = 1.5; g.arenaWave = 0; g.arenaKills = 0;
    } else if (map.instance === 'boss') {
      const mode = g.bossMode || g.state?.bossMode || 'normal';
      inst.mode = mode;
      inst.mult = bossMult(sysFn('bossModeMult', g, 'bosses'), mode);
      inst.bossId = map.bossId; inst.delay = 1.2;
    }
  }

  /** インスタンス用の出現（倍率つき）。flag で全滅判定の対象に */
  spawnInstanceEnemy(id, x, y, opts = {}) {
    const g = this.game, map = this.map;
    if (!ENEMIES[id]) return null;
    const def = ENEMIES[id];
    let plat = null;
    if (y == null) {
      // 地面 or 足場（ボス・地上の敵は地面）
      const cands = (map.platforms || []).filter((p) => !p.ceiling && p.w > 120);
      if (!isBossDef(def) && cands.length && Math.random() < 0.45) {
        plat = pick(cands); x = rand(plat.x + 30, plat.x + plat.w - 30); y = plat.y;
      } else y = map.groundY;
    }
    if (x == null) x = rand(map.width * 0.35, map.width - 200);
    const e = new Enemy(g, id, x, y, { x1: plat ? plat.x : 40, x2: plat ? plat.x + plat.w : map.width - 40 });
    if (plat) { e.groundPlat = plat; e.onGround = true; }
    scaleEnemy(e, opts.hp ?? 1, opts.atk ?? 1, opts.level);
    e.instance = this.map.instance;
    e.aggro = opts.aggro ?? true;
    g.enemies.push(e);
    this.inst.spawned.push(e);
    spawnEffect(g, 'smoke', x, y - 20);
    return e;
  }

  instanceAlive() {
    return this.inst.spawned.filter((e) => !e.dead && !e.remove && this.game.enemies.includes(e)).length;
  }

  updateInstance(dt) {
    const g = this.game, inst = this.inst, map = this.map;
    if (!inst) return;
    inst.t += dt;
    if (inst.delay > 0) { inst.delay -= dt; if (inst.delay > 0) return; this.startInstance(); return; }
    if (inst.type === 'tower') {
      if (!inst.cleared && inst.started && this.instanceAlive() === 0) {
        inst.cleared = true;
        const r = callSafe(sysFn('towerClearFloor', g, 'tower'), g);
        const next = openTowerExit(map);
        if (next) spawnEffect(g, 'portal', next.x, next.y - 40);
        g.notify?.(`🏆 ${inst.floor}F クリア！ 右の扉から ${inst.floor + 1}F へ`, '#ffd23f');
        g.events?.emit('towerFloorCleared', { floor: inst.floor, result: r ?? null, time: inst.t });
      }
    } else if (inst.type === 'arena') {
      if (g.arenaEnded || g.arena?.ended) return;
      if (this.instanceAlive() === 0 && inst.started) {
        if (!inst.waveDone) {
          inst.waveDone = true; inst.next = 2.0;
          callSafe(sysFn('arenaWaveCleared', g, 'arena'), g, inst.wave);
          g.events?.emit('arenaWaveCleared', { wave: inst.wave });
          if (inst.wave > 0) g.notify?.(`WAVE ${inst.wave} クリア！`, '#5cff9a');
        }
        inst.next -= dt;
        if (inst.next <= 0) this.startArenaWave();
      }
    } else if (inst.type === 'boss') {
      const b = inst.boss;
      if (b && !inst.cleared && (b.dead || b.hp <= 0)) {
        inst.cleared = true;
        const info = { bossId: inst.bossId, mode: inst.mode, time: inst.t, maxHit: g.bossMaxHit || 0 };
        callSafe(sysFn('bossCleared', g, 'bosses'), g, inst.bossId, inst.mode, info);
        g.events?.emit('bossRoomCleared', info);
        g.notify?.(`👑 ${b.name} 討伐！ 左の出口から町へ戻れます`, '#ffd23f');
      }
    }
  }

  startInstance() {
    const g = this.game, inst = this.inst, map = this.map;
    if (inst.started) return;
    inst.started = true;
    if (inst.type === 'tower') {
      const d = inst.def;
      const list = [];
      for (const en of d.enemies) for (let i = 0; i < en.count; i++) list.push(en.id);
      list.forEach((id, i) => this.spawnInstanceEnemy(id, Math.round(map.width * 0.3 + (i / Math.max(1, list.length - 1)) * map.width * 0.6), undefined, { hp: d.hpMult, atk: d.atkMult, level: d.level }));
      if (d.boss) {
        const b = this.spawnInstanceEnemy(d.boss, map.width - 420, map.groundY, { hp: d.bossHpMult ?? d.hpMult, atk: d.atkMult, level: d.level });
        if (b) g.notify?.(`⚠ ${d.floorLabel || inst.floor + 'F'} ボス ${b.name}！`, '#ff4d6d');
      }
      if (d.miniBoss) {
        const mb = this.spawnInstanceEnemy(d.miniBoss.id, map.width - 520, map.groundY, { hp: d.miniBoss.hpMult, atk: d.atkMult * 1.3, level: d.level });
        if (mb) { mb.elite = true; mb.scale = (mb.scale || 1) * 1.3; mb.name = `【エリート】${mb.name}`; }
      }
      if (d.mutators?.length) g.notify?.(`特性: ${d.mutators.map((m) => m.name || m.id || m).join(' / ')}`, '#c9b6ff');
    } else if (inst.type === 'arena') {
      this.startArenaWave();
    } else if (inst.type === 'boss') {
      const m = inst.mult;
      const b = this.spawnInstanceEnemy(inst.bossId, map.bossX || map.width * 0.7, map.groundY, { hp: m.hp, atk: m.atk });
      inst.boss = b;
      if (b) {
        b.bossMode = inst.mode;
        g.notify?.(`⚠ ${b.name}（${MODE_NAMES[inst.mode] || inst.mode}）が現れた！`, '#ff4d6d');
        g.events?.emit('bossRoomStart', { bossId: inst.bossId, mode: inst.mode });
      }
    }
  }

  startArenaWave() {
    const g = this.game, inst = this.inst, map = this.map;
    inst.wave += 1; inst.waveDone = false; g.arenaWave = inst.wave;
    const raw = callSafe(sysFn('arenaWaveDef', g, 'arena'), inst.wave, g);
    const d = normalizeWaveDef(raw, inst.wave, g);
    for (const en of d.enemies) for (let i = 0; i < en.count; i++) {
      const x = Math.random() < 0.5 ? rand(200, map.width * 0.4) : rand(map.width * 0.6, map.width - 120);
      this.spawnInstanceEnemy(en.id, x, undefined, { hp: d.hpMult, atk: d.atkMult });
    }
    g.notify?.(`⚔ WAVE ${inst.wave}`, '#19f0ff');
    g.events?.emit('arenaWave', { wave: inst.wave });
  }

  // ---------------- 手配度 ----------------
  updateWanted(dt) {
    const g = this.game, p = g.player;
    // 警官に見られているか
    const law = g.enemies.filter((e) => !e.dead && !e.remove && (e.isCop || e.def?.isCop));
    const seen = law.some((e) => Math.abs(e.x - p.x) < 650 && Math.abs(e.y - p.y) < 260);
    const town = !!map(g).town;
    if (typeof combat.updateWanted === 'function') {
      // フィールド（警察なし）の素早い減衰は combat.updateWanted 側が map.town を見て行う
      combat.updateWanted(g, dt, { seen: town && seen });
    } else if (g.wantedHeat > 0) {
      // 自然減衰（警官に見られていない時のみ。見られていてもゆっくり）
      const rate = !town ? 2.5 + g.wantedHeat * 0.12 : seen ? 0 : 0.6 + g.wantedHeat * 0.03;
      g.wantedHeat = Math.max(0, g.wantedHeat - rate * dt);
      const lv = heatToLevel(g.wantedHeat);
      if (lv !== g.wanted) { g.wanted = lv; g.events.emit('wantedChanged', { level: lv }); }
    }

    // 警察（パトカー含む）は町のみ
    if (!town || map(g).copSpawns === false || !(g.wanted > 0)) return;
    this.wantedT -= dt;
    if (this.wantedT > 0) return;
    this.wantedT = g.wanted >= 5 ? 1.2 : 2.5;
    const lv = Math.min(5, Math.max(0, Math.floor(g.wanted)));
    const tab = WANTED_TABLE[lv];
    const all = this.ids;
    // ★ごとの出現ユニット表（enemies.js の COP_UNITS_BY_WANTED）に絞る。表に無い種別は出さない
    const allow = COP_UNITS_BY_WANTED?.[lv];
    const only = (list) => (allow ? list.filter((id) => allow.includes(id)) : list);
    const ids = { cop: only(all.cop), swat: only(all.swat), drone: only(all.drone) };
    const count = (list) => g.enemies.filter((e) => !e.dead && !e.remove && e.fromWanted && list.includes(e.defId)).length;
    if (ids.cop.length && count(ids.cop) < tab.cop) return this.spawnLaw(this.leveled(ids.cop));
    if (ids.swat.length && count(ids.swat) < tab.swat) return this.spawnLaw(this.leveled(ids.swat));
    if (ids.drone.length && count(ids.drone) < tab.drone) return this.spawnLaw(this.leveled(ids.drone), true);
    const cars = g.vehicles.filter((v) => v.policeSpawned && v.driverType === 'cop').length;
    if (all.cop.length && cars < tab.car && !p.inVehicle) this.spawnPoliceCar();
  }

  // プレイヤーLvに見合った（Lv+6 以下で最も強い）ユニットを選ぶ。一定確率で弱い方も混ぜる
  leveled(list) {
    const lv = this.game.state?.level || 1;
    const ok = list.filter((id) => (ENEMIES[id].level || 1) <= lv + 6);
    if (!ok.length) return list[0];
    return Math.random() < 0.7 ? ok[ok.length - 1] : pick(ok);
  }

  edgeX() {
    const g = this.game, p = g.player, map = this.map;
    let side = Math.random() < 0.5 ? -1 : 1;
    let x = side < 0 ? g.cam.x - 120 : g.cam.x + g.W + 120;
    if (x < 40 || x > map.width - 40) { side = -side; x = side < 0 ? g.cam.x - 120 : g.cam.x + g.W + 120; }
    x = Math.max(40, Math.min(map.width - 40, x));
    if (Math.abs(x - p.x) < 300) x = p.x + (x < p.x ? -1 : 1) * 300;
    return Math.max(40, Math.min(map.width - 40, x));
  }

  spawnLaw(id, air = false) {
    const g = this.game;
    if (!this.map || !this.map.town || !id) return null;
    const x = this.edgeX();
    const y = air ? g.player.y - 200 : this.map.groundY;
    const e = new Enemy(g, id, x, y, { fromWanted: true, x1: 0, x2: this.map.width });
    e.aggro = true;
    g.enemies.push(e);
    return e;
  }

  spawnPoliceCar() {
    const g = this.game;
    if (!this.map || !this.map.town) return;
    const x = this.edgeX();
    const v = new Vehicle(g, { kind: 'police', x, color: '#16213e', facing: x < g.player.x ? 1 : -1 });
    v.driver = true; v.driverType = 'cop'; v.policeSpawned = true;
    v.onCopExit = (car) => {
      const ids = this.ids;
      if (!ids.cop.length) return;
      for (let i = 0; i < 2; i++) {
        const e = new Enemy(g, this.leveled(ids.cop), car.x + (i ? 40 : -40), car.y, { fromWanted: true, x1: 0, x2: this.map.width });
        e.aggro = true;
        g.enemies.push(e);
      }
      spawnEffect(g, 'smoke', car.x, car.y - 20);
    };
    // 放置されたパトカーが溜まりすぎないよう古いものを消す
    const parked = g.vehicles.filter((c) => c.policeSpawned && !c.driverType);
    for (let i = 0; i < parked.length - 2; i++) parked[i].remove = true;
    g.vehicles.push(v);
  }
}

function map(g) { return g.map || {}; }

// combat.js に updateWanted がない場合のフォールバック（heat → ★。combat.WANTED_HEAT と同じ閾値）
export function heatToLevel(h) {
  if (typeof combat.wantedLevelFor === 'function') return combat.wantedLevelFor(h);
  const T = [0, 1, 5, 12, 22, 35];
  let lv = 0;
  for (let i = 1; i < T.length; i++) if (h >= T[i]) lv = i;
  return lv;
}

// ---------------------------------------------------------------- v3 インスタンス用ヘルパー
const MODE_NAMES = { normal: 'ノーマル', hard: 'ハード', chaos: 'カオス', practice: '練習' };
const DEFAULT_MODE_MULT = { normal: { hp: 1, atk: 1 }, hard: { hp: 3, atk: 1.6 }, chaos: { hp: 8, atk: 2.4 }, practice: { hp: 1, atk: 0.5 } };

function callSafe(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (e) { console.warn('[spawner sys]', e); return undefined; }
}

/** bossModeMult(mode) の戻り値（数値 / {hp, atk} / {hpMult, atkMult}）を {hp, atk} に */
export function bossMult(fn, mode) {
  let r = typeof fn === 'function' ? callSafe(fn, mode) : undefined;
  if (typeof r === 'number') return { hp: r, atk: r };
  if (r && typeof r === 'object') return { hp: r.hp ?? r.hpMult ?? 1, atk: r.atk ?? r.atkMult ?? r.dmg ?? 1 };
  return DEFAULT_MODE_MULT[mode] || DEFAULT_MODE_MULT.normal;
}

/** 敵を倍率で強化（def を個体ごとにコピー）。level 指定時は表示Lvも上書き */
export function scaleEnemy(e, hpMult = 1, atkMult = 1, level) {
  if (!e) return e;
  const hm = Number.isFinite(hpMult) && hpMult > 0 ? hpMult : 1;
  const am = Number.isFinite(atkMult) && atkMult > 0 ? atkMult : 1;
  if (hm === 1 && am === 1 && level == null) return e;
  e.def = { ...e.def, hp: Math.round((e.def.hp || 1) * hm), atk: Math.max(1, Math.round((e.def.atk || 1) * am)) };
  if (level != null && level > (e.level || 0)) { e.level = level; }
  e.maxHp = e.def.hp; e.hp = e.def.hp; e.lastHp = e.hp;
  return e;
}

const monsters = () => Object.values(ENEMIES || {}).filter((e) => isMonster(e) && !isBossDef(e) && !e.night);
const bosses = () => Object.values(ENEMIES || {}).filter((e) => isBossDef(e) && !e.isCop && !e.civilian);
function nearLevel(list, lv, n) {
  return [...list].sort((a, b) => Math.abs((a.level || 1) - lv) - Math.abs((b.level || 1) - lv)).slice(0, n);
}
function toEntries(arr, count) {
  // ['id', ...] | [{id, count|n}] → [{id, count}]
  const out = [];
  const list = (arr || []).filter(Boolean);
  if (!list.length) return out;
  if (list.every((x) => typeof x === 'string')) {
    const ids = list.filter((id) => ENEMIES[id]);
    for (let i = 0; i < count; i++) { const id = ids[i % ids.length]; if (!id) break; const o = out.find((q) => q.id === id); if (o) o.count++; else out.push({ id, count: 1 }); }
    return out;
  }
  for (const x of list) {
    const id = typeof x === 'string' ? x : x.id || x.type;
    if (!ENEMIES[id]) continue;
    out.push({ id, count: Math.max(1, Math.round(typeof x === 'string' ? 1 : x.count ?? x.n ?? 1)) });
  }
  return out;
}

/** towerFloorDef(floor) の戻り値をゆるく正規化（無ければフォールバック生成） */
export function normalizeFloorDef(raw, floor, game) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lv = d.level ?? d.lv ?? Math.min(200, 38 + floor * 2);
  const count = Math.max(1, Math.round(d.count ?? d.mobCount ?? d.enemyCount ?? (5 + Math.min(7, Math.floor(floor / 3)))));
  let enemies = toEntries(d.enemies || d.mobs || d.types, count);
  if (!enemies.length) enemies = toEntries(nearLevel(monsters(), Math.min(lv, 96), 3).map((e) => e.id), count);
  const muts = Array.isArray(d.mutators) ? d.mutators : d.mutator ? [d.mutator] : [];
  const mprod = (k) => muts.reduce((a, m) => a * (m && typeof m === 'object' && Number.isFinite(m[k]) ? m[k] : 1), 1);
  // コンテンツの最高Lv(~100)を超える階は HP/攻撃を上乗せ
  const over = Math.max(0, lv - 100);
  const hpMult = (d.hpMult ?? d.mult?.hp ?? (1 + floor * 0.04 + over * 0.05)) * mprod('hpMult');
  const atkMult = (d.atkMult ?? d.mult?.atk ?? (1 + floor * 0.02 + over * 0.03)) * mprod('atkMult');
  let boss = d.boss;
  if (boss === true || (boss == null && floor % 10 === 0)) boss = nearLevel(bosses(), Math.min(lv, 100), 1)[0]?.id || null;
  if (boss && typeof boss === 'object') boss = boss.id;
  if (boss && !ENEMIES[boss]) boss = null;
  const mb = d.miniBoss && ENEMIES[d.miniBoss.id] ? { id: d.miniBoss.id, hpMult: d.miniBoss.hpMult ?? hpMult * 5 } : null;
  return { level: d.displayLevel ?? lv, enemies, boss: boss || null, hpMult, atkMult, bossHpMult: d.bossHpMult, miniBoss: mb, mutators: muts, name: d.name, floorLabel: d.label };
}

/** arenaWaveDef(wave) の戻り値を正規化（無ければプレイヤーLv帯の敵でフォールバック） */
export function normalizeWaveDef(raw, wave, game) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lv = d.level ?? Math.max(1, (game?.state?.level || 1));
  const count = Math.max(1, Math.round(d.count ?? (4 + Math.min(10, wave * 2))));
  let enemies = toEntries(d.enemies || d.types, count);
  if (!enemies.length) enemies = toEntries(nearLevel(monsters(), lv, 4).map((e) => e.id), count);
  return { enemies, hpMult: d.hpMult ?? (1 + (wave - 1) * 0.08), atkMult: d.atkMult ?? (1 + (wave - 1) * 0.04) };
}
