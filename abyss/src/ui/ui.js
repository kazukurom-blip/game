// 画面の組み立て（上の帯・戦闘の画面・HUD・下の欄・右の窓）と、知らせ・確認の窓。
//   パソコン: 上の帯 ／ 左に戦闘の画面（16:9）とその下の欄（次の目標・直近のドロップ・進み具合・戦闘の記録） ／ 右に窓
//   スマホ:   上の帯 ／ 戦闘の画面 ／ HUD の帯 ／ 次の目標の帯（押すと開く） ／ 窓（横に流せるタブ） ／ 下にまとまりのタブ
// 窓（パネル）は ui/panels/index.js に並べる。パネルの形:
//   { id, name, icon, render(ui, el), refreshOn?: [...], visible?(game), badge?(game) → 数, help? }
// まとまり（キャラ・鍛える・冒険・集める・その他）は ui/nav.js、少しずつ開く仕組みは ui/unlocks.js。
// パネルは「開いたとき」「関係する出来事があったとき」に描き直す。窓の上にマウスがある間の自動の描き直しは待つが、
// 窓の中で押した・変えた直後は、すぐに描き直す（afterAction）。

import { h, clear, button } from './dom.js';
import { PANELS } from './panels/index.js';
import { Hud } from './hud.js';
import { tooltip } from './tooltip.js';
import { fmt } from '../engine/format.js';
import { BAL } from '../data/balance.js';
import { heroPower } from '../game/character.js';
import { MATERIAL } from '../data/materials.js';
import { Nav, panelVisible } from './nav.js';
import { checkUnlocks, introFor, unlockAll, tutorialOf, markSeen } from './unlocks.js';
import { Dock } from './dock.js';
import { Guide } from './guide.js';
import { bindKeys } from './keys.js';

const TOP_MATS = ['scrap', 'dust', 'crystal', 'echo', 'shard'];
const SHORT_MAT = { scrap: '鉄屑', dust: '魔塵', crystal: '秘晶', echo: '残響', core: '核', shard: '欠片' };
let live = null; // いま画面にある UI（タイトルに戻って始め直したときに、前の UI の知らせを外す）

export class UI {
  constructor(game, scene, root, opts = {}) {
    if (live && live !== this) live.dispose();
    live = this;
    this.game = game;
    this.scene = scene;
    this.root = root;
    this.opts = opts;
    this.current = null;
    this.dirty = new Set();
    this.offs = [];
    this.modals = [];
    this.lastTop = 0;
    this.unlockT = 0;
    this.lastRenderAt = 0;
    this.power = { shown: null, t: 0, dirty: true };
    this.build();
    this.hud = new Hud(this);
    this.dock = new Dock(this, this.dockEl);
    this.guide = new Guide(this);
    this.bind();
    checkUnlocks(this, true); // 前からのセーブ: 満たしている機能は黙って開く
    this.openPanel(this.opts.panel || 'hero');
    this.updateTop();
    this.guide.maybeAutoStart();
  }

  dispose() {
    for (const f of this.offs) { try { f?.(); } catch { /* 無視 */ } }
    this.offs = [];
    this.guide?.stop();
    if (live === this) live = null;
  }

  build() {
    const r = this.root;
    clear(r);
    this.top = h('header#topbar');
    this.stage = h('div#stage');
    this.stage.append(this.scene.canvas);
    this.hudEl = h('div#hud');
    this.toastRoot = h('div#toasts', { 'aria-live': 'polite' });
    this.stage.append(this.hudEl, this.toastRoot);
    this.battle = h('section#battle', this.stage);
    this.dockEl = h('section#dock', { 'aria-label': '次の目標・記録' });
    this.panelNav = h('nav#panelnav', { 'aria-label': '窓' });
    this.panelBody = h('div#panelbody');
    this.panel = h('aside#panel', [this.panelNav, this.panelBody]);
    this.modalRoot = h('div#modals');
    r.append(this.top, h('main#main', [h('div#left', [this.battle, this.dockEl]), this.panel]), this.modalRoot);
    this.buildTop();
    this.nav = new Nav(this, this.panelNav);
    // 窓の中で押した・変えた直後は、マウスが乗っていてもすぐ描き直す
    const act = (e) => { if (e.type === 'click' && e.target instanceof Element && e.target.closest('input[type=text], input[type=number], input[type=search], textarea')) return; this.afterAction(); };
    this.panelBody.addEventListener('click', act);
    this.panelBody.addEventListener('change', act);
    // 自動の描き直しを待つのは「マウスが窓の上にある間」だけ（指で触ったあとの :hover は残るので使わない）
    this.hovering = false;
    this.panelBody.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.hovering = true; });
    this.panelBody.addEventListener('pointerleave', () => { this.hovering = false; });
  }

  buildTop() {
    const t = this.top;
    clear(t);
    const E = this.topEls = {
      name: h('div.tb-name'),
      level: h('div.tb-level'),
      xpbar: h('div.tb-xp', { role: 'progressbar', 'aria-label': '経験値' }, h('div.tb-xpfill')),
      power: h('div.tb-power', { title: '戦力（火力と耐久をまとめた目安）' }, [h('span.k', '戦力'), h('b.v', '0'), h('span.d')]),
      gold: h('div.tb-res.gold', { title: 'ゴールド' }),
      souls: h('div.tb-res.souls', { title: '魂（転生で得る。魂の祭壇で使う）' }),
      mats: h('div.tb-mats'),
    };
    E.speedSeg = h('div.tb-speed', { role: 'group', 'aria-label': '速さ' }, [1, 2, 3, 4].map((n) => h('button.spd', { type: 'button', dataset: { n: String(n) }, onclick: () => this.setSpeed(n) }, `×${n}`)));
    E.speed = h('button.btn.btn-small#speed', { type: 'button', title: '速さを変える（1〜4 キー）', onclick: () => this.cycleSpeed() }, '×1');
    t.append(
      h('div.tb-logo', [h('span.logo-a', 'ABYSS'), h('span.logo-b', 'DROP')]),
      h('div.tb-hero', [E.name, E.level, E.xpbar]),
      E.power,
      h('div.tb-wallet', [E.gold, E.souls, E.mats]),
      h('div.tb-actions', [
        E.speedSeg, E.speed,
        button('保存', () => { this.opts.onSave?.(); this.toast('保存しました', 'good'); }, { kind: 'small', class: 'tb-save', title: '今の進み具合を保存（自動でも保存します）' }),
        button('≡', () => this.openPanel('settings'), { kind: 'small', title: '設定', class: 'tb-menu' }),
      ]),
    );
  }

  /** その窓を開けるか（キー操作から。開いていない機能は開かない） */
  canOpen(id) {
    const p = PANELS.find((x) => x.id === id);
    return !!p && panelVisible(this.game, p);
  }

  /** 窓を開く。開いていない機能でも、ゲームの中のボタンから呼ばれたら開いたことにする */
  openPanel(id) {
    const p = PANELS.find((x) => x.id === id) || PANELS[0];
    // 説明を出したままほかの窓へ移ったら、読んだことにする
    if (this.current && this.current.id !== p.id && this.panelBody.querySelector('.feature-intro')) markSeen(this.game, this.current.id);
    this.current = p;
    tooltip.hide();
    this.renderPanel();
    this.nav.onOpen(p.id);
    this.panelBody.scrollTop = 0;
    this.game.events.emit('panelOpen', { id: p.id });
  }

  /** すべての機能を開く（テスト・上級者向け） */
  unlockAll() { unlockAll(this.game); this.refreshNav(); }

  showHelp(p = this.current) {
    if (!p?.help) return;
    this.modal(`${p.name} の説明`, h('div.helptext', { html: p.help }));
  }

  renderPanel() {
    const p = this.current;
    if (!p) return;
    const keep = this.panelBody.scrollTop;
    clear(this.panelBody);
    const el = h(`div.panel.panel-${p.id}`);
    const title = h('h2.panel-title', [
      h('span.pt-name', [h('span.pt-ic', { 'aria-hidden': 'true' }, p.icon || ''), p.name]),
      p.help ? h('button.help', { type: 'button', title: 'この窓の説明', 'aria-label': `${p.name} の説明`, onclick: () => this.showHelp(p) }, '？') : null,
    ]);
    this.panelBody.append(title);
    const intro = introFor(this, p.id);
    if (intro) this.panelBody.append(intro);
    this.panelBody.append(el);
    try { p.render(this, el); } catch (e) { console.error(`[panel:${p.id}]`, e); el.append(h('div.bad', `表示できませんでした: ${e.message}`)); }
    this.panelBody.scrollTop = keep;
    this.lastRenderAt = performance.now();
  }

  refreshNav() { this.nav?.refresh(); }

  /** 窓の中で何かを押した直後: 関係する出来事が起きていたら、すぐ描き直す */
  afterAction() {
    const at = performance.now();
    setTimeout(() => {
      if (!this.current || !this.panelBody.isConnected) return;
      const want = this.current.refreshOn || ['inv', 'gear', 'skills', 'level', 'stats', 'world'];
      const hit = this.pendingRender || [...this.dirty].some((k) => want.includes(k));
      if (hit && this.lastRenderAt < at) { this.dirty.clear(); this.pendingRender = false; this.renderPanel(); }
      this.refreshNav();
    }, 0);
  }

  /** マウスが窓の上にあるか（この間は自動の描き直しを待つ） */
  isHovered() { return this.hovering && this.panelBody.matches(':hover'); }

  /** 出来事でパネルを描き直す（まとめて 1 回） */
  markDirty(kind) {
    this.dirty.add(kind);
  }

  bind() {
    const ev = this.game.events;
    const on = (t, fn) => this.offs.push(ev.on(t, (e) => { try { fn(e || {}); } catch (err) { console.error(err); } }));
    const map = { invChanged: 'inv', gearChanged: 'gear', skillsChanged: 'skills', levelUp: 'level', statsChanged: 'stats', paragonUp: 'level', zoneClear: 'world', stageStart: 'world', goldChanged: 'gold' };
    for (const [e, k] of Object.entries(map)) on(e, () => this.markDirty(k));
    for (const e of ['gearChanged', 'skillsChanged', 'statsChanged', 'levelUp', 'paragonUp']) on(e, () => { this.power.dirty = true; });
    on('levelUp', (e) => this.toast(`レベル ${e.level} になった！ スキルポイント・パッシブの点 +${e.count}`, 'level'));
    on('zoneClear', (e) => { if (e.first && e.next) this.toast(`新しい地域「${e.next.name}」が開いた`, 'good'); });
    on('bagFull', () => this.toastOnce('bagfull', '持ち物がいっぱい。分解するか倉庫へ', 'bad'));
    on('loot', (e) => { if ((e.item && ['legendary', 'set', 'unique', 'mythic'].includes(e.item.rarity)) && e.where !== 'salvaged') this.lootToast(e.item); });
    on('autoEquip', () => this.toastOnce('autoequip', 'より良い装備に自動で着替えた', 'good'));
    on('bossFail', () => this.markDirty('world'));
    on('offlineReport', (rep) => this.opts.onOfflineReport?.(rep));
    const onResize = () => this.scene.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    // 画面の大きさが変わったら（下の欄の高さ・スマホの向き）キャンバスも合わせる
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.scene.resize());
      ro.observe(this.stage);
      this.offs.push(() => ro.disconnect());
    }
    this.offs.push(bindKeys(this));
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
    const el = h(`div.toast${kind ? `.${kind}` : ''}`, { role: 'status' }, text);
    this.toastRoot.append(el);
    const max = (globalThis.innerWidth || 1200) <= 900 ? 2 : 4;
    while (this.toastRoot.children.length > max) this.toastRoot.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
  }

  /** 窓を出す。buttons: [{ label, kind, onclick → false を返すと閉じない }] */
  modal(title, content, buttons = [{ label: '閉じる' }], opts = {}) {
    const prevFocus = document.activeElement;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      this.modals = this.modals.filter((m) => m !== entry);
      opts.onClose?.();
      if (prevFocus instanceof HTMLElement && prevFocus.isConnected) { try { prevFocus.focus({ preventScroll: true }); } catch { /* 無視 */ } }
    };
    const box = h(`div.modal${opts.wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : '' }, [
      h('div.modal-head', [h('h3', title), h('button.modal-x', { type: 'button', 'aria-label': '閉じる', onclick: close }, '×')]),
      h('div.modal-body', content),
      h('div.modal-foot', buttons.map((b) => button(b.label, () => { const r = b.onclick?.(); if (r !== false) close(); }, { kind: b.kind }))),
    ]);
    const wrap = h('div.modal-wrap', { onclick: (e) => { if (e.target === wrap && !opts.sticky) close(); } }, box);
    const entry = { wrap, close, sticky: !!opts.sticky };
    this.modals.push(entry);
    this.modalRoot.append(wrap);
    tooltip.hide();
    const first = box.querySelector('.modal-foot .btn-primary') || box.querySelector('.modal-foot .btn');
    if (first && !globalThis.matchMedia?.('(hover: none)')?.matches) { try { first.focus({ preventScroll: true }); } catch { /* 無視 */ } }
    return { close, box };
  }

  hasModal() {
    this.modals = this.modals.filter((m) => m.wrap.isConnected);
    return this.modals.length > 0 || !!document.querySelector('.modal-wrap');
  }

  /** Esc: 一番上の窓（確認・説明）か案内を閉じる。閉じたら true */
  closeTop() {
    this.modals = this.modals.filter((m) => m.wrap.isConnected);
    const m = this.modals[this.modals.length - 1];
    if (m) { if (!m.sticky) m.close(); return true; }
    const other = [...document.querySelectorAll('.modal-wrap')].pop();
    if (other) { other.querySelector('.modal-x')?.click(); return true; }
    if (this.guide?.active) { this.guide.finish('skip'); return true; }
    if (tooltip.el?.style.display === 'block') { tooltip.hide(); return true; }
    return false;
  }

  confirm(text, okLabel = 'はい') {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      this.modal('確認', h('p', text), [{ label: okLabel, kind: 'primary', onclick: () => fin(true) }, { label: 'やめる', onclick: () => fin(false) }], { onClose: () => fin(false) });
    });
  }

  maxSpeed() { return Math.min(4, 2 + (this.game.state.meta.unlocks.speed || 0)); }

  setSpeed(n) {
    const s = this.game.state.settings;
    const max = this.maxSpeed();
    if (n > max) { this.toastOnce(`spd${n}`, `×${n} は魂の祭壇（転生の窓）で解放します`, ''); return; }
    s.speed = Math.max(1, Math.min(max, n));
    this.updateTop();
  }

  cycleSpeed() {
    const s = this.game.state.settings;
    const max = this.maxSpeed();
    s.speed = (s.speed || 1) >= max ? 1 : (s.speed || 1) + 1;
    this.updateTop();
  }

  toggleAuto() {
    const w = this.game.sys.world;
    w.setAutoAdvance(!this.game.state.world.autoAdvance);
    this.toastOnce('autoadv', `自動前進 ${this.game.state.world.autoAdvance ? 'ON' : 'OFF'}`, '');
    this.hud.update(1);
  }

  challengeBoss() {
    if (this.game.sys.world.challengeBoss()) this.toast('ボスに挑戦！', 'boss');
  }

  /** 毎フレーム（軽い物だけ） */
  update(dt) {
    this.hud.update(dt);
    this.dock.update(dt);
    this.lastTop += dt;
    if (this.lastTop > 0.25) { this.lastTop = 0; this.updateTop(); }
    this.unlockT += dt;
    if (this.unlockT > 1) {
      this.unlockT = 0;
      if (checkUnlocks(this).length) this.refreshNav();
    }
    if (this.dirty.size && this.current) {
      const want = this.current.refreshOn || ['inv', 'gear', 'skills', 'level', 'stats', 'world'];
      const hit = [...this.dirty].some((k) => want.includes(k));
      this.dirty.clear();
      if (hit && !this.isHovered()) this.renderPanel();
      else if (hit) this.pendingRender = true;
      this.refreshNav();
    }
    if (this.pendingRender && !this.isHovered()) { this.pendingRender = false; this.renderPanel(); }
  }

  updateTop() {
    const st = this.game.state;
    if (!st) return;
    const hr = st.hero;
    const e = this.topEls;
    if (e.name.textContent !== hr.name) e.name.textContent = hr.name;
    const isPar = hr.level >= BAL.MAX_LEVEL;
    const lv = isPar ? `Lv ${hr.level}　アビスLv ${hr.paragon.level}` : `Lv ${hr.level}`;
    if (e.level.textContent !== lv) e.level.textContent = lv;
    const need = isPar ? BAL.paragonXpToNext(hr.paragon.level) : BAL.xpToNext(hr.level);
    const cur = isPar ? hr.paragon.xp : hr.xp;
    const pct = Math.min(100, (cur / need) * 100);
    e.xpbar.firstChild.style.width = `${pct}%`;
    e.xpbar.title = `経験値 ${fmt(cur)} / ${fmt(need)}（${Math.floor(pct)}%）`;
    e.xpbar.setAttribute('aria-valuenow', String(Math.floor(pct)));
    e.gold.textContent = `${fmt(st.meta.gold)} G`;
    const souls = st.meta.souls || st.meta.rebirths ? `魂 ${fmt(st.meta.souls)}${st.meta.rebirths ? `・転生 ${st.meta.rebirths}` : ''}` : '';
    if (e.souls.textContent !== souls) e.souls.textContent = souls;
    e.souls.style.display = souls ? '' : 'none';
    const m = st.inv.mats;
    const ids = TOP_MATS.filter((k, i) => i < 3 || (m[k] || 0) > 0);
    const key = ids.map((k) => `${k}${Math.floor(m[k] || 0)}`).join('|');
    if (e.mats.dataset.k !== key) {
      e.mats.dataset.k = key;
      clear(e.mats);
      for (const k of ids) e.mats.append(h('span.tb-mat', { title: MATERIAL[k]?.name || k }, [h('i', { style: { background: MATERIAL[k]?.color || '#888' } }), `${SHORT_MAT[k] || k} `, h('b', fmt(m[k] || 0))]));
    }
    // 速さ
    const sp = st.settings.speed || 1;
    const max = this.maxSpeed();
    e.speed.textContent = `×${sp}`;
    for (const b of e.speedSeg.children) {
      const n = Number(b.dataset.n);
      b.classList.toggle('on', n === sp);
      b.classList.toggle('lock', n > max);
      b.title = n > max ? `×${n}（魂の祭壇で解放）` : `速さ ×${n}（${n} キー）`;
    }
    // 「動きを減らす」（演出の細かい設定）を画面の動き（脈打ち・光り・知らせ）にも効かせる
    const reduce = !!st.settings.fxReduce;
    if (document.documentElement.classList.contains('reduce-motion') !== reduce) document.documentElement.classList.toggle('reduce-motion', reduce);
    this.updatePower();
  }

  /** 戦力（REFERENCE U06）: 変わったら 1.5 秒だけ ▲ / ▼ を出す */
  updatePower() {
    const P = this.power;
    const now = performance.now();
    if (!P.dirty && now - P.t < 5000) return;
    if (!this.game.H) return;
    P.dirty = false; P.t = now;
    let v = 0;
    try { v = heroPower(this.game.H, this.game.state); } catch { return; }
    const el = this.topEls.power;
    el.querySelector('.v').textContent = fmt(v);
    if (P.shown !== null && Math.abs(v - P.shown) >= Math.max(1, P.shown * 0.005)) {
      const d = el.querySelector('.d');
      const up = v > P.shown;
      d.textContent = `${up ? '▲' : '▼'}${fmt(Math.abs(v - P.shown))}`;
      d.className = `d ${up ? 'up' : 'down'}`;
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth; // 動きをやり直す
      el.classList.add(up ? 'flash-up' : 'flash-down');
      clearTimeout(P.timer);
      P.timer = setTimeout(() => { d.textContent = ''; el.classList.remove('flash-up', 'flash-down'); }, 1600);
    }
    P.shown = v;
  }
}

export { tutorialOf };
