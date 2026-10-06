// v5: ネオン・コアの窓（キー L・メニューのボタン）。docs/NEON_CORE.md
//  上: 持っているネオン・フラグメント・今のネオン適性・今のマップの必要な適性（足りないと赤）
//  左: 4 地域のコア（Lv・次の Lv に要る数・上げるボタン。地域のクエストを終えるまでは 🔒）
//  中: 能力アップ（%）の一覧と振るボタン・振り直し（お金）
//  右: 追加スキル（解放に要るコアの合計 Lv・覚える / 上げるボタン）。スキル窓の「ネオン」タブにも同じスキルが出る
import { COL, txt, inset, rrPath, rgba, clamp, wrap, fmtMoney } from './theme.js';
import { guard, getItemDef, drawItemIco, drawSkillIco } from './deps.js';
import { kindLabel } from './v3windows.js';
import { clampVitals } from '../systems/progression.js';
import {
  NEON_REGIONS, NEON_CORE_INFO, CORE_MAX, NEON_STATS, FRAGMENT_ID, resetCost,
  neonUnlocked, fragmentsDropping, coreUnlocked, coreLevel, coreCost, totalCoreLevel, fragmentCount, upgradeCore,
  neonPoints, addNeonStat, resetNeonStats, neonSkillsFor, neonSkillInfo, learnNeonSkill, neonForceOf, forceModsFor,
} from '../systems/neonCore.js';
import { MISSIONS, MISSION_NPCS } from '../data/missions.js';
import { audio } from '../audio/audio.js';

export const NEON_LAYOUT = {
  neoncore: { w: 1000, h: 620, title: 'ネオン・コア', key: 'L', y: 40 },
};
const sfx = (n) => guard('sfx', () => audio?.sfx?.(n));
const pct = (v) => `${Math.round(v * 1000) / 10}%`;

function after(ui, g, r, okCol) {
  ui.notify(r.msg, r.ok ? okCol : COL.bad);
  if (r.ok) { sfx('levelUp'); guard('clampVitals', () => clampVitals(g.state)); guard('save', () => g.requestSave?.()); } else sfx('error');
}

/** 光る玉（コア）。lv/max で外周の輪が埋まる */
function coreOrb(ctx, cx, cy, rad, col, lv, max, t, locked) {
  ctx.save();
  if (!locked) {
    const gl = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad * 1.7);
    gl.addColorStop(0, rgba(col, 0.55 + 0.1 * Math.sin(t * 3))); gl.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, rad * 1.7, 0, Math.PI * 2); ctx.fill();
  }
  const g = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, 1, cx, cy, rad);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, locked ? '#77738f' : col); g.addColorStop(1, locked ? '#2a2640' : rgba(col, 0.55));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
  // Lv の輪
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, rad + 6, 0, Math.PI * 2); ctx.stroke();
  if (lv > 0) { ctx.strokeStyle = lv >= max ? COL.gold : col; ctx.beginPath(); ctx.arc(cx, cy, rad + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lv / max); ctx.stroke(); }
  ctx.restore();
}

function lockedView(ctx, x, y, w, h, st, t) {
  const q = MISSIONS.nc_01_awaken;
  const npc = q ? MISSION_NPCS[q.giver] : null;
  coreOrb(ctx, x + w / 2, y + h / 2 - 70, 42, '#19f0ff', 0, CORE_MAX, t, true);
  txt(ctx, 'ネオン・コアはまだ目覚めていない', x + w / 2, y + h / 2 + 4, { size: 20, align: 'center', color: '#fff' });
  const lines = [
    `クエスト「${q?.name || '光の壁'}」を終えると開く（${npc?.name || '記録係イオ'}・アーク・シティ / Lv${q?.reqLevel || 110}〜）`,
    fragmentsDropping(st) ? 'いまはネオン・フラグメントが第2ワールドの敵から落ちる（通常の敵 1%・ボスは確実に）' : 'クエストを受けると、第2ワールドの敵がネオン・フラグメントを落とすようになる',
  ];
  lines.forEach((l, i) => txt(ctx, l, x + w / 2, y + h / 2 + 36 + i * 24, { size: 13, align: 'center', color: i ? COL.dim : COL.sub, weight: 700, sw: 2.5, maxW: w - 60 }));
}

function drawNeonCore(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  // ---- 上: フラグメント・適性
  const frag = guard('frag', () => fragmentCount(st), 0);
  const F = guard('force', () => neonForceOf(st), 0);
  const fm = guard('fm', () => forceModsFor(g), { dealt: 1, taken: 1, F, R: 0 });
  inset(ctx, x + 16, y + 44, w - 32, 50, { r: 12, fill: 'rgba(25,240,255,0.08)', stroke: 'rgba(25,240,255,0.45)' });
  const it = getItemDef(FRAGMENT_ID);
  if (it) drawItemIco(ctx, it, x + 42, y + 69, 30);
  txt(ctx, 'ネオン・フラグメント', x + 64, y + 60, { size: 12, color: COL.sub, sw: 2.5 });
  txt(ctx, `× ${frag.toLocaleString('en-US')}`, x + 64, y + 80, { size: 18, color: '#fff' });
  txt(ctx, 'ネオン適性', x + 330, y + 60, { size: 12, color: COL.sub, sw: 2.5 });
  txt(ctx, String(F), x + 330, y + 81, { size: 22, color: '#9ef7ff', glow: '#19f0ff', glowBlur: 8 });
  const mapTxt = g.map?.worldId === 2 ? (fm.R > 0 ? `このマップの必要な適性 ${fm.R}` : 'このマップは適性いらず') : '第2ワールドの外（適性は関係ない）';
  const short = fm.R > 0 && F < fm.R;
  txt(ctx, mapTxt, x + 520, y + 60, { size: 12, color: short ? COL.bad : COL.sub, sw: 2.5 });
  if (fm.R > 0) txt(ctx, `与えるダメージ ×${fm.dealt}  受けるダメージ ×${fm.taken}`, x + 520, y + 81, { size: 14, color: short ? COL.bad : COL.good });
  txt(ctx, `コアの合計 Lv ${guard('tot', () => totalCoreLevel(st), 0)} / ${CORE_MAX * NEON_REGIONS.length}`, x + w - 30, y + 69, { size: 13, align: 'right', color: COL.gold });

  const by = y + 104, bh = h - 104 - 16;
  if (!guard('unlocked', () => neonUnlocked(st), false)) { inset(ctx, x + 16, by, w - 32, bh, { r: 12 }); lockedView(ctx, x + 16, by, w - 32, bh, st, t); return; }

  // ---- 左: 地域のコア
  const cx0 = x + 16, cw = 400;
  inset(ctx, cx0, by, cw, bh, { r: 12 });
  txt(ctx, '◆ 地域のコア', cx0 + 12, by + 18, { size: 14, color: COL.teal });
  txt(ctx, '1 Lv: 適性 +10・ポイント +1・主ステ +5', cx0 + cw - 12, by + 18, { size: 10.5, align: 'right', color: COL.dim, sw: 2, weight: 700 });
  NEON_REGIONS.forEach((rg, i) => {
    const info = NEON_CORE_INFO[rg];
    const r = { x: cx0 + 8, y: by + 34 + i * 112, w: cw - 16, h: 104 };
    const open = guard('cu', () => coreUnlocked(st, rg), false);
    const lv = guard('cl', () => coreLevel(st, rg), 0);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: open ? rgba(info.color, 0.1) : 'rgba(6,4,24,0.6)', stroke: open ? rgba(info.color, 0.6) : undefined });
    coreOrb(ctx, r.x + 44, r.y + 50, 24, info.color, lv, CORE_MAX, t + i, !open);
    txt(ctx, open ? `Lv${lv}` : '🔒', r.x + 44, r.y + 51, { size: open ? 14 : 16, align: 'center', color: '#fff', stroke: open });
    txt(ctx, info.name, r.x + 90, r.y + 20, { size: 16, color: open ? info.color : COL.dim });
    txt(ctx, info.region, r.x + 90, r.y + 40, { size: 11, color: COL.sub, sw: 2.5, weight: 700 });
    // Lv のバー
    const bx = r.x + 90, bw = r.w - 90 - 160, byy = r.y + 56;
    ctx.save(); rrPath(ctx, bx, byy, bw, 10, 5); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); ctx.restore();
    if (lv > 0) { ctx.save(); rrPath(ctx, bx, byy, Math.max(10, bw * lv / CORE_MAX), 10, 5); ctx.fillStyle = lv >= CORE_MAX ? COL.gold : info.color; ctx.fill(); ctx.restore(); }
    txt(ctx, `${lv} / ${CORE_MAX}`, bx + bw + 8, byy + 5.5, { size: 11.5, color: lv >= CORE_MAX ? COL.gold : COL.sub, sw: 2.5 });
    if (!open) {
      const q = MISSIONS[info.quest];
      txt(ctx, `クエスト「${q?.name?.replace(/^【[^】]*】/, '') || info.quest}」で解放（Lv${q?.reqLevel || '?'}〜）`, bx, r.y + 86, { size: 11, color: COL.dim, sw: 2.5, weight: 700, maxW: r.w - 100 });
      return;
    }
    const cost = coreCost(lv);
    const max = lv >= CORE_MAX;
    txt(ctx, max ? '最大 Lv' : `次の Lv: フラグメント ${cost} 個`, bx, r.y + 86, { size: 12, color: max ? COL.gold : frag >= cost ? '#fff' : COL.bad, sw: 2.5 });
    ui.btn(ctx, win, 'core:' + rg, { x: r.x + r.w - 100, y: r.y + 18, w: 90, h: 34 }, max ? 'MAX' : '強化', () => {
      after(ui, g, upgradeCore(st, rg), info.color);
    }, { disabled: max || frag < cost, color: COL.orange, size: 15 });
  });

  // ---- 中: 能力アップ
  const sx = cx0 + cw + 10, sw = 300;
  inset(ctx, sx, by, sw, bh, { r: 12 });
  const P = guard('pts', () => neonPoints(st), { total: 0, used: 0, free: 0 });
  txt(ctx, '◆ 能力アップ', sx + 12, by + 18, { size: 14, color: COL.pink });
  ctx.save(); rrPath(ctx, sx + sw - 128, by + 6, 116, 24, 12); ctx.fillStyle = P.free > 0 ? 'rgba(255,212,71,0.25)' : 'rgba(0,0,0,0.4)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = COL.gold; ctx.stroke(); ctx.restore();
  txt(ctx, `ポイント ${P.free} / ${P.total}`, sx + sw - 70, by + 18.5, { size: 12.5, align: 'center', color: COL.gold, glow: P.free > 0 ? COL.gold : null });
  NEON_STATS.forEach((s, i) => {
    const r = { x: sx + 8, y: by + 36 + i * 50, w: sw - 16, h: 44 };
    const lv = st.neonCore?.stats?.[s.key] || 0;
    const hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 9, fill: hov ? 'rgba(123,47,247,0.3)' : 'rgba(6,4,24,0.55)' });
    ctx.save(); ctx.fillStyle = s.color; rrPath(ctx, r.x + 6, r.y + 8, 4, r.h - 16, 2); ctx.fill(); ctx.restore();
    txt(ctx, s.name, r.x + 18, r.y + 14, { size: 13.5, color: '#fff' });
    txt(ctx, `+${pct(lv * s.per)}`, r.x + 18, r.y + 32, { size: 12, color: lv > 0 ? s.color : COL.dim, sw: 2.5 });
    txt(ctx, `Lv ${lv}/${s.max}`, r.x + r.w - 52, r.y + r.h / 2, { size: 12.5, align: 'right', color: lv >= s.max ? COL.gold : COL.sub });
    // 小さなバー
    const bx = r.x + 110, bw = r.w - 110 - 120;
    if (bw > 20) {
      ctx.save(); rrPath(ctx, bx, r.y + 28, bw, 6, 3); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.restore();
      if (lv > 0) { ctx.save(); rrPath(ctx, bx, r.y + 28, Math.max(6, bw * lv / s.max), 6, 3); ctx.fillStyle = s.color; ctx.fill(); ctx.restore(); }
    }
    ui.btn(ctx, win, 'stat:' + s.key, { x: r.x + r.w - 42, y: r.y + 6, w: 34, h: 32 }, '+', () => after(ui, g, addNeonStat(st, s.key), s.color),
      { disabled: P.free <= 0 || lv >= s.max, color: COL.orange, size: 20 });
    if (hov) ui.setTip({ lines: [{ t: s.name, c: s.color, size: 15 }, { t: `1 Lv ごとに +${pct(s.per)}（最大 +${pct(s.per * s.max)}）`, c: COL.sub, size: 12 }], border: s.color });
  });
  const rc = resetCost(P.used);
  ui.btn(ctx, win, 'statReset', { x: sx + 8, y: by + bh - 44, w: sw - 16, h: 36 }, `振り直し  ${fmtMoney ? fmtMoney(rc) : '$' + rc}`, () => {
    if (!win.confirmReset) { win.confirmReset = t; ui.notify(`もう一度押すと振り直す（$${rc.toLocaleString('en-US')}）`, COL.gold); return; }
    win.confirmReset = null;
    after(ui, g, resetNeonStats(st), COL.gold);
  }, { disabled: P.used <= 0 || (st.money || 0) < rc, color: win.confirmReset && t - win.confirmReset < 4 ? '#d93f86' : COL.purple, size: 13 });
  if (win.confirmReset && t - win.confirmReset >= 4) win.confirmReset = null;

  // ---- 右: 追加スキル
  const kx = sx + sw + 10, kw = x + w - 16 - kx;
  inset(ctx, kx, by, kw, bh, { r: 12 });
  txt(ctx, '◆ 追加スキル', kx + 12, by + 18, { size: 14, color: COL.gold });
  const list = guard('nsk', () => neonSkillsFor(st), []) || [];
  if (!list.length) txt(ctx, '1次転職すると系統のスキルが出る', kx + kw / 2, by + 80, { size: 12, align: 'center', color: COL.dim });
  list.forEach((sk, i) => {
    const info = neonSkillInfo(st, sk.id);
    const r = { x: kx + 8, y: by + 32 + i * 88, w: kw - 16, h: 82 };
    const hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: info.lv > 0 ? rgba(sk.color, 0.12) : hov ? 'rgba(123,47,247,0.3)' : 'rgba(6,4,24,0.55)', stroke: info.lv > 0 ? rgba(sk.color, 0.6) : undefined });
    ctx.save(); if (!info.open) ctx.globalAlpha = 0.4; drawSkillIco(ctx, sk, r.x + 26, r.y + 28, 36); ctx.restore();
    if (!info.open) txt(ctx, '🔒', r.x + 38, r.y + 40, { size: 12, align: 'center', stroke: false });
    txt(ctx, sk.name, r.x + 52, r.y + 16, { size: 14, color: info.open ? '#fff' : COL.dim, maxW: r.w - 120 });
    txt(ctx, `${kindLabel(sk)}${sk.reqJob ? '' : '・共通'}`, r.x + 52, r.y + 35, { size: 10.5, color: sk.kind === 'passive' ? COL.gold : COL.teal, sw: 2.5 });
    txt(ctx, `Lv ${info.lv}/${info.max}`, r.x + r.w - 10, r.y + 16, { size: 12.5, align: 'right', color: info.lv >= info.max ? COL.gold : '#fff' });
    const sub = !info.open ? `コアの合計 Lv${info.need} で解放` : info.lv >= info.max ? '最大 Lv' : `${info.lv ? '次の Lv' : '覚える'}: フラグメント ${info.cost} 個`;
    txt(ctx, sub, r.x + 10, r.y + 63, { size: 11.5, color: !info.open ? COL.bad : info.lv >= info.max ? COL.gold : frag >= info.cost ? COL.sub : COL.bad, sw: 2.5, weight: 700, maxW: r.w - 100 });
    ui.btn(ctx, win, 'nsk:' + sk.id, { x: r.x + r.w - 82, y: r.y + 47, w: 74, h: 30 }, info.lv ? '上げる' : '覚える', () => {
      after(ui, g, learnNeonSkill(st, sk.id), sk.color);
    }, { disabled: !info.can, color: COL.orange, size: 13 });
    if (hov) {
      const lines = [{ t: sk.name, c: sk.color, size: 15 }];
      for (const ln of wrap(ctx, sk.desc || '', 300, 12, 700).slice(0, 4)) lines.push({ t: ln, c: COL.sub, size: 12 });
      if (info.reason && info.open) lines.push({ t: info.reason, c: COL.bad, size: 12 });
      ui.setTip({ lines, border: sk.color });
    }
  });
  txt(ctx, 'スキル窓（K）の「ネオン」タブからスキルバーに登録できる', kx + kw / 2, by + bh - 14, { size: 10.5, align: 'center', color: COL.dim, sw: 2, weight: 700, maxW: kw - 16 });
  void clamp;
}

export const NEON_WINDOWS = { neoncore: drawNeonCore };
