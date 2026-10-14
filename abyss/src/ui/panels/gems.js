// 宝石の窓: 宝石の合成（3 → 1）・ソケットにはめる/外す・ルーンとルーン語・深淵の宝石（裂け目で育つ）。
// 担当: アイテム担当

import { h, button } from '../dom.js';
import { attachTip } from '../tooltip.js';
import { itemCard } from '../tooltip.js';
import { fmt } from '../../engine/format.js';
import { describeMod } from '../../data/stats.js';
import { GEMS, GEM_TIERS, GEM_TIER_NAMES, gemCombineGold, RUNES, RUNE, runeCombineGold, RUNEWORDS, LEGENDARY_GEMS, lgemUpgradeChance } from '../../data/gems.js';
import { SLOT_NAMES, socketKind } from '../../data/items.js';
import { registry } from '../../game/registry.js';
import { gemMod, runeMod, gemName, runeName, parseSocket } from '../../game/content/items/itemlib.js';
import { ensureCss, selectItem, selectedItem, itemPicker, onGemsTab } from './itemkit.js';

const TABS = [['gems', '宝石'], ['socket', 'ソケット'], ['runes', 'ルーン'], ['words', 'ルーン語'], ['lgems', '深淵の宝石']];
let tab = 'gems';
let sockTarget = 0;
onGemsTab((t) => { tab = t; });
const KIND_NAME = { weapon: '武器', armor: '防具', jewelry: '装飾品' };

export const gemsPanel = {
  id: 'gems', name: '宝石', icon: '💎',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  help: '宝石は同じ物 3 つでひとつ上の段階に合成できます。武器・防具・装飾品で効果が変わります。<br>ルーンはノーマル（オプション無し）の装備に、ルーン語の順番どおりにちょうどの数をはめると、名前つきのルーン語の装備になります。<br>深淵の宝石は首飾り・指輪にはめ、深淵の裂け目を踏破するたびに育ちます。',
  badge: (g) => { const gm = g.state.inv.gems || {}; let n = 0; for (const k in gm) if (gm[k] >= 3 && !k.endsWith(`_${GEM_TIERS}`)) n++; return n; },
  render(ui, el) {
    ensureCss();
    el.append(h('div.tabs', TABS.map(([id, nm]) => h(`button.tab${tab === id ? '.on' : ''}`, { onclick: () => { tab = id; ui.renderPanel(); } }, nm))));
    ({ gems: renderGems, socket: renderSocket, runes: renderRunes, words: renderWords, lgems: renderLgems })[tab](ui, el);
  },
};

function gemTip(id, tier) {
  const kinds = ['weapon', 'armor', 'jewelry'];
  return h('div.tipbox', [
    h('b', gemName(id, tier)),
    ...kinds.map((k) => { const m = gemMod(id, tier, k); return h('div', `${KIND_NAME[k]}: ${m ? describeMod(m, (v) => fmt(v)) : ''}`); }),
    tier < GEM_TIERS ? h('div.dim', `3 つで${GEM_TIER_NAMES[tier]}${GEMS.find((g) => g.id === id).name}に（${fmt(gemCombineGold(tier))} G）`) : h('div.dim', '最上位の段階'),
  ]);
}

function renderGems(ui, el) {
  const g = ui.game;
  const inv = g.state.inv.gems;
  const table = h('table.ik-gemtable');
  table.append(h('tr', [h('th', ''), ...Array.from({ length: GEM_TIERS }, (_, i) => h('th', { style: { textAlign: 'center' } }, String(i + 1)))]));
  for (const gm of GEMS) {
    const row = h('tr', { style: { '--gc': gm.color } }, [h('th', [h('span.ik-gem'), gm.name])]);
    for (let t = 1; t <= GEM_TIERS; t++) {
      const n = inv[`${gm.id}_${t}`] || 0;
      const td = h(`td${n ? '.has' : ''}${n >= 3 && t < GEM_TIERS ? '.can' : ''}`, { onclick: () => {
        if (n < 3 || t >= GEM_TIERS) return;
        const r = g.sys.gems.combineGem(gm.id, t);
        ui.toast(r.ok ? `合成: ${gemName(gm.id, t + 1)}（${fmt(r.cost)} G）` : r.msg, r.ok ? 'good' : 'bad');
        ui.renderPanel();
      } }, n ? String(n) : '·');
      attachTip(td, () => gemTip(gm.id, t));
      row.append(td);
    }
    table.append(row);
  }
  el.append(h('section.sec', [h('h3.sec-title', ['宝石（種類 × 段階）', h('span.sec-right', '金の枠: 3 つあり合成できる')]), table]));
  el.append(h('div.toolbar', [
    button('まとめて合成（下の段から）', () => { const r = g.sys.gems.combineAllGems(); ui.toast(r.n ? `${r.n} 回合成した（${fmt(r.gold)} G）` : (r.msg || '合成できる宝石がない'), r.n ? 'good' : ''); ui.renderPanel(); }, { kind: 'primary' }),
    button('ソケットにはめる', () => { tab = 'socket'; ui.renderPanel(); }, { kind: 'small' }),
  ]));
  // 効果の一覧
  const list = h('div.ik-list');
  for (const gm of GEMS) {
    const t = Math.max(1, ...Array.from({ length: GEM_TIERS }, (_, i) => ((inv[`${gm.id}_${i + 1}`] || 0) > 0 ? i + 1 : 1)));
    list.append(h('div.ik-row', { style: { '--gc': gm.color } }, [h('div', [
      h('div.nm', [h('span.ik-gem'), `${gm.name}`, h('span.ik-tag', `${GEM_TIER_NAMES[t - 1]}（段階 ${t}）`)]),
      h('div.ds', ['weapon', 'armor', 'jewelry'].map((k) => `${KIND_NAME[k]}: ${describeMod(gemMod(gm.id, t, k), (v) => fmt(v))}`).join('　')),
      h('div.sub', gm.desc),
    ]), h('span')]));
  }
  el.append(h('section.sec', [h('h3.sec-title', '効果（持っている一番上の段階）'), list]));
  el.append(h('p.hint', '宝石はエリート（10%）・ボス（60%）・章のボス・宝ゴブリンが落とします。段階の上限はエリアレベルで上がります（12 ごとに 1 段）。'));
}

function renderSocket(ui, el) {
  const g = ui.game;
  const found = selectedItem(g, 'gems');
  const item = found?.item;
  if (item?.sockets?.length) {
    el.append(h('div.ik-sel', itemCard(g, item, { compare: false, equipped: found.where === 'equip' })));
    if (sockTarget >= item.sockets.length) sockTarget = 0;
    const kind = socketKind(item.slot);
    const row = h('div.ik-socketrow');
    item.sockets.forEach((key, i) => {
      const s = parseSocket(key);
      const color = s?.def?.color;
      const label = s ? (s.type === 'gem' ? [h('big', '◆'), gemName(s.id, s.tier)] : s.type === 'rune' ? [h('big', s.def.name), 'ルーン'] : [h('big', '◉'), s.def.name]) : [h('big', '◇'), '空き'];
      const cell = h(`div.ik-sock${s ? '.full' : ''}${!s && i === sockTarget ? '.target' : ''}`, { style: color ? { '--gc': color } : {}, onclick: () => {
        if (!s) { sockTarget = i; ui.renderPanel(); return; }
        const r = g.sys.gems.unsocket(item.uid, i);
        ui.toast(r.ok ? '外した（無料）' : r.msg, r.ok ? 'good' : 'bad');
        ui.renderPanel();
      } }, label);
      attachTip(cell, () => h('div.tipbox', s ? (s.type === 'lgem' ? [h('b', s.def.name), h('div', registry.power(s.def.power)?.desc(item.lgl?.[s.id] || 1) || '')] : [h('b', s.type === 'gem' ? gemName(s.id, s.tier) : runeName(s.id)), h('div', describeMod((s.type === 'gem' ? gemMod(s.id, s.tier, kind) : runeMod(s.id, kind)), (v) => fmt(v))), item.rw ? h('div.dim', 'ルーン語のルーンは外せない') : h('div.dim', '押すと外す（無料）')]) : [h('b', '空きソケット'), h('div', '押して選び、下の一覧からはめる物を選ぶ')]));
      row.append(cell);
    });
    el.append(row);
    const emptyIdx = item.sockets.findIndex((x) => !x);
    if (emptyIdx >= 0) {
      if (item.sockets[sockTarget]) sockTarget = emptyIdx;
      const chips = [];
      for (const gm of g.sys.gems.gemList()) {
        const m = gemMod(gm.id, gm.tier, kind);
        const c = h('span.ik-chip.off', { style: { '--gc': gm.color }, onclick: () => doSocket(ui, item, gm.key) }, [h('span.ik-gem'), `${gm.name} ×${gm.n}`]);
        attachTip(c, () => h('div.tipbox', [h('b', gm.name), h('div', `${KIND_NAME[kind]}: ${describeMod(m, (v) => fmt(v))}`)]));
        chips.push(c);
      }
      if (!item.rw) for (const r of g.sys.gems.runeList()) {
        const m = runeMod(r.id, kind);
        const c = h('span.ik-chip.off', { onclick: () => doSocket(ui, item, r.key) }, [h('span.ik-rune', { style: { '--gc': r.color, minWidth: '18px', height: '18px', fontSize: '12px' } }, RUNE[r.id].name), `×${r.n}`]);
        attachTip(c, () => h('div.tipbox', [h('b', r.name), h('div', `${KIND_NAME[kind]}: ${describeMod(m, (v) => fmt(v))}`), h('div.dim', `段階 ${r.tier}`)]));
        chips.push(c);
      }
      if (kind === 'jewelry') for (const lg of g.sys.gems.ownedLegendaryGems().filter((x) => !x.uid)) {
        const c = h('span.ik-chip.on', { onclick: () => doSocket(ui, item, `lg:${lg.id}`) }, [h('span.ik-gem', { style: { '--gc': lg.color } }), `${lg.name} Lv${lg.lvl}`]);
        attachTip(c, () => h('div.tipbox', [h('b', lg.name), h('div', registry.power(lg.power)?.desc(lg.lvl) || '')]));
        chips.push(c);
      }
      el.append(h('section.sec', [h('h3.sec-title', [`${sockTarget + 1} 番目のソケットにはめる`, h('span.sec-right', `${KIND_NAME[kind]}の効果`)]), chips.length ? h('div.ik-chips', chips) : h('div.hint', 'はめられる宝石・ルーンを持っていません。')]));
      const prog = g.sys.gems.runewordProgress(item);
      if (item.rarity === 'common' && !item.affixes?.length) el.append(h('p.hint', prog.length ? `ルーン語になれる: ${prog.map((w) => `「${w.name}」（${w.runes.map((x) => RUNE[x].name).join('→')}）`).join(' / ')}` : `この装備（ソケット ${item.sockets.length}）に合うルーン語: ${RUNEWORDS.filter((w) => w.slots.includes(item.slot) && w.runes.length === item.sockets.length).map((w) => `「${w.name}」`).join('・') || 'なし'}`));
    }
  } else {
    el.append(h('div.ik-empty', '下の一覧からソケットのある装備を選んでください（鍛冶の「穿孔」でソケットを開けられます）'));
  }
  el.append(itemPicker(ui, { key: 'gems', selected: item?.uid, filter: (it) => it.sockets?.length > 0, onPick: (it) => { selectItem('gems', it.uid); sockTarget = it.sockets.findIndex((x) => !x); if (sockTarget < 0) sockTarget = 0; }, title: 'ソケットのある装備', emptyText: 'ソケットのある装備がありません。鍛冶の「穿孔」で開けられます。' }));
}

function doSocket(ui, item, key) {
  const r = ui.game.sys.gems.socket(item.uid, sockTarget, key);
  if (!r.ok) ui.toast(r.msg, 'bad');
  else if (!r.runeword) ui.toast('はめた', 'good');
  sockTarget = item.sockets.findIndex((x) => !x);
  if (sockTarget < 0) sockTarget = 0;
  ui.renderPanel();
}

function renderRunes(ui, el) {
  const g = ui.game;
  const inv = g.state.inv.runes;
  const list = h('div.ik-list');
  for (const r of RUNES) {
    const n = inv[r.id] || 0;
    const next = RUNES.find((x) => x.tier === r.tier + 1);
    list.append(h(`div.ik-row${n ? '' : '.dim'}`, [h('div', [
      h('div.nm', [h('span.ik-rune', { style: { '--gc': r.color } }, r.name), `　${runeName(r.id)}`, h('span.ik-tag', `段階 ${r.tier}`), h('span.ik-tag', `×${n}`)]),
      h('div.ds', ['weapon', 'armor', 'jewelry'].map((k) => `${KIND_NAME[k]}: ${describeMod(runeMod(r.id, k), (v) => fmt(v))}`).join('　')),
    ]), next ? button(`3 つで「${next.name}」`, () => { const x = g.sys.gems.combineRune(r.id); ui.toast(x.ok ? `合成: ${runeName(x.id)}（${fmt(x.cost)} G）` : x.msg, x.ok ? 'good' : 'bad'); ui.renderPanel(); }, { kind: 'small', disabled: n < 3, title: `${fmt(runeCombineGold(r.tier))} G` }) : h('span.dim.small', '最上位')]));
  }
  el.append(h('p.hint', 'ルーンはエリート（4%）・ボス（25%）などから。上の段階ほど珍しく、エリアレベルが上がると出るようになります。'));
  el.append(list);
}

function renderWords(ui, el) {
  const g = ui.game;
  const inv = g.state.inv.runes;
  const made = g.state.meta.collection.runewords || {};
  el.append(h('p.hint', 'ノーマル（オプション無し）の装備に、ルーンを左から順にはめます。ソケットの数がちょうど同じでないとなりません。ルーン語にしたルーンは外せません。'));
  const list = h('div.ik-list');
  for (const w of RUNEWORDS) {
    const p = registry.power(w.power.id);
    const v0 = registry.powerValue(w.power.id, w.power.r[0]); const v1 = registry.powerValue(w.power.id, w.power.r[1]);
    list.append(h(`div.ik-row${made[w.id] ? '.on' : ''}`, [h('div', [
      h('div.nm', [`「${w.name}」`, h('span.ik-tag', `${w.slots.map((s) => SLOT_NAMES[s]).join('・')}・ソケット ${w.runes.length}`), made[w.id] ? h('span.ik-tag.new', `作った ${made[w.id]}`) : null]),
      h('div.ik-runes', { style: { margin: '4px 0' } }, w.runes.map((id) => h(`span.ik-rune${(inv[id] || 0) > 0 ? '' : '.miss'}`, { style: { '--gc': RUNE[id].color }, title: runeName(id) }, [RUNE[id].name, h('small', String(RUNE[id].tier))]))),
      h('div.ds', w.mods.map((m) => describeMod(m, (v) => fmt(v))).join('、')),
      p ? h('div.ds', { style: { color: '#ffb066' } }, `◆ ${p.name}: ${p.desc(v0)}${v1 !== v0 ? `（〜${typeof v1 === 'number' ? fmt(v1) : v1}）` : ''}`) : null,
      h('div.sub', `「${w.flavor}」`),
    ]), h('span')]));
  }
  el.append(list);
}

function renderLgems(ui, el) {
  const g = ui.game;
  const owned = g.sys.gems.ownedLegendaryGems();
  const target = g.sys.gems.lgemTargetId();
  const best = g.state.world.rift?.best || 0;
  el.append(h('p.hint', `深淵の裂け目を踏破するたびに、選んだ宝石の強化を 1〜3 回（時間内 +1・残り 50% 以上 +1）試します。成功率は「裂け目の段階 − 宝石のレベル」で決まります。まだ持っていない宝石は踏破で 25% の確率（最初の 1 つは必ず）手に入ります。最高記録: 段階 ${best}`));
  const list = h('div.ik-list');
  for (const lg of LEGENDARY_GEMS) {
    const o = owned.find((x) => x.id === lg.id);
    const p = registry.power(lg.power);
    if (!o) { list.append(h('div.ik-lg.miss', [h('div.orb'), h('div', [h('div.nm', { style: { fontWeight: 700 } }, lg.name), h('div.sub.small.dim', '未入手（深淵の裂け目・苦行の章のボスから）'), h('div.small.dim', p ? p.desc(1) : '')]), h('span')])); continue; }
    const where = o.uid ? g.sys.inv.findItem(o.uid) : null;
    const chance = lgemUpgradeChance(Math.max(best, 1), o.lvl);
    list.append(h(`div.ik-lg${target === lg.id ? '.on' : ''}`, { style: { '--gc': lg.color } }, [
      h('div.orb'),
      h('div', [
        h('div', { style: { fontWeight: 700 } }, [lg.name, target === lg.id ? h('span.ik-tag.new', '強化の対象') : null, where ? h('span.ik-tag', `${SLOT_NAMES[where.item.slot]}にはまっている`) : h('span.ik-tag', 'はまっていない')]),
        h('div.small', { style: { color: '#e8d8c8' } }, p ? p.desc(o.lvl) : ''),
        h('div.small.dim', best > 0 ? `最高記録の段階 ${best} での成功率 ${chance}%　（段階 ${o.lvl + 7} 以上なら 100%）` : `段階 ${o.lvl} で成功率 60%、段階 ${o.lvl + 7} 以上なら 100%（まだ裂け目を踏破していない）`),
      ]),
      h('div', [h('div.lv', `Lv${o.lvl}`), target === lg.id ? null : button('対象にする', () => { g.sys.gems.setLgemTarget(lg.id); ui.renderPanel(); }, { kind: 'small' })]),
    ]));
  }
  el.append(list);
}
