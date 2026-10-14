// パネルで共通に使う部品（アイテムのマス・装備の枠・能力の表）。

import { h, spriteImg } from '../dom.js';
import { assets } from '../../render/assets.js';
import { RARITY } from '../../data/rarity.js';
import { BASE, SLOT_NAMES } from '../../data/items.js';
import { attachTip, itemCard, tooltip } from '../tooltip.js';

/** アイテム 1 マス。onClick(item, ev) */
export function itemCell(ui, item, opts = {}) {
  const r = RARITY[item.rarity] || RARITY.common;
  const b = BASE[item.base];
  const cell = h(`div.cell.r-${item.rarity}${item.isNew ? '.new' : ''}${opts.selected ? '.sel' : ''}${item.locked ? '.locked' : ''}`, { style: { '--rc': r.color } }, [
    spriteImg(assets, b?.icon || 'icon.item.sword', opts.size || 46),
    item.enh ? h('span.enh', `+${item.enh}`) : null,
    item.q ? h('span.q', item.q === 2 ? '原' : '太') : null,
    opts.upgrade ? h('span.up', '▲') : null,
    item.locked ? h('span.lk', '🔒') : null,
  ]);
  attachTip(cell, () => itemCard(ui.game, item, { compare: !opts.equipped, equipped: opts.equipped }));
  cell.addEventListener('click', (ev) => { tooltip.hide(); opts.onClick?.(item, ev); });
  cell.addEventListener('contextmenu', (ev) => { ev.preventDefault(); tooltip.hide(); opts.onRight?.(item, ev); });
  return cell;
}

export function emptyCell(label = '', opts = {}) {
  return h('div.cell.empty', { title: label, onclick: opts.onClick }, h('span.slotlabel', label));
}

export function equipSlot(ui, slot) {
  const it = ui.game.state.hero.equip[slot];
  const wrap = h(`div.eqslot.eq-${slot}`, [h('div.eqlabel', SLOT_NAMES[slot])]);
  if (it) wrap.append(itemCell(ui, it, { equipped: true, size: 50, onClick: () => itemMenu(ui, it, true) }));
  else wrap.append(emptyCell(SLOT_NAMES[slot]));
  return wrap;
}

/** アイテムを押したときの操作の窓 */
export function itemMenu(ui, item, equipped = false) {
  const g = ui.game;
  const inv = g.sys.inv;
  const btns = [];
  if (equipped) btns.push({ label: '外す', onclick: () => { const r = inv.unequip(findSlot(g, item)); if (!r.ok) ui.toast(r.msg || '外せない', 'bad'); } });
  else {
    const prob = inv.equipProblem(item, item.slot === 'ring' ? 'ring1' : item.slot);
    btns.push({ label: prob ? `装備できない（${prob}）` : '装備する', kind: 'primary', onclick: () => { if (prob) return false; const r = inv.equip(item.uid); if (!r.ok) ui.toast(r.msg, 'bad'); return true; } });
    if (item.slot === 'ring') btns.push({ label: '右の指輪に', onclick: () => { const r = inv.equip(item.uid, 'ring2'); if (!r.ok) ui.toast(r.msg, 'bad'); } });
    btns.push({ label: item.locked ? '鍵を外す' : '鍵をかける', onclick: () => inv.lock(item.uid) });
    if (!item.locked) btns.push({ label: '分解', kind: 'danger', onclick: () => { const r = inv.salvage([item.uid]); ui.toast(`分解: ${matText(r.got)}`, 'good'); } });
    if (!item.locked) btns.push({ label: '売る', onclick: () => { const r = inv.sell([item.uid]); ui.toast(`${r.gold} G で売った`, 'good'); } });
  }
  for (const f of itemMenuHooks) { try { btns.push(...(f(ui, item, equipped) || [])); } catch (e) { console.error(e); } }
  btns.push({ label: '閉じる' });
  item.isNew = false;
  ui.modal('アイテム', itemCard(g, item, { compare: !equipped, equipped }), btns);
}

/** ほかの担当がアイテムの操作を足す: (ui, item, equipped) => [{ label, onclick }] */
export const itemMenuHooks = [];

function findSlot(g, item) {
  for (const [s, it] of Object.entries(g.state.hero.equip)) if (it?.uid === item.uid) return s;
  return item.slot;
}

export function matText(got) {
  const N = { scrap: '鉄屑', dust: '魔塵', crystal: '秘晶', echo: '残響', core: '原初の核', shard: '欠片' };
  const s = Object.entries(got || {}).map(([k, v]) => `${N[k] || k} ×${v}`).join('　');
  return s || 'なし';
}

/** 2 列の表 */
export function kvTable(rows) {
  return h('table.kv', rows.filter(Boolean).map(([k, v, cls]) => h('tr', { class: cls }, [h('th', k), h('td', v)])));
}
