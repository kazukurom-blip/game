// ネオン・アリーナ（モンスターパーク相当）— REFERENCE_MAPLE_SYSTEMS A-6
//  - 1日2回（未消化はストック、最大6回）。入場時に1回消費
//  - Lv帯別6ステージ × 4ウェーブ（時間制: 360秒）。アリーナ内の撃破経験値 ×1.5
//  - クリア報酬 EXP = expToNext(L) × 0.12（Lv100以降 ×0.08）、300秒以内クリアで +20%。$・チップ
// ワールド側: MAPS.arena（map.instance === 'arena'）。spawner が arenaWaveDef(wave, game) で出現、全滅で arenaWaveCleared(game, wave)。
//   game.arenaEnded が true になったらウェーブを止める。
import { ENEMIES, hpAt, atkAt } from '../data/enemies.js';
import { expToNext } from '../data/balance.js';
import { MAPS } from '../world/maps.js';
import { refreshTicket } from './daily.js';
import { addItem } from './inventory.js';
import { gainExp } from './progression.js';
import { gameNow } from './combat.js';

export const ARENA_MAP_ID = 'arena';
export const ARENA_PER_DAY = 2;
export const ARENA_STOCK_CAP = 6;
export const ARENA_WAVES = 4;
export const ARENA_TIME_LIMIT = 360;
export const ARENA_FAST_CLEAR = 300;
export const ARENA_KILL_EXP_MULT = 1.5;
export const ARENA_STAGES = [
  { id: 'rookie',   name: 'ルーキー・リング',     minLevel: 10,  level: 15,  desc: 'ビーチとダウンタウンの腕自慢が集まる入門リング。' },
  { id: 'harbor',   name: 'ハーバー・ケージ',     minLevel: 30,  level: 34,  desc: '港の倉庫を改造した金網デスマッチ。' },
  { id: 'bayou',    name: 'バイユー・ピット',     minLevel: 45,  level: 50,  desc: '沼の地下闘技場。クロック・ジョーが胴元。' },
  { id: 'jackpot',  name: 'ジャックポット・ドーム', minLevel: 60, level: 65, desc: 'カジノ街の賭け試合。観客の歓声がネオンを揺らす。' },
  { id: 'skyline',  name: 'スカイライン・アリーナ', minLevel: 80, level: 85, desc: 'ヴァイス・タワー屋上の特設リング。' },
  { id: 'orbital',  name: 'オービタル・コロシアム', minLevel: 100, level: 110, desc: '宇宙港の無重力ドーム。来訪者も観戦している。' },
];

export function arenaState(state, now = Date.now()) {
  const a = state.arena && typeof state.arena === 'object' ? state.arena : (state.arena = {});
  a.clears = Math.max(0, a.clears | 0);
  if (!a.best || typeof a.best !== 'object') a.best = {};
  a.ticket = refreshTicket(a.ticket, 'daily', now, ARENA_STOCK_CAP, ARENA_PER_DAY);
  return a;
}

/** arenaInfo(state, now) → {stock, cap, perDay, clears, stages:[{...stage, unlocked, best}]} */
export function arenaInfo(state, now = Date.now()) {
  const a = arenaState(state, now);
  return {
    stock: a.ticket.stock, cap: ARENA_STOCK_CAP, perDay: ARENA_PER_DAY, clears: a.clears, waves: ARENA_WAVES, timeLimit: ARENA_TIME_LIMIT,
    stages: ARENA_STAGES.map((s) => ({ ...s, unlocked: (state.level || 1) >= s.minLevel, best: a.best[s.id] ?? null, expReward: arenaClearExp(state.level || 1, false) })),
  };
}

/** アリーナ内の撃破経験値倍率（combat.killExp が使う） */
export function arenaExpMult(game, enemy) {
  if (!game?.arenaRun || game.arenaEnded) return 1;
  if (enemy ? enemy.instance === 'arena' : game.map?.instance === 'arena') return ARENA_KILL_EXP_MULT;
  return 1;
}

export function arenaClearExp(level, fast) {
  const L = Math.max(1, Math.min(199, level));
  return Math.round(expToNext(L) * (L >= 100 ? 0.08 : 0.12) * (fast ? 1.2 : 1));
}

/** arenaEnter(game, stageId) → {ok, msg} */
export function arenaEnter(game, stageId) {
  const st = game.state;
  const stage = ARENA_STAGES.find((s) => s.id === stageId) || [...ARENA_STAGES].reverse().find((s) => (st.level || 1) >= s.minLevel);
  if (!stage) return { ok: false, msg: 'ステージが見つかりません' };
  if ((st.level || 1) < stage.minLevel) return { ok: false, msg: `${stage.name} は Lv.${stage.minLevel} から` };
  if (!MAPS[ARENA_MAP_ID]) return { ok: false, msg: 'アリーナが見つかりません' };
  const a = arenaState(st, gameNow(game));
  if (a.ticket.stock <= 0) return { ok: false, msg: '今日の挑戦回数を使い切りました（翌日5時に回復・最大6回までストック）' };
  a.ticket.stock--;
  game.arenaEnded = false;
  game.arenaRun = { stageId: stage.id, level: stage.level, t0: game.time || 0, wave: 0, done: false, failed: false };
  game.events?.emit('arenaEnter', { stageId: stage.id });
  game.changeMap(ARENA_MAP_ID);
  game.notify?.(`⚔ ${stage.name}（${ARENA_WAVES}ウェーブ・制限${Math.round(ARENA_TIME_LIMIT / 60)}分）`, '#19f0ff');
  return { ok: true, msg: '' };
}

const pool = () => Object.values(ENEMIES).filter((e) => !e.boss && !e.civilian && !e.isCop && !e.night && e.habitats?.length);
/**
 * arenaWaveDef(wave, gameOrStageId) → {wave, level, enemies:[{id, count}], count, hpMult, atkMult}
 *  最終ウェーブはエリート混じり（HP×1.5）
 */
export function arenaWaveDef(wave = 1, gameOrStage) {
  const stageId = typeof gameOrStage === 'string' ? gameOrStage : gameOrStage?.arenaRun?.stageId;
  const stage = ARENA_STAGES.find((s) => s.id === stageId) || ARENA_STAGES.find((s) => (gameOrStage?.state?.level || 1) < s.minLevel + 20) || ARENA_STAGES[0];
  const lv = stage.level + (wave - 1) * 2;
  const capLv = Math.min(lv, 96);
  const cands = pool().sort((a, b) => Math.abs(a.level - capLv) - Math.abs(b.level - capLv)).slice(0, 4);
  const count = 6 + wave * 2;
  const enemies = cands.slice(0, 2 + (wave >= 3 ? 1 : 0)).map((e) => ({ id: e.id, count: 0 }));
  for (let i = 0; i < count; i++) enemies[i % enemies.length].count++;
  const avgHp = cands.reduce((a, e) => a + e.hp, 0) / Math.max(1, cands.length);
  const avgAtk = cands.reduce((a, e) => a + e.atk, 0) / Math.max(1, cands.length);
  const finalK = wave >= ARENA_WAVES ? 1.5 : 1;
  return {
    wave, waves: ARENA_WAVES, stageId: stage.id, level: lv, enemies, count,
    hpMult: Math.max(0.3, hpAt(lv) / Math.max(1, avgHp)) * finalK, atkMult: Math.max(0.3, atkAt(lv) / Math.max(1, avgAtk)),
  };
}

/** arenaWaveCleared(game, wave) → 最終ウェーブなら arenaComplete の結果、それ以外 {ok, wave, next} */
export function arenaWaveCleared(game, wave) {
  const run = game.arenaRun;
  if (!run || run.done || run.failed) return { ok: false };
  run.wave = Math.max(run.wave, wave | 0);
  if (run.wave >= ARENA_WAVES) return arenaComplete(game);
  return { ok: true, wave: run.wave, next: run.wave + 1 };
}

/** arenaComplete(game) → {ok, exp, money, fast, time, best}（報酬・記録。game.arenaEnded = true） */
export function arenaComplete(game) {
  const st = game.state;
  const run = game.arenaRun;
  if (!run || run.done) return { ok: false };
  run.done = true;
  game.arenaEnded = true;
  const a = arenaState(st, gameNow(game));
  const time = Math.max(0, (game.time || 0) - run.t0);
  const fast = time <= ARENA_FAST_CLEAR;
  const exp = arenaClearExp(st.level || 1, fast);
  const money = Math.round(200 + run.level * 40);
  a.clears++;
  const best = a.best[run.stageId];
  const newBest = best == null || time < best;
  if (newBest) a.best[run.stageId] = Math.round(time * 10) / 10;
  st.money = (st.money || 0) + money;
  gainExp(game, exp);
  addItem(game, 'chip_reroll', 1, { silent: true });
  const out = { ok: true, stageId: run.stageId, exp, money, fast, time, newBest };
  game.notify?.(`🏆 アリーナ クリア！ EXP+${exp.toLocaleString()}${fast ? '（スピードボーナス+20%）' : ''} $${money}`, '#ffd23f');
  game.events?.emit('arenaClear', out);
  return out;
}

/** 毎フレーム（content.updateContent 経由）: 制限時間 */
export function arenaUpdate(game) {
  const run = game.arenaRun;
  if (!run || run.done || run.failed) return;
  if ((game.time || 0) - run.t0 > ARENA_TIME_LIMIT) {
    run.failed = true;
    game.arenaEnded = true;
    game.notify?.('⏰ アリーナ 時間切れ…（撃破分の経験値は獲得済み）', '#ff8a8a');
    game.events?.emit('arenaFail', { stageId: run.stageId, reason: 'time' });
  }
}

export function arenaOnMapChanged(game, mapId) {
  if (game.arenaRun && mapId !== ARENA_MAP_ID) { game.arenaRun = null; game.arenaEnded = false; }
}

/** arenaExit(game) — 町へ戻る */
export function arenaExit(game) {
  const back = game.lastTownId && MAPS[game.lastTownId] ? game.lastTownId : 'downtown';
  game.arenaRun = null; game.arenaEnded = false;
  if (game.map?.id === ARENA_MAP_ID) game.changeMap(back);
}
