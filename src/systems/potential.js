// ハックチップ（潜在能力。キューブ相当・全確率公開）— REFERENCE_MAPLE_SYSTEMS §3 S-4
//  - 3行。等級 レア→エピック→レジェンダリ→ミシック。等級アップに天井（その等級での試行回数で確定）
//  - 1行目は現等級、2・3行目は 25% で現等級 / 75% で1段下の等級の値
//  - 行の抽選は部位で該当するオプションから等確率
//  - 前後選択: useChip で結果（after）を見てから applyChipResult(keep) で採用/破棄。
//    等級アップは破棄しても失われない（破棄時は旧オプションを1段上の値に引き上げて保持）
//  - 行ロック: lockLine。ロック・チップ 1行=1個 / 2行=3個（チップ使用時に消費）
//  - 試行ログ: state.potLog（直近50件）・state.potStats（累計）
import { ITEMS } from '../data/items.js';
import {
  POT_GRADES, POT_GRADE_INFO, POT_UPGRADE, POT_SAME_GRADE_LINE, POT_LINES_N, POT_LOCK_COST, POT_LINES,
  POT_LINE_BY_STAT, potLinePool, potRateTable, potLineText, gradeIndex, lowerGrade, higherGrade,
  DROP_POT_CHANCE, DROP_POT_GRADES,
} from '../data/gear.js';
import { stateRng, weighted } from './rng.js';
import { resolveItemRef, countItem, removeItem, normalizeInventory, instLabel } from './inventory.js';
import { clampVitals } from './progression.js';

export { POT_GRADES, POT_GRADE_INFO, POT_LINES, potRateTable, potLineText };
export const POT_LOG_MAX = 50;
export const CHIP_IDS = { reroll: 'chip_reroll', lock: 'chip_lock' };

/** 確率表（公開）: {upgrade, sameGradeLine, lockCost, dropChance, dropGrades} */
export const POT_RATES = {
  upgrade: POT_UPGRADE,
  sameGradeLine: POT_SAME_GRADE_LINE,
  lockCost: POT_LOCK_COST,
  dropChance: DROP_POT_CHANCE,
  dropGrades: Object.fromEntries(DROP_POT_GRADES),
  table: potRateTable,
};

const itemOf = (x) => (typeof x === 'string' ? ITEMS[x] : x?.slot ? x : ITEMS[x?.id]);
export function canHavePotential(item) {
  const it = itemOf(item);
  return !!it && it.type === 'equip' && it.slot !== 'pet';
}

function rollLine(slot, lineGrade, rng) {
  const pool = potLinePool(slot, lineGrade);
  if (!pool.length) return null;
  const d = pool[Math.floor(rng() * pool.length) % pool.length];
  return { stat: d.stat, value: d.values[gradeIndex(lineGrade)], grade: lineGrade };
}

/**
 * rollPotential(item, grade, rng=Math.random, keep=[null|line ×3]) → {grade, lines:[{stat, value, grade}]}
 *  keep[i] があればその行はそのまま（行ロック）
 */
export function rollPotential(item, grade = 'rare', rng = Math.random, keep = []) {
  const it = itemOf(item);
  if (!canHavePotential(it)) return null;
  if (!POT_GRADES.includes(grade)) grade = 'rare';
  const lines = [];
  for (let i = 0; i < POT_LINES_N; i++) {
    if (keep[i]) { lines.push({ ...keep[i] }); continue; }
    const lg = i === 0 || grade === 'rare' ? grade : rng() < POT_SAME_GRADE_LINE ? grade : lowerGrade(grade);
    lines.push(rollLine(it.slot, lg, rng));
  }
  return { grade, lines: lines.filter(Boolean) };
}

/** ドロップ時の低確率潜在（6%）。付かなければ null */
export function maybePotential(item, rng = Math.random) {
  if (!canHavePotential(item)) return null;
  if (rng() >= DROP_POT_CHANCE) return null;
  return rollPotential(item, weighted(DROP_POT_GRADES, rng), rng);
}

/** 等級アップの判定（天井込み）。pity = その等級での失敗回数（今回を含まない） */
export function rollGradeUp(grade, pity, rng = Math.random) {
  const u = POT_UPGRADE[grade];
  if (!u) return { up: false, guaranteed: false };
  if (pity + 1 >= u.pity) return { up: true, guaranteed: true };
  return { up: rng() < u.p, guaranteed: false };
}

function ensureLog(state) {
  if (!Array.isArray(state.potLog)) state.potLog = [];
  if (!state.potStats || typeof state.potStats !== 'object') state.potStats = { tries: 0, gradeUps: 0, byGrade: {} };
  return state.potLog;
}

/** 行ロック数 → 必要なロック・チップ数 */
export function lockCost(inst) {
  const n = (inst?.potLocks || []).filter(Boolean).length;
  return POT_LOCK_COST[Math.min(n, POT_LOCK_COST.length - 1)] ?? 99;
}

/** lockLine(game|state, itemRef, lineIndex, locked=true) → {ok, msg, locks} */
export function lockLine(gameOrState, itemRef, lineIndex, locked = true) {
  const st = gameOrState?.state || gameOrState;
  const r = resolveItemRef(st, itemRef);
  if (!r || !canHavePotential(r.inst.id)) return { ok: false, msg: '対象がありません' };
  const inst = r.inst;
  if (!inst.pot) return { ok: false, msg: '潜在がありません' };
  if (!(lineIndex >= 0 && lineIndex < inst.pot.lines.length)) return { ok: false, msg: '行がありません' };
  const locks = Array.isArray(inst.potLocks) ? inst.potLocks.slice(0, POT_LINES_N) : [];
  while (locks.length < POT_LINES_N) locks.push(false);
  locks[lineIndex] = !!locked;
  if (locks.filter(Boolean).length >= POT_LINES_N) return { ok: false, msg: '全行はロックできません', locks: inst.potLocks || locks.map(() => false) };
  inst.potLocks = locks;
  return { ok: true, msg: locked ? `${lineIndex + 1}行目をロック` : `${lineIndex + 1}行目のロック解除`, locks };
}

/**
 * potInfo(state, itemRef) → {grade, lines, pending, pity, pityMax, upRate, nextGrade, locks, lockCost, chips:{reroll, lock}, expected}
 */
export function potInfo(state, itemRef) {
  const r = resolveItemRef(state, itemRef);
  if (!r || !canHavePotential(r.inst.id)) return null;
  const inst = r.inst;
  const grade = inst.pot?.grade || null;
  const u = grade ? POT_UPGRADE[grade] : null;
  return {
    item: ITEMS[inst.id], uid: inst.uid, label: instLabel(inst),
    grade, gradeName: grade ? POT_GRADE_INFO[grade].name : '未設定',
    lines: (inst.pot?.lines || []).map((l) => ({ ...l, text: potLineText(l) })),
    pending: inst.potPending ? { ...inst.potPending, lines: inst.potPending.lines.map((l) => ({ ...l, text: potLineText(l) })) } : null,
    pity: inst.potPity || 0, pityMax: u?.pity ?? null, upRate: u?.p ?? 0, nextGrade: u?.to ?? null,
    pityLeft: u ? Math.max(1, u.pity - (inst.potPity || 0)) : null,
    expected: u ? (1 - Math.pow(1 - u.p, u.pity)) / u.p : null,
    locks: (inst.potLocks || []).slice(0, POT_LINES_N),
    lockCost: lockCost(inst),
    chips: { reroll: countItem(state, CHIP_IDS.reroll), lock: countItem(state, CHIP_IDS.lock) },
    rates: potRateTable(ITEMS[inst.id].slot),
  };
}

/**
 * useChip(game, itemRef, chipId='chip_reroll', opts={rng}) → {ok, msg, before, after, gradeUp, guaranteed, pity}
 *  潜在の無い装備 → レア等級の潜在を付与（即採用）
 *  潜在あり → 結果は inst.potPending に入る。applyChipResult(game, itemRef, keep) で確定
 */
export function useChip(game, itemRef, chipId = CHIP_IDS.reroll, opts = {}) {
  const st = game.state;
  normalizeInventory(st);
  const r = resolveItemRef(st, itemRef);
  if (!r || !canHavePotential(r.inst.id)) return { ok: false, msg: 'この装備には使えません' };
  const inst = r.inst;
  if (chipId !== CHIP_IDS.reroll) return { ok: false, msg: 'チップの種類が違います' };
  if (inst.potPending) return { ok: false, msg: '前の結果を「採用」か「破棄」してください' };
  if (countItem(st, chipId) <= 0) return { ok: false, msg: 'リロール・チップがありません' };
  const rng = opts.rng || stateRng(st);
  const it = ITEMS[inst.id];
  const before = inst.pot ? { grade: inst.pot.grade, lines: inst.pot.lines.map((l) => ({ ...l })) } : null;
  ensureLog(st);

  if (!inst.pot) {
    removeItem(st, chipId, 1);
    inst.pot = rollPotential(it, 'rare', rng);
    inst.potPity = 0;
    logTry(game, inst, { before: null, after: inst.pot, gradeUp: false, first: true });
    if (r.where === 'equipped') clampVitals(st);
    return { ok: true, msg: `${it.name} に潜在（レア）を付与した`, before: null, after: inst.pot, gradeUp: false, guaranteed: false, pity: 0, applied: true };
  }

  const locks = (inst.potLocks || []).slice(0, POT_LINES_N);
  const need = lockCost(inst);
  if (need > 0 && countItem(st, CHIP_IDS.lock) < need) return { ok: false, msg: `ロック・チップが足りません（${need}個必要）` };
  removeItem(st, chipId, 1);
  if (need > 0) removeItem(st, CHIP_IDS.lock, need);

  let grade = inst.pot.grade;
  const gu = rollGradeUp(grade, inst.potPity || 0, rng);
  if (gu.up) {
    grade = POT_UPGRADE[grade].to;
    inst.potPity = 0;
    inst.potGradeKept = grade; // 等級アップは破棄しても維持する
  } else if (POT_UPGRADE[grade]) inst.potPity = (inst.potPity || 0) + 1;
  const keep = inst.pot.lines.map((l, i) => (locks[i] ? l : null));
  const after = rollPotential(it, grade, rng, keep);
  inst.potPending = after;
  st.potStats.tries++;
  st.potStats.byGrade[before.grade] = (st.potStats.byGrade[before.grade] || 0) + 1;
  if (gu.up) st.potStats.gradeUps++;
  logTry(game, inst, { before, after, gradeUp: gu.up, guaranteed: gu.guaranteed });
  game.events?.emit('chipUsed', { item: it, uid: inst.uid, gradeUp: gu.up, grade, before, after });
  if (gu.up) game.events?.emit('potentialGradeUp', { item: it, uid: inst.uid, grade });
  return {
    ok: true, msg: gu.up ? `等級アップ！ ${POT_GRADE_INFO[grade].name}` : '再設定した（結果を選んでください）',
    before, after, gradeUp: gu.up, guaranteed: gu.guaranteed, pity: inst.potPity || 0, applied: false,
  };
}

function logTry(game, inst, o) {
  const st = game.state;
  const log = ensureLog(st);
  log.push({ t: Date.now(), itemId: inst.id, uid: inst.uid, grade: o.after?.grade, gradeUp: !!o.gradeUp, guaranteed: !!o.guaranteed, lines: (o.after?.lines || []).map((l) => potLineText(l)) });
  while (log.length > POT_LOG_MAX) log.shift();
}

/** 等級アップ後に旧オプションを破棄せず残す場合: 各行を1段上の等級の値へ */
function upgradeLines(lines, slot, toGrade) {
  return lines.map((l) => {
    const d = POT_LINE_BY_STAT[l.stat];
    const g = higherGrade(l.grade || lowerGrade(toGrade));
    const gi = Math.min(gradeIndex(g), gradeIndex(toGrade));
    const v = d?.values[gi];
    return v != null ? { stat: l.stat, value: v, grade: POT_GRADES[gi] } : { ...l };
  });
}

/** applyChipResult(game, itemRef, keep:boolean) → {ok, msg, pot} */
export function applyChipResult(game, itemRef, keep) {
  const st = game.state;
  const r = resolveItemRef(st, itemRef);
  if (!r) return { ok: false, msg: '対象がありません' };
  const inst = r.inst;
  if (!inst.potPending) return { ok: false, msg: '選択待ちの結果がありません' };
  const pend = inst.potPending;
  if (keep) inst.pot = pend;
  else if (inst.potGradeKept && inst.potGradeKept !== inst.pot.grade) {
    inst.pot = { grade: inst.potGradeKept, lines: upgradeLines(inst.pot.lines, ITEMS[inst.id].slot, inst.potGradeKept) };
  }
  delete inst.potPending;
  delete inst.potGradeKept;
  if (r.where === 'equipped') clampVitals(st);
  game.events?.emit('chipApplied', { uid: inst.uid, keep: !!keep, pot: inst.pot });
  return { ok: true, msg: keep ? '新しい潜在を採用した' : '元の潜在を残した', pot: inst.pot };
}

/** potLog(state) → 直近50件（新しい順）と累計 */
export function potLog(state) {
  ensureLog(state);
  return { entries: [...state.potLog].reverse(), stats: state.potStats };
}
