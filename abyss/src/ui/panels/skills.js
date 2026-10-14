// スキルの窓: 習得・強化・並び・ルーン・自動使用の条件。

import { h, button, spriteImg } from '../dom.js';
import { SKILL, skillsOf, SKILL_MAX_LEVEL } from '../../data/skills.js';
import { TAG_NAMES, ELEMENT_NAMES } from '../../data/stats.js';
import { assets } from '../../render/assets.js';
import { skillDesc, estimateDps } from '../../game/skills.js';
import { fmt } from '../../engine/format.js';

const CONDS = [['always', 'いつでも'], ['pack3', '敵が 3 体以上'], ['elite', 'エリート・ボス'], ['boss', 'ボスだけ'], ['lowlife', 'ライフ 50% 以下']];

export const skillsPanel = {
  id: 'skills', name: 'スキル', icon: '✦',
  refreshOn: ['skills', 'level', 'gear'],
  badge: (g) => g.state.hero.skillPoints,
  render(ui, el) {
    const g = ui.game;
    const st = g.state;
    const hero = st.hero;
    const sys = g.sys.skills;
    el.append(h('div.sp', ['スキルポイント ', h('b', String(hero.skillPoints))]));
    // 並び
    const bar = h('div.skillbar');
    for (let i = 0; i < sys.barSize(); i++) {
      const id = hero.bar[i];
      bar.append(h('div.bslot', { title: i === 0 ? '基本攻撃（左から順に使う）' : `${i} 番目` }, [id ? spriteImg(assets, `icon.skill.${id}`, 40) : h('span', '空'), h('small', id ? SKILL[id].name : '')]));
    }
    el.append(h('h3.sec-title', 'スキルの並び（左から優先して自動で使う）'), bar);
    const list = h('div.skilllist');
    for (const def of skillsOf(hero.cls)) {
      const sk = hero.skills[def.id];
      const lvl = sk?.lvl || 0;
      const locked = def.unlock > hero.level;
      const inBar = hero.bar.indexOf(def.id);
      const row = h(`div.skill${locked ? '.locked' : ''}`, [
        spriteImg(assets, `icon.skill.${def.id}`, 52),
        h('div.sk-main', [
          h('div.sk-name', [def.name, h('span.sk-lvl', locked ? `Lv ${def.unlock} で解放` : `Lv ${lvl}/${SKILL_MAX_LEVEL}`)]),
          h('div.sk-tags', [ELEMENT_NAMES[def.element] || '', ...def.tags.map((t) => TAG_NAMES[t])].filter(Boolean).join('・')),
          h('div.sk-desc', lvl ? skillDesc(st, g.H, def.id) : def.desc.replace(/\{\w+\}/g, '…')),
          lvl ? h('div.sk-meta', `目安の火力 ${fmt(estimateDps(st, g.H, def.id))}/秒${def.cd ? `　待ち ${def.cd} 秒` : ''}${def.cost > 0 ? `　消費 ${def.cost}` : def.cost < 0 ? `　回復 ${-def.cost}` : ''}`) : null,
        ]),
        h('div.sk-btns', [
          !locked ? button(lvl ? '強化 +1' : '習得', () => { if (!sys.levelUp(def.id)) ui.toast(hero.skillPoints <= 0 ? 'ポイントが足りない' : 'これ以上は上げられない（主人公のレベルを上げよう）', 'bad'); }, { kind: 'primary', disabled: !sys.canLevel(def.id) }) : null,
          lvl && !def.basic ? button(inBar >= 0 ? '並びから外す' : '並びに入れる', () => {
            if (inBar >= 0) sys.setBar(inBar, null);
            else { const free = hero.bar.findIndex((x, i) => i > 0 && !x); const idx = free >= 0 ? free : Math.min(sys.barSize() - 1, Math.max(1, hero.bar.length)); sys.setBar(idx, def.id); }
          }, { kind: 'small' }) : null,
        ]),
      ]);
      if (lvl && def.runes?.length) {
        row.append(h('div.runes', def.runes.map((r) => {
          const ok = sys.runeUnlocked(def.id, r.id);
          return h(`button.rune${sk.rune === r.id ? '.on' : ''}${ok ? '' : '.lock'}`, { title: r.desc, onclick: () => { if (!ok) { ui.toast('スキルのレベルを上げると解放'); return; } sys.setRune(def.id, sk.rune === r.id ? null : r.id); } }, [h('b', r.name), h('small', ok ? r.desc : '🔒')]);
        })));
      }
      if (lvl && !def.basic) {
        const cur = hero.autocast[def.id]?.cond || 'always';
        row.append(h('div.autocast', ['自動で使う条件: ', h('select', { onchange: (e) => sys.setAuto(def.id, { cond: e.target.value }) }, CONDS.map(([v, l]) => h('option', { value: v, selected: v === cur || undefined }, l)))]));
      }
      list.append(row);
    }
    el.append(list);
  },
};
