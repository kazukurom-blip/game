// 画像の差し替え（アセットスタジオ）。ほかの AI で作った画像を、キャラ・装備・敵・スキルの演出・アイコン・背景に使える。
//
// 一覧: 分類のタブ・小分類・検索・「差し替えた物だけ／まだの物だけ」。カードを押すと調整の窓（assets_editor.js）。
// 入れ方: カードの「入れる」・カードに落とす・カードの上で Ctrl+V・まとめて取り込む（ファイル名 = 枠 ID）。
// パック: 入れた画像をまとめて書き出す（.json。ダウンロードできないときは文字でコピー）・読み込む（ファイル・貼り付け）。
// 保存は IndexedDB（このブラウザの中だけ）。assets/custom/ に置いた画像（custom.json）より優先される。

import { h, button, clear } from '../dom.js';
import { assets, blobToImage, inspectImage, autoProc, processImage, detectAnchors, parseAssetFileName, suggestIds, validatePack } from '../../render/assets.js';
import { CATEGORIES, GROUPS, describeUnknown } from '../../render/manifest.js';
import { openEditor, editorOpen } from './assets_editor.js';
import { copyText, downloadBlob, ensureRightsNotice, bytesText, FACING_JA, installStudioCss } from './assets_util.js';

const PAGE = 40;
const view = { cat: 'hero', group: 'all', q: '', filter: 'all', shown: PAGE, hover: null };
const FEET = new Set(['hero.body', 'hero.outfit', 'monster', 'minion', 'pet']);
let pasteBound = false;
let uiRef = null;

export const assetsPanel = {
  id: 'assets', name: '画像', icon: '🖼',
  refreshOn: [],
  help: [
    '<p>ゲームの絵（主人公・鎧を着た姿・武器・敵・ボス・召喚物・ペット・スキルの演出・アイコン・背景・ロゴ）は、すべて<b>枠 ID</b> を持っています。枠に画像を入れると、その絵がすぐに差し替わります。</p>',
    '<p><b>入れ方</b>: カードの「入れる」／カードに画像を落とす／カードの上で <code>Ctrl+V</code>／「まとめて取り込む」（ファイル名を <code>monster.ash_wolf.png</code> のように枠 ID にする）。横に並べたコマ送りは <code>fx.s_bolt.proj@8f.png</code>（8 コマ）。</p>',
    '<p><b>調整</b>: カードを押すと調整の窓。背景を抜く（四隅の色・スポイト）、外側を切る、大きさ・ずらし・回転・反転、足元や手の位置（アンカー）を画像を押して決めます。左の試し表示で動きを見ながら合わせます。</p>',
    '<p><b>AI で作る</b>: 調整の窓の「AI で作る」に、その枠用の指示文（英語・日本語・Midjourney）があります。型紙（位置の目安の画像）も保存できます。詳しくは docs/ASSETS.md。</p>',
    '<p><b>保存</b>: このブラウザの中（IndexedDB）。ほかの人には配られません。「パックを書き出す」でまとめて保存・別の PC に移せます。</p>',
  ].join(''),
  render(ui, el) {
    uiRef = ui;
    installStudioCss();
    bindPaste();
    const slots = [...assets.slots.values()];
    const seen = otherIds();
    const nCustom = assets.studio.size; const nFolder = assets.folder.size;
    const stat = h('div.st-stat', [`枠 ${slots.length.toLocaleString()} 個・ゲーム内で入れた画像 `, h('b', String(nCustom)), ' 枚', nFolder ? `・assets/custom の画像 ${nFolder} 枚` : '']);
    assets.storageInfo().then((s) => { if (stat.isConnected && s.images) stat.append(`・保存 ${bytesText(s.images)}`); });
    const bulk = h('input', { type: 'file', multiple: true, accept: 'image/png,image/webp,image/jpeg,image/gif,application/json,.json', style: { display: 'none' } });
    bulk.addEventListener('change', () => { const fs = [...(bulk.files || [])]; bulk.value = ''; if (fs.length) bulkImport(ui, fs); });
    el.append(
      h('p.dim', 'ほかの AI で作った画像を、ゲームの絵として使えます。カードを押すと調整の窓が開き、AI 用の指示文と型紙もあります。'),
      h('div.st-head', [stat]),
      h('div.toolbar', [
        button('まとめて取り込む', () => bulk.click(), { kind: 'primary', title: 'ファイル名が枠 ID の画像（例: monster.ash_wolf.png）をまとめて入れる' }),
        button('パックを書き出す', () => exportPackUi(ui), { kind: 'small' }),
        button('パックを読み込む', () => importPackUi(ui), { kind: 'small' }),
        nCustom ? button('すべて元に戻す', async () => { if (await ui.confirm(`ゲーム内で入れた画像 ${nCustom} 枚をすべて消して、元の絵に戻します。`, 'すべて戻す')) { await assets.clearAllCustom(); ui.toast('すべて元に戻しました', 'good'); ui.renderPanel(); } }, { kind: 'small', class: 'btn-danger' }) : null,
        bulk,
      ]),
    );
    const dz = h('div.st-drop', 'ここに画像をまとめて落とすと、ファイル名の枠に入ります（例: hero.warrior.body.png）');
    for (const t of [el, dz]) {
      t.addEventListener('dragover', (e) => { if (e.target.closest?.('.as-card')) return; e.preventDefault(); dz.classList.add('over'); });
      t.addEventListener('dragleave', () => dz.classList.remove('over'));
    }
    el.addEventListener('drop', (e) => { if (e.target.closest?.('.as-card')) return; e.preventDefault(); dz.classList.remove('over'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) bulkImport(ui, fs); });
    el.append(dz);
    // 分類のタブ
    const cats = [...CATEGORIES, ...(seen.length ? [{ id: 'other', name: 'その他' }] : [])];
    if (!cats.some((c) => c.id === view.cat)) view.cat = 'hero';
    const count = (cid) => (cid === 'other' ? seen.length : slots.filter((s) => s.cat === cid).length);
    const customIn = (cid) => (cid === 'other' ? seen.filter((id) => assets.studio.has(id)).length : slots.filter((s) => s.cat === cid && assets.studio.has(s.id)).length);
    el.append(h('div.tabs.small.st-tabs', cats.map((c) => h(`button.tab${view.cat === c.id ? '.on' : ''}`, { onclick: () => { view.cat = c.id; view.group = 'all'; view.shown = PAGE; ui.renderPanel(); }, title: c.desc || '' }, [c.name, h('span.n', `${customIn(c.id) ? `${customIn(c.id)}/` : ''}${count(c.id)}`)]))));
    const catInfo = CATEGORIES.find((c) => c.id === view.cat);
    if (catInfo?.desc) el.append(h('div.hint', catInfo.desc));
    // 小分類
    const groups = view.cat === 'other' ? [] : (GROUPS[view.cat] || []).filter((g) => slots.some((s) => s.cat === view.cat && s.group === g.id));
    if (groups.length > 1) el.append(h('div.st-chips', [{ id: 'all', name: 'すべて' }, ...groups].map((g) => h(`button.st-chip${view.group === g.id ? '.on' : ''}`, { onclick: () => { view.group = g.id; view.shown = PAGE; ui.renderPanel(); } }, g.name))));
    // 検索・絞り込み
    const q = h('input', { type: 'text', placeholder: '探す（名前・枠 ID。例: 狼, sword, fx.s_）', value: view.q });
    let qt = 0;
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { view.q = q.value.trim(); view.shown = PAGE; renderList(ui, list, more); }, 180); });
    const filt = h('select', { onchange: (e) => { view.filter = e.target.value; view.shown = PAGE; renderList(ui, list, more); } }, [['all', 'すべて'], ['custom', '差し替えた物だけ'], ['missing', 'まだの物だけ']].map(([v, l]) => h('option', { value: v, selected: view.filter === v || undefined }, l)));
    el.append(h('div.st-find', [q, filt]));
    const list = h('div.st-grid');
    const more = h('div');
    el.append(list, more);
    renderList(ui, list, more);
  },
};

/** 枠の一覧に無い ID（ゲームの中で使われた ID・名前のまま入れた画像） */
function otherIds() {
  const set = new Set([...assets.seen.keys(), ...assets.studio.keys(), ...assets.folder.keys()]);
  return [...set].filter((id) => typeof id === 'string' && id && !assets.slots.has(id)).sort();
}

function currentSlots() {
  const words = view.q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = view.cat === 'other'
    ? otherIds().map((id) => ({ ...(assets.spec(id) || { w: 128, h: 128 }), id, cat: 'other', label: describeUnknown(id), discovered: true }))
    : [...assets.slots.values()].filter((s) => s.cat === view.cat && (view.group === 'all' || s.group === view.group));
  return all.filter((s) => {
    if (words.length) {
      const text = `${s.id} ${s.label}`.toLowerCase();
      if (!words.every((w) => text.includes(w))) return false;
    }
    if (view.filter === 'custom') return assets.isCustom(s.id);
    if (view.filter === 'missing') return !assets.isCustom(s.id);
    return true;
  });
}

function renderList(ui, list, more) {
  clear(list); clear(more);
  const items = currentSlots();
  if (!items.length) { list.append(h('div.st-empty', view.cat === 'other' ? '枠の一覧に無い ID はまだ見つかっていません。' : '当てはまる枠がありません。')); return; }
  for (const s of items.slice(0, view.shown)) list.append(card(ui, s));
  if (items.length > view.shown) more.append(button(`もっと見る（残り ${items.length - view.shown}）`, () => { view.shown += PAGE * 2; renderList(ui, list, more); }, { kind: 'small', class: 'st-more' }));
}

function card(ui, s) {
  const src = assets.sourceOf(s.id);
  const thumb = h('canvas', { width: 128, height: 128 });
  const tc = assets.thumb(s.id, 128, 128);
  if (tc) {
    const ctx = thumb.getContext('2d');
    if (s.cat === 'fx' && !src.source) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 128); }
    ctx.drawImage(tc, 0, 0);
  }
  const file = h('input', { type: 'file', accept: 'image/png,image/webp,image/jpeg,image/gif', style: { display: 'none' } });
  file.addEventListener('change', () => { const f = file.files?.[0]; file.value = ''; if (f) quickImport(ui, s.id, f, true); });
  const badge = src.source === 'studio' && !src.from ? h('span.as-badge.studio', '差し替え中')
    : src.source === 'folder' && !src.from ? h('span.as-badge.folder', 'フォルダの画像')
      : src.source ? h('span.as-badge.from', { title: `予備の枠 ${src.from} の画像を使っています` }, '予備の枠の画像') : null;
  const el = h(`div.as-card${src.source && !src.from ? '.on' : ''}${src.from ? '.from' : ''}`, {
    dataset: { id: s.id }, title: `${s.label}\n${s.id}${s.note ? `\n${s.note}` : ''}`,
    onclick: () => openEditor(ui, s.id, { onSaved: () => ui.renderPanel() }),
    onmouseenter: () => { view.hover = s.id; }, onmouseleave: () => { if (view.hover === s.id) view.hover = null; },
  }, [
    h('div.as-thumb', thumb),
    h('div.as-info', [
      h('div.as-label', s.label),
      h('div.as-id', s.id),
      h('div.as-meta', [`推奨 ${s.w}×${s.h}`, s.facing && s.facing !== 'none' ? `・${FACING_JA[s.facing]}` : '', s.blend === 'lighter' ? '・加算' : '']),
      h('div', badge),
    ]),
    h('div.as-acts', [
      button('入れる', () => file.click(), { kind: 'small', title: '画像を選んですぐ入れる（背景は自動で抜く）' }),
      button('調整', () => openEditor(ui, s.id, { onSaved: () => ui.renderPanel() }), { kind: 'small' }),
      src.source === 'studio' && !src.from ? button('戻す', async () => { await assets.removeCustom(s.id); ui.toast('元に戻しました', 'good'); ui.renderPanel(); }, { kind: 'small', title: '入れた画像を消して元の絵に戻す' }) : null,
      file,
    ]),
  ]);
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('over');
    const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type));
    if (f) quickImport(ui, s.id, f, true);
  });
  return el;
}

/** カードの上で Ctrl+V → その枠に入れる */
function bindPaste() {
  if (pasteBound) return;
  pasteBound = true;
  document.addEventListener('paste', (e) => {
    const ui = uiRef;
    if (!ui || ui.current?.id !== 'assets' || editorOpen()) return;
    const it = [...(e.clipboardData?.items || [])].find((x) => x.kind === 'file' && /^image\//.test(x.type));
    if (!it) return;
    e.preventDefault();
    const f = it.getAsFile();
    if (!view.hover) { ui.toast('貼り付ける枠のカードの上にマウスを置いてから Ctrl+V してください（カードを押すと調整の窓でも貼り付けられます）'); return; }
    quickImport(ui, view.hover, new File([f], `${view.hover}.png`, { type: f.type }), true);
  });
}

/**
 * 画像をすぐ入れる（自動の加工: 透明でなければ四隅の色で背景を抜く・外側を切る・足元を合わせる）。
 * extra: { frames, fps, opts（サイドカーの設定）, proc }
 */
export async function quickImport(ui, id, file, rerender = false, extra = {}) {
  if (!(await ensureRightsNotice(ui))) return false;
  try {
    const spec = assets.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5 };
    const raw = await blobToImage(file);
    const ins = inspectImage(raw);
    const pf = parseAssetFileName(file.name || '');
    const opts = { ...(extra.opts || {}) };
    const frames = extra.frames || pf?.frames || opts.frames || 1;
    if (frames > 1) opts.frames = frames;
    if (extra.fps || pf?.fps) opts.fps = extra.fps || pf.fps;
    if (spec.cat === 'fx' && !opts.blend) opts.blend = spec.blend || 'lighter';
    const proc = extra.proc || autoProc(spec, ins.transparent, ins.bg);
    const { canvas } = processImage(raw, proc, spec, { frames, scale: opts.scale });
    if (FEET.has(spec.kind) && spec.ay >= 0.8 && opts.ay === undefined) {
      const det = detectAnchors(canvas, frames);
      if (det.feet) { opts.ax = Math.round(det.feet.ax * 1000) / 1000; opts.ay = Math.round(det.feet.ay * 1000) / 1000; }
    }
    await assets.setCustom(id, file, opts, proc, { processed: canvas, name: file.name || '' });
    if (rerender) {
      ui.toast(`「${spec.label || id}」に入れました${proc.bg === 'auto' ? '（背景を自動で抜きました）' : ''}`, 'good');
      if (ui.current?.id === 'assets') ui.renderPanel();
    }
    return true;
  } catch (e) {
    console.warn('[assets] 取り込めない', id, e);
    ui.toast(`「${id}」に入れられませんでした: ${e.message || e}`, 'bad');
    return false;
  }
}

/** まとめて取り込む: ファイル名 = 枠 ID。<ID>.json があれば設定（frames・fps・ax・ay・scale・blend・anchors・proc など）として使う */
export async function bulkImport(ui, files) {
  if (!(await ensureRightsNotice(ui))) return;
  const side = new Map();
  for (const f of files.filter((x) => /\.json$/i.test(x.name))) {
    try { side.set(f.name.replace(/\.json$/i, '').toLowerCase(), JSON.parse(await f.text())); } catch { /* 読めない設定は無視 */ }
  }
  const images = files.filter((x) => /^image\//.test(x.type) || /\.(png|jpe?g|webp|gif|avif)$/i.test(x.name));
  const ok = []; const unknown = []; const failed = [];
  const known = (id) => assets.slots.has(id) || assets.seen.has(id) || !!assets.spec(id);
  ui.toast(`${images.length} 枚を取り込んでいます…`);
  for (const f of images) {
    const p = parseAssetFileName(f.name);
    if (!p || p.bad || !known(p.id)) { unknown.push({ f, id: p?.id || f.name }); continue; }
    const sc = side.get(p.id) || null;
    const r = await quickImport(ui, p.id, f, false, sc ? { opts: stripProc(sc), proc: sc.proc || null } : {});
    (r ? ok : failed).push(p.id);
  }
  const all = [...assets.slots.keys()];
  const body = h('div.st-report', [
    h('p', `取り込んだ画像: ${ok.length} 枚${failed.length ? `・入れられなかった画像: ${failed.length} 枚` : ''}`),
    ok.length ? h('details', [h('summary', '取り込んだ枠'), h('ul', ok.slice(0, 200).map((id) => h('li', h('code', id))))]) : null,
    unknown.length ? h('div', [
      h('p.bad', `枠 ID が見つからない画像: ${unknown.length} 枚（ファイル名を枠 ID にしてください）`),
      h('ul', unknown.slice(0, 60).map((u) => { const sg = suggestIds(u.id, all, 3); return h('li', [h('code', u.f.name), sg.length ? ` → もしかして ${sg.join(' / ')}` : '']); })),
    ]) : null,
  ]);
  const btns = [{ label: '閉じる', kind: 'primary' }];
  if (unknown.some((u) => /^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(u.id))) btns.unshift({ label: '名前のまま入れる', onclick: () => { (async () => { let n = 0; for (const u of unknown) if (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(u.id) && await quickImport(ui, u.id, u.f, false)) n++; ui.toast(`${n} 枚を名前のまま入れました（その他の分類に出ます）`, 'good'); ui.renderPanel(); })(); } });
  ui.modal('まとめて取り込んだ結果', body, btns);
  ui.renderPanel();
}

function stripProc(o) { const c = { ...o }; delete c.proc; return c; }

/** パックを書き出す（ダウンロード。できないときは文字でコピー） */
async function exportPackUi(ui) {
  if (!assets.studio.size) { ui.toast('ゲーム内で入れた画像がありません'); return; }
  const orig = h('input', { type: 'checkbox' });
  const ta = h('textarea', { readonly: true, placeholder: '「文字で表示」を押すと、ここにパックの文字が出ます' });
  const size = h('div.dim.small');
  const make = async () => JSON.stringify(await assets.exportPack({ includeOrig: orig.checked }));
  ui.modal('パックを書き出す', h('div.st-pack', [
    h('p', `ゲーム内で入れた画像 ${assets.studio.size} 枚を、1 つのファイル（.json）にまとめます。別のブラウザや PC で「パックを読み込む」と同じ見た目になります。`),
    h('label.chk', [orig, ' 元の画像も入れる（大きくなるが、あとで背景の抜き方などを直せる）']),
    ta, size,
  ]), [
    { label: 'ダウンロード', kind: 'primary', onclick: () => { (async () => { const txt = await make(); const ok = downloadBlob(new Blob([txt], { type: 'application/json' }), `abyss-drop-images-${new Date().toISOString().slice(0, 10)}.json`); size.textContent = `大きさ ${bytesText(txt.length)}。ダウンロードが始まらないときは「文字で表示」→「コピー」を使ってください。`; if (!ok) ui.toast('ダウンロードできませんでした。文字で表示してコピーしてください', 'bad'); })(); return false; } },
    { label: '文字で表示', onclick: () => { (async () => { ta.value = await make(); size.textContent = `大きさ ${bytesText(ta.value.length)}`; ta.focus(); ta.select(); })(); return false; } },
    { label: 'コピー', onclick: () => { (async () => { if (!ta.value) ta.value = await make(); const ok = await copyText(ta.value, ta); ui.toast(ok ? 'パックをコピーしました。メモ帳などに貼って保存してください' : '文字を選んでコピーしてください', ok ? 'good' : ''); })(); return false; } },
    { label: '閉じる' },
  ], { wide: true });
}

/** パックを読み込む（ファイル・貼り付けた文字） */
async function importPackUi(ui) {
  const fileIn = h('input', { type: 'file', accept: '.json,application/json' });
  const ta = h('textarea', { placeholder: 'ここにパックの文字（{"format":"abyss-drop-assetpack", ...}）を貼り付けて「読み込む」' });
  const msg = h('div.small');
  const run = async (text) => {
    let pack;
    try { pack = JSON.parse(text); } catch { msg.textContent = 'JSON として読めませんでした'; msg.className = 'small bad'; return; }
    const err = validatePack(pack);
    if (err) { msg.textContent = err; msg.className = 'small bad'; return; }
    if (!(await ensureRightsNotice(ui))) return;
    msg.textContent = '読み込んでいます…'; msg.className = 'small dim';
    try {
      const n = await assets.importPack(pack);
      ui.toast(`パックから ${n} 枚を読み込みました`, 'good');
      md.close();
      ui.renderPanel();
    } catch (e) { msg.textContent = e.message; msg.className = 'small bad'; }
  };
  fileIn.addEventListener('change', async () => { const f = fileIn.files?.[0]; if (f) run(await f.text()); });
  const md = ui.modal('パックを読み込む', h('div.st-pack', [
    h('p', '「パックを書き出す」で作ったファイル（.json）を選ぶか、文字を貼り付けてください。同じ枠の画像は上書きされます。'),
    fileIn, ta, msg,
  ]), [{ label: '読み込む', kind: 'primary', onclick: () => { run(ta.value); return false; } }, { label: '閉じる' }], { wide: true });
}
