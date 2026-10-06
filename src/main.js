// NEON VICE STORY — エントリーポイント / ゲームループ / 統合
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { hasSave, loadState, saveState, loadSlot, setActiveSlot, firstEmptySlot, saveSlot, onSlotDeleted } from './core/save.js';

import { MAPS } from './world/maps.js';
import { Player } from './entities/player.js';
import { NPC } from './entities/npc.js';
import { Spawner } from './entities/spawner.js';

import { newState, computeStats, expToNext, setActiveBuffs, migrateState } from './systems/progression.js';
import { attachSNS } from './systems/sns.js';
import { attachTravel } from './systems/travel.js';
import { attachJobs } from './systems/jobs.js';
import { attachAchievements } from './systems/achievements.js';
import { attachDaily } from './systems/daily.js';
import { attachShared, removeSharedChar } from './systems/shared.js';
import { audio, attachAudio } from './audio/audio.js';
import { MissionManager } from './systems/missions.js';
import { updateSkills, resetCooldowns } from './systems/skills.js';
import { setPlayerInvuln } from './systems/combat.js';

import { drawBackground, drawMapTiles, drawNightOverlay } from './render/background.js';
import * as FX from './render/effects.js';
const { spawnEffect, updateEffects, drawEffects } = FX;

import { UIManager } from './ui/ui.js';
import { drawHUD } from './ui/hud.js';
import { drawTitle, titleInput, _titleState } from './ui/title.js';

import { DebugPanel } from './debug/debug.js';
import * as Sprites from './render/sprites.js';
import { prefetchNeighbors, prefetchStats } from './render/prefetch.js';
import { updateLoadGate, drawLoadGate, markManifestSettled, loadGateState } from './render/loadGate.js';

const W = 1280, H = 720;
function loadSettings() {
  const def = { fx: 1, dmgCompact: false, bgm: 0.8, se: 0.9 };
  try {
    const saved = JSON.parse(localStorage.getItem('nvs_settings') || '{}') || {};
    const out = { ...def, ...saved };
    // 旧キー dmgMerge（UI v3 初版）→ dmgCompact に統一
    if ('dmgMerge' in out) { if (!('dmgCompact' in saved)) out.dmgCompact = !!out.dmgMerge; delete out.dmgMerge; }
    return out;
  } catch { return def; }
}
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
  hitstop: 0, camZoom: 1, flash: null,
  settings: loadSettings(),
  hasSave,
  lastError: null,

  notify(text, color) { safe('notify', () => this.ui?.notify(text, color)); },

  changeMap(mapId, x, y) {
    const map = MAPS[mapId];
    if (!map) { console.warn('unknown map', mapId); return; }
    this.map = map;
    this.state.mapId = mapId;
    if (map.town && !map.instance) this.state.lastTownId = mapId;
    this.enemies.length = 0; this.projectiles.length = 0; this.drops.length = 0; this.effects.length = 0;
    this.npcs = (map.npcs || []).map((n) => new NPC(this, n));
    this.vehicles = []; // 乗り物は廃止（map.vehicles は読まない。描画コードは将来用に残してある）
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

onSlotDeleted((slot) => safe('removeSharedChar', () => removeSharedChar(slot)));
game.ui = new UIManager(game);
game.debug = new DebugPanel(game);
// 差し替えスプライト（assets/sprites/manifest.json。無い/壊れている → 全部コード描画のまま）
game.sprites = Sprites;
Sprites.loadSpriteManifest().catch(() => {}).finally(markManifestSettled);
game.loadGate = loadGateState;
game.prefetch = prefetchStats; // テスト用: 隣のマップの先読みの状態
game.saveSettings = () => { try { localStorage.setItem('nvs_settings', JSON.stringify(game.settings)); } catch { /* ignore */ } };
// 永続的なイベント購読（各 attach は game.state を都度参照する）
safe('attachAudio', () => attachAudio(game));
safe('attachFx', () => FX.attachFx?.(game));
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

/**
 * choice:
 *  - { slot, state }                 … キャラ選択画面から既存キャラで開始
 *  - { slot, create: {classId, name, gender, look} } … 新規作成して開始
 *  - 'continue' / 'luna' / 'jin' / 'hacker' … 旧形式（互換）
 */
function startGame(choice) {
  let state = null;
  let slot = -1;
  if (choice && typeof choice === 'object') {
    slot = Number.isInteger(choice.slot) ? choice.slot : firstEmptySlot();
    if (choice.state) state = choice.state;
    else if (Number.isInteger(choice.slot) && !choice.create) state = loadSlot(choice.slot);
    if (!state && choice.create) {
      const c = choice.create;
      state = newState(c.classId || 'luna', { name: c.name, gender: c.gender, look: c.look });
    }
  } else if (choice === 'continue') {
    state = loadState();
  }
  if (!state) state = newState(typeof choice === 'string' && choice !== 'continue' ? choice : 'luna');
  state = migrateState(state) || state;
  if (slot < 0 && choice !== 'continue') slot = firstEmptySlot();
  if (slot >= 0) { setActiveSlot(slot); saveSlot(slot, state); }
  game.state = state;
  game.clock = state.clock ?? 17;
  if (!systemsAttached) {
    systemsAttached = true;
    safe('attachSNS', () => attachSNS(game));
    safe('attachTravel', () => attachTravel(game));
    safe('attachJobs', () => attachJobs(game));
    safe('attachAchievements', () => attachAchievements(game));
    safe('attachDaily', () => attachDaily(game));
    safe('attachShared', () => attachShared(game));
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
  // タワー/アリーナ/ボス部屋で中断したセーブは最後の町から再開
  let startMap = MAPS[state.mapId] ? state.mapId : Object.keys(MAPS)[0];
  if (MAPS[startMap]?.instance) startMap = (state.lastTownId && MAPS[state.lastTownId] && !MAPS[state.lastTownId].instance) ? state.lastTownId : 'beach';
  game.changeMap(startMap);
  game.notify('←→移動 / Space ジャンプ / X 攻撃 / A S D F Q W G H スキル / V・E 会話 / ↑ ポータル', '#ffd166');
}

/** セーブしてタイトル（キャラ選択）へ戻る */
game.returnToTitle = function () {
  if (game.scene !== 'play') return;
  game.save();
  safe('ui.closeAll', () => game.ui.closeAll?.() ?? game.ui.close?.());
  game.missions?.destroy?.();
  game.player?.destroy?.();
  if (game.pet) { game.pet.remove = true; game.pet = null; }
  game.enemies.length = 0; game.projectiles.length = 0; game.drops.length = 0;
  game.effects.length = 0; game.npcs = []; game.vehicles = [];
  game.wanted = 0; game.wantedHeat = 0;
  game.scene = 'title';
  game.events.emit('returnedToTitle');
};

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
      // ボス戦中でデスカウントが残っていれば、その場で復活して戦闘続行
      if (game.bossRun && !game.bossRun.failed && !game.bossRun.cleared && game.map?.id === game.bossRun.roomId) {
        s.hp = st.maxHp; s.mp = st.maxMp;
        setPlayerInvuln(game, 3);
        game.save();
        return;
      }
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
// セーブはフレームの終わりにまとめて1回（大技で一度に何体も倒して何度もレベルアップした時に、その都度 localStorage へ書かない）
game.requestSave = () => { game._saveReq = true; };
game.events.on('levelUp', () => game.requestSave());
game.events.on('mapChanged', () => game.save());
game.events.on('missionComplete', () => game.requestSave());

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

  // ヒットストップ中はワールドを止める（UI・カメラは動かす）
  if (game.hitstop > 0) {
    game.hitstop = Math.max(0, game.hitstop - dt);
    updateCamera(dt);
    return;
  }
  phase('u.ui');
  safe('clock', () => updateClock(dt));
  safe('player', () => game.player.update(dt));
  phase('u.player');
  updateList(game.enemies, dt, 'enemy');
  phase('u.enemies');
  updateList(game.projectiles, dt, 'projectile');
  phase('u.proj');
  updateList(game.drops, dt, 'drop');
  updateList(game.npcs, dt, 'npc');
  updateList(game.vehicles, dt, 'vehicle');
  safe('spawner', () => game.spawner.update(dt));
  phase('u.misc');
  safe('skills', () => updateSkills(game, dt));
  safe('missions', () => game.missions.update(dt));
  phase('u.skills');
  safe('effects', () => updateEffects(game, dt));
  phase('u.fx');
  updateCamera(dt);

  autosaveT += dt;
  if (autosaveT > 30) { autosaveT = 0; game.save(); }
  void consumed;
}

function drawPlay() {
  const map = game.map;
  const sx = game.shake ? (Math.random() - 0.5) * game.shake : 0;
  const sy = game.shake ? (Math.random() - 0.5) * game.shake : 0;
  // bx/by = 揺れを除いたカメラ（背景の光バッファを揺れの間も作り直さずに使い回すため）
  const cam = { x: Math.round(game.cam.x + sx), y: Math.round(game.cam.y + sy), bx: Math.round(game.cam.x), by: Math.round(game.cam.y) };

  const skip = game.debug.skip || {}; // デバッグ: 描画レイヤーを個別に止めて負荷を調べる
  if (!skip.bg) safe('bg', () => drawBackground(ctx, map, cam, W, H, game.time));
  phase('bg');
  game.camZoom += (1 - game.camZoom) * Math.min(1, game.dt * 8);
  const z = game.camZoom || 1;
  ctx.save();
  if (z !== 1) { ctx.translate(W / 2, H * 0.6); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.6); }
  ctx.translate(-cam.x, -cam.y);
  if (!skip.tiles) safe('tiles', () => drawMapTiles(ctx, map, game.time));
  phase('tiles');
  const visible = (e) => e.x > cam.x - 300 && e.x < cam.x + W + 300;
  for (const v of game.vehicles) if (!skip.ents && visible(v)) safe('draw.vehicle', () => v.draw(ctx));
  for (const n of game.npcs) if (!skip.ents && visible(n)) safe('draw.npc', () => n.draw(ctx));
  for (const d of game.drops) if (visible(d)) safe('draw.drop', () => d.draw(ctx));
  for (const e of game.enemies) if (!skip.ents && visible(e)) safe('draw.enemy', () => e.draw(ctx));
  phase('ents');
  safe('draw.player', () => game.player.draw(ctx));
  phase('player');
  for (const p of game.projectiles) safe('draw.proj', () => p.draw(ctx));
  safe('draw.fx', () => drawEffects(ctx, game));
  ctx.restore();
  phase('fx');
  if (!skip.night) safe('night', () => {
    const p = game.player;
    drawNightOverlay(ctx, map, W, H, p ? { x: p.x - cam.x, y: p.y - 40 - cam.y } : undefined);
  });
  phase('night');
  // 当たり判定表示は夜の色調オーバーレイの上に描く（暗くならないように）
  if (game.debug.enabled && game.debug.showHitboxes) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    safe('debug.world', () => game.debug.drawWorld?.(ctx));
    ctx.restore();
  }

  // 色フラッシュ（大技）
  if (game.flash && game.flash.a > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(0.6, game.flash.a) * (game.settings.fx ?? 1);
    ctx.fillStyle = game.flash.color || '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
    game.flash.a -= game.dt * 3;
  }
  if (!skip.hud) safe('cutin', () => FX.drawCutins?.(ctx, game));
  if (!skip.hud) safe('combo', () => FX.drawCombo?.(ctx, game));
  phase('flash');
  if (!skip.hud) safe('hud', () => drawHUD(ctx, game));
  phase('hud');
  if (!skip.hud) safe('ui.draw', () => game.ui.draw(ctx));
  phase('ui');
  if (!skip.hud) safe('screenFx', () => FX.drawScreenFx?.(ctx, game));
  phase('screenFx');
  safe('debug.draw', () => game.debug.draw(ctx));
}

// デバッグ: game.debug.profile = true の間、フレーム内の部位別処理時間(ms)を game.perf.phases に入れる（スパイク調査用）
let _ph = null, _phT = 0;
function phase(name) {
  if (!_ph) return;
  const t = performance.now();
  _ph[name] = (_ph[name] || 0) + (t - _phT);
  _phT = t;
}

// 1フレームの処理時間（update+draw, ms）。デバッグパネル / テストが参照
game.perf = { ms: 0, avg: 0, max: 0, n: 0, sum: 0, reset() { this.max = 0; this.n = 0; this.sum = 0; } };
let last = performance.now();
function frame(now) {
  const t0 = performance.now();
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  game.dt = dt;
  game.time += dt;
  game.frameNo = (game.frameNo || 0) + 1;
  game.input.beginFrame();
  if (game.debug?.profile) { _ph = {}; _phT = t0; } else _ph = null;
  safe('audio', () => audio.update(game, dt));
  phase('audio');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (game.scene === 'title') {
    safe('title', () => drawTitle(ctx, game, game.time));
    const choice = safe('titleInput', () => titleInput(game));
    if (choice) startGame(choice);
    safe('ui.notify', () => game.ui.draw(ctx));
  } else {
    updatePlay(dt);
    phase('update');
    drawPlay();
  }
  // 画面が切り替わった直後は、差し替え画像の読み込みが終わるまで「読み込み中」で覆う（旧い絵が一瞬見えないように）
  safe('loadGate', () => {
    const ts = game.scene === 'title' ? _titleState() : null;
    const key = game.scene === 'play' ? 'play|' + (game.map?.id || '') : 'title|' + (ts?.screen || '') + '|' + (ts?.c?.step ?? '');
    const gated = updateLoadGate(key, performance.now() / 1000); // 実時間（重い読み込み中は game.time が遅れるので）
    // そのマップの読み込みが落ち着いたら、隣のマップの画像を裏で先読み（移動した時の「読み込み中」を短く）
    if (!gated && game.scene === 'play' && game.map && game._prefetched !== game.map.id) { game._prefetched = game.map.id; prefetchNeighbors(game.map); }
    drawLoadGate(ctx, W, H, performance.now() / 1000, dt);
  });
  if (game._saveReq) { game._saveReq = false; if (game.scene === 'play') safe('save', () => game.save()); }
  phase('save');
  const pf = game.perf, ms = performance.now() - t0;
  if (_ph) pf.phases = _ph;
  pf.ms = ms; pf.avg = pf.avg ? pf.avg * 0.95 + ms * 0.05 : ms; pf.n++; pf.sum += ms; if (ms > pf.max) pf.max = ms;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.focus();
window.addEventListener('beforeunload', () => game.save());
