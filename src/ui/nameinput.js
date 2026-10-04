// キャラ作成の名前入力: canvas 上に DOM <input> を重ねる（日本語 IME 対応・最大10文字）
// ゲームの Input は window の keydown で preventDefault するので、input 内のキーは stopPropagation で遮断する。
export const NAME_MAX = 10;
let el = null;
let onEnter = null;

export function clipName(s) { return Array.from(String(s || '').replace(/[\r\n\t]/g, '')).slice(0, NAME_MAX).join(''); }

function ensure() {
  if (el || typeof document === 'undefined') return el;
  el = document.createElement('input');
  el.type = 'text';
  el.id = 'nvs-name-input';
  el.maxLength = NAME_MAX * 2; // IME 変換中に切れないよう余裕を持たせ、確定後に clipName
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.setAttribute('aria-label', 'キャラクター名');
  Object.assign(el.style, {
    position: 'fixed', zIndex: 50, boxSizing: 'border-box', display: 'none',
    border: '3px solid #ffffff', borderRadius: '14px', outline: 'none',
    background: 'rgba(14,8,44,0.92)', color: '#ffffff', textAlign: 'center',
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif", fontWeight: '800',
    boxShadow: '0 0 18px rgba(255,95,162,0.8), inset 0 0 10px rgba(123,47,247,0.6)', caretColor: '#ff5fa2', padding: '0 12px',
  });
  const stop = (e) => { e.stopPropagation(); };
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); onEnter?.(clipName(el.value)); }
    if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
  });
  el.addEventListener('keyup', stop);
  el.addEventListener('keypress', stop);
  el.addEventListener('compositionend', () => { el.value = clipName(el.value); });
  el.addEventListener('input', (e) => { if (!e.isComposing) { const v = clipName(el.value); if (v !== el.value) el.value = v; } });
  (document.getElementById('wrap') || document.body).appendChild(el);
  return el;
}

/** 表示（論理座標 r={x,y,w,h} @1280x720 を canvas の表示サイズへ写す） */
export function showNameInput(canvas, r, value, placeholder, enter) {
  const e = ensure();
  if (!e || !canvas) return;
  onEnter = enter;
  const b = canvas.getBoundingClientRect();
  const sx = b.width / 1280, sy = b.height / 720;
  Object.assign(e.style, {
    left: `${b.left + r.x * sx}px`, top: `${b.top + r.y * sy}px`, width: `${r.w * sx}px`, height: `${r.h * sy}px`,
    fontSize: `${Math.max(12, Math.round(26 * sy))}px`,
  });
  if (e.style.display === 'none') {
    e.style.display = 'block';
    if (value != null) e.value = value;
    e.placeholder = placeholder || '';
    setTimeout(() => { try { e.focus(); } catch { /* */ } }, 0);
  }
  e.placeholder = placeholder || '';
}
export function hideNameInput() {
  if (!el || el.style.display === 'none') return;
  el.style.display = 'none';
  try { el.blur(); } catch { /* */ }
  try { document.getElementById('game')?.focus(); } catch { /* */ }
}
export function nameInputValue() { return el ? clipName(el.value) : ''; }
export function setNameInputValue(v) { ensure(); if (el) el.value = clipName(v); }
export function nameInputFocused() { return !!el && typeof document !== 'undefined' && document.activeElement === el; }
export function focusNameInput() { try { el?.focus(); } catch { /* */ } }
