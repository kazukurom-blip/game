// 持ち物の窓: バッグ・倉庫・まとめて選んで分解/売る・並べ替え・自動の振り分け（プリセット L0〜L4）・幸運ゲージ・素材。
// 担当: アイテム担当

import { h, button } from '../dom.js';
import { itemCell, emptyCell, itemMenu, matText } from './common.js';
import { RARITIES, RARITY } from '../../data/rarity.js';
import { fmt } from '../../engine/format.js';
import { MATERIALS } from '../../data/materials.js';
import { statDef } from '../../data/stats.js';
import { ensureCss, luckMeters, stashAny } from './itemkit.js';

let view = 'bag';
let stashTab = 0;
let multi = false;
const picked = new Set();

/** 自動の振り分けのプリセット（この段より下を分解） */
export const PRESETS = [
  { id: 'L0', name: 'L0', sub: '全部残す', upTo: -1 },
  { id: 'L1', name: 'L1', sub: 'ノーマル', upTo: 0 },
  { id: 'L2', name: 'L2', sub: 'マジック以下', upTo: 1 },
  { id: 'L3', name: 'L3', sub: 'レア以下', upTo: 2 },
  { id: 'L4', name: 'L4', sub: 'エピック以下', upTo: 3 },
];
/** 「この能力が付いていたら残す」の候補 */
const WANT_LABEL = { life: '最大ライフ（数値）', inc_life: '最大ライフ（%）', armor: 'アーマー（数値）', inc_dmg: 'ダメージ（%）', weapon_dmg: '武器ダメージ（%）' };
const WANT = ['inc_dmg', 'crit_chance', 'crit_damage', 'attack_speed', 'weapon_dmg', 'add_phys', 'add_fire', 'add_cold', 'add_lightning', 'inc_elemental', 'inc_minion', 'life', 'inc_life', 'res_all', 'armor', 'dodge', 'cdr', 'skill_lvl', 'move_speed', 'magic_find', 'gold_find', 'str', 'dex', 'int', 'vit'];

export const bagPanel = {
  id: 'bag', name: '持ち物', icon: '🎒',
  refreshOn: ['inv', 'gear', 'level'],
  badge: (g) => g.state.inv.bag.filter((x) => x.isNew).length,
  help: 'アイテムを押すと操作（装備・鍵・分解・売る・倉庫へ・鍛冶へ・ソケット・抽出）。右クリックですぐ倉庫へ。<br>「選んで分解」で複数を選んでまとめて分解・売却できます。<br>自動の振り分けで、拾ったときに分解する物を決められます（放置向け）。',
  render(ui, el) {
    ensureCss();
    const g = ui.game;
    const inv = g.state.inv;
    el.append(h('div.tabs', [
      h(`button.tab${view === 'bag' ? '.on' : ''}`, { onclick: () => { view = 'bag'; ui.renderPanel(); } }, `バッグ ${inv.bag.length}/${inv.bagSize}`),
      h(`button.tab${view === 'stash' ? '.on' : ''}`, { onclick: () => { view = 'stash'; multi = false; picked.clear(); ui.renderPanel(); } }, `倉庫 ${inv.stash.reduce((s, t) => s + t.length, 0)}`),
      h(`button.tab${view === 'filter' ? '.on' : ''}`, { onclick: () => { view = 'filter'; multi = false; picked.clear(); ui.renderPanel(); } }, '自動の振り分け'),
    ]));
    if (view === 'filter') { renderFilter(ui, el); return; }
    if (view === 'stash') { renderStash(ui, el); return; }
    renderBag(ui, el);
  },
};

function renderBag(ui, el) {
  const g = ui.game;
  const inv = g.state.inv;
  const sys = g.sys.inv;
  for (const uid of [...picked]) if (!inv.bag.some((x) => x.uid === uid)) picked.delete(uid);
  if (multi) {
    const sel = inv.bag.filter((x) => picked.has(x.uid));
    el.append(h('div.ik-multi', [
      h('b', `${sel.length} 個を選択中`),
      button('全部選ぶ', () => { inv.bag.forEach((x) => { if (!x.locked) picked.add(x.uid); }); ui.renderPanel(); }, { kind: 'small' }),
      button('分解', async () => {
        if (!sel.length) return;
        const ok = await ui.confirm(`${sel.length} 個を分解します（鍵つきは残ります）。`, '分解する');
        if (!ok) return;
        const r = sys.salvage(sel.map((x) => x.uid));
        picked.clear();
        ui.toast(`${r.n} 個を分解: ${matText(r.got)}`, 'good');
        ui.renderPanel();
      }, { kind: 'danger', disabled: !sel.length }),
      button('売る', async () => {
        if (!sel.length) return;
        // レジェンダリー以上・覚醒/極致・強化 +5 以上が入っていたら確かめる（1 つずつ売るときと同じ。元に戻せない）
        const precious = sel.filter((x) => (RARITY[x.rarity]?.idx || 0) >= 4 || x.q || (x.enh || 0) >= 5).length;
        if (precious && !(await ui.confirm(`${sel.length} 個を売ります（レジェンダリー以上・覚醒・強化した物 ${precious} 個を含む）。元に戻せません。`, '売る'))) return;
        const r = sys.sell(sel.map((x) => x.uid)); picked.clear(); ui.toast(`${r.n} 個を ${fmt(r.gold)} G で売った`, 'good'); ui.renderPanel();
      }, { kind: 'small', disabled: !sel.length }),
      button('倉庫へ', () => { let n = 0; for (const x of sel) if (stashAny(g, x.uid, stashTab) >= 0) n++; picked.clear(); ui.toast(n < sel.length ? `${n} 個を倉庫へ（倉庫がいっぱいで ${sel.length - n} 個は残った）` : `${n} 個を倉庫へ`, n < sel.length ? 'bad' : 'good'); ui.renderPanel(); }, { kind: 'small', disabled: !sel.length }),
      button('やめる', () => { multi = false; picked.clear(); ui.renderPanel(); }, { kind: 'small' }),
    ]));
  } else {
    el.append(h('div.toolbar', [
      button('並べ替え', () => { sys.sortBag(); ui.renderPanel(); }, { kind: 'small' }),
      button('選んで分解', () => { multi = true; picked.clear(); ui.renderPanel(); }, { kind: 'small' }),
      button('マジック以下を分解', () => salvageBelow(ui, 1), { kind: 'small' }),
      button('レア以下を分解', () => salvageBelow(ui, 2), { kind: 'small' }),
      button('新しい印を消す', () => { inv.bag.forEach((x) => { x.isNew = false; }); ui.renderPanel(); }, { kind: 'small' }),
    ]));
  }
  const grid = h('div.grid');
  for (const it of inv.bag) {
    let up = false;
    if (!multi) { try { up = !sys.equipProblem(it, it.slot === 'ring' ? 'ring1' : it.slot) && sys.isUpgrade(it); } catch { up = false; } }
    const cell = itemCell(ui, it, {
      upgrade: up,
      onClick: () => {
        if (multi) { if (it.locked) { ui.toast('鍵つきは選べない'); return; } if (picked.has(it.uid)) picked.delete(it.uid); else picked.add(it.uid); ui.renderPanel(); return; }
        itemMenu(ui, it);
      },
      onRight: () => { if (stashAny(g, it.uid, stashTab) < 0) ui.toast('倉庫がいっぱい', 'bad'); ui.renderPanel(); },
    });
    if (picked.has(it.uid)) cell.classList.add('ik-pick');
    grid.append(cell);
  }
  for (let i = inv.bag.length; i < inv.bagSize; i++) grid.append(emptyCell());
  el.append(grid);
  el.append(h('div.hint', multi ? 'アイテムを押して選ぶ。もう一度押すと外す。' : 'アイテムを押すと操作（倉庫へ入れるのもここ。右クリックならすぐ倉庫へ）。▲ は今の装備より強くなりそうな物。'));
  el.append(luckMeters(g));
  // 素材・宝石・ルーンの数
  const gemN = Object.values(inv.gems || {}).reduce((s, n) => s + n, 0);
  const runeN = Object.values(inv.runes || {}).reduce((s, n) => s + n, 0);
  el.append(h('section.sec', [h('h3.sec-title', ['素材', h('span.sec-right', `宝石 ${fmt(gemN)}・ルーン ${fmt(runeN)}・深淵の宝石 ${Object.keys(inv.lgems || {}).length}/8`)]),
    h('div.ik-mats', MATERIALS.map((m) => h('div.m', { title: `${m.desc}\n入手: ${m.src}` }, [h('span.dot', { style: { background: m.color } }), m.name, h('b', fmt(inv.mats[m.id] || 0))])))]));
}

function renderStash(ui, el) {
  const g = ui.game;
  const inv = g.state.inv;
  const sys = g.sys.inv;
  if (stashTab >= inv.stash.length) stashTab = 0;
  el.append(h('div.tabs.small', [
    ...inv.stash.map((tab, i) => h(`button.tab${stashTab === i ? '.on' : ''}`, { onclick: () => { stashTab = i; ui.renderPanel(); } }, `${i + 1}（${tab.length}）`)),
    inv.stash.length < 8 ? h('button.tab', { onclick: () => ui.openPanel('merchant'), title: '商人の「拡張」で増やせる' }, '＋') : null,
  ]));
  const tab = inv.stash[stashTab] || [];
  el.append(h('div.toolbar', [
    button('並べ替え', () => { tab.sort((a, b) => (RARITY[b.rarity].idx - RARITY[a.rarity].idx) || b.ilvl - a.ilvl); g.events.emit('invChanged', {}); ui.renderPanel(); }, { kind: 'small' }),
    button('全部バッグへ', () => { let n = 0; for (const it of [...tab]) if (sys.fromStash(it.uid)) n++; ui.toast(`${n} 個をバッグへ`); ui.renderPanel(); }, { kind: 'small' }),
  ]));
  const grid = h('div.grid');
  for (const it of tab) grid.append(itemCell(ui, it, { onClick: () => { if (!sys.fromStash(it.uid)) ui.toast('バッグがいっぱい', 'bad'); ui.renderPanel(); }, onRight: () => itemMenu(ui, it) }));
  for (let i = tab.length; i < inv.stashTabSize; i++) grid.append(emptyCell());
  el.append(h('div.hint', `押すとバッグへ戻す。右クリックで詳しい操作（鍛冶・分解など）。倉庫のタブ ${inv.stash.length}/8（1 枚 ${inv.stashTabSize} 枠）。`), grid);
}

async function salvageBelow(ui, maxIdx) {
  const g = ui.game;
  const list = g.state.inv.bag.filter((x) => !x.locked && (RARITIES.find((r) => r.id === x.rarity)?.idx ?? 0) <= maxIdx);
  if (!list.length) { ui.toast('分解できる物がありません'); return; }
  const ok = await ui.confirm(`${list.length} 個を分解します（鍵つきは残ります）。`, '分解する');
  if (!ok) return;
  const r = g.sys.inv.salvage(list.map((x) => x.uid));
  ui.toast(`${r.n} 個を分解: ${matText(r.got)}`, 'good');
  ui.renderPanel();
}

/** プリセットを当てる */
export function applyPreset(f, id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  f.preset = id;
  for (const r of RARITIES) f.autoSalvage[r.id] = r.idx <= p.upTo && r.idx <= 3;
}

function renderFilter(ui, el) {
  const g = ui.game;
  const f = g.state.inv.filter;
  const rerender = () => ui.renderPanel();
  el.append(h('p.hint', '拾ったときに、ここで選んだレアリティは自動で分解します（素材になります）。下の「残す」規則が優先されます。'));
  el.append(h('section.sec', [h('h3.sec-title', 'プリセット'), h('div.ik-presets', PRESETS.map((p) => h(`button.btn${f.preset === p.id ? '.on' : ''}`, { onclick: () => { applyPreset(f, p.id); rerender(); } }, [p.name, h('small', p.sub)])))]));
  const row = h('div.checks');
  for (const r of RARITIES) {
    const cb = h('input', { type: 'checkbox', checked: !!f.autoSalvage[r.id] || undefined, onchange: (e) => { f.autoSalvage[r.id] = e.target.checked; f.preset = 'custom'; rerender(); } });
    row.append(h('label.chk', { style: { color: r.color } }, [cb, ` ${r.name}`]));
  }
  el.append(h('section.sec', [h('h3.sec-title', ['自動で分解するレアリティ', h('span.sec-right', f.preset === 'custom' ? '自分で設定' : `プリセット ${f.preset}`)]), row]));
  const chk = (key, label, title = '') => h('label.chk', { title }, [h('input', { type: 'checkbox', checked: f[key] !== false || undefined, onchange: (e) => { f[key] = e.target.checked; } }), ` ${label}`]);
  el.append(h('section.sec', [h('h3.sec-title', '残す規則（分解より優先）'), h('div', { style: { display: 'flex', flexDirection: 'column' } }, [
    chk('keepSpecial', 'ユニーク・セット・ミシックは必ず残す'),
    chk('keepAncient', '覚醒・極致は必ず残す（分解すると極致の核）'),
    chk('keepSocketWhite', 'ルーン語に使えるソケット数のノーマルは残す'),
    h('label.chk', [h('input', { type: 'checkbox', checked: f.keepUpgrades || undefined, onchange: (e) => { f.keepUpgrades = e.target.checked; } }), ' 今より強くなりそうな物は分解しない']),
    h('label.chk', [h('input', { type: 'checkbox', checked: f.autoEquip || undefined, onchange: (e) => { f.autoEquip = e.target.checked; } }), ' 強くなる物は自動で装備する（放置向け）']),
  ])]));
  // 欲しい能力
  const want = new Set(f.wantStats || []);
  const chips = WANT.map((s) => h(`span.ik-chip.${want.has(s) ? 'on' : 'off'}`, { onclick: () => { if (want.has(s)) want.delete(s); else want.add(s); f.wantStats = [...want]; rerender(); } }, WANT_LABEL[s] || statDef(s).name));
  el.append(h('section.sec', [
    h('h3.sec-title', ['この能力が付いていたら残す', h('span.sec-right', [
      '必要な数 ',
      h('select', { onchange: (e) => { f.wantMin = Number(e.target.value); } }, [1, 2, 3, 4].map((k) => h('option', { value: k, selected: (f.wantMin || 2) === k || undefined }, `${k} 個以上`))),
    ])]),
    h('div.ik-chips', chips),
    h('div.hint', want.size ? `選んだ ${want.size} 種のうち ${f.wantMin || 2} 個以上が付いている物は、分解するレアリティでも残します。` : '押して選ぶ（もう一度押すと外す）。'),
  ]));
  el.append(luckMeters(g));
}
