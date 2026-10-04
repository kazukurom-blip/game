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
//   townOk: true のスキルは町でも使える（移動系のみ）
//   buff/passive の attackSpeedPct は攻撃速度（ブースター）

import { hasJob } from './jobs.js';

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

  // ===================== 共通（Lv1 移動スキル） =====================
  {
    id: 'street_dash', name: 'ストリートダッシュ', hero: 'both', reqLevel: 1, maxLevel: 10, kind: 'buff', townOk: true,
    desc: 'スニーカーの紐を締め直して駆け出す。一定時間 移動速度が上昇。町でも使える。',
    mp: (lv) => (lv >= 6 ? 3 : lv >= 3 ? 4 : 5), cooldown: () => 1, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#5cff9a',
    buff: (lv) => ({ duration: 30 + 3 * (lv - 1), speedPct: R(0.2 + 0.01 * (lv - 1)) }),
  },
];

// ===================== 転職スキル（v3, reqJob 付き。data/jobs.js の skills と対応） =====================
// reqJob の職、またはその上位職でのみ習得可能。転職時に Lv1 で自動習得する。段階が上がるほど強い。
const P0 = { mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null };
const jobList = [
  // ---- ルナ / ガンスリンガー系 ----
  {
    id: 'lj_gun_double_tap', name: 'ダブルタップ', hero: 'luna', reqJob: 'luna_gunner', reqLevel: 10, maxLevel: 15, kind: 'projectile',
    desc: '[ネオン・ガンナー] 二丁拳銃の高速2連射。弾は1体を貫通する。',
    mp: (lv) => 9 + Math.floor(lv / 2), cooldown: () => 0.5, mult: (lv) => R(1.5 + 0.09 * lv), hits: 1,
    range: { w: 650, h: 30 }, effect: 'muzzle', color: '#ff3d7f',
    proj: { speed: 1300, life: 0.6, count: 2, spread: 20, pierce: 1, kind: 'bullet', w: 26, h: 10 },
  },
  {
    id: 'lj_gun_quickdraw', name: 'クイックドロウ', hero: 'luna', reqJob: 'luna_gunner', reqLevel: 10, maxLevel: 15, kind: 'passive',
    desc: '[パッシブ / ネオン・ガンナー] 抜き撃ちの極意。攻撃力とクリティカル率が上昇。',
    ...P0, color: '#ff3d7f',
    passive: (lv) => ({ atkAdd: 2 * lv, critAdd: R(0.006 * lv) }),
  },
  {
    id: 'lj_gun_rail_snipe', name: 'レールスナイプ', hero: 'luna', reqJob: 'luna_sharpshooter', reqLevel: 30, maxLevel: 20, kind: 'projectile',
    desc: '[シャープシューター] 電磁加速の一閃。画面の端まで全ての敵を撃ち抜く。',
    mp: (lv) => 26 + lv, cooldown: () => 1.6, mult: (lv) => R(4.2 + 0.22 * lv), hits: 1,
    range: { w: 1100, h: 24 }, effect: 'muzzle', color: '#ff5fa2',
    proj: { speed: 2200, life: 0.55, count: 1, spread: 0, pierce: 99, kind: 'beam', w: 70, h: 12 },
  },
  {
    id: 'lj_gun_hot_cartridge', name: 'ホット・カートリッジ', hero: 'luna', reqJob: 'luna_sharpshooter', reqLevel: 30, maxLevel: 15, kind: 'buff',
    desc: '[シャープシューター] 灼熱の特製弾を装填。攻撃力とクリティカル率が大きく上昇。',
    mp: () => 35, cooldown: () => 50, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ff5fa2',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.15 + 0.015 * lv), critAdd: R(0.05 + 0.005 * lv) }),
  },
  {
    id: 'lj_gun_bullet_rain', name: 'バレット・レイン', hero: 'luna', reqJob: 'luna_trigger_queen', reqLevel: 60, maxLevel: 20, kind: 'aoe',
    desc: '[トリガー・クイーン] 空へ撃ち上げた無数の弾丸が周囲一帯に降り注ぐ。',
    mp: (lv) => 55 + 2 * lv, cooldown: (lv) => Math.max(4, 7 - lv * 0.12), mult: (lv) => R(2.4 + 0.13 * lv), hits: 6,
    range: { w: 640, h: 300 }, knock: 160, effect: 'spark', color: '#ff2a6d', maxTargets: 15,
  },
  {
    id: 'lj_gun_heart_magnum', name: 'ハート・マグナム', hero: 'luna', reqJob: 'luna_trigger_queen', reqLevel: 60, maxLevel: 20, kind: 'projectile',
    desc: '[トリガー・クイーン] 女王の愛を込めた特大ハート弾。全てを貫き、撃ち抜かれた者は二度と忘れない。',
    mp: (lv) => 60 + 2 * lv, cooldown: () => 2.2, mult: (lv) => R(8 + 0.4 * lv), hits: 1,
    range: { w: 900, h: 70 }, effect: 'muzzle', color: '#ff2a6d',
    proj: { speed: 1100, life: 0.85, count: 1, spread: 0, pierce: 99, kind: 'heart', w: 60, h: 52 },
  },
  {
    id: 'lj_gun_supernova', name: 'スーパーノヴァ・バースト', hero: 'luna', reqJob: 'luna_galaxy_outlaw', reqLevel: 100, maxLevel: 20, kind: 'projectile',
    desc: '[ギャラクシー・アウトロー] 超新星の輝きを12発の星弾にして扇状に乱射する。',
    mp: (lv) => 110 + 3 * lv, cooldown: () => 3, mult: (lv) => R(9.5 + 0.45 * lv), hits: 1,
    range: { w: 900, h: 400 }, effect: 'spark', color: '#ffd23f',
    proj: { speed: 1400, life: 0.8, count: 12, spread: 700, pierce: 99, kind: 'star', w: 34, h: 34 },
  },
  {
    id: 'lj_gun_outlaw_soul', name: 'アウトロー・ソウル', hero: 'luna', reqJob: 'luna_galaxy_outlaw', reqLevel: 100, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ / ギャラクシー・アウトロー] 銀河一の賞金首の魂。攻撃力・クリティカル率・クリティカルダメージが大きく上昇。',
    ...P0, color: '#ffd23f',
    passive: (lv) => ({ atkAdd: 6 * lv, critAdd: R(0.008 * lv), critDmgAdd: R(0.04 * lv) }),
  },

  // ---- ルナ / ネオンダンサー系 ----
  {
    id: 'lj_dance_spin_turn', name: 'スピン・ターン', hero: 'luna', reqJob: 'luna_dancer', reqLevel: 10, maxLevel: 15, kind: 'melee',
    desc: '[ネオン・ダンサー] つま先で回転しながら5連続の回し蹴り。',
    mp: (lv) => 10 + Math.floor(lv / 2), cooldown: () => 0.6, mult: (lv) => R(0.8 + 0.05 * lv), hits: 5,
    range: { w: 190, h: 110 }, knock: 140, effect: 'slash', color: '#19f0ff', maxTargets: 6,
  },
  {
    id: 'lj_dance_glide', name: 'ネオン・グライド', hero: 'luna', reqJob: 'luna_dancer', reqLevel: 10, maxLevel: 15, kind: 'dash',
    desc: '[ネオン・ダンサー] 光の残像を残して滑るように前進。通過した敵を2回切り裂く。移動中は無敵。',
    mp: () => 14, cooldown: (lv) => Math.max(1, 2.6 - lv * 0.08), mult: (lv) => R(1.3 + 0.08 * lv), hits: 2,
    range: { w: 70, h: 90 }, effect: 'dash', color: '#19f0ff',
    dash: { dist: (lv) => 320 + lv * 10, time: 0.22, invuln: 0.45 },
  },
  {
    id: 'lj_dance_strobe', name: 'ストロボ・フラッシュ', hero: 'luna', reqJob: 'luna_rave_star', reqLevel: 30, maxLevel: 20, kind: 'aoe',
    desc: '[レイヴ・スター] 爆音とストロボで周囲の敵を4回痺れさせる。',
    mp: (lv) => 30 + lv, cooldown: (lv) => Math.max(2.5, 5 - lv * 0.1), mult: (lv) => R(1.7 + 0.1 * lv), hits: 4,
    range: { w: 460, h: 240 }, knock: 220, effect: 'spark', color: '#3dffd0', maxTargets: 12,
  },
  {
    id: 'lj_dance_groove', name: 'グルーヴ・ハイ', hero: 'luna', reqJob: 'luna_rave_star', reqLevel: 30, maxLevel: 15, kind: 'buff',
    desc: '[レイヴ・スター] 最高のグルーヴに乗る。移動速度・攻撃力・防御力が上昇。',
    mp: () => 35, cooldown: () => 45, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#3dffd0',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.1 + 0.01 * lv), speedPct: R(0.12 + 0.01 * lv), defPct: R(0.1 + 0.01 * lv) }),
  },
  {
    id: 'lj_dance_prism_step', name: 'プリズム・ステップ', hero: 'luna', reqJob: 'luna_prism_idol', reqLevel: 60, maxLevel: 20, kind: 'dash',
    desc: '[プリズム・アイドル] 七色の残像を連れて長距離ステップ。通過した敵を4回斬る。',
    mp: () => 40, cooldown: (lv) => Math.max(1.2, 3 - lv * 0.08), mult: (lv) => R(2.6 + 0.14 * lv), hits: 4,
    range: { w: 90, h: 120 }, knock: 200, effect: 'dash', color: '#c77dff',
    dash: { dist: (lv) => 420 + lv * 12, time: 0.26, invuln: 0.55 },
  },
  {
    id: 'lj_dance_encore', name: 'アンコール', hero: 'luna', reqJob: 'luna_prism_idol', reqLevel: 60, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ / プリズム・アイドル] 鳴りやまない歓声が力になる。移動速度・クリティカル率・被ダメージ軽減が上昇。',
    ...P0, color: '#c77dff',
    passive: (lv) => ({ speedAdd: 3 * lv, critAdd: R(0.005 * lv), dmgReduce: R(0.008 * lv), atkAdd: 3 * lv }),
  },
  {
    id: 'lj_dance_galaxy_stage', name: 'ギャラクシー・ステージ', hero: 'luna', reqJob: 'luna_cosmo_diva', reqLevel: 100, maxLevel: 20, kind: 'aoe',
    desc: '[コズミック・ディーヴァ] 足元に銀河のステージを展開。画面中の敵を8回打ち据えるフィナーレ。',
    mp: (lv) => 120 + 3 * lv, cooldown: (lv) => Math.max(5, 9 - lv * 0.15), mult: (lv) => R(3.2 + 0.18 * lv), hits: 8,
    range: { w: 900, h: 380 }, knock: 260, launch: 260, effect: 'explosion', color: '#7df9ff', maxTargets: 20,
  },
  {
    id: 'lj_dance_starlight_combo', name: 'スターライト・コンボ', hero: 'luna', reqJob: 'luna_cosmo_diva', reqLevel: 100, maxLevel: 20, kind: 'melee',
    desc: '[コズミック・ディーヴァ] 流星のような10連撃。前方の敵をまとめて切り刻む。',
    mp: (lv) => 70 + 2 * lv, cooldown: () => 0.9, mult: (lv) => R(2.2 + 0.12 * lv), hits: 10,
    range: { w: 280, h: 150 }, knock: 180, effect: 'slash', color: '#7df9ff', maxTargets: 10,
  },

  // ---- ジン / ストリートファイター系 ----
  {
    id: 'jj_fight_jab_rush', name: 'ジャブ・ラッシュ', hero: 'jin', reqJob: 'jin_brawler', reqLevel: 10, maxLevel: 15, kind: 'melee',
    desc: '[ストリート・ブロウラー] 目にも止まらぬ5連ジャブからのストレート。',
    mp: (lv) => 10 + Math.floor(lv / 2), cooldown: () => 0.6, mult: (lv) => R(0.95 + 0.06 * lv), hits: 5,
    range: { w: 150, h: 90 }, knock: 220, effect: 'hit', color: '#ff8a00', maxTargets: 4,
  },
  {
    id: 'jj_fight_iron_body', name: 'アイアン・ボディ', hero: 'jin', reqJob: 'jin_brawler', reqLevel: 10, maxLevel: 15, kind: 'passive',
    desc: '[パッシブ / ストリート・ブロウラー] 鍛え抜かれた鋼の肉体。最大HPと防御力が上昇。',
    ...P0, color: '#ff8a00',
    passive: (lv) => ({ maxHpPct: R(0.02 * lv), defAdd: 2 * lv }),
  },
  {
    id: 'jj_fight_knuckle_bomb', name: 'ナックル・ボム', hero: 'jin', reqJob: 'jin_knuckle_king', reqLevel: 30, maxLevel: 20, kind: 'aoe',
    desc: '[ナックル・キング] 地面に拳を叩き込み、爆風で周囲の敵を吹き飛ばす。',
    mp: (lv) => 32 + lv, cooldown: (lv) => Math.max(2.5, 5 - lv * 0.1), mult: (lv) => R(3.2 + 0.18 * lv), hits: 2,
    range: { w: 480, h: 200 }, knock: 420, launch: 350, effect: 'explosion', color: '#ff5a1f', maxTargets: 12,
  },
  {
    id: 'jj_fight_fighting_spirit', name: '闘魂', hero: 'jin', reqJob: 'jin_knuckle_king', reqLevel: 30, maxLevel: 15, kind: 'buff',
    desc: '[ナックル・キング] 燃え上がる闘志。攻撃力と防御力が大きく上昇する。',
    mp: () => 35, cooldown: () => 50, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ff5a1f',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.18 + 0.015 * lv), defPct: R(0.2 + 0.02 * lv) }),
  },
  {
    id: 'jj_fight_dragon_upper', name: '昇龍アッパー', hero: 'jin', reqJob: 'jin_dragon_fist', reqLevel: 60, maxLevel: 20, kind: 'melee',
    desc: '[ドラゴンフィスト] ネオンの龍が天へ昇る。敵を3回殴り、遥か上空へ打ち上げる。',
    mp: (lv) => 50 + 2 * lv, cooldown: () => 1.1, mult: (lv) => R(4.2 + 0.22 * lv), hits: 3,
    range: { w: 170, h: 220 }, knock: 120, launch: 900, effect: 'critHit', color: '#ff3b3b', maxTargets: 8,
  },
  {
    id: 'jj_fight_dragon_wave', name: '龍撃波', hero: 'jin', reqJob: 'jin_dragon_fist', reqLevel: 60, maxLevel: 20, kind: 'projectile',
    desc: '[ドラゴンフィスト] 龍の咆哮を拳圧に乗せて放つ。巨大な衝撃波が全てを貫く。',
    mp: (lv) => 60 + 2 * lv, cooldown: () => 2.6, mult: (lv) => R(8.5 + 0.42 * lv), hits: 1,
    range: { w: 900, h: 130 }, effect: 'smoke', color: '#ff3b3b',
    proj: { speed: 900, life: 1.0, count: 1, spread: 0, pierce: 99, kind: 'shockwave', w: 110, h: 130 },
  },
  {
    id: 'jj_fight_haoh_quake', name: '覇王・天地崩し', hero: 'jin', reqJob: 'jin_vice_legend', reqLevel: 100, maxLevel: 20, kind: 'aoe',
    desc: '[ネオン覇王] 大地を割る覇王の一撃。画面中の敵を5回打ち砕き、天高く吹き飛ばす。',
    mp: (lv) => 130 + 3 * lv, cooldown: (lv) => Math.max(5, 9 - lv * 0.15), mult: (lv) => R(6 + 0.32 * lv), hits: 5,
    range: { w: 960, h: 340 }, knock: 500, launch: 700, effect: 'explosion', color: '#ffd23f', maxTargets: 20,
  },
  {
    id: 'jj_fight_legend_aura', name: 'レジェンド・オーラ', hero: 'jin', reqJob: 'jin_vice_legend', reqLevel: 100, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ / ネオン覇王] 伝説の男の覇気。攻撃力・クリティカルダメージ・被ダメージ軽減が大きく上昇。',
    ...P0, color: '#ffd23f',
    passive: (lv) => ({ atkAdd: 7 * lv, critDmgAdd: R(0.04 * lv), dmgReduce: R(0.008 * lv), maxHpPct: R(0.01 * lv) }),
  },

  // ---- ジン / ナイトレーサー系 ----
  {
    id: 'jj_race_burnout', name: 'バーンアウト', hero: 'jin', reqJob: 'jin_racer', reqLevel: 10, maxLevel: 15, kind: 'aoe',
    desc: '[ナイト・レーサー] その場でタイヤを空転させ、灼熱のスモークで周囲の敵を3回焼く。',
    mp: (lv) => 14 + lv, cooldown: (lv) => Math.max(2, 4 - lv * 0.1), mult: (lv) => R(1.1 + 0.07 * lv), hits: 3,
    range: { w: 360, h: 160 }, knock: 240, effect: 'smoke', color: '#7b5cff', maxTargets: 10,
  },
  {
    id: 'jj_race_drift_dash', name: 'ドリフト・ダッシュ', hero: 'jin', reqJob: 'jin_racer', reqLevel: 10, maxLevel: 15, kind: 'dash',
    desc: '[ナイト・レーサー] 低い姿勢でドリフトしながら突っ込む。進路上の敵を跳ね飛ばす。',
    mp: () => 15, cooldown: (lv) => Math.max(1.2, 3 - lv * 0.1), mult: (lv) => R(2 + 0.12 * lv), hits: 1,
    range: { w: 80, h: 80 }, knock: 520, effect: 'dash', color: '#7b5cff',
    dash: { dist: (lv) => 360 + lv * 12, time: 0.26, invuln: 0.45 },
  },
  {
    id: 'jj_race_exhaust_flame', name: 'エキゾースト・フレイム', hero: 'jin', reqJob: 'jin_drifter', reqLevel: 30, maxLevel: 20, kind: 'projectile',
    desc: '[ストリート・ドリフター] マフラーから噴き出す炎の塊を3発撃ち出す。敵を貫通する。',
    mp: (lv) => 28 + lv, cooldown: () => 1.2, mult: (lv) => R(2.2 + 0.13 * lv), hits: 1,
    range: { w: 650, h: 120 }, effect: 'explosion', color: '#5c7cff',
    proj: { speed: 850, life: 0.75, count: 3, spread: 160, pierce: 3, kind: 'orb', w: 34, h: 34 },
  },
  {
    id: 'jj_race_turbo', name: 'ターボチャージ', hero: 'jin', reqJob: 'jin_drifter', reqLevel: 30, maxLevel: 15, kind: 'buff',
    desc: '[ストリート・ドリフター] ブースト全開。移動速度と攻撃力が大きく上昇する。',
    mp: () => 35, cooldown: () => 45, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#5c7cff',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.14 + 0.012 * lv), speedPct: R(0.15 + 0.01 * lv) }),
  },
  {
    id: 'jj_race_nitro_burst', name: 'ニトロ・バースト', hero: 'jin', reqJob: 'jin_nitro_baron', reqLevel: 60, maxLevel: 20, kind: 'aoe',
    desc: '[ニトロ・バロン] ニトロタンクを叩き割って大爆発。周囲一帯を3回焼き払う。',
    mp: (lv) => 60 + 2 * lv, cooldown: (lv) => Math.max(3, 6 - lv * 0.12), mult: (lv) => R(4.4 + 0.24 * lv), hits: 3,
    range: { w: 700, h: 280 }, knock: 480, launch: 420, effect: 'explosion', color: '#a24dff', maxTargets: 16,
  },
  {
    id: 'jj_race_slipstream', name: 'スリップストリーム', hero: 'jin', reqJob: 'jin_nitro_baron', reqLevel: 60, maxLevel: 20, kind: 'passive',
    desc: '[パッシブ / ニトロ・バロン] 風を読み、風に乗る。移動速度・攻撃力・被ダメージ軽減が上昇。',
    ...P0, color: '#a24dff',
    passive: (lv) => ({ speedAdd: 3 * lv, atkAdd: 4 * lv, dmgReduce: R(0.008 * lv) }),
  },
  {
    id: 'jj_race_warp_drive', name: 'ワープ・ドライブ', hero: 'jin', reqJob: 'jin_warp_rider', reqLevel: 100, maxLevel: 20, kind: 'dash',
    desc: '[ワープ・ライダー] 時空を跳ぶ超長距離ダッシュ。通過した敵を4回轢き飛ばす。',
    mp: () => 80, cooldown: (lv) => Math.max(1.2, 3 - lv * 0.08), mult: (lv) => R(4.5 + 0.25 * lv), hits: 4,
    range: { w: 110, h: 130 }, knock: 600, effect: 'dash', color: '#19f0ff',
    dash: { dist: (lv) => 600 + lv * 15, time: 0.3, invuln: 0.6 },
  },
  {
    id: 'jj_race_meteor_crash', name: 'メテオ・クラッシュ', hero: 'jin', reqJob: 'jin_warp_rider', reqLevel: 100, maxLevel: 20, kind: 'aoe',
    desc: '[ワープ・ライダー] 大気圏外から愛車ごと突っ込む隕石の一撃。画面中の敵を6回粉砕する。',
    mp: (lv) => 130 + 3 * lv, cooldown: (lv) => Math.max(5, 9 - lv * 0.15), mult: (lv) => R(5.2 + 0.28 * lv), hits: 6,
    range: { w: 960, h: 360 }, knock: 520, launch: 600, effect: 'explosion', color: '#19f0ff', maxTargets: 20,
  },

  // ---- 1次: ブースター（攻撃速度アップ） ----
  {
    id: 'lj_gun_booster', name: 'ガン・ブースター', hero: 'luna', reqJob: 'luna_gunner', reqLevel: 10, maxLevel: 10, kind: 'buff',
    desc: '[ネオン・ガンナー / ブースター] 銃のスライドを高速化。一定時間 攻撃速度が上昇。',
    mp: () => 15, cooldown: () => 60, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ff7fae',
    buff: (lv) => ({ duration: 60 + lv * 6, attackSpeedPct: R(0.1 + 0.01 * lv) }),
  },
  {
    id: 'lj_dance_booster', name: 'ビート・ブースター', hero: 'luna', reqJob: 'luna_dancer', reqLevel: 10, maxLevel: 10, kind: 'buff',
    desc: '[ネオン・ダンサー / ブースター] BPMを上げる。一定時間 攻撃速度が上昇。',
    mp: () => 15, cooldown: () => 60, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#7ff6ff',
    buff: (lv) => ({ duration: 60 + lv * 6, attackSpeedPct: R(0.1 + 0.01 * lv) }),
  },
  {
    id: 'jj_fight_booster', name: 'ナックル・ブースター', hero: 'jin', reqJob: 'jin_brawler', reqLevel: 10, maxLevel: 10, kind: 'buff',
    desc: '[ストリート・ブロウラー / ブースター] 拳のギアを一段上げる。一定時間 攻撃速度が上昇。',
    mp: () => 15, cooldown: () => 60, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ffb35c',
    buff: (lv) => ({ duration: 60 + lv * 6, attackSpeedPct: R(0.1 + 0.01 * lv) }),
  },
  {
    id: 'jj_race_booster', name: 'ギア・ブースター', hero: 'jin', reqJob: 'jin_racer', reqLevel: 10, maxLevel: 10, kind: 'buff',
    desc: '[ナイト・レーサー / ブースター] シフトアップ！ 一定時間 攻撃速度が上昇。',
    mp: () => 15, cooldown: () => 60, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#a08cff',
    buff: (lv) => ({ duration: 60 + lv * 6, attackSpeedPct: R(0.1 + 0.01 * lv) }),
  },

  // ---- 2次: 系統ごとの移動スキル（kind:'move'。実際の動きは player.doMoveSkill が担当） ----
  {
    id: 'lj_gun_blink', name: 'ネオン・ブリンク', hero: 'luna', reqJob: 'luna_sharpshooter', reqLevel: 30, maxLevel: 10, kind: 'move', townOk: true,
    desc: '[シャープシューター / 移動] ピンクの残光を残して、向いている方向へ短距離テレポート。',
    mp: () => 8, cooldown: (lv) => R(Math.max(0.6, 1.2 - lv * 0.05)), mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'dash', color: '#ff5fa2',
    move: { type: 'teleport', power: 0, distance: 220, perLv: 10, invuln: 0.1 },
  },
  {
    id: 'lj_dance_double_beat', name: 'ダブル・ビート', hero: 'luna', reqJob: 'luna_rave_star', reqLevel: 30, maxLevel: 10, kind: 'move', townOk: true,
    desc: '[レイヴ・スター / 移動] 空中でもう一度ビートを踏み、前方へ大きく2段ジャンプ（フラッシュジャンプ）。',
    mp: () => 6, cooldown: () => 0.3, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'dash', color: '#3dffd0',
    move: { type: 'flashJump', power: 620, distance: 300, perLv: 12, lift: 420, airOnly: true },
  },
  {
    id: 'jj_fight_bull_rush', name: 'ブル・ラッシュ', hero: 'jin', reqJob: 'jin_knuckle_king', reqLevel: 30, maxLevel: 10, kind: 'move', townOk: true,
    desc: '[ナックル・キング / 移動] 猛牛のように地面を蹴って一気に突進移動する。',
    mp: () => 8, cooldown: (lv) => R(Math.max(0.8, 1.5 - lv * 0.06)), mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'dash', color: '#ff5a1f',
    move: { type: 'rush', power: 1300, distance: 320, perLv: 12, time: 0.25 },
  },
  {
    id: 'jj_race_nitro_glide', name: 'ニトロ・グライド', hero: 'jin', reqJob: 'jin_drifter', reqLevel: 30, maxLevel: 10, kind: 'move', townOk: true,
    desc: '[ストリート・ドリフター / 移動] 背中のミニニトロを噴かし、重力を振り切って前方へ滑空する。',
    mp: () => 8, cooldown: () => 1.2, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'dash', color: '#5c7cff',
    move: { type: 'glide', power: 700, distance: 420, perLv: 15, time: 0.6, gravityScale: 0.15 },
  },

  // ---- 3次: 2次の移動スキル強化（passive, enhances） ----
  {
    id: 'lj_gun_phantom_blink', name: 'ファントム・ブリンク', hero: 'luna', reqJob: 'luna_trigger_queen', reqLevel: 60, maxLevel: 10, kind: 'passive',
    enhances: 'lj_gun_blink',
    desc: '[パッシブ / トリガー・クイーン] ネオン・ブリンク強化: 距離アップ、テレポート後に無敵＋クールダウン短縮。',
    ...P0, color: '#ff2a6d',
    passive: () => ({}),
    enhance: (lv) => ({ distancePct: R(0.1 + 0.02 * lv), invulnAdd: 0.3, cooldownCut: R(0.2 + 0.02 * lv) }),
  },
  {
    id: 'lj_dance_air_encore', name: 'エアリアル・アンコール', hero: 'luna', reqJob: 'luna_prism_idol', reqLevel: 60, maxLevel: 10, kind: 'passive',
    enhances: 'lj_dance_double_beat',
    desc: '[パッシブ / プリズム・アイドル] ダブル・ビート強化: 跳躍距離+30%、使用後に移動速度アップ。',
    ...P0, color: '#c77dff',
    passive: () => ({}),
    enhance: (lv) => ({ distancePct: R(0.1 + 0.02 * lv), powerPct: R(0.1 + 0.02 * lv), afterBuff: { duration: 3, speedPct: R(0.1 + 0.01 * lv) } }),
  },
  {
    id: 'jj_fight_unstoppable', name: 'アンストッパブル', hero: 'jin', reqJob: 'jin_dragon_fist', reqLevel: 60, maxLevel: 10, kind: 'passive',
    enhances: 'jj_fight_bull_rush',
    desc: '[パッシブ / ドラゴンフィスト] ブル・ラッシュ強化: 突進距離アップ、突進中は無敵、使用後に防御力アップ。',
    ...P0, color: '#ff3b3b',
    passive: () => ({}),
    enhance: (lv) => ({ distancePct: R(0.1 + 0.02 * lv), invulnAdd: 0.3, afterBuff: { duration: 4, defPct: R(0.1 + 0.02 * lv) } }),
  },
  {
    id: 'jj_race_afterburner', name: 'アフターバーナー', hero: 'jin', reqJob: 'jin_nitro_baron', reqLevel: 60, maxLevel: 10, kind: 'passive',
    enhances: 'jj_race_nitro_glide',
    desc: '[パッシブ / ニトロ・バロン] ニトロ・グライド強化: 滑空距離+30%・クールダウン短縮、使用後に移動速度アップ。',
    ...P0, color: '#a24dff',
    passive: () => ({}),
    enhance: (lv) => ({ distancePct: R(0.1 + 0.02 * lv), cooldownCut: R(0.1 + 0.02 * lv), afterBuff: { duration: 4, speedPct: R(0.12 + 0.01 * lv) } }),
  },

  // ---- 4次: ハイパー級バフ（長CD・強力） ----
  {
    id: 'lj_gun_bounty_hunter', name: 'バウンティ・ハンター', hero: 'luna', reqJob: 'luna_galaxy_outlaw', reqLevel: 100, maxLevel: 10, kind: 'buff',
    desc: '[ギャラクシー・アウトロー / ハイパー] 賞金首モード。攻撃力・クリティカル率・攻撃速度が大幅に上昇。',
    mp: () => 100, cooldown: () => 120, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ffd23f',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.25 + 0.02 * lv), critAdd: R(0.1 + 0.005 * lv), attackSpeedPct: 0.2 }),
  },
  {
    id: 'lj_dance_world_tour', name: 'ワールド・ツアー', hero: 'luna', reqJob: 'luna_cosmo_diva', reqLevel: 100, maxLevel: 10, kind: 'buff',
    desc: '[コズミック・ディーヴァ / ハイパー] 銀河ツアー開幕。攻撃力・移動速度・防御力が大幅に上昇。',
    mp: () => 100, cooldown: () => 120, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#7df9ff',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.22 + 0.02 * lv), speedPct: 0.2, defPct: R(0.2 + 0.02 * lv), attackSpeedPct: 0.15 }),
  },
  {
    id: 'jj_fight_haoh_spirit', name: '覇王の気', hero: 'jin', reqJob: 'jin_vice_legend', reqLevel: 100, maxLevel: 10, kind: 'buff',
    desc: '[ネオン覇王 / ハイパー] 全身から覇気を放つ。攻撃力と防御力が極大まで上昇。',
    mp: () => 100, cooldown: () => 120, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#ffd23f',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.3 + 0.02 * lv), defPct: R(0.35 + 0.03 * lv) }),
  },
  {
    id: 'jj_race_hyperdrive', name: 'ハイパードライブ', hero: 'jin', reqJob: 'jin_warp_rider', reqLevel: 100, maxLevel: 10, kind: 'buff',
    desc: '[ワープ・ライダー / ハイパー] リミッター解除。攻撃力・移動速度・攻撃速度が大幅に上昇。',
    mp: () => 100, cooldown: () => 120, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: 'buff', color: '#19f0ff',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.25 + 0.02 * lv), speedPct: 0.25, attackSpeedPct: 0.2 }),
  },
];
list.push(...jobList);

export const SKILLS = Object.fromEntries(list.map((s) => [s.id, s]));

export function getSkill(id) { return SKILLS[id] || null; }

/**
 * skillsForHero(heroId, state?, opts?) — スキル窓用の一覧
 *  - state 省略: 転職スキル（reqJob 付き）を含まない基本スキルのみ（従来どおり）
 *  - state あり: 基本スキル ＋ 現職の系譜（下位職を含む）の転職スキル
 *  - opts.allJobs: true なら全系統の転職スキルも含める（ロック表示用。習得可否は jobSkillUnlocked で判定）
 */
export function skillsForHero(heroId, state, opts = {}) {
  return list.filter((s) => (s.hero === heroId || s.hero === 'both') &&
    (!s.reqJob || opts.allJobs || (state && hasJob(state, s.reqJob))));
}

/** 転職条件を満たしているか（reqJob なしは常に true） */
export function jobSkillUnlocked(state, skillOrId) {
  const s = typeof skillOrId === 'string' ? SKILLS[skillOrId] : skillOrId;
  return !!s && (!s.reqJob || hasJob(state, s.reqJob));
}

// 初期習得スキル（Lv1）とスキルバー
export const STARTER_SKILLS = {
  luna: { skills: { luna_neon_rush: 1, street_dash: 1 }, skillBar: ['luna_neon_rush', 'street_dash', null, null] },
  jin: { skills: { jin_heavy_smash: 1, street_dash: 1 }, skillBar: ['jin_heavy_smash', 'street_dash', null, null] },
};
