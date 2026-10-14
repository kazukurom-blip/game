// 主人公の着せ替え（ペーパードール）と動き。
//
// ・コードで描いた体: 部品（腕・脚・胴・マント・腰布）を動かす本物の動き（歩き・振りかぶり・弓を引く・詠唱・のけぞり・倒れる）。
// ・差し替えた 1 枚絵の体: 同じ時間の流れで「揺れ・踏み込み・傾き・つぶれ」の変形をかけ、武器は手のアンカーで回す。
// 武器の種類ごとに振り方が違う（片手・両手・短剣の突き・弓・弩・杖・投げ）。スキルの動き（跳ぶ・駆ける・回る・叫ぶ）にも合わせる。
//
// drawHero(ctx, u, x, y, { look, t, scale, alpha, vis, noShadow, ghost })
//   u   … 戦闘の主人公（anim, face, hitFlash, dead）。窓の絵では { anim:{s:'idle',t:0}, face:1 } だけでよい
//   vis … scene が持つ見た目の状態（at: なめらかな動きの時間, recoil, n: 攻撃の回数, castEl）。無くても動く

import { assets, makeCanvas } from './assets.js';
import { BASE } from '../data/items.js';
import { SKILL } from '../data/skills.js';
import { ELEMENT_COLORS } from '../data/stats.js';
import { registry } from '../game/registry.js';
import { heroRig, drawRig, REST_POSE, HERO_W, HERO_H } from './painters/heroes.js';

/** 装備から見た目の枠 ID を決める */
export function heroLook(state) {
  const h = state.hero;
  const eq = h.equip || {};
  const cos = h.cosmetics || {};
  const chest = eq.chest ? BASE[eq.chest.base] : null;
  const style = cos.style || chest?.style || 'cloth';
  const helmB = eq.helm ? BASE[eq.helm.base] : null;
  const wB = eq.weapon ? BASE[eq.weapon.base] : null;
  const oB = eq.offhand && !(wB?.twoHanded) ? BASE[eq.offhand.base] : null;
  const overlays = [];
  for (const s of ['legs', 'boots', 'chest', 'belt', 'gloves']) {
    const b = eq[s] ? BASE[eq[s].base] : null;
    const id = b ? `gear.${s}.${b.style}` : null;
    if (id && assets.isCustom(id)) overlays.push(id);
  }
  return {
    cls: h.cls,
    body: `hero.${h.cls}.outfit.${style}`,
    style,
    helm: cos.hideHelm ? null : (cos.helm || (eq.helm && (registry.itemArt(eq.helm) || `gear.helm.${helmB?.style || 'plate'}`))),
    weapon: eq.weapon ? (cos.weapon || registry.itemArt(eq.weapon) || wB?.art) : null,
    weaponKind: wB?.kind || 'fist',
    twoHanded: !!wB?.twoHanded,
    offhand: oB ? (registry.itemArt(eq.offhand) || oB.art) : null,
    offhandKind: oB?.kind || null,
    overlays,
  };
}

// 休みのときの武器の傾き（0 = 真上、+ は前へ倒れる）
const WEAPON_REST = {
  sword: -0.42, axe: -0.32, mace: -0.32, greatsword: -0.2, dagger: 0.7, claw: 0.25, offblade: 0.9,
  bow: -0.12, crossbow: 1.15, staff: -0.06, wand: 0.25, rod: -0.1, scythe: -0.16, fist: 0,
};
// 武器の先（光る所）の位置（枠の中の握りから。立てた向きで）
const WEAPON_TIP = { staff: -104, wand: -58, rod: -98, scythe: -100, sword: -80, greatsword: -100, axe: -84, mace: -86, dagger: -48, claw: -50, bow: -50, crossbow: -38, fist: 0 }; // 弩は銃床の真ん中を持つので先は近い
const TWO_HAND = new Set(['greatsword', 'scythe', 'staff', 'crossbow']);
const CASTER = new Set(['staff', 'wand', 'rod']);

const ease = { out: (k) => 1 - (1 - k) * (1 - k), in: (k) => k * k, io: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2), back: (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2 };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mixv = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const seg = (p, a, b) => clamp01((p - a) / (b - a));

/** スキルから動きの種類を決める */
function motionOf(look, a) {
  const def = a.skill ? SKILL[a.skill] : null;
  const beh = def?.behavior || '';
  const spell = a.s === 'cast';
  const k = look.weaponKind;
  if (/leap|jump/.test(a.s) || /leap|jump/.test(beh)) return 'leap';
  if (/dash|blink|teleport|charge/.test(a.s) || /dash|blink|teleport|charge/.test(beh)) return 'dash';
  if (/whirl|spin/.test(a.s) || /whirl|spin/.test(beh)) return 'spin';
  if (/channel/.test(a.s)) return 'channel';
  if (a.s === 'die') return 'die';
  if (a.s === 'walk') return 'walk';
  if (a.s !== 'attack' && a.s !== 'cast' && !a.dur) return 'idle';
  if (/buff|aura|shout|warcry|summon|totem/.test(beh) && !spell) return 'shout';
  if (spell || (CASTER.has(k) && a.s !== 'attack')) return 'cast';
  if ((k === 'bow') && !spell) return 'shoot';
  if (k === 'crossbow' && !spell) return 'crossbow';
  if (beh === 'nova' && !spell) return 'spin';
  if (/projectile|rain|chain|throw/.test(beh) && !['bow', 'crossbow', 'staff', 'wand', 'rod'].includes(k)) return 'throw';
  if (CASTER.has(k)) return 'cast';
  if (k === 'dagger' || k === 'claw') return 'thrust';
  if (look.twoHanded || k === 'greatsword' || k === 'scythe') return 'heavy';
  return 'swing';
}

/**
 * 姿勢を作る。戻り値: { pose（drawRig 用）, wRot, offRot, dx, dy, lean, sx, sy, alpha, glow, pull, arrow, spinSx, ghosts }
 */
export function heroPose(look, a, t, vis = null, u = null) {
  const k = look.weaponKind;
  const rest = WEAPON_REST[k] ?? -0.4;
  const R = REST_POSE;
  const shield = look.offhandKind === 'shield';
  const restB = shield ? [62, 100] : look.offhandKind === 'orb' || look.offhandKind === 'grimoire' ? [56, 104] : R.handB;
  const out = { pose: { ...R, handB: restB }, wRot: rest, offRot: look.offhandKind === 'offblade' ? 0.9 : 0, dx: 0, dy: 0, lean: 0, sx: 1, sy: 1, alpha: 1, glow: 0, glowEl: a?.el, pull: 0, arrow: 0, ghosts: 0, motion: 'idle' };
  const P = out.pose;
  const at = vis?.at ?? a?.t ?? 0;
  const m = motionOf(look, a || { s: 'idle' });
  out.motion = m;
  const dur = a?.dur || (m === 'leap' ? 0.6 : m === 'dash' ? 0.35 : 0.5);
  const p = clamp01(at / Math.max(0.05, dur));
  const br = Math.sin(t * 2.6 + (u?.id || 0));
  // 呼吸（どの動きにも少し）
  P.breathe = br;
  P.cape = 0.03 * Math.sin(t * 1.7);
  switch (m) {
    case 'walk': {
      const ph = at * Math.PI * 2 * 1.9;
      const s = Math.sin(ph); const c = Math.cos(ph);
      P.legF = [-0.5 * s - 0.05, 0.85 * Math.max(0, c) + 0.05];
      P.legB = [0.5 * s + 0.05, 0.85 * Math.max(0, -c) + 0.05];
      P.handF = [R.handF[0] - 11 * s, R.handF[1] - 2 * Math.abs(s)];
      P.handB = [restB[0] + 11 * s, restB[1] - 2 * Math.abs(s)];
      P.torso = 0.07; P.cape = 0.18 + 0.06 * Math.sin(ph * 2); P.skirt = 0.08 * s;
      out.wRot = rest + 0.08 * s;
      break;
    }
    case 'swing': case 'heavy': {
      const big = m === 'heavy';
      const raise = big ? [72, 56] : [80, 52];
      const hit = big ? [118, 108] : [114, 102];
      const wUp = big ? -2.55 : -2.15; const wHit = big ? 2.1 : 1.85;
      const e1 = ease.out(seg(p, 0, 0.42)); const e2 = ease.in(seg(p, 0.42, 0.58)); const e3 = ease.io(seg(p, 0.66, 1));
      let hand; let w;
      if (p < 0.42) { hand = mixv(R.handF, raise, e1); w = rest + (wUp - rest) * e1; }
      else if (p < 0.66) { hand = mixv(raise, hit, e2); w = wUp + (wHit - wUp) * e2; }
      else { hand = mixv(hit, R.handF, e3); w = wHit + (rest - wHit) * e3; }
      out.wRot = w;
      P.handF = hand;
      if (big || look.twoHanded) P.handB = [hand[0] - 6, hand[1] + 6];
      out.dx = -5 * e1 * (1 - e2) + 12 * e2 * (1 - e3);
      out.lean = -0.06 * e1 * (1 - e2) + 0.1 * e2 * (1 - e3);
      P.torso = -0.05 * e1 * (1 - e2) + 0.12 * e2 * (1 - e3);
      P.legF = [-0.12 - 0.3 * e2 * (1 - e3), 0.06 + 0.2 * e2 * (1 - e3)];
      P.legB = [0.13 + 0.25 * e2 * (1 - e3), 0.02];
      P.cape = 0.1 * e2 * (1 - e3) - 0.05 * e1;
      out.sy = 1 + 0.03 * e1 * (1 - e2) - 0.04 * e2 * (1 - e3); out.sx = 2 - out.sy;
      out.swingK = e2 * (1 - e3);
      break;
    }
    case 'thrust': {
      const alt = (vis?.n || 0) % 2 === 1 && look.offhandKind === 'offblade';
      const e1 = ease.out(seg(p, 0, 0.4)); const e2 = ease.in(seg(p, 0.4, 0.56)); const e3 = ease.io(seg(p, 0.64, 1));
      const back = [86, 100]; const fwd = [124, 94];
      let hand = mixv(R.handF, back, e1); hand = mixv(hand, fwd, e2); hand = mixv(hand, R.handF, e3);
      if (alt) { let hb = mixv(restB, [66, 98], e1); hb = mixv(hb, [118, 98], e2); hb = mixv(hb, restB, e3); P.handB = hb; P.backArmFront = e2 > 0 && e3 < 0.7; out.offRot = 0.9 + 0.7 * e2 * (1 - e3); P.handF = mixv(R.handF, [92, 108], e2 * (1 - e3)); }
      else { P.handF = hand; out.wRot = rest + (1.45 - rest) * Math.max(e1 * 0.6, e2) * (1 - e3); }
      out.dx = -3 * e1 * (1 - e2) + 14 * e2 * (1 - e3);
      out.lean = 0.12 * e2 * (1 - e3); P.torso = 0.1 * e2 * (1 - e3) + 0.06;
      P.legF = [-0.35 * e2 * (1 - e3) - 0.12, 0.25 * e2 * (1 - e3) + 0.06]; P.legB = [0.3 * e2 * (1 - e3) + 0.13, 0.05];
      out.swingK = e2 * (1 - e3);
      break;
    }
    case 'shoot': {
      const e0 = ease.out(seg(p, 0, 0.16)); const ed = ease.io(seg(p, 0.12, 0.52)); const er = seg(p, 0.55, 0.62); const e3 = ease.io(seg(p, 0.66, 1));
      const aim = [114, 78];
      P.handF = mixv(mixv(R.handF, aim, e0), R.handF, e3);
      const anchor = [80, 76];
      const pullPt = mixv(P.handF, anchor, ed * (1 - er * 0.9));
      P.handB = mixv(mixv(restB, [P.handF[0] - 4, P.handF[1] + 2], e0), pullPt, ed);
      P.handB = mixv(P.handB, restB, e3);
      P.backArmFront = e0 > 0.3 && e3 < 0.6;
      out.wRot = rest + (0 - rest) * e0 * (1 - e3);
      out.pull = ed * (1 - er) * (1 - e3);
      out.arrow = p > 0.1 && p < 0.555 ? 1 : 0;
      out.dx = -3 * er * (1 - e3); P.torso = -0.04 * e0 * (1 - e3);
      P.legF = [-0.2 * e0 * (1 - e3) - 0.12, 0.08]; P.legB = [0.2 * e0 * (1 - e3) + 0.13, 0.02];
      break;
    }
    case 'crossbow': {
      const e0 = ease.out(seg(p, 0, 0.3)); const er = seg(p, 0.55, 0.62); const e3 = ease.io(seg(p, 0.7, 1));
      P.handF = mixv(mixv(R.handF, [108, 86], e0), R.handF, e3);
      P.handB = mixv(mixv(restB, [92, 92], e0), restB, e3); P.backArmFront = e0 > 0.5 && e3 < 0.5;
      out.wRot = rest + (1.57 - rest) * e0 * (1 - e3) - 0.25 * er * (1 - seg(p, 0.62, 0.75));
      out.dx = -4 * er * (1 - e3); P.torso = -0.03 * e0;
      break;
    }
    case 'channel': case 'cast': {
      const pp = m === 'channel' ? Math.min(0.5, p * 3) + 0.02 * Math.sin(at * 9) : p;
      const e1 = ease.out(seg(pp, 0, 0.5)); const e2 = ease.out(seg(pp, 0.5, 0.6)); const e3 = ease.io(seg(pp, 0.66, 1));
      let hand = mixv(R.handF, [110, 80], e1); hand = mixv(hand, [118, 84], e2); hand = mixv(hand, R.handF, e3);
      P.handF = hand;
      P.handB = mixv(mixv(restB, [70, 82], e1), restB, e3);
      out.wRot = rest + (0.32 - rest) * e1 * (1 - e3) + 0.18 * e2 * (1 - e3);
      out.dy = -3 * e1 * (1 - e3); P.torso = -0.05 * e1 * (1 - e2) + 0.06 * e2 * (1 - e3);
      out.lean = -0.03 * e1 * (1 - e2);
      out.glow = Math.max(e1 * (1 - e2 * 0.5), 0) * (1 - e3);
      P.cape = 0.12 * e1 * (1 - e3); P.skirt = -0.04 * e1 * (1 - e3);
      break;
    }
    case 'throw': {
      const e1 = ease.out(seg(p, 0, 0.42)); const e2 = ease.in(seg(p, 0.42, 0.56)); const e3 = ease.io(seg(p, 0.64, 1));
      let hand = mixv(R.handF, [64, 66], e1); hand = mixv(hand, [122, 92], e2); hand = mixv(hand, R.handF, e3);
      P.handF = hand; out.wRot = rest + (-2.3 - rest) * e1; if (e2 > 0) out.wRot = -2.3 + (1.8 + 2.3) * e2; if (e3 > 0) out.wRot = 1.8 + (rest - 1.8) * e3;
      out.lean = -0.08 * e1 * (1 - e2) + 0.1 * e2 * (1 - e3); P.torso = out.lean;
      out.dx = 8 * e2 * (1 - e3);
      P.legF = [-0.3 * e2 * (1 - e3) - 0.12, 0.1]; P.legB = [0.25 * e2 * (1 - e3) + 0.13, 0.02];
      out.swingK = e2 * (1 - e3);
      break;
    }
    case 'spin': {
      const e = ease.io(seg(p, 0.15, 0.85));
      const ang = -Math.PI * 0.5 + e * Math.PI * 2;
      P.handF = [88 + Math.cos(ang) * 30, 84 + Math.sin(ang) * 12];
      out.wRot = e > 0 && e < 1 ? ang + Math.PI / 2 : rest;
      out.sx = e > 0 && e < 1 ? Math.max(0.2, Math.abs(Math.cos(e * Math.PI * 2))) * Math.sign(Math.cos(e * Math.PI * 2) || 1) : 1;
      out.dy = -6 * Math.sin(e * Math.PI);
      P.legF = [-0.25, 0.2]; P.legB = [0.3, 0.1]; P.cape = 0.3 * Math.sin(e * Math.PI);
      out.swingK = Math.sin(e * Math.PI);
      break;
    }
    case 'shout': {
      const e1 = ease.back(seg(p, 0, 0.45)); const e3 = ease.io(seg(p, 0.7, 1));
      const k1 = e1 * (1 - e3);
      P.handF = mixv(R.handF, [116, 66], k1); P.handB = mixv(restB, [44, 70], k1);
      out.wRot = rest + (-0.6 - rest) * k1; P.torso = -0.1 * k1; out.lean = -0.04 * k1; out.dy = -4 * k1;
      out.sy = 1 + 0.04 * k1; out.sx = 1 + 0.03 * k1;
      P.legF = [-0.25 * k1 - 0.12, 0.06]; P.legB = [0.25 * k1 + 0.13, 0.02];
      out.glow = k1 * 0.6;
      P.cape = 0.25 * k1;
      break;
    }
    case 'leap': {
      const air = Math.sin(Math.PI * clamp01(p / 0.85));
      const land = seg(p, 0.8, 1);
      out.dy = -76 * air;
      P.legF = [-0.9 * air - 0.1, 1.5 * air]; P.legB = [-0.2 * air + 0.13, 1.6 * air];
      P.handF = mixv(mixv(R.handF, [86, 46], ease.out(seg(p, 0, 0.5))), [118, 110], ease.in(seg(p, 0.6, 0.85)));
      out.wRot = p < 0.6 ? rest + (-2.4 - rest) * ease.out(seg(p, 0, 0.5)) : -2.4 + 4.5 * ease.in(seg(p, 0.6, 0.85));
      if (land > 0) { out.sy = 1 - 0.1 * Math.sin(land * Math.PI); out.sx = 2 - out.sy; }
      P.cape = -0.4 * air; P.torso = 0.1 * air;
      out.swingK = seg(p, 0.6, 0.85);
      break;
    }
    case 'dash': {
      const e = Math.sin(Math.PI * clamp01(p));
      out.lean = 0.28 * e; P.torso = 0.15 * e; P.legF = [-0.7 * e - 0.1, 0.4 * e]; P.legB = [0.8 * e + 0.1, 0.6 * e];
      P.handF = mixv(R.handF, [70, 100], e); out.wRot = rest + (-2.0 - rest) * e; P.cape = 0.5 * e;
      out.ghosts = e;
      break;
    }
    case 'die': {
      const e = ease.in(clamp01(at / 0.55));
      out.lean = -1.42 * e; out.dy = 4 * e; out.alpha = Math.max(0.45, 1 - at * 0.6);
      P.legF = [-0.35 * e - 0.1, 0.6 * e]; P.legB = [0.1, 0.9 * e];
      P.handF = mixv(R.handF, [110, 90], e); P.handB = mixv(restB, [40, 92], e); out.wRot = rest + 1.2 * e;
      break;
    }
    default: {
      P.handF = [R.handF[0], R.handF[1] + br * 0.8];
      P.handB = [restB[0], restB[1] + br * 0.8];
      out.wRot = rest + br * 0.02;
      out.sy = 1 + br * 0.008; out.sx = 1 - br * 0.004;
    }
  }
  // のけぞり
  const rc = vis?.recoil ?? (u?.hitFlash > 0 ? Math.min(1, u.hitFlash * 8) : 0);
  if (rc > 0 && m !== 'die') { out.dx -= 7 * rc; out.lean -= 0.07 * rc; out.sx *= 1 + 0.05 * rc; out.sy *= 1 - 0.05 * rc; }
  if (m === 'cast' && !out.glowEl) out.glowEl = 'void';
  return out;
}

// 弦のない弓（弓を引く動きで、弦を描き直すため）
const NOSTR = new Map();
function bowNoString(id) {
  if (NOSTR.has(id)) return NOSTR.get(id);
  const spec = assets.spec(id);
  const pt = assets.painterFor(id);
  let c = null;
  if (spec && pt) {
    c = makeCanvas(spec.w * 2, spec.h * 2);
    if (c) { const x = c.getContext('2d'); x.scale(2, 2); try { pt.fn(x, { ...spec, id, params: { ...(spec.params || {}), noString: true } }, spec.w, spec.h); } catch { c = null; } }
  }
  NOSTR.set(id, c);
  return c;
}
assets.onChange(() => NOSTR.clear());

/** 武器を手に描く（枠の基準点 = 握りを手に合わせる。弓・弩は枠の真ん中が握り: manifest.js の WEAPON_GRIP_AY） */
function drawHeld(ctx, id, kind, hand, rot, sc = 1, opt = {}) {
  let s = assets.sprite(id);
  if (!s?.img) return null;
  if (opt.noString && !s.custom) { const ns = bowNoString(id); if (ns) s = { ...s, img: ns }; }
  ctx.save();
  ctx.translate(hand[0], hand[1]);
  ctx.rotate(rot);
  assets.draw(ctx, s, 0, 0, { scale: sc });
  ctx.restore();
  return s;
}

/** 主人公を描く。(x, y) は足元 */
export function drawHero(ctx, u, x, y, o = {}) {
  const look = o.look;
  const scale = o.scale ?? 1;
  const t = o.t ?? 0;
  const a = u.anim || { s: 'idle', t: 0 };
  const flip = (u.face || 1) < 0;
  const ps = heroPose(look, a, t, o.vis, u);
  const body = assets.sprite(look.body);
  const custom = body.custom;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  const alpha = (o.alpha ?? 1) * ps.alpha;
  // 影
  if (!o.noShadow) {
    ctx.save(); ctx.globalAlpha *= 0.4 * alpha * Math.max(0.3, 1 + ps.dy / 120); ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(ps.dx * 0.5 * scale, 0, 40 * scale * (1 + ps.dy / 300), 9 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (alpha < 1) ctx.globalAlpha *= alpha;
  // 残像（駆ける）
  if (ps.ghosts > 0.05 && !o.ghost) {
    for (let i = 3; i >= 1; i--) {
      ctx.save(); ctx.globalAlpha *= 0.22 * ps.ghosts / i; ctx.translate(-i * 22 * scale * ps.ghosts, 0);
      drawBody(ctx, look, ps, body, custom, scale, t, { ghost: true });
      ctx.restore();
    }
  }
  drawBody(ctx, look, ps, body, custom, scale, t, o);
  // 被弾の白い光（50ms）
  const fl = o.vis?.flash ?? 0;
  if (fl > 0 && o.whiteOf) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, fl / 0.05) * 0.85;
    drawBody(ctx, look, ps, body, custom, scale, t, { white: o.whiteOf });
    ctx.restore();
  }
  ctx.restore();
  return body;
}

function drawBody(ctx, look, ps, body, custom, scale, t, o) {
  ctx.save();
  ctx.translate(ps.dx * scale, ps.dy * scale);
  if (ps.lean) ctx.rotate(ps.lean);
  if (ps.sx !== 1 || ps.sy !== 1) ctx.scale(ps.sx, ps.sy);
  const white = o.white;
  if (custom) drawCustomBody(ctx, look, ps, body, scale, t, white);
  else drawRigBody(ctx, look, ps, scale, t, white, o);
  ctx.restore();
}

/** 差し替えの 1 枚絵の体 */
function drawCustomBody(ctx, look, ps, body, scale, t, white) {
  const m = ps.motion;
  let bob = 0;
  if (m === 'walk') bob = -Math.abs(Math.sin(t * 9)) * 5;
  else if (m === 'idle') bob = Math.sin(t * 2.6) * 1.2;
  ctx.translate(0, bob * scale);
  const off = look.offhand ? assets.sprite(look.offhand) : null;
  const pOff = assets.anchor(body, look.offhandKind === 'quiver' ? 'back' : 'offhand', 0, 0, { scale });
  if (off && pOff && (look.offhandKind === 'quiver' || look.offhandKind === 'offblade')) draw(ctx, off, pOff.x, pOff.y, { scale: scale * 0.9, rot: look.offhandKind === 'quiver' ? -0.4 : ps.offRot }, white);
  draw(ctx, body, 0, 0, { scale }, white);
  for (const id of look.overlays || []) draw(ctx, assets.sprite(id), 0, 0, { scale }, white);
  if (off && pOff && look.offhandKind !== 'quiver' && look.offhandKind !== 'offblade') draw(ctx, off, pOff.x + 6 * scale, pOff.y, { scale: scale * 0.9 }, white);
  const pHand = assets.anchor(body, 'hand', 0, 0, { scale });
  if (look.weapon && pHand) {
    if (white) { const s = assets.sprite(look.weapon); ctx.save(); ctx.translate(pHand.x, pHand.y); ctx.rotate(ps.wRot); draw(ctx, s, 0, 0, { scale }, white); ctx.restore(); }
    else drawHeld(ctx, look.weapon, look.weaponKind, [pHand.x, pHand.y], ps.wRot, scale);
  }
  if (ps.glow > 0 && pHand) castGlow(ctx, pHand.x, pHand.y - 20 * scale, ps.glow, ps.glowEl, scale);
}

function draw(ctx, s, x, y, o, white) {
  if (!s?.img) return;
  if (white) { const w = white(s.img); assets.draw(ctx, { ...s, img: w }, x, y, o); } else assets.draw(ctx, s, x, y, o);
}

/** コードで描いた体（部品を動かす） */
function drawRigBody(ctx, look, ps, scale, t, white, o) {
  const rig = heroRig(look.cls, look.style);
  ctx.scale(scale, scale);
  ctx.translate(-HERO_W * 0.5, -194);
  if (white) {
    // 白い光は部品の形だけで十分（簡単に全体を明るくする）
    ctx.globalCompositeOperation = 'lighter';
  }
  const hooks = {
    afterCape(c, r, j) {
      if (look.offhandKind === 'quiver' && look.offhand) {
        const p = j.rot([62, 80]);
        const s = assets.sprite(look.offhand);
        assets.draw(c, s, p[0], p[1], { rot: -0.5 + j.tor, scale: 0.85 });
      }
    },
    afterBackArm(c, r, j) {
      if (look.offhandKind === 'offblade' && look.offhand) drawHeld(c, look.offhand, 'offblade', j.handB, ps.offRot, 0.95);
    },
    afterTorso(c, r, j) {
      // 兜（頭と一緒に傾く）
      if (look.helm) {
        const hp = j.rot([75, 38 - j.breathe * 1.2]);
        assets.draw(c, look.helm, hp[0], hp[1], { rot: j.tor });
      }
      for (const id of look.overlays || []) if (/gear\.(chest|belt)/.test(id)) assets.draw(c, id, 75, 194, {});
      if (look.offhand && (look.offhandKind === 'shield' || look.offhandKind === 'orb' || look.offhandKind === 'grimoire')) {
        const bob = look.offhandKind === 'shield' ? 0 : Math.sin(t * 3) * 2.5;
        const s = assets.sprite(look.offhand);
        const px = j.handB[0] + (look.offhandKind === 'shield' ? 8 : 4);
        const py = j.handB[1] + (look.offhandKind === 'shield' ? -2 : -14) + bob;
        assets.draw(c, s, px, py, { scale: look.offhandKind === 'shield' ? 0.86 : 0.7, rot: look.offhandKind === 'grimoire' ? -0.12 : 0 });
      }
    },
    weapon(c, r, j) {
      if (look.weapon) {
        drawHeld(c, look.weapon, look.weaponKind, j.handF, ps.wRot, 1, { noString: look.weaponKind === 'bow' });
        if (look.weaponKind === 'bow') bowString(c, j, ps);
      }
      if (ps.glow > 0) {
        const tip = WEAPON_TIP[look.weapon ? look.weaponKind : 'fist'] || 0;
        const gx = j.handF[0] + Math.sin(ps.wRot) * -tip; const gy = j.handF[1] + Math.cos(ps.wRot) * tip;
        castGlow(c, gx, gy, ps.glow, ps.glowEl, 1);
        castGlow(c, j.handB[0], j.handB[1], ps.glow * 0.6, ps.glowEl, 0.7);
      }
    },
  };
  drawRig(ctx, rig, ps.pose, hooks);
  for (const id of look.overlays || []) if (!/gear\.(chest|belt)/.test(id)) assets.draw(ctx, id, 75, 194, {});
  void o;
}

/** 弓の弦と番えた矢 */
function bowString(ctx, j, ps) {
  const [hx, hy] = j.handF;
  const c = Math.cos(ps.wRot); const s = Math.sin(ps.wRot);
  const tp = (lx, ly) => [hx + lx * c - ly * s, hy + lx * s + ly * c];
  const top = tp(-26, -59); const bot = tp(-26, 59);
  const pull = ps.pull;
  const mid = pull > 0.02 ? [j.handB[0], j.handB[1]] : tp(-26, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(235,228,210,0.95)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
  if (ps.arrow) {
    const dx = hx - mid[0]; const dy = hy - mid[1]; const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d; const uy = dy / d;
    const tipx = mid[0] + ux * Math.max(70, d + 14); const tipy = mid[1] + uy * Math.max(70, d + 14);
    ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(tipx, tipy); ctx.stroke();
    ctx.fillStyle = '#d8dde6'; ctx.beginPath(); ctx.moveTo(tipx + ux * 7, tipy + uy * 7); ctx.lineTo(tipx - uy * 3, tipy + ux * 3); ctx.lineTo(tipx + uy * 3, tipy - ux * 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.moveTo(mid[0] + ux * 2, mid[1] + uy * 2); ctx.lineTo(mid[0] + ux * 10 - uy * 4, mid[1] + uy * 10 + ux * 4); ctx.lineTo(mid[0] + ux * 12, mid[1] + uy * 12); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 詠唱の光（キャッシュした光の円を使う）
const GLOW = new Map();
function glowSprite(col) {
  if (GLOW.has(col)) return GLOW.get(col);
  const c = makeCanvas(64, 64);
  if (c) {
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, col); g.addColorStop(0.5, `${col}55`); g.addColorStop(1, `${col}00`);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  GLOW.set(col, c);
  return c;
}
function castGlow(ctx, x, y, k, el, sc = 1) {
  const col = ELEMENT_COLORS[el] || '#c77dff';
  const img = glowSprite(col);
  if (!img) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, k * 1.2);
  const r = (14 + 22 * k) * sc;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export { WEAPON_REST, motionOf };
