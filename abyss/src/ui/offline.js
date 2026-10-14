// 「おかえりなさい」の報告（放置していた間の稼ぎ）。

import { h } from './dom.js';
import { fmt, fmtTime } from '../engine/format.js';
import { RARITIES } from '../data/rarity.js';
import { MATERIAL } from '../data/materials.js';
import { itemCell } from './panels/common.js';

export function showOfflineReport(ui, rep) {
  if (!rep) return;
  const rows = [
    h('div.off-time', [rep.reason === 'away' ? '離れていた時間 ' : '放置していた時間 ', h('b', fmtTime(rep.seconds)), rep.capped < rep.seconds ? h('span.dim', `（上限 ${fmtTime(rep.capped)} まで）`) : null]),
    h('div.off-grid', [
      h('div', ['倒した敵 ', h('b', fmt(rep.kills))]),
      h('div', ['経験値 ', h('b', fmt(rep.xp))]),
      h('div', ['ゴールド ', h('b.gold', fmt(rep.gold))]),
      rep.levels ? h('div.good', `レベル +${rep.levels}`) : null,
      rep.paragon ? h('div.good', `パラゴン +${rep.paragon}`) : null,
    ]),
    h('div.off-found', RARITIES.filter((r) => rep.found[r.id]).map((r) => h('span', { style: { color: r.color } }, `${r.name} ${rep.found[r.id]}　`))),
    Object.keys(rep.mats).length ? h('div.off-mats', Object.entries(rep.mats).map(([k, v]) => h('span', `${MATERIAL[k]?.name || k} +${fmt(v)}　`))) : null,
    rep.kept.length ? h('div', [h('div.sec-title', '拾った良い装備'), h('div.grid', rep.kept.slice(0, 30).map((it) => itemCell(ui, it)))]) : null,
    h('div.dim.small', `放置の効率 ${Math.round(rep.eff * 100)}%（転生の強化で上がります）`),
  ];
  ui.modal('おかえりなさい', h('div.offline', rows), [{ label: '受け取る', kind: 'primary' }], { wide: true });
}
