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
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
