// 地図の窓: 章と地域を選んで移動。到達したステージを選べる。

import { h, button } from '../dom.js';
import { ACTS, ZONES, STAGES_PER_ZONE } from '../../data/world.js';
import { MONSTER } from '../../data/monsters.js';

export const mapPanel = {
  id: 'map', name: '地図', icon: '🗺',
  refreshOn: ['world'],
  render(ui, el) {
    const g = ui.game;
    const w = g.state.world;
    for (const act of ACTS) {
      const zones = ZONES.filter((z) => z.act === act.id);
      if (!zones.length || zones[0].global > w.maxZone) { el.append(h('div.act.locked', [h('h3', act.name), h('div.dim', '前の章を進めると解放')])); continue; }
      const box = h('div.act', [h('h3', { style: { color: act.color } }, act.name), h('p.dim', act.desc)]);
      for (const z of zones) {
        const open = z.global <= w.maxZone;
        const cur = w.zone === z.id && w.mode === 'campaign';
        const maxS = w.maxStage[z.id] || 1;
        const row = h(`div.zone${cur ? '.cur' : ''}${open ? '' : '.locked'}`, [
          h('div.zn', [h('b', z.name), h('span.dim', `　Lv ${z.level}〜${z.level + 1}`), w.cleared[z.id] ? h('span.ok', '　踏破') : null]),
          h('div.zm', open ? `敵: ${z.monsters.map((m) => MONSTER[m]?.name).filter(Boolean).join('・')}　ボス: ${MONSTER[z.boss]?.name || '?'}` : '未解放'),
        ]);
        if (open) {
          const stages = h('div.stages');
          for (let s = 1; s <= STAGES_PER_ZONE; s++) {
            const ok = s <= maxS || w.cleared[z.id];
            stages.append(h(`button.st${ok ? '' : '.lock'}${cur && w.stage === s ? '.on' : ''}${s === STAGES_PER_ZONE ? '.boss' : ''}`, { disabled: !ok || undefined, onclick: () => { if (s === STAGES_PER_ZONE) { w.zone = z.id; g.sys.world.challengeBoss(); } else g.sys.world.travel(z.id, s); ui.renderPanel(); } }, s === STAGES_PER_ZONE ? 'B' : String(s)));
          }
          row.append(stages);
        }
        box.append(row);
      }
      el.append(box);
    }
    el.append(h('div.hint', 'ステージを押すとそこへ移動。B はボス。自動前進を切ると同じステージで稼ぎ続けます。'));
  },
};

export { button };
