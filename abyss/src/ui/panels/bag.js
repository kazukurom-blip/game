// 持ち物の窓: バッグ・倉庫・まとめて分解・自動の振り分け。

import { h, button } from '../dom.js';
import { itemCell, emptyCell, itemMenu, matText } from './common.js';
import { RARITIES } from '../../data/rarity.js';
import { fmt } from '../../engine/format.js';
import { MATERIALS } from '../../data/materials.js';

let view = 'bag';
let stashTab = 0;

export const bagPanel = {
  id: 'bag', name: '持ち物', icon: '🎒',
  refreshOn: ['inv', 'gear', 'level'],
  badge: (g) => g.state.inv.bag.filter((x) => x.isNew).length,
  render(ui, el) {
    const g = ui.game;
    const inv = g.state.inv;
    const sys = g.sys.inv;
    el.append(h('div.tabs', [
      h(`button.tab${view === 'bag' ? '.on' : ''}`, { onclick: () => { view = 'bag'; ui.renderPanel(); } }, `バッグ ${inv.bag.length}/${inv.bagSize}`),
      h(`button.tab${view === 'stash' ? '.on' : ''}`, { onclick: () => { view = 'stash'; ui.renderPanel(); } }, '倉庫'),
      h(`button.tab${view === 'filter' ? '.on' : ''}`, { onclick: () => { view = 'filter'; ui.renderPanel(); } }, '自動の振り分け'),
    ]));
    if (view === 'filter') { renderFilter(ui, el); return; }
    if (view === 'stash') {
      el.append(h('div.tabs.small', inv.stash.map((tab, i) => h(`button.tab${stashTab === i ? '.on' : ''}`, { onclick: () => { stashTab = i; ui.renderPanel(); } }, `${i + 1}（${tab.length}）`))));
      const tab = inv.stash[stashTab] || [];
      const grid = h('div.grid');
      for (const it of tab) grid.append(itemCell(ui, it, { onClick: () => { sys.fromStash(it.uid); }, onRight: () => itemMenu(ui, it) }));
      for (let i = tab.length; i < inv.stashTabSize; i++) grid.append(emptyCell());
      el.append(h('div.hint', '押すとバッグへ戻す。右クリック（長押し）で詳しい操作。'), grid);
      return;
    }
    const tools = h('div.toolbar', [
      button('並べ替え', () => sys.sortBag(), { kind: 'small' }),
      button('マジック以下を分解', () => salvageBelow(ui, 1), { kind: 'small' }),
      button('レア以下を分解', () => salvageBelow(ui, 2), { kind: 'small' }),
      button('新しい印を消す', () => { inv.bag.forEach((x) => { x.isNew = false; }); ui.renderPanel(); }, { kind: 'small' }),
    ]);
    el.append(tools);
    const grid = h('div.grid');
    for (const it of inv.bag) {
      let up = false;
      try { up = !sys.equipProblem(it, it.slot === 'ring' ? 'ring1' : it.slot) && sys.isUpgrade(it); } catch { up = false; }
      grid.append(itemCell(ui, it, { upgrade: up, onClick: () => itemMenu(ui, it), onRight: () => { if (!it.locked) { sys.toStash(it.uid, stashTab); } } }));
    }
    for (let i = inv.bag.length; i < inv.bagSize; i++) grid.append(emptyCell());
    el.append(grid);
    el.append(h('div.hint', 'アイテムを押すと操作。右クリック（長押し）で倉庫へ。▲ は今の装備より強くなりそうな物。'));
    el.append(h('div.matlist', MATERIALS.map((m) => h('div.mat', { title: m.desc }, [h('span.dot', { style: { background: m.color } }), `${m.name} `, h('b', fmt(inv.mats[m.id] || 0))]))));
  },
};

async function salvageBelow(ui, maxIdx) {
  const g = ui.game;
  const list = g.state.inv.bag.filter((x) => !x.locked && (RARITIES.find((r) => r.id === x.rarity)?.idx ?? 0) <= maxIdx);
  if (!list.length) { ui.toast('分解できる物がありません'); return; }
  const ok = await ui.confirm(`${list.length} 個を分解します（鍵つきは残ります）。`, '分解する');
  if (!ok) return;
  const r = g.sys.inv.salvage(list.map((x) => x.uid));
  ui.toast(`${r.n} 個を分解: ${matText(r.got)}`, 'good');
}

function renderFilter(ui, el) {
  const f = ui.game.state.inv.filter;
  el.append(h('p.hint', '拾ったときに、ここで選んだレアリティは自動で分解します（素材になります）。'));
  const row = h('div.checks');
  for (const r of RARITIES) {
    const cb = h('input', { type: 'checkbox', checked: !!f.autoSalvage[r.id] || undefined, onchange: (e) => { f.autoSalvage[r.id] = e.target.checked; } });
    row.append(h('label.chk', { style: { color: r.color } }, [cb, ` ${r.name}`]));
  }
  el.append(row);
  el.append(h('label.chk', [h('input', { type: 'checkbox', checked: f.keepUpgrades || undefined, onchange: (e) => { f.keepUpgrades = e.target.checked; } }), ' 今より強くなりそうな物は分解しない']));
  el.append(h('label.chk', [h('input', { type: 'checkbox', checked: f.autoEquip || undefined, onchange: (e) => { f.autoEquip = e.target.checked; } }), ' 強くなる物は自動で装備する（放置向け）']));
}
