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
    theme: '灰の降る寒村・腐った森・墓地・沼・礼拝堂。灰色と枯れた茶、遠くに赤い月',
    zones: [
      { id: 'a1z1', name: '灰降る村はずれ', level: 1, monsters: ['rot_zombie', 'ash_wolf', 'grave_bat'], boss: 'boss_butcher' },
      { id: 'a1z2', name: '腐れ森の入口', level: 3, monsters: ['rot_zombie', 'ash_wolf', 'bog_slime'], boss: 'boss_butcher' },
      { id: 'a1z3', name: '静かな墓地', level: 5, monsters: ['rot_zombie', 'bone_archer', 'grave_bat'], boss: 'boss_butcher' },
      { id: 'a1z4', name: '沈む沼地', level: 7, monsters: ['bog_slime', 'ash_wolf', 'cultist'], boss: 'boss_butcher' },
      { id: 'a1z5', name: '灰の礼拝堂', level: 9, monsters: ['cultist', 'bone_archer', 'rot_zombie'], boss: 'boss_ashlord' },
    ],
    actBoss: 'boss_ashlord',
  },
  // 第二章〜第十章: ワールド担当が zones を埋める（id・名前・色・theme は決まり。アート担当が背景をこの theme で描く）
  { id: 'act2', name: '第二章　砂塵の墓所', desc: '灼けた砂の下に眠る古王の墓。乾いた呪いが旅人を干からびさせる。', color: '#d8a04a', bg: 'bg.act2', theme: '砂漠・砂丘・崩れた神殿と墓・オベリスク。橙と金の夕空、砂嵐', zones: [] },
  { id: 'act3', name: '第三章　凍てつく峰', desc: '吹雪の止まぬ山脈。氷に閉ざされた古の砦に、白い獣と亡霊がさまよう。', color: '#9ad8ff', bg: 'bg.act3', theme: '雪山・氷の洞窟・凍った滝・氷河の砦。青白い光、オーロラ', zones: [] },
  { id: 'act4', name: '第四章　沈んだ都', desc: '海に呑まれた王都。崩れた塔の間を、鱗のある者たちが泳ぎ回る。', color: '#4ac0b0', bg: 'bg.act4', theme: '水没した都・珊瑚・崩れた塔・海底の神殿。青緑の光の筋、泡', zones: [] },
  { id: 'act5', name: '第五章　紅蓮の溶鉱炉', desc: '地の底の炉が魔物を鍛え続ける。溶けた岩の川を越えて進め。', color: '#ff6a2a', bg: 'bg.act5', theme: '火山・溶岩の川・巨大な炉と鎖・黒い岩。赤と橙、火の粉', zones: [] },
  { id: 'act6', name: '第六章　毒霧の森沼', desc: '巨大な茸と毒の霧が満ちる森。吸い込めば肺が腐る。', color: '#9ad04a', bg: 'bg.act6', theme: '巨大な茸・毒の沼・蜘蛛の巣・朽ちた大樹。黄緑と紫の霧、胞子', zones: [] },
  { id: 'act7', name: '第七章　天穹の廃城', desc: '雲の上に浮かぶ白亜の城。狂った天の使いが侵入者を裁く。', color: '#f0e0a0', bg: 'bg.act7', theme: '雲の上の白い城・崩れた回廊・浮かぶ島・雷雲。白と金、嵐の光', zones: [] },
  { id: 'act8', name: '第八章　機巧の迷宮', desc: '歯車が軋む果てなき迷宮。主を失った機械兵がいまも巡回する。', color: '#c89a5a', bg: 'bg.act8', theme: '歯車・蒸気管・真鍮の通路・巨大な時計仕掛け。銅と金、蒸気', zones: [] },
  { id: 'act9', name: '第九章　虚無の境界', desc: '世界の縁がほどけていく場所。形を持たない者たちが手招きする。', color: '#a070ff', bg: 'bg.act9', theme: '浮かぶ岩の島・ねじれた空・星の裂け目・結晶。紫と黒、星屑', zones: [] },
  { id: 'act10', name: '第十章　深淵の玉座', desc: '深淵の底、すべての魔の源。玉座に座す王が、世界の終わりを待っている。', color: '#ff3a4a', bg: 'bg.act10', theme: '地獄の城・骨の柱・血の川・巨大な玉座。深紅と黒、炎の空', zones: [] },
];

export const ZONES = ACTS.flatMap((a, ai) => a.zones.map((z, zi) => ({ ...z, act: a.id, actIdx: ai, zoneIdx: zi, global: ai * 5 + zi })));
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));

/** その地域のステージのエリアレベル */
export const stageLevel = (zone, stage) => zone.level + (stage >= 6 ? 1 : 0);
