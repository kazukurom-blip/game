// 日次/週次リセット・持ち越しチケット・ログインカレンダー・曜日イベント（ローカル時刻）
//  - 日次: 毎日 5:00 リセット / 週次: 月曜 5:00 リセット
//  - 持ち越し: 未消化分は最大2周期まで（＝ストック上限 3）。取り逃しのストレスをなくす
//  - 時計の巻き戻し: 最後に記録した周期より前なら加算しない
//  - ログインカレンダー: 28日周期・累計日数（連続不要）。1日1回
import { ITEMS } from '../data/items.js';
import { addItem } from './inventory.js';

export const DAY_RESET_HOUR = 5;
export const CARRY_PERIODS = 2;            // 持ち越し周期
export const TICKET_CAP = 1 + CARRY_PERIODS;
const DAY_MS = 86400000;

/** dayIndex(now) — 5:00 区切りのローカル日付の通し番号 */
export function dayIndex(now = Date.now()) {
  const d = new Date(now - DAY_RESET_HOUR * 3600000);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}
/** weekIndex(now) — 月曜 5:00 区切りの週の通し番号 */
export function weekIndex(now = Date.now()) { return Math.floor((dayIndex(now) + 3) / 7); }
export function periodIndex(kind, now = Date.now()) { return kind === 'weekly' ? weekIndex(now) : dayIndex(now); }
/** 表示用キー '2026-10-04' / '2026-W40' */
export function dayKey(now = Date.now()) {
  const d = new Date(now - DAY_RESET_HOUR * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekKey(now = Date.now()) { return 'W' + weekIndex(now); }

/** 次のリセットまでの ms */
export function msUntilReset(kind, now = Date.now()) {
  const cur = periodIndex(kind, now);
  let lo = now, hi = now + (kind === 'weekly' ? 8 : 2) * DAY_MS;
  while (hi - lo > 1000) { const mid = (lo + hi) / 2; if (periodIndex(kind, mid) === cur) lo = mid; else hi = mid; }
  return hi - now;
}

/**
 * チケット（持ち越し付き回数）: rec = {idx, stock}
 * refreshTicket(rec, kind, now, cap, perPeriod=1) → rec（周期が進んだ分だけ stock を加算。上限 cap）
 */
export function refreshTicket(rec, kind = 'daily', now = Date.now(), cap = TICKET_CAP, perPeriod = 1) {
  const cur = periodIndex(kind, now);
  if (!rec || typeof rec !== 'object') rec = {};
  if (!Number.isInteger(rec.idx)) { rec.idx = cur; rec.stock = perPeriod; return rec; }
  if (!Number.isFinite(rec.stock)) rec.stock = 0;
  const gained = cur - rec.idx;
  if (gained > 0) { rec.stock = Math.min(cap, rec.stock + gained * perPeriod); rec.idx = cur; }
  return rec;
}
export function useTicket(rec, kind = 'daily', now = Date.now(), cap = TICKET_CAP, perPeriod = 1) {
  refreshTicket(rec, kind, now, cap, perPeriod);
  if (rec.stock <= 0) return false;
  rec.stock--;
  return true;
}

// ============================================================ 曜日イベント
export const WEEKDAY_EVENTS = {
  1: { id: 'monday_exp', name: 'マンデー・ブースト', desc: '経験値 +10%', expMult: 1.1 },
  3: { id: 'wednesday_drop', name: 'ミッドウィーク・ラッシュ', desc: 'ドロップ率 +20%', dropMult: 1.2 },
  5: { id: 'friday_money', name: 'フライデー・ナイト', desc: '獲得金 +20%', moneyMult: 1.2 },
  0: { id: 'sunday_neon', name: 'サンデー・ネオン', desc: 'ネオン・チューン費用 -30%', tuneCostMult: 0.7 },
};
const NO_EVENT = { id: null, name: '', desc: '', expMult: 1, dropMult: 1, moneyMult: 1, tuneCostMult: 1 };
/** weekdayEvent(now) → {id, name, desc, expMult, dropMult, moneyMult, tuneCostMult}（5:00 区切りの曜日） */
export function weekdayEvent(now = Date.now()) {
  const d = new Date(now - DAY_RESET_HOUR * 3600000);
  return { ...NO_EVENT, ...(WEEKDAY_EVENTS[d.getDay()] || {}) };
}

// ============================================================ ログインカレンダー
const R = (items, money = 0, label) => ({ items, money, label });
/** 28日分。7日ごとに大きい報酬、28日目にペットの餌まとめ＋ロック・チップ */
export const LOGIN_REWARDS = [
  R([['potion_orange', 10]], 500), R([['chip_reroll', 1]]), R([['potion_blue', 10]], 800), R([['drink_energy', 2]]),
  R([['chip_reroll', 1]], 1000), R([['pet_food', 2]]), R([['chip_reroll', 3], ['tune_ticket', 1]], 5000, '1週目ボーナス'),
  R([['potion_white', 10]], 1500), R([['chip_reroll', 1]]), R([['potion_mana', 10]], 2000), R([['drink_tough', 2]]),
  R([['chip_reroll', 2]], 2500), R([['pet_food', 3]]), R([['chip_reroll', 3], ['chip_lock', 1]], 10000, '2週目ボーナス'),
  R([['power_elixir', 5]], 3000), R([['chip_reroll', 1]]), R([['drink_lucky', 1]], 3500), R([['potion_white', 15]]),
  R([['chip_reroll', 2]], 4000), R([['pet_food', 3]]), R([['chip_reroll', 4], ['tune_ticket', 1]], 20000, '3週目ボーナス'),
  R([['elixir', 3]], 5000), R([['chip_reroll', 2]]), R([['drink_lucky', 2]], 6000), R([['potion_mana', 15]]),
  R([['chip_reroll', 3]], 8000), R([['elixir', 5]]), R([['chip_reroll', 5], ['chip_lock', 3], ['pet_food', 10]], 50000, '28日皆勤ボーナス'),
];
export const LOGIN_CYCLE = LOGIN_REWARDS.length;

function ensureLogin(state) {
  const l = state.login && typeof state.login === 'object' ? state.login : {};
  state.login = { days: Math.max(0, Math.floor(l.days || 0)), lastDay: Number.isInteger(l.lastDay) ? l.lastDay : null, history: Array.isArray(l.history) ? l.history.slice(-28) : [] };
  return state.login;
}

/** loginStatus(state, now) → {days, today(1〜28 の今日の枠), claimedToday, rewards:[{day, items, money, label, claimed}]} */
export function loginStatus(state, now = Date.now()) {
  const l = ensureLogin(state);
  const claimedToday = l.lastDay === dayIndex(now);
  const nextDay = claimedToday ? l.days : l.days + 1;
  const cyc = Math.floor((nextDay - 1) / LOGIN_CYCLE);
  const inCycle = ((nextDay - 1) % LOGIN_CYCLE) + 1;
  return {
    days: l.days, claimedToday, today: inCycle, cycle: cyc + 1,
    rewards: LOGIN_REWARDS.map((r, i) => ({ day: i + 1, ...r, claimed: i + 1 < inCycle || (i + 1 === inCycle && claimedToday) })),
  };
}

/** loginCheck(game, now) → {ok, day, reward} | {ok:false}（その日まだなら報酬を受け取る） */
export function loginCheck(game, now = Date.now()) {
  const st = game.state;
  if (!st) return { ok: false };
  const l = ensureLogin(st);
  const today = dayIndex(now);
  if (l.lastDay != null && today <= l.lastDay) return { ok: false, reason: l.lastDay === today ? 'claimed' : 'clock' };
  l.days++;
  l.lastDay = today;
  const slot = ((l.days - 1) % LOGIN_CYCLE) + 1;
  const reward = LOGIN_REWARDS[slot - 1];
  if (reward.money) st.money = (st.money || 0) + reward.money;
  for (const [id, n] of reward.items) if (ITEMS[id]) addItem(game, id, n, { silent: true, pot: null });
  l.history.push({ day: today, slot });
  if (l.history.length > 28) l.history.shift();
  const names = reward.items.map(([id, n]) => `${ITEMS[id]?.name || id}×${n}`).join(' ');
  game.notify?.(`ログインボーナス ${slot}日目${reward.label ? `（${reward.label}）` : ''}: ${names}${reward.money ? ` $${reward.money}` : ''}`, '#ffd23f');
  game.events?.emit('loginBonus', { day: slot, days: l.days, reward });
  return { ok: true, day: slot, days: l.days, reward };
}

/**
 * attachDaily(game) — 開始時と mapChanged でログインボーナス確認、曜日イベントの通知。戻り値: 購読解除
 */
export function attachDaily(game) {
  if (game._dailyUnsub) return game._dailyUnsub;
  const ev = game.events;
  let lastEventDay = null;
  const check = () => {
    if (!game.state) return;
    loginCheck(game);
    const di = dayIndex();
    if (lastEventDay !== di) {
      lastEventDay = di;
      const e = weekdayEvent();
      if (e.id) game.notify?.(`本日のイベント「${e.name}」: ${e.desc}`, '#19f0ff');
    }
  };
  const offs = [ev?.on('mapChanged', check), ev?.on('gameStarted', check)];
  check();
  game._dailyUnsub = () => { offs.forEach((f) => f?.()); game._dailyUnsub = null; };
  return game._dailyUnsub;
}
