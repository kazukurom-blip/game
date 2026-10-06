// v5: ネオン・コア（第2ワールドの強化）の仕組み。docs/SPEC_V5.md・docs/NEON_CORE.md
//  state.neonCore = { cores: { arkcity, cyberwild, abyss, zenith }, stats: { <能力の key>: Lv }, skills: { <スキル ID>: Lv } }
//  - 地域のコアをネオン・フラグメントで上げる（その地域の専用クエストを終えると上げられる）。1 Lv ごとに 適性 +10・能力ポイント +1・主のステータス +5
//  - 能力ポイントを % の能力に振る（振り直しはお金）。追加スキルはフラグメントで覚えて上げる（コアの合計 Lv で解放）
//  - neonForceOf(state)（ネオン適性）と forceMods(F, R)（第2ワールドのマップでの与ダメ・被ダメの倍率）
//  progression.js（computeStats・migrateState）と combat.js（ダメージ）から呼ばれる。progression.js は import しない（循環を避ける）
import {
  FRAGMENT_ID, FRAGMENT_CHANCE, BOSS_FRAGMENTS, BOSS_FRAGMENT_DEFAULT, AWAKEN_QUEST, NEON_UNLOCK_FLAG,
  NEON_REGIONS, NEON_CORE_INFO, coreFlag, CORE_MAX, CORE_COST, FORCE_PER_CORE_LV, POINTS_PER_CORE_LV, MAIN_STAT_PER_CORE_LV,
  NEON_STATS, NEON_STAT_KEYS, resetCost, NEON_SKILLS, NEON_SKILL_LIST, neonSkillCost,
} from '../data/neonCore.js';
import { FORCE_REQ } from '../data/forceReq.js';
import { hasJob } from '../data/jobs.js';
import { countItem, removeItem } from './inventory.js';

export {
  FRAGMENT_ID, NEON_REGIONS, NEON_CORE_INFO, CORE_MAX, CORE_COST, NEON_STATS, NEON_SKILL_LIST, NEON_SKILLS, FORCE_REQ, neonSkillCost, resetCost,
};

const int = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);

/** 空のネオン・コア */
export function newNeonCore() {
  return { cores: Object.fromEntries(NEON_REGIONS.map((r) => [r, 0])), stats: Object.fromEntries(NEON_STAT_KEYS.map((k) => [k, 0])), skills: {} };
}

/**
 * ensureNeonCore(state) → state.neonCore（古いセーブ・壊れた値を直す。migrateState から呼ぶ）
 *  追加スキルの Lv は state.skills にも写す（スキルバー・useSkill・パッシブは state.skills を見るため）
 */
export function ensureNeonCore(state) {
  if (!state || typeof state !== 'object') return newNeonCore();
  const cur = state.neonCore && typeof state.neonCore === 'object' ? state.neonCore : {};
  const nc = newNeonCore();
  for (const r of NEON_REGIONS) nc.cores[r] = int(cur.cores?.[r], 0, CORE_MAX);
  for (const s of NEON_STATS) nc.stats[s.key] = int(cur.stats?.[s.key], 0, s.max);
  for (const [id, lv] of Object.entries(cur.skills && typeof cur.skills === 'object' ? cur.skills : {})) {
    const sk = NEON_SKILLS[id];
    const l = int(lv, 0, sk?.maxLevel || 0);
    if (sk && l > 0) nc.skills[id] = l;
  }
  // 能力ポイントが足りない（値を書き換えたセーブなど）ときは、全部戻す
  const used = NEON_STAT_KEYS.reduce((a, k) => a + nc.stats[k], 0);
  if (used > totalPointsOf(nc)) for (const k of NEON_STAT_KEYS) nc.stats[k] = 0;
  state.neonCore = nc;
  if (!state.skills || typeof state.skills !== 'object') state.skills = {};
  for (const s of NEON_SKILL_LIST) {
    if (nc.skills[s.id] > 0) state.skills[s.id] = nc.skills[s.id];
    else delete state.skills[s.id];
  }
  return nc;
}
const nco = (state) => (state?.neonCore && state.neonCore.cores && state.neonCore.stats && state.neonCore.skills ? state.neonCore : ensureNeonCore(state));

// ---------------------------------------------------------------- 解放の状態
const questDone = (state, id) => !!state?.missions?.completed?.includes?.(id);
const questTaken = (state, id) => questDone(state, id) || !!state?.missions?.active?.includes?.(id);
/** ネオン・コアの窓が開くか（nc_01_awaken を終えた） */
export function neonUnlocked(state) { return !!state?.flags?.[NEON_UNLOCK_FLAG] || questDone(state, AWAKEN_QUEST); }
/** フラグメントが落ちるか（nc_01_awaken を受けたあと） */
export function fragmentsDropping(state) { return neonUnlocked(state) || questTaken(state, AWAKEN_QUEST); }
/** その地域のコアを上げられるか（地域の専用クエストを終えた） */
export function coreUnlocked(state, region) {
  if (!NEON_CORE_INFO[region]) return false;
  return !!state?.flags?.[coreFlag(region)] || questDone(state, NEON_CORE_INFO[region].quest);
}

// ---------------------------------------------------------------- コア
export function coreLevel(state, region) { return nco(state).cores[region] || 0; }
export function totalCoreLevel(state) { const c = nco(state).cores; return NEON_REGIONS.reduce((a, r) => a + (c[r] || 0), 0); }
/** Lv → Lv+1 の費用（上限なら Infinity） */
export function coreCost(lv) { return lv >= 0 && lv < CORE_MAX ? CORE_COST[lv] : Infinity; }
/** Lv 0 → lv の費用の合計 */
export function coreCostTotal(lv = CORE_MAX) { let s = 0; for (let i = 0; i < Math.min(lv, CORE_MAX); i++) s += CORE_COST[i]; return s; }
export function fragmentCount(state) { return countItem(state, FRAGMENT_ID); }

/** upgradeCore(state, region) → {ok, msg, cost?, lv?} */
export function upgradeCore(state, region) {
  if (!NEON_CORE_INFO[region]) return { ok: false, msg: 'そのコアはありません' };
  const info = NEON_CORE_INFO[region];
  if (!neonUnlocked(state)) return { ok: false, msg: 'ネオン・コアはまだ目覚めていない' };
  if (!coreUnlocked(state, region)) return { ok: false, msg: `${info.region}の専用クエストを終えると上げられる` };
  const nc = nco(state);
  const lv = nc.cores[region];
  if (lv >= CORE_MAX) return { ok: false, msg: `${info.name} は最大 Lv です` };
  const cost = coreCost(lv);
  const have = fragmentCount(state);
  if (have < cost) return { ok: false, msg: `ネオン・フラグメントが足りない（${have}/${cost}）`, cost };
  removeItem(state, FRAGMENT_ID, cost);
  nc.cores[region] = lv + 1;
  return { ok: true, msg: `${info.name} が Lv${lv + 1} になった！（適性 +${FORCE_PER_CORE_LV}・能力ポイント +${POINTS_PER_CORE_LV}）`, cost, lv: lv + 1 };
}

// ---------------------------------------------------------------- 能力アップ
function totalPointsOf(nc) { return NEON_REGIONS.reduce((a, r) => a + (nc.cores?.[r] || 0), 0) * POINTS_PER_CORE_LV; }
/** 能力ポイント → {total, used, free} */
export function neonPoints(state) {
  const nc = nco(state);
  const total = totalPointsOf(nc);
  const used = NEON_STAT_KEYS.reduce((a, k) => a + (nc.stats[k] || 0), 0);
  return { total, used, free: Math.max(0, total - used) };
}
/** addNeonStat(state, key) → {ok, msg} */
export function addNeonStat(state, key) {
  const def = NEON_STATS.find((s) => s.key === key);
  if (!def) return { ok: false, msg: 'その能力はありません' };
  if (!neonUnlocked(state)) return { ok: false, msg: 'ネオン・コアはまだ目覚めていない' };
  const nc = nco(state);
  if (nc.stats[key] >= def.max) return { ok: false, msg: `${def.name} は最大 Lv です` };
  if (neonPoints(state).free <= 0) return { ok: false, msg: '能力ポイントが足りない（コアを上げると増える）' };
  nc.stats[key]++;
  return { ok: true, msg: `${def.name} +${Math.round(def.per * 100)}%（Lv${nc.stats[key]}）` };
}
/** resetNeonStats(state) → {ok, msg, cost}（お金で振り直す） */
export function resetNeonStats(state) {
  const { used } = neonPoints(state);
  if (used <= 0) return { ok: false, msg: 'まだポイントを振っていない', cost: 0 };
  const cost = resetCost(used);
  if ((state.money || 0) < cost) return { ok: false, msg: `お金が足りない（$${cost.toLocaleString('en-US')}）`, cost };
  state.money -= cost;
  const nc = nco(state);
  for (const k of NEON_STAT_KEYS) nc.stats[k] = 0;
  return { ok: true, msg: `能力ポイントを振り直した（$${cost.toLocaleString('en-US')}）`, cost };
}

// ---------------------------------------------------------------- 追加スキル
/** その系統・キャラで覚えられるスキルか（共通は全員。系統のスキルはその系統の 1 次職の系譜だけ） */
export function neonSkillFor(state, sk) {
  if (!sk || !sk.neon) return false;
  if (sk.hero !== 'both' && sk.hero !== state?.heroId) return false;
  return !sk.reqJob || hasJob(state, sk.reqJob);
}
/** そのキャラの追加スキル（共通 3 ＋ 今の系統の 2） */
export function neonSkillsFor(state) { return NEON_SKILL_LIST.filter((s) => neonSkillFor(state, s)); }
/** neonSkillInfo(state, id) → {lv, max, open(解放済み), need(必要なコアの合計 Lv), cost(次の Lv の費用), can, reason} */
export function neonSkillInfo(state, id) {
  const sk = NEON_SKILLS[id];
  if (!sk) return null;
  const lv = nco(state).skills[id] || 0, max = sk.maxLevel;
  const total = totalCoreLevel(state);
  const open = total >= sk.neonUnlock;
  const cost = lv < max ? neonSkillCost(lv) : Infinity;
  let reason = null;
  if (!neonSkillFor(state, sk)) reason = sk.reqJob ? 'この系統では覚えられない' : 'このキャラは覚えられない';
  else if (!neonUnlocked(state)) reason = 'ネオン・コアはまだ目覚めていない';
  else if (!open) reason = `コアの合計 Lv${sk.neonUnlock} で解放（いま ${total}）`;
  else if (lv >= max) reason = '最大 Lv';
  else if (fragmentCount(state) < cost) reason = `ネオン・フラグメントが足りない（${fragmentCount(state)}/${cost}）`;
  return { lv, max, open, need: sk.neonUnlock, cost, can: !reason, reason };
}
/** learnNeonSkill(state, id) → {ok, msg, lv?}（フラグメントで覚える・上げる。スキルバーに空きがあれば最初に覚えた時に入れる） */
export function learnNeonSkill(state, id) {
  const sk = NEON_SKILLS[id];
  const info = neonSkillInfo(state, id);
  if (!sk || !info) return { ok: false, msg: 'そのスキルはありません' };
  if (!info.can) return { ok: false, msg: `${sk.name}: ${info.reason}` };
  removeItem(state, FRAGMENT_ID, info.cost);
  const nc = nco(state);
  nc.skills[id] = info.lv + 1;
  state.skills[id] = info.lv + 1;
  if (info.lv === 0 && sk.kind !== 'passive' && Array.isArray(state.skillBar)) {
    const i = state.skillBar.indexOf(null);
    if (i >= 0 && !state.skillBar.includes(id)) state.skillBar[i] = id;
  }
  return { ok: true, msg: `${sk.name} が Lv${info.lv + 1} になった！`, lv: info.lv + 1 };
}

// ---------------------------------------------------------------- 能力（computeStats が使う）
const ZERO = Object.freeze({ atkPct: 0, maxHpPct: 0, defPct: 0, critDmg: 0, bossDmg: 0, ignoreDef: 0, expRate: 0, dropRate: 0, mainStat: 0 });
/** neonBonusOf(state) → {atkPct, maxHpPct, defPct, critDmg, bossDmg, ignoreDef, expRate, dropRate, mainStat}（割合は 0.3 = 30%） */
export function neonBonusOf(state) {
  const nc = state?.neonCore;
  if (!nc || !nc.cores || !nc.stats) return ZERO;
  const out = { ...ZERO };
  for (const s of NEON_STATS) out[s.key] = Math.round((nc.stats[s.key] || 0) * s.per * 1000) / 1000;
  out.mainStat = NEON_REGIONS.reduce((a, r) => a + (nc.cores[r] || 0), 0) * MAIN_STAT_PER_CORE_LV;
  return out;
}

// ---------------------------------------------------------------- ネオン適性
/** neonForceOf(state) → コアの Lv の合計 × 10 ＋ 追加スキルの分（ネオン・シンクロ 1 Lv ごとに +2） */
export function neonForceOf(state) {
  const nc = state?.neonCore;
  if (!nc || !nc.cores) return 0;
  let f = NEON_REGIONS.reduce((a, r) => a + (nc.cores[r] || 0), 0) * FORCE_PER_CORE_LV;
  for (const [id, lv] of Object.entries(nc.skills || {})) { const sk = NEON_SKILLS[id]; if (sk?.neonForce && lv > 0) f += sk.neonForce(lv); }
  return f;
}
/** forceMods の表（r = F / R → 与ダメ・被ダメの倍率。点の間は直線、1.5 以上は一定） */
export const FORCE_TABLE = [[0, 0.1, 3], [0.5, 0.4, 2], [1, 1, 1], [1.5, 1.5, 0.7]];
/** forceMods(F, R) → {dealt, taken}。R = 0 なら {1, 1} */
export function forceMods(F, R) {
  if (!(R > 0)) return { dealt: 1, taken: 1 };
  const r = Math.max(0, (Number(F) || 0) / R);
  const T = FORCE_TABLE;
  if (r >= T[T.length - 1][0]) return { dealt: T[T.length - 1][1], taken: T[T.length - 1][2] };
  for (let i = 1; i < T.length; i++) {
    if (r <= T[i][0]) {
      const [a, da, ta] = T[i - 1], [b, db, tb] = T[i];
      const k = (r - a) / (b - a);
      const R4 = (v) => Math.round(v * 10000) / 10000;
      return { dealt: R4(da + (db - da) * k), taken: R4(ta + (tb - ta) * k) };
    }
  }
  return { dealt: 1, taken: 1 };
}
/** マップの必要な適性（第2ワールド以外・表に無いマップは 0） */
export function mapForceReq(map) {
  const m = typeof map === 'string' ? { id: map } : map;
  if (!m || !m.id) return 0;
  if (typeof map === 'object' && map.worldId !== 2) return 0;
  return Math.max(0, Number(FORCE_REQ[m.id]) || 0);
}
/** 今のマップでの倍率 {dealt, taken, F, R}（第2ワールドのマップだけ。それ以外は 1） */
export function forceModsFor(game) {
  const map = game?.map;
  if (!map || map.worldId !== 2 || !game.state) return { dealt: 1, taken: 1, F: 0, R: 0 };
  const R = mapForceReq(map), F = neonForceOf(game.state);
  return { ...forceMods(F, R), F, R };
}

// ---------------------------------------------------------------- ドロップ
/** neonFragmentDrops(state, enemyDef, rng) → 落とすフラグメントの数（第2ワールドの敵・nc_01_awaken を受けたあとだけ） */
export function neonFragmentDrops(state, def, rng = Math.random) {
  if (!def || def.world !== 2 || def.civilian || def.isCop || !fragmentsDropping(state)) return 0;
  if (def.boss) return BOSS_FRAGMENTS[def.id] ?? BOSS_FRAGMENT_DEFAULT;
  return rng() < FRAGMENT_CHANCE ? 1 : 0;
}

// ---------------------------------------------------------------- マップに入ったときの注意
/** attachNeonCore(game) — 第2ワールドのマップで適性が足りないと、入ったときに注意の通知を出す */
export function attachNeonCore(game) {
  if (game._neonUnsub) return game._neonUnsub;
  const ev = game.events;
  if (!ev?.on) return () => {};
  const off = ev.on('mapChanged', () => {
    const m = forceModsFor(game);
    if (m.R > 0 && m.F < m.R) {
      const short = !neonUnlocked(game.state) ? '（ネオン・コアを目覚めさせよう）' : '（ネオン・コアを上げよう）';
      game.notify?.(`⚠ ネオン適性が足りない！ ${m.F} / ${m.R}  与えるダメージ ×${m.dealt}・受けるダメージ ×${m.taken}${short}`, '#ff5f5f');
    }
  });
  game._neonUnsub = () => { off?.(); game._neonUnsub = null; };
  return game._neonUnsub;
}
