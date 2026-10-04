// モンスター/ペット描画の共通キット（フラッシュ状態・塗り＋線・かわいい目・頬）
// v4 HQ: 2段セル影＋ツヤ＋リムライト（body）、色補正（tone）、ポーズ文脈（ため/怒り）、
//        目の表情（ハイライト3・ため目・> <・ぐるぐる目）、発光スプライトのLRUキャッシュ。
import { rgba, OUTLINE } from './util.js';

const PI = Math.PI;
/** 被弾フラッシュ中は全塗りを白に（live binding） */
export let FL = false;
export function setFL(v) { FL = !!v; }
export const C = (c) => (FL ? '#ffffff' : c);
export const OC = () => (FL ? '#ffd8ea' : OUTLINE);
export function fs(ctx, col, lw = 2) { ctx.fillStyle = C(col); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke(); }

/** def.color が未指定/白（mk() の既定値）なら既定色を使う */
export function pickCol(c, dflt) { return (!c || c === '#ffffff' || c === '#fff') ? dflt : c; }

// ---------------------------------------------------------------- 環境（夜・リムライト色）とポーズ
/** night: 0..1（夜ほどリムライトが強くネオン色に）, rim: リム色 */
export const ENV = { night: 0, rim: '#fff4dc', rim2: '#7af7ff' };
export function setEnv(night, accent) {
  ENV.night = night;
  ENV.rim = night > 0.5 ? '#ff7ad8' : '#fff4dc';
  ENV.rim2 = accent || '#7af7ff';
}
/** windup: 攻撃予備動作（0..1 の溜め）, rage: 第2形態（HP半分以下）, boss */
export const POSE = { windup: 0, rage: 0, boss: false };
export function setPose(windup, rage, boss) { POSE.windup = windup || 0; POSE.rage = rage || 0; POSE.boss = !!boss; }

// ---------------------------------------------------------------- パーツ単位のスプライトキャッシュ
// 形が時間で変わらない重いパーツ（開いた目・甲羅・胴など）を 2x のオフスクリーンへ一度だけ描き、
// 以後は現在の変換（移動・回転・伸縮・左右反転）のまま drawImage する。フレーム単位ではないのでアニメは滑らか。
// キーには フラッシュ/夜/解像度 を含む。件数上限つき（古い順に破棄）。
export const PC = { on: true, res: 2, max: 600, count: 0, misses: 0 };
const partCache = new Map();
function mkCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
/** key: パーツ識別子, (x,y,w,h): ローカル座標の範囲, pad: 余白, fn(c): c に描く関数（ローカル座標） */
export function cpart(ctx, key, x, y, w, h, pad, fn, key2) {
  if (!PC.on) { fn(ctx); return; }
  const R = PC.res;
  // 3段 Map（キー文字列の連結を避ける）: key → key2(色など) → フラグ番号
  let m1 = partCache.get(key);
  if (!m1) { m1 = new Map(); partCache.set(key, m1); }
  const k2 = key2 === undefined ? '' : key2;
  let m2 = m1.get(k2);
  if (!m2) { m2 = new Map(); m1.set(k2, m2); }
  const k3 = (FL ? 1 : 0) + (ENV.night > 0.5 ? 2 : 0) + R * 4;
  let sp = m2.get(k3);
  if (!sp) {
    const cw = Math.ceil((w + pad * 2) * R), ch = Math.ceil((h + pad * 2) * R);
    const cv = cw > 0 && ch > 0 && cw * ch < 4e6 ? mkCanvas(cw, ch) : null;
    if (!cv) { fn(ctx); return; }
    const c = cv.getContext('2d');
    c.setTransform(R, 0, 0, R, (pad - x) * R, (pad - y) * R);
    c.lineJoin = 'round'; c.lineCap = 'round';
    fn(c);
    sp = { cv, x: x - pad, y: y - pad, w: cw / R, h: ch / R };
    if (++PC.count > PC.max) { partCache.clear(); PC.count = 1; m1 = new Map(); partCache.set(key, m1); m2 = new Map(); m1.set(k2, m2); }
    m2.set(k3, sp);
    PC.misses++;
  }
  ctx.drawImage(sp.cv, sp.x, sp.y, sp.w, sp.h);
}
const r4 = (v) => Math.round(v * 4) / 4;

// ---------------------------------------------------------------- 色補正
const hexRe = /^#([0-9a-f]{6})$/i;
function toHsl(col) {
  const m = hexRe.exec(col); if (!m) return null;
  const n = parseInt(m[1], 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [h, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hx = (v) => { v = Math.round((v + m) * 255); return (v < 16 ? '0' : '') + v.toString(16); };
  return '#' + hx(r) + hx(g) + hx(b);
}
const toneCache = new Map();
let toneN = 0;
/** 2段 Map のメモ（文字列連結なし）: kind → col → amt */
function memo(kind, col, amt, fn) {
  let m = toneCache.get(col);
  if (!m) { if (toneN > 2500) { toneCache.clear(); toneN = 0; } m = new Map(); toneCache.set(col, m); }
  const k = kind * 100000 + Math.round(amt * 1000);
  let r = m.get(k);
  if (r === undefined) { r = fn(); m.set(k, r); toneN++; }
  return r;
}
/** 体色の補正: 彩度/明度を「濁らない」範囲へ（グレー系はそのまま少しだけ寒色へ） */
export function tone(col) {
  return memo(0, col, 0, () => {
    const p = toHsl(col); if (!p) return col;
    let [h, s, l] = p;
    if (s < 0.12) return fromHsl(h || 250, Math.max(s, 0.08), Math.min(0.86, Math.max(0.3, l)));
    s = Math.min(0.92, Math.max(0.42, s));
    l = Math.min(0.74, Math.max(0.34, l));
    // 黄緑〜黄土の「くすみ」帯は少し明るく
    if (h > 40 && h < 75 && l < 0.45) l = 0.48;
    return fromHsl(h, s, l);
  });
}
/** 影色: 黒を混ぜず「明度↓＋色相を紫へ寄せる＋彩度↑」で濁りを防ぐ。amt 0..1 */
export function shadow(col, amt = 0.2) {
  return memo(1, col, amt, () => {
    const p = toHsl(col); if (!p) return col;
    let [h, s, l] = p;
    const tgt = 275; let dh = tgt - h; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    h += dh * Math.min(0.2, amt * 0.5);
    return fromHsl(h, Math.min(1, s + amt * 0.25 + (s < 0.12 ? 0 : 0.05)), l * (1 - amt * 1.05) - amt * 0.04);
  });
}
/** ハイライト色: 明度↑＋色相を黄へ少し寄せる */
export function light(col, amt = 0.25) {
  return memo(3, col, amt, () => {
    const p = toHsl(col); if (!p) return col;
    let [h, s, l] = p;
    const tgt = 55; let dh = tgt - h; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    h += dh * Math.min(0.2, amt * 0.4);
    return fromHsl(h, s * (1 - amt * 0.15), l + (1 - l) * amt);
  });
}
/** 色相回転（第2形態の色変化など） */
export function hue(col, deg, ds = 0, dl = 0) {
  return memo(5, col, deg * 7 + ds * 13 + dl * 17, () => {
    const p = toHsl(col); if (!p) return col;
    return fromHsl(p[0] + deg, p[1] + ds, p[2] + dl);
  });
}

// ---------------------------------------------------------------- 立体塗り
/**
 * 現在のパスを「2段セル影＋ツヤ＋リムライト＋線の強弱」で塗る。
 * (x,y,w,h) はパーツの外接矩形（ローカル座標）。光源は左上。
 * o.gloss=false でツヤ無し, o.rim=false でリム無し, o.lw 線幅, o.grad=false で縦グラデ無し
 */
export function body(ctx, col, x, y, w, h, o) {
  const lw = (o && o.lw) || 2;
  if (FL) { ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke(); return; }
  // 2段セル影: 単位円の放射グラデ（硬いストップ）を外接矩形へ拡大して塗る → クリップ不要・色ごとに1個キャッシュ
  ctx.save();
  ctx.translate(x + w * 0.5, y + h * 0.5); ctx.scale(w * 0.5 || 1, h * 0.5 || 1);
  ctx.fillStyle = celGrad(ctx, col);
  ctx.fill();
  ctx.restore();
  const nt = ENV.night > 0.5 && (!o || o.rim !== false);
  if ((o && o.inner) || nt) {
    ctx.save(); ctx.clip();
    // inner: 内側の模様（クリップ済み）。beginPath してよいが、その場合 o.path で輪郭を再構築する
    if (o && o.inner) { o.inner(ctx); if (o.path) { ctx.beginPath(); o.path(ctx); } }
    // リムライト（夜: 右側のネオン。太い線をクリップ内側だけ残し、線形グラデで片側へ減衰）
    if (nt) {
      const rc = ENV.rim2;
      ctx.strokeStyle = linGrad(ctx, x + w, y, x + w * 0.45, y + h * 0.3, [0, rgba(rc, 0.8), 1, rgba(rc, 0)], 'rn' + rc);
      ctx.lineWidth = lw * 2.6 + Math.min(w, h) * 0.08;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke();
  // ツヤ（輪郭の後に描くので現在のパスを壊してよい）
  if (!o || o.gloss !== false) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + h * 0.22, w * 0.17, h * 0.085, -0.5, 0, PI * 2);
    ctx.moveTo(x + w * 0.52 + Math.min(w, h) * 0.035, y + h * 0.13); ctx.arc(x + w * 0.52, y + h * 0.13, Math.min(w, h) * 0.035, 0, PI * 2);
    ctx.fill();
  }
}
const celCache = new Map();
function celGrad(ctx, col) {
  let g = celCache.get(col);
  if (g) return g;
  const s1 = shadow(col, 0.17), s2 = shadow(col, 0.36);
  g = ctx.createRadialGradient(-0.42, -0.55, 0, -0.42, -0.55, 2.05);
  g.addColorStop(0, light(col, 0.32)); g.addColorStop(0.2, light(col, 0.12)); g.addColorStop(0.5, col);
  g.addColorStop(0.62, col); g.addColorStop(0.625, s1); g.addColorStop(0.83, s1); g.addColorStop(0.835, s2); g.addColorStop(1, s2);
  if (celCache.size > 400) celCache.clear();
  celCache.set(col, g);
  return g;
}

// グラデーションのキャッシュ（CanvasGradient は描画時の変換で解釈されるため、ローカル座標が同じなら再利用できる）
const gradCache = new Map();
const GRAD_MAX = 3000;
function q2(v) { return Math.round(v * 2); }
export function linGrad(ctx, x0, y0, x1, y1, stops, key) {
  const k = key + '|' + q2(x0) + ',' + q2(y0) + ',' + q2(x1) + ',' + q2(y1);
  let g = gradCache.get(k);
  if (g) return g;
  g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  if (gradCache.size >= GRAD_MAX) gradCache.clear();
  gradCache.set(k, g);
  return g;
}

/** 形が一定のパーツを body() で塗ってキャッシュ（pathFn(c) はローカル座標でパスを作る関数） */
export function bodyK(ctx, key, col, x, y, w, h, pathFn, o) {
  const lw = (o && o.lw) || 2;
  cpart(ctx, key, x, y, w, h, lw + 2 + Math.min(w, h) * 0.05, (c) => { c.beginPath(); pathFn(c); body(c, col, x, y, w, h, o); }, col);
}
export function metalK(ctx, key, col, x, y, w, h, pathFn, lw = 2, vertical = true) {
  cpart(ctx, key, x, y, w, h, lw + 1.5, (c) => { c.beginPath(); pathFn(c); metal(c, col, x, y, w, h, lw, vertical); }, col);
}
export function partK(ctx, key, col, x, y, w, h, pathFn, lw = 1.6) {
  cpart(ctx, key, x, y, w, h, lw + 1.5, (c) => { c.beginPath(); pathFn(c); part(c, col, x, y, w, h, lw); }, col);
}

/** body の軽量版（小パーツ用）: 単色＋下側影1段＋線 */
export function part(ctx, col, x, y, w, h, lw = 1.6) {
  if (FL) { ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke(); return; }
  ctx.fillStyle = linGrad(ctx, 0, y, 0, y + h, [0, light(col, 0.12), 0.5, col, 0.62, shadow(col, 0.16), 1, shadow(col, 0.26)], 'p' + col);
  ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke();
}

/** 金属（クローム）グラデ: 帯状のスペキュラ */
export function metal(ctx, col, x, y, w, h, lw = 2, vertical = true) {
  if (FL) { ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke(); return; }
  const st = [0, light(col, 0.5), 0.18, light(col, 0.2), 0.42, col, 0.5, shadow(col, 0.22), 0.62, col, 0.85, shadow(col, 0.3), 1, shadow(col, 0.45)];
  ctx.fillStyle = vertical ? linGrad(ctx, 0, y, 0, y + h, st, 'm' + col) : linGrad(ctx, x, 0, x + w, 0, st, 'm' + col);
  ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke();
}

/** 接地影（二重楕円） */
let shSpr = null;
export function groundShadow(ctx, x, y, rx, a = 0.3) {
  if (!shSpr) {
    shSpr = mkCanvas(128, 32);
    if (shSpr) {
      const c = shSpr.getContext('2d');
      c.fillStyle = 'rgba(20,0,30,0.55)'; c.beginPath(); c.ellipse(64, 16, 62, 14, 0, 0, PI * 2); c.fill();
      c.fillStyle = 'rgba(20,0,30,1)'; c.beginPath(); c.ellipse(64, 16, 39, 9.5, 0, 0, PI * 2); c.fill();
    }
  }
  const ry = 3 + rx * 0.09, w = rx * 1.15;
  if (shSpr) {
    const pa = ctx.globalAlpha; ctx.globalAlpha = pa * a;
    ctx.drawImage(shSpr, x - w * 64 / 62, y - ry * 16 / 14, w * 128 / 62, ry * 32 / 14);
    ctx.globalAlpha = pa; return;
  }
  ctx.fillStyle = 'rgba(20,0,30,0.2)'; ctx.beginPath(); ctx.ellipse(x, y, w, ry, 0, 0, PI * 2); ctx.fill();
}

// ---------------------------------------------------------------- 目・表情
function swirl(ctx, cx, y, r) {
  ctx.beginPath();
  for (let a = 0; a < PI * 4.2; a += 0.35) { const rr = r * (0.15 + a / (PI * 4.2) * 0.95); const px = cx + Math.cos(a) * rr, py = y + Math.sin(a) * rr; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.stroke();
}
/**
 * かわいい目（両目）。x,y=両目の中心, r=目の半径, gap=中心からの距離, col=虹彩色
 * st: idle/walk/attack/hurt/dead, POSE.windup で「ため目」、POSE.rage で怒り眉
 */
export function cuteEyes(ctx, x, y, r, gap, col, st, t, sleepy) {
  if (st === 'hurt') {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.6, r * 0.5); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    ctx.moveTo(x - gap - r, y - r * 0.9); ctx.lineTo(x - gap + r * 0.7, y); ctx.lineTo(x - gap - r, y + r * 0.9);
    ctx.moveTo(x + gap + r, y - r * 0.9); ctx.lineTo(x + gap - r * 0.7, y); ctx.lineTo(x + gap + r, y + r * 0.9);
    ctx.stroke();
    // 涙
    if (!FL && gap > 0.5) { ctx.fillStyle = 'rgba(140,220,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - gap - r * 0.9, y + r * 1.3, r * 0.28, r * 0.42, 0, 0, PI * 2); ctx.fill(); }
    return;
  }
  if (st === 'dead') {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.1, r * 0.3); ctx.lineCap = 'round';
    for (const cx of gap > 0.5 ? [x - gap, x + gap] : [x]) swirl(ctx, cx, y, r * 1.05);
    return;
  }
  const wind = POSE.windup > 0 || st === 'attack';
  const blink = !wind && ((t * 0.97 + x * 0.013) % 4.2) < 0.13;
  if (!blink) {
    // 開いた目はスプライト化（形は状態ごとに一定）。目の中心を原点に描いて平行移動
    const rr_ = r4(r), gg = r4(gap), ang = POSE.rage > 0 ? 1 : 0;
    const k2 = rr_ * 1000 + gg * 4 + (wind ? 0.1 : 0) + (ang ? 0.2 : 0) + (sleepy ? 0.4 : 0);
    const ex = gg + rr_ * 1.9, top = rr_ * 2.4;
    ctx.translate(x, y);
    cpart(ctx, col, -ex, -top, ex * 2, top + rr_ * 1.7, 1, (c) => openEyes(c, 0, 0, rr_, gg, col, wind, ang, sleepy), k2);
    ctx.translate(-x, -y);
  } else openEyes(ctx, x, y, r, gap, col, wind, POSE.rage > 0, sleepy, true);
  // ため中の汗
  if (POSE.windup > 0 && !FL) {
    ctx.fillStyle = 'rgba(150,225,255,0.9)';
    const sx = x + gap + r * 2, sy = y - r * 1.6;
    ctx.beginPath(); ctx.moveTo(sx, sy - r * 0.7); ctx.quadraticCurveTo(sx + r * 0.5, sy, sx, sy + r * 0.3); ctx.quadraticCurveTo(sx - r * 0.5, sy, sx, sy - r * 0.7); ctx.fill();
  }
}
function openEyes(ctx, x, y, r, gap, col, wind, rage, sleepy, blink) {
  const two = gap > 0.5;
  const x0 = two ? x - gap : x, x1 = x + gap;
  if (blink) {
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.4, r * 0.4); ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(x0 - r, y); ctx.quadraticCurveTo(x0, y + r * 0.7, x0 + r, y);
    if (two) { ctx.moveTo(x1 - r, y); ctx.quadraticCurveTo(x1, y + r * 0.7, x1 + r, y); }
    ctx.stroke();
  } else {
    const ry = wind ? r * 0.85 : r * 1.2, rx = r * 0.92, ey = wind ? y + r * 0.15 : y;
    // 外形（濃い縁）
    ctx.fillStyle = OC(); ctx.beginPath();
    ctx.ellipse(x0, ey, rx + r * 0.16, ry + r * 0.16, 0, 0, PI * 2);
    if (two) { ctx.moveTo(x1 + rx + r * 0.16, ey); ctx.ellipse(x1, ey, rx + r * 0.16, ry + r * 0.16, 0, 0, PI * 2); }
    ctx.fill();
    // 虹彩（縦グラデ: 単位グラデを縦に拡大して両目まとめて1回で塗る）
    ctx.beginPath(); ctx.ellipse(x0, ey, rx, ry, 0, 0, PI * 2);
    if (two) { ctx.moveTo(x1 + rx, ey); ctx.ellipse(x1, ey, rx, ry, 0, 0, PI * 2); }
    if (FL) { ctx.fillStyle = '#fff'; ctx.fill(); }
    else {
      const ep = eyePal(ctx, col);
      ctx.save(); ctx.translate(0, ey); ctx.scale(1, ry); ctx.fillStyle = ep.grad; ctx.fill(); ctx.restore();
      // 瞳孔＋下の反射
      ctx.fillStyle = 'rgba(16,6,26,0.75)'; ctx.beginPath();
      ctx.ellipse(x0 + r * 0.05, ey - ry * 0.05, rx * 0.5, ry * 0.55, 0, 0, PI * 2);
      if (two) { ctx.moveTo(x1 + r * 0.05 + rx * 0.5, ey - ry * 0.05); ctx.ellipse(x1 + r * 0.05, ey - ry * 0.05, rx * 0.5, ry * 0.55, 0, 0, PI * 2); }
      ctx.fill();
      ctx.fillStyle = ep.refl; ctx.beginPath();
      ctx.ellipse(x0, ey + ry * 0.55, rx * 0.6, ry * 0.25, 0, 0, PI * 2);
      if (two) { ctx.moveTo(x1 + rx * 0.6, ey + ry * 0.55); ctx.ellipse(x1, ey + ry * 0.55, rx * 0.6, ry * 0.25, 0, 0, PI * 2); }
      ctx.fill();
    }
    // ハイライト3つ（大・小・きらめき）— 1パス
    const tw = 1;
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    for (const cx of two ? [x0, x1] : [x0]) {
      ctx.moveTo(cx + r * 0.3 + r * 0.4 * tw, ey - ry * 0.38); ctx.ellipse(cx + r * 0.3, ey - ry * 0.38, r * 0.4 * tw, r * 0.34 * tw, -0.4, 0, PI * 2);
      ctx.moveTo(cx - r * 0.34 + r * 0.17, ey + ry * 0.4); ctx.arc(cx - r * 0.34, ey + ry * 0.4, r * 0.17, 0, PI * 2);
      ctx.moveTo(cx - r * 0.1 + r * 0.09, ey - ry * 0.62); ctx.arc(cx - r * 0.1, ey - ry * 0.62, r * 0.09, 0, PI * 2);
    }
    ctx.fill();
    // 上まぶた（外端を跳ね上げ）＋ため/怒り眉 — 1パス
    ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.2, r * 0.42); ctx.lineCap = 'round'; ctx.beginPath();
    const list = two ? [[x0, -1], [x1, 1]] : [[x0, 1]];
    for (const [cx, side] of list) {
      ctx.moveTo(cx + Math.cos(PI * 1.12) * (rx + r * 0.1), ey + Math.sin(PI * 1.12) * (ry + r * 0.1));
      ctx.ellipse(cx, ey, rx + r * 0.1, ry + r * 0.1, 0, PI * 1.12, PI * 1.88);
      ctx.moveTo(cx + side * (rx * 0.95), ey - ry * 0.5); ctx.lineTo(cx + side * (rx * 1.35), ey - ry * 0.75);
    }
    ctx.stroke();
    if (wind || rage) {
      ctx.lineWidth = Math.max(1.4, r * 0.48); ctx.beginPath();
      for (const [cx, side] of list) { const inner = two ? -side : -1; ctx.moveTo(cx - inner * rx * 1.1, ey - ry - r * 0.75); ctx.lineTo(cx + inner * rx * 0.9, ey - ry - r * 0.05); }
      ctx.stroke();
    }
    if (sleepy) {
      ctx.fillStyle = C(OC()); ctx.beginPath();
      for (const [cx] of list) { ctx.moveTo(cx + rx * 1.1, ey - ry * 0.55); ctx.ellipse(cx, ey - ry * 0.55, rx * 1.1, ry * 0.5, 0, 0, PI, true); }
      ctx.fill();
    }
  }
}

const eyeCache = new Map();
function eyePal(ctx, col) {
  let p = eyeCache.get(col);
  if (p) return p;
  const g = ctx.createLinearGradient(0, -1, 0, 1);
  g.addColorStop(0, '#1a0f24'); g.addColorStop(0.45, shadow(col, 0.2)); g.addColorStop(1, light(col, 0.45));
  p = { grad: g, refl: rgba(light(col, 0.6), 0.55) };
  if (eyeCache.size > 300) eyeCache.clear();
  eyeCache.set(col, p);
  return p;
}

/** 鋭い発光目（かっこいい系）。x,y 中心, r 半径, slit=縦長瞳孔 */
export function fierceEye(ctx, x, y, r, col, st, t, slit = true, ang = 0) {
  if (st === 'hurt' || st === 'dead') { cuteEyes(ctx, x, y, r * 0.75, 0.01, '#000', st, t); return; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  glow(ctx, 0, 0, r * 3.2, col, 0.55 + POSE.rage * 0.3 + ENV.night * 0.2);
  const k = POSE.windup > 0 || st === 'attack' ? 0.62 : 1;
  ctx.beginPath(); ctx.moveTo(-r * 1.25, r * 0.15); ctx.quadraticCurveTo(-r * 0.2, -r * 1.05 * k, r * 1.2, -r * 0.4 * k); ctx.quadraticCurveTo(r * 0.5, r * 0.9 * k, -r * 1.25, r * 0.15); ctx.closePath();
  if (FL) ctx.fillStyle = '#fff';
  else { const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, light(col, 0.65)); g.addColorStop(1, col); ctx.fillStyle = g; }
  ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.1, r * 0.35); ctx.stroke();
  if (!FL) {
    ctx.fillStyle = '#12061c';
    ctx.beginPath(); if (slit) ctx.ellipse(r * 0.05, -r * 0.05, r * 0.2, r * 0.62 * k, 0.15, 0, PI * 2); else ctx.arc(r * 0.05, 0, r * 0.38, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.3 * k, r * 0.18, 0, PI * 2); ctx.fill();
  }
  // 眉骨
  ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.4, r * 0.5); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 1.4, -r * 0.55 - (1 - k) * r * 0.6); ctx.lineTo(r * 1.3, -r * 0.95 + (1 - k) * r * 0.4); ctx.stroke();
  ctx.restore();
}

let blushSpr = null;
export function blush(ctx, x, y, rx) {
  if (FL) return;
  if (!blushSpr) {
    blushSpr = mkCanvas(64, 32);
    if (blushSpr) {
      const c = blushSpr.getContext('2d'); c.translate(32, 16); c.scale(28, 28);
      c.fillStyle = 'rgba(255,110,150,0.5)'; c.beginPath(); c.ellipse(0, 0, 1, 0.5, 0, 0, PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-0.45, 0.15); c.lineTo(-0.2, -0.25); c.moveTo(0.05, 0.15); c.lineTo(0.3, -0.25); c.stroke();
    }
  }
  if (blushSpr) { ctx.drawImage(blushSpr, x - rx * 32 / 28, y - rx * 16 / 28, rx * 64 / 28, rx * 32 / 28); return; }
  ctx.fillStyle = 'rgba(255,110,150,0.5)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, PI * 2); ctx.fill();
}

/** 小さな口: 'smile' | 'open' | 'cat' | 'flat' | 'grit'（食いしばり） | 'wave'（波線） */
export function mouth(ctx, x, y, s, kind) {
  ctx.strokeStyle = OC(); ctx.lineWidth = Math.max(1.1, s * 0.35); ctx.lineCap = 'round'; ctx.beginPath();
  if (kind === 'open') {
    ctx.moveTo(x - s, y - s * 0.2); ctx.quadraticCurveTo(x, y + s * 1.7, x + s, y - s * 0.2); ctx.closePath();
    ctx.fillStyle = C('#c2304a'); ctx.fill(); ctx.stroke();
    if (!FL) { ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(x, y + s * 0.65, s * 0.45, s * 0.25, 0, 0, PI * 2); ctx.fill(); }
    return;
  }
  if (kind === 'grit') {
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.8, y + s * 0.7); ctx.lineTo(x - s * 0.8, y + s * 0.7); ctx.closePath();
    ctx.fillStyle = C('#ffffff'); ctx.fill(); ctx.stroke();
    ctx.lineWidth = Math.max(0.6, s * 0.18); ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.lineTo(x - s * 0.3, y + s * 0.7); ctx.moveTo(x + s * 0.3, y); ctx.lineTo(x + s * 0.3, y + s * 0.7); ctx.stroke();
    return;
  }
  if (kind === 'wave') { ctx.moveTo(x - s, y); for (let i = 1; i <= 4; i++) ctx.lineTo(x - s + i * s * 0.5, y + (i % 2 ? -s * 0.35 : s * 0.1)); }
  else if (kind === 'cat') { ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.8, x, y); ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.8, x + s, y); }
  else if (kind === 'flat') { ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x + s * 0.7, y); }
  else { ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x, y + s, x + s, y); }
  ctx.stroke();
}

/** 表情に合わせた口の種類 */
export function mouthFor(st, dflt = 'cat') {
  if (st === 'dead') return 'wave';
  if (st === 'hurt') return 'open';
  if (POSE.windup > 0) return 'grit';
  if (st === 'attack') return 'open';
  return dflt;
}

// ---------------------------------------------------------------- 発光（色ごとのスプライトをLRUキャッシュ）
const glowCache = new Map();
const GLOW_MAX = 48;
function glowSprite(col) {
  let c = glowCache.get(col);
  if (c) return c;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64) : document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, rgba(col, 1)); rg.addColorStop(0.35, rgba(col, 0.55)); rg.addColorStop(1, rgba(col, 0));
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  glowCache.set(col, c);
  if (glowCache.size > GLOW_MAX) glowCache.delete(glowCache.keys().next().value);
  return c;
}
export function glow(ctx, x, y, r, col, a) {
  if (FL || r <= 0 || a <= 0) return;
  const spr = glowSprite(col);
  if (!spr) return;
  const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pa * Math.min(1, a);
  ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc;
}

/** キラッ（4方向の星） */
export function sparkle(ctx, x, y, s, col = '#ffffff', a = 1) {
  if (FL) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a; ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
  ctx.restore();
}

/** 王冠（共通・宝石つき） */
export function crownHQ(ctx, x, y, s, gem = '#ff3d7f', t = 0, tilt = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 1.15, -s * 0.95); ctx.lineTo(-s * 0.55, -s * 0.45); ctx.lineTo(0, -s * 1.25); ctx.lineTo(s * 0.55, -s * 0.45); ctx.lineTo(s * 1.15, -s * 0.95); ctx.lineTo(s, 0); ctx.closePath();
  metal(ctx, '#ffc21a', -s, -s * 1.25, s * 2, s * 1.25, Math.max(1.2, s * 0.14));
  ctx.beginPath(); ctx.rect(-s, -s * 0.22, s * 2, s * 0.26); part(ctx, '#e89a00', -s, -s * 0.22, s * 2, s * 0.26, Math.max(1, s * 0.1));
  for (const [gx, gy, gr] of [[0, -s * 0.5, 0.2], [-s * 1.15, -s * 0.95, 0.12], [s * 1.15, -s * 0.95, 0.12], [0, -s * 1.25, 0.12]]) {
    ctx.beginPath(); ctx.arc(gx, gy, s * gr, 0, PI * 2); fs(ctx, gem, Math.max(0.8, s * 0.07));
  }
  sparkle(ctx, s * 0.5, -s * 0.9, s * 0.35 * (0.6 + 0.4 * Math.sin(t * 4)), '#fff8d0', 0.9);
  ctx.restore();
}
