// アイテムの説明（ツールチップ）と、今の装備との比べ。
// itemCard(game, item, { compare: true }) で DOM を返す。tooltip.show(el, anchorRect) で表示。

import { h } from './dom.js';
import { fmt, fmtPct } from '../engine/format.js';
import { describeMod, statDef } from '../data/stats.js';
import { RARITY, QUALITY } from '../data/rarity.js';
import { SLOT_NAMES, AFFIX, BASE, KIND_NAMES, STYLE_NAMES } from '../data/items.js';
import { itemName, itemReq, weaponStats, itemArmor, implicitMods, sellValue, baseOf, enhMult } from '../game/items.js';
import { registry } from '../game/registry.js';
import { assets } from '../render/assets.js';
import { spriteImg } from './dom.js';
import { itemIconId } from '../render/manifest.js';

export const tooltipHooks = {
  extraLines: [], // (game, item) => [DOM...] … ユニークの説明・セット効果・ソケットなど（アイテム担当）
  afterAffixes: [], // (game, item) => [DOM...] … オプションのすぐ下（ユニークの固定オプションなど）
  sockets: null, // (game, item) => DOM … ソケットの行を描き直す（無ければ ◆◇ だけ）
};

function tierLabel(a) {
  const af = AFFIX[a.id];
  if (!af) return '';
  return `T${af.tiers.length - a.t}`;
}

export function modLine(m, opts = {}) {
  return h(`div.mod${opts.cls ? `.${opts.cls}` : ''}`, [opts.star ? h('span.star', '★') : null, describeMod(m, (v) => fmt(v)), opts.tier ? h('span.tier', opts.tier) : null]);
}

export function itemCard(game, item, opts = {}) {
  const r = RARITY[item.rarity] || RARITY.common;
  const b = baseOf(item);
  const q = QUALITY[item.q || 0];
  const card = h(`div.itemcard.r-${item.rarity}`, { style: { '--rc': r.color } });
  const icon = spriteImg(assets, itemIconId(item), 56);
  card.append(h('div.ic-head', [
    h('div.ic-icon', icon),
    h('div.ic-title', [
      h('div.ic-name', { style: { color: r.color } }, `${item.enh ? `+${item.enh} ` : ''}${itemName(item)}`),
      h('div.ic-type', [q?.badge ? h('span.badge', { style: { background: q.color } }, q.badge) : null, `${r.name}　${b ? (b.style ? `${STYLE_NAMES[b.style]}の` : '') + (KIND_NAMES[b.kind] || SLOT_NAMES[item.slot]) : ''}`]),
    ]),
  ]));
  const body = h('div.ic-body');
  const w = weaponStats(item);
  if (w) {
    body.append(h('div.ic-main', [h('b', `${fmt(w.min)} 〜 ${fmt(w.max)}`), ' ダメージ']));
    body.append(h('div.ic-sub', `攻撃速度 ${w.aps.toFixed(2)}${w.twoHanded ? '　両手' : ''}　1 秒あたり ${fmt((w.min + w.max) / 2 * w.aps)}`));
  }
  const arm = itemArmor(item);
  if (arm) body.append(h('div.ic-main', [h('b', fmt(arm)), ' アーマー']));
  const imp = implicitMods(item);
  if (imp.length) body.append(h('div.ic-implicit', imp.map((m) => modLine(m))));
  if (item.affixes?.length) {
    body.append(h('div.ic-affixes', item.affixes.map((a) => modLine({ s: a.s, v: a.v * (q?.mult || 1) }, { star: a.g, tier: opts.tiers !== false ? tierLabel(a) : null, cls: a.g ? 'greater' : null }))));
  }
  for (const f of tooltipHooks.afterAffixes) { try { const els = f(game, item); if (els) body.append(...[].concat(els)); } catch (e) { console.error(e); } }
  // 伝説の力
  if (item.power) {
    const p = registry.power(item.power.id);
    if (p) body.append(h('div.ic-power', [h('div.pw-name', `◆ ${p.name}`), h('div.pw-desc', typeof p.desc === 'function' ? p.desc(registry.powerValue(p.id, item.power.r)) : p.desc)]));
  }
  for (const f of tooltipHooks.extraLines) { try { const els = f(game, item); if (els) body.append(...[].concat(els)); } catch (e) { console.error(e); } }
  if (item.sockets?.length) {
    let el = null;
    if (tooltipHooks.sockets) { try { el = tooltipHooks.sockets(game, item); } catch (e) { console.error(e); } }
    body.append(el || h('div.ic-sockets', item.sockets.map((s) => h(`span.socket${s ? '.filled' : ''}`, s ? '◆' : '◇'))));
  }
  card.append(body);
  // 下の欄
  const req = itemReq(item);
  const lvl = game.state.hero.level;
  const foot = h('div.ic-foot', [
    h('span', { class: req > lvl ? 'bad' : '' }, `必要 Lv ${req}`),
    h('span', `アイテム Lv ${item.ilvl}`),
    h('span.gold', `${fmt(sellValue(item))} G`),
  ]);
  card.append(foot);
  if (item.locked) card.append(h('div.ic-lock', '🔒 鍵つき（分解・売却しない）'));
  // 比べ
  if (opts.compare && game.sys.inv) {
    const slot = item.slot === 'ring' ? null : item.slot;
    const cur = item.slot === 'ring' ? null : game.state.hero.equip[slot];
    const prob = game.sys.inv.equipProblem(item, item.slot === 'ring' ? 'ring1' : item.slot);
    if (!opts.equipped) {
      try {
        const c = game.sys.inv.compare(item);
        card.append(h('div.ic-compare', [
          h('div.cmp-title', cur ? '今の装備と比べると' : '装備すると'),
          h('div.cmp-row', [deltaSpan('火力', c.dpsPct), deltaSpan('耐久', c.ehpPct)]),
          prob ? h('div.bad', `※ ${prob}`) : null,
        ]));
      } catch (e) { console.error(e); }
    }
  }
  return card;
}

function deltaSpan(label, pct) {
  const cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'same';
  const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '＝';
  return h(`span.delta.${cls}`, `${label} ${arrow}${fmtPct(Math.abs(pct))}`);
}

// ---------------- 表示（マウスで追従・スマホは下に固定）
class Tooltip {
  constructor() { this.el = null; this.pinned = false; }
  ensure() {
    if (!this.el) {
      this.el = h('div#tooltip');
      document.body.appendChild(this.el);
      this.el.addEventListener('click', () => this.hide());
    }
    return this.el;
  }
  show(content, rect) {
    const el = this.ensure();
    el.innerHTML = '';
    el.append(content);
    el.style.display = 'block';
    const vw = window.innerWidth; const vh = window.innerHeight;
    const tw = el.offsetWidth; const th = el.offsetHeight;
    let x = rect.right + 10; let y = rect.top;
    if (x + tw > vw - 8) x = rect.left - tw - 10;
    if (x < 8) x = Math.max(8, (vw - tw) / 2);
    if (y + th > vh - 8) y = vh - th - 8;
    if (y < 8) y = 8;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  }
  hide() { if (this.el) this.el.style.display = 'none'; }
}
export const tooltip = new Tooltip();

/** el にマウスを乗せたら make() の中身を出す */
export function attachTip(el, make) {
  el.addEventListener('mouseenter', () => { const c = make(); if (c) tooltip.show(c, el.getBoundingClientRect()); });
  el.addEventListener('mouseleave', () => tooltip.hide());
  return el;
}

export { statDef, BASE };
