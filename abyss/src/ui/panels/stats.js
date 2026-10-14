// 記録の窓: 一生の記録・この周回の記録・能力の詳しい内訳（どこから来た効果か）・スキル別のダメージ（DPS の内訳）。担当: メタ担当。

import { h, injectCss } from '../dom.js';
import { fmt, fmtInt, fmtPct, fmtTime, roman } from '../../engine/format.js';
import { STATS, statDef, describeMod } from '../../data/stats.js';
import { RARITIES } from '../../data/rarity.js';
import { SLOT_NAMES } from '../../data/items.js';
import { FAMILIES } from '../../data/monsters.js';
import { SKILL } from '../../data/skills.js';
import { ZONES } from '../../data/world.js';
import { tabs, card, bar, live } from '../metaui.js';

let view = 'record';
let showAll = false;

const CAT_NAMES = { attr: '基本の能力', offense: '攻め', defense: '守り', utility: '便利', minion: '召喚物', other: 'そのほか' };
export const SOURCE_NAMES = {
  class: 'クラス', level: 'レベル', prestige: '魂の祭壇', achievements: '実績ポイント', title: '称号', bestiary: '魔物図鑑', treasure: '宝物図鑑',
  pet: '連れているペット', petOwn: 'ペットの所持効果', pets: 'ペット', tree: '星座盤', paragon: 'アビスLv', codex: '力の書庫', items: '伝説の力', set: 'セット効果', sets: 'セット効果',
  gems: '宝石', buff: '強化・バフ', ring1: '指輪（左）', ring2: '指輪（右）',
};
export const srcName = (s) => SOURCE_NAMES[s] || SLOT_NAMES[s] || s || '強化・バフ';

export const statsPanel = {
  id: 'stats', name: '記録', icon: '📊',
  refreshOn: ['gear', 'level', 'stats'],
  visible: () => true,
  render(ui, el) {
    injectCss('meta-stats', CSS);
    el.append(tabs([['record', '記録'], ['sheet', '能力の内訳'], ['skills', 'スキル別']], view, (id) => { view = id; ui.renderPanel(); }));
    if (view === 'sheet') renderSheet(ui, el);
    else if (view === 'skills') renderSkills(ui, el);
    else renderRecord(ui, el);
  },
};

function kv(rows) { return h('table.kv', rows.filter(Boolean).map(([k, v]) => h('tr', [h('th', k), h('td', v)]))); }

function renderRecord(ui, el) {
  const g = ui.game; const st = g.state; const s = st.meta.stats; const r = st.meta.record || {}; const w = st.world; const p = st.meta.prestige;
  const lifeKills = s.kills - (p?.life?.kills0 || 0);
  const lifeSec = (st.playTime || 0) - (p?.life?.start || 0);
  el.append(h('div.mt-cards', [
    card('遊んだ時間', fmtTime(st.playTime, true), `放置 ${fmtTime(s.offlineSec, true)}`),
    card('倒した敵', fmt(s.kills), `1 分あたり ${(g.sys.offline.rates().kills * 60).toFixed(0)} 体`),
    card('稼いだゴールド', fmtInt(s.goldEarned), `いま ${fmtInt(st.meta.gold)}`),
    card('最大の一撃', fmtInt(s.highestHit || 0)),
  ]));
  if (st.meta.rebirths > 0 || p?.unlocked) {
    el.append(h('h3.sec-title', 'この周回'));
    el.append(kv([['時間', fmtTime(lifeSec, true)], ['倒した敵', fmt(lifeKills)], ['最高のエリア Lv', String(p?.life?.maxLevel || 0)], ['稼いだゴールド', fmtInt(s.goldEarned - (p?.life?.gold0 || 0))]]));
  }
  const cols = h('div.st-cols');
  cols.append(h('div', [h('h3.sec-title', '戦い'), kv([
    ['倒した敵', fmt(s.kills)], ['エリート', fmt(s.elites)], ['ボス', fmt(s.bosses)], ['ため込み屋', fmt(Math.max(s.goblins || 0, r.goblins || 0))], ['倒れた回数', fmt(s.deaths)],
  ])]));
  cols.append(h('div', [h('h3.sec-title', '冒険'), kv([
    ['踏破した地域', `${Object.keys(w.cleared || {}).length}`], ['一番奥の地域', ZONES[p?.bestZone > (w.maxZone || 0) ? p.bestZone : w.maxZone || 0]?.name || '-'], ['クリアしたステージ', fmt(r.stages || 0)],
    ['魔境の最高', w.maxTorment ? roman(w.maxTorment) : '-'], ['裂け目の最高', w.rift?.best ? `段階 ${w.rift.best}（${w.rift.runs || 0} 回）` : '-'],
  ])]));
  cols.append(h('div', [h('h3.sec-title', '戦利品'), kv([
    ...RARITIES.map((x) => [h('span', { style: { color: x.color } }, x.name), fmt(s.itemsFound?.[x.id] || 0)]),
    ['覚醒 / 極致', `${fmt(r.ancient || 0)} / ${fmt(r.primal || 0)}`], ['分解した数', fmt(s.salvaged)],
  ])]));
  cols.append(h('div', [h('h3.sec-title', '暮らし'), kv([
    ['鍛冶', `${fmt(Math.max(s.crafted || 0, r.crafted || 0))} 回（最高 +${r.maxEnh || 0}）`], ['転生 / 超越', `${st.meta.rebirths} 回 / ${p?.transcends || 0} 回`], ['集めた魂', fmt(st.meta.totalSouls)],
    ['日課・週課', `${fmt(r.bountiesDone || 0)} 回`], ['ログインの贈り物', `${fmt(r.logins || 0)} 回`], ['孵した卵', `${fmt(r.hatched || 0)} 個`],
    ['実績', `${Object.keys(st.meta.achievements).length} 個`], ['一番長い放置', fmtTime(r.bestOffline || 0, true)],
  ])]));
  el.append(cols);
}

function renderSheet(ui, el) {
  const g = ui.game; const H = g.H;
  if (!H) return;
  el.append(h('div.mt-cards.w', [
    card('最大ライフ', fmt(H.life)), card('アーマー', fmt(H.armor)), card('クリティカル', `${fmtPct(H.critChance * 100)} ×${H.critMult.toFixed(2)}`),
    card('攻撃速度', `${H.aps.toFixed(2)}/秒`), card('ダメージ増加', fmtPct(H.incBase)), card('最終倍率', `×${H.more.toFixed(2)}`),
    card('耐性 火/冷/雷/毒', `${Math.round(H.res.fire)}/${Math.round(H.res.cold)}/${Math.round(H.res.lightning)}/${Math.round(H.res.poison)}`), card('回避 / ブロック', `${fmtPct(H.dodge * 100)} / ${fmtPct(H.block * 100)}`),
  ]));
  // 能力ごとに出どころを集める
  const by = new Map();
  for (const m of H.mods) {
    if (!m || m.s === undefined || !(Number(m.v))) continue;
    const src = m.src || 'buff';
    if (!by.has(m.s)) by.set(m.s, new Map());
    const sm = by.get(m.s);
    sm.set(src, (sm.get(src) || 0) + Number(m.v));
  }
  el.append(h('label.chk', [h('input', { type: 'checkbox', checked: showAll || undefined, onchange: (e) => { showAll = e.target.checked; ui.renderPanel(); } }), ' 出どころを全部ひらく']));
  const groups = {};
  for (const [key, srcs] of by) {
    const d = statDef(key);
    const cat = STATS[key] ? d.cat : (d.dyn ? 'offense' : 'other');
    (groups[cat] ||= []).push({ key, d, srcs, total: H.S[key] || 0 });
  }
  for (const cat of ['attr', 'offense', 'defense', 'utility', 'minion', 'other']) {
    const list = groups[cat];
    if (!list?.length) continue;
    el.append(h('h3.sec-title', CAT_NAMES[cat]));
    const box = h('div.st-sheet');
    for (const it of list.sort((a, b) => Object.keys(STATS).indexOf(a.key) - Object.keys(STATS).indexOf(b.key))) {
      const name = it.d.dyn === 'family_dmg' ? `${FAMILIES[it.d.arg] || it.d.arg}へのダメージ` : it.d.dyn ? it.d.name.replace(/「(\w+)」/, (_, id) => `「${SKILL[id]?.name || id}」`) : it.d.name;
      const total = describeMod({ s: it.key, v: it.total }, (v) => fmt(v)).replace(it.d.name, name);
      const chips = [...it.srcs].filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([src, v]) => h('span.st-src', [srcName(src), h('b', fmtVal(it.d, v))]));
      const det = h(`details.st-row${showAll ? '' : ''}`, showAll ? { open: true } : {}, [h('summary', [h('span.st-n', total), h('span.st-c', `${chips.length} 箇所`)]), h('div.st-srcs', chips)]);
      box.append(det);
    }
    el.append(box);
  }
  el.append(h('div.hint', '「最終」の能力（最終ダメージ・被ダメージ軽減）は出どころごとに掛け算、ほかは足し算です。'));
}

function fmtVal(d, v) {
  if (d.kind === 'flat') return `${v >= 0 ? '+' : ''}${fmt(v)}`;
  return `${v >= 0 ? '+' : ''}${Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10}%`;
}

function renderSkills(ui, el) {
  const g = ui.game; const sys = g.sys.achievements;
  const recent = h('div.st-skills');
  const draw = () => {
    const rows = sys.skillBreakdown(30);
    recent.replaceChildren(...(rows.length ? rows.map((x) => h('div.st-sk', [
      h('div.st-skn', [x.name, h('span.dim', `　${Math.round(x.share * 100)}%`)]),
      bar(x.share * 100, `${fmt(x.dps)}/秒`, x.id === 'pet' ? 'soul' : x.id === 'dot' ? 'red' : 'gold'),
    ])) : [h('div.dim', 'まだ記録がありません（戦うと数え始めます）')]));
  };
  draw();
  const total = sys.skillBreakdown(30).reduce((s, x) => s + x.dps, 0);
  el.append(h('h3.sec-title', ['直近 30 秒のスキル別ダメージ', h('span.sec-right', `合計 ${fmt(total)}/秒`)]), recent);
  live(el, 1000, draw);
  const life = sys.lifetimeBreakdown();
  el.append(h('h3.sec-title', 'これまでのスキル別ダメージ'));
  el.append(h('div.st-skills', life.length ? life.slice(0, 20).map((x) => h('div.st-sk', [h('div.st-skn', [x.name, h('span.dim', `　${fmt(x.dmg)}`)]), bar(x.share * 100, `${Math.round(x.share * 100)}%`, 'good')])) : h('div.dim', 'まだ記録がありません')));
  el.append(h('div.hint', '召喚物の攻撃は呼んだスキルに、ペットの手助けは「ペット」に数えます。炎上・毒などの継続ダメージは「継続ダメージ・その他」です。'));
}

const CSS = `
.st-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10px; }
.st-cols table.kv th { width: auto; white-space: nowrap; }
.st-cols table.kv td { white-space: nowrap; }
.st-sheet { display: flex; flex-direction: column; background: #120f16; border: 1px solid var(--line); border-radius: 6px; }
.st-row { border-bottom: 1px solid #221d28; }
.st-row summary { display: flex; justify-content: space-between; gap: 6px; padding: 4px 8px; cursor: pointer; font-size: 12.5px; list-style: none; }
.st-row summary::-webkit-details-marker { display: none; }
.st-row summary::before { content: '▸'; color: var(--dim); margin-right: 4px; }
.st-row[open] summary::before { content: '▾'; }
.st-n { flex: 1; color: #8ab8ff; }
.st-c { color: var(--dim); font-size: 11px; }
.st-srcs { display: flex; flex-wrap: wrap; gap: 3px 6px; padding: 2px 8px 6px 20px; }
.st-src { font-size: 11px; background: #1a1620; border: 1px solid #2a2230; border-radius: 4px; padding: 0 5px; }
.st-src b { margin-left: 4px; color: var(--gold2); font-weight: 400; }
.st-skills { display: flex; flex-direction: column; gap: 5px; }
.st-sk { display: grid; grid-template-columns: 150px 1fr; gap: 8px; align-items: center; font-size: 12.5px; }
.st-skn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 900px) { .st-cols { grid-template-columns: 1fr; } .st-sk { grid-template-columns: 110px 1fr; } }
`;
