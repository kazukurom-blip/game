// v3 ウィンドウ: 転職 / ネオン・チューン / ハックチップ / コンテンツ(U) / 実績(O) / 設定 / メニュー(Esc) / 操作説明
// ＋ 右クリックメニュー（popup）・スキルの動きプレビュー
import {
  COL, FONT, font, txt, inset, panel, rrPath, wrap, fmtMoney, rgba, clamp, ease, measure, STAT_LABELS, SLOT_LABELS, starPath, inRect, RAINBOW, rainbowGrad,
} from './theme.js';
import {
  guard, getItemDef, rarityInfo, drawChar, drawItemIco, drawSkillIco, equipLooks, skillDef, missionDef, enemyDef, drawEnemyArt, mapInfo, allEnemies,
} from './deps.js';
import {
  V3, call, has, val, jobOffer, acceptJob, JOBS, MISSION_NPCS, charLook, charName, currentJob, classOf, branchInfo,
  loadSettings, saveSettings, applySettings, DEFAULT_SETTINGS, BAR_KEYS,
} from './v3deps.js';
import { audio } from '../audio/audio.js';

const W = 1280, H = 720;
export const V3_LAYOUT = {
  jobOffer: { w: 1000, h: 590, title: '転職 — 職業を選ぶ' },
  tune: { w: 900, h: 590, title: 'ネオン・チューン（★強化）', y: 40 },
  potential: { w: 960, h: 600, title: 'ハックチップ（潜在能力）', y: 36 },
  content: { w: 980, h: 600, title: 'コンテンツ', key: 'U', y: 40 },
  achieve: { w: 920, h: 600, title: '実績・称号', key: 'O', y: 40 },
  settings: { w: 600, h: 520, title: '設定' },
  menu: { w: 420, h: 520, title: 'メニュー', key: 'Esc' },
  help: { w: 860, h: 560, title: '操作説明' },
};
const KIND = { melee: '近接', projectile: '遠距離', aoe: '範囲', buff: 'バフ', dash: 'ダッシュ', passive: 'パッシブ', move: '移動' };
const MOVE_NAME = { flashJump: 'フラッシュジャンプ', teleport: 'テレポート', rush: 'ラッシュ', glide: 'グライド', wheelDash: 'ホイールダッシュ' };
export function kindLabel(sk) {
  if (!sk) return '';
  if (sk.kind === 'move') return '移動・' + (MOVE_NAME[sk.move?.type] || '移動');
  if (sk.kind === 'passive' && sk.enhances) return 'パッシブ・強化';
  if (sk.kind === 'passive' && (sk.finalAttack || /FA|ファイナル/.test(sk.desc || ''))) return 'パッシブ・FA';
  return KIND[sk.kind] || sk.kind || '';
}
function fmtStat(k, v) {
  if (typeof v !== 'number') return String(v);
  if (['crit', 'critDmg', 'dmgReduce', 'speedPct', 'attackSpeedPct'].includes(k) || (Math.abs(v) < 1 && v !== 0 && k !== 'atk')) return `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`;
  return `${v > 0 ? '+' : ''}${Math.round(v)}`;
}
const LBL = { ...STAT_LABELS, dmgReduce: 'ダメージ軽減', allStat: '全ステータス', bossDmg: 'ボスダメージ', ignoreDef: '防御無視' };
function statChips(ctx, stats, x, y, maxW, o = {}) {
  let cx = x, cy = y;
  for (const [k, v] of Object.entries(stats || {})) {
    if (!v) continue;
    const s = `${LBL[k] || k} ${fmtStat(k, v)}`;
    const w = measure(ctx, s, o.size || 11) + 16;
    if (cx + w > x + maxW) { cx = x; cy += 22; }
    ctx.save(); rrPath(ctx, cx, cy - 9, w, 19, 9.5); ctx.fillStyle = rgba(o.color || COL.teal, 0.22); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(o.color || COL.teal, 0.7); ctx.stroke(); ctx.restore();
    txt(ctx, s, cx + w / 2, cy + 0.5, { size: o.size || 11, align: 'center', color: '#fff', sw: 2.5 });
    cx += w + 6;
  }
  return cy + 22;
}
function tabBar(ui, ctx, win, x, y, labels, tw = 110, onTab) {
  labels.forEach((lab, i) => {
    const r = { x: x + i * (tw + 6), y, w: tw, h: 30 };
    const on = (win.tab || 0) === i, hov = ui.hover(win, r);
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 10);
    if (on) {
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, COL.pink); g.addColorStop(1, COL.purple);
      ctx.fillStyle = g; ctx.shadowColor = COL.pink; ctx.shadowBlur = 10;
    } else ctx.fillStyle = hov ? 'rgba(123,47,247,0.55)' : 'rgba(10,6,30,0.55)';
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff' : 'rgba(200,180,255,0.5)'; ctx.stroke();
    ctx.restore();
    txt(ctx, lab, r.x + r.w / 2, r.y + 16, { size: 14, align: 'center', color: on ? '#fff' : COL.sub, maxW: tw - 10 });
    ui.hit(win, 'tab' + i, r, { onClick: () => { win.tab = i; win.sel = null; win.page = 0; win.sub = null; onTab?.(i); } });
  });
}
function pager(ui, ctx, win, x, y, pages, key = 'page') {
  if (pages <= 1) return;
  win[key] = clamp(win[key] || 0, 0, pages - 1);
  ui.btn(ctx, win, key + 'L', { x, y, w: 30, h: 26 }, '◀', () => { win[key] = Math.max(0, win[key] - 1); }, { disabled: win[key] <= 0, size: 12, color: COL.purple });
  txt(ctx, `${win[key] + 1}/${pages}`, x + 56, y + 13, { size: 13, align: 'center' });
  ui.btn(ctx, win, key + 'R', { x: x + 82, y, w: 30, h: 26 }, '▶', () => { win[key] = Math.min(pages - 1, win[key] + 1); }, { disabled: win[key] >= pages - 1, size: 12, color: COL.purple });
}
function stageBg(ctx, x, y, w, h, col) {
  ctx.save();
  rrPath(ctx, x, y, w, h, 12);
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, rgba(col, 0.45)); bg.addColorStop(0.6, 'rgba(50,20,100,0.55)'); bg.addColorStop(1, 'rgba(8,4,26,0.85)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.clip();
  const fy = y + h - Math.min(34, h * 0.2);
  ctx.strokeStyle = rgba(col, 0.32); ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const yy = fy + i * i * 3 + i * 4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(x + w / 2 + i * 12, fy); ctx.lineTo(x + w / 2 + i * 46, y + h); ctx.stroke(); }
  ctx.restore();
  ctx.save(); rrPath(ctx, x, y, w, h, 12); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke(); ctx.restore();
  return fy;
}
function auraGlow(ctx, x, y, col, s, t) {
  if (!col) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 40 * s, 4, x, y - 40 * s, 62 * s);
  g.addColorStop(0, rgba(col, 0.42 + 0.12 * Math.sin(t * 4))); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 40 * s, 44 * s, 66 * s, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const k = ((t * 0.7 + i / 8) % 1);
    ctx.fillStyle = rgba(col, 0.8 * (1 - k));
    ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.3 + t) * 26 * s, y - k * 90 * s, 2.2 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 28 * s + Math.sin(t * 5) * 2, 7 * s, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function sfx(name, o) { guard('sfx', () => audio?.sfx?.(name, o)); }

// ======================= 右クリックメニュー =======================
export function drawPopup(ui, ctx, pop) {
  const items = pop.items || [];
  if (!items.length) return;
  const w = Math.max(170, ...items.map((it) => measure(ctx, it.label, 14) + 36)), rh = 32;
  const h = items.length * rh + 12;
  const x = clamp(pop.x, 4, W - w - 4), y = clamp(pop.y, 4, H - h - 4);
  const k = ease(pop.t / 0.12);
  ctx.globalAlpha = 0.4 + 0.6 * k;
  panel(ctx, x, y, w, h, { r: 10, top: 'rgba(30,18,70,0.97)', bottom: 'rgba(14,8,36,0.97)', glow: 'rgba(255,95,162,0.5)', inner: false });
  const m = ui.mouse();
  items.forEach((it, i) => {
    const r = { x: x + 6, y: y + 6 + i * rh, w: w - 12, h: rh - 2 };
    const hov = inRect(m.x, m.y, r) && !it.disabled;
    if (hov) { ctx.save(); rrPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fillStyle = 'rgba(255,95,162,0.45)'; ctx.fill(); ctx.restore(); }
    txt(ctx, it.label, r.x + 12, r.y + r.h / 2 + 1, { size: 14, color: it.disabled ? COL.dim : (it.color || '#fff'), sw: 3 });
    if (!it.disabled) ui._hits.push({ id: '__popup:' + i, win: '__popup', r, onClick: it.fn });
  });
}

// ======================= 転職ウィンドウ =======================
function drawJobOffer(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  win.x = Math.round((W - win.w) / 2); win.y = Math.round((H - win.h) / 2);
  const { x, y, w, h } = win;
  const t = g.time || 0;
  const offer = jobOffer(st);
  const cur = currentJob(st);
  if (!offer) {
    txt(ctx, '今は転職できません', x + w / 2, y + h / 2 - 20, { size: 20, align: 'center', color: COL.sub });
    txt(ctx, `現在の職: ${cur.name}`, x + w / 2, y + h / 2 + 14, { size: 14, align: 'center', color: COL.dim });
    return;
  }
  txt(ctx, `${offer.tier}次転職  ・  Lv.${offer.reqLevel || ''} 到達！`, x + 24, y + 62, { size: 20, color: COL.gold, glow: COL.orange });
  txt(ctx, `現在: ${cur.name}  →  職業を選んで転職ミッションを受注しよう`, x + 24, y + 88, { size: 13, color: COL.sub, sw: 3 });
  if (offer.active) {
    const m = missionDef(offer.active);
    ctx.save(); rrPath(ctx, x + w - 360, y + 50, 336, 46, 12); ctx.fillStyle = 'rgba(25,211,197,0.2)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = COL.teal; ctx.stroke(); ctx.restore();
    txt(ctx, '受注中: ' + (m?.name || offer.active), x + w - 344, y + 66, { size: 13, color: '#fff', maxW: 310 });
    txt(ctx, 'ミッション窓 [J] で進捗とナビを確認できます', x + w - 344, y + 85, { size: 11, color: COL.sub, sw: 2.5, maxW: 310 });
  }
  const opts = offer.options || [];
  const n = Math.max(1, opts.length), gap = 16;
  const cw = Math.min(470, (w - 40 - gap * (n - 1)) / n);
  const x0 = x + (w - (cw * n + gap * (n - 1))) / 2;
  opts.forEach((jid, i) => {
    const J = JOBS[jid];
    if (!J) return;
    const col = J.aura || COL.pink;
    const r = { x: x0 + i * (cw + gap), y: y + 108, w: cw, h: h - 124 };
    const hov = ui.hover(win, r);
    panel(ctx, r.x, r.y - (hov ? 3 : 0), r.w, r.h, { r: 16, glow: hov ? rgba(col, 0.8) : rgba(col, 0.35), stroke: hov ? '#fff' : 'rgba(255,255,255,0.7)', inner: rgba(col, 0.7), top: 'rgba(52,30,110,0.95)' });
    const ry = r.y - (hov ? 3 : 0);
    // プレビュー
    const sw2 = 170;
    const fy = stageBg(ctx, r.x + 12, ry + 12, sw2, 196, col);
    auraGlow(ctx, r.x + 12 + sw2 / 2, fy, col, 1.7, t + i);
    drawChar(ctx, r.x + 12 + sw2 / 2, fy, charLook(st), equipLooks(st), { facing: 1, state: Math.floor(t * 0.7 + i) % 3 === 2 ? 'attack' : 'idle', t: t + i, attackT: (t * 0.7 + i) % 1, damage: 0, scale: 1.7, aura: col });
    // 名前など
    const tx = r.x + sw2 + 26, tw = r.w - sw2 - 38;
    txt(ctx, J.name, tx, ry + 30, { size: 22, color: '#fff', glow: col, sw: 5, maxW: tw });
    const B = branchInfo(J.branch);
    if (B) {
      const bw = Math.min(tw, measure(ctx, B.name, 11) + 18);
      ctx.save(); rrPath(ctx, tx, ry + 46, bw, 19, 9.5); ctx.fillStyle = rgba(B.color || col, 0.35); ctx.fill(); ctx.restore();
      txt(ctx, B.name, tx + bw / 2, ry + 56, { size: 11, align: 'center', color: '#fff', sw: 2.5 });
    }
    txt(ctx, `称号: ${J.title || J.name}`, tx, ry + 80, { size: 11.5, color: COL.gold, sw: 2.5, maxW: tw });
    let yy = ry + 102;
    for (const l of wrap(ctx, J.desc || '', tw, 12, 700).slice(0, 4)) { txt(ctx, l, tx, yy, { size: 12, weight: 700, sw: 2.5, color: '#efeaff' }); yy += 17; }
    yy = ry + 176;
    txt(ctx, '◆ ボーナス（永続）', tx, yy, { size: 12, color: COL.teal }); yy += 20;
    statChips(ctx, { ...(J.statBonus || {}) }, tx, yy, tw, { color: col, size: 10.5 });
    // スキル
    let sy = ry + 226;
    txt(ctx, '◆ 獲得スキル', r.x + 16, sy, { size: 13, color: COL.pink }); sy += 14;
    (J.skills || []).slice(0, 4).forEach((sid, k) => {
      const sk = skillDef(sid);
      if (!sk) return;
      const rr = { x: r.x + 12, y: sy + k * 44, w: r.w - 24, h: 40 };
      const sh = ui.hover(win, rr);
      inset(ctx, rr.x, rr.y, rr.w, rr.h, { r: 9, fill: sh ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.5)' });
      drawSkillIco(ctx, sk, rr.x + 22, rr.y + 20, 32);
      txt(ctx, sk.name, rr.x + 44, rr.y + 13, { size: 13.5, color: '#fff', maxW: rr.w - 140 });
      txt(ctx, kindLabel(sk), rr.x + rr.w - 10, rr.y + 13, { size: 10.5, align: 'right', color: sk.kind === 'passive' ? COL.gold : COL.teal, sw: 2.5 });
      txt(ctx, sk.desc || '', rr.x + 44, rr.y + 29, { size: 10.5, color: COL.sub, maxW: rr.w - 54, sw: 2, weight: 700 });
      if (sh) ui.setTip({ lines: [{ t: sk.name, c: sk.color || COL.teal, size: 16 }, { t: kindLabel(sk), c: COL.sub, size: 12 }, { sep: true }, { t: sk.desc || '', c: '#fff', size: 12.5, wrap: true }], border: col });
    });
    // 試練
    const M = missionDef(J.mission || 'job_' + jid);
    const npc = MISSION_NPCS[J.instructor];
    const by = r.y + r.h - 64 - (hov ? 3 : 0);
    const trial = (M?.objectives || []).slice(1).map((o) => o.text).join(' / ');
    txt(ctx, `教官: ${npc?.name || '???'}（${mapInfo(npc?.mapId || '').name || '?'}）`, r.x + 16, by - 30, { size: 11.5, color: COL.sub, sw: 2.5, maxW: r.w - 32 });
    if (trial) txt(ctx, `試練: ${trial}`, r.x + 16, by - 12, { size: 11, color: '#ffd6e8', sw: 2.5, maxW: r.w - 32, weight: 700 });
    const isAct = offer.active && offer.active === (J.mission || 'job_' + jid);
    ui.btn(ctx, win, 'accept:' + jid, { x: r.x + 16, y: by, w: r.w - 32, h: 46 }, isAct ? '✔ 受注中' : offer.active ? '他の転職ミッションを受注中' : '★ この職で受注する', () => {
      const res = acceptJob(g, jid);
      ui.notify(res.msg || (res.ok ? '受注した' : '受注できませんでした'), res.ok ? col : COL.bad);
      if (res.ok) { ui.close('jobOffer'); if (res.missionId) guard('track', () => { st.trackedMission = res.missionId; }); }
    }, { color: isAct ? '#109f95' : '#d93f86', size: 17, disabled: !!offer.active });
  });
}

// ======================= 装備リスト（強化・潜在で共通） =======================
function gearList(st, filter) {
  const out = [];
  const eqI = st.equippedInst || {};
  for (const [slot, id] of Object.entries(st.equipped || {})) {
    if (!id || slot === 'pet') continue;
    const inst = eqI[slot] || { id };
    const it = getItemDef(inst.id || id);
    if (!it || (filter && !filter(it))) continue;
    out.push({ key: 'eq:' + slot, ref: inst.uid ? { uid: inst.uid } : { slot }, inst, it, equipped: true, slot });
  }
  (st.inventory || []).forEach((s, i) => {
    const it = s && getItemDef(s.id);
    if (!it || !it.slot || it.slot === 'pet' || (filter && !filter(it))) return;
    out.push({ key: s.uid ? 'u:' + s.uid : 'i:' + i, ref: s.uid ? { uid: s.uid } : { index: i }, inst: s, it, equipped: false });
  });
  return out;
}
function refKey(ref) { return ref?.uid ? 'u:' + ref.uid : ref?.slot ? 'eq:' + ref.slot : ref?.index != null ? 'i:' + ref.index : ''; }
function drawGearList(ui, ctx, win, x, y, w, h, list, onPick) {
  const RH = 46, PER = Math.max(1, Math.floor((h - 34) / RH));
  const pages = Math.max(1, Math.ceil(list.length / PER));
  win.gpage = clamp(win.gpage || 0, 0, pages - 1);
  inset(ctx, x, y, w, h, { r: 12 });
  if (!list.length) txt(ctx, '対象の装備がありません', x + w / 2, y + 60, { size: 13, align: 'center', color: COL.dim });
  const selKey = refKey(win.data?.ref);
  list.slice(win.gpage * PER, win.gpage * PER + PER).forEach((e, k) => {
    const r = { x: x + 6, y: y + 6 + k * RH, w: w - 12, h: RH - 4 };
    const on = e.key === selKey || (e.inst?.uid && e.inst.uid === win.data?.ref?.uid);
    const hov = ui.hover(win, r);
    const info = rarityInfo(e.it.rarity);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 9, fill: on ? 'rgba(255,95,162,0.32)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.5)', stroke: on ? '#fff' : rgba(info.color, 0.5), lw: on ? 2 : 1.2 });
    drawItemIco(ctx, e.it, r.x + 21, r.y + r.h / 2, 32);
    const star = e.inst?.star || 0;
    txt(ctx, e.it.name, r.x + 42, r.y + 13, { size: 12.5, color: info.color, maxW: r.w - 50 });
    const sub = `${e.equipped ? '装備中・' : ''}${SLOT_LABELS[e.it.slot] || ''}${star ? `  ★${star}` : ''}${e.inst?.pot?.grade ? `  [${potGradeName(e.inst.pot.grade)}]` : ''}`;
    txt(ctx, sub, r.x + 42, r.y + 30, { size: 10.5, color: e.equipped ? COL.teal : COL.sub, sw: 2.5, maxW: r.w - 50, weight: 700 });
    ui.hit(win, 'g:' + e.key, r, { onClick: () => { onPick(e); } });
  });
  pager(ui, ctx, win, x + w / 2 - 56, y + h - 30, pages, 'gpage');
}
function potGradeName(g) { return val('potential', 'POT_GRADE_INFO')?.[g]?.name || { rare: 'レア', epic: 'エピック', legendary: 'レジェンダリ', mythic: 'ミシック' }[g] || g; }
function potGradeCol(g) { return val('potential', 'POT_GRADE_INFO')?.[g]?.color || { rare: '#4da6ff', epic: '#b04dff', legendary: '#ffb800', mythic: '#ff3d7f' }[g] || '#cfc8ff'; }
function pickDefaultRef(win, list) {
  if (!win.data) win.data = {};
  if (win.data.ref && list.some((e) => e.key === refKey(win.data.ref) || (e.inst?.uid && e.inst.uid === win.data.ref.uid))) return;
  win.data.ref = list[0]?.ref || null;
}
function notReady(ctx, x, y, w, h, name) {
  txt(ctx, `${name} は準備中です`, x + w / 2, y + h / 2 - 12, { size: 18, align: 'center', color: COL.sub });
  txt(ctx, '（システム実装待ち）', x + w / 2, y + h / 2 + 16, { size: 13, align: 'center', color: COL.dim });
}
function sparkleBurst(ctx, cx, cy, k, col) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + k * 0.6;
    const d = 20 + ease(k) * 90;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = i % 2 ? '#fff' : col;
    starPath(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 7 * (1 - k * 0.5), 2.5, 4, a); ctx.fill();
  }
  ctx.globalAlpha = 0.5 * (1 - k);
  ctx.strokeStyle = col; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, 30 + k * 80, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function sadFx(ctx, cx, cy, k) {
  ctx.save();
  ctx.globalAlpha = 1 - clamp((k - 0.7) / 0.3, 0, 1);
  // しょんぼり顔
  const y = cy - 10 + k * 8;
  ctx.fillStyle = 'rgba(120,140,200,0.85)';
  ctx.beginPath(); ctx.arc(cx, y, 24, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.strokeStyle = '#1a1440'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 12, y - 6); ctx.lineTo(cx - 5, y - 3); ctx.moveTo(cx + 12, y - 6); ctx.lineTo(cx + 5, y - 3); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, y + 12, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  // 涙
  ctx.fillStyle = '#7fe9ff';
  ctx.beginPath(); ctx.ellipse(cx - 10, y + 2 + (k * 24) % 12, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
  // 雨雲
  ctx.fillStyle = 'rgba(160,170,200,0.7)';
  ctx.beginPath(); ctx.arc(cx - 16, y - 40, 11, 0, Math.PI * 2); ctx.arc(cx, y - 46, 14, 0, Math.PI * 2); ctx.arc(cx + 16, y - 40, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(127,233,255,0.8)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) { const yy = y - 30 + ((k * 60 + i * 9) % 20); ctx.beginPath(); ctx.moveTo(cx - 15 + i * 10, yy); ctx.lineTo(cx - 17 + i * 10, yy + 6); ctx.stroke(); }
  ctx.restore();
}

// ======================= ネオン・チューン =======================
function drawTune(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const t = g.time || 0;
  if (!has('tune', 'tuneInfo')) { notReady(ctx, x, y, w, h, 'ネオン・チューン'); return; }
  const list = gearList(st, (it) => it.slot && it.slot !== 'pet');
  pickDefaultRef(win, list);
  drawGearList(ui, ctx, win, x + 16, y + 46, 250, h - 62, list, (e) => { win.data.ref = e.ref; win.fx = null; });
  const ref = win.data?.ref;
  const info = ref ? call('tune', 'tuneInfo', [st, ref], null) : null;
  const cx = x + 282, cw = 360;
  if (!info || !info.ok) { txt(ctx, info?.reason || '装備を選んでください', cx + cw / 2, y + 200, { size: 15, align: 'center', color: COL.dim }); drawTuneTable(ui, ctx, win, x + w - 266, y + 46, 250, h - 62, null); return; }
  const it = info.item || getItemDef(info.uid);
  const rinfo = rarityInfo(it?.rarity);
  // アイテム表示
  const iy = y + 50;
  inset(ctx, cx, iy, cw, 150, { r: 12, fill: 'rgba(6,4,24,0.55)' });
  const icx = cx + 60, icy = iy + 62;
  ctx.save();
  const rg = ctx.createRadialGradient(icx, icy, 4, icx, icy, 56);
  rg.addColorStop(0, rgba(rinfo.color, 0.55)); rg.addColorStop(1, rgba(rinfo.color, 0));
  ctx.fillStyle = rg; ctx.fillRect(icx - 60, icy - 60, 120, 120);
  ctx.restore();
  const shake = win.fx && !win.fx.success && win.fx.t < 0.4 ? Math.sin(win.fx.t * 60) * 4 * (1 - win.fx.t / 0.4) : 0;
  drawItemIco(ctx, it, icx + shake, icy, 70);
  txt(ctx, info.label || it?.name || '', cx + 118, iy + 26, { size: 16, color: rinfo.color, maxW: cw - 130 });
  txt(ctx, `★ ${info.star} / ${info.maxStar}`, cx + 118, iy + 52, { size: 22, color: COL.star, glow: info.star >= 15 ? COL.star : null, sw: 4 });
  // ★列
  const maxS = info.maxStar || 0;
  for (let i = 0; i < maxS; i++) {
    const sx = cx + 118 + (i % 13) * 18, sy = iy + 82 + Math.floor(i / 13) * 20;
    const on = i < info.star;
    const nextS = i === info.star;
    ctx.save();
    starPath(ctx, sx + 7, sy, 7.5, 3.4);
    ctx.fillStyle = on ? (i >= 15 ? '#ff9ad5' : COL.star) : nextS ? `rgba(255,201,60,${0.25 + 0.25 * Math.sin(t * 6)})` : 'rgba(255,255,255,0.12)';
    if (on && i >= 15) { ctx.shadowColor = '#ff6ad5'; ctx.shadowBlur = 8; }
    ctx.fill();
    ctx.restore();
    if ((i + 1) % 5 === 0 && (i % 13) !== 12) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(sx + 16, sy - 7, 1, 14); }
  }
  // 確率・天井・費用・期待回数（常時表示）
  const by = iy + 162;
  inset(ctx, cx, by, cw, 168, { r: 12 });
  const rate = info.rate || 0;
  txt(ctx, '成功率', cx + 16, by + 22, { size: 13, color: COL.sub });
  txt(ctx, info.guaranteed ? '100%（天井確定！）' : `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`, cx + cw - 16, by + 22, { size: 22, align: 'right', color: info.guaranteed ? COL.gold : rate >= 0.5 ? COL.good : rate >= 0.2 ? '#ffd23f' : COL.bad, glow: info.guaranteed ? COL.gold : null });
  // 天井ゲージ
  txt(ctx, '天井', cx + 16, by + 54, { size: 13, color: COL.sub });
  const pm = Math.max(1, info.pityMax || 1), pv = clamp((info.pity || 0) / pm, 0, 1);
  const gx = cx + 64, gw = cw - 80;
  ctx.save(); rrPath(ctx, gx, by + 46, gw, 16, 8); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.restore();
  ctx.save(); rrPath(ctx, gx, by + 46, Math.max(16, gw * pv), 16, 8);
  const pg = ctx.createLinearGradient(gx, 0, gx + gw, 0); pg.addColorStop(0, COL.teal); pg.addColorStop(1, COL.gold);
  ctx.fillStyle = pg; ctx.fill(); ctx.restore();
  txt(ctx, `${info.pity || 0} / ${info.pityMax || '-'}   あと ${info.pityLeft ?? Math.max(0, (info.pityMax || 0) - (info.pity || 0))} 回で確定成功`, gx + gw / 2, by + 54.5, { size: 11, align: 'center', sw: 2.5 });
  txt(ctx, '費用', cx + 16, by + 86, { size: 13, color: COL.sub });
  txt(ctx, fmtMoney(info.cost || 0) + (info.discount ? `  (−${info.discount}% サンデー・ネオン)` : ''), cx + cw - 16, by + 86, { size: 16, align: 'right', color: (st.money || 0) >= (info.cost || 0) ? COL.money : COL.bad, stroke: COL.moneyShadow, sw: 3 });
  txt(ctx, '期待回数', cx + 16, by + 114, { size: 13, color: COL.sub });
  txt(ctx, info.expected ? `約 ${info.expected.toFixed(1)} 回（約 ${fmtMoney((info.expected || 0) * (info.cost || 0))}）` : '—', cx + cw - 16, by + 114, { size: 13.5, align: 'right', color: '#fff' });
  txt(ctx, '次の★で', cx + 16, by + 144, { size: 13, color: COL.sub });
  const ns = Object.entries(info.nextStats || {}).filter(([, v]) => v).map(([k, v]) => `${LBL[k] || k} ${fmtStat(k, v)}`).join('  ');
  txt(ctx, ns || '—', cx + cw - 16, by + 144, { size: 12.5, align: 'right', color: COL.good, maxW: cw - 100 });
  // ボタン
  const bty = by + 180;
  if ((info.ticket || 0) > 0) {
    const on = !!win.useTicket;
    ui.btn(ctx, win, 'ticket', { x: cx, y: bty, w: cw, h: 28 }, `${on ? '☑' : '☐'} チューン・チケットを使う（確定成功・所持 ${info.ticket}）`, () => { win.useTicket = !win.useTicket; }, { color: on ? '#c98a1a' : COL.purple, size: 12.5 });
  }
  const can = info.canTune !== false && info.star < info.maxStar;
  ui.btn(ctx, win, 'doTune', { x: cx, y: bty + 34, w: cw, h: 52 }, info.star >= info.maxStar ? '最大★です' : `★ チューン！（${fmtMoney(info.cost || 0)}）`, () => {
    const r = call('tune', 'tuneItem', [g, ref, { ticket: !!win.useTicket }], null);
    if (!r) return;
    if (!r.ok) { ui.notify(r.msg || 'チューンできません', COL.bad); sfx('deny'); return; }
    win.fx = { success: r.success, t: 0, star: r.star, guaranteed: r.guaranteed };
    (win.log ||= []).unshift({ ok: r.success, star: r.star, msg: r.msg, name: it?.name });
    if (win.log.length > 8) win.log.pop();
    if (r.success) win.useTicket = false;
    ui.notify(r.msg, r.success ? COL.gold : COL.sub);
  }, { color: '#d93f86', size: 18, disabled: !can });
  if (info.reason && !can && info.star < info.maxStar) txt(ctx, info.reason, cx + cw / 2, bty + 98, { size: 12, align: 'center', color: COL.bad });
  txt(ctx, '※ 装備は壊れません・失敗しても★は下がりません', cx + cw / 2, bty + 104, { size: 11, align: 'center', color: COL.dim, sw: 2.5 });
  // 演出
  if (win.fx) {
    win.fx.t += Math.min(0.05, g.dt || 1 / 60);
    const k = clamp(win.fx.t / 1.1, 0, 1);
    if (win.fx.success) {
      sparkleBurst(ctx, icx, icy, k, COL.star);
      txt(ctx, win.fx.guaranteed ? '天井確定 SUCCESS!' : 'SUCCESS!', icx + 120, icy - 4 - k * 14, { size: 26, align: 'center', color: COL.gold, glow: COL.orange, alpha: 1 - clamp((k - 0.75) / 0.25, 0, 1), sw: 5 });
      txt(ctx, `★${win.fx.star}`, icx + 120, icy + 24 - k * 14, { size: 18, align: 'center', color: '#fff', alpha: 1 - clamp((k - 0.75) / 0.25, 0, 1) });
    } else {
      sadFx(ctx, icx + 120, icy + 4, k);
      txt(ctx, 'FAIL…', icx + 190, icy - 16, { size: 20, align: 'center', color: '#9fb4ff', alpha: 1 - clamp((k - 0.75) / 0.25, 0, 1), sw: 4 });
    }
    if (win.fx.t > 1.2) win.fx = null;
  }
  drawTuneTable(ui, ctx, win, x + w - 266, y + 46, 250, h - 62 - 150, info);
  // 試行ログ
  const ly = y + h - 160;
  inset(ctx, x + w - 266, ly, 250, 144, { r: 12 });
  txt(ctx, '◆ 試行ログ', x + w - 254, ly + 16, { size: 12.5, color: COL.teal });
  const ts = st.tuneStats;
  if (ts) txt(ctx, `累計 ${ts.tries}回 成功${ts.success}`, x + w - 28, ly + 16, { size: 10.5, align: 'right', color: COL.dim, sw: 2.5 });
  (win.log || []).slice(0, 6).forEach((l, i) => {
    txt(ctx, `${l.ok ? '✔ 成功' : '✖ 失敗'}  ★${l.star}  ${l.name || ''}`, x + w - 254, ly + 38 + i * 17, { size: 11, color: l.ok ? COL.gold : COL.sub, sw: 2.5, maxW: 226, weight: 700 });
  });
  if (!(win.log || []).length) txt(ctx, 'まだ試行していません', x + w - 254, ly + 40, { size: 11, color: COL.dim, sw: 2.5 });
}
function drawTuneTable(ui, ctx, win, x, y, w, h, info) {
  inset(ctx, x, y, w, h, { r: 12 });
  txt(ctx, '◆ 確率表（全公開）', x + 12, y + 16, { size: 12.5, color: COL.gold });
  const tbl = info?.table || call('tune', 'tuneRateTable', [], []) || [];
  const cur = info?.star ?? 0;
  const RH = 17;
  const rows = Math.max(1, Math.floor((h - 50) / RH));
  const start = clamp(cur - 2, 0, Math.max(0, tbl.length - rows));
  txt(ctx, '★', x + 18, y + 36, { size: 10.5, color: COL.dim, sw: 2 });
  txt(ctx, '成功率', x + 110, y + 36, { size: 10.5, align: 'right', color: COL.dim, sw: 2 });
  txt(ctx, '天井', x + 160, y + 36, { size: 10.5, align: 'right', color: COL.dim, sw: 2 });
  txt(ctx, '期待', x + w - 14, y + 36, { size: 10.5, align: 'right', color: COL.dim, sw: 2 });
  tbl.slice(start, start + rows).forEach((r, i) => {
    const yy = y + 54 + i * RH;
    const on = r.star === cur;
    if (on) { ctx.save(); rrPath(ctx, x + 6, yy - 8, w - 12, RH, 6); ctx.fillStyle = 'rgba(255,212,71,0.22)'; ctx.fill(); ctx.restore(); }
    const c = on ? '#fff' : COL.sub;
    txt(ctx, `${r.star}→${r.to}`, x + 14, yy, { size: 11, color: c, sw: 2.5 });
    txt(ctx, `${(r.rate * 100).toFixed(r.rate < 0.1 ? 1 : 0)}%`, x + 110, yy, { size: 11, align: 'right', color: c, sw: 2.5 });
    txt(ctx, `${r.pity}回`, x + 160, yy, { size: 11, align: 'right', color: c, sw: 2.5 });
    txt(ctx, r.expected ? r.expected.toFixed(1) : '-', x + w - 14, yy, { size: 11, align: 'right', color: c, sw: 2.5 });
  });
}

// ======================= ハックチップ（潜在） =======================
function drawPotential(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const t = g.time || 0;
  if (!has('potential', 'potInfo')) { notReady(ctx, x, y, w, h, 'ハックチップ'); return; }
  const canPot = (it) => guard('canHavePotential', () => (has('potential', 'canHavePotential') ? V3.potential.canHavePotential(it) : !!it.slot && it.slot !== 'pet'), false);
  const list = gearList(st, canPot);
  pickDefaultRef(win, list);
  drawGearList(ui, ctx, win, x + 16, y + 46, 250, h - 62, list, (e) => { win.data.ref = e.ref; win.fx = null; });
  const ref = win.data?.ref;
  const info = ref ? call('potential', 'potInfo', [st, ref], null) : null;
  const cx = x + 282, cw = 400;
  drawPotTable(ctx, x + w - 266, y + 46, 250, 250, info);
  drawPotLog(ctx, st, x + w - 266, y + 306, 250, h - 322);
  if (!info) { txt(ctx, '装備を選んでください', cx + cw / 2, y + 200, { size: 15, align: 'center', color: COL.dim }); return; }
  const it = info.item;
  const gc = potGradeCol(info.grade);
  // ヘッダー
  inset(ctx, cx, y + 50, cw, 84, { r: 12 });
  drawItemIco(ctx, it, cx + 42, y + 92, 56);
  txt(ctx, info.label || it?.name || '', cx + 82, y + 72, { size: 15, color: rarityInfo(it?.rarity).color, maxW: cw - 96 });
  const gn = info.grade ? potGradeName(info.grade) : '潜在なし';
  const gw = measure(ctx, gn, 13) + 26;
  ctx.save(); rrPath(ctx, cx + 82, y + 88, gw, 24, 12);
  ctx.fillStyle = info.grade === 'mythic' ? rainbowGrad(ctx, cx + 82, 0, cx + 82 + gw, 0, t * 0.3) : rgba(gc, 0.85); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  txt(ctx, gn, cx + 82 + gw / 2, y + 100.5, { size: 13, align: 'center', sw: 3 });
  txt(ctx, `チップ ${info.chips?.reroll ?? 0}  ・  ロック ${info.chips?.lock ?? 0}`, cx + cw - 14, y + 100, { size: 11.5, align: 'right', color: COL.sub, sw: 2.5 });
  // 天井・等級アップ率
  const py = y + 144;
  inset(ctx, cx, py, cw, 64, { r: 12 });
  if (info.nextGrade) {
    txt(ctx, `等級アップ → ${potGradeName(info.nextGrade)}  ${(info.upRate * 100).toFixed(info.upRate < 0.01 ? 1 : 0)}%`, cx + 14, py + 18, { size: 13, color: potGradeCol(info.nextGrade) });
    txt(ctx, `期待 約${(info.expected || 0).toFixed(1)}回`, cx + cw - 14, py + 18, { size: 12, align: 'right', color: COL.sub, sw: 2.5 });
    const pm = Math.max(1, info.pityMax || 1), pv = clamp((info.pity || 0) / pm, 0, 1);
    ctx.save(); rrPath(ctx, cx + 14, py + 34, cw - 28, 18, 9); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.restore();
    ctx.save(); rrPath(ctx, cx + 14, py + 34, Math.max(18, (cw - 28) * pv), 18, 9);
    const pg = ctx.createLinearGradient(cx, 0, cx + cw, 0); pg.addColorStop(0, gc); pg.addColorStop(1, potGradeCol(info.nextGrade));
    ctx.fillStyle = pg; ctx.fill(); ctx.restore();
    txt(ctx, `天井 ${info.pity || 0} / ${info.pityMax}（あと ${info.pityLeft} 回で確定）`, cx + cw / 2, py + 43.5, { size: 11.5, align: 'center', sw: 2.5 });
  } else txt(ctx, info.grade ? '最高等級です（オプションの再設定のみ）' : 'チップを使うとレア等級の潜在が付きます', cx + cw / 2, py + 32, { size: 13, align: 'center', color: COL.sub });
  // オプション行（現在 / 結果）
  const pend = info.pending;
  const ly = py + 76;
  const colW = pend ? (cw - 10) / 2 : cw;
  const drawLines = (lx, lw, title, grade, lines, o = {}) => {
    inset(ctx, lx, ly, lw, 150, { r: 12, fill: o.hl ? 'rgba(255,212,71,0.12)' : undefined, stroke: o.hl ? COL.gold : undefined });
    txt(ctx, title, lx + 12, ly + 16, { size: 12.5, color: o.hl ? COL.gold : COL.teal });
    if (grade) txt(ctx, potGradeName(grade), lx + lw - 12, ly + 16, { size: 12, align: 'right', color: potGradeCol(grade) });
    (lines || []).forEach((l, i) => {
      const r = { x: lx + 8, y: ly + 30 + i * 38, w: lw - 16, h: 34 };
      const lc = potGradeCol(l.grade || grade);
      inset(ctx, r.x, r.y, r.w, r.h, { r: 8, fill: 'rgba(6,4,24,0.6)', stroke: rgba(lc, 0.6) });
      txt(ctx, l.text || (V3.potential?.potLineText?.(l)) || `${l.stat} +${l.value}`, r.x + 10, r.y + r.h / 2 + 1, { size: 13, color: lc, maxW: r.w - (o.locks ? 50 : 16) });
      if (o.locks) {
        const lk = !!info.locks?.[i];
        const lr = { x: r.x + r.w - 36, y: r.y + 4, w: 30, h: 26 };
        ui.btn(ctx, win, 'lock' + i, lr, lk ? '🔒' : '🔓', () => {
          const res = call('potential', 'lockLine', [g, ref, i, !lk], null);
          if (res) ui.notify(res.msg, res.ok ? COL.teal : COL.bad);
        }, { color: lk ? '#c98a1a' : COL.purple, size: 13 });
      }
    });
    if (!(lines || []).length) txt(ctx, '—', lx + lw / 2, ly + 80, { size: 14, align: 'center', color: COL.dim });
  };
  drawLines(cx, colW, pend ? 'いまの潜在' : '潜在オプション', info.grade, info.lines, { locks: !pend && !!info.grade });
  if (pend) drawLines(cx + colW + 10, colW, '新しい結果', pend.grade, pend.lines, { hl: true });
  // ボタン
  const by = ly + 162;
  if (pend) {
    ui.btn(ctx, win, 'keep', { x: cx, y: by, w: colW, h: 46 }, '◀ 元のまま（破棄）', () => {
      const r = call('potential', 'applyChipResult', [g, ref, false], null); if (r) ui.notify(r.msg, COL.sub);
    }, { color: COL.purple, size: 15 });
    ui.btn(ctx, win, 'apply', { x: cx + colW + 10, y: by, w: colW, h: 46 }, '採用する ▶', () => {
      const r = call('potential', 'applyChipResult', [g, ref, true], null); if (r) ui.notify(r.msg, COL.gold);
    }, { color: '#d93f86', size: 16 });
  } else {
    const nLock = (info.locks || []).filter(Boolean).length;
    ui.btn(ctx, win, 'useChip', { x: cx, y: by, w: cw, h: 50 }, `◆ リロール・チップを使う${nLock ? `（ロック ${info.lockCost}個）` : ''}`, () => {
      const r = call('potential', 'useChip', [g, ref], null);
      if (!r) return;
      if (!r.ok) { ui.notify(r.msg, COL.bad); sfx('deny'); return; }
      win.fx = { t: 0, gradeUp: r.gradeUp, grade: r.after?.grade };
      if (r.gradeUp) ui.notify(r.msg, potGradeCol(r.after?.grade));
    }, { color: '#109f95', size: 16, disabled: (info.chips?.reroll ?? 0) <= 0 });
    txt(ctx, (info.chips?.reroll ?? 0) <= 0 ? 'リロール・チップは敵ドロップ・ショップ・ボス報酬・ログインボーナスで入手' : '結果を見てから「採用 / 破棄」を選べます。🔓 で行ロック', cx + cw / 2, by + 64, { size: 11, align: 'center', color: COL.dim, sw: 2.5, maxW: cw });
  }
  if (win.fx) {
    win.fx.t += Math.min(0.05, g.dt || 1 / 60);
    const k = clamp(win.fx.t / 1.4, 0, 1);
    if (win.fx.gradeUp) {
      sparkleBurst(ctx, cx + cw / 2, ly + 70, k, potGradeCol(win.fx.grade));
      txt(ctx, 'GRADE UP!', cx + cw / 2, ly + 70 - k * 16, { size: 34, align: 'center', color: '#fff', glow: potGradeCol(win.fx.grade), glowBlur: 22, alpha: 1 - clamp((k - 0.7) / 0.3, 0, 1), sw: 6 });
    } else {
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - k); ctx.fillStyle = '#19d3c5'; ctx.fillRect(cx + colW + 10, ly, colW, 150 * (1 - k)); ctx.restore();
    }
    if (win.fx.t > 1.5) win.fx = null;
  }
}
function drawPotTable(ctx, x, y, w, h, info) {
  inset(ctx, x, y, w, h, { r: 12 });
  txt(ctx, '◆ 確率表（全公開）', x + 12, y + 16, { size: 12.5, color: COL.gold });
  const R = val('potential', 'POT_RATES');
  const up = info?.rates?.upgrade || (Array.isArray(R?.upgrade) ? R.upgrade : Object.entries(R?.upgrade || {}).map(([from, u]) => ({ from, to: u.to, p: u.p, pity: u.pity, expected: (1 - Math.pow(1 - u.p, u.pity)) / u.p })));
  txt(ctx, '等級アップ', x + 12, y + 40, { size: 11, color: COL.dim, sw: 2 });
  up.forEach((u, i) => {
    const yy = y + 60 + i * 34;
    const on = info?.grade === u.from;
    if (on) { ctx.save(); rrPath(ctx, x + 6, yy - 10, w - 12, 30, 6); ctx.fillStyle = 'rgba(255,212,71,0.18)'; ctx.fill(); ctx.restore(); }
    txt(ctx, `${potGradeName(u.from)} → ${potGradeName(u.to)}`, x + 14, yy, { size: 11.5, color: potGradeCol(u.to), sw: 2.5 });
    txt(ctx, `${(u.p * 100).toFixed(u.p < 0.01 ? 1 : 0)}%`, x + w - 14, yy, { size: 12, align: 'right', color: '#fff', sw: 2.5 });
    txt(ctx, `天井 ${u.pity}回  期待 ${u.expected ? u.expected.toFixed(1) : '-'}回`, x + 22, yy + 15, { size: 10, color: COL.sub, sw: 2 });
  });
  const yy = y + 60 + up.length * 34 + 4;
  const same = R?.sameGradeLine;
  if (same != null) txt(ctx, `2・3行目が同等級: ${Math.round(same * 100)}%`, x + 12, yy, { size: 11, color: COL.sub, sw: 2.5 });
  const lc = R?.lockCost;
  if (lc) txt(ctx, `行ロック: 1行=${lc[1]}個 / 2行=${lc[2]}個`, x + 12, yy + 18, { size: 11, color: COL.sub, sw: 2.5 });
  if (R?.dropChance != null) txt(ctx, `ドロップ時に潜在: ${(R.dropChance * 100).toFixed(1)}%`, x + 12, yy + 36, { size: 11, color: COL.sub, sw: 2.5 });
}
function drawPotLog(ctx, st, x, y, w, h) {
  inset(ctx, x, y, w, h, { r: 12 });
  txt(ctx, '◆ 試行ログ', x + 12, y + 16, { size: 12.5, color: COL.teal });
  const L = call('potential', 'potLog', [st], null);
  const s = L?.stats;
  if (s) txt(ctx, `累計 ${s.tries || 0}回 UP${s.gradeUps || 0}`, x + w - 12, y + 16, { size: 10.5, align: 'right', color: COL.dim, sw: 2.5 });
  const ent = (L?.entries || []).slice(0, Math.floor((h - 34) / 34));
  ent.forEach((e, i) => {
    const yy = y + 36 + i * 34;
    txt(ctx, `${e.gradeUp ? '⬆ ' : ''}${potGradeName(e.grade)}  ${getItemDef(e.itemId)?.name || ''}`, x + 12, yy, { size: 11, color: e.gradeUp ? COL.gold : potGradeCol(e.grade), sw: 2.5, maxW: w - 24 });
    txt(ctx, (e.lines || []).join(' / '), x + 18, yy + 15, { size: 9.5, color: COL.sub, sw: 2, maxW: w - 30, weight: 700 });
  });
  if (!ent.length) txt(ctx, 'まだ試行していません', x + 12, y + 40, { size: 11, color: COL.dim, sw: 2.5 });
}

// ======================= コンテンツ（U） =======================
function fn(mod, names) { for (const n of names) if (has(mod, n)) return (...a) => call(mod, n, a, null); return null; }
const CTABS = ['タワー', 'アリーナ', 'ボス', 'ログボ', 'プリセット', '共有倉庫'];
function drawContent(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  tabBar(ui, ctx, win, x + 16, y + 46, CTABS, 116, () => guard('sfx', () => sfx('tab')));
  const bx = x + 16, by = y + 86, bw = w - 32, bh = h - 102;
  const tab = win.tab || 0;
  if (tab === 0) drawTowerTab(ui, ctx, win, bx, by, bw, bh);
  else if (tab === 1) drawArenaTab(ui, ctx, win, bx, by, bw, bh);
  else if (tab === 2) drawBossTab(ui, ctx, win, bx, by, bw, bh);
  else if (tab === 3) drawLoginTab(ui, ctx, win, bx, by, bw, bh);
  else if (tab === 4) drawPresetTab(ui, ctx, win, bx, by, bw, bh);
  else drawStorageTab(ui, ctx, win, bx, by, bw, bh);
}
function resultNotify(ui, r, okCol) {
  if (r == null) return;
  if (r === true || r?.ok) { if (r?.msg) ui.notify(r.msg, okCol || COL.teal); return true; }
  ui.notify(r?.msg || 'できませんでした', COL.bad);
  return false;
}
function drawTowerTab(ui, ctx, win, x, y, w, h) {
  const g = ui.game, st = g.state, t = g.time || 0;
  if (!V3.tower) { notReady(ctx, x, y, w, h, 'ヴァイス・スパイア（無限タワー）'); return; }
  const req = val('tower', 'TOWER_REQ_LEVEL') ?? val('tower', 'TOWER_UNLOCK_LEVEL') ?? 40;
  const bestRaw = call('tower', 'towerBest', [st], 0);
  const best = typeof bestRaw === 'object' ? (bestRaw?.best ?? bestRaw?.floor ?? 0) : (bestRaw || 0);
  const locked = (st.level || 1) < req;
  win.floor = clamp(win.floor ?? best + 1, 1, Math.max(1, best + 1));
  // 左: 塔のビジュアル
  const tx = x, tw = 300;
  const fy = stageBg(ctx, tx, y, tw, h, '#b77bff');
  ctx.save();
  rrPath(ctx, tx, y, tw, h, 12); ctx.clip();
  const towerX = tx + tw / 2;
  for (let i = 0; i < 14; i++) {
    const fl = Math.max(1, best - 6 + i);
    const yy = fy - 20 - i * 30;
    const ww = 120 - i * 4;
    const on = fl <= best, cur = fl === win.floor;
    ctx.fillStyle = cur ? 'rgba(255,212,71,0.85)' : on ? 'rgba(183,123,255,0.75)' : 'rgba(60,40,110,0.75)';
    ctx.fillRect(towerX - ww / 2, yy - 24, ww, 26);
    ctx.strokeStyle = fl % 10 === 0 ? '#ff5fa2' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = fl % 10 === 0 ? 2.5 : 1; ctx.strokeRect(towerX - ww / 2, yy - 24, ww, 26);
    txt(ctx, `${fl}F${fl % 10 === 0 ? ' BOSS' : ''}`, towerX, yy - 11, { size: 11, align: 'center', color: cur ? '#3a2000' : '#fff', sw: cur ? 0 : 2.5, stroke: cur ? false : undefined });
  }
  ctx.restore();
  txt(ctx, 'ヴァイス・スパイア', tx + tw / 2, y + 24, { size: 18, align: 'center', glow: '#b77bff' });
  txt(ctx, `最高到達 ${best}F`, tx + tw / 2, y + 48, { size: 15, align: 'center', color: COL.gold });
  // 右: 階の情報
  const ix = x + tw + 16, iw = w - tw - 16;
  inset(ctx, ix, y, iw, h, { r: 12 });
  if (locked) txt(ctx, `Lv.${req} で解放されます`, ix + iw / 2, y + 40, { size: 18, align: 'center', color: COL.bad });
  txt(ctx, '挑戦する階', ix + 20, y + 80, { size: 14, color: COL.sub });
  ui.btn(ctx, win, 'fl-10', { x: ix + 130, y: y + 64, w: 46, h: 32 }, '-10', () => { win.floor = Math.max(1, win.floor - 10); }, { color: COL.purple, size: 12 });
  ui.btn(ctx, win, 'fl-1', { x: ix + 182, y: y + 64, w: 36, h: 32 }, '◀', () => { win.floor = Math.max(1, win.floor - 1); }, { color: COL.purple, size: 13 });
  txt(ctx, `${win.floor}F`, ix + 260, y + 80, { size: 24, align: 'center', color: '#fff', glow: COL.gold });
  ui.btn(ctx, win, 'fl+1', { x: ix + 302, y: y + 64, w: 36, h: 32 }, '▶', () => { win.floor = Math.min(best + 1, win.floor + 1); }, { color: COL.purple, size: 13 });
  ui.btn(ctx, win, 'fl+10', { x: ix + 344, y: y + 64, w: 46, h: 32 }, '+10', () => { win.floor = Math.min(best + 1, win.floor + 10); }, { color: COL.purple, size: 12 });
  ui.btn(ctx, win, 'flMax', { x: ix + 396, y: y + 64, w: 90, h: 32 }, '最高+1', () => { win.floor = best + 1; }, { color: '#c98a1a', size: 12 });
  const def = call('tower', 'towerFloorDef', [win.floor], null);
  let yy = y + 120;
  if (def) {
    const en = (def.enemies || def.types || []).map((e) => enemyDef(typeof e === 'string' ? e : e?.id)?.name || (typeof e === 'string' ? e : e?.name)).filter(Boolean);
    const boss = def.boss ? (enemyDef(typeof def.boss === 'string' ? def.boss : def.boss.id)?.name || def.boss.name || def.boss) : null;
    const mut = def.mutators || (def.mutator ? [def.mutator] : []);
    const rows = [
      ['敵Lv', def.level ?? def.enemyLevel ?? '—'],
      ['出現', en.length ? en.slice(0, 4).join('・') : '—'],
      ['ボス', boss || (win.floor % 10 === 0 ? '10階ごとのボス' : 'なし')],
      ['特性', mut.map((m) => (typeof m === 'string' ? m : m?.name || m?.id)).join(' / ') || 'なし'],
      ['報酬', def.rewardText || (def.reward ? Object.entries(def.reward).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ') : '—')],
    ];
    for (const [k, v] of rows) {
      txt(ctx, k, ix + 20, yy, { size: 13, color: COL.sub, sw: 2.5 });
      txt(ctx, String(v), ix + 100, yy, { size: 13.5, color: k === 'ボス' && boss ? COL.pink : '#fff', maxW: iw - 120, sw: 3 });
      yy += 28;
    }
  }
  const wk = call('tower', 'towerWeekly', [st], null) || call('tower', 'weeklyMutator', [], null);
  if (wk) txt(ctx, `週替わり特性: ${typeof wk === 'string' ? wk : wk.name || wk.desc || ''}`, ix + 20, yy + 6, { size: 13, color: COL.gold, maxW: iw - 40 });
  txt(ctx, '階層が上がるほど敵が強化。10階ごとにボス。最高到達階は記録され、週次報酬に反映されます。', ix + 20, y + h - 96, { size: 11.5, color: COL.dim, maxW: iw - 40, sw: 2.5 });
  ui.btn(ctx, win, 'towerGo', { x: ix + 20, y: y + h - 70, w: iw - 40, h: 52 }, `▲ ${win.floor}F に入場`, () => {
    const r = call('tower', 'towerEnter', [g, win.floor], null);
    if (resultNotify(ui, r, '#b77bff') !== false) ui.closeAll?.();
  }, { color: '#7b2ff7', size: 18, disabled: locked });
  void t;
}
function drawArenaTab(ui, ctx, win, x, y, w, h) {
  const g = ui.game, st = g.state;
  if (!V3.arena) { notReady(ctx, x, y, w, h, 'ネオン・アリーナ'); return; }
  const info = fn('arena', ['arenaInfo', 'arenaStatus', 'arenaState'])?.(st) || {};
  const fy = stageBg(ctx, x, y, w, 230, '#ff5fa2');
  drawChar(ctx, x + w / 2, fy, charLook(st), equipLooks(st), { facing: 1, state: 'attack', t: g.time || 0, attackT: ((g.time || 0) * 1.2) % 1, damage: 0, scale: 1.8 });
  txt(ctx, 'ネオン・アリーナ', x + w / 2, y + 30, { size: 24, align: 'center', glow: COL.pink, sw: 5 });
  txt(ctx, '時間制ウェーブ・経験値ボーナス', x + w / 2, y + 58, { size: 13, align: 'center', color: COL.sub });
  inset(ctx, x, y + 244, w, h - 244, { r: 12 });
  const rows = [
    ['本日の残り回数', info.left != null ? `${info.left} / ${info.max ?? info.perDay ?? '?'}` : '—'],
    ['制限時間', info.time || info.duration ? `${info.time || info.duration}秒` : '—'],
    ['経験値ボーナス', info.expBonus != null ? `×${info.expBonus}` : '—'],
    ['自己ベスト', info.best != null ? (typeof info.best === 'object' ? `Wave ${info.best.wave ?? '-'}  撃破 ${info.best.kills ?? '-'}` : `Wave ${info.best}`) : '—'],
  ];
  rows.forEach(([k, v], i) => {
    txt(ctx, k, x + 30, y + 274 + i * 28, { size: 14, color: COL.sub });
    txt(ctx, String(v), x + w - 30, y + 274 + i * 28, { size: 15, align: 'right' });
  });
  ui.btn(ctx, win, 'arenaGo', { x: x + w / 2 - 160, y: y + h - 66, w: 320, h: 50 }, '⚔ アリーナに挑戦', () => {
    const r = fn('arena', ['arenaEnter', 'enterArena', 'startArena'])?.(g);
    if (resultNotify(ui, r, COL.pink) !== false) ui.closeAll?.();
  }, { color: '#d93f86', size: 18, disabled: info.left === 0 });
}
function bossList() {
  const B = val('bosses', 'BOSSES') || val('bosses', 'BOSS_LIST');
  if (Array.isArray(B)) return B.map((b) => (typeof b === 'string' ? { id: b } : b));
  if (B && typeof B === 'object') return Object.entries(B).map(([id, b]) => ({ id, ...(typeof b === 'object' ? b : {}) }));
  return Object.values(allEnemies()).filter((e) => e?.boss).map((e) => ({ id: e.id }));
}
function drawBossTab(ui, ctx, win, x, y, w, h) {
  const g = ui.game, st = g.state, t = g.time || 0;
  if (!V3.bosses) { notReady(ctx, x, y, w, h, 'デイリー/ウィークリーボス'); return; }
  const list = bossList();
  const modes = val('bosses', 'BOSS_MODES') || { normal: { name: 'ノーマル' }, hard: { name: 'ハード' }, chaos: { name: 'カオス' }, practice: { name: '練習' } };
  const clears = call('bosses', 'bossClears', [st], {}) || {};
  if (win.sel == null || !list.find((b) => b.id === win.sel)) win.sel = list[0]?.id;
  // 左: ボス一覧
  const lw = 280, RH = 52;
  inset(ctx, x, y, lw, h, { r: 12 });
  list.slice(0, Math.floor((h - 8) / RH)).forEach((b, i) => {
    const d = enemyDef(b.enemyId || b.enemy || b.id) || {};
    const r = { x: x + 6, y: y + 6 + i * RH, w: lw - 12, h: RH - 6 };
    const on = win.sel === b.id, hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 9, fill: on ? 'rgba(255,95,162,0.3)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.5)', stroke: on ? '#fff' : undefined });
    txt(ctx, b.name || d.name || b.id, r.x + 12, r.y + 15, { size: 14, color: '#fff', maxW: r.w - 24 });
    txt(ctx, `Lv.${b.level ?? d.level ?? '?'}  ${b.kind === 'weekly' || b.weekly ? 'ウィークリー' : 'デイリー'}`, r.x + 12, r.y + 33, { size: 11, color: COL.sub, sw: 2.5 });
    ui.hit(win, 'boss:' + b.id, r, { onClick: () => { win.sel = b.id; } });
  });
  // 右: 詳細
  const b = list.find((e) => e.id === win.sel);
  const ix = x + lw + 14, iw = w - lw - 14;
  if (!b) return;
  const d = enemyDef(b.enemyId || b.enemy || b.id) || {};
  const fy = stageBg(ctx, ix, y, iw, 210, '#ff3d7f');
  ctx.save(); rrPath(ctx, ix, y, iw, 210, 12); ctx.clip();
  if (d.id) {
    const dh = Math.max(40, (d.h || 80) * (d.scale || 1));
    const s = clamp(150 / dh, 0.4, 1.6);
    ctx.translate(ix + iw / 2, fy); ctx.scale(s, s);
    drawEnemyArt(ctx, { def: d, x: 0, y: 0, facing: -1, state: 'idle', t, hurtT: 0, hp: 1, maxHp: 1, w: d.w, h: d.h, onGround: true, seed: 3 });
  }
  ctx.restore();
  txt(ctx, b.name || d.name || b.id, ix + 18, y + 26, { size: 20, glow: COL.pink, sw: 5 });
  const rec = clears[b.id] || {};
  let yy = y + 226;
  const MODE_COL = { normal: COL.teal, hard: COL.orange, chaos: COL.pink, practice: COL.dim };
  Object.entries(modes).forEach(([mid, M], i) => {
    const r = { x: ix, y: yy + i * 50, w: iw, h: 44 };
    const mr = rec[mid] || rec.modes?.[mid] || {};
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, stroke: rgba(MODE_COL[mid] || COL.teal, 0.7) });
    txt(ctx, M.name || mid, r.x + 14, r.y + 15, { size: 15, color: MODE_COL[mid] || '#fff' });
    const lv = M.level ?? (M.levelAdd != null ? (d.level || 0) + M.levelAdd : null);
    txt(ctx, `${lv != null ? `Lv.${lv}  ` : ''}${mr.left != null ? `残り ${mr.left}回` : ''}${mr.bestTime ? `  最速 ${(mr.bestTime).toFixed?.(1) ?? mr.bestTime}秒` : ''}${mr.bestDmg ? `  最大 ${mr.bestDmg}` : ''}`, r.x + 14, r.y + 33, { size: 11, color: COL.sub, sw: 2.5, maxW: r.w - 150 });
    ui.btn(ctx, win, 'bossGo:' + mid, { x: r.x + r.w - 124, y: r.y + 6, w: 112, h: 32 }, '挑戦', () => {
      const res = call('bosses', 'bossEntry', [g, b.id, mid], null);
      if (resultNotify(ui, res, MODE_COL[mid]) !== false) ui.closeAll?.();
    }, { color: mid === 'chaos' ? '#c02a52' : mid === 'hard' ? '#c96a1a' : '#109f95', size: 14, disabled: mr.left === 0 });
  });
  txt(ctx, '回数は 2 周期まで持ち越し（やり忘れ救済）。記録は自己ベストを更新すると演出あり。', ix, y + h - 10, { size: 11, color: COL.dim, sw: 2.5, maxW: iw });
}
function drawLoginTab(ui, ctx, win, x, y, w, h) {
  const g = ui.game, st = g.state, t = g.time || 0;
  if (!has('daily', 'loginStatus')) { notReady(ctx, x, y, w, h, 'ログインボーナス'); return; }
  const L = call('daily', 'loginStatus', [st], null);
  if (!L) return;
  txt(ctx, `ログインボーナス  ・  通算 ${L.days} 日  ・  ${L.cycle} 周目`, x + 6, y + 14, { size: 16, color: COL.gold });
  const ev = call('daily', 'weekdayEvent', [], null);
  if (ev?.name) txt(ctx, `本日のイベント: ${ev.name}${ev.desc ? ' — ' + ev.desc : ''}`, x + w - 6, y + 14, { size: 12, align: 'right', color: COL.teal, maxW: w / 2 });
  const cols = 7, gap = 8, cw = (w - gap * (cols - 1)) / cols, ch = 92;
  (L.rewards || []).slice(0, 28).forEach((r, i) => {
    const cx = x + (i % cols) * (cw + gap), cy = y + 34 + Math.floor(i / cols) * (ch + gap);
    const today = r.day === L.today, claimed = r.claimed;
    const big = !!r.label;
    const rr = { x: cx, y: cy, w: cw, h: ch };
    const hov = ui.hover(win, rr);
    inset(ctx, cx, cy, cw, ch, { r: 10, fill: today && !L.claimedToday ? `rgba(255,212,71,${0.22 + 0.1 * Math.sin(t * 5)})` : claimed ? 'rgba(25,211,197,0.12)' : big ? 'rgba(255,95,162,0.16)' : 'rgba(6,4,24,0.55)', stroke: today ? COL.gold : big ? COL.pink : undefined, lw: today ? 2.5 : 1.5 });
    txt(ctx, `${r.day}日目`, cx + 8, cy + 12, { size: 11, color: today ? COL.gold : COL.sub, sw: 2.5 });
    const items = r.items || [];
    items.slice(0, 2).forEach(([id, n], k) => {
      const it = getItemDef(id);
      const ix = cx + cw / 2 + (items.length > 1 ? (k ? 18 : -18) : 0), iy = cy + 46;
      if (it) drawItemIco(ctx, it, ix, iy, 30);
      txt(ctx, `×${n}`, ix + 12, iy + 14, { size: 10, align: 'right', sw: 2.5 });
    });
    if (r.money) txt(ctx, fmtMoney(r.money), cx + cw / 2, cy + ch - 10, { size: 10, align: 'center', color: COL.money, sw: 2.5 });
    if (claimed) {
      ctx.save(); ctx.translate(cx + cw / 2, cy + ch / 2 + 2); ctx.rotate(-0.25);
      ctx.strokeStyle = 'rgba(255,95,162,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      txt(ctx, '済', cx + cw / 2, cy + ch / 2 + 2, { size: 18, align: 'center', color: 'rgba(255,95,162,0.95)', sw: 3 });
    }
    if (hov) ui.setTip({ lines: [{ t: `${r.day}日目${r.label ? `（${r.label}）` : ''}`, c: COL.gold, size: 15 }, ...items.map(([id, n]) => ({ t: `${getItemDef(id)?.name || id} ×${n}`, c: '#fff', size: 13 })), ...(r.money ? [{ t: fmtMoney(r.money), c: COL.money, size: 13 }] : [])], border: COL.gold });
  });
  const by = y + 34 + 4 * (ch + gap);
  ui.btn(ctx, win, 'loginGet', { x: x + w / 2 - 170, y: by + 4, w: 340, h: Math.min(46, y + h - by - 6) }, L.claimedToday ? '本日分は受け取り済み（毎朝5時更新）' : `🎁 ${L.today}日目のボーナスを受け取る`, () => {
    const r = call('daily', 'loginCheck', [g], null);
    if (!r?.ok) ui.notify('本日分は受け取り済みです', COL.dim);
  }, { color: '#c98a1a', size: 16, disabled: L.claimedToday });
}
function drawPresetTab(ui, ctx, win, x, y, w, h) {
  const g = ui.game, st = g.state;
  if (!V3.presets) { notReady(ctx, x, y, w, h, 'プリセット切替'); return; }
  const list = fn('presets', ['presetList', 'getPresets', 'listPresets'])?.(st) || st.presets?.list || st.presets?.slots || [];
  const active = call('presets', 'activePreset', [st], null) ?? st.presets?.active ?? 0;
  const names = ['狩り', 'ボス'];
  txt(ctx, 'スキルバー＆装備セットを 2 つ保存して、ワンクリックで切り替え', x + 6, y + 14, { size: 14, color: COL.sub });
  const cw = (w - 16) / 2;
  for (let i = 0; i < 2; i++) {
    const P = list[i] || null;
    const cx = x + i * (cw + 16), cy = y + 36, chh = h - 36;
    const on = active === i;
    panel(ctx, cx, cy, cw, chh, { r: 14, glow: on ? 'rgba(25,211,197,0.7)' : null, inner: on ? 'rgba(25,211,197,0.8)' : undefined });
    txt(ctx, `${i === 0 ? '🗡' : '👑'} ${P?.name || names[i]}セット${on ? '  （使用中）' : ''}`, cx + 18, cy + 26, { size: 18, color: on ? COL.teal : '#fff' });
    if (!P) txt(ctx, 'まだ保存されていません', cx + cw / 2, cy + 120, { size: 14, align: 'center', color: COL.dim });
    else {
      txt(ctx, 'スキルバー', cx + 18, cy + 58, { size: 12, color: COL.sub });
      (P.skillBar || []).slice(0, 8).forEach((sid, k) => {
        const r = { x: cx + 18 + k * 50, y: cy + 70, w: 44, h: 44 };
        inset(ctx, r.x, r.y, r.w, r.h, { r: 8 });
        const sk = skillDef(sid); if (sk) drawSkillIco(ctx, sk, r.x + 22, r.y + 22, 34);
        txt(ctx, BAR_KEYS[k], r.x + 6, r.y + 8, { size: 9.5, color: COL.teal, sw: 2 });
      });
      txt(ctx, '装備', cx + 18, cy + 134, { size: 12, color: COL.sub });
      Object.entries(P.equipped || P.equip || {}).filter(([, v]) => v).slice(0, 7).forEach(([slot, v], k) => {
        const id = typeof v === 'object' ? v.id : v;
        const r = { x: cx + 18 + k * 50, y: cy + 146, w: 44, h: 44 };
        inset(ctx, r.x, r.y, r.w, r.h, { r: 8 });
        const it = getItemDef(id); if (it) drawItemIco(ctx, it, r.x + 22, r.y + 22, 34);
        void slot;
      });
    }
    ui.btn(ctx, win, 'psave' + i, { x: cx + 18, y: cy + chh - 60, w: cw / 2 - 26, h: 44 }, '現在の構成を保存', () => {
      resultNotify(ui, fn('presets', ['savePreset', 'storePreset'])?.(g, i), COL.teal);
    }, { color: COL.purple, size: 14 });
    ui.btn(ctx, win, 'pload' + i, { x: cx + cw / 2 + 8, y: cy + chh - 60, w: cw / 2 - 26, h: 44 }, on ? '使用中' : 'このセットに切替', () => {
      resultNotify(ui, fn('presets', ['loadPreset', 'switchPreset', 'applyPreset'])?.(g, i), COL.teal);
    }, { color: '#109f95', size: 14, disabled: !P || on });
  }
}
function drawStorageTab(ui, ctx, win, x, y, w, h) {
  const g = ui.game, st = g.state;
  if (!V3.shared) { notReady(ctx, x, y, w, h, '共有倉庫'); return; }
  const sto = fn('shared', ['sharedStorage', 'getStorage', 'storageItems'])?.() || {};
  const items = Array.isArray(sto) ? sto : (sto.items || []);
  const cap = sto.cap || sto.max || val('shared', 'STORAGE_MAX') || 48;
  const half = (w - 16) / 2;
  const grid = (gx, list, title, onPick, n) => {
    inset(ctx, gx, y + 26, half, h - 26, { r: 12 });
    txt(ctx, title, gx + 6, y + 10, { size: 14, color: COL.gold });
    const C = 50, cols = Math.floor((half - 12) / C);
    for (let k = 0; k < Math.min(n, cols * Math.floor((h - 40) / C)); k++) {
      const r = { x: gx + 8 + (k % cols) * C, y: y + 34 + Math.floor(k / cols) * C, w: C - 4, h: C - 4 };
      const e = list[k];
      const it = e && getItemDef(e.id);
      const hov = ui.hover(win, r);
      inset(ctx, r.x, r.y, r.w, r.h, { r: 8, fill: hov && it ? 'rgba(123,47,247,0.4)' : 'rgba(6,4,24,0.6)', stroke: it ? rgba(rarityInfo(it.rarity).color, 0.6) : undefined });
      if (!it) continue;
      drawItemIco(ctx, it, r.x + r.w / 2, r.y + r.h / 2, 34);
      if ((e.qty || 1) > 1) txt(ctx, e.qty, r.x + r.w - 3, r.y + r.h - 8, { size: 10.5, align: 'right', sw: 2.5 });
      if (hov) ui.setTip({ lines: [{ t: it.name, c: rarityInfo(it.rarity).color, size: 15 }, { t: 'クリックで移動', c: COL.dim, size: 11 }], border: rarityInfo(it.rarity).color });
      ui.hit(win, title + k, r, { onClick: () => onPick(e, k) });
    }
  };
  const inv = (st.inventory || []).map((s, i) => (s ? { ...s, _i: i } : null)).filter(Boolean);
  grid(x, inv, `インベントリ（${inv.length}/48）→ 預ける`, (e) => resultNotify(ui, fn('shared', ['depositItem', 'deposit', 'storeItem'])?.(g, e.uid ? { uid: e.uid } : e._i, e.qty || 1), COL.teal), 48);
  grid(x + half + 16, items, `共有倉庫（${items.length}/${cap}）→ 引き出す`, (e, k) => resultNotify(ui, fn('shared', ['withdrawItem', 'withdraw', 'takeItem'])?.(g, k, e.qty || 1), COL.teal), cap);
}

// ======================= 実績（O） =======================
function drawAchieve(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  if (!V3.achievements) { notReady(ctx, x, y, w, h, '実績'); return; }
  const list = (call('achievements', 'achievementList', [st], null) || []).map((a) => ({
    ...a, cat: a.category || a.cat || 'その他', prog: a.progress ?? a.value ?? 0, goal: a.goal ?? a.target ?? a.count ?? 1, done: !!(a.done || a.unlocked || a.completed),
  }));
  const cats = ['すべて', ...Array.from(new Set(list.map((a) => a.cat)))];
  const CAT_NAME = val('achievements', 'ACH_CATEGORIES') || {};
  const catLabel = (c) => (typeof CAT_NAME[c] === 'string' ? CAT_NAME[c] : CAT_NAME[c]?.name) || c;
  const done = list.filter((a) => a.done).length;
  txt(ctx, `達成 ${done} / ${list.length}`, x + w - 20, y + 60, { size: 16, align: 'right', color: COL.gold });
  // カテゴリ
  const cx0 = x + 16, cy0 = y + 46;
  win.cat = clamp(win.cat || 0, 0, cats.length - 1);
  cats.slice(0, 8).forEach((c, i) => {
    const r = { x: cx0 + i * 96, y: cy0, w: 90, h: 28 };
    const on = win.cat === i;
    ui.btn(ctx, win, 'cat' + i, r, catLabel(c), () => { win.cat = i; win.page = 0; }, { color: on ? '#d93f86' : COL.purple, size: 12, active: on });
  });
  const shown = list.filter((a) => win.cat === 0 || a.cat === cats[win.cat]).sort((a, b) => (a.done - b.done) || ((b.prog / b.goal) - (a.prog / a.goal)));
  // 一覧
  const lx = x + 16, ly = y + 84, lw = w - 32 - 290, RH = 54, PER = Math.floor((h - 100 - 30) / RH);
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  pager(ui, ctx, win, lx + lw / 2 - 56, y + h - 40, pages);
  shown.slice((win.page || 0) * PER, (win.page || 0) * PER + PER).forEach((a, i) => {
    const r = { x: lx, y: ly + i * RH, w: lw, h: RH - 6 };
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: a.done ? 'rgba(255,212,71,0.14)' : 'rgba(6,4,24,0.55)', stroke: a.done ? rgba(COL.gold, 0.8) : undefined });
    // トロフィー
    ctx.save();
    ctx.beginPath(); ctx.arc(r.x + 24, r.y + r.h / 2, 16, 0, Math.PI * 2);
    ctx.fillStyle = a.done ? COL.gold : 'rgba(255,255,255,0.1)'; ctx.fill();
    ctx.restore();
    txt(ctx, a.done ? '🏆' : '？', r.x + 24, r.y + r.h / 2 + 1, { size: 15, align: 'center', color: a.done ? '#fff' : COL.dim, stroke: false });
    txt(ctx, a.name || a.id, r.x + 50, r.y + 14, { size: 14, color: a.done ? COL.gold : '#fff', maxW: lw - 200 });
    txt(ctx, a.desc || '', r.x + 50, r.y + 33, { size: 11, color: COL.sub, maxW: lw - 200, sw: 2.5, weight: 700 });
    const bw = 130, bx = r.x + r.w - bw - 12;
    const k = clamp(a.prog / Math.max(1, a.goal), 0, 1);
    ctx.save(); rrPath(ctx, bx, r.y + 26, bw, 12, 6); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.restore();
    if (k > 0) { ctx.save(); rrPath(ctx, bx, r.y + 26, Math.max(12, bw * k), 12, 6); ctx.fillStyle = a.done ? COL.gold : COL.teal; ctx.fill(); ctx.restore(); }
    txt(ctx, `${Math.min(a.prog, a.goal)} / ${a.goal}`, bx + bw / 2, r.y + 14, { size: 11, align: 'center', color: a.done ? COL.gold : '#fff', sw: 2.5 });
    if (a.title || a.reward?.title) txt(ctx, `称号「${a.title?.name || a.title || a.reward.title}」`, bx - 10, r.y + 14, { size: 10.5, align: 'right', color: COL.pink, sw: 2.5, maxW: 140 });
  });
  if (!shown.length) txt(ctx, '実績がありません', lx + lw / 2, ly + 100, { size: 14, align: 'center', color: COL.dim });
  // 称号選択
  const tx = x + w - 290, tw = 274;
  inset(ctx, tx, ly, tw, h - 100, { r: 12 });
  txt(ctx, '◆ 称号を選ぶ', tx + 12, ly + 18, { size: 14, color: COL.pink });
  const titles = (call('achievements', 'titleList', [st], null) || call('achievements', 'unlockedTitles', [st], null) || list.filter((a) => a.done && (a.title || a.reward?.title)).map((a) => ({ id: a.titleId || a.id, name: a.title?.name || a.title || a.reward.title })))
    .map((tt) => (typeof tt === 'string' ? { id: tt, name: tt } : tt));
  const cur = st.title?.id || st.titleId || (typeof st.title === 'string' ? st.title : null);
  const rows = [{ id: null, name: '（なし）' }, ...titles];
  rows.slice(0, Math.floor((h - 150) / 34)).forEach((tt, i) => {
    const r = { x: tx + 8, y: ly + 34 + i * 34, w: tw - 16, h: 30 };
    const on = (cur || null) === tt.id;
    const hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 8, fill: on ? 'rgba(255,95,162,0.35)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.5)', stroke: on ? '#fff' : undefined });
    txt(ctx, (on ? '✔ ' : '') + tt.name, r.x + 10, r.y + 15.5, { size: 12.5, color: on ? '#fff' : COL.sub, maxW: r.w - 20 });
    ui.hit(win, 'title:' + (tt.id || 'none'), r, {
      onClick: () => {
        const res = fn('achievements', ['setTitle', 'equipTitle', 'selectTitle'])?.(g, tt.id);
        if (res == null) { st.title = tt.id ? { id: tt.id, name: tt.name } : null; }
        ui.notify(tt.id ? `称号「${tt.name}」をつけた` : '称号を外した', COL.pink);
      },
    });
  });
  if (!titles.length) txt(ctx, '実績を達成すると称号が手に入る', tx + tw / 2, ly + 100, { size: 12, align: 'center', color: COL.dim });
}

// ======================= 設定 =======================
function drawSettings(ui, ctx, win) {
  const g = ui.game;
  const S = g.settings || loadSettings(g);
  const { x, y, w, h } = win;
  const m = ui.mouse();
  const save = () => { saveSettings(g); applySettings(g); };
  let yy = y + 62;
  const row = (label, sub) => {
    txt(ctx, label, x + 24, yy + 2, { size: 15 });
    if (sub) txt(ctx, sub, x + 24, yy + 22, { size: 11, color: COL.dim, sw: 2.5 });
  };
  row('エフェクトの濃さ', 'スキル・ヒットの光や揺れを抑えて見やすく');
  [[1, '100%'], [0.5, '50%'], [0, '最小']].forEach(([v, lab], i) => {
    const r = { x: x + w - 300 + i * 92, y: yy - 12, w: 86, h: 32 };
    const on = (S.fx ?? 1) === v;
    ui.btn(ctx, win, 'fx' + i, r, lab, () => { S.fx = v; save(); }, { color: on ? '#d93f86' : COL.purple, size: 14, active: on });
  });
  yy += 58;
  row('ダメージ数字のまとめ表示', '多段ヒットを1つの数字に合計して表示');
  const toggle = (id, key, yv) => {
    const on = !!S[key];
    ui.btn(ctx, win, id, { x: x + w - 130, y: yv - 12, w: 106, h: 32 }, on ? 'ON' : 'OFF', () => { S[key] = !S[key]; save(); }, { color: on ? '#109f95' : '#4a3a6a', size: 15, active: on });
  };
  toggle('dmgMerge', 'dmgMerge', yy);
  yy += 58;
  row('クエストナビ矢印', '画面端に次のポータル／目的地の方向を表示');
  if (S.nav == null) S.nav = true;
  toggle('nav', 'nav', yy);
  yy += 58;
  const slider = (id, label, key) => {
    txt(ctx, label, x + 24, yy + 2, { size: 15 });
    const r = { x: x + 200, y: yy - 6, w: w - 300, h: 16 };
    if (win.slider === id) {
      if (m.down) { S[key] = clamp((m.x - r.x) / r.w, 0, 1); applySettings(g); } else { win.slider = null; save(); }
    }
    const v = clamp(S[key] ?? DEFAULT_SETTINGS[key], 0, 1);
    ctx.save(); rrPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.restore();
    ctx.save(); rrPath(ctx, r.x, r.y, Math.max(16, r.w * v), r.h, 8);
    const sg = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0); sg.addColorStop(0, COL.teal); sg.addColorStop(1, COL.pink);
    ctx.fillStyle = sg; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(r.x + r.w * v, r.y + r.h / 2, 12, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.shadowColor = COL.pink; ctx.shadowBlur = 10; ctx.fill(); ctx.restore();
    txt(ctx, `${Math.round(v * 100)}`, x + w - 40, yy + 2, { size: 15, align: 'right', color: COL.gold });
    ui.hit(win, id, { x: r.x - 12, y: r.y - 10, w: r.w + 24, h: r.h + 20 }, { onClick: () => { win.slider = id; S[key] = clamp((m.x - r.x) / r.w, 0, 1); applySettings(g); } });
    yy += 50;
  };
  slider('sMaster', 'マスター音量', 'master');
  slider('sBgm', 'BGM 音量', 'bgm');
  slider('sSe', 'SE 音量', 'se');
  txt(ctx, '設定はこのブラウザに自動保存されます（N キーでミュート）', x + w / 2, y + h - 74, { size: 11.5, align: 'center', color: COL.dim, sw: 2.5 });
  ui.btn(ctx, win, 'sReset', { x: x + 24, y: y + h - 56, w: 180, h: 40 }, '初期設定に戻す', () => { Object.assign(S, DEFAULT_SETTINGS, { nav: true }); save(); }, { color: COL.purple, size: 14 });
  ui.btn(ctx, win, 'sClose', { x: x + w - 164, y: y + h - 56, w: 140, h: 40 }, '閉じる', () => ui.close('settings'), { color: '#d93f86', size: 15 });
}

// ======================= メニュー（Esc） =======================
function drawMenu(ui, ctx, win) {
  const g = ui.game, st = g.state;
  win.x = Math.round((W - win.w) / 2); win.y = Math.round((H - win.h) / 2);
  const { x, y, w, h } = win;
  const t = g.time || 0;
  if (st) {
    const job = currentJob(st);
    inset(ctx, x + 16, y + 46, w - 32, 70, { r: 12 });
    ctx.save(); rrPath(ctx, x + 22, y + 52, 58, 58, 10); ctx.clip();
    ctx.fillStyle = rgba(job.aura || COL.pink, 0.35); ctx.fillRect(x + 22, y + 52, 58, 58);
    drawChar(ctx, x + 51, y + 132, charLook(st), equipLooks(st), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 1.1 });
    ctx.restore();
    txt(ctx, charName(st), x + 92, y + 68, { size: 17, maxW: w - 120 });
    txt(ctx, `Lv.${st.level || 1}  ${job.name}  ・  ${classOf(st.heroId).name}`, x + 92, y + 94, { size: 12, color: COL.sub, sw: 2.5, maxW: w - 120 });
  }
  if (win.confirm) {
    txt(ctx, 'セーブしてキャラクター選択へ戻りますか？', x + w / 2, y + 170, { size: 15, align: 'center', color: '#fff', maxW: w - 40 });
    txt(ctx, '進行状況は自動で保存されます', x + w / 2, y + 196, { size: 12, align: 'center', color: COL.sub });
    ui.btn(ctx, win, 'mYes', { x: x + 30, y: y + 230, w: w - 60, h: 48 }, '👥 キャラクター選択へ', () => { win.confirm = null; guard('returnToTitle', () => g.returnToTitle?.()); }, { color: '#d93f86', size: 17 });
    ui.btn(ctx, win, 'mNo', { x: x + 30, y: y + 290, w: w - 60, h: 44 }, 'キャンセル', () => { win.confirm = null; }, { color: COL.purple, size: 15 });
    return;
  }
  const items = [
    ['▶ ゲームに戻る', () => ui.close('menu'), '#109f95'],
    ['⚙ 設定', () => { ui.close('menu'); ui.open('settings'); }, COL.purple],
    ['📖 操作説明', () => { ui.close('menu'); ui.open('help'); }, COL.purple],
    ['🗼 コンテンツ [U]', () => { ui.close('menu'); ui.open('content'); }, COL.purple],
    ['🏆 実績・称号 [O]', () => { ui.close('menu'); ui.open('achieve'); }, COL.purple],
    ['👥 キャラクター選択へ', () => { win.confirm = true; }, '#c02a52'],
  ];
  items.forEach(([lab, f, c], i) => {
    ui.btn(ctx, win, 'mi' + i, { x: x + 30, y: y + 132 + i * 60, w: w - 60, h: 48 }, lab, f, { color: c, size: 17 });
  });
}

// ======================= 操作説明 =======================
function drawHelp(ui, ctx, win) {
  const { x, y, w } = win;
  const L = [
    ['←→', '移動'], ['Space / Alt', 'ジャンプ（↓+Space で足場から降りる）'], ['X / Ctrl', '通常攻撃（押しっぱなしで連続）'], ['A S D F Q W G H', 'スキル（8枠）'],
    ['1 / 2', 'ポーション'], ['Z', '拾う'], ['V', 'NPC と会話'], ['E / Enter', '車の乗降・決定'], ['↑', 'ポータル・ロープ'],
  ];
  const R = [
    ['I', 'インベントリ（右クリックで強化・潜在）'], ['K', 'スキル（動きのプレビュー）'], ['J', 'ミッション（ナビ）'], ['T', 'ステータス'], ['M', 'ワールドマップ'],
    ['B', 'モンスター図鑑'], ['P', 'スマホ（SNS）'], ['U', 'コンテンツ（タワー/アリーナ/ボス）'], ['O', '実績・称号'], ['R / N', 'ラジオ / ミュート'], ['Esc', 'メニュー・閉じる'],
  ];
  const col = (list, cx) => list.forEach(([k, d], i) => {
    const yy = y + 70 + i * 36;
    const kw = Math.max(44, measure(ctx, k, 13) + 18);
    ctx.save(); rrPath(ctx, cx, yy - 13, kw, 26, 8); ctx.fillStyle = 'rgba(25,211,197,0.25)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = COL.teal; ctx.stroke(); ctx.restore();
    txt(ctx, k, cx + kw / 2, yy + 0.5, { size: 13, align: 'center' });
    txt(ctx, d, cx + kw + 12, yy, { size: 13.5, color: '#efeaff', weight: 700, sw: 2.5, maxW: w / 2 - kw - 50 });
  });
  col(L, x + 24); col(R, x + w / 2 + 6);
  txt(ctx, '💡 頭上に「⬆ 転職できる！」が出たらクリック。クエストはミッション窓 or 右のトラッカーをクリックで詳細とナビ。', x + w / 2, y + 488, { size: 12, align: 'center', color: COL.gold, maxW: w - 40, sw: 2.5 });
  ui.btn(ctx, win, 'hClose', { x: x + w / 2 - 70, y: y + 506, w: 140, h: 36 }, '閉じる', () => ui.close('help'), { color: '#d93f86', size: 14 });
}

// ======================= スキルの動きプレビュー =======================
function dummy(ctx, x, y, hitK, t) {
  const sh = hitK > 0 ? Math.sin(t * 60) * 4 * hitK : 0;
  ctx.save();
  ctx.translate(x + sh, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a5a3a'; ctx.fillRect(-3, -40, 6, 40);
  ctx.beginPath(); ctx.arc(0, -52, 18, 0, Math.PI * 2);
  ctx.fillStyle = hitK > 0.3 ? '#fff' : '#d8c7a4'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#3a2a1a'; ctx.stroke();
  ctx.strokeStyle = '#ff5fa2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -52, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ff5fa2'; ctx.beginPath(); ctx.arc(0, -52, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function dmgPop(ctx, x, y, k, n, col) {
  if (k <= 0 || k >= 1) return;
  txt(ctx, n, x, y - k * 26, { size: 16, align: 'center', color: col, alpha: 1 - k, sw: 4, weight: 900 });
}
/** スキル窓で小さなキャラが実際の動きをループ再生する */
export function drawSkillPreview(ctx, sk, r, t, look, equip, o = {}) {
  const { x, y, w, h } = r;
  const col = sk?.color || COL.teal;
  ctx.save();
  rrPath(ctx, x, y, w, h, 12); ctx.clip();
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#2a1260'); bg.addColorStop(0.65, '#4a1a6a'); bg.addColorStop(1, '#120830');
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  const gy = y + h - 26;
  ctx.fillStyle = 'rgba(25,211,197,0.15)'; ctx.fillRect(x, gy, w, h - (gy - y));
  ctx.strokeStyle = 'rgba(25,211,197,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
  ctx.strokeStyle = 'rgba(25,211,197,0.18)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 11, gy); ctx.lineTo(x + i * w / 11 - 30, y + h); ctx.stroke(); }
  if (!sk) { ctx.restore(); return; }
  const T = sk.kind === 'buff' || sk.kind === 'passive' ? 2.4 : 1.8;
  const p = (t % T) / T;
  const sc = o.scale || 1.15;
  let cx = x + w * 0.26, cy = gy, state = 'idle', attackT = 0, alpha = 1, facing = 1;
  const tx = x + w * 0.76;
  let hitK = 0, hitAt = -1, hits = Math.max(1, sk.hits || 1);
  const after = [];
  const kind = sk.kind === 'move' ? 'move:' + (sk.move?.type || 'rush') : sk.kind;
  const seg = (a, b) => clamp((p - a) / (b - a), 0, 1);
  switch (kind) {
    case 'melee': {
      const k = seg(0.08, 0.3);
      cx += ease(k) * w * 0.26 - ease(seg(0.7, 0.95)) * w * 0.26;
      if (p > 0.15 && p < 0.55) { state = 'attack'; attackT = seg(0.15, 0.55); }
      hitAt = 0.32;
      if (p > 0.22 && p < 0.5) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = col; ctx.lineWidth = 6 * (1 - seg(0.22, 0.5)); ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(cx + 20 * sc, cy - 34 * sc, 34 * sc, -1.2 + seg(0.22, 0.5) * 1.4, 0.9); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'projectile': {
      if (p > 0.1 && p < 0.4) { state = 'attack'; attackT = seg(0.1, 0.4); }
      for (let i = 0; i < Math.min(hits, 4); i++) {
        const k = seg(0.16 + i * 0.07, 0.42 + i * 0.07);
        if (k > 0 && k < 1) {
          const bx = cx + 26 + (tx - cx - 26) * k, by = cy - 38 * sc + Math.sin(i) * 4;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.ellipse(bx, by, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = rgba(col, 0.35); ctx.fillRect(bx - 30, by - 2, 24, 4);
          ctx.restore();
        }
      }
      hitAt = 0.42;
      break;
    }
    case 'aoe': {
      if (p > 0.08 && p < 0.42) { state = 'attack'; attackT = seg(0.08, 0.42); }
      const k = seg(0.2, 0.62);
      if (k > 0 && k < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(col, 1 - k); ctx.lineWidth = 8 * (1 - k); ctx.shadowColor = col; ctx.shadowBlur = 18;
        const mx = (cx + tx) / 2;
        ctx.beginPath(); ctx.ellipse(mx, cy - 24, 30 + k * w * 0.4, 12 + k * 46, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.25 * (1 - k)); ctx.fill();
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          ctx.fillStyle = rgba(i % 2 ? '#ffffff' : col, 1 - k);
          ctx.beginPath(); ctx.arc(mx + Math.cos(a) * k * w * 0.4, cy - 24 + Math.sin(a) * k * 46, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      hitAt = 0.4;
      break;
    }
    case 'dash': {
      const k = seg(0.12, 0.34);
      for (let i = 1; i <= 4; i++) after.push(cx + ease(Math.max(0, k - i * 0.08)) * w * 0.42);
      cx += ease(k) * w * 0.42 - ease(seg(0.72, 0.96)) * w * 0.42;
      state = k > 0 && k < 1 ? 'walk' : p > 0.34 && p < 0.5 ? 'attack' : 'idle';
      attackT = seg(0.34, 0.5);
      hitAt = 0.3;
      break;
    }
    case 'buff': case 'passive': {
      const k = sk.kind === 'buff' ? seg(0.08, 0.6) : (p * 2) % 1;
      if (sk.kind === 'buff' && p > 0.06 && p < 0.25) { state = 'attack'; attackT = seg(0.06, 0.25); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(cx, cy - 36 * sc, 4, cx, cy - 36 * sc, 60 * sc);
      gg.addColorStop(0, rgba(col, (sk.kind === 'buff' ? 0.55 : 0.3) * (1 - k * 0.6))); gg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gg; ctx.fillRect(cx - 80, cy - 120, 160, 140);
      for (let i = 0; i < 9; i++) {
        const q = (k + i / 9) % 1;
        ctx.fillStyle = rgba(i % 2 ? '#ffffff' : col, 1 - q);
        starPath(ctx, cx + Math.sin(i * 2.1) * 28 * sc, cy - q * 90 * sc, 4, 1.6, 4, 0); ctx.fill();
      }
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, 26 * sc + k * 14, 6 * sc + k * 3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      txt(ctx, sk.kind === 'buff' ? 'BUFF UP!' : 'PASSIVE（常時発動）', x + w * 0.66, y + 30, { size: 14, align: 'center', color: col, sw: 3, alpha: sk.kind === 'buff' ? 1 - seg(0.6, 0.9) : 0.9 });
      break;
    }
    case 'move:flashJump': {
      const k1 = seg(0.08, 0.3), k2 = seg(0.3, 0.6), k3 = seg(0.6, 0.78);
      const hgt = Math.sin(Math.min(1, k1 + k2 * 0.6 + k3 * 0.4) * Math.PI) * 64;
      cx += ease(k2) * w * 0.4 - ease(seg(0.8, 0.98)) * w * 0.4;
      cy -= hgt;
      state = k1 > 0 && k3 < 1 ? 'jump' : 'idle';
      if (k2 > 0 && k2 < 0.5) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(col, 1 - k2 * 2); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx - 10, cy - 30, 14 + k2 * 40, 0, Math.PI * 2); ctx.stroke();
        if (sk.move?.backShot) { ctx.fillStyle = rgba(col, 1 - k2 * 2); ctx.fillRect(cx - 120, cy - 34, 100, 4); }
        ctx.restore();
      }
      for (let i = 1; i <= 3; i++) if (k2 > 0 && k2 < 1) after.push(cx - i * 16);
      break;
    }
    case 'move:teleport': {
      const k = seg(0.25, 0.38);
      const d = w * 0.42;
      if (p < 0.25) alpha = 1; else if (p < 0.31) alpha = 1 - seg(0.25, 0.31); else if (p < 0.38) alpha = 0; else alpha = seg(0.38, 0.46);
      if (p >= 0.31) cx += d;
      if (p > 0.85) { cx = x + w * 0.26 + d * (1 - seg(0.85, 1)); alpha = 1; }
      const burst = (bx, kk) => {
        if (kk <= 0 || kk >= 1) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          ctx.fillStyle = rgba(i % 2 ? '#fff' : col, 1 - kk);
          ctx.fillRect(bx + Math.cos(a) * kk * 36, cy - 36 + Math.sin(a) * kk * 46, 4, 4);
        }
        ctx.strokeStyle = rgba(col, 1 - kk); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(bx, cy - 36, 16 + kk * 20, 40, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      };
      burst(x + w * 0.26, seg(0.22, 0.42));
      burst(x + w * 0.26 + d, seg(0.33, 0.55));
      if (o.arrival) hitAt = 0.4;
      void k;
      break;
    }
    case 'move:rush': {
      const k = seg(0.1, 0.32);
      for (let i = 1; i <= 4; i++) if (k > 0 && k < 1) after.push(cx + ease(Math.max(0, k - i * 0.07)) * w * 0.36);
      cx += ease(k) * w * 0.36 - ease(seg(0.75, 0.97)) * w * 0.36;
      state = k > 0 && k < 1 ? 'walk' : 'idle';
      hitAt = 0.28;
      break;
    }
    case 'move:glide': {
      const k = seg(0.1, 0.7);
      cx += k * w * 0.5 - ease(seg(0.78, 0.98)) * w * 0.5;
      cy -= Math.sin(Math.min(1, k * 1.2) * Math.PI) * 50 * (1 - k * 0.4);
      state = k > 0 && k < 1 ? 'jump' : 'idle';
      if (k > 0 && k < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 20 - i * 18, cy - 60 + i * 6); ctx.lineTo(cx - 60 - i * 18, cy - 56 + i * 6); ctx.stroke(); }
        ctx.fillStyle = rgba(col, 0.9); ctx.fillRect(cx - 18, cy - 92 * sc, 36, 6);
        ctx.restore();
      }
      break;
    }
    case 'move:wheelDash': {
      const k = seg(0.08, 0.6);
      cx += ease(k) * w * 0.5 - ease(seg(0.75, 0.97)) * w * 0.5;
      state = k > 0 && k < 1 ? 'walk' : 'idle';
      if (k > 0 && k < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { const yy = cy - 10 - i * 12; ctx.beginPath(); ctx.moveTo(cx - 24, yy); ctx.lineTo(cx - 70 - (i % 2) * 20, yy); ctx.stroke(); }
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#ffd23f' : '#fff'; ctx.fillRect(cx - 10 - Math.random() * 20, cy - 4 - Math.random() * 8, 3, 3); }
        ctx.restore();
      }
      hitAt = 0.36;
      break;
    }
    default: {
      if (p > 0.15 && p < 0.5) { state = 'attack'; attackT = seg(0.15, 0.5); }
      hitAt = 0.3;
    }
  }
  if (hitAt >= 0) {
    for (let i = 0; i < Math.min(hits, 4); i++) {
      const hk = seg(hitAt + i * 0.07, hitAt + i * 0.07 + 0.35);
      if (hk > 0 && hk < 1) { hitK = Math.max(hitK, 1 - hk); dmgPop(ctx, tx + (i % 2 ? 10 : -8), gy - 76 - i * 12, hk, String(Math.round((o.mult || 1) * (120 + i * 17))), i % 3 === 2 ? '#ffd23f' : '#fff'); }
    }
  }
  if (!['buff', 'passive'].includes(sk.kind) && !(sk.kind === 'move' && sk.move?.type === 'teleport' && !o.arrival)) dummy(ctx, tx, gy, hitK, t);
  else if (sk.kind === 'move') dummy(ctx, x + w * 0.9, gy, hitK, t);
  // 残像
  for (const ax of after) {
    ctx.save(); ctx.globalAlpha = 0.25;
    drawChar(ctx, ax, cy, look, equip, { facing, state: 'walk', t, attackT: 0, damage: 0, scale: sc, flash: true });
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = alpha;
  drawChar(ctx, cx, cy, look, equip, { facing, state, t, attackT, damage: 0, scale: sc });
  ctx.restore();
  ctx.restore();
  ctx.save(); rrPath(ctx, x, y, w, h, 12); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 0.8); ctx.stroke(); ctx.restore();
}

export const V3_WINDOWS = {
  jobOffer: drawJobOffer, tune: drawTune, potential: drawPotential, content: drawContent, achieve: drawAchieve,
  settings: drawSettings, menu: drawMenu, help: drawHelp,
};
void FONT; void font; void RAINBOW;
