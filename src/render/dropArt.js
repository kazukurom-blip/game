// ドロップの見た目（キャッシュ画像）: お金の段階（メイプルのメル: 銅貨 1〜49 / 金貨 50〜99 / 札束 100〜999 / 袋 1000〜）、
// レア以上の光の輪・光の柱。毎フレームのグラデーション作成・shadowBlur をやめて drawImage だけにする。
import { makeCanvas, rgba, shade } from './util.js';

const CAN = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
const R = 2;
const PI = Math.PI;

/** お金の段階: 0=銅貨 1=金貨 2=札束 3=袋 */
export function moneyTier(n) { return n < 50 ? 0 : n < 100 ? 1 : n < 1000 ? 2 : 3; }

const money = [];
export function moneySprite(n) {
  const tier = moneyTier(n);
  if (money[tier] || !CAN) return money[tier] || null;
  const S = 30;
  const cv = makeCanvas(S * R, S * R);
  const x = cv.getContext('2d');
  x.scale(R, R); x.translate(S / 2, S / 2);
  x.lineJoin = 'round';
  const OL = '#2a1406';
  if (tier <= 1) {
    // 硬貨（銅＝赤茶 / 金＝黄金）: 縁・内側の段・「$」の刻印・つや
    const [c1, c2, c3] = tier === 0 ? ['#ffc49a', '#d9773a', '#8a3a12'] : ['#fff6b0', '#ffc928', '#b8740a'];
    const r = tier === 0 ? 9 : 10.5;
    x.beginPath(); x.arc(0, 0, r, 0, PI * 2); x.lineWidth = 2.4; x.strokeStyle = OL; x.stroke();
    const g = x.createLinearGradient(0, -r, 0, r); g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
    x.fillStyle = g; x.fill();
    x.beginPath(); x.arc(0, 0, r * 0.68, 0, PI * 2); x.lineWidth = 1.4; x.strokeStyle = rgba(c3, 0.9); x.stroke();
    x.fillStyle = c3; x.font = `900 ${Math.round(r * 1.15)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('$', 0, 0.8);
    x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.ellipse(-r * 0.35, -r * 0.45, r * 0.32, r * 0.16, -0.6, 0, PI * 2); x.fill();
  } else if (tier === 2) {
    // 札束（帯つき・3枚重ね）
    for (let i = 2; i >= 0; i--) {
      x.save(); x.translate(i * 1.6 - 1.6, -i * 2.2 + 3); x.rotate(-0.12);
      x.beginPath(); x.rect(-11, -6, 22, 12); x.lineWidth = 2; x.strokeStyle = OL; x.stroke();
      const g = x.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, '#b8ffb0'); g.addColorStop(1, '#2fa64a');
      x.fillStyle = g; x.fill();
      x.strokeStyle = 'rgba(20,90,40,0.8)'; x.lineWidth = 1; x.strokeRect(-8.5, -3.8, 17, 7.6);
      if (i === 0) {
        x.fillStyle = '#1d6a30'; x.beginPath(); x.arc(0, 0, 2.6, 0, PI * 2); x.fill();
        x.fillStyle = '#ffd23f'; x.fillRect(-2.4, -6, 4.8, 12); x.strokeStyle = OL; x.lineWidth = 0.8; x.strokeRect(-2.4, -6, 4.8, 12);
      }
      x.restore();
    }
  } else {
    // お金の袋（口を縛った袋に「$」）
    x.beginPath();
    x.moveTo(-4, -8); x.quadraticCurveTo(-13, -2, -12, 6); x.quadraticCurveTo(-11, 12, 0, 12); x.quadraticCurveTo(11, 12, 12, 6); x.quadraticCurveTo(13, -2, 4, -8); x.closePath();
    x.lineWidth = 2.4; x.strokeStyle = OL; x.stroke();
    const g = x.createLinearGradient(0, -8, 0, 12); g.addColorStop(0, '#ffe7a8'); g.addColorStop(0.55, '#e0a640'); g.addColorStop(1, '#94591a');
    x.fillStyle = g; x.fill();
    x.beginPath(); x.moveTo(-5, -9); x.lineTo(-7, -13); x.lineTo(0, -10.5); x.lineTo(7, -13); x.lineTo(5, -9); x.closePath();
    x.fillStyle = '#e0a640'; x.fill(); x.lineWidth = 1.6; x.stroke();
    x.fillStyle = '#ff4fa0'; x.fillRect(-5.5, -9.6, 11, 2.6);
    x.fillStyle = '#6a3a0a'; x.font = '900 13px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 0, 3);
    x.fillStyle = '#ffe066'; x.beginPath(); x.arc(9, -4, 3.4, 0, PI * 2); x.fill(); x.lineWidth = 1; x.stroke();
  }
  money[tier] = { img: cv, w: S, h: S, coin: tier <= 1, tier };
  return money[tier];
}

const glows = new Map();
/** {glow: 丸い光, ring: 足元の楕円の輪（上下つぶしは描く側）} */
export function rarityGlowSprite(color) {
  let c = glows.get(color);
  if (c || !CAN) return c || null;
  const S = 64;
  const gcv = makeCanvas(S, S), gx = gcv.getContext('2d');
  const rg = gx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  rg.addColorStop(0, rgba('#ffffff', 0.7)); rg.addColorStop(0.35, rgba(color, 0.55)); rg.addColorStop(1, rgba(color, 0));
  gx.fillStyle = rg; gx.fillRect(0, 0, S, S);
  const rcv = makeCanvas(S * 2, S), rx = rcv.getContext('2d');
  rx.translate(S, S / 2); rx.scale(1, 0.5);
  const rr = rx.createRadialGradient(0, 0, S * 0.45, 0, 0, S * 0.95);
  rr.addColorStop(0, rgba(color, 0)); rr.addColorStop(0.45, rgba(color, 0.9)); rr.addColorStop(0.6, rgba(shade(color, 0.6), 1)); rr.addColorStop(0.75, rgba(color, 0.9)); rr.addColorStop(1, rgba(color, 0));
  rx.fillStyle = rr; rx.beginPath(); rx.arc(0, 0, S * 0.95, 0, PI * 2); rx.fill();
  c = { glow: gcv, ring: rcv };
  glows.set(color, c);
  return c;
}

const pillars = new Map();
/** 縦の光の柱（下が明るく、上へ消える。中心に白い芯） */
export function rarityPillarSprite(color) {
  let c = pillars.get(color);
  if (c || !CAN) return c || null;
  const W = 40, H = 128;
  const cv = makeCanvas(W, H), x = cv.getContext('2d');
  const hg = x.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, rgba(color, 0)); hg.addColorStop(0.5, rgba(color, 0.8)); hg.addColorStop(1, rgba(color, 0));
  x.fillStyle = hg; x.fillRect(0, 0, W, H);
  const cg = x.createLinearGradient(0, 0, W, 0);
  cg.addColorStop(0.38, 'rgba(255,255,255,0)'); cg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); cg.addColorStop(0.62, 'rgba(255,255,255,0)');
  x.fillStyle = cg; x.fillRect(0, 0, W, H);
  // 上へ消える
  x.globalCompositeOperation = 'destination-in';
  const vg = x.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.6, 'rgba(0,0,0,0.6)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  c = { img: cv, w: W, h: H };
  pillars.set(color, c);
  return c;
}
