// 起動: 画像の枠を登録 → 差し替え画像を読む → タイトル画面 → ゲーム開始 → 毎フレーム進める・自動セーブ。

import { Game } from './game/game.js';
import { assets } from './render/assets.js';
import { installManifest } from './render/manifest.js';
import { installPainters } from './render/painters/index.js';
import { Scene } from './render/scene.js';
import { UI } from './ui/ui.js';
import { showTitle } from './ui/title.js';
import { showOfflineReport } from './ui/offline.js';
import { saveSlot, loadSlot } from './engine/save.js';
import { setNumberMode } from './engine/format.js';
import { audio } from './audio/audio.js';

const root = document.getElementById('app');
const game = new Game();
let ui = null;
let scene = null;
let slot = 0;
let saveTimer = 0;
let lastFrame = performance.now();
let running = false;

window.__game = game; // 調べもの・テスト用
window.__assets = assets;

async function boot() {
  installManifest();
  installPainters();
  try { await assets.init({ baseUrl: '' }); } catch (e) { console.warn('[assets.init]', e); }
  audio.init(game);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
  toTitle();
}

function toTitle() {
  running = false;
  if (game.started) save();
  showTitle(root, game, { onStart: startGame });
}

/** ゲームを始める: { slot, state? , cls?, name? } */
function startGame(opts) {
  slot = opts.slot ?? 0;
  if (opts.state) {
    game.load(opts.state);
  } else if (opts.cls) {
    game.newGame(opts.cls, opts.name || '名もなき者');
  } else {
    const st = loadSlot(slot);
    if (!st) return;
    game.load(st);
  }
  setNumberMode(game.state.settings.numberFormat);
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  scene = new Scene(canvas, game);
  ui = new UI(game, scene, root, {
    onSave: save,
    onTitle: toTitle,
    onImport: (st) => { game.load(st); save(); ui.renderPanel(); ui.hud.buildSkills(); },
    onOfflineReport: (rep) => showOfflineReport(ui, rep),
  });
  window.__ui = ui;
  setTimeout(() => scene.resize(), 0);
  // 離れていた時間の稼ぎ
  const away = (Date.now() - (game.state.lastTick || Date.now())) / 1000;
  if (!opts.cls && away > 60) game.sys.offline.grant(away, { reason: 'offline' });
  save();
  running = true;
  lastFrame = performance.now();
  audio.music?.(game.state.world.zone);
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!running) return;
  const dt = Math.min(10, (now - lastFrame) / 1000);
  lastFrame = now;
  try {
    game.update(dt);
    scene.frame(Math.min(0.1, dt));
    ui.update(dt);
  } catch (e) {
    console.error('[loop]', e);
    window.__lastError = e;
  }
  saveTimer += dt;
  if (saveTimer >= (game.state.settings.autoSaveSec || 30)) { saveTimer = 0; save(); }
  requestAnimationFrame(loop);
}

function save() {
  if (!game.state) return false;
  return saveSlot(slot, game.snapshot());
}

// タブを離れたとき・戻ったとき
document.addEventListener('visibilitychange', () => {
  if (!game.started || !running) return;
  if (document.hidden) { save(); return; }
  const away = (Date.now() - (game.state.lastTick || Date.now())) / 1000;
  if (away > 30) game.catchUp(away);
  lastFrame = performance.now();
});
window.addEventListener('beforeunload', () => { if (running) save(); });

boot();
