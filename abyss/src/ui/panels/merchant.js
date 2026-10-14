// 商人: 目利き（部位を選んで深淵の欠片で買う）・バッグと倉庫の拡張・素材の売り買い・ミシックの交換。
// 担当: アイテム担当

import { h, button } from '../dom.js';
import { itemCard } from '../tooltip.js';
import { fmt } from '../../engine/format.js';
import { SLOT_NAMES } from '../../data/items.js';
import { MATERIALS, MATERIAL } from '../../data/materials.js';
import { MYTHICS } from '../../data/uniques.js';
import { registry } from '../../game/registry.js';
import { GAMBLE_SLOTS, MAT_PRICE, MYTHIC_COST } from '../../game/systems/merchant.js';
import { ensureCss, matChip, meter, luckMeters } from './itemkit.js';
import { RARITY } from '../../data/rarity.js';

const TABS = [['gamble', '目利き'], ['expand', '拡張'], ['mats', '素材'], ['mythic', 'ミシック交換']];
let tab = 'gamble';
let last = null;

export const merchantPanel = {
  id: 'merchant', name: '商人', icon: '⚖',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world', 'gold'],
  visible: () => true,
  help: '目利き: 部位を選び、深淵の欠片で品物を買います（中身はレア以上。確率は下の表のとおり）。<br>ミシック交換: 極致の核と伝説の残響を集めると、好きなミシックを 1 つ選んで手に入れられます（確定ルート）。',
  render(ui, el) {
    ensureCss();
    el.append(h('div.tabs', TABS.map(([id, nm]) => h(`button.tab${tab === id ? '.on' : ''}`, { onclick: () => { tab = id; ui.renderPanel(); } }, nm))));
    ({ gamble: renderGamble, expand: renderExpand, mats: renderMats, mythic: renderMythic })[tab](ui, el);
  },
};

function renderGamble(ui, el) {
  const g = ui.game;
  const info = g.sys.merchant.gambleInfo();
  el.append(h('div.ik-op', [
    h('h4', '目利き'),
    h('div.ik-sub', [h('span', `品物のアイテム Lv ${info.ilvl}（今いる場所と主人公のレベルの高い方）`), h('span', ['1 回 ', h('b', `${info.cost}`), ' 欠片'])]),
    h('div.ik-cost', [matChip(g, 'shard', info.cost)]),
    h('div.ik-odds', info.odds.flatMap((o) => [h('span', { style: { color: o.color } }, o.name), h('div.bar', h('i', { style: { width: `${Math.max(1.5, Math.min(100, o.p * 1.6))}%`, background: o.color } })), h('span.pct', `${o.p}%`)])),
    h('div.hint', '部位を押すと 1 回買います。クラスに合う種類が出やすくなります（8 割）。'),
    h('div.ik-slotbtns', GAMBLE_SLOTS.map((s) => button(SLOT_NAMES[s], () => {
      const r = g.sys.merchant.gamble(s);
      if (!r.ok) { ui.toast(r.msg, 'bad'); return; }
      last = r.item;
      // レジェンダリー以上は全体の知らせ（loot）が出るので、ここではそれ以外だけ
      if ((RARITY[r.item.rarity]?.idx || 0) < 4) ui.toast(`${RARITY[r.item.rarity].name}の${SLOT_NAMES[r.item.slot]}を手に入れた`, `r-${r.item.rarity}`);
      ui.renderPanel();
    }, { disabled: info.have < info.cost || info.bagFree <= 0 }))),
    info.bagFree <= 0 ? h('p.bad', 'バッグがいっぱいです') : null,
  ]));
  if (last && g.sys.inv.findItem(last.uid)) el.append(h('div.ik-result', [h('div.t', '今回の品物'), itemCard(g, last, { compare: true })]));
  el.append(h('p.hint', `深淵の欠片は、エリート（12%）・地域のボス（2〜4 個）・章のボス（6〜10 個）・宝ゴブリン（5〜8 個）から。持っている数: ${fmt(g.state.inv.mats.shard || 0)}`));
}

function renderExpand(ui, el) {
  const g = ui.game;
  const b = g.sys.merchant.bagInfo();
  const s = g.sys.merchant.stashInfo();
  el.append(h('div.ik-op', [
    h('h4', 'バッグを広げる'),
    meter('バッグの枠', b.cur, b.max, '#d9b45a', { right: `${b.cur} / ${b.max}` }),
    b.next ? h('p', `${b.cur} → ${b.next} 枠`) : h('p', '最大まで広げた'),
    b.next ? h('div.ik-cost', [matChip(g, 'gold', b.cost)]) : null,
    b.next ? h('div.ik-actions', [button(`広げる（+${b.next - b.cur}）`, () => { const r = g.sys.merchant.expandBag(); ui.toast(r.ok ? `バッグが ${r.size} 枠になった` : r.msg, r.ok ? 'good' : 'bad'); ui.renderPanel(); }, { kind: 'primary', disabled: g.state.meta.gold < b.cost })]) : null,
  ]));
  el.append(h('div.ik-op', [
    h('h4', '倉庫のタブを増やす'),
    meter('倉庫のタブ', s.tabs, s.max, '#8ab8ff', { right: `${s.tabs} / ${s.max} 枚（1 枚 ${g.state.inv.stashTabSize} 枠）` }),
    s.tabs < s.max ? h('div.ik-cost', [matChip(g, 'gold', s.cost)]) : h('p', '最大まで増やした'),
    s.tabs < s.max ? h('div.ik-actions', [button('タブを増やす', () => { const r = g.sys.merchant.addStashTab(); ui.toast(r.ok ? `倉庫のタブが ${r.tabs} 枚になった` : r.msg, r.ok ? 'good' : 'bad'); ui.renderPanel(); }, { kind: 'primary', disabled: g.state.meta.gold < s.cost })]) : null,
  ]));
}

function renderMats(ui, el) {
  const g = ui.game;
  const list = h('div.ik-list');
  for (const m of MATERIALS) {
    const p = g.sys.merchant.matPrice(m.id);
    const have = g.state.inv.mats[m.id] || 0;
    list.append(h('div.ik-row', [h('div', [
      h('div.nm', [h('span.ik-gem', { style: { '--gc': m.color } }), m.name, h('span.ik-tag', `×${fmt(have)}`)]),
      h('div.ds', m.desc),
      h('div.sub', `入手: ${m.src}`),
    ]), p ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, [
      p.buy ? button(`${p.pack} 個買う ${fmt(p.buy)} G`, () => { const r = g.sys.merchant.buyMat(m.id, 1); ui.toast(r.ok ? `${m.name} を ${r.got} 個買った` : r.msg, r.ok ? 'good' : 'bad'); ui.renderPanel(); }, { kind: 'small', disabled: g.state.meta.gold < p.buy }) : null,
      button(`10 個売る ${fmt(p.sell * Math.min(10, have))} G`, () => { const r = g.sys.merchant.sellMat(m.id, 10); ui.toast(r.ok ? `${r.n} 個売った（${fmt(r.gold)} G）` : r.msg, r.ok ? 'good' : 'bad'); ui.renderPanel(); }, { kind: 'small', disabled: !have }),
    ]) : h('span.dim.small', '売買できない')]));
  }
  el.append(h('p.hint', '値段は主人公のレベルで上がります。試薬（混沌の滴など）は売れますが、買えません。'));
  el.append(list);
}

function renderMythic(ui, el) {
  const g = ui.game;
  const info = g.sys.merchant.exchangeInfo();
  el.append(luckMeters(g));
  el.append(h('div.ik-op', [
    h('h4', 'ミシックの交換（確定ルート）'),
    meter(`極致の核（覚醒 1・極致 3）`, info.have.core, MYTHIC_COST.core, MATERIAL.core.color, { right: `${info.have.core} / ${MYTHIC_COST.core}` }),
    meter('伝説の残響（レジェンダリー以上の分解）', info.have.echo, MYTHIC_COST.echo, MATERIAL.echo.color, { right: `${info.have.echo} / ${MYTHIC_COST.echo}` }),
    h('p', info.ok ? '交換できます。欲しいミシックを選んでください。' : `あと 極致の核 ${Math.max(0, MYTHIC_COST.core - info.have.core)}・伝説の残響 ${Math.max(0, MYTHIC_COST.echo - info.have.echo)}`),
  ]));
  const cards = h('div.ik-cards');
  for (const m of MYTHICS) {
    const p = registry.power(m.power);
    const owned = g.state.meta.collection.mythics?.[m.id];
    cards.append(h('div.ik-mcard', [
      h('div.nm', m.name),
      h('div.sl', `${SLOT_NAMES[m.slot]}${owned ? `・手に入れた ${owned}` : ''}`),
      p ? h('div.ds', p.desc(registry.powerValue(m.power, 0.5))) : null,
      h('div.ik-flavor', `「${m.flavor}」`),
      button('これと交換', async () => {
        const okk = await ui.confirm(`極致の核 ${MYTHIC_COST.core}・伝説の残響 ${MYTHIC_COST.echo} で「${m.name}」と交換します。`, '交換する');
        if (!okk) return;
        const r = g.sys.merchant.exchangeMythic(m.id);
        ui.toast(r.ok ? `ミシック「${m.name}」を手に入れた！` : r.msg, r.ok ? 'r-mythic' : 'bad');
        ui.renderPanel();
      }, { kind: 'primary', disabled: !info.ok }),
    ]));
  }
  el.append(cards);
}

export { MAT_PRICE };
