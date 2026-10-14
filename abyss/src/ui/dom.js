// DOM を作る小さな道具。h('div.card', { onclick }, [子...])
// タグ名に .class と #id を書ける。属性の on* はイベント、style はオブジェクトか文字列、html は innerHTML。

export function h(tag, attrs = {}, children = []) {
  if (Array.isArray(attrs) || typeof attrs === 'string' || attrs instanceof Node) { children = attrs; attrs = {}; }
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  if (m?.[2]) for (const part of m[2].match(/[.#][\w-]+/g) || []) { if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1); }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') { for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val; } } // --rc などの CSS 変数は setProperty でないと入らない
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  if (children === undefined || children === null || children === false) return el;
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** 見出しつきの区切り */
export function section(title, children, opts = {}) {
  return h('section.sec', { class: opts.class }, [title ? h('h3.sec-title', [title, opts.right ? h('span.sec-right', opts.right) : null]) : null, ...(Array.isArray(children) ? children : [children])]);
}

export function button(label, onclick, opts = {}) {
  return h(`button.btn${opts.kind ? `.btn-${opts.kind}` : ''}`, { onclick: (e) => { e.stopPropagation(); if (!opts.disabled) onclick(e); }, disabled: opts.disabled, title: opts.title, class: opts.class }, label);
}

/** キャンバスに描いた絵（枠 ID）を DOM に置く */
export function spriteImg(assets, id, size = 48, opts = {}) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  c.width = size * dpr; c.height = size * dpr;
  c.style.width = `${size}px`; c.style.height = `${size}px`;
  c.className = `spr ${opts.class || ''}`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const s = assets.sprite(id);
  if (s?.img) {
    const fw = s.img.width / (s.frames || 1);
    const ratio = Math.min(size / fw, size / s.img.height) * (opts.zoom || 0.92);
    const w = fw * ratio; const hh = s.img.height * ratio;
    ctx.drawImage(s.img, 0, 0, fw, s.img.height, (size - w) / 2, (size - hh) / 2, w, hh);
  }
  return c;
}

/** 担当ごとの CSS を足す（style.css を触らずに済む）。同じ id は 1 回だけ */
export function injectCss(id, css) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(`css-${id}`)) return;
  const el = document.createElement('style');
  el.id = `css-${id}`;
  el.textContent = css;
  document.head.appendChild(el);
}

// ---------------------------------------------------------------- 埋め込み先（claude.ai の Artifact など）
// iframe の中では、ダウンロード（a[download]）・window.open・confirm / alert / prompt が止められる。
// クリップボードへの書き込みも、親が許していないと使えない（そのときは文字を選んで「コピー」の操作をしてもらう）。

/** iframe の中で動いているか */
export function isEmbedded() {
  try { return globalThis.self !== globalThis.top; } catch { return true; }
}

// claude.ai の Artifact として公開するときに capabilities: { downloads: true } を付けると、
// window.claude.use('downloads') の save で、見る人に確かめてから保存できる（無ければ null）。
let platformDl = null;
let platformDlP = null;
/** 起動のときに 1 回呼ぶ（答えは後から来る。答えが無ければ 10 秒で null） */
export function initPlatformDownloads() {
  if (platformDlP) return platformDlP;
  platformDlP = (async () => {
    try { platformDl = globalThis.claude?.use ? ((await globalThis.claude.use('downloads')) || null) : null; } catch { platformDl = null; }
    return platformDl;
  })();
  return platformDlP;
}

/** ファイルとして保存（ダウンロード）を出してよいか。埋め込み先（downloads の力が無い）ではボタンを出さず、文字のコピーや画像の表示にする */
export function canDownload() { return typeof document !== 'undefined' && (!isEmbedded() || !!platformDl); }

/** クリップボードに書いてよいと許されているか（許されていないのに呼ぶと、ブラウザがエラーを出す） */
function clipboardAllowed() {
  try {
    const pp = document.permissionsPolicy || document.featurePolicy;
    if (pp?.allowsFeature) return pp.allowsFeature('clipboard-write');
  } catch { /* 調べられない */ }
  return true;
}

/** 文字をクリップボードへ。だめならテキスト欄を選んで「コピー」の操作を案内する。戻り値: 成功したか */
export async function copyText(text, fallbackEl = null) {
  if (clipboardAllowed() && globalThis.navigator?.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 次へ */ }
  }
  try {
    const ta = fallbackEl || document.createElement('textarea');
    if (!fallbackEl) { ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); }
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    if (!fallbackEl) ta.remove();
    return ok;
  } catch { return false; }
}

/** PNG 画像をクリップボードへ（AI の画面にそのまま貼れる）。blob は Blob か Promise<Blob>（押した直後に呼ぶため）。戻り値: 成功したか */
export async function copyImage(blob) {
  if (!blob || !clipboardAllowed() || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return true; } catch { return false; }
}

/**
 * ダウンロード。戻り値: Promise<'saved'（渡せた） | 'declined'（見る人がやめた） | false（できない → 呼んだ側が文字のコピーや画像の表示にする）>
 * 埋め込み先では a[download] が何もしないので使わない（downloads の力があればそれで保存する）。
 */
export async function downloadBlob(blob, name) {
  if (platformDl) {
    try { await platformDl.save({ filename: name, data: blob }); return 'saved'; } catch (e) {
      return e?.code === 'declined' || e?.code === 'rate_limited' ? 'declined' : false;
    }
  }
  if (!canDownload()) return false;
  try {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return 'saved';
  } catch { return false; }
}
