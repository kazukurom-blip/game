// HUD（メイプルストーリー風の常駐 UI）
//   画面最下部の EXP バー / 下中央のステータス（Lv・職・名前・HP・MP） / 右下のクイックスロット（2段×8）
//   右下のメニューボタン列 / 左下の取得ログ（チャット欄のお知らせ風） / 左上のミニマップ / マップに入った時の地名
//   コンボ表示（中央やや右下） / マウスカーソル（白い手袋）
// 色はネオンの世界観（ピンク・紫・シアン）のまま、配置・形・文言の形式をメイプルに合わせる。
import { COL, FONT, rrPath, rgba, clamp, ease, measure, RAINBOW } from './theme.js';
import {
  guard, stats, expNeed, HERO_NAMES, skillDef, getItemDef, cooldown, skillMp, countItem,
  drawSkillIco, drawItemIco, mapInfo, regionColor, allMaps, regionOfMap,
} from './deps.js';
import { charName, currentJob, BAR_KEYS, SKILL_BAR_SIZE } from './v3deps.js';
import { audio } from '../audio/audio.js';

const W = 1280, H = 720;

// ================================================================ 共通
/** メイプル風の小さな文字（太い縁取りではなく 1px の影）。数字は詰まった英字フォント */
const NUM_FONT = "'Arial', 'Helvetica Neue', sans-serif";
export function mtxt(ctx, s, x, y, o = {}) {
  s = String(s ?? '');
  ctx.save();
  ctx.font = `${o.weight ?? 700} ${o.size ?? 12}px ${o.num ? NUM_FONT : FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'middle';
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.maxW) {
    const w = ctx.measureText(s).width;
    if (w > o.maxW) ctx.font = `${o.weight ?? 700} ${Math.max(8, Math.floor((o.size ?? 12) * o.maxW / w))}px ${o.num ? NUM_FONT : FONT}`;
  }
  // 影（右下 1px）＋薄い縁
  if (o.outline !== false) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.ow ?? 2.4;
    ctx.strokeStyle = o.shadow || 'rgba(0,0,0,0.8)';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.shadow || 'rgba(0,0,0,0.85)';
  ctx.fillText(s, x + 1, y + 1);
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur ?? 8; }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(s, x, y);
  ctx.restore();
}
/** 1,234 形式 */
export const comma = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US');
/** EXP の割合（小数 2 桁・切り捨て。メイプルと同じく 100.00% にはならない） */
export function expPct(exp, need) {
  const r = clamp((exp || 0) / Math.max(1, need || 1), 0, 0.99999);
  return (Math.floor(r * 10000) / 100).toFixed(2);
}
function mouseIn(game, r) {
  const ui = game.ui, m = game.input?.mouse;
  if (!ui || !m || ui.drag || ui.dnd?.active) return false;
  return m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h && !ui.winAt?.(m.x, m.y);
}
function isTouch() {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
}
/** 小さなツールチップ（メイプル風: 黒い半透明の箱＋白文字） */
function smallTip(ctx, x, y, lines, o = {}) {
  const pad = 7, lh = 16;
  let w = 0;
  for (const l of lines) w = Math.max(w, measure(ctx, l.t, l.size || 12, 700));
  w += pad * 2;
  const h = lines.length * lh + pad * 2 - 2;
  let tx = clamp(x - w / 2, 4, W - w - 4), ty = o.below ? y + 6 : y - h - 6;
  ty = clamp(ty, 4, H - h - 4);
  ctx.save();
  rrPath(ctx, tx, ty, w, h, 4);
  ctx.fillStyle = 'rgba(8,4,24,0.9)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = o.border || 'rgba(255,255,255,0.55)'; ctx.stroke();
  ctx.restore();
  lines.forEach((l, i) => mtxt(ctx, l.t, tx + pad, ty + pad + lh / 2 - 1 + i * lh, { size: l.size || 12, color: l.c || '#fff' }));
}

// ================================================================ レイアウト
// 画面下: EXP バー（y=708〜720）の上にステータス（中央）・クイックスロット（右）・取得ログ（左）
export const EXP_H = 12;
export const EXP_Y = H - EXP_H;
export const QS = 34, QS_GAP = 2, QS_COLS = 8;
export const STATUS = { x: 452, y: 642, w: 376, h: 62 };
const QS_W = QS * QS_COLS + QS_GAP * (QS_COLS - 1);
const QS_H = QS * 2 + QS_GAP;
// タッチ端末では #touch のボタン（右下の攻撃ボタン群・左下の十字キー）を避ける
const layout = { qx: W - 6 - QS_W, qy: EXP_Y - 4 - QS_H, logBottom: EXP_Y - 6, buffTop: 12, touch: false, t: -9, ver: 0 };
function updateLayout(game) {
  const now = game?.time || 0;
  if (Math.abs(now - layout.t) < 1) return;
  layout.t = now;
  let qy = EXP_Y - 4 - QS_H, logBottom = EXP_Y - 6, buffTop = 12;
  const touch = isTouch();
  if (touch) guard('hud.touchLayout', () => {
    const cv = game.canvas || document.getElementById('game');
    const acts = document.querySelector('#touch .acts'), pad = document.querySelector('#touch .pad');
    const cr = cv?.getBoundingClientRect?.();
    if (!cr || !cr.width) return;
    const toY = (py) => (py - cr.top) * H / cr.height;
    const toX = (px) => (px - cr.left) * W / cr.width;
    const ar = acts?.getBoundingClientRect?.();
    if (ar && ar.width && toX(ar.left) < W - 6 && toY(ar.top) < EXP_Y) qy = Math.max(200, Math.min(qy, toY(ar.top) - 6 - QS_H));
    const pr = pad?.getBoundingClientRect?.();
    if (pr && pr.width && toX(pr.right) > 0 && toY(pr.top) < EXP_Y) logBottom = Math.max(240, Math.min(logBottom, toY(pr.top) - 6));
    // 右上の #touch .menu の下にバフの列を下げる
    const mr = document.querySelector('#touch .menu')?.getBoundingClientRect?.();
    if (mr && mr.width && toY(mr.bottom) > 0) buffTop = Math.min(200, Math.max(12, Math.round(toY(mr.bottom) + 6)));
  });
  if (qy !== layout.qy || touch !== layout.touch) { layout.qy = Math.round(qy); layout.ver++; }
  layout.logBottom = logBottom; layout.buffTop = buffTop; layout.touch = touch;
}
export function hudLayout() { return layout; }

// クイックスロットの枠（上段: スキル A S D F Q W G H / 下段: 1 2 の消耗品＋操作キー）
// UI のドラッグ&ドロップ・右クリック解除で使う（kind: 'skill' | 'potion' のみ）
let _slots = null, _slotsVer = -1;
export function quickSlots() {
  if (_slots && _slotsVer === layout.ver) return _slots;
  const n = SKILL_BAR_SIZE || 8;
  const out = [];
  for (let i = 0; i < Math.min(n, QS_COLS); i++) {
    out.push({ kind: 'skill', i, x: layout.qx + i * (QS + QS_GAP), y: layout.qy, w: QS, h: QS, key: BAR_KEYS[i] || String(i + 1) });
  }
  for (let i = 0; i < 2; i++) {
    out.push({ kind: 'potion', i, x: layout.qx + i * (QS + QS_GAP), y: layout.qy + QS + QS_GAP, w: QS, h: QS, key: String(i + 1) });
  }
  _slots = out; _slotsVer = layout.ver;
  return out;
}
// 下段の残り 6 枠: 決まっている操作キー（表示のみ。キーの割り当ては変えない）
const ACTION_SLOTS = [
  { key: 'X', name: '通常攻撃', ico: 'attack' },
  { key: 'C', name: 'ジャンプ', ico: 'jump' },
  { key: 'Z', name: 'アイテムを拾う', ico: 'pickup' },
  { key: 'V', name: 'NPC と話す', ico: 'talk' },
  { key: '↑', name: 'ポータルに入る', ico: 'portal' },
  { key: 'N', name: '音の ON/OFF', ico: 'sound' },
];

// ================================================================ 状態
const S = new WeakMap();
function st0(game) {
  let s = S.get(game);
  if (!s || s.stateRef !== game.state) {
    const st = game.state || {};
    s = {
      stateRef: game.state,
      expShown: null, expFlash: 0, prevLv: st.level || 1, prevExp: st.exp || 0,
      money: st.money ?? 0, moneyAcc: 0,
      hpGhost: null, hpHold: 0, hpPrev: null,
      log: [], logShift: 0, seenToast: new WeakMap(),
      cdPrev: {}, readyFx: {},
      mapId: null, mapTitle: null,
      combo: { shown: 0, bump: 9, fade: 0, last: 0 },
      hookedEvents: null,
    };
    S.set(game, s);
  }
  // 取得イベントの購読（game.events は main が1つだけ作る）
  const ev = game.events;
  if (ev?.on && s.hookedEvents !== ev) {
    s.hookedEvents = ev;
    ev.on('moneyPicked', (d) => {
      const n = Math.round(d?.amount || 0);
      if (!(n > 0)) return;
      const ss = S.get(game);
      if (!ss) return;
      ss.moneyAcc += n;
      pushLog(ss, `ドルを ${comma(n)} 獲得しました。`, '#ffe14d', 'money');
    });
    ev.on('itemPicked', (d) => {
      const ss = S.get(game);
      const it = getItemDef(d?.id);
      if (!ss || !it) return;
      const q = d?.qty > 1 ? ` ×${comma(d.qty)}` : '';
      pushLog(ss, `アイテムを獲得しました（${it.name}${q}）`, '#ffffff', 'item');
    });
  }
  return s;
}

// ================================================================ 取得ログ（左下・チャット欄のお知らせ風）
const LOG_LIFE = 7, LOG_MAX = 8, LOG_LH = 17;
function pushLog(s, text, color, kind = 'sys') {
  s.log.push({ text, color, kind, t: 0 });
  while (s.log.length > 40) s.log.shift();
  s.logShift = Math.min(LOG_LH * 2, s.logShift + LOG_LH); // 下から上へ流す
}
/** テスト用: 今出ているログの文 */
export function hudLogLines(game) { return (S.get(game)?.log || []).filter((l) => l.t < LOG_LIFE).map((l) => l.text); }

function trackGains(game, s) {
  const st = game.state;
  // 経験値（gainExp はイベントを出さないので差分で拾う。レベルアップをまたいだ分も足す）
  const lv = st.level || 1, ex = st.exp || 0;
  if (lv !== s.prevLv || ex !== s.prevExp) {
    let gained = 0;
    if (lv === s.prevLv) gained = ex - s.prevExp;
    else if (lv > s.prevLv && lv - s.prevLv <= 5) {
      gained = expNeed(s.prevLv) - s.prevExp;
      for (let l = s.prevLv + 1; l < lv; l++) gained += expNeed(l);
      gained += ex;
    }
    if (gained > 0 && Number.isFinite(gained)) {
      pushLog(s, `経験値を獲得しました（+${comma(gained)}）`, '#c6ff4a', 'exp');
      s.expFlash = 1;
    }
    if (lv !== s.prevLv) s.expShown = 0; // レベルが変わったら左端から伸ばし直す
    s.prevLv = lv; s.prevExp = ex;
  }
  // お金（拾った分は moneyPicked で出し済み。クエスト報酬などそれ以外の増加だけ出す）
  const money = st.money ?? 0;
  if (money !== s.money) {
    const d = money - s.money - s.moneyAcc;
    if (d > 0) pushLog(s, `ドルを ${comma(d)} 獲得しました。`, '#ffe14d', 'money');
    s.money = money;
  }
  s.moneyAcc = 0;
  // システムの通知（ui.notify のトースト）もログに流す
  for (const t of game.ui?.toasts || []) {
    const seen = s.seenToast.get(t) || 0;
    const c = t.count || 1;
    if (c > seen) {
      s.seenToast.set(t, c);
      pushLog(s, t.text, t.color || COL.teal, 'sys');
    }
  }
}

function drawLog(ctx, game, s, dt) {
  for (const l of s.log) l.t += dt;
  s.log = s.log.filter((l) => l.t < LOG_LIFE);
  s.logShift = Math.max(0, s.logShift - dt * LOG_LH * 9);
  const list = s.log.slice(-LOG_MAX);
  if (!list.length) return;
  const x = 8;
  let y = layout.logBottom - LOG_LH / 2 + s.logShift;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, 460, layout.logBottom + 1); ctx.clip(); // 下から流れてくる行が EXP バーにかからないように
  for (let i = list.length - 1; i >= 0; i--) {
    const l = list[i];
    const fadeIn = clamp(l.t / 0.15, 0, 1), fadeOut = 1 - clamp((l.t - LOG_LIFE + 1) / 1, 0, 1);
    // 上のほうの古い行ほど少し薄く
    const a = fadeIn * fadeOut * (1 - (list.length - 1 - i) * 0.04);
    if (a > 0 && y > 210) {
      const tw = Math.min(440, measure(ctx, l.text, 12, 700));
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 3, y - LOG_LH / 2, tw + 8, LOG_LH);
      ctx.restore();
      mtxt(ctx, l.text, x + 1, y + 0.5, { size: 12, color: l.color, alpha: a, maxW: 440, ow: 2 });
    }
    y -= LOG_LH;
  }
  ctx.restore();
}

// ================================================================ EXP バー（画面最下部・横いっぱい）
function drawExpBar(ctx, game, s, dt) {
  const st = game.state;
  const need = Math.max(1, expNeed(st.level || 1));
  const target = clamp((st.exp || 0) / need, 0, 1);
  if (s.expShown == null || s.expShown > target + 1e-6) s.expShown = s.expShown == null ? target : Math.min(s.expShown, target);
  s.expShown += (target - s.expShown) * Math.min(1, dt * 5);
  if (Math.abs(target - s.expShown) < 0.0005) s.expShown = target;
  s.expFlash = Math.max(0, s.expFlash - dt * 1.6);
  const y = EXP_Y, h = EXP_H, r = s.expShown;
  ctx.save();
  // 地（半透明の黒の帯）
  ctx.fillStyle = 'rgba(6,3,18,0.82)';
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, y, W, 1);
  // 中身（黄緑→黄）
  if (r > 0) {
    const fw = W * r;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#b8f02c'); g.addColorStop(0.55, '#e4f53a'); g.addColorStop(1, '#ffe14d');
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 2, fw, h - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, y + 2, fw, 2);
    ctx.fillStyle = 'rgba(60,90,0,0.35)';
    ctx.fillRect(0, y + h - 3, fw, 2);
    // 増えた瞬間に光る
    if (s.expFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = s.expFlash;
      ctx.fillStyle = 'rgba(255,255,200,0.55)';
      ctx.fillRect(0, y + 1, fw, h - 1);
      const eg = ctx.createRadialGradient(fw, y + h / 2, 1, fw, y + h / 2, 36);
      eg.addColorStop(0, 'rgba(255,255,255,0.95)'); eg.addColorStop(1, 'rgba(255,255,160,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(fw - 40, y - 14, 80, h + 14);
      ctx.restore();
    }
  }
  // 10% ごとの区切り
  for (let k = 1; k < 10; k++) {
    const xx = Math.round(W * k / 10);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(xx - 1, y + 1, 1, h - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(xx, y + 1, 1, h - 1);
  }
  ctx.restore();
  const label = (st.level || 1) >= 999 ? 'EXP MAX' : `EXP ${comma(st.exp || 0)} / ${comma(need)} [${expPct(st.exp, need)}%]`;
  mtxt(ctx, label, W / 2, y + h / 2 + 0.5, { size: 10.5, align: 'center', num: true, weight: 700, ow: 2.2 });
}

// ================================================================ ステータス（下中央: Lv・職・名前・HP・MP）
function gauge(ctx, x, y, w, h, ratio, top, mid, bot, o = {}) {
  ctx.save();
  rrPath(ctx, x, y, w, h, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill();
  if (o.ghost != null && o.ghost > ratio) {
    rrPath(ctx, x + 1, y + 1, Math.max(0, (w - 2) * o.ghost), h - 2, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  if (ratio > 0) {
    const fw = Math.max(2, (w - 2) * ratio);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(0.45, mid); g.addColorStop(1, bot);
    rrPath(ctx, x + 1, y + 1, fw, h - 2, 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(x + 2, y + 2, Math.max(0, fw - 2), 2);
    if (o.blink > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = o.blink;
      rrPath(ctx, x + 1, y + 1, fw, h - 2, 2);
      ctx.fillStyle = '#ff5060'; ctx.fill();
      ctx.restore();
    }
  }
  rrPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
  ctx.lineWidth = 1; ctx.strokeStyle = o.border || 'rgba(255,255,255,0.35)'; ctx.stroke();
  ctx.restore();
}
function drawStatusBar(ctx, game, s, dt) {
  const st = game.state, cs = stats(game);
  const { x, y, w, h } = STATUS;
  const t = game.time || 0;
  const maxHp = Math.max(1, cs.maxHp || 1), maxMp = Math.max(1, cs.maxMp || 1);
  const hp = clamp(st.hp ?? maxHp, 0, maxHp), mp = clamp(st.mp ?? maxMp, 0, maxMp);
  const hr = hp / maxHp, mr = mp / maxMp;
  const low = hr <= 0.2 && hp > 0;
  const blink = low ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
  // HP の白い残像: 減った瞬間は残り、少し待ってから縮む
  if (s.hpGhost == null) s.hpGhost = hr;
  if (s.hpPrev != null && hr < s.hpPrev - 1e-6) s.hpHold = 0.45;
  s.hpPrev = hr;
  if (hr >= s.hpGhost) s.hpGhost = hr;
  else if (s.hpHold > 0) s.hpHold -= dt;
  else s.hpGhost = Math.max(hr, s.hpGhost - dt * 0.9);
  // 地（半透明の黒＋ネオンの細い縁）
  ctx.save();
  rrPath(ctx, x, y, w, h, 7);
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, 'rgba(34,20,72,0.86)'); bg.addColorStop(1, 'rgba(8,4,24,0.88)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 1.5;
  const bd = ctx.createLinearGradient(x, 0, x + w, 0);
  bd.addColorStop(0, low ? rgba('#ff3048', 0.5 + 0.5 * blink) : 'rgba(255,95,162,0.9)');
  bd.addColorStop(1, low ? rgba('#ff3048', 0.5 + 0.5 * blink) : 'rgba(25,211,197,0.9)');
  ctx.strokeStyle = bd; ctx.stroke();
  rrPath(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 5);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
  ctx.restore();
  // 上段: Lv. 30（金・大きめ） / 職業名 / キャラ名
  const ty = y + 13;
  ctx.save();
  ctx.font = `900 11px ${NUM_FONT}`; ctx.textBaseline = 'alphabetic';
  const lvTxt = String(st.level ?? 1);
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#2a1400';
  ctx.strokeText('Lv.', x + 9, ty + 5);
  ctx.fillStyle = '#ffe9a0'; ctx.fillText('Lv.', x + 9, ty + 5);
  ctx.font = `900 19px ${NUM_FONT}`;
  const lg = ctx.createLinearGradient(0, ty - 10, 0, ty + 6);
  lg.addColorStop(0, '#fff6c0'); lg.addColorStop(0.5, '#ffd447'); lg.addColorStop(1, '#e08a10');
  ctx.lineWidth = 4; ctx.strokeText(lvTxt, x + 28, ty + 7);
  ctx.fillStyle = lg; ctx.fillText(lvTxt, x + 28, ty + 7);
  const lvW = ctx.measureText(lvTxt).width;
  ctx.restore();
  const job = currentJob(st);
  const jt = job?.title || job?.name || '';
  let nx = x + 28 + lvW + 10;
  if (jt) {
    mtxt(ctx, jt, nx, ty + 1, { size: 11.5, color: '#bfe9ff', maxW: 110 });
    nx += Math.min(110, measure(ctx, jt, 11.5, 700)) + 9;
  }
  const name = charName(st) || HERO_NAMES[st.heroId] || 'HERO';
  mtxt(ctx, name, nx, ty + 1, { size: 12.5, color: '#fff', maxW: x + w - nx - 8 });
  // HP / MP ゲージ
  const gx = x + 30, gw = w - 30 - 8, gh = 15;
  const rows = [
    ['HP', y + 26, hr, `${comma(Math.ceil(hp))} / ${comma(maxHp)}`, ['#ff9aa4', '#ff2e4a', '#b3122e'], s.hpGhost, blink * 0.6],
    ['MP', y + 26 + gh + 3, mr, `${comma(Math.floor(mp))} / ${comma(maxMp)}`, ['#9fd0ff', '#2f7bff', '#1a3fae'], null, 0],
  ];
  for (const [lab, yy, ratio, val, c, ghost, bl] of rows) {
    mtxt(ctx, lab, x + 9, yy + gh / 2 + 0.5, { size: 11, num: true, weight: 900, color: lab === 'HP' ? (low ? (blink > 0.5 ? '#fff' : '#ff6070') : '#ff8a96') : '#8cc4ff' });
    gauge(ctx, gx, yy, gw, gh, ratio, c[0], c[1], c[2], { ghost, blink: bl, border: lab === 'HP' && low ? rgba('#ff4050', 0.6 + 0.4 * blink) : null });
    mtxt(ctx, val, gx + gw / 2, yy + gh / 2 + 0.5, { size: 11, align: 'center', num: true, weight: 700, ow: 2.2 });
  }
}

// ================================================================ クイックスロット（右下・2段×8）
function slotBox(ctx, x, y, hov) {
  ctx.save();
  rrPath(ctx, x, y, QS, QS, 3);
  const g = ctx.createLinearGradient(0, y, 0, y + QS);
  g.addColorStop(0, 'rgba(36,24,70,0.85)'); g.addColorStop(1, 'rgba(12,7,30,0.9)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = hov ? '#ffffff' : 'rgba(170,150,255,0.45)'; ctx.stroke();
  ctx.restore();
}
function keyLabel(ctx, x, y, key) {
  mtxt(ctx, key, x + 3, y + 7, { size: 10, num: true, weight: 900, color: '#fff', ow: 2.4 });
}
function drawActionIco(ctx, ico, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4.5;
  const col = '#d8d2ff';
  const both = (fn) => { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4.5; fn(); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2; fn(); ctx.stroke(); };
  if (ico === 'attack') both(() => { ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(7, -7); ctx.moveTo(-8, 2); ctx.lineTo(-2, 8); ctx.moveTo(3, -7); ctx.lineTo(7, -7); ctx.lineTo(7, -3); });
  else if (ico === 'jump') both(() => { ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -7); ctx.moveTo(-6, -1); ctx.lineTo(0, -7); ctx.lineTo(6, -1); ctx.moveTo(-7, 9); ctx.lineTo(7, 9); });
  else if (ico === 'pickup') both(() => { ctx.beginPath(); ctx.rect(-6, -2, 12, 10); ctx.moveTo(-3, -2); ctx.quadraticCurveTo(0, -9, 3, -2); });
  else if (ico === 'talk') both(() => { ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(8, 3); ctx.lineTo(0, 3); ctx.lineTo(-4, 8); ctx.lineTo(-4, 3); ctx.lineTo(-8, 3); ctx.closePath(); });
  else if (ico === 'portal') both(() => { ctx.beginPath(); ctx.ellipse(0, 1, 6, 8, 0, 0, Math.PI * 2); ctx.moveTo(0, -3); ctx.lineTo(0, -12); });
  else if (ico === 'sound') both(() => { ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-4, -3); ctx.lineTo(1, -8); ctx.lineTo(1, 8); ctx.lineTo(-4, 3); ctx.lineTo(-8, 3); ctx.closePath(); ctx.moveTo(5, -4); ctx.quadraticCurveTo(8, 0, 5, 4); });
  ctx.restore();
}
function drawQuickSlots(ctx, game, s, dt) {
  const st = game.state;
  const t = game.time || 0;
  const slots = quickSlots();
  // 背板
  ctx.save();
  rrPath(ctx, layout.qx - 4, layout.qy - 4, QS_W + 8, QS_H + 8, 5);
  ctx.fillStyle = 'rgba(6,3,18,0.55)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,95,162,0.55)'; ctx.stroke();
  ctx.restore();
  let tip = null;
  for (const sl of slots) {
    const hov = mouseIn(game, sl);
    slotBox(ctx, sl.x, sl.y, hov);
    const cx = sl.x + QS / 2, cy = sl.y + QS / 2;
    if (sl.kind === 'skill') {
      const id = st.skillBar?.[sl.i];
      const sk = skillDef(id);
      if (sk) {
        const lv = st.skills?.[id] || 0;
        drawSkillIco(ctx, sk, cx, cy, QS - 4);
        const needMp = skillMp(sk, lv);
        const cd = cooldown(id);
        const cdOn = cd && cd.left > 0 && cd.total > 0;
        // 使えるようになった瞬間に白く光る
        const prev = s.cdPrev[id] || 0;
        if (prev > 0 && !cdOn) s.readyFx[id] = 0.45;
        s.cdPrev[id] = cdOn ? cd.left : 0;
        if (lv <= 0) {
          rrPath(ctx, sl.x, sl.y, QS, QS, 3);
          ctx.fillStyle = 'rgba(20,20,30,0.7)'; ctx.fill();
        } else if ((st.mp ?? 0) < needMp) {
          // MP が足りない: 赤く暗く
          rrPath(ctx, sl.x, sl.y, QS, QS, 3);
          ctx.fillStyle = 'rgba(110,0,18,0.6)'; ctx.fill();
          ctx.save(); ctx.globalCompositeOperation = 'source-atop';
          rrPath(ctx, sl.x, sl.y, QS, QS, 3);
          ctx.fillStyle = 'rgba(255,40,60,0.26)'; ctx.fill();
          ctx.restore();
        }
        if (cdOn) {
          const r = clamp(cd.left / cd.total, 0, 1);
          ctx.save();
          rrPath(ctx, sl.x, sl.y, QS, QS, 3); ctx.clip();
          // 残りの分を暗くする（時計回りに明るさが戻る扇形）
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, QS, -Math.PI / 2 + Math.PI * 2 * (1 - r), Math.PI * 1.5, false);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fill();
          ctx.restore();
          const sec = cd.left >= 1 ? String(Math.floor(cd.left)) : (Math.floor(cd.left * 10) / 10).toFixed(1);
          mtxt(ctx, sec, cx, cy + 1, { size: cd.left >= 1 ? 15 : 13, align: 'center', num: true, weight: 900, ow: 3 });
        }
        const fx = s.readyFx[id];
        if (fx > 0) {
          s.readyFx[id] = fx - dt;
          const a = clamp(fx / 0.45, 0, 1);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          rrPath(ctx, sl.x, sl.y, QS, QS, 3);
          ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`; ctx.fill();
          ctx.shadowColor = '#fff'; ctx.shadowBlur = 12 * a;
          ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.stroke();
          ctx.restore();
        }
        if (hov) tip = { x: cx, y: sl.y, lines: [{ t: sk.name, c: sk.color || '#fff', size: 13 }, { t: `Lv.${lv}  MP ${comma(needMp)}`, c: (st.mp ?? 0) < needMp ? COL.bad : COL.sub, size: 11 }] };
      }
    } else {
      const id = st.potionBar?.[sl.i];
      const it = getItemDef(id);
      if (it) {
        const n = countItem(st, id);
        drawItemIco(ctx, it, cx, cy, QS - 6);
        if (n <= 0) { rrPath(ctx, sl.x, sl.y, QS, QS, 3); ctx.fillStyle = 'rgba(20,20,30,0.65)'; ctx.fill(); }
        mtxt(ctx, comma(n), sl.x + QS - 2, sl.y + QS - 6, { size: 10.5, align: 'right', num: true, weight: 900, color: n > 0 ? '#fff' : '#ff8a8a', ow: 2.4 });
        if (hov) tip = { x: cx, y: sl.y, lines: [{ t: it.name, c: '#fff', size: 13 }, { t: `所持 ${comma(n)}`, c: COL.sub, size: 11 }] };
      }
    }
    keyLabel(ctx, sl.x, sl.y, sl.key);
  }
  // 下段の操作キー
  ACTION_SLOTS.forEach((a, i) => {
    const x = layout.qx + (i + 2) * (QS + QS_GAP), y = layout.qy + QS + QS_GAP;
    const r = { x, y, w: QS, h: QS };
    const hov = mouseIn(game, r);
    slotBox(ctx, x, y, hov);
    ctx.save();
    if (a.ico === 'sound' && guard('muted', () => !!audio?.muted, false)) ctx.globalAlpha = 0.45;
    drawActionIco(ctx, a.ico, x + QS / 2, y + QS / 2 + 2);
    ctx.restore();
    keyLabel(ctx, x, y, a.key);
    if (hov) tip = { x: x + QS / 2, y, lines: [{ t: a.name, c: '#fff', size: 12 }] };
  });
  if (tip) smallTip(ctx, tip.x, tip.y, tip.lines);
  void t;
}

// ================================================================ メニューのボタン列（クイックスロットの上）
const MENU = [
  { win: 'inventory', name: '持ち物', key: 'I', ico: 'bag' },
  { win: 'skills', name: 'スキル', key: 'K', ico: 'skill' },
  { win: 'stats', name: '能力', key: 'T', ico: 'stat' },
  { win: 'missions', name: '任務', key: 'J', ico: 'quest' },
  { win: 'worldmap', name: '地図', key: 'M', ico: 'map' },
  { win: 'book', name: '図鑑', key: 'B', ico: 'book' },
  { win: 'phone', name: 'スマホ', key: 'P', ico: 'phone' },
  { win: 'settings', name: '設定', key: null, ico: 'gear' },
];
const MB_W = 30, MB_H = 24, MB_GAP = 3;
export function menuButtons() {
  const total = MENU.length * MB_W + (MENU.length - 1) * MB_GAP;
  const x0 = layout.qx + QS_W - total, y = layout.qy - 4 - 6 - MB_H;
  return MENU.map((m, i) => ({ ...m, x: x0 + i * (MB_W + MB_GAP), y, w: MB_W, h: MB_H }));
}
function drawMenuIco(ctx, ico, cx, cy, col) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    if (ico === 'bag') { rrPath(ctx, -7, -3, 14, 10, 2); ctx.moveTo(-3, -3); ctx.quadraticCurveTo(-3, -8, 0, -8); ctx.quadraticCurveTo(3, -8, 3, -3); ctx.moveTo(-7, 1); ctx.lineTo(7, 1); }
    else if (ico === 'skill') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.2 : 7.5; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
    else if (ico === 'stat') { ctx.arc(0, -4, 3.2, 0, Math.PI * 2); ctx.moveTo(-6, 7); ctx.quadraticCurveTo(-6, 0, 0, 0); ctx.quadraticCurveTo(6, 0, 6, 7); }
    else if (ico === 'quest') { rrPath(ctx, -6, -7, 12, 14, 2); ctx.moveTo(0, -4); ctx.lineTo(0, 1); ctx.moveTo(0, 4); ctx.lineTo(0, 4.2); }
    else if (ico === 'map') { ctx.moveTo(-7, -5); ctx.lineTo(-2, -7); ctx.lineTo(2, -5); ctx.lineTo(7, -7); ctx.lineTo(7, 5); ctx.lineTo(2, 7); ctx.lineTo(-2, 5); ctx.lineTo(-7, 7); ctx.closePath(); ctx.moveTo(-2, -7); ctx.lineTo(-2, 5); ctx.moveTo(2, -5); ctx.lineTo(2, 7); }
    else if (ico === 'book') { ctx.moveTo(0, -5); ctx.quadraticCurveTo(-4, -7, -7, -6); ctx.lineTo(-7, 6); ctx.quadraticCurveTo(-4, 5, 0, 7); ctx.quadraticCurveTo(4, 5, 7, 6); ctx.lineTo(7, -6); ctx.quadraticCurveTo(4, -7, 0, -5); ctx.lineTo(0, 7); }
    else if (ico === 'phone') { rrPath(ctx, -4.5, -8, 9, 16, 2); ctx.moveTo(-1.5, 5); ctx.lineTo(1.5, 5); }
    else if (ico === 'gear') { for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 5.2 : 7.5; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.moveTo(2.2, 0); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); }
  };
  path(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.stroke();
  path(); ctx.lineWidth = 1.8; ctx.strokeStyle = col; ctx.stroke();
  ctx.restore();
}
function drawMenuBar(ctx, game) {
  if (layout.touch) return; // タッチ端末は #touch のメニューボタンを使う
  const ui = game.ui;
  const btns = menuButtons();
  let tip = null;
  for (const b of btns) {
    const hov = mouseIn(game, b);
    const open = !!ui?.isOpen?.(b.win);
    ctx.save();
    rrPath(ctx, b.x, b.y, b.w, b.h, 4);
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    if (hov) { g.addColorStop(0, 'rgba(255,140,200,0.95)'); g.addColorStop(1, 'rgba(123,47,247,0.95)'); }
    else if (open) { g.addColorStop(0, 'rgba(25,211,197,0.8)'); g.addColorStop(1, 'rgba(30,60,120,0.85)'); }
    else { g.addColorStop(0, 'rgba(60,40,120,0.85)'); g.addColorStop(1, 'rgba(18,10,44,0.88)'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 3);
    ctx.restore();
    drawMenuIco(ctx, b.ico, b.x + b.w / 2, b.y + b.h / 2, hov || open ? '#ffffff' : '#e6e0ff');
    if (hov) tip = b;
    ui?.hudHit?.('menu:' + b.win, b, { onClick: () => { if (!ui.isModal?.()) ui.toggle(b.win); } });
  }
  if (tip) smallTip(ctx, tip.x + tip.w / 2, tip.y, [{ t: tip.key ? `${tip.name} (${tip.key})` : tip.name, size: 12 }]);
}

// ================================================================ ミニマップ（左上）
const MM_SIZES = [0, 230, 330]; // 0 = たたむ（上の帯だけ）
let mmSize = 1;
try { const v = Number(globalThis.localStorage?.getItem('nvs_minimap')); if (v >= 0 && v <= 2 && globalThis.localStorage.getItem('nvs_minimap') != null) mmSize = v; } catch { /* ignore */ }
function setMmSize(v) {
  mmSize = clamp(v, 0, 2);
  try { globalThis.localStorage?.setItem('nvs_minimap', String(mmSize)); } catch { /* ignore */ }
}
// 縮小図に描く範囲（空の部分は省いて、足場のある高さだけ）
const _bounds = new WeakMap();
function mapBounds(map) {
  let b = _bounds.get(map);
  if (b) return b;
  const mh = map.height || 1200;
  let top = map.groundY ?? mh, bot = map.groundY ?? mh;
  for (const pf of map.platforms || []) { top = Math.min(top, pf.y); bot = Math.max(bot, pf.y); }
  for (const r of map.ropes || []) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); }
  for (const po of map.portals || []) top = Math.min(top, (po.y ?? bot) - 40);
  top = clamp(top - 70, 0, mh); bot = clamp(bot + 40, top + 100, mh);
  b = { top, bot, w: map.width || 2000 };
  _bounds.set(map, b);
  return b;
}
export function minimapRect(game) {
  const map = game?.map;
  const iw = MM_SIZES[mmSize] || 0;
  const w = Math.max(200, iw + 12);
  if (!mmSize || !map) return { x: 8, y: 8, w, h: 22, iw: 0, ih: 0 };
  const b = mapBounds(map);
  const sc = iw / b.w;
  const ih = clamp(Math.round((b.bot - b.top) * sc), 40, mmSize === 2 ? 180 : 130);
  return { x: 8, y: 8, w, h: 22 + ih + 10, iw, ih, sc: Math.min(sc, ih / (b.bot - b.top)), top: b.top };
}
function regionGlyph(ctx, region, cx, cy) {
  // 地域のアイコン（丸い紋章）
  const col = regionColor(region);
  ctx.save();
  const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 8);
  g.addColorStop(0, '#fff'); g.addColorStop(0.4, col); g.addColorStop(1, rgba(col, 0.6));
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.strokeStyle = 'rgba(20,6,40,0.85)'; ctx.fillStyle = 'rgba(20,6,40,0.85)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath();
  if (region === 'beach') { ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy - 2); ctx.moveTo(cx - 4, cy - 1); ctx.quadraticCurveTo(cx, cy - 5, cx + 4, cy - 1); ctx.stroke(); }
  else if (region === 'downtown') { ctx.rect(cx - 4, cy - 2, 3, 6); ctx.rect(cx, cy - 5, 4, 9); ctx.fill(); }
  else if (region === 'slums') { ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx - 4, cy + 4); ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx - 4, cy + 1); ctx.stroke(); }
  else if (region === 'swamp') { ctx.moveTo(cx - 4, cy + 3); ctx.quadraticCurveTo(cx - 2, cy - 5, cx, cy + 3); ctx.quadraticCurveTo(cx + 2, cy - 5, cx + 4, cy + 3); ctx.stroke(); }
  else if (region === 'casino') { ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 4, cy); ctx.closePath(); ctx.fill(); }
  else if (region === 'rooftop') { ctx.moveTo(cx - 3, cy + 5); ctx.lineTo(cx - 1, cy - 5); ctx.lineTo(cx + 1, cy - 5); ctx.lineTo(cx + 3, cy + 5); ctx.closePath(); ctx.fill(); }
  else { ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx, cy, 5, 2, -0.4, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function drawMinimap(ctx, game) {
  const map = game.map;
  const R = minimapRect(game);
  const { x, y, w, h } = R;
  const ui = game.ui;
  // 枠（本体は半透明の黒）
  ctx.save();
  rrPath(ctx, x, y, w, h, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
  // 上の帯
  ctx.save();
  rrPath(ctx, x, y, w, 22, 5); ctx.clip();
  const hg = ctx.createLinearGradient(0, y, 0, y + 22);
  hg.addColorStop(0, 'rgba(80,40,150,0.95)'); hg.addColorStop(1, 'rgba(30,14,70,0.95)');
  ctx.fillStyle = hg; ctx.fillRect(x, y, w, 22);
  const lg = ctx.createLinearGradient(x, 0, x + w, 0);
  lg.addColorStop(0, COL.pink); lg.addColorStop(1, COL.teal);
  ctx.fillStyle = lg; ctx.fillRect(x, y + 21, w, 1);
  ctx.restore();
  ctx.restore();
  const region = map ? (guard('regionOfMap', () => regionOfMap(map.id), null) || map.region) : null;
  regionGlyph(ctx, region, x + 12, y + 11);
  mtxt(ctx, map?.name || '???', x + 24, y + 11.5, { size: 12, color: '#fff', maxW: w - 24 - 40 });
  // −/＋（大きさの切り替え）
  const bts = [{ id: 'mmMinus', t: '−', d: -1, x: x + w - 34 }, { id: 'mmPlus', t: '+', d: 1, x: x + w - 17 }];
  for (const b of bts) {
    const r = { x: b.x, y: y + 4, w: 14, h: 14 };
    const dis = (b.d < 0 && mmSize === 0) || (b.d > 0 && mmSize === 2);
    const hov = !dis && mouseIn(game, r);
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fillStyle = hov ? 'rgba(255,95,162,0.95)' : 'rgba(10,6,30,0.75)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = dis ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)'; ctx.stroke();
    ctx.restore();
    mtxt(ctx, b.t, r.x + 7, r.y + 7, { size: 12, align: 'center', num: true, weight: 900, color: dis ? '#777' : '#fff', outline: false });
    if (!dis) ui?.hudHit?.(b.id, r, { onClick: () => setMmSize(mmSize + b.d) });
  }
  if (!map || !mmSize) return;
  const mw = map.width || 2000, mh = map.height || 1200;
  const ix = x + 6, iy = y + 26, iw = R.iw, ih = R.ih;
  const sc = R.sc;
  const ox = ix + (iw - mw * sc) / 2, oy = iy + (ih - (mapBounds(map).bot - R.top) * sc) / 2 - R.top * sc;
  const P = (wx, wy) => [ox + wx * sc, oy + wy * sc];
  ctx.save();
  ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  ctx.lineCap = 'round';
  // 地面・足場（メイプルの縮小図のように淡い色の線）
  if (map.groundY != null) {
    const [gx, gy] = P(0, map.groundY);
    ctx.fillStyle = 'rgba(160,140,220,0.22)';
    ctx.fillRect(gx, gy, mw * sc, (mh - map.groundY) * sc);
    ctx.strokeStyle = 'rgba(220,210,255,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + mw * sc, gy); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(220,210,255,0.75)'; ctx.lineWidth = 1.5;
  for (const pf of map.platforms || []) {
    const [a, b] = P(pf.x, pf.y);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + pf.w * sc, b); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200,190,255,0.3)';
  for (const wl of map.walls || []) { const [a, b] = P(wl.x, wl.y); ctx.fillRect(a, b, wl.w * sc, wl.h * sc); }
  ctx.strokeStyle = 'rgba(255,220,150,0.55)'; ctx.lineWidth = 1;
  for (const r of map.ropes || []) {
    const [a, b] = P(r.x, r.top); const [, c] = P(r.x, r.bottom);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, c); ctx.stroke();
  }
  // ポータル: 青の小さな縦長
  for (const po of map.portals || []) {
    const [a, b] = P(po.x, po.y ?? map.groundY ?? 0);
    ctx.fillStyle = '#3aa8ff';
    rrPath(ctx, a - 2, b - 9, 4, 8, 2); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  }
  const dot = (wx, wy, col, r) => {
    const [a, b] = P(wx, wy);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(a, b - r, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke();
  };
  // NPC: 緑
  const npcs = (game.npcs && game.npcs.length ? game.npcs : map.npcs) || [];
  for (const n of npcs) if (!n.hidden) dot(n.x, n.y ?? map.groundY ?? 0, '#4dff6a', 2.4);
  // ほかのプレイヤー: 赤（いれば）
  for (const o of game.otherPlayers || []) if (o && Number.isFinite(o.x)) dot(o.x, o.y ?? map.groundY ?? 0, '#ff3b3b', 2.6);
  // 自分: 黄
  const p = game.player;
  if (p) dot(p.x, p.y, '#ffe600', 2.9);
  ctx.restore();
}

// ================================================================ マップに入ったときの地名（上中央）
function drawMapTitle(ctx, game, s, dt) {
  const map = game.map;
  if (!map) return;
  if (s.mapId !== map.id) {
    s.mapId = map.id;
    const region = guard('regionOfMap', () => regionOfMap(map.id), null) || map.region;
    const town = allMaps()[region] || allMaps()['w2_' + region]; // v4: 第2ワールドの町の ID は w2_<地域>
    // フィールドは地域の町の名前、町そのものは都市名（ネオリダ州 ヴァイス・ベイ / 第2ワールド ネオン・アーク）
    const city = map.worldId === 2 ? 'ネオン・アーク' : 'ヴァイス・ベイ';
    const sub = town && town.id !== map.id ? town.name : (map.town || town ? city : (mapInfo(map.id)?.regionName || ''));
    s.mapTitle = { name: map.name || '', sub: sub || '', col: regionColor(region), t: 0 };
  }
  const mt = s.mapTitle;
  if (!mt) return;
  // 読み込み中の目隠し（render/loadGate.js）が消えるまで待つ
  const gate = guard('loadGate', () => game.loadGate?.(), null);
  if (!(gate && (gate.active || gate.fade > 0.3))) mt.t += dt;
  const LIFE = 2.6;
  if (mt.t > LIFE) { s.mapTitle = null; return; }
  const a = ease(clamp(mt.t / 0.4, 0, 1)) * (1 - clamp((mt.t - LIFE + 0.7) / 0.7, 0, 1));
  if (a <= 0) return;
  // 上端 y 6〜46・中央 ±310 はボスの HP バー（render 側の BOSS_BAR_RECT）が使うので、帯は y 74 より下に置く
  const cx = W / 2, cy = 128 - (1 - ease(clamp(mt.t / 0.5, 0, 1))) * 10;
  ctx.save();
  ctx.globalAlpha = a;
  // 薄い黒の帯
  const bw = 520;
  const bg = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.25, 'rgba(0,0,0,0.42)'); bg.addColorStop(0.75, 'rgba(0,0,0,0.42)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg; ctx.fillRect(cx - bw / 2, cy - 44, bw, 74);
  ctx.restore();
  // 小さく地域名（左右に細い飾り線）
  if (mt.sub) {
    const sw = measure(ctx, mt.sub, 14, 800);
    ctx.save();
    ctx.globalAlpha = a;
    const lg = ctx.createLinearGradient(cx - sw / 2 - 70, 0, cx - sw / 2 - 10, 0);
    lg.addColorStop(0, rgba(mt.col, 0)); lg.addColorStop(1, rgba(mt.col, 0.95));
    ctx.fillStyle = lg; ctx.fillRect(cx - sw / 2 - 70, cy - 28, 60, 1.5);
    const rg = ctx.createLinearGradient(cx + sw / 2 + 10, 0, cx + sw / 2 + 70, 0);
    rg.addColorStop(0, rgba(mt.col, 0.95)); rg.addColorStop(1, rgba(mt.col, 0));
    ctx.fillStyle = rg; ctx.fillRect(cx + sw / 2 + 10, cy - 28, 60, 1.5);
    ctx.restore();
    mtxt(ctx, mt.sub, cx, cy - 27, { size: 14, align: 'center', weight: 800, color: '#ffe3f7', alpha: a, glow: mt.col, glowBlur: 6 });
  }
  // 大きな地名
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `900 34px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(12,4,30,0.9)';
  ctx.strokeText(mt.name, cx, cy + 4);
  const g = ctx.createLinearGradient(0, cy - 14, 0, cy + 20);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#fff1fb'); g.addColorStop(1, '#ffc0e6');
  ctx.fillStyle = g; ctx.shadowColor = COL.pink; ctx.shadowBlur = 14;
  ctx.fillText(mt.name, cx, cy + 4);
  ctx.restore();
}

// ================================================================ コンボ（中央やや右下・大きな数字＋COMBO）
const COMBO_TIERS = [
  { n: 100, c1: '#ffffff', c2: 'rainbow' },
  { n: 50, c1: '#f4d8ff', c2: '#b45cff' },
  { n: 30, c1: '#ffe0f0', c2: '#ff2a6d' },
  { n: 10, c1: '#fff4c0', c2: '#ff8a1f' },
  { n: 0, c1: '#ffffff', c2: '#3ee6d2' },
];
export const COMBO_POS = { x: 860, y: 440 };
function drawCombo(ctx, game, s, dt) {
  if (game.ui) game.ui.hudCombo = true; // render/cutin.js の右上のコンボ表示は出さない
  const cb = game.combo;
  const c = s.combo;
  const jf = game.ui?.jobFx;
  if (jf && jf.t < (jf.life || 5) - 0.7) return;
  const cnt = cb ? cb.count | 0 : 0;
  if (cnt !== c.shown) { if (cnt > c.shown) c.bump = 0; c.shown = cnt; if (cnt > 0) c.last = cnt; }
  c.bump += dt;
  c.fade = cnt >= 3 ? 1 : Math.max(0, c.fade - dt * 2.5);
  const show = cnt >= 3 ? cnt : c.last;
  if (c.fade <= 0 || show < 3) return;
  const tier = COMBO_TIERS.find((x) => show >= x.n);
  const time = game.time || 0;
  // 数字が弾む（増えた瞬間に大きく → 戻る、少し跳ねる）
  const b = c.bump;
  const pop = b < 0.07 ? 1 + 0.45 * (b / 0.07) : b < 0.22 ? 1.45 - 0.45 * ease((b - 0.07) / 0.15) : 1;
  const hop = b < 0.22 ? Math.sin(clamp(b / 0.22, 0, 1) * Math.PI) * 8 : 0;
  const { x, y } = COMBO_POS;
  ctx.save();
  ctx.globalAlpha = c.fade;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const text = String(show);
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.scale(pop, pop);
  ctx.font = `italic 900 58px "Arial Black", Impact, ${NUM_FONT}`;
  ctx.lineWidth = 10; ctx.strokeStyle = '#1a0828'; ctx.strokeText(text, 0, 0);
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.strokeText(text, 0, 0);
  let fill;
  if (tier.c2 === 'rainbow') {
    fill = ctx.createLinearGradient(-60, 0, 60, 0);
    for (let i = 0; i < RAINBOW.length; i++) fill.addColorStop(i / (RAINBOW.length - 1), RAINBOW[(i + ((time * 12) | 0)) % RAINBOW.length]);
  } else {
    fill = ctx.createLinearGradient(0, -46, 0, 0);
    fill.addColorStop(0, tier.c1); fill.addColorStop(1, tier.c2);
  }
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.font = `italic 900 20px "Arial Black", ${NUM_FONT}`;
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a0828'; ctx.strokeText('COMBO', x, y + 24);
  const cg = ctx.createLinearGradient(0, y + 8, 0, y + 26);
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, tier.c2 === 'rainbow' ? '#ffd447' : tier.c2);
  ctx.fillStyle = cg; ctx.fillText('COMBO', x, y + 24);
  // 続けられる残り時間（細い線）
  const win = cb?.window || 3.2;
  const rem = cnt >= 3 ? clamp(1 - (cb.t || 0) / win, 0, 1) : 0;
  ctx.fillStyle = 'rgba(10,4,24,0.65)'; ctx.fillRect(x - 50, y + 31, 100, 4);
  ctx.fillStyle = tier.c2 === 'rainbow' ? '#ffffff' : tier.c2; ctx.fillRect(x - 50, y + 31, 100 * rem, 4);
  ctx.restore();
}

// ================================================================ 上中央のお知らせ（重要な通知だけ。ほかは左下のログ）
function drawNotices(ctx, game) {
  const ui = game.ui;
  const list = (ui?.toasts || []).filter((t) => (t.pri ?? 0) >= 1);
  if (!list.length) return;
  if (ui.jobFx && ui.jobFx.t < (ui.jobFx.life || 5) - 0.7) return;
  let y = 196;
  for (const tt of list.slice(-3)) {
    const a = clamp(tt.t / 0.2, 0, 1) * (1 - clamp((tt.t - tt.life + 0.5) / 0.5, 0, 1));
    if (a <= 0) continue;
    const label = tt.count > 1 ? `${tt.text}  ×${tt.count}` : tt.text;
    const tw = Math.min(W - 80, measure(ctx, label, 15, 800) + 120);
    const yy = y - (1 - ease(clamp(tt.t / 0.25, 0, 1))) * 8;
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(0,0,0,0.55)'); g.addColorStop(0.8, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(W / 2 - tw / 2, yy - 13, tw, 26);
    ctx.restore();
    mtxt(ctx, label, W / 2, yy + 0.5, { size: 15, align: 'center', weight: 800, color: tt.pri >= 2 ? '#ffe86a' : (tt.color || '#fff'), alpha: a, maxW: W - 140 });
    y += 30;
  }
}

// ================================================================ マウスカーソル（白い手袋。押している間は指を曲げる）
// 角丸の矩形を今のパスに足す（rrPath と違い beginPath しない）
function rrSub(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function gloveCanvas(pressed) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  // 手を立てた向きで描いてから左上へ傾ける（人差し指の先がホットスポット）
  x.translate(pressed ? 11 : 10, pressed ? 14 : 15.6);
  x.rotate(-0.45);
  x.lineJoin = 'round'; x.lineCap = 'round';
  const body = () => {
    x.beginPath();
    if (pressed) {
      rrSub(x, -3, -8, 6, 9, 3);     // 曲げた人差し指（短く・先が丸い）
    } else {
      rrSub(x, -3, -14, 6, 15, 3);   // 伸ばした人差し指
    }
    rrSub(x, 2.5, -4, 4.5, 7, 2.2);    // 中指（握る）
    rrSub(x, 6.5, -3, 4.2, 6.5, 2.1);  // 薬指
    rrSub(x, 10.2, -1.5, 3.8, 6, 1.9); // 小指
    rrSub(x, -4.5, -1, 18, 13, 5);     // 手のひら
    x.moveTo(-4, 5); x.quadraticCurveTo(-10, 2.5, -9, -2.5); x.quadraticCurveTo(-6.5, -4, -3.5, 0.5); x.closePath(); // 親指
  };
  body();
  x.lineWidth = 3; x.strokeStyle = '#1a0a2a'; x.stroke();
  const g = x.createLinearGradient(-8, -14, 14, 14);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.65, '#f2eefc'); g.addColorStop(1, '#c9c0e6');
  body(); x.fillStyle = g; x.fill();
  // 指の筋・曲げた関節
  x.strokeStyle = 'rgba(80,60,120,0.6)'; x.lineWidth = 0.9;
  x.beginPath();
  x.moveTo(2.6, -1); x.lineTo(2.6, 2.5); x.moveTo(6.6, -1); x.lineTo(6.6, 3); x.moveTo(10.3, 0.5); x.lineTo(10.3, 4);
  if (pressed) { x.moveTo(-2, -4); x.lineTo(2, -4); }
  x.stroke();
  // 袖口（ネオンピンク）
  x.beginPath(); rrSub(x, -4, 10.5, 17, 4.5, 2);
  x.lineWidth = 2.4; x.strokeStyle = '#1a0a2a'; x.stroke();
  x.fillStyle = COL.pink; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(-2.5, 11.2, 13, 1.2);
  return c.toDataURL('image/png');
}
let cursorReady = false;
export function installCursor(canvas) {
  if (cursorReady || typeof document === 'undefined') return;
  const cv = canvas || document.getElementById('game');
  if (!cv) return;
  cursorReady = true;
  if (isTouch()) return;
  guard('hud.cursor', () => {
    const up = `url(${gloveCanvas(false)}) 4 3, auto`, down = `url(${gloveCanvas(true)}) 7 7, auto`;
    cv.style.cursor = up;
    const set = (v) => { cv.style.cursor = v; };
    cv.addEventListener('mousedown', () => set(down));
    globalThis.addEventListener?.('mouseup', () => set(up));
    globalThis.addEventListener?.('blur', () => set(up));
  });
}

// ================================================================ まとめ
/** hud.js の drawHUD から呼ぶ部品（[タグ, 関数]）。順番は描画の重なり順 */
export function maplePartsBack() {
  return [['mmTitle', drawMapTitle], ['combo', drawCombo]];
}
export function maplePartsFront() {
  return [
    ['mmMinimap', drawMinimap], ['expBar', drawExpBar], ['statusBar', drawStatusBar], ['quickSlots', drawQuickSlots],
    ['menuBar', drawMenuBar], ['log', drawLog], ['notices', drawNotices],
  ];
}
/** drawHUD の頭で毎フレーム呼ぶ（レイアウト・取得の差分） */
export function mapleFrame(game) {
  updateLayout(game);
  installCursor(game.canvas);
  const s = st0(game);
  guard('hud.trackGains', () => trackGains(game, s));
  return s;
}
export function mapleState(game) { return st0(game); }
