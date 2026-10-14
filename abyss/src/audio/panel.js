// 設定の窓の「音」の区切り（settingsHooks）と、戦闘の画面の右上の消音ボタン（hudHooks）。
// 音量・消音・種類ごとの消音・ドロップの音（レアリティごと）・曲の試聴・音の差し替え（入れる・試す・元に戻す）。

import { h, clear, button, injectCss } from '../ui/dom.js';
import { settingsHooks } from '../ui/panels/settings.js';
import { hudHooks } from '../ui/hud.js';
import { RARITIES } from '../data/rarity.js';
import { ensureAudioSettings } from './settings.js';
import { SFX_CATS, SFX } from './sfx.js';
import { THEMES, THEME } from './themes.js';
import { audioSlots } from './custom.js';

const CSS = `
.snd-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
.snd-label { width: 70px; flex: none; }
.snd-range { flex: 1; min-width: 80px; accent-color: var(--gold); }
.snd-val { width: 44px; flex: none; text-align: right; color: var(--gold2); font-variant-numeric: tabular-nums; }
select.snd-sel { flex: 1; min-width: 0; max-width: 100%; }
.snd-sub { font-size: 12px; color: var(--dim); margin: 10px 0 2px; }
.snd-chips { display: flex; flex-wrap: wrap; gap: 0 2px; }
.snd-now { color: var(--dim); font-size: 12px; margin-left: 6px; }
.snd-now b { color: var(--gold2); font-weight: 700; }
details.snd-custom { margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px 8px; background: rgba(0,0,0,.18); }
details.snd-custom > summary { cursor: pointer; color: var(--gold); padding: 6px 0; }
.snd-list { max-height: 380px; overflow: auto; border: 1px solid var(--line); border-radius: 6px; background: rgba(0,0,0,.22); }
.snd-slot { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-bottom: 1px solid var(--line); }
.snd-slot:last-child { border-bottom: 0; }
.snd-slot.on { background: rgba(110,224,138,.06); }
.snd-name { flex: 1; min-width: 0; }
.snd-name small { display: block; font-size: 11px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snd-badge { font-size: 11px; padding: 1px 7px; border-radius: 9px; border: 1px solid #3a7a4a; color: var(--good); white-space: nowrap; }
.snd-badge.bad { border-color: #7a3a3a; color: var(--bad); }
.snd-btns { display: flex; gap: 4px; flex: none; }
.snd-btns .btn { padding: 3px 8px; font-size: 12px; }
.snd-hud { position: absolute; right: 10px; top: 58px; min-width: 34px; }
.snd-hud.off { color: var(--bad); border-color: #7a3a3a; }
@media (max-width: 640px) { .snd-label { width: 56px; } .snd-slot { flex-wrap: wrap; } .snd-btns { width: 100%; justify-content: flex-end; } }
`;

const pct = (v) => `${Math.round((v || 0) * 100)}%`;

export function installAudioUi(A) {
  settingsHooks.sections.push((ui, el) => { el.append(audioSection(A, ui)); });
  hudHooks.build.push((hud) => muteButton(A, hud));
}

function muteButton(A, hud) {
  injectCss('audio', CSS);
  const b = h('button.hud-btn.snd-hud', { title: '音を出す／消す（細かい設定は 設定 → 音）' });
  const upd = () => { const m = A.prefs.mute; b.textContent = m ? '♪ 消音中' : '♪ 音'; b.classList.toggle('off', !!m); };
  b.addEventListener('click', (e) => { e.stopPropagation(); A.unlock(); A.setMuted(!A.prefs.mute); upd(); if (!A.prefs.mute) A.play('ui_toggle'); if (hud?.ui?.current?.id === 'settings') hud.ui.renderPanel(); });
  upd();
  A.hudButton = { el: b, update: upd };
  return b;
}

function audioSection(A, ui) {
  injectCss('audio', CSS);
  const sec = h('section.sec.snd');
  A.uiState ||= { open: false, tab: 'bgm' };
  const render = () => {
    clear(sec);
    const g = ui.game;
    const s = g.state.settings;
    const a = ensureAudioSettings(s);
    const apply = () => { A.applyPrefs(); A.hudButton?.update(); };
    const slider = (label, get, set, preview) => {
      const val = h('span.snd-val', pct(get()));
      const inp = h('input.snd-range', { type: 'range', min: 0, max: 100, step: 1, value: String(Math.round(get() * 100)), 'aria-label': label });
      inp.addEventListener('input', () => { set(Number(inp.value) / 100); val.textContent = pct(get()); apply(); });
      inp.addEventListener('change', () => { A.unlock(); if (preview) A.play(preview, { force: true }); });
      return h('div.snd-row', [h('span.snd-label', label), inp, val]);
    };
    const chk = (label, get, set, opts = {}) => h('label.chk', { style: opts.color ? { color: opts.color } : undefined }, [
      h('input', { type: 'checkbox', checked: get() || undefined, onchange: (e) => { set(e.target.checked); apply(); opts.after?.(); } }), ` ${label}`,
    ]);
    // ---- 音量
    const status = !A.engine.ctx ? (A.engine.failed ? 'このブラウザでは音を出せません' : '画面をクリックすると音が出ます') : null;
    sec.append(
      h('h3.sec-title', ['音', h('span.snd-now', status ? status : ['いまの曲 ', h('b.snd-cur', themeName(A.musicSys?.playing || A.wantTheme))])]),
      slider('全体', () => a.master, (v) => { a.master = v; }, 'ui_confirm'),
      slider('効果音', () => s.sfx, (v) => { s.sfx = v; }, 'drop_rare'),
      slider('BGM', () => s.bgm, (v) => { s.bgm = v; }),
      h('div', [
        chk('すべての音を消す', () => a.mute, (v) => { a.mute = v; }),
        chk('別のタブを見ている間は音を止める', () => a.muteHidden, (v) => { a.muteHidden = v; }),
        chk('レジェンダリー以上のドロップとボスの登場で BGM を小さくする', () => a.duck, (v) => { a.duck = v; }),
      ]),
      h('div.snd-sub', '鳴らす効果音の種類'),
      h('div.snd-chips', SFX_CATS.map((c) => chk(c.name, () => a.cats[c.id] !== false, (v) => { a.cats[c.id] = v; }))),
      h('div.snd-sub', 'ドロップの音（自動で分解された物は鳴りません。0.4 秒に 1 回まで、珍しい物を優先）'),
      h('div.snd-chips', [
        ...RARITIES.map((r) => chk(r.name, () => a.loot[r.id] !== false, (v) => { a.loot[r.id] = v; }, { color: r.color })),
        chk('太古・原初のきらめき', () => a.loot.quality !== false, (v) => { a.loot.quality = v; }, { color: '#ffd27a' }),
      ]),
    );
    // ---- 曲
    const sel = h('select.snd-sel', { 'aria-label': '曲を選ぶ', onchange: (e) => { A.unlock(); A.setMusic(e.target.value); setTimeout(updNow, 50); } }, [
      h('option', { value: 'auto', selected: A.auto || undefined }, '自動（場面に合わせる）'),
      ...THEMES.map((t) => h('option', { value: t.id, title: t.desc, selected: (!A.auto && A.manual === t.id) || undefined }, `${t.name}（${t.desc.split('。')[0]}）`)),
    ]);
    sec.append(h('div.snd-row', [h('span.snd-label', '曲'), sel]));
    // ---- 差し替え
    const det = h('details.snd-custom', { open: A.uiState.open || undefined });
    det.addEventListener('toggle', () => { A.uiState.open = det.open; });
    det.append(h('summary', `音の差し替え（自分の音声ファイルを使う）${A.custom?.list().length ? `　いま ${A.custom.list().length} 個` : ''}`));
    det.append(h('p.hint', 'ogg・mp3・wav（20MB まで）。BGM は入れた曲をそのまま繰り返します（曲の頭と終わりがつながるように作ると自然です）。ファイル名を枠 ID（例: sfx.kill.ogg・bgm.act1.mp3）にすると「まとめて入れる」で一度に入れられます。assets/custom/audio/ に置いて custom.json の "audio" に書いても使えます。'));
    const bulk = h('input', { type: 'file', multiple: true, accept: 'audio/*,.ogg,.mp3,.wav,.m4a', style: { display: 'none' } });
    bulk.addEventListener('change', async () => {
      const files = [...(bulk.files || [])];
      bulk.value = '';
      let ok = 0; const bad = [];
      for (const f of files) {
        const id = slotFromFileName(f.name);
        if (!id) { bad.push(f.name); continue; }
        try { await A.custom.set(id, f, f.name); ok++; } catch (e) { bad.push(`${f.name}（${e.message}）`); }
      }
      ui.toast(`${ok} 個の音を差し替えました${bad.length ? `。入れられなかった物: ${bad.slice(0, 3).join('、')}${bad.length > 3 ? ' ほか' : ''}` : ''}`, ok ? 'good' : 'bad');
      render();
    });
    det.append(h('div.toolbar', [
      button('まとめて入れる', () => { A.unlock(); bulk.click(); }, { kind: 'small' }),
      button('すべて元に戻す', async () => { if (await ui.confirm('ゲームの中で入れた音の差し替えをすべて消して、元の音に戻します。')) { await A.custom.clearAll(); ui.toast('元の音に戻しました', 'good'); render(); } }, { kind: 'small', disabled: !A.custom?.list().some((x) => x.source === 'studio') }),
      bulk,
    ]));
    const tabs = [{ id: 'bgm', name: 'BGM' }, ...SFX_CATS.map((c) => ({ id: c.id, name: c.name.replace(/（.*）/, '') }))];
    const tabRow = h('div.tabs.small', tabs.map((t) => h(`div.tab${A.uiState.tab === t.id ? '.on' : ''}`, { onclick: () => { A.uiState.tab = t.id; render(); } }, t.name)));
    det.append(tabRow);
    const list = h('div.snd-list');
    for (const slot of audioSlots().filter((x) => x.cat === A.uiState.tab)) list.append(slotRow(A, ui, slot, render));
    det.append(list);
    sec.append(det);
    const updNow = () => { const el = sec.querySelector('.snd-cur'); if (el) el.textContent = themeName(A.musicSys?.playing || A.wantTheme); };
    // いまの曲を表示し続ける（窓が閉じたら止める）
    clearInterval(A.uiState.timer);
    A.uiState.timer = setInterval(() => { if (!sec.isConnected) { clearInterval(A.uiState.timer); return; } updNow(); }, 1000);
  };
  render();
  return sec;
}

function themeName(id) { return THEME[id]?.name || (id ? id : '—'); }

function slotRow(A, ui, slot, rerender) {
  const info = A.custom?.info(slot.id);
  const file = h('input', { type: 'file', accept: 'audio/*,.ogg,.mp3,.wav,.m4a', style: { display: 'none' } });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try { await A.custom.set(slot.id, f, f.name); ui.toast(`「${slot.name}」を差し替えました`, 'good'); A.preview(slot.id); }
    catch (e) { ui.toast(e.message, 'bad'); }
    rerender();
  });
  const badge = info ? h(`span.snd-badge${info.error ? '.bad' : ''}`, info.error ? '読めない' : info.source === 'folder' ? 'フォルダ' : '差し替え中') : null;
  return h(`div.snd-slot${info ? '.on' : ''}`, [
    h('div.snd-name', [slot.name, h('small', `${slot.id}${slot.desc ? `　${slot.desc}` : ''}`)]),
    badge,
    h('div.snd-btns', [
      button('▶', () => { A.unlock(); A.preview(slot.id); }, { title: '試しに鳴らす' }),
      button('入れる', () => { A.unlock(); file.click(); }, { title: '音声ファイルを選ぶ' }),
      info?.source === 'studio' ? button('戻す', async () => { await A.custom.remove(slot.id); ui.toast('元の音に戻しました'); rerender(); }, { title: '元の音に戻す' }) : null,
      file,
    ]),
  ]);
}

/** ファイル名 → 枠 ID（'sfx.kill.ogg' / 'kill.wav' / 'bgm.act1.mp3' / 'act1.mp3'） */
export function slotFromFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '');
  if (/^(sfx|bgm)\./.test(base)) { const [k, ...rest] = base.split('.'); const id = rest.join('.'); return (k === 'sfx' ? SFX[id] : THEME[id]) ? base : null; }
  if (SFX[base]) return `sfx.${base}`;
  if (THEME[base]) return `bgm.${base}`;
  return null;
}
