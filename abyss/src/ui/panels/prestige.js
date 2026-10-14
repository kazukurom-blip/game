// 転生の窓: 魂の見込み・転生する・魂の祭壇（45 の強化）・自動化の ON/OFF・超越（星晶）・転生の記録。担当: メタ担当。

import { h, button } from '../dom.js';
import { fmt, fmtTime } from '../../engine/format.js';
import { ZONES } from '../../data/world.js';
import { MONSTER } from '../../data/monsters.js';
import { PRESTIGE, ALTAR, ALTAR_CATS, STAR_UPGRADES, upgradeDesc } from '../../data/prestige.js';
import { SALVAGE_PRESET_NAMES } from '../../game/systems/prestige.js';
import { tabs, card, bar, live, setBar } from '../metaui.js';
import { injectCss } from '../dom.js';

let view = 'rebirth';
const FREE_HINT = { auto_boss: 'はじめてボスに負けると解放', auto_salvage: 'バッグが半分を超えると解放' };
let altarCat = 'offense';

const HELP = `
<p><b>転生</b>は、物語の進み（章・地域・ステージ）とお金を手放して<b>魂</b>を得る仕組みです。第五章のボスを初めて倒すと解放されます。</p>
<p>魂 = ⌊ ${PRESTIGE.SOUL_K} × √(この周回で着いた最高のエリア Lv − ${PRESTIGE.SOUL_BASE_LEVEL}) ⌋ × 倍率。深く潜るほど多くなります。</p>
<p>レベル・パラゴン・装備・素材・宝石・力の書庫・ペット・実績・図鑑・星座盤は<b>残ります</b>。転生の直後は前回の最高の地域の 50%（祭壇で 80% まで）へ飛ぶので、やり直しはすぐ終わります。</p>
<p>魂は<b>魂の祭壇</b>で永続の強化に使います。自動化（ボスの再挑戦・スキルの自動振り・自動転生など）もここで解放します。</p>
<p>転生を ${PRESTIGE.TRANSCEND_REBIRTHS} 回すると<b>超越</b>が解放されます。魂と祭壇（自動化などは残る）を手放して<b>星晶</b>を得て、大きな倍率を買えます。</p>`;

export const prestigePanel = {
  id: 'prestige', name: '転生', icon: '♻',
  refreshOn: ['meta:prestige', 'level'],
  help: HELP,
  visible: () => true,
  badge: (g) => {
    const p = g.sys.prestige;
    if (!p?.isUnlocked()) return 0;
    const m = g.state.meta;
    return (p.canRebirth().ok && m.rebirths === 0 ? 1 : 0) + (m.souls > (m.prestige.seenSouls || 0) ? Math.min(9, p.affordableCount()) : 0);
  },
  render(ui, el) {
    const g = ui.game;
    const ps = g.sys.prestige;
    const m = g.state.meta;
    injectCss('meta-prestige', CSS);
    el.append(h('div.mt-cards', [
      card('魂', fmt(m.souls), `合計 ${fmt(m.totalSouls)}`, 'soul'),
      card('転生', `${m.rebirths} 回`, ps.isUnlocked() ? '解放ずみ' : '未解放'),
      card('星晶', fmt(m.prestige.stars), `超越 ${m.prestige.transcends} 回`, 'star'),
      card('祭壇の強化', `Lv ${ps.altarTotalLevel()}`, `買える ${ps.affordableCount()}`),
    ]));
    el.append(tabs([['rebirth', '転生'], ['altar', '魂の祭壇', ps.affordableCount()], ['auto', '自動化'], ['transcend', '超越'], ['history', '記録']], view, (id) => { view = id; ui.renderPanel(); }));
    if (view === 'altar') renderAltar(ui, el);
    else if (view === 'auto') renderAuto(ui, el);
    else if (view === 'transcend') renderTranscend(ui, el);
    else if (view === 'history') renderHistory(ui, el);
    else renderRebirth(ui, el);
  },
};

function zoneName(i) { const z = ZONES[i]; return z ? z.name : `地域 ${i + 1}`; }

function renderRebirth(ui, el) {
  const g = ui.game; const ps = g.sys.prestige; const st = g.state; const p = st.meta.prestige;
  if (!ps.isUnlocked()) {
    const z = ZONES[PRESTIGE.UNLOCK_ZONE];
    const boss = z ? MONSTER[z.boss]?.name : null;
    const cur = st.world.maxZone || 0;
    el.append(h('div.mt-box.mt-lock', [
      h('div', { style: { fontSize: '30px' } }, '♻'),
      h('div', ['第五章のボス', boss ? h('b', `「${boss}」`) : null, 'を倒すと転生が解放されます。']),
      h('div.mt-note', `いまの到達: ${zoneName(cur)}（${cur + 1} / ${PRESTIGE.UNLOCK_ZONE + 1} 地域）`),
      bar(((cur + 1) / (PRESTIGE.UNLOCK_ZONE + 1)) * 100, `${cur + 1} / ${PRESTIGE.UNLOCK_ZONE + 1}`, 'soul'),
    ]));
    el.append(keepList());
    return;
  }
  const big = h('div.pr-gain');
  const next = h('div.pr-line');
  const rate = h('div.pr-line');
  const warp = h('div.pr-line');
  const life = h('div.pr-line');
  const reason = h('div.bad.small');
  const btn = button('転生する', () => doRebirth(ui), { kind: 'primary', class: 'big' });
  const lvlBar = bar(0, '', 'soul');
  const upd = () => {
    const s = ps.previewSouls();
    big.textContent = `+${fmt(s)}`;
    const nl = ps.nextSoulLevel();
    const curL = p.life.maxLevel;
    next.innerHTML = `次の 1 点まで: エリア Lv <b>${nl}</b>（この周回の最高 Lv ${curL}）`;
    setBar(lvlBar, curL >= nl ? 100 : Math.max(0, ((curL - PRESTIGE.SOUL_BASE_LEVEL) / Math.max(1, nl - PRESTIGE.SOUL_BASE_LEVEL)) * 100), `Lv ${curL} / ${nl}`);
    rate.innerHTML = `この周回の魂/時: <b>${fmt(ps.soulsPerHour())}</b>`;
    life.innerHTML = `この周回の時間: ${fmtTime(ps.lifeSec(), true)}　撃破 ${fmt(st.meta.stats.kills - (p.life.kills0 || 0))}`;
    const wt = ps.warpTarget();
    warp.innerHTML = `転生の直後に飛ぶ先: <b>${zoneName(wt)}</b>（前回の最高の ${Math.round(ps.warpPct() * 100)}%）`;
    const c = ps.canRebirth();
    btn.disabled = !c.ok;
    reason.textContent = c.ok ? '' : c.reason;
  };
  upd();
  el.append(h('div.mt-box.pr-hero', [
    h('div.pr-label', '今転生すると 魂'),
    big,
    h('div.pr-mul', `倍率 ×${ps.soulMul().toFixed(2)}（祭壇「魂の収穫」・星晶「魂の泉」）`),
    next, lvlBar, rate, life, warp,
    h('div.pr-btn', [btn, reason]),
  ]));
  live(el, 1000, upd);
  el.append(keepList());
}

function keepList() {
  return h('div.pr-keep', [
    h('div', [h('h4', '消えるもの'), h('ul', ['物語の進み（章・地域・ステージ・苦行の選択）', 'ゴールド（祭壇「蓄えの魂」で一部が残る）', 'この周回の数え上げ'].map((t) => h('li', t)))]),
    h('div', [h('h4.good', '残るもの'), h('ul', ['レベル・パラゴン・スキル', '装備・素材・宝石・力の書庫', '星座盤・ペット・実績・図鑑', '苦行・裂け目の最高記録'].map((t) => h('li', t)))]),
  ]);
}

async function doRebirth(ui) {
  const g = ui.game; const ps = g.sys.prestige;
  const s = ps.previewSouls();
  const ok = await ui.confirm(`魂 +${fmt(s)} を得て転生します。物語の進みとゴールドが戻り、「${zoneName(ps.warpTarget())}」から始まります。装備やレベルは残ります。`, '転生する');
  if (!ok) return;
  const r = ps.rebirth();
  if (!r.ok) ui.toast(r.msg, 'bad');
  ui.renderPanel();
}

function upgradeCard(ui, u, opts) {
  const lvl = opts.level(u.id);
  const max = u.max > 0 && lvl >= u.max;
  const cost = opts.cost(u.id);
  const req = opts.req?.(u.id);
  const can = !max && !req && opts.have() >= cost;
  const cat = ALTAR_CATS.find((c) => c.id === u.cat);
  const btns = [];
  if (!max && !req) {
    btns.push(button(`${opts.unit} ${fmt(cost)}`, () => { if (!opts.buy(u.id, 1)) ui.toast(`${opts.unitName}が足りない`, 'bad'); ui.renderPanel(); }, { kind: can ? 'primary' : 'small', disabled: !can, class: 'pr-buy' }));
    if (opts.multi && (u.max === 0 || u.max - lvl > 1)) {
      btns.push(button('×10', () => { opts.buy(u.id, 10); ui.renderPanel(); }, { kind: 'small', disabled: !can }));
      btns.push(button('最大', () => { opts.buy(u.id, Infinity); ui.renderPanel(); }, { kind: 'small', disabled: !can }));
    }
  }
  return h(`div.pr-upg${max ? '.max' : ''}${can ? '.can' : ''}${req ? '.req' : ''}`, { style: `--cc:${cat?.color || '#d9b45a'}` }, [
    h('div.nm', [h('span', u.name), h('span.lv', max ? `Lv ${lvl}（最大）` : `Lv ${lvl}${u.max ? ` / ${u.max}` : ''}`)]),
    h('div.ds', lvl > 0 ? upgradeDesc(u, lvl) : (u.unlock ? u.desc : `いま: なし`)),
    !max && !u.unlock ? h('div.nx', `次: ${upgradeDesc(u, lvl + 1)}`) : null,
    u.unlock && lvl > 0 ? h('div.nx', opts.free?.(u.id) ? `解放ずみ（${opts.free(u.id)}）` : '解放ずみ') : null,
    req ? h('div.bad.small', req) : null,
    u.keep && !opts.star ? h('div.dim.small', '超越しても残る') : null,
    btns.length ? h('div.ft', btns) : null,
  ]);
}

function renderAltar(ui, el) {
  const g = ui.game; const ps = g.sys.prestige;
  g.state.meta.prestige.seenSouls = g.state.meta.souls;
  if (!ps.isUnlocked() && !g.state.meta.souls) el.append(h('div.hint', '転生すると魂が手に入り、ここで強化を買えます。いまは中身だけ見られます。'));
  el.append(h('div.tabs.small', ALTAR_CATS.map((c) => h(`button.tab${altarCat === c.id ? '.on' : ''}`, { style: { color: c.color }, onclick: () => { altarCat = c.id; ui.renderPanel(); } }, `${c.name}（${ALTAR.filter((u) => u.cat === c.id).length}）`))));
  const grid = h('div.pr-upgs');
  for (const u of ALTAR.filter((x) => x.cat === altarCat)) {
    grid.append(upgradeCard(ui, u, { level: (id) => ps.level(id), cost: (id) => ps.cost(id), req: (id) => ps.reqProblem(id), have: () => g.state.meta.souls, buy: (id, n) => ps.buy(id, n), unit: '魂', unitName: '魂', multi: true, free: (id) => g.state.meta.prestige.freeUnlocks?.[id] }));
  }
  el.append(grid);
  const d = ps.discount();
  el.append(h('div.hint', `費用は Lv が上がるごとに増えます${d ? `（星晶「祭壇の星」で -${Math.round(d * 100)}%）` : ''}。「最大」は魂が続くかぎり買います。`));
}

function renderAuto(ui, el) {
  const g = ui.game; const ps = g.sys.prestige; const p = g.state.meta.prestige;
  el.append(h('p.hint', '自動化は魂の祭壇の「自動化」で解放します。解放したものは、ここでいつでも ON/OFF できます（超越しても消えません）。'));
  const list = h('div.mt-list');
  for (const u of ALTAR.filter((x) => x.cat === 'auto')) {
    const owned = ps.level(u.id) > 0;
    const on = ps.toggleOn(u.unlock);
    const row = h(`div.pr-auto${owned ? '' : '.off'}`, [
      h('div.mt-grow', [h('b', u.name), h('div.small', u.desc), !owned ? h('div.dim.small', `魂の祭壇で 魂 ${fmt(ps.cost(u.id))}${u.req?.rebirths ? `（転生 ${u.req.rebirths} 回で解放）` : ''}${FREE_HINT[u.id] ? `・または ${FREE_HINT[u.id]}` : ''}`) : p.freeUnlocks?.[u.id] ? h('div.good.small', `${p.freeUnlocks[u.id]}ので解放`) : null]),
      owned ? h('label.chk', [h('input', { type: 'checkbox', checked: on || undefined, onchange: (e) => ps.setToggle(u.unlock, e.target.checked) }), on ? ' ON' : ' OFF']) : h('span.dim', '未解放'),
    ]);
    if (owned && u.unlock === 'autoSalvage') {
      row.append(h('div.pr-sub', ['自動分解の型: ', h('select', { onchange: (e) => ps.setSalvagePreset(e.target.value) }, Object.entries(SALVAGE_PRESET_NAMES).map(([id, name]) => h('option', { value: id, selected: p.salvagePreset === id || undefined }, name))),
        h('span.dim.small', '　「レベルに合わせる」: Lv15 未満はノーマル、Lv35 未満はマジックまで、Lv70 未満はレアまで、それ以上はエピックまで分解')]));
    }
    if (owned && u.unlock === 'autoRebirth') {
      const inp = h('input', { type: 'number', min: 1, value: p.autoAt, style: { width: '90px' }, onchange: (e) => ps.setAutoRebirth(undefined, e.target.value) });
      row.append(h('div.pr-sub', ['魂がこの数に届いたら転生: ', inp, h('span.dim.small', `　（いまの見込み ${fmt(ps.previewSouls())}）`)]));
    }
    list.append(row);
  }
  el.append(list);
}

function renderTranscend(ui, el) {
  const g = ui.game; const ps = g.sys.prestige; const p = g.state.meta.prestige; const m = g.state.meta;
  if (!ps.transcendUnlocked()) {
    el.append(h('div.mt-box.mt-lock', [
      h('div', { style: { fontSize: '30px' } }, '✧'),
      h('div', ['転生を ', h('b', `${PRESTIGE.TRANSCEND_REBIRTHS} 回`), ' すると超越が解放されます。']),
      bar((m.rebirths / PRESTIGE.TRANSCEND_REBIRTHS) * 100, `${m.rebirths} / ${PRESTIGE.TRANSCEND_REBIRTHS}`, 'gold'),
      h('div.mt-note', '超越すると魂と魂の祭壇（自動化・鞄・速度・スキルの枠は残る）を手放し、星晶を得ます。星晶で買う強化は大きく、ずっと残ります。'),
    ]));
  } else {
    const n = ps.starsPreview();
    const c = ps.canTranscend();
    el.append(h('div.mt-box.pr-hero.star', [
      h('div.pr-label', '今超越すると 星晶'),
      h('div.pr-gain.star', `+${n}`),
      h('div.pr-line', `前の超越から得た魂 ${fmt(p.soulsSinceTrans)}${ps.canRebirth().ok ? `（＋今の転生の見込み ${fmt(ps.previewSouls())}）` : ''}`),
      h('div.pr-line.dim', '星晶 = ⌊ 2 × √(魂 ÷ 25) ⌋'),
      h('div.pr-btn', [button('超越する', async () => {
        if (!await ui.confirm(`星晶 +${n} を得て超越します。魂 ${fmt(m.souls)} と魂の祭壇の強化（自動化などを除く）が消え、物語の進みも戻ります。`, '超越する')) return;
        const r = ps.transcend(); if (!r.ok) ui.toast(r.msg, 'bad'); ui.renderPanel();
      }, { kind: 'primary', class: 'big', disabled: !c.ok }), c.ok ? null : h('div.bad.small', c.reason)]),
    ]));
  }
  el.append(h('h3.sec-title', ['星晶の強化', h('span.sec-right', `星晶 ${fmt(p.stars)}`)]));
  const grid = h('div.pr-upgs');
  for (const u of STAR_UPGRADES) grid.append(upgradeCard(ui, { ...u, cat: 'idle' }, { level: (id) => ps.starLevel(id), cost: (id) => ps.starCost(id), have: () => p.stars, buy: (id) => ps.buyStar(id), unit: '星晶', unitName: '星晶', multi: false, star: true }));
  el.append(grid);
}

function renderHistory(ui, el) {
  const g = ui.game; const p = g.state.meta.prestige;
  if (!p.history.length) { el.append(h('div.mt-lock', 'まだ転生していません。')); return; }
  const rows = p.history.map((x) => h('tr', [
    h('td', new Date(x.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    h('td', x.transcend ? h('span.gold', `超越 星晶 +${x.stars}`) : `魂 +${fmt(x.souls)}${x.auto ? '（自動）' : ''}`),
    h('td', `Lv ${x.level}`),
    h('td', zoneName(x.zone || 0)),
    h('td', fmtTime(x.dur || 0, true)),
  ]));
  el.append(h('table.pr-hist', [h('tr', ['日時', '得た物', '最高のエリア Lv', '最高の地域', '周回の時間'].map((t) => h('th', t))), ...rows]));
}

const CSS = `
.pr-hero { text-align: center; padding: 14px 12px; }
.pr-label { color: var(--dim); font-size: 12px; letter-spacing: 2px; }
.pr-gain { font-family: var(--serif); font-size: 42px; font-weight: 900; color: #9ad0ff; text-shadow: 0 0 18px rgba(120,180,255,.5); line-height: 1.1; }
.pr-gain.star { color: #ffe08a; text-shadow: 0 0 18px rgba(255,220,120,.5); }
.pr-mul { font-size: 11px; color: var(--dim); margin-bottom: 6px; }
.pr-line { font-size: 12.5px; margin: 4px 0; }
.pr-line b { color: var(--gold2); }
.pr-btn { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; align-items: center; }
.pr-btn .btn { max-width: 280px; }
.pr-keep { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
.pr-keep > div { background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
.pr-keep h4 { margin: 2px 0; color: var(--bad); font-size: 13px; } .pr-keep h4.good { color: var(--good); }
.pr-keep ul { margin: 2px 0 2px 16px; padding: 0; line-height: 1.6; }
.pr-upgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; }
.pr-upg { border: 1px solid var(--line); border-left: 3px solid var(--cc); border-radius: 8px; padding: 7px 9px; background: #120f16; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pr-upg.can { border-color: var(--gold); border-left-color: var(--cc); box-shadow: 0 0 10px rgba(217,180,90,.18); }
.pr-upg.max { opacity: .8; border-color: #2f5a3a; border-left-color: var(--good); }
.pr-upg.req { opacity: .55; }
.pr-upg .nm { font-weight: 700; color: var(--gold2); display: flex; justify-content: space-between; gap: 6px; font-size: 13px; }
.pr-upg .lv { color: var(--dim); font-size: 11px; font-weight: 400; white-space: nowrap; }
.pr-upg .ds { font-size: 12px; }
.pr-upg .nx { font-size: 11px; color: var(--good); }
.pr-upg .ft { display: flex; gap: 4px; margin-top: auto; padding-top: 3px; flex-wrap: wrap; }
.pr-upg .pr-buy { flex: 1; }
.pr-auto { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
.pr-auto.off { opacity: .6; }
.pr-auto b { color: var(--gold2); }
.pr-sub { flex-basis: 100%; font-size: 12px; }
table.pr-hist { width: 100%; border-collapse: collapse; font-size: 12px; }
table.pr-hist th { text-align: left; color: var(--dim); font-weight: 400; border-bottom: 1px solid var(--line); padding: 3px 4px; }
table.pr-hist td { padding: 3px 4px; border-bottom: 1px solid #221d28; }
@media (max-width: 900px) { .pr-keep { grid-template-columns: 1fr; } }
`;
