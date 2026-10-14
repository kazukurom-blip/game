// 極意（力の書庫）: レジェンダリーの力を抽出して登録し、攻め・守り・補助の 3 枠に着ける。
// 担当: アイテム担当

import { h, button } from '../dom.js';
import { itemCard } from '../tooltip.js';
import { fmt } from '../../engine/format.js';
import { registry } from '../../game/registry.js';
import { POOLS, CAT_NAMES } from '../../game/content/items/powerlib.js';
import { CODEX_SLOTS } from '../../game/systems/codex.js';
import { ensureCss, selectItem, selectedItem, itemPicker, matChip, clsName } from './itemkit.js';

let view = 'all';
let showMissing = false;

export const codexPanel = {
  id: 'codex', name: '極意', icon: '📜',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  help: 'レジェンダリーの装備から伝説の力を抽出すると、ここに登録されます（装備は消えます）。同じ力は一番強いロールだけが残ります。<br>登録した力は「攻め・守り・補助」の 3 つの枠に 1 つずつ着けられ、装備に付いていなくても効きます。装備と同じ力は重ねて効きません。',
  render(ui, el) {
    ensureCss();
    const g = ui.game;
    const cx = g.state.meta.codex;
    const shadow = g.sys.codex.shadowed();
    // 3 つの枠
    el.append(h('div.ik-cx', CODEX_SLOTS.map((s, i) => {
      const id = cx.equipped[i];
      const def = id ? registry.power(id) : null;
      const v = def ? registry.powerValue(id, cx.powers[id]) : 0;
      return h(`div.ik-cxslot${def ? '' : '.empty'}${shadow[i] ? '.shadow' : ''}`, [
        h('div.cat', `◆ ${s.name}`),
        h('div.nm', def ? def.name : '空き'),
        h('div.ds', def ? def.desc(v) : s.desc),
        shadow[i] ? h('div.small.bad', '装備と同じ力なので効いていない') : null,
        def ? button('外す', () => { g.sys.codex.unequip(i); ui.renderPanel(); }, { kind: 'small' }) : null,
      ]);
    })));
    // 抽出
    const found = selectedItem(g, 'codex');
    const item = found?.item;
    const info = item ? g.sys.codex.extractInfo(item) : null;
    const box = h('div.ik-op', [h('h4', '抽出')]);
    if (item && info) {
      box.append(h('div.ik-sel', itemCard(g, item, { compare: false })));
      if (!info.ok) box.append(h('p.bad', info.msg));
      else {
        const vNew = registry.powerValue(info.def.id, info.r);
        const vOld = info.prev !== undefined ? registry.powerValue(info.def.id, info.prev) : null;
        box.append(
          h('p', info.prev === undefined ? `「${info.def.name}」はまだ登録していない（ロール ${Math.round(info.r * 100)}%）。` : info.better ? `登録済みの「${info.def.name}」より強い（${Math.round(info.prev * 100)}% → ${Math.round(info.r * 100)}%・${fmtV(vOld)} → ${fmtV(vNew)}）。` : `登録済みの方が強い（${Math.round(info.prev * 100)}% ≧ ${Math.round(info.r * 100)}%）。抽出しても強さは変わらない。`),
          h('div.ik-cost', [matChip(g, 'gold', info.cost.gold), matChip(g, 'echo', info.cost.echo)]),
          h('div.ik-actions', [button('抽出して登録する（装備は消える）', async () => {
            const okk = await ui.confirm(`「${info.def.name}」を抽出します。この装備は消えます。`, '抽出する');
            if (!okk) return;
            const r = g.sys.codex.extract(item.uid);
            ui.toast(r.ok ? `極意に登録: ${info.def.name}${r.improved ? '（強くなった）' : ''}` : r.msg, r.ok ? 'good' : 'bad');
            selectItem('codex', null);
            ui.renderPanel();
          }, { kind: 'primary', disabled: !!info.missing.length })]),
        );
      }
    } else box.append(h('p', '下の一覧からレジェンダリーの装備を選ぶと、力を抽出できます（伝説の残響 3 とゴールドを使う）。'));
    el.append(box);
    el.append(itemPicker(ui, { key: 'codex', selected: item?.uid, sources: ['bag', 'stash'], filter: (it) => it.rarity === 'legendary' && it.power, onPick: (it) => selectItem('codex', it.uid), title: '力を抽出する装備', emptyText: 'レジェンダリーの装備がありません。' }));
    // 登録済み
    const total = POOLS.legendary.length;
    const have = Object.keys(cx.powers).length;
    el.append(h('section.sec', [h('h3.sec-title', ['登録した力', h('span.sec-right', `${have} / ${total}`)])]));
    el.append(h('div.tabs.small', [['all', 'すべて'], ['atk', '攻め'], ['def', '守り'], ['util', '補助']].map(([k, nm]) => h(`button.tab${view === k ? '.on' : ''}`, { onclick: () => { view = k; ui.renderPanel(); } }, nm))));
    const list = h('div.ik-list');
    const cls = g.state.hero.cls;
    for (const p of g.sys.codex.list(view === 'all' ? null : view)) {
      const slot = CODEX_SLOTS.findIndex((s) => s.cat === p.cat);
      list.append(h(`div.ik-row${p.equipped >= 0 ? '.on' : ''}`, [h('div', [
        h('div.nm', [p.def.name, h('span.ik-tag', CAT_NAMES[p.cat]), p.def.cls ? h(`span.ik-tag${p.def.cls === cls ? '.cls' : ''}`, clsName(p.def.cls)) : null, h('span.ik-tag', `ロール ${Math.round(p.r * 100)}%`)]),
        h('div.ds', p.def.desc(p.v)),
      ]), p.equipped >= 0 ? h('span.small.gold', '装着中') : button(`${CODEX_SLOTS[slot].name}の枠へ`, () => { const r = g.sys.codex.equip(slot, p.id); if (!r.ok) ui.toast(r.msg, 'bad'); ui.renderPanel(); }, { kind: 'small' })]));
    }
    if (!have) list.append(h('div.hint', 'まだ何も登録していません。'));
    el.append(list);
    // まだの力（図鑑）
    el.append(h('div.toolbar', [button(showMissing ? 'まだ登録していない力を隠す' : `まだ登録していない力を見る（${total - have}）`, () => { showMissing = !showMissing; ui.renderPanel(); }, { kind: 'small' })]));
    if (showMissing) {
      const miss = h('div.ik-list');
      for (const id of POOLS.legendary) {
        if (cx.powers[id] !== undefined) continue;
        const d = registry.power(id);
        if (view !== 'all' && d.cat !== view) continue;
        const [a, b] = d.range || [1, 1];
        miss.append(h('div.ik-row.dim', [h('div', [h('div.nm', [d.name, h('span.ik-tag', CAT_NAMES[d.cat]), d.cls ? h('span.ik-tag', clsName(d.cls)) : null]), h('div.ds', d.desc(registry.powerValue(id, 1))), h('div.sub', `強さ ${fmtV(a)}〜${fmtV(b)}`)]), h('span')]));
      }
      el.append(miss);
    }
  },
};

function fmtV(v) { return v === null || v === undefined ? '—' : Math.abs(v) >= 10 ? fmt(Math.round(v)) : String(Math.round(v * 100) / 100); }
