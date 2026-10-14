// 図鑑の窓: 魔物図鑑（撃破数の段・種族へのダメージ）・宝物図鑑（ユニーク・セット・ミシック・伝説の力）・落とし物の表（確率の表示）。担当: メタ担当。

import { h, button, spriteImg, injectCss } from '../dom.js';
import { fmt, fmtPct } from '../../engine/format.js';
import { assets } from '../../render/assets.js';
import { attachTip } from '../tooltip.js';
import { FAMILIES, MONSTER } from '../../data/monsters.js';
import { UNIQUES, SETS, MYTHICS } from '../../data/uniques.js';
import { BASE, SLOT_NAMES, KIND_NAMES } from '../../data/items.js';
import { RARITIES, RARITY } from '../../data/rarity.js';
import { BAL } from '../../data/balance.js';
import { ELEMENT_NAMES, describeMod } from '../../data/stats.js';
import { PET_BAL, EGG } from '../../data/pets.js';
import { registry } from '../../game/registry.js';
import { KILL_TIERS, TIER_NAMES, SPECIES_MILESTONES, TREASURE_MILESTONES, TREASURE_EACH, legendaryPowers, setPieces } from '../../game/systems/bestiary.js';
import { tabs, card, bar } from '../metaui.js';

let view = 'monsters';
let fam = 'all';

const ATTACK_NAMES = { melee: '近接', ranged: '遠距離', caster: '術', charge: '突進', slam: '叩きつけ', summoner: '呼び出し', explode: '自爆' };
const RANKS = [['normal', '普通の敵'], ['champion', 'チャンピオン'], ['rare', '群れの長'], ['boss', 'ボス'], ['goblin', 'ため込み屋']];

export const bestiaryPanel = {
  id: 'bestiary', name: '図鑑', icon: '📖',
  refreshOn: ['meta:bestiary'],
  help: `<p><b>魔物図鑑</b>: 魔物ごとに ${KILL_TIERS.map((n) => n.toLocaleString('en-US')).join(' / ')} 体倒すと段が上がり、1 段ごとにその種族へのダメージ +1%。見つけた種類の割合が 10% / 25% / 50% / 100% になると全ダメージと最大ライフが上がります。</p>
<p><b>宝物図鑑</b>: ユニーク・セット・ミシック・伝説の力を初めて拾うと登録されます。1 つごとに小さな永続の効果、集めた割合でさらに大きな効果があります。</p>
<p><b>落とし物の表</b>: いまのレア発見率・苦行で、どのレアリティが何 % で落ちるかを実際の計算で出しています。</p>`,
  badge: (g) => g.state.meta.codexSeen?.unseen || 0,
  render(ui, el) {
    injectCss('meta-best', CSS);
    const g = ui.game;
    el.append(tabs([['monsters', '魔物図鑑'], ['treasure', '宝物図鑑', g.state.meta.codexSeen?.unseen || 0], ['drops', '落とし物の表']], view, (id) => { view = id; ui.renderPanel(); }));
    if (view === 'treasure') { renderTreasure(ui, el); if (g.state.meta.codexSeen) g.state.meta.codexSeen.unseen = 0; }
    else if (view === 'drops') renderDrops(ui, el);
    else renderMonsters(ui, el);
  },
};

function tierDots(t) { return h('span.bs-dots', [0, 1, 2, 3].map((i) => h(`i${i < t ? '.on' : ''}`))); }

function renderMonsters(ui, el) {
  const g = ui.game; const sys = g.sys.bestiary;
  const ents = sys.entries();
  const ms = sys.milestones();
  const fb = sys.familyBonus();
  const next = SPECIES_MILESTONES[ms.speciesStep];
  el.append(h('div.mt-cards', [
    card('見つけた魔物', `${sys.speciesCount()} / ${ents.length}`, `${Math.round(ms.species * 100)}%`),
    card('段の合計', String(ents.reduce((s, e) => s + e.tier, 0)), `天敵 ${sys.tierCount(4)} 種`),
    card('割合の効果', SPECIES_MILESTONES[ms.speciesStep - 1] ? `+${SPECIES_MILESTONES[ms.speciesStep - 1].mods[0].v}%` : 'なし', 'ダメージ・最大ライフ'),
  ]));
  if (next) el.append(h('div.bs-next', [bar((ms.species / next.pct) * 100, `${Math.round(ms.species * 100)}% / ${Math.round(next.pct * 100)}%`, 'good'), h('span.small', `${Math.round(next.pct * 100)}% で ${next.mods.map((m) => describeMod(m)).join('・')}`)]));
  const fams = Object.keys(FAMILIES).filter((f) => ents.some((e) => e.def.family === f));
  el.append(h('div.bs-fams', [
    h(`button.bs-fam${fam === 'all' ? '.on' : ''}`, { onclick: () => { fam = 'all'; ui.renderPanel(); } }, 'すべて'),
    ...fams.map((f) => h(`button.bs-fam${fam === f ? '.on' : ''}`, { onclick: () => { fam = f; ui.renderPanel(); } }, [FAMILIES[f], fb[f] ? h('small', ` +${fb[f]}%`) : null])),
  ]));
  const grid = h('div.bs-grid');
  for (const e of ents) {
    if (fam !== 'all' && e.def.family !== fam) continue;
    const known = e.kills > 0;
    const pct = e.next ? Math.min(100, (e.kills / e.next) * 100) : 100;
    const c = h(`div.bs-mon${known ? '' : '.unknown'}${e.def.boss ? '.boss' : ''}`, { onclick: () => monsterModal(ui, e) }, [
      h('div.bs-pic', spriteImg(assets, `monster.${e.id}`, 64)),
      h('div.bs-nm', known ? e.def.name : '？？？'),
      known ? tierDots(e.tier) : h('div.bs-hint', e.zones[0] ? `${e.zones[0]}` : '未発見'),
      known ? bar(pct, e.next ? `${fmt(e.kills)} / ${fmt(e.next)}` : `${fmt(e.kills)}（極めた）`, e.tier >= 4 ? 'gold' : 'good') : null,
      e.def.boss ? h('span.bs-boss', 'ボス') : null,
    ]);
    grid.append(c);
  }
  el.append(grid);
  el.append(h('div.hint', '魔物を押すと詳しく見られます。黒い影はまだ倒していない魔物です。'));
}

function monsterModal(ui, e) {
  const g = ui.game; const known = e.kills > 0; const d = e.def;
  const fb = g.sys.bestiary.familyBonus()[d.family] || 0;
  const res = Object.entries(d.res || {}).filter(([, v]) => v).map(([k, v]) => `${ELEMENT_NAMES[k] || k} ${v > 0 ? '+' : ''}${v}%`).join('・');
  const pic = h(`div.bs-big${known ? '' : '.unknown'}`, spriteImg(assets, `monster.${e.id}`, 160));
  const rows = known ? [
    ['種族', `${FAMILIES[d.family] || d.family || '-'}（この種族へのダメージ +${fb}%）`],
    ['攻め方', `${ATTACK_NAMES[d.attack] || d.attack || '近接'}・${ELEMENT_NAMES[d.element || 'phys']}`],
    ['耐性', res || 'なし'],
    ['倒した数', `${fmt(e.kills)} 体（段 ${e.tier}「${TIER_NAMES[e.tier]}」）`],
    ['次の段', e.next ? `${fmt(e.next)} 体で段 ${e.tier + 1}（${d.family ? `${FAMILIES[d.family]}へのダメージ +1%` : ''}）` : 'すべての段を達成'],
    ['出る場所', e.zones.join('・') || '特別な場所'],
  ] : [['出る場所', e.zones.join('・') || '？？？'], ['ヒント', '倒すと図鑑に載ります']];
  ui.modal(known ? d.name : '？？？', h('div.bs-detail', [pic, h('table.kv', rows.map(([k, v]) => h('tr', [h('th', k), h('td', v)])))]), [{ label: '閉じる' }]);
}

function itemIconId(u) {
  const b = BASE[u.base] || Object.values(BASE).find((x) => x.kind === u.base && x.slot === (u.slot || x.slot));
  if (b?.icon) return b.icon;
  if (u.slot && ['amulet', 'ring'].includes(u.slot)) return `icon.item.${u.slot}`;
  return `icon.item.${u.base || u.slot || 'sword'}`;
}

function treasureCell(ui, u, kind, known) {
  const r = RARITY[kind === 'sets' ? 'set' : kind === 'mythics' ? 'mythic' : 'unique'];
  const cell = h(`div.bs-tr${known ? '' : '.unknown'}`, { style: `--rc:${r.color}` }, [spriteImg(assets, itemIconId(u), 42), h('div.bs-trn', known ? u.name : '？？？')]);
  attachTip(cell, () => h('div.tipbox', known ? [
    h('b', { style: { color: r.color } }, u.name),
    h('div.dim', `${r.name}　${SLOT_NAMES[u.slot] || KIND_NAMES[u.base] || ''}${u.setName ? `　セット「${u.setName}」` : ''}`),
    u.flavor ? h('div.bs-flavor', `「${u.flavor}」`) : null,
    u.power?.id && registry.power(u.power.id) ? h('div.pw-name', `◆ ${registry.power(u.power.id).name}`) : null,
  ] : [h('b', '？？？'), h('div.dim', `${r.name}${u.slot ? `　${SLOT_NAMES[u.slot] || ''}` : ''}`), h('div.small', 'まだ拾っていない宝物。拾うと図鑑に載ります。')]));
  return cell;
}

function renderTreasure(ui, el) {
  const g = ui.game; const sys = g.sys.bestiary; const c = g.state.meta.collection;
  const tc = sys.treasureCounts();
  const total = sys.treasureTotal();
  const ms = sys.milestones();
  const next = TREASURE_MILESTONES[ms.treasureStep];
  el.append(h('div.mt-cards', [
    card('登録', `${sys.treasureCount()} / ${total}`, total ? `${Math.round(ms.treasure * 100)}%` : ''),
    card('ユニーク', `${tc.uniques} / ${tc.uniquesTotal}`, `1 つごとに ${describeMod(TREASURE_EACH.uniques)}`),
    card('セット', `${tc.sets} / ${tc.setsTotal}`, `1 つごとに ${describeMod(TREASURE_EACH.sets)}`),
    card('ミシック', `${tc.mythics} / ${tc.mythicsTotal}`, `1 つごとに 最終ダメージ +${TREASURE_EACH.mythics.v}%`),
    card('伝説の力', `${tc.powers} / ${tc.powersTotal}`, `1 つごとに ${describeMod(TREASURE_EACH.powers)}`),
  ]));
  if (total) {
    el.append(h('div.bs-next', [bar(next ? (ms.treasure / next.pct) * 100 : 100, next ? `${Math.round(ms.treasure * 100)}% / ${Math.round(next.pct * 100)}%` : 'すべての節目を達成', 'gold'), next ? h('span.small', `${Math.round(next.pct * 100)}% で ${next.mods.map((m) => describeMod(m)).join('・')}`) : null]));
  }
  const sec = (title, list, kind) => {
    el.append(h('h3.sec-title', [title, h('span.sec-right', `${list.filter((u) => c[kind][u.id]).length} / ${list.length}`)]));
    if (!list.length) { el.append(h('div.dim.small', 'この種類の宝物はまだこの世界にありません。')); return; }
    el.append(h('div.bs-trs', list.map((u) => treasureCell(ui, u, kind, !!c[kind][u.id]))));
  };
  sec('ユニーク', UNIQUES, 'uniques');
  if (SETS.length) {
    el.append(h('h3.sec-title', ['セット', h('span.sec-right', `${tc.sets} / ${tc.setsTotal}`)]));
    for (const s of SETS) {
      const pcs = (s.pieces || []).map((pc) => ({ ...pc, setName: s.name }));
      el.append(h('div.bs-set', [h('div.bs-setn', [s.name, h('span.dim', `　${pcs.filter((p) => c.sets[p.id]).length} / ${pcs.length}`)]), h('div.bs-trs', pcs.map((u) => treasureCell(ui, u, 'sets', !!c.sets[u.id])))]));
    }
  } else sec('セット', setPieces(), 'sets');
  sec('ミシック', MYTHICS, 'mythics');
  const pw = legendaryPowers();
  el.append(h('h3.sec-title', ['伝説の力', h('span.sec-right', `${tc.powers} / ${pw.length}`)]));
  if (!pw.length) el.append(h('div.dim.small', '伝説の力はまだこの世界にありません。'));
  else {
    el.append(h('div.bs-pws', pw.map((p) => {
      const known = !!c.powers[p.id];
      const v = registry.powerValue(p.id, typeof c.powers[p.id] === 'number' && c.powers[p.id] <= 1 ? c.powers[p.id] : 1);
      return h(`div.bs-pw${known ? '' : '.unknown'}`, [h('b', known ? p.name : '？？？'), h('div.small', known ? (typeof p.desc === 'function' ? p.desc(v) : p.desc || '') : 'レジェンダリーの装備に付く力。拾うと登録されます。')]);
    })));
  }
}

function renderDrops(ui, el) {
  const g = ui.game; const sys = g.sys.bestiary; const st = g.state; const H = g.H;
  const diff = g.sys.world.difficulty();
  const mf = (H?.mf || 0) + (diff.mf || 0);
  const torment = st.world.torment || 0;
  const qty = H?.quantity || 0;
  el.append(h('div.mt-cards', [
    card('レア発見率', fmtPct(mf), `実効 ${fmtPct(BAL.mfEffective(mf))}（多いほど逓減）`),
    card('アイテム発見数', `+${fmtPct(qty)}`, `苦行の数 ×${(diff.loot || 1).toFixed(2)}`),
    card('苦行', torment ? `${torment}` : 'なし', torment ? `太古 ${fmtPct((diff.ancient || 0) * 100)}・原初 ${fmtPct((diff.primal || 0) * 100, 2)}` : `太古 ${fmtPct((diff.ancient ?? 0.08) * 100)}（レジェンダリー以上）`),
  ]));
  const odds = Object.fromEntries(RANKS.map(([rk]) => [rk, sys.rarityOdds({ mf, rank: rk, torment })]));
  const head = h('tr', [h('th', 'レアリティ'), ...RANKS.map(([, n]) => h('th', n))]);
  const rows = RARITIES.map((r) => h('tr', [
    h('td', { style: { color: r.color } }, r.name),
    ...RANKS.map(([rk]) => h('td', pctText(odds[rk][r.id]))),
  ]));
  el.append(h('h3.sec-title', '1 個落ちたときのレアリティ'), h('div.bs-scroll', h('table.bs-odds', [head, ...rows])));
  const per = (rk) => BAL.ITEM_DROP_CHANCE * (BAL.RANK[rk]?.loot || 1) * (1 + qty / 100) * (diff.loot || 1);
  const rate = g.sys.offline.rates();
  const legOdds = ['legendary', 'set', 'unique', 'mythic'].reduce((s, id) => s + odds.normal[id], 0);
  const perKillLeg = per('normal') * legOdds;
  el.append(h('h3.sec-title', '目安'));
  el.append(h('table.kv', [
    ['普通の敵 1 体の落とす数', `${per('normal').toFixed(3)} 個（ボスは最低 2 個・1 つ目はレア以上）`],
    ['レジェンダリー以上', perKillLeg > 0 ? `普通の敵 約 ${fmt(Math.round(1 / perKillLeg))} 体に 1 個` : '-'],
    ['ミシック', odds.normal.mythic > 0 ? `普通の敵 約 ${fmt(Math.round(1 / (per('normal') * odds.normal.mythic)))} 体に 1 個` : '-'],
    ['いまの撃破の速さで', rate.kills > 0 ? `レジェンダリー以上 約 ${(rate.kills * 3600 * perKillLeg).toFixed(1)} 個/時` : '-'],
  ].map(([k, v]) => h('tr', [h('th', k), h('td', v)]))));
  // 卵
  const pity = g.sys.pets.pity();
  el.append(h('h3.sec-title', 'ペットの卵'));
  el.append(h('table.kv', [
    ...Object.entries(PET_BAL.EGG_CHANCE).map(([rk, p]) => [{ champion: 'チャンピオン', rare: '群れの長', boss: 'ボス', actboss: '章のボス', guardian: '裂け目の守護者', goblin: 'ため込み屋' }[rk] || rk, `${fmtPct(p * g.sys.pets.eggMul() * 100, 2)}（約 ${Math.round(1 / (p * g.sys.pets.eggMul()))} 体に 1 個）`]),
    ['天井', `エリート・ボスを ${PET_BAL.PITY} 体倒すと必ず落ちる（いま ${pity.cur} / ${pity.max}）`],
  ].map(([k, v]) => h('tr', [h('th', k), h('td', v)]))));
  el.append(bar((pity.cur / pity.max) * 100, `卵の天井 ${pity.cur} / ${pity.max}`, 'soul'));
  // 幸運ゲージ（アイテム担当）
  let luck = null;
  try { luck = g.sys.merchant?.luck?.(); } catch (e) { console.error(e); }
  if (luck && typeof luck === 'object') {
    el.append(h('h3.sec-title', '幸運ゲージ（見える天井）'));
    for (const [k, v] of Object.entries(luck)) {
      const o = typeof v === 'number' ? { pct: v } : v || {};
      const pct = o.pct ?? (o.max ? (o.cur / o.max) * 100 : (o.value || 0) * (o.value <= 1 ? 100 : 1));
      el.append(h('div.bs-luck', [h('span', o.name || RARITY[k]?.name || k), bar(pct > 1 || pct === 0 ? pct : pct * 100, o.max ? `${fmt(o.cur)} / ${fmt(o.max)}` : `${Math.round(pct > 1 ? pct : pct * 100)}%`, 'gold')]));
    }
  }
  // 今の地域
  const z = g.sys.world.zone();
  if (z && st.world.mode === 'campaign') {
    el.append(h('h3.sec-title', `この地域「${z.name}」`));
    el.append(h('div.bs-zone', [...z.monsters, z.boss].filter((id) => MONSTER[id]).map((id) => h('span.mt-chip', [MONSTER[id].boss ? '👑 ' : '', st.meta.bestiary[id] ? MONSTER[id].name : '？？？']))));
    el.append(h('div.hint', `ボスは必ず 2 個以上落とし、1 つ目はレア以上。アイテム Lv はエリア Lv（${g.sys.world.level()}）と同じ。卵: ${Object.values(EGG).map((e) => e.name).join('・')}。`));
  }
}

function pctText(p) {
  if (!(p > 0)) return '-';
  const v = p * 100;
  if (v >= 10) return `${v.toFixed(1)}%`;
  if (v >= 1) return `${v.toFixed(2)}%`;
  if (v >= 0.01) return `${v.toFixed(3)}%`;
  return `${v.toPrecision(2)}%`;
}

const CSS = `
.bs-fams { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.bs-fam { background: #1a1620; color: var(--dim); border: 1px solid var(--line); border-radius: 12px; padding: 2px 10px; cursor: pointer; font-size: 12px; }
.bs-fam.on { color: var(--gold2); border-color: var(--gold); }
.bs-fam small { color: var(--good); }
.bs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(98px, 1fr)); gap: 6px; }
.bs-mon { position: relative; border: 1px solid var(--line); border-radius: 8px; padding: 5px 5px 6px; background: radial-gradient(circle at 50% 35%, #2a2230, #110e14 75%); text-align: center; cursor: pointer; display: flex; flex-direction: column; gap: 3px; align-items: center; min-width: 0; }
.bs-mon:hover { filter: brightness(1.2); }
.bs-mon.boss { border-color: #6a3a2a; background: radial-gradient(circle at 50% 35%, #3a2020, #110e14 75%); }
.bs-mon .mt-bar { width: 100%; height: 10px; } .bs-mon .mt-bar > span { font-size: 8.5px; line-height: 9px; }
.bs-pic { height: 64px; display: flex; align-items: center; justify-content: center; }
.bs-mon.unknown .bs-pic canvas, .bs-big.unknown canvas { filter: brightness(0) drop-shadow(0 0 2px #6a5a7a); opacity: .85; }
.bs-nm { font-size: 11.5px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.bs-mon.unknown .bs-nm { color: var(--dim); }
.bs-hint { font-size: 9.5px; color: #6a6070; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.bs-boss { position: absolute; top: 3px; right: 3px; font-size: 9px; background: #8a2a1a; color: #fff; border-radius: 4px; padding: 0 4px; }
.bs-dots { display: flex; gap: 3px; } .bs-dots i { width: 7px; height: 7px; border-radius: 50%; background: #2a2430; border: 1px solid #4a4050; } .bs-dots i.on { background: var(--gold); border-color: var(--gold2); box-shadow: 0 0 4px var(--gold); }
.bs-detail { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.bs-big { background: radial-gradient(circle, #2a2230, transparent 70%); border-radius: 10px; }
.bs-trs { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 5px; margin-bottom: 6px; }
.bs-tr { border: 1px solid color-mix(in srgb, var(--rc) 50%, #2a2230); border-radius: 7px; padding: 4px; text-align: center; background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--rc) 18%, #120f16), #0d0b10 80%); display: flex; flex-direction: column; align-items: center; gap: 2px; }
.bs-tr.unknown { border-color: #2a2230; background: #110e14; }
.bs-tr.unknown canvas { filter: brightness(0) drop-shadow(0 0 1px #5a5060); opacity: .8; }
.bs-trn { font-size: 10px; line-height: 1.25; color: var(--rc); max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bs-tr.unknown .bs-trn { color: #5a5262; }
.bs-flavor { color: #c8b896; font-style: italic; font-size: 12px; margin: 3px 0; }
.bs-set { margin-bottom: 6px; } .bs-setn { font-size: 12.5px; color: var(--r-set); margin: 4px 0; }
.bs-pws { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 5px; }
.bs-pw { border: 1px solid #4a3218; border-left: 3px solid var(--r-legendary); border-radius: 6px; padding: 5px 8px; background: rgba(255,140,40,.05); }
.bs-pw b { color: var(--r-legendary); font-size: 12.5px; } .bs-pw .small { color: #e0c8a8; }
.bs-pw.unknown { border-color: #2a2230; border-left-color: #4a4050; background: #110e14; } .bs-pw.unknown b, .bs-pw.unknown .small { color: #5a5262; }
.bs-scroll { overflow-x: auto; }
table.bs-odds { width: 100%; border-collapse: collapse; font-size: 12px; background: #120f16; border: 1px solid var(--line); }
table.bs-odds th { color: var(--dim); font-weight: 400; padding: 4px 5px; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
table.bs-odds th:first-child, table.bs-odds td:first-child { text-align: left; }
table.bs-odds td { padding: 3px 5px; text-align: right; border-bottom: 1px solid #221d28; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bs-luck { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; font-size: 12px; margin: 3px 0; }
.bs-zone { display: flex; flex-wrap: wrap; gap: 4px; }
.bs-next { display: flex; flex-wrap: wrap; gap: 3px 8px; align-items: center; margin-bottom: 6px; } .bs-next .mt-bar { flex: 1 1 140px; }
.bs-next .small { color: var(--good); }
`;
