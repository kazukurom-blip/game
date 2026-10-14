// 戦闘の画面の下の欄（パソコン）／戦闘の画面のすぐ下の帯（スマホ。押すと開く）。
// タブ: 次の目標（goals.js）・直近のドロップ（押すとアイテムの操作）・進み具合（1 分・1 時間あたり）・戦闘の記録。
// 記録は遊んでいる間だけ（セーブしない）。

import { h, clear, spriteImg } from './dom.js';
import { fmt, fmtTime } from '../engine/format.js';
import { RARITY } from '../data/rarity.js';
import { itemName } from '../game/items.js';
import { assets } from '../render/assets.js';
import { itemIconId } from '../render/manifest.js';
import { nextGoal, paceInfo } from './goals.js';
import { itemMenu, rarityMark } from './panels/common.js';
import { attachTip, itemCard } from './tooltip.js';
import { MONSTER } from '../data/monsters.js';
import { SKILL } from '../data/skills.js';

const TABS = [['goal', '次の目標'], ['loot', '直近のドロップ'], ['pace', '進み具合'], ['log', '戦闘の記録']];
const LOOT_MAX = 120;
const LOG_MAX = 80;
const LOOT_FILTERS = [['all', 'すべて', 0], ['magic', 'マジック以上', 1], ['rare', 'レア以上', 2], ['legendary', 'レジェンダリー以上', 4]];
const WHERE = { bag: '持ち物', equipped: '装備した', salvaged: '分解', stash: '倉庫', sold: '売却' };

export function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600); const mm = Math.floor((sec % 3600) / 60); const ss = sec % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

export class Dock {
  constructor(ui, root) {
    this.ui = ui;
    this.game = ui.game;
    this.root = root;
    this.loot = [];
    this.log = [];
    this.lootSeen = 0;
    this.t = 1; // 最初のフレームで中身を出す
    this.session = { kills: 0, drops: 0, best: 0, start: this.game.state?.playTime || 0 };
    const T = this.game.state?.meta?.tutorial;
    this.tab = T?.dockTab || 'goal';
    this.filter = T?.dockLoot || 'magic';
    this.open = false; // スマホで開いているか
    this.build();
    this.bind();
  }

  build() {
    clear(this.root);
    this.tabBtns = {};
    this.tabsEl = h('div.dock-tabs', { role: 'tablist' });
    for (const [id, name] of TABS) {
      const b = h('button.dock-tab', { type: 'button', role: 'tab', dataset: { t: id }, onclick: () => this.setTab(id) }, [h('span', name), h('span.dock-n')]);
      this.tabBtns[id] = b;
      this.tabsEl.append(b);
    }
    // スマホの帯（押すと開く）
    this.strip = h('button.dock-strip', { type: 'button', 'aria-expanded': 'false', onclick: () => this.toggle() }, [h('span.ds-ic', '🎯'), h('span.ds-tx'), h('span.ds-ar', '▾')]);
    this.body = h('div.dock-body');
    this.root.append(this.strip, this.tabsEl, this.body);
    this.setTab(this.tab, true);
  }

  toggle() {
    this.open = !this.open;
    this.root.classList.toggle('open', this.open);
    this.strip.setAttribute('aria-expanded', this.open ? 'true' : 'false');
    this.render();
  }

  setTab(id, quiet = false) {
    this.tab = id;
    const T = this.game.state?.meta?.tutorial;
    if (T) T.dockTab = id;
    for (const [k, b] of Object.entries(this.tabBtns)) { b.classList.toggle('on', k === id); b.setAttribute('aria-selected', k === id ? 'true' : 'false'); }
    if (id === 'loot') this.lootSeen = this.loot.length;
    this.render();
    if (!quiet) this.updateCounts();
  }

  bind() {
    const ev = this.game.events;
    const offs = this.ui.offs;
    const on = (t, fn) => offs.push(ev.on(t, (e) => { try { fn(e || {}); } catch (err) { console.error(err); } }));
    on('loot', (e) => { if (e.item) this.addLoot(e.item, e.where); });
    on('kill', (e) => {
      this.session.kills++;
      const u = e.unit;
      if (!u) return;
      if (u.boss) this.addLog(`ボス「${u.name}」を倒した`, 'boss');
      else if (u.goblin) this.addLog(`${u.name}を倒した`, 'gob');
      else if (u.rank === 'champion' || u.rank === 'rare') this.addLog(`エリート「${u.name}」を倒した`, 'elite');
    });
    on('bossSpawn', (e) => this.addLog(`ボス「${e.unit?.name || MONSTER[e.zone?.boss]?.name || ''}」が現れた`, 'boss'));
    on('bossFail', (e) => this.addLog(`ボスに敗れた（${e.reason || '負け'}${e.short ? `・火力があと ${Math.round(e.short)}%` : ''}）`, 'bad'));
    on('zoneClear', (e) => { if (e.first) this.addLog(`「${e.zone?.name || ''}」を踏破${e.next ? `　次は「${e.next.name}」` : ''}`, 'good'); });
    on('heroDeath', () => this.addLog('倒れた…（すぐに起き上がる）', 'bad'));
    on('levelUp', (e) => this.addLog(`レベル ${e.level} になった`, 'level'));
    on('paragonUp', (e) => this.addLog(`アビスLv ${e.level} になった`, 'level'));
    on('skillLearned', (e) => { if (!e.quiet && SKILL[e.id]) this.addLog(`スキル「${SKILL[e.id].name}」を覚えた`, 'level'); });
    on('achievement', (e) => { if (e.def) this.addLog(`実績「${e.def.name}」`, 'good'); });
    on('eggFound', (e) => this.addLog(`${e.name || '卵'}を手に入れた`, 'good'));
    on('autoEquip', (e) => { if (e.item) this.addLog(`自動で装備: ${itemName(e.item)}`, 'good'); });
    on('goblinSpawn', (e) => this.addLog(`${MONSTER[e.unit?.defId]?.name || 'ため込み屋'}が現れた`, 'gob'));
    on('goblinEscape', () => this.addLog('ため込み屋に逃げられた', 'bad'));
    on('storyClear', () => this.addLog('物語を踏破した！', 'level'));
    on('rebirth', (e) => this.addLog(`転生した（魂 +${fmt(e.souls || 0)}）`, 'level'));
    on('riftComplete', (e) => this.addLog(`裂け目 段階 ${e.level} を踏破`, 'good'));
    on('riftFail', (e) => { if (!e.abandoned) this.addLog(`裂け目 段階 ${e.level}：時間切れ`, 'bad'); });
    on('featureUnlocked', (e) => this.addLog(`新しい機能が開いた（${(e.ids || []).length}）`, 'level'));
  }

  addLoot(item, where) {
    const r = RARITY[item.rarity] || RARITY.common;
    this.session.drops++;
    this.loot.push({ item, where, t: this.game.state.playTime || 0, idx: r.idx });
    if (this.loot.length > LOOT_MAX) { this.loot.shift(); this.lootSeen = Math.max(0, this.lootSeen - 1); }
    if (r.idx >= 4 && where !== 'salvaged') this.addLog(`${r.name}「${itemName(item)}」を拾った`, `r-${item.rarity}`);
    if (this.tab === 'loot' && this.visible()) { this.lootSeen = this.loot.length; this.dirtyLoot = true; }
  }

  addLog(text, cls = '') {
    this.log.push({ text, cls, t: this.game.state?.playTime || 0 });
    if (this.log.length > LOG_MAX) this.log.shift();
    if (this.tab === 'log') this.dirtyLog = true;
  }

  visible() { return this.root.offsetParent !== null && this.root.clientHeight > 40; }

  update(dt) {
    this.t += dt;
    if (this.dirtyLoot && this.tab === 'loot') { this.dirtyLoot = false; this.render(); }
    if (this.dirtyLog && this.tab === 'log') { this.dirtyLog = false; this.render(); }
    if (this.t < 1) return;
    this.t = 0;
    this.updateCounts();
    if (this.strip.offsetParent !== null) this.updateStrip();
    if ((this.tab === 'goal' || this.tab === 'pace') && this.visible()) this.render();
  }

  updateCounts() {
    const fresh = this.loot.slice(this.lootSeen).filter((x) => x.idx >= this.minIdx()).length;
    const n = this.tabBtns.loot.querySelector('.dock-n');
    const t = this.tab !== 'loot' && fresh ? String(Math.min(99, fresh)) : '';
    if (n.textContent !== t) n.textContent = t;
  }

  updateStrip() {
    const g = nextGoal(this.game);
    const tx = this.strip.querySelector('.ds-tx');
    const s = `${g.title || '次の目標'}${g.short ? `　火力あと ${g.short}%` : ''}${g.etaText ? `　${g.etaText}` : ''}`;
    if (tx.textContent !== s) tx.textContent = s;
    this.strip.classList.toggle('bad', !g.ok);
  }

  minIdx() { return (LOOT_FILTERS.find((f) => f[0] === this.filter) || LOOT_FILTERS[1])[2]; }

  render() {
    const b = this.body;
    const keep = b.scrollTop;
    clear(b);
    try {
      if (this.tab === 'goal') this.renderGoal(b);
      else if (this.tab === 'loot') this.renderLoot(b);
      else if (this.tab === 'pace') this.renderPace(b);
      else this.renderLog(b);
    } catch (e) { console.error('[dock]', e); b.append(h('div.dim', '表示できませんでした')); }
    if (this.tab !== 'log' && this.tab !== 'loot') b.scrollTop = keep;
  }

  renderGoal(b) {
    const ui = this.ui;
    const g = nextGoal(this.game);
    const left = h('div.dg-main', [
      h('div.dg-title', g.title || '次の目標'),
      g.sub ? h('div.dg-sub', g.sub) : null,
    ]);
    if (g.need > 0) {
      const pct = Math.max(0, Math.min(100, g.ratio * 100));
      left.append(h('div.dg-meter', { class: g.ok ? 'ok' : 'ng', title: `今の火力 ${fmt(g.cur)} ／ 必要 ${fmt(g.need)}` }, [
        h('i', { style: { width: `${pct}%` } }),
        h('span', `今の火力 ${fmt(g.cur)} ／ 必要 ${fmt(g.need)}${g.ok ? '　十分' : `　あと ${Math.max(1, Math.round((1 - g.ratio) * 100))}%`}`),
      ]));
    }
    if (g.etaText) left.append(h('div.dg-eta', ['⏱ ', g.etaText]));
    for (const x of g.extra) left.append(h(`div.dg-line${x.panel || x.act ? '.link' : ''}`, { onclick: x.panel ? () => ui.openPanel(x.panel) : x.act === 'boss' ? () => ui.challengeBoss() : undefined }, x.text));
    const right = h('div.dg-side');
    if (g.hints.length) {
      right.append(h('div.dg-h', '手段'));
      g.hints.forEach((x, i) => right.append(h('button.dg-hint', { type: 'button', onclick: () => ui.openPanel(x.panel) }, [h('span.dg-no', String(i + 1)), x.text])));
    }
    if (g.unlock) right.append(h('div.dg-unlock', [h('span.fi-tag', '次に開く機能'), ' ', h('b', g.unlock.name), ` … ${g.unlock.when}`]));
    if (!g.hints.length && !g.unlock) right.append(h('div.dim.small', 'いまは放置で十分です。'));
    b.append(h('div.dock-goal', [left, right]));
  }

  renderLoot(b) {
    const min = this.minIdx();
    b.append(h('div.dl-filters', LOOT_FILTERS.map(([id, name]) => h(`button.chipbtn${this.filter === id ? '.on' : ''}`, { type: 'button', onclick: () => { this.filter = id; const T = this.game.state.meta.tutorial; if (T) T.dockLoot = id; this.render(); } }, name))));
    const list = this.loot.filter((x) => x.idx >= min).slice(-40).reverse();
    if (!list.length) { b.append(h('div.dim.small.dock-empty', min > 0 ? 'まだありません（倒した敵の落とし物がここに並びます）' : 'まだありません')); return; }
    const grid = h('div.dl-list');
    const now = this.game.state.playTime || 0;
    for (const x of list) {
      const it = x.item;
      const r = RARITY[it.rarity] || RARITY.common;
      const row = h(`button.dl-row.r-${it.rarity}${x.where === 'salvaged' ? '.gone' : ''}`, { type: 'button', style: { '--rc': r.color } }, [
        rarityMark(it),
        spriteImg(assets, itemIconId(it), 22),
        h('span.dl-name', { style: { color: r.color } }, `${it.enh ? `+${it.enh} ` : ''}${itemName(it)}`),
        h('span.dl-where', WHERE[x.where] || x.where || ''),
        h('span.dl-t', `${fmtTime(Math.max(0, now - x.t), true)}前`),
      ]);
      attachTip(row, () => itemCard(this.game, it, { compare: x.where === 'bag' }));
      row.addEventListener('click', () => this.openItem(it));
      grid.append(row);
    }
    b.append(grid);
  }

  openItem(it) {
    const st = this.game.state;
    const eq = Object.values(st.hero.equip).find((x) => x?.uid === it.uid);
    if (eq) { itemMenu(this.ui, eq, true); return; }
    const inBag = st.inv.bag.find((x) => x.uid === it.uid);
    if (inBag) { itemMenu(this.ui, inBag); return; }
    const inStash = st.inv.stash.flat().some((x) => x?.uid === it.uid);
    this.ui.toast(inStash ? '倉庫にあります（持ち物 → 倉庫）' : 'もう手元にありません（分解・売却ずみ）');
  }

  renderPace(b) {
    const p = paceInfo(this.game);
    const s = this.session;
    const st = this.game.state;
    const lv = st.hero.level;
    const best = this.loot.filter((x) => x.idx >= 4).length;
    const cards = [
      ['撃破', `${fmt(p.killsMin, { dec: p.killsMin < 10 ? 1 : 0 })}`, '体 / 分'],
      ['経験値', fmt(p.xpH), '/ 時'],
      ['ゴールド', fmt(p.goldH), 'G / 時'],
      ['ドロップ', fmt(p.dropsH, { dec: 0 }), '個 / 時'],
      ['エリート', fmt(p.elitesH, { dec: 0 }), '体 / 時'],
      [lv >= 100 ? '次のアビスLv' : `Lv ${lv + 1} まで`, p.levelEta ? fmtTime(p.levelEta, true) : '-', '目安'],
    ];
    b.append(h('div.dp-cards', cards.map(([k, v, u]) => h('div.dp-card', [h('div.k', k), h('div.v', v), h('div.u', u)]))));
    b.append(h('div.dp-sess.dim.small', `この遊びで: 撃破 ${fmt(s.kills)}・ドロップ ${fmt(s.drops)}・レジェンダリー以上 ${best}（${fmtTime(Math.max(0, (st.playTime || 0) - s.start), true)}）${p.measured < 20 ? '　※ まだ測り始めたばかり' : ''}`));
  }

  renderLog(b) {
    if (!this.log.length) { b.append(h('div.dim.small.dock-empty', 'まだありません（ボス・エリート・レベル・大きなドロップがここに残ります）')); return; }
    const list = h('div.dlog');
    for (const x of this.log.slice().reverse()) list.append(h(`div.dlog-row.${x.cls || 'n'}`, [h('span.dlog-t', clock(x.t)), h('span', x.text)]));
    b.append(list);
  }
}
