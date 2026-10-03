// レベル・経験値・ステータス計算
import { ITEMS, STARTER_EQUIP } from '../data/items.js';
import { SKILLS, STARTER_SKILLS } from '../data/skills.js';
import { spawnEffect } from '../render/effects.js';

export const MAX_LEVEL = 200;

// ヒーロー別の基礎値
export const HERO_BASE = {
  luna: {
    name: 'ルナ',
    stats: { str: 4, dex: 7, int: 4, luk: 6 },
    hp: 55, hpPerLv: 18, mp: 30, mpPerLv: 10,
    speed: 250, jump: 820, crit: 0.08, critDmg: 1.5, def: 0,
  },
  jin: {
    name: 'ジン',
    stats: { str: 8, dex: 4, int: 4, luk: 4 },
    hp: 75, hpPerLv: 26, mp: 20, mpPerLv: 7,
    speed: 225, jump: 790, crit: 0.05, critDmg: 1.6, def: 4,
  },
};

// メイプル風：序盤は緩やか → 指数的に重くなる
export function expToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  const L = Math.max(1, level);
  return Math.round(15 + 12 * Math.pow(L, 1.5) * Math.pow(1.02, L));
}

export function newState(heroId = 'luna') {
  if (!HERO_BASE[heroId]) heroId = 'luna';
  const base = HERO_BASE[heroId];
  const st = STARTER_SKILLS[heroId];
  const state = {
    heroId,
    level: 1, exp: 0, money: 500,
    hp: 0, mp: 0,
    sp: 0, ap: 0,
    stats: { ...base.stats },
    inventory: [
      { id: 'potion_red', qty: 15 },
      { id: 'potion_blue', qty: 8 },
    ],
    equipped: { hat: null, top: null, bottom: null, shoes: null, weapon: null, accessory: null, ...STARTER_EQUIP[heroId] },
    skills: { ...st.skills },
    skillBar: [...st.skillBar],
    potionBar: ['potion_red', 'potion_blue'],
    missions: { active: [], completed: [], progress: {}, objProgress: {}, daily: {} },
    mapId: 'beach',
    flags: {},
    kills: 0, rareFound: [],
  };
  const s = computeStats(state, []);
  state.hp = s.maxHp;
  state.mp = s.maxMp;
  return state;
}

// バフのデフォルト供給源（systems/skills.js の updateSkills が毎フレーム設定する）
let _globalBuffs = [];
export function setActiveBuffs(buffs) { _globalBuffs = buffs || []; }

/**
 * computeStats(state, buffs?) → {maxHp, maxMp, atk, def, speed, jump, crit, critDmg, attackSpeed, attackCooldown,
 *                                 range, weaponType, weaponStyle, luck, dmgReduce, str, dex, int, luk}
 * speed: px/s, jump: 初速 px/s, crit: 0〜1, critDmg: 倍率, attackSpeed: 回/秒, range: px, luck: ドロップ補正値
 */
export function computeStats(state, buffs) {
  if (!buffs) buffs = _globalBuffs;
  const base = HERO_BASE[state.heroId] || HERO_BASE.luna;
  const L = state.level || 1;

  // 装備合計
  const eq = { atk: 0, def: 0, maxHp: 0, maxMp: 0, speed: 0, crit: 0, str: 0, dex: 0, int: 0, luk: 0 };
  let weapon = null;
  for (const id of Object.values(state.equipped || {})) {
    const it = id && ITEMS[id];
    if (!it || !it.stats) continue;
    for (const k in eq) eq[k] += it.stats[k] || 0;
    if (it.slot === 'weapon') weapon = it;
  }

  // パッシブ
  const pas = { critAdd: 0, critDmgAdd: 0, maxHpPct: 0, defAdd: 0, dmgReduce: 0, speedAdd: 0, atkAdd: 0 };
  for (const [sid, lv] of Object.entries(state.skills || {})) {
    const sk = SKILLS[sid];
    if (!sk || sk.kind !== 'passive' || !lv || !sk.passive) continue;
    const p = sk.passive(lv);
    for (const k in p) pas[k] = (pas[k] || 0) + p[k];
  }

  // バフ
  const bf = { atkPct: 0, speedPct: 0, defPct: 0, critAdd: 0, luckAdd: 0 };
  for (const b of buffs || []) for (const k in bf) bf[k] += b[k] || 0;

  const s = state.stats || {};
  const str = (s.str || 0) + eq.str;
  const dex = (s.dex || 0) + eq.dex;
  const int = (s.int || 0) + eq.int;
  const luk = (s.luk || 0) + eq.luk;

  const weaponType = weapon ? weapon.weaponType : 'melee';
  let statAtk;
  if (weaponType === 'gun') statAtk = dex * 0.5 + luk * 0.2;
  else if (weaponType === 'magic') statAtk = int * 0.6 + luk * 0.15;
  else statAtk = str * 0.5 + dex * 0.2;

  const maxHp = Math.round((base.hp + base.hpPerLv * (L - 1) + str * 2 + eq.maxHp) * (1 + pas.maxHpPct));
  const maxMp = Math.round(base.mp + base.mpPerLv * (L - 1) + int * 3 + eq.maxMp);
  const atk = Math.max(1, Math.round((5 + 1.5 * L + eq.atk + statAtk + pas.atkAdd) * (1 + bf.atkPct)));
  const def = Math.round((base.def + eq.def + str * 0.2 + L * 0.5 + pas.defAdd) * (1 + bf.defPct));
  const speed = Math.min(450, Math.round((base.speed + eq.speed + dex * 0.3 + pas.speedAdd) * (1 + bf.speedPct)));
  const jump = Math.min(1000, base.jump + Math.min(60, eq.speed * 0.5));
  const crit = Math.min(0.8, base.crit + luk * 0.002 + dex * 0.0005 + eq.crit / 100 + pas.critAdd + bf.critAdd);
  const critDmg = base.critDmg + luk * 0.002 + pas.critDmgAdd;
  const attackSpeed = weapon ? weapon.attackSpeed : 2.5;
  const range = weapon ? weapon.range : 60;

  return {
    maxHp, maxMp, atk, def, speed, jump, crit, critDmg,
    attackSpeed, attackCooldown: 1 / attackSpeed,
    range, weaponType, weaponStyle: weapon ? weapon.look.style : null,
    luck: luk + bf.luckAdd,
    dmgReduce: Math.min(0.5, pas.dmgReduce),
    str, dex, int, luk,
  };
}

export function gainExp(game, amount) {
  const st = game.state;
  if (!amount || st.level >= MAX_LEVEL) return;
  st.exp += Math.round(amount);
  let leveled = false;
  while (st.level < MAX_LEVEL && st.exp >= expToNext(st.level)) {
    st.exp -= expToNext(st.level);
    st.level++;
    st.sp += 3;
    st.ap += 5;
    leveled = true;
    const s = computeStats(st);
    st.hp = s.maxHp;
    st.mp = s.maxMp;
    const p = game.player;
    if (p) spawnEffect(game, 'levelUp', p.x, p.y);
    game.notify?.(`LEVEL UP!  Lv.${st.level}  (SP+3 / AP+5)`, '#ffd23f');
    game.events?.emit('levelUp', { level: st.level });
  }
  if (st.level >= MAX_LEVEL) st.exp = 0;
  return leveled;
}

// AP振り: stat = 'str'|'dex'|'int'|'luk'
export function addStat(game, stat, n = 1) {
  const st = game.state;
  if (!['str', 'dex', 'int', 'luk'].includes(stat)) return false;
  n = Math.min(n, st.ap);
  if (n <= 0) return false;
  st.ap -= n;
  st.stats[stat] = (st.stats[stat] || 0) + n;
  return true;
}

// HP/MP を最大値以内に収める（装備変更後など）
export function clampVitals(state) {
  const s = computeStats(state);
  state.hp = Math.min(state.hp, s.maxHp);
  state.mp = Math.min(state.mp, s.maxMp);
  return s;
}

// ---- バフ管理（スキル・ドリンク共通。game.buffs に保持） ----
// buff = {id, name, duration, t(残り秒), atkPct?, speedPct?, defPct?, critAdd?, luckAdd?, color}
export function getBuffs(game) {
  if (!game.buffs) game.buffs = [];
  return game.buffs;
}
export function addBuff(game, buff) {
  const list = getBuffs(game);
  const b = { ...buff, t: buff.duration, duration: buff.duration };
  const i = list.findIndex((x) => x.id === b.id);
  if (i >= 0) list[i] = b; else list.push(b);
  setActiveBuffs(list);
  return b;
}
export function tickBuffs(game, dt) {
  const list = getBuffs(game);
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t -= dt;
    if (list[i].t <= 0) {
      game.notify?.(`${list[i].name || 'バフ'} の効果が切れた`, '#aaaaaa');
      list.splice(i, 1);
    }
  }
  setActiveBuffs(list);
}
