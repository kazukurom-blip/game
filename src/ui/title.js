// タイトル画面 → キャラクター選択（6スロット）→ キャラクター作成（クラス→性別→見た目→名前）
// titleInput(game) は {slot, state}（既存キャラ）か {slot, create:{classId, name, gender, look}}（新規）を返す。
import { COL, FONT, font, txt, rrPath, panel, inset, drawButton, inRect, rgba, clamp, ease, wrap, measure, fmtMoney } from './theme.js';
import { guard, drawChar, mapInfo, regionColor, equipLooks } from './deps.js';
import {
  CLASSES, CLASS_IDS, classOf, defaultLook, defaultName, legacyGender, starterEquipLooks, branchInfo, hairStyles,
  HAIR_COLORS, EYE_COLORS, SKIN_COLORS, withHairColor, JOBS, charLook,
} from './v3deps.js';
import * as SaveM from '../core/save.js';
import { audio } from '../audio/audio.js';
import { showNameInput, hideNameInput, nameInputValue, setNameInputValue, clipName, NAME_MAX, focusNameInput } from './nameinput.js';

const W = 1280, H = 720;
const CLASS_COL = { luna: '#ff5fa2', jin: '#19d3c5', hacker: '#3dff8a' };
const CLASS_EN = { luna: 'STREET STAR', jin: 'STREET BRAWLER', hacker: 'STREET HACKER' };
const CLASS_WPN = { luna: 'ナイフ／銃', jin: 'バット／拳', hacker: '杖デバイス（魔法）' };
const CLASS_STARS = { luna: { 攻撃: 3, 速さ: 5, 耐久: 2, 範囲: 3 }, jin: { 攻撃: 5, 速さ: 2, 耐久: 5, 範囲: 3 }, hacker: { 攻撃: 4, 速さ: 3, 耐久: 2, 範囲: 5 } };
const RANDOM_NAMES = ['ネオ', 'ミラ', 'カイ', 'ユナ', 'レオ', 'リリィ', 'ジェット', 'ノヴァ', 'ヒカル', 'サクラ', 'ブレイズ', 'ルミ', 'ゼン', 'アオイ', 'ヴァイス', 'キララ', 'ソラ', 'マックス'];
const STEPS = ['クラス', '性別', '見た目', '名前'];
const LOOK_ROWS = ['hair', 'hairColor', 'eyeColor', 'skin', 'random'];
const ccol = (id) => CLASS_COL[id] || COL.pink;

const T = {
  screen: 'title', sel: 0, slots: null, slotsT: -9, del: null, btns: [], hover: null, mx: -1, my: -1, t0: 0,
  c: null, // 作成中 {slot, step, cls, gender, look, hair, row}
  hooked: false, flash: null,
};

function refreshSlots(force) {
  const now = performance.now() / 1000;
  if (!force && T.slots && now - T.slotsT < 2) return T.slots;
  T.slotsT = now;
  T.slots = guard('listSlots', () => SaveM.listSlots(), null) || new Array(SaveM.MAX_SLOTS || 6).fill(null);
  return T.slots;
}
const maxSlots = () => SaveM.MAX_SLOTS || 6;

function go(screen) {
  T.screen = screen; T.del = null; T.t0 = performance.now() / 1000;
  if (screen !== 'create' || T.c?.step !== 3) hideNameInput();
  if (screen === 'select') {
    refreshSlots(true);
    const act = guard('activeSlot', () => SaveM.activeSlot(), -1);
    if (act >= 0 && T.slots[act]) T.sel = act;
    else if (!T.slots[T.sel]) { const f = T.slots.findIndex(Boolean); if (f >= 0) T.sel = f; }
  }
}
function startCreate(slot) {
  const cls = CLASS_IDS[0] || 'luna';
  T.c = { slot, step: 0, cls, gender: legacyGender(cls), look: defaultLook(cls, legacyGender(cls)), row: 0, name: '' };
  setNameInputValue('');
  go('create');
}
function setStep(n) {
  const c = T.c;
  c.step = clamp(n, 0, 3);
  c.stepT = performance.now() / 1000;
  if (c.step !== 3) hideNameInput();
}
function setClass(cls) {
  const c = T.c;
  if (c.cls === cls) return;
  c.cls = cls;
  if (!c.genderTouched) c.gender = legacyGender(cls);
  c.look = defaultLook(cls, c.gender);
}
function setGender(g) {
  const c = T.c;
  c.genderTouched = true;
  if (c.gender === g) return;
  c.gender = g; c.look = defaultLook(c.cls, g);
}
function cycleHair(d) {
  const hs = hairStyles(), c = T.c;
  let i = hs.findIndex((h) => h.id === c.look.hair);
  i = (i + d + hs.length) % hs.length;
  c.look = { ...c.look, hair: hs[i].id };
}
function cyclePal(key, d) {
  const c = T.c;
  const pal = key === 'hairColor' ? HAIR_COLORS : key === 'eyeColor' ? EYE_COLORS : SKIN_COLORS;
  let i = pal.indexOf(c.look[key]);
  i = i < 0 ? 0 : (i + d + pal.length) % pal.length;
  setPal(key, pal[i]);
}
function setPal(key, v) {
  const c = T.c;
  c.look = key === 'hairColor' ? withHairColor(c.look, v) : { ...c.look, [key]: v };
}
function randomLook() {
  const c = T.c, R = (a) => a[Math.floor(Math.random() * a.length)];
  const hs = hairStyles();
  c.look = withHairColor({ ...c.look, hair: R(hs).id, eyeColor: R(EYE_COLORS), skin: R(SKIN_COLORS) }, R(HAIR_COLORS));
  T.flash = { t: performance.now() / 1000 };
}
function finishCreate() {
  const c = T.c;
  const name = clipName(nameInputValue()) || defaultName(c.cls, c.gender);
  hideNameInput();
  const out = { slot: c.slot, create: { classId: c.cls, name, gender: c.gender, look: { ...c.look } } };
  T.c = null; T.screen = 'title';
  return out;
}
function startSlot(i) {
  const s = refreshSlots(true)[i];
  if (!s) { startCreate(i); return null; }
  hideNameInput();
  T.screen = 'title';
  return { slot: i, state: s.state || guard('loadSlot', () => SaveM.loadSlot(i), null) };
}

// ---------------------------------------------------------------- 入力
export function titleInput(game) {
  const inp = game?.input;
  if (!inp) return null;
  if (!T.hooked && game.events?.on) {
    T.hooked = true;
    game.events.on('returnedToTitle', () => { T.c = null; go('select'); });
  }
  // テスト用: game._titleQuick = {slot, create} / {slot, state}
  if (game._titleQuick) { const q = game._titleQuick; game._titleQuick = null; hideNameInput(); T.screen = 'title'; return q; }
  const P = (a) => guard('input.pressed', () => !!inp.pressed(a), false);
  const eat = (...a) => a.forEach((k) => guard('consume', () => inp.consume?.(k)));
  const m = inp.mouse || {};
  T.hover = null;
  for (let i = T.btns.length - 1; i >= 0; i--) if (inRect(m.x, m.y, T.btns[i].r)) { T.hover = T.btns[i].id; break; }
  const moved = T.mx !== m.x || T.my !== m.y;
  T.mx = m.x; T.my = m.y;
  if (moved && T.hover) {
    const b = T.btns.find((x) => x.id === T.hover);
    b?.onHover?.();
  }
  let res = null;
  if (m.clicked && T.hover) {
    const b = T.btns.find((x) => x.id === T.hover);
    if (b && !b.disabled) res = b.fn?.() || null;
    guard('audio', () => audio?.sfx?.('uiClick'));
  }
  if (res) return res;
  if (T._finish) { T._finish = false; if (T.screen === 'create' && T.c?.step === 3) return finishCreate(); }
  const ok = P('confirm') || P('interact') || (P('jump') && T.screen !== 'create');
  const back = P('escape');
  const L = P('left'), R = P('right'), U = P('up'), D = P('down');
  if (ok) eat('confirm', 'interact', 'jump');
  if (back) eat('escape');

  if (T.screen === 'title') {
    if (ok) {
      const any = refreshSlots(true).some(Boolean);
      if (any) go('select'); else startCreate(Math.max(0, guard('firstEmpty', () => SaveM.firstEmptySlot(), 0)));
    }
    return null;
  }
  if (T.screen === 'select') {
    const n = maxSlots();
    if (T.del != null) {
      if (back) T.del = null;
      if (ok) doDelete();
      return null;
    }
    if (back) { go('title'); return null; }
    if (L) T.sel = (T.sel + n - 1) % n;
    if (R) T.sel = (T.sel + 1) % n;
    if (U || D) T.sel = (T.sel + 3) % n;
    if (ok) return startSlot(T.sel);
    return null;
  }
  if (T.screen === 'create') {
    const c = T.c;
    if (!c) { go('select'); return null; }
    if (c.step === 3) {
      // 名前入力中は DOM がキーを持つ。input 外にフォーカスがあるときだけゲーム側のキーで操作
      if (back) setStep(2);
      else if (ok) return finishCreate();
      return null;
    }
    if (back) { if (c.step === 0) go('select'); else setStep(c.step - 1); return null; }
    if (c.step === 0) {
      const i = CLASS_IDS.indexOf(c.cls);
      if (L) setClass(CLASS_IDS[(i + CLASS_IDS.length - 1) % CLASS_IDS.length]);
      if (R) setClass(CLASS_IDS[(i + 1) % CLASS_IDS.length]);
    } else if (c.step === 1) {
      if (L || R) setGender(c.gender === 'f' ? 'm' : 'f');
    } else if (c.step === 2) {
      if (U) c.row = (c.row + LOOK_ROWS.length - 1) % LOOK_ROWS.length;
      if (D) c.row = (c.row + 1) % LOOK_ROWS.length;
      const k = LOOK_ROWS[c.row];
      if (L || R) {
        const d = L ? -1 : 1;
        if (k === 'hair') cycleHair(d); else if (k === 'random') randomLook(); else cyclePal(k, d);
      }
    }
    if (ok) { if (c.step === 2 && LOOK_ROWS[c.row] === 'random') randomLook(); else setStep(c.step + 1); }
  }
  return null;
}
function doDelete() {
  const i = T.del;
  T.del = null;
  if (i == null) return;
  guard('deleteSlot', () => SaveM.deleteSlot(i));
  refreshSlots(true);
  globalThis.game?.notify?.('キャラクターを削除しました', COL.dim);
}

// ---------------------------------------------------------------- 描画
function btn(ctx, id, r, label, fn, o = {}) {
  const hov = T.hover === id && !o.disabled;
  T.btns.push({ id, r, fn, disabled: o.disabled, onHover: o.onHover });
  if (o.draw) { o.draw(hov); return hov; }
  ctx.save();
  if (o.glow && !o.disabled) { ctx.shadowColor = o.glow; ctx.shadowBlur = 14 + 8 * Math.sin(performance.now() / 160); }
  drawButton(ctx, r, label, { color: o.color || COL.purple, hover: hov || o.active, size: o.size || 16, r: o.r ?? Math.min(r.h / 2, 18), disabled: o.disabled });
  ctx.restore();
  return hov;
}
function region(ctx, id, r, fn, o = {}) { T.btns.push({ id, r, fn, disabled: o.disabled, onHover: o.onHover }); return T.hover === id; }

export function drawTitle(ctx, game, t) {
  t = t ?? game?.time ?? 0;
  T.btns = [];
  const bgm = T.screen === 'title' ? 'title' : 'select';
  if (T._bgm !== bgm) { T._bgm = bgm; guard('setTitleScreen', () => audio?.setTitleScreen?.(bgm)); }
  ctx.save();
  try {
    drawBackdrop(ctx, t);
    if (T.screen === 'title') drawTitleScreen(ctx, game, t);
    else if (T.screen === 'select') drawSelect(ctx, game, t);
    else if (T.screen === 'create') drawCreate(ctx, game, t);
  } catch (e) { guard('title', () => { throw e; }); }
  ctx.restore();
  if (T.screen !== 'create' || T.c?.step !== 3) hideNameInput();
}

// ---------- タイトル ----------
function drawTitleScreen(ctx, game, t) {
  ctx.save(); ctx.fillStyle = 'rgba(10,4,30,0.18)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  drawLogo(ctx, t, 170, 1.15);
  // 3クラスのシルエット行進
  const ids = CLASS_IDS.slice(0, 3);
  ids.forEach((id, i) => {
    const x = W / 2 + (i - 1) * 230, y = 618;
    const g = i % 2 ? 'm' : 'f';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 62, 12, 0, 0, Math.PI * 2); ctx.fill();
    const lg = ctx.createRadialGradient(x, y - 70, 10, x, y - 70, 160);
    lg.addColorStop(0, rgba(ccol(id), 0.35)); lg.addColorStop(1, rgba(ccol(id), 0));
    ctx.fillStyle = lg; ctx.fillRect(x - 170, y - 240, 340, 280);
    ctx.restore();
    drawChar(ctx, x, y, defaultLook(id, g), starterEquipLooks(id, g), { facing: i === 0 ? 1 : i === 2 ? -1 : 1, state: 'idle', t: t + i, attackT: 0, damage: 0, scale: 1.85 });
  });
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
  const r = { x: W / 2 - 170, y: 300, w: 340, h: 58 };
  btn(ctx, 'start', r, '▶  PRESS START', () => {
    const any = refreshSlots(true).some(Boolean);
    if (any) go('select'); else startCreate(Math.max(0, guard('firstEmpty', () => SaveM.firstEmptySlot(), 0)));
  }, { color: '#d93f86', size: 22, glow: COL.pink, r: 29 });
  txt(ctx, 'Enter ・ Space ・ クリック でスタート', W / 2, r.y + r.h + 18, { size: 13, align: 'center', color: '#ffe3f0', alpha: 0.55 + pulse * 0.45, sw: 3 });
  const n = refreshSlots().filter(Boolean).length;
  txt(ctx, n ? `セーブデータ ${n} / ${maxSlots()} キャラ` : 'はじめてのプレイ：キャラクターを作ろう！', W / 2, r.y + r.h + 42, { size: 12, align: 'center', color: COL.sub, sw: 3 });
  helpBar(ctx, '←→ 移動  Space ジャンプ  X 攻撃  A S D F Q W G H スキル  V 会話  E 乗車  ↑ ポータル  I/K/J/T 窓  M 地図  U コンテンツ  O 実績  Esc メニュー');
  txt(ctx, '© NEON VICE STORY  —  ネオリダ州ヴァイス・ベイ市（架空）', W - 16, 16, { size: 10, align: 'right', color: 'rgba(255,255,255,0.45)', stroke: false });
}
function helpBar(ctx, s) {
  ctx.save();
  rrPath(ctx, 40, H - 40, W - 80, 28, 14);
  ctx.fillStyle = 'rgba(10,4,30,0.72)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,95,162,0.6)'; ctx.stroke();
  ctx.restore();
  txt(ctx, s, W / 2, H - 25.5, { size: 12, align: 'center', color: '#e9e4ff', sw: 2.5, maxW: W - 110, weight: 700 });
}
function header(ctx, title, t, sub) {
  ctx.save(); ctx.fillStyle = 'rgba(8,3,26,0.42)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  ctx.save();
  ctx.font = `italic 900 26px ${FONT}`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a0630'; ctx.strokeText('NEON VICE STORY', 36, 44);
  const g = ctx.createLinearGradient(0, 30, 0, 58); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, '#ff8ac0'); g.addColorStop(1, '#b47cff');
  ctx.fillStyle = g; ctx.shadowColor = COL.pink; ctx.shadowBlur = 14; ctx.fillText('NEON VICE STORY', 36, 44);
  ctx.restore();
  const tw = measure(ctx, title, 22) + 70;
  ctx.save();
  rrPath(ctx, W / 2 - tw / 2, 24, tw, 42, 21);
  const hg = ctx.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0);
  hg.addColorStop(0, 'rgba(255,95,162,0.95)'); hg.addColorStop(0.55, 'rgba(123,47,247,0.95)'); hg.addColorStop(1, 'rgba(25,211,197,0.9)');
  ctx.fillStyle = hg; ctx.shadowColor = COL.pink; ctx.shadowBlur = 16; ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
  txt(ctx, title, W / 2, 46, { size: 22, align: 'center', sw: 4 });
  if (sub) txt(ctx, sub, W - 36, 46, { size: 13, align: 'right', color: COL.sub, sw: 3 });
  void t;
}
function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  const diff = (Date.now() - ms) / 1000;
  const rel = diff < 60 ? 'たった今' : diff < 3600 ? `${Math.floor(diff / 60)}分前` : diff < 86400 ? `${Math.floor(diff / 3600)}時間前` : `${Math.floor(diff / 86400)}日前`;
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}（${rel}）`;
}
function slotLook(s) { return s.look || defaultLook(s.heroId || 'luna', s.gender || legacyGender(s.heroId)); }
function slotEquip(s) { return guard('slotEquip', () => equipLooks(s.state || { equipped: s.equipped }), {}) || {}; }
function slotJob(s) { return JOBS[s.state?.job?.id || s.job] || JOBS.beginner || { name: '見習い', title: '見習い', tier: 0 }; }
function genderMark(g) { return g === 'm' ? '♂' : '♀'; }
function genderCol(g) { return g === 'm' ? '#5cb8ff' : '#ff7ab8'; }

function stage(ctx, x, y, w, h, col, t) {
  ctx.save();
  rrPath(ctx, x, y, w, h, 12);
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, rgba(col, 0.42)); bg.addColorStop(0.6, 'rgba(60,20,110,0.55)'); bg.addColorStop(1, 'rgba(10,6,30,0.85)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.clip();
  const fy = y + h - Math.min(40, h * 0.22);
  ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const yy = fy + i * i * 3 + i * 4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(x + w / 2 + i * 12, fy); ctx.lineTo(x + w / 2 + i * 50, y + h); ctx.stroke(); }
  const sg = ctx.createRadialGradient(x + w / 2, y + h * 0.42, 4, x + w / 2, y + h * 0.42, w * 0.45);
  sg.addColorStop(0, 'rgba(255,230,160,0.35)'); sg.addColorStop(1, 'rgba(255,230,160,0)');
  ctx.fillStyle = sg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.ellipse(x + w / 2, fy + 4, w * 0.2, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  void t;
  return fy + 4;
}
function aura(ctx, x, y, col, s, t) {
  if (!col) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 40 * s, 4, x, y - 40 * s, 60 * s);
  g.addColorStop(0, rgba(col, 0.35 + 0.1 * Math.sin(t * 4))); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 40 * s, 46 * s, 64 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 30 * s + Math.sin(t * 5) * 2, 7 * s, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ---------- キャラクター選択 ----------
function drawSelect(ctx, game, t) {
  const slots = refreshSlots();
  header(ctx, 'キャラクター選択', t, `${slots.filter(Boolean).length} / ${maxSlots()} スロット使用中`);
  const x0 = 36, y0 = 92, cw = 254, ch = 262, gap = 14;
  for (let i = 0; i < maxSlots(); i++) {
    const r = { x: x0 + (i % 3) * (cw + gap), y: y0 + Math.floor(i / 3) * (ch + gap), w: cw, h: ch };
    const s = slots[i];
    const sel = T.sel === i;
    const hov = region(ctx, 'slot' + i, r, () => {
      if (T.sel === i && T._lastClickSlot === i && performance.now() - (T._lastClickT || 0) < 400) return startSlot(i);
      T.sel = i; T._lastClickSlot = i; T._lastClickT = performance.now();
      return null;
    });
    drawSlotCard(ctx, r, s, i, sel, hov, t);
  }
  // 右: 詳細
  const px = 844, py = 92, pw = 400, ph = 538;
  const s = slots[T.sel];
  const col = s ? ccol(s.heroId) : COL.purple;
  panel(ctx, px, py, pw, ph, { r: 18, glow: rgba(col, 0.55), inner: rgba(col, 0.6) });
  if (s) {
    const job = slotJob(s);
    const fy = stage(ctx, px + 14, py + 14, pw - 28, 250, col, t);
    aura(ctx, px + pw / 2, fy, job.aura, 2.6, t);
    drawChar(ctx, px + pw / 2, fy, slotLook(s), slotEquip(s), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 2.7, aura: job.aura || undefined });
    let yy = py + 290;
    txt(ctx, s.name || '???', px + 24, yy, { size: 28, color: '#fff', glow: col, sw: 5, maxW: 250 });
    txt(ctx, genderMark(s.gender || legacyGender(s.heroId)), px + 30 + Math.min(250, measure(ctx, s.name || '???', 28)), yy + 2, { size: 22, color: genderCol(s.gender || legacyGender(s.heroId)) });
    txt(ctx, `Lv.${s.level || 1}`, px + pw - 24, yy, { size: 26, align: 'right', color: COL.gold, sw: 5 });
    yy += 32;
    txt(ctx, `${classOf(s.heroId).name}  ・  ${job.name}`, px + 24, yy, { size: 15, color: col, sw: 3, maxW: pw - 48 });
    yy += 26;
    const mi = mapInfo(s.mapId || 'beach');
    const rows = [
      ['称号', job.title || '—'],
      ['現在地', `${mi.name}${mi.levelRange ? `（Lv${mi.levelRange[0]}-${mi.levelRange[1]}）` : mi.town ? '（町）' : ''}`],
      ['所持金', fmtMoney(s.state?.money || 0)],
      ['最終プレイ', fmtDate(s.savedAt)],
    ];
    for (const [k, v] of rows) {
      inset(ctx, px + 20, yy - 11, pw - 40, 24, { r: 8, fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.08)' });
      txt(ctx, k, px + 32, yy + 1, { size: 12, color: COL.sub, sw: 2.5 });
      txt(ctx, v, px + pw - 32, yy + 1, { size: 13, align: 'right', color: k === '現在地' ? regionColor(mi.region) : k === '所持金' ? COL.money : '#fff', sw: 3, maxW: pw - 130 });
      yy += 28;
    }
    btn(ctx, 'play', { x: px + 20, y: py + ph - 66, w: pw - 130, h: 48 }, '▶ ゲームスタート', () => startSlot(T.sel), { color: '#d93f86', size: 19, glow: COL.pink, r: 24 });
    btn(ctx, 'del', { x: px + pw - 100, y: py + ph - 66, w: 80, h: 48 }, '削除', () => { T.del = T.sel; return null; }, { color: '#8a2a4a', size: 15, r: 16 });
  } else {
    const fy = stage(ctx, px + 14, py + 14, pw - 28, 250, COL.purple, t);
    ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 2);
    drawChar(ctx, px + pw / 2, fy, null, {}, { scale: 2.6 });
    ctx.restore();
    txt(ctx, '？', px + pw / 2, fy - 110, { size: 64, align: 'center', color: '#fff', glow: COL.purple, alpha: 0.8 });
    txt(ctx, `スロット ${T.sel + 1}  ・  空き`, px + pw / 2, py + 300, { size: 22, align: 'center', color: '#fff' });
    const L = ['クラス（3種）と性別を選んで、', '髪型・髪色・瞳・肌の色をカスタマイズ。', '名前をつけたら冒険スタート！', 'キャラごとに別々に保存されます。'];
    L.forEach((l, i) => txt(ctx, l, px + pw / 2, py + 340 + i * 24, { size: 13.5, align: 'center', color: COL.sub, sw: 3, weight: 700 }));
    btn(ctx, 'create', { x: px + 40, y: py + ph - 70, w: pw - 80, h: 52 }, '＋ キャラクターを作成', () => { startCreate(T.sel); return null; }, { color: '#109f95', size: 19, glow: COL.teal, r: 26 });
  }
  helpBar(ctx, '←→↑↓ スロット選択   Enter 決定（空きなら新規作成）   ダブルクリックで即スタート   Esc タイトルへ');
  btn(ctx, 'back', { x: 36, y: 642, w: 150, h: 34 }, '◀ タイトルへ', () => { go('title'); return null; }, { color: COL.purple, size: 14 });
  if (T.del != null) drawDeleteConfirm(ctx, slots[T.del], t);
}
function drawSlotCard(ctx, r, s, i, sel, hov, t) {
  const col = s ? ccol(s.heroId) : '#8d88bd';
  const lift = sel ? -4 : hov ? -2 : 0;
  const y = r.y + lift;
  if (!s) {
    ctx.save();
    rrPath(ctx, r.x, y, r.w, r.h, 16);
    ctx.fillStyle = sel ? 'rgba(60,30,120,0.7)' : hov ? 'rgba(45,25,95,0.6)' : 'rgba(20,12,50,0.55)'; ctx.fill();
    ctx.setLineDash([8, 7]); ctx.lineDashOffset = -t * 18;
    ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = sel ? '#fff' : 'rgba(200,180,255,0.6)';
    if (sel) { ctx.shadowColor = COL.teal; ctx.shadowBlur = 16; }
    ctx.stroke();
    ctx.restore();
    const k = 1 + (sel ? 0.06 * Math.sin(t * 4) : 0);
    ctx.save(); ctx.translate(r.x + r.w / 2, y + r.h / 2 - 18); ctx.scale(k, k);
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fillStyle = sel ? 'rgba(25,211,197,0.35)' : 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = sel ? COL.teal : 'rgba(255,255,255,0.4)'; ctx.stroke();
    ctx.restore();
    txt(ctx, '＋', r.x + r.w / 2, y + r.h / 2 - 17, { size: 36, align: 'center', color: sel ? '#fff' : COL.sub });
    txt(ctx, '新規作成', r.x + r.w / 2, y + r.h / 2 + 38, { size: 17, align: 'center', color: sel ? '#fff' : COL.sub });
    txt(ctx, `SLOT ${i + 1}`, r.x + 14, y + 18, { size: 11, color: COL.dim, sw: 2.5 });
    return;
  }
  panel(ctx, r.x, y, r.w, r.h, { r: 16, glow: sel ? rgba(col, 0.9) : null, stroke: sel ? '#fff' : 'rgba(255,255,255,0.55)', inner: rgba(col, sel ? 0.8 : 0.45), top: sel ? 'rgba(70,36,140,0.95)' : 'rgba(40,26,92,0.9)' });
  const job = slotJob(s);
  const fy = stage(ctx, r.x + 8, y + 8, r.w - 16, 150, col, t);
  if (sel) aura(ctx, r.x + r.w / 2, fy, job.aura || col, 1.5, t);
  drawChar(ctx, r.x + r.w / 2, fy, slotLook(s), slotEquip(s), { facing: 1, state: sel ? 'walk' : 'idle', t: t + i * 0.37, attackT: 0, damage: 0, scale: 1.55 });
  txt(ctx, `SLOT ${i + 1}`, r.x + 16, y + 22, { size: 10.5, color: '#ffe3f0', sw: 2.5 });
  ctx.save(); rrPath(ctx, r.x + r.w - 66, y + 13, 54, 20, 10); ctx.fillStyle = 'rgba(10,4,30,0.75)'; ctx.fill(); ctx.restore();
  txt(ctx, `Lv.${s.level || 1}`, r.x + r.w - 39, y + 23.5, { size: 12.5, align: 'center', color: COL.gold, sw: 2.5 });
  let yy = y + 178;
  txt(ctx, s.name || '???', r.x + 14, yy, { size: 19, color: '#fff', glow: sel ? col : null, maxW: r.w - 50 });
  txt(ctx, genderMark(s.gender || legacyGender(s.heroId)), r.x + r.w - 18, yy, { size: 17, align: 'right', color: genderCol(s.gender || legacyGender(s.heroId)) });
  yy += 24;
  txt(ctx, job.name, r.x + 14, yy, { size: 13, color: col, sw: 3, maxW: r.w - 28 });
  yy += 20;
  const mi = mapInfo(s.mapId || 'beach');
  txt(ctx, '📍 ' + mi.name, r.x + 14, yy, { size: 11.5, color: COL.sub, sw: 2.5, maxW: r.w - 28, weight: 700 });
  yy += 18;
  txt(ctx, fmtDate(s.savedAt), r.x + 14, yy, { size: 10.5, color: COL.dim, sw: 2.5, maxW: r.w - 28, weight: 700 });
}
function drawDeleteConfirm(ctx, s, t) {
  ctx.save(); ctx.fillStyle = 'rgba(4,2,16,0.7)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  T.btns.length = 0; // 背面のボタンは無効
  const w = 520, h = 250, x = (W - w) / 2, y = (H - h) / 2;
  panel(ctx, x, y, w, h, { r: 18, glow: 'rgba(255,60,100,0.7)', inner: 'rgba(255,95,162,0.6)' });
  txt(ctx, '⚠ キャラクターを削除', x + w / 2, y + 40, { size: 22, align: 'center', color: '#ffd6e8', glow: COL.bad });
  if (s) {
    txt(ctx, `「${s.name}」 Lv.${s.level || 1}  ${slotJob(s).name}`, x + w / 2, y + 86, { size: 17, align: 'center', color: '#fff' });
    txt(ctx, 'を削除しますか？ この操作は取り消せません。', x + w / 2, y + 116, { size: 14, align: 'center', color: COL.sub, weight: 700 });
  }
  btn(ctx, 'delYes', { x: x + 40, y: y + h - 76, w: 200, h: 46 }, '削除する [Enter]', () => { doDelete(); return null; }, { color: '#c02a52', size: 16 });
  btn(ctx, 'delNo', { x: x + w - 240, y: y + h - 76, w: 200, h: 46 }, 'やめる [Esc]', () => { T.del = null; return null; }, { color: COL.purple, size: 16 });
  void t;
}

// ---------- キャラクター作成 ----------
function drawCreate(ctx, game, t) {
  const c = T.c;
  if (!c) return;
  header(ctx, 'キャラクター作成', t, `スロット ${c.slot + 1}`);
  // ステップ表示
  const sw = 150, sx0 = W / 2 - (sw * 4 + 30) / 2, sy = 84;
  STEPS.forEach((s, i) => {
    const r = { x: sx0 + i * (sw + 10), y: sy, w: sw, h: 30 };
    const on = c.step === i, done = c.step > i;
    const clickable = i < c.step;
    region(ctx, 'step' + i, r, () => { if (clickable) setStep(i); return null; }, { disabled: !clickable });
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 15);
    ctx.fillStyle = on ? COL.pink : done ? 'rgba(25,211,197,0.55)' : 'rgba(10,6,30,0.65)';
    if (on) { ctx.shadowColor = COL.pink; ctx.shadowBlur = 14; }
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff' : 'rgba(200,180,255,0.5)'; ctx.stroke();
    ctx.restore();
    txt(ctx, `${done ? '✔' : i + 1}  ${s}`, r.x + r.w / 2, r.y + 16, { size: 14, align: 'center', color: on || done ? '#fff' : COL.sub });
  });
  // 左: プレビュー
  const lx = 36, ly = 128, lw = 420, lh = 504;
  const col = ccol(c.cls);
  panel(ctx, lx, ly, lw, lh, { r: 18, glow: rgba(col, 0.5), inner: rgba(col, 0.6) });
  const fy = stage(ctx, lx + 14, ly + 14, lw - 28, 384, col, t);
  if (T.flash && performance.now() / 1000 - T.flash.t < 0.5) {
    const k = 1 - (performance.now() / 1000 - T.flash.t) / 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${0.35 * k})`; ctx.beginPath(); ctx.arc(lx + lw / 2, fy - 100, 140 * (1.2 - k * 0.2), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const facing = Math.floor(t / 3) % 2 ? -1 : 1;
  const st = c.step === 0 ? (Math.floor(t / 2) % 3 === 2 ? 'attack' : 'idle') : 'idle';
  drawChar(ctx, lx + lw / 2, fy, c.look, starterEquipLooks(c.cls, c.gender), { facing, state: st, t, attackT: st === 'attack' ? (t % 2) / 2 : 0, damage: 0, scale: 3.3 });
  const nm = (c.step === 3 ? clipName(nameInputValue()) : '') || defaultName(c.cls, c.gender);
  txt(ctx, nm, lx + lw / 2, ly + 428, { size: 26, align: 'center', color: '#fff', glow: col, sw: 5, maxW: lw - 60 });
  txt(ctx, `${classOf(c.cls).name}  ${genderMark(c.gender)}`, lx + lw / 2, ly + 462, { size: 15, align: 'center', color: col, sw: 3 });
  txt(ctx, CLASS_EN[c.cls] || '', lx + lw / 2, ly + 486, { size: 11, align: 'center', color: COL.dim, sw: 2.5 });
  // 右: 各ステップ
  const rx = 470, ry = 128, rw = 774, rh = 504;
  panel(ctx, rx, ry, rw, rh, { r: 18 });
  const k = ease((performance.now() / 1000 - (c.stepT || 0)) / 0.25);
  ctx.save();
  ctx.globalAlpha = 0.3 + 0.7 * k;
  ctx.translate((1 - k) * 24, 0);
  if (c.step === 0) stepClass(ctx, c, rx, ry, rw, rh, t);
  else if (c.step === 1) stepGender(ctx, c, rx, ry, rw, rh, t);
  else if (c.step === 2) stepLook(ctx, c, rx, ry, rw, rh, t);
  else stepName(ctx, game, c, rx, ry, rw, rh, t);
  ctx.restore();
  // 戻る/次へ
  const by = ry + rh - 62;
  btn(ctx, 'prev', { x: rx + 20, y: by, w: 160, h: 44 }, c.step === 0 ? '◀ キャラ選択へ' : '◀ 戻る', () => { if (c.step === 0) go('select'); else setStep(c.step - 1); return null; }, { color: COL.purple, size: 15 });
  if (c.step < 3) btn(ctx, 'next', { x: rx + rw - 200, y: by, w: 180, h: 44 }, '次へ ▶', () => { setStep(c.step + 1); return null; }, { color: '#d93f86', size: 17, glow: COL.pink });
  else btn(ctx, 'finish', { x: rx + rw - 290, y: by, w: 270, h: 48 }, '★ この内容で冒険へ！', () => finishCreate(), { color: '#d93f86', size: 18, glow: COL.pink, r: 24 });
  const hints = ['←→ クラスを選択   Enter 次へ   Esc 戻る', '←→ 性別を選択   Enter 次へ   Esc 戻る', '↑↓ 項目  ←→ 変更  （ランダムで Enter）   Enter 次へ', '名前を入力して Enter（IME 対応・最大10文字・空欄なら既定名）'];
  helpBar(ctx, hints[c.step]);
}
function stepTitle(ctx, s, sub, rx, ry, rw) {
  txt(ctx, s, rx + 26, ry + 34, { size: 22, color: '#fff', glow: COL.pink });
  if (sub) txt(ctx, sub, rx + rw - 26, ry + 36, { size: 13, align: 'right', color: COL.sub, sw: 3 });
}
function stepClass(ctx, c, rx, ry, rw, rh, t) {
  stepTitle(ctx, 'クラスを選ぼう', '3クラス × 2系統 × 4段階 = 24職', rx, ry, rw);
  const n = CLASS_IDS.length, gap = 14, cw = (rw - 40 - gap * (n - 1)) / n, chh = 360;
  CLASS_IDS.forEach((id, i) => {
    const C = classOf(id), col = ccol(id);
    const r = { x: rx + 20 + i * (cw + gap), y: ry + 60, w: cw, h: chh };
    const on = c.cls === id;
    const hov = region(ctx, 'cls' + id, r, () => {
      if (on && T._lc === id && performance.now() - (T._lcT || 0) < 400) setStep(1);
      setClass(id); T._lc = id; T._lcT = performance.now(); return null;
    });
    const y = r.y - (on ? 4 : 0);
    panel(ctx, r.x, y, r.w, r.h, { r: 14, glow: on ? rgba(col, 0.9) : null, stroke: on ? '#fff' : hov ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', inner: rgba(col, on ? 0.8 : 0.35), top: on ? 'rgba(70,36,140,0.95)' : 'rgba(34,22,80,0.9)' });
    const fy = stage(ctx, r.x + 8, y + 8, r.w - 16, 120, col, t);
    drawChar(ctx, r.x + r.w / 2, fy, defaultLook(id, c.gender), starterEquipLooks(id, c.gender), { facing: 1, state: on ? 'walk' : 'idle', t: t + i, attackT: 0, damage: 0, scale: 1.25 });
    let yy = y + 148;
    txt(ctx, C.name, r.x + r.w / 2, yy, { size: 18, align: 'center', color: '#fff', glow: on ? col : null, maxW: r.w - 16 });
    yy += 22;
    ctx.save(); rrPath(ctx, r.x + 16, yy - 9, r.w - 32, 19, 9.5); ctx.fillStyle = rgba(col, 0.28); ctx.fill(); ctx.restore();
    txt(ctx, `武器: ${CLASS_WPN[id] || ''}`, r.x + r.w / 2, yy + 1, { size: 11, align: 'center', color: COL.gold, sw: 2.5, maxW: r.w - 36 });
    yy += 22;
    for (const l of wrap(ctx, C.desc || '', r.w - 28, 11.5, 700).slice(0, 3)) { txt(ctx, l, r.x + 14, yy, { size: 11.5, weight: 700, sw: 2.5, color: '#efeaff' }); yy += 16; }
    yy = y + 262;
    const S = CLASS_STARS[id] || {};
    Object.entries(S).forEach(([k, v], j) => {
      const cx = r.x + 14 + (j % 2) * ((r.w - 28) / 2), cy = yy + Math.floor(j / 2) * 18;
      txt(ctx, k, cx, cy, { size: 10.5, color: COL.sub, sw: 2.5 });
      for (let q = 0; q < 5; q++) txt(ctx, '★', cx + 32 + q * 11, cy, { size: 10, color: q < v ? col : 'rgba(255,255,255,0.18)', stroke: false });
    });
    yy += 44;
    (C.branches || []).slice(0, 2).forEach((b, j) => {
      const B = branchInfo(b);
      if (!B) return;
      const bx = r.x + 10 + j * ((r.w - 20) / 2), bw = (r.w - 20) / 2 - 4;
      ctx.save(); rrPath(ctx, bx, yy - 2, bw, 40, 8); ctx.fillStyle = rgba(B.color || col, 0.22); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(B.color || col, 0.8); ctx.stroke(); ctx.restore();
      txt(ctx, B.name, bx + bw / 2, yy + 10, { size: 10.5, align: 'center', color: '#fff', sw: 2.5, maxW: bw - 8 });
      txt(ctx, B.desc || '', bx + bw / 2, yy + 27, { size: 9, align: 'center', color: COL.sub, sw: 2, maxW: bw - 8, weight: 700 });
    });
  });
}
function stepGender(ctx, c, rx, ry, rw, rh, t) {
  stepTitle(ctx, '性別を選ぼう', 'どのクラスも ♂♀ を選べます（性能は同じ）', rx, ry, rw);
  ['f', 'm'].forEach((g, i) => {
    const r = { x: rx + 60 + i * 340, y: ry + 66, w: 314, h: 350 };
    const on = c.gender === g, gc = genderCol(g);
    const hov = region(ctx, 'g' + g, r, () => {
      if (on && T._lg === g && performance.now() - (T._lgT || 0) < 400) setStep(2);
      setGender(g); T._lg = g; T._lgT = performance.now(); return null;
    });
    const y = r.y - (on ? 4 : 0);
    panel(ctx, r.x, y, r.w, r.h, { r: 16, glow: on ? rgba(gc, 0.9) : null, stroke: on ? '#fff' : hov ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', inner: rgba(gc, on ? 0.8 : 0.35) });
    const fy = stage(ctx, r.x + 10, y + 10, r.w - 20, 260, gc, t);
    drawChar(ctx, r.x + r.w / 2, fy, defaultLook(c.cls, g), starterEquipLooks(c.cls, g), { facing: i ? -1 : 1, state: 'idle', t: t + i, attackT: 0, damage: 0, scale: 2.4 });
    txt(ctx, g === 'f' ? '♀ 女性' : '♂ 男性', r.x + r.w / 2, y + 300, { size: 24, align: 'center', color: gc, glow: on ? gc : null, sw: 5 });
    txt(ctx, `既定名: ${defaultName(c.cls, g)}`, r.x + r.w / 2, y + 330, { size: 13, align: 'center', color: COL.sub, sw: 3 });
  });
}
function swatchRow(ctx, c, key, pal, x, y, w, t, rowOn) {
  const n = pal.length, s = Math.min(34, (w - (n - 1) * 6) / n);
  pal.forEach((v, i) => {
    const r = { x: x + i * (s + 6), y, w: s, h: s };
    const on = String(c.look[key]).toLowerCase() === v.toLowerCase();
    const hov = region(ctx, key + i, r, () => { setPal(key, v); c.row = LOOK_ROWS.indexOf(key); return null; });
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 9);
    ctx.fillStyle = v; ctx.fill();
    ctx.lineWidth = on ? 3.5 : 1.5; ctx.strokeStyle = on ? '#fff' : hov ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)';
    if (on) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; }
    ctx.stroke();
    ctx.restore();
    if (on) txt(ctx, '✔', r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 14, align: 'center', color: '#fff', sw: 3 });
  });
  void t; void rowOn;
}
function stepLook(ctx, c, rx, ry, rw, rh, t) {
  stepTitle(ctx, '見た目をカスタマイズ', '←→ で切替・色はクリックで選択', rx, ry, rw);
  const x = rx + 24, w = rw - 48;
  const rows = [['hair', '髪型'], ['hairColor', '髪の色'], ['eyeColor', '瞳の色'], ['skin', '肌の色'], ['random', 'おまかせ']];
  rows.forEach(([key, label], i) => {
    const y = ry + 66 + i * 70;
    const on = c.row === i;
    const rr = { x, y, w, h: 60 };
    region(ctx, 'row' + key, { x, y, w: 150, h: 60 }, () => { c.row = i; return null; });
    inset(ctx, rr.x, rr.y, rr.w, rr.h, { r: 12, fill: on ? 'rgba(255,95,162,0.2)' : 'rgba(6,4,24,0.45)', stroke: on ? COL.pink : 'rgba(190,170,255,0.3)', lw: on ? 2.5 : 1.5 });
    txt(ctx, (on ? '▶ ' : '') + label, x + 18, y + 30, { size: 16, color: on ? '#fff' : COL.sub });
    const cx = x + 170, cw2 = w - 190;
    if (key === 'hair') {
      const hs = hairStyles();
      const cur = hs.find((h) => h.id === c.look.hair) || { name: c.look.hair };
      btn(ctx, 'hairL', { x: cx, y: y + 12, w: 44, h: 36 }, '◀', () => { cycleHair(-1); c.row = 0; return null; }, { color: COL.purple, size: 16 });
      inset(ctx, cx + 54, y + 12, cw2 - 108, 36, { r: 10, fill: 'rgba(0,0,0,0.35)' });
      txt(ctx, cur.name, cx + 54 + (cw2 - 108) / 2, y + 30.5, { size: 17, align: 'center', color: '#fff' });
      const idx = hs.findIndex((h) => h.id === c.look.hair);
      txt(ctx, `${idx + 1} / ${hs.length}`, cx + cw2 - 66, y + 30.5, { size: 11, align: 'right', color: COL.dim, sw: 2.5 });
      btn(ctx, 'hairR', { x: cx + cw2 - 44, y: y + 12, w: 44, h: 36 }, '▶', () => { cycleHair(1); c.row = 0; return null; }, { color: COL.purple, size: 16 });
    } else if (key === 'random') {
      btn(ctx, 'rand', { x: cx, y: y + 10, w: 220, h: 40 }, '🎲 ランダム', () => { randomLook(); c.row = 4; return null; }, { color: '#c98a1a', size: 16, glow: on ? COL.gold : null });
      btn(ctx, 'reset', { x: cx + 236, y: y + 10, w: 200, h: 40 }, '↺ 初期に戻す', () => { c.look = defaultLook(c.cls, c.gender); return null; }, { color: COL.purple, size: 15 });
    } else {
      const pal = key === 'hairColor' ? HAIR_COLORS : key === 'eyeColor' ? EYE_COLORS : SKIN_COLORS;
      swatchRow(ctx, c, key, pal, cx, y + 13, cw2, t, on);
    }
  });
}
function stepName(ctx, game, c, rx, ry, rw, rh, t) {
  stepTitle(ctx, '名前をつけよう', `最大 ${NAME_MAX} 文字・日本語入力OK`, rx, ry, rw);
  const ir = { x: rx + 120, y: ry + 110, w: rw - 240, h: 62 };
  // 枠のグロー（DOM の input がこの上に重なる）
  ctx.save();
  rrPath(ctx, ir.x - 6, ir.y - 6, ir.w + 12, ir.h + 12, 18);
  ctx.strokeStyle = rgba(COL.pink, 0.5 + 0.3 * Math.sin(t * 4)); ctx.lineWidth = 3; ctx.shadowColor = COL.pink; ctx.shadowBlur = 18; ctx.stroke();
  ctx.restore();
  inset(ctx, ir.x, ir.y, ir.w, ir.h, { r: 14, fill: 'rgba(14,8,44,0.9)' });
  region(ctx, 'nameBox', ir, () => { focusNameInput(); return null; });
  showNameInput(game?.canvas || document.getElementById('game'), ir, null, defaultName(c.cls, c.gender), () => { T._finish = true; });
  const v = nameInputValue();
  txt(ctx, `${Array.from(v).length} / ${NAME_MAX}`, ir.x + ir.w, ir.y + ir.h + 18, { size: 12, align: 'right', color: Array.from(v).length >= NAME_MAX ? COL.gold : COL.sub, sw: 2.5 });
  txt(ctx, `空欄のときは「${defaultName(c.cls, c.gender)}」になります`, ir.x, ir.y + ir.h + 18, { size: 12, color: COL.sub, sw: 2.5 });
  btn(ctx, 'rname', { x: rx + rw / 2 - 110, y: ir.y + ir.h + 40, w: 220, h: 38 }, '🎲 おまかせネーム', () => { setNameInputValue(RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]); focusNameInput(); return null; }, { color: '#c98a1a', size: 15 });
  // まとめ
  const sy = ry + 270;
  inset(ctx, rx + 120, sy, rw - 240, 120, { r: 14 });
  const C = classOf(c.cls);
  const rows = [['クラス', `${C.name}（${C.role || ''}）`], ['性別', c.gender === 'm' ? '♂ 男性' : '♀ 女性'], ['系統', (C.branches || []).map((b) => branchInfo(b)?.name).filter(Boolean).join(' / ') || '—'], ['開始地点', mapInfo('beach').name || 'ビーチ']];
  rows.forEach(([k, v2], i) => {
    txt(ctx, k, rx + 144, sy + 22 + i * 26, { size: 13, color: COL.sub, sw: 2.5 });
    txt(ctx, v2, rx + 250, sy + 22 + i * 26, { size: 14, color: i === 0 ? ccol(c.cls) : '#fff', sw: 3, maxW: rw - 400 });
  });
}

export function _titleState() { return T; } // テスト用
if (typeof window !== "undefined") window.__titleT = () => T;

// ---------- 背景: シンセウェーブ夕焼け ----------
function drawBackdrop(ctx, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a0b3d');
  sky.addColorStop(0.32, '#5a1a7a');
  sky.addColorStop(0.52, '#d63d8a');
  sky.addColorStop(0.64, '#ff8a3d');
  sky.addColorStop(0.66, '#3a0f5a');
  sky.addColorStop(1, '#0d0624');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // 星
  for (let i = 0; i < 70; i++) {
    const sx = (i * 197.3) % W, sy = (i * 73.7) % 220;
    const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + i));
    ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  // 太陽（ストライプ）
  const sunX = W / 2, sunY = 400, sr = 170;
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, sr, Math.PI, 0); ctx.closePath();
  ctx.clip();
  const sg = ctx.createLinearGradient(0, sunY - sr, 0, sunY);
  sg.addColorStop(0, '#fff3a0'); sg.addColorStop(0.5, '#ffb347'); sg.addColorStop(1, '#ff4f9a');
  ctx.fillStyle = sg;
  ctx.fillRect(sunX - sr, sunY - sr, sr * 2, sr);
  ctx.fillStyle = '#d63d8a';
  for (let i = 0; i < 7; i++) {
    const yy = sunY - 80 + i * 13 + ((t * 10) % 13);
    ctx.fillRect(sunX - sr, yy, sr * 2, 2 + i * 0.9);
  }
  ctx.restore();
  ctx.save();
  ctx.shadowColor = '#ff7ab8'; ctx.shadowBlur = 60;
  ctx.fillStyle = 'rgba(255,140,90,0.08)';
  ctx.beginPath(); ctx.arc(sunX, sunY, sr + 20, Math.PI, 0); ctx.fill();
  ctx.restore();
  // 遠景ビル群
  const hz = 432;
  ctx.fillStyle = '#2b0f4f';
  for (let i = 0; i < 40; i++) {
    const bw = 28 + (i * 37) % 40, bh = 40 + (i * 89) % 150;
    const bx = (i * 61) % (W + 60) - 30;
    ctx.fillRect(bx, hz - bh, bw, bh);
  }
  ctx.fillStyle = '#1c0838';
  for (let i = 0; i < 26; i++) {
    const bw = 40 + (i * 53) % 50, bh = 60 + (i * 131) % 200;
    const bx = (i * 97 + 20) % (W + 80) - 40;
    if (Math.abs(bx + bw / 2 - W / 2) < 120 && bh > 150) continue;
    ctx.fillRect(bx, hz - bh, bw, bh);
    // 窓
    for (let wy = hz - bh + 10; wy < hz - 8; wy += 14) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 10) {
        const on = ((wx * 7 + wy * 13 + i) % 5) === 0;
        if (on) { ctx.fillStyle = ((wx + wy) % 3) ? 'rgba(255,216,110,0.7)' : 'rgba(0,240,255,0.6)'; ctx.fillRect(wx, wy, 4, 5); ctx.fillStyle = '#1c0838'; }
      }
    }
  }
  // ネオン看板
  const signs = [[150, 300, COL.pink, 'MOTEL'], [1090, 280, COL.teal, 'CLUB'], [930, 340, '#ffd447', 'BAR']];
  for (const [sx, sy, c, s] of signs) {
    const on = Math.sin(t * 3 + sx) > -0.85;
    ctx.save();
    ctx.font = `900 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = c; ctx.shadowBlur = on ? 18 : 0;
    ctx.fillStyle = on ? c : rgba(c, 0.3);
    ctx.fillText(s, sx, sy);
    ctx.restore();
  }
  // グリッド床
  const fg = ctx.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, '#2a0b4d'); fg.addColorStop(1, '#0a0420');
  ctx.fillStyle = fg;
  ctx.fillRect(0, hz, W, H - hz);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,95,162,0.55)';
  ctx.shadowColor = COL.pink; ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  const off = (t * 40) % 40;
  for (let i = 0; i < 14; i++) {
    const k = (i * 40 + off) / 560;
    const yy = hz + Math.pow(k, 1.8) * (H - hz) * 1.6;
    if (yy > H) break;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(25,211,197,0.45)';
  ctx.shadowColor = COL.teal;
  for (let i = -16; i <= 16; i++) {
    ctx.beginPath(); ctx.moveTo(W / 2 + i * 18, hz); ctx.lineTo(W / 2 + i * 150, H); ctx.stroke();
  }
  ctx.restore();
  // 地平線グロー
  const hg = ctx.createLinearGradient(0, hz - 6, 0, hz + 10);
  hg.addColorStop(0, 'rgba(255,120,180,0)'); hg.addColorStop(0.5, 'rgba(255,170,200,0.9)'); hg.addColorStop(1, 'rgba(255,120,180,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, hz - 6, W, 16);
  // ヤシの木シルエット
  palm(ctx, 70, H - 30, 1.25, t);
  palm(ctx, 1200, H - 20, 1.4, t + 1);
  palm(ctx, 1120, H - 60, 0.9, t + 2);
}
function palm(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#0a0318';
  ctx.beginPath();
  ctx.moveTo(-8, 0); ctx.quadraticCurveTo(10, -150, 26, -300); ctx.lineTo(36, -298); ctx.quadraticCurveTo(22, -150, 10, 0);
  ctx.closePath(); ctx.fill();
  const sway = Math.sin(t * 1.2) * 0.06;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.5 + sway;
    ctx.save();
    ctx.translate(31, -300); ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(50, -40, 110, 10);
    ctx.quadraticCurveTo(50, -18, 0, 8);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---------- ロゴ ----------
function drawLogo(ctx, t, cy = 112, sc = 1) {
  const cx = W / 2;
  const wob = Math.sin(t * 1.6) * 0.012;
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 2) * 3);
  ctx.scale(sc, sc);
  ctx.rotate(wob - 0.03);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  const txtLogo = 'NEON VICE STORY';
  ctx.font = `italic 900 84px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 影（オフセット）
  ctx.fillStyle = 'rgba(25,211,197,0.85)';
  ctx.fillText(txtLogo, 6, 6);
  ctx.lineWidth = 14; ctx.strokeStyle = '#1a0630';
  ctx.strokeText(txtLogo, 0, 0);
  // グロー
  ctx.shadowColor = COL.pink; ctx.shadowBlur = 30 + Math.sin(t * 4) * 8;
  const g = ctx.createLinearGradient(0, -40, 0, 40);
  g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(0.6, '#ff5fa2'); g.addColorStop(1, '#7b2ff7');
  ctx.fillStyle = g;
  ctx.fillText(txtLogo, 0, 0);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(txtLogo, 0, 0);
  // ハイライトスイープ
  const sx = ((t * 260) % 1400) - 700;
  ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillText(txtLogo, 0, 0);
  ctx.restore();
  // サブタイトル
  ctx.save();
  const sw = 420;
  rrPath(ctx, cx - sw / 2, cy + 52 * sc + 6, sw, 34, 17);
  ctx.fillStyle = 'rgba(15,5,40,0.7)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = COL.teal; ctx.shadowColor = COL.teal; ctx.shadowBlur = 12; ctx.stroke();
  ctx.restore();
  txt(ctx, '〜 ネオン・ヴァイス・ストーリー 〜', cx, cy + 70 * sc + 6, { size: 18, align: 'center', color: '#e8fffd', glow: COL.teal });
}

