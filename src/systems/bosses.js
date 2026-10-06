// ボス難易度＋周回報酬＋練習モード — REFERENCE_MAPLE_SYSTEMS §3 S-5
//  - 難易度: normal / hard / chaos / practice（HP・攻撃倍率、制限時間、デスカウント、解放条件）
//  - 周回: ノーマル=日次 / ハード・カオス=週次（月曜5:00）。未消化は最大2周期まで持ち越し（ストック上限3）。
//          回数は「撃破時」に消費（失敗しても減らない）。練習は無制限・報酬なし
//  - 報酬: $ = round(200 × bossLv^1.6 × 係数)（係数 ノーマル1 / ハード4 / カオス12）、ボス・トロフィー（係数個）、チップ、
//          ハード/カオスで固有装備、カオス極レア（0.5〜2%）。トロフィー交換所が天井
//  - 記録: 最短タイム・最大ダメージ（自己ベスト更新で newBest）
// ワールド側: ボス部屋 = MAPS['boss_<名前>']（map.instance === 'boss', map.bossId）。spawner は game.bossMode（モード文字列）と
//   bossModeMult(mode) で倍率を掛け、撃破時に bossCleared(game, bossId, mode, info) を呼ぶ。
import { ENEMIES, BOSS_IDS } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';
import { MAPS } from '../world/maps.js';
import { MAP_INFO, mapName } from './travel.js';
import { refreshTicket, TICKET_CAP } from './daily.js';
import { addItem } from './inventory.js';
import { gameNow } from './combat.js';

export const BOSS_MODES = {
  normal:   { id: 'normal',   name: 'ノーマル', hpMult: 1,  atkMult: 1,   levelAdd: 0,  timeLimit: 600, lives: 3, reward: 1,  period: 'daily' },
  hard:     { id: 'hard',     name: 'ハード',   hpMult: 5,  atkMult: 1.8, levelAdd: 25, timeLimit: 720, lives: 3, reward: 4,  period: 'weekly' },
  chaos:    { id: 'chaos',    name: 'カオス',   hpMult: 15, atkMult: 2.8, levelAdd: 50, timeLimit: 900, lives: 1, reward: 12, period: 'weekly', reqLevel: 120 },
  practice: { id: 'practice', name: '練習',     hpMult: 1,  atkMult: 1,   levelAdd: 0,  timeLimit: Infinity, lives: Infinity, reward: 0, period: null },
};
export const BOSS_MODE_IDS = Object.keys(BOSS_MODES);
/** カオス固有の極レア（ボス別）。撃破20回分のトロフィーで交換所から確定入手できる（天井） */
export const CHAOS_RARE = { boss_don: { id: 'crown_caiman', chance: 0.02 }, boss_alien: { id: 'halo_zog', chance: 0.005 } };
export const BOSS_EXCHANGE = [
  { id: 'chip_reroll', cost: 1 }, { id: 'chip_lock', cost: 3 }, { id: 'tune_ticket', cost: 10 },
  { id: 'suit_vice', cost: 60 }, { id: 'crown_caiman', cost: 240 }, { id: 'halo_zog', cost: 480 },
];

const short = (id) => String(id).replace(/^boss_/, '');
/** ボス部屋のマップID（無ければボスのいるフィールド） */
export function bossRoomId(bossId) {
  const id = 'boss_' + short(bossId);
  if (MAPS[id]?.instance === 'boss') return id;
  if (MAPS['boss_' + bossId]?.instance === 'boss') return 'boss_' + bossId;
  return bossFieldId(bossId);
}
export function bossFieldId(bossId) {
  return Object.values(MAP_INFO).find((m) => m.boss === bossId)?.id || ENEMIES[bossId]?.habitats?.[0] || null;
}

/** bossModeMult(modeOrGame) → {hp, atk, levelAdd, mode}（spawner/enemy が参照。game を渡すと game.bossMode） */
export function bossModeMult(arg) {
  const mode = typeof arg === 'string' ? arg : arg?.bossMode;
  const m = BOSS_MODES[mode];
  if (!m) return { hp: 1, atk: 1, levelAdd: 0, mode: null };
  return { hp: m.hpMult, atk: m.atkMult, levelAdd: m.levelAdd, mode: m.id };
}

/** そのボス×難易度の記録 {ticket:{idx, stock}, clears, best:{time, maxHit}} */
export function bossRecord(state, bossId, mode) {
  if (!state.bosses || typeof state.bosses !== 'object') state.bosses = {};
  const b = (state.bosses[bossId] ||= {});
  const r = (b[mode] ||= {});
  if (!Number.isFinite(r.clears)) r.clears = 0;
  if (!r.best || typeof r.best !== 'object') r.best = { time: null, maxHit: 0 };
  if (BOSS_MODES[mode]?.period) r.ticket = refreshTicket(r.ticket, BOSS_MODES[mode].period, undefined, TICKET_CAP);
  return r;
}

/** 解放条件 → {ok, reason} */
export function bossUnlocked(state, bossId, mode = 'normal') {
  const def = ENEMIES[bossId];
  if (!def?.boss) return { ok: false, reason: 'ボスが見つかりません' };
  const seen = (state.book?.[bossId] || 0) > 0 || (state.visited || []).includes(bossFieldId(bossId));
  if (mode === 'normal' || mode === 'practice') return seen ? { ok: true } : { ok: false, reason: `${mapName(bossFieldId(bossId))} に到達すると解放` };
  const rec = (m) => state.bosses?.[bossId]?.[m]?.clears || 0;
  if (mode === 'hard') return rec('normal') > 0 ? { ok: true } : { ok: false, reason: 'ノーマルを撃破すると解放' };
  if (mode === 'chaos') {
    if (!(rec('hard') > 0)) return { ok: false, reason: 'ハードを撃破すると解放' };
    if ((state.level || 1) < BOSS_MODES.chaos.reqLevel) return { ok: false, reason: `Lv.${BOSS_MODES.chaos.reqLevel} 以上で解放` };
    return { ok: true };
  }
  return { ok: false, reason: '不明な難易度' };
}

/** 残り回数（練習は Infinity） */
export function bossStock(state, bossId, mode, now = Date.now()) {
  const m = BOSS_MODES[mode];
  if (!m) return 0;
  if (!m.period) return Infinity;
  const r = bossRecord(state, bossId, mode);
  refreshTicket(r.ticket, m.period, now, TICKET_CAP);
  return r.ticket.stock;
}

/** 報酬 $ = round(200 × bossLv^1.6 × 係数) */
export function bossRewardMoney(bossId, mode) {
  const def = ENEMIES[bossId];
  const k = BOSS_MODES[mode]?.reward || 0;
  return def ? Math.round(200 * Math.pow(def.level, 1.6) * k) : 0;
}

/** bossClears(state, now) → UI 用一覧 [{bossId, name, level, title, roomId, fieldId, modes:{mode:{name, unlocked, reason, stock, cap, clears, best, money, hpMult, atkMult, timeLimit, lives}}}] */
export function bossClears(state, now = Date.now()) {
  return BOSS_IDS.map((id) => {
    const def = ENEMIES[id];
    const modes = {};
    for (const mode of BOSS_MODE_IDS) {
      const m = BOSS_MODES[mode];
      const u = bossUnlocked(state, id, mode);
      const r = bossRecord(state, id, mode);
      modes[mode] = {
        name: m.name, unlocked: u.ok, reason: u.reason || '', stock: bossStock(state, id, mode, now), cap: m.period ? TICKET_CAP : Infinity,
        period: m.period, clears: r.clears, best: { ...r.best }, money: bossRewardMoney(id, mode), trophies: m.reward,
        hpMult: m.hpMult, atkMult: m.atkMult, recLevel: def.level + m.levelAdd, timeLimit: m.timeLimit, lives: m.lives,
      };
    }
    return { bossId: id, name: def.name, level: def.level, title: def.title || '', roomId: bossRoomId(id), fieldId: bossFieldId(id), modes };
  });
}

/**
 * bossEntry(game, bossId, mode='normal') → {ok, msg}
 *  ボス部屋へ移動（game.changeMap）。game.bossMode = mode、game.bossRun = {bossId, mode, t0, deaths, lives, timeLimit, returnMap}
 */
export function bossEntry(game, bossId, mode = 'normal', opts = {}) {
  const st = game.state;
  if (!BOSS_MODES[mode]) return { ok: false, msg: '不明な難易度' };
  const u = bossUnlocked(st, bossId, mode);
  if (!u.ok) return { ok: false, msg: u.reason };
  if (bossStock(st, bossId, mode, opts.now ?? gameNow(game)) <= 0) return { ok: false, msg: `今${BOSS_MODES[mode].period === 'weekly' ? '週' : '日'}の挑戦回数を使い切りました（練習モードは何度でも）` };
  const room = bossRoomId(bossId);
  if (!room || !MAPS[room]) return { ok: false, msg: 'ボス部屋が見つかりません' };
  const m = BOSS_MODES[mode];
  game.bossMode = mode;
  game.bossMaxHit = 0;
  const cur = game.map?.id || st.mapId;
  const returnMap = MAPS[cur] && !MAPS[cur].instance ? cur : (game.lastTownId && MAPS[game.lastTownId] ? game.lastTownId : bossFieldId(bossId));
  game.bossRun = { bossId, mode, t0: game.time || 0, deaths: 0, lives: m.lives, timeLimit: m.timeLimit, returnMap, roomId: room, cleared: false, failed: false };
  game.events?.emit('bossEnter', { bossId, mode });
  game.changeMap(room);
  game.notify?.(`${ENEMIES[bossId].name}（${m.name}）に挑戦！${Number.isFinite(m.timeLimit) ? ` 制限 ${Math.round(m.timeLimit / 60)}分` : ''}`, '#ff4d6d');
  return { ok: true, msg: '' };
}

/**
 * bossCleared(game, bossId?, mode?, info?) — ボス撃破（spawner が呼ぶ）。回数消費・報酬・記録 → 結果
 *  info: {time, maxHit}（無ければ game.bossRun / game.bossMaxHit から）
 */
export function bossCleared(game, bossId, mode, info = {}) {
  const st = game.state;
  const run = game.bossRun;
  bossId = bossId || run?.bossId;
  mode = mode || run?.mode || game.bossMode || 'normal';
  const m = BOSS_MODES[mode];
  const def = ENEMIES[bossId];
  if (!m || !def) return { ok: false };
  if (run?.cleared) return { ok: false, msg: '記録済み' };
  if (run) run.cleared = true;
  const time = Number.isFinite(info.time) ? info.time : run ? (game.time || 0) - run.t0 : null;
  const maxHit = Math.max(info.maxHit || 0, game.bossMaxHit || 0);
  const r = bossRecord(st, bossId, mode);
  const newBest = { time: false, maxHit: false };
  if (time != null && (r.best.time == null || time < r.best.time)) { r.best.time = Math.round(time * 100) / 100; newBest.time = true; }
  if (maxHit > (r.best.maxHit || 0)) { r.best.maxHit = maxHit; newBest.maxHit = true; }
  const out = { ok: true, bossId, mode, time, maxHit, newBest, money: 0, trophies: 0, items: [], firstClear: r.clears === 0 };
  if (mode === 'practice') {
    r.clears++;
    game.notify?.(`練習モード クリア（タイム ${time != null ? time.toFixed(1) + '秒' : '-'}）`, '#19f0ff');
    game.events?.emit('bossClear', out);
    return out;
  }
  const canReward = r.ticket.stock > 0;
  if (canReward) r.ticket.stock--;
  r.clears++;
  if (canReward) {
    out.money = bossRewardMoney(bossId, mode);
    out.trophies = m.reward;
    st.money = (st.money || 0) + out.money;
    st.bossTrophies = (st.bossTrophies || 0) + out.trophies;
    const give = (id, n = 1) => { if (ITEMS[id] && addItem(game, id, n, { silent: true })) out.items.push(id); };
    give('chip_reroll', { normal: 1, hard: 3, chaos: 6 }[mode]);
    if (mode === 'chaos') give('chip_lock', 1);
    if (mode === 'hard' || mode === 'chaos') {
      const eqs = (def.drops || []).filter((d) => ITEMS[d.id]?.type === 'equip' && ITEMS[d.id].slot !== 'pet');
      if (eqs.length && (mode === 'chaos' || Math.random() < 0.3)) give(eqs[Math.floor(Math.random() * eqs.length)].id);
      const rare = CHAOS_RARE[bossId];
      if (mode === 'chaos' && rare && Math.random() < rare.chance) give(rare.id);
    }
  }
  const pb = [newBest.time ? 'タイム自己ベスト！' : '', newBest.maxHit ? '最大ダメージ自己ベスト！' : ''].filter(Boolean).join(' ');
  game.notify?.(canReward
    ? `👑 ${def.name}（${m.name}）討伐！ $${out.money.toLocaleString()} ・トロフィー×${out.trophies} ${pb}`
    : `👑 ${def.name}（${m.name}）討伐！（今周期の報酬は受取済み）${pb}`, '#ffd23f');
  game.events?.emit('bossClear', out);
  return out;
}

/** bossExit(game, reason?) — ボス戦を終了して入場前のマップへ */
export function bossExit(game, reason = 'exit') {
  const run = game.bossRun;
  game.bossMode = null;
  game.bossRun = null;
  if (run && reason !== 'left') {
    const back = run.returnMap && MAPS[run.returnMap] ? run.returnMap : bossFieldId(run.bossId);
    if (back && game.map?.id === run.roomId) game.changeMap(back);
  }
  game.events?.emit('bossExit', { reason, bossId: run?.bossId, mode: run?.mode });
}

/** 毎フレーム（content.updateContent 経由）: 制限時間 */
export function bossUpdate(game) {
  const run = game.bossRun;
  if (!run || run.cleared || run.failed) return;
  if (!Number.isFinite(run.timeLimit)) return;
  if ((game.time || 0) - run.t0 > run.timeLimit) {
    run.failed = true;
    game.notify?.('⏰ 時間切れ… ボス戦失敗（挑戦回数は減りません）', '#ff8a8a');
    game.events?.emit('bossFail', { bossId: run.bossId, mode: run.mode, reason: 'time' });
    bossExit(game, 'time');
  }
}

/** 死亡時（attachContent が playerDied で呼ぶ）: デスカウント */
export function bossOnDeath(game) {
  const run = game.bossRun;
  if (!run || run.cleared) return;
  run.deaths++;
  if (run.deaths >= run.lives) {
    run.failed = true;
    game.notify?.('ボス戦失敗（デスカウント切れ。挑戦回数は減りません）', '#ff8a8a');
    game.events?.emit('bossFail', { bossId: run.bossId, mode: run.mode, reason: 'deaths' });
    game.bossMode = null; game.bossRun = null;
  } else game.notify?.(`デスカウント ${run.lives - run.deaths}`, '#ff8a8a');
}

/** ボス部屋以外へ移動したらボス戦終了 */
export function bossOnMapChanged(game, mapId) {
  const run = game.bossRun;
  if (run && mapId !== run.roomId) { game.bossMode = null; game.bossRun = null; game.events?.emit('bossExit', { reason: 'left', bossId: run.bossId, mode: run.mode }); }
}

/** bossExchange(game, itemId) → {ok, msg}（ボス・トロフィー交換所） */
export function bossExchange(game, itemId) {
  const st = game.state;
  const e = BOSS_EXCHANGE.find((x) => x.id === itemId);
  if (!e || !ITEMS[itemId]) return { ok: false, msg: '交換できません' };
  if ((st.bossTrophies || 0) < e.cost) return { ok: false, msg: `トロフィーが足りません（${e.cost}個）` };
  if (!addItem(game, itemId, 1, { silent: true, pot: null })) return { ok: false, msg: 'インベントリがいっぱいです' };
  st.bossTrophies -= e.cost;
  return { ok: true, msg: `${ITEMS[itemId].name} と交換した` };
}
