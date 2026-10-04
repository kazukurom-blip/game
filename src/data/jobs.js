// 転職データ（v3 / docs/SPEC_JOB.md）
// JOBS = {id: {id, name, hero, tier, branch, from, reqLevel, desc, statBonus, skills:[skillId], title, aura, sp, instructor, mission}}
//  - statBonus はその段階で「追加」されるボーナス。実際のボーナスは系譜（from を遡った全職）の合計 = jobBonusOf(state)
//    キー: str, dex, int, luk, atk, def, maxHp, maxMp, speed(px/s), crit(0〜1 加算), critDmg(倍率加算), dmgReduce(0〜1)
//  - skills は data/skills.js の reqJob がこの職のスキル（各職3つ: 1次=攻撃/パッシブ/ブースター, 2次=攻撃/バフ/移動,
//    3次=攻撃/攻撃/移動強化, 4次=大技/パッシブ/ハイパーバフ。転職時に Lv1 で自動習得）
//  - instructor: 転職教官 NPC ID（data/missions.js MISSION_NPCS）, mission: 転職ミッション ID
// 純データ＋純関数のみ（systems/progression.js からも import されるため、systems を import しないこと）

export const JOB_TIERS = [0, 10, 30, 60, 100];
export const BEGINNER_ID = 'beginner';

/** 系統 */
export const JOB_BRANCHES = {
  gunslinger:    { id: 'gunslinger',    hero: 'luna', name: 'ガンスリンガー系',     desc: '銃・遠距離・クリティカル', color: '#ff3d7f' },
  neondancer:    { id: 'neondancer',    hero: 'luna', name: 'ネオンダンサー系',     desc: 'スピード・連撃・ダッシュ', color: '#19f0ff' },
  streetfighter: { id: 'streetfighter', hero: 'jin',  name: 'ストリートファイター系', desc: '格闘・高火力・タフ',       color: '#ff8a00' },
  nightracer:    { id: 'nightracer',    hero: 'jin',  name: 'ナイトレーサー系',     desc: '車・ニトロ・範囲・ドライブ', color: '#7b5cff' },
};

const list = [
  {
    id: BEGINNER_ID, name: '見習い', hero: 'both', tier: 0, branch: null, from: null, reqLevel: 1,
    desc: 'ヴァイス・ベイに来たばかりの新入り。Lv.10 で最初の転職ができる。',
    statBonus: {}, skills: [], title: '見習い', aura: null, sp: 0, instructor: null, mission: null,
  },

  // ===================== LUNA: ガンスリンガー系 =====================
  {
    id: 'luna_gunner', name: 'ネオン・ガンナー', hero: 'luna', tier: 1, branch: 'gunslinger', from: BEGINNER_ID, reqLevel: 10,
    desc: 'ピンクの二丁拳銃でネオン街を撃ち抜くガンナー。射程とクリティカルが伸びる。',
    statBonus: { dex: 5, luk: 3, atk: 4, crit: 0.03 },
    skills: ['lj_gun_double_tap', 'lj_gun_quickdraw', 'lj_gun_booster'], title: 'ネオン・ガンナー', aura: '#ff3d7f', sp: 3,
    instructor: 'job_velvet', mission: 'job_luna_gunner',
  },
  {
    id: 'luna_sharpshooter', name: 'ピンク・シャープシューター', hero: 'luna', tier: 2, branch: 'gunslinger', from: 'luna_gunner', reqLevel: 30,
    desc: '港の霧の向こうから一発で仕留める狙撃手。貫通弾と弱点狙いを極める。',
    statBonus: { dex: 10, luk: 6, atk: 10, crit: 0.04, critDmg: 0.1 },
    skills: ['lj_gun_rail_snipe', 'lj_gun_hot_cartridge', 'lj_gun_blink'], title: 'シャープシューター', aura: '#ff5fa2', sp: 5,
    instructor: 'job_lily', mission: 'job_luna_sharpshooter',
  },
  {
    id: 'luna_trigger_queen', name: 'トリガー・クイーン', hero: 'luna', tier: 3, branch: 'gunslinger', from: 'luna_sharpshooter', reqLevel: 60,
    desc: 'カジノの賭場で弾丸の雨を降らせる銃の女王。引き金ひとつで場を支配する。',
    statBonus: { dex: 18, luk: 10, atk: 22, crit: 0.05, critDmg: 0.2 },
    skills: ['lj_gun_bullet_rain', 'lj_gun_heart_magnum', 'lj_gun_phantom_blink'], title: 'トリガー・クイーン', aura: '#ff2a6d', sp: 8,
    instructor: 'job_diamond', mission: 'job_luna_trigger_queen',
  },
  {
    id: 'luna_galaxy_outlaw', name: 'ギャラクシー・アウトロー', hero: 'luna', tier: 4, branch: 'gunslinger', from: 'luna_trigger_queen', reqLevel: 100,
    desc: '星をも撃ち落とす銀河のお尋ね者。超新星の弾幕であらゆる敵を蒸発させる。',
    statBonus: { dex: 30, luk: 18, atk: 40, crit: 0.06, critDmg: 0.35 },
    skills: ['lj_gun_supernova', 'lj_gun_outlaw_soul', 'lj_gun_bounty_hunter'], title: '銀河のアウトロー', aura: '#ffd23f', sp: 12,
    instructor: 'job_celes', mission: 'job_luna_galaxy_outlaw',
  },

  // ===================== LUNA: ネオンダンサー系 =====================
  {
    id: 'luna_dancer', name: 'ネオン・ダンサー', hero: 'luna', tier: 1, branch: 'neondancer', from: BEGINNER_ID, reqLevel: 10,
    desc: 'ビートに乗って舞い、斬る。路上ダンスバトル仕込みのスピードファイター。',
    statBonus: { dex: 4, luk: 2, atk: 3, speed: 10, maxMp: 20 },
    skills: ['lj_dance_spin_turn', 'lj_dance_glide', 'lj_dance_booster'], title: 'ネオン・ダンサー', aura: '#19f0ff', sp: 3,
    instructor: 'job_velvet', mission: 'job_luna_dancer',
  },
  {
    id: 'luna_rave_star', name: 'レイヴ・スター', hero: 'luna', tier: 2, branch: 'neondancer', from: 'luna_dancer', reqLevel: 30,
    desc: '地下レイブのフロアを沸かせるスター。ストロボと低音で敵の群れをまとめて痺れさせる。',
    statBonus: { dex: 9, luk: 4, atk: 9, speed: 15, maxMp: 50, dmgReduce: 0.02 },
    skills: ['lj_dance_strobe', 'lj_dance_groove', 'lj_dance_double_beat'], title: 'レイヴ・スター', aura: '#3dffd0', sp: 5,
    instructor: 'job_lily', mission: 'job_luna_rave_star',
  },
  {
    id: 'luna_prism_idol', name: 'プリズム・アイドル', hero: 'luna', tier: 3, branch: 'neondancer', from: 'luna_rave_star', reqLevel: 60,
    desc: 'カジノの大舞台に立つ七色のアイドル。虹のステップは誰にも捕まえられない。',
    statBonus: { dex: 16, luk: 8, atk: 20, speed: 20, maxMp: 100, crit: 0.03, dmgReduce: 0.03 },
    skills: ['lj_dance_prism_step', 'lj_dance_encore', 'lj_dance_air_encore'], title: 'プリズム・アイドル', aura: '#c77dff', sp: 8,
    instructor: 'job_diamond', mission: 'job_luna_prism_idol',
  },
  {
    id: 'luna_cosmo_diva', name: 'コズミック・ディーヴァ', hero: 'luna', tier: 4, branch: 'neondancer', from: 'luna_prism_idol', reqLevel: 100,
    desc: '宇宙港のホログラム・ステージから全銀河へ配信される伝説の歌姫。踊るたび星が降る。',
    statBonus: { dex: 28, luk: 14, atk: 36, speed: 30, maxMp: 200, crit: 0.05, dmgReduce: 0.05 },
    skills: ['lj_dance_galaxy_stage', 'lj_dance_starlight_combo', 'lj_dance_world_tour'], title: '宇宙の歌姫', aura: '#7df9ff', sp: 12,
    instructor: 'job_celes', mission: 'job_luna_cosmo_diva',
  },

  // ===================== JIN: ストリートファイター系 =====================
  {
    id: 'jin_brawler', name: 'ストリート・ブロウラー', hero: 'jin', tier: 1, branch: 'streetfighter', from: BEGINNER_ID, reqLevel: 10,
    desc: '裏路地のケンカで名を上げた拳闘士。拳ひとつでのし上がる。',
    statBonus: { str: 6, atk: 5, def: 4, maxHp: 80 },
    skills: ['jj_fight_jab_rush', 'jj_fight_iron_body', 'jj_fight_booster'], title: 'ストリート・ブロウラー', aura: '#ff8a00', sp: 3,
    instructor: 'job_bull', mission: 'job_jin_brawler',
  },
  {
    id: 'jin_knuckle_king', name: 'ナックル・キング', hero: 'jin', tier: 2, branch: 'streetfighter', from: 'jin_brawler', reqLevel: 30,
    desc: 'スワンプの地下闘技場で無敗を誇る拳の王。殴った地面ごと敵を吹き飛ばす。',
    statBonus: { str: 12, atk: 12, def: 10, maxHp: 250, dmgReduce: 0.02 },
    skills: ['jj_fight_knuckle_bomb', 'jj_fight_fighting_spirit', 'jj_fight_bull_rush'], title: 'ナックル・キング', aura: '#ff5a1f', sp: 5,
    instructor: 'job_croc', mission: 'job_jin_knuckle_king',
  },
  {
    id: 'jin_dragon_fist', name: 'ネオン・ドラゴンフィスト', hero: 'jin', tier: 3, branch: 'streetfighter', from: 'jin_knuckle_king', reqLevel: 60,
    desc: 'ネオンの龍を拳に宿した武闘家。昇龍の一撃は摩天楼すら揺らす。',
    statBonus: { str: 20, atk: 26, def: 18, maxHp: 600, crit: 0.03, critDmg: 0.15, dmgReduce: 0.03 },
    skills: ['jj_fight_dragon_upper', 'jj_fight_dragon_wave', 'jj_fight_unstoppable'], title: 'ドラゴンフィスト', aura: '#ff3b3b', sp: 8,
    instructor: 'job_tiger', mission: 'job_jin_dragon_fist',
  },
  {
    id: 'jin_vice_legend', name: 'ネオン覇王', hero: 'jin', tier: 4, branch: 'streetfighter', from: 'jin_dragon_fist', reqLevel: 100,
    desc: 'ヴァイス・ベイの頂点に立つ伝説の拳。その一撃は天地を割り、宇宙人すら膝をつく。',
    statBonus: { str: 34, atk: 46, def: 30, maxHp: 1400, crit: 0.04, critDmg: 0.3, dmgReduce: 0.05 },
    skills: ['jj_fight_haoh_quake', 'jj_fight_legend_aura', 'jj_fight_haoh_spirit'], title: 'ネオン覇王', aura: '#ffd23f', sp: 12,
    instructor: 'job_kaiser', mission: 'job_jin_vice_legend',
  },

  // ===================== JIN: ナイトレーサー系 =====================
  {
    id: 'jin_racer', name: 'ナイト・レーサー', hero: 'jin', tier: 1, branch: 'nightracer', from: BEGINNER_ID, reqLevel: 10,
    desc: '夜の高架を走り抜ける走り屋。タイヤスモークとニトロで道を切り開く。',
    statBonus: { str: 4, dex: 3, atk: 4, speed: 12, maxHp: 40 },
    skills: ['jj_race_burnout', 'jj_race_drift_dash', 'jj_race_booster'], title: 'ナイト・レーサー', aura: '#7b5cff', sp: 3,
    instructor: 'job_bull', mission: 'job_jin_racer',
  },
  {
    id: 'jin_drifter', name: 'ストリート・ドリフター', hero: 'jin', tier: 2, branch: 'nightracer', from: 'jin_racer', reqLevel: 30,
    desc: 'スワンプの泥道すら滑るように駆けるドリフト職人。マフラーの炎は武器にもなる。',
    statBonus: { str: 8, dex: 6, atk: 11, def: 6, speed: 18, maxHp: 160 },
    skills: ['jj_race_exhaust_flame', 'jj_race_turbo', 'jj_race_nitro_glide'], title: 'ドリフト・キング', aura: '#5c7cff', sp: 5,
    instructor: 'job_croc', mission: 'job_jin_drifter',
  },
  {
    id: 'jin_nitro_baron', name: 'ニトロ・バロン', hero: 'jin', tier: 3, branch: 'nightracer', from: 'jin_drifter', reqLevel: 60,
    desc: 'カジノ街のストリップを支配する爆走男爵。ニトロの爆炎が通り道をすべて焼き払う。',
    statBonus: { str: 14, dex: 10, atk: 24, def: 12, speed: 25, maxHp: 420, crit: 0.03, dmgReduce: 0.03 },
    skills: ['jj_race_nitro_burst', 'jj_race_slipstream', 'jj_race_afterburner'], title: 'ニトロ・バロン', aura: '#a24dff', sp: 8,
    instructor: 'job_tiger', mission: 'job_jin_nitro_baron',
  },
  {
    id: 'jin_warp_rider', name: 'ワープ・ライダー', hero: 'jin', tier: 4, branch: 'nightracer', from: 'jin_nitro_baron', reqLevel: 100,
    desc: '光速を超えた伝説の走り屋。ワープドライブで時空ごと敵をぶっちぎる。',
    statBonus: { str: 24, dex: 16, atk: 42, def: 20, speed: 40, maxHp: 1000, crit: 0.05, critDmg: 0.2, dmgReduce: 0.05 },
    skills: ['jj_race_warp_drive', 'jj_race_meteor_crash', 'jj_race_hyperdrive'], title: '光速のワープライダー', aura: '#19f0ff', sp: 12,
    instructor: 'job_kaiser', mission: 'job_jin_warp_rider',
  },
];

export const JOBS = Object.fromEntries(list.map((j) => [j.id, j]));
export const JOB_IDS = list.filter((j) => j.tier > 0).map((j) => j.id);

export function getJob(id) { return JOBS[id] || null; }

/** jobsFor(heroId, tier, fromJobId?) → [Job]（fromJobId 省略時はその段階の全職） */
export function jobsFor(heroId, tier, fromJobId) {
  return list.filter((j) => j.tier === tier && j.tier > 0 && j.hero === heroId && (fromJobId == null || j.from === fromJobId));
}

/** state.job の正規化コピー（無効なら beginner） */
export function jobStateOf(state) {
  const j = state?.job;
  const id = j && JOBS[j.id] && (JOBS[j.id].hero === 'both' || JOBS[j.id].hero === state.heroId) ? j.id : BEGINNER_ID;
  return { id, tier: JOBS[id].tier, history: Array.isArray(j?.history) ? j.history : [] };
}

/** currentJob(state) → Job（未設定・不正値なら beginner） */
export function currentJobOf(state) { return JOBS[jobStateOf(state).id]; }

/** 系譜: [beginner, 1次, 2次, ...現職] */
export function jobLineage(jobId) {
  const out = [];
  let j = JOBS[jobId];
  let guard = 0;
  while (j && guard++ < 10) { out.unshift(j); j = j.from ? JOBS[j.from] : null; }
  return out;
}

/** hasJob(state, jobId) — 現職がその職か、その上位職か */
export function hasJob(state, jobId) {
  if (!jobId) return true;
  return jobLineage(jobStateOf(state).id).some((j) => j.id === jobId);
}

export const JOB_BONUS_KEYS = ['str', 'dex', 'int', 'luk', 'atk', 'def', 'maxHp', 'maxMp', 'speed', 'crit', 'critDmg', 'dmgReduce'];

/** jobBonusOf(state) → 系譜の statBonus 合計（全キー 0 埋め） */
export function jobBonusOf(state) {
  const out = Object.fromEntries(JOB_BONUS_KEYS.map((k) => [k, 0]));
  for (const j of jobLineage(jobStateOf(state).id)) for (const [k, v] of Object.entries(j.statBonus || {})) out[k] = (out[k] || 0) + v;
  for (const k of ['crit', 'critDmg', 'dmgReduce']) out[k] = Math.round(out[k] * 1000) / 1000;
  return out;
}

export function newJobState() { return { id: BEGINNER_ID, tier: 0, history: [] }; }
