// タイトル画面: つづきから・セーブの枠・新しく始める（クラスを選ぶ）。

import { h, clear, button, spriteImg } from './dom.js';
import { listSlots, loadSlot, deleteSlot, lastSlot } from '../engine/save.js';
import { CLASSES, CLASS } from '../data/classes.js';
import { ZONE } from '../data/world.js';
import { assets } from '../render/assets.js';
import { fmtTime } from '../engine/format.js';

export function showTitle(root, game, { onStart }) {
  clear(root);
  const wrap = h('div#title');
  const bg = document.createElement('canvas');
  bg.className = 'title-bg';
  bg.width = 1280; bg.height = 720;
  const s = assets.sprite('ui.title');
  if (s?.img) assets.drawCover(bg.getContext('2d'), s, 0, 0, 1280, 720); // 差し替え画像の縦横比が違っても伸ばさない
  wrap.append(bg);
  const logo = spriteImg(assets, 'ui.logo', 520, { zoom: 1, class: 'title-logo' });
  logo.style.width = 'min(520px, 86vw)'; logo.style.height = 'auto';
  const box = h('div.title-box');
  wrap.append(h('div.title-inner', [logo, h('div.title-sub', '深淵放置ハクスラ'), box]));
  root.append(wrap);
  renderSlots(box, onStart);
}

function renderSlots(box, onStart) {
  clear(box);
  const last = lastSlot();
  const slots = listSlots();
  const cont = last !== null && !slots[last]?.empty ? slots[last] : slots.find((x) => !x.empty);
  if (cont) box.append(button(`つづきから（${CLASS[cont.cls]?.name || ''} Lv ${cont.level}）`, () => onStart({ slot: cont.slot }), { kind: 'primary', class: 'big' }));
  box.append(h('h3.sec-title', 'セーブの枠'));
  for (const s of slots) {
    if (s.empty) {
      box.append(h('div.slot.empty', [h('span', `枠 ${s.slot + 1}　空き`), button('新しく始める', () => renderNew(box, s.slot, onStart), { kind: 'small' })]));
    } else {
      box.append(h('div.slot', [
        h('div', [h('b', `枠 ${s.slot + 1}　${s.name}`), h('div.dim', `${CLASS[s.cls]?.name || ''}　Lv ${s.level}${s.paragon ? `（パラゴン ${s.paragon}）` : ''}　${ZONE[s.zone]?.name || ''}　${fmtTime(s.playTime, true)}${s.rebirths ? `　転生 ${s.rebirths}` : ''}`)]),
        h('div.slot-btns', [
          button('遊ぶ', () => onStart({ slot: s.slot }), { kind: 'small' }),
          button('消す', () => { if (confirm(`枠 ${s.slot + 1} のセーブを消します。元に戻せません。`)) { deleteSlot(s.slot); renderSlots(box, onStart); } }, { kind: 'small' }),
        ]),
      ]));
    }
  }
}

function renderNew(box, slot, onStart) {
  clear(box);
  let pick = CLASSES[0].id;
  const name = h('input.name', { type: 'text', maxlength: 12, placeholder: '名前（12 文字まで）', value: '' });
  const cards = h('div.classcards');
  const info = h('div.classinfo');
  const draw = () => {
    clear(cards);
    for (const c of CLASSES) {
      cards.append(h(`div.classcard${pick === c.id ? '.on' : ''}`, { onclick: () => { pick = c.id; draw(); }, style: { '--cc': c.color } }, [spriteImg(assets, `hero.${c.id}.portrait`, 120, { zoom: 1 }), h('b', c.name), h('small', c.en)]));
    }
    const c = CLASS[pick];
    info.innerHTML = '';
    info.append(h('b', c.name), h('p', c.desc), h('div.dim', `主能力: ${{ str: '筋力', dex: '敏捷', int: '知力' }[c.primary]}　力: ${c.resource.name}`));
  };
  draw();
  box.append(h('h3.sec-title', `枠 ${slot + 1}　クラスを選ぶ`), cards, info, name, h('div.toolbar', [
    button('この職業で始める', () => onStart({ slot, cls: pick, name: name.value.trim() || CLASS[pick].name }), { kind: 'primary' }),
    button('もどる', () => renderSlots(box, onStart)),
  ]));
}

export { loadSlot };
