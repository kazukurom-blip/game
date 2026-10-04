// 無限タワー「ヴァイス・スパイア」— REFERENCE_MAPLE_SYSTEMS §3 S-6
//  - Lv40 解放。1フロア = 全滅で次の階。5階ごとミニボス、10階ごとボス（既存ボスの強化版をローテーション）
//  - 敵Lv = 20 + floor×1.2（表示は200で頭打ち）。HP = hpAt(敵Lv) × 1.06^max(0, floor-100)、攻撃 = atkAt(敵Lv) × 1.04^max(0, floor-100)
//  - 制限時間 90秒/階。ミューテーター: 11階以降は週替わり特性1つ、51階以降はさらに各階ランダムに1〜2個（最大3、事前表示）。報酬 +10%/個
//  - 初到達報酬: 10階ごと リロール・チップ×(floor/10)、50階ごと チューン・チケット、100階ごと 称号＋スパイア武器
//  - 週次: 最高到達階に応じて スパイア・トークン = floor(週最高^1.2)（週の切り替わりで付与）。交換所 towerExchange
//  - 再開: 1階 or 10階区切り+1（過去最高の 10 の倍数まで）から
// ワールド側: map.instance === 'tower'（MAPS.tower）。spawner が game.towerFloor の towerFloorDef を使い、全滅で towerClearFloor(game)。
//   「次の階」ポータルは towerEnter(game, floor+1)。
import { ENEMIES, BOSS_IDS, hpAt, atkAt } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';
import { expToNext } from '../data/balance.js';
import { MAPS } from '../world/maps.js';
import { makeRng } from './rng.js';
import { weekIndex } from './daily.js';
import { addItem } from './inventory.js';
import { gainExp } from './progression.js';
import { gameNow } from './combat.js';

export const TOWER_MAP_ID = 'tower';
export const TOWER_UNLOCK_LEVEL = 40;
export const TOWER_TIME_LIMIT = 90;
export const TOWER_MUTATORS = {
  swift:    { id: 'swift',    name: '疾風',       desc: '敵の移動速度 +30%', speedMult: 1.3 },
  noPotion: { id: 'noPotion', name: '断薬',       desc: '回復アイテム使用不可', noPotion: true },
  dark:     { id: 'dark',     name: '暗闇',       desc: '視界半径 300px', darkness: 300 },
  volatile: { id: 'volatile', name: '誘爆',       desc: '敵が倒れると爆発する', explodeOnDeath: true },
  storm:    { id: 'storm',    name: 'ネオン嵐',   desc: '定期的に落雷が降る', lightning: 6 },
  elite:    { id: 'elite',    name: 'エリート',   desc: 'エリート（HP×6）が1体確定', eliteCount: 1 },
  tough:    { id: 'tough',    name: '鋼鉄',       desc: '敵のHP +40%', hpMult: 1.4 },
  fierce:   { id: 'fierce',   name: '狂暴',       desc: '敵の攻撃 +30%', atkMult: 1.3 },
  swarm:    { id: 'swarm',    name: '大群',       desc: '敵の数 +50%', countMult: 1.5 },
  armored:  { id: 'armored',  name: '装甲',       desc: '敵の防御 +50%', defMult: 1.5 },
};
const MUT_IDS = Object.keys(TOWER_MUTATORS);
export const TOWER_EXCHANGE = [
  { id: 'chip_reroll', cost: 5 }, { id: 'pet_food', cost: 3 }, { id: 'chip_lock', cost: 20 }, { id: 'tune_ticket', cost: 60 },
];
const SPIRE_WEAPON = { luna: 'pistol_spire', jin: 'neon_sword_spire', hacker: 'staff_spire' };

/** state.tower を保証 */
export function towerState(state, now = Date.now()) {
  const t = state.tower && typeof state.tower === 'object' ? state.tower : (state.tower = {});
  t.best = Math.max(0, t.best | 0);
  t.weekBest = Math.max(0, t.weekBest | 0);
  t.tokens = Math.max(0, t.tokens | 0);
  if (!t.firstClears || typeof t.firstClears !== 'object') t.firstClears = {};
  if (!t.bestTime || typeof t.bestTime !== 'object') t.bestTime = {};
  const w = weekIndex(now);
  if (!Number.isInteger(t.weekIdx)) t.weekIdx = w;
  else if (w > t.weekIdx) {
    // 週の切り替わり: 前週の最高到達に応じてトークン
    const gain = t.weekBest > 0 ? Math.floor(Math.pow(t.weekBest, 1.2)) : 0;
    t.tokens += gain;
    t.lastWeekBest = t.weekBest;
    t.lastWeekTokens = gain;
    t.weekBest = 0;
    t.weekIdx = w;
  }
  return t;
}

/** 再開できる階 [1, 11, 21, ...]（過去最高の10の倍数まで） */
export function towerStartFloors(state) {
  const best = towerState(state).best;
  const out = [1];
  for (let f = 10; f <= best; f += 10) out.push(f + 1);
  return out;
}

/** towerBest(state) → {best, weekBest, lastWeekBest, tokens, startFloors, unlocked, weeklyPreview} */
export function towerBest(state) {
  const t = towerState(state);
  return {
    best: t.best, weekBest: t.weekBest, lastWeekBest: t.lastWeekBest || 0, tokens: t.tokens,
    startFloors: towerStartFloors(state), unlocked: (state.level || 1) >= TOWER_UNLOCK_LEVEL,
    weeklyPreview: t.weekBest > 0 ? Math.floor(Math.pow(t.weekBest, 1.2)) : 0,
    weekMutator: TOWER_MUTATORS[weeklyMutatorId(weekIndex())],
  };
}

export function weeklyMutatorId(wi) { return MUT_IDS[((wi % MUT_IDS.length) + MUT_IDS.length) % MUT_IDS.length]; }

const mobPool = () => Object.values(ENEMIES).filter((e) => !e.boss && !e.civilian && !e.isCop && !e.night && e.habitats?.length);

/**
 * towerFloorDef(floor, gameOrWeek?) → {floor, name, label, level, displayLevel, enemies:[{id, level, count}], count,
 *   boss: bossId|null, bossHpMult, miniBoss: {id, hpMult}|null, hpMult, atkMult, mutators:[{id,name,desc,...}], timeLimit, rewardMult}
 *  hpMult/atkMult は「選ばれた敵の素の値」に掛ける倍率（spawner の scaleEnemy 用）。週は game の実時刻 or 数値で指定
 */
export function towerFloorDef(floor = 1, gameOrWeek) {
  floor = Math.max(1, Math.floor(floor) || 1);
  const wi = typeof gameOrWeek === 'number' ? gameOrWeek : weekIndex(gameOrWeek ? gameNow(gameOrWeek) : Date.now());
  const R = makeRng(`spire:${floor}:${wi}`);
  const level = Math.round(20 + floor * 1.2);
  const displayLevel = Math.min(200, level);
  const over = Math.max(0, floor - 100);
  const hpTarget = hpAt(level) * Math.pow(1.06, over);
  const atkTarget = atkAt(level) * Math.pow(1.04, over);
  // 敵: Lv が近い（上限96）モンスターから2〜3種（階×週で決定的）
  const capLv = Math.min(level, 96);
  const pool = mobPool().sort((a, b) => Math.abs(a.level - capLv) - Math.abs(b.level - capLv)).slice(0, 8);
  const kinds = 2 + (floor % 3 === 0 ? 1 : 0);
  const chosen = [];
  while (chosen.length < kinds && pool.length) chosen.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  // ミューテーター
  const muts = [];
  if (floor >= 11) muts.push(weeklyMutatorId(wi));
  if (floor >= 51) {
    const n = 1 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const id = MUT_IDS[Math.floor(R() * MUT_IDS.length)];
      if (!muts.includes(id)) muts.push(id);
    }
  }
  const mutators = muts.slice(0, 3).map((id) => ({ ...TOWER_MUTATORS[id] }));
  const mprod = (k) => mutators.reduce((a, m) => a * (m[k] || 1), 1);
  let count = Math.round((5 + Math.min(7, Math.floor(floor / 3))) * mprod('countMult'));
  const avgHp = chosen.reduce((a, e) => a + e.hp, 0) / Math.max(1, chosen.length);
  const avgAtk = chosen.reduce((a, e) => a + e.atk, 0) / Math.max(1, chosen.length);
  const hpMult = Math.max(0.2, hpTarget / Math.max(1, avgHp)) * mprod('hpMult');
  const atkMult = Math.max(0.2, atkTarget / Math.max(1, avgAtk)) * mprod('atkMult');
  const per = Math.max(1, Math.floor(count / Math.max(1, chosen.length)));
  const enemies = chosen.map((e, i) => ({ id: e.id, level: displayLevel, count: i === chosen.length - 1 ? count - per * (chosen.length - 1) : per, baseLevel: e.level }));
  // ボス（10階ごと）・ミニボス（5階ごと）
  let boss = null, bossHpMult = null, miniBoss = null;
  if (floor % 10 === 0) {
    boss = BOSS_IDS[(floor / 10 - 1) % BOSS_IDS.length];
    bossHpMult = Math.max(0.05, (hpTarget * 15) / ENEMIES[boss].hp) * mprod('hpMult');
  } else if (floor % 5 === 0 || mutators.some((m) => m.eliteCount)) {
    miniBoss = { id: chosen[0]?.id, hpMult: hpMult * 6, elite: true };
  }
  return {
    floor, name: `ヴァイス・スパイア ${floor}F`, label: `${floor}F`, level, displayLevel,
    enemies, count, boss, bossHpMult, miniBoss, hpMult, atkMult, defMult: mprod('defMult'), speedMult: mprod('speedMult'),
    mutators, timeLimit: TOWER_TIME_LIMIT, rewardMult: 1 + 0.1 * mutators.length,
  };
}

/** 初到達報酬の一覧（UI プレビュー用）: towerFirstClearRewards(floor, heroId) → [{id, qty}|{title}] */
export function towerFirstClearRewards(floor, heroId = 'luna') {
  const out = [];
  if (floor % 10 === 0) out.push({ id: 'chip_reroll', qty: floor / 10 });
  if (floor % 50 === 0) out.push({ id: 'tune_ticket', qty: 1 });
  if (floor % 100 === 0) { out.push({ title: 't_spire_100' }); out.push({ id: SPIRE_WEAPON[heroId] || 'neon_sword_spire', qty: 1 }); }
  return out;
}

/**
 * towerEnter(game, floor=1) → {ok, msg, floor}
 *  1階・チェックポイント（10階区切り+1）か、クリア直後の次の階へ。game.towerFloor / game.towerRun を設定し MAPS.tower へ
 */
export function towerEnter(game, floor = 1) {
  const st = game.state;
  floor = Math.max(1, Math.floor(floor) || 1);
  if ((st.level || 1) < TOWER_UNLOCK_LEVEL) return { ok: false, msg: `ヴァイス・スパイアは Lv.${TOWER_UNLOCK_LEVEL} から` };
  if (!MAPS[TOWER_MAP_ID]) return { ok: false, msg: 'スパイアの入口が見つかりません' };
  const run = game.towerRun;
  const cont = run && run.cleared && floor === run.floor + 1;
  if (!cont && !towerStartFloors(st).includes(floor)) return { ok: false, msg: `${floor}F からは始められません` };
  towerState(st, gameNow(game));
  game.towerFloor = floor;
  game.towerRun = { floor, startFloor: cont ? run.startFloor : floor, t0: game.time || 0, cleared: false, failed: false, def: towerFloorDef(floor, game) };
  game.events?.emit('towerEnter', { floor });
  game.changeMap(TOWER_MAP_ID);
  return { ok: true, msg: '', floor };
}

/**
 * towerClearFloor(game) → {ok, floor, time, best, newBest, firstClear, rewards:[...], exp, money}
 *  spawner が全滅時に呼ぶ（マップ移動はしない。次の階へはポータル → towerEnter(game, floor+1)）
 */
export function towerClearFloor(game) {
  const st = game.state;
  const floor = Math.max(1, Math.floor(game.towerFloor || game.towerRun?.floor || 1));
  const run = game.towerRun && game.towerRun.floor === floor ? game.towerRun : (game.towerRun = { floor, startFloor: floor, t0: game.time || 0 });
  if (run.cleared) return { ok: false, msg: '記録済み', floor };
  run.cleared = true;
  const t = towerState(st, gameNow(game));
  const time = Math.max(0, (game.time || 0) - (run.t0 || 0));
  const def = run.def || towerFloorDef(floor, game);
  const newBest = floor > t.best;
  if (newBest) t.best = floor;
  if (floor > t.weekBest) t.weekBest = floor;
  if (t.bestTime[floor] == null || time < t.bestTime[floor]) t.bestTime[floor] = Math.round(time * 100) / 100;
  const rewards = [];
  const firstClear = !t.firstClears[floor];
  if (firstClear) {
    t.firstClears[floor] = true;
    for (const r of towerFirstClearRewards(floor, st.heroId)) {
      if (r.title) { (st.flags ||= {}).title_spire_100 = true; rewards.push(r); }
      else if (ITEMS[r.id] && addItem(game, r.id, r.qty, { silent: true, pot: null })) rewards.push(r);
    }
  }
  // 毎回の報酬: 経験値・$（時間ボーナスとミューテーター倍率）
  const timeBonus = 1 + Math.max(0, (TOWER_TIME_LIMIT - time) / TOWER_TIME_LIMIT) * 0.5;
  const exp = Math.round(expToNext(Math.min(st.level || 1, 199)) * 0.015 * def.rewardMult * timeBonus);
  const money = Math.round((50 + def.level * 12) * def.rewardMult * timeBonus);
  st.money = (st.money || 0) + money;
  if (exp > 0) gainExp(game, exp);
  const out = { ok: true, floor, time, best: t.best, newBest, firstClear, rewards, exp, money, rewardMult: def.rewardMult };
  game.events?.emit('towerFloorClear', out);
  if (floor % 10 === 0 && newBest) game.events?.emit('towerMilestone', { floor });
  return out;
}

/** towerExit(game, reason) — タワーを出てヴァイス・タワー（rooftop）へ */
export function towerExit(game, reason = 'exit') {
  const run = game.towerRun;
  game.towerRun = null;
  if (game.map?.id === TOWER_MAP_ID) game.changeMap(MAPS.rooftop ? 'rooftop' : game.state.mapId);
  game.events?.emit('towerExit', { reason, floor: run?.floor });
}

/** 毎フレーム（content.updateContent 経由）: 制限時間 90秒 */
export function towerUpdate(game) {
  const run = game.towerRun;
  if (!run || run.cleared || run.failed || game.map?.id !== TOWER_MAP_ID) return;
  const limit = run.def?.timeLimit ?? TOWER_TIME_LIMIT;
  if ((game.time || 0) - run.t0 > limit) {
    run.failed = true;
    game.notify?.(`⏰ ${run.floor}F 時間切れ…（記録 ${towerState(game.state).best}F）`, '#ff8a8a');
    game.events?.emit('towerFail', { floor: run.floor, reason: 'time' });
    towerExit(game, 'time');
  }
}

/** タワー以外へ移動したら挑戦終了 */
export function towerOnMapChanged(game, mapId) {
  if (game.towerRun && mapId !== TOWER_MAP_ID) game.towerRun = null;
}

/** towerExchange(game, itemId) → {ok, msg}（スパイア・トークン交換所） */
export function towerExchange(game, itemId) {
  const st = game.state;
  const t = towerState(st);
  const e = TOWER_EXCHANGE.find((x) => x.id === itemId);
  if (!e || !ITEMS[itemId]) return { ok: false, msg: '交換できません' };
  if (t.tokens < e.cost) return { ok: false, msg: `トークンが足りません（${e.cost}）` };
  if (!addItem(game, itemId, 1, { silent: true, pot: null })) return { ok: false, msg: 'インベントリがいっぱいです' };
  t.tokens -= e.cost;
  return { ok: true, msg: `${ITEMS[itemId].name} と交換した` };
}
