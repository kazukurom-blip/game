// 画像の窓で共通に使う小さな道具（コピー・ダウンロード・権利の案内・CSS）。

import { h, injectCss } from '../dom.js';
import { local } from '../../engine/storage.js';

export const FACING_JA = { right: '右向き', left: '左向き', up: '上向き（柄が下）', front: '正面', none: '' };
export const BLEND_JA = { 'source-over': '通常', lighter: '加算（光る・黒が消える）', screen: 'スクリーン（やわらかく光る）', multiply: '乗算（暗くする）' };
export const SOURCE_JA = { studio: 'ゲーム内で入れた画像', folder: 'assets/custom の画像', draft: '調整中' };

/** 文字をクリップボードへ。だめならテキスト欄を選んで「コピー」の操作を案内する。戻り値: 成功したか */
export async function copyText(text, fallbackEl = null) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 次へ */ }
  try {
    const ta = fallbackEl || document.createElement('textarea');
    if (!fallbackEl) { ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); }
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    if (!fallbackEl) ta.remove();
    return ok;
  } catch { return false; }
}

/** ダウンロード（iframe の中などで止められることがある。そのときは呼んだ側が別の方法を出す） */
export function downloadBlob(blob, name) {
  try {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return true;
  } catch { return false; }
}

/** はじめて画像を入れるときに 1 回だけ、権利の案内を出す */
export function ensureRightsNotice(ui) {
  if (local.get('abyss.assets.rights') === '1') return Promise.resolve(true);
  return new Promise((resolve) => {
    ui.modal('画像を入れる前に', h('div.helptext', [
      h('p', '入れた画像は、このブラウザの中だけに保存されます（ほかの人には配られません）。'),
      h('p', '取り込む画像の権利（自分で描いた・使ってよい許可がある・AI の利用規約で認められている）は、自分で確かめてください。既存のゲームやアニメのキャラ、存命の作家の画風をまねた画像は使わないでください。'),
      h('p.dim', 'サイトのデータを消すと、入れた画像も消えます。ときどき「パックを書き出す」で保存しておくと安心です。'),
    ]), [{ label: 'わかった', kind: 'primary', onclick: () => { local.set('abyss.assets.rights', '1'); resolve(true); } }, { label: 'やめる', onclick: () => resolve(false) }], { onClose: () => resolve(local.get('abyss.assets.rights') === '1') });
  });
}

export function bytesText(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** チェック模様（透明の印）を描く */
export function checker(ctx, w, h, s = 10, a = '#2a2630', b = '#211d27') {
  ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b;
  for (let y = 0; y < h; y += s) for (let x = ((y / s) & 1) * s; x < w; x += s * 2) ctx.fillRect(x, y, s, s);
}

export function installStudioCss() {
  injectCss('assets-studio', `
.st-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
.st-stat { font-size: 12px; color: var(--dim); }
.st-stat b { color: var(--gold2); }
.st-drop { border: 1px dashed var(--line2); border-radius: 8px; padding: 8px 10px; font-size: 12px; color: var(--dim); background: #120f16; margin: 6px 0 8px; text-align: center; }
.st-drop.over, .as-card.over, .ed-drop.over { border-color: var(--gold); background: #2a2010; color: var(--gold2); }
.st-tabs .tab .n { color: #6a6070; font-size: 10px; margin-left: 3px; }
.st-tabs .tab.on .n { color: var(--gold); }
.st-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
.st-chip { background: #1a1620; border: 1px solid var(--line); color: var(--dim); border-radius: 12px; padding: 2px 9px; font-size: 11.5px; cursor: pointer; }
.st-chip.on { color: var(--gold2); border-color: var(--gold); background: #2a2010; }
.st-find { display: flex; gap: 6px; margin-bottom: 8px; }
.st-find input { flex: 1; min-width: 0; }
.st-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.as-card { display: grid; grid-template-columns: 64px 1fr; gap: 4px 8px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: #120f16; cursor: pointer; position: relative; }
.as-card:hover { border-color: var(--line2); background: #17131c; }
.as-card.on { border-color: #3a7a4a; box-shadow: inset 0 0 0 1px #2a5a3a; }
.as-card.from { border-color: #3a5a7a; }
.as-thumb { width: 64px; height: 64px; border-radius: 6px; overflow: hidden; background: #0c0a0e; display: flex; align-items: center; justify-content: center; }
.as-thumb canvas { width: 64px; height: 64px; display: block; }
.as-info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.as-label { font-size: 12.5px; line-height: 1.3; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.as-id { font-size: 10.5px; color: #7a7080; font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-meta { font-size: 10.5px; color: var(--dim); }
.as-badge { display: inline-block; font-size: 10px; padding: 0 5px; border-radius: 3px; margin-right: 3px; }
.as-badge.studio { background: #2a5a3a; color: #c8ffd8; }
.as-badge.folder { background: #2a4a6a; color: #cfe6ff; }
.as-badge.from { background: #3a3448; color: #d8cfe8; }
.as-acts { grid-column: 1 / 3; display: flex; gap: 4px; flex-wrap: wrap; }
.as-acts .btn { padding: 2px 8px; font-size: 11.5px; }
.st-more { margin: 10px auto; display: block; }
.st-empty { color: var(--dim); text-align: center; padding: 20px; font-size: 13px; }
.modal.studio { max-width: 1120px; }
.modal.studio .modal-body { padding: 10px 12px; }
.studio-ed { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px; }
.ed-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ed-box { background: #120f16; border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
.ed-box h4 { margin: 0 0 6px; font-size: 13px; color: var(--gold); display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
.ed-box h4 small { color: var(--dim); font-weight: 400; font-size: 11px; }
canvas.ed-prev { width: 100%; height: auto; aspect-ratio: 16 / 9; display: block; border-radius: 6px; background: #000; }
.ed-adj-scroll { max-height: 420px; overflow: auto; border-radius: 6px; background: #0c0a0e; }
canvas.ed-adj { display: block; width: 100%; height: auto; cursor: crosshair; touch-action: none; }
.ed-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 3px 0; font-size: 12.5px; }
.ed-row label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
.ed-row .lab { color: var(--dim); min-width: 74px; }
.ed-row input[type=range] { flex: 1; min-width: 100px; accent-color: var(--gold); }
.ed-row input[type=number] { width: 64px; background: #0f0d13; color: var(--text); border: 1px solid var(--line2); border-radius: 5px; padding: 3px 5px; }
.ed-row .val { min-width: 44px; text-align: right; color: var(--gold2); font-variant-numeric: tabular-nums; }
.ed-drop { border: 2px dashed var(--line2); border-radius: 8px; padding: 14px 10px; text-align: center; color: var(--dim); cursor: pointer; font-size: 12.5px; }
.ed-drop b { color: var(--gold2); }
.ed-info { font-size: 11.5px; color: var(--dim); margin-top: 6px; line-height: 1.6; }
.ed-warn { color: #ffb070; font-size: 11.5px; margin-top: 3px; }
.ed-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; border: 1px solid #000; vertical-align: -2px; }
.ed-prompt { width: 100%; min-height: 120px; font-size: 11.5px; font-family: inherit; line-height: 1.5; resize: vertical; }
.ed-anch { display: flex; gap: 4px; flex-wrap: wrap; }
.ed-anch .st-chip i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: 0; }
.ed-note { font-size: 11.5px; color: var(--dim); line-height: 1.5; }
.studio-back { position: fixed; right: 16px; bottom: 16px; z-index: 960; box-shadow: 0 4px 18px rgba(0,0,0,.7); }
#battle.st-look { outline: 2px solid var(--gold); outline-offset: -2px; }
.st-report li { margin: 2px 0; font-size: 12.5px; }
.st-report code, .helptext code { background: #0f0d13; padding: 0 4px; border-radius: 3px; font-size: 11.5px; }
.st-pack textarea { width: 100%; min-height: 140px; font-family: ui-monospace, monospace; font-size: 10.5px; }
@media (max-width: 900px) {
  .studio-ed { grid-template-columns: 1fr; }
  .st-grid { grid-template-columns: 1fr; }
  .modal.studio { max-height: 94vh; }
}
`);
}
