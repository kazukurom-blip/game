// 納品画像の検査（tools/check_art.mjs）用のページ: window.ARTPREV
//   setup(manifestUrl, cases) → manifest を読み込み（loadSpriteManifest → setSpriteManifest / setRigManifest）、画像を先読み
//   frameCount() / frame(i) → 動画の i コマ目（dataURL）。立ち 1.2s → 歩き 1.2s（2周）→ 攻撃 0.6s → 被弾 0.5s、30fps
//   sheet() → コマ並べ（組ごとに そのまま / 骨つき の2行）
// cases: [{ label, look: { cls, g, face?, hair? }, base: 基準色で描くか, equip }]
import { loadSpriteManifest, preloadSprites, spriteStats } from '../src/render/sprites.js';
import { drawCharacter, rigPlanOf } from '../src/render/character.js';
import { DEFAULT_LOOKS } from '../src/data/classes.js';
import { RIG_SKIN_BASE } from '../src/render/rigLayout.js';

const FPS = 30;
const SEG = [
  { state: 'idle', dur: 1.2, label: '立ち' },
  { state: 'walk', dur: 1.2, label: '歩き（0.6秒で1周）' },
  { state: 'attack', dur: 0.6, act: 0.45, label: '攻撃' },
  { state: 'hurt', dur: 0.5, act: 0.3, label: '被弾' },
];
const TOTAL = SEG.reduce((s, x) => s + x.dur, 0);
let CASES = [], LOOKS = [];
const cv = document.getElementById('cv');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lookOf(c) {
  const g = c.look.g || 'f';
  const L = { ...DEFAULT_LOOKS[c.look.cls || 'luna'][g], classId: c.look.cls || 'luna', gender: g };
  if (c.look.face) L.face = c.look.face;
  if (c.look.hair) L.hair = c.look.hair;
  if (c.base) { L.skin = RIG_SKIN_BASE[g]; L.hairColor = '#b07850'; L.eyeColor = '#6a5cff'; }
  return L;
}
function animAt(T) {
  let t = T;
  for (const s of SEG) {
    if (t < s.dur || s === SEG[SEG.length - 1]) {
      if (s.state === 'attack') return t < s.act ? { state: 'attack', t, attackT: Math.min(1, t / s.act), label: s.label } : { state: 'idle', t: T, label: s.label };
      if (s.state === 'hurt') return t < s.act ? { state: 'hurt', t, label: s.label } : { state: 'idle', t: T, label: s.label };
      return { state: s.state, t, label: s.label };
    }
    t -= s.dur;
  }
  return { state: 'idle', t: 0, label: '' };
}
function drawOne(x, cx, by, i, an, bones, sc) {
  drawCharacter(x, cx, by, LOOKS[i], CASES[i].equip, { state: an.state, t: an.t, attackT: an.attackT || 0, scale: sc, facing: 1, damage: 0, ...(bones ? { bones: true, noCache: true } : {}) });
}
const CW = 230, CH = 330, HEAD = 26;
async function setup(url, cases) {
  CASES = cases; LOOKS = cases.map(lookOf);
  const ok = await loadSpriteManifest(url);
  await preloadSprites();
  const tmp = document.createElement('canvas'); tmp.width = 300; tmp.height = 300;
  const tx = tmp.getContext('2d');
  // 遅れて作る物（色替え・重ね頭・リグのプラン）が揃うまで何度か描く
  for (let k = 0; k < 30; k++) {
    for (let i = 0; i < CASES.length; i++) for (const s of ['idle', 'walk', 'attack', 'hurt']) drawOne(tx, 150, 280, i, { state: s, t: 0.1, attackT: 0.3 }, false, 1.5);
    const ready = CASES.every((c, i) => !!rigPlanOf(LOOKS[i], c.equip) || !c.needRig);
    await sleep(k < 3 ? 150 : 60);
    if (ready && k >= 4) break;
  }
  const st = spriteStats();
  const notes = [];
  if (!ok) notes.push('manifest を読めませんでした');
  if (st.rig && st.rig.failed) notes.push(`リグの画像の読み込み失敗 ${st.rig.failed} 枚`);
  if (st.rig && st.rig.warnings && st.rig.warnings.length) notes.push('リグの警告: ' + st.rig.warnings.join(' / '));
  if (st.rig && st.rig.fitFallback && st.rig.fitFallback.length) notes.push('自動フィットに戻った絵: ' + st.rig.fitFallback.join(', '));
  if (st.errors && st.errors.length) notes.push('sprites: ' + st.errors.join(' / '));
  CASES.forEach((c, i) => { if (!rigPlanOf(LOOKS[i], c.equip)) notes.push(`${c.label}: リグ（パーツの絵）で描けていません（素体が無い・読み込み失敗）`); });
  return { notes, stats: { manifest: st.manifest, loaded: st.loaded, failed: st.failed, rig: st.rig && { files: st.rig.files, loaded: st.rig.loaded, failed: st.rig.failed } } };
}
function frameCount() { return Math.round(TOTAL * FPS); }
function frame(i) {
  const T = i / FPS, an = animAt(T);
  cv.width = CASES.length * 2 * CW; cv.height = CH + HEAD;
  const x = cv.getContext('2d');
  x.fillStyle = '#2b2638'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#ffffff'; x.font = 'bold 15px sans-serif';
  x.fillText(`${an.label}  ${T.toFixed(2)}s`, 8, 18);
  for (let k = 0; k < CASES.length; k++) for (const b of [0, 1]) {
    const X = (k * 2 + b) * CW;
    x.fillStyle = b ? '#332d44' : '#3a3550'; x.fillRect(X, HEAD, CW, CH);
    x.fillStyle = '#5a5470'; x.fillRect(X, HEAD + CH - 40, CW, 2);
    drawOne(x, X + CW / 2, HEAD + CH - 40, k, an, !!b, 2.6);
    x.fillStyle = '#d8d0ff'; x.font = '12px sans-serif';
    x.fillText((b ? '骨つき ' : '') + CASES[k].label.slice(0, 30), X + 6, HEAD + CH - 14);
  }
  return cv.toDataURL('image/png');
}
function sheet() {
  const cells = [];
  cells.push({ state: 'idle', t: 0, label: '立ち' }, { state: 'idle', t: 1.2, label: '立ち' });
  for (let k = 0; k < 10; k++) cells.push({ state: 'walk', t: (k + 0.5) * 0.06, label: `歩き${k + 1}/10` });
  for (let k = 0; k < 6; k++) cells.push({ state: 'attack', t: 0, attackT: (k + 0.5) / 6, label: `攻撃${k + 1}/6` });
  for (let k = 0; k < 3; k++) cells.push({ state: 'hurt', t: 0.025 + k * 0.1, label: `被弾${k + 1}/3` });
  const W = 128, H = 200, LW = 150;
  cv.width = LW + cells.length * W; cv.height = CASES.length * 2 * H;
  const x = cv.getContext('2d');
  x.fillStyle = '#2b2638'; x.fillRect(0, 0, cv.width, cv.height);
  CASES.forEach((c, k) => [0, 1].forEach((b) => {
    const Y = (k * 2 + b) * H;
    x.fillStyle = '#ffffff'; x.font = '12px sans-serif';
    const words = ((b ? '骨つき ' : '') + c.label).match(/.{1,11}/g) || [];
    words.slice(0, 6).forEach((w, j) => x.fillText(w, 6, Y + 24 + j * 16));
    cells.forEach((an, j) => {
      const X = LW + j * W;
      x.fillStyle = (j + k * 2 + b) % 2 ? '#3a3550' : '#352f4a'; x.fillRect(X, Y, W, H);
      drawOne(x, X + W / 2, Y + H - 26, k, an, !!b, 1.8);
      x.fillStyle = '#d8d0ff'; x.font = '11px sans-serif'; x.fillText(an.label, X + 4, Y + H - 8);
    });
  }));
  return cv.toDataURL('image/png');
}
window.ARTPREV = { ready: true, FPS, setup, frameCount, frame, sheet };
