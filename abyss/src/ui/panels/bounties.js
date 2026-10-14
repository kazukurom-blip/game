// 日課の窓: ログインの贈り物（7 日で 1 巡り）・毎日 3 つの日課（3 日まで繰り越し）・毎週 1 つの週課。担当: メタ担当。

import { h, button, injectCss } from '../dom.js';
import { fmt, fmtInt } from '../../engine/format.js';
import { EGG } from '../../data/pets.js';
import { dayNum, localWeek } from '../../game/systems/bounties.js';
import { matChips, bar, live, setBar } from '../metaui.js';

const SHORT = { dust: '魔塵', crystal: '秘晶', echo: '残響', core: '核', shard: '欠片', scrap: '鉄屑' };

export const bountiesPanel = {
  id: 'bounties', name: '日課', icon: '📜',
  refreshOn: ['meta:bounties'],
  help: '<p>日課は毎日 3 つ。普段の放置で自然に進みます（離れていた間の稼ぎでも進みます）。受け取らなかった日課は 3 日まで残ります。</p><p>週課は毎週月曜に変わる大きな目標で、熾火の卵が必ずもらえます。</p><p>ログインの贈り物は 1 日 1 回。7 日で 1 巡りし、日を空けても罰はありません。</p>',
  badge: (g) => g.sys.bounties?.claimable?.() || 0,
  render(ui, el) {
    injectCss('meta-bounty', CSS);
    const g = ui.game; const sys = g.sys.bounties;
    sys.refresh();
    sys.update();
    // ログイン
    const li = sys.loginInfo();
    const cal = h('div.bt-cal', li.rewards.map((r, i) => {
      const st = i < li.idx ? 'past' : i === li.idx ? (li.can ? 'now' : 'got') : 'future';
      const rw = sys.loginReward(i);
      // 7 つ並ぶので幅が狭い。ゴールドは 💰 の絵で分かるので「G」は説明（title）にだけ付ける
      const val = rw.gold ? fmtInt(rw.gold) : rw.mats ? Object.entries(rw.mats).map(([k, v]) => `${SHORT[k] || k}${v}`).join(' ') : '';
      return h(`div.bt-day.${st}`, { title: `${r.name}: ${r.desc}${val ? `（${val}${rw.gold ? ' G' : ''}）` : ''}` }, [h('div.bt-dn', r.name), h('div.bt-ic', r.egg ? '🥚' : r.gold ? '💰' : '💎'), h('div.bt-dd', r.desc), h('div.bt-dv', val)]);
    }));
    el.append(h('div.mt-box', [
      h('h4', ['ログインの贈り物', h('span.dim.small', `　これまで ${li.total} 回`)]),
      cal,
      h('div.bt-foot', [li.can ? button('今日の贈り物を受け取る', () => { const r = sys.claimLogin(); if (r) ui.toast(`受け取った: ${rewardText(r)}`, 'good'); ui.renderPanel(); }, { kind: 'primary' }) : h('span.dim', '今日の分は受け取りました。また明日。')]),
    ]));
    // 日課
    const list = sys.list();
    const today = sys.today();
    const anyClaim = sys.claimable() > (li.can ? 1 : 0);
    el.append(h('h3.sec-title', ['日課', anyClaim ? button('まとめて受け取る', () => { const out = sys.claimAll(); ui.toast(`${out.filter(Boolean).length} 個の報酬を受け取った`, 'good'); ui.renderPanel(); }, { kind: 'small' }) : h('span.sec-right', `毎日 0 時に 3 つ`)]));
    const box = h('div.mt-list');
    const updaters = [];
    for (const b of [...list].sort((a, c) => dayNum(c.day) - dayNum(a.day))) box.append(bountyRow(ui, b, today, updaters));
    if (!list.length) box.append(h('div.mt-lock', '今日の日課はすべて受け取りました。'));
    el.append(box);
    // 週課
    const w = sys.weekly();
    if (w) {
      el.append(h('h3.sec-title', ['週課', h('span.sec-right', `${localWeek(sys.nowFn())} からの週`)]));
      el.append(h('div.mt-list', bountyRow(ui, w, today, updaters, true)));
    }
    const lifeDone = g.state.meta.record?.bountiesDone || 0;
    el.append(h('div.hint', `これまでに達成した日課・週課: ${lifeDone} 回。進み具合は自動で数えます（自動の分解・放置の稼ぎも含む）。`));
    live(el, 1000, () => { sys.update(); for (const f of updaters) f(); });
  },
};

function rewardText(got) {
  const parts = [];
  if (got.gold) parts.push(`${fmtInt(got.gold)} G`);
  for (const [k, v] of Object.entries(got.mats || {})) parts.push(`${{ dust: '魔塵', crystal: '秘晶', echo: '残響', core: '極致の核', shard: '欠片', scrap: '鉄屑' }[k] || k} ×${v}`);
  for (const k of Object.keys(got.eggs || {})) parts.push(EGG[k]?.name || k);
  for (const gm of got.gems || []) parts.push(gm?.name || '宝石');
  return parts.join('・') || 'なし';
}

function rewardView(r) {
  return h('div.bt-rw', [
    h('span.bt-chest', r.chest || '宝箱'),
    r.gold ? h('span.mt-chip', [h('i', { style: { background: '#f5d98a' } }), h('b', `${fmtInt(r.gold)} G`)]) : null,
    matChips(r.mats),
    r.egg ? h('span.mt-chip.egg', `🥚 ${EGG[r.egg]?.name || r.egg}`) : null,
    r.gem ? h('span.mt-chip', `◆ 宝石（段階 ${r.gem}）`) : null,
  ]);
}

function bountyRow(ui, b, today, updaters, weekly = false) {
  const sys = ui.game.sys.bounties;
  const age = dayNum(today) - dayNum(b.day);
  const tag = weekly ? '週課' : age <= 0 ? '今日' : age === 1 ? '昨日の分' : `${age} 日前の分（あと ${Math.max(0, 3 - age)} 日）`;
  const pb = bar((b.prog / b.target) * 100, `${fmtInt(b.prog)} / ${fmt(b.target)}`, b.done ? 'good' : 'gold');
  const btn = button(b.claimed ? '受け取りずみ' : b.done ? '受け取る' : 'まだ', () => {
    const r = sys.claim(b.uid);
    if (r) ui.toast(`受け取った: ${rewardText(r)}`, 'good');
    ui.renderPanel();
  }, { kind: b.done && !b.claimed ? 'primary' : 'small', disabled: !b.done || b.claimed });
  updaters.push(() => {
    setBar(pb, (b.prog / b.target) * 100, `${fmtInt(b.prog)} / ${fmt(b.target)}`);
    if (b.done && !b.claimed && btn.disabled) { ui.renderPanel(); }
  });
  return h(`div.bt-row${b.done ? '.done' : ''}${b.claimed ? '.claimed' : ''}${weekly ? '.weekly' : ''}`, [
    h('div.mt-grow', [
      h('div.bt-t', [h('b', sys.title(b)), h('span.bt-tag', tag)]),
      h('div.bt-d', sys.desc(b)),
      pb,
      rewardView(b.reward),
    ]),
    btn,
  ]);
}

const CSS = `
.bt-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin: 6px 0; }
.bt-day { border: 1px solid var(--line); border-radius: 8px; padding: 5px 2px; text-align: center; background: #120f16; min-width: 0; }
.bt-day.now { border-color: var(--gold); box-shadow: 0 0 12px rgba(217,180,90,.35); background: linear-gradient(#2a2010, #120f16); animation: btp 1.6s infinite; }
.bt-day.got, .bt-day.past { opacity: .5; }
.bt-day.got .bt-ic::after, .bt-day.past .bt-ic::after { content: '✓'; color: var(--good); margin-left: 2px; font-size: 12px; }
@keyframes btp { 50% { box-shadow: 0 0 20px rgba(217,180,90,.6); } }
.bt-dn { font-size: 10px; color: var(--dim); }
.bt-ic { font-size: 20px; }
.bt-dd { font-size: 9.5px; color: var(--text); line-height: 1.25; min-height: 2.5em; overflow-wrap: anywhere; }
.bt-dv { font-size: 10px; color: var(--gold2); line-height: 1.25; word-break: keep-all; overflow-wrap: anywhere; }
.bt-foot { display: flex; justify-content: center; margin-top: 4px; }
.bt-row { display: flex; gap: 10px; align-items: center; background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.bt-row.done:not(.claimed) { border-color: var(--good); box-shadow: 0 0 10px rgba(110,224,138,.18); }
.bt-row.claimed { opacity: .5; }
.bt-row.weekly { border-color: #6a4a1a; background: linear-gradient(120deg, #241a10, #120f16 60%); }
.bt-t { display: flex; gap: 8px; align-items: baseline; }
.bt-t b { color: var(--gold2); }
.bt-tag { font-size: 10.5px; color: var(--dim); border: 1px solid #3a3142; border-radius: 4px; padding: 0 5px; }
.bt-d { font-size: 12.5px; margin: 2px 0 4px; }
.bt-rw { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; margin-top: 5px; font-size: 11.5px; }
.bt-chest { color: #e8c88a; font-size: 11px; }
.mt-chip.egg { color: #e0b0ff; }
@media (max-width: 900px) { .bt-dd { display: none; } }
`;
