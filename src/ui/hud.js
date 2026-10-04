// HUD: 左下ステータス / 右上 所持金＋手配★ / 左上ミニマップ / 下中央スキルバー / 右クエストトラッカー
//      トースト / レアドロップバナー / レベルアップ演出 / 低HPビネット / 警官接近フラッシュ
import {
  COL, FONT, font, panel, inset, txt, bar, rrPath, starPath, fmtMoney, rgba, clamp, ease, rarityFill, measure,
  getClock, clockStr, clockPhase, drawPhaseIcon, PHASE_INFO, rainbowGrad, RAINBOW,
} from './theme.js';
import {
  guard, stats, expNeed, HERO_NAMES, skillDef, getItemDef, cooldown, skillMp, countItem,
  drawSkillIco, drawItemIco, rarityInfo, snsTitleOf, drawPetArt, drawEnemyArt, mapInfo, regionColor,
} from './deps.js';

const W = 1280, H = 720;
const hudState = new WeakMap();
function hs(game) {
  let s = hudState.get(game);
  if (!s) {
    s = { money: game.state?.money ?? 0, moneyShown: game.state?.money ?? 0, deltas: [], lastT: game.time || 0,
      hpGhost: 1, wanted: 0, wantedT: 0 };
    hudState.set(game, s);
  }
  return s;
}

// スキルバー/ポーションスロットの画面矩形（UI のドラッグ&ドロップでも使う）
export const SLOT = 50;
export function hudSlots() {
  const gap = 8, sep = 22;
  const total = SLOT * 6 + gap * 4 + sep;
  const x0 = Math.round(W / 2 - total / 2);
  const y = H - SLOT - 22;
  const out = [];
  let x = x0;
  for (let i = 0; i < 4; i++) { out.push({ kind: 'skill', i, x, y, w: SLOT, h: SLOT, key: 'ASDF'[i] }); x += SLOT + gap; }
  x += sep - gap;
  for (let i = 0; i < 2; i++) { out.push({ kind: 'potion', i, x, y, w: SLOT, h: SLOT, key: String(i + 1) }); x += SLOT + gap; }
  return out;
}

// main から直接呼んでも ui.draw() 経由でも良い（同一フレームで二重描画しないガード付き）
export function drawHUD(ctx, game, _internal = false) {
  if (!game || !game.state) return;
  const ui = game.ui;
  // 二重描画防止はフレーム番号（ui.frame）で判定する。時間窓だと HUD 描画が遅い端末で二重に描いてしまう
  if (ui) {
    const fr = ui.frame || 0;
    if (_internal) ui._hudIntFrame = fr;
    else {
      if (ui._hudIntFrame === fr) return; // このフレームは ui.draw が描いた
      ui._hudExtFrame = fr;
    }
  }
  const s = hs(game);
  const dt = clamp((game.time || 0) - s.lastT, 0, 0.1);
  s.lastT = game.time || 0;
  const parts = [
    ['vignette', drawVignette], ['copFlash', drawCopFlash], ['minimap', drawMinimap], ['status', drawStatus],
    ['skillbar', drawSkillBar], ['money', drawMoney], ['tracker', drawTracker], ['clock', drawClockBadge],
    ['radio', drawRadio], ['bookNew', drawBookToasts],
    ['levelUp', drawLevelUp], ['banner', drawBanner], ['toasts', drawToasts], ['petFx', drawPetFx],
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

// ---------- ミニマップ（左上） ----------
function drawMinimap(ctx, game) {
  const map = game.map;
  const x = 12, y = 12, w = 260, h = 150;
  panel(ctx, x, y, w, h, { r: 12, top: 'rgba(30,20,76,0.86)', bottom: 'rgba(14,9,40,0.86)', inner: 'rgba(25,211,197,0.45)' });
  // ヘッダー（マップ名）
  ctx.save();
  rrPath(ctx, x + 6, y + 6, w - 12, 22, 8);
  const hg = ctx.createLinearGradient(x, 0, x + w, 0);
  hg.addColorStop(0, 'rgba(255,95,162,0.85)'); hg.addColorStop(1, 'rgba(123,47,247,0.85)');
  ctx.fillStyle = hg; ctx.fill();
  ctx.restore();
  txt(ctx, '◆ ' + (map?.name || '???'), x + 14, y + 17.5, { size: 13, maxW: w - 30 });
  if (!map) return;
  const ix = x + 10, iy = y + 34, iw = w - 20, ih = h - 44;
  inset(ctx, ix, iy, iw, ih, { r: 6, fill: 'rgba(0,0,0,0.35)' });
  const mw = map.width || 2000, mh = map.height || 1200;
  const sc = Math.min(iw / mw, ih / mh);
  const ox = ix + (iw - mw * sc) / 2, oy = iy + (ih - mh * sc) / 2;
  const P = (wx, wy) => [ox + wx * sc, oy + wy * sc];
  ctx.save();
  ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  // カメラ視野
  if (game.cam) {
    const [cx, cy] = P(game.cam.x, game.cam.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, (game.W || W) * sc, (game.H || H) * sc);
  }
  // 地面
  ctx.lineCap = 'round';
  if (map.groundY != null) {
    const [gx, gy] = P(0, map.groundY);
    ctx.fillStyle = 'rgba(25,211,197,0.18)';
    ctx.fillRect(gx, gy, mw * sc, (mh - map.groundY) * sc);
    ctx.strokeStyle = COL.teal; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + mw * sc, gy); ctx.stroke();
  }
  // 足場
  ctx.strokeStyle = 'rgba(200,240,255,0.85)'; ctx.lineWidth = 2;
  for (const pf of map.platforms || []) {
    const [a, b] = P(pf.x, pf.y);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + pf.w * sc, b); ctx.stroke();
  }
  for (const wl of map.walls || []) {
    const [a, b] = P(wl.x, wl.y);
    ctx.fillStyle = 'rgba(200,240,255,0.35)';
    ctx.fillRect(a, b, wl.w * sc, wl.h * sc);
  }
  // ロープ
  ctx.strokeStyle = 'rgba(255,210,120,0.7)'; ctx.lineWidth = 1;
  for (const r of map.ropes || []) {
    const [a, b] = P(r.x, r.top); const [, c] = P(r.x, r.bottom);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, c); ctx.stroke();
  }
  const t = game.time || 0;
  // ポータル
  for (const po of map.portals || []) {
    const [a, b] = P(po.x, po.y - 30);
    ctx.fillStyle = 'rgba(127,233,255,0.35)';
    ctx.beginPath(); ctx.arc(a, b, 5 + Math.sin(t * 4) * 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7FE9FF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(a, b, 3.5, 0, Math.PI * 2); ctx.stroke();
  }
  const dot = (wx, wy, col, r = 2.6) => {
    const [a, b] = P(wx, wy - 20);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  };
  const npcs = (game.npcs && game.npcs.length ? game.npcs : map.npcs) || [];
  for (const n of npcs) dot(n.x, n.y ?? map.groundY ?? 0, '#5dff7a', 2.8);
  // 敵（警官はミニマップに出さない：画面端フラッシュで表現）
  for (const e of game.enemies || []) {
    if (!e || e.dead) continue;
    const d = e.def || {};
    if (d.isCop || d.ai === 'cop') continue;
    dot(e.x, e.y, d.boss ? '#ff2ea6' : '#ff4d4d', d.boss ? 4 : 2.3);
  }
  const pet = game.pet;
  if (pet && Number.isFinite(pet.x) && Number.isFinite(pet.y)) {
    const [a, b] = P(pet.x, pet.y - 20);
    ctx.fillStyle = '#ff6ad5';
    ctx.beginPath(); ctx.arc(a, b, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }
  const p = game.player;
  if (p) {
    const [a, b] = P(p.x, p.y - 20);
    const pr = 3.6 + Math.sin(t * 6) * 0.8;
    ctx.fillStyle = 'rgba(255,230,80,0.35)';
    ctx.beginPath(); ctx.arc(a, b, pr + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(a, b, pr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

// ---------- 左下ステータス ----------
function drawStatus(ctx, game, s, dt) {
  const st = game.state, cs = stats(game);
  const x = 12, y = H - 120, w = 372, h = 100;
  panel(ctx, x, y, w, h, { r: 16 });
  // Lv バッジ
  const bx = x + 46, by = y + 50;
  ctx.save();
  const g = ctx.createRadialGradient(bx - 8, by - 10, 4, bx, by, 36);
  g.addColorStop(0, '#ffe78a'); g.addColorStop(0.55, COL.orange); g.addColorStop(1, '#b8325e');
  ctx.beginPath(); ctx.arc(bx, by, 34, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.shadowColor = COL.pink; ctx.shadowBlur = 14; ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
  txt(ctx, 'Lv.', bx, by - 15, { size: 13, align: 'center', color: '#fff7d0' });
  txt(ctx, st.level ?? 1, bx, by + 8, { size: 28, align: 'center', sw: 5, stroke: '#5a1030' });
  // 名前
  const name = HERO_NAMES[st.heroId] || st.heroId || 'HERO';
  txt(ctx, name, x + 92, y + 20, { size: 17, color: '#fff' });
  const sub = st.heroId === 'jin' ? 'ストリートブロウラー' : st.heroId === 'luna' ? 'ストリートアイドル' : '';
  const title = snsTitleOf(st);
  const nx = x + 92 + measure(ctx, name, 17) + 10;
  if (title.name) {
    const tw = Math.min(w - (nx - x) - 14, measure(ctx, title.name, 11) + 34);
    ctx.save();
    rrPath(ctx, nx, y + 12, tw, 18, 9);
    ctx.fillStyle = 'rgba(10,4,30,0.75)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rainbowGrad(ctx, nx, 0, nx + tw, 0, (game.time || 0) * 0.15); ctx.stroke();
    ctx.restore();
    txt(ctx, 'NG', nx + 12, y + 21.5, { size: 8.5, align: 'center', color: COL.pink, sw: 2 });
    txt(ctx, title.name, nx + 22, y + 21.5, { size: 11, color: title.color || '#ffe3f7', sw: 2.5, maxW: tw - 28 });
  } else if (sub) txt(ctx, sub, nx, y + 21, { size: 11, color: COL.sub, sw: 3 });
  // バー
  const maxHp = Math.max(1, cs.maxHp || 1), maxMp = Math.max(1, cs.maxMp || 1);
  const hp = clamp(st.hp ?? maxHp, 0, maxHp), mp = clamp(st.mp ?? maxMp, 0, maxMp);
  const need = Math.max(1, expNeed(st.level || 1));
  const hr = hp / maxHp;
  s.hpGhost = s.hpGhost > hr ? Math.max(hr, s.hpGhost - dt * 0.5) : hr;
  const bx0 = x + 118, bw = w - 118 - 14;
  const rows = [
    ['HP', hr, COL.hp, COL.hp2, `${Math.ceil(hp)} / ${maxHp}`, s.hpGhost],
    ['MP', mp / maxMp, COL.mp, COL.mp2, `${Math.floor(mp)} / ${maxMp}`, null],
    ['EXP', (st.exp || 0) / need, COL.exp, COL.exp2, `${Math.floor(st.exp || 0)} / ${need}  (${((st.exp || 0) / need * 100).toFixed(1)}%)`, null],
  ];
  rows.forEach(([lab, r, c1, c2, val, ghost], i) => {
    const yy = y + 34 + i * 21;
    txt(ctx, lab, x + 92, yy + 8, { size: 12, color: c2, sw: 3 });
    bar(ctx, bx0, yy, bw, 16, r, c1, c2, { ghost });
    txt(ctx, val, bx0 + bw / 2, yy + 8.5, { size: 11.5, align: 'center', sw: 3 });
  });
  // 画面最下部の EXP ストリップ（メイプル風）
  const er = clamp((st.exp || 0) / need, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H - 6, W, 6);
  const eg = ctx.createLinearGradient(0, 0, W, 0);
  eg.addColorStop(0, COL.exp); eg.addColorStop(1, COL.orange);
  ctx.fillStyle = eg;
  ctx.fillRect(0, H - 6, W * er, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(0, H - 6, W * er, 2);
}

// ---------- 下中央スキルバー ----------
function drawSkillBar(ctx, game) {
  const st = game.state;
  const slots = hudSlots();
  const first = slots[0], last = slots[slots.length - 1];
  panel(ctx, first.x - 12, first.y - 12, last.x + last.w - first.x + 24, SLOT + 26, {
    r: 14, top: 'rgba(40,28,96,0.78)', bottom: 'rgba(16,10,44,0.82)', inner: 'rgba(255,95,162,0.4)',
  });
  const t = game.time || 0;
  for (const sl of slots) {
    inset(ctx, sl.x, sl.y, sl.w, sl.h, { r: 10, fill: 'rgba(5,3,22,0.7)', stroke: sl.kind === 'skill' ? 'rgba(25,211,197,0.6)' : 'rgba(255,95,162,0.6)' });
    const cx = sl.x + sl.w / 2, cy = sl.y + sl.h / 2;
    if (sl.kind === 'skill') {
      const id = st.skillBar?.[sl.i];
      const sk = skillDef(id);
      if (sk) {
        const lv = st.skills?.[id] || 0;
        drawSkillIco(ctx, sk, cx, cy, 42);
        const needMp = skillMp(sk, lv);
        const dark = lv <= 0 || (st.mp ?? 0) < needMp;
        if (dark) {
          rrPath(ctx, sl.x, sl.y, sl.w, sl.h, 10);
          ctx.fillStyle = 'rgba(10,10,40,0.62)'; ctx.fill();
          if (lv > 0) txt(ctx, 'MP', cx, cy + 12, { size: 10, align: 'center', color: COL.mp2, sw: 3 });
        }
        const cd = cooldown(id);
        if (cd && cd.left > 0 && cd.total > 0) {
          const r = clamp(cd.left / cd.total, 0, 1);
          ctx.save();
          rrPath(ctx, sl.x, sl.y, sl.w, sl.h, 10); ctx.clip();
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, sl.w, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r, false);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fill();
          ctx.restore();
          txt(ctx, cd.left >= 10 ? Math.ceil(cd.left) : cd.left.toFixed(1), cx, cy, { size: 16, align: 'center', color: '#fff' });
        }
      }
    } else {
      const id = st.potionBar?.[sl.i];
      const it = getItemDef(id);
      if (it) {
        const n = countItem(st, id);
        drawItemIco(ctx, it, cx, cy, 40);
        if (n <= 0) { rrPath(ctx, sl.x, sl.y, sl.w, sl.h, 10); ctx.fillStyle = 'rgba(10,10,40,0.6)'; ctx.fill(); }
        txt(ctx, n, sl.x + sl.w - 5, sl.y + sl.h - 9, { size: 13, align: 'right', color: n > 0 ? '#fff' : COL.bad });
      }
    }
    // キーラベル
    ctx.save();
    rrPath(ctx, sl.x - 3, sl.y - 5, 18, 16, 5);
    ctx.fillStyle = sl.kind === 'skill' ? COL.teal : COL.pink; ctx.fill();
    ctx.restore();
    txt(ctx, sl.key, sl.x + 6, sl.y + 3.5, { size: 11, align: 'center', sw: 2.5 });
  }
  if (game.map?.town) {
    const sk = slots.filter((s0) => s0.kind === 'skill');
    const a0 = sk[0], a1 = sk[sk.length - 1];
    ctx.save();
    rrPath(ctx, a0.x - 4, a0.y - 4, a1.x + a1.w - a0.x + 8, a0.h + 8, 12);
    ctx.fillStyle = 'rgba(8,6,24,0.66)'; ctx.fill();
    ctx.restore();
    // 斜線
    ctx.save();
    rrPath(ctx, a0.x - 4, a0.y - 4, a1.x + a1.w - a0.x + 8, a0.h + 8, 12); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 6;
    for (let i = -10; i < 30; i++) { ctx.beginPath(); ctx.moveTo(a0.x + i * 16, a0.y + 60); ctx.lineTo(a0.x + i * 16 + 60, a0.y - 10); ctx.stroke(); }
    ctx.restore();
    const mx = (a0.x + a1.x + a1.w) / 2;
    txt(ctx, '町ではスキル不可', mx, a0.y + a0.h / 2, { size: 14, align: 'center', color: '#ffd6e8', sw: 4, stroke: '#2a0b3d' });
  }
  void t;
}

// ---------- 右上 所持金＋手配度 ----------
function drawMoney(ctx, game, s, dt) {
  const money = game.state.money ?? 0;
  if (money !== s.money) {
    s.deltas.push({ v: money - s.money, t: 0 });
    if (s.deltas.length > 4) s.deltas.shift();
    s.money = money;
  }
  // カウントアップ
  const diff = money - s.moneyShown;
  if (Math.abs(diff) < 1) s.moneyShown = money;
  else s.moneyShown += diff * Math.min(1, dt * 8) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 30);
  const rx = W - 22, y = 40;
  const str = fmtMoney(s.moneyShown);
  ctx.save();
  ctx.font = `italic 900 34px ${FONT}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7; ctx.strokeStyle = COL.moneyShadow;
  ctx.strokeText(str, rx + 2, y + 3);
  ctx.strokeStyle = '#06200f'; ctx.lineWidth = 5;
  ctx.strokeText(str, rx, y);
  const mg = ctx.createLinearGradient(0, y - 16, 0, y + 16);
  mg.addColorStop(0, '#eaffef'); mg.addColorStop(0.5, COL.money); mg.addColorStop(1, '#2fcf68');
  ctx.fillStyle = mg;
  ctx.shadowColor = 'rgba(124,255,155,0.6)'; ctx.shadowBlur = 10;
  ctx.fillText(str, rx, y);
  ctx.restore();
  // 増減アニメ
  s.deltas.forEach((d, i) => {
    d.t += dt;
    const a = 1 - clamp((d.t - 1.0) / 0.6, 0, 1);
    if (a <= 0) return;
    const yy = y + 70 + i * 18 + Math.min(d.t, 1) * 4;
    txt(ctx, (d.v > 0 ? '+' : '-') + fmtMoney(Math.abs(d.v)), rx, yy, {
      size: 17, align: 'right', color: d.v > 0 ? COL.money : COL.bad, alpha: a, sw: 4, stroke: d.v > 0 ? COL.moneyShadow : '#3d0b14',
    });
  });
  s.deltas = s.deltas.filter((d) => d.t < 1.6);

  // 手配度★5
  const wanted = clamp(Math.round(game.wanted || 0), 0, 5);
  if (wanted !== s.wanted) { s.wanted = wanted; s.wantedT = game.time || 0; }
  const seen = wanted > 0 && copsNear(game);
  const town = !!game.map?.town;
  const decaying = wanted > 0 && game.map && !town;
  const t = game.time || 0;
  const since = t - s.wantedT;
  const sy = 80;
  const sz = 15, gap = 34;
  const sx0 = rx - 14 - gap * 4;
  ctx.save();
  rrPath(ctx, sx0 - 22, sy - 19, gap * 4 + 50, 38, 19);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
  if (wanted > 0 && town) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    ctx.lineWidth = 2.5; ctx.strokeStyle = Math.floor(t * 3) % 2 ? COL.copRed : COL.copBlue;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8 + pulse * 10; ctx.stroke();
  }
  ctx.restore();
  if (wanted > 0 && town) {
    txt(ctx, 'WANTED', sx0 - 32, sy, { size: 15, align: 'right', color: '#fff', glow: COL.copRed, sw: 4, stroke: '#3d0010', weight: 900 });
  }
  if (decaying) {
    txt(ctx, '手配度 減衰中…（フィールド）', rx, sy + 28, { size: 11.5, align: 'right', color: '#cfd8ff', sw: 3, alpha: 0.6 + 0.4 * Math.sin(t * 3) });
  }
  ctx.save();
  if (decaying) ctx.globalAlpha *= 0.5;
  for (let i = 0; i < 5; i++) {
    const cx = sx0 + i * gap, cy = sy;
    const on = i < wanted;
    ctx.save();
    let scale = 1;
    if (on && since < 0.6 && i === wanted - 1) scale = 1 + (1 - since / 0.6) * 0.8;
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    starPath(ctx, 0, 0, sz, sz * 0.45);
    if (on) {
      const blink = (Math.floor(t * 4) % 2 === 0) || !seen && Math.floor(t * 2) % 2 === 0;
      if (seen) {
        // 視認されている → 塗り★（点滅）
        ctx.fillStyle = blink ? COL.star : '#fff6d0';
        ctx.shadowColor = COL.star; ctx.shadowBlur = blink ? 16 : 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#7a4a00'; ctx.stroke();
      } else {
        // 捜索中 → 中抜き★（白縁のみ、ゆっくり点滅）
        ctx.fillStyle = 'rgba(255,201,60,0.12)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = blink ? '#ffffff' : 'rgba(255,255,255,0.45)';
        ctx.shadowColor = '#fff'; ctx.shadowBlur = blink ? 10 : 0;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------- 右側 クエストトラッカー ----------
function drawTracker(ctx, game) {
  const list = guard('missions.tracked', () => game.missions?.tracked?.(), []) || [];
  if (!list.length) return;
  const w = 290, x = W - w - 12;
  let y = 140;
  // 高さを計算
  const items = list.slice(0, 4).map((m) => ({ name: m.name || '', lines: (m.lines || []).slice(0, 4), done: !!(m.done || m.complete) }));
  const hgt = 34 + items.reduce((a, m) => a + 22 + m.lines.length * 19 + 6, 0);
  ctx.save();
  rrPath(ctx, x, y, w, hgt, 12);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(10,4,30,0.62)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,95,162,0.55)'; ctx.stroke();
  ctx.restore();
  ctx.save();
  rrPath(ctx, x + 8, y + 7, 92, 20, 10);
  ctx.fillStyle = COL.pink; ctx.fill();
  ctx.restore();
  txt(ctx, 'MISSION', x + 54, y + 17.5, { size: 12, align: 'center', sw: 3 });
  txt(ctx, '[J]', x + w - 12, y + 17.5, { size: 11, align: 'right', color: COL.dim, sw: 2.5 });
  y += 36;
  for (const m of items) {
    txt(ctx, (m.done ? '★ ' : '◆ ') + m.name, x + 12, y + 8, { size: 14, color: m.done ? '#c6ff6a' : COL.gold, maxW: w - 24 });
    y += 22;
    for (const l of m.lines) {
      const s0 = String(l);
      const done = /^[✔✓]/.test(s0) || /(\d+)\s*\/\s*\1(?!\d)$/.test(s0);
      const arrow = /^→/.test(s0);
      const body = s0.replace(/^[・✔✓]\s*/, '');
      txt(ctx, (arrow ? '' : done ? '✔ ' : '・') + body, x + 20, y + 8, { size: 12.5, color: arrow ? COL.gold : done ? '#c6ff6a' : '#f2efff', maxW: w - 32, sw: 3 });
      y += 19;
    }
    y += 6;
  }
}

// ---------- トースト（上中央） ----------
function drawToasts(ctx, game, s, dt) {
  const ui = game.ui;
  const list = ui?.toasts;
  if (!list || !list.length) return;
  let y = 96;
  for (const tt of list) {
    const a = clamp(tt.t / 0.2, 0, 1) * (1 - clamp((tt.t - tt.life + 0.5) / 0.5, 0, 1));
    if (a <= 0) continue;
    const tw = measure(ctx, tt.text, 16) + 44;
    const x = W / 2 - tw / 2;
    const yy = y - (1 - ease(tt.t / 0.25)) * 14;
    ctx.save();
    ctx.globalAlpha = a;
    rrPath(ctx, x, yy, tw, 32, 16);
    ctx.fillStyle = 'rgba(14,8,40,0.82)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = tt.color || COL.teal;
    ctx.shadowColor = tt.color || COL.teal; ctx.shadowBlur = 10; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = tt.color || COL.teal;
    ctx.beginPath(); ctx.arc(x + 17, yy + 16, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    txt(ctx, tt.text, x + 30, yy + 16.5, { size: 16, color: '#fff', alpha: a });
    y += 38;
  }
}

// ---------- レアドロップバナー ----------
function drawBanner(ctx, game) {
  const b = game.ui?.banners?.[0];
  if (!b) return;
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

// ---------- レベルアップ演出 ----------
function drawLevelUp(ctx, game) {
  const fx = game.ui?.levelFx;
  if (!fx) return;
  const t = fx.t, life = fx.life || 3;
  if (t > life) return;
  const a = clamp(t / 0.15, 0, 1) * (1 - clamp((t - life + 0.6) / 0.6, 0, 1));
  const pop = t < 0.35 ? 0.4 + ease(t / 0.35) * 0.8 : 1.2 - Math.min(0.2, (t - 0.35) * 0.6);
  const cx = W / 2, cy = 300;
  const time = game.time || 0;
  ctx.save();
  ctx.globalAlpha = a;
  // 放射光
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(time * 0.4);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    const gg = ctx.createLinearGradient(0, 0, 360, 0);
    gg.addColorStop(0, 'rgba(255,210,63,0.35)'); gg.addColorStop(1, 'rgba(255,95,162,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(360, -18); ctx.lineTo(360, 18); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.translate(cx, cy); ctx.scale(pop, pop);
  ctx.font = font(72, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12; ctx.strokeStyle = '#2A0B3D'; ctx.strokeText('LEVEL UP!', 0, 0);
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText('LEVEL UP!', 0, 0);
  const g = ctx.createLinearGradient(0, -34, 0, 34);
  g.addColorStop(0, '#fff7b0'); g.addColorStop(0.45, COL.gold); g.addColorStop(0.55, COL.orange); g.addColorStop(1, COL.pink);
  ctx.fillStyle = g; ctx.shadowColor = COL.pink; ctx.shadowBlur = 24;
  ctx.fillText('LEVEL UP!', 0, 0);
  ctx.restore();
  txt(ctx, `Lv.${fx.level}  到達！`, cx, cy + 60, { size: 28, align: 'center', color: '#fff', glow: COL.teal, alpha: a, sw: 5 });
  txt(ctx, 'SP +3   AP +5   HP/MP 全回復', cx, cy + 94, { size: 16, align: 'center', color: COL.gold, alpha: a });
  // SNS風ポップ（架空）
  if (t > 0.5) {
    const k = clamp((t - 0.5) / 0.3, 0, 1);
    const likes = (1.2 + (fx.level % 7) * 0.7).toFixed(1);
    ctx.save(); ctx.globalAlpha = a * k;
    const px = cx + 230, py = cy - 70 - k * 10;
    rrPath(ctx, px - 70, py - 18, 140, 36, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.restore();
    txt(ctx, `♥ ${likes}K  #ViceBay`, px, cy - 70 - k * 10 + 1, { size: 14, align: 'center', color: COL.pink, stroke: false, alpha: a * k });
  }
}

// ---------- 時計＋エリアバッジ（ミニマップ右） ----------
function drawClockBadge(ctx, game) {
  const x = 284, y = 12;
  const c = getClock(game);
  const t = game.time || 0;
  let bx = x, by = y;
  if (c != null) {
    const ph = clockPhase(c), info = PHASE_INFO[ph];
    const w = 168, h = 36;
    ctx.save();
    rrPath(ctx, bx, by, w, h, 18);
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(0, ph === 'night' ? 'rgba(20,24,80,0.88)' : ph === 'dusk' ? 'rgba(110,40,80,0.85)' : ph === 'dawn' ? 'rgba(110,60,110,0.85)' : 'rgba(40,70,140,0.82)');
    g.addColorStop(1, 'rgba(14,9,40,0.85)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(info.color, 0.8); ctx.stroke();
    ctx.restore();
    drawPhaseIcon(ctx, ph, bx + 20, by + h / 2, 8, t);
    ctx.save();
    ctx.font = `italic 900 18px ${FONT}`;
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,3,20,0.9)';
    const s0 = clockStr(c);
    ctx.strokeText(s0, bx + 38, by + h / 2 + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(s0, bx + 38, by + h / 2 + 1);
    ctx.restore();
    txt(ctx, info.name, bx + w - 12, by + h / 2 + 1, { size: 10, align: 'right', color: info.color, sw: 2.5 });
    by += h + 6;
  }
  const map = game.map;
  if (!map) return;
  if (map.town) {
    const w = 168, h = 26;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
    ctx.save();
    rrPath(ctx, bx, by, w, h, 13);
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(0, 'rgba(25,211,197,0.9)'); g.addColorStop(1, 'rgba(60,140,255,0.85)');
    ctx.fillStyle = g; ctx.shadowColor = COL.teal; ctx.shadowBlur = 6 + pulse * 8; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    // 盾
    ctx.save();
    ctx.translate(bx + 16, by + h / 2);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, -5); ctx.lineTo(6, 3); ctx.lineTo(0, 8); ctx.lineTo(-6, 3); ctx.lineTo(-7, -5); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    txt(ctx, 'SAFE ZONE / TOWN', bx + 30, by + h / 2 + 1, { size: 12, color: '#fff', sw: 3, stroke: '#063a4a', weight: 900 });
  } else if (map.levelRange || map.region) {
    const w = 168, h = 26;
    const col = regionColor(mapInfo(map.id).region);
    ctx.save();
    rrPath(ctx, bx, by, w, h, 13);
    ctx.fillStyle = 'rgba(14,9,40,0.82)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 0.9); ctx.stroke();
    ctx.restore();
    txt(ctx, 'FIELD', bx + 12, by + h / 2 + 1, { size: 11, color: col, sw: 3, weight: 900 });
    const lr = map.levelRange;
    if (lr) txt(ctx, `推奨 Lv${lr[0]}-${lr[1]}`, bx + w - 12, by + h / 2 + 1, { size: 12, align: 'right', color: (game.state.level || 1) < lr[0] ? COL.bad : '#fff', sw: 3 });
  }
}

// ---------- ラジオ局テロップ（上中央） ----------
function drawRadio(ctx, game) {
  const r = game.ui?.radio;
  if (!r || r.t > r.life) return;
  const a = clamp(r.t / 0.25, 0, 1) * (1 - clamp((r.t - r.life + 0.6) / 0.6, 0, 1));
  if (a <= 0) return;
  const cx = W / 2, cy = 50;
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
  let y = H - 150;
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
