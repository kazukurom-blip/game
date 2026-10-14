// 「おかえりなさい」の報告（放置していた間の稼ぎ）。担当: メタ担当。
// 低いレアリティから順にめくって見せ、上位の品は光らせる。「すべて見る」で演出を飛ばせる。良い品はその場で装備できる。
// 5 分未満の短い留守は窓を出さず、知らせ（トースト）だけにする。
// 報告の項目は game/systems/offline.js の先頭。ほかの担当が足した項目（luck・gems・runes）も、あれば出す。

import { h, button, injectCss } from './dom.js';
import { fmt, fmtTime, fmtPct } from '../engine/format.js';
import { RARITIES, RARITY } from '../data/rarity.js';
import { EGG } from '../data/pets.js';
import { itemCell } from './panels/common.js';
import { itemName } from '../game/items.js';
import { matChips, bar } from './metaui.js';

const SHORT_SEC = 300;

export function showOfflineReport(ui, rep) {
  if (!rep) return;
  injectCss('meta-offline', CSS);
  const g = ui.game;
  if (rep.reason === 'away' && rep.seconds < SHORT_SEC) {
    ui.toast(`離れていた ${fmtTime(rep.seconds, true)} の稼ぎ: 撃破 ${fmt(rep.kills)}・ゴールド +${fmt(rep.gold)}${rep.levels ? `・Lv +${rep.levels}` : ''}`, 'good');
    for (const it of rep.best || []) if (RARITY[it.rarity]?.idx >= 4) ui.toast(`放置中に ${RARITY[it.rarity].name}「${itemName(it)}」を拾った`, `r-${it.rarity}`);
    return;
  }
  const root = h('div.ofr');
  let step = 0;
  const S = (el, extra = 0) => { if (!el) return null; el.classList.add('ofr-s'); el.style.animationDelay = `${(step++ * 0.18 + extra).toFixed(2)}s`; return el; };
  // 見出し
  const capH = rep.cap ? rep.cap / 3600 : 8;
  root.append(S(h('div.ofr-head', [
    h('div.ofr-time', fmtTime(rep.seconds, true)),
    h('div.ofr-sub', rep.reason === 'away' ? '離れていました' : '留守にしていました'),
    h('div.ofr-note', [
      `上限 ${Math.round(capH)} 時間・効率 ${Math.round((rep.eff || 0) * 100)}%`,
      rep.over > 0 ? h('span.warn', `　上限を超えた ${fmtTime(rep.over, true)} は ${Math.round((rep.overEff || 0.25) * 100)}% の効率で数えました`) : null,
      rep.seconds > (rep.capped || 0) + (rep.over || 0) + 1 ? h('span.warn', `　（${fmtTime(rep.seconds - rep.capped - (rep.over || 0), true)} は数えていません）`) : null,
    ]),
  ])));
  // 数字
  root.append(S(h('div.ofr-cards', [
    ocard('倒した敵', fmt(rep.kills), rep.elites ? `エリート ${fmt(rep.elites)}` : `${fmt((rep.rate?.kills || 0) * 3600)} 体/時`),
    ocard('経験値', `+${fmt(rep.xp)}`, rep.levels ? `Lv ${rep.levelFrom} → ${rep.levelTo}` : rep.paragon ? `パラゴン ${rep.paragonFrom} → ${rep.paragonTo}` : `Lv ${g.state.hero.level}`, rep.levels || rep.paragon ? 'up' : ''),
    ocard('ゴールド', `+${fmt(rep.gold)}`, `いま ${fmt(g.state.meta.gold)}`, 'gold'),
    ocard('拾った装備', fmt(rep.drops ?? Object.values(rep.found || {}).reduce((s, v) => s + v, 0)), `分解 ${fmt(rep.salvaged || 0)}`),
  ])));
  // レアリティの順にめくる
  const found = rep.found || {};
  const maxN = Math.max(1, ...Object.values(found));
  const rows = RARITIES.filter((r) => found[r.id]);
  if (rows.length) {
    root.append(S(h('h4.ofr-h', 'ドロップ')));
    const box = h('div.ofr-rar');
    for (const r of rows) {
      const n = found[r.id];
      box.append(S(h(`div.ofr-r${r.idx >= 4 ? '.hi' : ''}`, { style: `--rc:${r.color}` }, [
        h('span.ofr-rn', r.name),
        h('div.ofr-rb', h('i', { style: { width: `${Math.max(3, (Math.log10(n + 1) / Math.log10(maxN + 1)) * 100)}%` } })),
        h('b', fmt(n)),
      ]), r.idx >= 4 ? 0.25 : 0));
    }
    root.append(box);
  }
  // 良い品
  // 着けられる物を先に（同じなら良いレアリティの順）
  const best = (rep.best || (rep.kept || []).slice(0, 8)).map((it, i) => ({ it, i, bad: !!g.sys.inv.equipProblem(it, it.slot === 'ring' ? 'ring1' : it.slot) }))
    .sort((a, b) => (a.bad - b.bad) || (a.i - b.i)).map((x) => x.it);
  if (best.length) {
    root.append(S(h('h4.ofr-h', 'いちばん良い品')));
    const list = h('div.ofr-best');
    for (const it of best) list.append(S(bestRow(ui, it, rep), RARITY[it.rarity]?.idx >= 5 ? 0.35 : 0.1));
    root.append(list);
  }
  // 素材とほかの項目
  const extras = [];
  if (rep.mats && Object.keys(rep.mats).length) extras.push(['素材', matChips(rep.mats)]);
  const luck = luckView(rep.luck);
  if (luck) extras.push(['幸運ゲージ', luck]);
  const gems = countView(rep.gems, '宝石'); if (gems) extras.push(['宝石', gems]);
  const runes = countView(rep.runes, 'ルーン'); if (runes) extras.push(['ルーン', runes]);
  const eggs = Object.entries(rep.eggs || {}).filter(([, v]) => v > 0);
  if (eggs.length) extras.push(['ペットの卵', h('div.mt-chips', eggs.map(([k, v]) => h('span.mt-chip', `🥚 ${EGG[k]?.name || k} ×${v}`)))]);
  if (rep.hatchReady) extras.push(['孵卵器', h('span.good', `${rep.hatchReady} 個の卵が孵ります`)]);
  if (rep.achievements?.length) extras.push(['実績', h('span.good', `${rep.achievements.length} 個を達成`)]);
  if (extras.length) root.append(S(h('div.ofr-extra', extras.map(([k, v]) => h('div.ofr-x', [h('span.ofr-k', k), v])))));
  // 次にできること
  const todo = nextActions(g, rep);
  if (todo.length) root.append(S(h('div.ofr-next', [h('b', '次にできること'), h('ul', todo.map((t) => h('li', t)))])));
  const m = ui.modal('おかえりなさい', root, [
    { label: 'すべて見る', onclick: () => { root.classList.add('skip'); return false; } },
    { label: '受け取る', kind: 'primary' },
  ], { wide: true });
  m.box.classList.add('ofr-modal');
  root.addEventListener('click', () => root.classList.add('skip'), { once: true });
  return m;
}

function ocard(k, v, sub, cls = '') {
  return h(`div.ofr-card${cls ? `.${cls}` : ''}`, [h('div.k', k), h('div.v', v), sub ? h('div.s', sub) : null]);
}

function bestRow(ui, it, rep) {
  const g = ui.game; const inv = g.sys.inv;
  const r = RARITY[it.rarity];
  const where = rep.where?.[it.uid];
  const info = h('div.ofr-bi', [h('div.ofr-bn', { style: { color: r.color } }, `${it.q === 2 ? '原初の ' : it.q === 1 ? '太古の ' : ''}${itemName(it)}`), h('div.dim.small', `${r.name}　アイテム Lv ${it.ilvl}`)]);
  const act = h('div.ofr-ba');
  const fill = () => {
    act.replaceChildren();
    const f = inv.findItem(it.uid);
    if (!f) { act.append(h('span.dim.small', where === 'salvaged' ? '分解ずみ' : 'なし')); return; }
    if (f.where === 'equip') { act.append(h('span.good.small', '装備中')); return; }
    let c = null;
    try { c = inv.compare(it); } catch (e) { console.error(e); }
    const prob = inv.equipProblem(it, it.slot === 'ring' ? 'ring1' : it.slot);
    if (c) act.append(h('div.ofr-cmp', [dspan('火力', c.dpsPct), dspan('耐久', c.ehpPct)]));
    if (!prob) act.append(button('装備する', () => { const res = inv.equip(it.uid); if (!res.ok) ui.toast(res.msg, 'bad'); else ui.toast(`「${itemName(it)}」を装備した`, 'good'); fill(); }, { kind: c && c.dpsPct + c.ehpPct * 0.6 > 0 ? 'primary' : 'small' }));
    else act.append(h('span.bad.small', prob));
  };
  fill();
  return h(`div.ofr-b${r.idx >= 4 ? '.hi' : ''}`, { style: `--rc:${r.color}` }, [itemCell(ui, it, { size: 40 }), info, act]);
}

function dspan(label, pct) {
  const cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'same';
  return h(`span.delta.${cls}`, `${label} ${pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '＝'}${fmtPct(Math.abs(pct))}`);
}

/** 幸運ゲージ（アイテム担当の rep.luck）。形がわからなくても出せるように */
export function luckView(luck) {
  if (!luck || typeof luck !== 'object') return null;
  const ent = Array.isArray(luck) ? luck.map((v, i) => [v?.id || String(i), v]) : Object.entries(luck);
  const rows = [];
  for (const [k, v] of ent) {
    if (v === null || v === undefined) continue;
    const o = typeof v === 'number' ? { pct: v } : v;
    if (typeof o !== 'object') continue;
    let pct = o.pct ?? (o.max ? (o.cur ?? o.value ?? 0) / o.max * 100 : o.value ?? o.ratio ?? 0);
    if (pct > 0 && pct <= 1 && !(o.pct > 1)) pct *= 100;
    const name = o.name || RARITY[k]?.name || k;
    rows.push(h('div.ofr-luck', [h('span', name), bar(pct, `${Math.round(pct)}%${o.forced || o.guaranteed ? '・天井で確定！' : ''}${o.gain ? `（+${Math.round(o.gain > 1 ? o.gain : o.gain * 100)}%）` : ''}`, 'gold')]));
  }
  return rows.length ? h('div.ofr-lucks', rows) : null;
}

function countView(v, label) {
  if (!v) return null;
  if (typeof v === 'number') return v > 0 ? h('span', `${label} +${fmt(v)}`) : null;
  if (Array.isArray(v)) return v.length ? h('div.mt-chips', v.slice(0, 12).map((x) => h('span.mt-chip', typeof x === 'object' ? (x.name || x.id || label) : String(x)))) : null;
  if (typeof v === 'object') {
    const ent = Object.entries(v).filter(([, n]) => typeof n === 'number' ? n > 0 : n);
    if (!ent.length) return null;
    return h('div.mt-chips', ent.slice(0, 16).map(([k, n]) => h('span.mt-chip', typeof n === 'number' ? `${k.replace(/_/g, ' ')} ×${fmt(n)}` : (n.name || k))));
  }
  return null;
}

function nextActions(g, rep) {
  const st = g.state; const out = [];
  if (st.hero.skillPoints > 0) out.push(`スキルポイントが ${st.hero.skillPoints} あります（スキルの窓）`);
  if (st.hero.tree?.points > 0) out.push(`パッシブの点が ${st.hero.tree.points} あります（星座盤の窓）`);
  const aff = g.sys.prestige?.affordableCount?.() || 0;
  if (aff) out.push(`魂の祭壇で ${aff} 個の強化が買えます（転生の窓）`);
  if (g.sys.prestige?.canRebirth?.().ok) out.push(`いま転生すると 魂 +${fmt(g.sys.prestige.previewSouls())}`);
  const bc = g.sys.bounties?.claimable?.() || 0;
  if (bc) out.push(`受け取れる日課・贈り物が ${bc} 個あります（日課の窓）`);
  if (rep.hatchReady || g.sys.pets?.hatchReady?.()) out.push('孵る卵があります（ペットの窓）');
  else if (g.sys.pets?.eggCount?.() && g.sys.pets?.freeIncubators?.() > 0) out.push('卵を孵卵器に入れられます（ペットの窓）');
  const bagNew = st.inv.bag.filter((x) => x.isNew).length;
  if (bagNew) out.push(`バッグに新しい品が ${bagNew} 個（持ち物の窓）`);
  return out;
}

const CSS = `
.ofr-modal { max-width: 760px; }
.ofr { display: flex; flex-direction: column; gap: 8px; }
.ofr-s { opacity: 0; transform: translateY(8px); animation: ofrIn .4s ease-out forwards; }
.ofr.skip .ofr-s { animation: none; opacity: 1; transform: none; }
@keyframes ofrIn { to { opacity: 1; transform: none; } }
.ofr-head { text-align: center; padding: 6px 0 2px; }
.ofr-time { font-family: var(--serif); font-size: 34px; font-weight: 900; color: var(--gold2); text-shadow: 0 0 16px rgba(245,217,138,.35); line-height: 1.1; }
.ofr-sub { color: var(--dim); letter-spacing: 3px; font-size: 12px; }
.ofr-note { font-size: 11.5px; color: var(--dim); margin-top: 4px; } .ofr-note .warn { color: #ffc070; }
.ofr-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.ofr-card { background: linear-gradient(#1d1823, #120f16); border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; text-align: center; min-width: 0; }
.ofr-card .k { font-size: 11px; color: var(--dim); }
.ofr-card .v { font-size: 18px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ofr-card.gold .v { color: var(--gold2); } .ofr-card.up .v { color: var(--good); }
.ofr-card .s { font-size: 10.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ofr-h { margin: 6px 0 0; font-family: var(--serif); color: var(--gold); font-size: 14px; border-left: 3px solid var(--gold); padding-left: 8px; }
.ofr-rar { display: flex; flex-direction: column; gap: 3px; }
.ofr-r { display: grid; grid-template-columns: 110px 1fr 70px; gap: 8px; align-items: center; font-size: 12.5px; padding: 2px 6px; border-radius: 5px; }
.ofr-rn { color: var(--rc); font-weight: 700; }
.ofr-r b { text-align: right; color: var(--rc); }
.ofr-rb { height: 8px; background: #0c0a10; border-radius: 4px; overflow: hidden; }
.ofr-rb i { display: block; height: 100%; background: var(--rc); box-shadow: 0 0 6px var(--rc); }
.ofr-r.hi { background: linear-gradient(90deg, color-mix(in srgb, var(--rc) 20%, transparent), transparent); animation-name: ofrIn, ofrGlow; animation-duration: .4s, 1.6s; animation-iteration-count: 1, infinite; animation-fill-mode: forwards, none; }
@keyframes ofrGlow { 50% { box-shadow: 0 0 14px color-mix(in srgb, var(--rc) 55%, transparent); } }
.ofr-best { display: flex; flex-direction: column; gap: 4px; }
.ofr-b { display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; align-items: center; background: #120f16; border: 1px solid #2a2230; border-radius: 8px; padding: 4px 8px; }
.ofr-b .cell { width: 42px; height: 42px; }
.ofr-b.hi { border-color: color-mix(in srgb, var(--rc) 70%, #2a2230); box-shadow: 0 0 12px color-mix(in srgb, var(--rc) 30%, transparent); }
.ofr-bn { font-weight: 800; font-family: var(--serif); font-size: 13.5px; }
.ofr-ba { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.ofr-cmp { display: flex; gap: 8px; font-size: 11.5px; font-weight: 700; }
.ofr-extra { display: flex; flex-direction: column; gap: 5px; background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
.ofr-x { display: grid; grid-template-columns: 84px 1fr; gap: 8px; align-items: center; font-size: 12px; }
.ofr-k { color: var(--dim); }
.ofr-lucks { display: flex; flex-direction: column; gap: 3px; }
.ofr-luck { display: grid; grid-template-columns: 100px 1fr; gap: 6px; align-items: center; }
.ofr-next { background: linear-gradient(120deg, #1d2a1a, #120f16 70%); border: 1px solid #2f5a3a; border-radius: 8px; padding: 7px 12px; font-size: 12.5px; }
.ofr-next b { color: var(--good); } .ofr-next ul { margin: 3px 0 0 18px; padding: 0; line-height: 1.6; }
@media (max-width: 900px) { .ofr-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ofr-r { grid-template-columns: 90px 1fr 56px; } .ofr-b { grid-template-columns: 44px 1fr; } .ofr-ba { grid-column: 1 / 3; } }
`;
