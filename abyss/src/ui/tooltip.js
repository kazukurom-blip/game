// アイテムの説明（ツールチップ）と、今の装備との比べ。
// itemCard(game, item, { compare: true }) で DOM を返す。tooltip.show(el, anchorRect) で表示。

import { h } from './dom.js';
import { fmt, fmtPct } from '../engine/format.js';
import { describeMod, statDef } from '../data/stats.js';
import { RARITY, QUALITY } from '../data/rarity.js';
import { SLOT_NAMES, AFFIX, BASE, KIND_NAMES, STYLE_NAMES } from '../data/items.js';
import { itemName, itemReq, weaponStats, itemArmor, implicitMods, sellValue, baseOf, enhMult, offhandDamage } from '../game/items.js';
import { shownValue } from '../game/content/items/itemlib.js';
import { registry } from '../game/registry.js';
import { assets } from '../render/assets.js';
import { spriteImg } from './dom.js';
import { itemIconId } from '../render/manifest.js';

// レアリティの文字・●の数（common.js と同じ。common.js が tooltip.js を読むので、ここに置いて循環を避ける）
export const RARITY_MARK = { common: '並', magic: '魔', rare: '稀', epic: '秀', legendary: '伝', set: '組', unique: '唯', mythic: '神' };
export const RARITY_DOTS = { common: 1, magic: 2, rare: 3, epic: 4, legendary: 5, set: 5, unique: 5, mythic: 6 };

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
      h('div.ic-type', [q?.badge ? h('span.badge', { style: { background: q.color } }, q.badge) : null, h('span.ic-rar', { style: { color: r.color } }, [h('span.rmark', { style: { '--rc': r.color }, 'aria-hidden': 'true' }, RARITY_MARK[item.rarity] || ''), ` ${r.name} `, h('span.ic-dots', { title: `希少さ ${RARITY_DOTS[item.rarity] || 1} / 6` }, '●'.repeat(RARITY_DOTS[item.rarity] || 1))]), `　${b ? (b.style ? `${STYLE_NAMES[b.style]}の` : '') + (KIND_NAMES[b.kind] || SLOT_NAMES[item.slot]) : ''}`]),
    ]),
  ]));
  const body = h('div.ic-body');
  const w = weaponStats(item);
  if (w) {
    body.append(h('div.ic-main', [h('b', `${fmt(w.min)} 〜 ${fmt(w.max)}`), ' ダメージ']));
    body.append(h('div.ic-sub', `攻撃速度 ${w.aps.toFixed(2)}${w.twoHanded ? '　両手' : ''}　1 秒あたり ${fmt((w.min + w.max) / 2 * w.aps)}`));
  }
  // 副刀（二刀流）: 平均の半分が武器のダメージに加わる（character.js）
  const od = offhandDamage(item);
  if (od) {
    body.append(h('div.ic-main', [h('b', fmt(od)), ' 副手のダメージ（平均）']));
    body.append(h('div.ic-sub', `二刀流: 武器のダメージ +${fmt(od / 2)}・攻撃速度 ×1.1`));
  }
  const arm = itemArmor(item);
  if (arm) body.append(h('div.ic-main', [h('b', fmt(arm)), ' アーマー']));
  const imp = implicitMods(item);
  if (imp.length) body.append(h('div.ic-implicit', imp.map((m) => modLine(m))));
  if (item.affixes?.length) {
    // 数は品質の倍率・強化のボーナス込み（実際に効く数）
    body.append(h('div.ic-affixes', item.affixes.map((a) => modLine({ s: a.s, v: shownValue(item, a.v) }, { star: a.g, tier: opts.tiers !== false ? tierLabel(a) : null, cls: a.g ? 'greater' : null }))));
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
    const prob = game.sys.inv.equipProblem(item, item.slot === 'ring' ? 'ring1' : item.slot);
    if (!opts.equipped) {
      try {
        // 指輪は着けるときと同じく、入れ替えて強くなる方（弱い方）の指輪と比べる
        const c = game.sys.inv.compare(item);
        const cur = game.state.hero.equip[c.slot];
        const title = !cur ? '装備すると' : item.slot === 'ring' ? `今の${SLOT_NAMES[c.slot]} と比べると` : '今の装備と比べると';
        card.append(h('div.ic-compare', [
          h('div.cmp-title', title),
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
  /** anchor: 説明の元の要素。窓が描き直されて元の要素が消えたら、check() で隠す（mouseleave が来ないので） */
  show(content, rect, anchor = null) {
    const el = this.ensure();
    this.anchor = anchor;
    el.innerHTML = '';
    el.append(content);
    el.style.display = 'block';
    el.style.transform = '';
    const vw = window.innerWidth; const vh = window.innerHeight;
    let tw = el.offsetWidth; let th = el.offsetHeight;
    // 画面より背の高い説明（横向きのスマホ・低い窓）は、縮めて全部見せる（スクロールできない物なので）
    const k = th > vh - 16 ? Math.max(0.5, (vh - 16) / th) : 1;
    if (k < 1) { el.style.transformOrigin = '0 0'; el.style.transform = `scale(${k})`; tw *= k; th *= k; }
    let x = rect.right + 10; let y = rect.top;
    if (x + tw > vw - 8) x = rect.left - tw - 10;
    if (x < 8) x = Math.max(8, (vw - tw) / 2);
    if (y + th > vh - 8) y = vh - th - 8;
    if (y < 8) y = 8;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  }
  hide() { this.anchor = null; if (this.el) this.el.style.display = 'none'; }
  /** 毎フレーム（ui.update）: 元の要素が画面から消えていたら隠す */
  check() { if (this.anchor && !this.anchor.isConnected) this.hide(); }
}
export const tooltip = new Tooltip();

// 最後に使われた指し方（mouse / touch / pen）。指で触ったときに出る互換の mouseenter では説明を出さない
// （スマホで説明が出たまま残る・iPhone で 1 回目の指が「乗せる」扱いになって押せないのを防ぐ。スマホは押すと窓が開く）
let lastPointer = 'mouse';
if (typeof window !== 'undefined' && window.addEventListener) {
  const note = (e) => { if (e.pointerType) lastPointer = e.pointerType; };
  window.addEventListener('pointerover', note, true);
  window.addEventListener('pointerdown', note, true);
}

/** el にマウスを乗せたら make() の中身を出す */
export function attachTip(el, make) {
  const show = () => { const c = make(); if (c) tooltip.show(c, el.getBoundingClientRect(), el); };
  el.addEventListener('mouseenter', () => { if (lastPointer !== 'touch') show(); });
  el.addEventListener('mouseleave', () => tooltip.hide());
  // キーボードで移ってきたときも出す（マウスのクリックで付いたフォーカスでは出さない）
  el.addEventListener('focus', () => { if (el.matches(':focus-visible')) show(); });
  el.addEventListener('blur', () => tooltip.hide());
  return el;
}

export { statDef, BASE };
