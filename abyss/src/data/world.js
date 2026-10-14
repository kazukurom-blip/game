// 世界（章・地域・ステージ）。物語は第 1〜10 章、各章 5 地域、各地域 10 ステージ（10 番目はボス）。
// エリアレベル: 地域ごとに level（その地域の敵のレベル。ステージで +0〜1）。
//
// 形:
// ACTS: [{ id, name, desc, color, bg: 'bg.<actId>', zones: [
//   { id, name, level, monsters: [id...], elites: [id...]（チャンピオンになりやすい敵）, boss: id, bg?: 'bg.<zoneId>' }
// ], actBoss: id }]
// ステージ番号 1〜10。stage 10 は地域のボス（制限時間あり）。5 地域目の stage 10 は章のボス。

export const STAGES_PER_ZONE = 10;
export const WAVES_PER_STAGE = 3;
export const BOSS_TIME = 30; // ボスの制限時間（秒）

export const ACTS = [
  {
    id: 'act1', name: '第一章　灰の村', desc: '空から降った灰が村を覆い、地の裂け目から屍が這い出した。すべての始まりの地。', color: '#9a8a7a', bg: 'bg.act1',
    zones: [
      { id: 'a1z1', name: '灰降る村はずれ', level: 1, monsters: ['rot_zombie', 'ash_wolf', 'grave_bat'], boss: 'boss_butcher' },
      { id: 'a1z2', name: '腐れ森の入口', level: 3, monsters: ['rot_zombie', 'ash_wolf', 'bog_slime'], boss: 'boss_butcher' },
      { id: 'a1z3', name: '静かな墓地', level: 5, monsters: ['rot_zombie', 'bone_archer', 'grave_bat'], boss: 'boss_butcher' },
      { id: 'a1z4', name: '沈む沼地', level: 7, monsters: ['bog_slime', 'ash_wolf', 'cultist'], boss: 'boss_butcher' },
      { id: 'a1z5', name: '灰の礼拝堂', level: 9, monsters: ['cultist', 'bone_archer', 'rot_zombie'], boss: 'boss_ashlord' },
    ],
    actBoss: 'boss_ashlord',
  },
];

export const ZONES = ACTS.flatMap((a, ai) => a.zones.map((z, zi) => ({ ...z, act: a.id, actIdx: ai, zoneIdx: zi, global: ai * 5 + zi })));
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));

/** その地域のステージのエリアレベル */
export const stageLevel = (zone, stage) => zone.level + (stage >= 6 ? 1 : 0);
