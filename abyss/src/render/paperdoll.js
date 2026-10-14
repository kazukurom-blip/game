// 主人公の着せ替え（ペーパードール）。体（または鎧を着た全身）＋兜＋武器＋副手を重ねて、
// 1 枚絵でも動いて見えるように「上下の揺れ・踏み込み・武器の振り」を変形でつける。
// 差し替え画像でも同じ動きになるので、AI の 1 枚絵をそのまま使える。

import { assets } from './assets.js';
import { BASE } from '../data/items.js';
import { registry } from '../game/registry.js';

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
  return {
    cls: h.cls,
    body: `hero.${h.cls}.outfit.${style}`,
    style,
    helm: cos.hideHelm ? null : (cos.helm || (eq.helm && (registry.itemArt(eq.helm) || `gear.helm.${helmB?.style || 'plate'}`))),
    weapon: eq.weapon ? (cos.weapon || registry.itemArt(eq.weapon) || wB?.art) : null,
    weaponKind: wB?.kind || 'fist',
    offhand: oB ? (registry.itemArt(eq.offhand) || oB.art) : null,
    offhandKind: oB?.kind || null,
  };
}

const WEAPON_REST = {
  sword: -0.5, axe: -0.4, mace: -0.4, greatsword: -0.25, dagger: -0.9, claw: -1.2, offblade: -0.9,
  bow: 0.0, crossbow: 1.4, staff: -0.08, wand: -0.6, rod: -0.15, scythe: -0.2, fist: 0,
};

/**
 * 主人公を描く。u は戦闘の主人公（anim, face, hitFlash, dead）。(x, y) は足元。
 * o: { scale, t（時間）, look（heroLook の結果）, alpha }
 */
export function drawHero(ctx, u, x, y, o = {}) {
  const look = o.look;
  const scale = o.scale ?? 1;
  const t = o.t ?? 0;
  const a = u.anim || { s: 'idle', t: 0 };
  const flip = (u.face || 1) < 0;
  let dx = 0; let dy = 0; let rot = 0; let sy = 1; let sx = 1; let wRot = WEAPON_REST[look.weaponKind] ?? -0.4; let alpha = o.alpha ?? 1;
  const prog = a.dur ? Math.min(1, a.t / a.dur) : 0;
  switch (a.s) {
    case 'walk': dy = -Math.abs(Math.sin(a.t * 9)) * 6; rot = 0.05; break;
    case 'attack': {
      // 振りかぶり → 振り下ろし → 戻り
      const k = prog < 0.4 ? prog / 0.4 : prog < 0.6 ? 1 : 1 - (prog - 0.6) / 0.4;
      dx = (prog < 0.4 ? -4 * k : 16 * Math.sin(Math.min(1, (prog - 0.3) / 0.4) * Math.PI)) * 1;
      if (look.weaponKind === 'bow' || look.weaponKind === 'crossbow') { dx = -6 * Math.sin(prog * Math.PI); wRot = (WEAPON_REST[look.weaponKind] || 0); }
      else wRot = prog < 0.4 ? -2.1 * (prog / 0.4) + (WEAPON_REST[look.weaponKind] ?? -0.4) * (1 - prog / 0.4) : -2.1 + 3.2 * Math.min(1, (prog - 0.4) / 0.25);
      rot = prog < 0.4 ? -0.06 : 0.08 * k;
      break;
    }
    case 'cast': dy = -6 * Math.sin(prog * Math.PI); sy = 1 + 0.04 * Math.sin(prog * Math.PI); wRot = -0.9 * Math.sin(prog * Math.PI) + (WEAPON_REST[look.weaponKind] ?? 0); break;
    case 'die': rot = -Math.min(1.4, a.t * 3); dy = Math.min(1, a.t * 3) * 10; alpha *= Math.max(0.35, 1 - a.t * 0.4); break;
    default: { const b = Math.sin(t * 2.4); dy = b * 1.5; sy = 1 + b * 0.012; sx = 1 - b * 0.006; }
  }
  const body = assets.sprite(look.body);
  ctx.save();
  ctx.translate(x + dx * (flip ? -1 : 1) * scale, y + dy * scale);
  if (flip) ctx.scale(-1, 1);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  if (alpha < 1) ctx.globalAlpha *= alpha;
  // 影
  ctx.save(); ctx.scale(1, 0.25); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0, -dy * 4 / scale, 40 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // 背中側の副手（矢筒）
  const off = look.offhand ? assets.sprite(look.offhand) : null;
  const pOff = assets.anchor(body, look.offhandKind === 'quiver' ? 'back' : 'offhand', 0, 0, { scale });
  if (off && pOff && look.offhandKind === 'quiver') assets.draw(ctx, off, pOff.x, pOff.y, { scale: scale * 0.9, rot: -0.4 });
  // 体
  assets.draw(ctx, body, 0, 0, { scale });
  // 兜
  if (look.helm && !body.custom) {
    const p = assets.anchor(body, 'head', 0, 0, { scale });
    if (p) assets.draw(ctx, look.helm, p.x, p.y + 4 * scale, { scale });
  }
  // 武器（手の位置で回す）
  const pHand = assets.anchor(body, 'hand', 0, 0, { scale });
  if (look.weapon && pHand) assets.draw(ctx, look.weapon, pHand.x, pHand.y, { scale, rot: wRot });
  // 前に持つ副手（盾・宝珠・魔導書・副刀）
  if (off && pOff && look.offhandKind !== 'quiver') assets.draw(ctx, off, pOff.x + 6 * scale, pOff.y, { scale: scale * 0.9, rot: look.offhandKind === 'offblade' ? -0.6 - wRot * 0.3 : 0 });
  // 被弾の白い光
  if (u.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= Math.min(1, u.hitFlash * 6) * 0.5;
    assets.draw(ctx, body, 0, 0, { scale });
  }
  ctx.restore();
  return body;
}
