// メイプル風の名札（足元の半透明の黒の角丸＋文字）・メダル（称号の細い帯）・NPC の頭上のクエストの印。
import { makeCanvas, rgba, shade } from './util.js';
import { drawMapleText } from './mapleFont.js';

const CAN = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
export const TAG_FONT = "bold 12px 'M PLUS Rounded 1c', sans-serif";
const SMALL_FONT = "bold 10px 'M PLUS Rounded 1c', sans-serif";
const widths = new Map();
function textW(ctx, text, font) {
  const k = font + '|' + text;
  let w = widths.get(k);
  if (w == null) { ctx.font = font; w = ctx.measureText(text).width; if (widths.size > 400) widths.clear(); widths.set(k, w); }
  return w;
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

/** drawNameTag(ctx, x, y, text, {color, small, bg}) — (x, y) = 箱の上辺の中央。戻り値 = 箱の高さ */
export function drawNameTag(ctx, x, y, text, o = {}) {
  if (!text) return 0;
  const font = o.small ? SMALL_FONT : TAG_FONT;
  const h = o.small ? 14 : 16;
  const w = Math.ceil(textW(ctx, text, font)) + (o.small ? 8 : 10);
  const x0 = Math.round(x - w / 2), y0 = Math.round(y);
  ctx.save();
  ctx.fillStyle = o.bg || 'rgba(0,0,0,0.6)';
  rrect(ctx, x0, y0, w, h, 3); ctx.fill();
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color || '#ffffff';
  ctx.fillText(text, x, y0 + h / 2 + 0.5);
  ctx.restore();
  return h;
}

/** メダル（称号）: 名札のすぐ下の細い帯。両端が矢羽根の形・色のグラデーション＋金の縁 */
export function drawMedal(ctx, x, y, text, color = '#ff4fd8') {
  if (!text) return 0;
  const h = 14;
  const w = Math.ceil(textW(ctx, text, SMALL_FONT)) + 22;
  const x0 = Math.round(x - w / 2), y0 = Math.round(y);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w - 6, y0 + h / 2); ctx.lineTo(x0 + w, y0 + h);
  ctx.lineTo(x0, y0 + h); ctx.lineTo(x0 + 6, y0 + h / 2); ctx.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, shade(color, 0.25)); g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g; ctx.globalAlpha *= 0.92; ctx.fill();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha /= 0.92;
  ctx.font = SMALL_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(shade(color, -0.6), 0.9); ctx.strokeText(text, x, y0 + h / 2 + 0.5);
  ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y0 + h / 2 + 0.5);
  ctx.restore();
  return h;
}

/** NPC の頭上のクエストの印（キャッシュ画像）。'available' → 色つきの吹き出しに白い「!」/ 'complete' → 白い丸に「?」 */
const marks = new Map();
export function questMarkImage(mark, color) {
  const key = mark + '|' + color;
  const hit = marks.get(key);
  if (hit || !CAN) return hit || null;
  const S = 44, R = 2;
  const cv = makeCanvas(S * R, (S + 8) * R);
  const x = cv.getContext('2d');
  x.scale(R, R);
  const cx = S / 2, cy = S / 2 - 2;
  // 後ろの光
  const rg = x.createRadialGradient(cx, cy, 4, cx, cy, 22);
  rg.addColorStop(0, rgba(color, 0.55)); rg.addColorStop(1, rgba(color, 0));
  x.fillStyle = rg; x.fillRect(0, 0, S, S);
  x.lineJoin = 'round';
  if (mark === 'complete') {
    x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2);
    x.moveTo(cx - 5, cy + 12); x.lineTo(cx, cy + 20); x.lineTo(cx + 5, cy + 12);
    x.lineWidth = 5; x.strokeStyle = '#2a1206'; x.stroke();
    const g = x.createLinearGradient(0, cy - 14, 0, cy + 14); g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(color, 0.55));
    x.fillStyle = g; x.fill();
    x.lineWidth = 2; x.strokeStyle = color; x.stroke();
    drawMapleText(x, '?', cx, cy + 0.5, 'normal', 24);
  } else {
    x.beginPath();
    if (x.roundRect) x.roundRect(cx - 12, cy - 14, 24, 26, 7); else x.rect(cx - 12, cy - 14, 24, 26);
    x.moveTo(cx - 5, cy + 11); x.lineTo(cx, cy + 19); x.lineTo(cx + 5, cy + 11);
    x.lineWidth = 5; x.strokeStyle = '#2a1206'; x.stroke();
    const g = x.createLinearGradient(0, cy - 14, 0, cy + 12); g.addColorStop(0, shade(color, 0.5)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.25));
    x.fillStyle = g; x.fill();
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); if (x.roundRect) x.roundRect(cx - 9, cy - 12, 18, 6, 3); else x.rect(cx - 9, cy - 12, 18, 6); x.fill();
    drawMapleText(x, '!', cx, cy - 0.5, 'white', 26);
  }
  const c = { img: cv, w: S, h: S + 8 };
  marks.set(key, c);
  return c;
}

/** 死亡時の墓石（メイプル風: 上から落ちてきて地面で小さく跳ねる）。t = 倒れてからの秒。キャッシュ画像 */
let tomb = null;
export function drawTombstone(ctx, x, y, t) {
  if (!tomb && CAN) {
    const W = 44, H = 56, R = 2;
    const cv = makeCanvas(W * R, H * R), c = cv.getContext('2d');
    c.scale(R, R);
    c.beginPath(); c.moveTo(6, H - 4); c.lineTo(6, 20); c.arc(W / 2, 20, W / 2 - 6, Math.PI, 0); c.lineTo(W - 6, H - 4); c.closePath();
    c.lineWidth = 3; c.strokeStyle = '#1a1024'; c.stroke();
    const g = c.createLinearGradient(0, 4, 0, H); g.addColorStop(0, '#b8b0c8'); g.addColorStop(1, '#6a6280');
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(10, 18, 4, H - 26);
    c.fillStyle = '#3a3048'; c.fillRect(2, H - 6, W - 4, 5);
    drawMapleText(c, 'RIP', W / 2, 30, 'miss', 16, { kern: 0.9 });
    tomb = { img: cv, w: W, h: H };
  }
  if (!tomb) return;
  // 0.35 秒で落ちる → 小さく1回跳ねる
  let dy;
  if (t < 0.35) { const k = t / 0.35; dy = -260 * (1 - k * k); }
  else if (t < 0.55) { const k = (t - 0.35) / 0.2; dy = -Math.sin(k * Math.PI) * 12; }
  else dy = 0;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, t * 6);
  ctx.drawImage(tomb.img, Math.round(x - tomb.w / 2), Math.round(y - tomb.h + dy), tomb.w, tomb.h);
  ctx.restore();
}
