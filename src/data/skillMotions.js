// スキルごとの攻撃モーション（render/character.js の SKILL_MOTIONS）と、そのモーションの長さ（秒）。
// 表に無いスキルは種類（kind）とキャラから決める（skillMotionOf）。移動スキル（kind: 'move'）は物理で動くので無し。
export const SKILL_MOTION_TABLE = {
  // ルナ（基本）
  luna_neon_rush: 'flurry', luna_pink_bullet: 'multiShot', luna_hiphop_step: 'slideStep', luna_party_bomb: 'throwBomb',
  luna_idol_aura: 'idolPose', luna_star_shower: 'fanSweep',
  // ジン（基本）
  jin_heavy_smash: 'heavySmash', jin_street_upper: 'uppercut', jin_nitro_dash: 'tackle', jin_ground_quake: 'groundPunch',
  jin_boss_dignity: 'flex', jin_v8_cannon: 'palmBlast',
  // ハッカー（基本）
  hk_data_bolt: 'castThrust', hk_glitch_wave: 'castRaise', hk_packet_dash: 'slideStep', hk_virus_bomb: 'throwBomb',
  hk_firewall: 'hackType', hk_cyber_storm: 'castSweep',
  street_dash: 'laceUp',
  // ルナ・ガンスリンガー系
  lj_gun_double_tap: 'multiShot', lj_gun_spread_shot: 'fanSweep', lj_gun_rail_snipe: 'snipe', lj_gun_hot_cartridge: 'reload',
  lj_gun_booster: 'reload', lj_gun_bullet_rain: 'skyShot', lj_gun_heart_magnum: 'snipe', lj_gun_supernova: 'fanSweep',
  lj_gun_bounty_hunter: 'reload',
  // ルナ・ネオンダンサー系
  lj_dance_spin_turn: 'spinKick', lj_dance_glide: 'slideStep', lj_dance_strobe: 'stagePose', lj_dance_groove: 'idolPose',
  lj_dance_booster: 'idolPose', lj_dance_prism_step: 'slideStep', lj_dance_galaxy_stage: 'stagePose', lj_dance_starlight_combo: 'spinKick',
  lj_dance_world_tour: 'idolPose',
  // ジン・ストリートファイター系
  jj_fight_jab_rush: 'jabRush', jj_fight_haymaker: 'haymaker', jj_fight_knuckle_bomb: 'groundPunch', jj_fight_fighting_spirit: 'flex',
  jj_fight_booster: 'flex', jj_fight_dragon_upper: 'uppercut', jj_fight_dragon_wave: 'palmBlast', jj_fight_haoh_quake: 'meteor',
  jj_fight_haoh_spirit: 'flex',
  // ジン・ナイトレーサー系
  jj_race_burnout: 'revEngine', jj_race_drift_dash: 'tackle', jj_race_exhaust_flame: 'revEngine', jj_race_turbo: 'revEngine',
  jj_race_booster: 'revEngine', jj_race_nitro_burst: 'groundPunch', jj_race_warp_drive: 'tackle', jj_race_meteor_crash: 'meteor',
  jj_race_hyperdrive: 'flex',
  // ハッカー・ネットランナー系
  hn_logic_bomb: 'throwBomb', hn_data_spike: 'castThrust', hn_ddos_storm: 'castRaise', hn_overflow: 'hackType', hn_booster: 'hackType',
  hn_blackout: 'castRaise', hn_trojan_lance: 'castThrust', hn_singularity: 'castRaise', hn_god_mode: 'hackType',
  hn_data_sprite: 'summonCall', hn_glitch_cat: 'summonCall', hn_phantom_daemon: 'summonCall', hn_oracle_eye: 'summonCall',
  // ハッカー・ドローンマスター系
  hd_drone_shot: 'command', hd_drone_bomb: 'command', hd_missile_pod: 'command', hd_shield_drone: 'hackType', hd_booster: 'hackType',
  hd_carpet_bomb: 'command', hd_rail_drone: 'command', hd_orbital_laser: 'castRaise', hd_full_deploy: 'command',
  hd_attack_drone: 'command', hd_sentry_turret: 'hackType', hd_bomber_drone: 'command',
  // 連撃（追加）
  lj_gun_gatling_waltz: 'multiShot', lj_dance_prism_rush: 'flurry', jj_fight_hundred_fist: 'jabRush',
  // 5次（画面全体攻撃 = finale、覚醒 = awaken）
  lj_gun_dimension_barrage: 'finale', lj_gun_quasar_rail: 'snipe', lj_gun_desperado_mode: 'reload', lj_gun_bullet_awaken: 'awaken',
  lj_dance_hyper_finale: 'finale', lj_dance_prism_cyclone: 'spinKick', lj_dance_stardust_runway: 'slideStep', lj_dance_icon_awaken: 'awaken',
  jj_fight_heaven_fall: 'finale', jj_fight_thousand_fist: 'jabRush', jj_fight_emperor_fist: 'flex', jj_fight_emperor_awaken: 'awaken',
  jj_race_dimension_overdrive: 'finale', jj_race_photon_burnout: 'revEngine', jj_race_lightspeed_run: 'tackle', jj_race_limit_break: 'awaken',
  hn_world_rewrite: 'finale', hn_kernel_panic: 'castThrust', hn_demiurge_avatar: 'summonCall', hn_root_awaken: 'awaken',
  hd_fleet_barrage: 'finale', hd_carrier_gatling: 'command', hd_mothership: 'summonCall', hd_admiral_order: 'awaken',
  // v5 ネオン・コアの追加スキル（共通の 3 つは種類とキャラから決める）
  nc_gun_photon_rain: 'fanSweep', nc_dance_laser_waltz: 'spinKick', nc_dance_afterimage: 'idolPose', nc_fight_neon_quake: 'groundPunch',
  nc_race_photon_drift: 'tackle', nc_race_overboost: 'revEngine', nc_net_null_pointer: 'castThrust', nc_drone_satellite: 'summonCall', nc_drone_hyper_link: 'command',
};

// モーションの長さ（秒）。連撃系は回数で伸ばす（最大 0.8 秒）
const DUR = {
  flurry: 0.5, spinKick: 0.6, heavySmash: 0.55, haymaker: 0.55, jabRush: 0.6, uppercut: 0.55, groundPunch: 0.6, tackle: 0.4,
  slideStep: 0.4, palmBlast: 0.5, revEngine: 0.6, meteor: 0.7, multiShot: 0.45, fanSweep: 0.5, snipe: 0.6, skyShot: 0.55,
  throwBomb: 0.5, stagePose: 0.65, castThrust: 0.5, castSweep: 0.5, castRaise: 0.6, command: 0.55, flex: 0.6, idolPose: 0.6,
  hackType: 0.6, reload: 0.55, laceUp: 0.55, summonCall: 0.6, finale: 0.9, awaken: 0.7,
};
// 当たる瞬間（モーションの進み 0〜1）。ダメージ・弾・爆発はこの瞬間に出す（ボタンを押した瞬間ではなく）
const IMPACT = {
  flurry: 0.1, spinKick: 0.3, heavySmash: 0.5, haymaker: 0.5, jabRush: 0.14, uppercut: 0.42, groundPunch: 0.5, tackle: 0, slideStep: 0,
  palmBlast: 0.48, revEngine: 0.25, meteor: 0.6, multiShot: 0.18, fanSweep: 0.2, snipe: 0.52, skyShot: 0.25, throwBomb: 0.5,
  stagePose: 0.6, castThrust: 0.45, castSweep: 0.45, castRaise: 0.55, command: 0.5, flex: 0.55, idolPose: 0.5, hackType: 0.8,
  reload: 0.6, laceUp: 0.65, summonCall: 0.62, finale: 0.62, awaken: 0.55,
};
// 当たった瞬間の手ごたえ（ヒットストップ・揺れの強さ 0〜1）。重い一撃ほど強く
const WEIGHT = { finale: 0.8, heavySmash: 0.6, groundPunch: 0.65, meteor: 0.8, uppercut: 0.5, haymaker: 0.55, snipe: 0.5, palmBlast: 0.45, castRaise: 0.45, stagePose: 0.35, throwBomb: 0.35 };
const HITS_SCALED = { flurry: 1, spinKick: 1, jabRush: 1, multiShot: 1 };

const BY_KIND = {
  luna: { melee: 'flurry', projectile: 'multiShot', aoe: 'stagePose', dash: 'slideStep', buff: 'idolPose', summon: 'summonCall' },
  jin: { melee: 'heavySmash', projectile: 'palmBlast', aoe: 'groundPunch', dash: 'tackle', buff: 'flex', summon: 'summonCall' },
  hacker: { melee: 'castThrust', projectile: 'castThrust', aoe: 'castRaise', dash: 'slideStep', buff: 'hackType', summon: 'summonCall' },
};

/** skillMotionOf(skill, heroId) → { id, hits, duration } または null（モーション無し） */
export function skillMotionOf(sk, heroId) {
  if (!sk || sk.kind === 'move' || sk.kind === 'passive') return null;
  const id = SKILL_MOTION_TABLE[sk.id] || (BY_KIND[heroId] || BY_KIND.luna)[sk.kind];
  if (!id) return null;
  const hits = id === 'multiShot' ? (sk.proj?.count || 1) : (sk.hits || 1);
  let duration = DUR[id] || 0.5;
  if (HITS_SCALED[id]) duration = Math.min(0.8, duration + Math.max(0, hits - 3) * 0.06);
  if (sk.kind === 'dash' && sk.dash) duration = Math.max(duration, (sk.dash.time || 0) + 0.12);
  const impact = Math.min(0.42, (IMPACT[id] ?? 0.3) * duration);
  // 連射は、反動のコマに合わせて1発ずつ（spawn 時刻 = モーションの 0.18 + i/n × 0.62）
  const shots = id === 'multiShot' && hits > 1 && hits <= 5 ? Array.from({ length: hits }, (_, i) => (0.18 + (i / hits) * 0.62) * duration) : null;
  return { id, hits, duration, impact, shots, weight: WEIGHT[id] ?? 0.25 };
}
