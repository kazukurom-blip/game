// HUD: メイプル風の常駐 UI（hudMaple.js: EXP バー / 下中央ステータス / 右下クイックスロット・メニュー / 左下の取得ログ /
//      左上ミニマップ / 地名 / コンボ）＋ 右上 バフ・召喚獣の残り時間 / 右クエストトラッカー
//      レアドロップバナー / 低HPビネット / 警官接近フラッシュ
import {
  COL, FONT, font, panel, txt, rrPath, starPath, rgba, clamp, ease, rarityFill, measure,
  getClock, clockStr, clockPhase, drawPhaseIcon, PHASE_INFO, rainbowGrad, RAINBOW,
} from './theme.js';
import {
  guard, stats, skillDef, getItemDef,
  drawSkillIco, drawItemIco, rarityInfo, drawPetArt, drawEnemyArt, mapInfo, regionColor,
} from './deps.js';
import { drawJobBubble, drawNavArrow, trackerHit } from './hud3.js';
import { mapleFrame, maplePartsBack, maplePartsFront, quickSlots, minimapRect, hudLayout, QS } from './hudMaple.js';
import { neonForceOf, forceModsFor } from '../systems/neonCore.js';

const W = 1280, H = 720;
const hudState = new WeakMap();
function hs(game) {
  let s = hudState.get(game);
  if (!s) {
    s = { lastT: game.time || 0 };
    hudState.set(game, s);
  }
  return s;
}

// スキルバー/ポーションスロットの画面矩形（UI のドラッグ&ドロップでも使う）= 右下のクイックスロット
export const SLOT = QS;
export function hudSlots() { return quickSlots(); }

// main から直接呼んでも ui.draw() 経由でも良い（同一フレームで二重描画しないガード付き）
export function drawHUD(ctx, game, _internal = false) {
  if (!game || !game.state) return;
  const ui = game.ui;
  // 二重描画防止はフレーム番号（main の game.frameNo）で判定する。
  // 以前は時間窓（6〜12ms）だったため、HUD 描画が遅い端末では同じフレームに二重に描いていた
  if (ui) {
    const fr = game.frameNo ?? ui.frame;
    if (ui._hudFrame === fr) return; // このフレームは描画済み
    ui._hudFrame = fr;
    ui._hudHits = []; ui._hudFrameHits = fr;
    if (_internal) ui._hudByUi = true; else ui._hudByUi = false;
  }
  const s0 = hs(game);
  const dt = clamp((game.time || 0) - s0.lastT, 0, 0.1);
  s0.lastT = game.time || 0;
  let s = s0;
  try { s = mapleFrame(game); } catch (e) { guard('hud.mapleFrame', () => { throw e; }); }
  const parts = [
    ['vignette', drawVignette], ['copFlash', drawCopFlash], ...maplePartsBack(), ['jobBubble', drawJobBubble], ['navArrow', drawNavArrow],
    ['buffs', drawBuffBar], ['tracker', drawTracker], ['clock', drawClockBadge],
    ['radio', drawRadio], ['bookNew', drawBookToasts],
    ...maplePartsFront(),
    ['banner', drawBanner], ['petFx', drawPetFx],
  ];
  const prof = game.debug?.profile ? (game.debug.hudProf ||= {}) : null; // デバッグ: 部位ごとの描画時間(ms, EMA)
  for (const [tag, fn] of parts) {
    const t0 = prof ? performance.now() : 0;
    ctx.save();
    try { fn(ctx, game, s, dt); } catch (e) { guard('hud.' + tag, () => { throw e; }); }
    ctx.restore();
    if (prof) prof[tag] = (prof[tag] ?? 0) * 0.9 + (performance.now() - t0) * 0.1;
  }
}

// ---------- 低HPビネット ----------
function drawVignette(ctx, game) {
  const st = stats(game);
  const r = (game.state.hp ?? 1) / Math.max(1, st.maxHp || 1);
  if (r >= 0.3 || (game.state.hp ?? 1) <= 0) return;
  const k = (0.3 - r) / 0.3;
  const pulse = 0.5 + 0.5 * Math.sin((game.time || 0) * (5 + k * 4));
  const a = 0.25 + k * 0.35 + pulse * 0.25;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(255,0,40,0)');
  g.addColorStop(1, `rgba(255,20,50,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------- 警官接近: 画面端の赤×青フラッシュ ----------
export function copsNear(game) {
  const p = game.player;
  if (!p) return false;
  for (const e of game.enemies || []) {
    if (!e || e.dead) continue;
    const d = e.def || {};
    if (!(d.isCop || d.ai === 'cop' || d.art === 'cop' || d.art === 'swat')) continue;
    if (Math.abs(e.x - p.x) < 760 && Math.abs(e.y - p.y) < 480) return true;
  }
  for (const v of game.vehicles || []) {
    if (v && v.kind === 'police' && !v.dead && !v.driver && Math.abs(v.x - p.x) < 760) return true;
  }
  return false;
}
function drawCopFlash(ctx, game) {
  if (!(game.wanted > 0) || !copsNear(game)) return;
  const t = game.time || 0;
  const phase = Math.floor(t * 3) % 2;
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
  const a = 0.14 + 0.12 * pulse;
  const left = phase ? COL.copRed : COL.copBlue, right = phase ? COL.copBlue : COL.copRed;
  let g = ctx.createLinearGradient(0, 0, 160, 0);
  g.addColorStop(0, rgba(left, a)); g.addColorStop(1, rgba(left, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 160, H);
  g = ctx.createLinearGradient(W, 0, W - 160, 0);
  g.addColorStop(0, rgba(right, a)); g.addColorStop(1, rgba(right, 0));
  ctx.fillStyle = g; ctx.fillRect(W - 160, 0, 160, H);
  g = ctx.createLinearGradient(0, 0, 0, 60);
  g.addColorStop(0, rgba(left, a * 0.6)); g.addColorStop(1, rgba(left, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 60);
}

// ---------- 右上 バフ・召喚獣の残り時間（メイプル風） ----------
// 所持金は持ち物画面に、増えた分は左下の取得ログに出す。手配度★は出さない（警察の仕組みは廃止）
export const BUFF_ICON = 34;
const BUFF_GAP = 5, BUFF_PER_ROW = 12;
const BUFF_FX = [
  ['atkPct', '攻撃力', true], ['defPct', '防御力', true], ['speedPct', '移動速度', true], ['attackSpeedPct', '攻撃速度', true],
  ['critAdd', 'クリティカル率', true], ['luckAdd', '幸運', false],
];
function buffEffectText(b) {
  const out = [];
  for (const [k, lab, pct] of BUFF_FX) {
    const v = b[k];
    if (!v) continue;
    out.push(`${lab} ${v > 0 ? '+' : ''}${pct ? Math.round(v * 100) + '%' : Math.round(v)}`);
  }
  return out.join('  ');
}
// バフの出どころ（スキルなら skillId、ドリンクなら itemId）
function buffSource(b) {
  const id = String(b.id || '');
  const sk = skillDef(id) || skillDef(id.replace(/_after$/, ''));
  if (sk) return { sk };
  const it = getItemDef(id);
  if (it) return { it };
  return {};
}
function fmtLeft(sec) {
  const n = Math.max(0, Math.ceil(sec));
  if (n >= 3600) return Math.floor(n / 3600) + 'h';
  if (n >= 60) return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  return n + '';
}
/** 右上に並べる項目（バフ → 召喚獣）。テストからも使う */
export function buffBarItems(game) {
  const out = [];
  for (const b of game.buffs || []) {
    if (!b || b.combo || !(b.t > 0) || (b.duration || 0) >= 1e5) continue; // コンボのバフは専用の表示があるので出さない
    const src = buffSource(b);
    out.push({
      kind: 'buff', key: 'b:' + b.id, left: b.t, dur: b.duration || b.t, color: b.color || src.sk?.color || COL.teal,
      name: b.name || src.sk?.name || src.it?.name || 'バフ', fx: buffEffectText(b), sk: src.sk || null, it: src.it || null,
    });
  }
  const sums = Array.isArray(game.summons) ? game.summons : [];
  for (const m of sums) {
    if (!m || !(m.left > 0)) continue;
    const sk = skillDef(m.skillId);
    out.push({
      kind: 'summon', key: 's:' + (m.id ?? m.skillId), left: m.left, dur: m.dur || m.left, color: m.color || sk?.color || COL.gold,
      name: m.name || sk?.name || '召喚獣', fx: '召喚獣がいっしょに戦う', sk, it: null,
    });
  }
  return out;
}
function drawBuffIcon(ctx, e, x, y, sz, t) {
  const cx = x + sz / 2, cy = y + sz / 2;
  const low = e.left <= 5;
  ctx.save();
  if (low && Math.floor(t * 4) % 2 === 0) ctx.globalAlpha *= 0.4; // 残りわずかで点滅
  rrPath(ctx, x - 1, y - 1, sz + 2, sz + 2, 8);
  ctx.fillStyle = 'rgba(6,4,24,0.8)'; ctx.fill();
  if (e.sk) drawSkillIco(ctx, e.sk, cx, cy, sz);
  else if (e.it) drawItemIco(ctx, e.it, cx, cy, sz - 4);
  else {
    rrPath(ctx, x + 3, y + 3, sz - 6, sz - 6, 7);
    ctx.fillStyle = rgba(e.color, 0.85); ctx.fill();
    txt(ctx, String(e.name).slice(0, 1), cx, cy + 1, { size: sz * 0.42, align: 'center' });
  }
  // 経過した分を時計回りに暗くする
  const k = clamp(1 - e.left / Math.max(0.001, e.dur), 0, 1);
  if (k > 0) {
    ctx.save();
    rrPath(ctx, x, y, sz, sz, 7); ctx.clip();
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, sz, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    ctx.restore();
  }
  rrPath(ctx, x - 1, y - 1, sz + 2, sz + 2, 8);
  ctx.lineWidth = e.kind === 'summon' ? 2.2 : 1.6;
  ctx.strokeStyle = e.kind === 'summon' ? COL.gold : rgba(e.color, 0.95);
  ctx.stroke();
  ctx.restore();
  if (e.kind === 'summon') txt(ctx, '召', x + 2, y + 7, { size: 9.5, color: COL.gold, sw: 2.5 });
  txt(ctx, fmtLeft(e.left), x + sz - 2, y + sz - 6, { size: 12, align: 'right', color: low ? '#ff9aa8' : '#fff', sw: 3, alpha: low && Math.floor(t * 4) % 2 === 0 ? 0.5 : 1 });
}
function drawBuffBar(ctx, game) {
  const ui = game.ui;
  const items = buffBarItems(game);
  if (ui) ui._buffBarBottom = 0;
  if (!items.length) return 0;
  const t = game.time || 0, sz = BUFF_ICON;
  const BUFF_TOP = hudLayout().buffTop || 12; // タッチ端末では #touch のメニューの下
  const m = game.input?.mouse;
  let hov = null;
  items.forEach((e, i) => {
    const col = i % BUFF_PER_ROW, row = Math.floor(i / BUFF_PER_ROW);
    const x = W - 14 - sz - col * (sz + BUFF_GAP), y = BUFF_TOP + row * (sz + BUFF_GAP);
    drawBuffIcon(ctx, e, x, y, sz, t);
    const r = { x, y, w: sz, h: sz };
    if (m && ui && !ui.drag && !ui.dnd?.active && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h && !ui.winAt?.(m.x, m.y)) hov = e;
  });
  const rows = Math.ceil(items.length / BUFF_PER_ROW);
  const bottom = BUFF_TOP + rows * (sz + BUFF_GAP);
  if (ui) ui._buffBarBottom = bottom;
  // マウスを乗せたら名前と効果（ツールチップは ui.draw がウィンドウの上に描く）
  if (hov && ui) {
    const lines = [{ t: hov.name, c: hov.color, size: 15 }];
    lines.push({ t: hov.kind === 'summon' ? '召喚獣' : 'バフ', c: COL.sub, size: 11.5, r: `残り ${fmtLeft(hov.left)}${hov.left < 60 ? '秒' : ''}`, rc: hov.left <= 5 ? COL.bad : '#fff' });
    if (hov.fx) lines.push({ t: hov.fx, c: COL.good, size: 12.5, wrap: true });
    ui._hudTip = { frame: game.frameNo ?? ui.frame, tip: { lines, border: hov.color } };
  }
  return bottom;
}
// ---------- 右側 クエストトラッカー ----------
function drawTracker(ctx, game) {
  const list = guard('missions.tracked', () => game.missions?.tracked?.(), []) || [];
  if (game.ui) game.ui._trackerBottom = 0;
  if (!list.length) return;
  const w = 290, x = W - w - 12;
  let y = Math.max(140, (game.ui?._buffBarBottom || 0) + 60); // バフが2段になったら下げる
  // 高さを計算
  const trackedId = game.state?.trackedMission;
  const items = list.slice(0, 4).map((m, i) => ({ id: m.id, name: m.name || '', lines: (m.lines || []).slice(0, 4), done: !!(m.done || m.complete), tracked: trackedId ? m.id === trackedId : i === 0 }));
  const hgt = 32 + items.reduce((a, m) => a + 22 + m.lines.length * 19 + 6, 0);
  if (game.ui) game.ui._trackerBottom = y + hgt; // コンボ表示（render/cutin.js）はこの下に出す
  // メイプルのクエストヘルパー風: 半透明の黒・角の丸みは小さく・上に細い見出しの帯
  ctx.save();
  rrPath(ctx, x, y, w, hgt, 5);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  ctx.beginPath(); ctx.rect(x, y, w, 26); ctx.clip();
  rrPath(ctx, x, y, w, 26, 5);
  const hg = ctx.createLinearGradient(x, 0, x + w, 0);
  hg.addColorStop(0, 'rgba(255,95,162,0.85)'); hg.addColorStop(1, 'rgba(123,47,247,0.5)');
  ctx.fillStyle = hg; ctx.fill();
  ctx.restore();
  txt(ctx, 'MISSION', x + 12, y + 13.5, { size: 12, sw: 3 });
  txt(ctx, 'クリックで詳細 [J]', x + w - 12, y + 13.5, { size: 10.5, align: 'right', color: COL.dim, sw: 2.5 });
  y += 34;
  for (const m of items) {
    const top = y;
    txt(ctx, (m.tracked ? '⌖ ' : m.done ? '★ ' : '◆ ') + m.name, x + 12, y + 8, { size: 14, color: m.done ? '#c6ff6a' : m.tracked ? '#7fe9ff' : COL.gold, maxW: w - 24 });
    y += 22;
    for (const l of m.lines) {
      const s0 = String(l);
      const done = /^[✔✓]/.test(s0) || /(\d+)\s*\/\s*\1(?!\d)$/.test(s0);
      const arrow = /^→/.test(s0);
      const body = s0.replace(/^[・✔✓]\s*/, '');
      txt(ctx, (arrow ? '' : done ? '✔ ' : '・') + body, x + 20, y + 8, { size: 12.5, color: arrow ? COL.gold : done ? '#c6ff6a' : '#f2efff', maxW: w - 32, sw: 3 });
      y += 19;
    }
    trackerHit(ctx, game, m, { x: x + 4, y: top - 2, w: w - 8, h: y - top + 4 });
    y += 6;
  }
}

// ---------- レアドロップバナー ----------
function drawBanner(ctx, game) {
  const b = game.ui?.banners?.[0];
  if (!b || game.ui?.petFx) return;
  const item = b.item || {};
  const info = rarityInfo(item.rarity);
  const t = b.t, life = b.life;
  const inK = ease(t / 0.35), outK = 1 - clamp((t - life + 0.4) / 0.4, 0, 1);
  const a = Math.min(inK, outK);
  if (a <= 0) return;
  const cy = 252, bw = 640 * (0.6 + 0.4 * inK), bh = 76;
  const x = W / 2 - bw / 2, y = cy - bh / 2;
  ctx.save();
  ctx.globalAlpha = a;
  // 後光
  const time = game.time || 0;
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = rgba(info.color, 0.08);
    ctx.beginPath(); ctx.moveTo(0, 0);
    const ang = 0.12 + Math.sin(time * 2 + i) * 0.03;
    ctx.lineTo(Math.cos(-ang) * 420, Math.sin(-ang) * 420 + Math.sin(time) * 0);
    ctx.lineTo(Math.cos(ang) * 420, Math.sin(ang) * 420);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // 帯
  const g = ctx.createLinearGradient(x, 0, x + bw, 0);
  g.addColorStop(0, rgba(info.color, 0));
  g.addColorStop(0.15, rgba(info.color, 0.85));
  g.addColorStop(0.5, info.color2 ? rgba(info.color2, 0.9) : rgba(info.color, 0.95));
  g.addColorStop(0.85, rgba(info.color, 0.85));
  g.addColorStop(1, rgba(info.color, 0));
  ctx.fillStyle = 'rgba(14,6,40,0.75)';
  ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, bw, 4); ctx.fillRect(x, y + bh - 4, bw, 4);
  ctx.globalAlpha = a * 0.35; ctx.fillRect(x, y + 4, bw, bh - 8); ctx.globalAlpha = a;
  // 光沢スイープ
  const sweep = ((t * 0.9) % 1.4) - 0.2;
  const sx = x + bw * sweep;
  const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.45)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
  ctx.fillRect(sx - 60, y, 120, bh);
  ctx.restore();
  ctx.restore();
  // アイコン
  ctx.save(); ctx.globalAlpha = a;
  const icx = W / 2 - 200, bob = Math.sin(time * 4) * 3;
  ctx.beginPath(); ctx.arc(icx, cy + bob, 28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = info.color; ctx.shadowColor = info.color; ctx.shadowBlur = 16; ctx.stroke();
  ctx.shadowBlur = 0;
  drawItemIco(ctx, item, icx, cy + bob, 44);
  ctx.restore();
  // テキスト
  txt(ctx, `★ ${info.name} ドロップ！ ★`, W / 2 + 30, cy - 15, { size: 17, align: 'center', color: '#fff', glow: info.color, alpha: a });
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = font(26, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,4,30,0.9)';
  ctx.strokeText(item.name || '???', W / 2 + 30, cy + 14);
  ctx.fillStyle = rarityFill(ctx, info, W / 2 - 120, 0, W / 2 + 180, 0);
  ctx.shadowColor = info.color; ctx.shadowBlur = 14;
  ctx.fillText(item.name || '???', W / 2 + 30, cy + 14);
  ctx.restore();
  // キラキラ
  ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const px = W / 2 + Math.sin(i * 77.7 + time * 1.3) * bw * 0.48;
    const py = cy + Math.cos(i * 33.1 + time * 1.7) * 44;
    const r = 2 + 3 * (0.5 + 0.5 * Math.sin(time * 6 + i));
    ctx.fillStyle = i % 2 ? '#fff' : info.color;
    starPath(ctx, px, py, r * 1.8, r * 0.5, 4, 0); ctx.fill();
  }
  ctx.restore();
}

// （レベルアップの演出は render 側がキャラの頭上に「LEVEL UP!!」と光の柱で出す。画面中央の大きな文字は二重になるので出さない）

// ---------- 時計＋エリアバッジ（ミニマップ右） ----------
function drawClockBadge(ctx, game) {
  // ミニマップ（大きさを切り替えられる）の右に並べる
  const mm = minimapRect(game);
  const x = mm.x + mm.w + 8, y = 8;
  const c = getClock(game);
  const t = game.time || 0;
  let bx = x, by = y;
  if (c != null) {
    const ph = clockPhase(c), info = PHASE_INFO[ph];
    const w = 150, h = 26;
    ctx.save();
    rrPath(ctx, bx, by, w, h, 5);
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(0, ph === 'night' ? 'rgba(20,24,80,0.88)' : ph === 'dusk' ? 'rgba(110,40,80,0.85)' : ph === 'dawn' ? 'rgba(110,60,110,0.85)' : 'rgba(40,70,140,0.82)');
    g.addColorStop(1, 'rgba(14,9,40,0.85)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(info.color, 0.8); ctx.stroke();
    ctx.restore();
    drawPhaseIcon(ctx, ph, bx + 14, by + h / 2, 6.5, t);
    ctx.save();
    ctx.font = `italic 900 14px ${FONT}`;
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,3,20,0.9)';
    const s0 = clockStr(c);
    ctx.strokeText(s0, bx + 28, by + h / 2 + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(s0, bx + 28, by + h / 2 + 1);
    ctx.restore();
    txt(ctx, info.name, bx + w - 12, by + h / 2 + 1, { size: 10, align: 'right', color: info.color, sw: 2.5 });
    by += h + 4;
  }
  const map = game.map;
  if (!map) return;
  if (map.town) {
    const w = 150, h = 20;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
    ctx.save();
    rrPath(ctx, bx, by, w, h, 5);
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(0, 'rgba(25,211,197,0.9)'); g.addColorStop(1, 'rgba(60,140,255,0.85)');
    ctx.fillStyle = g; ctx.shadowColor = COL.teal; ctx.shadowBlur = 3 + pulse * 5; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    // 盾
    ctx.save();
    ctx.translate(bx + 13, by + h / 2); ctx.scale(0.75, 0.75);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, -5); ctx.lineTo(6, 3); ctx.lineTo(0, 8); ctx.lineTo(-6, 3); ctx.lineTo(-7, -5); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    txt(ctx, 'SAFE ZONE / TOWN', bx + 25, by + h / 2 + 1, { size: 10.5, color: '#fff', sw: 3, stroke: '#063a4a', weight: 900 });
  } else if (map.levelRange || map.region) {
    const w = 150, h = 20;
    const col = regionColor(mapInfo(map.id).region);
    ctx.save();
    rrPath(ctx, bx, by, w, h, 5);
    ctx.fillStyle = 'rgba(14,9,40,0.82)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 0.9); ctx.stroke();
    ctx.restore();
    txt(ctx, 'FIELD', bx + 12, by + h / 2 + 1, { size: 10, color: col, sw: 3, weight: 900 });
    const lr = map.levelRange;
    if (lr) txt(ctx, `推奨 Lv${lr[0]}-${lr[1]}`, bx + w - 12, by + h / 2 + 1, { size: 11, align: 'right', color: (game.state.level || 1) < lr[0] ? COL.bad : '#fff', sw: 3 });
  }
  if (map.worldId === 2) guard('hud.neonForce', () => drawNeonForceBadge(ctx, game, bx, by + 24));
}

// v5: 第2ワールドのマップでは、自分のネオン適性とマップの必要な適性（足りないと赤・点滅）
function drawNeonForceBadge(ctx, game, bx, by) {
  const F = neonForceOf(game.state), m = forceModsFor(game);
  const R = m.R, short = R > 0 && F < R;
  const w = 150, h = 20;
  const t = game.time || 0;
  ctx.save();
  rrPath(ctx, bx, by, w, h, 5);
  ctx.fillStyle = short ? `rgba(90,10,30,${0.8 + 0.1 * Math.sin(t * 5)})` : 'rgba(14,9,40,0.82)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = short ? COL.bad : 'rgba(25,240,255,0.85)'; ctx.stroke();
  ctx.restore();
  // ネオンの菱形
  ctx.save();
  ctx.translate(bx + 11, by + h / 2);
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath();
  ctx.fillStyle = short ? COL.bad : '#9ef7ff'; ctx.fill();
  ctx.restore();
  txt(ctx, '適性', bx + 21, by + h / 2 + 1, { size: 10, color: short ? '#ffb3bd' : '#9ef7ff', sw: 3, weight: 900 });
  txt(ctx, R > 0 ? `${F} / ${R}` : `${F}`, bx + w - 10, by + h / 2 + 1, { size: 11.5, align: 'right', color: short ? COL.bad : '#fff', sw: 3 });
  if (game.ui?.hudHit) game.ui.hudHit('neonForce', { x: bx, y: by, w, h }, { onClick: () => { if (!game.ui.isModal?.()) game.ui.toggle?.('neoncore'); } });
}

// ---------- ラジオ局テロップ（上中央） ----------
function drawRadio(ctx, game) {
  const r = game.ui?.radio;
  if (!r || r.t > r.life) return;
  const a = clamp(r.t / 0.25, 0, 1) * (1 - clamp((r.t - r.life + 0.6) / 0.6, 0, 1));
  if (a <= 0) return;
  const cx = W / 2, cy = 76; // 上端 y 6〜46 はボスの HP バーが使う
  const name = r.name || 'RADIO OFF';
  const slide = (1 - ease(r.t / 0.35)) * 30;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `italic 900 30px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(10,4,30,0.9)';
  ctx.strokeText(name, cx + slide, cy);
  const tw = ctx.measureText(name).width;
  ctx.fillStyle = r.off ? '#cfc8ff' : rainbowGrad(ctx, cx - tw / 2, 0, cx + tw / 2, 0, (game.time || 0) * 0.3);
  ctx.shadowColor = COL.pink; ctx.shadowBlur = r.off ? 0 : 14;
  ctx.fillText(name, cx + slide, cy);
  ctx.restore();
  // 小さなラベル＋イコライザ
  const t = game.time || 0;
  ctx.save(); ctx.globalAlpha = a;
  for (let i = 0; i < 5; i++) {
    const hh = r.off ? 2 : 3 + 9 * Math.abs(Math.sin(t * 7 + i * 1.3));
    ctx.fillStyle = RAINBOW[i];
    ctx.fillRect(cx - 52 + i * 6, cy + 32 - hh, 4, hh);
  }
  ctx.restore();
  txt(ctx, r.off ? 'RADIO' : 'NOW PLAYING · RADIO', cx - 18, cy + 27, { size: 11, color: '#ffe3f7', alpha: a, sw: 3 });
}

// ---------- 図鑑 NEW トースト（右下） ----------
function drawBookToasts(ctx, game) {
  const list = game.ui?.bookToasts;
  if (!list?.length) return;
  const t0 = game.time || 0;
  let y = hudLayout().qy - 4 - 6 - 24 - 10 - 58; // 右下のメニューボタン列の上
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    const a = clamp(b.t / 0.2, 0, 1) * (1 - clamp((b.t - b.life + 0.5) / 0.5, 0, 1));
    if (a <= 0) continue;
    const w = 250, h = 58, x = W - w - 14 + (1 - ease(b.t / 0.3)) * 120;
    ctx.save();
    ctx.globalAlpha = a;
    panel(ctx, x, y, w, h, { r: 14, top: 'rgba(60,20,90,0.92)', bottom: 'rgba(20,10,44,0.92)', stroke: COL.gold, inner: 'rgba(255,95,162,0.5)', glow: 'rgba(255,212,71,0.5)' });
    // 敵の絵
    ctx.save();
    rrPath(ctx, x + 6, y + 6, 50, h - 12, 9); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 6, y + 6, 50, h - 12);
    if (b.def) {
      const dh = Math.max(30, (b.def.h || 40) * (b.def.scale || 1));
      const s = clamp(40 / dh, 0.25, 1);
      ctx.translate(x + 31, y + h - 10); ctx.scale(s, s);
      drawEnemyArt(ctx, { def: { ...b.def, boss: false }, x: 0, y: 0, facing: 1, state: 'idle', t: t0, hurtT: 0, hp: 1, maxHp: 1, w: b.def.w, h: b.def.h, onGround: true, seed: 1 });
    }
    ctx.restore();
    ctx.restore();
    const pop = b.t < 0.3 ? 1 + (1 - b.t / 0.3) * 0.5 : 1 + Math.sin(t0 * 8) * 0.04;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x + 92, y + 18); ctx.scale(pop, pop);
    rrPath(ctx, -26, -9, 52, 18, 9); ctx.fillStyle = COL.pink; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    txt(ctx, 'NEW!', x + 92, y + 18.5, { size: 11, align: 'center', alpha: a, sw: 2.5 });
    txt(ctx, '図鑑に登録', x + 126, y + 18.5, { size: 11, color: COL.gold, alpha: a, sw: 2.5 });
    txt(ctx, b.name || '???', x + 66, y + 40, { size: 15, color: '#fff', alpha: a, maxW: w - 80 });
    txt(ctx, '[B]', x + w - 12, y + 18.5, { size: 10, align: 'right', color: COL.dim, alpha: a, sw: 2 });
    y -= h + 8;
  }
}

// ---------- PET 入手 超豪華演出 ----------
function drawPetFx(ctx, game) {
  const fx = game.ui?.petFx;
  if (!fx) return;
  const t = fx.t, life = fx.life || 6;
  const time = game.time || 0;
  const a = clamp(t / 0.25, 0, 1) * (1 - clamp((t - life + 0.7) / 0.7, 0, 1));
  if (a <= 0) return;
  const item = fx.item || {};
  const cx = W / 2, cy = 300;
  // 画面暗転＋白フラッシュ
  ctx.save();
  ctx.fillStyle = `rgba(6,2,22,${0.55 * a})`;
  ctx.fillRect(0, 0, W, H);
  if (t < 0.35) { ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - t / 0.35)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  // 虹の放射光
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.35);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    ctx.rotate(Math.PI * 2 / 14);
    const gg = ctx.createLinearGradient(0, 0, 720, 0);
    gg.addColorStop(0, rgba(RAINBOW[i % RAINBOW.length], 0.55)); gg.addColorStop(1, rgba(RAINBOW[i % RAINBOW.length], 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(720, -46); ctx.lineTo(720, 46); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // リング
  ctx.save();
  ctx.globalAlpha = a;
  for (let k = 0; k < 3; k++) {
    const rr = ((t * 260 + k * 140) % 420);
    ctx.lineWidth = 4 * (1 - rr / 420);
    ctx.strokeStyle = rgba(RAINBOW[(k * 2) % RAINBOW.length], 0.8 * (1 - rr / 420));
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // 台座の光
  ctx.save(); ctx.globalAlpha = a;
  const pg = ctx.createRadialGradient(cx, cy + 40, 4, cx, cy + 40, 160);
  pg.addColorStop(0, 'rgba(255,255,255,0.75)'); pg.addColorStop(0.4, 'rgba(255,150,240,0.35)'); pg.addColorStop(1, 'rgba(255,150,240,0)');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(cx, cy + 40, 160, 46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // PET 本体
  const pop = t < 0.5 ? ease(t / 0.5) : 1;
  ctx.save(); ctx.globalAlpha = a;
  drawPetArt(ctx, cx, cy + 40 - Math.abs(Math.sin(time * 3)) * 16, item.look, { facing: 1, state: 'idle', t: time, scale: 3.4 * pop });
  ctx.restore();
  // タイトル
  ctx.save();
  ctx.globalAlpha = a;
  const sc = t < 0.45 ? 0.3 + ease(t / 0.45) * 0.9 : 1.2 - Math.min(0.2, (t - 0.45) * 0.4);
  ctx.translate(cx, 120); ctx.scale(sc, sc);
  ctx.font = `italic 900 76px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 14; ctx.strokeStyle = '#1a0630'; ctx.strokeText('PET GET!!', 0, 0);
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText('PET GET!!', 0, 0);
  ctx.fillStyle = rainbowGrad(ctx, -220, 0, 220, 0, time * 0.6);
  ctx.shadowColor = '#ff6ad5'; ctx.shadowBlur = 30;
  ctx.fillText('PET GET!!', 0, 0);
  ctx.restore();
  // 名前帯
  const by = cy + 120;
  ctx.save(); ctx.globalAlpha = a;
  const bw = 560;
  const bg = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  bg.addColorStop(0, 'rgba(20,6,50,0)'); bg.addColorStop(0.2, 'rgba(20,6,50,0.9)'); bg.addColorStop(0.8, 'rgba(20,6,50,0.9)'); bg.addColorStop(1, 'rgba(20,6,50,0)');
  ctx.fillStyle = bg; ctx.fillRect(cx - bw / 2, by - 34, bw, 86);
  ctx.fillStyle = rainbowGrad(ctx, cx - bw / 2, 0, cx + bw / 2, 0, time * 0.4);
  ctx.fillRect(cx - bw / 2 + 40, by - 34, bw - 80, 3); ctx.fillRect(cx - bw / 2 + 40, by + 49, bw - 80, 3);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = font(30, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(10,4,30,0.95)';
  ctx.strokeText(item.name || 'PET', cx, by - 8);
  ctx.fillStyle = rainbowGrad(ctx, cx - 160, 0, cx + 160, 0, -time * 0.4);
  ctx.fillText(item.name || 'PET', cx, by - 8);
  ctx.restore();
  const pr = item.pet?.pickRange;
  txt(ctx, `${pr ? `取得範囲 ${pr}px  ・  ` : ''}装備すると自動でアイテムを拾ってくれる！`, cx, by + 26, { size: 15, align: 'center', color: '#ffe3f7', alpha: a, sw: 4 });
  txt(ctx, 'インベントリ [I] の PET スロットに装備しよう', cx, by + 70, { size: 13, align: 'center', color: COL.gold, alpha: a * (0.6 + 0.4 * Math.sin(time * 4)), sw: 3 });
  // 紙吹雪
  ctx.save(); ctx.globalAlpha = a;
  for (let i = 0; i < 70; i++) {
    const seed = i * 97.13;
    const px = (Math.sin(seed) * 0.5 + 0.5) * W + Math.sin(time * 2 + i) * 20;
    const py = ((seed * 7.7 + t * (120 + (i % 7) * 30)) % (H + 40)) - 20;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(time * 3 + i);
    ctx.fillStyle = RAINBOW[i % RAINBOW.length];
    if (i % 3 === 0) { starPath(ctx, 0, 0, 7, 3, 5); ctx.fill(); } else ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
  ctx.restore();
}
