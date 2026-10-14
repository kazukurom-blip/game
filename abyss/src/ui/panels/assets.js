// 画像の差し替え（アセットスタジオ）。担当: アセット担当がこのファイルを本格的にする。
// 仮の版: 枠の一覧から選んで画像ファイルを入れる・背景を抜く・元に戻す。

import { h, button, spriteImg } from '../dom.js';
import { assets } from '../../render/assets.js';
import { CATEGORIES } from '../../render/manifest.js';

let cat = 'hero';

export const assetsPanel = {
  id: 'assets', name: '画像', icon: '🖼',
  refreshOn: [],
  render(ui, el) {
    el.append(h('p.dim', '枠を選んで画像を入れると、ゲームの絵がその画像に変わります（このブラウザに保存）。背景が白や単色なら「背景を抜く」を付けてください。'));
    el.append(h('div.tabs.small', CATEGORIES.map((c) => h(`button.tab${cat === c.id ? '.on' : ''}`, { onclick: () => { cat = c.id; ui.renderPanel(); } }, c.name))));
    const list = h('div.assetlist');
    for (const s of assets.slots.values()) {
      if (s.cat !== cat) continue;
      const custom = assets.custom.has(s.id);
      const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      const chroma = h('input', { type: 'checkbox' });
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        await assets.setCustom(s.id, f, { chroma: chroma.checked ? { tol: 40 } : null, trim: chroma.checked });
        ui.toast(`「${s.label}」を差し替えました`, 'good');
        ui.renderPanel();
      });
      list.append(h(`div.asset${custom ? '.custom' : ''}`, [
        spriteImg(assets, s.id, 64),
        h('div.as-main', [h('b', s.label), h('div.dim.small', `${s.id}　推奨 ${s.w}×${s.h}`)]),
        h('div.as-btns', [
          button('画像を入れる', () => file.click(), { kind: 'small' }),
          h('label.chk.small', [chroma, ' 背景を抜く']),
          custom ? button('元に戻す', async () => { await assets.removeCustom(s.id); ui.renderPanel(); }, { kind: 'small' }) : null,
          file,
        ]),
      ]));
    }
    el.append(list);
  },
};
