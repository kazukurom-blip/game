// パソコンのキー操作（設定の「遊び方」にも一覧を出す）。文字を打っている間は効かない。

export const SHORTCUTS = [
  { key: 'I', label: '装備', panel: 'hero' },
  { key: 'B', label: '持ち物', panel: 'bag' },
  { key: 'K', label: 'スキル', panel: 'skills' },
  { key: 'P', label: 'パッシブ', panel: 'tree' },
  { key: 'M', label: '地図', panel: 'map' },
  { key: 'Space', label: '自動前進の ON / OFF', act: 'auto' },
  { key: '1〜4', label: '速さ ×1〜×4（解放したところまで）', act: 'speed' },
  { key: 'Esc', label: '開いている窓（確認・説明）を閉じる', act: 'close' },
];

const PANEL_KEYS = Object.fromEntries(SHORTCUTS.filter((s) => s.panel).map((s) => [s.key.toLowerCase(), s.panel]));

function typing(t) {
  if (!t || !(t instanceof Element)) return false;
  return !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/** キー操作をつなぐ。戻り値で外せる */
export function bindKeys(ui) {
  const onKey = (e) => {
    if (!ui.panelBody?.isConnected || !ui.game.state) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (ui.closeTop()) { e.preventDefault(); return; }
      return;
    }
    if (typing(e.target)) return;
    if (ui.hasModal()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (PANEL_KEYS[k]) {
      const id = PANEL_KEYS[k];
      if (!ui.canOpen(id)) { ui.toastOnce(`key-${id}`, 'その機能はまだ開いていません', ''); return; }
      e.preventDefault();
      ui.openPanel(id);
      return;
    }
    if (e.code === 'Space' || k === ' ') {
      // ボタンにフォーカスがあるときの Space はボタンを押す動き。それと重ならないように
      if (e.target instanceof Element && e.target.closest('button, a, [role=button]')) return;
      e.preventDefault();
      ui.toggleAuto();
      return;
    }
    if (/^[1-4]$/.test(k)) { e.preventDefault(); ui.setSpeed(Number(k)); }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
