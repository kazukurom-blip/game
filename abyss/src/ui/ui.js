// 画面の組み立て（上の帯・戦闘の画面・HUD・右の窓・下のタブ）と、知らせ・確認の窓。
// 窓（パネル）は ui/panels/index.js に並べる。パネルの形:
//   { id, name, icon, group, render(ui, el), refresh?(ui, el), visible?(game), badge?(game) → 数 }
// パネルは「開いたとき」と「関係する出来事があったとき」に render し直される（refreshOn で指定）。

import { h, clear, button } from './dom.js';
import { PANELS } from './panels/index.js';
import { Hud } from './hud.js';
import { tooltip } from './tooltip.js';
import { fmt } from '../engine/format.js';
import { BAL } from '../data/balance.js';

export class UI {
  constructor(game, scene, root, opts = {}) {
    this.game = game;
    this.scene = scene;
    this.root = root;
    this.opts = opts;
    this.current = null;
    this.dirty = new Set();
    this.toasts = [];
    this.lastTop = 0;
    this.build();
    this.hud = new Hud(this);
    this.bind();
  }

  build() {
    const r = this.root;
    clear(r);
    this.top = h('header#topbar');
    this.battle = h('section#battle');
    this.battle.append(this.scene.canvas);
    this.hudEl = h('div#hud');
    this.battle.append(this.hudEl);
    this.panelNav = h('nav#panelnav');
    this.panelBody = h('div#panelbody');
    this.panel = h('aside#panel', [this.panelNav, this.panelBody]);
    this.toastRoot = h('div#toasts');
    this.modalRoot = h('div#modals');
    r.append(this.top, h('main#main', [this.battle, this.panel]), this.toastRoot, this.modalRoot);
    this.buildTop();
    this.buildNav();
    this.openPanel(this.opts.panel || 'hero');
  }

  buildTop() {
    const t = this.top;
    clear(t);
    this.topEls = {
      name: h('div.tb-name'),
      level: h('div.tb-level'),
      xpbar: h('div.tb-xp', h('div.tb-xpfill')),
      gold: h('div.tb-res.gold'),
      mats: h('div.tb-mats'),
      souls: h('div.tb-res.souls'),
    };
    const speedBtn = h('button.btn.btn-small#speed', { onclick: () => this.cycleSpeed() }, '×1');
    this.topEls.speed = speedBtn;
    t.append(
      h('div.tb-logo', [h('span.logo-a', 'ABYSS'), h('span.logo-b', 'DROP')]),
      h('div.tb-hero', [this.topEls.name, this.topEls.level, this.topEls.xpbar]),
      h('div.tb-wallet', [this.topEls.gold, this.topEls.souls, this.topEls.mats]),
      h('div.tb-actions', [speedBtn, button('保存', () => { this.opts.onSave?.(); this.toast('保存しました', 'good'); }, { kind: 'small' }), button('≡', () => this.openPanel('settings'), { kind: 'small', title: '設定' })]),
    );
  }

  buildNav() {
    const nav = this.panelNav;
    clear(nav);
    this.navBtns = {};
    for (const p of PANELS) {
      if (p.hidden) continue;
      const b = h('button.navbtn', { onclick: () => this.openPanel(p.id), title: p.name, dataset: { id: p.id } }, [h('span.nav-ic', p.icon || '◆'), h('span.nav-tx', p.name), h('span.nav-badge')]);
      this.navBtns[p.id] = b;
      nav.append(b);
    }
    this.refreshNav();
  }

  refreshNav() {
    for (const p of PANELS) {
      const b = this.navBtns[p.id];
      if (!b) continue;
      const vis = p.visible ? p.visible(this.game) : true;
      b.style.display = vis ? '' : 'none';
      b.classList.toggle('active', this.current?.id === p.id);
      const n = p.badge ? p.badge(this.game) : 0;
      const bd = b.querySelector('.nav-badge');
      bd.textContent = n ? (n > 99 ? '99+' : String(n)) : '';
      bd.style.display = n ? '' : 'none';
    }
  }

  openPanel(id) {
    const p = PANELS.find((x) => x.id === id) || PANELS[0];
    this.current = p;
    tooltip.hide();
    this.renderPanel();
    this.refreshNav();
    this.panelBody.scrollTop = 0;
    this.game.events.emit('panelOpen', { id: p.id });
  }

  renderPanel() {
    const p = this.current;
    if (!p) return;
    const keep = this.panelBody.scrollTop;
    clear(this.panelBody);
    const el = h(`div.panel.panel-${p.id}`);
    this.panelBody.append(h('h2.panel-title', [h('span', `${p.icon || ''} ${p.name}`), p.help ? h('button.help', { onclick: () => this.modal(p.name, h('div.helptext', { html: p.help })) }, '？') : null]), el);
    try { p.render(this, el); } catch (e) { console.error(`[panel:${p.id}]`, e); el.append(h('div.bad', `表示できませんでした: ${e.message}`)); }
    this.panelBody.scrollTop = keep;
  }

  /** 出来事でパネルを描き直す（まとめて 1 回） */
  markDirty(kind) {
    this.dirty.add(kind);
  }

  bind() {
    const ev = this.game.events;
    const map = { invChanged: 'inv', gearChanged: 'gear', skillsChanged: 'skills', levelUp: 'level', statsChanged: 'stats', paragonUp: 'level', zoneClear: 'world', stageStart: 'world', goldChanged: 'gold' };
    for (const [e, k] of Object.entries(map)) ev.on(e, () => this.markDirty(k));
    ev.on('levelUp', (e) => this.toast(`レベル ${e.level} になった！ スキルポイント・パッシブポイント +${e.count}`, 'level'));
    ev.on('zoneClear', (e) => { if (e.first && e.next) this.toast(`新しい地域「${e.next.name}」が解放された`, 'good'); });
    ev.on('bagFull', () => this.toastOnce('bagfull', 'バッグがいっぱい。分解するか倉庫へ', 'bad'));
    ev.on('loot', (e) => { if ((e.item && ['legendary', 'set', 'unique', 'mythic'].includes(e.item.rarity)) && e.where !== 'salvaged') this.lootToast(e.item); });
    ev.on('autoEquip', (e) => this.toast(`より良い装備に自動で着替えた`, 'good'));
    ev.on('bossFail', () => this.markDirty('world'));
    ev.on('offlineReport', (rep) => this.opts.onOfflineReport?.(rep));
    window.addEventListener('resize', () => this.scene.resize());
  }

  lootToast(item) {
    import('../game/items.js').then(({ itemName }) => {
      const r = { legendary: 'レジェンダリー', set: 'セット', unique: 'ユニーク', mythic: 'ミシック' }[item.rarity];
      this.toast(`${r}！「${itemName(item)}」`, `r-${item.rarity}`);
    });
  }

  toastOnce(key, text, kind) {
    const now = performance.now();
    this._once ||= {};
    if (this._once[key] && now - this._once[key] < 15000) return;
    this._once[key] = now;
    this.toast(text, kind);
  }

  toast(text, kind = '') {
    const el = h(`div.toast${kind ? `.${kind}` : ''}`, text);
    this.toastRoot.append(el);
    while (this.toastRoot.children.length > 5) this.toastRoot.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
  }

  /** 窓を出す。buttons: [{ label, kind, onclick → false を返すと閉じない }] */
  modal(title, content, buttons = [{ label: '閉じる' }], opts = {}) {
    const close = () => { wrap.remove(); opts.onClose?.(); };
    const box = h(`div.modal${opts.wide ? '.wide' : ''}`, [
      h('div.modal-head', [h('h3', title), h('button.modal-x', { onclick: close }, '×')]),
      h('div.modal-body', content),
      h('div.modal-foot', buttons.map((b) => button(b.label, () => { const r = b.onclick?.(); if (r !== false) close(); }, { kind: b.kind }))),
    ]);
    const wrap = h('div.modal-wrap', { onclick: (e) => { if (e.target === wrap && !opts.sticky) close(); } }, box);
    this.modalRoot.append(wrap);
    return { close, box };
  }

  confirm(text, okLabel = 'はい') {
    return new Promise((resolve) => {
      this.modal('確認', h('p', text), [{ label: okLabel, kind: 'primary', onclick: () => resolve(true) }, { label: 'やめる', onclick: () => resolve(false) }], { onClose: () => resolve(false) });
    });
  }

  cycleSpeed() {
    const s = this.game.state.settings;
    const max = 2 + (this.game.state.meta.unlocks.speed || 0);
    s.speed = (s.speed || 1) >= max ? 1 : (s.speed || 1) + 1;
    this.topEls.speed.textContent = `×${s.speed}`;
  }

  /** 毎フレーム（軽い物だけ） */
  update(dt) {
    this.hud.update(dt);
    this.lastTop += dt;
    if (this.lastTop > 0.25) { this.lastTop = 0; this.updateTop(); }
    if (this.dirty.size && this.current) {
      const want = this.current.refreshOn || ['inv', 'gear', 'skills', 'level', 'stats', 'world'];
      const hit = [...this.dirty].some((k) => want.includes(k));
      this.dirty.clear();
      if (hit && !this.panelBody.matches(':hover')) this.renderPanel();
      else if (hit) this.pendingRender = true;
      this.refreshNav();
    }
    if (this.pendingRender && !this.panelBody.matches(':hover')) { this.pendingRender = false; this.renderPanel(); }
  }

  updateTop() {
    const st = this.game.state;
    const hr = st.hero;
    const e = this.topEls;
    e.name.textContent = hr.name;
    const isPar = hr.level >= BAL.MAX_LEVEL;
    e.level.textContent = isPar ? `Lv ${hr.level}　パラゴン ${hr.paragon.level}` : `Lv ${hr.level}`;
    const need = isPar ? BAL.paragonXpToNext(hr.paragon.level) : BAL.xpToNext(hr.level);
    const cur = isPar ? hr.paragon.xp : hr.xp;
    e.xpbar.firstChild.style.width = `${Math.min(100, (cur / need) * 100)}%`;
    e.xpbar.title = `経験値 ${fmt(cur)} / ${fmt(need)}`;
    e.gold.textContent = `${fmt(st.meta.gold)} G`;
    e.souls.textContent = st.meta.souls || st.meta.rebirths ? `魂 ${fmt(st.meta.souls)}` : '';
    e.souls.style.display = e.souls.textContent ? '' : 'none';
    const m = st.inv.mats;
    e.mats.textContent = ['dust', 'crystal', 'echo'].map((k) => `${{ dust: '魔塵', crystal: '秘晶', echo: '残響' }[k]} ${fmt(m[k] || 0)}`).join('　');
    e.speed.textContent = `×${st.settings.speed || 1}`;
  }
}
