// コンボ（連続ヒット）。game.combo = {count, t(最後のヒットからの秒), max, bump}
//  - combat.damageEnemy が敵へのヒットごとに comboHit(game, 1, [enemy]) を呼ぶ（同フレーム同一敵は1回）
//  - updateCombo(game, dt) は skills.updateSkills から毎フレーム呼ばれる（COMBO_WINDOW 秒ヒットが無ければ終了）
//  - 維持で小バフ（段階: 10/30/50/100/200 → 攻撃 +2/4/6/8/10%）。段階が上がると 'comboTier' を emit
//  render/effects.js の自前カウントと二重にならないよう game.comboExternal = true にする
import { getBuffs, setActiveBuffs } from './progression.js';

export const COMBO_WINDOW = 3.2;
export const COMBO_TIERS = [
  { count: 10, atkPct: 0.02, name: 'コンボ x10' },
  { count: 30, atkPct: 0.04, name: 'コンボ x30' },
  { count: 50, atkPct: 0.06, name: 'コンボ x50' },
  { count: 100, atkPct: 0.08, name: 'コンボ x100' },
  { count: 200, atkPct: 0.10, name: 'コンボ x200' },
];
export const COMBO_BUFF_ID = 'combo';

export function comboTierOf(count) {
  let t = -1;
  for (let i = 0; i < COMBO_TIERS.length; i++) if (count >= COMBO_TIERS[i].count) t = i;
  return t;
}

function setComboBuff(game, tier) {
  const list = getBuffs(game);
  const i = list.findIndex((b) => b.id === COMBO_BUFF_ID);
  if (tier < 0) { if (i >= 0) { list.splice(i, 1); setActiveBuffs(list); } return; }
  const t = COMBO_TIERS[tier];
  // 持続はコンボ継続中ずっと（updateCombo が終了時に外す）。tickBuffs の期限切れ通知を出さないよう長めにする
  const b = { id: COMBO_BUFF_ID, name: t.name, atkPct: t.atkPct, color: '#ffd23f', duration: 1e6, t: 1e6, combo: true };
  if (i >= 0) list[i] = b; else list.push(b);
  setActiveBuffs(list);
}

/** comboHit(game, n=1, enemies?) → count。enemies を渡すと同じフレームの同じ敵は1回だけ数える */
export function comboHit(game, n = 1, enemies = null) {
  if (!game) return 0;
  game.comboExternal = true;
  const cb = game.combo || (game.combo = { count: 0, t: 0, max: 0 });
  let add = n;
  if (Array.isArray(enemies) && enemies.length) {
    const now = game.time ?? 0;
    add = 0;
    for (const e of enemies) {
      if (!e) continue;
      if (e._comboT === now) continue;
      e._comboT = now; add++;
    }
  }
  if (add <= 0) return cb.count;
  const before = comboTierOf(cb.count);
  cb.count += add; cb.t = 0; cb.bump = 0;
  if (cb.count > (cb.max || 0)) cb.max = cb.count;
  const after = comboTierOf(cb.count);
  if (after > before) {
    setComboBuff(game, after);
    game.events?.emit('comboTier', { count: cb.count, tier: after, atkPct: COMBO_TIERS[after].atkPct });
  }
  return cb.count;
}

/** updateCombo(game, dt) — 時間切れでコンボ終了（'comboEnd' を emit、バフ解除） */
export function updateCombo(game, dt) {
  const cb = game?.combo;
  if (!cb || !(cb.count > 0) || !game.comboExternal) return;
  cb.t = (cb.t || 0) + dt;
  if (cb.t > COMBO_WINDOW) {
    const count = cb.count;
    cb.count = 0; cb.t = 0;
    setComboBuff(game, -1);
    game.events?.emit('comboEnd', { count });
  }
}

/** comboInfo(game) → {count, max, tier, atkPct, left(秒)} */
export function comboInfo(game) {
  const cb = game?.combo || { count: 0, t: 0, max: 0 };
  const tier = comboTierOf(cb.count);
  return { count: cb.count, max: cb.max || 0, tier, atkPct: tier >= 0 ? COMBO_TIERS[tier].atkPct : 0, left: cb.count > 0 ? Math.max(0, COMBO_WINDOW - (cb.t || 0)) : 0 };
}
