// NEON VICE STORY — エントリーポイント / ゲームループ / 統合
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { hasSave, loadState, saveState } from './core/save.js';

import { MAPS } from './world/maps.js';
import { Player } from './entities/player.js';
import { NPC } from './entities/npc.js';
import { Vehicle } from './entities/vehicle.js';
import { Spawner } from './entities/spawner.js';

import { newState, computeStats, expToNext, setActiveBuffs, migrateState } from './systems/progression.js';
import { attachSNS } from './systems/sns.js';
import { attachTravel } from './systems/travel.js';
import { audio, attachAudio } from './audio/audio.js';
import { MissionManager } from './systems/missions.js';
import { updateSkills, resetCooldowns } from './systems/skills.js';
import { setPlayerInvuln } from './systems/combat.js';

import { drawBackground, drawMapTiles, drawNightOverlay } from './render/background.js';
import { spawnEffect, updateEffects, drawEffects } from './render/effects.js';

import { UIManager } from './ui/ui.js';
import { drawHUD } from './ui/hud.js';
import { drawTitle, titleInput } from './ui/title.js';

import { DebugPanel } from './debug/debug.js';

const W = 1280, H = 720;
// カメラ下端: 地面が画面 y≈560 に来るまで下げる（HUD 下部 ~120px に足元や NPC 名が隠れないように）
const HUD_BOTTOM = 160;
const camMaxY = (map) => Math.max(0, Math.max(map.height || 0, (map.groundY || 0) + HUD_BOTTOM) - H);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// エラーで全体が止まらないようにしつつ、内容はコンソールに残す
const errCount = new Map();
function safe(label, fn) {
  try { return fn(); } catch (e) {
    const n = (errCount.get(label) || 0) + 1;
    errCount.set(label, n);
    if (n <= 3) console.error(`[${label}]`, e);
    game.lastError = `${label}: ${e.message}`;
  }
}

const game = {
  W, H, ctx, canvas,
  time: 0, dt: 0,
  scene: 'title',
  input: new Input(canvas, W, H),
  events: new EventBus(),
  cam: { x: 0, y: 0 },
  shake: 0,
  state: null,
  map: null,
  player: null,
  enemies: [], projectiles: [], drops: [], npcs: [], vehicles: [], effects: [],
  spawner: null, missions: null, ui: null, debug: null,
  wanted: 0, wantedHeat: 0,
  paused: false,
  hasSave,
  lastError: null,

  notify(text, color) { safe('notify', () => this.ui?.notify(text, color)); },

  changeMap(mapId, x, y) {
    const map = MAPS[mapId];
    if (!map) { console.warn('unknown map', mapId); return; }
    this.map = map;
    this.state.mapId = mapId;
    this.enemies.length = 0; this.projectiles.length = 0; this.drops.length = 0; this.effects.length = 0;
    this.npcs = (map.npcs || []).map((n) => new NPC(this, n));
    this.vehicles = (map.vehicles || []).map((v) => new Vehicle(this, v));
    const p = this.player;
    if (p) {
      if (p.inVehicle) p.inVehicle = null;
      p.x = x ?? map.spawnX ?? 200;
      p.y = y ?? (map.groundY - 2);
      p.vx = 0; p.vy = 0; p.climbing = null;
    }
    this.spawner.reset(map);
    this.cam.x = Math.max(0, Math.min(map.width - W, (p?.x ?? 0) - W / 2));
    this.cam.y = Math.max(0, Math.min(camMaxY(map), (p?.y ?? 0) - H * 0.62));
    safe('fx', () => spawnEffect(this, 'portal', p.x, p.y - 40));
    this.events.emit('mapChanged', { mapId });
    this.notify(`📍 ${map.name}`, '#19d3c5');
  },

  save() {
    if (this.state) saveState(this.state);
  },
};
window.game = game; // デバッグ/テスト用

game.ui = new UIManager(game);
game.debug = new DebugPanel(game);
// 永続的なイベント購読（各 attach は game.state を都度参照する）
safe('attachAudio', () => attachAudio(game));
audio.notifyRadio = false; // HUD がラジオ局名を表示する
let systemsAttached = false;

// 昼夜: 実時間 12 分で 1 日
const DAY_SECONDS = 720;
function updateClock(dt) {
  const s = game.state;
  if (typeof s.clock !== 'number' || !isFinite(s.clock)) s.clock = 17;
  s.clock = (s.clock + dt * 24 / DAY_SECONDS) % 24;
  game.clock = s.clock;
  if (game.map) game.map._clock = s.clock;
}

function startGame(choice) {
  let state = null;
  if (choice === 'continue') state = loadState();
  if (!state) state = newState(choice === 'continue' ? 'luna' : choice);
  state = migrateState(state) || state;
  game.state = state;
  game.clock = state.clock ?? 17;
  if (!systemsAttached) {
    systemsAttached = true;
    safe('attachSNS', () => attachSNS(game));
    safe('attachTravel', () => attachTravel(game));
  }
  game.wanted = 0; game.wantedHeat = 0;
  // 2回目以降の開始に備えて旧インスタンスのイベント購読・モジュール内状態を破棄
  game.missions?.destroy?.();
  game.player?.destroy?.();
  resetCooldowns();
  game.buffs = []; setActiveBuffs([]);
  game.missions = new MissionManager(game);
  game.spawner = new Spawner(game);
  game.player = new Player(game);
  const st = computeStats(state);
  if (!(state.hp > 0)) state.hp = st.maxHp;
  if (!(state.mp >= 0)) state.mp = st.maxMp;
  game.scene = 'play';
  game.changeMap(MAPS[state.mapId] ? state.mapId : Object.keys(MAPS)[0]);
  game.notify('←→移動 / Space ジャンプ / X 攻撃 / A S D F スキル / E 会話・乗車 / ↑ ポータル', '#ffd166');
}

// --- グローバルイベント ---
game.events.on('playerDied', () => {
  game.ui.open('death', {
    onRevive: () => {
      const s = game.state;
      const st = computeStats(s);
      s.exp = Math.max(0, Math.floor(s.exp - expToNext(s.level) * 0.05));
      s.hp = Math.ceil(st.maxHp * 0.5);
      s.mp = Math.ceil(st.maxMp * 0.5);
      game.wanted = 0; game.wantedHeat = 0;
      game.player.dead = false;
      // 今いる地域の町で復活（その町が未訪問なら最初の町）
      const reg = game.map?.region;
      const visited = game.state.visited || [];
      const town = (reg && MAPS[reg]?.town && (visited.includes(reg) || reg === 'beach')) ? reg : 'beach';
      game.changeMap(town);
      setPlayerInvuln(game, 3);
      game.save();
    },
  });
});
game.events.on('levelUp', () => game.save());
game.events.on('mapChanged', () => game.save());
game.events.on('missionComplete', () => game.save());

// --- タッチボタン ---
for (const b of document.querySelectorAll('#touch button')) {
  const a = b.dataset.a;
  const on = (e) => { e.preventDefault(); game.input.press(a); if (a === 'jump' || a === 'interact') game.input.press('confirm'); };
  const off = (e) => { e.preventDefault(); game.input.release(a); game.input.release('confirm'); };
  b.addEventListener('touchstart', on, { passive: false });
  b.addEventListener('touchend', off, { passive: false });
  b.addEventListener('mousedown', on);
  b.addEventListener('mouseup', off);
}

// --- カメラ ---
function updateCamera(dt) {
  const p = game.player, map = game.map;
  const tx = p.x - W / 2 + p.facing * 60;
  const ty = p.y - H * 0.62;
  const k = 1 - Math.exp(-dt * 6);
  game.cam.x += (tx - game.cam.x) * k;
  game.cam.y += (ty - game.cam.y) * k;
  game.cam.x = Math.max(0, Math.min(map.width - W, game.cam.x));
  game.cam.y = Math.max(0, Math.min(camMaxY(map), game.cam.y));
  game.shake = Math.max(0, game.shake - dt * 30);
}

function updateList(list, dt, label) {
  for (const e of list) if (!e.remove) safe(label, () => e.update(dt));
  for (let i = list.length - 1; i >= 0; i--) if (list[i].remove) list.splice(i, 1);
}

let autosaveT = 0;
function updatePlay(dt) {
  const inp = game.input;
  if (inp.pressed('debug')) game.debug.enabled = !game.debug.enabled;
  safe('debug', () => game.debug.update(dt));

  const consumed = safe('ui.input', () => game.ui.handleInput());
  safe('ui.update', () => game.ui.update(dt));
  // ワールドマップ表示中はワールドを一時停止
  if (game.paused || safe('ui.isOpen', () => game.ui.isOpen?.('worldmap'))) return;

  safe('clock', () => updateClock(dt));
  safe('player', () => game.player.update(dt));
  updateList(game.enemies, dt, 'enemy');
  updateList(game.projectiles, dt, 'projectile');
  updateList(game.drops, dt, 'drop');
  updateList(game.npcs, dt, 'npc');
  updateList(game.vehicles, dt, 'vehicle');
  safe('spawner', () => game.spawner.update(dt));
  safe('skills', () => updateSkills(game, dt));
  safe('missions', () => game.missions.update(dt));
  safe('effects', () => updateEffects(game, dt));
  updateCamera(dt);

  autosaveT += dt;
  if (autosaveT > 30) { autosaveT = 0; game.save(); }
  void consumed;
}

function drawPlay() {
  const map = game.map;
  const sx = game.shake ? (Math.random() - 0.5) * game.shake : 0;
  const sy = game.shake ? (Math.random() - 0.5) * game.shake : 0;
  const cam = { x: Math.round(game.cam.x + sx), y: Math.round(game.cam.y + sy) };

  safe('bg', () => drawBackground(ctx, map, cam, W, H, game.time));
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  safe('tiles', () => drawMapTiles(ctx, map, game.time));
  const visible = (e) => e.x > cam.x - 300 && e.x < cam.x + W + 300;
  for (const v of game.vehicles) if (visible(v)) safe('draw.vehicle', () => v.draw(ctx));
  for (const n of game.npcs) if (visible(n)) safe('draw.npc', () => n.draw(ctx));
  for (const d of game.drops) if (visible(d)) safe('draw.drop', () => d.draw(ctx));
  for (const e of game.enemies) if (visible(e)) safe('draw.enemy', () => e.draw(ctx));
  safe('draw.player', () => game.player.draw(ctx));
  for (const p of game.projectiles) safe('draw.proj', () => p.draw(ctx));
  safe('draw.fx', () => drawEffects(ctx, game));
  safe('debug.world', () => game.debug.drawWorld?.(ctx));
  ctx.restore();
  safe('night', () => {
    const p = game.player;
    drawNightOverlay(ctx, map, W, H, p ? { x: p.x - cam.x, y: p.y - 40 - cam.y } : undefined);
  });

  safe('hud', () => drawHUD(ctx, game));
  safe('ui.draw', () => game.ui.draw(ctx));
  safe('debug.draw', () => game.debug.draw(ctx));
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  game.dt = dt;
  game.time += dt;
  game.input.beginFrame();
  safe('audio', () => audio.update(game, dt));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (game.scene === 'title') {
    safe('title', () => drawTitle(ctx, game, game.time));
    const choice = safe('titleInput', () => titleInput(game));
    if (choice) startGame(choice);
    safe('ui.notify', () => game.ui.draw(ctx));
  } else {
    updatePlay(dt);
    drawPlay();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.focus();
window.addEventListener('beforeunload', () => game.save());
