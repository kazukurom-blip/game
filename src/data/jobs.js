// 転職データ（v3 / docs/SPEC_JOB.md）
// JOBS = {id: {id, name, hero, tier, branch, from, reqLevel, desc, statBonus, skills:[skillId], title, aura, sp, instructor, mission}}
//  - hero はクラスID（'luna' | 'jin' | 'hacker'。data/classes.js）。性別はプレイヤーが別に選ぶので職名・説明は性別に依らない表現にする
//  - statBonus はその段階で「追加」されるボーナス。実際のボーナスは系譜（from を遡った全職）の合計 = jobBonusOf(state)
//    キー: str, dex, int, luk, atk, def, maxHp, maxMp, speed(px/s), crit(0〜1 加算), critDmg(倍率加算), dmgReduce(0〜1)
//  - skills は data/jobSkills.js の reqJob がこの職のスキル（転職時に Lv1 で自動習得）。構成（メイプル式）:
//      1次 = 攻撃 ×2 ＋ マスタリー(passive)
//      2次 = 主力攻撃 ＋ 職バフ ＋ ブースター(攻撃速度+25%) ＋ 移動スキル(kind:'move')
//      3次 = 攻撃 ×2 ＋ 移動スキル強化(enhances) ＋ ファイナルアタック(passive)
//      4次 = 大技 ＋ 奥義パッシブ(ファイナルアタック強化込み) ＋ ハイパーバフ(長CT)
//      追加: ハッカー系は各段階に召喚スキル（kind:'summon'）が1つ、各系統に連撃スキル。1職のスキルは最大5つ
//  - instructor: 転職教官 NPC ID（data/missions.js MISSION_NPCS）, mission: 転職ミッション ID
// 純データ＋純関数のみ（systems/progression.js からも import されるため、systems を import しないこと）

export const JOB_TIERS = [0, 10, 30, 60, 100];
export const BEGINNER_ID = 'beginner';

/** 系統 */
export const JOB_BRANCHES = {
  gunslinger:    { id: 'gunslinger',    hero: 'luna',   name: 'ガンスリンガー系',       desc: '銃・遠距離・クリティカル',     color: '#ff3d7f' },
  neondancer:    { id: 'neondancer',    hero: 'luna',   name: 'ネオンダンサー系',       desc: 'スピード・連撃・テレポート',   color: '#19f0ff' },
  streetfighter: { id: 'streetfighter', hero: 'jin',    name: 'ストリートファイター系', desc: '格闘・高火力・タフ・突進',     color: '#ff8a00' },
  nightracer:    { id: 'nightracer',    hero: 'jin',    name: 'ナイトレーサー系',       desc: '車・ニトロ・範囲・高速走行',   color: '#7b5cff' },
  netrunner:     { id: 'netrunner',     hero: 'hacker', name: 'ネットランナー系',       desc: '電脳魔法・範囲・グリッチ',     color: '#3dff8a' },
  dronemaster:   { id: 'dronemaster',   hero: 'hacker', name: 'ドローンマスター系',     desc: 'ドローン召喚・爆撃・滑空',     color: '#ffb000' },
};

const J = (o) => ({ instructor: null, ...o, mission: 'job_' + o.id, reqLevel: JOB_TIERS[o.tier] });

const list = [
  {
    id: BEGINNER_ID, name: '見習い', hero: 'both', tier: 0, branch: null, from: null, reqLevel: 1,
    desc: 'ヴァイス・ベイに来たばかりの新入り。Lv.10 で最初の転職ができる。',
    statBonus: {}, skills: [], title: '見習い', aura: null, sp: 0, instructor: null, mission: null,
  },

  // ===================== ストリートスター（luna）: ガンスリンガー系 =====================
  J({ id: 'luna_gunner', name: 'ネオン・ガンナー', hero: 'luna', tier: 1, branch: 'gunslinger', from: BEGINNER_ID,
    desc: 'ピンクの二丁拳銃でネオン街を撃ち抜くガンナー。射程とクリティカルが伸びる。',
    statBonus: { dex: 5, luk: 3, atk: 4, crit: 0.03 },
    skills: ['lj_gun_double_tap', 'lj_gun_spread_shot', 'lj_gun_mastery'], title: 'ネオン・ガンナー', aura: '#ff3d7f', sp: 5, instructor: 'job_velvet' }),
  J({ id: 'luna_sharpshooter', name: 'ピンク・シャープシューター', hero: 'luna', tier: 2, branch: 'gunslinger', from: 'luna_gunner',
    desc: '港の霧の向こうから一発で仕留める狙撃手。貫通弾と、反動で宙を舞うリコイル・ジャンプを操る。',
    statBonus: { dex: 10, luk: 6, atk: 10, crit: 0.04, critDmg: 0.1 },
    skills: ['lj_gun_rail_snipe', 'lj_gun_gatling_waltz', 'lj_gun_hot_cartridge', 'lj_gun_booster', 'lj_gun_recoil_jump'], title: 'シャープシューター', aura: '#ff5fa2', sp: 5, instructor: 'job_lily' }),
  J({ id: 'luna_trigger_maestro', name: 'トリガー・マエストロ', hero: 'luna', tier: 3, branch: 'gunslinger', from: 'luna_sharpshooter',
    desc: 'カジノの賭場で弾丸の雨を降らせる銃の名手。引き金ひとつで場を支配する。',
    statBonus: { dex: 18, luk: 10, atk: 22, crit: 0.05, critDmg: 0.2 },
    skills: ['lj_gun_bullet_rain', 'lj_gun_heart_magnum', 'lj_gun_recoil_master', 'lj_gun_follow_shot'], title: 'トリガー・マエストロ', aura: '#ff2a6d', sp: 5, instructor: 'job_diamond' }),
  J({ id: 'luna_galaxy_outlaw', name: 'ギャラクシー・アウトロー', hero: 'luna', tier: 4, branch: 'gunslinger', from: 'luna_trigger_maestro',
    desc: '星をも撃ち落とす銀河のお尋ね者。超新星の弾幕であらゆる敵を蒸発させる。',
    statBonus: { dex: 30, luk: 18, atk: 40, crit: 0.06, critDmg: 0.35 },
    skills: ['lj_gun_supernova', 'lj_gun_outlaw_soul', 'lj_gun_bounty_hunter'], title: '銀河のアウトロー', aura: '#ffd23f', sp: 5, instructor: 'job_celes' }),

  // ===================== ストリートスター（luna）: ネオンダンサー系 =====================
  J({ id: 'luna_dancer', name: 'ネオン・ダンサー', hero: 'luna', tier: 1, branch: 'neondancer', from: BEGINNER_ID,
    desc: 'ビートに乗って舞い、斬る。路上ダンスバトル仕込みのスピードファイター。',
    statBonus: { dex: 4, luk: 2, atk: 3, speed: 10, maxMp: 20 },
    skills: ['lj_dance_spin_turn', 'lj_dance_glide', 'lj_dance_mastery'], title: 'ネオン・ダンサー', aura: '#19f0ff', sp: 5, instructor: 'job_velvet' }),
  J({ id: 'luna_rave_star', name: 'レイヴ・スター', hero: 'luna', tier: 2, branch: 'neondancer', from: 'luna_dancer',
    desc: '地下レイブのフロアを沸かせるスター。ストロボと低音で群れを痺れさせ、光のブリンクで消える。',
    statBonus: { dex: 9, luk: 4, atk: 9, speed: 15, maxMp: 50, dmgReduce: 0.02 },
    skills: ['lj_dance_strobe', 'lj_dance_groove', 'lj_dance_booster', 'lj_dance_blink'], title: 'レイヴ・スター', aura: '#3dffd0', sp: 5, instructor: 'job_lily' }),
  J({ id: 'luna_prism_idol', name: 'プリズム・アイドル', hero: 'luna', tier: 3, branch: 'neondancer', from: 'luna_rave_star',
    desc: 'カジノの大舞台に立つ七色のスター。虹のステップは誰にも捕まえられない。',
    statBonus: { dex: 16, luk: 8, atk: 20, speed: 20, maxMp: 100, crit: 0.03, dmgReduce: 0.03 },
    skills: ['lj_dance_prism_step', 'lj_dance_prism_rush', 'lj_dance_encore', 'lj_dance_prism_blink', 'lj_dance_echo_step'], title: 'プリズム・アイドル', aura: '#c77dff', sp: 5, instructor: 'job_diamond' }),
  J({ id: 'luna_cosmo_star', name: 'コズミック・スター', hero: 'luna', tier: 4, branch: 'neondancer', from: 'luna_prism_idol',
    desc: '宇宙港のホログラム・ステージから全銀河へ配信される伝説のパフォーマー。踊るたび星が降る。',
    statBonus: { dex: 28, luk: 14, atk: 36, speed: 30, maxMp: 200, crit: 0.05, dmgReduce: 0.05 },
    skills: ['lj_dance_galaxy_stage', 'lj_dance_starlight_combo', 'lj_dance_world_tour'], title: '宇宙のスーパースター', aura: '#7df9ff', sp: 5, instructor: 'job_celes' }),

  // ===================== ストリートブロウラー（jin）: ストリートファイター系 =====================
  J({ id: 'jin_brawler', name: 'ネオン・ブロウラー', hero: 'jin', tier: 1, branch: 'streetfighter', from: BEGINNER_ID,
    desc: '裏路地のケンカで名を上げた拳闘士。拳ひとつでのし上がる。',
    statBonus: { str: 6, atk: 5, def: 4, maxHp: 80 },
    skills: ['jj_fight_jab_rush', 'jj_fight_haymaker', 'jj_fight_iron_body'], title: 'ネオン・ブロウラー', aura: '#ff8a00', sp: 5, instructor: 'job_bull' }),
  J({ id: 'jin_knuckle_champ', name: 'ナックル・チャンプ', hero: 'jin', tier: 2, branch: 'streetfighter', from: 'jin_brawler',
    desc: 'スワンプの地下闘技場で無敗を誇る拳の王者。殴った地面ごと敵を吹き飛ばし、肩から突っ込む。',
    statBonus: { str: 12, atk: 12, def: 10, maxHp: 250, dmgReduce: 0.02 },
    skills: ['jj_fight_knuckle_bomb', 'jj_fight_fighting_spirit', 'jj_fight_booster', 'jj_fight_shoulder_rush'], title: 'ナックル・チャンプ', aura: '#ff5a1f', sp: 5, instructor: 'job_croc' }),
  J({ id: 'jin_dragon_fist', name: 'ネオン・ドラゴンフィスト', hero: 'jin', tier: 3, branch: 'streetfighter', from: 'jin_knuckle_champ',
    desc: 'ネオンの龍を拳に宿した武闘家。昇龍の一撃は摩天楼すら揺らす。',
    statBonus: { str: 20, atk: 26, def: 18, maxHp: 600, crit: 0.03, critDmg: 0.15, dmgReduce: 0.03 },
    skills: ['jj_fight_dragon_upper', 'jj_fight_hundred_fist', 'jj_fight_dragon_wave', 'jj_fight_unstoppable', 'jj_fight_combo_follow'], title: 'ドラゴンフィスト', aura: '#ff3b3b', sp: 5, instructor: 'job_tiger' }),
  J({ id: 'jin_vice_legend', name: 'ネオン覇王', hero: 'jin', tier: 4, branch: 'streetfighter', from: 'jin_dragon_fist',
    desc: 'ヴァイス・ベイの頂点に立つ伝説の拳。その一撃は天地を割り、宇宙人すら膝をつく。',
    statBonus: { str: 34, atk: 46, def: 30, maxHp: 1400, crit: 0.04, critDmg: 0.3, dmgReduce: 0.05 },
    skills: ['jj_fight_haoh_quake', 'jj_fight_legend_aura', 'jj_fight_haoh_spirit'], title: 'ネオン覇王', aura: '#ffd23f', sp: 5, instructor: 'job_kaiser' }),

  // ===================== ストリートブロウラー（jin）: ナイトレーサー系 =====================
  J({ id: 'jin_racer', name: 'ナイト・レーサー', hero: 'jin', tier: 1, branch: 'nightracer', from: BEGINNER_ID,
    desc: '夜の高架を走り抜ける走り屋。タイヤスモークとニトロで道を切り開く。',
    statBonus: { str: 4, dex: 3, atk: 4, speed: 12, maxHp: 40 },
    skills: ['jj_race_burnout', 'jj_race_drift_dash', 'jj_race_mastery'], title: 'ナイト・レーサー', aura: '#7b5cff', sp: 5, instructor: 'job_bull' }),
  J({ id: 'jin_drifter', name: 'ストリート・ドリフター', hero: 'jin', tier: 2, branch: 'nightracer', from: 'jin_racer',
    desc: 'スワンプの泥道すら滑るように駆けるドリフト職人。足元のホイールで地上を爆走する。',
    statBonus: { str: 8, dex: 6, atk: 11, def: 6, speed: 18, maxHp: 160 },
    skills: ['jj_race_exhaust_flame', 'jj_race_turbo', 'jj_race_booster', 'jj_race_wheel_dash'], title: 'ドリフト・マスター', aura: '#5c7cff', sp: 5, instructor: 'job_croc' }),
  J({ id: 'jin_nitro_ace', name: 'ニトロ・エース', hero: 'jin', tier: 3, branch: 'nightracer', from: 'jin_drifter',
    desc: 'カジノ街のストリップを支配する爆走エース。ニトロの爆炎が通り道をすべて焼き払う。',
    statBonus: { str: 14, dex: 10, atk: 24, def: 12, speed: 25, maxHp: 420, crit: 0.03, dmgReduce: 0.03 },
    skills: ['jj_race_nitro_burst', 'jj_race_slipstream', 'jj_race_afterburner', 'jj_race_tailgate'], title: 'ニトロ・エース', aura: '#a24dff', sp: 5, instructor: 'job_tiger' }),
  J({ id: 'jin_warp_rider', name: 'ワープ・ライダー', hero: 'jin', tier: 4, branch: 'nightracer', from: 'jin_nitro_ace',
    desc: '光速を超えた伝説の走り屋。ワープドライブで時空ごと敵をぶっちぎる。',
    statBonus: { str: 24, dex: 16, atk: 42, def: 20, speed: 40, maxHp: 1000, crit: 0.05, critDmg: 0.2, dmgReduce: 0.05 },
    skills: ['jj_race_warp_drive', 'jj_race_meteor_crash', 'jj_race_hyperdrive'], title: '光速のワープライダー', aura: '#19f0ff', sp: 5, instructor: 'job_kaiser' }),

  // ===================== ストリートハッカー（hacker）: ネットランナー系 =====================
  J({ id: 'hk_netrunner', name: 'ネットランナー', hero: 'hacker', tier: 1, branch: 'netrunner', from: BEGINNER_ID,
    desc: '街のネットワークに潜り、コードを魔法のように撃ち出す電脳の走り手。',
    statBonus: { int: 6, luk: 2, atk: 4, maxMp: 40 },
    skills: ['hn_logic_bomb', 'hn_data_spike', 'hn_data_sprite', 'hn_code_mastery'], title: 'ネットランナー', aura: '#3dff8a', sp: 5, instructor: 'job_zero' }),
  J({ id: 'hk_code_breaker', name: 'コード・ブレイカー', hero: 'hacker', tier: 2, branch: 'netrunner', from: 'hk_netrunner',
    desc: 'どんな防壁も破る天才クラッカー。回線を伝って瞬時に移動するパケット・シフトを使いこなす。',
    statBonus: { int: 12, luk: 4, atk: 10, maxMp: 100, crit: 0.02 },
    skills: ['hn_ddos_storm', 'hn_glitch_cat', 'hn_overflow', 'hn_booster', 'hn_packet_shift'], title: 'コード・ブレイカー', aura: '#5cffb0', sp: 5, instructor: 'job_byte' }),
  J({ id: 'hk_ghost_protocol', name: 'ゴースト・プロトコル', hero: 'hacker', tier: 3, branch: 'netrunner', from: 'hk_code_breaker',
    desc: '摩天楼の全システムを掌握する幽霊ハッカー。街の灯りを一瞬で落とす。',
    statBonus: { int: 20, luk: 8, atk: 22, maxMp: 200, crit: 0.03, critDmg: 0.15, dmgReduce: 0.02 },
    skills: ['hn_blackout', 'hn_trojan_lance', 'hn_phantom_daemon', 'hn_ghost_shift', 'hn_echo_code'], title: 'ゴースト・プロトコル', aura: '#00ffa3', sp: 5, instructor: 'job_cipher' }),
  J({ id: 'hk_cyber_oracle', name: 'サイバー・オラクル', hero: 'hacker', tier: 4, branch: 'netrunner', from: 'hk_ghost_protocol',
    desc: '宇宙港の量子回線に接続し、未来の演算結果すら読む電脳の預言者。',
    statBonus: { int: 32, luk: 14, atk: 40, maxMp: 400, crit: 0.05, critDmg: 0.3, dmgReduce: 0.04 },
    skills: ['hn_singularity', 'hn_oracle_eye', 'hn_omniscience', 'hn_god_mode'], title: '電脳の預言者', aura: '#b6ff3d', sp: 5, instructor: 'job_quasar' }),

  // ===================== ストリートハッカー（hacker）: ドローンマスター系 =====================
  J({ id: 'hk_drone_pilot', name: 'ドローン・パイロット', hero: 'hacker', tier: 1, branch: 'dronemaster', from: BEGINNER_ID,
    desc: '自作ドローンを従えて戦う発明家。相棒ドローンが撃ち、爆撃する。',
    statBonus: { int: 5, dex: 2, luk: 2, atk: 4, maxHp: 30, maxMp: 30 },
    skills: ['hd_drone_shot', 'hd_drone_bomb', 'hd_attack_drone', 'hd_drone_mastery'], title: 'ドローン・パイロット', aura: '#ffb000', sp: 5, instructor: 'job_zero' }),
  J({ id: 'hk_swarm_commander', name: 'スウォーム・コマンダー', hero: 'hacker', tier: 2, branch: 'dronemaster', from: 'hk_drone_pilot',
    desc: 'ドローンの群れを指揮する司令塔。大型ドローンにつかまって空を滑る。',
    statBonus: { int: 10, dex: 4, luk: 4, atk: 10, maxHp: 120, maxMp: 80, def: 4 },
    skills: ['hd_missile_pod', 'hd_sentry_turret', 'hd_shield_drone', 'hd_booster', 'hd_drone_lift'], title: 'スウォーム・コマンダー', aura: '#ffc94d', sp: 5, instructor: 'job_byte' }),
  J({ id: 'hk_mecha_architect', name: 'メカ・アーキテクト', hero: 'hacker', tier: 3, branch: 'dronemaster', from: 'hk_swarm_commander',
    desc: '摩天楼の工事現場で軍用ドローンを組み上げる設計者。空爆とレールガンで戦場を支配する。',
    statBonus: { int: 18, dex: 6, luk: 8, atk: 22, maxHp: 350, maxMp: 160, def: 10, crit: 0.03 },
    skills: ['hd_carpet_bomb', 'hd_rail_drone', 'hd_bomber_drone', 'hd_lift_tuning', 'hd_wingman'], title: 'メカ・アーキテクト', aura: '#ff8a3d', sp: 5, instructor: 'job_cipher' }),
  J({ id: 'hk_orbital_master', name: 'オービタル・マスター', hero: 'hacker', tier: 4, branch: 'dronemaster', from: 'hk_mecha_architect',
    desc: '衛星軌道のドローン網を操る天空の支配者。宇宙から光の柱を落とす。',
    statBonus: { int: 30, dex: 10, luk: 14, atk: 40, maxHp: 900, maxMp: 300, def: 20, crit: 0.05, critDmg: 0.25 },
    skills: ['hd_orbital_laser', 'hd_hive_mind', 'hd_full_deploy'], title: '天空のオービタル・マスター', aura: '#ffe14d', sp: 5, instructor: 'job_quasar' }),
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

// ---- SP プール（メイプル式: 転職段階ごとに別プール） ----
// state.sp = 基本スキル＋1次スキル用（見習い〜1次のレベルアップ分）, state.spByTier = {2, 3, 4}（その段階のレベルアップ分）
/** スキルが消費する SP プールの段階（1〜4。基本スキル・共通スキルは 1） */
export function skillSpTier(skill) {
  const t = skill?.reqJob ? (JOBS[skill.reqJob]?.tier || 1) : 1;
  return Math.max(1, t);
}
/** 現職でのレベルアップ SP が入るプール */
export function currentSpTier(state) { return Math.max(1, jobStateOf(state).tier); }
export function getSp(state, tier = 1) {
  if (tier <= 1) return state?.sp || 0;
  return state?.spByTier?.[tier] || 0;
}
export function addSp(state, n, tier = currentSpTier(state)) {
  if (!state || !n) return;
  if (tier <= 1) { state.sp = (state.sp || 0) + n; return; }
  if (!state.spByTier || typeof state.spByTier !== 'object') state.spByTier = newSpByTier();
  state.spByTier[tier] = (state.spByTier[tier] || 0) + n;
}
export function newSpByTier() { return { 2: 0, 3: 0, 4: 0 }; }
/** 全プール合計（UI の簡易表示用） */
export function totalSp(state) { return getSp(state, 1) + getSp(state, 2) + getSp(state, 3) + getSp(state, 4); }
