// 各ウィンドウの中身（UIManager から呼ばれる即時モード描画）
import {
  COL, txt, inset, panel, rrPath, wrap, fmtMoney, rgba, clamp, measure, SLOT_LABELS, STAT_LABELS, rarityFill, font,
} from './theme.js';
import {
  guard, getItemDef, rarityInfo, stats, computeStatsRaw, drawChar, drawItemIco, drawSkillIco, heroLook, equipLooks,
  looksFrom, doEquip, doUnequip, doUseItem, doAddItem, doRemoveItem, allSkills, skillDef, skillMp, skillCd, doLearn,
  allMissions, missionDef, HERO_NAMES, expNeed, missionNpcName, turnInNpc, sellPriceOf,
} from './deps.js';

const W = 1280, H = 720;
const WT = { melee: '近接', gun: '銃', magic: '魔法' };
const KIND = { melee: '近接', projectile: '遠距離', aoe: '範囲', buff: 'バフ', dash: 'ダッシュ', passive: 'パッシブ' };

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
  if (o.price === 'sell' || (o.price == null && it.price)) L.push({ t: `売値  ${fmtMoney(sellPrice(it))}`, c: COL.gold, size: 12.5 });
  return { lines: L, border: info.color };
}

function skillTip(game, sk) {
  const st = game.state || {};
  const lv = st.skills?.[sk.id] || 0, max = sk.maxLevel || 10;
  const L = [{ t: sk.name, c: sk.color || COL.teal, size: 18 }];
  L.push({ t: `${KIND[sk.kind] || sk.kind || ''}  ・  Lv ${lv}/${max}  ・  習得Lv ${sk.reqLevel || 1}`, c: COL.sub, size: 12 });
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
    L.push({ t: 'ドラッグでスキルバーへ / 下のA〜Fに登録', c: COL.dim, size: 11.5 });
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
function tabs(ui, ctx, win, x, y, labels, tw = 100) {
  labels.forEach((lab, i) => {
    const r = { x: x + i * (tw + 6), y, w: tw, h: 30 };
    const on = win.tab === i, hov = ui.hover(win, r);
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
    ui.hit(win, 'tab' + i, r, { onClick: () => { win.tab = i; win.sel = null; win.page = 0; } });
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
  if (it && it.rarity && it.rarity !== 'common') {
    ctx.save();
    rrPath(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6);
    g.addColorStop(0, rgba(info.color, 0.28)); g.addColorStop(1, rgba(info.color, 0));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
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
  drawChar(ctx, px + pw / 2, fy + 8, heroLook(st.heroId), equipLooks(st), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 2 });
  ctx.restore();
  txt(ctx, `${HERO_NAMES[st.heroId] || ''}  Lv.${st.level || 1}`, px + pw / 2, py + ph - 18, { size: 15, align: 'center', color: '#fff', glow: COL.pink });

  const SL = [['hat', 0, 0], ['top', 0, 1], ['bottom', 0, 2], ['shoes', 0, 3], ['weapon', 1, 0], ['accessory', 1, 1]];
  for (const [slot, col, row] of SL) {
    const r = { x: col ? px + pw - 10 - 54 : px + 10, y: py + 10 + row * 66, w: 54, h: 54 };
    const id = st.equipped?.[slot];
    const it = getItemDef(id);
    const hov = ui.hover(win, r);
    slotBox(ctx, r, it, { hover: hov });
    if (it) drawItemIco(ctx, it, r.x + r.w / 2, r.y + r.h / 2, 42);
    else txt(ctx, SLOT_LABELS[slot], r.x + r.w / 2, r.y + r.h / 2, { size: 11, align: 'center', color: COL.dim, sw: 2.5 });
    if (it) txt(ctx, SLOT_LABELS[slot], r.x + 3, r.y + 7, { size: 9, color: '#ffe3f0', sw: 2.5 });
    if (hov && it) ui.setTip(itemTip(g, it, { equipped: true }));
    ui.hit(win, 'eq:' + slot, r, {
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
  const list = inv.map((s, i) => ({ s, i, it: s ? getItemDef(s.id) : null })).filter((e) => e.s && e.it && itemCat(e.it) === win.tab);
  // 選択の検証
  let selE = null;
  if (win.sel != null) {
    selE = list.find((e) => e.i === win.sel.i && e.s.id === win.sel.id) || list.find((e) => e.s.id === win.sel.id) || null;
    if (!selE) win.sel = null;
  }
  const CELL = 54;
  for (let k = 0; k < 48; k++) {
    const r = { x: gx + (k % 8) * CELL, y: gy + Math.floor(k / 8) * CELL, w: 50, h: 50 };
    const e = list[k];
    const hov = ui.hover(win, r);
    slotBox(ctx, r, e?.it, { hover: hov && e, sel: e && selE === e });
    if (!e) continue;
    drawItemIco(ctx, e.it, r.x + 25, r.y + 25, 40);
    if ((e.it.reqLevel || 0) > (st.level || 1)) {
      ctx.save(); rrPath(ctx, r.x, r.y, r.w, r.h, 9); ctx.fillStyle = 'rgba(255,40,70,0.22)'; ctx.fill(); ctx.restore();
    }
    if ((e.s.qty || 1) > 1) txt(ctx, e.s.qty, r.x + r.w - 4, r.y + r.h - 9, { size: 12, align: 'right', sw: 3 });
    if (st.potionBar?.includes(e.s.id)) txt(ctx, '[' + (st.potionBar.indexOf(e.s.id) + 1) + ']', r.x + 4, r.y + 9, { size: 10, color: COL.pink, sw: 2.5 });
    if (hov) ui.setTip(itemTip(g, e.it));
    const cons = e.it.type === 'consumable';
    ui.hit(win, 'it:' + k, r, {
      onClick: () => { win.sel = { i: e.i, id: e.s.id }; },
      onDbl: () => activate(ui, win, e),
      onRight: () => { if (cons) togglePotion(ui, e.s.id); else win.sel = { i: e.i, id: e.s.id }; },
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
    txt(ctx, it.name, gx + 64, dy + 22, { size: 16, color: info.color, maxW: 180 });
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
    if (itemCat(it) !== 2 || it.type === 'consumable') {
      bx -= 88;
      ui.btn(ctx, win, 'act', { x: bx, y: by, w: 88, h: bh }, it.type === 'consumable' ? '使う' : '装備する', () => activate(ui, win, selE), { color: COL.teal });
    }
  } else {
    txt(ctx, 'ダブルクリック / Enter: 装備・使用', gx + 16, dy + 22, { size: 12.5, color: COL.sub });
    txt(ctx, '右クリック or ドラッグ: 消費アイテムを [1][2] に登録', gx + 16, dy + 44, { size: 12.5, color: COL.sub });
  }
}

function activate(ui, win, e) {
  const g = ui.game, it = e?.it;
  if (!it) return;
  if (it.slot || it.type === 'equip') {
    const r = doEquip(g, it.id);
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
function drawSkills(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const list = Object.values(allSkills()).filter((s) => s && (!s.hero || s.hero === st.heroId || s.hero === 'both'))
    .sort((a, b) => (a.reqLevel || 0) - (b.reqLevel || 0));
  // ヘッダー
  txt(ctx, `${HERO_NAMES[st.heroId] || ''} のスキル`, x + 20, y + 60, { size: 15, color: COL.sub });
  ctx.save();
  rrPath(ctx, x + w - 150, y + 46, 132, 28, 14);
  ctx.fillStyle = (st.sp || 0) > 0 ? 'rgba(255,212,71,0.25)' : 'rgba(0,0,0,0.4)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = COL.gold; ctx.stroke();
  ctx.restore();
  txt(ctx, `SP  ${st.sp || 0}`, x + w - 84, y + 61, { size: 16, align: 'center', color: COL.gold, glow: (st.sp || 0) > 0 ? COL.gold : null });
  const PER = 8, RH = 54;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  pager(ui, ctx, win, x + w - 280, y + 47, pages);
  if (!list.length) txt(ctx, 'スキルデータがありません', x + w / 2, y + 200, { size: 15, align: 'center', color: COL.dim });
  const page = list.slice((win.page || 0) * PER, (win.page || 0) * PER + PER);
  page.forEach((sk, k) => {
    const r = { x: x + 16, y: y + 84 + k * RH, w: w - 32, h: RH - 6 };
    const lv = st.skills?.[sk.id] || 0, max = sk.maxLevel || 10;
    const locked = (st.level || 1) < (sk.reqLevel || 0);
    const hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: win.sel === sk.id ? 'rgba(25,211,197,0.25)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.55)', stroke: win.sel === sk.id ? COL.teal : undefined, lw: win.sel === sk.id ? 2 : 1.5 });
    drawSkillIco(ctx, sk, r.x + 26, r.y + r.h / 2, 38);
    if (lv <= 0) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; rrPath(ctx, r.x + 7, r.y + 5, 38, 38, 8); ctx.fill(); ctx.restore(); }
    txt(ctx, sk.name, r.x + 54, r.y + 15, { size: 15, color: locked ? COL.dim : '#fff', maxW: 190 });
    const nameW = Math.min(190, measure(ctx, sk.name, 15));
    txt(ctx, sk.kind === 'passive' ? 'PASSIVE' : (KIND[sk.kind] || ''), r.x + 62 + nameW, r.y + 15, { size: 10.5, color: sk.kind === 'passive' ? COL.gold : COL.teal, sw: 2.5 });
    txt(ctx, locked ? `Lv.${sk.reqLevel} で習得可能` : (sk.desc || ''), r.x + 54, r.y + 34, { size: 11.5, color: locked ? COL.bad : COL.sub, maxW: r.w - 54 - 150, sw: 2.5, weight: 700 });
    // レベル表示
    txt(ctx, `Lv ${lv}/${max}`, r.x + r.w - 56, r.y + r.h / 2, { size: 14, align: 'right', color: lv >= max ? COL.gold : '#fff' });
    const can = !locked && (st.sp || 0) > 0 && lv < max;
    ui.btn(ctx, win, 'learn:' + sk.id, { x: r.x + r.w - 44, y: r.y + 8, w: 34, h: 32 }, '+', () => {
      const ok = doLearn(g, sk.id); // 失敗理由の通知は learnSkill 側
      if (ok) ui.notify(`${sk.name} が Lv${(st.skills?.[sk.id] || 0)} になった！`, COL.gold);
    }, { disabled: !can, color: COL.orange, size: 20 });
    if (hov) ui.setTip(skillTip(g, sk));
    ui.hit(win, 'sk:' + sk.id, { x: r.x, y: r.y, w: r.w - 50, h: r.h }, {
      onClick: () => { win.sel = sk.id; },
      onDbl: () => {
        const bar = st.skillBar || [];
        const e = [0, 1, 2, 3].find((i) => !bar[i]);
        ui.assignSkill(sk.id, e ?? 0);
      },
      drag: lv > 0 && sk.kind !== 'passive' ? { kind: 'skill', id: sk.id } : null,
    });
  });
  // スキルバー登録
  const by = y + h - 82;
  inset(ctx, x + 16, by, w - 32, 68, { r: 12, fill: 'rgba(25,211,197,0.10)', stroke: 'rgba(25,211,197,0.5)' });
  const sel = skillDef(win.sel);
  txt(ctx, 'スキルバー', x + 30, by + 20, { size: 13, color: COL.teal });
  txt(ctx, sel ? `「${sel.name}」をクリックした枠へ` : 'スキルを選んで枠をクリック', x + 30, by + 46, { size: 11.5, color: COL.sub, maxW: 190, weight: 700 });
  for (let i = 0; i < 4; i++) {
    const r = { x: x + w - 32 - 4 * 58 + i * 58 + 6, y: by + 10, w: 48, h: 48 };
    const hov = ui.hover(win, r);
    slotBox(ctx, r, null, { hover: hov });
    const sk = skillDef(st.skillBar?.[i]);
    if (sk) drawSkillIco(ctx, sk, r.x + 24, r.y + 24, 38);
    txt(ctx, 'ASDF'[i], r.x + 6, r.y + 8, { size: 11, color: COL.teal, sw: 2.5 });
    if (hov && sk) ui.setTip(skillTip(g, sk));
    ui.hit(win, 'bar' + i, r, {
      onClick: () => { if (win.sel) ui.assignSkill(win.sel, i); },
      onRight: () => { if (st.skillBar) st.skillBar[i] = null; },
      onDrop: (p) => { if (p.kind === 'skill') ui.assignSkill(p.id, i); },
    });
  }
}

// ======================= ステータス =======================
const STAT_DESC = { str: '近接攻撃力・最大HP', dex: '銃攻撃力・命中', int: '魔法攻撃力・最大MP', luk: 'クリティカル・ドロップ率' };
function drawStats(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w } = win;
  txt(ctx, `${HERO_NAMES[st.heroId] || ''}   Lv.${st.level || 1}`, x + 20, y + 60, { size: 15 });
  ctx.save();
  rrPath(ctx, x + w - 140, y + 46, 122, 28, 14);
  ctx.fillStyle = (st.ap || 0) > 0 ? 'rgba(255,212,71,0.25)' : 'rgba(0,0,0,0.4)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = COL.gold; ctx.stroke();
  ctx.restore();
  txt(ctx, `AP  ${st.ap || 0}`, x + w - 79, y + 61, { size: 16, align: 'center', color: COL.gold, glow: (st.ap || 0) > 0 ? COL.gold : null });
  const keys = ['str', 'dex', 'int', 'luk'];
  keys.forEach((k, i) => {
    const r = { x: x + 16, y: y + 84 + i * 54, w: w - 32, h: 48 };
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10 });
    txt(ctx, k.toUpperCase(), r.x + 16, r.y + 17, { size: 18, color: [COL.pink, COL.teal, '#a98bff', COL.gold][i] });
    txt(ctx, STAT_DESC[k], r.x + 16, r.y + 36, { size: 11, color: COL.sub, sw: 2.5, weight: 700 });
    txt(ctx, st.stats?.[k] ?? 0, r.x + r.w - 62, r.y + r.h / 2, { size: 22, align: 'right' });
    ui.btn(ctx, win, 'ap:' + k, { x: r.x + r.w - 46, y: r.y + 8, w: 34, h: 32 }, '+', () => {
      if ((st.ap || 0) <= 0) return;
      st.stats = st.stats || {};
      st.stats[k] = (st.stats[k] || 0) + 1;
      st.ap--;
      refreshPlayerStats(g);
    }, { disabled: (st.ap || 0) <= 0, color: COL.orange, size: 20 });
  });
  // 詳細ステータス
  const cs = stats(g);
  const dy = y + 84 + 4 * 54 + 6;
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

// ======================= ミッション =======================
function drawMissions(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const { x, y, w, h } = win;
  const M = st.missions || { active: [], completed: [] };
  tabs(ui, ctx, win, x + 16, y + 46, ['進行中', '受注可能', '完了']);
  const all = Object.values(allMissions()).filter(Boolean);
  let ids;
  if (win.tab === 0) ids = (M.active || []).slice();
  else if (win.tab === 2) ids = (M.completed || []).slice();
  else {
    ids = all.filter((m) => !(M.active || []).includes(m.id) && !(M.completed || []).includes(m.id) &&
      guard('canAccept', () => g.missions?.canAccept?.(m.id), (st.level || 1) >= (m.reqLevel || 0)) !== false).map((m) => m.id);
  }
  const lx = x + 16, ly = y + 86, lw = 232, RH = 40, PER = 9;
  const pages = Math.max(1, Math.ceil(ids.length / PER));
  win.page = clamp(win.page || 0, 0, pages - 1);
  pager(ui, ctx, win, x + w - 130, y + 48, pages);
  if (!ids.length) txt(ctx, ['進行中のミッションはありません', '受注できるミッションはありません', 'まだ完了したミッションはありません'][win.tab], x + w / 2, y + h / 2, { size: 15, align: 'center', color: COL.dim });
  if (win.sel == null || !ids.includes(win.sel)) win.sel = ids[0] ?? null;
  ids.slice(win.page * PER, win.page * PER + PER).forEach((id, k) => {
    const m = missionDef(id);
    const r = { x: lx, y: ly + k * RH, w: lw, h: RH - 5 };
    const on = win.sel === id, hov = ui.hover(win, r);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 9, fill: on ? 'rgba(255,95,162,0.3)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.55)', stroke: on ? '#fff' : undefined });
    const done = win.tab === 0 && guard('isComplete', () => g.missions?.isComplete?.(id), false);
    txt(ctx, (win.tab === 2 ? '✔ ' : done ? '？ ' : win.tab === 1 ? '！ ' : '◆ ') + (m?.name || id), r.x + 10, r.y + r.h / 2, {
      size: 13.5, color: win.tab === 2 ? COL.dim : done ? '#c6ff6a' : win.tab === 1 ? COL.gold : '#fff', maxW: lw - 20,
    });
    ui.hit(win, 'm:' + id, r, { onClick: () => { win.sel = id; } });
  });
  // 詳細
  const dx = x + 16 + lw + 12, dw = x + w - 16 - dx, dy = y + 86, dh = y + h - 16 - dy;
  inset(ctx, dx, dy, dw, dh, { r: 12 });
  const m = missionDef(win.sel);
  if (!m) return;
  let yy = dy + 22;
  txt(ctx, m.name, dx + 16, yy, { size: 18, color: COL.gold, maxW: dw - 32 }); yy += 24;
  const giver = findNpcName(g, m.giver);
  txt(ctx, `依頼人: ${giver}   推奨Lv ${m.reqLevel || 1}`, dx + 16, yy, { size: 12, color: COL.sub, sw: 2.5 }); yy += 22;
  for (const l of wrap(ctx, m.desc || '', dw - 32, 13, 700).slice(0, 5)) { txt(ctx, l, dx + 16, yy, { size: 13, weight: 700, sw: 2.5 }); yy += 19; }
  yy += 8;
  txt(ctx, '◆ 目標', dx + 16, yy, { size: 14, color: COL.teal }); yy += 22;
  const tr = win.tab === 0 ? (guard('tracked', () => g.missions?.tracked?.(), []) || []).find((e) => e.name === m.name) : null;
  const objLines = tr?.lines?.length ? tr.lines : (m.objectives || []).map((o) => o.text || `${o.type} ${o.target || ''} ×${o.count || 1}`);
  for (const l of objLines.slice(0, 5)) { txt(ctx, (/^[✔→]/.test(l) ? '' : '・') + stripMark(l), dx + 22, yy, { size: 13, maxW: dw - 40, weight: 700, sw: 2.5, color: win.tab === 2 ? COL.dim : '#fff' }); yy += 20; }
  yy += 8;
  const rw = m.reward || {};
  txt(ctx, '◆ 報酬', dx + 16, yy, { size: 14, color: COL.pink }); yy += 22;
  txt(ctx, rewardText(rw), dx + 22, yy, { size: 13, color: COL.gold, maxW: dw - 40, sw: 2.5 });
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
  for (const id of rw.items || []) { const it = getItemDef(id); if (it) parts.push(it.name); }
  return parts.join('   ') || '—';
}

// ======================= 会話 =======================
function npcOf(win) { return win.data?.npc || win.data || {}; }
export function initDialog(ui, win) {
  const npc = npcOf(win);
  win.brief = null; win.reward = null;
  say(win, npc.dialog?.length ? npc.dialog : ['…やあ。'], null);
}
function say(win, lines, after) {
  win.lines = (Array.isArray(lines) ? lines : [String(lines)]).map(String);
  if (!win.lines.length) win.lines = ['…'];
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
function menu(ui, win) {
  const g = ui.game, npc = npcOf(win);
  const opts = [];
  for (const { m, status } of npcMissions(ui, npc)) {
    if (status === 'report') {
      opts.push({ label: '？ 報告: ' + m.name, color: '#c6ff6a', fn: () => {
        const res = guard('turnIn', () => g.missions?.turnIn?.(m.id), null);
        if (res === false) { ui.notify('まだ報告できません', COL.bad); return; } // 成功通知は MissionManager 側
        say(win, m.dialog?.done?.length ? m.dialog.done : ['よくやってくれた！'], () => {
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
  } else if (P('confirm') || P('interact') || P('jump')) {
    eat('confirm'); eat('interact');
    advance(ui, win);
  }
}
function drawDialog(ui, ctx, win) {
  const g = ui.game;
  const npc = npcOf(win);
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
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
  drawChar(ctx, bx + bw / 2, by + bh - 14, npc.look, looksFrom(npc.equip), { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: 1.55 });
  ctx.restore();
  ctx.save(); rrPath(ctx, bx, by, bw, bh, 12); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke(); ctx.restore();
  // 名前プレート
  const nameStr = npc.name || '???';
  const nw = Math.max(110, measure(ctx, nameStr, 16) + 30);
  ctx.save();
  rrPath(ctx, x + 204, y - 14, nw, 30, 15);
  const ng = ctx.createLinearGradient(x + 204, 0, x + 204 + nw, 0);
  ng.addColorStop(0, COL.pink); ng.addColorStop(1, COL.purple);
  ctx.fillStyle = ng; ctx.shadowColor = COL.pink; ctx.shadowBlur = 12; ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
  txt(ctx, nameStr, x + 204 + nw / 2, y + 1.5, { size: 16, align: 'center' });
  if (npc.title) txt(ctx, npc.title, x + 214 + nw, y + 2, { size: 12, color: COL.sub });

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
function drawShop(ui, ctx, win) {
  const g = ui.game, st = g.state;
  if (!st) return;
  const npc = npcOf(win);
  const { x, y, w, h } = win;
  win.title = `${npc.name || ''} のショップ`;
  tabs(ui, ctx, win, x + 16, y + 46, ['購入', '売却']);
  txt(ctx, fmtMoney(st.money || 0), x + w - 20, y + 62, { size: 20, align: 'right', color: COL.money, stroke: COL.moneyShadow, sw: 4 });
  let rows;
  if (win.tab === 0) rows = (npc.shop || []).map((id) => getItemDef(id)).filter(Boolean).map((it) => ({ key: it.id, it, price: it.price || 0 }));
  else rows = (st.inventory || []).map((s, i) => ({ s, i, it: s ? getItemDef(s.id) : null })).filter((e) => e.it && (e.it.price || e.it.sellPrice))
    .map((e) => ({ key: e.i + ':' + e.s.id, it: e.it, s: e.s, price: sellPrice(e.it) }));
  const PER = 8, RH = 48;
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  win.page = clamp(win.page || 0, 0, pages - 1);
  pager(ui, ctx, win, x + 16 + 460 - 112, y + h - 40, pages);
  const lx = x + 16, ly = y + 86, lw = 460;
  if (!rows.length) txt(ctx, win.tab === 0 ? '品切れ中…' : '売れるアイテムがありません', lx + lw / 2, ly + 120, { size: 15, align: 'center', color: COL.dim });
  let selRow = rows.find((r) => r.key === win.sel) || null;
  if (!selRow) win.sel = null;
  const doDeal = (row) => {
    if (!row) return;
    if (win.tab === 0) {
      if ((st.money || 0) < row.price) { ui.notify('お金が足りません', COL.bad); return; }
      if (!doAddItem(g, row.it.id, 1, { silent: true })) { ui.notify('インベントリがいっぱいです', COL.bad); return; }
      st.money -= row.price;
      ui.notify(`${row.it.name} を購入した（-${fmtMoney(row.price)}）`, COL.money);
    } else {
      const ok = doRemoveItem(st, row.it.id, 1);
      if (ok === false) { ui.notify('売却できませんでした', COL.bad); return; }
      st.money = (st.money || 0) + row.price;
      ui.notify(`${row.it.name} を売却した（+${fmtMoney(row.price)}）`, COL.money);
      if (!(st.inventory || []).some((s) => s && s.id === row.it.id)) win.sel = null;
    }
  };
  rows.slice(win.page * PER, win.page * PER + PER).forEach((row, k) => {
    const r = { x: lx, y: ly + k * RH, w: lw, h: RH - 5 };
    const on = win.sel === row.key, hov = ui.hover(win, r);
    const info = rarityInfo(row.it.rarity);
    inset(ctx, r.x, r.y, r.w, r.h, { r: 10, fill: on ? 'rgba(255,95,162,0.3)' : hov ? 'rgba(123,47,247,0.35)' : 'rgba(6,4,24,0.55)', stroke: on ? '#fff' : undefined, lw: on ? 2 : 1.5 });
    drawItemIco(ctx, row.it, r.x + 24, r.y + r.h / 2, 36);
    txt(ctx, row.it.name + (row.s && (row.s.qty || 1) > 1 ? ` ×${row.s.qty}` : ''), r.x + 50, r.y + 14, { size: 14.5, color: info.color, maxW: 260 });
    const sub = row.it.slot ? `${SLOT_LABELS[row.it.slot]}  Lv${row.it.reqLevel || 1}` : row.it.type === 'consumable' ? '消費' : 'その他';
    txt(ctx, sub, r.x + 50, r.y + 31, { size: 11, color: (row.it.reqLevel || 0) > (st.level || 1) ? COL.bad : COL.sub, sw: 2.5, weight: 700 });
    txt(ctx, fmtMoney(row.price), r.x + r.w - 14, r.y + r.h / 2, { size: 15, align: 'right', color: win.tab === 0 && (st.money || 0) < row.price ? COL.bad : COL.money });
    ui.hit(win, 'row:' + row.key, r, { onClick: () => { win.sel = row.key; }, onDbl: () => doDeal(row) });
  });
  // 詳細パネル
  const dx = lx + lw + 14, dw = x + w - 16 - dx, dy = ly, dh = y + h - 16 - dy;
  inset(ctx, dx, dy, dw, dh, { r: 12 });
  if (selRow) {
    const it = selRow.it;
    const info = rarityInfo(it.rarity);
    ctx.save();
    const cg = ctx.createRadialGradient(dx + dw / 2, dy + 52, 4, dx + dw / 2, dy + 52, 50);
    cg.addColorStop(0, rgba(info.color, 0.5)); cg.addColorStop(1, rgba(info.color, 0));
    ctx.fillStyle = cg; ctx.fillRect(dx, dy, dw, 110);
    ctx.restore();
    drawItemIco(ctx, it, dx + dw / 2, dy + 52, 64);
    const tip = itemTip(g, it, { price: win.tab === 0 ? 'buy' : 'sell' });
    tip.lines = tip.lines.filter((l) => !(l.t && /^(価格|売値)/.test(l.t)));
    ctx.save();
    ctx.beginPath(); ctx.rect(dx, dy + 96, dw, dh - 150); ctx.clip();
    drawTooltipBox(ctx, tip, null, { x: dx, y: dy + 96, w: dw });
    ctx.restore();
    const label = win.tab === 0 ? `購入  ${fmtMoney(selRow.price)}` : `売却  +${fmtMoney(selRow.price)}`;
    ui.btn(ctx, win, 'deal', { x: dx + 14, y: dy + dh - 48, w: dw - 28, h: 36 }, label, () => doDeal(selRow), {
      color: win.tab === 0 ? COL.teal : COL.orange, disabled: win.tab === 0 && (st.money || 0) < selRow.price, size: 16,
    });
  } else {
    txt(ctx, 'アイテムを選択', dx + dw / 2, dy + dh / 2 - 12, { size: 15, align: 'center', color: COL.dim });
    txt(ctx, 'ダブルクリックで即取引', dx + dw / 2, dy + dh / 2 + 14, { size: 12, align: 'center', color: COL.dim });
  }
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
