// v5: ネオン・コア（第2ワールドの強化）のデータ。docs/SPEC_V5.md・docs/NEON_CORE.md
//  - 地域のコア（arkcity / cyberwild / abyss / zenith。Lv0〜20）の費用（ネオン・フラグメントの数）
//  - 能力アップ（%）の表（能力ポイントを振る。コア 1 Lv につき 1 ポイント）
//  - 追加スキル（6 系統 × 2 ＋ 全員共通 3）。data/skills.js が SKILLS に足す（neon: true。SP では上げず、フラグメントで覚えて上げる）
// 純データ＋純関数のみ（data/skills.js から import されるので、systems や data/skills.js を import しないこと）
import { JOBS, JOB_BRANCHES } from './jobs.js';

/** ネオン・フラグメントのアイテム ID */
export const FRAGMENT_ID = 'neon_fragment';
/** 第2ワールドの通常の敵が 1 個落とす確率 */
export const FRAGMENT_CHANCE = 0.01;
/** 第2ワールドのボスが確実に落とす数（表に無いボスは BOSS_FRAGMENT_DEFAULT） */
export const BOSS_FRAGMENTS = { boss_ark_titan: 5, boss_wild_kernel: 7, boss_abyss_queen: 9, boss_zenith: 10, boss_zenith_true: 20 };
export const BOSS_FRAGMENT_DEFAULT = 5;
/** フラグメントが落ちるようになるクエスト（受けたあとから落ちる） */
export const AWAKEN_QUEST = 'nc_01_awaken';
/** ネオン・コアの窓が開くフラグ（nc_01_awaken の報酬で立つ） */
export const NEON_UNLOCK_FLAG = 'nc_unlocked';

/** 地域のコア（順番 = 第2ワールドの地域の順） */
export const NEON_REGIONS = ['arkcity', 'cyberwild', 'abyss', 'zenith'];
export const NEON_CORE_INFO = {
  arkcity: { name: 'アーク・コア', region: 'アーク・シティ', color: '#19f0ff', quest: 'nc_01_awaken' },
  cyberwild: { name: 'ワイルド・コア', region: 'サイバー・ワイルド', color: '#5cff9a', quest: 'nc_cyberwild' },
  abyss: { name: 'アビス・コア', region: 'ネオン・アビス', color: '#4d8bff', quest: 'nc_abyss' },
  zenith: { name: 'ゼニス・コア', region: 'ゼニス・タワー', color: '#ffd23f', quest: 'nc_zenith' },
};
/** その地域のコアを上げられるようになるフラグ（地域の専用クエストの報酬で立つ） */
export const coreFlag = (region) => `nc_core_${region}`;

export const CORE_MAX = 20;
/**
 * CORE_COST[n] = コアを Lv n → n+1 に上げるのに要るフラグメントの数（n = 0〜19）。1 地域の合計 1,365 個。
 *  式: n=0 は 5、n≥1 は 10 + 140 × ((n-1)/18)^1.3 を 5 の倍数に丸めた値（1→2 で 10、19→20 で 150）
 */
export const CORE_COST = [5, 10, 15, 20, 25, 30, 35, 45, 50, 60, 65, 75, 85, 95, 100, 110, 120, 130, 140, 150];
/** コア 1 Lv ごとの伸び: ネオン適性・能力ポイント・主のステータス */
export const FORCE_PER_CORE_LV = 10;
export const POINTS_PER_CORE_LV = 1;
export const MAIN_STAT_PER_CORE_LV = 5;

/**
 * 能力アップ（%）。key = state.neonCore.stats のキー、per = 1 Lv の上がり幅（割合）、max = Lv の上限。
 *  上限まで振ると: 攻撃力 +30% / 最大HP +30% / 防御 +30% / 会心ダメージ +20% / ボスダメージ +40% / 防御無視 +20% / 経験値 +20% / ドロップ率 +20%
 *  上限の合計は 95 Lv。能力ポイントの合計は 80（4 コア × 20）なので、全部は上げきれない。
 */
export const NEON_STATS = [
  { key: 'atkPct', name: '攻撃力', per: 0.02, max: 15, color: '#ff5fa2' },
  { key: 'maxHpPct', name: '最大HP', per: 0.03, max: 10, color: '#5cff9a' },
  { key: 'defPct', name: '防御', per: 0.03, max: 10, color: '#8ab4ff' },
  { key: 'critDmg', name: '会心ダメージ', per: 0.02, max: 10, color: '#ff9ad5' },
  { key: 'bossDmg', name: 'ボスダメージ', per: 0.02, max: 20, color: '#ff8a00' },
  { key: 'ignoreDef', name: '防御無視', per: 0.02, max: 10, color: '#c77dff' },
  { key: 'expRate', name: '経験値', per: 0.02, max: 10, color: '#ffd23f' },
  { key: 'dropRate', name: 'ドロップ率', per: 0.02, max: 10, color: '#19f0ff' },
];
export const NEON_STAT_KEYS = NEON_STATS.map((s) => s.key);
/** 能力ポイントの振り直しの費用（お金）: 30 万 ＋ 振ったポイント × 3 万 */
export const resetCost = (spent) => 300000 + 30000 * Math.max(0, spent | 0);

// ---------------------------------------------------------------- 追加スキル
// 書き方は data/jobSkills.js と同じ（威力 = 基本 × (1 + 0.05×(Lv-1))、MP = 基本 + 0.5×Lv、CT は Lv10 で -10%）
const R = (v) => Math.round(v * 100) / 100;
const M = (base) => (lv) => R(base * (1 + 0.05 * (Math.max(1, lv) - 1)));
const MP = (base) => (lv) => Math.round(base + 0.5 * lv);
const CD = (base) => (lv) => R(base * (lv >= 10 ? 0.9 : 1));
const NONE = { mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null };
/** 系統の 1 次職（その系統のスキルは、この職の系譜でだけ覚えられる） */
export const BRANCH_FIRST_JOB = Object.fromEntries(Object.keys(JOB_BRANCHES).map((b) => [b, Object.values(JOBS).find((j) => j.tier === 1 && j.branch === b)?.id]));
/** スキルを覚えられるようになる、4 地域のコアの合計 Lv */
export const NEON_SKILL_UNLOCK_STEPS = [5, 15, 30, 50, 70];

function nsk(o) {
  const { branch, unlock, tag, ...rest } = o;
  const hero = branch ? JOB_BRANCHES[branch].hero : 'both';
  const head = `[ネオン${branch ? '・' + JOB_BRANCHES[branch].name : '・共通'}${tag ? ' / ' + tag : ''}] `;
  return {
    hero, reqLevel: 100, maxLevel: 10, hits: 1, ...rest,
    ...(branch ? { reqJob: BRANCH_FIRST_JOB[branch], branch } : {}),
    neon: true, neonUnlock: unlock, fxTier: 5, desc: head + o.desc,
  };
}
const NA = (o) => { const { m, mp, cd, ...rest } = o; return nsk({ ...rest, mult: M(m), mp: MP(mp), cooldown: CD(cd) }); };
const NB = (o) => { const { mp, cd, ...rest } = o; return nsk({ ...NONE, kind: 'buff', effect: 'buff', ...rest, mp: () => mp, cooldown: () => cd, tag: o.tag || '強化' }); };
const NP = (o) => nsk({ ...NONE, kind: 'passive', ...o, tag: o.tag || 'パッシブ' });

export const NEON_SKILL_LIST = [
  // ================= 全員共通（3） =================
  NP({ id: 'nc_sync', name: 'ネオン・シンクロ', unlock: 5, color: '#9ef7ff',
    desc: 'ネオン・アークの光と体を同調させる。ネオン適性と最大HPが上がる（1 Lv ごとに適性 +2）。',
    passive: (lv) => ({ maxHpPct: R(0.01 * lv) }), neonForce: (lv) => 2 * lv }),
  NB({ id: 'nc_overclock', name: 'ネオン・オーバークロック', unlock: 30, mp: 80, cd: 90, color: '#ff7ee8',
    desc: 'コアの出力を一時的に上げる。攻撃力・クリティカル率・攻撃速度が上がる。',
    buff: (lv) => ({ duration: 60 + 6 * lv, atkPct: R(0.1 + 0.01 * lv), critAdd: 0.05, attackSpeedPct: 0.1 }) }),
  NA({ id: 'nc_neon_burst', name: 'ネオン・バースト', unlock: 70, kind: 'aoe', m: 6, mp: 150, cd: 12, hits: 8, tag: '範囲',
    desc: '4 つのコアの光を一度に解き放ち、周り一帯の敵を 8 回焼く。', range: { w: 760, h: 360 }, knock: 280, launch: 260, effect: 'explosion', color: '#f2ff7a', maxTargets: 15 }),

  // ================= ガンスリンガー系 =================
  NA({ branch: 'gunslinger', id: 'nc_gun_photon_rain', name: 'フォトン・レイン', unlock: 15, kind: 'projectile', m: 3.2, mp: 120, cd: 3, hits: 3,
    desc: 'コアの光を込めた光子弾を 5 発、扇状に撃つ。弾はすべてを貫き、当たるたびに 3 回はじける。', range: { w: 900, h: 300 }, effect: 'muzzle', color: '#ff70c8',
    proj: { speed: 1500, life: 0.75, count: 5, spread: 300, pierce: 99, kind: 'star', w: 32, h: 32 } }),
  NP({ branch: 'gunslinger', id: 'nc_gun_dead_eye', name: 'ネオン・デッドアイ', unlock: 50, color: '#ff4fb4',
    desc: 'ネオンの光で弱点が透けて見える。クリティカル率とクリティカルダメージが上がる。',
    passive: (lv) => ({ critAdd: R(0.005 * lv), critDmgAdd: R(0.03 * lv) }) }),
  // ================= ネオンダンサー系 =================
  NA({ branch: 'neondancer', id: 'nc_dance_laser_waltz', name: 'レーザー・ワルツ', unlock: 15, kind: 'melee', m: 2.6, mp: 120, cd: 2.5, hits: 10, tag: '連撃',
    desc: 'つま先から伸びるレーザーで、回りながら前方を 10 回切り裂く。', range: { w: 360, h: 180 }, knock: 160, effect: 'slash', color: '#62fff0', maxTargets: 10 }),
  NB({ branch: 'neondancer', id: 'nc_dance_afterimage', name: 'アフターイメージ', unlock: 50, mp: 90, cd: 90, color: '#a3fff7',
    desc: '光の残像を何人も連れて踊る。攻撃力・移動速度・攻撃速度が上がる。',
    buff: (lv) => ({ duration: 60 + 6 * lv, atkPct: R(0.15 + 0.01 * lv), speedPct: 0.2, attackSpeedPct: 0.1 }) }),
  // ================= ストリートファイター系 =================
  NA({ branch: 'streetfighter', id: 'nc_fight_neon_quake', name: 'ネオン・クエイク', unlock: 15, kind: 'aoe', m: 3, mp: 120, cd: 3, hits: 8, tag: '範囲',
    desc: 'コアの光を拳に集めて地面を殴る。光の地割れが周りの敵を 8 回打ち上げる。', range: { w: 640, h: 260 }, knock: 300, launch: 380, effect: 'explosion', color: '#ffb066', maxTargets: 14 }),
  NP({ branch: 'streetfighter', id: 'nc_fight_iron_will', name: 'アイアン・ウィル', unlock: 50, color: '#ff9440',
    desc: 'ネオンの光で鍛えた鋼の心。最大HP・攻撃力・被ダメージ軽減が上がる。',
    passive: (lv) => ({ maxHpPct: R(0.02 * lv), atkAdd: 5 * lv, dmgReduce: R(0.004 * lv) }) }),
  // ================= ナイトレーサー系 =================
  NA({ branch: 'nightracer', id: 'nc_race_photon_drift', name: 'フォトン・ドリフト', unlock: 15, kind: 'dash', m: 3.6, mp: 110, cd: 3.5, hits: 6, tag: '突進',
    desc: '光の轍を残して大きくドリフトする。通過した敵を 6 回はね飛ばす。移動中は無敵。', range: { w: 130, h: 150 }, knock: 560, effect: 'dash', color: '#b49cff',
    dash: { dist: (lv) => 640 + lv * 10, time: 0.3, invuln: 0.7 } }),
  NB({ branch: 'nightracer', id: 'nc_race_overboost', name: 'オーバーブースト', unlock: 50, mp: 90, cd: 90, color: '#9a7dff',
    desc: 'コアの光を燃料にして限界を超える。攻撃力・移動速度・攻撃速度が上がる。',
    buff: (lv) => ({ duration: 60 + 6 * lv, atkPct: R(0.15 + 0.01 * lv), speedPct: 0.25, attackSpeedPct: 0.15 }) }),
  // ================= ネットランナー系 =================
  NA({ branch: 'netrunner', id: 'nc_net_null_pointer', name: 'ヌル・ポインタ', unlock: 15, kind: 'projectile', m: 2.2, mp: 130, cd: 2.6, hits: 6,
    desc: '存在しない番地を指すコード弾。すべてを貫き、当たった敵に 6 回ダメージ。', range: { w: 1100, h: 90 }, effect: 'spark', color: '#6dffb9',
    proj: { speed: 1500, life: 0.75, count: 1, spread: 0, pierce: 99, kind: 'magic', w: 80, h: 80 } }),
  NP({ branch: 'netrunner', id: 'nc_net_root_access', name: 'ルート・アクセス', unlock: 50, color: '#40ffa0',
    desc: 'ネオン・アークの管理者の権限を手に入れる。攻撃力・クリティカル率・クリティカルダメージが上がる。',
    passive: (lv) => ({ atkAdd: 4 * lv, critAdd: R(0.004 * lv), critDmgAdd: R(0.03 * lv) }) }),
  // ================= ドローンマスター系 =================
  NA({ branch: 'dronemaster', id: 'nc_drone_satellite', name: 'ネオン・サテライト', unlock: 15, kind: 'summon', m: 1.2, mp: 150, cd: 60, hits: 4, tag: '召喚', maxTargets: 10,
    desc: 'コアの光で動く衛星ドローンを呼ぶ。敵の真上から光の爆弾を落とし、広い範囲を 4 回焼く（持続 60〜78 秒）。', effect: 'buff', color: '#ffbe5c',
    summon: { type: 'bomber', dur: (lv) => 60 + 2 * (Math.max(1, lv) - 1), interval: 1.5, attack: 'bomb', reach: { w: 1000, h: 420 }, area: { w: 380, h: 240 } } }),
  NB({ branch: 'dronemaster', id: 'nc_drone_hyper_link', name: 'ハイパー・リンク', unlock: 50, mp: 90, cd: 90, color: '#ffe066',
    desc: '全ドローンとコアを直結する。攻撃力・防御力・攻撃速度が上がる。',
    buff: (lv) => ({ duration: 60 + 6 * lv, atkPct: R(0.15 + 0.01 * lv), defPct: 0.3, attackSpeedPct: 0.1 }) }),
];
export const NEON_SKILLS = Object.fromEntries(NEON_SKILL_LIST.map((s) => [s.id, s]));
/** 追加スキルを Lv → Lv+1 にするフラグメントの数（Lv0 → 1 = 覚える）。Lv10 まで合計 570 個 */
export const neonSkillCost = (lv) => (lv <= 0 ? 30 : 20 + 8 * lv);
