// 設定の窓: 遊び方（案内・キー操作）・数字の表記・演出・音・機能の開き方・セーブの書き出しと読み込み。

import { h, button } from '../dom.js';
import { setNumberMode, fmt, fmtTime } from '../../engine/format.js';
import { exportString, importString } from '../../engine/save.js';
import { howtoSection } from '../guide.js';
import { FEATURES, tutorialOf } from '../unlocks.js';

export const settingsHooks = { sections: [] }; // (ui, el) => void … 音の設定など

export const settingsPanel = {
  id: 'settings', name: '設定', icon: '⚙',
  refreshOn: [],
  help: '<p>遊び方・キー操作・表示・音・演出の設定と、セーブの書き出し／読み込みです。</p><p>セーブはこのブラウザに自動で保存されます（30 秒ごと・タブを離れたとき）。別の端末へ移すときは「書き出す」でできた文字列をコピーし、移った先で「読み込む」に貼り付けます。</p>',
  render(ui, el) {
    const g = ui.game;
    const s = g.state.settings;
    const sel = (key, opts, onchange) => h('select', { onchange: (e) => { s[key] = e.target.value; onchange?.(e.target.value); } }, opts.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) || undefined }, l)));
    const chk = (key, label, onchange) => h('label.chk', [h('input', { type: 'checkbox', checked: s[key] !== false || undefined, onchange: (e) => { s[key] = e.target.checked; onchange?.(e.target.checked); } }), ` ${label}`]);
    el.append(howtoSection(ui));
    el.append(h('section.sec', [
      h('h3.sec-title', '表示'),
      h('div.row', ['数字の表記 ', sel('numberFormat', [['jp', '日本式（1.23万・4.5億）'], ['en', '英語式（12.3K・4.5M）'], ['sci', '指数（1.23e9）']], (v) => { setNumberMode(v); ui.updateTop(); })]),
      h('div.row', ['演出の量 ', sel('fx', [['high', '多い'], ['mid', 'ふつう'], ['low', '少ない（軽い）']])]),
      chk('dmgNumbers', 'ダメージの数字を出す'),
      chk('shake', '画面を揺らす'),
      chk('lootBeams', 'レア以上のドロップに光の柱'),
    ]));
    for (const f of settingsHooks.sections) { try { f(ui, el); } catch (e) { console.error(e); } }
    // 機能の開き方
    const T = tutorialOf(g.state);
    const opened = FEATURES.filter((f) => T.unlocked[f.id]).length;
    el.append(h('section.sec', [
      h('h3.sec-title', ['機能の開き方', h('span.sec-right.dim.small', `${opened} / ${FEATURES.length} が開いている`)]),
      chk('progressive', '機能を少しずつ開く（はじめての人向け）', () => ui.refreshNav()),
      h('div.set-note', 'OFF にすると、鍛冶・宝石・商人などのタブが最初からすべて見えます。'),
      h('div.toolbar', [
        button('案内をもう一度見る', () => ui.guide.start(), { kind: 'small' }),
        button('「新しい機能」の説明をもう一度出す', () => { T.seen = {}; T.opened = {}; ui.toast('次に開いたときに、それぞれの説明が出ます'); ui.refreshNav(); }, { kind: 'small' }),
      ]),
    ]));
    // セーブ（ファイルの保存ができない所でも使えるよう、文字列で書き出す）
    const ta = h('textarea.savebox', { rows: 4, placeholder: 'ここにセーブの文字列を貼り付けて「読み込む」', 'aria-label': 'セーブの文字列' });
    el.append(h('section.sec', [
      h('h3.sec-title', 'セーブ'),
      h('div.dim', `遊んだ時間 ${fmtTime(g.state.playTime)}　自動セーブ ${s.autoSaveSec} 秒ごと`),
      h('div.toolbar', [
        button('今すぐ保存', () => { ui.opts.onSave?.(); ui.toast('保存しました', 'good'); }, { kind: 'small' }),
        button('書き出す（文字列）', () => {
          ta.value = exportString(g.snapshot());
          ta.focus(); ta.select();
          const p = navigator.clipboard?.writeText?.(ta.value);
          if (p?.then) p.then(() => ui.toast('コピーしました（下の欄にも出しています）', 'good'), () => ui.toast('下の欄の文字列を選んでコピーしてください'));
          else ui.toast('下の欄の文字列を選んでコピーしてください');
        }),
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
