// 実績の窓: 種類ごとの一覧と進み具合・実績ポイントの効果・称号を選ぶ。担当: メタ担当。

import { h, button, injectCss } from '../dom.js';
import { fmt } from '../../engine/format.js';
import { ACHIEVEMENTS, ACH_CATEGORIES, POINT_BONUS, TITLES, TITLE, ACH } from '../../data/achievements.js';
import { describeMod } from '../../data/stats.js';
import { tabs, card, bar } from '../metaui.js';

let cat = 'combat';
let filter = 'all';

const MEDAL = ['#8a6a4a', '#b07a4a', '#c0c8d0', '#e8c060', '#7ad0ff', '#c890ff', '#ff8a5a', '#ff4d6d'];

export const achievementsPanel = {
  id: 'achievements', name: '実績', icon: '🏆',
  refreshOn: ['meta:achievements', 'meta:title'],
  help: '<p>遊んでいるうちに自然に達成できる実績が 215 個あります（秘密の実績もあります）。</p><p>達成すると<b>実績ポイント</b>がたまり、1 ポイントごとに全ダメージ・ライフ・ゴールド・経験値・レア発見率が少しずつ上がり続けます。</p><p>一部の実績では<b>称号</b>がもらえます。称号は 1 つだけ選べ、小さな効果があります。</p>',
  badge: (g) => g.state.meta.ach?.unseen?.length || 0,
  render(ui, el) {
    const g = ui.game; const sys = g.sys.achievements; const st = g.state;
    injectCss('meta-ach', CSS);
    const got = st.meta.achievements;
    const pts = sys.points();
    const mul = sys.pointMul();
    const unseen = new Set(st.meta.ach.unseen || []);
    el.append(h('div.mt-cards', [
      card('達成', `${sys.unlockedCount()} / ${ACHIEVEMENTS.length}`, `${Math.round((sys.unlockedCount() / ACHIEVEMENTS.length) * 100)}%`),
      card('実績ポイント', fmt(pts), mul > 1 ? `効果 ×${mul.toFixed(2)}` : '1 pt ごとに永続の強化'),
      card('称号', st.hero.title ? TITLE[st.hero.title]?.name || 'なし' : 'なし', `${sys.titles().length} / ${TITLES.length} 個`),
    ]));
    el.append(h('div.ac-bonus', [h('span.dim', 'ポイントの効果: '), POINT_BONUS.map((b) => h('span.ac-b', describeMod({ s: b.s, v: Math.round(b.v * pts * mul * 100) / 100 })))]));
    const catList = [...ACH_CATEGORIES.map((c) => {
      const all = ACHIEVEMENTS.filter((a) => a.cat === c.id);
      const n = all.filter((a) => unseen.has(a.id)).length;
      return [c.id, `${c.icon} ${c.name} ${all.filter((a) => got[a.id]).length}/${all.length}`, n];
    }), ['titles', `🎖 称号 ${sys.titles().length}/${TITLES.length}`]];
    el.append(tabs(catList, cat, (id) => { cat = id; ui.renderPanel(); }));
    if (cat === 'titles') { renderTitles(ui, el); return; }
    el.append(h('div.tabs.small', [['all', 'すべて'], ['todo', 'まだ'], ['done', '達成ずみ']].map(([id, n]) => h(`button.tab${filter === id ? '.on' : ''}`, { onclick: () => { filter = id; ui.renderPanel(); } }, n))));
    const list = h('div.ac-list');
    let shown = 0;
    for (const d of ACHIEVEMENTS.filter((a) => a.cat === cat)) {
      const done = !!got[d.id];
      if (filter === 'todo' && done) continue;
      if (filter === 'done' && !done) continue;
      const hidden = d.secret && !done;
      const pr = sys.progress(d);
      const col = MEDAL[Math.min(MEDAL.length - 1, (d.tier || 1) - 1)];
      list.append(h(`div.ac-row${done ? '.done' : ''}${unseen.has(d.id) ? '.new' : ''}`, [
        h(`div.mt-medal${done ? '' : '.off'}`, { style: `--mc:${d.secret ? '#c77dff' : col}` }, hidden ? '？' : String(d.tier || 1)),
        h('div.ac-main', [
          h('div.ac-name', [hidden ? '？？？' : d.name, d.title && TITLE[d.title] ? h('span.ac-title', `称号「${TITLE[d.title].name}」`) : null]),
          h('div.ac-desc', hidden ? '秘密の実績。条件は達成するまで分かりません。' : d.desc),
          !done && !hidden ? bar(pr.pct, `${fmt(Math.min(pr.cur, d.n))} / ${fmt(d.n)}`, 'gold') : null,
          done ? h('div.ac-when', `${new Date(got[d.id]).toLocaleDateString('ja-JP')} に達成`) : null,
        ]),
        h('div.ac-pts', [h('b', `${d.points}`), h('small', 'pt')]),
      ]));
      shown++;
    }
    if (!shown) list.append(h('div.mt-lock', filter === 'done' ? 'まだ達成した実績がありません。' : 'すべて達成しました！'));
    el.append(list);
    // 開いた種類の「新しい」印を消す
    const left = (st.meta.ach.unseen || []).filter((id) => ACH[id]?.cat !== cat);
    if (left.length !== (st.meta.ach.unseen || []).length) { st.meta.ach.unseen = left; ui.refreshNav(); }
  },
};

function renderTitles(ui, el) {
  const g = ui.game; const sys = g.sys.achievements; const st = g.state;
  const have = new Set(sys.titles().map((t) => t.id));
  el.append(h('p.hint', '称号は 1 つだけ選べます。選んだ称号の効果が効きます。'));
  const list = h('div.ac-titles');
  list.append(h(`div.ac-trow${!st.hero.title ? '.on' : ''}`, [h('div.mt-grow', [h('b', '称号なし')]), button(st.hero.title ? '外す' : '選択中', () => { sys.setTitle(null); ui.renderPanel(); }, { kind: 'small', disabled: !st.hero.title })]));
  for (const t of TITLES) {
    const ok = have.has(t.id);
    const from = ACHIEVEMENTS.find((a) => a.title === t.id);
    const on = st.hero.title === t.id;
    list.append(h(`div.ac-trow${on ? '.on' : ''}${ok ? '' : '.lock'}`, [
      h('div.mt-grow', [h('b', ok ? t.name : '？？？'), h('div.small', t.desc), h('div.dim.small', ok ? `実績「${from?.name}」` : from?.secret ? '秘密の実績で手に入る' : `実績「${from?.name}」（${from?.desc}）で手に入る`)]),
      ok ? button(on ? '選択中' : '選ぶ', () => { sys.setTitle(t.id); ui.toast(`称号「${t.name}」を選んだ`, 'good'); ui.renderPanel(); }, { kind: on ? 'small' : 'primary', disabled: on }) : h('span.dim', '🔒'),
    ]));
  }
  el.append(list);
}

const CSS = `
.ac-bonus { font-size: 12px; margin: -2px 0 8px; display: flex; flex-wrap: wrap; gap: 3px 10px; }
.ac-b { color: var(--good); }
.ac-list { display: flex; flex-direction: column; }
.ac-row { display: grid; grid-template-columns: 34px 1fr auto; gap: 9px; padding: 7px 6px; border-bottom: 1px solid #221d28; align-items: center; }
.ac-row.done { background: linear-gradient(90deg, rgba(217,180,90,.07), transparent 70%); }
.ac-row.new { background: linear-gradient(90deg, rgba(110,224,138,.14), transparent 70%); }
.ac-row.new .ac-name::after { content: 'NEW'; margin-left: 6px; font-size: 9px; color: #fff; background: #2a8a4a; border-radius: 4px; padding: 0 4px; }
.ac-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ac-name { font-weight: 700; color: var(--gold2); font-size: 13px; }
.ac-row:not(.done) .ac-name { color: var(--text); }
.ac-title { margin-left: 6px; font-size: 10.5px; color: #ffcf7a; border: 1px solid #6a4a1a; border-radius: 4px; padding: 0 4px; font-weight: 400; }
.ac-desc { font-size: 12px; color: var(--dim); }
.ac-when { font-size: 10.5px; color: #8a7a5a; }
.ac-pts { text-align: right; color: var(--gold2); } .ac-pts b { font-size: 16px; } .ac-pts small { color: var(--dim); margin-left: 1px; }
.ac-titles { display: flex; flex-direction: column; gap: 5px; }
.ac-trow { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: #120f16; border: 1px solid var(--line); border-radius: 8px; }
.ac-trow.on { border-color: var(--gold); box-shadow: 0 0 10px rgba(217,180,90,.2); }
.ac-trow.lock { opacity: .55; }
.ac-trow b { color: var(--gold2); }
`;
