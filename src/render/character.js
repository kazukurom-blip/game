// アニメ調ちびキャラ描画（2.5頭身・高さ約80px・足元中央が(x,y)）
// 全てパス手描き。毎フレーム重い処理（オフスクリーン合成・shadowBlur 等）はしない。
import { shade, rgba, rng, clamp, lerp, OUTLINE } from './util.js';

export const HERO_LOOKS = {
  luna: { body: 'f', skin: '#ffe0cc', hair: 'twin', hairColor: '#ff6fb5', eyeColor: '#ff3d8b', expr: 'cute', hairShadow: '#c83c8a', hairHi: '#ffc2e2', hairTip: '#b47cff', tie: '#ffd23f' },
  jin: { body: 'm', skin: '#f6d5be', hair: 'wolf', hairColor: '#d9dee8', eyeColor: '#33c7e6', expr: 'cool', hairShadow: '#8e97ad', hairHi: '#ffffff', mesh: '#3ee6d2' },
  hacker: { body: 'f', skin: '#e8c4a8', hair: 'bob', hairColor: '#3dff8a', eyeColor: '#19f0ff', expr: 'cool', hairShadow: '#1f9e58', hairHi: '#b6ffd2' },
};

/** キャラ作成で選べる髪型（♂♀どちらでも可）。id は look.hair */
export const HAIR_STYLES = [
  { id: 'short', name: 'ショート' }, { id: 'spiky', name: 'ツンツン' }, { id: 'wolf', name: 'ウルフ' },
  { id: 'bob', name: 'ボブ' }, { id: 'long', name: 'ロング' }, { id: 'ponytail', name: 'ポニーテール' },
  { id: 'twin', name: 'ツインテール' }, { id: 'bun', name: 'おだんご' },
  { id: 'undercut', name: 'アンダーカット' }, { id: 'sidepart', name: 'メカクレ' }, { id: 'messy', name: 'ふわくせ毛' },
  { id: 'braid', name: '三つ編み' }, { id: 'topknot', name: 'ちょんまげ' }, { id: 'curly', name: 'カーリー' },
];

// drawCharacter に最後に渡された look/equip（anim オブジェクト単位）。残像・カットインで使う
const DRAWN = new WeakMap();
export function lastDrawnArgs(anim) { return anim ? DRAWN.get(anim) || null : null; }

// ---------------------------------------------------------------- 定数
const OLW = 2.1;                    // アウトライン太さ
const HIP_Y = -19;
const THIGH = 8.5, SHIN = 8.3, LEG_W = 7;
const UPPER = 7.8, FORE = 7.4, ARM_W = 5.6;
const HEAD_Y = -40;                 // 腰からの頭中心
const SHOULDER_Y = -17.5;
const INNER_TOP = '#3a3346';        // インナー（タンクトップ）
const INNER_BOT = '#2a2633';        // インナー（スパッツ）
const EMPTY = {};
const PI = Math.PI;

const DEF_COL = {
  cap: ['#ff5fa2', '#ffffff'], beanie: ['#19d3c5', '#ffffff'], bandana: ['#d6334a', '#ffffff'], headphones: ['#2b2b3a', '#19f0ff'],
  crown: ['#ffd23f', '#ff3d7f'], helmet: ['#3a3f55', '#ff8a00'], cowboy: ['#9b6a3c', '#e8c27a'], catEars: ['#ff9ad5', '#ffe0f0'],
  tshirt: ['#f6f4f8', '#ff5fa2'], hoodie: ['#7b2ff7', '#ffffff'], leatherJacket: ['#2a2230', '#c0c0c8'], suit: ['#2f3550', '#d8283c'],
  hawaiian: ['#ff9a3c', '#19d3c5'], tank: ['#ff5fa2', '#ffffff'], police: ['#1f3a8a', '#ffd23f'], tracksuit: ['#19d3c5', '#ffffff'],
  idolDress: ['#ff8fc8', '#fff06a'], armorVest: ['#3d4636', '#9aa07a'],
  jeans: ['#3e5f9e', '#c9d6ea'], shorts: ['#4d6fb5', '#ffffff'], cargo: ['#7a6e4a', '#4a4232'], skirt: ['#3a2f6b', '#ffffff'],
  suitPants: ['#2f3550', '#5a5a66'], trackPants: ['#2a2a3a', '#ff3d7f'], armorPants: ['#3d4636', '#9aa07a'],
  sneakers: ['#ffffff', '#ff5fa2'], boots: ['#5a3a2a', '#8a8a8a'], sandals: ['#c58a4a', '#19d3c5'], loafers: ['#3a2620', '#c9a26a'], heels: ['#d6265e', '#ffd23f'],
  sunglasses: ['#1a1a24', '#ffd23f'], goldChain: ['#ffcc33', '#fff4b0'], mask: ['#2a2a35', '#ffffff'], scarf: ['#ff5fa2', '#ffffff'],
  wings: ['#ffffff', '#bff6ff'], halo: ['#ffe066', '#ffffff'],
  bat: ['#c8935a', '#5a3a22'], knife: ['#d8dde8', '#ff6fb5'], katana: ['#e8eef5', '#d8283c'], pistol: ['#3a3d48', '#8a8a8a'],
  smg: ['#2e3038', '#ff8a00'], guitar: ['#ff3e7f', '#f4f4f4'], neonSword: ['#19f0ff', '#ffffff'], staff: ['#19f0ff', '#b04dff'],
};
export function itemColors(look) {
  if (!look) return ['#cccccc', '#ffffff'];
  const d = DEF_COL[look.style] || ['#cccccc', '#ffffff'];
  return [look.color || d[0], look.accent || d[1]];
}

const TOPS = {
  tshirt: { sl: 'short', len: 1 }, hoodie: { sl: 'long', len: 3 }, leatherJacket: { sl: 'long', len: 2 },
  suit: { sl: 'long', len: 3 }, hawaiian: { sl: 'short', len: 2 }, tank: { sl: 'none', len: 1 },
  police: { sl: 'short', len: 1 }, tracksuit: { sl: 'long', len: 2 }, idolDress: { sl: 'puff', len: -4 },
  armorVest: { sl: 'short', len: 2 },
};
const LONG_PANTS = { jeans: 1, cargo: 1, suitPants: 1, trackPants: 1, armorPants: 1 };
const WEAPON_LEN = { bat: 26, knife: 13, katana: 34, guitar: 30, neonSword: 34, staff: 30, pistol: 12, smg: 18 };

// ---------------------------------------------------------------- 破れ形状（シード固定で事前計算）
function jagPoly(seed, cx, cy, rx, ry, n) {
  const R = rng(seed); const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + R() * 0.3;
    const k = i % 2 ? 0.45 + R() * 0.25 : 0.95 + R() * 0.3;
    pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return pts;
}
// 上着の穴（上半身フレーム: 腰中心原点）
const TOP_HOLES = [
  { th: 0.5, p: jagPoly(11, -4, -11, 2.6, 2.2, 10) },
  { th: 0.6, p: jagPoly(23, 5, -4, 2.8, 2.4, 10) },
  { th: 0.7, p: jagPoly(37, -5.5, -2, 2.4, 2.8, 10) },
  { th: 0.85, p: jagPoly(41, 4.5, -13, 2.2, 2.0, 10) },
];
// 大きな裂け目（0.75〜）: 胸の斜めの裂け目
const BIG_RIP = (() => {
  const R = rng(777); const top = []; const bot = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(-7.5, 7, t), y = lerp(-15, -6, t);
    const w = Math.sin(t * PI) * 3.4 + 0.6;
    top.push(x + (R() - 0.5) * 1.2, y - w * (i % 2 ? 0.6 : 1.1));
    bot.push(x + (R() - 0.5) * 1.2, y + w * (i % 2 ? 1.1 : 0.6));
  }
  const pts = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) pts.push(bot[i], bot[i + 1]);
  return pts;
})();
const SCRATCHES = [[-6, -14, -3, -12], [3, -8, 6, -6.5], [-2, -4, 1, -2.5], [5, -15, 7, -13]];
const SOOT = [[-5, -7, 3.2, 2.2], [5, -12, 2.6, 1.8], [-1, -1, 3.6, 1.8], [6, -2, 2, 1.6]];

function polyPath(ctx, p) {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}

// ---------------------------------------------------------------- 描画ステート
let FL = false;
const C = (c) => (FL ? '#ffffff' : c);
const OC = () => (FL ? '#ffd8ea' : OUTLINE);

function fillStroke(ctx, col, lw = OLW) {
  ctx.fillStyle = C(col); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke();
}

// 肢: 2セグメント
const LP = { kx: 0, ky: 0, ex: 0, ey: 0 };
function limbPts(x0, y0, a, e, l1, l2) {
  LP.kx = x0 + Math.sin(a) * l1; LP.ky = y0 + Math.cos(a) * l1;
  const a2 = a + e;
  LP.ex = LP.kx + Math.sin(a2) * l2; LP.ey = LP.ky + Math.cos(a2) * l2;
}
// 肢上の距離 d の点
const PT = { x: 0, y: 0, a: 0 };
function limbAt(x0, y0, a, e, l1, l2, d) {
  if (d <= l1) { PT.x = x0 + Math.sin(a) * d; PT.y = y0 + Math.cos(a) * d; PT.a = a; }
  else {
    const kx = x0 + Math.sin(a) * l1, ky = y0 + Math.cos(a) * l1;
    const dd = Math.min(d, l1 + l2) - l1;
    PT.x = kx + Math.sin(a + e) * dd; PT.y = ky + Math.cos(a + e) * dd; PT.a = a + e;
  }
}
// 肢の d0..d1 区間をストローク（アウトライン付き）
function strokeLimb(ctx, x0, y0, a, e, l1, l2, d0, d1, w, col, cap = 'round') {
  ctx.lineCap = cap;
  ctx.beginPath();
  limbAt(x0, y0, a, e, l1, l2, d0); ctx.moveTo(PT.x, PT.y);
  if (d0 < l1 && d1 > l1) { ctx.lineTo(x0 + Math.sin(a) * l1, y0 + Math.cos(a) * l1); }
  limbAt(x0, y0, a, e, l1, l2, d1); ctx.lineTo(PT.x + 0.001, PT.y + 0.001);
  ctx.strokeStyle = OC(); ctx.lineWidth = w + OLW * 2; ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = w; ctx.stroke();
  ctx.lineCap = 'round';
}
// 肢の端にギザギザ（破れ）
function jagEnd(ctx, x, y, ang, w, col, len = 2.4) {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const px = Math.cos(ang), py = -Math.sin(ang);
  const hw = w / 2 + 0.6;
  ctx.beginPath();
  ctx.moveTo(x + px * hw, y + py * hw);
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const s = hw - (2 * hw * i) / n;
    const l = i % 2 ? len : 0.2;
    ctx.lineTo(x + px * s + dx * l, y + py * s + dy * l);
  }
  ctx.lineTo(x - px * hw - dx * 1.2, y - py * hw - dy * 1.2);
  ctx.lineTo(x + px * hw - dx * 1.2, y + py * hw - dy * 1.2);
  ctx.closePath();
  ctx.fillStyle = C(col); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.stroke();
}

function bandaid(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.rect(-4, -1.5, 8, 3);
  ctx.fillStyle = C('#f6c99a'); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = C('#e8a87a'); ctx.fillRect(-1.3, -1.1, 2.6, 2.2);
  ctx.restore();
}

// ---------------------------------------------------------------- ポーズ
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

function makePose(state, t, at, wk, ws, anim) {
  const P = {
    bob: 0, tilt: 0, hipY: HIP_Y, lb: [-0.06, 0], lf: [0.06, 0], ab: [-0.1, 0.25], af: [0.15, 0.45],
    eyes: 'n', mouth: 'n', wAng: null, swoosh: null, back: false, lie: 0, headTilt: 0, hairSway: 0,
    showWeapon: true, muzzle: false, punch: false, sit: false,
  };
  const br = Math.sin(t * 2.6);
  // 武器持ちの基本腕
  if (wk === 'melee') { P.af = [0.25, 0.75]; P.wAng = -1.15; }
  else if (wk === 'gun') { P.af = [0.45, 0.85]; }
  else if (wk === 'magic') { P.af = [0.3, 0.6]; P.wAng = -1.48; }
  switch (state) {
    case 'walk': {
      const s = Math.sin(t * 10), c = Math.cos(t * 10);
      P.lf = [0.55 * s, Math.max(0, -c) * 0.55]; P.lb = [-0.55 * s, Math.max(0, c) * 0.55];
      P.ab = [0.6 * s, 0.3];
      if (wk === 'none') P.af = [-0.6 * s, 0.3]; else P.af[0] += -0.2 * s;
      P.bob = -Math.abs(c) * 1.4 + 0.7; P.tilt = 0.05; P.hairSway = s;
      break;
    }
    case 'jump':
      P.lf = [0.85, 1.2]; P.lb = [-0.25, 0.7];
      P.ab = [2.4, 0.4]; if (wk === 'none') P.af = [-0.7, 0.5];
      P.hairSway = -1; P.bob = -0.5;
      break;
    case 'climb': {
      const s = Math.sin(t * 7);
      P.back = true; P.showWeapon = false;
      P.ab = [PI + 0.35 + 0.25 * s, -0.4]; P.af = [PI - 0.35 + 0.25 * s, 0.4];
      P.lb = [-0.15, 0.5 + 0.4 * s]; P.lf = [0.15, 0.5 - 0.4 * s];
      break;
    }
    case 'attack': {
      P.mouth = 'shout'; P.eyes = 'fierce';
      if (wk === 'none') {
        const k = at < 0.5 ? easeOut(at / 0.5) : 1 - easeInOut((at - 0.5) / 0.5);
        P.af = [lerp(0.3, PI / 2, k), lerp(1.4, 0, k)]; P.ab = [lerp(-0.1, -0.7, k), 1.2];
        P.tilt = 0.12 * k; P.punch = k > 0.8; P.lf = [0.3 * k, 0.1]; P.lb = [-0.3 * k, 0.2];
      } else if (wk === 'magic') {
        const k = at < 0.35 ? easeOut(at / 0.35) : 1 - easeInOut((at - 0.35) / 0.65);
        P.af = [lerp(0.3, 1.9, k), lerp(0.6, 0.1, k)]; P.wAng = lerp(-1.48, -0.55, k); P.ab = [-0.4, 0.3];
        P.magicGlow = k;
      } else {
        let a, e = 0.2;
        if (at < 0.2) { const k = easeOut(at / 0.2); a = lerp(0.3, 3.5, k); P.tilt = -0.06 * k; }
        else if (at < 0.55) { const k = easeInOut((at - 0.2) / 0.35); a = lerp(3.5, 0.45, k); P.tilt = lerp(-0.06, 0.12, k); }
        else { const k = easeInOut((at - 0.55) / 0.45); a = lerp(0.45, 0.25, k); e = lerp(0.2, 0.75, k); P.tilt = lerp(0.12, 0, k); }
        P.af = [a, e]; P.ab = [-0.5, 0.4];
        const blend = at < 0.06 ? at / 0.06 : at > 0.85 ? (1 - at) / 0.15 : 1;
        const fore = PI / 2 - (a + e);
        P.wAng = lerp(-1.15, fore, clamp(blend, 0, 1));
        P.lf = [0.35, 0.15]; P.lb = [-0.3, 0.1];
        if (at > 0.2 && at < 0.85) {
          const end = at < 0.55 ? a + e : 0.45 + 0.2;
          P.swoosh = { from: PI / 2 - (3.5 + 0.2), to: PI / 2 - end, alpha: at < 0.55 ? 1 : 1 - (at - 0.55) / 0.3 };
        }
      }
      break;
    }
    case 'shoot': {
      const kick = Math.sin(clamp(at, 0, 1) * PI) * 0.22;
      P.af = [PI / 2 + kick, 0];
      P.ab = ws === 'smg' ? [PI / 2 - 0.25 + kick, 0.25] : [0.05, 0.3];
      P.muzzle = at > 0 && at < 0.25; P.eyes = 'fierce'; P.tilt = -0.03;
      P.lf = [0.25, 0.1]; P.lb = [-0.2, 0.1];
      break;
    }
    case 'hurt':
      P.tilt = -0.18; P.headTilt = -0.12; P.eyes = 'hurt'; P.mouth = 'hurt';
      P.af = [1.6, 0.6]; P.ab = [-1.1, 0.5]; P.lf = [0.35, 0.3]; P.lb = [-0.15, 0.2];
      P.hairSway = 1;
      break;
    case 'dead': {
      const f = anim.fallT != null ? anim.fallT : anim.deadT != null ? anim.deadT : clamp((anim.t || 0) * 3, 0, 1);
      P.lie = clamp(f, 0, 1); P.eyes = 'x'; P.mouth = 'hurt';
      P.af = [0.9, 0.4]; P.ab = [-0.9, 0.3]; P.lf = [0.1, 0.1]; P.lb = [-0.1, 0.2];
      break;
    }
    case 'drive':
      P.sit = true; P.hipY = -11; P.lf = [PI / 2 - 0.1, PI / 2 - 0.1]; P.lb = [PI / 2 - 0.2, PI / 2 - 0.2];
      P.af = [1.25, 0.35]; P.ab = [1.15, 0.4]; P.showWeapon = false; P.eyes = 'fierce';
      break;
    case 'sit':
      P.sit = true; P.hipY = -11; P.lf = [PI / 2 - 0.05, PI / 2 - 0.1]; P.lb = [PI / 2 - 0.25, PI / 2 - 0.25];
      P.ab = [0.25, 0.4]; if (wk === 'none') P.af = [0.45, 0.6];
      P.bob = br * 0.4;
      break;
    default: // idle
      P.bob = br * 0.7; P.ab[0] += br * 0.03; P.af[0] -= br * 0.03;
      P.hairSway = br * 0.3;
  }
  // 慌て顔（市民が逃げる時など）: anim.panic=true
  if (anim.panic && state !== 'dead') {
    P.eyes = 'panic'; P.mouth = 'panic'; P.panic = true; P.showWeapon = false;
    const s = Math.sin(t * 16);
    if (state !== 'hurt') { P.ab = [2.7 + 0.35 * s, 0.5]; P.af = [2.5 - 0.35 * s, 0.5]; P.tilt = state === 'walk' ? 0.14 : 0.04; }
  }
  return P;
}

// ---------------------------------------------------------------- メイン
// ヒーローが最後に描画された装備（乗車中の運転手表示用）
const LAST_EQUIP = new WeakMap();
export function lastHeroEquip(look) { return LAST_EQUIP.get(look) || null; }

// 半透明時は重なりが透けないよう一度オフスクリーンに描いてから合成する（半透明時のみ）
let OFF = null, OFFCTX = null;
export function drawCharacter(ctx, x, y, look, equip, anim) {
  if (anim && anim.alpha != null && anim.alpha < 0.999) {
    const a = Math.max(0, anim.alpha);
    if (a <= 0.01) return;
    const m = ctx.getTransform();
    const k = Math.min(4, Math.max(0.5, Math.hypot(m.a, m.b)));
    const s = anim.scale || 1;
    const w = Math.ceil(220 * s * k), h = Math.ceil(170 * s * k);
    if (typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined') {
      if (!OFF) {
        OFF = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
        OFFCTX = OFF.getContext('2d');
      }
      if (OFF.width < w || OFF.height < h) { OFF.width = Math.max(OFF.width, w); OFF.height = Math.max(OFF.height, h); }
      const oc = OFFCTX;
      oc.setTransform(1, 0, 0, 1, 0, 0);
      oc.clearRect(0, 0, w, h);
      oc.setTransform(k, 0, 0, k, w / 2, h * 0.72);
      const a2 = Object.assign({}, anim, { alpha: 1 });
      drawCharacter(oc, 0, 0, look, equip, a2);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      ctx.scale(1 / k, 1 / k);
      ctx.drawImage(OFF, 0, 0, w, h, -w / 2, -h * 0.72, w, h);
      ctx.restore();
      return;
    }
  }
  look = look || HERO_LOOKS.luna;
  equip = equip || EMPTY;
  if (anim && typeof anim === 'object') { const d = DRAWN.get(anim); if (!d || d.look !== look || d.equip !== equip) DRAWN.set(anim, { look, equip }); }
  anim = anim || EMPTY;
  if ((look === HERO_LOOKS.luna || look === HERO_LOOKS.jin) && anim.state !== 'drive') LAST_EQUIP.set(look, equip);
  const facing = anim.facing < 0 ? -1 : 1;
  const s = anim.scale || 1;
  const dmg = clamp(anim.damage || 0, 0, 1);
  const t = anim.t || 0;
  const at = clamp(anim.attackT || 0, 0, 1);
  let state = anim.state || 'idle';
  const w = equip.weapon;
  const ws = w && w.style;
  const wk = !ws ? 'none' : (ws === 'pistol' || ws === 'smg') ? 'gun' : ws === 'staff' ? 'magic' : 'melee';
  if (state === 'attack' && wk === 'gun') state = 'shoot';
  if (state === 'shoot' && wk !== 'gun') state = 'attack';
  const P = makePose(state, t, at, wk, ws, anim);

  const K = {
    look, eq: equip, dmg, t, P, ws, wk, state, at,
    f: look.body === 'f',
    skin: look.skin || '#ffe0cc',
    hair: look.hairColor || '#5a3a2a',
    topS: equip.top ? equip.top.style : 'tshirt',
    topC: equip.top ? itemColors(equip.top) : ['#f6f4f8', look.body === 'f' ? '#ff5fa2' : '#19d3c5'],
    botS: equip.bottom ? equip.bottom.style : 'shorts',
    botC: equip.bottom ? itemColors(equip.bottom) : ['#4d6fb5', '#ffffff'],
  };
  K.defaultTop = !equip.top;
  K.sw = K.f ? 9.6 : 10.6; K.ww = K.f ? 7.9 : 9.0; K.hw = K.f ? 9.2 : 9.8;
  K.skinSh = shade(K.skin, -0.12);

  FL = !!anim.flash;
  ctx.save();
  ctx.translate(x, y);
  const auraT = anim.aura && state !== 'drive' && !P.lie ? clamp(anim.auraTier || 1, 1, 4) | 0 : 0;
  if (auraT) drawAuraBack(ctx, anim.aura, auraT, t, s);
  // 地面の影
  if (state !== 'drive' && !P.lie) {
    ctx.beginPath(); ctx.ellipse(0, 0, 13 * s, 3.2 * s, 0, 0, PI * 2);
    ctx.fillStyle = 'rgba(20,0,30,0.28)'; ctx.fill();
  }
  ctx.scale(facing * s, s);
  if (P.lie) {
    ctx.translate(34 * P.lie, -9 * P.lie);
    ctx.rotate(-PI / 2 * P.lie);
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  if (P.back) drawBackView(ctx, K);
  else drawFrontView(ctx, K);

  ctx.restore();
  if (auraT >= 2) { ctx.save(); ctx.translate(x, y); drawAuraFront(ctx, anim.aura, auraT, t, s); ctx.restore(); }
  FL = false;
}

// ---------------------------------------------------------------- オーラ（職の色。tier 1〜4 で段階的に）
function auraFlame(ctx, w, h, t, ph) {
  // 背後の炎状シルエット（下が広く、上で揺らぐ）
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = -w + u * w * 2;
    const yy = -h * (0.55 + 0.45 * Math.sin(u * PI)) - Math.sin(t * 9 + i * 1.7 + ph) * h * 0.08;
    const cx = x - w / n;
    ctx.quadraticCurveTo(cx, yy * 0.75, x, yy);
  }
  ctx.lineTo(w, 0);
  ctx.quadraticCurveTo(0, h * 0.12, -w, 0);
  ctx.closePath();
}
function drawAuraBack(ctx, col, tier, t, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.85 + Math.sin(t * 4) * 0.15;
  // 足元の光
  const R = (16 + tier * 4) * pulse;
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.6);
  g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.6, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.6, R * 0.45, 0, 0, PI * 2); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1.4;
  const rk = (t * 0.9) % 1;
  ctx.globalAlpha = 1 - rk;
  ctx.beginPath(); ctx.ellipse(0, 0, 10 + rk * 18, 3 + rk * 5, 0, 0, PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  if (tier >= 4) {
    // 回転する魔法陣
    ctx.save(); ctx.scale(1, 0.28); ctx.rotate(t * 0.9);
    ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 1.6 / 0.6;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 27, 0, PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * PI / 3; ctx.moveTo(Math.cos(a) * 27, Math.sin(a) * 27); ctx.lineTo(Math.cos(a + PI * 2 / 3) * 27, Math.sin(a + PI * 2 / 3) * 27); }
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.8);
    for (let i = 0; i < 12; i++) { const a = i * PI / 6; ctx.fillRect(Math.cos(a) * 30.5 - 1, Math.sin(a) * 30.5 - 1, 2, 2); }
    ctx.restore();
  }
  if (tier >= 3) {
    // 背後の炎オーラ
    ctx.fillStyle = rgba(col, 0.22 + (tier >= 4 ? 0.08 : 0));
    auraFlame(ctx, 24, 92 + tier * 4, t, 0); ctx.fill();
    ctx.fillStyle = rgba(col, 0.2);
    auraFlame(ctx, 16, 76, t * 1.3, 2); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.08);
    auraFlame(ctx, 10, 56, t * 1.6, 4); ctx.fill();
  }
  if (tier >= 2) {
    // 立ち上る光の粒（背面側）
    ctx.fillStyle = rgba(col, 0.9);
    const n = tier >= 4 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.7 + i / n) % 1;
      const x = Math.sin(i * 2.4 + t * 0.5) * (12 + (i % 3) * 4);
      const y = -ph * (60 + tier * 8);
      const r = (1.4 + (i % 2)) * Math.sin(ph * PI);
      ctx.beginPath(); ctx.arc(x, y, r + 0.3, 0, PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawAuraFront(ctx, col, tier, t, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'lighter';
  const n = tier >= 4 ? 5 : tier >= 3 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.55 + i / n + 0.13) % 1;
    const x = Math.cos(i * 2.1 + 1) * (14 + (i % 2) * 6);
    const y = -8 - ph * (64 + tier * 6);
    const a = Math.sin(ph * PI);
    ctx.fillStyle = rgba(i % 2 ? '#ffffff' : col, 0.85 * a);
    ctx.beginPath();
    const r = 2.6 + (tier >= 4 ? 1 : 0);
    ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 1.8, y); ctx.lineTo(x + r * 0.5, y + r * 0.5);
    ctx.lineTo(x, y + r * 1.8); ctx.lineTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x - r * 1.8, y); ctx.lineTo(x - r * 0.5, y - r * 0.5); ctx.closePath();
    ctx.fill();
  }
  if (tier >= 4) {
    // 縦の光線
    ctx.fillStyle = rgba(col, 0.12 + Math.sin(t * 6) * 0.04);
    ctx.fillRect(-20, -100, 3, 100); ctx.fillRect(17, -86, 2, 86); ctx.fillRect(-4, -110, 2, 110);
  }
  ctx.restore();
}

// 上半身フレームへ
function enterUpper(ctx, P) {
  ctx.save();
  ctx.translate(0, P.hipY + P.bob);
  ctx.rotate(P.tilt);
}
function enterHead(ctx, P) {
  ctx.save();
  ctx.translate(0, HEAD_Y);
  ctx.rotate(P.headTilt);
}

function drawFrontView(ctx, K) {
  const P = K.P, eq = K.eq;
  const sx = K.f ? 7.6 : 8.4;
  // ---- 背面レイヤー
  enterUpper(ctx, P);
  if (eq.accessory && eq.accessory.style === 'wings') drawWings(ctx, K);
  if (eq.accessory && eq.accessory.style === 'scarf') drawScarfTail(ctx, K);
  enterHead(ctx, P); drawHairBack(ctx, K); ctx.restore();
  if (K.topS === 'hoodie') drawHood(ctx, K);
  drawArm(ctx, K, false, -sx, SHOULDER_Y, P.ab[0], P.ab[1]);
  ctx.restore();
  // ---- 脚
  drawLeg(ctx, K, false, -3.9, P.hipY, P.lb[0], P.lb[1]);
  drawLeg(ctx, K, true, 3.9, P.hipY, P.lf[0], P.lf[1]);
  // ---- 腰・胴
  enterUpper(ctx, P);
  drawHips(ctx, K);
  if (K.botS === 'skirt') drawSkirt(ctx, K, K.botC, false);
  if (K.topS === 'idolDress') drawSkirt(ctx, K, K.topC, true);
  drawTorso(ctx, K);
  if (eq.accessory) {
    const st = eq.accessory.style;
    if (st === 'goldChain') drawChain(ctx, K);
    if (st === 'scarf') drawScarfFront(ctx, K);
  }
  // ---- 頭
  enterHead(ctx, P);
  drawHead(ctx, K);
  ctx.restore();
  // ---- 前腕＋武器
  drawArm(ctx, K, true, sx - 0.5, SHOULDER_Y + 0.5, P.af[0], P.af[1]);
  if (P.swoosh) drawSwoosh(ctx, K, sx - 0.5, SHOULDER_Y + 0.5);
  if (K.wk === 'magic' && !FL) drawHoloPanel(ctx, K);
  ctx.restore();
}

// ハッカーのホロ画面（詠唱中は大きく展開、待機中は手首の小さなリング）
function drawHoloPanel(ctx, K) {
  const st = K.state, t = K.t;
  const col = (K.eq.weapon && itemColors(K.eq.weapon)[0]) || '#3dff8a';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (st === 'attack') {
    const k = clamp((K.at || 0.4) * 3.5, 0, 1);
    ctx.translate(20, -34);
    ctx.transform(1, -0.12, 0, 1, 0, 0);
    const w = 22 * k, h = 15 * k;
    ctx.fillStyle = rgba(col, 0.18); ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = rgba('#ffffff', 0.75);
    for (let i = 0; i < 4; i++) { const lw = (6 + ((i * 7 + ((t * 20) | 0)) % 9)) * k; ctx.fillRect(-w / 2 + 2, -h / 2 + 2.5 + i * 3.2 * k, lw, 1.1); }
    ctx.fillStyle = rgba(col, 0.9); ctx.fillRect(w / 2 - 6 * k, h / 2 - 5 * k, 4 * k, 3 * k);
  } else {
    ctx.translate(14, -10);
    ctx.strokeStyle = rgba(col, 0.55 + Math.sin(t * 5) * 0.2); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 1.6, 0.4, 0, PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawBackView(ctx, K) {
  const P = K.P, eq = K.eq;
  const sx = K.f ? 7.6 : 8.4;
  drawLeg(ctx, K, false, -3.9, P.hipY, P.lb[0], P.lb[1]);
  drawLeg(ctx, K, true, 3.9, P.hipY, P.lf[0], P.lf[1]);
  enterUpper(ctx, P);
  drawHips(ctx, K);
  if (K.botS === 'skirt') drawSkirt(ctx, K, K.botC, false);
  if (K.topS === 'idolDress') drawSkirt(ctx, K, K.topC, true);
  drawTorso(ctx, K, true);
  if (K.topS === 'hoodie') drawHood(ctx, K, true);
  if (eq.accessory && eq.accessory.style === 'wings') drawWings(ctx, K, true);
  enterHead(ctx, P);
  // 頭（後ろ姿）
  ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 15.5, 0, 0, PI * 2);
  fillStroke(ctx, K.skin);
  drawHairBack(ctx, K, true);
  drawHat(ctx, K, true);
  ctx.restore();
  drawArm(ctx, K, false, -sx, SHOULDER_Y, P.ab[0], P.ab[1]);
  drawArm(ctx, K, true, sx, SHOULDER_Y, P.af[0], P.af[1]);
  ctx.restore();
}

// ---------------------------------------------------------------- 脚
function drawLeg(ctx, K, front, hx, hy, a, k) {
  const e = -k; // 膝は後ろへ曲がる
  const L = THIGH + SHIN;
  const skin = front ? K.skin : K.skinSh;
  const dark = front ? 0 : -0.12;
  strokeLimb(ctx, hx, hy, a, e, THIGH, SHIN, 0, L, LEG_W - 0.6, skin);
  const bs = K.botS;
  const [bc, ba] = K.botC;
  const dmg = K.dmg;
  // スパッツ（スカート時は常に、その他はインナー）
  if (bs === 'skirt' || K.topS === 'idolDress') {
    strokeLimb(ctx, hx, hy, a, e, THIGH, SHIN, 0, THIGH * 0.7, LEG_W, shade(INNER_BOT, dark));
  }
  if (LONG_PANTS[bs]) {
    const wide = bs === 'cargo' ? 1.4 : bs === 'suitPants' ? -0.3 : bs === 'armorPants' ? 1 : 0.4;
    const col = shade(bc, dark);
    let end = L - 0.5;
    const torn = dmg >= 0.5;
    if (torn) end = L - 3.5;
    strokeLimb(ctx, hx, hy, a, e, THIGH, SHIN, 0, end, LEG_W + wide, col, torn ? 'butt' : 'round');
    if (torn) { limbAt(hx, hy, a, e, THIGH, SHIN, end); jagEnd(ctx, PT.x, PT.y, PT.a, LEG_W + wide, col); }
    // ディテール
    ctx.lineWidth = 1;
    if (bs === 'trackPants') {
      ctx.strokeStyle = C(ba); ctx.lineWidth = 1.4; ctx.beginPath();
      limbAt(hx + 2, hy, a, e, THIGH, SHIN, 1); ctx.moveTo(PT.x, PT.y);
      limbPts(hx + 2, hy, a, e, THIGH, SHIN); ctx.lineTo(LP.kx, LP.ky);
      limbAt(hx + 2, hy, a, e, THIGH, SHIN, end - 1); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    } else if (bs === 'cargo') {
      limbAt(hx, hy, a, e, THIGH, SHIN, THIGH * 0.65);
      ctx.save(); ctx.translate(PT.x + 1.2, PT.y); ctx.rotate(-PT.a);
      ctx.beginPath(); ctx.rect(-2.2, -2, 4.4, 4.2); fillStroke(ctx, shade(bc, -0.15 + dark), 1);
      ctx.restore();
    } else if (bs === 'armorPants') {
      limbPts(hx, hy, a, e, THIGH, SHIN);
      ctx.beginPath(); ctx.ellipse(LP.kx + 0.8, LP.ky, 3.6, 3.2, 0, 0, PI * 2); fillStroke(ctx, shade(ba, dark), 1.2);
    } else if (bs === 'jeans') {
      ctx.strokeStyle = C(rgba(ba, 0.6)); ctx.lineWidth = 0.8; ctx.beginPath();
      limbAt(hx - 1.6, hy, a, e, THIGH, SHIN, 2); ctx.moveTo(PT.x, PT.y);
      limbAt(hx - 1.6, hy, a, e, THIGH, SHIN, end - 1); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    } else if (bs === 'suitPants') {
      ctx.strokeStyle = C(shade(bc, 0.25)); ctx.lineWidth = 0.7; ctx.beginPath();
      limbAt(hx + 0.8, hy, a, e, THIGH, SHIN, 2); ctx.moveTo(PT.x, PT.y);
      limbAt(hx + 0.8, hy, a, e, THIGH, SHIN, end - 1); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    }
    // 破れ: 膝の穴→スパッツが見える
    if (dmg >= 0.25) {
      limbPts(hx, hy, a, e, THIGH, SHIN);
      ctx.fillStyle = C('rgba(60,40,50,0.25)');
      ctx.beginPath(); ctx.ellipse(LP.kx + 0.5, LP.ky + 2.5, 2.4, 1.6, 0, 0, PI * 2); ctx.fill();
    }
    if (dmg >= (front ? 0.5 : 0.75)) {
      limbPts(hx, hy, a, e, THIGH, SHIN);
      ctx.save(); ctx.translate(LP.kx + 0.3, LP.ky - 0.4);
      ctx.beginPath(); polyPath(ctx, TOP_HOLES[front ? 0 : 1].p.map((v, i) => (i % 2 ? (v + (front ? 11 : 4)) * 0.85 : (v + (front ? 4 : -5)) * 0.85)));
      fillStroke(ctx, INNER_BOT, 1);
      ctx.restore();
    }
  } else if (bs === 'shorts') {
    const col = shade(bc, dark);
    const torn = dmg >= 0.5;
    const end = torn ? THIGH * 0.9 : THIGH * 1.05;
    strokeLimb(ctx, hx, hy, a, e, THIGH, SHIN, 0, end, LEG_W + 1.2, col, torn ? 'butt' : 'round');
    if (torn) { limbAt(hx, hy, a, e, THIGH, SHIN, end); jagEnd(ctx, PT.x, PT.y, PT.a, LEG_W + 1.2, col, 1.8); }
    if (K.eq.bottom && K.eq.bottom.accent && !torn) {
      limbAt(hx, hy, a, e, THIGH, SHIN, end - 0.6);
      ctx.save(); ctx.translate(PT.x, PT.y); ctx.rotate(-PT.a);
      ctx.fillStyle = C(ba); ctx.fillRect(-(LEG_W + 1.2) / 2, -1.2, LEG_W + 1.2, 1.2); ctx.restore();
    }
  }
  // 絆創膏（膝）
  if (dmg >= 0.9 && front && !LONG_PANTS[bs]) {
    limbPts(hx, hy, a, e, THIGH, SHIN);
    bandaid(ctx, LP.kx + 0.5, LP.ky + 1.5, 0.5);
  }
  // 靴
  limbPts(hx, hy, a, e, THIGH, SHIN);
  drawShoe(ctx, K, LP.ex, LP.ey, a + e, front);
}

function drawShoe(ctx, K, x, y, ang, front) {
  const sh = K.eq.shoes;
  const st = sh ? sh.style : null;
  const [c, ac] = sh ? itemColors(sh) : ['#5b5266', '#8a7f99'];
  const dk = front ? 0 : -0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-ang * 0.85);
  const col = shade(c, dk), acc = shade(ac, dk);
  ctx.beginPath();
  switch (st) {
    case 'boots':
      ctx.moveTo(-3.4, -7); ctx.lineTo(2.6, -7); ctx.lineTo(3, -1.6);
      ctx.quadraticCurveTo(7, -1.2, 7, 1.4); ctx.lineTo(7, 2.8); ctx.lineTo(-3.8, 2.8); ctx.closePath();
      fillStroke(ctx, col, 1.6);
      ctx.fillStyle = C(acc); ctx.fillRect(-3.6, 1.2, 10.4, 1.6);
      ctx.fillRect(-3.2, -5.5, 6, 1.3);
      break;
    case 'sandals':
      ctx.moveTo(-3, -1.5); ctx.quadraticCurveTo(-3, -3, 0, -2.6); ctx.quadraticCurveTo(5.5, -1.6, 6.2, 1); ctx.lineTo(-3, 1.6); ctx.closePath();
      fillStroke(ctx, front ? K.skin : K.skinSh, 1.4);
      ctx.beginPath(); rrect(ctx, -3.6, 1.2, 10.4, 1.8, 0.9); fillStroke(ctx, col, 1.2);
      ctx.strokeStyle = C(acc); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(1, -2.4); ctx.lineTo(3.4, 1.2); ctx.moveTo(1, -2.4); ctx.lineTo(-0.5, 1.2); ctx.stroke();
      break;
    case 'loafers':
      ctx.moveTo(-3.2, -2.2); ctx.quadraticCurveTo(2, -3.4, 4, -1.2); ctx.quadraticCurveTo(7.4, -0.2, 7.2, 2.2);
      ctx.lineTo(-3.4, 2.4); ctx.closePath(); fillStroke(ctx, col, 1.6);
      ctx.fillStyle = C(acc); ctx.fillRect(0.6, -1.9, 3, 1);
      ctx.strokeStyle = C(shade(col, 0.35)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.5, -1.6); ctx.quadraticCurveTo(2, -2.5, 4.5, -0.6); ctx.stroke();
      break;
    case 'heels':
      ctx.moveTo(-3, -2.4); ctx.quadraticCurveTo(1, -2.8, 3.6, -0.6); ctx.quadraticCurveTo(6.6, 0.8, 6.6, 2.6); ctx.lineTo(1.5, 2.6);
      ctx.quadraticCurveTo(0, 0.8, -1.8, 0.8); ctx.lineTo(-2.2, 2.8); ctx.lineTo(-3.4, 2.8); ctx.closePath(); fillStroke(ctx, col, 1.5);
      ctx.fillStyle = C(acc); ctx.beginPath(); ctx.arc(2.2, -1.2, 1, 0, PI * 2); ctx.fill();
      break;
    default: // sneakers / 素
      ctx.moveTo(-3.4, -2.6); ctx.quadraticCurveTo(0, -3.6, 2.6, -2.2); ctx.quadraticCurveTo(7.2, -1, 7, 1.6);
      ctx.lineTo(7, 2.8); ctx.lineTo(-3.8, 2.8); ctx.closePath(); fillStroke(ctx, col, 1.6);
      ctx.beginPath(); ctx.moveTo(-3.8, 1.1); ctx.lineTo(7, 1.1); ctx.lineTo(7, 2.8); ctx.lineTo(-3.8, 2.8); ctx.closePath();
      ctx.fillStyle = C(st === 'sneakers' ? (c === '#ffffff' || c === '#f4f4f4' ? acc : '#ffffff') : shade(col, -0.3)); ctx.fill();
      if (st === 'sneakers') {
        ctx.strokeStyle = C(acc); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-1.8, -0.4); ctx.quadraticCurveTo(2, 0.6, 5, -0.8); ctx.stroke();
        ctx.fillStyle = C('#ffffff'); ctx.fillRect(0.4, -2.6, 1, 1); ctx.fillRect(2.2, -2.1, 1, 1);
      }
      ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3.8, 1.1); ctx.lineTo(7, 1.1); ctx.stroke();
  }
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- 腰（パンツの腰部分）
function drawHips(ctx, K) {
  const bs = K.botS, [bc] = K.botC;
  const hw = K.hw - 0.4;
  ctx.beginPath(); rrect(ctx, -hw, -5, hw * 2, 9.5, 3);
  if (bs === 'skirt' || K.topS === 'idolDress') fillStroke(ctx, INNER_BOT);
  else {
    fillStroke(ctx, bc);
    if (bs === 'jeans' || bs === 'cargo') {
      ctx.strokeStyle = C(shade(bc, -0.3)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0.5, -1); ctx.lineTo(0.5, 4); ctx.stroke();
    }
  }
}

function drawSkirt(ctx, K, cols, dress) {
  const [c, a] = cols;
  const sway = K.state === 'walk' ? Math.sin(K.t * 10) * 1.2 : K.state === 'jump' ? -1.5 : 0;
  const top = dress ? -6 : -4;
  const bot = dress ? 10 : 9;
  const torn = K.dmg >= 0.5;
  const hb = bot - (torn ? 1.6 : 0);
  ctx.beginPath();
  ctx.moveTo(-8.6, top);
  ctx.lineTo(8.6, top);
  ctx.quadraticCurveTo(12, top + 6, 13.5 + sway * 0.3, hb);
  if (torn) {
    const n = 8;
    for (let i = 1; i <= n; i++) {
      const x = lerp(13.5 + sway * 0.3, -13.5 + sway * 0.3, i / n);
      ctx.lineTo(x, hb + (i % 2 ? 2.6 : -0.6) + ((i * 7) % 3) * 0.4);
    }
  } else {
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const x0 = lerp(13.5 + sway * 0.3, -13.5 + sway * 0.3, (i - 0.5) / n);
      const x1 = lerp(13.5 + sway * 0.3, -13.5 + sway * 0.3, i / n);
      ctx.quadraticCurveTo(x0, hb + 2.2, x1, hb);
    }
  }
  ctx.quadraticCurveTo(-12, top + 6, -8.6, top);
  ctx.closePath();
  fillStroke(ctx, c);
  // プリーツ / フリル
  ctx.strokeStyle = C(shade(c, -0.22)); ctx.lineWidth = 0.9; ctx.beginPath();
  for (const px of [-5, 0, 5]) { ctx.moveTo(px * 0.6, top + 2); ctx.lineTo(px * 1.3 + sway * 0.3, hb); }
  ctx.stroke();
  if (dress || a) {
    ctx.strokeStyle = C(a); ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(-12.6 + sway * 0.3, hb - 1.2); ctx.lineTo(12.6 + sway * 0.3, hb - 1.2); ctx.stroke();
  }
  if (K.dmg >= 0.75) {
    ctx.save(); ctx.translate(-4, top + 8);
    ctx.beginPath(); polyPath(ctx, TOP_HOLES[2].p.map((v, i) => (i % 2 ? v + 2 : v + 5.5) * 0.8)); fillStroke(ctx, INNER_BOT, 1);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 胴
function torsoPath(ctx, K, bot, jag) {
  const sw = K.sw, ww = K.ww, hw = K.hw, top = -20;
  ctx.beginPath();
  ctx.moveTo(-sw + 2.5, top);
  ctx.quadraticCurveTo(-sw, top, -sw, top + 3.5);
  ctx.lineTo(-ww, top + 11);
  ctx.lineTo(-hw, bot);
  hem(ctx, -hw, hw, bot, jag);
  ctx.lineTo(ww, top + 11);
  ctx.lineTo(sw, top + 3.5);
  ctx.quadraticCurveTo(sw, top, sw - 2.5, top);
  ctx.closePath();
}
function tankPath(ctx, K, bot, jag) {
  const sw = K.sw, ww = K.ww, hw = K.hw, top = -20;
  ctx.beginPath();
  ctx.moveTo(-sw + 3.6, top);
  ctx.lineTo(-sw + 6.2, top);
  ctx.quadraticCurveTo(0, top + 7, sw - 6.2, top);
  ctx.lineTo(sw - 3.6, top);
  ctx.quadraticCurveTo(sw - 2.6, top + 6, ww, top + 10);
  ctx.lineTo(hw, bot);
  hem(ctx, hw, -hw, bot, jag);
  ctx.lineTo(-ww, top + 10);
  ctx.quadraticCurveTo(-sw + 2.6, top + 6, -sw + 3.6, top);
  ctx.closePath();
}
function hem(ctx, x0, x1, y, jag) {
  if (!jag) { ctx.lineTo(x1, y); return; }
  const n = 7;
  for (let i = 1; i <= n; i++) {
    const x = lerp(x0, x1, i / n);
    ctx.lineTo(x - (x1 - x0) / n / 2, y + 2.4 + ((i * 5) % 3) * 0.5);
    ctx.lineTo(x, y - 0.3);
  }
}

function drawTorso(ctx, K, back) {
  const st = K.topS, [c, a] = K.topC;
  const dmg = K.dmg;
  const info = TOPS[st] || TOPS.tshirt;
  const bot = 1 + info.len;
  const jag = dmg >= 0.5;
  // 肌（肩・首）
  torsoPath(ctx, K, -2, false); fillStroke(ctx, K.skin);
  // インナー（タンクトップ）
  tankPath(ctx, K, 0.5, false); fillStroke(ctx, INNER_TOP);
  // アーマーベストの下は暗いTシャツ
  if (st === 'armorVest') { torsoPath(ctx, K, 1, jag); fillStroke(ctx, '#2b2b33'); }
  // 本体
  if (st === 'tank') tankPath(ctx, K, bot, jag);
  else if (st === 'armorVest') { ctx.beginPath(); vestPath(ctx, K, bot); }
  else torsoPath(ctx, K, bot, jag);
  fillStroke(ctx, c);
  // セル影（右下）
  ctx.save(); ctx.clip();
  ctx.fillStyle = C(rgba('#2a1430', 0.12));
  ctx.beginPath(); ctx.moveTo(K.sw * 0.3, -21); ctx.lineTo(K.sw + 2, -21); ctx.lineTo(K.hw + 2, bot + 3); ctx.lineTo(K.hw * 0.1, bot + 3); ctx.closePath(); ctx.fill();
  if (!back) topDetails(ctx, K, st, c, a, bot);
  else if (st === 'police' || st === 'tracksuit' || st === 'leatherJacket') {
    ctx.fillStyle = C(shade(c, 0.18)); ctx.fillRect(-K.sw, -20, K.sw * 2, 2.5);
  }
  // ---- 破れ
  if (dmg >= 0.25) {
    ctx.strokeStyle = C('rgba(40,20,40,0.45)'); ctx.lineWidth = 0.9; ctx.beginPath();
    for (const s of SCRATCHES) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
    ctx.stroke();
    ctx.fillStyle = C('rgba(70,50,50,0.22)');
    ctx.beginPath(); ctx.ellipse(-3, -6, 3, 2, 0.3, 0, PI * 2); ctx.fill();
  }
  for (const h of TOP_HOLES) {
    if (dmg >= h.th) { ctx.beginPath(); polyPath(ctx, h.p); fillStroke(ctx, INNER_TOP, 1.1); }
  }
  if (dmg >= 0.75) {
    ctx.beginPath(); polyPath(ctx, BIG_RIP); fillStroke(ctx, INNER_TOP, 1.2);
    // 裂け目のほつれ
    ctx.strokeStyle = C(shade(c, 0.3)); ctx.lineWidth = 0.7; ctx.beginPath();
    ctx.moveTo(-5, -16); ctx.lineTo(-5.6, -18); ctx.moveTo(2, -12.5); ctx.lineTo(2.6, -14.5); ctx.stroke();
  }
  if (dmg >= 0.6) {
    ctx.fillStyle = C(dmg >= 0.9 ? 'rgba(40,30,40,0.42)' : 'rgba(40,30,40,0.22)');
    for (const s of SOOT) { ctx.beginPath(); ctx.ellipse(s[0], s[1], s[2], s[3], 0.4, 0, PI * 2); ctx.fill(); }
  }
  ctx.restore();
  // 再アウトライン
  ctx.strokeStyle = OC(); ctx.lineWidth = OLW;
  if (st === 'tank') tankPath(ctx, K, bot, jag); else if (st === 'armorVest') { ctx.beginPath(); vestPath(ctx, K, bot); } else torsoPath(ctx, K, bot, jag);
  ctx.stroke();
  if (st === 'police' && !back) {
    // ベルト
    ctx.beginPath(); rrect(ctx, -K.hw - 0.3, bot - 2.6, K.hw * 2 + 0.6, 3, 1); fillStroke(ctx, '#1b1b22', 1.2);
    ctx.beginPath(); ctx.rect(-0.6, bot - 2.4, 3.2, 2.6); fillStroke(ctx, a, 0.8);
  }
}

function vestPath(ctx, K, bot) {
  const sw = K.sw + 0.6, hw = K.hw + 0.8;
  ctx.moveTo(-sw + 2, -20.5); ctx.lineTo(-sw + 5.5, -20.5); ctx.lineTo(-2, -16); ctx.lineTo(3, -16);
  ctx.lineTo(sw - 5.5, -20.5); ctx.lineTo(sw - 2, -20.5); ctx.quadraticCurveTo(sw + 0.5, -18, sw, -12);
  ctx.lineTo(hw, bot); ctx.lineTo(-hw, bot); ctx.lineTo(-sw, -12); ctx.quadraticCurveTo(-sw - 0.5, -18, -sw + 2, -20.5);
  ctx.closePath();
}

function topDetails(ctx, K, st, c, a, bot) {
  const dk = shade(c, -0.28);
  ctx.lineWidth = 1;
  switch (st) {
    case 'tshirt': {
      ctx.strokeStyle = C(dk); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0.8, -20.5, 4, 0.2, PI - 0.2); ctx.stroke();
      // プリント（ハート/星）
      if (!K.defaultTop || true) {
        ctx.fillStyle = C(a);
        ctx.beginPath();
        const hx = 1.5, hy = -10;
        ctx.moveTo(hx, hy + 3); ctx.bezierCurveTo(hx - 5, hy - 0.5, hx - 2.4, hy - 4.5, hx, hy - 1.6);
        ctx.bezierCurveTo(hx + 2.4, hy - 4.5, hx + 5, hy - 0.5, hx, hy + 3); ctx.fill();
      }
      break;
    }
    case 'hoodie': {
      ctx.beginPath(); ctx.moveTo(-5.5, -6); ctx.lineTo(6.5, -6); ctx.lineTo(7.5, bot - 2); ctx.lineTo(-6.5, bot - 2); ctx.closePath();
      ctx.fillStyle = C(shade(c, -0.1)); ctx.fill(); ctx.strokeStyle = C(dk); ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(-1.5, -19); ctx.lineTo(-2, -12.5); ctx.moveTo(3, -19); ctx.lineTo(3.4, -13); ctx.stroke();
      ctx.fillStyle = C(a); ctx.beginPath(); ctx.arc(-2, -12.2, 0.9, 0, PI * 2); ctx.arc(3.4, -12.7, 0.9, 0, PI * 2); ctx.fill();
      break;
    }
    case 'leatherJacket': {
      ctx.beginPath(); ctx.moveTo(-2.5, -20); ctx.lineTo(4, -20); ctx.lineTo(3.6, bot); ctx.lineTo(-1.8, bot); ctx.closePath();
      ctx.fillStyle = C(K.f ? '#ffffff' : '#5a2d82'); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2.5, -20); ctx.lineTo(-7, -11); ctx.lineTo(-1.6, -13); ctx.closePath();
      ctx.moveTo(4, -20); ctx.lineTo(8.6, -11); ctx.lineTo(3.4, -13); ctx.closePath();
      ctx.fillStyle = C(shade(c, 0.15)); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.setLineDash([1.2, 1.2]);
      ctx.beginPath(); ctx.moveTo(-1.8, -12); ctx.lineTo(-1.6, bot); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C('rgba(255,255,255,0.35)'); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-8, -15); ctx.quadraticCurveTo(-7.5, -9, -8, -3); ctx.stroke();
      break;
    }
    case 'suit': {
      ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(4.4, -20); ctx.lineTo(0.7, -8); ctx.closePath();
      ctx.fillStyle = C('#f4f2f6'); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(1.6, -19); ctx.lineTo(2.3, -11); ctx.lineTo(0.8, -9); ctx.lineTo(-0.6, -11); ctx.closePath();
      ctx.fillStyle = C(a); ctx.fill();
      ctx.strokeStyle = C(shade(c, c === '#15151b' ? 0.35 : -0.35)); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(-5.5, -12); ctx.lineTo(0.7, -8); ctx.lineTo(6.4, -12); ctx.lineTo(4.4, -20); ctx.stroke();
      ctx.fillStyle = C(shade(c, -0.4)); ctx.beginPath(); ctx.arc(0.8, -5, 0.8, 0, PI * 2); ctx.arc(0.8, -2, 0.8, 0, PI * 2); ctx.fill();
      ctx.fillStyle = C(a); ctx.fillRect(-7, -14, 3, 1.2);
      break;
    }
    case 'hawaiian': {
      ctx.beginPath(); ctx.moveTo(-1.5, -20); ctx.lineTo(3.5, -20); ctx.lineTo(1, -14); ctx.closePath(); ctx.fillStyle = C(K.skin); ctx.fill();
      const fl = [[-5, -14], [4.5, -11], [-2, -5], [6, -3], [-7, -2.5], [1, -17]];
      for (let i = 0; i < fl.length; i++) {
        const [fx, fy] = fl[i];
        ctx.fillStyle = C(shade(a, -0.15)); ctx.beginPath(); ctx.ellipse(fx + 2, fy + 1.2, 2, 0.9, 0.6, 0, PI * 2); ctx.fill();
        ctx.fillStyle = C(i % 2 ? '#ffffff' : a);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const an = k * 1.2566; ctx.moveTo(fx, fy); ctx.arc(fx + Math.cos(an) * 1.2, fy + Math.sin(an) * 1.2, 1, 0, PI * 2); }
        ctx.fill();
        ctx.fillStyle = C('#ffe066'); ctx.beginPath(); ctx.arc(fx, fy, 0.6, 0, PI * 2); ctx.fill();
      }
      ctx.strokeStyle = C(dk); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(1, -14); ctx.lineTo(1.2, bot); ctx.stroke();
      break;
    }
    case 'tank': {
      ctx.fillStyle = C(a); ctx.fillRect(-K.hw, -8, K.hw * 2, 1.6);
      break;
    }
    case 'police': {
      ctx.strokeStyle = C(shade(c, -0.4)); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(1, -19); ctx.lineTo(1, bot - 2); ctx.moveTo(3, -14); ctx.lineTo(7.4, -14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2.8, -20); ctx.lineTo(1, -16.5); ctx.lineTo(4.8, -20); ctx.closePath();
      ctx.fillStyle = C(shade(c, 0.2)); ctx.fill(); ctx.stroke();
      // バッジ
      ctx.beginPath(); ctx.moveTo(-4.6, -15.5); ctx.lineTo(-2.2, -14.6); ctx.lineTo(-2.4, -11.5); ctx.lineTo(-4.6, -10.2); ctx.lineTo(-6.8, -11.5); ctx.lineTo(-7, -14.6); ctx.closePath();
      fillStroke(ctx, a, 0.8);
      break;
    }
    case 'tracksuit': {
      ctx.strokeStyle = C(a); ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(-K.sw + 1.2, -16); ctx.lineTo(-K.hw + 1, bot); ctx.moveTo(K.sw - 1.2, -16); ctx.lineTo(K.hw - 1, bot); ctx.stroke();
      ctx.strokeStyle = C(shade(c, -0.35)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, -19); ctx.lineTo(1, bot); ctx.stroke();
      ctx.fillStyle = C(shade(c, 0.2)); ctx.fillRect(-3.5, -21, 9, 2.6);
      ctx.fillStyle = C('#d8dde8'); ctx.fillRect(0.4, -16, 1.4, 2.4);
      break;
    }
    case 'idolDress': {
      ctx.fillStyle = C(shade(c, 0.35)); ctx.beginPath(); ctx.moveTo(-K.hw, -7.5); for (let i = 0; i <= 6; i++) ctx.arc(-K.hw + 1.5 + i * (K.hw * 2 - 3) / 6, -7, 1.6, PI, 0); ctx.lineTo(K.hw, -5.5); ctx.lineTo(-K.hw, -5.5); ctx.fill();
      // リボン
      ctx.save(); ctx.translate(1, -16.5);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4.5, -2.6); ctx.lineTo(-4.5, 2.6); ctx.closePath();
      ctx.moveTo(0, 0); ctx.lineTo(4.5, -2.6); ctx.lineTo(4.5, 2.6); ctx.closePath(); fillStroke(ctx, a, 1);
      ctx.beginPath(); ctx.moveTo(-0.6, 0.8); ctx.lineTo(-2.2, 5); ctx.moveTo(0.6, 0.8); ctx.lineTo(2.2, 5); ctx.strokeStyle = C(a); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, PI * 2); fillStroke(ctx, shade(a, 0.3), 0.8);
      ctx.restore();
      ctx.fillStyle = C('rgba(255,255,255,0.8)'); ctx.beginPath(); ctx.arc(-5, -12, 0.7, 0, PI * 2); ctx.arc(5.5, -10, 0.6, 0, PI * 2); ctx.fill();
      break;
    }
    case 'armorVest': {
      ctx.strokeStyle = C(shade(c, -0.35)); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(-7, -14, 6, 7); ctx.rect(1.5, -14, 6.2, 7); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); rrect(ctx, -8 + i * 5.6, bot - 5, 4.6, 4.2, 0.8); fillStroke(ctx, a, 0.9); }
      ctx.fillStyle = C(shade(c, 0.2)); ctx.fillRect(-K.sw + 2, -20.5, 3.5, 1.5); ctx.fillRect(K.sw - 5.5, -20.5, 3.5, 1.5);
      break;
    }
  }
}

function drawHood(ctx, K, back) {
  const [c, a] = K.topC;
  ctx.beginPath();
  if (back) { ctx.ellipse(0, -18, 9, 4.5, 0, 0, PI * 2); }
  else ctx.ellipse(-4.5, -19.5, 8.5, 4.5, -0.15, 0, PI * 2);
  fillStroke(ctx, shade(c, -0.12));
  if (back) { ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -18); ctx.quadraticCurveTo(0, -15.5, 6, -18); ctx.stroke(); }
}

// ---------------------------------------------------------------- 腕
function drawArm(ctx, K, front, sx, sy, a, e) {
  const L = UPPER + FORE;
  const skin = front ? K.skin : K.skinSh;
  const dk = front ? 0 : -0.12;
  const st = K.topS, [c, ac] = K.topC;
  const dmg = K.dmg;
  let sl = (TOPS[st] || TOPS.tshirt).sl;
  let slCol = st === 'armorVest' ? '#2b2b33' : c;
  // 武器（腕の前に描く＝手で握る）は前腕のみ
  strokeLimb(ctx, sx, sy, a, e, UPPER, FORE, 0, L, ARM_W - 0.8, skin);
  const lost = front && dmg >= 0.75 && sl !== 'none';
  if (lost) {
    // 片袖が取れ、肩口にギザギザが残る
    limbAt(sx, sy, a, e, UPPER, FORE, 1.2);
    jagEnd(ctx, sx, sy, a, ARM_W + 1.2, shade(slCol, dk), 2.6);
  } else if (sl === 'long' || sl === 'short') {
    let end = sl === 'long' ? L - 1.4 : UPPER * 0.68;
    const torn = dmg >= 0.5;
    if (torn && sl === 'long') end = UPPER + FORE * 0.35;
    if (torn && sl === 'short') end = UPPER * 0.5;
    const col = shade(slCol, dk);
    strokeLimb(ctx, sx, sy, a, e, UPPER, FORE, 0, end, ARM_W + 0.8, col, torn ? 'butt' : 'round');
    if (torn) { limbAt(sx, sy, a, e, UPPER, FORE, end); jagEnd(ctx, PT.x, PT.y, PT.a, ARM_W + 0.8, col, 2); }
    if (st === 'tracksuit' && !torn) {
      ctx.strokeStyle = C(shade(ac, dk)); ctx.lineWidth = 1.3; ctx.beginPath();
      limbAt(sx, sy, a, e, UPPER, FORE, 0.5); ctx.moveTo(PT.x, PT.y);
      limbPts(sx, sy, a, e, UPPER, FORE); ctx.lineTo(LP.kx, LP.ky);
      limbAt(sx, sy, a, e, UPPER, FORE, end - 0.5); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    }
    if (st === 'police' && !torn) {
      limbAt(sx, sy, a, e, UPPER, FORE, 2.6);
      ctx.fillStyle = C(shade(ac, dk)); ctx.beginPath(); ctx.arc(PT.x, PT.y, 1.5, 0, PI * 2); ctx.fill();
    }
  } else if (sl === 'puff') {
    limbAt(sx, sy, a, e, UPPER, FORE, 2);
    ctx.beginPath(); ctx.arc(PT.x, PT.y, 4.4, 0, PI * 2); fillStroke(ctx, shade(slCol, dk), 1.6);
    ctx.fillStyle = C(shade(ac, dk)); ctx.beginPath(); ctx.arc(PT.x, PT.y + 3.2, 1.2, 0, PI * 2); ctx.fill();
  }
  limbPts(sx, sy, a, e, UPPER, FORE);
  if (front && dmg >= 0.9) { limbAt(sx, sy, a, e, UPPER, FORE, UPPER + 3.5); bandaid(ctx, PT.x, PT.y, PT.a + 0.3); }
  if (front && dmg >= 0.6 && lost) {
    ctx.fillStyle = C('rgba(50,35,45,0.3)'); limbAt(sx, sy, a, e, UPPER, FORE, 4);
    ctx.beginPath(); ctx.ellipse(PT.x, PT.y, 1.8, 1.2, 0, 0, PI * 2); ctx.fill();
  }
  limbPts(sx, sy, a, e, UPPER, FORE);
  const hx = LP.ex, hy = LP.ey;
  if (front && K.P.showWeapon && K.eq.weapon) {
    const fore = PI / 2 - (a + e);
    const ang = K.wk === 'gun' ? fore : K.P.wAng != null ? K.P.wAng : fore;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
    drawWeapon(ctx, K.ws, K.eq.weapon.color, K.eq.weapon.accent, K.t, K.P);
    ctx.restore();
  }
  // 手
  ctx.beginPath(); ctx.arc(hx, hy, front && K.P.punch ? 3.6 : 3, 0, PI * 2); fillStroke(ctx, skin, 1.6);
  if (front && K.P.punch) {
    ctx.strokeStyle = C('#ffffff'); ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < 3; i++) { const an = -0.6 + i * 0.6; ctx.moveTo(hx + Math.cos(an) * 6, hy + Math.sin(an) * 6); ctx.lineTo(hx + Math.cos(an) * 10, hy + Math.sin(an) * 10); }
    ctx.stroke();
  }
  if (!front && K.ws === 'smg' && K.state === 'shoot') { /* 両手持ち: 後ろ手は銃のフォアグリップ位置 */ }
}

function drawSwoosh(ctx, K, sx, sy) {
  const sw = K.P.swoosh;
  const len = WEAPON_LEN[K.ws] || 20;
  const r = Math.max(28, UPPER + FORE + len * 0.85);
  const col = K.eq.weapon ? itemColors(K.eq.weapon)[K.ws === 'neonSword' ? 0 : 1] : '#ffffff';
  ctx.save();
  ctx.globalAlpha *= clamp(sw.alpha, 0, 1) * 0.85;
  ctx.globalCompositeOperation = 'lighter';
  const from = Math.max(sw.from, -1.0);
  if (sw.to <= from + 0.05) { ctx.restore(); return; }
  const span = sw.to - from;
  ctx.beginPath();
  ctx.arc(sx, sy, r, from, sw.to);
  ctx.arc(sx, sy, r - 9, sw.to, from + span * 0.25, true);
  ctx.closePath();
  ctx.fillStyle = FL ? '#ffffff' : rgba(col === '#ffffff' ? '#ffe7f5' : col, 0.55);
  ctx.fill();
  ctx.beginPath(); ctx.arc(sx, sy, r - 1.5, from + span * 0.2, sw.to);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 武器（原点=握り、+x=刃の向き）
export function drawWeapon(ctx, style, color, accent, t = 0, P = null) {
  const d = DEF_COL[style] || ['#ccc', '#fff'];
  const c = color || d[0], a = accent || d[1];
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (style) {
    case 'bat': {
      ctx.beginPath(); ctx.moveTo(-4, -1.2); ctx.lineTo(6, -1.6); ctx.quadraticCurveTo(20, -3.6, 27, -3.4);
      ctx.quadraticCurveTo(29.5, 0, 27, 3.4); ctx.quadraticCurveTo(20, 3.6, 6, 1.6); ctx.lineTo(-4, 1.2); ctx.closePath();
      fillStroke(ctx, c, 1.6);
      ctx.fillStyle = C(a); ctx.fillRect(-4, -1.4, 6, 2.8);
      ctx.strokeStyle = C('rgba(255,255,255,0.45)'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -1.6); ctx.lineTo(25, -2.2); ctx.stroke();
      if (a === '#c9ccd6' || c === '#8a5a2b') { // 釘
        ctx.strokeStyle = C('#d8dde8'); ctx.lineWidth = 1; ctx.beginPath();
        for (const nx of [14, 18, 22, 25]) { ctx.moveTo(nx, -3); ctx.lineTo(nx + 0.8, -5.5); ctx.moveTo(nx + 1.5, 3); ctx.lineTo(nx + 2.2, 5.5); }
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(-4.5, 0, 1.2, 2.2, 0, 0, PI * 2); fillStroke(ctx, a, 1);
      break;
    }
    case 'knife': {
      ctx.beginPath(); rrect(ctx, -4, -1.6, 7, 3.2, 1.2); fillStroke(ctx, a, 1.3);
      ctx.beginPath(); ctx.moveTo(3, -1.8); ctx.lineTo(10, -1.8); ctx.quadraticCurveTo(14, -1.2, 15, 0.8); ctx.lineTo(3, 1.4); ctx.closePath();
      fillStroke(ctx, c, 1.3);
      ctx.strokeStyle = C('rgba(255,255,255,0.8)'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4, -0.9); ctx.lineTo(12, -0.7); ctx.stroke();
      break;
    }
    case 'katana': {
      ctx.beginPath(); rrect(ctx, -8, -1.5, 9.5, 3, 1); fillStroke(ctx, '#1a1a22', 1.3);
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath();
      for (let i = -7; i < 1; i += 2.2) { ctx.moveTo(i, -1.4); ctx.lineTo(i + 1.4, 1.4); }
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(1.8, 0, 1.2, 3.6, 0, 0, PI * 2); fillStroke(ctx, '#d6b04a', 1.1);
      ctx.beginPath(); ctx.moveTo(3, -1.4); ctx.quadraticCurveTo(20, -3, 35, -4.6); ctx.lineTo(33, -2); ctx.quadraticCurveTo(19, 0.2, 3, 1.4); ctx.closePath();
      fillStroke(ctx, c, 1.3);
      ctx.strokeStyle = C('rgba(255,255,255,0.85)'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(5, -0.9); ctx.quadraticCurveTo(19, -2.1, 32, -3.6); ctx.stroke();
      break;
    }
    case 'pistol': {
      ctx.beginPath(); ctx.moveTo(-2.4, -1.5); ctx.lineTo(1.8, -1.5); ctx.lineTo(2.6, 6); ctx.lineTo(-1.4, 6.4); ctx.closePath();
      fillStroke(ctx, shade(c, -0.25), 1.3);
      ctx.beginPath(); rrect(ctx, -3, -5.4, 15.5, 4.4, 1); fillStroke(ctx, c, 1.4);
      ctx.fillStyle = C(a); ctx.fillRect(-1.5, -4.6, 10, 1);
      ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(2.5, 0.4, 1.8, 0, PI); ctx.stroke();
      break;
    }
    case 'smg': {
      ctx.beginPath(); ctx.moveTo(-8, -4.5); ctx.lineTo(-3, -4); ctx.lineTo(-3, -1); ctx.lineTo(-8, 1); ctx.closePath(); fillStroke(ctx, shade(c, -0.2), 1.2);
      ctx.beginPath(); ctx.moveTo(-1.6, -1); ctx.lineTo(1.6, -1); ctx.lineTo(2, 5.5); ctx.lineTo(-1, 5.8); ctx.closePath(); fillStroke(ctx, shade(c, -0.25), 1.2);
      ctx.beginPath(); ctx.moveTo(5, -1); ctx.lineTo(8, -1); ctx.lineTo(7.5, 8); ctx.lineTo(5, 8); ctx.closePath(); fillStroke(ctx, shade(c, -0.1), 1.2);
      ctx.beginPath(); rrect(ctx, -3.5, -6, 17, 5.4, 1.2); fillStroke(ctx, c, 1.4);
      ctx.beginPath(); ctx.rect(13, -4.4, 5.5, 2.2); fillStroke(ctx, '#2a2a30', 1.1);
      ctx.fillStyle = C(a); ctx.fillRect(-2, -5, 13, 1.2);
      break;
    }
    case 'guitar': {
      // ネック（握り）→ボディは先端
      ctx.beginPath(); rrect(ctx, -6, -1.6, 22, 3.2, 1); fillStroke(ctx, '#5a3a22', 1.2);
      ctx.beginPath(); ctx.moveTo(-6, -1.8); ctx.lineTo(-11, -3.4); ctx.lineTo(-11, 2.6); ctx.lineTo(-6, 1.8); ctx.closePath(); fillStroke(ctx, shade(c, -0.2), 1.2);
      ctx.save(); ctx.translate(24, 0);
      ctx.beginPath();
      ctx.moveTo(-9, -3); ctx.bezierCurveTo(-8, -11, 2, -12, 3, -6); ctx.bezierCurveTo(6, -9, 12, -8, 11, -2);
      ctx.bezierCurveTo(14, 2, 11, 10, 3, 9); ctx.bezierCurveTo(-3, 12, -10, 8, -9, 3); ctx.closePath();
      fillStroke(ctx, c, 1.6);
      ctx.beginPath(); ctx.ellipse(1, 1, 4.5, 3.6, 0.2, 0, PI * 2); ctx.fillStyle = C(a); ctx.fill();
      ctx.fillStyle = C('#1a1a22'); ctx.fillRect(-3, -2.5, 2, 5); ctx.fillRect(3.5, -2.5, 2, 5);
      ctx.restore();
      ctx.strokeStyle = C('rgba(255,255,255,0.7)'); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-6, -0.6); ctx.lineTo(28, -0.6); ctx.moveTo(-6, 0.6); ctx.lineTo(28, 0.6); ctx.stroke();
      break;
    }
    case 'neonSword': {
      ctx.beginPath(); rrect(ctx, -7, -1.6, 8.5, 3.2, 1); fillStroke(ctx, '#2a2a36', 1.3);
      ctx.beginPath(); rrect(ctx, 1, -4, 2.4, 8, 1); fillStroke(ctx, a, 1.1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = FL ? '#ffffff' : rgba(c, 0.28);
      ctx.beginPath(); rrect(ctx, 2, -5, 36, 10, 5); ctx.fill();
      ctx.fillStyle = FL ? '#ffffff' : rgba(c, 0.55);
      ctx.beginPath(); rrect(ctx, 3, -3.2, 33, 6.4, 3.2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); rrect(ctx, 3.5, -1.4, 31, 2.8, 1.4); ctx.fill();
      break;
    }
    case 'staff': {
      // デジタル・ワンド（ハッカー）: 回路の走るシャフト＋浮遊するホロコア
      ctx.beginPath(); ctx.moveTo(-12, -1.2); ctx.lineTo(22, -1.5); ctx.lineTo(22, 1.5); ctx.lineTo(-12, 1.2); ctx.closePath(); fillStroke(ctx, shade(c, -0.55), 1.2);
      ctx.fillStyle = C(a); ctx.fillRect(-3, -1.8, 2.2, 3.6); ctx.fillRect(16, -2, 2.4, 4);
      // 回路パターン
      ctx.strokeStyle = C(c); ctx.lineWidth = 0.8; ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-6, 0); ctx.lineTo(-5, -0.8); ctx.lineTo(2, -0.8); ctx.moveTo(4, 0.6); ctx.lineTo(10, 0.6); ctx.lineTo(11, -0.6); ctx.lineTo(15, -0.6); ctx.stroke();
      // 先端のフォーク
      ctx.beginPath(); ctx.moveTo(21, -1.5); ctx.lineTo(25, -5.5); ctx.lineTo(26.5, -4.5); ctx.lineTo(23.5, -1); ctx.moveTo(21, 1.5); ctx.lineTo(25, 5.5); ctx.lineTo(26.5, 4.5); ctx.lineTo(23.5, 1);
      ctx.fillStyle = C(shade(c, -0.4)); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); ctx.translate(30, Math.sin(t * 3) * 0.8);
      const glow = P && P.magicGlow ? P.magicGlow : 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = FL ? '#ffffff' : rgba(c, 0.22 + glow * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 7.5 + glow * 6 + Math.sin(t * 6) * 0.8, 0, PI * 2); ctx.fill();
      // 回転するリング片
      ctx.strokeStyle = C(rgba(c, 0.9)); ctx.lineWidth = 1.2;
      const ra = t * 3;
      ctx.beginPath(); ctx.arc(0, 0, 7.5 + glow * 2, ra, ra + 1.2); ctx.moveTo(Math.cos(ra + PI) * (7.5 + glow * 2), Math.sin(ra + PI) * (7.5 + glow * 2)); ctx.arc(0, 0, 7.5 + glow * 2, ra + PI, ra + PI + 1.2); ctx.stroke();
      // 周回するビット
      ctx.fillStyle = C(a === '#1d1d24' ? '#eafff2' : a);
      for (let i = 0; i < 3; i++) { const an = -t * 4 + i * 2.1; ctx.fillRect(Math.cos(an) * 10 - 0.8, Math.sin(an) * 5 - 0.8, 1.6, 1.6); }
      ctx.restore();
      // ホロコア（六角）
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const an = PI / 6 + i * PI / 3; const r = 4.8; if (i === 0) ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r); else ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      ctx.closePath(); fillStroke(ctx, c, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-1.6, -2.8, 1.4, 3.2); ctx.fillRect(0.6, -0.8, 1.4, 1.4);
      ctx.restore();
      break;
    }
  }
  if (P && P.muzzle) {
    const mx = style === 'smg' ? 20 : 14, my = style === 'smg' ? -3.3 : -3.2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,220,120,0.9)';
    ctx.beginPath(); ctx.moveTo(mx, my - 3); ctx.lineTo(mx + 9, my); ctx.lineTo(mx, my + 3); ctx.lineTo(mx + 3, my); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 頭
function drawHead(ctx, K) {
  const P = K.P, look = K.look, eq = K.eq;
  const fo = 2.2;
  // 顔
  ctx.beginPath();
  ctx.moveTo(-16.5, -1);
  ctx.bezierCurveTo(-16.5, -17, 16.5, -17, 16.5, -1);
  ctx.bezierCurveTo(16.5, 8, 10, 15, fo + 1, 15.5);
  ctx.bezierCurveTo(-7, 15.5, -16.5, 9, -16.5, -1);
  fillStroke(ctx, K.skin);
  // 頬の影（右下にセル影）
  ctx.fillStyle = C(rgba(shade(K.skin, -0.2), 0.35));
  ctx.beginPath(); ctx.moveTo(12, 6); ctx.quadraticCurveTo(11, 12, fo + 1, 14.5); ctx.quadraticCurveTo(10, 13, 15.6, 3); ctx.closePath(); ctx.fill();
  // 頬の赤み
  const cool = look.expr === 'cool' || (!look.expr && look.body === 'm');
  ctx.fillStyle = C(cool ? 'rgba(255,120,140,0.28)' : 'rgba(255,110,150,0.5)');
  ctx.beginPath(); ctx.ellipse(fo - 9.5, 7.5, 3.4, 1.7, 0, 0, PI * 2); ctx.ellipse(fo + 10, 7.5, 3, 1.6, 0, 0, PI * 2); ctx.fill();
  if (!cool) {
    ctx.strokeStyle = C('rgba(255,255,255,0.55)'); ctx.lineWidth = 0.7; ctx.beginPath();
    ctx.moveTo(fo - 10.5, 8.2); ctx.lineTo(fo - 9.5, 6.6); ctx.moveTo(fo - 8.8, 8.2); ctx.lineTo(fo - 7.8, 6.6);
    ctx.moveTo(fo + 9, 8.2); ctx.lineTo(fo + 10, 6.6); ctx.stroke();
  }
  // 目
  drawEyes(ctx, K, fo, cool);
  // 鼻
  ctx.fillStyle = C(shade(K.skin, -0.3)); ctx.fillRect(fo + 1.6, 6.8, 1, 1);
  // 口
  const hasMask = eq.accessory && eq.accessory.style === 'mask';
  if (!hasMask) drawMouth(ctx, K, fo, cool);
  // 煤・絆創膏
  if (K.dmg >= 0.9) {
    ctx.fillStyle = C('rgba(50,40,50,0.32)'); ctx.beginPath(); ctx.ellipse(fo - 10, 10.5, 2.6, 1.4, 0.3, 0, PI * 2); ctx.fill();
    bandaid(ctx, fo + 10.5, 4.5, -0.5);
  } else if (K.dmg >= 0.5) {
    ctx.fillStyle = C('rgba(50,40,50,0.2)'); ctx.beginPath(); ctx.ellipse(fo + 10, 10.5, 2.2, 1.2, -0.3, 0, PI * 2); ctx.fill();
  }
  if (hasMask) drawMask(ctx, K, fo);
  // 前髪
  drawHairFront(ctx, K);
  // 眉（前髪の上に薄く）
  drawBrows(ctx, K, fo, cool);
  if (eq.accessory && eq.accessory.style === 'sunglasses') drawGlasses(ctx, K, fo);
  drawHat(ctx, K, false);
  if (P.panic) drawSweat(ctx, K);
  if (eq.accessory && eq.accessory.style === 'halo') drawHalo(ctx, K);
}

function drawSweat(ctx, K) {
  const t = K.t;
  for (let i = 0; i < 2; i++) {
    const k = (t * 1.6 + i * 0.5) % 1;
    const x = i ? -19 - k * 4 : 19 + k * 3, y = -8 + k * 10 - (i ? 4 : 0);
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y - 4.5); ctx.quadraticCurveTo(x + 3.2, y + 0.5, x, y + 2); ctx.quadraticCurveTo(x - 3.2, y + 0.5, x, y - 4.5);
    ctx.fillStyle = C('#9fe8ff'); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - 0.8, y - 0.5, 0.7, 0, PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 慌て線
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.beginPath();
  ctx.moveTo(14, -24); ctx.lineTo(17, -29); ctx.moveTo(19, -21); ctx.lineTo(23, -24); ctx.moveTo(9, -26); ctx.lineTo(10, -31);
  ctx.stroke();
}

const BLINK_SEED = 0.37;
function drawEyes(ctx, K, fo, cool) {
  const P = K.P;
  const ec = K.look.eyeColor || '#4a3a8a';
  let mode = P.eyes;
  if (mode === 'n' || mode === 'fierce') {
    const ph = (K.t + BLINK_SEED + (K.look.body === 'm' ? 1.3 : 0)) % 3.9;
    if (ph < 0.12) mode = 'blink';
  }
  const rx = 4.0, ry = cool ? 4.6 : 5.6, ey = cool ? 2.4 : 1.8;
  const lx = fo - 6.2, rx2 = fo + 6.6;
  ctx.lineCap = 'round';
  if (mode === 'blink') {
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.beginPath();
    ctx.moveTo(lx - rx, ey + 1); ctx.quadraticCurveTo(lx, ey + 2.6, lx + rx, ey + 1);
    ctx.moveTo(rx2 - rx, ey + 1); ctx.quadraticCurveTo(rx2, ey + 2.6, rx2 + rx, ey + 1);
    ctx.stroke(); return;
  }
  if (mode === 'hurt') {
    ctx.strokeStyle = OC(); ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(lx - 3, ey - 3); ctx.lineTo(lx + 2.5, ey); ctx.lineTo(lx - 3, ey + 3);
    ctx.moveTo(rx2 + 3, ey - 3); ctx.lineTo(rx2 - 2.5, ey); ctx.lineTo(rx2 + 3, ey + 3);
    ctx.stroke(); return;
  }
  if (mode === 'panic') {
    for (const cx of [lx, rx2]) {
      ctx.beginPath(); ctx.ellipse(cx, ey, 4.2, 5, 0, 0, PI * 2); ctx.fillStyle = C('#ffffff'); ctx.fill();
      ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = C('#2a1430'); ctx.beginPath(); ctx.arc(cx + 0.6 + Math.sin(K.t * 20) * 0.6, ey + 0.3, 1.4, 0, PI * 2); ctx.fill();
    }
    return;
  }
  if (mode === 'x') {
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.beginPath();
    for (const cx of [lx, rx2]) { ctx.moveTo(cx - 2.6, ey - 2.6); ctx.lineTo(cx + 2.6, ey + 2.6); ctx.moveTo(cx + 2.6, ey - 2.6); ctx.lineTo(cx - 2.6, ey + 2.6); }
    ctx.stroke(); return;
  }
  for (let i = 0; i < 2; i++) {
    const cx = i ? rx2 : lx;
    const outer = i ? 1 : -1;
    const w = i ? rx * 0.92 : rx; // 奥側の目は少し細い
    // 白目
    ctx.beginPath(); ctx.ellipse(cx, ey, w + 0.4, ry, 0, 0, PI * 2);
    ctx.fillStyle = C('#ffffff'); ctx.fill();
    // 虹彩
    ctx.beginPath(); ctx.ellipse(cx + 0.3, ey + 0.5, w * 0.88, ry * 0.88, 0, 0, PI * 2);
    if (FL) ctx.fillStyle = '#ffffff';
    else {
      const g = ctx.createLinearGradient(0, ey - ry, 0, ey + ry);
      g.addColorStop(0, shade(ec, -0.6)); g.addColorStop(0.45, ec); g.addColorStop(1, shade(ec, 0.6));
      ctx.fillStyle = g;
    }
    ctx.fill();
    // 瞳孔
    ctx.beginPath(); ctx.ellipse(cx + 0.4, ey + 0.2, w * 0.45, ry * 0.5, 0, 0, PI * 2);
    ctx.fillStyle = C(shade(ec, -0.75)); ctx.fill();
    // ハイライト（右上大・左下小）
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + w * 0.3, ey - ry * 0.38, 1.5, 0, PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - w * 0.38, ey + ry * 0.42, 0.75, 0, PI * 2); ctx.fill();
    // 上まつ毛
    ctx.strokeStyle = OC(); ctx.lineWidth = 2.3;
    ctx.beginPath();
    if (cool) {
      // 半目: 上瞼が水平に下がる
      ctx.moveTo(cx - w - 0.8, ey - ry * 0.35);
      ctx.quadraticCurveTo(cx, ey - ry * 0.85, cx + w + 0.8, ey - ry * 0.45);
    } else {
      ctx.moveTo(cx - w - 0.9, ey - ry * 0.3 + (outer < 0 ? -0.6 : 0.4));
      ctx.quadraticCurveTo(cx, ey - ry * 1.35, cx + w + 0.9, ey - ry * 0.3 + (outer > 0 ? -0.6 : 0.4));
    }
    ctx.stroke();
    if (cool) {
      // 半目: 瞼より上を肌で隠す
      ctx.beginPath(); ctx.moveTo(cx - w - 1, ey - ry * 0.35); ctx.quadraticCurveTo(cx, ey - ry * 0.85, cx + w + 1, ey - ry * 0.45);
      ctx.lineTo(cx + w + 1, ey - ry - 1.5); ctx.lineTo(cx - w - 1, ey - ry - 1.5); ctx.closePath();
      ctx.fillStyle = C(K.skin); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - w - 0.8, ey - ry * 0.35); ctx.quadraticCurveTo(cx, ey - ry * 0.85, cx + w + 0.8, ey - ry * 0.45); ctx.stroke();
    } else {
      // つり目の跳ね
      ctx.lineWidth = 1.6; ctx.beginPath();
      const ox = cx + outer * (w + 0.9), oy = ey - ry * 0.3 - 0.6;
      ctx.moveTo(ox, oy); ctx.lineTo(ox + outer * 1.8, oy - 1.4); ctx.stroke();
      ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(cx + outer * w * 0.2, ey + ry + 0.2); ctx.lineTo(cx + outer * w * 0.75, ey + ry - 0.6); ctx.stroke();
    }
    if (P.eyes === 'fierce') {
      ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(cx - w - 0.5, ey - ry * (i ? 0.1 : 0.6)); ctx.lineTo(cx + w + 0.5, ey - ry * (i ? 0.6 : 0.1)); ctx.stroke();
    }
  }
}

function drawMouth(ctx, K, fo, cool) {
  const P = K.P;
  const mx = fo + 1.2, my = 10.2;
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.3;
  if (P.mouth === 'shout') {
    ctx.beginPath(); ctx.moveTo(mx - 2.4, my - 0.6); ctx.lineTo(mx + 2.4, my - 0.6); ctx.lineTo(mx, my + 2.6); ctx.closePath();
    ctx.fillStyle = C('#c2304a'); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C('#ff8fa8'); ctx.beginPath(); ctx.arc(mx, my + 1.4, 0.9, 0, PI * 2); ctx.fill();
    if (!cool) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(mx + 0.8, my - 0.5); ctx.lineTo(mx + 2, my - 0.5); ctx.lineTo(mx + 1.4, my + 0.8); ctx.closePath(); ctx.fill(); }
    return;
  }
  if (P.mouth === 'panic') {
    const o = 1 + Math.abs(Math.sin(K.t * 14)) * 0.6;
    ctx.beginPath(); ctx.ellipse(mx, my + 1, 2.2, 2.2 * o, 0, 0, PI * 2);
    ctx.fillStyle = C('#c2304a'); ctx.fill(); ctx.stroke();
    return;
  }
  if (P.mouth === 'hurt') {
    ctx.beginPath(); ctx.moveTo(mx - 2.5, my + 0.6); ctx.quadraticCurveTo(mx - 1.2, my - 0.8, mx, my + 0.6); ctx.quadraticCurveTo(mx + 1.2, my + 1.8, mx + 2.5, my + 0.4); ctx.stroke();
    return;
  }
  if (cool) {
    ctx.beginPath(); ctx.moveTo(mx - 1.8, my + 0.4); ctx.lineTo(mx + 1.6, my); ctx.stroke();
  } else {
    // ω っぽい口 + 八重歯
    ctx.beginPath(); ctx.moveTo(mx - 2.4, my - 0.2); ctx.quadraticCurveTo(mx - 1.2, my + 1.6, mx, my); ctx.quadraticCurveTo(mx + 1.2, my + 1.6, mx + 2.4, my - 0.2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OC(); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(mx + 0.6, my + 0.5); ctx.lineTo(mx + 1.9, my + 0.4); ctx.lineTo(mx + 1.3, my + 1.9); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawBrows(ctx, K, fo, cool) {
  if (K.P.eyes === 'x') return;
  const hc = shade(K.hair, -0.4);
  ctx.strokeStyle = C(rgba(hc, 0.75)); ctx.lineWidth = 1.1; ctx.beginPath();
  const lx = fo - 6.2, rx = fo + 6.6, y = cool ? -3.6 : -5.2;
  if (K.P.eyes === 'hurt') {
    ctx.moveTo(lx - 3, y + 0.4); ctx.lineTo(lx + 3, y - 1); ctx.moveTo(rx - 3, y - 1); ctx.lineTo(rx + 3, y + 0.4);
  } else if (cool) {
    ctx.moveTo(lx - 3, y - 0.4); ctx.lineTo(lx + 3, y + 0.3); ctx.moveTo(rx - 3, y + 0.3); ctx.lineTo(rx + 3, y - 0.4);
  } else {
    ctx.moveTo(lx - 3, y - 1); ctx.quadraticCurveTo(lx, y - 1.4, lx + 3, y + 0.6);
    ctx.moveTo(rx - 3, y + 0.6); ctx.quadraticCurveTo(rx, y - 1.4, rx + 3, y - 1);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- 髪
function hairCols(K) {
  const L = K.look, c = K.hair;
  return {
    base: c,
    dark: L.hairShadow || shade(c, -0.3),
    hi: L.hairHi || shade(c, 0.5),
  };
}

function drawHairBack(ctx, K, backView) {
  const st = K.look.hair || 'short';
  const H = hairCols(K);
  const sway = K.P.hairSway || 0;
  const t = K.t;
  const wob = Math.sin(t * 3) * 0.8;
  // 尻尾類
  if (st === 'twin') {
    const tip = K.look.hairTip;
    for (const side of [-1, 1]) {
      const sx = side * 14, sy = -10;
      const tx = side * (20 + wob * 0.5) - sway * 3, ty = 28 - Math.abs(sway) * 2;
      ctx.beginPath();
      ctx.moveTo(sx - side * 3, sy - 4);
      ctx.bezierCurveTo(side * 28, sy - 6, side * 30 - sway * 2, 12, tx, ty);
      ctx.bezierCurveTo(side * 22 - sway * 2, 16, side * 18, 8, sx - side * 1, sy + 6);
      ctx.closePath();
      if (!FL && tip) {
        const g = ctx.createLinearGradient(0, sy, 0, ty);
        g.addColorStop(0, H.base); g.addColorStop(0.6, H.base); g.addColorStop(1, tip);
        ctx.fillStyle = g;
      } else ctx.fillStyle = C(H.base);
      ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = OLW; ctx.stroke();
      ctx.strokeStyle = C(H.dark); ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(side * 20, sy); ctx.quadraticCurveTo(side * 25, 8, tx - side * 2, ty - 6); ctx.stroke();
    }
  } else if (st === 'ponytail') {
    ctx.beginPath();
    const tx = -27 - sway * 3, ty = 14 + wob;
    ctx.moveTo(-12, -14); ctx.bezierCurveTo(-26, -16, -30, 2, tx, ty);
    ctx.bezierCurveTo(-22, 8, -20, -2, -13, -4); ctx.closePath();
    fillStroke(ctx, H.base);
  } else if (st === 'long') {
    ctx.beginPath();
    ctx.moveTo(-18, -6); ctx.bezierCurveTo(-22, 10, -21 - sway, 28, -16 - sway, 38);
    ctx.lineTo(-6, 34); ctx.lineTo(4, 38); ctx.lineTo(14 - sway, 34);
    ctx.bezierCurveTo(19, 20, 20, 8, 18, -6); ctx.closePath();
    fillStroke(ctx, H.dark);
  } else if (st === 'bob') {
    ctx.beginPath(); ctx.moveTo(-19, -4); ctx.bezierCurveTo(-21, 8, -18, 15, -10, 15); ctx.lineTo(12, 15);
    ctx.bezierCurveTo(19, 14, 21, 8, 19, -4); ctx.closePath(); fillStroke(ctx, H.dark);
  } else if (st === 'bun') {
    ctx.beginPath(); ctx.arc(-6, -19, 7.5, 0, PI * 2); fillStroke(ctx, H.base);
    ctx.strokeStyle = C(H.hi); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(-6, -19, 4.5, -2.6, -1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, -4); ctx.bezierCurveTo(-20, 4, -16, 8, -12, 8); ctx.lineTo(12, 8);
    ctx.bezierCurveTo(16, 8, 20, 4, 18, -4); ctx.closePath(); fillStroke(ctx, H.dark);
  } else if (st === 'wolf') {
    ctx.beginPath();
    ctx.moveTo(-17, -6); ctx.lineTo(-21, 8); ctx.lineTo(-17.5, 6); ctx.lineTo(-19 - sway, 18); ctx.lineTo(-14, 11);
    ctx.lineTo(-13 - sway, 20); ctx.lineTo(-9, 12); ctx.lineTo(10, 12); ctx.lineTo(17, 4); ctx.lineTo(17, -6); ctx.closePath();
    fillStroke(ctx, H.dark);
    if (K.look.mesh) {
      ctx.fillStyle = C(K.look.mesh); ctx.beginPath(); ctx.moveTo(-17.5, 6); ctx.lineTo(-19 - sway, 18); ctx.lineTo(-15.5, 10); ctx.closePath(); ctx.fill();
    }
  }
  else if (st === 'braid') {
    // 後ろに垂れる三つ編み（揺れる）
    let bx = -14, by = -6;
    for (let i = 0; i < 6; i++) {
      const nx = -18 - i * 1.2 - sway * (i * 0.6), ny = by + 6.2;
      ctx.beginPath(); ctx.ellipse((bx + nx) / 2, (by + ny) / 2, 4.6 - i * 0.25, 4.0, (i % 2 ? 0.5 : -0.5), 0, PI * 2);
      fillStroke(ctx, i % 2 ? H.base : H.dark, 1.6);
      bx = nx; by = ny;
    }
    ctx.beginPath(); ctx.arc(bx, by + 1, 2.4, 0, PI * 2); fillStroke(ctx, K.look.tie || '#ff5fa2', 1.2);
    ctx.beginPath(); ctx.moveTo(bx - 3, by + 3); ctx.lineTo(bx - 1, by + 9); ctx.lineTo(bx + 1.5, by + 8); ctx.lineTo(bx + 2.5, by + 3); ctx.closePath(); fillStroke(ctx, H.base, 1.2);
  } else if (st === 'curly') {
    // もこもこのボリューム（円の集まり: 先に縁取り→後で塗りだけ重ねて内側の線を消す）
    const B = [];
    for (let i = 0; i < 13; i++) { const a = PI * 0.82 + (i / 12) * PI * 1.36; B.push([Math.cos(a) * 19.5, -3 + Math.sin(a) * 18, 7 + (i % 2) * 1.2]); }
    B.push([-17, 9, 6.5], [17, 9, 6.5]);
    ctx.lineWidth = OLW; ctx.strokeStyle = OC();
    for (const [x, y, r] of B) { ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.stroke(); }
    ctx.fillStyle = C(H.dark);
    for (const [x, y, r] of B) { ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill(); }
  } else if (st === 'sidepart') {
    ctx.beginPath(); ctx.moveTo(-19, -4); ctx.bezierCurveTo(-21, 6, -19, 12, -13, 13); ctx.lineTo(13, 11);
    ctx.bezierCurveTo(18, 9, 20, 4, 19, -4); ctx.closePath(); fillStroke(ctx, H.dark);
  } else if (st === 'messy') {
    ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(-21, 4); ctx.lineTo(-17, 3); ctx.lineTo(-18.5 - sway, 12); ctx.lineTo(-12, 8);
    ctx.lineTo(-9, 12); ctx.lineTo(10, 10); ctx.lineTo(17, 3); ctx.lineTo(17, -6); ctx.closePath(); fillStroke(ctx, H.dark);
  } else if (st === 'topknot') {
    ctx.beginPath(); ctx.ellipse(-2, -22, 6.5, 6, -0.2, 0, PI * 2); fillStroke(ctx, H.base);
    ctx.beginPath(); ctx.ellipse(-2, -16.5, 4, 1.8, 0, 0, PI * 2); fillStroke(ctx, K.look.tie || '#ff3d7f', 1.2);
    ctx.strokeStyle = C(H.hi); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(-2, -22, 3.6, -2.6, -1.2); ctx.stroke();
  }
  // 後頭部
  ctx.beginPath(); ctx.ellipse(0, -2, 18.6, 17.4, 0, 0, PI * 2);
  fillStroke(ctx, backView ? H.base : H.dark);
  if (backView) {
    // 後ろ姿のディテール
    ctx.strokeStyle = C(H.dark); ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(0, -8); ctx.moveTo(-8, 10); ctx.lineTo(-5, 4); ctx.moveTo(8, 10); ctx.lineTo(5, 4); ctx.stroke();
    ctx.strokeStyle = C(H.hi); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, -4, 13, -2.6, -0.5); ctx.stroke();
    if (st === 'twin') {
      ctx.fillStyle = C(K.look.tie || '#ffd23f');
      ctx.beginPath(); ctx.arc(-14, -10, 2.6, 0, PI * 2); ctx.arc(14, -10, 2.6, 0, PI * 2); ctx.fill();
    }
  }
}

const BANGS = {
  twin: [[17, 9], [14, 9], [13, 0], [11.5, -2], [9.5, -8], [7, -1.8], [4, -9], [1, -2.5], [-2.5, -9], [-6, -1.5], [-8.5, -8], [-11.5, -1], [-13, 1], [-14, 9], [-17.5, 9]],
  bob: [[18.5, 13], [14, 13], [12.5, 0], [10, -2], [8, -8], [5, -2.5], [2, -9], [-1, -2.6], [-4.5, -9], [-7.5, -2], [-10, -8], [-12.5, -1], [-14, 13], [-18.8, 13]],
  long: [[18, 16], [14, 16], [13, 0], [11, -2.5], [8, -9], [5, -2], [1, -9], [-3, -2], [-6.5, -9], [-10, -1.5], [-12.6, 0], [-14.2, 16], [-18.6, 16]],
  short: [[17.2, 3], [15, 3], [13.5, -3], [11, -4], [8, -9], [5, -3.6], [1.5, -9.5], [-2, -4], [-5.5, -9.5], [-9, -3], [-12, -6], [-14, 0], [-15.4, 3], [-17.6, 3]],
  ponytail: [[17.4, 6], [14.5, 6], [13, -1], [10.5, -2.6], [7, -9], [4, -2.6], [0, -9.5], [-3.5, -2.5], [-7, -9], [-10.5, -1.6], [-13, 0], [-14.5, 6], [-17.8, 6]],
  spiky: [[17.2, 3], [15, 3], [13, -3], [11, -0.5], [8, -9], [5.5, 0.5], [2, -9], [-1.5, -0.5], [-5, -9], [-8.5, -1.5], [-11, -8], [-13.5, -0.5], [-15, 3], [-17.6, 3]],
  wolf: [[17.6, 9], [15, 8], [14, -1], [12, -3], [9.5, -9], [7, 1], [4, -8], [2.5, 4], [0, -7], [-3, -1], [-6, -9], [-9, -1], [-11, -7], [-13, 1], [-14, 9], [-18.2, 11]],
  // v3 追加
  undercut: [[16.8, -2], [14.8, -3], [14, -8], [11, -6], [7, -4], [3, -2.5], [-1, -1], [-5, 1.5], [-9, 4.5], [-11.5, 5.5], [-13, 0], [-14.6, -4], [-17.2, -4]],
  sidepart: [[17.4, 6], [14.6, 6], [13, -2], [10, -4], [7, -9], [4, -5], [1, -3.5], [-1.5, 3], [-3.5, 8.5], [-6.5, 10.5], [-10, 9], [-13, 6], [-14.6, 10], [-18.4, 12]],
  messy: [[17.6, 5], [15.2, 4], [14.5, -2], [12.5, -1], [10, -8], [7.5, -1.5], [5, -7.5], [2.5, 0], [-0.5, -8], [-3, -1], [-6.5, -9], [-8.5, 0], [-11.5, -6], [-13.5, 2], [-15, 6], [-18, 6]],
  braid: [[17.4, 5], [14.5, 5], [13, -1], [10.5, -2.6], [7.5, -9], [4.5, -3], [1, -9], [-2.5, -3], [-6, -9.5], [-9.5, -2], [-12.5, 0], [-14.5, 6], [-17.8, 6]],
  topknot: [[17.2, 2], [15, 2], [13.5, -4], [10.5, -5], [8, -10], [5, -5], [1.5, -10], [-2, -5], [-5.5, -10], [-9, -4.5], [-12, -6], [-14, -1], [-15.4, 2], [-17.6, 2]],
  curly: [[19.2, 8], [15.5, 8], [14, -1], [11.5, -2], [10, -7], [7, -2.5], [5, -8], [2, -3], [-1, -8.5], [-4, -3], [-7, -8.5], [-10, -2], [-12.5, -1], [-14.8, 8], [-19.4, 8]],
};
const DOMES = {
  spiky: [[-18.2, -4], [-21, -12], [-17, -13], [-19.5, -22], [-11, -19], [-9, -28], [-3, -20.5], [2, -29], [6, -20.5], [13, -26], [13, -17.5], [20.5, -18], [17.5, -10], [18.6, -4]],
  wolf: [[-18.2, -4], [-21.5, -10], [-17.5, -12], [-19.5, -19], [-12, -17.5], [-10, -24], [-4, -19.5], [1, -24.5], [6, -19.5], [12, -21.5], [12.5, -15.5], [18.5, -14], [18.6, -4]],
  undercut: [[-17.2, -4], [-17.6, -12], [-14, -19], [-8, -24.5], [0, -27], [8, -26.5], [15, -23], [20, -17], [22.5, -11], [19, -10], [17.4, -4]],
  messy: [[-18.4, -4], [-21, -9], [-18, -11], [-20.5, -16], [-14.5, -17.5], [-14, -23], [-8, -21], [-5, -26], [0, -21.5], [4.5, -26], [8, -21], [14, -23], [13.5, -17], [19.5, -16], [17.5, -11], [20.5, -8], [18.4, -4]],
  curly: [[-19.4, -4], [-22, -9], [-20.5, -15], [-16.5, -20], [-11, -24.5], [-4.5, -26.5], [2.5, -26.5], [9, -24.5], [14.5, -21], [19, -16], [21.5, -10], [19.4, -4]],
};

function drawHairFront(ctx, K) {
  const st = BANGS[K.look.hair] ? K.look.hair : 'short';
  const H = hairCols(K);
  const edge = BANGS[st];
  ctx.beginPath();
  const L0 = edge[edge.length - 1];
  ctx.moveTo(L0[0], L0[1]);
  const dome = DOMES[st];
  if (dome) { for (const p of dome) ctx.lineTo(p[0], p[1]); }
  else { ctx.lineTo(-18.4, -4); ctx.bezierCurveTo(-18.8, -23, 18.8, -23, 18.4, -4); }
  for (const p of edge) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  fillStroke(ctx, H.base);
  // 影（前髪の内側）
  // 天使の輪ハイライト
  ctx.strokeStyle = C(H.hi); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(1, -2, 15, -2.55, -2.0); ctx.stroke();
  ctx.beginPath(); ctx.arc(1, -2, 15, -1.8, -1.25); ctx.stroke();
  ctx.beginPath(); ctx.arc(1, -2, 15, -1.05, -0.7); ctx.stroke();
  // 束の線
  ctx.strokeStyle = C(H.dark); ctx.lineWidth = 0.9; ctx.beginPath();
  ctx.moveTo(-6, -14); ctx.quadraticCurveTo(-7, -9, -6, -4); ctx.moveTo(5, -14); ctx.quadraticCurveTo(6, -9, 5, -5); ctx.stroke();
  if (K.look.mesh) {
    ctx.strokeStyle = C(K.look.mesh); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, -15); ctx.quadraticCurveTo(9.5, -8, 7.5, -1.5); ctx.stroke();
  }
  // ヘアゴム
  if (K.look.hair === 'twin') {
    const tc = K.look.tie || '#ffd23f';
    for (const sx of [-15.5, 15]) {
      ctx.beginPath(); ctx.arc(sx, -10, 2.8, 0, PI * 2); fillStroke(ctx, tc, 1.3);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(sx - 0.8, -11, 0.9, 0, PI * 2); ctx.fill();
    }
  }
  if (K.look.hair === 'ponytail') {
    ctx.beginPath(); ctx.arc(-14, -10, 2.4, 0, PI * 2); fillStroke(ctx, K.look.tie || '#ff5fa2', 1.2);
  }
  const hs = K.look.hair;
  if (hs === 'undercut') {
    // 刈り上げ（側頭部のライン）
    ctx.strokeStyle = C(H.dark); ctx.lineWidth = 1.1; ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(-16.5 + i * 0.8, -3 + i * 0.2); ctx.lineTo(-15.2 + i * 0.8, 2.5); }
    ctx.stroke();
    ctx.strokeStyle = C(H.hi); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-8, -21); ctx.quadraticCurveTo(6, -24, 17, -15); ctx.stroke();
  } else if (hs === 'sidepart') {
    ctx.strokeStyle = C(H.dark); ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(-1, -12); ctx.quadraticCurveTo(-3, -2, -5.5, 8); ctx.moveTo(-6, -11); ctx.quadraticCurveTo(-8, 0, -10, 7); ctx.stroke();
  } else if (hs === 'curly' || hs === 'messy') {
    ctx.strokeStyle = C(H.dark); ctx.lineWidth = 1; ctx.beginPath();
    for (const [x, y] of [[-12, -15], [-3, -19], [7, -18], [13, -12]]) { ctx.moveTo(x + 2.5, y); ctx.arc(x, y, 2.5, 0, PI * 1.4); }
    ctx.stroke();
  } else if (hs === 'braid') {
    ctx.beginPath(); ctx.arc(-15, -6, 2.2, 0, PI * 2); fillStroke(ctx, K.look.tie || '#ff5fa2', 1.1);
  }
}

// ---------------------------------------------------------------- 帽子
function drawHat(ctx, K, back) {
  const h = K.eq.hat;
  if (!h) return;
  const [c, a] = itemColors(h);
  const st = h.style;
  switch (st) {
    case 'cap':
      ctx.beginPath(); ctx.moveTo(-18.4, -7); ctx.bezierCurveTo(-19, -26, 19, -26, 18.4, -7); ctx.closePath(); fillStroke(ctx, c);
      if (!back) {
        ctx.beginPath(); ctx.moveTo(10, -9); ctx.quadraticCurveTo(26, -10, 29, -5.5); ctx.quadraticCurveTo(20, -4, 12, -5.5); ctx.closePath(); fillStroke(ctx, a);
        ctx.beginPath(); ctx.arc(3, -14.5, 3.4, 0, PI * 2); fillStroke(ctx, a, 1.2);
        ctx.fillStyle = C(c); ctx.beginPath(); starPathLocal(ctx, 3, -14.5, 2.2, 1); ctx.fill();
      }
      ctx.fillStyle = C(shade(c, -0.25)); ctx.beginPath(); ctx.arc(0, -21.5, 1.6, 0, PI * 2); ctx.fill();
      ctx.strokeStyle = C(rgba('#ffffff', 0.4)); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -8, 13, -2.6, -1.9); ctx.stroke();
      break;
    case 'beanie':
      ctx.beginPath(); ctx.moveTo(-18.8, -5); ctx.bezierCurveTo(-19.5, -27, 19.5, -27, 18.8, -5); ctx.closePath(); fillStroke(ctx, c);
      ctx.beginPath(); rrect(ctx, -19.4, -10, 38.8, 6, 2.6); fillStroke(ctx, shade(c, -0.15));
      ctx.strokeStyle = C(shade(c, -0.35)); ctx.lineWidth = 0.8; ctx.beginPath();
      for (let x = -16; x <= 16; x += 3) { ctx.moveTo(x, -9); ctx.lineTo(x, -5); } ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -23.5, 4, 0, PI * 2); fillStroke(ctx, a);
      break;
    case 'bandana':
      ctx.beginPath(); ctx.moveTo(-18.8, -7); ctx.bezierCurveTo(-19, -24, 19, -24, 18.8, -7);
      ctx.quadraticCurveTo(0, -11, -18.8, -7); ctx.closePath(); fillStroke(ctx, c);
      ctx.fillStyle = C(a);
      for (const [dx, dy] of [[-9, -15], [0, -18], [9, -15], [-4, -11], [5, -11.5], [13, -10]]) { ctx.beginPath(); ctx.arc(dx, dy, 1, 0, PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-17, -9); ctx.lineTo(-26, -14); ctx.lineTo(-24, -8); ctx.closePath(); ctx.moveTo(-17, -8); ctx.lineTo(-25, -2); ctx.lineTo(-20, -2); ctx.closePath(); fillStroke(ctx, c, 1.5);
      break;
    case 'headphones':
      ctx.strokeStyle = OC(); ctx.lineWidth = 5.6; ctx.beginPath(); ctx.arc(0, -2, 19.5, PI * 1.08, PI * 1.92); ctx.stroke();
      ctx.strokeStyle = C(c); ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); rrect(ctx, -22, -6, 8, 12, 3.5); fillStroke(ctx, c);
      ctx.beginPath(); rrect(ctx, -20.5, -3.5, 5, 7, 2); ctx.fillStyle = C(a); ctx.fill();
      if (!back) { ctx.beginPath(); rrect(ctx, 16.5, -6, 4.5, 10, 2); fillStroke(ctx, shade(c, -0.15), 1.6); }
      break;
    case 'crown':
      ctx.save(); ctx.translate(2, -19); ctx.rotate(0.12);
      ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-9, -6); ctx.lineTo(-4.5, -1.5); ctx.lineTo(0, -9); ctx.lineTo(4.5, -1.5); ctx.lineTo(9, -6); ctx.lineTo(8, 3); ctx.closePath();
      fillStroke(ctx, c, 1.8);
      ctx.fillStyle = C(a); ctx.beginPath(); ctx.arc(0, -0.5, 1.6, 0, PI * 2); ctx.arc(-5, 0.8, 1.1, 0, PI * 2); ctx.arc(5, 0.8, 1.1, 0, PI * 2); ctx.fill();
      ctx.fillStyle = C('#ffffff'); ctx.beginPath(); ctx.arc(0, -9, 1.2, 0, PI * 2); ctx.arc(-9, -6, 1, 0, PI * 2); ctx.arc(9, -6, 1, 0, PI * 2); ctx.fill();
      ctx.restore();
      break;
    case 'helmet':
      ctx.beginPath(); ctx.moveTo(-19.6, 4); ctx.bezierCurveTo(-21, -28, 21, -28, 19.6, -3); ctx.lineTo(19.6, -2); ctx.lineTo(-19.6, 4); ctx.closePath();
      fillStroke(ctx, c);
      if (!back) {
        ctx.beginPath(); ctx.moveTo(-10, -9); ctx.quadraticCurveTo(6, -14, 21, -9); ctx.lineTo(21, -4); ctx.quadraticCurveTo(6, -8, -10, -5); ctx.closePath();
        ctx.fillStyle = C(rgba(a, 0.85)); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.4; ctx.stroke();
      }
      ctx.strokeStyle = C(a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -22); ctx.quadraticCurveTo(-14, -14, -16, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -6, 14, -2.5, -1.8); ctx.stroke();
      break;
    case 'cowboy':
      ctx.beginPath(); ctx.ellipse(0, -10, 29, 6, -0.04, 0, PI * 2); fillStroke(ctx, shade(c, -0.08));
      ctx.beginPath(); ctx.moveTo(-12, -11); ctx.bezierCurveTo(-14, -28, -6, -30, 0, -25); ctx.bezierCurveTo(6, -30, 14, -28, 12, -11); ctx.closePath(); fillStroke(ctx, c);
      ctx.fillStyle = C(a); ctx.fillRect(-12.3, -15, 24.6, 3);
      ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.strokeRect(-12.3, -15, 24.6, 3);
      break;
    case 'catEars': {
      const wig = Math.sin(K.t * 5) > 0.92 ? 0.15 : 0;
      for (const [ex, rot] of [[-10, -0.35 - wig], [9, 0.35]]) {
        ctx.save(); ctx.translate(ex, -15); ctx.rotate(rot);
        ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(0, -11); ctx.lineTo(6, 2); ctx.closePath(); fillStroke(ctx, c);
        ctx.beginPath(); ctx.moveTo(-3.2, 0.5); ctx.lineTo(0, -6.5); ctx.lineTo(3.2, 0.5); ctx.closePath(); ctx.fillStyle = C(a); ctx.fill();
        ctx.restore();
      }
      break;
    }
  }
}
function starPathLocal(ctx, x, y, r1, r2) {
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1, an = -PI / 2 + (i * PI) / 5;
    if (i === 0) ctx.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r); else ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- アクセサリー
function drawGlasses(ctx, K, fo) {
  const [c, a] = itemColors(K.eq.accessory);
  const y = 1.6;
  for (const cx of [fo - 6.2, fo + 6.8]) {
    ctx.beginPath(); rrect(ctx, cx - 4.6, y - 3, 9.2, 6.4, 2.6);
    if (FL) ctx.fillStyle = '#fff';
    else { const g = ctx.createLinearGradient(0, y - 3, 0, y + 3.4); g.addColorStop(0, shade(c, -0.2)); g.addColorStop(1, shade(c, 0.35)); ctx.fillStyle = g; }
    ctx.fill(); ctx.strokeStyle = C(a); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 2.8, y - 1); ctx.lineTo(cx - 0.8, y - 2.2); ctx.stroke();
  }
  ctx.strokeStyle = C(a); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(fo - 1.6, y - 1); ctx.lineTo(fo + 2.2, y - 1);
  ctx.moveTo(fo - 10.8, y - 1); ctx.lineTo(-16, y - 2); ctx.stroke();
}
function drawMask(ctx, K, fo) {
  const [c, a] = itemColors(K.eq.accessory);
  ctx.beginPath(); ctx.moveTo(-15.8, 4.5); ctx.quadraticCurveTo(fo, 3, 16, 4); ctx.bezierCurveTo(16, 9, 10, 15, fo + 1, 15.6);
  ctx.bezierCurveTo(-7, 15.6, -15.8, 10, -15.8, 4.5); ctx.closePath(); fillStroke(ctx, c, 1.8);
  ctx.strokeStyle = C(a); ctx.lineWidth = 1.2; ctx.beginPath();
  // 牙模様（スカル風だが独自）
  ctx.moveTo(fo - 6, 9.5); for (let i = 0; i <= 6; i++) ctx.lineTo(fo - 6 + i * 2.2, i % 2 ? 11.6 : 9.5);
  ctx.stroke();
  ctx.fillStyle = C(a); ctx.beginPath(); ctx.ellipse(fo + 1.2, 6.8, 1.2, 0.8, 0, 0, PI * 2); ctx.fill();
}
function drawChain(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-5.5, -20); ctx.quadraticCurveTo(0.5, -9, 6.5, -20); ctx.stroke();
  ctx.strokeStyle = C(c); ctx.lineWidth = 1.8; ctx.setLineDash([1.6, 0.9]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(0.5, -14.6); ctx.lineTo(3.3, -11.8); ctx.lineTo(0.5, -9); ctx.lineTo(-2.3, -11.8); ctx.closePath(); fillStroke(ctx, c, 1.1);
  ctx.fillStyle = C(a); ctx.beginPath(); ctx.arc(0.5, -11.8, 0.9, 0, PI * 2); ctx.fill();
}
function drawScarfTail(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  const w = Math.sin(K.t * 6) * 2;
  ctx.beginPath(); ctx.moveTo(-4, -21); ctx.bezierCurveTo(-12, -22 + w, -18, -18 - w, -24, -15 + w);
  ctx.lineTo(-23, -10 + w); ctx.bezierCurveTo(-16, -13, -10, -15, -3, -17); ctx.closePath(); fillStroke(ctx, c, 1.7);
  ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-22, -14 + w); ctx.lineTo(-21.5, -11 + w); ctx.stroke();
}
function drawScarfFront(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  ctx.beginPath(); rrect(ctx, -8.5, -22.5, 18, 5.6, 2.8); fillStroke(ctx, c, 1.8);
  ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -19.7); ctx.lineTo(8, -19.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -18); ctx.lineTo(7.5, -9); ctx.lineTo(3, -10); ctx.closePath(); fillStroke(ctx, c, 1.4);
}
function drawWings(ctx, K, back) {
  const [c, a] = itemColors(K.eq.accessory);
  const flap = Math.sin(K.t * 4) * 0.12;
  const neon = c !== '#ffffff' && c.toLowerCase() !== '#fff';
  for (const side of back ? [-1, 1] : [-1, -0.6]) {
    ctx.save(); ctx.translate(side < 0 && side > -1 ? 2 : -2, -14);
    const sc = Math.abs(side);
    ctx.scale(side < 0 ? 1 : -1, 1);
    ctx.rotate(-0.25 - flap * (side === -1 ? 1 : 0.7));
    ctx.scale(sc, sc);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.bezierCurveTo(-10, -18, -26, -22, -32, -16);
    ctx.quadraticCurveTo(-28, -12, -30, -8); ctx.quadraticCurveTo(-25, -6, -26, -1); ctx.quadraticCurveTo(-20, 0, -19, 5);
    ctx.quadraticCurveTo(-10, 5, 0, 3); ctx.closePath();
    if (neon) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = FL ? '#fff' : rgba(c, 0.35); ctx.fill(); ctx.restore();
      ctx.strokeStyle = C(c); ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = C(a); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-24, -12); ctx.moveTo(-4, 0); ctx.lineTo(-20, -3); ctx.stroke();
    } else {
      fillStroke(ctx, c, 1.8);
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(-8, -4); ctx.quadraticCurveTo(-16, -8, -26, -12); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-15, -2, -22, -3); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawHalo(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  const bob = Math.sin(K.t * 2.5) * 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = FL ? '#fff' : rgba(c, 0.35); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(1, -27 + bob, 11, 3.2, 0, 0, PI * 2); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = C(c); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(1, -27 + bob, 11, 3.2, 0, 0, PI * 2); ctx.stroke();
  ctx.strokeStyle = C(a); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(1, -27.4 + bob, 10, 2.6, 0, PI, PI * 2); ctx.stroke();
}
