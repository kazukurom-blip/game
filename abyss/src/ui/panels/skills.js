// スキルの窓: スキルの並び（ドラッグ・押して入れ替え）・習得と強化・ルーン・補助の刻印の穴・熟練度・自動で使う条件、
// そして「補助の刻印」の持ち物（合成）。HUD に「刻印を拾った」「熟練度が上がった」などの知らせも出す。

import { h, button, spriteImg, injectCss, clear } from '../dom.js';
import { SKILL, skillsOf, SKILL_MAX_LEVEL, KIND_NAMES, MASTERY_BONUS, MASTERY_MAX, MINION_KINDS } from '../../data/skills.js';
import { SUPPORTS, SUPPORT, SUPPORT_CATS, supportFits, supportReqText, glyphXpFor, SUPPORT_MAX_LEVEL } from '../../data/supports.js';
import { TAG_NAMES, ELEMENT_NAMES, ELEMENT_COLORS } from '../../data/stats.js';
import { CLASS } from '../../data/classes.js';
import { assets } from '../../render/assets.js';
import { addSlots } from '../../render/manifest.js';
import { skillDesc, estimateDps, estimateBuildDps } from '../../game/skills.js';
import { heroPower } from '../../game/character.js';
import { AUTO_CONDS, SOCKET_LEVELS } from '../../game/systems/skillbook.js';
import { fmt } from '../../engine/format.js';
import { attachTip, tooltip } from '../tooltip.js';
import { hudHooks } from '../hud.js';

// 召喚物の絵の枠（manifest の決まった一覧に無い種類を足す。描き方はアート担当）
addSlots(MINION_KINDS.filter((k) => !['skeleton', 'skelmage'].includes(k.id)).map((k) => ({ id: `minion.${k.id}`, cat: 'minion', label: `召喚物（${k.name}）`, w: k.id === 'golem' || k.id.startsWith('golem_') ? 170 : 120, h: k.id.startsWith('golem') ? 190 : k.id === 'turret' ? 110 : 130, ax: 0.5, ay: k.id === 'hawk' || k.id === 'familiar' ? 0.6 : 0.97, facing: 'right', params: { minion: k.id, body: k.body }, note: k.desc })));

const KIND_ORDER = ['basic', 'active', 'buff', 'summon', 'ult'];
const GROUPS = [['basic', '基本攻撃'], ['active', '技'], ['support', '強化・召喚'], ['ult', '奥義']];
let tab = 'skills';
let selectedSlot = -1;
const expanded = new Set();
let glyphSort = 'cat';

const CSS = `
.sk2-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.sk2-sp { font-size:14px; } .sk2-sp b { color:var(--gold2); font-size:20px; margin:0 2px; }
.sk2-power { font-size:12px; color:var(--dim); } .sk2-power b { color:#ffd88a; font-size:14px; }
.sk2-toggles { display:flex; flex-wrap:wrap; gap:2px 8px; font-size:12px; color:var(--dim); }
.sk2-bar { display:grid; grid-template-columns:repeat(var(--n,5), 1fr); gap:6px; margin:4px 0 6px; }
.sk2-slot { position:relative; background:linear-gradient(#1c1722,#110e14); border:1px solid var(--line); border-radius:8px; padding:6px 2px 4px; display:flex; flex-direction:column; align-items:center; gap:2px; min-height:92px; cursor:pointer; transition:border-color .15s, box-shadow .15s; }
.sk2-slot.basic { border-color:#5a4a3a; }
.sk2-slot.sel { border-color:var(--gold2); box-shadow:0 0 10px rgba(245,217,138,.45); }
.sk2-slot.drop { border-color:var(--good); box-shadow:0 0 10px rgba(110,224,138,.5); }
.sk2-slot .no { position:absolute; left:4px; top:2px; font-size:9px; color:var(--dim); }
.sk2-slot .nm { font-size:10.5px; text-align:center; line-height:1.15; min-height:24px; color:var(--text); padding:0 2px; }
.sk2-slot .empty { width:44px; height:44px; border:1px dashed #4a4050; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#5a5062; font-size:20px; }
.sk2-slot .mv { display:flex; gap:2px; }
.sk2-slot .mv button { background:#241d2a; border:1px solid var(--line); color:var(--dim); border-radius:4px; font-size:10px; padding:0 5px; cursor:pointer; line-height:16px; }
.sk2-slot .mv button:hover { color:var(--gold2); }
.sk2-slot .ic { border-radius:8px; box-shadow:0 0 0 1px rgba(0,0,0,.6); }
.sk2-hint { font-size:11px; color:var(--dim); margin:0 0 8px; }
.sk2-group { font-family:var(--serif); color:var(--gold); font-size:14px; margin:12px 0 6px; display:flex; align-items:center; gap:8px; }
.sk2-group::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,var(--line2),transparent); }
.sk2-card { border:1px solid var(--line); border-radius:9px; margin-bottom:7px; background:linear-gradient(180deg,#16121b,#110e14); overflow:hidden; }
.sk2-card.inbar { border-color:#6a5a3a; }
.sk2-card.locked { opacity:.55; }
.sk2-card.ult { border-color:#7a3a4a; background:linear-gradient(180deg,#1d1218,#110e14); }
.sk2-top { display:grid; grid-template-columns:52px 1fr auto; gap:9px; padding:9px; cursor:pointer; align-items:start; }
.sk2-top .ic { border-radius:9px; }
.sk2-name { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
.sk2-name b { color:var(--gold2); font-size:14.5px; }
.sk2-kind { font-size:10px; padding:0 6px; border-radius:8px; background:#2a2230; color:#c8b8e0; border:1px solid #3a3142; }
.sk2-kind.ult { background:#4a1a24; color:#ffb0c0; border-color:#7a3a4a; }
.sk2-kind.basic { background:#2a2418; color:#e0d0a0; }
.sk2-lv { font-size:12px; color:var(--dim); margin-left:auto; }
.sk2-tags { font-size:10.5px; color:#8a7a9a; margin-top:1px; }
.sk2-desc { font-size:12.3px; margin-top:3px; line-height:1.45; }
.sk2-meta { font-size:11px; color:var(--dim); margin-top:3px; display:flex; gap:10px; flex-wrap:wrap; }
.sk2-meta b { color:#f0e0c0; font-weight:700; }
.sk2-btns { display:flex; flex-direction:column; gap:4px; align-items:stretch; min-width:84px; }
.sk2-mast { display:flex; align-items:center; gap:6px; margin-top:5px; font-size:10.5px; color:#d0b0ff; }
.sk2-mbar { flex:1; height:5px; background:#241d2a; border-radius:3px; overflow:hidden; max-width:180px; }
.sk2-mbar > div { height:100%; background:linear-gradient(90deg,#8a5ad0,#e0a0ff); }
.sk2-stars { letter-spacing:-1px; color:#c890ff; }
.sk2-detail { border-top:1px solid #241d2a; padding:8px 10px 10px; display:flex; flex-direction:column; gap:8px; background:#0f0c12; }
.sk2-sub { font-size:11px; color:var(--gold); margin-bottom:3px; }
.sk2-runes { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
.sk2-rune { text-align:left; background:#1a1620; color:var(--text); border:1px solid var(--line); border-radius:7px; padding:5px 7px; cursor:pointer; font-size:12px; display:flex; flex-direction:column; gap:1px; font-family:inherit; }
.sk2-rune small { color:var(--dim); font-size:10.5px; line-height:1.3; }
.sk2-rune:hover { border-color:var(--line2); }
.sk2-rune.on { border-color:var(--gold); background:linear-gradient(#2e2412,#1d170c); box-shadow:inset 0 0 8px rgba(217,180,90,.25); }
.sk2-rune.on b::before { content:'◆ '; color:var(--gold2); }
.sk2-rune.lock { opacity:.45; cursor:default; }
.sk2-sockets { display:flex; gap:6px; flex-wrap:wrap; }
.sk2-sock { flex:1; min-width:120px; border:1px dashed #4a4050; border-radius:8px; padding:5px 7px; font-size:11.5px; cursor:pointer; background:#141018; min-height:42px; display:flex; flex-direction:column; justify-content:center; }
.sk2-sock.full { border-style:solid; border-color:var(--gc,#5aa0ff); background:linear-gradient(90deg, color-mix(in srgb, var(--gc,#5aa0ff) 16%, #141018), #141018); }
.sk2-sock.closed { opacity:.45; cursor:default; }
.sk2-sock b { font-size:12px; } .sk2-sock small { color:var(--dim); font-size:10.5px; }
.sk2-auto { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; color:var(--dim); }
.sk2-mlist { font-size:11px; color:var(--dim); display:flex; gap:12px; flex-wrap:wrap; }
.sk2-mlist .ok { color:#d0b0ff; }
.gl-row { display:grid; grid-template-columns:38px 1fr auto; gap:8px; align-items:center; border:1px solid var(--line); border-left:3px solid var(--gc); border-radius:7px; padding:6px 8px; margin-bottom:5px; background:#130f17; }
.gl-ic { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:13px; color:#120e14; background:radial-gradient(circle at 35% 30%, #fff, var(--gc) 45%, color-mix(in srgb, var(--gc) 40%, #000)); box-shadow:0 0 8px color-mix(in srgb, var(--gc) 50%, transparent); }
.gl-name { font-size:13px; } .gl-name b { color:var(--gc); }
.gl-desc { font-size:11.5px; } .gl-req { font-size:10.5px; color:var(--dim); }
.gl-xp { height:4px; background:#241d2a; border-radius:2px; overflow:hidden; margin-top:3px; max-width:160px; } .gl-xp > div { height:100%; background:var(--gc); }
.gl-pick { max-height:60vh; overflow:auto; }
.gl-pick .gl-row { cursor:pointer; } .gl-pick .gl-row:hover { filter:brightness(1.2); }
.gl-pick .gl-row.no { opacity:.4; cursor:default; }
.gl-sum { display:flex; gap:10px; flex-wrap:wrap; font-size:12px; color:var(--dim); margin:4px 0 8px; }
@media (max-width: 900px) { .sk2-bar { gap:4px; } .sk2-slot .nm { font-size:9.5px; } .sk2-runes { grid-template-columns:1fr; } .sk2-top { grid-template-columns:44px 1fr; } .sk2-btns { grid-column:1 / 3; flex-direction:row; } .sk2-btns > * { flex:1; } }
`;

function iconOf(id, size) { const c = spriteImg(assets, `icon.skill.${id}`, size); c.classList.add('ic'); return c; }
function groupOf(def) { return def.kind === 'buff' || def.kind === 'summon' ? 'support' : (def.kind || (def.basic ? 'basic' : 'active')); }
function glyphColor(id) { return SUPPORT_CATS[SUPPORT[id]?.cat]?.color || '#5aa0ff'; }

function glyphEl(g, opts = {}) {
  const sup = SUPPORT[g.id];
  if (!sup) return h('div');
  const next = g.lvl < SUPPORT_MAX_LEVEL ? glyphXpFor(g.lvl + 1) : null;
  const cur = glyphXpFor(g.lvl);
  return h('div.gl-row', { style: { '--gc': glyphColor(g.id) }, class: opts.cls, onclick: opts.onclick }, [
    h('div.gl-ic', String(g.lvl)),
    h('div', [
      h('div.gl-name', [h('b', sup.name), ` Lv ${g.lvl}${g.lvl >= SUPPORT_MAX_LEVEL ? '（最大）' : ''}`, opts.where ? h('span.dim', `　${opts.where}`) : null]),
      h('div.gl-desc', sup.desc(g.lvl)),
      h('div.gl-req', `${SUPPORT_CATS[sup.cat].name}・${supportReqText(sup)}`),
      next ? h('div.gl-xp', { title: `合成 ${g.xp - cur} / ${next - cur}` }, h('div', { style: { width: `${Math.min(100, ((g.xp - cur) / (next - cur)) * 100)}%` } })) : null,
    ]),
    opts.right || h('span'),
  ]);
}

export const skillsPanel = {
  id: 'skills', name: 'スキル', icon: '✦',
  refreshOn: ['skills', 'level', 'gear', 'stats'],
  badge: (g) => g.state.hero.skillPoints,
  help: 'スキルは解放のレベルになると自動で覚えます。スキルポイントで強化すると、ダメージが上がり、Lv 3 / 6 / 10 / 15 でルーン（動きの変化）が解放されます。<br>並びは左から順に自動で使います（一番左は基本攻撃）。「おまかせ編成」が ON なら、強い組み合わせに自動で並べます。<br>使うほど熟練度（最大 10）が上がり、1 段ごとにダメージ +4%、5 段・10 段で特別な効果がつきます。<br>補助の刻印は敵が落とします。主人公 Lv 10 / 30 / 60 で穴が開き、スキルにはめると動きや数値が変わります。同じ刻印を合成するとレベルが上がります（最大 20）。',
  render(ui, el) {
    injectCss('skills', CSS);
    const g = ui.game;
    el.append(h('div.tabs', [
      h(`button.tab${tab === 'skills' ? '.on' : ''}`, { onclick: () => { tab = 'skills'; ui.renderPanel(); } }, 'スキル'),
      h(`button.tab${tab === 'glyphs' ? '.on' : ''}`, { onclick: () => { tab = 'glyphs'; ui.renderPanel(); } }, `補助の刻印（${g.state.inv.glyphs.length}）`),
    ]));
    if (tab === 'glyphs') renderGlyphs(ui, el); else renderSkills(ui, el);
  },
};

function renderSkills(ui, el) {
  const g = ui.game;
  const st = g.state;
  const hero = st.hero;
  const sys = g.sys.skills;
  const H = g.H;
  const size = sys.barSize();
  // 上の行
  const resetCost = sys.resetCost();
  el.append(h('div.sk2-head', [
    h('div', [h('div.sk2-sp', ['スキルポイント ', h('b', String(hero.skillPoints)), h('span.dim', `（Lv 上限 ${sys.levelCap()}）`)]), h('div.sk2-power', ['戦力 ', h('b', fmt(heroPower(H, st))), `　並びの火力の目安 ${fmt(estimateBuildDps(st, H))}/秒`])]),
    h('div.toolbar', [
      button('おまかせで並べる', () => { sys.autoArrange(); ui.toast('おすすめの並びにしました', 'good'); }, { kind: 'small', title: '今のスキルから、火力の目安が一番高い並びを選びます' }),
      button(resetCost ? `振り直し（${fmt(resetCost)} G）` : '振り直し（無料）', async () => {
        if (!sys.spentPoints()) { ui.toast('振り直すポイントがありません'); return; }
        if (!(await ui.confirm(`スキルのレベルを Lv1 に戻し、ポイント ${sys.spentPoints()} を返します。${resetCost ? `${fmt(resetCost)} G かかります。` : '（Lv 20 までは無料）'}`, '振り直す'))) return;
        if (!sys.reset()) ui.toast('お金が足りません', 'bad'); else ui.toast('スキルを振り直しました', 'good');
      }, { kind: 'small' }),
    ]),
  ]));
  el.append(h('div.sk2-toggles', [
    h('label.chk', { title: '覚えたとき・レベルが上がったときに、強い組み合わせに自動で並べ替えます。手で並べ替えると OFF になります' }, [h('input', { type: 'checkbox', checked: hero.autoBar || undefined, onchange: (e) => sys.setAutoBar(e.target.checked) }), ' おまかせ編成']),
    h('label.chk', { title: 'レベルが上がったとき、並びのスキルに自動でポイントを振ります' }, [h('input', { type: 'checkbox', checked: hero.autoSkill || undefined, onchange: (e) => sys.setAutoSpend(e.target.checked) }), ' ポイントを自動で振る']),
  ]));
  // 並び
  const bar = h('div.sk2-bar', { style: { '--n': size } });
  for (let i = 0; i < size; i++) {
    const id = hero.bar[i];
    const def = id ? SKILL[id] : null;
    const slot = h(`div.sk2-slot${i === 0 ? '.basic' : ''}${selectedSlot === i ? '.sel' : ''}`, {
      draggable: def ? 'true' : undefined,
      onclick: () => { selectedSlot = selectedSlot === i ? -1 : i; ui.renderPanel(); },
    }, [
      h('span.no', i === 0 ? '基本' : String(i)),
      def ? iconOf(id, 44) : h('div.empty', '＋'),
      h('div.nm', def ? def.name : (selectedSlot === i ? '下から選ぶ' : '空き')),
      h('div.mv', [
        i > 0 ? h('button', { title: '左へ（先に使う）', onclick: (e) => { e.stopPropagation(); sys.moveBar(i, -1); } }, '◀') : null,
        i < size - 1 ? h('button', { title: '右へ', onclick: (e) => { e.stopPropagation(); sys.moveBar(i, 1); } }, '▶') : null,
        def ? h('button', { title: '並びから外す', onclick: (e) => { e.stopPropagation(); sys.setBar(i, null); } }, '×') : null,
      ]),
    ]);
    if (def) {
      attachTip(slot, () => h('div.tipbox', [h('b', def.name), h('div', skillDesc(st, H, id)), h('div.dim', autoText(hero, id))]));
      slot.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ from: i, id })); tooltip.hide(); });
    }
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drop'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault(); slot.classList.remove('drop');
      try {
        const d = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
        if (d.from !== undefined && d.from !== i) sys.swapBar(d.from, i);
        else if (d.id && d.from === undefined) sys.setBar(i, d.id);
      } catch { /* 何もしない */ }
    });
    bar.append(slot);
  }
  el.append(bar, h('div.sk2-hint', selectedSlot >= 0 ? `枠 ${selectedSlot === 0 ? '基本' : selectedSlot} を選んでいます。下のスキルの「ここに入れる」で入れます。` : '左から順に自動で使います。スキルを枠へドラッグするか、枠を押してから下で選びます。カードを押すとルーン・刻印・条件を変えられます。'));
  // 一覧
  const defs = skillsOf(hero.cls).slice().sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.unlock - b.unlock);
  for (const [gid, gname] of GROUPS) {
    const list = defs.filter((d) => groupOf(d) === gid);
    if (!list.length) continue;
    el.append(h('div.sk2-group', gname));
    for (const def of list) el.append(skillCard(ui, def));
  }
}

function autoText(hero, id) {
  const ac = hero.autocast[id];
  const def = SKILL[id];
  if (def.basic) return '基本攻撃（ほかに使える技が無いときに使う）';
  if (ac?.on === false) return '自動では使わない';
  const c = ac?.cond || def.auto || 'always';
  return `自動で使う条件: ${(AUTO_CONDS.find((x) => x[0] === c) || AUTO_CONDS[0])[1]}`;
}

function skillCard(ui, def) {
  const g = ui.game;
  const st = g.state;
  const hero = st.hero;
  const sys = g.sys.skills;
  const H = g.H;
  const sk = hero.skills[def.id];
  const lvl = sk?.lvl || 0;
  const locked = def.unlock > hero.level;
  const inBar = hero.bar.indexOf(def.id);
  const open = expanded.has(def.id);
  const p = g.combat.params(def.id) || null;
  const m = sys.mastery(def.id);
  const dps = !locked ? estimateDps(st, H, def.id) : 0;
  const meta = [];
  if (!locked) {
    if (dps > 0) meta.push(h('span', ['火力 ', h('b', fmt(dps)), '/秒']));
    if (p?.cd) meta.push(h('span', ['待ち ', h('b', `${Math.round(p.cd * 10) / 10}`), ' 秒']));
    if (p?.cost > 0) meta.push(h('span', ['消費 ', h('b', fmt(p.cost))]));
    else if (p?.cost < 0) meta.push(h('span', ['回復 ', h('b', fmt(-p.cost))]));
    if (p?.supports?.length) meta.push(h('span', `刻印 ${p.supports.length}`));
  }
  const tags = [ELEMENT_NAMES[p?.element || def.element] || '', ...(def.tags || []).filter((t) => TAG_NAMES[t]).map((t) => TAG_NAMES[t])].filter(Boolean);
  const card = h(`div.sk2-card${inBar >= 0 ? '.inbar' : ''}${locked ? '.locked' : ''}${def.kind === 'ult' ? '.ult' : ''}`);
  const btns = h('div.sk2-btns');
  if (locked) btns.append(h('span.dim', { style: { fontSize: '11px', textAlign: 'center' } }, `Lv ${def.unlock} で解放`));
  else {
    btns.append(button(lvl ? `強化 +1` : '習得', () => { if (!sys.levelUp(def.id)) ui.toast(hero.skillPoints <= 0 ? 'スキルポイントが足りません' : `今は Lv ${sys.levelCap()} まで（主人公のレベルを上げよう）`, 'bad'); }, { kind: 'primary', disabled: !sys.canLevel(def.id) }));
    if (lvl) {
      if (selectedSlot >= 0) btns.append(button('ここに入れる', () => { sys.setBar(selectedSlot, def.id); selectedSlot = -1; }, { kind: 'small' }));
      else btns.append(button(inBar >= 0 ? '並びから外す' : '並びに入れる', () => { if (inBar >= 0) sys.setBar(inBar, null); else if (!sys.addToBar(def.id)) ui.toast('入れられません', 'bad'); }, { kind: 'small' }));
    }
  }
  const icon = iconOf(def.id, 52);
  if (lvl) { icon.draggable = true; icon.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ id: def.id })); e.stopPropagation(); }); }
  const stars = '★'.repeat(m.level) + '☆'.repeat(MASTERY_MAX - m.level);
  card.append(h('div.sk2-top', { onclick: (e) => { if (e.target.closest('button,select,input')) return; if (expanded.has(def.id)) expanded.delete(def.id); else expanded.add(def.id); ui.renderPanel(); } }, [
    icon,
    h('div', [
      h('div.sk2-name', [h('b', def.name), h(`span.sk2-kind.${def.kind}`, KIND_NAMES[def.kind] || ''), inBar >= 0 ? h('span.sk2-kind', inBar === 0 ? '並び: 基本' : `並び: ${inBar}`) : null, h('span.sk2-lv', locked ? '' : `Lv ${lvl}${p && p.lvl > lvl ? `（+${p.lvl - lvl}）` : ''} / ${SKILL_MAX_LEVEL}`)]),
      h('div.sk2-tags', tags.join('・')),
      h('div.sk2-desc', skillDesc(st, H, def.id, p || undefined)),
      meta.length ? h('div.sk2-meta', meta) : null,
      !locked ? h('div.sk2-mast', { title: masteryTip(def, m) }, [h('span.sk2-stars', stars), h('div.sk2-mbar', h('div', { style: { width: `${Math.round(m.pct * 100)}%` } })), h('span', m.max ? '熟練 最大' : `熟練 ${m.level}`)]) : null,
    ]),
    btns,
  ]));
  if (open && !locked) card.append(detail(ui, def, sk, p, m));
  return card;
}

function masteryTip(def, m) {
  const b = MASTERY_BONUS[def.kind] || MASTERY_BONUS.active;
  return `熟練度 ${m.level}/${MASTERY_MAX}（使うほど上がる。放置中も上がる）\n1 段ごとにダメージ +4%（今 +${m.level * 4}%）\n5 段: ${b.d5}\n10 段: ${b.d10}${m.next ? `\n次の段まで ${Math.ceil(m.next - m.xp)}` : ''}`;
}

function detail(ui, def, sk, p, m) {
  const g = ui.game;
  const hero = g.state.hero;
  const sys = g.sys.skills;
  const wrap = h('div.sk2-detail');
  // ルーン
  wrap.append(h('div', [h('div.sk2-sub', 'ルーン（1 つだけ選べる）'), h('div.sk2-runes', (def.runes || []).map((r, i) => {
    const ok = sys.runeUnlocked(def.id, r.id);
    const on = sk.rune === r.id;
    return h(`button.sk2-rune${on ? '.on' : ''}${ok ? '' : '.lock'}`, { onclick: () => { if (!ok) { ui.toast(`スキル Lv ${sys.runeLevel(i)} で解放`); return; } sys.setRune(def.id, on ? null : r.id); } }, [h('b', r.name), h('small', ok ? r.desc : `スキル Lv ${sys.runeLevel(i)} で解放 — ${r.desc}`)]);
  }))]));
  // 補助の刻印
  const open = sys.openSockets();
  wrap.append(h('div', [h('div.sk2-sub', '補助の刻印の穴'), h('div.sk2-sockets', [0, 1, 2].map((i) => {
    const gl = sk.supports[i];
    if (i >= open) return h('div.sk2-sock.closed', [h('b', '封じられた穴'), h('small', `主人公 Lv ${SOCKET_LEVELS[i]} で開く`)]);
    if (!gl) return h('div.sk2-sock', { onclick: () => pickGlyph(ui, def.id, i) }, [h('b', '＋ 刻印をはめる'), h('small', `合う刻印 ${countFits(g, def)} 個`)]);
    const sup = SUPPORT[gl.id];
    const fits = sup && supportFits(sup, def);
    return h('div.sk2-sock.full', { style: { '--gc': glyphColor(gl.id) }, onclick: () => socketMenu(ui, def.id, i) }, [h('b', `${sup?.name || gl.id} Lv ${gl.lvl}`), h('small', fits ? sup.desc(gl.lvl) : 'このスキルには効かない')]);
  }))]));
  // 自動
  if (!def.basic) {
    const ac = hero.autocast[def.id] || {};
    const cur = ac.cond || def.auto || 'always';
    wrap.append(h('div.sk2-auto', [
      h('label.chk', [h('input', { type: 'checkbox', checked: ac.on !== false || undefined, onchange: (e) => sys.setAuto(def.id, { on: e.target.checked }) }), ' 自動で使う']),
      '条件: ', h('select', { onchange: (e) => sys.setAuto(def.id, { cond: e.target.value }) }, AUTO_CONDS.map(([v, l]) => h('option', { value: v, selected: v === cur || undefined }, l))),
    ]));
  }
  // 熟練度の効果
  const b = MASTERY_BONUS[def.kind] || MASTERY_BONUS.active;
  wrap.append(h('div.sk2-mlist', [
    h('span', { class: m.level > 0 ? 'ok' : '' }, `熟練: ダメージ +${m.level * 4}%`),
    h('span', { class: m.level >= 5 ? 'ok' : '' }, `5 段: ${b.d5}`),
    h('span', { class: m.level >= 10 ? 'ok' : '' }, `10 段: ${b.d10}`),
    m.next ? h('span', `次まで ${fmt(Math.ceil(m.next - m.xp))}`) : null,
  ]));
  return wrap;
}

function countFits(g, def) { return g.state.inv.glyphs.filter((x) => SUPPORT[x.id] && supportFits(SUPPORT[x.id], def)).length; }

function pickGlyph(ui, skillId, slot) {
  const g = ui.game;
  const sys = g.sys.skills;
  const def = SKILL[skillId];
  const list = g.state.inv.glyphs.slice().sort((a, b) => {
    const fa = supportFits(SUPPORT[a.id], def) ? 0 : 1; const fb = supportFits(SUPPORT[b.id], def) ? 0 : 1;
    return fa - fb || b.lvl - a.lvl || a.id.localeCompare(b.id);
  });
  let modal = null;
  const rows = list.map((gl) => {
    const prob = sys.socketProblem(skillId, slot, gl);
    return glyphEl(gl, { cls: prob ? 'no' : '', right: prob ? h('span.dim', { style: { fontSize: '10px', maxWidth: '90px' } }, prob) : h('span.good', { style: { fontSize: '12px' } }, 'はめる'), onclick: () => { if (prob) return; const r = sys.socket(skillId, slot, gl.uid); if (!r.ok) ui.toast(r.msg, 'bad'); else { ui.toast(`「${SUPPORT[gl.id].name}」をはめました`, 'good'); modal?.close(); } } });
  });
  modal = ui.modal(`「${def.name}」の穴 ${slot + 1} に刻印をはめる`, h('div.gl-pick', rows.length ? rows : h('p.dim', '補助の刻印をまだ持っていません。敵（特にエリート・ボス）が落とします。')), [{ label: '閉じる' }]);
}

function socketMenu(ui, skillId, slot) {
  const g = ui.game;
  const sys = g.sys.skills;
  const sk = g.state.hero.skills[skillId];
  const gl = sk.supports[slot];
  if (!gl) return;
  const dupes = g.state.inv.glyphs.filter((x) => x.id === gl.id);
  ui.modal('補助の刻印', h('div', [glyphEl(gl), dupes.length ? h('p.hint', `持ち物に同じ刻印が ${dupes.length} 個あります。合成するとレベルが上がります。`) : null]), [
    { label: '外す', onclick: () => { sys.unsocket(skillId, slot); } },
    { label: '入れ替える', onclick: () => { setTimeout(() => pickGlyph(ui, skillId, slot), 0); } },
    dupes.length && gl.lvl < SUPPORT_MAX_LEVEL ? { label: `同じ刻印を合成（${dupes.length}）`, kind: 'primary', onclick: () => { for (const d of dupes) sys.fuse(gl.uid, d.uid); ui.toast(`Lv ${gl.lvl} になりました`, 'good'); } } : null,
    { label: '閉じる' },
  ].filter(Boolean));
}

function renderGlyphs(ui, el) {
  const g = ui.game;
  const sys = g.sys.skills;
  const inv = g.state.inv;
  const hero = g.state.hero;
  const socketed = [];
  for (const [sid, sk] of Object.entries(hero.skills)) sk.supports.forEach((gl, i) => { if (gl?.id) socketed.push({ gl, sid, i }); });
  const dupes = Object.values(inv.glyphs.reduce((o, x) => { (o[x.id] ||= []).push(x); return o; }, {})).filter((l) => l.length > 1).length;
  el.append(h('div.gl-sum', [
    h('span', `持ち物 ${inv.glyphs.length} 個`), h('span', `はめている ${socketed.length} 個`), h('span', `穴 ${sys.openSockets()} / 3 開いている（Lv ${SOCKET_LEVELS.join(' / ')}）`),
  ]));
  el.append(h('div.toolbar', [
    button(`まとめて合成${dupes ? `（${dupes} 種）` : ''}`, () => { const n = sys.fuseAll(); ui.toast(n ? `${n} 個を合成しました` : '合成できる刻印がありません', n ? 'good' : ''); }, { kind: 'small' }),
    h('label.chk', [h('input', { type: 'checkbox', checked: inv.glyphAutoFuse || undefined, onchange: (e) => sys.setGlyphAutoFuse(e.target.checked) }), ' 拾ったとき自動で合成']),
    h('select', { onchange: (e) => { glyphSort = e.target.value; ui.renderPanel(); } }, [['cat', '種類順'], ['lvl', 'レベル順'], ['name', '名前順']].map(([v, l]) => h('option', { value: v, selected: glyphSort === v || undefined }, l))),
  ]));
  if (socketed.length) {
    el.append(h('h3.sec-title', 'はめている刻印'));
    for (const s of socketed) el.append(glyphEl(s.gl, { where: `「${SKILL[s.sid]?.name}」`, right: button('外す', () => sys.unsocket(s.sid, s.i), { kind: 'small' }) }));
  }
  el.append(h('h3.sec-title', '持ち物'));
  const cats = Object.keys(SUPPORT_CATS);
  const list = inv.glyphs.slice().sort((a, b) => {
    if (glyphSort === 'lvl') return b.lvl - a.lvl || a.id.localeCompare(b.id);
    if (glyphSort === 'name') return SUPPORT[a.id].name.localeCompare(SUPPORT[b.id].name, 'ja');
    return cats.indexOf(SUPPORT[a.id].cat) - cats.indexOf(SUPPORT[b.id].cat) || a.id.localeCompare(b.id) || b.lvl - a.lvl;
  });
  if (!list.length) el.append(h('p.hint', '補助の刻印は敵が落とします（普通の敵 約 300 体に 1 つ。エリートは約 40 体に 1 つ、ボスは 4 体に 1 つ）。'));
  for (const gl of list) {
    const same = inv.glyphs.filter((x) => x.id === gl.id && x !== gl);
    const right = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } }, [
      same.length && gl.lvl < SUPPORT_MAX_LEVEL ? button(`合成 +${same.length}`, () => { for (const d of same) sys.fuse(gl.uid, d.uid); }, { kind: 'small', title: '同じ刻印をこれに合成する' }) : null,
      button('はめる', () => socketWizard(ui, gl), { kind: 'small' }),
    ]);
    el.append(glyphEl(gl, { right }));
  }
  el.append(h('h3.sec-title', `刻印の図鑑（${SUPPORTS.length} 種）`));
  const known = new Set([...inv.glyphs.map((x) => x.id), ...socketed.map((s) => s.gl.id)]);
  el.append(h('div.hint', SUPPORTS.map((s) => (known.has(s.id) ? s.name : '？？？')).join('　')));
}

/** 持ち物の刻印から、はめるスキルを選ぶ */
function socketWizard(ui, gl) {
  const g = ui.game;
  const sys = g.sys.skills;
  const hero = g.state.hero;
  const open = sys.openSockets();
  if (!open) { ui.toast(`刻印の穴は主人公 Lv ${SOCKET_LEVELS[0]} で開きます`, 'bad'); return; }
  let modal = null;
  const rows = [];
  for (const def of skillsOf(hero.cls)) {
    const sk = hero.skills[def.id];
    if (!sk?.lvl) continue;
    for (let i = 0; i < open; i++) {
      const prob = sys.socketProblem(def.id, i, gl);
      if (prob && prob !== '同じ刻印は 1 つのスキルに 1 つまで') continue;
      if (prob) continue;
      const cur = sk.supports[i];
      rows.push(h('div.gl-row', { style: { '--gc': glyphColor(gl.id), cursor: 'pointer' }, onclick: () => { const r = sys.socket(def.id, i, gl.uid); if (!r.ok) ui.toast(r.msg, 'bad'); else { ui.toast(`「${def.name}」にはめました`, 'good'); modal?.close(); } } }, [
        iconOf(def.id, 36), h('div', [h('div.gl-name', [h('b', def.name), ` 穴 ${i + 1}${hero.bar.includes(def.id) ? '（並び）' : ''}`]), h('div.gl-req', cur ? `今: ${SUPPORT[cur.id]?.name} Lv ${cur.lvl}（入れ替え）` : '空き')]), h('span.good', 'はめる'),
      ]));
    }
  }
  modal = ui.modal(`「${SUPPORT[gl.id].name}」をはめる`, h('div.gl-pick', rows.length ? rows : h('p.dim', 'この刻印をはめられるスキルがありません。')), [{ label: '閉じる' }]);
}

// ---------------- HUD の知らせ（刻印・熟練度・新しいスキル）
let hudUi = null;
const boundGames = new WeakSet();
hudHooks.build.push((hud) => {
  hudUi = hud.ui;
  const game = hud.game;
  if (boundGames.has(game)) return null;
  boundGames.add(game);
  game.events.on('glyphFound', (e) => { if (!e.quiet && hudUi) hudUi.toast(`補助の刻印「${SUPPORT[e.glyph.id]?.name}」${e.fused ? `を合成 → Lv ${e.glyph.lvl}` : `Lv ${e.glyph.lvl} を拾った`}`, 'good'); });
  game.events.on('masteryUp', (e) => { if (!e.quiet && hudUi) hudUi.toast(`「${SKILL[e.id]?.name}」の熟練度が ${e.level} になった（ダメージ +${e.level * 4}%）`, 'level'); });
  game.events.on('skillLearned', (e) => { if (!e.quiet && hudUi) hudUi.toast(`新しいスキル「${SKILL[e.id]?.name}」を覚えた`, 'level'); });
  game.events.on('offlineSkills', (e) => { if (hudUi && (e.glyphs || e.mastery?.length)) hudUi.toast(`放置中に 補助の刻印 ${e.glyphs} 個・熟練度の上がったスキル ${e.mastery.length} 個`, 'good'); });
  return null;
});

export { clear, ELEMENT_COLORS, CLASS };
