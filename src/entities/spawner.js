// 自動出現 + 手配度（GTA風）による警官 / SWAT / ドローン / パトカー出現
import { ENEMIES } from '../data/enemies.js';
import * as combat from '../systems/combat.js';
import { spawnEffect } from '../render/effects.js';
import { Enemy } from './enemy.js';
import { Vehicle } from './vehicle.js';

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

export class Spawner {
  constructor(game) {
    this.game = game;
    this.map = null;
    this.timers = [];
    this.wantedT = 0;
    this.decayHold = 0;
    this._ids = null;
  }

  // 警察系の敵ID（ENEMIES から art/isCop で解決）
  get ids() {
    if (this._ids) return this._ids;
    const cops = findByArt('cop');
    const fallbackCop = Object.values(ENEMIES || {}).filter((e) => e.isCop && e.art !== 'swat' && e.art !== 'drone');
    this._ids = {
      cop: (cops.length ? cops : fallbackCop).map((e) => e.id),
      swat: findByArt('swat').map((e) => e.id),
      drone: findByArt('drone').filter((e) => e.isCop || /police|cop|swat/i.test(e.id)).map((e) => e.id),
    };
    if (!this._ids.drone.length) this._ids.drone = findByArt('drone').map((e) => e.id);
    return this._ids;
  }

  reset(map) {
    this.map = map;
    // ボス枠（max<=1）は入場 ~15 秒後に初回出現。他はランダム位相
    this.timers = (map.spawns || []).map((s) => (s.max <= 1 ? Math.max(0, (s.interval || 5) - 15) : rand(0, s.interval || 5)));
    this.wantedT = 1.5;
    const g = this.game;
    // 初期配置: 各エリアを上限の 6〜7 割まで埋める（ボスは除く）
    (map.spawns || []).forEach((s, i) => {
      const n = s.max <= 1 || (s.minLevel && (g.state?.level || 1) < s.minLevel) ? 0 : Math.ceil((s.max || 3) * 0.65);
      for (let k = 0; k < n; k++) this.spawnInArea(i, true);
    });
  }

  // エリア内の出現候補点（地面 + エリアと重なる足場）
  candidates(s) {
    const map = this.map;
    const pts = [];
    const x1 = Math.max(40, s.x1), x2 = Math.min(map.width - 40, s.x2);
    for (let i = 0; i < 4; i++) pts.push({ x: rand(x1, x2), y: map.groundY });
    for (const p of map.platforms || []) {
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
    const g = this.game, s = this.map.spawns[i];
    const types = (s.types || []).filter((t) => ENEMIES[t]);
    if (!types.length) return null;
    const type = pick(types);
    const def = ENEMIES[type];
    const p = g.player;
    let pts = this.candidates(s);
    // ボスは地面に
    if (def.boss || def.ai === 'boss') pts = pts.filter((q) => !q.plat);
    pts.sort(() => Math.random() - 0.5);
    const far = (q) => !p || Math.abs(q.x - p.x) > 260 || Math.abs(q.y - p.y) > 200;
    let pt = pts.find((q) => far(q) && !this.isOnScreen(q.x, q.y)) || pts.find(far);
    if (!pt) return null;
    const e = new Enemy(g, type, pt.x, pt.y, { spawnIdx: i, x1: pt.plat ? pt.plat.x : s.x1, x2: pt.plat ? pt.plat.x + pt.plat.w : s.x2 });
    if (pt.plat) { e.groundPlat = pt.plat; e.onGround = true; }
    g.enemies.push(e);
    if (!initial && this.isOnScreen(pt.x, pt.y, 0)) spawnEffect(g, 'smoke', pt.x, pt.y - 20);
    if ((def.boss || def.ai === 'boss') && !initial) g.notify(`⚠ ${def.name} が現れた！`, '#ff4d6d');
    return e;
  }

  update(dt) {
    const g = this.game, map = this.map;
    if (!map || !g.player) return;
    // --- 通常出現 ---
    (map.spawns || []).forEach((s, i) => {
      if (s.minLevel && (g.state?.level || 1) < s.minLevel) return;
      this.timers[i] = (this.timers[i] || 0) + dt;
      if (this.timers[i] < (s.interval || 5)) return;
      const alive = g.enemies.filter((e) => e.spawnIdx === i && !e.dead && !e.remove).length;
      if (alive < (s.max || 3)) {
        this.timers[i] = 0;
        this.spawnInArea(i);
      } else this.timers[i] = (s.interval || 5) * 0.5;
    });
    this.updateWanted(dt);
  }

  // ---------------- 手配度 ----------------
  updateWanted(dt) {
    const g = this.game, p = g.player;
    // 警官に見られているか
    const law = g.enemies.filter((e) => !e.dead && !e.remove && (e.isCop || e.def?.isCop));
    const seen = law.some((e) => Math.abs(e.x - p.x) < 650 && Math.abs(e.y - p.y) < 260);
    if (typeof combat.updateWanted === 'function') {
      combat.updateWanted(g, dt, { seen });
    } else if (g.wantedHeat > 0) {
      // 自然減衰（警官に見られていない時のみ。見られていてもゆっくり）
      const rate = seen ? 0 : 0.6 + g.wantedHeat * 0.03;
      g.wantedHeat = Math.max(0, g.wantedHeat - rate * dt);
      const lv = heatToLevel(g.wantedHeat);
      if (lv !== g.wanted) { g.wanted = lv; g.events.emit('wantedChanged', { level: lv }); }
    }

    if (!map(g).copSpawns || !(g.wanted > 0)) return;
    this.wantedT -= dt;
    if (this.wantedT > 0) return;
    this.wantedT = g.wanted >= 5 ? 1.2 : 2.5;
    const lv = Math.min(5, Math.max(0, Math.floor(g.wanted)));
    const tab = WANTED_TABLE[lv];
    const ids = this.ids;
    const count = (list) => g.enemies.filter((e) => !e.dead && !e.remove && e.fromWanted && list.includes(e.defId)).length;
    if (ids.cop.length && count(ids.cop) < tab.cop) return this.spawnLaw(this.leveled(ids.cop));
    if (ids.swat.length && count(ids.swat) < tab.swat) return this.spawnLaw(this.leveled(ids.swat));
    if (ids.drone.length && count(ids.drone) < tab.drone) return this.spawnLaw(this.leveled(ids.drone), true);
    const cars = g.vehicles.filter((v) => v.policeSpawned && v.driverType === 'cop').length;
    if (ids.cop.length && cars < tab.car && !p.inVehicle) this.spawnPoliceCar();
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
    const x = this.edgeX();
    const y = air ? g.player.y - 200 : this.map.groundY;
    const e = new Enemy(g, id, x, y, { fromWanted: true, x1: 0, x2: this.map.width });
    e.aggro = true;
    g.enemies.push(e);
    return e;
  }

  spawnPoliceCar() {
    const g = this.game;
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
