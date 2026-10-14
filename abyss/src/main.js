// 起動: 画像の枠を登録 → 差し替え画像を読む → タイトル画面 → ゲーム開始 → 毎フレーム進める・自動セーブ。

import { Game } from './game/game.js';
import { assets } from './render/assets.js';
import { installManifest } from './render/manifest.js';
import { installPainters } from './render/painters/index.js';
import { Scene } from './render/scene.js';
import { UI } from './ui/ui.js';
import { showTitle } from './ui/title.js';
import { showOfflineReport } from './ui/offline.js';
import { saveSlot, loadSlot, SAVE_FAIL_TEXT } from './engine/save.js';
import { setNumberMode } from './engine/format.js';
import { audio } from './audio/audio.js';
import { initPlatformDownloads } from './ui/dom.js';

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
  initPlatformDownloads(); // claude.ai の Artifact で downloads の力があれば、ファイルの保存に使う（答えは後から）
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
  // 今の画面の知らせ（出来事・画像の変化）を外す。外さないと、始め直すたびに前の画面が丸ごと残る
  ui?.dispose();
  audio.music?.('title');
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
    onImport: (st) => { game.load(st); game.state.lastTick = Date.now(); save(); ui.renderPanel(); ui.hud.buildSkills(); },
    onOfflineReport: (rep) => showOfflineReport(ui, rep),
  });
  window.__ui = ui;
  setTimeout(() => scene.resize(), 0);
  // 離れていた時間の稼ぎ
  const away = (Date.now() - (game.state.lastTick || Date.now())) / 1000;
  if (!opts.cls && away > 60) game.sys.offline.grant(away, { reason: 'offline' });
  game.state.lastTick = Date.now(); // 渡し終えた（毎フレームの「長い空白」の計算で、もう一度渡さない）
  save();
  running = true;
  lastFrame = performance.now();
  audio.music?.(game.state.world.zone);
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!running) return;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  // 長い空白: 埋め込み先（iframe）で枠が隠される・画面の外へ流れると、タブはそのままなので visibilitychange が来ず、
  // rAF だけが止まる。時計で測った「最後に進めた時から」の時間を、放置の稼ぎとしてまとめて渡す（5 秒より長ければ game.update が catchUp）
  const away = (Date.now() - (game.state.lastTick || Date.now())) / 1000;
  if (away > 5 && away > dt) dt = away;
  try {
    game.update(dt);
    scene.frame(Math.min(0.1, dt));
    ui.update(Math.min(10, dt));
  } catch (e) {
    console.error('[loop]', e);
    window.__lastError = e;
  }
  saveTimer += Math.min(10, dt);
  if (saveTimer >= (game.state.settings.autoSaveSec || 30)) { saveTimer = 0; save(); }
  requestAnimationFrame(loop);
}

let saveWarned = false;
/** 保存する。戻り値: このブラウザに残せたか（残せないときは 1 回だけ知らせる。開いている間はメモリに残る） */
function save() {
  if (!game.state) return false;
  const ok = saveSlot(slot, game.snapshot());
  if (!ok && !saveWarned && ui && game.started) { saveWarned = true; ui.toast(SAVE_FAIL_TEXT, 'bad'); }
  return ok;
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
window.addEventListener('pagehide', () => { if (running) save(); }); // スマホの Safari・埋め込み先の入れ替えでは beforeunload が来ないことがある

boot();
