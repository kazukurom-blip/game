// レベル・経験値・ステータス計算
import { ITEMS, STARTER_EQUIP, starterEquipFor } from '../data/items.js';
import { SKILLS, STARTER_SKILLS, SKILL_BAR_SIZE } from '../data/skills.js';
import { spawnEffect } from '../render/effects.js';
import { expToNext, MAX_LEVEL } from '../data/balance.js';
import { bookBonus } from './book.js';
import { jobBonusOf, newJobState, jobStateOf, newSpByTier, addSp } from '../data/jobs.js';
import { CLASSES, LEGACY_GENDER, GENDERS, defaultLook, defaultName } from '../data/classes.js';
import { starBonus, mainStatOf, sumPotLines } from '../data/gear.js';
import { normalizeInventory } from './inventory.js';
import { achievementBonus } from './achievements.js';
import { linkBonus } from './shared.js';


// クラス別の基礎値（v3: data/classes.js の CLASSES から生成。heroId = クラスID。name は旧来の既定名）
export const HERO_BASE = Object.fromEntries(Object.values(CLASSES).map((c) => [c.id, {
  name: c.defaultNames[LEGACY_GENDER[c.id] || 'f'], className: c.name, stats: { ...c.baseStats }, ...c.base,
}]));

// 経験値曲線は data/balance.js（敵の経験値と共有）。序盤は少なめ・地域が進むほど効率UP
export { expToNext, MAX_LEVEL };

/**
 * newState(classId, opts?) — opts = {name, gender:'f'|'m', look}
 *  未指定: gender はクラスの旧既定（luna=f, jin=m, hacker=f）、look は DEFAULT_LOOKS[class][gender]、name は既定名
 */
export function newState(heroId = 'luna', opts = {}) {
  if (!HERO_BASE[heroId]) heroId = 'luna';
  const gender = GENDERS.includes(opts?.gender) ? opts.gender : (LEGACY_GENDER[heroId] || 'f');
  const name = typeof opts?.name === 'string' && opts.name.trim() ? opts.name.trim().slice(0, 12) : defaultName(heroId, gender);
  const look = opts?.look && typeof opts.look === 'object' ? { ...defaultLook(heroId, gender), ...opts.look } : defaultLook(heroId, gender);
  const base = HERO_BASE[heroId];
  const st = STARTER_SKILLS[heroId];
  const state = {
    heroId,
    name, gender, look,
    level: 1, exp: 0, money: 500,
    hp: 0, mp: 0,
    sp: 0, ap: 0,
    spByTier: newSpByTier(), // v3: 2次/3次/4次スキル用の SP プール（state.sp は基本＋1次用）
    stats: { ...base.stats },
    inventory: [
      { id: 'potion_red', qty: 15 },
      { id: 'potion_blue', qty: 8 },
    ],
    equipped: { hat: null, top: null, bottom: null, shoes: null, weapon: null, accessory: null, pet: null, ...starterEquipFor(heroId, gender) },
    skills: { ...st.skills },
    skillBar: padBar(st.skillBar),
    potionBar: ['potion_red', 'potion_blue'],
    missions: { active: [], completed: [], progress: {}, objProgress: {}, daily: {} },
    mapId: 'beach',
    flags: {},
    kills: 0, rareFound: [],
    // v2
    visited: ['beach'],
    book: {},
    sns: newSnsState(),
    itemsFound: {},
    clock: 9,
    // v3 転職
    job: newJobState(),
    // v3 エンドコンテンツ（v4 セーブ）
    ...newV4Fields(),
    version: STATE_VERSION,
  };
  normalizeInventory(state);
  const s = computeStats(state, []);
  state.hp = s.maxHp;
  state.mp = s.maxMp;
  return state;
}

function padBar(bar) {
  const b = Array.isArray(bar) ? bar.slice(0, SKILL_BAR_SIZE) : [];
  while (b.length < SKILL_BAR_SIZE) b.push(null);
  return b;
}

export const STATE_VERSION = 4; // v3: state.job / v4: 装備インスタンス・強化・潜在・エンドコンテンツ
export function newSnsState() { return { followers: 0, posts: [], milestones: [], totalLikes: 0 }; }

/** v4 で追加したフィールドの初期値（newState / migrateState 共用） */
export function newV4Fields() {
  return {
    equippedInst: {},      // slot → 装備インスタンス {id, uid, star, pot, ...}
    uidSeq: 0,
    rngSeed: (Math.random() * 2 ** 32) >>> 0,
    tuneStats: { tries: 0, success: 0, spent: 0 },
    potLog: [], potStats: { tries: 0, gradeUps: 0, byGrade: {} },
    bosses: {},            // bossId → {mode → {ticket, clears, best}}
    bossTrophies: 0,
    tower: null,           // systems/tower.js が初期化
    arena: null,           // systems/arena.js が初期化
    achv: { done: {}, counters: {}, seen: {} },
    title: null,           // 選択中の称号ID
    login: { days: 0, lastDay: null, history: [] },
    presets: null,         // systems/presets.js が初期化
    petData: {},
    storyChoices: {},      // missionId → choiceId
    trackedMission: null,  // クエストナビで追跡中のミッション
  };
}

/**
 * migrateState(state) — 旧セーブ（v1）や欠けたフィールドを補完して返す（破壊的に修正）。
 * main が loadState 後に呼ぶ。旧マップIDは町としてそのまま有効。
 */
export function migrateState(state) {
  if (!state || typeof state !== 'object') return newState('luna');
  if (!HERO_BASE[state.heroId]) state.heroId = 'luna';
  const base = HERO_BASE[state.heroId];
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  state.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(num(state.level, 1))));
  state.exp = Math.max(0, num(state.exp, 0));
  // v1 セーブ: 旧経験値曲線での「進み具合（%）」を保ったまま新曲線に換算する
  if (!(state.version >= 2)) {
    const L = state.level;
    const oldNeed = Math.round(15 + 12 * Math.pow(L, 1.5) * Math.pow(1.02, L));
    const newNeed = expToNext(L);
    if (Number.isFinite(newNeed) && oldNeed > 0) {
      const ratio = Math.min(0.999, state.exp / oldNeed);
      state.exp = Math.round(ratio * newNeed);
    }
  }
  // それでも溢れた分は次のレベル直前で止める（勝手にレベルアップさせない）
  const need = expToNext(state.level);
  if (Number.isFinite(need) && state.exp >= need) state.exp = need - 1;
  state.money = Math.max(0, num(state.money, 0));
  state.sp = Math.max(0, num(state.sp, 0));
  state.ap = Math.max(0, num(state.ap, 0));
  state.stats = { ...base.stats, ...(state.stats || {}) };
  if (!Array.isArray(state.inventory)) state.inventory = [];
  state.inventory = state.inventory.filter((s) => s && ITEMS[s.id] && s.qty > 0);
  const eq = state.equipped && typeof state.equipped === 'object' ? state.equipped : {};
  state.equipped = { hat: null, top: null, bottom: null, shoes: null, weapon: null, accessory: null, pet: null, ...eq };
  for (const [slot, id] of Object.entries(state.equipped)) {
    if (id && (!ITEMS[id] || ITEMS[id].slot !== slot)) state.equipped[slot] = null;
  }
  if (!state.skills || typeof state.skills !== 'object') state.skills = { ...STARTER_SKILLS[state.heroId].skills };
  if (!Array.isArray(state.skillBar)) state.skillBar = [...STARTER_SKILLS[state.heroId].skillBar];
  state.skillBar = padBar(state.skillBar.map((id) => (id && SKILLS[id] ? id : null)));
  if (!Array.isArray(state.potionBar)) state.potionBar = ['potion_red', 'potion_blue'];
  const ms = state.missions && typeof state.missions === 'object' ? state.missions : {};
  state.missions = { active: [], completed: [], progress: {}, objProgress: {}, daily: {}, ...ms };
  for (const k of ['active', 'completed']) if (!Array.isArray(state.missions[k])) state.missions[k] = [];
  for (const k of ['progress', 'objProgress', 'daily']) if (!state.missions[k] || typeof state.missions[k] !== 'object') state.missions[k] = {};
  if (typeof state.mapId !== 'string' || !state.mapId) state.mapId = 'beach';
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  state.kills = Math.max(0, num(state.kills, 0));
  if (!Array.isArray(state.rareFound)) state.rareFound = [];
  // v2 フィールド
  if (!Array.isArray(state.visited)) state.visited = [];
  for (const id of ['beach', state.mapId]) if (!state.visited.includes(id)) state.visited.push(id);
  if (!state.book || typeof state.book !== 'object') state.book = {};
  const sns = state.sns && typeof state.sns === 'object' ? state.sns : {};
  state.sns = { ...newSnsState(), ...sns };
  if (!Array.isArray(state.sns.posts)) state.sns.posts = [];
  if (!Array.isArray(state.sns.milestones)) state.sns.milestones = [];
  state.sns.followers = Math.max(0, num(state.sns.followers, 0));
  if (!state.itemsFound || typeof state.itemsFound !== 'object') {
    state.itemsFound = {};
    for (const s of state.inventory) state.itemsFound[s.id] = true;
    for (const id of Object.values(state.equipped)) if (id) state.itemsFound[id] = true;
    for (const id of state.rareFound) state.itemsFound[id] = true;
  }
  state.clock = num(state.clock, 9);
  // v3 クラス/性別/見た目/名前: 旧セーブは luna=♀ルナ, jin=♂ジン
  if (!GENDERS.includes(state.gender)) state.gender = LEGACY_GENDER[state.heroId] || 'f';
  state.look = state.look && typeof state.look === 'object' ? { ...defaultLook(state.heroId, state.gender), ...state.look } : defaultLook(state.heroId, state.gender);
  if (typeof state.name !== 'string' || !state.name.trim()) state.name = defaultName(state.heroId, state.gender);
  // v3 SP プール
  const sbt = state.spByTier && typeof state.spByTier === 'object' ? state.spByTier : {};
  state.spByTier = { ...newSpByTier() };
  for (const t of [2, 3, 4]) state.spByTier[t] = Math.max(0, num(sbt[t], 0));
  // v3 転職: 旧セーブは見習い（Lv10以上でも自動転職しない。吹き出しから転職する）
  const js = jobStateOf(state);
  state.job = { id: js.id, tier: js.tier, history: js.history.filter((h) => h && typeof h === 'object') };
  // v3: 共通移動スキル「ストリートダッシュ」を補完
  for (const [sid, lv] of Object.entries(STARTER_SKILLS[state.heroId].skills)) {
    if (!(state.skills[sid] > 0)) {
      state.skills[sid] = lv;
      const i = state.skillBar.indexOf(null);
      if (i >= 0 && SKILLS[sid]?.kind !== 'passive' && !state.skillBar.includes(sid)) state.skillBar[i] = sid;
    }
  }
  // v4: 装備インスタンス（旧セーブの装備エントリに uid/★/潜在を付与し、equippedInst を作る）・エンドコンテンツ
  const v4 = newV4Fields();
  for (const [k, v] of Object.entries(v4)) {
    const cur = state[k];
    if (cur === undefined || (v !== null && typeof v === 'object' && (typeof cur !== 'object' || cur === null || Array.isArray(v) !== Array.isArray(cur)))) state[k] = v;
  }
  if (!Number.isInteger(state.uidSeq) || state.uidSeq < 0) state.uidSeq = 0;
  if (!Number.isInteger(state.rngSeed)) state.rngSeed = v4.rngSeed;
  for (const k of ['done', 'counters', 'seen']) if (!state.achv[k] || typeof state.achv[k] !== 'object') state.achv[k] = {};
  if (state.potLog.length > 50) state.potLog = state.potLog.slice(-50);
  normalizeInventory(state);
  const s = computeStats(state, []);
  state.hp = Math.max(0, Math.min(num(state.hp, s.maxHp), s.maxHp));
  state.mp = Math.max(0, Math.min(num(state.mp, s.maxMp), s.maxMp));
  if (state.hp <= 0) state.hp = s.maxHp;
  state.version = STATE_VERSION;
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
  let weapon = null, petItem = null;
  const pot = {}; // 潜在の合計（data/gear.js POT_LINES の stat キー）
  const stars = {};
  for (const [slot, id] of Object.entries(state.equipped || {})) {
    const it = id && ITEMS[id];
    if (!it || !it.stats) continue;
    for (const k in eq) eq[k] += it.stats[k] || 0;
    if (it.slot === 'weapon') weapon = it;
    if (it.slot === 'pet') petItem = it;
    // v4: ★強化と潜在（equippedInst が equipped と一致する時のみ）
    const inst = state.equippedInst?.[slot];
    if (inst && inst.id === id) {
      if (inst.star > 0) {
        stars[slot] = inst.star;
        const sb = starBonus(it, inst.star, state.heroId);
        for (const k in sb) eq[k] += sb[k];
      }
      if (inst.pot) sumPotLines(inst.pot.lines, pot);
    }
  }
  // v4: 実績ランク・キャラ間リンク（全ステ・各種％）
  const ab = achievementBonus(state);
  const lb = linkBonus(state);

  // パッシブ
  const pas = { critAdd: 0, critDmgAdd: 0, maxHpPct: 0, defAdd: 0, dmgReduce: 0, speedAdd: 0, atkAdd: 0, attackSpeedPct: 0 };
  for (const [sid, lv] of Object.entries(state.skills || {})) {
    const sk = SKILLS[sid];
    if (!sk || sk.kind !== 'passive' || !lv || !sk.passive) continue;
    const p = sk.passive(lv);
    for (const k in p) pas[k] = (pas[k] || 0) + p[k];
  }

  // バフ
  const bf = { atkPct: 0, speedPct: 0, defPct: 0, critAdd: 0, luckAdd: 0, attackSpeedPct: 0 };
  for (const b of buffs || []) for (const k in bf) bf[k] += b[k] || 0;

  // 図鑑ボーナス（永続）
  const bk = bookBonus(state);
  // 転職ボーナス（永続。系譜の合計）
  const jb = jobBonusOf(state);

  const s = state.stats || {};
  const ms = mainStatOf(state.heroId);
  const msMult = (k) => (k === ms ? 1 + (pot.mainPct || 0) : 1);
  const str = Math.round(((s.str || 0) + eq.str + jb.str + ab.allStat) * msMult('str'));
  const dex = Math.round(((s.dex || 0) + eq.dex + jb.dex + ab.allStat) * msMult('dex'));
  const int = Math.round(((s.int || 0) + eq.int + jb.int + ab.allStat) * msMult('int'));
  const luk = Math.round(((s.luk || 0) + eq.luk + bk.luk + jb.luk + ab.allStat) * msMult('luk'));

  const weaponType = weapon ? weapon.weaponType : 'melee';
  let statAtk;
  if (weaponType === 'gun') statAtk = dex * 0.5 + luk * 0.2;
  else if (weaponType === 'magic') statAtk = int * 0.6 + luk * 0.15;
  else statAtk = str * 0.5 + dex * 0.2;

  const maxHp = Math.round((base.hp + base.hpPerLv * (L - 1) + str * 2 + eq.maxHp + bk.maxHp + jb.maxHp) * (1 + pas.maxHpPct + (pot.maxHpPct || 0) + lb.maxHpPct));
  const maxMp = Math.round((base.mp + base.mpPerLv * (L - 1) + int * 3 + eq.maxMp + bk.maxMp + jb.maxMp) * (1 + lb.maxMpPct));
  const atk = Math.max(1, Math.round((5 + 1.5 * L + eq.atk + statAtk + pas.atkAdd + bk.atk + jb.atk) * (1 + bf.atkPct + (pot.atkPct || 0))));
  const def = Math.round((base.def + eq.def + str * 0.2 + L * 0.5 + pas.defAdd + bk.def + jb.def) * (1 + bf.defPct + (pot.defPct || 0)));
  const speed = Math.min(450, Math.round((base.speed + eq.speed + (pot.speed || 0) + dex * 0.3 + pas.speedAdd + jb.speed) * (1 + bf.speedPct)));
  const jump = Math.min(1000, base.jump + Math.min(60, eq.speed * 0.5));
  const crit = Math.min(0.8, base.crit + luk * 0.002 + dex * 0.0005 + eq.crit / 100 + pas.critAdd + bf.critAdd + bk.crit + jb.crit + (pot.crit || 0) + lb.crit);
  const critDmg = base.critDmg + luk * 0.002 + pas.critDmgAdd + jb.critDmg;
  // ブースター（攻撃速度アップ）: 最大 +60%
  const attackSpeed = (weapon ? weapon.attackSpeed : 2.5) * (1 + Math.min(0.6, pas.attackSpeedPct + bf.attackSpeedPct));
  const range = weapon ? weapon.range : 60;

  return {
    maxHp, maxMp, atk, def, speed, jump, crit, critDmg,
    attackSpeed, attackCooldown: 1 / attackSpeed,
    range, weaponType, weaponStyle: weapon ? weapon.look.style : null,
    luck: luk + bf.luckAdd,
    dmgReduce: Math.min(0.5, pas.dmgReduce + jb.dmgReduce),
    pet: petItem ? { id: petItem.id, ...petItem.pet } : null,   // {id, pickRange, pickRate, name}
    book: bk,
    job: jb,
    str, dex, int, luk,
    // v4: 潜在・実績・リンク由来の特殊ステータス
    bossDmg: pot.bossDmg || 0,          // ボスへの与ダメ +割合
    dropRate: (pot.dropRate || 0) + lb.dropRate, // ドロップ率 +割合
    mesoRate: pot.mesoRate || 0,        // 獲得金 +割合
    cdr: pot.cdr || 0,                  // スキルCT 短縮（秒）
    hpRecover: pot.hpRecover || 0,      // 被弾時 5% で最大HPのこの割合を回復
    expRate: lb.expRate,                // 経験値 +割合
    pot, stars, achievement: ab, link: lb,
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
    addSp(st, 3); // v3: 現職の段階のプールへ（見習い/1次は state.sp）
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
