// ペットの窓: 連れているペット（手助け・効果・餌）・20 種の一覧（持っていない物は影）・卵と孵卵器・卵の天井。担当: メタ担当。

import { h, button, spriteImg, injectCss } from '../dom.js';
import { fmt } from '../../engine/format.js';
import { assets } from '../../render/assets.js';
import { PETS, PET, EGGS, EGG, PET_BAL, PET_RARITIES } from '../../data/pets.js';
import { describeMod } from '../../data/stats.js';
import { tabs, card, bar, live, setBar } from '../metaui.js';

let view = 'active';
const odds = (rank) => Math.round(1 / PET_BAL.EGG_CHANCE[rank]);

export const petsPanel = {
  id: 'pets', name: 'ペット', icon: '🐾',
  refreshOn: ['meta:pets', 'gold'],
  help: `<p>エリート・ボスを倒すと、まれに<b>卵</b>が落ちます（チャンピオン 1/${odds('champion')}、群れの長 1/${odds('rare')}、ボス 1/${odds('boss')}、章のボス 1/${odds('actboss')} など）。エリート・ボスを ${PET_BAL.PITY} 体倒しても出なければ必ず落ちます（天井）。主人公より ${PET_BAL.LEVEL_GAP} Lv 以上低い敵からは落ちません。</p>
<p>卵は空いた<b>孵卵器</b>（${PET_BAL.INCUBATORS} つ）へ自動で入り（「卵と孵卵器」のスイッチで切れます）、決まった数の敵を倒すと孵ります。放置していた間も進みます。孵ったら「孵す」を押します（魂の祭壇「孵化の番人」で自動）。</p>
<p>連れているペット 1 匹が戦闘で手助けをし（主人公の後ろにいて敵には狙われにくい）、効果を与えます。持っているペットすべての<b>所持効果</b>も効きます。</p>
<p>同じペットが出ると<b>進化 ★</b>（最大 5、1 つごとに効果 +20%）。餌（ゴールド）でレベルが上がります（最大 ${PET_BAL.MAX_LEVEL}）。</p>`,
  badge: (g) => (g.sys.pets?.hatchReady?.() || 0) + (g.sys.pets?.freeIncubators?.() > 0 && g.sys.pets?.eggCount?.() > 0 ? 1 : 0),
  render(ui, el) {
    injectCss('meta-pets', CSS);
    const g = ui.game; const sys = g.sys.pets; const ps = g.state.meta.pets;
    const owned = sys.ownedList().length;
    el.append(h('div.mt-cards', [
      card('ペット', `${owned} / ${PETS.length}`, '持っている種類'),
      card('卵', `${sys.eggCount()} 個`, `孵卵器 ${ps.incubator.length} / ${PET_BAL.INCUBATORS}`),
      card('卵の天井', `${ps.pity} / ${PET_BAL.PITY}`, 'エリート・ボス'),
    ]));
    el.append(tabs([['active', '連れている'], ['list', `一覧 ${owned}/${PETS.length}`], ['eggs', '卵と孵卵器', sys.hatchReady()]], view, (id) => { view = id; ui.renderPanel(); }));
    if (view === 'list') renderList(ui, el);
    else if (view === 'eggs') renderEggs(ui, el);
    else renderActive(ui, el);
  },
};

function stars(n) { return h('span.pt-stars', Array.from({ length: PET_BAL.MAX_STARS }, (_, i) => h(`i${i < n ? '.on' : ''}`, '★'))); }

function petPortrait(id, size, known = true) {
  return h(`div.pt-pic${known ? '' : '.unknown'}`, spriteImg(assets, `pet.${id}`, size));
}

function petInfo(ui, def, opts = {}) {
  const g = ui.game; const sys = g.sys.pets; const o = g.state.meta.pets.owned[def.id];
  const rr = PET_RARITIES[def.rarity];
  const need = o ? PET_BAL.xpToNext(o.lvl, def.rarity) : 1;
  const xpb = o ? bar(o.lvl >= PET_BAL.MAX_LEVEL ? 100 : (o.xp / need) * 100, o.lvl >= PET_BAL.MAX_LEVEL ? '最大レベル' : `経験値 ${fmt(o.xp)} / ${fmt(need)}`, 'good') : null;
  const feedBtns = o && o.lvl < PET_BAL.MAX_LEVEL ? h('div.toolbar', [
    button(`餌をやる（${fmt(sys.feedCost(def.id))} G）`, () => { if (!sys.feed(def.id, 1)) ui.toast('ゴールドが足りない', 'bad'); ui.renderPanel(); }, { kind: 'primary', disabled: !sys.canFeed(def.id) }),
    button('×10', () => { const n = sys.feed(def.id, 10); if (!n) ui.toast('ゴールドが足りない', 'bad'); ui.renderPanel(); }, { kind: 'small', disabled: !sys.canFeed(def.id) }),
    h('span.dim.small', `1 回で経験値 +${PET_BAL.FEED_XP}`),
  ]) : null;
  return h('div.pt-info', [
    h('div.pt-nm', [h('b', { style: { color: rr.color } }, def.name), h('span.pt-rar', { style: { borderColor: rr.color, color: rr.color } }, rr.name), o ? stars(o.stars) : null]),
    o ? h('div.pt-lv', `Lv ${o.lvl} / ${PET_BAL.MAX_LEVEL}`) : h('div.dim', 'まだ持っていない'),
    xpb,
    h('div.pt-desc', def.desc),
    h('div.pt-sec', [h('span.pt-k', '手助け'), sys.abilityText(def.id)]),
    h('div.pt-sec', [h('span.pt-k', '連れると'), o ? sys.bonusText(def.id) : (def.bonus || []).map((m) => describeMod(m)).join('・')]),
    h('div.pt-sec', [h('span.pt-k', '所持効果'), o ? sys.ownText(def.id) : (def.own || []).map((m) => describeMod(m)).join('・')]),
    opts.feed ? feedBtns : null,
  ]);
}

function renderActive(ui, el) {
  const g = ui.game; const sys = g.sys.pets; const ps = g.state.meta.pets;
  const def = PET[ps.active];
  if (!def) {
    el.append(h('div.mt-box.mt-lock', [h('div', { style: { fontSize: '32px' } }, '🥚'), h('div', 'まだペットを連れていません。'), h('div.mt-note', 'エリートやボスが落とす卵を、孵卵器に入れて孵しましょう。'), button('卵と孵卵器を見る', () => { view = 'eggs'; ui.renderPanel(); }, { kind: 'primary' })]));
    return;
  }
  el.append(h('div.mt-box.pt-hero', { style: `--pc:${def.palette.main}` }, [petPortrait(def.id, 150), petInfo(ui, def, { feed: true })]));
  // 所持効果の合計
  const acc = {};
  for (const p of sys.ownedList()) for (const m of sys.ownMods(p.id)) acc[m.s] = (acc[m.s] || 0) + m.v;
  el.append(h('h3.sec-title', '持っているペットすべての所持効果'));
  el.append(h('div.pt-own', Object.keys(acc).length ? Object.entries(acc).map(([s, v]) => h('span.mt-chip', describeMod({ s, v: Math.round(v * 100) / 100 }))) : h('span.dim', 'なし')));
  el.append(h('div.hint', '一覧からほかのペットに替えられます。連れているペットは主人公の後ろについてきて、時間ごとに手助けをします。'));
}

function renderList(ui, el) {
  const g = ui.game; const sys = g.sys.pets; const ps = g.state.meta.pets;
  const grid = h('div.pt-grid');
  for (const def of PETS) {
    const o = ps.owned[def.id];
    const rr = PET_RARITIES[def.rarity];
    grid.append(h(`div.pt-card${o ? '' : '.unknown'}${ps.active === def.id ? '.on' : ''}`, { style: `--rc:${rr.color}`, onclick: () => petModal(ui, def) }, [
      petPortrait(def.id, 70, !!o),
      h('div.pt-cn', o ? def.name : '？？？'),
      o ? h('div.pt-cl', [`Lv ${o.lvl}`, o.stars ? h('span.gold', ` ★${o.stars}`) : null]) : h('div.pt-cl.dim', rr.name),
      ps.active === def.id ? h('span.pt-badge', '連れている') : null,
    ]));
  }
  el.append(grid);
  el.append(h('div.hint', '押すと詳しく見られます。影のペットはまだ持っていません。'));
}

function petModal(ui, def) {
  const g = ui.game; const sys = g.sys.pets; const ps = g.state.meta.pets;
  const o = ps.owned[def.id];
  const btns = [];
  if (o && ps.active !== def.id) btns.push({ label: '連れていく', kind: 'primary', onclick: () => { sys.setActive(def.id); ui.toast(`${def.name} を連れていく`, 'good'); ui.renderPanel(); } });
  if (o && ps.active === def.id) btns.push({ label: '休ませる', onclick: () => { sys.setActive(null); ui.renderPanel(); } });
  btns.push({ label: '閉じる' });
  ui.modal(o ? def.name : '？？？', h('div.pt-modal', [petPortrait(def.id, 130, !!o), o ? petInfo(ui, def, { feed: true }) : h('div.pt-info', [h('div.dim', `${PET_RARITIES[def.rarity].name}のペット`), h('div.small', `卵から孵ると手に入る。${def.rarity === 'legendary' ? '深淵の卵・熾火の卵から出る。' : def.rarity === 'epic' ? '熾火の卵・深淵の卵から出やすい。' : ''}`)])]), btns);
}

function renderEggs(ui, el) {
  const g = ui.game; const sys = g.sys.pets; const ps = g.state.meta.pets;
  // 孵卵器
  el.append(h('h3.sec-title', ['孵卵器', h('span.sec-right', `${ps.incubator.length} / ${PET_BAL.INCUBATORS}`)]));
  const incs = h('div.pt-incs');
  const ups = [];
  for (let i = 0; i < PET_BAL.INCUBATORS; i++) {
    const inc = ps.incubator[i];
    if (!inc) { incs.append(h('div.pt-inc.empty', [h('div.pt-egg', { style: `--ec:${'#3a3142'}` }), h('div.dim.small', '空き。下の卵を入れよう')])); continue; }
    const e = EGG[inc.kind];
    const ready = inc.prog >= inc.need;
    const b = bar((inc.prog / inc.need) * 100, ready ? '孵る！' : `あと ${fmt(inc.need - inc.prog)} 体`, ready ? 'good' : 'soul');
    ups.push(() => setBar(b, (inc.prog / inc.need) * 100, inc.prog >= inc.need ? '孵る！' : `あと ${fmt(inc.need - inc.prog)} 体`));
    incs.append(h(`div.pt-inc${ready ? '.ready' : ''}`, [
      h('div.pt-egg', { style: `--ec:${e.color}` }),
      h('div.mt-grow', [h('b', e.name), b]),
      button(ready ? '孵す' : '待つ', () => { const r = sys.hatch(i); if (r) hatchModal(ui, r); ui.renderPanel(); }, { kind: ready ? 'primary' : 'small', disabled: !ready }),
    ]));
  }
  el.append(incs);
  const autoHatch = !!g.state.meta.unlocks.autoHatch;
  el.append(h('div.toolbar', [
    h('label.chk', { title: '卵を手に入れたとき・孵卵器が空いたときに、良い卵から自動で入れます' }, [
      h('input', { type: 'checkbox', checked: (ps.autoFill !== false || autoHatch) || undefined, disabled: autoHatch || undefined, onchange: (e) => { sys.setAutoFill(e.target.checked); ui.renderPanel(); } }),
      ' 卵を空いた孵卵器へ自動で入れる',
    ]),
    h('span.dim.small', autoHatch ? '孵化の番人: 孵るのも自動' : '孵ったら「孵す」を押す（魂の祭壇「孵化の番人」で自動）'),
  ]));
  // 卵
  el.append(h('h3.sec-title', '持っている卵'));
  const eggs = h('div.pt-eggs');
  for (const e of EGGS) {
    const n = ps.eggs[e.id] || 0;
    eggs.append(h(`div.pt-eggrow${n ? '' : '.none'}`, [
      h('div.pt-egg', { style: `--ec:${e.color}` }),
      h('div.mt-grow', [h('b', [e.name, h('span.dim', `　×${n}`)]), h('div.small', e.desc), h('div.dim.small', `孵るまで ${fmt(e.hatchKills)} 体　${Object.entries(e.odds).filter(([, w]) => w > 0).map(([r, w]) => `${PET_RARITIES[r].name} ${w}%`).join('・')}`)]),
      button('孵卵器へ', () => { if (!sys.incubate(e.id)) ui.toast('空いた孵卵器がない', 'bad'); ui.renderPanel(); }, { kind: 'small', disabled: !n || sys.freeIncubators() <= 0 }),
    ]));
  }
  el.append(eggs);
  const pb = bar((ps.pity / PET_BAL.PITY) * 100, `卵の天井 ${ps.pity} / ${PET_BAL.PITY}`, 'soul');
  ups.push(() => setBar(pb, (ps.pity / PET_BAL.PITY) * 100, `卵の天井 ${ps.pity} / ${PET_BAL.PITY}`));
  el.append(h('h3.sec-title', '卵の天井'), pb, h('div.hint', `エリート・ボスを倒すたびに 1 進み、${PET_BAL.PITY} で必ず卵が落ちます（落ちたら 0 に戻る）。`));
  live(el, 1000, () => ups.forEach((f) => f()));
}

function hatchModal(ui, r) {
  const def = PET[r.id];
  const rr = PET_RARITIES[def.rarity];
  ui.modal('卵が孵った！', h('div.pt-hatch', [
    h('div.pt-burst', { style: `--rc:${rr.color}` }, petPortrait(def.id, 150)),
    h('div.pt-hn', { style: { color: rr.color } }, def.name),
    h('div', rr.name),
    r.dup ? h('div.gold', r.stars ? `重なった！ 進化 ★${r.stars}（効果 +${Math.round(r.stars * 20)}%）` : '重なった！ 経験値 +200') : h('div.good', '新しいペット！'),
    h('div.small', ui.game.sys.pets.abilityText(def.id)),
  ]), [{ label: 'やったね', kind: 'primary' }]);
}

const CSS = `
.pt-hero { display: flex; gap: 12px; align-items: flex-start; background: radial-gradient(circle at 20% 40%, color-mix(in srgb, var(--pc) 22%, #1d1726), #120f16 70%); }
.pt-pic { display: flex; align-items: center; justify-content: center; border-radius: 10px; flex: none; }
.pt-pic.unknown canvas { filter: brightness(0) drop-shadow(0 0 2px #6a5a7a); opacity: .85; }
.pt-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.pt-nm { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } .pt-nm b { font-size: 16px; font-family: var(--serif); }
.pt-rar { font-size: 10.5px; border: 1px solid; border-radius: 4px; padding: 0 5px; }
.pt-stars i { color: #3a3142; font-style: normal; font-size: 13px; } .pt-stars i.on { color: #ffd04a; text-shadow: 0 0 4px #ffb000; }
.pt-lv { color: var(--gold2); font-size: 12.5px; }
.pt-desc { font-size: 12px; color: #c8c0b0; }
.pt-sec { font-size: 12px; } .pt-k { display: inline-block; min-width: 62px; color: var(--dim); }
.pt-own { display: flex; flex-wrap: wrap; gap: 4px; }
.pt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.pt-card { position: relative; border: 1px solid color-mix(in srgb, var(--rc) 45%, #2a2230); border-radius: 8px; padding: 5px; text-align: center; cursor: pointer; background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--rc) 16%, #15111a), #0d0b10 80%); }
.pt-card.on { border-color: var(--gold); box-shadow: 0 0 10px rgba(217,180,90,.3); }
.pt-card.unknown { border-color: #2a2230; background: #110e14; }
.pt-card:hover { filter: brightness(1.2); }
.pt-cn { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-cl { font-size: 10.5px; color: var(--gold2); }
.pt-badge { position: absolute; top: 3px; left: 3px; font-size: 9px; background: #6a4512; color: #fff6dc; border-radius: 4px; padding: 0 4px; }
.pt-modal { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.pt-incs, .pt-eggs { display: flex; flex-direction: column; gap: 6px; }
.pt-inc, .pt-eggrow { display: flex; gap: 10px; align-items: center; background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
.pt-inc.ready { border-color: var(--good); box-shadow: 0 0 12px rgba(110,224,138,.25); }
.pt-inc.empty { opacity: .6; }
.pt-eggrow.none { opacity: .55; }
.pt-egg { width: 30px; height: 38px; flex: none; border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%; background: radial-gradient(circle at 35% 30%, #fff9, transparent 35%), radial-gradient(circle at 50% 60%, var(--ec), color-mix(in srgb, var(--ec) 40%, #000)); box-shadow: 0 0 10px color-mix(in srgb, var(--ec) 50%, transparent); }
.pt-inc.ready .pt-egg { animation: ptw .5s infinite alternate; }
@keyframes ptw { from { transform: rotate(-8deg); } to { transform: rotate(8deg); } }
.pt-hatch { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.pt-burst { padding: 10px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--rc) 45%, transparent), transparent 70%); animation: ptb .8s ease-out; }
@keyframes ptb { from { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.15); } to { transform: scale(1); opacity: 1; } }
.pt-hn { font-family: var(--serif); font-size: 20px; font-weight: 900; }
@media (max-width: 900px) { .pt-hero { flex-direction: column; align-items: center; } }
`;
