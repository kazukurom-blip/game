// 窓のタブの並び: 5 つのまとまり（上の段）＋その中の窓（下の段）。スマホでは、まとまりは画面の下のタブの帯、
// 窓は横に流せる列になる。印（数・NEW）は窓 → まとまりへ上がる。
// 窓が見えるかは panel.visible(game) と「機能を少しずつ開く」（unlocks.js）の両方で決まる。

import { h, clear } from './dom.js';
import { PANELS } from './panels/index.js';
import { isOpen, isNew } from './unlocks.js';

export const NAV_GROUPS = [
  { id: 'chara', name: 'キャラ', icon: '🛡', panels: ['hero', 'bag', 'skills', 'tree'] },
  { id: 'forge', name: '鍛える', icon: '⚒', panels: ['craft', 'gems', 'codex', 'merchant'] },
  { id: 'adv', name: '冒険', icon: '🗺', panels: ['map', 'rift', 'prestige'] },
  { id: 'collect', name: '集める', icon: '🏆', panels: ['pets', 'bounties', 'achievements', 'bestiary', 'stats'] },
  { id: 'other', name: 'その他', icon: '⚙', panels: ['assets', 'settings'] },
];

/** 窓 id → まとまり（一覧に無い窓は「その他」へ） */
export function groupOf(id) {
  return NAV_GROUPS.find((g) => g.panels.includes(id)) || NAV_GROUPS[NAV_GROUPS.length - 1];
}

/** まとまりの中の窓（PANELS の順ではなく NAV_GROUPS の順。一覧に無い窓は「その他」の前に足す） */
export function panelsOf(gid) {
  const g = NAV_GROUPS.find((x) => x.id === gid);
  if (!g) return [];
  const list = g.panels.map((id) => PANELS.find((p) => p.id === id)).filter(Boolean);
  if (gid === 'other') {
    const known = new Set(NAV_GROUPS.flatMap((x) => x.panels));
    list.unshift(...PANELS.filter((p) => !known.has(p.id) && !p.hidden));
  }
  return list.filter((p) => !p.hidden);
}

export function panelVisible(game, p) {
  let vis = true;
  try { vis = p.visible ? !!p.visible(game) : true; } catch (e) { console.error(e); }
  return vis && isOpen(game, p.id);
}

function badgeOf(game, p) {
  if (!p.badge) return 0;
  try { return Number(p.badge(game)) || 0; } catch (e) { console.error(e); return 0; }
}

const badgeText = (n) => (n > 99 ? '99+' : String(n));

export class Nav {
  constructor(ui, root) {
    this.ui = ui;
    this.root = root;
    this.group = 'chara';
    this.build();
  }

  build() {
    const r = this.root;
    clear(r);
    this.grpRow = h('div.nav-groups', { role: 'tablist', 'aria-label': '窓のまとまり' });
    this.subRow = h('div.nav-subs', { role: 'tablist', 'aria-label': '窓' });
    this.grpBtns = {};
    this.btns = {};
    for (const g of NAV_GROUPS) {
      const b = h('button.navgrp', { type: 'button', dataset: { g: g.id }, title: g.name, onclick: () => this.pickGroup(g.id) }, [
        h('span.ng-ic', { 'aria-hidden': 'true' }, g.icon), h('span.ng-tx', g.name), h('span.nav-badge'),
      ]);
      this.grpBtns[g.id] = b;
      this.grpRow.append(b);
      for (const p of panelsOf(g.id)) {
        const key = p.key ? ` [${p.key}]` : '';
        const pb = h('button.navbtn', { type: 'button', dataset: { id: p.id, grp: g.id }, title: `${p.name}${key}`, onclick: () => this.ui.openPanel(p.id) }, [
          h('span.nav-ic', { 'aria-hidden': 'true' }, p.icon || '◆'), h('span.nav-tx', p.name), h('span.nav-badge'),
        ]);
        this.btns[p.id] = pb;
        this.subRow.append(pb);
      }
    }
    r.append(this.grpRow, this.subRow);
  }

  /** まとまりを選ぶ: 前にそのまとまりで開いていた窓（無ければ最初の見える窓）を開く */
  pickGroup(gid) {
    const game = this.ui.game;
    const T = game.state?.meta?.tutorial;
    const last = T?.navLast?.[gid];
    const list = panelsOf(gid).filter((p) => panelVisible(game, p));
    const p = list.find((x) => x.id === last) || list[0];
    if (p) this.ui.openPanel(p.id);
    else { this.group = gid; this.refresh(); }
  }

  /** 窓を開いたときに呼ぶ（まとまりを合わせる） */
  onOpen(id) {
    this.group = groupOf(id).id;
    const T = this.ui.game.state?.meta?.tutorial;
    if (T) (T.navLast ||= {})[this.group] = id;
    this.refresh();
    const b = this.btns[id];
    if (b && b.scrollIntoView && this.subRow.scrollWidth > this.subRow.clientWidth) {
      const left = b.offsetLeft - this.subRow.clientWidth / 2 + b.offsetWidth / 2;
      this.subRow.scrollTo?.({ left: Math.max(0, left), behavior: 'auto' });
    }
  }

  refresh() {
    const game = this.ui.game;
    if (!game.state) return;
    const cur = this.ui.current?.id;
    for (const g of NAV_GROUPS) {
      let sum = 0; let fresh = false; let any = false;
      for (const p of panelsOf(g.id)) {
        const b = this.btns[p.id];
        if (!b) continue;
        const vis = panelVisible(game, p);
        any ||= vis;
        const show = vis && g.id === this.group;
        if (b.hidden !== !show) b.hidden = !show;
        b.classList.toggle('active', cur === p.id);
        b.setAttribute('aria-selected', cur === p.id ? 'true' : 'false');
        const n = vis ? badgeOf(game, p) : 0;
        const nw = vis && isNew(game, p.id);
        sum += n; fresh ||= nw;
        setBadge(b.lastChild, n, nw);
      }
      const gb = this.grpBtns[g.id];
      if (gb.hidden !== !any) gb.hidden = !any;
      gb.classList.toggle('active', g.id === this.group);
      gb.setAttribute('aria-selected', g.id === this.group ? 'true' : 'false');
      setBadge(gb.lastChild, sum, fresh);
    }
  }
}

function setBadge(el, n, fresh) {
  const text = n ? badgeText(n) : fresh ? 'NEW' : '';
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('new', !n && fresh);
  el.style.display = text ? '' : 'none';
}
