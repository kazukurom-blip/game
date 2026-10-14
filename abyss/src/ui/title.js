// タイトル画面: つづきから・セーブの枠・新しく始める（クラスを選ぶ）。
// 無課金・広告なし・スタミナなし（REFERENCE U09）・版・作り方の一行を出す。
// 枠を消す確認はページの中で出す（埋め込み先では window.confirm が出ないため）。

import { h, clear, button, spriteImg } from './dom.js';
import { listSlots, loadSlot, deleteSlot, lastSlot } from '../engine/save.js';
import { CLASSES, CLASS } from '../data/classes.js';
import { ZONE } from '../data/world.js';
import { assets } from '../render/assets.js';
import { fmtTime } from '../engine/format.js';

export const VERSION = '0.2.0';

/** クラスの役割と難しさ（タイトルの説明用） */
export const CLASS_ROLE = {
  warrior: { role: '近接・耐久', diff: 1, tip: '打たれ強く、迷わず戦える。はじめての人に。' },
  ranger: { role: '遠距離・罠', diff: 2, tip: '離れて射つ。砲台と相棒の獣が助けてくれる。' },
  sorcerer: { role: '魔法・範囲', diff: 2, tip: '群れをまとめて焼く。ライフは低め。' },
  necromancer: { role: '召喚・呪い', diff: 1, tip: '呼び出した兵が壁になる。放置向き。' },
  assassin: { role: '近接・連撃', diff: 3, tip: '会心と毒で手数を重ねる。打たれ弱く、上級者向け。' },
};
const DIFF_NAME = ['', 'やさしい', 'ふつう', 'むずかしい'];

export function showTitle(root, game, { onStart }) {
  clear(root);
  const wrap = h('div#title');
  const bg = document.createElement('canvas');
  bg.className = 'title-bg';
  bg.width = 1280; bg.height = 720;
  const s = assets.sprite('ui.title');
  if (s?.img) assets.drawCover(bg.getContext('2d'), s, 0, 0, 1280, 720); // 差し替え画像の縦横比が違っても伸ばさない
  wrap.append(bg);
  const logo = logoCanvas();
  const box = h('div.title-box');
  wrap.append(h('div.title-inner', [
    logo,
    h('div.title-sub', '深淵放置ハクスラ'),
    h('div.title-promise', [h('span', '無課金'), h('span', '広告なし'), h('span', 'スタミナなし'), h('span', '放置で強くなる')]),
    box,
    h('div.title-foot', [
      h('div', [h('b', `ABYSS DROP　v${VERSION}`), '　セーブはこのブラウザに保存（3 枠）']),
      h('div', '音・絵はすべてコードで生成。画像は差し替え可能（ゲームの中の「画像」の窓）'),
    ]),
  ]));
  root.append(wrap);
  renderSlots(box, onStart);
}

/** ロゴを絵の縦横比のまま描く（正方形の枠に入れると上下が空く） */
function logoCanvas() {
  const s = assets.sprite('ui.logo');
  const img = s?.img;
  if (!img) return spriteImg(assets, 'ui.logo', 520, { zoom: 1, class: 'title-logo' });
  const fw = img.width / (s.frames || 1);
  const ratio = img.height / Math.max(1, fw);
  const W = 1040;
  const c = document.createElement('canvas');
  c.width = W; c.height = Math.max(1, Math.round(W * ratio));
  c.className = 'spr title-logo';
  c.getContext('2d').drawImage(img, 0, 0, fw, img.height, 0, 0, c.width, c.height);
  c.style.width = 'min(520px, 86vw)'; c.style.height = 'auto';
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'ABYSS DROP');
  return c;
}

function ago(ms) {
  if (!ms) return '';
  const sec = Math.max(0, (Date.now() - ms) / 1000);
  if (sec < 60) return 'さっき';
  return `${fmtTime(sec, true)}前`;
}

function renderSlots(box, onStart, confirming = -1) {
  clear(box);
  const last = lastSlot();
  const slots = listSlots();
  const cont = last !== null && !slots[last]?.empty ? slots[last] : slots.find((x) => !x.empty);
  if (cont) box.append(button(`つづきから（${CLASS[cont.cls]?.name || ''} Lv ${cont.level}${cont.paragon ? `・アビスLv ${cont.paragon}` : ''}）`, () => onStart({ slot: cont.slot }), { kind: 'primary', class: 'big' }));
  else box.append(h('p.dim', { style: { margin: '0 0 8px', fontSize: '13px' } }, '空いている枠の「新しく始める」から、クラスを選んで始めます。'));
  box.append(h('h3.sec-title', 'セーブの枠'));
  for (const s of slots) {
    if (s.empty) {
      box.append(h('div.slot.empty', [h('span', `枠 ${s.slot + 1}　空き`), button('新しく始める', () => renderNew(box, s.slot, onStart), { kind: 'small' })]));
      continue;
    }
    const c = CLASS[s.cls];
    if (confirming === s.slot) {
      box.append(h('div.slot.confirming', { role: 'alertdialog', 'aria-label': `枠 ${s.slot + 1} を消す確認` }, [
        h('div', [h('b.bad', `枠 ${s.slot + 1}「${s.name}」を消しますか？`), h('div.dim.small', '消したセーブは元に戻せません。')]),
        h('div.slot-btns', [
          button('消す', () => { deleteSlot(s.slot); renderSlots(box, onStart); }, { kind: 'danger', class: 'btn-small slot-del-ok' }),
          button('やめる', () => renderSlots(box, onStart), { kind: 'small' }),
        ]),
      ]));
      continue;
    }
    box.append(h('div.slot', [
      h('div', [
        h('b', `枠 ${s.slot + 1}　${s.name}`),
        h('div.dim.small', [
          h('span.slot-cls', { style: { '--cc': c?.color || '#888' } }, c?.name || ''),
          `Lv ${s.level}${s.paragon ? `（アビスLv ${s.paragon}）` : ''}　${ZONE[s.zone]?.name || ''}　遊んだ時間 ${fmtTime(s.playTime, true)}${s.rebirths ? `　転生 ${s.rebirths}` : ''}`,
        ]),
        s.lastSaved ? h('div.dim.small', `最後に遊んだのは ${ago(s.lastSaved)}`) : null,
      ]),
      h('div.slot-btns', [
        button('遊ぶ', () => onStart({ slot: s.slot }), { kind: 'small' }),
        button('消す', () => renderSlots(box, onStart, s.slot), { kind: 'small', class: 'slot-del' }),
      ]),
    ]));
  }
}

function renderNew(box, slot, onStart) {
  clear(box);
  let pick = CLASSES[0].id;
  const name = h('input.name', { type: 'text', maxlength: 12, placeholder: '名前（12 文字まで。空ならクラスの名前）', value: '', 'aria-label': '名前' });
  const cards = h('div.classcards', { role: 'radiogroup', 'aria-label': 'クラス' });
  const info = h('div.classinfo');
  const draw = () => {
    clear(cards);
    for (const c of CLASSES) {
      const r = CLASS_ROLE[c.id] || { role: '', diff: 2 };
      cards.append(h(`button.classcard${pick === c.id ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': pick === c.id ? 'true' : 'false', dataset: { cls: c.id }, onclick: () => { pick = c.id; draw(); }, style: { '--cc': c.color } }, [
        spriteImg(assets, `hero.${c.id}.portrait`, 110, { zoom: 1 }),
        h('b', c.name),
        h('span.cc-role', r.role),
        h('span.cc-diff', { title: `難しさ: ${DIFF_NAME[r.diff]}` }, [h('i', '★'.repeat(r.diff)), '☆'.repeat(3 - r.diff)]),
        h('small', c.en),
      ]));
    }
    const c = CLASS[pick];
    const r = CLASS_ROLE[pick] || { role: '', diff: 2, tip: '' };
    clear(info);
    info.append(
      h('div.ci-head', [h('b', c.name), h('span.cc-role', { style: { '--cc': c.color } }, r.role), h('span.dim.small', `難しさ: ${DIFF_NAME[r.diff]}`)]),
      h('p', c.desc),
      r.tip ? h('p.gold', r.tip) : null,
      h('div.dim.small', `主能力: ${{ str: '筋力', dex: '敏捷', int: '知力' }[c.primary]}　リソース: ${c.resource.name}`),
    );
  };
  draw();
  box.append(h('h3.sec-title', `枠 ${slot + 1}　クラスを選ぶ`), cards, info, name, h('div.toolbar', [
    button('このクラスで始める', () => onStart({ slot, cls: pick, name: name.value.trim() || CLASS[pick].name }), { kind: 'primary' }),
    button('もどる', () => renderSlots(box, onStart)),
  ]));
}

export { loadSlot };
