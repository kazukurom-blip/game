// 鍛冶（強化・段上げ・付け替え・混沌・昇格・祝福・穿孔・堕落）を 1 つの窓に。上で装備を見て、真ん中で操作、下で装備を選ぶ。
// 担当: アイテム担当

import { h, button } from '../dom.js';
import { itemCard, modLine } from '../tooltip.js';
import { fmt } from '../../engine/format.js';
import { AFFIX } from '../../data/items.js';
import { RARITY } from '../../data/rarity.js';
import { ENH_RATE, ENH_MAX, ENH_MILESTONES } from '../../game/systems/crafting.js';
import { ensureCss, selectItem, selectedItem, itemPicker, costRow } from './itemkit.js';
import { itemName } from '../../game/items.js';
import { shownValue } from '../../game/content/items/itemlib.js';

const OPS = [
  { id: 'enhance', name: '強化', help: '+0〜+20。武器ダメージ・アーマーとオプションの数値が上がる。失敗しても壊れず、下がらない。' },
  { id: 'tier', name: '段上げ', help: '鍛造値（FP）を使ってオプション 1 行の段を 1 つ上げる。5% で大成功（FP を使わず 2 段）。' },
  { id: 'reroll', name: '付け替え', help: '1 行を選んで、新しい候補 2 つ（＋そのまま）から選ぶ。2 回目からは同じ行だけ。' },
  { id: 'chaos', name: '混沌', help: 'レア・エピックのオプションをすべて振り直す（行の数はそのまま）。' },
  { id: 'ascend', name: '昇格', help: 'マジック → レア → エピックへ。オプションが増える。' },
  { id: 'bless', name: '祝福', help: '段はそのままに、数値だけ振り直す。ユニークの固定オプションにも使える。' },
  { id: 'drill', name: '穿孔', help: 'ソケットを 1 つ開ける（武器 3・胴/頭/脚 2・ほか 1 まで）。' },
  { id: 'corrupt', name: '堕落', help: '最後の賭け。4 通りの結果が 25% ずつ。以後その装備は二度と変えられない。' },
];
let op = 'enhance';
let affIdx = 0;
let lastResult = null;

export const craftPanel = {
  id: 'craft', name: '鍛冶', icon: '⚒',
  refreshOn: ['inv', 'gear', 'level', 'stats', 'world'],
  visible: () => true,
  help: '装備を下から選び、上のタブで作業を選びます。どの作業も費用と確率を先に表示します。<br>素材は分解・エリート・ボスから。足りない素材は赤く表示されます。',
  render(ui, el) {
    ensureCss();
    const g = ui.game;
    const found = selectedItem(g, 'craft');
    const item = found?.item || null;
    el.append(h('div.tabs', OPS.map((o) => h(`button.tab${op === o.id ? '.on' : ''}`, { onclick: () => { op = o.id; lastResult = null; ui.renderPanel(); } }, o.name))));
    const cur = OPS.find((o) => o.id === op);
    el.append(h('p.hint', cur.help));
    if (item) el.append(h('div.ik-sel', itemCard(g, item, { compare: false, equipped: found.where === 'equip' })));
    else el.append(h('div.ik-empty', '下の一覧から装備を選んでください（装備中の物もそのまま鍛えられます）'));
    if (item) {
      try { el.append(OP_RENDER[op](ui, item)); } catch (e) { console.error(e); el.append(h('div.bad', e.message)); }
    }
    if (lastResult && lastResult.uid === item?.uid) el.append(h('div.ik-result', [h('div.t', lastResult.text)]));
    el.append(itemPicker(ui, {
      key: 'craft', selected: item?.uid,
      filter: (it) => it.rarity !== 'common' || it.sockets?.length || op === 'enhance' || op === 'drill' || op === 'corrupt',
      onPick: (it) => { selectItem('craft', it.uid); affIdx = 0; lastResult = null; },
      hint: '押すと選ぶ',
    }));
  },
};

function act(ui, uid, fn, okText) {
  const r = fn();
  if (!r.ok) { ui.toast(r.msg || 'できなかった', 'bad'); return r; }
  const text = typeof okText === 'function' ? okText(r) : okText;
  if (text) { lastResult = { uid, text }; ui.toast(text, r.success === false ? '' : 'good'); }
  ui.renderPanel();
  return r;
}

function opBox(title, children) { return h('div.ik-op', [h('h4', title), ...children]); }

/** オプションの行を選べる一覧 */
function affList(ui, item, { locked = null, disabled = () => false, extra = () => null } = {}) {
  return h('div', (item.affixes || []).map((a, i) => {
    const af = AFFIX[a.id];
    const dis = disabled(i) || (locked !== null && locked !== i);
    const row = h(`div.ik-aff${i === affIdx ? '.on' : ''}${dis ? '.lock' : ''}${a.g ? '.greater' : ''}`, { onclick: () => { if (dis) return; affIdx = i; ui.renderPanel(); } }, [
      a.g ? h('span.star', '★') : null,
      modLine({ s: a.s, v: shownValue(item, a.v) }).textContent,
      extra(i),
      h('span.tier', af ? `T${af.tiers.length - a.t}` : ''),
    ]);
    return row;
  }));
}

const OP_RENDER = {
  enhance(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    const info = c.enhanceInfo(item);
    const cur = item.enh || 0;
    const rate = h('div.ik-rate', ENH_RATE.map((p, i) => h(`div${i === cur ? '.cur' : i < cur ? '.done' : ''}`, [h('b', `+${i + 1}`), `${p}%`])));
    if (!info.ok) return opBox(`強化 +${cur}`, [h('p', info.msg), rate]);
    const left = info.need ? Math.max(0, info.need - info.pity) : 0;
    const children = [
      h('div.ik-flow', [h('span.ik-big', `+${info.cur}`), h('span.ik-arrow', '→'), h('span.ik-big', [`+${info.next}`, h('small', `成功率 ${info.chance}%`)])]),
      info.need ? h('p', `天井 ${info.pity} / ${info.need}（失敗 1 回ごとに成功率 +${Math.round(info.base * 0.1 * 10) / 10}%、${left === 0 ? '次は必ず成功' : `あと ${left} 回の失敗で必ず成功`}）`) : h('p', 'この段階は必ず成功する。'),
      info.milestone ? h('p', { style: { color: '#ffd27a' } }, `★ ${info.milestone}`) : null,
      costRow(g, info.cost),
      rate,
      h('div.ik-actions', [
        button('強化する', () => act(ui, item.uid, () => c.enhance(item.uid), (r) => (r.success ? `成功！ +${r.enh}${r.bonus ? `（${r.bonus}）` : ''}` : `失敗…（天井 ${r.pity}/${r.need}）壊れず、下がりません`)), { kind: 'primary', disabled: !!info.missing.length }),
        button('成功するまで続ける', () => {
          let n = 0; let r;
          do { r = c.enhance(item.uid); n++; } while (r.ok && r.success === false && n < 60);
          if (!r.ok && n === 1) { ui.toast(r.msg, 'bad'); return; }
          lastResult = { uid: item.uid, text: r.ok && r.success ? `${n} 回目で成功！ +${r.enh}${r.bonus ? `（${r.bonus}）` : ''}` : `${n} 回試した（${r.msg || '素材が尽きた'}）` };
          ui.toast(lastResult.text, r.ok && r.success ? 'good' : '');
          ui.renderPanel();
        }, { disabled: !!info.missing.length }),
      ]),
      h('div.hint', Object.entries(ENH_MILESTONES).map(([k, t]) => `${t}`).join('　')),
    ];
    return opBox('強化', children);
  },

  tier(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    if (!item.affixes?.length) return opBox('段上げ', [h('p', 'オプションの無い装備は段上げできない。')]);
    if (affIdx >= item.affixes.length) affIdx = 0;
    const info = c.tierUpInfo(item, affIdx);
    const children = [
      h('div.ik-sub', [h('span', '鍛造値（FP）'), h('b', String(item.fp ?? '—'))]),
      affList(ui, item),
    ];
    if (!info.ok) children.push(h('p.bad', info.msg));
    else {
      children.push(
        h('div.ik-flow', [h('span.ik-big', `T${info.from}`), h('span.ik-arrow', '→'), h('span.ik-big', [`T${info.to}`, h('small', `FP ${info.fpMin}〜${info.fpMax} を使う・大成功 ${info.crit}%`)])]),
        h('p', '数値は段の中の位置（ロール）を保ったまま上がる。大成功なら FP を使わず 2 段上がる。'),
        costRow(g, info.cost),
        h('div.ik-actions', [button('段を上げる', () => act(ui, item.uid, () => c.tierUp(item.uid, affIdx), (r) => (r.crit ? `大成功！ 2 段上がって T${r.tier}（FP 0）` : `T${r.tier} になった（FP -${r.used}）`)), { kind: 'primary', disabled: !!info.missing.length })]),
      );
    }
    return opBox('段上げ', children);
  },

  reroll(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    if (!item.affixes?.length) return opBox('付け替え', [h('p', 'オプションの無い装備は付け替えられない。')]);
    if (item.rr) affIdx = item.rr.i;
    if (affIdx >= item.affixes.length) affIdx = 0;
    const pend = item.rrPending;
    const children = [affList(ui, item, { locked: item.rr?.i ?? null })];
    if (pend) {
      const cur = item.affixes[pend.i];
      const choice = (a, k, keep = false) => {
        const af = AFFIX[a.id];
        return h(`div.ik-choice${keep ? '.keep' : ''}`, [modLine({ s: a.s, v: shownValue(item, a.v) }), h('span.dim.small', af ? `T${af.tiers.length - a.t}` : ''), button(keep ? 'そのまま' : 'これにする', () => act(ui, item.uid, () => c.rerollChoose(item.uid, k), keep ? '元のオプションを残した' : '付け替えた'), { kind: keep ? 'small' : 'primary' })]);
      };
      children.push(h('p', { style: { color: '#ffd27a' } }, '候補から 1 つ選んでください（選ぶまで残ります）'), h('div.ik-choices', [...pend.opts.map((a, k) => choice(a, k)), choice(cur, 2, true)]));
      return opBox('付け替え', children);
    }
    const info = c.rerollInfo(item, affIdx);
    if (!info.ok) children.push(h('p.bad', info.msg));
    else {
      children.push(
        h('p', item.rr ? `この装備は ${item.rr.i + 1} 行目だけ付け替えられる（${info.count} 回目・費用は 1 回ごとに ×1.25、10 回で頭打ち）` : '選んだ行を付け替える。一度付け替えると、以後はこの行だけになる。'),
        costRow(g, info.cost),
        h('div.ik-actions', [button('候補を出す', () => act(ui, item.uid, () => c.rerollRoll(item.uid, affIdx), null), { kind: 'primary', disabled: !!info.missing.length })]),
      );
    }
    return opBox('付け替え', children);
  },

  chaos(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    const info = c.chaosInfo(item);
    if (!info.ok) return opBox('混沌', [h('p.bad', info.msg)]);
    return opBox('混沌', [
      h('p', `${info.count} 行のオプションを、すべて新しく振り直す。名前も変わる。付け替えの行の固定は外れる。`),
      costRow(g, info.cost),
      h('div.ik-actions', [button('振り直す', () => act(ui, item.uid, () => c.chaos(item.uid), 'オプションを振り直した'), { kind: 'primary', disabled: !!info.missing.length })]),
    ]);
  },

  ascend(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    const info = c.ascendInfo(item);
    if (!info.ok) return opBox('昇格', [h('p.bad', info.msg)]);
    const r0 = RARITY[item.rarity]; const r1 = RARITY[info.next];
    return opBox('昇格', [
      h('div.ik-flow', [h('span.ik-big', { style: { color: r0.color } }, r0.name), h('span.ik-arrow', '→'), h('span.ik-big', { style: { color: r1.color } }, r1.name)]),
      h('p', `オプションが ${info.add[0]}〜${info.add[1]} 行増える。${info.next === 'rare' ? '鍛造値（FP 20〜50）も付く。' : ''}`),
      costRow(g, info.cost),
      h('div.ik-actions', [button('昇格する', () => act(ui, item.uid, () => c.ascend(item.uid), (r) => `${RARITY[r.rarity].name}になった！`), { kind: 'primary', disabled: !!info.missing.length })]),
    ]);
  },

  bless(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    const info = c.blessInfo(item);
    if (!info.ok) return opBox('祝福', [h('p.bad', info.msg)]);
    return opBox('祝福', [
      h('p', 'オプションの段（T）はそのままに、それぞれの数値を段の範囲の中で振り直す。ユニークの固定オプションも振り直す（伝説の力の強さは変わらない）。'),
      costRow(g, info.cost),
      h('div.ik-actions', [button('祝福する', () => act(ui, item.uid, () => c.bless(item.uid), '数値を振り直した'), { kind: 'primary', disabled: !!info.missing.length })]),
    ]);
  },

  drill(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    const info = c.drillInfo(item);
    const have = item.sockets?.length || 0;
    const dots = h('div.ik-flow', Array.from({ length: info.max || have || 1 }, (_, i) => h('span', { style: { fontSize: '22px', color: i < have ? '#ff6ad0' : '#4a4252' } }, i < have ? '◆' : '◇')));
    if (!info.ok) return opBox('穿孔', [dots, h('p.bad', info.msg)]);
    return opBox('穿孔', [
      dots,
      h('p', `ソケット ${info.have} → ${info.have + 1}（この部位は ${info.max} まで）。開けたソケットには宝石・ルーンをはめられる（宝石の窓）。ノーマルの装備に開ければルーン語の土台になる。`),
      costRow(g, info.cost),
      h('div.ik-actions', [button('ソケットを開ける', () => act(ui, item.uid, () => c.drill(item.uid), (r) => `ソケットが ${r.sockets} つになった`), { kind: 'primary', disabled: !!info.missing.length })]),
    ]);
  },

  corrupt(ui, item) {
    const g = ui.game;
    const c = g.sys.crafting;
    const info = c.corruptInfo(item);
    if (!info.ok) return opBox('堕落', [h('p.bad', info.msg)]);
    return opBox('堕落（最後の賭け）', [
      h('div', info.outcomes.map((o, i) => h('div.ik-sub', [h('span', `${'①②③④'[i]} ${o.text}`), h('b', `${o.pct}%`)]))),
      h('p.bad', '堕落した装備は、強化・付け替え・振り直し・穿孔が二度とできなくなる（宝石の付け外しはできる）。'),
      costRow(g, info.cost),
      h('div.ik-actions', [button('堕落させる', async () => {
        const okk = await ui.confirm(`「${itemName(item)}」を堕落させます。結果は選べず、以後この装備は変えられません。`, '堕落させる');
        if (!okk) return;
        act(ui, item.uid, () => c.corrupt(item.uid), (r) => `堕落: ${r.outcomeText}`);
      }, { kind: 'danger', disabled: !!info.missing.length })]),
    ]);
  },
};

export { ENH_MAX, fmt };
