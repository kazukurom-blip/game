// アイテム担当の UI の共通部品: 見た目（CSS）・装備の選び方・費用の表示・ツールチップの追加・アイテムの操作の近道・ユニークの絵。
// 鍛冶・宝石・極意・商人・持ち物の窓から使う。

import { h, button, injectCss } from '../dom.js';
import { itemCell, itemMenuHooks, emptyCell } from './common.js';
import { tooltipHooks, modLine } from '../tooltip.js';
import { hudHooks } from '../hud.js';
import { fmt } from '../../engine/format.js';
import { registry } from '../../game/registry.js';
import { assets } from '../../render/assets.js';
import { describeMod, statDef } from '../../data/stats.js';
import { SLOTS, SLOT_NAMES } from '../../data/items.js';
import { RARITY } from '../../data/rarity.js';
import { MATERIAL } from '../../data/materials.js';
import { UNIQUE, UNIQUES, MYTHIC, MYTHICS, SET, SETS, SET_PIECE } from '../../data/uniques.js';
import { RUNEWORD, RUNE } from '../../data/gems.js';
import { itemName } from '../../game/items.js';
import { specialDef, fixedValue, parseSocket, gemName, runeName, gemMod, runeMod, enhBonusPct, runewordMods, shownValue } from '../../game/content/items/itemlib.js';
import { setCounts } from '../../game/content/items/loot.js';
import { socketKind } from '../../data/items.js';

// ======================================================================
// 見た目
// ======================================================================
const CSS = `
.cell.sel { outline: 2px solid var(--gold2); outline-offset: -1px; filter: brightness(1.25); }
.cell.ik-pick { box-shadow: inset 0 0 0 2px #6ee08a, 0 0 8px #6ee08a88; }
.cell.ik-pick::before { content: '✔'; position: absolute; left: 50%; bottom: 1px; transform: translateX(-50%); font-size: 12px; color: #6ee08a; text-shadow: 0 0 3px #000; z-index: 2; }
.ik-sel { margin: 6px 0 10px; }
.ik-sel .itemcard { min-width: 0; box-shadow: none; }
.ik-empty { border: 1px dashed var(--line2); border-radius: 8px; padding: 18px 12px; text-align: center; color: var(--dim); margin: 6px 0 10px; background: #110e14; }
.ik-op { background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
.ik-op h4 { margin: 0 0 6px; font-size: 14px; color: var(--gold2); font-family: var(--serif); }
.ik-op p { margin: 4px 0; font-size: 12.5px; color: #cfc6b6; }
.ik-big { font-size: 26px; font-weight: 900; font-family: var(--serif); color: #fff; }
.ik-big small { font-size: 12px; color: var(--dim); font-weight: 400; margin-left: 6px; }
.ik-flow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 4px 0 8px; }
.ik-arrow { color: var(--gold); font-size: 18px; }
.ik-cost { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.ik-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 12px; font-size: 12px; background: #1d1824; border: 1px solid var(--line); }
.ik-chip .dot { width: 8px; height: 8px; border-radius: 2px; transform: rotate(45deg); display: inline-block; }
.ik-chip.short { border-color: #a04a40; color: #ffb0a8; background: #2a1414; }
.ik-chip.ok b { color: #fff; }
.ik-chip.on { border-color: var(--gold); color: var(--gold2); background: #2a2214; cursor: pointer; }
.ik-chip.off { cursor: pointer; color: var(--dim); }
.ik-chip.off:hover, .ik-chip.on:hover { filter: brightness(1.25); }
.ik-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ik-rate { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; margin: 6px 0; }
.ik-rate div { text-align: center; font-size: 10px; padding: 3px 0; background: #1a1620; border-radius: 3px; color: var(--dim); }
.ik-rate div.cur { background: #4a3a1a; color: var(--gold2); font-weight: 700; }
.ik-rate div.done { color: #6a6272; background: #141118; }
.ik-rate div b { display: block; font-size: 11px; color: inherit; }
.ik-meter { margin: 6px 0; }
.ik-meter .lbl { display: flex; justify-content: space-between; font-size: 12px; color: #cfc6b6; margin-bottom: 3px; }
.ik-meter .track { position: relative; height: 10px; background: #0d0b10; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.ik-meter .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; transition: width .3s; }
.ik-meter .soft { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #fff8; }
.ik-meter.hot .fill { animation: ikpulse 1.2s infinite; }
@keyframes ikpulse { 50% { filter: brightness(1.6); } }
.ik-aff { display: flex; align-items: center; gap: 6px; padding: 5px 8px; margin: 3px 0; border: 1px solid var(--line); border-radius: 6px; background: #17131c; cursor: pointer; font-size: 12.5px; color: #8ab8ff; }
.ik-aff:hover { filter: brightness(1.25); }
.ik-aff.on { border-color: var(--gold); background: #2a2214; }
.ik-aff.lock { opacity: .45; cursor: not-allowed; }
.ik-aff .tier { margin-left: auto; font-size: 10.5px; color: #8a8292; }
.ik-aff .star { color: #ffd04a; }
.ik-aff.greater { color: #ffd98a; }
.ik-choices { display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 6px; }
.ik-choice { border: 1px solid var(--line2); border-radius: 8px; padding: 8px 10px; background: #1a1520; display: flex; align-items: center; gap: 8px; }
.ik-choice .mod { flex: 1; }
.ik-choice.keep { border-style: dashed; }
.ik-odds { display: grid; grid-template-columns: 90px 1fr 52px; gap: 4px 8px; align-items: center; font-size: 12px; margin: 6px 0; }
.ik-odds .bar { height: 8px; border-radius: 4px; background: #0d0b10; overflow: hidden; }
.ik-odds .bar i { display: block; height: 100%; border-radius: 4px; }
.ik-odds .pct { text-align: right; color: #fff; font-variant-numeric: tabular-nums; }
.ik-slotbtns { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 6px 0; }
.ik-slotbtns .btn { padding: 8px 2px; font-size: 12px; }
.ik-flavor { font-family: var(--serif); font-style: italic; color: #c9a46b; font-size: 12px; margin: 6px 0 2px; line-height: 1.5; }
.ik-fixed .mod { color: #e8c88a; }
.ik-fixed .mod.greater { color: #ffd98a; }
.ik-range { color: #6a6272; font-size: 10.5px; margin-left: auto; }
.ik-setbox { margin-top: 6px; padding: 6px 8px; border-left: 2px solid var(--r-set); background: rgba(61,255,122,.05); font-size: 12px; }
.ik-setbox .sn { color: var(--r-set); font-weight: 700; }
.ik-setbox .pc { color: #5a6a5a; margin-right: 6px; display: inline-block; }
.ik-setbox .pc.have { color: #9affb0; }
.ik-setbox .bn { color: #5a6a5a; margin-top: 2px; }
.ik-setbox .bn.on { color: #9affb0; }
.ik-state { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px; font-size: 11.5px; color: var(--dim); }
.ik-state .cor { color: #ff6a8a; font-weight: 700; }
.ik-state .lk { color: #ffd27a; }
.ik-sockets { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.ik-sockets .sk { display: flex; gap: 6px; align-items: baseline; }
.ik-sockets .sk .gm { font-weight: 700; }
.ik-sockets .sk.empty { color: #5a5262; }
.ik-rw { margin-top: 6px; padding: 6px 8px; border-left: 2px solid var(--r-unique); background: rgba(232,181,107,.07); font-size: 12px; }
.ik-rw b { color: var(--r-unique); }
.ik-cimp .mod { color: #ff6a8a; }
.ik-gemtable { width: 100%; border-collapse: separate; border-spacing: 2px; font-size: 11px; }
.ik-gemtable th { color: var(--dim); font-weight: 400; text-align: left; padding: 2px 4px; white-space: nowrap; }
.ik-gemtable td { text-align: center; background: #15111a; border-radius: 4px; padding: 5px 0; color: #4a4252; cursor: default; min-width: 26px; }
.ik-gemtable td.has { color: #fff; font-weight: 700; cursor: pointer; background: color-mix(in srgb, var(--gc) 22%, #15111a); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gc) 50%, transparent); }
.ik-gemtable td.can { box-shadow: inset 0 0 0 2px var(--gold); }
.ik-gemtable td.has:hover { filter: brightness(1.35); }
.ik-gem { display: inline-block; width: 10px; height: 10px; transform: rotate(45deg); border-radius: 2px; margin-right: 5px; vertical-align: middle; box-shadow: 0 0 6px var(--gc); background: var(--gc); }
.ik-socketrow { display: flex; gap: 10px; justify-content: center; margin: 10px 0; flex-wrap: wrap; }
.ik-sock { width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--line2); background: radial-gradient(circle, #1a1520, #0b090e); display: flex; align-items: center; justify-content: center; flex-direction: column; cursor: pointer; font-size: 10px; color: var(--dim); text-align: center; line-height: 1.2; }
.ik-sock.full { border-color: var(--gc, #ff6ad0); box-shadow: 0 0 12px color-mix(in srgb, var(--gc, #ff6ad0) 50%, transparent), inset 0 0 14px color-mix(in srgb, var(--gc, #ff6ad0) 40%, transparent); color: #fff; }
.ik-sock.target { border-color: var(--gold); box-shadow: 0 0 10px var(--gold); }
.ik-sock big { font-size: 20px; font-family: var(--serif); }
.ik-list { display: flex; flex-direction: column; gap: 6px; }
.ik-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #120f16; }
.ik-row .nm { font-weight: 700; }
.ik-row .ds { font-size: 12px; color: #cfc6b6; margin-top: 2px; }
.ik-row .sub { font-size: 11px; color: var(--dim); margin-top: 2px; }
.ik-row.dim { opacity: .55; }
.ik-row.on { border-color: var(--gold); }
.ik-runes { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.ik-rune { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 4px; border-radius: 6px; font-family: var(--serif); font-weight: 900; font-size: 15px; background: #1a1520; border: 1px solid color-mix(in srgb, var(--gc) 70%, transparent); color: var(--gc); }
.ik-rune.miss { opacity: .35; }
.ik-rune small { font-size: 9px; color: var(--dim); margin-left: 2px; font-family: var(--font); font-weight: 400; }
.ik-cx { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0 10px; }
.ik-cxslot { border: 1px solid var(--line2); border-radius: 8px; padding: 8px; background: linear-gradient(#1c1622, #110e14); min-height: 112px; font-size: 11.5px; display: flex; flex-direction: column; gap: 4px; }
.ik-cxslot .cat { color: var(--gold); font-size: 11px; letter-spacing: .1em; }
.ik-cxslot .nm { font-family: var(--serif); font-weight: 800; color: var(--r-legendary); font-size: 13px; }
.ik-cxslot .ds { color: #cfc6b6; flex: 1; }
.ik-cxslot.empty .nm { color: var(--dim); }
.ik-cxslot.shadow { opacity: .6; }
.ik-tag { display: inline-block; font-size: 10px; padding: 0 5px; border-radius: 3px; background: #2a2230; color: #c8bcd8; margin-left: 4px; vertical-align: 1px; }
.ik-tag.cls { background: #3a2a1a; color: #ffd27a; }
.ik-tag.new { background: #1a3a22; color: #9affb0; }
.ik-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.ik-mcard { border: 1px solid color-mix(in srgb, var(--r-mythic) 50%, var(--line)); border-radius: 8px; padding: 8px; background: linear-gradient(#1f1219, #110e14); font-size: 11.5px; display: flex; flex-direction: column; gap: 3px; }
.ik-mcard .nm { color: var(--r-mythic); font-family: var(--serif); font-weight: 800; font-size: 13.5px; }
.ik-mcard .sl { color: var(--dim); font-size: 10.5px; }
.ik-mcard .ds { color: #e8d8c8; }
.ik-mcard .btn { margin-top: auto; }
.ik-lg { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: #120f16; display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; align-items: center; }
.ik-lg .orb { width: 40px; height: 40px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff, var(--gc) 35%, #000 100%); box-shadow: 0 0 14px var(--gc); }
.ik-lg.miss .orb { background: #1a1520; box-shadow: none; border: 1px dashed var(--line2); }
.ik-lg.miss { opacity: .6; }
.ik-lg.on { border-color: var(--gold); }
.ik-lg .lv { font-family: var(--serif); font-size: 18px; font-weight: 900; color: #fff; text-align: right; }
.ik-mats { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 4px 10px; margin-top: 8px; font-size: 12px; }
.ik-mats .m { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; }
.ik-mats .m b { margin-left: auto; color: #fff; }
.ik-mats .dot { width: 9px; height: 9px; border-radius: 2px; transform: rotate(45deg); flex: none; }
.ik-presets { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 6px 0; }
.ik-presets .btn { padding: 6px 2px; font-size: 11.5px; line-height: 1.25; }
.ik-presets .btn.on { border-color: var(--gold); color: var(--gold2); background: linear-gradient(#4a3a1a, #2a2010); }
.ik-presets .btn small { display: block; font-size: 10px; color: var(--dim); }
.ik-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.ik-multi { background: #1a2a1f; border: 1px solid #3a6a4a; border-radius: 8px; padding: 6px 8px; margin: 6px 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.ik-sub { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; color: var(--dim); font-size: 12px; margin: 4px 0; }
.ik-sub > :last-child { flex: none; white-space: nowrap; }
.ik-sub b { color: #fff; }
.ik-result { border: 1px solid var(--gold); border-radius: 8px; padding: 6px; margin: 8px 0; background: #1a1610; }
.ik-result .t { font-size: 12px; color: var(--gold2); margin: 0 0 4px 4px; }
`;
export function ensureCss() { injectCss('items', CSS); }

// ======================================================================
// 選んでいる装備（窓ごと）
// ======================================================================
const selected = {};
export function selectItem(key, uid) { selected[key] = uid; }
export function selectedItem(game, key) {
  const uid = selected[key];
  if (!uid) return null;
  const f = game.sys.inv.findItem(uid);
  if (!f) { selected[key] = null; return null; }
  return f;
}

const pickerView = {};
/**
 * 装備を選ぶ欄。opts: { key, filter(item) → true で出す, onPick(item), selected uid, title, sources }
 */
export function itemPicker(ui, opts) {
  const g = ui.game;
  const key = opts.key;
  const st = g.state;
  const sources = opts.sources || ['equip', 'bag', 'stash'];
  const view = pickerView[key] && sources.includes(pickerView[key]) ? pickerView[key] : sources[0];
  const lists = {
    equip: SLOTS.map((s) => st.hero.equip[s]).filter(Boolean),
    bag: st.inv.bag,
    stash: st.inv.stash.flat(),
  };
  const names = { equip: '装備中', bag: 'バッグ', stash: '倉庫' };
  const wrap = h('section.sec', [h('h3.sec-title', [opts.title || '装備を選ぶ', h('span.sec-right', opts.hint || '')])]);
  wrap.append(h('div.tabs.small', sources.map((s) => {
    const n = lists[s].filter((x) => !opts.filter || opts.filter(x)).length;
    return h(`button.tab${view === s ? '.on' : ''}`, { onclick: () => { pickerView[key] = s; ui.renderPanel(); } }, `${names[s]}（${n}）`);
  })));
  const items = lists[view].filter((x) => !opts.filter || opts.filter(x));
  const grid = h('div.grid');
  for (const it of items) grid.append(itemCell(ui, it, { equipped: view === 'equip', selected: it.uid === opts.selected, onClick: () => { opts.onPick(it); ui.renderPanel(); } }));
  if (!items.length) wrap.append(h('div.hint', opts.emptyText || 'ここには選べる装備がありません。'));
  else { for (let i = items.length; i < Math.max(10, Math.ceil(items.length / 8) * 8); i++) grid.append(emptyCell()); wrap.append(grid); }
  return wrap;
}

// ======================================================================
// 費用・確率
// ======================================================================
export function matChip(game, id, need) {
  const have = id === 'gold' ? game.state.meta.gold : (game.state.inv.mats[id] || 0);
  const name = id === 'gold' ? 'ゴールド' : (MATERIAL[id]?.name || id);
  const color = id === 'gold' ? '#d9b45a' : (MATERIAL[id]?.color || '#888');
  const okk = have >= need;
  return h(`span.ik-chip.${okk ? 'ok' : 'short'}`, { title: id === 'gold' ? '' : `${MATERIAL[id]?.desc || ''}\n入手: ${MATERIAL[id]?.src || ''}` }, [h('span.dot', { style: { background: color } }), `${name} `, h('b', fmt(need)), h('span.dim', ` / ${fmt(have)}`)]);
}
/** cost = { gold, mats: { id: n } } */
export function costRow(game, cost) {
  if (!cost) return null;
  const chips = [];
  if (cost.gold) chips.push(matChip(game, 'gold', cost.gold));
  for (const [id, n] of Object.entries(cost.mats || {})) chips.push(matChip(game, id, n));
  return h('div.ik-cost', chips);
}

export function meter(label, cur, max, color, opts = {}) {
  const pct = Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100));
  return h(`div.ik-meter${opts.hot || pct >= (opts.soft ?? 101) ? '.hot' : ''}`, { title: opts.title || '' }, [
    h('div.lbl', [h('span', label), h('span', opts.right || `${fmt(Math.floor(cur))} / ${fmt(max)}`)]),
    h('div.track', [h('div.fill', { style: { width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` } }), opts.soft !== undefined ? h('div.soft', { style: { left: `${opts.soft}%` } }) : null]),
  ]);
}

/** 幸運ゲージ 2 本 */
export function luckMeters(game) {
  const lv = game.sys.merchant.luck();
  const leg = lv.leg; const myth = lv.myth;
  return h('div.ik-op', [
    h('h4', '幸運ゲージ（見える天井）'),
    meter(`${leg.name}`, leg.cur, leg.max, RARITY.legendary.color, { soft: leg.soft, right: `${fmt(leg.cur)} / ${fmt(leg.max)} 回`, title: `ドロップを ${fmt(leg.max)} 回振るあいだにレジェンダリー以上が出なければ、必ず出ます。${Math.round(leg.soft)}% を超えると少しずつ出やすくなります。` }),
    meter(`${myth.name}`, myth.cur, myth.max, RARITY.mythic.color, { soft: myth.soft, right: `${fmt(myth.cur)} / ${fmt(myth.max)} 回`, title: `ドロップを ${fmt(myth.max)} 回振るあいだにミシックが出なければ、必ず出ます。` }),
    h('div.hint', `満ちると必ずドロップ（オフラインでも進む）。これまでに天井で出た数: レジェンダリー以上 ${leg.forced}・ミシック ${myth.forced}`),
  ]);
}

// ======================================================================
// ツールチップの追加
// ======================================================================
/** 固定のオプションの幅（品質・強化のボーナス込みの、出ている数と同じ物差し） */
function rangeText(item, m, g) {
  const a = shownValue(item, fixedValue(m, 0, item.ilvl, g)); const b = shownValue(item, fixedValue(m, 1, item.ilvl, g));
  return a === b ? '' : `〔${fmt(a)}〜${fmt(b)}〕`;
}
tooltipHooks.afterAffixes.push((game, item) => {
  const out = [];
  const def = specialDef(item);
  if (item.fixed?.length) {
    out.push(h('div.ic-affixes.ik-fixed', item.fixed.map((f) => {
      const m = def?.mods?.[f.i];
      const el = modLine({ s: f.s, v: shownValue(item, f.v) }, { star: f.g, cls: f.g ? 'greater' : null });
      if (m) el.append(h('span.ik-range', rangeText(item, m, !!f.g)));
      if (f.over) el.append(h('span.ik-range', '堕×1.3'));
      return el;
    })));
  }
  if (item.rw && RUNEWORD[item.rw]) out.push(h('div.ic-affixes.ik-fixed', runewordMods(item).map((m) => modLine(m))));
  if (item.cimp) out.push(h('div.ic-affixes.ik-cimp', [modLine(item.cimp, {}), h('div.small.dim', '（堕落で付いた内在）')]));
  if (item.enh) {
    const b = enhBonusPct(item.enh);
    out.push(h('div.small', { style: { color: '#ffd27a', marginTop: '4px' } }, `強化 +${item.enh}: 基本性能 ×${(1 + 0.05 * item.enh + 0.0025 * item.enh * item.enh).toFixed(2)}・オプションの数値 +${b}%（上の数に込み）`));
  }
  return out;
});

tooltipHooks.extraLines.push((game, item) => {
  const out = [];
  const st = game.state;
  const def = specialDef(item);
  // 言い伝え
  const flavor = UNIQUE[item.uniqueId]?.flavor || MYTHIC[item.uniqueId]?.flavor || (item.rw && RUNEWORD[item.rw]?.flavor) || (item.setId && SET[item.setId]?.desc);
  // セット
  if (item.setId && SET[item.setId]) {
    const s = SET[item.setId];
    const counts = setCounts(st);
    const have = counts[s.id] || 0;
    const eqIds = new Set(SLOTS.map((k) => st.hero.equip[k]).filter((x) => x?.setId === s.id).map((x) => x.uniqueId));
    const box = h('div.ik-setbox', [h('div.sn', `${s.name}（${have}/${s.pieces.length}）${s.cls ? ` ${clsName(s.cls)}専用` : ''}`)]);
    box.append(h('div', s.pieces.map((p) => h(`span.pc${eqIds.has(p.id) ? '.have' : ''}`, `${eqIds.has(p.id) ? '●' : '○'}${p.name}`))));
    for (const k of Object.keys(s.bonus).map(Number).sort((a, b) => a - b)) {
      const b = s.bonus[k];
      const parts = (b.mods || []).map((m) => describeMod(m, (v) => fmt(v)));
      if (b.power) { const p = registry.power(b.power.id); if (p) parts.push(p.desc(b.power.v)); }
      box.append(h(`div.bn${have >= k ? '.on' : ''}`, `（${k}）${parts.join('、')}`));
    }
    out.push(box);
  }
  // ルーン語
  if (item.rw && RUNEWORD[item.rw]) {
    const rw = RUNEWORD[item.rw];
    out.push(h('div.ik-rw', [h('b', `ルーン語「${rw.name}」`), `　${rw.runes.map((r) => RUNE[r]?.name).join('・')}`]));
  }
  if (flavor) out.push(h('div.ik-flavor', `「${flavor}」`));
  // 状態
  const tags = [];
  if (item.fp !== undefined) tags.push(h('span', `鍛造値 ${item.fp}`));
  if (item.enhPity) tags.push(h('span', `強化の天井 ${item.enhPity}`));
  if (item.rr) tags.push(h('span.lk', `付け替え: ${item.rr.i + 1} 行目だけ（${item.rr.n} 回）`));
  if (item.rrPending) tags.push(h('span.lk', '付け替えの候補あり（鍛冶で選ぶ）'));
  if (item.corrupted) tags.push(h('span.cor', '堕落（もう変えられない）'));
  if (item.luck) tags.push(h('span', { style: { color: '#ff9a2e' } }, '幸運ゲージの天井で出た'));
  if (def?.cls) tags.push(h('span', { style: { color: '#ffd27a' } }, `${clsName(def.cls)}向け`));
  if (tags.length) out.push(h('div.ik-state', tags));
  return out;
});

tooltipHooks.sockets = (game, item) => {
  const kind = socketKind(item.slot);
  const kindName = { weapon: '武器', armor: '防具', jewelry: '装飾品' }[kind];
  const rows = item.sockets.map((key) => {
    const s = parseSocket(key);
    if (!s) return h('div.sk.empty', `◇ 空きソケット（${kindName}の効果）`);
    if (s.type === 'gem') { const m = gemMod(s.id, s.tier, kind); return h('div.sk', [h('span.gm', { style: { color: s.def.color } }, `◆ ${gemName(s.id, s.tier)}`), m ? describeMod(m, (v) => fmt(v)) : '']); }
    if (s.type === 'rune') { const m = runeMod(s.id, kind); return h('div.sk', [h('span.gm', { style: { color: s.def.color } }, `◆ ${runeName(s.id)}`), m ? describeMod(m, (v) => fmt(v)) : '']); }
    const lv = item.lgl?.[s.id] || game.sys.gems?.lgemLevel(s.id) || 1;
    const p = registry.power(s.def.power);
    return h('div.sk', [h('span.gm', { style: { color: s.def.color } }, `◆ ${s.def.name} Lv${lv}`), p ? p.desc(lv) : '']);
  });
  const prog = game.sys.gems?.runewordProgress(item) || [];
  if (prog.length && !item.rw) rows.push(h('div.sk.dim', `ルーン語の途中: ${prog.map((w) => `「${w.name}」（${w.runes.map((r) => RUNE[r].name).join('・')}）`).join(' / ')}`));
  return h('div.ik-sockets', rows);
};

const CLS = { warrior: '剣闘士', ranger: '狩人', sorcerer: '魔導士', necromancer: '死霊術師', assassin: '影刃' };
export const clsName = (id) => CLS[id] || id;

// ======================================================================
// アイテムの操作の近道
// ======================================================================
/** 倉庫の空いているタブへ（prefer を先に）。入れたタブの番号か -1 */
export function stashAny(game, uid, prefer = 0) {
  const st = game.state.inv.stash;
  const order = [prefer, ...st.map((_, i) => i).filter((i) => i !== prefer)];
  for (const t of order) if (st[t] && game.sys.inv.toStash(uid, t)) return t;
  return -1;
}

itemMenuHooks.push((ui, item, equipped) => {
  const btns = [];
  const g = ui.game;
  // 倉庫との出し入れ（スマホでは長押しのメニューが出ないことがあるので、ここにも置く）
  const where = equipped ? 'equip' : g.sys.inv.findItem(item.uid)?.where;
  if (where === 'bag') btns.push({ label: '倉庫へ', onclick: () => { const t = stashAny(g, item.uid); ui.toast(t >= 0 ? `倉庫 ${t + 1} へ入れた` : '倉庫がいっぱい', t >= 0 ? 'good' : 'bad'); ui.afterAction?.(); } });
  if (where === 'stash') btns.push({ label: 'バッグへ', onclick: () => { const okk = g.sys.inv.fromStash(item.uid); ui.toast(okk ? 'バッグへ戻した' : 'バッグがいっぱい', okk ? 'good' : 'bad'); ui.afterAction?.(); } });
  btns.push({ label: '鍛冶へ', onclick: () => { selectItem('craft', item.uid); ui.openPanel('craft'); } });
  if (item.sockets?.length) btns.push({ label: 'ソケット', onclick: () => { selectItem('gems', item.uid); setGemsTab('socket'); ui.openPanel('gems'); } });
  const info = g.sys.codex.extractInfo(item);
  if (info.ok) {
    btns.push({
      label: `抽出（極意へ${info.better ? '・更新' : ''}）`,
      onclick: () => {
        if (info.missing.length) { ui.toast(`${info.missing.join('・')}が足りない（残響 ${info.cost.echo}・${fmt(info.cost.gold)} G）`, 'bad'); return; }
        ui.confirm(`「${info.def.name}」を極意に登録します。この装備は消えます（伝説の残響 ${info.cost.echo}・${fmt(info.cost.gold)} G）。`, '抽出する').then((okk) => {
          if (!okk) return;
          const r = g.sys.codex.extract(item.uid);
          ui.toast(r.ok ? `極意に登録: ${info.def.name}${r.improved ? '（強さが上がった）' : ''}` : r.msg, r.ok ? 'good' : 'bad');
          ui.renderPanel();
        });
      },
    });
  }
  return btns;
});

let gemsTabSetter = null;
export function onGemsTab(fn) { gemsTabSetter = fn; }
function setGemsTab(t) { gemsTabSetter?.(t); }

// ======================================================================
// ユニークの絵（gear.u.<id>）。差し替えが無ければ、ベースの絵に色の光を重ねて描く
// ======================================================================
// 枠（gear.u.<id>）は render/manifest.js がユニーク・ミシック・セットの武器・副手・兜すべてに作る（種類・向き・予備の絵つき）。
// ここで足し直すと manifest の枠を情報の少ない物で上書きしてしまうので、足さない。
const ART_SLOTS = new Set(['weapon', 'offhand', 'helm']);

function defOf(id) { return UNIQUE[id] || MYTHIC[id] || SET_PIECE[id]?.piece || null; }
let painterReady = false;
function ensurePainter() {
  if (painterReady) return;
  painterReady = true;
  if (assets.painters.some((p) => p.prefix === 'gear.u')) return; // アート担当が描くならそちら
  assets.addPainter('gear.u', (ctx, spec, w, hh) => {
    const id = spec.params?.unique || spec.id.split('.')[2];
    const d = defOf(id);
    const [k0, style] = (d?.base || 'sword').split('.');
    const kind = k0 === 'any' ? (d.slot === 'offhand' ? 'orb' : 'sword') : k0;
    const baseId = kind === 'helm' ? `gear.helm.${style || 'plate'}` : `gear.${kind}`;
    const pt = assets.painterFor(baseId);
    const col = MYTHIC[id] ? RARITY.mythic.color : SET_PIECE[id] ? RARITY.set.color : RARITY.unique.color;
    if (pt && pt.prefix !== 'gear.u') pt.fn(ctx, { ...(assets.spec(baseId) || {}), id: baseId, params: { kind, style } }, w, hh);
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fillRect(0, 0, w, hh);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    const gr = ctx.createRadialGradient(w / 2, hh / 2, 2, w / 2, hh / 2, Math.max(w, hh) / 2);
    gr.addColorStop(0, `${col}66`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, hh);
    ctx.restore();
  });
}
registry.provide('itemArt', (item) => {
  if (!item?.uniqueId || !ART_SLOTS.has(item.slot)) return null;
  const d = defOf(item.uniqueId);
  if (!d) return null;
  const id = `gear.u.${item.uniqueId}`;
  if (d.base === 'any' && !assets.isCustom(id)) return null; // クラスで種類が変わる物はベースの絵
  ensurePainter();
  return id;
});

// ======================================================================
// 出来事の知らせ（ルーン語・深淵の宝石・天井）
// ======================================================================
hudHooks.build.push((hud) => {
  ensureCss();
  const ui = hud.ui;
  const g = hud.game;
  if (g._itemsUiBound === ui) return null;
  g._itemsUiBound = ui;
  // UI を作り直したら（タイトルに戻って始め直す）外す。外さないと前の画面が丸ごとメモリに残る
  const on = (t, fn) => { const off = g.events.on(t, fn); if (ui.offs) ui.offs.push(off); };
  on('runeword', (e) => ui.toast(`ルーン語「${e.rw.name}」ができた！`, 'r-unique'));
  on('lgemFound', (e) => ui.toast(`深淵の宝石「${e.gem.name}」を手に入れた！`, 'r-mythic'));
  on('lgemUpgrade', (e) => { if (e.gem && e.to > e.from) ui.toast(`深淵の宝石が育った: Lv ${e.from} → ${e.to}`, 'good'); });
  on('loot', (e) => { if (e.item?.luck) ui.toastOnce?.(`luck-${e.item.rarity}`, `幸運ゲージが満ちた！ 必ずドロップ`, `r-${e.item.rarity}`); });
  return null;
});

export { h, button, fmt, itemName, RARITY, MATERIAL, SLOT_NAMES };
