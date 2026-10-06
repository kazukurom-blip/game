// スキルデータ
// mp(lv), cooldown(lv)=秒, mult(lv)=攻撃力倍率（1ヒットあたり）, hits=ヒット数, range={w,h} px
// kind 別の追加パラメータ:
//   projectile: proj:{speed, life, count, spread(縦方向のばらつき px/s), pierce, kind, w, h}
//   dash:       dash:{dist(lv), time, invuln}
//   buff:       buff(lv) → {duration, atkPct, speedPct, defPct, critAdd, ...}
//   passive:    passive(lv) → {critAdd, critDmgAdd, maxHpPct, defAdd, dmgReduce, ...}
//   melee/aoe:  knock(ノックバック px/s), launch(上方向打ち上げ px/s)
//   move (v3):  move:{type:'flashJump'|'teleport'|'rush'|'glide', power, distance, perLv, ...}（docs/SPEC_JOB.md「移動スキル」）
//               3次の強化パッシブは enhances:'<moveSkillId>' と enhance(lv) → {distancePct, powerPct, cooldownCut, invulnAdd, afterBuff}
//   townOk: 旧仕様（町ではスキル不可）の名残。今はすべてのスキルが町でも使える
//   buff/passive の attackSpeedPct は攻撃速度（ブースター）

import { hasJob } from './jobs.js';
import { JOB_SKILL_LIST } from './jobSkills.js';
import { NEON_SKILL_LIST } from './neonCore.js';

const L = (base, per) => (lv) => base + per * Math.max(0, lv - 1);
const R = (v) => Math.round(v * 100) / 100;

const list = [
  // ===================== LUNA（スピード／銃／ダンス） =====================
  {
    id: 'luna_neon_rush', name: 'ネオン・ラッシュ', hero: 'luna', reqLevel: 1, maxLevel: 20, kind: 'melee',
    desc: '目にも止まらぬ連続斬り。前方の敵を4回切り裂く。',
    mp: (lv) => 6 + Math.floor(lv / 2), cooldown: () => 0.45, mult: (lv) => R(0.75 + 0.04 * lv), hits: 4,
    range: { w: 150, h: 90 }, knock: 120, effect: 'slash', color: '#ff3dd2', maxTargets: 4,
  },
  {
    id: 'luna_pink_bullet', name: 'ピンクバレット', hero: 'luna', reqLevel: 5, maxLevel: 20, kind: 'projectile',
    desc: 'ハート型の弾を3連射。敵を貫通する。',
    mp: (lv) => 8 + Math.floor(lv / 2), cooldown: () => 0.7, mult: (lv) => R(1.1 + 0.07 * lv), hits: 1,
    range: { w: 600, h: 30 }, effect: 'muzzle', color: '#ff6fb5',
    proj: { speed: 900, life: 0.75, count: 3, spread: 60, pierce: 2, kind: 'heart', w: 22, h: 18 },
  },
  {
    id: 'luna_hiphop_step', name: 'ヒップホップ・ステップ', hero: 'luna', reqLevel: 8, maxLevel: 15, kind: 'dash',
    desc: 'リズムに乗って前方へ高速ステップ。通過した敵にダメージ、移動中は無敵。',
    mp: () => 10, cooldown: (lv) => Math.max(1.2, 3 - lv * 0.1), mult: (lv) => R(1.0 + 0.08 * lv), hits: 1,
    range: { w: 60, h: 80 }, effect: 'dash', color: '#19f0ff',
    dash: { dist: (lv) => 260 + lv * 8, time: 0.22, invuln: 0.4 },
  },
  {
    id: 'luna_party_bomb', name: 'パーティー・ボム', hero: 'luna', reqLevel: 15, maxLevel: 20, kind: 'aoe',
    desc: 'ミラーボール型の爆弾で周囲を吹き飛ばす。',
    mp: (lv) => 22 + lv, cooldown: (lv) => Math.max(3, 6 - lv * 0.12), mult: (lv) => R(1.8 + 0.12 * lv), hits: 2,
    range: { w: 420, h: 220 }, knock: 320, effect: 'explosion', color: '#fff06a', maxTargets: 10,
  },
  {
    id: 'luna_idol_aura', name: 'アイドル・オーラ', hero: 'luna', reqLevel: 20, maxLevel: 15, kind: 'buff',
    desc: '輝くオーラを纏い、攻撃力・移動速度・クリティカル率が上昇。',
    mp: () => 25, cooldown: () => 45, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ff6fb5',
    buff: (lv) => ({ duration: 30 + lv * 3, atkPct: R(0.08 + 0.012 * lv), speedPct: R(0.08 + 0.008 * lv), critAdd: R(0.02 + 0.003 * lv) }),
  },
  {
    id: 'luna_critical_heart', name: 'クリティカル・ハート', hero: 'luna', reqLevel: 10, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ] クリティカル率とクリティカルダメージが上昇する。',
    mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null, color: '#ff3d7f',
    passive: (lv) => ({ critAdd: R(0.01 * lv), critDmgAdd: R(0.02 * lv) }),
  },
  {
    id: 'luna_star_shower', name: 'スター・シャワー', hero: 'luna', reqLevel: 30, maxLevel: 20, kind: 'projectile',
    desc: 'きらめく星弾を扇状に7発ばらまく。',
    mp: (lv) => 30 + lv, cooldown: () => 2.5, mult: (lv) => R(1.6 + 0.1 * lv), hits: 1,
    range: { w: 700, h: 200 }, effect: 'spark', color: '#fff06a',
    proj: { speed: 1000, life: 0.8, count: 7, spread: 420, pierce: 3, kind: 'star', w: 24, h: 24 },
  },
  {
    id: 'luna_moonwalk', name: 'ムーンウォーク', hero: 'luna', reqLevel: 25, maxLevel: 10, kind: 'passive',
    desc: '[パッシブ] 移動速度と回避（被ダメージ軽減）が上昇する。',
    mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null, color: '#b04dff',
    passive: (lv) => ({ speedAdd: 4 * lv, dmgReduce: R(0.01 * lv) }),
  },

  // ===================== JIN（パワー／格闘／ドライブ） =====================
  {
    id: 'jin_heavy_smash', name: 'ヘビースマッシュ', hero: 'jin', reqLevel: 1, maxLevel: 20, kind: 'melee',
    desc: '渾身の一撃で前方の敵を叩き伏せる。',
    mp: (lv) => 6 + Math.floor(lv / 2), cooldown: () => 0.55, mult: (lv) => R(1.9 + 0.1 * lv), hits: 1,
    range: { w: 140, h: 90 }, knock: 380, effect: 'hit', color: '#ff8a00', maxTargets: 3,
  },
  {
    id: 'jin_street_upper', name: 'ストリート・アッパー', hero: 'jin', reqLevel: 5, maxLevel: 20, kind: 'melee',
    desc: '天を衝くアッパーカット。敵を2回殴り、空中へ打ち上げる。',
    mp: (lv) => 9 + Math.floor(lv / 2), cooldown: () => 0.9, mult: (lv) => R(1.3 + 0.08 * lv), hits: 2,
    range: { w: 110, h: 150 }, knock: 100, launch: 650, effect: 'critHit', color: '#ffd23f', maxTargets: 5,
  },
  {
    id: 'jin_nitro_dash', name: 'ニトロ・ダッシュ', hero: 'jin', reqLevel: 8, maxLevel: 15, kind: 'dash',
    desc: 'ニトロ全開のショルダータックル。進路上の敵を跳ね飛ばす。',
    mp: () => 12, cooldown: (lv) => Math.max(1.5, 3.5 - lv * 0.12), mult: (lv) => R(1.5 + 0.1 * lv), hits: 1,
    range: { w: 70, h: 80 }, knock: 450, effect: 'dash', color: '#ff8a00',
    dash: { dist: (lv) => 300 + lv * 10, time: 0.28, invuln: 0.45 },
  },
  {
    id: 'jin_ground_quake', name: 'グラウンド・クエイク', hero: 'jin', reqLevel: 15, maxLevel: 20, kind: 'aoe',
    desc: '地面を殴りつけ、周囲一帯に衝撃波を走らせる。',
    mp: (lv) => 24 + lv, cooldown: (lv) => Math.max(3.5, 7 - lv * 0.15), mult: (lv) => R(1.4 + 0.1 * lv), hits: 3,
    range: { w: 520, h: 160 }, knock: 200, launch: 300, effect: 'explosion', color: '#c98a3a', maxTargets: 12,
  },
  {
    id: 'jin_boss_dignity', name: 'ボスの威厳', hero: 'jin', reqLevel: 20, maxLevel: 15, kind: 'buff',
    desc: '圧倒的な威圧感。一定時間 攻撃力と防御力が大きく上昇。',
    mp: () => 25, cooldown: () => 50, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ffd23f',
    buff: (lv) => ({ duration: 30 + lv * 3, atkPct: R(0.12 + 0.015 * lv), defPct: R(0.15 + 0.02 * lv) }),
  },
  {
    id: 'jin_tough_guy', name: 'タフガイ', hero: 'jin', reqLevel: 10, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ] 最大HPと防御力が上昇し、被ダメージが減る。',
    mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null, color: '#8a5a2b',
    passive: (lv) => ({ maxHpPct: R(0.03 * lv), defAdd: 2 * lv, dmgReduce: R(0.01 * lv) }),
  },
  {
    id: 'jin_v8_cannon', name: 'V8キャノン', hero: 'jin', reqLevel: 30, maxLevel: 20, kind: 'projectile',
    desc: 'エンジン音とともに拳圧の衝撃波を撃ち出す。全てを貫く。',
    mp: (lv) => 32 + lv, cooldown: () => 3, mult: (lv) => R(3.0 + 0.18 * lv), hits: 1,
    range: { w: 700, h: 90 }, effect: 'smoke', color: '#ff8a00',
    proj: { speed: 750, life: 0.9, count: 1, spread: 0, pierce: 99, kind: 'shockwave', w: 70, h: 80 },
  },
  {
    id: 'jin_street_king', name: 'ストリートキング', hero: 'jin', reqLevel: 25, maxLevel: 10, kind: 'passive',
    desc: '[パッシブ] 攻撃力とクリティカルダメージが上昇する。',
    mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null, color: '#d8283c',
    passive: (lv) => ({ atkAdd: 3 * lv, critDmgAdd: R(0.03 * lv) }),
  },

  // ===================== HACKER（魔法／電脳／ドローン。weaponType magic） =====================
  {
    id: 'hk_data_bolt', name: 'データ・ボルト', hero: 'hacker', reqLevel: 1, maxLevel: 20, kind: 'projectile',
    desc: '杖先から圧縮データの光弾を撃ち出す。',
    mp: (lv) => 5 + Math.floor(lv / 2), cooldown: () => 0.45, mult: (lv) => R(1.2 + 0.07 * lv), hits: 1,
    range: { w: 600, h: 30 }, effect: 'spark', color: '#3dff8a',
    proj: { speed: 850, life: 0.75, count: 1, spread: 0, pierce: 0, kind: 'magic', w: 22, h: 22 },
  },
  {
    id: 'hk_glitch_wave', name: 'グリッチ・ウェーブ', hero: 'hacker', reqLevel: 5, maxLevel: 20, kind: 'aoe',
    desc: '周囲の空間にノイズを走らせ、敵を2回痺れさせる。',
    mp: (lv) => 9 + Math.floor(lv / 2), cooldown: () => 1.2, mult: (lv) => R(1.0 + 0.06 * lv), hits: 2,
    range: { w: 300, h: 160 }, knock: 160, effect: 'spark', color: '#5cffb0', maxTargets: 8,
  },
  {
    id: 'hk_packet_dash', name: 'パケット・ダッシュ', hero: 'hacker', reqLevel: 8, maxLevel: 15, kind: 'dash',
    desc: 'データ化して前方へ高速移動。通過した敵にダメージ、移動中は無敵。',
    mp: () => 10, cooldown: (lv) => Math.max(1.2, 3 - lv * 0.1), mult: (lv) => R(0.9 + 0.07 * lv), hits: 1,
    range: { w: 60, h: 80 }, effect: 'dash', color: '#3dff8a',
    dash: { dist: (lv) => 250 + lv * 8, time: 0.22, invuln: 0.4 },
  },
  {
    id: 'hk_overclock', name: 'オーバークロック', hero: 'hacker', reqLevel: 10, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ] 脳の処理速度を上げる。攻撃力とクリティカル率が上昇する。',
    mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null, color: '#3dff8a',
    passive: (lv) => ({ atkAdd: 1.5 * lv, critAdd: R(0.006 * lv) }),
  },
  {
    id: 'hk_virus_bomb', name: 'ウイルス・ボム', hero: 'hacker', reqLevel: 15, maxLevel: 20, kind: 'aoe',
    desc: '感染力の強いウイルスをばらまき、周囲の敵を3回むしばむ。',
    mp: (lv) => 22 + lv, cooldown: (lv) => Math.max(3, 6 - lv * 0.12), mult: (lv) => R(1.3 + 0.09 * lv), hits: 3,
    range: { w: 440, h: 220 }, knock: 220, effect: 'explosion', color: '#b6ff3d', maxTargets: 10,
  },
  {
    id: 'hk_firewall', name: 'ファイアウォール', hero: 'hacker', reqLevel: 20, maxLevel: 15, kind: 'buff',
    desc: '自分の周りに防壁を展開。一定時間 防御力と攻撃力が上昇。',
    mp: () => 25, cooldown: () => 45, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#3dff8a',
    buff: (lv) => ({ duration: 30 + lv * 3, defPct: R(0.15 + 0.02 * lv), atkPct: R(0.06 + 0.01 * lv) }),
  },
  {
    id: 'hk_root_access', name: 'ルート・アクセス', hero: 'hacker', reqLevel: 25, maxLevel: 10, kind: 'passive',
    desc: '[パッシブ] 管理者権限でシステムに干渉。クリティカルダメージが上昇し、被ダメージが減る。',
    mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null, color: '#00ffa3',
    passive: (lv) => ({ critDmgAdd: R(0.03 * lv), dmgReduce: R(0.01 * lv) }),
  },
  {
    id: 'hk_cyber_storm', name: 'サイバー・ストーム', hero: 'hacker', reqLevel: 30, maxLevel: 20, kind: 'projectile',
    desc: '電子の嵐を扇状に放つ。5発の光弾がそれぞれ敵を貫通する。',
    mp: (lv) => 30 + lv, cooldown: () => 2.5, mult: (lv) => R(1.7 + 0.1 * lv), hits: 1,
    range: { w: 700, h: 220 }, effect: 'spark', color: '#5cffb0',
    proj: { speed: 950, life: 0.8, count: 5, spread: 360, pierce: 3, kind: 'magic', w: 24, h: 24 },
  },
  // ===================== 共通（Lv1 移動スキル） =====================
  {
    id: 'street_dash', name: 'ストリートダッシュ', hero: 'both', reqLevel: 1, maxLevel: 10, kind: 'buff', townOk: true,
    desc: 'スニーカーの紐を締め直して駆け出す。一定時間 移動速度が上昇。町でも使える。',
    mp: (lv) => (lv >= 6 ? 3 : lv >= 3 ? 4 : 5), cooldown: () => 1, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#5cff9a',
    buff: (lv) => ({ duration: 30 + 3 * (lv - 1), speedPct: R(0.2 + 0.01 * (lv - 1)) }),
  },
];

// ===================== 転職スキル（v3, data/jobSkills.js） =====================
list.push(...JOB_SKILL_LIST);
// ===================== v5: ネオン・コアの追加スキル（data/neonCore.js。neon: true。SP ではなくフラグメントで覚えて上げる） =====================
list.push(...NEON_SKILL_LIST);

export const SKILLS = Object.fromEntries(list.map((s) => [s.id, s]));

export function getSkill(id) { return SKILLS[id] || null; }

/**
 * skillsForHero(heroId, state?, opts?) — スキル窓用の一覧
 *  - state 省略: 転職スキル（reqJob 付き）を含まない基本スキルのみ（従来どおり）
 *  - state あり: 基本スキル ＋ 現職の系譜（下位職を含む）の転職スキル
 *  - opts.allJobs: true なら全系統の転職スキルも含める（ロック表示用。習得可否は jobSkillUnlocked で判定）
 *  - v5: ネオン・コアの追加スキル（neon: true）は opts.neon が true の時だけ（スキル窓の「ネオン」タブ）。opts.neon === 'only' ならそれだけ
 */
export function skillsForHero(heroId, state, opts = {}) {
  return list.filter((s) => (s.hero === heroId || s.hero === 'both') &&
    (s.neon ? !!opts.neon : opts.neon !== 'only') &&
    (!s.reqJob || opts.allJobs || (state && hasJob(state, s.reqJob))));
}

/** 転職条件を満たしているか（reqJob なしは常に true） */
export function jobSkillUnlocked(state, skillOrId) {
  const s = typeof skillOrId === 'string' ? SKILLS[skillOrId] : skillOrId;
  return !!s && (!s.reqJob || hasJob(state, s.reqJob));
}

// 初期習得スキル（Lv1）とスキルバー（v3: 8枠 = キー A S D F Q W G H）
export const SKILL_BAR_SIZE = 8;
export const STARTER_SKILLS = {
  luna: { skills: { luna_neon_rush: 1, street_dash: 1 }, skillBar: ['luna_neon_rush', 'street_dash', null, null, null, null, null, null] },
  jin: { skills: { jin_heavy_smash: 1, street_dash: 1 }, skillBar: ['jin_heavy_smash', 'street_dash', null, null, null, null, null, null] },
  hacker: { skills: { hk_data_bolt: 1, street_dash: 1 }, skillBar: ['hk_data_bolt', 'street_dash', null, null, null, null, null, null] },
};
