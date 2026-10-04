// UI 共通: 配色・フォント・角丸パネル・テキスト・バー・ボタンなどの描画ヘルパー
export const FONT = "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif";

export const COL = {
  pink: '#ff5fa2', teal: '#19d3c5', purple: '#7b2ff7', orange: '#ff8a3d', sun: '#ffb347',
  gold: '#ffd447', navy: '#1a1440', text: '#ffffff', sub: '#cfc8ff', dim: '#8d88bd',
  hp: '#FF4D6D', hp2: '#ffa0b0', mp: '#3d8eff', mp2: '#a6d4ff', exp: '#ffd23f', exp2: '#fff2a8',
  good: '#7CFF9B', bad: '#ff5a6e', money: '#7CFF9B', moneyShadow: '#0B3D1E', star: '#FFC93C',
  copRed: '#FF2E4D', copBlue: '#2E7BFF',
};

export const RARITY_FALLBACK = {
  common: { name: 'ノーマル', color: '#E8E8F0' },
  rare: { name: 'レア', color: '#4FA8FF' },
  epic: { name: 'エピック', color: '#B45CFF' },
  legendary: { name: 'レジェンダリー', color: '#FFC93C' },
  mythic: { name: 'ミシック', color: '#FF4FA0', color2: '#3EE6D2' },
  pet: { name: 'PET', color: '#FF6AD5', color2: '#6AF0FF', rainbow: true },
};
// 虹グラデ（PET レア度）
export const RAINBOW = ['#ff5f6d', '#ffb347', '#ffe66d', '#7cff9b', '#3ee6ff', '#7b8cff', '#d16bff'];

export const STAT_LABELS = {
  atk: '攻撃力', def: '防御力', maxHp: '最大HP', maxMp: '最大MP', speed: '移動速度', crit: 'クリティカル率',
  str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', critDmg: 'クリティカルダメージ', attackSpeed: '攻撃速度',
  jump: 'ジャンプ力', range: '射程', luck: '幸運',
};

export const SLOT_LABELS = {
  hat: '帽子', top: '上着', bottom: '下衣', shoes: '靴', weapon: '武器', accessory: 'アクセ', pet: 'PET',
};

export function font(size, weight = 800) { return `${weight} ${size}px ${FONT}`; }

export function rrPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// メイプル風 半透明パネル（紺〜紫グラデ＋白縁＋上部ツヤ）
export function panel(ctx, x, y, w, h, o = {}) {
  const r = o.r ?? 14;
  ctx.save();
  ctx.shadowColor = o.glow || 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = o.glow ? 22 : 12;
  ctx.shadowOffsetY = o.glow ? 0 : 4;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, o.top || 'rgba(58,44,134,0.93)');
  g.addColorStop(1, o.bottom || 'rgba(22,15,56,0.93)');
  rrPath(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // ツヤ
  ctx.save();
  rrPath(ctx, x, y, w, h, r);
  ctx.clip();
  const gl = ctx.createLinearGradient(x, y, x, y + Math.min(h, 60));
  gl.addColorStop(0, 'rgba(255,255,255,0.20)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(x, y, w, Math.min(h, 60));
  ctx.restore();
  // 縁
  rrPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.lineWidth = o.border ?? 2.5;
  ctx.strokeStyle = o.stroke || 'rgba(255,255,255,0.92)';
  ctx.stroke();
  if (o.inner !== false) {
    rrPath(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = o.inner || 'rgba(160,110,255,0.55)';
    ctx.stroke();
  }
  ctx.restore();
}

// 小さな凹みボックス（スロット・リスト背景）
export function inset(ctx, x, y, w, h, o = {}) {
  ctx.save();
  rrPath(ctx, x, y, w, h, o.r ?? 8);
  ctx.fillStyle = o.fill || 'rgba(8,6,28,0.55)';
  ctx.fill();
  ctx.lineWidth = o.lw ?? 1.5;
  ctx.strokeStyle = o.stroke || 'rgba(190,170,255,0.35)';
  ctx.stroke();
  ctx.restore();
}

// measureText のキャッシュ（HUD/通知は毎フレーム同じ文字列を測るので重い。フォント読み込み完了で破棄）
const _mw = new Map();
try { globalThis.document?.fonts?.addEventListener?.('loadingdone', () => _mw.clear()); } catch { /* ignore */ }
function mw(ctx, s) {
  const k = ctx.font + '|' + s;
  let v = _mw.get(k);
  if (v === undefined) {
    v = ctx.measureText(s).width;
    if (_mw.size > 4000) _mw.clear();
    _mw.set(k, v);
  }
  return v;
}

// テキスト（縁取り・グロー対応）
export function txt(ctx, s, x, y, o = {}) {
  s = String(s ?? '');
  ctx.save();
  ctx.font = font(o.size ?? 16, o.weight ?? 800);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'middle';
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.maxW) {
    // 長すぎる時は縮める
    const w = mw(ctx, s);
    if (w > o.maxW) {
      ctx.font = font(Math.max(8, Math.floor((o.size ?? 16) * o.maxW / w)), o.weight ?? 800);
    }
  }
  if (o.stroke !== false) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.sw ?? 3.5;
    ctx.strokeStyle = o.stroke || 'rgba(10,6,30,0.85)';
    ctx.strokeText(s, x, y);
  }
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur ?? 12; }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function measure(ctx, s, size = 16, weight = 800) {
  ctx.save();
  ctx.font = font(size, weight);
  const w = mw(ctx, String(s));
  ctx.restore();
  return w;
}

// 日本語向け文字単位の折り返し
export function wrap(ctx, s, maxW, size = 14, weight = 700) {
  const out = [];
  ctx.save();
  ctx.font = font(size, weight);
  for (const para of String(s ?? '').split('\n')) {
    let line = '';
    for (const ch of para) {
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = ch; } else line = t;
    }
    out.push(line);
  }
  ctx.restore();
  return out;
}

// ゲージ
export function bar(ctx, x, y, w, h, ratio, c1, c2, o = {}) {
  ratio = Math.max(0, Math.min(1, ratio || 0));
  ctx.save();
  rrPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(5,3,20,0.75)';
  ctx.fill();
  if (o.ghost != null && o.ghost > ratio) {
    rrPath(ctx, x, y, Math.max(h, w * Math.min(1, o.ghost)), h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }
  if (ratio > 0) {
    const fw = Math.max(h, w * ratio);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, c2);
    g.addColorStop(0.5, c1);
    g.addColorStop(1, c1);
    rrPath(ctx, x, y, fw, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    // ハイライト
    rrPath(ctx, x + 2, y + 1.5, fw - 4, h * 0.35, h * 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }
  rrPath(ctx, x, y, w, h, h / 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
  ctx.restore();
}

// ボタン描画（hover/disabled）
export function drawButton(ctx, r, label, o = {}) {
  const { x, y, w, h } = r;
  const base = o.color || COL.purple;
  ctx.save();
  if (o.disabled) ctx.globalAlpha *= 0.45;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (o.hover && !o.disabled) {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.15, lighten(base, 0.35));
    g.addColorStop(1, base);
  } else {
    g.addColorStop(0, lighten(base, 0.25));
    g.addColorStop(1, darken(base, 0.25));
  }
  if (o.hover && !o.disabled) { ctx.shadowColor = base; ctx.shadowBlur = 14; }
  rrPath(ctx, x, y, w, h, o.r ?? Math.min(10, h / 2));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.restore();
  txt(ctx, label, x + w / 2, y + h / 2 + 1, { size: o.size ?? 15, align: 'center', alpha: o.disabled ? 0.6 : 1, maxW: w - 8, sw: 3 });
}

export function inRect(mx, my, r) {
  return r && mx >= r.x && my >= r.y && mx < r.x + r.w && my < r.y + r.h;
}

export function starPath(ctx, cx, cy, r1, r2, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = rot + i * Math.PI / n;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export function fmtMoney(n) {
  n = Math.round(n || 0);
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');
}

function hexToRgb(hex) {
  let h = String(hex || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function lighten(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}
export function darken(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// レア色の塗り（mythic はピンク→ティールのグラデ）。x0..x1 に沿ったグラデを返す
export function rarityFill(ctx, info, x0, y0, x1, y1) {
  if (info?.rainbow) return rainbowGrad(ctx, x0, y0, x1, y1);
  if (!info?.color2) return info?.color || '#fff';
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, info.color);
  g.addColorStop(1, info.color2);
  return g;
}

// 虹色グラデ。shift で色を流す（アニメ用）
export function rainbowGrad(ctx, x0, y0, x1, y1, shift = 0) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const n = RAINBOW.length;
  const k = Math.floor(((shift % 1) + 1) * n) % n;
  for (let i = 0; i < n; i++) g.addColorStop(i / (n - 1), RAINBOW[(i + k) % n]);
  return g;
}

// ---- 時計（game.clock 0〜24）----
export function getClock(game) {
  const c = game?.clock ?? game?.state?.clock ?? game?.map?._clock;
  return typeof c === 'number' && Number.isFinite(c) ? ((c % 24) + 24) % 24 : null;
}
export function clockStr(c) {
  if (c == null) return '--:--';
  const h = Math.floor(c) % 24, m = Math.floor((c - Math.floor(c)) * 60);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}:${String(m).padStart(2, '0')}`;
}
// 'dawn' | 'day' | 'dusk' | 'night'
export function clockPhase(c) {
  if (c == null) return 'day';
  if (c >= 5 && c < 7) return 'dawn';
  if (c >= 7 && c < 17) return 'day';
  if (c >= 17 && c < 19.5) return 'dusk';
  return 'night';
}
export const PHASE_INFO = {
  dawn: { name: 'DAWN', color: '#ffb3d1' },
  day: { name: 'DAY', color: '#ffd447' },
  dusk: { name: 'DUSK', color: '#ff8a3d' },
  night: { name: 'NIGHT', color: '#8fa8ff' },
};
// 昼夜アイコン（中心 x,y / 半径 r）
export function drawPhaseIcon(ctx, phase, x, y, r, t = 0) {
  ctx.save();
  if (phase === 'night') {
    ctx.shadowColor = '#bcd0ff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#e8eeff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.3, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 2; i++) {
      const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 2);
      ctx.globalAlpha = a;
      starPath(ctx, x + r * (0.9 + i * 0.3), y - r * (0.7 - i * 1.2), r * 0.32, r * 0.12, 4, 0); ctx.fill();
    }
  } else {
    const c = phase === 'dusk' ? '#ff8a3d' : phase === 'dawn' ? '#ff9ec7' : '#ffd447';
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
      ctx.lineTo(x + Math.cos(a) * r * 1.55, y + Math.sin(a) * r * 1.55);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.shadowColor = c; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
