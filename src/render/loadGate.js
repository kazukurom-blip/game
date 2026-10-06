// 読み込み中の目隠し（ロードゲート）
//  画面が切り替わった直後（起動・タイトルの各画面・マップ移動）、差し替え画像（manifest の絵）の読み込みが
//  終わるまで画面を「読み込み中」で覆う。画像は描くときに読み込みが始まり、読み込み中はコード描画の旧い絵が
//  代わりに出るため、覆わないと一瞬だけ差し替え前の絵が見えてしまう。
//  読み込みが全部済んでいれば覆わない（画面が一瞬暗くなることもない）。最長 MAX_WAIT 秒であきらめて見せる。
import { spriteStats } from './sprites.js';
import { artStats } from './artOverrides.js';

// 最長の待ち時間（秒）。起動直後は全体の読み込みを待つので長め、マップ移動・画面切り替えは短め（短すぎると、回線が遅い時にコード描画の旧い絵が一瞬見える）
const MAX_WAIT_BOOT = 10, MAX_WAIT = 4;
const G = { key: null, t0: 0, active: false, fade: 0, manifest: false, first: true };

/** manifest.json の読み込みが終わった（成功・失敗どちらでも）ことを知らせる */
export function markManifestSettled() { G.manifest = true; }

/** いま読み込み中の画像の数（キャラ・敵・頭・リグ・背景・アイコンなど全部） */
export function imagesInFlight() {
  let n = 0;
  try {
    const s = spriteStats();
    n += s.requested - s.loaded - s.failed;
    if (s.rig) n += s.rig.requested - s.rig.loaded - s.rig.failed;
  } catch { /* ignore */ }
  try { const a = artStats(); n += a.requested - a.loaded - a.failed; } catch { /* ignore */ }
  return Math.max(0, n);
}

/**
 * 毎フレーム、画面を描いた後に呼ぶ（描いた時に読み込みが始まるので、その後で数える）。
 * key = 今の画面を表す文字列。変わった時に、読み込み中の物があれば覆い始める。戻り値: 覆っている間 true
 */
export function updateLoadGate(key, now) {
  const busy = !G.manifest || imagesInFlight() > 0;
  if (key !== G.key) {
    G.key = key; G.t0 = now;
    if (busy) { G.active = true; G.fade = 1; }
  } else if (G.active && (!busy || now - G.t0 > (G.first ? MAX_WAIT_BOOT : MAX_WAIT))) {
    G.active = false; G.first = false;
  } else if (!G.active) G.first = false;
  return G.active;
}

export function loadGateState() { return { active: G.active, fade: G.fade, key: G.key, inFlight: imagesInFlight(), manifest: G.manifest }; }

/** 目隠しを描く（いちばん上に）。読み込みが終わると 0.2 秒で消える */
export function drawLoadGate(ctx, W, H, now, dt) {
  if (!G.active) G.fade = Math.max(0, G.fade - dt * 5);
  if (G.fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = G.fade;
  ctx.fillStyle = '#0b0614';
  ctx.fillRect(0, 0, W, H);
  if (G.active && now - G.t0 > 0.25) {
    const k = Math.floor((now - G.t0) * 3) % 4;
    ctx.fillStyle = '#ffd0ea';
    ctx.font = "700 20px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('読み込み中' + '.'.repeat(k), W / 2, H / 2);
    // 細い進み具合のバー（目安: 経過時間）
    const p = Math.min(1, (now - G.t0) / 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(W / 2 - 120, H / 2 + 24, 240, 4);
    ctx.fillStyle = '#ff5fa2'; ctx.fillRect(W / 2 - 120, H / 2 + 24, 240 * (0.2 + 0.8 * (1 - Math.pow(1 - p, 2))), 4);
  }
  ctx.restore();
}
