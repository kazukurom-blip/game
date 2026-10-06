// 各ウィンドウの中身（UIManager から呼ばれる即時モード描画）
import {
  COL, txt, inset, panel, rrPath, wrap, fmtMoney, rgba, clamp, measure, SLOT_LABELS, STAT_LABELS, rarityFill, font, rainbowGrad,
} from './theme.js';
import {
  guard, getItemDef, rarityInfo, stats, computeStatsRaw, drawChar, drawItemIco, drawSkillIco, heroLook, equipLooks,
  looksFrom, doEquip, doUnequip, doUseItem, doAddItem, doRemoveItem, allSkills, skillDef, skillMp, skillCd, doLearn,
  allMissions, missionDef, HERO_NAMES, expNeed, missionNpcName, turnInNpc, sellPriceOf, drawPetArt,
  dmgRange, fmtRange, statsWithEquip, statsWithAp, sellPriceEntry, doSell,
} from './deps.js';
import {
  charLook, charName, currentJob, JOBS, skillsForHero, hasJob, jobLineage, jobLockOf, getSp, skillSpTier, moveParams, SKILL_BAR_SIZE, BAR_KEYS,
  missionGuide, trackedMissionId, setTracked, routeTo, MISSION_NPCS, classOf, V3, call,
} from './v3deps.js';
import { drawSkillPreview, kindLabel } from './v3windows.js';
import { mapInfo } from './deps.js';
import * as SpriteM from '../render/sprites.js';
import { itemGender, canWearGender, GENDER_ONLY_LABEL } from '../data/items.js';

const W = 1280, H = 720;
const WT = { melee: '近接', gun: '銃', magic: '魔法' };
const KIND = { melee: '近接', projectile: '遠距離', aoe: '範囲', buff: 'バフ', dash: 'ダッシュ', passive: 'パッシブ', move: '移動' };

function itemCat(it) {
  if (!it) return 2;
  if (it.type === 'equip' || it.slot) return 0;
  if (it.type === 'consumable') return 1;
  return 2;
}
function fmtVal(k, v) {
  if (typeof v !== 'number') return String(v ?? '-');
  if ((k === 'crit') && v > 0 && v <= 1) return (v * 100).toFixed(0) + '%';
  if (k === 'critDmg' && v > 0 && v < 10) return (v * 100).toFixed(0) + '%';
  if (Math.abs(v - Math.round(v)) > 0.001) return v.toFixed(2);
  return String(Math.round(v));
}
const sellPrice = (it) => sellPriceOf(it);
const stripMark = (l) => String(l).replace(/^[・✔]\s*/, '');

// ---------- ツールチップ ----------
export function itemTip(game, it, o = {}) {
  const st = game.state || {};
  const info = rarityInfo(it.rarity);
  const L = [];
  L.push({ t: it.name || '???', c: info.color, grad: info.color2 ? info : null, size: 18 });
  const cat = it.slot ? (SLOT_LABELS[it.slot] || it.slot) : it.type === 'consumable' ? '消費アイテム' : 'その他';
  L.push({ t: `${info.name}  ・  ${cat}`, c: COL.sub, size: 12 });
  if (it.reqLevel) L.push({ t: `必要Lv ${it.reqLevel}`, c: (st.level || 1) >= it.reqLevel ? '#ffffff' : COL.bad, size: 13 });
  if (itemGender(it)) L.push({ t: GENDER_ONLY_LABEL[itemGender(it)], c: canWearGender(it, st.gender) ? '#ffd6f5' : COL.bad, size: 13 });
  if (it.slot === 'pet' || it.pet) {
    const pt = it.pet || {};
    L.push({ sep: true });
    if (pt.name) L.push({ t: `PET「${pt.name}」`, c: '#ffd6f5', size: 14 });
    L.push({ t: `自動取得範囲  ${pt.pickRange ?? '?'}px`, c: '#d8f6ff', size: 13 });
    if (pt.pickRate != null) L.push({ t: `取得速度  ${pt.pickRate}個/秒`, c: '#d8f6ff', size: 13 });
    L.push({ t: '装備すると追従してアイテム・お金を自動で拾う', c: COL.good, size: 12, wrap: true });
  }
  if (it.slot === 'weapon') {
    const parts = [];
    if (it.weaponType) parts.push(`タイプ: ${WT[it.weaponType] || it.weaponType}`);
    if (it.attackSpeed) parts.push(`攻速 ${fmtVal('attackSpeed', it.attackSpeed)}`);
    if (it.range) parts.push(`射程 ${it.range}`);
    if (parts.length) L.push({ t: parts.join('  '), c: '#d8f6ff', size: 12.5 });
  }
  let cur = o.compare !== false && it.slot ? getItemDef(st.equipped?.[it.slot]) : null;
  if (cur && cur.id === it.id) cur = null;
  if (o.equipped) cur = null;
  const keys = new Set([...Object.keys(it.stats || {}), ...Object.keys(cur?.stats || {})]);
  if (keys.size) L.push({ sep: true });
  for (const k of keys) {
    const v = it.stats?.[k] || 0, c = cur ? (cur.stats?.[k] || 0) : null;
    if (!v && !c) continue;
    const line = { t: `${STAT_LABELS[k] || k}  ${v >= 0 ? '+' : ''}${fmtVal(k, v)}`, c: v ? '#ffffff' : COL.dim, size: 13.5 };
    if (cur) {
      const d = v - c;
      if (Math.abs(d) > 0.0001) { line.r = `(${d > 0 ? '+' : ''}${fmtVal(k, d)})`; line.rc = d > 0 ? COL.good : COL.bad; } else { line.r = '(±0)'; line.rc = COL.dim; }
    }
    L.push(line);
  }
  if (cur) L.push({ t: `▲▼ 装備中「${cur.name}」と比較`, c: COL.dim, size: 11.5 });
  // 装備したときの通常攻撃ダメージ幅の変化（防御0の相手。★・潜在・ステータス込み）
  if (it.slot && it.slot !== 'pet' && !o.equipped && o.compare !== false) {
    const a = dmgRange(stats(game)), b = dmgRange(statsWithEquip(st, it, o.inst));
    if (a && b) {
      const d = (b.lo + b.hi) - (a.lo + a.hi);
      L.push({ t: 'ダメージ', c: COL.orange, size: 12.5, r: `${fmtRange(a)} → ${fmtRange(b)}`, rc: d > 0 ? COL.good : d < 0 ? COL.bad : COL.sub });
    }
  }
  const inst = o.inst;
  if (inst && (inst.star || inst.pot)) {
    L.push({ sep: true });
    if (inst.star) L.push({ t: `★${inst.star}  ネオン・チューン`, c: COL.star, size: 13.5 });
    if (inst.pot?.grade) {
      const PG = V3.potential?.POT_GRADE_INFO?.[inst.pot.grade];
      L.push({ t: `潜在: ${PG?.name || inst.pot.grade}`, c: PG?.color || '#b04dff', size: 13 });
      for (const ln of inst.pot.lines || []) L.push({ t: '  ' + (call('potential', 'potLineText', [ln], null) || `${ln.stat} +${ln.value}`), c: PG?.color || '#d8c8ff', size: 12.5 });
    }
  }
  if (it.slot && it.slot !== 'pet' && o.menuHint !== false) L.push({ t: '右クリック: 装備 / ネオン・チューン / ハックチップ', c: COL.dim, size: 11 });
  if (o.equipped) L.push({ t: '装備中', c: COL.teal, size: 12 });
  const ef = it.effect;
  if (ef) {
    const parts = [];
    if (ef.hp) parts.push(`HP ${ef.hp > 0 && ef.hp <= 1 ? Math.round(ef.hp * 100) + '%' : '+' + ef.hp} 回復`);
    if (ef.mp) parts.push(`MP ${ef.mp > 0 && ef.mp <= 1 ? Math.round(ef.mp * 100) + '%' : '+' + ef.mp} 回復`);
    if (ef.buff) parts.push(`効果: ${typeof ef.buff === 'string' ? ef.buff : (ef.buff.name || ef.buff.stat || 'バフ')}`);
    if (parts.length) L.push({ t: parts.join('  '), c: COL.good, size: 13.5 });
  }
  if (it.desc) { L.push({ sep: true }); L.push({ t: it.desc, c: '#e6e0ff', size: 12.5, wrap: true }); }
  if (o.price === 'buy') L.push({ t: `価格  ${fmtMoney(it.price || 0)}`, c: (st.money || 0) >= (it.price || 0) ? COL.money : COL.bad, size: 14 });
  if (o.price === 'sell' || (o.price == null && it.price)) L.push({ t: `売値  ${fmtMoney(o.inst ? sellPriceEntry(o.inst) : sellPrice(it))}`, c: COL.gold, size: 12.5 });
  return { lines: L, border: info.color };
}

function skillTip(game, sk) {
  const st = game.state || {};
  const lv = st.skills?.[sk.id] || 0, max = sk.maxLevel || 10;
  const L = [{ t: sk.name, c: sk.color || COL.teal, size: 18 }];
  L.push({ t: `${kindLabel(sk)}  ・  Lv ${lv}/${max}  ・  習得Lv ${sk.reqLevel || 1}`, c: COL.sub, size: 12 });
  const jl = jobLockOf(st, sk.id);
  if (jl) L.push({ t: `🔒 「${jl.jobName}」に転職で習得`, c: COL.bad, size: 12 });
  L.push({ sep: true });
  if (sk.desc) L.push({ t: sk.desc, c: '#ffffff', size: 13, wrap: true });
  if (sk.kind !== 'passive') {
    const l = Math.max(1, lv);
    const mult = guard('skill.mult', () => (typeof sk.mult === 'function' ? sk.mult(l) : sk.mult), null);
    const parts = [`MP ${skillMp(sk, l)}`, `CT ${fmtVal('cd', skillCd(sk, l))}秒`];
    if (mult) parts.push(`威力 ${Math.round(mult * 100)}%`);
    if (sk.hits > 1) parts.push(`${sk.hits}ヒット`);
    L.push({ t: (lv ? '現在: ' : 'Lv1: ') + parts.join('  '), c: '#d8f6ff', size: 12.5 });
    if (lv > 0 && lv < max) {
      const m2 = guard('skill.mult', () => (typeof sk.mult === 'function' ? sk.mult(lv + 1) : sk.mult), null);
      if (m2) L.push({ t: `次Lv: 威力 ${Math.round(m2 * 100)}%  MP ${skillMp(sk, lv + 1)}`, c: COL.good, size: 12.5 });
    }
    L.push({ t: 'ドラッグでスキルバーへ / ダブルクリックで空き枠に登録', c: COL.dim, size: 11.5 });
  }
  return { lines: L, border: sk.color || COL.teal };
}

export function drawTooltipBox(ctx, tip, m, at) {
  if (!tip?.lines?.length) return;
  const tw = at?.w || 290, pad = 12;
  const rows = [];
  let hgt = pad;
  for (const l of tip.lines) {
    if (l.sep) { rows.push({ sep: true, h: 10 }); hgt += 10; continue; }
    const size = l.size || 14;
    const lines = l.wrap ? wrap(ctx, l.t, tw - pad * 2, size, 700) : [l.t];
    for (const s of lines) { rows.push({ ...l, t: s, h: size + 7 }); hgt += size + 7; }
  }
  hgt += pad - 4;
  let x, y;
  if (at) { x = at.x; y = at.y; } else {
    x = m.x + 20; y = m.y + 18;
    if (x + tw > W - 6) x = m.x - tw - 14;
    if (y + hgt > H - 6) y = H - 6 - hgt;
    x = clamp(x, 6, W - tw - 6); y = Math.max(6, y);
  }
  if (!at) {
    panel(ctx, x, y, tw, hgt, { r: 10, top: 'rgba(16,10,44,0.96)', bottom: 'rgba(10,6,28,0.96)', stroke: tip.border || '#fff', glow: rgba(tip.border || '#ffffff', 0.5), inner: false });
  }
  let yy = y + pad;
  for (const r of rows) {
    if (r.sep) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + pad, yy + 4, tw - pad * 2, 1);
      yy += r.h; continue;
    }
    const cy = yy + r.h / 2 - 1;
    if (r.grad) {
      ctx.save();
      ctx.font = font(r.size, 800); ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,6,30,0.9)';
      ctx.strokeText(r.t, x + pad, cy);
      ctx.fillStyle = rarityFill(ctx, r.grad, x + pad, 0, x + pad + measure(ctx, r.t, r.size), 0);
      ctx.fillText(r.t, x + pad, cy);
      ctx.restore();
    } else {
      txt(ctx, r.t, x + pad, cy, { size: r.size, color: r.c, weight: r.size >= 16 ? 900 : 700, sw: 3, maxW: tw - pad * 2 - (r.r ? 60 : 0) });
    }
    if (r.r) txt(ctx, r.r, x + tw - pad, cy, { size: r.size, color: r.rc, align: 'right', sw: 3 });
    yy += r.h;
  }
}

// ---------- 共通部品 ----------
function tabs(ui, ctx, win, x, y, labels, tw = 100, key = 'tab') {
  labels.forEach((lab, i) => {
    const r = { x: x + i * (tw + 6), y, w: tw, h: 30 };
    const on = (win[key] || 0) === i, hov = ui.hover(win, r);
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 10);
    if (on) {
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, COL.pink); g.addColorStop(1, COL.purple);
      ctx.fillStyle = g; ctx.shadowColor = COL.pink; ctx.shadowBlur = 10;
    } else ctx.fillStyle = hov ? 'rgba(123,47,247,0.55)' : 'rgba(10,6,30,0.55)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff' : 'rgba(200,180,255,0.5)'; ctx.stroke();
    ctx.restore();
    txt(ctx, lab, r.x + r.w / 2, r.y + 16, { size: 14, align: 'center', color: on ? '#fff' : COL.sub });
    ui.hit(win, key + i, r, { onClick: () => { win[key] = i; win.sel = null; win.page = 0; } });
  });
}

function pager(ui, ctx, win, x, y, pages) {
  if (pages <= 1) return;
  win.page = clamp(win.page || 0, 0, pages - 1);
  ui.btn(ctx, win, 'pgL', { x, y, w: 30, h: 26 }, '◀', () => { win.page = Math.max(0, win.page - 1); }, { disabled: win.page <= 0, size: 12, color: COL.purple });
  txt(ctx, `${win.page + 1}/${pages}`, x + 56, y + 13, { size: 13, align: 'center' });
  ui.btn(ctx, win, 'pgR', { x: x + 82, y, w: 30, h: 26 }, '▶', () => { win.page = Math.min(pages - 1, win.page + 1); }, { disabled: win.page >= pages - 1, size: 12, color: COL.purple });
}

function slotBox(ctx, r, it, o = {}) {
  const info = it ? rarityInfo(it.rarity) : null;
  inset(ctx, r.x, r.y, r.w, r.h, {
    r: 9,
    fill: o.sel ? 'rgba(255,95,162,0.28)' : o.hover ? 'rgba(123,47,247,0.4)' : 'rgba(6,4,24,0.6)',
    stroke: o.sel ? '#ffffff' : it && it.rarity && it.rarity !== 'common' ? rgba(info.color, 0.9) : 'rgba(190,170,255,0.35)',
    lw: o.sel ? 2.5 : 1.5,
  });
  if (info?.rainbow && !o.sel) {
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 9);
    ctx.lineWidth = 2.5; ctx.strokeStyle = rainbowGrad(ctx, r.x, r.y, r.x + r.w, r.y + r.h, (typeof performance !== 'undefined' ? performance.now() : 0) / 2000);
    ctx.stroke();
    ctx.restore();
  }
  if (it && it.rarity && it.rarity !== 'common') {
    ctx.save();
    rrPath(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6);
    g.addColorStop(0, rgba(info.color, 0.28)); g.addColorStop(1, rgba(info.color, 0));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
}

// 持ち物のエントリ（カテゴリ 0=装備 1=消費 2=その他）。i はインベントリの位置
function invEntries(st, cat) {
  return (st.inventory || []).map((s, i) => ({ s, i, it: s ? getItemDef(s.id) : null })).filter((e) => e.s && e.it && itemCat(e.it) === cat);
}
// 選択（{i, id, uid}）をリストから探し直す。売却などで位置がずれても uid → 位置 → id の順で追いかける
function findSel(list, sel) {
  if (!sel) return null;
  return (sel.uid && list.find((e) => e.s.uid === sel.uid && !!e.equipped === !!sel.equipped))
    || list.find((e) => e.i === sel.i && e.s.id === sel.id && !!e.equipped === !!sel.equipped)
    || (!sel.uid ? list.find((e) => e.s.id === sel.id && !!e.equipped === !!sel.equipped) : null) || null;
}
const selOf = (e) => ({ i: e.i, id: e.s.id, uid: e.s.uid || null, equipped: !!e.equipped });
/** グリッドの1マス（持ち物画面・売却画面で共通）: 枠・アイコン・個数・[1][2]登録・★・潜在の色・装備中の印 */
function drawItemCell(ctx, st, r, e, o = {}) {
  slotBox(ctx, r, e?.it, { hover: o.hover && e, sel: e && o.sel });
  if (!e) return;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  drawItemIco(ctx, e.it, cx, cy, r.w * 0.8);
  if (o.dim) { ctx.save(); rrPath(ctx, r.x, r.y, r.w, r.h, 9); ctx.fillStyle = 'rgba(6,4,24,0.55)'; ctx.fill(); ctx.restore(); }
  else if ((e.it.reqLevel || 0) > (st.level || 1) || !canWearGender(e.it, st.gender)) {
    ctx.save(); rrPath(ctx, r.x, r.y, r.w, r.h, 9); ctx.fillStyle = 'rgba(255,40,70,0.22)'; ctx.fill(); ctx.restore();
  }
  if ((e.s.qty || 1) > 1) txt(ctx, e.s.qty, r.x + r.w - 4, r.y + r.h - 9, { size: 12, align: 'right', sw: 3 });
  if (st.potionBar?.includes(e.s.id)) txt(ctx, '[' + (st.potionBar.indexOf(e.s.id) + 1) + ']', r.x + 4, r.y + 9, { size: 10, color: COL.pink, sw: 2.5 });
  if (e.s.star) txt(ctx, '★' + e.s.star, r.x + 4, r.y + r.h - 9, { size: 10.5, color: COL.star, sw: 2.5 });
  if (e.s.pot?.grade) {
    const pc = V3.potential?.POT_GRADE_INFO?.[e.s.pot.grade]?.color || '#b04dff';
    ctx.save(); ctx.beginPath(); ctx.arc(r.x + r.w - 8, r.y + 8, 4.5, 0, Math.PI * 2); ctx.fillStyle = pc; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  }
  if (e.equipped) {
    ctx.save();
    rrPath(ctx, r.x + 2, r.y + 2, 17, 14, 4);
    ctx.fillStyle = COL.teal; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    txt(ctx, 'E', r.x + 10.5, r.y + 9.5, { size: 10, align: 'center', sw: 2, weight: 900 });
  }
  if (o.label) txt(ctx, o.label, cx, r.y + r.h - 8, { size: 9.5, align: 'center', color: COL.bad, sw: 2.5 });
}

// ======================= インベントリ =======================
function drawInventory(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  // --- 左: キャラプレビュー＋装備スロット
  const px = x + 16, py = y + 46, pw = 304, ph = 336;
  ctx.save();
  rrPath(ctx, px, py, pw, ph, 12);
  const bg = ctx.createLinearGradient(0, py, 0, py + ph);
  bg.addColorStop(0, 'rgba(255,95,162,0.35)'); bg.addColorStop(0.55, 'rgba(123,47,247,0.30)'); bg.addColorStop(1, 'rgba(10,6,30,0.75)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
  ctx.clip();
  // 夕日＆グリッド床
  const sunY = py + 150;
  const sg = ctx.createLinearGradient(0, sunY - 70, 0, sunY + 70);
  sg.addColorStop(0, 'rgba(255,220,120,0.55)'); sg.addColorStop(1, 'rgba(255,95,162,0.25)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(px + pw / 2, sunY, 70, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(25,211,197,0.35)'; ctx.lineWidth = 1;
  const fy = py + ph - 70;
  for (let i = 0; i < 6; i++) { const yy = fy + i * i * 3 + i * 4; ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke(); }
  for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(px + pw / 2 + i * 14, fy); ctx.lineTo(px + pw / 2 + i * 60, py + ph); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(px + pw / 2, fy + 8, 52, 10, 0, 0, Math.PI * 2); ctx.fill();
  const petIt = getItemDef(st.equipped?.pet);
  const cxC = petIt ? px + pw / 2 - 22 : px + pw / 2;
  drawChar(ctx, cxC, fy + 8, charLook(st), equipLooks(st), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 2 });
  if (petIt) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px + pw / 2 + 62, fy + 10, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
    drawPetArt(ctx, px + pw / 2 + 62, fy + 8, petIt.look, { facing: -1, state: 'idle', t, scale: 1.3 });
  }
  ctx.restore();
  txt(ctx, `${charName(st)}  Lv.${st.level || 1}`, px + pw / 2, py + ph - 18, { size: 15, align: 'center', color: '#fff', glow: COL.pink });

  const SL = [['hat', 0, 0], ['top', 0, 1], ['bottom', 0, 2], ['shoes', 0, 3], ['weapon', 1, 0], ['accessory', 1, 1], ['pet', 1, 2]];
  for (const [slot, col, row] of SL) {
    const r = { x: col ? px + pw - 10 - 54 : px + 10, y: py + 10 + row * 66, w: 54, h: 54 };
    const id = st.equipped?.[slot];
    const it = getItemDef(id);
    const hov = ui.hover(win, r);
    slotBox(ctx, r, it, { hover: hov });
    if (it) drawItemIco(ctx, it, r.x + r.w / 2, r.y + r.h / 2, 42);
    else txt(ctx, SLOT_LABELS[slot], r.x + r.w / 2, r.y + r.h / 2, { size: 11, align: 'center', color: COL.dim, sw: 2.5 });
    if (it) txt(ctx, SLOT_LABELS[slot], r.x + 3, r.y + 7, { size: 9, color: '#ffe3f0', sw: 2.5 });
    const einst = st.equippedInst?.[slot] || null;
    if (hov && it) ui.setTip(itemTip(g, it, { equipped: true, inst: einst }));
    if (it && einst?.star) txt(ctx, '★' + einst.star, r.x + r.w - 3, r.y + r.h - 8, { size: 10, align: 'right', color: COL.star, sw: 2.5 });
    else if (hov && slot === 'pet') ui.setTip({ lines: [{ t: 'PET スロット', c: '#ffd6f5', size: 15 }, { t: '超低確率でドロップする PET を装備すると', c: COL.sub, size: 12 }, { t: 'アイテムとお金を自動で拾ってくれる', c: COL.sub, size: 12 }], border: '#ff6ad5' });
    ui.hit(win, 'eq:' + slot, r, {
      onRight: () => {
        if (!it || slot === 'pet') return;
        const m = ui.mouse();
        const ref = einst?.uid ? { uid: einst.uid } : { slot };
        ui.openPopup(m.x, m.y, [
          { label: '外す', fn: () => { const rr = doUnequip(g, slot); if (rr === false || rr?.ok === false) ui.notify(rr?.msg || '外せませんでした', COL.bad); } },
          { label: '★ ネオン・チューン', color: COL.star, fn: () => ui.open('tune', { ref }) },
          { label: '◆ ハックチップ（潜在）', color: '#c9a2ff', fn: () => ui.open('potential', { ref }) },
        ]);
      },
      onClick: () => {
        if (!st.equipped?.[slot]) return;
        const r = doUnequip(g, slot);
        if (r === false || r?.ok === false) ui.notify(r?.msg || '外せませんでした（インベントリが満杯？）', COL.bad);
        else ui.notify(r?.msg || `${it?.name || ''} を外した`, COL.sub);
      },
    });
  }
  // ステータス要約
  const cs = stats(g);
  const sy = py + ph + 10;
  inset(ctx, px, sy, pw, 52, { r: 10 });
  const sum = [['攻撃力', cs.atk], ['防御力', cs.def], ['HP', cs.maxHp], ['MP', cs.maxMp]];
  sum.forEach(([k, v], i) => {
    const cx = px + 12 + (i % 2) * (pw / 2), cy = sy + 15 + Math.floor(i / 2) * 22;
    txt(ctx, k, cx, cy, { size: 12, color: COL.sub, sw: 2.5 });
    txt(ctx, fmtVal(k, v ?? 0), cx + pw / 2 - 24, cy, { size: 13, align: 'right' });
  });
  // 所持金
  const my = y + h - 46;
  ctx.save();
  rrPath(ctx, px, my, pw, 32, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(COL.money, 0.6); ctx.stroke();
  ctx.restore();
  txt(ctx, '所持金', px + 14, my + 16.5, { size: 13, color: COL.sub });
  txt(ctx, fmtMoney(st.money || 0), px + pw - 14, my + 16.5, { size: 18, align: 'right', color: COL.money, stroke: COL.moneyShadow, sw: 4 });

  // --- 右: タブ＋グリッド
  const gx = x + 340, gy = y + 88;
  tabs(ui, ctx, win, gx, y + 48, ['装備', '消費', 'その他']);
  const inv = st.inventory || [];
  txt(ctx, `${inv.filter(Boolean).length} / 48`, x + w - 18, y + 63, { size: 13, align: 'right', color: COL.sub });
  const list = invEntries(st, win.tab || 0);
  // 選択の検証
  const selE = findSel(list, win.sel);
  if (!selE) win.sel = null;
  const CELL = 54;
  for (let k = 0; k < 48; k++) {
    const r = { x: gx + (k % 8) * CELL, y: gy + Math.floor(k / 8) * CELL, w: 50, h: 50 };
    const e = list[k];
    const hov = ui.hover(win, r);
    drawItemCell(ctx, st, r, e, { hover: hov, sel: selE === e });
    if (!e) continue;
    if (hov) ui.setTip(itemTip(g, e.it, { inst: e.s }));
    const cons = e.it.type === 'consumable';
    ui.hit(win, 'it:' + k, r, {
      onClick: () => { win.sel = selOf(e); },
      onDbl: () => activate(ui, win, e),
      onRight: () => {
        if (cons) { togglePotion(ui, e.s.id); return; }
        win.sel = selOf(e);
        if (!e.it.slot || e.it.slot === 'pet') return;
        const m = ui.mouse();
        const ref = e.s.uid ? { uid: e.s.uid } : { index: e.i };
        ui.openPopup(m.x, m.y, [
          { label: '装備する', fn: () => activate(ui, win, e) },
          { label: '★ ネオン・チューン', color: COL.star, fn: () => ui.open('tune', { ref }) },
          { label: '◆ ハックチップ（潜在）', color: '#c9a2ff', fn: () => ui.open('potential', { ref }) },
        ]);
      },
      drag: cons ? { kind: 'potion', id: e.s.id } : null,
    });
  }
  // 詳細バー
  const dy = gy + 6 * CELL + 4, dh = y + h - 14 - dy;
  inset(ctx, gx, dy, 8 * CELL - 4, dh, { r: 10 });
  win.onEnter = selE ? () => activate(ui, win, selE) : null;
  if (selE) {
    const it = selE.it, info = rarityInfo(it.rarity);
    drawItemIco(ctx, it, gx + 34, dy + dh / 2, 44);
    txt(ctx, it.name + (selE.s.star ? ` ★${selE.s.star}` : ''), gx + 64, dy + 22, { size: 16, color: info.color, maxW: it.slot ? 120 : 180 });
    txt(ctx, it.slot ? `${SLOT_LABELS[it.slot]}  必要Lv ${it.reqLevel || 1}` : it.type === 'consumable' ? `所持 ${selE.s.qty || 1}` : (it.desc || '').slice(0, 14), gx + 64, dy + 46, { size: 12, color: COL.sub, maxW: 180 });
    let bx = gx + 8 * CELL - 4 - 12;
    const bh = 34, by = dy + dh / 2 - bh / 2;
    if (it.type === 'consumable') {
      for (let i = 1; i >= 0; i--) {
        bx -= 62;
        ui.btn(ctx, win, 'pb' + i, { x: bx, y: by, w: 56, h: bh }, `[${i + 1}]登録`, () => ui.assignPotion(it.id, i), { size: 12, color: COL.pink });
        bx -= 6;
      }
    }
    if (it.slot && it.slot !== 'pet') {
      const ref = selE.s.uid ? { uid: selE.s.uid } : { index: selE.i };
      bx -= 60;
      ui.btn(ctx, win, 'potW', { x: bx, y: by, w: 56, h: bh }, '潜在', () => ui.open('potential', { ref }), { size: 12, color: '#7b4dc9' });
      bx -= 62;
      ui.btn(ctx, win, 'tuneW', { x: bx, y: by, w: 56, h: bh }, '★強化', () => ui.open('tune', { ref }), { size: 12, color: '#c98a1a' });
      bx -= 6;
    }
    if (itemCat(it) !== 2 || it.type === 'consumable') {
      bx -= 88;
      ui.btn(ctx, win, 'act', { x: bx, y: by, w: 88, h: bh }, it.type === 'consumable' ? '使う' : '装備する', () => activate(ui, win, selE), { color: COL.teal });
    }
  } else {
    txt(ctx, 'ダブルクリック / Enter: 装備・使用', gx + 16, dy + 22, { size: 12.5, color: COL.sub });
    txt(ctx, '右クリック: 装備は強化・潜在メニュー / 消費は [1][2] に登録', gx + 16, dy + 44, { size: 12.5, color: COL.sub });
  }
}

function activate(ui, win, e) {
  const g = ui.game, it = e?.it;
  if (!it) return;
  if (it.slot || it.type === 'equip') {
    const r = doEquip(g, e.s?.uid || it.id); // 選んだその1個（★・潜在つき）を装備する
    if (r && r.ok === false) ui.notify(r.msg || '装備できません', COL.bad);
    else if (r === false) ui.notify('装備できません', COL.bad);
    else ui.notify(`${it.name} を装備した！`, rarityInfo(it.rarity).color);
    win.sel = null;
  } else if (it.type === 'consumable') {
    doUseItem(g, it.id); // 失敗時の通知は inventory.useItem 側が出す
  }
}
function togglePotion(ui, id) {
  const st = ui.game.state;
  st.potionBar = st.potionBar || [null, null];
  const i = st.potionBar.indexOf(id);
  if (i >= 0) { st.potionBar[i] = null; ui.notify(`[${i + 1}] の登録を解除`, COL.dim); return; }
  const empty = st.potionBar.findIndex((v) => !v);
  ui.assignPotion(id, empty >= 0 ? empty : 0);
}

// ======================= スキル =======================
const TIER_TABS = ['基本', '1次', '2次', '3次', '4次'];
function skillTierOf(sk) { return sk?.reqJob ? (JOBS[sk.reqJob]?.tier || 1) : 0; }
function skillListFor(st, tier) {
  const cur = currentJob(st);
  const curId = cur?.id || 'beginner';
  const all = skillsForHero(st.heroId, st, { allJobs: true });
  return all.filter((s) => s && skillTierOf(s) === tier && (!s.reqJob || hasJob(st, s.reqJob) || jobLineage(s.reqJob).some((j) => j.id === curId)))
    .sort((a, b) => (a.reqJob || '').localeCompare(b.reqJob || '') || (a.reqLevel || 0) - (b.reqLevel || 0));
}
function drawSkills(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const t = g.time || 0;
  const job = currentJob(st);
  if (win.tab == null || win._tabInit !== true) { win.tab = Math.max(0, Math.min(4, job?.tier || 0)); win._tabInit = true; }
  // ヘッダー
  txt(ctx, `${charName(st)}  ・  ${job?.name || '見習い'}`, x + 20, y + 58, { size: 15, color: COL.sub, maxW: 300 });
  // SP（段階別プール）
  const pools = [1, 2, 3, 4];
  pools.forEach((tier, i) => {
    const sp = getSp(st, tier);
    const r = { x: x + w - 4 * 92 - 14 + i * 92, y: y + 44, w: 86, h: 28 };
    const on = (win.tab <= 1 ? 1 : win.tab) === tier;
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = sp > 0 ? 'rgba(255,212,71,0.25)' : 'rgba(0,0,0,0.4)'; ctx.fill();
    ctx.lineWidth = on ? 2.5 : 1.2; ctx.strokeStyle = on ? COL.gold : 'rgba(255,212,71,0.4)'; ctx.stroke();
    ctx.restore();
    txt(ctx, `${tier === 1 ? '基本+1次' : tier + '次'} SP ${sp}`, r.x + r.w / 2, r.y + 15, { size: 11.5, align: 'center', color: sp > 0 ? COL.gold : COL.sub, glow: sp > 0 && on ? COL.gold : null, sw: 2.5 });
  });
  // タブ
  TIER_TABS.forEach((lab, i) => {
    const r = { x: x + 16 + i * 84, y: y + 80, w: 78, h: 30 };
    const on = win.tab === i, hov = ui.hover(win, r);
    const lockedTab = i > 0 && (job?.tier || 0) < i && !skillListFor(st, i).length;
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 10);
    if (on) { const gg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); gg.addColorStop(0, COL.pink); gg.addColorStop(1, COL.purple); ctx.fillStyle = gg; } else ctx.fillStyle = hov ? 'rgba(123,47,247,0.55)' : 'rgba(10,6,30,0.55)';
    ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff' : 'rgba(200,180,255,0.5)'; ctx.stroke();
    ctx.restore();
    txt(ctx, lab + (lockedTab ? ' 🔒' : ''), r.x + r.w / 2, r.y + 16, { size: 14, align: 'center', color: on ? '#fff' : lockedTab ? COL.dim : COL.sub });
    ui.hit(win, 'stab' + i, r, { onClick: () => { win.tab = i; win.page = 0; win.sel = null; } });
  });
  const list = skillListFor(st, win.tab);
  const lx = x + 16, ly = y + 118, lw = 440, RH = 50, PER = 8;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  // ページ送りはリストの下（タブ行に置くと 5 個目の「4次」タブに重なっていた）
  pager(ui, ctx, win, lx + lw / 2 - 56, ly + PER * RH + 1, pages);
  if (!list.length) {
    txt(ctx, win.tab === 0 ? 'スキルがありません' : `${win.tab}次転職（Lv.${[0, 10, 30, 60, 100][win.tab]}）で解放`, lx + lw / 2, ly + 140, { size: 15, align: 'center', color: COL.dim });
    txt(ctx, '頭上の「⬆ 転職できる！」吹き出しから転職ミッションを受注しよう', lx + lw / 2, ly + 168, { size: 12, align: 'center', color: COL.dim, maxW: lw - 20 });
  }
  if (!win.sel || !list.some((s) => s.id === win.sel)) win.sel = list[0]?.id || null;
  list.slice((win.page || 0) * PER, (win.page || 0) * PER + PER).forEach((sk, k) => {
    const r = { x: lx, y: ly + k * RH, w: lw, h: RH - 5 };
    const lv = st.skills?.[sk.id] || 0, max = sk.maxLevel || 10;
    const lock = jobLockOf(st, sk.id);
    const lvLocked = (st.level || 1) < (sk.reqLevel || 0);
    const locked = !!lock || lvLocked;
    const hov = ui.hover(win, r), on = win.sel === sk.id;
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: on ? 'rgba(25,211,197,0.25)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.55)', stroke: on ? COL.teal : undefined, lw: on ? 2 : 1.5 });
    ctx.save(); if (locked) ctx.globalAlpha = 0.45;
    drawSkillIco(ctx, sk, r.x + 25, r.y + r.h / 2, 36);
    ctx.restore();
    if (lv <= 0 && !locked) { ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; rrPath(ctx, r.x + 7, r.y + 4, 36, 36, 8); ctx.fill(); ctx.restore(); }
    if (lock) txt(ctx, '🔒', r.x + 36, r.y + 34, { size: 12, align: 'center', stroke: false });
    txt(ctx, sk.name, r.x + 52, r.y + 14, { size: 14.5, color: locked ? COL.dim : '#fff', maxW: 190 });
    const nameW = Math.min(190, measure(ctx, sk.name, 14.5));
    const kl = kindLabel(sk);
    txt(ctx, kl, r.x + 60 + nameW, r.y + 14, { size: 10.5, color: sk.kind === 'passive' ? COL.gold : sk.kind === 'move' ? '#7fe9ff' : COL.teal, sw: 2.5 });
    const sub = lock ? `「${lock.jobName}」に転職で習得` : lvLocked ? `Lv.${sk.reqLevel} で習得可能` : (sk.desc || '');
    txt(ctx, sub, r.x + 52, r.y + 32, { size: 11, color: lock || lvLocked ? COL.bad : COL.sub, maxW: r.w - 52 - 120, sw: 2.5, weight: 700 });
    txt(ctx, `Lv ${lv}/${max}`, r.x + r.w - 52, r.y + r.h / 2, { size: 13.5, align: 'right', color: lv >= max ? COL.gold : '#fff' });
    const pool = skillSpTier(sk);
    const can = !locked && getSp(st, pool) > 0 && lv < max;
    ui.btn(ctx, win, 'learn:' + sk.id, { x: r.x + r.w - 42, y: r.y + 7, w: 34, h: 31 }, '+', () => {
      const ok = doLearn(g, sk.id);
      if (ok) ui.notify(`${sk.name} が Lv${(st.skills?.[sk.id] || 0)} になった！`, COL.gold);
    }, { disabled: !can, color: COL.orange, size: 20 });
    if (hov) ui.setTip(skillTip(g, sk));
    ui.hit(win, 'sk:' + sk.id, { x: r.x, y: r.y, w: r.w - 48, h: r.h }, {
      onClick: () => { win.sel = sk.id; win.pvT = t; },
      onDbl: () => {
        const bar = st.skillBar || [];
        const e = Array.from({ length: SKILL_BAR_SIZE }, (_, i) => i).find((i) => !bar[i]);
        ui.assignSkill(sk.id, e ?? 0);
      },
      drag: lv > 0 && sk.kind !== 'passive' ? { kind: 'skill', id: sk.id } : null,
    });
  });
  // 右: プレビュー＋詳細
  const px = x + 472, pw = w - 472 - 16, py = y + 118;
  const sel = skillDef(win.sel);
  drawSkillPreview(ctx, sel, { x: px, y: py, w: pw, h: 196 }, t - (win.pvT || 0), charLook(st), equipLooks(st), {
    mult: guard('pv.mult', () => (typeof sel?.mult === 'function' ? sel.mult(Math.max(1, st.skills?.[sel?.id] || 1)) : sel?.mult), 1) || 1,
    arrival: !!(sel?.kind === 'move' && moveParams(st, sel.id, Math.max(1, st.skills?.[sel.id] || 1))?.arrivalBlast),
  });
  txt(ctx, '▶ 動きのプレビュー', px + 10, py + 14, { size: 11, color: '#ffe3f0', sw: 2.5 });
  const dy = py + 206, dh = y + h - 96 - dy;
  inset(ctx, px, dy, pw, dh, { r: 12 });
  if (sel) {
    const lv = st.skills?.[sel.id] || 0, l = Math.max(1, lv), max = sel.maxLevel || 10;
    let yy = dy + 20;
    txt(ctx, sel.name, px + 14, yy, { size: 17, color: sel.color || COL.teal, maxW: pw - 120 });
    txt(ctx, `Lv ${lv}/${max}`, px + pw - 14, yy, { size: 14, align: 'right', color: lv >= max ? COL.gold : '#fff' });
    yy += 22;
    const reqJ = sel.reqJob ? JOBS[sel.reqJob] : null;
    txt(ctx, `${kindLabel(sel)}  ・  ${reqJ ? reqJ.name : '基本スキル'}  ・  SP: ${skillSpTier(sel) <= 1 ? '基本+1次' : skillSpTier(sel) + '次'}`, px + 14, yy, { size: 11.5, color: COL.sub, sw: 2.5, maxW: pw - 28 });
    yy += 20;
    for (const ln of wrap(ctx, sel.desc || '', pw - 28, 12.5, 700).slice(0, 3)) { txt(ctx, ln, px + 14, yy, { size: 12.5, weight: 700, sw: 2.5 }); yy += 18; }
    yy += 4;
    const parts = [];
    if (sel.kind !== 'passive') {
      parts.push(`MP ${skillMp(sel, l)}`, `CT ${fmtVal('cd', skillCd(sel, l))}秒`);
      const mult = guard('skill.mult', () => (typeof sel.mult === 'function' ? sel.mult(l) : sel.mult), null);
      if (mult) parts.push(`威力 ${Math.round(mult * 100)}%`);
      if (sel.hits > 1) parts.push(`${sel.hits}ヒット`);
    }
    if (sel.kind === 'move') {
      const mp = moveParams(st, sel.id, l);
      if (mp) {
        if (mp.distance) parts.push(`距離 ${Math.round(mp.distance)}px`);
        if (mp.invuln) parts.push(`無敵 ${mp.invuln}秒`);
        if (mp.enhancedBy?.length) parts.push(`強化: ${mp.enhancedBy.map((id) => skillDef(id)?.name || id).join('・')}`);
      }
    }
    if (sel.enhances) parts.push(`強化対象: ${skillDef(sel.enhances)?.name || sel.enhances}`);
    const buf = guard('skill.buff', () => (typeof sel.buff === 'function' ? sel.buff(l) : sel.buff), null);
    if (buf && typeof buf === 'object') {
      if (buf.duration) parts.push(`${buf.duration}秒`);
      for (const [k, v] of Object.entries(buf)) if (k !== 'duration' && typeof v === 'number' && v) parts.push(`${STAT_LABELS[k] || ({ speedPct: '移動速度', atkPct: '攻撃力', attackSpeedPct: '攻撃速度', defPct: '防御', critPct: 'クリ率' }[k]) || k} ${Math.abs(v) < 1 ? '+' + Math.round(v * 100) + '%' : '+' + v}`);
    }
    for (const ln of wrap(ctx, (lv ? '現在: ' : 'Lv1: ') + (parts.join('  ') || '—'), pw - 28, 12, 800).slice(0, 3)) { txt(ctx, ln, px + 14, yy, { size: 12, color: '#d8f6ff', sw: 2.5 }); yy += 17; }
    if (lv > 0 && lv < max && sel.kind !== 'passive') {
      const m2 = guard('skill.mult', () => (typeof sel.mult === 'function' ? sel.mult(lv + 1) : sel.mult), null);
      if (m2) txt(ctx, `次Lv: 威力 ${Math.round(m2 * 100)}%  MP ${skillMp(sel, lv + 1)}`, px + 14, yy, { size: 12, color: COL.good, sw: 2.5 });
    }
    if (sel.townOk) txt(ctx, '町でも使用可', px + pw - 14, dy + dh - 14, { size: 11, align: 'right', color: COL.good, sw: 2.5 });
  } else txt(ctx, 'スキルを選ぶと動きを再生します', px + pw / 2, dy + dh / 2, { size: 13, align: 'center', color: COL.dim });
  // スキルバー登録（8枠）
  const by = y + h - 84;
  inset(ctx, x + 16, by, w - 32, 70, { r: 12, fill: 'rgba(25,211,197,0.10)', stroke: 'rgba(25,211,197,0.5)' });
  txt(ctx, 'スキルバー', x + 30, by + 20, { size: 13, color: COL.teal });
  txt(ctx, sel && sel.kind !== 'passive' ? `「${sel.name}」をクリックした枠へ` : 'ドラッグ or 選んで枠をクリック', x + 30, by + 46, { size: 11, color: COL.sub, maxW: 190, weight: 700 });
  const n = SKILL_BAR_SIZE, sw = 56;
  for (let i = 0; i < n; i++) {
    const r = { x: x + w - 32 - n * sw + i * sw + 8, y: by + 11, w: 48, h: 48 };
    const hov = ui.hover(win, r);
    slotBox(ctx, r, null, { hover: hov });
    const sk = skillDef(st.skillBar?.[i]);
    if (sk) drawSkillIco(ctx, sk, r.x + 24, r.y + 24, 38);
    ctx.save(); rrPath(ctx, r.x - 3, r.y - 5, 18, 16, 5); ctx.fillStyle = COL.teal; ctx.fill(); ctx.restore();
    txt(ctx, BAR_KEYS[i], r.x + 6, r.y + 3.5, { size: 11, align: 'center', sw: 2.5 });
    if (hov && sk) ui.setTip(skillTip(g, sk));
    ui.hit(win, 'bar' + i, r, {
      onClick: () => { if (win.sel) ui.assignSkill(win.sel, i); },
      onRight: () => { if (st.skillBar) st.skillBar[i] = null; },
      onDrop: (pl) => { if (pl.kind === 'skill') ui.assignSkill(pl.id, i); },
    });
  }
}

// ======================= ステータス =======================
const STAT_DESC = { str: '近接攻撃力・最大HP', dex: '銃攻撃力・命中', int: '魔法攻撃力・最大MP', luk: 'クリティカル・ドロップ率' };
function drawStats(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w } = win;
  txt(ctx, `${charName(st)}   Lv.${st.level || 1}`, x + 20, y + 60, { size: 15 });
  ctx.save();
  rrPath(ctx, x + w - 140, y + 46, 122, 28, 14);
  ctx.fillStyle = (st.ap || 0) > 0 ? 'rgba(255,212,71,0.25)' : 'rgba(0,0,0,0.4)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = COL.gold; ctx.stroke();
  ctx.restore();
  txt(ctx, `AP  ${st.ap || 0}`, x + w - 79, y + 61, { size: 16, align: 'center', color: COL.gold, glow: (st.ap || 0) > 0 ? COL.gold : null });
  const keys = ['str', 'dex', 'int', 'luk'];
  let apHover = null;
  keys.forEach((k, i) => {
    const r = { x: x + 16, y: y + 84 + i * 54, w: w - 32, h: 48 };
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10 });
    txt(ctx, k.toUpperCase(), r.x + 16, r.y + 17, { size: 18, color: [COL.pink, COL.teal, '#a98bff', COL.gold][i] });
    txt(ctx, STAT_DESC[k], r.x + 16, r.y + 36, { size: 11, color: COL.sub, sw: 2.5, weight: 700 });
    txt(ctx, st.stats?.[k] ?? 0, r.x + r.w - 62, r.y + r.h / 2, { size: 22, align: 'right' });
    const hovAp = ui.btn(ctx, win, 'ap:' + k, { x: r.x + r.w - 46, y: r.y + 8, w: 34, h: 32 }, '+', () => {
      if ((st.ap || 0) <= 0) return;
      st.stats = st.stats || {};
      st.stats[k] = (st.stats[k] || 0) + 1;
      st.ap--;
      refreshPlayerStats(g);
    }, { disabled: (st.ap || 0) <= 0, color: COL.orange, size: 20 });
    if (hovAp && (st.ap || 0) > 0) apHover = k;
  });
  const cs = stats(g);
  // 通常攻撃のダメージ幅（防御0の相手）
  drawDmgBox(ui, ctx, win, x + 16, y + 84 + 4 * 54, w - 32, 58, cs, apHover);
  // 詳細ステータス
  const dy = y + 84 + 4 * 54 + 64;
  txt(ctx, '◆ 詳細ステータス', x + 20, dy + 10, { size: 14, color: COL.teal });
  const rows = [
    ['maxHp', '最大HP'], ['maxMp', '最大MP'], ['atk', '攻撃力'], ['def', '防御力'], ['speed', '移動速度'], ['jump', 'ジャンプ'],
    ['crit', 'クリ率'], ['critDmg', 'クリダメ'], ['attackSpeed', '攻撃速度'], ['range', '射程'], ['weaponType', '武器'], ['luck', '幸運'],
  ];
  const cw = (w - 40) / 2;
  rows.forEach(([k, lab], i) => {
    const cx = x + 20 + (i % 2) * cw, cy = dy + 32 + Math.floor(i / 2) * 25;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(cx, cy - 11, cw - 8, 22);
    txt(ctx, lab, cx + 8, cy, { size: 12.5, color: COL.sub, sw: 2.5 });
    let v = cs[k];
    v = k === 'weaponType' ? (WT[v] || v || '素手') : fmtVal(k, v ?? 0);
    txt(ctx, v, cx + cw - 16, cy, { size: 13.5, align: 'right' });
  });
  // 職業と転職履歴
  const jy = dy + 32 + 6 * 25 + 4;
  const job = currentJob(st);
  inset(ctx, x + 16, jy, w - 32, 84, { r: 10 });
  txt(ctx, '◆ 職業', x + 28, jy + 16, { size: 13, color: COL.pink });
  txt(ctx, `${job?.name || '見習い'}（${job?.title || ''}）`, x + 88, jy + 16, { size: 13.5, color: job?.aura || '#fff', maxW: w - 120 });
  txt(ctx, `クラス: ${classOf(st.heroId)?.name || ''}`, x + w - 28, jy + 16, { size: 11, align: 'right', color: COL.sub, sw: 2.5 });
  const hist = Array.isArray(st.job?.history) ? st.job.history : [];
  const chain = ['見習い', ...hist.map((e) => `${JOBS[e.id]?.name || e.id}${e.level ? `(Lv${e.level})` : ''}`)].join(' → ');
  for (const [i, ln] of wrap(ctx, '転職履歴: ' + chain, w - 56, 11.5, 700).slice(0, 3).entries()) txt(ctx, ln, x + 28, jy + 38 + i * 16, { size: 11.5, color: COL.sub, weight: 700, sw: 2.5 });
}
// 能力画面: 通常攻撃1発のダメージ幅。値が変わったら差分を少しの間だけ出す。＋ボタンに乗せると振った後の値を予告
function drawDmgBox(ui, ctx, win, bx, by, bw, bh, cs, apHover) {
  const g = ui.game, st = g.state;
  const r = dmgRange(cs);
  if (!r) return;
  const t = g.time || ui.frame / 60;
  const prev = win._dmg;
  if (prev && (prev.lo !== r.lo || prev.hi !== r.hi)) win._dmgFx = { d: r.lo - prev.lo, d2: r.hi - prev.hi, t0: t };
  win._dmg = { lo: r.lo, hi: r.hi };
  const fx = win._dmgFx && t - win._dmgFx.t0 < 2 ? win._dmgFx : null;
  const k = fx ? 1 - (t - fx.t0) / 2 : 0;
  inset(ctx, bx, by, bw, bh, { r: 10, fill: 'rgba(40,10,40,0.55)', stroke: fx ? rgba(fx.d >= 0 ? COL.good : COL.bad, 0.5 + 0.5 * k) : rgba(COL.orange, 0.6), lw: fx ? 2 : 1.5 });
  txt(ctx, '◆ 通常攻撃ダメージ', bx + 12, by + 16, { size: 12.5, color: COL.orange, sw: 2.5 });
  txt(ctx, '防御0の相手・1発', bx + 12, by + 38, { size: 10.5, color: COL.dim, sw: 2.5, weight: 700 });
  const vx = bx + bw - 14;
  txt(ctx, fmtRange(r), vx, by + 20, { size: 22, align: 'right', color: '#ffe7b0', glow: fx ? (fx.d >= 0 ? COL.good : COL.bad) : null, glowBlur: 10 * k });
  txt(ctx, `クリティカル ${fmtRange(r, true)}（率 ${Math.round(r.crit * 100)}%）`, vx, by + 43, { size: 11.5, align: 'right', color: '#ff9ad5', sw: 2.5 });
  // 差分 / ＋ボタンのプレビュー
  let note = null;
  if (apHover) {
    const r2 = dmgRange(statsWithAp(st, apHover, 1));
    if (r2) note = { s: `${apHover.toUpperCase()}+1 → ${fmtRange(r2)}`, c: r2.hi > r.hi || r2.lo > r.lo ? COL.good : COL.sub, a: 1 };
  } else if (fx && (fx.d || fx.d2)) {
    const sg = (v) => (v > 0 ? '+' : '') + v;
    note = { s: `${sg(fx.d)}〜${sg(fx.d2)}`, c: fx.d + fx.d2 >= 0 ? COL.good : COL.bad, a: Math.min(1, k * 2) };
  }
  if (note) txt(ctx, note.s, bx + 150, by + 16, { size: 12, color: note.c, sw: 3, alpha: note.a, maxW: bw - 150 - 14 - measure(ctx, fmtRange(r), 22) - 8 });
}
function refreshPlayerStats(g) {
  const v = computeStatsRaw(g.state);
  guard('player.stats', () => {
    if (typeof g.player?.refreshStats === 'function') g.player.refreshStats();
    else if (typeof g.player?.recalcStats === 'function') g.player.recalcStats();
    else if (v && g.player && typeof g.player.stats === 'object') g.player.stats = v;
  });
  guard('emit', () => g.events?.emit?.('statsChanged', {}));
}

// ======================= ミッション（クエストナビ） =======================
function drawMissions(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const t = g.time || 0;
  const M = st.missions || { active: [], completed: [] };
  tabs(ui, ctx, win, x + 16, y + 46, ['進行中', '受注可能', '完了']);
  const all = Object.values(allMissions()).filter(Boolean);
  let ids;
  if (win.tab === 0) ids = (M.active || []).slice();
  else if (win.tab === 2) ids = (M.completed || []).slice();
  else {
    ids = all.filter((m) => m.type !== 'job' && !(M.active || []).includes(m.id) && !(M.completed || []).includes(m.id) &&
      guard('canAccept', () => g.missions?.canAccept?.(m.id), (st.level || 1) >= (m.reqLevel || 0)) !== false).map((m) => m.id);
  }
  const lx = x + 16, ly = y + 86, lw = 260, RH = 40, PER = Math.floor((h - 102) / RH);
  const pages = Math.max(1, Math.ceil(ids.length / PER));
  win.page = clamp(win.page || 0, 0, pages - 1);
  pager(ui, ctx, win, x + 16 + 3 * 106, y + 48, pages);
  if (win.sel == null || !ids.includes(win.sel)) win.sel = ids[0] ?? null;
  const tracked = trackedMissionId(g);
  ids.slice(win.page * PER, win.page * PER + PER).forEach((id, k) => {
    const m = missionDef(id);
    const r = { x: lx, y: ly + k * RH, w: lw, h: RH - 5 };
    const on = win.sel === id, hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 9, fill: on ? 'rgba(255,95,162,0.3)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.55)', stroke: on ? '#fff' : undefined });
    const done = win.tab === 0 && guard('isComplete', () => g.missions?.isComplete?.(id), false);
    const cat = m?.type === 'job' ? '#ff6ad5' : m?.category === 'main' ? COL.gold : m?.daily ? COL.good : '#7fe9ff';
    ctx.save(); rrPath(ctx, r.x + 4, r.y + 6, 4, r.h - 12, 2); ctx.fillStyle = cat; ctx.fill(); ctx.restore();
    const mark = win.tab === 2 ? '✔ ' : done ? '？ ' : win.tab === 1 ? '！ ' : (tracked === id ? '⌖ ' : '◆ ');
    txt(ctx, mark + (m?.name || id), r.x + 14, r.y + r.h / 2, {
      size: 13.5, color: win.tab === 2 ? COL.dim : done ? '#c6ff6a' : win.tab === 1 ? COL.gold : tracked === id ? '#7fe9ff' : '#fff', maxW: lw - 24,
    });
    ui.hit(win, 'm:' + id, r, { onClick: () => { win.sel = id; } });
  });
  // 詳細
  const dx = lx + lw + 12, dw = x + w - 16 - dx, dy = ly, dh = y + h - 16 - dy;
  inset(ctx, dx, dy, dw, dh, { r: 12 });
  if (!ids.length) txt(ctx, ['進行中のミッションはありません', '受注できるミッションはありません', 'まだ完了したミッションはありません'][win.tab], dx + dw / 2, dy + dh / 2, { size: 15, align: 'center', color: COL.dim, maxW: dw - 24 });
  const m = missionDef(win.sel);
  if (!m) return;
  let yy = dy + 22;
  txt(ctx, m.name, dx + 16, yy, { size: 18, color: m.type === 'job' ? '#ff9ad5' : COL.gold, maxW: dw - 32 }); yy += 24;
  const giver = findNpcName(g, m.giver);
  const tn = turnInNpc(m);
  const giverMap = MISSION_NPCS[m.giver]?.mapId;
  txt(ctx, `依頼人: ${giver}${giverMap ? `（${mapInfo(giverMap).name}）` : ''}   報告: ${findNpcName(g, tn)}   推奨Lv ${m.reqLevel || 1}`, dx + 16, yy, { size: 11.5, color: COL.sub, sw: 2.5, maxW: dw - 32 }); yy += 20;
  for (const l of wrap(ctx, m.desc || '', dw - 32, 12.5, 700).slice(0, 2)) { txt(ctx, l, dx + 16, yy, { size: 12.5, weight: 700, sw: 2.5 }); yy += 18; }
  yy += 6;
  txt(ctx, '◆ 目標とナビ', dx + 16, yy, { size: 14, color: COL.teal }); yy += 12;
  const active = (M.active || []).includes(m.id);
  const guide = missionGuide(g, m.id);
  const vals = active ? (guard('objValues', () => g.missions?.objectiveValues?.(m.id), null) || []) : [];
  const complete = active && guard('isComplete', () => g.missions?.isComplete?.(m.id), false);
  const rowsMax = Math.min(guide.length || (m.objectives || []).length, 4);
  const objs = m.objectives || [];
  for (let i = 0; i < rowsMax; i++) {
    const gd = guide[i] || {};
    const o = objs[gd.objIndex ?? i] || {};
    const v = Math.min(vals[gd.objIndex ?? i] ?? gd.value ?? 0, o.count || 1);
    const dn = win.tab === 2 || gd.done || (active && v >= (o.count || 1)) || (complete && o.type === 'talk');
    const r = { x: dx + 10, y: yy, w: dw - 20, h: 50 };
    inset(ctx, r.x, r.y, r.w, r.h, { r: 9, fill: dn ? 'rgba(124,255,155,0.08)' : 'rgba(6,4,24,0.5)', stroke: dn ? 'rgba(124,255,155,0.45)' : undefined });
    txt(ctx, (dn ? '✔ ' : '・') + (gd.text || o.text || o.type), r.x + 10, r.y + 15, { size: 13, color: dn ? '#c6ff6a' : '#fff', maxW: r.w - 90, sw: 2.5 });
    if ((o.count || 1) > 1 || o.type === 'drive') txt(ctx, `${Math.floor(v)} / ${o.count}`, r.x + r.w - 10, r.y + 15, { size: 13, align: 'right', color: dn ? '#c6ff6a' : COL.gold });
    const info = [];
    if (gd.mapName || gd.mapId) { const mi = mapInfo(gd.mapId); info.push(`📍 ${gd.mapName || mi.name}${mi.levelRange ? ` Lv${mi.levelRange[0]}-${mi.levelRange[1]}` : mi.town ? '（町）' : ''}`); }
    if (gd.npcName) info.push(`💬 ${gd.npcName}${gd.npcMapId ? `（${mapInfo(gd.npcMapId).name}）` : ''}`);
    else if (gd.targetName && o.type !== 'reach') info.push(`${o.type === 'collect' ? '🎁' : '⚔'} ${gd.targetName}`);
    if (gd.route?.length > 1 && !dn) info.push(`🧭 ${gd.route.length - 1}マップ先`);
    txt(ctx, info.join('   '), r.x + 18, r.y + 35, { size: 11, color: COL.sub, maxW: r.w - 28, sw: 2.5, weight: 700 });
    yy += 54;
  }
  if (complete) { txt(ctx, `→ ${findNpcName(g, tn)} に報告しよう${MISSION_NPCS[tn]?.mapId ? `（${mapInfo(MISSION_NPCS[tn].mapId).name}）` : ''}`, dx + 16, yy + 8, { size: 13, color: COL.gold, maxW: dw - 32 }); yy += 22; }
  // 報酬
  yy = Math.max(yy + 6, dy + dh - 104);
  txt(ctx, '◆ 報酬', dx + 16, yy, { size: 14, color: COL.pink });
  txt(ctx, rewardText(m.reward || {}), dx + 80, yy, { size: 12.5, color: COL.gold, maxW: dw - 96, sw: 2.5 });
  if (m.choices?.length) txt(ctx, `※ 選択肢で結末が変わる（${m.choices.map((c) => c.text).join(' / ')}）`, dx + 16, yy + 20, { size: 11, color: '#ffd6e8', maxW: dw - 32, sw: 2.5 });
  // ボタン
  const by = dy + dh - 58;
  const targets = guide.filter((e) => !e.done).map((e) => e.mapId || e.npcMapId).filter(Boolean);
  const dest = complete ? MISSION_NPCS[tn]?.mapId : targets[0];
  const route = complete ? routeTo(g, dest) : (guide.find((e) => !e.done && e.route?.length)?.route || (dest ? routeTo(g, dest) : []));
  ui.btn(ctx, win, 'wmShow', { x: dx + 12, y: by, w: 220, h: 44 }, '🗺 ワールドマップで表示', () => {
    ui.open('worldmap', { focus: { missionId: m.id, name: m.name, maps: complete ? [dest].filter(Boolean) : Array.from(new Set(targets.length ? targets : guide.map((e) => e.mapId).filter(Boolean))), route, dest } });
  }, { color: '#109f95', size: 14, disabled: !(targets.length || dest || guide.some((e) => e.mapId)) });
  if (active) {
    const isT = tracked === m.id;
    ui.btn(ctx, win, 'track', { x: dx + 242, y: by, w: 170, h: 44 }, isT ? '⌖ ナビ追跡中' : '⌖ ナビで追跡', () => { setTracked(g, m.id); ui.notify(`ナビ: 「${m.name}」を追跡`, '#7fe9ff'); }, { color: isT ? '#c98a1a' : COL.purple, size: 14, active: isT });
    if (m.type !== 'job' && m.category !== 'main') {
      ui.btn(ctx, win, 'abandon', { x: dx + dw - 112, y: by, w: 100, h: 44 }, '破棄', () => {
        win.confirm = { id: m.id };
      }, { color: '#8a2a4a', size: 13 });
    }
  }
  if (win.confirm) {
    ctx.save(); rrPath(ctx, dx, dy, dw, dh, 12); ctx.fillStyle = 'rgba(6,2,20,0.85)'; ctx.fill(); ctx.restore();
    txt(ctx, `「${missionDef(win.confirm.id)?.name}」を破棄しますか？`, dx + dw / 2, dy + dh / 2 - 30, { size: 15, align: 'center', maxW: dw - 30 });
    txt(ctx, '進捗はリセットされます（あとで受け直せます）', dx + dw / 2, dy + dh / 2 - 4, { size: 12, align: 'center', color: COL.sub });
    ui.btn(ctx, win, 'abYes', { x: dx + dw / 2 - 170, y: dy + dh / 2 + 20, w: 160, h: 40 }, '破棄する', () => { guard('abandon', () => g.missions?.abandon?.(win.confirm.id)); win.confirm = null; }, { color: '#c02a52', size: 14 });
    ui.btn(ctx, win, 'abNo', { x: dx + dw / 2 + 10, y: dy + dh / 2 + 20, w: 160, h: 40 }, 'やめる', () => { win.confirm = null; }, { color: COL.purple, size: 14 });
  }
  void t;
}
function findNpcName(g, id) {
  if (!id) return '???';
  const n = (g.npcs || []).find((e) => e.id === id || e.data?.id === id) || (g.map?.npcs || []).find((e) => e.id === id);
  return n?.name || n?.data?.name || missionNpcName(id) || id;
}
function rewardText(rw) {
  const parts = [];
  if (rw.exp) parts.push(`EXP +${rw.exp}`);
  if (rw.money) parts.push(fmtMoney(rw.money));
  if (rw.sp) parts.push(`SP +${rw.sp}`);
  const cnt = new Map();
  for (const id of rw.items || []) cnt.set(id, (cnt.get(id) || 0) + 1);
  for (const [id, n] of cnt) { const it = getItemDef(id); if (it) parts.push(it.name + (n > 1 ? `×${n}` : '')); }
  return parts.join('   ') || '—';
}

// ======================= 会話 =======================
function npcOf(win) { return win.data?.npc || win.data || {}; }
export function initDialog(ui, win) {
  const npc = npcOf(win);
  win.brief = null; win.reward = null;
  say(win, npc.dialog?.length ? npc.dialog : ['…やあ。'], null);
}
// 主人公のセリフ: 行の先頭に "@me:" / "@hero:"（全角コロン可）を付けると主人公が話す行（名前プレート・立ち絵が主人公に）
const HERO_LINE = /^@(?:me|hero)\s*[:：]\s*/;
function say(win, lines, after) {
  win.who = [];
  win.lines = (Array.isArray(lines) ? lines : [String(lines)]).map((l) => {
    const s = String(l), m = HERO_LINE.exec(s);
    win.who.push(m ? 'me' : null);
    return m ? s.slice(m[0].length) : s;
  });
  if (!win.lines.length) { win.lines = ['…']; win.who = [null]; }
  win.li = 0; win.chars = 0; win.opts = null; win.optSel = 0; win.after = after;
}
function advance(ui, win) {
  const line = win.lines?.[win.li] || '';
  if (win.chars < line.length) { win.chars = line.length; return; }
  if (win.li < win.lines.length - 1) { win.li++; win.chars = 0; return; }
  if (win.opts) return;
  const after = win.after;
  win.after = null;
  if (after) after(); else menu(ui, win);
}
function npcMissions(ui, npc) {
  const g = ui.game, st = g.state, mm = g.missions;
  const act = st.missions?.active || [], done = st.missions?.completed || [];
  const map = new Map();
  for (const a of guard('missions.available', () => mm?.available?.(npc.id), []) || []) { const m = missionDef(a); if (m) map.set(m.id, m); }
  // 報告先は m.turnIn || m.giver（MissionManager.completable / inProgress も併用）
  for (const a of guard('missions.completable', () => mm?.completable?.(npc.id), []) || []) { const m = missionDef(a); if (m) map.set(m.id, m); }
  for (const a of guard('missions.inProgress', () => mm?.inProgress?.(npc.id), []) || []) { const m = missionDef(a); if (m) map.set(m.id, m); }
  for (const id of act) { const m = missionDef(id); if (m && turnInNpc(m) === npc.id) map.set(id, m); }
  const out = [];
  for (const m of map.values()) {
    let status = null;
    if (act.includes(m.id)) status = guard('isComplete', () => mm?.isComplete?.(m.id), false) ? 'report' : 'active';
    else if (!done.includes(m.id) || m.daily || m.repeat) status = guard('canAccept', () => mm?.canAccept?.(m.id), true) !== false ? 'offer' : null;
    if (status) out.push({ m, status });
  }
  const order = { report: 0, offer: 1, active: 2 };
  return out.sort((a, b) => order[a.status] - order[b.status]);
}
// ストーリー分岐: m.choices = [{id, text, reward, flag, dialog?}] を会話窓の選択肢に出し MissionManager.choose で確定
function chosenOf(g, id) {
  const ms = g.state?.missions;
  if (typeof g.missions?.needsChoice === 'function') return guard('needsChoice', () => !g.missions.needsChoice(id), true) ? (g.state?.storyChoices?.[id] || true) : null;
  return g.state?.storyChoices?.[id] ?? ms?.choices?.[id] ?? null;
}
function askChoice(ui, win, m) {
  const g = ui.game;
  say(win, m.dialog?.choice?.length ? m.dialog.choice : (m.choicePrompt ? [m.choicePrompt] : ['……で、どうする？ ここが分かれ道だぜ。']), () => {
    win.brief = { ...m, desc: '選んだ道でセリフ・追加報酬・称号が変わる。', objectives: m.choices.map((c) => ({ text: `${c.text}  →  ${rewardText(c.reward || {})}` })) };
    win.opts = m.choices.map((c) => ({
      label: c.text, color: COL.gold, fn: () => {
        win.brief = null;
        const r = guard('choose', () => g.missions?.choose?.(m.id, c.id), null);
        if (r === false || r?.ok === false) { ui.notify(r?.msg || '選べませんでした', COL.bad); menu(ui, win); return; }
        if (r == null && g.state) (g.state.storyChoices ||= {})[m.id] = c.id; // choose 未実装時の保険
        const stillActive = (g.state?.missions?.active || []).includes(m.id);
        let rw = r?.reward || null;
        if (stillActive && guard('isComplete', () => g.missions?.isComplete?.(m.id), false)) rw = guard('turnIn', () => g.missions?.turnIn?.(m.id), null) || rw;
        say(win, c.dialog?.length ? c.dialog : (m.dialog?.done?.length ? m.dialog.done : ['……そうか。それがお前の答えか。']), () => {
          const R = m.reward || {}, C = c.reward || {};
          win.reward = { ...m, reward: { ...R, money: (R.money || 0) + (C.money || 0), items: [...(R.items || []), ...(C.items || [])] } };
          win.opts = [{ label: 'OK', fn: () => { win.reward = null; say(win, ['また頼むぜ。'], null); } }];
        });
        void rw;
      },
    }));
    win.opts.push({ label: 'もう少し考える', color: COL.dim, fn: () => { win.brief = null; menu(ui, win); } });
  });
}
function menu(ui, win) {
  const g = ui.game, npc = npcOf(win);
  const opts = [];
  for (const { m, status } of npcMissions(ui, npc)) {
    if (status === 'report') {
      opts.push({ label: '？ 報告: ' + m.name, color: '#c6ff6a', fn: () => {
        if (m.choices?.length && !chosenOf(g, m.id)) { askChoice(ui, win, m); return; }
        const res = guard('turnIn', () => g.missions?.turnIn?.(m.id), null);
        if (res === false) { ui.notify('まだ報告できません', COL.bad); return; } // 成功通知は MissionManager 側
        const doneLines = guard('mdialog', () => g.missions?.dialog?.(m.id, 'done'), null);
        say(win, doneLines?.length ? doneLines : m.dialog?.done?.length ? m.dialog.done : ['よくやってくれた！'], () => {
          win.reward = m;
          win.opts = [{ label: 'OK', fn: () => { win.reward = null; say(win, ['また頼むぜ。'], null); } }];
        });
      } });
    } else if (status === 'offer') {
      opts.push({ label: '！ 依頼: ' + m.name, color: COL.gold, fn: () => {
        say(win, m.dialog?.offer?.length ? m.dialog.offer : [m.desc || '頼みがある。'], () => {
          win.brief = m;
          win.opts = [
            { label: '受注する', color: COL.teal, fn: () => {
              const r = guard('accept', () => g.missions?.accept?.(m.id), null);
              win.brief = null;
              if (r === false) { ui.notify('受注できませんでした', COL.bad); menu(ui, win); return; }
              say(win, ['頼んだぜ。気をつけてな。'], null);
            } },
            { label: '断る', color: COL.dim, fn: () => { win.brief = null; say(win, ['そうか…気が向いたらまた来な。'], null); } },
          ];
        });
      } });
    } else {
      opts.push({ label: '… 進行中: ' + m.name, color: COL.sub, fn: () => {
        const tr = (guard('tracked', () => g.missions?.tracked?.(), []) || []).find((e) => e.name === m.name);
        say(win, ['まだ終わってないみたいだな。', ...(tr?.lines?.length ? [tr.lines.map(stripMark).join(' / ')] : [])], null);
      } });
    }
  }
  if (npc.shop?.length) opts.push({ label: '🛒 ショップ', color: COL.teal, fn: () => { ui.close('dialog'); ui.open('shop', { npc }); } });
  opts.push({ label: 'さようなら', color: COL.dim, fn: () => ui.close('dialog') });
  win.opts = opts;
  win.optSel = 0;
}
export function dialogKey(ui, win, P, eat) {
  if (!win || win.t < 0.15) return;
  const line = win.lines?.[win.li] || '';
  const lineDone = win.chars >= line.length && win.li >= (win.lines?.length || 1) - 1;
  if (win.opts && lineDone) {
    if (P('up')) win.optSel = (win.optSel - 1 + win.opts.length) % win.opts.length;
    if (P('down')) win.optSel = (win.optSel + 1) % win.opts.length;
    if (P('confirm') || P('interact')) { eat('confirm'); eat('interact'); win.opts[win.optSel]?.fn(); }
  } else if (P('confirm') || P('interact') || P('jump') || P('talk')) {
    eat('confirm'); eat('interact'); eat('talk');
    advance(ui, win);
  }
}
/** 会話での主人公の表情（立ち絵）: 報酬=smile、「！？」=surprised、「…」で始まる=sad、他は基本 */
function heroExprOf(win, line) {
  if (win.reward) return 'smile';
  if (/[!！][?？]|[?？][!！]/.test(line)) return 'surprised';
  if (/^[…‥]/.test(line)) return 'sad';
  if (/♪|ありがと|やった/.test(line)) return 'smile';
  return null;
}
function heroArtKey(g) {
  const st = g.state;
  if (!st) return null;
  const lk = guard('charLook', () => charLook(st), null) || {};
  const cls = lk.classId || st.heroId, gen = lk.gender || st.gender;
  return cls && gen ? cls + '_' + gen : null;
}
function drawDialog(ui, ctx, win) {
  const g = ui.game;
  const npc = npcOf(win);
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  const curLine = win.lines?.[win.li] || '';
  const heroKey = heroArtKey(g);
  const heroP = heroKey ? guard('portraitFor', () => SpriteM.portraitFor?.(heroKey, undefined, null), null) : null;
  const meTalks = win.who?.[win.li] === 'me';
  // 主人公の顔欄（立ち絵があるとき）: 窓の右上に立つ。主人公が話す/選ぶ時は明るく、相手が話す時は少し暗く
  if (heroP && !meTalks) {
    const lineDone0 = win.chars >= curLine.length && win.li >= (win.lines?.length || 1) - 1;
    const active = !!(win.opts && lineDone0);
    const bob = Math.sin(t * 2) * 1.5;
    guard('heroPortrait', () => SpriteM.drawPortrait(ctx, heroKey, heroExprOf(win, curLine), x + w - 96, y + 6 + bob, 196, { maxW: 180, flip: true, dim: active ? 0 : 0.35 }));
  }
  // 立ち絵
  const bx = x + 16, by = y + 16, bw = 170, bh = h - 32;
  ctx.save();
  rrPath(ctx, bx, by, bw, bh, 12);
  const bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, '#ff9a5c'); bg.addColorStop(0.5, '#c2459c'); bg.addColorStop(1, '#2a1260');
  ctx.fillStyle = bg; ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,230,140,0.5)';
  ctx.beginPath(); ctx.arc(bx + bw / 2, by + 90, 48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,6,40,0.55)';
  for (let i = 0; i < 7; i++) { const bw2 = 18 + (i * 37) % 22, bh2 = 40 + (i * 53) % 70; ctx.fillRect(bx + i * 26 - 4, by + bh - 40 - bh2, bw2, bh2 + 40); }
  // 主人公が話す行（"@me:"）で立ち絵があれば主人公の立ち絵、無ければ相手の姿
  // 立ち絵の上の方（顔〜腰）を枠の縦横比で切り出す
  const drewMe = meTalks && heroP && guard('heroPortrait', () => SpriteM.drawPortrait(ctx, heroKey, heroExprOf(win, curLine), bx + bw / 2, by + bh, bh - 6, { maxW: bw + 24, crop: [0, 0, 1, Math.min(1, heroP.w / (bw / bh) / heroP.h)] }), null);
  if (!drewMe) {
    if (meTalks) drawChar(ctx, bx + bw / 2, by + bh - 14, charLook(g.state), equipLooks(g.state), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 1.55 });
    else drawChar(ctx, bx + bw / 2, by + bh - 14, npc.look, looksFrom(npc.equip), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 1.55 });
  }
  ctx.restore();
  ctx.save(); rrPath(ctx, bx, by, bw, bh, 12); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke(); ctx.restore();
  // 名前プレート
  const nameStr = meTalks ? (guard('charName', () => charName(g.state), '') || 'あなた') : (npc.name || '???');
  const nw = Math.max(110, measure(ctx, nameStr, 16) + 30);
  ctx.save();
  rrPath(ctx, x + 204, y - 14, nw, 30, 15);
  const ng = ctx.createLinearGradient(x + 204, 0, x + 204 + nw, 0);
  ng.addColorStop(0, COL.pink); ng.addColorStop(1, COL.purple);
  ctx.fillStyle = ng; ctx.shadowColor = COL.pink; ctx.shadowBlur = 12; ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
  txt(ctx, nameStr, x + 204 + nw / 2, y + 1.5, { size: 16, align: 'center' });
  if (npc.title && !meTalks) txt(ctx, npc.title, x + 214 + nw, y + 2, { size: 12, color: COL.sub });

  const line = win.lines?.[win.li] || '';
  const lineDone = win.chars >= line.length && win.li >= (win.lines?.length || 1) - 1;
  const showOpts = win.opts && lineDone;
  const tx = x + 206, tw = showOpts ? w - 206 - 300 : w - 206 - 28;
  const ty = y + 40;
  if (win.brief && showOpts) {
    const m = win.brief;
    let yy = ty;
    txt(ctx, '！ ' + m.name, tx, yy, { size: 18, color: COL.gold, maxW: tw }); yy += 26;
    for (const l of wrap(ctx, m.desc || '', tw, 13, 700).slice(0, 2)) { txt(ctx, l, tx, yy, { size: 13, weight: 700, sw: 2.5 }); yy += 19; }
    for (const o of (m.objectives || []).slice(0, 3)) { txt(ctx, '◆ ' + (o.text || o.type), tx, yy, { size: 13, color: COL.teal, maxW: tw, sw: 2.5 }); yy += 19; }
    txt(ctx, '報酬: ' + rewardText(m.reward || {}), tx, yy + 4, { size: 13, color: COL.pink, maxW: tw, sw: 2.5 });
  } else if (win.reward && showOpts) {
    const m = win.reward;
    txt(ctx, '★ MISSION COMPLETE ★', tx, ty + 6, { size: 22, color: COL.gold, glow: COL.orange });
    txt(ctx, m.name, tx, ty + 40, { size: 16, maxW: tw });
    txt(ctx, '報酬: ' + rewardText(m.reward || {}), tx, ty + 72, { size: 15, color: COL.money, maxW: tw });
    const items = (m.reward?.items || []).map(getItemDef).filter(Boolean);
    items.slice(0, 6).forEach((it, i) => {
      const r = { x: tx + i * 52, y: ty + 94, w: 46, h: 46 };
      slotBox(ctx, r, it, {});
      drawItemIco(ctx, it, r.x + 23, r.y + 23, 38);
      if (ui.hover(win, r)) ui.setTip(itemTip(g, it));
    });
  } else {
    // これまでの行（薄く）＋現在行（タイプライター）
    let yy = ty;
    const prev = win.lines.slice(Math.max(0, win.li - 2), win.li);
    for (const p of prev) {
      for (const l of wrap(ctx, p, tw, 15, 700).slice(-1)) { txt(ctx, l, tx, yy, { size: 15, color: 'rgba(220,210,255,0.55)', weight: 700, sw: 2.5 }); yy += 24; }
    }
    const shown = line.slice(0, Math.floor(win.chars));
    for (const l of wrap(ctx, shown, tw, 18, 800).slice(0, 5)) { txt(ctx, l, tx, yy + 4, { size: 18 }); yy += 28; }
    if (!showOpts && win.chars >= line.length) {
      const a = 0.5 + 0.5 * Math.sin(t * 6);
      txt(ctx, '▼', x + w - 36, y + h - 28 + Math.sin(t * 6) * 3, { size: 16, align: 'center', color: COL.teal, alpha: a });
    }
    txt(ctx, `${win.li + 1}/${win.lines.length}`, tx, y + h - 22, { size: 11, color: COL.dim, sw: 2 });
  }
  // テキストエリアのクリックで送る
  if (!showOpts) ui.hit(win, 'adv', { x: x + 190, y: y, w: w - 190, h }, { onClick: () => advance(ui, win) });
  // 選択肢
  if (showOpts) {
    const ox = x + w - 290, ow = 270;
    const n = win.opts.length;
    const oh = Math.min(40, (h - 28) / n);
    win.opts.forEach((o, i) => {
      const r = { x: ox, y: y + 16 + i * oh, w: ow, h: oh - 6 };
      if (ui.hover(win, r)) win.optSel = i;
      const on = win.optSel === i;
      ctx.save();
      rrPath(ctx, r.x, r.y, r.w, r.h, r.h / 2);
      if (on) {
        const og = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        og.addColorStop(0, 'rgba(255,95,162,0.85)'); og.addColorStop(1, 'rgba(123,47,247,0.85)');
        ctx.fillStyle = og; ctx.shadowColor = COL.pink; ctx.shadowBlur = 12;
      } else ctx.fillStyle = 'rgba(8,4,30,0.6)';
      ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff' : 'rgba(200,180,255,0.4)'; ctx.stroke();
      ctx.restore();
      txt(ctx, (on ? '▶ ' : '') + o.label, r.x + 16, r.y + r.h / 2 + 1, { size: 14, color: on ? '#fff' : (o.color || '#fff'), maxW: r.w - 28 });
      ui.hit(win, 'opt' + i, r, { onClick: () => o.fn() });
    });
  }
}

// ======================= ショップ =======================
// 購入: 品物のリスト / 売却: 持ち物画面と同じグリッド（タブ・★・潜在・装備中の印）から選ぶ
function drawShop(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const npc = npcOf(win);
  const { x, y, w } = win;
  win.title = `${npc.name || ''} のショップ`;
  tabs(ui, ctx, win, x + 16, y + 46, ['購入', '売却']);
  txt(ctx, fmtMoney(st.money || 0), x + w - 20, y + 62, { size: 20, align: 'right', color: COL.money, stroke: COL.moneyShadow, sw: 4 });
  if (win.tab === 1) drawSellTab(ui, ctx, win);
  else drawBuyTab(ui, ctx, win, npc);
}

// 右の詳細パネルの上半分（アイコンの光＋説明）。説明は高さ th で切る
function drawDealInfo(ctx, it, tip, dx, dy, dw, th) {
  const info = rarityInfo(it.rarity);
  ctx.save();
  const cg = ctx.createRadialGradient(dx + dw / 2, dy + 52, 4, dx + dw / 2, dy + 52, 50);
  cg.addColorStop(0, rgba(info.color, 0.5)); cg.addColorStop(1, rgba(info.color, 0));
  ctx.fillStyle = cg; ctx.fillRect(dx, dy, dw, 110);
  ctx.restore();
  drawItemIco(ctx, it, dx + dw / 2, dy + 52, 64);
  tip.lines = tip.lines.filter((l) => !(l.t && /^(価格|売値)/.test(l.t)));
  ctx.save();
  ctx.beginPath(); ctx.rect(dx, dy + 96, dw, Math.max(0, th)); ctx.clip();
  drawTooltipBox(ctx, tip, null, { x: dx, y: dy + 96, w: dw });
  ctx.restore();
}

function drawBuyTab(ui, ctx, win, npc) {
  const g = ui.game, st = g.state;
  const { x, y, w, h } = win;
  const rows = (npc.shop || []).map((id) => getItemDef(id)).filter((it) => it && canWearGender(it, st.gender)).map((it) => ({ key: it.id, it, price: it.price || 0 }));
  const PER = 8, RH = 48;
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  win.page = clamp(win.page || 0, 0, pages - 1);
  pager(ui, ctx, win, x + 16 + 460 - 112, y + h - 40, pages);
  const lx = x + 16, ly = y + 86, lw = 460;
  if (!rows.length) txt(ctx, '品切れ中…', lx + lw / 2, ly + 120, { size: 15, align: 'center', color: COL.dim });
  const selRow = rows.find((r) => r.key === win.sel) || null;
  if (!selRow) win.sel = null;
  const doBuy = (row) => {
    if (!row) return;
    if ((st.money || 0) < row.price) { ui.notify('お金が足りません', COL.bad); return; }
    if (!doAddItem(g, row.it.id, 1, { silent: true })) { ui.notify('インベントリがいっぱいです', COL.bad); return; }
    st.money -= row.price;
    ui.notify(`${row.it.name} を購入した（-${fmtMoney(row.price)}）`, COL.money);
  };
  rows.slice(win.page * PER, win.page * PER + PER).forEach((row, k) => {
    const r = { x: lx, y: ly + k * RH, w: lw, h: RH - 5 };
    const on = win.sel === row.key, hov = ui.hover(win, r);
    const info = rarityInfo(row.it.rarity);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: on ? 'rgba(255,95,162,0.3)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.55)', stroke: on ? '#fff' : undefined, lw: on ? 2 : 1.5 });
    drawItemIco(ctx, row.it, r.x + 24, r.y + r.h / 2, 36);
    txt(ctx, row.it.name, r.x + 50, r.y + 14, { size: 14.5, color: info.color, maxW: 260 });
    const sub = row.it.slot ? `${SLOT_LABELS[row.it.slot]}  Lv${row.it.reqLevel || 1}` : row.it.type === 'consumable' ? '消費' : 'その他';
    txt(ctx, sub, r.x + 50, r.y + 31, { size: 11, color: (row.it.reqLevel || 0) > (st.level || 1) ? COL.bad : COL.sub, sw: 2.5, weight: 700 });
    txt(ctx, fmtMoney(row.price), r.x + r.w - 14, r.y + r.h / 2, { size: 15, align: 'right', color: (st.money || 0) < row.price ? COL.bad : COL.money });
    ui.hit(win, 'row:' + row.key, r, { onClick: () => { win.sel = row.key; }, onDbl: () => doBuy(row) });
  });
  // 詳細パネル
  const dx = lx + lw + 14, dw = x + w - 16 - dx, dy = ly, dh = y + h - 16 - dy;
  inset(ctx, dx, dy, dw, dh, { r: 12 });
  if (selRow) {
    drawDealInfo(ctx, selRow.it, itemTip(g, selRow.it, { price: 'buy', menuHint: false }), dx, dy, dw, dh - 150);
    ui.btn(ctx, win, 'deal', { x: dx + 14, y: dy + dh - 48, w: dw - 28, h: 36 }, `購入  ${fmtMoney(selRow.price)}`, () => doBuy(selRow), {
      color: COL.teal, disabled: (st.money || 0) < selRow.price, size: 16,
    });
  } else {
    txt(ctx, 'アイテムを選択', dx + dw / 2, dy + dh / 2 - 12, { size: 15, align: 'center', color: COL.dim });
    txt(ctx, 'ダブルクリックで即購入', dx + dw / 2, dy + dh / 2 + 14, { size: 12, align: 'center', color: COL.dim });
  }
}

const SELL_COLS = 8, SELL_ROWS = 6, SELL_CELL = 54;
// 売却のグリッドに並べるエントリ（装備タブは装備中のものを先頭に「E」付きで。装備中・値段0は売れない）
function sellEntries(st, cat) {
  const list = [];
  if (cat === 0) {
    for (const slot of ['weapon', 'hat', 'top', 'bottom', 'shoes', 'accessory', 'pet']) {
      const id = st.equipped?.[slot], it = getItemDef(id);
      if (!it) continue;
      const inst = st.equippedInst?.[slot];
      list.push({ s: inst && inst.id === id ? inst : { id, qty: 1 }, i: -1, it, equipped: true, slot });
    }
  }
  for (const e of invEntries(st, cat)) list.push(e);
  for (const e of list) e.price = sellPriceEntry(e.s);
  return list;
}
function sellBlock(e) {
  if (e.equipped) return '装備中は売れません（外してから）';
  if (!(e.it.price || e.it.sellPrice) || !(e.price > 0)) return 'このアイテムは売れません';
  return null;
}
function drawSellTab(ui, ctx, win) {
  const g = ui.game, st = g.state;
  const { x, y, w, h } = win;
  const gx = x + 16, gy = y + 122;
  tabs(ui, ctx, win, gx, y + 84, ['装備', '消費', 'その他'], 90, 'cat');
  const cat = win.cat || 0;
  const list = sellEntries(st, cat);
  const per = SELL_COLS * SELL_ROWS;
  const pages = Math.max(1, Math.ceil(list.length / per));
  win.page = clamp(win.page || 0, 0, pages - 1);
  const inv = st.inventory || [];
  txt(ctx, `${inv.filter(Boolean).length} / 48`, gx + SELL_COLS * SELL_CELL - 4, y + 99, { size: 13, align: 'right', color: COL.sub });
  const selE = findSel(list, win.sel);
  if (!selE) win.sel = null;
  const qKey = selE ? (selE.s.uid || selE.s.id) : null;
  if (qKey !== win._qtyFor) { win._qtyFor = qKey; win.qty = 1; }
  const maxQ = selE && !selE.s.uid ? Math.max(1, selE.s.qty || 1) : 1;
  win.qty = clamp(win.qty || 1, 1, maxQ);
  const doSellSel = (e, n) => {
    if (!e) return;
    const why = sellBlock(e);
    if (why) { ui.notify(why, COL.bad); return; }
    const r = doSell(g, e.s, n);
    if (!r || r.ok === false) { ui.notify(r?.msg || '売却できませんでした', COL.bad); return; }
    ui.notify(r.msg || `${e.it.name} を売却した（+${fmtMoney(r.gain || 0)}）`, COL.money);
    win.qty = 1;
  };
  const shown = list.slice(win.page * per, win.page * per + per);
  for (let k = 0; k < per; k++) {
    const r = { x: gx + (k % SELL_COLS) * SELL_CELL, y: gy + Math.floor(k / SELL_COLS) * SELL_CELL, w: 50, h: 50 };
    const e = shown[k];
    const hov = ui.hover(win, r);
    const block = e ? sellBlock(e) : null;
    drawItemCell(ctx, st, r, e, { hover: hov, sel: e && selE === e, dim: !!block, label: e && !e.equipped && block ? '売れない' : null });
    if (!e) continue;
    if (hov) ui.setTip(itemTip(g, e.it, { inst: e.s, equipped: e.equipped, price: e.equipped ? 'none' : 'sell', menuHint: false, compare: false }));
    ui.hit(win, 'sell:' + k, r, {
      onClick: () => { win.sel = selOf(e); },
      onDbl: () => { win.sel = selOf(e); doSellSel(e, 1); },
    });
  }
  if (!list.length) txt(ctx, 'このタブに売れるアイテムはありません', gx + SELL_COLS * SELL_CELL / 2, gy + SELL_ROWS * SELL_CELL / 2, { size: 14, align: 'center', color: COL.dim });
  const by = gy + SELL_ROWS * SELL_CELL + 6;
  txt(ctx, 'クリックで選ぶ / ダブルクリックで1個売る', gx + 2, by + 13, { size: 11.5, color: COL.dim, sw: 2.5, weight: 700 });
  pager(ui, ctx, win, gx + SELL_COLS * SELL_CELL - 4 - 112, by, pages);

  // 詳細パネル: 値段と売るボタン（同じ消耗品はまとめて売れる）
  const dx = gx + SELL_COLS * SELL_CELL + 10, dw = x + w - 16 - dx, dy = y + 86, dh = y + h - 16 - dy;
  inset(ctx, dx, dy, dw, dh, { r: 12 });
  win.onEnter = selE ? () => doSellSel(selE, win.qty) : null;
  if (!selE) {
    txt(ctx, '売るアイテムを選択', dx + dw / 2, dy + dh / 2 - 12, { size: 15, align: 'center', color: COL.dim });
    txt(ctx, '選ぶと値段と売るボタンが出ます', dx + dw / 2, dy + dh / 2 + 14, { size: 12, align: 'center', color: COL.dim });
    return;
  }
  const it = selE.it, block = sellBlock(selE);
  const stack = maxQ > 1;
  const foot = stack ? 140 : 100;
  drawDealInfo(ctx, it, itemTip(g, it, { inst: selE.s, equipped: selE.equipped, price: selE.equipped ? 'none' : 'sell', menuHint: false, compare: false }), dx, dy, dw, dh - 96 - foot);
  let fy = dy + dh - foot;
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(dx + 12, fy, dw - 24, 1);
  fy += 8;
  txt(ctx, '売値', dx + 16, fy + 12, { size: 13, color: COL.sub });
  txt(ctx, block ? '-' : `${fmtMoney(selE.price)}${stack ? ' / 1個' : ''}`, dx + dw - 16, fy + 12, { size: 15, align: 'right', color: block ? COL.dim : COL.money });
  fy += 28;
  if (stack) {
    // 個数: − n ＋ / 全部
    const n = win.qty;
    ui.btn(ctx, win, 'q-', { x: dx + 14, y: fy, w: 34, h: 30 }, '−', () => { win.qty = Math.max(1, win.qty - 1); }, { disabled: n <= 1, size: 16, color: COL.purple });
    inset(ctx, dx + 52, fy, 72, 30, { r: 8 });
    txt(ctx, `${n} / ${maxQ}`, dx + 88, fy + 15, { size: 14, align: 'center' });
    ui.btn(ctx, win, 'q+', { x: dx + 128, y: fy, w: 34, h: 30 }, '＋', () => { win.qty = Math.min(maxQ, win.qty + 1); }, { disabled: n >= maxQ, size: 16, color: COL.purple });
    ui.btn(ctx, win, 'qAll', { x: dx + 168, y: fy, w: dw - 182, h: 30 }, `全部（${maxQ}）`, () => { win.qty = maxQ; }, { disabled: n >= maxQ, size: 13, color: '#7b4dc9' });
  }
  const n = stack ? win.qty : 1;
  const label = block ? (selE.equipped ? '装備中は売れません' : '売れません') : `売却${n > 1 ? ` ×${n}` : ''}  +${fmtMoney(selE.price * n)}`;
  ui.btn(ctx, win, 'deal', { x: dx + 14, y: dy + dh - 48, w: dw - 28, h: 36 }, label, () => doSellSel(selE, n), { color: COL.orange, disabled: !!block, size: 16 });
}

// ======================= 気絶 =======================
function drawDeath(ui, ctx, win) {
  // 画面中央に固定
  win.x = (W - win.w) / 2; win.y = (H - win.h) / 2 - 20;
  const { x, y, w, h } = win;
  const t = win.t;
  txt(ctx, '気絶しました…', x + w / 2, y + 62, { size: 34, align: 'center', color: '#ffd6e8', glow: COL.pink, glowBlur: 20, sw: 6, stroke: '#3a0a24' });
  txt(ctx, 'ヴァイス・ベイの路地裏で力尽きてしまった。', x + w / 2, y + 108, { size: 14, align: 'center', color: COL.sub, weight: 700 });
  txt(ctx, '近くの安全な場所で目を覚まそう。', x + w / 2, y + 132, { size: 14, align: 'center', color: COL.sub, weight: 700 });
  const r = { x: x + w / 2 - 110, y: y + h - 70, w: 220, h: 46 };
  const ready = t > 0.4;
  ui.btn(ctx, win, 'revive', r, '復活する  [Enter]', () => { if (ready) ui.revive(); }, { color: COL.pink, size: 17, disabled: !ready });
}

export const WINDOW_DRAW = {
  inventory: drawInventory, skills: drawSkills, stats: drawStats, missions: drawMissions,
  dialog: drawDialog, shop: drawShop, death: drawDeath,
};
void expNeed;
