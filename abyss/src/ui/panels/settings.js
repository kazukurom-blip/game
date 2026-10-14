// 設定の窓: 数字の表記・演出・音・セーブの書き出しと読み込み。

import { h, button } from '../dom.js';
import { setNumberMode, fmt, fmtTime } from '../../engine/format.js';
import { exportString, importString } from '../../engine/save.js';

export const settingsHooks = { sections: [] }; // (ui, el) => void … 音の設定など

export const settingsPanel = {
  id: 'settings', name: '設定', icon: '⚙',
  refreshOn: [],
  render(ui, el) {
    const g = ui.game;
    const s = g.state.settings;
    const sel = (key, opts, onchange) => h('select', { onchange: (e) => { s[key] = e.target.value; onchange?.(e.target.value); } }, opts.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) || undefined }, l)));
    const chk = (key, label) => h('label.chk', [h('input', { type: 'checkbox', checked: s[key] !== false || undefined, onchange: (e) => { s[key] = e.target.checked; } }), ` ${label}`]);
    el.append(h('section.sec', [
      h('h3.sec-title', '表示'),
      h('div.row', ['数字の表記 ', sel('numberFormat', [['jp', '日本式（1.23万・4.5億）'], ['en', '英語式（12.3K・4.5M）'], ['sci', '指数（1.23e9）']], (v) => setNumberMode(v))]),
      h('div.row', ['演出の量 ', sel('fx', [['high', '多い'], ['mid', 'ふつう'], ['low', '少ない（軽い）']])]),
      chk('dmgNumbers', 'ダメージの数字を出す'),
      chk('shake', '画面を揺らす'),
      chk('lootBeams', 'レア以上のドロップに光の柱'),
    ]));
    for (const f of settingsHooks.sections) { try { f(ui, el); } catch (e) { console.error(e); } }
    // セーブ
    const ta = h('textarea.savebox', { rows: 4, placeholder: 'ここにセーブの文字列を貼り付けて「読み込む」' });
    el.append(h('section.sec', [
      h('h3.sec-title', 'セーブ'),
      h('div.dim', `遊んだ時間 ${fmtTime(g.state.playTime)}　自動セーブ ${s.autoSaveSec} 秒ごと`),
      h('div.toolbar', [
        button('書き出す（文字列）', () => { ta.value = exportString(g.snapshot()); ta.select(); try { navigator.clipboard?.writeText(ta.value); ui.toast('コピーしました', 'good'); } catch { ui.toast('下の文字列をコピーしてください'); } }),
        button('読み込む', async () => {
          try { const st = importString(ta.value); if (await ui.confirm('今の進み具合を、貼り付けたセーブで上書きします。')) { ui.opts.onImport?.(st); } } catch (e) { ui.toast(e.message, 'bad'); }
        }),
        button('タイトルへ', () => ui.opts.onTitle?.()),
      ]),
      ta,
    ]));
    el.append(h('section.sec', [
      h('h3.sec-title', '画像の差し替え'),
      h('p.dim', '主人公・装備・敵・スキルの演出・背景の絵を、ほかの AI で作った画像に差し替えられます。'),
      button('画像の差し替えを開く', () => ui.openPanel('assets'), { kind: 'primary' }),
    ]));
    el.append(h('div.dim.small', `所持金 ${fmt(g.state.meta.gold)} G`));
  },
};
