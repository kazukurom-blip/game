// 転職スキル（v3）。data/skills.js が SKILLS に統合する。reqJob の職（またはその上位職）でのみ習得可。
// 成長（メイプル式・REFERENCE_MAPLE_SYSTEMS §3 S-2）: 威力 = 基本 × (1 + 0.05×(Lv-1))、MP = 基本 + 0.5×Lv、CT は Lv10/20 で -10% ずつ
// 追加データ:
//   kind:'move'  move:{type, power, distance, perLv, ...}（docs/SPEC_JOB.md「移動スキル」）
//   enhances:'<moveSkillId>' + enhance(lv) → {distancePct, powerPct, cooldownCut, invulnAdd, afterBuff, arrivalBlast}
//   finalAttack(lv) → {chance, mult}（ファイナルアタック。攻撃スキル命中時に確率で追撃。最大値を採用）
//   buff/passive の attackSpeedPct = ブースター（攻撃速度）
import { JOBS } from './jobs.js';

const R = (v) => Math.round(v * 100) / 100;
const M = (base) => (lv) => R(base * (1 + 0.05 * (Math.max(1, lv) - 1)));
const MP = (base) => (lv) => Math.round(base + 0.5 * lv);
const CD = (base) => (lv) => R(base * (lv >= 20 ? 0.8 : lv >= 10 ? 0.9 : 1));
const NONE = { mp: () => 0, cooldown: () => 0, mult: () => 0, hits: 0, range: { w: 0, h: 0 }, effect: null };

function base(job, o) {
  const j = JOBS[job];
  if (!j) throw new Error('jobSkills: unknown job ' + job);
  const tag = `[${j.name}${o.tag ? ' / ' + o.tag : ''}] `;
  const out = { hero: j.hero, reqJob: job, reqLevel: j.reqLevel, maxLevel: 20, ...o, desc: tag + o.desc };
  delete out.tag;
  return out;
}
/** 攻撃スキル: m=Lv1倍率, mp=基本MP, cd=基本CT */
const A = (job, o) => { const { m, mp, cd, ...rest } = o; return base(job, { hits: 1, ...rest, mult: M(m), mp: MP(mp), cooldown: CD(cd) }); };
/** パッシブ */
const P = (job, o) => base(job, { ...NONE, maxLevel: 10, kind: 'passive', ...o, desc: o.desc, tag: o.tag ? 'パッシブ・' + o.tag : 'パッシブ' });
/** バフ */
const Bf = (job, o) => { const { mp, cd, ...rest } = o; return base(job, { ...NONE, maxLevel: 10, kind: 'buff', effect: 'buff', ...rest, mp: () => mp, cooldown: () => cd }); };
/** ブースター（攻撃速度 最大+25%, 持続 最大240秒） */
const Boost = (job, id, name, color, flavor) => Bf(job, {
  id, name, color, mp: 12, cd: 10, tag: 'ブースター', desc: `${flavor}一定時間 攻撃速度が上昇。`,
  buff: (lv) => ({ duration: 60 + 18 * lv, attackSpeedPct: R(0.07 + 0.018 * lv) }),
});
/** マスタリー（武器熟練: 攻撃力・クリティカル） */
const Mastery = (job, id, name, color, flavor, extra = () => ({})) => P(job, {
  id, name, color, tag: 'マスタリー', desc: `${flavor}攻撃力とクリティカルダメージが上昇。`,
  passive: (lv) => ({ atkAdd: 2 * lv, critDmgAdd: R(0.01 * lv), ...extra(lv) }),
});
/** ファイナルアタック（最大 Lv で 45% / 120%） */
const FA = (job, id, name, color, flavor) => P(job, {
  id, name, color, tag: 'ファイナルアタック', desc: `${flavor}攻撃スキル命中時に確率で追撃する。`,
  passive: () => ({}),
  finalAttack: (lv) => ({ chance: R(0.15 + 0.03 * lv), mult: R(0.8 + 0.04 * lv) }),
});
/** 移動スキル（kind:'move'） */
const Mv = (job, o) => { const { mp, cd, ...rest } = o; return base(job, { ...NONE, maxLevel: 10, kind: 'move', townOk: true, effect: 'dash', ...rest, tag: '移動', mp: () => mp, cooldown: (lv) => R(Math.max(cd * 0.6, cd - 0.03 * (lv - 1))) }); };
/** 移動スキル強化（3次） */
const Enh = (job, o) => P(job, { tag: '移動強化', passive: () => ({}), ...o });
/** ハイパーバフ（4次・長CT） */
const Hyper = (job, o) => Bf(job, { mp: 100, cd: 120, tag: 'ハイパー', ...o });

export const JOB_SKILL_LIST = [
  // ================= ガンスリンガー系 =================
  A('luna_gunner', { id: 'lj_gun_double_tap', name: 'ダブルタップ', kind: 'projectile', m: 1.6, mp: 9, cd: 0.5,
    desc: '二丁拳銃の高速2連射。弾は1体を貫通する。', range: { w: 650, h: 30 }, effect: 'muzzle', color: '#ff3d7f',
    proj: { speed: 1300, life: 0.6, count: 2, spread: 20, pierce: 1, kind: 'bullet', w: 26, h: 10 } }),
  A('luna_gunner', { id: 'lj_gun_spread_shot', name: 'スプレッド・ショット', kind: 'projectile', m: 1.1, mp: 11, cd: 0.8,
    desc: '銃口を払うように5発を扇状にばらまく。群れ狩り向き。', range: { w: 520, h: 220 }, effect: 'muzzle', color: '#ff7fae',
    proj: { speed: 1100, life: 0.5, count: 5, spread: 380, pierce: 0, kind: 'bullet', w: 20, h: 8 } }),
  Mastery('luna_gunner', 'lj_gun_mastery', 'ガン・マスタリー', '#ff3d7f', '抜き撃ちの極意。', (lv) => ({ critAdd: R(0.006 * lv) })),
  A('luna_sharpshooter', { id: 'lj_gun_rail_snipe', name: 'レールスナイプ', kind: 'projectile', m: 4.8, mp: 26, cd: 1.6,
    desc: '電磁加速の一閃。画面の端まで全ての敵を撃ち抜く。', range: { w: 1100, h: 24 }, effect: 'muzzle', color: '#ff5fa2',
    proj: { speed: 2200, life: 0.55, count: 1, spread: 0, pierce: 99, kind: 'beam', w: 70, h: 12 } }),
  Bf('luna_sharpshooter', { id: 'lj_gun_hot_cartridge', name: 'ホット・カートリッジ', mp: 35, cd: 50, color: '#ff5fa2',
    desc: '灼熱の特製弾を装填。攻撃力とクリティカル率が大きく上昇。',
    buff: (lv) => ({ duration: 60 + lv * 6, atkPct: R(0.15 + 0.015 * lv), critAdd: R(0.05 + 0.005 * lv) }) }),
  Boost('luna_sharpshooter', 'lj_gun_booster', 'ガン・ブースター', '#ff7fae', '銃のスライドを高速化。'),
  Mv('luna_sharpshooter', { id: 'lj_gun_recoil_jump', name: 'リコイル・ジャンプ', mp: 7, cd: 0.4, color: '#ff5fa2',
    desc: '空中で真後ろへ撃ち、その反動で前方へ大きく跳ぶ（フラッシュジャンプ）。後方の敵にも弾が当たる。',
    move: { type: 'flashJump', power: 640, distance: 300, perLv: 12, lift: 380, airOnly: true, backShot: { mult: 1.0, w: 260, h: 40 } } }),
  A('luna_trigger_maestro', { id: 'lj_gun_bullet_rain', name: 'バレット・レイン', kind: 'aoe', m: 2.5, mp: 55, cd: 6,
    desc: '空へ撃ち上げた無数の弾丸が周囲一帯に降り注ぐ。', hits: 6, range: { w: 640, h: 300 }, knock: 160, effect: 'spark', color: '#ff2a6d', maxTargets: 15 }),
  A('luna_trigger_maestro', { id: 'lj_gun_heart_magnum', name: 'ハート・マグナム', kind: 'projectile', m: 8.4, mp: 60, cd: 2.2,
    desc: 'ありったけの想いを込めた特大ハート弾。全てを貫き、撃ち抜かれた者は二度と忘れない。', range: { w: 900, h: 70 }, effect: 'muzzle', color: '#ff2a6d',
    proj: { speed: 1100, life: 0.85, count: 1, spread: 0, pierce: 99, kind: 'heart', w: 60, h: 52 } }),
  Enh('luna_trigger_maestro', { id: 'lj_gun_recoil_master', name: 'リコイル・マスター', color: '#ff2a6d', enhances: 'lj_gun_recoil_jump',
    desc: 'リコイル・ジャンプ強化: 跳躍距離+30%、反動弾の威力アップ、着地まで移動速度アップ。',
    enhance: (lv) => ({ distancePct: R(0.03 * lv), powerPct: R(0.02 * lv), afterBuff: { duration: 3, speedPct: R(0.1 + 0.01 * lv) }, backShotMult: R(1 + 0.1 * lv) }) }),
  FA('luna_trigger_maestro', 'lj_gun_follow_shot', 'フォロー・ショット', '#ff2a6d', '撃ち漏らしは許さない。'),
  A('luna_galaxy_outlaw', { id: 'lj_gun_supernova', name: 'スーパーノヴァ・バースト', kind: 'projectile', m: 9.9, mp: 110, cd: 3,
    desc: '超新星の輝きを12発の星弾にして扇状に乱射する。', range: { w: 900, h: 400 }, effect: 'spark', color: '#ffd23f',
    proj: { speed: 1400, life: 0.8, count: 12, spread: 700, pierce: 99, kind: 'star', w: 34, h: 34 } }),
  P('luna_galaxy_outlaw', { id: 'lj_gun_outlaw_soul', name: 'アウトロー・ソウル', maxLevel: 20, color: '#ffd23f',
    desc: '銀河一の賞金首の魂。攻撃力・クリティカル率・クリティカルダメージが大きく上昇し、ファイナルアタックが強化される。',
    passive: (lv) => ({ atkAdd: 6 * lv, critAdd: R(0.008 * lv), critDmgAdd: R(0.04 * lv) }),
    finalAttack: (lv) => ({ chance: R(0.4 + 0.01 * lv), mult: R(1.0 + 0.05 * lv) }) }),
  Hyper('luna_galaxy_outlaw', { id: 'lj_gun_bounty_hunter', name: 'バウンティ・ハンター', color: '#ffd23f',
    desc: '賞金首モード。攻撃力・クリティカル率・攻撃速度が大幅に上昇。',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.25 + 0.02 * lv), critAdd: R(0.1 + 0.005 * lv), attackSpeedPct: 0.2 }) }),

  // ================= ネオンダンサー系 =================
  A('luna_dancer', { id: 'lj_dance_spin_turn', name: 'スピン・ターン', kind: 'melee', m: 0.85, mp: 10, cd: 0.6,
    desc: 'つま先で回転しながら5連続の回し蹴り。', hits: 5, range: { w: 190, h: 110 }, knock: 140, effect: 'slash', color: '#19f0ff', maxTargets: 6 }),
  A('luna_dancer', { id: 'lj_dance_glide', name: 'ネオン・グライド', kind: 'dash', m: 1.4, mp: 14, cd: 2.4,
    desc: '光の残像を残して滑るように前進。通過した敵を2回切り裂く。移動中は無敵。', hits: 2, range: { w: 70, h: 90 }, effect: 'dash', color: '#19f0ff',
    dash: { dist: (lv) => 320 + lv * 10, time: 0.22, invuln: 0.45 } }),
  Mastery('luna_dancer', 'lj_dance_mastery', 'ステップ・マスタリー', '#19f0ff', '体に刻んだ無数のステップ。', (lv) => ({ speedAdd: 2 * lv })),
  A('luna_rave_star', { id: 'lj_dance_strobe', name: 'ストロボ・フラッシュ', kind: 'aoe', m: 1.8, mp: 30, cd: 4,
    desc: '爆音とストロボで周囲の敵を4回痺れさせる。', hits: 4, range: { w: 460, h: 240 }, knock: 220, effect: 'spark', color: '#3dffd0', maxTargets: 12 }),
  Bf('luna_rave_star', { id: 'lj_dance_groove', name: 'グルーヴ・ハイ', mp: 35, cd: 45, color: '#3dffd0',
    desc: '最高のグルーヴに乗る。移動速度・攻撃力・防御力が上昇。',
    buff: (lv) => ({ duration: 60 + lv * 6, atkPct: R(0.1 + 0.01 * lv), speedPct: R(0.12 + 0.01 * lv), defPct: R(0.1 + 0.01 * lv) }) }),
  Boost('luna_rave_star', 'lj_dance_booster', 'ビート・ブースター', '#7ff6ff', 'BPMを上げる。'),
  Mv('luna_rave_star', { id: 'lj_dance_blink', name: 'ネオン・ブリンク', mp: 8, cd: 0.6, color: '#3dffd0',
    desc: '方向キーの向き（上下も可）へ光の粒子になって瞬間移動（テレポート）。短い無敵つき。',
    move: { type: 'teleport', power: 0, distance: 180, perLv: 6, invuln: 0.25, vertical: true } }),
  A('luna_prism_idol', { id: 'lj_dance_prism_step', name: 'プリズム・ステップ', kind: 'dash', m: 2.8, mp: 40, cd: 2.4,
    desc: '七色の残像を連れて長距離ステップ。通過した敵を4回斬る。', hits: 4, range: { w: 90, h: 120 }, knock: 200, effect: 'dash', color: '#c77dff',
    dash: { dist: (lv) => 420 + lv * 12, time: 0.26, invuln: 0.55 } }),
  P('luna_prism_idol', { id: 'lj_dance_encore', name: 'アンコール', maxLevel: 20, color: '#c77dff',
    desc: '鳴りやまない歓声が力になる。移動速度・クリティカル率・被ダメージ軽減が上昇。',
    passive: (lv) => ({ speedAdd: 3 * lv, critAdd: R(0.005 * lv), dmgReduce: R(0.008 * lv), atkAdd: 3 * lv }) }),
  Enh('luna_prism_idol', { id: 'lj_dance_prism_blink', name: 'プリズム・ブリンク', color: '#c77dff', enhances: 'lj_dance_blink',
    desc: 'ネオン・ブリンク強化: 距離アップ・無敵+0.3秒・CT短縮。移動先で七色の小爆発（威力120%）。',
    enhance: (lv) => ({ distancePct: R(0.02 * lv), invulnAdd: 0.3, cooldownCut: R(0.02 * lv), arrivalBlast: { mult: 1.2, w: 200, h: 140, color: '#c77dff' } }) }),
  FA('luna_prism_idol', 'lj_dance_echo_step', 'エコー・ステップ', '#c77dff', '残像がワンテンポ遅れて同じ技を踊る。'),
  A('luna_cosmo_star', { id: 'lj_dance_galaxy_stage', name: 'ギャラクシー・ステージ', kind: 'aoe', m: 3.4, mp: 120, cd: 8,
    desc: '足元に銀河のステージを展開。画面中の敵を8回打ち据えるフィナーレ。', hits: 8, range: { w: 900, h: 380 }, knock: 260, launch: 260, effect: 'explosion', color: '#7df9ff', maxTargets: 20 }),
  A('luna_cosmo_star', { id: 'lj_dance_starlight_combo', name: 'スターライト・コンボ', kind: 'melee', m: 2.3, mp: 70, cd: 0.9, maxLevel: 20,
    desc: '流星のような10連撃。前方の敵をまとめて切り刻む。ファイナルアタックが強化される。', hits: 10, range: { w: 280, h: 150 }, knock: 180, effect: 'slash', color: '#7df9ff', maxTargets: 10 }),
  Hyper('luna_cosmo_star', { id: 'lj_dance_world_tour', name: 'ワールド・ツアー', color: '#7df9ff',
    desc: '銀河ツアー開幕。攻撃力・移動速度・防御力が大幅に上昇。',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.22 + 0.02 * lv), speedPct: 0.2, defPct: R(0.2 + 0.02 * lv), attackSpeedPct: 0.15 }) }),

  // ================= ストリートファイター系 =================
  A('jin_brawler', { id: 'jj_fight_jab_rush', name: 'ジャブ・ラッシュ', kind: 'melee', m: 1.0, mp: 10, cd: 0.6,
    desc: '目にも止まらぬ5連ジャブからのストレート。', hits: 5, range: { w: 150, h: 90 }, knock: 220, effect: 'hit', color: '#ff8a00', maxTargets: 4 }),
  A('jin_brawler', { id: 'jj_fight_haymaker', name: 'ヘイメイカー', kind: 'melee', m: 3.2, mp: 12, cd: 1.0,
    desc: '大きく振りかぶった一撃。前方の敵をまとめて壁まで吹き飛ばす。', hits: 1, range: { w: 170, h: 110 }, knock: 600, effect: 'critHit', color: '#ffb35c', maxTargets: 6 }),
  P('jin_brawler', { id: 'jj_fight_iron_body', name: 'アイアン・ボディ', color: '#ff8a00', tag: 'マスタリー',
    desc: '鍛え抜かれた鋼の肉体。最大HP・防御力・攻撃力が上昇。',
    passive: (lv) => ({ maxHpPct: R(0.02 * lv), defAdd: 2 * lv, atkAdd: 2 * lv }) }),
  A('jin_knuckle_champ', { id: 'jj_fight_knuckle_bomb', name: 'ナックル・ボム', kind: 'aoe', m: 3.4, mp: 32, cd: 4,
    desc: '地面に拳を叩き込み、爆風で周囲の敵を吹き飛ばす。', hits: 2, range: { w: 480, h: 200 }, knock: 420, launch: 350, effect: 'explosion', color: '#ff5a1f', maxTargets: 12 }),
  Bf('jin_knuckle_champ', { id: 'jj_fight_fighting_spirit', name: '闘魂', mp: 35, cd: 50, color: '#ff5a1f',
    desc: '燃え上がる闘志。攻撃力と防御力が大きく上昇する。',
    buff: (lv) => ({ duration: 60 + lv * 6, atkPct: R(0.18 + 0.015 * lv), defPct: R(0.2 + 0.02 * lv) }) }),
  Boost('jin_knuckle_champ', 'jj_fight_booster', 'ナックル・ブースター', '#ffb35c', '拳のギアを一段上げる。'),
  Mv('jin_knuckle_champ', { id: 'jj_fight_shoulder_rush', name: 'ショルダー・ラッシュ', mp: 8, cd: 1.5, color: '#ff5a1f',
    desc: '肩から一気に突進移動し、進路上の敵を押し出す（ラッシュ）。',
    move: { type: 'rush', power: 1100, distance: 260, perLv: 10, time: 0.24, push: { mult: 1.5, knock: 420 } } }),
  A('jin_dragon_fist', { id: 'jj_fight_dragon_upper', name: '昇龍アッパー', kind: 'melee', m: 4.4, mp: 50, cd: 1.1,
    desc: 'ネオンの龍が天へ昇る。敵を3回殴り、遥か上空へ打ち上げる。', hits: 3, range: { w: 170, h: 220 }, knock: 120, launch: 900, effect: 'critHit', color: '#ff3b3b', maxTargets: 8 }),
  A('jin_dragon_fist', { id: 'jj_fight_dragon_wave', name: '龍撃波', kind: 'projectile', m: 8.9, mp: 60, cd: 2.6,
    desc: '龍の咆哮を拳圧に乗せて放つ。巨大な衝撃波が全てを貫く。', range: { w: 900, h: 130 }, effect: 'smoke', color: '#ff3b3b',
    proj: { speed: 900, life: 1.0, count: 1, spread: 0, pierce: 99, kind: 'shockwave', w: 110, h: 130 } }),
  Enh('jin_dragon_fist', { id: 'jj_fight_unstoppable', name: 'アンストッパブル', color: '#ff3b3b', enhances: 'jj_fight_shoulder_rush',
    desc: 'ショルダー・ラッシュ強化: 突進距離アップ、突進中は無敵、使用後に防御力アップ。',
    enhance: (lv) => ({ distancePct: R(0.03 * lv), invulnAdd: 0.3, afterBuff: { duration: 4, defPct: R(0.1 + 0.02 * lv) }, pushMult: R(1 + 0.1 * lv) }) }),
  FA('jin_dragon_fist', 'jj_fight_combo_follow', 'コンボ・フォロー', '#ff3b3b', '拳が止まらない。'),
  A('jin_vice_legend', { id: 'jj_fight_haoh_quake', name: '覇王・天地崩し', kind: 'aoe', m: 6.3, mp: 130, cd: 8,
    desc: '大地を割る覇王の一撃。画面中の敵を5回打ち砕き、天高く吹き飛ばす。', hits: 5, range: { w: 960, h: 340 }, knock: 500, launch: 700, effect: 'explosion', color: '#ffd23f', maxTargets: 20 }),
  P('jin_vice_legend', { id: 'jj_fight_legend_aura', name: 'レジェンド・オーラ', maxLevel: 20, color: '#ffd23f',
    desc: '伝説の覇気。攻撃力・クリティカルダメージ・被ダメージ軽減が大きく上昇し、ファイナルアタックが強化される。',
    passive: (lv) => ({ atkAdd: 7 * lv, critDmgAdd: R(0.04 * lv), dmgReduce: R(0.008 * lv), maxHpPct: R(0.01 * lv) }),
    finalAttack: (lv) => ({ chance: R(0.4 + 0.01 * lv), mult: R(1.0 + 0.05 * lv) }) }),
  Hyper('jin_vice_legend', { id: 'jj_fight_haoh_spirit', name: '覇王の気', color: '#ffd23f',
    desc: '全身から覇気を放つ。攻撃力と防御力が極大まで上昇。',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.3 + 0.02 * lv), defPct: R(0.35 + 0.03 * lv) }) }),

  // ================= ナイトレーサー系 =================
  A('jin_racer', { id: 'jj_race_burnout', name: 'バーンアウト', kind: 'aoe', m: 1.2, mp: 14, cd: 3,
    desc: 'その場でタイヤを空転させ、灼熱のスモークで周囲の敵を3回焼く。', hits: 3, range: { w: 360, h: 160 }, knock: 240, effect: 'smoke', color: '#7b5cff', maxTargets: 10 }),
  A('jin_racer', { id: 'jj_race_drift_dash', name: 'ドリフト・ダッシュ', kind: 'dash', m: 2.1, mp: 15, cd: 2.6,
    desc: '低い姿勢でドリフトしながら突っ込む。進路上の敵を跳ね飛ばす。', hits: 1, range: { w: 80, h: 80 }, knock: 520, effect: 'dash', color: '#7b5cff',
    dash: { dist: (lv) => 360 + lv * 12, time: 0.26, invuln: 0.45 } }),
  Mastery('jin_racer', 'jj_race_mastery', 'ドライビング・マスタリー', '#7b5cff', 'アクセルワークを体で覚える。', (lv) => ({ speedAdd: 2 * lv })),
  A('jin_drifter', { id: 'jj_race_exhaust_flame', name: 'エキゾースト・フレイム', kind: 'projectile', m: 2.3, mp: 28, cd: 1.2,
    desc: 'マフラーから噴き出す炎の塊を3発撃ち出す。敵を貫通する。', range: { w: 650, h: 120 }, effect: 'explosion', color: '#5c7cff',
    proj: { speed: 850, life: 0.75, count: 3, spread: 160, pierce: 3, kind: 'orb', w: 34, h: 34 } }),
  Bf('jin_drifter', { id: 'jj_race_turbo', name: 'ターボチャージ', mp: 35, cd: 45, color: '#5c7cff',
    desc: 'ブースト全開。移動速度と攻撃力が大きく上昇する。',
    buff: (lv) => ({ duration: 60 + lv * 6, atkPct: R(0.14 + 0.012 * lv), speedPct: R(0.15 + 0.01 * lv) }) }),
  Boost('jin_drifter', 'jj_race_booster', 'ギア・ブースター', '#a08cff', 'シフトアップ！'),
  Mv('jin_drifter', { id: 'jj_race_wheel_dash', name: 'ホイール・ダッシュ', mp: 8, cd: 2.5, color: '#5c7cff',
    desc: '靴底のホイールで地上を高速走行する。接触した敵を跳ね飛ばし、終了時にそのままジャンプできる。',
    move: { type: 'wheelDash', power: 900, distance: 900, perLv: 40, time: 1.6, groundOnly: true, contact: { mult: 0.8, knock: 360 } } }),
  A('jin_nitro_ace', { id: 'jj_race_nitro_burst', name: 'ニトロ・バースト', kind: 'aoe', m: 4.6, mp: 60, cd: 5,
    desc: 'ニトロタンクを叩き割って大爆発。周囲一帯を3回焼き払う。', hits: 3, range: { w: 700, h: 280 }, knock: 480, launch: 420, effect: 'explosion', color: '#a24dff', maxTargets: 16 }),
  P('jin_nitro_ace', { id: 'jj_race_slipstream', name: 'スリップストリーム', maxLevel: 20, color: '#a24dff',
    desc: '風を読み、風に乗る。移動速度・攻撃力・被ダメージ軽減が上昇。',
    passive: (lv) => ({ speedAdd: 3 * lv, atkAdd: 4 * lv, dmgReduce: R(0.008 * lv) }) }),
  Enh('jin_nitro_ace', { id: 'jj_race_afterburner', name: 'アフターバーナー', color: '#a24dff', enhances: 'jj_race_wheel_dash',
    desc: 'ホイール・ダッシュ強化: 走行距離+30%・CT短縮、走行後に移動速度アップ。',
    enhance: (lv) => ({ distancePct: R(0.03 * lv), powerPct: R(0.02 * lv), cooldownCut: R(0.03 * lv), afterBuff: { duration: 4, speedPct: R(0.12 + 0.01 * lv) } }) }),
  FA('jin_nitro_ace', 'jj_race_tailgate', 'テールゲート', '#a24dff', '逃げる敵にぴったり張りつく。'),
  A('jin_warp_rider', { id: 'jj_race_warp_drive', name: 'ワープ・ドライブ', kind: 'dash', m: 4.8, mp: 80, cd: 2.6,
    desc: '時空を跳ぶ超長距離ダッシュ。通過した敵を4回跳ね飛ばす。', hits: 4, range: { w: 110, h: 130 }, knock: 600, effect: 'dash', color: '#19f0ff',
    dash: { dist: (lv) => 600 + lv * 15, time: 0.3, invuln: 0.6 } }),
  A('jin_warp_rider', { id: 'jj_race_meteor_crash', name: 'メテオ・クラッシュ', kind: 'aoe', m: 5.5, mp: 130, cd: 8,
    desc: '大気圏外から隕石のように蹴り込む一撃。画面中の敵を6回粉砕する。ファイナルアタックが強化される。', hits: 6, range: { w: 960, h: 360 }, knock: 520, launch: 600, effect: 'explosion', color: '#19f0ff', maxTargets: 20 }),
  Hyper('jin_warp_rider', { id: 'jj_race_hyperdrive', name: 'ハイパードライブ', color: '#19f0ff',
    desc: 'リミッター解除。攻撃力・移動速度・攻撃速度が大幅に上昇。',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.25 + 0.02 * lv), speedPct: 0.25, attackSpeedPct: 0.2 }) }),

  // ================= ネットランナー系（hacker） =================
  A('hk_netrunner', { id: 'hn_logic_bomb', name: 'ロジック・ボム', kind: 'aoe', m: 1.3, mp: 14, cd: 2,
    desc: '周囲のネットワークに論理爆弾を仕掛け、3回連続でショートさせる。', hits: 3, range: { w: 340, h: 180 }, knock: 160, effect: 'spark', color: '#3dff8a', maxTargets: 10 }),
  A('hk_netrunner', { id: 'hn_data_spike', name: 'データ・スパイク', kind: 'projectile', m: 2.0, mp: 10, cd: 0.6,
    desc: '圧縮したデータの槍を撃ち出す。3体まで貫通する。', range: { w: 700, h: 30 }, effect: 'spark', color: '#3dff8a',
    proj: { speed: 1100, life: 0.65, count: 1, spread: 0, pierce: 3, kind: 'beam', w: 50, h: 12 } }),
  Mastery('hk_netrunner', 'hn_code_mastery', 'コード・マスタリー', '#3dff8a', '最適化されたコードは速い。', (lv) => ({ critAdd: R(0.005 * lv) })),
  A('hk_code_breaker', { id: 'hn_ddos_storm', name: 'DDoSストーム', kind: 'aoe', m: 1.4, mp: 32, cd: 4,
    desc: '大量のパケットを叩きつけ、周囲の敵を6回フリーズさせる。', hits: 6, range: { w: 520, h: 260 }, knock: 80, effect: 'spark', color: '#5cffb0', maxTargets: 14 }),
  Bf('hk_code_breaker', { id: 'hn_overflow', name: 'オーバーフロー', mp: 35, cd: 50, color: '#5cffb0',
    desc: '演算リミッターを外す。攻撃力とクリティカル率が上昇。',
    buff: (lv) => ({ duration: 60 + lv * 6, atkPct: R(0.15 + 0.015 * lv), critAdd: R(0.04 + 0.004 * lv) }) }),
  Boost('hk_code_breaker', 'hn_booster', 'クロック・ブースター', '#7dffc0', 'CPUをオーバークロック。'),
  Mv('hk_code_breaker', { id: 'hn_packet_shift', name: 'パケット・シフト', mp: 8, cd: 0.7, color: '#5cffb0',
    desc: '自分をパケット化して回線ごと瞬間移動（テレポート）。方向キーで上下にも跳べる。',
    move: { type: 'teleport', power: 0, distance: 170, perLv: 6, invuln: 0.2, vertical: true } }),
  A('hk_ghost_protocol', { id: 'hn_blackout', name: 'ブラックアウト', kind: 'aoe', m: 2.4, mp: 55, cd: 6,
    desc: '一帯の電源を落とし、闇の中で5回グリッチを走らせる。', hits: 5, range: { w: 700, h: 320 }, knock: 200, effect: 'explosion', color: '#00ffa3', maxTargets: 16 }),
  A('hk_ghost_protocol', { id: 'hn_trojan_lance', name: 'トロイの槍', kind: 'projectile', m: 8.6, mp: 60, cd: 2.4,
    desc: '敵の防壁ごと貫く巨大なトロイの木馬コード。全てを貫通する。', range: { w: 1000, h: 60 }, effect: 'spark', color: '#00ffa3',
    proj: { speed: 1500, life: 0.7, count: 1, spread: 0, pierce: 99, kind: 'magic', w: 56, h: 56 } }),
  Enh('hk_ghost_protocol', { id: 'hn_ghost_shift', name: 'ゴースト・シフト', color: '#00ffa3', enhances: 'hn_packet_shift',
    desc: 'パケット・シフト強化: 距離アップ・CT短縮・無敵+0.3秒。移動先にグリッチを残す（威力120%）。',
    enhance: (lv) => ({ distancePct: R(0.03 * lv), cooldownCut: R(0.02 * lv), invulnAdd: 0.3, arrivalBlast: { mult: 1.2, w: 180, h: 140, color: '#00ffa3' } }) }),
  FA('hk_ghost_protocol', 'hn_echo_code', 'エコー・コード', '#00ffa3', '実行したコードが自動で再実行される。'),
  A('hk_cyber_oracle', { id: 'hn_singularity', name: 'シンギュラリティ', kind: 'aoe', m: 4.2, mp: 130, cd: 8,
    desc: '演算の特異点を生み出し、画面中の敵を7回データの海に沈める。', hits: 7, range: { w: 960, h: 380 }, knock: 120, launch: 300, effect: 'explosion', color: '#b6ff3d', maxTargets: 20 }),
  P('hk_cyber_oracle', { id: 'hn_omniscience', name: 'オムニサイエンス', maxLevel: 20, color: '#b6ff3d',
    desc: '全てを演算する。攻撃力・クリティカル率・クリティカルダメージが上昇し、ファイナルアタックが強化される。',
    passive: (lv) => ({ atkAdd: 6 * lv, critAdd: R(0.006 * lv), critDmgAdd: R(0.04 * lv) }),
    finalAttack: (lv) => ({ chance: R(0.4 + 0.01 * lv), mult: R(1.0 + 0.05 * lv) }) }),
  Hyper('hk_cyber_oracle', { id: 'hn_god_mode', name: 'ゴッド・モード', color: '#b6ff3d',
    desc: '管理者権限を奪取。攻撃力・クリティカル率・攻撃速度が大幅に上昇。',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.25 + 0.02 * lv), critAdd: 0.1, attackSpeedPct: 0.2 }) }),

  // ================= ドローンマスター系（hacker） =================
  A('hk_drone_pilot', { id: 'hd_drone_shot', name: 'ドローン・ショット', kind: 'projectile', m: 1.2, mp: 9, cd: 0.5,
    desc: '肩の上の相棒ドローンが光弾を3連射する。', range: { w: 650, h: 60 }, effect: 'muzzle', color: '#ffb000',
    proj: { speed: 1000, life: 0.65, count: 3, spread: 60, pierce: 1, kind: 'orb', w: 20, h: 20 } }),
  A('hk_drone_pilot', { id: 'hd_drone_bomb', name: 'ドローン・ボム', kind: 'aoe', m: 1.6, mp: 13, cd: 2,
    desc: '小型ドローンを周囲に投下して自爆させる。', hits: 2, range: { w: 360, h: 180 }, knock: 300, effect: 'explosion', color: '#ffb000', maxTargets: 10 }),
  Mastery('hk_drone_pilot', 'hd_drone_mastery', 'ドローン・マスタリー', '#ffb000', 'ドローンの制御精度アップ。', (lv) => ({ maxHpPct: R(0.01 * lv) })),
  A('hk_swarm_commander', { id: 'hd_missile_pod', name: 'ミサイル・ポッド', kind: 'projectile', m: 1.8, mp: 30, cd: 1.4,
    desc: 'ドローン編隊から6発のマイクロミサイルを一斉発射。', range: { w: 700, h: 260 }, effect: 'explosion', color: '#ffc94d',
    proj: { speed: 900, life: 0.8, count: 6, spread: 300, pierce: 2, kind: 'orb', w: 24, h: 24 } }),
  Bf('hk_swarm_commander', { id: 'hd_shield_drone', name: 'シールド・ドローン', mp: 35, cd: 50, color: '#ffc94d',
    desc: 'シールド発生ドローンを展開。防御力と攻撃力が上昇。',
    buff: (lv) => ({ duration: 60 + lv * 6, defPct: R(0.25 + 0.02 * lv), atkPct: R(0.1 + 0.01 * lv) }) }),
  Boost('hk_swarm_commander', 'hd_booster', 'スウォーム・ブースター', '#ffd77d', 'ドローンの射撃レートを上げる。'),
  Mv('hk_swarm_commander', { id: 'hd_drone_lift', name: 'ドローン・リフト', mp: 8, cd: 1.2, color: '#ffc94d',
    desc: '大型ドローンにつかまって前方へ滑空する（グライド）。空中でも使える。',
    move: { type: 'glide', power: 650, distance: 420, perLv: 15, time: 0.65, gravityScale: 0.15 } }),
  A('hk_mecha_architect', { id: 'hd_carpet_bomb', name: 'カーペット・ボム', kind: 'aoe', m: 2.4, mp: 55, cd: 6,
    desc: '爆撃ドローン編隊が一帯を絨毯爆撃。6回の爆発が敵を焼く。', hits: 6, range: { w: 720, h: 300 }, knock: 300, launch: 200, effect: 'explosion', color: '#ff8a3d', maxTargets: 16 }),
  A('hk_mecha_architect', { id: 'hd_rail_drone', name: 'レール・ドローン', kind: 'projectile', m: 8.4, mp: 60, cd: 2.4,
    desc: 'レールガン搭載ドローンが超高速弾を発射。全てを貫通する。', range: { w: 1100, h: 30 }, effect: 'muzzle', color: '#ff8a3d',
    proj: { speed: 2200, life: 0.55, count: 1, spread: 0, pierce: 99, kind: 'beam', w: 80, h: 14 } }),
  Enh('hk_mecha_architect', { id: 'hd_lift_tuning', name: 'リフト・チューニング', color: '#ff8a3d', enhances: 'hd_drone_lift',
    desc: 'ドローン・リフト強化: 滑空距離+30%・CT短縮、滑空後に移動速度アップ。',
    enhance: (lv) => ({ distancePct: R(0.03 * lv), powerPct: R(0.02 * lv), cooldownCut: R(0.03 * lv), afterBuff: { duration: 4, speedPct: R(0.12 + 0.01 * lv) } }) }),
  FA('hk_mecha_architect', 'hd_wingman', 'ウィングマン', '#ff8a3d', '僚機ドローンが同じ標的を狙い撃つ。'),
  A('hk_orbital_master', { id: 'hd_orbital_laser', name: 'オービタル・レーザー', kind: 'aoe', m: 6.0, mp: 130, cd: 8,
    desc: '衛星軌道から光の柱を落とす。画面中の敵を5回焼き払う。', hits: 5, range: { w: 960, h: 400 }, knock: 200, launch: 500, effect: 'explosion', color: '#ffe14d', maxTargets: 20 }),
  P('hk_orbital_master', { id: 'hd_hive_mind', name: 'ハイヴ・マインド', maxLevel: 20, color: '#ffe14d',
    desc: '全ドローンと意識を同期。攻撃力・最大HP・被ダメージ軽減が上昇し、ファイナルアタックが強化される。',
    passive: (lv) => ({ atkAdd: 6 * lv, maxHpPct: R(0.01 * lv), dmgReduce: R(0.008 * lv), critDmgAdd: R(0.03 * lv) }),
    finalAttack: (lv) => ({ chance: R(0.4 + 0.01 * lv), mult: R(1.0 + 0.05 * lv) }) }),
  Hyper('hk_orbital_master', { id: 'hd_full_deploy', name: 'フル・デプロイ', color: '#ffe14d',
    desc: '全ドローン出撃。攻撃力・防御力・攻撃速度が大幅に上昇。',
    buff: (lv) => ({ duration: 40 + lv * 2, atkPct: R(0.25 + 0.02 * lv), defPct: 0.3, attackSpeedPct: 0.2 }) }),
];
