// アニメ調ちびキャラ描画（2.5頭身・高さ約80px・足元中央が(x,y)）
// v4 品質アップ版:
//  - 顔: 多層グラデの瞳（虹彩・瞳孔・上部の影・下の反射光・ハイライト3点）、太い上まつ毛、眉と口で感情。
//        表情は anim.state / anim.damage から自動（anim.face = 'happy'|'jito'|'angry'|'sad'|'wink' で上書き可）。
//  - 髪: 毛束ごとのパス（先端が尖る）を「縁取り→塗り」で合成、内側の暗色・ツヤの帯・アホ毛・リムライト。
//        尻尾/サイドの束は anim から二次運動（揺れ・ジャンプでふわっと浮く）。
//  - 体: ♀は小顔・細い首・くびれ、♂は肩幅・胸板。肢はテーパー付き＋セル影の帯。手はグー/パー/武器握りを描き分け。
//  - 服: 2段セル影＋ハイライト＋縫い目/ジッパー/ボタン/ロゴ。レア度（epic 以上）でトリム・光沢。
//  - 線: 外側の輪郭は太め、内側のディテールは細め（#2A1430 系）。影側の縁にネオンのリムライト。
//  - 性能: 待機/歩き/ジャンプ等のループ状態は 2x の高解像度オフスクリーンにキャッシュ（LRU・画素数上限）して drawImage。
//          攻撃/被弾/死亡などの一過性の状態や大きな拡大表示はその場でベクター描画する。
import { shade, rgba, mix, rng, clamp, lerp, OUTLINE } from './util.js';
import { ITEMS } from '../data/items.js';
import { spriteCharPlan, drawSpriteCharPlan, headFor, headBackOf, flashOf } from './sprites.js';
import { RIG_PARTS, RIG_GROUP_PARTS, RIG_S, WPN_BOX, WPN_S, RIG_Y, RIG_LIMBS, RIG_CODE_HEAD, HEAD_BACK_PIVOT } from './rigLayout.js';
import { rigPlanFor, rigCodePlanFor, rigView } from './rig.js';

export const HERO_LOOKS = {
  luna: { body: 'f', skin: '#ffe3d3', hair: 'twin', hairColor: '#ff6fb5', eyeColor: '#ff3d8b', expr: 'cute', hairShadow: '#c8458f', hairHi: '#ffd0ea', hairTip: '#b47cff', tie: '#ffd23f' },
  jin: { body: 'm', skin: '#f6d5be', hair: 'wolf', hairColor: '#dde3ee', eyeColor: '#33c7e6', expr: 'cool', hairShadow: '#8790ab', hairHi: '#ffffff', mesh: '#3ee6d2' },
  hacker: { body: 'f', skin: '#efcdb4', hair: 'bob', hairColor: '#3dff8a', eyeColor: '#19f0ff', expr: 'cool', hairShadow: '#159e6a', hairHi: '#c8ffe0' },
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
const OLW = 2.2;                    // 外側アウトライン
const ILW = 0.85;                   // 内側ディテール線
const HEAD_Y = -40;                 // 腰からの頭中心
const SHOULDER_Y = -17.5;
const INNER_TOP = '#3a3346';        // インナー（タンクトップ）
const INNER_BOT = '#2a2633';        // インナー（スパッツ）
const EMPTY = {};
const PI = Math.PI, TAU = PI * 2;
const FO = 2.2;                     // 顔の向き（3/4 ビュー）のずれ
const LOOP = 4.8;                   // 時間ループ（キャッシュのため全ての揺れはこの周期の整数倍）

// 性別ごとの体格（♀: 小顔・細い首・くびれ・脚長め / ♂: 肩幅・胸板・がっしり）
const BODY = {
  f: { sw: 8.5, ww: 6.3, hw: 8.6, legX: 3.5, thigh: 9.0, shin: 8.9, legW: 6.6, legW2: 5.4, upper: 7.6, fore: 7.2, armW: 4.9, armW2: 4.3, sx: 7.2, neck: 1.9, head: 0.96, hipY: -19.6 },
  m: { sw: 11.0, ww: 9.0, hw: 9.2, legX: 4.3, thigh: 8.6, shin: 8.4, legW: 7.6, legW2: 6.6, upper: 8.0, fore: 7.6, armW: 6.0, armW2: 5.4, sx: 9.3, neck: 2.8, head: 1.0, hipY: -19 },
};
// リグ（主人公のパーツ式）専用の骨格 v2（rigLayout.js の RIG_PROFILE / RIG_LIMBS）。頭の座標は縮尺 1（コードの頭は RIG_CODE_HEAD で置く）
const RIG_B = {
  f: { ...BODY.f, ...RIG_LIMBS.f, head: 1, hipY: RIG_Y.hip },
  m: { ...BODY.m, ...RIG_LIMBS.m, head: 1, hipY: RIG_Y.hip },
};
const RIG_B0 = { f: { ...RIG_B.f }, m: { ...RIG_B.m } };
// manifest rig.profile で骨格の一部（肩の位置 sx・腕/脚の太さなど）を上書き。null で元に戻す
const RIG_PROFILE_KEYS = ['sx', 'sw', 'ww', 'hw', 'legX', 'legW', 'legW2', 'armW', 'armW2'];
export function setRigProfile(p) {
  for (const g of ['f', 'm']) {
    Object.assign(RIG_B[g], RIG_B0[g]);
    const o = p && p[g];
    if (!o || typeof o !== 'object') continue;
    for (const k of RIG_PROFILE_KEYS) if (typeof o[k] === 'number' && isFinite(o[k])) RIG_B[g][k] = clamp(o[k], RIG_B0[g][k] * 0.5, RIG_B0[g][k] * 2);
  }
}
// コードの胴（旧い肩 -17.5）を v2 の肩（-22）に合わせる縦の伸ばし: 腰の少し上 y0 より上だけを s 倍（裾・腰回りはそのまま）
const RIG_STRETCH = { y0: -4, s: (-RIG_Y.shoulder - 4) / (-SHOULDER_Y - 4), top: RIG_Y.chin - 3 };
// コードの靴（足首から靴底 +2.8）を v2 の大きな靴（足首から靴底 +6）に: 足首を中心に s 倍して dy 下げる
const RIG_FOOT = { s: 1.3, dy: 6 - 2.8 * 1.3 };

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

// レア度（ITEMS の look オブジェクト → 0..4）。look.rarity があればそれを優先
const RLV = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
let RAR = null;
function rarityOf(look) {
  if (!look) return 0;
  if (look.rarity != null) return typeof look.rarity === 'number' ? look.rarity : RLV[look.rarity] || 0;
  if (!RAR) {
    RAR = new WeakMap();
    try { for (const it of Object.values(ITEMS)) if (it && it.look && typeof it.look === 'object') RAR.set(it.look, RLV[it.rarity] || 0); } catch (e) { /* ignore */ }
  }
  return RAR.get(look) || 0;
}
const TRIM = ['', '', '#ffe27a', '#ffd23f', '#bff6ff'];

// ---------------------------------------------------------------- 破れ形状（シード固定で事前計算）
function jagPoly(seed, cx, cy, rx, ry, n) {
  const R = rng(seed); const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.3;
    const k = i % 2 ? 0.45 + R() * 0.25 : 0.95 + R() * 0.3;
    pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return pts;
}
const TOP_HOLES = [
  { th: 0.5, p: jagPoly(11, -3.6, -11, 2.6, 2.2, 10) },
  { th: 0.6, p: jagPoly(23, 4.6, -4, 2.8, 2.4, 10) },
  { th: 0.7, p: jagPoly(37, -4.6, -2, 2.4, 2.8, 10) },
  { th: 0.85, p: jagPoly(41, 4.2, -13, 2.2, 2.0, 10) },
];
const KNEE_HOLES = [TOP_HOLES[0].p.map((v, i) => (i % 2 ? (v + 11) * 0.85 : (v + 3.6) * 0.85)), TOP_HOLES[1].p.map((v, i) => (i % 2 ? (v + 4) * 0.85 : (v - 4.6) * 0.85))];
const SKIRT_HOLE = TOP_HOLES[2].p.map((v, i) => (i % 2 ? v + 2 : v + 4.6) * 0.8);
const BIG_RIP = (() => {
  const R = rng(777); const top = []; const bot = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(-6.8, 6.4, t), y = lerp(-15, -6, t);
    const w = Math.sin(t * PI) * 3.2 + 0.6;
    top.push(x + (R() - 0.5) * 1.2, y - w * (i % 2 ? 0.6 : 1.1));
    bot.push(x + (R() - 0.5) * 1.2, y + w * (i % 2 ? 1.1 : 0.6));
  }
  const pts = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) pts.push(bot[i], bot[i + 1]);
  return pts;
})();
const SCRATCHES = [[-5.5, -14, -2.5, -12], [3, -8, 6, -6.5], [-2, -4, 1, -2.5], [4.5, -15, 6.5, -13]];
const SOOT = [[-4.5, -7, 3.2, 2.2], [4.5, -12, 2.6, 1.8], [-1, -1, 3.6, 1.8], [5.5, -2, 2, 1.6]];

function polyPath(ctx, p) {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}

// ---------------------------------------------------------------- 色ユーティリティ（メモ化）
const SHM = new Map();
function sh(c, a) {
  const k = c + '|' + a;
  let v = SHM.get(k);
  if (v === undefined) { v = shade(c, a); if (SHM.size > 6000) SHM.clear(); SHM.set(k, v); }
  return v;
}
const RAM = new Map();
function ra(c, a) {
  const k = c + '|' + a;
  let v = RAM.get(k);
  if (v === undefined) { v = rgba(c, a); if (RAM.size > 6000) RAM.clear(); RAM.set(k, v); }
  return v;
}
const MXM = new Map();
function mx(a, b, t) {
  const k = a + b + t;
  let v = MXM.get(k);
  if (v === undefined) { v = mix(a, b, t); if (MXM.size > 6000) MXM.clear(); MXM.set(k, v); }
  return v;
}

const LUM = new Map();
/** 相対輝度（0..1）。暗い服は影の代わりに明るい側のハイライトで形を見せる */
function lum(c) {
  let v = LUM.get(c);
  if (v === undefined) {
    v = 0.5;
    if (typeof c === 'string' && c[0] === '#') {
      const h = c.length === 4 ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(1, 7);
      const n = parseInt(h, 16);
      if (!Number.isNaN(n)) v = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    }
    if (LUM.size > 2000) LUM.clear();
    LUM.set(c, v);
  }
  return v;
}

// ---------------------------------------------------------------- 描画ステート
let FL = false;
const C = (c) => (FL ? '#ffffff' : c);
const OC = () => (FL ? '#ffd8ea' : OUTLINE);
const LINE = () => (FL ? '#ffd8ea' : '#3a1c40');      // 内側の細線
let RIM = '#8ff4ff';

// ---------------------------------------------------------------- レイヤー別描画（スプライトのテンプレート書き出し用）
// anim.onlyLayers = ['body'|'arm'|'hair_back'|'hair_front'|'face'|'top'|'sleeve'|'bottom'|'shoes'|'hat'|'accessory'|'weapon'|'tear', ...]
// 描画コードの各部品の直前で TAG（どのレイヤーか）を設定し、書き出し時だけ ctx を Proxy で包んで
//  - 選んだレイヤー: そのまま描く
//  - 合成順（SPRITE_LAYER_ORDER）で下にあるのにコードでは上に描かれる部品: destination-out で消す（＝隠れる部分を抜く）
//  - それ以外: 描かない
// 通常のゲーム描画では ONLY=null で、TAG の代入以外は何もしない。
export const SPRITE_LAYER_ORDER = ['accessory_back', 'hair_back', 'body', 'bottom', 'shoes', 'top', 'tear', 'face', 'hair_front', 'accessory', 'hat', 'arm', 'sleeve', 'weapon'];
const LRANK = Object.fromEntries(SPRITE_LAYER_ORDER.map((k, i) => [k, i]));
LRANK.fx = 99;
let TAG = 'body', ONLY = null, ONLY_RANK = 0, NO_ERASE = false;
// リグ（パーツ式）用のフラグ: 脚の先の靴を描かない / 頭に帽子・アクセサリを描かない（リグが絵で重ねる）
let RIG_NOSHOE = false, RIG_HEADITEMS = false;
function layerMode() {
  if (ONLY.has(TAG)) return 1;
  return !NO_ERASE && (LRANK[TAG] ?? 99) < ONLY_RANK ? 2 : 0;
}
const DRAW_OPS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'putImageData']);
function layerProxy(real) {
  return new Proxy(real, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      if (!DRAW_OPS.has(p)) return (...a) => v.apply(t, a);
      return (...a) => {
        const m = layerMode();
        if (m === 1) return v.apply(t, a);
        if (m === 2) { const op = t.globalCompositeOperation; t.globalCompositeOperation = 'destination-out'; v.apply(t, a); t.globalCompositeOperation = op; }
        return undefined;
      };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function setOnlyLayers(list, noErase) {
  if (!list) { ONLY = null; return; }
  const s = new Set();
  for (const n of list) {
    if (n === 'accessory') { s.add('accessory'); s.add('accessory_back'); } else if (n === 'accessory_front') s.add('accessory');
    else if (n === 'hair') { s.add('hair_back'); s.add('hair_front'); }
    else if (n === 'body') { s.add('body'); s.add('arm'); } else if (n === 'body_main') s.add('body');   // body = 素体（手前の腕込み）
    else if (n === 'top') { s.add('top'); s.add('sleeve'); } else if (n === 'top_main') s.add('top');    // top = 上着（手前の袖込み）
    else s.add(n);
  }
  ONLY = s; NO_ERASE = !!noErase;
  ONLY_RANK = Math.min(...[...s].map((n) => LRANK[n] ?? 99));
}
// 書き出し時だけ: 素体の腰（インナーのスパッツ）。通常はパンツ（bottom）の腰が覆う
function innerHips(ctx, K) {
  const hw = K.hw - 0.4;
  ctx.beginPath(); rrect(ctx, -hw, -5, hw * 2, 9.5, 3); fillStroke(ctx, INNER_BOT);
}

function fillStroke(ctx, col, lw = OLW) {
  ctx.fillStyle = C(col); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = lw; ctx.stroke();
}
/** 縁取り→塗りの順（重なった部品の内側の線が消える＝合成シルエット） */
function strokeFill(ctx, col, lw = OLW) {
  ctx.strokeStyle = OC(); ctx.lineWidth = lw * 2; ctx.stroke();
  ctx.fillStyle = C(col); ctx.fill();
}

// 肢: 2セグメント
const LP = { kx: 0, ky: 0, ex: 0, ey: 0 };
function limbPts(x0, y0, a, e, l1, l2) {
  LP.kx = x0 + Math.sin(a) * l1; LP.ky = y0 + Math.cos(a) * l1;
  const a2 = a + e;
  LP.ex = LP.kx + Math.sin(a2) * l2; LP.ey = LP.ky + Math.cos(a2) * l2;
}
const PT = { x: 0, y: 0, a: 0 };
function limbAt(x0, y0, a, e, l1, l2, d) {
  if (d <= l1) { PT.x = x0 + Math.sin(a) * d; PT.y = y0 + Math.cos(a) * d; PT.a = a; }
  else {
    const kx = x0 + Math.sin(a) * l1, ky = y0 + Math.cos(a) * l1;
    const dd = Math.min(d, l1 + l2) - l1;
    PT.x = kx + Math.sin(a + e) * dd; PT.y = ky + Math.cos(a + e) * dd; PT.a = a + e;
  }
}
// 区間 d0..d1 をセグメントに分割（最大2）
const SG = [new Float64Array(6), new Float64Array(6)];
let NSG = 0;
function buildSegs(x0, y0, a, e, l1, l2, d0, d1) {
  NSG = 0;
  const sa = Math.sin(a), ca = Math.cos(a);
  if (d0 < l1) {
    const s0 = d0, s1 = Math.min(d1, l1);
    if (s1 > s0) { const g = SG[NSG++]; g[0] = x0 + sa * s0; g[1] = y0 + ca * s0; g[2] = x0 + sa * s1; g[3] = y0 + ca * s1; g[4] = a; g[5] = 0; }
  }
  if (d1 > l1) {
    const kx = x0 + sa * l1, ky = y0 + ca * l1, sb = Math.sin(a + e), cb = Math.cos(a + e);
    const s0 = Math.max(d0, l1) - l1, s1 = Math.min(d1, l1 + l2) - l1;
    if (s1 > s0) { const g = SG[NSG++]; g[0] = kx + sb * s0; g[1] = ky + cb * s0; g[2] = kx + sb * s1; g[3] = ky + cb * s1; g[4] = a + e; g[5] = 1; }
  }
}
/** テーパー付きの肢（w1=1本目, w2=2本目）。shadeAmt>0 で影側にセル影の帯、hi でハイライト線 */
function limb(ctx, x0, y0, a, e, l1, l2, d0, d1, w1, w2, col, cap = 'round', shadeAmt = 0.16, hi = 0) {
  buildSegs(x0, y0, a, e, l1, l2, d0, d1);
  if (!NSG) return;
  ctx.lineCap = cap;
  ctx.strokeStyle = OC();
  for (let i = 0; i < NSG; i++) {
    const g = SG[i]; ctx.lineWidth = (g[5] ? w2 : w1) + OLW * 2;
    ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(g[2] + 0.001, g[3] + 0.001); ctx.stroke();
  }
  ctx.strokeStyle = C(col);
  for (let i = 0; i < NSG; i++) {
    const g = SG[i]; ctx.lineWidth = g[5] ? w2 : w1;
    ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(g[2] + 0.001, g[3] + 0.001); ctx.stroke();
  }
  const dkc = lum(col) < 0.2;
  if (!FL && (shadeAmt || hi || dkc)) {
    ctx.lineCap = 'butt';
    for (let i = 0; i < NSG; i++) {
      const g = SG[i], w = g[5] ? w2 : w1;
      let nx = Math.cos(g[4]), ny = -Math.sin(g[4]);
      if (nx + ny < 0) { nx = -nx; ny = -ny; } // 影は右下側
      const dx = g[2] - g[0], dy = g[3] - g[1], L = Math.hypot(dx, dy) || 1;
      const ux = dx / L * 0.5, uy = dy / L * 0.5;
      if (shadeAmt) {
        const bw = w * 0.36, off = w / 2 - bw / 2 - 0.05;
        ctx.strokeStyle = sh(col, -shadeAmt); ctx.lineWidth = bw;
        ctx.beginPath(); ctx.moveTo(g[0] + nx * off + ux, g[1] + ny * off + uy); ctx.lineTo(g[2] + nx * off - ux, g[3] + ny * off - uy); ctx.stroke();
      }
      if (dkc) {
        const bw = w * 0.3, off = -w / 2 + bw / 2 + 0.35;
        ctx.strokeStyle = sh(col, 0.32); ctx.lineWidth = bw;
        ctx.beginPath(); ctx.moveTo(g[0] + nx * off + ux, g[1] + ny * off + uy); ctx.lineTo(g[2] + nx * off - ux * 2, g[3] + ny * off - uy * 2); ctx.stroke();
      }
      if (hi) {
        const off = -w / 2 + 0.95;
        ctx.strokeStyle = ra('#ffffff', hi); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(g[0] + nx * off + ux * 2, g[1] + ny * off + uy * 2); ctx.lineTo(g[2] + nx * off - ux * 3, g[3] + ny * off - uy * 3); ctx.stroke();
      }
    }
  }
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
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.1; ctx.stroke();
}
// 袖口・裾のバンド
function cuffBand(ctx, x, y, ang, w, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-ang);
  ctx.beginPath(); rrect(ctx, -w / 2 - 0.4, -1.3, w + 0.8, 2.4, 1);
  ctx.fillStyle = C(col); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 0.9; ctx.stroke();
  ctx.restore();
}

function bandaid(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); rrect(ctx, -4, -1.5, 8, 3, 1.4);
  ctx.fillStyle = C('#f8cfa4'); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = C('#e8a87a'); ctx.fillRect(-1.3, -1.1, 2.6, 2.2);
  ctx.fillStyle = C('rgba(255,255,255,0.6)'); ctx.fillRect(-3.2, -1, 1.4, 0.7);
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function sparkle(ctx, x, y, r, col) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}

// ---------------------------------------------------------------- ポーズ
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeIn(t) { return t * t * t; }
/** ループ周期の整数倍に丸めた角速度（キャッシュの周期性のため） */
function om(w, rate) { return Math.max(1, Math.round(rate / w)) * w; }

// 状態ごとのループ（秒, キャッシュのフレーム数）。null はキャッシュしない（その場で描画）
const LOOPS = {
  idle: [LOOP, 24], walk: [0.6, 10], jump: [1.2, 8], climb: [0.9, 8], sit: [LOOP, 24], drive: [LOOP, 24], cheer: [1.2, 12],
};

function makePose(state, t, at, wk, ws, anim, w, f) {
  const P = {
    bob: 0, tilt: 0, hipY: 0, hx: 0, lb: [-0.06, 0], lf: [0.06, 0], ab: [-0.1, 0.25], af: [0.15, 0.45],
    eyes: 'n', mouth: 'n', brow: 'n', wAng: null, swoosh: null, back: false, lie: 0, headTilt: 0, hairSway: 0, hairLift: 0,
    showWeapon: true, muzzle: false, punch: false, sit: false, handF: wk === 'none' ? 'open' : 'grip', handB: 'open', twist: 0,
  };
  // 武器持ちの基本腕
  if (wk === 'melee') { P.af = [0.25, 0.75]; P.wAng = -1.15; }
  else if (wk === 'gun') { P.af = [0.45, 0.85]; }
  else if (wk === 'magic') { P.af = [0.3, 0.6]; P.wAng = -1.48; }
  switch (state) {
    case 'walk': {
      const ww = w; // 0.6s で1周（2歩）
      const s = Math.sin(t * ww), c = Math.cos(t * ww);
      // 人の歩き: 脚を前へ振り出す間（遊脚）だけ膝を大きく曲げ、着地〜後ろへ送る間（立脚）はほぼ伸ばす。
      // 脚の角度 amp·sin の増える側（cos > 0）が前へ振り出す時。かかと着地の直後に少しだけ膝を曲げて衝撃を受ける
      const amp = f ? 0.44 : 0.5;
      const knee = (q) => Math.max(0, q) ** 1.3 * 0.95 + Math.max(0, -q) * 0.12 + 0.06;
      P.lf = [amp * s, knee(c)]; P.lb = [-amp * s, knee(-c)];
      P.ab = [0.45 * s, 0.3 + Math.max(0, s) * 0.25];
      if (wk === 'none') { P.af = [-0.45 * s, 0.3 + Math.max(0, -s) * 0.25]; P.handF = 'fist'; } else P.af[0] += -0.18 * s;
      P.handB = 'fist';
      P.bob = -Math.abs(c) * 1.8 + 0.9; P.tilt = 0.07; P.twist = -s * 0.9;
      P.headTilt = Math.sin(t * ww * 2 - 1.1) * 0.025 - 0.02;
      P.hairSway = 0.55 + Math.sin(t * ww * 2 - 1.3) * 0.35;
      break;
    }
    case 'jump': {
      const q = Math.sin(t * om(w, 5));
      P.lf = [0.95, 1.35]; P.lb = [-0.15, 0.95];
      P.ab = [2.5, 0.45]; if (wk === 'none') { P.af = [-0.75, 0.6]; P.handF = 'open'; }
      P.handB = 'open';
      P.hairSway = 0.3 + q * 0.15; P.hairLift = 1; P.bob = -0.5; P.tilt = -0.03;
      P.mouth = 'o';
      break;
    }
    case 'climb': {
      const s = Math.sin(t * w);
      P.back = true; P.showWeapon = false;
      P.ab = [PI + 0.35 + 0.25 * s, -0.4]; P.af = [PI - 0.35 + 0.25 * s, 0.4];
      P.lb = [-0.15, 0.5 + 0.4 * s]; P.lf = [0.15, 0.5 - 0.4 * s];
      P.handF = P.handB = 'fist';
      break;
    }
    case 'cheer': {
      const s = Math.sin(t * w);
      P.ab = [2.75 + s * 0.15, 0.35]; P.af = wk === 'none' ? [-2.75 - s * 0.15, -0.35] : P.af;
      P.handF = wk === 'none' ? 'open' : 'grip'; P.handB = 'open';
      P.bob = -Math.abs(s) * 2; P.eyes = 'happy'; P.mouth = 'happy'; P.brow = 'up'; P.hairLift = Math.abs(s) * 0.5;
      break;
    }
    case 'attack': {
      P.mouth = 'shout'; P.eyes = 'fierce'; P.brow = 'angry';
      if (wk === 'none') {
        // ため → ジャブ（腰のひねり）
        if (at < 0.3) {
          const k = easeOut(at / 0.3);
          P.af = [lerp(0.3, -0.5, k), lerp(0.6, 1.9, k)]; P.ab = [lerp(-0.1, 0.9, k), 1.4];
          P.tilt = -0.08 * k; P.twist = -1.6 * k; P.hx = -1 * k; P.mouth = 'grit';
          P.lf = [0.3 * k, 0.15]; P.lb = [-0.3 * k, 0.35 * k];
        } else {
          const k = at < 0.5 ? easeIn((at - 0.3) / 0.2) : 1 - easeInOut((at - 0.5) / 0.5);
          P.af = [lerp(-0.5, PI / 2, k), lerp(1.9, 0, k)]; P.ab = [lerp(0.9, -0.8, k), 1.3];
          P.tilt = lerp(-0.08, 0.16, k); P.twist = lerp(-1.6, 1.4, k); P.hx = lerp(-1, 1.6, k);
          P.punch = k > 0.8; P.lf = [lerp(0.3, 0.55, k), lerp(0.15, 0.4, k)]; P.lb = [lerp(-0.3, -0.5, k), 0.05];
        }
        P.handF = 'fist'; P.handB = 'fist';
      } else if (wk === 'magic') {
        const k = at < 0.35 ? easeOut(at / 0.35) : 1 - easeInOut((at - 0.35) / 0.65);
        P.af = [lerp(0.3, 1.9, k), lerp(0.6, 0.1, k)]; P.wAng = lerp(-1.48, -0.55, k); P.ab = [lerp(-0.4, -0.9, k), 0.3];
        P.magicGlow = k; P.tilt = 0.08 * k; P.twist = k * 1.1; P.hx = k;
        P.lf = [0.35 * k, 0.2]; P.lb = [-0.25 * k, 0.1]; P.handB = 'open';
        P.hairSway = 0.4 * k;
      } else {
        let a, e = 0.2;
        if (at < 0.2) { const k = easeOut(at / 0.2); a = lerp(0.3, 3.5, k); P.tilt = -0.1 * k; P.twist = -1.4 * k; P.hx = -1.2 * k; P.mouth = 'grit'; P.lb = [-0.2, 0.45 * k]; P.lf = [0.35 * k, 0.15]; }
        else if (at < 0.55) { const k = easeInOut((at - 0.2) / 0.35); a = lerp(3.5, 0.45, k); P.tilt = lerp(-0.1, 0.16, k); P.twist = lerp(-1.4, 1.4, k); P.hx = lerp(-1.2, 1.6, k); P.lf = [lerp(0.35, 0.6, k), lerp(0.15, 0.45, k)]; P.lb = [lerp(-0.2, -0.5, k), lerp(0.45, 0.05, k)]; }
        else { const k = easeInOut((at - 0.55) / 0.45); a = lerp(0.45, 0.25, k); e = lerp(0.2, 0.75, k); P.tilt = lerp(0.16, 0.02, k); P.twist = lerp(1.4, 0.3, k); P.hx = lerp(1.6, 0.4, k); P.lf = [lerp(0.6, 0.4, k), lerp(0.45, 0.2, k)]; P.lb = [lerp(-0.5, -0.3, k), 0.1]; }
        P.af = [a, e]; P.ab = [-0.6, 0.5]; P.handB = 'fist';
        const blend = at < 0.06 ? at / 0.06 : at > 0.85 ? (1 - at) / 0.15 : 1;
        const fore = PI / 2 - (a + e);
        P.wAng = lerp(-1.15, fore, clamp(blend, 0, 1));
        P.hairSway = -P.twist * 0.25;
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
      P.handB = ws === 'smg' ? 'grip' : 'fist';
      P.muzzle = at > 0 && at < 0.25; P.eyes = 'aim'; P.brow = 'angry'; P.mouth = at < 0.3 ? 'grit' : 'smirk';
      P.tilt = -0.04 - kick * 0.2; P.twist = 0.8; P.hx = -kick * 2;
      P.lf = [0.32, 0.1]; P.lb = [-0.32, 0.12];
      break;
    }
    case 'hurt': {
      const k = clamp((anim.t || 0) * 6, 0, 1);
      P.tilt = -0.24 * (0.6 + 0.4 * k); P.headTilt = -0.16; P.hx = -1.4; P.eyes = 'hurt'; P.mouth = 'grit'; P.brow = 'worry';
      P.af = [2.1, 0.7]; P.ab = [-1.3, 0.5]; P.lf = [0.55, 0.7]; P.lb = [-0.1, 0.1];
      P.hairSway = -1.1; P.hairLift = 0.3; P.handF = 'open'; P.handB = 'open'; P.sweat = 1;
      if (wk !== 'none') P.handF = 'grip';
      break;
    }
    case 'dead': {
      const fv = anim.fallT != null ? anim.fallT : anim.deadT != null ? anim.deadT : clamp((anim.t || 0) * 3, 0, 1);
      P.lie = clamp(fv, 0, 1); P.eyes = 'x'; P.mouth = 'hurt'; P.brow = 'worry';
      P.af = [0.9, 0.4]; P.ab = [-0.9, 0.3]; P.lf = [0.1, 0.1]; P.lb = [-0.1, 0.2];
      break;
    }
    case 'drive':
      P.sit = true; P.hipY = 8; P.lf = [PI / 2 - 0.1, PI / 2 - 0.1]; P.lb = [PI / 2 - 0.2, PI / 2 - 0.2];
      P.af = [1.25, 0.35]; P.ab = [1.15, 0.4]; P.showWeapon = false; P.eyes = 'fierce'; P.brow = 'det'; P.mouth = 'smirk';
      P.handF = P.handB = 'fist'; P.hairSway = 0.5 + Math.sin(t * om(w, 3)) * 0.15;
      break;
    case 'sit':
      P.sit = true; P.hipY = 8; P.lf = [PI / 2 - 0.05, PI / 2 - 0.1]; P.lb = [PI / 2 - 0.25, PI / 2 - 0.25];
      P.ab = [0.25, 0.4]; if (wk === 'none') P.af = [0.45, 0.6];
      P.bob = Math.sin(t * om(w, 2.6)) * 0.4;
      break;
    default: { // idle: 呼吸と重心移動
      const br = Math.sin(t * om(w, 2.6));
      const sway = Math.sin(t * w);
      P.bob = br * 0.75; P.ab[0] += br * 0.035; P.af[0] -= br * 0.035;
      P.hx = sway * 0.45; P.tilt = sway * 0.012; P.headTilt = Math.sin(t * w + 0.8) * 0.03;
      P.hairSway = Math.sin(t * om(w, 2.6) - 0.9) * 0.25 + sway * 0.1;
      if (f) { P.lf = [0.1 + sway * 0.02, 0.18]; P.lb = [-0.03, 0.04]; }
      else { P.lf = [0.14, 0.08]; P.lb = [-0.13, 0.04]; }
    }
  }
  // 慌て顔（市民が逃げる時など）: anim.panic=true
  if (anim.panic && state !== 'dead') {
    P.eyes = 'panic'; P.mouth = 'panic'; P.brow = 'worry'; P.panic = true; P.showWeapon = false; P.handF = P.handB = 'open';
    const s = Math.sin(t * om(w, 16));
    if (state !== 'hurt') { P.ab = [2.7 + 0.35 * s, 0.5]; P.af = [2.5 - 0.35 * s, 0.5]; P.tilt = state === 'walk' ? 0.14 : 0.04; }
  }
  return P;
}

/** 表情（目/口/眉）を状態・ダメージ・anim.face から決める */
function resolveFace(P, K, anim) {
  const st = K.state, d = K.dmg;
  if (K.vil && !P.panic && st !== 'dead') {
    if (P.eyes === 'n' || P.eyes === 'tired') P.eyes = 'vil';
    if (P.brow === 'n') P.brow = 'angry';
    if (P.mouth === 'n' || P.mouth === 'o') P.mouth = K.f ? 'smirk' : 'grin';
  }
  if ((st === 'idle' || st === 'walk' || st === 'sit') && !P.panic) {
    if (d >= 0.75) { P.brow = 'worry'; P.eyes = 'tired'; P.mouth = st === 'walk' ? 'grit' : 'frown'; P.sweat = 1; }
    else if (d >= 0.5) { P.brow = 'det'; if (K.cool) P.mouth = 'flat'; }
  }
  const fc = anim.face;
  if (fc && st !== 'dead') {
    if (fc === 'happy') { P.eyes = 'happy'; P.mouth = 'happy'; P.brow = 'up'; }
    else if (fc === 'jito') { P.eyes = 'jito'; P.mouth = 'flat'; P.brow = 'flat'; }
    else if (fc === 'angry') { P.eyes = 'fierce'; P.mouth = 'grit'; P.brow = 'angry'; }
    else if (fc === 'sad') { P.eyes = 'tired'; P.mouth = 'frown'; P.brow = 'worry'; }
    else if (fc === 'wink') { P.eyes = 'wink'; P.mouth = 'happy'; P.brow = 'up'; }
    else if (fc === 'shout') { P.eyes = 'fierce'; P.mouth = 'shout'; P.brow = 'angry'; }
  }
}

// ---------------------------------------------------------------- メイン
// ヒーローが最後に描画された装備（乗車中の運転手表示用）
const LAST_EQUIP = new WeakMap();
export function lastHeroEquip(look) { return LAST_EQUIP.get(look) || null; }

// 半透明時は重なりが透けないよう一度オフスクリーンに描いてから合成する（キャッシュ外の状態のみ）
let OFF = null, OFFCTX = null;

// ---- フレームキャッシュ（2x のオフスクリーン、LRU、総画素数で上限）
//  キー: 状態＋フレーム番号（時間/攻撃進捗を量子化）＋ダメージ段階＋解像度＋flash/panic/表情＋look/装備の中身。
//  向き（facing）は描画時に左右反転するのでキーに含めない。半透明（alpha）は drawImage 時に掛けるので重なりも透けない。
//  加算合成のエフェクト（斬撃の軌跡・ホロ画面）はキャッシュに入れず、毎フレーム上から描く。
const SS = 2;                               // スーパーサンプリング倍率
const CACHE = new Map();
let cachePx = 0;
const CACHE_BUDGET = 16e6;                  // 総画素数の上限（約64MB）
const POOL = [];
let buildWin = 0, builds = 0;
const MAX_BUILDS = 8;                       // 1フレームあたりの新規キャッシュ作成数（超えたらその場で描く）
const HAS_CANVAS = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
// 攻撃系の量子化（attackT を n 段）、被弾（t を 0.05s 刻みで 6 段）
const QUANT = { attack: 16, shoot: 12, hurt: 6 };
function newCanvas(w, h) {
  for (let i = 0; i < POOL.length; i++) {
    const c = POOL[i];
    if (c.width === w && c.height === h) { POOL.splice(i, 1); return c; }
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function lookSig(l) {
  return (l.body || '') + (l.skin || '') + (l.hair || '') + (l.hairColor || '') + (l.eyeColor || '') + (l.expr || '') + (l.hairShadow || '') + (l.hairHi || '') + (l.hairTip || '') + (l.tie || '') + (l.mesh || '') + (l.rim || '') + (l.villain ? 'V' : '');
}

// ---- AIの頭（manifest の heads[<classId>_<gender>]）。主人公の look（classId・gender を持つ）だけに適用。
//  髪（前後）と顔はコードで描かず、頭の座標系（charHeadPose と同じ）に絵を置く。帽子・アクセサリは上に重ねる。
/** AIの頭の表情: 被弾=hurt、攻撃=shout、まばたき=blink（待機の周期）、レベルアップ/勝利=happy（anim.headExpr）、他は基本の絵 */
export function aiHeadExpr(state, t, A) {
  A = A || EMPTY;
  if (state === 'dead' || A.panic) return 'hurt';
  if (A.headExpr) return A.headExpr;
  const fc = A.face;
  if (fc === 'happy' || fc === 'wink') return 'happy';
  if (fc === 'shout' || fc === 'angry') return 'shout';
  if (fc === 'sad') return 'sad';
  if (state === 'attack' || state === 'shoot') return 'shout';
  if (state === 'hurt') return 'hurt';
  if (state === 'cheer') return 'happy';
  if (state === 'idle' || state === 'sit') {
    const ph = (((t || 0) % LOOP) + LOOP) % LOOP;
    if (ph >= 3.82 && ph < 4.0) return 'blink';
  }
  return null;
}
/** その look・姿勢で使う頭の絵（無い/読み込み中/壊れている/look.aiHead===false/NPC → null） */
export function aiHeadOf(look, A, state, t) {
  if (ONLY || !look || look.aiHead === false || !look.classId || !look.gender || look.villain) return null;
  return headFor(look.classId, look.gender, aiHeadExpr(state, t, A));
}
const EQK = ['hat', 'top', 'bottom', 'shoes', 'weapon', 'accessory'];
function eqSig(e) {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const v = e[EQK[i]];
    s += v ? (v.style || '') + (v.color || '') + (v.accent || '') + (v.rarity != null ? v.rarity : rarityOf(v)) + ',' : ',';
  }
  return s;
}
/** 装備からキャッシュ範囲（ローカル座標, scale 1）を見積もる */
function boxOf(equip, look, state, ah, rig) {
  let L = 34, R = 36, T = 98, Bm = 8;
  if (ah && ah.fit === false && ah.place) {
    // 配置図方式の頭（＋後ろ髪）: 頭の中心からの範囲（左右反転もあるので左右は同じ幅で）
    const k = (ah.scale || 1) * (rig ? 1 : 1.12), o = ah.offset || [0, 0], cy = rig ? -RIG_Y.hip - RIG_Y.head : 62;
    for (const pl of [ah.place, ah.back && ah.back.place]) {
      if (!pl) continue;
      const side = Math.max(-pl[0], pl[0] + pl[2]) * k + Math.abs(o[0]) + 6;
      L = Math.max(L, side); R = Math.max(R, side);
      T = Math.max(T, cy - pl[1] * k - o[1] + 6);
    }
  } else if (ah) { const k = ah.scale || 1, o = ah.offset || [0, 0]; L = Math.max(L, 30 * k - o[0] + 6); R = Math.max(R, 30 * k + o[0] + 6); T = Math.max(T, 62 + 27 * k - o[1] + 6); }
  const hs = look.hair;
  if (hs === 'twin' || hs === 'ponytail' || hs === 'braid' || hs === 'long' || hs === 'wolf' || hs === 'curly') L = 40;
  const acc = equip.accessory && equip.accessory.style;
  if (acc === 'wings') L = 46;
  if (acc === 'halo' || acc === 'wings') T = 104;
  if (acc === 'scarf') L = Math.max(L, 40);
  const hat = equip.hat && equip.hat.style;
  if (hat === 'crown' || hat === 'cowboy' || hat === 'catEars') T = Math.max(T, 104);
  if (hat === 'cowboy') { L = Math.max(L, 36); R = Math.max(R, 38); }
  const ws = equip.weapon && equip.weapon.style;
  if (ws) {
    const long = ws === 'staff' || ws === 'neonSword' || ws === 'katana' || ws === 'guitar';
    R = long ? 64 : ws === 'bat' ? 56 : 46;
    if (state === 'attack' || state === 'hurt') { T = Math.max(T, long ? 112 : 104); L = Math.max(L, long ? 46 : 40); }
  }
  if (state === 'hurt') L = Math.max(L, 42);
  if (state === 'climb') T = Math.max(T, 104);
  return [L, R, T, Bm];
}
function dmgStage(d) { return d >= 0.9 ? 7 : d >= 0.85 ? 6 : d >= 0.75 ? 5 : d >= 0.7 ? 4 : d >= 0.6 ? 3 : d >= 0.5 ? 2 : d >= 0.25 ? 1 : 0; }
const DMG_REP = [0, 0.3, 0.55, 0.65, 0.72, 0.8, 0.87, 0.95];
/** テスト・デバッグ用: キャッシュの状態 */
const CSTAT = { hit: 0, build: 0, direct: 0 };
export function characterCacheStats() { return { entries: CACHE.size, px: cachePx, budget: CACHE_BUDGET, ...CSTAT }; }
export function clearCharacterCache() { CACHE.clear(); cachePx = 0; POOL.length = 0; }

export function drawCharacter(ctx, x, y, look, equip, anim) {
  look = look || HERO_LOOKS.luna;
  equip = equip || EMPTY;
  if (anim && typeof anim === 'object') { const d = DRAWN.get(anim); if (!d || d.look !== look || d.equip !== equip) DRAWN.set(anim, { look, equip }); }
  const A = anim || EMPTY;
  if ((look === HERO_LOOKS.luna || look === HERO_LOOKS.jin) && A.state !== 'drive') LAST_EQUIP.set(look, equip);
  const alpha = A.alpha != null ? A.alpha : 1;
  if (alpha <= 0.01) return;
  let state = A.state || 'idle';
  const ws = equip.weapon && equip.weapon.style;
  const wk = !ws ? 'none' : (ws === 'pistol' || ws === 'smg') ? 'gun' : ws === 'staff' ? 'magic' : 'melee';
  if (state === 'attack' && wk === 'gun') state = 'shoot';
  if (state === 'shoot' && wk !== 'gun') state = 'attack';
  const s = A.scale || 1;
  const facing = A.facing < 0 ? -1 : 1;
  const auraT = A.aura && state !== 'drive' && state !== 'dead' ? clamp(A.auraTier || 1, 1, 4) | 0 : 0;
  const vil = !!(look.villain || A.villain || (A.deadT !== undefined && !look.expr));
  const lp = LOOPS[state], qn = QUANT[state];
  // ---- レイヤー別描画（スプライトのテンプレート書き出し用: anim.onlyLayers）
  if (A.onlyLayers) {
    setOnlyLayers(A.onlyLayers, A.noErase);
    TAG = 'body';
    ctx.save(); ctx.translate(x, y); ctx.scale(facing * s, s);
    try { renderChar(layerProxy(ctx), look, equip, Object.assign({}, A, { villain: vil, noFx: true }), state, ws, wk); }
    finally { ctx.restore(); setOnlyLayers(null); TAG = 'body'; }
    return;
  }
  // ---- リグ（パーツ式の着せ替え。manifest の rig に素体があり、必要な絵が読み込み済みのとき）。無ければ下の既存の経路
  const rig = A.rigCode ? rigCodePlanFor(look, equip) : !A.noSprite && !A.noRig ? rigPlanFor(look, equip) : null;
  const RENDER = rig
    ? (c, a2) => renderRig(c, look, equip, a2, state, ws, wk, rig)
    : (c, a2) => renderChar(c, look, equip, a2, state, ws, wk);
  // ---- 差し替えスプライト（assets/sprites/manifest.json に人型があり spriteMode='auto' のとき。無ければ下のコード描画）
  if (!A.noSprite && !rig) {
    const plan = spriteCharPlan(look, equip, A, state, wk, ws);
    if (plan) {
      if (auraT) { ctx.save(); ctx.translate(x, y); drawAuraBack(ctx, A.aura, auraT, A.t || 0, s); ctx.restore(); }
      drawSpriteCharPlan(ctx, x, y, plan, A);
      if ((state === 'attack' && wk !== 'none') || wk === 'magic') {
        ctx.save(); ctx.translate(x, y); ctx.scale(facing * s, s);
        if (alpha < 1) ctx.globalAlpha *= alpha;
        liveFx(ctx, look, equip, A, state, ws, wk, plan.repT, plan.repAT);
        ctx.restore();
      }
      if (auraT >= 2) { ctx.save(); ctx.translate(x, y); drawAuraFront(ctx, A.aura, auraT, A.t || 0, s); ctx.restore(); }
      return;
    }
  }
  // ---- キャッシュ経路
  if ((lp || qn) && HAS_CANVAS && !A.noCache && ctx.getTransform) {
    const m = ctx.getTransform();
    const k = Math.hypot(m.a, m.b);
    const kq = Math.max(0.5, Math.round(k * s * 8) / 8);
    const ss = kq <= 1.6 ? SS : kq <= 3.2 ? 1 : 0;
    if (ss) {
      const R = kq * ss;
      let fi, repT, repAT = 0;
      if (lp) {
        const tq = (((A.t || 0) % lp[0]) + lp[0]) % lp[0];
        fi = Math.floor(tq / lp[0] * lp[1]) % lp[1];
        repT = (fi + 0.5) / lp[1] * lp[0];
      } else if (state === 'hurt') {
        fi = Math.min(qn - 1, Math.floor(Math.max(0, A.t || 0) / 0.05));
        repT = (fi + 0.5) * 0.05;
      } else {
        fi = Math.min(qn - 1, Math.floor(clamp(A.attackT || 0, 0, 1) * qn));
        repAT = (fi + 0.5) / qn; repT = 0;
      }
      const dmg = clamp(A.damage || 0, 0, 1);
      const ds = dmgStage(dmg);
      const ah = aiHeadOf(look, A, state, repT);
      const key = state + fi + '|' + ds + '|' + R + '|' + (A.flash ? 1 : 0) + (A.panic ? 1 : 0) + (vil ? 1 : 0) + (A.face || '') + (A.rim || '') + '|' + lookSig(look) + '|' + eqSig(equip) + (ah ? '|H' + ah.file + (ah.back ? '+B' : '') : '') + (rig ? '|G' + rig.sig : '');
      let ent = CACHE.get(key);
      if (ent) { CACHE.delete(key); CACHE.set(key, ent); CSTAT.hit++; }
      else {
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        if (now - buildWin > 12) { buildWin = now; builds = 0; }
        if (builds < MAX_BUILDS) {
          builds++; CSTAT.build++;
          const bx = boxOf(equip, look, state, ah, !!rig);
          if (rig) { bx[0] += 6; bx[1] += 6; bx[2] += 6; bx[3] += 2; }
          const w = Math.ceil((bx[0] + bx[1]) * R), h = Math.ceil((bx[2] + bx[3]) * R);
          const cv = newCanvas(w, h);
          const oc = cv.getContext('2d');
          if (oc) {
            oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, w, h);
            oc.setTransform(R, 0, 0, R, bx[0] * R, bx[2] * R);
            const a2 = { state: A.state, t: repT, attackT: repAT, damage: DMG_REP[ds], flash: A.flash, panic: A.panic, face: A.face, headExpr: A.headExpr, rim: A.rim, villain: vil, facing: 1, scale: 1, noFx: true };
            RENDER(oc, a2);
            ent = { cv, w, h, R, ox: bx[0] * R, oy: bx[2] * R, repT, repAT };
            CACHE.set(key, ent); cachePx += w * h;
            while (cachePx > CACHE_BUDGET && CACHE.size > 1) {
              const [k0, e0] = CACHE.entries().next().value;
              CACHE.delete(k0); cachePx -= e0.w * e0.h;
              if (POOL.length < 16) POOL.push(e0.cv);
            }
          }
        }
      }
      if (ent) {
        if (auraT) { ctx.save(); ctx.translate(x, y); drawAuraBack(ctx, A.aura, auraT, A.t || 0, s); ctx.restore(); }
        ctx.save();
        ctx.translate(x, y);
        if (alpha < 1) ctx.globalAlpha *= alpha;
        const inv = s / ent.R;
        ctx.scale(facing * inv, inv);
        ctx.drawImage(ent.cv, -ent.ox, -ent.oy);
        ctx.restore();
        // 加算合成のエフェクトはライブで重ねる
        if ((state === 'attack' && wk !== 'none') || wk === 'magic') {
          ctx.save(); ctx.translate(x, y); ctx.scale(facing * s, s);
          if (alpha < 1) ctx.globalAlpha *= alpha;
          liveFx(ctx, look, equip, A, state, ws, wk, ent.repT, ent.repAT, !!rig);
          ctx.restore();
        }
        if (auraT >= 2) { ctx.save(); ctx.translate(x, y); drawAuraFront(ctx, A.aura, auraT, A.t || 0, s); ctx.restore(); }
        return;
      }
    }
  }
  CSTAT.direct++;
  const A2 = vil && !A.villain ? Object.assign({}, A, { villain: true }) : A;
  // ---- 直接描画（半透明時は一度オフスクリーンに描いて合成）
  if (alpha < 0.999 && HAS_CANVAS && ctx.getTransform) {
    const m = ctx.getTransform();
    const k = Math.min(4, Math.max(0.5, Math.hypot(m.a, m.b)));
    const w = Math.ceil(240 * s * k), h = Math.ceil(180 * s * k);
    if (!OFF) {
      OFF = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      OFFCTX = OFF.getContext('2d');
    }
    if (OFF.width < w || OFF.height < h) { OFF.width = Math.max(OFF.width, w); OFF.height = Math.max(OFF.height, h); }
    const oc = OFFCTX;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.clearRect(0, 0, w, h);
    oc.setTransform(k, 0, 0, k, w / 2, h * 0.72);
    if (auraT) drawAuraBack(oc, A.aura, auraT, A.t || 0, s);
    oc.scale(facing * s, s);
    RENDER(oc, A2);
    oc.setTransform(k, 0, 0, k, w / 2, h * 0.72);
    if (auraT >= 2) drawAuraFront(oc, A.aura, auraT, A.t || 0, s);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(1 / k, 1 / k);
    ctx.drawImage(OFF, 0, 0, w, h, -w / 2, -h * 0.72, w, h);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (auraT) drawAuraBack(ctx, A.aura, auraT, A.t || 0, s);
  ctx.scale(facing * s, s);
  RENDER(ctx, A2);
  ctx.restore();
  if (auraT >= 2) { ctx.save(); ctx.translate(x, y); drawAuraFront(ctx, A.aura, auraT, A.t || 0, s); ctx.restore(); }
}

/** キャッシュ描画時の加算エフェクト（斬撃の軌跡・ホロ画面）だけを描く */
function liveFx(ctx, look, equip, anim, state, ws, wk, repT, repAT, rig) {
  const f = look.body === 'f';
  const B = rig ? (f ? RIG_B.f : RIG_B.m) : f ? BODY.f : BODY.m;
  const lp = LOOPS[state];
  const w = TAU / (lp ? lp[0] : LOOP);
  const at = state === 'attack' || state === 'shoot' ? repAT : clamp(anim.attackT || 0, 0, 1);
  const P = makePose(state, repT, at, wk, ws, anim, w, f);
  if (P.back || (!P.swoosh && wk !== 'magic')) return;
  P.hipY += B.hipY;
  const K = { P, B, eq: equip, ws, wk, state, at, t: anim.t || 0, w, f };
  FL = !!anim.flash;
  ctx.translate(P.hx, P.hipY + P.bob);
  ctx.rotate(P.tilt);
  const sxF = B.sx - 0.4 + P.twist * 0.5;
  if (P.swoosh) drawSwoosh(ctx, K, sxF, (rig ? RIG_Y.shoulder : SHOULDER_Y) + 0.5);
  if (wk === 'magic' && !FL) drawHoloPanel(ctx, K);
  FL = false;
}

/**
 * スプライト合成用: 頭の座標系（顔シートの基準点）を返す。原点=足元・右向き・scale 1。
 * 戻り値 { m: [a,b,c,d,e,f], back } — back=true（ロープ登りの背面）は顔を描かない。
 */
export function charHeadPose(look, equip, anim) {
  look = look || HERO_LOOKS.luna; equip = equip || EMPTY;
  const A = anim || EMPTY;
  let state = A.state || 'idle';
  const ws = equip.weapon && equip.weapon.style;
  const wk = !ws ? 'none' : (ws === 'pistol' || ws === 'smg') ? 'gun' : ws === 'staff' ? 'magic' : 'melee';
  if (state === 'attack' && wk === 'gun') state = 'shoot';
  if (state === 'shoot' && wk !== 'gun') state = 'attack';
  const lp = LOOPS[state];
  const w = TAU / (lp ? lp[0] : LOOP);
  const f = look.body === 'f';
  const B = f ? BODY.f : BODY.m;
  const P = makePose(state, A.t || 0, clamp(A.attackT || 0, 0, 1), wk, ws, A, w, f);
  const m = [1, 0, 0, 1, 0, 0];
  const tr = (x, y) => { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; };
  const ro = (r) => { const c = Math.cos(r), s = Math.sin(r); const a = m[0], b = m[1], cc = m[2], d = m[3]; m[0] = a * c + cc * s; m[1] = b * c + d * s; m[2] = cc * c - a * s; m[3] = d * c - b * s; };
  if (P.lie) { tr(34 * P.lie, -9 * P.lie); ro(-PI / 2 * P.lie); }
  tr(P.hx, P.hipY + B.hipY + P.bob); ro(P.tilt);
  tr(P.twist * 0.25, HEAD_Y + (f ? 0.6 : 0)); ro(P.headTilt);
  if (B.head !== 1) { m[0] *= B.head; m[1] *= B.head; m[2] *= B.head; m[3] *= B.head; }
  return { m, back: !!P.back, state, wk };
}

/** 描画の文脈 K（renderChar / リグ / リグのコード部品で共通） */
function makeK(look, equip, anim, state, ws, wk, P, t, at, w, rig) {
  const f = look.body === 'f';
  const B = rig ? (f ? RIG_B.f : RIG_B.m) : f ? BODY.f : BODY.m;
  const dmg = clamp(anim.damage || 0, 0, 1);
  const cool = look.expr === 'cool' || (!look.expr && look.body === 'm');
  const vil = !!anim.villain;
  const K = {
    look, eq: equip, dmg, t, P, ws, wk, state, at, f, B, cool, w, anim, vil,
    skin: look.skin || '#ffe0cc',
    hair: look.hairColor || '#5a3a2a',
    topS: equip.top ? equip.top.style : 'tshirt',
    topC: equip.top ? itemColors(equip.top) : ['#f6f4f8', look.body === 'f' ? '#ff5fa2' : '#19d3c5'],
    botS: equip.bottom ? equip.bottom.style : 'shorts',
    botC: equip.bottom ? itemColors(equip.bottom) : ['#4d6fb5', '#ffffff'],
    rTop: rarityOf(equip.top), rBot: rarityOf(equip.bottom), rHat: rarityOf(equip.hat), rShoe: rarityOf(equip.shoes),
  };
  K.defaultTop = !equip.top;
  K.sw = B.sw; K.ww = B.ww; K.hw = B.hw;
  K.skinSh = sh(K.skin, -0.12);
  K.skinSh2 = sh(K.skin, -0.2);
  K.rig = !!rig;
  K.shY = rig ? RIG_Y.shoulder : SHOULDER_Y;
  K.headY = rig ? RIG_Y.head : HEAD_Y + (f ? 0.6 : 0);
  return K;
}

/** 原点=足元・向き=右・scale 1 の座標系で描く */
function renderChar(ctx, look, equip, anim, state, ws, wk) {
  const lp = LOOPS[state];
  const w = TAU / (lp ? lp[0] : LOOP);
  const t = anim.t || 0;
  const at = clamp(anim.attackT || 0, 0, 1);
  const f = look.body === 'f';
  const B = f ? BODY.f : BODY.m;
  const P = makePose(state, t, at, wk, ws, anim, w, f);
  const dmg = clamp(anim.damage || 0, 0, 1);
  const cool = look.expr === 'cool' || (!look.expr && look.body === 'm');
  // 悪役（敵の人型: enemyArt は deadT を渡し、look.expr を持たない）→ 目つき鋭く
  const vil = !!anim.villain;
  const K = {
    look, eq: equip, dmg, t, P, ws, wk, state, at, f, B, cool, w, anim, vil,
    skin: look.skin || '#ffe0cc',
    hair: look.hairColor || '#5a3a2a',
    topS: equip.top ? equip.top.style : 'tshirt',
    topC: equip.top ? itemColors(equip.top) : ['#f6f4f8', look.body === 'f' ? '#ff5fa2' : '#19d3c5'],
    botS: equip.bottom ? equip.bottom.style : 'shorts',
    botC: equip.bottom ? itemColors(equip.bottom) : ['#4d6fb5', '#ffffff'],
    rTop: rarityOf(equip.top), rBot: rarityOf(equip.bottom), rHat: rarityOf(equip.hat), rShoe: rarityOf(equip.shoes),
  };
  K.defaultTop = !equip.top;
  K.sw = B.sw; K.ww = B.ww; K.hw = B.hw;
  K.skinSh = sh(K.skin, -0.12);
  K.skinSh2 = sh(K.skin, -0.2);
  K.rig = false; K.shY = SHOULDER_Y; K.headY = HEAD_Y + (f ? 0.6 : 0);
  P.hipY += B.hipY;
  resolveFace(P, K, anim);
  K.ai = vil ? null : aiHeadOf(look, anim, state, t);
  FL = !!anim.flash;
  RIM = anim.rim || look.rim || (f ? '#9ff4ff' : '#8fe8ff');
  // 地面の影
  TAG = 'body';
  if (state !== 'drive' && !P.lie) {
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 3.2, 0, 0, TAU);
    ctx.fillStyle = 'rgba(20,0,30,0.28)'; ctx.fill();
  }
  ctx.save();
  if (P.lie) {
    ctx.translate(34 * P.lie, -9 * P.lie);
    ctx.rotate(-PI / 2 * P.lie);
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (P.back) drawBackView(ctx, K);
  else drawFrontView(ctx, K);
  ctx.restore();
  FL = false;
}

// ---------------------------------------------------------------- オーラ（職の色。tier 1〜4 で段階的に）
function auraFlame(ctx, w, h, t, ph) {
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
  const R = (16 + tier * 4) * pulse;
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.6);
  g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.6, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.6, R * 0.45, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1.4;
  const rk = (t * 0.9) % 1;
  ctx.globalAlpha = 1 - rk;
  ctx.beginPath(); ctx.ellipse(0, 0, 10 + rk * 18, 3 + rk * 5, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  if (tier >= 4) {
    ctx.save(); ctx.scale(1, 0.28); ctx.rotate(t * 0.9);
    ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 1.6 / 0.6;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * PI / 3; ctx.moveTo(Math.cos(a) * 27, Math.sin(a) * 27); ctx.lineTo(Math.cos(a + PI * 2 / 3) * 27, Math.sin(a + PI * 2 / 3) * 27); }
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.8);
    for (let i = 0; i < 12; i++) { const a = i * PI / 6; ctx.fillRect(Math.cos(a) * 30.5 - 1, Math.sin(a) * 30.5 - 1, 2, 2); }
    ctx.restore();
  }
  if (tier >= 3) {
    ctx.fillStyle = rgba(col, 0.22 + (tier >= 4 ? 0.08 : 0));
    auraFlame(ctx, 24, 92 + tier * 4, t, 0); ctx.fill();
    ctx.fillStyle = rgba(col, 0.2);
    auraFlame(ctx, 16, 76, t * 1.3, 2); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.08);
    auraFlame(ctx, 10, 56, t * 1.6, 4); ctx.fill();
  }
  if (tier >= 2) {
    ctx.fillStyle = rgba(col, 0.9);
    const n = tier >= 4 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.7 + i / n) % 1;
      const x = Math.sin(i * 2.4 + t * 0.5) * (12 + (i % 3) * 4);
      const y = -ph * (60 + tier * 8);
      const r = (1.4 + (i % 2)) * Math.sin(ph * PI);
      ctx.beginPath(); ctx.arc(x, y, r + 0.3, 0, TAU); ctx.fill();
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
    ctx.fillStyle = rgba(col, 0.12 + Math.sin(t * 6) * 0.04);
    ctx.fillRect(-20, -100, 3, 100); ctx.fillRect(17, -86, 2, 86); ctx.fillRect(-4, -110, 2, 110);
  }
  ctx.restore();
}

// 上半身フレームへ
function enterUpper(ctx, P) {
  ctx.save();
  ctx.translate(P.hx, P.hipY + P.bob);
  ctx.rotate(P.tilt);
}
function enterHead(ctx, K) {
  const P = K.P;
  ctx.save();
  if (K.rig && K.ai) { enterAiNeck(ctx, K); return; }
  ctx.translate(P.twist * 0.25, K.headY != null ? K.headY : HEAD_Y + (K.f ? 0.6 : 0));
  ctx.rotate(P.headTilt);
  if (K.B.head !== 1) ctx.scale(K.B.head, K.B.head);
}
/**
 * 画像の頭（リグ）: 首の付け根を支点に回す。1枚絵の頭は表情も角度も変わらないので、
 * 体の動きに少し遅れて・大きめに頭を振る（うなずき・攻撃の踏み込み・被弾ののけぞり）＋ひねりで横に少し縮めて「振り向き」に見せる
 */
function enterAiNeck(ctx, K) {
  const P = K.P, t = K.t || 0, w = K.w || 1, st = K.state;
  let a = P.headTilt * 1.6 + P.tilt * 0.55, dy = 0;
  if (st === 'walk') { a += Math.sin(t * w * 2 - 0.6) * 0.05; dy = -Math.abs(Math.cos(t * w)) * 0.6 + 0.3; }
  else if (st === 'attack' || st === 'shoot') a += P.twist * 0.05 + P.hx * 0.02;
  else if (st === 'jump') { a -= 0.07; dy = -0.6; }
  else if (st === 'hurt') a -= 0.12;
  else if (st === 'cheer') a -= 0.08;
  else if (!P.sit && !P.lie) a += Math.sin(t * w * 1.3) * 0.025;
  a = clamp(a, -0.4, 0.4);
  const ny = RIG_Y.neck - K.headY;                     // 頭の中心 → 首の付け根（下が正）
  ctx.translate(P.twist * 0.35, K.headY + ny + dy);
  ctx.rotate(a);
  const turn = Math.min(0.09, Math.abs(P.twist) * 0.05);
  if (turn) ctx.scale(1 - turn, 1);
  ctx.translate(0, -ny);
}
/** リグの頭の座標（v2）で、コードの頭・帽子を描く座標系に入る（コード描画の時は何もしない）。restore は呼び出し側 */
function enterCodeHead(ctx, K) {
  ctx.save();
  if (K.rig) { ctx.translate(0, RIG_CODE_HEAD.dy); ctx.scale(RIG_CODE_HEAD.s, RIG_CODE_HEAD.s); }
}

function drawFrontView(ctx, K) {
  const P = K.P, eq = K.eq, B = K.B;
  const tw = P.twist;
  // 肩のひねり: 前肩が前へ・奥肩が後ろへ
  const sxF = B.sx - 0.4 + tw * 0.5, sxB = -B.sx - tw * 0.35;
  // ---- 背面レイヤー
  enterUpper(ctx, P);
  TAG = 'accessory_back';
  if (eq.accessory && eq.accessory.style === 'wings') drawWings(ctx, K);
  if (eq.accessory && eq.accessory.style === 'scarf') drawScarfTail(ctx, K);
  TAG = 'hair_back';
  if (!K.ai) { enterHead(ctx, K); drawHairBack(ctx, K); ctx.restore(); }
  else if (K.ai.back) { enterHead(ctx, K); paintAiHeadBack(ctx, K.ai, eq.hat && eq.hat.style, P, FL, 'code'); ctx.restore(); }
  TAG = 'top';
  if (K.topS === 'hoodie') drawHood(ctx, K);
  drawArm(ctx, K, false, sxB, SHOULDER_Y + 0.3, P.ab[0], P.ab[1]);
  ctx.restore();
  // ---- 脚
  const lx = B.legX;
  drawLeg(ctx, K, false, -lx + P.hx * 0.3, P.hipY, P.lb[0], P.lb[1]);
  drawLeg(ctx, K, true, lx + P.hx * 0.3, P.hipY, P.lf[0], P.lf[1]);
  // ---- 腰・胴
  enterUpper(ctx, P);
  if (ONLY) { TAG = 'body'; innerHips(ctx, K); }
  TAG = 'bottom';
  drawHips(ctx, K);
  if (K.botS === 'skirt') drawSkirt(ctx, K, K.botC, false);
  TAG = 'top';
  if (K.topS === 'idolDress') drawSkirt(ctx, K, K.topC, true);
  drawTorso(ctx, K);
  TAG = 'accessory';
  if (eq.accessory) {
    const st = eq.accessory.style;
    if (st === 'goldChain') drawChain(ctx, K);
    if (st === 'scarf') drawScarfFront(ctx, K);
  }
  // ---- 頭
  enterHead(ctx, K);
  if (K.ai) drawAiHead(ctx, K); else drawHead(ctx, K);
  ctx.restore();
  // ---- 前腕＋武器
  drawArm(ctx, K, true, sxF, SHOULDER_Y + 0.6, P.af[0], P.af[1]);
  TAG = 'fx';
  if (!K.anim.noFx) {
    if (P.swoosh) drawSwoosh(ctx, K, sxF, SHOULDER_Y + 0.5);
    if (K.wk === 'magic' && !FL) drawHoloPanel(ctx, K);
  }
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
    ctx.strokeStyle = rgba(col, 0.55 + Math.sin(t * om(K.w, 5)) * 0.2); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 1.6, 0.4, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawBackView(ctx, K) {
  const P = K.P, eq = K.eq, B = K.B;
  drawLeg(ctx, K, false, -B.legX, P.hipY, P.lb[0], P.lb[1]);
  drawLeg(ctx, K, true, B.legX, P.hipY, P.lf[0], P.lf[1]);
  enterUpper(ctx, P);
  if (ONLY) { TAG = 'body'; innerHips(ctx, K); }
  TAG = 'bottom';
  drawHips(ctx, K);
  if (K.botS === 'skirt') drawSkirt(ctx, K, K.botC, false);
  TAG = 'top';
  if (K.topS === 'idolDress') drawSkirt(ctx, K, K.topC, true);
  drawTorso(ctx, K, true);
  TAG = 'top';
  if (K.topS === 'hoodie') drawHood(ctx, K, true);
  TAG = 'accessory';
  if (eq.accessory && eq.accessory.style === 'wings') drawWings(ctx, K, true);
  enterHead(ctx, K);
  if (K.ai) { drawAiHeadImage(ctx, K, true); if (K.ai.back) paintAiHeadBack(ctx, K.ai, eq.hat && eq.hat.style, P, FL, 'code', true); }
  else {
    TAG = 'body';
    ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 15.5, 0, 0, TAU);
    fillStroke(ctx, K.skin);
    TAG = 'hair_front';
    drawHairBack(ctx, K, true);
  }
  TAG = 'hat';
  drawHat(ctx, K, true);
  ctx.restore();
  drawArm(ctx, K, false, -B.sx, SHOULDER_Y, P.ab[0], P.ab[1]);
  drawArm(ctx, K, true, B.sx, SHOULDER_Y, P.af[0], P.af[1]);
  ctx.restore();
}

// ---------------------------------------------------------------- 脚
function drawLeg(ctx, K, front, hx, hy, a, k) {
  const B = K.B;
  const e = -k; // 膝は後ろへ曲がる
  const T = B.thigh, S = B.shin, L = T + S;
  const w1 = B.legW - 0.6, w2 = B.legW2 - 0.4;
  const skin = front ? K.skin : K.skinSh;
  const dark = front ? 0 : -0.12;
  TAG = 'body';
  limb(ctx, hx, hy, a, e, T, S, 0, L, w1, w2, skin, 'round', 0.1);
  TAG = 'bottom';
  const bs = K.botS;
  const [bc, ba] = K.botC;
  const dmg = K.dmg;
  if (bs === 'skirt' || K.topS === 'idolDress') {
    // スパッツ（スカート時は常に）
    limb(ctx, hx, hy, a, e, T, S, 0, T * 0.62, w1 + 0.6, w2, sh(INNER_BOT, dark), 'round', 0);
  }
  if (LONG_PANTS[bs]) {
    const wide = bs === 'cargo' ? 1.4 : bs === 'suitPants' ? -0.2 : bs === 'armorPants' ? 1 : 0.4;
    const col = sh(bc, dark);
    let end = L - 0.5;
    const torn = dmg >= 0.5;
    if (torn) end = L - 3.5;
    limb(ctx, hx, hy, a, e, T, S, 0, end, w1 + 0.8 + wide, w2 + 1 + wide * 0.8, col, torn ? 'butt' : 'round', 0.2, front ? 0.22 : 0);
    if (torn) { limbAt(hx, hy, a, e, T, S, end); jagEnd(ctx, PT.x, PT.y, PT.a, w2 + 1 + wide * 0.8, col); }
    else if (bs === 'jeans') { limbAt(hx, hy, a, e, T, S, end - 1.2); cuffBand(ctx, PT.x, PT.y, PT.a, w2 + 1.2 + wide, sh(bc, 0.25 + dark)); }
    else if (bs === 'trackPants') { limbAt(hx, hy, a, e, T, S, end - 1.0); cuffBand(ctx, PT.x, PT.y, PT.a, w2 + 1 + wide, sh(bc, -0.25 + dark)); }
    // ディテール
    ctx.lineWidth = ILW;
    if (bs === 'trackPants') {
      ctx.strokeStyle = C(sh(ba, dark)); ctx.lineWidth = 1.3; ctx.beginPath();
      limbAt(hx - 1.6, hy, a, e, T, S, 1); ctx.moveTo(PT.x, PT.y);
      limbPts(hx - 1.6, hy, a, e, T, S); ctx.lineTo(LP.kx, LP.ky);
      limbAt(hx - 1.6, hy, a, e, T, S, end - 2.4); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    } else if (bs === 'cargo') {
      limbAt(hx, hy, a, e, T, S, T * 0.65);
      ctx.save(); ctx.translate(PT.x - 0.6, PT.y); ctx.rotate(-PT.a);
      ctx.beginPath(); rrect(ctx, -2.4, -2.2, 4.8, 4.6, 0.8); fillStroke(ctx, sh(bc, -0.12 + dark), 0.9);
      ctx.strokeStyle = C(sh(bc, -0.35 + dark)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-2.2, -0.8); ctx.lineTo(2.2, -0.8); ctx.stroke();
      ctx.restore();
    } else if (bs === 'armorPants') {
      limbPts(hx, hy, a, e, T, S);
      ctx.beginPath(); ctx.ellipse(LP.kx + 0.6, LP.ky, 3.8, 3.4, 0, 0, TAU); fillStroke(ctx, sh(ba, dark), 1.1);
      ctx.strokeStyle = C(ra('#ffffff', 0.4)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(LP.kx, LP.ky - 0.4, 2.2, -2.6, -1.2); ctx.stroke();
    } else if (bs === 'jeans' || bs === 'suitPants') {
      ctx.strokeStyle = C(bs === 'jeans' ? ra(ba, 0.55) : sh(bc, 0.25)); ctx.lineWidth = 0.7; ctx.beginPath();
      limbAt(hx - 1.4, hy, a, e, T, S, 2); ctx.moveTo(PT.x, PT.y);
      limbAt(hx - 1.4, hy, a, e, T, S, end - 2); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    }
    // 破れ: 膝の擦れ→穴（スパッツが見える）
    TAG = 'tear';
    if (dmg >= 0.25) {
      limbPts(hx, hy, a, e, T, S);
      ctx.fillStyle = C('rgba(60,40,50,0.25)');
      ctx.beginPath(); ctx.ellipse(LP.kx + 0.5, LP.ky + 2.5, 2.4, 1.6, 0, 0, TAU); ctx.fill();
    }
    if (dmg >= (front ? 0.5 : 0.75)) {
      limbPts(hx, hy, a, e, T, S);
      ctx.save(); ctx.translate(LP.kx + 0.3, LP.ky - 0.4);
      ctx.beginPath(); polyPath(ctx, KNEE_HOLES[front ? 0 : 1]);
      fillStroke(ctx, INNER_BOT, 0.9);
      ctx.strokeStyle = C(ra('#ffffff', 0.5)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-2, 9); ctx.lineTo(-3, 10.4); ctx.moveTo(2, 9.4); ctx.lineTo(2.8, 10.8); ctx.stroke();
      ctx.restore();
    }
  } else if (bs === 'shorts') {
    const col = sh(bc, dark);
    const torn = dmg >= 0.5;
    const end = torn ? T * 0.9 : T * 1.0;
    limb(ctx, hx, hy, a, e, T, S, 0, end, w1 + 2, w1 + 2, col, torn ? 'butt' : 'round', 0.2, front ? 0.2 : 0);
    if (torn) { limbAt(hx, hy, a, e, T, S, end); jagEnd(ctx, PT.x, PT.y, PT.a, w1 + 2, col, 1.8); }
    else {
      limbAt(hx, hy, a, e, T, S, end - 0.4);
      cuffBand(ctx, PT.x, PT.y, PT.a, w1 + 2, sh(K.eq.bottom ? ba : bc, K.eq.bottom ? dark : 0.25 + dark));
    }
  }
  // 絆創膏（膝）
  TAG = 'tear';
  if (dmg >= 0.9 && front && !LONG_PANTS[bs]) {
    limbPts(hx, hy, a, e, T, S);
    bandaid(ctx, LP.kx + 0.5, LP.ky + 1.5, 0.5);
  }
  // 靴
  TAG = 'shoes';
  if (RIG_NOSHOE) return;
  limbPts(hx, hy, a, e, T, S);
  drawShoe(ctx, K, LP.ex, LP.ey, a + e, front);
}

function drawShoe(ctx, K, x, y, ang, front) {
  const sh0 = K.eq.shoes;
  const st = sh0 ? sh0.style : null;
  const [c, ac] = sh0 ? itemColors(sh0) : ['#5b5266', '#8a7f99'];
  const dk = front ? 0 : -0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-ang * 0.85);
  if (!K.f) ctx.scale(1.08, 1.05);
  const col = sh(c, dk), acc = sh(ac, dk);
  ctx.beginPath();
  switch (st) {
    case 'boots':
      ctx.moveTo(-3.4, -7); ctx.lineTo(2.6, -7); ctx.lineTo(3, -1.6);
      ctx.quadraticCurveTo(7, -1.2, 7, 1.4); ctx.lineTo(7, 2.8); ctx.lineTo(-3.8, 2.8); ctx.closePath();
      fillStroke(ctx, col, 1.6);
      ctx.fillStyle = C(acc); ctx.fillRect(-3.6, 1.2, 10.4, 1.6);
      ctx.fillRect(-3.2, -5.5, 6, 1.3);
      ctx.fillStyle = C(sh(col, -0.2)); ctx.fillRect(0.6, -6.4, 1.6, 5);
      if (K.rShoe >= 3) { ctx.fillStyle = C(ra('#ffffff', 0.6)); ctx.fillRect(-2.4, -4.8, 1, 3.6); }
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
      ctx.strokeStyle = C(sh(col, 0.4)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.5, -1.6); ctx.quadraticCurveTo(2, -2.5, 4.5, -0.6); ctx.stroke();
      ctx.fillStyle = C(ra('#ffffff', 0.55)); ctx.beginPath(); ctx.ellipse(5.2, -0.2, 1.1, 0.5, 0.4, 0, TAU); ctx.fill();
      break;
    case 'heels':
      ctx.moveTo(-3, -2.4); ctx.quadraticCurveTo(1, -2.8, 3.6, -0.6); ctx.quadraticCurveTo(6.6, 0.8, 6.6, 2.6); ctx.lineTo(1.5, 2.6);
      ctx.quadraticCurveTo(0, 0.8, -1.8, 0.8); ctx.lineTo(-2.2, 2.8); ctx.lineTo(-3.4, 2.8); ctx.closePath(); fillStroke(ctx, col, 1.5);
      ctx.fillStyle = C(acc); ctx.beginPath(); ctx.arc(2.2, -1.2, 1, 0, TAU); ctx.fill();
      ctx.fillStyle = C(ra('#ffffff', 0.7)); ctx.beginPath(); ctx.ellipse(4.4, 0.4, 1, 0.45, 0.5, 0, TAU); ctx.fill();
      if (K.rShoe >= 3 && !FL) sparkle(ctx, 5.6, -1.6, 1.6, '#ffffff');
      break;
    default: // sneakers / 素
      ctx.moveTo(-3.4, -2.6); ctx.quadraticCurveTo(0, -3.8, 2.6, -2.4); ctx.quadraticCurveTo(7.4, -1.2, 7.2, 1.6);
      ctx.lineTo(7.2, 2.8); ctx.lineTo(-3.8, 2.8); ctx.closePath(); fillStroke(ctx, col, 1.6);
      ctx.beginPath(); ctx.moveTo(-3.8, 1.1); ctx.lineTo(7.2, 1.1); ctx.lineTo(7.2, 2.8); ctx.lineTo(-3.8, 2.8); ctx.closePath();
      ctx.fillStyle = C(st === 'sneakers' ? (c === '#ffffff' || c === '#f4f4f4' ? acc : '#ffffff') : sh(col, -0.3)); ctx.fill();
      if (st === 'sneakers') {
        ctx.strokeStyle = C(acc); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-1.8, -0.4); ctx.quadraticCurveTo(2, 0.6, 5, -0.8); ctx.stroke();
        ctx.fillStyle = C('#ffffff'); ctx.fillRect(0.4, -2.8, 1, 1); ctx.fillRect(2.2, -2.3, 1, 1);
        if (K.rShoe >= 2) { ctx.fillStyle = C(ra(acc, 0.9)); ctx.fillRect(-3.4, 2.1, 10.4, 0.8); }
      }
      ctx.fillStyle = C(ra('#ffffff', 0.45)); ctx.beginPath(); ctx.ellipse(-0.6, -2.2, 1.6, 0.55, -0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3.8, 1.1); ctx.lineTo(7.2, 1.1); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 腰（パンツの腰部分）
function drawHips(ctx, K) {
  const bs = K.botS, [bc, ba] = K.botC;
  const hw = K.hw - 0.4;
  ctx.beginPath(); rrect(ctx, -hw, -5, hw * 2, 9.5, 3);
  if (bs === 'skirt' || K.topS === 'idolDress') fillStroke(ctx, INNER_BOT);
  else {
    fillStroke(ctx, bc);
    ctx.save(); ctx.clip();
    ctx.fillStyle = C(sh(bc, -0.18)); ctx.fillRect(hw * 0.3, -5, hw, 10);
    if (lum(bc) < 0.2) { ctx.fillStyle = C(sh(bc, 0.3)); ctx.fillRect(-hw - 1, -5, hw * 0.55, 10); }
    ctx.restore();
    if (bs === 'jeans' || bs === 'cargo') {
      ctx.strokeStyle = C(sh(bc, -0.3)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0.5, -1); ctx.lineTo(0.5, 4); ctx.stroke();
      ctx.strokeStyle = C(ra(ba, 0.6)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-hw + 1.5, -2.5); ctx.quadraticCurveTo(-hw + 3.5, 1, -hw + 1, 2.5); ctx.stroke();
    }
  }
}

function drawSkirt(ctx, K, cols, dress) {
  const [c, a] = cols;
  const sway = K.state === 'walk' ? Math.sin(K.t * K.w) * 1.2 : K.state === 'jump' ? -1.5 : K.state === 'hurt' ? -1 : 0;
  const lift = K.state === 'jump' ? 1.2 : 0;
  const top = dress ? -6 : -4;
  const bot = (dress ? 10 : 9) - lift;
  const torn = K.dmg >= 0.5;
  const hb = bot - (torn ? 1.6 : 0);
  const hwT = K.hw - 0.2, hwB = K.hw + 4.8 + lift;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-hwT, top);
    ctx.lineTo(hwT, top);
    ctx.quadraticCurveTo(hwB - 1.5, top + 6, hwB + sway * 0.3, hb);
    if (torn) {
      const n = 8;
      for (let i = 1; i <= n; i++) {
        const x = lerp(hwB + sway * 0.3, -hwB + sway * 0.3, i / n);
        ctx.lineTo(x, hb + (i % 2 ? 2.6 : -0.6) + ((i * 7) % 3) * 0.4);
      }
    } else {
      const n = 6;
      for (let i = 1; i <= n; i++) {
        const x0 = lerp(hwB + sway * 0.3, -hwB + sway * 0.3, (i - 0.5) / n);
        const x1 = lerp(hwB + sway * 0.3, -hwB + sway * 0.3, i / n);
        ctx.quadraticCurveTo(x0, hb + 2.4, x1, hb);
      }
    }
    ctx.quadraticCurveTo(-hwB + 1.5, top + 6, -hwT, top);
    ctx.closePath();
  };
  path();
  fillStroke(ctx, c);
  ctx.save(); path(); ctx.clip();
  // プリーツ: 交互の影パネル
  ctx.fillStyle = C(sh(c, -0.16));
  ctx.beginPath();
  for (const px of [-1, 1, 3]) {
    const x0 = px * 2.6, x1 = px * 5.4 + sway * 0.3;
    ctx.moveTo(x0, top); ctx.lineTo(x0 + 2.2, top); ctx.lineTo(x1 + 3.2, hb + 3); ctx.lineTo(x1, hb + 3); ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = C(sh(c, -0.3)); ctx.fillRect(hwT * 0.6, top, hwB, hb - top + 4);
  ctx.fillStyle = C(ra('#ffffff', 0.22)); ctx.beginPath(); ctx.moveTo(-hwT + 1, top + 1); ctx.lineTo(-hwT + 3, top + 1); ctx.lineTo(-hwB + 4, hb); ctx.lineTo(-hwB + 2.4, hb); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C(sh(c, -0.35)); ctx.lineWidth = 0.7; ctx.beginPath();
  for (const px of [-4, 0, 4]) { ctx.moveTo(px * 0.6, top + 2); ctx.lineTo(px * 1.4 + sway * 0.3, hb); }
  ctx.stroke();
  if (dress || a) {
    ctx.strokeStyle = C(a); ctx.lineWidth = 1.3; ctx.beginPath();
    ctx.moveTo(-hwB + 1 + sway * 0.3, hb - 1.3); ctx.lineTo(hwB - 1 + sway * 0.3, hb - 1.3); ctx.stroke();
  }
  // ウエストバンド
  ctx.beginPath(); rrect(ctx, -hwT, top - 0.4, hwT * 2, 2.6, 1); fillStroke(ctx, sh(c, dress ? 0.25 : -0.12), 1);
  if ((dress ? K.rTop : K.rBot) >= 3 && !FL) {
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, -hwB * 0.5, hb - 4, 1.4, 'rgba(255,255,255,0.9)'); sparkle(ctx, hwB * 0.3, hb - 6.5, 1.1, 'rgba(255,255,255,0.8)');
  }
  const tg0 = TAG; TAG = 'tear';
  if (K.dmg >= 0.75) {
    ctx.save(); ctx.translate(-4, top + 8);
    ctx.beginPath(); polyPath(ctx, SKIRT_HOLE); fillStroke(ctx, INNER_BOT, 1);
    ctx.restore();
  }
  TAG = tg0;
}

// ---------------------------------------------------------------- 胴
function torsoPath(ctx, K, bot, jag) {
  const sw = K.sw, ww = K.ww, hw = K.hw, top = -20;
  ctx.beginPath();
  ctx.moveTo(-sw + 3, top);
  ctx.quadraticCurveTo(-sw - 0.2, top, -sw, top + 4);
  ctx.quadraticCurveTo(-sw + 0.6, top + 9, -ww, top + 12);
  ctx.quadraticCurveTo(-hw - 0.4, top + 15.5, -hw, bot);
  hem(ctx, -hw, hw, bot, jag);
  ctx.quadraticCurveTo(hw + 0.4, top + 15.5, ww, top + 12);
  ctx.quadraticCurveTo(sw - 0.6, top + 9, sw, top + 4);
  ctx.quadraticCurveTo(sw + 0.2, top, sw - 3, top);
  ctx.closePath();
}
function tankPath(ctx, K, bot, jag) {
  const sw = K.sw, ww = K.ww, hw = K.hw, top = -20;
  ctx.beginPath();
  ctx.moveTo(-sw + 3.4, top);
  ctx.lineTo(-sw + 5.8, top);
  ctx.quadraticCurveTo(0.6, top + 7, sw - 5.8, top);
  ctx.lineTo(sw - 3.4, top);
  ctx.quadraticCurveTo(sw - 2.4, top + 6, ww, top + 11);
  ctx.quadraticCurveTo(hw + 0.4, top + 15.5, hw, bot);
  hem(ctx, hw, -hw, bot, jag);
  ctx.quadraticCurveTo(-hw - 0.4, top + 15.5, -ww, top + 11);
  ctx.quadraticCurveTo(-sw + 2.4, top + 6, -sw + 3.4, top);
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
function vestPath(ctx, K, bot) {
  const sw = K.sw + 0.6, hw = K.hw + 0.8;
  ctx.moveTo(-sw + 2, -20.5); ctx.lineTo(-sw + 5.5, -20.5); ctx.lineTo(-2, -16); ctx.lineTo(3, -16);
  ctx.lineTo(sw - 5.5, -20.5); ctx.lineTo(sw - 2, -20.5); ctx.quadraticCurveTo(sw + 0.5, -18, sw, -12);
  ctx.lineTo(hw, bot); ctx.lineTo(-hw, bot); ctx.lineTo(-sw, -12); ctx.quadraticCurveTo(-sw - 0.5, -18, -sw + 2, -20.5);
  ctx.closePath();
}
function bodyShape(ctx, K, st, bot, jag) {
  if (st === 'tank') tankPath(ctx, K, bot, jag);
  else if (st === 'armorVest') { ctx.beginPath(); vestPath(ctx, K, bot); }
  else torsoPath(ctx, K, bot, jag);
}

function drawNeck(ctx, K) {
  const nw = K.B.neck, cx = 1.2 + K.P.twist * 0.2;
  ctx.beginPath(); rrect(ctx, cx - nw, -27, nw * 2, 8.5, nw * 0.8);
  fillStroke(ctx, K.skin, 1.8);
  ctx.fillStyle = C(K.skinSh2); ctx.fillRect(cx - nw + 0.4, -26.5, nw * 2 - 0.8, 3.2);
}

function drawTorso(ctx, K, back) {
  const st = K.topS, [c, a] = K.topC;
  const dmg = K.dmg;
  const info = TOPS[st] || TOPS.tshirt;
  const bot = 1 + info.len;
  const jag = dmg >= 0.5;
  TAG = 'body';
  if (!back) drawNeck(ctx, K);
  // 肌（肩・首）
  torsoPath(ctx, K, -2, false); fillStroke(ctx, K.skin);
  // インナー（タンクトップ）— 破れても必ず残る
  tankPath(ctx, K, 0.5, false); fillStroke(ctx, INNER_TOP);
  TAG = 'top';
  if (st === 'armorVest') { torsoPath(ctx, K, 1, jag); fillStroke(ctx, '#2b2b33'); }
  // 本体
  bodyShape(ctx, K, st, bot, jag);
  fillStroke(ctx, c);
  ctx.save(); ctx.clip();
  // 2段のセル影＋ハイライト
  if (!FL) {
    const sw = K.sw, hw = K.hw;
    ctx.fillStyle = sh(c, -0.14);
    ctx.beginPath(); ctx.moveTo(sw * 0.15, -21); ctx.quadraticCurveTo(sw * 0.55, -9, hw * 0.05, bot + 3); ctx.lineTo(hw + 3, bot + 3); ctx.lineTo(sw + 3, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sh(c, -0.28);
    ctx.beginPath(); ctx.moveTo(sw * 0.62, -21); ctx.quadraticCurveTo(sw * 0.8, -10, hw * 0.55, bot + 3); ctx.lineTo(hw + 3, bot + 3); ctx.lineTo(sw + 3, -21); ctx.closePath(); ctx.fill();
    // 胸下・裾の影
    ctx.fillStyle = ra(sh(c, -0.45), 0.35);
    ctx.fillRect(-hw - 2, bot - 2.2, hw * 2 + 4, 4);
    ctx.fillStyle = ra('#ffffff', 0.2);
    ctx.beginPath(); ctx.ellipse(-sw * 0.5, -17, 3.4, 2.4, -0.3, 0, TAU); ctx.fill();
    if (lum(c) < 0.2) {
      // 暗い服: 明るい側に面のハイライト（黒つぶれ防止）
      ctx.fillStyle = sh(c, 0.3);
      ctx.beginPath(); ctx.moveTo(-sw - 1, -19); ctx.quadraticCurveTo(-sw * 0.35, -12, -hw * 0.45, bot + 3); ctx.lineTo(-hw - 2, bot + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = sh(c, 0.5);
      ctx.beginPath(); ctx.moveTo(-sw - 1, -18); ctx.quadraticCurveTo(-sw * 0.62, -12, -hw * 0.8, bot + 3); ctx.lineTo(-hw - 2, bot + 3); ctx.closePath(); ctx.fill();
    }
    // しわ
    ctx.strokeStyle = sh(c, -0.32); ctx.lineWidth = 0.7; ctx.beginPath();
    ctx.moveTo(-K.ww + 0.8, -9); ctx.quadraticCurveTo(-K.ww + 2.4, -8, -K.ww + 3, -6.4);
    ctx.moveTo(K.ww - 0.6, -8.4); ctx.quadraticCurveTo(K.ww - 2.4, -7, K.ww - 2.8, -5);
    ctx.stroke();
  }
  if (!back) topDetails(ctx, K, st, c, a, bot);
  else if (st === 'police' || st === 'tracksuit' || st === 'leatherJacket') {
    ctx.fillStyle = C(sh(c, 0.18)); ctx.fillRect(-K.sw, -20, K.sw * 2, 2.5);
  }
  // レア度のトリム（epic 以上）
  const r = K.rTop;
  if (r >= 2 && !FL) {
    ctx.strokeStyle = r >= 4 ? '#bff6ff' : TRIM[r]; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-K.hw - 1, bot - 1.2); ctx.lineTo(K.hw + 1, bot - 1.2); ctx.stroke();
    if (r >= 3) {
      // 光沢のスイープ
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.moveTo(-K.sw, -12); ctx.lineTo(-K.sw + 3, -12); ctx.lineTo(-K.sw + 9, -22); ctx.lineTo(-K.sw + 6, -22); ctx.closePath(); ctx.fill();
      sparkle(ctx, K.sw - 3.2, -15, r >= 4 ? 2 : 1.5, 'rgba(255,255,255,0.95)');
    }
  }
  // リムライト（影側の縁）
  if (!FL) {
    ctx.save(); ctx.beginPath(); ctx.rect(K.sw * 0.3, -24, 20, 30); ctx.clip();
    ctx.translate(-1.5, 0.4);
    bodyShape(ctx, K, st, bot, jag);
    ctx.strokeStyle = ra(RIM, 0.55); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }
  // ---- 破れ
  TAG = 'tear';
  if (dmg >= 0.25) {
    ctx.strokeStyle = C('rgba(40,20,40,0.45)'); ctx.lineWidth = 0.8; ctx.beginPath();
    for (const s of SCRATCHES) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
    ctx.stroke();
    ctx.fillStyle = C('rgba(70,50,50,0.22)');
    ctx.beginPath(); ctx.ellipse(-3, -6, 3, 2, 0.3, 0, TAU); ctx.fill();
  }
  for (const h of TOP_HOLES) {
    if (dmg >= h.th) { ctx.beginPath(); polyPath(ctx, h.p); fillStroke(ctx, INNER_TOP, 1); }
  }
  if (dmg >= 0.75) {
    ctx.beginPath(); polyPath(ctx, BIG_RIP); fillStroke(ctx, INNER_TOP, 1.1);
    ctx.strokeStyle = C(sh(c, 0.3)); ctx.lineWidth = 0.7; ctx.beginPath();
    ctx.moveTo(-4.6, -16); ctx.lineTo(-5.2, -18); ctx.moveTo(2, -12.5); ctx.lineTo(2.6, -14.5); ctx.moveTo(6, -8); ctx.lineTo(7.2, -9.4); ctx.stroke();
  }
  if (dmg >= 0.6) {
    ctx.fillStyle = C(dmg >= 0.9 ? 'rgba(40,30,40,0.42)' : 'rgba(40,30,40,0.22)');
    for (const s of SOOT) { ctx.beginPath(); ctx.ellipse(s[0], s[1], s[2], s[3], 0.4, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  // 再アウトライン
  TAG = 'top';
  ctx.strokeStyle = OC(); ctx.lineWidth = OLW;
  bodyShape(ctx, K, st, bot, jag);
  ctx.stroke();
  if (st === 'police' && !back) {
    ctx.beginPath(); rrect(ctx, -K.hw - 0.3, bot - 2.6, K.hw * 2 + 0.6, 3, 1); fillStroke(ctx, '#1b1b22', 1.1);
    ctx.beginPath(); ctx.rect(-0.6, bot - 2.4, 3.2, 2.6); fillStroke(ctx, a, 0.8);
    ctx.fillStyle = C('#2c2c36'); ctx.beginPath(); rrect(ctx, -K.hw + 0.6, bot - 4.6, 3.2, 4, 0.8); ctx.fill();
  }
}

function topDetails(ctx, K, st, c, a, bot) {
  const dk = sh(c, -0.3);
  const sw = K.sw, hw = K.hw;
  ctx.lineWidth = ILW;
  switch (st) {
    case 'tshirt': {
      // リブの襟
      ctx.strokeStyle = C(dk); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(1.2, -21, 4.2, 0.25, PI - 0.25); ctx.stroke();
      ctx.strokeStyle = C(sh(c, 0.15)); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(1.2, -21, 5.2, 0.35, PI - 0.35); ctx.stroke();
      // ハートのロゴ（縁取り＋ツヤ）
      const hx = 1.5, hy = -10;
      ctx.beginPath();
      ctx.moveTo(hx, hy + 3); ctx.bezierCurveTo(hx - 5, hy - 0.5, hx - 2.4, hy - 4.5, hx, hy - 1.6);
      ctx.bezierCurveTo(hx + 2.4, hy - 4.5, hx + 5, hy - 0.5, hx, hy + 3); ctx.closePath();
      ctx.fillStyle = C(a); ctx.fill(); ctx.strokeStyle = C(sh(a, -0.35)); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = C(ra('#ffffff', 0.7)); ctx.beginPath(); ctx.ellipse(hx - 1.6, hy - 1.6, 0.9, 0.6, -0.5, 0, TAU); ctx.fill();
      break;
    }
    case 'hoodie': {
      // ポケット（ステッチ）
      ctx.beginPath(); ctx.moveTo(-5.5, -6); ctx.lineTo(6.5, -6); ctx.lineTo(7.5, bot - 2.6); ctx.lineTo(-6.5, bot - 2.6); ctx.closePath();
      ctx.fillStyle = C(sh(c, -0.08)); ctx.fill(); ctx.strokeStyle = C(dk); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.setLineDash([1, 1]); ctx.strokeStyle = C(sh(c, 0.3)); ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-4.6, -5); ctx.lineTo(5.6, -5); ctx.stroke(); ctx.setLineDash([]);
      // 裾リブ
      ctx.fillStyle = C(sh(c, -0.2)); ctx.fillRect(-hw - 1, bot - 2.2, hw * 2 + 2, 2.4);
      ctx.strokeStyle = C(sh(c, -0.35)); ctx.lineWidth = 0.5; ctx.beginPath();
      for (let x = -hw + 1; x < hw; x += 2) { ctx.moveTo(x, bot - 2); ctx.lineTo(x, bot); }
      ctx.stroke();
      // ひも
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(-1.2, -19); ctx.quadraticCurveTo(-1.8, -15, -1.6, -12.5); ctx.moveTo(3.4, -19); ctx.quadraticCurveTo(3.8, -15, 3.6, -13); ctx.stroke();
      ctx.fillStyle = C(a); ctx.beginPath(); rrect(ctx, -2.3, -12.8, 1.4, 2, 0.6); rrect(ctx, 2.9, -13.3, 1.4, 2, 0.6); ctx.fill();
      // 胸ロゴ
      ctx.fillStyle = C(ra(a, 0.85)); ctx.beginPath(); rrect(ctx, -sw + 3, -15.5, 3, 2, 0.6); ctx.fill();
      break;
    }
    case 'leatherJacket': {
      ctx.beginPath(); ctx.moveTo(-2.2, -20); ctx.lineTo(4.2, -20); ctx.lineTo(3.8, bot); ctx.lineTo(-1.6, bot); ctx.closePath();
      ctx.fillStyle = C(K.f ? '#fbf7ff' : '#5a2d82'); ctx.fill();
      if (!K.f) { ctx.fillStyle = C('#7b44ad'); ctx.fillRect(0.2, -20, 2, bot + 20); }
      // 襟（ノッチ）
      ctx.beginPath(); ctx.moveTo(-2.2, -20); ctx.lineTo(-7, -11.5); ctx.lineTo(-4.4, -12.6); ctx.lineTo(-2.2, -9.5); ctx.lineTo(-1.4, -13); ctx.closePath();
      ctx.moveTo(4.2, -20); ctx.lineTo(8.8, -11.5); ctx.lineTo(6.2, -12.4); ctx.lineTo(4.2, -9.6); ctx.lineTo(3.4, -13); ctx.closePath();
      ctx.fillStyle = C(sh(c, 0.16)); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 0.9; ctx.stroke();
      // ジッパー
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.setLineDash([0.9, 0.9]);
      ctx.beginPath(); ctx.moveTo(-1.6, -11); ctx.lineTo(-1.5, bot); ctx.moveTo(-sw + 2.6, -6); ctx.lineTo(-sw + 5.6, -6); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C(a); ctx.fillRect(-2.4, -8, 1.6, 2.4);
      // 革のツヤ
      ctx.strokeStyle = C('rgba(255,255,255,0.4)'); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-sw + 1.5, -16); ctx.quadraticCurveTo(-sw + 2, -9, -sw + 1.4, -3); ctx.stroke();
      ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(7.5, -2); ctx.stroke();
      // 肩のスタッズ
      ctx.fillStyle = C(a);
      for (const [px, py] of [[-sw + 2.2, -18.6], [-sw + 4.2, -19.2], [sw - 3, -18.8]]) { ctx.beginPath(); ctx.arc(px, py, 0.6, 0, TAU); ctx.fill(); }
      break;
    }
    case 'suit': {
      ctx.beginPath(); ctx.moveTo(-2.8, -20); ctx.lineTo(4.6, -20); ctx.lineTo(0.8, -7.5); ctx.closePath();
      ctx.fillStyle = C('#f6f4fa'); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(1.6, -19); ctx.lineTo(2.4, -11); ctx.lineTo(0.8, -8.6); ctx.lineTo(-0.7, -11); ctx.closePath();
      ctx.fillStyle = C(a); ctx.fill(); ctx.strokeStyle = C(sh(a, -0.35)); ctx.lineWidth = 0.5; ctx.stroke();
      // ラペル
      const lc = sh(c, c === '#15151b' ? 0.18 : -0.12);
      ctx.beginPath(); ctx.moveTo(-2.8, -20); ctx.lineTo(-5.8, -12.5); ctx.lineTo(-4.2, -12.8); ctx.lineTo(0.8, -7.5); ctx.lineTo(-1.6, -15); ctx.closePath();
      ctx.moveTo(4.6, -20); ctx.lineTo(7.4, -12.5); ctx.lineTo(5.8, -12.8); ctx.lineTo(0.8, -7.5); ctx.lineTo(3.2, -15); ctx.closePath();
      ctx.fillStyle = C(lc); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = C(sh(c, c === '#15151b' ? 0.3 : -0.4)); ctx.beginPath(); ctx.arc(0.8, -4.6, 0.8, 0, TAU); ctx.arc(0.8, -1.6, 0.8, 0, TAU); ctx.fill();
      // ポケットチーフ
      ctx.fillStyle = C(a); ctx.beginPath(); ctx.moveTo(-7.2, -13.2); ctx.lineTo(-6.2, -15); ctx.lineTo(-5.4, -13.6); ctx.lineTo(-4.4, -14.8); ctx.lineTo(-4, -13.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C(sh(c, -0.35)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-7.6, -13); ctx.lineTo(-3.6, -13); ctx.moveTo(-6.8, -3.4); ctx.lineTo(-3.4, -3.4); ctx.stroke();
      break;
    }
    case 'hawaiian': {
      ctx.beginPath(); ctx.moveTo(-1.5, -20); ctx.lineTo(3.5, -20); ctx.lineTo(1, -14); ctx.closePath(); ctx.fillStyle = C(K.skin); ctx.fill();
      // 開襟
      ctx.beginPath(); ctx.moveTo(-1.5, -20); ctx.lineTo(-5.6, -16); ctx.lineTo(-2.6, -15.4); ctx.lineTo(1, -14); ctx.closePath();
      ctx.moveTo(3.5, -20); ctx.lineTo(7.2, -16); ctx.lineTo(4.4, -15.6); ctx.lineTo(1, -14); ctx.closePath();
      ctx.fillStyle = C(sh(c, 0.12)); ctx.fill(); ctx.strokeStyle = C(dk); ctx.lineWidth = 0.7; ctx.stroke();
      // 葉と花
      ctx.fillStyle = C(sh(a, -0.25));
      for (const [lx, ly, r] of [[-6, -9, 0.6], [5.5, -7, -0.5], [-2.5, -1.5, 0.3], [7, -15.5, 1]]) { ctx.beginPath(); ctx.ellipse(lx, ly, 2.8, 1, r, 0, TAU); ctx.fill(); }
      const fl = [[-5, -14], [4.5, -11], [-2, -5], [6, -3], [-7, -2.5], [1.5, -9.5]];
      for (let i = 0; i < fl.length; i++) {
        const [fx, fy] = fl[i];
        ctx.fillStyle = C(i % 2 ? '#ffffff' : a);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const an = k * 1.2566; ctx.moveTo(fx, fy); ctx.arc(fx + Math.cos(an) * 1.2, fy + Math.sin(an) * 1.2, 1, 0, TAU); }
        ctx.fill();
        ctx.fillStyle = C('#ffe066'); ctx.beginPath(); ctx.arc(fx, fy, 0.6, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = C(dk); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, -14); ctx.lineTo(1.2, bot); ctx.stroke();
      ctx.fillStyle = C('#fff7e0'); for (const by of [-10, -5, 0]) { ctx.beginPath(); ctx.arc(2.2, by, 0.6, 0, TAU); ctx.fill(); }
      break;
    }
    case 'tank': {
      ctx.fillStyle = C(a); ctx.fillRect(-hw - 1, -8, hw * 2 + 2, 1.6);
      ctx.strokeStyle = C(sh(c, 0.25)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-sw + 6, -19); ctx.quadraticCurveTo(0.6, -12.6, sw - 6, -19); ctx.stroke();
      ctx.fillStyle = C(ra(a, 0.9)); ctx.beginPath(); starPathLocal(ctx, 2, -12.5, 2, 0.9); ctx.fill();
      break;
    }
    case 'police': {
      ctx.strokeStyle = C(sh(c, -0.4)); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(1, -16.5); ctx.lineTo(1, bot - 2.6); ctx.stroke();
      ctx.fillStyle = C(sh(c, 0.35)); for (const by of [-13, -8.5, -4]) { ctx.beginPath(); ctx.arc(1.8, by, 0.6, 0, TAU); ctx.fill(); }
      // 胸ポケット
      ctx.beginPath(); rrect(ctx, 3.2, -15, 4.4, 3.6, 0.6); ctx.strokeStyle = C(sh(c, -0.4)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2.8, -20); ctx.lineTo(1, -16.5); ctx.lineTo(4.8, -20); ctx.closePath();
      ctx.fillStyle = C(sh(c, 0.2)); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#1b1b22'); ctx.beginPath(); ctx.moveTo(0.2, -18.4); ctx.lineTo(1.8, -18.4); ctx.lineTo(1.4, -14.5); ctx.lineTo(0.6, -14.5); ctx.closePath(); ctx.fill();
      // バッジ
      ctx.beginPath(); ctx.moveTo(-4.6, -15.5); ctx.lineTo(-2.2, -14.6); ctx.lineTo(-2.4, -11.5); ctx.lineTo(-4.6, -10.2); ctx.lineTo(-6.8, -11.5); ctx.lineTo(-7, -14.6); ctx.closePath();
      fillStroke(ctx, a, 0.8);
      ctx.fillStyle = C(ra('#ffffff', 0.7)); ctx.beginPath(); starPathLocal(ctx, -4.6, -12.9, 1.2, 0.5); ctx.fill();
      break;
    }
    case 'tracksuit': {
      ctx.strokeStyle = C(a); ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(-sw + 1.2, -16); ctx.lineTo(-hw + 1, bot); ctx.moveTo(sw - 1.2, -16); ctx.lineTo(hw - 1, bot); ctx.stroke();
      ctx.strokeStyle = C(sh(c, -0.35)); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(1, -19); ctx.lineTo(1, bot); ctx.stroke();
      ctx.strokeStyle = C('#d8dde8'); ctx.lineWidth = 0.6; ctx.setLineDash([0.6, 0.6]); ctx.beginPath(); ctx.moveTo(1, -16); ctx.lineTo(1, bot - 1); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); rrect(ctx, -3.6, -21.6, 9.4, 3.4, 1.4); fillStroke(ctx, sh(c, 0.18), 1);
      ctx.fillStyle = C('#e8ecf4'); ctx.beginPath(); rrect(ctx, 0.3, -16.6, 1.6, 2.8, 0.6); ctx.fill();
      ctx.fillStyle = C(sh(c, -0.25)); ctx.fillRect(-hw - 1, bot - 2, hw * 2 + 2, 2);
      break;
    }
    case 'idolDress': {
      // フリル
      ctx.fillStyle = C(sh(c, 0.35)); ctx.beginPath(); ctx.moveTo(-hw, -7.5); for (let i = 0; i <= 6; i++) ctx.arc(-hw + 1.5 + i * (hw * 2 - 3) / 6, -7, 1.6, PI, 0); ctx.lineTo(hw, -5.5); ctx.lineTo(-hw, -5.5); ctx.fill();
      ctx.strokeStyle = C(sh(c, -0.2)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-hw, -5.6); ctx.lineTo(hw, -5.6); ctx.stroke();
      // 胸元のレース
      ctx.strokeStyle = C('rgba(255,255,255,0.85)'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-sw + 3, -19.4); ctx.quadraticCurveTo(1, -16, sw - 3, -19.4); ctx.stroke();
      // リボン
      ctx.save(); ctx.translate(1, -16.5);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-2, -3.4, -5.2, -3.2, -4.6, 0.2); ctx.bezierCurveTo(-4.4, 2.6, -2, 2, 0, 0);
      ctx.moveTo(0, 0); ctx.bezierCurveTo(2, -3.4, 5.2, -3.2, 4.6, 0.2); ctx.bezierCurveTo(4.4, 2.6, 2, 2, 0, 0); fillStroke(ctx, a, 0.9);
      ctx.beginPath(); ctx.moveTo(-0.6, 0.8); ctx.lineTo(-2.2, 5); ctx.moveTo(0.6, 0.8); ctx.lineTo(2.2, 5); ctx.strokeStyle = C(a); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, TAU); fillStroke(ctx, sh(a, 0.3), 0.8);
      ctx.restore();
      ctx.fillStyle = C('rgba(255,255,255,0.85)');
      sparkle(ctx, -4.6, -12, 1.1, C('rgba(255,255,255,0.9)')); sparkle(ctx, 5.5, -10, 0.9, C('rgba(255,255,255,0.8)'));
      break;
    }
    case 'armorVest': {
      ctx.strokeStyle = C(sh(c, -0.35)); ctx.lineWidth = 0.9;
      ctx.beginPath(); rrect(ctx, -7, -14, 6, 7, 1); rrect(ctx, 1.5, -14, 6.2, 7, 1); ctx.stroke();
      ctx.fillStyle = C(ra('#ffffff', 0.18)); ctx.fillRect(-6.4, -13.4, 4.8, 1.2); ctx.fillRect(2.1, -13.4, 5, 1.2);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); rrect(ctx, -8 + i * 5.6, bot - 5, 4.6, 4.2, 0.8); fillStroke(ctx, a, 0.9);
        ctx.strokeStyle = C(sh(a, -0.3)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-7.6 + i * 5.6, bot - 3.6); ctx.lineTo(-3.8 + i * 5.6, bot - 3.6); ctx.stroke();
      }
      ctx.fillStyle = C(sh(c, 0.2)); ctx.fillRect(-K.sw + 2, -20.5, 3.5, 1.5); ctx.fillRect(K.sw - 5.5, -20.5, 3.5, 1.5);
      ctx.fillStyle = C('#c9d0d8'); ctx.fillRect(-K.sw + 2.6, -10.5, 2.6, 0.9); // 反射テープ
      break;
    }
  }
}

function drawHood(ctx, K, back) {
  const [c, a] = K.topC;
  ctx.beginPath();
  if (back) { ctx.ellipse(0, -18, 9, 4.5, 0, 0, TAU); }
  else ctx.ellipse(-4.2, -19.8, 8.6, 4.6, -0.15, 0, TAU);
  fillStroke(ctx, sh(c, -0.14));
  if (!back) { ctx.strokeStyle = C(sh(c, -0.32)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(-4.2, -19.4, 6, 2.4, -0.15, PI * 1.1, PI * 1.9); ctx.stroke(); }
  if (back) { ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -18); ctx.quadraticCurveTo(0, -15.5, 6, -18); ctx.stroke(); }
}

// ---------------------------------------------------------------- 腕・手
function drawArm(ctx, K, front, sx, sy, a, e) {
  const B = K.B;
  const U = B.upper, F = B.fore, L = U + F;
  const skin = front ? K.skin : K.skinSh;
  const dk = front ? 0 : -0.12;
  const st = K.topS, [c, ac] = K.topC;
  const dmg = K.dmg;
  const sl = (TOPS[st] || TOPS.tshirt).sl;
  const slCol = st === 'armorVest' ? '#2b2b33' : c;
  const aw = B.armW, aw2 = B.armW2;
  TAG = front ? 'arm' : 'body';
  limb(ctx, sx, sy, a, e, U, F, 0, L, aw - 0.6, aw2 - 0.6, skin, 'round', 0.1);
  TAG = front ? 'sleeve' : 'top';
  const lost = front && dmg >= 0.75 && sl !== 'none';
  if (lost) {
    jagEnd(ctx, sx, sy, a, aw + 1.4, sh(slCol, dk), 2.6);
  } else if (sl === 'long' || sl === 'short') {
    let end = sl === 'long' ? L - 1.6 : U * 0.7;
    const torn = dmg >= 0.5;
    if (torn && sl === 'long') end = U + F * 0.35;
    if (torn && sl === 'short') end = U * 0.5;
    const col = sh(slCol, dk);
    const wA = aw + 1.2, wB = sl === 'long' ? aw2 + 1.5 : aw + 1.4;
    limb(ctx, sx, sy, a, e, U, F, 0, end, wA, wB, col, torn ? 'butt' : 'round', 0.2, front && (st === 'leatherJacket' || K.rTop >= 3) ? 0.35 : 0);
    if (torn) { limbAt(sx, sy, a, e, U, F, end); jagEnd(ctx, PT.x, PT.y, PT.a, end > U ? wB : wA, col, 2); }
    else if (sl === 'long') {
      limbAt(sx, sy, a, e, U, F, end - 0.6);
      cuffBand(ctx, PT.x, PT.y, PT.a, wB, st === 'tracksuit' || st === 'hoodie' ? sh(col, -0.2) : st === 'suit' ? '#f4f2f6' : sh(col, 0.15));
    }
    if (st === 'tracksuit' && !torn) {
      ctx.strokeStyle = C(sh(ac, dk)); ctx.lineWidth = 1.2; ctx.beginPath();
      limbAt(sx, sy, a, e, U, F, 0.5); ctx.moveTo(PT.x, PT.y);
      limbPts(sx, sy, a, e, U, F); ctx.lineTo(LP.kx, LP.ky);
      limbAt(sx, sy, a, e, U, F, end - 1.6); ctx.lineTo(PT.x, PT.y); ctx.stroke();
    }
    if (st === 'police' && !torn) {
      limbAt(sx, sy, a, e, U, F, 2.6);
      ctx.fillStyle = C(sh(ac, dk)); ctx.beginPath(); ctx.arc(PT.x, PT.y, 1.5, 0, TAU); ctx.fill();
    }
    if (st === 'hoodie' && front && !torn && K.eq.top && K.eq.top.color === '#1d2b24') {
      // サイバーパーカーの LED テープ
      ctx.strokeStyle = C(ac); ctx.lineWidth = 0.9; ctx.beginPath();
      limbAt(sx, sy, a, e, U, F, 1.5); ctx.moveTo(PT.x, PT.y); limbPts(sx, sy, a, e, U, F); ctx.lineTo(LP.kx, LP.ky); ctx.stroke();
    }
  } else if (sl === 'puff') {
    limbAt(sx, sy, a, e, U, F, 2.2);
    ctx.beginPath(); ctx.arc(PT.x, PT.y, 4.4, 0, TAU); fillStroke(ctx, sh(slCol, dk), 1.6);
    ctx.fillStyle = C(sh(slCol, dk + 0.25)); ctx.beginPath(); ctx.arc(PT.x - 1.2, PT.y - 1.4, 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = C(sh(ac, dk)); ctx.beginPath(); ctx.arc(PT.x, PT.y + 3.2, 1.2, 0, TAU); ctx.fill();
  }
  TAG = 'tear';
  if (front && dmg >= 0.9) { limbAt(sx, sy, a, e, U, F, U + 3.5); bandaid(ctx, PT.x, PT.y, PT.a + 0.3); }
  if (front && dmg >= 0.6 && lost) {
    ctx.fillStyle = C('rgba(50,35,45,0.3)'); limbAt(sx, sy, a, e, U, F, 4);
    ctx.beginPath(); ctx.ellipse(PT.x, PT.y, 1.8, 1.2, 0, 0, TAU); ctx.fill();
  }
  limbPts(sx, sy, a, e, U, F);
  const hx = LP.ex, hy = LP.ey;
  const fore = PI / 2 - (a + e);
  let hand = front ? K.P.handF : K.P.handB;
  if (front && K.P.showWeapon && K.eq.weapon) {
    const ang = K.wk === 'gun' ? fore : K.P.wAng != null ? K.P.wAng : fore;
    TAG = 'weapon';
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
    drawWeapon(ctx, K.ws, K.eq.weapon.color, K.eq.weapon.accent, K.t, K.P, K.w);
    ctx.restore();
    TAG = 'arm';
    drawHand(ctx, hx, hy, ang, 'grip', skin, K.f, front && K.P.punch);
  } else {
    if (hand === 'grip') hand = 'fist';
    TAG = front ? 'arm' : 'body';
    drawHand(ctx, hx, hy, fore, hand, skin, K.f, front && K.P.punch);
  }
  TAG = 'fx';
  if (front && K.P.punch) {
    ctx.strokeStyle = C('#ffffff'); ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < 3; i++) { const an = -0.6 + i * 0.6; ctx.moveTo(hx + Math.cos(an) * 6, hy + Math.sin(an) * 6); ctx.lineTo(hx + Math.cos(an) * 10, hy + Math.sin(an) * 10); }
    ctx.stroke();
  }
}

/** 手: 'fist'（グー）/ 'open'（パー）/ 'grip'（武器を握る）。ang = 前腕の向き（+x 基準） */
function drawHand(ctx, x, y, ang, kind, col, f, big) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  const s = (f ? 0.92 : 1.05) * (big ? 1.2 : 1);
  ctx.scale(s, s);
  if (kind === 'open') {
    // 手のひら＋親指＋指の切れ込み
    ctx.beginPath();
    ctx.moveTo(-1.6, -2.4); ctx.quadraticCurveTo(1.6, -3.3, 3.4, -1.6);
    ctx.quadraticCurveTo(4.4, 0.2, 3.2, 1.9); ctx.quadraticCurveTo(0.6, 3.4, -1.8, 2.4);
    ctx.quadraticCurveTo(-3, 0, -1.6, -2.4); ctx.closePath();
    ctx.moveTo(-0.4, -2.2); ctx.quadraticCurveTo(0.6, -4.8, 2.4, -3.9); ctx.quadraticCurveTo(2.4, -2.6, 1.2, -1.6); ctx.closePath();
    strokeFill(ctx, col, 0.85);
    ctx.strokeStyle = C(sh(col, -0.3)); ctx.lineWidth = 0.55; ctx.beginPath();
    ctx.moveTo(3.3, -0.4); ctx.lineTo(1.9, -0.3); ctx.moveTo(3.1, 1.1); ctx.lineTo(1.7, 0.9); ctx.stroke();
  } else {
    // グー / 握り
    ctx.beginPath(); rrect(ctx, -2.6, -2.7, 5.6, 5.4, 2.2);
    fillStroke(ctx, col, 1.5);
    ctx.strokeStyle = C(sh(col, -0.32)); ctx.lineWidth = 0.6; ctx.beginPath();
    if (kind === 'grip') { ctx.moveTo(0.4, -2.2); ctx.lineTo(0.4, 2.2); ctx.moveTo(1.9, -2); ctx.lineTo(1.9, 2); }
    else { ctx.moveTo(2.9, -1.2); ctx.lineTo(1.6, -1.1); ctx.moveTo(2.9, 0.6); ctx.lineTo(1.6, 0.6); }
    ctx.stroke();
    // 親指
    ctx.beginPath(); ctx.ellipse(-0.4, -1.9, 1.7, 1, -0.2, 0, TAU); ctx.fillStyle = C(sh(col, 0.05)); ctx.fill();
    ctx.strokeStyle = C(sh(col, -0.35)); ctx.lineWidth = 0.5; ctx.stroke();
  }
  ctx.restore();
}

function drawSwoosh(ctx, K, sx, sy) {
  const sw = K.P.swoosh;
  const len = WEAPON_LEN[K.ws] || 20;
  const r = Math.max(28, K.B.upper + K.B.fore + len * 0.85);
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
  ctx.beginPath(); ctx.arc(sx, sy, r - 5, from + span * 0.45, sw.to);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 武器（原点=握り、+x=刃の向き）
export function drawWeapon(ctx, style, color, accent, t = 0, P = null, w = TAU / LOOP) {
  const d = DEF_COL[style] || ['#ccc', '#fff'];
  const c = color || d[0], a = accent || d[1];
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (style) {
    case 'bat': {
      ctx.beginPath(); ctx.moveTo(-4, -1.2); ctx.lineTo(6, -1.6); ctx.quadraticCurveTo(20, -3.6, 27, -3.4);
      ctx.quadraticCurveTo(29.5, 0, 27, 3.4); ctx.quadraticCurveTo(20, 3.6, 6, 1.6); ctx.lineTo(-4, 1.2); ctx.closePath();
      fillStroke(ctx, c, 1.6);
      ctx.fillStyle = C(sh(c, -0.2)); ctx.beginPath(); ctx.moveTo(6, 0.6); ctx.quadraticCurveTo(20, 1.6, 27, 1.6); ctx.quadraticCurveTo(28.4, 2.4, 27, 3.2); ctx.quadraticCurveTo(20, 3.4, 6, 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(a); ctx.fillRect(-4, -1.4, 6, 2.8);
      ctx.strokeStyle = C(sh(a, -0.3)); ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = -3; i < 2; i += 1.4) { ctx.moveTo(i, -1.3); ctx.lineTo(i + 1, 1.3); } ctx.stroke();
      ctx.strokeStyle = C('rgba(255,255,255,0.5)'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -1.6); ctx.lineTo(25, -2.2); ctx.stroke();
      if (a === '#c9ccd6' || c === '#8a5a2b') {
        ctx.strokeStyle = C('#d8dde8'); ctx.lineWidth = 1; ctx.beginPath();
        for (const nx of [14, 18, 22, 25]) { ctx.moveTo(nx, -3); ctx.lineTo(nx + 0.8, -5.5); ctx.moveTo(nx + 1.5, 3); ctx.lineTo(nx + 2.2, 5.5); }
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(-4.5, 0, 1.2, 2.2, 0, 0, TAU); fillStroke(ctx, a, 1);
      break;
    }
    case 'knife': {
      ctx.beginPath(); rrect(ctx, -4, -1.6, 7, 3.2, 1.2); fillStroke(ctx, a, 1.3);
      ctx.beginPath(); ctx.moveTo(3, -1.8); ctx.lineTo(10, -1.8); ctx.quadraticCurveTo(14, -1.2, 15, 0.8); ctx.lineTo(3, 1.4); ctx.closePath();
      fillStroke(ctx, c, 1.3);
      ctx.fillStyle = C(sh(c, -0.2)); ctx.beginPath(); ctx.moveTo(3, 0.3); ctx.lineTo(14, 0.4); ctx.lineTo(15, 0.8); ctx.lineTo(3, 1.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C('rgba(255,255,255,0.85)'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4, -0.9); ctx.lineTo(12, -0.7); ctx.stroke();
      break;
    }
    case 'katana': {
      ctx.beginPath(); rrect(ctx, -8, -1.5, 9.5, 3, 1); fillStroke(ctx, '#1a1a22', 1.3);
      ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath();
      for (let i = -7; i < 1; i += 2.2) { ctx.moveTo(i, -1.4); ctx.lineTo(i + 1.4, 1.4); }
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(1.8, 0, 1.2, 3.6, 0, 0, TAU); fillStroke(ctx, '#d6b04a', 1.1);
      ctx.beginPath(); ctx.moveTo(3, -1.4); ctx.quadraticCurveTo(20, -3, 35, -4.6); ctx.lineTo(33, -2); ctx.quadraticCurveTo(19, 0.2, 3, 1.4); ctx.closePath();
      fillStroke(ctx, c, 1.3);
      ctx.strokeStyle = C('rgba(255,255,255,0.85)'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(5, -0.9); ctx.quadraticCurveTo(19, -2.1, 32, -3.6); ctx.stroke();
      break;
    }
    case 'pistol': {
      ctx.beginPath(); ctx.moveTo(-2.4, -1.5); ctx.lineTo(1.8, -1.5); ctx.lineTo(2.6, 6); ctx.lineTo(-1.4, 6.4); ctx.closePath();
      fillStroke(ctx, sh(c, -0.25), 1.3);
      ctx.beginPath(); rrect(ctx, -3, -5.4, 15.5, 4.4, 1); fillStroke(ctx, c, 1.4);
      ctx.fillStyle = C(a); ctx.fillRect(-1.5, -4.6, 10, 1);
      ctx.fillStyle = C(ra('#ffffff', 0.45)); ctx.fillRect(-1.5, -5, 12, 0.6);
      ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(2.5, 0.4, 1.8, 0, PI); ctx.stroke();
      break;
    }
    case 'smg': {
      ctx.beginPath(); ctx.moveTo(-8, -4.5); ctx.lineTo(-3, -4); ctx.lineTo(-3, -1); ctx.lineTo(-8, 1); ctx.closePath(); fillStroke(ctx, sh(c, -0.2), 1.2);
      ctx.beginPath(); ctx.moveTo(-1.6, -1); ctx.lineTo(1.6, -1); ctx.lineTo(2, 5.5); ctx.lineTo(-1, 5.8); ctx.closePath(); fillStroke(ctx, sh(c, -0.25), 1.2);
      ctx.beginPath(); ctx.moveTo(5, -1); ctx.lineTo(8, -1); ctx.lineTo(7.5, 8); ctx.lineTo(5, 8); ctx.closePath(); fillStroke(ctx, sh(c, -0.1), 1.2);
      ctx.beginPath(); rrect(ctx, -3.5, -6, 17, 5.4, 1.2); fillStroke(ctx, c, 1.4);
      ctx.beginPath(); ctx.rect(13, -4.4, 5.5, 2.2); fillStroke(ctx, '#2a2a30', 1.1);
      ctx.fillStyle = C(a); ctx.fillRect(-2, -5, 13, 1.2);
      ctx.fillStyle = C(ra('#ffffff', 0.35)); ctx.fillRect(-2, -5.6, 14, 0.5);
      break;
    }
    case 'guitar': {
      ctx.beginPath(); rrect(ctx, -6, -1.6, 22, 3.2, 1); fillStroke(ctx, '#5a3a22', 1.2);
      ctx.beginPath(); ctx.moveTo(-6, -1.8); ctx.lineTo(-11, -3.4); ctx.lineTo(-11, 2.6); ctx.lineTo(-6, 1.8); ctx.closePath(); fillStroke(ctx, sh(c, -0.2), 1.2);
      ctx.save(); ctx.translate(24, 0);
      ctx.beginPath();
      ctx.moveTo(-9, -3); ctx.bezierCurveTo(-8, -11, 2, -12, 3, -6); ctx.bezierCurveTo(6, -9, 12, -8, 11, -2);
      ctx.bezierCurveTo(14, 2, 11, 10, 3, 9); ctx.bezierCurveTo(-3, 12, -10, 8, -9, 3); ctx.closePath();
      fillStroke(ctx, c, 1.6);
      ctx.beginPath(); ctx.ellipse(1, 1, 4.5, 3.6, 0.2, 0, TAU); ctx.fillStyle = C(a); ctx.fill();
      ctx.fillStyle = C('#1a1a22'); ctx.fillRect(-3, -2.5, 2, 5); ctx.fillRect(3.5, -2.5, 2, 5);
      ctx.strokeStyle = C(ra('#ffffff', 0.5)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.quadraticCurveTo(-5, -9, 0, -9.4); ctx.stroke();
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
      ctx.beginPath(); ctx.moveTo(-12, -1.2); ctx.lineTo(22, -1.5); ctx.lineTo(22, 1.5); ctx.lineTo(-12, 1.2); ctx.closePath(); fillStroke(ctx, sh(c, -0.55), 1.2);
      ctx.fillStyle = C(a); ctx.fillRect(-3, -1.8, 2.2, 3.6); ctx.fillRect(16, -2, 2.4, 4);
      ctx.strokeStyle = C(c); ctx.lineWidth = 0.8; ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-6, 0); ctx.lineTo(-5, -0.8); ctx.lineTo(2, -0.8); ctx.moveTo(4, 0.6); ctx.lineTo(10, 0.6); ctx.lineTo(11, -0.6); ctx.lineTo(15, -0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(21, -1.5); ctx.lineTo(25, -5.5); ctx.lineTo(26.5, -4.5); ctx.lineTo(23.5, -1); ctx.moveTo(21, 1.5); ctx.lineTo(25, 5.5); ctx.lineTo(26.5, 4.5); ctx.lineTo(23.5, 1);
      ctx.fillStyle = C(sh(c, -0.4)); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); ctx.translate(30, Math.sin(t * om(w, 3)) * 0.8);
      const glow = P && P.magicGlow ? P.magicGlow : 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = FL ? '#ffffff' : rgba(c, 0.22 + glow * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 7.5 + glow * 6 + Math.sin(t * om(w, 6)) * 0.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = C(rgba(c, 0.9)); ctx.lineWidth = 1.2;
      const rr = 7.5 + glow * 2, ra0 = t * om(w, 3);
      ctx.beginPath(); ctx.arc(0, 0, rr, ra0, ra0 + 1.2); ctx.moveTo(Math.cos(ra0 + PI) * rr, Math.sin(ra0 + PI) * rr); ctx.arc(0, 0, rr, ra0 + PI, ra0 + PI + 1.2); ctx.stroke();
      ctx.fillStyle = C(a === '#1d1d24' ? '#eafff2' : a);
      const rb = t * om(w, 4);
      for (let i = 0; i < 3; i++) { const an = -rb + i * 2.1; ctx.fillRect(Math.cos(an) * 10 - 0.8, Math.sin(an) * 5 - 0.8, 1.6, 1.6); }
      ctx.restore();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const an = PI / 6 + i * PI / 3; const r = 4.8; if (i === 0) ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r); else ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      ctx.closePath(); fillStroke(ctx, c, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-1.6, -2.8, 1.4, 3.2); ctx.fillRect(0.6, -0.8, 1.4, 1.4);
      ctx.restore();
      break;
    }
  }
  if (P && P.muzzle) muzzleFx(ctx, style);
}
/** 銃口の火花（武器の座標系） */
function muzzleFx(ctx, style) {
  const mx0 = style === 'smg' ? 20 : 14, my = style === 'smg' ? -3.3 : -3.2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,220,120,0.9)';
  ctx.beginPath(); ctx.moveTo(mx0, my - 3); ctx.lineTo(mx0 + 9, my); ctx.lineTo(mx0, my + 3); ctx.lineTo(mx0 + 3, my); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- 頭
function facePath(ctx, K) {
  ctx.beginPath();
  if (K.f) {
    ctx.moveTo(-16.6, -1);
    ctx.bezierCurveTo(-16.6, -17.5, 16.6, -17.5, 16.6, -1);
    ctx.bezierCurveTo(16.4, 7, 11.5, 12.8, FO + 2, 15.2);
    ctx.quadraticCurveTo(FO + 0.6, 15.9, FO - 0.8, 15.4);
    ctx.bezierCurveTo(-8, 13.6, -16.5, 8, -16.6, -1);
  } else {
    ctx.moveTo(-16.8, -1);
    ctx.bezierCurveTo(-16.8, -17.5, 16.8, -17.5, 16.8, -1);
    ctx.bezierCurveTo(16.8, 6.5, 13.6, 11.5, FO + 3.4, 14.9);
    ctx.quadraticCurveTo(FO + 1, 16, FO - 1.6, 15.4);
    ctx.bezierCurveTo(-9, 14.2, -16.7, 8.5, -16.8, -1);
  }
  ctx.closePath();
}

function drawHead(ctx, K) {
  const P = K.P, eq = K.eq;
  // 耳（奥側）
  const H = hairDef(K);
  TAG = 'body';
  if (H.ear) {
    ctx.beginPath(); ctx.ellipse(-16.4, 3.5, 3, 4.2, 0.15, 0, TAU); fillStroke(ctx, K.skin, 1.8);
    ctx.strokeStyle = C(K.skinSh2); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(-16.4, 3.6, 1.8, -1.9, 1.6); ctx.stroke();
  }
  // 顔
  facePath(ctx, K);
  fillStroke(ctx, K.skin, 2.3);
  ctx.save(); facePath(ctx, K); ctx.clip();
  if (!FL) {
    // 頬〜あごのセル影（右下）
    ctx.fillStyle = ra(K.skinSh2, 0.55);
    ctx.beginPath(); ctx.moveTo(12.6, 4); ctx.quadraticCurveTo(11.6, 12, FO + 1, 15); ctx.lineTo(18, 18); ctx.lineTo(18, 2); ctx.closePath(); ctx.fill();
    // 前髪の落ち影
    ctx.save(); ctx.translate(0.7, 2.1);
    ctx.beginPath(); hairFrontPath(ctx, K, H, true);
    ctx.fillStyle = ra(K.skinSh2, 0.75); ctx.fill();
    ctx.restore();
    // リムライト（あごの影側）
    ctx.strokeStyle = ra(RIM, 0.5); ctx.lineWidth = 1; ctx.save(); ctx.beginPath(); ctx.rect(9, 0, 12, 20); ctx.clip(); ctx.translate(-1.3, -0.2); facePath(ctx, K); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  // 頬の赤み（ぼかし2層＋斜線）
  TAG = 'face';
  const cute = !K.cool;
  const hurt = P.eyes === 'hurt' || P.mouth === 'shout';
  const bA = K.vil ? 0.1 : cute ? 0.42 : 0.24;
  ctx.fillStyle = C(ra('#ff6e96', bA * 0.55));
  ctx.beginPath(); ctx.ellipse(FO - 10.4, 8.4, 4.4, 2.3, 0, 0, TAU); ctx.ellipse(FO + 10.8, 8.4, 3.8, 2.1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C(ra('#ff5a8a', bA * (hurt ? 1.2 : 0.9)));
  ctx.beginPath(); ctx.ellipse(FO - 10.4, 8.4, 2.8, 1.4, 0, 0, TAU); ctx.ellipse(FO + 10.8, 8.4, 2.4, 1.3, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = C(cute ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)'); ctx.lineWidth = 0.65; ctx.beginPath();
  const nl = cute ? 3 : 2;
  for (let i = 0; i < nl; i++) { const bx = FO - 12 + i * 1.5; ctx.moveTo(bx, 9.3); ctx.lineTo(bx + 0.9, 7.4); }
  for (let i = 0; i < nl - 1; i++) { const bx = FO + 9.8 + i * 1.5; ctx.moveTo(bx, 9.2); ctx.lineTo(bx + 0.9, 7.4); }
  ctx.stroke();
  // 目
  drawEyes(ctx, K);
  // 鼻
  ctx.strokeStyle = C(sh(K.skin, -0.32)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(FO + 2.6, 6.2); ctx.lineTo(FO + 2.1, 7.6); ctx.stroke();
  ctx.fillStyle = C(ra('#ffffff', 0.7)); ctx.beginPath(); ctx.arc(FO + 1.7, 6.2, 0.45, 0, TAU); ctx.fill();
  // 口
  const hasMask = eq.accessory && eq.accessory.style === 'mask';
  if (!hasMask) drawMouth(ctx, K);
  // 煤・絆創膏
  TAG = 'tear';
  if (K.dmg >= 0.9) {
    ctx.fillStyle = C('rgba(50,40,50,0.32)'); ctx.beginPath(); ctx.ellipse(FO - 10, 11, 2.6, 1.4, 0.3, 0, TAU); ctx.fill();
    bandaid(ctx, FO + 11, 3.6, -0.5);
  } else if (K.dmg >= 0.5) {
    ctx.fillStyle = C('rgba(50,40,50,0.2)'); ctx.beginPath(); ctx.ellipse(FO + 10.4, 11, 2.2, 1.2, -0.3, 0, TAU); ctx.fill();
  }
  TAG = 'accessory';
  if (hasMask && !RIG_HEADITEMS) drawMask(ctx, K);
  // 前髪
  TAG = 'hair_front';
  drawHairFront(ctx, K, H);
  // 眉（前髪の上に、透けて見える表現）
  TAG = 'face';
  drawBrows(ctx, K);
  TAG = 'accessory';
  if (RIG_HEADITEMS) return;     // リグ: 帽子・メガネ・天使の輪・汗は renderRig が重ねる
  if (eq.accessory && eq.accessory.style === 'sunglasses') drawGlasses(ctx, K);
  TAG = 'hat';
  drawHat(ctx, K, false);
  TAG = 'face';
  if (P.panic) drawPanicLines(ctx, K);
  if (P.sweat || P.panic) drawSweat(ctx, K);
  TAG = 'accessory';
  if (eq.accessory && eq.accessory.style === 'halo') drawHalo(ctx, K);
}

// ---- AIの頭
// 帽子で隠れる髪: かぶる帽子（cap/beanie/bandana/helmet/cowboy）はつばの線より上・帽子の外側の髪を描かない（帽子に収まって見える）
const HAT_CLIP = { cap: [-7, 18.8, -26.5], beanie: [-5, 18.8, -27], bandana: [-7, 18.8, -24], helmet: [-3, 19.8, -28], cowboy: [-10, 12.5, -30] };
const AI_H = 46, AI_W = 58, AI_CX = FO * 0.5, AI_CY = -3;   // 旧方式（fit:true）の頭の絵の置き方（コードの頭の座標系: 高さ46・幅58に収め、中心を(1.1,-3)に）
function drawAiHeadImage(ctx, K, back) { paintAiHead(ctx, K.ai, K.eq.hat && K.eq.hat.style, back, FL, K.rig ? 'rig' : 'code'); }
/** かぶる帽子のつばより上・帽子の外の髪を隠す clip（コードの頭の座標系） */
function hatClip(ctx, hat) {
  const hc = HAT_CLIP[hat];
  if (!hc) return;
  const [by, hw, top] = hc;
  ctx.beginPath();
  ctx.moveTo(-400, by); ctx.lineTo(400, by); ctx.lineTo(400, 400); ctx.lineTo(-400, 400); ctx.closePath();
  ctx.moveTo(-hw, by + 1); ctx.bezierCurveTo(-hw - 0.6, top, hw + 0.6, top, hw, by + 1); ctx.closePath();
  ctx.clip();
}
/**
 * 今の座標系（frame: 'code' = コードの頭の座標 / 'rig' = v2 の頭の座標（配置図の単位））から、
 * 帽子の clip をかけた上で、絵の置き方（fit:true = コードの頭の座標 / fit:false = 配置図の単位）の座標系に入る。restore は呼び出し側
 */
function enterAiFrame(ctx, fit, hat, frame) {
  ctx.save();
  const CH = RIG_CODE_HEAD;
  if (frame === 'rig') { ctx.translate(0, CH.dy); ctx.scale(CH.s, CH.s); }    // → コードの頭の座標
  hatClip(ctx, hat);
  if (!fit) { ctx.scale(1 / CH.s, 1 / CH.s); ctx.translate(0, -CH.dy); }      // → 配置図の単位（頭の中心が原点）
}
function drawAiPlaced(ctx, src, img, mirror) {
  const pl = img.place;
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0, img.w, img.h, pl[0], pl[1], pl[2], pl[3]);
}
/**
 * 頭の絵（前の頭）を頭の座標系（原点=頭の中心、右向き）に描く。sprites.js の人型レイヤー合成からも使う。
 *  frame: 'code'（コード描画の体の頭の座標。既定）| 'rig'（リグ v2 の頭の座標）
 *  h.fit=false（既定）: 頭の配置図（1024×1024、支点 (512,400)、1単位 = 10px）のまま置く。h.fit=true: 旧方式（範囲を 46×58 に収める）
 */
export function paintAiHead(ctx, h, hat, back, flash, frame = 'code') {
  if (!h) return;
  let src = back ? headBackOf(h) : h.canvas;
  if (!src) return;
  if (flash) src = flashOf(src, '#ffffff', 0.9);
  const o = h.offset || [0, 0];
  const sc = h.scale || 1;
  enterAiFrame(ctx, h.fit !== false || !h.place, hat, frame);
  if (h.fit === false && h.place) {
    ctx.translate(o[0], o[1]); if (sc !== 1) ctx.scale(sc, sc);
    drawAiPlaced(ctx, src, h, !!h.facesLeft !== !!back);
  } else {
    const k = Math.min(AI_H / h.h, AI_W / h.w) * sc;
    ctx.translate(AI_CX + o[0], AI_CY + o[1]);
    if (!!h.facesLeft !== !!back) ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, h.w, h.h, -h.w * k / 2, -h.h * k / 2, h.w * k, h.h * k);
  }
  ctx.restore();
}
/**
 * 後ろ髪の絵（heads の back。頭の配置図と同じ座標）を頭の座標系に描く。体の後ろ（前向き）/ 頭の上（背面）のレイヤー。
 *  P（姿勢）があれば二次運動: 結び目（HEAD_BACK_PIVOT）を中心に hairSway で揺れ（歩き・被弾）、hairLift（ジャンプ）でふわっと上がる。
 */
export function paintAiHeadBack(ctx, h, hat, P, flash, frame = 'code', backView = false) {
  const b = h && h.back;
  if (!b || !b.place) return;
  let src = b.canvas;
  if (flash) src = flashOf(src, '#ffffff', 0.9);
  const o = h.offset || [0, 0];
  const sc = h.scale || 1;
  enterAiFrame(ctx, false, hat, frame);
  ctx.translate(o[0], o[1]); if (sc !== 1) ctx.scale(sc, sc);
  // 後ろ髪だけの微調整（manifest heads.<key>.backScale / backOffset）。頭の中心まわりに拡大
  if (b.offset && (b.offset[0] || b.offset[1])) ctx.translate(b.offset[0], b.offset[1]);
  if (b.scale && b.scale !== 1) ctx.scale(b.scale, b.scale);
  if (P) {
    const sw = P.hairSway || 0, lift = P.hairLift || 0;
    const [qx, qy] = HEAD_BACK_PIVOT;
    ctx.translate(qx, qy);
    ctx.rotate(clamp(sw * 0.075 + lift * 0.05, -0.18, 0.18));
    if (lift) ctx.scale(1 + lift * 0.03, 1 - lift * 0.08);
    ctx.translate(-qx, -qy);
  }
  drawAiPlaced(ctx, src, b, !!h.facesLeft !== !!backView);
  ctx.restore();
}
/** 前向きの頭: 絵＋上に重ねる物（マスク・サングラス・帽子・汗・天使の輪） */
function drawAiHead(ctx, K) {
  const P = K.P, eq = K.eq;
  TAG = 'face';
  drawAiHeadImage(ctx, K, false);
  const acc = eq.accessory && eq.accessory.style;
  TAG = 'accessory';
  if (acc === 'mask') drawMask(ctx, K);
  if (acc === 'sunglasses') drawGlasses(ctx, K);
  TAG = 'hat';
  drawHat(ctx, K, false);
  TAG = 'face';
  if (P.panic) drawPanicLines(ctx, K);
  if (P.sweat || P.panic) drawSweat(ctx, K);
  TAG = 'accessory';
  if (acc === 'halo') drawHalo(ctx, K);
}

function drawSweat(ctx, K) {
  const t = K.t;
  const n = K.P.panic ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const k = K.P.panic ? (t * 1.6 + i * 0.5) % 1 : 0.2;
    const x = i ? -19 - k * 4 : 18.5 + k * 3, y = -9 + k * 10 - (i ? 4 : 0);
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y - 4.5); ctx.quadraticCurveTo(x + 3.2, y + 0.5, x, y + 2); ctx.quadraticCurveTo(x - 3.2, y + 0.5, x, y - 4.5);
    ctx.fillStyle = C('#a8ecff'); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x - 0.9, y - 0.3, 0.6, 1, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawPanicLines(ctx) {
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.beginPath();
  ctx.moveTo(14, -24); ctx.lineTo(17, -29); ctx.moveTo(19, -21); ctx.lineTo(23, -24); ctx.moveTo(9, -26); ctx.lineTo(10, -31);
  ctx.stroke();
}

// ---- 目
const EYE = { x: [FO - 6.6, FO + 6.9], y: 2.7 };
// 上まぶたの形（内側・中央・外側の高さ / h 単位）と下側
function lidOf(mode, K) {
  const f = K.f, cool = K.cool;
  switch (mode) {
    case 'fierce': return [0.05, 0.62, 0.62, 0.86, 0.72];
    case 'jito': return [0.12, 0.3, 0.22, 0.86, 1];
    case 'vil': return f ? [0.0, 0.7, 0.78, 0.7, 0.62] : [-0.05, 0.6, 0.78, 0.66, 0.58];
    case 'tired': return [0.25, 0.78, 0.38, 0.86, 0.95];
    default:
      if (cool) return f ? [0.18, 1.02, 0.62, 0.86, 0.95] : [0.12, 0.92, 0.66, 0.82, 0.9];
      return f ? [0.26, 1.28, 0.56, 0.9, 1] : [0.2, 1.12, 0.58, 0.86, 1];
  }
}
function eyePath(ctx, cx, ey, w, h, side, L) {
  const ix = cx - side * w, ox = cx + side * w;
  ctx.moveTo(ix, ey - h * L[0]);
  ctx.quadraticCurveTo(cx - side * w * 0.12, ey - h * L[1], ox, ey - h * L[2]);
  ctx.quadraticCurveTo(cx + side * w * 1.06, ey + h * 0.3, cx + side * w * 0.2, ey + h * L[3]);
  ctx.quadraticCurveTo(cx - side * w * 0.85, ey + h * L[3] * 0.98, ix, ey - h * L[0]);
  ctx.closePath();
}
function qpt(x0, y0, x1, y1, x2, y2, t) {
  const u = 1 - t;
  PT.x = u * u * x0 + 2 * u * t * x1 + t * t * x2; PT.y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
}
function drawEyes(ctx, K) {
  const P = K.P;
  const ec = K.look.eyeColor || '#4a3a8a';
  let mode = P.eyes;
  if ((mode === 'n' || mode === 'tired') && (K.state === 'idle' || K.state === 'sit')) {
    const ph = ((K.t % LOOP) + LOOP) % LOOP;
    if (ph >= 3.82 && ph < 4.0) mode = 'blink';
  }
  const f = K.f;
  const w = 4.6, h = K.cool ? (f ? 5.7 : 5.1) : (f ? 6.3 : 5.7);
  const ey = EYE.y;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (mode === 'x') {
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.8; ctx.beginPath();
    for (const cx of EYE.x) { ctx.moveTo(cx - 2.6, ey - 2.6); ctx.lineTo(cx + 2.6, ey + 2.6); ctx.moveTo(cx + 2.6, ey - 2.6); ctx.lineTo(cx - 2.6, ey + 2.6); }
    ctx.stroke(); return;
  }
  if (mode === 'panic') {
    for (const cx of EYE.x) {
      ctx.beginPath(); ctx.ellipse(cx, ey, 4.2, 5, 0, 0, TAU); ctx.fillStyle = C('#ffffff'); ctx.fill();
      ctx.strokeStyle = OC(); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C('#2a1430'); ctx.beginPath(); ctx.arc(cx + 0.6 + Math.sin(K.t * om(K.w, 20)) * 0.6, ey + 0.3, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + 0.1, ey - 0.4, 0.5, 0, TAU); ctx.fill();
    }
    return;
  }
  for (let i = 0; i < 2; i++) {
    const cx = EYE.x[i];
    const side = i ? 1 : -1;               // 外側の向き
    const ew = i ? w : w * 0.9;            // 奥側の目は少し細い
    let m = mode;
    if (mode === 'aim') m = i ? 'fierce' : 'closed';
    if (mode === 'wink') m = i ? 'n' : 'happy';
    if (m === 'blink' || m === 'closed') { closedEye(ctx, cx, ey, ew, h, side, f, m === 'closed' ? -1 : 1); continue; }
    if (m === 'happy') { happyEye(ctx, cx, ey, ew, h, side, f); continue; }
    if (m === 'hurt') {
      ctx.strokeStyle = OC(); ctx.lineWidth = 2.1; ctx.beginPath();
      const s = -side; // 内側を指す
      ctx.moveTo(cx - s * 3, ey - 3.2); ctx.lineTo(cx + s * 2.6, ey + 0.2); ctx.lineTo(cx - s * 3, ey + 3.2);
      ctx.stroke(); continue;
    }
    const L = lidOf(m, K);
    // 白目
    ctx.beginPath(); eyePath(ctx, cx, ey, ew, h, side, L);
    ctx.fillStyle = C('#ffffff'); ctx.fill();
    ctx.save(); ctx.clip();
    const icx = cx + side * 0.3, icy = ey + h * 0.12;
    const ik = L[4] || 1;
    const irx = ew * 0.8 * ik, iry = h * 0.9 * (0.5 + ik * 0.5);
    // 虹彩（多層グラデ）
    ctx.beginPath(); ctx.ellipse(icx, icy, irx, iry, 0, 0, TAU);
    if (FL) ctx.fillStyle = '#ffffff';
    else {
      const g = ctx.createLinearGradient(0, icy - iry, 0, icy + iry);
      g.addColorStop(0, sh(ec, -0.62)); g.addColorStop(0.32, sh(ec, -0.25)); g.addColorStop(0.62, ec); g.addColorStop(1, sh(ec, 0.6));
      ctx.fillStyle = g;
    }
    ctx.fill();
    if (!FL) {
      ctx.strokeStyle = sh(ec, -0.55); ctx.lineWidth = 0.7; ctx.stroke();
      // 虹彩の内側リング
      ctx.strokeStyle = ra(sh(ec, 0.45), 0.55); ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.ellipse(icx, icy + 0.4, irx * 0.62, iry * 0.62, 0, 0.3, PI - 0.3); ctx.stroke();
      // 瞳孔
      const pk = m === 'fierce' || m === 'vil' ? 0.3 : 0.38;
      ctx.fillStyle = sh(ec, -0.78);
      ctx.beginPath(); ctx.ellipse(icx + side * 0.15, icy - iry * 0.05, irx * pk * 1.15, iry * pk * 1.1, 0, 0, TAU); ctx.fill();
      // 上部の影（まぶたの影）
      ctx.fillStyle = 'rgba(42,20,48,0.32)';
      ctx.beginPath(); ctx.ellipse(cx, ey - h * 0.92, ew * 1.4, h * 0.62, 0, 0, TAU); ctx.fill();
      // 下の反射光
      ctx.fillStyle = ra(sh(ec, 0.75), 0.85);
      ctx.beginPath(); ctx.ellipse(icx + side * 0.2, icy + iry * 0.6, irx * 0.58, iry * 0.24, 0, 0, TAU); ctx.fill();
    }
    // ハイライト（大・小・極小）
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(icx - irx * 0.36, icy - iry * 0.42, 1.65, 2.05, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(icx + irx * 0.42, icy + iry * 0.32, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(icx + irx * 0.2, icy - iry * 0.6, 0.5, 0, TAU); ctx.fill();
    ctx.restore();
    // 下まつ毛（外側だけ細く）
    ctx.strokeStyle = C(ra(OUTLINE, 0.75)); ctx.lineWidth = f ? 0.9 : 0.7; ctx.beginPath();
    qpt(cx + side * ew * 1.0, ey - h * L[2] + 0.4, cx + side * ew * 1.06, ey + h * 0.3, cx + side * ew * 0.2, ey + h * L[3], 0.55);
    ctx.moveTo(PT.x, PT.y);
    ctx.quadraticCurveTo(cx + side * ew * 0.5, ey + h * L[3] + 0.3, cx - side * ew * 0.1, ey + h * L[3] + 0.1);
    ctx.stroke();
    // 上まつ毛（外側が太いバンド）
    lashBand(ctx, cx, ey, ew, h, side, L, f, m);
    // 二重のライン（♀）
    if (f && m === 'n') {
      ctx.strokeStyle = C(sh(K.skin, -0.32)); ctx.lineWidth = 0.6; ctx.beginPath();
      ctx.moveTo(cx - side * ew * 0.3, ey - h * 1.05); ctx.quadraticCurveTo(cx + side * ew * 0.4, ey - h * 1.2, cx + side * ew * 1.05, ey - h * 0.78);
      ctx.stroke();
    }
  }
}
function lashBand(ctx, cx, ey, w, h, side, L, f, m) {
  const ix = cx - side * w, iy = ey - h * L[0];
  const qx = cx - side * w * 0.12, qy = ey - h * L[1];
  const ox = cx + side * w, oy = ey - h * L[2];
  const N = 7;
  const thin = f ? 0.7 : 0.9, thick = f ? 2.5 : (m === 'fierce' ? 2.4 : 2.0);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { qpt(ix, iy, qx, qy, ox, oy, i / N); if (i) ctx.lineTo(PT.x, PT.y + 0.35); else ctx.moveTo(PT.x, PT.y + 0.35); }
  if (f) {
    // 目尻の跳ね（まつ毛2本）
    ctx.lineTo(ox + side * 2.4, oy - 1.6);
    ctx.lineTo(ox + side * 0.6, oy - 1.2);
    ctx.lineTo(ox + side * 1.8, oy - 2.9);
    ctx.lineTo(ox - side * 0.6, oy - 2.2);
  } else {
    // 切れ長（外へ伸ばす）
    ctx.lineTo(ox + side * 1.8, oy + 0.6);
    ctx.lineTo(ox + side * 0.2, oy - 1.6);
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    qpt(ix, iy, qx, qy, ox, oy, u);
    const th = thin + (thick - thin) * Math.pow(u, 1.3);
    ctx.lineTo(PT.x, PT.y - th);
  }
  ctx.closePath();
  ctx.fillStyle = OC(); ctx.fill();
  ctx.strokeStyle = OC(); ctx.lineWidth = 0.5; ctx.stroke();
}
function closedEye(ctx, cx, ey, w, h, side, f, dir) {
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.9; ctx.beginPath();
  const y = ey + 1;
  ctx.moveTo(cx - side * w, y - 0.4); ctx.quadraticCurveTo(cx, y + 2.4 * dir, cx + side * w, y - 0.6);
  if (f) { ctx.moveTo(cx + side * w, y - 0.6); ctx.lineTo(cx + side * (w + 1.8), y - 1.8); }
  ctx.stroke();
}
function happyEye(ctx, cx, ey, w, h, side, f) {
  ctx.strokeStyle = OC(); ctx.lineWidth = 2.2; ctx.beginPath();
  const y = ey + 1.6;
  ctx.moveTo(cx - side * w, y); ctx.quadraticCurveTo(cx, y - 5.8, cx + side * w, y);
  ctx.stroke();
  if (f) { ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx + side * w * 0.9, y - 1.4); ctx.lineTo(cx + side * (w + 1.6), y - 2.6); ctx.stroke(); }
}

// ---- 眉
function drawBrows(ctx, K) {
  const P = K.P;
  if (P.eyes === 'x' && K.state === 'dead') { /* 眉は困り */ }
  const h = K.cool ? (K.f ? 5.7 : 5.1) : (K.f ? 6.3 : 5.7);
  const by = EYE.y - h - (K.cool ? 1.9 : 2.8);
  const col = C(ra(sh(K.hair, -0.45), 0.92));
  const thIn = K.f ? 1.25 : 1.75, thOut = K.f ? 0.45 : 0.75;
  let di = 0, dO = 0.4, arch = -0.9;
  switch (P.brow) {
    case 'angry': di = 2.0; dO = -0.9; arch = 0.2; break;
    case 'worry': di = -1.7; dO = 0.9; arch = -0.5; break;
    case 'up': di = -0.9; dO = -0.6; arch = -1.4; break;
    case 'det': di = 1.0; dO = -0.2; arch = -0.3; break;
    case 'flat': di = 0.3; dO = 0.3; arch = 0; break;
    default: if (K.cool) { di = 0.6; dO = 0; arch = -0.4; }
  }
  ctx.fillStyle = col;
  for (let i = 0; i < 2; i++) {
    const cx = EYE.x[i], side = i ? 1 : -1;
    const w = i ? 4.6 : 4.2;
    const x0 = cx - side * w * 0.75, y0 = by + di;
    const x1 = cx + side * w * 1.1, y1 = by + dO + 0.6;
    const mxp = (x0 + x1) / 2, myp = (y0 + y1) / 2 + arch;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - thIn / 2);
    ctx.quadraticCurveTo(mxp, myp - thIn * 0.6, x1, y1 - thOut / 2);
    ctx.lineTo(x1, y1 + thOut / 2);
    ctx.quadraticCurveTo(mxp, myp + thIn * 0.5, x0, y0 + thIn / 2);
    ctx.closePath(); ctx.fill();
  }
}

// ---- 口
function drawMouth(ctx, K) {
  const P = K.P;
  const mxp = FO + 1.4, my = 10.6;
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const inside = C('#a82a48'), tongue = C('#ff7f9c');
  let m = P.mouth;
  if (m === 'n') m = K.cool ? (K.f ? 'smile' : 'smirk') : 'cat';
  switch (m) {
    case 'shout': {
      ctx.beginPath(); ctx.moveTo(mxp - 3, my - 1); ctx.quadraticCurveTo(mxp, my - 1.8, mxp + 3, my - 1);
      ctx.quadraticCurveTo(mxp + 2.6, my + 3.6, mxp, my + 3.8); ctx.quadraticCurveTo(mxp - 2.6, my + 3.6, mxp - 3, my - 1); ctx.closePath();
      ctx.fillStyle = inside; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = C('#ffffff'); ctx.fillRect(mxp - 3, my - 2, 6, 1.6);
      ctx.fillStyle = tongue; ctx.beginPath(); ctx.ellipse(mxp + 0.3, my + 3.4, 2, 1.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(mxp - 3, my - 1); ctx.quadraticCurveTo(mxp, my - 1.8, mxp + 3, my - 1);
      ctx.quadraticCurveTo(mxp + 2.6, my + 3.6, mxp, my + 3.8); ctx.quadraticCurveTo(mxp - 2.6, my + 3.6, mxp - 3, my - 1); ctx.closePath(); ctx.stroke();
      if (!K.cool || K.f) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(mxp + 1, my - 0.7); ctx.lineTo(mxp + 2.2, my - 0.8); ctx.lineTo(mxp + 1.6, my + 0.7); ctx.closePath(); ctx.fill(); }
      return;
    }
    case 'grit': {
      ctx.beginPath(); rrect(ctx, mxp - 2.8, my - 0.6, 5.6, 2.8, 1.2);
      ctx.fillStyle = C('#ffffff'); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(mxp - 2.6, my + 0.8); ctx.lineTo(mxp + 2.6, my + 0.8);
      ctx.moveTo(mxp - 0.9, my - 0.4); ctx.lineTo(mxp - 0.9, my + 2); ctx.moveTo(mxp + 0.9, my - 0.4); ctx.lineTo(mxp + 0.9, my + 2); ctx.stroke();
      return;
    }
    case 'panic': {
      const o = 1 + Math.abs(Math.sin(K.t * om(K.w, 14))) * 0.6;
      ctx.beginPath(); ctx.ellipse(mxp, my + 1, 2.2, 2.2 * o, 0, 0, TAU);
      ctx.fillStyle = inside; ctx.fill(); ctx.stroke();
      return;
    }
    case 'hurt': {
      ctx.beginPath(); ctx.moveTo(mxp - 2.5, my + 0.6); ctx.quadraticCurveTo(mxp - 1.2, my - 0.8, mxp, my + 0.6); ctx.quadraticCurveTo(mxp + 1.2, my + 1.8, mxp + 2.5, my + 0.4); ctx.stroke();
      return;
    }
    case 'o': {
      ctx.beginPath(); ctx.ellipse(mxp + 0.2, my + 0.9, 1.5, 1.8, 0, 0, TAU);
      ctx.fillStyle = inside; ctx.fill(); ctx.stroke();
      ctx.fillStyle = tongue; ctx.beginPath(); ctx.ellipse(mxp + 0.3, my + 1.9, 0.9, 0.6, 0, 0, TAU); ctx.fill();
      return;
    }
    case 'happy': {
      ctx.beginPath(); ctx.moveTo(mxp - 3, my - 0.6); ctx.quadraticCurveTo(mxp, my, mxp + 3, my - 0.6);
      ctx.quadraticCurveTo(mxp + 2.4, my + 4, mxp, my + 4); ctx.quadraticCurveTo(mxp - 2.4, my + 4, mxp - 3, my - 0.6); ctx.closePath();
      ctx.fillStyle = inside; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = tongue; ctx.beginPath(); ctx.ellipse(mxp + 0.3, my + 3.8, 2.2, 1.6, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.stroke();
      return;
    }
    case 'frown': {
      ctx.beginPath(); ctx.moveTo(mxp - 2, my + 1.4); ctx.quadraticCurveTo(mxp, my - 0.3, mxp + 2, my + 1.4); ctx.stroke();
      return;
    }
    case 'flat': {
      ctx.beginPath(); ctx.moveTo(mxp - 1.8, my + 0.6); ctx.lineTo(mxp + 1.8, my + 0.5); ctx.stroke();
      return;
    }
    case 'smirk': {
      ctx.beginPath(); ctx.moveTo(mxp - 2, my + 0.7); ctx.quadraticCurveTo(mxp + 0.4, my + 1.3, mxp + 2.4, my - 0.4); ctx.stroke();
      ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(mxp + 2.4, my - 0.4); ctx.lineTo(mxp + 2.9, my - 0.1); ctx.stroke();
      return;
    }
    case 'grin': {
      // 悪役のニヤリ（歯を見せる片側上がり）
      ctx.beginPath(); ctx.moveTo(mxp - 2.8, my); ctx.quadraticCurveTo(mxp + 0.2, my + 0.6, mxp + 3.2, my - 1.2);
      ctx.quadraticCurveTo(mxp + 1.4, my + 2.6, mxp - 0.6, my + 2); ctx.quadraticCurveTo(mxp - 2, my + 1.6, mxp - 2.8, my); ctx.closePath();
      ctx.fillStyle = C('#ffffff'); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(mxp - 0.6, my + 0.4); ctx.lineTo(mxp - 0.4, my + 1.9); ctx.moveTo(mxp + 1.2, my + 0.2); ctx.lineTo(mxp + 1.3, my + 1.6); ctx.stroke();
      return;
    }
    case 'smile': {
      ctx.beginPath(); ctx.moveTo(mxp - 2.2, my + 0.1); ctx.quadraticCurveTo(mxp, my + 2, mxp + 2.2, my + 0.1); ctx.stroke();
      return;
    }
    default: { // 'cat': 小さく開いた笑顔＋八重歯
      ctx.beginPath(); ctx.moveTo(mxp - 2.4, my - 0.2); ctx.quadraticCurveTo(mxp, my + 0.3, mxp + 2.4, my - 0.2);
      ctx.quadraticCurveTo(mxp + 1.6, my + 2.8, mxp, my + 2.8); ctx.quadraticCurveTo(mxp - 1.6, my + 2.8, mxp - 2.4, my - 0.2); ctx.closePath();
      ctx.fillStyle = inside; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = tongue; ctx.beginPath(); ctx.ellipse(mxp + 0.2, my + 2.7, 1.5, 1.1, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(mxp + 0.6, my + 0.1); ctx.lineTo(mxp + 1.7, my); ctx.lineTo(mxp + 1.2, my + 1.3); ctx.closePath(); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- 髪
function hairCols(K) {
  const L = K.look, c = K.hair;
  const dark = L.hairShadow || sh(c, -0.3);
  return {
    base: c, dark,
    hi: L.hairHi || sh(c, 0.5),
    deep: mx(dark, '#2a1430', 0.35),
    back: mx(c, dark, 0.62),
  };
}
// 毛束: [根元L.x, 根元R.x, 根元y, 先端x, 先端y, 曲がり]
// spikes: [角度(0=+x, -π/2=上), 長さ, 根元幅]
const HAIR = {
  short: { W: 18.8, top: -24.5, sl: 3, sr: 1.5, ear: 1, ahoge: 1,
    bangs: [[-19, -12.5, -12, -17, 3.5, -0.6], [-14.5, -5.5, -15, -11, -3.2, 0.3], [-9, 0, -16, -4.6, -5.6, 0.5], [-4, 5, -16, 1.2, -3.0, 0.7], [1, 10, -16, 7.2, -5.4, 0.9], [6, 14.5, -15, 12.6, -3.4, 1], [11.5, 19, -12, 17.4, 2.5, 0.7]] },
  spiky: { W: 18.6, top: -22.5, sl: 2, sr: 1, ear: 1,
    spikes: [[-3.0, 23, 9], [-2.62, 27.5, 10], [-2.25, 25.5, 10], [-1.9, 29.5, 10.5], [-1.52, 26.5, 10], [-1.15, 27.5, 10], [-0.78, 24, 9], [-0.42, 21, 8]],
    bangs: [[-19, -12, -12, -18, 2.5, -1], [-14, -6, -15, -11.5, -2, -0.5], [-8, 0, -15, -5, -4.6, 0], [-3, 5, -15, 0.8, -1.2, 0.5], [2, 10, -15, 7.2, -5, 1], [7, 15, -14, 13, -2, 1.2], [12, 19, -12, 18, 2.5, 1]] },
  wolf: { W: 19, top: -23.5, sl: 6, sr: 4,
    spikes: [[-2.75, 24, 11], [-2.25, 27, 11], [-1.78, 26, 11], [-1.3, 27, 11], [-0.85, 24, 10], [-0.45, 21.5, 8]],
    bangs: [[-19.5, -12, -12, -18.6, 8.5, -1.2], [-14, -6, -15, -11, 0, -0.3], [-8, 0, -16, -3.6, -3.4, 0.5], [-3, 6, -16, 2.6, 2.4, 0.8], [2, 10, -16, 8.6, -4.2, 1], [7, 15, -15, 13.6, 0, 1.2], [12, 19.5, -12, 18.6, 7, 1]], mesh: 3 },
  bob: { W: 19.4, top: -24, sl: 12, sr: 11, ahoge: 1,
    bangs: [[-15, -7, -15, -11.5, -3, 0], [-9.5, -1, -16, -5.5, -4, 0.2], [-4, 4, -16, 0.2, -3.2, 0.3], [1, 9, -16, 5.8, -4, 0.4], [6, 14, -15, 11, -3, 0.5],
      [-19.6, -14, -6, -16, 13.8, 1.4], [14, 19.6, -6, 17.6, 13.4, -1.4]] },
  long: { W: 19.2, top: -24.5, sl: 6, sr: 6,
    bangs: [[-14, -6, -15, -10.5, -2.5, 0], [-8.5, 0, -16, -4.5, -4.6, 0.4], [-3, 5.5, -16, 1.2, -2.5, 0.6], [2, 10, -16, 7, -4.8, 0.8], [7, 15, -15, 12.6, -2.6, 1],
      [-19.4, -14, -4, -17, 17, -1], [14, 19.4, -4, 17.8, 17, 1]] },
  ponytail: { W: 18.8, top: -25, sl: 3, sr: 2, ear: 0,
    bangs: [[-14, -5, -15, -11.5, -2, -0.2], [-8, 1, -16, -4.8, -4.6, 0.3], [-3, 6, -16, 1.5, -3.5, 0.6], [2, 11, -16, 8, -5.2, 1], [7, 15, -15, 13.5, -3.2, 1.2],
      [-19, -14, -8, -17.2, 9.5, -0.6], [13.5, 19, -8, 17.8, 8.5, 0.8]] },
  twin: { W: 19, top: -24.5, sl: 3, sr: 3, ahoge: 1,
    bangs: [[-14.5, -6, -15, -11.5, -1.5, -0.2], [-9, 0, -16, -5.2, -4.4, 0.3], [-3.6, 5, -16, 0.8, -2.2, 0.5], [1.5, 10, -16, 6.8, -4.8, 0.8], [6.5, 15, -15, 12.6, -2.4, 1.1],
      [-19.2, -14, -8, -17.4, 8.5, -0.8], [14, 19.2, -8, 17.8, 8, 0.9]] },
  bun: { W: 18.8, top: -24.5, sl: 3, sr: 2, ear: 1,
    bangs: [[-14, -5, -15, -11, -2.5, -0.2], [-8, 1, -16, -4.6, -4.8, 0.3], [-3, 6, -16, 1.4, -3.2, 0.6], [2, 11, -16, 7.8, -5, 1], [7, 15, -15, 13.2, -3, 1.2],
      [-19, -14, -8, -17.6, 5, -0.6], [13.5, 19, -8, 17.8, 4.5, 0.6]] },
  undercut: { W: 18.2, top: -26.5, sl: -2, sr: -3, ear: 1, buzz: 1,
    bangs: [[-15, -6, -18, 9, -9.5, -2.6], [-10, 1, -20, 16.5, -8, -2.4], [-5, 6, -22, 21, -13, -1.6], [-2, 8, -17, 11.5, -2.4, 1.2], [-15.5, -9, -14, -14.6, -4, -0.6]] },
  sidepart: { W: 19.2, top: -24.5, sl: 9, sr: 4, ear: 0,
    bangs: [[-19.2, -8, -13, -12, 11, -1.2], [-12, 1, -16, -6.2, 10.6, -1], [-3, 6, -16, 0.8, 2.6, 0.2], [3, 11, -16, 8.2, -5.2, 1], [8, 15.5, -15, 13.6, -3.2, 1], [12.5, 19.2, -12, 17.8, 4, 0.8]] },
  messy: { W: 19, top: -23, sl: 4, sr: 3, ahoge: 2,
    spikes: [[-2.85, 23, 7], [-2.45, 25, 8], [-2.05, 24, 7], [-1.65, 26, 8], [-1.25, 24, 7], [-0.85, 24, 7], [-0.5, 21, 6]],
    bangs: [[-19, -12, -12, -18.2, 4, -1.5], [-14.5, -6, -15, -12, -1, -1], [-9, 0, -15, -6.4, -4.6, 0.8], [-4, 4.5, -15, -0.4, -1.4, -0.6], [0, 8, -15, 5, -5.6, 1], [5, 13, -15, 10.6, -2, -0.8], [10, 17, -14, 15, -5, 1.2], [13, 19, -11, 18.6, 3, 1]] },
  braid: { W: 18.8, top: -24.5, sl: 3, sr: 2,
    bangs: [[-14, -5, -15, -11.4, -2.2, -0.2], [-8, 1, -16, -4.8, -4.8, 0.3], [-3, 6, -16, 1.4, -3.2, 0.6], [2, 11, -16, 8, -5, 1], [7, 15, -15, 13.4, -3, 1.2], [13.5, 19, -8, 17.8, 7, 0.8]] },
  topknot: { W: 18.6, top: -24, sl: 2, sr: 1, ear: 1,
    bangs: [[-18.8, -12, -12, -17.2, 1, -0.5], [-14, -5.5, -15, -11, -4.4, 0.2], [-8.5, 0.5, -16, -4.4, -6.2, 0.4], [-3, 6, -16, 1.4, -4.6, 0.6], [2, 11, -16, 7.6, -6.2, 0.9], [7, 15, -15, 13, -4.4, 1], [12, 18.8, -12, 17.6, 1, 0.6]] },
  curly: { W: 19.6, top: -24, sl: 7, sr: 6, puffs: 1,
    bangs: [[-19.6, -12, -12, -18.6, 6, 2.4], [-15, -7, -14, -12, -2.6, 2.2], [-9.5, -1, -15, -5.8, -4.4, 2], [-4, 4.5, -15, 0.2, -3.4, 2], [1, 10, -15, 6.4, -4.4, 2], [6.5, 15, -14, 12.4, -2.8, 2], [12, 19.6, -12, 18.6, 5, 1.6]] },
};
function hairDef(K) { return HAIR[K.look.hair] || HAIR.short; }

/** 毛束（葉形）: a→先端→b。bulge で外側へ膨らむ */
function leaf(ctx, ax, ay, bx, by, tx, ty, bend) {
  // 巻き方向を常に時計回り（画面座標で正の面積）に揃える＝ドームや円と合成しても nonzero で打ち消し合わない
  if ((tx - ax) * (by - ay) - (bx - ax) * (ty - ay) < 0) { const qx = ax, qy = ay; ax = bx; ay = by; bx = qx; by = qy; }
  const mx0 = (ax + bx) / 2, my0 = (ay + by) / 2;
  const dx = tx - mx0, dy = ty - my0;
  const L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(lerp(ax, tx, 0.55) + px * bend + (ax - mx0) * 0.3, lerp(ay, ty, 0.55) + py * bend + (ay - my0) * 0.3, tx, ty);
  ctx.quadraticCurveTo(lerp(bx, tx, 0.45) + px * bend + (bx - mx0) * 0.3, lerp(by, ty, 0.45) + py * bend + (by - my0) * 0.3, bx, by);
  ctx.closePath();
}
function spikeLeaf(ctx, sp, sway) {
  const [an, len, wd] = sp;
  const dx = Math.cos(an), dy = Math.sin(an);
  const px = -dy, py = dx;
  const cx = 0.5, cy = -5;
  const r0 = 11;
  const bx = cx + dx * r0, by = cy + dy * r0;
  // 上向きの毛束ほど後ろ（-x）へ流す
  const tx = cx + dx * len - sway * 1.2 * (dy < -0.3 ? 1 : 0.4) - Math.max(0, -dy) * 3.2, ty = cy + dy * len + Math.max(0, -dy) * 0.6;
  leaf(ctx, bx + px * wd / 2, by + py * wd / 2, bx - px * wd / 2, by - py * wd / 2, tx, ty, 1.6);
}
function hairFrontPath(ctx, K, H, bangsOnly) {
  const sway = K.P.hairSway * 0.5;
  if (!bangsOnly) {
    const W = H.W, top = H.top;
    ctx.moveTo(-W, H.sl);
    ctx.bezierCurveTo(-W - 0.8, top + 5, -W * 0.55, top, 0.5, top);
    ctx.bezierCurveTo(W * 0.55, top, W + 0.8, top + 5, W, H.sr);
    ctx.lineTo(W - 3.4, H.sr);
    ctx.quadraticCurveTo(W - 2.6, -9, FO, -12.6);
    ctx.quadraticCurveTo(-W + 2.6, -9, -W + 3.4, H.sl);
    ctx.closePath();
    if (H.spikes) { const cov = K.eq.hat && HAT_COVERS[K.eq.hat.style]; for (const sp of H.spikes) if (!cov || Math.sin(sp[0]) > -0.55) spikeLeaf(ctx, sp, sway); }
    if (H.puffs) {
      for (let i = 0; i < 9; i++) {
        const a = PI * 0.95 + (i / 8) * PI * 1.1;
        const r = 7 + (i % 2) * 1.2;
        ctx.moveTo(Math.cos(a) * 18 + r, -4 + Math.sin(a) * 17);
        ctx.arc(Math.cos(a) * 18, -4 + Math.sin(a) * 17, r, 0, TAU);
      }
    }
  }
  for (const b of H.bangs) {
    const len = (b[4] - b[2]) / 20;
    const tx = b[3] - sway * len * (Math.abs(b[3]) > 14 ? 1.6 : 0.6);
    leaf(ctx, b[0], b[2], b[1], b[2], tx, b[4], b[5]);
  }
}
function drawHairFront(ctx, K, H) {
  const C0 = hairCols(K);
  ctx.beginPath(); hairFrontPath(ctx, K, H, false);
  ctx.strokeStyle = OC(); ctx.lineWidth = OLW * 2; ctx.lineJoin = 'round'; ctx.stroke();
  if (FL) { ctx.fillStyle = '#ffffff'; ctx.fill(); }
  else {
    const g = ctx.createLinearGradient(0, H.top - 6, 0, 16);
    g.addColorStop(0, mx(C0.base, C0.hi, 0.3)); g.addColorStop(0.42, C0.base); g.addColorStop(1, mx(C0.base, C0.dark, 0.5));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    // 影側（右）と毛先の暗色
    ctx.fillStyle = ra(C0.dark, 0.6);
    ctx.beginPath(); ctx.ellipse(H.W + 3, -1, 9, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = ra(C0.dark, 0.35);
    ctx.beginPath(); ctx.ellipse(FO, 9, 26, 13, 0, 0, TAU); ctx.fill();
    // 内側（前髪の奥）の暗色
    ctx.fillStyle = ra(C0.deep, 0.5);
    ctx.beginPath(); ctx.moveTo(-14, -9.5); ctx.quadraticCurveTo(FO, -15, 15, -9.5); ctx.quadraticCurveTo(FO, -11.5, -14, -9.5); ctx.fill();
    // 天使の輪（ギザギザのツヤ帯）
    hairShine(ctx, C0.hi, H);
    // 毛束の線
    ctx.strokeStyle = ra(C0.deep, 0.75); ctx.lineWidth = 0.7; ctx.beginPath();
    const sway = K.P.hairSway * 0.5;
    for (const b of H.bangs) {
      const len = (b[4] - b[2]) / 20;
      const tx = b[3] - sway * len * (Math.abs(b[3]) > 14 ? 1.6 : 0.6);
      const sx = lerp(b[0], b[1], 0.62);
      ctx.moveTo(lerp(tx, sx, 0.15), lerp(b[4], b[2], 0.15));
      ctx.quadraticCurveTo(lerp(tx, sx, 0.45) + b[5] * 0.6, lerp(b[4], b[2], 0.45), lerp(tx, sx, 0.72), lerp(b[4], b[2], 0.72));
    }
    if (H.spikes) {
      const cov = K.eq.hat && HAT_COVERS[K.eq.hat.style];
      for (const sp of H.spikes) {
        if (cov && Math.sin(sp[0]) <= -0.55) continue;
        const dx = Math.cos(sp[0]), dy = Math.sin(sp[0]);
        ctx.moveTo(0.5 + dx * (sp[1] * 0.85), -5 + dy * (sp[1] * 0.85)); ctx.lineTo(0.5 + dx * 13, -5 + dy * 13);
      }
    }
    ctx.stroke();
    // メッシュ
    if (K.look.mesh) {
      const b = H.bangs[H.mesh || 4] || H.bangs[0];
      ctx.strokeStyle = K.look.mesh; ctx.lineWidth = 1.7; ctx.beginPath();
      const sx = (b[0] + b[1]) / 2;
      ctx.moveTo(sx, b[2] - 2); ctx.quadraticCurveTo(lerp(sx, b[3], 0.5) + b[5], lerp(b[2], b[4], 0.5), lerp(sx, b[3], 0.9), lerp(b[2], b[4], 0.9));
      ctx.stroke();
    }
    // リムライト（影側の縁）
    if (!H.spikes && !H.puffs) {
      ctx.save(); ctx.beginPath(); ctx.rect(5, -40, 30, 60); ctx.clip();
      const W = H.W, top = H.top;
      ctx.beginPath(); ctx.moveTo(0.5 - 1.4, top + 0.7); ctx.bezierCurveTo(W * 0.55 - 1.4, top + 0.7, W + 0.8 - 1.5, top + 5.6, W - 1.5, H.sr + 0.4);
      ctx.strokeStyle = ra(RIM, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // アホ毛
  if (H.ahoge && !(K.eq.hat && HAT_COVERS[K.eq.hat.style])) {
    const sw = K.P.hairSway;
    ctx.beginPath();
    ctx.moveTo(FO - 2, H.top + 2.5);
    ctx.quadraticCurveTo(FO - 1, H.top - 7, FO + 5 - sw * 1.5, H.top - 8.5);
    ctx.quadraticCurveTo(FO + 1, H.top - 5, FO + 1.6, H.top + 2.6);
    ctx.closePath();
    if (H.ahoge > 1) {
      ctx.moveTo(FO + 3, H.top + 2.5);
      ctx.quadraticCurveTo(FO + 6, H.top - 4, FO + 10 - sw, H.top - 3.5);
      ctx.quadraticCurveTo(FO + 7, H.top - 2, FO + 6.4, H.top + 3);
      ctx.closePath();
    }
    strokeFill(ctx, C0.base, 1.3);
  }
  // ヘアゴム・飾り
  const hs = K.look.hair;
  if (hs === 'twin') {
    const tc = K.look.tie || '#ffd23f';
    for (const sx of [-16, 15.6]) {
      ctx.beginPath(); ctx.arc(sx, -10, 2.8, 0, TAU); fillStroke(ctx, tc, 1.2);
      ctx.fillStyle = C(sh(tc, -0.2)); ctx.beginPath(); ctx.arc(sx + 0.6, -9.4, 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(sx - 0.9, -11, 0.9, 0, TAU); ctx.fill();
    }
  } else if (hs === 'ponytail') {
    ctx.beginPath(); ctx.arc(-14.4, -12.6, 2.4, 0, TAU); fillStroke(ctx, K.look.tie || '#ff5fa2', 1.1);
  } else if (hs === 'braid') {
    ctx.beginPath(); ctx.arc(-15.4, -7, 2.2, 0, TAU); fillStroke(ctx, K.look.tie || '#ff5fa2', 1.1);
  } else if (hs === 'sidepart' && !FL) {
    ctx.fillStyle = C(K.look.tie || '#ffd23f'); ctx.beginPath(); rrect(ctx, 10.5, -10.5, 5, 1.6, 0.8); ctx.fill();
  }
}
const HAT_COVERS = { cap: 1, beanie: 1, bandana: 1, helmet: 1, cowboy: 1 };
function hairShine(ctx, col, H) {
  const cx = FO - 0.5, cy = -3;
  ctx.fillStyle = col;
  const segs = [[-2.55, -2.05], [-1.85, -1.3], [-1.12, -0.62]];
  for (const [a0, a1] of segs) {
    ctx.beginPath();
    const r1 = 17.2, r2 = 14.2, n = 5;
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); const x = cx + Math.cos(a) * r1, y = cy + Math.sin(a) * r1 * 0.95; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    for (let i = n; i >= 0; i--) {
      const a = lerp(a0, a1, i / n); const r = i % 2 ? r2 - 1.6 : r2 + 0.6;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95);
    }
    ctx.closePath(); ctx.fill();
  }
  // 小さな光の点
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(cx - 9, cy - 12, 1.2, 0.7, -0.6, 0, TAU); ctx.fill();
}

/** 尻尾（ツイン/ポニー等）: 根元 (x0,y0)、向き a0（0=下, +=右）。曲がり curl・揺れ sway。forks で毛先を割る */
const TP = new Float64Array(64);
function tailPath(ctx, x0, y0, a0, len, w0, curl, sway, n, forks) {
  let x = x0, y = y0, ang = a0;
  const seg = len / n;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    TP[i * 2] = x; TP[i * 2 + 1] = y;
    ang = a0 + curl * u + sway * u * u;
    x += Math.sin(ang) * seg; y += Math.cos(ang) * seg;
  }
  const wAt = (u) => w0 * (0.7 + 0.55 * Math.sin(Math.min(1, u * 1.4) * PI * 0.8)) * Math.pow(1 - u, 0.65);
  const nrm = (i) => {
    const j = Math.min(n, i + 1), k = Math.max(0, i - 1);
    const dx = TP[j * 2] - TP[k * 2], dy = TP[j * 2 + 1] - TP[k * 2 + 1];
    const L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  };
  // 左側
  for (let i = 0; i <= n; i++) {
    const [nx, ny] = nrm(i), wv = wAt(i / n) / 2;
    const px = TP[i * 2] + nx * wv, py = TP[i * 2 + 1] + ny * wv;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  // 毛先のフォーク（先端から少し戻った位置に切れ込み）
  if (forks > 1) {
    const i2 = n - 2;
    const [nx, ny] = nrm(i2);
    const ex = TP[n * 2], ey = TP[n * 2 + 1];
    ctx.lineTo(TP[i2 * 2] + nx * 0.4, TP[i2 * 2 + 1] + ny * 0.4);
    const [nx2, ny2] = nrm(n);
    ctx.lineTo(ex - nx2 * w0 * 0.42, ey - ny2 * w0 * 0.42 - 0.5);
  }
  for (let i = n; i >= 0; i--) {
    const [nx, ny] = nrm(i), wv = wAt(i / n) / 2;
    ctx.lineTo(TP[i * 2] - nx * wv, TP[i * 2 + 1] - ny * wv);
  }
  ctx.closePath();
  return n;
}
function tailDetail(ctx, C0, n, w0) {
  // ツヤと毛束の線（直前の tailPath の背骨 TP を使う）
  ctx.strokeStyle = ra(C0.hi, 0.75); ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 1; i <= Math.floor(n * 0.45); i++) { const x = TP[i * 2] - 1.2, y = TP[i * 2 + 1]; if (i === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.strokeStyle = ra(C0.deep, 0.65); ctx.lineWidth = 0.7; ctx.beginPath();
  for (let i = 2; i <= n - 1; i++) { const x = TP[i * 2] + w0 * 0.12, y = TP[i * 2 + 1]; if (i === 2) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
}

function drawHairBack(ctx, K, backView) {
  const st = K.look.hair || 'short';
  const C0 = hairCols(K);
  const P = K.P;
  const sway = P.hairSway || 0, lift = P.hairLift || 0;
  const wob = Math.sin(K.t * om(K.w, 1.4)) * 0.06;
  const bcol = backView ? C0.base : C0.back;
  const fillTail = (yTop, yBot, tip) => {
    if (FL) { ctx.fillStyle = '#ffffff'; return; }
    const g = ctx.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, C0.base); g.addColorStop(0.55, C0.base); g.addColorStop(1, tip || mx(C0.base, C0.dark, 0.55));
    ctx.fillStyle = g;
  };
  // 尻尾類
  if (st === 'twin') {
    const tip = K.look.hairTip;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      const a0 = side * 0.55 - sway * 0.25 + wob;
      const n = tailPath(ctx, side * 15.2, -10, a0, 38, 11, -side * 0.75 - lift * side * 0.5, -sway * 0.35 + side * lift * 0.9, 9, 2);
      ctx.strokeStyle = OC(); ctx.lineWidth = OLW * 2; ctx.stroke();
      fillTail(-10, 26, tip); ctx.fill();
      if (!FL) tailDetail(ctx, C0, n, 11);
    }
  } else if (st === 'ponytail') {
    ctx.beginPath();
    const n = tailPath(ctx, -14.5, -13, -1.05 - sway * 0.2 + wob, 31, 11, 1.1 + lift * 0.3, -sway * 0.5 - lift * 0.9, 8, 2);
    ctx.strokeStyle = OC(); ctx.lineWidth = OLW * 2; ctx.stroke();
    fillTail(-14, 16); ctx.fill();
    if (!FL) tailDetail(ctx, C0, n, 11);
  } else if (st === 'braid') {
    let bx = -14, by = -6;
    const N = 7;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const nx = -16.5 - i * 0.9 - sway * (i * 0.7) - lift * i * 1.4, ny = by + 5.6 - lift * i * 0.5;
      ctx.beginPath(); ctx.ellipse((bx + nx) / 2, (by + ny) / 2, 4.4 - u * 1.2, 3.8 - u * 0.6, (i % 2 ? 0.6 : -0.6), 0, TAU);
      fillStroke(ctx, i % 2 ? C0.base : mx(C0.base, C0.dark, 0.35), 1.5);
      if (!FL) { ctx.strokeStyle = ra(C0.hi, 0.8); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse((bx + nx) / 2 - 0.8, (by + ny) / 2 - 0.6, 2.2, 1.4, (i % 2 ? 0.6 : -0.6), PI * 1.1, PI * 1.7); ctx.stroke(); }
      bx = nx; by = ny;
    }
    ctx.beginPath(); ctx.arc(bx, by + 1, 2.2, 0, TAU); fillStroke(ctx, K.look.tie || '#ff5fa2', 1.1);
    ctx.beginPath(); leaf(ctx, bx - 2.6, by + 2.6, bx + 2.4, by + 2.6, bx - 0.6 - sway, by + 9.5, 0.4); fillStroke(ctx, C0.base, 1.2);
  } else if (st === 'bun') {
    ctx.beginPath(); ctx.arc(-6, -20, 7.6, 0, TAU); fillStroke(ctx, C0.base);
    if (!FL) {
      ctx.strokeStyle = ra(C0.deep, 0.7); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(-6, -20, 4.8, 0.4, 2.6); ctx.arc(-6, -20, 2.4, 2.8, 5.2); ctx.stroke();
      ctx.strokeStyle = C0.hi; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-6, -20, 5.2, -2.7, -1.4); ctx.stroke();
    }
  } else if (st === 'topknot') {
    ctx.beginPath(); ctx.ellipse(-2, -24, 6.6, 6.2, -0.2, 0, TAU); fillStroke(ctx, C0.base);
    ctx.beginPath(); ctx.ellipse(-2, -18.4, 4, 1.8, 0, 0, TAU); fillStroke(ctx, K.look.tie || '#ff3d7f', 1.1);
    if (!FL) { ctx.strokeStyle = C0.hi; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(-2, -24, 3.6, -2.6, -1.2); ctx.stroke(); }
  }
  // 後頭部＋襟足（毛束の合成シルエット）
  ctx.beginPath();
  ctx.ellipse(0, -2.5, 18.8, 17.6, 0, 0, TAU);
  const sw = sway * 0.8;
  switch (st) {
    case 'long': {
      const L = 36 - lift * 6;
      const tips = [[-17.5, -12, -17 - sw, L - 2, -1], [-12, -5, -11 - sw, L + 2, -0.5], [-6, 2, -4.5 - sw, L, 0], [0, 8, 3.5 - sw, L + 1.5, 0.4], [6, 13.5, 10 - sw, L - 1, 0.8], [11, 18.5, 15.5 - sw, L - 4, 1]];
      for (const p of tips) leaf(ctx, p[0], 4, p[1], 4, p[2] - lift * 2, p[3], p[4]);
      ctx.moveTo(-19, -4); ctx.lineTo(19, -4); ctx.lineTo(18, 22); ctx.lineTo(-18.5, 22); ctx.closePath();
      break;
    }
    case 'bob': case 'sidepart':
      for (const p of [[-19.6, -13, -18.5 - sw * 0.5, 14.5, 1.2], [-14, -6, -12 - sw * 0.5, 16, 0.6], [6, 14, 12 - sw * 0.5, 15.5, -0.6], [13, 19.6, 18.6 - sw * 0.5, 13.5, -1.2]]) leaf(ctx, p[0], 0, p[1], 0, p[2], p[3], p[4]);
      ctx.moveTo(-19.4, -2); ctx.lineTo(19.4, -2); ctx.lineTo(16, 13); ctx.lineTo(-16, 13.5); ctx.closePath();
      break;
    case 'wolf':
      for (const p of [[-18, -11, -21 - sw * 1.5, 19, -1], [-13, -6, -14 - sw * 1.4, 22, -0.5], [-8, -1, -7.5 - sw, 17, 0], [9, 17, 15 - sw, 15, 1]]) leaf(ctx, p[0], 4, p[1], 4, p[2], p[3], p[4]);
      break;
    case 'messy': case 'short': case 'spiky':
      for (const p of [[-18, -11, -19.5 - sw, 12, -0.8], [-12, -5, -11.5 - sw, 13, 0], [9, 16, 14 - sw * 0.5, 10.5, 0.8]]) leaf(ctx, p[0], 4, p[1], 4, p[2], p[3], p[4]);
      break;
    case 'curly':
      for (let i = 0; i < 13; i++) { const a = PI * 0.82 + (i / 12) * PI * 1.36; const x = Math.cos(a) * 19.5, y = -3 + Math.sin(a) * 18, r = 7 + (i % 2) * 1.2; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.moveTo(-17 + 6.5, 9); ctx.arc(-17, 9, 6.5, 0, TAU); ctx.moveTo(17 + 6.5, 9); ctx.arc(17, 9, 6.5, 0, TAU);
      break;
    case 'twin': case 'ponytail': case 'bun': case 'braid':
      for (const p of [[-17, -11, -16.5 - sw * 0.5, 9, -0.4], [9, 16, 14.5 - sw * 0.4, 8.5, 0.5]]) leaf(ctx, p[0], 2, p[1], 2, p[2], p[3], p[4]);
      break;
    default: break;
  }
  ctx.strokeStyle = OC(); ctx.lineWidth = OLW * 2; ctx.stroke();
  ctx.fillStyle = C(bcol); ctx.fill();
  if (!FL) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = ra(C0.deep, 0.45); ctx.beginPath(); ctx.ellipse(6, 14, 22, 12, 0, 0, TAU); ctx.fill();
    if (backView) {
      ctx.strokeStyle = ra(C0.deep, 0.7); ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(0, -8); ctx.moveTo(-8, 10); ctx.lineTo(-5, 3); ctx.moveTo(8, 10); ctx.lineTo(5, 3); ctx.moveTo(-13, 4); ctx.lineTo(-11, -3); ctx.stroke();
      hairShine(ctx, C0.hi, hairDef(K));
    } else {
      ctx.strokeStyle = ra(C0.deep, 0.6); ctx.lineWidth = 0.7; ctx.beginPath();
      ctx.moveTo(-15, 4); ctx.quadraticCurveTo(-16, 10, -15.5, 14); ctx.moveTo(14, 4); ctx.quadraticCurveTo(15, 9, 14, 12); ctx.stroke();
    }
    ctx.restore();
  }
  if (st === 'undercut' && !backView) {
    // 刈り上げ（側頭部）
    ctx.fillStyle = C(ra(C0.dark, 0.6)); ctx.beginPath(); ctx.ellipse(-15.5, 0, 3.6, 6, 0.1, 0, TAU); ctx.fill();
  }
  if (st === 'wolf' && K.look.mesh && !FL) {
    ctx.fillStyle = K.look.mesh; ctx.beginPath(); leaf(ctx, -17.5, 5, -14, 5, -20.5 - sw * 1.5, 18, -0.8); ctx.fill();
  }
  if (backView) {
    if (st === 'twin') {
      ctx.fillStyle = C(K.look.tie || '#ffd23f');
      ctx.beginPath(); ctx.arc(-14, -10, 2.6, 0, TAU); ctx.arc(14, -10, 2.6, 0, TAU); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- 帽子
function drawHat(ctx, K, back) {
  const h = K.eq.hat;
  if (!h) return;
  const [c, a] = itemColors(h);
  const st = h.style;
  const r = K.rHat;
  switch (st) {
    case 'cap':
      ctx.beginPath(); ctx.moveTo(-18.6, -7); ctx.bezierCurveTo(-19.2, -26.5, 19.2, -26.5, 18.6, -7); ctx.closePath(); fillStroke(ctx, c);
      ctx.save(); ctx.beginPath(); ctx.moveTo(-18.6, -7); ctx.bezierCurveTo(-19.2, -26.5, 19.2, -26.5, 18.6, -7); ctx.closePath(); ctx.clip();
      ctx.fillStyle = C(sh(c, -0.2)); ctx.beginPath(); ctx.ellipse(16, -10, 10, 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = C(sh(c, -0.3)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, -21.5); ctx.quadraticCurveTo(-6, -15, -7, -7); ctx.moveTo(0, -21.5); ctx.quadraticCurveTo(7, -15, 8, -7); ctx.stroke();
      ctx.restore();
      if (!back) {
        ctx.beginPath(); ctx.moveTo(10, -9); ctx.quadraticCurveTo(26, -10, 29, -5.5); ctx.quadraticCurveTo(20, -4, 12, -5.5); ctx.closePath(); fillStroke(ctx, a);
        ctx.strokeStyle = C(sh(a, -0.3)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(13, -6.8); ctx.quadraticCurveTo(21, -7.4, 26.5, -5.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(3, -14.5, 3.4, 0, TAU); fillStroke(ctx, a, 1.1);
        ctx.fillStyle = C(c); ctx.beginPath(); starPathLocal(ctx, 3, -14.5, 2.2, 1); ctx.fill();
      }
      ctx.fillStyle = C(sh(c, -0.25)); ctx.beginPath(); ctx.arc(0, -21.8, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = C(ra('#ffffff', 0.4)); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -8, 13, -2.6, -1.9); ctx.stroke();
      break;
    case 'beanie':
      ctx.beginPath(); ctx.moveTo(-18.8, -5); ctx.bezierCurveTo(-19.5, -27, 19.5, -27, 18.8, -5); ctx.closePath(); fillStroke(ctx, c);
      ctx.strokeStyle = C(sh(c, -0.18)); ctx.lineWidth = 0.7; ctx.beginPath();
      for (let x = -12; x <= 12; x += 4) { ctx.moveTo(x * 1.1, -10); ctx.quadraticCurveTo(x * 0.9, -18, x * 0.5, -22); } ctx.stroke();
      ctx.beginPath(); rrect(ctx, -19.4, -10, 38.8, 6, 2.6); fillStroke(ctx, sh(c, -0.15));
      ctx.strokeStyle = C(sh(c, -0.35)); ctx.lineWidth = 0.7; ctx.beginPath();
      for (let x = -16; x <= 16; x += 3) { ctx.moveTo(x, -9); ctx.lineTo(x, -5); } ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -23.5, 4, 0, TAU); fillStroke(ctx, a);
      ctx.strokeStyle = C(sh(a, -0.25)); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-2, -25); ctx.lineTo(1.5, -21.5); ctx.moveTo(1.5, -26); ctx.lineTo(-1.5, -22); ctx.stroke();
      break;
    case 'bandana':
      ctx.beginPath(); ctx.moveTo(-18.8, -7); ctx.bezierCurveTo(-19, -24, 19, -24, 18.8, -7);
      ctx.quadraticCurveTo(0, -11, -18.8, -7); ctx.closePath(); fillStroke(ctx, c);
      ctx.fillStyle = C(a);
      for (const [dx, dy] of [[-9, -15], [0, -18], [9, -15], [-4, -11], [5, -11.5], [13, -10]]) { ctx.beginPath(); ctx.arc(dx, dy, 1, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = C(sh(c, -0.3)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-14, -9); ctx.quadraticCurveTo(0, -12.5, 14, -9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-17, -9); ctx.lineTo(-26, -14); ctx.lineTo(-24, -8); ctx.closePath(); ctx.moveTo(-17, -8); ctx.lineTo(-25, -2); ctx.lineTo(-20, -2); ctx.closePath(); fillStroke(ctx, c, 1.5);
      break;
    case 'headphones':
      ctx.strokeStyle = OC(); ctx.lineWidth = 5.6; ctx.beginPath(); ctx.arc(0, -2, 19.5, PI * 1.08, PI * 1.92); ctx.stroke();
      ctx.strokeStyle = C(c); ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = C(ra('#ffffff', 0.35)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, -2, 19.5, PI * 1.2, PI * 1.5); ctx.stroke();
      ctx.beginPath(); rrect(ctx, -22, -6, 8, 12, 3.5); fillStroke(ctx, c);
      ctx.beginPath(); rrect(ctx, -20.5, -3.5, 5, 7, 2); ctx.fillStyle = C(a); ctx.fill();
      ctx.fillStyle = C(ra('#ffffff', 0.4)); ctx.fillRect(-21, -5, 1.2, 4);
      if (!back) { ctx.beginPath(); rrect(ctx, 16.5, -6, 4.5, 10, 2); fillStroke(ctx, sh(c, -0.15), 1.6); ctx.fillStyle = C(a); ctx.fillRect(18, -3, 1.4, 4); }
      break;
    case 'crown':
      ctx.save(); ctx.translate(2, -19); ctx.rotate(0.12);
      ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-9, -6); ctx.lineTo(-4.5, -1.5); ctx.lineTo(0, -9); ctx.lineTo(4.5, -1.5); ctx.lineTo(9, -6); ctx.lineTo(8, 3); ctx.closePath();
      fillStroke(ctx, c, 1.8);
      ctx.fillStyle = C(sh(c, -0.22)); ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(4.5, -1.5); ctx.lineTo(9, -6); ctx.lineTo(8, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(ra('#ffffff', 0.55)); ctx.beginPath(); ctx.moveTo(-7.5, 1.6); ctx.lineTo(-8, -3.5); ctx.lineTo(-6.6, -2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(a); ctx.beginPath(); ctx.arc(0, -0.5, 1.6, 0, TAU); ctx.arc(-5, 0.8, 1.1, 0, TAU); ctx.arc(5, 0.8, 1.1, 0, TAU); ctx.fill();
      ctx.fillStyle = C('#ffffff'); ctx.beginPath(); ctx.arc(0, -9, 1.2, 0, TAU); ctx.arc(-9, -6, 1, 0, TAU); ctx.arc(9, -6, 1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-0.5, -1, 0.5, 0, TAU); ctx.fill();
      if (r >= 3 && !FL) sparkle(ctx, 6.5, -8.5, 2.2, 'rgba(255,255,255,0.95)');
      ctx.restore();
      break;
    case 'helmet':
      ctx.beginPath(); ctx.moveTo(-19.6, 4); ctx.bezierCurveTo(-21, -28, 21, -28, 19.6, -3); ctx.lineTo(19.6, -2); ctx.lineTo(-19.6, 4); ctx.closePath();
      fillStroke(ctx, c);
      ctx.save(); ctx.beginPath(); ctx.moveTo(-19.6, 4); ctx.bezierCurveTo(-21, -28, 21, -28, 19.6, -3); ctx.lineTo(-19.6, 4); ctx.closePath(); ctx.clip();
      ctx.fillStyle = C(sh(c, -0.25)); ctx.beginPath(); ctx.ellipse(17, -4, 10, 18, 0, 0, TAU); ctx.fill();
      ctx.restore();
      if (!back) {
        ctx.beginPath(); ctx.moveTo(-10, -9); ctx.quadraticCurveTo(6, -14, 21, -9); ctx.lineTo(21, -4); ctx.quadraticCurveTo(6, -8, -10, -5); ctx.closePath();
        ctx.fillStyle = C(ra(a, 0.85)); ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.stroke();
        ctx.strokeStyle = C(ra('#ffffff', 0.7)); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(4, -12, 12, -11); ctx.stroke();
      }
      ctx.strokeStyle = C(a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -22); ctx.quadraticCurveTo(-14, -14, -16, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -6, 14, -2.5, -1.8); ctx.stroke();
      break;
    case 'cowboy':
      ctx.beginPath(); ctx.ellipse(0, -10, 29, 6, -0.04, 0, TAU); fillStroke(ctx, sh(c, -0.08));
      ctx.strokeStyle = C(sh(c, 0.2)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(0, -10.4, 25, 4.4, -0.04, PI * 1.05, PI * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, -11); ctx.bezierCurveTo(-14, -28, -6, -30, 0, -25); ctx.bezierCurveTo(6, -30, 14, -28, 12, -11); ctx.closePath(); fillStroke(ctx, c);
      ctx.fillStyle = C(sh(c, -0.2)); ctx.beginPath(); ctx.moveTo(4, -11); ctx.bezierCurveTo(5, -20, 4, -26, 6, -27.5); ctx.bezierCurveTo(13, -27, 14, -20, 12, -11); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(a); ctx.fillRect(-12.3, -15, 24.6, 3);
      ctx.strokeStyle = OC(); ctx.lineWidth = 1; ctx.strokeRect(-12.3, -15, 24.6, 3);
      break;
    case 'catEars': {
      const wig = Math.sin(K.t * om(K.w, 5)) > 0.92 ? 0.15 : 0;
      for (const [ex, rot] of [[-10, -0.35 - wig], [9, 0.35]]) {
        ctx.save(); ctx.translate(ex, -15); ctx.rotate(rot);
        ctx.beginPath(); ctx.moveTo(-6, 2); ctx.quadraticCurveTo(-3, -6, 0, -11); ctx.quadraticCurveTo(3, -6, 6, 2); ctx.closePath(); fillStroke(ctx, c);
        ctx.beginPath(); ctx.moveTo(-3.2, 0.5); ctx.quadraticCurveTo(-1.4, -3.6, 0, -6.5); ctx.quadraticCurveTo(1.4, -3.6, 3.2, 0.5); ctx.closePath(); ctx.fillStyle = C(a); ctx.fill();
        ctx.strokeStyle = C(ra('#ffffff', 0.6)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-4.4, 0); ctx.lineTo(-2, -6); ctx.stroke();
        ctx.restore();
      }
      if (r >= 2 && !FL) { sparkle(ctx, 12.5, -24, 1.6, 'rgba(255,255,255,0.9)'); }
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
function drawGlasses(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  const y = 1.8;
  for (const cx of [FO - 6.4, FO + 7]) {
    ctx.beginPath(); rrect(ctx, cx - 4.8, y - 3, 9.6, 6.4, 2.6);
    if (FL) ctx.fillStyle = '#fff';
    else { const g = ctx.createLinearGradient(0, y - 3, 0, y + 3.4); g.addColorStop(0, sh(c, -0.2)); g.addColorStop(1, sh(c, 0.35)); ctx.fillStyle = g; }
    ctx.fill(); ctx.strokeStyle = C(a); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 3, y - 0.8); ctx.lineTo(cx - 0.8, y - 2.2); ctx.moveTo(cx + 1.6, y + 1.8); ctx.lineTo(cx + 2.8, y + 1); ctx.stroke();
  }
  ctx.strokeStyle = C(a); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(FO - 1.6, y - 1); ctx.lineTo(FO + 2.2, y - 1);
  ctx.moveTo(FO - 11.2, y - 1); ctx.lineTo(-16, y - 2); ctx.stroke();
}
function drawMask(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  ctx.beginPath(); ctx.moveTo(-15.8, 4.5); ctx.quadraticCurveTo(FO, 3, 16, 4); ctx.bezierCurveTo(16, 9, 10, 15, FO + 1, 15.6);
  ctx.bezierCurveTo(-7, 15.6, -15.8, 10, -15.8, 4.5); ctx.closePath(); fillStroke(ctx, c, 1.8);
  ctx.fillStyle = C(sh(c, -0.18)); ctx.beginPath(); ctx.moveTo(10, 4.4); ctx.quadraticCurveTo(15.8, 4.2, 16, 4.6); ctx.bezierCurveTo(16, 9, 10, 15, FO + 1, 15.4); ctx.quadraticCurveTo(10, 11, 10, 4.4); ctx.fill();
  ctx.strokeStyle = C(a); ctx.lineWidth = 1.2; ctx.beginPath();
  ctx.moveTo(FO - 6, 9.5); for (let i = 0; i <= 6; i++) ctx.lineTo(FO - 6 + i * 2.2, i % 2 ? 11.6 : 9.5);
  ctx.stroke();
  ctx.fillStyle = C(a); ctx.beginPath(); ctx.ellipse(FO + 1.2, 6.8, 1.2, 0.8, 0, 0, TAU); ctx.fill();
}
function drawChain(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  ctx.strokeStyle = OC(); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-5.5, -20); ctx.quadraticCurveTo(0.5, -9, 6.5, -20); ctx.stroke();
  ctx.strokeStyle = C(c); ctx.lineWidth = 1.8; ctx.setLineDash([1.6, 0.9]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(0.5, -14.6); ctx.lineTo(3.3, -11.8); ctx.lineTo(0.5, -9); ctx.lineTo(-2.3, -11.8); ctx.closePath(); fillStroke(ctx, c, 1.1);
  ctx.fillStyle = C(a); ctx.beginPath(); ctx.arc(0.5, -11.8, 0.9, 0, TAU); ctx.fill();
  if (!FL) sparkle(ctx, 2.6, -13.6, 1.3, 'rgba(255,255,255,0.9)');
}
function drawScarfTail(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  const w = Math.sin(K.t * om(K.w, 6)) * 2 + K.P.hairSway * 2;
  ctx.beginPath(); ctx.moveTo(-4, -21); ctx.bezierCurveTo(-12, -22 + w, -18, -18 - w, -24, -15 + w);
  ctx.lineTo(-23, -10 + w); ctx.bezierCurveTo(-16, -13, -10, -15, -3, -17); ctx.closePath(); fillStroke(ctx, c, 1.7);
  ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-22, -14 + w); ctx.lineTo(-21.5, -11 + w); ctx.stroke();
}
function drawScarfFront(ctx, K) {
  const [c, a] = itemColors(K.eq.accessory);
  ctx.beginPath(); rrect(ctx, -8.5, -22.5, 18, 5.6, 2.8); fillStroke(ctx, c, 1.8);
  ctx.fillStyle = C(sh(c, -0.2)); ctx.fillRect(3, -22, 6, 4.6);
  ctx.strokeStyle = C(a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -19.7); ctx.lineTo(8, -19.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -18); ctx.lineTo(7.5, -9); ctx.lineTo(3, -10); ctx.closePath(); fillStroke(ctx, c, 1.4);
}
function drawWings(ctx, K, back) {
  const [c, a] = itemColors(K.eq.accessory);
  const flap = Math.sin(K.t * om(K.w, 4)) * 0.12;
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
  const bob = Math.sin(K.t * om(K.w, 2.5)) * 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = FL ? '#fff' : rgba(c, 0.35); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(1, -29 + bob, 11, 3.2, 0, 0, TAU); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = C(c); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(1, -29 + bob, 11, 3.2, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = C(a); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(1, -29.4 + bob, 10, 2.6, 0, PI, TAU); ctx.stroke();
}

// ================================================================ リグ（パーツ式の着せ替え人形。仕様: docs/SPEC_SPRITES.md「リグ」）
//  AI が配置図の枠に描いたパーツ（胴・腕・脚・足・頭の上の物・背中）を、関節（肩・肘・股・膝・足首・首）の回転で動かす。
//  ポーズ（makePose）・関節の位置（BODY の長さ）はコード描画と同じ。肘・膝はパーツの絵を関節の位置で2つに分けて曲げる。
//  画像の読み込み・切り出し・色替え・合成は rig.js。ここは「休めの姿勢のコード描画をパーツに分けて描く」と「リグで描く」。

/** 休めの姿勢（直立、腕と脚はまっすぐ下） */
function restPose() {
  return {
    bob: 0, tilt: 0, hipY: 0, hx: 0, lb: [0, 0], lf: [0, 0], ab: [0, 0], af: [0, 0],
    eyes: 'n', mouth: 'n', brow: 'n', wAng: null, swoosh: null, back: false, lie: 0, headTilt: 0, hairSway: 0, hairLift: 0,
    showWeapon: false, muzzle: false, punch: false, sit: false, handF: 'fist', handB: 'fist', twist: 0,
  };
}
const RIG_LAYERS = {
  body: ['body'], top: ['top'], bottom: ['bottom'], shoes: ['shoes'], hat: ['hat'], accessory: ['accessory'], tear: ['tear'],
};
/** コードの胴・背中を v2 の肩の高さに合わせて描く: y0 より下はそのまま、上は縦に s 倍（境目は連続）。首は顎の少し上で切る */
function rigStretch(ctx, fn) {
  const { y0, s: k, top } = RIG_STRETCH;
  ctx.save(); ctx.beginPath(); ctx.rect(-400, y0, 800, 400); ctx.clip(); fn(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-400, top, 800, y0 - top); ctx.clip();
  ctx.translate(0, y0); ctx.scale(1, k); ctx.translate(0, -y0);
  fn(); ctx.restore();
}
/** 背中の物（翼・スカーフの端・フード）は首の上まで切らずに */
function rigStretchAll(ctx, fn) {
  const { y0, s: k } = RIG_STRETCH;
  ctx.save(); ctx.beginPath(); ctx.rect(-400, y0, 800, 400); ctx.clip(); fn(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-400, -400, 800, 400 + y0); ctx.clip();
  ctx.translate(0, y0); ctx.scale(1, k); ctx.translate(0, -y0);
  fn(); ctx.restore();
}
/**
 * 今のコード描画を、休めの姿勢・リグの骨格 v2（RIG_PROFILE）でパーツの枠に分けて描く
 * （配置図の参考シルエット・下絵・絵が無い装備の代わり・自己テストの仮のAI画像）。
 *  腕・脚は v2 の長さ（上腕9＋前腕9、太もも9＋すね9）、胴・背中は肩が -22 に来るよう上だけ縦に伸ばし、靴は 1.3 倍、頭の物は RIG_CODE_HEAD で置く。
 *  ctx: 配置図の px 座標（scale で縮小可）。group: 'body'|'top'|'bottom'|'shoes'|'hat'|'accessory'|'tear'|'head'（コードの頭＝参考）
 *       |'headFront'|'headBack'（頭の配置図用: コードの前の頭 / 後ろ髪だけ。opts.frame='head' で頭の配置図の座標）
 *  opts: { scale: 1単位の px（既定 RIG_S）, parts: 描く枠の名前の配列, dmg: 0..1（破れ・服の形）, clip: true | 余白px（枠で切る）,
 *          frame: 'head'（頭の配置図: 支点 HEAD_PX/HEAD_PY、1単位 = scale px） }
 */
export function renderRigCode(ctx, gender, look, equip, group, opts = {}) {
  const g = gender === 'm' ? 'm' : 'f';
  const base = look || (g === 'f' ? HERO_LOOKS.luna : HERO_LOOKS.jin);
  look = base.body === g ? base : Object.assign({}, base, { body: g });
  equip = equip || EMPTY;
  const S = opts.scale != null ? opts.scale : RIG_S;
  const k = S / RIG_S;
  const headOnly = group === 'headFront' || group === 'headBack';
  const parts = opts.parts || (group === 'head' || headOnly ? ['head'] : RIG_GROUP_PARTS[group] || []);
  const sv = [FL, RIM, TAG, ONLY, ONLY_RANK, NO_ERASE, RIG_NOSHOE, RIG_HEADITEMS];
  const P = restPose();
  const ws = equip.weapon && equip.weapon.style;
  const anim = { state: 'idle', t: 0, damage: opts.dmg || 0 };
  const K = makeK(look, equip, anim, 'idle', ws, 'none', P, 0, 0, TAU / LOOP, true);
  K.ai = null;
  if (group === 'head' || headOnly) resolveFace(P, K, anim);
  FL = false; RIM = look.rim || (g === 'f' ? '#9ff4ff' : '#8fe8ff');
  try {
    if (RIG_LAYERS[group]) setOnlyLayers(RIG_LAYERS[group], true); else ONLY = null;
    const c = ONLY ? layerProxy(ctx) : ctx;
    for (const name of parts) {
      const box = RIG_PARTS[name];
      if (!box) continue;
      ctx.save();
      if (opts.frame === 'head') ctx.translate(opts.px, opts.py);
      else {
        if (opts.clip) { const m = opts.clip === true ? 0 : opts.clip; ctx.beginPath(); ctx.rect((box.x - m) * k, (box.y - m) * k, (box.w + m * 2) * k, (box.h + m * 2) * k); ctx.clip(); }
        ctx.translate(box.px * k, box.py * k);
      }
      ctx.scale(S, S);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      TAG = 'body';
      switch (name) {
        case 'back': {
          const acc = equip.accessory && equip.accessory.style;
          rigStretchAll(c, () => {
            TAG = 'accessory_back';
            if (acc === 'wings') drawWings(c, K);
            if (acc === 'scarf') drawScarfTail(c, K);
            TAG = 'top';
            if (K.topS === 'hoodie') drawHood(c, K);
          });
          break;
        }
        case 'torso': {
          const acc = equip.accessory && equip.accessory.style;
          rigStretch(c, () => {
            TAG = 'body'; if (ONLY && ONLY.has('body')) innerHips(c, K);
            TAG = 'bottom';
            drawHips(c, K);
            if (K.botS === 'skirt') drawSkirt(c, K, K.botC, false);
            TAG = 'top';
            if (K.topS === 'idolDress') drawSkirt(c, K, K.topC, true);
            drawTorso(c, K);
            TAG = 'accessory';
            if (acc === 'goldChain') drawChain(c, K);
            if (acc === 'scarf') drawScarfFront(c, K);
          });
          break;
        }
        case 'armB': drawArm(c, K, false, 0, 0, 0, 0); break;
        case 'armF': drawArm(c, K, true, 0, 0, 0, 0); break;
        case 'legB': case 'legF':
          RIG_NOSHOE = true;
          try { drawLeg(c, K, name === 'legF', 0, 0, 0, 0); } finally { RIG_NOSHOE = false; }
          break;
        case 'footB': case 'footF':
          TAG = group === 'body' ? 'body' : 'shoes';
          ctx.translate(0, RIG_FOOT.dy); ctx.scale(RIG_FOOT.s, RIG_FOOT.s);
          drawShoe(c, group === 'body' ? Object.assign({}, K, { eq: EMPTY }) : K, 0, 0, 0, name === 'footF');
          break;
        case 'head': {
          enterCodeHead(ctx, K);
          if (group === 'head' || headOnly) {
            RIG_HEADITEMS = true;
            try {
              if (group !== 'headFront') drawHairBack(c, K);
              if (group !== 'headBack') drawHead(c, K);
            } finally { RIG_HEADITEMS = false; }
          } else {
            const acc = equip.accessory && equip.accessory.style;
            TAG = 'accessory';
            if (acc === 'mask') drawMask(c, K);
            if (acc === 'sunglasses') drawGlasses(c, K);
            TAG = 'hat';
            drawHat(c, K, false);
            TAG = 'accessory';
            if (acc === 'halo') drawHalo(c, K);
          }
          ctx.restore();
          break;
        }
      }
      ctx.restore();
    }
  } finally {
    [FL, RIM, TAG, ONLY, ONLY_RANK, NO_ERASE, RIG_NOSHOE, RIG_HEADITEMS] = sv;
  }
}
/** 武器のコード描画を武器の配置図（WPN_BOX、持ち手=支点）に描く */
export function renderRigWeapon(ctx, style, color, accent, scale = WPN_S) {
  const k = scale / WPN_S;
  const sv = FL; FL = false;
  ctx.save();
  ctx.translate(WPN_BOX.px * k, WPN_BOX.py * k); ctx.scale(scale, scale);
  try { drawWeapon(ctx, style, color, accent, 0, null); } finally { ctx.restore(); FL = sv; }
}

// ---- リグで描く
/** パーツの白フラッシュ版（パーツごとにキャッシュ） */
function rigFlash(p) {
  if (p.fl) return p.fl;
  const c = newCanvas(p.w, p.h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, p.w, p.h);
  g.drawImage(p.cv, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.9; g.fillStyle = '#ffffff'; g.fillRect(0, 0, p.w, p.h);
  p.fl = c;
  return c;
}
function rigImg(ctx, p) {
  if (!p) return;
  const R = p.R;
  ctx.drawImage(FL ? rigFlash(p) : p.cv, -p.px / R, -p.py / R, p.w / R, p.h / R);
}
/** 肢（肩/股〜手/足首の1枚の絵）を関節（肘/膝 = 支点から l1）で2つに分けて描く。a, e はコードの limb と同じ（a=付け根の角度, e=関節の曲がり） */
// 関節を曲げる幅（単位）。この範囲で上の骨と下の骨の角度をなめらかに混ぜる
const JOINT_BLEND = 3;
/**
 * 腕・脚の絵を、関節（肘・膝）でなめらかに曲げて描く（細い横帯に分け、帯ごとに角度を少しずつ変えて並べる＝2Dのスキニング）。
 * 絵の縦の軸が骨。支点（肩・股）から l1 の所が関節。a = 上の骨の角度、e = 関節の曲げ角
 */
function rigLimb(ctx, p, x0, y0, a, e, l1) {
  if (!p) return;
  const R = p.R, src = FL ? rigFlash(p) : p.cv;
  const X = -p.px / R, W = p.w / R;
  if (Math.abs(e) < 0.06) {   // ほぼまっすぐ: 1枚で
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(-a);
    ctx.drawImage(src, 0, 0, p.w, p.h, X, -p.py / R, W, p.h / R);
    ctx.restore();
    return;
  }
  const step = 0.75, sp = step * R;                       // 帯の高さ（単位 / 保持 px）
  const d0 = -p.py / R, d1 = (p.h - p.py) / R;           // 支点からの距離の範囲（上が負）
  const lo = l1 - JOINT_BLEND, hi = l1 + JOINT_BLEND;
  const wOf = (d) => (d <= lo ? 0 : d >= hi ? 1 : ((d - lo) / (hi - lo)) ** 2 * (3 - 2 * (d - lo) / (hi - lo)));
  // 支点より上（肩・腰の丸み）は上の骨と同じ向き
  let px = x0, py = y0;
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(-a);
  const top = Math.min(p.h, Math.ceil(p.py + (lo + 0.15) * R));
  ctx.drawImage(src, 0, 0, p.w, top, X, d0, W, top / R);
  ctx.restore();
  // 関節の手前まではまっすぐ進む
  px += Math.sin(a) * lo; py += Math.cos(a) * lo;
  const XL = X - 0.6, XR = X + W + 0.6, EPS = 0.14;                  // 帯の切り抜きの左右（少し外まで）
  let th0 = a;
  for (let d = lo; d < d1; d += step) {
    const last = d + step >= hi;
    const th1 = last ? a + e : a + e * wOf(d + step), thm = (th0 + th1) / 2;
    const y = Math.max(0, p.py + (d - step) * R);
    if (y >= p.h) break;
    const nx = px + Math.sin(thm) * step, ny = py + Math.cos(thm) * step;
    if (last) {
      // 関節より下は1枚で（上端だけ前の帯との境目で切る）
      const c1 = Math.cos(th1), s1 = Math.sin(th1);
      ctx.save();
      ctx.beginPath();
      const ux = px - Math.sin(th0) * EPS, uy = py - Math.cos(th0) * EPS;
      ctx.moveTo(ux + Math.cos(th0) * XL, uy - Math.sin(th0) * XL); ctx.lineTo(ux + Math.cos(th0) * XR, uy - Math.sin(th0) * XR);
      ctx.lineTo(nx + c1 * XR + s1 * 40, ny - s1 * XR + c1 * 40); ctx.lineTo(nx + c1 * XL + s1 * 40, ny - s1 * XL + c1 * 40);
      ctx.closePath(); ctx.clip();
      ctx.translate(px, py); ctx.rotate(-thm);
      ctx.drawImage(src, 0, y, p.w, p.h - y, X, (y - p.py) / R - d, W, (p.h - y) / R);
      ctx.restore();
      break;
    }
    // 上の境目（角度 th0）と下の境目（角度 th1）で囲んだ四角に切り抜いて描く（外側の隙間・内側のギザギザが出ない）
    // 境目の細い線が出ないよう、上下に少し（EPS）重ねる
    const ux = px - Math.sin(th0) * EPS, uy = py - Math.cos(th0) * EPS, bx = nx + Math.sin(th1) * EPS, by = ny + Math.cos(th1) * EPS;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ux + Math.cos(th0) * XL, uy - Math.sin(th0) * XL); ctx.lineTo(ux + Math.cos(th0) * XR, uy - Math.sin(th0) * XR);
    ctx.lineTo(bx + Math.cos(th1) * XR, by - Math.sin(th1) * XR); ctx.lineTo(bx + Math.cos(th1) * XL, by - Math.sin(th1) * XL);
    ctx.closePath(); ctx.clip();
    ctx.translate(px, py); ctx.rotate(-thm);
    const h = Math.min(p.h - y, sp * 3);
    ctx.drawImage(src, 0, y, p.w, h, X, (y - p.py) / R - d, W, h / R);
    ctx.restore();
    px = nx; py = ny; th0 = th1;
  }
}
/** 手前の手だけをもう一度（武器の上に。握っている見た目） */
function rigHand(ctx, p, x0, y0, a, e, l1, L) {
  if (!p) return;
  const R = p.R, src = FL ? rigFlash(p) : p.cv;
  const jy = p.py + l1 * R;
  const hy = Math.max(0, Math.floor(p.py + (L - 3.2) * R)), hh = p.h - hy;
  if (hh <= 0) return;
  const kx = x0 + Math.sin(a) * l1, ky = y0 + Math.cos(a) * l1;
  ctx.save(); ctx.translate(kx, ky); ctx.rotate(-(a + e));
  ctx.beginPath(); ctx.arc(0, L - l1, 3.0, 0, TAU); ctx.clip();
  ctx.drawImage(src, 0, hy, p.w, hh, -p.px / R, (hy - jy) / R, p.w / R, hh / R);
  ctx.restore();
}
function rigFoot(ctx, p, hx, hy, a, k, B) {
  if (!p) return;
  limbPts(hx, hy, a, -k, B.thigh, B.shin);
  ctx.save(); ctx.translate(LP.ex, LP.ey); ctx.rotate(-(a - k) * 0.85);
  rigImg(ctx, p);
  ctx.restore();
}
/** 杖の先の光（絵の武器の上に。コードの drawWeapon と同じ位置） */
function staffGlow(ctx, c, P, t, w) {
  const glow = P && P.magicGlow ? P.magicGlow : 0;
  ctx.save(); ctx.translate(30, Math.sin(t * om(w, 3)) * 0.8);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = FL ? '#ffffff' : rgba(c, 0.16 + glow * 0.3);
  ctx.beginPath(); ctx.arc(0, 0, 6 + glow * 6 + Math.sin(t * om(w, 6)) * 0.8, 0, TAU); ctx.fill();
  ctx.restore();
}

/** リグで1人描く（原点=足元・右向き・scale 1）。plan = rig.js の rigPlanFor() */
function renderRig(ctx, look, equip, anim, state, ws, wk, plan) {
  const dmg = clamp(anim.damage || 0, 0, 1);
  const parts = plan.parts(dmg);       // 先に用意（中でコード部品を描くことがあるので、描画の状態を設定する前に）
  const lp = LOOPS[state];
  const w = TAU / (lp ? lp[0] : LOOP);
  const t = anim.t || 0;
  const at = clamp(anim.attackT || 0, 0, 1);
  const f = look.body === 'f';
  const P = makePose(state, t, at, wk, ws, anim, w, f);
  const K = makeK(look, equip, anim, state, ws, wk, P, t, at, w, true);
  P.hipY += K.B.hipY;
  resolveFace(P, K, anim);
  K.ai = anim.villain ? null : aiHeadOf(look, anim, state, t);
  FL = !!anim.flash;
  RIM = anim.rim || look.rim || (f ? '#9ff4ff' : '#8fe8ff');
  TAG = 'body';
  if (state !== 'drive' && !P.lie) {
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 3.2, 0, 0, TAU);
    ctx.fillStyle = 'rgba(20,0,30,0.28)'; ctx.fill();
  }
  ctx.save();
  if (P.lie) { ctx.translate(34 * P.lie, -9 * P.lie); ctx.rotate(-PI / 2 * P.lie); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  try {
    if (P.back) rigBackView(ctx, K, parts);
    else rigFrontView(ctx, K, parts);
  } finally { ctx.restore(); FL = false; }
}
function rigHead(ctx, K, parts, back) {
  const P = K.P;
  enterHead(ctx, K);
  const hat = K.eq.hat && K.eq.hat.style;
  if (K.ai) {
    paintAiHead(ctx, K.ai, hat, back, FL, 'rig');
    if (back && K.ai.back) paintAiHeadBack(ctx, K.ai, hat, P, FL, 'rig', true);
  } else {
    enterCodeHead(ctx, K);
    if (back) {
      ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 15.5, 0, 0, TAU); fillStroke(ctx, K.skin);
      drawHairBack(ctx, K, true);
    } else {
      RIG_HEADITEMS = true;
      try { drawHead(ctx, K); } finally { RIG_HEADITEMS = false; }
    }
    ctx.restore();
  }
  rigImg(ctx, parts.head);
  if (!back) {
    enterCodeHead(ctx, K);
    if (P.panic) drawPanicLines(ctx, K);
    if (P.sweat || P.panic) drawSweat(ctx, K);
    ctx.restore();
  }
  ctx.restore();
}
function rigWeaponAndHand(ctx, K, parts, sx, sy) {
  const P = K.P, B = K.B, a = P.af[0], e = P.af[1];
  rigLimb(ctx, parts.armF, sx, sy, a, e, B.upper);
  if (!(P.showWeapon && K.eq.weapon)) return;
  limbPts(sx, sy, a, e, B.upper, B.fore);
  const fore = PI / 2 - (a + e);
  const ang = K.wk === 'gun' ? fore : P.wAng != null ? P.wAng : fore;
  const [wc, wa] = itemColors(K.eq.weapon);
  ctx.save(); ctx.translate(LP.ex, LP.ey); ctx.rotate(ang);
  if (parts.weapon) {
    rigImg(ctx, parts.weapon);
    if (P.muzzle) muzzleFx(ctx, K.ws);
    if (K.ws === 'staff') staffGlow(ctx, wc, P, K.t, K.w);
  } else drawWeapon(ctx, K.ws, wc, wa, K.t, P, K.w);
  ctx.restore();
  rigHand(ctx, parts.armF, sx, sy, a, e, B.upper, B.upper + B.fore);
}
function rigFrontView(ctx, K, parts) {
  const P = K.P, B = K.B, tw = P.twist;
  // 右向き斜め前（3q）: 体の右半身が手前 → 手前の腕・脚は画面の左側（背中側）、奥の腕・脚は顔の向きの側（胸の陰で少し内側）
  const q = rigView() === '3q';
  const sxF = q ? -B.sx + 0.4 + tw * 2 : B.sx - 0.4 + tw * 0.5;   // 3q: ひねると手前の肩が大きく前へ（パンチ・斬りの踏み込み）
  const sxB = q ? B.sx * 0.85 - tw * 0.8 : -B.sx - tw * 0.35;
  enterUpper(ctx, P);
  rigImg(ctx, parts.backA);
  if (!K.ai) { enterHead(ctx, K); enterCodeHead(ctx, K); drawHairBack(ctx, K); ctx.restore(); ctx.restore(); }
  else if (K.ai.back) { enterHead(ctx, K); paintAiHeadBack(ctx, K.ai, K.eq.hat && K.eq.hat.style, P, FL, 'rig'); ctx.restore(); }
  rigImg(ctx, parts.backT);
  rigLimb(ctx, parts.armB, sxB, K.shY + 0.3, P.ab[0], P.ab[1], B.upper);
  ctx.restore();
  const lx = q ? -B.legX : B.legX;
  const hb = -lx + P.hx * 0.3, hf = lx + P.hx * 0.3;
  rigLimb(ctx, parts.legB, hb, P.hipY, P.lb[0], -P.lb[1], B.thigh);
  rigFoot(ctx, parts.footB, hb, P.hipY, P.lb[0], P.lb[1], B);
  rigLimb(ctx, parts.legF, hf, P.hipY, P.lf[0], -P.lf[1], B.thigh);
  rigFoot(ctx, parts.footF, hf, P.hipY, P.lf[0], P.lf[1], B);
  enterUpper(ctx, P);
  rigImg(ctx, parts.torso);
  rigHead(ctx, K, parts, false);
  rigWeaponAndHand(ctx, K, parts, sxF, K.shY + 0.6);
  if (K.anim.bones) drawRigBonesUpper(ctx, K, sxF, sxB, hf, hb);
  if (!K.anim.noFx) {
    if (P.swoosh) drawSwoosh(ctx, K, sxF, K.shY + 0.5);
    if (K.wk === 'magic' && !FL) drawHoloPanel(ctx, K);
  }
  ctx.restore();
}
// ---- デバッグ・資料用: 骨（anim.bones = true）。黄 = 関節、水色 = 骨。座標は股が原点の上半身 / 足元が原点の脚
function boneLine(ctx, pts, col) {
  ctx.save(); ctx.lineWidth = 0.7; ctx.strokeStyle = col; ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.fillStyle = '#ffe14a';
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawRigBonesUpper(ctx, K, sxF, sxB, hf, hb) {
  const P = K.P, B = K.B;
  boneLine(ctx, [[0, 0], [0, RIG_Y.neck], [0, K.headY]], '#5ff');
  boneLine(ctx, [[sxB, K.shY + 0.3], [sxF, K.shY + 0.6]], '#5ff');
  limbPts(sxB, K.shY + 0.3, P.ab[0], P.ab[1], B.upper, B.fore);
  boneLine(ctx, [[sxB, K.shY + 0.3], [LP.kx, LP.ky], [LP.ex, LP.ey]], '#5ff');
  limbPts(sxF, K.shY + 0.6, P.af[0], P.af[1], B.upper, B.fore);
  boneLine(ctx, [[sxF, K.shY + 0.6], [LP.kx, LP.ky], [LP.ex, LP.ey]], '#5ff');
  ctx.restore();   // 上半身の座標を抜けて足元の座標で脚（最後に enterUpper で戻す）
  for (const [hx, L] of [[hb, P.lb], [hf, P.lf]]) {
    limbPts(hx, P.hipY, L[0], -L[1], B.thigh, B.shin);
    boneLine(ctx, [[hx, P.hipY], [LP.kx, LP.ky], [LP.ex, LP.ey]], '#5ff');
  }
  boneLine(ctx, [[hb, P.hipY], [hf, P.hipY]], '#5ff');
  enterUpper(ctx, P);
}
function rigBackView(ctx, K, parts) {
  const P = K.P, B = K.B;
  rigLimb(ctx, parts.legB, -B.legX, P.hipY, P.lb[0], -P.lb[1], B.thigh);
  rigFoot(ctx, parts.footB, -B.legX, P.hipY, P.lb[0], P.lb[1], B);
  rigLimb(ctx, parts.legF, B.legX, P.hipY, P.lf[0], -P.lf[1], B.thigh);
  rigFoot(ctx, parts.footF, B.legX, P.hipY, P.lf[0], P.lf[1], B);
  enterUpper(ctx, P);
  rigImg(ctx, parts.torso);
  rigImg(ctx, parts.backT);
  rigImg(ctx, parts.backA);
  rigHead(ctx, K, parts, true);
  rigLimb(ctx, parts.armB, -B.sx, K.shY, P.ab[0], P.ab[1], B.upper);
  rigLimb(ctx, parts.armF, B.sx, K.shY, P.af[0], P.af[1], B.upper);
  ctx.restore();
}
/** テスト・デバッグ用: その look・装備がリグで描かれるか（読み込み済みなら plan） */
export function rigPlanOf(look, equip) { return rigPlanFor(look || HERO_LOOKS.luna, equip || EMPTY); }
/** テスト・見比べ用: 絵を使わず、全部コード描画の代用パーツで組んだリグのプラン（骨格 v2 の見本。anim.rigCode=true で drawCharacter が使う） */
export function rigCodePlanOf(look, equip) { return rigCodePlanFor(look || HERO_LOOKS.luna, equip || EMPTY); }
