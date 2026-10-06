// ネオン・チューン（★強化。スターフォース相当）— REFERENCE_MAPLE_SYSTEMS §3 S-3
//  - 成功率表・天井（連続失敗 N 回目は確定成功）・費用式は data/gear.js（壊れない代わりに高い: 旧費用の約10倍〜★が上がるほど最大100倍）
//  - 装備は壊れない・失敗しても★は下がらない（失敗は費用のみ。天井ゲージが貯まる）
//  - サンデー・ネオン（日曜）: 費用 -30%
//  - チューン・チケット（tune_ticket）: 1回だけ確定成功（タワー50階ごとの報酬）
import { ITEMS } from '../data/items.js';
import { TUNE_RATES, TUNE_PITY, TUNE_EXPECTED, TUNE_MAX, maxStarFor, tuneCost, starBonus } from '../data/gear.js';
import { stateRng } from './rng.js';
import { resolveItemRef, normalizeInventory, countItem, removeItem, instLabel } from './inventory.js';
import { weekdayEvent } from './daily.js';

export { TUNE_RATES, TUNE_PITY, TUNE_EXPECTED, TUNE_MAX, maxStarFor, tuneCost, starBonus };
export const TUNE_TICKET = 'tune_ticket';
export const TUNE_MILESTONES = [10, 15, 20, 25];

/** 成功率表（UI に常時表示する用）: [{star, to, rate, pity, expected}] */
export function tuneRateTable() {
  return TUNE_RATES.map((rate, s) => ({ star: s, to: s + 1, rate, pity: TUNE_PITY[s], expected: TUNE_EXPECTED[s] }));
}

/**
 * tuneRoll(star, pity, rng, {hot, ticket}) → {success, guaranteed}（純関数。tuneItem が使用）
 *  pity = その★での連続失敗数。pity+1 >= 天井 なら確定成功
 */
export function tuneRoll(star, pity = 0, rng = Math.random, opts = {}) {
  const p = TUNE_RATES[star];
  if (p == null) return { success: false, guaranteed: false };
  const guaranteed = pity + 1 >= TUNE_PITY[star] || !!opts.ticket;
  if (guaranteed) return { success: true, guaranteed: true };
  return { success: rng() < Math.min(1, p * (opts.hot ? 1.05 : 1)), guaranteed: false };
}

/** その日の費用倍率（サンデー・ネオンで 0.7） */
export function tuneCostMult(now = Date.now()) {
  return weekdayEvent(now).tuneCostMult ?? 1;
}

/**
 * tuneInfo(state, itemRef, now?) → {ok, item, uid, label, star, maxStar, rate, cost, pity, pityMax, pityLeft, guaranteed,
 *   expected, nextStats, totalStats, canTune, reason, ticket, discount, table}
 *  nextStats = 次の★で増える値、totalStats = 現在の★による合計上昇値
 */
export function tuneInfo(state, itemRef, now = Date.now()) {
  const r = resolveItemRef(state, itemRef);
  if (!r) return { ok: false, canTune: false, reason: '装備が選択されていません' };
  const inst = r.inst;
  const it = ITEMS[inst.id];
  const maxStar = maxStarFor(it);
  const star = inst.star || 0;
  const base = { ok: true, item: it, uid: inst.uid, label: instLabel(inst), where: r.where, star, maxStar, table: tuneRateTable() };
  if (!maxStar) return { ...base, canTune: false, reason: 'この装備は強化できません', rate: 0, cost: 0, pity: 0, pityMax: 0 };
  const totalStats = starBonus(it, star, state.heroId);
  if (star >= maxStar) return { ...base, canTune: false, reason: '最大★に到達しています', rate: 0, cost: 0, pity: 0, pityMax: 0, totalStats, nextStats: null };
  const rate = TUNE_RATES[star];
  const pityMax = TUNE_PITY[star];
  const pity = Math.min(inst.tunePity || 0, pityMax - 1);
  const mult = tuneCostMult(now);
  const cost = Math.round(tuneCost(star, it.reqLevel) * mult / 10) * 10;
  const next = starBonus(it, star + 1, state.heroId);
  const nextStats = {};
  for (const k of Object.keys(next)) if (next[k] - totalStats[k]) nextStats[k] = next[k] - totalStats[k];
  const guaranteed = pity + 1 >= pityMax;
  const money = state.money || 0;
  return {
    ...base, rate, cost, pity, pityMax, pityLeft: pityMax - pity, guaranteed,
    expected: TUNE_EXPECTED[star], nextStats, totalStats,
    discount: mult < 1 ? Math.round((1 - mult) * 100) : 0,
    ticket: countItem(state, TUNE_TICKET),
    canTune: money >= cost, reason: money >= cost ? '' : `お金が足りません（$${cost}）`,
  };
}

/**
 * tuneItem(game, itemRef, opts={rng, ticket, now, hot}) → {ok, success, star, msg, guaranteed, cost, pity}
 *  opts.ticket: チューン・チケットを消費して確定成功（費用は通常どおり）
 *  opts.hot: ホット・チューン（ミニゲーム）成功時 true → 成功率 ×1.05
 */
export function tuneItem(game, itemRef, opts = {}) {
  const st = game.state;
  normalizeInventory(st);
  const info = tuneInfo(st, itemRef, opts.now);
  if (!info.ok) return { ok: false, success: false, star: 0, msg: info.reason };
  if (!info.canTune) return { ok: false, success: false, star: info.star, msg: info.reason };
  const r = resolveItemRef(st, itemRef);
  const inst = r.inst;
  const useTicket = !!opts.ticket && countItem(st, TUNE_TICKET) > 0;
  st.money -= info.cost;
  if (useTicket) removeItem(st, TUNE_TICKET, 1);
  const rng = opts.rng || stateRng(st);
  const { success, guaranteed } = tuneRoll(info.star, info.pity, rng, { hot: opts.hot, ticket: useTicket });
  const stats = (st.tuneStats ||= { tries: 0, success: 0, spent: 0 });
  stats.tries++; stats.spent += info.cost;
  const it = info.item;
  if (success) {
    stats.success++;
    inst.star = info.star + 1;
    inst.tunePity = 0;
    game.events?.emit('tuneResult', { success: true, star: inst.star, item: it, uid: inst.uid, guaranteed, cost: info.cost });
    if (TUNE_MILESTONES.includes(inst.star)) game.events?.emit('tuneMilestone', { star: inst.star, item: it, uid: inst.uid });
    return { ok: true, success: true, star: inst.star, guaranteed, cost: info.cost, pity: 0, msg: `${guaranteed ? '天井で確定成功！ ' : '成功！ '}${it.name} ★${inst.star}` };
  }
  inst.tunePity = (inst.tunePity || 0) + 1;
  game.events?.emit('tuneResult', { success: false, star: inst.star || 0, item: it, uid: inst.uid, pity: inst.tunePity, cost: info.cost });
  return {
    ok: true, success: false, star: inst.star || 0, guaranteed: false, cost: info.cost, pity: inst.tunePity,
    msg: `失敗…（★は下がりません。天井まであと ${info.pityMax - inst.tunePity} 回）`,
  };
}
